# 任务：离线批量深度产线（视频→批量深度→分层网格）

2026-09-11。前置：RECEIPT_midas_full_cheng.md（MiDaS v2.1-small 全图纯 Cheng 单帧回执，
corr 0.99997571）。本任务把 torch 侧产能扩成离线产线，为场景流容器供料。

## Files

只新建（未动任何已跟踪文件，git status 佐证：新增路径均被 .gitignore 覆盖，
`git check-ignore` 命中 *.py / artifacts/ 规则）：

- `tools/batch_depth_runner.py` — mp4 → 抽帧 → torch MiDaS_small 深度 → 每帧
  depth_%06d.npy + frame PNG + manifest.json（pts_ms / 深度路径 / min-max-mean）
- `tools/depth_to_layers.py` — 单帧 RGB+深度 → 2.5D 位移网格 OBJ + 相机 json
- `artifacts/csg_asset_pipeline/batch/` — 探针与端到端产物：
  - probe_chain_binding.py / probe_throughput.py / probe_preprocess_fidelity.py
  - e2e/testsrc_256.mp4（ffmpeg testsrc2 合成 5s@10fps 256x256）、e2e/run_2fps/
    （10 帧 npy+PNG+manifest.json+mesh_frame_000000.obj/.camera.json）、
    torch_final_depth_64.npy（链路绑定 torch 输出）

## Action

1. batch_depth_runner：`--fps`（默认 2）经 ffmpeg `fps` 滤镜抽无损 PNG（0 基编号）；
   pts_ms = k·1000/fps（fps 滤镜名义时间戳，语义写入 manifest）。模型
   `torch.hub.load(HUB_DIR, 'MiDaS_small', source='local', pretrained=True)`，权重
   midas_v21_small_256.pt 已在 torch.hub 缓存（hub/checkpoints/），全程离线，日志实证
   `Using cache found in .../rwightman_gen-efficientnet-pytorch_master`。
   ffmpeg/ffprobe 缺失时 hard-fail 在抽帧前（exit 2），不伪造。
2. 预处理（hubconf.py 327-343 现场读取，非记忆）：/255 → Resize(256,256,
   keep_aspect_ratio=True, ensure_multiple_of=32, upper_bound, INTER_CUBIC) →
   Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]) → CHW float32。
   Resize.get_size 从 midas/transforms.py:105-160 逐行移植。
   **偏差（如实声明）**：本机无 cv2（python3/3.11/3.12//usr/bin/python3 import 全失败，
   未擅自装包），重采样以 torch bicubic(align_corners=False) 替代，写入 manifest 的
   transform 字段。下游接纯 Cheng 定点对拍前必须先复核此偏差。
3. depth_to_layers：纯手写 OBJ 序列化（v=像素 xy + z=深度·depth_scale，vt=像素坐标，
   相邻 2x2 像素一四边形，1 基索引）。固定针孔 fx=fy=W、cx=(W-1)/2、cy=(H-1)/2、
   90° 水平 FOV，写死在注释与伴随 json；MiDaS 输出是相对逆深度（disparity 域），
   默认直接当 z 位移，米制标定不在本工具内。
4. 吞吐：CPU、torch.set_num_threads(4)、每分辨率 1 次预热 + 5 帧取中位、仅计 model(x)
   前向。默认线程数版曾有 @384≈@256 失真（线程争抢噪声），受控版才可采信。

## Verify

链路绑定（回执同款输入 input_64.npy [1,3,64,64] 直接喂 torch，probe_chain_binding.py）：

```
corr(torch, truth) = 1.00000000   (maxabs = 0.000000，torch 前向与真值逐位相同)
corr(cheng, truth) = 0.99997571   (复现回执 0.99998)
corr(torch, cheng) = 0.99997571
```

（cheng_final_depth.npy 的 /10000 只改尺度不影响相关系数；回执按 AS 域原值对拍，
raw 范围 cheng [726.6, 1063.2] vs truth [740.0, 1078.4]，与回执一致。）

端到端（testsrc_256.mp4，`--fps 2`）：抽 10 帧，pts_ms=0/500/…/4500，每帧 256x256
深度 npy 落盘，manifest.json 结构齐全；depth_to_layers 产出 v=65536 f=65025，
四边形索引 `f 1/1 2/2 258/258 257/257` 拓扑正确，camera.json 与注释同步。

## 吞吐表

| 引擎 | 分辨率 | 单帧耗时（5 帧中位） | 吞吐 | 条件 |
|---|---|---|---|---|
| torch MiDaS_small | 256×256 | 0.270 s | 3.71 帧/s | CPU, threads=4, 仅前向 |
| torch MiDaS_small | 384×384 | 0.312 s | 3.21 帧/s | CPU, threads=4, 仅前向 |
| 纯 Cheng exe | 64×64 | ~8.5 s | ~0.12 帧/s | 定点全图（回执已知值） |

Cheng 引擎当前慢约 30 倍且分辨率低 16 倍像素——离线产线短期用 torch 供料，
Cheng 定点作为契约锚（corr 0.99998）而非吞吐路径。

## Done

- [x] batch_depth_runner.py 端到端跑通（真实 ffmpeg 抽帧 + torch 离线推理 + manifest）
- [x] depth_to_layers.py 产出合法 OBJ + 相机 json
- [x] 链路绑定：torch vs 真值 1.00000000，Cheng vs 真值 0.99997571（回执复现）
- [x] 吞吐实测 @256/@384 各 5 帧中位入表
- [x] 预处理偏差（无 cv2 → torch bicubic）显式入档（工具 docstring + manifest + 本文件）
- [ ] 真实存量视频批量跑（待提供源 mp4）
- [ ] torch bicubic vs cv2.INTER_CUBIC 对深度输出的敏感度量化（装 cv2 后可测）
- [ ] 分层网格 → 场景流容器的接线（后续任务）
