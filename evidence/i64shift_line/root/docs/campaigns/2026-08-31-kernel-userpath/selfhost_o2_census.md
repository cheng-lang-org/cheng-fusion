# selfhost_o2_census —— 自宿主理论极限·大项 2/4 施工备料图谱（CENSUS-O2）

date_utc=2026-09-05 · 线=CENSUS-O2（普查线，纯只读） · 基线=主仓 HEAD=73debaef2 快照分析（快照已删） · 权威输入=VERIFY_phasec_stage2_append.md / selfhost_theoretical_targets.md 大项 2/4 · 定界=**memo 化（mutation-epoch）规格归 TIME 线（stage2 移交 §七.1），本文不重复；内存释放点（.cheng 侧 arena/归还是时点）归内存线，本文只在形状重叠处标注**。

## 结论先行

自宿主管线（.cheng）的 O(N²) 主战场**不在名字键查找**（slot 名/函数名/import 符号/可见性查询均已哈希索引化，前墙已收割），而在**exact_def 权威校验族的全量重扫形态**：freeze 消费审计 O(ops²)、use-after-consume 每 managed 读一次全 body dataflow、call_authority 的 `CurrentDefBefore` 线性回扫×每候选 reaches、merge lattice 每 block 重访时 per-slot×per-op 重扫。这些是 C 链实测热点（admission 184.6s 中 exact 族 ~57%）的同构体，且 .cheng 移植时**有两处 C 既有快道被明示不移植**（冻结单消费者支配快道、投影链 memo），使 .cheng 版本单次成本高于 C。排行第一的靶点=exact_def_merge 的 lattice 内层重扫（数组化即可，无语义风险）；第二=消费审计的批量 dataflow/快道恢复（须字节铁门 A/B 背书）。时间线收益大头仍按 stage2 定谳在 TIME 线 memo + materialize 架构项；本清单吃的是它没覆盖的扫描结构面。

---

## 一、热点函数调用图谱

### 1.1 .cheng 自宿主链（静态调用关系，file:line 实锚）

生产挂接点两处（批 5 组合验证器入口，语义同口径）：
- primary：`src/core/backend/primary_object_plan.cheng:66448` 调 `ExactDefCallAuthorityValidateInto`
- backend2：`src/core/backend2/backend2_pipeline.cheng:1963` 同调

组合验证器（每函数体一次，`exact_def_call_authority.cheng:1747`）串行展开四相位：

```
ExactDefCallAuthorityValidateInto (call_authority:1747)
├─ ExactDefFreezeValidateInto            (freeze:2506)      ← 每体一次
│   ├─ ExactDefFreezeDominatorsBuild     (freeze:158)       ← 每体一次, 支配树
│   ├─ exactDefFreezeWorkspaceAcquire    (freeze:1149)
│   ├─ exactDefFreezeReissueVarProvenance(freeze:1698)
│   ├─ exactDefFreezeCompleteReadEdges / ReadEdgeTerminalValidate (freeze:1974/2067) ← 每 op
│   ├─ exactDefFreezeConsumeEdgeAudit    (freeze:2215)      ← 每 definition × [summary+dataflow]
│   └─ exactDefFreezeUseAfterConsumeScan (freeze:2121)      ← 每 op×2 operand × [def 索引+dataflow]
├─ ExactDefMergeValidateInto             (merge:2307)
│   └─ exactDefMergeLatticeBuild         (merge:566, 调用点 merge:2250/2600) ← 每体一次, 定点迭代
├─ ExactDefCallAuthorityPhaseValidateInto(call_authority:1680) ← 每 var-out 位/call 位
│   ├─ exactDefCallAuthorityVarOutDefinitionValid (call_authority:831)
│   │   └─ VarOutAuthorityValid (641) / PublicationValid (775, 投影链递归·memo 不移植 :771)
│   ├─ exactDefCallAuthorityCurrentDefBefore (304) ← 被 545/801/1028/1182/1240 五处调用, 线性回扫
│   └─ exactDefCallAuthorityCallValid    (1082)
└─ ExactDefIdentityPhaseValidateInto     (identity:2486)    ← 每体一次
    └─ 借用父活性/主审循环（每 op×每边, identity:676/2847+; 失败诊断 O(ops²) 仅拒臂, identity:2843）
```

上游物化链（同文件、每函数体序）：`BodyIrExactDefDerive`（derive:477，调用点 primary:66321 / backend2:1843）→ `OwnershipBodyIrProductionApplyOwned`（primary:66358）→ `ExactDefFreezeSidecarSyncAppended`（freeze:2327，调用点 primary:66364）→ 上述 ValidateInto。即**每函数体一次 derive+apply+validate，validate 内部每 op/每 definition 级扫描**——调用量级 = 函数体数 ×（每体 O(ops)~O(ops²) 形态）。

### 1.2 C 链对照（附录；样卷为 stage2 线实测，本文重放解析）

基线样卷 base_sample（16,285 admission 窗口采样）：99.99% 落在 `cold_materialize_reachable_function_fixed_point` → `cold_compile_import_function_direct` → `cold_try_compile_import_function_from_source` → `cold_parse_fn_in_scratch`（98.3%）——即 admission 段主体=逐函数 scratch 重解析+权威校验。exact 族自采样占比（含递归重入聚合）：

| C 函数 | self% | .cheng 同构体 |
|---|---|---|
| cold_exact_call_var_out_definition_valid_impl | 23.8 | call_authority:641/831 |
| cold_exact_var_projection_edge_structure_valid | 22.4 | identity 投影链族 |
| cold_exact_var_projection_carrier_valid | 21.7 | identity 槽终态族 |
| cold_exact_var_projection_definition_valid | 21.0 | identity 主审 |
| cold_exact_call_var_out_definition_valid | 19.9 | call_authority:831 |
| cold_exact_owned_local_authority_valid | 19.9 | identity:1580 族 |
| cold_exact_body_dominators | 19.7 | freeze:158 DominatorsBuild |
| cold_exact_unique_var_param_authority_valid | 12.0 | freeze:2777 族 |
| cold_exact_definition_consumption_dataflow_query | 11.4 | freeze:1253 DataflowFrom |
| cold_exact_definition_reaches_consumer | 10.2 | freeze:371 Reaches |
| cold_exact_storage_authority_for_slot | 6.8 | freeze 槽存储门 |

C 侧 memo 规格（mutation-epoch + (body_epoch, definition) 键）归 TIME 线，见 VERIFY_phasec_stage2_append.md §七.1，本文不展开。C 侧 materialize 固定点=cheng_cold.c:103864、freeze 准入=:103982 前、并行死骨架=:103416（stage2 已钉死，本文仅引用）。

---

## 二、O(N²)/O(N·M) 模式清单（.cheng 主战场）

标注：外层×内层复杂度对按「每函数体内 ops/defs/slots/stmts 计」；程序级形态按「全 functions 表」计。收益档：大头=入时间线主目标，中=次波，小=顺手。

### F1. merge lattice 每 block 重访的 per-slot×per-op 重扫 —— 数组化即吃
- **位置**：`src/core/analysis/exact_def_merge.cheng:694-713`（exactDefMergeLatticeBuild 内定点循环：`for slot in 0..<slotCount` × `for op in opStart..<opStart+opCount` 找该 slot 块内末定义）。
- **形态**：定点迭代次数 × blocks × `slots × ops_in_block`。O(B·S·O·rounds)。
- **键类型**：slot→块内末定义行。freeze 侧已有同构 CSR 先例 `exactDefFreezeSlotDefinitionIndexBuild`（freeze:1894，slotDefStarts/Counts/Rows），merge workspace 可复制同法，内层塌缩为 O(S+O)/visit。
- **同构性**：与 W5 事务键扫描数组化同构（线性谓词扫描→CSR 预索引）；仓内先例即 freeze:1894 与 primary 槽名哈希 `PrimaryBodyIrNodeBoolChainSlotNameIndexLookup`（primary_object_plan.cheng:4218）。
- **收益**：大头（lattice 在定点下块重访多轮，slots 大的 body 乘法最重）。**无语义风险**：纯索引替代重扫，判定值逐位同。

### F2. freeze 消费审计 O(ops²) + 用后消费扫描每 managed 读全 body dataflow
- **位置**：
  - `exact_def_freeze.cheng:2221→2256`（ConsumeEdgeAudit：`for definition in 0..<ops.len` × ConsumerSummaryBuild(840, 每 definition 全 ops 扫) + DefinitionConsumptionDataflowValid(1599→1253 全 body dataflow BFS)）→ O(ops×(ops+B+O))。
  - `exact_def_freeze.cheng:2131→2178`（UseAfterConsumeScan：`for op` × `for operandOrdinal<2` × ConsumptionDataflowFrom(1253, flowEntry=0..blocks.len 全量)）→ O(managed读 × (B+O))。
  - **关键事实**：freeze:2211 注释明示「单消费者支配快道 (cyclic_blocks 门) 不移植 → consumption_dataflow_valid 恒由全量 dataflow 证明」——C 版快道被删，.cheng 恒走全量。
- **键类型**：(definition→consumer 集合)、(definition, queryBlock, queryOp)→lattice 终态。可批量化：按 definition 一次 dataflow 求出全 block 终态表后复用于该 definition 的全部读点查询（现实现每读点重跑 BFS）；summary 可由一遍 ops 扫描产出 definition→(count,first,last,terminal) CSR。
- **同构性**：即 C 样卷 11.4%+10.2% 两个热点谓词的 .cheng 体；批量化=数组化+会话内 memo 混合（见 §三 M1）。
- **收益**：大头。**约束**：验证层改动，须字节铁门同名配对 EQ + 四夹具 A/B（stage2 门禁口径），语义恒等由「同输入同判定」保证。

### F3. call_authority CurrentDefBefore 线性回扫 × 每候选 reaches
- **位置**：`exact_def_call_authority.cheng:304-323`（`candidate=beforeOp-1 down to 0`，每匹配 slot 行调 `ExactDefFreezeIdentityReaches`（freeze:2591，CFG 可达游走））；调用点 545/801/1028/1182/1240（每 var-out 位/每 call arg/每投影基座）。
- **形态**：O(span) 回扫 × O(B+O) reaches = 每 call 位 O(span×(B+O))；深 body × 多 call 位时与 F2 同级。
- **键类型**：slot→候选定义行（可用 freeze:1894 同款 slot CSR 限界候选，回扫只走该 slot 的定义行序列而非全 ops）；(def,op)→reaches 可会话 memo（M1）。
- **同构性**：C 样卷 sole-lineage/current-def O(span) 扫描的直系同构（stage2 账本 §一.4 原文点名形态）。
- **收益**：大头（与 F2 同相位共享 workspace，可一并做）。

### F4. UniqueReachableTailRow / UniqueFunctionTailRow 全函数表尾名扫描（fallback 路径）
- **位置**：`src/core/backend/primary_object_plan.cheng:65423/65443`（对 `lowering.functionNames` 全表每行做 `PrimaryPlanCallTailUndecorated`——字符串切割+CloneStr——比对）【更正 2026-09-10 实读：旧写 `:65411/65431` 已漂移，`fn PrimaryPlanUniqueFunctionTailRow(` 现址 `:65423`、`fn PrimaryPlanUniqueReachableTailRow(` 现址 `:65443`（两者同 +12；旧 `:65411` 现落 `PrimaryPlanSymbolRowForTypedFunctionIndex` 体内）】；调用点 71073/71521/75096/75099/75199/75205/75725/75785，均在 **per-function×per-call** 主循环内（exact resolve 落空后的 fallback，75086-75100）。
- **形态**：程序级 O(miss_calls × F)，F=全程序函数数（本仓 14,588）；每对含字符串分配。
- **键类型**：尾名→行集。仓内索引先例同文件现成：`PrimaryPlanResolveExactSourceUnique`（64980 起，`PrimaryObjectPlanEnsureResolveIndex` 哈希桶尾名索引）——把同款索引建一份 tail→rows 映射即可 O(1) 命中，再按 reachable 位过滤保 uniqueness 语义。
- **同构性**：W5 数组化直系形态。
- **收益**：中（取决于 miss 率：exact 索引命中的主流调用不进 fallback；importc/合成/文本调用密集的体 miss 多。**量级待实测**：可在 miss 分支加计数验证）。

### F5. TypedExprIrLookupImportcTargetSymbol 线性扫 importc 表
- **位置**：`src/core/lang/typed_expr.cheng:50624-50649`（`for i in 0..<ir.importcNames.len` 全表字符串比对）；调用点 primary_object_plan.cheng:75042（per call item, d4）。
- **形态**：O(call_items × importc_rows) 字符串比对 + 每次 `ParserNormalizePath/PathTrim`。
- **键类型**：冻结快照已有哈希索引 `typedExprFrozenBuildSnapshotImportcIndex`（typed_expr:38530，bucket/next/hash 列齐备）——本查询未接它。接索引或按 plan 建局部 name→row 映射即 O(1)。
- **收益**：中（importc 行数量级=百级/kernel，call items 万级）。

### F6. 语句构建器 same-line 全表扫描族
- **位置**：`src/core/backend/primary_object_plan.cheng`
  - 53009/53014（`PrimaryBodyIrHasSameLineLetCallBinding`/`...ResultIntrinsicBinding`，实现 5490/5516：全 statements 扫、按 lineNumber 过滤）
  - 54103/55002（`PrimaryBodyIrHasPreviousDuplicateWholeLetCall`/`...WholeCall`，实现 5545/5588：全表两段扫）
  - 45318（同款第三处）
- **形态**：每 statement × O(stmts) = O(stmts²)/body；行号过滤常数小但大 body 乘法仍在。
- **键类型**：已有现成索引 **sameLine CSR**：`PrimaryBodyIrBuildSameLineIndex`（52195 调用，53813/53878/54108 已在用 `sameLineLo[stmtIndex]..<sameLineHi[stmtIndex]`）——把上述谓词改为组内扫描即得；duplicate 判定键可加 (bindingName,callTarget) 组内哈希。
- **收益**：中小（常数级改善为主，超大 body 收益放大）。

### F7. IntInList 线性成员测试
- **位置**：primary_object_plan.cheng:5357（`PrimaryBodyIrIntInList`）；per-call 调用点 55000/55297/55332（d4-d6）。
- **形态**：O(emitted)/call → O(call²) 最坏。
- **改法**：bool[]/int8[] 标记数组（stmtIndex 直接寻址）。
- **收益**：小（顺手）。

### F8. 冻结快照索引 clone-per-append
- **位置**：`src/core/lang/typed_expr.cheng:38615-38633`（importc 快照索引每插一行克隆 6 个增长数组）→ 建表 O(M²)；35264（可见性声明 heads 每注册克隆）；35379-35414（可见性查询缓存每填充克隆 5-6 数组）→ O(Q²)。
- **键类型**：插入序无关的构建期数组，构建者独占即可 `add`+rehash 就地增长；风险点=projection 的按值语义边界（若投影构建后被共享只读，构建期就地化不破坏）。
- **收益**：中（M=importc 行小；Q=唯一可见性查询键，**Q 量级待实测**——大仓可能数万，Q²×6 不可忽略）。

### F9. primary cleanup 前置探测 O(ops×mcRows)
- **位置**：primary_object_plan.cheng:66339-66356（每 def × 全 manualConsume.sourceDefinitionRows 线性）。
- **改法**：manualConsume 行按 sourceDefinitionRow 建 CSR（该 sidecar 本身 CSR 形）。
- **收益**：小。

### 非靶点（排除记录，防后续重复排查）
- 槽名/函数名/import 目标/可见性查找主路径均已哈希化：primary_object_plan.cheng:4218/5877（slot 名索引）、8238 段（lowering 名索引 dense+hash）、typed_expr 可见性查询缓存（35204）。
- `TypedExprBuildIndexSealCallDeclarations`（typed_expr:31100+）为自底向上归并排序 O(N log N)，非 O(N²)。
- `exactDefIdentityConsumePathFactsEmit`（identity:2419，含 O(ops²) 边枚举 2464→2467）仅拒臂诊断（identity:2843，audit 失败才调），生产绿路不进——**不动**。
- `exactDefFreezeConsumeEdgeAudit` 内层 `for candidate in 0..<ops.len`（2256）仅判词富化拒臂——绿路不进。
- ProgramContractDerive（call_authority:1500，函数表×ret 窗）程序级一次+模块缓存（primary:66410 `primaryExactDefContractCacheReady`）；FormalReadOnlyScan（csg:41950）函数级 memo 在位——不动。

---

## 三、memo 可行性初判（读集宽窄 × 变异面；TIME 线边界内）

总判：.cheng 侧验证族在**密封体上单遍运行**（ValidateInto 输入=sealed sidecar，ApplyOwned 变异后先 SyncAppended 再 validate），**不存在 C 链的跨重解析变异窗**，故 TIME 线的 mutation-epoch 机制在 .cheng 非必需；.cheng 的 memo 机会是**会话级**（单次 validate 内多相位共享）：

| 项 | 谓词 | 读集 | 判定 | 变异面 |
|---|---|---|---|---|
| M1 | ConsumptionDataflowFrom 结果（freeze:1253） | 窄：键=(definition, flowEntry, flowEnd, queryBlock, queryOpExcl) | **可会话 memo**：workspace 挂 (definition→block 终态表) 惰性表，同 definition 的多读点查询共享一次求值 | validate 期间 body 与 sidecar 零变异（读 `var bodyIR` 但判定路径无写列）——需在施工时以「validate 内零写」断言门背书 |
| M2 | Reaches/IsCurrentAtConsumer（freeze:371/433/2591） | 窄：键=(def, consumer) 位对 | **可会话 memo**（bitset N×N 大 body 需分块；或按 block 对粒度） | 同上 |
| M3 | 投影链递归（call_authority:775，:771 明示 memo 不移植） | 窄（沿 borrow-owner 列，op 严格递减保证终止） | 可 memo 但链短，收益**待实测**；先挂计数探针 | validate 内零变异 |
| M4 | C 侧跨重解析 exact_valid memo | 宽（body 可变窗） | **归 TIME 线**（stage2 移交 §七.1 spec），.cheng 侧不立项 | body mutation epoch |

---

## 四、排序施工清单（收益/施工量序；每项 1-4h 粒度）

### S1. merge lattice slot→末定义 CSR 数组化【大头·零语义风险】
- **files**: src/core/analysis/exact_def_merge.cheng（workspace 类型 +575 附近；exactDefMergeLatticeBuild:566）
- **action**: workspace 增 per-block slot→lastDefRow CSR（构建 O(ops)）；:694-713 内层 `for slot × for op` 改查表（等值判定：原扫描取「块内末个 valueDefSlot==slot 且 ownership!=Invalid 的 op」，CSR 存同判定的末行，逐位同值）
- **verify**: exact_def_merge_smoke 全绿 + backend2/primary 双后端编译夹具产物 sha 与改前配对 EQ；lattice 终态表抽体 dump 前后逐值对比
- **done**: 内层复杂度 O(S×O)/visit → O(S+O)/visit，判定零漂移

### S2. freeze 消费审计批量化 + 会话 dataflow memo【大头·验证层】
- **files**: src/core/analysis/exact_def_freeze.cheng（840/1253/1599/2121/2215；workspace 1149）
- **action**: ①ConsumerSummaryBuild 改一遍 ops 扫产出 definition→(count,first,last,terminal) CSR 供全审计复用；②workspace 挂 (definition→block 终态表) 惰性缓存，UseAfterConsumeScan/ConsumeEdgeAudit 同 definition 共享；③单消费者支配快道等价物：summary.count==1 且消费块被定义块支配时按 C cyclic_blocks 门语义短路全量 dataflow（**须逐条对 C 69563-69758 条件重证**，不证不接）
- **verify**: 字节铁门同名配对 EQ（产物 sha）+ 四夹具 functional A/B 8/8（stage2 门禁口径）+ exact_def_freeze_smoke
- **done**: admission 同构段自采样占比显著下降；判定零漂移；快道臂逐条锚定 C 行号

### S3. CurrentDefBefore 候选 CSR 限界【大头·与 S2 同 workspace】
- **files**: src/core/analysis/exact_def_call_authority.cheng（304；调用点 545/801/1028/1182/1240）
- **action**: 复用 freeze:1894 slot-definition CSR 限界候选序列（回扫仅走该 slot 定义行，间隔仍由 Reaches 证）；(def,consumer) reaches 结果进 S2 的会话 memo
- **verify**: 同 S2 门禁；var-out/call 位判定逐位 EQ
- **done**: 每 call 位成本 O(span×(B+O)) → O(候选数×查询)

### S4. TailRow fallback 尾名哈希索引【中】
- **files**: src/core/backend/primary_object_plan.cheng（65411/65431；索引先例 64980 段）
- **action**: EnsureResolveIndex 同款建 tail→rows 桶索引一次；两个 TailRow 改查桶+reachable 位过滤（保留 hits==1 唯一性语义）
- **verify**: 主物件 sha EQ + miss 计数探针（索引命中集与全表扫一致断言）
- **done**: fallback O(F)/call → O(桶内)/call

### S5. ImportcTargetSymbol 接冻结索引【中】
- **files**: src/core/lang/typed_expr.cheng（50624）；primary_object_plan.cheng（75042 调用点不动）
- **action**: LookupImportcTargetSymbol 增索引臂（复用 snapshotImportc 桶列 38530；歧义/多符号回落现线性臂保语义）
- **verify**: typed_expr smoke + 编译产物 sha EQ
- **done**: per-call O(importc) → O(1) 探测

### S6. same-line 谓词接 CSR + IntInList 位标记 + cleanup 前扫 CSR【中小·顺手包】
- **files**: primary_object_plan.cheng（5490/5516/5545/5588/5357；66339）
- **action**: HasSameLine*/HasPreviousDuplicate* 改 sameLine CSR 组内扫（52195 索引已在位）；IntInList→int8 标记数组；manualConsume 行按 source 行 CSR
- **verify**: 主物件 sha EQ + 四夹具
- **done**: 每 stmt 全表扫归零

### S7. 快照索引 clone-per-append 就地化【中·需边界确认】
- **files**: src/core/lang/typed_expr.cheng（38615-38633/35264/35379-35414）
- **action**: 构建期独占段改 `add`+尾插+rehash；先加 Q（唯一查询键数）/M 计数探针实测再动手
- **verify**: 冻结投影逐列逐值 EQ（投影值语义不破坏证明）+ 全量烤机产物 sha EQ
- **done**: 建表 O(Q²)→O(Q)

## 领地边界（避免重复劳动）
- memo/mutation-epoch 的 C 链规格=TIME 线在管（本文件 §三.M4 仅引用）；本清单 M1-M3 为 .cheng 会话级 memo，未与 TIME 线重叠。
- 内存线（.cheng 释放点/L3 批次）：`workspace.blockEndStates = B×S` 稠密矩阵（merge:605）同时是时间与内存形状，若内存线立项该 workspace 的分批释放，S1 施工前须对齐。
- wall154 主树独占：本线零代码改动，全部结论出自 HEAD=73debaef2 快照。

## 附：样卷解析数据（/tmp/o2_samples/，stage2 线样卷拷贝）
- 解析器：macOS sample 树前缀定深（(前缀字符数−4)/2），self=节点数−子节点和；递归重入会使聚合 self% 重复计同一物理采样，读数以相对占比为准。
- base_sample 16,285 样：exact 族合计 ~57%（与 stage2 账本一致）；parse 族（materialize 内 scratch 重解析）~30%+。
