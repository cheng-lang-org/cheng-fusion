# 锚点漂移审计：docs/ 与 openspec/ 全树 `文件名.cheng:行号` 锚点核对

- 仓库：`/Users/lbcheng/cheng-lang`，审计时 HEAD = `fa08177da Thu Sep 10 23:01:39 2026 +0800`
- 审计范围：`docs/` 与 `openspec/` 全树（157 份含锚点文档），共提取锚点 **1030** 条（正则 `文件名.cheng:行号`，含 `:N-M` 区间与 `:N/M/K` 并列写法）
- 只读审计：未修改任何被审计文件（收口轮仅在各文档原行后就地追加方括号更正，原文一字未删）；未编译、未运行任何 cheng/kd 进程

## 使用方式（引用旧文档里的 `文件:行` 之前必读）

1. 先在本报告①（按文档的计数）与③（逐条新行号）里查这个锚点：标「**已漂移**」的，改用③给出的新行号，不要再用旧号。
2. 标「**危险**」的**不得直接引用**——该行号处已经是别的函数/别的内容，描述对象已消失或无法定位；请按②/②b 的说明另找落点，找不到就先 grep 点名符号。
3. 标「**不确定/未解析**」的，不要照抄行号：先 `grep -n "<文档点名的符号>" <目标文件>`，取当前定义行，再落笔。
4. 「行号对得上」不等于「锚点可信」：机检识别不出「行号未漂移但写作时即错」这一类，详见②b 与⑥。
5. 本报告不改写任何文档原文；②中 15 条危险锚点在原文档里的方括号更正，是唯一的就地标注形式。

## 判定口径

| 类别 | 含义 |
|---|---|
| **仍成立** | HEAD 锚点行窗口内出现文档自己点名的符号（反引号内标识符 / 文档行内紧邻锚点的标识符），即行号处内容与文档描述一致 |
| **已漂移但可定位** | 行号处内容与描述不符，但按「diff 行号重映射」或「描述符号唯一命中」能给出唯一新行号 |
| **危险** | 行号处内容与描述不符，且描述对象已消失或无唯一候选；正确锚点给不出就写「未定位」 |
| **不确定** | 证据不足（符号过泛/多处候选/文档描述不可机检/目标文件解析歧义），按纪律不猜 |

子判据代号：`HOLDS-A` 锚点行与写作提交逐字节相同；`HOLDS-B` 行已改动但符号命中；`DRIFT-remap` diff 重映射后内容逐字节相同（最硬）；`DRIFT-symbol` 描述符号唯一加权命中；`DRIFT-stale-birth` 行号自写作提交起未动但与描述不符（**写作时即错**，最危险的一类漂移）；`DRIFT-function` 只定位到函数头、函数内具体行未定位；`DANGER-*` 危险类细目。

## ① 总览表（文档 × 锚点数 × 分类计数）

按「危险+漂移+不确定」降序；`tracked` = `git ls-files --error-unmatch`；`clean` = `git status --porcelain -- <file>` 为空；`mtime` 为工作树 mtime；`era` = `git log -1 --format=%h %ad -- <file>`。

| 文档 | tracked | 工作树 | mtime | era(写作时代,文件级) | 锚点 | 仍成立 | 已漂移 | 危险 | 不确定 | 未解析 |
|---|---|---|---|---|---|---|---|---|---|---|
| `docs/campaigns/2026-08-31-kernel-userpath/VERIFY.md` | 是 | clean | 2026-09-10 22:59 | fa08177da Thu Sep 10 23:01:39 2026 +0800 | 131 | 65 | 61 | 0 | 5 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/r2_closure_ops_map.md` | 是 | clean | 2026-09-06 05:43 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 13 | 6 | 1 | 5 | 1 | 0 |
| `docs/cheng-csg-lsp-debugger-fusion.md` | 是 | clean | 2026-07-24 11:20 | a7ee2da19 Sun Jul 26 19:32:30 2026 +0800 | 54 | 14 | 29 | 2 | 3 | 6 |
| `docs/pending-work-ledger-2026-07-14.md` | 是 | clean | 2026-07-24 11:18 | a7ee2da19 Sun Jul 26 19:32:30 2026 +0800 | 42 | 8 | 23 | 1 | 6 | 4 |
| `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md` | 是 | clean | 2026-09-08 20:41 | 22aef12b3 Tue Sep 8 21:01:36 2026 +0800 | 12 | 4 | 1 | 3 | 4 | 0 |
| `openspec/proposals/cheng-v2-in-place-refactor.md` | 是 | clean | 2026-07-23 01:47 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 18 | 4 | 13 | 1 | 0 | 0 |
| `openspec/proposals/deterministic-memory-lifecycle.md` | 是 | clean | 2026-09-08 20:41 | 22aef12b3 Tue Sep 8 21:01:36 2026 +0800 | 4 | 0 | 3 | 1 | 0 | 0 |
| `docs/release-green-contract-inventory.md` | 是 | clean | 2026-09-10 22:59 | fa08177da Thu Sep 10 23:01:39 2026 +0800 | 18 | 5 | 10 | 0 | 3 | 0 |
| `docs/s2-feed-core-build-wall-20260708.md` | 是 | clean | 2026-07-23 15:50 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 14 | 3 | 10 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_ab_prep_append.md` | 是 | clean | 2026-09-06 12:57 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 2 | 1 | 0 | 1 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_r2c_c6_append.md` | 是 | clean | 2026-09-07 14:41 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 0 | 0 | 1 | 0 | 0 |
| `docs/cheng-csg-patent-candidates.md` | 是 | clean | 2026-07-15 03:24 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 16 | 7 | 8 | 0 | 0 | 1 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w145_append.md` | 是 | clean | 2026-09-10 22:59 | fa08177da Thu Sep 10 23:01:39 2026 +0800 | 17 | 11 | 6 | 0 | 0 | 0 |
| `openspec/proposals/coordinate-aware-pointer-dispatch.md` | 是 | clean | 2026-06-13 17:40 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 8 | 2 | 6 | 0 | 0 | 0 |
| `docs/cheng-video-e2e-miaofa-miaokai-plan.md` | 是 | clean | 2026-08-27 02:43 | 073c6f702 Thu Aug 27 02:51:54 2026 +0800 | 8 | 2 | 5 | 0 | 1 | 0 |
| `docs/gate-recheck-2026-07-23.md` | 是 | clean | 2026-07-23 14:05 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 6 | 1 | 5 | 0 | 0 | 0 |
| `docs/cheng-exact-def-rewrite-design.md` | 是 | clean | 2026-08-25 16:01 | f7a88ae28 Thu Aug 27 01:30:28 2026 +0800 | 5 | 1 | 4 | 0 | 0 | 0 |
| `docs/harmony-m3-threefile-emit-spec.md` | 是 | clean | 2026-07-14 13:53 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 8 | 4 | 4 | 0 | 0 | 0 |
| `docs/global_roadmap.md` | 是 | clean | 2026-09-08 11:02 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 3 | 0 | 3 | 0 | 0 | 0 |
| `docs/pending-patches-20260714/gsub_v2_full.patch` | **否** | clean | 2026-07-16 10:48 | untracked | 37 | 20 | 1 | 0 | 16 | 0 |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md` | 是 | clean | 2026-09-05 15:43 | d05bce591 Tue Sep 8 18:53:50 2026 +0800 | 24 | 10 | 1 | 0 | 13 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w113_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 4 | 0 | 2 | 0 | 2 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_fullgo_0910_append.md` | 是 | clean | 2026-09-10 23:00 | fa08177da Thu Sep 10 23:01:39 2026 +0800 | 18 | 15 | 2 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w95_append.md` | 是 | clean | 2026-09-02 14:38 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 12 | 9 | 2 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w131_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 5 | 3 | 2 | 0 | 0 | 0 |
| `docs/cheng-minimal-kernel-plan.md` | 是 | clean | 2026-09-10 23:00 | fa08177da Thu Sep 10 23:01:39 2026 +0800 | 11 | 6 | 1 | 0 | 4 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_ratchet_diag_append.md` | 是 | clean | 2026-09-10 23:00 | fa08177da Thu Sep 10 23:01:39 2026 +0800 | 12 | 8 | 1 | 0 | 3 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/batch7_gate.txt` | **否** | clean | 2026-09-10 08:51 | untracked | 6 | 2 | 1 | 0 | 3 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md` | 是 | clean | 2026-09-10 20:00 | 67e7d92f2 Thu Sep 10 21:33:21 2026 +0800 | 54 | 42 | 0 | 0 | 12 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/selfhost_o2_census.md` | 是 | clean | 2026-09-10 23:00 | fa08177da Thu Sep 10 23:01:39 2026 +0800 | 15 | 12 | 1 | 0 | 2 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_annot_release_append.md` | 是 | clean | 2026-09-08 07:35 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 3 | 1 | 1 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_r2c2_verdicts_append.md` | 是 | clean | 2026-09-07 18:38 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 4 | 2 | 1 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w140_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 0 | 1 | 0 | 1 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/ATTRIBUTION.md` | 是 | clean | 2026-09-10 05:58 | 9dd7a2bcd Thu Sep 10 08:53:07 2026 +0800 | 3 | 1 | 1 | 0 | 1 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/ghost_fix/FIX.md` | 是 | clean | 2026-09-10 08:28 | 9dd7a2bcd Thu Sep 10 08:53:07 2026 +0800 | 5 | 3 | 1 | 0 | 0 | 1 |
| `docs/pure-cheng-kernel-master-plan.md` | 是 | clean | 2026-09-08 20:41 | 22aef12b3 Tue Sep 8 21:01:36 2026 +0800 | 2 | 0 | 1 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md` | 是 | clean | 2026-09-10 21:32 | 67e7d92f2 Thu Sep 10 21:33:21 2026 +0800 | 45 | 35 | 0 | 0 | 10 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wip_full.patch` | 是 | clean | 2026-09-01 04:03 | 827eac199 Tue Sep 1 04:22:36 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_gen2f8_append.md` | **否** | **dirty** | 2026-09-09 10:12 | untracked | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_parseperf_4_append.md` | 是 | clean | 2026-09-08 16:09 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_enum_cold_append.md` | 是 | clean | 2026-09-05 12:41 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 4 | 3 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phasec_batch2_append.md` | 是 | clean | 2026-09-06 02:59 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 2 | 1 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_time_exactmemo_append.md` | 是 | clean | 2026-09-06 01:53 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_typed3_append.md` | 是 | clean | 2026-09-07 15:32 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 3 | 2 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w101_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w136_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w137_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 1 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w146_append.md` | 是 | clean | 2026-09-04 19:43 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w151_append.md` | 是 | clean | 2026-09-05 12:41 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w152_append.md` | 是 | clean | 2026-09-05 12:41 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/findings.md` | 是 | clean | 2026-09-10 19:27 | 892569834 Thu Sep 10 19:46:34 2026 +0800 | 4 | 3 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/logs/t1_cloneinto_loop.err` | 是 | clean | 2026-09-10 05:23 | 9dd7a2bcd Thu Sep 10 08:53:07 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/logs/t1b_cloneinto_loop.err` | 是 | clean | 2026-09-10 05:33 | 9dd7a2bcd Thu Sep 10 08:53:07 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/ghost_fix/DETACH_SWEEP.md` | 是 | clean | 2026-09-10 12:10 | e7e38d76a Thu Sep 10 12:40:46 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/cheng-exact-def-batch4-merge-spec.md` | 是 | clean | 2026-08-25 18:19 | f7a88ae28 Thu Aug 27 01:30:28 2026 +0800 | 8 | 7 | 1 | 0 | 0 | 0 |
| `docs/cheng-exact-def-batch6-materialize-spec.md` | 是 | clean | 2026-08-25 19:39 | f7a88ae28 Thu Aug 27 01:30:28 2026 +0800 | 3 | 2 | 1 | 0 | 0 | 0 |
| `docs/computer_use_r2c_campaign.md` | 是 | clean | 2026-07-15 01:40 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 2 | 1 | 1 | 0 | 0 | 0 |
| `docs/harmony-host-codegen-migration-plan.md` | 是 | clean | 2026-07-26 01:14 | a7ee2da19 Sun Jul 26 19:32:30 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/lane-parallel-coordination.md` | 是 | clean | 2026-09-08 20:41 | 22aef12b3 Tue Sep 8 21:01:36 2026 +0800 | 2 | 1 | 1 | 0 | 0 | 0 |
| `docs/pending-patches-20260714/slice8_genc_handoff/README.md` | 是 | clean | 2026-07-14 04:16 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/xiaoyou-s6-device-probe-gate.md` | 是 | clean | 2026-07-25 20:31 | a7ee2da19 Sun Jul 26 19:32:30 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `openspec/proposals/backend-line-rescan-removal.md` | 是 | clean | 2026-07-15 01:36 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `openspec/proposals/transpile-closure-subsystem.md` | 是 | clean | 2026-06-13 15:25 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 1 | 0 | 1 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/design/incremental-forest-consumption.md` | 是 | clean | 2026-09-10 22:52 | 0fbf58d63 Thu Sep 10 22:53:20 2026 +0800 | 45 | 38 | 0 | 0 | 7 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pa_s1b_edit_plan.md` | 是 | clean | 2026-09-10 22:54 | 0b37f7ea7 Thu Sep 10 22:54:57 2026 +0800 | 18 | 13 | 0 | 0 | 5 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w98_append.md` | 是 | clean | 2026-09-02 14:44 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 4 | 1 | 0 | 0 | 3 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/design/strict-closure-k3-split.md` | 是 | clean | 2026-09-10 17:45 | f92f573f2 Thu Sep 10 19:47:36 2026 +0800 | 39 | 37 | 0 | 0 | 2 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w106_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 8 | 6 | 0 | 0 | 2 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w117e_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 5 | 3 | 0 | 0 | 1 | 1 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w132_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 6 | 4 | 0 | 0 | 2 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w97_append.md` | 是 | clean | 2026-09-02 14:07 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 3 | 1 | 0 | 0 | 2 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_wallcensus_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 3 | 1 | 0 | 0 | 2 | 0 |
| `docs/campaigns/2026-09-06-csg-asset-pipeline/findings.md` | 是 | clean | 2026-09-07 12:29 | 01098da25 Mon Sep 7 15:05:26 2026 +0800 | 3 | 1 | 0 | 0 | 2 | 0 |
| `docs/campaigns/2026-09-06-csg-semantic-physical-world-video/findings.md` | 是 | clean | 2026-09-08 19:07 | 6af0971ff Tue Sep 8 19:07:43 2026 +0800 | 3 | 1 | 0 | 0 | 2 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/wall2_fix/FIX.md` | 是 | clean | 2026-09-10 12:36 | e7e38d76a Thu Sep 10 12:40:46 2026 +0800 | 5 | 3 | 0 | 0 | 2 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/HANDOFF_20260910_fullgo.md` | 是 | clean | 2026-09-10 23:00 | fa08177da Thu Sep 10 23:01:39 2026 +0800 | 3 | 2 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/s1b0_step.patch` | **否** | clean | 2026-09-10 21:16 | untracked | 2 | 1 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall150.patch` | **否** | clean | 2026-09-05 12:41 | untracked | 1 | 0 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_bigsrc_append.md` | **否** | **dirty** | 2026-09-09 06:01 | untracked | 1 | 0 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_gen2r2_append.md` | **否** | **dirty** | 2026-09-09 18:17 | untracked | 2 | 1 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_bc2_append.md` | 是 | clean | 2026-09-05 15:28 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 0 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_bc_append.md` | 是 | clean | 2026-09-05 12:41 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 0 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_constr_freeze_append.md` | 是 | clean | 2026-09-05 19:12 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 2 | 1 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_objreg_append.md` | 是 | clean | 2026-09-05 21:25 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 0 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w103_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 1 | 0 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w105_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 1 | 0 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w107_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 3 | 2 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w107b_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 4 | 3 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w117f_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 5 | 4 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w118_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 1 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w123_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 3 | 2 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w148_append.md` | 是 | clean | 2026-09-04 22:50 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 0 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_whenblock_append.md` | 是 | clean | 2026-09-06 23:41 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 3 | 2 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/darwin_authority/DESIGN.md` | 是 | clean | 2026-09-10 14:53 | b6b4816e4 Thu Sep 10 15:03:51 2026 +0800 | 1 | 0 | 0 | 0 | 0 | 1 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/ghost_linux_lane/RECIPE.md` | 是 | clean | 2026-09-10 17:35 | 892569834 Thu Sep 10 19:46:34 2026 +0800 | 2 | 1 | 0 | 0 | 1 | 0 |
| `docs/computer-use-coverage-baseline-2026-07-23.md` | 是 | clean | 2026-07-23 10:49 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 1 | 0 | 0 | 0 | 1 | 0 |
| `openspec/proposals/pure-cheng-rsi.md` | 是 | clean | 2026-09-10 18:09 | f92f573f2 Thu Sep 10 19:47:36 2026 +0800 | 5 | 4 | 0 | 0 | 1 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/design/bake_opt_design.md` | 是 | clean | 2026-09-08 20:58 | 22aef12b3 Tue Sep 8 21:01:36 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/design/m3_install_surface_plan.md` | 是 | clean | 2026-09-10 20:00 | 67e7d92f2 Thu Sep 10 21:33:21 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall128.patch` | **否** | clean | 2026-09-04 16:30 | untracked | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall130.patch` | **否** | clean | 2026-09-04 16:30 | untracked | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall131.patch` | **否** | clean | 2026-09-04 16:30 | untracked | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall133.patch` | **否** | clean | 2026-09-04 16:30 | untracked | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall134.patch` | **否** | clean | 2026-09-04 16:30 | untracked | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall135.patch` | **否** | clean | 2026-09-04 16:30 | untracked | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall136.patch` | **否** | clean | 2026-09-04 16:30 | untracked | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall137.patch` | **否** | clean | 2026-09-04 16:30 | untracked | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall139.patch` | **否** | clean | 2026-09-04 16:30 | untracked | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall141.patch` | **否** | clean | 2026-09-04 16:30 | untracked | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_bootparse_census_append.md` | 是 | clean | 2026-09-05 14:33 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_gen2_w1_append.md` | 是 | clean | 2026-09-06 06:46 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 3 | 3 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_gen2break_1_append.md` | 是 | clean | 2026-09-07 06:41 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_a_append.md` | 是 | clean | 2026-09-05 12:41 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_csg_append.md` | 是 | clean | 2026-09-05 12:41 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 7 | 7 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_parser_append.md` | 是 | clean | 2026-09-05 08:46 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 6 | 6 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_parser_w2_append.md` | 是 | clean | 2026-09-06 19:45 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phasec_w5_append.md` | 是 | clean | 2026-09-05 07:13 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_r2c2_c4_append.md` | 是 | clean | 2026-09-07 22:13 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_r4_pickup_gates_append.md` | 是 | clean | 2026-09-06 12:56 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 13 | 13 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_seq_bridge_append.md` | 是 | clean | 2026-09-08 09:11 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_seq_fieldget_append.md` | 是 | clean | 2026-09-08 11:02 | c73861e56 Mon Sep 7 18:27:23 2026 +0800 | 7 | 7 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_tamem_model_append.md` | 是 | clean | 2026-09-10 23:00 | fa08177da Thu Sep 10 23:01:39 2026 +0800 | 3 | 3 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w100_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w108_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w108b_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w110_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 3 | 3 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w112_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w117c_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w117d_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w120_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w121b_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w122_append.md` | 是 | clean | 2026-09-10 23:00 | fa08177da Thu Sep 10 23:01:39 2026 +0800 | 9 | 9 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w125_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w128_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w130_append.md` | 是 | clean | 2026-09-10 22:59 | fa08177da Thu Sep 10 23:01:39 2026 +0800 | 12 | 12 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w134_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 5 | 5 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w135_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 5 | 5 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w138_append.md` | 是 | clean | 2026-09-04 16:30 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w142_append.md` | 是 | clean | 2026-09-04 18:14 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w143_append.md` | 是 | clean | 2026-09-04 18:00 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 6 | 6 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w147_append.md` | 是 | clean | 2026-09-04 21:15 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w94_append.md` | 是 | clean | 2026-09-02 13:03 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 3 | 3 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w99_append.md` | 是 | clean | 2026-09-02 16:00 | 765080522 Tue Sep 8 18:55:39 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/phase_c_recon.md` | 是 | clean | 2026-09-04 16:44 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 2 | 2 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/compiler_domain_c1c2_contract.md` | 是 | clean | 2026-09-08 23:23 | bafd0ab66 Tue Sep 8 23:23:21 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/logs/s11_add_borrowed_managed.run2.err` | 是 | clean | 2026-09-10 05:28 | 9dd7a2bcd Thu Sep 10 08:53:07 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/logs/s11_add_borrowed_managed.run3.err` | 是 | clean | 2026-09-10 05:28 | 9dd7a2bcd Thu Sep 10 08:53:07 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/logs/s11_add_borrowed_managed.run4.err` | 是 | clean | 2026-09-10 05:28 | 9dd7a2bcd Thu Sep 10 08:53:07 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/logs/s11_add_borrowed_managed.run5.err` | 是 | clean | 2026-09-10 05:28 | 9dd7a2bcd Thu Sep 10 08:53:07 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/logs/s13_add_borrowed_str.err` | 是 | clean | 2026-09-10 05:29 | 9dd7a2bcd Thu Sep 10 08:53:07 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/cheng-csg-pickup-design.md` | 是 | clean | 2026-09-03 11:05 | 69817b8b2 Sat Sep 5 02:56:27 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/cheng-csg-video-facts-bytes-plan.md` | 是 | clean | 2026-08-30 09:48 | a51113b7a Tue Sep 1 04:19:45 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/cheng-exact-def-batch2-walker-spec.md` | 是 | clean | 2026-08-25 17:07 | f7a88ae28 Thu Aug 27 01:30:28 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/cheng-exact-def-batch3-identity-spec.md` | 是 | clean | 2026-08-25 17:43 | f7a88ae28 Thu Aug 27 01:30:28 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| `docs/cheng-exact-def-batch5-authority-spec.md` | 是 | clean | 2026-08-25 19:19 | f7a88ae28 Thu Aug 27 01:30:28 2026 +0800 | 4 | 4 | 0 | 0 | 0 | 0 |
| `docs/memory-time-limits-plan.md` | 是 | clean | 2026-09-10 22:54 | 0b37f7ea7 Thu Sep 10 22:54:57 2026 +0800 | 5 | 5 | 0 | 0 | 0 | 0 |
| `docs/webtransport-h3-realclient-gap.md` | 是 | clean | 2026-07-14 15:05 | f681cad2b Fri Jul 24 09:23:20 2026 +0800 | 1 | 1 | 0 | 0 | 0 | 0 |
| **合计** | | | | | **1030** | **614** | **238** | **15** | **149** | **14** |

## ② 危险类逐条明细

判定标准：HEAD 锚点行内容与文档描述不符，且描述对象在 HEAD 已消失或无唯一候选。

共 **15** 条。

### 危-1 `docs/campaigns/2026-08-31-kernel-userpath/r2_closure_ops_map.md:97` → `src/core/backend/system_link_exec.cheng:39`

- 文档原文片段：4. **新增暗道（本轮实锚）**：`system_link_exec.cheng:39 → backend2_pipeline`；
- 该行号实测内容（HEAD :39，所在位置：文件顶部（非函数内））：`import cheng/core/backend/object_plan as objplan`
- 写作提交（`765080522`）同行内容：`import cheng/core/backend/object_plan as objplan`
- 判据：DANGER-manual-gone — 人工核实：文档「实锚：system_link_exec.cheng:39 → backend2_pipeline」；HEAD :39 = `import cheng/core/backend/object_plan as objplan`，全文件已无 `backend2_pipeline` import（:6052 注释明写「本文件不再 import backend2_pipeline」）
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-2 `docs/campaigns/2026-08-31-kernel-userpath/r2_closure_ops_map.md:99` → `src/core/backend2/backend2_lower.cheng:25`

- 文档原文片段：`aarch64_encode`+`x86_64_body_emit`（backend2_lower.cheng:25-26、
- 该行号实测内容（HEAD :25，所在位置：文件顶部（非函数内））：`import cheng/core/backend/system_link_plan as slplan`
- 写作提交（`765080522`）同行内容：`import cheng/core/backend/system_link_plan as slplan`
- 判据：DANGER-manual-gone — 人工核实：文档「backend2_lower.cheng:25-26 裸 import aarch64_encode+x86_64_body_emit」；HEAD :25 = `import ... system_link_plan as slplan`，全 `src/core/backend2/*.cheng` 已无这两个模块的任何引用
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-3 `docs/campaigns/2026-08-31-kernel-userpath/r2_closure_ops_map.md:100` → `src/core/backend2/backend2_lower_slots.cheng:39`

- 文档原文片段：backend2_lower_slots.cheng:39-40、backend2_lower_stmt.cheng:24-25、
- 该行号实测内容（HEAD :39，所在位置：文件顶部（非函数内））：`import cheng/core/backend/system_link_plan as slplan`
- 写作提交（`765080522`）同行内容：`import cheng/core/backend/system_link_plan as slplan`
- 判据：DANGER-manual-gone — 人工核实：同上：文档点名的 `aarch64_encode`+`x86_64_body_emit` 裸 import 在 backend2 全目录已 0 命中；HEAD :39 = `import ... system_link_plan as slplan`
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-4 `docs/campaigns/2026-08-31-kernel-userpath/r2_closure_ops_map.md:100` → `src/core/backend2/backend2_lower_stmt.cheng:24`

- 文档原文片段：backend2_lower_slots.cheng:39-40、backend2_lower_stmt.cheng:24-25、
- 该行号实测内容（HEAD :24，所在位置：文件顶部（非函数内））：`import cheng/core/backend/system_link_plan as slplan`
- 写作提交（`765080522`）同行内容：`import cheng/core/backend/system_link_plan as slplan`
- 判据：DANGER-manual-gone — 人工核实：同上：HEAD :24 = `import ... system_link_plan as slplan`，描述对象已消失
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-5 `docs/campaigns/2026-08-31-kernel-userpath/r2_closure_ops_map.md:101` → `src/core/backend2/backend2_lower_util.cheng:21`

- 文档原文片段：backend2_lower_util.cheng:21-22）；`backend2_assemble.cheng:16` 裸 import
- 该行号实测内容（HEAD :21，所在位置：文件顶部（非函数内））：`import cheng/core/backend/system_link_plan as slplan`
- 写作提交（`765080522`）同行内容：`import cheng/core/backend/system_link_plan as slplan`
- 判据：DANGER-manual-gone — 人工核实：同上：HEAD :21 = `import ... system_link_plan as slplan`，描述对象已消失
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-6 `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_ab_prep_append.md:43` → `src/core/backend/system_link_exec.cheng:39`

- 文档原文片段：`system_link_exec.cheng:39 → backend2_pipeline`），从入口重算闭包 = 172 文件，
- 该行号实测内容（HEAD :39，所在位置：文件顶部（非函数内））：`import cheng/core/backend/object_plan as objplan`
- 写作提交（`765080522`）同行内容：`import cheng/core/backend/object_plan as objplan`
- 判据：DANGER-manual-gone — 人工核实：同 r2_closure_ops_map:97：该 import 已删除，锚点行现为 `object_plan` import
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-7 `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_r2c_c6_append.md:32` → `src/core/backend/system_link_exec.cheng:39`

- 文档原文片段：- `system_link_exec.cheng:39 import backend2_pipeline as pobj2` 删除（唯一 kernel 侧
- 该行号实测内容（HEAD :39，所在位置：文件顶部（非函数内））：`import cheng/core/backend/object_plan as objplan`
- 写作提交（`765080522`）同行内容：`import cheng/core/backend/object_plan as objplan`
- 判据：DANGER-manual-gone — 人工核实：同 r2_closure_ops_map:97：该 import 已删除，锚点行现为 `object_plan` import
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-8 `docs/cheng-csg-lsp-debugger-fusion.md:378` → `src/core/tooling/backend_driver_dispatch_min.cheng:2629`

- 文档原文片段：2. **`src/core/tooling/backend_driver_dispatch_min.cheng:2629`**：在 `BackendDriverDispatchMinAddProgramSupportBaseRoots` 内 `get_stdout` 行后加 `BackendDriverDispatchMinAddRootUnique(roots, seen, "get_stdin")`。
- 该行号实测内容（HEAD :2629，所在位置：`BackendDriverDispatchMinAppendFullTheoryReport`@2477）：`if !BackendDriverDispatchMinFullRssMemoryModelTryBuild(rssSourceTextBytes,`
- 写作提交（`f681cad2b`）同行内容：`BackendDriverDispatchMinAppendLine(out, Fmt"lowering_resolved_call_snapshot_entry_count={strings.IntToStr(lower.LoweringResolvedCallFactSnapshotEntryCount(loweringPlan))}")`
- 判据：DANGER-vanished — 文档点名符号 get_stdout 在 HEAD 目标文件已不存在（写作提交 :[4093] 存在）；锚点行 2629 现属 BackendDriverDispatchMinAppendFullTheoryReport@2477；正确锚点未定位
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-9 `docs/cheng-csg-lsp-debugger-fusion.md:414` → `src/core/tooling/backend_driver_dispatch_min.cheng:2629`

- 文档原文片段：用户授权 rebuild 后，补齐 selfhost root 注册镜像：`dispatch_min.cheng:2629` + `system_link_exec_runtime_direct.cheng:377` + `system_link_exec_runtime.cheng:1280` 各加 `"get_stdin"`（镜像 `"get_stdout"`，dispatch_min 改点在 op-lane `@2646` hunk 之前的未变区，op-lane WIP 完好保留）。`tools/ci_gate.sh:45` 确认 selfhost 构建命令 = `cheng.stage3 build-backend-driver`；`--out:<temp>` 可输出到临时位不覆写共享 driver。
- 该行号实测内容（HEAD :2629，所在位置：`BackendDriverDispatchMinAppendFullTheoryReport`@2477）：`if !BackendDriverDispatchMinFullRssMemoryModelTryBuild(rssSourceTextBytes,`
- 写作提交（`f681cad2b`）同行内容：`BackendDriverDispatchMinAppendLine(out, Fmt"lowering_resolved_call_snapshot_entry_count={strings.IntToStr(lower.LoweringResolvedCallFactSnapshotEntryCount(loweringPlan))}")`
- 判据：DANGER-vanished — 文档点名符号 get_stdin 在 HEAD 目标文件已不存在（写作提交 :[4094] 存在）；锚点行 2629 现属 BackendDriverDispatchMinAppendFullTheoryReport@2477；正确锚点未定位
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-10 `docs/pending-work-ledger-2026-07-14.md:149` → `src/libp2p/muxers/muxer.cheng:305`

- 文档原文片段：> ★2026-07-16 23:1x 收割批次六十二: `2467161d9` **#124 三轮根修落账**(33 文件 +498/-24, 双镜头 CONFIRMED): exact-first 两阶段 per-alias 裁决(cold_resolve_call_tier_exact_first)破 WAN crypto.getField 假歧义墙。三轮全史: r1 tier1 继承逐别名早 die(import 序定生死)→r2 机制零 bug 但论据不可复现→r3 论据重建(机制逐字节零改动+connection.newConnection 真证据 A/B 双变体实测: muxer.cheng:305 同一物理模块双别名导入系真实可达生产代码, 扁平并集变体假歧义死蒸馏夹具 r3conn+旧 backend2_lower 断言三次独立不可复现**明文撤回入源码注释**)。两既有
- 该行号实测内容（HEAD :305，所在位置：`muxerAllocStream`@298）：`return Ok[int32](i)`
- 写作提交（`f681cad2b`）同行内容：`var conn: streamconn.Connection = newConnection(emptyMultiAddress(), emptyMultiAddress(), streamconn.Outbound)`
- 判据：DANGER-vanished — 文档点名符号 newConnection 在 HEAD 目标文件已不存在（写作提交 :[305] 存在）；锚点行 305 现属 muxerAllocStream@298；正确锚点未定位
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-11 `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md:183` → `src/core/tooling/root_discovery.cheng:12`

- 文档原文片段：`src/core/tooling/root_discovery.cheng:12` —— cold 路径/`cc cheng_cold.c` 命令。
- 该行号实测内容（HEAD :12，所在位置：`CompilerRootSeedExists`@8）：`let seedPath = chengpath.PathAbsolute(dir, "bootstrap/stage1_bootstrap.cheng")`
- 写作提交（`40265748a`）同行内容：`let coldPath = chengpath.PathAbsolute(dir, "bootstrap/cheng_cold.c")`
- 判据：DANGER-gone — 行内容已变、描述符号在 HEAD 无任何候选、写作窗口亦未命中；正确锚点未定位
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-12 `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md:531` → `src/core/runtime/provider_root.cheng:14`

- 文档原文片段：- C 冷链 9：`provider_root.cheng:14`、`bootstrap_contracts.cheng:109`、
- 该行号实测内容（HEAD :14，所在位置：`RuntimeProviderRoot`@8）：`let seedPath = chengpath.PathAbsolute(discoveredRoot, "bootstrap/stage1_bootstrap.cheng")`
- 写作提交（`40265748a`）同行内容：`chengpath.PathFileExists(chengpath.PathAbsolute(discoveredRoot, "bootstrap/cheng_cold.c")):`
- 判据：DANGER-gone — 行内容已变、描述符号在 HEAD 无任何候选、写作窗口亦未命中；正确锚点未定位
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-13 `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md:533` → `src/core/tooling/root_discovery.cheng:12`

- 文档原文片段：`gate_main.cheng:1825/:2636/:6760`、`root_discovery.cheng:12`。
- 该行号实测内容（HEAD :12，所在位置：`CompilerRootSeedExists`@8）：`let seedPath = chengpath.PathAbsolute(dir, "bootstrap/stage1_bootstrap.cheng")`
- 写作提交（`40265748a`）同行内容：`let coldPath = chengpath.PathAbsolute(dir, "bootstrap/cheng_cold.c")`
- 判据：DANGER-gone — 行内容已变、描述符号在 HEAD 无任何候选、写作窗口亦未命中；正确锚点未定位
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-14 `openspec/proposals/cheng-v2-in-place-refactor.md:38` → `src/core/tooling/backend_driver_dispatch_min.cheng:1686`

- 文档原文片段：**口径修正（supersede 上文 22 not_ready 基线）：** 2026-06-26 pinned-driver obj 闭包基线 = 22 not_ready（21 statement_sequence + 1 Join，main@9445a97a0）。codesign 修复解锁 census 后，2026-06-27 11:16 `build-backend-driver --require-rebuild`（compiler_main full-superset 自编，ZC dump 口径 `dispatch_min.cheng:1686` unconditional count）实测 **`ZC_NOT_READY_TOTAL count=5`** —— op-lane 当日连环 bail-closing 提交（631 Fmt / 717 / 805-806 / b
- 该行号实测内容（HEAD :1686，所在位置：`BackendDriverDispatchMinCheckedMathMul`@1674）：``
- 写作提交（`f681cad2b`）同行内容：`reason: var str): bool =`
- 判据：DANGER-vanished — 文档点名符号 ZC_NOT_READY_TOTAL 在 HEAD 目标文件已不存在（写作提交 :[2689] 存在）；锚点行 1686 现属 BackendDriverDispatchMinCheckedMathMul@1674；正确锚点未定位
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### 危-15 `openspec/proposals/deterministic-memory-lifecycle.md:39` → `src/core/tooling/backend_driver_dispatch_min.cheng:4257`

- 文档原文片段：- CSG 到 Lowering 的真实交接位于 `lowering_plan.cheng:5397-5448`：`exprLayer`、expr-slice、resolved-call 采用“赋值后源置空”，TypedIR 使用 `TypedExprIrMoveInto`。`5401/5417/5419/5426/5446` 五个失败出口都可能发生在部分 move 后。成功路径 `5501` 已释放 CompilerCSG，上层 `system_link_exec.cheng:1524` 与 `backend_driver_dispatch_min.cheng:4257` 又重复调用同一 release；严格 ledger 会把它判成重复释放，必须先统一成唯一 cleanup owner。
- 该行号实测内容（HEAD :4257，所在位置：`BackendDriverDispatchMinReadStablePinnedFileSha256Hex`@4239）：`if pinnedOk:`
- 写作提交（`f681cad2b`）同行内容：`for i in 0..<primaryPlan.relocTargetSymbols.len:`
- 判据：DANGER-vanished — 文档点名符号 CompilerCSG 在 HEAD 目标文件已不存在（写作提交 :[7584] 存在）；锚点行 4257 现属 BackendDriverDispatchMinReadStablePinnedFileSha256Hex@4239；正确锚点未定位
- **正确锚点：未定位**（描述对象已从该文件消失或无法唯一定位）

### ②b 高危漂移子集：`DRIFT-stale-birth` 筛查结果

这是本任务书最关心的一类：**行号自写作提交起没有发生过漂移，但行号处内容与文档描述不符（写作时行号就已经错了）**，单靠 diff/git 历史察觉不到，只能靠读行比对。

机检初判 25 条候选，**经逐条人工读行复核后保留 0 条**：其中 12 条改判「仍成立」（描述与被指向的行内容一致，只是文档没用反引号点名符号，机检匹配不到）、4 条改判「已漂移但可定位」（如 `cleanup_cfg.cheng:15331`→`:15358`、`compiler_snapshot_schema.cheng:5599`→`:5621`）、7 条改判「危险」（见②，文档点名的 import/函数已从目标文件消失）、5 条降级为「不确定」（见⑤.2）。

**结论：本审计的机检方法无法可靠识别这一类**（初判 25 条里绝大多数是误报），②b 保留 0 条不等于该风险为 0。旁证：本轮审计期间并行落库的 `fa08177da`（“全树行号锚点回改 11 份/16 hunk”）修掉的正是这一类（如 `primary_object_plan.cheng:65411→65423` 仅差 4 行就跨函数、`release-green-contract-inventory.md` 的 `primary_object_plan.cheng:60116→63951` Δ+3835），说明该类真实存在，只能靠**读行 + 点名符号 grep** 发现，不能靠行号 diff。

## ③ 漂移类逐条明细

共 **238** 条。`新行号` 一列：`DRIFT-remap` 为 diff 重映射后的精确行（内容逐字节相同）；`DRIFT-symbol` 为描述符号唯一加权命中行；`function-only` 表示只定位到函数头（函数内具体行未定位，按「不确定」使用）。

### `docs/campaigns/2026-08-31-kernel-userpath/VERIFY.md`（61 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `178` | `parser.cheng:31764` | `:32228` | DRIFT-remap | 原锚点行内容整体平移 31764->32228（diff 重映射，内容逐字节相同） |
| `248` | `lowering_plan.cheng:6925` | `:7005` | DRIFT-remap | 原锚点行内容整体平移 6925->7005（diff 重映射，内容逐字节相同） |
| `249` | `lowering_plan.cheng:6957` | `:7037` | DRIFT-remap | 原锚点行内容整体平移 6957->7037（diff 重映射，内容逐字节相同） |
| `250` | `lowering_plan.cheng:7648` | `:7728` | DRIFT-remap | 原锚点行内容整体平移 7648->7728（diff 重映射，内容逐字节相同） |
| `251` | `lowering_plan.cheng:25870` | `:26045` | DRIFT-remap | 原锚点行内容整体平移 25870->26045（diff 重映射，内容逐字节相同） |
| `252` | `system_link_exec.cheng:5314` | `:5423` | DRIFT-remap | 原锚点行内容整体平移 5314->5423（diff 重映射，内容逐字节相同） |
| `465` | `compiler_parser_receipt.cheng:10976` | `:10994` | DRIFT-remap | 原锚点行内容整体平移 10976->10994（diff 重映射，内容逐字节相同） |
| `580` | `typed_expr.cheng:28347` | `:28834` | DRIFT-remap | 原锚点行内容整体平移 28347->28834（diff 重映射，内容逐字节相同） |
| `592` | `typed_expr.cheng:28347` | `:28834` | DRIFT-remap | 原锚点行内容整体平移 28347->28834（diff 重映射，内容逐字节相同） |
| `630` | `typed_expr.cheng:58710` | `:59525` | DRIFT-remap | 原锚点行内容整体平移 58710->59525（diff 重映射，内容逐字节相同） |
| `667` | `compiler_snapshot_schema.cheng:10291` | `:10499` | DRIFT-remap | 原锚点行内容整体平移 10291->10499（diff 重映射，内容逐字节相同） |
| `710` | `parser.cheng:5455` | `:5615` | DRIFT-remap | 原锚点行内容整体平移 5455->5615（diff 重映射，内容逐字节相同） |
| `808` | `compiler_snapshot_builder.cheng:14284` | `:14718` | DRIFT-remap | 原锚点行内容整体平移 14284->14718（diff 重映射，内容逐字节相同） |
| `809` | `parser.cheng:22393` | `:22614` | DRIFT-remap | 原锚点行内容整体平移 22393->22614（diff 重映射，内容逐字节相同） |
| `857` | `typed_expr.cheng:28347` | `:28834` | DRIFT-remap | 原锚点行内容整体平移 28347->28834（diff 重映射，内容逐字节相同） |
| `874` | `compiler_snapshot_builder.cheng:14905` | `:15339` | DRIFT-remap | 原锚点行内容整体平移 14905->15339（diff 重映射，内容逐字节相同） |
| `1008` | `typed_expr_frag_codec.cheng:1367` | `:1417` | DRIFT-remap | 原锚点行内容整体平移 1367->1417（diff 重映射，内容逐字节相同） |
| `1043` | `typed_expr.cheng:45586` | `:46234` | DRIFT-remap | 原锚点行内容整体平移 45586->46234（diff 重映射，内容逐字节相同） |
| `1044` | `typed_expr.cheng:60408` | `:61256` | DRIFT-remap | 原锚点行内容整体平移 60408->61256（diff 重映射，内容逐字节相同） |
| `1045` | `typed_expr.cheng:63258` | `:64113` | DRIFT-remap | 原锚点行内容整体平移 63258->64113（diff 重映射，内容逐字节相同） |
| `1054` | `typed_expr.cheng:44485` | `:45011` | DRIFT-remap | 原锚点行内容整体平移 44485->45011（diff 重映射，内容逐字节相同） |
| `1060` | `typed_expr.cheng:44022` | `:44548` | DRIFT-remap | 原锚点行内容整体平移 44022->44548（diff 重映射，内容逐字节相同） |
| `1206` | `typed_expr.cheng:25370` | `:25827` | DRIFT-remap | 原锚点行内容整体平移 25370->25827（diff 重映射，内容逐字节相同） |
| `1457` | `typed_expr.cheng:6200` | `:6384` | DRIFT-remap | 原锚点行内容整体平移 6200->6384（diff 重映射，内容逐字节相同） |
| `1561` | `primary_object_plan.cheng:56591` | `:57686` | DRIFT-remap | 原锚点行内容整体平移 56591->57686（diff 重映射，内容逐字节相同） |
| `1565` | `core_types.cheng:2850` | `:3106` | DRIFT-remap | 原锚点行内容整体平移 2850->3106（diff 重映射，内容逐字节相同） |
| `1654` | `typed_expr.cheng:24902` | `:25359` | DRIFT-remap | 原锚点行内容整体平移 24902->25359（diff 重映射，内容逐字节相同） |
| `1698` | `primary_object_plan.cheng:29627` | `:30615` | DRIFT-remap | 原锚点行内容整体平移 29627->30615（diff 重映射，内容逐字节相同） |
| `1703` | `primary_object_plan.cheng:26717` | `:27689` | DRIFT-remap | 原锚点行内容整体平移 26717->27689（diff 重映射，内容逐字节相同） |
| `1710` | `typed_expr.cheng:58859` | `:59674` | DRIFT-remap | 原锚点行内容整体平移 58859->59674（diff 重映射，内容逐字节相同） |
| `1779` | `primary_object_plan.cheng:17566` | `:18111` | DRIFT-manual | 人工核实：era :17566 `if ownership == coreir.OwnBorrowShared:` 现位于 :18111（fn PrimaryBodyIrPrepareManagedBodyOpValueDefinitionExact 由 :17531 移到 :18076）；:17566 现为 Prim |
| `1819` | `typed_expr.cheng:26313` | `:26789` | DRIFT-remap | 原锚点行内容整体平移 26313->26789（diff 重映射，内容逐字节相同） |
| `1873` | `typed_expr.cheng:21352` | `:21798` | DRIFT-remap | 原锚点行内容整体平移 21352->21798（diff 重映射，内容逐字节相同） |
| `1900` | `primary_object_plan.cheng:17566` | `:18111` | DRIFT-remap | 原锚点行内容整体平移 17566->18111（diff 重映射，内容逐字节相同） |
| `1908` | `typed_expr.cheng:5946` | `:6060` | DRIFT-remap | 原锚点行内容整体平移 5946->6060（diff 重映射，内容逐字节相同） |
| `1919` | `exact_def_freeze.cheng:2613` | `:2876` | DRIFT-remap | 原锚点行内容整体平移 2613->2876（diff 重映射，内容逐字节相同） |
| `1920` | `exact_def_identity.cheng:1404` | `:1440` | DRIFT-remap | 原锚点行内容整体平移 1404->1440（diff 重映射，内容逐字节相同） |
| `1925` | `cleanup_cfg.cheng:3838` | `:3913` | DRIFT-remap | 原锚点行内容整体平移 3838->3913（diff 重映射，内容逐字节相同） |
| `1994` | `exact_def_derive.cheng:606` | `:788` | DRIFT-remap | 原锚点行内容整体平移 606->788（diff 重映射，内容逐字节相同） |
| `2090` | `primary_object_plan.cheng:17700` | `:18397` | DRIFT-remap | 原锚点行内容整体平移 17700->18397（diff 重映射，内容逐字节相同） |
| `2093` | `exact_def_derive.cheng:388` | `:420` | DRIFT-remap | 原锚点行内容整体平移 388->420（diff 重映射，内容逐字节相同） |
| `2098` | `lowering_plan.cheng:22528` | `:22646` | DRIFT-remap | 原锚点行内容整体平移 22528->22646（diff 重映射，内容逐字节相同） |
| `2103` | `exact_def_identity.cheng:1732` | `:1851（仅函数头）` | DRIFT-function | 描述对象写作时命中 exactDefIdentityParamDefinitionValid@1686；该函数仍存于 :[1851]，锚点行 1732 现属 exactDefIdentityStackLocalDefinitionValid@1580，函数内具体行未定位 |
| `2175` | `exact_def_derive.cheng:618` | `:800` | DRIFT-remap | 原锚点行内容整体平移 618->800（diff 重映射，内容逐字节相同） |
| `2175` | `primary_object_plan.cheng:64938` | `:66099（仅函数头）` | DRIFT-function | 描述对象写作时命中 PrimaryBuildBodyIrForFunction@64932；该函数仍存于 :[66099]，锚点行 64938 现属 PrimaryObjectPlanEnsureResolveIndex@64937，函数内具体行未定位 |
| `2273` | `ownership_body_ir_production.cheng:1185` | `:1329` | DRIFT-remap | 原锚点行内容整体平移 1185->1329（diff 重映射，内容逐字节相同） |
| `2300` | `body_ir_access.cheng:1994` | `:196` | DRIFT-symbol | 描述符号 ['reachable', 'unreachable'] 加权唯一命中 :196（权重 2.00，次选 1.08） |
| `2303` | `body_ir_access.cheng:4893` | `:5464` | DRIFT-remap | 原锚点行内容整体平移 4893->5464（diff 重映射，内容逐字节相同） |
| `2504` | `ownership_body_ir_production.cheng:1182` | `:1326` | DRIFT-remap | 原锚点行内容整体平移 1182->1326（diff 重映射，内容逐字节相同） |
| `2511` | `primary_object_plan.cheng:41075` | `:42125` | DRIFT-remap | 原锚点行内容整体平移 41075->42125（diff 重映射，内容逐字节相同） |
| `2520` | `typed_expr.cheng:3716` | `:3749` | DRIFT-remap | 原锚点行内容整体平移 3716->3749（diff 重映射，内容逐字节相同） |
| `2708` | `program_support_backend.cheng:2623` | `:2929` | DRIFT-remap | 原锚点行内容整体平移 2623->2929（diff 重映射，内容逐字节相同） |
| `2755` | `typed_expr.cheng:20344` | `:20701` | DRIFT-remap | 原锚点行内容整体平移 20344->20701（diff 重映射，内容逐字节相同） |
| `2795` | `typed_expr.cheng:6070` | `:6187` | DRIFT-remap | 原锚点行内容整体平移 6070->6187（diff 重映射，内容逐字节相同） |
| `2846` | `exact_def_identity.cheng:325` | `:308（仅函数头）` | DRIFT-function | 描述对象写作时命中 exactDefIdentitySlotPartialAuthorityLine@308；该函数仍存于 :[308]，锚点行 325 现属 exactDefIdentitySlotPartialAuthorityLine@308，函数内具体行未定位 |
| `2872` | `ownership_body_ir_production.cheng:1199` | `:1343` | DRIFT-remap | 原锚点行内容整体平移 1199->1343（diff 重映射，内容逐字节相同） |
| `2873` | `exact_def_identity.cheng:325` | `:308（仅函数头）` | DRIFT-function | 描述对象写作时命中 exactDefIdentitySlotPartialAuthorityLine@308；该函数仍存于 :[308]，锚点行 325 现属 exactDefIdentitySlotPartialAuthorityLine@308，函数内具体行未定位 |
| `3009` | `exact_def_identity.cheng:325` | `:308（仅函数头）` | DRIFT-function | 描述对象写作时命中 exactDefIdentitySlotPartialAuthorityLine@308；该函数仍存于 :[308]，锚点行 325 现属 exactDefIdentitySlotPartialAuthorityLine@308，函数内具体行未定位 |
| `3057` | `typed_expr.cheng:20322` | `:20679` | DRIFT-remap | 原锚点行内容整体平移 20322->20679（diff 重映射，内容逐字节相同） |
| `3075` | `core_types.cheng:1887` | `:2143` | DRIFT-remap | 原锚点行内容整体平移 1887->2143（diff 重映射，内容逐字节相同） |
| `3075` | `cleanup_cfg.cheng:3869` | `:3944` | DRIFT-remap | 原锚点行内容整体平移 3869->3944（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/patches/wip_full.patch`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `232` | `typed_expr.cheng:39517` | `:40036` | DRIFT-remap | 原锚点行内容整体平移 39517->40036（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/r2_closure_ops_map.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `94` | `coff_object_linker.cheng:15` | `:16` | DRIFT-remap | 原锚点行内容整体平移 15->16（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/selfhost_o2_census.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `16` | `primary_object_plan.cheng:66448` | `:66099（仅函数头）` | DRIFT-function | 描述对象写作时命中 PrimaryBuildBodyIrForFunction@66087；该函数仍存于 :[66099]，锚点行 66448 现属 PrimaryBuildBodyIrForFunction@66099，函数内具体行未定位 |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_annot_release_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `16` | `parser.cheng:36184` | `:36752` | DRIFT-remap | 原锚点行内容整体平移 36184->36752（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_fullgo_0910_append.md`（2 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `264` | `compiler_csg.cheng:39060` | `:39107` | DRIFT-manual | 人工核实：HEAD :39107-39108 = `CompilerCsgFrontierParsedSourceStoreRelease(` + `work.frontierParsedSources)`（整批释放点）；:39060 现为 `var typedIrBuildIndexValidationEpochAf |
| `316` | `primary_object_plan.cheng:70296` | `:70314（仅函数头）` | DRIFT-function | 描述对象写作时命中 PrimaryObjectPlanLoweringPhaseParallelIndexes@70272；该函数仍存于 :[70314]，锚点行 70296 现属 PrimaryLowerPoolBatchReceiveAtomicityContract@70193，函数内具体行未定位 |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_gen2f8_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `51` | `compiler_csg.cheng:39062` | `:39104` | DRIFT-manual | 人工核实（该文档未跟踪、无写作提交）：HEAD :39104 = `CompilerCsgNormalizedExprLayerTerminalRelease(work.exprLayer)`（即文档所指 reset 调用）；:39062 现为轮次上界注释 |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_parseperf_4_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `102` | `parser.cheng:10601` | `:10789` | DRIFT-remap | 原锚点行内容整体平移 10601->10789（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_enum_cold_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `21` | `typed_expr.cheng:60018` | `:60057` | DRIFT-remap | 原锚点行内容整体平移 60018->60057（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phasec_batch2_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `16` | `compiler_csg.cheng:10906` | `:10911` | DRIFT-remap | 原锚点行内容整体平移 10906->10911（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_r2c2_verdicts_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `51` | `coff_object_linker.cheng:1550` | `:1436` | DRIFT-remap | 原锚点行内容整体平移 1550->1436（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_ratchet_diag_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `79` | `intern.cheng:745` | `:760` | DRIFT-remap | 原锚点行内容整体平移 745->760（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_time_exactmemo_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `52` | `typed_expr.cheng:50624` | `:50604` | DRIFT-remap | 原锚点行内容整体平移 50624->50604（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_typed3_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `41` | `compiler_csg.cheng:34648` | `:34743` | DRIFT-remap | 原锚点行内容整体平移 34648->34743（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w101_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `8` | `system.cheng:2657` | `:2680` | DRIFT-remap | 原锚点行内容整体平移 2657->2680（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w113_append.md`（2 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `3` | `parser.cheng:6259` | `:6419` | DRIFT-remap | 原锚点行内容整体平移 6259->6419（diff 重映射，内容逐字节相同） |
| `3` | `typed_expr.cheng:24295` | `:24501` | DRIFT-remap | 原锚点行内容整体平移 24295->24501（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w131_append.md`（2 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `5` | `typed_expr.cheng:9515` | `:9602` | DRIFT-remap | 原锚点行内容整体平移 9515->9602（diff 重映射，内容逐字节相同） |
| `37` | `typed_expr.cheng:9515` | `:9602` | DRIFT-remap | 原锚点行内容整体平移 9515->9602（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w136_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `7` | `cleanup_cfg.cheng:15331` | `:15358（仅函数头）` | DRIFT-manual | 人工核实：文档点名 `cleanupCfgAppendIntentReturnSnapshot`；HEAD 该函数头在 :15358（原 :15331-15336 现属 `cleanupCfgAppendIntentGuardSnapshot`@15316），函数内具体行未定位 |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w137_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `5` | `primary_object_plan.cheng:74064` | `:73973（仅函数头）` | DRIFT-function | 描述对象写作时命中 PrimaryObjectPlanEmitRegallocEntryBridge@73931；该函数仍存于 :[73973]，锚点行 74064 现属 PrimaryObjectPlanEmitRegallocEntryBridge@73973，函数内具体行未定位 |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w140_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `14` | `parser.cheng:19521` | `:19742` | DRIFT-remap | 原锚点行内容整体平移 19521->19742（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w145_append.md`（6 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `81` | `parser.cheng:34038` | `:34629` | DRIFT-remap | 原锚点行内容整体平移 34038->34629（diff 重映射，内容逐字节相同） |
| `82` | `parser.cheng:27995` | `:28377` | DRIFT-remap | 原锚点行内容整体平移 27995->28377（diff 重映射，内容逐字节相同） |
| `83` | `parser.cheng:27871` | `:28252` | DRIFT-remap | 原锚点行内容整体平移 27871->28252（diff 重映射，内容逐字节相同） |
| `84` | `parser.cheng:2068` | `:2126` | DRIFT-remap | 原锚点行内容整体平移 2068->2126（diff 重映射，内容逐字节相同） |
| `87` | `system.cheng:535` | `:552` | DRIFT-remap | 原锚点行内容整体平移 535->552（diff 重映射，内容逐字节相同） |
| `88` | `program_support_backend.cheng:5958` | `:5986` | DRIFT-remap | 原锚点行内容整体平移 5958->5986（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w146_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `19` | `program_support_backend.cheng:6390` | `:6409` | DRIFT-remap | 原锚点行内容整体平移 6390->6409（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w151_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `40` | `compiler_snapshot_schema.cheng:5599` | `:5621` | DRIFT-manual | 人工核实：文档点名 `csgCompilerTypeStructureAppendInto`；HEAD 该函数头在 :5621（grep 核实；:5599 现为 `CsgCompilerGenericParameterIdentityCidInto` 的参数行） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w152_append.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `30` | `typed_expr.cheng:39517` | `:39558` | DRIFT-remap | 原锚点行内容整体平移 39517->39558（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w95_append.md`（2 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `22` | `typed_expr_type_arena.cheng:1518` | `:1545` | DRIFT-remap | 原锚点行内容整体平移 1518->1545（diff 重映射，内容逐字节相同） |
| `23` | `compiler_snapshot_schema.cheng:9245` | `:9408` | DRIFT-manual | 人工核实：文档引用的 wall47 原文 “RefObject layout rows carry the 8/8 pointer-handle extent” HEAD 在 :9408（grep 核实），:9245-9248 现为 call target 校验的 `return false` 段 |

### `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `32` | `os.cheng:2699` | `:2721` | DRIFT-remap | 原锚点行内容整体平移 2699->2721（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-09-07-pure-cheng-rsi/findings.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `73` | `parser.cheng:32344` | `:32445` | DRIFT-remap | 原锚点行内容整体平移 32344->32445（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/ATTRIBUTION.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `108` | `parser.cheng:24` | `:25` | DRIFT-remap | 原锚点行内容整体平移 24->25（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/logs/t1_cloneinto_loop.err`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `22` | `parser.cheng:24` | `:25` | DRIFT-remap | 原锚点行内容整体平移 24->25（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/logs/t1b_cloneinto_loop.err`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `22` | `parser.cheng:24` | `:25` | DRIFT-remap | 原锚点行内容整体平移 24->25（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/ghost_fix/DETACH_SWEEP.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `25` | `typed_expr.cheng:65699` | `:65723` | DRIFT-remap | 原锚点行内容整体平移 65699->65723（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/ghost_fix/FIX.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `29` | `parser.cheng:2942` | `:2919` | DRIFT-remap | 原锚点行内容整体平移 2942->2919（diff 重映射，内容逐字节相同） |

### `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/batch7_gate.txt`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `51` | `main.cheng:260` | `:330` | DRIFT-symbol | 描述符号 ['reason', 'sha_mismatch'] 加权唯一命中 :330（权重 1.50，次选 1.00） |

### `docs/cheng-csg-lsp-debugger-fusion.md`（29 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `362` | `program_support_backend.cheng:7252` | `:17539` | DRIFT-remap | 原锚点行内容整体平移 7252->17539（diff 重映射，内容逐字节相同） |
| `402` | `program_support_backend.cheng:7252` | `:17539` | DRIFT-remap | 原锚点行内容整体平移 7252->17539（diff 重映射，内容逐字节相同） |
| `438` | `program_support_backend.cheng:7421` | `:17730` | DRIFT-remap | 原锚点行内容整体平移 7421->17730（diff 重映射，内容逐字节相同） |
| `448` | `program_support_host_runtime.cheng:540` | `:1482` | DRIFT-remap | 原锚点行内容整体平移 540->1482（diff 重映射，内容逐字节相同） |
| `464` | `typed_expr.cheng:14831` | `:20336` | DRIFT-remap | 原锚点行内容整体平移 14831->20336（diff 重映射，内容逐字节相同） |
| `472` | `typed_expr.cheng:14831` | `:20336` | DRIFT-remap | 原锚点行内容整体平移 14831->20336（diff 重映射，内容逐字节相同） |
| `472` | `typed_expr.cheng:14831` | `:20336` | DRIFT-remap | 原锚点行内容整体平移 14831->20336（diff 重映射，内容逐字节相同） |
| `474` | `typed_expr.cheng:14831` | `:20336` | DRIFT-remap | 原锚点行内容整体平移 14831->20336（diff 重映射，内容逐字节相同） |
| `478` | `typed_expr.cheng:14831` | `:20336` | DRIFT-remap | 原锚点行内容整体平移 14831->20336（diff 重映射，内容逐字节相同） |
| `487` | `typed_expr.cheng:14831` | `:20336` | DRIFT-remap | 原锚点行内容整体平移 14831->20336（diff 重映射，内容逐字节相同） |
| `487` | `typed_expr.cheng:14831` | `:20336` | DRIFT-remap | 原锚点行内容整体平移 14831->20336（diff 重映射，内容逐字节相同） |
| `497` | `system.cheng:472` | `:2539（仅函数头）` | DRIFT-function | 描述对象写作时命中 chengStrStoreCompat@417；该函数仍存于 :[2539]，锚点行 472 现属 panicCString@470，函数内具体行未定位 |
| `499` | `lsp_server.cheng:952` | `:1185` | DRIFT-remap | 原锚点行内容整体平移 952->1185（diff 重映射，内容逐字节相同） |
| `499` | `lsp_protocol.cheng:375` | `:151` | DRIFT-symbol | 描述符号 ['workspaceSymbol'] 加权唯一命中 :151（权重 1.00，次选 0.50） |
| `538` | `lsp_server.cheng:912` | `:1145` | DRIFT-remap | 原锚点行内容整体平移 912->1145（diff 重映射，内容逐字节相同） |
| `542` | `typed_expr.cheng:14831` | `:20336` | DRIFT-remap | 原锚点行内容整体平移 14831->20336（diff 重映射，内容逐字节相同） |
| `552` | `primary_object_plan.cheng:5562` | `:6366` | DRIFT-remap | 原锚点行内容整体平移 5562->6366（diff 重映射，内容逐字节相同） |
| `556` | `compiler_facts.cheng:141` | `:140` | DRIFT-remap | 原锚点行内容整体平移 141->140（diff 重映射，内容逐字节相同） |
| `564` | `compiler_facts.cheng:145` | `:144` | DRIFT-remap | 原锚点行内容整体平移 145->144（diff 重映射，内容逐字节相同） |
| `592` | `primary_object_plan.cheng:46185` | `:49537` | DRIFT-remap | 原锚点行内容整体平移 46185->49537（diff 重映射，内容逐字节相同） |
| `606` | `os.cheng:524` | `:1076` | DRIFT-remap | 原锚点行内容整体平移 524->1076（diff 重映射，内容逐字节相同） |
| `606` | `lsp_server.cheng:207` | `:266` | DRIFT-remap | 原锚点行内容整体平移 207->266（diff 重映射，内容逐字节相同） |
| `614` | `lsp_server.cheng:185` | `:242` | DRIFT-remap | 原锚点行内容整体平移 185->242（diff 重映射，内容逐字节相同） |
| `614` | `lsp_server.cheng:185` | `:242` | DRIFT-remap | 原锚点行内容整体平移 185->242（diff 重映射，内容逐字节相同） |
| `616` | `program_support_backend.cheng:2846` | `:29014` | DRIFT-symbol | 描述符号 ['SOCK_STREAM', 'framing', 'getpeereid'] 加权唯一命中 :29014（权重 3.00，次选 2.00） |
| `622` | `lsp_server.cheng:282` | `:350` | DRIFT-remap | 原锚点行内容整体平移 282->350（diff 重映射，内容逐字节相同） |
| `833` | `compiler_facts.cheng:495` | `:519` | DRIFT-remap | 原锚点行内容整体平移 495->519（diff 重映射，内容逐字节相同） |
| `835` | `compiler_facts.cheng:496` | `:520` | DRIFT-remap | 原锚点行内容整体平移 496->520（diff 重映射，内容逐字节相同） |
| `890` | `backend_driver_main.cheng:2623` | `:2322` | DRIFT-remap | 原锚点行内容整体平移 2623->2322（diff 重映射，内容逐字节相同） |

### `docs/cheng-csg-patent-candidates.md`（8 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `25` | `csg_normalize.cheng:202` | `:214` | DRIFT-remap | 原锚点行内容整体平移 202->214（diff 重映射，内容逐字节相同） |
| `26` | `csg_normalize.cheng:286` | `:298` | DRIFT-remap | 原锚点行内容整体平移 286->298（diff 重映射，内容逐字节相同） |
| `27` | `csg_normalize.cheng:418` | `:434` | DRIFT-remap | 原锚点行内容整体平移 418->434（diff 重映射，内容逐字节相同） |
| `51` | `primary_object_plan.cheng:489` | `:572` | DRIFT-remap | 原锚点行内容整体平移 489->572（diff 重映射，内容逐字节相同） |
| `112` | `typed_expr.cheng:22877` | `:31421` | DRIFT-remap | 原锚点行内容整体平移 22877->31421（diff 重映射，内容逐字节相同） |
| `132` | `lowering_plan.cheng:4942` | `:13412` | DRIFT-remap | 原锚点行内容整体平移 4942->13412（diff 重映射，内容逐字节相同） |
| `173` | `parser.cheng:3655` | `:4536` | DRIFT-remap | 原锚点行内容整体平移 3655->4536（diff 重映射，内容逐字节相同） |
| `173` | `typed_expr.cheng:2565` | `:4126` | DRIFT-remap | 原锚点行内容整体平移 2565->4126（diff 重映射，内容逐字节相同） |

### `docs/cheng-exact-def-batch4-merge-spec.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `136` | `body_ir_access.cheng:174` | `:185` | DRIFT-remap | 原锚点行内容整体平移 174->185（diff 重映射，内容逐字节相同） |

### `docs/cheng-exact-def-batch6-materialize-spec.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `60` | `backend2_lower_slots.cheng:19189` | `:19452` | DRIFT-remap | 原锚点行内容整体平移 19189->19452（diff 重映射，内容逐字节相同） |

### `docs/cheng-exact-def-rewrite-design.md`（4 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `11` | `typed_expr.cheng:3705` | `:3746` | DRIFT-remap | 原锚点行内容整体平移 3705->3746（diff 重映射，内容逐字节相同） |
| `20` | `compiler_csg.cheng:15532` | `:15565` | DRIFT-remap | 原锚点行内容整体平移 15532->15565（diff 重映射，内容逐字节相同） |
| `161` | `backend2_lower_slots.cheng:8983` | `:9209` | DRIFT-remap | 原锚点行内容整体平移 8983->9209（diff 重映射，内容逐字节相同） |
| `163` | `cleanup_cfg.cheng:15286` | `:16274` | DRIFT-remap | 原锚点行内容整体平移 15286->16274（diff 重映射，内容逐字节相同） |

### `docs/cheng-minimal-kernel-plan.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `682` | `compiler_toolchain_encoder_authority_import.cheng:290` | `:568` | DRIFT-manual | 人工核实：文档点名 `cmdline.ParamStr(0)`；HEAD 该调用在 :568（grep 核实），:290 现为 FixedBytes32Equal 判定 |

### `docs/cheng-video-e2e-miaofa-miaokai-plan.md`（5 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `10` | `native_runtime.cheng:1623` | `:1654` | DRIFT-remap | 原锚点行内容整体平移 1623->1654（diff 重映射，内容逐字节相同） |
| `11` | `native_runtime.cheng:2709` | `:2809` | DRIFT-remap | 原锚点行内容整体平移 2709->2809（diff 重映射，内容逐字节相同） |
| `12` | `rsa.cheng:1555` | `:1572` | DRIFT-remap | 原锚点行内容整体平移 1555->1572（diff 重映射，内容逐字节相同） |
| `13` | `media_moq_publisher_main.cheng:466` | `:499` | DRIFT-remap | 原锚点行内容整体平移 466->499（diff 重映射，内容逐字节相同） |
| `39` | `switch.cheng:38` | `:40` | DRIFT-remap | 原锚点行内容整体平移 38->40（diff 重映射，内容逐字节相同） |

### `docs/computer_use_r2c_campaign.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `9` | `media_moq_publisher_main.cheng:366` | `:399` | DRIFT-remap | 原锚点行内容整体平移 366->399（diff 重映射，内容逐字节相同） |

### `docs/gate-recheck-2026-07-23.md`（5 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `18` | `core_runtime_provider_darwin.cheng:4631` | `:5573` | DRIFT-remap | 原锚点行内容整体平移 4631->5573（diff 重映射，内容逐字节相同） |
| `20` | `debug_runtime_provider.cheng:389` | `:395` | DRIFT-remap | 原锚点行内容整体平移 389->395（diff 重映射，内容逐字节相同） |
| `22` | `program_support_backend.cheng:564` | `:1286` | DRIFT-remap | 原锚点行内容整体平移 564->1286（diff 重映射，内容逐字节相同） |
| `42` | `peer_id.cheng:13` | `:14` | DRIFT-remap | 原锚点行内容整体平移 13->14（diff 重映射，内容逐字节相同） |
| `60` | `native_runtime.cheng:2865` | `:2974` | DRIFT-remap | 原锚点行内容整体平移 2865->2974（diff 重映射，内容逐字节相同） |

### `docs/global_roadmap.md`（3 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `110` | `typed_expr.cheng:11674` | `:16815` | DRIFT-remap | 原锚点行内容整体平移 11674->16815（diff 重映射，内容逐字节相同） |
| `174` | `typed_expr.cheng:11674` | `:16815` | DRIFT-remap | 原锚点行内容整体平移 11674->16815（diff 重映射，内容逐字节相同） |
| `176` | `typed_expr.cheng:11838` | `:16993` | DRIFT-remap | 原锚点行内容整体平移 11838->16993（diff 重映射，内容逐字节相同） |

### `docs/harmony-host-codegen-migration-plan.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `341` | `mobile_shell_codegen.cheng:25652` | `:26695` | DRIFT-remap | 原锚点行内容整体平移 25652->26695（diff 重映射，内容逐字节相同） |

### `docs/harmony-m3-threefile-emit-spec.md`（4 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `9` | `mobile_shell_codegen.cheng:27503` | `:28548` | DRIFT-remap | 原锚点行内容整体平移 27503->28548（diff 重映射，内容逐字节相同） |
| `10` | `mobile_shell_codegen.cheng:27614` | `:28626` | DRIFT-remap | 原锚点行内容整体平移 27614->28626（diff 重映射，内容逐字节相同） |
| `16` | `mobile_shell_codegen.cheng:28413` | `:29622` | DRIFT-remap | 原锚点行内容整体平移 28413->29622（diff 重映射，内容逐字节相同） |
| `153` | `mobile_shell_codegen.cheng:27614` | `:28626` | DRIFT-remap | 原锚点行内容整体平移 27614->28626（diff 重映射，内容逐字节相同） |

### `docs/lane-parallel-coordination.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `51` | `program_support_backend.cheng:5368` | `:6106` | DRIFT-remap | 原锚点行内容整体平移 5368->6106（diff 重映射，内容逐字节相同） |

### `docs/pending-patches-20260714/gsub_v2_full.patch`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `352` | `gossipsub.cheng:546` | `:14` | DRIFT-symbol | 描述符号 ['scoring'] 加权唯一命中 :14（权重 1.00，次选 0.60） |

### `docs/pending-patches-20260714/slice8_genc_handoff/README.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `16` | `mobile_shell_codegen.cheng:21269` | `:22252` | DRIFT-remap | 原锚点行内容整体平移 21269->22252（diff 重映射，内容逐字节相同） |

### `docs/pending-work-ledger-2026-07-14.md`（23 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `103` | `gossipsub.cheng:142` | `:160（仅函数头）` | DRIFT-function | 描述对象写作时命中 gossipsubMeshPeers@142；该函数仍存于 :[160]，锚点行 142 现属 gossipsubMeshRemovePeer@135，函数内具体行未定位 |
| `217` | `backend2_lower_stmt.cheng:1639` | `:1644` | DRIFT-remap | 原锚点行内容整体平移 1639->1644（diff 重映射，内容逐字节相同） |
| `261` | `hashmaps.cheng:1103` | `:1063` | DRIFT-remap | 原锚点行内容整体平移 1103->1063（diff 重映射，内容逐字节相同） |
| `265` | `switch.cheng:2128` | `:2234` | DRIFT-remap | 原锚点行内容整体平移 2128->2234（diff 重映射，内容逐字节相同） |
| `311` | `lowering_plan.cheng:127` | `:557` | DRIFT-remap | 原锚点行内容整体平移 127->557（diff 重映射，内容逐字节相同） |
| `311` | `os.cheng:1085` | `:1658` | DRIFT-remap | 原锚点行内容整体平移 1085->1658（diff 重映射，内容逐字节相同） |
| `312` | `rsa.cheng:2294` | `:2323` | DRIFT-remap | 原锚点行内容整体平移 2294->2323（diff 重映射，内容逐字节相同） |
| `420` | `hashmaps.cheng:335` | `:339` | DRIFT-remap | 原锚点行内容整体平移 335->339（diff 重映射，内容逐字节相同） |
| `426` | `primary_object_plan.cheng:3783` | `:4477` | DRIFT-remap | 原锚点行内容整体平移 3783->4477（diff 重映射，内容逐字节相同） |
| `587` | `program_support_backend.cheng:2477` | `:3648` | DRIFT-remap | 原锚点行内容整体平移 2477->3648（diff 重映射，内容逐字节相同） |
| `666` | `switch.cheng:717` | `:812（仅函数头）` | DRIFT-function | 描述对象写作时命中 registerProtocol@716；该函数仍存于 :[812]，锚点行 717 现属 switchSetMsQuicSettings@715，函数内具体行未定位 |
| `671` | `program_support_backend.cheng:681` | `:1409` | DRIFT-remap | 原锚点行内容整体平移 681->1409（diff 重映射，内容逐字节相同） |
| `750` | `hashmaps.cheng:1103` | `:1063` | DRIFT-remap | 原锚点行内容整体平移 1103->1063（diff 重映射，内容逐字节相同） |
| `953` | `compiler_world.cheng:1305` | `:1590` | DRIFT-remap | 原锚点行内容整体平移 1305->1590（diff 重映射，内容逐字节相同） |
| `1131` | `backend_driver_dispatch_min.cheng:963` | `:1350` | DRIFT-remap | 原锚点行内容整体平移 963->1350（diff 重映射，内容逐字节相同） |
| `1149` | `backend2_lower_stmt.cheng:4268` | `:4264` | DRIFT-remap | 原锚点行内容整体平移 4268->4264（diff 重映射，内容逐字节相同） |
| `1186` | `program_support_backend.cheng:4561` | `:29014` | DRIFT-symbol | 描述符号 ['SOCK_STREAM', 'framing', 'getpeereid'] 加权唯一命中 :29014（权重 3.00，次选 2.00） |
| `1266` | `csge_manifest_codec.cheng:181` | `:205` | DRIFT-remap | 原锚点行内容整体平移 181->205（diff 重映射，内容逐字节相同） |
| `1370` | `typed_expr.cheng:22224` | `:30519` | DRIFT-remap | 原锚点行内容整体平移 22224->30519（diff 重映射，内容逐字节相同） |
| `1765` | `lowering_plan.cheng:6506` | `:17089` | DRIFT-remap | 原锚点行内容整体平移 6506->17089（diff 重映射，内容逐字节相同） |
| `1765` | `lowering_plan.cheng:155` | `:17350` | DRIFT-symbol | 描述符号 ['calls', 'facts', 'generated'] 加权唯一命中 :17350（权重 2.57，次选 1.50） |
| `2004` | `lowering_plan.cheng:2245` | `:17350` | DRIFT-symbol | 描述符号 ['calls', 'facts', 'generated'] 加权唯一命中 :17350（权重 2.57，次选 1.50） |
| `2082` | `lowering_plan.cheng:1066` | `:4920` | DRIFT-remap | 原锚点行内容整体平移 1066->4920（diff 重映射，内容逐字节相同） |

### `docs/pure-cheng-kernel-master-plan.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `72` | `system_link_exec.cheng:39` | `:3856` | DRIFT-symbol | 描述符号 ['items', 'lowering_missing', 'primary_missing'] 加权唯一命中 :3856（权重 4.33，次选 1.82） |

### `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `531` | `bootstrap_contracts.cheng:109` | `:132` | DRIFT-symbol | 描述符号 ['compiler_main'] 加权唯一命中 :132（权重 1.00，次选 0.33） |

### `docs/release-green-contract-inventory.md`（10 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `117` | `typed_expr.cheng:46707` | `:55981` | DRIFT-remap | 原锚点行内容整体平移 46707->55981（diff 重映射，内容逐字节相同） |
| `120` | `compiler_csg.cheng:41` | `:43` | DRIFT-remap | 原锚点行内容整体平移 41->43（diff 重映射，内容逐字节相同） |
| `171` | `backend_driver_dispatch_min.cheng:535` | `:586` | DRIFT-remap | 原锚点行内容整体平移 535->586（diff 重映射，内容逐字节相同） |
| `178` | `typed_expr.cheng:46707` | `:55981` | DRIFT-remap | 原锚点行内容整体平移 46707->55981（diff 重映射，内容逐字节相同） |
| `212` | `lowering_plan.cheng:1441` | `:2121` | DRIFT-remap | 原锚点行内容整体平移 1441->2121（diff 重映射，内容逐字节相同） |
| `213` | `backend2_pipeline.cheng:4186` | `:4697` | DRIFT-remap | 原锚点行内容整体平移 4186->4697（diff 重映射，内容逐字节相同） |
| `214` | `system_link_exec.cheng:4478` | `:5081` | DRIFT-remap | 原锚点行内容整体平移 4478->5081（diff 重映射，内容逐字节相同） |
| `352` | `backend_driver_dispatch_min.cheng:535` | `:586` | DRIFT-remap | 原锚点行内容整体平移 535->586（diff 重映射，内容逐字节相同） |
| `369` | `backend_driver_dispatch_min.cheng:3715` | `:4453` | DRIFT-remap | 原锚点行内容整体平移 3715->4453（diff 重映射，内容逐字节相同） |
| `841` | `program_support_backend.cheng:2912` | `:29014` | DRIFT-symbol | 描述符号 ['SOCK_STREAM', 'framing', 'getpeereid'] 加权唯一命中 :29014（权重 3.00，次选 2.00） |

### `docs/s2-feed-core-build-wall-20260708.md`（10 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `182` | `primary_object_plan.cheng:37960` | `:41100（仅函数头）` | DRIFT-function | 描述对象写作时命中 PrimaryBodyIrBareCallNodeEvalProbe@37870；该函数仍存于 :[41100]，锚点行 37960 现属 PrimaryBodyIrAppendResultValueProjection@37866，函数内具体行未定位 |
| `199` | `json.cheng:854` | `:986（仅函数头）` | DRIFT-function | 描述对象写作时命中 jsonParseValue@854；该函数仍存于 :[986]，锚点行 854 现属 jsonParseRawString@835，函数内具体行未定位 |
| `213` | `json.cheng:790` | `:856` | DRIFT-remap | 原锚点行内容整体平移 790->856（diff 重映射，内容逐字节相同） |
| `227` | `handshake13.cheng:1259` | `:1328` | DRIFT-remap | 原锚点行内容整体平移 1259->1328（diff 重映射，内容逐字节相同） |
| `227` | `backend2_lower_stmt.cheng:2827` | `:2830` | DRIFT-remap | 原锚点行内容整体平移 2827->2830（diff 重映射，内容逐字节相同） |
| `228` | `json.cheng:854` | `:986（仅函数头）` | DRIFT-function | 描述对象写作时命中 jsonParseValue@854；该函数仍存于 :[986]，锚点行 854 现属 jsonParseRawString@835，函数内具体行未定位 |
| `257` | `primary_object_plan.cheng:47` | `:139` | DRIFT-remap | 原锚点行内容整体平移 47->139（diff 重映射，内容逐字节相同） |
| `261` | `backend2_lower.cheng:3207` | `:3419` | DRIFT-remap | 原锚点行内容整体平移 3207->3419（diff 重映射，内容逐字节相同） |
| `261` | `backend2_lower_stmt.cheng:2827` | `:2830` | DRIFT-remap | 原锚点行内容整体平移 2827->2830（diff 重映射，内容逐字节相同） |
| `281` | `typed_expr.cheng:26488` | `:35625` | DRIFT-remap | 原锚点行内容整体平移 26488->35625（diff 重映射，内容逐字节相同） |

### `docs/xiaoyou-s6-device-probe-gate.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `25` | `core_runtime_provider_linux.cheng:1579` | `:4054` | DRIFT-remap | 原锚点行内容整体平移 1579->4054（diff 重映射，内容逐字节相同） |

### `openspec/proposals/backend-line-rescan-removal.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `103` | `parser.cheng:5428` | `:6396` | DRIFT-remap | 原锚点行内容整体平移 5428->6396（diff 重映射，内容逐字节相同） |

### `openspec/proposals/cheng-v2-in-place-refactor.md`（13 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `63` | `system_link_plan.cheng:255` | `:445` | DRIFT-remap | 原锚点行内容整体平移 255->445（diff 重映射，内容逐字节相同） |
| `158` | `x86_64_body_emit.cheng:1196` | `:1219` | DRIFT-remap | 原锚点行内容整体平移 1196->1219（diff 重映射，内容逐字节相同） |
| `365` | `program_support_backend.cheng:2841` | `:29014` | DRIFT-symbol | 描述符号 ['SOCK_STREAM', 'framing', 'getpeereid'] 加权唯一命中 :29014（权重 3.00，次选 2.00） |
| `365` | `system_helpers_backend.cheng:752` | `:818` | DRIFT-remap | 原锚点行内容整体平移 752->818（diff 重映射，内容逐字节相同） |
| `365` | `program_support_backend.cheng:2841` | `:29014` | DRIFT-symbol | 描述符号 ['SOCK_STREAM', 'framing', 'getpeereid'] 加权唯一命中 :29014（权重 3.00，次选 2.00） |
| `370` | `program_support_backend.cheng:2841` | `:29014` | DRIFT-symbol | 描述符号 ['SOCK_STREAM', 'framing', 'getpeereid'] 加权唯一命中 :29014（权重 3.00，次选 2.00） |
| `370` | `system_helpers_backend.cheng:752` | `:818` | DRIFT-remap | 原锚点行内容整体平移 752->818（diff 重映射，内容逐字节相同） |
| `371` | `backend_driver_dispatch_min.cheng:1456` | `:1940` | DRIFT-remap | 原锚点行内容整体平移 1456->1940（diff 重映射，内容逐字节相同） |
| `375` | `program_support_backend.cheng:657` | `:1385` | DRIFT-remap | 原锚点行内容整体平移 657->1385（diff 重映射，内容逐字节相同） |
| `377` | `program_support_backend.cheng:2436` | `:3606` | DRIFT-remap | 原锚点行内容整体平移 2436->3606（diff 重映射，内容逐字节相同） |
| `398` | `program_support_backend.cheng:2841` | `:29014` | DRIFT-symbol | 描述符号 ['SOCK_STREAM', 'framing', 'getpeereid'] 加权唯一命中 :29014（权重 3.00，次选 2.00） |
| `407` | `lowering_plan.cheng:1676` | `:7765` | DRIFT-remap | 原锚点行内容整体平移 1676->7765（diff 重映射，内容逐字节相同） |
| `417` | `macho_provider_linker.cheng:411` | `:388` | DRIFT-remap | 原锚点行内容整体平移 411->388（diff 重映射，内容逐字节相同） |

### `openspec/proposals/coordinate-aware-pointer-dispatch.md`（6 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `51` | `web_scene_runtime.cheng:11445` | `:11792` | DRIFT-remap | 原锚点行内容整体平移 11445->11792（diff 重映射，内容逐字节相同） |
| `68` | `mobile_shell_codegen.cheng:3502` | `:3586` | DRIFT-remap | 原锚点行内容整体平移 3502->3586（diff 重映射，内容逐字节相同） |
| `84` | `web_scene_runtime.cheng:11497` | `:11845` | DRIFT-remap | 原锚点行内容整体平移 11497->11845（diff 重映射，内容逐字节相同） |
| `102` | `mobile_shell_codegen.cheng:3502` | `:3586` | DRIFT-remap | 原锚点行内容整体平移 3502->3586（diff 重映射，内容逐字节相同） |
| `138` | `web_scene_runtime.cheng:11340` | `:11686` | DRIFT-remap | 原锚点行内容整体平移 11340->11686（diff 重映射，内容逐字节相同） |
| `387` | `mobile_shell_codegen.cheng:3502` | `:3586` | DRIFT-remap | 原锚点行内容整体平移 3502->3586（diff 重映射，内容逐字节相同） |

### `openspec/proposals/deterministic-memory-lifecycle.md`（3 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `38` | `compiler_csg.cheng:8952` | `:21333（仅函数头）` | DRIFT-function | 描述对象写作时命中 CompilerCsgValidateFrontierExprLayerSources@8952；该函数仍存于 :[21333]，锚点行 8952 现属 CompilerCsgSemanticCommitTypedIrRoundSemanticConservation@8876，函数内具体行未定位 |
| `39` | `lowering_plan.cheng:5397` | `:14146` | DRIFT-remap | 原锚点行内容整体平移 5397->14146（diff 重映射，内容逐字节相同） |
| `39` | `system_link_exec.cheng:1524` | `:2508` | DRIFT-remap | 原锚点行内容整体平移 1524->2508（diff 重映射，内容逐字节相同） |

### `openspec/proposals/transpile-closure-subsystem.md`（1 条）

| 文档:行 | 锚点（旧） | 新行号 | 判据 | 依据 |
|---|---|---|---|---|
| `80` | `web_scene_runtime.cheng:11502` | `:11850` | DRIFT-remap | 原锚点行内容整体平移 11502->11850（diff 重映射，内容逐字节相同） |

## ④ 仍成立类：计数与代表例

共 **614** 条（`HOLDS-A` 行号与写作提交逐字节相同 406 条；`HOLDS-B`/`HOLDS-manual` 行有改动但文档符号仍命中锚点窗口 208 条）。

代表例（每份文档取 1 条，按文档名排序，最多 20 条）：

| 文档:行 | 锚点 | 该行实测内容 |
|---|---|---|
| `docs/campaigns/2026-08-31-kernel-userpath/HANDOFF_20260910_fullgo.md:19` | `compiler_csg.cheng:39107` | `CompilerCsgFrontierParsedSourceStoreRelease(` |
| `docs/campaigns/2026-08-31-kernel-userpath/VERIFY.md:253` | `backend_driver_dispatch_min.cheng:6865` | `` |
| `docs/campaigns/2026-08-31-kernel-userpath/design/bake_opt_design.md:66` | `backend_driver_main.cheng:253` | `add(out, "BACKEND_INCREMENTAL=0")` |
| `docs/campaigns/2026-08-31-kernel-userpath/design/incremental-forest-consumption.md:14` | `compiler_csg.cheng:38866` | `if !texpr.TypedExprBuildSourceContextExactIndexWithManualAuthority(` |
| `docs/campaigns/2026-08-31-kernel-userpath/design/m3_install_surface_plan.md:27` | `held_exec_identity.cheng:1244` | `fn ChengHeldExecIdentityIssueInto(` |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pa_s1b_edit_plan.md:13` | `typed_expr_type_arena.cheng:5763` | `fn TypedExprTypeArenaBuildFromParserTreeInto(` |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md:85` | `compiler_main.cheng:9053` | `fn CompilerMainCompositionProcessEntry(): int32 =` |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:14` | `program_support_backend.cheng:24766` | `chengHeldExecParentErrDarwinChannelFramingUnwired: int32 = 31` |
| `docs/campaigns/2026-08-31-kernel-userpath/design/strict-closure-k3-split.md:24` | `kernel_manifest.cheng:12` | `compiler_entry_source = src/core/tooling/compiler_composition_kernel_main.cheng    # production root；经 compile` |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/s1b0_step.patch:11` | `parser.cheng:10280` | `let functionOffset = out.declarationFunctionCount` |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall128.patch:2582` | `backend2_types.cheng:96` | `fn Backend2SemanticEpoch(): str =` |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall130.patch:2582` | `backend2_types.cheng:96` | `fn Backend2SemanticEpoch(): str =` |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall131.patch:2582` | `backend2_types.cheng:96` | `fn Backend2SemanticEpoch(): str =` |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall133.patch:2582` | `backend2_types.cheng:96` | `fn Backend2SemanticEpoch(): str =` |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall134.patch:2582` | `backend2_types.cheng:96` | `fn Backend2SemanticEpoch(): str =` |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall135.patch:2582` | `backend2_types.cheng:96` | `fn Backend2SemanticEpoch(): str =` |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall136.patch:2582` | `backend2_types.cheng:96` | `fn Backend2SemanticEpoch(): str =` |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall137.patch:2582` | `backend2_types.cheng:96` | `fn Backend2SemanticEpoch(): str =` |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall139.patch:2582` | `backend2_types.cheng:96` | `fn Backend2SemanticEpoch(): str =` |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall141.patch:2582` | `backend2_types.cheng:96` | `fn Backend2SemanticEpoch(): str =` |

> 重点：`docs/memory-time-limits-plan.md` 的 5 条锚点（含本任务书点名的 `compiler_csg.cheng:39107-39108` 与 `typed_expr_type_arena.cheng:5763`）全部落在 `HOLDS-A`，即已修复后的行号在 HEAD 上仍然成立。

## ⑤ 不确定 / 未解析清单（不猜，只登记）

`不确定` **149** 条；`未解析`（锚点文件名在仓内多义或不存在，无法确定目标文件）**14** 条。这些条目**没有**被计入①的三种判定，需人工复核后再决定。

### ⑤.1 未解析（目标文件不唯一）

| 文档:行 | 锚点原文 | 候选 |
|---|---|---|
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w117e_append.md:10` | `snapshot_builder.cheng:12636` | 无（仓内无此文件） |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/darwin_authority/DESIGN.md:101` | `darwin.cheng:579` | 无（仓内无此文件） |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/ghost_fix/FIX.md:123` | `terminal_guardian.cheng:136` | 无（仓内无此文件） |
| `docs/cheng-csg-lsp-debugger-fusion.md:370` | `system_link_exec_runtime_direct.cheng:407` | 无（仓内无此文件） |
| `docs/cheng-csg-lsp-debugger-fusion.md:380` | `src/core/backend/system_link_exec_runtime_direct.cheng:377` | 无（仓内无此文件） |
| `docs/cheng-csg-lsp-debugger-fusion.md:414` | `system_link_exec_runtime_direct.cheng:377` | 无（仓内无此文件） |
| `docs/cheng-csg-lsp-debugger-fusion.md:744` | `/tmp/e2e_195.cheng:0` | 无（仓内无此文件） |
| `docs/cheng-csg-lsp-debugger-fusion.md:744` | `/tmp/e2e_195.cheng:5` | 无（仓内无此文件） |
| `docs/cheng-csg-lsp-debugger-fusion.md:817` | `/tmp/live_test2.cheng:0` | 无（仓内无此文件） |
| `docs/cheng-csg-patent-candidates.md:151` | `src/core/backend2/backend2_emit.cheng:1` | 无（仓内无此文件） |
| `docs/pending-work-ledger-2026-07-14.md:265` | `strings.cheng:301` | src/std/strings.cheng; src/libp2p/utils/strings.cheng |
| `docs/pending-work-ledger-2026-07-14.md:786` | `backend2_frame.cheng:252` | 无（仓内无此文件） |
| `docs/pending-work-ledger-2026-07-14.md:812` | `backend2_frame.cheng:252` | 无（仓内无此文件） |
| `docs/pending-work-ledger-2026-07-14.md:823` | `regalloc_linscan.cheng:78` | 无（仓内无此文件） |

### ⑤.2 不确定（证据不足）

| 文档:行 | 锚点 | 该行实测 | 原因 |
|---|---|---|---|
| `docs/campaigns/2026-08-31-kernel-userpath/HANDOFF_20260910_fullgo.md:54` | `core_runtime_provider_darwin.cheng:992` | `@exportc("cheng_native_terminal_darwin_peer_credentials_bridge")` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/VERIFY.md:1949` | `codegen_a64_fill_units.cheng:9` | `#     CondA64TrueCode/EmitPrologueWord/EmitTermWord）；其余 Fill 主族` | 描述符号无唯一候选（加权前几 [(314, 1.0), (410, 1.0), (11705, 1.0), (11760, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/VERIFY.md:2175` | `exact_def_call_authority.cheng:1725` | `exactDefCallAuthorityMemoryVersionBrokenLine(` | 人工复核（不猜）：文档描述为长段中文定性（“identity 主审是批 3 相位链末端…”），:1725 位于 `ExactDefCallAuthorityPhaseValidateInto`@1680 内；是否即文档所指「merge 相位」无法机检确认；加权 |
| `docs/campaigns/2026-08-31-kernel-userpath/VERIFY.md:2284` | `codegen_a64_fill_units.cheng:9` | `#     CondA64TrueCode/EmitPrologueWord/EmitTermWord）；其余 Fill 主族` | 描述符号无唯一候选（加权前几 [(314, 1.0), (410, 1.0), (11705, 1.0), (11760, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/VERIFY.md:2616` | `codegen_a64_fill_units.cheng:9` | `#     CondA64TrueCode/EmitPrologueWord/EmitTermWord）；其余 Fill 主族` | 描述符号无唯一候选（加权前几 [(314, 1.0), (410, 1.0), (11705, 1.0), (11760, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/VERIFY.md:2719` | `codegen_a64_fill_units.cheng:9` | `#     CondA64TrueCode/EmitPrologueWord/EmitTermWord）；其余 Fill 主族` | 描述符号无唯一候选（加权前几 [(314, 1.0), (410, 1.0), (11705, 1.0), (11760, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/design/incremental-forest-consumption.md:94` | `typed_expr.cheng:30894` | `let functionRow = arenamod.ArenaArrayInt32Get(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/incremental-forest-consumption.md:94` | `compiler_csg.cheng:38866` | `if !texpr.TypedExprBuildSourceContextExactIndexWithManualAuthority(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/incremental-forest-consumption.md:94` | `typed_expr.cheng:37327` | `var nextBuildIndex = typedExprBuildIndexForContextsWithManualAuthority(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/incremental-forest-consumption.md:209` | `typed_expr_type_arena.cheng:4693` | `fn typedExprTypeArenaFillTypeSyntax(value: TypedExprTypeArena,` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/incremental-forest-consumption.md:209` | `typed_expr.cheng:66383` | `for contextIndex in 0..<contexts.len:` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/incremental-forest-consumption.md:224` | `typed_expr.cheng:36946` | `typedExprBuildIndexAddContextCallDeclarationsWithManualAuthority(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/incremental-forest-consumption.md:224` | `parser.cheng:10304` | `for nodeIndex in 0..<sourceTree.nodeCount:` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pa_s1b_edit_plan.md:4` | `typed_expr_type_arena.cheng:90` | `# [S1a] Offline cross-source declaration index.  The resolution authority` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pa_s1b_edit_plan.md:4` | `compiler_csg.cheng:33042` | `declarationIndex: var typearena.TypedExprTypeDeclarationIndex,` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pa_s1b_edit_plan.md:260` | `typed_expr.cheng:36946` | `typedExprBuildIndexAddContextCallDeclarationsWithManualAuthority(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pa_s1b_edit_plan.md:260` | `parser.cheng:10304` | `for nodeIndex in 0..<sourceTree.nodeCount:` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pa_s1b_edit_plan.md:273` | `compiler_csg.cheng:38877` | `work.semanticGraph,` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md:89` | `compiler_main.cheng:8859` | `rootDir, true, req, requestErr):` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md:291` | `codegen_a64_body_units.cheng:22` | `import cheng/core/backend/aarch64_encode as a64` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md:292` | `codegen_x64_body_units.cheng:24` | `import cheng/core/backend/x86_64_body_emit as x64body` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md:293` | `codegen_writer_units.cheng:22` | `import cheng/core/backend/elf_x86_64_writer` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md:295` | `codegen_a64_link_units.cheng:12` | `import cheng/core/backend/aarch64_encode as a64` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md:312` | `native_object_emission_plan.cheng:397` | `elf_object_writer.ElfTextDataObjectBytes(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md:514` | `compiler_main.cheng:8869` | `if codegen_contract.CodegenCompositionActive():` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md:533` | `codegen_contract.cheng:494` | `var codegenUnitA64PrepareImpl: fn(bodyIR: var coreir.BodyIR, plan: var alloc.Reg` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md:607` | `codegen_regalloc_adapter_units.cheng:38` | `slotDataSymbols: var str[],` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_edit_plan.md:607` | `regalloc_production_emitter.cheng:1008` | `dataSymbolProjection.slotDataSymbols,` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:82` | `held_exec_identity.cheng:122` | `ChengHeldExecLauncherDarwinPath: str =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:174` | `program_support_host_runtime.cheng:247` | `@importc("cheng_native_terminal_darwin_peer_credentials_bridge")` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:175` | `core_runtime_provider_darwin.cheng:547` | `@exportc("cheng_native_terminal_darwin_kqueue_note_exit_wait_bridge")` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:246` | `system.cheng:255` | `RuntimeHeldExecParentErrLinuxX64Required: int32 = 1` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:290` | `production_held_exec_provider.cheng:1870` | `elif receipt.platform == CsgCoreProductionHeldExecDarwin:` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:324` | `system.cheng:255` | `RuntimeHeldExecParentErrLinuxX64Required: int32 = 1` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:325` | `production_held_exec_spawn.cheng:54` | `fn csgCoreProductionHeldExecParentError(errorCode: int32): str =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:326` | `program_support_host_runtime.cheng:3421` | `@exportc("cheng_host_darwin_recv_optional_fd_runtime")` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:369` | `held_exec_identity.cheng:122` | `ChengHeldExecLauncherDarwinPath: str =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:370` | `production_held_exec_darwin_capability.cheng:27` | `CsgCoreProductionHeldExecDarwinCapabilityFixedPath: str =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:370` | `production_launcher.cheng:35` | `CsgCoreProductionLauncherDarwinPath: str =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/pd_heldexec_m1m2m4_plan.md:387` | `core_runtime_provider_darwin.cheng:1004` | `var peerPid: int32 = -1` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/strict-closure-k3-split.md:246` | `direct_object_emit.cheng:4732` | `bytesRes = wunits.CodegenWriterUnitTextDataObjectBytes(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/design/strict-closure-k3-split.md:321` | `codegen_contract.cheng:494` | `var codegenUnitA64PrepareImpl: fn(bodyIR: var coreir.BodyIR, plan: var alloc.Reg` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/s1b0_step.patch:555` | `typed_expr.cheng:4802` | `ir.exactTypeArena = arena` | 描述符号无唯一候选（加权前几 [(51649, 2.06), (6433, 2.02), (58669, 2.0), (65731, 2.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/wall150.patch:142` | `parser.cheng:18321` | `err = "parser type syntax: tuple field list missing"` | 描述符号无唯一候选（加权前几 [(2919, 1.25), (31222, 1.12), (7739, 1.11), (11935, 1.11)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/r2_closure_ops_map.md:255` | `composition_manifest.cheng:263` | `fn compositionManifestExactSourceSet(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/selfhost_o2_census.md:100` | `primary_object_plan.cheng:75042` | `sourceOrdinal = sourceOrdinal + 1` | 描述符号无唯一候选（加权前几 [(18262, 2.58), (66384, 2.33), (2761, 2.25), (18230, 2.25)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/selfhost_o2_census.md:131` | `primary_object_plan.cheng:4218` | `fn PrimaryBodyIrNodeBoolChainSlotNameIndexLookup(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_annot_release_append.md:14` | `primary_object_plan.cheng:77810` | `buf, plan.functionBodyKinds)` | 描述符号无唯一候选（加权前几 [(18262, 2.58), (66384, 2.33), (2761, 2.25), (18230, 2.25)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_bigsrc_append.md:9` | `parser.cheng:36610` | `lineStart + Len("method ") <= lineStop &&` | 描述符号无唯一候选（加权前几 [(2919, 1.25), (31222, 1.12), (7739, 1.11), (11935, 1.11)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_fullgo_0910_append.md:337` | `primary_lower_pool_lifecycle_smoke.cheng:4` | `assert(pobj.PrimaryLowerPoolBatchReceiveAtomicityContract(),` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_gen2r2_append.md:15` | `arena.cheng:188` | `fn ArenaRemaining(arena: Arena): int32 =` | 描述符号无唯一候选（加权前几 [(130, 1.0), (144, 1.0), (165, 1.0), (198, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_bc2_append.md:15` | `codegen_a64_fill_units.cheng:471` | `var pos = offset` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_bc_append.md:12` | `codegen_a64_fill_units.cheng:471` | `var pos = offset` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_constr_freeze_append.md:52` | `codegen_a64_fill_units.cheng:471` | `var pos = offset` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_phaseb_objreg_append.md:49` | `codegen_a64_fill_units.cheng:471` | `var pos = offset` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_r2c2_verdicts_append.md:61` | `primary_object_plan.cheng:76882` | `let receiptRowCount = state.seqAddCandidateCountPerIndex.len` | 描述符号无唯一候选（加权前几 [(18262, 2.58), (66384, 2.33), (2761, 2.25), (18230, 2.25)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_ratchet_diag_append.md:12` | `typed_expr.cheng:13498` | `@borrows` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_ratchet_diag_append.md:60` | `parser.cheng:7598` | `parenDepth = parenDepth - 1` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_ratchet_diag_append.md:60` | `parser.cheng:7598` | `parenDepth = parenDepth - 1` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w103_append.md:26` | `codegen_a64_fill_units.cheng:9` | `#     CondA64TrueCode/EmitPrologueWord/EmitTermWord）；其余 Fill 主族` | 描述符号无唯一候选（加权前几 [(314, 1.0), (410, 1.0), (11705, 1.0), (11760, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w105_append.md:13` | `primary_object_plan.cheng:26753` | `strings.CloneStr(stmt.sourcePath),` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w106_append.md:9` | `lowering_plan.cheng:22646` | `!coreir.BodyIRBindLocalSlotTypeArenaProof(` | 人工复核（不猜）：文档描述为中文（第②层 lowering 落地面），:22646 为 `BodyIRBindLocalSlotTypeArenaProof` 校验；无法确认是否即所指臂；候选 :17350 系误报 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w106_append.md:16` | `codegen_a64_fill_units.cheng:9` | `#     CondA64TrueCode/EmitPrologueWord/EmitTermWord）；其余 Fill 主族` | 描述符号无唯一候选（加权前几 [(314, 1.0), (410, 1.0), (11705, 1.0), (11760, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w107_append.md:8` | `primary_object_plan.cheng:73741` | `call.argSlots.len <= 0 \|\|` | 描述符号无唯一候选（加权前几 [(18262, 2.58), (66384, 2.33), (2761, 2.25), (18230, 2.25)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w107b_append.md:19` | `codegen_a64_fill_units.cheng:9` | `#     CondA64TrueCode/EmitPrologueWord/EmitTermWord）；其余 Fill 主族` | 描述符号无唯一候选（加权前几 [(314, 1.0), (410, 1.0), (11705, 1.0), (11760, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w113_append.md:7` | `codegen_a64_fill_units.cheng:9` | `#     CondA64TrueCode/EmitPrologueWord/EmitTermWord）；其余 Fill 主族` | 描述符号无唯一候选（加权前几 [(314, 1.0), (410, 1.0), (11705, 1.0), (11760, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w113_append.md:11` | `codegen_a64_fill_units.cheng:9` | `#     CondA64TrueCode/EmitPrologueWord/EmitTermWord）；其余 Fill 主族` | 描述符号无唯一候选（加权前几 [(314, 1.0), (410, 1.0), (11705, 1.0), (11760, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w117e_append.md:13` | `primary_object_plan.cheng:17902` | `return false` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w117f_append.md:19` | `codegen_a64_fill_units.cheng:9` | `#     CondA64TrueCode/EmitPrologueWord/EmitTermWord）；其余 Fill 主族` | 描述符号无唯一候选（加权前几 [(314, 1.0), (410, 1.0), (11705, 1.0), (11760, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w118_append.md:3` | `ownership_drop_ir.cheng:4634` | `else:` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w123_append.md:18` | `exact_def_identity.cheng:1810` | `!plainCopyEdge && !borrowedPlainSnapshotEdge &&` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w132_append.md:71` | `primary_object_plan.cheng:54874` | `PrimaryBodyIrFindTopLevelBinOpTokenLast(letCallBinStripped, '%') <= 0:` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w132_append.md:87` | `primary_object_plan.cheng:54885` | `typedFn,` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w140_append.md:53` | `regalloc_aarch64_adapter.cheng:1549` | `add(recipe.words, Value(a64.A64EncLdrbImm(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w148_append.md:47` | `codegen_a64_fill_units.cheng:471` | `var pos = offset` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w95_append.md:6` | `lowering_plan.cheng:25694` | `plan.typeArenaStructuralKinds.len !=` | 人工复核（不猜）：文档描述为中文（配对 containment 校验豁免），:25694 为 typeArena 结构列长度一致性校验；无法机检确认；候选 :17350 系误报 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w97_append.md:8` | `ownership_body_ir_production.cheng:1304` | `let scale =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w97_append.md:29` | `primary_object_plan.cheng:29214` | `let openPos = texpr.TypedExprFindWholeCallOpenParen(share(callExpr))` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w98_append.md:9` | `primary_object_plan.cheng:17732` | `var fieldType: str` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w98_append.md:27` | `primary_object_plan.cheng:17732` | `var fieldType: str` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w98_append.md:27` | `lowering_plan.cheng:23158` | `callCapability.callBridgeCid =` | 人工复核（不猜）：文档描述为中文（call capability 生产段），:23158 为 callBridgeCid 赋值；无法机检确认；候选 :17350 系误报 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_wallcensus_append.md:64` | `primary_object_plan.cheng:72462` | `elif bodylifecycle.BodyIrPayloadHasPhysicalStorage(bodyIR):` | 描述符号无唯一候选（加权前几 [(18262, 2.58), (66384, 2.33), (2761, 2.25), (18230, 2.25)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_wallcensus_append.md:64` | `ownership_body_ir_production.cheng:1377` | `Fmt"ownership body ir production: ingress BodyIR ownership invalid code={entryAc` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_whenblock_append.md:86` | `typed_expr.cheng:9567` | `reasonOut,` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:14` | `physics2d.cheng:69` | `fn Physics2dWorldSupported(world: ecs.EcsWorld): bool =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:15` | `runtime.cheng:39` | `GameRuntime =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:16` | `game_tick_replay_smoke.cheng:10` | `const ReplayTicks = 8` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:17` | `core_runtime_provider_darwin.cheng:6242` | `@exportc("cheng_app_init")` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:18` | `web_scene_runtime.cheng:436` | `WebSceneGpuCommand =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:19` | `mobile_shell_codegen.cheng:1411` | `fn MobileShellAndroidActivity(opts: MobileShellOptions): str =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:21` | `mobile_surface.cheng:12` | `MobileSurfaceBuffer =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:24` | `core_runtime_provider_darwin.cheng:1666` | `fn cheng_inference_metal_launch_i32(source: str,` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:25` | `fluid3d.cheng:19` | `Fluid3dCapacity = 512` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:26` | `asset_formats.cheng:129` | `M2Header =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:26` | `render.cheng:234` | `fn renderMakeTga(width: int32, height: int32): Result[bytes.ByteBuffer] =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:27` | `msquictransport_native.cheng:156` | `fn StartWithSettingsPolicy(t: var MsQuicTransport,` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-05-pure-cheng-fishing/findings.md:27` | `native_runtime.cheng:8` | `import std/crypto/curve25519` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-06-csg-asset-pipeline/findings.md:9` | `asset_formats.cheng:231` | `fn ParseM2Header(buf: bytes.ByteBuffer): Result[M2Header] =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-06-csg-asset-pipeline/findings.md:9` | `render.cheng:3154` | `fn RenderNorthshireTga(outPath: str, width: int32, height: int32): Result[Render` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-06-csg-semantic-physical-world-video/findings.md:8` | `merkle_dag.cheng:21` | `type` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-06-csg-semantic-physical-world-video/findings.md:12` | `core_runtime_provider_darwin.cheng:2868` | `let source = "#include <metal_stdlib>\nusing namespace metal;\nstatic inline lon` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/emitter_body_missing/ATTRIBUTION.md:164` | `primary_object_plan.cheng:20641` | `if stmt.callArgCount != 2 \|\|` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/ghost_linux_lane/RECIPE.md:45` | `held_exec_identity.cheng:653` | `let resolveMask = heldExecLinuxResolveNoSymlinks \| heldExecLinuxResolveNoXdev` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/wall2_fix/FIX.md:54` | `production_launcher.cheng:1549` | `if !terminal_guardian.CsgCoreProductionHeldExecTerminalGuardianRecoverAllInto(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/probes/wall2_fix/FIX.md:55` | `production_held_exec_terminal_guardian.cheng:136` | `fn CsgCoreProductionHeldExecTerminalGuardianRecoverAllInto(` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/batch7_gate.txt:20` | `rsi_gate.cheng:531` | `passCount = passCount + 1` | 描述符号无唯一候选（加权前几 [(432, 0.23), (227, 0.17), (326, 0.17), (433, 0.17)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/batch7_gate.txt:66` | `rsi_gate.cheng:14` | `# 幂等性: 门禁使用私有账本 artifacts/rsi_gate_store, 每次清场重建,` | 描述符号无唯一候选（加权前几 [(432, 0.23), (227, 0.17), (326, 0.17), (433, 0.17)]），疑似描述对象已消失或符号过泛 |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/batch7_gate.txt:68` | `rsi_gate.cheng:18` | `# 用法: rsi_gate <repoRoot> <compilerPath> [--quick]  (位置参数, 非旗标)` | 描述符号无唯一候选（加权前几 [(432, 0.23), (227, 0.17), (326, 0.17), (433, 0.17)]），疑似描述对象已消失或符号过泛 |
| `docs/cheng-csg-lsp-debugger-fusion.md:630` | `typed_expr.cheng:3635` | `ir.captures2_ownerships.len != captureCount:` | 描述符号无唯一候选（加权前几 [(51649, 2.06), (6433, 2.02), (58669, 2.0), (65731, 2.0)]），疑似描述对象已消失或符号过泛 |
| `docs/cheng-csg-lsp-debugger-fusion.md:656` | `lsp_server.cheng:396` | `eventWriteFd: int32` | 描述符号无唯一候选（加权前几 [(625, 2.0), (570, 1.5), (575, 1.39), (7802, 1.36)]），疑似描述对象已消失或符号过泛 |
| `docs/cheng-csg-lsp-debugger-fusion.md:829` | `lsp_protocol.cheng:168` | `fn LspMakePosition(line: int32, character: int32): Position =` | 人工复核（不猜）：文档称「正确 cheng struct 语法（lsp_protocol.cheng:168-193 实例）」，但 HEAD :168 为 `fn LspMakePosition`；文件内 `type` 块实例在 :34-40（Position |
| `docs/cheng-minimal-kernel-plan.md:40` | `production_held_exec_spawn.cheng:56` | `return "held_exec_parent_linux_x86_64_required"` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/cheng-minimal-kernel-plan.md:96` | `codegen_contract.cheng:561` | `fn CodegenCompositionTargetAdmitted(targetTriple: str): bool =` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/cheng-minimal-kernel-plan.md:436` | `codegen_a64_fill_units.cheng:472` | `words[pos] = a64.A64EncLdrQ(0, a64.A64X0, 0)` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/cheng-minimal-kernel-plan.md:543` | `primary_object_plan.cheng:71913` | `if irFunction.statements[s].surfaceText != "":` | 描述符号无唯一候选（加权前几 [(18262, 2.58), (66384, 2.33), (2761, 2.25), (18230, 2.25)]），疑似描述对象已消失或符号过泛 |
| `docs/cheng-video-e2e-miaofa-miaokai-plan.md:13` | `web_scene_media_orchestrator.cheng:54` | `# before pthread_join, so an in-flight trickling fetch aborts at the NEXT drain-` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/computer-use-coverage-baseline-2026-07-23.md:48` | `native_runtime.cheng:1` | `import std/strutils as strutil` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/pending-patches-20260714/gsub_v2_full.patch:282` | `gossipsub.cheng:478` | `if ! gossipsubContextReady():` | 描述符号无唯一候选（加权前几 [(14, 1.0), (555, 0.92), (590, 0.6), (22, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:289` | `gossipsub.cheng:482` | `return Err[bool](Error(rpcRes))` | 描述符号无唯一候选（加权前几 [(14, 1.0), (555, 0.92), (590, 0.6), (22, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:300` | `gossipsub.cheng:478` | `if ! gossipsubContextReady():` | 描述符号无唯一候选（加权前几 [(14, 1.0), (555, 0.92), (590, 0.6), (22, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:486` | `gossipsub.cheng:20` | `gossipsubDefaultMaxMessage = 4194304` | 描述符号无唯一候选（加权前几 [(555, 0.92), (590, 0.6), (127, 0.5), (88, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:488` | `gossipsub.cheng:111` | `return true` | 描述符号无唯一候选（加权前几 [(14, 1.0), (555, 0.92), (590, 0.6), (22, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:816` | `switch.cheng:799` | `` | 描述符号无唯一候选（加权前几 [(903, 1.08), (904, 1.08), (83, 1.0), (910, 0.43)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:820` | `gossipsub.cheng:511` | `if peerScoreIsGraylisted(stdstrings.CloneStr(peerText)):` | 描述符号无唯一候选（加权前几 [(14, 1.0), (555, 0.92), (590, 0.6), (22, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:824` | `switch.cheng:94` | `listenKindMobileHw = 8` | 描述符号无唯一候选（加权前几 [(903, 1.08), (904, 1.08), (83, 1.0), (910, 0.43)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:848` | `switch.cheng:94` | `listenKindMobileHw = 8` | 描述符号无唯一候选（加权前几 [(903, 1.08), (904, 1.08), (83, 1.0), (910, 0.43)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:854` | `gossipsub.cheng:511` | `if peerScoreIsGraylisted(stdstrings.CloneStr(peerText)):` | 描述符号无唯一候选（加权前几 [(14, 1.0), (555, 0.92), (590, 0.6), (22, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:892` | `gossipsub.cheng:448` | `return Err[bool](Error(didRes))` | 描述符号无唯一候选（加权前几 [(14, 1.0), (555, 0.92), (590, 0.6), (22, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:1096` | `switch.cheng:1488` | `req.hasId = true` | 描述符号无唯一候选（加权前几 [(903, 1.08), (904, 1.08), (83, 1.0), (910, 0.43)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:1153` | `gossipsub.cheng:478` | `if ! gossipsubContextReady():` | 描述符号无唯一候选（加权前几 [(14, 1.0), (555, 0.92), (590, 0.6), (22, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:1166` | `gossipsub.cheng:482` | `return Err[bool](Error(rpcRes))` | 描述符号无唯一候选（加权前几 [(14, 1.0), (555, 0.92), (590, 0.6), (22, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:1172` | `gossipsub.cheng:229` | `if (ctrl.prunes[i].topic == topic):` | 描述符号无唯一候选（加权前几 [(14, 1.0), (555, 0.92), (590, 0.6), (22, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-patches-20260714/gsub_v2_full.patch:1211` | `gossipsub.cheng:510` | `let _ = peerScorePenaltyDuplicateMessage(peerText)` | 描述符号无唯一候选（加权前几 [(14, 1.0), (555, 0.92), (590, 0.6), (22, 0.5)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-work-ledger-2026-07-14.md:83` | `typed_expr.cheng:1` | `import std/buffer` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/pending-work-ledger-2026-07-14.md:253` | `switch.cheng:1` | `# Switch(minimal, in-process transports).` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/pending-work-ledger-2026-07-14.md:1148` | `typed_expr.cheng:16627` | `currentTypeIsEnum = false` | 描述符号无唯一候选（加权前几 [(51649, 2.06), (6433, 2.02), (58669, 2.0), (65731, 2.0)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-work-ledger-2026-07-14.md:1729` | `compiler_csg.cheng:19662` | `!layout.FixedBytes32Equal(csg.sourceBundleCid,` | 描述符号无唯一候选（加权前几 [(38914, 1.82), (41962, 1.33), (33079, 1.28), (33145, 1.25)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-work-ledger-2026-07-14.md:1735` | `switch.cheng:612` | `setProtocolsText(info, protoText)` | 描述符号无唯一候选（加权前几 [(903, 1.08), (904, 1.08), (83, 1.0), (910, 0.43)]），疑似描述对象已消失或符号过泛 |
| `docs/pending-work-ledger-2026-07-14.md:1793` | `typed_expr.cheng:19799` | `return found` | 描述符号无唯一候选（加权前几 [(51649, 2.06), (6433, 2.02), (58669, 2.0), (65731, 2.0)]），疑似描述对象已消失或符号过泛 |
| `docs/pure-cheng-kernel-master-plan.md:79` | `backend2_plugin_cid.cheng:157` | `if rawbytes.BytesLen(artifact) != expectedByteCount:` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md:180` | `compiler_main.cheng:2624` | `if !CompilerRunRemoteCommand(rootDir,` | 描述符号无唯一候选（加权前几 [(11, 1.0), (28, 1.0), (36, 1.0), (8501, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md:532` | `compiler_main.cheng:2624` | `if !CompilerRunRemoteCommand(rootDir,` | 描述符号无唯一候选（加权前几 [(11, 1.0), (28, 1.0), (36, 1.0), (8501, 1.0)]），疑似描述对象已消失或符号过泛 |
| `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md:532` | `compiler_runtime.cheng:253` | `let runtimeContractText = CompilerRuntimeAbiContractText(strings.CloneStr(rootDi` | 描述符号无唯一候选（加权前几 [(85, 0.5), (111, 0.5), (104, 0.25), (140, 0.25)]），疑似描述对象已消失或符号过泛 |
| `docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md:533` | `gate_main.cheng:1825` | `let seed = os.JoinPath(repoRoot, "bootstrap/cheng_cold.c")` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |
| `docs/release-green-contract-inventory.md:212` | `compiler_csg.cheng:26462` | `text: str): bool =` | 描述符号无唯一候选（加权前几 [(38914, 1.82), (41962, 1.33), (33079, 1.28), (33145, 1.25)]），疑似描述对象已消失或符号过泛 |
| `docs/release-green-contract-inventory.md:213` | `primary_object_plan.cheng:69702` | `var seqAddLegacyTextConsumeCount: int32` | 描述符号无唯一候选（加权前几 [(18262, 2.58), (66384, 2.33), (2761, 2.25), (18230, 2.25)]），疑似描述对象已消失或符号过泛 |
| `docs/release-green-contract-inventory.md:343` | `primary_object_plan.cheng:66547` | `coreir.BodyDataRelocTargetDomainTypedGlobalTag \|\|` | 描述符号无唯一候选（加权前几 [(18262, 2.58), (66384, 2.33), (2761, 2.25), (18230, 2.25)]），疑似描述对象已消失或符号过泛 |
| `docs/s2-feed-core-build-wall-20260708.md:120` | `primary_object_plan.cheng:56110` | `share(typedFn),` | 描述符号无唯一候选（加权前几 [(18262, 2.58), (66384, 2.33), (2761, 2.25), (18230, 2.25)]），疑似描述对象已消失或符号过泛 |
| `openspec/proposals/pure-cheng-rsi.md:107` | `promotion.cheng:29` | `const` | 行号自写作提交起未动，但文档描述无匹配符号/无候选行，无法判定（描述可能不可机检） |

## ⑥ 方法学与局限

**方法（全部只读）**

1. 全树正则提取 `文件名.cheng:行号`（含 `:N-M` 区间、`:N/M/K` 并列），逐条取文档行、±7 行段落作为描述上下文。
2. 目标文件解析：先精确路径、再路径后缀、再 basename；多义时用文档段落内符号在候选文件中的命中情况消歧；仍不唯一则记「未解析」，不猜。
3. 写作时代：对锚点所在的**文档行**做 `git blame`，取最后改动该行的提交作为该锚点的写作时代；文件级 `era`（`git log -1`）另列于①。
4. 行号漂移：对该 (写作提交 → HEAD) 做 `git diff --unified=0`，用 hunk 做逐行重映射；若映射后的 HEAD 行与写作时代行**逐字节相同**，即判 `DRIFT-remap`（确定性证据，无启发式）。
5. 描述一致性：以文档自己点名的符号（反引号内标识符 + 文档行内紧邻锚点的标识符，剔除文件名/路径碎片、停用词、长度 <5 的短词）在锚点窗口内的命中为「仍成立」证据；长符号（≥8 字符）用子串匹配以兼容 CamelCase 内嵌（如 `TypeArena` 命中 `CompilerCsgTypeArenaFinalize...`），短符号用词边界匹配。
6. 定位：符号按「文件内出现次数倒数」加权投票，要求首选权重 ≥1.5× 次选且唯一，才给唯一新行号；否则记「不确定」并列出候选行。

**局限（务必连同结论一起读）**

1. **可观测历史只到 `f681cad2b`（2026-07-24 Initial commit）**：多处文档行的 blame 落在导入提交上，说明锚点写作时间可能更早；因此「仍成立」只保证相对该提交以来的行内容未变，不等于「写文档时行号就对」（`DRIFT-stale-birth` 就是反例，本审计机检该类不可靠，见②b）。当前 614 条「仍成立」中 597 条的文档段落含反引号点名的符号（强证据），17 条只靠锚点旁的自然语言标识符/中文描述命中（弱证据，建议引用前手工确认）。
2. **`DRIFT-stale-birth` 是本审计发现的最隐蔽一类**：行号自写作提交起未动，靠 diff 完全看不出来，但行号处内容与文档描述不符（写作时即错）。本任务书已知的两处实例（`memory-time-limits-plan.md` 原写的 `compiler_csg.cheng:39060`、`:38924`）属于此类，已在本轮审计之前的 `0b37f7ea7` 修复；本轮审计期间并行落库的 `fa08177da` 又修掉 11 条同类。机检对该类**不可靠**：本轮 25 条机检候选经逐条人工读行复核后 0 条成立（多数是描述为中文散文、符号匹配不到所致的误报）⇒ **「行号对得上」≠「锚点可信」**，只能靠读行 + 点名符号 grep 发现。因此本报告 ②b 保留 0 条只代表「本轮机检+复核未再发现」，不代表该风险已清零——引用任何行号前仍应先 grep 点名符号的当前定义行。
3. **未纳入统计的锚点写法**：不带 `.cheng` 后缀的缩写锚点（如 `psb:24766-24769`、`host_runtime:3457`、以及省略文件名的纯行号 `:26374-26379`）无法按本任务口径解析，未计入上述总数；同类风险可能存在。
4. **文档自身有未提交改动时**，blame 给出的写作时代是最后一次提交的版本，可能与工作树里的锚点不同代；① 表中标 `dirty` 的文档需单独留意。
5. **同名符号多处出现**时按加权投票给候选，无法唯一判定时一律写「不确定」并列出候选行，未擅自选一个行号。
6. 本轮**未编译、未运行编译器**（编译槽位被他人占用），所有判定均基于源码文本与 git 元数据，不涉及运行期验证。

