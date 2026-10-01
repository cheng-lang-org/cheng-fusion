# RWAD / Unimaker 链正统架构定案

> 状态:已定案(2026-08)。本文件是链内核架构的唯一权威参考。
> 之前 `RWAD-blockchain/docs/v2.md` 中的愿景描述与本文冲突之处,以本文为准。

## 0. 定案结论

1. **架构路线**:LSMR 账本格(DAG)+ 全局 nullifier/serial accumulator + DAG 全序排序 + 最终性证书。Narwhal+Bullshark 模拟骨架(`RWAD-blockchain/src/consensus_*.cheng`,326 行)归档,仅作排序算法参考,不再作为交付物演进。
2. **干支时钟撤案**:干支不承担任何共识、排序或安全职责。`ganzhiIndex/stem/branch/clockGanzhi/stampGanzhi/publishGanzhi` 等字段降级为**弃用的不透明元数据**(见 §3),仅为 wire 兼容保留,新代码禁止赋予其语义。`ConsensusLess` 排序优先级已移除 ganzhiIndex。
3. **正统落点**:链内核、网络、状态机全部以 `~/cheng-lang/src/chain`、`src/apps/rwad`、`src/apps/bft` 为准。

## 1. 三仓边界

| 组件 | 正统仓 | 说明 |
| --- | --- | --- |
| 链内核(账本格/状态机/DAG mempool/网络) | `cheng-lang/src/chain` `src/apps/rwad` `src/apps/bft` | 本文覆盖范围 |
| 经济模块(token/settlement/oracle/bridge/risk/governance) | `cheng-lang/src/apps/rwad` | 迁接已完成:语义自 RWAD-blockchain 复现于本仓,每模块绑定 smoke 证据;本仓自包含,无跨仓运行时依赖 | |
| 持久化(WAL/SSTable/manifest) | `cheng-pebble` | 独立仓,经包管理接入 |

## 2. 四件套架构(全部有实装)

### 2.1 LSMR 账本格(并行层)
- 每账户一条事件链;转账事件双父锚定(`fromParentCid`/`toParentCid`),同时进双方链头。
- fork/divergence 判定**只看 parentCid**(`consensus.cheng: ConsensusApplyMint/ConsensusApplyTransfer`),不依赖任何时钟。
- 代码:`src/chain/lsmr.cheng` `lsmr_types.cheng` `consensus.cheng`;测试 `src/tests/lsmr_*` `consensus_*` `chain_node_*`。

### 2.2 全局双花防护(accumulator 层)
- 账本格天然缺全局双花视角,由 serial/nullifier accumulator 承担。
- 代码:`src/apps/rwad/rwad_accumulator.cheng` `rwad_serial_state_machine.cheng`;RWAD BFT 状态机消费其根进 appHash(`rwad_bft_state_machine.cheng`)。
- **规范**:任何支付类事件除 parentCid 锚定外,必须登记 serial/nullifier;accumulator 根进区块摘要。

### 2.3 DAG 全序排序(共识层,待接线)
- 排序权威 = BFT 加权投票,路线:Bullshark 类 DAG 排序(与 `dag_mempool`/`plumtree`/`pubsub` 现有基建对接)。
- 委员会:VRF + 质押权重抽签;证书阈值 2f+1。
- 确定性排序核心 **已落地**:`src/chain/dag_ordering.cheng` — 两阶段全序(因果深度分层 → 层内 epoch/tick/spaceSlot/CID tie-break),缺失 parent 开放视图容忍,环输入返回错误码。验收:`src/tests/dag_ordering_smoke.cheng`(线性链乱序/并发 tie-break/缺父/插入序无关)rc=0。注意:不直接复用 `ConsensusLess` 做排序键——它混合因果与时钟比较,两条件同命中时不满足反对称性。
- 现状:`dag_mempool` 可用性证明/广播已实装;委员会投票与证书聚合接线为待办工程项(§5)。

### 2.4 最终性证书(轻节点层,待接线)
- 轻节点只验最终性证书 + checkpoint,不重放。证书签名先用 ed25519 签名列表(`src/std/crypto/ed25519/ref10.cheng`),聚合签名(BLS/Schnorr 阈值)后置。

## 3. 干支字段处置清单(弃用元数据)

| 字段 | 位置 | 处置 |
| --- | --- | --- |
| `ChainEvent.ganzhiIndex/stem/branch` | `chain/consensus.cheng` | 保留字节(进 CID/wire),语义弃用;`stem/branch` 仅为派生冗余 |
| `ChainIndex.clockEpochs/clockGanzhi` | `chain/consensus.cheng` | `clockEpochs` 保留(单调 epoch 记录);`clockGanzhi` 弃用 |
| `DagPublishAdvert.stampEpoch/stampGanzhi` | `chain/lsmr_types.cheng` | `stampEpoch` 保留;`stampGanzhi` 弃用 |
| `ContentManifest.publishGanzhi` | `chain/content_plane.cheng` | 弃用,格式校验(`<0` 拒绝)保留 |
| `BftGanzhiIndex(height,txIndex)` | `apps/bft/bft_state_machine.cheng` | 派生函数,弃用,仅为事件 CID 稳定保留 |

规则:这些字段继续随 wire/快照/CID 序列化(删除即破坏协议兼容),但**不得参与任何安全判定、排序或经济计算**;新协议字段一律使用 epoch/tick。

## 4. 时间戳规则

- 单调性:`epoch:int32 + tick:int64`(已实装),干支不做任何时序承诺。
- 区块/快照时间戳:median-of-last-K **已落地** `src/chain/checkpoint.cheng`(`MedianOfLastK`,升序上中位;K 值进治理参数);checkpoint 绑定证书(sha512("rwad.checkpoint"‖commitHash‖stateHash),轻节点重算绑定+验签)已落地,验收 `src/tests/checkpoint_smoke.cheng` rc=0(median 操纵免疫/绑定篡改拒绝/缺票拒绝)。

## 5. 待办工程项(按依赖序)

1. **VRF 模块 — 已落地**:`src/std/crypto/vrf.cheng`(ECVRF-EDWARDS25519-SHA512-TAI,draft-irtf-cfrg-vrf-15)。验收:`src/tests/vrf_tai_vectors_smoke.cheng` 对 draft 附录 B.3 全部三组官方向量逐字节对拍(prove/proof_to_hash/verify + 篡改负例),stage3 system-link-exec 编译运行 rc=0。实现内部经 `VrfBaseMultStd` 显式翻转 ref10 的 base-point 约定(见第 5 条)。委员会抽签、奖励扰动、快照随机系数的共同依赖已就绪。
2. **DAG 排序接线 — 已落地**:`src/chain/dag_ordering.cheng` 确定性全序(§2.3);委员会投票 `src/chain/committee_vote.cheng`(VRF 抽签+stake 权重+提案签名投票+2f+1 tally)与端到端 `committee_e2e_smoke` rc=0。
3. **最终性证书路径 — 核心已落地**:`src/chain/finality_certificate.cheng`(证书容器+轻节点验签:成员校验/去重/逐票验签/quorum≥2f+1,篡改即拒);`src/tests/committee_vote_smoke.cheng`(抽签确定性/stake 权重/quorum)与 `src/tests/committee_e2e_smoke.cheng`(四验证者×100 笔并发、四种插入序 → 线性序列一致 + 无 DAG 视图第三方验签通过)rc=0。checkpoint 与 median-of-last-K 见 `src/chain/checkpoint.cheng`(已落地,见下条)。
4. **经济模块迁接 — 已完成**:RWAD-blockchain 经济语义已全部复现于本仓 `src/apps/rwad/`(settlement/oracle/risk/bridge_fs/governance 等),每模块绑定 rc=0 smoke;跨仓归属声明已废止,本仓自包含。bridge 契约核心:`src/chain/rwad_bridge_contract.cheng`(Merkle-Sum 批次根+apply 校验+schema 指纹互锁,验收 `bridge_contract_smoke` rc=0);文件系统 export/apply 壳 `src/apps/rwad/rwad_bridge_fs.cheng`(本仓归属,验收 `bridge_fs_smoke` rc=0)。立项文档 `cheng-decentralized-compute-storage.md` 的对接章节已同步改写为本仓执行。
5. **ref10 base-point 约定修正(新立,独立于 VRF)**:`ref10.geScalarMultBase` 经 negate-vartime 路径解压 base 常数,返回 RFC 8032 标准约定下的 `-[a]B`;libp2p 的 ed25519 sign/verify 在 `-B` 世界里自洽,但与任何外部 Ed25519 实现互操作时公钥/签名不互通(RFC8032 test1 seed 推导出 `d75a...519a`,标准应为 `d75a...511a`)。在源头修正会作废全部现有 peer 身份与已签名数据,必须走协议迁移立项;VRF 已在模块内显式适配,不受此债影响。

## 6. 验收口径

- 本文 §2 各层的完成定义:代码可达 import + 唯一 build 调用 + smoke 覆盖 + 证据绑定源码/驱动哈希。模拟报告不作为生产完成依据(同 `cheng-lang` 发布证据铁律)。

### 6.1 功能闭环阶段证据(2026-08 gate 登记)

驱动:`artifacts/bootstrap/cheng.stage3 system-link-exec --target:arm64-apple-darwin`;九条 smoke 全 rc=0(vrf_tai_vectors / dag_ordering / consensus / committee_vote / committee_e2e / checkpoint / bridge_contract / settlement_migration / econ_gov_migration)。

```json
{
  "gate": "rwad-functional-closure",
  "round": "2026-08-M-orc-loop (27 smokes; dev-compiler verification loop open, ownership-annotation migration scoped ~2000 sites)",
  "smokes": [
    {"path": "src/tests/vrf_tai_vectors_smoke.cheng", "rc": 0},
    {"path": "src/tests/dag_ordering_smoke.cheng", "rc": 0},
    {"path": "src/tests/consensus_smoke.cheng", "rc": 0},
    {"path": "src/tests/committee_vote_smoke.cheng", "rc": 0},
    {"path": "src/tests/committee_e2e_smoke.cheng", "rc": 0},
    {"path": "src/tests/checkpoint_smoke.cheng", "rc": 0},
    {"path": "src/tests/bridge_contract_smoke.cheng", "rc": 0},
    {"path": "src/tests/settlement_migration_smoke.cheng", "rc": 0},
    {"path": "src/tests/econ_gov_migration_smoke.cheng", "rc": 0},
    {"path": "src/tests/token_conservation_smoke.cheng", "rc": 0},
    {"path": "src/tests/full_pipeline_smoke.cheng", "rc": 0},
    {"path": "src/tests/unimaker_pay_smoke.cheng", "rc": 0},
    {"path": "src/tests/light_client_smoke.cheng", "rc": 0},
    {"path": "src/tests/rwad_query_service_smoke.cheng", "rc": 0},
    {"path": "src/tests/creator_flow_smoke.cheng", "rc": 0},
    {"path": "src/tests/agent_payflow_smoke.cheng", "rc": 0},
    {"path": "src/tests/depin_settle_smoke.cheng", "rc": 0},
    {"path": "src/tests/reserve_discipline_smoke.cheng", "rc": 0},
    {"path": "src/tests/settlement_cycle_smoke.cheng", "rc": 0},
    {"path": "src/tests/bridge_fs_smoke.cheng", "rc": 0},
    {"path": "src/tests/disclosure_smoke.cheng", "rc": 0},
    {"path": "src/tests/compliance_smoke.cheng", "rc": 0},
    {"path": "src/tests/rfc8032_epoch1_smoke.cheng", "rc": 0},
    {"path": "src/tests/gov_epoch_smoke.cheng", "rc": 0},
    {"path": "src/tests/fcert_epoch_smoke.cheng", "rc": 0},
    {"path": "src/tests/ref10_migration_drill_smoke.cheng", "rc": 0},
    {"path": "src/tests/gov_cert_flow_smoke.cheng", "rc": 0}
  ],
  "source_sha256": {
    "src/chain/committee_vote.cheng": "98f9df8240226c878db84a8c57d6d8ceca7330c827d73af093735b304e996413",
    "src/chain/finality_certificate.cheng": "a3c8d45b7977f4e70e75a09930836d87fe2ea7814178e660f7c177c829a983bc",
    "src/chain/checkpoint.cheng": "1a450cf43f39fb04c92845b00ec096a0b586d640306c49897d8aa01bd690a0b7",
    "src/chain/rwad_bridge_contract.cheng": "ef3ca66cd50afc31df2c60637ce690f83d9dcacb36b8a012e368b8af3a3a8be3",
    "src/apps/rwad/rwad_settlement.cheng": "f2fd516cb3eb2a5608f4bfe5a5e17a08e4362621c747a38f9bed7544a4667858",
    "src/apps/rwad/rwad_oracle_risk.cheng": "4ce8553232fb433559fe162fc797a24a3f3726ee313761d67645bb1283ec5bcc",
    "src/apps/rwad/rwad_serial_state_machine.cheng": "96e2c9487ed3b84fe70a985fe23f14594e0da93c931c2947b97bf13ee36a1764",
    "src/apps/unimaker/unimaker_rwad_pay.cheng": "b86f03d451688ba7748d8900b72868bcccb93f50bc895ed6e71bf69cbfe0d2a3",
    "src/chain/light_client.cheng": "966b78f1907829a194b86e4ce81268a0e285dc8d6315c48ec1f27a512ff034d3",
    "src/apps/rwad/rwad_query_service.cheng": "b22bc0ad57f58e31ca1770944b047837cca3e76efa86afa7fecaad12e4342e91",
    "src/apps/rwad/rwad_query_exec.cheng": "fd78c0d13248095a024c905e550b02bf7a22910b08c60ad3d56efac4ceaf72b0",
    "src/apps/rwad/rwad_creator_flow.cheng": "33c94064cc17b18a057f20bb4b8dbffeee99c993ce8698bd36ccc38f7af1a721",
    "src/apps/rwad/rwad_agent_payflow.cheng": "80030987b596cdaeb184e410cdfa20d4dd68abfdb2eaa77db736357bef413d92",
    "src/apps/rwad/rwad_depin_settle.cheng": "593239daea5b8004ccc89bf05da34b0f4a3ffca3688b33a2ee639d9450baa081",
    "src/apps/rwad/rwad_reserve.cheng": "db35ed9caedbe6e5ac8747e9d9945fe53c46b006ae7c528fd849ec7c277ad7b6",
    "src/apps/rwad/rwad_settlement_cycle.cheng": "e4519cf1293ece6e9ef77fb0a261dab2f12b875edd324b9720e0103bdedf67b0",
    "src/apps/rwad/rwad_bridge_fs.cheng": "dbe2f3a4e43cd246d6695fe55d51581dbfa6ad3409b9dda835b4383bf8c00bd5",
    "src/apps/rwad/rwad_disclosure.cheng": "75434904f17b06dc435485d7c0b4db801cc2023b5dc9e732ef4b855ea98efb5e",
    "src/apps/rwad/rwad_compliance.cheng": "8f27e0a88d9ea3f2045b64d9d5d4714a02638af930ca0bf2bb15832dfa19b607",
    "src/std/crypto/ed25519/ref10.cheng": "43d777fd31defb2e4f83af9625ba958dbb166894ae2e16148b8f441338b8d9c7",
    "src/libp2p/crypto/ed25519/ed25519.cheng": "d94f0e2f3fd3513bd096056b1398734bb6486207a8988a572d79a56db8162103",
    "src/apps/rwad/rwad_gov_epoch.cheng": "2cbe8389598db076384d4bf162adcc3c8599cb5ea7d530669bff9921b0ac22cd",
    "src/chain/finality_certificate_epoch.cheng": "dd947c021d5cac00c3b1b1c464f4ed447106035f87e5838fda505a8cd77841eb",
    "src/tests/orc_registry_miss_repro.cheng": "80ad47f8c89729d6780379adf13b6b236599a7290b7f0050fbd229fc78d59954(compiler-lane evidence)",
    "src/apps/rwad/rwad_bridge_fs.cheng(ORC-hardened, ownership final)": "b49812274f691478467931b18f885de39a48f42734b1f6dd2b04cba33accae7f",
    "docs/rwad-chain-architecture.md(self-contained declaration)": "99ead8bb8f7b0b3c6242c422ba9dd97a0accc1c37a409b1fa0ff0083d8db4a06",
    "docs/rwad-orc-compiler-fix-plan.md": "51c996890d0a0479e14e450b2a6c9bbf0e367028fa7165a5d7b68663127bad92",
    "src/std/result.cheng(Err ownership contract)": "f418abfe7d4df3f9dc291148afff3bbc1bc6626027f7a9e181f388ca8ae6c475",
    "src/tests/ref10_migration_drill_smoke.cheng": "d805f0ae82827d1c87653a8b166352cf8803d0a6a1ce18af0a52f4edf6ed2e7c",
    "src/apps/rwad/rwad_gov_cert_flow.cheng": "514d230c573e92dfcd41cae41e2729dd072d8690d99434f65c4b71554c1de0ee",
    "src/tests/gov_cert_flow_smoke.cheng": "4bd4596d37dbd7de5345b234f5dd3954edb7b5bf661052664a60f47216a9cabd"
  },
  "known_debts": [
    "ref10 -B 约定:步骤1/2/3 内核侧全部闭环——治理决策即证书(gov_cert_flow:委员会对 SetMinEpoch motion 签名,2f+1 且成员资格校验通过后强制线生效,伪造票/不足票实测拒绝);ref10 迁移在 cheng-lang 内无剩余工程债,仅剩跨仓归属与编译器 lane 两项外部事项",
    "bridge 文件壳归属已定案:cheng-lang 本仓即最终归属(经济内核自包含,跨仓依赖废止);文档层跨仓归属声明已全部反转(compute-storage/migration-map/closure-prompt),源码注释同步",
    "内核 ORC 缺陷:根因已定谳至编译器 lowering——含托管 str 字段 struct 经构造器 sret 边界双重所有权(cold_parser.c L43788 仅 OWN_MOVE 绑 consume,borrow 来源无 retain;构造器自身 sret 边界第二处),实锤同一 payload release 2-3 次。修复立项 docs/rwad-orc-compiler-fix-plan.md(根因/探针/修复方向/provider 回路缺口);业务侧防御(FileExists 预检+字面量 Err+Err[T] 合同加固)已落地"
  ],
  "dod_status": {
    "1_unimaker_tx_lightclient_confirm": "met (unimaker_pay_smoke + full_pipeline_smoke)",
    "2_four_node_100tx_consensus_replay": "met (committee_e2e_smoke + token_conservation_smoke)",
    "3_tier1_modules_conservation": "met (settlement/econ_gov migration smokes)",
    "4_bridge_interlock": "met (contract core + file shell rwad_bridge_fs with golden round-trip and tamper refusal)",
    "5_acceptance_registered": "met (this section)"
  },
  "ready": true,
  "scope_note": "本 gate 覆盖 Phase A 全部、B 契约核心、C 第一梯队迁接、D1/D2/D3 服务面与 E1-E4 商业资金流;DoD1-5 全部 met。剩余:D4 激励面板产品仓接线、E 各流的真实外部对接。"
}
```

