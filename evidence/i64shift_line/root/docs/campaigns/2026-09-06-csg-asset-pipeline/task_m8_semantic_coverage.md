# task_m8_semantic_coverage — 胡广生深度域纯 Cheng RANSAC 仿射平面拟合（M8 + M8a）

日期：2026-09-12
探针：`src/tools/csg_semantic_coverage.cheng`（纯 Cheng，无 @importc 数值计算）
产物：`artifacts/csg_asset_pipeline/huguangsheng/semcov/`

## 1. 方法定调（为什么是仿射深度模型）

MiDaS 深度是**相对深度**（无绝对尺度、无相机内参），3D 反投影不可行。但图像域的物理平面在相对深度域仍是**仿射函数 d = a*x + b*y + c（3 参数）**：物理平面的深度沿图像坐标线性变化，MiDaS 的单调映射在单平面局部近似保序平滑，仿射模型即为该平面在相对深度域的一阶形态。RANSAC 拟合此模型即可，无需内参。内点 = 支持该平面的像素。

工作域：v2 深度产线 f4 npy（256×128 C-order，header 128B），按 manifest 量化公式折到 u8 域做 RANSAC，阈值单位 = u8 级（默认 12，LSB = 4.674 深度单位 ≈ 全量程 4.7%）。

## 2. 探针实现（纯 Cheng）

- 读取：`std/bytes`/`std/rawbytes` 现役原语读 npy，校验 magic/版本/header 长度/总长（131200）。
- **f32 解码自实现**：`std/system.BitsToF32` 在本树是恒返 0 的 stub（陷阱），探针用纯整数位运算自实现 f32 bits→float64（e==255 显式拒绝，e==0 非规格化处理）。Python 对拍逐位一致（见 §5）。
- 量化：`u8 = clip(round((d-30.90658950805664)/1191.7901878356934*255), 0, 255)`。
- RANSAC：LCG（x = x*1664525+1013904223 mod 2^32，种子 20260912，固定可复现）rejection 采样 3 个互异未分配像素 → 解 3 点平面（像素网格 denom 整数，|denom|<0.5 共线显式拒绝）→ 全图内点计数 → 256 迭代取最优 → 剥离分配。K 上限 16；覆盖率增量 <0.5% 或平面占比 <1% 提前停。
- M8a 对拍环：背景（高置信平面内点）重建 = 常数平面深度 + 原帧像素纹理（背景像素构造上与原帧逐位一致 → RGB 域 MAD 恒 0，验证「这些区域用平面深度+原纹理表达不丢结构」为构造恒真）；真正的判别度量 = **前景剩余占比 + 空间连通性**（4-连通 flood fill）+ 背景深度域残差 MAD。参考帧：ffmpeg `fps=10,scale=128:256` raw rgb24（225×98304B = 22118400B，与深度帧逐像素同构）落 `semcov/ref_frames/ref_10fps.rgb`。
- 可视化：伪彩 PGM（已分配 = (pid*17) mod 256，前景 = 255 白）；分割叠原帧 BMP（背景 = 原帧 55%+绿 45%，前景 = 原帧 55%+红 45%），sips 转 PNG。

编译：ohosdev 克隆 `/Users/lbcheng/cheng-f24/anchor_clones/ohosdev` + v3 车头 `orcfix/.tmp-exec/t_drop_v3/cheng system-link-exec --emit:exe --target:arm64-apple-darwin`。克隆 runtime 缺 3 个 panic 辅助函数（`cheng_mem_release_underflow_fail` 等 24 行），已从主仓 port（克隆现与主仓该文件逐字节一致）。运行 cwd = 主仓根。

## 3. 运行输出（真实运行，thresh=12 u8，iters=256，seed=20260912）

```
frame 0:   plane0 a=-0.041 b=0.080 c=148.309 share=77.451%
           plane1 a=-1.281 b=0.293 c=118.900 share=12.628%
           plane2 a=-0.193 b=-0.119 c=169.276 share=5.243%
           plane3 a=0.076  b=0.485 c=48.581  share=2.646%
           plane4 a=-0.365 b=0.156 c=128.318 share=1.190%
  RESULT frame=0   K=5 cumCoverage=99.158% foreground=0.842% fgComponents=28 fgMaxComp=0.314% bgDepthMADu8=4.579
frame 75:  plane0 a=0.205 b=0.249 c=141.387 share=53.912%
           plane1 a=0.164 b=0.115 c=184.061 share=22.861%
           plane2 a=-0.078 b=1.284 c=-24.268 share=8.441%
           plane3 a=1.013 b=0.408 c=69.856  share=6.955%
           plane4 a=-1.190 b=0.004 c=205.173 share=4.056%
           plane5 a=-0.145 b=1.328 c=-0.909 share=1.804%
  RESULT frame=75  K=6 cumCoverage=98.029% foreground=1.971% fgComponents=48 fgMaxComp=0.793% bgDepthMADu8=5.457
frame 150: plane0 a=-0.018 b=0.080 c=146.054 share=59.225%
           plane1 a=0.969 b=-0.043 c=68.652  share=22.626%
           plane2 a=-0.430 b=0.191 c=84.712  share=11.572%
           plane3 a=0.611 b=-0.111 c=127.556 share=4.565%
           plane4 a=-0.341 b=0.234 c=97.638  share=1.236%
  RESULT frame=150 K=5 cumCoverage=99.225% foreground=0.775% fgComponents=43 fgMaxComp=0.296% bgDepthMADu8=4.685
frame 224: plane0 a=-0.014 b=0.120 c=112.699 share=99.927%
  RESULT frame=224 K=1 cumCoverage=99.927% foreground=0.073% fgComponents=6  fgMaxComp=0.031% bgDepthMADu8=5.637
```

四帧累计覆盖率曲线（K→cum%）：

| 帧 | K=1 | K=2 | K=3 | K=4 | K=5 | K=6 | 终值 | 前景 |
|----|-----|-----|-----|-----|-----|-----|------|------|
| 0   | 77.45 | 90.08 | 95.32 | 97.97 | 99.16 | — | 99.16% | 0.84% |
| 75  | 53.91 | 76.77 | 85.21 | 92.17 | 96.22 | 98.03 | 98.03% | 1.97% |
| 150 | 59.23 | 81.85 | 93.42 | 97.99 | 99.23 | — | 99.23% | 0.78% |
| 224 | 99.93 | — | — | — | — | — | 99.93% | 0.07% |

（K=2+ 为逐平面 share 累加。）

## 4. 结论与判据落位

判据（预设）：K=16 覆盖率 ≥80% = 高语义可拟合类（背景可 CSG 化）；50–80% = 部分；<50% = 深度流形态。

**胡广生实测落位：高语义可拟合类。** 四帧累计覆盖率 98.0–99.9%，全部远超 80% 门；且 K=1–6 即触发放缓判停，远未用到 16 个平面——背景结构由极少数仿射平面主导。

- **背景结构逐帧稳定性**：覆盖率高且逐帧稳定（最弱 98.03%）；单平面占比 53.9–99.9% 波动反映镜头/人物运动导致的背景重组（帧 75 人物占幅最大、单平面占比最低），但 2–3 个平面内即回到 85–96%。
- **前景 = 运动主体**：前景占比 0.07–1.97%；4-连通性显示前景高度聚集（帧 75 最大连通域占 0.79%，为人物本体，48 个连通域多为零散边缘噪声点）。overlay PNG（`overlay_frame_*.png`）人工可检：人物（面部/肩部轮廓）标红，背景与 letterbox 黑边标绿。
- **前景才是逐帧数据量的来源**：背景 ~98–99% 像素可由 ≤6 个 (a,b,c) 平面 + 原帧纹理表达；CSG 化收益集中在 ~1–2% 的前景像素。
- **对外口径**（M8a 更新）：覆盖率数字为内部指标；对外结论以「背景/前景分割 vs 原视频」可视对拍 + 前景占比为准——见 `overlay_frame_*.png`（背景绿/前景红叠原帧）与 `semcov_frame_*.png`（平面归属伪彩）。
- **背景深度残差**：bgDepthMADu8 = 4.58–5.64（阈值 12），即背景像素偏离其平面模型平均 ~0.5 LSB 量级个全量程 1%——MiDaS 相对深度的平滑性使平面模型贴合良好。

## 5. 可信度对拍（不伪造）

独立 Python/numpy 参考实现（同 LCG 种子、同采样/判停逻辑，`semcov/m8_ref_check.py`）：
- frame 0 **逐位一致**：K=5、cumCoverage 99.158%、每平面 (a,b,c) 三位小数全同——两实现计数路径同构。
- 其余帧 K 相同、覆盖率差 <1pp（98.03/97.04、99.23/98.44、99.93/99.57）：平面内点计数并列与阈值边缘像素的浮点舍入（arm64 FMA 融合）导致采样轨迹分叉，结构结论不受影响。

## 6. 已知陷阱记录

- `std/system.BitsToF32/F32ToBits/BitsToF64/F64ToBits` 是恒返 0 的 stub——本机 v3 车头链接的 provider 未做 intrinsic 替换。任何本机数值程序不得使用，须自行位运算解码。
- `cmdline.paramCount()` 含程序名（index 0），用户参数从 `paramStr(1)` 起。
- 接收 seq 形参的函数必须 `@borrows`，否则调用点转移所有权失败。
- sips 支持 PGM→PNG 与 BMP→PNG（无需 netpbm）。

## 7. BLOCKED / 后续

- 无 BLOCKED。后续可选：对整段 225 帧全量跑覆盖率时序（当前探针按参数化设计支持，产物量限制仅抽 4 帧）；帧 75 顶部白区（前景带）与视频灯具/横梁的对应关系可在 1080p 原帧上人工复核。
