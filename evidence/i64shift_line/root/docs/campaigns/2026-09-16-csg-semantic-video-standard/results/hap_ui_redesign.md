# HAP 主页面 UI 专业化重构（hap_ui_redesign，2026-09-20）

## 一、结论

**绿**。构建零错 + 装机（versionCode 1000068，versionName 1.0.66）+ 全页截图 11 张存档 +
回归 2/2 轮绿（RECEIVE sha 对拍 MATCH；SSM2:RECV sha 对拍 + 播至 EOF PLAYDONE）+
D3:RECV 点验一次行为与改前一致（三载荷 sha 对拍 + DECODE 45/45 + PLAYDONE，
handler 完整，无需「实验中」标注）。纯表现层重构，全部既有 handler 零语义变更。

## 二、改动面

- 唯一改动文件：`ssm1smoke/src/main/ets/pages/Index.ets`（+601 行 UI 层）与
  `AppScope/app.json5`（versionCode 1000064→1000068）。
- 全部业务方法（publish/receive/receiveBase/ssm2Receive/progReceive/d3Receive/
  recStart/recStopAndConvert/demoMp4ToCsgd/csgPlay/scene*/revServe*/toggleDepth/
  startVideo*/startVideoCore 等）**逐字未动**；handler 签名零改动。
- 新增（纯 UI）：
  - 常量面 `APP_TITLE/APP_SUBTITLE/APP_VERSION/COL_*`（中文字符串集中）+
    `ActionSpec/ActionState/ActionGroup` 接口 + 按钮→handler 映射表 `UI_SPECS/UI_GROUPS`。
  - `log()` 追加一行 `this.uiLogFunnel(line)`（原 logText 累积行为保留）；
    漏斗从既有 log 流提取操作卡状态/角标/跨机状态点，不新造数据。
  - `runAction/invokeAction`：卡片点击统一入口，按映射表逐键原样分派到旧 handler；
    进行中禁点防重复；同步快返动作按末行判终态。
  - `uiTogglePlay/uiReplay/uiPosTick`：控制条播放/暂停/重播与进度时长（只读
    avPlayer 状态，异常走 hilog.error + log，不触业务流）。
  - 新 UI `build()`：顶栏 / 播放器卡片 / 控制条 / 分组 Tabs / 日志抽屉。
- XComponent 双层（`videoView`+`ssm1view`，id/type/libraryname 逐字一致）从
  300vp 定高改为 16:9 圆角卡（aspectRatio+clip）；深度 blit 常量
  `DEPTH_BLIT_X/Y` 与 CSG 居中逻辑均不依赖旧高度（CSG 由 render 应答
  bufW/bufH 动态解析），真机 D3 深度 overlay 上屏可见（new_10 截图）。

## 三、目标设计落地

1. 顶栏：`CSG 语义视频` + 副题小字 + 右侧双设备状态点（鸿蒙恒绿/安卓灰绿红，
   由既有跨机回调判定）+ `v1.0.66`。
2. 播放器卡片：16:9 圆角主角卡（AVPlayer + 深度 overlay 双层），右上角最近
   字节校验角标 `✓/✗ + sha 前 8 位`（从 FILE/shaOk/expectedMatch 行提取，
   与流内本地播放事件解耦）；控制条：播放/暂停、进度时长、重播、深度 Toggle、
   CSG 播放。
3. 操作分组 Tabs：传输(10)/播放(3)/场景·相机(6)/采集(4)/诊断(2)，2 列操作卡。
4. 操作卡：中文主标 + 等宽技术 ID + 右侧状态（灰点/spinner/绿✓/红✗）；进行中
   禁点；卡下沿结果摘要一行（取自既有判词行，如 `VIDEO first-play 170ms`）。
5. 日志抽屉：底部可折叠，保留最近 120 条，hilog 照旧。
6. 视觉：#0E1116 背景 / #171C23·#1D242E 卡片 / 主色 #4E7FAE 降饱和 / 成功
   #43C57C 失败 #E5625E 进行 #D9A63E / STOP+CSGD 红调（#B04A46 边框标题）。
   分组名与技术 ID 对照以任务 prompt 为起点，源码盘点增补 CAM:+12（旧 UI 出屏
   不可见但源码在）与 DEMO:MP4→CSGD，25 键全量保留。

## 四、按钮映射表（旧 25 键 → 新位置，全量）

| 旧按钮 | handler | 新位置 |
|---|---|---|
| PUBLISH | publish() | 传输·发布 |
| RECEIVE | receive() | 传输·接收 |
| RECEIVE:MP4 | receiveBase() | 传输·接收视频 |
| SSM2:RECV | ssm2Receive() | 传输·接收语义容器 |
| D3:RECV | d3Receive() | 传输·语义+深度三载荷 |
| PROG:RECV | progReceive() | 传输·渐进接收 |
| REV:SVB | revServeSvblock() | 传输·反向收语义 |
| REV:MP4 | revServeBase() | 传输·反向收视频 |
| HTTP:PLAY | startVideoHttp() | 传输·直连播放 |
| L2P:FETCH | libp2pSvFetch() | 传输·L2 平面拉取 |
| ALL | runAll() | 播放·全流程 |
| RERUN | rerunProtocol() | 播放·重放 |
| PROBE | udpProbe() | 播放·探针 |
| SCENE:LOAD | sceneLoad() | 场景·相机·场景加载 |
| SCENE:SEQ | sceneSeq() | 场景·相机·场景序列 |
| CAM:0 | sceneCam(0,0,0,'m0') | 场景·相机·相机归零 |
| CAM:+6 | sceneCam(6,0,0,'m6') | 场景·相机·相机+6 |
| CAM:+12 | sceneCam(12,0,0,'m12') | 场景·相机·相机+12（源码盘点增补） |
| ROT:5 | sceneCam(0,0,5,'mr5') | 场景·相机·旋转 |
| CAP:INIT | capInitModel() | 采集·采集初始化 |
| REC | recStart() | 采集·开始录制 |
| STOP+CSGD | recStopAndConvert() | 采集·停止+CSGD（危险红调） |
| DEMO:MP4→CSGD | demoMp4ToCsgd() | 采集·演示转换 |
| DEPTH:ON/OFF 键对 | toggleDepth() | 控制条·深度 Toggle |
| CSG:PLAY | csgPlay() | 控制条·CSG 播放 |
| —（无旧键） | diagReadTail()/端口常量 | 诊断 Tab·诊断尾巴回读/端口拓扑（只读展示既有数据） |

## 五、构筑与装机

- 构筑：`DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk`
  `node /Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw.js
  --mode module -p product=default assembleHap --no-daemon` → BUILD SUCCESSFUL
  （22-40s/次，0 ERROR；期间 1 次 ArkTS 编译错 SubTabBarStyle.fontColor 不存在
  ——改自定义 TabLabel builder 后过，另 1 次 Tab 内容贴底——Scroll 内 Column
  加 minHeight '100%' 修复）。
- 装机：`hdc -t 3KN0224C18003262 install -r`，bm dump 实证 versionCode 1000068。
  versionCode 链：1000064（起点）→1000065→1000066→1000067→1000068（终版）。
- 终件 sha256：`530d5201e7fe616a0441bccd7ea60628f51d11c8d2aeeef8b59f013b9bde2a92`。
- 已知好件回滚点：`.scratch/hap_ui_redesign_20260920/`（Index.ets/app.json5/
  signed HAP + SHA256SUMS + BUILD_COMMANDS.txt）。
- native 链零改动（libssm1napi.so/rawfile 未重链，ssm1_harmony_build.sh 未跑）。

## 六、回归（判据绑定 hilog 原文，安卓 serve 现场自起）

安卓侧：`q3_serve` 精确起 3 实例（4444=hgs_l2_planes.ssm1 86077B / 4460=
hgs_ssm2.ssm1 582457B / 4480=hgs_ssm2_d3.ssm1 3533303B，serve banner 实证），
KEYCODE_WAKEUP + svc power stayon 防 doze；4443 现场零接触（pid 11370 已不在
机，端口无监听，未动）。收尾阶段三实例改 setsid 守护化（PPID=1，不随诊断会话
退出），`netstat -uln` 实证 UDP 4444/4460/4480 监听，守护化后 RECEIVE 金丝雀
再跑一轮 PASS（`BASE_SSM1 RECEIVE PASS click->file-verified totalMs=2143`），
「留机在线」成立供下一任务复用。

1. **RECEIVE（svblock）1 轮绿**：
   `T_FETCH asserts fetchOk=true shaMatchSource=true fetchMs=1815`
   `T_FETCH_FILE size=85960 sizeOk=true sha=f240fe88…4599 shaOk=true`
   `BASE_SSM1 RECEIVE PASS click->file-verified totalMs=1828 (fetchMs=1815 writeHashMs=13)`
   注：PASS 后尾事件 `VIDEO ERROR`（svblock 字节非 mp4，AVPlayer 拒播）为该键
   既有行为，改前改后一致，判据绑定 sha 对拍与 PASS 行；UI 卡摘要如实显示
   该尾事件，角标显示 ✓ f240fe88（字节校验结果）。
2. **SSM2:RECV 1 轮绿（sha 对拍 + 播至 EOF）**：
   `SSM2 P0 bytes=496166 sha=927b37e61b33187b cidMatch=true expectedMatch=true`
   `SSM2 P1 bytes=85960 sha=f240fe8832cd29de cidMatch=true expectedMatch=true`
   `SSM2 UNSEAL PASS payloads=2 unsealMs=5 click->unseal totalMs=2302`
   `T_VIDEO first-play ms=170` → `T_VIDEO state=completed elapsedMs=22863`
   `SSM2 PLAYDONE click->eof totalMs=25166`
3. **D3:RECV 点验（行为与改前一致）**：
   `D3 P0 927b37e6…/D3 P1 f240fe88…/D3 P2 e21ecb3c… 全 cidMatch=true expectedMatch=true`
   `D3 UNSEAL PASS payloads=3 unsealMs=14 click->unseal totalMs=10271`
   `D3 DECODE PASS chunks=45/45 w=128 h=256 scale=54 decodeMs=282`
   `D3 PLAYDONE click->eof totalMs=33451 depthFrames=45`
   handler 完整且全链绿，无需「实验中」标注。

## 七、证据

- 截图（`/Users/lbcheng/UniMaker/hongmeng/ssm1smoke/.scratch/hap_ui_redesign_20260920/shots/`）：
  `old_ui_before.jpeg`（旧胶囊墙，PROBE/CAM:+12/DEMO 出屏实锤）；
  `new_01_home`…`new_06_drawer`（v1.0.66 五 Tab + 抽屉展开）；
  `new_07_receive_done`（✓ f240fe88 角标+安卓点绿）；
  `new_08_ssm2_playing`（播放中 00:09/00:22，SSM2 卡 ✓）；
  `new_10_d3_playing`（深度 overlay 上屏可见，✓ e21ecb3c）；`new_09/new_11` 终态。
- hilog：`.scratch/hap_ui_redesign_20260920/hilog/{receive_round,ssm2_round,d3_round}.log`。
- 本报告 + progress.md 同日小节。

## 八、如实边界

- RECEIVE 键流内尾事件 VIDEO ERROR 为既有行为（本任务不补 svblock 播放语义）。
- 顶栏安卓状态点为「最近一次跨机回调结果」（灰=未发生/绿=成功/红=失败），
  非常在线探测——应用内无既有轮询通道，不新造协议。
- 分组归属按任务 prompt 基线：PROBE 留在播放组；诊断组为只读展示卡（回读既有
  diag 文件与端口常量）。
- 悬浮浏览器（com.huawei.hmos.browser）曾劫持点击，已 force-stop；鸿蒙侧
  VPN 应用（代理页）保持已连接态未动。
