# task_m16b: 鸿蒙侧「拍摄设备直接生成 CSG 视频」— 相机录制 + 端上 MiDaS 推理 + CSGD 深度包

日期：2026-09-13。设备：PLA-AL10（序列 3KN0224C18003262，HarmonyOS / HongMeng Kernel 1.12.0，
targetSdkVersion 6.0.2(22)）。HAP：UniMaker `hongmeng/ssm1smoke`（bundleName com.example.unimaker）。

## 0. 判词速览

| 层 | 判定 | 关键证据 |
|---|---|---|
| MiDaS_small → MindSpore Lite .ms 转换链 | **通过** | 容器 OH_AI 同形 API 对拍 rel=7.2e-6 / pearson=1.000000 |
| 真机 MindSpore Lite 装载 + 推理 | **通过** | dlopen 成功；模型 build 166-194ms；单帧推理 76-105ms |
| CSGD v0.1 打包 + 解析（格式闭合） | **通过** | 45/45 帧 RLE 无 underrun，python 解析器互操作通过 |
| 视频→端上推理→CSGD 全链（rawfile mp4 帧） | **通过** | 真机 45 帧 wall 5.9s/9.9s，CSGD 2.06/2.11MB |
| 端上包 vs PC 产线对拍 | **通过** | 逐帧 pearson mean=0.9137（43/45>0.8） |
| 相机采集→帧源（拍摄链入口） | **BLOCKED** | 真机三条路全拒，详见 §6 |
| 录制 mp4（含视频轨） | **BLOCKED** | HAL 视频流到录制面 0 帧（音频轨正常） |

## 1. 集成设计

```
[方案终态架构]（相机帧源解锁前，DEMO 链以 rawfile mp4 做帧源先行实证）
帧源 ──500ms 采样──> RGBA 帧 ──C bilinear 256x256 方形拉伸──> ImageNet 归一 fp32 NHWC
   ──> MindSpore Lite CPU(4线程) MiDaS_small .ms ──> depth[256x256] fp32
   ──> 逐帧 min/max 量化 u8 ──> 垂直差分 RLE ──> CSGD v0.1 组包 ──> 应用沙箱 files/
```

- **C 侧**（UniMaker `hongmeng/scripts/ssm1_capture_m16b.c`，include 进 `ssm1_napi_shim.c`，
  纯 C，与 ssm1_scene_render.c 同模式）：
  - `ssm1CapProbe()`：dlopen `libmindspore_lite_ndk.so` + 17 个 OH_AI_* 符号解析（能力硬判，
    缺失即报 ERR，不降级）。
  - `ssm1CapInit(bytes, threads)`：OH_AI_ContextCreate/SetThreadNum + CPU DeviceInfo +
    OH_AI_ModelBuild（内存建模型）。
  - `ssm1CapFrame(rgba,w,h,pts)`：bilinear 预处理 → OH_AI_ModelPredict → min/max 量化 →
    垂直差分 RLE → 帧累积。返回单帧耗时/量化 range。
  - `ssm1CapFinalize(frameMs)`：CSGD v0.1 组包（头 24B + 帧 blob + 偏移索引），交 ArrayBuffer
    后会话复位。
  - `ssm1CapAbort()`。
- **CSGD v0.1**（v0 基础上 flags=1，帧头带逐帧 `f32 dmin/f32 dspan` 标定，解码端反量化无需全局标定）：
  ```
  头 24B: magic "CSGD" u8 ver=0 u8 flags=1 u16 frameCount u32 w u32 h u32 frameMs u32 indexOffset
  帧 blob: u32 ptsMs f32 dmin f32 dspan u32 rleLen rle...
  索引: frameCount × u32 帧 blob 偏移
  RLE: 帧内 raster 垂直差分 (cur[y][x]=prevRow[x]+diff mod 256，首行 pred=0) + (count u8, value u8)*
  ```
- **ArkTS**（`Index.ets`）：按钮 `CAP:INIT`（探针+装模型）/ `REC` / `STOP+CSGD`（相机录制 +
  尽力而为 mp4）/ `DEMO:MP4→CSGD`（rawfile 视频→AVImageGenerator CLOSEST 500ms 采样→推理→
  CSGD，不经相机的全链真机验证口）。
- **权限**：module.json5 增 `ohos.permission.CAMERA` / `ohos.permission.MICROPHONE`（reason
  文案真机授权弹窗验证通过）。

## 2. 模型转换流程（全部实测，Mac 构建 + linux/arm64 容器）

1. **torch → ONNX**：`tools/export_midas_onnx_m16b.py`，torch.hub MiDaS_small（本地
   `midas_v21_small_256.pt`），固定输入 1×3×256×256（方形拉伸，偏离 small_transform 的
   keep_aspect——端上与 PC 对拍同规格，见偏差声明），opset 13。自检 torch vs ORT：
   真实帧相对差 6.0e-6。
2. **F.pad 动态 pads 固化（关键修复）**：torch 导出把 F.pad 的 pads 表达为
   Constant→ConstantOfShape→Concat→Reshape→**Slice(ends=-INT64_MAX 哨兵)**→…动态链。
   MindSpore Lite 的 Slice 核对负 ends 不做 clamp：哨兵入核即病态循环（进程挂死）或结果错位
   （实测 pearson 0.76；`--optimize=none` 同样 0.76，排除融合 pass）。修复：
   `tools/fix_onnx_pad_subgraph_m16b.py` 把每个 Pad 的 pads 输入临时提为图输出、用 ORT 在真实
   输入上求值（5 处，值如 [0,0,1,1,0,0,2,2]）、固化为 initializer，再按可达性剪枝删 339 个死节点
   （含全部哨兵链）。修复后 ORT 前后输出逐位一致（rel=0）。
3. **ONNX → .ms**：docker linux/arm64 ubuntu:22.04 容器 +
   `mindspore-lite-2.10.0-linux-aarch64.tar.gz`（sha256 与官方 2856e8d5…60ef 一致），
   `converter_lite --fmk=ONNX` → `midas_small_256.ms` 66,314,776B fp32；日志 0 条 int64 溢出
   （修复前 5 条 "int64 data -9223372036854775807 cannot fit into int32"）。
4. **.ms 数值对拍（容器，OH_AI 同形 C API）**：`ms_parity_linux.c`（MSModelBuild/Predict），
   输入须按 **NHWC 物理布局** 写入（.ms 张量物理布局 NHWC——本轮关键发现，喂 NCHW 会得到
   pearson 0.76 的假象）。结果：全模型 rel=7.2e-6，pearson=1.000000。
5. 产物 sha256：`midas_small_256.ms` = `c9f25dada05474ebb5a5c9d9d8a52e470c8860db4341388606f7601785b5ef59`
   （66,314,776B，`ssm1_harmony_build.sh` 安装进 rawfile）。

## 3. 真机 MindSpore Lite 可用性判定

shell 侧文件系统被 MAC 过滤不可信（`ls /system/lib64` Permission denied，
`test -e libace_napi.z.so` 报 NO 但 NAPI 实际在用）。**权威判定 = HAP 内 dlopen**：
`T_CAP init ... resp=OK in=[1x256x256x3x] inBytes=786432 outElem=65536 dtype=43`（fp32）
——真机 dlopen `libmindspore_lite_ndk.so` + 模型 build 成功，66MB rawfile 装载 166-249ms。

## 4. 真机时间线（全部实测 hilog，2026-09-13）

```
09:45:19  新 NAPI 面 module_init ok（含 cap* 导出）
11:06:50  T_CAP init bytes=66314776 ms=249 resp=OK in=[1x256x256x3x]   ← 首证真机 mslite
11:07:11  T_CAP rec start 480x480@60 …                                 ← 相机录制第 1 轮
11:07:27  T_CAP rec stop durMs=15823；convert fail 5400106
          （ffprobe：mp4=259B 仅 ftyp，无流）
11:09:28  rec start 480x480@60（videoFrameRate=range.min=1 的选档缺陷轮）
11:12:31  rec start 640x480@30 … mp4 仍 259B；camera_service 日志：
          RepeatStream:Video[1920,1080] 已建 / GetEisConfigInScene not find
          streamconfig 640x480@30 / HCaptureSession::Stop "Need to call after Start"
11:18:36  rec start 1920x1080@30 … mp4 仍 259B（HAL 原生档也无帧）
11:21:02  加音轨轮：recorder state prepared→started→stopped→released，
          mp4=42,523B = 纯音频（AAC 314 帧 / 6.656s，ffprobe 无视频流）
          → 判定：视频流 0 帧到达录制面，音频轨正常
11:38-43  ImageReceiver 轮：createImageReceiver 全部 YUV 格式 401
          （数值 1003 / 枚举 1000 / Size 重载同拒）；JPEG 档 receiver 可建，
          但 preview attach 其 surface → camera service fatal 7400201
11:47:39  DEMO 链（CLOSEST_SYNC）：T_DEMO done frames=45 csgdBytes=2060408
          inferTotalMs=3738 wallMs=5913 → M16B DEMO E2E PASS
          （注：CLOSEST_SYNC 返回关键帧对，连续采样帧 rle 相同）
11:49:52  DEMO 链（CLOSEST 精确帧）：frames=45 csgdBytes=2105254
          inferTotalMs=4225 wallMs=9934 → M16B DEMO E2E PASS
          单帧 inferMs 76.9~105.4ms（45 帧 @256x256，CPU 4 线程）
```

## 5. 端上包 vs PC 产线对拍（`tools/ssm1_csgd_verify_m16b.py`）

- 输入：真机 `m16b_demo_1789271392286.csgd`（2,105,254B）vs PC 产线同源视频
  （ffmpeg 2fps 抽帧 → PIL 256×256 bilinear → ImageNet 归一 → 修复版 ONNX 推理）。
- CSGD 解析：45/45 帧，RLE 无 underrun，索引/头全部闭合（u8 值域 [0,255] 非平场）。
- 逐帧归一后 pearson：min=0.3461 / **mean=0.9137** / max=0.9909；归一 MAD mean=0.0787；
  **43/45 帧 pearson>0.8 → PASS**。
- 两个最弱帧为 ffmpeg fps 滤镜与 CLOSEST 取帧的相位差落在场景切换处（源内容不同帧对比），
  非模型/打包缺陷。
- 确定性：两次独立真机运行 frame0 的 dmin/dspan 完全一致（151.790/718.177）。
- 偏差声明：端上路径 = 平台解码(PixelMap 720×1280)→C bilinear 256 方形拉伸；
  PC = ffmpeg 抽帧→PIL bilinear 256 方形拉伸。插值核/相位不同即对拍基线差异来源；
  small_transform 的 keep_aspect 语义本轮两端一致不用（已声明）。

## 6. BLOCKED 项（如实）

1. **相机帧源三路全阻（真机实测）**：
   - **AVRecorder 视频轨**：`videoOutput(recorder.getInputSurface())` 0 帧到达
     （`videoOutput.on('frameStart')` 从未触发）。4 个 profile 轮实测（480×480@60、
     640×480@30×2、1920×1080@30）mp4 视频轨恒缺（259B 或纯音频 42KB）；音轨 AAC 正常。
     camera_service XPower 显示 `RepeatStream:Video[1920,1080]` 已建、media_service
     `VideoCaptureFilter: set consumer usage 0x400b succ`，帧仍不到 → 判 HAL 视频流→录制
     surface 传输断（设备/栈层，非 ArkTS 接线问题——预览流同会话正常出图，XComponent 实拍截图为证）。
   - **ImageReceiver**：本 SDK `createImageReceiver` format 强校验 ∈ {YCBCR_422_SP(1000),
     JPEG(2000)}，相机 YUV 家族（数值 1003）一律 401；JPEG 档 receiver 可建，但 preview
     attach 其 surface 即 camera service fatal 7400201。
   - **AVImageGenerator 自救路**：只认含视频轨的容器；我们录的 mp4 无视频轨 → 5400106
     （无法解码自己的录制做降级采样；平台自身的 hgs_base.mp4 走此路已验证可行 = DEMO 链）。
2. **ohosdev 克隆被外部操作删除（11:23，本任务进行中）**：`/Users/lbcheng/cheng-f24/anchor_clones/`
   现仅存 quicfix/scenfix；psb/psh/dbg_ohos.o（M1 代 provider objs）与 host 依赖
   `React.js/scripts/libp2p/compile_cheng_shim.sh` 一并消失 → `libssm1napi.so` 无法在本机重编新
   C 面。本轮真机验证全部基于 11:02 构建版（已含 capProbe/Init/Frame/Finalize/Abort 五导出，
   恰好覆盖本链所需）；后续增导出面需先恢复 provider obj 产线（源在，工具链缺）。
3. **分享链路**：本轮传输 = hdc file recv 沙箱拉取（PC 对拍通道）。CSGD 字节承载到既有
   MoQ/QUIC serve（现为 SSM1 资产协议）的接线未做。
4. **缓解选型（待 BLOCKED-2 解锁后落地）**：NPU 通路（OH_AI_DEVICETYPE_NNRT / NNRT
   DeviceInfo）、帧间隔/分辨率自适应（128×128 / int8 量化）、相机厂商通道。本轮未启用。

## 7. 产物与工件

- 模型/对拍：`cheng-lang/artifacts/csg_asset_pipeline/m16b_capture/`
  （`midas_small_256.ms` c9f25dad…、`midas_small_256_msl.onnx`、`m16b_dev_demo_closest.csgd`
  1a4e0e5e…、`m16b_dev_demo.csgd`、`m16b_dev_rec_audioonly.mp4` a21c2513…、
  `ms_parity_linux.c`、`bench_in/expect.f32`）
- 工具（主仓 campaign tools 新增）：`export_midas_onnx_m16b.py` /
  `fix_onnx_pad_subgraph_m16b.py` / `ssm1_csgd_verify_m16b.py`
- UniMaker（仅迭代 ssm1smoke + scripts 战役文件）：
  - `hongmeng/scripts/ssm1_capture_m16b.c`（新，捕获/推理/打包核心）
  - `hongmeng/scripts/ssm1_napi_shim.c`（include + 5 个 NAPI 导出）
  - `hongmeng/scripts/ssm1_harmony_build.sh`（midas_small_256.ms 入 rawfile；DEPTH_VIDEO_SRC
    需 env 指向 v2/depth_qp10.mp4——v2 已更名）
  - `hongmeng/ssm1smoke/.../Index.ets`（CAP:INIT/REC/STOP+CSGD/DEMO:MP4→CSGD + 权限请求）
  - `hongmeng/ssm1smoke/.../module.json5` + `string.json`（CAMERA/MICROPHONE）
- 两仓 git 零写操作；设备安装走 hdc install（签名 HAP）。

## 8. 结论

「拍摄→端上 MiDaS→CSGD」的技术底座（转换链、端上推理运行时、CSGD 打包/解析、端上包与
PC 产线对拍）已全部在真机/容器实测通过；唯一缺口是**相机帧源**（华为 HAL 视频流→应用侧三条
取帧路径全拒，证据齐备）。帧源解锁后（或换用非该 HAL 的设备），零 PC 依赖的端上 CSG 视频
资产生产即达成——DEMO 链已证明除「相机」一跳外全链 45 帧 5.9~9.9s 完成（推理占 3.7~4.2s）。
