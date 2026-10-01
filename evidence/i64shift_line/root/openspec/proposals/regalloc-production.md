# 生产级寄存器分配闭环

状态：`applying`。2026-07-10 用户明确要求“完成 regalloc”，确认进入 apply。执行粒度沿用 `docs/beat-c.md §2` §7 与 `docs/beat-c.md §10`；禁止把未接生产的 `regalloc_single_pass` 合同或旧 env-gated overlay 写成完成。

## 目标

- 以唯一、穷尽的 BodyIR 访问事实为输入，实现 CFG 感知的确定性寄存器分配。
- 调用、固定寄存器、caller/callee-saved、地址逃逸、内存副作用、terminator 和所有 CFG edge 全部显式建模；未知形态编译期 hard-fail。
- 分配结果成为唯一 production emitter 决策源；spill/reload/bind/drop/store-def action 必须逐项消费并确认。
- `usedCalleeMask` 与 prologue 保存、每个 return 恢复共用同一份冻结计划。

## 拒绝路径

- 不修补 `regalloc_liveness -> regalloc_linscan -> regalloc_overlay` 旧链；其 use 事实不完整、分配含二次扫描，overlay 只改少数 BinOp read。
- 不用通用 `BodyOp.operands` 猜 slot，不忽略 call args/term/edge，不把未建模 op 当 spill-everywhere 静默通过。
- 不使用 x28 等未纳入统一保存/恢复合同的寄存器。
- 不让寄存器 last-use 决定资源 drop；内存生命周期只消费 canonical Ownership/Init/Drop IR。

## Apply 分片

| 分片 | files | action | verify | done |
|---|---|---|---|---|
| R1 访问事实 | `src/core/ir/body_ir_access.cheng`、专属 smoke | 穷尽当前生产 19 种 op（含 `BodyOpResultPanicGuardTag`）、call、term 的 ordered use/def/fixed/clobber/address-escape/memory-effect；严格校验引用与 arity | 全 kind 正例、坏引用/未知 kind/坏 call/pass-kind 负例 | 每个合法 IR 只有一个事实解释 |
| R2 CFG/活性 | `src/core/ir/body_ir_cfg.cheng`、专属 smoke | CSR succ/pred、reachable/RPO、live-in/live-out fixed point、edge reconciliation | diamond、loop、不可达、坏边、固定点确定性 | 多 block 活性唯一且收敛 |
| R3 分配状态机 | `src/core/backend/regalloc_single_pass.cheng` | 扩为消费 R1/R2；固定寄存器与 clobber 约束；每 edge 显式动作 | 现有 linear contract + CFG/call/pressure/escape 合同 | 无未确认 action，无未知 future-use |
| R4 AArch64 接线 | target constraint + primary adapter/emitter | 冻结完整 action plan，size/fill 共读；统一 callee mask；v3 snapshot 绑定真实 recipe 来源 | ABI、exec_diff、jobs 1/N、golden object、fixed-template negative | 默认 production 路径真实消费新计划且不存在预制机器码伪 receipt |
| R5 退役旧链 | ~~old modules/imports/gates~~（已收割：`regalloc_liveness.cheng`/`regalloc_linscan.cheng`/`regalloc_overlay.cheng`） | 删除旧 overlay 与重复 peephole 决策源 | 防回潮静态门、production regression | 生产只有一个 regalloc |

R5 完成证据（2026-07-20）：三旧文件（120+193+148=461 行）已删除；`src/`+`tools/` 全树 `rg "regalloc_(liveness|linscan|overlay)"` 零命中（仅剩 gate 防回潮模式自身，其正则形态不自命中）；7 处 ghost scaffold/backend2 头注释引用同步清扫；`tools/regalloc_production_gate.sh` 在既有 import 闭包扫描 + 驱动二进制符号扫描之外新增 `source_legacy_file_absence` 文件缺席断言（旧链三文件重新出现即 RED）；25/25 regalloc smoke 复跑 PASS（driver=`chain_seed_20260719/cheng`，详见 `/Users/lbcheng/cheng-f24/diag_r5_retire/REPORT.md`）。状态保持 `applying`：R4 余项（official driver 刷新/GEN2-GEN3 固定点、完整 production gate、非 AArch64 target 裁定、fixed-template 发射裁定）未收官。

## Edge machine-recipe 合同

- 同一 CFG edge 上允许多条 parallel-copy Action；每条机器 Action 的 fragment owner 为 `edge`，稳定 site key 固定为 `(edge_index, action_ordinal)`，不得占有 trampoline 元数据或 branch。
- 每条实际发射 edge copy 的 edge 必须有唯一独立 `edge_trampoline` fragment，稳定 site key 为 `edge_index`、`action_ordinal=-1`。全部 edge-action fragment 必须从冻结 `trampoline_offset` 起连续排列，trampoline fragment 紧随其后且独占最终 branch。
- critical edge 只按 `source 出度 > 1 && target 入度 > 1` 判定；所有 edge-action 与 trampoline 的 `requires_edge_split` 必须等于该结构事实。source term 必须跳到 trampoline 起点，trampoline 必须跳到目标 block start。
- snapshot、ledger 与门禁共同拒绝重复 `(edge_index, action_ordinal)`、Action 冒充 trampoline、缺失/重复 trampoline、fragment prefix 间隙及 branch 绕过 trampoline。

## ABI entry machine-recipe 合同

- 没有真实 memory home 的低位参数从 Darwin AArch64 x0..x7 直接进入，以机器绑定的 `register_assignment` Action 搬到 allocator register；禁止为其伪造 ingress 槽。
- 只有真实 memory home 参数、高位 stack 参数与真实 x8 sret channel 可以使用 stack ingress/reload 所有权。
- 无真实 home 的低位参数若被 allocator spill，spill slot 属于 body region 且只由冻结 stack Action 触发分配；它不是 ABI ingress/home。

## Frame machine-recipe 合同

- symbol offset 0 处必须有唯一 `frame_prologue` fragment，只拥有初始 SP 分配与 callee save，并在 ABI ingress/body 前精确结束。
- 每条 restore/teardown/ret 必须由绑定唯一 op 或 term site 的 `frame_epilogue` fragment 拥有；term-site epilogue 完成该 block 的 terminator coverage。
- 每条机器指令包括 strict frame 都恰好有一个 owner。frame owner 不得包含非 frame 指令，惟一例外是 epilogue 末尾 `ret`；callee restore 写集必须与冻结 mask 及 object 重算结果全等。
- branch 不得跳入 frame fragment；legacy early-return 只允许跳到同 op site 的 epilogue 精确末尾。

## Recipe provenance 合同

- `regalloc_frozen_plan_snapshot.v3` 的每个函数必须保存 payload-hash 绑定的 `recipe_origin`。
- 生产唯一合法值是 `body_ir_adapter`，表示机器 recipe 由该函数真实 BodyIR、冻结 plan 和 AArch64 adapter 共同构造。
- `RegallocProductionEmitAarch64FixedFunction` 必须标记 `fixed_template`。该路径用空 BodyIR 包装预制机器码并把整函数归给单个 term fragment，门禁无条件拒绝；缺字段和未知值同样拒绝。
- 不得用“空 BodyIR 形状”猜来源：合法空函数和 fixed template 可有同一 BodyIR hash，只有 producer 在 fill 前记录的显式 provenance 能无误伤地区分。

## Local-copy 与 write-through 合同

- 单操作数 `LoadLocal|StoreLocal|CopyLocal` 共用唯一 access decoder。普通 local copy 必须产生唯一 source Use、local read-write memory fact 和唯一 target Def；只有同一物理 GPR 且表示不变时才能生成结构 action kind128 `coalesced_copy`。
- kind128 只接受同型 `I32/I64/Ptr` 与 `I64↔Ptr`。`I32→I64` 是有符号扩宽，必须发射 `SXTW`；`I64→I32` 必须发射 W 宽 ORR。F64、Str、Aggregate 和 `I32↔Ptr` 不得结构合并。
- AddressHome source 可以在 op-before 由 `ReloadOperand` 装入 target GPR 后生成 kind128；`relatedActionOrdinal` 必须指向严格更早、同 op/site/fact/value/target-reg 的唯一 reload。直接 GPR source 的 related 固定为 -1，任何伪造 provenance 均由 native validator 与 external gate hard-fail。
- `Ptr(aux=I32|I64|Str)` target 是 write-through：事实固定为 source Use + pointer Use + `MemoryIndirectWrite`，无 Def、无 kind128；AArch64 op-site recipe 必须发射真实 STR，I32 写入 I64 先 SXTW。生产门禁以 dedicated coalesced smoke 和扩展后的 AddressHome smoke 同时验证 plan、recipe、fragment 与 receipt。

## 有界语义穷举与真实流水线证明

- 不把递归语法的无限字符串笛卡尔积伪装成“全量”。正式域由两层组成：机械抽取 `docs/cheng-formal-spec.md` §1.2 EBNF 中每条 production/choice/optional/repetition 的义务，以及可落到 IR 的有界语义域；每条义务必须有稳定 ID，并绑定合法源码见证或规范化排除证明。递归深度、实参数量、容器长度、CFG block 数和寄存器压力只取零值、单位值、ABI 边界、寄存器边界与越界一档等声明过的边界点；每个被排除组合必须有稳定约束编号和可重算证明。
- 语义域至少包含：值类型/形状、Owned/Borrowed/Unmanaged、literal/ident/field/index/call 来源、binding/assign/call-arg/return/condition/element/field-init 使用位置、local/global/inline-field/ref-boundary/index 目标 place、精确声明身份与重载/模块、internal/importc/export ABI、register/managed-slot/aggregate/sret transport、straight/branch/loop/defer 生命周期、no/self/may-alias，以及低压/跨调用 live/parallel-copy/恰好满寄存器/多一个 spill/address-escape 压力。
- 对 ownership、递归 managed descriptor、field/ref boundary、exact call、ABI transport、CFG lifetime 与 regalloc pressure 的关键族，在约束后的合法域内穷尽投影；其余轴至少做可重算的 pairwise，ABI/寄存器边界做声明过的更高阶覆盖。set-cover 只负责选见证，不负责证明完整，也不得声称最小集。
- 生成器与证明器必须使用两套互不调用的约束分类和投影编码，并在完整有界赋值域逐项对拍。独立 oracle 只消费形式语义和真实回执，不复用 primary/backend2 的 lowering 代码；primary/backend2 字节一致是必要条件，不是充分条件。
- 每个合法 case 必须有确定、无裸指针的 Cheng 源码物化结果；每个拒绝约束必须有唯一单违例见证。对象、嵌套 managed object、managed sequence/fixed array、`Result[str]` 只能使用正式构造语义，禁止伪造 literal、node/declaration index、owner type index、field offset 或布局。
- 编译器提供单次执行的结构化回执命令，同一 execution identity 绑定原始 case 源字节、物化器字节、driver、TypedExpr/CSG/lowering/primary/backend2/regalloc 源码、工具链和运行配置。回执逐 stage 保存真实 int32 node/declaration/value-def 身份、exprClass、owner type/layout/offset、BodyIR use/def/alias、两后端 emission 与 regalloc plan/action/fragment/ingress roots；缺 stage、身份漂移或仅有文本诊断一律失败。
- mutation 必须覆盖：ownership 翻转、声明重绑、layout/offset 变更、codec/CID 漏字段、cache stale-hit、stage 丢失、alias 写/地址逃逸、regalloc action/fragment/ingress 篡改、两后端同错、driver/toolchain/源文件替换。失败 case 由确定性 reducer 保持语义合法性后最小化并保留全部 identity。
- cheng-fusion 负责模型、分片、oracle、mutation、reducer、发布 claim 与证据校验；编译器负责生成不可伪造的 observed receipt。规划/验证冷启动必须可进入常规门禁预算，矩阵按内容哈希稳定分片；性能优化只能减少重复枚举/分配，不能少验证 obligation。

## 收官条件

- current-source candidate 编译并运行 scalar fixture、完整 regalloc contract 与嵌套循环双数组复现均正确。
- 全 target/emit 组合要么实现并通过，要么明确 hard-fail；禁止隐藏 spill-only/旧 overlay 路径。
- jobs 1/N object 确定、exec_diff 无状态退化、selfhost 三代固定点通过。
- 语法义务与有界语义矩阵全部经真实源码物化、七阶段结构化回执、独立 oracle 和 mutation 通过；contract-only ledger 或双后端自洽不能计为完成。
- 性能只按 current-source production driver 实测；正确性门未闭合前不以字节或 wall 收益替代完成。
