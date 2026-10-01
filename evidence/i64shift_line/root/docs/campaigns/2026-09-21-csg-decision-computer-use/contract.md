# CSG 统一决策执行内核合同（任务 02 冻结件）

状态：`frozen-for-04+`。本文件是任务 04+ 实现的唯一起点合同；改动须回写本文件并记 progress。
总合同：[OpenSpec 提案](../../../openspec/proposals/csg-semantic-decision-computer-use.md)。

## 1. 统一任务图节点合同

一张图，六类节点，全部定义在同一个 Arena/SoA 容器内，跨节点只允许 `int32` 索引。

| 节点类 | 载荷（拟议字段） | 产出 | 错误终态 |
|---|---|---|---|
| observe | snapshotRef(int32)、generation(int64)、source(identity receipt) | 类型化快照引用 + 证据索引 | SourceUnavailable / SnapshotInvalid |
| deterministic | predicateRef、actionModelRef、budget | 精确查询结果 / 规划路径 | BudgetExceeded / Unreachable / NeedEvidence |
| learn | headKind(Choice/Noul/Score)、candidateSetRef、evidenceRef、backendRef | 类型化判断结果（概率/分布/等级） | BackendFailure / InvalidOutput / Cancelled / DeadlinePassed |
| action | candidateRef(完整动作元组)、authorizationRef、preconditionRef | 已验证动作请求 | Rejected(过期/未授权/前置不满足) |
| execute | actionRef、commitAuthorityRef | 回执引用或 UnknownOutcome | ExecutionFailed / UnknownOutcome |
| receipt | executionRef、goalPredicateRef | 目标验证结论（成立/不成立/待核实） | VerificationFailed |

铁律：

- 事实值（快照、规划结果、回执）与概率判断（learn 产出）是不同类型，编译期不可互换；高置信判断不得强制转换为权威事实。
- 每个候选是完整动作元组：目标索引、操作、参数槽位、前置条件、效果合同。模型/调用方只能返回当轮候选索引，不能独立拼接"动作＋目标"。
- 本地索引只在绑定快照世代内有效；跨进程/跨世代用既有 canonical identity/receipt。名称、源码行、路径、裸指针一律不得充当身份。
- 单个冻结世代内数据依赖必须无环；跨世代反馈（回执→新观察）由事件推进，不允许学习与规划节点互等。

## 2. 唯一调度器与提交权威

- 唯一调度入口：所有节点由同一事件调度器推进（目标提交、状态提交、模型完成、执行回执、授权变化、取消、截止时间）。学习后端只计算节点结果，不持执行循环、不操作电脑。
- 唯一副作用签发权：确定性与学习结果通过同一动作准入 → 真实执行 → 回执校验链。任务状态所有者、调度入口、副作用签发权不得出现第二实现。
- 确定性子图先于学习节点求值；首版每任务最多一个副作用动作在途，读侧独立判断可并行（显式预算），有副作用的动作串行。
- 截止时间用系统定时事件，不忙轮询、不固定间隔重问。

## 3. 错误与取消合同（任务 03 已按此实现规划器切片）

错误是显式状态，不是回退触发器。统一错误族：

`NotConfigured / BadArtifact / LoadFailed / InferenceFailed / InvalidOutput / Cancelled / DeadlinePassed / BudgetExceeded / Unreachable / NeedEvidence / UnknownOutcome / ExecutionFailed`

（`ExecutionFailed` 为 06 切片实现时发现的 §1 execute 节点错误终态与原错误族的缺口，2026-09-21 回写补齐；execute 失败在补齐前曾临时映射 `InferenceFailed`。）

- 模型模式任何失败（未配置、坏权重、词表、加载、推理）返回显式错误，禁止回落关键词规则；规则能力只存在独立显式模式，由调用者预先选择。
- 取消与超时先于任何模型 forward 检查；取消后不得有后续 emit/副作用。
- 服务失败（BackendFailure）与"不适用/无候选匹配"（显式 no-match 选项）是不同状态；都不混入概率。
- 副作用结果不确定 → UnknownOutcome，只允许通过可验证回执或真实状态核实，禁止盲目重发。

## 4. 权限与确认合同（任务 05 实现落点）

- effectClass 与确认要求从已验证动作定义（注册合同）读取；模型置信度、调用方布尔值不得签发授权。
- 确认凭证绑定：用户授权范围 + 动作/参数 + 合同版本 + 消费状态（一次性）。
- 执行前重验：当前世代、目标生命周期、授权、前置条件；首版整快照严格失效。

## 5. 资源合同

逐相内存模型项与门值见 [memory_ledger.md](memory_ledger.md)；唯一权威是 [确定性内存约束卡](../../campaigns/2026-08-31-kernel-userpath/design/memory_model_constraints.md)（相对本目录 `docs/campaigns/2026-08-31-kernel-userpath/design/memory_model_constraints.md`）。本轮（01–03）产品执行相内存增量为 0；04+ 每项新增按 ledger 登记模型项后方可开工。
