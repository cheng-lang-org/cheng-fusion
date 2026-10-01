# RSI 任务表

状态：`apply`（首版程序 RSI 种子已实现并过门禁；2026-09-07 起，2026-09-08 批次四续）。

唯一合同及 files/action/verify/done 表见 [提案](../../../openspec/proposals/pure-cheng-rsi.md)（§8 实施现状）；编译器域 C1/C2 测量合同另见 [compiler_domain_c1c2_contract.md](compiler_domain_c1c2_contract.md)。

- [x] 回顾 lessons、Cheng 技能与正式规范。
- [x] 查阅原始 RSI 资料，区分自举、循环训练与递归改进。
- [x] 只读审计仓内训练、工件、推理和编译守卫基础。
- [x] 写出接口、递归关系、评价与恢复合同，登记全局流程。
- [x] 确认递归对象、首版范围（用户 2026-09-07 指令：程序 RSI 首版 + 编译器域通道；编译器域五维方向定谳 C1-C5）。
- [x] 核心状态和预算合同（src/rsi/types.cheng、state.cheng）。
- [x] 工件存储、谱系依赖固定、崩溃终态与新试验重试（src/rsi/store.cheng；进程内表+持久哈希链双层）。
- [x] 纯编译、隔离执行和资源守卫接线（src/rsi/compiler.cheng、execution.cheng；argv 直传+超时硬杀，RSS 硬限留待 beat_c 正式接线）。
- [x] 真实候选生成与结构化变更（src/rsi/generator.cheng、proposal.cheng；限定语法空间结构化搜索器，如实声明非 LLM）。
- [x] 确定性独立评价、一次前瞻元评价与准入，拒绝 A 提高但 M 退化（evaluator.cheng、promotion.cheng；平分拒收已实测）。
- [x] 两轮改进器真实递归消费、同预算对照（engine.cheng + rsi_gate meta 轮：M0→M1 后继 297<1073 accepted）。
- [x] 当前源码全门（rsi_gate 7/7 PASS，载具 stage3）、Review（lessons 六墙条目）、归档（提案 §8）。
- [x] 白盒可解释模型改进器（src/rsi/model.cheng；观测表+乐观界规则；图重放重建；快照事实；M1 内嵌快照源码即模型；gate 8/8 复验 PASS 含 model:t4/t12 快照链）。
- [x] CSG 可控层（2026-09-07 用户指令「用CSG实现可控RSI」）：src/rsi/csg_layer.cheng + engine/store/CLI/gate 接线；gate 8/8 PASS（新增 csg 事实篡改必拒腿；verify 含 DAG 根+版本链+降分合同独立重放对拍）。
- [x] 编译器域 C1/C2 试验线（批次四）：合同/试验器/白名单/语义锚落库；语料门档 0=physics2d_determinism_smoke 开放、档 1/2 BLOCKED；C1 A/B 载具级 BLOCKED@kernel 覆盖墙（判词移交，详见 findings 21-23/29）。
- [ ] kernel 战役清墙后：重冻结档 1/2 语料 + 解锁 C1 A/B 载具 + 补 gate 编译器域两腿。

真实初始生成程序：限定语法空间的结构化模板搜索器（排序策略×增量档），非预写答案/轮数查表/伪造推理；语言模型接入留待用户指定权重后另接适配器。

没有新建分支/worktree。未修改编译器、模型或既有训练业务代码；全部为新增文件（src/rsi/ 13 文件 + src/apps/rsi/main.cheng + src/tests/rsi_contract.cheng + src/tools/rsi_gate.cheng）。
