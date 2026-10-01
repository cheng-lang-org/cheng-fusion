# task_a2_semseg_probe — 语义分割引导 vs 全图 RANSAC 对拍（获取层原子任务 A2）

日期：2026-09-13
探针：`tools/csg_semseg_probe.py`（宿主 Python，torch 2.8.0 / torchvision 0.23.0）
产物：`artifacts/csg_asset_pipeline/huguangsheng/semseg/`（summary.json + 4 帧 figure/rgb PNG）
上游：`task_m8_semantic_coverage.md`（M8a RANSAC 方法/覆盖率判据）+ `semcov/m8_ref_check.py`（逐位复刻基线）

## 1. 模型获取（真实过程）

- ①本机已有：`segment_anything`/`mobile_sam`/`ultralytics` 均未安装；`~/.cache/torch/hub/checkpoints` 仅有 MiDaS/efficientnet/resnext，无分割权重。不可得。
- ②按任务优先级尝试下载：MobileSAM 官方 GitHub raw 权重（ChaoningZhang/MobileSAM weights/MobileSAM.weight）**404 不可得**；Meta 官方 sam_vit_b（dl.fbaipublicfacebook.com）HEAD **无响应不可得**。
- 实际采用：torchvision 官方源 `download.pytorch.org` 的 **deeplabv3_resnet101（COCO_WITH_VOC_LABELS_V1，244,545,539 B，sha 名 `deeplabv3_resnet101_coco-586e9e4e.pth`）**。下载首次中断（curl exit 56），`--retry + -C -` 断点续传成功，加载校验 676 keys。
- 选型理由（第一性原理）：任务是「结构区 vs 人物（有机区）」**语义二分**。deeplabv3 直接输出 person 类（VOC 21 类索引 15），零启发式；SAM/MobileSAM 是类无关分割，还需二次挑选「哪个 mask 是人」——引入启发式，且本机不可得。权重缓存于 `$HOME/.cache/torch/hub/checkpoints/`（torch 标准缓存，不入主仓）。
- 纯几何降级方案（深度梯度聚类）未启用。

## 2. 分割→分区约束拟合方法

1. 分割：RGB 参考帧（`semcov/ref_frames/ref_10fps.rgb`，128×256 raw rgb24，与深度逐像素同构）→ COCO 归一化 → deeplabv3 直接以原生 128×256 推理（不放大）→ `person=15` 为有机区，其余全为结构区。
2. 约束拟合：结构 mask 内跑 M8a RANSAC——**LCG seed 20260912 / iters=256 / thresh=12 u8 / K≤16 / 判停常量（cnt<3、share<1% 全图、增量<0.5%）逐项不变**，仅采样池与分配池改为「结构 mask ∧ 未分配」。有机 mask 整体标前景。
3. 基线：全图 RANSAC 为 `m8_ref_check.py` 逐位复刻（本脚本 `ransac(D8, all_true)` 路径），frame 0 复现 K=5 / 99.158% / 五平面 (a,b,c) 三位小数全同 M8a 文档 §5。

## 3. 三指标对拍（真实运行，frames 0/75/150/224）

| 帧 | person 像素（占比） | 全图 K / 覆盖率 | 分割引导 K / 结构区覆盖 | 3a Δ结构区覆盖 | 3b 混入（全图把 person 吞进平面的比例） | 3b 吸附 full → seg |
|----|----|----|----|----|----|----|
| 0   | 9106（27.8%） | 5 / 99.158% | 5 / 99.463% | **+0.549pp** | 99.791% | 99.791% → 99.649% |
| 75  | 7718（23.6%） | 6 / 97.037% | 6 / 97.693% | **+1.401pp** | 99.456% | 99.456% → 99.663% |
| 150 | 6110（18.6%） | 5 / 98.438% | 5 / 98.571% | **+0.326pp** | 99.280% | 99.280% → **49.198%** |
| 224 | 0（0%） | 1 / 99.570% | 1 / 99.570% | +0.000pp（退化一致） | — | — |

- **3a 结构区覆盖率**：分割引导四帧全部 ≥ 全图基线（+0.33～+1.40pp），K 不变（5/6/5/1）。约束采样池没有损失拟合能力，反而因剔除人物干扰略有提升。
- **3b 前景纯度两口径**：
  - 分配口径：全图 RANSAC 把语义 person 的 **99.3–99.8% 吞进背景平面**（即 M8a 的「前景 0.07–1.97%」严重低估运动主体——真实人物占 18.6–27.8% 像素，被低估 20–30 倍）；分割引导下 person 不参与拟合，分配混入构造为 0，纯度 100%。
  - 吸附口径（更严：结构平面外推仍解释前景深度的比例）：帧 150 大幅下降（99.3%→49.2%）；帧 0/75 仍 ~99.7%——人物贴墙，MiDaS 相对深度差落在 thresh=12 u8（全量程 4.7%）内，属深度域分辨率物理极限，非方法缺陷。
- **平面语义修正证据（帧 0）**：全图最大平面 share 77.451%（a=-0.041, b=0.080, c=148.309）物理上是「背景+人物」混合伪平面；分割引导后同一平面退到纯背景 share 51.740%（a=-0.062, b=0.061, c=155.714），参数明显移动——平面从「吞人物的伪平面」变为真实墙面平面。
- 一致性检查：帧 224 无 person（语义分割判全背景，与 M8a 单平面 99.9% 覆盖互证），两法输出逐位一致（构造退化）。

## 4. 可视化判读（`a2_frame_%06d_figure.png`，2×2：原帧 / 分割 / 全图 RANSAC / 分割引导）

- 分割质量：deeplabv3 在 128×256 原生分辨率上输出干净——四帧类直方图均只有 {background, person} 两类，person_raw == person_main（最大连通域 = 全部，零散噪点 0，无需形态清理）；边界贴合人物（发丝边缘略保守）。
- 全图 RANSAC 面板（绿=平面内点）：**人物本体整体被绿罩吞没**，蓝色 RANSAC 前景边界只剩画面顶部零星噪声点——直观证实「前景混入」。
- 分割引导面板：人物整体红标为前景流，白线分割边界与 RANSAC 结构边界对拍清晰；帧 150 人物红罩内约半数像素透出绿色（对应吸附率 49.2%），帧 0/75 几乎全吸附（对应 ~99.7%）。

## 5. 结论判定：**分割引导有效**

1. **平面拟合更准：成立。** 结构区覆盖率四帧全部提升或持平（K 不变）；帧 0 直接证据：最大平面从 77.5% 的「含人物伪平面」修正为 51.7% 的真实背景平面。
2. **前景流更纯：分配口径构造性成立（混入 99.3–99.8% → 0）；吸附口径部分成立**（帧 150 -50.1pp；帧 0/75 受人物贴墙 + thresh=12 u8 ≈ 全量程 4.7% 的深度分辨率物理限制持平）。要在这类贴墙场景进一步提纯，需时域前景流（运动信息是深度域给不出的）——与 M8a「前景才是逐帧数据量来源」口径互补：RANSAC-剩余前景低估人物 20–30 倍，语义分割是前景归属声明的必要补充。
3. 对外口径：分割边界 vs RANSAC 内点边界叠原帧对照以 `a2_frame_*.png` 为准；数字以 `semseg/summary.json` 为准（绑定 torch 2.8.0 / torchvision 0.23.0 / 权重 deeplabv3_resnet101_coco-586e9e4e / LCG seed 20260912，全链路可复现）。

## 6. BLOCKED / 备注

- 无 BLOCKED。
- MobileSAM 官方权重 404、sam_vit_b 官方源无响应，均如实记录；最终权重来自 download.pytorch.org 官方源（源创作边界合法）。
- 主仓新增仅三类：`tools/csg_semseg_probe.py`、本文件、`semseg/**`；未执行任何 git 操作。
