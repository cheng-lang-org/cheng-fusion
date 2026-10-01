# RWAD × UniMaker 功能与商业闭环 · 开发提示词

> 用法:本文件是可直接投给 coding agent 的任务书。执行前通读「铁律」与「当前基线」,禁止跳过。
> 所有路径均为绝对事实,来自 2026-08 代码审计;发现本文与代码冲突时,以代码为准并回报修订本文。
>
> **完成态注记(2026-08-29)**:Phase C 经济模块迁接已完成——RWAD-blockchain 的经济语义全部复现于本仓 `src/apps/rwad/`,跨仓依赖废止,本文中「向用户取得 RWAD-blockchain 仓操作授权」等跨仓步骤不再需要;涉及该仓的条目仅作历史记录。

## 一、角色与使命

你是 RWAD 区块链与 UniMaker 生态的集成工程师。你的使命是把已经各自存在的三块资产——**链内核(cheng-lang)**、**经济模块(RWAD-blockchain)**、**产品端(UniMaker)**——接成一个既能在技术上自证正确、又能在商业上自我造血的闭环:

- **功能闭环**:一笔价值事件从 UniMaker 端发起,经签名/CBOR 编码/广播,进入 LSMR 事件格,DAG 全序排序,委员会出最终性证书,经济模块结算分账,轻节点凭证书确认——全程无人工干预、每步可验证。
- **商业闭环**:创作者质押发布→引用挖矿分账、AI Agent 按调用付费、DePIN 算力计量结算、储备锚定的铸造赎回纪律——每条资金流都有链上凭证、可审计披露,且激励来源全部出自费用池/罚没池而非无抵押增发。

## 二、权威事实(动手前必读,按序)

1. `~/cheng-lang/docs/rwad-chain-architecture.md` — 架构唯一权威:四件套(LSMR 账本格/nullifier accumulator/DAG 排序/最终性证书)、三仓边界、干支字段弃用清单、ref10 约定债。
2. `~/cheng-lang/docs/cheng-decentralized-compute-storage.md` — 链上/链下边界、`cheng_rwad_bridge export/apply` 契约、`cheng-rwad-settlement/v2`、计费分润框架。
3. `~/RWAD-blockchain/docs/rwad_blockchain.md` — 经济与协议规范:TxEnvelope/TxSignDoc、Escrow-Batch-Challenge 状态机、Merkle-Sum challenge proof、NAV/credit/托管做市参数表、bridge SPV/quorum_sig 规格。注意其 §4 共识章已被架构定案取代(以第 1 条为准)。
4. `~/RWAD-blockchain/docs/AI_agents_payment.md`、`rwad_etf_minting.md`、`RWAD稳定币第二锚.md` — 商业场景规格。
5. `~/cheng-lang/task_plan.md`(DePIN 章节)— 已完成的 distributed evidence → RWAD submit/finalize 门禁链路。

## 三、铁律(违反任意一条立即停手回报)

1. **禁 Mock/兜底/启发式补丁**:生产路径必须真实打通;测试 fixture 仅限 tests 目录且不得进入主路径。
2. **禁假绿**:任何"完成"必须绑定证据——smoke rc=0 + 输入源文件 + 编译驱动路径;模拟报告不算生产完成。Gate 判据见 §八。
3. **Let it crash**:校验失败 hard-fail,严禁静默降级或吞错误码。
4. **共享文件纪律**:改 `primary_object_plan.cheng` 等高频共享文件前查 mtime;绝不 `git checkout -- <file>` 撤销;多会话并行时用 `git apply --cached` 只 stage 自己的 hunk。
5. **临时产物绑定任务生命周期**:`tools/cheng_scratch_scope.sh` 创建、退出即删。
6. **不动未授权仓**:RWAD-blockchain 仓有大量未提交 WIP,触碰前必须先获用户对该仓的明确授权。
7. **单测先行**:每个新模块随附 smoke,官方测试向量优先于自制断言(参考 `src/tests/vrf_tai_vectors_smoke.cheng` 的做法)。
8. **smoke 运行方式**(已验证可用):
   ```
   cd ~/cheng-lang
   artifacts/bootstrap/cheng.stage3 system-link-exec --root:$PWD \
     --in:<smoke路径> --target:arm64-apple-darwin --out:/tmp/<tag>.bin
   /tmp/<tag>.bin && echo ok   # 期望 rc=0
   ```

## 四、当前基线(2026-08,勿重复建设)

**已落地(带验收)**:
- LSMR 账本格:`src/chain/lsmr.cheng`(849 行)+ `lsmr_types.cheng`;双父事件、fork/divergence 检测(`consensus.cheng`)。
- 双花防护:`src/apps/rwad/rwad_accumulator.cheng` + serial/nullifier 状态机,根进 appHash。
- VRF:`src/std/crypto/vrf.cheng`,ECVRF-EDWARDS25519-SHA512-TAI,draft 附录 B.3 三组官方向量逐字节通过(`vrf_tai_vectors_smoke`)。
- DAG 排序核心:`src/chain/dag_ordering.cheng`,两阶段全序(因果深度分层+层内 epoch/tick/spaceSlot/cid tie-break),环检测、缺父容忍(`dag_ordering_smoke`)。
- DAG 广播基建:`dag_mempool/plumtree/pubsub/erasure_swarm/anti_entropy`(content/pin plane 在用)。
- RWAD BFT 状态机:`src/apps/rwad/rwad_bft_state_machine.cheng`(mint/transfer/nullifier/appHash)+ DePIN submit/finalize 门禁链路。
- 干支时钟已撤案:相关字段为弃用元数据,禁赋新语义(清单见架构文档 §3)。`ConsensusLess` 因非反对称已从排序职责退役。

**已知债务(排期内必须处理)**:
- ref10 base-point `-B` 约定:libp2p ed25519 自洽但与外部 RFC8032 不互通(同 seed 公钥差符号位)。涉及外部桥/EVM 互操作前必须走协议迁移立项。
- `cheng_rwad_bridge`/`verify_rwad_interface_contract` 工具三仓均未落地(纸面契约)。
- RWAD-blockchain 仓大量工作未提交(git 最后 commit 2026-02-07),迁接前须先落账。
- Narwhal+Bullshark 旧骨架(该仓 326 行模拟)已归档,勿在其上继续开发。

## 五、开发计划(六阶段,严格顺序,每阶段独立验收)

### Phase A — 链内核收尾:投票、证书、checkpoint(全部在 cheng-lang)

- **A1 委员会投票引擎**:输入 = dag_mempool 事件图视图;流程 = VRF(`vrf.cheng`)抽签选委员会(stake 加权,参数对齐 `rwad_blockchain.md` §4.5:max_validators=101、min_stake=10000)→ 对 `DagOrderCommitSequence` 产出的提交序列投票 → 2f+1 聚合。落点建议:`src/chain/committee_vote.cheng`。
- **A2 最终性证书**:ed25519 签名列表容器(证书头+签名数组+commitment);单证书 ≤ 数 KB;轻节点验签入口 `verify_certificate(cert) -> bool`,验签仅依赖 `vrf.cheng/ref10/sha512`。聚合签名(BLS/Schnorr 阈值)留接口后置。
- **A3 checkpoint 同步**:定期签名快照(state_hash 沿用 `state_snapshot.cheng` 的 canonical CBOR 口径),轻节点分钟级同步;median-of-last-K 时间戳规则落地(K 进治理参数)。
- verify:每件随附 smoke(投票确定性、证书篡改拒绝、checkpoint round-trip);A1+A2 合成端到端 smoke:本地 N=4 委员会节点内存互联,提交 100 笔并发事件,断言四节点线性序列一致且证书可被无 DAG 视图的第三方验证。
- done:架构文档 §5 第 2/3 条标记落地,证据绑定本条 smoke。

### Phase B — 跨仓契约工具(先授权,后动工)

- 向用户取得 RWAD-blockchain 仓操作授权后:先协助该仓按里程碑分批落账现有 WIP(禁止大爆炸 commit)。
- 实现 `cheng_rwad_bridge`(落点 cheng-fusion 或独立 tools 包,与用户确认):
  - `export --epoch --root --batch-id --out`:从 cheng_storage ledger 生成批次 JSON(字段对齐 compute-storage 文档 §974-981);
  - `apply --result --batch --require-status`:回执校验+状态一致性;
  - `verify_rwad_interface_contract`:双侧 schema 哈希互锁,任一侧漂移即 fail。
- verify:构造 golden 批次对拍;漂移注入(hash drift/status drift)必须 fail。
- done:compute-storage 文档中的示例命令原样可跑通。

### Phase C — 经济模块迁接(RWAD-blockchain → LSMR 内核)

- 迁移对象(该仓 `src/modules/`,16 个):rwad_token/settlement/bridge/oracle/risk/governance 为第一梯队;credit/custody/rewards/fees 第二梯队;kyc/name/content/vpn/inference_settlement 按业务启用节奏第三梯队。
- 迁接方式:模块的交易处理函数改为消费 `consensus.ChainEvent` 流(kind 扩展由系统交易表驱动),状态写入经 `DagOrderCommitSequence` 定序后的确定性顺序;appHash 组合加入各模块 state root。
- 迁移每模块的 done 定义:原仓对应 smoke 语义在 LSMR 内核上复现(对照表落 `docs/module-migration-map.md`),双跑差异为零。
- verify:token 供应守恒(supply==balances+stakes+escrow+pools)、escrow-batch-challenge 全状态机、oracle 惩罚、bridge 重放防护逐个过 smoke。

### Phase D — UniMaker 客户端接入

- **D1 钱包与交易**:UniMaker 端内密钥→TxEnvelope(CBOR,sig_scheme 默认 ed25519,PQC 位预留 mldsa)→libp2p 请求响应提交。⚠️ 若需与外部链互通先解 ref10 `-B` 债;纯内部流转可先用库内约定但必须在 UI 标注。
- **D2 轻节点**:订阅 `/unimaker/block/v1/lite` 压缩摘要 + checkpoint;余额/escrow 证明按需拉取本地校验(§A3 产物)。
- **D3 RPC 面**:对齐 `rpc_handler.cheng`/`sdk.cheng`;UniMaker 服务端经 gateway 查询 balance/escrow/batch/receipt_index。
- **D4 激励面板**:website「RWAD 激励」区块(质押发布/引用即挖矿文案已存在)接真实数据源:gate_report、evidence_status、batch 分账事件——数据取不到就显示不可用,**禁止占位数**。
- verify:D1-D3 各端到端 smoke(真进程对真进程);D4 断言页面字段与产物 JSON 逐字段一致。

### Phase E — 商业场景闭环(每条独立可验收的资金流)

- **E1 创作者流**:质押发布(content_plane 注册,CID 入 manifest)→ 引用/互动产生 usage receipt → ledger.jsonl 聚合 → batcher(Merkle-Sum root)→ TxBatchSubmit → 挑战窗(Challenge proof 校验)→ finalize → escrow release 分账 → 创作者余额可见。全链一次真实运行留档。
- **E2 AI Agent 付费流**:Agent 按 `AI_agents_payment.md` 规格以 RWAD 计价调用服务;402 式报价-付款-回执三段;失败退款走冲正系统交易。
- **E3 DePIN 算力流**:复用已完成的 evidence→submit/finalize 门禁,把推理计量 receipt 接入 Phase B bridge 的 export/apply,结算入链。
- **E4 储备纪律流**:铸造必须绑 reserve_proof_hash;credit 窗口(cap 5%/TTL 7d)超期冻结;CustodySnapshot 10min 快照+挑战。参数全部按 rwad_blockchain.md §6 可治理表落地,禁自造默认值。
- 商业闭环判定:E1-E4 各产出一条「资金流对账单」:input receipts hash → batch merkle root → txHash → 分账明细 → 余额变化,五段哈希链完整且可在链上重放。

### Phase F — 合规与风控收口

- KYC/risk 模块接线(暂停/限额/黑名单开关在结算路径生效);slashing 参数表治理化;合规报告(gate_d 同构)随版本产出;第二锚方案(`RWAD稳定币第二锚.md`)仅做储备结构准备,不发币承诺。

## 六、功能闭环 DoD(全部满足才算功能闭环)

1. UniMaker 发起的一笔转账/支付,可在无 DAG 全量视图的轻节点上凭最终性证书确认;
2. 四节点本地委员会对 100 笔并发事件产出一致线性序列,重放 appHash 相等;
3. 经济模块(第一梯队六个)在 LSMR 内核上全部 smoke 通过且供应守恒断言成立;
4. `cheng_rwad_bridge` 双向命令真实跑通,契约哈希互锁生效;
5. 以上每条的 smoke 与证据哈希登记进架构文档 §6 验收表。

## 七、商业闭环 DoD(全部满足才算商业闭环)

1. E1-E4 四条资金流各自的五段哈希链对账单完整且链上可重放;
2. 激励来源审计:任一周期 reward_pool 总发放 ≤ fee_pool+罚没流入(无抵押增发为零);
3. 储备披露:最近一个 CustodySnapshot 可被独立挑战方校验 proof_hash;
4. UniMaker 真实产品界面(非测试页)展示的余额/激励数据与链上产物一致;
5. 全部结算走链上 batch,ledger.jsonl 仅作链下原始凭证(对账报表零差异)。

## 八、Gate 与证据格式(每阶段结束产出)

```json
{
  "phase": "A1",
  "smokes": [{"path": "src/tests/x_smoke.cheng", "rc": 0}],
  "source_sha256": "<涉及源文件逐个 sha256>",
  "driver": "artifacts/bootstrap/cheng.stage3",
  "known_debts": ["..."],
  "ready": true
}
```
- `ready=true` 仅当 smoke 全 rc=0 且无未申报 debt;模拟/部分实现一律 ready=false 并注明。
- gate_report 类产物必须填实 sha256 字段(历史教训:空 sha 字段的 ready 即假绿)。

## 九、协作边界

- 每阶段开工前输出 files/action/verify/done 四元组,经用户确认后动工。
- 跨仓(RWAD-blockchain、cheng-fusion、cheng-pebble)操作逐一请求授权;一处授权不延伸下一处。
- 发现规格冲突(文档 vs 文档、文档 vs 代码):停手,给出冲突对照表,等待裁决,不自行取舍。
