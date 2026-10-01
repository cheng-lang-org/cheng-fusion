# CSG Certified Transaction 抗量子与金融资产安全方案

## Summary

目标改为：用 Cheng CSG 收敛交易所需环境，生成可验证交易证明；低风险交易在证明通过后自动签名，高风险交易升级到 Passkey、硬件或多签。

安全定义：**CSG 编译通过 = 交易符合用户意图、策略、状态快照、合约描述、签名 payload 和执行 substrate；不等于保证市场结果一定安全。**

## 编译即交易方案

核心定义：**编译即交易 = 交易环境被 CSG 完整收敛，生成 `certified_transaction` 后，signer gate 原子签名并广播。** 编译器不碰私钥，不直接承诺市场结果，只证明“这笔即将签名的交易就是用户授权的那笔交易”。

### 交易环境

必须进入 CSG 的环境只有这些，缺一项直接失败：

```text
user_intent              用户主动产生的原始意图
typed_action             UniMaker 控制面动作
policy                   用户策略、额度、收款人、合约、selector、风险等级
state_snapshot           block、nonce、余额、allowance、价格、state_reads_hash
contract_profile         ABI、selector、已知合约、禁用 approve all/delegatecall/unknown call
simulation_result        执行前模拟结果
signing_payload          链原生待签 payload
signer_requirement       session/passkey/hardware/multisig
execution_substrate      Cheng CSG Transaction OS / capability runtime
audit_trace              完整可回放证据链
```

不进入 CSG 的东西不能影响签名：

```text
截图
视觉点击
LLM 自己拼 calldata
网页 DOM 猜测
未注册合约
未注册 selector
过期状态
模拟后被替换的 payload
未证明的普通操作系统路径
可动态加载代码的执行环境
AI 可访问 signer 的进程环境
未绑定 RPC/网络策略的状态查询路径
```

### 架构闭环

```text
UniMaker typed action
  -> intent compiler
  -> policy engine
  -> state snapshot oracle
  -> contract profile registry
  -> simulation engine
  -> CSG finance compiler
  -> certified_transaction
  -> execution substrate gate
  -> signer gate
  -> chain adapter
  -> audit log
```

每一层只做一件事：

- `typed action`：把买、卖、授权、取消、结算变成强类型动作，禁止视觉点击进入交易路径。
- `intent compiler`：只接受用户主动确认的 intent，AI proposal 不能直接进入交易编译。
- `policy engine`：把额度、收款人、合约、selector、有效期、风险等级编成 hash。
- `state snapshot oracle`：固定 block、nonce、余额、allowance、价格和 `state_reads_hash`。
- `contract registry`：只允许已知合约和已知 selector，`approve all/delegatecall/unknown call` 直接失败。
- `simulation engine`：在同一状态快照上模拟最终 calldata，输出 `simulation_hash`。
- `CSG finance compiler`：绑定 `intent_hash + policy_hash + state_snapshot_hash + contract_profile_hash + simulation_hash + payload_hash`。
- `execution substrate gate`：绑定 Cheng CSG OS、capability runtime、UI trusted path、内存/网络策略和 signer 隔离。
- `signer gate`：只签 `certified_transaction`，不接受裸 calldata。
- `chain adapter`：只负责链原生签名格式和广播，不拥有策略判断权。
- `audit log`：保存可回放证据链，方便事后验证和争议处理。

### 编译规则

`FinanceCompileCertifiedTransaction(input)` 必须满足：

```text
intent.sourceKind == user_intent
intent.userAuthorized == true
intent.amount <= policy.maxAmount
intent.chainId == policy.allowedChainId
intent.asset == policy.allowedAsset
intent.recipient == policy.allowedRecipient
state.blockNumber <= policy.validUntilBlock
state.balance >= intent.amount
contract.knownContract == true
contract.selector == policy.allowedSelector
contract.approveAll == false
contract.containsDelegatecall == false
simulation.ok == true
simulation.payloadHash == payload.payloadHash
simulation.calldataHash == payload.calldataHash
simulation.stateReadsHash == state.stateReadsHash
payload.policyHash == policy_hash
payload.stateReadsHash == state.stateReadsHash
payload.validUntilBlock == policy.validUntilBlock
payload.maxSlippageBps == policy.maxSlippageBps
```

任一条件不成立，输出 hard-fail report，不弹确认。

### 执行 Substrate 规则

完整闭环必须包含操作系统层。第一版不写通用 OS，而是写最小 `cheng-csg-transaction-os` 能力运行时，只承载交易控制面。

`FinanceExecutionSubstrate` 必须绑定：

```text
osIdentityHash
kernelCapabilityHash
processIsolationHash
signerIsolationHash
memoryPolicyHash
networkPolicyHash
uiTrustedPathHash
deviceAttestationHash
csgMeasurementHash
receiptHash
```

必须全部为真：

```text
chengCsgKernel
capabilityRuntime
deterministicSyscalls
signerIsolated
aiProcessIsolated
uiTrustedPath
networkPinned
noDynamicCodeLoading
noVisualTransactionPath
noClipboardTransactionPath
```

signer session 必须绑定同一 substrate：

```text
signerSession.deviceBindingHash == executionSubstrate.deviceAttestationHash
signerSession.attestationHash == executionSubstrate.signerIsolationHash
```

`production_transaction_environment` 必须包含 `executionSubstrateHash`。`signed_transaction` 和 `broadcast_request` 必须同时包含 `environmentHash` 与 `executionSubstrateHash`，否则签名和广播不能证明来自同一个 Cheng CSG 执行环境。

### 签名规则

signer gate 的输入只有：

```text
certified_transaction
signing_payload
signer_kind
```

签名前必须重新核对：

```text
cert.complete == true
payload.intentHash == cert.intentHash
payload.policyHash == cert.policyHash
payload.stateSnapshotHash == cert.stateSnapshotHash
payload.contractProfileHash == cert.contractProfileHash
payload.payloadHash == cert.payloadHash
payload.calldataHash == cert.calldataHash
payload.stateReadsHash == cert.stateReadsHash
signer_kind == cert.signerRequirement
```

风险对应 signer：

```text
low     -> session signer
medium  -> passkey signer
high    -> hardware signer 或 multisig signer
```

session signer 只保留短期权限，私钥不进入 AI 进程。Passkey、硬件、多签也不接收裸 calldata，只接收 certified transaction。

### 生产边界

第一版只允许这些交易：

```text
UniMaker 内部支付
内容购买
RWAD 订单
DEX 限价单
取消订单
escrow 结算
```

第一版禁止：

```text
任意 DeFi
跨链桥
杠杆
未知资产
未知合约
未知 selector
大额自动交易
approve all
delegatecall
AI 直接构造交易
```

### 抗量子接入

抗量子不放进链上执行假装完成，只放在长期证明层：

```text
identity/content/policy authorization -> classical + ML-DSA 双签
root authorization                    -> SLH-DSA
transaction execution                 -> chain-native signature
```

当钱包、账户抽象或链支持 PQ 签名后，新增 PQ signer adapter。适配器必须复用同一个 certified transaction hash，不能绕过 CSG 重新解释交易。

### 最小落地顺序

1. 标准层：`csg_dialect::finance` facts 和 `complete=true` 门禁。
2. 编译层：`FinanceCompileCertifiedTransaction` 输出 certified transaction 或 hard-fail。
3. 签名层：session/passkey/hardware/multisig signer gate 只接受 certified transaction。
4. UniMaker 入口：所有交易动作改成 typed action，移除视觉点击交易路径。
5. 状态层：实现 block/nonce/balance/allowance/price/state_reads_hash 的确定性 snapshot。
6. 合约层：维护 ABI/selector/known contract registry。
7. 模拟层：同一 snapshot 上模拟最终 calldata。
8. 审计层：保存 intent、policy、snapshot、profile、simulation、payload、certified hash。
9. 广播层：chain adapter 只广播 signer gate 产出的签名交易。
10. 扩展层：接 PQ signer adapter，但不改变 certified transaction 的 hash 语义。

### 当前代码落点

```text
src/core/csg_finance/certified_transaction.cheng
  负责 intent/policy/state/contract/simulation/payload -> certified_transaction
  负责 signer gate 只签 certified transaction

src/core/csg_finance/transaction_environment.cheng
  负责 typed action、policy receipt、state receipt、contract registry、simulation receipt、payload receipt、signer session、execution substrate 的生产环境闭合
  负责 certified transaction -> signer authorization -> signed transaction receipt -> broadcast request

src/tests/csg_finance_certified_transaction_smoke.cheng
  覆盖 certified transaction 基础证明

src/tests/csg_finance_transaction_environment_smoke.cheng
  覆盖完整生产环境和广播请求门禁
```

## Key Changes

- 新增 `csg_dialect::finance`：
  - `intent`：用户原始交易意图。
  - `policy`：额度、收款人、合约、函数、有效期、风险等级。
  - `state_snapshot`：余额、allowance、价格、nonce、block、state_reads_hash。
  - `contract_profile`：ABI、selector、允许调用、禁止 `approve all/delegatecall/unknown call`。
  - `simulation_result`：执行前模拟结果。
  - `certified_transaction`：绑定 `intent_hash + policy_hash + state_snapshot_hash + contract_profile_hash + simulation_hash + payload_hash`。
  - `execution_substrate`：绑定 Cheng CSG OS、capability runtime、trusted UI、内存/网络策略和 signer 隔离。
  - `audit_trace`：完整可回放证据链。

- 交易体验改成风险分级：
  - 低风险：CSG 编译证明通过，本机 session signer 自动签。
  - 中风险：CSG 编译证明通过，Passkey/设备认证确认一次。
  - 高风险：大额、新合约、跨链、策略变更、未知资产，必须硬件或多签。
  - 编译失败不弹确认，直接 hard-fail。

- session signer 不再是独立信任点：
  - signer 只签 `certified_transaction`。
  - 签名 payload 必须包含 `policy_hash`、`payload_hash`、`valid_until_block`、`max_slippage`、`state_reads_hash`。
  - payload 与 CSG 证明不一致直接拒签。

- 抗量子策略保持分层：
  - 身份、内容确权、策略授权：传统签名 + ML-DSA 双签。
  - 长期根授权：SLH-DSA。
  - 交易执行：先走链原生签名；CSG 负责证明和审计，等链/钱包支持后再接 PQ 签名适配器。

## Implementation Changes

- 在 CSG 标准层增加 `finance` profile，要求 `complete=true` 才能生成 certified transaction。
- 在 UniMaker 交易入口接入 control surface：所有买卖、授权、取消、结算动作必须从 typed action 进入，不允许视觉点击或 AI 直接构造交易。
- 新增交易编译器：输入 intent、policy、state snapshot、contract profile、simulation，输出 certified transaction 或 hard-fail report。
- 新增 signer gate：session signer、Passkey signer、hardware signer、多签 signer 都只接受 certified transaction，不接受裸 calldata。
- 新增 execution substrate gate：交易环境必须证明运行在 `cheng-csg-transaction-os`，并绑定 UI trusted path、网络 pinning、内存策略、signer 隔离和设备 attestation。
- 第一版只覆盖受限场景：UniMaker 内部支付、内容购买、RWAD 订单、DEX 限价单、取消订单、escrow 结算。

## Test Plan

- CSG 编译证明：
  - 同一交易环境重复编译，certified transaction hash 一致。
  - 修改 intent、金额、收款人、chain id、selector、allowance、state snapshot 任一项，证明失效。
  - `complete=false`、unsupported、未知合约、未知 selector、tombstone 直接失败。

- 资产安全：
  - `approve all` 失败。
  - 超额度失败。
  - payload 与 UI 展示不一致失败。
  - simulation 与最终 calldata 不一致失败。
  - block 过期或 state_reads_hash 漂移失败。
  - substrate 不是 Cheng CSG transaction OS 失败。
  - signer/session attestation 未绑定 substrate 失败。
  - signed transaction 的 `executionSubstrateHash` 与 envelope 不一致失败。

- 用户体验：
  - 低风险订单自动签。
  - 中风险订单触发 Passkey。
  - 高风险订单触发硬件/多签。
  - AI proposal 无用户 intent 不能进入交易编译。

## Assumptions

- 默认采用“自动 + Passkey + 多签”的体验模型。
- 第一版证明边界是“策略 + payload + 状态快照 + 执行 substrate 安全”，不宣称证明合约经济结果。
- 第一版 signer 放在本机安全区/session key，私钥不进 AI 进程。
- 第一版不支持任意 DeFi、跨链桥、杠杆、未知合约大额自动交易。
