# purept_w6_audit.md — quictransport 后端接口审计 + 纯 Cheng 后端注册骨架（W6，2026-09-21）

判词：**骨架落地（+46/-3，单文件 src/quic/quictransport.cheng），金丝雀 2/2 rc=0、骨架单文件烤制过全部语义检查至 link（HEAD 同烤语义检查即红——该文件在 HEAD 即编译死角，本役恢复可编译）、msquic 层 1 环回 1 轮绿**。审计结论一句话：**所谓"后端抽象面"不是显式接口，是约定俗成——真实接缝是 pipe token 身份检查 + native_runtime 全局单例；openssl_quic 是名不副实的别名（内部同一个 msquic 引擎）；"零改动切后端"今天并不成立，dial/switch/host/工具面有四条 msquic 直连旁路，M4 必须按本审计 §4 的形状接线。**

## 1. 分派面全图（谁在哪调谁）

地址 kind（src/quic/multiaddress.cheng:26-29）：`msquic=1 / quic=2 / quicTls=3`。

| 调用方 | 位置 | 认领/分派 |
| --- | --- | --- |
| dial.cheng supports/dial | src/libp2p/dial.cheng:106-116、180-222 | **顺序即优先级**：raw MsQuic（handles 收 kind 1..3）→ OpenSslQuic（kind3）→ QuicTransport 适配器（kind2）。raw msquic 在册时**吞掉全部 quic 地址，两个适配器不可达** |
| switch 注册 | src/libp2p/switch.cheng:659-663 | initSwitchInto **同时注册** addQuicTransport + addOpenSslQuicTransport + addMsQuicTransport → 走 dial 时永远命中 raw msquic |
| switch listen 分派 | switch.cheng:86-95、237-260、301-326、381-425、458-500 | listenKindForAddress 文本判型，优先序 MsQuic(4) > OpenSslQuic(6) > Quic(3)；listenAccept/listenDial 按 lt.kind 分派到各 transport 对象 |
| host 侧 | src/libp2p/host/host_quic.cheng:25、205、354 | **绕过适配器**直用 `qtransport.InitMsQuicTransport()` + src/libp2p/transports/quic_transport.cheng 的 Libp2pQuic* 助手 |
| 工具面 | ssm1_moq_{serve,fetch}、ssm1q_loopback_export(.android)、ssm1q_{client,fetch_file}_probe、sv_libp2p_* 等 | **绕过适配器**直接 import msquictransport_native + native_runtime（bind → pump → 扫 AppRecvAvailable 形态） |
| 数据面 | src/quic/connection.cheng:268-297 | pipeWrite/Read/ShutdownWrite/Close **只认 `msquicNativeIsPipeIdx(token)`**——token 数值区间就是后端身份，无 backend tag |
| openssl_quic.cheng | 全文 35 行 | 内部就是 `msquic.MsQuicTransport`，全转发；kind3 vs kind2 **只是路由标签，不是第二实现** |
| 死拷贝 | src/libp2p/quic/{quictransport,msquictransport,openssl_quic}.cheng | **零 importer**（chalf 两处真身在 src/quic/）；M6 清退时删除，勿"修"拷贝 |

MsQuicTransport 真引擎 = native_runtime.cheng（6922 行：UDP 数据路径 + QUIC 状态机 + TLS13 + 泵 + 全局表）。

## 2. 后端操作集（M2-M3 纯 Cheng 后端必须实现的完整面）

**控制面**（quictransport 适配器 + dial/switch 消费，src/quic/msquictransport_native.cheng）：
1. `InitMsQuicTransport(/Into)` — 构造（含 settings/tlsPolicy 默认值）
2. `handles(addr)` — 地址认领门（纯后端应认领 kind2；kind3 是否兼收 = M4 决策点）
3. `start(addr)` / `StartWithSettingsPolicy` / `StartWithDefaultSettingsPolicy(Ref)` — listener 启动（bind+listen，产出 listenerId + boundAddr）
4. `Stop` — listener 停机
5. `accept` / `AcceptTimed` / `AcceptGlobalTimed` — 入连受理（阻塞/限时；返回后端签发的半环 Connection）
6. `dial(addr)`（= `MsQuicTransportDial`）— 出连接，**阻塞至握手完成**（内含 PumpHandshakeBlocking）
7. `dropMsQuicPendingByPipe(handle)` / `dropMsQuicConnectionsByPipe(handle)` — 按管拆除（dial 失败回滚用，dial.cheng:222）
8. settings get/set + `validateMsQuicSettings`；tlsPolicy get/set（serverName/allowInsecure/clientCert 开关/revocation/certChain×4/certPrivateKey/trustRoot×4/alpn×2 —— 纯后端 M1 只需 Ed25519 自签子集，字段先收下）

**数据面**（connection.cheng 消费，经 pipe token 分派）：
9. `pipeWrite(handle, side, streamId, data)` / `pipeRead(...)` / `pipeReadNonblocking(...)`
10. `pipeShutdownWrite(...)` / `pipeClose(handle)`
11. `MsQuicNativeReadableAppStreamId(handle, side, minStreamId)`
12. `DatagramWrite(handle, side, data)` / `DatagramRead(handle, side)`（受 settings.allowDatagram / maxDatagram 门）

**引擎面**（工具面直接消费、适配器接口未显式命名——纯后端必须以显式形态提供）：
13. 事件泵家族：`msquicNativePump(count)` / `PumpSideBlocking` / `PumpHandshakeBlocking` / `PumpDatapath(id, recvSide)` / `PumpRetransmit`
14. 读就绪/消费/FIN：`AppRecvAvailable`（全局键）与 `AppRecvAvailableAt(sessionSlot,…)`（F-J 形，见 §5）、`AppRecvConsume`、`AppRecvPeerClosed`
15. 流控 credit 滚动重公告（`msquicNativeAdvanceRecvCredit`，MAX_DATA/MAX_STREAM_DATA）
16. 重传/丢失恢复定时器（泵内）
17. 地址查询：`ClientBoundAddr` / `ListenerBoundAddr` / `PeerDialAddr`
18. 全引擎锁 `MsQuicNativeTransportLock`（纯后端应以 per-endpoint 锁或无锁结构替代，不做全局大锁）

## 3. msquic 后端"顺手做掉"、接口未显式的语义（纯后端缺省可退化点）

| 语义 | 接口现状 | msquic 实况 | 纯 Cheng 后端缺省（M2/M3 前可退化） |
| --- | --- | --- | --- |
| 0-RTT | settings.allow0Rtt 字段在 | start 各形**硬拒 true**（"msquic: 0-rtt disabled"） | 不做=与现行为一致；接口无需表达 |
| 连接迁移 | 零接口面 | 单 UDP 路径、无迁移 | 不做（plan 边界明示）；接口禁止为它预留隐式状态 |
| 拥塞/丢失恢复 | settings 标量进（initialWindowPackets/initialRttMs/maxAckDelayMs…），行为全内部 | 泵内重传定时 + credit | M3 缺省 newreno+RTO+RACK；settings 字段先收下做映射，不当 0 充数 |
| 流控 | 无显式操作 | 滚动 credit（AdvanceRecvCredit） | M3；初窗 1MiB 语义须对齐 |
| MTU 发现 | settings.minimumMtu/maximumMtu/mtuDiscovery* | DPLPMTUD 顺手 | 缺省固定 initial 1200，不搜索 |
| retry/VN/stateless reset | 无显式操作 | accept 判定（AcceptJudge*）内部 | M2 清单内，对拍 msquic 抓包 |
| idle/keep-alive/disconnect 定时 | settings 字段在 | 引擎定时器 | M2 尾；缺省 idle 关、keep-alive 关=行为可退化 |
| TLS 细节（revocation/CRL/X.509 链） | policy 字段宽 | msquic TLS 全吃 | M1 只做 Ed25519 自签；其余字段收下+显式 Err |
| **事件泵** | **接口根本不命名**；读阻塞变体内部泵、跨进程无人泵即 stall | 调用方驱动泵 | **必须显式**：泵是纯后端一等操作（§5），不许藏进 read |

## 4. M4 接线形状（W6 骨架已定 + 三个旁路注册位）

骨架（已落地，diff 冻结 w6_evidence/w6_quictransport_skeleton.diff，+46/-3）：
- `quicBackendMsquic=0 / quicBackendPureCheng=1`（`const` 块，house 正例=multiaddress.cheng；放 `type` 块会被当 type-alias 拒）；`QuicTransport.backend: int32` 字段（缺省 msquic）
- 注册口：`initQuicTransportWithBackend(backend)` / `setQuicTransportBackend` / `quicTransportBackend` —— M4 的配置通路从这里进
- 分派分支：start/stop/accept/dial 四个操作各带 pureCheng 双臂分支，**stub 期两臂同路 msquic，行为零变化**；`dropQuicPendingByPipe` 以等价自由函数形展开（单路，注释标 M4 填空位，缘由见 §7.2）；`handles` 保持共享且补 `@borrows`（§7.2）

M4 必须直面的三个事实（审计结论，不是骨架能解决的）：
1. **只切适配器切不动流量**：switch 同时注册 raw msquic 且 dial.cheng 先试 raw（§1），dial 路径到适配器的分派被 raw msquic 短路；listen 侧另有 listenKindMsQuic 直连位。M4 = 改三个注册位（dial 注册序 / listenKindForAddress 优先序 / host_quic 直用点），或纯后端实现 MsQuicTransport 全操作集并兼容 token 语义顶替 raw 位。
2. **数据面分派点在 connection.cheng**（共享文件，W6 窗外）：纯后端签发自己的 token 区间后，`msquicNativeIsPipeIdx` 门必须扩为双后端分派——M4 的共享树改动点，提前打招呼。
3. **工具面旁路**：ssm1_moq_*/ssm1q_*/sv_libp2p_* 直接 import native_runtime（§1）。M4 后这些工具要么迁到适配器口，要么 native_runtime 原样保留为 msquic 对照后端的工具面（建议后者：它们就是 M5 对拍的对照组驱动）。

## 5. 两笔已知债的接口预留（读方分形态，从头设计即不继承）

**债 1 — F-J `AppRecvAvailableAt`（v2 报告遗留）**：债根 = 读就绪查询按全局 `(side, streamId)` 键（native_runtime:1428），配合"当前槽"全局 cur，工具面靠裸写 cur + 扫描 bind 定位数据槽（ssm1q_loopback_export.cheng:186 明示根治项未做）。At 形（:1443）已落 native_runtime，但工具面扫描形态还在。
**纯后端接口表达**：无全局 cur 槽、无扫描。`dial/accept` 返回的 Connection 自带 handle（pipeIdx 对应物），一切读操作以 handle 显式键控：`recvReady(handle, streamId) -> int32`、`recv(handle, streamId, count)`、`peerClosed(handle, streamId)`。**接口冻结条款：任何可读性查询禁止出现无 handle 的形态**——扫描定位数据槽这个形态在新接口上无法表达，债无处滋生。

**债 2 — dual-role form 区分（darwin_quic_fix_landing.md §1/§4）**：债根 = 单 UDP socket 服务多形态（listener+client），泵用全局 cur 重绑 + recv 门按形态分支（listener/client 分支 gate、dial 泵每轮重钉 cur=dialSlot），跨机数据晚到时有饿死暴露面，timer/flush 还得豁免收缩。
**纯后端接口表达**：endpoint handle 自带 form 字段 ∈ `{listener, client}`，**一个 handle 一条 UDP socket 一个泵归属**；dual-role = 两个 handle 并存，泵、recv、timer/flush 全部按 handle 显式归属，零分支、零重绑、零豁免表。"读方分形态"从隐式泵内 if 变成 handle 的类型事实——landing §4.1 的"loop-head 单泵 cur=遗留槽"场景在新接口上不存在。

## 6. 验证回执（本轮）

| 判据 | 结果 | 证据 |
| --- | --- | --- |
| 驱动判活 | 根 ./cheng **判死**（烤金丝雀 rc=132，仅吐 .primary.o）→ 冻结 stage3（artifacts/bootstrap/cheng.stage3），stage3 金丝雀活 | §7.1；canary_*.log |
| 金丝雀 rc=0 | two_line bake=0 run=0；ordinary bake=0 run=0（每轮开工重跑） | w6_evidence/canary_*.bake.log、canary_*.out |
| 骨架编译绿 | 骨架**单文件烤制过全部语义检查+代码生成，至 exe link 终点**，唯一未定义符号=_main（无 main 库模块的预期终点）；HEAD 同烤在 borrow 语义检查即红（A/B 定谳）→ 骨架使本文件从编译死角恢复可编译 | w6_evidence/skeleton_standalone.bake.log、skeleton_probe.link.log |
| msquic 回归 1 轮 | 层 1 Mac 环回 @4701：fetch rc=0 + `fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8e…`（判定逐字 landing §2） | w6_evidence/{serve,fetch}_l1_r1.log、w6_sha256.txt、{serve,fetch}.bake.log |
| diff 冻结 | +46/-3；文件 sha256=ca75f991…，diff sha256=cfb57781… | w6_evidence/w6_quictransport_skeleton.diff |

主树不 commit（纪律：留改动待复核）。共享树操作：无 stash/checkout/reset；中间产物走 cheng_scratch_scope 任务域（退出即删），轮脚本开工自校验独占窗文件指纹（哨兵）；端口零接触 4443，环回 4701。

## 7. 如实边界

1. **驱动**：repo 根 ./cheng 判死（bake 即崩 rc=132）；本轮全程冻结 stage3。
2. **编译死角发现（本役最大审计产出之一）**：src/quic/quictransport.cheng 在 **HEAD 即不可编译**——`dial → handles` 的 `borrowed actual cannot bind non-var non-@borrows formal`（A/B：HEAD 版原地同烤同红）。根因链：①HEAD 的 `handles(t: QuicTransport)` 无 `@borrows`，而 msquictransport_native.cheng 同位函数全部有标注；②适配器加 backend 字段后 `t.msquic` 成部分投影，托管记录部分投影只绑 @borrows 形参，无法前送 owned 形参。窗内修复：handles 补 `@borrows`（对齐同文件 house 风格）；`dropQuicPendingByPipe` 改等价自由函数形（callee 的 t 形参实证未用，直调 `dropMsQuicConnectionsByPipe` + 同款 token 门；根治性 1 行=给 msquictransport_native.cheng:381 的 t 形参加 @borrows，**窗外，留 M4**）。famG/repro_main 闭包另报 enum origin conflict、dial_upgrade_cleanup_smoke 闭包含 memorymanager shim 断链——**两闭包 HEAD 同红（A/B 定谳），均预存在，与本骨架无关**，故编译绿判据以单文件烤制到 link 为准（强于 HEAD 状态）。
3. **预存在断链 shim**：src/libp2p/transports/memorymanager.cheng:5 `import std/net/transports/memorymanager` 指向不存在文件（真身 src/std/net/memorymanager.cheng），挡 dial_upgrade_cleanup_smoke / transport_memory_smoke / transport_queue_full_smoke 烤制。修法一行，他人窗口，未动。
4. **独占窗被覆写事件（需协调人仲裁）**：W6 编辑中途，磁盘文件被外部写回**我的中间版本**（含当时独有注释，mtime 不动、篡改检测两次拦截）——AGENTS §10"并发 lane 改动被自己编辑覆盖"的实锤形态。处置：终版重写落盘（sha256=ca75f991…）+ 轮脚本开工哨兵自校验指纹。建议主树 commit 前以本报告哈希复核终版在位。
5. `src/quic/pure/` 目录在 W6 窗内出现（未跟踪，W2/W3a 他线开工产物），本役未触碰。
6. 回归轮数=1（任务书口径）；layer1_formal 原方 2 轮，如需可复跑 w6_round1.sh。
7. src/libp2p/quic/ 三件死拷贝零 importer，本役未动，M6 清退。
