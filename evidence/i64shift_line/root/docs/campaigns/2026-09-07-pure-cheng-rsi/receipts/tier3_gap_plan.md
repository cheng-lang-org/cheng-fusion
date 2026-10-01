# 档 3 三缺口落点级实现方案（只读回执）

> 只读：未编译、未链接、未运行、未取锁、未改任何既有文件；本件为唯一新建文件。
> 时刻 2026-09-14 05:45 CST；HEAD=`f45f5edae28c8ce3f7cd20036876be7488ae8d90`（依据回执时 `75ffa334…`，已漂）；`git status --porcelain -- src/`=46（回执时 40→45）。
> 树忙实测：`.rebuild/COMPILE_SLOT.lock/owner.txt` = `pid=79027 purpose=m2line_bake_t81 start=1789335567`；`ps` 见 `kd_t81 system-link-exec`（`m2b_root` canary）在飞 ⇒ **无槽位**，全部验证项标「待槽位」。
> sha256 前 16（现树复算，与两份依据回执一致）：`src/rsi/compiler_domain.cheng`=60dfe56ffbec5b6e(1184)、`types.cheng`=a104273e7dc409a2(228)、`src/apps/rsi/main.cheng`=09b1e74283367002(398)、`src/tests/rsi_contract.cheng`=88406a8b693fa04d(1250)、`src/tools/rsi_gate.cheng`=665031e28efe1cc5(754)、`tools/phase_line_check.py`=f4ab22bc99086faa(673)、`corpus_tier3_contract.md`=3ae1fae49b122c06、`compiler_domain_c1c2_contract.md`=5dfc3b3b79d968f8、`.rebuild/s1b_step3/check_acceptance.py`=d88f3463baa6db8b。
> 现势：`artifacts/rsi_compiler` **不存在**（`ls` 实测）；`artifacts/rsi_gate_store_compiler` 在位。本件只给方案，不含实测判词。

## 0. 结论（三落点 + 两个硬前置）

| # | 落点（file:line） | 输入来源 | 拒收判词 |
|---|---|---|---|
| ① | `compiler_domain.cheng:507-581` 加计数 + `:960-1013` 成功出口 | 同轮子进程 stderr `cd_<tag>.gerr.txt`（`:256`） | 缺计数 / 计数≠真实闭包计数 / `guard_hits`≠0 ⇒ 不出回执 |
| ② | `compiler_domain.cheng:972-980` 检查点外呼 `tools/phase_line_check.py` | 同轮 declared 逐相账（`RsiCdPhaseLedgerPath` `:643-648`） | 工具 rc∉{0,3} 或 stdout 含 `verdict=FAIL` ⇒ 拒 |
| ③ | `src/apps/rsi/main.cheng:203-396` A/B 分支 + `rsi_gate.cheng:557-594` | 两腿 `RsiCdFreezePath` 冻结记录（`:651-656` / 写端 `:754-794`） | `RsiCdFreezePairVerdictInto` 非 pass ⇒ 拒 |

两个硬前置（不属三缺口，但不修则 ①②③ 无法成立/验证）：
- **P-a（现树实测缺陷）**：RSI 档 3 环境缺 `CHENG_COMPILER_CSG_STDERR=1`。`csg_stage=` 行只在 `compilerCsgTraceStderr` 为真时发（`src/core/tooling/compiler_csg.cheng:2328` 判断、`:2204` 读、`:1657` `= os.GetEnv("CHENG_COMPILER_CSG_STDERR") == "1"`）；RSI tier3 envList（`compiler_domain.cheng:275-296`）只加了 `CHENG_CSG_MEM_TRACE=1`（`:288-289`）。⇒ `RsiCdTier3PhaseScanInto`（`:507-581`）的 enter/bind/profiles 恒缺，逐相账恒 `cd_tier3_phase_reject reason=missing_phase_reading`（`:707-709`）。故 `artifacts/rsi_compiler` 至今为空，档 3 从未产出过账本。**未验证**（未跑）。
- **P-b（接口缺口）**：`RsiCdBakePairedInto` 不把冻结记录路径传出（签名 `:866-869`、写端 `:996-1007` 只写结构体不回传），③ 调用方拿不到两个输入。需加 `outFreezePath: var str`（构造器 `RsiCdFreezePath` `:651-656` 已确定）；该函数调用点全仓仅 `main.cheng:251,302` 两处，改签名可控。**未验证**：`cdFileSha` 是否可跨模块调用，本席未试。

## 1. 缺口① forest 四判据落点

现势复核：`grep forest_parsed|forest_appended|guard_hits src/rsi` **零命中**；计数只在冻结件 `.rebuild/s1b_step3/check_acceptance.py:18,33-66`（`EXPECT_SOURCES = 234`）与 `gate_run.sh:52-54`（`grep -c`）里。RSI 只采 forest 相 RSS（`:563-571`、`:578`、`:735`）。

1. **计数函数**：紧邻 `cdCountPhaseRowsInto`（`:100-108`）新增，按**精确 tag** 计数。**不得**复用现 RSS 判定的 `strings.HasPrefix(tagName, "forest")`（`:563`）——它会把 `forest_parse_end`（`compiler_csg.cheng:33815`）算进去。原语用 `cdLineTagInto`（`:488-496`）逐行取 tag 后 `== "forest_parsed"` / `== "forest_appended"` / `== "ta_stream"`；`guard_hits` 数每行含 `resource_guard`（token 同 `gate_run.sh:52`；发射点 `src/core/tooling/backend_driver_dispatch_min.cheng:3416`）。
2. **数据源**：同轮子进程 stderr `cd_<tag>.gerr.txt`（`:256` `let gErr = ...`）。guard `--stderr` 即子进程 stderr（`tools/beat_c_process_group_guard_runtime.py:6073` `os.dup2(stderr_write, 2)`）。`csg_mem` 行在 `CHENG_CSG_MEM_TRACE=1` 下无条件写 stderr（`compiler_csg.cheng:1682-1686`，**不依赖 P-a 的 stderr 开关**），故 forest tag 计数可见；P-a 只影响 `csg_stage`（缺口②）。
3. **成功出口追加**（`:960-1013`）四条：`parsed == cidCount` ∧ `appended == cidCount` ∧ `guardHits == 0` ∧（`taStream` 出现时 `== appended`）。期望计数取 `cidCount`（`RsiCdRoundCidInto` `:587-614` 读 `source_snapshot_count`，即合同 §1.1「真实 plan 闭包」计数），**不硬编码 234**：合同 §1.2 明示 234 随树漂移，§1.5/§10-9 把 234 常量归冻结 checker 独有，RSI 复刻即第二判据（融合计划红线）。
4. **fail-closed**：`gErr` 缺失/空、token 非数字、计数≠`cidCount`、`guardHits`≠0、`ta_stream` 不等 ⇒ `echo cd_tier3_forest_reject reason=…` + `return`（`outOk=0`）；读不到**绝不算 0/通过**。
5. **验证**：真跑需档 3 开（`types.cheng:131-132` 现为 `corpusIdx == 0 || corpusIdx == 1`，档 3 恒 false）+ kernel 清墙 + 槽位；单轮 `[实测]` 208–278 s（合同 §9:233），档 3 = 5 轮（`:882-884`）≈18–25 min/腿。无槽位可先在 `src/tests/rsi_contract.cheng:437-479` 的 trace/declared 夹具路径加合成 stderr 计数断言（0 槽位）。
6. **影响面**：全在 `if tier3:`（`:965`）内；档 0/1 两处 bake（`main.cheng:251,302`）逐字节不变，**不改 c1c2 主链判词**；外层 `check_acceptance.py` 仍是唯一 234 判据，RSI 侧只是运行期自证。

## 2. 缺口② 50MB 逐相贴线接线

现势复核：阈值与判定只在 `tools/phase_line_check.py`——`THRESHOLD_BYTES = 50000000`（`:78`）、`evaluate`（`:515-525`）`'FAIL' if delta > THRESHOLD_BYTES`；RSI/cdomain/gate 运行期零调用。

1. **账本形态已就绪**：`RsiCdTier3PhaseLedgerInto`（`:683-749`）落 `:731` `gate=` + `:732-736` `phase=… rss_bytes=/arena_bytes=`，与 `phase_line_check.py:51-56`/ `:443-512` 的 declared 解析逐字对应（工具 `declared` class 即「RSI C2 逐相报告的接口形态」）。
2. **落点**：成功出口检查点 `:972-980`（`ledOk == 1` 之后）外呼：`hostos.ExecFileCapture("/usr/bin/env", ["python3", Fmt"{root}/tools/phase_line_check.py", Fmt"{ledPath}"], [], "", true, 120)`（`import std/os_host_process` 已在 `:30`；同模块有 `/bin/bash`、`/usr/bin/shasum` 外呼先例 `:111-112,297-316`），取 `os.ExecCmdResultExitCode`，stdout 查 `verdict=FAIL` 与 `PHASE_LINE_VERDICT=`。
3. **判据（单点）**：`rc==0`（全 PASS）或 `rc==3`（`UNPINNED`：仅 `phase=typed_facts_ir` 未钉——`tools/memory_model_limits.sh:18` 明示「待钉区⑤」）且 stdout 无 `verdict=FAIL`；否则 rc∈{1,2,4,5}、空输出、无总判行 ⇒ `cd_tier3_checkpoint_reject reason=phase_line_verdict_fail` + `outOk=0`。**禁止**把 50MB 阈值 / `evaluate` 抄进 Cheng（融合计划 §四.5、合同 §5:`177` 禁第二套内存判据）。
4. **P-a 是硬前置**：无 `CHENG_COMPILER_CSG_STDERR=1` 时账本缺 3 相，工具判 `INPUT_ERROR`（rc=2）⇒ 拒，属正确拒。
5. **成本**：工具本身零槽位（纯 Python 读账+锚，`<0.1 s`、不编译、不入进程树）；但账本来自档 3 真烤，故验证仍要槽位。**未验证**：该工具从未在真 cdomain/gate 轮被接线执行（与依据回执同判）。
6. **影响面**：只加在 `tier3` 成功出口；`RsiCdC2Verdict`（`:205-220`）签名/优先级未动，门禁 `rsi_gate.cheng:149` 调用点行为不变，**c1c2 主链判词不变**。

## 3. 缺口③ `RsiCdFreezePairVerdictInto` 生产接线

现势复核：定义 `compiler_domain.cheng:803-858`；调用点仅 `src/tests/rsi_contract.cheng:400,412,418,432`，`src/apps/rsi/main.cheng` 零命中（本席复跑 grep 确认）。

1. **A/B 流程落点**：`main.cheng` 参数解析 `:38-62` 增 `--compiler-base:`（对照腿载具）；`cdomain` 分支 `:203-396` 在**同 corpus 同 jobs 档**下跑两次 `RsiCdBakePairedInto`（同款 `:251`/`:302`），tagBase 分 `"legA"`/`"legB"`，其余相同（P5 硬要求见其定义注释 `:796-802`）。
2. **取路径 + 判词**：P-b 加 `outFreezePath` 后，取两腿 `RsiCdFreezePath`（`:651-656`），在候选 bake 之后（约 `:305-307`）调 `cd.RsiCdFreezePairVerdictInto(pathA, pathB, verdict, ok)`；`ok!=1 || verdict!="pass"` ⇒ echo 取证 + `return 1`。
3. **门禁落点**：`src/tools/rsi_gate.cheng:557-594` 的 `rsi_compiler_ab`：档 3 开时要求 cdomain 输出含 `cd_tier3_pair ok=1`（callee `:858` 发）；档 0/1 保持现判据（`cdHasGenesis && cdHasVerdict`）不变，按 `types.RsiCompilerCorpusOpen(corpus)` 分支。注：冻结记录只在 `tier3` 成功出口写（`:965-1007`），故 ③ 天然只对档 3 生效。
4. **输入字段**：冻结记录 `corpus=`/`jobs_tier=`/`corpus_count=`/`corpus_cid=`（写端 `:774-781`）；判词优先级 `missing_record` → `corpus_leg_mismatch` → `count_mismatch` → `pass`（`:803-858` 现成，不改）。
5. **fail-closed**：缺任一腿记录、同语料同 jobs 不成立、闭包计数不等 ⇒ 拒；`cid` 差异只记 `cid_equal` 不作拒（`:853-856`，合同 §1.4 P5）。
6. **验证**：夹具已覆盖（`rsi_contract.cheng:383-436`，含 `RSI_TIER3_LEG_A/B` 真腿接口 `:422-436`）；真跑 = S2 开档（`types.cheng:132`）+ 两载具 + 两腿各 5 轮 ≈36–50 min + 槽位。
7. **影响面**：`tier3` 独占路径；档 0/1 不接受第二载具参数，行为不变，**c1c2 主链判词不变**。

## 4. 成本 / 影响面 / 未验证

- 实现面（合同 §9 D2/D3/D6 口径 `[估计]`）：① 属 S4 追加项、② 在 D2 内、③ 属 D3；合计约 3–5 h 编码 + P-a/P-b 两处小改。
- 验证唯一口径 = 档 3 真门 trial：需 ①`types.cheng:132` 开档（合同 §6.2 S1 成立前禁止）②kernel 清墙 ③槽位静窗（现势被 `m2line_bake_t81` pid 79027 占用、src 漂移 46 非静窗）④单轮 208–278 s ×5 ×腿数。本轮**一律未执行**。
- c1c2 主链判词（`RsiCdMeasurementVerdict:184-198` + `RsiCdC2Verdict:205-220` 的硬门/回归帽/rc/逐相存在性/基线拒写）三处改动**零触碰**；新判据全以 `if tier3:` 隔离。
- 未验证：P-a/P-b 真实后果（未编译未运行）；`/usr/bin/env python3` 在 RSI 进程环境的可用性；`cdFileSha` 跨模块可调用性；`forest_parse_end` 共前缀陷阱是否已被现实现影响（现实现只取 RSS 不计数，故无）。

_本件只读回执，未编译、未运行、未取锁、未改任何既有文件。_
