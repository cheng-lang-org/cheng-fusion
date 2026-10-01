# C1 同步采集 — 相机轨阻塞点归因与解锁路径

日期：2026-09-19。依据：`docs/campaigns/2026-09-06-csg-asset-pipeline/task_m16a_android_capture.md`、`task_m16b_ohos_capture.md` + 2026-09-19 源码/设备实测核对。C1 定位见本目录 task_plan.md：产出 `semantic_video/{capture,calibration,clock_map}.cheng`，验收 = 原生采集可被 B3 消费（非文件回放冒充）。

## 1. 阻塞点归因表

| 平台 | 阻塞点 | 精确位置 | 根因 | 类型 |
|---|---|---|---|---|
| M16A 安卓 | 换 raw-trace 模型后第三轮真机回归未跑 | 设备 DCO-AL00（serial GBJ0222B24021692），当时被 org.cheng.unimaker.scene 会话占用 | 纯设备占用，**代码零缺口** | 调度 |
| M16B 鸿蒙 | 相机帧源：VideoOutput→AVRecorder 视频轨 0 帧 | `Index.ets:1047 createVideoOutput(vp, recSurface)`；`Index.ets:1055 videoOutput.on('frameStart')` 注册后从未触发 | HAL 视频流→录制 surface 传输断（camera_service 显示 RepeatStream:Video[1920,1080] 已建，帧仍不到；预览流同会话正常出图） | 设备/HAL |
| M16B 鸿蒙 | 相机帧源：ImageReceiver 拒 YUV | `Index.ets:992 image.createImageReceiver(w,h, YCBCR_422_SP, 8)` → 401；本 SDK format 白名单仅 {1000, 2000}，相机 YUV 数值 1003 全拒；JPEG 档 attach 预览 → camera service fatal 7400201 | SDK 版本能力缺失 | SDK |
| M16B 鸿蒙 | 自救路 AVImageGenerator 不可用 | 5400106：只认含视频轨容器，自录 mp4 无视频轨（259B ftyp-only 或 42KB 纯音频） | 上两项的连带 | 连带 |
| M16B 鸿蒙 | libssm1napi.so 无法重编 | `hongmeng/scripts/ssm1_harmony_build.sh:19` 依赖 `SSM1_OHOSDEV_ROOT=/Users/lbcheng/cheng-f24/anchor_clones/ohosdev`——该目录 2026-09-19 实测**已空**（ohosdev 克隆及 psb/psh/dbg_ohos.o、compile_cheng_shim.sh 均失） | 外部删除 | 工具链 |
| C1 自身 | capture.cheng / calibration.cheng 未开工 | `src/game/assets/semantic_video/` 现有 clockmap/schema/validator 等 10 文件，无 capture/calibration | 排期未到（且被上两行门住） | 排期 |

## 2. M16A：一步之遥

已闭环（两轮真机）：CameraX `VideoCapture(Quality.SD)` + `ImageAnalysis(YUV_420_888 640x480)` → MiDaS lite 1.13.1 → 500ms 栅格 → CSGD v0 逐位自校验 → SHA 内嵌 manifest → 分享。模型域 PC/真机锚 maxdiff=9.8e-4（raw-trace 版，`.ptl` 86,185,979B）。

**2026-09-19 现场核对**：
- 设备 adb 在线（GBJ0222B24021692 device），前台为 com.kiwibrowser.browser——原占用会话已让出。
- 但装机包列表**无 com.cheng.ssm1e2e**（采集 APK 已被卸/清）。
- 本地 APK 在且含新模型：`/Users/lbcheng/UniMaker/ssm1android/app/build/outputs/apk/debug/app-debug.apk`（195,831,688B，09-13 12:47 构建，内含 `assets/midas_v21_small_256x128.ptl`，SHA 与 `CaptureDepth.kt:66 MODEL_SHA256` 常量一致 = 9a2ab0ae…8e9a5）。

**解锁路径**（无代码改动，估 0.5 人日，含设备协调）：
1. `adb install -r app-debug.apk`（包 198MB）。
2. 申请设备空窗（DCO-AL00 与他方会话共用，这是当初阻塞的原始成因，需协调机制）。
3. 跑一轮 REC（≥12s）→ T_PACK / T_ANCHOR_EXPORT（`CaptureDepth.kt:364-380` 出 anchor_input/anchor_output.f32）→ pull 产物 → `tools/m16a_crosscheck.py` 对拍。绿即 M16A 完整闭环。

## 3. M16B：卡在设备/HAL，非接线

已闭环：mslite 转换链（ONNX pad 固化）+ 真机推理（76-105ms/帧@256x256）+ CSGD v0.1 打包解析 + DEMO 链（rawfile mp4→AVImageGenerator CLOSEST→推理→CSGD，45 帧 pearson 0.9137 vs PC）。权限（CAMERA/MICROPHONE）真机弹窗已验证。

**阻塞本质**：PLA-AL10 该代 HAL/SDK 上，应用侧三条取帧路全断（证据齐备，见 §1 表）。预览流出图正常 → ArkTS 会话接线（`beginConfig/addInput/addOutput/commitConfig/start`，`Index.ets:1048-1071`）无错。已试 4 个 video profile（480x480@60 / 640x480@30×2 / 1920x1080@30）均无视频轨。

**解锁路径**（互斥或并行）：
- **P1 换设备**（估 0.5-1 人日）：任一视频轨正常的鸿蒙设备， hdc install 现有签名 HAP（11:02 构建已含 capProbe/Init/Frame/Finalize/Abort 五导出，覆盖本链所需）直接复测 REC。风险：同代华为设备可能同样命中 HAL 缺陷。
- **P2 升 SDK/DevEco**（估 1-2 人日 + 回归）：新版 OpenHarmony SDK 的 `createImageReceiver` 若放开相机 YUV 格式白名单（或 camera NDK 双流通路），活体帧源即通——`Index.ets:988-1012` 的 try/catch 接线已就位，格式被拒才走 DEMO 回退。
- **P3 厂商通道/NPU 缓解**：原 doc 已声明待定项，无界，不建议现在投入。
- **P4 平台缺陷上报**（7400201 / RepeatStream 视频流 0 帧）：外部依赖，不受我方工作量控制。

**前置修复（P1/P2 之前就要做）**：恢复 `/Users/lbcheng/cheng-f24/anchor_clones/ohosdev` 克隆 + provider objs 产线（cheng driver `--emit obj --target aarch64-linux-ohos` + `React.js/scripts/libp2p/compile_cheng_shim.sh`）。DevEco clang 仍在（/Applications/DevEco-Studio.app/.../aarch64-unknown-linux-ohos-clang）。工作量取决于克隆恢复方式（远端重克隆或备份找回），未量化；**不恢复则任何新 NAPI 导出（如原生喂数进 ssm1CapFrame）都无法本机重编**。另：PLA-AL10 当前 hdc 不在线。

## 4. 依赖关系

```
M16A(安卓真机回归, 差一轮) ──┐
                            ├──> C1 capture/calibration.provider ──> D1 直播协议 ──> D2 长流 ──> F1 总验收
M16B(鸿蒙帧源, 卡HAL/SDK) ──┘         （clockmap.cheng 已在 src/game/assets/semantic_video/）
```

- **关键路径是 M16A**：只差一轮真机回归，且 09-19 设备已空闲、APK 已就绪——C1 最快解锁口。
- M16B 是第二 provider，卡设备/HAL/SDK 与克隆恢复，不挡 M16A 侧 C1 推进，但挡「跨设备/跨平台采集」完整形态（D1/D2 的第二入口）。
- C1 自身 `capture.cheng`/`calibration.cheng` 尚未编写，provider 一通即应开工（B3 消费验收在 `semantic_player`）。
