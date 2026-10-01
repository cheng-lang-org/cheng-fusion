# 纯 Cheng RSI 剩余批次侦察 + 批次九（前瞻预算账本 engine 接线）实施报告

日期：2026-09-11（03:1x-03:4x CST）。执行席：RSI 批次子代理。
侦察起点 HEAD：`2cad214d7`；本轮期间他线两次 docs 推进 HEAD 至 `9f4d1c88b`（均未触本席 4 文件：补丁对新 HEAD 仍 `git apply --check -R` 通过，4 文件 sha256 与本席修改副本逐字节相等）。报告内所有 `文件:行` 锚点均在本轮工作树上 `grep` 复核。
改动面：`src/rsi/engine.cheng`、`src/rsi/promotion.cheng`、`src/tests/rsi_contract.cheng`、
`src/tests/rsi_recursive_e2e.cheng`。**零编译动作、零编译槽位占用、无 commit/push/分支/worktree**。
本报告是本次唯一新增文档文件（其余 docs 一律未触碰）。

---

## ① §8.1 批次 2-8 当前状态表

口径：`已入库` = 有 commit 实测证据且当前树在位；`设计在案` = 只有设计/patch 文档；
`未实施` = 无实现无测试；`本批实施` = 已落工作树（未 commit）。

| # | 批次 / 内容 | 证据（commit · 当前树锚点） | 状态 |
|---|---|---|---|
| 1 | **批次二（09-08）** trials 记账改图上事实派生、M 超参规则 0..3、多任务评价集三变体、gate 挂进程树 RSS 腿 | `27f8fc32b`（09-08 18:06，src/rsi 12 模块 + main + contract 首落）；门禁文件首现 `0bdd08af6`（09-08 11:36，+509）；RSS 腿 `src/tools/rsi_gate.cheng:497 appendCheck("rsi_rss_guard", ...)`；768MiB 帽 `895b0ad2c`（09-08） | 已入库 |
| 2 | **M 档位竞争 + 收敛可证化（09-08）** `exhausted` 审计子命令（覆盖矩阵 + incumbent 对拍） | `27f8fc32b`（提交信息含 "exhausted 审计腿"）；当前树 `src/apps/rsi/main.cheng:165 if stage == "exhausted":` | 已入库 |
| 3 | **批次三（09-08）** 双域合流、M 规则 0..4、账本 v2 双域聚合、`EXHAUSTED 22/22`、gate 10/10 | `27f8fc32b` 提交信息："生产谱系 gen=3 EXHAUSTED(22/22, incumbent_min=2254)；门禁 rsi_gate 10/10"；`RsiTrialTable` 首现同 commit（`state.cheng`） | 已入库 |
| 4 | **批次四（09-08）** 编译器域 C1/C2 试验线 + 测量合同 v1.1 冻结 + 语义锚（rc+stdout sha） | `src/rsi/compiler_domain.cheng:1`（"编译器域 C1/C2 试验线 (批次四)"，随 `27f8fc32b` 入库）；`docs/campaigns/2026-09-07-pure-cheng-rsi/compiler_domain_c1c2_contract.md`；文档/帽口径跟进 `00ac594bb`、`895b0ad2c` | 已入库 |
| 5 | **批次五（09-09）** C1 首轮 A/B 真实入图（genesis `best_us=1130937` + `BACKEND_JOBS=2` 语义锚拒收 `sha_mismatch`）、语料档三修（tier0=`src/tests/rsi_minimal_smoke.cheng` CID `ef548daa…`）、`0..<200` 六层墙、GEN2 载具环 | `6b2abd531`（09-09）、`c26e21fe9`（cdomain verify 接线）；回执 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/cdomain_current.txt` + `cdomain_events.log` | 已入库 |
| 6 | **批次六（09-09→09-10）** 任务域 v3 数论域（GCD 四族 + 值敏感金标五路互证 `0239c2ae`）、jobs 全 3 格扫描封闭（jobs4/jobs2 无严格增益 reject）、BIGSRC-SPLIT intern 字节核算 | `b6a6a8232`、`009f8c7c8`、`31a806fee`（均 09-09）；当前树 `src/rsi/types.cheng:49 RsiTaskDomainGcd = 3` | 已入库 |
| 7 | **批次七（09-10）** v3 真实入图（`22963→13450→3937`、`EXHAUSTED 26/26`、在位 `2254`）、v2→v3 store 显式代际迁移、LLM 生成器适配器（`kept=0` 如实）、判词 48/50/52 根修、gate 11/11×2 | `9dd7a2bcd`（09-10）；回执 `receipts/batch7_receipt.txt` / `batch7_migration.txt` / `batch7_gate.txt` / `batch7_llm_live.txt` | 已入库 |
| 8 | **批次八前半（09-10）** 任务域 v4 变更空间 26→31 格（快排三档 `1557/1589/1718`、分块宽 4 `10587`、扩展欧几里得 `11781`）、观测表 19 槽、私账本 `EXHAUSTED 31/31`、生产 epoch 全拒诚实终态 | `dacd3d28e`（09-10）；当前树 `src/rsi/generator.cheng:1`（"v4 三任务域 31 格扩展"）、`generator.cheng:913`（"覆盖 31/31 格"）、`src/rsi/model.cheng:5`（表容量 19）；回执 `receipts/batch8_domain_v4.txt` + `batch8_production_backup/` | 已入库 |
| 9 | **§5 步2/步5 补齐（09-10 晚）** 提交边界中断负例、双写者拒绝目录锁、前瞻预算配对账本（**engine 未接线**） | `f92f573f2`（09-10 19:47）；当前树 `src/rsi/store.cheng:499-794`（锁）、`store.cheng:629`（Acquire）、`store.cheng:765`（Guarded 提交）、`src/rsi/promotion.cheng:29-114`（账本） | 已入库（含两条未接线缺口，见 #10/#11） |
| 10 | **批次八后半** | `grep -rn "批次八后半\|批次九" docs/ openspec/ src/rsi/` = **0 命中**（除本报告）；§8.1 只记到"前半"；无设计文档、无 commit、无工作树改动 | **未定义 / 未实施** |
| 11 | **§5 步5 engine 接线**（前瞻预算账本接生产裁决） | proposal:107 明文"**engine 未接线，仍走旧入口**，如实标注"；静态扫描：账本 API 家族 7 函数在 src/rsi 生产闭包 0 调用（`RsiLookaheadChargeInto`/`LedgerInitInto`/`ParentSpent`/`LookaheadSpent`/`TotalSpent`/`MetaPromotionDecideBudgeted` 只被 `rsi_contract.cheng` 调用） | **本批实施**（工作树，未 commit） |
| 12 | **§5 步3 负例**「进程逃逸、越界读写」 | proposal:101 verify 列点名；仓库内无对应负例/判据实现（`execution.cheng` 31 行，仅 argv 执行与清理） | **未实施** |
| 13 | **store 写会话锁生产接线**（本席侦察新发现，非提案点名） | `RsiStoreCommitVersionGuarded`(`store.cheng:765`) 与 `RsiStoreWriteLock*`(`store.cheng:629/730`) 仅被 `rsi_contract.cheng:984-1067` 调用；engine 四处提交仍走裸 `RsiStoreCommitVersion`（`engine.cheng:366/599/765/833`） | **未接线** |
| 14 | **§8.2⑥ DarwinAuthority M1/M2/M4**（纯代码接线） | 设计+骨架在案：`docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md`、`.../probes/darwin_authority/DESIGN.md` + `darwin_authority_skeleton.patch`；判词 54/56；**改动面 = `src/core/runtime/program_support_backend.cheng`** | 设计在案，**本席禁区**（禁动 src/core/**） |
| 15 | **§8.2⑥ M3 安装面 / 档 1-2 语料墙 / C3-C5 恒拒** | `design/m3_install_surface_plan.md`；proposal:163-167；`artifacts/rsi_compiler` 不在盘（§6:118，回执存证）；档 1 撞 stage3 `@borrows cloneReceipt`、档 2 撞 GEN2 覆盖墙 | 阻塞（须 kernel 战役 / 用户裁决 / 系统安装面） |

**结论（哪几批已完成、剩余什么）**：批次 2-7 与批次八前半**全部已入库**（§8.1 描述与 git 一致，未发现"写了设计但没实现"的批次）；批次 2-8 范围内**没有**"已设计未实现"的项；
剩余项分三类：(a) **本批清偿** = §5 步5 engine 接线；(b) **RSI 车道内可做但未做** = §5 步3 负例（无隔离实现，实质需 kernel 面）、store 锁生产接线（新发现）；(c) **不在本席改动面** = DarwinAuthority M1/M2/M4（src/core）、M3 安装面、档 1/2 语料墙、C3-C5。

---

## ② 选定批次与理由

**选定：批次九 = §5 步5「前瞻预算配对账本」engine 接线**（`src/rsi/engine.cheng` meta 块）。

理由（按权重）：

1. **它是提案唯一以文字点名的剩余实现项**：proposal:107 逐项对照里，步 1/4/6 完整、步 2 负例已补齐、步 7 已建文件，唯独步 5 写明"engine 未接线，仍走旧入口"。§5 步5 的 verify 列要求"决策可由实际执行回执独立重算，**所有前瞻开销计入预算**"——接线前第二分句在生产侧为假。
2. **静态证据确凿**：前瞻账本 API 家族 7 个函数（`promotion.cheng:48/53/55/81/85/89/94` 一代）在生产闭包内 **0 调用**，只被合同冒烟调用（test-only 扫描：prod_occ=1=仅定义，test_occ≥1）。这不是"没写"，是"写了没接"。
3. **改动面完全落在允许范围**：只动 `src/rsi/**` + 该批测试文件，不触 `src/core/**`、`bootstrap/**`。
4. **判据可达、可伪证**：接线后 meta 裁决由"严格更优即接受"变为"账本不全一律不得接受"；回执行新增两臂开销与子预算三元组，审计可独立重算。
5. **不选其它候选的理由**：DarwinAuthority M1/M2/M4 改动面在 `src/core/runtime/program_support_backend.cheng`（禁区）；store 锁生产接线同样是真缺口，但需跨 engine **全部 return 路径**的会话级锁生命周期设计（lease/释放/异常路径），在无编译槽位下静态一次成型风险显著更高，列为**批次十候选**（见 §⑥.5）。

---

## ③ 改动前后原文对照（unified diff）

补丁：4 文件，`+85 / -11`。sha256 = `bff137ec1d4e03139ce88be7c3a475727576261c7e72b52226b71bbfadf9fa11`。
本文内嵌副本为准（工作树即真相，可用 `git diff -- src/rsi/ src/tests/rsi_contract.cheng src/tests/rsi_recursive_e2e.cheng` 逐字节重生成）。

```diff
--- a/src/rsi/promotion.cheng	2026-09-11 03:15:02
+++ b/src/rsi/promotion.cheng	2026-09-11 03:15:10
@@ -10,11 +10,12 @@
 # 账本把两臂开销都计入总预算 (total = parent + candidate), 前瞻臂不免费:
 # 带账本裁决要求两臂各耗尽同额子预算才有效 (同起点同预算对照), 否则
 # 对照无效 -> RsiMetaComparisonInvalid, 不接受推进。
-# 审计口径 (2026-09-10): engine.cheng 的前瞻块 (M' 改进器 + 后继评价)
-# 此前只落 trials/facts 记账, 未接入总预算账本; 本模块提供账本入口与
-# 判据, 引擎侧接线点 = engine.cheng 前瞻块 (每臂 charge 1 次改进器 +
-# 每次后继候选 charge 1)。接线前的旧判词入口 RsiMetaPromotionDecide
-# 保持原语义不变 (不静默改变生产行为)。
+# 审计口径 (2026-09-10 立项, 批次九接线): engine.cheng 前瞻块 (M' 改进器 +
+# 后继评价) 此前只落 trials/facts 记账; 现已接入本账本 —— 每臂 charge 1 次
+# 改进器编译运行 + 每次后继候选编译运行 charge 1, 子预算由
+# RsiLookaheadPerArmUnits 从 maxCandidates 派生。旧判词入口
+# RsiMetaPromotionDecide 保留 (无账本 = 无预算证据), 引擎生产裁决一律走
+# RsiMetaPromotionDecideBudgeted: 两臂未同额耗尽 = 对照无效, 不得接受。
 import cheng/rsi/types as types
 
 # M-试验元评价决策: parentBest = 当前 M 的后继最优分, candidateBest = M' 的。
@@ -41,6 +42,14 @@
         parentUnits: int64
         candidateUnits: int64
 
+# 每臂子预算的唯一派生点 (批次九引擎接线): 1 次改进器编译运行 +
+# maxCandidates 次后继候选编译运行。引擎前瞻块与合同冒烟共用本函数,
+# 约定不靠两处字面量各写一份 (改预算口径只需改这里)。
+fn RsiLookaheadPerArmUnits(maxCandidates: int32): int64 =
+    assert(maxCandidates > 0,
+           "rsi lookahead: max candidates must be positive")
+    return int64(maxCandidates) + int64(1)
+
 fn RsiLookaheadLedgerInitInto(perArmUnits: int64,
                               outLedger: var RsiLookaheadLedger) =
     # 预算必须为正且有限 (提案 §5: 预算为零不是合法状态)。
--- a/src/rsi/engine.cheng	2026-09-11 03:15:02
+++ b/src/rsi/engine.cheng	2026-09-11 03:15:19
@@ -701,8 +701,44 @@
                     if best2Row >= 0:
                         # 候选 A 不低于父代 (本轮接受后 parentScore 即最优聚合分)。
                         let aQualified = bestScore <= parentScore
-                        let metaAdmit = promotion.RsiMetaPromotionDecide(
-                            aQualified, bestScore, best2Score)
+                        # 前瞻预算配对账本接线 (提案 §5 步5「所有前瞻开销计入
+                        # 预算」): 每臂子预算 = 1 次改进器编译运行 +
+                        # maxCandidates 次后继候选编译运行 (由
+                        # RsiLookaheadPerArmUnits 派生); 两臂按本轮实际编译
+                        # 运行的后继候选数逐笔记账 —— 父代臂 = 本轮改进器
+                        # (上已跑) + 本轮实际评价的后继候选 (含 LLM 适配器
+                        # 追加的提案), 候选臂 = M' 改进器 + 其后继候选。
+                        # 超支硬拒不截断; 两臂未同额耗尽 = 对照无效 ->
+                        # 不得接受 M 变更 (与旧入口唯一行为差别)。
+                        let perArmUnits = promotion.RsiLookaheadPerArmUnits(
+                            budget.maxCandidates)
+                        var laLedger: promotion.RsiLookaheadLedger
+                        promotion.RsiLookaheadLedgerInitInto(perArmUnits,
+                                                             laLedger)
+                        var laCharged: int32 = 0
+                        let parentSuccUnits: int64 = int64(picksS.len)
+                        let candSuccUnits: int64 = int64(picksS2.len)
+                        promotion.RsiLookaheadChargeInto(
+                            laLedger, promotion.RsiLookaheadArmParent, int64(1),
+                            laCharged)
+                        promotion.RsiLookaheadChargeInto(
+                            laLedger, promotion.RsiLookaheadArmParent,
+                            parentSuccUnits, laCharged)
+                        promotion.RsiLookaheadChargeInto(
+                            laLedger, promotion.RsiLookaheadArmCandidate,
+                            int64(1), laCharged)
+                        promotion.RsiLookaheadChargeInto(
+                            laLedger, promotion.RsiLookaheadArmCandidate,
+                            candSuccUnits, laCharged)
+                        let parentUnits =
+                            promotion.RsiLookaheadParentSpent(laLedger)
+                        let lookUnits =
+                            promotion.RsiLookaheadLookaheadSpent(laLedger)
+                        let perArmText = strings.Int64ToStr(perArmUnits)
+                        let parentUnitsText = strings.Int64ToStr(parentUnits)
+                        let lookUnitsText = strings.Int64ToStr(lookUnits)
+                        let metaAdmit = promotion.RsiMetaPromotionDecideBudgeted(
+                            aQualified, bestScore, best2Score, laLedger)
                         if metaAdmit == types.RsiAdmitAccept:
                             var metaRootPre: str
                             var metaRootPreOk: int32 = 0
@@ -739,7 +775,10 @@
                                                         Fmt"gen={gen + 1}",
                                                         Fmt"m_strategy={mCandidate}",
                                                         Fmt"m_parent_best={pBestText}",
-                                                        Fmt"m_candidate_best={cBestText}"], " ")
+                                                        Fmt"m_candidate_best={cBestText}",
+                                                        Fmt"per_arm_units={perArmText}",
+                                                        Fmt"parent_units={parentUnitsText}",
+                                                        Fmt"candidate_units={lookUnitsText}"], " ")
                             if !engineEmit(Fmt"{eventsPath}", digest, payload):
                                 return 3
                             var dseq: int32 = 0
@@ -754,10 +793,19 @@
                         else:
                             let pBestText = strings.Int64ToStr(bestScore)
                             let cBestText = strings.Int64ToStr(best2Score)
-                            let payload = strutil.Join(["event=meta_rejected",
+                            # 账本不全 (对照无效) 与真实不占优分开记: 前者是
+                            # 预算证据缺失, 后者是严格更优判据不成立; 两者都
+                            # 落同一条 reject 决策事实 (试验不留未决)。
+                            var metaEvent: str = "event=meta_rejected"
+                            if metaAdmit == promotion.RsiMetaComparisonInvalid:
+                                metaEvent = "event=meta_comparison_invalid"
+                            let payload = strutil.Join([Fmt"{metaEvent}",
                                                         Fmt"gen={gen}",
                                                         Fmt"m_parent_best={pBestText}",
-                                                        Fmt"m_candidate_best={cBestText}"], " ")
+                                                        Fmt"m_candidate_best={cBestText}",
+                                                        Fmt"per_arm_units={perArmText}",
+                                                        Fmt"parent_units={parentUnitsText}",
+                                                        Fmt"candidate_units={lookUnitsText}"], " ")
                             if !engineEmit(Fmt"{eventsPath}", digest, payload):
                                 return 3
                             var dseq: int32 = 0
--- a/src/tests/rsi_contract.cheng	2026-09-11 03:15:02
+++ b/src/tests/rsi_contract.cheng	2026-09-11 03:15:23
@@ -109,7 +109,13 @@
     #     无效不得接受 ---
     # 引擎前瞻块每臂真实开销 = 1 次改进器编译运行 + maxCandidates 次后继
     # 候选编译运行; 这里按 budget.maxCandidates(=3) 实例化: perArm = 4。
-    let laPerArm = int64(1 + budget.maxCandidates)
+    # 批次九: 该口径收敛到 promotion.RsiLookaheadPerArmUnits, 引擎前瞻块与
+    # 本合同冒烟共用同一派生函数 (接线点 engine.cheng meta 块); 下面用字面量
+    # 反查派生值, 防约定与实现漂移。
+    let laPerArm = promotion.RsiLookaheadPerArmUnits(budget.maxCandidates)
+    assert(laPerArm == int64(1 + budget.maxCandidates), "rsi lookahead: per-arm convention derives from maxCandidates")
+    assert(laPerArm == int64(4), "rsi lookahead: maxCandidates=3 -> perArm=4")
+    assert(promotion.RsiLookaheadPerArmUnits(1) == int64(2), "rsi lookahead: minimal per-arm = improver + one successor")
     var laLedger: promotion.RsiLookaheadLedger
     promotion.RsiLookaheadLedgerInitInto(laPerArm, laLedger)
     let laZero = promotion.RsiLookaheadTotalSpent(laLedger)
--- a/src/tests/rsi_recursive_e2e.cheng	2026-09-11 03:15:02
+++ b/src/tests/rsi_recursive_e2e.cheng	2026-09-11 03:15:27
@@ -116,6 +116,17 @@
     assert(evLen > 0, "rsi e2e: events log written")
     let metaIdx = e2eIndexOfFrom(Fmt"{eventsText}", "event=meta_accepted", 0)
     assert(metaIdx >= 0, "rsi e2e: one-step lookahead accepted M0->M1")
+    # 3b) 前瞻预算配对账本接线 (批次九): meta_accepted 行必须带两臂开销与
+    #     子预算。本轨迹无 LLM 提案源且 --max-candidates:4, 故两臂各 =
+    #     1 次改进器 + 4 次后继候选 = 5 (同起点同预算对照的真实回执;
+    #     账本不全时该事件不可能出现 —— 对照无效一律拒收)。
+    let metaLineEnd = e2eIndexOfFrom(Fmt"{eventsText}", "\n", metaIdx)
+    assert(metaLineEnd > metaIdx, "rsi e2e: meta_accepted line terminated")
+    let metaLine = strings.CloneStrRange(Fmt"{eventsText}", metaIdx,
+                                         metaLineEnd - metaIdx)
+    assert(e2eIndexOfFrom(Fmt"{metaLine}", "per_arm_units=5 ", 0) > 0, "rsi e2e: meta receipt records per-arm sub-budget 5")
+    assert(e2eIndexOfFrom(Fmt"{metaLine}", "parent_units=5 ", 0) > 0, "rsi e2e: meta receipt charges parent arm 5")
+    assert(e2eIndexOfFrom(Fmt"{metaLine}", "candidate_units=5", 0) > 0, "rsi e2e: meta receipt charges look-ahead arm 5")
     let preAcc = e2eIndexOfFrom(Fmt"{eventsText}", "event=version_accepted", 0)
     assert(preAcc >= 0 && preAcc < metaIdx, "rsi e2e: M0 successor accepted before meta swap")
     let postTrial = e2eIndexOfFrom(Fmt"{eventsText}", "event=trial_evaluated",
```

改动语义摘要：

- `promotion.cheng`：审计口径注释现势化（"未接线"→"已接线"）；新增 `RsiLookaheadPerArmUnits(maxCandidates)`（`promotion.cheng:48`）作为每臂子预算的**唯一派生点**（= `1 + maxCandidates`），引擎与合同冒烟共用。
- `engine.cheng` meta 块（`701` 起）：按本轮**实际编译运行**的后继候选数给两臂记账（父代臂 = 本轮改进器 1 + 本轮实际评价候选数 `picksS.len`；候选臂 = M' 改进器 1 + `picksS2.len`），裁决改走 `RsiMetaPromotionDecideBudgeted`（`engine.cheng:740`）；`meta_accepted`/`meta_rejected` 行新增 `per_arm_units=/parent_units=/candidate_units=`；账本不全时事件名升级为 `event=meta_comparison_invalid`（`engine.cheng:801`），仍落同一条 `reject` 决策事实（试验不留未决）。
- `rsi_contract.cheng:115-118`：约定收敛到派生函数，并用字面量反查（`== 4`、`== 2`）防漂移。
- `rsi_recursive_e2e.cheng:119-129`：meta 回执行必须带三元组，且该轨迹（无 LLM 源、`--max-candidates:4`）下两臂各 = `1+4 = 5`。

---

## ④ 静态自检做了什么、结果（**不是编译验证**）

槽位被占，本轮做的全部是文本级检查；其结论只能证明"接线完整、形态合规"，**不能**证明可编译/可运行。

| 检查 | 方法 | 结果 |
|---|---|---|
| 语句级括号/引号配平 | 累积到配平为一条语句，逐语句查 `()[]{}`；再查文件级总数与引号奇偶 | 4 文件全 OK，0 问题 |
| 新增行形态 | 85 行 `+` 行：tab 检查 + 语句首行缩进 4 的倍数（续行对齐豁免） | 0 问题 |
| 调用点实参个数 | 对 8 个被调函数（含 `CloneStrRange`/`e2eIndexOfFrom`）按定义形参个数核对全部调用点 | 全一致 |
| var-out 约定 | 传到 var 形参的实参必须是本文件声明的 var 局部 | `laLedger`/`laCharged` 均 `var` 声明 ✓ |
| 符号/导入存在性 | `promotion.cheng` 内 9 个被引用符号 + engine 三条 import | 全在 |
| 新增行标识符可解析 | 剥离字符串/注释后，engine 新增行内每个标识符须能落到声明/形参/字段/import 别名 | 0 未解析 |
| 禁用品不变量 grep | 新增行扫 `@importc`/`void*`/`ptr`/`&`/`fallback`/`兜底`/`skip`/`catch` | 0 命中 |
| 关键结构不变量 | engine 提交点仍 4 处（`:366/:599/:765/:833`）；engine 内 `RsiMetaPromotionDecide(` 旧入口 **0** 处、`Budgeted` **1** 处；`event=meta_accepted|meta_rejected` 仍各 1 处（gate/e2e 依赖子串命中） | 全符合预期 |
| 并发写核对 | 打补丁前 repo 4 文件 sha256 == 本席 pristine 副本（无人并发改）；`git apply` 后 4 文件 sha256 == 修改后副本 | **逐字节相等**（无覆盖他人 WIP） |
| 子句可达性分析 | `RsiMetaComparisonInvalid` 在当前控制流下的可达性推理 | 见 §⑥.2（如实标注：常轨不可达，唯一可达入口 = LLM 源放大父代臂开销） |

自检脚本：`$TMPDIR/dsh-rsi-batch9/static_check.py`（任务临时目录，收尾已删；结论已固化在本节）。

---

## ⑤ 待槽位验证清单（槽位空闲后按序执行；本批**未**执行）

前置：载具 `artifacts/bootstrap/cheng.stage3` sha256 `05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276`（禁重烤）。
编译通道（与批次七回执同口径）：

```
CHENG_ENTRY_CACHE=0 CHENG_NO_CACHE=1 CHENG_STRICT_NO_CACHE=1 \
  artifacts/bootstrap/cheng.stage3 system-link-exec --root:. \
  --in:<src> --emit:exe --target:arm64-apple-darwin --out:<scratch>/<bin>
```

| # | 验证什么 | 命令 | 期望判据 |
|---|---|---|---|
| V1 | `rsi_contract` 新约定断言（`contract:115-118`）+ 账本全套正反例 | 通道编 `src/tests/rsi_contract.cheng` → `<scratch>/rsi_contract`；`cd <repo> && <scratch>/rsi_contract` | `compile_rc=0` 且 `run_rc=0`（静默；任一 assert 不过即非 0）。特别覆盖：`RsiLookaheadPerArmUnits(3)==4`、`(1)==2` |
| V2 | e2e 真 3 轮 + **本批回执断言**（`e2e:119-129`） | 通道编 `src/tests/rsi_recursive_e2e.cheng` → `<scratch>/rsi_e2e`；`<scratch>/rsi_e2e --root:<repo> --compiler:<repo>/artifacts/bootstrap/cheng.stage3` | `run_rc=0`；内部断言：`event=meta_accepted` 在位且该行含 `per_arm_units=5 `、`parent_units=5 `、`candidate_units=5` |
| V3 | 门禁全量 11 腿（含 `rsi_rss_guard`、`rsi_run_meta_trial`） | 通道编 `src/tools/rsi_gate.cheng` → `rsi_gate`；`cd <repo> && rsi_gate . artifacts/bootstrap/cheng.stage3`（**位置参数**，非 `--root:`） | 11/11 PASS，`GATE_RC=0`；`rsi_run_meta_trial` 仍 `PASS detail=... meta_accepted`（该腿自带 beat_c 守卫 + 4800s 帽，需独占槽位） |
| V4 | 生产形态私账本 epoch 的回执字段 | 同 V3 的 CLI（`src/apps/rsi/main.cheng`）真编译后 `run --max-generations:3 --max-candidates:4 --meta:1 --store-dir:<scratch>`；`grep -E "meta_(accepted|rejected|comparison_invalid)" events.log` | 每条 meta 事件都带三元组；无 LLM 源时两臂恒 `=1+maxCandidates` |
| V5 | **行为变化负例**：账本不全 → 不得接受 | 需构造父代臂**超支**：接 `--llm-endpoint` 且适配器 `kept>0`（`llm_source_proposals count>0`），或注入候选使 `picksS.len > maxCandidates` | `event=meta_comparison_invalid` 出现（而非 `meta_accepted`/`meta_rejected`），且 `facts` 落 reject 决策事实、`verify` 仍 `rc=0`。**本项无现成夹具，是本批唯一未覆盖判据** |
| V6 | 链与重放 | V2/V4 之后：CLI `verify --root:<repo> --store-dir:<scratch>` | `rc=0`（哈希链 + CSG 重放 + 在位版本三方对拍） |

补充记录（须写进重跑回执）：本批使 `src/rsi/engine.cheng` 源码 sha256 由 `e1668eca57526be95a8f081c27591500d41ad336dbc88fe416f9bebbff3a2474` 变为 `dfc130da8c225ccf9bfe2abc2c9179940a9679812e37335f4c475a080ac66ce0`，
故 `receipts/batch7_gate.txt` 里绑定的旧源码 sha 已失效——**V3 必须重跑**，旧的 11/11 不能挪用作本批证据。

---

## ⑥ 阻塞项与不确定项

1. **无编译槽位**：`.rebuild/COMPILE_SLOT.lock` 在位（仅 `ls` 观察，未创建/未触碰）。本批一切结论 = "已接线 + 静态自检通过"，**不是**"已验证"。§⑤ 全部条目挂在槽位上。
2. **invalid 分支可达性（如实标注，防假绿）**：常轨（无 LLM 源）下 `picksS.len == picksS2.len == maxCandidates`，两臂恒满额，`RsiMetaComparisonInvalid` **不可达**——接线后的判词与旧入口逐条一致，本批在生产常轨上**不改变行为**，只把预算证据写进回执。唯一可达入口 = LLM 适配器 `kept>0` 把额外提案追加进父代臂（`engine.cheng:509-515`），使父代臂实际评价数 > `maxCandidates` → 超支硬拒（`promotion.cheng:55` 不截断、不落账）→ 账本不全 → **拒收**。该路径**无实测证据**（V5）。
3. **口径选择的边界**：把 LLM 追加提案计入父代臂开销是"按实际工作量记账"的选择；其后果是 LLM 一旦真产出提案，M 元评价将恒判"对照无效"（不换 M）。这是合同（同起点同预算）的严格读法，但若主线程认为应改为"两臂子预算 = 1 + 实际候选数（动态对齐）"，属**口径变更**，须改 `RsiLookaheadPerArmUnits` 调用点并重定判据——本报告不擅自决定。
4. **e2e 断言硬编码 5**：绑定 e2e 自己传的 `--max-candidates:4`。将来改该参数这条断言会红（刻意：口径变更必须显式改判据），但在槽位跑通前它**尚未被验证过**。
5. **新发现缺口（建议批次十）**：store 写会话锁未接生产——`RsiStoreCommitVersionGuarded`(`store.cheng:765`) 与 `RsiStoreWriteLock*` 只被合同冒烟调用，engine 四处提交仍裸提交；提案 §5 把"双写者拒绝"记为已补齐，实际是"机制已实现并被单测，生产未接线"。另 `RsiCsgAllCanonicalInto`(`csg_layer.cheng:306`)、`RsiModelOrderInto`(`model.cheng:66`) 亦为 test-only（前者疑为 verify R5 的备用入口，后者是模型可解释性入口）——一并留待侦察。
6. **文档锚点漂移**：proposal:107 写的 `src/rsi/promotion.cheng:29-106` 因本批 +14/-5 已漂移（账本段现约 `29-114`）。提案非本席文件，未改；主线程收割时需同步该行。
7. **不在本批范围**：§5 步3（隔离负例，实质依赖 kernel 隔离面）、DarwinAuthority M1/M2/M4（src/core 禁区）、M3 安装面、档 1/2 语料墙、C3-C5 开放门。

---

## ⑦ 纪律回执

**改了哪些文件**（4 个，全部经 `diff -u → git apply --check → git apply`）：

| 文件 | numstat | sha256 前 → 后 |
|---|---|---|
| `src/rsi/engine.cheng` | `+53 -5` | `e1668eca…a2474` → `dfc130da…66ce0` |
| `src/rsi/promotion.cheng` | `+14 -5` | `a163710b…f76e` → `5739ed4f…12c3` |
| `src/tests/rsi_contract.cheng` | `+7 -1` | `b16c078d…6190` → `1ecc54b3…ae5a` |
| `src/tests/rsi_recursive_e2e.cheng` | `+11 -0` | `b3b8789b…af54` → `934e4949…9af0` |

`git diff --numstat`（本席范围）：

```
53	5	src/rsi/engine.cheng
14	5	src/rsi/promotion.cheng
7	1	src/tests/rsi_contract.cheng
11	0	src/tests/rsi_recursive_e2e.cheng
```

- **无编译动作**：本轮未执行 `cheng.stage3 system-link-exec`、未起 `cheng_cold*`/`kd*`/`system-link-exec` 进程、未跑 `rsi_gate`/contract/e2e。
- **无锁占用**：未 `mkdir .rebuild/COMPILE_SLOT.lock`；`.rebuild/COMPILE_SLOT.lock` 仅被 `ls` 观察；未创建任何其他锁目录。
- **无 git 破坏性动作**：无 commit / push / 分支 / worktree / `git stash` / `git checkout --` / `git restore`；无 `cp` 覆盖共享文件（仅把 4 个目标文件 `cp` **到**任务临时目录生成 diff）。
- **补丁**：`$TMPDIR/dsh-rsi-batch9/rsi_batch9.patch`，sha256 `bff137ec1d4e03139ce88be7c3a475727576261c7e72b52226b71bbfadf9fa11`；应用序列 `git apply --check -v`（4/4 Checking，rc=0）→ `git apply`（rc=0）→ 4 文件 sha256 与修改后副本逐字节相等。补丁全文已内嵌 §③，工作树为最终真相。
- **临时产物**：任务目录 `$TMPDIR/dsh-rsi-batch9`（pristine 副本 + 修改副本 + 补丁 + 自检脚本），本轮结束删除并复查不存在；未用固定 `.tmp-exec`、未留裸 `/tmp` 长驻目录、未动冷对象缓存。
- **文档面**：仅新增本文件；`openspec/`、`docs/` 其余文件（含 RSI 战役 findings/progress/task_plan、kernel 战役文档）零触碰。
- **他线 WIP 零影响**：打补丁前后均核对了本席 4 文件与 pristine 副本的字节相等性，未覆盖任何并发写入。
