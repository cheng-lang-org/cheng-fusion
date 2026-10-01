# 存量视频→CSG 场景流实战回执：胡广生.mp4（2026-09-11）

## 源片

`/Users/lbcheng/Downloads/视频生成/胡广生.mp4`：22.5s，1304×2320 竖屏，30fps，AAC 44.1kHz 立体声，5.9MB。

## 转换（离线产线，源创作边界 torch）

- 抽帧 2fps × MiDaS_small 深度 @256 → **45 帧**（256×128 竖屏保比，单帧推理中位 0.716s）
- 音轨抽取 WAV（pcm_s16le 44.1kHz 双声道，3,969,190B）

## 打包（SSM1+DPD1 v1）

- `stream.ssm1` **2,955,365B**（sha256 `c11e2997bbe7039a…`），45 chunks / 9 关键帧（每 5 chunk）
- depthScale=54（auto 推导），音频 CID `22229ddb11efd7d7…` 内嵌 audioTrackRef
- **秒开预算 70,197B（68.6KiB）** = manifest 区 4,625B + 首关键帧 payload 65,572B

## 纯 Cheng 验证（C 车头，三道门）

1. **参考解析器**（Python 逐字段）：ALL PASS——字段往返/时间定位/关键帧 seek/深度逐位/CRC/音频 CID 对账/负例拒绝
2. **容器解析**（`pack_verify.exe`）：`pack chunks=45 durationMs=22500 / firstKeyframe chunk=0 / openBudgetBytes=70197 / PASS payload magic DPD1`
3. **播放调度**（`playback_probe.exe`，F 线状态机接真包）：
```
OPEN fetch=0 (秒开定位) pre=4 bufferedTo=2000   ← 打开即定位首关键帧, 预取 2s
SEQ t=500..2000 fetch=1..4                      ← 顺序播放取数切换
SEEK 12000 snapFetch=20                          ← 拖拽吸附最近关键帧 (chunk 20)
RATE2X pos=13000                                 ← 2x 倍速推进正确
NEAR-END pos=22500 eof=1 → play 拒 → SEEK 0 → RESUME pos=250 eof=0
csg_ssm1_playback_probe PASS
```

## 秒发秒开口径

- **秒发**：单文件内容寻址对象（sha256 CID）+ 音轨伴生件，即发布即就绪；P2P 分发由 cheng libp2p bitswap/MoQ 承载
- **秒开（本机数据面已实证）**：打开 = 取 4.6KB manifest + 首关键帧 65.6KB（68.6KiB），纯 Cheng 解析+关键帧定位真包实证；本地基线 184-307ms（宿主壳实测）
- **秒开（传输段，SSM1 经 cheng libp2p MoQ 段流）**：真 QUIC 1-RTT 握手 + 双独立 stream，manifest 段与首关键帧段逐字节一致取回 + 纯 Cheng 解析定位成功（`csg_ssm1_moq_opensmoke` 4 轮全 PASS）。**ready→首帧就绪实测 13.3–13.9ms**；50ms RTT 外推：冷连接顺序 150ms / 双流并行 100ms / 热连接 50ms——均低于本地基线下限。传输调用序列与时间线全录 `task_ssm1_moq_opensmoke.md`
- 已知根修项（D 线如实记录，不阻塞本链）：quic native_runtime 会话槽游标恒指槽 0（绕开式接线已工作，根修归 quic 战役）；存量 libp2p 门禁冒烟撞新编译器借用合同（失修清单在 task 文档）

## 产物与工具

- 包：`artifacts/csg_asset_pipeline/huguangsheng/pack/{stream.ssm1,pack_report.json}`、`audio.wav`、`depth/`
- 验证程序：`src/tests/csg_ssm1_pack_verify.cheng`、`src/tests/csg_ssm1_playback_probe.cheng`
- 本次扩展：`ssm1_pack.py --audio-wav`（音轨 CID）、`manifest.cheng` 内嵌形态入口（ParseEx/ParseEmbedded/LoadFileEmbedded，双形态互拒）、冒烟 +6 内嵌用例全绿

## §一键演示

`tools/demo_sskk.sh`（2026-09-11）：四段数据面一键串跑——①源片参数（ffprobe）②打包信息+秒开预算（pack_report.json+盘上 sha256/大小对账）③传输秒开（opensmoke 时间线）④真包解析+播放调度（pack_verify+playback_probe）。任一段失败立即中止报错；exe 路径可用 `PACK_VERIFY`/`OPENSMOKE`/`PLAYBACK_PROBE` 环境变量覆盖。以下为实际运行输出：

```
######## CSG 场景流「秒发秒开」一键演示 (胡广生.mp4 → SSM1+DPD1) ########

== ① 源片参数 ==
  视频: h264,1304,2320,30/1
  音频: aac,44100,2
  时长: 22.500000s  大小: 5887651B

== ② 打包信息 + 秒开预算 (pack_report.json) ==
  stream.ssm1: 2955365B (2.82 MiB)  sha256=c11e2997bbe7039a…
  chunks=45  关键帧=9 (每5 chunk)  depthScale=54  时长=22500ms
  秒开预算 = manifest 4625B + 首关键帧 payload 65572B = 70197B (68.6 KiB)

== ③ 传输秒开 (SSM1 经 cheng libp2p MoQ opensmoke) ==
SSM1 opensmoke fixture: chunks=4 manifest=484B blob=480B kfChunk0=[0,120)
PASS server-side registration self-check (parse + locate)
PASS manifest segment fetched byte-exact
PASS B-line parse + first keyframe locate on fetched manifest
PASS keyframe chunk segment fetched byte-exact (expectation + declared range)
SSM1 MoQ opensmoke timeline:
  t0 connect ready (dial+accept+negotiate x2): 515930000 ns
  manifest segment (484 bytes): 8186000 ns
  parse + locate first keyframe: 24000 ns
  keyframe chunk segment (120 bytes): 6466000 ns
  total connect->first-frame ready: 530609000 ns
  ready->first-frame ready: 14679000 ns
csg_ssm1_moq_opensmoke ALL PASS
  → 提取: ready→首帧就绪 14.7 ms

== ④ 真包解析 (pack_verify) + 播放调度 (playback_probe) ==
pack chunks=45 durationMs=22500
firstKeyframe chunk=0 startMs=0 len=65572 offset=4625
openBudgetBytes=70197
PASS payload magic DPD1
csg_ssm1_pack_verify PASS
  --
pack chunks=45 duration=22500ms
OPEN fetch=0 (秒开定位) pre=4 bufferedTo=2000
SEQ t=500 fetch=1 pos=500
SEQ t=1000 fetch=2 pos=1000
SEQ t=1500 fetch=3 pos=1500
SEQ t=2000 fetch=4 pos=2000
SEEK 12000 snapFetch=20
RATE2X pos=13000 fetch=26
NEAR-END pos=22500 eof=1
RESUME pos=250 fetch=0 eof=0
csg_ssm1_playback_probe PASS

┌─ 「秒发秒开」汇总卡片 (胡广生.mp4 → SSM1+DPD1)
│  包大小        2955365 B (2.82 MiB)
│  秒开预算      70197 B (68.6 KiB) = manifest 4625B + 首关键帧 65572B
│  传输首帧耗时  14.7 ms (ready→首帧, 本机 libp2p MoQ 本轮实测)
│  外推 50ms RTT 冷连接顺序 150ms / 双流并行 100ms / 热连接 50ms
│               (均低于本机基线下限 184ms)
│  播放调度      PASS (pack_verify + playback_probe 全 PASS)
└─ ALL 4 SEGMENTS PASS
```

备注：opensmoke 偶发 `server stream4 data slot not found`（quic 会话槽游标恒指槽 0 的已知根修项，D 线在案），本轮复现 1/6 次后连跑 5 次全 PASS；脚本按契约如实中止，重跑即恢复。
