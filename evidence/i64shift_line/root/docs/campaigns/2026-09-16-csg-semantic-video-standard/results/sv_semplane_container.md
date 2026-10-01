# SvSemPlaneRecord 容器层落地：387 平面轨道入 SSM1 语义容器（绿）

日期：2026-09-19。任务：把已提取的 L2 平面级语义（387 条轨道）编码为 CSG 语义视频容器的正式一等记录类型，Mac 全链对拍绿，另给诚实口径的语义侧压缩比。

**判词：绿。** 新记录类型 `csg_semantic_video::plane`（规范 §9 增补）Mac 全链（编码→容器→validator→回读→逐记录逐字段对拍 0 差异）通过，另在安卓真机（DCO-AL00）同源驱动两轮 rc=0，机上产物与 Mac 产物 sha256 逐字一致——字节级跨机确定。

## 1. 记录类型（SvSemPlaneRec / kind=`csg_semantic_video::plane`）

一条记录 = 一条几何平面轨道。字段全整数（§3 合同），键序 = UTF-8 字节升序：

- 平面 id：`tid:i32`
- 时空范围：`tbNum/tbDen=1/10`（帧号 tick，半开区间）`tickStart/tickEnd` + `frameCount`
- 轨迹：`cxM2/cyM2`（质心×100）、`areaPx`、`maxAreaPx`、`meanAreaM1`、`meanDepthM1`（×10）、`pathLenM2`（×100）
- 颜色统计：`colorR/colorG/colorB`（轨道逐帧质心像素采样均值 floor）、`colorSamples`（=frameCount）、口径自带 `colorDef="centroid_rgb_floor_u8"`
- 置信：`confBp`（=平均面积占画幅比 bp）、口径自带 `confDef="mean_area_share_bp"`
- 来源：`sourceClass="inferred"`、`method="m8a_ransac_largestcc_iou_track"`
- 平面参数（可选，全有或全无）：`paramA/paramB/paramC`（u8 像素域 abc×10000，M4）+ `paramFrames`（严格递增、须在存活区间内）；仅 13 条轨道有代表帧拟合值

实现落点：`src/game/assets/semantic_video/{schema,writer,reader,validator}.cheng` 各自 additive 分支（emit `SvSemPlaneLine`、`SvAddSemPlane`、解析分支、键面+值域+参数形状+tid 唯一性校验），既有 10 类型零改动。

## 2. 管线与证据

| 步 | 物 | 证据 |
|---|---|---|
| 输入 | `results/l2_plane_tracks.json`（387 轨，sha256 `d8fc3d9a…cfd`） | 门1/门2（M8a 锚定）见 l2_plane_semantics.md |
| 输入 | `…/semcov/ref_frames/ref_10fps.rgb`（225×128×256×3 = 22,118,400B，sha256 `1bf84235…f12`） | 字节数整除校验（prep G1） |
| prep | `tools/sv_plane_records_prep.py` → `planetrack/sv_plane_records_prep.jsonl`（189,048B，387 记录 + meta 行） | G1-G5 全过：字节数/tid 连续+数组等长/均值一致/质心路径重算 maxDiff=0.044/参数帧存活+i32 值域 |
| 容器层 | `src/tools/sv_semplane_container.cheng`（arm64 darwin，两轮独立重编译重跑） | `PLANECONTAINER ok records=387 fields=10490 factCount=388` rc=0 |

三重对拍全部序无关（CSGC 按 kind 分节，块内为集合语义；同 delta 链「与物理顺序无关」先例）：

1. 行级多重集合相等：388 条解码行每条恰配对一条原发射行（逐字节）；
2. 逐行重发射恒等：每个 plane 解码行 == 其解析记录经 `SvSemPlaneLine` 再发射的行；
3. 字段级按 tid 配对：**10,490 次字段比较 0 差异**（19 标量×387 + 轨迹数组 1,027×3 + 平面参数 14 帧×4）。

validator（§2/§4/§9 全量规则）绿，ignoredExtensions=0。

## 3. 容器

- 路径：`artifacts/csg_asset_pipeline/huguangsheng/planetrack/hgs_l2_planes.svblock`
- 字节数：**85,960 B**（manifest 1 + plane 387，平均 221.5 B/行）
- sha256：`f240fe8832cd29de625402a4a374236f9364bc4b269dbca249643e8f52944599`（独立 `shasum` 与驱动输出一致；两轮独立构建运行哈希相同 = 字节确定）
- contentId：`sha256:457aaf6fc5f27a21b483c0e9bafcc7b7f4f4799626d5d0e3ac1e3e456cb64b22`（规范 §3 域绑定）
- 资源引用：`video/mp4` → base.mp4 资源 CID `sha256:eba04e5194afd407652fcd70783565914b7eeda68022caa02158f4eccd4ec9f3`（域绑定 CID，非裸 sha）；像素字节不入容器
- 安卓侧产物：`planetrack/hgs_l2_planes_android.svblock`（机上 sha256 与上完全一致，pull 回本地复验一致）

## 4. 压缩比（诚实口径，两级）

| 口径 | 分母 | 比值 | 语义侧占比 |
|---|---|---|---|
| 语义容器 vs base.mp4（实拍 H.264+AAC 载体） | 496,166 B | **5.77 : 1** | 17.3% |
| 语义容器 vs 逐帧 RGB 原始字节（225 帧 128×256 RGB24） | 22,118,400 B | **257.3 : 1** | 0.39% |

如实标注：

1. 语义侧**不含任何像素/音频字节**，以上是「语义侧压缩比」，不是「重建像素压缩比」——用容器还原不出画面。born-digital 的 155.6:1（§S3/f_loop 口径）不适用于实拍素材，不得混用。
2. 容器（85,960B）比源提取 JSON（70,832B）**大 21%**：CSGC 存的是自描述 canonical 行+节/目录/证明框架，价值在合同、验证与跨机确定性，不在字节极小化。
3. 平面记录是深度数据的**语义摘要层**（轨道/参数/颜色/置信），与已入容器的 DPD1 深度层（packed 933,888B）互补不互替，两者不互除。

## 5. 跨机就绪状态

- **字节面就绪**：同一源码驱动在 aarch64-linux-android bionic（NDK 27 API28，PB 配方+psb/shim/bridge 物料复用）编译运行，DCO-AL00 真机两轮 rc=0，容器 sha256 与 Mac 完全一致——容器经任意通道传输后可被本仓 reader/validator 原样消费，无需平台适配。
- **serve 面未接线**：现役 q3_serve/ssm1q 载包合同排他接受 SSM1 魔数（F-H4c 定谳），`.svblock` 不能被现有 ssm1q serve 原样下发；跨机下发需 SSM2 hybrid serving 立项（§22.2 在案），本任务不改 serve/fetch 协议。
- 机上留置：`/data/local/tmp/{sv_semplane_android, sv_prep.jsonl, hgs_l2_planes_android.svblock}`。

## 6. 回归

9/10 sv smoke 绿（rc=0）：b1 roundtrip/negative/commit/dump_fixture、b2 convert、b3 player、f1 snapshot、clockmap、time。**f3_hub 预存红**：`sv_snap_cid_mismatch`，将我的 4 个模块改动 stash 后在同树复现同签名（树内他 lane 未提交的 `src/core/lang/typed_expr.cheng`/`src/core/tooling/compiler_csg.cheng` 变更在案），非本任务引入，归上游 lane。

## 7. 新工程坑（实测，供 pitfall 库）

1. **@borrows 调用方调用户自定义 plain Bytes 参函数** → `plain local copy requires an address-free value object`（无行号）；库函数（rawbytes/manifest）不受限。修复=该 helper 改 @borrows。
2. **同一 managed 本地二次按值传入同一函数**（如对同 SvLineSet 两次 SvWriterEncode）→ 同错误；改为两次构建/传不同本地。
3. plain main 里对含托管字段的用户结构体做嵌套字段整体赋值（`out.meta = meta`）属未证形态，摊平字段绕开。
4. **CSGC 解码行序 ≠ 发射序**（kind 分节重排）：validator 一切顺序类检查必须序无关（唯一性承担身份），驱动对拍必须多重集合/tid 配对。

## 8. 文件清单

- 改：`src/game/assets/semantic_video/{schema,writer,reader,validator}.cheng`（全 additive）
- 新：`src/tools/sv_semplane_container.cheng`、`tools/sv_plane_records_prep.py`
- 规范：`docs/specs/csg-semantic-video-v0.1.md` §9 增补节
- 产物：`planetrack/hgs_l2_planes.svblock`（+`_android`）、`planetrack/sv_plane_records_prep.jsonl`
- 未动：UniMaker HAP、安卓 q3_serve、base.mp4（他 lane 所有权线）、git 未提交（按纪律）
