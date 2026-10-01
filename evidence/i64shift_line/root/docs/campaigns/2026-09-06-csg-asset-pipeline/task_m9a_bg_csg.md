# task_m9a_bg_csg — 胡广生背景 → CSG 场景图（带纹理板基元）→ 重建对拍 + 自由视角预览

日期：2026-09-12
上游：`task_m8_semantic_coverage.md`（M8a：K≤6 仿射平面覆盖 98–99.9%，纯 Cheng 探针与独立 numpy 参考实现 frame0 逐位一致）
脚本：`tools/csg_bg_scene_fit.py`（宿主 python/numpy，纯 numpy 无 scipy/PIL）
产物：`artifacts/csg_asset_pipeline/huguangsheng/bg_scene/`

## 1. 方法定调

M8a 已证背景在 MiDaS 相对深度域由 ≤6 个仿射视差平面 `v = a*x + b*y + c`（u8 域）主导。M9a 把该结论落成产线场景图：每个平面 = 一块**带纹理的板基元**（几何 + 区域多边形 + 原帧 UV 窗口），纹理仍由 base 视频承载，场景 JSON 只存几何与区域。

**相机模型**（合理性预览用，非度量重建；MiDaS 尺度歧义已在 M8 §1 记录）：虚拟针孔 `f=180, cx=63.5, cy=127.5`（竖屏 128×256 下 vFOV=70.6°，符合手机竖拍视场）；u8 值 v 按**视差**解释 `Z = DISP_B/v`（DISP_B=4000）。在该解释下像素域仿射视差平面**严格**（无近似）对应 3D 平面：

```
a*F*X + b*F*Y + (a*CX + b*CY + c)*Z = DISP_B
```

自由视角渲染 = 每目标像素射线求交各 3D 平面 → 反投影回参考视图像素 → 平面最大连通域掩码判可见 → z-buffer 取最近 → 采样原帧纹理。

## 2. SSM scene layer 格式 v0（JSON）

```json
{
  "format": "SSM scene layer v0", "version": 0,
  "frame": {"index", "width", "height"},
  "camera": {"model": "pinhole-disparity", "f", "cx", "cy", "disparityBaseline"},
  "ransac": {"seed": 20260912, "threshU8": 12, "iters": 256, ...},
  "texture": {"source": "semcov/ref_frames/ref_10fps.rgb", "frameOffsetBytes", "frameBytes"},
  "coveragePct", "foregroundPx", "foregroundNote",
  "planes": [{
    "id", "affine": {"a","b","c"},            // 像素域视差平面（锚定值）
    "normal3D": [nx,ny,nz], "offset3D": D,    // 归一化 3D 平面 n·P = D
    "inlierSharePct", "regionPx", "regionSharePct",
    "regionPolygonFlat": [x0,y0,x1,y1,...],   // Moore 邻域边界追踪，整数像素坐标，隐式闭合
    "texRectPx": [x0,y0,x1,y1], "texRectUV": [u0,v0,u1,v1],   // 区域外接框 = 纹理窗口
    "planeDepthResidMADu8", "zOrder"
  }]
}
```

- **精度取舍**：区域多边形为像素级 Moore 边界追踪（拓扑精确、阶梯状、未做亚像素平滑/简化）；每平面取**最大 4-连通域**（4-连通向量化 BFS），域外散内点并入前景。
- **帧级差异 = planes 集合 diff**：像素域 (a,b,c) 贪心匹配（|Δa|+|Δb|≤0.05 且 |Δc|≤2 判同板），差集 = added/removed。v0 规范键序固定（writer=json.dumps 保序），纯 Cheng 读取器按规范序严格校验。
- 序列化：UTF-8 直出（`ensure_ascii=False`，数据面无转义字符），compact 分隔符。

## 3. 锚定与对拍（真实数字）

frame0 拟合与 M8a 纯 Cheng 值**逐位一致**（脚本内硬校验，不符即 fail）：K=5、cumCoverage=99.158%、五平面 (a,b,c,share) 三位小数全同（-0.041/0.080/148.309/77.451% 等）。

**重建对拍（原视频基准）**：frame0 重建画面 = 各平面区域投影原帧像素（`recon_frame0.png`）。
- 背景区域（最大连通域并集）30806 px = **94.012%**，重建 bgMAD = **0.0000**（构造恒真，同 M8a：背景像素上「平面深度 + 原帧纹理」与原帧逐位一致）；
- 全帧对黑 MAD = 1.4401（即被排除的 6% 像素的亮度贡献，非重建误差）。
- 说明：inlier 99.158% 与 CC 限制后 94.012% 的差 = 各平面最大连通域之外的散内点（v0 并入前景，不丢纹理——纹理在 base 视频）。

**自由视角预览**（相机平移/旋转，平面几何外推，`view_*.png`）：

| 视角 | 覆盖像素 | 覆盖率 |
|------|---------|--------|
| 平移 (+6,0,0) | 21259 px | 64.88% |
| 旋转 5°（绕竖轴） | 26340 px | 80.38% |
| 旋转 10° | 22435 px | 68.47% |

人工检视结论：几何合理——旋转/平移下 letterbox 内框边缘保持**直线**（平面性保持的直接证据）；视差方向正确（相机右移，近处画面相对左移）；人物本体（plane1 板块，regionPx=3930）连贯可辨；黑区 = 掩码外推空白，背景平面边缘处拉伸属预期（平面外推的固有性质，记录备查）。

**帧级 diff 实测（frame0 → frame75）**：planes 5 → 6（python 参考覆盖 97.037%，与 M8a §5 记录的 python/Cheng 非 frame0 帧 <1pp 分歧一致），**kept=0，removed/changed=5，added=6**——两帧背景板集合全量重组（镜头/人物运动），印证 M8a「背景重组」判断；帧级差分编码需先做跨帧 plane 跟踪，不能沿用 id 延续假设（后续工作）。

## 4. 体积账

| 对象 | 字节 |
|------|------|
| scene_frame0.json（sha256 f7908bae…95b99） | **15232** |
| 同 JSON gzip -9 | **5944** |
| 深度帧 npy（f4，128B 头 + 131072B 数据） | 131200 |
| 深度数据 payload（f4） | 131072 |
| u8 量化域深度 | 32768 |

压缩比：**8.61x** vs npy 全文件（8.61x vs data payload），**22.07x** vs gzip 后；若以 u8 域深度为基准 2.15x / 5.51x。（使命书所写「该帧深度 64KB」实为 f16 假设；产线实存 f4=128KiB、u8=32KiB，按实报。）注意：场景 JSON 不含纹理（纹理由 base 视频承载），此账只对「深度域几何信息」成立。

## 5. 纯 Cheng 序列化探针（第二优先）

源：`cheng-f24/anchor_clones/ohosdev/src/tools/scene_echo.cheng`（主仓白名单不允许新增 src 文件，探针按 M8 惯例落克隆 src/tools/）。编译：克隆根 + `./cheng system-link-exec --root:<克隆根> --emit:exe --target:arm64-apple-darwin`（M8 配方，`orcfix/.tmp-exec/t_drop_v3` 车头已按临时产物纪律清理，改用克隆自带车头）。

**结果：PASS（标量/锚定字段）**。`scene_echo.exe`（sha256 be6227a6…2d31）对 scene_frame0.json 逐字节严格解析（v0 规范序 + 无转义 UTF-8 + 无指数数值），echo 五平面 (a,b,c) 三位小数与 M8a 纯 Cheng 锚定逐位一致，regionPx/texRect/zOrder/coverage/fg 与 producer 实测一致，rc=0。防伪负测试：篡改 coveragePct/plane2.c → 正确拒判 rc=1；缺失文件 → rc=1。

**留桩项**：`regionPolygonFlat` 数组在 Cheng 侧只做 `jSkipValue` 跳过（内容已由 producer 侧 python 校验）。原因见 §BLOCKED。

## 6. BLOCKED

**克隆 HEAD 冷 BodyIR 精确 var 来源证书审计误拒**（`cold BodyIR exact var provenance certificate audit failed, recovery=0 depth=1`，与 `docs/campaigns/2026-08-31-kernel-userpath/VERIFY.md` 记录的 HEAD 既有缺陷同签名）：

- 两代车头复现（克隆 `ohosdev/cheng` 与主仓 `cheng`（7-16）同签名失败）；
- 系统性二分 16 个变体（s1–s16，产物已清理，构建日志摘要记录于本节）：JSON 原语层（s1）与「根/帧游走 + 通用 dispatch」（s3）均可编译运行；毒面收敛在「planes 逐平面解析」的循环形态——即使裁到极简 3 参标量版（s16，无 seq 形参、无 seq 写入、无多边形）仍被误拒；
- 对照实验：M8 探针本体（568 行，含 var 形参循环变异/seq 计算索引写入）在本车头**编译通过**——缺陷面为 M8 未使用的构造组合（`while true:`+break、flag 条件循环、循环内变异局部 `return` 等的某种组合），非审计对所有非平凡程序误拒；
- 回避方式（已落地）：探针重写为 M8 纯构造风格——v0 规范序严格读取（免 dispatch 循环）、计数循环自然退出、无 break/flag 条件循环/循环内变异局部返回 → 编译通过并 PASS；
- 修复归属：编译器侧（`bootstrap/cheng_cold.c:24827` 审计判定路径），应另开缺陷修复任务，不在本任务范围。

## 7. 判词

背景 → CSG 场景图管线 v0 打通：**≤6 仿射板基元（几何 + 像素级区域 + 原帧纹理窗口）表达 94.0%（最大连通域）/99.16%（inlier）的 frame0 像素**；重建对拍 bgMAD=0（构造恒真）；自由视角平移/5°/10° 重投影几何合理（平面性保持、视差正确、边缘拉伸属预期已记录）；深度几何信息体积 8.61x（raw）/ 22.07x（gzip）压缩；帧间 planes 集合 diff 为全量重组 → 跨帧 plane 跟踪是差分编码前置（后续）。纯 Cheng 读出+锚定校验探针 PASS，polygon 数组留桩被编译器 HEAD 既有审计缺陷阻塞（已定位到 `cheng_cold.c` 审计路径，修复另立任务）。

## 8. 产物清单

```
tools/csg_bg_scene_fit.py                                    产线脚本（锚定硬校验）
artifacts/csg_asset_pipeline/huguangsheng/bg_scene/
  scene_frame0.json            15232B  sha256 f7908bae3152807ac2109675b728c1043b982c297561ae76ac77d63a02795b99
  scene_frame75.json           帧级 diff 演示（python 参考拟合）
  recon_frame0.png             重建画面（bg MAD=0）
  view_shift6.png / view_pan5deg.png / view_pan10deg.png   自由视角预览
  m9a_report.json              全部真实数字（输入/产物 sha256、体积、diff）
  cheng_probe/scene_echo.exe   纯 Cheng 读出+校验探针（7174752B, sha256 be6227a6…2d31）
  cheng_probe/m8_probe_headtest.exe  缺陷对照实验物证（M8 探针同车头编译通过）
```
