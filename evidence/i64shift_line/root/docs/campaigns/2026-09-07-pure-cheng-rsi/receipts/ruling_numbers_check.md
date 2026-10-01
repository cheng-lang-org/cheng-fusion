# 裁定书数字 / sha 复算回执（V1，只读）

被审件 `docs/cheng-rsi-acceptance-ruling.md`（read=31 行）sha256 `4abd88c3f77ba7780d9b8ca505242b4dbc6e99082969f95232b8e8b0b47b623e`。复核时刻 2026-09-14 CST。
只读：未编译、未链接、未取 `.rebuild/COMPILE_SLOT.lock`、未改任何既有文件；本件为唯一新建文件。
口径告警：`.rebuild/` 是活树，本席复算取「现势值」；回执当时快照与本件现势不同时点名（⑩-F / F-5）。

| # | 裁定书值 | 复算命令（摘要） | 逐字输出（摘要） | 判 |
|---|---|---|---|---|
| ① | 工具源 `2c855f8aff34e19f…`、1131 行 | `wc -l src/tools/rsi_semantic_regression.cheng`；`shasum -a 256` 同件 | `1131 src/tools/rsi_semantic_regression.cheng`；`2c855f8aff34e19ff525910062362e4175a5d7e2946a8d5ab552a83476f5c820` | 算得 |
| ② | 基线 `7995091fa119bb54…` 与冻结副本逐字节同、38 条 | `shasum -a 256` 四份；`cmp`；`grep -c '^entry '` | 四份同 `7995091fa119bb54d66dbda82aa0b4b9c772691a78889ca477967b07e54ac033`；`cmp`→IDENTICAL；`entry=38` | 算得 |
| ③ | judge `checks_pass=45 checks_fail=0 entries=31+7 covered=31/31 best_correct=3937`（v3f/guard.out.txt） | `grep -n 'checks_pass=45' …/v3f/guard.out.txt`；`grep -c '^check=cell_'`；`grep -c '^check=fixture_\|pair2_\|closure8_\|corpus0_'` | `46:cheng.rsi.semantic.v1 checks_pass=45 checks_fail=0 entries=31+7 covered=31/31 best_correct=3937 compiler_sha=05af823e… mode=0`；cell=31；fixture=7 | 算得 |
| ④ | 自检 11 例（semantic_steps/v1.log） | `grep -c '^check=self_test' …/v1.log`；`tail -2` | `11`；`cheng.rsi.semantic.v1 self_test_pass=11 self_test_fail=0` | 算得 |
| ⑤ | 基线重录轮 388 秒（.rebuild/semantic_run45.log 或镜像） | `grep -n '388' …/evidence/semantic_run45.log`；`cmp .rebuild/semantic_run45.log …` | `58:SEMANTIC_VERDICT=PASS steps=(v2 v2b v3 v7 v8 v3f) attempts=6 elapsed=388s`；`cmp`→IDENTICAL | 算得，**归属需更正**：388s = 6 步批次总墙钟（v2 起→v3f 止），非「无缓存全量 judge 单轮」；v3f 单步 `20:55:18Z→20:57:30Z≈132s` |
| ⑥ | c1c2 合同 `5dfc3b3b…`；实现 `src/rsi/compiler_domain.cheng` | `shasum -a 256 …/compiler_domain_c1c2_contract.md`；`ls src/rsi/compiler_domain.cheng` | `5dfc3b3b79d968f82637bf4bf7e7d0a7d95df24636fd1054284597f0cc109784`；实现件在位 | 合同 sha 算得；「判词优先级表**逐行一致**」**算不得**（F-1） |
| ⑦ | `Open(3)` `types.cheng:131-132` 逐字、`types.cheng` sha `a104273e…`；44 份默认门 / 0 rc=0 / 最好 136/234 / 81 达 234=53+28 | `sed -n '131,132p' src/rsi/types.cheng`；`shasum -a 256 src/rsi/types.cheng`；python 扫 `.rebuild/**/*.summary.txt`（`rss_guard_env` 分组） | `fn RsiCompilerCorpusOpen(corpusIdx: int32): bool =` / `    return corpusIdx == 0 || corpusIdx == 1`；`a104273e7dc409a2693b438d31c1b4d1e7dbf42bb0afc4a6c4a5506a17a15323`；`unset_count 44 / unset_rc0 0 / unset_max_appended 136 / all_appended234 81 / cls_prefix {acceptance:53, diagnostic:28} / env_of_234 {3865470566:81}` | 算得 |
| ⑧ | P-a `compiler_domain.cheng:296` = `CHENG_COMPILER_CSG_STDERR=1` | `sed -n '296p' src/rsi/compiler_domain.cheng`；`grep -n CHENG_COMPILER_CSG_STDERR` | `        add(envList, "CHENG_COMPILER_CSG_STDERR=1")`；在 `:288 if corpusIdx == types.RsiCompilerCorpusTier3:` 内，全文件仅 `:292` 注释另现 | 算得 |
| ⑨ | 前沿判词在 `.rebuild/b_line/b18_b17_ctrl_1line_field_chain_b1801.stderr.txt` | `cat …/b18_b17_ctrl_1line_field_chain_b1801.stderr.txt` | `typed expr: node origin proof is missing or contradictory fn=main line=30 op=38 parser_node=-1 synthetic=0 origin_stack=0 surface=body` | 算得 |
| ⑩-A | c1c2_contract_delta `727b7228…` | `shasum -a 256 …/receipts/c1c2_contract_delta.md` | `727b7228b868c41935b3ff55590288aba4fdec91acc77b90eb240b74add43321` | 算得 |
| ⑩-B | tier3_prereq_recheck `a0085dcc…` | `shasum -a 256 …/receipts/tier3_prereq_recheck.md` | `a0085dcc513002b52225e7b27c8bbf38c4373221e881a82294748af5ed70638b` | 算得 |
| ⑩-C | corpus_tier3_contract `3ae1fae4…` | `shasum -a 256 …/corpus_tier3_contract.md` | `3ae1fae49b122c0647d1ea6f43078752572926d2080f79adc1fc34da8d5d9cb3` | 算得 |
| ⑩-D | tier3_gap_plan / evidence_reconciliation / semantic_steps / evidence/wall_b18probe 在位 | `shasum -a 256 …`；`ls …` | gap_plan `101514894f4a5b31…`；reconciliation `cc0e15c24c45470e…`；semantic_steps（8 步+基线+obs_cache 37 件）；wall_b18probe/run.log 在 | 在位（裁定书未引后二者 sha，无从对） |
| ⑩-E | wall_b18probe `kd_b18probe=d38ac2dd…`、c1/c3 `bin=no` | `shasum -a 256 .rebuild/s1b_step3/r9/kd_b18probe`；`cat …/wall_b18probe/run.log` | `d38ac2dd805f8332aa84c53bd243e92b89d84b6983ccf58cbc01a2a356d27201`；`PROBE_RESULT src=c1 … bin=no`、`src=c3 … bin=no` | 算得 |
| ⑩-F | evidence_reconciliation.md 记 `audit_claims.py 32/32 OK` | `python3 docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/audit_claims.py` | **`audit: 30/32 OK`** / `  FAIL a9b.n.cli_sha256 6410dae9cdde` / `  FAIL a9b.n0.cli_sha256 6410dae9cdde` | **现势算不得**：记录 `6410dae9…` vs 现势 `.rebuild/rsi_cli/rsi_cli` `49ebdca190d2…`（06:32 重编） |

## F. 不可复算 / 算不得 / 需点名

- **F-1（算不得，⑥）**：合同表顺序 = `missing_baseline`（`compiler_domain_c1c2_contract.md:41`）→`pathological_baseline`（`:42`）→`over_hard_gate`（`:43`）；实现 `RsiCdMeasurementVerdict` 在 `:196-197` **先**判 `over_hard_gate`，`RsiCdC2Verdict` 在 `:212-215` **后**判基线，且实现注释 `:202-203` 写「基线有效性 -> 越硬门」与代码不符。集合一致、**顺序两处互换**，「逐行一致」不成立。
- **F-2（现势算不得，⑩-F）**：`audit_claims.py` 现势 30/32；原因是 `.rebuild/` 活树 06:32 重编 `rsi_cli`，非 docs 侧回执文本失效。
- **F-3（归属需更正，⑤）**：见 ⑤；「无缓存全量 judge」单步是 v3f（≈132s），388s 是整个 6 步批次。
- **F-4（不可复算，未验证）**：裁定书 §1「V4b 38/38 baseline=equal」「V5 闭包前提已变」「V6 私账本盘上无」、§2「三处差异原审查引错合同已更正」、§3「P-a 已由 CLI 重建 + cdomain 判词不变验证」、§纪律「本轮已修自伤面」均未给可比对原始件/命令，本次**未复算**，标『未验证』，不得当 0。
- **F-5（行号/实现 sha 已漂）**：`tier3_prereq_recheck.md`、`c1c2_contract_delta.md` 绑 `compiler_domain.cheng=60dfe56ffbec5b6e`（05:29/05:33），现势 `ac288371c1f1…`（P-a 后加，`git diff --numstat`=855/33）；两件内 `:288`/`:507-581`/`:803-858` 等行号相对现树偏移，引用须按现树重定位。
