# task_content_moderation — 内容审核层（获取层 A 入口前置）原型

> 状态：原型 v0 完成（2026-09-13）
> 定位：CSG_VIDEO_IDEAL.md §5 获取层入口——存量视频/直播流进 CSG 转换产线前的黄赌毒自动审核。独立前置层，不混入 CSG 编码器内部。
> 主代码：`tools/csg_content_moderation.py`（宿主 Python）
> 产物：`artifacts/csg_asset_pipeline/moderation/**`

## 1. 模型选型（按任务优先级，全部真实装机实证）

| 通路 | 选型 | 来源 | 实证 |
|---|---|---|---|
| NSFW 视觉 | **NudeNet v3.4.2**（320n.onnx，ONNXRuntime CPU） | `pip install nudenet`（官方源） | 装机成功，模型 sha256 `c15d8273…`；18 类标签表从包源码核对；本机空白图推理通路 PASS |
| OCR 文字 | **tesseract CLI 5.5.2 + chi_sim+eng**（本机已有 tesseract，chi_sim 从官方 `tessdata_fast` 下载 2.4MB，自动落 `moderation/models/tessdata/`） | brew 已装 + GitHub 官方 tessdata 仓 | 合成中文关键词图逐字命中（`百家乐 现金下注`→原文） |
| 多类场景 | **timm resnet50.tv_in1k**（ImageNet 1000 类，HF 官方权重） | timm 预装环境 | 1000 类加载成功；类映射经 `timm.data.ImageNetInfo.index_to_description` 逐条核对 |
| 规则基线 | Kovac RGB 肤色占比（numpy 向量化） | 无依赖 | 合成肤色块 ratio=0.836 命中阈值 |

**ImageNet 目标类映射（运行时核对，非记忆）**：硬类 `800 slot, one-armed bandit`（赌博）；软类 `845 syringe`、`720 pill bottle`（毒品器具，弱）、`445 bikini`、`842 swimming trunks`、`638/639 maillot`（NSFW 软信号）。**ImageNet 无 hookah/bong/cigarette/暴力类**——毒品器具与暴力的视觉通路天然缺失，如实声明。

## 2. 接口设计

```python
from csg_content_moderation import moderate_video
report = moderate_video(video_path, config={"nsfw_exposed_reject": 0.5}, out_dir=...)
# -> {"verdict": "PASS"|"REVIEW"|"REJECT",
#     "categories": {"nsfw": s, "gambling": s, "drugs": s, "violence": s},
#     "frames_flagged": [{frame, pts_ms, verdict, evidence}, ...],
#     "confidence": float, "details": {"frames": [逐帧全量证据]}}
```

流水线：ffprobe 探元 → ffmpeg `fps=1` 抽帧（1fps，`max_frames=300` 护栏）→ 逐帧过 NudeNet / resnet50 / 肤色规则 / tesseract(chi_sim+eng, psm 11) → 证据分两级聚合。

**证据分级（避免肤色/泳装误杀）**：
- hard 证据 → REJECT：NudeNet 5 类硬暴露（生殖器/乳头/肛门/臀部 EXPOSED）≥0.45；ImageNet 老虎机 ≥0.50；OCR strict 关键词命中（记 0.9 声明常量）。
- soft 证据 → REVIEW：NudeNet 软暴露（男露上身/腹/腋/足）≥0.25；肤色占比 ≥0.55；ImageNet 泳装/注射器/药瓶 ≥0.40；OCR soft 关键词（记 0.5）。
- 任一帧 hard → 全片 REJECT；仅 soft → REVIEW；否则 PASS。confidence = 判定驱动分。

**阈值全部可配置**：`moderate_video` config 或 CLI `--nsfw-reject/--skin-review/--imagenet-reject/...`。关键词表 `OCR_KEYWORDS` 为模块常量（strict/soft 双档，含黑话 soft 档并标注误报风险）。

## 3. 测试结果（真实运行输出，2026-09-13）

**T0 selftest 全绿**（`python3 tools/csg_content_moderation.py selftest`）：
```
T1 ocr_gambling: PASS ocr='百家乐 现金下注' hits=[gambling/strict/百家乐, gambling/strict/下注]
T1 ocr_drugs:    PASS ocr='出售冰毒 毒品'    hits=[drugs/strict/毒品, drugs/strict/冰毒]
T1 ocr_clean:    PASS（无关句子 0 命中）
T2 skin_rule:    PASS ratio=0.8359 (>= 0.55)
T3 aggregate_reject: PASS verdict=REJECT（伪造检测的聚合代码路径单测，已标注非真实推理）
T4 nudenet_negative_path: PASS（空白图 0 检出；阳性触发验证 BLOCKED，见 §5）
selftest: PASS -> artifacts/csg_asset_pipeline/moderation/tests/selftest_report.json
```

**安全正样本** `huguangsheng/v2/base.mp4`（270x480@30fps，22.5s，1fps 采样 23 帧）：
```
verdict=PASS confidence=1.000
categories: {"nsfw": 0.0, "gambling": 0.0, "drugs": 0.0, "violence": 0.0}
frames_flagged: 0
```
帧级抽查（非全零的真空转证据）：NudeNet 仅检出 `FACE_FEMALE max=0.74`（无人脸误报为暴露）；肤色占比 min/med/max = 0 / 0.027 / 0.036；OCR 无关键词。耗时 17.2s 全片（中位 0.46s/帧，CPU）。

**ImageNet 映射行为探针**（维基百科词条配图，公开安全内容）：
- Las_Vegas_slot_machines.jpg → top1 `slot, one-armed bandit` p=0.99998 → hard 证据 `{800: 0.99998}` ≥0.50 REJECT 通路 ✓
- Syringe 词条图 → top1 `syringe` p=0.99994 → soft 证据 `{845: 0.99994}` REVIEW 通路 ✓

**三判据产线门禁矩阵**（gate 模式真实运行）：

| 输入 | 审核判定 | gate 行为 | exit | 产线是否执行 |
|---|---|---|---|---|
| base.mp4 | PASS | 放行→MiDaS 深度产线真跑 4 帧，产出 manifest.json+depth npy | 0 | 是 |
| 合成「百家乐 现金下注」2s 视频 | REJECT（gambling 0.9，2 帧命中） | 拦截，审核报告落盘，`gate_smoke_reject_out` 未创建 | 4 | 否 |
| 合成「棋牌游戏 代理招募」1s 视频（soft 词） | REVIEW（gambling 0.5） | 挂起待人工复核 | 5（`--allow-review` 可放行） | 否 |

开发中抓到并修复的真 bug：OCR strict 证据内部 tier 记为 `"strict"` 而聚合层只认 `"hard"/"soft"`，导致 strict 命中降级成 REVIEW——被三判据矩阵当场暴露，已修（归一层 strict→hard，原始档位入 detail）。

## 4. 产线集成方案

不改动 `batch_depth_runner.py`（本次纪律只允许新增文件）。产线入口切换为：

```bash
# 原: python3 docs/campaigns/.../tools/batch_depth_runner.py <video> <outdir> [args...]
# 现: 前置审核 -> PASS 才 delegate（'--' 后参数原样透传产线）
python3 tools/csg_content_moderation.py gate <video> <outdir> [--allow-review] [审核阈值] -- [产线参数...]
```

- gate 内部：`moderate_video()` 先行 → 报告落 `artifacts/csg_asset_pipeline/moderation/<video_stem>/moderation_report.json`（含 video sha256 绑定、逐帧证据、阈值回显、模型哈希）→ REJECT exit 4 跳过转换；REVIEW exit 5 挂起（`--allow-review` 放行）；PASS exit 0 并 `subprocess` 原样调用 batch_depth_runner。
- 审核层报告 schema：`content_moderation_report_v0`。
- 直播流：本原型按文件处理；流式场景由上层按段落盘（如 ffmpeg 切 10s .ts）逐段调 `moderate_video`，判定跨段聚合由上层负责。
- 恢复默认审核层独立：batch_depth_runner 保持无审核逻辑，审核语义全部在本文件。

## 5. 诚实边界与 BLOCKED 项

1. **NSFW 阳性触发验证 BLOCKED**：NudeNet v3.4.2 不自带测试图；纪律禁止获取/存储违规样本，故硬暴露类别的真阳率未经真实内容验证。已验证：模型装载/推理通路（空白图 0 检出）、阴性一致性（base.mp4 全片无假阳）、聚合代码路径单测（T3，伪造记录）。上线前必须用授权基准集标定 0.45 阈值。
2. **violence 无视觉模型通路**：ImageNet 无暴力类，仅 OCR 文字弱信号（soft 档），漏报是已知边界。
3. **OCR 关键词是启发式**：黑话（`上头/溜冰`）放 soft 档防误报；strict 词表也可被变体绕过（谐音/拆字）。生产化需词表运营+上下文模型。
4. **NudeNet 320n 模型 320px 输入**：小目标（远景）敏感度有限；抽帧 1fps 会漏掉 <1s 的瞬时画面——抽样审核的固有边界，不是全帧审核。
5. `cv2` 本次随 nudenet 依赖（opencv-python-headless 5.0.0.93）进入用户 site-packages，审核层本身只用 numpy/PIL/ffmpeg。

## 6. 产物清单

- `tools/csg_content_moderation.py` — 审核层（moderate/gate/selftest 三子命令）
- `artifacts/csg_asset_pipeline/moderation/base/moderation_report.json` — base.mp4 PASS 报告（23 帧全量证据）
- `artifacts/csg_asset_pipeline/moderation/probe_gambling_video/`、`probe_soft_video/` — REJECT/REVIEW 报告
- `artifacts/csg_asset_pipeline/moderation/tests/` — selftest 报告、OCR/肤色探针图、合成测试视频、ImageNet 探针图与 `imagenet_probe_report.json`、gate 冒烟产物
- `artifacts/csg_asset_pipeline/moderation/models/tessdata/` — 自包含 tessdata（eng 复制自系统 + 官方 chi_sim）
