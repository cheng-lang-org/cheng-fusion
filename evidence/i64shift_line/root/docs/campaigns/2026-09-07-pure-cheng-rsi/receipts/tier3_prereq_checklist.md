# 语料档 3 开放前置清单核对（只读回执）

- 核对对象：`docs/campaigns/2026-09-07-pure-cheng-rsi/corpus_tier3_contract.md`（权威件，下称"合同"）
  实现面：`src/rsi/types.cheng`、`src/rsi/compiler_domain.cheng`、`src/rsi/proposal.cheng`、`src/apps/rsi/main.cheng`、`src/tests/rsi_contract.cheng`
- 核对时刻：2026-09-14 03:55 CST；树身份 `HEAD=cb6773682e152006338d1fee9e5a94be3be68400`（2026-09-14 03:50:33 +0800），
  `git status --porcelain` 共 189 条，其中 `src/` 40 条（合同 §1.2 的读取起点 `b083fc3dd` 是本 HEAD 的祖先）。
- 方法：只读原始件 + 只读源码；**未编译、未链接、未计时、未取编译槽位、未改任何文件**（本件为唯一新建文件）。
- 口径：每条给"合同原文逐字（file:line）→ 现状判定 → 判据来源"。判定只用 `满足 / 不满足 / 无法判定`；
  凡本席未实跑的（任何编译、任何一次 trial）一律标 **未验证**，不当作已成立。

## 0. 结论

**档 3 的硬前置现势 0 条真正成立（仅 `forest_parsed_lines=234` 与索引空间两项成立），不得翻转，`RsiCompilerCorpusOpen(3)` 现在必须保持 `false`。**
关键阻断三条：① 默认门下内核四判据从未成立（默认门最新原始件 `rc=125`、`guard_hits=1`、并林最高 136/234，无任何 `rc=0` 轮）；
② 静窗不成立（`COMPILE_SLOT.lock` 在位，持槽者 pid=8203 `b17line_b1701_gate` 在飞，另有 `kd_b1701` `system-link-exec` 进程）；
③ 档 3 的 receipts（身份四元组 + 逐相账 + A/B 配对）从未产生，`artifacts/rsi_compiler` 至今不存在。

---

## 1. 硬前置逐条

### A 组 · 合同 §6.2 S1（`corpus_tier3_contract.md:194`）

> **S1 前置（kernel 侧，硬）**：默认门下 §6.2 四判据 + §6.2.1 三判据同时成立；该轮 `(driver_sha, cid, count, source_root, 逐相账)` 已入 receipts；源树已冻结（P0 静窗成立）。

| # | 前置（合同原文位置） | 合同逐字 | 现状 | 判据来源 / 缺什么 |
|---|---|---|---|---|
| A1 | 唯一验收线 `rc=0`（`:171`；§0 表 `:21`） | `rc=0` "进程正常退出" | **不满足** | 默认门（`rss_guard_env=unset`）原始件共 44 份，**无一份 rc=0**；最新的三份默认门：`.rebuild/s1b_step3/r9/gate/r104_recov.summary.txt:1` `rc=125`、`c2a_default_diag.summary.txt` `rc=125`、`c2d_default_hardcut.summary.txt`（09-13 09:28，最新）`rc=125`。整体最新轮 `b1601_b16fix.summary.txt`（09-14 02:57）`rc=1` 且 `class=diagnostic` |
| A2 | `forest_parsed_lines=234`（`:171`；§0 表 `:22`） | "234 源全部解析" | **满足**（仅此一条） | `r45_recheck.summary.txt`、`r52_raised.summary.txt`、`r104_recov.summary.txt`、`b1601_b16fix.summary.txt` 四处均 `forest_parsed_lines=234` |
| A3 | `forest_appended_lines=234`（`:171`；§0 表 `:23`） | "234 源全部并入林" | **不满足** | 默认门最好 = 136/234（`.rebuild/s1b_step3/r9/gate/r104_recov.summary.txt`）；合同 §0 引的两份 `r45_recheck`=1、`r52_raised`=158（`.rebuild/s1b_step3/gate/`）。抬门轮 `b1601_b16fix.summary.txt` 达 234/234 但 `class=diagnostic`、`rss_guard_env=3865470566` ⇒ 合同 `:28`/`:205` 明令不得计入 |
| A4 | `guard_hits=0` ∧ 树峰 ≤805,306,368 B（`:171`、`:119`；§0 表 `:24`） | "门内跑完" | **不满足** | 默认门轮 `guard_hits=1`：`r104_recov.summary.txt`（`guard_line=...status=rss_limit_exceeded rss_bytes=839353592 limit_bytes=805306368`）、`c2d_default_hardcut.summary.txt`（`max_csg_rss=795526344`）；合同 §0 另引 `r45_recheck.summary.txt` `max_rss=776815744`（未越门但 rc=1）、`r52_raised.summary.txt` `max_rss=2622982568`（抬门 diagnostic） |
| A5 | §6.2.1 逐相贴线（`:174`：`|Δ| > 50 MB` 即遗留物必须解释） | "每相实测 RSS 对模型值报差值" | **无法判定** | 缺：默认门轮相 4/5/6 原始件（默认门轮止步 append 相）+ 相 3/相 6 模型锚（合同 §10-4 明示相 3 无实测锚、相 6 = 待钉区⑤）。现有默认门最新轮只到 `forest_appended`，抬门轮 `type_arena_lines=0`/`typed_ir_done_lines=0`（合同 §0 表 `:25`、§10-5） |
| A6 | 该轮 `(driver_sha, cid, count, source_root, 逐相账)` 已入 receipts（`:194`；§1.4 P6 `:85`） | "写入 `artifacts/rsi_compiler` 的 events 身份行" | **不满足** | `artifacts/rsi_compiler` 至今**不存在**（合同 §6.1 `:190` 的 [实测] 仍成立；本席 `ls` 复验）。唯一近似目录 `artifacts/rsi_compiler_c1_t3/` 的 `current.txt` 记 `corpus 1`，非档 3。campaign receipts（`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/cdomain_events.log`）只有 `corpus=0` 的创世/拒收两行 |
| A7 | 源树已冻结（P0 静窗成立，§1.4 `:76`） | "`.rebuild/COMPILE_SLOT.lock` 不存在 **∧** 无在飞 driver 进程 **∧** `git status --porcelain -- src/` 在 trial 开始与结束两次取样内容相等" | **不满足** | 三腿全不成立：① `.rebuild/COMPILE_SLOT.lock/` 存在（目录），`owner.txt` = `pid=8203 purpose=b17line_b1701_gate start=1789327956`；② `ps` 证实 pid 8203 存活（`bash .../b17_run_gate.sh`，ELAPSED 23:20）且 `kd_b1701 system-link-exec`（pid 8623/8627）在飞；③ `git status --porcelain -- src/` 40 条（含 `src/rsi/compiler_domain.cheng` 等 B1 未提交 WIP）。第三腿是 trial 内两次取样相等，本轮 trial 未开，无从判 |

补充（S1 的仪器面，**满足**，供后续引用）：P2 门禁脚本在位 `gate_run.sh:13-26`（禁缓存四件套 + `BACKEND_JOBS=2` + `CHENG_CSG_MEM_TRACE=1`）；硬门单点 `tools/memory_model_limits.sh:19-20`（`CHENG_MEMORY_MODEL_LIMIT_BYTES=805306368`）；机械 checker `.rebuild/s1b_step3/check_acceptance.py:18` `EXPECT_SOURCES = 234`。

### B 组 · 合同 §1.x 语料定义与 CID 口径

| # | 前置（合同位置） | 合同逐字 | 现状 | 判据来源 / 缺什么 |
|---|---|---|---|---|
| B1 | 语料口径 = 真实 plan 闭包，禁混 dry-compile（`:37`、`:45`） | "**档 3 语料 = 该入口在真实编译（`system-link-exec`）下实际打开并解析的源文件全集**"；"dry-compile 报告的数字若被引用作旁证，必须显式标 `precheck` 且不入判据" | **满足**（口径可用） | `src/rsi/types.cheng:120` 档 3 返回同一入口 `src/core/tooling/backend_driver_dispatch_min.cheng`（常量 `:85`）；`src/rsi/compiler_domain.cheng:307-314` 以 `system-link-exec` 真实编译。dry-compile 报告键仍在 `backend_driver_dispatch_min.cheng:2921-2934`（未被引用进 RSI 判据） |
| B2 | 234 记录必须同带 root CID + source root（`:57`；§1.2 表 `:51-54`） | "**任何引用 234 的记录必须同时给 root CID + source root 绝对路径**，否则不可复现" | **满足**（有实例，但与本档 trial 无关） | `kd_b102.report.txt:28`（source=`.rebuild/b_line/scratch_root/...`）、`:31` `source_snapshot_count=234`、`:32` `source_snapshot_root_cid=54c2ca9b…`、`:78-80` 三元组 234 / 649,715 / 30,989,631；`kd_b1601.report.txt` root CID `66bf7ce7…`；`kd_t8b.report.txt` root CID `5260ccb5…`（同计数、不同 CID，合同 §1.2 "计数相同内容不同"复现） |
| B3 | CID 算法单点、RSI 侧禁复刻（`:61-72`，§10 红线④ `:270`） | "算法**只在 C 冷编译器一处实现**，RSI 侧与脚本侧**只读、禁复刻**" | **满足** | `src/rsi/compiler_domain.cheng:583-586` 注释 + `:587-614` `RsiCdRoundCidInto` 只读 `source_snapshot_root_cid=` 并只校验 64 位小写 hex（`cdHex64Ok` `:386-396`）；无第二份 CID 实现 |
| B4 | P3 自洽校验（`:79`） | "校验 `source_snapshot_count == compile_input_source_file_count`…不等 ⇒ 发射点被改坏 ⇒ REJECT" | **满足**（实现）；**未验证**（真跑） | `compiler_domain.cheng:601-611` 逐字实现（`snapCount != inputCount → outOk=0`）；真实件里两字段同值（`kd_b102.report.txt:31` vs `:78`）。RSI 侧只经合成夹具（`src/tests/rsi_contract.cheng:357-381`），真烤未跑 |
| B5 | P4 轮内 CID 全等（`:80`） | "`∀k: cid_k == cid_0`。不等 ⇒ `REJECT(corpus_mutated_mid_trial)`" | **满足**（实现）；**未验证**（真跑） | `compiler_domain.cheng:935-950`（逐轮抽取 + 不等即 echo `cd_tier3_cid_reject reason=corpus_mutated_mid_trial` 并 return）、收尾 `:966-968`（`cid_rounds_incomplete`） |
| B6 | P5 A/B 腿配对（`:81-84`） | "硬判据：`count_A == count_B`…`cid_A` 与 `cid_B` **允许不同**" | **不满足（未接线）** | 判据函数在 `compiler_domain.cheng:803-858`（`count_mismatch` 拒 / `cid_equal` 只记），但全仓唯一调用点是 `src/tests/rsi_contract.cheng:400,412,418,432`；`src/apps/rsi/main.cheng` 无任何调用（`grep freeze` 零命中）⇒ 真 A/B 流程不执行配对 |
| B7 | P6 落库（`:85`；§7 身份行 `:220`） | "`event=cdomain_tier3_identity` + `driver_sha=` + `corpus_cid=` + `corpus_count=` + `source_root=` + `patch_sha=` + `link_tool_sha=` + `guard_runtime_sha=`" | **不满足** | payload 生成器在 `compiler_domain.cheng:661-673`，**无 append 点**（`grep -rn cdomain_tier3_identity src/` 只命中 `:666` 自身；`main.cheng` 无该串）；§7 表 `:220` 自标 "② **未实现**（D3）"，现势未变 |
| B8 | `patch_sha` 必须记（P1 `:77`） | "候选 patch 文件的 sha256" | **不满足** | `RsiCdFreezeRecordWrite` 传 `patchSha=""`（`compiler_domain.cheng:771-773` 调用 `RsiCdTier3IdentityPayload(..., "", ...)`），落地值恒为 `patch_sha=unpinned`（`:664`）。合同 §10-8 `:266` 已登记该缺口的另一面（fact 无落点） |
| B9 | §1.5 计数常量 234 硬编码（`:90-91`） | "档 3 的计数常量 `234` **硬编码在 checker** 里（`check_acceptance.py:18` `EXPECT_SOURCES = 234`）…RSI 侧无权私改" | **满足**（现状即如此） | `.rebuild/s1b_step3/check_acceptance.py:18` 复核在位；RSI 侧对"必须是 234"零判据（只有 P5 的相对 `count_A==count_B`） |

### C 组 · 合同 §6.2 S2–S8

| # | 步骤（合同位置） | 合同逐字（节选） | 现状 | 判据来源 / 缺什么 |
|---|---|---|---|---|
| C1 | S2 索引空间（`:195`） | "`RsiCompilerCorpusMax` 2→3；`RsiCompilerCorpusRel(3)` = `"src/core/tooling/backend_driver_dispatch_min.cheng"`（与档 2 同入口）；`RsiCompilerCorpusOpen(3)` **仅在 S1 成立且本件被批准后**置 true" | **满足**（索引与 Rel 已落，Open 正确保持 false） | `src/rsi/types.cheng:83` `RsiCompilerCorpusMax = 3`、`:84` `RsiCompilerCorpusTier3 = 3`、`:85` `RsiCompilerCorpusDispatchMinRel = "src/core/tooling/backend_driver_dispatch_min.cheng"`、`:119-120` Rel 返回该常量、`:131-132` `RsiCompilerCorpusOpen = corpusIdx == 0 || corpusIdx == 1`（3 → false） |
| C2 | S3 白名单/CLI 跟随（`:196`） | "自动跟随 Max/Open，**不新增分支**" | **满足** | `src/rsi/proposal.cheng:44`（`param > types.RsiCompilerCorpusMax` 拒）、`:46`（`return types.RsiCompilerCorpusOpen(param)`）；`src/apps/rsi/main.cheng:215-217` CLI 门。附带发现（非功能缺陷）：`:216` 文案 "only tier 0 open" 已过期（档 1 于 2026-09-13 已开，`types.cheng:98-101,131-132`） |
| C3 | S4 收尾检查点（`:197`，含 2026-09-13 行号勘误） | "档 3 必须在**真正的成功出口**追加三项：`∀k: cid_k 全等` ∧ `failCount <= 1` ∧ 逐相账齐全（未钉相标 `unpinned`）。缺任一 ⇒ 不产出回执（返回 `outOk=0`）" | **满足**（实现三项齐备）；**未验证**（从未在真门内触发） | `compiler_domain.cheng:961-1007`：cid 全等 `:966-968`、`failCount<=1` `:969-971`、逐相账 `:972-980`（内部 `:707-709` 缺相即拒 + `:728-736` 5 已钉相 + 2 行 `# unpinned`）。**行号勘误**：合同 `:197` 引的 `:954/:957/:992/:994` 与现树不符（现树 `954` = `if pkK > maxPk`、`957` = `fpOfMax`、`992` = `guardShapeOk`、`994` = `guard_runtime_sha_unavailable` echo），只有 `:966` 对得上 |
| C4 | S5 合同冒烟扩展（`:198`） | "新增档 3 open 断言、档 1/2 仍 closed、越界（4）拒" | **不满足**（翻转时才需要；现树断言的是"档 3 闭"） | `src/tests/rsi_contract.cheng:330`（Max==3 ✓）、`:338-339`（越界 4 拒 ✓）、`:334-335` `assert(!cdOpen3, "... tier3 closed before the kernel wall is cleared")` —— **翻转时必须改这条**，并在 S5 里补 open 断言 |
| C5 | S6 账本原子性（`:199`） | "档 3 的 baseline/版本事实写入前先过链校验（`src/rsi/store.cheng:40-60` `RsiStoreVerifyChainInto`），失败即拒" | **满足**（机制在位） | `src/rsi/store.cheng:40` `fn RsiStoreVerifyChainInto`；调用点 `src/apps/rsi/main.cheng:231`（在 `:219-220` MkdirAll 之后、任何 facts/budgets 写入之前） |
| C6 | S7 翻转轮回执（`:200`） | "(a) `rsi cdomain --corpus:3` 的真实 A/B 回执；(b) 该轮 `<label>.summary.txt` + `check_acceptance.py` 判词；(c) 逐相账 TSV；(d) 身份四元组" | **不满足** | 四件全无：无 `*.freeze.txt` / `*.phases.txt` / `cd_corpus3*` 落盘（全仓 `find` 零命中）；`artifacts/rsi_compiler` 不存在 |
| C7 | S8 反向回退（`:201`） | "任一腿 `count ≠ 234` 或 `rc ≠ 0` ⇒ 档 3 回 BLOCKED…events 记 `event=cdomain_tier3_blocked`" | **不适用（未触发）**；且 `cdomain_tier3_blocked` 事件在源码中不存在 | `grep cdomain_tier3_blocked src/` 零命中 ⇒ 即便要回退，事件的落点也未实现（同 D3 面） |

### D 组 · 合同 §2.0 / §3.x / §4（判据与记账口径）

| # | 前置（合同位置） | 合同逐字（节选） | 现状 | 判据来源 / 缺什么 |
|---|---|---|---|---|
| D1 | §2.0-1 档位口径（`:106-109`） | "**档 3 = 5 轮 / 容 1 败 / ≥3 成**；**档 0/1/2 = 12 尝试 / 成功下限 3 / 失败上限 9**…两者出自**同一处派生点**的参数化" | **满足** | `compiler_domain.cheng:882-884`（`tier3 = corpusIdx == types.RsiCompilerCorpusTier3`；`maxAttempts = if tier3: 5 else: 12`；`maxFail = if tier3: 1 else: 9`） |
| D2 | §2.0-1 配套硬要求（`:109`） | "回执必须**逐轮记录所用档位口径**（attempts/successes/fail_cap），使跨档读数不可互比；档 3 的 `failCount <= 1` 是**硬前置**" | **不满足** | 回执行 `compiler_domain.cheng:1012`（与 `:1020`）字段为 `jobs_tier/corpus/peak_of_min_us_round/peak_max_over_successes/peak_resident/peak_footprint/min_us/successes` —— **无 `attempts=`、无 `fail_cap=`、无 `fail_count=`** ⇒ "逐轮记录档位口径"未落，跨档读数仍可被误比 |
| D3 | §2.0-2 C2 峰值绑轮（`:110`） | "C1 = 成功轮 min；**C2 总峰 = 成功轮 `process_tree_resident_peak_bytes` 的 max**；两者来源轮次分别记录，不得共用一值" | **满足（取轮口径）**；**合同字面字段名与实现不符，需点名** | 实现取 `maxPk`（`compiler_domain.cheng:954-958`）并双值回执 `:1012`；C1 取 `bestUs` min `:951-953`。**字段名不一致**：合同 §3.1 `:119-120` 与 §2.0-2 `:110` 字面写 `process_tree_resident_peak_bytes`，实现读的是 `process_tree_enforced_peak_bytes`（`:337-341`，= `max(resident, footprint)`）；该改口径由另一冻结件裁定并已核验（`compiler_domain_c1c2_contract.md:25,28,114` A5d "判据口径由 resident 改为 enforced…缺 `enforced` 键 ⇒ `missing_peak_reading`，不回落 resident"）⇒ 属**合同 §3.1/§2.0-2 文字过期**，非实现偏差 |
| D4 | §3.1 硬门（`:119`） | "`process_tree_resident_peak_bytes <= 805,306,368 B`" | **满足**（按 A5d 口径） | `compiler_domain.cheng:196-197` `peakBytes > gateBytes → over_hard_gate`；门值单点派生 `:119-151`（无字面量），权威件 `tools/memory_model_limits.sh:20` |
| D5 | §3.1 回归帽（`:120`） | "`<= 冻结基线(per-corpus) x 3/2`" | **满足** | `compiler_domain.cheng:216-217` `if peakBytes * 2 > basePeak * 3: return "over_regression_cap"`（整数式，与合同等价）；基线读写 `:1051-1118`，病态基线拒写 `:1084-1089` |
| D6 | §3.1 `rc=0`（`:121`） | "`rc     : = 0`" | **满足**（在 `RsiCdC2Verdict` 内 `:218-219`）；bake 路径另有一层 | `compiler_domain.cheng:218-219` `rc != 0 → bad_rc`；`RsiCdBakeOnceInto` 不调 C2 判词，改用 guard `--expected-exit-code:0`（`:301`）+ `rrc != 0 → return`（`:317-319`） |
| D7 | §3.1 逐相差值（`:122`） | "`逐相 : 每相实测 RSS 对模型值报差值；|Δ| > 50 MB 即遗留物，必须解释`" | **不满足（184-220 未实现）** | `RsiCdMeasurementVerdict` 只做存在性：`:194-195` `phaseRows <= 0 → missing_phase_readings`；**无模型值、无差值、无 50MB 阈值**（实现注释 `:379-382` 自认"模型锚 + 50MB 阈值归 `tools/memory_model_limits.sh` + `tools/phase_line_check.py`"）。详见 §2 对照表判据 4 |
| D8 | §3.2 逐相账（`:126-140`） | "相 3、相 6 显式记 `unpinned`，不得当 0" | **满足（腿级 ledger）**；**部分不满足（events 行）** | `compiler_domain.cheng:683-749` 采集 5 已钉相 + `:728-736` 落盘 `# unpinned phase=metadata…` / `# unpinned phase=typed_facts_ir…`；但合同 §7 `:222` 要求的 events 逐相行 `event=cdomain_tier3_phase phase=<p> rss_bytes=<B> model_mib=<M> delta_mib=<D>` **在源码中不存在**（`grep cdomain_tier3_phase src/` 零命中） |
| D9 | §3.3 `d_live` 与 `rss` 不可互换（`:145`） | "`d_live`（找"谁留住了"）与 `rss`（找"峰值贡献者"）**不可互换**" | **部分不满足** | 逐相采集只取 `rss=`/`arena=`（`:529-571`），**完全不采 `live=`**（`csg_mem` 行有 `live=` 字段，见 `b1601_b16fix.summary.txt` 的 `live=6590702`）⇒ "谁留住了"在该账里无读数；无互换（因缺项而非混用） |
| D10 | §4 身份四元组（`:151-164`） | "①driver 二进制 ②源码集（`source_snapshot_root_cid`+`count`+source root）③编译器（`composition_source_closure_sha256`/`composition_declared_sources_sha256`/`composition_source_identity_receipt_cid`/`compiler_executable_cid` + provenance）④工具（guard 运行时 sha + 链接工具 sha + 链接 argv sha）" | **① 满足 ② 满足（实现面）③ 不满足 ④ 部分不满足** | ① `compiler_domain.cheng:885` `cdFileSha(compilerPath)` → freeze 记录；② `:754-794` freeze 记录含 `corpus_cid/corpus_count/source_root`；③ **零抽取**：`grep composition_source_closure_sha256|full_backend_codegen|system_link_exec_scope src/rsi src/apps/rsi src/tools/rsi_gate.cheng` 零命中 ⇒ 四元组③在 RSI 侧无读数（合同 `:161` 规则 1 要求"四元组缺一 ⇒ 降级 diagnostic，不入 trial"，实现对此**零守卫**）；④ `link_tool_sha` 有（`:619-632`，读 `darwin_system_link_tool_sha256=`），`guard_runtime_sha` 有（`:991-992`），**链接 argv sha 未采集**（合同 §4 ④ 引的 `kd_b102.report.txt:26` `darwin_system_link_argv_sha256=`） |

### E 组 · 合同 §9 依赖项（工时表里的实现债）

| # | 依赖（合同位置） | 合同逐字（节选） | 现状 | 判据来源 |
|---|---|---|---|---|
| E1 | D1 索引空间（`:243`） | "`Max` 2→3、`Rel(3)`、`Open(3)`" | **D1 已完成**（Open 按裁定保持 false） | `types.cheng:83-85,119-120,131-132` |
| E2 | D2 收尾检查点 + 逐相采集 + C2 取下标（`:244`） | — | **大体完成**，逐相"落账"未完成（见 D8/D9） | `compiler_domain.cheng:961-1007`、`:683-749`、`:951-958` |
| E3 | D3 CID 冻结接线（`:245`） | "报告字段抽取 + events 身份行 + 轮内 CID 全等守卫 + P5 配对判据" | **部分完成**：字段抽取 ✓、轮内守卫 ✓；身份行 ✗、P5 接线 ✗ | 见 B6/B7 |
| E4 | D4 逐源清单发射（`:246`，跨线） | "module_path + document_cid + content_cid + byte_count" | **未做** | `grep` 报告字段无逐源清单；合同 §10-1 `:258` 自述"当前载具不发射" |
| E5 | D5 合同冒烟扩展（`:247`） | — | **部分完成**（现树断言"档 3 闭"，翻转需改） | `rsi_contract.cheng:330-339` |
| E6 | D6 gate 腿 + 四条负例（`:248`） | "越门候选必拒 / 病态基线必拒 / 抬门轮不得进入判定 / 逐相缺失不得折算" | **已有门禁落点**（`src/tools/rsi_gate.cheng:141-162` 调 `RsiCdC2Verdict` 单点 + `RsiCdReasonIsDiagnostic` 判 DIAGNOSTIC）；**四条负例未在真烤上执行** | `rsi_gate.cheng:141-162`；合同 §9 `:248` 标 "1–2h [估计]" |

---

## 2. 合同判据集 ↔ `compiler_domain.cheng:184-220` 逐条对照

比对对象：`:184-198` `RsiCdMeasurementVerdict`、`:205-220` `RsiCdC2Verdict`（+ `:223-226` 的 diagnostic 判定）。

| 合同条文 | 合同位置 | 实现位置 | 一致性 | 点名 |
|---|---|---|---|---|
| 硬门 `peak <= gate` | `:119` | `:196-197` `over_hard_gate` | **一致（不等式）** | **峰值字段口径不同**：合同字面 `resident`，实现 `enforced=max(resident,footprint)`（`:337-341`）。已由 `compiler_domain_c1c2_contract.md:114`（A5d）裁定，属 tier3 合同文字过期；**建议在合同 §3.1/§2.0-2 加勘误行**，否则同一读数在两份冻结件里名字不同 |
| 回归帽 `peak <= base × 3/2` | `:120` | `:216-217` `over_regression_cap` | **一致** | 整数式等价（`2·peak > 3·base`）；无浮点、无回退 |
| `rc = 0` | `:121` | `:218-219` `bad_rc` | **一致** | 但在 bake 路径**不生效**：`RsiCdBakeOnceInto`（`:363-368`）只调 `RsiCdMeasurementVerdict`，C2 判词函数只被 `rsi_gate.cheng:149` 调用 |
| 逐相"实测 RSS 对模型值报差值，`|Δ|>50MB` 必须解释" | `:122`、`:174` | `:194-195` 仅 `phaseRows <= 0 → missing_phase_readings` | **不一致（缺项）** | `:184-220` **不含模型值、不含 `Δ`、不含 50MB 阈值**；实现把该判据外推给 `phase_line_check.py`（注释 `:379-382`）。合同 §5 `:174` 与 §3.1 `:122` 要求的这一条，在判据函数面**没有任何实现**——点名 |
| 抬门轮判 `diagnostic` | §3.3 `:146`、§6.3 `:205`、§5 `:173` 之外 | `:188-189` `diagnostic_cap_override`（优先级最高） | **一致（规则）**，**但优先级合同未定** | 实现把"抬门"放在**缺读数之前**：抬门 ∧ 缺峰值 时报 `diagnostic_cap_override` 而非 `missing_peak_reading`。合同 §5 `:175` "缺任一读数一律 REJECT" 与 §6.3 "抬门轮 diagnostic" 在该情形下语义冲突，实现选后者——点名，请父席裁定哪条优先 |
| 病态基线必拒 | `:124` | `:214-215` `pathological_baseline` | **一致** | 另有写侧守卫 `:1084-1089` |
| 缺读数 fail-closed | `:123-124` | `:186-195`（三种 `missing_*`） | **一致** | `:192` 加 `peakBytes <= 0` 收口（A5c 裁定），合 fail-closed 方向 |
| §5 四判据 `rc/parsed/appended/guard_hits` 本体 | `:171` | **`:184-220` 完全不含** | **分层不一致（需点名）** | 四判据在 `.rebuild/s1b_step3/check_acceptance.py:18,33-66` 与 gate summary，RSI 判据函数只看 peak/rc/phase/limit。后果：**RSI 侧对"234 全量并林"与 `guard_hits` 零判据**（`guard_hits` 只经 `limitBytes != gateBytes` 间接反映抬门，不反映"门内是否杀过进程"）；唯一 234 相关检查是 P5 的**相对** `count_A == count_B` × 2（`:840-843`）。这是合同 §5 `:177` "禁止新增第五判据"下的**缺口而非冲突**，但必须在翻转回执里以外层 checker 补齐 |
| §2.0-1 回执逐轮记档位口径 | `:109` | `:1012` 回执行 | **不一致（缺字段）** | 无 `attempts=`/`fail_cap=`/`fail_count=` ⇒ 跨档读数不可互比的机械前提未落 |
| §2.0-2 双双记录来源轮 | `:110` | `:951-958` + `:1012` | **一致** | `peak_of_min_us_round` 与 `peak_max_over_successes` 同留 |

---

## 3. 档 3 现在若跑，会得到什么判词（**推演**，非实测）

标"推演"的每一步都给了代码行依据；本席**未运行任何命令**，故无一条是实测判词。

1. **直接跑 `rsi cdomain --corpus:3`（不改树）** —— 推演判词：
   `main.cheng:215-217` 先过 `RsiCompilerCorpusOpen(3)`，现势返回 `false`（`types.cheng:131-132`）⇒
   stdout `rsi_cdomain: corpus tier 3 BLOCKED (only tier 0 open)`，返回码 `2`，**不进入任何烤制**（MkdirAll/账本写在 `:219-220` 之后）。
   与 `tier3_slot_verification.md:39` 的 V3 预期一致，但该 V3 **从未执行**（文中自标"未执行"）⇒ 本席同样只给推演，标注 **未验证**。
2. **若人为把 `Open(3)` 置 true、其余不改（默认门）** —— 推演判词：
   genesis 腿 `RsiCdBakePairedInto(..., jobsTier=0, corpusIdx=3, "g0", ...)`（`main.cheng:251-253`）⇒ `tier3=true`、`maxAttempts=5`、`maxFail=1`（`:882-884`）；
   每次尝试以权威门 805,306,368 B 包 guard（`:242-247,297-316`）。**现势内核在默认门下会撞 768MiB 守卫**（原始件：`r104_recov.summary.txt` rc=125/`guard_hits=1`；`c2d_default_hardcut.summary.txt` rc=125）⇒ guard 返回非 0 ⇒ `:317-319` `rrc != 0` 立即 return（`okK=0`）⇒ `failCount=1`；第二尝试再败即 `:925-926` `failCount > maxFail` return ⇒ `goodCount=0 < 3` ⇒ `:1014-1015` `outOk=0` ⇒
   stdout `rsi_cdomain: FAIL genesis paired bake failed`（`main.cheng:255`），返回码 `1`。
3. **若抬门（3.6 GiB，`rss_guard_env=3865470566`）绕过内存墙** —— 推演判词：
   即使并林到 234（`b1601_b16fix.summary.txt` 的抬门形态），guard 报告 `memory_limit_bytes=3865470566` ≠ 权威门 ⇒ `RsiCdMeasurementVerdict` 返回 `diagnostic_cap_override`（`:188-189`）⇒ `:363-368` 打出 `cd_c2_reject reason=diagnostic_cap_override ...`、`outC2Reject=1` ⇒ `:921-922` 立即 return（不重试）⇒ 仍 `FAIL ... paired bake failed`。
   且抬门轮本身 `class=diagnostic`（合同 `:28`/`:205` 不得计入达标）⇒ 双重排除。
4. **即便假设默认门全绿（现势无此原始件）** —— 推演：S4 检查点还有三道机械门会拦：
   ① 轮内 CID 全等（`:947-949,966-968`）要求载具报告发 `source_snapshot_root_cid`——C 链有（`kd_b102.report.txt:32`），Cheng 链按合同 §10-3 `:260` **只有计数**；若档 3 换纯 Cheng 载具 ⇒ `cd_tier3_cid_reject reason=missing_or_inconsistent_cid`（`:941-943`）。
   ② 逐相账：峰值轮 `.phase.tsv` 必须含 5 个已钉相锚（`:707-709`），缺任一 ⇒ `cd_tier3_phase_reject reason=missing_phase_reading` ⇒ `:978-980` `phase_ledger_incomplete`。
   ③ 工具 sha（`:984-995`）与冻结记录落盘（`:996-1006`）。
5. **一句话判词**：现势下档 3 若跑，**不可能产出任何回执或 accepted 判词**；机械可得的词只有两种：
   `rsi_cdomain: corpus tier 3 BLOCKED (only tier 0 open)`（门，rc=2）或 `rsi_cdomain: FAIL genesis paired bake failed`（强行开门后，rc=1）；
   抬门路径额外产出 `cd_c2_reject reason=diagnostic_cap_override`。

---

## 4. 无法判定 / 未验证（逐条，不得当 0）

1. **§6.2.1 逐相贴线（A5）**：默认门轮相 4/5/6 原始件不存在（默认门轮止步 append 相），相 3 无实测锚、相 6 = 待钉区⑤ ⇒ 无法判定，缺"默认门轮相 4/5/6 的 RSS 实测 + 相 3/6 模型值"两个读数。
2. **载具是否发 `source_snapshot_root_cid`（取决于选哪条链）**：C 链已在位（`kd_b102.report.txt:32`）[实测]；Cheng 链缺根 CID（合同 §10-3）⇒ 若档 3 换纯 Cheng 载具，CID 检查点必然 fail-closed，**未验证**（本档未指定载具）。
3. **逐相 trace 锚 ↔ 模型相映射**（合同 §3.2 表 `:128-140`"candidate 映射"）：`csg_stage=enter/after_binding_source_texts/after_profiles` 与 `csg_mem tag=ta_stream arena=` 在真默认门轮是否齐 5 相，**未验证**（`tier3_slot_verification.md:47` 自述未钉）。
4. **P4/P5 判词从未在真实两腿跑过**：只经 `rsi_contract.cheng:357-432` 合成夹具；且 P5 未接线到 `main.cheng`（B6）。
5. **`CHENG_CSG_MEM_TRACE=1` 对档 3 读数/时长的影响未测**（`compiler_domain.cheng:288-289` 只对 `corpusIdx==3` 追加；`tier3_slot_verification.md:50` 自述未测）。
6. **在飞的 `b1701`（pid 8203/8623/8627）结果未知**：本席核对时刻仍在跑（ELAPSED 21:56），其 summary 未落盘 ⇒ 不得引用其任何数字。
7. **合同 §0 表的"现势"是 2026-09-13 快照**：`r45_recheck`/`r52_raised` 仍是在位原始件且结论方向未变，但**不是最新件**；最新整体轮 `b1601_b16fix`（09-14 02:57）与最新默认门轮 `c2d_default_hardcut`（09-13 09:28）才是本轮引用的现势锚。

---

## 5. 证据索引（本件引用到的全部原始件）

- 合同：`docs/campaigns/2026-09-07-pure-cheng-rsi/corpus_tier3_contract.md`（全文 282 行）
- 内核默认门原始件：`.rebuild/s1b_step3/r9/gate/r104_recov.summary.txt`（rc=125/appended=136/hits=1）、`.rebuild/s1b_step3/r9/gate/c2d_default_hardcut.summary.txt`（最新默认门，09-13 09:28）、`.rebuild/s1b_step3/gate/r45_recheck.summary.txt`、`.rebuild/s1b_step3/gate/r52_raised.summary.txt`
- 内核抬门原始件（仅 diagnostic）：`.rebuild/s1b_step3/r9/gate/b1601_b16fix.summary.txt`（appended=234/rc=1/`rss_guard_env=3865470566`/`max_csg_rss=1534445320`）、`t8b_equiv.summary.txt`、`b1401_a_arm.summary.txt`
- 载具报告：`.rebuild/s1b_step3/r9/kd_b102.report.txt`（`:11,21-32,76,78-80,94-95,118`）、`kd_b1601.report.txt`、`kd_t8b.report.txt`
- 门禁工具：`.rebuild/s1b_step3/gate_run.sh:13-26`、`.rebuild/s1b_step3/check_acceptance.py:18,33-66`、`tools/memory_model_limits.sh:19-29`
- 静窗/槽位：`.rebuild/COMPILE_SLOT.lock/owner.txt`（`pid=8203 purpose=b17line_b1701_gate`）、`ps` 现场（pid 8203/8623/8627）
- 账本：`artifacts/rsi_compiler`（**不存在**）、`artifacts/rsi_compiler_c1_t3/{current.txt,events.log,budgets.tsv,rsi.facts.jsonl}`（corpus=1）、`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/cdomain_events.log`（corpus=0）
- 本档既有核对件：`docs/campaigns/2026-09-07-pure-cheng-rsi/tier3_slot_verification.md`（`:31-53` 槽位门与未验证项）、`receipts/tier3_static_verdict.txt:57`（`TIER3_STATIC_VERDICT=PASS (仅机械静态面; 未编译、未运行)`）
- 口径改判依据：`docs/campaigns/2026-09-07-pure-cheng-rsi/compiler_domain_c1c2_contract.md:25,28,114`（A5b/A5c/A5d：`enforced` 口径、峰值取成功轮 max、缺键不回落）

**本件性质**：只读核对回执。未编译、未链接、未计时、未取编译槽位、未改任何源码或在飞文件；所有"满足"均指**代码/原始件在位**，不等于"已实跑通过"。
