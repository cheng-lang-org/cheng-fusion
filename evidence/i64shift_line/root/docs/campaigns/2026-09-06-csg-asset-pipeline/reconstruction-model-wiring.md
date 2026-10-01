# R 阶段重建模型接线核查定谳

日期：2026-09-07。任务书：`task_reconstruction_model_wiring.md`。核查对象：`src/inference/kernel.cheng`（TensorQ 定点张量算子库，13 个 Fill 族算子）+ `device.cheng`（Metal 桥：rmsnorm/paged-attention）。方法：枚举现役算子 → 对照三候选模型逐层需求 → 缺口定谳。

## 1. 现役算子清单（实测枚举，非文档转述）

- 张量：`TensorQ = {shape: int32[], scale: int32, data: int32[]}` —— **int32 定点 Q 格式**，无 float 张量。
- 已有算子：`DenseFill`、`MatMul2dFill`、`Conv2dNchwFill`、`ReluFill`、`MaxPool2dNchwFill`、`SoftmaxLastDimFill`、`Argmax`、`TensorZeros/FromData/Clone/Validate`、TurboQuant 打包族。
- Metal 桥：`rmsnorm`、`paged_attention`（LLM 服务向，非视觉向）。
- 上层：`model_graph`/`hf_model_graph`/`qwen38_forward` —— 全部为 LLM（Qwen3.8）形状，无视觉编码器图。

## 2. 三候选对账

| 候选 | 可复用算子 | 缺失算子 | 定谳 |
|---|---|---|---|
| MiDaS-small（单目深度，ResNet/Swin 混合） | Conv2d✓ Relu✓ MaxPool✓ Dense✓ | LayerNorm、bilinear 上采样、残差融合 concat | **缺口 3 类，最优先候选** |
| RTMPose（2D 骨架） | Conv2d✓ Softmax✓ Argmax✓ | 同上 + SimCC 解码头 | 依赖人物检测前置，链条长，次选 |
| Depth-Anything-V2 / VGGT（ViT/Transformer） | MatMul✓ Softmax✓ | LayerNorm、GELU、多头注意力装配、patch-embed 大核卷积、bilinear；且 ViT 对 int8/int32 定点精度极敏感 | 定点化精度风险高，缓行 |

## 3. 定谳与工作量

1. **选定候选 = MiDaS-small 谱系单目深度**：缺口 3 类算子（LayerNorm/双线性上采样/concat），定点 Q 格式下每类约 100–200 行纯 Cheng；权重需离线转换工具（python 一次性导出为 canonical int32 Q 格式对象 + CID 落库，python 属源资产创作边界，可列账）。
2. **精度风险需先标定**：int32 定点 vs float 参考的深度图误差标定（MAE/相对误差）单帧实验，误差超合同（待定，建议相对误差 ≤5%）则该候选降级为"需 float 张量支持"——float 张量是 `src/inference` 的结构性缺口，非本任务可修。
3. **权重落盘**：MiDaS-small 权重 ~200MB，离线获取后不进 git（体积），以内容 CID 注册进权重存储（`weight_store.cheng` 已有机制）。
4. **工作量**：3 类算子 + 权重转换器 + 单帧跑通 ≈ 3–5 人日；加精度标定 ≈ 5–8 人日。超此规模（VGGT 类）不并入。

## 4. 边界重申

本任务产出止于"单帧深度图实跑回执"；深度图作为 B2 观测候选（originClass=reconstructed）进观测层，**不**自动生成世界几何身份，世界侧消费另过验证门。

## 5. 实施更新（2026-09-07）

§3 的三类缺失算子已全部补齐并验证：`src/inference/kernel.cheng` 新增 `LayerNormFill`（int64 均值/方差 + IntSqrt 定点标准差 + gamma/beta 仿射，beta 可空）、`BilinearResize2dNchwFill`（1<<16 定点权重 + align_corners=False + 边缘钳制）、`ConcatChannelsNchwFill`（NCHW 通道拼接）。算子冒烟 `csg_inference_ops_smoke` PASS（LayerNorm 输出对拍 ±0.02、双线性角点/插值点、拼接、int 越界守卫）。

剩余到"单帧实跑"：MiDaS-small 权重离线转换器（python，源创作边界）→ canonical 权重对象 CID 落库 → model_graph 装配 → 单帧深度图回执。预估 2–3 人日。

## 6. 权重转换器落地（2026-09-07）

`tools/midas_weight_convert.py` 已实现并自测通过（合成 state_dict roundtrip + 模块生成 + SHA-256 CID）。

- 交接格式 `.midasw`（torch 侧导出契约）：magic "MDW1" + 条目数 + 逐条目 [nameLen, name, dims, scale(十进制定点分母,=1000), count, i32 数据]。
- 输出：`weights.cheng`（canonical 权重清单模块，逐层 Name/Dims/Scale/Data 函数）+ `weights.cid`（模块内容 SHA-256，权重对象身份；模块自身不含 CID 以避免自指）。
- 剩余阻塞不变：MiDaS-small 权重文件需 torch 环境导出（本机无 torch，属外部依赖）；`observe` 后的单帧深度图实跑回执待权重到位。

## 7. 真实权重转换完成（2026-09-07 深夜）

torch 2.8.0 (CPU) + isl-org/MiDaS v2_1 release 实测：`midas_v21_small-70d6b9c8.pt`（85.7MB，21,394,729 参数，482 张量）→ 定点化（scale=1000，round(x*1000)）→ `.midasw` → canonical `weights.cheng`（119MB）+ `weights.cid = 72122493dc72557166e3ceadc525b4738ae7c91cbeadf952812b61839bacde25`。产物在 `reconstruction/midas_v21_small/`。

剩余到单帧实跑：MidasNet 前向图 Cheng 装配（encoder 24 conv 层 + decoder 上采样链，用已补齐算子 + 现役 Conv2d/Relu 可组装）——下一任务。注意：119MB 权重以 .cheng 源码形态编译可能触及编译器文件上限，届时改走「权重量为运行时数据（bytes + CID）+ 形状/元数据为 .cheng」的载荷分离形态（合同 §2.1 本就要求权重按字节载荷处理）。

## 8. 单帧实跑回执·增量 1（2026-09-07 深夜）

MidasNet 第一层（pretrained.layer1.0.weight [32,3,3,3] scale=1000）× 真实视频帧（sample_cfr_1s.mp4 首帧 64×64 RGB）Conv2d 实跑 PASS：

- 实现：`src/tests/csg_midas_layer0_smoke.cheng`（显式循环卷积，RoundDiv 逐乘积语义与现役 Conv2dNchwFill 对齐，零填充 NCHW）
- 对拍：python 整数参考实现输出 [271, 249, 249, 248] 逐位一致
- 回执：输出 131072 值 SHA-256 = cabe8a39a3d3d096772a02fbe2a3228c9a9a5bb43f1a5927c61d10797a3bffa1（日志 `VERIFY_midas_layer0_receipt.log`）
- 参考/帧数据：`reconstruction/midas_v21_small/{midas_layer0_ref.json, midas_layer0_ref.sha, frame64.rgb}`

发现并绕开：kernel.Conv2dNchwFill 在 C 车头下存在无插桩可触发的隐形 Err（全路径插桩仍复现）——MidasNet 后续层装配继续用显式循环实现（语义已有参考对拍背书），kernel 内该 quirk 归 C 车头线认领。

## 8. MidasNet 全图结构映射（2026-09-08，layer_map.json 已存档）

482 张量按模块分组（装配顺序即依赖序）：
- `pretrained.layer1`：stem（conv1 [32,3,3,3] + BN）+ ResNeXt 瓶颈块 layer1.3.0 / layer1.4.0-2（各组 12/18/18/18 张量，含 split-32 组卷积）
- `pretrained.layer2/3/4`：下采样 + 瓶颈块（各 18×N 张量），输出 1/4、1/8、1/16 分辨率特征
- `scratch.layer1-4_rn`：4 个 1×1 投影（融合多尺度特征）
- `scratch.refinenet4→1`：4 个上采样精化级（各 out_conv + 2 resConfUnit）
- `scratch.output_conv.0/2/4`：最终 3 卷积 → [1,32,1,1] 相对深度图

装配注意事项：① ResNeXt 组卷积需按 groups=32 切片分组卷积（现有 Conv2dFill 为全通道，需组化包装或逐组调用后 concat——Concat 已绿）；② BN 层推理期折叠为仿射（权重合并进相邻卷积，免实现 BN）；③ 编译器隐患：while+未初始化计数器在此车头毒化，一律 for-in。

## 9. MidasNet v2.1-small 完整块分类（torch state_dict 实证，全图装配输入）

- **stem**: layer1.0 conv[32,3,3,3] → layer1.1 BN(32) → ReLU
- **layer1.3.0**: 2-conv 瓶颈 (conv3x3+BN, conv1x1+BN ×2 组 = 4 weight/2 bias/2 BN)
- **layer1.4.0-2 ×3**: 3-conv 瓶颈 (6 weight/3 bias/3 BN 各)
- **layer2.0.0-2 ×3 / layer3.0.0-4+3.1.0-4 ×10 / layer4.0.0-5+4.1.0 ×6**: 同构 3-conv 瓶颈，分辨率 1/4→1/8→1/16，通道递增
- **scratch.layer1-4_rn**: 4 个 1×1 投影 → 256 特征融合
- **refinenet4→1**: 逐级上采样融合（out_conv 3×3 + resConfUnit1/2 各 conv 1×1+scale），输出相加 path_4+layer4_rn 起步
- **output_conv.0/2/4**: conv3×3→ReLU→上采样×2→conv3×3→ReLU→conv1×1→ReLU(non_negative)

装配所需全部算子已绿：Conv2d（显式循环版）、ReLU（ReluFill）、LayerNorm（BN 折叠后不需要，BN 折叠进 conv 权重：w'=w·γ/σ, b'=β+(b−μ)·γ/σ）、Bilinear 上采样、通道拼接、1×1 conv 用 Dense/MatMul。
全图装配预估：约 1000-1500 行 Cheng + python 逐层参考对拍，2-3 个工作日。

## 10. 编码器结构实证修正（2026-09-08）

checkpoint 逐张量检查推翻「ResNeXt 假设」：MiDaS v2.1-small 编码器为 **MobileNet 式反转瓶颈结构**——
- stem: conv3×3 [32,3,3,3] + BN + ReLU
- 基础块（layer1.3.0 等）: conv_dw [C,1,3,3] 深度可分离 + BN + conv_pw 1×1 降/升通道 + BN
- 反转瓶颈（layer1.4.0-2 等）: conv_pw 升通道 + BN + conv_dw + BN + conv_pwl 降回 + BN（ResNet 式残差相加）
- 各 stage 间 stride=2 下采样（深层首块 conv_dw stride 2）

对装配的影响：①深度可分离卷积（DepthwiseConv2d）为第 4 类需补算子（逐通道独立卷积，实现简单）；②BN 推理期折叠不变；③无 GroupNorm/SE，比 ResNeXt 路线更简单。全图约 30-40 个块实例，纯 Cheng 组装预估 3-5 个工作日（蓝图+算子已就绪）。

## 11. DepthwiseConv2d 补齐（2026-09-08）

第 4 类算子 `DepthwiseConv2dFill`（MobileNet 式深度可分离卷积核心）落地并验证：[C,1,3,3] 核逐通道 3×3 卷积、RoundDiv 逐乘积语义与 Conv2d 一致、零填充、对角恒等核探针 center=150 对拍 PASS。至此 MiDaS v2.1-small 所需全部 4 类算子（Conv2d/Relu 现役 + LayerNorm/Bilinear/Concat/Depthwise 补齐）全绿。

## 12. 单帧深度图 torch 参考回执（2026-09-08）

MidasNet_small(features=64, backbone=efficientnet_lite3, exportable, non_negative, expand) **全量 482 张量加载成功（missing=0/unexpected=0）**，真实视频帧（sample_cfr 首帧 → 384×384 bicubic + 0.5/0.5 归一化）前向 PASS：

- 深度图 [1,384,384]，min 0.0 / max 837.1（non-negative 逆深度）
- 回执 SHA-256(4dp json) = df3e30eaf4795fc4c4fbdb903dda1a27bd1f5bb36a4427512ca1e9db590ddb69
- 产物：`reconstruction/midas_v21_small/{midas_depth_ref.json, midas_depth_ref.sha}`

此为 Cheng 定点实现的逐层对拍黄金参考。剩余：MidasNet 全图 Cheng 定点装配（蓝图 §8-9 就绪）→ 定点 vs 浮点误差标定 → 单帧深度图 Cheng 实跑回执。
