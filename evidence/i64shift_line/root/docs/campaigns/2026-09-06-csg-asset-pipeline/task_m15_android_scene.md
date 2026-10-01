# task_m15_android_scene.md — 背景场景图求值渲染+自由视角对称移植安卓（M15）

日期：2026-09-13。上游：`task_m9a_bg_csg.md`（scene JSON v0 + 重投影公式 + python 锚点）、`task_n_scene_render.md`（鸿蒙同能力实证与判据）、`task_m7_android_play.md`（ssm1android 工程现状：M7 双层播放 MainActivity）。
真机：HUAWEI DCO-AL00（Android 12，serial `GBJ0222B24021692`，与其他会话共用）。
工程：`/Users/lbcheng/UniMaker/ssm1android/`（纪律内唯一可迭代目录），gradle 9.4.1 + AGP 9.0.0 直建。

**终判（本轮）：安卓 SCENE 渲染全链一次打通并真机三视角 PASS——Kotlin 求值渲染核与产线 python 参考（鸿蒙 N 线宿主四视角逐位 PASS 的同一实现）逐像素一致（三视角 covered 区 MAD≈1.0，屏幕重采样级），自由视角三张截图两两互异（meanAbsDiff 21.0/25.4/22.0 全部 MAD>5）且随平移量增长，视差方向与 M9a view_shift6 同构。**

---

## 1. 移植设计（鸿蒙 N 线 → 安卓对称映射）

| 环节 | 鸿蒙 N 线 | 安卓 M15（本轮） |
|---|---|---|
| 场景资产 | hgs_scene.sc1（SCENE1 二进制，python 预打包） | **scene_frame0.json 原件**（15232B，sha `f7908bae…95b99` == M9a）直接入 `res/raw`，Kotlin `org.json` 严格解析（format/camera model/纹理长度/多边形偶长全 require，不符即抛） |
| 可见掩码 | SCENE1 内嵌产线 BFS 4096B/平面位图 | JSON `regionPolygonFlat` 偶奇逐像素中心 ray-cast 栅格化（任务书指定路径）；与 BFS 掩码边界像素差 -286px（-0.93%，§3 如实记录） |
| 渲染核 | 纯 C `ssm1_scene_render.c`（逐字复刻 M9a） | Kotlin `SceneGraph.render()`（逐字复刻 `csg_bg_scene_fit.py` plane3d/render 平移形态：`n=[aF,bF,aCX+bCY+c]` 归一、`t=(D-n·C)/(wd·n)`、反投影 `Math.rint`==`np.rint` 半偶、t 最小 z-buffer、未覆盖=黑；IEEE 运算序与 numpy 一致） |
| 纹理 | hgs_bg0.rgb（base.mp4 首帧 bicubic 128×256，MAD=0.0854 对齐实证） | **同一文件位级复用**（98304B，sha `8b67a8a5…a200` == N 线）→ `res/raw` |
| 上屏 | NAPI → OH_NativeWindow blit（XComponent buffer 同步曾成坑） | 自绘 `SceneView`（View 层级 Canvas drawBitmap 最近邻 fit-center）——**规避 N 线 §补录 的 buffer 同步坑**，screencap 直接所见即所画 |
| 自由视角 UI | SCENE:LOAD/CAM:0/CAM:+6/CAM:+12/ROT:5 六钮 | `CAM:0 / CAM:+6 / CAM:+12` 三钮（点击暂停 M7 双层播放、隐藏深度层、求值+上屏） |
| 时间线 | hilog SCENE/SCENE_SEQ 打点 | logcat `SSM1E2E`：`T_SCENE_LOAD` / `T_SCENE_RENDER camDx covered renderMs` / `T_SCENE_RECT` |

渲染耗时（DCO-AL00 真机）：load+解析+栅格化 174ms 一次，单视角求值 **3-5ms**（128×256×5 平面）。

## 2. 真机三截图判读（真实实测，证据在 `UniMaker/ssm1android/artifacts/m15_scene/`）

参考 = 产线 `tools/csg_bg_scene_fit.py` 的 `build_scene(0)` 精确 BFS 掩码 + 同一 `render()`（先断言其 regionPx+polygon 与随包 JSON 全等）。截图块定位 = ui dump videoFrame bounds `[0,535][1212,2356]` + logcat `T_SCENE_RECT rect=[150.75,0,1061.25,1821]`（互证 logcat surface 1212×1821），BOX 重采样 128×256。

**logcat 时间线（08:34:54-58，pid 29603）**：

```
T_SCENE_LOAD  k=5 128x256 f=180.0 dispB=4000.0 texBytes=98304 maskSumPx=30520 parseMs=174
T_SCENE_RENDER camDx=0.0  covered=30154 coveredPct=92.023 renderMs=5
T_SCENE_RENDER camDx=6.0  covered=21036 coveredPct=64.197 renderMs=3
T_SCENE_RENDER camDx=12.0 covered=10953 coveredPct=33.426 renderMs=4
```

**vs 参考渲染（构造恒真的真机读数，PNG 无损）**：

| 视角 | covered(真机) | covered(参考 BFS) | madVsRef(覆盖区) | vs 纹理(覆盖区) | 非平场(gray) |
|---|---|---|---|---|---|
| cam0 | 30154 (92.02%) | 30806 (94.01%) | **0.9873** | 0.9873 | 0..217 ✓ |
| cam+6 | 21036 (64.20%) | 21259 (64.88%) | **1.0146** | 15.44 | 0..187 ✓ |
| cam+12 | 10953 (33.43%) | 11072 (33.79%) | **1.4360** | 13.98 | 0..173 ✓ |

三视角覆盖区 MAD≈1.0（纯屏幕最近邻重采样级；N 线 JPEG 截图口径为 3.50）——**Kotlin 渲染核与 M9a/N 线 python 参考逐像素一致**；cam0 vs 纹理 0.99 同为重采样级（cam0 恒等反投影 ⇒ 覆盖像素=纹理本身）。

**两两差异（联合覆盖区，N 线同判据：变化像素=任一通道|d|>20）**：

| 对 | changedPx | changedPct | meanAbsDiff | MAD>5 | 列差分峰带 |
|---|---|---|---|---|---|
| cam0 vs cam6 | 15196 | 46.37% | **21.05** | ✓ | col 94 |
| cam0 vs cam12 | 20150 | 61.49% | **25.38** | ✓ | col 53 |
| cam6 vs cam12 | 11885 | 36.27% | **22.00** | ✓ | col 53 |

差异随平移量增长（0v12 > 0v6）、几何形态与 M9a `view_shift6` 同构（相机右移 ⇒ 内容左移 ⇒ 右缘未覆盖黑楔，目检 `m15_cam6.png` 与 `m15_diff_*.png` 热图确认）；覆盖数真机 64.20/33.43% 对 N 线 64.88/33.78%（其=python 逐位），差即 §3 掩码边界差。

## 3. BLOCKED / 如实记录

1. **多边形掩码 vs BFS 掩码边界差**：任务书指定 JSON polygon 路径，偶奇栅格化并集 30520 vs 产线 BFS 30806（-286px，-0.93%），三视角 covered 相应低 0.5-1.1%；不影响任何判据（covered 区 MAD 仍为重采样级）。如需位级并集可切换 SCENE1 预打包路径（N 线同款）。
2. **共用设备抢占（已化解）**：首轮 cam12 截图被另一会话 `org.cheng.unimaker.scene`（Waiting For Debugger 弹窗）抢先前台污染；捕获脚本补 `ResumedActivity` 前台归属守卫+拉回重试后整轮重跑干净。`dumpsys window windows` 在本机无 `mCurrentFocus` 行，判前台必须用 `dumpsys activity activities`。
3. **uiautomator dump 播放中闪失**：视频播放期 dump 偶发不落盘，脚本加"dump 后验文件存在"重试环（≤6 次）。
4. **apkdev 克隆已不存在**（`cheng-f24/anchor_clones/` 仅剩 ohosdev/quicfix，使命书所引底座失效）：本轮渲染走 Kotlin 侧零 cheng 编译链，不受阻，如实记录。
5. 装载 APK `app-debug.apk` 55536384B sha256 `e4236619…82303`；MainActivity.kt sha256 `b0d24f70…d9416`；三截图 sha `63512bbc…/046dd117…/9e570ba1…`。两仓零 git 写操作；主仓仅新增本文档；UniMaker 仅迭代 `ssm1android/`。

## 4. 判词

鸿蒙 N 线「背景 CSG 场景图求值渲染+自由视角」对称移植安卓**完成且真机实证**：场景 JSON+首帧纹理原件入包、Kotlin 严格解析+多边形掩码+逐字镜像重投影核（3-5ms/视角）、View 层 Canvas 上屏（结构性地规避了 N 线上屏 buffer 同步坑）、真机三视角截图与产线 python 参考逐像素一致（MAD≈1.0 重采样级）、两两差异 MAD>5 且随平移增长、视差方向与 M9a 预览同构。M7 双层播放面零破坏（SCENE 模式外原路径未动）。
