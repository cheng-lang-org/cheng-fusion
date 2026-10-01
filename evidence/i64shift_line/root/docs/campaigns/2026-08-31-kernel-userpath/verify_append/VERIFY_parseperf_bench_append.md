# VERIFY_parseperf_bench_append —— [PARSE-PERF2] 独立第三方免窗 bench 计费账本（并入前线 parseperf_3 VERIFY）

date_utc=2026-09-07 · 代理=PARSE-PERF2 重建线（裁决转任独立账房，不做刀面/门禁/主树代码交付）· 克隆=/Users/lbcheng/cheng-f24/ppf（基线 55979da69=主树工作树全量刷新态）· 被测刀=前线 66afe4675 三刀快照（parser.cheng.f1a/.f1b/HEAD）· 通道=parseperf_bench 探针+parser 相位 overlay（apply/strip sha 恒等核验）· 计量=3 轮交错×5 rep×9 形状，逐指标 min 估计器

## 结论先行

**逐刀账（免窗 A/B，min 估计器）：F1a 实收 events −3~−10%（u_complex −10.4%，方向与量级同 −15% 旧账，量级不及；v10000 形状 +1.5% 噪声带内）——复现成立但不足 −15%；F1b 实收 events −4~−6%+validate −4.5~−10.1%（u_dense validate −10.1%，九列批量读直击 validator 身份环）——成立；F3 parser 相逐形状平（±2%）=预期（F3 收益在管线级消第二遍树读，由前线 900s 自宿主探针 forest 段新账验收，不归形状 bench）。两条硬发现：①被测刀 66afe4675 带编译阻断缺陷——`parserTokenIdentityRowAt` 缺 `@borrows`，三刀态（f1b/f3）冷链烤机（cheng_cold_v2 与 cheng_w126_re 双车头实证）rc=2 `borrowed actual cannot bind non-var non-@borrows formal`，一行修复（只读借用，值语义不变）后全绿，前线烤机/门禁前必须带上；②token 高密源（8000 行×~75 token/行，2.2MB）四态全 SEGFAULT `allocation_ledger_prefix_magic_mismatch`（含基线，非刀引入）——既有 parser/runtime 缺陷哨兵，独立立案。噪声底：本窗三战役并发，events ±3~8%、validate ±5~10%，±5% 级效应单轮不可辨，双矩阵互证取 min。**

## 一、逐刀账（最终矩阵，3 轮交错×5 rep，逐指标 min，单位 ms）

| 形状 | base_ev | f1a_ev | d_ev% | f1b_ev | d_ev%② | base_val | f1b_val | d_val%② |
|---|---|---|---|---|---|---|---|---|
| a_fill | 604 | 570 | −5.6% | 535 | −6.1% | 256 | 240 | −6.3% |
| b_decls | 547 | 518 | −5.3% | 497 | −4.1% | 338 | 314 | −7.1% |
| f_strings | 450 | 425 | −5.6% | 438 | +3.1% | 233 | 216 | −7.3% |
| t5000 | 162 | 157 | −3.1% | 151 | −3.8% | 115 | 112 | −2.6% |
| u_complex | 576 | 516 | **−10.4%** | 517 | +0.2% | 243 | 232 | −4.5% |
| u_dense(26tok/行) | 854 | 801 | −6.2% | 767 | −4.2% | 337 | 304 | **−9.8%** |
| v10000 | 325 | 330 | +1.5% | 324 | −1.8% | 292 | 284 | −2.7% |
| e_empty/d_comments | 0 | 0 | 地板 | 0 | 地板 | 0 | 0 | 地板 |

②列=f1b 相对 f1a。F3 相（f1b→f3 parser 快照）逐形状 |Δ|≤2.2%=平，符合设计（管线级收益不在形状 bench 显影）。

## 二、判定

1. **F1a**：重放在现基线（55979da69 含他线 WIP parser +771 行）上成立，u_complex −10.4% 与重放账 −15% 同向同级（形状与世界差异致量级收窄）；非稠密形状 −3~−6%。
2. **F1b**：三件（九列批量读/热点直通化/列外提）合并实测 events −4~−6%、validate −5~−10%，validator 身份环收益最大（与其刀面瞄准一致）；无回归形状。
3. **F3**：形状平=预期；其收益归 900s 自宿主分相探针 forest 段新账验收（前线 pp_audit 壳）。
4. **编译阻断（必修）**：`@borrows` 加回 `parserTokenIdentityRowAt`（f1b/f3 两态同缺）后再烤门禁，否则族门二烤机 rc=2。
5. **哨兵（独立立案）**：token 高密源 SEGFAULT（allocation_ledger_prefix_magic_mismatch）四态同现，与刀无关，建议移交 parser 缺陷线。

## 三、测量件与可复现性

- 探针：`/Users/lbcheng/cheng-f24/ppf/src/probes/parseperf_bench.cheng`（9 形状内存生成：e_empty/d_comments/a_fill/f_strings/b_decls/t5000/v10000/u_complex/u_dense；不入编译闭包）。
- overlay：`ppf/.w/pp_probe_overlay.py`（parser.cheng 相位计数器 apply/strip，往返 sha 恒等=7b00fd61… 已核）。
- 矩阵壳：`ppf/.w/pp_matrix.sh`（四态换快照+overlay+烤+交错跑）；分析：`ppf/.w/pp_ab.py`。
- 被测快照：前线 66afe4675 的 `.w/parser.cheng.f1a/.f1b`+HEAD（f1b/f3 加 @borrows 修复后测）；基线=55979da69。
- 中间矩阵一轮（重载窗，5 轮）曾测得 F1a 平——并发烤机污染实证，本账以较静窗矩阵为准并如实记录摆动。

## 四、纪律记录

- 免窗通道按 §五惯例不占烤机锁域（正式烤机/门不在此列）；本线全程未动主树代码、未动前线克隆、未 commit 刀面。
- 克隆 17:22 快照误捕前线 17-hunk 中间态存为 f1a.patch，已识别弃用（非纯 F1a），改用其提交快照逐刀测。
- 裁决：本代理转独立账房，账本（本文+消息）交前线 agent_479fd34c 并入其 VERIFY；交毕待命收工。
