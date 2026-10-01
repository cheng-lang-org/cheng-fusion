# task_s1_obb_sequence — 全镜头逐帧 OBB 序列 + MES1 事件对齐（OBS1 v2 容器），可逆校验 + 体积账

日期：2026-09-13
上游：M9d（帧 0 OBB 归并，`tools/csg_box_merge.py`，含 M12 min_area_rect 中心系修复）、M9e（warm-start 跟踪轨道 `fit_ws_all(H=20)`）、M11/M13（MES1 事件化与 tid 链）、WB 产线（`tools/csg_lens_pipeline.py` 编排模式）
脚本：`tools/csg_obb_sequence.py`（宿主 python/numpy；几何函数全部 import M9D/M9A 原体，tid 链/容器解包 import M11/M9C，不复制不漂移）
产物：`artifacts/csg_asset_pipeline/huguangsheng/obbseq/`

## 1. 方法定调

**逐帧 OBB**：每帧取 M9e warm-start 轨道平面（与 MES1 同一 GT，帧 0 == M8a 逐位锚定），对每平面跑 M9d 已验几何——f4 原始深度反投影 → SVD 对拍 → 解析平面 2D 基 → 凸包边方向枚举最小面积有向矩形 → 厚度 `max(3σ, 0.05Z)` 单侧向背挤出，正面锚定解析平面。225 帧共 **2,614 平面帧 OBB**（K∈[5,14]；厚度模式 3σ=1,446 / 0.05Z=1,168）。帧 0 以「与当前 M9d 代码路径逐字节一致」锚定（见 §2）。

**轴规范化（插值前提）**：M9d `min_area_rect` 的 u=长边约定与凸包边方向逐帧可发生 90° 长短边换位与 180° 符号翻转（几何同一个矩形，数值表示跳变）。每 tid 按时间连续性规范化：90° 按与上一帧 u 轴的配对择优、180° 定号；首帧恒等，M9d 锚定不受影响。

**OBS1（SSM scene sequence v2）容器**——沿 M9c SPT1/MES1 思想：关键帧全量 + 事件帧增量：

```
Header: magic "OBS1" | ver u16=0 | W | H | frameCount | qmin f64 | qmax f64 | thickRel f64 | gzFlags u8
KeyDir: nKeys u16=1 + (frame u16=0, compLen u32)
KeyBlob: gzip( u32 jsonLen + 帧 0 OBB 全量 JSON(M9d box dict, id=tid) )   —— 无掩码
Body(gzFlags=2 前置 u32 rawLen + lzma / 0 原样): EventDir + EventSection
  EventDir: nEventFrames u16 + (frame u16, offset u32)×22     [= MES1 结构帧集]
  事件帧记录: <BBB nRem nAdd nMut> + removes + adds + mutates
    Remove: tid u16                                      (Death = OBB 移除)
    Add:    tid u16 + z u8 + center 3f64 + axes 9f64 + extents 3f64
            + texRectPx 4u16 + regionPx u32 = 135B       (Born = 全量 f64 精确入场)
    Mutate: tid u16 + z u8 + center 3f32 + axes 9f32 + extents 3f32 = 63B
            (事件帧 OBB 目标态; f32 相对 ~1e-5, 远小于判据量级)
```

**回放语义（可逆定义）**：每 tid 时间线 = 出生帧全量 + 各事件帧 Mutate 目标态。事件帧上 OBB = 存储态；两事件帧之间 **OBB 参数线性插值过渡**（Mutate 语义）：center/extents 直接 lerp，轴 lerp 后重正交（w 归一、u 对 w Gram-Schmidt、v = w×u，与 M9d 手性一致）；末事件后保持至死亡。

## 2. 对齐设计与锚定链（全部 assert 真实通过）

1. **M8a 帧 0**：K=5 / cov 99.158%，v0 场景 JSON 与 M9a 产物逐字节一致。
2. **M9d 帧 0（当前代码路径）**：本工具逐帧函数帧 0 输出与 `csg_lens_pipeline.build_boxes_v1`（M9d 帧循环本体）boxes JSON **逐字节一致**（2,484B）——逐帧移植忠实性锚定。
3. **过期产物差异记账（重要发现，如实）**：`boxmerge/scene_frame0_v1.json`（及 `lens_pipeline/lens_scene/scene_v1.json`）是 **M12 min_area_rect 中心系修复（02ecee89d，2026-09-13）之前的产物**，其盒中心带 M12 commit 已记载的错位。实测差异模式与修复特征完全吻合：轴/footprint 逐位相同，仅 center 偏移——|Δcenter| p0=0.007 / p1=32.22 / p2=26.73 / p3=2.37 / p4=41.07。**上游应重生成该产物**；本任务纪律不允许动 obbseq/ 之外产物，未动。
4. **MES1 事件骨架逐 tid 对齐**：OBS1 事件帧集 == MES1 容器（p1_struct_lz）EventDir 22 帧逐一相等，且**每帧 remove/add 的 tid 集合逐一相等**——Born/Death 驱动与 MES1 完全同构（Mutate 语义有意不同：MES1 mutate = 掩码漂移事件，OBS1 mutate = 全体存活轨道 OBB 目标态）。
5. **结构事件账**：死 9 + 生 15、22 结构帧 == M11/M13 落档。

## 3. 可逆校验（真实输出）

**机制判据（全 PASS）**：磁盘 roundtrip 重放确定性逐位一致；出生 Add f64 逐位；全 225 帧 OBB 集合与 GT 逐帧相等；**事件帧对拍（n=239 平面帧对）：center max=7e-6 世界单位、angU max=0.017°、extent 逐位（rel max=0）**——容器编码/解码/插值机制零误差。

**任务判据（FAIL，不放宽，如实记账）**：全量 2,614 平面帧对，判据「轴夹角≤2°、中心距≤1 世界单位、extent 差≤5%」：

| 判据 | 实测 max | 判 | 非事件帧 p50 / p90 |
|------|---------|----|--------------------|
| 轴夹角 u | 89.91° | FAIL | 10.36° / 46.84° |
| 轴夹角 v / w | 89.78° / 89.93° | FAIL | 同量级 |
| 中心距 | 3,096.2 | FAIL | 4.66 / 33.86 |
| extent rel (u/v/w) | 778.9 / 173.6 / 152.5 | FAIL | — |

**归因（判据对 GT 自身不可满足的证明）**：同 tid 相邻帧的 GT 自跳（剔除换位/翻号后的真实运动）= center p50 **2.07**（>判据 1）、p90 16.1、max 3,230 世界单位；轴夹角 p50 **4.90°**（>判据 2°）、max 80.3°。即**判据门限低于逐帧独立 OBB 自身的帧间噪声地板**——把事件密度提到逐帧、或换任何非逐帧精确的时序编码都不可满足。误差不在序列编码（事件帧零误差为证），在 GT 时域：

- **根因链**：MiDaS 相对深度长程漂移（u8 视差 c 参数：轨道 0 帧初 148.3→89.6、轨道 1 118.9→101.4、轨道 13 255.4→86.1、轨道 11 162.9→0.08）× 相机模型 `Z=DISP_B/v` 的双曲放大（低视差域 u8 级参数噪声 = 10²~10³ Z 单位）× M9d OBB 定义（f4 域 min-area-rect/3σ）对该噪声全域敏感。帧 0 所在高视差 regime（c≈48–169，Z≈24–46）是 M9d 唯一验证过的稳定域——这正是 M9c「MiDaS 逐帧独立深度无参数时间连续性」定谳在 Z 域的延续。
- **分 tid**：短寿命/未漂移轨道接近判据（tid5 centerErrMean 0.92、tid12 1.55、tid6 2.56、tid8 2.79、tid10 3.00）；长寿命漂移轨道不可达（tid1 83.7、tid18 43.6、tid0 39.3、tid13 38.6）。

## 4. 体积账（真实文件）

| 对象 | 字节 |
|------|------|
| **OBS1 v2 序列（lzma，主）** | **17,325**（sha256 ec253ac4…b8cf） |
| OBS1 raw（分解用） | 18,221 = header 37 + keyDir 10 + 关键帧 blob 1,819（json 3,711B）+ 事件目录 134 + 事件区 16,221（帧头 66 + removes 9×2B=18 + adds 15×135B=2,025 + mutates 224×63B=14,112） |
| 基线：225 帧独立 OBB JSON | 1,305,119（整存 1,305,345，gzip 330,071） |
| MES1 事件流（p1_struct_lz，对照） | 43,565 → OBS1 = **39.8%**（OBB 取代掩码像素语义后，不再需要任何掩码/漂移载荷） |

**三层账**：OBS1 17,325 + 前景流 FGS0 289,896 + base.mp4 496,166 = **803,387B = 原视频 5,887,651B 的 13.65%**（单层深度流 14.4MB 的 5.58%；比 MES1 组合的 14.40% 再降 0.75pp）。

## 5. 判词

**结构层 S1 机制闭环 PASS + 可逆判据 FAIL（根因在 GT 时域，不在序列编码）**：

- **PASS**：逐帧 OBB 产线（M9d 几何 × M9e 轨道 × M11 身份链）打通，帧 0 与当前 M9d 代码路径逐字节；OBS1 关键帧全量 + 事件帧增量容器与 MES1 事件骨架逐 tid 对齐（22 帧、每帧 rem/add tid 集合相等）；roundtrip 确定性重放、出生 f64 逐位、事件帧零误差（center 7e-6）。「空间表达（OBB）+ 时间维（MES1 事件）」的序列化机制完整，体积 17.3KB = 独立逐帧 OBB JSON 的 1.3%、MES1 的 39.8%，三层账 13.65%。
- **FAIL**：中心距/轴夹角/extent 三判据全不达，且由 GT 自跳噪声地板（center p50 2.07>1、angU p50 4.9°>2°）证明**判据对逐帧独立 OBB GT 自身不可满足**——任何编码器不可达。这是「M9d OBB 定义 × MiDaS 长程漂移」的结构性发现：M9d 只在帧 0（高视差稳定域）验证过，其 f4 域几何经 `Z=DISP_B/v` 双曲放大后在低视差 regime 退化。

## 6. BLOCKED / 后续

- **BLOCKED（判据达标需上游定夺，本任务不可自解）**：三判据的适用域/度量域需用户拍板，可选项：(a) 判据改在 u8 视差域度量（与 MES1/SPT1 参数流可逆判据同域，该域已闭环）；(b) M9d OBB GT 定义加时域稳定化（上游立项，本任务不得擅自引入启发式平滑）；(c) 判据限缩适用域（高视差 regime / 短寿命轨道）。任一项都改变判据语义。
- 非阻塞：① 过期产物重生成——`boxmerge/scene_frame0_v1.json`、`lens_pipeline/lens_scene/scene_v1.json` 为 M12 修复前产物（盒中心错位 |Δ| 达 41），重跑 M9d/WB 即可消除；② OBS1 消费端渲染对拍（斜视角侧壁遮挡的时序版）；③ 判据改域后本工具判据函数一键重跑。

## 7. 产物清单

```
tools/csg_obb_sequence.py                              产线工具（锚定/对齐/可逆/体积全判据内嵌 assert）
docs/campaigns/2026-09-06-csg-asset-pipeline/task_s1_obb_sequence.md   本文
artifacts/csg_asset_pipeline/huguangsheng/obbseq/
  bg_obb_seq_v2.obs1        17,325B  sha256 ec253ac42c16a6f40daf2f8c5dc2db0676ee8dc37bf455f1a2eed22d29abb8cf（主）
  bg_obb_seq_v2_raw.obs1    18,221B（gzFlags=0 分解用）
  obb_perframe_225.json     1,305,345B（逐帧独立 OBB 基线，体积账对象）
  verify_perframe.csv       2,614 行逐帧对拍（t,tid,angU/angV/angW,centerDist,extRelU/V/W）
  obbseq_report.json        全部真实数字（锚定/对齐/可逆/归因分解/体积/输入 sha256）
```
