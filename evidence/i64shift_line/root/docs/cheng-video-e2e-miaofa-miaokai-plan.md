# Cheng 原生 GUI 视频「秒发 · 秒开 · 丝滑完整播放」端到端方案

> 2026-07-05 立项正典。正文=当前真相与计划；实测推翻即改正文，禁尾部订正链。
> 侦察来源：工作流 wf_05477724（四维并行，全部实测背书）。

## 0. 实测真相基线（推翻旧账，以此为准）

| 主题 | 定谳 | 证据 |
|---|---|---|
| 吞吐天花板 | **159KB/s 已作废**。O(512) 重组扫描修复已在树（native_runtime.cheng:1623）。新实测 loopback 冷连接 1.17MB/s = 原片 3.6-4.5x 余量（胡广生 262KB/s、麦田 324KB/s，ffprobe 真资产） | 两进程 pub/sub 127.0.0.1 实跑，64KB object fetch 56ms |
| 每包成本成分 | 视频 QUIC app-data **不加密**（SendPayload 只 header+concat 直发，native_runtime.cheng:2709）。成本=framing/alloc/**每包立即 ACK**（:4122）；crypto≈0，旧"7.4ms crypto 占 1/3"作废 | grep 全 quic + 微基准（ChaCha 13MB/s、AES-GCM 2MB/s 均远超视频需求） |
| 秒开真延迟 | 冷 QUIC 握手 846-868ms，**归因定谳（7/6 实测，推翻旧"X25519+ECDSA"账）：96% = 服务器 CertificateVerify 单次 RSA-PSS 私钥签名 817ms**（544-bit 测试叶证书, rsa.cheng:1731 全宽 bigModExp 非 CRT, bigModMul ~1ms/次 分配 churn 主导）；100% CPU 绑定（user≈wall, 0 vol-ctx-switch, 无定时器等待）；X25519 4×2.4ms、RSA 验签 15ms、其余 ~30ms。ECDSA 在此路径未被使用。**修复杠杆按性价比：①叶证书 RSA→ECDSA P-256（sign 18ms, 现成策略, 预计 850→~200ms）②RSA 走已存在未用的 CRT 路径(rsa.cheng:1555, 2-4x)③bigModMul 分配 churn 根治④会话恢复/0-RTT=暖态 ≤100ms 真杠杆**。negotiate 3ms、fetch 首字节 3ms 不变。**杠杆①已落地实测（7/6）：ConfigureTls 换 ECDSA transport 策略后 loopback 860→560ms、两进程真视频 connect_dial=563ms（-35%）；同轮真视频（麦田.mp4 1.8MB faststart）publish_total_ms=944 = S1 秒发门 ≤1000ms 在该资产达标（胡广生 5.9MB 待测）；残余 560ms 主导=ECDSA verify（88.2ms/次×3 verify 在临界路径）。**杠杆③ churn 归因证伪（7/9 实测 crypto_handshake_bench A/B）：verify 走定长 P256Fixed Montgomery 路径，bigModMul(944us) 根本不在其中；per-call ctx-build 仅 69ns(0.7%)、field-mul 10.4us 是 16×16 分解绕过 cold uint64 32×32 miscompile 的硬地板（后端禁区）——churn 非瓶颈。真根因=点乘 doublings 数不对称：sign 早已走 comb6(43 doublings)，但 verify 的 u1·G 却走 wNAF(256 doublings)。杠杆③已落地：verify 的 generator 半程 wNAF→comb6（`pointMulGeneratorComb6Fixed`，与 wNAF 全比特逐位等价，sign/verify 向量+24 例 sign→verify 往返正负例全绿），verify 88.2→69.2ms(-21.5%)、全程 in-process TLS13 握手 482→424ms(-12%, ~58ms/握手)、crypto bundle 289→229ms、ci_gate 35/35。残余主导已转为 u2·P 变基点乘 256 doublings（单变基点无预表 = doublings 硬地板，windowed 仅省 adds ~5ms 收益小/风险高，未做）→ 下一真杠杆=暖态会话恢复/0-RTT ≤100ms**。注意 v0.1 ingest 拒 moov-after-mdat（.orig 未 faststart 版会报 relocation） | loopback 复测 + rsaBigSignPssBytesScratch 817ms + 两进程真视频实跑 |
| 发布内容 | GUI 发布按钮永远发布**写死的 maitian.\* 六件套**（cheng_gui_host.c:6642→media_moq_publisher_main.cheng:466-471）；Android cheng_host_publish=空 no-op；用户选中视频（mediaPayloads uri）**全仓库无发布读取者**；参数化发布 `WebSceneMediaOrchestratePublishLocalFile`（web_scene_media_orchestrator.cheng:54）已存在只被测试调用 | grep+链路逐环节 |
| 设备侧资产生成 | 无 demux/ES-index/fountain 就地流水线——maitian.h264/.moqidx 是开发机 ffmpeg 离线预烤（tools/gen_moq_es_index.mjs） | |
| feed 发现 | 首页 feed=构建期静态快照（unimaker-pwa-content-snapshot.json 3 条，sourcePeer 硬编码 192.168.1.3/4）。**运行期分布式 feed 层完整存在**（unimaker_compat_ffi NodeRuntime：gossipsub/feedservice/synccast/feedSnapshotJson）但只接旧 Kotlin 反射壳；生产 GUI 的 synccast 桥=abort() 桩（cheng_gui_host.c:6502），CMake 不链 | |
| peer 透传 | **接线已落**（5521ce0e7 起）：snapshot `sourcePeer`→manifest.peerHost/Port→slot writer/reader/prepare ABI→host `s_fetch_peer_host`→`es_open(dial_host,port)`；空 peer=本地语义响亮（无 `.3` 硬编码兜底）。**2026-07-15 补洞**：mobile 非 asset 内联建槽路径补 peerHost/peerPort 赋值（此前仅 desktop 内联+binary 路径有）。残余：全局单 ES 会话未改 per-slot 连接池 | materializer/one-click/scene-runtime/host gen 全链 + feed_prewarm_plan pure smoke |
| 播放现状 | 完整流式播放=**鸿蒙独占**（安卓 host 仅首帧解码）；语义=短片无限循环（桥/host/本地三处 wrap，无 EOS/时长/进度/seek）；缓冲三级有界（FIFO cap128/ring cap6/RGBA 池）内存平稳；欠载=冻帧+最新帧追赶；**音频=独立 OH_AVPlayer 循环本地 AAC，零同步，暂停不停音频根修已落 b66e42763（真机行为=deviceOnly）** | ffprobe：麦田 5.55s/333f、胡广生 22.5s/675f |
| 秒开仪表 | **GUI host 已埋**：`open_to_first_frame route=… total/spawn/dial/index/fetch_decode/present + t0_ms/t1_ms/t2_ms` 经 `cheng_media_diag`；oracle `RE_OPEN_TO_FIRST_FRAME` 已采。真机暖态 <100ms 数字=deviceOnly 待窗 | host gen present 路径 + device-perf-oracle |
| "hash 匹配 0ms" | =内容寻址取段快+SHA256 校验（assetCid 贯穿），**不是**本地缓存跳过取；现存三层缓存全是播放中缓存，无 feed 级预取 | |
| 360p-first 兜底 | **判定违规**（遮蔽可修的 framing/ACK 热路径）。仅当真机 WiFi 复测确证链路（非 CPU）不足且 framing lever 榨干后，作为真实链路 ABR 才合规 | |

## 1. 终局验收口径（双真机硬门禁）

1. **秒发**：GUI 选片→点发布→`publish_total_ms（ingest+listen）≤1000ms`（真视频实测，禁 2KB fixture 下结论）；发布结果回传 GUI（cid+可视反馈，不再 hilog 即完）。
2. **秒级可见**：对端发布→我的 feed 卡出现 ≤3s（gossipsub announce→feedSnapshot→scene 插卡）。
3. **秒开**：tap→首帧 ≤100ms（暖连接态）/ ≤500ms（冷态）；host 埋点拆段（dial/negotiate/announce/index/首帧 fetch/decode）。
4. **丝滑完整**：整片播到尾（EOS 语义），present p95 ≤1.5×帧周期、stall=0、**surf-OUT 推进检查**（防冻帧假绿）、RSS 斜率≈0、es-sink-rate ≥fps；音频阶段后音画偏差 <80ms。
5. **完整性**：订阅端 fetch hash == 发布端 asset_cid 全程硬断言。

## 2. 分阶段实施（每段独立验证门）

### S1 发布真内容（秒发核心，localhost 可验，无设备依赖）
- 效果链带参：`external-publish:content` → 发布时读 **mediaFiles** state ref（★侦察定谳 7/6：选中视频 uri 存 mediaFiles 字符串数组，mediaPayloads 对 movie/content 恒 ""；Android content:// uri 原样保留；**鸿蒙 picker 未实现 = cheng_host_open_file_picker abort() 桩，鸿蒙选片是 S1 内独立子项**）；`chengPublish()` 无参改带参桥 `cheng_host_publish(path,...)`。
- Harmony/localhost publisher 参数化：media_moq_publisher_main 写死 maitian.\* 改传入路径，whole-asset fountain bundle 模式（复用 `MediaIngestVideoFilePin`/`WebSceneMediaOrchestratePublishLocalFile` 现成 ingest+注册，逐帧 ES 流水线后置 S5）。
- Android 发布侧从 no-op 变真实现（content:// uri 读字节通道 Kotlin 已有）。
- **验证门**：localhost 两进程用 GUI 选中的真视频（非 fixture）跑通 hash==cid + publish_total_ms 实测；鸿蒙 GUI 点发布→mac sub 拉取一致。

### S2 announce→feed 秒级可见（发现链根修）
**slim-switch 实验定谳（7/6 实测）**：slim 静态分链已落码（slim_switch.cheng + buildSlim 静态双入口 + main/compat_ffi \*_slim 平行链 + exportc libp2p_node_init_slim；刻意无运行时分支否则 DCE 剪不掉），但 **slim roots 实测不解构建墙**：--export-roots 只剪后端可达集，1473s 纯 CPU 后信号杀无产出（基线 933s 同病）。真根因=前端 typed_expr O(N²) 吃整个 import 闭包，且 switch.cheng:38-70 自身 import 全部重协议模块——任何进 switch 的编译单元前端都吃全图。真解锁=①op-lane typed_expr O(N²) 修复（既有战役）或②switch.cheng import 图重构（顶层 wrapper 迁出，新战役）。slim 链保留价值=墙解开后 .so 体积/后端时间大削。
**slim-switch 可行性侦察（7/6）**：构建墙对症解可行。唯一 anchor = standard_switch.cheng:40-119 newStandardSwitch() 无条件 registerProtocol 26 个协议（depin 一家 11442 行/inference_transport 7831 = 单个最大头）；switch 分发是数据驱动（registerProtocol 只 append 函数指针，无硬调用），删注册即被 reachability DCE 剪掉（export-roots 已裁到 8 符号仍拖全协议 = 拖拽 100% 来自 node_init）。最小改动 4 文件：新 slim_switch.cheng（只 import/注册 identify+ping+gossipsub+feed+secure）+ builders.cheng SwitchBuilder profile 字段 + main.cheng 透传 + compat_ffi parseProfile（configJson 加 "profile":"slim"，C ABI 零改动）。可剪协议源码 ~23,400 行；QUIC/crypto 共享闭包保留（若编译时间其实由它主导则收益打折，落地后 census 验证）。
**首片进度（2026-07-06）**：接线已落地并按可验层级验证；运行时端到端受构建墙阻断（下述）。
- **桥接线（已改，-fsyntax-only 过）**：`cheng_gui_host.c` 的 `cheng_host_node_contents_refresh` abort() 桩 → 真桥：dlopen `libcheng_feed_harmony.so`（独立 .so，同 MoQ publisher 的 .so-per-obj 纪律，隔离 ~1371 共享 libp2p 符号），懒启一节点，调 `libp2p_feed_node_contents(handle,peer,useNet)` 拿 `{ok,items}` 交回 scene 现成插卡路径 `__csg_scene_apply_node_contents_refresh`（scene 侧插卡已存在，无需改生成器）。dlopen 失败降级为诚实 `feed_runtime_unavailable`（不崩不假）。
- **投递根修（已加 compat_ffi，dry-compile 过 + 符号可达证）**：`unimaker_compat_ffi.cheng` 新增 `libp2p_feed_node_contents` + `drainInboundSocialMetadata`——**补上原缺口**：全量 compat_ffi 内部从无 `gossipsubNextMessage` 消费，入站 gossipsub announce 从不并入本地 feed（`fetch_feed_snapshot`/`social_feed_snapshot` 只序列化本地 `feedEntries`，Kotlin 壳 feedSubscribePeer+socialFeedSnapshot 亦仅返回本地）。新 drain 循环 `lp.hostGossipsubNextMessageWire()`，把 `socialPublishMetadataTopic` 消息 `storeReceivedSocialPublishMetadata`→feed。
- **CMake（已加，`if(EXISTS)` 守卫）**：`libcheng_feed_harmony.so` 目标镜像 publisher；缺 `prebuilt/feed/feed_core.o` 时跳过（现有 HAP 仍可构建）。
- **构建墙定案（实测，非估算）**：feed .so 的 `feed_core.o` 本会话**无法产出**——backend_driver 用 feed-only `--export-roots` 编全 compat_ffi 到 obj 跑满 933s 仍无 object（复现 task_plan「600s 未产出 object」）。**根因不是 compat_ffi 的 exportc 广度**：export-roots 无法剪，因为 `libp2p_node_init`→`initSwitchWithPersistentIdentity`→`NewHostWithAddressText` 挂载**全部协议**（gossipsub+kademlia+rendezvous+dm+feed+livestream），feed 内在拖入整个 switch+QUIC+crypto 闭包。真解 = backend fork-join 并行 + Cheng-backend regalloc（既有独立战役），**或** slim-switch profile（只挂 gossipsub+feed）；「feed-only 薄入口」被证伪，不解构建时间。
- **切点余量（诚实）**：① feed .so 未产出 → GUI 运行时链接与真机验证阻断在构建墙；② 桌面双节点真 gossipsub 端到端延迟数字同因阻断（本地真测试仍需 feed_core.o）；③ gossip mesh 形成是否需驱动 heartbeat 泵未实测；④ 首页 feed 自动插卡（非手动 node_contents_refresh action）仍缺 scene 侧自动路径。
- **验证门**：双机 A 发布→B logcat feedSnapshot 更新→scene 卡插入 ≤3s（待构建墙解开后跑）。

### S3 peer 透传 + feed 级预取 + tap→首帧仪表（秒开核心）
**进度（2026-07-15 桌面席）**：
- ✅ **peer 透传全链**（早先 5521ce0e7 + 本席补洞）：types/writer/reader/materializer/one-click sourcePeer 折叠/prepare importc/host es_open 读 slot peer。mobile 非 asset 内联建槽补 peerHost/peerPort。纯图 API `WebSceneMediaCollectFeedPrewarmPeers` + slot peer 访问器；smoke `web_scene_media_feed_prewarm_plan_smoke` stage3 cold 绿。
- 🟡 **预暖钩子骨架**：host 累加可见 feed 卡 peer 至 N=2（去重），env `CHENG_FEED_MEDIA_PREWARM=0` 关；worker dial+index **仅 plan[0]**（全局单 ES 会话约束），plan[1] 只记日志待连接池。真滚出即拆/首关键帧预算=未做。
- ✅ **tap→首帧埋点结构**：`open_to_first_frame … t0_ms t1_ms t2_ms`（t0=spawn/tap→route，t1=首 sink，t2=首 present）；oracle 旧段字段仍兼容。
- 🟡 **per-slot 连接池 + S3 字节证据 receipt（2026-08-27 Lane V 席）**：池本体（3 槽 SoA、int32 精确 slot 身份、精确 (host,port) dedupe、pool-full=-1 响亮）+ warm 连接收养（adopt=物理 move，非 close+release）已落 `web_scene_media_network_bridge.cheng`。本席新增全链字节证据四账（生产点直写，禁事后推断）：`ConnDialed/ConnClose/Release/AdoptMove` 四计数器 + 同名 Receipt() 读出 —— dial 收据只在真实 dial+negotiate+ack 完成处记；ConnClose 只对**真拨过号**的连接记账（从未 dial 的槽释放不得冒充 close）；adoption 记 AdoptMove 且 ConnClose 必须保持 0（连接活着转移走了）。对拍断言已入 `media_moq_es_pool_check_main.cheng`（pure: reserved 释放→Release+1 且 Close/Dialed 均 0；coexist: 双 OpenPeer→Dialed==2，逐槽释放→Close==2；adopt: Dialed==1+AdoptMove==1+Close==0）。sha256(bridge)=233df77f…，sha256(pool_check_main)=df868789…。**挂账（blockedOnSharedTree）**：live 三模式执行被共享树 compile-link 时差回归阻断——HEAD 干净树同样 rc=2（`WebSceneMediaEsPoolSlotPrefetchTick` managed branch state not exact / `use of consumed managed value`，findings.md 2026-08-27 compile_link-lane 留档同族），与已留档的 compile-link 债同族，非本席改动引入（stash 桥后 HEAD 基线复现同红）；Aug16 stage3 载具编 publisher 运行即 ORC registry_miss 崩，dev 载具（Aug23）编 publisherIngest 即红；三路皆堵后 live 面待该 lane 收敛复跑。真机暖态 <100ms 维持 **deviceOnly** 不变。
- **验证门**：真机暖态 tap→首帧 <100ms（deviceOnly 清单项）。

### S4 完整播放语义 + 耐力门禁 + WiFi 吞吐复测
**进度（2026-08-27 Lane V 席 — EOS 状态机落桥）**：
- ✅ **双轨 EOS 状态机**（bridge sha256=233df77f…「S4 EOS 完整播放语义」块）：每个 latch 写在物理 EOF 发生行——video pump 三处 cursor 越界点统一走 `webSceneMediaEsLatchVideoEos()`；audio 泵 `AdvanceCursor` 越末 AU 处 `webSceneMediaEsLatchAudioEos()`。三种终态严格可区分：EOF(rc=7 latch)≠传输错误(dead streak>0, EOF 未达)≠背压(FIFO-full 让位点=设计行为不入态)。**音频先完竞态裁决（音频时钟传输层形态）**：audio 先排空时停在 state=1 竞态窗口继续喂 video，state=3 complete 是唯一可宣称「整片播到尾」的角，且 complete=所有**已打开**轨排空（未开轨不阻塞收口）。receipt：`EosCompleteReceipt` 按 complete 边沿累计（seek 回卷经 `ArmVideoEosForNewRun`/`UnlatchAudioEos` 重臂，二轮播放再计一次）；投影 API=`WebSceneMediaEsEosState/EosCompleteReceipt/VideoEosLatched/AudioEosLatched`。宿主侧消费接线（scene 结束事件替换三处 wrap）仍挂 handoff。
- 🟡 **EOS 对拍**：新增 `media_moq_es_eos_check_main.cheng`（sha256=fe86819c…）+ runner `src/tests/run_media_moq_es_eos_check.sh`（真 publisher 真 QUIC 全片拉满，8 分支逐条断言：video-eos-only 态 single-track 不得宣称完整、双轨 complete receipt==1、latch 幂等、双向 seek 重臂竞态窗、二次 full-pass receipt==2）+ EOS mutation gate 位（mutant=删 audio latch 行 → step4 必红）。**同 S3 挂账 blockedOnSharedTree**：live 执行被同一 publisher ORC/编译墙阻断；eos_check 二进制编译 rc=0、进程 standalone 稳定运行已验。
- 时长/进度、耐力 oracle（unimaker.playback_endurance.v1）、真机 WiFi 吞吐复测维持原挂账。
- **真机 WiFi 吞吐复测**（moq_droid_two_process.sh 对齐当前 HEAD）——唯一不能本机证实的缺口。不足时按序上 lever：批 ACK（~1.3-1.8x）→消每包 alloc churn（bytesConcat3/SackBuildPayload 复用 scratch，~1.2-1.5x）→sub AppendBytes 预分配→收发流水线。**不上 360p-first 兜底**。
- 冷握手 850ms 归因（纯握手 crypto vs dial 路径固定等待）→ 决定预暖之外是否还有握手本体优化。

### S5 设备侧逐帧流水线（真长片）
- 设备侧 demux（OH_AVDemuxer/MediaExtractor 产 Annex-B）+ moqidx 就地生成 → 逐帧 MoQ 流（对齐 maitian 形状）；长片/段序列 ES index。

### S6 音画同步 + 安卓完整播放
- 音频 HAL 时钟为主时钟驱动视频 idx（取代墙钟）；pause/resume 联动 AVPlayer；loop/EOS 同 PTS 域对齐。
- 安卓移植鸿蒙流式解码/surface/FIFO 套件（对等工作量，单列）。

### S7 发布端→relay→PWA/纯cheng播放器（MoQ 公网链路，当前战役）
**桌面双进程链路实测（2026-08-15，e2e 门禁 media_moq_e2e_timing_gate.sh，真资产 hgs 5.9MB + 麦田 1.8MB）**：三二进制（moq_pub/moq_sub/es_sweep）构建绿；门②传输层秒开代理 hgs 1255-1327ms / 麦田 1098-1193ms（基线显式落账 1294/1280，均 ≤1.5×）；门③丝滑 hgs max 13-16ms/帧 ≤33.33ms（675 帧顺序拉满零超门）、麦田 6-7ms/帧 ≤16.67ms（333 帧）；门①秒发麦田 310-352ms 稳定达标、hgs 993ms 达标（低负载实测），高负载（load 11-16 被 lane 并行编译竞争）时 1083-1206ms——fountain 并行 SHA256 是纯 CPU 段，门① hgs 在静载机复测即全绿。

**relay 三进程链路已打通（2026-08-15）**：`src/tests/media_moq_relay_main.cheng` 单进程双角色（QUIC 监听 + 按请求拨上游 publisher），subscriber 经 relay 走 announce→object 同流双请求，65536 字节 hash 全对 sub exit=0，连测 5/5 无崩溃。打通代价是修掉 native_runtime 双角色 4 处真 bug（dial 返回 slot 重绑、listener datapath 全局恢复、pump 按 datapath 绑槽、pipe 级读/写/轮询钉槽——详见 findings.md MOQ-RELAY 条目）。

**WebTransport 真 h3 链路复绿 + WT-MoQ 服务端/客户端落地（2026-08-15）**：F07 同文件 const bug 已修（probe 实证）；--h3-settings-preamble 全开的真 h3 线格式 E2E 全绿；src/apps/webtransport_moq_relay_main.cheng（WT bidi 流上跑 moq 请求/响应并转发上游）+ src/apps/webtransport_moq_client_main.cheng 四进程链 65536B hash 全对连测 2/2；顺带修掉 3 个真运行时 bug（CopyTlsPolicy 浅返回悬垂、x509_issue UTCTime 临时串视图悬垂、bidi await 误取 qpack 单向流——详见 findings.md）。**PWA 三件套已写**（website/public/pwa），但 Chrome 实测撞墙：cheng QUIC 包帧层是私有统一 5-varint 形态，非 RFC 9000 按帧类型变长形态，真浏览器 Initial 一进即被读偏丢弃（"initial frame data truncated"）——PWA-via-Chrome 卡在 QUIC 帧层 RFC 化（lane 域深层，独立战役）；纯cheng 播放器路径不受影响已全绿。

**播放器请求序列 + 秒发秒开数字全链路落账（2026-08-15）**：客户端 --player-flow（单 WT 会话三 bidi 流 announce→poster→segment，与 PWA 播放器同序列）2/2 绿——announce 1024B 的 object_hash 与预期一致、poster 68194B JPEG hash 与本地文件逐字节一致、segment 65536B hash 全对；秒开 WT_MOQ_OPEN_MS=3119-3553（三流全取回，含进程启动）。PWA 请求帧与 cheng 逐字节一致（wire crosscheck SIGNAL/PAYLOAD 全 OK）；moq-wt.js 已含 announceField+moqPlayerOpen（播放流程全套），JS 解析器拿真实 1024B announce 交叉验证 6 字段全一致。**秒发数字过线**：publish_ingest_ms/listen_ms/total_ms 随 announce 下发、播放器端解析打印（实测 total=1345 载态；门①静载基线 993）。门禁本轮复跑：门② hgs 1167≤1941 / 麦田 1562≤1920、门③ hgs 17ms/帧≤33.33（675 帧）/ 麦田 6ms/帧≤16.67（333 帧）全 PASS；门① 麦田 415 PASS、hgs 载态 1220 超 1000（lane 编译竞争所致，静载复测即绿）。剩余：
- **QUIC 帧层 RFC 9000 化**：编解码实现已写好但因 stage3 BodyIR freeze 准入拒绝而全量回滚留档（findings.md），待 lane 编译器支持后重放——这是浏览器路径唯一断点。
- **relay（dosg 165.245.176.65）**：待用户确认后执行。runbook：①本机试构建 linux 目标二进制（--target 待验证，若本机不支持则在 dosg 上装 toolchain）；②scp moq_pub+wt_moq_relay 上 dosg；③dosg 上跑 publisher（真资产路径随行）+ relay --san-host dosg公网IP --port <UDP>；④防火墙放行该 UDP 端口；⑤本机 cheng 客户端 --port <dosg:port> --certhash <relay 打印的 WT_MOQ_CERTHASH> 拨公网，验秒发秒开数字；⑥PWA 待帧层 RFC 化后同法接入。属外发/部署动作，先确认再动。
- 本战役源级已修（编译器整改期缺陷的规避，新编译器落地后冗余但无害）：str 借→own 浅拷贝处显式 CloneStr（manifest ctor 12 字段、fountain worker peerId/peersLocal/bundleCid、FromMoq×2）、x509VerifyHostname 循环复用 CloneStr、HandshakeFeed ctor 实参 BytesSlice。复现文件 src/tests/moq_fountain_orc_teardown_repro_main.cheng。

## 3. 风险与共享文件纪律
- mobile_shell_codegen.cheng / scene-runtime-smoke-source.mjs / cheng_gui_host.c 多会话活跃：单 owner、Edit 精改、禁整文件操作。
- unimaker_compat_ffi 编译闭包 600s（S2 构建风险）；鸿蒙验证需 hdc+解锁态。
- Path C AES intrinsic 归档为"未来 app-data 加密线"前置（视频当前不加密，0 收益）。

---

## 附录 A：拖动 seek / 丝滑本地化播放（原 video-seek-scrub-blueprint 合卷）

用户拍板（2026-07-10）：①A/V seek 同步=音频 ES 化（音视频共享 seek 游标）；②拖动进度条=新增功能（与像素 1:1 验收口径分账）；③排期=M3 迁移收官后启动；④「暂停不停流」缺陷并入本战役修。蓝图含协议/索引/缓存（seek-recon-protocol）+ 宿主解码/seek/暂停（seek-recon-decoder）。

## 附录 B：MoQ per-frame 流式（原 repro/moq_per_frame_streaming_plan 合卷）

跨设备秒开最后一层。卡点 = QUIC 大块 STREAM 跨设备拉不全（纯 Cheng QUIC 无 STREAM 丢包重传/flow-control 窗口不够）。生产正解 = 发布端 demux 成 per-frame 小 object 顺序流，播放端直喂 OH_VideoDecoder PushInputBuffer（绕开 OH_AVSource + 大块随机读），object 级重传。

## 附录 C：MoQ-QUIC Progressive Streaming（原 repro/moq_progressive_streaming_plan 合卷）

Android→HarmonyOS 分阶段实现。Phase A publisher side DONE。关键修正：faststart remux 强制且可行；无 Mutex → busy-flag 串行化；无 Bytes→raw ptr 拷贝原语 → readAt 须经 memcpy @importc shim 或逐字节。

## 附录 D：P2P 双卡视频首页（原 repro/p2p_dual_video_home_plan 合卷）

鸿蒙+安卓各跑 player+publisher，首页两卡（胡广生安卓/麦田鸿蒙），点击进全屏播放。字段命名统一：peerHost:str + peerPort:int32。共享文件冲突点（scene-runtime-smoke-source.mjs / cheng_gui_host.c / csg-web-types.ts）须单 owner 串行改。

## 附录 E：鸿蒙 GPU present port（原 repro/harmony_gpu_present_port_spec 合卷）

鸿蒙 GPU zero-copy decode 上屏的 present 端口规格，与 MoQ 流式配套。
