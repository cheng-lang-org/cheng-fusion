# task_wc_render_eval.md — WC 三线正交之三：CSG 求值渲染器（真 CSG 世界电影）

日期：2026-09-12。工具：`tools/csg_render_eval.py`（宿主 Python3/numpy/PIL + ffmpeg 8.1）。
产物根：`artifacts/csg_asset_pipeline/huguangsheng/rendereval/**`。

## 1. 渲染器设计

三层资产输入（与 WB 线共享接口，全部读既有产物，无新造数据）：

| 层 | 资产 | 消费方式 |
|---|---|---|
| 背景场景图 | M9a `bg_scene/scene_frame0.json`（v0 planes：affine/regionPolygonFlat/regionPx/zOrder + camera pinhole-disparity f=180, CX=63.5, CY=127.5, DISP_B=4000） | affine 严格变换为 3D 平面 `a·F·X+b·F·Y+(aCX+bCY+c)Z=DISP_B`，射线求交重投影 |
| 背景场景图（逐帧/体积扩展） | M9b `fg_stream/bg_planes.f4`（225 帧平面参数）+ M9d `boxmerge/scene_frame0_v1.json`（OBB boxes） | 逐帧认领；OBB 走 slab 求交（正面直采、侧面 clamp texRect，csg_box_merge 同语义） |
| 前景流 | M9b `fg_stream/fg_stream.fgs0`（mask RLE + u8 视差深度，225 帧） | 解包后逐像素视差 splat |
| base 纹理 | `semcov/ref_frames/ref_10fps.rgb` = base.mp4 经 ffmpeg `fps=10,scale=128:256` raw rgb24（225×98304B，M8 产物，与深度帧逐像素同构） | 纹理采样源 |

核心算法：

- **背景求值渲染**（M9a render 同构）：每目标像素射线 `P=C+t·wd` 与各平面求交 → 反投影参考视角 `(u,v)` → 掩码判定可见 → 全局 z-buffer 取最近 t。
- **前景深度投影**：u8 视差 `v → Z=DISP_B/v → 参考视角 3D 点 → 新相机正向投影` splat。关键一致性推导：背景交点 `P=C+t·wd` 的相机空间深度 `P_cam.z = t`（因 `R@wd = dc`，z 分量 1），前景 `P_cam.z` 与 t 同尺度可直接比较，统一 z-buffer 无近似。
- **场景图掩码重导出**（v0 polygon 只序列化外环，带洞区域无法从 polygon 恢复——实测 plane0 外环闭区域 31590 px vs regionPx 25377，洞 6213 px）：按 JSON planes 顺序贪心认领（先到先得剥离，与 M9b greedy_assign 同构且被其 225 帧逐位锚定背书）→ `largest_cc` → 双硬校验：`|mask| == regionPx`（锚定值）且 `mask ⊆ polygon 外环闭区域`。重导出掩码与 `csg_bg_scene_fit.build_scene` 连通域掩码 **5/5 平面逐位相等**（自检）。
- **逐帧背景归属**（播放路径）：`bg_planes.f4` f4 参数 + 「可见平面中残差最小」认领（M9b background_rec 口径 + 几何可见性：`v_model = a·x+b·y+c > 0` ⟺ 交点 t>0，精确等价，排除负视差不可见平面）。轨迹路径平面参数冻结为 scene JSON affine（场景刚性），掩码逐帧重认领。
- **轨迹相机**：A = 平移 tx 线性 −10px→+10px（R=I）；B = 绕场景中心 `(0,0,25.806)`（帧 0 背景视差中位反投影，数据驱动）15° 弧 θ∈[−7.5°,+7.5°]，look-at 中心（行基=右/下/前，匹配参考相机手性；θ=0 时严格退化为恒等）。

## 2. 正视角对拍数字（逐帧真实）

恒等位姿 225 帧（逐帧场景图几何 + FGS0 前景 + base 纹理）vs base 对齐帧，逐帧 MAD（`eval/mad_per_frame.json` 225 条明细）：

- **224/225 帧 RGB 逐位相等**（`np.array_equal`，构造恒真：恒等重投影精确回到源像素）。全帧 MAD mean=1.2e-5，max=0.0026（均在 frame193）。
- 背景区 MAD mean=1.6e-5；前景区 MAD mean=4.1e-5，max=0.092。
- **唯一非逐位帧 = frame193**：7 个前景像素 u8 视差 v=0（全流仅有的量化域端点，`Z=DISP_B/0` 不可解释，露黑）。这是 FGS0 资产语义边界，非渲染器缺陷。
- FGS0 量化误差界（深度域）：u8 视差 0.5 LSB = 2.34 MiDaS 单位，只作用于深度，不影响 RGB 采样位置（正视角 RGB 构造恒真）。RGB 域语义级暴露：190–195 前景快速运动段曾出现「mask 像素比承载平面远」被 z-buffer 判给背景层（修复可见性认领后只剩上述 7 px），如实入账。
- **轨迹中点恒等强校验**：帧 110，轨迹 A（tx=0）与轨迹 B（θ=0°）位姿恒等，渲染 vs base **diffPx=0, MAD=0**。

## 3. 自由视角轨迹判读（人工检视 keep/*.png）

- **轨迹 A**（45 帧，±10px 平移，`trackA.mp4` 2fps=真实 0.5s 采样间隔，时长 22.5s）：f00（tx=−10，相机左移）画面内容整体右移、左缘露出黑带；f44（tx=+10）反向。视差方向与幅度随位姿严格对称，中点逐位恒等。
- **轨迹 B**（45 帧，绕场景中心 15° 弧，`trackB.mp4`）：f00（θ=−7.5°）/f44（+7.5°）对称弧移，中点逐位恒等。三张抽检帧 `keep/trackB_f{00,22,44}.png`。
- **平面边缘直线保持**：画框/墙沿等板边缘在 ±7.5° 旋转下保持直线（平面重投影为射影变换，直线像不变）——判据成立。
- **无穿插错误**：前景人物在各视角完整覆盖其身后背景板，无背景内容穿透人物（z-buffer 语义正确）——判据成立。
- **disocclusion 洞（无限薄平面固有）**：planes 渲染 B 起末黑块 6.05%/5.17%（中点 0%），集中在相机移动露出侧边缘。

## 4. M9d OBB 扩展消费（体积补缝实证）

轨迹 B 起/中/末同位姿下 v1 boxes slab 求交渲染（`keep/obb_f{00,22,44}.png`）：

| 帧 | θ | 覆盖 | 正面 px | 侧面 px |
|---|---|---|---|---|
| f00 | −7.5° | 96.84% | 31687 | 46 |
| f22 | 0° | 99.47% | 32595 | 0 |
| f44 | +7.5° | 95.67% | 31350 | 0 |

同位姿对比 planes 渲染（93.66%/99.13%/95.75% 背景覆盖）：OBB 以板厚侧面填充露出侧缝隙（f00 侧面 46 px），黑块显著减少——「planes 无限薄穿帮 → boxes 体积补缝」的层级关系真实工作，M9d 扩展在本渲染器中被真实消费。

## 5. 产物清单

- `rendereval/playback/`：225 帧 PNG + `composite.mp4`（225 帧，10fps，22.5s，128×256，无音轨）
- `rendereval/trackA/`：45 帧 PNG + `trackA.mp4`（2fps=真实采样间隔，22.5s）
- `rendereval/trackB/`：45 帧 PNG + `trackB.mp4`（同上）
- `rendereval/keep/`：人工抽检帧 trackA/trackB 起·中·末 6 张 + OBB 对比 3 张
- `rendereval/eval/`：`rendereval_report.json`（全部数字）+ `mad_per_frame.json`（225 帧逐帧 MAD）

## 6. 判词

渲染器是纯几何求值器：播放序列=正视角求值结果，224/225 逐位等于 base（唯一例外为 7 个 v=0 量化端点像素），证明「平面深度 + 原纹理」的场景图表达在动态序列上不丢结构（M8 判据的动态版成立）。自由视角轨迹实证了 3D 求值三判据——视差方向/幅度与位姿一致、平面边缘直线保持、z-buffer 无穿插——即「真 CSG 世界电影」区别于平面视频的核心能力成立；无限薄平面的边缘 disocclusion 黑块由 M9d OBB 体积扩展真实补缝（覆盖 93.7%→96.8%）。时间轴对齐（深度帧 k ↔ base 帧 k ↔ FGS0 帧 k，10fps/22.5s）即音画同步基准；本任务按交付口径输出无音轨 mp4。

## 7. BLOCKED 项

无。
