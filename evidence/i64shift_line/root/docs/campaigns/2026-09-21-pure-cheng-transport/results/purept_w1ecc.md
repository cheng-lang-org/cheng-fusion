# purept_w1ecc.md — W1-ECC/KDF 纯 Cheng 密码向量验证（2026-09-21）

判词：**绿（判据驱动=冻结 stage3）**。X25519 / Ed25519 / HKDF-SHA256 / SHA-2+HMAC-SHA256 全部 RFC/NIST 官方向量逐字节通过（56 PASS / 0 FAIL / 1 项按任务书豁免并登记），负例全部按预期拒绝，同驱动复跑逐字节确定。**跨驱动代际一致判据当代不可完成**（非向量红，是当代编译器对共享 crypto stdlib 的 typed-IR 合同漂移，详见 §4）。

## 0. 驱动与判活

- 代际 A（判据载体，冻结件）：`artifacts/bootstrap/cheng.stage3`，sha256 `05af823e7db0c8ea1a69cbd01eda84fcd4b8ff8049d38178663fd357d840f276`。金丝雀 `src/tests/ordinary_zero_exit_fixture.cheng` → compile_rc=0 / unresolved=0 / run_rc=0。配方与 W6 同源：`system-link-exec --root:<repo> --emit:exe --target:arm64-apple-darwin --out:<绝对路径>`。
- 代际 B（当代 `./cheng`，sha256 `a979322bfe90f6910d170c12644f8356c3200ba6b246d0d951481c7373bab44b`）：exe 路径 SIGILL（rc=132，primary object 已出、链接前死，与 W6 判死一致）；obj+cc 链金丝雀 rc=0，但四个向量驱动的 import 闭包全部被 typed-IR 合同门挡（§4）。
- 向量来源纪律：RFC 7748/8032/5869/4231 均 curl rfc-editor.org 原文逐字转录硬编码（无 LLM 转述层）；SHA-2 的 64/112/128 字节边界期望值由本机 shasum(Digest::SHA) 交叉生成，""/abc/56B 与 FIPS 180-4 公布值核对一致。曾纠正一处记忆错误：RFC 5869 §A.3 是 SHA-256 零长 salt/info（SHA-1 案例是 A.4，任务书 §A.1-A.3 全 SHA-256 无误）。

## 1. 判定矩阵（stage3 实跑）

| 族 | 驱动文件 | 向量 | 判定 |
| --- | --- | --- | --- |
| X25519 (RFC 7748) | src/tests/purept_w1ecc_x25519.cheng | §5.2 标量乘 2 条；§6.1 DH（A公/B公/双向 shared）；iterated 1 轮、1000 轮 | 8/8 PASS；**1,000,000 轮按任务书豁免未跑（已登记）** |
| Ed25519 (RFC 8032 §7.1) | src/tests/purept_w1ecc_ed25519.cheng | TEST 1（空消息）/TEST 2（1B 0x72）/TEST 3（2B af82）/TEST SHA(abc)（64B=SHA-512(abc)），各做 seed→公钥推导+签名逐字节+验签；负例×3 类（翻 sig 1 bit、错消息、翻 pub 1 bit）必须拒绝 | 22/22 PASS（含 9 负例全拒）；SHA(abc) 消息由本库 sha512 现算并与 RFC 常量对拍，跨族互锁 |
| HKDF-SHA256 (RFC 5869) | src/tests/purept_w1ecc_hkdf.cheng | A.1 / A.2 / A.3，PRK+OKM 逐字节（A.3 走零长 salt/info 路径） | 6/6 PASS |
| SHA-256/384/512 + HMAC-SHA256 | src/tests/purept_w1ecc_sha2.cheng | 每算法 ×{"", abc, 56B, 64B(块界), 112B, 128B}；HMAC-SHA256 RFC 4231 TC1/TC2 | 20/20 PASS |
| 合计 | 4 驱动 | | **56 PASS / 0 FAIL / 1 SKIP（登记）** |

ed25519 同驱动复跑两轮输出 diff 为空（DETERMINISM_OK）。四驱动与源哈希绑定见 `w1_ecc_evidence/drivers_and_sources.sha256`。

## 2. 过程中的红与最小修法（已闭环）

1. **`src/std/crypto/sha384.cheng:273`（本族文件，最小 diff 单列）**：当代编译器 `cheng_seed` 门拒 `let bitLenHigh: uint64 = 0`（redundant explicit default init）。修法=删 `= 0` 一行字面（零值默认语义不变）：
   ```diff
   -    let bitLenHigh: uint64 = 0
   +    let bitLenHigh: uint64
   ```
   修后 sha2/hkdf 全向量重跑绿（该编辑被向量门本身验证）。
2. **测试侧两次编译红（stage3 所有权语义，如实登记，非 crypto 缺陷）**：① `let kp: KeyPair = Value(kpRes)` 对托管聚合的 plain copy 被冷层拒 → 改用 fcert_epoch_smoke 已验证口径（inferred let + `.ok`/`.value` 字段访问）；② `kp.value.publicKey.data` 传给**拥有形参**的用户函数触发同款拒绝（lessons.md「borrow 视图字段禁止 move 进 owned」实例）→ expect helper 形参改 `@borrows`，borrowed str 进数组字面量的连带红改 `+` 拼接。均为测试写法迁移，被测 crypto 源零改动。

## 3. 未修也修不了的部分（如实）

无向量级红。唯一未闭合判据=跨代际一致，原因在下节，属编译器/他族文件，不在本任务所有片面内，未动。

## 4. 当代驱动编译边界（给 kernel lane + W1a 的输入）

当代 `./cheng`（`--emit:obj --require-pure` 口径）对本战役四个驱动统一 hard-fail：`direct object plan not ready: primary_object_body_semantics_missing`，根因逐驱动取证为 `not_ready_reason=typed_ir_contract … reason=invalid_whole_call_head`：
- `src/std/crypto/chacha20poly1305.cheng:49 chachaU32`（x25519/ed25519 闭包，经 std/crypto/rand 引入）
- `src/std/crypto/sha256.cheng:167 LoadU32LE`（sha2 闭包）
- `src/std/crypto/sha1.cheng:9 sha1U32`（hkdf 闭包）

三处同为「return 整表达式内含调用头」的合法表面形被新 typed-IR 合同拒——按工程规范属 primary/backend realizer 侧 residual，不得业务层改写规避；W1a（aesgcm+chacha）与 sha2/hkdf 族在同形清单内。当代驱动修好该合同前，跨代际逐字节对拍只能以「当代 obj 路金丝雀 rc=0 + crypto 闭包不可达」为界。回执：`w1_ecc_evidence/genb_x25519.{log,report}`。

## 5. 证据目录

`docs/campaigns/2026-09-21-pure-cheng-transport/results/w1_ecc_evidence/`：sha2.txt / hkdf.txt / x25519.txt / ed25519_run1.txt / ed25519_run2.txt（+DETERMINISM_OK）/ drivers_and_sources.sha256 / genb_x25519.log / genb_x25519.report / x25519.report。运行器 `.scratch/purept_w1ecc/run_w1ecc_final.sh`（经 tools/cheng_scratch_scope.sh 执行，产物随 scope 销毁，证据先拷入 results）。主树未 commit。
