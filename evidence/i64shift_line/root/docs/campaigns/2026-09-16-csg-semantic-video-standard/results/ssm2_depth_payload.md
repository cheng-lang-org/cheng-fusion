# ssm2_depth_payload.md — SSM2 三载荷扩容：深度 DPD1 入容器（2026-09-20）

判词：**绿（Mac 全链 + 安卓真机全链 + serve 腿）**。数据普查完整可扩（DPD1 真载荷源
在盘且 sha256 锚定），SSM2 从双载荷扩为三载荷：
`artifacts/csg_asset_pipeline/huguangsheng/ssm2/hgs_ssm2_d3.ssm2`（**3,533,186B，
sha256=`c074b1edf37e0b40…`**），载荷 [0] `video/mp4` 496,166B（`927b37e6…`）+
[1] `application/x-csg-svblock` 85,960B（`f240fe88…`）+ [2]
`video/x-csg-depth-dpd1` 2,950,740B（`e21ecb3c…`，45 DPD1 chunk = 22.5s）。
既有双载荷容器 `hgs_ssm2.ssm2`（1eb20a17…）零改动，新文件名落地。

## 0. 数据普查表（先普查后动手，全部盘面核实）

| # | 线索 | 盘面实况 | 字节数 | sha256 | 判 |
|---|---|---|---|---|---|
| 1 | DPD1 chunk 流（SSM1 载荷） | `artifacts/csg_asset_pipeline/huguangsheng/pack/stream.ssm1`（官方冻结件，RECEIPT_huguangsheng_stream.md 登记件） | 2,955,365 | `c11e2997bbe7039a…d1d571`（与 RECEIPT/depth_codec.md T-E 冻结记录逐位一致） | **在，锚定** |
| 2 | 同上副本 | `.scratch/fh4/payload/huguangsheng.ssm1`（T-E 报告点名的真载荷） | 2,955,365 | 同上（复算一致） | 在 |
| 3 | 逐帧深度源 | `artifacts/csg_asset_pipeline/huguangsheng/depth/depth_0000{00..44}.npy`（float32 [256,128]）+ `manifest.json`（MiDaS_small，2fps，22.5s，逐帧 min/max/mean）+ `frames/*.png` | 45×131,200 | 经 round(depth×54) 逐位对拍锚定（§3） | **在，锚定** |
| 4 | 打包回执 | `pack/pack_report.json`：input_dir=上项 depth/，depthScale=54（auto），45 chunk 逐条 cid/crc32/offset/startMs，9 关键帧，manifest 区 4,625B | — | — | 在，锚定 |
| 5 | 5bit 第 4 档产物 | `.scratch/fi2/f_loop2/.scratch/depth5_packed.bin`（F-L packed 901,120B + total 933,888B） | 933,888 | `85cfa68cc71ee8d8…`（本次补记；此前无冻结 sha 记录） | 在（scratch 生命周期件，不入容器） |
| 6 | depth 工具 | `src/tools/`（主树）仅 `ssm1_depth_preview.cheng`；`depth_codec.cheng`/`depth_5bit.cheng`/`depth_hz.cheng` + smoke/gate 在 `.scratch/fi2/f_loop2/src/tools|src/tests/`（F-L 克隆） | — | — | 在（与任务稿路径不符，如实记录） |
| 7 | 安卓机残留 | 机上无 DPD1 深度源件（`/data/local/tmp` 无深度流容器）；Mac 侧官方锚定已足 | — | — | 不需要 |

**普查结论：完整可扩**——45 chunk × 500ms = 22.5s 完整 DPD1 流 + 上游 npy 源 +
逐 chunk cid/crc32 冻结回执三重锚定，无缺口。

## 1. 深度载荷冻结（新工具 `tools/ssm2_depth_extract.py`）

SSM1 内嵌形态解析（对齐 `src/game/assets/stream/manifest.cheng` ParseEx 语义，
python 独立实现）→ 45 chunk 全量校验 → 裸 DPD1 流冻结：

- 载荷文件：`artifacts/csg_asset_pipeline/huguangsheng/depth/hgs_depth_dpd1.bin`
  **2,950,740B**（= 45 × (36B DPD1 头 + 128×256×2B 平面)），sha256=`e21ecb3c1000cfef…9615c`
- 逐 chunk 校验全过：magic `DPD1`/ver=1/bits=16/reserved=0/frameIndex==序/
  ptsMs==startMs==i×500/w=128/h=256/scale=54；`payloadCrc32`（CRC-32/IEEE zlib，
  仅覆盖 depth 字节）45/45 过且与 pack_report 逐条一致；容器 chunk cid==sha256(payload)
  45/45 过；载荷区无缝覆盖至 EOF（B 线适配尾部规则）
- **源对拍口径**：npy float32 → `round(depth×54)`（double 域乘积精确 + round-half-even）
  与 DPD1 uint16 平面**逐位 1,474,560/1,474,560 吻合**（float32 域乘法口径仅 1,471,953
  吻合，证明打包器为 double 域舍入，口径如实记录）
- 提取确定性：从官方 SSM1 重复提取 == 冻结件逐字节等（REEXTRACT_BYTE_EQUAL）

## 2. 三载荷容器（`tools/ssm2_pack.py` 零改动复用）

```
pack ok payloads=3 headerLen=320 fileLen=3533186
  sha256=c074b1edf37e0b4065a66f23a8a90bfaaf50e14def1d22d44ab89765b175826a
payload[0] video/mp4                 496166B @320     927b37e6… (v2/base.mp4)
payload[1] application/x-csg-svblock  85960B @496486  f240fe88… (planetrack/hgs_l2_planes.svblock)
payload[2] video/x-csg-depth-dpd1   2950740B @582446  e21ecb3c… (depth/hgs_depth_dpd1.bin)
```

字节确定：同输入二次独立构建哈希全等（== c074b1ed…）。

## 3. Mac 全链（绿）

- 解封（darwin exe `7cf70ee7…`，三 expected 入参）：rc=0，三载荷
  cidMatch=1/expectedMatch=1，`svblockValidator=ok`（SvValidate 全量规则）
- 独立对拍：`cmp` 三载荷提取件 vs 源 → MP4/SVB/DEPTH `*_BYTE_EQUAL` 3/3；
  shasum 提取件 == 容器 cid == 源哈希
- **深度载荷专项**（对容器解封提取的 payload_2）：45 chunk 头结构 + crc32
  （zlib，与头内值与 pack_report 双对拍）+ 128×256/scale=54 + frameIndex/ptsMs
  序列全过；16bit 平面与 npy 源逐位 1,474,560/1,474,560 等（§1 口径）
- 负例 2/2 精确拒收：截断（末载荷缺 10B）→ rc=1 `ERR payload_range idx=2`；
  深度载荷区字节翻转 → rc=1 `payload[2] cidMatch=0 expectedMatch=0` + `ssm2 FAIL`

## 4. 安卓真机（DCO-AL00 / GBJ0222B24021692，加分腿，绿）

- push 容器 → 机上 sha256sum == `c074b1ed…`（与 Mac 一致）
- 机上解封（`ssm2_unseal_android` `89886b5f…` 原件复用）：rc=0，三载荷
  cidMatch/expectedMatch 全 1，`svblockValidator=ok`
- 机上对拍：payload_0 vs `hgs_base.mp4` cmp 字节等；payload_1 vs
  `hgs_l2_planes_android.svblock` cmp 字节等；payload_2（深度）机上
  sha256sum == `e21ecb3c…` == Mac == 容器 cid（机上无深度源件，跨机哈希全等为判据，如实口径）
- serve 腿（4470 新实例，按轮起停）：SSM1 单 kf 封套 `hgs_ssm2_d3.ssm1`
  3,533,303B（sha256 `718ae88f…`，cid=容器 c074b1ed…，协议零改动）→
  `q3_serve <封套> 4470`（回执 `fileLen=3533303 chunks=1 headerLen=117
  kfRange=[117,3533303)`）→ Mac fetch 1/1：`fetch ok chunks=1 kfChunk=0
  manifest=117B chunk=3533186B sha256-match=c074b1ed…`（三方全等）。
  serve 已停，进程/端口（4470=hex1176）复核清零；**4443 现场零接触**；
  机上既有 `hgs_ssm2.ssm2`/`hgs_base.ssm1`/`hgs_l2_planes.ssm1` 零扰动。

## 5. 产物与改动面

- 新：`tools/ssm2_depth_extract.py`（SSM1/DPD1 提取+校验双模式）、
  `artifacts/csg_asset_pipeline/huguangsheng/depth/hgs_depth_dpd1.bin`、
  `artifacts/csg_asset_pipeline/huguangsheng/ssm2/hgs_ssm2_d3.ssm2`
- 零改动：`tools/ssm2_pack.py`、`src/tools/ssm2_unseal.cheng`（三载荷为其
  N≤64 配额内用例，源码未动）、既有 `hgs_ssm2.ssm2`、
  `src/apps/semantic_snapshot`、`src/tests/sv_f3_hub_smoke`、4443 现场
- 机上留置：`/data/local/tmp/{hgs_ssm2_d3.ssm2, hgs_ssm2_d3.ssm1, ssm2_d3_out/}`
- git 未提交（按纪律）

## 6. 如实标注

1. 任务稿所列 `src/tools/depth_codec.cheng`/`depth_5bit.cheng`/`depth_hz.cheng`
   实际在 f_loop2 克隆（`.scratch/fi2/f_loop2/`），主树无此三件；本轮对拍用
   python 独立实现（tools/ssm2_depth_extract.py，合同=task_ssm1_pack.md §2 +
   manifest.cheng 冻结解析），45 chunk 全量逐位判定，不依赖克隆件。
2. 深度载荷取 **DPD1 无损定点层**（22.5s 全量 2,950,740B）；5bit 第 4 档
   （933,888B，MAD16=389 有损）为压缩实验层，盘面仅存 scratch 生命周期件且
   无冻结 sha 记录，本轮不入容器，哈希已补记（85cfa68c…）待其正式冻结后再议。
3. SSM2 原生 serving 维持 §22.2 另案口径，serve 腿仍为 SSM1 封套承载。
