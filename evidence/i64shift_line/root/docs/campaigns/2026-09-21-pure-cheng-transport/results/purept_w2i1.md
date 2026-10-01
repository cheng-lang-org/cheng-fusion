# purept_w2i1.md — W2 首片（i1）：TLS 1.3 密钥调度 + transcript + 握手消息编解码

判词：**绿**。RFC 8448 §3（Simple 1-RTT Handshake）全程向量逐字段对拍通过：94 项检查 0 失败，
双驱动（当代源载具 + 冻结 stage3）编译与运行均 rc=0，`unresolved_symbol_count=0`。

## 1. 交付物（全部新文件，零改动既有文件）

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `src/quic/pure/tls13_keyschedule.cheng` | 136 | HKDF-Expand-Label / Derive-Secret（RFC 8446 §7.1 HkdfLabel 线格式）、tls13Extract、early/handshake/master 三级链、c/s hs+ap traffic、exp master、res master、resumption、traffic key+iv（TLS_AES_128_GCM_SHA256）、finished key + verify_data |
| `src/quic/pure/tls13_transcript.cheng` | 104 | 消息重放缓冲（双槽 0=client/1=server 链，倍增扩容）+ Transcript-Hash = Hash(replay buffer)，槽位后缀式 API（Append0/1、Hash0/1、Reset0/1、Bytes0/1） |
| `src/quic/pure/tls13_messages.cheng` | 878 | ClientHello/ServerHello/EncryptedExtensions/Certificate/CertificateVerify/Finished 结构化编解码（最小字段集：suite=0x1301、group=x25519、sig=ed25519；未知扩展忽略、坏 length 精确拒）+ 确定性 builder + 模块内 roundtrip |
| `src/tests/purept_w2i1_tls13_rfc8448.cheng` | 476 | 驱动：RFC 8448 §3 向量硬编码 + A/T/B/C/D/E 六段判定 |

原语只 import 使用（std/crypto/hkdf、std/crypto/sha256、std/crypto/curve25519、
cheng/libp2p/crypto/ed25519），零修改。与并行 W3a（frames_*）文件名面前缀互斥。

## 2. RFC 8448 判定矩阵

| RFC 8448 位置 | 内容 | 本地检查 | 判定 |
| --- | --- | --- | --- |
| §2/§3 x25519 私钥对 | client/server ephemeral | A1/A2：ECDHE 双向 = `8bd4054f…` | PASS |
| §3 transcript hash | CH‖SH / …CV / …SFin / …CFin | T1–T5（+槽位独立窗 T2、reset 重放 T5） | PASS |
| §3 early secret | Extract(0,0) | B1 | PASS |
| §3 derived (handshake) | Derive-Secret(early,"derived","") | B2 | PASS |
| §3 handshake secret | Extract(derived_hs, ECDHE) | B3 | PASS |
| §3 c/s hs traffic | Derive-Secret(hs,…,CH‖SH) | B4/B5 | PASS |
| §3 derived (master) + master secret | Extract(derived_m,0) | B6/B7 | PASS |
| §3 hs traffic keys | server/client key+iv | B8/B9 | PASS |
| §3 finished key + Finished | server/client | B10/B11/B17/B18（verify_data 逐字节） | PASS |
| §3 ap/exp secrets | c/s ap + exp master（transcript 过 ServerFinished） | B12–B14 | PASS |
| §3 ap traffic keys | server/client key+iv | B15/B16 | PASS |
| §3 res master + resumption | res master + ExpandLabel("resumption",0000) | B19/B20 | PASS |
| §3 消息字段 | CH random/sni/suites/groups/sigalgs/key_share/version；SH random/cipher/key_share；EE groups；Cert DER(432B)；CV scheme+sig(128B)；双 Finished verify_data | C1–C7（27 项） | PASS |
| §3（自构扩展） | encode→decode→encode 字节恒等 22 条（CH×7/SH×3/EE×3/Cert×4/CV×2/Fin×3） | D01–D22 | PASS |
| ed25519 接线 | RFC 8032 TEST1 官方向量 + CV content（§4.4.3 context）自签自验+篡改拒 | D23/D24 | PASS |
| 负例 | 头 length 不符/截断/kind 错配/空 verify_data/篡改 verify_data 拒同/cert_list 溢出/奇数 suites len | E1–E7 | PASS |

合计 **94 PASS / 0 FAIL**，驱动退出码 0。

## 3. 方法与证据

- 向量获取：RFC 8448 原文（rfc-editor.org）脚本化抽取（按 `{step}` 分块 + 字段标签，
  消除页眉/跨页干扰），**先以 Python 独立参考实现复算整条链（FAILS:0）后才硬编码进驱动**；
  过程中抓到并修正一处抽取向量核对脚本自身的 HkdfLabel 结构错误（info 含 uint16 长度头）。
- 驱动判活：repo 根 `./cheng` 的 backend_driver 桥面缺失（`missing bridge surface stage root`，
  疑他线在途）→ 按配方改用 `artifacts/bootstrap/cheng.stage3` 金丝雀判活绿；后按 lessons
  「新工作用当代源载具」以 HEAD 冷源（`bootstrap/cheng_cold.c` @ ac41af29e，sha256 前 20 位
  `7d073931b80722b4099a`）自建本线载具 `CHENG_TASK_TMPDIR/w2i1_vehicle/cheng_cold_w2i1`
  （sha256 前 20 位 `1298c4f85b4fe23f084e`），最终判定以它出具；stage3 交叉复跑同 94/0。
- 构建产物均在 `tools/cheng_scratch_scope.sh` 作用域内随命令退出销毁；无 commit；共享树零改动
  （`git status` 仅新增本线文件；探针临时件已清理）。

## 4. 编译器代际契约（本片实测沉淀，W2 后续片直接复用）

以 25 行探针逐条实锤（非推测），最终代码全程规避：

1. 含托管字段（Bytes/str/seq）的结构体：**构造器按值返回+局部拷贝被拒**
   （`plain local copy requires an address-free value object`）；跨模块传值同拒。
   合法形态 = 模块状态槽 + 访问器（handshake13 先例）。
2. **托管值不得经 var 形参写字段**（`plain field take lacks exact owned source`）——
   全局字段直写在宿主函数内联完成。
3. **托管调用结果不得直接作 plain Bytes/str 形参实参**（`plain local copy`，fn=main 实证）；
   先绑定命名局部再传。str 经 Fmt→WriteLine 不受限。
4. **全局托管值同语句既作实参又作赋值目标被拒**（aliasing）——先落临时再赋值。
5. **ToBytes 借用结果只能喂 @borrows 形参**（handshake13 `msquicTls13BytesOwnedCopy` 先例）；
   plain 形参吃借用局部被拒。
6. **BytesBuilder 局部变量本代不可用**（全树零先例）；用 GrowByteBuffer + ToBytes→owned 拷贝。
7. **HkdfLabel 结构**（RFC 8446 §7.1）：`uint16 length ‖ len8("tls13 "+Label) ‖ label ‖ len8(ctx) ‖ ctx`
   整块作为 HKDF-Expand 的 info——首尾字段漏一双字节长度头即全链偏移。
8. RFC 8448 §3EE 尾部有 4 字节空扩展（0000/0000），解码器按「未知扩展忽略」自然吸收。
9. libp2p ed25519 为双约定制：**epoch-0（legacy -B）与 epoch-1（RFC 8032 标准）**；
   跨传输用 RFC 8032 语义时必须走 `signEd25519RawEpoch/verifyEd25519Epoch(…,1)` 系。

## 5. 已知边界（如实）

- Certificate 解码上限 4 条目、列表类上限 16 项（超出部分忽略）——最小字段集口径，
  后续片按需放宽。
- EE/CH 的未知扩展不保留原始字节，故 RFC 8448 原始 EE/Cert 不做整帧恒等（仅字段级对拍）；
  自构消息 22 条恒等全绿。
- 密码原语的 RFC 向量族验证归 W1 线；本片仅消费（ECDHE/ed25519 官方向量已在判定矩阵内）。
