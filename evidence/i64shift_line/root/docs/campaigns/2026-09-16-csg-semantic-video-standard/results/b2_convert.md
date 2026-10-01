# B2 转换管线实测记录：存量 MP4 → CSG 语义视频 v0.1 记录块

日期：2026-09-17。产物绑定：本文件记录的命令、stdout、SHA-256 均为真机实测。
实现：`src/game/assets/semantic_video/source_index.cheng`、`convert.cheng`、
`src/apps/semantic_convert/main.cheng`、`src/tests/sv_b2_convert_smoke.cheng`。

## 1. 编译命令（真实执行）

```
artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/apps/semantic_convert/main.cheng --emit:exe --target:arm64-apple-darwin --out:.scratch/b2/semantic_convert
artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/tests/sv_b2_convert_smoke.cheng --emit:exe --target:arm64-apple-darwin --out:.scratch/b2/sv_b2_convert_smoke
```

两枚均一次编译成功（smoke 首版有运行期 ORC 缺陷，见 §5）。

## 2. smoke（先于样例转换判活）

```
$ .scratch/b2/sv_b2_convert_smoke
 sv_b2_convert_smoke ok
rc=0
```

覆盖断言：索引构建确定性（两次 Build+Encode 字节相等）、索引资源编解码
对称（Decode 后再 Encode 字节相等）、SvConvert 提交 → validator ok →
SvReaderDecode+SvParseRecords 回读、manifest caps=["common_core"]、
resType=["video_sample","index"]、实体数=实际媒体轨数、观测数=关键帧数
（+音频 1 条）、timeEnd=视频轨 totalTicks、assertions=0、第 k 样本
offset+size 界内且首 4 字节非全零。

## 3. 两枚真实存量样例转换（真实命令与 stdout 原文）

```
$ .scratch/b2/semantic_convert src/tests/network_milestone_assets/sample.mp4 docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/b2_sample.svblock
inputCid=sha256:d179cc9226fb8fb9f17a81018a684bcee6c69a92d82d2e04a441e7074e57634a
sourceBytes=15610
factCount=3
contentId=sha256:c549018c9689e8ce43c0adc7f0e26b5706f64155fcd76657948b48273dcc1229
claimedDirectoryCid=sha256:57fb2b81b1c04d1f1bf8e97c6767ebd70c962919ab8816b466fcbc1ec41390fd
svblockBytes=1392
sampleCount=14
keyframeCount=1
observationCount=1
entities=1
rc=0

$ .scratch/b2/semantic_convert src/tests/real_media_assets/hgs_faststart.mp4 docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/b2_hgs.svblock
inputCid=sha256:b6bbf35125c519964fa4a197cfa3708db7e9e2ee77504b9492e719e8cabccf6e
sourceBytes=5887367
factCount=10
contentId=sha256:dab95fd1e49b17b3fd669d6b53a96b1df7ea24b42593842c63958273bcc06a1b
claimedDirectoryCid=sha256:ece1282a085be97053b4e9d5cf4fab3f2f21498060fc0588820e16d3530c824b
svblockBytes=2186
sampleCount=675
keyframeCount=6
observationCount=7
entities=2
rc=0
```

## 4. 产物 SHA-256 与容器真值对照

```
9a8ae0e6ce138614d3f7a64367c9c13f74feaafa6038670bf9d91266a12e0205  fixtures/b2_sample.svblock
18dd7e5823f6cd7b0e4ba0bbfa85695eb80b7dce66d47af1c2c95d7d972a7a74  fixtures/b2_hgs.svblock
```

样例属性（ffprobe 仅外部对照，不入生产；容器级真值另经字节级 box 遍历
独立复核）：

| 项 | sample.mp4 | hgs_faststart.mp4 | 对照结论 |
|---|---|---|---|
| 轨 | 1 视频轨 | 视频+音频 | 实体数 1 / 2 ✓ |
| 视频 mdhd timescale | 12288 | 1000000 | manifest tbDen ✓ |
| 视频样本数 | 14 | 675 | ffprobe nb_frames 一致 ✓ |
| 关键帧数（stss） | 1 | 6 | 独立复算一致 ✓ |
| 视频轨 totalTicks | 14336（=14×1024，1.166667s） | 22500000（22.5s） | manifest timeEnd ✓，ffprobe duration 一致 ✓ |
| 音频 mdhd | 无 | timescale=44100，mediaDuration=994304 | obs-a0 ✓ |
| chunk 布局（stsc） | 1 chunk×14 样本 | chunk1×5 + chunk2..671×1 | stsc 必需性实证：无 stsc 则逐样本 offset 不可推导 |

独立复算（python 按原始字节重推 stts/stss）：hgs 关键帧 pts =
[0, 4000000, 8000000, 12000000, 16000000, 20000000]；obs[0].tickStart=0
与 obs[5].tickEnd=22500000 已由 smoke 断言钉住，中段 GOP 边界由同一
pts 数组直出（构建路径即 stts 累计，无独立启发）。

音频观测 end tick = floor(994304 × 1000000 / 44100) = 22546575，
大于 manifest timeEnd（22500000）约 46.6ms——这是容器真实事实
（音频媒体时长略超视频），validator 不禁止观测区间越过 content 末端；
如实记录，不截断不粉饰。ffprobe 对音频报 22.500000s 是 elst 编辑后
展示时长；本管线诚实采用 mdhd 媒体时长（994304/44100≈22.5465s）。

## 5. 实现要点与运行期缺陷记录

- stsc 为硬需求：sample.mp4 全部 14 样本在同一 chunk，hgs 视频 chunk
  布局 5+1×670。只解 stsz/stco 而假设「每 chunk 一样本」会产出错误
  offset——本实现按 ISO-BMFF 语义经 stsc 精确展开，无启发式。
- 校验（ok=false + `svsrc_` 前缀结构化错误）：mp4 解析失败、无视频轨、
  timescale/样本数非法、stz2 显式拒绝、stsz/stco/co64/stsc 缺失或重复、
  box 截断、stsz↔stts 样本数不一致、stsc 序列非法、chunk 展开超收/短收、
  delta≤0、pts 溢出、offset+size 越文件界、stss 样本号越界、零关键帧、
  多视频/多音频轨（实体编号冻结语义不可表示）、音频时长不足 1 tick。
  索引资源解码端对称全量校验（magic/version/长度/值域/计数吻合）。
- 运行期缺陷一次：smoke 首版在 @borrows 函数体内把含数组字段的托管
  结构体（SvSrcStblTables）按值传给未注解函数（chunkOffsetsCount），
  触发 `cheng_orc_release_failure code=registry_miss`。改为内联读取
  `tables.chunkOffsets.len` 后消除。教训与「plain local copy」陷阱同族：
  托管结构体只经 @borrows 借用或值返回结构体交换，禁止按值传参。

## 6. 诚实边界（不得据本产物宣称已具备的能力）

- 识别模型未接线：记录块不含任何 assertion，不含 object_track 等
  语义断言；obsId 只标记容器级观测区间。
- caps 仅声明 `common_core`；`semantic_description` 等能力在识别接入、
  可验证之前不声明。
- 观测 sourceClass=observed、method=`mp4-stts-stss-stsz-extraction@v1`，
  全部字段可由容器 stts/stss/stsz/stsc/mdhd 独立复算；无任何重建假设。
- 资源为外置：记录块只含源文件与索引资源的 CID（SvResourceCid），
  不内嵌媒体字节。
- co64 高位非 0（>4GiB 文件）按域拒绝：rawbytes 寻址为 int32 域，
  属既定边界，非静默截断。
