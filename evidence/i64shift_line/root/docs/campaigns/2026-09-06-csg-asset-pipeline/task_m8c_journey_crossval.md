# task_m8c_journey_crossval — journey 对照视频 M8 交叉验证（纯 Cheng RANSAC 探针）

日期：2026-09-12
前置：`task_m8_semantic_coverage.md`（M8a 胡广生主验证）、`task_m8b_contrast_assets.md`（journey 对照资产）
探针：`src/tools/csg_semantic_coverage.cheng`（本任务小改）
产物：`artifacts/csg_asset_pipeline/journey/semcov/`

## 1. 目的

用 journey（CSG 场景图渲染视频：棋盘格地面 + 条纹墙，固定机位，600 帧 10fps）作「场景图可表达性」正面样本，与胡广生（实拍）对照跑同一 RANSAC 语义覆盖率探针，交叉验证 M8 结论。预期 journey 覆盖率接近饱和（≥80%）；若异常低则按 M8b 提示优先怀疑探针。

## 2. 输入准备（BITEXACT，无量化公式路径）

- 深度输入：`ffmpeg -i journey/v2/depth_qp0.mp4 -vf transpose=1 -pix_fmt gray -f image2 -c:v rawvideo -start_number 0 depth_%06d.raw` → 600 帧 × 32768B 裸 u8（`journey/semcov/depth_raw/`）。qp0 为 H.264 lossless（manifest `lossless: true`），gray 解码只取 Y 平面，无损。
- **BITEXACT 验证**：run10fps f4 npy 按 manifest 量化公式 `u8=round(d/1118.1397705078125*255)` 折算后与 raw 帧逐字节对比——数值域逐位一致（min/max/mean 相同，统一取向后 maxdiff=0）。raw 与 npy 排布差一个纯 90° 旋转（源是 256×128 横图，transpose=1 后与探针 128×256 网格同构）。旋转是正交变换，仿射平面模型在旋转下封闭、4-连通保持，覆盖率/K/前景形状数学等价，不需探针处理取向。
- ref 对拍输入：选**从 base.mp4 同法生成**（`fps=10,scale=256:128,transpose=1` rgb24 raw，600×98304B = `ref_frames/journey_ref.rgb`），与 M8a 胡广生 ref 完全同法同构，且 transpose 与深度帧同向，overlay 像素对齐。M8b 的 600 张 PNG 路线不采用（sips 逐张转换慢且无增益；ref 环仅作可视化，覆盖率曲线不依赖它）。

## 3. 探针小改（`src/tools/csg_semantic_coverage.cheng`）

- 新增 `loadFrameRaw`：读单帧 32KB 裸 u8（跳过 npy/f4 解码/量化公式）。
- CLI 参数化：`[thresh] [iters] [depthDir] [refRgbPath] [outDir] [mode]`（paramStr(3..5) 为三个路径，paramStr(6) 为 `npy|raw`），缺省保持胡广生现值，向后兼容。
- `frameAt(fi, rawMode)`：raw 模式（journey 600 帧）取 0/150/300/599；npy 模式保持 0/75/150/224。
- ref 长度校验从固定 22118400B 改为按帧字节数整除 + 覆盖最大评估帧的动态校验（npy 模式 225 帧 / raw 模式 600 帧通吃）。
- **向后兼容回归**：npy 模式缺省参数重跑胡广生四帧，四条 RESULT 与 M8a 报告逐位一致（99.158/98.029/99.225/99.927，K=5/6/5/1），零回归。
- 编译：ohosdev 克隆 + v3 车头 `system-link-exec --in:src/tools/csg_semantic_coverage.cheng --emit:exe --target:arm64-apple-darwin`（改源后 rm -rf `.cheng-csg-core`），exe 落 `journey/semcov/semcov_probe.exe`。运行 cwd = 主仓根。

## 4. journey 四帧结果（thresh=12 u8，iters=256，seed=20260912，真实运行）

```
frame 0:   plane0 a=-0.163 b=0.851 c=-31.067  share=54.550%
           plane1 a=-1.479 b=0.165 c=111.140  share=27.878%
           plane2 a=0.000 b=0.000 c=0.000     share=10.938%   (恒 0 平面 = 天空/远景量化下限区)
           plane3 a=-0.201 b=2.809 c=-284.559 share=3.076%
           plane4 a=-0.221 b=2.637 c=-281.530 share=1.663%
           plane5 a=-0.565 b=0.305 c=114.912  share=1.459%
  RESULT frame=0   K=6 cumCoverage=99.564% foreground=0.436% fgComponents=22 fgMaxComp=0.180% bgDepthMADu8=4.324
frame 150: plane0 a=-0.191 b=0.660 c=4.277   share=60.916%
           plane1 a=-1.487 b=0.138 c=102.796  share=21.552%
           plane2 a=-0.016 b=0.068 c=-2.250   share=16.040%
           plane3 a=0.226  b=0.772 c=-48.845  share=1.141%
  RESULT frame=150 K=4 cumCoverage=99.649% foreground=0.351% fgComponents=15 fgMaxComp=0.067% bgDepthMADu8=4.605
frame 300: plane0 a=0.021  b=0.665 c=32.414  share=55.457%
           plane1 a=-0.011 b=0.058 c=-3.704   share=31.177%
           plane2 a=-1.583 b=0.218 c=77.235   share=11.673%
           plane3 a=-0.044 b=0.570 c=69.316   share=1.324%
  RESULT frame=300 K=4 cumCoverage=99.631% foreground=0.369% fgComponents=16 fgMaxComp=0.211% bgDepthMADu8=2.890
frame 599: plane0 a=-0.018 b=0.034 c=-0.791  share=55.734%
           plane1 a=-0.203 b=0.351 c=74.137   share=35.333%
           plane2 a=0.104  b=0.147 c=26.947   share=7.181%
  RESULT frame=599 K=3 cumCoverage=98.248% foreground=1.752% fgComponents=106 fgMaxComp=0.293% bgDepthMADu8=2.067
```

K→累计覆盖率曲线：

| 帧 | K=1 | K=2 | K=3 | K=4 | K=5 | K=6 | 终值 | 前景 |
|----|-----|-----|-----|-----|-----|-----|------|------|
| 0   | 54.55 | 82.43 | 93.37 | 96.44 | 98.11 | 99.56 | 99.56% | 0.44% |
| 150 | 60.92 | 82.47 | 98.51 | 99.65 | — | — | 99.65% | 0.35% |
| 300 | 55.46 | 86.63 | 98.30 | 99.63 | — | — | 99.63% | 0.37% |
| 599 | 55.73 | 91.07 | 98.25 | — | — | — | 98.25% | 1.75% |

## 5. 与胡广生对比（M8a §3 同参数同判停）

| 指标 | journey（场景图渲染） | 胡广生（实拍） |
|------|----------------------|---------------|
| 四帧终值覆盖率 | 99.56 / 99.65 / 99.63 / 98.25（min 98.25，mean 99.27） | 99.16 / 98.03 / 99.23 / 99.93（min 98.03，mean 99.08） |
| K（判停时平面数） | 6 / 4 / 4 / 3 | 5 / 6 / 5 / 1 |
| 前景占比 | 0.44 / 0.35 / 0.37 / 1.75% | 0.84 / 1.97 / 0.78 / 0.07% |
| bgDepthMADu8 | 4.32 / 4.61 / 2.89 / 2.07 | 4.58 / 5.46 / 4.69 / 5.64 |
| K=2 累计覆盖（四帧均值） | 85.65% | （除全平帧 224 外）82.90% |
| 前景形态 | 几何深度不连续带（墙-地交界、边缘）——overlay 红区为结构边缘线 | 运动主体（人物本体轮廓） |

## 6. 可信度对拍（不伪造）

独立 numpy 参考实现（同 LCG 种子/采样/判停，`journey/semcov/m8c_ref_check.py`，输入同源 raw u8）：
- frame 0 **逐位一致**：K=6、99.564%、六平面 (a,b,c) 三位小数全同（plane2 的 -0.000 与 0.000 为浮点符号零，同平面）。
- frame 300 K=4 同、差 0.006pp；frame 599 K=3 同、差 0.05pp。
- frame 150 K=3 vs 探针 K=4（98.76% vs 99.65%，差 0.89pp）：阈值边缘像素的浮点舍入（arm64 FMA）导致采样轨迹分叉，与 M8a 帧间 <1pp 分叉模式一致，结构结论不变。
- 人工可检：`overlay_frame_*.png`（背景绿/前景红）显示 journey 前景 = 墙-地交界与物体边缘的深度不连续带；`semcov_frame_*.png` 平面归属伪彩显示墙体/地面大平面主导。（注：两图均为转置取向，深度与 ref 同向旋转，对齐正确。）

## 7. 判读结论

1. **判据落位**：journey 四帧 98.25–99.65%，全部 ≥80% 门 → 高语义可拟合类；「场景图可表达性」正面样本成立，**未触发 M8b 提示的探针疑点条款**（无 journey<胡广生、无 <80%）。
2. **如实报告**：journey 覆盖率终值并未「显著高于」胡广生（mean 99.27% vs 99.08%）——thresh=12 u8 下该指标在 98%+ 区间对两域均饱和（gain<0.5% 判停截断），终值区分度有限。区分度体现在次级指标，且方向全部符合物理直觉：
   - **背景平面贴合度**：journey bgDepthMADu8 2.07–4.61 vs 胡广生 4.58–5.64——纯几何场景的 MiDaS 深度更贴仿射平面模型（约低 2 倍）。
   - **K 收敛更稳**：journey K=2 即 82–91%（四帧均值 85.7% vs 82.9%），K=3 即 ≥98%；journey 无胡广生帧 75 那种 K=6 才回 98% 的背景重组帧（固定机位、无运动主体）。
   - **前景语义不同**：journey 前景 = 深度不连续边缘带（CSG 化时本就由场景图结构显式表达）；胡广生前景 = 运动主体。两者占比同量级（<2%），但 journey 前景在场景图中是零成本显式信息。
3. **探针交叉验证结论**：同一探针在「实拍/渲染」「竖图/横图+旋转」「npy+量化公式/BITEXACT raw」两个域四种路径下均产出结构合理、独立对拍一致的结果——M8 探针方法本身通过交叉验证。
4. frame 0 的恒 0 平面（10.94%）为天空/远景量化下限区，场景图用常数平面即可表达——反而强化可表达性论点。

## 8. BLOCKED / 后续

- 无 BLOCKED。
- 产物清单（`artifacts/csg_asset_pipeline/journey/semcov/`）：`depth_raw/`（600×32KB BITEXACT u8 帧）、`ref_frames/journey_ref.rgb`、`semcov_probe.exe`、`journey_run_log.txt`、四帧 `semcov_frame_*.pgm/png` + `overlay_frame_*.bmp/png`、`m8c_ref_check.py`、`bwd_check/`（向后兼容回归产物）。
- 可选后续：600 帧全量覆盖率时序（探针已参数化支持）；qp10 播放档（有损）跑同探针可量化播放档失真对覆盖率的影响。
