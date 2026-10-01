# 确定性内存生命周期闭环

状态：`applying / scope reconfirmed 2026-09-03`。用户已明确要求把本提案纳入“纯 Cheng 最小内核与
资源双极限”完整实施。M1 独立首片不等于生产闭环；canonical Ownership/Drop IR、全出口释放、
snapshot/Merkle 驻留根治与 current-source 资源证据仍是硬前置。本提案不允许抬高 RSS 上限、尾部
`ProcessMemoryPressureRelief`、静默漏释或以 whole-closure cache 冒充条目缓存。

## Apply 记录

- 确认：2026-07-10，用户指令“三线并行推进”。
- 当前分片：新增独立 `lifetime_ledger_v1` 与正负 smoke，只观测逻辑 owner/borrow/move/release；不接入 `compiler_csg`、TypedIR lowering、primary、emitter 或物理释放点。
- M1 合同：category、owner、object、borrow token 均按事件顺序分配稠密 ID；每个对象注册时必须携带正 `byteCount`；owner close 与 ledger close 是不可逆终态。owner close 后禁止 Own/Borrow/Move/Release/Read，ledger close 后只允许读取 metrics；未知 ID、非法状态转移、零字节对象、活跃借用期间 move/release、重复 release、release 后读取、结束仍 owned、重复 close 全部 hard-fail。
- 指标语义：`allocated/live/peak_live/released/owner_transfer_count` 是对象状态累计；`allocated_bytes/live_bytes/peak_live_bytes/released_bytes` 同时闭合结构字节；`retained` 是成功 borrow 的累计次数，不代表第二 owner；`borrow_return_count` 单独证明借用归还闭合。
- 最终首片验证：最终源码由 `artifacts/bootstrap/cheng.stage3 system-link-exec` 冷编译，`rc=0`；report 为 `real_backend_codegen=1`、`system_link_exec_scope=cold_runtime_provider_system_link`。正例 `rc=0`，marker 为 `lifetime_ledger_v1 ok allocated=2 live=0 peak_live=2 allocated_bytes=136 live_bytes=0 peak_live_bytes=136 retained=1 released=2 released_bytes=136 owner_transfer_count=1`。加入 `invalid-object-bytes` 后共 12 个负例全部非零退出且命中 `lifetime_ledger_v1:`；最终产物在 `/tmp/cheng-lifetime-ledger.YO41Mq/`。

### 2026-09-03 真值更正与资源合同

- W1 历史证据出现两次 SIGSEGV，未复现和根治释放路径前不得计完成。
- 现有 cache key 绑定完整 import 闭包，任一源字节变化会整体失效；只命名为“零变更任务缓存”，
  禁止称作 entry cache。
- W4≈98MB、W5≈170MB 为过期估算，不再驱动施工。当前最大实测持有者是
  snapshot/Merkle bootstrap，先按 owner/phase/live/alloc/free 重新测量再切释放点。
- 物化并行尚未实现；`BACKEND_JOBS` 只覆盖既有后段。worker 必须私有 parser/IR 暂存，主线程按
  canonical row 顺序发布，jobs=1 是字节 oracle。
- mapped reader 尚未成为 compiler snapshot 的唯一只读本体；接线后必须 CID 校验、import 图按需物化，
  阶段 arena 在精确最后消费者后整体 munmap。
- 时间/RSS终值固定为：全冷串行完整构建中位数 ≤40s；零变更 ≤3s；真实 1 文件、3 文件编辑中位数
  均 ≤10s；ordinary 进程树峰值 ≤200MiB；完整自举 Linux cgroup v2 峰值 ≤768MiB。
- 正式计时覆盖所有 phase 与 terminal release；计时溢出、漏相或 RSS 只提示都使回执失败。
- Linux cgroup 证明必须属于本次 release build：command manifest 中唯一规范 argv 精确绑定 compiler、
  source/composition entry、target、jobs、cache-off、pure-exec、报告和产物路径，正式 receipt 的同序号
  executable SHA/argv SHA 必须一致；无关工作负载即使通过 768MiB 门也不得拼接发布。

## M1 生产观测接线审计

只读源码审计确认：独立账本已可用，但完整生产接线当前不能绕开 dirty 核心，也没有一个合法的外层快照方案可替代真实 owner 事件。

- `BuildCompilerCsgBorrowedWithOverridesInto` 只在 `compiler_csg.cheng:8952-9007` 把局部 `exprLayer/typedIr/nodes/edges/csgV2` 移入 `out`；此前共有 40 个 `return false`。失败对象仍在函数局部，调用方拿到默认 `out`，因此外层无法事后恢复 object id、owner 或 release 事实。完整 CompilerCSG 成功/失败观测必须在该 dirty 文件的真实分配与统一 cleanup 出口接线。
- CSG 到 Lowering 的真实交接位于 `lowering_plan.cheng:5397-5448`：`exprLayer`、expr-slice、resolved-call 采用“赋值后源置空”，TypedIR 使用 `TypedExprIrMoveInto`。`5401/5417/5419/5426/5446` 五个失败出口都可能发生在部分 move 后。成功路径 `5501` 已释放 CompilerCSG，上层 `system_link_exec.cheng:1524` 与 `backend_driver_dispatch_min.cheng:4257`【更正 2026-09-10 审计：点名符号 `CompilerCSG`（HEAD 拼写已为 `CompilerCsg`）与所述函数 `BackendDriverDispatchMinProviderExportRoots`（写作提交 :4249）在 HEAD 均 0 命中，该锚点不可用、正确落点未定位；原文保留为历史证据】 又重复调用同一 release；严格 ledger 会把它判成重复释放，必须先统一成唯一 cleanup owner。
- Lowering 到 Primary 的现有合同是 `LoweringPlanReleasePrePrimaryObjectPayload` 后由 Primary 以 `var LoweringPlanStub` 借用 TypedIR/PrimaryObjectIr/必要索引，再由 `LoweringPlanReleaseAfterPrimaryObjectPlan` 归还并释放。本轮 Review 已把 system-link exact-function capture 校验移到该 cleanup 之后，这一个新失败出口不再绕过 after-primary release；其余分散失败与 panic 仍没有统一 cleanup。
- Primary 的 `PrimaryObjectPlanStreamEmitAndReleaseCurrent` 只在 emit、reloc/backpatch 与 word-count 校验全部成功后清空单函数 BodyIR；函数内六个 `return false` 与阶段级 panic 都没有外层 unwind cleanup。故 BodyIR/reloc/output buffer 的完整失败观测必须在 dirty primary 内接线，不能依赖易漂移行号或外层默认结构补记。
- 当前工作树中 `compiler_csg.cheng`、`typed_expr.cheng`、`primary_object_plan.cheng`、`system_link_exec.cheng` 均有并发改动。把账本塞入 `LoweringPlanStub` 会被大量按值 helper 深拷贝；用模块全局 singleton 又会破坏重入、并发与 import-alias 唯一性；按字段是否为空推断 move 则属于被明确禁止的启发式。三条绕行均否决。

因此，clean `lowering_plan.cheng + backend_driver_dispatch_min.cheng` 最多能制作范围为 `csg_ready -> backend_driver primary return` 的边界 witness；它看不到 CompilerCSG 的 40 个局部失败、Primary 的 panic/BodyIR 失败，也不覆盖两个生产编排入口的全部失败出口。该 witness 只能验证未来接线 API 和报告格式，禁止标记为 `production`、禁止据此关闭 M1。

完整生产接线必须等上述 dirty 核心收敛后原子落地：`lifetime_ledger.cheng` 记录状态；`compiler_csg.cheng` 建对象并把 40 个失败归一到 cleanup；`lowering_plan.cheng` 记录四类显式 move 与五个部分失败；`primary_object_plan.cheng` 记录 borrow、per-function BodyIR/output buffer 和全部 panic 前 cleanup；`system_link_exec.cheng`、`backend_driver_dispatch_min.cheng` 删除重复 release 并在每个返回出口关闭账本；新 pipeline smoke 与 `memory_report_contract_smoke` 锁定 driver/input hash、target、emit、jobs、逐类 metrics 和 object 字节不变。

### 2026-09-04 目标 2 新实证：替换-旧值释放 codegen 缺失（浏览器 host 长跑）

浏览器宿主（libp2p_browser_desktop，快照编译 700ms 节流循环）实测淘宝级页面
phys_footprint 每 ~20s 触 4GB 守卫。malloc_history 定位 refresh/on_page_snapshot
路径 1.37GB 活分配（59 万次调用）后，三组对照实验精确分型：

- 普通 `main`（无 exportc）：`acc = ConcatStr(acc, "100B")` ×20000 循环，2s 内
  phys_footprint 7GB+——**普通程序同样零释放，非 ABI 边界特有**。
- `@exportc` 宿主循环调用：每轮 +19GB 线性，quarantine 开关（0/默认/16MB）无关。
- 对照组：100 万次独立 `ConcatStr`（无替换）峰值仅 231MB——scope 退出释放正常。

分型结论：**托管 str 的"赋值替换"路径没有旧值 release codegen**（scope 退出
正常、ConcatStr 本身不泄漏、quarantine 无关）——落在目标 2"retain/release 与
move 合同在生产 codegen 中真实生效"域内，属 dirty 核心收敛后的原子落地清单。
复现：`src/probes/main_leak_probe.cheng`、`src/probes/abi_leak_probe.cheng`、
`src/probes/concat_leak_probe.cheng`（对照）。浏览器侧临时缓解：CLB 自适应
降频 + 软水位 recycle + rss-guard execv 自愈（均为减速带，非根治）。

## 目标

同时闭合两条不同的内存合同：

1. 编译器自身：`CompilerCSG -> Lowering -> Primary -> object` 的每类大对象只有一个 owner，生命周期有界，完整 ZC 的 process-tree 峰值最终不超过 768MiB。
2. Cheng 程序：正式规范 §0.1 的 retain/release、`defer -> releaseAllExcept(return)` 与 move 等价合同在生产 codegen 中真实生效，不再依赖调用方手写 `Free`/`memRelease`。

两条线共享验证工具，不共享“完成”结论。编译器 RSS 达标不代表语言 ORC 已闭合；标准库 `BytesBuilder` 解决 O(n²) churn 也不代表 scope-exit 已实现。

## 当前事实

### 编译器生命周期

- `compiler_csg` 已按 source/function slice 把局部 facts 直接归约进 compact V2，并释放局部表；先建全局 legacy facts、再复制 V2 的双份常驻路径已退出生产主线。
- `LoweringReleaseCompilerCsgAfterBind` 在 TypedIR move、symbol row 与 resolved-call snapshot 绑定完成后释放 `CompilerCsg`。
- 所有无显式 export roots 的 `EmitObj` 当前都选择 `primaryObjectIrBuildMode=object_all_lazy`：lowering 只建函数骨架，primary 按可达函数重建单函数 statements/BodyIR。声明序单函数真实 emit/release 目前只在 Darwin arm64 `EmitObj` 生效，`FAIL_TRACE`/zero-scan 会禁用该流式路径。
- `PrimaryObjectPlanReleaseLazyFunctionStatements` 只在最后一个消费者成功 lower、`wordCount>0` 且非 discovery 时清该函数 statements；失败/诊断路径无预算地保留。emit/fill 成功且不存在 zero-word 诊断需要时才清 BodyIR。
- `CompilerCsgReleaseBackendInputPayload` 已在 lowering 内消费，同一 payload 又在两个上层入口重复调用；另有“部分 move 后 return false”的分散早退。严格 ledger 首先会暴露这些 owner/release 合同未唯一化的问题。
- 当前大量 `Release` helper 实际只是把 Cheng 容器字段赋空或重置结构；这不等于底层 arena/seq/owned payload 已物理释放。ledger 的 `released` 必须与真实 `ArenaRelease/freeSeq/drop glue` 及 alloc/free/live 计数闭合。
- 已有 `phase_memory_ledger_v1` 只记录 phase RSS 前后差与少量 top contributor；它不能证明某一对象只有一个 owner，也不能证明失败路径已释放。
- 最新绑定观测仍是历史 artifact：primary 前 `1,064,091,648B`，primary 相增加 `776,601,600B`，峰值 `1,840,693,248B`。当前源码的小门只证明局部 fixture 在 768MiB guard 下通过，尚无 current-source full ZC 的 768MiB 证明。

### 语言级 ORC

- 正式规范要求受管类型在 assign/overwrite/return/expr-stmt 与 scope exit 上自动 retain/release。
- 运行时 `memRetain/memRelease`、原子 RC 与容器内部 retain/release 已存在；生产后端也有相邻 fresh retain/release 对消除。
- 但 `src/core/analysis/ownership.cheng`、`borrow_checker.cheng`、`borrow_ir.cheng` 仍未接进生产 lowering/codegen，且现有内容不是 CFG ownership fixed point；`LocalSlot` 的 OwnMove/OwnBorrow 事实也没有生产赋值。它们只能作参考，不能直接接线后宣称安全。
- 独立夹具已观测：函数内分配后不手写释放，5000 次调用产生 `alloc_delta=5000/live_delta=5000`。因此当前行为不能称为规范所述的自动 ORC 闭环。
- `BytesBuilder` 已落地并把真实 HTTP 累积读取从 `BytesConcat` O(n²) 改为摊还 O(n)；这是 churn 修复，不是所有权修复。

## 决议

### A. 编译器对象生命周期账本

新增结构级 `lifetime_ledger_v1`，每个被跟踪对象只允许以下状态机：

```text
uninitialized -> owned(owner_id, borrow_count=0) -> released
owned --borrow--> owned(owner_id, borrow_count+1)
owned --return_borrow--> owned(owner_id, borrow_count-1)
owned --move--> owned(new_owner_id, borrow_count=0)
```

禁止 `owned -> owned` 普通赋值复制；所有权交接必须走显式 move helper，move/release 时 `borrow_count` 必须为 0。重复 release、释放后读取、函数结束仍 owned 均 hard-fail。

首批跟踪对象：

- CompilerCSG nodes/edges/source profiles/V2 facts；
- NormalizedExprLayer 与 per-source reusable context；
- TypedIR arena、functions2/statements2/nodes2；
- resolved-call snapshot 与 dense indexes；
- PrimaryObjectIr function statements；
- per-function BodyIR/reloc/data label；
- instruction/data output buffers 与 report payload。

报告必须输出每类 `allocated/live/peak_live/retained/released/owner_transfer_count`，并绑定 driver hash、输入 hash、target、emit kind 与 jobs。结构化 live bytes 与 process-tree RSS 同时保留；两者不可互相替代。

### B. 全目标有界流水

以当前 Darwin arm64 `EmitObj` 流水为语义基准，不复制旧的全量常驻实现：

1. reachability 使用单调 frontier；每个函数只 lower、取边、释放一次。
2. emit 按确定顺序消费单函数 BodyIR，真实 emitter 决定布局，完成 reloc/data 校验后立即 release。
3. 诊断保留只允许由显式 `DiagnosticLease` 延长，必须记录 reason 与字节预算；`FAIL_TRACE`/zero-scan 不得无界保留所有函数。
4. 将同一生命周期扩到 Darwin `EmitExe`、ELF、COFF 与 backend2；未实现目标 hard-fail，禁止回到全量常驻路径。
5. allocator 只在 owner 边界 reset arena；禁止用 RSS 高水位下降作为释放成功判据。

### C. Scope-exit ORC 正确性先行

不直接在 `primary_object_plan` 尾部扫描“像指针的类型”并猜 release。正确路径固定为：

1. 先定义唯一 canonical Ownership/Init/Drop IR：每个 place 都有 `Owned/Borrowed/Unmanaged`、未初始化/部分初始化、move-out、escape 与 `dropGlueId`；在 CFG 上做 fixed point/join。现有 ghost ownership/borrow/escape 模块只作反例与素材。
2. drop glue 必须类型驱动：`str` 先检查 flags，只对 Owned 的 data release；`T[]` 递归 drop 元素；`Bytes`、object/tuple/ADT/Result/Option、闭包捕获、ref/Arc 分别有唯一 glue。Unknown 类型 hard-fail。
3. 显式 `BytesFree/freeSeq/memRelease/ArenaRelease` 必须 lower 为 consume/drop：把 place 置未初始化，CFG join 防二次 drop；覆盖 self-assignment、alias overwrite、部分初始化、手动 free 后 return。
4. CFG 上为 nested scope、正常 fallthrough、return、break、continue 与循环回边建 cleanup edge；顺序固定为先按 LIFO 执行 `defer`，再 `releaseAllExcept(return)`。`defer` 捕获、在 defer 中 move/panic 必须有明确定义。
5. panic 必须先裁定为 abort/no-unwind 或可 unwind；iterator/yield、async/await cancellation 未实现 cleanup 时生产编译 hard-fail，不能静默漏释。
6. overwrite 固定 `retain(new borrowed) -> store -> release(old)`；Owned move 不 retain，moved-from 不 cleanup。FieldStore/IndexedStore、容器 API 与 call-site 采用唯一责任表，禁止双 retain/release。
7. `?` 的 Err 路径、expr-stmt Owned 临时、global assign、borrowed return retain、sret aggregate 与 thread/Arc 边界都进入同一 IR 和门禁。
8. 未能证明类型 ownership、alias/escape 或 cleanup 覆盖时编译 hard-fail；不允许“先不释放”、名称白名单或运行时猜测。

### D. move/last-use 只做等价优化

scope-exit 基线闭合后，才接 CFG liveness + escape 的 last-use move。开关两态必须满足：

- stdout/stderr 与退出码一致；
- alloc/free/live 一致；
- 新路径 retain/release 不多于基线；
- 析构顺序合同一致；
- object 差异只来自允许的 retain/release 省略，并在 selfhost 三代收敛。

## 明确拒绝的路径

- 不复用当前 ghost `regalloc_liveness` 直接决定释放点。它面向寄存器区间，尚未覆盖 CFG term、defer、phi/loop-carried ownership，而且把通用 `BodyOp.operands` 当 slot 扫描不足以证明语义所有权。寄存器最后使用不等于资源所有权终止。
- 不把 release 决策塞进 `layoutReleaseAfterOp` 一类 emitter bitmap。release 是有调用、副作用、call-clobber 与异常顺序的 BodyIR/CFG 语义，必须先成为显式 cleanup edge，再由正常 emitter 统一处理。
- 不上线“只释放单 block 的 `str`，其它受管值继续泄漏”的生产模式。它可作为隔离实验验证分析，但默认严格 ORC 必须对所有受管类型闭合；未覆盖类型/控制流应 hard-fail，而不是静默跳过。
- 不以 poison-on-double-release 代替静态正确性。运行时 poison 只负责尽早暴露违反合同，不能证明提前释放不会造成静默 use-after-free。
- 不用仅有 RSS 斜率、缺 driver/input hash 且没有 alloc/free/live 的 LSP 探针证明“唯一泄漏根因”；这类数据只算症状线索。

## 分片计划

| 分片 | files | action | verify | done |
|---|---|---|---|---|
| M1 账本 | `src/core/tooling/lifetime_ledger.cheng`、`src/tests/lifetime_ledger_smoke.cheng` | 独立可复用状态机、正 byteCount 与不可逆 owner/ledger close；不接核心流水、不改释放点 | 最终 stage3 正例 `rc=0`；12 个负例全部非零退出且命中 ledger 诊断 | 独立首片对象与字节均 `live=0`、全部 owner 已 close、借用归还与 owner transfer 指标闭合 |
| M1 生产观测 | CompilerCSG、lowering、primary、两个生产编排入口、pipeline/report smoke | 在真实产生点记录 alloc/move/borrow/release，所有返回/panic 归一到唯一 cleanup | 每类收支、失败矩阵、driver/input hash、target/emit/jobs、golden object 字节不变 | **blocked**：dirty 核心与分散 cleanup 尚未收敛；clean 边界 witness 不算 production |
| M2 诊断租约 | primary/report | zero-scan/FAIL_TRACE 只保留命中函数，设确定字节预算；覆盖 cancel/report-write 失败 | 正负例、报告 hash、golden object | 诊断路径峰值不再随总函数数线性增长 |
| M3 全目标流水 | Mach-O/iOS、Linux arm64/x64、Android、OHOS、RISC-V、Windows COFF、Wasm；Obj/Exe/Shared；primary/backend2 | 复用单函数 lower/emit/release 状态机 | 全 target/emit 矩阵、jobs 1/N 确定性、exec_diff、FAIL_TRACE/zero-scan | 不存在 full-resident fallback，未覆盖组合 hard-fail |
| M4 ORC 基线 | canonical Ownership/Init/Drop IR、lowering、BodyIR | CFG fixed point、类型 drop glue、显式 consume 与 cleanup edges | `?`/临时/global/container/manual consume/defer/loop/early-return/sret/borrowed-return/thread；yield/async 实现或 hard-fail | `alloc==free`、`live=0`，retain/release 与析构顺序符合规范 |
| M5 move 优化 | CFG liveness、escape、equivalence gate | last-use move 与 retain/release 消除 | legacy/cfg 双态、ORC 计数、selfhost fixed point | 优化命中与否不可观测 |
| M6 生产门 | `perf_memory_contract_smoke`、full ZC harness | 8GiB 诊断 -> 4GiB 中间 -> 768MiB 生产逐档收紧 | process-group RSS、current driver/input hash、无外部重活 | `zc_status=completed` 且 `zc_max_rss_bytes<=805306368` |

## 并行与资源纪律

- M1/M2/M4 的只读审计与小 fixture 可并行；M4 在 canonical IR 方案确认前不得写生产 emitter。任何 candidate rebuild、full ZC、Pass B、全量 exec_diff 串行。
- 运行重门前先确认没有外部多 GiB 编译进程；本机 7GB/4 核不得把并发挤压误判为编译器回归。
- `primary_object_plan.cheng`、`typed_expr.cheng`、`compiler_csg.cheng` 有未提交 WIP 时只产独立 patch/提案，不覆盖共享文件。

## 收官条件

- 编译器线：current-source official driver 的 full ZC 为 0，process-tree RSS <= 768MiB，每类 lifetime ledger 收支闭合，所有目标无隐藏全量常驻路径。
- 语言线：固定 ORC fixture 的所有正常退出路径 `alloc==free`、`live=0`，retain/release 与析构顺序闭合；借用/escape/move/Unknown drop 负例编译期 hard-fail，显式 consume、容器与 scope cleanup 无 double-release。
- 两线均通过 production regression、thread/atomic/ORC runtime gate、jobs 确定性与 selfhost fixed point 后，提案才可 archive。
