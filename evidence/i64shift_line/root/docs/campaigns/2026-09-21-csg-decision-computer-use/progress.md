# 进度台账

## 2026-09-21：Lane-08 执行层接线首切片

- **Lane-08（落地；补丁预检 PASS（6 文件 ann=0/displaced=0/wedged=0），金丝雀+七门独立复跑 compile rc=0/run rc=0）**：05 权威准入接入 06 预留的 `CsgTaskRuntimeCompleteExecute` 唯一回执注入链。热文件改造（`evidence/task08_execution_wiring.patch`，650 行）：`csg_task_runtime` 新增 execute 提交权威绑定 API + 派发三道闸（单副作用在途→同键重发拒绝→`CsgActionAuthorityAdmit` 凭证消费+世代+撤销重验，任一不过=ExecutionFailed 显式终态无副作用）+ UnknownOutcome 最小核实记录（节点+动作+凭证+世代）+ `ResolveExecuteUnknown` 新回执事件唯一终态化通道 + AuthorizationChanged→同步撤销未消费凭证、StateCommit→同步推进权威世代；execute 失败由临时 `InferenceFailed` 迁回合同 §3 `ExecutionFailed`（补齐 06 回写缺口，`csg_decision_contract` 补常量+门分支）。`csg_action_authority` 补凭证句柄面：LastGrantedRow/LastConsumedRow 同窗口句柄 + `ConsumeConfirmRow` 提名行精确消费 + `AdmitWithCredential`（none 类 Admit 入口复位消费行，防跨调用残留）。`computer_use_session` 新增 `BrowserCuseActionWithCredential` 凭证入口、布尔面收紧（确认类一律 -7 `cuse_e_confirmation_credential_required` 指向凭证入口，apply 体抽出共享）；`host_abi` 新增 `cheng_libp2p_browser_cuse_action_cred`（int32 句柄+既有 (ptr,len) 深拷贝配方，零裸指针 ABI 复制）。
- 新增 `src/tests/csg_execution_wiring_smoke.cheng` verify a–i 全绿：乱序回执拒且无副作用、重复回执/重复派发拒（含 Unknown 未核实态）、迟到回执世代双键失效+凭证按世代过期、凭证化路径状态变化+回执 Ok+确认类布尔面拒、单副作用在途闸显式拒、授权撤销在途外新派发拒、Unknown 核实记录/重发拒/新回执事件终态化、idle 零步无忙轮询。迁移 `libp2p_browser_cuse_smoke` 确认门到收紧后语义（布尔面 -7+凭证入口正例）；四个既有门禁 smoke 未改一行全绿，另复验 command smoke 绿（命令链继承收紧）。
- 内存：execute 绑定串每节点 3×str（会话期存活）+ 核实记录 R×(4+4+str+str+8+1+4)，R≤Unknown 回执数，追加式审计留存至会话释放，跨任务不保留；已登记 csg_task_runtime 头内存模型块。
- 如实挂账：宿主确认签发 FFI（grant 面）与崩溃/重启后核实记录持久化属后续串行段；重复派发拒绝按同任务实例同键严格拒绝（解除需新任务图，确认类另受一次性凭证自然约束）。

## 2026-09-21：Lane-11a 决策头数学核心首切片

- **Lane-11a（落地，协调者独立复跑 compile rc=0/run rc=0，33 组断言绿）**：`decision_heads.cheng`（405 行）+ smoke（643 行）。Choice 受限 argmax（tie 显式化：并列成员集+最小索引确定性规则+空集显式 no-match）、Noul 阈值判定（恰等显式 >= 合同）、Score 等级排列+定点加权（int64 全程，正负双向溢出显式拒绝，2^62 边界恰等精确构造）、多问题共享编码批量切片账（重叠/越界/列长七类反例显式拒绝）；置换等变性/候选数量变化用 O(n²) 逐点支配独立 oracle 双构对拍。
- 明确未做（如实）：执行器接线/真权重/训练（墙 B+工件缺失）、浮点分布校准头（延后 12 切片，概率唯一载体保持 CsgDecisionProbValue 定点口径；指标门形状已按 evaluation_contract §2 预留）。注意：本 lane 与 f64 修复并行，其"绑定不可靠"表述以 d57ccce6e 修复后语义为准（写侧已修，读侧本精确）；决策头零浮点设计不受影响。
- 内存：头输入/输出为每次决策调用瞬时对象，无驻留。

## 2026-09-21：Lane-05 权威准入首切片（重发实例收口）

- **Lane-05（落地；补丁预检独立复跑 PASS，三门独立复跑 compile rc=0/run rc=0）**：新增 `csg_action_authority.cheng`（388 行：六动作×五类 effectClass 注册合同 SoA 30 行 + 确认凭证列=绑定动作行+参数+版本+世代、一次性消费、可撤销、审计留存）——effectClass 与确认要求的唯一权威源。热文件改造（+37/−15，`evidence/task05_admission.patch`）：web_scene_computer_use 准入改从注册表读取确认要求与词表（新增 `computer_use_e_effect_class_not_registered`），apply 删除 `confirmed` 形参改走 `CsgActionAuthorityAdmit` 凭证消费，passport 板级确认事件→凭证签发→一次性消费，session 仅注释。verify a–g 全绿+附加世代失效项：effectClass 未注册拒、凭证复用拒、撤销拒（Review 修掉撤销影子化 bug 并加回归位）、正例状态落盘、未消费拒、旧版本拒、两回归 smoke 未动一行仍绿；另验 libp2p_browser_cuse/command_smoke 双绿。
- 如实挂账：cu 兼容 bool 面无撤销感知（撤销语义只在凭证通路）、host FFI `confirmed int32` 凭证化与 computer_use_command 文本链属 08 执行层切片；参数合同只注册未强制内容校验（session 数字校验已有，避免双权威）。
- 前实例无声中断（任务记录消失、零树足迹）已按续传 SOP 重发并收口；调度器（06）的 `CsgTaskEventAuthorizationChanged` 事件已为撤销感知预留接入点。

## 2026-09-21：Lane-06 统一事件调度器核心首切片

- **Lane-06（落地，协调者独立复跑 compile rc=0/run rc=0）**：`csg_task_runtime.cheng`（1076 行，唯一调度器 CsgTaskRuntime，DOD+SoA 零托管字段）+ smoke（652 行）verify a–h 全绿：独立节点与串行参考逐位对拍、确定性先于依赖学习、循环依赖显式 hard-fail、世代+索引双键失效与四键结果复用、取消作废在途且零新派发、注入时钟截止有限步无忙等、派发预算 BudgetExceeded、det/action/execute/receipt 全链单入口推进（execute Ok/Unknown/Failed 三态真实回执绑定）。
- 对接面就位：`CsgTaskRuntimeCompleteExecute`（08 唯一回执注入点）、`CsgTaskEventAuthorizationChanged`+authVersion（05 授权重验接入，本切片只计数不假装重验）、`CsgTaskRuntimeCompleteLearn`（11/13 后端在途回填缝，门=decision_validate 唯一权威）、`AttachDeterministicPlanner`（07 已接）、七类事件注入面齐备。
- 合同修订（回写 contract.md §3）：错误族补 `ExecutionFailed`（06 发现的 §1 execute 终态与族缺口）。
- 内存：调度器常驻结构（节点表/依赖边/事件队列/结果复用表/在途表/det 展平池）按活跃会话期口径登记，跨任务不保留。
- 迁移部分（computer_use_planner 命令文本生产链删除）待 Lane-05 落地后串行。

## 2026-09-21：已有专利布局复核

- 按用户确认更新申请状态：事实根已公开、符号落地已提交、世界视频契约编码待提交；人机等价及反诈均未提交。
- 读取七份既有交底的主线与权项、符号落地本地提交版和事实根代理来稿的权项及相关说明书、三份通知信息；新增 docs/patents/csg_portfolio_overlap_review_2026-09-21.md。
- Review 修正：新稿突出强调的集合/否定查询依赖和事务复核已见于内部稿；新稿调整为补充研究，暂不推荐独立提交。现实指称唯一与动作策略选择分开，不把模型最高分当唯一性证明。
- 已提交文件及其他交底权项未改动；只更新状态、研究定位和链接，各产品运行相内存增量为0。本轮未取得局方公开全文，不声称完成新颖性或保护范围定论。

## 2026-09-21：专利文档目录归一

- 按用户指定，将本任务交底稿和验证计划迁至 `docs/patents/csg_decision_commit_binding_invention_disclosure.md` 与 `docs/patents/csg_decision_commit_binding_invention_validation.md`；原位置不保留副本，任务表和文档互链同步更新。
- 仅文件归位与链接调整，既有专利和实现状态保持原样，产品各相内存增量为 0。

## 2026-09-21：Lane-13 Jev 对照适配器首切片 + 墙 E 登记

- **Lane-13（落地；功能绿，退出码缺陷在案，不记满绿）**：`decision_jev.cheng`（677 行）+ `decision_jev_smoke.cheng`（563 行）。API 实查（docs.typesafe.ai 全套 + github typesafe-ai/skills，2026-09-21）：端点/认证/三头请求响应/usage 字段落座，4 项待核实标明核实路径；请求映射（Choice/Noul/Score+显式保留 no-match 选项）、响应验证门（复用 decision_validate 口径，8 条 fixture 反例错误串互异）、凭据状态机（NotConfigured 零调用可断言）、Timeout/BackendFailure 故障注入映射到合同错误族、计量记录（版本/延迟/token）、`JevRealCallVerificationStatus()="NotTested"`——真实调用未测（无凭据无付费授权，未发起任何网络请求）。传输栈审计：std/http 明文不承载 Bearer 不接线；纯 Cheng TLS1.3 原语闭包干净但 record 层在 vpn_proxy（app 层）且无出站编排入口→按任务授权取类型化传输接缝，对接列"待墙清后接线"。迭代 13 轮修掉一处真 bug（choice 归一和漏计保留选项概率）。协调者独立复跑：**产物运行 79 断言全绿 ×2（全新目录）**；但 exe 编译退出码=2 确定性复现。
- **墙 E（新登记，移交编译器 lane）**：`Mach-O primary line-map missing`——decision_jev.cheng 触发，exe emit 确定性 rc=2（×3），**同源 --emit:obj rc=0**（admission/编译全净，缺陷精确定位在 line-map 后置步）；对照 csg_decision_contract_smoke exe rc=0 正常。另登记工具行为：`--in` 指向包根外路径判 `cold source snapshot source path leaves package root`（探针须放仓内）。
- 台账：task_plan 13 行更新；13 的 verify 项中"真实成功请求"因无凭据保持未测（提案 §3 明文），"缺凭据/超时/响应不合合同"已绿。

## 2026-09-21：发明点初筛与交底草稿

- 新增 invention_disclosure.md、invention_validation.md：候选技术链、权利要求技术骨架、六类现有技术线索、绕开方式及公平对照实验，映射至既有统一实施表。
- 新发现：动态依赖复用、同源代码生成、可串行化事务及 agent 前置授权均有公开前案；不能单独当原创。重点收窄到模型实际输入/完整候选查询/提交校验的同源关联，授权可能性仍未定。
- Review 查 Bug：仅记录已返回对象会遗漏新增候选；加入集合成员资格和排序依赖。固定输入不保证随机重采样相同；明确保留已生成样本。事件失效通知不能替代提交事务内权威验证。
- 第一性原理精简：保留原生受控状态边界，拒绝任意程序依赖推断；不另建内核或平行任务表。既有并行实施记录和源码保持原样，本轮未复跑其测试。
- 仅文档变更，各产品运行相内存增量为 0；实验、完整专利检索、公开时间核对与正式申请未完成。未对外提交或发布。

## 2026-09-21：正交矩阵并行轮（04/07/10 首切片 + 墙 B/C/D 复检）

- 用户 /goal 授权"拆分成正交任务矩阵子代理并行推进"。三条 lane 并行（文件所有权互斥、只写新文件、lane 不 commit 由协调者统一提交），收割时逐 lane 独立复跑验收（协调者本机重新 compile+run，不信转述）。
- **墙 B/C/D 复检（未清除）**：重跑 `run_patched_gates.sh`，判词逐字同前。定性明确：三墙在 stage3 驱动二进制内（8/31 烤），编译器 lane 近日落库的源码刀（a8d072457 等）须重烤新驱动才生效；仓内无更新烤好的驱动可用。任务 03 运行级复验继续挂"待新烤驱动"，判词已固化，`run_patched_gates.sh` 一键复验。
- **Lane-04 统一图合同首切片（落地，独立复跑 compile rc=0/run rc=0）**：`csg_decision_contract.cheng`（六类节点 SoA、int32 身份+int64 世代双键、Choice/Noul/Score 分型且无概率→事实转换入口、完整动作元组候选、禁名称寻址）+ `decision_validate.cheng`（20 条反例拒绝门：NaN/负/越界/不归一/chosen 越界/等级非排列/no-match 不一致/候选交换/过期世代/销毁重建/跨会话/伪造索引/错槽型/按名寻址）+ smoke 31 断言全绿。环境缺陷登记：stage3 后端 `f64ToBits/bitsToF64` 绑定不可靠、`int64(NaN)`=0、>32 位字面量截断——判定逻辑已全部绕开并以"错误输入必拒+错误串精确匹配"固化为后端回归探针。单世代 DAG 无环与调度时序归 06。
- **Lane-07 规划器算法核心首切片（落地，独立复跑 compile rc=0/run rc=0）**：`csg_goal.cheng`（三值谓词，unknown≠false）+ `csg_action_model.cheng`（读写集准入，缺声明显式拒）+ `csg_exact_planner.cheng`（BFS/Dijkstra、FNV 指纹+原值回比去重、终态六分 GoalReached/Unreachable/BudgetExceeded/NeedEvidence/ModelRejected/InvalidInput、无启发式）+ smoke：verify a–h 全绿——6 个小域暴力 DFS oracle 最优对拍、带环终止、零权+正权（Dijkstra 权重生效且 BFS 对非均匀代价 ModelRejected 拒绝近似）、穷尽才 Unreachable、NeedEvidence、强制碰撞解不污染、预算计数可断言。
- **Lane-10 选型盘点切片（落地）**：`data_manifest.md` + `model_selection.md`。关键定谳：①dense 路径 `model_type` 白名单仅 `qwen2`（hf_model_graph.cheng:1518）；②TensorQ=int32 展开→0.5B bf16 驻留 ≈1.98GB≈2.45×门，bf16 档不容纳；③量化三缺一（embedding 无 int4、无 bf16→int4 转换工具），仅-linear-int4 混合档 ≈720MiB 贴线；④transformer backward/Adam 全仓不存在，唯一可准入训练形态=冻结骨干+小头（≤~13M 参数）；⑤tokenizer 工件缺失可由 tools/qwen_tokenizer_smoke.sh 再生；⑥Qwen2.5-0.5B/-Instruct apache-2.0 已在线核实，CLUE 系数据集无许可声明全部待核实（只准进评测探索集）。全部内存数字标"估算非实测"。
- 内存：04/07 新结构模型项已登记 memory_ledger（静态推算口径，行宽待 06 接线时对象字节回执钉死）。
- 纪律执行：三 lane 零既有文件触碰（git status 逐项核对）；编译闭包全部 std-only 避开墙 B 连坐；未跑任何非必要烤制。
- 下一步：13（Jev 映射）消费 04 合同类型后可开工；04 接线 `csg_web_facts`/`computer_use_csg_export` 与 05 准入属共享热文件，回串行脊柱；墙 B/C/D 清后重跑 patched_gates 复验 03 并解锁 planner 闭包全链。

## 2026-09-21：第一批 01–03 落地（apply 首批）

- **01 基线（完成）**：驱动 `cheng.stage3`（sha256 入 manifest）；金丝雀 + `web_scene_computer_use_queue_smoke` + `cheng_os_passport_computer_use_smoke` 全绿（compile/run rc=0）；planner 闭包基线即红，两堵墙定谳——墙 A（测试源 `str[] 字面量须 owned`，本批文件内）、墙 B（`plannerTaskLoadFixtureFromEnv` FunctionContractAdmission `call_arg carries partial authority`，88cf1710c 挂账族，移交 inference 对齐/编译器 lane）。产物 `baseline.md` + `evidence_manifest.json` + `evidence/baseline/`（原始 rc 与判词逐字）。
- **02 合同与资源（完成）**：`contract.md`（六类节点/唯一调度/唯一提交权威/统一错误族）、`memory_ledger.md`（本批执行相内存增量 0 + 后续批次模型项）、`evaluation_contract.md`（数据/指标/四组公平比较/声明/报告五门）冻结。
- **03 失败语义（源码落地，运行级验证待墙清除）**：补丁 `evidence/task03_failure_semantics.patch`（sha256 441632d1…，`patch_preflight.py` PASS 8/8）。`PlannerTaskClassifyFromTextWithBudget` → `Result[str]`（取消/超时先于一切执行，错误串逐项可区分：cancelled/deadline passed/env not set/path not found/加载链原样传播），失败回落关键词规则的通道移除；`PlannerTaskClassifyRulesFromText` 为显式规则模式唯一公开入口（薄包装，判定权威不变）；`PlannerTaskExtractSlotsFromTextWithBudget` → `Result`（classify/加载失败短路 Err，不再"全 miss 表"伪装）；`PlannerTaskExtractSlotsFromText`（无注解）删除，`PlannerTaskClassifyFromText` 保名保注解改 Result 薄别名（预检门 v1 不允许机械删除带 `@borrows` 声明）。全部调用方迁移：生产桥（模型导出 rc=2 无 emit + 新增显式规则导出）、kind_smoke、classify_main（+failure-golden 模式：超时/取消/env 未设/路径缺失/坏文件逐项拒绝断言）、slot_extract_main（隔离断言改失败诚实性断言）、CLI（task_kind Result 化）。设计+迁移清单：`failure_semantics_migration.md`。
- **补丁后门禁**（`evidence/patched_gates/`）：墙 A 清除——`planner_task_kind_smoke` 编译+运行全绿（8 条规则断言经公开包装入口）；金丝雀保持绿。运行级验证被既有墙阻塞：墙 B（root 闭包依赖：直接物化 `DistributedGenerationBudget` 的 classify_main/桥 vs 未物化的 kind_smoke，同一 planner_task 内容一绿一红，判词与基线逐字同）；墙 C（slot_extract HEAD 自有 `runRealSuite→slotCliLoadFromPaths` 调用实参转移权限拒绝，被墙 A 遮蔽至今首曝）；墙 D（CLI HEAD 自有 `TokenizerDecode` @borrows live-source 拒绝；迁移引入的 CloneStr 拒绝已以"move 末次使用"修复）。C/D 均为该驱动下从未编译过的 HEAD 既有代码，非本批引入，移交。
- 内存：全部产品执行相增量 0（详见 memory_ledger）。
- 未做（如实）：墙 B/C/D 的修复、真权重模型路径运行（词表/推理错误拒绝与正常模型真实执行两项 verify 待 real-suite）、桥 ABI 运行验证、Jev 对照、训练。
- 下一步：墙 B/C/D 清偿后以同补丁重跑 `run_patched_gates.sh` 复验 03 全部 verify 项；随后 04。

## 2026-09-21：合并实施表

- 将旧阶段合为 01–16 单表，合并精确动作合同与判断类型任务；按真实实施次序排列，补齐前置依赖和未开始状态。旧编号仅保留在历史记录中。
- 同步总提案编号；明确本地融合功能与 Jev 对照的完成条件，缺测不冒充整项完成；桌面与游戏分别依赖统一内核，不强行串联适配器。
- Review 与精简：统一合同只定义一次，唯一调度器只建设一次；每项保留 files/action/verify/done。仅文档修改，产品各运行相内存增量为 0，无生产测试结论。

## 2026-09-21：统一内核架构修订

- 按用户“CSG 把 computer use + Jev 合二为一”修订为同一类型化任务图、唯一事件调度和唯一执行权威；本地学习算子实现 Jev 类判断，Jev 服务仅作可替换对照。
- 统一判断类型及调度前移到执行接线前；确定性首切片和后续学习切片共用合同，移除第二套判断协议/调度器的拟议落点。
- 新增结构可达性门和本地跨世代融合任务门；保留事实与概率的类型区别，不把结构融合冒充模型质量提升。
- Review：流程图反馈属于跨事件世代；单世代数据依赖仍为 DAG。Jev 对照支线不阻断本地功能，但缺测不能声明超过 Jev。
- 本轮仅修改计划及 lessons；运行各相内存增量为 0。尚未 apply，无新增功能实测结论。

## 2026-09-21：制定计划

- 已完成：当前 Computer Use、分类器、类型事实和现有快照/事务提案的源码核对。
- 已完成：回顾 lessons.md 与唯一内存约束卡；辨明历史报告、源码存在和当前运行通过的区别。
- 已完成：开发合同、阶段任务、全局流程图、资源与对照验收标准落盘。
- 已完成：本次四份文档的相对链接与代码围栏检查；任务依赖和验收一致性人工 Review。
- Review 修正：C 首交付限定确定性闭环，语义任务纳入 D/E 后的 F，消除阶段依赖倒置；明确外部副作用不由 CSG store 事务保证 exactly-once；动作语义只能来自可检查合同，不能由名称猜测。
- 第一性原理精简：复用已有 CSG 身份/事务权威，首版严格整快照失效、单副作用在途、有界精确搜索；不同时建设视觉、游戏和另一套执行内核。
- 计划产物：1 份 OpenSpec 提案、3 份任务台账。所有实现阶段均未开工；没有功能性能实测结论。
- 未开始：生产代码修改、编译、训练、Jev 调用、基准测试、真机操作与发布。
- 流程：propose → 用户确认范围 → apply → 按证据 archive。用户本轮授权仅为制定计划。

## 2026-09-21：wallek 烤驱动复验——墙 E 清除，墙 B/C/D 仍在

- 发现 `.rebuild/walleknife_line/run/cheng_cold_wallek`（15:13 烤，配套 cheng_cold_base 对照）编译器线在飞构建，非破坏性探测：canary 判活过；**decision_jev_smoke exe compile rc=0 + run rc=0（"decision_jev_smoke ok"）——墙 E（Mach-O primary line-map missing）在该构建上已消除**。
- 用 wallek 复验任务 03 门（`evidence/wallek_gates/` 全留证）：kind_smoke 绿；classify_main rules-golden/failure-golden、slot_extract 两模式、CLI 仍 compile rc=2——**墙 B/C/D 判词逐字同前**（B=plannerTaskLoadFixtureFromEnv carries partial authority；C=runRealSuite→slotCliLoadFromPaths transfer authority；D=TokenizerDecode lacks exact live source）。wallek 只清 line-map，admission 域未动。
- 口径：wallek 为在飞非认证构建，结论记方向性证据；官方清偿以认证驱动落库后重跑 `run_patched_gates.sh` 为准。任务 03 运行级复验继续挂墙 B/C/D。

## 2026-09-21：Lane-f64 位型 ABI 修复（provider 层，修树即生效）

- **根因定谳（探针实证，evidence/f64_bits_*_probe.cheng）**：写侧 `*Int64Ptr(&v64)=bits`（跨类型域 typed-deref store）被后端整体丢弃/错址（任意输入读回槽字节恒全 0，排除数值转换论）；读侧 `return *Int64Ptr(&v64)` 在 binstamp v7 实测位精确——旧报告"0.5→错位型、NaN→0"为写侧症状。
- **修复（+31/−5 单文件，patch_preflight PASS×2）**：`program_support_backend.cheng` 两函数体改 `cheng_bytes_copy` 8 字节搬运（同文件既有原语，字节精确）；补 `cheng_f64_bits_is_nan` @exportc（纯 int64 位逻辑；provider reloc 扫描臂自动并入 roots，注册表无需改）。协调者独立复跑：preflight PASS + f64_bits_abi_smoke/decision_contract_smoke/canary 三门 compile0/run0，smoke 19 断言 ALL PASS。
- **修复后语义**：f64ToBits/bitsToF64=IEEE754 double 位型重解释（memcpy 语义）；f64BitsIsNaN=指数全1且尾数非0。
- **遗留如实登记**：①大指数浮点字面量解析缺陷（新发现，1e300 实参位 malformed，smoke 按 IEEE 位型构造绕行）；②int64(NaN)=0、>32 位整型字面量截断（驱动二进制级，需重烤）；③cheng_f64_bits_is_zero/order 无定义体、cheng_parse_f64_bits 有定义无 @exportc（三者缺导出未修）。11a 决策头等消费方现在可直接使用 f64ToBits/bitsToF64/f64BitsIsNaN。
