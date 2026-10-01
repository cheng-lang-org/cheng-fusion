# Cheng DiLoCo 去中心化训练 + 推理完整开发方案

状态：**apply 中**（2026-08-23）。D1–D7 缩小竖切已落地。D8 已在授权的 sg/dosg 上跑通内步+外步 delta 合并；QUIC 因两机无 sha_ni 未跑。

## 现状审计（以源码为准，不是论文）

D1–D7 缩小竖切已落地：artifact 真字节、i32 SGD 内步、token 加权外合并、Qwen3.8 tiny hybrid 冻结 GDN + 可训 lm_head、held-out NLL 结算、驻留专家 token 块路由+副本 failover。仍缺 D8 真双机；27B 反传仍是 C 类。

| 层 | 文件 | 已证 | 未证 |
|---|---|---|---|
| 核心状态 | `src/diloco/core/diloco.cheng` | OpenJob / JoinCohort / Lease / Barrier / OuterDelta / MergeCommit / GlobalVersion / lineage；CID 绑定；stale version hard-fail | `PublishMergeCommit` **只登记** leader 提交的 `mergedModelRef`，不读 delta 张量、不做加权平均 |
| 线协议 | `src/diloco/protocol/wire.cheng` | `/cheng/diloco/1.0.0`；9 种消息；inner_step_budget / weight_num/den | 载荷是文本信封，不是 safetensors |
| Host/Client | `src/diloco/host/diloco_{host,client}.cheng` | QUIC 上自动 leader 推进 barrier→delta→merge | autoLeader 的 delta **仍是预先塞好的 ArtifactRef** |
| 节点 | `src/apps/chain_node/cheng_node.cheng` | diloco_*_state 落库、ctl `diloco open/join/lease/delta/merge` | 权重是 tag 拼出来的 stub CID |
| Smoke | `diloco_state_smoke` / `diloco_wire_smoke` / QUIC two-proc / `cheng_node_oracle_diloco_evomap_smoke` / `diloco_train_infer_loop_smoke` / `diloco_qwen38_tiny_train_smoke` | 两工人 outer_step 递增；linear MSE 下降；Qwen3.8 tiny NLL 下降 | 27B 反传、真双机 WAN |
| 推理栈 | `hf_qwen38_graph` / `gated_delta_net` / `dflash2_draft` / `distributed_engine`（含 `dflash2` 算法名） | Qwen3.8 图与投机解码占位；D4 只读消费 hybrid mini 前向 | 生产 27B 反传仍未做 |
| DePIN | `inference_{scheduler,settlement,specdecode,transport}` | KV shard / 专家并行 / 结算收据 | 不消费 DiLoCo GlobalVersion |

结论：缩小面 D1–D7 已证。D8 双机内步+外步 delta 已在 sg/dosg 实证；QUIC 被 sha_ni SIGILL 挡住，不算 QUIC 完成。

## 一页结论

不把中心化 27B/V4-Pro 往公网拆注意力。默认负载是 **可驻留的小专家**（先玩具稠密/GDN，再 Qwen3.8 缩小图）。训练走已有 DiLoCo 作业；推理只加载 `GlobalVersion.modelRef` 的真权重。公网只传 **外步 delta CID**，不每层 allreduce。

证明面与真落点分开写。D1–D5 可在单机两进程做完；D6 结算接现有 DePIN；D7 专家驻留；D8 真双机 WAN 等你授权机器。

## 全局流程图

```
[已有] DiLoCo 作业/队列/租约/屏障/delta CID/merge CID/QUIC
                         |
                         v
D1 artifact 真字节 <--> weight_store 页哈希
                         |
                         v
D2 内步执行器（本地 N step SGD/AdamW）--> modelDelta 真张量 CID
                         |
                         v
D3 外步合并（按 tokenCount 加权 + 外动量）--> 新 GlobalVersion 真权重
                         |
          +--------------+--------------+
          v                             v
D4 绑 Qwen3.8 缩小混合图           D5 用 versionCid 推理 greedy
          |                             |
          +--------------+--------------+
                         v
              D6 训练外步进 DePIN 结算（loss/eval 收据）
                         |
                         v
              D7 L0 本地小模型 + L1 专家各跑独立 DiLoCo job
                         |
                         v
              D8 真双机 QUIC cohort（C 类，需授权）
```

Qwen3.8 现有 W1–W4 是 D4/D5 的图/核依赖，不在本方案里重做；本方案消费它们的 ModelGraph，不改 `primary_object_plan` / `cheng_cold.c`。

## 阶段（files / action / verify / done）

### D1 工件仓：ArtifactRef ↔ 真字节

- files: `src/diloco/core/diloco.cheng`；新建 `src/diloco/artifact/store.cheng`；`src/tests/diloco_artifact_store_smoke.cheng`；`tools/diloco_artifact_store_smoke.sh`
- action: `DiLoCoArtifactRef` 的 blobCid/payloadLen 必须等于落盘 safetensors/raw 页哈希；禁止 stub tag 冒充；读写走 `weight_store` 已有 range/hash 口径；哈希漂移 hard-fail。
- verify: 写入两份相同张量 → 同一 blobCid；改一字节 → Validate hard-fail；smoke 经 `cheng.stage3 system-link-exec --link-providers` rc=0。
- done: 任何 OuterDelta/MergeCommit 引用的 ref 都能从 store 取出与 CID 一致的字节。
- 边界: 不是 27B 权重托管，先用固定小张量。

### D2 内步执行器

- files: 新建 `src/diloco/train/inner_step.cheng`；`src/tests/diloco_inner_step_smoke.cheng`；`tools/diloco_inner_step_smoke.sh`
- action: 给定 base `modelRef` + 本地 token 批，跑 **恰好** `lease.innerStepBudget` 步（步数不符 hard-fail）；写出 `modelDeltaRef`/`optimizerDeltaRef` 为 **参数差** 真字节；记录 sampleCount/tokenCount。优化器先 SGD，后 AdamW 状态进 optimizer artifact。
- verify: 同种子两跑 delta 哈希一致；步数 0/超预算/空批 hard-fail；不写网络。
- done: `SubmitOuterDelta` 的 ref 必须来自本执行器，chain_node 的 tag 拼 CID 路径删除或闸死。
- 边界: 玩具规模（hidden 个位数～百），CPU；不是 27B 反传。

### D3 外步真合并

- files: 新建 `src/diloco/train/outer_merge.cheng`；改 `DiLoCoPublishMergeCommitFill` 增加「合并收据」绑定；`src/tests/diloco_outer_merge_smoke.cheng`；`tools/diloco_outer_merge_smoke.sh`
- action: 读取本 outer step 全部 OuterDelta 真字节；权重 = Σ(w_i·θ_i)/Σw_i，`w_i` 用已有 `tokenCount`（与 `weightNumerator/Denominator` 一致，不一致 hard-fail）；外动量按 DiLoCo 论文 Nesterov 记在 optimizer artifact；leader **不得**再手填 merged ref。
- verify: 两工人对称数据 → 合并结果与单机全量一步外循环对拍哈希；缺一份 delta → quorum hard-fail；伪造 merged CID → 收据漂移 hard-fail。
- done: MergeCommit 的 modelRef 只能由 outer_merge 产出。
- 边界: 单机两 cohort 成员；不是 WAN。

### D4 接到 Qwen3.8 缩小混合图

- files: `src/inference/hf_qwen38_graph.cheng`、`gated_delta_net.cheng`（只读消费）；新建 `src/diloco/train/qwen38_inner.cheng`；`src/tests/diloco_qwen38_tiny_train_smoke.cheng`
- action: 用缩小 `hf_qwen38_hybrid_mtp` 图（层数/hidden 降到可在 1GiB 内反传）做 D2 内步；线性层走现有 GDN CPU 参考；禁止把 27B 配置当默认。
- verify: 一 outer step 后 versionCid 变；held-out 交叉熵相对 base **下降**（真 loss，禁 mock）；`gated_delta_net_smoke` / `hf_qwen38_config_smoke` 不回归。
- done: **已落地**（2026-08-23）。`src/diloco/train/qwen38_inner.cheng` + `src/tests/diloco_qwen38_tiny_train_smoke.cheng` + `tools/diloco_qwen38_tiny_train_smoke.sh`。生产 64 层 plan 仍钉 `HfQwen38ValidateTextConfig`；mini 4 槽消费 interval-4 节奏；GDN/attn 冻结，DiLoCo blob=i32 lm_head（vocab×hidden+bias）。held-out NLL micros 6931472→6184637，argmax 命中 target 7/21。`qwen38_forward_smoke` 仍绿。
- 边界: 缩小图 ≠ 27B 生产训。27B 内步属 C 类（显存/时间）。

### D5 合并版本可推理

- files: `src/inference/model_executor.cheng`（只加加载 CID 入口，不改算法）；`src/tests/diloco_version_infer_smoke.cheng`
- action: `GlobalVersion.modelRef` → executor greedy 若干 token；输出绑定 versionCid；version 漂移 hard-fail。
- verify: 训练前/后各 generate；后向 loss 更低或同一 prompt 的 NLL 更低；distributed_inference_engine_smoke 不回归。
- done: 训练闭环的验收是 **可加载的权重 + 可测量的 NLL**，不是 lineage_count++。
- 边界: greedy 短生成；不接 DFlash2 生产服务。

### D6 训练外步进 DePIN 结算

- files: `src/libp2p/protocols/depin/inference_settlement.cheng`（只加训练记录类型）；`src/tests/diloco_train_settle_smoke.cheng`
- action: 一次成功 outer merge 产生结算记录：jobBundleCid、outerStep、tokenCount 总和、eval NLL 哈希、versionCid；字段漂移 hard-fail。不提交真链。
- verify: 正例 + ledgerHash/versionCid 漂移；既有 depin settlement smoke 不回归。
- done: **已落地**（2026-08-23）。`DepinDiLoCoTrainEvalNllHash(nllMicros)` 打上 `nll_micros.v1` 标签；`diloco_train_settle_smoke` 走 D4 Qwen3.8 tiny 闭环，nll 6931472→6184637 后出收据。零 NLL 哈希硬错；token/versionCid/schema/evalMetricHash 漂移 Validate 硬错；NLL/versionCid/outerStep 变化改 recordHash。记录类型字段未改。
- 边界: ≠ 链上打款。真链属既有 DePIN 方案 C 类。

### D7 专家驻留（去中心化形态）

- files: 新建 `src/diloco/expert/resident.cheng`；`src/tests/diloco_expert_route_smoke.cheng`
- action: 每个专家一个 DiLoCo job（自有 version lineage）；L0 小模型本机推理；路由只发 top-k 专家的 token 块；**禁止**跨 peer 张量并行切注意力头。
- verify: 专家节点停机 → 无副本则 hard-fail，有 2 副本则切副本 versionCid；路由不把 hidden 按层同步到 WAN。
- done: **已落地**（2026-08-23）。`src/diloco/expert/resident.cheng` + `tools/diloco_expert_route_smoke.sh`。每专家一个 DiLoCo job；L0 用 Qwen3.8 tiny last-hidden；top-k 只发 token 块；`DiLoCoExpertHiddenLayerSyncForbidden` 硬错。专家 0 双副本：主副本=合并 versionCid，备副本=genesis；主副本 down 后 hop.replicaIndex=1 且 versionCid 切到 genesis。专家 1 单副本 down → RouteFill Err。Apply 走同一 ArtifactStore/GlobalVersion。
- 依赖: D5。
- 边界: 专家规模仍是缩小图。

### D8 真双机 cohort（C 类）

- files: 现有 `diloco_quic_*` 探针升级为正式 gate，不新协议。
- action: 两台机器各跑 inner step，外步只传 delta 工件；RTT 计入收据。
- verify: 墙钟 inner/outer 分离（内步期间无跨机张量流）；合并哈希与单机对拍重放一致。
- done: **部分落地**（2026-08-23）。授权节点 `ssh sg` 186.244.238.116 与 `ssh dosg` 165.245.176.65。`tools/diloco_wan_two_host_gate.sh`：两机各跑 Cheng inner SGD（无跨机张量），outer 才 scp `delta-*.pack`，sg 上 `DiLoCoOuterWeightedDeltaFill` 与重放 `cmp` 一致。RTT 9.742ms 写入收据。QUIC 正式路径未跑：两机 CPU 无 `sha_ni`，带 artifact CID/TLS 的 linux ELF 在 `sha256rnds2` SIGILL。`src/tests/diloco_wan_two_host.cheng` 保留给有 SHA-NI 的机器。
- 边界: 家用 WAN 只做外步；不承诺 27B 或 V4-Pro。禁止把 QUIC 写成已完成。

## 统一门禁（D1–D7）

- 新 smoke：`cheng.stage3 system-link-exec --link-providers` 编译运行 rc=0。
- 既有：`diloco_state_smoke`、`diloco_wire_smoke`、`cheng_node_oracle_diloco_evomap_smoke`、`hf_qwen38_config_smoke`、`gated_delta_net_smoke`、`distributed_inference_engine_smoke` 不回归。
- 禁止 Mock loss/权重；NLL 必须从真实前向算出。
- 不编整个编译器；不碰 `primary_object_plan` / `cheng_cold.c` / `cold_parser.c` / `typed_expr`。
- 撤回共享文件禁止 `git checkout --` / `git restore`。

## 禁止项

- 用公网切 Qwen3.8/DeepSeek-V4 注意力头冒充 DiLoCo。
- MergeCommit 继续接受与 delta 字节无关的 stub CID。
- 内步步数与 lease.innerStepBudget 不一致还提交 delta。
- 把 lineage_count 或 outer_step 递增当成训练成功。
- 27B/399GB/V4-Pro 内步未授权硬件就开跑。
- 把 D8 写成已完成。

## 和既有方案的关系

- `cheng-depin-inference-production-delivery.md`：管推理证明面与 GLM-5.2 分片。本方案 **训练闭环** 接它的结算，不替代它的 C 类 399GB。
- task_plan Qwen3.8 W1–W4：D4/D5 的图依赖。W 未完则 D4 只许用已绿的缩小图子集，不许假绿。

## 确认后的第一刀

只 apply **D1**（工件仓）。D2 起等 D1 smoke 绿且你确认下一阶段。
