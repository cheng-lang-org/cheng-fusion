# ref10 base-point `-B` 约定协议迁移设计(立项)

状态:**设计冻结,实施待排期**。本文是 §6.1 known_debts 首条的迁移方案,
实施前不得与外部 Ed25519 实现互通。

## 1. 债的本质

`src/std/crypto/ed25519/ref10.cheng` 的 `geScalarMultBase` 经 negate-vartime
路径解压 base 常数,实际计算的是 `-[a]B`(RFC 8032 约定下应为 `[a]B`)。
后果:

- 内部自洽:libp2p ed25519 sign/verify 都在同一 `-B` 世界,内核内全部
  smoke(签名/证书/VRF/committee)rc=0 且互认。
- 外部不通:同 seed 推出的公钥差一个符号位(RFC8032 test1 seed 得
  `d75a...519a`,标准为 `d75a...511a`),签名对任何外部实现不可验。
- 影响面:peer 身份、最终性证书签名列表、checkpoint 签名、一切对外
  桥/EVM 互操作。VRF 已在模块内显式适配,不受此债影响。

## 2. 为什么不能就地修

源头改 `-[a]B` → `[a]B` 会立即作废:①全部已注册 peer 公钥;②所有历史
证书/checkpoint 签名的可验证性;③已落盘的 libp2p 身份文件。等价于硬分叉。

## 3. 迁移方案:双密钥纪元 + 显式 scheme 标签

### 3.1 密钥纪元(key epoch)

- 引入 `key_epoch: uint16`,写入 peer 身份文件与证书头。`0 = -B 纪元`,
  `1 = RFC8032 纪元`。
- 新签发身份一律 epoch 1;epoch 0 身份保留验证能力直至弃用窗口关闭。

### 3.2 scheme 标签进签名域

- 所有签名消息前置域分隔:`"cheng.ed25519.e" || epoch_be16 || payload`
  (域分离复用 VRF 已验证的 CidTag/suite-string 手法)。
- 验证侧按 epoch 选择基点约定:epoch 0 走现路径,epoch 1 走修正后的
  `[a]B` 路径(实现上给 ref10 加 `geScalarMultBasePos`,negate 移除)。

### 3.3 迁移四步

1. **落地双路径**:ref10 增加 `geScalarMultBasePos` 与 epoch 参数化验签;
   单测同时跑通 RFC8032 test1..test3(标准向量)+ 全量现有 smoke(-B 向量)。
2. **双注册窗口**:新身份只发 epoch 1;epoch 0 存量身份可自愿轮换;
   证书接受两种 epoch 混合签名(quorum 计数不变)。
3. **强制线**:治理参数 `min_key_epoch` 从 0 升到 1(走 EcoGovSetBp 同款
   治理函数族);此后 epoch 0 签名一律拒绝。
4. **清除**:epoch 0 代码路径降级为 unreachable(hard-fail),删除 negate
   vartime 死代码,债销账。

### 3.4 验收标准

- RFC8032 官方测试向量 test1/test2/test3 全过(epoch 1)。
- 现有 24 条内核 smoke 在 epoch 0 路径下零漂移(回归即证兼容)。
- 混合 epoch 证书:1×epoch0 + 3×epoch1 达 quorum 通过;全 epoch0 在
  强制线后被拒。
- 证据按 §6.1 口径绑定源码哈希登记。

## 4. 排期约束

步骤 1 可独立先行(纯增量,无行为变化)。步骤 2-3 需要治理链上参数
生效机制(EcoGov 治理函数已具备,交易层接线在 §6.1 debts 第 2 条之后)。
外部桥/EVM 互操作开工的**前置条件是步骤 1 完成 + 步骤 3 强制线生效**。
