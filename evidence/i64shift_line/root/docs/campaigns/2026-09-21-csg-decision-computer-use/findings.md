# 源码发现与待验证事项

审计日期：2026-09-21。只读源码审计，未编译、未调用模型、未操作设备。
审计时 HEAD：`5bdb7364432bfa1f69ce832320ef4c24d7b67a93`；工作树有其他任务改动，HEAD 不是全部在读文件的版本证明。

## 已核对的源码

- `src/inference/planner_task.cheng:84`：真实权重推理后，在七个编号 token 中取 logits argmax，返回类别；不是通用校准决策 API。
- 同文件 `:181`：分类调用路径内加载模型、权重、分词器；需测量加载与推理分相成本，不能先宣称已有常驻推理服务。
- 同文件 `:239`：超时、取消或模型错误会返回关键词规则类别。生产模型模式必须改为显式错误/取消，规则如有合法独立用途只能由调用者预先明确选择，不能失败后替换。
- `src/apps/libp2p_browser/computer_use_planner.cheng:72`：拼接模型 prompt；`:138` 接收文本命令，跳过非命令文本和不允许的动词；尚非类型化决策合同。
- `src/apps/libp2p_browser/computer_use_command.cheng:77`：按控件名称查找。模型接口不能以名称充当跨快照身份。
- `src/apps/libp2p_browser/computer_use_session.cheng`：已有 ctlId、控件类型、禁用状态、Select 选项与数字输入检查；这条动作入口未携带完整快照版本绑定。
- `src/core/runtime/web_scene_computer_use.cheng`：准入接受调用方传入 effectClass 和 confirmed；检查六种动作与 external-publish/payment 两类确认。不能据此宣称权威授权和全部动作效果已闭合。
- `src/core/runtime/web_scene_computer_use_apply.cheng`：有场景状态写入与事件效果执行，需与真实呈现/外部效果回执对齐。
- `src/core/ir/csg_web_facts.cheng:210`：控件、动作、任务步骤和确认事实结构存在；多数字段是字符串，运行期需精确解析到 Arena + SoA 的索引表，不得直接作近似身份键。
- `ts-csg/src/csg-web.ts:273`：当前手写任务模板已包含八项。2026-07-23 报告的六模板/632 控件是旧基线，不能当作本轮数值。
- `src/apps/unimaker/mobile/unimaker_planner_task_bridge_core.cheng`：桥源码已存在；旧“零代码落地”设计报告不能代表现树。现有裸指针 ABI 写法不能复制成新公开接口。
- `src/tests/planner_task_model_classify_main.cheng`：测试检查规则金标或输出属于七类，不足以证明模型语义准确率与失败来源。
- `src/tests/web_scene_computer_use_queue_smoke.cheng`：实际检查准入函数，并未验证完整队列、异步执行或 UI 完成。

## 复用而非重建

已有 `src/core/csg_core/merkle_transaction*.cheng`、`merkle_store_identity.cheng`、`merkle_store_snapshot_reader.cheng`、`src/core/tooling/semantic_snapshot*.cheng`。生产可达性、owner 生命周期、状态绑定及并发行为要在 A 阶段验证；编译器快照不能直接冒充 UI 快照，CSG store 事务不能自动使外部点击具有原子性。

## 外部依据

用户最新架构约束：CSG 原生合并 Computer Use 与 Jev 类决策能力，统一观察/判断/动作/回执的类型、身份、事件调度与执行权威。该项是目标合同，尚非现有能力；本地模型承担语义判断，Jev 服务只保留为对照适配器。结构统一和语义质量分别验收。

- [TypeSafe 官方技能](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md)：代码掌握流程；独立问题并行；有依赖的问题分轮；输出类型正确不保证事实正确。
- [System One](https://docs.typesafe.ai/concepts/system-one)：文本输入与 Choice/Noul/Score。
- [Confidence](https://docs.typesafe.ai/confidence)：Choice/Score confidence 由概率分布得到，不能冒充任务成功率或动作权限。

## 2026-09-21 基线轮新定谳（任务 01–03）

- `str[] 字面量须 owned` 的精确触发面：`Join([...])` 等内联数组实参里的 **field/数组读元素**（`result.taskKind`、`cases[i]`）被拒，裸字面量、常量标识符、`CloneStr`/调用结果元素合法；`let` 绑定的纯字面量数组（如 planner_task `digits`）不触发。
- 墙 B（`plannerTaskLoadFixtureFromEnv` admission 拒绝）是 **root 闭包依赖**的：root 直接物化 `DistributedGenerationBudget`（构造 fn 字段结构体）的驱动（classify_main、桥）触发；只导入 ptask 不物化 budget 的 kind_smoke 同内容全绿。判词与函数内容无关位移（row 随文件变化），复验以判词正文为准。
- `std/os` 具备 `SetEnv/WriteFileResult`，失败金标可进程内构造；`@borrows` exact-live-source 规则：let 局部被借用（如作 `TokenizerEncode` 实参）后再 `CloneStr` 会被拒——多次使用的托管值把 move 放在末次使用位，或全程 clone 链。
- 预检门 v1 约束：带 `@borrows` 声明不可机械重命名/删除（多重集比对报 LOST）；合法形=保名保注解改签名/薄包装。任务 03 据此采用别名+包装两形。

## 工具与范围限制

已读取 Cheng 技能、AGENTS.md、lessons.md 相关条目及唯一内存约束卡。本会话没有 skill_load 工具；已在已知 Codex/Claude 技能目录和仓内 .agents 搜索，未找到 j-space、using-superpowers、planning-with-files、gsd-method-guide。未声称使用这些技能；本计划直接提供其要求的台账、流程图及四字段任务拆分。未新建分支/worktree，未覆盖已有根目录台账。
