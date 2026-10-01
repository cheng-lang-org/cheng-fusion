# task_m7_harmony_play.md — 鸿蒙真机「打开→秒开→完整声画播放 + CSG 深度层同步叠加」混合双层播放器（M7，与 task_m7_android_play 同构）

日期：2026-09-12。真机 HUAWEI Mate 70 Pro+（HarmonyOS 6.1.0.135，serial
`3KN0224C18003262`）。承 task_m6a/m6w（QUIC 环回秒发秒开闭环）与协调 M7 改向
指令（AVPlayer base + CSG 深度叠加，废弃 raw RGB565 v2 全量自解）。
消费 M7-pack 正式产物（task_m7_pack_v2 方案A：base.mp4 + depth.mp4 无损深度视频 +
meta manifest，合计 1.42MB）。

**终判：鸿蒙真机混合双层播放 PASS。打开→首帧上屏 82ms（播放器口径）；完整
22.5s 声画播放（completed totalMs=22808）；CSG 深度层 10fps 同步叠加
（median 帧间隔 100ms，idx 0→224 全程对齐，EOF 停帧）；深度开关对照实证；
三张播放期截图互不相同且非平场。**

---

## 1. 架构（协调改向后定稿）

```
rawfile（HAP 内）
  ├ hgs_base.mp4            ← M7-pack base 层（270×480 H.264+AAC faststart, 496,166B）
  ├ hgs_depth_planes.gray   ← 深度平面表（构建期从 M7-pack depth.mp4 确定性抽取，见 §3）
  ├ ssm2_manifest.json      ← M7-pack SSM2 meta（w/h/frameCount/duration/sha256）
  └ huguangsheng.ssm1       ← v1 DPD1 包（手动 QUIC 环回归归用，不在 auto 链）

UI: Stack{ video XComponent(SURFACE, AVPlayer surfaceId)
         ; depth XComponent(SURFACE, libraryname=ssm1napi) 左上角 128×256 深度块 }
auto 链: ALL 按钮 → T_DEPTH 装载 → AVPlayer(prepared→play) → 100ms tick 同步
         （posMs = avPlayer.currentTime 唯一时间真相）→ EOF 停帧
```

- **画面/音轨 = AVPlayer**（`@kit.MediaKit`，rawfile 经 `getRawFileDescriptor`
  → `fdSrc{fd,offset,length}` → idle 设源 → initialized 设 surfaceId+prepare
  → prepared play，官方状态机，零自研解码，声音平台外放）。
- **CSG 深度层 = shim 纯 C 渲染**：`ssm1PlaySetPlanes(bytes,count,w,h)` 注入
  平面表 → `ssm1FramePixels(idx,ab)` gray8→RGBA8888（平场显式拒绝）→
  `ssm1RenderPixels(ab,w,h,ox,oy)` OH_NativeWindow request/flush blit
  （W 线验证逻辑 + blit 偏移与越界守卫），深度块叠于视频画面显示列上。
- **QUIC 环回链（T_PUBLISH/T_RECEIVE）** 保留为手动按钮（v1 包）。v2 SSM2 的
  manifest 尾部扩展块按 v1 cheng 解析器合同显式拒绝（task_m7_pack_v2 §1），
  故 v2 不走环回——与安卓线（task_m7_android_play）直读 rawfile 的取舍同构。

## 2. 真机时间线（v2 终验轮，hilog 原文存
`ohosdev/artifacts/mobile_m7_play/m7_round_hilog.txt`）

```
T_DEPTH  meta ok loadMs=13  w=128 h=256 frames=225 durMs=22500 planesBytes=7372800
T_VIDEO  fdSrc set → initialized(9ms) → prepared(64ms, durationMs=22501)
T_DEPTH  first-frame ms=8            ← 深度首帧与视频同窗上屏
T_VIDEO  state=playing elapsedMs=81 / first-play ms=82   ← 打开→首帧 ms 级
DEPTH    frame=1 idx=0 posMs=0 → frame=212 idx=224 posMs=22500（逐帧打点）
         median 帧间隔 100ms（10fps 与视频轴对齐；toggle 隐藏 1.2s 吸附续播）
T_DEPTH  toggle on=false posMs=9158 / on=true posMs=10361   ← 开关对照窗口
T_VIDEO  state=completed elapsedMs=22807 → PLAY done frames=212 eof=1 framesTotal=225
```

QUIC 环回归归轮（v1 包，同会话真机实测，W 线形态复验）：T_PUBLISH 276-330ms、
T_RECEIVE 2025-2181ms（fetch+load+render，首帧灰度上屏）、SSM1 SHARE E2E PASS、
SSM1 SMOKE PASS fetch=[0,1,2,3,20]，四轮全绿。

## 3. 深度平面表的构建期抽取（如实登记的适配层）

真机实测 `AVImageGenerator.fetchFrameByTime` 730-820ms/帧（hilog
`T_DEPTH plane idx=0 decodeMs=729 / idx=1 decodeMs=820`），10fps 运行时平台
解码不可行。故构建期做确定性格式适配（`ssm1_harmony_build.sh`）：

```
ffmpeg -i depth.mp4 -pix_fmt gray -f rawvideo hgs_depth_planes.gray
尺寸硬校验: 字节数 == manifest.frameCount × width × height (225×128×256=7,372,800)
```

- 源 = M7-pack depth.mp4（sha256 `9023be7a…`），抽取无任何数值变换
  （yuvj420p full-range 的 Y 平面直通；宿主对拍：解码灰度 R==G==B 比例 1.00，
  与量化平面 maxdiff=1、99.997% 逐位相同——±1 为 YUV→RGB 汇合级容差）。
- **体积双口径**：双层资产（M7-pack 产物口径）= base 496,166 + depth.mp4
  991,625 + manifest 1,384 = **1,489,175B = 1.42MB ≤ 5.9MB ✓**；HAP 内嵌
  适配产物口径 = 平面表 7,372,800B（构建期展开），HAP 随之增大——如实登记。
  若要求 HAP 口径达标，需平台提供可读回的视频帧访问 API（当前不可行）或
  恢复 RLE chunk 流装机。

## 4. 截图判读（snapshot_display 5 张，python 数值判读，存
`ohosdev/artifacts/mobile_m7_play/`）

| 截图 | 判读 |
|---|---|
| t2 / t10 / t20（播放期） | 视频画面推进（胡广生 MV 真实帧+歌词字幕）；三张互不相同（meandiff 264.9/266.5/265.9，bbox 全区域）；非平场（std≈212） |
| t8_depth_off vs t9_depth_on | 深度块区 meandiff=383——开关对照实证（OFF=纯视频，ON=左上 128×256 深度块） |
| t10 vs t20 深度块区 | meandiff=256——深度内容随时间推进（非静态贴图） |
| 块区 grayish=1.00 | 深度块为 u8 量化灰度（gray8 直出），与 DPD 量化合同一致 |

深度块视觉形态 = 灰底 + 白色人形前景剪影（量化深度 0-255 直出），位置
(blit 400,100) 落在视频 letterbox 显示列内。

## 5. 半透明叠加的实证与定案

逐像素 alpha（A=128）与 ArkUI 组件 opacity(0.5) 两轮真机实证均不被
SURFACE 型 XComponent 合成路径采纳（块区灰度比 0.96-1.00 不变）。按任务书
「半透明叠加**/开关形式**」以**不透明画中画深度块 + DEPTH 开关**交付；
半透明如需达成须走 GL 合成或 PixelMap 组件路径（后续项，非本轮）。

## 6. 迭代中的真实缺陷记录（全部真机暴露、已修）

1. **blit 源指针错误**（本线引入）：RenderRgbaToSurface 参数化时 blit 源仍引用
   全局 g_frame 而非入参 px——v1 轮被 GrayRender 先行 malloc 掩盖（深度块渲染
   的实为 chunk0 静态灰），v2 轮 g_frame==NULL 直接 SIGSEGV addr=0
   （自有 SSM1_SEGFAULT handler 留场，fp 链回溯 + so 符号化定位到
   `RenderRgbaToSurface+0x324` memcpy）。修为 `src = px + y*fw*4`。
2. **未捕获 NAPI 异常终结 Ability**：fetch 失败（无发布端）后 receiveFinish 的
   assemble 抛错未捕获 → `ArkCompiler occur exception` → RuntimeError exit 254
   （appspawn 实证）。receivePollTick 就地 try/catch 修复。
3. **cheng runtime event lock 冲突**：M7 的 ALL 流程若调用 udpProbe 等cheng
   NAPI，与 task_x publish 的 runtime 并发触发 `event lock futex wait failed`
   abort。M7 auto 链定为纯 C NAPI（零 cheng runtime 调用），冲突消除。
4. **AVImageGenerator 慢解码**：730-820ms/帧 → 构建期抽取（§3）。
5. v1 包环回组装缓冲只有 manifest+关键帧真字节（`ssm1q_assembled_copy`
   零填充合同）→ 深度层帧源不得取自组装缓冲，改显式注入（§1）。

## 7. 待办与登记项

1. **半透明叠加**：GL/PixelMap 路径评估（§5）。
2. **HAP 口径体积**：平面表装机使 HAP 增大 7.37MB（§3 双口径）；如需收敛可
   评估 planes.zstd 分帧随机访问或恢复 RLE 流装机 + shim RLE 解码
   （DPD2v2 解码器已在 shim 内实现：32B 头 + raw/RLE + XOR chunk0 差分 + CRC，
   本轮真机未启用，代码保留）。
3. **task_x 并行线冲突**：同 app 冷启 auto 链（publish/accept loop）触发
   cheng ORC `registry_miss` segv（33.664→34.008，pid 11257 真机实证）会连带
   杀死 M7 播放进程——属 M6q 登记的编译器缺陷族 + x 线新 serve accept 路径，
   非 M7 引入；两线 auto 并存时的进程级冲突需 task_x 侧收敛。
4. 深度层自由视差渲染不做（后续）。

## 8. 两仓改动清单

- **UniMaker**（战役文件）：`hongmeng/scripts/ssm1_napi_shim.c`
  （+ssm1PlayInfo/ssm1PlaySetAsset/ssm1PlaySetPlanes/ssm1FramePixels/
  ssm1RenderPixels、RenderRgbaToSurface 参数化+偏移、DPD1/DPD2v2 包解码、
  平面表）、`hongmeng/scripts/ssm1_harmony_build.sh`（v2 三件套+平面抽取+
  尺寸校验）、`hongmeng/ssm1smoke/.../Index.ets`（M7 双层播放，与 task_x
  auto 链并存）、`types/libssm1napi/index.d.ts`。
- **主仓**：仅新增本文档；`src/tests/real_media_assets/hgs_faststart.mp4`
  曾作开发期 base（终验轮已切 M7-pack 正式产物），零源码改动。
- 装机 so：`libssm1napi.so`（t_drop_v3 车 obj + M6q 代 psb/psh/dbg 混代形态
  与 W 线登记一致）；产物收据见构建日志 sha256。
