# 模型选型（任务 10 首切片 · 冻结前盘点）

状态：`draft-for-10`。数据侧见 [data_manifest.md](data_manifest.md)；内存唯一权威 = [确定性内存约束卡](../../2026-08-31-kernel-userpath/design/memory_model_constraints.md)（门值 805,306,368 B = 768 MiB，`tools/memory_model_limits.sh`）。提案口径：先验证骨干和训练路径能在资源约束内运行，再选型；不预定装不进门的模型后放宽内存（openspec 提案 §3）。

# 估算非实测

本文第 4、5 节全部内存数字是**按源码结构与公开配置的量级估算**，推导算式逐项列出；**没有一项来自本机 RSS 实测**。任何「容纳」初判都必须经任务 10 verify 要求的「真实候选模型小批执行」实测贴线后才成立。

## 1. 现有推理/训练能力审计表

三档口径：**有源码**（源码实读存在）/ **有测试**（自动化 fixture 级测试）/ **有真权重运行证据**（真实权重回执）。模块名一律不算能力。

| 能力 | 模块（关键行号） | 有源码 | 有测试 | 真权重证据 |
|---|---|---|---|---|
| Qwen2 系 dense 图构建（config.json→ModelGraph，GQA/tied/rope_theta） | `src/inference/hf_model_graph.cheng:2484`（builder）、`:1521`（config 解析）、`:1542-1563`（kvHeads/tied/rope） | ✓ | `hf_dense_transformer_config_smoke`、`hf_model_graph_smoke` | 真权重驱动存在（`model_executor_dense_kv_state_real_weight_sanity_main.cheng:63-88`），本轮未跑（progress.md:10） |
| **model_type 白名单 = 仅 "qwen2"** | `hf_model_graph.cheng:1518-1519` | ✓（硬门） | — | — |
| dense transformer 前向（RMSNorm/RoPE/GQA attention/SwiGLU/logits） | `src/inference/model_executor.cheng:1681`（图门）、`:1702`（单 op）、`:2070-2213`（整链/prefill/decode） | ✓ | `model_executor_dense_transformer_smoke`、`model_executor_dense_kv_state_equivalence_smoke`（ms 级等价权威）、`model_executor_dense_hf_shape_golden_ref_main`、`inference_dense_golden_ref_main`（纯 Cheng 独立 oracle） | 驱动在（同上）；#141 桌面数字（prefill≈7.3s/token、KV decode≈4.8s/token）转引自 `docs/xiaoyou-s6-device-probe-gate.md:17`，**本机 `~/cheng-patches/20260719/141kv/` 不存在，引用待核实** |
| 贪心生成（全重算 + KV 两路，预算/取消） | `src/inference/distributed_engine.cheng:5974`、`:6067`（KV 版）、`:6017/6030`（budget） | ✓ | `distributed_inference_engine_smoke` | 同上（等价断言需真权重跑一次） |
| safetensors 流式加载 + 绑定哈希 | `src/inference/weight_store.cheng:3510`（流式，注释 `:3506-3509`：峰值只含单张量原始字节）、`weight_binding.cheng:10-23` | ✓ | `weight_safetensors_manifest_smoke`、`weight_safetensors_dense_hf_shape_bridge_smoke` | 真权重驱动同上 |
| **权重驻留格式 = TensorQ int32 展开** | `src/inference/kernel.cheng:10-14`（shape+scale+`data: int32[]`） | ✓（决定内存量级） | 同 dense smokes | 同上 |
| 量化档位 none/int8/int4/w4afp8 | `src/inference/model_graph.cheng:29-32` | ✓ | fixture 级 | int4 仅 linear：`model_executor.cheng:1122`（fill）、`:1438-1439`（分派）；**且仅当源文件本身是 int4**（`weight_store.cheng:3478-3484`）；embedding 无 int4 路径（`model_executor.cheng:942` EmbeddingFill 纯 TensorQ）；**仓内无 bf16→int4 转换工具**（tools/ 与 ts-csg/scripts/ 零命中） |
| 分词器（byte-level BPE 运行时 + 工件生成器） | `src/inference/tokenizer.cheng:76/533/559`；生成器 `ts-csg/scripts/tokenizer-fixture-build.mjs` | ✓ | `qwen_tokenizer_smoke`（脚本 `tools/qwen_tokenizer_smoke.sh:30-38` 自动下载+构建） | **工件不在树**：`artifacts/tokenizer/qwen25/tokenizer_qwen25.bin`、`unicode_tables.bin` 当前缺失（gitignored 构建产物，脚本 `:12-14` 注明；S6 文档 `:27` 亦确认）；需先跑脚本再生 |
| 分类/槽位桥（受限 argmax，7 类） | `src/inference/planner_task.cheng:29-36`（7 类常量）、`:64-76`（prompt）、`:130/184`（env 模型路径）、`:216/241`（显式规则入口）、`:252/263`（Result 入口） | ✓ | `planner_task_kind_smoke`（规则金标，任务 03 后绿）、`planner_task_model_classify_main`（rules/failure 金标自动化；模型模式需真权重）、`planner_task_slot_extract_main` | 模型模式未跑（progress.md:10）；且**墙 B**：物化 `DistributedGenerationBudget` 的驱动（classify_main/桥）编译被 admission 拒（baseline.md:25、findings.md:37），运行级证据被既有墙阻塞 |
| KV 分片/传输分布式协议 | `src/inference/distributed_engine.cheng`（:774 起大量 receipt/payload 结构） | ✓ | fixture 级 smokes | 无真多机回执 |
| **训练 = i32 定点线性层 SGD（无优化器状态）** | `src/diloco/train/inner_step.cheng:73`（`DiLoCoInnerSgdLinearFill`）、`:100-103`（每步物化 grad）、`:114-128`（副本+delta） | ✓ | `diloco_inner_negative_smoke`、`diloco_train_infer_loop_smoke`、`diloco_train_settle_smoke` | fixture 级；无真实模型训练回执 |
| 训练=冻结骨干只训 lm_head（Qwen3.8 tiny hybrid） | `src/diloco/train/qwen38_inner.cheng:1-7`（"GDN/attn weights fixture-frozen: no GDN backward, no STE"，只训 i32 lm_head） | ✓ | `diloco_qwen38_tiny_train_smoke`（held-out 为真 softmax NLL，非 mock） | fixture（合成权重），非公开预训练权重 |
| DiLoCo 外环加权 merge + artifact store | `src/diloco/train/outer_merge.cheng:13`；`artifact/store.cheng`；执行器侧接入 `model_executor.cheng:4012-4060` | ✓ | `diloco_artifact_store_smoke`、`diloco_version_infer_smoke`、`cheng_node_diloco_gate_smoke` | 无 |
| **transformer 反向传播** | — | **不存在**（全仓 grep 无 backward；qwen38 冻结骨干） | — | — |
| Adam/动量等优化器 | — | **不存在**（仅 plain SGD，`inner_step.cheng:73`） | — | — |

审计结论：**推理侧** Qwen2 dense 路径源码与 fixture 测试完备，真权重回执有历史引用但不可在本机复核，本轮未复跑；**训练侧**只有「i32 线性层 SGD + 冻结骨干训头部」一种可复现路径，0.5B 级全参微调既无代码也无预算（§5）。

## 2. 候选模型方案

约束（全部来自源码）：`model_type == "qwen2"`（`hf_model_graph.cheng:1518-1519`）；GQA 需 `attentionHeads % kvHeads == 0`（`:1560-1563`）；tied embeddings 支持（`:1567-1572`）；无 qk-norm/op 扩展位。在线核实日期 2026-09-21。

| 方案 | 参数量（bf16） | 架构匹配 | 许可 | 获取路径 | 待核实项 | 准入初判 |
|---|---|---|---|---|---|---|
| A. 基线：`Qwen/Qwen2.5-0.5B` | 494,032,768（0.36B 非嵌入）；24L/hidden 896/14q/2kv/tied/vocab 151936/rope 1e6 | 完全匹配（本机 `~/models/Qwen2.5-0.5B/config.json` 实读；真实权重驱动就是按它写的） | **apache-2.0（已核实，HF 模型页 2026-09-21）** | 本机已有 config+tokenizer 文件；`model.safetensors`（942.3 MiB，S6 文档 `:5`）**本机缺失**，需从 HF 官仓下载并哈希登记 | 下载源的 SHA-256 固定；能否申请到 int4 预量化版且张量名/布局匹配图构建器 | **需量化档位**：bf16(int32 展开) 不容纳（§4.3）；int4 全量化档容纳但缺转换工具与 embedding 路径（§4.4） |
| B. `Qwen/Qwen2.5-0.5B-Instruct` | 同 A 同构 | 完全匹配，零代码改动；分词器工具链默认即从 Instruct 拉 tokenizer.json（`tools/qwen_tokenizer_smoke.sh:30-32`） | **apache-2.0（已核实，HF 页 2026-09-21）** | HF 官仓 | 权重 SHA-256；指令跟随对分类 prompt 的语义质量 A/B（属任务 11/12 评测，不是本门） | 同 A（内存口径同一模型形状） |
| C. 需适配：`Qwen/Qwen3-0.6B` | ~751.6M bf16；28L/1024h/16q/8kv/tied/vocab 151936/rope 1e6（raw config.json 已核） | **不匹配现状**：`model_type "qwen3"` 被白名单拒（`:1518`）；checkpoint 含 q_norm/k_norm 类张量（config 无该字段、张量名待核 `model.safetensors.index.json`），dense 图构建器无对应 op | **apache-2.0（已核实，HF 页 2026-09-21）** | HF 官仓 | q_norm/k_norm 张量名与逐层布局；适配工作量 = 白名单 + op 扩展 + 真权重全链复验 | **现状不准入**；且 751.6M int32 展开 ≈ 2.87 GB，内存门下比 A 更劣，除非走全量化档 |

备选补位（不单列方案）：更小参数档在本白名单内不存在（Qwen2 系最小 dense 即 0.5B）；若 §4 实测后 0.5B 量化档仍不容纳，出路是提案 §4 既定方向——更激进量化（int8/int4 内核扩展）或服务端推理，均为独立立项，不改 768 MiB 门。

## 3. 三档证据总口径（避免「模块名当能力」）

- 每个候选方案进入训练/集成前，必须完成任务 10 verify 的「真实候选模型小批执行」并留回执（模型/权重/驱动哈希 + 实测 load/forward 时间与 RSS）。
- 本轮（01–03）真权重路径未跑（progress.md:10），且墙 B 阻塞物化 budget 的驱动编译；**这不是本切片能宣布完成的项**，移交状态如实记录。
- S6 判据表（`docs/xiaoyou-s6-device-probe-gate.md`）是 Android 真机 go/no-go 门槛表（load ≤30s / forward ≤10s / VmHWM ≤1.5GB），**表中数字是门槛不是实测**；其引用的 #141 桌面回执目录本机不存在。两套门槛不得混用：CSG 内核进程按约束卡 768 MiB 逐相门执行。

## 4. 推理相内存核算（常驻 vs 冷启；全部「估算非实测」）

公式项取自提案「内存与编译约束」推理相行：权重驻留＋量化元数据＋激活＋上下文/KV＋并行问题输出＋加载瞬态；常驻与加载峰分列。常数来源：参数量 494,032,768（HF safetensors 报告）；embed = 151936×896 = 136,134,656，非嵌入 = 357,898,112；head_dim = 896/14 = 64，kv_rows/层 = 2×64 = 128；24 层；门 = 805,306,368 B。

### 4.1 权重驻留（bf16 源 → TensorQ int32 展开，现行唯一真权重路径）

`kernel.cheng:10-14`：TensorQ = shape + scale + `data: int32[]`，即**每参数 4 B**，与源 dtype 无关。

- 全量 int32：494,032,768 × 4 B = **1,976,131,072 B ≈ 1,884.6 MiB ≈ 1.98 GB**（与 S6 文档 `:16` 独立估算一致）
- 占门倍数：1,884.6 / 768 ≈ **2.45×**

### 4.2 其余推理相项（短上下文口径，ctx=512 token）

| 项 | 算式 | 估算值 |
|---|---|---|
| 量化元数据 | 每张量 1 个 int32 scale（数百张量）+ packed 元数据 | < 1 MiB |
| 激活 | hidden 行 896×4 B ≈ 3.5 KB；注意力瞬态 ~14 heads×seq×4 B/层，逐层释放 | 个位数 MiB（取 5 MiB 上界估算） |
| 上下文/KV | 2×(128 rows)×4 B×2(K/V)×24 层 = 24,576 B/token；×512 = 12.6 MB | ≈ 12.0 MiB（2048 token ≈ 48 MiB） |
| 并行问题输出 | logits [1,151936] int32 = 607,744 B/forward（瞬态）+ 受限 argmax 工作区 | ≈ 0.6 MiB |
| **加载瞬态** | 流式加载峰值 = 驻留全集 + 当前单张量原始字节；最大张量 = embed bf16 原始 136,134,656×2 = 272,269,312 B | ≈ 259.7 MiB（S6 `:16` 的 260 MB 同源） |

### 4.3 初判 A：bf16 档（现行实现）

- 常驻稳态：1,884.6（权重）+ 12.0（KV@512）+ 0.6 + 5 + <1 ≈ **1,902 MiB ≈ 2.48× 门**
- 冷启加载峰更高（+加载瞬态同量级）。
- **结论：不容纳。768 MiB 门下 bf16/int32 展开档 0.5B 直接出局，无放宽余地（约束卡 §2.3）。**

### 4.4 初判 B：量化混合假设档（仅 linear int4 packed，源文件本身已是 int4）

算式：packed int4 = 15 值/60-bit 字，每字 int64 8 B ⇒ 8/15 ≈ 0.5333 B/参数（`kernel.cheng:2`、weight_store packed 路径）。

- linear int4：357,898,112 × 0.5333 ≈ 190.9 MB ≈ 182.0 MiB
- embedding 仍 int32（`model_executor.cheng:942` 无 int4 embedding 路径）：136,134,656 × 4 = 544,538,624 B ≈ 519.4 MiB
- 常驻稳态合计：519.4 + 182.0 + 12.0 + 0.6 + 5 + <1 ≈ **720 MiB，距门 48 MiB**——已在约束卡「差值 >50 MB 必须归因」阈值的贴线区，无真实余量。
- 冷启加载峰：720 + 259.7（embed bf16 原始瞬态）≈ **980 MiB > 门**。除非权重源 mmap 常驻（约束卡明言 mmap/量化不得当零 RSS，仍需实测）或 embed 也走 int4（**需新增代码路径 + int4 权重源**）。
- **结论：临界不容纳（冷启）/贴线（常驻），且该档当前缺三样东西：bf16→int4 转换工具、embedding int4 路径、int4 权重源。** 只有「全参数 int4（含 embedding）」的假想档 ≈ 494,032,768×0.5333 ≈ 263.5 MB ≈ 251.2 MiB + 其余项 ≈ **270–280 MiB** 才有明显余量——代码、工具、源三样都待建，量化的数值精度损失另行评测。

### 4.5 常驻 vs 冷启

- **常驻**：权重钉在进程 RSS，每次决策只付激活/KV/logits（MiB 级）+ 前向时间（M 系桌面历史锚 ≈4.8 s/token KV decode，引用待核实）；常驻是唯一能贴 768 MiB 门的模式（量化混合档）。
- **冷启**：每任务付全量权重解码 + 加载瞬态（+260 MiB 级）+ load 时间（S6 门槛 ≤30s go / >90s no-go，Android）；按 §4.4 冷启在两种档位下都超门或贴爆，**冷启模式在选型上要求比常驻更小的驻留足迹或 mmap 方案，必须单独实测贴线**。

## 5. 训练相内存核算项（相对权重参数量 W；全部「估算非实测」）

提案：「训练同样受约束：先测权重、梯度、优化器、激活、检查点和输入缓冲；预算不容纳则该训练配置不准入，不先开炉。」

| 项 | 相对 W 倍数（现状代码） | 依据 |
|---|---|---|
| 权重 | 1×W×4 B（int32 展开） | `kernel.cheng:10-14` |
| 梯度 | 1×W×4 B（每步物化 grad，步内驻留） | `inner_step.cheng:100-103` |
| 优化器状态 | **0×**（plain SGD，无动量/二阶矩；若换 Adam 需 +2×W 的状态另核算） | `inner_step.cheng:73` |
| 瞬态副本 | ≥2×W×4 B（w 工作副本 + 输出 delta + outWeights） | `inner_step.cheng:114-128` |
| 激活 | 线性层 MSE 梯度无需存激活（0× 额外）；**transformer backward 不存在**，若做全模型微调 = 新实现，其激活项 ≈ L×(seq×hidden×常数)，必须先实现先核算 | 全仓无 backward；`qwen38_inner.cheng:1-7` 冻结骨干 |
| 检查点 | 每 outer 步一份 delta blob（1×W×4 B）+ artifact store 持久化 | `outer_merge.cheng:13`、`artifact/store.cheng` |
| 输入缓冲 | xs/ys 批缓冲（seq×batch×hidden 级，小） | `inner_step.cheng:107-112` |

预算判断：
- **0.5B 全参训练：(1+1+2)×W×4 B ≈ 7.9 GB ≈ 10× 门 → 不准入，不开炉。**
- 可准入形态 = 既有能力同构的**冻结骨干 + 小头部训练**（Qwen3.8 路线在 0.5B 上的对应物：只训 decision heads/lm_head 子集）。准入门公式：`4×W_head×4 B + 激活 + 输入缓冲 ≤ 训练相预算份额`；按 200 MiB 份额估 W_head ≤ 200×2^20/16 ≈ **13.1M 参数**。此为估算门槛，实际以小批执行实测 RSS 贴线为准。
- 训练数值能力现状是 i32 定点（scale=1000，`inner_step.cheng:4`），SGD + MSE/NLL 可复现，与提案 §3「先用标准可复现损失」一致；无 bf16 训练栈。

## 6. 选型决策门（不合格配置不准入）

1. **内存超门**：任一相（常驻稳态、冷启加载峰、训练各账目）估算超 768 MiB 且无已落地的量化/mmap 档位 → 不准入；估算贴线（余量 <50 MiB）必须先实测贴线再准入；**禁止抬高门或放宽守卫换 rc=0**（约束卡 §2.3）。
2. **许可不明**：模型权重或任一训练数据源在任务 11 首次开炉前许可仍不明 → 该配置不准入训练；商用条款不明数据不得进任何冻结 split（data_manifest §1.2）。
3. **架构不匹配**：`model_type` 白名单拒、op 覆盖不全（qk-norm 等）、张量名/形状与图构建器不符，且本切片不做代码扩展 → 不准入（方案 C 现状即此）。
4. **证据不足**：候选模型未完成真实权重小批执行回执（哈希绑定）前，不得进入任务 11 的常驻生命周期实现；「有源码/有测试」不替代运行证据。
5. 冻结动作：方案 A/B 的选定、权重 SHA-256、int4 路线取舍，在任务 10 归档时冻结并登记 progress；此后换模型 = 重新过本门。
