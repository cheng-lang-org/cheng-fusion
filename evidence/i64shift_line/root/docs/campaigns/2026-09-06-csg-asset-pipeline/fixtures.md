# CSG 资产管线样例夹具台账

持久资产目录：`docs/campaigns/2026-09-06-csg-asset-pipeline/fixtures/`。样例与生成器属正式交付资源，不得被暂存清理删除；哈希与属性冻结见 [capabilities.json](capabilities.json)，任何重生成须同步更新哈希并记录原因。

## 目录

- `glb/static_box.glb` — 静态 GLB 正例：层级 Root→(BoxA, BoxB 非均匀缩放)、TRIANGLES、PBR、透视摄影机。官方 Khronos validator 0 错 0 警（2026-09-06 实测）。
- `glb/skin_anim.glb` — 动态 GLB 正例：3 关节 skin + inverseBindMatrices、JOINTS_0(ubyte)/WEIGHTS_0(f32)、1 morph target（POSITION 带边界）、LINEAR 动画 4 通道（根平移/两关节旋转/morph weights）、时间采样 min/max 齐备。validator 0 错。
- `media/sample_440hz_2s.wav` — PCM s16le 48kHz 单声道 2s；含 LIST/INFO 附加块（chunk 遍历正例）。
- `media/sample_cfr_1s.mp4` — H.264 CFR 24fps yuv420p + AAC 48kHz，24 帧，1.0s。
- `media/media/sample_vfr_bframes.mp4` — 真实 VFR（帧距 1/24→2/24 跳变）+ B 帧（B33/P14/I1 实测）。
- `media/sample_offset_start.mp4` — 非零起始（start_time 0.5/0.476）+ 编辑列表 + AAC priming。
- `tools/gen_glb_fixtures.py` — 确定性 GLB 生成器（源创作边界工具，python3 标准库零依赖）。
- `negative/` — 格式反例（C1/B1 实施时填充：坏魔数、越界 accessor、extensionsRequired 未知、截断 buffer、非 PCM WAV、坏 box MP4）。

## 反例与派生夹具纪律

- 反例是"合法文件的最小破坏"，由生成器或二进制补丁产出并记录破坏点；不手编二进制。
- 探针/负例运行时暂存 `src/tests/`（cold 链要求包根 src/ 下），跑完即删（fishing_gate 同款 staging 流程）。
- 独立参考值（期望顶点/关节/时间戳表）由生成器同源输出为 JSON/文本，供 Cheng 导入器对拍；参考不由导入器自身输出派生。
