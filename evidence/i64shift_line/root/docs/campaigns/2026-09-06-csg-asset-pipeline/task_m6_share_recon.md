# task_m6_share_recon.md — UniMaker 分享/social 链路只读盘点与 SSM1 接线方案（M6 前置勘察）

日期：2026-09-11。方法：纯只读（read/grep/find/unzip -l），两仓零修改、零 git 写操作、零构建。
目标：把「CSG 视频分享→秒发→接收端 CSG 播放器秒开」接进 UniMaker 视频分享功能的战场侦察。

---

## 1. 分享功能形态

UniMaker 有**三套并行分享链路**，只有一套是纯 Cheng 场景壳（M6 目标形态）：

### 1.1 纯 Cheng 场景壳（org.cheng.unimaker.scene，目标宿主）

- **入口路由**（47 路由 catalog，20260826 one-click 产物，`/Users/lbcheng/cheng-f24/anchor_clones/apkdev/src/tools/generated_ssm1_oneclick/one-click.summary.json` routeReachability）：分享/社交相关 =
  - 发布类 12 条：`publish_selector`（发布类型选择器）+ `publish_ad/content/food/graphic/live/movie/music/novel/product/ride/secondhand`；
  - feed 类：`home_default`（首页 feed，视频卡 `home_content_detail_open_vid_hgs`/`vid1`）、`content_detail`、`home_graphic_channel`/`home_app_channel`；
  - 社交图：`marketplace_social_picker`、`tab_messages`、`message_thread(_more_panel_open)`、`tab_nodes`、`node_detail`、`node_published_content`、`node_thread(_more_panel_open)`。
- **语音/Computer-use 发布场景**（r18 全 replay 的 8 模板里 6 个是发布/feed 类）：`publish_short_video_draft`（目标组件 `app/components/PublishVideoPage.tsx`，步骤=选视频→SetDescription→SetTitle→发布）、`publish_ad_video_draft`、`authorized_product_publish_draft`、`feed_filter_review`、`content_like_review`、`content_search_review`、`message_history_browse_review`。来源：`apkdev/.../runtime/unimaker_computer_use_manifest.json` templateIds + `cheng-lang/ts-csg/docs/unimaker-r18-device-evidence.md`。
- **发布链路实况：发布动作不传输任何字节。** 场景壳的 social backend 是 `cheng-lang/src/libp2p/mobile_ffi/unimaker_android_social_group_backend.cheng`（967 行）：`social_publish_enqueue`（L813）对任意 postJson 恒回 `{"ok":true,"task":{...,"publishState":"published"},"topic":"cheng/android/video/local","delivered":1}`——罐头应答，无传输；`social_feed_snapshot`（L835）返回的是 **UDP DM inbox**：对端直发 `MSG|peerId|conversationId|messageId|hexBody` 帧（单帧 ≤4096B 收包缓冲，inbox 总量上限 `GroupInboxCapBytes=32000`，L46-48），随 `sgDrainListen` 从 listen fd（端口 `GroupHostDiscoveryPort=48651`）drain。即：**发现=mDNS/LAN 邻居 + 定向 UDP；载荷=仅小 JSON；无分块、无存储、无大文件通道**。
- **接收端发现与拉取**（场景壳内）：无拉取。video 卡内容来自 one-click `--mobile-content-snapshot` 固化进包的本地 mp4（见 §3）；r18 真机 log 里 `present_media_surface ready commands=2 video=2` 是首帧就绪的本地卡。

### 1.2 Compose app（com.unimaker.native，真传输在这里）

- `android/core-bridge/.../ChengLibp2pNative.kt`（6845 行，~200 external fun）：`nativeMoqFountainBuild/BuildPersist/Rebuild`（L6071-6098）、`nativeSocialDmSend`、gossipsub、QUIC DM。
- `android/app/.../media/DistributedVideoRuntime.kt`（686 行）：fountain/shard/CID 全流程发布（descriptor→droplets→rebuild template，对象分块 `source_block_bytes`）。
- `android/app/.../NativeAppViewModel.kt`：`socialPollEvents/socialDmSend`（L514-535）、feed 聚合 `messageMoments`（L725）、`publishPlatformMdnsPeersToSocial`（L5398）。
- 注意：`android/app/build.gradle` packaging **排除** libchenglibp2p.so 等四个 Cheng so（L103-112，task_unimaker_recon.md 风险 3）——该 app 当前不打包 Cheng native 库，真传输是历史验证态、非现役安装包路径。

### 1.3 PWA（React.js 浏览器链）

- 理论上限：**≤32MB 短视频**，libp2p signal + webDirect（WebRTC datachannel）+ TURN relay（`UniMaker/docs/pwa_video_secsec_theory.md` L3；SCTP maxMessageSize 65536）。
- 载荷三态：`webdirect` / `moq_fountain_v1` / `segmented_moq_v1`（`UniMaker/React.js/app/data/p2pMedia.ts` L37-39）；segmented=CMAF fMP4 切段（`remuxFragmentedMp4.ts`），32KB chunk（L190 注释），**接收端从可靠 ingress HTTP 拉段**（L61 注释原文）。
- 发布 UI：`app/components/PublishVideoPage.tsx` 等 Publish*Page 家族；feed UI：`app/components/EcomFeedPage.tsx`（M3 墙 C：现行 materializer 对 L112 `shape=jsx-drop-map` throw）。

### 1.4 maitian/maitain 是什么

**是测试视频资产名，不是发布动作名。** `maitian.mp4`（麦田，5547ms / 2 段 / 1.31MB）是 pwa-content-media-sync 系列真机 smoke 的样例视频（`UniMaker/findings.md` L1414-1419、`UniMaker/progress.md` L1352-1378）；仓内源文件在 `cheng-lang/ts-csg/platform/harmony/ChengGuiDemo/entry/src/main/resources/rawfile/maitian.mp4`（`ts-csg/scripts/unimaker-one-click.mjs` L391-394：场景卡 `vid1`→maitian.mp4、`vid_hgs`→hgs_faststart.mp4 胡广生）。「秒发 maitian 310-352ms」是本战役 MoQ-E2E 门①用该资产测出的数字（campaign findings）。「maitain」拼写全两仓 0 命中，系笔误。

## 2. r18 真机形态

- **r18 social bootstrap**：场景壳 APK `org.cheng.unimaker.scene`，versionCode 1800000022/23，`ts-csg/scripts/unimaker-apk-build.mjs` 自编 `unimaker_android_social_group_backend.cheng` 为 `libchenglibp2p.so`（DT_NEEDED=scene-runtime-provider+generated-host，`-Wl,-z,defs`），进程内真初始化、peer id 来自 dataDir 种子（`ts-csg/docs/unimaker-r18-device-evidence.md`：`Libp2pNative: init: success handle=1`、`getLocalPeerId resultLen=52`、633 action 8 模板全 replay、video 卡 tap→`OpenAsset/Play` receipt）。
- **social 相关场景是否可编——纠偏一条关键误读**：M3 §6-A 的「**8/26** 存量场景源」是**日期（20260826 产物）**，不是「26 个源撞 8 个」。不存在「可编 18 源」集合。实况：场景源是**单体** `unimaker-react.scene-runtime.cheng`（3.78MB、1192 个 fn、47 路由一体，`apkdev/src/tools/generated_ssm1_oneclick/`），在 bootstrap/cheng.stage3(8/31) 与 w126_re(9/7) 下**整体编译失败**——driver 在首个借约错即硬停，每轮探针日志只报 1 个错且轮轮换位点（`apkdev/artifacts/mobile_m3/scene_w126_probe{,2,4,5,6}.stdout.log`：caller 分别为 `__csg_scene_parse_positive_int`/`__chtJsonOf_DistributedGeoPublic`/`__csg_scene_apply_clear_published_contents`）。**结论：social 路由与全部 47 路由同生共死，不可单独绕开；任何依赖「18 可编源」的排期作废。**
- r18 时代的 APK/.so 实体已不在树内（`ts-csg/src/.gen/oneclick-r12-computer-use/` 已清空）；现存最近代完整场景壳实物是 20260826 存档 `/Users/lbcheng/UniMaker/artifacts/cheng-gui-1to1-campaign-20260825/a_device_apk_libs/scene.apk`（178MB，含 `libcheng_unimaker_scene.so` 27.6MB、`libcheng_moq_android.so` 14.3MB、`libcheng_scene_runtime_provider.so`、`libchenglibp2p.so` 77KB——**8/26 旧 Nim 版 social backend**，非 r18 Cheng stub 版）。可作 repack 实验体，但 social bootstrap 是旧态。

## 3. 分享大文件能力（2.96MB 承载）

| 链路 | 实证承载 | 来源 |
|---|---|---|
| **战役 MoQ（SSM1 载体，已真机）** | **huguangsheng.ssm1 = 2,955,365 B（=目标 2.96MB）45 chunks**，真机 WiFi ready→首帧 64ms 中位（M5 r5），manifest 4625B + 64KB 段粒度，sha256 逐轮一致 | `apkdev/artifacts/csg_asset_pipeline/huguangsheng.ssm1`、`task_m5_transport_opt.md` §1-3 |
| PWA segmented/WebRTC | ≤32MB 设计上限；maitian.mp4 1.31MB/2 段 android receiver 6/6 PASS；segmentCount=12（Kiwi receiver） | `pwa_video_secsec_theory.md` L3、`UniMaker/findings.md` L1414-1419/L935 |
| Compose fountain | 分块 fountain/shard（对象级），无固定上限记录 | `DistributedVideoRuntime.kt` |
| 场景壳 social backend | **不可承载**：UDP 帧 4096B/inbox 32000B，`social_publish_enqueue` 不传输 | `unimaker_android_social_group_backend.cheng` L46-48/L813 |
| Nim 全量后端（未接线） | 有真 feed：`libp2p_feed_publish_entry`（gossipsub/DM 双路投递）+ `libp2p_register_local_file`/`libp2p_request_file_chunk`（分块拉文件，maxBytes 参数） | `unimaker_compat_ffi.cheng` L8170/L8619/L8745 |

**判定：场景壳现役分享链路装不下 2.96MB；唯一已真机验证的 2.96MB 通道是战役 SSM1-over-MoQ（M5）。** 另注：`hongmeng/entry` PublishCenterService 有 32KB 分块 RPC 推拉（`nativeMediaRpcBinaryChunkBytes=32*1024`，L475）+ moqFountain，鸿蒙侧承载见 §5。

## 4. 接收端播放面（present_media_surface / AMediaCodec）

宿主 C 全部在 `cheng-lang/src/core/tooling/mobile_shell_codegen.cheng` 生成（34982 行）：

- **触发链（真机已验）**：视频卡 tap → 场景事件 → media receipt `OpenAsset`→`Play`（r18 log `post_tap_media_receipt`）→ 宿主开媒体 fd：`cheng_android_open_media_asset_fd_for_read`（L15060）三择一 = ①AAssetManager 包内资产（RANDOM）②本地文件 URI（`files/automation-input/` 先例）③**远端拉取落盘缓存**（`cheng_android_fetch_remote_media_to_cache` L14983：对端 host/port 来自系统属性 `debug.cheng.media.peer.host/port`，默认 38000，经场景 export `cheng_scene_media_fetch_remote_announced_to_file` 在渲染线程拉全量文件）→ AMediaExtractor → AMediaCodec → EXTERNAL_OES SurfaceTexture → compositor media surface。
- **秒开 ES 直解路径（已备）**：`ChengAndroidEsStreamCtx`（L8401 注释原文）——生产者推 **Annex-B ES access units** 入 128 槽环形 FIFO（单帧上限 256KB），渲染线程泵直喂 AMediaCodec（无 Extractor/无容器解析）；`es_open` 在 announce+index（KB 级）落地即学 w/h/fps 并配解码器，首 IDR 解出远早于全文件下载。配套 QUIC 拉取泵 `cheng_pump_media_fetch_on_runtime_thread`。
- **present_media_surface_commands**（L20398）：int32 命令批（rect+资产哈希），compositor 把视频层合进 display-list（r18 `present_media_surface ready commands=2 video=2`）。
- **外部纹理注册口**：`cheng_mobile_host_register_media_surface_texture(kindCode, surfaceKind, textureProvider, slotHash, assetHash, manifestHash, posterHash, glTexture, w, h, pixelFormat)`（L17168）——**外部生产者可把自产 GL 纹理注册进视频槽**，pixelFormat 参数接受 `GL_RGBA8` 或 `CHENG_ANDROID_MEDIA_TEXTURE_TARGET_EXTERNAL_OES`(36197)。
- **BGRA/深度图可否走同一 surface：可，走 RGBA 上传/注册路径，不走 AMediaCodec。** 图像上传全部 `glTexImage2D(GL_RGBA8, GL_RGBA, UNSIGNED_BYTE)`（L14133/L16118/L16875 poster 路径），**无 GL_BGRA 引用——BGRA 输入需字节序重排成 RGBA 后再上传**；深度图现成灰度管线 `src/tools/ssm1_depth_preview.cheng`（DPD1 uint16 → min/max 实域归一 → 8bit 灰度，PGM P5），灰度可扩成 RGBA 或按 atlas 的 GL_R8 路径（L17742）上传。深度帧每帧走 CPU 上传即可（视频层合成不变）。

## 5. 鸿蒙侧

- **social/分享对应物：有，且比安卓场景壳更全（NAPI 绑定面）**：`hongmeng/entry/src/main/ets/services/Libp2pRuntimeService.ets` L493-538 绑定了完整 C ABI 清单：`socialPublishEnqueue/socialFeedSnapshot/socialMomentsPublish/socialDmSend/feedSubscribePeer/moqStreamOpen/Read/Close/moqFountainBuild/Rebuild` 等；`PublishCenterService.ets` 实装发布链（moqFountainBuildRaw/RebuildRaw、`pushNativeMediaAssetToPeer`/`fetchNativeMediaAsset` 32KB 分块 RPC、`segmented_moq_v1`，L472-530/L2606/L3321）；`DistributedVideoRuntime.ets` deliveryMode=`moq_fountain_v1`。native 侧 `hongmeng/scripts/build_cheng_libp2p_harmony.sh` 产 `libchenglibp2p.so`（export roots 含 `libp2p_moq_stream_open/read/close/serve_once` + `cheng_mobile_host_moq_*_bridge`）。
- **SSM1 在鸿蒙：已进 HAP**（M4b）：`hongmeng/ssm1smoke/`（bundle `com.example.unimaker`，独立 hvigor 工程）+ `hongmeng/scripts/ssm1_napi_shim.c`（`ssm1Cmd` 包装 `ssm1d_cmd`；`ssm1d_load` 内存装载可用）+ rawfile 内嵌 huguangsheng.ssm1（2.96MB）→ 沙箱 → 协议序列 PASS。**缺显示面：ssm1smoke UI 是纯文本 log（`ssm1smoke/.../pages/Index.ets`），无 XComponent/NativeWindow 视频先例**。
- **无纯 Cheng 场景壳**：r18 doc「Harmony HAP build/run」仍 open；鸿蒙 UniMaker 主工程是 ArkTS pages（`PublishAppPageNative.ets` 等），`SocialExtensionService.ets` 只是应用选择器状态、无传输。
- **最小可行替代**：不走场景壳——分享发布/发现复用 Libp2pRuntimeService 既有 NAPI 面（feed entry + moqStream serve_once / 32KB 分块），CSG 载荷走 SSM1（`ssm1d_load` 内存装载，无需落盘中转），接收端显示用 XComponent + OH_NativeWindow 新接（工作量集中点）。

## 6. 「SSM1 接进分享链路」建议接线方案

### 6.1 安卓（场景壳形态，推荐主攻）

**载荷通道用 M5 已验证的 SSM1-over-MoQ，不碰 Nim 后端，不改 social backend stub 的应答合同（发布回执照旧，真实传输旁路挂 SSM1）：**

1. **发布端**：`publish_short_video_draft` 发布动作落地后，由新增 provider `.so`（M3 已建 `src/tools/ssm1_unimaker_provider.cheng` 装配线，`UniMaker/scripts/ssm1_scene_shell.build.mjs` 阶段①②绿）扩展导出 `ssm1_publish_serve(packPath, port)`——打包 stream.ssm1 + 起 M5 语义 serve（`src/tools/ssm1_moq_serve.cheng` 已入主仓，d9052010…）；同秒经既有 `social_dm_send` UDP 通道向已发现 peer 发 feed entry 指针 `{assetCid, host, port, bytes=2955365}`（<1KB，远小于 32KB inbox 上限，合法载荷）。
2. **接收端**：`social_poll_events` 收到 entry → 点开视频卡 → 不走 `cheng_android_fetch_remote_media_to_cache` 全量下载，改调 provider `ssm1_moq_open(host, port)`（=M5 fetch 语义进 .so），首 keyframe chunk（64KB 段，真机 64ms）落地即 `prepare_media_surface_texture` + ES/解码首帧；后续 chunk 流式喂 `ChengAndroidEsStreamCtx` 或直接 ssm1 tick 解码→RGBA 注册纹理。
3. **装配**：全部走 `ssm1_scene_shell.build.mjs` 既有四步（provider 超集导出根 + DT_NEEDED + BIND_NOW + version script），`libcheng_moq_android.so` 的 UDP/QUIC socket exports 已在包内（apk-build MOQ_PUBLISHER_CP_ROOTS）。**前置硬依赖：M3 §6-E（.so 分体下 ssm1_open 静默 exit(1)，按壳 app-init 序列接线复核）+ M3 §6-A/B/C/D（基础场景壳重建四墙）任一解阻**——无基础壳则 L1/L4 无法验收。
4. **替代捷径（不推荐当正式）**：对 20260826 存档 `scene.apk` 做 .so repack 叠加 ssm1 provider——包体在、social 是旧 Nim 版会 hang，仅可当 L2 层实验体。

### 6.2 鸿蒙（ArkTS + NAPI，第二阶段）

1. 复用 `hongmeng/ssm1smoke/` 工程（M4b 全链已通：hvigor 打包、签名、rawfile 装载、真机 PASS），把 `ssm1napi` 平移进 entry 工程（CMake IMPORTED + externalNativeOptions 通道已证）。
2. 发布：PublishCenterService 已有 `pushNativeMediaAssetToPeer` 分块推——新增 SSM1 分支：pack 后经 `ssm1Cmd`/`ssm1d_load` 挂载 + moqStream serve（export 面已预留）；feed entry 走 `socialMomentsPublish`。
3. 接收端显示：新接 XComponent + OH_NativeWindow，把 ssm1 解码帧（深度→灰度→RGBA 或 ES 直解）画上 surface——这是鸿蒙侧唯一无先例的新面。
4. 注意 M4 记录：真机 shell 域 exec 被 SELinux 封死，必须 HAP 形态；M2/M5 的 relay 回程 bug 未解，直连 serve 模式优先。

## 7. 风险清单

1. **场景壳重建四墙未解（最高优先）**：借约合同（wall A，单体场景源全灭，「18 可编源」是误读）、backend_driver 零值初始化禁令（B）、jsx-drop-map+9911 条诊断（C）、glyph-sdf 静默失败（D）。四墙不解，安卓 L1 验收无宿主。（`task_m3_unimaker_integration.md` §6）
2. **SSM1 .so 分体初始化合同（M3 §6-E 独立开放项）**：三 .so 下 `ssm1_open` 静默 exit(1)；接线方案①的 provider 全部依赖它收敛。
3. **feed 指针通道的送达语义弱**：social stub 的 UDP DM 是 fire-and-forget（4096B 帧、32KB inbox 溢出即整表重置，`sgInboxAppend` L610-623），entry 丢失无重传——秒发确认需应用层 ACK 或复用 `social_dm_ack`。
4. **discoverability**：UDP 直发依赖 mDNS 已发现的 peer:port（48651）；跨网段/NAT 无方案（relay 回程 bug 未解，`task_unimaker_recon.md` 风险 1）。
5. **双分配器禁令**：新 .so 必须 DT_NEEDED scene-runtime-provider（`unimaker-apk-build.mjs` L148-150）；ssm1 provider 已合规，后续扩展不得引入第二 runtime。
6. **compose app packaging 排除**（`android/app/build.gradle` L103-112）：任何想借 Compose app 壳打包 Cheng so 的捷径先撞排除列表 + libp2pjni 冲突。
7. **鸿蒙显示面零先例**：XComponent+NativeWindow 是 hongmeng 侧唯一纯新增工作块；ssm1smoke 文本 UI 不能当播放证据。
8. **深度帧 CPU 上传预算**：BGRA→RGBA 重排 + 每帧 texImage2D 在 1212x2616 framebuffer 上未实测，深度流（DPD1 uint16）大分辨率时需先量。
9. **证据口径**：r18-era APK 实体已不在树内，现存 20260826 `scene.apk` 的 social 是旧 Nim hang 版——不得当 r18 证据引用；「maitain」不存在，写作 maitian.mp4（资产）。
