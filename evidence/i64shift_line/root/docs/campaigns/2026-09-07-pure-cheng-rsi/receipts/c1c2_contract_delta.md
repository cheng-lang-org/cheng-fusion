# S3 C1/C2 契约-实现差异对账（只读回执）

> 只读：未编译、未运行、未取锁、未改任何既有文件；本件为唯一新建文件。
> 路径更正：任务给的 `design/compiler_domain_c1c2_contract.md` 不存在，实际合同 = `docs/campaigns/2026-09-07-pure-cheng-rsi/compiler_domain_c1c2_contract.md`（glob 命中，另有 `.rebuild/f4_line/croot/` 镜像副本）。
> 引用哈希（sha256 前 16）：合同 `5dfc3b3b79d968f8`；实现 `compiler_domain.cheng`=`60dfe56ffbec5b6e`；`rsi_gate.cheng`=`665031e28efe1cc5`；`rsi_contract.cheng`=`88406a8b693fa04d`；档 3 合同 `corpus_tier3_contract.md`=`3ae1fae49b122c06`；上审查者件 `receipts/tier3_prereq_checklist.md`=`0186a2689b7aa23a`；`tools/phase_line_check.py`=`f4ab22bc99086faa`；`tools/memory_model_limits.sh`=`ff86bd2db388c248`。

## 0. 结论先行

上审查者三条候选差异，**没有一条是干净的"合同 vs 实现"全成立**：
- ① 50MB 阈值：判据函数面无；但**阈值已在 A3 冻结工具实现**（非"不存在"），且 c1c2 合同根本没写 50MB。→ **部分成立**
- ② 抬门先于缺读数：实现顺序描述为真，但**与 c1c2 合同判词优先级表逐行一致**，不是对 c1c2 的差异。→ **部分成立（对档 3 合同文字冲突）**
- ③ forest 判据：**并林行数判据（234）确实在 RSI 侧缺失**；但 forest 相 RSS 读数在 RSI 侧存在。→ **部分成立**

根因：上审查者引的是 **档 3 合同**（corpus_tier3_contract.md），本任务的 C1/C2 合同是**另一份更新更专的单点派生件**；两件在"逐相判据边界"上口径不同。

## 1. 三条候选差异逐条对账

| # | 合同原文（file:line） | 实现逐字（file:line） | 判定 | 后果 |
|---|---|---|---|---|
| ① | 本任务合同 `compiler_domain_c1c2_contract.md:31`：「逐相读数在位是 PASS 的必要条件…**逐相行 0 行 ⇒ 判 missing_phase_readings FAIL**」（**未含 50MB**）。50MB 条来自档 3 合同 `corpus_tier3_contract.md:122`「逐相 : 每相实测 RSS 对模型值报差值；`|Δ| > 50 MB` 即遗留物，必须解释」+ `:174` | 实现判词面只有存在性：`compiler_domain.cheng:194-195` `if phaseRows <= 0:` / `return "missing_phase_readings"`。无模型值、无 Δ、无 50MB。实现自认外推：`:379-382`「单一权威不复刻: 模型锚 + 50MB 阈值归 `tools/memory_model_limits.sh` + `tools/phase_line_check.py`」。该工具确有阈值：`tools/phase_line_check.py:78` `THRESHOLD_BYTES = 50000000`；`:516-522` `delta = actual - anchor…` / `return ('FAIL' if delta > THRESHOLD_BYTES else 'PASS')` | **部分成立**：判据函数面确实无 50MB（成立）；但"阈值不存在"为假——阈值在 `f4ab22bc…` 工具在位。对 c1c2 合同**不构成差异**（该合同只要求行数>0）；只有对档 3 合同才是缺项 | 50MB 贴线**在任何 RSI 运行期判词里都不执行**：`phase_line_check.py` 全仓只被 `docs/.../verify_tier3_slot.sh:160,177` 与文档引用，`src/rsi`+`src/tools/rsi_gate.cheng` 零调用（grep 实测）。C2 PASS 只证"有逐相行"，不证"贴线"。**未验证**：工具从未在真 cdomain/gate 轮被接线执行 |
| ② | c1c2 合同判词优先级表 `:32-46`：`pass`→`missing_limit_reading`(行2)→`diagnostic_cap_override`(行3)→`missing_peak_reading`(行4)→`missing_phase_readings`(行5)→…；档 3 合同 `:175`「缺任一读数一律 REJECT」 | `compiler_domain.cheng:186-195` 逐字顺序：`186 if limitBytes <= 0:`/ `187 return "missing_limit_reading"`；`188 if limitBytes != gateBytes:`/ `189 return "diagnostic_cap_override"`；`192 if peakOk != 1 || peakBytes <= 0:`/ `193 return "missing_peak_reading"`；`194 if phaseRows <= 0:`/ `195 return "missing_phase_readings"` | **部分成立**："抬门先于 missing_peak/phase 读数"为真；但**完整顺序 = 缺限读数 → 抬门 → 缺峰值/逐相**，与 c1c2 合同优先级表**逐行一致**，对 c1c2 **不成立为差异**。仅与档 3 合同 `:175` 字面"缺任一读数一律 REJECT"冲突（上审查者 `tier3_prereq_checklist.md:102` 自己标注"优先级合同未定"） | 抬门 ∧ 缺峰值时返回 `diagnostic_cap_override`（DIAGNOSTIC/rc=3/不写基线），不返回 `missing_peak_reading`。两种判词都不放行 PASS，实际排除效果相同；但**门禁 detail 词与档 3 合同字面不一致**，机械对照会误报。c1c2 侧无缺陷 |
| ③ | 档 3 合同 `:171`「`rc=0` ∧ `forest_parsed_lines=234` ∧ `forest_appended_lines=234` ∧ `guard_hits=0`」（上审查者 `tier3_prereq_checklist.md:105` 记"RSI 侧对'234 全量并林'与 guard_hits 零判据"）。c1c2 合同**未列**该四判据 | RSI 侧**并林行数/guard_hits 零判据**：`grep forest_parsed\|forest_appended\|guard_hits src/rsi` = **0 命中**。RSI 侧**有** forest 相 RSS 读数：`compiler_domain.cheng:502` 相表注释、`:563-571` `strings.HasPrefix(tagName, "forest")`→`outForestRss` 取峰值、`:578` `if forestSeen != 1: outMissing = +8`、`:735` `phase=forest rss_bytes={forestRss}` | **部分成立**："forest_parsed/appended_lines=234 与 guard_hits 四判据在 RSI 侧缺失"**成立**；"forest 相缺失"**不成立**（RSS 相在，且缺相即拒 `:707-709`） | RSI 运行期无法自证"234 全量并林"与"门内未杀进程"：`guard_hits` 只经 `limitBytes != gateBytes` 间接反映抬门，不反映是否真触发杀进程；234 唯一相关检查是 **P5 相对式** `count_A == count_B`（`:840-843`），且 P5 仅测试调用（见 §3）。⇒ 四判据只能由外层 `.rebuild/s1b_step3/check_acceptance.py` 补齐（引用该件的 `r45_recheck`/`r104_recov` 轮均 `rc=125`/`guard_hits=1`，非绿） |

## 2. 判词顺序对照（实现 vs 两合同）

| 序 | 实现 `compiler_domain.cheng` | c1c2 合同 `:34-46` | 档 3 合同 `:175` |
|---|---|---|---|
| 1 | `:186-187` missing_limit_reading | 行 37（第 2 行） | 未单列 |
| 2 | `:188-189` diagnostic_cap_override | 行 38（第 3 行） | "抬门轮 diagnostic"（`:146,205`） |
| 3 | `:192-193` missing_peak_reading | 行 39（第 4 行） | "缺任一读数一律 REJECT" |
| 4 | `:194-195` missing_phase_readings | 行 40（第 5 行） | 同上 |

⇒ 实现 = c1c2 合同逐行落地；档 3 合同未给优先级，冲突属"档 3 合同未同步 c1c2 优先级表"。

## 3. `RsiCdFreezePairVerdictInto` 调用点（全仓 grep）

| 位置 | 性质 |
|---|---|
| `src/rsi/compiler_domain.cheng:803` | 函数定义 |
| `src/tests/rsi_contract.cheng:400,412,418,432` | **仅有的 4 个调用点，全在测试** |
| `src/rsi/types.cheng:130` | 注释引用（非调用） |
| `docs/campaigns/2026-09-07-pure-cheng-rsi/verify_tier3_slot.sh:99` | grep 字符串 token（非调用） |

⇒ **成立：调用点只在测试里**。`src/apps/rsi/main.cheng` 零命中 ⇒ 真 A/B 流程不执行 P5 配对（与上审查者 B6 一致）。

## 4. 未验证 / 边界（不得当 0）

1. **未验证**：本席未编译、未运行任何 cdomain/gate 轮；"50MB 工具未接线"由 grep 静态得出，未在真烤轮观测。
2. **未验证**：`phase_line_check.py` 的 `--audit-dir` 与逐相判定在真默认门轮（`rc=0`）从未成立过（现势最新默认门 `rc=125`）。
3. 档 3 合同 `:175` 与 c1c2 合同优先级表的冲突，是**合同间**冲突，不是实现缺陷；哪份优先未由本轮裁定。
4. `RsiCdBakeOnceInto` 只调 `RsiCdMeasurementVerdict`（`:363`），`RsiCdC2Verdict` 只被 `rsi_gate.cheng:149` 调用 ⇒ 基线/回归帽/bad_rc 三段在烘焙路径不生效（上审查者 D6 同点；本任务未要求核实，登记备查）。

**交付裁定句：c1c2 合同与其实现主链（硬门/回归帽/rc/逐相存在性/基线拒写）可交付用户裁定，但档 3 的 forest 行数四判据、50MB 逐相贴线与 P5 配对判据在 RSI 运行期均无落点，若用户要的是档 3 全验收面则不可交付——缺口清单 = ① `forest_parsed_lines/forest_appended_lines/guard_hits` 四判据无 RSI 落点；② 50MB 逐相差值只在 `tools/phase_line_check.py` 而未接线 cdomain/gate；③ `RsiCdFreezePairVerdictInto` 仅测试调用、A/B 生产流程未接线。**

_本件只读回执，未编译、未运行、未取锁、未改任何既有文件。_
