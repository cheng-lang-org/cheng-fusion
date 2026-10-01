# 立项：R 阶段重建模型接线可行性任务

日期：2026-09-07。状态：propose。归属：资产管线 R 阶段（计划 §5 R1 行后续）。前置研究结论：`reconstruction-study.md`（无可达模型，几何/骨架重建标 blocked）。

## 1. 任务定义

选定**一个具体**重建模型并核查本机可执行性，产出"可执行/不可执行"定谳与算子缺口清单。单视角视频输入 → 逐帧观测增强（相机位姿/稀疏深度或 2D 骨架之一），输出仅作为 B2 观测层的**候选证据**（originClass=reconstructed），不直接生成世界身份。

## 2. 候选模型筛选（按本机可达性排序）

| 候选 | 任务 | 本机依赖 | 算子需求（src/inference 覆盖核查项） | 初判 |
|---|---|---|---|---|
| Depth Anything V2 / MiDaS-small（单目深度） | 逐帧相对深度 | ONNXRuntime/CoreML 权重落盘（~100–400MB） | conv2d/deconv/注意力/插值/归一化 | 算子面最全的 CNN 族，优先核查 |
| RTMPose/BlazePose（2D 骨架） | 人物关键帧骨架 | 同上 + 解码头 | conv/上采样/argmax | 需人物检测前置，链条长一截 |
| VGGT/DUSt3R 类（相机位姿+点图） | 相机轨迹+点云 | 权重大（GB 级）、注意力重 | transformer 全套 | 算子缺口最大，最后核查 |

## 3. 核查步骤（每候选 0.5–1 人日）

1. 权重文件能否离线落盘（本地已有/可从包管理器获取；禁外网直连大文件下载进仓）。
2. `src/inference/{kernel,kernel_ir,model_executor}` 现有算子清单枚举 → 与模型图逐层对账 → 缺口清单（层类型/精度/shape）。
3. 缺口 ≤3 层：估计补层工作量并试跑单帧；缺口大：记录并关闭该候选。
4. 输出：`reconstruction-model-wiring.md`（选定模型、算子对账表、单帧实跑回执或缺口定谳）。

## 4. 验收与边界

- 验收 = 单帧实跑回执（输入帧 hash → 输出张量 hash + 耗时）或明确"不可执行"定谳；两者都算任务完成。
- 边界：不做视频级批处理、不训练/微调、不接付费服务；重建输出不自动获得世界身份（另过验证门）。

## 5. 实施进度（2026-09-08）

- ✅ DepthwiseConv2dFill 已补齐（kernel.cheng，对角核探针 center=150 对角和 PASS）
- ✅ torch 参考深度图 df3e30ea 可复现确认 + f32 二进制基准落盘（midas_depth_ref.f32, 589824B）
- ✅ 全图结构映射 layer_map.json（482 张量）+ 28 个关键模块激活真值（activations/*.npy, float32）
- ✅ 编码器结构实证：MobileNet 式反转瓶颈（DepthwiseSeparable + InvertedResidual），非 ResNeXt
- ⏳ 剩余：MidasNet 全图 Cheng 装配（蓝图 §8-9 就绪）→ 定点 vs 浮点误差标定 → 单帧深度图 Cheng 实跑回执

## 6. 权重装载 Cheng 读取器（2026-09-08）

- ✅ `csg_midas_wload_smoke` PASS：Cheng 实现 MDW1 二进制读取器（.midasw LE 格式 482 条目逐条解析），`pretrained.layer1.0.weight` 864 定点值 SHA-256 `d176f586…` 与 python struct 真值**精确匹配**
- 这是 MidasNet 全图 Cheng 装配的地基：权重张量按名字从 .midasw 运行时读取（字节载荷分离形态），图代码只写结构
