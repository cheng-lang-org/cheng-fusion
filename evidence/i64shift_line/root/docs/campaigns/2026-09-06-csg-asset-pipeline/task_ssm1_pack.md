# 立项：SSM1 打包器（深度帧流 → StreamManifest v1 单文件）

日期：2026-09-11。归属：CSG 资产管线（`docs/csg-asset-import-contract.md`）。
上游：`task_offline_batch.md`（batch_depth_runner 产物）；容器规格：`task_scene_stream.md`
（spec 冻结 v1，只读）；参考实现：`src/game/assets/stream/manifest.cheng`（只读）。
消费方：CSG 播放器（按 ChunkIndexForTime 定位、按关键帧 seek 秒开）。

## 1. 目标

把离线深度产线的逐帧 npy 打成 SSM1 容器单文件：manifest + 全部 chunk payload 顺序
排布，payloadOffset 指向文件内偏移；chunk payload v1 定义为自描述的 DPD1 定点深度
网格切片。

## 2. chunk payload v1 规格（DPD1，全小端）

```
offset 0:  magic[4]          = "DPD1"          # Depth Pack v1
offset 4:  version: u8       = 1
offset 5:  depthBits: u8     = 16
offset 6:  reserved: u16     = 0               # 必须 0
offset 8:  frameIndex: u32                     # 源 manifest 帧号
offset 12: ptsMs: i64                          # == 容器 chunk startMs
offset 20: width: u32
offset 24: height: u32
offset 28: depthScale: i32                     # 定点分母, >= 1
offset 32: payloadCrc32: u32                   # CRC-32/IEEE (zlib), 仅覆盖 depth 字节
offset 36: depth: width*height*2 字节          # 行主 uint16 小端, 值 = round(depth*depthScale)
```

payload 总长 = 36 + width*height*2，必须等于容器条目 payloadLen。

### 设计依据（16bit 定点精度论证）

- 误差背景：MiDaS_small 相对深度误差 ~1.66%。量化目标：像素级量化误差须比模型
  误差低两个数量级量级才可忽略。
- 定点步长 = 1/depthScale，最大量化误差 = 0.5/depthScale。实测批
  （run_2fps, depthScale=87）：半 LSB = 0.00575 深度单位；批内最小深度 26.80
  （manifest 帧 1 min），最坏相对量化误差 = 0.00575/26.80 ≈ 0.0215%，
  约为 1.66% 模型误差的 1/77。逐像素独立舍入在平滑深度场上做网格级统计时按 √N
  进一步抵消；64×64~256×256 网格的空间采样误差远大于像素内定点量化。
- 动态范围：uint16 上限 65535，可表示深度 ≤ 65535/depthScale。depthScale 由
  `floor(65535/globalMax)` 确定性推导（--depth-scale auto），本批 87 → 上限
  753.3 ≥ 批内 max 750.84。定值 scale 导致 `round(depth*scale) > 65535` 时硬失败
  （报 max/scale/上限），不截断、不夹紧。
- 头部字段由消费方结构校验（magic/version/位宽/reserved=0/尺寸与 payloadLen 一致），
  depth 字节由 payloadCrc32 覆盖；字段在头内故 CRC 不含头。

## 3. 单文件排布与 B 线尾部规则的适配

```
[SSM1 manifest: magic..chunk 条目×N..audioTrackRef(cidLen=0)]  # manifest 区
[chunk 0 payload][chunk 1 payload]...[chunk N-1 payload]        # payload 区
```

- B 线 §2 尾部规则字面为「audioTrackRef 结束 = 文件末尾」，仅适用 manifest-only
  形态；任务要求单文件内嵌 payload，故打包侧规格将尾部规则适配为：payload 区
  （audioRef 末尾到 EOF）必须被 chunk 按 manifest 顺序无缝恰好覆盖——与 manifest
  区重叠、排布断裂、剩余未覆盖字节均按「尾部垃圾」显式拒绝。manifest 区本身的
  全部 B 线字面契约不变。B 线文档与 Cheng 实现只读未动（见 §7 未解决问题）。
- payloadOffset 为文件内绝对偏移，满足 B 线宽域判定 offset+len ≤ 文件总长。

## 4. 打包规则

- 时间轴：ptsMs = round(pts_ms)（容器粒度毫秒，源 pts 全为整数毫秒）；chunk i 时长
  = pts[i+1] − pts[i]（覆盖到下一帧起点，语义 = 保持当前画面，单调不重叠无间隙）；
  末 chunk 时长 = round(1000/sample_fps)，总时长与源视频一致（run_2fps: 5000 ms）。
- 关键帧：chunk index % keyframeEvery == 0（--keyframe-every，默认 5）。
- CID：sha256(chunk payload 全字节) 小写 hex 64 字符（cidLen 冻结 64，对齐 B 线）。
- 音轨 v1 置空：audio cidLen = 0。
- 配额对齐 B 线：包文件 ≤ 256MiB，chunkCount ∈ [1, 1e6]，越界显式拒绝。
- 输入校验：dtype 浮点、[H,W] 二维、与 manifest.depth_shape 一致、全有限值、非负；
  任一违反硬失败。

### 打包器

`tools/ssm1_pack.py <input_dir> <output_dir> [--keyframe-every N] [--depth-scale K|auto]`

输出 `stream.ssm1` + `pack_report.json`（逐 chunk cid/offset/len/crc、秒开预算）。

## 5. 交付（files/action/verify/done）

| 项 | 内容 |
|---|---|
| files | `tools/ssm1_pack.py`、`tools/ssm1_parse_check.py`（新增）；产物 `artifacts/csg_asset_pipeline/pack/run_2fps/**` |
| action | ① 读 batch 产物 manifest+npy，两遍流（求 globalMax 定 scale → 编码）；② DPD1 编码 + sha256 CID + SSM1 manifest 拼装单文件；③ 参考解析器逐字段对 B 线解析自产物并对拍 |
| verify | `python3 tools/ssm1_parse_check.py <stream.ssm1> --report <pack_report.json> --input <产线目录>`：A 字段往返 / B 时间定位 / C 关键帧 seek / D payload CRC+深度位级对拍 / E 14 项负例显式拒绝，全部 PASS 才退出 0 |
| done | run_2fps 实测打包 + 自校验 ALL PASS（本文件 §6 数字）；溢出路径（scale=1000）实测硬失败不落盘 |

## 6. 实测（run_2fps，2026-09-11）

输入：`artifacts/csg_asset_pipeline/batch/e2e/run_2fps`（10 帧 256×256，2fps，5.0s）。
命令：`ssm1_pack.py … --depth-scale auto`（floor(65535/750.84)=87）。

| 指标 | 值 |
|---|---|
| 包大小 | 1,312,106 B（1.25 MiB） |
| chunk 数 | 10（每 chunk payload 131,108 B = 36 头 + 256*256*2） |
| 关键帧数 | 2（chunk 0 @0ms、chunk 5 @2500ms） |
| manifest 区 | 1,026 B（12 + 10×101 + 4） |
| 首关键帧 chunk | chunk 0：offset 1,026，len 131,108 |
| 秒开预算（manifest+首关键帧） | 132,134 B（129.0 KiB） |
| depthScale | 87（auto；上限 753.3 ≥ 批内 max 750.84） |
| 总时长 | 5,000 ms（= 源视频时长） |
| 音轨 | cidLen=0（v1 置空） |

自校验：107 项 PASS，ALL PASS（A 往返 13 / B 定位 24 / C seek 8 / D 对拍 50 / E 负例
14 全部显式拒绝，含坏 magic、坏版本、截断、payload 越界、isKeyframe=2、cidLen=63、
大写 cid、时间轴重叠、尾部垃圾）。溢出硬失败实测：
`FAIL: depth_000000.npy 帧 0 定点溢出: max=605.97 * 1000 = 605967 > 65535`（exit 1，无输出文件）。

产物绑定（sha256）：
- `tools/ssm1_pack.py` = b35c0aed068c348287207ef60e30f09438cbdd4852982d8b5e48e67afc47b99a
- `tools/ssm1_parse_check.py` = 3096c468c1d0392e801b7ad45d70ca4a70b75023282a2904093b5048f68c44d4
- `pack/run_2fps/stream.ssm1` = aa70a285f7011a9563b4d3cfe0bc54e098df1b26765b8eec17c8064c555ad1f5

## 7. 未解决问题

- Cheng 消费侧接线：`StreamManifestParse` 喂整个 stream.ssm1 会在 B 线尾部检查
  （audioRef 后必须 EOF）失败；单文件形态需消费方切 manifest 前缀解析后另行校验
  payload 区，或由 B 线 owner 按本文 §3 适配扩展。B 线规格与 Cheng 实现本次只读，
  接线归属后续任务。
