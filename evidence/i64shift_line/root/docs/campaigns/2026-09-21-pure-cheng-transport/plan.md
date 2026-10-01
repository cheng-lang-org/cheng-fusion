# 纯 Cheng 传输战役（Pure-Cheng QUIC/TLS Transport）开发计划

结论先行：**可行，且地基比预期厚**。TLS 1.3 全套密码原语已在 `src/libp2p/crypto/` 纯 Cheng 存在（aesgcm/chacha20poly1305/curve25519/ed25519 ref10/hkdf/sha256-384-512/minasn1/rand，零 @importc）；缺的是 TLS 1.3 握手状态机与 QUIC 线上实现（RFC8446/RFC9000 的编码、包保护、可靠与拥塞层）。本战役把这些补齐，用纯 Cheng 后端替换 msquic/openssl 桥，总量级 **2-3 个月（单线）／约 6 周（双线并行）**，且现有跨机回归资产（rega/dor_pub/dor_dual 全套脚本+双真机）直接复用为验收场。

## 0. 目标与判据

- 目标：`src/quic` 增加纯 Cheng 后端（quictransport 接口已在，libp2p 协议族零改动切换），最终 msquic/openssl 降级为对照后端。
- 总判据：现有跨机矩阵全绿（rega A 3/3、dor_pub B 2/2、dor_dual C 双腿）跑在纯 Cheng 后端上；吞吐/时延对 msquic 后端同窗对照达到性能门（**X 待你定，建议首旗 ≥70%**）。
- 边界（如实）：侧信道防护（常数时间）按"政企内网威胁模型不含物理近场侧信道"设计，文档明示；不做 0-RTT、不做连接迁移（后续里程碑可选）。

## 1. 资产盘点（已核实）

| 资产 | 状态 |
|---|---|
| TLS 原语 | aesgcm/chacha20poly1305/hkdf/sha256-384-512/curve25519/ed25519 ref10/minasn1/rand 全在 src/libp2p/crypto（纯 Cheng） |
| libp2p 协议族 | host/dial/crypto/connmanager/gater/discovery/cas 全 .cheng，零 C |
| 传输接口 | quictransport 共享状态机层已在（msquic/openssl 是它的两个桥后端） |
| 黄金参照 | msquic 桥保留=双实现对拍参照；openssl s_client/s_server=TLS 互通参照 |
| 验收场 | 跨机回归脚本链+双真机（鸿蒙 1000071/安卓）+水温门/看门狗护栏全在 |
| 性能底牌 | crypto-hw 识别器（AES 1x/4x、SHA serial64、GHASH 靶点量化）可运行时化 |

## 2. 里程碑

**M0 家底审计+向量验证（3-5 天）**
libp2p/crypto 全族对 RFC 官方向量：AES-GCM（NIST）、X25519（RFC7748）、Ed25519（RFC8032）、HKDF（RFC5869）、SHA-2（FIPS）。判据：全向量逐字节过+跨驱动代际（stage3/当代）结果一致；产出缺口清单（缺什么补什么，不预写）。

**M1 TLS 1.3 引擎（2-3 周）**
握手状态机（client/server、单 RTT）、handshake 消息编解码、key schedule（HKDF-Expand-Label 链）、transcript hash、CertificateVerify（host key Ed25519 自签，免 X.509 PKI）。套件最小集：TLS_AES_128_GCM_SHA256 一套先行（ChaCha20 备选）。判据：与 openssl s_client/s_server 互通（黄金参照）+双 Cheng 端互通。

**M2 QUIC 线上实现（3-4 周）**
Initial 密钥推导、header protection、AEAD 包保护、retry、version negotiation；帧编解码最小集（crypto/stream/ack/flow-control/ping/ncid）。判据：与 msquic 桥互操作对拍（现有桥=参照实现，双实现对拍是最硬的验收）。

**M3 可靠与拥塞（2-3 周）**
ACK 生成/处理、RTO+RACK 丢失恢复、newreno 先行（cubic 二阶）、流控。判据：netem 丢包注入下吞吐/时延曲线 vs msquic 后端同窗对照（同窗口相对比较口径，沿用内存门纪律）。

**M4 接线与切换（1 周）**
quictransport 注册 pure-cheng 后端；libp2p 零改动；双真机全量回归（run_all_rega 一键）。判据：跨机矩阵全绿+三端（darwin/android/ohos）产物哈希绑定。

**M5 性能（1-2 周）**
AES-NI/SHA-NI 运行时化（crypto-hw 识别器移植）、GHASH 批量化。判据：性能门 X%（吞吐/首帧时延双指标 vs msquic 同窗对照）。

**M6 清退与发布（数日）**
msquic/openssl 降级对照后端；发布证据链（源码/编译器/驱动三哈希绑定，按发布证据纪律）。

## 3. 风险与依赖（如实）

1. **性能是头号风险**：纯 Cheng 对 C 的常数差距在 AEAD/哈希热路径上已被 crypto-hw 战役量化（GHASH 6 靶点在案）；M5 的硬件加速路径是主解，且吃 kernel lane 编译器改进——**依赖当代驱动可用性与编译器性能路线**。
2. **互通验收的参照质量**：msquic 桥既是被替换者又是参照，双实现对拍发现分歧时以 RFC 条文+openssl 侧仲裁。
3. **侧信道**：纯 Cheng 实现的常数时间性不做硬承诺（威胁模型内网化），文档与发布证据明示。
4. **共享树纪律**：本战役改动面 src/quic+src/libp2p/crypto 为 quic lane 热区，按"捎带别回退"铁律+改完即 commit 执行。

## 4. 组织

战役目录 `docs/campaigns/2026-09-21-pure-cheng-transport/`（本文件为 plan.md；开工后按规划层补 task_plan.md/progress.md/findings.md）；OpenSpec 提案走 propose→你确认→apply。

## 5. 待你定夺的三件事

1. 性能门 X%（建议首旗吞吐 ≥msquic 后端 70%、首帧时延不劣于 1.5×，M5 复核）。
2. 签名/身份方案：host key Ed25519 自签（免 PKI，libp2p 原生语义，建议）vs 要 X.509（+2 周量级）。
3. 排期档位：单线 2-3 个月 vs 双线并行约 6 周（M1/M2 可拆两条线）。

## 6. 正交任务矩阵（子代理并行版，2026-09-21 增补）

正交性=文件所有权互斥（新文件为主）+判据资产互斥；驱动与双真机是共享资源，排队计入墙钟。

| # | 任务 | 所有权（独占文件面） | 依赖 | 判据 | 墙钟 |
|---|---|---|---|---|---|
| W1a-d | 密码向量验证×4 族（aesgcm+chacha／curve25519+ed25519／hkdf+sha2／rand+asn1） | src/libp2p/crypto 各族文件+src/tests 新向量件 | 无，日 1 即跑 | RFC 向量逐字节过 | 1-2 天（最大族决定） |
| W5 | 互操作参照台（python/sh 差分台：pure vs msquic vs openssl 三方对拍+流量采集） | .scratch/ptt/ 测试资产 | 无，日 1 即跑 | 三方对拍台自检绿 | 3-5 天 |
| W6 | quictransport 后端接口审计+注册骨架 | src/quic/quictransport.cheng（独占窗） | 无 | 骨架编译绿+接口冻结 | 2-3 天 |
| W2 | TLS 1.3 引擎（握手状态机/key schedule/transcript/CertVerify） | src/quic/pure/tls13_*.cheng（新文件） | 弱依赖 W1（原语现成，W1 并行验证） | openssl s_client/s_server 互通+双 Cheng 端互通 | 2-3 周 |
| W3a | QUIC 帧编解码+varint+包头形式 | src/quic/pure/frames_*.cheng | 无，日 1-2 即跑 | 编码单元全过+与 msquic 抓包字节对拍 | 1-1.5 周 |
| W3b | QUIC 包保护（initial 密钥/header protection/AEAD 包层/retry/vn） | src/quic/pure/packet_*.cheng | W2 key schedule | 与 msquic 桥互操作对拍 | 1.5-2 周（接 W2 尾） |
| W4 | 可靠与拥塞（ACK/RTO+RACK/newreno/流控） | src/quic/pure/recovery_*.cheng | W3a | netem 注入 vs msquic 同窗对照 | 2 周（W3a 落地即插） |
| W7 | 性能地基（AES-NI/SHA-NI 运行时化+GHASH 批量） | src/libp2p/crypto 热路径+识别器接线 | 无（早启） | crypto-hw 识别器全过+微基线 | 1-2 周 |
| W8 | 接线+双真机全量回归+性能门+清退 | 接线点+发布证据 | W2/W3b/W4/W5/W7 全齐 | 跨机矩阵一键全绿+性能门 X% | 1.5 周 |

**关键路径**：W2(2-3 周) → W3b(2 周) → 收敛对拍(1-1.5 周) → W8(1.5 周) ≈ **6 周墙钟**；W1/W3a/W4/W5/W6/W7 全部藏在关键路径的影子里。
**两个真实瓶颈**：①W2 TLS 引擎与集成收敛（纯工作量，无法再并行压缩）；②共享编译驱动与双真机排队（6-8 代理并发时编译循环串行化——缓解=冻结 stage3/knife 分窗+任务书里绑定各自驱动）。**最快 6 周的失效条件**：W1 挖出原语真 bug（返工 W2 起点）、对拍分歧深挖（RFC 仲裁成本）、kernel lane 驱动不可用窗。
