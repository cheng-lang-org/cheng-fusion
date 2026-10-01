# task_player_shell.md — 宿主播放器控制协议 v1（原型实测版）

状态：已完成（原型实测 + 协议定义）
日期：2026-09-08
原型：`player_proto/player_proto.swift`（单文件，`swiftc player_proto.swift -o player_proto`，无 Xcode 工程）

## 0. 纯度定位（必读）

本原型属**宿主边界层**：AVFoundation/VideoToolbox 平台解码，与 gpuros「纯度=提交侧」先例对齐。
纯 Cheng 核心不实现解码/播放，只通过下述控制协议**驱动**宿主播放器；协议消息是纯数据
（ptsMs/rate/ms 整数），不引入纯度债。将来 CSG 几何层做渐进增强时，以 `timeUpdate(ptsMs)`
作为几何时间轴的驱动源。

## 1. 原型与方法

- headless（无窗口、无 AVPlayerLayer），macOS 26.5 arm64，Swift 6.3.3 工具链编译零告警。
- 首帧证据：`AVPlayerItemVideoOutput` 的首块解码像素缓冲（不依赖 layer，headless 真实解码证据）。
- 时间线：100ms periodic time observer（主 RunLoop），打印真实 PTS + 相邻 tick 有效倍速斜率。
- 延迟测量：命令点起 20ms 采样（rate/PTS），pause 用「rate==0 首现 + PTS 停走」，
  倍速用「40ms 滑窗 PTS 斜率首次 ≥1.85」（24fps 下 2x PTS 步进约 20.8ms，单步噪声大）。
- 脚本：open → 记录 readyToPlay/首帧 → play 2s → pause → setRate(2.0) 播 2s →
  seek 组（关键帧精确/GOP 中部精确/关键帧吸附，各冷+热两次）→ 近末端 play → EOF。
- AVPlayer headless 完整可用，**未触发**任务预设的 AVAssetReader 退化路径。

测试资产（仓库内，未改动）：
| 资产 | 时长 | 规格 | 码率 | GOP |
|---|---|---|---|---|
| `artifacts/csg_world_video/journey/journey.mp4` | 60.0s | 1280x720 H.264 + AAC, 24fps | ~78 kbps (586KB) | ≈1.208s/29帧（ffprobe 实测，关键帧 0, 1.2083, 2.4167, …, 29.0, 30.2083, …） |
| `fixtures/media/sample_cfr_1s.mp4`（边界行为） | 1.0s | 320x240 H.264 + AAC, 24fps | ~378 kbps | — |

## 2. 实测数字（journey.mp4，两轮独立运行）

| 指标 | 第 1 轮 | 第 2 轮 | 协议取值建议 |
|---|---|---|---|
| open→readyToPlay（秒开基线） | 244.1 ms | 145.7 ms | — |
| open→首块解码帧 | 306.5 ms | 184.2 ms | **首帧预算 < 500 ms** |
| play()→首帧 | 62.3 ms | 38.4 ms | — |
| pause()→rate==0 确认 | 28.6 ms | 23.0 ms | **ACK 预算 ≤ 100 ms** |
| pause()→PTS 停走（视觉停帧） | <20 ms | <20 ms | — |
| setRate(2.0)→2x 斜率生效 | 64.3 ms（40ms 窗口径） | 同左 | **切换预算 ≤ 150 ms** |
| seek 精确关键帧 29.0（冷/热） | 7.4 / 0.2 ms | 7.1 / 0.3 ms | — |
| seek 精确 GOP 中部 30.0（冷/热） | 6.0 / 0.2 ms | 6.3 / 0.4 ms | — |
| seek 关键帧吸附（tol=∞，冷/热） | 2.2 / 0.3 ms | 2.3 / 0.3 ms | — |
| 吸附落点偏差 | +208.3 ms（落到 30.2083 关键帧） | 同左 | — |
| 精确关键帧落点偏差 | −1.7 ms（B 帧重排） | 同左 | — |
| 近末端 play→AVPlayerItemDidPlayToEndTime | 1.121 s | 1.131 s（距末端 1.0s） | — |

倍速 tick 佐证：setRate 命令后首个 100ms tick（≤26ms）斜率即显示 effRate=2.00，此后稳定 2.00
无漂移；2x 期间 2s wall 推进 PTS ~4s。第一版 150ms 分析窗测得 186.6ms 属窗口下限伪影，已修正口径。

关键帧 vs 任意点结论：**本地小资产下 seek 延迟由 IO/元数据主导，与 GOP 解码距离几乎无关**
（精确 GOP 中部 6.0ms vs 精确关键帧 7.4ms，同量级；M 系芯片解码 1440 帧 720p 全片仅毫秒级）。
关键帧吸附（tol=∞）以 +208ms（半个 GOP）的落点精度换取 ~3x 冷 seek 提速（2.2 vs 6.0ms）。
推论：**场景流资产（秒级 GOP、低码率）拖拽可以放心用精确 seek；吸附仅在追求极致流畅时启用**。
冷/热差一个数量级：首次 seek 含解码管线建立（~6-7ms），复测命中缓存 0.2-0.4ms。

短片段（sample_cfr_1s.mp4）边界行为（协议设计关键输入）：
1. 1s 资产在 play 2s 阶段中途 EOF：`AVPlayerItemDidPlayToEndTime` 于 open+1.137s 触发，终态 pts=1.0=duration，`actionAtItemEnd=.pause` 生效。
2. **EOF 后 setRate(2.0) 不产生 PTS 推进**（0.8s 采样窗斜率未达 1.85）——播放器停在末端，宿主必须先 seek 回有效区间。
3. **seek 超界被钳制**：seek(29.0s) 于 1s 资产上 completion 正常返回，落点 pts=1.0（末端），偏差 -28000ms——宿主协议层必须钳制 seekMs∈[0, durationMs]。
4. **EOF 通知是一次性的**：seek 回 0 重播不再触发 `AVPlayerItemDidPlayToEndTime`（事件由 AVFoundation 门闩）——宿主状态机必须在 seek/play 时复位 eof 门闩并自行判定二次 EOF。

音频变速算法（AVAudioTimePitchAlgorithm）实测：
- 可选值（macOS 26 SDK）：`Varispeed` / `TimeDomain` / `Spectral`；`lowQualityZeroLatency` 在 macOS 标记 API_UNAVAILABLE（iOS 独有，iOS 15 起弃用）。
- **系统默认已是 `TimeDomain`**（实测打印确认）。本原型显式设 `.timeDomain`：
  Apple 的质量档默认——0.5x~2.0x 变速不变调、开销均衡，覆盖 setRate(2.0)；
  `Spectral` 仅 >2x 或音乐保真场景；`Varispeed` 不做音高校正（rate≈1.0 时最省）。
- 结论：宿主 shell 无需特殊处理音频变速，默认/显式 timeDomain 即满足协议的 r∈[0.5, 2.0]。

## 3. 控制协议 v1（纯 Cheng 核心 ⇄ 宿主播放器）

宿主命令集（Cheng → Host，均为纯数据消息）：

| 命令 | 参数 | 语义 | 实测 ACK 数字（本地资产） |
|---|---|---|---|
| `open` | `mediaPath` | 建会话并加载资产；宿主回 `stateChanged` + `error?` | readyToPlay 146-244ms |
| `mediaPath` | `path` | 仅换源（等价 close+open）；可选 | 同 open |
| `play` | — | rate 保持当前值起播 | 首帧 ≤62ms（冷起播） |
| `pause` | — | 冻结在当前帧 | rate==0 ≤29ms；PTS 停帧 <20ms |
| `setRate` | `r` | r∈[0.5, 2.0]，暂停态置 r 等效 setRate+play | 2x 生效 ≤65ms |
| `seekMs` | `ms` | 宿主必须钳制 [0, durationMs]，默认精确模式 | 冷 ≤7.5ms / 热 ≤0.5ms；completion 即解码完成 |
| `teardown` | — | 移除观察器、释放会话 | 同步，无未决回调后返回 |

宿主事件集（Host → Cheng）：

| 事件 | 载荷 | 触发与实测时序 |
|---|---|---|
| `timeUpdate` | `ptsMs` | 宿主以 100ms 周期上报（原型 tick 实测间隔稳定 100ms，1x/2x 下均无丢拍） |
| `stateChanged` | `playing\|paused\|seeking\|eof` | play/pause ≤29ms 级迁移；seek 进入 seeking、completion 回 paused/playing；EOF 上报 eof |
| `error` | `code, msg` | open 失败（坏资产/不支持编码）、解码错误 |

协议规则（由边界行为实测推出，宿主必须实现）：
1. `seekMs` 超界钳制到 [0, durationMs]（原型观测到 AVFoundation 静默钳制并正常 completion）。
2. `eof` 一次性：宿主在收到 `play`/`seekMs` 时复位 eof 门闩；EOF 后任何推进类命令前先 `seekMs` 回有效区间。
3. EOF 后 `setRate`/`play` 不产生 PTS 推进（实测），状态机不得依赖其副作用。
4. `seekMs` completion 语义 = 目标帧解码就绪（精确模式），宿主可据此刻画「拖拽已就位」。
5. 命令超时建议：play/pause/setRate 250ms、seekMs 500ms、open 2s（本地；网络另定）。

## 4. 「秒开」对照结论

- 普通视频基线（本机本地文件）：open→首帧 **184-307ms**。两轮差异来自文件缓存冷热。
- 场景流目标（首屏 <2MB）可达性：**可达，预算宽松**。
  - journey.mp4（60s CSG 场景流，720p24）整片仅 586KB → 首屏（moov+前 2s 数据）≈ 数十 KB 量级，远低于 2MB。
  - 大分辨率参照 hgs_faststart.mp4（1304x2320, 22.5s, 5.9MB, ~2.1Mbps）：首屏 2s ≈ 0.52MB < 2MB。
  - 结论：即便按 hgs 的码率，2MB 预算可覆盖 **~9.5s** 播放数据；秒开瓶颈在网络 RTT + moov 位置，
    不在数据量。要求：**场景流资产必须 faststart（moov 前置）**，首帧解码依赖的数据在前几个分片内。
- 本轮为本地实测基线；网络流（AVURLAsset 远程 URL）的秒开数字需宿主侧联调时补测。

## 5. 未解决问题

1. 网络（非本地）`open`/首帧/seek 数字未测——原型只覆盖本地资产，网络场景需宿主联调补测。
2. `rate` 连续渐变（慢动作 0.5x、>2x）未实测，仅覆盖 r=1.0/2.0；>2x 时音频算法需换 `Spectral`，未验证。
3. 短片段二次 EOF 需宿主状态机自行判定（AVFoundation 不再通知），具体判定规则（pts≥durationMs 容差）待 B1 producer 对齐。
4. 原型 `exactKeyframe` seek 目标写死 29.0s（journey 专用，假设 duration>29s）；短资产上该用例退化为超界钳制观测点（本文档第 2 节即如此使用），通用化留待宿主 shell 实现。

## 6. 产物

- `player_proto/player_proto.swift` — 原型源码（可复跑：`swiftc player_proto.swift -o player_proto && ./player_proto <mp4>`）
- `player_proto/player_proto` — 编译产物
- 运行输出：两轮 journey.mp4 + 一轮 sample_cfr_1s.mp4 全量时间线已在会话记录中，数字以本文档第 2 节为准。
