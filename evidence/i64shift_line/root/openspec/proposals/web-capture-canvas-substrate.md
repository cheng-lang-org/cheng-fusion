# 提案：浏览器采集与画布导出基底（getUserMedia / canvas.toBlob 收口）

状态：**partially-applied**（2026-08-22，web-csg closure 线 B 残余缺口实现方案）。方案 B（canvas.toBlob PNG 编码器）已实施并通过外部 zlib oracle 验证；方案 A（mediaDevices 宿主桥）仍为 propose 待裁决。

## 背景与动机

UniMaker 全目录抽取的 runtime closure 在 serviceWorker / geolocation / clipboard / caches 族闭合后（2026-08-22 决策表收口），仅剩两个无真实基底的 open 族：

- `navigator.mediaDevices.getUserMedia`：requirements 9 处 + external symbols 同名（camera.ts 形状：`{video:true}` 约束、stream 句柄生命周期）。
- `canvas.toBlob`：1 处调用（PNG 导出路径）。

这两族是 `complete=true` 的最后障碍。它们不是 UI 转译问题——retained 场景的 1:1 渲染/交互不经过它们；它们是「任意浏览器内容」语义覆盖的最后一公里。

## 方案 A：mediaDevices 采集宿主桥

### 分层

1. **Cheng 运行时面**（新增 `src/core/runtime/web_media_devices_runtime.cheng`）：
   - `WebMediaDevicesGetUserMedia(constraintsJson: str, out: var str): bool` —— 返回 streamHandleId JSON 或错误对象；契约沿用 geolocation 的 borrowed-view + copy 形。
   - `WebMediaStreamGetTracks(handle: int32, out: var str): bool`、`WebMediaStreamStop(handle: int32): bool`。
   - 设备枚举/权限查询接既有 `web_permissions_runtime.cheng`（camera/microphone 已有 denied/prompt 语义）。
2. **宿主 FFI 面**（`cheng_mobile_bridge.h` 增三个函数指针，与 clipboard_write_text 同表）：
   - Darwin：AVCaptureSession（VideoToolbox 已在 link flags 里）。
   - Android：Camera2 + AudioRecord（mobile shell codegen 已有 surface/texture provider 先例）。
3. **决策表面**（runtime-providers.ts）：getUserMedia call/property/globalThis 三形态 → `cheng/core/runtime/web_media_devices_runtime.get-user-media`；getTracks/stop → 同模块 track-lite。

### 验收门

- 真机（或 macOS 本地 AVCapture）打开前置摄像头 → 帧计数 >0 + 权限拒绝路径返回标准NotAllowedError JSON。
- ts-csg 决策断言 + UniMaker 全量报告 getUserMedia 族归零。
- 不做假流/空实现：宿主不可用时必须 hard-fail 到 open 语义，禁止 noop 冒充。

## 方案 B：canvas.toBlob 编码器

### 分层

1. **编码器**：PNG 编码纯 Cheng 实现（zlib stored/fixed-huffman 基线即可满足 toBlob 合同；不需要压缩率）。放 `src/core/runtime/web_canvas_export_runtime.cheng`，输入 pixel buffer（来自 web_raster_runtime 栅格化产物）+ 尺寸，输出 PNG Bytes。
2. **运行时面**：`WebCanvasToBlob(canvasHandle: int32, mime: str, out: var str): bool`（blob 以 handle+size 引用，内容按需取）。
3. **决策面**：`canvas.toBlob` call → `...web_canvas_export_runtime.to-blob-png`。

### 验收门

- 栅格化 8x8 已知像素 → PNG 字节解码回读像素一致（round-trip 断言，进 src/tests smoke）。
- Chrome 对同一 canvas 的 toBlob 产物做字节级尺寸/签名对拍（magic+CRC 合法即可，不要求与 libpng 字节一致——编码器自由度属实现细节）。

## 工作量与顺序

| 项 | 规模 | 依赖 |
|---|---|---|
| canvas.toBlob PNG 编码器 | 小（纯 Cheng，~300 行+smoke） | 无 |
| mediaDevices Darwin 桥 | 中 | AVCapture 会话管理、权限流 |
| mediaDevices Android 桥 | 中 | Camera2 session 接 mobile shell |
| 决策表+金样 | 小 | 各自基底编译运行证明先行 |

建议顺序：toBlob 先行（无外部依赖、当轮可闭环）；mediaDevices 按 Darwin→Android 分两刀。

## 明确不做

- 不引入第三方 C 库（libpng 等）——违背 zero-C 方向。
- 不做软编码之外的 GPU 回读优化（当前无性能需求方）。
- 宿主桥缺失平台保持决策 open，不 noop 冒充 closed。
