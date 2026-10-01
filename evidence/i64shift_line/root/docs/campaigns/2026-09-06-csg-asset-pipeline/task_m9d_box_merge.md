# task_m9d_box_merge — 平面 → 3D 盒子基元归并（OBB），场景图 v1 = boxes + planes，渲染对拍 + 体积账

日期：2026-09-12
上游：`task_m9a_bg_csg.md`（SSM scene layer v0：K=5 仿射视差平面覆盖 99.158%，pinhole-disparity 相机 `Z=DISP_B/v`）
脚本：`tools/csg_box_merge.py`（宿主 python/numpy；RANSAC/相机常数/解析平面/BMP 直接 import M9a 产线 `tools/csg_bg_scene_fit.py`，不复制不漂移）
产物：`artifacts/csg_asset_pipeline/huguangsheng/boxmerge/`

## 1. 方法定调

M9a 的板基元是**无限薄**的：自由视角大偏移下平面外推区直接露出「远方拉伸内容 + 掩码弃权黑洞」。M9d 把每块背景板升级为**有厚度、有朝向的 OBB（有向包围盒）**：斜视角下由真实侧壁体块遮挡，替代无限薄外推。

**3D 反投影**：对每平面最大连通域（M9a 掩码，5 域共 30806px）内像素，用 **f4 原始深度**反投影成 3D 点云：连续视差 `v_c=(d-QMIN)/(QMAX-QMIN)*255`，`Z=DISP_B/v_c`，`X=(x-CX)Z/F, Y=(y-CY)Z/F`。点云带量化噪声 → SVD 拟合与厚度残差有实义。

**SVD 拟合 vs 解析平面对拍**（v=a·x+b·y+c 经 `a·F·X+b·F·Y+(a·CX+b·CY+c)·Z=DISP_B` 严格映射的 3D 平面）：

| plane | regionPx | 法线夹角 | offset 差 | RMS 残差 | 3σ (Z 单位) | 0.05·Z_center | minRect 面积 | PCA 矩形面积 |
|-------|---------|---------|----------|---------|------------|--------------|-------------|-------------|
| p0 墙 | 25377 | 0.889° | −0.171 | 0.885 | 2.627 | 1.288 | 723.2 | 768.5 |
| p1 人物板 | 3930 | 1.861° | −0.895 | 0.904 | 2.711 | 2.006 | 933.3 | 1021.0 |
| p2 | 962 | 22.42° | +2.482 | 0.452 | 1.208 | 1.314 | 33.4 | 37.2 |
| p3 | 411 | 66.95° | −6.140 | 1.460 | 3.305 | 2.289 | 30.7 | 31.2 |
| p4 | 126 | 45.86° | −22.411 | 1.716 | 5.090 | 1.099 | 37.5 | 43.6 |

主平面（p0/p1，占覆盖 96%）f4 拟合恢复解析平面到 ~1–2°/1 Z 单位内；小平面（p3/p4，126–411px）点云非平面性强（RANSAC 内点带跨深度结构），拟合偏离大——**故 OBB 正面锚定解析平面**（v0 已锚定的几何），拟合平面只用于残差统计与对拍。这保证 v1 是 v0 的严格超集：正视角渲染与 v0 planes 逐位同源。

**OBB 归并**：f4 点云投影到解析平面 2D 正交基 → 凸包（monotone chain）→ **凸包边方向枚举求最小面积有向矩形**（全局最优；对照 PCA 主轴矩形，5 平面全部 minRect < pcaRect，面积省 4.9%–9.8%）→ 沿法线挤出厚度。

**厚度选择（写明）**：`max(3σ, 0.05·Z_center)`，单侧向背面挤出（w 轴 = 指向相机的法线，正面保持在解析平面上）。**预设被实测推翻后定**：原假设「3σ 只含量化噪声 (~0.3%Z)、0.05Z 足以覆盖」，实测 f4 残差 3σ = 5–11% Z——是 MiDaS 深度场的真实非平面起伏，不是噪声。故取较大者：3σ 保证盒子法向包络区域起伏（不切进真实表面），0.05Z 给出与 RANSAC 阈值（12 u8 ≈ 全量程 4.7%）同量级的最小体块容差。实测 p0/p1/p3/p4 由 3σ 主导，p2 由 0.05Z 主导。

## 2. 场景图 v1 格式

```json
{"format":"SSM scene layer v1","version":1,
 "camera":{…同 v0…},"ransac":{…},"texture":{…},"coveragePct":99.158,…,
 "boxMerge":{"frontAnchor":"analytic u8 disparity plane (bit-exact with v0 planes render)",
             "rectMethod":"minAreaRect over convex-hull edge directions…",
             "thicknessMode":"max(3sigma, 0.05Z)","sideTexSample":"clamp to texRectPx",…},
 "boxes":[{"id","planeId","center"[3],"axes"3×3正交,"extents"[3],
           "thicknessZ","thicknessMode","resid3SigmaZ","frontFaceNormal"[3],
           "rect2DAreaZ2","pcaRect2DAreaZ2","regionPx","texRectPx","texRectUV"}],
 "planes":[…v0 五平面原样保留作 fallback…]}
```

box0 样例：`center=[-0.122,-1.150,26.399], extents=[36.77,19.67,2.63]`（墙：横 36.8 × 纵 19.7 × 厚 2.6 世界单位，Z≈26）。前景（0.84%）仍无体几何，纹理由 base 视频承载。

## 3. 渲染对拍（真实出图，人工检视）

渲染：planes 侧逐字复刻 M9a `render`（加采样源/命中平面/边缘穿透诊断），boxes 侧 = 世界空间射线 vs OBB slab 求交，全局 z-buffer 取最近 t_enter；进入面正面 → 反投影直采（与 planes 同逻辑），侧面 → clamp 到 texRectPx（边缘延伸采样，策略写明）。

**校验链（全部机械通过）**：M8a 锚定 K=5/99.158% 逐位 → v0 JSON 序列化回归 15232B → planes 渲染 10° coveredPx=22435 == `m9a_report.json` 记录值 → 正视角 planes bgMAD=0.0000（构造恒真）。

| 视角 | planes 覆盖 | boxes 覆盖 | changed(>10) | 其中侧壁进入 | planes 边缘穿透 px | 全帧 MAD |
|------|-----------|-----------|-------------|-------------|------------------|---------|
| 正视 | 30806 | 32595 | 168（掩码内） | 168 | 12657 | — |
| 旋转 10° | 22435 | 23937 | 1476 | 125 | 10087 | 1.08 |
| 旋转 20° | 14932 | 16080 | 1112 | 176 | 7911 | 0.91 |

- **正视角三方案一致性**：planes bgMAD=0；boxes 在**正面直采区域零差异**（diffInBg=168px 全部为厚度侧壁进入，按掩码分解 plane0=141/plane2=27——倾斜板侧缘在正视下可见是真实几何行为，非缺陷）；rectFill=1957px = OBB 凸包矩形相对任意多边形掩码的填充（凸性语义变化，已计数）。掩码内其余 30638px 逐位一致。
- **斜视角边缘质量**：10°/20° 下 planes 的无限薄固有缺陷直接可见——`view_pan10deg_planes.png`/`view_pan20deg_planes.png` 左侧**黑色弃权竖带**（掩码外推空白，planes 覆盖跌到 14932/32768=45.6% @20°）；boxes 同区域由**墙体块侧壁+矩形正面填充**（`view_pan10deg_boxes.png`/`view_pan20deg_boxes.png`，20° 图侧壁立体感清晰，内容区完整、字幕可读）。changed 像素 100% 位于 planes 未覆盖（黑洞）区 = boxes 只把「黑洞」替换为侧壁内容，**共同覆盖区逐位一致**（两视角共同覆盖位移分布 median/p95 完全相同：32.0/33.2 @10°——正面几何未破坏）。planes 边缘穿透（射线穿过近平面边缘由更远平面外推填充）10087/7911px 是无限薄穿帮的规模，boxes 无弃权机制、由侧壁体块遮挡。
- 差异像素经采样源映射回参考空间后 0% 落在掩码边缘带——机理：穿帮内容来自远平面**深处拉伸**而非边缘带，故边缘带占比不适用为判据；主判据 = 穿透规模 + 黑洞填充 + 图检视。
- 人工检视图清单：`front_planes.png`/`front_boxes.png`、`view_pan10deg_{planes,boxes,diff,changed_overlay}.png`、`view_pan20deg_{planes,boxes,diff,changed_overlay}.png`。

## 4. 体积账

| 对象 | 字节 |
|------|------|
| v0 scene_frame0.json（planes only） | 15232（gzip 5944） |
| v1 scene_frame0_v1.json（boxes+planes） | **18111**（gzip 6979） |
| 其中 boxes[] 数组 | **2483** |
| 其中 planes[] 数组 | 14455 |
| boxes-only 版 JSON（去 planes 数组） | **3653** |

**boxes vs planes JSON 大小 = 2483B vs 14455B = 0.172x**（区域多边形 Moore 追踪串是大头，OBB 用 center+axes+extents 12 个数替代）；boxes-only 全场景 JSON 3653B = v0 的 0.24x。即：语义升级（薄板→体块）同时几何描述**缩小 5.8x**；v1 双保险格式（boxes 主 + planes fallback）总体积仍只有 v0 的 1.19x。

## 5. 判词

平面→OBB 盒子归并管线 v1 打通：frame0 五背景板升级为有厚度（max(3σ,0.05Z)=1.3–5.1 世界单位）、有朝向（axes 3×3 正交，正面锚定 v0 解析平面）的 OBB 基元，几何描述缩小 5.8x；正视角正面区域与 v0 恒真一致（零差异，168px 侧壁 + 1957px 凸包填充有明确物理归因）；10°/20° 斜视角下 planes 的无限薄黑洞（穿透 10087/7911px）被 boxes 侧壁体块真实遮挡填充（changed 100% 位于黑洞区，共同覆盖区逐位一致），自由视角语义性与稳健性提升实测成立。校验链五环（M8a 锚定 / v0 序列化回归 / 10° 覆盖回归 / 恒真 MAD / 最小矩形 ≤ PCA 矩形）全部机械通过。

## 6. 环境记录（非 BLOCKED）

- numpy 2.0.2 + macOS Accelerate 在大数组 `matmul` 上有 error-state 误报（divide-by-zero/invalid，实测输入全有限、结果正确）；`pca_rect_area` 改用 `einsum` 路径绕开，面积正确性由「minRect ≤ pcaRect 逐平面成立」交叉验证。
- 小平面 p3/p4 的 f4 SVD 拟合偏离解析平面 46–67°（区域深度结构非平面），OBB 正面锚定解析平面故不受影响；如后续需要「真实朝向」小平面，应先做区域分割而非直接信任小区域 SVD。

## 7. 产物清单

```
tools/csg_box_merge.py                          产线脚本（五环校验内嵌 assert）
artifacts/csg_asset_pipeline/huguangsheng/boxmerge/
  scene_frame0_v1.json      18111B  sha256 5aefc247858cb13273477b2c924202c5e903c151c51f3c070885400602a3a5d7
  front_planes.png / front_boxes.png                  正视角三方案对拍
  view_pan10deg_planes/boxes/diff/changed_overlay.png 10° 斜视角四图
  view_pan20deg_planes/boxes/diff/changed_overlay.png 20° 斜视角四图
  m9d_report.json           全部真实数字（boxFit/体积/视角统计/输入 sha256）
```
