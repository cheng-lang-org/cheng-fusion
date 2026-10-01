# task_m6a_ohos_share_e2e.md — UniMaker 鸿蒙侧「发布 CSG 视频→秒发→同机 CSG 播放器秒开」单机环回 E2E（M6a）

日期：2026-09-11。承 task_m6_share_recon.md §6.2 鸿蒙接线方案与 task_m5_transport_opt.md
的 MoQ fetch/serve 语义。目标设备 HUAWEI Mate 70 Pro+（HarmonyOS 6.1.0.135，serial
`3KN0224C18003262`）。车头 `/private/tmp/cheng_w126_re`；ohos 克隆
`/Users/lbcheng/cheng-f24/anchor_clones/ohosdev`；宿主验证方法承 M4 §5（同链路先宿主后真机）。

---

## 1. 承载定夺（先侦察后动手）

**现役 NAPI 通道不可用，采纳降级方案：ssm1_moq serve 闭包加导出面编 ohos obj，单进程 127.0.0.1 QUIC 环回。**

| 候选 | 实查结论 | 证据 |
|---|---|---|
| PublishCenterService 32KB 分块推拉 | **跨设备 peer RPC**：`pushNativeMediaAssetToPeer`/`fetchNativeMediaAsset` 走 `sendNativeMediaRpcEnvelope(peerId,...)`（entry ArkTS 层，L2606/L3321/L475），需 libp2p 已连接 peer，无本机环回语义；且宿主只能是 entry 工程（既有文件不可改，新增页面须动 main_pages.json 既有文件） | `hongmeng/entry/src/main/ets/services/PublishCenterService.ets` |
| moqFountain NAPI | build/rebuild 是编解码对，非传输通道；打包内 `libchenglibp2p.so`（2026-06-02, 509KB, Nim 时代产物）**无 `libp2p_moq_stream_open/serve_once` 导出**（nm 实扫 0 命中），napi cpp 运行时 dlsym 只会报 symbol_missing | `hongmeng/entry/src/main/jniLibs/arm64-v8a/libchenglibp2p.so`、`entry/src/main/cpp/libp2p_harmony_napi.cpp` |
| **降级：QUIC 环回（采纳）** | `ssm1_moq_serve/fetch` 语义进一个新导出面 `ssm1q_loopback_export.cheng`；纯 cheng QUIC 栈（TLS1.3/密码学全 cheng，UDP socket 走既有 provider 桥），M4 shim 平台桥全复用；单进程双角色由运行时原生支持（`msquicNativePumpCode` 的 "Dual-role slot discipline" 同时推进 client+listener 两个 datapath） | `src/quic/native_runtime.cheng` L4874-4931 |

## 2. 交付物（全部为新增/本战役可迭代文件）

1. **主仓新增** `src/tools/ssm1q_loopback_export.cheng`（95941620e957b764）——单进程环回导出面：
   - `ssm1q_serve_start(data,len,port,out,cap)`：rawfile 字节直传 → ParseEx embedded → listen 0.0.0.0:port。**发布即就绪**（返回 OK 行即资产可拉取，M5 终版语义：两流、服务端主动推段、64KB 段粒度）。
   - `ssm1q_fetch_run(host,port,out,cap)`：dial（进程内 listener 同步握手）→ client 双流 negotiate → serve 侧 accept+negotiate+权威推段+写关 → client 读 ack → drain manifest（内容完成式收尾：纯头解析 `cursor==n64` 段长自证，即 M5「audioRef 后恰 EOF」同款判定）→ 首关键帧定位 → drain chunk 至声明 payloadLen → 双断言（chunkLen==payloadLen 且 sha256==cid）→ M5 形态时间线。
   - `ssm1q_first_frame_gray(out,cap,metaOut,metaCap)`：取回的 sha256 已断言 chunk → DPD1 头校验（同 ssm1_depth_preview 合同）→ uint16 深度实域 min/max → 逐像素灰度 RGBA8888，平场显式拒绝。
   - `ssm1q_assembled_len/ssm1q_assembled_copy`：取回 manifest 段+chunk0 拼完整 embedded 跨度（header 实字节 + chunk0 实字节置于真实 payloadOffset + 未取回 chunk 置零占位，不进渲染/解码消费），供既有 `ssm1d_load` 走 ParseEx embedded → PlayerInit。
   - `ssm1q_udp_probe`（设备网络层探测）/`ssm1q_stage`（fetch 卡点观测）。
2. **UniMaker 迭代**（M4b/M4 系战役产物）：`scripts/ssm1_napi_shim.c`（+ssm1q* NAPI 封装、异步 fetch 线程+轮询、XComponent SURFACE 捕获、OH_NativeWindow 软渲染上屏）、`scripts/ssm1_harmony_build.sh`（+loopback obj/`-lace_ndk.z -lnative_window`）、`ssm1smoke` 页面/types/module.json5（+INTERNET 权限）。
3. **主仓零源码改动**（仅本文档）；UniMaker 既有文件零改动。

**借用合同新知识（编译器，已写进源码头注）**：`rawbytes.Bytes{data:ptr,len}` 非
address-free 值对象——模块级全局 Bytes 不得按值读出（传参/求长均算拷贝，报
"plain local copy requires an address-free value object"）；全局只作所有权槽位（写入合法），
读取一律 `BytesView(data,len)` 重建局部视图。托管 handle 结构体（StreamManifest 等）无此限制。
另：`StreamManifestParseEmbedded` 是 2 参文件变体，内存内嵌形态须 `ParseEx(data,m,true)`。

## 3. 接线图（鸿蒙单机环回）

```
[PUBLISH 按钮] getRawFileContentSync('huguangsheng.ssm1') → ssm1qServeStart(bytes,4443)
      └ ssm1q_loopback_export: ParseEx embedded → listen 0.0.0.0:4443 → 「发布即就绪」(T_PUBLISH)
[RECEIVE 按钮] ssm1qFetchStart('127.0.0.1',4443)  ← worker 线程, 主线程 ssm1qFetchPoll 轮询 stage
      └ dial(本进程 listener 同步握手) → negotiate x2 → serve 推两段(4625B manifest ∥ 65572B kf chunk)
        → manifest 解析(cursor==n64) → kf 定位 → chunk 收满 65572B → sha256==cid 断言 (T_FETCH)
      → ssm1qAssembleAndLoad(2000): assembled_len/copy → ssm1d_load (ParseEx embedded→PlayerInit)
      → ssm1Cmd('play')/'tick 0' → STATE fetch=0 (PlayerTick 调度首关键帧)
      → ssm1qGrayRender(): first_frame_gray(DPD1→灰度 RGBA) → OH_NativeWindow
        RequestBuffer/写行(stride)/FlushBuffer → XComponent('ssm1view') 上屏 (T_RECEIVE)
[RERUN] 同一 listener 二次 fetch(复跑) + 协议序列 [0,1,2,3,20] 断言
```

## 4. darwin 宿主环回全量 PASS（真实验证输出）

链接：`ssm1q_loopback_darwin.o`(651cd91af67cf442) + `ssm1_shim_nomain.o` + M4 provider dylib，
单镜像（早期 dylib 分体链因跨镜像双 runtime 实例触发 ORC registry_miss，单镜像后消失）。
资产 `huguangsheng.ssm1`（2,955,365B，与 M5 真机同物）：

```
serve_start: OK serve chunks=45 headerLen=4625 kfChunk=0 kfLen=65572 fileLen=2955365 port=4443 state=listening
fetch_run#1: dial 856015000ns | negotiate+serve push 100857000ns | readers 24000ns
  | manifest 4625B 405000ns | parse+locate 22000ns | chunk 65572B 1848000ns
  | ready->first-frame 2299000ns | total dial->first-frame 959171000ns
fetch ok chunks=45 kfChunk=0 manifest=4625B chunk=65572B sha256-match=be20ab8ec6be22e984ffc92163bb5b73e2d22e4394b92d44cd127de18d3eb5a6
first_frame_gray: OK frame w=128 h=256 minV=23168 maxV=60011 grayMin=0 grayMax=255 bytes=32768 ptsMs=0
RGBA min=0 max=255 adjacent_diff_pairs=21019 total_px=32768      ← 非平场
fetch_run#2 (同一 listener 复跑): ready->first-frame 2298000ns, sha256-match=be20ab8e… 逐字节一致
HOST LOOPBACK ALL PASS (HOST_RC=0)
```

**sha256 与 M5 安卓真机逐字节同 CID（be20ab8e…）**——环回取回内容与跨机 WiFi 通道内容一致。

## 5. 真机时间线（实测，分层如实）

### 5.1 设备端发布面：PASS（2026-09-11 22:03 实测 hilog）

安装签名 HAP（调试证书 `com.example.unimaker`）后 `aa start` 自动序列，真机 hilog：

```
surface created w=1316 h=1050                                  ← XComponent SURFACE 建立成功
rawfile read ok bytes=2955365
serve_start rc=97 resp=OK serve chunks=45 headerLen=4625 kfChunk=0 kfLen=65572 fileLen=2955365 port=4443 state=listening
T_PUBLISH click->ready totalMs=292 (rawfileMs=16 serveMs=276)   ← 秒发证据（发布即就绪）
```

首跑曾报 `ERR serve_listen_start_failed`：根因=ssm1smoke module.json5 缺
`ohos.permission.INTERNET`（socket 创建被拒）；补权限后 listener 成功。错误无兜底，
以 `q_listener.lastError` 直出（本轮未复现故未取到该串）。

### 5.2 设备端接收面：BLOCKED（两层，均为真实状态）

1. **首跑接收卡死**（22:03 会话）：`fetch_run` 无返回（>3 分钟，UI 线程阻塞），无任何
   FAIL/timeout 行——dial 的 20s 握手 deadline 未生效，卡点在 dial 之前或 deadline 判定失效。
   已落修复/观测手段并**随当前装机 HAP 就绪**（尚未能复验，见 2）：fetch 移入 worker 线程
   （主线程轮询 `ssm1qFetchPoll` 每 150ms，60s 超时兜底）+ `ssm1q_stage` 八级卡点打点
   （1=dial 起/2=dialed/3=serve 推段/4=ack/5=reader/6=manifest/7=chunk/8=时间线）+
   `ssm1q_udp_probe`（socket/bind/sendto/wait/recvfrom 分层 rc，隔离网络层与 QUIC 层）。
2. **复验被设备锁屏挡住**：复验时设备进入密码锁屏（「输入密码」，dumpLayout 实证）。
   不绕过设备密码；已提示解锁后一条命令即可补验（HAP 已在机，`aa start` 即自动跑全套）。

## 6. 分层判词

| 层 | 判定 | 证据 |
|---|---|---|
| QUIC 环回导出面（源） | **通过** | ohos obj `unresolved_symbol_count=0`；darwin obj 同 |
| darwin 宿主环回 | **通过** | §4 ALL PASS：双轮 fetch sha256 一致 + 灰度非平场 + 播放核调度（含 ssm1d_load/play/tick 链） |
| NAPI so（ohos） | **通过** | 46,028,480B candidate=装机 so 逐位同哈希（e6f6dbda15e32ce4）；`-z defs` 全闭合；ssm1d_*+ssm1q_* 全导出；16KB LOAD align 4/4；ace_ndk/native_window 导入面正确 |
| HAP 构建/签名/安装 | **通过** | assembleHap BUILD SUCCESSFUL + SignHap；`hdc install -r` 成功 |
| so 加载/NAPI/XComponent | **通过** | 真机 hilog：module_register、xcomponent registered id=ssm1view、surface created w=1316 h=1050 |
| 设备端发布（秒发） | **通过** | §5.1：T_PUBLISH 292ms，listener 就绪，chunk/kf 参数与宿主逐字节一致 |
| 设备端接收（秒开） | **BLOCKED** | §5.2：首跑卡死（已备 stage/probe 观测版待复验）+ 复验遇设备密码锁屏 |
| 设备端显示/协议复跑 | **未执行** | 依赖接收面（渲染管线宿主已验：RGBA 非平场、stride 写行、fence flush） |

## 7. BLOCKED 项与如实记录

1. **设备端接收面（秒开数字）未出**。当前装机 HAP 已含观测版（stage+probe+异步轮询），
   设备解锁后一键补验：`hdc shell aa start -b com.example.unimaker -a Ssm1Ability`，
   hilog 抓 `T_PUBLISH/T_FETCH/T_RECEIVE/UDP_PROBE/fetch stage`。若 stage 恒=1 且
   UDP_PROBE 各层 rc=0 → QUIC 层 ohos 适配问题（如实 BLOCKED）；若 UDP_PROBE 某层失败
   → 网络层证据直出。
2. **复验被设备密码锁屏阻断**（dumpLayout「输入密码」实证）。不绕过设备密码；解锁即续跑。
3. 编译器借用合同两条新证据（§2 注记）已落源码头注；`psb` 的 puts/cheng_puts 自引用环
   （宿主验证链踩到，进程内任何 cheng_puts 调用即栈溢出）——宿主 harness 改 fwrite 绕开，
   ohos 正式链不受影响（本模块不 import os、stdio 归宿主），登记为 psb 隐患。
4. 两仓 git 零写操作；UniMaker 既有文件零改动（ssm1smoke/scripts 本战役文件迭代）；
   主仓新增 1 个 src/tools 文件 + 本文档。

## 8. 秒发秒开数字（口径声明）

- **秒发（发布即就绪）**：真机实测 **292ms**（rawfile 16ms + 解析+listen 276ms），
  判据「从点击到可被拉取」满足（listener 已监听，宿主随后成功连接即证）。
- **秒开（fetch 起→首帧上屏）**：**待设备复验**。宿主环回参照：fetch 起→首帧就绪
  2.3ms/2.3ms（双轮），加组装+装载+渲染链路；真机数字以补验 hilog 为准，不预填。

## §8 复验补录（2026-09-12，设备解锁后）

- 锁屏解除，观测版 HAP 重装复跑。现象升级定性：aboutToAppear→runAll 首个
  NAPI（ssm1qUdpProbe）把进程直接打死——pid 循环重启（58418→61354→62161），
  UDP_PROBE/任何 probe 打点零输出，DfxUnwinder Find map error 出现。
  **结论：QUIC 环回栈 ohos 移植层 native 崩溃（非卡死），§6-BLOCKED-1 的
  「stage 恒=1→QUIC 栈 ohos 适配问题」预判成立且更严重（crash 非 hang）。**
- 数据面不受影响的等价背书链：①宿主 darwin 环回全绿（双轮 sha256 同 M5
  CID、首帧 2.3ms）；②同套 serve/fetch 语义安卓真机 64ms（M5）；③SSM1 核
  在鸿蒙真机 HAP 内 M4b 终验全中。唯一缺口=quic_transport 的 ohos 原语适
  配（socket/clock/pump），归 libp2p/quic 移植战役，清单已登记。
- 秒发判词维持 PASS（T_PUBLISH=292ms，publish 即就绪 listening）。

## §10 T 线根修集成复验（2026-09-12）

- 组装：T 线 v3 车头（drop 布局指纹根修，sha 038c1cd6）重编 ssm1d_export +
  ssm1q_loopback obj（后者含 M6b 双缓冲合同平移：主仓原版 assembled_copy
  应答行覆写 payload 头 bug 已在源头修复，ohos shim 改双缓冲+OK 前缀校验），
  harmony_build 全链 unresolved=0、16KB 门过、HAP 签名安装成功。
- 复验现象：启动自动 runAll，`udp_probe enter`（ArkTS 主线程进入 NAPI）后
  **主线程冻结**——qProbeTick stage 打点（socket/bind/sendto 各段）零输出，
  进程存活无 fault record。崩/卡点在 QUIC 环回 socket 原语层、早于全部
  stage，与 M6q/M6b 登记的 quic 运行时 ohos 适配族（udp_probe 双平台
  hang/crash、RERUN 二次连接 stage=6）同源。
- 判别归属：**quic_transport ohos 原语适配**（libp2p/quic 移植战役系统解
  决）。CSG 链路侧全部就绪：T 线 drop 根修 obj、双缓冲组装、内存装载、播
  放核、灰度渲染均在各自真机/宿主层验证过，原语层打通后一键复验。
- 注：Q 线 probe 有界化已随源存在（WaitReadable 1s 门），本次冻结点早于
  该门，非同一卡点。
