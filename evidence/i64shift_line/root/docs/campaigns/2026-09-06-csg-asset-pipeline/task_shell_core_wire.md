# task_shell_core_wire.md — 壳-核接线（Swift 壳 ⇄ 纯 Cheng daemon）

状态：已完成（daemon 编译 + 冒烟 + Swift 联动实跑，2026-09-11）

纯 Cheng 核（manifest.cheng + player.cheng）已闭环、宿主壳原型（player_proto.swift）已实测四控制；
本任务补上「让核状态在壳里可见」的接线层：**Swift 壳 spawn 纯 Cheng daemon 子进程，
stdin 逐行命令 / stdout 逐行应答**。核全部调度决策（推进/EOF 门闩/取数 fetch/预取窗口）
由纯 Cheng daemon 产出，壳只做协议收发、AVPlayer 驱动与联动测量。

## 1. 文件

| 文件 | 角色 |
|---|---|
| `src/tools/ssm1_tick_daemon.cheng` | 纯 Cheng 常驻 daemon（新） |
| `player_proto/PlayerShell.swift` | Swift 宿主壳（新，复用 player_proto.swift 成熟片段，独立可编译） |
| 克隆产物 | `<streamdev 克隆>/artifacts/csg_asset_pipeline/ssm1_tick_daemon.exe` |

编译：
- daemon：克隆内 `rm -rf .cheng-csg-core` 后 `system-link-exec --emit:exe --target:arm64-apple-darwin`（envelope 清 `CHENG_ROOT/CHENG_PKG_ROOTS/CHENG_PKG_HOME/CHENG_GUI_ROOT/CHENG_IDE_ROOT`）。
- 壳：`swiftc PlayerShell.swift -o PlayerShell`。

## 2. 协议 v1（daemon ⇄ 壳）

每条命令**恰一行应答**（lockstep，壳发一条读一条，无乱序无粘包歧义）；行内空格分词。

| 命令 | 应答 | 语义 |
|---|---|---|
| `init <ssm1路径> <bufWindowMs>` | `OK init chunks=<n> durationMs=<d> bufWindowMs=<w>` | `StreamManifestLoadFileEmbedded` 载包 + `PlayerInit(duration=包总时长)` |
| `play` | `OK play` | `PlayerPlay`（EOF 门闩下显式 ERR） |
| `pause` | `OK pause` | `PlayerPause` |
| `rate <x10>` | `OK rate=<r>` | `PlayerSetRate`，域 [5,20]∪{0}，域外 ERR 且速率不变 |
| `seek <ms>` | `OK seek posMs=<p>` | `PlayerSeek`，越界（含负数）ERR |
| `tick <dtMs>` | `STATE posMs=<p> playing=<0|1> rate=<r> eof=<0|1> fetch=<i> bufferedTo=<b> pre=<i1,i2,...>` | `PlayerTick`；pre 逗号序列可为空；dtMs<0 ERR |
| `quit` | （无应答，立即退出 rc=0） | 壳侧发完即关 stdin |

- 非法命令/参数/未 init：`ERR <原因>`，**不退出**（如 `ERR not_inited` / `ERR manifest_load_failed` / `ERR seek_out_of_range` / `ERR unknown_command cmd=...`）。
- stdin EOF：退出 rc=0。
- EOF 无独立通知行：以 STATE 行 `eof=1` 为准（门闩语义见 task_stream_player_core.md）。

## 3. 取舍记录

1. **交互 stdin 模式（非 argv 脚本模式）**：仓库内有现役逐行读先例
   （`src/tests/_tmp_reader.cheng`、`src/core/tooling/lsp_server.cheng LspReadLine`，均 `os.C_fgetc(os.Get_stdin())`），
   逐行读原语可用，故直接选交互 stdin，不退化为 argv 单命令序列。
2. **lockstep 应答**：每命令恰一行 + 壳同步阻塞读，免去帧协议/异步读线程；daemon 每行写后显式 flush（`C_fflush`，失败 panic），壳逐行消费不积压。
3. **strict 整数解析**：daemon 自带严格十进制解析（可一个前导 `-`、其余全数字、int32 值域），不走 lenient parse，参数脏即 ERR。
4. **壳侧 chunk 表**：STATE 行按本协议只带 `fetch` 序号；`chunkStartMs` 由壳对 `<stream.ssm1>` 做轻解析（只读每条目 startMs，布局同 manifest.cheng）得到，不往协议里塞冗余字段。
5. **联动延迟口径**：壳发 seek → AVPlayer seek completion 落定（completion 主线程回执，同 player_proto 的 completion 口径）；`.zero` 容差。
6. **冒烟序列补一个 `tick 0`**：任务给定「play → tick 500×3」推不出期望序列里的 fetch=0（首个 tick 500 落 pos=500→fetch=1）；在 play 后补 `tick 0`（秒开定位，与 playback_probe 的 OPEN fetch=0 同口径），fetch 输出恰为 0→1→2→3→snap 20。

## 4. 验证证据（真实输出）

### 4.1 daemon 冒烟（echo 管道喂命令，init 胡广生包 bufWindow=2000）

```
$ printf 'init .../huguangsheng.ssm1 2000\nplay\ntick 0\ntick 500\ntick 500\ntick 500\nseek 12000\ntick 0\nquit\n' | ssm1_tick_daemon.exe
OK init chunks=45 durationMs=22500 bufWindowMs=2000
OK play
STATE posMs=0 playing=1 rate=10 eof=0 fetch=0 bufferedTo=2000 pre=0,1,2,3
STATE posMs=500 playing=1 rate=10 eof=0 fetch=1 bufferedTo=2500 pre=1,2,3,4
STATE posMs=1000 playing=1 rate=10 eof=0 fetch=2 bufferedTo=3000 pre=2,3,4,5
STATE posMs=1500 playing=1 rate=10 eof=0 fetch=3 bufferedTo=3500 pre=3,4,5,6
OK seek posMs=12000
STATE posMs=12000 playing=1 rate=10 eof=0 fetch=20 bufferedTo=14000 pre=24,25,26,27
rc=0
```

断言成立：**fetch 序列 0→1→2→3→snap 20**（12000ms 吸附最近关键帧 chunk 20）；预取窗口随 pos 滑动；EOF 由 rc=0（quit）。

非法路径（同一二进制）：`tick 100`/`rate 99` 未 init → `ERR not_inited`；`foo bar` → `ERR unknown_command cmd=foo`；坏路径 → `ERR manifest_load_failed`；init 后 `seek -5`/`seek 22501` → `ERR seek_out_of_range`；`rate 20` → `OK rate=20`；stdin EOF → rc=0。

### 4.2 Swift 壳联动时间线（真实实跑节选，完整 282 行日志见运行输出）

```
[   0.024s] === PlayerShell: mp4 + huguangsheng.ssm1 chunks=45 ===
[   0.036s] DAEMON OK init chunks=45 durationMs=22500 bufWindowMs=2000
[   0.036s] DAEMON OK play
[   0.037s] CMD AVPlayer.play() + 每100ms tick 100
[   0.138s] SHELL t=  0.138 posMs=  100 fetch= 0 chunkStartMs=    0 bufferedTo= 2100 eof=0
[   0.138s] LINK seek#1 chunk=0 -> AVPlayer target=0.000s landedPts=0.0000s latency=0.6ms
[   0.538s] SHELL t=  0.538 posMs=  500 fetch= 1 chunkStartMs=  500 bufferedTo= 2500 eof=0
[   0.586s] LINK seek#2 chunk=1 -> AVPlayer target=0.500s landedPts=0.5000s latency=47.9ms
[   1.039s] SHELL t=  1.039 posMs= 1000 fetch= 2 chunkStartMs= 1000 bufferedTo= 3000 eof=0
[   1.088s] LINK seek#3 chunk=2 -> AVPlayer target=1.000s landedPts=1.0000s latency=48.8ms
...
[  20.538s] SHELL t= 20.538 posMs=20500 fetch=41 chunkStartMs=20500 bufferedTo=22500 eof=0
[  20.585s] LINK seek#42 chunk=41 -> AVPlayer target=20.500s landedPts=20.5000s latency=46.5ms
...
[  22.038s] SHELL t= 22.038 posMs=22000 fetch=44 chunkStartMs=22000 bufferedTo=22500 eof=0
[  22.078s] LINK seek#45 chunk=44 -> AVPlayer target=22.000s landedPts=22.0000s latency=40.2ms
[  22.537s] SHELL t= 22.537 posMs=22500 fetch=44 chunkStartMs=22000 bufferedTo=22500 eof=1

---- 演示汇总 (壳-核接线) ----
总 tick 数: 225
联动 seek 次数: 45
联动延迟中位: 41.7ms (min=0.6 max=48.8 n=45)
daemon eof=1 确认: true
daemon 退出 rc: 0
```

## 5. 汇总数字

- daemon 冒烟：fetch `0→1→2→3→snap 20` 全中，rc=0；非法命令 5 类全部 `ERR` 且不退出。
- 联动演示：22.5s 全程 225 tick，核 posMs 与 wall 时钟 1:1 对齐（22.537s 时 pos=22500）；
  fetch 每 500ms 步进一次（45 chunks×500ms），45 次联动 seek 全部落点精确（landedPts == target）；
  联动延迟中位 **41.7ms**（min 0.6 / max 48.8）；EOF 门闩 eof=1 壳侧确认后停 tick；daemon 退出 rc=0。

## 6. 边界与已知项

- 未改 manifest.cheng / player.cheng / player_proto.swift 任何既有文件。
- 演示为 1x 对齐播放；rate/seek 的壳侧界面协议已通（4.1 冒烟），动态倍速联动画面留待宿主壳下一迭代（AVPlayer.setRate 语义已被 player_proto 实测覆盖）。
- 联动 seek 每 500ms 一次属演示口径（证明「核调度驱动画面」）；生产壳可仅在 fetch 跨关键帧边界或用户拖拽时联动。
