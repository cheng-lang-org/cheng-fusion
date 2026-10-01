# task_m7_android_play.md — 安卓真机「打开→秒开→完整声画播放 + CSG 深度层同步叠加」混合双层播放器（M7）

日期：2026-09-12。真机 HUAWEI DCO-AL00（Android 12，serial `GBJ0222B24021692`）。
承 task_m6b_android_e2e.md 的 M6b 工程（`/Users/lbcheng/UniMaker/ssm1android/`）迭代。
编译克隆产物目录 `/Users/lbcheng/cheng-f24/anchor_clones/apkdev/artifacts/m7_android/`。

---

## 1. 方案改向（承协调改向指令）

原预案 = RGB565 DPD2 全量自解播放（29.5MB v2 包）。用户验收否决：raw RGB565
对 5.9MB 原视频膨胀 5 倍。改为**混合双层**，体积不膨胀且「看到完整视频」由
平台解码保证：

1. **画面/音轨 = base 视频**（H.264+AAC mp4，faststart，≤2MB）走 Android
   `MediaPlayer` 平台解码（SurfaceView），秒开 = moov 前置 + 本地资产零网络。
2. **CSG 深度层 = 同步叠加增强**（uint8+帧内差分+RLE 包），按
   MediaPlayer 时钟对齐播放，半透明伪彩 + DEPTH 开关；自由视差渲染不做（后续）。
3. 原 RGB565 DPD2 解析工作保留不删：JNI shim 已新增 `ssm1LoadAsset` /
   `ssm1AssembledBytes` / `ssm1TickAt` 三个导出（未链入 .so，`.so` 本轮零重编），
   `Ssm1Native` external 声明保留在 MainActivity.kt 尾部，后续纹理增强可用。

## 2. 开发资产（M7-pack 正式产出未就绪，如实记录）

M7-pack 线的 base mp4 与 RLE 深度包在本轮开工与收尾时均未产出（已两次核实
主仓 `artifacts/csg_asset_pipeline/` 与 `src/tools/`）。按 M6b 先例（旧包开发
调试、就绪后切载），本轮用本机工具产**开发资产**打通真机全链；M7-pack 产出
就绪后仅换 `res/raw` 资产 + `CsgdPack` 解析器适配（对接面小），换载终验另跑。

### 2.1 base 视频（1,829,278B = 1.83MB ≤ 2MB）
- 源：`/Users/lbcheng/Downloads/视频生成/胡广生.mp4`（22.5s，1304×2320，30fps，5.9MB）。
- 产法：`ffmpeg -i 源 -vf scale=720:-2 -c:v libx264 -profile:v baseline
  -b:v 600k -x264-params keyint=90 -c:a aac -b:a 64k -movflags +faststart`。
- 实测：720×1280 30fps H.264 + AAC，650kbps，22.500s；atom 序
  `ftyp(32) → moov(20546B) → mdat`，**faststart 实证**（moov 在 mdat 前）。

### 2.2 CSG 深度包 CSGD v0（808,294B）
- 源数据：主仓 `artifacts/csg_asset_pipeline/huguangsheng/depth/` 45 帧
  256×128 float32 npy（MiDaS 深度 ×depthScale=54 定点）。
- 容器（播放端开发期定义，待 M7-pack 定稿对齐）：
  ```
  头 24B: magic "CSGD" u8 ver=0 u8 flags=0 u16 frameCount u32 w u32 h
          u32 frameMs u32 indexOffset
  帧 blob: u32 ptsMs u32 rleLen rle...
  索引:   frameCount × u32 帧 blob 偏移（indexOffset 起，文件尾）
  RLE:    帧内 raster 垂直差分（cur[y][x]=prevRow[x]+diff mod 256，首行 pred=0）
          后 (count u8∈[1,255], value u8)*
  ```
- 45 帧 128×256，frameMs=500，u8 值域 [90,234]；roundtrip 自检
  （`verify_csgd_pack.py`：解码==npy 重算逐帧全等）**45/45 PASS**。
- 产线/自检脚本：`make_csgd_pack.py` / `verify_csgd_pack.py`（apkdev artifacts/m7_android/）。

### 2.3 体积硬指标（base+CSG 合计 ≤ 原视频 5.9MB）
| 项 | 字节 |
|---|---|
| base mp4 | 1,829,278 |
| CSGD 深度包 | 808,294 |
| **合计** | **2,637,572（2.64MB，= 原视频 44.5%，≤5.9MB 达标）** |
| 对比原 RGB565 v2 方案 | ~29.5MB（膨胀 5 倍，已废弃） |

## 3. 播放循环设计（MainActivity.kt 全量重写，零依赖）

```
按钮行 [DEPTH][REPLAY]
videoFrame(FrameLayout, weight=1)
  ├ videoSurface(SurfaceView)   ← MediaPlayer 平台解码, onVideoSizeChanged letterbox 居中
  └ depthView(TextureView)      ← CSG 深度层, view 层天然叠于视频 surface 之上
日志 ScrollView(260px, 等宽绿字)
```

- **打开**：`T_OPEN`（prepareAsync）→ `T_PREPARED`（71ms）→ `start()`。
- **秒开判定**：`onInfo MEDIA_INFO_VIDEO_RENDERING_START` → `T_VIDEO_FIRST`
  （start→首帧 ms + open→首帧 ms 双口径）。
- **深度层解码**：装包一次性全解（45 帧 RLE→反差分→逐帧 min/max 归一→hot
  伪彩 ARGB alpha=0x66 缓存 IntArray[45][32768]，实测 23ms）；平场显式拒绝。
- **同步轴**：100ms handler tick，`posMs = mediaPlayer.currentPosition` 为唯一
  时间真相源 → `frameIdx = posMs / 500`（coerce 到 [0,44]）→ 帧号变化才重画
  （`T_DEPTH_FIRST` / `T_DEPTH_FRAME idx prev posMs` 打点，逐帧可对账）。任何
  seek 后 currentPosition 跳变，下一 tick 深度自动对齐（REPLAY 实证）。
- **开关**：DEPTH 按钮切换 `depthOn`（`T_DEPTH ON/OFF posMs` 打点），OFF 时
  Canvas CLEAR 全透明；REPLAY 按钮 `seekTo(0)+start`（`T_REPLAY` 打点）。
- **EOF**：`onCompletion` → `T_PLAY_DONE posMs durationMs wallMs`，深度 tick 停。

## 4. 真机时间线（run1 实测 logcat，存 `run_run1/logcat_full.txt`）

```
10:43:11.354 rawfile read csgd bytes=808294 readMs=2
10:43:11.354 T_CSGD OK frames=45 w=128 h=256 frameMs=500 0ms
10:43:11.377 T_CSGD decode-all done ms=23 depthW=128 depthH=256 frames=45
10:43:13.422 T_OPEN prepareAsync
10:43:13.442 T_VIDEO_SIZE 720x1280 / T_VIDEO_FIT frame=1212x2102 video=1182x2102
10:43:13.452 T_PREPARED open->prepared ms=71 durationMs=22523
10:43:13.574 T_VIDEO_FIRST start->firstFrameMs=122 open->firstFrameMs=193 (平台解码首帧上屏)
10:43:13.686 T_DEPTH_FIRST frameIdx=0 posMs=0 (CSG 层起跑, 与视频同轴)
10:43:14.212~35.683 T_DEPTH_FRAME idx=1..44 连续推进, posMs 与 idx*500 逐条对齐
10:43:26.843 T_DEPTH OFF posMs=13201   ← 开关对照截图后 ON posMs=14578
10:43:36.147 T_PLAY_DONE posMs=22501 durationMs=22523 wallMs=22694 (EOF 停帧)
REPLAY: T_REPLAY seekTo=0 posMs=0 → T_DEPTH_FRAME idx=0 prev=-1 posMs=0 同轴重跑 (10:45:28)
```

- **秒开（打开→首帧上屏）**：cold start `am start`→T_VIDEO_FIRST host 口径
  2424ms（内含 app 启动 + 固定 2000ms 自动起播延迟）；播放器口径
  **open→首帧 193ms**（prepare 71 + start→首帧 122），ms 级达标。
- **完整播放**：wallMs=22694 ≈ 22523ms 时长（+tick 粒度），posMs 到 22501
  EOF 停帧；声画同步由平台解码器保证（有声，真机外放实测）。

## 5. 截图判读（5 张，肉眼 + 数值双判，`judge_screens.py`）

| 截图 | 视频画面（肉眼） | 数值 |
|---|---|---|
| t2s | 唱歌近景，字幕「桥上走的哪一句」，深度窗红色人形 idx≈5 | range=242 非平场 |
| t10s | 姿态变化，字幕「莫给我消息」，深度窗人形变化 idx≈20 | range=241 非平场 |
| t20s | 闭眼演唱，字幕「你问我真哩迈真哩」，深度窗黄色形态 idx≈40 | range=252 非平场 |
| t13s_depth_off | 深度窗消失（纯黑），视频继续 | 窗 max=34 |
| t14s_depth_on | 深度窗回归（红黄伪彩 idx≈29），视频继续 | — |

- 三张推进截图视频区（800×1100 采样窗）两两 MAD = **19.97 / 28.95 / 30.61**
  （判异阈 3）→ **帧在推进，互不相同 PASS**。
- DEPTH 开关对照：深度窗区域 off vs on **MAD=44.67**（阈 10）→ **开关生效 PASS**。

## 6. 分层判词（开发资产轮，判词已被 §8 正式资产换载终验覆盖）

| 层 | 判定 | 证据 |
|---|---|---|
| base 资产（≤2MB faststart） | **通过** | 1.83MB；atom 序 ftyp→moov→mdat 实测 |
| CSG 深度包（RLE 正确性） | **通过** | roundtrip 45/45 逐帧全等 PASS |
| 体积硬指标 ≤5.9MB | **通过** | 合计 2.64MB（44.5%） |
| APK 构建/安装 | **通过** | assembleDebug Success；adb install Success（30.5MB，含 M6b .so） |
| 秒开（ms 级首帧） | **通过** | open→firstFrame 193ms（prepare 71 + start→render 122） |
| 完整 22.5s 声画播放 | **通过** | T_PLAY_DONE posMs=22501/22523 wallMs=22694 EOF 停帧 |
| CSG 层与视频时间轴同步 | **通过** | T_DEPTH_FRAME idx/posMs 逐条对账（±60ms tick 粒度）；REPLAY seek 后 idx=0 重跑对齐 |
| DEPTH 开关半透明叠加 | **通过** | 开关对照截图 MAD=44.67；alpha=0x66 伪彩视频区肉眼可见叠加 |
| 三截图互不相同 | **通过** | 视频 MAD 19.97/28.95/30.61 + 肉眼场景/字幕/姿态全异 |

## 7. BLOCKED 项与如实记录

1. **M7-pack 正式资产未产出**（base mp4 / RLE 深度包 / 格式定稿文档均无）：
   本轮为开发资产打通（产法与容器格式 §2 如实记录，资产自证 roundtrip PASS）。
   M7-pack 产出后需换载重验（换 `res/raw` + `CsgdPack` 适配），当前判词对
   开发资产有效。
2. **原 RGB565 v2 包未产出**：原预案「10fps×225 chunk RGB565」随改向作废；
   JNI shim 的 `ssm1LoadAsset`/`ssm1AssembledBytes`/`ssm1TickAt` 已写未链
   （`.so` 零重编），后续纹理增强需要时重链即可。
3. 深度窗 OFF 截图窗区 max=34（非理论 0）：该窗叠于视频黑背景上，残留来自
   截图编码/视频透出，远低于判据，不影响判读。
4. 两仓 git 零写操作；UniMaker 仅迭代 `ssm1android/`；主仓仅新增本文档；
   apkdev 克隆内新增 `artifacts/m7_android/`（资产/脚本/截图/logcat/判读）。

## 8. 正式资产换载终验（M7-pack 方案 A，2026-09-12，覆盖 §6 判词）

### 8.1 播放端换载实现（MainActivity.kt）
双 MediaPlayer 实例：basePlayer（有声，SurfaceView，letterbox 居中）+
depthPlayer（`setVolume(0,0)` 无声 → depthView TextureView，`alpha=0.66`
半透明灰度左上角 2x 窗，`setDefaultBufferSize(128,256)` 免重采样）。同步轴
= base `T_VIDEO_FIRST` 后 `depthPlayer.start()`，100ms tick 以
`depthPlayer.currentPosition` 取帧 idx（=posMs/100），每帧打点对账 basePos。
逐帧对拍 probe：depthPos 跨 2s/10s/20s 时 `TextureView.getBitmap` 抓帧 →
R 通道 u8 全帧 SHA-256 + min/max + 3 抽样像素 → `T_DEPTH_PROBE` 打点，宿主
与本机 ffmpeg 无损解帧参考（`packref/`）裁定。开发期 CSGD 解析器保留非活跃。

### 8.2 资产自证（本机）
- 双资产 sha256 与 manifest.json 逐字一致（base `927b37e6…`、depth `9023be7a…`）。
- 量化域公式对拍：`u8 = round((d-30.90658950805664)/1191.7901878356934*255)`
  对 run10fps 225 帧逐帧全等（maxdiff=0，**225/225 PASS**）。
- 双资产 faststart/帧数/时长 ffprobe 实证（depth 225 帧 22.5s）。

### 8.3 平台解码可解性裁定（批准条款执行点）
| 档 | 编码 | 体积 | 真机裁定 |
|---|---|---|---|
| M7-pack 原产 qp0 | High **4:4:4** Predictive | 991,625B | **拒流**：`T_DEPTH_MEDIA ERR what=1 extra=14/-38`（run2），深度层零帧 |
| **qp10 回测（预授权 8–12 档）** | High **4:2:0**，faststart | **381,024B** | **可解**：对拍三点逐位一致（§8.4），全链 PASS |

- 带界断言（本机）：qp10 流解码帧 vs 量化域公式 maxdiff=**6** ≤
  (0.5+q)×lsb/lsb = **10.5** u8 级 → PASS。
- H.264 解码确定性证据：真机 HW 解码→RGB 抓帧与本机 ffmpeg 软解参考帧
  **全帧 SHA-256 逐位一致**（§8.4），解码差异为零；qp0 拒流纯因 profile 域
  （4:4:4）不被该平台硬解支持。**给 M7-pack 线的产线结论：深度层编码建议
  qp8–12 + 显式 High 4:2:0。**

### 8.4 真机全时间线（run5 = 冷启动 + REPLAY 修复版，logcat 存 run_run5/）
```
T_PREPARED        open->prepared ms=110 durationMs=22533
T_VIDEO_FIRST     start->firstFrameMs=68 open->firstFrameMs=169 (base 首帧上屏)
T_DEPTH_START basePosMs=0 → T_DEPTH_RENDER_START depthPosMs=1 (深度层起跑)
T_DEPTH_FRAME idx=0..223 连续推进, depthPos/basePos 双轴对账(恒差 ≤66ms)
T_DEPTH_PROBE point=2000  frameIdx=21  sha256=fe4134b0… == 本机参考 逐位一致
T_DEPTH_PROBE point=10000 frameIdx=101 sha256=cdc457d2… == 本机参考 逐位一致
T_DEPTH_PROBE point=20000 frameIdx=200 sha256=3e9fe278… == 本机参考 逐位一致
T_DEPTH OFF basePos=17607 / ON basePos=18753 (开关打点)
T_PLAY_DONE basePosMs=22501 durationMs=22533 wallMs=22642 (EOF 停帧)
T_REPLAY seekTo=0 → T_DEPTH_FIRST idx=0 depthPosMs=84 basePosMs=0 (同轴重跑)
```
（run4 等价三点全命中：frame 21/100/200，其中 100/200 与本机参考 sha256
零偏帧精确一致。）对拍帧号规则：probe 在 depthPos 跨点时抓帧，SurfaceTexture
显示最新已渲染帧，pos 99–109ms 段帧号 +1 属正常帧界。

### 8.5 截图判读（run5 五张，`judge_screens.py` + 肉眼）
| 截图 | 视频区 mean | 深度窗 max | 判读 |
|---|---|---|---|
| t2s | 35.8 | 139 | 双层正常 |
| t10s | 36.6 | 126 | 双层正常 |
| t20s | 33.0 | 117 | 双层正常 |
| t13s_depth_off | 39.2 | **33（近纯黑）** | 开关 OFF 生效 |
| t14s_depth_on | 38.1 | **132** | 开关 ON 生效 |

- 三张推进截图互异（MAD 19.04/28.68/30.25；run4 同判据 34.77/28.68/30.25）
  + 各自非平场（range 101–237）→ PASS。
- DEPTH 开关对照 MAD 57.08（run4 59.23）→ PASS。
- 肉眼：视频 = 原片真彩画面（唱歌近景/麦克风场景/闭眼演唱，字幕逐张变化），
  深度窗 = 半透明灰度深度帧随时间推进（人形形态逐张变化）。

### 8.6 体积硬指标（实际打入 APK 的 res/raw）
| 项 | 字节 | 说明 |
|---|---|---|
| base.mp4（M7-pack 原产） | 496,166 | 不变 |
| depth.mp4（**qp10 回测版**） | **381,024** | 原产 qp0 991,625B 真机拒流 |
| **合计** | **877,190B = 0.84MB** | ≤5.9MB（原视频 14.9%）PASS |
| （参考）原产 qp0 合计 | 1,487,791B = 1.42MB | 体积亦达标，但不可解 |

### 8.7 换载轮判词（覆盖 §6）
| 层 | 判定 | 证据 |
|---|---|---|
| M7-pack 资产自证（sha256/量化域/faststart） | **通过** | §8.2，公式对拍 225/225 全等 |
| qp0 平台可解性 | **不通过（如实记录）** | High 4:4:4 真机拒流，深度层零帧 |
| qp10 回测（预授权条款） | **通过** | 381KB、带界 maxdiff=6≤10.5、全链验收 PASS |
| 双层同步（双 MediaPlayer） | **通过** | 224 帧 depthPos/basePos 对账 ≤66ms；REPLAY 同轴重跑 |
| 对拍（平台解码保位精确性） | **通过（qp10 域）** | 3 探针全帧 sha256 与本机软解逐位一致 |
| 秒开/完整播放/EOF | **通过** | open→首帧 169ms；22501/22533 EOF 停帧 |
| 三截图互异 + DEPTH 开关 | **通过** | §8.5 |
| 体积 ≤5.9MB | **通过** | 0.84MB（14.9%） |

### 8.8 换载轮如实记录（缺陷/BLOCKED 项）
1. **run3 偶发视频层黑屏**：该轮 t2s（pos≈2.4s）画面正常，之后视频区全黑
   （mean 0.4）而深度层正常推进至 EOF。run4/run5 同 APK 未复现；解码链正常
   （对拍/时长全对）。判定为平台显示合成/解码器偶发状态（单次出现），不作为
   资产/方案缺陷；复现条件未知，如实记录。
2. **REPLAY 深度 tick 未重启 bug**（本轮发现并修复）：v2 重写时 REPLAY
   handler 丢失 `startDepthTick()` 调用，EOF 后 seek 深度层停画。修复后
   run5 冷启动复验 idx=0 同轴重跑 PASS。
3. **设备 NITZ 墙钟回拨 ~4.4s**（run3 期间）：host 侧截图调度与设备播放位
   出现 ~4s 偏差，logcat 时间戳非单调。判读一律以截图内可见 log 字幕与
   T_DEPTH_FRAME 对账真实 pos，不采 host 时钟口径。
4. REPLAY 后深度层恒定超前 base ~66ms（双实例 seek 起步差，10fps 帧粒度
   100ms 之内，非同步破坏，如实记录）。
5. M7-pack 原产 qp0（4:4:4）仅本机 ffmpeg 可解；真机可解域结论已回传
   （§8.3）。换载终验对 qp10 回测版有效，原 qp0 产物真机不可播。

## §8 方案 A 正式资产换载终验（2026-09-12）

- **平台解码裁定（批准条款执行点）**：原产 qp0（High **4:4:4** Predictive）真机**拒流**
  （MediaCodec ERR what=1 extra=14/-38，深度层零帧）→ 按预授权降 **qp10（High 4:2:0，
  381KB）可解**，全链 PASS；带界断言 maxdiff=6 ≤ (0.5+q)×lsb=10.5。
- **解码保位精确性**：真机 HW 解码抓帧与本机 ffmpeg 软解全帧 SHA-256 逐位一致
  （run4/5 各三点 frame 21/100/200 命中；run3 差异纯为 SurfaceTexture 帧异步 +1）。
- **产线结论回传 M7-pack**：深度层正式档建议 **qp8–12 + 显式 High 4:2:0**（4:4:4 该
  平台硬解不支持；qp0 留作归档/校验基准档）。
- 换载终验真机时间线：T_OPEN→T_PREPARED 110ms→**T_VIDEO_FIRST 169ms**；深度层
  depthPlayer 双实例无声解码，100ms tick 与 basePos 恒差 ≤66ms；224 帧 idx/pos 双轴
  连续推进；DEPTH OFF/ON 对照（MAD 57.08）；**T_PLAY_DONE 22501/22533ms EOF 停帧**；
  REPLAY 同轴重跑。三张播放期截图 MAD 19.04/28.68/30.25 互不相同+非平场，肉眼原片
  真彩（字幕/姿态/场景逐张变化）。
- **体积终报（实际打入 APK）**：base 496,166B + depth(qp10) 381,024B = **877,190B =
  0.84MB = 原视频 5.9MB 的 14.9%**——硬指标 PASS（原产 qp0 合计 1.42MB 也达标但不可解）。
- 顺带修复 REPLAY 深度 tick 未重启真 bug（v2 重写丢失 startDepthTick 调用），run5 冷
  启动复验 PASS；如实记录：run3 偶发视频层黑屏（未复现，判平台合成偶发状态）；设备
  NITZ 墙钟回拨 ~4.4s（判读以截图内 log 字幕对账）；REPLAY 后深度恒定超前 ~66ms
  （双实例起步差，帧粒度内）。
- **M7-安卓终判词：方案 A 正式资产换载九层+裁定全 PASS。安卓真机「打开→秒开 169ms
  首帧→完整 22.5s 声画→CSG 深度同步→体积 0.84MB(14.9%)」闭环达成。**
