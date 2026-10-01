# W3b：QUIC 包保护层（RFC 9001，纯 Cheng）——Initial 密钥 / header protection / AEAD 载荷 / VN/Retry 形态 / 1-RTT 接口

结论先行：**判据 a/b/c/d 全绿 rc=0，当代 repo 根 ./cheng 全程判活**。黄金判据（真保护包解密）以 **21/21 条真实受保护 Initial 包**闭合：真 pcap 取 DCID→派生密钥→去 hp→AEAD 解密→W3a 帧编解码走查，跨实现互通（对端=生产 QUIC 栈 aioquic 1.2.0）。两个重要发现：①**在案 layer2_en0.pcap 不是受保护的 msquic 流量**——Initial 载荷是明文帧（可直接读出 ClientHello/SNI "localhost"、测试 DCID 0000000022222232），系本仓测试栈流量，W3a/W5 将其定性为"msquic 桥抓包"需更正；②**std/crypto/aesgcm 在当代 ./cheng --emit:exe 路径上，AES-128-GCM CTR 从第 2 个 64 字节组起 keystream 错误**（W1 的 NIST 向量全部 ≤4 块故未暴露；对照 cryptography 参考实现首个差异在字节 64）。既有文件零改动纪律下，packet_protect 内以「单块 AES-ECB（hp mask 同源、已被向量验证）+ std GHASH 表内核」组合出精确 GCM 绕开该缺陷路径，修复归 std 层（建议 W5/编译器线复核 4 块 hw seam 在当代驱动的行为——与 W7 报告的"stage3 上 4 块 seam 删除是回退"相互印证）。

## 交付面（全为新文件，既有文件零改动，git status 足迹全 ??，未 commit）

| 文件 | 行数 | sha256（前8） |
|---|---|---|
| src/quic/pure/packet_keys.cheng | 139 | 7c946868 |
| src/quic/pure/packet_protect.cheng | 507 | 5305b961 |
| src/tests/purept_w3b_vectors.cheng | 291 | （证据绑定） |
| src/tests/purept_w3b_roundtrip.cheng | 372 | （证据绑定） |
| src/tests/purept_w3b_livecap.cheng | 253 | （证据绑定） |

新增代码 1562 行。W3a 地基哈希复核未动：frames_varint=99f52642、frames_codec=ca245a17、frames_header=db238919。新增证据件：results/purept_w3b_evidence_{liveness,vectors,roundtrip,livecap}.txt + harness/artifacts/quic_public/{aioquic_udp443_tee.pcap, PROVENANCE.txt}（pcap sha256=07826d1c…）。

## 判据

### a. RFC 9001 App A 样例逐字段对拍——过（78 PASS / 0 FAIL，rc=0）
- A.1：五条 HKDF-Expand-Label 线格式（client in/server in/quic key/quic iv/quic hp）逐字节；initial_secret、client/server secret、双侧 key/iv/hp 共 13 项全对。
- A.2（client Initial）：hp mask（sample d1b1c9…→437b9aec36）；**protect 输出与 RFC 公布的 1200 字节受保护包逐字节相等**；unprotect→pn=2、payload 1162B=CRYPTO(0,241)+917×PADDING、帧走查精确耗尽。
- A.3（server Initial）：mask 2ec0d8356a；**protect==公布包逐字节**；unprotect→pn=1、payload 99B、ACK(0,0,0,0)+CRYPTO(0,90) 起始字节=0x02（ServerHello）。
- A.4（Retry）：§17.2.5 线格式解析（QuicRetryParse：DCID/token/16B tag 三段切分，A.4 包 dcid 空、token=14B）；完整性校验按任务书留接口（QuicRetryIntegrityVerify 恒返 -60，不静默通过）。
- A.5（ChaCha 形）：secret→key/iv/hp(32)/ku 四项派生；nonce=iv⊕pn（654360564→e0459b3474bdd0e46d417eb0）；ChaCha hp mask（counter/nonce 取自 sample 本身，5.4.4）=aefefe7d03；掩码应用→4cfe4189。（ChaCha AEAD 全包不在 AES 判据面，未组装。）

### b. 黄金判据：真实保护包解密——过（21/21，rc=0，≥3 的要求以 7 倍满足）
- **在案 pcap 勘误**：layer2_en0.pcap 的 Initial 载荷为明文帧（可直读 CRYPTO/ClientHello/"localhost"），非 RFC 9001 保护流量，不能作解密判据；该发现以永久负例固化（roundtrip 驱动 d_layer2_plaintext：该真实包在 RFC 密钥下必须 -10 精确拒）。
- 替代采集：真根 BPF 不可用（/dev/bpf0 root:wheel 700、sudo -n 无免密，与 W3a 同判），改用 socket 边界 tee 抓取**真实生产 QUIC 栈（aioquic 1.2.0）发往公网 443 端口的真实 UDP 报文**（沙箱 UDP 出口被墙、握手未完成，故全部为 client 方向 Initial 空间重传与 CONNECTION_CLOSE——真实线字节，PROVENANCE.txt 全记录，sha256 绑定）。参考实现（python cryptography 独立算密钥+解密）21/21 复核一致。
- 纯 Cheng 链路判据全过：21/21 Initial 全部在各自 DCID 派生密钥下 unprotect 成功（3 连接、PN 逐连接严格递增、最大 pn=6）；帧走查逐包精确耗尽载荷；18 条 ClientHello 飞行（CRYPTO offset=0、长 476B、首字节 0x01，如 010001d8030317f5…）+3 条 CONNECTION_CLOSE 帧全部精确解出。

### c. 保护自环——过（36 例 ≥20，59 PASS 总体 / 0 FAIL）
- Initial 形 16 例（pnLen 1..4 × token 空/3B × DCID/SCID {8/8, 20/空}）+ 1-RTT 短头 16 例（dcidLen {0,7,14,20} × pnLen 1..4，keyPhase 交替）+ 截断窗口边界 4 例（0x7fff/0x8000/0x10000/0xffffffff，pnLen 按 §17.1 编码器规则取）。
- 每例断言：pn 重建、byte0、headerLen、payloadLen、载荷字节恒等、**re-protect 字节恒等**（AES-GCM 确定性）。

### d. 负例精确拒——过（14 条全中预期码）
- 坏 ciphertext/tag/pn/header 字节 ×4 → -10；错侧密钥/错 DCID 密钥 → -10；坏 hp key → -10；样本过短 → -12；保护侧载荷不足/ pnLen=5 → 拒；非 QUIC 缓冲 → -2；Retry 输入 → -6；Length 超长 → -1；layer2 明文真实包 → -10。

### 附加：1-RTT 包保护接口（RFC 8448 ap 密钥）
- RFC 8448 §3 server/client application traffic secret → QuicKeysFromSecret(16/12/16)，派生确定性对拍 + 短头自环 3 例（keyPhase 0/1、pnLen 2/3/4）。跨线集成（与 W2 TLS 引擎对接取真实 ap secret）留下一片。

## 驱动判活
当代 repo 根 ./cheng 全程判活：purept_w3a_liveness 夹具 compile rc=0 / run rc=0 输出 "alive"（证据 results/purept_w3b_evidence_liveness.txt）；全部驱动经 tools/cheng_scratch_scope.sh 之外的绝对路径 .scratch/purept_w3b 出料、每轮新 --out 名（无裸 /tmp、无 heredoc 落盘脚本、无 stash/checkout/reset、未 commit）。注：本窗 ./cheng 判活与 W1/W6/W7 窗的"当代判死→冻结 stage3"不同窗。

## 关键发现与边界（如实）
1. **std/crypto/aesgcm 疑似缺陷（需 std/编译器线复核）**：AES-128（rounds==10）CTR 的 4 块 hw 路径在当代 --emit:exe 驱动上，第二组（字节 64..128）起 keystream 错误（对照 cryptography 参考；<64B 与 T-table 尾路径精确，A.3 99B 包因"首组+尾路径"恰好全对）。本役既有文件零改动，故 packet_protect 内自组精确 GCM（单块 AES-ECB × CTR + std GHASH 表内核，RFC 9001 A.2/A.3 全包逐字节过）。性能债务归 M5。
2. **layer2_en0.pcap 定性更正**：见判据 b。W3a 判据 d 的"msquic 桥抓包"与 W5 README 的"msquic layer2 腿"表述需相应更正为"cheng 测试栈抓包（未保护）"。
3. **QuicPacketProtect 需调用方给全量 pn**（本役自抓自修的真 bug）：nonce=iv⊕全量 pn（§5.3），包头只有截断编码，protect 不能从包头读——A.2/A.3 类小 pn 向量对此盲区，窗口边界自环案例当场抓住。
4. Retry 完整性校验（§5.7）留接口 -60，按任务书不实现；VN 复用 frames_header 格式解析（版本表视图+计数）。
5. 1-RTT 跨线集成（真实 TLS ap secret 灌入、密钥更新 ku、HNSD/态重置）未在本片范围。
