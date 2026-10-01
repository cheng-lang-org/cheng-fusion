# 档 1/2 语料解锁就绪度（T1 依赖已满足 / 内核依赖未满足）

日期：2026-09-13 ｜ 线：RSI 融合线 ｜ 与主链的位置：B7 通墙 → 补 sha 对拍 → 档 1/2 语料解锁 → C1/C2 对 234 源冻结测量合同 → RSI 自动筛选内核收敛 的**第三环**

## 结论（先行）

- **档 1 的墙已根修，依赖已满足**：T1 线在**源侧**定谳并修复（src/game/ecs.cheng +14、src/game/physics2d.cheng +10/−5，**零编译器改动**），实测 physics2d_determinism_smoke compile=0 / run=0（九断言含三篡改拒绝全过）、负控 Q2 仍拒（判据未放宽）、金丝雀 0/0×2、两条回归 0/0。
- **【现势更正 2026-09-13 12:2x】档 1 的门已被他线翻开**：活树 `src/rsi/types.cheng:131-132` 现为 `return corpusIdx == 0 || corpusIdx == 1`（注释记『档 1 = 2026-09-13 T1 线根修解锁, commit 601c79e70』）。⇒ 本件初稿写的『档 1 仍是关的』**已过时**，以活树为准。
- **但『门开了』不等于『能跑』——路径当前 100% 不可用，且原因不在语料**：实测 `rsi_cli cdomain --corpus:1` 会走到真实编译路径，然后在 guard 的**命令身份阶段**被拒：`abort_reason=command_identity_unavailable` / `command_identity_error=OSError: [Errno 22] target environment mode/entries mismatch` / `process_tree_enforced_peak_bytes=0`（原始件 `src/rsi_work/cd_g00.greport.txt`）。逐字就是 A5 的 `--target-env` 缺陷（融合计划 §6.12）⇒ **tier 0 也一样跑不起来**。⇒ 档 1 的解锁链现在是『T1 已修 → 门已开 → **卡在 guard 注入方式**』，先落 A5 父环境注入补丁才有意义。
- **档 2 的内核依赖未满足**：GEN2 覆盖墙 `compiler csg: parser-owned global coverage mismatch source=src/core/csg_core/identity.cheng parser=7 metadata=0`（kernel 领地，本线禁自修，判词已移交）。
- **索引空间已就位**：RsiCompilerCorpusMax = 3（types.cheng:82，合同 §6.2 S2 的索引半已落），档 2/3 同入口 RsiCompilerCorpusDispatchMinRel（:117）。

## 1. 档 1 的依赖面：已由 T1 兑现（绑原始件）

| 判据 | 结果 | 原始件 |
|---|---|---|
| 墙根因定谳 | 源侧 use-after-move（非编译器误拒）：Q1 合法形态 compile=0/run=0；Q2 中间插 byval 托管消费后借用 ⇒ compile=2，判词逐字复现 | .rebuild/t1_line/REPORT.md §1-§2 与 .rebuild/t1_line/probes/ |
| 修复面 | 只读查询链标 @borrows（ecs 14 函数）+ physics2d 5 函数标 @borrows + 5 处 add(parts, receipt.<strfield>) 改 Fmt 共享模式（字节等价 ⇒ preimage 不变 ⇒ receiptCid 不变） | src/game/ecs.cheng（@borrows 计数本轮实测 14）、src/game/physics2d.cheng |
| 落树状态 | git status --porcelain 对两文件**空**（无未提交改动）= 修复已在跟踪树内 | 本轮实测 |
| 档 1 smoke | compile=0 / run=0（九断言，含三篡改拒绝） | .rebuild/t1_line/ 日志族 |
| 负控 | Q2 仍 rc=2（拒绝精确跟随消费点，判据未放宽） | .rebuild/t1_line/REPORT.md §2 |
| 已知同类待办（非本次回归） | ecs_world_hash_smoke / ecs_capacity_smoke / physics2d_forces_determinism_smoke 的受控克隆对照 rc=2 | .rebuild/t1_line/baseline_*.log |

## 2. 翻转动作（一行）与**它的硬前置**

翻转本体（src/rsi/types.cheng）：

```
fn RsiCompilerCorpusOpen(corpusIdx: int32): bool =
    return corpusIdx == 0 || corpusIdx == 1        # 档 2/3 仍 false
```

**硬前置（缺一不得翻转；这是"跑过 ≠ 开放"红线的机械形式）**——必须在**同一编译槽位窗口内**先取得：

1. rsi cdomain --root:<R> --compiler:<载具> --corpus:1 --store-dir:<空目录> 真实跑完，compile rc=0；
2. 语义指纹（产物运行 rc:stdout-sha）自洽：best-of-5 五烤指纹全等；
3. 逐相账齐全（未钉相标 unpinned，不得当 0 充数）；
4. 该轮身份四元组（driver_sha/cid/count/source_root）与 CID 冻结记录已落 receipts；
5. 门：进程树峰 ≤ 805,306,368 B **且** rc=0；抬门轮只算 diagnostic，不入判词。

翻转后同轮补：src/tests/rsi_contract.cheng:308-321 的合同冒烟（新增"档 1 开、档 2/3 仍闭、越界（≥4）拒"三条断言）。
**回退**：任一腿 rc ≠ 0 ⇒ 档 1 立即回 closed + events 记 event=cdomain_tier1_blocked reason=<...>。

## 3. 档 2 的依赖面：未满足（内核领地）

- 判词：compiler csg: parser-owned global coverage mismatch source=src/core/csg_core/identity.cheng parser=7 metadata=0（compiler_domain_c1c2_contract.md §BLOCKED 逐字）。
- 归属：kernel 战役（GEN2/覆盖墙），**本线不修、不绕过**（禁降级/兜底）。
- 缺口解除后的动作与档 1 同构（先跑通 §2 五条，再翻转 corpusIdx == 2，再补合同冒烟）。

## 4. 与主链后两环的接口

- **补 sha 对拍（第二环，本轮交付）**：tools/exe_sha_pair.py + design/dual_arm_sha_gate_receipt.md。判据已订正为"对象逐字节 + exe 差异全落在两处非确定摘要"，自测 7/7、真实原始件 GATE_RC=0、__TEXT,__text 翻字节负对照判红。**两臂在发射点的真对拍仍待 B7 通墙**。
- **C1/C2 对 234 源冻结测量合同（第四环）**：合同 = corpus_tier3_contract.md v1.0（§1 CID 冻结、§2 C1、§3 C2 三判据+逐相、§6.2 翻转步骤 S1–S8、§7 落账、§10 未钉项）；实现缺口 = D2/D3/D6（compiler_domain.cheng 收尾检查点 + CID 接线 + gate 腿）。档 3 的翻转硬前置 = 默认门下四判据成立，当前**未成立**（r104_recov：forest_appended_lines=136/234、rss=839,353,592 > 805,306,368）。
- **RSI 自动筛选内核收敛（第五环）**：档 3 一旦开放，"一次内核刀 = 一次 trial"（合同 §7）即为该闭环，无需新机制。

## 5. 红线（本件自缚）

① 不因 T1 通过就宣布档 1 已解锁（可编 ≠ 开放）；② 不同窗口验证就翻转 = 假绿；③ 不抬门、不用未钉项充数；④ 不碰 kernel 在飞件（parser.cheng / compiler_csg.cheng / backend_driver_dispatch_min.cheng / macho_provider_linker.cheng）；⑤ 分叉/提交/推送一律不做。
