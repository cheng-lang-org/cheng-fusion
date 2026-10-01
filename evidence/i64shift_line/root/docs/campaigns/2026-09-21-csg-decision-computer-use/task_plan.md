# CSG 统一决策执行内核任务表

状态：`apply 中`（2026-09-21 用户 /goal 授权实现；第一批 01–03 已落地，逐任务状态见下表）。

唯一总合同：[OpenSpec 提案](../../../openspec/proposals/csg-semantic-decision-computer-use.md)。

## 统一实施主线

01–05 冻结基线并统一类型、身份和权限；06–09 打通唯一调度器与真实操作；10–12 接入本地语义能力；13–14 完成对照和融合验收；15–16 扩展外部桌面与游戏。

所有任务在下表维护，不再按 Computer Use 与语义判断分设实施表。全部尚未开工，编号表示实施顺序，依赖列表示必须满足的前置条件。

## 实施拆分

以下完整路径均相对仓根；新增目录须先通过 01 的复用审查。表中既有文件简写的定位规则：`computer_use_*.cheng` 和 `host_abi.cheng` 位于 `src/apps/libp2p_browser/`；`web_scene_*.cheng` 位于 `src/core/runtime/`；`cheng_os/` 前缀补 `src/`。同组新建文件的省略路径沿用前一完整目录。各阶段顺序是依赖关系，不是未经测量的工期承诺。

| 任务 | files | action | verify | done | 前置依赖 | 状态 |
|---|---|---|---|---|---|---|
| 01 基线 | 本目录 `findings.md`、拟建 `baseline.md`、`evidence_manifest.json` | 冻结本任务源文件内容哈希、工具链、可达入口与已有测试；记录共享树差异，盘点旧快照/事务模块 | 真实编译金丝雀与现有 Computer Use/分类测试；入口到实际效果逐跳核对；失败记录原始 rc | 得到可复现基线，每项区分存在/可达/运行通过 | — | **完成**（绿/红分开，墙 A/B 定谳移交） |
| 02 合同与资源 | 拟建本目录 `contract.md`、`memory_ledger.md`、`evaluation_contract.md` | 冻结统一图的观察/确定性/学习/动作/回执节点、任务域、唯一调度及提交权威、错误与资源合同；引用唯一内存卡 | 枚举同名、过期、未知、取消等反例；事实与概率类型不可互换；按实际列宽及任务规模外推，待钉项不当 0 | 所有字段有 authority/owner/lifetime；后续确定性与学习切片共用该合同 | 01 | **完成**（contract/memory_ledger/evaluation_contract 冻结件） |
| 03 失败语义 | `src/inference/planner_task.cheng`、全部直接调用方及对应测试 | 模型模式改 Result/显式状态，取消不执行；迁移移动桥/测试，移除生产错误后关键词回退；保留规则能力须独立显式模式 | 未配置/坏权重/词表错误/加载失败/推理错误/取消/超时逐项拒绝；取消无后续 emit 副作用；正常模型真实执行 | 调用者能区别模型答案、规则模式与失败，不发生成功伪装 | 02 | **源码落地**（补丁 441632d1 预检 PASS，kind_smoke 绿；运行级验证被既有墙 B/C/D 阻塞移交） |
| 04 统一图与判断合同 | `src/core/ir/csg_web_facts.cheng`；拟建 `src/core/runtime/csg_decision_contract.cheng`、`src/inference/decision_validate.cheng`；`computer_use_csg_export.cheng`、`computer_use_command.cheng` | 在同一 Arena/SoA 图合同定义观察、Choice/Noul/Score、动作及回执；共享 int32 身份、证据和世代；完整候选、显式 no-match；事实与概率分型，禁名称寻址 | 同名、候选交换、销毁重建、跨会话/世代、错误参数、伪造引用拒绝；NaN/越界/错误归一、错问题/模型/候选及恶意文本不能变成事实或权限 | 操作与语义判断直接消费唯一类型合同，无平行协议；结果与对象、状态、模型和候选精确绑定 | 03 **首切片落地**（csg_decision_contract+decision_validate+smoke 绿；csg_web_facts 接线属后续串行段） |
| 05 权威准入 | `web_scene_computer_use.cheng`、`web_scene_computer_use_apply.cheng`、`computer_use_session.cheng`、`cheng_os/passport/computer_use.cheng` | effect/权限从注册合同读取；确认绑定动作与参数；接既有单一 admission/commit authority，不复制 CID 算法 | 修改 effectClass、复用确认、授权撤销、校验后状态变化、重复执行；相关 store 并发/回执测试 | 没有模型/调用者自授权通道；失败无副作用 | 04 **首切片落地**（csg_action_authority 注册表=effect/确认唯一权威源，自授权通道关闭；patch_preflight PASS+三门绿；host FFI 凭证化属 08） |
| 06 统一事件调度 | 拟建 `src/core/runtime/csg_task_runtime.cheng`；迁移 `computer_use_planner.cheng`、host 调用方 | 调度所有节点的显式依赖，单世代 DAG 拓扑推进、跨世代由事件推进；确定性先求值，循环依赖 hard-fail；删除命令文本解析生产链 | 独立问题与串行参考一致；状态改变使正确闭包失效；结果复用绑定模型/问题/候选/状态；取消释放；检查唯一生产入口 | 一张图与一个调度器实际可达；模型后端不持有执行循环 | 05 **核心落地**（csg_task_runtime 调度器+smoke a-h 绿；computer_use_planner 迁移/命令文本链删除待 05 后串行） |
| 07 目标与规划 | 拟建 `src/core/runtime/csg_goal.cheng`、`csg_action_model.cheng`、`csg_exact_planner.cheng`；复用既有 CSG 查询 | 有界谓词、完整读写集和动作转移；BFS/Dijkstra 精确求解；预算终态与不可达分开 | 小域独立穷举最优解对拍；循环、非负权重、不可达、未知状态、状态哈希碰撞、预算耗尽 | 明确任务域内计划合法且可验证，无启发式兜底 | 06 **算法核心落地**（goal/action_model/exact_planner+对拍 smoke a-h 全绿；调度器接线属 06 后） |
| 08 事件执行 | 复用 06 的 `src/core/runtime/csg_task_runtime.cheng`；`web_scene_computer_use_apply.cheng`、`computer_use_session.cheng`；审计 `host_abi.cheng` | 在唯一调度器接入动作/回执节点；执行前重验、单副作用在途、取消及 UnknownOutcome；公开 Cheng 接口不得复制旧裸指针 ABI | 故意乱序/重复/迟到事件，销毁重建，提交前后崩溃，重启核实，不确定结果禁止重发；idle 无忙轮询 | 真实状态改变与回执一致；所有分支有终态和释放点，无第二套调度循环 | 07 | **首切片落地**（05 权威准入接入 CompleteExecute 注入链：派发前三道闸=单副作用在途/同键重发拒绝/凭证消费+世代+撤销重验；Unknown 核实记录+Resolve 回执事件；host FFI 凭证入口+布尔面收紧 -7；wiring smoke a-i 绿；提交前后崩溃/重启核实属后续串行段） |
| 09 原生产品闭环 | 选定一个已有 CSG 原生应用入口；拟建 `src/tests/csg_computer_use_e2e.cheng`、`src/tools/csg_computer_use_gate.cheng` | 接真实页面控件与业务状态；形式化目标到执行路径完整可达；自有测试应用不使用生产 Mock | 输入/切换/导航多步任务、冲突/确认/取消；独立测试 oracle 读取真实状态；全链 trace | 首个用户可见、多步确定性 Computer Use 版本；不是单模块 smoke | 08 | 未开始 |
| 10 数据与模型选型 | 拟建本目录 `data_manifest.md`、`model_selection.md`；盘点 `src/inference/model_executor.cheng` 与现有训练模块 | 先冻结评测再选有明确许可的权重和数据；核算加载/推理/训练内存；复用真实推理与训练能力，不凭模块名认为已经支持 | 数据来源/去重/划分审计；真实候选模型小批执行；训练梯度/优化器路径实证 | 权重与数据可追溯、资源合格；不合格配置不进入训练 | 02；完整实施在 09 后 **盘点切片落地**（data_manifest+model_selection；真实小批执行待墙 B 清除） |
| 11 本地决策后端 | 拟建 `src/inference/decision_local.cheng`、`decision_heads.cheng`；按审计结果最小修改推理/训练模块 | 常驻权重生命周期；动态候选语义编码；三类决策头；多问题共享编码；先基线后训练改进 | 真实权重；候选置换等变性、数量变化、中文/领域迁移、无匹配；独立数值 oracle；冷启/常驻成本 | 输出合同完整，语义质量有数据，不只保证类别合法 | 09、10 **数学核心首切片落地**（decision_heads 定点头三头+批量结构+oracle 对拍绿；执行器接线/真权重/训练待墙 B 清+工件就绪） |
| 12 校准 | 拟建 `src/inference/decision_calibration.cheng`、本目录模型/校准报告 | 校准集拟合有版本工件，冻结阈值；不在测试集调参；区分服务失败与不确定性 | Brier/NLL、可靠性分桶与各切片；校准工件错模型/错候选策略拒绝；域外覆盖-错误曲线 | 概率解释有实证，不能把集中度当正确率 | 11 | 未开始 |
| 13 Jev 对照 | 拟建 `src/inference/decision_jev.cheng`；复用已有准入 HTTP/TLS 栈 | 开工时查实时 API，读取调用者配置凭据；映射协议、真实调用、版本/延迟/token/错误计量 | 真实成功请求、缺凭据、超时、响应不合合同；无凭据时报告未测 | 真 Jev 可插拔对照可用，不作为 CSG 内核依赖 | 04；对照安排在 12 后 **首切片落地**（协议映射+响应门+计量+凭据状态机，真实调用=未测；exe emit 撞墙 E line-map 缺陷在案） |
| 14 融合验收与对照 | 拟建 `src/tools/csg_decision_benchmark.cheng`、独立评测工具、本目录 `acceptance.md` 与冻结证据包 | 本地判断→动作→新观察→再判断的真实融合任务；四组质量/延迟/成本/内存对比；公开失败，绑定源/工具/数据/模型哈希；Review 与精简 | 唯一图/调度/提交权威生产可达；本地融合任务不依赖 Jev；统计门、故障门、逐相内存门及必要编译链门 | 仅对通过任务域声明覆盖/超过；未通过写差距，之后才 archive | 09、12、13（对照声明） | 未开始 |
| 15 外部桌面 | 本目录后续独立提案；平台可访问性/视觉观测/执行 provider | 先冻结外部应用、权限和 observation 合同；现有 CSG 内核只接合法状态适配器 | 真实应用状态变化、窗口切换、权限撤销、遮挡、坐标变化；无内部特权的公平比较 | 对所测应用给出覆盖范围；不宣称任意桌面 | 14 的本地功能门；另定范围 | 未开始 |
| 16 游戏 | 本目录后续独立提案；游戏状态/动作 provider | 冻结游戏版本、可观察状态、动作频率与操作限制；复用任务内核，单列连续控制能力 | 同视野同限制的多局结果与统计；包括反例和失败 | 微操能力与完整对局胜率分别给证据；不从桌面结果外推 | 14 的本地功能门；另定范围 | 未开始 |

## 开工顺序与依赖

默认按 01 → 14 串行实施。10 的数据许可调查可在 02 后提前进行；13 只提供评测对照，不属于生产调用链。没有 Jev 凭据或预算时，13 标记未测；14 可以完成本地融合功能验收，但对照结论与整项归档保持未完成。

15、16 是同一内核的后续扩展，须另定范围，不是首版前置；游戏不必依赖桌面适配器。生产实现默认串行，未授权子代理或并行修改共享源码。

## 第一批实际改动的边界

2026-09-21 专利布局复核：[内部重叠对照](../../patents/csg_portfolio_overlap_review_2026-09-21.md)确认新稿与符号落地提交版、人机等价及反诈等未提交稿有重叠。新稿定位为补充研究，暂不推荐独立提交；下述研究映射继续作为技术验收要求，不代表新增专利或已获保护，也不改变产品实施状态。

专利研究补充：[交底初稿](../../patents/csg_decision_commit_binding_invention_disclosure.md)与[现有技术对照、绕开分析及实验映射](../../patents/csg_decision_commit_binding_invention_validation.md)。研究映射至原任务 02/04/05/06/08/14，不另设开发主线，不改变已落地状态。候选核心是输入依赖、候选集合完整性与提交校验的同源生成和连续绑定；依赖级复用尚未实现，须另行更新冻结合同，不能替代当前整快照失效方案。研究文档完成不计入产品功能或专利授权完成。

02 冻结合一架构，04 一次实现操作与判断的统一合同，06 建立唯一调度器；不得拆回两套任务状态或协议。

第一批仅 01–03。先列出 `PlannerTaskClassifyFromText*` 的全部调用者和返回合同，完成错误状态设计及迁移清单，再冻结补丁并预检；同时建立可复验的最小基线。不在这批修改编译器后端、增加视觉识别、启动训练或修改产品 UI。

若基线无法编译，登记准确错误与源/驱动哈希并交给对应语言/后端路径修复；禁止用规则输出、裸指针、换 API 或放宽资源门“打通”。

## 每项交付统一清单

- [ ] 读当前目标文件与调用方，核对共享树变化。
- [ ] files/action/verify/done 与实际补丁一致；新增项登记内存相、模型项、增减量与依据。
- [ ] 冻结补丁，`python3 .rebuild/s1b_step3/r9/patch_preflight.py <patch>` PASS。
- [ ] 新驱动先过两行源与 ordinary 金丝雀，再跑本阶段有意义的正反门。
- [ ] 托管值跨函数寿命、覆盖、自赋值、空值与 ORC 平衡符合所改路径。
- [ ] 真实集成回执、逐相内存、准确退出码齐备；跳过和失败单列。
- [ ] Review 查 Bug，再做第一性原理精简；同一语义只有一个 authority/执行入口。
- [ ] 更新本目录 progress/findings；源码冻结后才记通过和归档，不覆盖根目录其他任务台账。

## 计划阶段完成清单

- [x] 回顾项目约束和相关 lessons。
- [x] 核对当前源码，纠正旧报告的模板数量及桥实现状态。
- [x] 总体流程、合同、依赖与分批任务落盘。
- [x] 文档链接、任务一致性与风险自检。
- [x] 用户确认实施范围。（2026-09-21 /goal 实现指令）
- [x] apply（第一批 01–03）。
- [ ] 实测与 archive。（01/02 完成；03 源码落地，运行级验证待墙 B/C/D 清除后复验）
