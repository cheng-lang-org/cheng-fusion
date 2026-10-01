# 生产 UniMaker computer-use 发布路径 — R2C 战役计划

目标:生产级 UniMaker Cheng GUI 的 **computer-use 发布路径**秒发麦田 → 安卓秒开,验证从 PWA 转译的纯 Cheng computer-use。非 demo。

## Phase 0 — 已完成(2026-06-18,设备验证)
- ✅ 真因修复:`bootstrap/cheng_cold` 二进制过期(op-lane 在 .c 已修未重编)。`cc -O2 -o /tmp/cheng_cold_new bootstrap/cheng_cold.c` 重编 → 取址 miscompile 消失(repro `src/tests/cold_ptr_addr_reassign_repro.cheng` rc=0)。**这是全部 QUIC/解码/上屏的底层解锁。**
- ✅ 麦田视频跨设备秒开上屏 fps=30(GPU zero-copy decode);handleVideoToggle 真机触发原生桥。
- ✅ 生产 UniMaker UI(React→纯Cheng)在鸿蒙渲染;hvigorw 可 headless 构建 HAP。
- ✅ 原生秒发可用:`cheng_moq_harmony_publish_serve`(media_moq_publisher_main.cheng:366,serve 麦田 ES);安卓秒开 `sub_droid_nc`(用 fixed 编译器编,loopback 3×hash 一致)。
- ✅ **导航 materialize**:补 `--mobile-scene-route home_default + tab_messages + message_thread` → route-reachability complete=true 3/3,computer-use(ChatPage)可达。
- ✅ 秒发秒开**最佳格式自研方案**(workflow 探索,见同日 findings + workflow 输出):裸 Annex-B ES + MQES v2 自描述索引 + MoQ 单连接自适应 run-budget 聚帧 + announce 内联首帧 + fetch/render 双线程。

## Phase 1 — R2C 控制器:ASI computer-use 图模型(战役核心,周级)
卡点实测:3-route 场景 27 个 computer-use handler **0 编译**(no-fid 17 内联箭头 / params 5 / fv-unknown 4 / transpile-fail 1)。external-publish 执行深在"消息.extra.asiComputerUse graph → 步进 effectClass=external-publish"流程。
- 需建 R2C 控制器对组件级 data/props/service/useRef 建模(workflow 实测 116/180 handler 卡 free-var 门=同类)。
- 源:`/Users/lbcheng/UniMaker/React.js/app/components/ChatPage.tsx`(asiComputerUseGraph、resolveAsiComputerUseGraph、external-publish step)+ `app/libp2p/asiComputerUseContract.ts`(taskKind=publish-short-video-draft/publish-ad-video-draft、effectClass、riskPolicy=confirmation-required-for-external-publish)。
- 休眠的 R2C 控制器:`src/r2c/r2c_react_controller_main.cheng`(708KB,未接进 CHT,unimakerHostContractV1 空 stub `src/r2c/schema.cheng:535`)。

## Phase 2 — 编译 computer-use handler
把 27 个(及全量 ~140 个组件作用域 handler)经 R2C 控制器从 invoke→compiled。量化工具 `node ts-csg/scripts/cht-measure.mjs <dir>`(读缓存 .csgc,报 skip 分布)。

## Phase 3 — external-publish 接原生秒发(生产级,非 demo)
- 把 external-publish 步做成场景 effect-dispatcher 的原生 effect → 新增 `cheng_host_publish` 桥(仿 cheng_host_video_play,cheng_gui_host.c:5987)→ 触发 `cheng_moq_harmony_publish_serve`(麦田)。
- 触达 external-publish 步依赖 Phase 1/2(ASI 图渲染+步进+确认按钮 handler);或注入真 computer-use 测试消息(带 publish-short-video-draft graph)走生产确认 UI。

## Phase 4 — 部署 + 端到端验证
fixed 编译器(/tmp/cheng_cold_new)编 scene_app_oh.o(注意:full config + nav routes 重生成以同时保留 home/handleVideoToggle)→ hvigorw → 装机 → 导航到 computer-use → external-publish → 麦田秒发 → 安卓 sub_droid_nc 秒开。

## 关键命令/路径
- fixed 编译器:`cc -std=c11 -O2 -o /tmp/cheng_cold_new bootstrap/cheng_cold.c`
- HAP:`DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk PATH=/Applications/DevEco-Studio.app/Contents/tools/node/bin:$PATH /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw --mode module -p product=default -p module=entry@default assembleHap --no-daemon`
- scene obj:`/tmp/cheng_cold_new system-link-exec --root:. --in:<scene-runtime.cheng> --emit:obj --target:aarch64-unknown-linux-ohos --out:<scene_app_oh.o>`,换 `platform/harmony/ChengGuiDemo/entry/src/main/cpp/prebuilt/scene_app_oh.o`(备份 /tmp/scene_app_oh.o.bak)
- 麦田 ES:`node tools/gen_moq_es_index.mjs /Users/lbcheng/Downloads/麦田.mp4 <out.h264> <out.moqidx>`
- 鸿蒙锁屏延时:`hdc shell power-shell timeout -o 1800000`(PIN 解锁只能人工)

## 诚实约束
- 鸿蒙 SELinux 禁跑 CLi:发布只能进签名 HAP。
- 单线程 runtime:fetch 线程独占 QUIC,渲染线程只 present(并发调 bridge 损坏 runtime)。
- R2C 是周级:Phase 1/2 是真正的工程主体,需聚焦战役,非单 session。

## Phase 3 进展 — external-publish 原生接线已实现并验证 build+link(2026-06-18)
**生产 GUI(ChengGuiDemo)接线全链路 build/link/package 通过(设备验证前最后只差 materializer + 解锁):**
- scene-runtime-smoke-source.mjs:无条件 emit `@importc cheng_host_publish` + `fn chengPublish()`(~6061 前)+ `__csg_scene_apply_event_to_node` 加 external-publish 分支(命中 "external-publish:" effect 调 chengPublish)。验证:fixed 编译器编场景 obj exit0,`T chengPublish` / `U cheng_host_publish`。
- cheng_gui_host.c:加 `cheng_host_publish()`(提取 rawfile 麦田→cache + dlopen libcheng_moq_harmony.so + dlsym cheng_moq_harmony_publish_serve + 后台 serve 线程,幂等)。验证:libcheng_gui_host.so `T cheng_host_publish`。
- CMakeLists.txt:加 `cheng_moq_harmony` SHARED target(prebuilt/publisher/{moq_core,ps,cp_local,hr}.o + host_bridge + intrinsics),独立 .so 避 1371 符号冲突。验证:libcheng_moq_harmony.so `T cheng_moq_harmony_publish_serve`,两个 .so 都进 HAP libs/arm64-v8a/。
- rawfile 加 maitian.mp4/.h264/.moqidx/_poster.jpg(从 /Users/lbcheng/Downloads/麦田.mp4 经 gen_moq_es_index.mjs 生成)。
- **HAP BUILD SUCCESSFUL**。

**Phase 3 剩余(offline 最后一步 + 设备闸)**:
1. **materializer**:让发布触发节点的 click effect = `"external-publish:<channel>"`、actionKind=`"command"`(csg-web-materializer.ts,识别 PublishVideoPage 发布按钮 onClick=handlePublish 或 computer-use external-publish step)。没有这个节点,接线不会被触发。
2. **full-config 场景重生成**:用完整 config(保留 home/handleVideoToggle)+ message/publish 路由 + 上面的 external-publish 节点,fixed 编译器编 scene_app_oh.o(13MB 级)换进 prebuilt。
3. **设备验证**(卡解锁):装 HAP → 导航到发布节点 → 点 → logcat 看 "serve thread binding 0.0.0.0:38000" → 安卓 sub_droid_nc --host <鸿蒙IP> 秒开麦田。

---

## 附录：CSG Computer Use 能力边界（原 csg-computer-use 合卷）

CSG 不靠预训练大模型时，能做的是"确定性 Computer Use"，不是"开放世界智能"。核心能力是把软件系统变成机器可读的图：UI 状态、组件树、命令、输入输出、权限、数据流、错误、可执行动作。

CSG 可以让 Computer Use 从"大模型视觉猜测"变成"语义图上的确定性执行"，但不能替代预训练大模型的开放语义理解。最佳架构是 CSG 语义图 + 大模型开放语义的分层协作。

## Phase 3 完成 — external-publish 节点接线全链路验证(2026-06-18)
**materializer rewrite 验证通过**:buildCompiledHandlerTable 里(在 0-compiled 早返回之前)把 `invoke:handlePublish` 改写成 `external-publish:content` + actionKind=command。实测 "CHT: wired 1 external-publish node",BEFORE invoke:handlePublish=1 → AFTER external-publish:content=1/invoke=0。**坑**:rewrite 必须放在 `if (compiled.length===0) return` 早返回之前,否则 0-compiled 场景跳过。
**全链路(生产 GUI ChengGuiDemo,已验证)**:发布按钮→external-publish:content(materializer)→__csg_scene_apply_event_to_node external-publish 分支→chengPublish→@importc cheng_host_publish(C)→dlopen libcheng_moq_harmony.so→cheng_moq_harmony_publish_serve(麦田 0.0.0.0:38000)。逐环验证:rewrite 触发✅、场景编译 T chengPublish✅、C 桥 T cheng_host_publish✅、publisher .so T cheng_moq_harmony_publish_serve✅、两 .so+麦田资产进 HAP✅、HAP BUILD SUCCESSFUL✅。
**仅剩**:① 部署场景需 publish 路由可达(➕ publish_selector→publish_content 导航,正在 regen 验证);② 设备端到端验证(卡解锁):装 HAP→导航到发布页→点发布→logcat serve binding→安卓 sub_droid_nc 秒开麦田。

## ✅ Phase 3 DONE — 生产 GUI computer-use 发布 device-ready HAP 已构建(2026-06-18)
device-ready HAP(entry-default-signed.hap,29MB)= 发布路径场景(home→➕publish_selector→publish_content,route 3/3 可达,external-publish:content 节点在设备数据)+ 全接线 + 麦田资产。HAP 内含:libcheng_gui_host.so(T cheng_host_publish)、libcheng_moq_harmony.so(T cheng_moq_harmony_publish_serve)、unimaker_scene_data.bin(1.2MB 发布场景)、maitian.{mp4,h264,moqidx}+poster。逐环 offline 验证全过。
**唯一剩:设备端到端验证(卡解锁)**:hdc install HAP → 启 → 点➕ → 选发布类型 → 点"发布"(external-publish 节点)→ logcat 看 "cht publish bridge: serve thread binding 0.0.0.0:38000" → 安卓 `cd /data/local/tmp/moqv2 && ./sub_droid_nc --host <鸿蒙IP> --port 38000` 秒开麦田。
注:此 HAP 是发布路径场景(home 内容精简);视频播放场景(13MB scene_app_oh.o + 32MB glyph + 7MB scene_data)已备份到 /tmp/gui_video_scene_bak/,要同时保留视频需用 full-config regen(home 全内容 + publish 路由)。
