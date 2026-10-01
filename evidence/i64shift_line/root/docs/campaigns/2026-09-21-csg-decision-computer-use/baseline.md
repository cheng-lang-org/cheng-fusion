# 任务 01 基线（2026-09-21 冻结）

审计时 HEAD：`5bdb7364432bfa1f69ce832320ef4c24d7b67a93`；本批次开始时共享树含他线改动（见 `baseline/source_hashes.txt` 末尾 git status 快照，本批未触碰）。
驱动：`artifacts/bootstrap/cheng.stage3`（sha256 见 manifest）。逐项判据：**存在 / 可达 / 运行通过** 三档分开。

## A. 编译金丝雀

| 项 | 编译 | 运行 | 结论 |
|---|---|---|---|
| `ac_two_line_canary`（两行源） | rc=0 | rc=0 | 判活通过 |
| `web_scene_computer_use_queue_smoke` | rc=0 | rc=0 | 现有 Computer Use 准入 smoke 运行通过（coverage 口径见 findings：检查准入函数，未验完整队列） |
| `cheng_os_passport_computer_use_smoke` | rc=0 | rc=0 | 确认凭证 smoke 运行通过 |

## B. planner_task 闭包（任务 03 目标域）——两堵既有墙，基线即红

| 测试 | rc | 墙 |
|---|---|---|
| `planner_task_kind_smoke` | compile rc=2 | 墙 B（下述） |
| `planner_task_model_classify_main --mode rules-golden` | compile rc=2 | 墙 A（自身 main 体） |
| `planner_task_slot_extract_main --mode slots-golden` | compile rc=2 | 墙 A（自身 printSlotResult 体） |
| `planner_task_slot_extract_main --mode sanitize-golden` | compile rc=2 | 墙 A（同文件） |
| `tools/unimaker_planner_task_bridge_smoke.sh` | script rc=1 | 墙 B（其回归步编译 kind_smoke） |

- **墙 A（本批文件内，任务 03 迁移已修复）**：现驱动规则 `str[] 字面量须 owned`——测试源把 field/数组读直接作 `Join([...])` 元素被拒（`borrowed element requires an explicit owned value`）。与 [cheng 语言坑清单](../../../../.zcode/cli/memories/projects/cheng-lang-f2e0cf9432c7a019/memory/cheng-language-pitfalls.md) 记载一致。
- **墙 B（既有挂账，非本批范围）**：`ptask.plannerTaskLoadFixtureFromEnv` FunctionContractAdmission `[body-store-freeze] call_arg row=51 carries partial authority`（判词逐字存 `baseline/*.compile.log`）。属 88cf1710c 已如实挂账的"库函数 Result 风格携带借用形参 × 所有权检查器结构性冲突"族，为 inference 线对齐/编译器 lane 主体；本批禁改编译器后端，**移交**。旁证：更新的 C 链直驱 `compiler_main.direct`（9/2）走另一 import 闭包（DiLoCo 解析墙），非本测试路径；同日 prestage/c36 lane 正在施工同族 typed_expr 域。

## C. 入口→效果逐跳核对（静态，编译证据受墙限制）

`UniMaker 桥 ABI (exportc)` → `ptask.PlannerTaskClassifyFromText` → env 权重加载 → dense forward 受限 argmax → taskKind emit：逐跳代码链路实读存在（见 findings.md 引用行号）；**运行级核对被墙 B 阻断**，不记"可达已运行"。规则闭环与槽位抽取同理。

## D. 结论

- 可复现基线成立：绿（金丝雀 + 2 个 Computer Use smoke）/红（planner 闭包，墙 A+B，原始 rc 与判词全留证）分开，全部绑定源/驱动哈希（见 `evidence_manifest.json`）。
- 墙 A 属本批文件，已随任务 03 迁移修复；墙 B 移交编译器/inference 对齐 lane，本批不做任何"打通"。
- 冻结产物：`baseline/`（哈希、各测试 stdout/compile.log/rc）、`evidence_manifest.json`、`run_baseline.sh`（可重跑）。
