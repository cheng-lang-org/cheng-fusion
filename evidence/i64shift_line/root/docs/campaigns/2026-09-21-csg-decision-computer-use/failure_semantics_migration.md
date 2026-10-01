# 任务 03 失败语义：错误状态设计与迁移清单

日期：2026-09-21。依据：任务表 03 + [contract.md](contract.md) §3 错误与取消合同。
基线事实：[baseline.md](baseline.md)——本批编译验证被两堵既有墙遮蔽（详见 §5）。

## 1. 调用者清单（PlannerTaskClassifyFromText* 全部直接调用者）

| 调用者 | 旧调用 | 新调用 |
|---|---|---|
| `src/apps/unimaker/mobile/unimaker_planner_task_bridge_core.cheng`（生产桥） | `PlannerTaskClassifyFromText` | 模型模式 `PlannerTaskClassifyFromTextWithBudget`（Result）；新增独立显式规则导出 `cheng_unimaker_planner_classify_task_kind_rules` |
| `src/tests/planner_task_kind_smoke.cheng` | `PlannerTaskClassifyFromText` | `PlannerTaskClassifyRulesFromText`（本 smoke 就是规则语义金标） |
| `src/tests/planner_task_model_classify_main.cheng` | `PlannerTaskClassifyFromText` ×3 | 规则金标→`PlannerTaskClassifyRulesFromText`；模型模式→`WithBudget` Result；新增 failure-golden 模式 |
| `src/tests/planner_task_slot_extract_main.cheng` | `PlannerTaskClassifyFromText`、`PlannerTaskExtractSlotsFromText` | 隔离性断言改失败诚实性断言（env 未设双入口同 Err）；real-suite 不变（fixture 直传路径无回退） |
| `src/tests/inference_planner_cli_main.cheng:235` | `PlannerTaskClassifyFromText` | `WithBudget` Result；Err 打印 `task_kind_error=` 并 rc=1，不打印伪装 kind |

`PlannerTaskExtractSlotsFromText` frozen delegate 删除（无注解，无回退语义残留）。`PlannerTaskClassifyFromText` 因预检门 v1 约束（带 `@borrows` 声明不可机械删除/重命名，避免误伤事故一形态的检出）保留原名原注解，改为显式失败合同的薄别名：`Result[str]`，与 `WithBudget` 同一权威实现，零回退通道；语义上等价删除。规则入口为公开薄包装 `PlannerTaskClassifyRulesFromText`，判定权威仍是原私有实现（不重命名带注解声明）。

## 2. 返回合同（冻结）

- `PlannerTaskClassifyFromTextWithBudget(text, budget): Result[str]`
  - `Ok(kind)`：仅模型答案，七候选之一。
  - `Err("planner task model: budget deadline passed")`：超时，先于任何加载/forward。
  - `Err("planner task model: budget cancelled")`：取消，先于任何加载/forward，无后续 emit/副作用。
  - `Err(<既有加载/推理错误>)`：env 未设 / 路径缺失 / dtype / tensor scale / 图构建 / 流式加载 / 执行门 / 词表（candidate token not single、out of vocab、logits shape）原样传播。
- `PlannerTaskClassifyRulesFromText(text): str`：显式规则模式，唯一规则入口，只能由调用者预先选择。
- `PlannerTaskExtractSlotsFromTextWithBudget(text, budget): Result[PlannerTaskSlotResult]`
  - classify 失败 → 原样 Err（不再用规则 kind 伪装）。
  - fixture/分词器/unicode 表加载失败 → Err（不再"全 miss 表"掩盖全局失败）。
  - 单槽位生成失败/预算中途耗尽 → 该槽位 miss（既有三态合同的按槽诚实，不变）。
- 桥 ABI：模型导出 `cheng_unimaker_planner_classify_task_kind` rc=0 已 emit；rc=2 判定失败且**未 emit**（取消/失败无 emit 副作用）；规则导出 `cheng_unimaker_planner_classify_task_kind_rules` 语义同旧 rc。

## 3. verify 项与本批可验性

| verify 项 | 可验性 |
|---|---|
| 未配置拒绝 | 需编译通过（被 §5 墙遮蔽，代码就绪） |
| 超时/取消拒绝（先于 forward） | 同上；deadline/cancel 检查在 env 检查之前，错误串可区分 |
| 坏权重/加载失败拒绝 | 同上；错误串原样传播可断言 |
| 词表错误/推理错误拒绝 | 需真权重，走 real-suite 既有模式（本就不在本批自动化范围） |
| 取消无后续 emit 副作用 | 桥 smoke 新增 clear→调用→touched==0 断言（需编译） |
| 正常模型真实执行 | 需真权重，real-suite / classify-main model 模式既有 |
| 调用者能区别模型答案/规则模式/失败 | 三入口分立：WithBudget(Result) / RulesFromText(str) / 桥 rc 语义 |

## 4. 测试迁移内容

- `planner_task_model_classify_main.cheng`：rules-golden 改显式规则入口；model 模式 Result 化；新增 `--mode failure-golden`（env 未设/取消/超时/路径缺失/坏文件逐项断言错误串，`os.WriteFileResult` 造坏配置）。
- `planner_task_kind_smoke.cheng`：改显式规则入口（8 用例不变）。
- `planner_task_slot_extract_main.cheng`：slots-golden 的"隔离性"断言改为失败诚实性断言；printSlotResult/数组字面量按现驱动规则补 owned（`str[] 字面量须 owned`，见 baseline 墙 B）。
- `unimaker_planner_task_bridge_smoke.cheng` + `fixtures/unimaker_planner_task_bridge_provider.c`：8 用例改走规则导出；新增模型导出失败→rc=2 且无 emit 断言（C 桩加 `unimaker_test_emit_clear`/`unimaker_test_emit_touched`）。
- `inference_planner_cli_main.cheng`：`task_kind:` 行 Result 化。

## 5. 基线墙（本批编译验证的遮蔽项，移交记录）

- 墙 A（本批文件内、已迁移修复）：测试源 `str[] 字面量须 owned`（`planner_task_model_classify_main` main 体、`planner_task_slot_extract_main` printSlotResult 体）。
- 墙 B（既有挂账，非本批范围）：`planner_task.cheng` `plannerTaskLoadFixtureFromEnv` FunctionContractAdmission `[body-store-freeze] call_arg carries partial authority`——88cf1710c 已如实挂账的"库函数 Result 风格借用形参×所有权检查器结构性冲突"族，属 inference 线对齐/编译器 lane 主体；本批禁改编译器后端，移交。
- 编译验证口径：补丁应用后重编译，若根文件体错误消除且仅剩墙 B 同位同族判词，记"无新增拒绝、新函数 admission 状态待墙 B 清除后复验"，不记运行通过。
