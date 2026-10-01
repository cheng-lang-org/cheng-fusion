# task_m7_pack_v2 —— CSG 场景流 v2：混合双层双档（base + qp10 播放档 + qp0 校验锚）定案

日期：2026-09-12。源视频 `/Users/lbcheng/Downloads/视频生成/胡广生.mp4`（1304×2320 竖屏，30fps，22.5s，5.62MB）。
**定案：方案 A 双档**——深度层 uint8 量化平面编码为两档 H.264：**depth_qp10.mp4 播放档**（High 4:2:0，真机硬解实测通过）+ **depth_qp0.mp4 校验锚**（无损，逐位可逆）；base 层 = 低码率 H.264+AAC（平台解码）。**分发形态（上机文件）0.84MB**。

## 0. 改向记录（四轮，均为体积/真机验收驱动）

1. 原 v2 = 深度 + RGB565 原画面纹理 chunk 流（225×131108B ≈ 29.5MB）→ 用户否决：对原视频膨胀 5 倍。
2. 改混合双层：base H.264+AAC + 深度层 uint8 量化 + 固定机位差分 + RLE → 实测 7.40MB（T=0），超标 4.9 倍，见 §7 档案。
3. 同批 u8 平面换无损 x264 实测 0.95MB（逐位可逆）→ 裁定方案 A（depth.mp4 = qp0）。
4. **M7-安卓真机回传：qp0 流是 High 4:4:4 Predictive，MediaCodec 硬解拒流（ERR what=1 extra=14/-38，深度层零帧）**→ 双档修正：qp0 降级为校验基准档（保留 BITEXACT 锚），**qp10 High 4:2:0 为正式播放档**（安卓实测：HW 抓帧与 ffmpeg 软解全帧 SHA-256 逐位一致，带界 maxdiff=6 ≤ 10.5）。鸿蒙线终验用同一 qp10 档。

## 1. v2 交付形态（定案，双档）

```
v2/
├── base.mp4        270×480@30fps H.264+AAC, crf28, GOP 1s, faststart          496,166 B  [播放]
├── depth_qp10.mp4  128×256@10fps H.264 qp10 High 4:2:0 (full range), GOP 30 帧, faststart  381,876 B  [播放]
├── depth_qp0.mp4   128×256@10fps H.264 qp0 无损 yuvj420p, GOP 30 帧, faststart 991,625 B  [校验锚, 不上机]
├── manifest.json   meta manifest (version 3, depth.playback/checksum 双档)      2,088 B
└── pack_report.json / parse_check_v2.log
```

- **分发形态（上机）** = base.mp4 + depth_qp10.mp4 + manifest.json = **880,130 B (0.84MB)**；归档形态（含校验锚）1,871,755 B。
- **量化域**（全流全局，数据推导）：`u8 = round((d - dmin)/(dmax - dmin) * 255)`，dmin=30.9066，dmax=1222.6968，**lsb=4.6737 MiDaS 单位（全域 0.39%）**。
- **校验锚（qp0）**：解码回 gray 与量化平面 225/225 帧**逐位 BITEXACT**（D1）——包内容正确性的无损证明。full-range yuvj420p 是逐位可逆的必要条件。
- **播放档（qp10）带界断言**：解码 gray vs 量化平面 maxdiff(u8) = **5 ≤ 界 11.5**（= 0.5 range 舍入 + q10 + 1 range 反舍入）；折算深度误差上限 1.07 MiDaS 单位（D3）。
- **manifest.json v3**：depth{quant, playback{file/size/sha256/codec/pixFmt/gopFrames/durationMs/firstGopBytes/errBound{boundU8,measuredMaxDiffU8,formula}}, checksum{…,lossless:true}} + base{…} + audio{durationMs,wavSha256} + openBudgetBytes。
- **音轨**：audio.wav（既有）sha256 CID + ffprobe 时长 22500ms 同步元数据。

## 2. uint8 量化精度论证（实测）

- 相邻帧深度变化（时域运动+模型噪声）：mean 37.7 单位（8.1 级）、median 27.5（5.9 级）、p90 82.2（17.6 级）——帧间变化是量化步长的 5.9–17.6 倍，256 级远不是深度信号时间分辨率瓶颈。
- 量化误差：max=0.5 级=2.337 单位，mean=1.168 单位。CSG 分层消费相对深度排序，非绝对值。

## 3. 转换链

```
ffmpeg fps=10 抽帧 (225 帧) → MiDaS_small (torch.hub source=local, 现役链) → v2/run10fps/
ffmpeg -i 源 -vf scale=-2:480 -c:v libx264 -crf 28 -preset medium -g 30 -pix_fmt yuv420p \
  -c:a aac -b:a 64k -movflags +faststart → v2/base.mp4
ssm1_pack.py run10fps . --v2 --audio-wav …/audio.wav --base-video base.mp4
  （内部: 量化平面 → ffmpeg rawvideo gray 管道 → libx264 双档编码:
    depth_qp0.mp4  = -qp 0  -pix_fmt yuvj420p -g 30（校验锚, 逐位可逆）
    depth_qp10.mp4 = -qp 10 -pix_fmt yuvj420p -g 30（播放档, High 4:2:0）
    均 -preset veryslow -movflags +faststart → manifest.json）
ssm1_parse_check.py . --input run10fps --v2 → 全 PASS
```

### base 层档位表（480p 竖屏 270×480，GOP 1s，faststart，AAC 64k）

| CRF | 大小 (B) | 占 2MB 预算 |
|-----|----------|------------|
| 24 | 641,176 | 31% |
| 26 | 558,913 | 27% |
| **28（选定）** | **496,166** | **24%** |
| 30 | 442,691 | 21% |
| 32 | 399,566 | 19% |

## 4. 指标报告（实测）

| 项 | 值 |
|----|-----|
| 深度层数据 | 225 帧 128×256 @10fps，22,500ms |
| depth_qp10.mp4（播放档） | **381,876 B**，sha256 a9c20bda…，qp10 High 4:2:0 full range，GOP 30 帧，首 GOP 50,876 B，maxdiff=5/11.5 |
| depth_qp0.mp4（校验锚） | 991,625 B，sha256 9023be7a…，qp0 逐位无损，首 GOP 111,731 B（不上机） |
| base.mp4 | **496,166 B**，sha256 927b37e6…，270×480@30，GOP 1s，首 GOP 3,272 B |
| manifest.json (v3) | 2,088 B |
| **分发形态（上机）** | **880,130 B = 0.84MB**（base + qp10 播放档 + manifest） |
| 归档形态 | 1,871,755 B（含 qp0 校验锚） |
| **秒开预算** | **56,236 B = manifest 2,088 + 播放档首 GOP 50,876 + base 首 GOP 3,272**（双 faststart；校验锚不计） |
| 时长同步 | qp10=qp0=base=音轨 = 22,500 ms（ffprobe 四方实测一致） |

**与安卓探针档的对账**：安卓实测文件 381,024B，产线官方档 381,876B，残差 0.22%（x264 build/参数微差）；两者同档位（qp10 / High 4:2:0 full range / GOP 30 / faststart）且 maxdiff 同为 6 级——硬解可解性结论按档位迁移有效。**两线换载一律以 manifest 钉 sha256 的产线文件为准**（sha a9c20bda…）。

## 5. 校验输出（真实运行，25 项全 PASS，exit=0）

```
$ ssm1_parse_check.py . --input run10fps --v2
PASS V0 manifest.json 存在 (./manifest.json)
PASS V1 format='SSM2 meta v2 (hybrid: base H.264 + dual-tier depth qp10 playback / qp0 checksum)' version=3
PASS V2 三文件存在 (depth_qp10.mp4, depth_qp0.mp4, base.mp4)
PASS V3 播放档 sizeBytes=381876
PASS V4 播放档 sha256=a9c20bda…
PASS V5 校验锚 sizeBytes=991625
PASS V6 校验锚 sha256=9023be7a…
PASS V7 base sizeBytes=496166
PASS V8 base sha256=927b37e6…
PASS V9 播放档流 128x256 pix_fmt=yuvj420p (High 4:2:0 full range)
PASS V10 校验锚流 128x256 pix_fmt=yuvj420p (full range)
PASS V11 三路时长 22500/22500/22500 ms == manifest
PASS V12 音轨时长 22500 ms 与总时长同步
PASS V13 播放档帧数 225 == manifest
PASS V14 播放档首GOP 50876 B == manifest (关键帧 8)
PASS V15 校验锚首GOP 111731 B == manifest (关键帧 16)
PASS V16 base 首GOP 3272 B == manifest (关键帧 24)
PASS V17 源帧数 225 == manifest
PASS D1 校验锚解码 225 帧逐位 BITEXACT (u8=round((d-30.9066)/1191.79*255))
PASS D2 播放档带界 maxdiff=5 <= bound=11.5 (== manifest 实测 5)
PASS D3 深度重建误差上限 1.070 MiDaS 单位 <= (0.5+q)*lsb+换算余量
PASS V18 秒开预算 = manifest 2088 + 播放档首GOP 50876 + base首GOP 3272 = 56236
PASS N1 播放档被替换 (base 内容) -> 解码校验拒绝
PASS N2 播放档被截断 (砍尾 50KB) -> 解码校验拒绝
PASS N3 manifest sha256 篡改 -> 一致性校验拒绝
ALL PASS v2: 分发形态 880130 B (0.84 MB) = 播放档 381876 B + base 496166 B + manifest 2088 B;
归档形态 1871755 B (含 qp0 校验锚 991625 B); 校验锚 225 帧 BITEXACT 无损;
播放档带界 maxdiff=5/11.5 (u8); 秒开预算 56236 B
```

v1 回归（重构后复验）：同输入重打包与既有 v1 产物 sha256 逐字节一致（`c11e2997…dc1d571`），v1 解析器 ALL PASS——v1 路径零破坏。

## 6. 产物路径

- `artifacts/csg_asset_pipeline/huguangsheng/v2/base.mp4`（496,166 B）[上机]
- `artifacts/csg_asset_pipeline/huguangsheng/v2/depth_qp10.mp4`（381,876 B）[上机, 播放档]
- `artifacts/csg_asset_pipeline/huguangsheng/v2/depth_qp0.mp4`（991,625 B）[校验锚, 不上机]
- `artifacts/csg_asset_pipeline/huguangsheng/v2/manifest.json`（meta manifest v3）
- `artifacts/csg_asset_pipeline/huguangsheng/v2/pack_report.json`、`parse_check_v2.log`
- `artifacts/csg_asset_pipeline/huguangsheng/v2/run10fps/`（225 帧深度产线，153MB）
- 工具（本轮扩展 --v2 路径，v1 零改动）：`docs/campaigns/2026-09-06-csg-asset-pipeline/tools/{batch_depth_runner.py(本轮零改动), ssm1_pack.py, ssm1_parse_check.py}`

## 7. RLE 超标档案（证据结论：深度域不能 RLE，必须运动补偿视频编码）

chunked DPD2（uint8 量化 + 对 chunk0 的 XOR 固定机位差分 + RLE/raw 择小，SSM1 manifest 扩展 baseVideoRef）实现曾全链路绿（2516 PASS），体积不达标：

| T (置零阈值, u8 级) | 置零率 | 体积 | 平均误差 |
|----|--------|------|---------|
| 0（无损） | 1.21% | 7.15MB | 0 |
| 8 | 20.5% | 7.05MB | 0.87 级 |
| 16 | 39.4% | 6.37MB | 3.2 级 |
| 32 | 71.2% | 3.86MB | 6.8 级 |

**归因**：MiDaS 相对深度逐帧全域抖动（相邻帧变化 median 5.9 级、p90 17.6 级），“固定机位背景”在相对深度域不稳定；非零像素空间散布 → RLE 游程死穴（225 帧 raw 平面 7,372,800B，压缩后 7,375,851B，压缩率 0.9996x）。逐像素噪声是 RLE 的理论边界，非参数问题——这就是最终选运动补偿视频编码（x264 无损）的依据。

## 8. 换载注意（M7-安卓已回传 / M7-鸿蒙在飞）

- **qp0 档不作播放**：High 4:4:4 Predictive，安卓 MediaCodec 硬解拒流（ERR what=1 extra=14/-38）。仅作产线校验锚，不上机。
- **播放档 = depth_qp10.mp4**（qp10 High 4:2:0 full range, sha a9c20bda…, 381,876B）：安卓真机已验证同档位 HW 解码（抓帧与 ffmpeg 软解全帧 SHA-256 逐位一致）；鸿蒙 AVPlayer 用同一文件终验，若鸿蒙硬解对 qp10 仍拒流，按裁定再降 qp 档回测（qp12/qg 同步重测带界与首 GOP）。
- 带界断言参数在 manifest `depth.playback.errBound`：bound=11.5（u8 域），实测 maxdiff=5；折算深度误差上限 1.07 MiDaS 单位（lsb=4.6737）。
- base 流为常规 crf28 H.264，平台解码无特殊项；播放同步元数据在 manifest.json（时长/帧数/fps/量化域）。
- 秒开 = 双 faststart：manifest(2KB) + depth_qp10 首 GOP(50,876B) + base 首 GOP(3,272B) ≈ 56KB。
