# Ownership moveHint as Optimization Semantics（moveHint 条款收口为优化语义）

目标：把 `moveHint` 从"规范级语义条款"降级为"不可观测的实现优化"，规范只承诺 retain/release 省略对程序行为不可观测；实现从语句列表启发式迁移到 CFG liveness + 逃逸分析。

状态：规范层已 apply（2026-06-10）；实现层（CFG liveness 迁移）待等价证据，见执行记录。

## 问题

- 现状 formal-spec §0.1 把一组实现启发式写成了规范语义：`MoveFromIdent(name)` 的 last-use 判定附带四条例外（defer 引用禁用、外层后续使用禁用、分支后续 use 检查、loop-carried 排除），§0.1.1 再补"以语句列表为单位扫描、pattern/解构走保守路径"等实现细节。
- 危害：
  - 用户无法从这些条款推断自己程序的行为边界——条款描述的是优化器内部状态，不是可观测语义。
  - 启发式以"语句列表线性窗口"为分析单位，天然弱于 CFG liveness；规范却把弱分析固化成条款，未来升级分析精度反而构成"违反规范"。
  - 规范文本与实现状态注记（"最终绑定以当前后端实现与回归脚本为准"）互相指认，等于规范条款自我放弃权威。

## 决议

- 规范层（formal-spec §0.1/§0.1.1 改写）：
  - 保留唯一可观测合同："ORC 下 retain/release 的插入与省略对程序可观测行为（含析构顺序合同明确覆盖的部分）必须等价；省略只是优化。"
  - `defer`/借用/`share`/`share_mt` 的现有语义条款不动（它们是真语义）。
  - moveHint 四条例外、语句列表扫描窗口、pattern 保守路径等内容整体迁出规范正文，归入实现注记/优化文档，明确标注"非规范，不构成行为承诺"。
- 实现层：
  - move/last-use 判定迁移到 BodyIR/CFG 上的 liveness + 逃逸分析（数据已在 `src/core/analysis/` 与 BodyIR no-alias facts 侧存在雏形）；语句列表启发式作为初始实现保留到等价证明完成，之后删除。
  - 诊断/计数面保留：`MM_DIAG=1` 的 retain/release/escape 计数继续作为回归证据。

## 验收

- 现有 ORC 回归全绿：`thread_atomic_orc_runtime_gate_smoke`、`perf_memory_contract_smoke`、production regression 聚合。
- 等价证据：对固定 fixture 集，新旧分析下 `MM_DIAG` 计数差异只允许"新分析省略更多 retain/release 且行为输出 byte-identical"方向。
- 文档同步：`docs/cheng-formal-spec.md`、`docs/cheng-skill/SKILL.md`、`references/grammar.md` 与本地 skill 镜像一致（过 `cheng_skill_consistency_smoke`）。
- 规范改写不得移除任何门禁钉住的同步标记与字符串（SABI/ZRPC marker、production regression 命令行等）。

## 不做的事

- 不改 `let` 借入 / `var` 独占可变借用 / 显式 `move` 表面语法。
- 不改 FFI/SABI 边界。
- 不在本提案内引入新的所有权语法（完整可变值语义收敛是后续独立提案）。

## 执行记录

### 规范层（2026-06-10，已落地）

- `docs/cheng-formal-spec.md` §0.1 `moveHint` 条目改写：规范合同收口为单条等价条款（moveHint 命中与否对可观测行为不可观测），四条启发式例外从规范正文移除。
- §0.1.1 标题改为"moveHint 当前实现注记（非规范）"，加注"仅作实现参考与回归口径，不构成语言行为承诺"，并写明迁移方向（BodyIR/CFG liveness + 逃逸分析）与替换条件（`MM_DIAG` 计数 + 行为输出 byte-identical 等价证据）。
- 验收：`cheng_skill_consistency_smoke` / `sabi_string_bridge_smoke` / `ffi_str_abi_negative_smoke` PASS；`thread_atomic_orc_runtime_gate_smoke` 按官方合同（cold compile obj + report markers）PASS；production regression 1346/1348 与基线一致。`docs/cheng-skill/SKILL.md` 仅以特性名提及 moveHint，无需同步改写。

### 实现层（盘点完成，迁移未开始）

源码盘点（2026-06-10）修正了本提案的前提认知：

- **"语句列表启发式"从未落地**：仓库无 moveHint/MoveFromIdent 实现；ownership/borrow_checker 的 move 检查只做诊断，未接 codegen。规范 §0.1.1 所述启发式是设计稿，已在 spec 中标注实现状态。
- **现行生产优化**：`primary_object_plan.cheng` 的 `PrimaryBodyIrCanElideOrcRetainReleasePair`/`PrimaryBodyIrElideOrcRetainReleasePairs`（BodyIR 相邻 retain/release 对消除，编译报告字段 `primary_object_body_ir_orc_retain_release_pair_elided_count`）；检测到 Lowering 引用 ORC 计数 API 时整体禁用 elision 保可观测（`PrimaryLoweringHasOrcDiagObserver`）。
- **可观测合同实况**：`MM_DIAG=1` stderr 日志未实现，现行合同是计数 API（`memRetainCount/memReleaseCount/memAllocCount/memFreeCount/memLiveCount` + `memDiagReset`，注意 reset 只清 retain/release 两项）；spec 引用的 `examples/test_orc_closedloop.cheng` 不存在，需新建。
- **可复用雏形**：`uir_noalias_pass.cheng`（lastUse/killEvents）、`body_ir_noalias.cheng`（refCount->noAlias）、`core_types.cheng`（OwnershipKind/EscapeKind）、`compiler_facts.cheng`（OwnershipFact 枚举）。

等价证据管线（迁移前置）：

- 固定集：`bytes_overwrite_orc_smoke`、`bytes_local_epilogue_orc_smoke`、`bytes_parent_copy_orc_smoke`、`bytes_view_orc_registry_smoke`、`orc_perf_contract_smoke`、`thread_atomic_orc_runtime_gate_smoke`；需新建 defer/loop/if use-after 的 ORC 计数 fixture 补缺口。
- 判定：新分析 retain/release 计数 ≤ 旧值，alloc/free/live 相等，stdout byte-identical，exit code 相同；任何计数增大或输出漂移即 FAIL。
- 实施开关：分析切换需要 `CHENG_MOVEHINT_ANALYSIS=legacy|cfg` 类编译开关（待实现）双跑对比。

管线落地设计（2026-06-10 补）：

- 门禁形态：`movehint_equivalence_gate` 脚本化为 ci_gate 新步骤。机制 = 同一 fixture 以开关两态各编译一次（走现行官方合同：stage3 cold compile obj + report markers），再各运行一次，逐项断言上节判定条款。A/B 产物对比复用 backend-line-rescan-removal 提案验证过的 obj byte-compare 方法学。
- 成本控制：PR 级跑固定集（≤8 fixture，秒级）；全量 production regression 双跑只在分析实现切换的提交上手动触发。
- 计数采集：fixture 内自打印 `memRetainCount/...` 终值（计数 API 是现行合同），门禁脚本 diff 两态 stdout 时把计数行单独解析并按"≤/=/="规则判定，非计数行要求 byte-identical。
- 观察者路径：`PrimaryLoweringHasOrcDiagObserver` 命中时 elision 整体禁用，故计数 fixture 测的是"分析判定正确性"而非省略量；省略量证据由不含计数 API 的 fixture 的 `*_pair_elided_count` 报告字段承担，两类 fixture 在固定集内都要有。
- 演进：CFG liveness 落地后开关升级为 `legacy|cfg` 两态对照；legacy 删除时门禁退化为单态跑 + 报告字段回归，不再双编译。
