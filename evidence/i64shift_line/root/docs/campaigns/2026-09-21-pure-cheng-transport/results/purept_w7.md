# purept_w7.md — W7 性能基线+算法层热路径调优（纯 Cheng，禁 C 桥）

判词：**绿（基线五算法齐 + 调优一刀落地 + W1 全部向量复跑 72/72 全过 + A/B 配对提升如实报）**。
判据驱动=冻结 stage3（05af823e…）；根 `./cheng`（a979322b…）金丝雀两连 SIGILL（rc=132×2）
判死与 W6/W1 同判，按任务书切冻结 stage3。调优刀 = 纯 Cheng 算法级（零 @importc/零 C 桥），
改动面 `src/std/crypto/{aes,aesgcm}.cheng` 最小 hunk（**注**：任务书 写 src/libp2p/crypto，
但该目录同名件是零逻辑 shim，真身全在 std/crypto——W1 已在案；本刀实际落点即热路径真身），
diff 冻结于 `w7_evidence/w7_tuning_cut.diff`（aes.cheng 7326f6da…、aesgcm.cheng af40496d…，
主树未 commit）。

## 0. 驱动判活与金丝雀（先行）

| 代际 | 判定 |
|---|---|
| 根 `./cheng` a979322b… | 金丝雀编译 rc=132（SIGILL）×2（重试一次仍死），判死 |
| 冻结 stage3 05af823e… | 金丝雀 2/2（two_line+ordinary）bake=0/run=0，判活，为本役判据驱动 |

配方：`system-link-exec --in:<src> --emit:exe --target:arm64-apple-darwin`，全程经
`tools/cheng_scratch_scope.sh`（产物随 scope 销毁）。每轮改动后金丝雀先行再判读。

## 1. 微基线（HEAD 源，窗口 W0，3 次背靠背，11 轮取中位）

驱动 `src/tests/purept_w7_bench_micro.cheng`（37025967…，独占新文件；上波取消遗留的
purept_w7_bench.cheng 骨架已重写替代并删除——其 aesGcmEncryptRaw 误传 16B keyBytes 作
roundKeys 的 bug 已修）。驱动内含正确性预检：GCM seal→open 往返逐字节、X25519 RFC 7748
§6.1 共享密钥逐字节，任何一轮 fail 即退出非零（四轮 A/B 全部 all_ok）。

| bench | ns/op（中位） | 吞吐 | 备注 |
|---|---|---|---|
| aead128_seal_16k | 2.58 ms | 6.2-7.6 MB/s | |
| aead128_open_16k | 2.48 ms | 6.2-7.9 MB/s | 每 op 含一次 16KiB memcpy（校准线：7.9µs） |
| aead128_seal_1280 | 2.54 ms | ~0.50 MB/s | **与 16KiB 同价——每 op 固定成本 ~95%** |
| aead128_open_1280 | 2.52 ms | ~0.51 MB/s | |
| sha256_16k | 313 µs | ~52 MB/s | |
| sha256_1280 | 38.9 µs | 30-34 MB/s | |
| hkdf_sha256 | 156 µs/op | 5.9-6.4k ops/s | |
| x25519_dh | 5.9 ms/op | 161-170 ops/s | |
| ed25519_sign | 7.66 ms/op | 126-141 ops/s | |
| ed25519_verify | 14.2 ms/op | 64-73 ops/s | |

关键信号：seal_16k ≈ seal_1280（13× 数据同价）⇒ AES-GCM 每 op 固定成本占绝对大头。
热点归因（读实现+计时旁证）：① 每 op 重建 S-box/Te 常量表（2×256 次 gf256Pow(254) 幂）；
② H=AES_K(0) 与 E(j0) 走 hw-seam，在 --emit:exe 上 BL 进 gf256Pow 逐字节标量体；
③ bulk CTR 本身走 4 块 hw seam（stage3 识别器活，硬件 AESE，快）；④ GHASH 16 表已存在
（8fdfd6589 在案）但每 op 重建。X25519/Ed25519 已是 ref10 形态，慢在域乘法代码生成（归编译器 lane）。

## 2. C 参照上下文（非判据仅定位；OpenSSL 3.0.17，C 库+硬件指令口径，同机）

| 项 | C 参照 | 纯 Cheng 基线 | 差距 |
|---|---|---|---|
| AES-128-GCM 16KiB | 3.45 GB/s | 6.2-7.6 MB/s | ~480× |
| SHA-256 16KiB | 1.71 GB/s | ~52 MB/s | ~33× |
| X25519 DH | 229 µs | 5.9 ms | ~26× |
| Ed25519 sign/verify | 195/586 µs | 7.7/14.2 ms | ~40×/~24× |

## 3. 调优一刀（已落地，位等价）

1. **S-box 字面量化**（aes.cheng）：FIPS-197 常量表改为字面量 hex；换刀前先用探针驱动
   （purept_w7_probe_tables.cheng）把 **Cheng 现算表**与 **python 独立转录的 FIPS-197 表**
   逐字节对拍（S-box 256/256 全中 + Te 采样行全中，证据 w7_evidence/w7_sbox_literal_python_gen.txt），
   再换字面量。aesBuildTeTables 改由字面量 S-box 派生（消除另 256 次 gf256Pow）。
2. **GCM 的 H/E(j0) 改 T-table 内核**（aesgcm.cheng）：新增模块内 `gcmAesBlockTTableInto`
   （复用 aesEncryptBlockTTable），EncryptRaw/DecryptRaw 四处位等价替换；hw seam 本体与
   契约（j0 不被污染、fresh out、Bytes 配平）保持。

**放行门（调优后）**：金丝雀 2/2 + W1 全部 5 驱动复跑 = **16+8+22+6+20 = 72 PASS / 0 FAIL**
（AES-128/256-GCM 官方向量、X25519 RFC7748、Ed25519 RFC8032 含负例全拒、HKDF RFC5869、
SHA-2/HMAC）；证据 `w7_evidence/final_*.out/.bake.log`。

**提升倍数（同窗 A/B 交替配对，各 4+4 对；校准线=未触碰的 sha256_16k/x25519/ed25519）**：

- 16KiB 流：AEAD 原始配对中位 **~1.3×**（seal 1.30-1.40，open 1.29-1.56；Round1 16/16 对全>1）；
  按校准线归一化窗口漂移后净提升 **~1.1-1.25×**。
- 1280B 包：原始 ~1.1×；归一化后 **~0.9-1.05×——噪声地板内，如实报不显著**。
- 机器全程 load avg 116-144（kernel lane 烤炉+GUI×4+模拟器），绝对数与倍数都以配对+
  校准口径为准；跨窗绝对值不可比（memcpy 校准线两窗差 1.35-1.75× 实证）。
- 配对明细：`w7_evidence/ab_pairs_summary.md`。

**负结果（如实，已还原）**：删除 AES-128 64B 四块 hw-seam 拦截层、bulk 全走 T-table 的
扩展刀被配对证伪——在 stage3 判据驱动上 seal16k 回退 1.7-2.8×（A/B 0.36-0.59）。
**stage3 的 kind-2 识别器在 exe 上是活的（bulk=硬件 AESE）**；aesgcm 旧注释"0 AESE words"
是**当代**编译器口径，两代行为漂移误导了热点判断。已用冻结 diff 哈希校验还原
（af40496d）。快路径上的 bulk 无需再动，归 M5 识别器接线复核。

## 4. 边界与给编译器/kernel lane 的清单（如实）

1. **当代 `./cheng` SIGILL 判死**（rc=132×2，primary object 后链接前死）：当代驱动不可用，
   性能工作被锁死在 08-31 冻结 stage3。需要：修复当代根 SIGILL。
2. **两代 kind-2 识别器行为漂移**（stage3 exe 活 / 当代 exe 不触发）：需要 realizer 对齐，
   否则 crypto-hw 识别器运行时化（M5）没有稳定的编译器侧承接面。
3. **每 op 剩余固定成本大头**（本刀后）：GHASH 16 表每 op 重建（~4KB×34 seq 分配+4224 项
   递推；key 相关，需 prepared-key/表缓存接口——涉 API 形态，超"一刀"面，挂账下一刀）；
   每 op ~10+ 次 Bytes 分配——需要栈分配/逃逸分析；常量字面量只能走 managed str+运行时
   hex 解析——需要只读数据段常量支持。
4. **SHA-256 hw seam（serial64）在 stage3 exe 未触发**（基线 1.2µs/块 ≈ 标量体特征，
   vs C 37ns/块，33×）：SHA 批量化（走 Sha256CompressBlockReuse 零分配形态）是下一把
   算法刀的候选，与 #2 的识别器确认并行。
5. X25519/Ed25519（ref10 形态正确）慢 24-40×=域运算代码生成上限：需要 64×64→128 位乘法
   与进位链的有效 lowering；算法层无可再省。

## 5. 证据清单（docs/campaigns/2026-09-21-pure-cheng-transport/results/w7_evidence/）

- `w7_tuning_cut.diff`：最终调优刀冻结 diff（147 行，与树逐一哈希对应）。
- `pre_cut_sources.sha256` / `final_sources.sha256`：改前/改后源+驱动哈希绑定。
- `w7_sbox_literal_python_gen.txt`：FIPS-197 S-box 独立转录件（与 Cheng 现算 256/256 对拍）。
- `ab_pairs_summary.md`：两轮 A/B 配对全量数据+归一化结论+负结果登记。
- `final_canary_*.log`、`final_purept_w1*_*.out/.bake.log`：最终门 72/72 回执。
- 驱动：`src/tests/purept_w7_bench_micro.cheng`（基线+AB 两用）、
  `src/tests/purept_w7_probe_tables.cheng`（表对拍探针，保留作字面量出处证据）。
- 主树改动未 commit（共享树纪律）：`src/std/crypto/aes.cheng`、`src/std/crypto/aesgcm.cheng`。
