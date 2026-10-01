# Cheng libp2p 收敛与终极蓝图

> **文档层级**：执行层单一方案文档（P2P/网络栈路线）。  
> **状态**：propose（2026-06-11），待用户确认后按 OpenSpec 分期 apply。  
> **关联提案**：`openspec/proposals/cheng-libp2p-convergence.md`  
> **生态蓝图**：`docs/cheng-decentralized-compute-storage.md`（含 DePIN 终极落地蓝图附录）

## 一页结论

- **不换外部库**：Cheng 自举约束下，最优路径不是引入 iroh/go-libp2p，而是把已有 **纯 Cheng native QUIC（`src/quic/`）+ qconn 抽象** 收敛成 **iroh 形态小核**（QUIC-only、NodeID 拨号、relay-first、后台升级直连），libp2p 协议层只保留真正在用的子集。
- **身份是差异化资产**：`did:cheng` 设备认证 DID（根键/设备委托/连接级 didauth）与传输收敛正交，**原样保留并补强**——硬件 attestation 桥 + 吊销 head 锚定 registry/RWAD。
- **引导与广播按负载分流**：小消息集合态 → Erlay 调和；大对象 → 复用 `moq_fountain` 喷泉广播；中等消息 → episub 补全 Plumtree choking；DHT 降为开放期最后手段，准入用 **DID+质押**（不用 S/Kademlia PoW）。
- **前置验证网**：离散事件网络仿真器（Wave 1 方法论平移）是所有分布式改造的前置；无仿真器不碰 relay/Erlay/喷泉/DHT 主链。
- **与外部 libp2p 不 wire 互通**：确认后 multistream-select、multiaddr 兼容、WebSocket/WebTransport stub 均为可断沉没成本。

---

## 1 现状盘点（2026-06-11）

### 1.1 规模与结构

| 路径 | 规模 | 说明 |
| --- | --- | --- |
| `src/libp2p/` | ~482 文件 / ~71k 行 | 纯 Cheng libp2p 主体 |
| `src/quic/` | ~46 文件 / ~17k 行 | 纯 Cheng UDP+QUIC+TLS1.3（`msquic` 为历史命名，非 MS DLL 绑定） |
| `src/moq/` | 3 文件 / ~5.7k 行 | Fountain FEC + 媒体 manifest |
| `src/libp2p/did/` | ~1.6k 行 | `did:cheng` 身份、设备认证断言、document/credential |

### 1.2 已闭合能力

- **传输**：TCP、QUIC（native stream，不经 yamux/mplex）、WebRTC、Tailnet；relay/dcutr/autonat。
- **协议**：identify、ping、gossipsub（含 scoring/sharding）、kad 骨架、bitswap、mdns、rendezvous。
- **QUIC 栈**：`libp2p/transports/quic_transport.cheng` → `cheng/quic/native_runtime.cheng` → `qconn.Connection`（同进程 pipe 与真 UDP 共用接口）。
- **媒体链**：MoQ 段流 + Fountain FEC + manifest-only 远端首帧 + delivery receipt（同进程/localhost 已证）。
- **DID**：`did:cheng:<rootPeerId>`、设备委托/吊销、`/libp2p/did-auth/1.0.0` 连接握手、`BiometricAssertionV1` local-only 模型。
- **门禁**：`libp2p_moq_segment_stream_smoke`、`moq_fountain_strict_fec_smoke` 等已进入 host-smoke 默认列表；stage23 libp2p gate 覆盖 QUIC/WebRTC/tailnet 双进程。

### 1.3 已知缺口（诚实）

| 类别 | 缺口 |
| --- | --- |
| 连接 | 真双端 twoproc 未闭合；Windows 远端 QUIC 握手未完成 |
| 身份 | 设备认证断言为设备自声明，缺 Keystore/Secure Enclave 硬件门控；吊销仅本地 resolver |
| 引导 | `bootstrap_gossip` 默认 `requireTrustedPublisher=false`；kad 为线性 provider 表，非 XOR DHT |
| 广播 | episub 为 4.5KB 订阅壳，无 choking/树；无 Erlay/喷泉 mesh 集成 |
| 传输 | WebSocket/WebTransport stub；遗留 `src/libp2p/quic/` shim |
| 移动 | 无 relay 信箱 store-and-forward；无 push 唤醒离线投递 |

### 1.4 代码映射（关键入口）

| 用途 | 路径 |
| --- | --- |
| Host 入口 | `src/libp2p/host/host.cheng` |
| QUIC 传输 | `src/libp2p/transports/quic_transport.cheng` |
| native QUIC | `src/quic/native_runtime.cheng` |
| qconn | `src/quic/connection.cheng` |
| MoQ 段流 | `src/libp2p/protocols/media/moq_segment_stream.cheng` |
| Fountain FEC | `src/moq/moq_fountain.cheng` |
| DID 类型 | `src/libp2p/did/types.cheng` |
| 设备认证断言 | `src/libp2p/did/biometric.cheng` |
| didauth 协议 | `src/libp2p/protocols/didauth.cheng` |
| bootstrap 引导 | `src/libp2p/discovery/bootstrap_gossip.cheng` |
| gossipsub | `src/libp2p/protocols/pubsub/gossipsub/` |
| host-smoke 列表 | `src/core/tooling/host_smoke_gate.cheng` |

---

## 2 目标架构：Cheng 网络栈四层

```
┌─────────────────────────────────────────────────────────────┐
│ 应用：UniMaker / cheng_pkg / DePIN / CSG-Web / GUI          │
├─────────────────────────────────────────────────────────────┤
│ 数据面：MoQ 段流 + Fountain + CID 验证字节流 + CDC 分块      │
├─────────────────────────────────────────────────────────────┤
│ 控制面：Erlay 集合调和 / episub choking / DID 吊销 / 通道 head │
├─────────────────────────────────────────────────────────────┤
│ 引导：persistent peerstore → 签名目录 → mDNS/BLE → PEX → DHT │
├─────────────────────────────────────────────────────────────┤
│ 传输：QUIC-only 小核 + home relay + 打洞升级直连 + didauth   │
├─────────────────────────────────────────────────────────────┤
│ 身份：did:cheng + 硬件 attestation + 委托/吊销/恢复          │
└─────────────────────────────────────────────────────────────┘
```

### 2.1 传输收敛（iroh 形态，非引库）

**保留**

- `src/quic/` 全部（自研 QUIC+TLS1.3）
- `qconn.Connection` 统一抽象
- didauth 协议语义（仅注册方式从 multistream 迁到 ALPN 表）

**收敛**

| 项 | 动作 |
| --- | --- |
| 单传输 | QUIC-only；TCP/WebRTC 降为平台专项或 Phase 3 可选 |
| 拨号 | ed25519 NodeID（= devicePeerId）直接拨号；multiaddr 降为可选表示 |
| 握手 | ALPN 选协议，删除 multistream-select（省 1–2 RTT） |
| muxer | 删除 yamux/mplex 主路径依赖（QUIC native stream 已绕过） |
| stub | 删除 WebSocket/WebTransport stub、遗留 msquic shim |

**新增（连接成功率第一性）**

- **home relay**（DERP 形态）：先 relay 立即通，后台 UDP 打洞升级直连
- **QUIC connection migration**：移动端切网不断流
- **地址验证 retry token**：QUIC 层反 UDP 放大

**预期收益**：连接成功率接近 100%（relay 先行）；握手 RTT 减半；核心代码面从 ~71k 收到 ~25k 量级（stub 清零后）。

### 2.2 身份层（设备认证 DID，补强不替换）

**现状模型（保留）**

```
did:cheng:<rootPeerId>
  └─ DidDocumentV1（≤32 设备）
       ├─ DeviceDelegationProofV1（根键签名委托）
       ├─ DidRevocationV1
       └─ biometricCapabilities / biometricClass
  └─ didauth：challengeHash = sha256(did, devicePeer, nonceA, nonceB)
       BiometricAssertionV1：localOnly=true 硬要求
```

**必须补强**

| 项 | 方案 | 验收 |
| --- | --- | --- |
| 硬件证明 | Android Keystore `setUserAuthenticationRequired` / Apple Secure Enclave / Windows Hello；签名动作本身被设备认证解锁门控；key attestation 链写入 `DeviceMethodV1` | 无 attestation 的设备不能声称 strong device-auth class |
| 吊销传播 | document head 锚定 registry 通道 head（复用包管理 epoch/CID 机制） | 吊销后新连接 didauth 硬拒绝；全网收敛 ≤ 通道传播延迟 |
| 根键恢复 | M-of-N 监护人阈值重签 document head；老设备扫码授权新设备委托 | 丢失单设备可恢复；丢失全部监护人不可恢复（明确 UX） |
| 设备生命周期 | enrollment / revoke / 冷存储约定写入 `identity_store.cheng` 规范 | smoke 覆盖委托→使用→吊销→拒绝 |

**与传输的关系**：传输层 dial-by-devicePeerId；连接建立后 didauth 把设备绑到人。两层独立演进。

### 2.3 引导（Bootstrap）分层

| 层 | 方案 | 优先级 |
| --- | --- | --- |
| L0 | **persistent peerstore**：上次活跃 peer 落盘，开机先拨 | Wave 1 |
| L1 | **签名 peer 目录**：registry 通道 head 发布 relay+seed 列表，DID 签名 | Wave 2 |
| L2 | mDNS + **BLE proximity**（移动端离线差异化） | 已有，保留 |
| L3 | 邀请链接/QR（NodeID + relay 地址） | Wave 2 |
| L4 | **PEX**：`bootstrap_gossip` announce 强制 DID 签名，`requireTrustedPublisher` 默认 **true** | Wave 1（一行语义） |
| L5 | **DHT**：仅 DePIN 开放期；准入 **DID+质押门控**；disjoint paths 抗 eclipse | Wave 3 |

**不做的**：把现有线性 `discovery/kad.cheng` 修成全功能 Kademlia——包/媒体发现用 manifest `source_addrs` + registry provider hints 已足够。

### 2.4 广播（Broadcast）按负载分流

| 负载类型 | 原语 | 实现路径 |
| --- | --- | --- |
| 小消息高频集合态（订单簿、吊销、通道 head） | **Erlay 集合调和** | gossip 只传 IHAVE 信号；minisketch/IBLT 差集补齐 |
| 大对象（包块、媒体段、区块） | **喷泉广播** | 复用 `moq_fountain` LT-XOR；mesh 推 droplet；DePIN 已知集合叠 Turbine 树 |
| 中等消息 mesh 控制 | **Plumtree choking** | episub 从壳补全：eager 树 + lazy IHAVE 修复 + **IDONTWANT**（wire 已有，接行为） |
| 横切 | **评分锚 DID+质押** | `scoring.cheng` 惩罚跨会话累积，封死重连洗身份 |

### 2.5 十章配套（蓝图完整性）

| # | 主题 | 要点 |
| --- | --- | --- |
| 1 | **网络仿真器** | 离散事件 harness：虚拟时钟 + 丢包/延迟/NAT/churn；同种子回放；**所有分布式改造前置** |
| 2 | **DoS/资源** | QUIC retry token；未认证 peer 限速；`resourcemanager`/`resourcelimiter` 接 DID/IP 配额 |
| 3 | **根键恢复** | M-of-N 监护人；扫码 enrollment UX |
| 4 | **移动信箱** | relay store-and-forward（E2E 加密、DID 寻址、TTL）；push 唤醒 |
| 5 | **传输调度** | stream 优先级 + deadline；FEC vs 重传边界；BBR 族 + DPLPMTUD |
| 6 | **链路遥测闭环** | OTel RTT/丢包/带宽 → relay 选择 / Turbine 扇出 / Erlay 周期 |
| 7 | **中继经济学** | relay 运营者签名计量 → RWAD；客户端按地理+质押选 home relay |
| 8 | **反 eclipse** | 出站 ASN/IP 分桶多样性 + 长期锚连接 |
| 9 | **数据面收尾** | CDC 分块、断点续传、blake3 树范围验证（推广媒体验证流到包线） |
| 10 | **Wire 规范** | 机器可读 schema（magic/版本/schema hash）；生成测试向量；多端静态核对 |

---

## 3 分期路线图

### Wave 0 — 验证网（无悔项，不破坏现状）

| 项 | 文件/动作 | 验收 |
| --- | --- | --- |
| 网络仿真器 v0 | `tools/net_sim/` + `net_sim_smoke.cheng` | 100 节点同种子 replay 确定性；注入 partition 后引导/广播 invariant 可断言 |
| persistent peerstore | `src/libp2p/core/peerstore.cheng` 扩展 | 重启后先拨缓存 peer；命中率 smoke |
| bootstrap 可信 | `bootstrap_gossip.cheng` | `requireTrustedPublisher` 默认 true；无 DID 签名 announce 丢弃 |
| IDONTWANT 行为 | `gossipsub/behavior.cheng` | 大消息收到即向 mesh 广播 IDONTWANT；带宽 smoke 降 ≥30% |
| QUIC retry token | `src/quic/native_runtime.cheng` | 放大攻击 fixture hard-fail 无 token 路径 |

#### Wave 0 焦点子项：QUIC 连续连接确定性（2026-06-12 实测立项）

实测证据（见 findings 2026-06-12）：`vpn-proxy-server.exe` 顺序接多个真实 UDP QUIC 连接时，第一条后即 wedged；server 拖慢（debug 日志）变全过、连接间隔变化使失败轮次漂移 → 非确定性竞态，根因是 `src/quic/native_runtime.cheng` 的**单一全局会话**模型（`msquicNativeSession` 唯一实例 + 全局 datapath 表 + 4 槽地址表，注释自述 "in-process loopback runtime"）。

| 子项 | 文件/动作 | 验收 |
| --- | --- | --- |
| 确定性包总线 + 虚拟时钟 | `src/quic/platform/datapath_sim.cheng`（新）+ `datapath_runtime.cheng` 抽象出可插拔传输 | 同种子两端包序确定可复现，与真 UDP 路径行为对拍 |
| QUIC 端点状态实例化 | `native_runtime.cheng`：`msquicNativeSession` 等全局单例改为按 endpoint/connection-id 的会话表 | 一进程内可并存 ≥2 独立端点；现有 host-smoke 零回归 |
| server 会话 teardown 干净化 | `native_runtime.cheng` server 接受路径 | 前一连接关闭后、接受下一连接前完成复位，无残留 datapath/地址槽 |
| N 轮顺序连接门禁 | `quic_sequential_connections_smoke.cheng`（新，确定性）+ 修复 bit-rot 的 `quic_transport_sequential_accept_smoke`（引用了已不存在的 `msquicMakeLocalhostPinnedLeafTlsPolicyInto`，先修测试脚手架） | 确定性 N≥50 轮顺序连接全 PASS，终态会话/datapath 计数归零 |
| 两进程回归 | `artifacts/vpn-proxy-local/verify_quic_e2e.sh` | `QUIC_E2E_ROUNDS=50` 全 PASS，无 wedge |

里程碑顺序：先修测试脚手架 bit-rot → 确定性包总线 → 复现竞态（确定性 N 轮失败）→ 端点实例化重设计 → N 轮全绿 → 两进程 verify_quic_e2e 全绿 → 才解锁 macOS 客户端真机测试。

#### 2026-06-12 深挖：为何这是「整体重构」而非增量补丁（实测+读码定论）

逐条排除后，每条线都汇聚到同一处 runtime 架构，且证明无可安全孤立修复的点：

1. **`quicConnClose` 真 UDP 路径 vs in-process**：native QUIC 连接的 `pipeIdx>=0`（持 native 会话句柄），`quicConnClose` 会经 `pipeClose -> msquicNativePipeClose` 发 CONNECTION_CLOSE + `msquicNativeRecycleClosedSession`。所以单看 close 路径会话**会**回收——但回收的是**全局单例** `msquicNativeSession`，不是"这条连接的会话"。

2. **client wedge 的真实机制（读码定论）**：`VpnProxyRelayTcpQuic`（全非阻塞 + 10ms sleep `while true`）的退出条件依赖 `quicReadClosed` / `!quicStream.conn.open`。当某条 QUIC 连接**静默半死**（握手在 server 单例会话竞态下没干净完成，却让 client 侧 `conn.open=true`），QUIC 读恒 would-block→`quicReadClosed` 永假，TCP 侧 curl 在等响应→`tcpReadClosed` 永假，relay **死循环空转**，单线程串行代理再不 accept→后续 round "could not connect"。即：**上游握手/会话竞态产出"假 open"的死连接 → 下游 relay 无活性判定而 wedge**。

3. **固定 CID 是 load-bearing（实测）**：把 client SCID+DCID 都改唯一即回归连接#1（单次非确定性运行，证据强度有限但方向明确）；正确的最小改法应是**只让 client SCID 唯一、DCID 保持 well-known 0x22222222**（server 监听 CID），但这必须和 server demux/`msquicNativeInitialClientCidChanged` 一起改，且需确定性 harness 才能逐步确认握手哪一步拒绝。

4. **确定性 harness 的可行形态**：`connection.cheng` 的 in-process loopback 经全局 datapath 在两个 datapath id 间投递，能跑**真 QUIC 握手**（非 sim pipe 旁路）；`quic_transport_sequential_accept_smoke` 正是此形态（2 轮，但被 test_pki bit-rot 挡住编译 + test_pki 是空 cert 桩）。**风险**：in-process 是单一共享会话，可能复现"会话复用 wedge"但不复现"两独立端点 demux"。故确定性 harness 需扩成**一进程两独立会话实例**——这与"端点实例化"是同一件事。

定论：正确路径是把 `msquicNativeSession` 等全局单例（约 5500 行 runtime）改为**按 connection-id 的会话实例表**，配套唯一 CID、连接层 keepalive/idle 活性、可插拔确定性包总线 harness。这些互相依赖，须作为**一块设计先行的多阶段工作**整体落地，不能在共享生产 runtime（TCP 出口也用它）上靠增量补丁拼。期间生产 TCP tcp-tls-forward 出口全程 4/4 绿、零回归。

实施前置（每步可独立验收，避免一次性大爆炸）：
- M0 测试 PKI：用本机 openssl 生成**一次性 P256 自签 localhost** cert+key（**禁用生产 VPN 私钥入源码**），嵌入 `test_pki.cheng`，补 `msquicMakeLocalhostPinnedLeafTlsPolicyInto`（pinned-leaf = trustRoot 即 leaf 自身），解 bit-rot。验收：`quic_transport_sequential_accept_smoke` 2 轮可编可跑。
- M1 确定性 N 轮：扩 smoke 到 N≥50；若 in-process 复现 wedge → 得确定性回归；若不复现 → 证明必须先做端点实例化（M2 提前）。
- M2 端点实例化：单例 → 会话表；一进程并存 ≥2 端点。
- M3 唯一 CID + demux + keepalive/idle；M4 两进程 verify_quic_e2e N=50 全绿 + host-smoke/TCP 门禁零回归。

### Wave 1 — 传输收敛

| 项 | 文件/动作 | 验收 |
| --- | --- | --- |
| home relay v0 | `src/libp2p/protocols/relay/home_relay.cheng`（新） | twoproc：NAT 后双端经 relay 连通 → 升级直连 |
| ALPN 协议表 | `quic_transport.cheng` + didauth | didauth 不经 multistream；RTT smoke 降 |
| 删 stub/shim | `wstransport.cheng`、`libp2p/quic/msquictransport.cheng` | 编译通过；无 dead import |
| connection migration | `native_runtime.cheng` | 移动端切网 smoke 不断流 |
| 真双端 twoproc 门禁 | `libp2p_quic_twoproc_smoke.cheng` | stage23 + host-smoke 默认 PASS |

### Wave 2 — 身份补强 + 引导/广播

| 项 | 文件/动作 | 验收 |
| --- | --- | --- |
| Android Keystore attestation 桥 | `mobile_ffi/` + `did/document.cheng` | 无 attestation 不能 strong class；真机 smoke |
| 吊销 head 锚定 | `did/resolver.cheng` + registry | 吊销后 didauth 拒绝；通道 head 传播 smoke |
| M-of-N 恢复 | `did/credential.cheng` | 阈值重签 document；负例 hard-fail |
| Erlay v0 | `protocols/pubsub/erlay.cheng`（新） | 订单簿场景带宽降 ≥50%（仿真 + twoproc） |
| 喷泉 mesh | `moq_fountain.cheng` + gossipsub publish 路径 | 大对象冗余度 ≤1.2×（仿真计量） |
| episub choking | `episub/episub.cheng` | Plumtree eager/lazy；断树修复 smoke |
| 签名 peer 目录 | registry + `bootstrap_gossip` | 冷启动无 peer 时从目录获 relay |

### Wave 3 — 开放网络 + 经济 + 移动

| 项 | 文件/动作 | 验收 |
| --- | --- | --- |
| DID+质押 DHT | 替换线性 kad | disjoint paths；eclipse 仿真 PASS |
| relay 计量/RWAD | DePIN 经济模型 | 转发字节签名回执；结算 smoke |
| 移动信箱 | relay store-and-forward | Doze 后 push 拉取；E2E 加密 |
| CDC + blake3 流式验证 | 包分发 | 增量更新只传差异块 |
| Wire schema 单一事实源 | `docs/cheng-libp2p-wire-schema.cheng`（const 模块） | 双端 writer 语义 diff gate |

---

## 4 验收门禁矩阵

### 4.1 必须进 host-smoke 默认（Wave 完成后）

| Smoke | 测什么 |
| --- | --- |
| `net_sim_smoke` | 仿真器确定性 + partition invariant |
| `libp2p_quic_twoproc_smoke` | 真双端 NAT 后连通 + relay 升级 |
| `libp2p_didauth_attestation_smoke` | 硬件 attestation 正负例 |
| `libp2p_bootstrap_trusted_smoke` | 无签名 announce 丢弃 |
| `libp2p_erlay_smoke` | 集合调和带宽合同 |
| `libp2p_fountain_mesh_smoke` | 大对象冗余度 ≤1.2× |
| 现有媒体链 smoke | 保持 PASS（零回归） |

### 4.2 stage23 libp2p gate 扩展

在 `seed_stage23_libp2p_gate.cheng` 追加 Wave 1+ smoke；production regression 同步。

### 4.3 仿真器合同（所有 Wave 的前置）

```
SEEDS=200 tools/net_sim_gate.sh
  → 每 seed：100 节点、30% churn、3 种 NAT
  → 断言：无 duplicate delivery、无 orphan CID、引导收敛时间上界、广播冗余度上界
  → 任一 DIVERGE hard-fail
```

---

## 5 与生态蓝图的关系

| 生态线 | libp2p 角色 | 本方案对应 Wave |
| --- | --- | --- |
| 包管理（`cheng_pkg`） | bitswap → CID 验证字节流；registry 通道 head | Wave 2 数据面 + Wave 1 引导 |
| 去中心化计算/存储 | DHT 寻址、远程执行回执传输 | Wave 3 DHT |
| DePIN | gossipsub 订单簿 + Erlay；带宽测速 | Wave 2 Erlay + Wave 3 经济 |
| UniMaker 媒体秒开 | MoQ 段流 + Fountain + delivery receipt | 已有；Wave 2 喷泉 mesh 扩展 |
| RWAD 结算 | relay/存储/计算计量回执 | Wave 3 |

---

## 6 Non-goals

- 引入 iroh/go-libp2p/rust-libp2p 外部库（违背纯 Cheng 自举）
- 与外部 libp2p/IPFS 节点 wire 互通（确认不互通则 multistream 可断）
- 全功能 libp2p 兼容（WebSocket/Tor/mobilehw 等边缘传输）
- 在 Wave 0 仿真器完成前改 relay/Erlay/喷泉/DHT 主链（Let it crash）
- 认证特征模板出设备（`localOnly=false` 永远拒绝）

---

## 7 最小可复跑命令（现状基线）

```sh
# host-smoke 媒体+MoQ 链（现状应 PASS）
artifacts/backend_driver/cheng run-host-smokes libp2p_moq_segment_stream_smoke
artifacts/backend_driver/cheng run-host-smokes moq_fountain_strict_fec_smoke

# stage23 libp2p gate（QUIC/TCP/WebRTC）
# 见 seed_stage23_libp2p_gate.cheng 编排

# bootstrap 策略检查
grep requireTrustedPublisher src/libp2p/discovery/bootstrap_gossip.cheng
```

Wave 0 完成后追加：

```sh
SEEDS=200 tools/net_sim_gate.sh
```

---

## 8 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-06-11 | 初版：传输收敛 + 设备认证 DID + 引导/广播分流 + 十章配套 + 分期门禁 |
