# task_m8b_contrast_assets —— CSG 语义覆盖率探针对照视频资产（journey）

日期：2026-09-12。目标：为「CSG 语义覆盖率」探针（RANSAC 仿射深度平面拟合，K=16 覆盖率≥80%=高语义可拟合类）准备与胡广生同规格的对照视频资产（M7 管线 v2 双档 + 本任务新增 ref_frames/ 原帧参考抽取口径）。

## 0. 结论

- **journey 入选并已全链路转换 + 25 项校验全 PASS**（exit=0），产物与胡广生同规格。
- **实拍固定机位素材在本机盘缺席（本轮 26 个真实视频全量排查，无一满足判据）**——这本身是一个发现：普通用户盘的实拍素材几乎全是蒙太奇/录屏/幻灯片。对照集的监控/访谈/舞台类实拍素材待用户提供后按 §5 命令一键补齐。
- journey 是 CSG 场景图渲染视频（上游 csg_player 产，M6a 播放器原型曾用），非实拍。按当日协调指示收录为「CSG 场景图可表达性」天然正面样本：固定机位 + 棋盘格地面/条纹墙（结构性背景 = 墙面/地面平面），预期高语义可拟合。
- 本任务**零工具改动**（batch_depth_runner.py / ssm1_pack.py / ssm1_parse_check.py 均未动）；新增口径 ref_frames/ 由资产准备步骤实现（runner 的 frames/ 原样拷贝，索引↔pts 天然对齐）。

## 1. 素材判据与三帧差证据（全部真实实测）

判据：单镜头、相机不动、时长达标（原 ≥10s，协调后放宽 ≥5s）、含室内/建筑背景。机位判定 = ffmpeg 抽首/中/尾三帧（160×160 灰度），python 算相邻帧差均值（u8 域 0-255），**≤12 为固定机位**（参考基准：胡广生本身 = 11.64）。

### 1.1 入选：journey

`artifacts/csg_world_video/journey/journey.mp4`（1280×720@24fps，1440 帧，60.01s，8.59MB；`.scratch/r57root` 下有同字节副本）

| 证据 | 值 | 判读 |
|----|----|----|
| 首中尾三帧差 f0-f1 / f1-f2 / 均值 | 11.35 / 19.54 / **15.44** | 表观略超 12，细剖归因见下 |
| 1fps 细剖面（59 对相邻帧差） | **median=2.01，p90=4.96** | 相机不动；仅 3 个离散尖峰（t29.5=28.71、t39=26.54、t49=14.28）= 前景物体沿绳运动事件，非相机运动 |
| 最长平稳段 | **20s**（1s 间隔相邻差≤6 连续段） | 远超 ≥5s 放宽线 |
| 逐帧目检（s002/s015/s029/s030/s055） | 同一机位同一场景 | 棋盘格地面+条纹墙全程对齐无漂移，仅前景与字幕变化；单镜头无切换 |

三帧差 15.44 的归因：f0(t0.5)→f1(t30) 跨越 t29.5 前景事件尖峰，把均值抬过 12；相机本身静止（尖峰间基线 2.0 左右、首 8s 近冻结 0.13-1.03）。判据意图是「相机不动」，journey 实测满足；如实记录表观值与归因。

### 1.2 拒收：maitian（协调线索 1）

`platform/harmony/ChengGuiDemo/entry/src/main/resources/rawfile/maitian.mp4`（1280×720@60fps，5.548s；md5 23f2cb8b… 与 Desktop/maitian.mp4 同字节，与 Downloads/视频生成/麦田.mp4 f0013f6d… 为不同封装/切片）

| 证据 | 值 | 判读 |
|----|----|----|
| 首中尾三帧差均值 | **29.9** | >12，拒 |
| 1fps 细剖面 | median=21.77，p90=24.8，最长平稳段 **0s** | 全程连续运动（航拍漂移），无任何平稳段，拒 |

### 1.3 全量排查记录（26 个视频，位置与三帧差均值）

三帧差方法同 §1（0.5s/中点/尾-0.5s 三帧相邻差均值）。

| 位置 | 视频 | 三帧差均值 | 时长 | 判读 |
|----|----|----|----|----|
| Downloads/视频生成/ | 胡广生（M7 参考基准） | **11.64** | 22.5s | 已转换，基准 |
| 同上 | Yellow_River_s_Embrace | 56.37（f0-f1=0.0：前 15s 冻结静帧） | 30.8s | 画作静帧+蒙太奇，无三维场景 |
| 同上 | 《15秒，穿越华夏之源》×3 | 59.48 / 66.23 / 61.61 | 15s | 蒙太奇 |
| 同上 | 人工智能简史1-5 | 71.44 / 84.76 / 36.51 / 114.96 / 70.5 | 15s | AI 蒙太奇/扫掠 |
| 同上 | 华夏之源天鹅之城/等你回家 | 61.33 / 59.5 | 15s | 蒙太奇 |
| 同上 | 三门峡 | 50.84 | 5.1s | 航拍运动镜头，且 <5s |
| 同上 | 视频脚本生成与分享 | 抽帧失败（json 空） | 8.0s | <5s，未进入判据 |
| Downloads/ | 三门峡 | 63.02 | 15s | 蒙太奇 |
| Downloads/ | 大盘优选 | 107.49（f1-f2=0.12：后半冻结） | 62.5s | 股票 UI 录屏，无三维语义，内容类拒收 |
| Downloads/ | 价格标记缺了一半 | 6.01 | 6.3s | UI 录屏（非三维场景），内容类拒收 |
| Downloads/ | vreq_5de30ad79c1b5282 | 43.84 | 10.0s | 多镜头蒙太奇（目检三帧为三个不同场景） |
| dapanyouxuan/ | — | 无视频文件 | — | 仅代码/文档 |
| Movies/ai-history | 人工智能发展简史 | 15.71 | 120.8s | 幻灯片式解说视频（目检为黑底文字页），无深度语义 |
| Movies/ | 凡人修仙传·第一集 | 未测（动画长片，非固定机位实拍类） | — | 内容类排除 |
| Desktop/ | 录屏2026-08-27 | 0.46 | 33.4s | 桌面 UI 录屏（目检确认），内容类拒收 |
| Desktop/ | maitian.mp4 | 29.9 | 5.5s | 同 §1.2（同字节） |
| Pictures/ | 京东地址管理 | 44.87 | 46.1s | 手机 UI 录屏 |
| Pictures/ | 淘宝视频 | 32.93 | 36.0s | UI 录屏 |
| Pictures/Photos Library | 9358EBB5….mp4 | 未测 | 4.1s | <5s |
| iCloud Drive/Documents/ | 婴儿叫妈妈/爸爸 | 11.65 / 52.73 | 2.0s | 均 <5s |

已查位置：/Users/lbcheng/Downloads/视频生成/、/Users/lbcheng/Downloads/（含子目录 depth 6）、/Users/lbcheng/dapanyouxuan/、/Users/lbcheng/Movies、/Users/lbcheng/Desktop、/Users/lbcheng/Documents、/Users/lbcheng/Pictures（含 Photos Library originals）、/Users/lbcheng/Library/Mobile Documents（iCloud）、主仓 ts-csg/platform 与 artifacts（协调两条线索）。

**判据放宽口径（如实记录）**：原任务 ≥10s；协调于 2026-09-12 放宽为 ≥5s（RANSAC 探针 5.5s 足够），三帧差 ≤12 判据不变。放宽理由：真实固定机位素材在本机盘稀缺本身是发现，对照集后续由用户提供（监控/访谈/舞台）补齐。journey 60s 远超放宽线。

## 2. 转换（现役 M7 管线，与胡广生同规格）

```
batch_depth_runner.py journey.mp4 → run10fps/  （fps=10 抽帧 600 帧 → MiDaS_small CPU 推理，infer median=1.034s/帧）
ffmpeg -i 源 -vf scale=-2:480 -t 60.0 -c:v libx264 -crf 28 -preset medium -g 30 -pix_fmt yuv420p
       -c:a aac -b:a 64k -movflags +faststart → v2/base.mp4
ssm1_pack.py run10fps . --v2 --audio-wav ../audio.wav --base-video base.mp4
ssm1_parse_check.py . --input run10fps --v2
ref_frames/ ← run10fps/frames/ 原样拷贝（600 张 1280×720 PNG，54MB）
```

**资产准备修正（本任务唯一坑，零工具改动）**：journey 源时长 60.0107s 非整秒，首跑 base（AAC 重编码垫长到 60042ms）与音轨（60011ms）同 manifest `totalDurationMs=base_dur` 不等 → V12 FAIL。修正：音轨与 base 均精确裁到 60.000s（=600 帧×100ms 深度时间轴，ffmpeg `-t 60.0`；audio.wav=2,646,000 样本整）。**后续非整秒源素材一律先裁齐到深度时间轴再打包。**

## 3. 转换指标（实测）

| 项 | 值 |
|----|----|
| 深度层数据 | **600 帧 256×128 @10fps，60,000ms**（MiDaS_small，min=0 / max=1118.14 全域） |
| 量化域 | `u8=round(d/1118.14*255)`，**lsb=4.3849 MiDaS 单位**（全域 0.39%） |
| depth_qp10.mp4（播放档） | **758,311 B**，sha256 dc32f429…，qp10 High 4:2:0 full range，GOP 30 帧，首 GOP 18,325 B，maxdiff=6/11.5 |
| depth_qp0.mp4（校验锚） | 1,967,327 B，sha256 45416822…，qp0 逐位无损，首 GOP 14,832 B（不上机） |
| base.mp4 | **1,613,793 B**，sha256 0438bcda…，854×480@24fps，GOP 1s，首 GOP 13,761 B |
| manifest.json (v3) | 2,084 B |
| **分发形态（上机）** | **2,374,188 B = 2.26MB**（base + qp10 + manifest） |
| 归档形态 | 4,341,515 B（含 qp0 校验锚） |
| **秒开预算** | **34,170 B** = manifest 2,084 + 播放档首 GOP 18,325 + base 首 GOP 13,761 |
| 深度重建误差上限 | maxdiff 6 级 → **1.368 MiDaS 单位**（lsb=4.3849） |
| 音轨 | audio.wav（pcm_s16le 44.1kHz stereo，60,000ms 整，2,646,000 样本） |
| ref_frames/ | **600 张 PNG（54MB）**，k ↔ pts_ms=k*100 与深度帧一一对应（REF_ALIGN PASS 600/600） |
| run10fps/ | 131MB（600 npy + 600 png + manifest.json） |

注：分发形态 2.26MB 超胡广生 0.84MB，主因 60s vs 22.5s 与横屏 854×480 base；对照资产以离线探针消费为主，若后续需上机按 task_m7_pack_v2 §3 base CRF 阶梯压 base 即可，深度层已达标。

## 4. 校验输出（真实运行，25 项全 PASS，exit=0）

```
$ ssm1_parse_check.py . --input run10fps --v2
PASS V0 manifest.json 存在 (./manifest.json)
PASS V1 format='SSM2 meta v2 (hybrid: base H.264 + dual-tier depth qp10 playback / qp0 checksum)' version=3
PASS V2 三文件存在 (depth_qp10.mp4, depth_qp0.mp4, base.mp4)
PASS V3 播放档 sizeBytes=758311
PASS V4 播放档 sha256=dc32f429…
PASS V5 校验锚 sizeBytes=1967327
PASS V6 校验锚 sha256=45416822…
PASS V7 base sizeBytes=1613793
PASS V8 base sha256=0438bcda…
PASS V9 播放档流 256x128 pix_fmt=yuvj420p (High 4:2:0 full range)
PASS V10 校验锚流 256x128 pix_fmt=yuvj420p (full range)
PASS V11 三路时长 60000/60000/60000 ms == manifest
PASS V12 音轨时长 60000 ms 与总时长同步
PASS V13 播放档帧数 600 == manifest
PASS V14 播放档首GOP 18325 B == manifest (关键帧 22)
PASS V15 校验锚首GOP 14832 B == manifest (关键帧 63)
PASS V16 base 首GOP 13761 B == manifest (关键帧 48)
PASS V17 源帧数 600 == manifest
PASS D1 校验锚解码 600 帧逐位 BITEXACT (u8=round((d-0)/1118.14*255))
PASS D2 播放档带界 maxdiff=6 <= bound=11.5 (== manifest 实测 6)
PASS D3 深度重建误差上限 1.368 MiDaS 单位 <= (0.5+q)*lsb+换算余量
PASS V18 秒开预算 = manifest 2084 + 播放档首GOP 18325 + base首GOP 13761 = 34170
PASS N1 播放档被替换 (base 内容) -> 解码校验拒绝
PASS N2 播放档被截断 (砍尾 50KB) -> 解码校验拒绝
PASS N3 manifest sha256 篡改 -> 一致性校验拒绝
ALL PASS v2: 分发形态 2374188 B (2.26 MB); 归档形态 4341515 B; 校验锚 600 帧 BITEXACT 无损;
播放档带界 maxdiff=6/11.5 (u8); 秒开预算 34170 B
```

ref_frames 对齐（同轮验证）：`REF_ALIGN PASS`——600 帧逐帧 `k ↔ pts_ms=k*100`、rgb/depth 文件一一存在；首尾帧 `cmp` 与 runner frames/ 逐字节一致。

## 5. 产物路径

- `artifacts/csg_asset_pipeline/journey/v2/base.mp4`（1,613,793 B）[上机]
- `artifacts/csg_asset_pipeline/journey/v2/depth_qp10.mp4`（758,311 B）[上机, 播放档]
- `artifacts/csg_asset_pipeline/journey/v2/depth_qp0.mp4`（1,967,327 B）[校验锚, 不上机]
- `artifacts/csg_asset_pipeline/journey/v2/manifest.json`（meta manifest v3）
- `artifacts/csg_asset_pipeline/journey/v2/ref_frames/`（600 张原帧 PNG，M8a 对拍口径）
- `artifacts/csg_asset_pipeline/journey/v2/pack_report.json`、`parse_check_v2.log`
- `artifacts/csg_asset_pipeline/journey/v2/run10fps/`（600 帧深度产线，131MB）
- `artifacts/csg_asset_pipeline/journey/audio.wav`（60,000ms 整）

工具（本轮零改动）：`docs/campaigns/2026-09-06-csg-asset-pipeline/tools/{batch_depth_runner.py, ssm1_pack.py, ssm1_parse_check.py}`

## 6. BLOCKED 项与后续

1. **实拍固定机位对照素材缺位**：26 个本地真实视频无一同时满足「单镜头+相机不动+≥5s+室内/建筑背景」。监控/访谈/舞台类素材待用户提供，到货后按 §2 命令链一键转换（记得非整秒源先 `-t` 裁齐到深度时间轴）。
2. 探针侧（RANSAC K=16 覆盖率）消费本资产时，journey 的背景地面/墙面为纯平面几何，预期 K=16 覆盖率应接近饱和；若探针在 journey 上达不到 ≥80%，优先怀疑探针本身而非素材。
3. 证据帧与剖面脚本存于 `.rebuild/m8b_contrast/`（gitignored）：fixedcam_check.py（三帧差）、fine_scan.py（1fps 剖面）、verify_refalign.py（ref 对齐）、frames/（候选三帧 PNG 与 journey 1fps 序列）。
