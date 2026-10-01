# B3 语义播放器实测记录: 消费 CSG 语义视频 v0.1 记录块

日期：2026-09-17。产物绑定：本文件记录的命令、stdout、rc 均为真机实测。
实现：`src/apps/semantic_player/main.cheng`、`src/tests/sv_b3_player_smoke.cheng`。

## 1. 编译命令（真实执行；终版两枚均绿。首版 play 循环触发 cheng_cold 所有权发射缺陷，定位后按 §8 形态修正，未改任何共享源码）

```
artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/apps/semantic_player/main.cheng --emit:exe --target:arm64-apple-darwin --out:.scratch/b3/semantic_player
artifacts/bootstrap/cheng.stage3 system-link-exec --root:/Users/lbcheng/cheng-lang --in:/Users/lbcheng/cheng-lang/src/tests/sv_b3_player_smoke.cheng --emit:exe --target:arm64-apple-darwin --out:.scratch/b3/sv_b3_player_smoke
```

## 2. smoke

```
$ .scratch/b3/sv_b3_player_smoke
  sv_b3 smoke: sample fixture ok
  sv_b3 smoke: hgs fixture ok
  sv_b3_player_smoke ok
rc=0
```

覆盖断言：两夹具验证链全绿（decode/parse/validate/manifest 恰 1/resCid[0] 源绑定/resCid[1] 重建索引绑定）；sample：14 样本/1 关键帧/timescale 12288/timeEnd 14336、query [0,14336) matched=14、query [0,7168) 条目 pts<7168 且升序、seek 7168→kf_pts=0 且 readahead 覆盖目标、中位+末样本 offset+size 界内且字节非全零；hgs：675 样本/6 关键帧/timescale 1000000/timeEnd 22500000、seek 10000000→kf_pts=8000000、query [4e6,8e6) matched>0；负例：翻转一个非零字节的 .scratch/b3/corrupt.mp4 在 resCid[0] 处被拒（进程内断言 corruptCid != manifest.resCid[0]）。

## 3. info（两夹具 stdout 原文）

```
$ .scratch/b3/semantic_player fixtures/b2_sample.svblock src/tests/network_milestone_assets/sample.mp4 info
caps=[common_core]
contentId=sha256:c549018c9689e8ce43c0adc7f0e26b5706f64155fcd76657948b48273dcc1229
timeStart=0
timeEnd=14336
tbNum=1
tbDen=12288
entities=1
observations=1
obs=0 obsId=obs-v0 tickStart=0 tickEnd=14336 srcTrack=v:0
indexSampleCount=14
indexKeyframeCount=1
indexTimescale=12288
keyframePts=[0]
rc=0

$ .scratch/b3/semantic_player fixtures/b2_hgs.svblock src/tests/real_media_assets/hgs_faststart.mp4 info
caps=[common_core]
contentId=sha256:dab95fd1e49b17b3fd669d6b53a96b1df7ea24b42593842c63958273bcc06a1b
timeStart=0
timeEnd=22500000
tbNum=1
tbDen=1000000
entities=2
observations=7
obs=0 obsId=obs-v1 tickStart=4000000 tickEnd=8000000 srcTrack=v:0
obs=1 obsId=obs-v2 tickStart=8000000 tickEnd=12000000 srcTrack=v:0
obs=2 obsId=obs-v5 tickStart=20000000 tickEnd=22500000 srcTrack=v:0
obs=3 obsId=obs-v4 tickStart=16000000 tickEnd=20000000 srcTrack=v:0
obs=4 obsId=obs-a0 tickStart=0 tickEnd=22546575 srcTrack=a:0
obs=5 obsId=obs-v3 tickStart=12000000 tickEnd=16000000 srcTrack=v:0
obs=6 obsId=obs-v0 tickStart=0 tickEnd=4000000 srcTrack=v:0
indexSampleCount=675
indexKeyframeCount=6
indexTimescale=1000000
keyframePts=[0,4000000,8000000,12000000,16000000,20000000]
rc=0
```

## 4. query

```
$ … b2_sample.svblock sample.mp4 query 0 14336
sample=0 pts=0 offset=1034 size=3535 key=1
sample=1 pts=1024 offset=4569 size=2875 key=0
sample=2 pts=2048 offset=7444 size=840 key=0
sample=3 pts=3072 offset=8284 size=806 key=0
sample=4 pts=4096 offset=9090 size=965 key=0
sample=5 pts=5120 offset=10055 size=738 key=0
sample=6 pts=6144 offset=10793 size=1087 key=0
sample=7 pts=7168 offset=11880 size=614 key=0
sample=8 pts=8192 offset=12494 size=800 key=0
sample=9 pts=9216 offset=13294 size=497 key=0
sample=10 pts=10240 offset=13791 size=628 key=0
sample=11 pts=11264 offset=14419 size=452 key=0
sample=12 pts=12288 offset=14871 size=427 key=0
sample=13 pts=13312 offset=15298 size=312 key=0
matched=14 bytes=14576
rc=0

$ … b2_sample.svblock sample.mp4 query 0 7168
sample=0 pts=0 offset=1034 size=3535 key=1
sample=1 pts=1024 offset=4569 size=2875 key=0
sample=2 pts=2048 offset=7444 size=840 key=0
sample=3 pts=3072 offset=8284 size=806 key=0
sample=4 pts=4096 offset=9090 size=965 key=0
sample=5 pts=5120 offset=10055 size=738 key=0
sample=6 pts=6144 offset=10793 size=1087 key=0
matched=7 bytes=10846
rc=0

$ … b2_hgs.svblock hgs_faststart.mp4 query 4000000 8000000（首尾各 3 行）
sample=120 pts=4000000 offset=1164028 size=31232 key=1
sample=121 pts=4033333 offset=1195975 size=5200 key=0
sample=122 pts=4066667 offset=1201533 size=7040 key=0
…
sample=237 pts=7900000 offset=2158188 size=3552 key=0
sample=238 pts=7933333 offset=2162474 size=6704 key=0
sample=239 pts=7966667 offset=2169536 size=4176 key=0
matched=120 bytes=946128
rc=0
```

## 5. seek

```
$ … b2_sample.svblock sample.mp4 seek 7168
kf_pts=0 interval=[0,14336) readahead_samples=8 readahead_bytes=11460 from_sample=0
rc=0

$ … b2_hgs.svblock hgs_faststart.mp4 seek 10000000
kf_pts=8000000 interval=[8000000,12000000) readahead_samples=61 readahead_bytes=454624 from_sample=240
rc=0
```

## 6. play（记录时间轴步进，非 realtime）

```
$ … b2_sample.svblock sample.mp4 play 2048 4096
step=0 tick=2048 sample=2 offset=7444 size=840 key=0
step=1 tick=3072 sample=3 offset=8284 size=806 key=0
step=2 tick=4096 sample=4 offset=9090 size=965 key=0
step=3 tick=5120 sample=5 offset=10055 size=738 key=0
steps=4 evidence_bytes=3349 timeline=[2048,6144)
rc=0

$ … b2_hgs.svblock hgs_faststart.mp4 play 8000000 2000000（首 3 行 + 末行）
step=0 tick=8000000 sample=240 offset=2174080 size=26528 key=1
step=1 tick=8033333 sample=241 offset=2201372 size=4336 key=0
step=2 tick=8066667 sample=242 offset=2206130 size=5424 key=0
…
steps=60 evidence_bytes=446384 timeline=[8000000,10000000)
rc=0

$ … play 0 4096 --realtime（monotimes 按帧率 sleep，实测 wall 0.27s/4 帧，帧距 83ms）
rc=0
```

## 7. 负例与拒绝路径（rc=1）

```
$ cp sample.mp4 .scratch/b3/corrupt.mp4 并翻转一个非零字节（offset 3, 0x20→0x21）
$ … b2_sample.svblock .scratch/b3/corrupt.mp4 info
semantic_player error: sv_cid_malformed source expected=sha256:d179cc9226fb8fb9f17a81018a684bcee6c69a92d82d2e04a441e7074e57634a actual=sha256:203a38e16ba53d0d58b6fc9d3590571f6c375221d39162bf54f95f0f891854ac
rc=1

$ … query 7168 0（区间非法）
semantic_player error: sv_interval_reversed query
rc=1

$ … seek 99999（tick 越界）
semantic_player error: sv_tick_out_of_range seek
rc=1
```

## 8. 诚实边界与工程备注

- 无像素解码：仓内无 H.264 解码桥。播放器播的是记录时间轴 + 证据锚（按索引 offset/size 用 ReadFileRangeBytesResult 实际回读样本字节，滚动累计 evidence_bytes，读失败立即 rc=1）；像素呈现待解码接线。该边界写入 --help 文本。
- hgs 关键帧表 keyframePts=[0,4000000,8000000,12000000,16000000,20000000] 与 seek 10000000→kf_pts=8000000（第 4 关键帧）、readahead 61 样本/454624 字节逐一对上。
- 编译器形态备注（B3 实测，未改共享源码）：plain main 循环内把循环外定义的 str 局部按值传给 plain 函数时 cheng_cold 报 `managed drop lacks exact owned definition`；调用点按 weight_store 先例用 `share(sourcePath)` 跨循环共享，逐样本回读封在 `SvPlReadSampleCount`（Result 局部不进调用方循环体）。--realtime 初版按 1e6 换算帧距（快 1000 倍），已修为 pts·1e9/tbDen 纳秒并实测 wall 时间吻合。
