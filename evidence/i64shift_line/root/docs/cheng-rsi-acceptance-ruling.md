# RSI 融合战役 · 交付裁定书（2026-09-14 第 96 轮；**经两路独立只读复核后修订**）

修订说明：本件经 V1（数字/sha 复算）与 V2（完整性/措辞）两路只读子代理复核后修订；两回执 = `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/ruling_numbers_check.md`、`.../ruling_completeness_review.md`。详细推导见 `docs/cheng-rsi-acceptance-status.md`（§6.1cg–§6.1cr、§7.0）。

## 裁定落地（2026-09-15，用户指令「裁定先落：T60–T65 五条在段 0 里一起裁，三枚 compiler_domain.cheng 补丁在段 1 同窗口一次应用」——授权协调席按文档内推荐/合同优先原则执行）

| 项 | 裁定 | 依据 |
|---|---|---|
| T60（项 1 L4） | **接受**该证据面为本项最终；V4b/V5/V6、F4/F5/F6、残余②、`anchor=rc_only`、S6 三态样本失按「未取得/未修」记账不计入 PASS | 工具 8 步全 PASS+基线逐字节同+judge 45/0；未闭合面已全披露 |
| T61（项 2a） | **改代码对齐合同**——应用 `receipts/patches/c1c2_order_contract.patch`（7/1） | 合同先于实现；reason 词机械对照要求顺序逐字一致 |
| T62（项 2b） | **接线 RSI 运行期**——应用 `receipts/patches/tier3_50mb_wiring.patch`（15/0） | 内存约束卡第 2 条「验收按逐相贴线」是全战役硬约束，50MB 必须运行期可判，不容「工具承担」 |
| T63（跨项阻塞） | **择①内核清墙** | 冻结窗口打法即清墙；②需 C 链线认领拖期；③改变达标定义不可接受 |
| T64（措辞收口） | 外门=`enforced`/内门=`footprint` 写入 `cheng-plan.md` §6.2 与 `compiler_domain_c1c2_contract.md`；配对口径 12/3/9 定稿 | 零争议文档落实 |
| T65（项 3 档 3） | **接受推迟**：档 3 本轮不交付、`Open(3)` 保持 false、三缺口（forest 四判据/50MB 接线随 T62/P5）按 `tier3_gap_plan.md` 后续，P-b 随窗口同文件串行施工 | 开档三前置未满足；50MB 缺口由 T62 消掉一条 |
| 范围外旧项 | §7.0 第 1 条（模型锚贴线 vs 768 门 RED 改变达标定义）**明确推迟**至窗口走完、实测数据在案后裁；第 2-7 条同批 | 无实测不裁达标定义 |

**段 1 同窗口 compiler_domain 三枚应用序**（账本：2(a)/2(b) 可任意顺序）：`c1c2_order_contract.patch` → `tier3_50mb_wiring.patch` → P-b（T65，`RsiCdBakePairedInto` 回传冻结路径）同文件串行；应用后 C 链重建一次（并入段 1 唯一一烤）。

## 裁定项 1 · 语义 oracle（L4）
- **现势**：工具源 `2c855f8aff34e19f…`（1131 行）；v0/v1/v2/v2b/v3/v7/v8/v3f **全 PASS**；重录基线 `7995091fa119bb54…`（38 条）与冻结副本**逐字节相同**（四份文件 `cmp` 相同）；**无缓存全量 judge 单步 v3f ≈ 132 秒**（6 步批次总墙钟 388 秒 —— 前一版把两者混为一谈，已更正）；judge `checks_pass=45 checks_fail=0 entries=31+7 covered=31/31 best_correct=3937`；自检 11 例。
- **证据**：`receipts/semantic_steps/**`（8 步 + 基线 + obs_cache）、`receipts/evidence/semantic_run45.log`、`receipts/semantic_baseline_05af823e.txt`。
- **须一并披露（不影响已 PASS 的 8 步，但属本项未闭合面）**：V4b（候选 `stage3+BACKEND_JOBS=2` 实测 38/38 `baseline=equal` ⇒ 不是误编译器）、V5（闭包前提已变）、V6 私账本口径（盘上无该账本）；L4 工具 **F4/F5/F6 未修**、残余②（基线写盘早于清场判据）、`anchor=rc_only` 平价未实现；S6 判据的**三态实测样本已失**（仅键数 44 与硬门值可复算）。
- **请裁定**：是否接受该证据面为本项最终（上述未取得/未修项按「未取得/未修」记账，不计入 PASS）。

## 裁定项 2 · C1/C2 口径
- **现势**：判词链**已可审**；但**现役判定为 `INCONCLUSIVE_DEP`（至今无 PASS）**：cdomain 档 0/1 = `missing_phase_readings`（`phase_rows=0`），A9b p = `INCONCLUSIVE_DEP`、n/n0 = `PASS`。实现 `src/rsi/compiler_domain.cheng`（P-a 前 `60dfe56f…` → 后 `ac288371c1f1ae01…`）。
- **一处实质顺序偏差（V1 复核抓出，本席逐字复核确认）**：合同 `compiler_domain_c1c2_contract.md:41-43` 把 `missing_baseline`→`pathological_baseline` 列在 `over_hard_gate` **之前**；实现 `RsiCdMeasurementVerdict:184-198` **先**判 `over_hard_gate`，`RsiCdC2Verdict:205-220` **后**判基线 ⇒ 两处顺序互换；且实现注释 `:202-203` 写「基线有效性 → 越硬门」，与代码相反。**判词集合一致、顺序不一致**（两者都不放行 PASS，但 reason 词不同 ⇒ 门禁按 reason 机械对照会误报）。
- **50MB 逐相贴线**：阈值与判定只在 `tools/phase_line_check.py:78`（`50000000`）与 `:516-522`，**未接线** RSI 运行期（`src/rsi` 零调用）；c1c2 合同只要求「逐相行>0」，50MB 出自**档 3 合同**。
- **请裁定两条**：(a) 顺序偏差 = **改代码对齐合同**（补丁已预置：`receipts/patches/c1c2_order_contract.patch`，`git apply --check` 通过，裁定后 ~10 min 槽位可验），还是**改合同/注释对齐代码**（零成本）？(b) 50MB 是否接受「由工具承担、不接线 RSI 运行期」？（若要接线，补丁**也已预置**：`receipts/patches/tier3_50mb_wiring.patch`，`git apply --check` 通过，且与 (a) 的补丁在副本上任意顺序应用均 OK。）

## 裁定项 3 · 语料档 3
- **现势**：`Open(3)` 机械恒 false（`src/rsi/types.cheng:131-132` = `return corpusIdx == 0 || corpusIdx == 1`，sha `a104273e…`），档 3 分支在门后不可达；默认门 summary 实测 **44 份、0 份 rc=0**、最好 **136/234**；达 234 的 **81 份全为抬门轮**（53 acceptance + 28 diagnostic，全部 `rss_guard_env=3865470566`）。
- **三缺口 + 硬前置**：① forest 四判据无 RSI 落点；② 50MB 未接线（同项 2）；③ P5 `RsiCdFreezePairVerdictInto` 仅测试调用；**P-a 已修并验证**（`compiler_domain.cheng:296` 补 `CHENG_COMPILER_CSG_STDERR=1`；`cli_build_rc=0` + cdomain 判词不变）；**P-b 未修**（`RsiCdBakePairedInto` 不回传冻结路径）。
- **证据**：`receipts/tier3_prereq_recheck.md`（`a0085dcc…`）、`receipts/tier3_gap_plan.md`、`corpus_tier3_contract.md`（`3ae1fae4…`）。另：`tier3_static_verdict.txt`（835/1172）**已早于现树**（848/1184）⇒ 不得沿用。
- **请裁定**：是否接受「档 3 本轮不交付、`Open(3)` 保持 false、三缺口列为后续（按 `tier3_gap_plan.md` 施工，需先满足开档三前置）」。

## 跨项唯一阻塞（**请择一**）
- **事实**：逐相仪器只在 Cheng 链存在，而 Cheng 链编不动语料/载具（§6.15）。最新前沿（内核 B18 线 2026-09-14 05:59 实测）：`typed expr: node origin proof is missing or contradictory fn=main line=30 … surface=body`；墙复测**六枚驱动一致**（`kd_d7`/`kd_b1701`/`kd_b18probe=d38ac2dd…`/`kd_b1801=290fe708…`/`kd_f104a=c3038145…`/`kd_b19probe=2522966b…`）c1/c3 均 `bin=no`，`PROBE_RESULT` 两行源 sha **逐字相同**（证据 `receipts/evidence/wall_{probe_latest,b18probe,b1801,f104a,b19probe}/`）。A7 载具**五试五败**（四类判词，末两试同为 `TypeArena … name=Result`）。A7 载具三试均在 `cleanup_cfg.cheng` 上撞同类墙（607 s / 不可编 / 2030 s）。
- **三条出路（请择一或指定顺序）**：① **内核清墙**（推荐）；② **给 C 链补逐相发射点**（`bootstrap/cheng_cold.c` 属内核 D1/D2 线在飞件，本席不碰，需该线认领）；③ **用户裁定 tier 0/1 豁免逐相**（与 c1c2 合同「逐相必需」冲突 ⇒ 改变达标定义）。

## 范围外但仍需裁定的旧项
- `docs/cheng-rsi-acceptance-status.md` §7.0 第 1–7 条未并入本页，尤其第 1 条「模型锚贴线合格 vs 768 门 RED」**明说会改变『什么算达标』**；请一并裁定或明确推迟。

## 纪律与信任校准（自证 vs 独立）
- **未抬门换绿**：**A7/S6 两处**抬门轮（4 GiB）的产物与读数一律标「诊断件，不得用于达标判词」（`a7s6_run.sh` 落 `MARKER.txt`）。**另有既存风险须提示**：普查 114 份摘要里 **71 份** `gate=default(768MiB)` **标签失真**（内核在飞件，本席只登记未改）⇒ 任何「默认门」统计必须先按 `rss_guard_env` 复核；81 份抬门 summary 正带此失真标签。
- **证据绑原始件**：本轮补了 docs 侧镜像与失效引用替代；但仍有 **18 条引用无 docs 侧替代 + 2 条 sha 不可复算**（`receipts/evidence_reconciliation.md`）。
- **自证 vs 独立**：`audit_claims.py` 是**本席自写**件（只做语义自检），不构成独立验证；独立产出 = 子代理只读回执。曾因 P-a 验证重建 CLI 造成两条 `a9b.n/n0.cli_sha256` 漂移（30/32）；**已归档旧活树并用新 CLI（`49ebdca190d271d9…`）重跑 A9b 三腿**（p `INCONCLUSIVE_DEP` / n,n0 `PASS`，标记绑新 CLI），audit 回 **32/32 OK**。
- **本轮已修自伤面（均有回归证据）**：槽主**显式声明制**、看门狗**两模式同源判据**+case D、`a7_preconditions` **CPU 增量**判据、逐腿释放锁**死代码**、S6 **退出码三态**、探针「没跑完 ≠ 墙还在」分流、镜像与载具迁 docs 侧。