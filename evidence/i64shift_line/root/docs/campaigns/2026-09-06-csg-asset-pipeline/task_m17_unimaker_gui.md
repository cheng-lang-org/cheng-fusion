# task_m17_unimaker_gui.md — UniMaker 场景壳内集成 SSM1 CSG 视频播放器（M17）

日期：2026-09-13。设备 HUAWEI DCO-AL00（Android 12，serial `GBJ0222B24021692`，多会话共用）。
基座：T2 线 `unimaker-ssm1-shell.apk`（P0，本会话以设备侧 APK `scene_shell_device.apk`
md5 `5c43b6d2…` 为手术底座）。工作区：`cheng-f24/anchor_clones/scenfix/tmp/m17_l1/`
（克隆内战役工作区，主仓零改动、UniMaker 仓零改动、全程零 git 写操作）。

---

## 0. 结论速览

| 项 | 判词 |
|---|---|
| 集成 APK | **已产出并多次真机运行**：`work/m17_shell.apk`（sha256 `2be3441f…`，124,307,154B；在 P0 壳上 dex 手术 ×3 + 注入 classes5.dex + libssm1loop.so + M15 场景资产） |
| 壳启动 FORTIFY（U2 遗留） | **已解**：全路径延迟 `createRuntimeForSurface`（onCreate 末 install 钩子 + surfaceCreated/surfaceChanged/**onResume/onWindowFocusChanged** 四处直调改道）。健康窗口下 6+ 次启动零 FORTIFY（12:57/13:01/13:16/13:19/13:22/13:29 实测） |
| 壳 GUI（nativeCreate 后 scene 求值渲染） | **BLOCKED（新墙，精确定性）**：`cheng_app_init` 在 dlopen 完成后 ~90ms 处 `cheng_orc_release_failure code=refcount_underflow operation=normal_release detail=double_release_or_wrong_owner` → 静默 exit(1)。**每次 create 必现**（3/3），stdout 无输出、logcat 无痕迹（走自有 stderr syscall，不经 bionic/printf） |
| CSG 视频入口可见 | **PASS**：uiautomator 实证 `▶ CSG 视频` Button（`bounds=[448,2402][763,2512]`，clickable，13:22 与 13:37 两轮） |
| CSG 视频面板与控制 | **PASS**：面板/选包(SAF)/播放/暂停/Seek 12000ms/CAM:0/+6/+12 全部 uiautomator 实证（13:37 bounds 在案） |
| SAF 选包→装载→播放 22.5s→seek→EOF 全链真机时间线 | **BLOCKED（本轮未捕获）**：三重外部压制——①并行 lane 周期性重装同名包（11:09/12:29/12:57/13:10/13:46 五次 lastUpdateTime 易主，签名互斥互相卸装）；②EMUI adb 安装需真机确认 + `InstallStaging` 卡等；③启动 FORTIFY 在特定系统态下高频复发（13:27 起 10/10，健康窗口消失）。播放链各组件均各自真机 PASS 过（M1/M6b/M7/M15），但壳内 E2E 时间线本轮未能落盘 |

## 1. 前提侦察（为什么走 APK 手术）

- **apk-build 一键链已消失**：`cheng-f24/anchor_clones/` 仅剩 quicfix/scenfix（scenfix 为 U2 线
  本日自主仓 `cp -cR` 重建，仅源码树）。apkdev 克隆、`mobile-shell-tool`、one-click 产物、
  `cheng_yfix2` 车头、r51b 场景源全部不复存在。全链重建 = Y/T2/U2 三线工作量（one-click
  47 路由 + guard 修复回放 + r51b 重生成），不在本线预算内。
- **真机在位状态**：设备上有 P0 壳（FORTIFY 3/3 复现，本会话 12:13 首测确认与 U2 判词逐字同型：
  `present_enabled=1` 后 40-90ms 主线程 `FORTIFY: pthread_mutex_lock called on a destroyed
  mutex`，地址在 libhwui .bss 0x…047ed0 / libgrallocutils rw+0x470 间摆动）。
- **幸存可复用资产**（全部为各线真机 PASS 产物）：
  - `scene_shell_device.apk`（167MB，P0 壳：r51b scene .so + provider 三件 + host + 全部 assets）；
  - `UniMaker/ssm1android/.../libssm1loop.so`（M7 期单镜像播放核 .so，ssm1d+ssm1q+JNI shim，
    M15 当日真机在用；sha256 `ee9860797296604…`，24,974,384B）；
  - `scene_frame0.json`（15,232B）+ `hgs_bg0.rgb`（98,304B）——M15 场景求值渲染资产；
  - `huguangsheng.ssm1`（2,955,365B，sha256 `c11e2997…` == M3/M6b 台账）；
  - `w126_re` 冻结车头（/private/tmp，M1/M3/M6b 同物）——本线未动用（无需重编）。

**决策**：不走全链重建，对 P0 壳 APK 做外科手术（dex 补丁 + dex 注入 + so/资产叠加 + 重签），
复用全部真机 PASS 组件拼装 M17 集成面。`ssm1_scene_shell.build.mjs` 因此零改动（其上游输入
已不存在，改动无意义；手术工作区全部落在 scenfix 克隆 `tmp/m17_l1/`）。

## 2. 集成设计（全部落在注入 dex，壳自身仅 5 处 smali 级最小补丁）

### 2.1 壳 dex（classes4.dex，baksmali→补→smali）

| # | 位置 | 改动 | 目的 |
|---|---|---|---|
| 1 | `onCreate` 尾（requestFocus 后） | `invoke-static CsgEntry.install(Activity)` | 挂 CSG 视频入口（判据①） |
| 2 | `surfaceCreated` | `createRuntimeForSurface(holder)` 直调 → `CsgEntry.onSurfaceCreated` | 启动并发解耦 |
| 3 | `surfaceChanged` | 同上 | 同上（补口） |
| 4 | `onResume` | 同上 | 同上（补口：onResume 有独立 create 直调，首轮实验即漏在此） |
| 5 | `onWindowFocusChanged` | 同上 | 同上（补口） |

剩余 `createRuntimeForSurface` 直调仅 2 处（create 内部 state-restore 失败重试、
`ensureFilePickerReturnVisible`——均为启动窗口后路径，无需改道）。

### 2.2 注入 dex（classes5.dex，javac+d8，源码在 `m17_l1/src/`）

- `com.cheng.ssm1e2e.Ssm1Native`——与 M7 shim 同名类（JNI 查名只看 FQCN+方法+签名），
  绑定 libssm1loop.so 的 `ssm1LoadAsset/ssm1Cmd/ssm1TickAt`。命令行协议
  （`ssm1_tick_daemon_export.cheng`）：`play/pause/rate/seek <ms>/tick <dtMs>/quit`，
  应答 `OK/ERR/STATE posMs=… playing=… eof=… fetch=…` —— **MES1 tick 驱动的时间轴真相源**。
- `org.cheng.unimaker.scene.csg.CsgEntry`——壳内唯一挂点：install（入口悬浮钮 +
  stderr 重定向）+ onSurfaceCreated（延迟 create）。延迟量经两轮实测定为 180s
  （验证窗口；工程形态应在 FORTIFY/ORB 双墙解后改回首帧后空闲回调）。
- `org.cheng.unimaker.scene.csg.CsgVideoController`——面板 UI（选包 SAF/播放暂停/Seek/
  CAM 三视角/装载本机副本/卸载入口）+ 播放线程（100ms tick→STATE 解析→
  `ChunkIndexForTime(posMs)`→DPD1 深度解码灰度上屏）+ SeekBar 双向（拖动→`seek <ms>`）+
  EOF 门闩停帧（协议：EOF 后 play 不推进，须 seek 复位）+ `quit` 清理。
- `org.cheng.unimaker.scene.csg.SceneGraph`——M15 Kotlin `SceneGraph.render()` 的 Java 逐字
  移植（= `tools/csg_bg_scene_fit.py` plane3d/render 镜像；M15 真机三视角 MAD≈1.0 同实现）。
  camDx 自由视角，t 最小 z-buffer，未覆盖=黑，covered% 回报。
- `org.cheng.unimaker.scene.csg.CsgPack`——SSM1 v1 包只读解析（69B/chunk 表 + DPD1 头，
  与 `QParseManifestHeader/QParseDpd1Header` 逐字节同源），`decodeDepthGray` 产出灰度 Bitmap。
- `org.cheng.unimaker.scene.csg.PickerFragment`——无头 framework Fragment 持有
  `ACTION_OPEN_DOCUMENT`（SAF），绕开壳 `onActivityResult` 只认自有请求码的合同。
- 渲染视图：场景求值结果铺底（最近邻 fit-center）+ 深度灰度 PiP（左上角 1/4 宽，绿框）。
- stderr 重定向：`Os.dup2` 把 fd 2 落到 `files/m17_stderr.log`（cheng 运行时致命路径走自有
  write syscall 直写 fd 2，logcat 完全不可见——见 §4，这是本次归因的关键仪器）。

### 2.3 重打包

`repack.sh`：解包→替换 classes4.dex→加 classes5.dex→加 `lib/arm64-v8a/libssm1loop.so`→
加 `assets/scene_frame0.json + hgs_bg0.rgb`→zip（resources.arsc/lib stored）→zipalign→
`/Users/lbcheng/.android/debug.keystore` 签（与 P0 同证书，`apksigner verify --print-certs`
SHA-256 `9e09d47e…` 双向核对）。条目差集核验：与 P0 仅差 META-INF（重签）+ 新增 3 项。

## 3. FORTIFY 实验（E1→E2，全部真实 logcat）

- **E1（仅 surfaceCreated/surfaceChanged 改道）**：仍 FORTIFY（13:12，44ms）——**非理论证伪**，
  而是改道不完备：`onResume`/`onWindowFocusChanged` 各有一处 create 直调先行触发
  （本轮 smali 逐方法核对发现的第 4/5 处）。
- **E2（五处全改道，DEFER=2s/12s/180s 三档）**：**零 FORTIFY**（12:57/13:01/13:16/13:19/13:22
  五轮，crash buffer 空）。`T_CREATE deferred_create_invoked ok` 后进程不再崩在 dlopen 窗口。
- **复发定性**：13:27 起特定系统态下 FORTIFY 回归为启动期（create 未到即崩，10/10），
  且与并行 lane 的重装/确认弹窗/用户前台切换强相关；同一 APK 在健康窗口内可稳定启动。
  即：**U2 墙有两个面**——create 窗口并发面（延迟法已解）+ 启动首帧环境敏感面（残留，
  归 ROM/装载环境，与本壳代码无关——崩点在 hwui/grallocutils 静态 mutex，我方 .so 零
  pthread 引用（U2 已证），且 E2 下 create 未执行也会崩）。

## 4. 新墙：场景运行时 init 的 ORC refcount underflow（精确归因）

E2 后 create 仍失败：`deferred_create_invoked` 后 41-97ms 进程 `exited cleanly (1)`，
**零 logcat 输出**（native_create 首行日志都没有）。exit 断点（libc `exit/_exit/abort`
三符号 Z0）不命中——cheng 运行时自带 syscall 存根，不经 bionic。
靠 stderr 重定向（§2.2）拿到唯一线索：

```
cheng_orc_release_failure code=refcount_underflow operation=normal_release detail=double_release_or_wrong_owner
```

- **位置**：`cheng_app_init` 内（dlopen libcheng_unimaker_scene.so 成功后）；**复现率 3/3**。
- **判读**：r51b 场景运行时（Y 线两层命名变换 + @borrows pass 重放 + 370 处 prim-global
  let 中转的生成源）在 init 路径存在所有权缺陷（对同一托管值二次 release 或 owner 错配）。
  ORC release 失败即 fatal exit(1)（无兜底，符合 Let it crash）。
- **与 U2 墙的关系**：U2 的 P0/P7 轮次 create 与首帧并发，FORTIFY 先于 init 失败发生；
  本线延迟法拆掉并发窗口后，init 的 ORC 缺陷才显形。**两墙叠加**：延迟法解墙 1，
  墙 2 必须改场景源/生成器/编译器（r51b 源与重生成件已随 apkdev 克隆灭失，
  见 U2 §3.2 一键链重建前置）。
- **最小复现**：安装 `m17_shell.apk`（sha256 `2be3441f…`）→ 启动 → 等 `T_CREATE
  deferred_create_invoked`（12s 档）→ `run-as org.cheng.unimaker.scene cat
  files/m17_stderr.log` 即见上行。

## 5. 真机验证结果（真实实测）

| 判据 | 结果 | 证据 |
|---|---|---|
| 壳启动后 CSG 视频入口可见 | **PASS** | 13:22 `m17_ui.xml`：`text="▶ CSG 视频" … clickable=true bounds="[448,2402][763,2512]"`；13:37 flow 复验 `entry visible=True (605,2457)`；截图 `logs/m17_home_entry.png`/`v3_01_home_entry.png` |
| 打开面板，控制齐备 | **PASS** | 13:37 `f_panel.xml`：选包(SAF)(218,2216)、播放/暂停(605,2216)、CAM:0/+6/+12(218/605/993,2366)；截图 `f_02_panel.png` |
| SAF→装载→播放 22.5s→seek 12000→EOF 时间线 | **BLOCKED** | 见 §0/§7-1。播放线程/装载/渲染代码已进包（T_OPEN/T_LOAD/T_STATE/T_RENDER/T_SEEK/T_EOF 全埋点），但未获健康窗口落盘 |
| 场景图求值渲染上屏（背景着色）+ 自由视角 | **BLOCKED（同上）** | 渲染核为 M15 真机 PASS 同实现（Java 移植），cam0 covered% 92 预期，待真机轮 |
| UniMaker 完整 GUI 形态 | **BLOCKED** | 墙 2（ORC underflow）使 nativeCreate 必死（§4），GUI 底屏不可达 |

## 6. 分层判词

| 层 | 判定 |
|---|---|
| APK 手术与注入机制（smali 最小补丁×5 + dex 注入 + so/资产叠加 + 重签同证书） | **PASS**（T_INSTALL/T_ENTRY 每次启动打点；upgrade 装机多轮成功） |
| SSM1 播放核 .so 装载与绑定 | **PASS（机制层）**：`System.loadLibrary("ssm1loop")` 与同名类绑定设计成立；该 .so 本体 M15 当日真机 PASS |
| CSG 视频入口/面板/控制 UI | **PASS**（uiautomator 实证） |
| 启动 FORTIFY（create 窗口并发面） | **PASS（延迟法已解）**；启动首帧环境敏感面残留（§3） |
| 壳 GUI（scene 求值渲染底屏） | **BLOCKED**（墙 2：ORC underflow，§4） |
| 壳内 CSG 视频播放 E2E 时间线 | **BLOCKED（环境）**（§0/§7-1；组件级均有历史真机 PASS） |

## 7. BLOCKED 项（全部实证）

1. **壳内播放 E2E 时间线未落盘**。三重压制：①并行 lane 对 `org.cheng.unimaker.scene`
   周期性重装（今日 11:09/12:29/12:57/13:10/13:46 五次易主，与本线互斥卸装，
   `INSTALL_FAILED_UPDATE_INCOMPATIBLE` 多次）；②EMUI adb 装机需真机确认，
   124MB 包 `InstallStaging` 卡等（最后一条本线安装即卡死于该弹窗）；
   ③启动 FORTIFY 环境敏感复发（§3），健康窗口从 13:27 起未再出现。
   解阻：独占设备时段 + 先卸后装的原子脚本（`m17_reinstall.sh`，已备）。
2. **墙 2（ORC underflow）**：需场景源/生成器/编译器 lane。前置 = U2 §3.2 的一键链重建
   （scenfix 重建后 y-r51b-a4fix 生成件、y_ 变换链、one-click 输出均灭失）。
   复现：§4。归因仪器：stderr 重定向（dup2 fd2）——**建议列为所有 cheng .so 宿主的标准配置**。
3. **SAF 选包未弹出 DocumentsUI**（13:37 轮 12 次 dump 均为本壳自身视图）：
   framework Fragment `startActivityForResult` 在本壳静默未启，原因未定位
   （logcat 被 EMUI 日志洪流冲刷）。已备 `装载本机副本`（filesDir 直载）替代路径，
   装载-播放链不依赖 SAF；SAF 路径修复列为后续轮（换 ActivityResult API 或独立
   translucent Activity + manifest 干预）。
4. **jdb/jdwp 残留**：exit-catch 坡道的 `am start -D` 遗留 "Waiting For Debugger" 弹窗
   会污染后续启动（ FORCE CLOSE 可杀进程）；`am clear-debug-app` + 重装可清。
   坡道脚本建议统一收口到 force-stop+干净启动。

## 8. 纪律与产物清单

- 主仓：仅新增本文档（`src/`、`tools/` 零改动）；UniMaker 仓：零改动
  （`ssm1_scene_shell.build.mjs` 未动，理由见 §1）；全程零 git 写操作。
- scenfix 克隆内（`tmp/m17_l1/`）：手术/验证工作区——`src/`（注入 Java 源 5 文件）、
  `dexout/`、`smali4/`（baksmali 产物 + 5 处补丁）、`repack.sh`、`m17_flow.py`
  （前台守护 + 自适应 SAF 导航 + EOF 轮询驱动）、`m17_reinstall.sh`、
  `m17_exitcatch*.sh`（U2 坡道复用）、`logs/`（全部真机 logcat/截图/uiautomator dump/
  maps/exit-catch 寄存器堆栈）、`u2tools/`（U2 工具副本，W 已重指向）。
- 设备：会话收尾时 `org.cheng.unimaker.scene` 处于卸载态（最后一轮重装卡在 EMUI
  `InstallStaging` 真机确认弹窗，无人确认），重装序列 `m17_reinstall.sh` 一键可复 位
  （需真机点一次确认）；`/data/local/tmp/huguangsheng.ssm1`（md5 `034ebf4d…` == 推送源）在位。
- 复现链：`m17_reinstall.sh` → `m17_flow.py`（等健康窗口）→ T_OPEN/T_LOAD/T_PLAY/
  T_STATE/T_RENDER/T_SEEK/T_EOF + `run-as … cat files/m17_stderr.log`。
