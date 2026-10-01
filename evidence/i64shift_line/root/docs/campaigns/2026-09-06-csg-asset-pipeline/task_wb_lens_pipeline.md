# task_wb_lens_pipeline — WB 单镜头混合表达产线：四探针已证能力合并为「单镜头进出、双层资产产出」

日期：2026-09-13
工具：`tools/csg_lens_pipeline.py`（宿主 python/numpy，编排层；全部数值路径 import 自已验证实现，不重写算法）
产物：`artifacts/csg_asset_pipeline/huguangsheng/lens_pipeline/lens_scene/`
上游：`task_m8_semantic_coverage.md`（M8a RANSAC）、`task_m9a_bg_csg.md`（场景图 v0）、`task_m9d_box_merge.md`（OBB 归并）、`task_m9e_ws_track.md`（warm-start 跟踪）、`task_m11_mask_event_semantics.md`（MES1 事件化）、`task_m9b_fg_stream.md`（FGS0 前景流）

## 1. 编排设计

```
输入: depthDir (f4 npy 序列, 128x256, depth_%06d.npy)
  │
  ├─ ① 逐帧 M8a RANSAC ──── csg_fg_stream_pack.ransac_frame (M8a 逐行同构)
  │     │                    逐帧 planes/前景mask/覆盖率 → 供 ⑤ 与对拍
  │     │                    (域选择见 §4 发现一)
  │   帧 0 拟合 (build_scene)
  │     │
  │     ├─ ② 帧 0 OBB 归并 ─ csg_box_merge 已验逻辑逐字移植
  │     │     │              (backproject/SVD对拍/minAreaRect/厚度max(3σ,0.05Z)
  │     │     │               正面锚定解析平面, 单侧向背挤出)
  │     │     └→ scene_v1.json (SSM scene layer v1: boxes[]+planes[])
  │     │
  │   帧 0..224 warm-start 跟踪
  │     │
  │     ├─ ③ WS 跟踪 ────── csg_plane_track_ws.fit_ws_all
  │     │     │              (LSQ 区域重拟合种子 / 两相认领 / 滞回 H=20/
  │     │     │               掉落5 / 准入3; 帧0=M8a 全随机 RANSAC)
  │     │     ├→ [对拍锚] SPT1 k225 容器 (266,781B, 逐字节==M9e)
  │     │     │
  │     │   ④ 背景时间维 MES1 ─ csg_mask_event_codec.encode_variant
  │     │     │                 (p1_struct_lz: 掩码=仅结构帧, 全局 XOR RLE, lzma)
  │     │     └→ maskevent.sme1 (43,565B)
  │     │
  │     └─ ⑤ 前景流 FGS0 ─── csg_fg_stream_pack.pack_fgs0/verify (mode A)
  │           └→ fg_stream.fgs0 (289,896B) + bg_planes.f4 (14,361B 逐帧平面证据)
  │
  └→ report.json (单镜头指标 + 锚定账 + 体积账)
```

设计要点：
- **不重写算法**：本文件只有编排/落盘/锚定断言/报告；RANSAC、OBB、warm-start、MES1、FGS0 的每条数值路径都来自对应探针模块的直接 import（OBB 构建循环为逐字移植，几何函数 import）。
- **参数化**：`--depth-dir/--frames/--out`。帧数通过覆盖模块常量（FRAMECOUNT/NFRAMES）注入，函数均在调用时读取，不改算法；W×H=128×256 为 v2 深度产线固定格式（编解码栈格式约束）。非胡广生素材运行时对拍参考物缺失 → 锚定项如实记 skipped，不伪造。
- **职责切分**：背景 = 静态场景图（scene_v1.json，OBB+区域+纹理窗口）+ 时间维（maskevent.sme1，事件化）；前景 = FGS0 逐帧精确残差流。合成顺序前景层优先（M11 §3 消费端必须项）。

## 2. 锚定对拍（真实运行，全部 PASS）

运行：`python3 tools/csg_lens_pipeline.py`（run10fps 225 帧，54.6s）。

| 锚 | 口径 | 结果 |
|----|------|------|
| m8a_frame0 | 帧 0 (a,b,c,share) 三位小数 vs M8a 纯 Cheng 逐位锚定值 | PASS（K=5, cov=99.158%） |
| m9a_scene_v0_json | 产线 v0 场景 JSON vs `bg_scene/scene_frame0.json` | **逐字节相等**（15,232B, sha f7908bae…） |
| m9b_bg_planes_f4_crosscheck | 逐帧平面数+f32 参数 vs `fg_stream/bg_planes.f4` | **225/225 逐位** |
| m9b_fgs0 | `fg_stream.fgs0` vs 探针产物 | **逐字节相等**（289,896B, sha cace4d42…） |
| m9b_bg_planes_f4_bytes | 本产线 `bg_planes.f4` vs 探针产物 | **逐字节相等**（14,361B, sha 55b5588f…） |
| m9b_fgs0_verify | 可逆校验 10 项指标 vs `fg_stream_report.json` | 逐值相等（fgBitexact=225/225, bgMADu8=3.8443…, bgResidualMax=12.0000073 无越界） |
| m9d_scene_v1_obb | OBB 场景图 v1 vs `boxmerge/scene_frame0_v1.json` | **逐字节相等**（18,111B, sha 886ca1d2…） |
| m9e_tracking | 匹配率/拟合账/血统 vs `m9e_report.json` | 逐值相等（98.809%/inh2417/resc177/new15/death9/轨道20/全程5） |
| m9e_spt1_k225 | warm-start 链 SPT1 容器 vs `bg_track_ws_s225.spt1` | **逐字节相等**（266,781B, sha 3b8ad127…） |
| m11_mes1_lz | `maskevent.sme1` vs `bg_mask_event_p1_struct_lz.mes1` | **逐字节相等**（43,565B, sha 63498ec4…） |
| mes1_quality | 重放确定性/出生掩码逐位/参数≤FP16 界/播放 MAD vs `m11_report.json` | 逐值相等（maxErr 0.967≤界 1.466, playMadZAll=6.794222327871194） |

结论：**产线与四个探针在各自职责步上等价到字节级**——同一输入下，产线产物即探针产物。

## 3. 单镜头指标（report.json，真实运行）

| 指标 | 值 |
|------|-----|
| 覆盖率 | 帧 0 = 99.158%；全 225 帧均值 = 98.660%（最弱帧 97.012%）；WS 认领均值 99.513% |
| 事件数 | 结构事件帧 22/224（死 9 + 生 15）；轨道 20 条，5 条贯穿全程，最长 225 帧；事件间隔 mean=10.05/max=36 帧 |
| 双层体积 | 背景层 61,676B（scene_v1 18,111 + MES1 43,565）+ 前景层 289,896B（FGS0）= **351,572B = 单层 14.4MB 的 2.44%** |
| 三层账 | 351,572 + base.mp4 496,166 = 847,738B = 原视频 5,887,651B 的 **14.40%** |
| 前景占比 | mean 1.340% / max 2.988% / min 0%（前景流 225/225 逐位可逆） |
| 背景 MAD | 前景流口径（逐帧）3.844 u8（最坏位差 12 = 阈值界内）；MES1 播放口径（事件化）6.794 u8 全帧均值（M11 v1 语义，+14.8% vs v0 基线 5.917，<20% 门内） |

## 4. 合并过程发现（真实对拍暴露）

**发现一（1 字节负零分歧）**：首次合并用 `csg_plane_track.ransac_frame`（int 域 solve，M9c/M9e/M11 GT 链本体）跑 step①，`bg_planes.f4` 对拍差 **恰好 1 字节**：frame74 plane4 参数 b，数值同为 0，M9b 产物为 `-0.0`（0x80000000）、本产线为 `+0.0`（0x00000000）。根因：M9b `solve3` 将深度转 float 再参与分子运算，IEEE 零符号语义下 `(-0.0) - (+0.0) = -0.0`；M9c/M8a-ref 的 solve 用 int 域分子（无符号），`0/neg = ±0` 路径不同。既有 `crosscheck_m9b` 用值比较（-0.0==0.0），故从未暴露。处理：step① 统一走 FGS0 产线本体的 float 域 `ransac_frame`（M8a 逐行同构，帧 0 无零参数、M8a 逐位锚定不受影响），实现对拍逐字节；分歧本身作为探针间位型差异如实记录。

**发现二**：M9d 的 matmul 在 macOS Accelerate 上有 divide-by-zero/overflow error-state 误报（M9d `pca_rect_area` 注已记录），本产线按同法 `np.errstate` 抑制，数值经 scene_v1 逐字节对拍证明不受影响。

## 5. 判词

WB 单镜头产线交付：任意 128×256 f4 深度序列单命令进出，产出背景场景图（OBB）+ 背景时间维（MES1 事件化）+ 前景流（FGS0）双层资产与单镜头报告；对胡广生 run10fps 的 11 项锚定全 PASS（其中 6 项逐字节），单镜头双层 351,572B（2.44% 单层基准），背景静态+时间维+前景的责任边界与四个探针完全一致。

## 6. BLOCKED / 后续

- 无 BLOCKED。
- 边界（非阻塞）：① W×H 固定 128×256（编解码栈格式），换分辨率需栈级参数化；② MES1 <50KB 判据依赖本素材事件密度（22/224）与 lzma（M11 §6 达标条件原样继承），产线按素材如实报 PASS/FAIL，不改门；③ 纹理由 base 视频承载，scene JSON 只持路径引用（M9a 口径）。

## 7. 产物清单

```
tools/csg_lens_pipeline.py                          产线编排工具（锚定硬校验内建）
docs/campaigns/2026-09-06-csg-asset-pipeline/task_wb_lens_pipeline.md   本文
artifacts/csg_asset_pipeline/huguangsheng/lens_pipeline/lens_scene/
  scene_v1.json            18,111B  背景场景图 v1（OBB+planes, == M9d 产物）
  maskevent.sme1            43,565B  背景时间维 MES1（== M11 p1_struct_lz 产物）
  fg_stream.fgs0           289,896B  前景流 FGS0（== M9b 产物）
  bg_planes.f4              14,361B  逐帧背景平面证据（== M9b 产物）
  bg_track_ws_k225.spt1    266,781B  对拍锚（== M9e 产物；非产线消费件）
  report.json               8,285B   单镜头报告（指标/锚定账/体积账/运行时）
```
