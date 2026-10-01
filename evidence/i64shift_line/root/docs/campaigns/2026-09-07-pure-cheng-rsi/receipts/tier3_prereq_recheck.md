# 语料档 3 前置机械复核（S4 只读回执）

- 复核时刻：2026-09-14 05:29 CST；HEAD=`75ffa3348dc004eee767244279ae509c3f7491f4`（05:13:46 +0800）。
- 只读：未编译、未链接、未计时、未取编译槽位、未改任何既有文件；本件为唯一新建文件。
- 树漂移：清单快照 HEAD=`cb6773682e152006338d1fee9e5a94be3be68400` 是当前 HEAD 的祖先；`git status --porcelain -- src/` 40（清单时）→45（现势）；`.rebuild/COMPILE_SLOT.lock` 现势**不存在**、pid 8203 已退出。
- sha256 前 16：`src/rsi/compiler_domain.cheng`=60dfe56ffbec5b6e（1184 行）、`types.cheng`=a104273e7dc409a2、`proposal.cheng`=768f247ab976b4b7、`src/apps/rsi/main.cheng`=09b1e74283367002、`src/tests/rsi_contract.cheng`=88406a8b693fa04d、合同`corpus_tier3_contract.md`=3ae1fae49b122c06、`tier3_prereq_checklist.md`=0186a2689b7aa23a、`tier3_static_verdict.txt`=8f624d37b95cc60e。

## 0. 结论

现势 `Open(3)` 机械恒 false，且按合同**必须**保持 false（§2）。清单 A–E 逐条机械复核：A 组仅 A2 成立；A7 静窗第①②腿由「不成立」翻为「成立」（唯一实质变化）；其余方向不变。另见 §4 三条口径/时效不一致（C3 行号、D3 字段名、static_verdict 时效）。

## 1. tier/open 判定逻辑（逐字 + 行号）

- `types.cheng:131-132`（a104273e7dc409a2）：逐字 `fn RsiCompilerCorpusOpen(corpusIdx: int32): bool =` / `    return corpusIdx == 0 || corpusIdx == 1`。
- `types.cheng:83-85`：`RsiCompilerCorpusMax = 3` / `RsiCompilerCorpusTier3 = 3` / `RsiCompilerCorpusDispatchMinRel = "src/core/tooling/backend_driver_dispatch_min.cheng"`。
- `types.cheng:114-120`：`0→rsi_minimal_smoke`、`1→physics2d_determinism_smoke`、`else→DispatchMinRel`（档 2/3 同入口）。
- `main.cheng:215-217`（09b1e74283367002）：`if !types.RsiCompilerCorpusOpen(corpusIdx):` / `echo("rsi_cdomain: corpus tier {n} BLOCKED (only tier 0 open)")` / `return 2`。
- `proposal.cheng:44-46`（768f247ab976b4b7）：`if param < 0 || param > types.RsiCompilerCorpusMax: return false` / `return types.RsiCompilerCorpusOpen(param)`。
- `compiler_domain.cheng:882-884`（60dfe56ffbec5b6e）：`let tier3 = corpusIdx == types.RsiCompilerCorpusTier3` / `let maxAttempts = if tier3: 5 else: 12` / `let maxFail = if tier3: 1 else: 9`。
- `compiler_domain.cheng:288`：`if corpusIdx == types.RsiCompilerCorpusTier3: add(envList, "CHENG_CSG_MEM_TRACE=1")`。
- **注意**：`compiler_domain.cheng` 内**没有** open 门；开放位唯一判定点 = `types.cheng:132`，门落点 = `main.cheng:215` + `proposal.cheng:46`。`:288`/`:882-884` 的档 3 分支在 `Open(3)=false` 时不可达。

## 2. 现势 `Open(3)` 是否可以/必须为 false

1. **可以/事实上**：`types.cheng:132` 对 `3` 求值为 `false`（`3≠0 ∧ 3≠1`）；函数无第二输入、无运行期条件可令其为 true，唯一翻转路径是改 `:132` 该行。
2. **必须**：合同 `corpus_tier3_contract.md:194-195`（3ae1fae49b122c06）逐字：「`RsiCompilerCorpusOpen(3)` **仅在 S1 成立且本件被批准后**置 true」；S1 现势未成立（§3 A1/A3/A4/A6/A7）。
⇒ 现势答案：**是**（机械恒 false）且 **必须**（合同 S1 未成立）。`main.cheng:215-217` 会输出 BLOCKED 且 `rc=2`——本席**未执行**该命令，标 **未验证**。

## 3. 前置逐条机械复核（清单分组的每条）

### A 组 · 合同 §6.2 S1
| 前置 | 复核结论 | 判据（file:line / sha16） |
|---|---|---|
| A1 rc=0 | 不满足 | 枚举 `rss_guard_env=unset` 的 summary **44 份，0 份 rc=0**；实现侧 rc=0 由 guard `--expected-exit-code:0`（`compiler_domain.cheng:301`）+ `:317-319` 与 `RsiCdC2Verdict bad_rc`（`:218-219`）保证，**口径不矛盾**，属实测未达 |
| A2 parsed=234 | 满足 | 同上 44 份中 32 份 `forest_parsed_lines=234` |
| A3 appended=234 | 不满足 | 默认门最大 =136（`r104_recov.summary.txt`=e6f7fce8c2060476）；`m103_default.summary.txt`=91d3a9e182cef237 达 234 但 `rss_guard_env=3865470566`+`class=diagnostic`（抬门轮，合同 `:205` 不计） |
| A4 guard_hits=0 ∧ 树峰≤805306368 | 不满足 | `r104_recov.summary.txt` `guard_hits=1` `rss_bytes=839353592 > limit_bytes=805306368`；`c2d_default_hardcut.summary.txt`=cbb2dc790e54836f 同 rc=125/hits=1 |
| A5 §6.2.1 逐相贴线 | 无法判定（缺项） | `compiler_domain.cheng:184-198` 仅存在性（`:194-195`），无模型值/无 Δ/无 50MB；相 3/6 无锚（见 D7） |
| A6 身份入 receipts | 不满足 | `artifacts/rsi_compiler` 现势 `test -e`=**ABSENT**；`cdomain_events.log`=4ad615895ec50f37 仅 2 行 `corpus=0` |
| A7 源树冻结（P0 静窗） | 腿①②现势成立；腿③无法判定 | 05:29 `.rebuild/COMPILE_SLOT.lock` 不存在、`ps` 无 `b17_run_gate`/`guard`/`system-link-exec`（清单时点三腿全败，现势前两腿翻正）；腿③为 trial 内两次取样，本轮未开⇒**未验证** |

### B 组 · 合同 §1.x 语料/CID
| 前置 | 复核结论 | 判据 |
|---|---|---|
| B1 真实 plan 闭包口径 | 满足 | `types.cheng:120` + `compiler_domain.cheng:307-314`（`system-link-exec`） |
| B2 234 同带 root CID+source root | 满足（实例） | `.rebuild/s1b_step3/r9/kd_b102.report.txt:28,31,32` `source=…dispatch_min.cheng` / `source_snapshot_count=234` / `source_snapshot_root_cid=54c2ca9b…` |
| B3 CID 单点、禁复刻 | 未验证 | 本席未重读 `compiler_domain.cheng:583-614`，不判 |
| B4 P3 自洽（snapCount==inputCount） | 满足（实现） | `compiler_domain.cheng:601-611` 逐字 `if snapCount != inputCount: return`；真跑 **未验证** |
| B5 P4 轮内 CID 全等 | 满足（实现） | `compiler_domain.cheng:935-950` + `:966-968`；真跑 **未验证** |
| B6 P5 A/B 配对接线 | 不满足 | 唯一调用点 `src/tests/rsi_contract.cheng:400,412,418,432`；`src/apps/rsi/main.cheng` 零命中 |
| B7 身份行落库 | 不满足 | `grep cdomain_tier3_identity src/` 仅命中 `compiler_domain.cheng:666` 自身，无 append 点 |
| B8 patch_sha 必记 | 不满足 | `compiler_domain.cheng:771-772` 传 `""` → `:664` 落 `patch_sha=unpinned` |
| B9 234 硬编码 checker | 满足 | `.rebuild/s1b_step3/check_acceptance.py:18`=d88f3463baa6db8b `EXPECT_SOURCES = 234` |

### C 组 · 合同 §6.2 S2–S8
| 前置 | 复核结论 | 判据 |
|---|---|---|
| C1 索引/Rel/Open | 满足（Open 正确 false） | `types.cheng:83-85,119-120,131-132` |
| C2 白名单/CLI 跟随 | 满足 | `proposal.cheng:44,46`；`main.cheng:215-217` |
| C3 S4 收尾检查点三项 | 满足（实现）；未验证（真跑） | `compiler_domain.cheng:961-1007`：cid `:966`、failCount `:969`、逐相账 `:978`、冻结 `:1004`、ok `:1007`；合同 `:197` 行号陈旧见 §4-1 |
| C4 S5 冒烟扩展 | 不满足（翻转时才需） | `src/tests/rsi_contract.cheng:330,334-335,337-339`（现树断言「档 3 闭」） |
| C5 S6 账本原子性 | 满足（机制） | `src/rsi/store.cheng:40` `RsiStoreVerifyChainInto`；`main.cheng:231` 调用 |
| C6 S7 翻转四件回执 | 不满足 | 全仓无 `*.freeze.txt`/`*.phases.txt`；`artifacts/rsi_compiler` 不存在 |
| C7 S8 反向回退事件 | 未实现 | `grep cdomain_tier3_blocked src/` 零命中 |

### D 组 · 合同 §2.0/§3.x/§4 判据口径
| 前置 | 复核结论 | 判据 |
|---|---|---|
| D1 档位口径单点 | 满足 | `compiler_domain.cheng:882-884` |
| D2 回执逐轮记档位口径 | 不满足 | `:1012`/`:1020` 回执行只有 `successes=`，无 `attempts=`/`fail_cap=`/`fail_count=` |
| D3 C2 峰值绑轮 | 满足（口径）；字段名不一致 | 取轮 `:951-958`；合同 §3.1:119-120 字面 `process_tree_resident_peak_bytes` vs 实现读 `process_tree_enforced_peak_bytes`（`:340`，注释 `:337-338`） |
| D4 硬门 | 满足 | `:196-197`；门值 `tools/memory_model_limits.sh:20`=ff86bd2db388c248 `=805306368` |
| D5 回归帽 | 满足 | `:216-217` `if peakBytes * 2 > basePeak * 3` |
| D6 rc=0 | 满足（实现） | `:218-219` `bad_rc`；bake 路径 `:301`+`:317-319` |
| D7 逐相差值 50MB | 不满足 | `:184-198` 无模型值/无 Δ/无阈值（仅 `:194-195` 存在性） |
| D8 逐相账 unpinned + events 行 | 部分不满足 | 腿级 `:728-736` 有 `# unpinned`；`grep cdomain_tier3_phase src/` 零命中 |
| D9 d_live 与 rss 不可互换 | 部分不满足 | `:525-571` 只取 `rss=`/`arena=`，不采 `live=` |
| D10 身份四元组 | ①满足②满足③不满足④部分 | ①`:885`；②`:754-794`；③`grep composition_source_closure_sha256 src/rsi src/apps/rsi src/tools/rsi_gate.cheng` 零命中；④`:619-632` 只读 `darwin_system_link_tool_sha256`，**argv sha 未采**（载具有 `kd_b102.report.txt:26`） |

### E 组 · 合同 §9 依赖项
E1（D1 索引）=C1；E2（D2 收尾+逐相）=C3/D8/D9；E3（D3 CID 接线）=B6/B7 部分；E4（D4 逐源清单）`grep` 无发射字段=未做（**未验证**逐行）；E5（D5 冒烟）=C4；E6（D6 gate 腿）`src/tools/rsi_gate.cheng:149` 调 `RsiCdC2Verdict`——四条负例真烤未执行（**未验证**）。

## 4. 不一致 / 未验证（点名，不得当 0）

1. **C3/合同 §6.2 S4 行号陈旧**：现树（1184 行，60dfe56f）检查点 = 966/969/978/1004/1007；合同 `:197` 引 954/957/966/992/994，整体偏 -12（按 1172 行态写就）。清单 C3 称「只有 `:966` 对得上」**不成立**：现树 `:966` 是 `if cidRounds != 3:`，而合同把 cid_rounds 系在 `:954`；逐相账在 `:978`。属清单子断言与实现口径不一致。
2. **D3 字段名口径**：合同 §3.1:119-120/§2.0-2:110 字面 `process_tree_resident_peak_bytes` vs 实现 `process_tree_enforced_peak_bytes`（`:340`）。清单称已由 `compiler_domain_c1c2_contract.md` A5d 裁定——该裁定件本席**未重读**，标 **未验证**。
3. **D7/A5 50MB 逐相差值**：合同 `:122`/`:174` 要求「实测 RSS 对模型值报差值」，实现在 `:184-198` **只有存在性**，无模型/无 Δ/无 50MB；缺项已核实，非「未验证」。
4. **static_verdict 时效**：`tier3_static_verdict.txt`=8f624d37b95cc60e 记 `my_added=835 my_removed=33 live_lines=1172`（`:51`）、快照 sha `cca14cf4…`（`:48`）；现势 `git diff --numstat` compiler_domain=**848/33**、`wc -l`=**1184**、sha=60dfe56f… ⇒ 该静态 PASS 早于当前工作树，**不能直接沿用**（增量来源未验证，可能含并发 lane WIP）。
5. **标签口径**：`m103_default`/b1701 系 header 写 `gate=default(768MiB)` 但 `rss_guard_env=3865470566`+`class=diagnostic`（91d3a9e1/d082801174952e1b/9e4063d974067fb1）⇒「default」标签不可信，必须读 `rss_guard_env`，抬门轮合同 `:205` 明令不计。

## 5. 未验证（逐条）

1. 本席**未执行**任何编译/`rsi cdomain`；§2 的 BLOCKED/rc=2 为源码推演。
2. B3（`:583-614` CID 单点）“未重读”。
3. D10③ 的四元组③零守卫只能证「无抽取点」，其后果（缺一降级 diagnostic）**未在真跑验证**。
4. E4/E6 的逐源清单发射与四条负例真烤**未执行**。
5. 清单 A5 所引 `tier3_slot_verification.md` 本席未重读。

**本件性质**：只读机械复核回执。所有「满足」指代码/原始件在位，不等于「已实跑通过」；行号绑 sha 60dfe56f…（compiler_domain.cheng）。
