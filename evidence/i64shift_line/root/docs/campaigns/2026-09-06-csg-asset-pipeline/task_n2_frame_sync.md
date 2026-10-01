# task_n2_frame_sync.md — N 线真机上屏帧同步排查与终结（2026-09-13）

上游：`task_n_scene_render.md` §补录（渲染块区三截图「逐位相同 MAD=0」疑似帧同步缺陷）。

**终判：不存在帧同步缺陷。上屏链路（flush→合成→屏幕）本身工作正常，真机屏幕随
scene_render 逐位姿更新。R1「三截图逐位相同 MAD=0」是判读脚本把 buffer blit 偏移
坐标 (402,13) 直接当截图坐标裁剪，裁到标题+按钮静态 UI 带的测量伪影。R2 真机复测：
真实块区三对位姿截图 MAD=14.7/24.4/20.6（全部 >5），达成。**

---

## 1. diff 差异清单（M7 深度层工作版 vs N 场景版）

任务书假设「两者 C blit 尾部必有差异」。实测 diff 结论：**C 侧尾部零差异，前提被证伪**。

| 检查项 | M7 深度层 | N 场景渲染 | 差异 |
|---|---|---|---|
| blit 函数 | `ssm1RenderPixels` → `RenderRgbaToSurface` | `ssm1SceneRender` → 同一函数 | 无（同源，`ssm1_napi_shim.c:1724/1900`） |
| blit 尾部 | RequestBuffer→memset→逐行 memcpy→**FlushBuffer(dirtyRect)**→munmap | 逐字节相同 | 无（flush 从来不缺） |
| window 实例 | 同一 `g_window`（唯一 libraryname XComponent `ssm1view`） | 同上 | 无 |
| flush rc（真机 hilog） | OK | OK（`blit=512x1024 off=402x13 rc=0` ×4） | 无 |
| 调用节奏 | 100ms tick 连续渲染 + 底层 AVPlayer 持续重组屏幕 | 每位姿单次 flush、屏幕静态 | 有（非缺陷，单次 flush 同样上屏，§3 实证） |
| blit 几何 | 128×256 @ (400,100) | 512×1024 @ (402,13) | 有（仅几何） |

真正的差异在**判读层**：R1 临时判读用 buffer 坐标 (402,13)-(914,1037) 裁剪截图。
截图 1316×2832 与 buffer 同宽但 UI 栈不同系——XComponent 顶边在屏幕 y≈1028（按钮区
下方），块区真实屏幕位置 = (402,1041)-(913,2064)。旧裁剪区 y=13..1037 落在状态栏/
标题/四行按钮静态区 → 三张裁剪逐位相同（MAD=0）是必然，与渲染无关。

## 2. 修复

无 C/HAP 改动（无需重链 so、重打包、重装机——装机 Q3 HAP 上屏链路本身正确）：
- `ohosdev/artifacts/mobile_n_scene/analyze_scenes.py`：`find_block` 搜索窗
  0–62% 屏高 → 30–85%（避开顶部静态 UI 带与底部白底日志区，块体不再截断）；
- 新增 `ohosdev/artifacts/mobile_n_scene/verify_crop_mad.py`：legacy/true 双口径
  MAD 复核（伪影复现 + 终版判读）；
- `n_capture_round.sh` 原样复用（按钮布局未变）。

## 3. 真机终验（R2，2026-09-13 06:55，serial 3KN0224C18003262）

冷启 → SCENE:SEQ → cam0/+6/+12/rot5 四帧渲染 hilog rc=0，
covered 492896→340169→177093→420649（94.01%→64.88%→33.78%→80.23%，与 R1 一致）。
截图 `n_cam{0,6,12}.jpeg` / `n_rot5.jpeg`（1316×2832）。

**三张位姿截图互不相同（统一精确块区 402,1041 + 512×1024）：**

| 对 | MAD | 变化像素(\|d\|>20) | 判 |
|---|---|---|---|
| cam0 vs cam6 | **20.63** | 238,145 | >5 ✓ |
| cam0 vs cam12 | **24.36** | 319,793 | >5 ✓ |
| cam6 vs cam12 | **14.67** | 187,488 | >5 ✓ |
| （R1 存档同口径） | 22.74 / 24.50 / 14.67 | 254k / 310k / 187k | 复现 ✓ |

**伪影复现（成因铁证）**：legacy 区 (402,13)-(914,1037) R2 三对 MAD=0.0000
（逐位相同）——证明 R1 的「MAD=0」量的是静态按钮带；同批截图真实块区 MAD≈20。

**内容方向一致性（块区亮块占比 vs cheng coveredPct）**：
90.05/94.01、61.65/64.88、32.63/33.78、76.59/80.23（差 ~3pp = JPEG 黑电平+阈值边缘），
随位姿单调一致；块区 bbox 宽 512→356→201、rot5 右移 (471..913)，几何形态与
M9a view_shift6 同构。cam0 块区重采样 128×256 vs `hgs_bg0.rgb` MAD_covered=3.502
（构造恒真真机读数，显示重采样+JPEG 噪声级）。

## 4. 判词

真机自由视角三截图互不相同（MAD>5）达成，「真 CSG 世界视频」真机观看形态最后一块
闭环：cheng 层求值随位姿变化（R1 已证）+ 上屏 flush→合成→屏幕随位姿更新（本轮双轮
实证）+ 屏显内容与 covered 数值方向一致 + cam0 构造恒真读数成立。R1 的 BLOCKED 项
（帧同步嫌疑）关闭，根因为判读裁剪坐标系错位，非渲染链路缺陷。

## 5. BLOCKED

无。
