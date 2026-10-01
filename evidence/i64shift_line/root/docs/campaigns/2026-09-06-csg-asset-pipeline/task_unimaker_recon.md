# task_unimaker_recon.md — UniMaker 现状盘点与安卓真机秒开接入面（只读勘察）

日期：2026-09-11。方法：纯只读（read/grep/find/`adb devices`），未构建、未装包、未动设备。
设备实况：`adb devices` → `GBJ0222B24021692 device product:DCO-AL00 model:DCO_AL00 device:HWDCO`（华为真机，HarmonyOS、adb 兼容层报 Android 12，与 r4 evidence 记录同机）。

---

## 1. 项目形态

**UniMaker 是多端 app 仓，内含三个活跃子工程 + 一个半废弃根工程：**

- 根 gradle 工程（`/Users/lbcheng/UniMaker/settings.gradle`，rootProject=UniMaker，include `:app`/`:desktop`）已漂移：`/Users/lbcheng/UniMaker/app/` 只剩空的 `src/main/jniLibs/arm64-v8a/`，无 build.gradle。根 `Makefile` 的 `build-android`/`android-install-arm64` 仍指向 `./gradlew :app:assembleDebug` + `scripts/adb_install_debug.sh`（后者装 `com.unimaker.app` / `app/build/outputs/apk/debug/app-debug.apk`）——**陈旧口径，不能当现役构建入口**。
- 现役 Compose app：`/Users/lbcheng/UniMaker/android/`（rootProject=UniMakerNative，`:app` + core-design/model/storage/bridge + 10 个 feature 模块），applicationId `com.unimaker.native`（debug 后缀 `.debug`），minSdk/targetSdk 由根 ext 决定。`android/app/build.gradle` 的 packaging **明确排除** `libchenglibp2p.so`/`libmsquic.so`/`libssl.so`/`libcrypto.so`/`libc++_shared.so`——即该 app 当前不打包 Cheng libp2p native 库。
- 鸿蒙 ArkTS 工程：`/Users/lbcheng/UniMaker/hongmeng/`（hvigor，bundle `com.example.unimaker`，entry 含 ets pages/services/games/metalid + `entry/src/main/jniLibs/arm64-v8a`）。
- PWA：`/Users/lbcheng/UniMaker/React.js/`（vite PWA，浏览器侧 libp2p/WebDirect 视频链）。

**纯 Cheng 嵌进安卓的三条已验证装配：**

1. **纯 Cheng GUI 场景壳 APK（本次目标形态）**：`cheng-lang/ts-csg/scripts/unimaker-apk-build.mjs` 一条龙，非 gradle——one-click 产 `unimaker-react.scene-runtime.cheng` → chengc `--target:aarch64-linux-android` 编 .o → NDK clang 链 `libcheng_unimaker_scene.so` + `libcheng_scene_runtime_provider.so` + `libcheng_mobile_capi.so` + `libcheng_moq_android.so` + social backend .so → 自组 APK。产物例：`cheng-lang/tmp/goal1-r4-localvideo-apk/app-debug.apk`（package `org.cheng.unimaker.scene`，r4 evidence.json）。
2. **Compose app JNI**：`android/core-bridge/.../ChengLibp2pNative.kt`（6845 行，`System.loadLibrary("p2pjni")`，~200 个 external fun：node/DID/moq fountain/social/gossipsub）。
3. **鸿蒙 NAPI**：`hongmeng/scripts/build_cheng_libp2p_harmony.sh`，DevEco clang，`CHENG_HARMONY_BACKEND_TARGET=aarch64-linux-ohos`，产 `libchenglibp2p.so` 落 `entry/src/main/jniLibs/arm64-v8a`。

一条命令构建：Compose app = `cd android && ./gradlew :app:assembleDebug`；纯 Cheng GUI = `scripts/pwa_cheng_gui_oneclick.sh` + `ts-csg/scripts/unimaker-apk-build.mjs`。

## 2. 纯 Cheng GUI 栈

- **生产路径唯一**（`UniMaker/task_plan.md` L14-16）：`scripts/pwa_cheng_gui_oneclick.sh` → `ts-csg/scripts/unimaker-one-click.mjs --retained-scene-only --mobile-scene-routes-default-catalog` → `unimaker-react.scene-runtime.cheng` + scene CSGC。
- **禁令**（task_plan.md L18-20 + `artifacts/cheng-gui-1to1-campaign-20260825/gap.md`）：`React.js/cheng_codegen/**` 134 模块全是 `generated=false` 桩、`csg_manifest.cheng` status=failed；`ui_host.cheng` 自称 36/36 supported 全是 `equivalent_entry_surface` 谎报——均不得当生产 GUI。真实口径：生产 catalog **47 routes / 10584 nodes**（`goal1-r8b-fullcatalog`），真机已验子集 **11 routes**（r12b/r4）。
- **渲染路径**（`cheng-lang/src/core/tooling/mobile_shell_codegen.cheng` 生成）：Kotlin Activity 全屏 `SurfaceView`（L1461/L1682/L7593）+ 手写 C 宿主 `cheng_generated_android_host.c`：`ANativeWindow` 上跑 display-list compositor（`cheng_mobile_host_present_compositor_frame`，r18 实测 frame=1 layers=2 commands=83）；视频走 `present_media_surface_commands`/`prepare_media_surface_texture` + `AMediaCodec` Annex-B ES 直解到 ANativeWindow（L8258-8582）；另有 glyph SDF/image/svg atlas 上传与离屏截屏（begin/read/end offscreen capture）。逻辑 388x837、framebuffer 1212x2616（r4 evidence.json）。
- **编译器调用**：全部走 cheng.stage3 backend driver；宿主工具 `--target:arm64-apple-darwin`（`mobile_shell_android_tool_main.cheng`），设备侧 `--target:aarch64-linux-android`；鸿蒙 `--target:aarch64-linux-ohos`。语法门禁 `scripts/check_cheng_syntax_gate.sh` + `check_cheng_host_only.sh` 接 make build/verify。
- **真机 GUI 基线**（task_plan.md L21-24 + `ts-csg/docs/unimaker-r18-device-evidence.md`）：r4 本地视频卡 tap→first_frame 503–627ms + AAC；r5 首页分类横排；r18 social bootstrap 真初始化（peer id 来自 `unimaker_android_social_group_backend.cheng` in-process）+ OpenAsset/Play + computer-use 8 模板 633 action 全 replay。
- 仓内 .cheng 计 296 个：React.js/cheng_codegen 159（桩）、.vendored_pkgs/cheng-ai 36、tools/ 60+（rwad/cli 报告工具）、`cheng/react_cheng_mobile_gui` 2、React.js/scripts 10。

## 3. MoQ/libp2p 现状

- **UniMaker 自有网络栈已真机跑过的**：
  - Compose app：`ChengLibp2pNative.kt` 已有 `nativeMoqFountainBuild/BuildPersist/Rebuild`（L6071-6098）、`nativeSocialDmSend`、gossipsub 等；`DistributedVideoRuntime.kt`（686 行）走 fountain/shard/CID 发布。QUIC DM、mDNS、bootstrap smoke 脚本齐全（`scripts/run_native_android_harmony_p2p_gates.sh` 等）。
  - PWA 浏览器路径（`docs/pwa_video_secsec_theory.md` + findings.md L754-1530）：WebRTC datachannel + TURN，android Kiwi receiver segmentCount=12 PASS；harmony Kiwi publisher 双轨切段失败、TURN host lookup 缺陷、moq_fountain rebuild 模板跨 TURN 拉取超时等 FAIL 记录齐全。
- **原生 Cheng MoQ**：`artifacts/cheng-gui-1to1-campaign-20260825/a_nm_iso_moq_fountain.compile.log` 是 2026-08-25 把 moq_fountain 隔离编进 Android native module 的**失败**记录（rc=2 borrowed source requires explicit share）；该阻塞由本战役（2026-09-06/07）在 cheng-lang 侧解决。
- **本战役成果在 UniMaker 规划文件的落账**（findings.md L1533-1539）：moq_pub/moq_sub/relay 三进程链 macOS 主机全链路跑通；门②③秒开代理 hgs 1255-1327ms / maitian 1098-1193ms；秒发 maitian 310-352ms、hgs 993ms（高负载超门 1185-1206ms）；**relay 响应回程 bug 未定位**（进程内双角色写路径），计划 S7「发布端→relay→PWA/纯cheng播放器」。
- **「MoQ serve exit(1) 已隔离」「35 路由」「lane 拒 __cht_apply」**：UniMaker 仓全树 0 命中（`__cht_apply` 无任何文件出现；规划文件无 35 路由记录）。这三条是 cheng-lang 主仓战役侧的新事实，**UniMaker 未记录**；UniMaker 侧路由口径是 47（生产）/36（ui_host 谎报）/11（真机已验）。接线时以主仓战役文档为准，勿引 UniMaker findings 当最新态。
- **鸿蒙 MoQ 接口面已预留**：`hongmeng/scripts/build_cheng_libp2p_harmony.sh` export roots 含 `libp2p_moq_stream_open/read/close/serve_once` + `cheng_mobile_host_moq_*_bridge`；`cheng_moq_android.so`（apk-build 内 `MOQ_ANDROID_LIB_NAME`）带 UDP socket exports（libc_socket/sendto/setsockopt/recvfrom，unimaker-apk-build.mjs MOQ_PUBLISHER_CP_ROOTS）。

## 4. 真机部署配方

- 设备：DCO-AL00，serial `GBJ0222B24021692`，adb 正常（本次实测）。r4 evidence.json 记 "DCO-AL00 Android 12 (adb GBJ0222B24021692)"——与今同一台。
- 安装链：`scripts/adb_install_debug.sh`（`adb install -r -d -g`、logcat 过滤、启动 activity）——指向陈旧根工程，口径需换；`scripts/run_pure_gui_prod_closedloop.sh`（`make pure-gui-closedloop`）内建检测在线 serial → 装 `org.cheng.unimaker.scene` → 点击烟测 + 截图 + logcat 证据（`ChengMobile/ChengSurfaceView`），r4/r5/r18 均打到本机。
- 双机（安卓+鸿蒙）烟测框架：`scripts/run_android_harmony_moq_video_smoke.sh`——adb+hdc 双目标，推样例 mp4 到 `/data/user/0/com.unimaker.native.debug/files/automation-input/`（鸿蒙 `/data/storage/el2/base/files/automation-input/`），hilog `-T UM-AUTO` 采集，产 summary.json/md；fountain 基准 `scripts/run_android_moq_fountain_benchmark.sh`（样例 `React.js/public/pwa-smoke/content-smoke-video-cmaf.mp4`）。
- hdc：`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc`；`hongmeng/scripts/release_hongmeng.sh` 有完整 hdc 安装链；鸿蒙 ArkTS 工程 entry 可装（`com.example.unimaker`）。
- 鸿蒙 Cheng 侧：`hongmeng/scripts/build_cheng_libp2p_harmony.sh` 全链（cheng.stage3 + ohos clang，产物符号 `llvm-nm/readelf` 校验）已脚本化。

## 5. 接入面评估（SSM1 播放核 + cheng libp2p MoQ → UniMaker）

最小改动面结论：**不需要子进程**。场景壳已是「in-process Cheng .so + 手写 C 宿主」形态，且有现编先例——`unimaker_android_social_group_backend.cheng` 由 apk-build.mjs 用 cheng.stage3 现编进 APK。同法嵌 SSM1：

1. **传输层**：`libcheng_moq_android.so` 已带纯 Cheng UDP/QUIC socket exports；快速首显可叠 `libcheng_mobile_capi.so` 现成 `MobileCapiMoqFountainRebuild`（fountain 先显、MoQ 顺序流后跟）。SSM1 场景流订阅端按战役侧 `task_ssm1_moq_opensmoke.md` 契约接。
2. **播放调度核**：`src/game/assets/stream/player.cheng`（PlayerInit/Play/Pause/SetRate/Seek/Tick，本战役已 PASS）编进 scene-runtime provider 同闭包，替换/并列 `web_scene_runtime` 的 media_lifecycle 取数。
3. **画面出口（两条现成路径）**：(a) SSM1 chunk 若产 Annex-B ES → 直接复用 `prepare_media_surface_texture` + AMediaCodec 直解 ANativeWindow（r4 的 503-627ms 首帧走的就是这条）；(b) 原始帧 → display-list/texture 上传（upload_image_atlas / present_media_surface_commands）。首帧打点复用 `first_media_frame` 计量（unimaker-capture-main.c `CHENG_CAPTURE_MEDIA_OPEN_PLAY`）。
4. **坚持 stdin/stdout daemon 形态的代价**：C 宿主可 fork+pipe 喂 nativeLibraryDir 下的二进制，但 UniMaker 全部现成装配无 exec 先例，且会引入第二份 Cheng runtime（见风险 2）。**in-process provider .so 是最小面**。
5. **鸿蒙第二阶段**：`libp2p_moq_stream_open/read/close/serve_once` export 面已预留；ArkTS 侧 XComponent surface 接 display list。

## 6. 建议接线方案（安卓真机秒开验证）

- 步骤 1：以 r18 基线管线（one-click + unimaker-apk-build.mjs）为准，新增 provider .so：SSM1 播放核 + MoQ 订阅（cheng.stage3，`--target:aarch64-linux-android`），导出 C ABI（ssm1_stream_open/ssm1_next_chunk/ssm1_frame_pull），并按 apk-build 现有模式挂 `scene_runtime_provider` 的 BIND_NOW 依赖与 export roots。
- 步骤 2：C 宿主把 ssm1 输出接 present_media_surface（ES→AMediaCodec）；logcat 打点 `first_media_frame` + `present_media_surface`。
- 步骤 3：验收复用 `run_android_harmony_moq_video_smoke.sh` 框架（推 fixture、双端 log、summary.json），门限直接沿用战役门①②③口径。
- 步骤 4：直连发布端优先（relay 回程 bug 未解，见风险 1）；鸿蒙 hdc 侧作第二阶段。

## 风险清单

1. **relay 响应回程 bug 未解**（UniMaker findings.md L1538-1539）：进程内双角色（server listener + client dial）写路径响应收不到；真机验证先用直连/serve 模式绕开 relay 架构。
2. **双分配器即崩**（unimaker-apk-build.mjs L148-150 注释原文：two allocators in one process crash the render thread）：新 .so 必须依赖 `cheng_scene_runtime_provider`，复用同一套 cheng_malloc/free，禁止再载独立 Cheng runtime。
3. **`android/app` packaging 排除列表**（android/app/build.gradle L103-112）：走 Compose app 路线需先解除 libchenglibp2p.so 排除并解决与 libp2pjni 的符号/allocator 冲突；场景壳路线不受影响。
4. **秒开门 CPU 预算**：fountain 并行 SHA256 在主机高负载下已超门（findings.md L1537）；真机 SoC 更弱，门①预算需真机重测。
5. **ORC/ARC 编译器缺陷史**：跨线程 owned str 转移曾 registry_miss，CloneStr 源级规避已落（findings.md L1536）；新编译器落地后需复核这些规避点。
6. **设备双轨风险**：DCO-AL00 是 HarmonyOS，当前 adb 兼容层可用；若升 NEXT 则 adb 消失，需 hdc+NAPI（接口已预留但鸿蒙 libchenglibp2p.so 现成实体未在本次验证）。
7. **构建入口漂移**：根 Makefile/settings.gradle 指向无 build.gradle 的 `:app`；文档口径必须固定为「场景壳=one-click+apk-build.mjs；Compose app=android/gradlew」。
8. **证据口径**：React.js/cheng_codegen 桩、ui_host 36/36、单次 smoke 均被 task_plan.md 明令禁止当完成证据；真机路由覆盖仅 11/47。
9. **UniMaker 规划文件滞后**：serve exit(1)/35 路由/__cht_apply 等战役新事实未落 UniMaker；两仓 findings 不互通，接线结论一律以主仓战役文档为最新态。
