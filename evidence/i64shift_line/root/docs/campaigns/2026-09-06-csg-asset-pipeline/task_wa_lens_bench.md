# task_wa_lens_bench —— 「真 CSG 世界电影」WA：电影级素材 → 逐镜头分割 → 镜头基准集

日期：2026-09-13。三线正交之一：WA 产出**镜头基准集**，为 WB（单镜头混合表达产线）/WC（求值渲染器）提供输入。全部数字为真实运行输出（scdet / 1fps 帧差 / MiDaS / ssm1 管线），无伪造。

## 0. 结论

- 素材：Carnival of Souls (1962，公版确认，archive.org `carnival-of-souls-1962_202010`，1280x720 H.264) 取 **560–1760s 共 20 分钟**片段 → `source.mp4`（211,776,546 B，25fps PAL，1200.000s 整，30,000 帧）。
- 分割：**94 个镜头（69 stable / 25 moving）**，scdet threshold=4（经 1fps 帧差尖峰校准，threshold=8 漏检 8/13 真实切换）。
- 基准集：3 个代表镜头（stable 室内 L084 / stable 室外 L057 / 运动机位对照 L052）全链路构建，**每镜头 ssm1_parse_check --v2 25 项全 PASS**，base 全部 ≤2MB（crf28 一步达标）。
- lens_manifest 与实际产物一致性核对 **PASS**（帧数/时长/base 体积/ref 首尾帧 cmp）。

## 1. 素材来源

| 项 | 值 |
|----|----|
| 影片 | Carnival of Souls (1962)，Herk Harvey 导演，公版状态明确（著作权未续） |
| 来源 | archive.org item `carnival-of-souls-1962_202010`（Hi-quality，1280x720 H.264 25fps，4662.96s，666MB） |
| 取用方式 | ffmpeg 远程读流裁剪 560–1760s 重编码（crf18 medium），**落盘 211.8MB ≤500MB**，网络读取量 <500MB；512kb(320x240) 与 272MB 档因分辨率不足弃用 |
| 选片理由 | 室内外混合丰富（堤坝/街道/游乐园 + 老宅/百货店/教堂/公寓）、B 级片三脚架固定机位多、黑白高对比利于深度拟合 |
| 中间文件 | 512kb 全片（361MB，仅用于全片镜头密度分布探测）探测后当场删除 |

## 2. 镜头清单（lens_manifest.json，三线共享接口定稿）

```json
{"video": {"path": "…/movie/source.mp4", "durationMs": 1200000, "width": 1280, "height": 720},
 "lenses": [{"id": "L002", "startMs": 6960, "endMs": 25920, "fps": 10,
             "cameraStable": true, "stabilityScore": 4.52,
             "depthDir": "lenses/L002/run10fps", "refDir": "lenses/L002/ref_frames",
             "basePath": "lenses/L002/base.mp4", …}]}
```

字段定稿（三线约定）：`startMs/endMs` 相对 source.mp4 片段起点，**构建过的镜头边界已 snap 到 200ms 网格**（偶数 10fps 帧数 = 100ms 深度轴 × 25fps 源整帧边界的最小公倍，见 §4 坑 1），带 `snapNote`；`fps=10` 抽帧口径 `ptsMs=k×100`（M7-pack）；`stabilityScore` = 镜头内 1fps 剖面相邻帧差 **median**（160x160 灰度 u8 域）；`cameraStable` = median ≤ 12（M8b 阈值，参考基准胡广生 11.64）。`depthDir/refDir/basePath` 为约定路径，未构建镜头路径为预填、产物以 `builtLenses` 数组为准。

### 2.1 分布（真实统计）

| 项 | 值 |
|----|----|
| 镜头总数 | **94**（scdet 切点 93 个 + 片尾闭合；合并碎片 0，min_lens_s=1.5） |
| cameraStable | **69**（median 1.74–11.5，stable 组 median=4.51） |
| MOVING | **25**（median 12.37–25.91，moving 组 median=15.25） |
| 镜头时长 | min 1.6s / max 56.6s / mean 12.8s / median 8.4s；≥10s 共 40 个 |
| 剖面口径 | 每镜头 1fps、160x160 灰度、相邻帧差序列 → median/p90/最长平稳段(≤6 连续秒) |

### 2.2 阈值校准（真实实验，560–660s 100s 窗口）

| scdet threshold | 切点数 | 对照 |
|----|----|----|
| 8（默认） | 5 | 漏检 |
| 6 | 10 | — |
| **4** | **13** | 与独立 1fps 帧差序列尖峰（>25 单点台阶）逐一对应 → 采纳 |

## 3. 三镜头基准集指标（全部真实运行）

入选（抽帧目检确认场景属性）：

| 镜头 | 片段区间 | 类型 | 场景目检 | median/p90/平稳段 |
|----|----|----|----|----|
| **L084** | 1027.28–1069.68s | stable 室内 | 公寓餐台送茶对话，墙面画/门/家具多平面 | 4.66 / 8.86 / 8s |
| **L057** | 663.84–696.24s | stable 室外 | 堤坝桥前双人对话（天空+桥体结构背景） | 7.09 / 11.54 / 5s |
| **L052** | 616.20–625.00s | 运动机位对照 | 行驶车辆主观镜头（道路/桥墩连续平移，stableRun=0） | 15.21 / 19.80 / 0s |

构建链（每镜头，`tools/csg_lens_split.py build`）：裁 clip（crf16 fast，近无损产线输入）→ audio.wav（pcm_s16le 44.1k stereo，精确 n/10 秒）→ batch_depth_runner 10fps（MiDaS_small CPU，infer median 0.71–0.77s/帧）→ base.mp4（scale=-2:480 crf28 medium g30 faststart aac64k）→ ref_frames ← run10fps/frames 原样拷贝 → ssm1_pack --v2 → ssm1_parse_check --v2。

| 指标 | L084 | L057 | L052 |
|----|----|----|----|
| 深度帧数（=ref 帧数） | 424 | 324 | 88 |
| 深度域 min/max | 0 / 全流全局量化 | 同 | 同 |
| depth_qp10.mp4（播放档） | 577,040 B | 546,241 B | 129,306 B |
| depth_qp0.mp4（校验锚） | 1,708,335 B | 1,526,168 B | 299,682 B |
| base.mp4（crf28 一步达标 ≤2MB） | **1,230,287 B** | **866,099 B** | **388,506 B** |
| 分发形态（base+qp10+manifest） | 1.73 MB | 1.35 MB | 0.50 MB |
| 校验锚 | 424 帧逐位 BITEXACT | 324 帧 BITEXACT | 88 帧 BITEXACT |
| 播放档带界 maxdiff | 6/11.5 (u8) | 6/11.5 | 5/11.5 |
| 秒开预算 | 47,917 B | 84,090 B | 101,390 B |
| MiDaS infer median | ~0.7s/帧 | ~0.7s/帧 | 0.717s/帧 |

产物目录：`artifacts/csg_asset_pipeline/movie/lenses/{L052,L057,L084}/`（clip.mp4 / audio.wav / run10fps/ / ref_frames/ / base.mp4 / depth_qp10.mp4 / depth_qp0.mp4 / manifest.json / pack_report.json / parse_check_v2.log）。体积：L084 387MB、L057 224MB、L052 58MB（ref_frames/run10fps 为主）；source.mp4 208MB。

## 4. 校验输出（真实运行）

每镜头 `ssm1_parse_check.py lenses/LXXX --input lenses/LXXX/run10fps --v2` → **rc=0，25 项全 PASS**（V0–V18 + D1–D3 + N1–N3，对照 M7-pack 25 项），日志存档于各镜头目录 `parse_check_v2.log`。L057 全文示例：

```
PASS V0 manifest.json 存在 … PASS V2 三文件存在
PASS V3-V8 三文件 size/sha256 == manifest
PASS V9/V10 播放档/校验锚 256x128 yuvj420p (full range)
PASS V11 三路时长 32400/32400/32400 ms == manifest
PASS V12 音轨时长 32400 ms 与总时长同步
PASS V13 播放档帧数 324 == manifest ; V14-V16 三路首GOP == manifest
PASS V17 源帧数 324 == manifest
PASS D1 校验锚解码 324 帧逐位 BITEXACT ; D2 带界 maxdiff=6<=11.5 ; D3 误差上限 1.410 MiDaS 单位
PASS V18 秒开预算 84090 B ; N1-N3 三负例全部拒绝
ALL PASS v2: 分发形态 1414415 B (1.35 MB) …
```

lens_manifest ↔ 产物一致性核对（本轮运行）：

```
L052: dep/ref/npy=88/88/88 exp=88 OK | base=388506B<=2MB OK | clip=8800ms OK | lastPts=8700 OK
L057: dep/ref/npy=324/324/324 exp=324 OK | base=866099B<=2MB OK | clip=32400ms OK | lastPts=32300 OK
L084: dep/ref/npy=424/424/424 exp=424 OK | base=1230287B<=2MB OK | clip=42400ms OK | lastPts=42300 OK
REF_ALIGN 首尾帧 cmp PASS
MANIFEST_CONSISTENCY PASS
```

### 本轮唯一坑（已修，写入工具注释）

源为 25fps PAL：8.9s 时长 = 222.5 源帧非整数边界，clip 视频流被 ceil 到 223 帧（8.92s），经 base 传染 totalDurationMs → V12 FAIL（L052 首跑）。修正：镜头时长 snap 到**偶数 10fps 帧数**（200ms 网格 = lcm(100ms 深度轴, 40ms 源帧周期)），重跑后三路时长严格一致。对应镜头 endMs 已按 snap 写回 lens_manifest。

## 5. 工具与复现

- 新增：`tools/csg_lens_split.py`（detect=分割+评级+清单；build=单镜头全链路构建）。管线工具零改动（batch_depth_runner.py / ssm1_pack.py / ssm1_parse_check.py 均未动）。
- 复现：`python3 tools/csg_lens_split.py detect movie/source.mp4 movie/lens_manifest.json --scdet-threshold 4` → `python3 tools/csg_lens_split.py build movie/source.mp4 movie/lens_manifest.json L084 movie`。
- 纪律：未动 git；主仓仅新增本工具、本文档、`artifacts/csg_asset_pipeline/movie/**`；下载中间文件已删。

## 6. BLOCKED 项与后续

1. 无 BLOCKED。网络（archive.org）、下载、分割、构建、校验全链路一次走通（一次 V12 回归修复）。
2. scdet 对叠化转场（60 年代片常见）需 threshold≤4 才不漏检；threshold=4 未引入误检（校准实验 §2.2），但更长片段复用时建议保留该校准步骤。
3. 剩余 91 个镜头的构建未做（本轮任务只要求 3 个代表镜头）；WB/WC 消费扩展时按 §5 build 命令逐镜头补齐即可，注意每镜头 ~1-4 分钟 MiDaS CPU 成本与 ref_frames 磁盘占用（~0.5MB/帧）。
4. 本片段室内镜头占比高（对话段），室外 stable 样本（堤坝/街道）若需更多，可另取源 1760s 之后窗口扩展。
