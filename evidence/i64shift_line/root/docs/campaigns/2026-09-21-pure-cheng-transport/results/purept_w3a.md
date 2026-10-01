# W3a：QUIC 帧编解码 + varint + 包头形式（RFC 9000 线上格式层，纯 Cheng）

结论先行：**四判据全绿（a/b/c/d），当代 ./cheng 驱动全程判活，rc=0**。
纯新写代码落地 `src/quic/pure/frames_varint.cheng`（varint）、`frames_codec.cheng`（帧编解码最小集）、`frames_header.cheng`（包头形式+包号编码）共 937 行，零依赖既有 QUIC/C 桥；驱动 4 个共 1187 行，对既有文件零改动（`git status` 内本任务足迹全部为 `??` 新增）。红=自产 bug 自修，其中判据 (a) 的 A.3 服务端样例包当场抓出 ACK Range Count 语义实现错误（详见「红绿记录」）。

## 交付面

| 文件 | 行数 | sha256（前8） |
|---|---|---|
| src/quic/pure/frames_varint.cheng | 144 | 99f52642 |
| src/quic/pure/frames_codec.cheng | 416 | ca245a17 |
| src/quic/pure/frames_header.cheng | 377 | db238919 |
| src/tests/purept_w3a_varint.cheng | 146 | 8292e36c |
| src/tests/purept_w3a_frames.cheng | 492 | 4062d510 |
| src/tests/purept_w3a_headers.cheng | 283 | cfb4773d |
| src/tests/purept_w3a_livecap.cheng | 266 | dcd802bb |

另有判活夹具 `src/tests/purept_w3a_liveness.cheng`（5 行）。同目录 W2 的 `tls13_*.cheng` 系并行 lane 所有权，全程未触碰。未 commit。

## 判据

### a. RFC 样例逐字段对拍——过
- RFC 9000 §16/§A.1 varint 样例：0xc2197c5eff14e88c→151288809941952652、0x9d7f3e7d→494878333、0x7bbd→15293、0x25→37、非最小 0x4025→37，全过。
- 注：任务书所写「§A.1 样例包」在 RFC 9000 中实为 varint 解码样例；样例**包**在 RFC 9001 Appendix A（A.2/A.3/A.5），已按其原文对拍：
  - A.2 客户端 Initial 头 `c300000001088394c8f03e5157080000449e00000002`：type=Initial、ver=1、DCID=8394c8f03e515708、SCID 空、tokenLen=0、Length=1182、pnLen=4、pn=2——逐字段 PASS；
  - A.2 载荷 1162B = CRYPTO(off=0,len=241) + 917×PADDING，逐帧走查消耗恰 1162 PASS；
  - A.3 服务端 Initial 头 `c10000000100 08f067a5502a4262b5 00 4075 0001`：pnLen=2、Length=117、pn=1 PASS；载荷 99B = ACK(0,0,range=0) + CRYPTO(0,90) PASS；
  - A.5 短头 `42 00bff4 01`：spin=0/keyPhase=0/pnLen=3(明文位)/pn=0xbff4/载荷 PING PASS。

### b. 往返 ≥50——过（76/76 + 32 头往返）
- 76 轮 encode→decode→encode：**字节恒等 76/76**，字段恒等逐帧比对（ACK largest/delay/count/firstRange/ECN 三计数、CRYPTO offset/len、STREAM id/offset/len/OFF-LEN-FIN 位、NCID seq/retire/cidLen、CLOSE code/frameType/reasonLen），11 种帧形覆盖位掩码 0x7ff 全命中（含 NCID、CONNECTION_CLOSE 运输/应用两种、ACK 带/不带 ECN、STREAM LEN=0 末帧形）。
- Initial 头 encode→parse→re-encode：4 种 CID 长 × 2 种 token 长 × 4 种 pnLen = **32/32 字节恒等**。

### c. 负例 ≥10——过（24 条全精确拒）
- varint：截断 ×4（2/4/8 字节各缺尾+空串）、非最小 Frame Type 拒（0x4025=FRAME_ENCODING_ERROR 语义）、合法最小 0x25 放行、>2^62 编码拒（-1）＝7 条。
- 帧：空载荷截断(-1)、CRYPTO 越界(-5)、STREAM LEN 越界(-5)、未知类型 0x2a(-2=FRAME_ENCODING_ERROR)、非最小帧类型 varint(-3)、NCID cidLen=21(-4)、NCID cidLen=0(-4)、NCID retire>seq(-5)、ACK 追加 range 截断(-1)、CLOSE reason 越界(-5)、NCID token 截断(-1)＝12 条。
- 头：短头 fixed=0(-2)、长头 fixed=0(-2)、DCID 长 21(-4)、token 越界(包级契约-1)、Length 越出缓冲(包级契约-1)、VN 版本表非 4 字节对齐(-5)、短头 PN 前截断(-1)、Retry 显式拒(-6，完整校验归 W3b 包保护)＝8 条。
- 错误码精确区分：-1 截断 / -2 未知类型 / -3 非最小帧类型 / -4 字段越界 / -5 结构非法 / -6 Retry 归属 W3b。

### d. 与现网对拍——过（用在案抓包；帧级载荷明示归属 W3b）
- 现场新抓不可行：lo0 BPF 需 root，`sudo -n` 无免密授权（tcpdump "Permission to capture denied" 实录）；按任务书「抓包文件若在案」改用**本战役 W5 lane 当日归档的现役 msquic 抓包** `harness/artifacts/msquic_layer2/layer2_en0.pcap`（2137 包，en0，T_PUBLISH/T_SERVE 会话回执同目录：`l2_fetch_r1/r2.txt` fetch_rc=0、`bytes=582340 written=582340`）。
- 纯 Cheng 驱动解析 pcap（Ethernet/IPv4/UDP 剥封 → Length 字段联合包走查 → 逐包头形式判定），与 W5 独立记录对拍全中：**records=2137、Initial 客户端 6/服务端 2、Handshake 14（2c/12s 两向飞行）、1-RTT 1056c/1059s（与 W5 逐字一致）、VN=0、Retry=0**；首客户端 DCID=0000000022222232 与 W5 记录前缀逐字一致；8/8 Initial 的 Length 字段消耗==UDP 载荷长（联合包走查对现网 msquic 字节成立）；全部长头 version=1、token 全 0；2115 个 1-RTT 以对端 Initial SCID 学得的 DCID 长度全解析成功（walkErr=0/shortErr=0）。
- 如实标注：Initial/Handshake/1-RTT 的**载荷帧序列在抓包中是 AEAD 密文**，明文帧解码需包保护密钥，属 W3b（packet_*.cheng）判据；本判据在头形式层闭合，T_PUBLISH/T_SERVE 语义经同目录会话回执（fetch_rc=0/bytes=582340）与 pcap 同轮绑定。

## 红绿记录（红=自产 bug 自修）
1. **ACK Range Count 语义错（真 bug，判据 a 抓出）**：首版实现把 Range Count 当「含 First ACK Range 的总数」且要求 ≥1；RFC 9000 §19.3.1 与 A.3 服务端样例（count=0 且有一个 range）证明它只计**追加** (Gap,RangeLen) 对。修 decode/encode/注释，A.2/A.3 样例与 76 轮往返复验绿。
2. varint 档位边界期望值写错（64→期望 0x4000 等，实为 0x4040/0x7fff/0x80004000）——测试侧错误，修正后与 RFC §16 档位表一致。
3. 工程坑（入 lessons 语义的实证）：托管形参跨多次调用必须逐层 `@borrows` 闭合；`result.Value` 于 `Result[Bytes]` 是托管字段平拷（`plain local copy requires an address-free value object`）→ 用 `BytesTake(bytesRes.value)` 移交所有权；`buf = BytesConcat(buf, pads)` 自赋值移动被拒 → 改 builder 追加；`le16/le32` 无 `@borrows` 即默认 MOVE 吃掉实参（教训 §10 同族）；同路径 `--out` 复用会拿到陈旧二进制，每轮换新 out 名。

## 驱动判活
当代 repo 根 `./cheng` 全程判活：夹具 `src/tests/purept_w3a_liveness.cheng` 编译 16.6s、运行 rc=0 输出 "alive"（与 W6/W1 窗口的「当代驱动判死、冻结 stage3」不同窗，本轮证据全部绑定当代驱动产物）。编译一律经 `tools/cheng_scratch_scope.sh`（无裸 /tmp、无 heredoc 落盘脚本、无 stash/checkout/reset、未 commit）。

## 判据绑定输出原文
四驱动最终轮全文（逐字，含 rc）落盘于本目录：
- `purept_w3a_evidence_varint.txt`（33 PASS / 0 FAIL / RESULT: PASS，rc=0，sha256=68b6df69…）
- `purept_w3a_evidence_frames.txt`（RESULT: PASS，rc=0，sha256=946d9f92…；正文：A.2/A.3 两条对拍 + round_trips 76/76 + kind_coverage 11/11 + negatives 12 条 + RESULT）
- `purept_w3a_evidence_headers.txt`（10 PASS / 0 FAIL / RESULT: PASS，rc=0，sha256=1ccf38b8…；含 a2/a3 头、A.5 短头、pn_encode_size_a2、pn_full_size、pn_decode_a3、vn_roundtrip、initial_roundtrips 32/32、negatives 8 条）
- `purept_w3a_evidence_livecap.txt`（8 PASS / 0 FAIL / RESULT: PASS，rc=0，sha256=dec3a1f3…；counts 行逐字：`records=2137 initial=6c/2 hs=14 1rtt=1056c/1059 vn=0`）

关键行摘录（livecap）：
```
PASS counts: records=2137 initial=6c/2 hs=14 1rtt=1056c/1059 vn=0
PASS first_client_dcid: 0000000022222232
PASS initial_length_walk: 8/8 Initial datagrams: Length field consumed == UDP payload
W3A-LIVECAP RESULT: PASS
```

## 遗留与移交
- 帧级载荷解码（现网密文）＝W3b 包保护落地后的互操作判据；本模块接口已留位（`QuicHeader.byte0`/`pnOff` 原样暴露受保护位，`QuicHeaderPnRead` 供 HP 移除后复读，`QuicHeaderParsePacket` 供数据报联合包走查）。
- W4 可靠拥塞可直接消费 `QuicFrameDecodeAt/QuicFrameAppend`（ACK 追加 range 以 varint 原语生成，见 frames_codec.cheng 模块头注）。
