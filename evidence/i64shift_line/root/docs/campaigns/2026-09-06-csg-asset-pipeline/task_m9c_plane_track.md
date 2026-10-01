# task_m9c_plane_track —— 背景场景图时间维：跨帧 plane 跟踪 + 参数差分编码（SPT1 v1）

日期：2026-09-12
工具：`tools/csg_plane_track.py`（单文件宿主 python/numpy，纯 numpy 无 scipy/PIL，无 Mock，全部数字真实运行）
产物：`artifacts/csg_asset_pipeline/huguangsheng/planetrack/`
上游：M9a（SSM scene layer v0 格式、f0→f75 全量重组实测）、M8a（逐帧 RANSAC 锚定）、M9b（前景流 289,896B 已就绪；本任务只管背景场景图时间维）

## 1. 逐帧拟合（GT 定义，逐字复刻 M8a）

225 帧全量 RANSAC（LCG 20260912、thresh 12、iters 256、K≤16、增量<0.5% 停，与 `semcov/m8_ref_check.py` 逐行同构），41s。三重锚定全过：

- frame0 与 M8a 纯 Cheng 锚定逐位一致（K=5、cov=99.158%、五平面参数三位小数全同）；
- 本工具组装的 frame0 v0 JSON 与 M9a 落盘 `scene_frame0.json` **逐字节一致**（sha256 f7908bae…95b99）——顺带证明行程标注版最大连通域与 M9a 波前 BFS 同一选择；
- 与 M9b 独立产线证据 `bg_planes.f4` 对拍：**225/225 帧平面数 + f32 参数逐位一致**。

## 2. SPT1 v1 格式定稿（v0 的时间维扩展）

容器 `bg_track.spt1`（小端）：

```
Header 74B: magic "SPT1" | ver=1 | flags | w,h | frameCount=225 | keyStride=50
            | seed=20260912 | thresh=12 | maxPlanes=16 | iters=256
            | qmin,qmax,f,cx,cy,dispB (f64×6) | keyCount
KeyDir:     keyCount × {frame u16, compBytes u32, rawBytes u32}
KeyBlobs:   gzip( <I jsonLen> v0 场景 JSON 全量 + 各平面精确 CC 掩码 RLE )
FrameDir:   225 × u32（差分记录偏移，随机访问）
DiffSection: 每帧 <B nRem><B nAdd><B nKeep>
  nRem × tid u16                                  —— 消失=删除标记
  nAdd × {tid u16, a,b,c f64, zOrder u8, inlierShareCenti u16, 全掩码 RLE}   —— 新平面=全量
  nKeep × {tid u16, Δa,Δb,Δc FP16, zOrder u8, inlierShareCenti u16, 掩码变更 RLE} —— 匹配=微调差分
```

- **关键帧**：每 50 帧强制（0/50/100/150/200）；非强制帧当差分记录体积 > 最近关键帧压缩体积时触发（本轮未触发，差分始终更省）。blob 内 v0 JSON 供场景图消费者原样使用；**精确 CC 掩码 RLE sidecar 必需**——v0 的 `regionPolygonFlat` 是边界轮廓，不能无损还原像素掩码，差分链回放需要精确初态。
- **参数差分**：Δ = GT(t) − 当前状态，存 FP16。Δ 相对当前状态计算使误差**不跨帧累积**：每帧重建误差 = 该帧 Δ 的 FP16 舍入误差 ≤ 0.5 ulp(f16(Δ))。
- **掩码容差跟踪**：状态掩码对 GT 掩码 IoU ≥ 0.995（任务书判据 0.99 + 余量）时该帧不发掩码（缺省=不变）；否则发 XOR RLE 并精确重同步（状态 := GT，XOR 回放恒等）。故任意帧重建掩码对独立拟合掩码 IoU ≥ 0.995，同步帧恒 1.0。
- **整条省略 = 无变化**：f64 参数 Δ 严格全零且掩码/份额/zOrder 均不变时省略整条 keep。
- `normal3D`/`offset3D` 由 (a,b,c) 精确导出（v0 同公式）；`regionPx`/`texRect` 由掩码导出；`inlierShareCenti` = 份额×100 取整（u16，0.01% 分辨率）。
- 编码器与解码器共用同一 `apply_record()` 做状态迁移，两侧状态严格一致。

## 3. 跟踪实测（真实数字）

匹配门（任务书）：IoU≥0.6 on mask **且** |Δa|+|Δb|+|Δc|≤3.0（阈值本任务定，扫描见 §6），贪心按 IoU 降序 1:1。

| 项 | 值 |
|----|----|
| 匹配对 / 224 次帧 transition | **56**（0.25 对/帧） |
| removed / added | **1100 / 1095**（≈4.9 次/帧 = 几乎每帧每平面都 remove+add） |
| 匹配对 IoU | min 0.600 / mean 0.807 |
| 近失归因 | IoU≥0.6 但参数门拒 402 对；参数过但 IoU<0.6 拒 130 对 |

**跨帧跟踪在逐帧独立拟合 GT 上几乎不成立**：M9a 观测的 f0→f75「全量重组」不是个别帧，而是逐帧现象。

## 4. 可逆校验（从容器解码重建 225 帧 vs 逐帧独立拟合，真实输出）

```
framesChecked   = 225/225    平面数逐帧一致，GT 平面全部 1:1 匹配
planePairs      = 1178
minMaskIoU      = 1.000000   （判据 ≥0.99；1178/1178 对全部精确 1.0——容差再同步/XOR 回放构造恒等）
meanMaskIoU     = 1.0
maxErr(a,b,c)   = (5.91e-05, 5.53e-05, 8.00e-04)   ≤ FP16 编码精度界 2.08e-03
maxShareDiff    ≤ 0.01%（centi 分辨率）；zOrder 1178/1178 全对
```

结论：**编码-解码链可逆性满分**。重建不是「近似几何等价」而是构造性精确（掩码逐位相等，参数差仅剩 FP16 存储舍入且每帧有界不累积）。

## 5. 体积账（真实文件）

| 项 | 字节 |
|----|------|
| **SPT1 容器（背景时间维 225 帧）** | **872,531**（sha256 a693d168…7131） |
| ├ 关键帧 5 个 blob（gzip；原始 101,837，其中 v0 JSON 85,835） | 38,811 |
| ├ 差分区 832,696（keep 参数 728 + 掩码同步 56 次 81,984 + adds 747,109 + removes 2,200 + 帧头 675） | 均值 3,700.9B/帧 |
| └ Header+KeyDir+FrameDir | 1,024 |
| 基线 A：逐帧 v0 全量 JSON 实测 Σ（min 6,060 / mean 17,294 / max 24,769） | 3,891,093 |
| 基线 A gzip（225 帧连拼） | 894,470 |
| 基线 B：任务书口径 225×15,232 | 3,427,200 |
| **压缩比** | **4.46x vs A / 3.93x vs B** |

三层账：背景时间维 872,531 + 前景流 289,896（M9b） + base.mp4 496,166 = **1,658,593B = 原视频 5,887,651B 的 28.17%**（vs 单层深度流 14.4MB 的 11.5%）。

**判据 <50KB：FAIL（872,531B，超门 17.5x）。**

## 6. 残差归因（<50KB 不可达的机理，全部实测）

诊断脚本 `planetrack/diag_gate_sweep.py`（日志 `diag_gate_sweep.log`）+ 主工具 attribution 节：

| 测量 | 值 |
|------|----|
| 每旧平面的跨帧最优 IoU（n=1177） | mean **0.424**，p50 0.442，p90 0.861 |
| 最优 IoU≥0.6 / ≥0.8 占比 | 39.6% / 18.2% |
| 最优对参数距离 \|Δa\|+\|Δb\|+\|Δc\| | **p50=21.3**，p90=86.5，max=374 |
| IoU≥0.6 候选 466 对中参数门 ≤3/5/8/12/20/50 可留 | 58/106/181/244/324/429 |
| **逐帧全量 mask-RLE 熵地板**（不做任何跟踪，每帧全量重编） | **3,693B/帧 → 224 帧 827,171B** |

三个硬事实：

1. **容器已贴着熵地板**：872,531 ≈ 地板 827,171 + 关键帧/表 45KB（+5.5%）。跟踪机制本身字节中性——被匹配平面（56 对）的逐帧掩码流失（XOR 同步均值 1.4KB/次）比 remove+add（684B）还贵，因为流失面积 ≈ 区域面积的 40%。
2. **参数不是身份**：最优对参数距离 p50=21（u8 视差域 c 全程仅 ~48–170），参数门放到 50 也只能保 429/466 候选；匹配身份只能靠 IoU，而 IoU 本身崩溃（均值 0.42）。
3. **瓶颈是 GT 不是编码器**：逐帧独立 M8a RANSAC 建立在 MiDaS **逐帧独立相对深度**上——尺度/偏移逐帧漂移 + 贪心认领顺序换位，使同一物理墙面的 (a,b,c) 与最大连通域掩码逐帧重组。M9a 的「f0→f75 全量重组」实为逐帧重组。

**<50KB 需要把时间维信息量压到熵地板的 1/17，在不改变 GT 的前提下物理不可达。** 出路在上游（改变 GT 定义）：① 逐帧深度域时间对齐（每帧尺度/偏移归一到基准帧，参数与掩码漂移预期大降）；② warm-start 跟踪式拟合（帧 t 用帧 t−1 平面初始化局部重估）。两者都改动 M8a 拟合语义并牵连 M9b 前景流口径，须另立任务，不在本编码器参数空间内。

## 7. 判词

SPT1 v1 差分编码器**交付且可逆性满分**（225/225 帧重建，掩码 IoU 全部精确 1.0，参数误差 ≤ FP16 编码精度界、不跨帧累积；三重锚定含与 M9a/M9b 产物的逐字节/逐位对拍）。**体积判据 FAIL**：容器 872,531B（4.46x 压缩）vs <50KB 门，超 17.5x；残差归因完成——逐帧独立 RANSAC GT 在 MiDaS 非时间对齐深度域上逐帧重组（best-IoU 0.42、参数距离 p50 21.3），逐帧 mask-RLE 熵地板 827KB，跟踪与差分在现 GT 上字节中性；达标路径是上游深度域时间对齐或跟踪式拟合（另立任务）。三层账 1.66MB = 原视频 28.17%（背景时间维从 17.3KB/帧降到 3.9KB/帧，前景流不变）。

## 8. 产物清单

```
tools/csg_plane_track.py                       产线工具（拟合+跟踪+SPT1 编解码+校验+归因+体积账）
docs/campaigns/2026-09-06-csg-asset-pipeline/task_m9c_plane_track.md   本文
artifacts/csg_asset_pipeline/huguangsheng/planetrack/
  bg_track.spt1        872,531B  sha256 a693d1684ff8c67666bee6162339515e36b533ca9b5ede25f6629e7eacaf7131
  m9c_report.json      全部真实数字（锚定/交叉对拍/跟踪/校验/体积/归因）
  diag_gate_sweep.py   门限扫描+流失归因诊断（独立脚本）
  diag_gate_sweep.log  诊断运行日志
```
