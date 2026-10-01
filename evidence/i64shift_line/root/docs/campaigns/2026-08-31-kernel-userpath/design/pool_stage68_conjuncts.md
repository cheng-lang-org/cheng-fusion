# 池化 lower 残留失败点静态定位：`pv_fail stage=68` / `schedulePresent`

**只读分析**（未编译、未改 `src/**`、未 commit、未建锁）。所有 `文件:行` 锚定：

- HEAD = `9c368085c0f0bb201ec5d5b4420ba6e254035d12`
- `f8f4ab66c`（三根因修复）是 HEAD 的祖先，落后 6 个 commit；`git log --oneline f8f4ab66c..HEAD` 6 条全部是 docs/parser 面。
- `git diff f8f4ab66c..HEAD -- src/core/backend/primary_object_plan.cheng` **为空**；`git status --porcelain src/core/backend/primary_object_plan.cheng` **为空**；该文件 sha256 = `501763942d5a9bf260f1ca778cfdd1134727eab14b3e9340e2aca609b635dbf4`。
- 因此下文行号 = HEAD 行号 = 工作树行号，可直接引用。

---

## §0 定位（任务 1 的答案）

1. **`pv_fail` 不在源码树**：`grep -rn "pv_fail" src/ tools/` = 0 命中。它是**探针字符串**，由 `.rebuild/run_pb/pb_tools/make_probe9b.py:34-36` 生成的 helper 打印：

   ```
   fn primaryLowerPoolPrevalidateFailProbe(stage: int32): bool =
       PrimaryObjectPlanTrace(Fmt"POOLPROBE pv_fail stage={stage}")
       return false
   ```

   该脚本把 `PrimaryLowerPoolBodyIrPayloadPrevalidate` 函数体里**每一个** `return false` 按出现顺序替换成 `return primaryLowerPoolPrevalidateFailProbe(<序号>)`（同文件 14-33 行）。

2. **`stage=68` 我已按 HEAD 复算确认**：函数 `fn PrimaryLowerPoolBodyIrPayloadPrevalidate`（`src/core/backend/primary_object_plan.cheng:67827`）到 `fn primaryLowerPoolWriteFrameHeader(`（同文件 `:69028`）之间共 **77** 个 `return false`；第 **68** 个正好是 `src/core/backend/primary_object_plan.cheng:68948`：

   ```cheng
   68939:    let schedulePresent =
   68940:        scheduleSealedFlag == 1 &&
   ...
   68946:        scheduleRowsValid
   68947:    if !scheduleEmpty && !schedulePresent:
   68948:        return false
   ```

   与"tag 只到 17"自洽：失败点在 `ExpectU32(..., 19, ...)`（`:69002` exact-def 侧车）之前，码流确实还没走到 19。

3. **`schedulePresent` 的合取项实为 8 个（不是 7 个）**（`:68939-68946`）。PB_report/commit message 说的"七合取项"，是把 `scheduleOwnerCount > 0` 并入 `==`、`scheduleUnitCount > 0` 并入 `==` 的口径。本文按代码逐字给出 8 条，并把复合项 `scheduleRowsValid` 展开（它自己还含 7 个子项 + 3 段循环）。

---

## ① 结论先行

**首选候选（假设，待 7 分钟探针证实）：`scheduleRowsValid` 里的 `primaryLowerPoolRangesCoverTail` 三个 `requirePositive` 实参在 `f8f4ab66c` 中被极性反转**——`local/op/call` 现在传 `true`（禁止 count==0 的空行），而 canonical `bodyIRCleanupRangeValid(..., allowEmpty)` 对这三域传的是 `true`（**允许**空行）。

一句话理由：`requirePositive` 是 `allowEmpty` 的**逻辑取反**（`(requirePositive && count <= 0) → return false`），而 fix3 把 canonical 的 `allowEmpty` 字面值 `true,true,true,false,false` 原样抄进了 `requirePositive` 形参位；修复前的 `false,false,false,true,true` 才是与 canonical 一致的那一组（`git show f8f4ab66c~1:...` 实证）。同时生产者**必然**产出空行：`cleanupCfgRecordScheduleUnit` 用 `count = 当前长度 − 单元起点` 计算区间，任何不 materialize local/op/call 的单元（drop / defer / return-snapshot 单元都不 `add(bodyIR.localSlots, ...)`）就得到 `count == 0`。

**并列次选（与首选很可能同时为假）**：同复合项内的 projected-slot **包含性判据**（`:68921-68931`）缺 canonical 的 `preallocatedInSource` 分支（`core_types.cheng:5910-5915`）。`localCount == 0` 的单元只要有投影，该单元在任何 slotId 下都必然判死（区间为空集）；return-snapshot 单元正是"`localCount==0` + `projectedSlots=[snapshotSlot]`"形状（`cleanup_cfg.cheng:13460-13482`），canonical 只可能靠 `preallocatedInSource` 接受它。

**置信度**：首选 **中高（约 0.55）**，次选 **中（约 0.5）**，二者**高度相关、可能同真**（同一单元形状上同时为假）；其余候选合计 ≤0.2。**全部为推理，未实测**——必须由 §4 探针的 0/1 打点命名后才能落地为事实。

---

## ② 八个合取项逐个分析

### 顶层判据（`src/core/backend/primary_object_plan.cheng:68939-68946`，实读）

```cheng
68933:    let scheduleEmpty =
68934:        scheduleSealedFlag == 0 &&
68935:        !scheduleRootNonZero && !scheduleFinalControlNonZero &&
68936:        scheduleOwnerCount == 0 && scheduleUnitCount == 0 &&
68937:        scheduleEffectCount == 0 &&
68938:        scheduleProjectedSnapshotCount == 0
68939:    let schedulePresent =
68940:        scheduleSealedFlag == 1 &&
68941:        scheduleRootNonZero && scheduleFinalControlNonZero &&
68942:        scheduleOwnerCount == intentExitCount + intentSiteCount &&
68943:        scheduleOwnerCount > 0 &&
68944:        scheduleUnitCount == intentUnitCount &&
68945:        scheduleUnitCount > 0 &&
68946:        scheduleRowsValid
```

| # | 合取项 | 行 | 为 false 的输入条件 | 生产者/消费者证据 | 存活可能性 |
|---|---|---|---|---|---|
| C1 | `scheduleSealedFlag == 1` | :68940 | 线上 body 的 schedule 未封（`sealed=0`）却非空 | canonical `BodyIRCleanupScheduleSeal` 置 `sealed=true` 并要求 `bodyIRCleanupScheduleRowsValid`（`core_types.cheng:7390-7407`）；`cleanup_cfg.cheng:15895-15981` 是唯一封口入口 | 低（此前 dump 显示 sealed 正确；且 `building!=0` 已在 :68766 更早拦掉） |
| C2 | `scheduleRootNonZero` | :68941 | rootCid 全 0 | `BodyIRCleanupScheduleBindRootCid` 要求 rootCid 有效才写入（`core_types.cheng:7360-7374`） | 低（dump 显示正确） |
| C3 | `scheduleFinalControlNonZero` | :68942 | finalControlCid 全 0 | `BodyIRCleanupScheduleBegin` 绑定（`core_types.cheng:5829-5830`）并校验有效 | 低（dump 显示正确） |
| C4 | `scheduleOwnerCount == intentExitCount + intentSiteCount` | :68942 | owner 行数 ≠ 意图 exit+site 行数 | canonical 期望值就是同一表达式：`bodyIRCleanupScheduleExpectedOwnerCount = sourceBlockIds.len + siteOriginalBlockIds.len`（`core_types.cheng:5696-5698`）；seal 前 `RowsValid` 强校验（`:7237-7238`）；构建序 `cleanup_cfg.cheng:15910-15931`（exit 循环 + site 循环，序号漂移即 fail） | 低（dump 显示计数正确） |
| C5 | `scheduleOwnerCount > 0` | :68943 | — | **可证不可能单独为假**：`intentPresent` 已要求 `intentExitCount + intentSiteCount > 0`（`:68751`），故 C4 成立 ⟹ C5 成立 | ≈0 |
| C6 | `scheduleUnitCount == intentUnitCount` | :68944 | unit 行数 ≠ 意图 unit 行数 | canonical `RowsValid` 要求 `opStarts.len == cleanupIntent.unitKinds.len`（`core_types.cheng:7239-7240`）；`cleanup_cfg.cheng:15933-15960` 逐 unit append 并校验序号 | 低（dump 显示计数正确） |
| C7 | `scheduleUnitCount > 0` | :68945 | — | **可证不可能单独为假**：`intentPresent` 已要求 `intentUnitCount > 0`（`:68750`） | ≈0 |
| C8 | `scheduleRowsValid` | :68873-68931 | 见下（7 子项 + 3 段循环） | 见下 | **高（存活项所在）** |

> C1/C4/C6 的"dump 显示正确"来自 `PB_report.md:15`（探针 5-8 轮对 cold_nested 的值 dump：`sealed/root/finalControl 与计数全对`）。该 dump 是**状态 A**（fix1+2，未含 fix3/fix4）下取得的；fix3/fix4 不触碰这些量，故结论仍适用。

### C8 展开（实读 `:68868-68931`）

```cheng
68868:    let scheduleProjectedCsrValid =
68869:        primaryLowerPoolCanonicalCsr(
68870:            scheduleUnitProjectedSnapshotSlotStarts,
68871:            scheduleUnitProjectedSnapshotSlotCounts,
68872:            scheduleProjectedSnapshotCount, false)
68873:    var scheduleRowsValid =
68874:        primaryLowerPoolRangesCoverTail(
68875:            scheduleUnitLocalStarts, scheduleUnitLocalCounts,
68876:            intentOriginalLocalCount, slotCount, true) &&      # R1 ← fix3 改成 true
68877:        primaryLowerPoolRangesCoverTail(
68878:            scheduleOpStarts, scheduleOpCounts,
68879:            intentOriginalOpCount, opCount, true) &&          # R2 ← fix3 改成 true
68880:        primaryLowerPoolRangesCoverTail(
68881:            scheduleCallStarts, scheduleCallCounts,
68882:            intentOriginalCallCount, callCount, true) &&      # R3 ← fix3 改成 true
68883:        primaryLowerPoolRangesCoverTail(
68884:            scheduleBlockStarts, scheduleBlockCounts,
68885:            intentOriginalBlockCount, blockCount, false) &&   # R4 ← fix3 改成 false
68886:        primaryLowerPoolRangesCoverTail(
68887:            scheduleTermStarts, scheduleTermCounts,
68888:            intentOriginalTermCount, termCount, false) &&     # R5 ← fix3 改成 false
68889:        scheduleProjectedCsrValid &&
68890:        primaryLowerPoolCleanupScheduleEffectsValid(...)      # R7
```

| 子项 | 行 | 与 canonical 的关系 | 存活可能性 |
|---|---|---|---|
| **R1/R2/R3** local/op/call 区间 | :68874-68882 + `:67711-67736` | **比 canonical 严**（fix3 反转）：canonical `bodyIRCleanupRangeValid(..., allowEmpty=true)`（`core_types.cheng:6637-6651`）允许 count==0 行 | **首选候选** |
| **R4/R5** block/term 区间 | :68883-68888 | 极性方向与 canonical 一致的部分：canonical `allowEmpty=false`（`:6652-6661`）+ 构造侧 `AppendUnit` 明确 `blockCount <= 0 || termCount <= 0 → panic`（`core_types.cheng:5954-5962`），所以 fix3 把这两处改成 `false` 是**放松**（不会致红，但方向是错的）。**残留更严处**：本函数末尾 `return cursor == finalCount`（`:67736`）要求 block/term **精确铺满尾段**，而 canonical `bodyIRCleanupScheduleCoverageValid` 允许"anchor 但无 unit 拥有"的尾部 block/term（`core_types.cheng:7042-7044`、`:7068-7071`） | 中低（需尾部出现 hole；构造上每个 unit 至少 materialize 一个 block/term 且 append 都发生在 unit 窗口内，难以成洞） |
| R6 projected CSR | :68868-68872 / `:67696-67709` | 与 canonical 等价（canonical 用 `projectedCursor` 累加 == `projectedSnapshotSlotIds.len`，`core_types.cheng:7247-7258`） | 低 |
| R7 effects | :68890-68899 / `:67760-67825` | 与 canonical `bodyIRCleanupScheduleEffectsValid`（`core_types.cheng:6955-6992`）同口径：每 unit `unitEffectCounts > 0`（`:6960` vs 镜像 `:67785` requirePositive=true）、CSR 起点连续、role 区间 `BodyIRCleanupEffectRoleValid`（`:5691-5693` vs `:67803-67804`） | 低 |
| **循环 A** owner 行 | :68900-68914 | 镜像只查 block/term 范围、序号非负、continuation≠source、edge kind 合法且 ≠Return；canonical `bodyIRCleanupScheduleOwnerGraphValid`（`:6784-6839`）查得**更多**（successor 必须指向 unit 首块、final edge kind 必须等于期望值）。镜像更弱 ⟹ 不会误杀 | 低 |
| 循环 B projected 计数相等 | :68915-68920 | canonical 同判据（`unitProjectedSnapshotSlotCounts[row] != unitSnapshotSourceSlotCounts[row]`，`:6695-6701` vs 镜像读的 intent 列 `:68526-68529`） | 低 |
| **循环 C projected 包含性** | :68921-68931 | **比 canonical 严**：canonical 允许 `preallocatedInSource`（`projectedSlotId < cleanupIntent.originalLocalCount`，`core_types.cheng:5910-5915`）；镜像只认"落在本 unit local 区间内" | **次选候选** |

### 为什么首选是 R1/R2/R3（代码级证据链）

**(a) canonical 明确允许空行**（`src/core/ir/core_types.cheng:3287-3295` 实读）：

```cheng
3287: fn bodyIRCleanupRangeValid(start: int32,
3288:                            count: int32,
3289:                            limit: int32,
3290:                            allowEmpty: bool): bool =
3291:     if limit < 0 || count < 0 || count > limit:
3292:         return false
3293:     if count == 0:
3294:         return allowEmpty && start >= 0 && start <= limit
3295:     return start >= 0 && start <= limit - count
```

五处调用（`core_types.cheng:6637-6661`）实读：local `true`（:6641）、op `true`（:6646）、call `true`（:6651）、block `false`（:6656）、term `false`（:6660）。

镜像形参 `requirePositive`（`primary_object_plan.cheng:67723-67724`）：

```cheng
67723:        if count < 0 || count > finalCount - cursor ||
67724:           (requirePositive && count <= 0):
67725:            return false
```

⟹ `requirePositive = !allowEmpty`。正确的镜像实参应是 `false,false,false,true,true`。

**(b) 修复前就是正确的，fix3 把它翻反了**（`git show f8f4ab66c~1:src/core/backend/primary_object_plan.cheng` 实测）：

```
intentOriginalLocalCount, slotCount, false)
intentOriginalOpCount,    opCount,   false)
intentOriginalCallCount,  callCount, false)
intentOriginalBlockCount, blockCount, true)
intentOriginalTermCount,  termCount,  true)
```

`git blame` 该五行 = `87f2f2e57d`（2026-08-09），即镜像自诞生起就是 canonical 极性；`f8f4ab66c` 的 hunk4 把它翻成 `true,true,true,false,false`（正好等于 canonical `allowEmpty` 的字面值，是把 `requirePositive` 误读成 `allowEmpty` 的指纹）。

**(c) 生产者必然产出空行**（`src/core/analysis/cleanup_cfg.cheng:12413-12445` 实读）：

```cheng
12429:    add(draft.unitLocalStarts, localStart)
12430:    add(draft.unitLocalCounts, bodyIR.localSlots.len - localStart)
12431:    add(draft.unitOpStarts, opStart)
12432:    add(draft.unitOpCounts, bodyIR.ops.len - opStart)
12433:    add(draft.unitCallStarts, callStart)
12434:    add(draft.unitCallCounts, bodyIR.callSequence.len - callStart)
```

`count = 记录时的长度 − 单元起点`，起点在单元开始时取；**不 materialize local 的单元就得到 `localCount == 0`**。全文件 `add(bodyIR.localSlots, ...)` 只有 4 处（`:3512`、`:6882`、`:6922`、`:6971`、`:13179`），其中材料化期只有 `:13179`（ownership guard-snapshot 单元内部）；`cleanupCfgAppendReturnSnapshotBlock`（`:11674`）、drop 单元（`:12703`）、defer 单元（`:12175`/`:13043`）都**不追加 local**，且 `:13472-13482` 的 return-snapshot 单元还把 `projectedSlots=[snapshotSlot]` 记了进去。

**(d) canonical 侧把这些单元全判合法**：`AppendUnit` 用同一组 `allowEmpty=true` 校验（`core_types.cheng:5947-5952`），seal 前 `RowsValid` 也只按 canonical 语义查（`:7232-7290`）。⟹ 线上 payload 本来就是"canonical 合法、镜像非法"的形状。

**(e) 该形状此前从未被任何测试/夹具覆盖**：`src/tests/primary_lower_pool_bodyir_prevalidate_smoke.cheng:573-601` 只构造 **canonical-empty field 17**（"field17 occupies tag(4) + fixed/column bytes(608)"），全仓 `grep -rn "BodyIRCleanupScheduleAppendUnit\|BodyIRCleanupScheduleBegin" src/tests/*.cheng` = 0 命中 ⟹ present 臂（真实 schedule）在池化预校验里**零测试覆盖**（这也解释了 fix3 的反转为何没被门禁抓住）。

### 为什么次选是循环 C（包含性）——它与首选在**同一单元**上同时为假

canonical（`core_types.cheng:5874-5915`）实读关键两行：

```cheng
5910:    let materializedInUnit =
5911:        projectedSlotId >= localStart &&
5912:        projectedSlotId < localStart + localCount
5913:    let preallocatedInSource =
5914:        projectedSlotId < bodyIR.cleanupIntent.originalLocalCount
5915:    return materializedInUnit || preallocatedInSource
```

镜像（`primary_object_plan.cheng:68925-68931`）只保留 `materializedInUnit`：

```cheng
68925:            for offset in 0..<projectedCount:
68926:                let slotId = scheduleProjectedSnapshotSlotIds[
68927:                    projectedStart + offset]
68928:                if slotId < scheduleUnitLocalStarts[unitRow] ||
68929:                   slotId - scheduleUnitLocalStarts[unitRow] >=
68930:                       scheduleUnitLocalCounts[unitRow]:
68931:                    scheduleRowsValid = false
```

数学上：若某 unit 的 `localCount == 0`（首选候选的那个形状）且该 unit 有投影（`projectedCount > 0`），则任何 `slotId` 都落在空区间之外 ⟹ **必然判死**。而 canonical 的 `preallocatedInSource` 分支存在的唯一理由就是接受这种"投影到源区预分配槽"的单元。两种候选不是二选一，很可能是**同一次失败的两个 0**。

---

## ③ 最小修复方案与风险

### 修复 A（首选候选，5 行，与 canonical 逐字对齐）

`src/core/backend/primary_object_plan.cheng:68873-68888`，把 5 个实参还原为 `f8f4ab66c~1` 的极性：

| 行 | 现在 | 改成 |
|---|---|---|
| :68876 | `intentOriginalLocalCount, slotCount, true)` | `..., false)` |
| :68879 | `intentOriginalOpCount, opCount, true)` | `..., false)` |
| :68882 | `intentOriginalCallCount, callCount, true)` | `..., false)` |
| :68885 | `intentOriginalBlockCount, blockCount, false)` | `..., true)` |
| :68888 | `intentOriginalTermCount, termCount, false)` | `..., true)` |

即 `requirePositive = !allowEmpty`，与 `core_types.cheng:6641/6646/6651/6656/6660` 一一对位。

**为什么不是放宽判据**：空行仍受 `start ∈ [intentOriginal*Count, 总长度]` 双重约束（`:67726-67731`），且整段仍要求非空行恰好从 `cursor` 开始、末尾 `cursor == finalCount`（`:67732-67736`）——这与 canonical `RangeValid(allowEmpty=true)` **加上** `start >= originalCount`（`core_types.cheng:6662-6671`）**逐条等价**；而 block/term 从 `false→true` 是**收紧**到 canonical 的 `allowEmpty=false`。

### 修复 B（次选候选，条件性，4 行）

只有探针把循环 C 也打成 0 时才加（若 A 已足够则**不要**加）。`:68925-68930` 改为：

```cheng
                if !(slotId >= scheduleUnitLocalStarts[unitRow] &&
                      slotId - scheduleUnitLocalStarts[unitRow] <
                          scheduleUnitLocalCounts[unitRow]) &&
                   slotId >= intentOriginalLocalCount:
                    scheduleRowsValid = false
```

即补上 canonical 的 `preallocatedInSource` 分支（`slotId < intentOriginalLocalCount` 时放行）。依据：`core_types.cheng:5910-5915`。注意 canonical 对 `Snapshot` 策略还要求 `projectedSlotId != sourceSlotId` 且源槽在本 unit 的快照行域内（`:5885-5909`）——镜像没有这些列（payload 里没有），**不能在镜像里补**，只能在探针报告里登记为已知弱化。

### 风险（三条红线）

1. **会不会放过真正坏的帧**：会**扩大接收面**，但扩大到的是 canonical 语义面。线上 payload 由 `Backend2BodyIrEncode` 从**已封** body 发出，而封口 `BodyIRCleanupScheduleSeal` 强制 `bodyIRCleanupScheduleRowsValid`（`core_types.cheng:7400`）⟹ 发出方本来就不可能产出被 canonical 拒绝的 schedule。真正被放过的只剩"被篡改/损坏的帧"这一类：截断、长度漂移仍被 exact-count 读 + `cursor == payload.len`（`:69026`）拦住；坏 unit 行仍被 CSR/owner/effects/tag-19/tag-11 拦住。**接收侧在预校验之后只做 decode + commit，没有 canonical schedule 复验**（`:69966-69989`、`:70503-70519`），所以这一层是唯一结构门——这正是必须"对齐 canonical 而不是拍脑袋放宽"的理由。
2. **是否影响串行路径**：否。`PrimaryLowerPoolBodyIrPayloadPrevalidate` 只在池化接收路径被调用（`:69966`、`:70506`）；`BACKEND_JOBS<=1` 串行臂不经过它。串行臂发射字节不变。
3. **是否改变发射字节**：否。该函数是纯读的接收侧判据，不参与 `Backend2BodyIrEncode`（`backend2_frag_codec.cheng:1750-1748` 面）。唯一间接影响：修复后池化路径能继续往下走，产物 sha 会从"j2 无产物"变为"j2 == j1"。

### 验收判据（修完必查）

- 四夹具 j1/j2 sha256 逐字节相等（`ab_fixtures.sh` 口径，`PB_report.md:52-58`）。
- `grep -c POOLPROBE` = 0（探针必须还原）；`git diff --numstat` 只含预期行数。
- `python3 tools/move_into_field_completeness_gate.py` PASS。
- 串行臂 hunk 数 0（红线：不得回落成串行）。

---

## ④ 7 分钟探针打点方案（**本报告不执行**）

目标：**一次运行**把 8 个顶层合取项 + C8 的 10 个子项全部打成 0/1，并对每个 0 附**首个违规行的原始数值**，使存活假项当场被命名。

### 生成器（仿 `make_probe9b.py`，逐锚点 fail-fast）

新建 `pb_tools/make_probe10.py`：读干净树文件 → 写 `/private/tmp/pb_probe/primary_object_plan.cheng.probe10` → 打印每个 anchor 的命中数（≠1 即 `sys.exit(1)`）。三处改写：

**(1) 把 C8 的组合改成语义等价的分名局部量**（把 `:68873-68931` 的 `var scheduleRowsValid = ...` 拆成 `pvR1..pvR5/pvCsr/pvEffects`，再原样 `&&` 回去），这样每个子项可单独打印且**不会与组合漂移**。

**(2) 在 `:68947` 失败分支插打点**（只在该处打印，不改变控制流）：

```cheng
    if !scheduleEmpty && !schedulePresent:
        PrimaryObjectPlanTrace(Fmt"POOLPROBE pv68 fail arm empty={0} ownerCount={scheduleOwnerCount} exitPlusSite={intentExitCount + intentSiteCount} unitCount={scheduleUnitCount} intentUnit={intentUnitCount} origLocal={intentOriginalLocalCount} origOp={intentOriginalOpCount} origCall={intentOriginalCallCount} origBlock={intentOriginalBlockCount} origTerm={intentOriginalTermCount} slotCount={slotCount} opCount={opCount} callCount={callCount} blockCount={blockCount} termCount={termCount} effectCount={scheduleEffectCount} projCount={scheduleProjectedSnapshotCount}")
        # C1..C8 逐项 0/1（bool 不能直接格式化 ⇒ 用 if/else 两行，沿用 probe8 已验证写法）
        # pv68 C1=0/1 ... C8=0/1
        # pv68sub R1=.. R2=.. R3=.. R4=.. R5=.. CSR=.. EFF=.. OWNERLOOP=.. PROJCNTEQ=.. PROJCONTAIN=..
        # 首个违规行（仅第一个，避免刷屏）：
        #   pv68bad range=local|op|call|block|term row=<unitRow> start=<s> count=<c> cursor=<cursor> orig=<originalCount> final=<finalCount>
        #   pv68bad proj row=<unitRow> off=<offset> slot=<slotId> localStart=<s> localCount=<c> origLocal=<intentOriginalLocalCount>
        #   pv68bad owner row=<ownerRow> src=<..> term=<..> ord=<..> cont=<..> edge=<..>
        #   pv68bad unitproj row=<unitRow> schedCount=<..> intentCount=<..>
        return false
```

`pv68bad range=...` 必须**复刻镜像自身的判断顺序**（R1→R5 逐个走，命中即停），并把 `cursor` 打到那一刻的值——这一个字段就能区分"空行位置"与"铺满前沿"两类死因（首选候选的指纹：`count=0`；若 `count>0` 则是尾段 hole）。

**(3) 每 body 一行路由**（放在同一 `if` 之前，**无条件打印**），用于 §5：

```cheng
    PrimaryObjectPlanTrace(Fmt"POOLPROBE pv17arm sealed={scheduleSealedFlag} empty={scheduleEmpty} present={schedulePresent} owner={scheduleOwnerCount} unit={scheduleUnitCount} intentUnit={intentUnitCount} intentExit={intentExitCount} intentSite={intentSiteCount} origBlock={intentOriginalBlockCount}")
```

> 注意 `scheduleEmpty/present` 是 bool：若 `Fmt` 不接受 bool，改用 `if x: trace "…=1" else: trace "…=0"` 展开（probe8 的既有写法，已实测可用）。

### 运行步骤（约 5–7 分钟；**须先拿到编译槽位**）

```bash
# 0) 纪律：确认 op-lane 静默（primary_object_plan.cheng mtime 静止），持 .rebuild/COMPILE_SLOT.lock 再动手；绝不 git checkout -- 该文件
python3 pb_tools/make_probe10.py                                   # 生成 + 自检 anchor 命中数
diff -u src/core/backend/primary_object_plan.cheng \
        /private/tmp/pb_probe/primary_object_plan.cheng.probe10 > probe10.patch
git apply --check probe10.patch && git apply probe10.patch          # 落盘通道（PB_report §6 口径）
# 1) 烤驱动（~200s，实测 197s）
CHENG_DISABLE_COLD_OBJECT_CACHE=1 CHENG_ENTRY_CACHE=0 CHENG_NO_CACHE=1 CHENG_STRICT_NO_CACHE=1 BACKEND_JOBS=2 \
  $HOME/.cheng-complete-0910/cheng_cold_v3 system-link-exec --root:$PWD \
  --in:$PWD/src/core/tooling/backend_driver_dispatch_min.cheng --emit:exe --target:arm64-apple-darwin \
  --out:$PWD/.rebuild/run_pb/kd_probe10 --report-out:$PWD/.rebuild/run_pb/kd_probe10.report.txt
# 2) 只跑红夹具 j2（~60-90s；绿夹具各跑一次 j2 只为拿 pv17arm 路由行）
BACKEND_JOBS=2 CHENG_DISABLE_COLD_OBJECT_CACHE=1 CHENG_ENTRY_CACHE=0 CHENG_NO_CACHE=1 CHENG_STRICT_NO_CACHE=1 \
  .rebuild/run_pb/kd_probe10 system-link-exec --root:$PWD \
  --in:$PWD/src/tests/ug_pb_cold_nested_fmt_interpolation_smoke.cheng --emit:exe --target:arm64-apple-darwin \
  --out:$PWD/.rebuild/run_pb/p10.exe --report-out:$PWD/.rebuild/run_pb/p10.report.txt 2>&1 | grep POOLPROBE
# 3) 命名存活假项
#    grep "pv68 "  → 8 个顶层 0/1
#    grep "pv68sub" → 10 个子项 0/1   ← 唯一 0 即存活假项
#    grep "pv68bad" → 该假项的原始数值（unitRow/start/count/cursor/slotId…）
# 4) 还原（git apply -R probe10.patch；grep -c POOLPROBE = 0；shasum 回 50176394…）
```

夹具源沿用 `pb_tools/ab_fixtures.sh` 的口径（拷到 `src/tests/ug_pb_<fixture>.cheng`，跑完 `rm`）。

**判读表**：

| 观测 | 结论 |
|---|---|
| `pv68sub R1=0` 且 `pv68bad range=local … count=0` | 首选候选成立 → 上修复 A |
| `pv68sub PROJCONTAIN=0` 且 `pv68bad proj … slot<localStart` | 次选成立 → 上修复 B（若 R1 亦 0 则 A+B 同轮） |
| `pv68sub R4=0`/`R5=0` 且 `pv68bad range=block\|term … count>0 cursor<…` | 尾段 hole → 走 §2 R4/R5 的 canonical `CoverageValid` 对齐（不在本次最小修复内） |
| `pv68sub EFF=0` / `OWNERLOOP=0` / `PROJCNTEQ=0` | 落到 §2 对应行的 canonical 对照分析 |

---

## ⑤ `cold_nested`/`v6` vs `ordinary`/`call_fixture` 的差异面

**结论：差异不在"多波次/嵌套专属的某个 codec 字段"，而在 field-17 状态机走的**分支**。**

代码级事实：

1. 一个 body 的 field 17 只有两条合法出路（`:68933-68948`）：`scheduleEmpty`（未封、无 owner/unit/effect/projection）或 `schedulePresent`（已封且全量自洽）。生产者侧的分叉是同构的：`cleanup_cfg.cheng:15895-15905` 在 `BodyIRCleanupIntentSidecarIsCanonicalEmpty` 时**直接 return、根本不 seal**；只有非空 intent 才走 `Begin→AppendOwner→AppendUnit→effects→BindRootCid→Seal`。
2. 已绿的 two 夹具源码是平凡程序：`ordinary_zero_exit_fixture.cheng` = `fn main(): int32 = return 0`（1 个函数）、`call_fixture.cheng` = `helper`/`main` 两个 `return 1`/`return helper()`（2 个函数）。`replay_lazy_enter n=1/2` 与函数数吻合。它们**没有托管值、没有 defer、没有 ownership action** ⟹ 池化搬运的 body 落在 **`scheduleEmpty` 臂**，**从未进入 `schedulePresent` 判据**。
3. 红的两件都带真实 cleanup：`cold_nested_fmt_interpolation_smoke.cheng` 的 `Fmt"outer={Fmt\"…\"}"` 产生托管 `str` 临时量与 return-snapshot/所有权动作；`v6_direct1_repro.cheng` 有 `ref object`、`new(...)`、`var` 参数跨调用（`outer`→`addCol`/`compute`）⟹ cleanup intent 非空、schedule 被 seal ⟹ 真正走进 present 臂。日志侧的粗印证：`replay_lazy_enter n=2/4`（=夹具函数数）与 `deferBuf=40/80`、`ownBuf=30/60`（红）vs `deferBuf=20/40`、`ownBuf=0/15`（绿）同序增长。
4. 因此 **"2/4 通过"对 present 臂零信息量**：它是"空臂不被误杀"的证据，不是"present 判据正确"的证据。present 臂在**任何测试或夹具**里都没有被跑通过——`primary_lower_pool_bodyir_prevalidate_smoke.cheng:573-601` 全程只构造 canonical-empty field 17；`git diff 69817b8b2(09-05, 四夹具 4/4 绿) HEAD -- 该文件` 只含 fix1/fix3/fix4 三个 hunk，说明 09-05 的 4/4 是在 `BACKEND_JOBS=1` 串行守卫下取得的（该 commit message 自陈"BACKEND_JOBS=1 串行守卫"），池化 present 臂自 `87f2f2e57d`（08-09）诞生起从未被验收过。
5. 唯一"只在红件出现"的**码流形态**（不是字段）：`scheduleOwnerCount > 0`、`scheduleUnitCount > 0` 的**非空 owner/unit 行**，以及随之出现的 `count == 0` 的 unit 区间行（§2 证据 (c)(d)）和 projected-slot 行（循环 C）。这些都是 present 臂的子结构，空臂里全为 0 计数。

（第 2/3 条的"绿件一定走空臂"是**强推断**，未直接观测；§4 的 `pv17arm` 路由行会给出逐 body 的 0/1 实证。）

---

## ⑥ 未解问题与不确定项

1. **存活假项未被实测命名**（本报告全部结论都是静态推理）。首选/次选的分界只能由 §4 的 `pv68sub` + `pv68bad` 决定。
2. **`snapshotSlot` 的坐标系未完全落定**：`cleanup_cfg.cheng:13460-13482` 用 `plan.exitReturnSnapshotSlots[exitId]` 作为投影槽，而该单元不追加任何 local（全文件 `add(bodyIR.localSlots,...)` 仅 4 处，均不在该路径）。我据此断言"该单元的投影槽必然落在自己 local 区间之外"，但 `snapshotSlot` 是由 preflight（`:4349-4404` 一带）在**规划坐标系**里给出的，我没有追到最终的坐标变换点——若它在材料化时被重定位进本单元区间，则次选候选的触发面会缩小（首选候选不受影响：`localCount==0` 是 `RecordScheduleUnit` 的直接算式结果）。
3. **R4/R5 的 `cursor == finalCount`（尾段精确铺满）与 canonical `CoverageValid` 的 anchor 例外谁对谁错**，取决于尾段是否存在"anchor 但无 unit 拥有"的 block/term。我读到 canonical 明确允许（`core_types.cheng:7042-7044`、`:7068-7071`），但在构建序里没找到能造出这种 hole 的路径；标为**未证伪的残余更严点**。
4. **fix3 的 `block/term → false`（放松）是否掩盖了别的坏帧**：方向上是错的（canonical `allowEmpty=false`、`AppendUnit` 对 `blockCount<=0||termCount<=0` 直接 panic），但它是放松不是收紧，不构成当前红项；上修复 A 会顺带把它收回到 canonical。
5. **C1..C7 的"dump 显示正确"是状态 A 的旧证据**（`PB_report.md:15`），未在 fix1..fix4 之后复测；严格说它们仍是"低可能性"而非"已排除"。§4 的 `pv68` 行会一次性补齐。
6. 本报告未审 `:70506` 那条接收臂的完整状态机（只确认它同样调用预校验且 decode 后无 canonical schedule 复验），若两臂的 body 集不同，红件的失败体可能只在其中一臂——探针打点建议两条臂都跑一次同一夹具。

---

# 探针判词与修复实施（2026-09-11 03:13 起执行）

锚定 HEAD `9c368085c0f0bb201ec5d5b4420ba6e254035d12`。全部改动只落在 `src/core/backend/primary_object_plan.cheng`；工作树暂存物在 `.rebuild/pool68/`（生成器 / patch / trace / 夹具产物 / 日志）。

## 一、判词（探针 clean 轮实测）

有效轮口径：`kd_probe10` sha `7f331c1fea5339e56e6397bd978b498ae329bc377900e0f3a8b64270f1c45e22`（烤自探针源 sha `e1ee86f7…`，bake `rc=0 wall=206s lease_hits=0 atomic_tree=0`）；cold_nested `BACKEND_JOBS=2` `rc=1 lease_hits=0`，trace 54 行（`.rebuild/pool68/probe.cold.j2.trace`）。

**`pv_fail stage=68` 的存活假项不是一个而是五个，跨三条独立根因**（前两条正是本报告 §① 的首选/次选候选，第三条为探针新命名）：

| 假项 | 实测数值 | 根因 | canonical 依据 |
|---|---|---|---|
| `R1` local 区间 | 体A `local=20/0 ×4`；体B `local=10/0 ×4` | `f8f4ab66c` fix3 把 `requirePositive` 极性反转 | `bodyIRCleanupRangeValid(...,allowEmpty=true)`（`core_types.cheng:6641`） |
| `R3` call 区间 | 体A `call=16/0,16/0`；体B `call=5/0 ×3` | 同上 | `allowEmpty=true`（`:6651`） |
| `PROJCONTAIN` | 体A `proj slot=18`、unit0 `localStart=20 localCount=0`、`origLocal=20` | 镜像缺 `preallocatedInSource` 分支 | `core_types.cheng:5913-5915` |
| `R4` block 区间 | 体A block 起点 `2,3,4,6`、`origBlock=1`、`blockCount=7` ⇒ 空洞 1、5；体B 空洞 5、6、9 | 镜像要求精确铺满尾段（`:67736 cursor == finalCount`） | `CoverageValid` 允许「anchor 但无 unit」（`:7042-7044`） |
| `R5` term 区间 | 同型（1、5） | 同上 | `:7068-7071` |

原始 0/1（体A / 体B）：`C1..C7 全 1、C8=0`；`R1=0 R2=1 R3=0 R4=0 R5=0 R6=1 R7=1`；`OWNERLOOP=1 PROJCNTEQ=1`；`PROJCONTAIN=0`（体A）/`1`（体B）。

```
pv68unit A  row0 local=20/0 op=23/1 call=14/1 block=2/1 term=2/1 proj=0/1 intentSnap=1
            row1 local=20/0 op=24/2 call=15/1 block=3/1 term=3/1 proj=1/0
            row2 local=20/0 op=26/1 call=16/0 block=4/1 term=4/1 proj=1/0
            row3 local=20/0 op=27/1 call=16/0 block=6/1 term=6/1 proj=1/0
pv68proj A  off=0 slot=18        (origLocal=20 origBlock=1 blockCount=7 termCount=7 projCount=1)
pv68owner A row0 src=1 term=0 ord=0 cont=5 edge=1 ; row1 src=0 term=1 ord=0 cont=1 edge=1
pv68unit B  local=10/0 ×4 ; op=10/2,12/1,13/1,14/2 ; call=4/1,5/0,5/0,5/0 ; block=7/1,8/1,10/1,11/1
pv68owner B row0 src=4 cont=9 ; row1 src=0 cont=5 ; row2 src=5 cont=6
```

**第三条根因的机理（探针新命名，非原两候选）**：block/term 的空洞正是 owner row 的 continuation：体A `cont=5`、`cont=1`；体B `cont=9,5,6`。canonical `bodyIRCleanupScheduleCoverageValid` 的规则是「尾部每行 owned ⟺ !anchor」（owned>1 非法），anchor = 某 owner 的 `src`/`cont` —— 这正是 §⑥-3 里"没找到能造出 hole 的构建路径"的证伪：hole 是结构性的，不是异常。镜像用 `cursor == finalCount` 近似覆盖，把合法 hole 判死。

**绿夹具路由实证（坐实 §⑤）**：`ordinary` j2 **0 行探针**（body 根本没进该接收路径）；`call` j2 **2 行 `pv17arm` 全 `sealed=0 owner=0 unit=0 intentUnit=0`**（canonical-empty 空臂）。⇒ "2/4 通过"对 present 臂零信息量，由实测而非推断确认。

## 二、修复实施（工作树，未 commit）

| 修复 | 内容 | 依据 |
|---|---|---|
| A | `:68876/:68879/:68882 → false`、`:68885/:68888 → true`（`requirePositive = !allowEmpty`） | 父席独立代码级复核：canonical 五处 `allowEmpty` = `true,true,true,false,false`（`core_types.cheng:6641/6646/6651/6656/6660`）。根因归属：`f8f4ab66c` 的 fix3 依据了"canonical 对 block/term 传 true、对 local/op/call 传 false"这一**恰好反了**的前提，属**参数名语义相反时未取反**的错误 |
| B | `:68925-68930` 包含性判据补 `preallocatedInSource`（越界**且** `slotId >= intentOriginalLocalCount` 才判死） | `core_types.cheng:5910-5915` |
| C | field-4 逐 block 读 4×u32 保留 `termIndex`（原为 `cursor += blockCount*16` 整段跳过）；新增 `primaryLowerPoolNonEmptyRangesValid` + `primaryLowerPoolBlockCoverageValid` + `primaryLowerPoolTermCoverageValid`；block/term 的 tiling 两项替换为 `pvBlockRangesValid && pvBlockCoverageValid && pvTermRangesValid && pvTermCoverageValid`；local/op/call 保持 tiling（canonical coverage 蕴含之） | `core_types.cheng:6652-6690`（per-unit + 有序不重叠）、`:7027-7071`（anchor 覆盖）、block 记录布局 `backend2_frag_codec.cheng:1337-1347` |
| D | field-3 逐 slot 增留 `typeKind`(w0)/`typeArenaTypeId`(w1)/`managedStorageKind`(w2)；intent 快照行判据 `intentSnapshotTypeArenaTypeIds[row] < 0 → false` 替换为 canonical 的两段：`(typeId < 0 && !noProofAdmitted)` + `typeId != 源槽 typeArenaTypeId`（`noProofAdmitted = 源槽 typeId<0 && managedStorageKind==Unknown && BodyIRLocalTypePlainNoAliasProof(typeKind)`） | `core_types.cheng:5238-5251`（canonical `BodyIRCleanupIntentSidecarShapeValid`）+ `:8638-8641`（`BodyIRCleanupIntentSnapshotSourceNoProofAdmitted`）+ `:8409-8416`（`BodyIRLocalTypePlainNoAliasProof`） |

产物（最终态 **A+B+C+D**）：`fixABCD.patch`（6 hunks）sha256 `28bb785dcf60a1da1eb06d6c7530fcdf3d7855baaabb7f3fbaf3a7939a4c4c07`，应用后文件 sha256 `707f085cc0d5e639d656f7125c43e59ccbc8cc4daa4022f28eb8ee8e7cda36f4`，`git diff --stat` = 178 insertions / 18 deletions（仅该文件）；`kd_fixABCD` sha256 `ba1373b722623623e29cf591a7f921a9817a858bc2acfcb9aa6d9c8fd436eb26`（bake `rc=0 wall=203s lease_hits=0 atomic_tree=0`，`real_backend_codegen=1`）。中间态留档：`fixAB.patch` sha `c658ee37…`（13+/8−，文件 `5caffff6…`）、`fixABC.patch` sha `0ea5f652…`（142+/14−，文件 `a25cfb87…`）。

### 追加根因（v6 专用，非 stage-68）

`probe11`（建在 fixABC 源码上：全量 stage 编号 + `pv_tag` 逐 tag + 帧路径标记；`kd_probe11` sha `d05cd3e0…`，clean 轮）实测：v6 池化批 4 个 body，前三个（payloadLen 4539/3370/5735）全走空臂并通过；**第 4 个（slot=3，payloadLen=19584）在 `pv_tag tag=17 cursor=12436` 之后 `pv_fail stage=66`** ⇒ 失败点是 `if !intentEmpty && !intentPresent`（**cleanupIntent 臂**，fixABC 文件 `:68858`），与 schedule 段无关；随后 `frame_commit_reject slot=3 bodyStatus=1` → `slot_missing` → `recv_reject frameProtocolFailure=1`。⇒ PB 报告把 cold_nested 与 v6 归为"同一处 stage=68"是混同：**cold 是 schedule 臂（A+B+C 修好），v6 是 intent 臂的另一处镜像缺陷**。

`probe12`（intent 臂逐项 0/1 + 逐行 dump；`kd_probe12` sha `e87884e0…`，clean 轮）点名存活假项：`present=0` 而 `sealed1/rootNZ/srcCtrlNZ/ownIrNZ/ownAnalysisNZ/origBlockPos/origTermPos/unitPos/exitSitePos=1`、`ccountsLe=1`、**6 个 CSR 子项全 1**、`rows=0` ⇒ 假项在 `intentRowsValid` 的**逐行循环**里。逐行 dump 一锤定音：4 条 snapshot 行 `slot=15/25/35/36 policy=2 semRow=0..3 typeId=-1`，而镜像判据是 `intentSnapshotTypeArenaTypeIds[row] < 0 → intentRowsValid = false`。canonical（`core_types.cheng:5238-5251`）对同一列是「与**源槽**的 `typeArenaTypeId` 相等」且「负值仅当 `BodyIRCleanupIntentSnapshotSourceNoProofAdmitted`（`:8638-8641`：源槽 typeId<0 ∧ managedStorageKind==Unknown ∧ `BodyIRLocalTypePlainNoAliasProof(typeKind)`，`:8409-8416`）成立时放行」——即 i32 guard flag 槽（`cleanup_cfg.cheng:13165` 强制 `LocalI32Tag`）本来就会给出 `-1`。镜像把它一刀切成 `<0 即非法`，是**第四处与 canonical 不一致的过严判据**（与 A/B/C 同类：镜像重写派生列判据时漏掉 canonical 的允许分支）。

## 三、验证状态

**A 侧基线（有效，`kd_base` sha `51503e86…`，烤于 03:14 干净树）**——口径更正：`--out` 路径会进 exe 的 proofDigest，**不同 out 路径造成 exe 96 字节假差异**（实测 offset 7393801 起 96 字节）；`runset.sh` 因此对每次运行使用**同一个固定 `--out` 路径**：

| 夹具 | j1 | j2 | j1/j2 exe | primary.o |
|---|---|---|---|---|
| ordinary_zero_exit_fixture | rc=0 `dbc2eeef…` | rc=0 `dbc2eeef…` | **IDENTICAL** | `7b594c89…` 同 |
| call_fixture | rc=0 `806a2d1d…` | rc=0 `806a2d1d…` | **IDENTICAL** | `99cfc83f…` 同 |
| cold_nested_fmt_interpolation_smoke | rc=0 `d28e5916…` | **rc=1 无产物** `primary_lower_pool_batch_receive_failed` | INCOMPLETE | j1 `d539418c…` |
| v6_direct1_repro | rc=0 `5f53f8eb…` | **rc=1 无产物** 同判词 | INCOMPLETE | j1 `f7908eeb…` |

`v6` 的 768MiB 资源门：03:2x 一轮 `rc=125 rss_bytes=843433136 limit_bytes=805306368`（与并行烤机同窗），**05:0x 同门同夹具 j1 `rc=0`** ⇒ 该门是**载荷相关的偶发**（并发烤机时触发），不是确定性回归；为稳妥另跑 8 GiB 抬门系列（`runset.*g`），结论与默认门一致。

**B 侧（最终态 `kd_fixABCD` sha `ba1373b7…`，固定 `--out` 口径，与 A2 同路径同参）——四夹具 jobs=1/2 全绿：**

| 夹具 | j1 | j2 | j1/j2 exe | A2 vs B3 `cmp`（exe / primary.o） |
|---|---|---|---|---|
| ordinary_zero_exit_fixture | rc=0 `dbc2eeef…` | rc=0 `dbc2eeef…` | **IDENTICAL** | **IDENTICAL / IDENTICAL** |
| call_fixture | rc=0 `806a2d1d…` | rc=0 `806a2d1d…` | **IDENTICAL** | **IDENTICAL / IDENTICAL** |
| cold_nested_fmt_interpolation_smoke | rc=0 `d28e5916…` | rc=0 `d28e5916…` | **IDENTICAL** | j1 **IDENTICAL** / IDENTICAL；j2 SKIP（A 侧无产物=正是"由红转绿"） |
| v6_direct1_repro | rc=0 `5f53f8eb…` | rc=0 `5f53f8eb…` | **IDENTICAL** | j1 **IDENTICAL** / IDENTICAL；j2 SKIP（同上） |

- 四夹具 run_rc：ordinary 0 / call 1（夹具契约）/ cold 0 / v6 0；`v6` 8 GiB 抬门系列（B3g）与默认门结论一致（j1=j2=`5f53f8eb…`）。
- **结论：已修复（四夹具全绿）**；且 ordinary/call/cold-j1/v6-j1 的 exe 与 primary.o 与修复前**逐字节相同** ⇒ 本修复不改变发射字节（纯接收侧判据），串行臂语义不受影响（该函数只在 `:69966`/`:70506` 池化接收路径被调用）。
- 判词演进（每步都绑定 clean 轮）：A+B+C 使 cold_nested 转绿、v6 仍红 → probe11 点名 v6=intent 臂 stage 66 → probe12 点名 `typeId=-1` 被判死 → 加 D → 四夹具全绿。**C 未回退**（cold 的转绿就是它的证据；v6 的红与它无关）。

**门禁**（最终 ABCD 态、`$STAGE3=artifacts/bootstrap/cheng.stage3`）：`move_into_field_completeness` rc=0 `result: PASS`；`backend2_plugin_cache_gate` / `backend2_plugin_cid_gate` / `backend2_plugin_trade_gate` 全 rc=0 `gate=PASS`。（ABC 态与 A+B 态同样 4/4 PASS。）

## 四、纪律回执（含口径变更与理由）

1. **陈旧锁实测并清理**：`owner.txt` owner_pid=22677（purpose=authfix phase2）已死 ⇒ 读 pid → `ps -p` 确认不存在 → `rm -rf` **一次** → 重 `mkdir`。本轮另清理了我自己 phase1 留下的陈旧锁（pid 15990 随任务取消而死）。协作式 mkdir 锁在持锁 agent 被终止时会堵死后续线——这是实测缺口，建议后续在锁目录内写入"心跳 mtime"以便区分"活着但空闲"和"已死"。
2. **锁优先级**：purpose=`authfix` / S1b 回归且 owner 存活时全程让位（04:23–04:48 共 46 轮；05:20 起 63+ 轮），未抢跑。
3. **他线无锁烤机导致的作废轮**：`rebake_v3.sh m73x/m73y`、`run_m73x/kernel_driver`、`run_b5/kd` 均不建锁并发烤机。作废轮（`os atomic tree: parent lease unavailable`）：probe.cold/ordinary/call 各一次、v6 j2.A 一次、探针首轮 B 侧三夹具各一次。**口径变更（04:2x，父席指令）**：弃"等 90s 静默窗"（在该对手面前无限饥饿，实测连续采样 `busy=2 owner=none quiet_streak=0`），改为**锁空即抢 + 以 workspace-root 原子树租约为唯一有效性判据**；撞租约轮一律作废重跑（K=6，记 attempt+时间戳+rc+原文）。有效轮均为 **attempt=1**。
4. **探针口径发现（后必写进探针手册）**：`PrimaryObjectPlanTrace` **不写 stderr**，它 append 到环境变量 `CHENG_PRIMARY_OBJECT_TRACE` 指定的文件（`primary_object_plan.cheng:240-264`，另有 `CHENG_PRIMARY_OBJECT_TRACE_FILTER`）。本轮第一次 B 侧因此"stderr 3 行、0 条 POOLPROBE"；补上该 env 后同一次运行即得 54 行 trace。
5. **未 commit、未碰他线文件**：全程 `diff -u → git apply --check → git apply`；撤回只用 `git apply -R`（未用 `checkout --`/`restore`/`stash`）。他线 04:39 落入共享树的 `backend_driver_dispatch_min.cheng`（+323/−2 自烤理论账本）曾使**整树不可烤**：`cheng_cold: call argument transfer authority caller=BackendDriverDispatchMinAppendSelfbakeTheoryLedgerReport callee=…TheoryLedgerLineInt64 … def_ownership=2 row_ownership=2 live=0` + `primary object emit failed`；我把 fix 整段 `git apply -R` 还原后原样再烤得 `rc=2 wall=2s` **同一判词、lease_hits=0**，证明与本修复无关，随后由父席将该文件回退（现 sha `5d5538d9…` = HEAD）。

## 五、后续防回归项（本轮不做）

**present 臂零测试覆盖是 fix3 反转没被门禁抓住的直接原因**：`src/tests/primary_lower_pool_bodyir_prevalidate_smoke.cheng:573-601` 全程只构造 **canonical-empty field 17**（"tag(4)+608 字节"），全仓 `grep -rn "BodyIRCleanupScheduleAppendUnit\|BodyIRCleanupScheduleBegin" src/tests/*.cheng` = 0 命中 ⇒ 任何非空 schedule 的池化预校验都没有测试。建议补一条 smoke：用 `BodyIRCleanupScheduleAppendUnit` 造出「空 local/op/call 行 + owner continuation anchor 空洞 + 预分配投影槽」三形态密封体，`Backend2BodyIrEncode` 后断言 `PrimaryLowerPoolBodyIrPayloadPrevalidate` 为真——否则下次任一侧漂移仍会静默。
