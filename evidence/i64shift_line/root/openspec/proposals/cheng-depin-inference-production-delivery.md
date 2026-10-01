# Cheng-DePIN 分布式推理引擎生产级交付路线图

状态：**propose**（2026-06-28 用户确认走"先审计缺口 + 产出分阶段交付路线图，不盲改代码"路径。本总纲为 propose 阶段产物，待用户确认后逐阶段独立走 propose→确认→apply→archive 闭环）。

## 进度快照（2026-06-28 实测审计）

**已闭合的"证明/收据层"（receipt proof layer，本仓实测）：**
- 分布式 evidence → DePIN distributed manifest → pipeline LP frame → qconn canonical 120 字节 frame → RWAD submit/finalize → certified dispatch receipt 全链（success/hash drift/payload drift/signer fail/peer link fail 门禁齐）。
- KV shard receipt：跨节点 KV page transfer evidence、qconn 固定二进制帧、residency receipt、schedule proof、store root、磁盘 WAL + store snapshot/operation proof、本机文件系统单写者锁 + 恢复入口。
- residency/settlement daemon：supervisor tick、repair scheduler tick、repair service tick（三副本 quorum 2/3 修复）、bounded replication retry（quorum attempt hash）、quorum durable file `.csq1`、ledger quorum、replica durable ACK、settlement binary ledger receipt、settlement ledger remote replication ACK。
- spec-decode certified receipt：`DepinSpecDecodeCertifiedReceipt` 绑定 DePIN session + distributed manifest + draft/verify plan + KV page transfer evidence + draft/verify result + verify run receipt；GLM52 MTP 单步/多步 draft/verifier audit。
- 权重 store：safetensors header/range/payload hash receipt、仓库级 payload hash preflight、单 tensor range loader、device file-range buffer load receipt、Metal provider file-range buffer handle（chunked staging）、首个 kernel 消费 provider buffer 闭环（vector add / W4 raw / W4 decoded scale）、tensor page load receipt + page-set execution gate。
- HF 真实 index：`PhalaCloud/GLM-5.2-W4AFP8` full inventory receipt（`receipt_hash=494837175126901459`、`index_hash=1346998315678373320`、`expected_shards=41`、`expected_bytes=399693862592`、`replay_ok=1`）。
- 量化执行：W4AFP8 raw I8 + decoded scale、packed int4 Metal kernel、HF/GLM mixed int4、MoE route + expert parallel shard 绑定、多层 route set、tensor parallel head 分片覆盖、activation tensor payload wire。
- paged KV：Metal page-buffer provider（key0-3/value0-3/pageTable 真实 Metal buffer）、pageTable/K/V/page-level K/V 三份 receipt 进 execution gate、HF executor Metal decode 路径接入 native page-buffer kernel。
- daemon CLI：`depin_residency_settlement_daemon_main.cheng` 支持 `--health/--build-events/--run-once/--run-until-idle/--max-cycles`，真实编译为纯 Cheng binary。
- OS service spec：`.csos1` v3 launchd/systemd `.service + .path` 双文件 receipt，trigger 监听 `.ckvh1/.csrd1/.cssv1`。

**★审计核心结论：** 引擎的"证明/收据层"已大规模闭合——每一类生产语义都有可校验/可复现/可失败的 receipt facts。**生产级交付的剩余缺口不在"证明面"，而在"真实外部落点"与"真实长稳执行"**：receipt 证明某个事实可被校验，但还没有把这个事实落到真实外部链/真实远端节点/真实 399GB shard/真实 Metal 长稳。这批缺口按阻塞约束自然分成三类（A 可达 / B 需 op-lane / C 需外部资源），见下「缺口审计三分类」。

## 一页结论

不重写、不开新分支、不撞 op-lane：在现有 receipt 证明层之上，按"阻塞约束"而非"功能优先级"分阶段交付。生产级交付不是再加一批 receipt，而是把已证明的事实接到真实外部落点 + 真实长稳执行，并在过程中遵守两条铁律：

> **① 证明面与真实落点分离标注：** 每个阶段必须诚实区分"receipt 证明面闭合"与"真实外部落库/长稳执行"。证明面可在纯 Cheng 业务层闭合（A 类，可达）；真实落点受 op-lane zero-C 结构锁（B 类）或外部资源（C 类）阻塞。**禁止把证明面写成真实落库。**
>
> **② 不撞 op-lane 双层战场：** `primary_object_plan.cheng` / `lowering_plan.cheng` / `compiler_csg.cheng` / `cheng_cold.c` / `cold_parser.c` / `program_support_backend.cheng` / `typed_expr.cheng` 全 LIVE（op-lane combo A SoA WIP + cold seq WIP）。A 类阶段只动 `src/libp2p/protocols/depin/*` + `src/inference/{device,weight_store,paged_kv_cache,model_executor,hf_model_graph}.cheng` + `src/libp2p/cli/*`，不碰上述共享核心；承重验证用 `artifacts/bootstrap/cheng.stage3 system-link-exec --link-providers`（小 repro + 9 项推理/DePIN host smoke + `run-stage23-libp2p-smokes depin_inference`），不编整个编译器。

## 缺口审计三分类（每个缺口 = 已有证明层 + 真正缺失 + 落点文件 + 阻塞类别）

| # | 缺口 | 已有证明层（实测） | 真正缺失 | 落点文件 | 类别 |
|---|---|---|---|---|---|
| 1 | settlement 链上/账本落库 | `inference_settlement.cheng` 已有 `DepinSettlementLedger`/`LedgerRecord`/`chainHash`/`chainId`/ledger file receipt/replica receipt，`chainHash=TextHash(adapter.chainId)` 作为绑定字段进 ledger/record/receipt hash | **外部链 anchor submission receipt + confirmation verify receipt**：`chainHash` 只是 chainId 文本 hash，没有任何函数把 ledgerHash 提交到外部链/账本服务并绑定 anchorTxHash + blockConfirmations + 验证漂移 hard-fail | `inference_settlement.cheng` | **A**（证明面可达） |
| 2 | 跨进程常驻 residency store 服务 | OS service spec `.csos1` v3（launchd/systemd `.service+.path`）+ daemon CLI `--run-once/--run-until-idle`（批处理模式）+ health receipt `.cshl1` | **always-on registered service receipt**（plist 实际 install + launch + 心跳 pid + reboot 存活证明）+ **network replication receipt**（远端副本 ledger byte hash + quorum over real network）。当前 daemon 是 run-once 批处理，不是注册并常驻的 OS service | `inference_transport.cheng` + `depin_residency_settlement_daemon_main.cheng` | **A**（证明面可达）/ **C**（真实远端网络复制） |
| 3 | 超大 tensor mmap/page streaming | `weight_store` 有 safetensors header/range/payload hash + `ReadFileRangeBytes` chunked 读取；`device.cheng` 有 Metal file-range buffer（`newBufferWithLength + contents` 分块） | **mmap provider ABI 原语**（Darwin `mach_vm_map` / Linux `mmap` @importc，复用现有 `lseek/read` @importc 模式）+ **page streaming decode receipt**（按页 mmap + 按需 decode + 真正零拷贝路径，区别于当前 chunked read 到 staging buffer） | `device.cheng` + `weight_store.cheng` | **A**（ABI 原语可达）/ **C**（真实 399GB mmap 长稳） |
| 4 | 真多 peer/multi-node QUIC provider 回归 | transport 是 peer-id 基（`peer:a/peer:b`）经 qconn canonical frame，loopback 已证多 peer link | **真实 QUIC WAN multi-node provider 回归**：远端 QUIC listener + 真实握手 + WAN RTT + 跨机 KV shard 调度。当前 loopback 证 link 不证 WAN | `inference_transport.cheng` + `src/quic/` | **C**（需远端节点 / vultr SSH） |
| 5 | 长稳吞吐压测门禁 | 无吞吐门禁字段 | **long-stability throughput gate**：tokens/s + latency p50/p95 + N 轮 stability cycles + 恢复门禁 receipt。gate 定义可在纯 Cheng 建门禁面，**实测需真实硬件 + shard** | `inference_transport.cheng` + `model_executor.cheng` | **A**（gate 定义可达）/ **C**（实测） |
| 6 | 真实 GLM5.2 大图执行 | HF index full inventory receipt（41 shard/399GB/replay_ok=1）+ tiny GLM5.2 MTP graph 多步 draft/verify + DSA/MLA/MTP audit | **真实 Phala GLM5.2 nextn/MTP 大图执行**（非 tiny graph）：399GB 全权重 + DSA/MLA/MTP 真实大图 + 专家分片真实量化执行 | `hf_model_graph.cheng` + `model_executor.cheng` + `weight_store.cheng` | **C**（需 399GB shard + Metal 长稳硬件） |
| 7 | 承重验证（src 改运行时生效） | dry-compile typecheck + intern 双射 + dual-track 旧列可秒回退 | **exec_diff 含 src 改运行时终验**：当前 driver 走 cold C 闭包不反映 src 改，纯路径卡 zero-C 5 not_ready | `src/core/backend/*`（op-lane LIVE） | **B**（需 op-lane zero-C 解锁） |
| 8 | driver rebuild | `build-backend-driver` 安装路径 rc=0 | **driver 非 corrupt 重建**：当前 driver 普遍崩 `cheng_seq_set_grow: corrupt header`（op-lane cheng_cold.c + cold_parser.c 994 行 SEQ_OPAQUE WIP 未提交） | `cheng_cold.c` + `cold_parser.c`（op-lane LIVE） | **B**（需 op-lane cold seq WIP 提交） |

**阻塞类别定义：**
- **A 可达**：纯 Cheng 业务层 receipt 证明面，不撞 op-lane 共享核心，不需外部资源，验证用 stage3 + 9 项 host smoke + stage23 DePIN gate。
- **B 需 op-lane 解锁**：zero-C 纯路径 5 not_ready → 0（解锁承重验证）+ cold seq WIP 提交（解锁 driver rebuild）。本仓不可独立推进，等 op-lane 战场落地。
- **C 需外部资源**：399GB shard 文件 / 多机集群 / vultr SSH / Metal 长稳硬件。用户授权或提供资源后方可推进。

## 决议（五条）

1. **证明面先行、真实落点随后**：A 类阶段先在纯 Cheng 业务层闭合 receipt 证明面（on-chain anchor / always-on service / mmap ABI / throughput gate 的 receipt + drift hard-fail），为 C 类真实落点提供可校验的接入契约。**每个 A 阶段 done 必须诚实标注"证明面闭合 ≠ 真实外部落库"**，不允许把 receipt 写成真实落库。
2. **不撞 op-lane**：A 类阶段严格限制文件清单到 `src/libp2p/protocols/depin/*` + `src/inference/{device,weight_store,paged_kv_cache,model_executor,hf_model_graph}.cheng` + `src/libp2p/cli/*`。**禁止动** `primary_object_plan/lowering_plan/compiler_csg/cheng_cold.c/cold_parser.c/program_support_backend/typed_expr`。改前确认目标文件 mtime 静止（共享文件 >10min 阈值）；提交用 `git apply --cached` 只 stage 自己 hunk（awk 剔除外部 hunk）。
3. **不盲删 fallback、不粉饰**：删任何 fallback realizer 须四证齐（census gap=0 + golden 运行时一致 + exec_diff 无新增 driver_miscompile + poison-on-miss 防落穿）。0 个安全删点就报 0。A 阶段若引入新 ABI（如 mmap），Linux provider 保持 unsupported hard-fail，不得 CPU 冒充。
4. **验证口径统一**：A 阶段每批 = `depin_inference_transport_smoke` / `depin_inference_settlement_smoke` 覆盖新 receipt 正例 + 字段漂移 hard-fail + 9 项推理/DePIN host smoke 不回归 + `run-stage23-libp2p-smokes depin_inference` 通过 + `build-backend-driver` rc=0 + `git diff --check`。承重运行时终验受 B 类阻塞，须诚实标注"未经 exec_diff 终验"。
5. **B/C 类不擅自推进**：B 类等 op-lane 战场落地后另起会话；C 类须用户明确授权外部资源（399GB shard 路径 / vultr SSH 凭据 / 多机集群 / Metal 长稳机器）后方可启动。本总纲不替用户决定 C 类资源获取。

## 实施阶段

A 类阶段 A1→A2→A3→A4 串行（每阶段门禁全绿才进下一阶段）；B 类等 op-lane 解锁；C 类等用户授权资源。每阶段/线独立走 OpenSpec propose→用户确认→apply→archive 闭环；本总纲不单独 apply，全部阶段收口后整体 archive。

### 阶段 A1：settlement 链上/账本落库 receipt 证明面（可达）

- files：`src/libp2p/protocols/depin/inference_settlement.cheng`、`src/libp2p/tests/depin_inference_settlement_smoke.cheng`。
- action：① 新增 `DepinSettlementLedgerOnChainAnchorReceipt`，绑定 `ledgerHash` + `chainId/chainHash`（复用现有字段）+ `anchorTxHash` + `anchorBlockNumber` + `blockConfirmations` + `anchorTimestampNs` + `submitterPeerHash` + receipt 自 hash；② 新增 `DepinSettlementSubmitLedgerAnchorReceipt`（提交侧：绑定提交 ledgerHash + chainId + submitter + 提交时刻 + submission byte hash）；③ 新增 `DepinSettlementVerifyLedgerAnchorReceipt`（验证侧：重放 anchor 字段，确认 anchorTxHash/confirmations/ledgerHash 漂移即 hard-fail）；④ receipt 序列化走现有 `depinSettlementReadI64LE` / `depinSettlementHashStep` 口径，不引入新 hash 族。
- verify：`depin_inference_settlement_smoke` 覆盖 anchor 正例（ledgerHash → anchor submit → confirm → verify 闭环）+ ledgerHash 漂移 hard-fail + anchorTxHash 漂移 + confirmations 不足 + chainId 漂移 + 提交侧 submission byte hash 漂移；9 项推理/DePIN host smoke 不回归；`run-stage23-libp2p-smokes depin_inference` 通过；`build-backend-driver` rc=0。
- done：on-chain anchor submit/confirm/verify 三 receipt 进 settlement 模块，`chainHash` 字段从"裸文本 hash"升级为"anchor receipt 绑定源"；smoke 全绿。
- 边界（必须写进 done）：**这是 anchor 提交/确认/验证的 receipt 证明面闭合，不是真实外部链 RPC 落库**。真实链上落库（C 类）需外部链节点 RPC 凭据，待用户授权。
- 状态（2026-06-28 实测）：✅ **archived**。`DepinSettlementLedgerAnchorReceipt` + `.csan1` 文件格式 + Write/Read/Validate（含 expectedLedgerHash/expectedChainHash/requiredConfirmations 绑定漂移校验）落地；`depin_inference_settlement_smoke` 覆盖 anchor 正例 + ledgerHash/anchorTxHash/chainId/confirmations/submissionByteHash 五项漂移 hard-fail + 空 chainId/无效 ledger receipt 参数 fail。验证全绿：settlement runner direct-exe exit=0；9 项推理/DePIN host smoke 全 PASS 无回归；`run-stage23-libp2p-smokes depin_inference` PASS（stage2+stage3）；`build-backend-driver` rc=0；`git diff --check` PASS。承重运行时终验受 B 类 zero-C 结构锁阻塞，A1 走 stage3 cold path + direct-exe + stage23 gate。验证证据已进 `progress.md` 2026-06-28 A1 条目。

### 阶段 A2：跨进程常驻 residency store 服务 + 网络复制 receipt 证明面（可达）

- files：`src/libp2p/protocols/depin/inference_transport.cheng`、`src/libp2p/cli/depin_residency_settlement_daemon_main.cheng`、`src/libp2p/tests/depin_inference_transport_smoke.cheng`。
- action：① 新增 `DepinResidencySettlementDaemonRegisteredServiceReceipt`，绑定 serviceName + serviceKind（launchd/systemd）+ installed plist/Unit byte hash（复用现有 `.csos1` spec）+ executablePath + workingDir + trigger spec path/byte hash + launch timestamp + heartbeat pid + health probe receipt hash；② daemon CLI 新增 `--register-service` / `--unregister-service` / `--heartbeat`（写出 registered service receipt + 心跳更新 `.cshl1`）；③ 新增 `DepinResidencyStoreNetworkReplicationReceipt`，绑定本地 store root byte hash + 远端副本 peerHash + 远端副本 ledger byte hash + replication quorum + replication frame hash（复用现有 settlement replication frame 口径）；④ always-on 语义证明：registered service receipt 链接 startup bundle + supervisor state，证明 service 已 install + launch + 心跳存活（receipt 层面），区别于 run-once 批处理。
- verify：`depin_inference_transport_smoke` 覆盖 register-service 正例（写出 registered service receipt + plist byte hash 绑定）+ plist/Unit 字节漂移 hard-fail + executablePath 漂移 + trigger spec 漂移 + heartbeat 缺失 + unregister 后 receipt 失效 + network replication 正例（远端副本 ledger byte hash + quorum）+ 副本 byte hash 漂移 hard-fail + quorum 不足 hard-fail；9 项推理/DePIN host smoke 不回归；`run-stage23-libp2p-smokes depin_inference` 通过；`build-backend-driver` rc=0。
- done：registered service receipt + network replication receipt 进 transport 模块；daemon CLI 支持 register/unregister/heartbeat；smoke 全绿。
- 边界（必须写进 done）：**这是"已注册 + 已 launch + 心跳存活"与"远端副本复制"的 receipt 证明面，不是真实 OS service 跨进程常驻部署，也不是真实 WAN 网络复制**。真实跨进程常驻 + WAN 复制（C 类）需真实远端节点，待用户授权。
- 状态：未启动（propose）。

### 阶段 A3：mmap/page streaming provider ABI 原语 + page streaming decode receipt（可达）

- files：`src/inference/device.cheng`、`src/inference/weight_store.cheng`、`src/tests/weight_safetensors_manifest_smoke.cheng`（或新增 `paged_kv_cache_smoke` 用例）。
- action：① `device.cheng` 新增 mmap provider ABI：Darwin `mach_vm_map` / Linux `mmap` `@importc` 桥（复用现有 `lseek/read` @importc + cold provider allowlist 模式），Linux 若无对应符号保持 unsupported hard-fail；② 新增 `DeviceMmapFileRangeBufferHandle` + `DeviceMmapFileRangeBufferLoadReceipt`，receipt 绑定 file range + mmap region handle + logical hash + source range hash（区别于现有 chunked `newBufferWithLength + contents` staging）；③ `weight_store` 新增 `WeightSafetensorsMmapPageStreamDecodeReceipt`，按 safetensors header 的 tensor data range 做 page-aligned mmap + 按页 decode + page streaming receipt（绑定 pageId/pageRange/mmapRegionHash/decodedPayloadHash）；④ Metal provider 新增 mmap buffer 路径，kernel 消费 mmap buffer handle 的 receipt gate（复用现有 page-set execution gate 模式）。
- verify：`weight_safetensors_manifest_smoke` / `paged_kv_cache_smoke` 覆盖 mmap buffer load 正例 + mmap region hash 漂移 hard-fail + page streaming decode 正例（chunk 大小变化不改变 decoded payload hash）+ page range 漂移 hard-fail + Linux unsupported hard-fail；9 项推理/DePIN host smoke 不回归；`run-stage23-libp2p-smokes depin_inference` 通过；`build-backend-driver` rc=0；Darwin provider 真实 `mach_vm_map` 符号闭合（cold provider allowlist 加 `cheng_inference_metal_mmap_*` 族）。
- done：mmap provider ABI + page streaming decode receipt 进 device/weight_store；Metal kernel 可消费 mmap buffer handle；smoke 全绿。
- 边界（必须写进 done）：**这是 mmap ABI 原语 + page streaming decode 的 receipt 证明面，在小 fixture 上证零拷贝路径，不是真实 399GB shard mmap 长稳**。真实 399GB mmap 长稳（C 类）需真实 shard 文件，待用户授权。
- 状态：未启动（propose）。

### 阶段 A4：多节点 WAN dispatch receipt 证明面 + 长稳吞吐门禁定义（可达）

- files：`src/libp2p/protocols/depin/inference_transport.cheng`、`src/inference/model_executor.cheng`、`src/tests/distributed_inference_engine_smoke.cheng`。
- action：① 新增 `DepinDistributedWanDispatchReceipt`，绑定 remote peer endpoint multiaddr + QUIC handshake evidence + WAN RTT + remote peer residency receipt hash + cross-node KV shard dispatch receipt hash（复用现有 KV shard receipt），区别于 loopback peer link；② 新增 `DepinInferenceLongStabilityThroughputGateReceipt`，绑定 tokens/s + latency p50/p95/p99 + N 轮 stability cycles + 恢复点 receipt hash + gate 自 hash；③ 新增 gate 校验器：throughput 低于阈值 hard-fail + latency p95 超阈 hard-fail + stability cycle 中断未恢复 hard-fail；④ `distributed_inference_engine_smoke` 新增 WAN dispatch receipt 正例（loopback 模拟远端 endpoint，receipt 绑定 multiaddr + RTT 字段）+ throughput gate receipt 正例（小批量循环 + tokens/s + latency 字段绑定）。
- verify：`distributed_inference_engine_smoke` 覆盖 WAN dispatch receipt 正例 + multiaddr 漂移 hard-fail + RTT 漂移 + throughput gate 正例 + throughput 低于阈值 hard-fail + latency p95 超阈 hard-fail + stability cycle 中断 hard-fail；9 项推理/DePIN host smoke 不回归；`run-stage23-libp2p-smokes depin_inference` 通过；`build-backend-driver` rc=0。
- done：WAN dispatch receipt + long-stability throughput gate receipt 进 transport/model_executor；gate 校验器进 smoke；smoke 全绿。
- 边界（必须写进 done）：**这是 WAN dispatch 与吞吐门禁的 receipt 证明面 + gate 定义，loopback 模拟远端 endpoint，不是真实 WAN 多机回归，也不是真实硬件长稳实测**。真实 WAN 多机 + 硬件长稳（C 类）需远端节点 + Metal 长稳机器，待用户授权。
- 状态：未启动（propose）。

### 阶段 B：承重验证 + driver rebuild 解锁（需 op-lane zero-C）

- files：`src/core/backend/primary_object_plan.cheng`、`bootstrap/cheng_cold.c`、`bootstrap/cold_parser.c`（**全 op-lane LIVE**）。
- action：① op-lane 关闭 zero-C 纯路径 5 not_ready（44/622/805/806/631，权威源 `docs/fulldriver_blocker_route.md` §「5 条最精确可行性矩阵」），解锁 full_backend_codegen 自编译；② op-lane 提交 cheng_cold.c + cold_parser.c SEQ_OPAQUE WIP（994 行），解锁 driver 非 corrupt 重建；③ driver rebuild 后，A1-A4 阶段累积的 src 改走 exec_diff 终验（含运行时承重）。
- verify：`build-backend-driver --require-rebuild` 报告 `full_backend_codegen=1` / `cold_system_link_exec=0` / `system_link_exec_scope=selfhost_direct`；driver 全 corpus 不崩 `cheng seq_set_grow: corrupt header`；A1-A4 src 改 exec_diff 终验 driver_miscompile 不新增。
- done：zero-C 5 not_ready → 0（或真兜底 2 条 631/805 保留并记录）；driver 非 corrupt 重建；A1-A4 承重终验通过。
- 状态：**阻塞，等 op-lane 战场落地**。本仓不可独立推进（共享文件 LIVE，改必 clobber op-lane 未提交 WIP，lessons 实测被抹 2 次不可逆）。

### 阶段 C：真实外部落点 + 真实长稳执行（需外部资源）

- C1 真实 399GB shard 长稳：files `weight_store.cheng` + `hf_model_graph.cheng` + `model_executor.cheng`。action：用户提供本地 399GB `PhalaCloud/GLM-5.2-W4AFP8` shard 路径后，跑完整仓库 payload hash preflight + page binding 长稳门禁 + 真实 mmap page streaming 长稳。verify：`expected_bytes=399693862592` 全仓 payload hash receipt 全绿 + 长稳 N 轮 tokens/s + latency p95 通过。done：399GB 真实 shard 生产 page binding 长稳门禁通过。**前置：用户授权 shard 路径。**
- C2 真多机 QUIC WAN 回归：files `inference_transport.cheng` + `src/quic/`。action：用户提供 vultr SSH / 多机集群后，远端部署 QUIC listener + 真实 WAN 多 peer dispatch + 跨机 KV shard 调度 + 网络复制长稳。verify：真实 WAN RTT + 多 peer QUIC handshake + 跨机 KV shard dispatch receipt 全绿。done：真多机 QUIC WAN provider 生产回归通过。**前置：用户授权 vultr SSH / 多机集群。**
- C3 真实 GLM5.2 大图执行 + Metal 长稳吞吐：files `hf_model_graph.cheng` + `model_executor.cheng`。action：在 Metal 长稳硬件上跑真实 Phala GLM5.2 nextn/MTP 大图（非 tiny graph）+ DSA/MLA/MTP 真实大图 + 专家分片真实量化执行 + 长稳吞吐门禁实测。verify：真实大图执行 receipt + 吞吐门禁 tokens/s + latency p95 实测通过。done：真实 GLM5.2 大图生产执行 + 长稳吞吐门禁通过。**前置：用户授权 Metal 长稳硬件 + 399GB shard。**
- 状态：**阻塞，等用户授权外部资源**。本总纲不替用户决定 C 类资源获取。

## 统一门禁（A 类阶段共用，B/C 类追加）

- `depin_inference_transport_smoke` / `depin_inference_settlement_smoke` / `distributed_inference_engine_smoke` / `weight_safetensors_manifest_smoke` / `paged_kv_cache_smoke` 覆盖新 receipt 正例 + 字段漂移 hard-fail。
- 9 项推理/DePIN host smoke 不回归（`inference_zrpc_surface_smoke` / `inference_kernel_metal_smoke` / `paged_kv_cache_smoke` / `weight_safetensors_manifest_smoke` / `distributed_inference_engine_smoke` / `hf_model_graph_smoke` / `depin_inference_smoke` / `depin_inference_settlement_smoke` / `depin_inference_specdecode_smoke`）。
- `run-stage23-libp2p-smokes depin_inference` stage2/stage3 均通过。
- `artifacts/bootstrap/cheng.stage3 system-link-exec --link-providers` 编译并运行通过（不编整个编译器）。
- `build-backend-driver` rc=0（不要求 `--require-rebuild`，因 B 类阻塞；A 类 src 改承重终验受 B 类阻塞，须诚实标注）。
- `git diff --check` 通过；新 ABI Linux provider 保持 unsupported hard-fail。
- B 类追加：`build-backend-driver --require-rebuild` 报告 `full_backend_codegen=1` + driver 全 corpus 不崩 + exec_diff driver_miscompile 不新增。
- C 类追加：真实 shard/多机/硬件 receipt 全绿 + 长稳 N 轮吞吐门禁实测通过。

## 禁止项（全局）

- ❌ 动 op-lane 共享核心文件（`primary_object_plan/lowering_plan/compiler_csg/cheng_cold.c/cold_parser.c/program_support_backend/typed_expr`）——改必 clobber op-lane 未提交 WIP，不可逆数据丢失（lessons 4b-6 实测）。
- ❌ 用 `git checkout -- <file>` / `git restore <file>` 撤回共享文件改——丢弃整个文件工作树改动含 op-lane WIP，不可逆。撤回自己改用 Edit 逐行还原或 `git stash push -- <pathspec>`。
- ❌ 把 receipt 证明面写成真实外部落库/长稳执行（粉饰）。每个 A 阶段 done 必须标注"证明面闭合 ≠ 真实落库"。
- ❌ 盲删 fallback realizer（须四证齐：census gap=0 + golden 一致 + exec_diff 无新增 + poison 防落穿）。
- ❌ Linux provider 用 CPU 冒充 Metal/mmap（保持 unsupported hard-fail）。
- ❌ 捏造数据 / Mock 生产代码 / 降级兜底 / 启发式补丁。
- ❌ 擅自推进 B/C 类（B 等 op-lane，C 等用户授权资源）。
- ❌ 私自创建新 worktree / 开分支（须用户明确同意）。

## 文档地图（权威源，本总纲不复制）

- 自举定点与 zero-C endgame：`openspec/proposals/cheng-v2-in-place-refactor.md` §「阶段1 zero-C endgame」、`docs/fulldriver_blocker_route.md` §「5 条最精确可行性矩阵」。
- DePIN 协议面：`docs/cheng-decentralized-compute-storage.md`（包/registry/RWAD，含 DePIN 算力订单簿/探针蓝图附录）。
- 推理引擎 receipt 层权威源：`src/libp2p/protocols/depin/inference_{transport,settlement,manifest,specdecode,scheduler}.cheng`、`src/inference/{device,weight_store,paged_kv_cache,model_executor,hf_model_graph,distributed_engine}.cheng`。
- 历史进度与边界标注：`progress.md`（DePIN 章节逐条"边界"行）、`findings.md`（生产缺口行）、`lessons.md`（4b zero-C 铁律）。
