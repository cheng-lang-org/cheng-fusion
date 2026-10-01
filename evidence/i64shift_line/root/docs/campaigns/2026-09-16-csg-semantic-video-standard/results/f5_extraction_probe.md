# F5 单对象提取可行性探测（胡广生.mp4）

- 日期：2026-09-17。执行：子代理 F4（S5 硬围栏探测，约 30 分钟预算，实际 ~18 分钟）。
- 素材：`src/tests/real_media_assets/hgs_faststart.mp4`，h264 yuv420p 1304x2320 30fps 22.5s + aac（ffprobe 实测确认）。
- 探测产物：`.scratch/f5/`（帧 PNG、两个探测脚本、overlay），仅供复核，非生产路径。
- **声明：本探测不构成任何提取能力验收；误差门未冻结；不进入主线；未向纯 Cheng 生产语义路径引入任何东西。本素材无真值标注，全部数字不构成准确率。**

## 步 1：帧访问可行性

### 1a 外部工具对照路（ffmpeg）——成功

```
ffmpeg -v error -i src/tests/real_media_assets/hgs_faststart.mp4 \
  -vf "select='eq(n\,60)+eq(n\,300)+eq(n\,540)'" -vsync 0 -frames:v 3 frame_%d.png
```

3 帧全部抽出（n=60/300/540 即 t=2s/10s/18s）。像素访问即 PIL/numpy 读 PNG。

### 1b 纯 Cheng 路——能解 1 帧，但拿不到像素字节（能力边界）

读 `src/std/media_platform.cheng` + `src/core/runtime/core_runtime_provider_darwin.cheng`：

- 首帧桥存在：`MediaPlatformDarwinDecodeFirstFrame(data: rawbytes.Bytes) -> Result[MediaPlatformFirstFrameDecodeReceipt]`（media_platform.cheng:152），底层 export 在 core_runtime_provider_darwin.cheng:5169。链路：整文件字节 → MP4 box 扫描 → avcC + 第一个视频样本 → VTDecompressionSession → CVPixelBuffer → CVMetalTexture。
- **能解几帧：1 帧**（单发桥，只解 moov 扫到的第一个视频样本，无顺序解码/seek）。
- **像素在哪个结构：只到句柄**。receipt 字段为 `pixelBufferHandle: uint64`（CVPixelBuffer 指针）与 `textureHandle: uint64`（CVMetalTexture），另有 width/height/pixelFormat 元数据。
- **CPU 字节出口缺失**：解码 runtime provider 内无 `CVPixelBufferLockBaseAddress` / `GetBaseAddress` / `GetBytesPerRow` / `GetPlaneCount` / `GetBaseAddressOfPlane` 导入（grep 证实；`LockBaseAddress`/`GetBaseAddress` 只出现在编码侧 `src/game/cinema/vtbr.cheng:43-47`，未接到解码 receipt）。
- **GPU 回读缺失**：provider 内 `newBufferWithBytes:length:options:` 均为 CPU→GPU 上传方向；无 MTLBuffer getBytes/blit 回读接线。
- 会话创建 `destinationImageBufferAttributes=nil`（core_runtime_provider_darwin.cheng:5433-5438）→ VT 输出原生 420 双平面（`420v`，provider 常量 chengDarwinMediaPixelFormat420VideoRange=875704438 有识别分支），不是 BGRA 平面字节。
- 唯一调用方 `src/moq/media_asset_manifest.cheng:2315`，只消费 receipt 元数据做清单证据，不读像素。

**判定：纯 Cheng 当前拿不到任何一帧的 BGRA/平面像素字节。**

## 步 2：单对象提取尝试（外部帧上，仅探测）

素材实况（目检 frame_1/3）：竖屏画布内嵌 MV 画面，上下大片 letterbox 黑边（RGB≈30,30,30），叠加标题字"胡广生—任素汐—"、竖排歌词、左下角"@任素汐"水印；主体人物穿深色毛衣、深色头发、深色背景——**主体颜色与背景同色系，且画面带文字图层**。

### 轮 1：border-ring 背景估计 + 最大非背景连通域（scipy.ndimage，探测专用）

| 帧 | 质心(归一化) | 包围盒(全分辨率) | 面积比(全画布) | 连通域数 |
|---|---|---|---|---|
| n=60 | (0.5216, 0.4263) | [552,784,868,1180] | 0.0281 | 27 |
| n=300 | (0.4295, 0.4418) | [416,784,780,1216] | 0.0315 | 14 |
| n=540 | (0.5219, 0.3880) | [564,736,848,1052] | 0.0173 | 38 |

质心跳变（归一化欧氏）：f1→f2 = 0.0934，f2→f3 = 0.1069（折合 ~120-250px）；面积比 spread = 0.0142（相对波动 ~±45%）。

overlay 目检证实：**提取到的"最大连通域"是脸部高光区，不是完整人物**——深色毛衣与深背景在颜色距离阈值下融合，只有肤色/面部成块。朴素假设"最大非背景连通域=主体"在本素材上退化。

### 轮 2：letterbox active-region 裁剪 + 内容区内四角背景估计

| 帧 | active 区(全分辨率) | 质心(归一化) | 面积比(区内) |
|---|---|---|---|
| n=60 | [260,528,752,1868]（宽比 0.377） | (0.4927, 0.4266) | 0.1232 |
| n=300 | [228,844,988,1868]（宽比 0.583） | (0.5001, 0.4414) | 0.1660 |
| n=540 | [228,764,1032,988]（**错误**） | (0.5924, 0.3775) | 0.4709 |

质心跳变：f1→f2 = 0.0165（好），f2→f3 = 0.1123（被 frame_3 污染）。

**frame_3 失败模式**（overlay2 目检）：整体偏暗帧上，亮度行阈值把"脸部高光横带"误判为内容区（active 区高仅 224px），mask 糊在脸上，0.4709 面积比是伪数字。

### 一致性结论（无 GT，不构成准确率）

- 两条朴素路均不稳定：轮 1 稳定提取"脸"但跨帧跳变大且非主体；轮 2 在暗帧上 active-region 检测即失败。
- 本素材做单对象提取至少需要语义级分割（人形先验）或学习模型，颜色/亮度启发式不够。

## 步 3：纯 Cheng 生产链差距清单

| # | 缺口 | 现状 |
|---|---|---|
| 1 | 多帧解码桥（顺序解码/seek/逐帧 PTS） | 缺失。现存首帧桥仅 1 帧单发，darwin only（linux 侧 core_runtime_provider_linux.cheng:4942 是同名 stub export） |
| 2 | 解码输出像素字节出口 | 缺失。receipt 只有 u64 句柄；需 CVPixelBufferLock/GetBaseAddress/BytesPerRow/plane 导入接线（FFI 模式可循 vtbr.cheng:43-47），或请求 BGRA 输出 + 回读 |
| 3 | 420 双平面布局处理 | 缺失。`destinationImageBufferAttributes=nil` → 输出 420v 双平面含 stride；CPU 路需 2 平面+stride 解包或改会话属性 |
| 4 | 像素结构访问（Cheng 内图像 buffer 类型） | 缺失。仓内无 Cheng 侧帧像素 SoA 结构；AST/TypedExpr/CSG DOD 约束同样适用于此处新数据结构 |
| 5 | 连通域/形态学/分割算法 | 缺失。本探测用的 scipy.ndimage 属外部对照；生产需在 Cheng 内实现 label(union-find)/开闭运算/fill-holes，或接语义分割模型（更远） |
| 6 | 性能口径 | 无现存口径。1304x2320 ≈ 3.0M 像素/帧，30fps 实时需并行扫描 + 内存模型逐相贴线（硬约束卡 memory_model_constraints.md） |
| 7 | 样本层接线 | 部分现存。B2/B3/E1 到容器样本层（字节范围+PTS）；首帧桥输入是整文件字节，非按样本喂入，多帧路需打通样本→解码器逐帧喂入 |

## 步 4：结论

**feasible-with-external-frames**（不是 blocked-at-decode，也不是 partial）：

- 外部工具（ffmpeg）帧访问完全可行，帧上能跑最简提取，故非 blocked-at-decode。
- 纯 Cheng 首帧桥能解出 1 帧但 receipt 只给 CVPixelBuffer/Metal 句柄、无任何 CPU/GPU 像素字节出口，"首帧桥够用"不成立，故非 partial。生产链的精确阻塞点是**解码后的像素字节访问**（差距清单 #2/#3），不是解码本身。
- 朴素提取在本素材上两轮均不稳定（轮 1 提到脸、轮 2 暗帧失败），数字仅作一致性参考：轮 1 质心跳变 0.093/0.107、面积比 1.7%-3.2% 且非完整主体。

**下一步前置条件（按序）**：
1. 解码桥像素出口：会话请求 BGRA（或 420 平面导出）+ CVPixelBufferLock/GetBaseAddress/BytesPerRow 接线进 receipt；
2. 多帧顺序解码桥（样本层 B2/B3 字节范围 → 逐帧喂入）；
3. Cheng 侧帧像素 SoA 结构 + 连通域实现（含内存模型逐相贴线口径）；
4. 真值标注或至少人工勾选帧集，否则"误差"永远只是跨帧一致性。
