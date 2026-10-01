# S1 证据对账与引用体检

- 账本快照：`docs/cheng-rsi-acceptance-status.md`（929 行，sha256 前16 `fac35798e8ad1565`；体检时 UTC 2026-09-13T21:33:25Z）
- 审计脚本：`docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/audit_claims.py`（sha256 前16 `5ec784868b8c1850`，只读）
- 范围：账本全部 `.rebuild/`、`receipts/`、`docs/` 引用；去重后 149 条，展开 brace/缩写后判 176 个实例（通配/占位单列未验证）
- 引注格式：file:line + sha256 前16；`.rebuild` 是易失工作区，docs 侧镜像在 `receipts/{evidence,semantic_steps}/`

## ① audit_claims.py 逐字结果
```
$ cd /Users/lbcheng/cheng-lang && python3 docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/audit_claims.py
audit: 32/32 OK
```
失败项：无。脚本只在 FAIL 时追加 `  FAIL <name> <detail>`；本次 32 条全 OK，故无失败行可录。

## ② 引用对账（②A 失效 39 条逐条；②B 在场 110 条按目录族聚合）
### ②A 失效引用（文件/目录不存在）
| 账本行号 | 引用路径 | 存在? | sha 对得上? | 替代路径 |
|---|---|---|---|---|
| 68 | `docs/campaigns/…/tools/cited_round_audit.py` | 否 | — | docs/campaigns/2026-08-31-kernel-userpath/tools/cited_round_audit.py |
| 70 | `docs/campaigns/…/tools/a7_theory_emit/` | 否 | — | docs/campaigns/2026-08-31-kernel-userpath/tools/a7_theory_emit/ |
| 210 | `.rebuild/a9b/seed_probe1/` | 否 | — | receipts/a9_cheng_chain_wall_repros.md（台账，非原始件） |
| 214,233,718,738 | `.rebuild/a7b9/kd_a7v9` | 否 | — | receipts/evidence/a7_bake/；驱动需重烤 |
| 228 | `.rebuild/a9b/{kd_probe1,kd_probe2,kd_probe3,locprobe}/` | 否 | — | receipts/evidence/a9b_legs_latest/ |
| 400 | `.rebuild/semantic/superseded/` | 否 | — | receipts/semantic_steps/（镜像；v0/v1 sha 不同） |
| 406 | `.rebuild/sm1_line/croot` | 否 | — | 无（他线在飞件） |
| 424 | `.rebuild/patchwork/probe_cache_semantics.sh` | 否 | — | src/probe_cache_semantics/cache_probe.cheng（脚本无 docs 副本） |
| 424 | `.rebuild/patchwork/probe4.log` | 否 | — | 无 docs 副本 |
| 464 | `.rebuild/patchwork/gate_test.log` | 否 | — | 无 |
| 464 | `.rebuild/semantic/gate/guard.report.txt` | 否 | — | 无（gate 目录消失） |
| 468 | `.rebuild/semantic/gate/guard.{out.txt,report.txt}` | 否 | — | 无 |
| 481 | `.rebuild/patchwork/b905b_walls.log` | 否 | — | receipts/evidence/wall_probe_latest/run.log |
| 500 | `.rebuild/patchwork/c5c6_probe.log` | 否 | — | 无 |
| 521 | `.rebuild/patchwork/kd_d7_walls3.log` | 否 | — | receipts/evidence/wall_probe_latest/run.log |
| 527 | `.rebuild/reverify/20260913T102300Z_0fbca391/wall_probe.log` | 否 | — | receipts/evidence/wall_probe_latest/retry_1.log |
| 527 | `.rebuild/reverify/20260913T105401Z_4dfd9d61/wall_probe.log` | 否 | — | receipts/evidence/wall_probe_latest/retry_1.log |
| 527 | `.rebuild/reverify/20260913T113247Z_fab71072/wall_probe.log` | 否 | — | receipts/evidence/wall_probe_latest/retry_1.log |
| 537 | `.rebuild/patchwork/contrast3.log` | 否 | — | 无 |
| 537 | `.rebuild/patchwork/contrast.log` | 否 | — | 无 |
| 596 | `.rebuild/semantic/superseded/v0.20260914T_toolfix/PASS` | 否 | 否 78f83be0≠fdef7519 | .rebuild/semantic/v0/PASS（fdef7519…，≠78f83be0…） |
| 597 | `.rebuild/semantic/superseded/v1.20260914T_toolfix/PASS` | 否 | 否 3e38ad7d≠ee0a6de7 | .rebuild/semantic/v1/PASS（ee0a6de7…，≠3e38ad7d…） |
| 601 | `.rebuild/patchwork/carrier_bad.sh` | 否 | — | docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/carrier_bad.sh |
| 601 | `.rebuild/semantic/v4a/PASS` | 否 | — | 无（可重跑） |
| 602 | `.rebuild/semantic/v4/DONE_NOT_A_MISCOMPILER` | 否 | — | 无 |
| 608,692 | `.rebuild/semantic/superseded/v3f.20260914T_toolfix/PASS` | 否 | 是 b26e51e3 | .rebuild/semantic/v3f/PASS（b26e51e3… 一致） |
| 679 | `.rebuild/patchwork/decl_trace/g.err.txt` | 否 | — | 无 |
| 679 | `.rebuild/patchwork/probe_decl_trace.sh` | 否 | — | 无 |
| 683 | `.rebuild/patchwork/wait_postfix_driver.sh` | 否 | — | 无 |
| 683,818 | `.rebuild/patchwork/postfix_watch.log` | 否 | — | 无（账本自述不存在） |
| 724 | `.rebuild/a7_root/kd_a7` | 否 | — | 无（a7_root 在但无载具）；receipts/evidence/a7_bake/ |
| 799 | `.rebuild/semantic/obs_cache/fixture_call_fixture.obs` | 否 | 是 b6728227 | receipts/obs_cache_bad_entry_fixture_call_fixture.obs（b6728227… 一致） |
| 809,908 | `.rebuild/patchwork/fix_review_a1a4.py` | 否 | — | 无 |
| 809,908 | `.rebuild/patchwork/cheng_src_preflight.py` | 否 | — | 无 |
| 810,908 | `.rebuild/patchwork/b1701_walls.log` | 否 | — | receipts/evidence/wall_probe_latest/run.log |
| 811,841 | `.rebuild/patchwork/a7_bake_run2.log` | 否 | — | .rebuild/patchwork/a7_bake_run4.log；receipts/evidence/a7_bake/ |
| 817 | `.rebuild/a9b/legs/p/leg_archive/p_rc0_pg34594_1789294000/` | 否 | — | receipts/evidence/a9b_legs_latest/p/leg_archive/ |
| 859 | `docs/campaigns/2026-09-07-pure-cheng-rsi/{tools,receipts,design}` | 否 | — | design 目录不存在 → design_semantic_regression.md |
| 928 | `.rebuild/patchwork/{probe_cache_semantics.sh,probe4.log}` | 否 | — | 同上（L928，同 L424） |
### ②B 在场引用（逐条 check 均存在，按族聚合）
| 账本行号范围 | 引用族 | 存在? | sha 对得上? | 替代路径 |
|---|---|---|---|---|
| 3–926 | docs/cheng-rsi-*.md（2 条） | 是 | — | — |
| 35–929 | docs/campaigns/2026-09-07-pure-cheng-rsi/**（49 条） | 是 | — | — |
| 58–928 | .rebuild/semantic/**（22 条） | 是 | — | — |
| 69–683 | .rebuild/s1b_step3/**（7 条） | 是 | — | — |
| 71–929 | docs/campaigns/2026-08-31-kernel-userpath/**（8 条） | 是 | — | — |
| 479–479 | .rebuild/b_line/**（1 条） | 是 | — | — |
| 481–864 | .rebuild/patchwork/**（5 条） | 是 | — | — |
| 533–640 | .rebuild/reverify/**（2 条） | 是 | — | — |
| 555–858 | .rebuild/cdomain/**（4 条） | 是 | — | — |
| 576–867 | .rebuild/rsi_cli/**（3 条） | 是 | — | — |
| 578–858 | .rebuild/a9b/**（4 条） | 是 | — | — |
| 856–856 | 其他（1 条） | 是 | — | — |
| 863–864 | .rebuild/a7_root/**（2 条） | 是 | — | — |
### ②C sha256 复算（账本写了 sha 的绑定件）
| 账本 sha | 绑定引用 | 实测前16 | 结论 |
|---|---|---|---|
| 7995091f… | `receipts/semantic_baseline_05af823e.txt` | 7995091fa119bb54 | ✓ |
| b6728227… | `receipts/obs_cache_bad_entry_fixture_call_fixture.obs` | b6728227517df5f6 | ✓ |
| b26e51e3… | `.rebuild/semantic/superseded/v3f…PASS（引用失效）` | .rebuild/semantic/v3f/PASS=b26e51e3fa42b283 | ✓ |
| 78f83be0… | `.rebuild/semantic/superseded/v0…PASS（引用失效）` | 活 v0/PASS=fdef751977747c1a | ✗ 不可复算 |
| 3e38ad7d… | `.rebuild/semantic/superseded/v1…PASS（引用失效）` | 活 v1/PASS=ee0a6de7692a324c | ✗ 不可复算 |
| d70d42c1… | `receipts/l4_tool_review.md` | d70d42c18a3fd168 | ✓ |
| 48644316… | `receipts/wall2_typedexpr_pointer.md` | 486443162576cf89 | ✓ |
| 0186a268… | `receipts/tier3_prereq_checklist.md` | 0186a2689b7aa23a | ✓ |
| 3f152300… | `docs/campaigns/2026-08-31-kernel-userpath/patches/selfbake_theory_emit.patch` | 3f152300698faa51 | ✓ |
| 99440cca… | `.../tools/a7_theory_emit/a7_assert_emit.py` | 99440cca1a81ad7d | ✓ |
| 865218b1… | `theory_emit_rss_metric_label.patch（L70，记账路径未写全）` | .../patches/theory_emit_rss_metric_label.patch=bf45ff07db50cae5 | ✗ 不符 |
| 4d1a60aa… | `.rebuild/s1b_step3/r9/kd_b905b` | 4d1a60aab8d5efc7 | ✓ |
| fab71072… | `.rebuild/s1b_step3/r9/kd_b1102` | fab7107264972410 | ✓ |
| e9cf16ac… | `.rebuild/s1b_step3/r9/kd_b1701` | e9cf16ac06271bed | ✓ |
| 0fbca391… | `.rebuild/s1b_step3/r9/kd_b1002（仅写 sha）` | 0fbca3919bf8224b | ✓ |
| fe67c40f… | `.rebuild/semantic/rsi_semantic（账本 L860 记的工具二进制）` | fe67c40f533ee59e | ✓ |

## ③ 失效引用汇总
- 失效引用 39 条（占 149 条的 26%），全部为 `.rebuild/` 侧或 `…` 缩写误解析；**无一条 `receipts/` 引用失效**。
- 其中 18 条在 docs 侧有同类可引替代（cited_round_audit、a7_theory_emit/、carrier_bad.sh、obs_cache 坏条目、wall_probe/a7_bake 证据、leg_archive、design → design_semantic_regression.md 等）。
- 另有 3 条（superseded v0/v1/v3f）docs 侧仅有镜像或 sha 不符：v0/v1 镜像 sha 与账本不符，v3f 镜像目录无 PASS（活 `.rebuild/semantic/v3f/PASS` sha 一致）。
- 其余 18 条无任何同类替代：探针脚本/日志（probe_cache_semantics、gate_test、decl_trace、contrast、contrast3、c5c6、postfix_watch、fix_review_a1a4、cheng_src_preflight）、v4/v4a 标记、sm1_line。
- sha 结论：16 项复算中 13 ✓、1 ✗ 不符（865218b1 ≠ bf45ff07）、2 不可复算（78f83be0/3e38ad7d 原件盘上无）。
- 分节覆盖（含点名节）：
- §6.1y（L592–617）：在场 12 条，失效 6 条（行号 596 597 601 601 602 608,692）
- §6.1bb（L690–709）：在场 1 条，失效 1 条（行号 608,692）
- §6.1cf（L634–665）：在场 1 条，失效 0 条
- §6.1cg（L794–812）：在场 2 条，失效 5 条（行号 799 809,908 809,908 810,908 811,841）
- §6.1ch（L813–822）：在场 4 条，失效 2 条（行号 683,818 817）
- §6.1cj（L845–855）：在场 6 条，失效 0 条
- §6.1ck（L856–871）：在场 18 条，失效 1 条（行号 859）

## ④ 「未验证」清单
- `docs/campaigns/…/` 缩写 10 处按 2026-09-07 campaign 解析；L68/L70 实指 2026-08-31，已更正（其余缩写解析正确）。
- `78f83be0…`（superseded v0）、`3e38ad7d…`（superseded v1）：`.rebuild` 与 docs 侧均无原件，sha 不可复算。
- 非三前缀面的 sha 未复算：`05af823e…`（cheng.stage3 载体）、`e252520f…/8ca9d02d…/2c855f8a…`（工具源）、`d721c1ff…`、`ab01a574…`、`ba9c8880…`、`201a08e9…`。
- 通配/占位引用未逐实例判定：`.rebuild/reverify/<utc>_<drvsha>/`、`.rebuild/semantic/<step>/{...}`、`.rebuild/s1b_step3/r9/kd_*`、`.rebuild/a9b/legs/<腿>/{...}`、`.rebuild/rsi_cli/{...}`、`receipts/semantic_steps/{...}`。
- 账本自述不可复算项未另验：`phase_rows=0`（§6.1ch C-5）、`postfix_watch.out` 0 字节、`diff -rq src/core` 在 BSD diff 下不可执行。
- 并发改写：体检期间账本被外部改过一次（初读 915 行/`816ccb…`，复读 929 行/`fac35798…`）；本表行号以 929 行 `fac35798` 快照为准，若账本再改需重跑。
- `.rebuild/semantic/v4a/PASS`、`v4/DONE_NOT_A_MISCOMPILER`、`gate/guard.*`、`superseded/` 无 docs 副本：判词正文仍在账本，原始件未验证。
