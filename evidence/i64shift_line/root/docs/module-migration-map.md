# RWAD 经济模块迁接对照表

> Phase C 验收基准:原仓(RWAD-blockchain)模块的**可观察语义**在 LSMR 内核复现,每行绑定内核侧 smoke 证据。
>
> **状态(2026-08-29 定案):迁接完成,本仓自包含。** 经济模块的最终归属仓 = cheng-lang;RWAD-blockchain 仅作历史语义来源归档,不再是任何运行时或文档层面的必要依赖。

| 原仓模块 | 内核落点 | 语义对应 | 状态 | 验收 |
|---|---|---|---|---|
| rwad_token(mint/transfer/nullifier)| `src/apps/rwad/rwad_serial_state_machine.cheng` + `rwad_bft_state_machine.cheng`(迁接前已在)| interval-note 模型替代账户表;serial/nullifier accumulator 进 appHash | 已落地(迁接前)| `chain_node_snapshot_roundtrip_smoke` 等(见 §6 基线)|
| rwad_settlement(escrow/batch/challenge/slash)| `src/apps/rwad/rwad_settlement.cheng` | applyEscrowLock→SsmEscrowLock;applyBatchChallenge→SsmBatchChallenge(无效证明 no-op false);applyEscrowSlashWithSplit→SsmEscrowSlashWithSplit(reward=bp200→challenger,burn=bp300→burnBucket,余入 safetyFund);新增 SsmEscrowRelease 分账腿 | **已落地** | `settlement_migration_smoke` rc=0:2000 锁定/1000 罚没→20+30+950 三路分流逐值对齐原仓;供应守恒 balances1020+escrow1000+pools980=3000 |
| rwad_bridge(重放防护/确认数)| 契约核心:`src/chain/rwad_bridge_contract.cheng`;BridgeIndex/BridgeHead 待迁 | Merkle-Sum 批次根+apply 校验+指纹互锁已就绪;链侧 index/head 结构下批 | 核心**已落地**,index 待迁 | `bridge_contract_smoke` rc=0 |
| rwad_oracle(pair price/ts、惩罚/奖励)| `src/apps/rwad/rwad_oracle_risk.cheng` | maybeRewardOracle→EcoMaybeReward(窗口去重、空池静默跳过);applyOraclePenalty→EcoApplyPenalty(charge=min(penalty,bal)入 safetyFund);calcAggregatePrice→EcoTrimmedMean(≥3 去极值均值;原 Ratio 浮点改 int64 定点,序语义不变);updateAggregate→EcoUpdateAggregate(过期窗口重置) | **已落地** | `econ_gov_migration_smoke` rc=0 |
| rwad_risk(paused/limit 开关)| 同上 | isPaused→EcoIsPaused(global 优先);getLimit;applyRiskPause/Limit(互保留字段,空 scope 拒);isBlacklisted/blacklist | **已落地** | 同上(global 暂停支配/limit 跨更新保留/黑名单往返)|
| rwad_governance(参数治理)| EcoGovSetBp(bp 白名单+≤10000 上界;签名者角色授权在交易层接线)| 原仓无独立模块;参数写入函数落地 | **部分**(权限接线待 D)| 同上(bp 越界/未知键拒绝)|

## 商业资金流模块(E 阶段,2026-08)

| 模块 | 内核落点 | 语义 | 验收 |
|---|---|---|---|
| 创作者资金流 | `src/apps/rwad/rwad_creator_flow.cheng` | fund→usage batch(Merkle-Sum)→challenge/slash(质押10%)→resubmit→settle 按 bp 分账;lockedRemaining 全程跟踪防超发 | `creator_flow_smoke` rc=0,守恒 1200 全链闭合 |
| AI Agent 付费 | `src/apps/rwad/rwad_agent_payflow.cheng` | 报价 TTL→锁定→回执匹配计费→余款冲正 | `agent_payflow_smoke` rc=0(子代理交付)|
| DePIN 结算 | `src/apps/rwad/rwad_depin_settle.cheng` | 计量→Merkle-Sum→payer 锁定→挑战窗→逐 provider 分账(定点 1e6) | `depin_settle_smoke` rc=0(子代理交付)|
| 储备纪律 | `src/apps/rwad/rwad_reserve.cheng` | 无抵押增发禁令、credit cap+TTL 冻结、snapshot 单调绑定 | `reserve_discipline_smoke` rc=0(我写+子代理独立审计)|
| 轻节点服务面 | `src/chain/light_client.cheng` | lite 绑定摘要+无状态确认(DoD1) | `light_client_smoke` rc=0(子代理交付)|
| 查询 RPC 面 | `src/apps/rwad/rwad_query_service.cheng`+`rwad_query_exec.cheng` | 36B 请求 wire/9B 响应,balance/escrow 查询 | `rwad_query_service_smoke` rc=0(子代理交付)|

## 身份映射约定

- 原仓 str 账户/ID → LSMR `FixedBytes32` cid(32 字节身份是内核唯一键,禁字符串键)。
- 原仓 tables.Table → 平行数组+线性查(内核风格;规模化后接 BaguaPrefixTree)。
- 数值语义(bp 分流、守恒恒等式)必须与原仓逐值一致——迁接 smoke 直接抄原仓断言数值。
