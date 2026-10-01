# task_d1_depth_cam — Camera2 DEPTH16 硬件深度探针（DCO-AL00）

日期：2026-09-13。设备：DCO-AL00（HUAWEI，Android 12 / SDK 31，QTI CamX HAL，serial GBJ0222B24021692，多会话共用）。工程：`/Users/lbcheng/UniMaker/ssm1android/`（apkdev 克隆不存在，anchor_clones 下只有 quicfix/scenfix，按 M16a 先例直接迭代）。目标：用 Camera2 DEPTH API 取真实深度图（Depth16 640×480 mm）替代 MiDaS 推理，验证硬件深度质量并接入 CSG 场景图拟合管线。

## 判词（先行）

**Camera2 DEPTH 链路在端上打通到「open → 会话 → repeating 全成功」，但首帧请求被 HAL 拒绝：CamX 深度转换节点 `InitConversionLib() Depth Conversion lib Metadata is null!` → `process_capture_request` 返回 ENOSYS(-38) → 框架 ERROR_CAMERA_SERVICE(4)。确定性复现（id=4/id=7 两颗隐藏 ToF 设备 × 多轮），DCO-AL00 对三方 app 无可用硬件深度路径。真机 Depth16 数据为零，深度质量验证与硬件深度场景图 BLOCKED；CSG 衔接工具链已交付并以（明确标注的）合成场景自检贯通，MiDaS 基线场景图已用 M16a 真实捕获跑出，待任一设备出真实 Depth16 后一条命令对拍。**

## 1. Camera2 DEPTH 方法（Kotlin 探针，已交付）

新增 `app/src/main/java/com/cheng/ssm1e2e/DepthCam.kt`（DepthCamController，~300 行）+ MainActivity 第二行「DEPTH CAM」按钮（权限缺省走 requestCode 4002）：

- **设备发现**：不信 `cameraIdList`（本机返回 0/1），硬扫 id 0–9 逐个 `getCameraCharacteristics`；判 `REQUEST_AVAILABLE_CAPABILITIES_DEPTH_OUTPUT` 与 depth 流配置键。本地 SDK 镜像 stub 缺 `DEPTH_AVAILABLE_*` 常量，用键名运行时构造 `CameraCharacteristics.Key("android.depth.availableDepthStreamConfigurations", IntArray)` 绕过。
- **实测扫描**（T_DCAM_SCAN）：`id=4:facing=0 dcfg=8`、`id=7:facing=0 dcfg=8`，其余无；任何相机（含 0/1/5/6）都无 `DEPTH_OUTPUT` 能力。dcfg 解出 `[fmt=540422489 640x480 OUTPUT][同 INPUT]`（540422489=0x20363159 = DEPTH16 族 + 厂商标记位），sensorOr=90/270，与 dumpsys 完全一致。
- **采集**：`ImageReader.newInstance(640,480,DEPTH16,maxImages=4)` → SessionConfiguration（API<28 回退 legacy）→ `TEMPLATE_PREVIEW` repeating（stub 的 `Builder.addTarget` 被改成返回 void，禁用链式写法，语义不变）。
- **DEPTH16 解码**：uint16 LE，`mm = v ushr 3`，`conf = v and 7`，无效像素 raw==0 原样保留，不做任何端上插值。
- **落盘**：10 帧缓存后停流；`depth_raw_XX.u16`（614400B 原始 u16 LE，供 PC 全精度转换）+ `depth_vis_XX.png`（10 帧联合 min/max 灰度可视化）；逐帧 T_DCAM_FRAME 打点（validPct/mmMin/mmMax/mmMean），末尾 T_DCAM_DONE 带全局值域与 conf 直方图。
- 真机踩坑记录：M16a 的真机教训延续有效——多会话设备要抢前台重试（`d1_drive.sh`）；共享 SDK 镜像 stub 有缺陷（见 §4）。

## 2. 真机深度图（真实数据判读）——BLOCKED，零数据，证据链完整

深度链路走到最后一步被 HAL 拒绝，无任何真实 Depth16 帧产生。证据（`artifacts/csg_asset_pipeline/depthcam/evidence/`）：

1. **dumpsys media.camera**：`android.depth.availableDepthStreamConfigurations` 只挂在带 `tofSupported=1` 的隐藏 HAL 设备 `device@3.7/legacy/4` 与 `legacy/7` 上（`[540422489 640 480 OUTPUT]`，minFrameDuration 33ms）；CameraService 公开映射只有 Device 0→"0"、1→"1"、2→"5"、3→"6"——**ToF 设备根本不在公开 id 列表**，且全部 9 个设备段的 `availableCapabilities` 均无 `DEPTH_OUTPUT`。
2. **app 实测**：隐藏 id 4/7 的 characteristics 可读、`openCamera` 成功、DEPTH16 会话 configure 成功、`setRepeatingRequest` 成功（T_DCAM_SESSION sinceTapMs≈100ms）。
3. **首帧即死**（`logcat_dcam_runs.txt`，确定性 ×6 轮、两颗设备同样死法）：
   ```
   E CHIUSECASE: camxchinodedepth.cpp:1260 InitConversionLib() Depth Conversion lib Metadata is null!
   E Camera3-Device: Camera 4: sendRequestsBatch: Unable to submit capture request 0 to HAL device: Function not implemented (-38)
   E Camera3-Device: Camera 4: disconnectImpl: Shutting down in an error state
   I SSM1E2E: T_DCAM_ERR open error=4   (ERROR_CAMERA_SERVICE)
   ```
4. **归因**：QTI CamX 的深度转换节点在公开 Camera2 请求路径上拿不到它需要的厂商元数据（华为 ToF 实际走私有 bokeh 管线 + `third_app_filter.xml` 白名单体系），`process_capture_request` 直接 ENOSYS。这不是 app 层可修的配置问题（模板/会话类型/请求键均不影响该静态元数据缺失），硬件深度在此设备上对三方 app 不可达。

「值域非全零/平面区方差小/物体边缘有梯度」三项质量判据：**无真实数据，不判，不编数**。

## 3. CSG 管线衔接（工具已交付并验证贯通）

新增主仓 `tools/csg_depth_camera_probe.py`（六个子命令），衔接约定如下，自检（见 §5）已全链贯通：

- **Depth16 → WB 产线域**：raw u16 → 按 sensorOrientation=90 旋转（CCW90，与 M16a CaptureDepth 同约定）→ PIL BOX 面积均值下采样 640×480 → 128×256 → **f4 = 1.0/Z_mm（视差域）**。选逆深度域的原因：WB 管线把 u8 按视差解释（Z=DISP_B/v），只有 v∝1/Z 时「场景平面在 u8 域才是仿射平面」，M8a RANSAC 的几何前提才成立——与 MiDaS 逆深度输出同构，两路线对拍公平。无效像素 resize 后按帧内有效中位填充，`manifest.fillPct` 如实记录。npy 头断言 128B（管线 `offset=128` 依赖）。
- **喂管线**：`csg_depth_camera_probe.py pipeline --qmin/--qmax`（全流全局量化域从 convert 的 manifest 取）→ `csg_lens_pipeline.run`（M8a RANSAC LCG 20260912 / thresh 12 / iters 256 / K≤16 + M9d OBB + M9e WS + M11 MES1 + M9b FGS0）→ `scene_v1.json` 场景图。
- **对拍命令就绪**：`compare --depthcam-dir <depthcam产物> --midas-dir <MiDaS基线>`（结构指标：平面数/覆盖率/盒数/厚度模式）。

## 4. 对拍基线（MiDaS 路线场景图，真实数据，已跑出）

Depth16 路线无数据，无法完成对拍；**MiDaS 路线基准已建立**：把 M16a 端上真实捕获（26 帧 128×256 CSGD，2026-09-13 拍摄）按 manifest 量化域 u8 精确重建为 f4 npy，跑同一 WB 管线：

| 指标 | MiDaS/M16a 实拍（26帧） | MiDaS/胡广生 WB 参考 | Depth16 硬件（BLOCKED） |
|---|---|---|---|
| 帧0 平面数 K | 7 | 5 | — |
| K 范围（全片） | [7,10] | [1,8] | — |
| 覆盖率 frame0 / 全片均值 | 98.33% / 98.82% | 99.16% / 98.66% | — |
| OBB 盒数 / 厚度模式 | 7 / 3σ+0.05Z | 5 / 3σ+0.05Z | — |

产物：`artifacts/csg_asset_pipeline/depthcam/midas_m16a/`（scene_v1.json、report.json、CSGD 包+manifest 留档）与 `midas_m16a_depth/`（26 帧 npy）。同一管线下，未来真实 Depth16 的 K/覆盖率应显著低于 MiDaS 相对深度（绝对深度毫米域去掉了 MiDaS 的尺度漂移伪平面），此为预期的判读假设，待数据验证。

## 5. 工具链自检（SYNTHETIC，仅证管路，非传感器数据）

`csg_depth_camera_probe.py selftest`：合成双平面场景（墙 2200mm±倾斜 + 前景块 1200mm + ±2mm 噪声 + 边界无效像素，seed 20260913）以 Depth16 u16 落盘 → validate（断言 mmMin>0、mmMax<65535 通过）→ convert → WB 管线：**精确拟出 K=2 平面、2 盒、覆盖率 98.9%**（`selftest/`，每处标注 SYNTHETIC）。证明「Depth16 文件 → 场景图 JSON」全链无缺陷，唯一缺口是设备出不了真实帧。

## 6. BLOCKED 项

1. **DCO-AL00 硬件深度不可达**（本任务核心）：CamX 深度节点对三方请求路径 ENOSYS，证据 §2。解锁路径（均超出本任务权限范围）：设备厂商白名单（`third_app_filter.xml` 体系/系统签名）、或换一台按 CDD 暴露 `DEPTH_OUTPUT` 的设备（Pixel ToF 机型/带结构光的机型）。
2. 若获得任一设备的真实 Depth16：`adb pull` 后依次 `validate → convert → pipeline --qmin/--qmax → compare` 四条命令即为完整对拍闭环（命令与格式全部已验证）。
3. 华为私有 ToF 管线（com.huawei.* 元数据键驱动深度节点）逆向接入：未尝试，未文档化、不稳定，不做启发式绕过。

## 7. 产物清单

- UniMaker/ssm1android：`app/src/main/java/com/cheng/ssm1e2e/DepthCam.kt`（新）、`MainActivity.kt`（DEPTH CAM 按钮 + 4002 权限回调）；APK 构建安装成功（终版 sha256 前 16 位 2d31d045ccf50535，含 id 轮换探针）
- 主仓 tools/：`csg_depth_camera_probe.py`（validate/convert/pipeline/compare/midas-baseline/selftest）
- 产物：`artifacts/csg_asset_pipeline/depthcam/**`（evidence/ 真机证据、midas_m16a/ MiDaS 基线场景图、midas_m16a_depth/、selftest/、compare.json、d1_drive.sh 驱动脚本）
- 本文档：`docs/campaigns/2026-09-06-csg-asset-pipeline/task_d1_depth_cam.md`
