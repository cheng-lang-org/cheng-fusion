# E1-lite 存量视频 CSG 语义化：压缩与包体积对比实测报告（纯计量）

日期：2026-09-17。实现：`src/tools/semantic_pack_report.cheng`（编译产物
`.scratch/e1/report`）。输入：B2 冻结夹具
`fixtures/b2_sample.svblock`/`fixtures/b2_hgs.svblock`（实测 SHA-256 与
`results/b2_convert.md` §4 逐一相等）。

## 1. 结论先行

1. **同能力纯回放下无压缩增益**：冷包 = 原片字节 + 语义增量
   （sample 15610+1392=17002；hgs 5887367+2186=5889553）。回放能力不变，
   字节只增不减。
2. **热传输增量 = 纯语义数据**：源视频已缓存时实际新增字节就是 svblock
   本身（1392 / 2186 字节），其内容经 validator 与 resCid 双向核对为纯
   语义记录块，不携带媒体字节（资源外置，manifest 只存 CID）。
3. **公平比值不设**：语义层与像素编码层能力不同，不硬算压缩比，
   千倍话术禁用（见 §6 合规声明）。

## 2. 方法

### 2.1 验证链（任一不等拒绝，rc=1）

1. `SvValidate(svblock)` 结构/schema/引用/依赖环全量校验 ok；
2. `SvReaderDecode + SvParseRecords` 取 manifest，`SvResourceCid(源文件字节)
   == manifest.resCid[0]`；
3. `SvSourceIndexBuild(源文件字节)` ok，`SvSourceIndexEncodeResource` 后
   `SvResourceCid(索引资源字节) == manifest.resCid[1]`；
4. `manifest.resLength[0]/[1]` 与实测 `BytesLen(源文件)/BytesLen(索引资源)`
   相等。

负路径实测：错配对（hgs svblock + sample.mp4）→ `error: source_cid_mismatch`，
rc=1。

### 2.2 计量口径（全实测，无估计；整数运算，禁浮点）

| 项 | 口径 |
|---|---|
| `source_bytes` | `BytesLen(源文件)` |
| `svblock_bytes` | svblock 文件字节数（含协议开销） |
| `index_resource_bytes` | `SvSourceIndexEncodeResource` 后 `BytesLen`（=20+24×样本数） |
| `duration_sec` | totalTicks/timescale 截断 6 位小数、去尾零，手工拼字符串（22500000/1000000→"22.5"；14336/12288→"1.166666"） |
| `bitrate_kbps` | floor(source_bytes×8×timescale/(totalTicks×1000))，整数除法向下取整 |
| `cold_package_bytes` | source_bytes + svblock_bytes（冷包=全部必需依赖） |
| `hot_transfer_bytes` | svblock_bytes（源已缓存场景的实际新增字节） |
| `overhead_bp_hot` | floor(svblock_bytes×10000/source_bytes)，bp 基点整数（1bp=0.01%） |
| `recovery@pct` | T=totalTicks×pct/100；定位 ≤T 的最近关键帧 pts，累计该关键帧样本到 T 所在样本的 size 总和 = 需重读字节下界。多关键帧跑 25%/50%/75% 三点；单关键帧三点同值，结构性只跑 50% |

### 2.3 编译（真实执行，一次成功）

```
artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/tools/semantic_pack_report.cheng --emit:exe --target:arm64-apple-darwin --out:.scratch/e1/report
```

## 3. 原始输出（stdout 原文，rc=0）

### 3.1 sample.mp4（14 样本 / 1 关键帧）

```
$ .scratch/e1/report docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/b2_sample.svblock src/tests/network_milestone_assets/sample.mp4
section=verification
validator=ok
source_cid_match=ok
source_index_build=ok
index_cid_match=ok
reslength_match=ok
sourceCid=sha256:d179cc9226fb8fb9f17a81018a684bcee6c69a92d2e04a441e7074e57634a
indexCid=sha256:0f5fa52e60685190b981c1bce406b083942d8670eb1bee318b1d3e9af67cba4b
contentId=sha256:c549018c9689e8ce43c0adc7f0e26b5706f64155fcd76657948b48273dcc1229
section=measurement
source_bytes=15610
svblock_bytes=1392
index_resource_bytes=356
timescale=12288
total_ticks=14336
duration_sec=1.166666
bitrate_kbps=107
cold_package_bytes=17002
hot_transfer_bytes=1392
overhead_bp_hot=891
index_timescale=12288
sample_count=14
keyframe_count=1
recovery@50 kf_pts=0 samples=8 bytes=11460
section=conclusion
conclusion=playback_no_gain
conclusion=hot_increment_is_semantic_only
conclusion=fair_ratio_not_claimed
rc=0
```

### 3.2 hgs_faststart.mp4（675 样本 / 6 关键帧）

```
$ .scratch/e1/report docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/b2_hgs.svblock src/tests/real_media_assets/hgs_faststart.mp4
section=verification
validator=ok
source_cid_match=ok
source_index_build=ok
index_cid_match=ok
reslength_match=ok
sourceCid=sha256:b6bbf35125c519964fa4a197cfa3708db7e9e2ee77504b9492e719e8cabccf6e
indexCid=sha256:dcb7a7b341bb16c8214b39fe02919115c03290f4947c01779bd418da9df0559a
contentId=sha256:dab95fd1e49b17b3fd669d6b53a96b1df7ea24b42593842c63958273bcc06a1b
section=measurement
source_bytes=5887367
svblock_bytes=2186
index_resource_bytes=16220
timescale=1000000
total_ticks=22500000
duration_sec=22.5
bitrate_kbps=2093
cold_package_bytes=5889553
hot_transfer_bytes=2186
overhead_bp_hot=3
index_timescale=1000000
sample_count=675
keyframe_count=6
recovery@25 kf_pts=4000000 samples=49 bytes=423088
recovery@50 kf_pts=8000000 samples=98 bytes=729408
recovery@75 kf_pts=16000000 samples=27 bytes=282224
section=conclusion
conclusion=playback_no_gain
conclusion=hot_increment_is_semantic_only
conclusion=fair_ratio_not_claimed
rc=0
```

## 4. 对比表

| 项 | sample.mp4 | hgs_faststart.mp4 |
|---|---|---|
| source_bytes | 15610 | 5887367 |
| duration_sec | 1.166666 | 22.5 |
| bitrate_kbps | 107 | 2093 |
| svblock_bytes | 1392 | 2186 |
| index_resource_bytes | 356 | 16220 |
| cold_package_bytes | 17002 | 5889553 |
| hot_transfer_bytes | 1392 | 2186 |
| overhead_bp_hot | 891（≈8.91%） | 3（≈0.04%） |
| recovery@25 | —（单关键帧，结构性只跑 50%） | kf_pts=4000000 samples=49 bytes=423088 |
| recovery@50 | kf_pts=0 samples=8 bytes=11460 | kf_pts=8000000 samples=98 bytes=729408 |
| recovery@75 | — | kf_pts=16000000 samples=27 bytes=282224 |

读法：svblock 相对源片是千分之一到百分之一量级的纯语义增量（hgs 3bp）；
seek 恢复成本由最近 GOP 边界决定，例如 hgs 定位到 50% 处只需从 pts=8000000
的重读下界 729408 字节（约占源片 12.4%）起步，三项均无像素解码。

## 5. 与 b2_convert.md 数字一致性核对

| 项 | b2_convert.md | 本报告实测 | 判定 |
|---|---|---|---|
| 夹具 SHA-256 | 9a8ae0e6… / 18dd7e58… | 逐位相等 | 一致 |
| sourceBytes | 15610 / 5887367 | source_bytes 同 | 一致 |
| svblockBytes | 1392 / 2186 | svblock_bytes 同 | 一致 |
| sampleCount/keyframeCount | 14/1、675/6 | 同 | 一致 |
| inputCid（=sourceCid） | d179cc92… / b6bbf351… | 同 | 一致 |
| contentId | c549018c… / dab95fd1… | 同 | 一致 |
| timescale/totalTicks | 12288/14336、1000000/22500000 | 同 | 一致 |
| duration 展示 | 表中 1.166667s（四舍五入） | 1.166666（截断 6 位小数口径） | 展示口径差异，tick 真值一致，如实记录 |
| indexCid | 未打印 | 0f5fa52e… / dcb7a7b3…（本报告首测） | 无冲突 |

外部对照（ffprobe 仅对照、不入生产）：packet 数 14/675、四点 recovery
字节求和与本工具逐一相等，属独立解析路径的交叉印证。

## 6. 合规声明（计量边界）

按主方案 `openspec/proposals/csg-semantic-video-standard.md` SV-08
「同质量同能力比较；……千倍压缩、秒发秒开不得由局部数据外推」：
本报告只计量字节（冷包、热增量、seek 重读下界），不宣称压缩比；
「无增益」结论仅覆盖同能力纯回放场景，语义层新增的可查询/可恢复能力
不在字节对比的公平范围内。佐证：`findings.md`（三种输入共享表示不意味
包含相同可观测信息）、`review.md` 第 6 条（冷包/缓存增量/运行时成本分列，
千倍秒开未设为保证）。

## 7. 诚实边界

- 无像素解码：recovery bytes 是容器级需重读字节下界，不含解码/渲染成本，
  不等于画质恢复证明。
- 无重编码、无 PSNR：本轮纯计量，不做任何编码优化；画质类比较属 E 阶段
  编码优化工作，未做不宣称。
- 识别模型未接线（沿 B2 边界）：记录块无 assertion，caps 仅 common_core；
  热增量「纯语义」指记录块不携带媒体字节，不指语义丰富度。
- 冷包口径按任务合同固定为 源片+svblock；索引资源（356/16220 字节）是
  manifest 第 2 项外置资源（消费端 seek 恢复所需），本报告如实单列其
  实测字节数，不混入冷包/热传输两个口径。
