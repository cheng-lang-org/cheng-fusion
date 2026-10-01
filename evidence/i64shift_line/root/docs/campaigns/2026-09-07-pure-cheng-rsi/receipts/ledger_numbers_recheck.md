# 账本数字与 sha 逐条复算（T2 只读回执）

- 复算对象：`docs/cheng-rsi-acceptance-status.md`（现势 1003 行，sha256[:16] `ce5fe1ce9708d0de`；§6.1cl–co 在 872–975 行）。
- 只读声明：未编译、未取 `.rebuild/COMPILE_SLOT.lock`、未改既有件、未建分支/worktree、未 git add/commit/push；唯一新建 = 本件。
- sha 命令：`shasum -a 256 <file> | cut -c1-16`。
- **§7.0「默认门 summary」口径（本席声明）**：`find .rebuild -name '*.summary.txt'` 共 **198** 份（`.rebuild` 外 0 份、`artifacts/` 0 份），逐份取 `rss_guard_env`，**仅 `rss_guard_env=unset` 计默认门**（与 `tools/phase_line_check.py:13,16` 的机器可读判据一致）；抬门数字（如 3865470566）一律不计。
- 字段抽取命令：`find .rebuild -name '*.summary.txt' -exec awk '/^label=/{l=$0}/^rss_guard_env=/{g=$0}/^forest_appended_lines=/{a=$0}/^class=/{c=$0}END{printf "%s\t%s\t%s\t%s\n",FILENAME,l,g,a}' {} \;`

## 1. §7.0 档 3 行（默认门 44 份）

| 断言 | 结论 | 复算命令 / 原始输出 | 绑 file:line + sha256[:16] |
|---|---|---|---|
| 44 份默认门 summary | **算得** | 上述抽取后过滤 `rss_guard_env=unset` → **44**，目录分布 `{.rebuild/s1b_step3/r9/gate: 44}` | — |
| 0 份 rc=0 | **算得** | 44 份 rc 分布 `rc=125: 42, rc=2: 2`；rc 取自首行 `label=… rc=` | — |
| 最好 136/234 | **算得** | 44 份 `forest_appended_lines` 降序首项 = **136**，label=`r104_recov` | `.rebuild/s1b_step3/r9/gate/r104_recov.summary.txt` sha `e6f7fce8c2060476` |
| 「唯一 234 那份 `rss_guard_env=3865470566`+`class=diagnostic`」 | **部分算得；「唯一」算不得** | `m103_default.summary.txt` 实测确为 `forest_appended_lines=234`、`rss_guard_env=3865470566`、`class=diagnostic`。但全 `.rebuild/**/*.summary.txt` 达 234 的共 **81** 份、**全部** `rss_guard_env=3865470566`（53 `class=acceptance` + 28 `class=diagnostic`）⇒「唯一」不成立；44 份默认门中达 234 的 = **0** | `.rebuild/s1b_step3/r9/gate/m103_default.summary.txt` sha `91d3a9e182cef237` |
| `Open(3)` 落点 | **算得（逐字）** | `src/rsi/types.cheng:131-132` 逐字：`fn RsiCompilerCorpusOpen(corpusIdx: int32): bool =` / `    return corpusIdx == 0 || corpusIdx == 1` | `src/rsi/types.cheng` sha `a104273e7dc409a2` |

## 2. §6.1cm S1 行（引用对账）

| 断言 | 结论 | 复算命令 / 原始输出 | 绑 file:line + sha256[:16] |
|---|---|---|---|
| 账本 149 条引用 | **不可复算** | S1 审计的是账本 **929 行/`fac35798e8ad1565`** 快照；盘上无该快照（`grep -rl fac35798e8ad1565 .` 零命中），现势账本 1003 行/`ce5fe1ce9708d0de`。且 `audit_claims.py` 只做语义自检（S1 回执记 `audit: 32/32 OK`），不产出引用计数 | 回执 sha `cc0e15c24c45470e` |
| 39 条含失效 | **算得** | S1 回执 §②A 表数据行数 = **39**（排除表头行） | 同上 |
| 18/18/3 分解 | **算得** | 39 = **3**（`.rebuild/semantic/superseded/` 的 v0/v1/v3f，行号 596/597/608,692）+ **18**（替代列可解析到 docs 侧现存件：行 68,70,210,214,228,400,481,521,527×3,601,724,799,810,811,817,859）+ **18**（无 docs 侧替代：406,424×2,464×2,468,500,537×2,601,602,679×2,683,683,818,809,908×2,928）。脚本按替代列 token 存在性判定 | 同上 |

## 3. §6.1co（a7_assert_emit.py 与硬门）

| 断言 | 结论 | 复算命令 / 原始输出 | 绑 file:line + sha256[:16] |
|---|---|---|---|
| 键数 44 | **算得** | `len(EMIT_KEYS)=38` + `len(COMPARE_KEYS)=6` = **44**（import 模块实测）。账本括号分解「37 theory_emit_*」**少算 1**（实为 38），总数 44 正确 | `.../tools/a7_theory_emit/a7_assert_emit.py` sha `99440cca1a81ad7d` |
| 硬门权威值 `805306368` | **算得** | `tools/memory_model_limits.sh:20` = `CHENG_MEMORY_MODEL_LIMIT_BYTES=805306368`；脚本 `authority_gate()` 按 `^CHENG_MEMORY_MODEL_LIMIT_BYTES=(\d+)\s*$` 唯一匹配，实测返回 `805306368`，对不一致值硬 FAIL | `tools/memory_model_limits.sh` sha `ff86bd2db388c248` |

## 4. §6.1cn（A7 快照取法三数 + target sha）

| 断言 | 结论 | 复算命令 / 原始输出 | 绑 file:line + sha256[:16] |
|---|---|---|---|
| HEAD `src` 5388 | **算得** | `git ls-tree -r --name-only HEAD src | wc -l` → **5388**（现势 HEAD `f45f5eda`；A7 轮时 `75ffa3348`） | — |
| 工作树 5992 | **算得** | `find src -type f | wc -l` → **5992**（另一口径 `git ls-files --cached --others --exclude-standard src`=5409，非本数） | — |
| b2_root 6025 | **算得** | `find .rebuild/b_line/b2_root/src -type f | wc -l` → **6025** | — |
| target sha `2c59e7e08b37d8d3` 可从盘复算 | **算得** | 内存打补丁（不落盘）：HEAD blob `d9ce7172b5bbf77996b5b898b7f378f36a6b60e7`（sha256 `880d4632228e70b4`）→ P1 逐 hunk 偏移 (0,3,31,31,31,31) → blob `d645770068cae1ae2ac5239b70ae0447dd301d1d` → P2 偏移 0 → blob `a75ad0ae0c555707d1a74543f1b23ae615e54715`，sha256[:16] = **`2c59e7e08b37d8d3`**（P1 非零偏移，但 `patch` rc=0） | P1 `3f152300698faa51`、P2 `bf45ff07db50cae5`（均在 `docs/campaigns/2026-08-31-kernel-userpath/patches/`） |

## 5. §6.1cl（judge/v1 计数）

| 断言 | 结论 | 复算命令 / 原始输出 | 绑 file:line + sha256[:16] |
|---|---|---|---|
| judge 满绿 `checks_pass=45` | **算得** | `receipts/semantic_steps/v3f/guard.out.txt:46` 逐字 = `cheng.rsi.semantic.v1 checks_pass=45 checks_fail=0 entries=31+7 covered=31/31 best_correct=3937 …`；`grep -c '^check='` = **45** | `v3f/guard.out.txt` sha `7530ec1ffc73d0b4`；`v3f/PASS` sha `b26e51e3fa42b283` |
| v1 `self_test_pass=11` | **算得** | `receipts/semantic_steps/v1.log:12` 逐字 = `cheng.rsi.semantic.v1 self_test_pass=11 self_test_fail=0`；`grep -c '^check='` = **11** | `v1.log` sha `c9b93670a3a95b08` |
| 行号归属附注 | — | `checks_pass=45` 位于 §6.1ck(L860) 与 §6.1cm(L913)，**不在** §6.1cl(872–882)；数字与文件均对，仅节号错位 | — |

## 不可复算项

1. **S1「149 条引用」**：绑定 929 行/`fac35798` 账本快照，该快照盘上已不存在；只能重跑新对账得新数，不能复现 149。
2. **§6.1co 三态实测**（合成样本 `/tmp/a7_assert_smoke2/valid.txt` 的 PASS/FAIL/PASS rc=0/1/0）：临时件已不在盘，无法重放；只能核对脚本逻辑与键表（键表 44 已核）。
3. **§7.0「唯一 234 那份」的「唯一」**：机械上不成立（81 份达 234，全为抬门）；只有 `m103_default` 的三项属性本身可复算。
4. **§6.1co 分解「37 theory_emit_*」**：实际 38；仅此分解数字不可复现，总数 44 与硬门值可复现。
