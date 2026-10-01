# A2 媒体边界样例（T2 生成）

日期：2026年9月16日。生成与属性实测工具：ffmpeg version 8.1 Copyright (c) 2000-2026 the FFmpeg developers；ffprobe version 8.1 Copyright (c) 2007-2026 the FFmpeg developers。
样例只进入测试与验收，不进入生产语义路径；路径相对仓库根。
中间文件在 tools/cheng_scratch_scope.sh 任务作用域内生成并随任务清理。

## 边界样例

| 样例 | SHA-256 | 大小 | 属性 |
|---|---|---|---|
| `docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/media/vfr_sample.mp4` | 15a7b3a9d430fd0e953780b269de13d5d4310f81a659a5e5fa8405f4e9979319 | 14167 B | video codec_name h264 width 64 height 64 avg_frame_rate 420/19 time_base 1/1000000 start_time 0.000000 has_b_frames 2；容器 start 0.000000 dur 1.900000 |
| `docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/media/bframe_sample.mp4` | da38b3de9d5396e84176018dec8bd3c7e503adca11a8fc68be7f99a125a3121c | 9283 B | video codec_name h264 width 64 height 64 avg_frame_rate 30/1 time_base 1/15360 start_time 0.000000 has_b_frames 2；容器 start 0.000000 dur 1.000000 |
| `docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/media/nonzero_start.mp4` | 6f7e2dacd0a7344b2d665613ec1ba1e7f39ca6bb909d8c0095f6e74750edc546 | 9432 B | video codec_name h264 width 64 height 64 avg_frame_rate 30/1 time_base 1/15360 start_time 2.000000 has_b_frames 2；容器 start 2.000000 dur 1.000000 |
| `docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/media/audio_priming.mp4` | b0cbb013cee78d8ba772ca1912db48778b1f5dad18cfa61ab3f711269bb7787a | 19121 B | video codec_name h264 width 64 height 64 avg_frame_rate 30/1 time_base 1/15360 start_time 0.000000 has_b_frames 2；audio codec_name aac avg_frame_rate 0/0 time_base 1/44100 start_time 0.000000 sample_rate 44100 channels 1；容器 start 0.000000 dur 1.000000 |

## 生成命令

### vfr_sample.mp4

- 用途：VFR（concat filter 单次编码：前 1s 30fps + 后 1s 12fps，帧时长两段各异且 pts 单调）
  - `ffmpeg -f lavfi -i testsrc2=duration=1:size=64x64:rate=30 -f lavfi -i testsrc2=duration=1:size=64x64:rate=12 -filter_complex [0:v][1:v]concat=n=2:v=1[out] -map [out] -c:v libx264 -preset medium -pix_fmt yuv420p vfr_sample.mp4`

### bframe_sample.mp4

- 用途：B帧（libx264 -bf 3 -x264-params bframes=3:b-adapt=0）
  - `ffmpeg -f lavfi -i testsrc2=duration=1:size=64x64:rate=30 -c:v libx264 -preset medium -pix_fmt yuv420p -bf 3 -x264-params bframes=3:b-adapt=0 bframe_sample.mp4`

### nonzero_start.mp4

- 用途：非零起点（-output_ts_offset 2.0）
  - `ffmpeg -f lavfi -i testsrc2=duration=1:size=64x64:rate=30 -c:v libx264 -preset medium -pix_fmt yuv420p -output_ts_offset 2.0 nonzero_start.mp4`

### audio_priming.mp4

- 用途：音频填充（aac 编码 priming/skip_samples）
  - `ffmpeg -f lavfi -i testsrc2=duration=1:size=64x64:rate=30 -f lavfi -i sine=frequency=440:duration=1 -c:v libx264 -preset medium -pix_fmt yuv420p -c:a aac -b:a 64k -shortest audio_priming.mp4`

## ffprobe 原始输出摘要

### vfr_sample.mp4

- 判定证据：{"distinct_frame_durations": [33333, 33334, 83333, 83334]}
```
  - stream #0 (video): {"codec_name": "h264", "codec_type": "video", "profile": "High", "width": 64, "height": 64, "r_frame_rate": "60/1", "avg_frame_rate": "420/19", "time_base": "1/1000000", "start_time": "0.000000", "duration": "1.900000", "nb_frames": "42", "has_b_frames": 2}
  - format: {"filename": "/Users/lbcheng/cheng-lang/docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/media/vfr_sample.mp4", "start_time": "0.000000", "duration": "1.900000", "size": "14167", "bit_rate": "59650"}
```

### bframe_sample.mp4

- 判定证据：{"has_b_frames": 2, "pict_type_counts": {"B": 21, "I": 1, "P": 8}, "frames_scanned": 30}
```
  - stream #0 (video): {"codec_name": "h264", "codec_type": "video", "profile": "High", "width": 64, "height": 64, "r_frame_rate": "30/1", "avg_frame_rate": "30/1", "time_base": "1/15360", "start_time": "0.000000", "duration": "1.000000", "nb_frames": "30", "has_b_frames": 2}
  - format: {"filename": "/Users/lbcheng/cheng-lang/docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/media/bframe_sample.mp4", "start_time": "0.000000", "duration": "1.000000", "size": "9283", "bit_rate": "74264"}
```

### nonzero_start.mp4

- 判定证据：{"format_start_time": "2.000000", "stream_start_times": ["2.000000"]}
```
  - stream #0 (video): {"codec_name": "h264", "codec_type": "video", "profile": "High", "width": 64, "height": 64, "r_frame_rate": "30/1", "avg_frame_rate": "30/1", "time_base": "1/15360", "start_time": "2.000000", "duration": "1.000000", "nb_frames": "30", "has_b_frames": 2}
  - format: {"filename": "/Users/lbcheng/cheng-lang/docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/media/nonzero_start.mp4", "start_time": "2.000000", "duration": "1.000000", "size": "9432", "bit_rate": "75456"}
```

### audio_priming.mp4

- 判定证据：{"audio_codec": "aac", "first_audio_packet_pts": -1024, "skip_samples": 1024}
```
  - stream #0 (video): {"codec_name": "h264", "codec_type": "video", "profile": "High", "width": 64, "height": 64, "r_frame_rate": "30/1", "avg_frame_rate": "30/1", "time_base": "1/15360", "start_time": "0.000000", "duration": "1.000000", "nb_frames": "30", "has_b_frames": 2}
  - stream #1 (audio): {"codec_name": "aac", "codec_type": "audio", "profile": "LC", "r_frame_rate": "0/0", "avg_frame_rate": "0/0", "time_base": "1/44100", "start_time": "0.000000", "duration": "1.000000", "nb_frames": "45", "sample_rate": "44100", "channels": 1, "sample_fmt": "fltp"}
  - format: {"filename": "/Users/lbcheng/cheng-lang/docs/campaigns/2026-09-16-csg-semantic-video-standard/fixtures/media/audio_priming.mp4", "start_time": "0.000000", "duration": "1.000000", "size": "19121", "bit_rate": "152968"}
```

## 尚缺样例（不假装已存在）

- 本组四样例（VFR、B帧、非零起点、音频填充）均已生成并过定义属性核验。
- 长时间轴专项由 A1 冻结的长片压力样例承担（202MB 源片），本组不重复生成。
- 实采 RGB/深度+音频与人工真值标注仍按 A1 清单待后续阶段。
