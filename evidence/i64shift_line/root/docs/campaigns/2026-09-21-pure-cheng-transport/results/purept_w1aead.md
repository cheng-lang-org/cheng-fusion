# W1-AEAD：AES-GCM / ChaCha20-Poly1305 RFC 官方向量验证（纯 Cheng 传输战役）

结论先行：**全绿（16/16 判定 PASS，rc=0）**——8 条 AES-128/256-GCM 官方向量 + 4 条 RFC 8439 ChaCha20/Poly1305 向量逐字节过（encrypt ct+tag 字节相等 + decrypt 往返相等），4 条边界负例（错 tag/错 aad/截断 ct×2）全部正确拒绝。判据驱动=冻结 stage3。跨代际运行级一致当代不可闭合：当代根 `./cheng` SIGILL 判死（与 W6/W1-ECC 同判），当代 kernel-lane 刀 kd_c1_a/kd_c1_b 判活过但编译拒 crypto 族源码（ZRPC 公开裸指针门禁，详见 §4），按纪律未硬绕、登记 residual。

## 0. 一个引用更正（先查证再断言）

任务书判据 1 引 "RFC 8439 §5.1/§5.2 测试向量"——**RFC 8439 不含任何 AES-GCM 向量**（其 §5 是 ChaCha20-Poly1305 AEAD 构造；全文 grep 无 `0388dace`/`58e2fcce`）。AES-GCM 官方 key/iv/pt/aad/ct/tag 全套 hex 的权威源是 NIST 宿主的 GCM spec（McGrew-Viega, `proposedmodes/gcm/gcm-spec.pdf`）Appendix B。本验证取 **2008-09-21 Wayback 快照的原版 PDF**（sha256=3b1d7e66…，见 evidence/），机器解析 18 个 Test Case 后选 96-bit IV 子集 8 条（AES-128=TC1-4、AES-256=TC13-16；AES-192 组与变长 IV GHASH 组不适用：实现只支持 128/256 密钥+12B nonce，属实现边界如实登记）。**全部 16 条向量在烧入驱动前先经本机独立 oracle（python cryptography 44.0.3 / OpenSSL 3.0.17）复核转录 16/16 一致**——判定是 Cheng 实现给的，oracle 只钉死"抄写无误"。

## 1. 判定矩阵（判据驱动：冻结 stage3，sha256=05af823e…）

驱动：`src/tests/purept_w1aead_vectors.cheng`（sha256=d84560e6…，向量 hex 硬编码，独占新文件）。

| 判定 | 向量 | 来源 | 内容 | 结果 |
|---|---|---|---|---|
| PASS | gcm_tc1 | GCM spec App B TC1 | AES-128，零 key/IV，空 pt，无 AAD（tag=58e2fcce…455a） | enc tag 相等 + dec 往返 |
| PASS | gcm_tc2 | GCM spec App B TC2 | AES-128，零 key/IV，pt=0^16 | ct+tag 逐字节 + 往返 |
| PASS | gcm_tc3 | GCM spec App B TC3 | AES-128，key=feffe992…，IV=cafebabe…888，pt=64B | ct+tag 逐字节 + 往返 |
| PASS | gcm_tc4 | GCM spec App B TC4 | 同 key/IV，pt=60B + AAD=feedface…ad2(20B) | ct+tag 逐字节 + 往返 |
| PASS | gcm_tc13 | GCM spec App B TC13 | AES-256，零 key/IV，空 pt | tag 相等 + 往返 |
| PASS | gcm_tc14 | GCM spec App B TC14 | AES-256，零 key/IV，pt=0^16 | ct+tag 逐字节 + 往返 |
| PASS | gcm_tc15 | GCM spec App B TC15 | AES-256，key=feffe992…×2，pt=64B | ct+tag 逐字节 + 往返 |
| PASS | gcm_tc16 | GCM spec App B TC16 | 同 key，pt=60B + AAD 20B | ct+tag 逐字节 + 往返 |
| PASS | chacha_242 | RFC 8439 §2.4.2 | ChaCha20 加密（counter=1，sunscreen 114B） | ct 逐字节 + 往返 |
| PASS | poly_252 | RFC 8439 §2.5.2 | Poly1305 MAC（"Cryptographic Forum Research Group"） | tag=a8061dc1…27a9 逐字节 |
| PASS | polykey_262 | RFC 8439 §2.6.2 | Poly1305 keygen（block counter=0，RFC 只给 32B，比对前 32B） | out 逐字节 |
| PASS | aead_282 | RFC 8439 §2.8.2 | AEAD_CHACHA20_POLY1305（AAD 12B，pt 114B） | ct+tag 逐字节 + 往返 |
| PASS(拒) | neg_gcm_wrongtag | TC2 派生 | tag[0]^=0x01 → aesGcmDecrypt 必须 Err | 拒绝 |
| PASS(拒) | neg_chacha_wrongaad | §2.8.2 派生 | aad[11]^=0x01 → decrypt 必须 Err | 拒绝 |
| PASS(拒) | neg_chacha_truncct | §2.8.2 派生 | ct 114→113 + 原 tag → 必须 Err | 拒绝 |
| PASS(拒) | neg_gcm_truncct | TC4 派生 | ct 60→59 + 原 tag → 必须 Err | 拒绝 |

运行回执（3 次运行字节级相同，rc=0）：

```
W1AEAD-BEGIN purept_w1aead_vectors
W1AEAD gcm_tc1 PASS
W1AEAD gcm_tc2 PASS
W1AEAD gcm_tc3 PASS
W1AEAD gcm_tc4 PASS
W1AEAD gcm_tc13 PASS
W1AEAD gcm_tc14 PASS
W1AEAD gcm_tc15 PASS
W1AEAD gcm_tc16 PASS
W1AEAD chacha_242 PASS
W1AEAD poly_252 PASS
W1AEAD polykey_262 PASS
W1AEAD aead_282 PASS
W1AEAD neg_gcm_wrongtag PASS (rejected)
W1AEAD neg_chacha_wrongaad PASS (rejected)
W1AEAD neg_chacha_truncct PASS (rejected)
W1AEAD neg_gcm_truncct PASS (rejected)
W1AEAD-END ALL GREEN
```

被测实现：`src/std/crypto/{aes,aesgcm,chacha20poly1305}.cheng`（src/libp2p/crypto 同名件是零逻辑 shim，`import std/crypto/*` 转发；真实现全在 std，零 @importc）。**crypto 族源码本任务零改动**（git status：仅 sha384.cheng 一处修改，属 W1-KDF lane 所有，见其 progress 行）。

## 2. 跨驱动代际（判据 4）

| 代际 | 身份/哈希 | 金丝雀（两行 main） | 本驱动 | 判定 |
|---|---|---|---|---|
| 冻结 stage3（判据驱动） | `artifacts/bootstrap/cheng.stage3` 05af823e… | compile 0 / run 0 | compile 0 / **16/16 PASS**，rc=0 | **绿** |
| 当代根 `./cheng` | `cheng` a979322b…（7/16 产物） | **compile rc=132（SIGILL），零日志**，只落 672B `*.primary.o` | 不可达 | 判死（W6/W1-ECC 同判，在案） |
| 当代 kernel 刀 kd_c1_a / kd_c1_b（9/21，c1knife_line） | kd_c1_a 7a1e8871… | compile 0 / run 0（判活过） | **compile rc=2 拒绝**：`ZRPC_PUBLIC_RAW_POINTER_TYPE_FORBIDDEN span=275-276`，即 `src/std/crypto/aesgcm.cheng` 的公开裸指针别名 `AesGcmU64Ptr = uint64 *`（A/B 双刀同拒） | 门禁代差 residual（见 §4） |

确定性证据：stage3 同 exe 复跑 3 次输出字节相同；独立二次编译（exe 哈希不同：841e4b5e / 6e35b572，内嵌路径信息所致）运行输出再次字节相同（cross-compile run identical）。**运行级跨代一致当代不可闭合的根因是当代代际编译面残差（下节），不是向量分歧**——与 W1-ECC 登记的 `invalid_whole_call_head` residual 同族不同形，本族新增形状如下。

## 3. 新增编译器 residual 登记（阶段诊断，未动共享源码）

1. **当代代际 ZRPC 门禁 vs crypto 族**：`ZRPC_PUBLIC_RAW_POINTER_TYPE_FORBIDDEN` 打在 `src/std/crypto/aesgcm.cheng` 的 `AesGcmU32Ptr = uint32 *` / `AesGcmU64Ptr = uint64 *`（模块头"原生词访问别名"）。冻结 stage3 无此门禁。归后端 realizer/门禁线：要么门禁豁免既有 std 形状，要么 crypto 族做指针别名迁移——**超出本任务改动面（共享热区），未动**。
2. **托管聚合字段直读（stage3 亦患病，本轮实证）**：`tag.data` 这类"var 出参填写的托管结构体字段"按值直读 → `plain local copy requires an address-free value object (depth=2)`，与 let/var 无关。生产代码同款注记在 `src/quic/tls/handshake13.cheng:3602-3605`（"plain local copies of aggregate fields are not address-free"）。工作法=先 `var v: Bytes = BytesSlice(x.data, 0, BytesLen(x.data))` 重建局部视图再读（本驱动全程该形，编译+运行绿）。建议入 lessons.md。
3. **`BytesCopyInto` 越界 fail-stop 行为正确**：源长于目标即 `range overflow` 终止（NEG-3 初版踩中，属驱动侧 bug，边界代码按设计咬人——正面记录）。

## 4. 实现边界（如实）

- AES-GCM 仅 96-bit IV、128/256 密钥（12B/其余 nonce 显式 Err）；GCM spec 的 AES-192 组与变长 IV（8B/60B，GHASH IV 路径）组未跑——TLS 1.3/QUIC 用例不需要，按 M0 "缺口清单"登记为**不适用**而非 FAIL。
- RFC 8439 §2.6.2 原文只给 64B block 的前 32B（Poly1305 一次性密钥），驱动按 32B 比对。

## 5. 证据清单（results/w1_aead_evidence/）

- `logs/stage3_run1.log` / `run2.log` / `recompile_run.log`：三次全绿回执（字节相同）。
- `logs/kd_c1a_compile_reject.log`：当代刀 ZRPC 拒绝原文（kd_c1_b 同文）。
- `logs/root_cheng_sigill_compile.log`：当代根驱动 SIGILL 空日志。
- `w1aead_s3.report.txt`：stage3 编译回执。
- `rfc8439.txt`（sha256=25bef70f…，rfc-editor.org 原文）、`gcm-spec.pdf`（sha256=3b1d7e66…，csrc.nist.gov 2008-09-21 Wayback 原版快照）——向量转录底稿。
- oracle 复核：python cryptography 44.0.3（AES-GCM 8/8、ChaCha20/Poly1305/AEAD 4/4 转录一致，执行于烤驱动之前）。
- 哈希绑定：驱动 d84560e6…；stage3 05af823e…；根 ./cheng a979322b…；kd_c1_a 7a1e8871…；exe 841e4b5e…/6e35b572…。均未 commit（共享树纪律，待复核）。
