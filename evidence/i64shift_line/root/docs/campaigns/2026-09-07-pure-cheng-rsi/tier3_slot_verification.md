未编译、未运行，任何通过判词均未取得。

# 语料档 3（B1）待槽位验证清单 v1.0（2026-09-13）

- 交付面：`src/rsi/types.cheng`、`src/rsi/proposal.cheng`、`src/rsi/compiler_domain.cheng`（A5 +217/−25 之上追加）、`src/tests/rsi_contract.cheng`
- patch 1（四文件 HEAD 基 = 活树快照，**仅供审阅，不能直接 apply 到活树**）：`receipts/tier3.patch`
  （原始件 `.rebuild/rsi_tier3/tier3.patch`，两份逐字节相同）
  sha256 = `fc16e63e20ad5ee6ba8f16444a91d0468ee84a1bc5f4bc372d242e774f6c0cd4`
- patch 2（单文件活树快照 = **当前唯一可复现态**）：`receipts/tier3_compiler_domain.live.patch`
  （`git diff -- src/rsi/compiler_domain.cheng` 原样落盘；与 patch 1 的该文件段逐字节相同）
  sha256 = `cca14cf45f59a412c169f5d64839a0edf8e1822c94695c330d8a791fd91775f4`
- 执行器：本目录 `verify_tier3_slot.sh`（`static` 已实跑 PASS，输出见 `receipts/tier3_static_verdict.txt`；`slot` 未跑）
- 合同：`corpus_tier3_contract.md`；判据链 `docs/cheng-plan.md` §6.2 / §6.2.1；门值单点 `tools/memory_model_limits.sh`

## 1. 静态门（本轮实跑，零编译零链接零烤机）

| # | 命令 | 判据 | 本轮实测 |
|---|---|---|---|
| S1 | `bash verify_tier3_slot.sh static` | 双份 patch 逐字节相同 ∧ sha256 = fc16e63e… | PASS |
| S2 | 同上（内部 `patch_preflight.py`） | `preflight PASS`（注解位移 0 / wedged 0 / 括号平衡 0） | PASS |
| S3 | 同上 | `git apply --check --cached` rc=0 ∧ `git apply --check -R` rc=0 | PASS |
| S4 | 同上 | 四文件 numstat = 835/33、5/3、24/5、164/0 | PASS |
| S5 | 同上 | patch 只触四个授权文件（不碰内核在飞件） | PASS |
| S6 | 同上 | `RsiCdC2Verdict` 声明/判词未删改、未新增硬门字面量、开放门未改（档 3 仍闭） | PASS |
| S7 | 同上 | 档 3 契约锚在位（Max=3 / Tier3 / dispatch_min 载体 / CSG trace env / declared 相表 / 配对 API / RSI_TIER3_LEG_A） | PASS |
| S8 | 同上（内部 `a3_probe`、`a3_probe_neg`） | A3 `tools/phase_line_check.py` 接收 declared 形态：5 已钉相 `verdict=PASS`、未钉相 `UNPINNED`、总判 `UNPINNED`(exit 3)；缺已钉相 ⇒ `INPUT_ERROR`(exit 2) | PASS |
| S10 | 同上（`tools/tier3_patch_audit.py` + 段比对） | 活树快照 sha256 钉值 ∧ 两份相同 ∧ 与 patch 1 该段逐字节相同 ∧ `A5_ADDED_MISSING_FROM_LIVE=0` ∧ `MY_DELETIONS_THAT_ARE_A5_ADDED_LINES=0` | PASS |
| S10 | 同上（`tools/tier3_patch_audit.py` + 段比对） | 活树快照 sha256 钉值 ∧ 两份相同 ∧ 与 patch 1 该段逐字节相同 ∧ `A5_ADDED_MISSING_FROM_LIVE=0` ∧ `MY_DELETIONS_THAT_ARE_A5_ADDED_LINES=0` | PASS |
| S9 | 同上（内部 `a5_invariance`） | 由 HEAD + `receipts/c2_caliber.patch` 重建 A5 态：`RsiCdMeasurementVerdict`/`RsiCdC2Verdict`/`RsiCdReasonIsDiagnostic` 逐字节相同；A5→现树 delta add=588 del=8，8 行删除全在档 3 面 | PASS |

## 2. 槽位门（未执行；硬前置 = 静窗 + 编译槽位，禁抢槽）

| # | 命令 | 判据 | 状态 |
|---|---|---|---|
| P0 | 静窗（脚本内置）：`COMPILE_SLOT.lock` 缺位 ∧ 无在飞 `system-link-exec` ∧ `git status --porcelain -- src/` 两次取样内容相等 | 任一不成立 ⇒ trial 作废（diagnostic，exit 3） | 未执行（树忙：`.rebuild/COMPILE_SLOT.lock/owner.txt` = `pid=96980 purpose=c2line_round2`） |
| V0 | `TIER3_DRIVER=<driver> bash verify_tier3_slot.sh slot` 第一步：同载具 `system-link-exec` 编 `src/tools/rsi_gate.cheng`、`src/apps/rsi/main.cheng`、`src/tests/rsi_contract.cheng`（禁缓存四件套 env） | 三者 rc=0；同时证明 `RsiCdBakePairedInto` 10 参签名与 `RsiCdC2Verdict` 判据签名未被本 patch 破坏 | 未执行 |
| V1 | 同脚本 V1：编 `src/tests/ordinary_zero_exit_fixture.cheng` 并运行 | `run_rc=0`（金丝雀；不过则后续一切判读作废） | 未执行 |
| V2 | 同脚本 V2：运行 V0 产出的 `rsi_contract` 二进制 | rc=0（档 3 夹具断言：索引 0..3、`Open(3)=false`、越界 4 拒、CID 抽取与 P3 自洽、A/B 配对三态、逐相账 5 相 + unpinned、缺相拒） | 未执行 |
| V3 | 同脚本 V3：`<rsi> cdomain --root:<root> --compiler:<driver> --corpus:3` | rc=2 且 stdout 含 `corpus tier 3 BLOCKED (only tier 0 open)`（证 `Open(3)=false` 真拦） | 未执行 |
| V4 | 清墙后：`python3 tools/phase_line_check.py <该轮 ledger>` | `PHASE_LINE_VERDICT=PASS`（未钉相在场时为 `UNPINNED`），绝不 `FAIL`/`DIAGNOSTIC` | 未执行（S1 未成立，档 3 门未开） |
| V5 | 真 A/B 两腿产出冻结记录后：`RSI_TIER3_LEG_A=<a.freeze.txt> RSI_TIER3_LEG_B=<b.freeze.txt> <rsi_contract.bin>` | rc=0（`cd_tier3_pair ok=1`，count 相等）；count 不等即断言失败 | 未执行 |
| V6 | kernel 清墙轮：`check_acceptance.py` 四判据 + 逐相贴线 + 本档收尾检查点 | `rc=0` ∧ `forest_parsed_lines=234` ∧ `forest_appended_lines=234` ∧ `guard_hits=0` ∧ 树峰 ≤ 805,306,368 B ∧ 各相贴线；缺任一读数 REJECT | 未执行（合同 §0：现势四判据未成立） |

## 3. 未验证 / 未钉（逐条，不得当 0）

1. **编译面全未验证**：四个交付文件从未编译（本 patch 连语法/类型/所有权编译都没过）；该风险全部由 V0 承担。
2. **逐相锚 ↔ csg 打点的实测对应未验证**（合同 §3.2 candidate 映射、§10-5）：静态侧只证 A3 declared 形态被接收；真实 trace 是否含 `csg_stage=enter`/`after_binding_source_texts`/`after_profiles` 与 `csg_mem tag=ta_stream arena=` 未钉（随载具版本）。
3. **Rsi 腿报告的 CID 字段发射未验证**：`source_snapshot_root_cid`/`source_snapshot_count`/`compile_input_source_file_count` 只在 kernel 回执（`kd_b102.report.txt:31,32,78`）实测在位；Cheng 载具缺根 CID（合同 §10-3）⇒ 若档 3 换纯载具，CID 检查点将 fail-closed 拒收。
4. **P4/P5 判词未在真实两腿跑过**：轮内 CID 全等与 A/B 配对只经合成夹具断言（V2）；P5 的逐源归因仍未钉（载具不发射逐源清单，合同 §10-1）。
5. **`CHENG_CSG_MEM_TRACE=1` 的档 3 读数影响未测**：只对 `corpusIdx==3` 追加（档 0/1/2 环境逐字节不变属补丁面结构性事实，未以实测回归佐证）；该 env 对档 3 的 C2 读数/时长影响未测。
6. **events 身份行未接线**：`event=cdomain_tier3_identity` 的哈希链追加点在 `src/apps/rsi/main.cheng`（交付面外，未改）；本 patch 只提供 payload 生成器与腿级冻结记录，链上落库（合同 §1.4 P6）未接线。
7. **收尾检查点从未在真门内触发**：三项（CID 全等 ∧ `failCount<=1` ∧ 逐相账齐全）未在真默认门跑过（门闭 + 无静窗）。
8. **档位分档口径待逐条确认**：合同 §2.0-1（档 3 = 尝试 ≤5 / 容 1 败 / 成功 ≥3）与 A8 裁定「保留 12/3/9」按**档位**实现——档 3 走 5/1/3，档 0/1/2 走 12/9/3；两处单点在 `RsiCdBakePairedInto` 的 `maxAttempts`/`maxFail`。若用户裁定档 3 也走 12/9，改这两处即可。

## 4. 双写与保管口径（2026-09-13 事实记录；父席通报核实）

- `src/rsi/compiler_domain.cheng` 在本轮曾被两条 lane 同时写（A5/A5d = C2 口径；B1 = 档 3）。A5 自 A5d 起停止写该文件，**B1 为现时唯一写者**。
- 实测量（`tools/tier3_patch_audit.py`，原始输出见 `receipts/tier3_static_verdict.txt`）：
  `a5_added=247 a5_removed=25 my_added=835 my_removed=33` ⇒ 活树 = A5/A5d（247/25 原始行）+ B1（588/8 原始行）；
  `A5_ADDED_MISSING_FROM_LIVE=0`（A5 一行没丢）、`MY_DELETIONS_THAT_ARE_A5_ADDED_LINES=0`（B1 一行 A5 都没删）。
- A5d 判据链在活树在位：`process_tree_enforced_peak_bytes=` 提取（`:327`）、`outResidentPeak/outFootprintPeak`（`:233/237`）、`peak_resident=/peak_footprint=` 回执（`:354/999/1007`）、`RsiCdC2Verdict`（`:207` 起，逐字节等同 A5 态）。
- 因此 **patch 1（HEAD 基）不得直接 apply 到活树**（活树已含其内容），只能作审阅与 `-R` 回退面；**patch 2（活树快照）是当前唯一可复现态**。两份都进 `.rebuild/rsi_tier3/` 与 `receipts/`，sha256 见文首。

## 5. 合同勘误（发现但未改，交付面只许动四文件；请父席/用户裁定）

1. **§6.2 S4 行号过期**：合同写"现有成功出口两处（`compiler_domain.cheng:215-220`、`:221-226`）"——按 A5 已落版本，`:215-220` 是 `RsiCdReasonIsDiagnostic` + `RsiCdBakeOnceInto` 头，`:221-226` 在其函数体内；真正的两个成功出口是 `RsiCdBakePairedInto` 循环内 `goodCount == 3` 分支与循环尾回执（现树 `:924-989`、`:1000-1006` 附近）。语义要求（补三项检查点）已按现树落位。
2. **§2.0-1 的"须在 L5 修正或经用户裁定"**：A8 已裁定保留 12/3/9（`docs/cheng-rsi-fusion-plan.md:123`），故档 3 的 5/1/3 只能作**档位级**口径，不能改全局；本实现已按档位隔离，合同该行建议补一句"档 3 单独走 5/1/3，其余档位 12/9/3"。
