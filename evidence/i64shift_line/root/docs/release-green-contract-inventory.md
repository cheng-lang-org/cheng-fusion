# RELEASE_GREEN 终局合同实测清单（2026-07-25）

权威判定器：`cheng-fusion/src/cheng_current_release_green_audit.ts`
（`auditCurrentReleaseGreen`）。`red_count` 只有 `0|1`——任何一处 hard red
直接判 `RED`，没有部分绿。

## 输入合同（六项，键名精确匹配，多一项少一项都拒）

`sourceSnapshotManifestPath`、`officialDriverPath`、`harnessManifestPath`、
`executionPolicyPath`、`runnerManifestPath`、`releaseManifestPath`。
最后一项的 basename 必须**恰好**是 `current-release-manifest.json`，且必须是
绝对路径（`resolve` 后自等）。

## 判绿顺序（前一步 red 即终止）

1. `runCurrentOfficialSevenStageAdmission` 必须 `ADMITTED`。
2. release manifest 必须是 canonical JSON、以换行结尾、字节与 canonical 形式完全一致。
3. `validateSemanticSnapshot`：语义快照 audit + bitmap receipt。
4. `verifyMemoryReleaseGate`：8 个 case 全齐，且 targets 恰为
   `["aarch64-unknown-linux-gnu","x86_64-unknown-linux-gnu"]`。
5. `fixedPoint(manifest)`：GEN2/GEN3 固定点。
6. 三个 target × 每个 backend 的 object/executable/debugReceipt/runReceipt/orcReceipt 全部 pin。
7. `validatePerformance`。
8. 全部 pin 文件末尾复查一次；任一文件在审计期间变化 → `current_release_input_drift`。

## ★ 内存门只认 Linux —— 但本机可达（已实测纠正）

`CHENG_MEMORY_RELEASE_REQUIRED_CASES` = 2 targets x 2 backends x 2 outcomes = **8 case**：

- targets：`aarch64-unknown-linux-gnu`、`x86_64-unknown-linux-gnu`（**没有 Darwin**）
- backends：`primary`、`backend2`
- outcomes：`success`、`failure_matrix`

每个 case 要求 `cgroupEvidenceDirectory` + `cgroupReceiptRaw32`，即真实 cgroup v2 回执。
manifest 还要求 `drivers` 精确 pin 两个 Linux official driver。

**初判「本机不可达」是错的，实测纠正如下：**

- `colima` 已在跑 `default` profile：**x86_64 Ubuntu 24.04.4 LTS，cgroup v2**，
  docker runtime 就绪（即那个 `qemu-system-x86_64` 进程）。→ `x86_64-unknown-linux-gnu` 现成。
- `colima start --arch aarch64` 原生跑 aarch64 Linux（宿主 `uname -m` = arm64，非模拟，速度正常）；
  `--profile` 支持多实例并存。→ `aarch64-unknown-linux-gnu` 一条命令可得。
- `lima`/`limactl` 亦在位（当前无实例）。远端另有 `vultr`/`dmit` 两台 ssh 主机备选。

**结论：8 个 Linux case 在本机可产，RELEASE_GREEN 不存在「必须外部基础设施」的结构性阻塞。**
注意 `default` profile 只有 2GiB 内存，而门禁要对进程树施加 `memory.max=1073741824`
（1GiB）+ swap=0，2GiB 太紧，建议按 `--memory 8 --cpu 4` 另建 profile。
宿主 48GB RAM、实测 59% 空闲、无 >4GB 并发进程，余量充足。

计划正文明令 Darwin process-tree 采样只算辅助画像，不得冒充硬上限——这条不变，
硬上限必须来自上面的真实 Linux cgroup v2。

## 当前基线

冻结闭包哈希（`tools/current_source_closure_manifest.py`，scope=src bootstrap tools docs
openspec cheng-package.toml）：
`1d8615009270c6f56051bc91584b131526ac599c38446395339c9015710394cb`（10:21 连续两次可复现）。

注意：该 manifest 的行含 `mtime_ns`/`ctime_ns`，因此内容相同但被重写的文件也算漂移——
这是计划要求的严格口径。

## 七阶段 admission 的精确入参钉死

`cheng_current_official_seven_stage_runner.ts:426` `validateInputPaths`：

- `sourceSnapshotManifestPath` 必须 resolve 后**恰等于**
  `<root>/artifacts/verification/current_source_compiler_main/cheng-source-snapshot.manifest.txt`
- `officialDriverPath` 必须 resolve 后**恰等于** `<root>/artifacts/backend_driver/cheng`
- `harnessManifestPath` 必须是绝对路径且 basename **恰为**
  `parser-production-receipt-harness.json`（失败态叫 `...harness.rejected.json`）
- `executionPolicyPath`、`runnerManifestPath` 必须是绝对路径

official build 现已把新 candidate evidence 放在事务输出目录，旧的 82.67MB 失败树不移动、不删除。因此这里的固定 source snapshot 路径是 official driver 成功后的下一个结构性 `HARD_RED`：Fusion ingress/runner 必须原地升级为读取 current official binding 中的精确 private manifest 路径，不能增加旧路径别名或双读。

`CHENG_CURRENT_ROOT` 在 `cheng_current_parser_receipt_ingress.ts:40` 是**硬编码**
`/Users/lbcheng/cheng-lang`，不读环境变量；而 `tools/ebnf_parser_node_map_gen.ts`
读 `CHENG_ROOT`/`CHENG_FORMAL_SPEC_PATH`/`CHENG_PARSER_PATH`/
`CHENG_PARSER_RECEIPT_PRODUCER_PATH`。**两条路径不同，别把 env override 当成
对 ingress 也生效。**

消费侧已就绪：`CHENG_EXECUTION_STAGE_OFFICIAL_RUNNER_STATUS.implemented = true`
（status READY）。所以七阶段的缺口纯粹是**证据生产**，不是消费者未实现。

## 依赖图（谁挡着谁）

```text
parser-receipt harness ──> parser-production-receipt-harness.json ─┐
current-source official driver ──> artifacts/backend_driver/cheng ─┤
source snapshot manifest ─────────────────────────────────────────┼─> 七阶段 ADMITTED ─┐
execution policy + runner manifest ───────────────────────────────┘                    │
                                                                                       ├─> RELEASE_GREEN
语义快照 audit + bitmap receipt ───────────────────────────────────────────────────────┤
内存 release manifest（8 个 Linux case）───────────────────────────────────────────────┤ ★ 卡 Linux
GEN2/GEN3 固定点 + 3 target × backend × 5 pin + 性能回执 ──────────────────────────────┘
```

EBNF map 同时是 regalloc source 预检的唯一卡点：`cheng_regalloc_preflight`
（mode=source）四项检查里三绿，唯一非绿是 `typedexpr_formal_expression_spec_binding`
= UNPROVEN，理由「generated EBNF parser map has zero, rejected or malformed
production receipts」。

## 实测阻塞状态（2026-07-25 10:40 根线汇总）

### 1. 冻结机制本身没问题，但 driver 编不出来

冻结已验证可行：`/Users/lbcheng/cheng-patches/20260725/frozen/` 3934 文件，
sha256 `4088a191…1d067a3`，与 live 树逐字节相同；harness 全程零写入源树。
`source closure drifted` 报错随之消失。**但下一步 receipt driver build 失败：**

```
cheng_cold: exact consume dataflow definition=497 block=177 consumer=499 state=6
cheng_cold: managed scope exit ownership dataflow is invalid (recovery=1 depth=1)
cheng_cold: reachable function body missing: texpr.TypedExprIrAppendUnrepresentedTopLevelBodyStatements
gate_blocker_id=cold_reachable_body_missing
```

（`src/core/lang/typed_expr.cheng:46707`，前置 23 条 `exact point liveness failed`）

**是移动靶**：08:53 同一构建死在 `ccsg.CompilerCsgReachableNameIndexAppend`
（`compiler_csg.cheng:41`，`use of consumed managed value`），同一子系统。
并发 lane 正在 root-fix 这套 exact-consume/liveness 机器，分钟级重写
`bootstrap/cold_parser.c`（实测 1649358B → 1655641B）。**属他人独占区，不要碰。**

时间成本很低：seed build ~35s，driver build ~40s 到失败，全程 ~80s。
阻塞一清，一个前台窗口就能跑完 29 源 × 2 driver。

### 2. 已修：source snapshot 采集范围少两行（根线落账）

`tools/build_current_source_compiler_main_candidate.sh` 原本只收
`src/**/*.cheng` + `cheng-package.toml` + `cheng.lock.toml`，而 ingress
`REQUIRED_SNAPSHOT_ROWS` 要求 `docs/cheng-formal-spec.md` 与
`bootstrap/cheng_cold.c` 以 role `compiler_source` 在册 ⇒ 任何快照都必然
`source_snapshot_required_row_missing`。

**已在两处对称扩范围**：phase-1 路径表(:1174)与 phase-2 独立 rescan(:1273)。
phase-2 会断言 `listed == rescanned`，**只改一处会自我拒绝**。
`roles = {relative: "compiler_source" for relative in listed}` 自动给到所需 role。
验证：`bash -n` 通过；两段内嵌 Python 用 `compile()` 单独验语法通过。
第三段 `PY_SOURCE_SNAPSHOT_VALIDATE` 走 `os.walk(expected_snapshot)`，
从快照目录反推，无需同步改。

### 3. 语义快照：唯一静态缺口是审计钉了旧夹具

四项 `false` 观测是**负极性**（false = 已达标），非缺口：
`functionOnlyCardinality`、`functionOnlyKind`、`forcedMissingFacts`、
`admissionRequiresBlocked`。非函数 Symbol 投影已由前序 lane 真实落地
（`compiler_snapshot_builder.cheng:12098/:12211`，基数 :9088 与 functionCount 无关）。

真缺口：审计 `cheng_semantic_snapshot_audit.ts:492` 钉
`afterReopen.receipt.sourceVersion==int64(6)`，而夹具已扩到三文档、
真值是 `int64(7)`（`lsp_multifile_exact_snapshot_acceptance_smoke.cheng:1632/:1635`），
且 gate 第 93-98 行强制要求 detached-consumer/open-document-universe 断言。
⇒ **应把审计重钉到当前更强形状（严格超集），不是把 7 改回 6**。
同源还有两处：`expectedFields` 少 `query_projection_module_sha256`（严格等集比较，
11≠10 直接抛）、pass 行锚定正则少三段。

### 4. 其余

- `artifacts/backend_driver/cheng` 仍不存在 = `admitCurrentParserReceipts` 第一条 hard red。
- 05:00 那份快照已失效：`source_snapshot_workspace_drift:src/core/analysis/cleanup_cfg.cheng`。
- ingress 要求 harness 自建的两个 driver 与 official driver **字节相等**，
  但两者构建路径不同（harness 走 `seed system-link-exec`，official 走 candidate 脚本），
  需先证字节一致，否则回执做出来也过不了 topology。

### 5. 判别实验：不是「并发 lane 弄坏了」，是源码与冷编译器正在共同收敛

根线用**改动前**的 `artifacts/bootstrap/cheng.stage3`（07-24 22:02 构建，早于今天全部
churn）编当前源树的同一入口，5.3s 快速失败：

```
backend_driver_dispatch_min.cheng:535 (offset 21246) managed assignment lacks exact source
  target=blockerArtifactPath expr=chengpath.PathAbsolute(rootDir, requestedOutputPath)
  local_kind=3 value_kind=3 value_slot=73 result_slot=-1 result_def=-1 result_ownership=0
cheng_cold: managed assignment lacks exact source value definition (recovery=0 depth=1)
```

对照：**当前** cheng_cold.c 新铸的 seed 走得更远，死在
`typed_expr.cheng:46707`（`exact consume dataflow … state=6`）。

⇒ 旧冷编译器编不动当前源，新冷编译器能力更强、前沿已从
`dispatch_min:535` 推进到 `typed_expr:46707`。**所以这不是回归，是 exact-ownership
数据流检查器与源码正在共同收敛的过程态，前沿在往前走。**

**结论：当前谁都编不出 official driver，这条收敛工作是整个计划的真前置。**
不能绕、不能换旧 seed 回避（旧 seed 死得更早），只能等其收敛。
所有动态证据（七阶段、GEN2/GEN3、published=1、内存 8 case）全部排在它后面。

## 2026-07-25 收尾：语义快照静态闭合已达成（blocker 2 → 1）

审计重钉三处已落（`cheng_semantic_snapshot_audit.ts`）：
`afterReopen.receipt.sourceVersion` 6→7、`expectedFields` 补
`query_projection_module_sha256`、pass 行正则扩到七段。三处都保持严格性
（`^...$` 全锚定、`[0-9a-f]{64}`、`fields.size` 仍是等集比较）＝严格超集，非放宽。

**新进程实测**：`publishedCandidateFixtureMultifileExact` 已 true，
blockers 从 `["published_candidate_fixture_not_exact_multifile","no_published_candidate_evidence"]`
减为 `["no_published_candidate_evidence"]`。10 个有序片段全部命中
（偏移 37994/38044/40415/40587/41116/41979/42251/44068/60266/61442）。

⇒ **语义快照线静态部分已闭合，只剩真实 `published=1` 动态回执**，
而它要求树静止（gate 首步就是 `cc -O2 bootstrap/cheng_cold.c`）。

### ★ 陷阱：MCP 常驻进程缓存旧模块

同一时刻 `mcp__cheng-fusion__cheng_semantic_snapshot_audit` 仍报 false + 2 blocker，
`bun run cli.ts run cheng_semantic_snapshot_audit` 新进程报 true + 1 blocker。
**改过 cheng-fusion 源码后，复验必须走 CLI 新进程**，否则会把已生效的修复误判为无效。

## 内存/ORC 线：计划前提被推翻 + 一个平台无关死结

「生产编译链零调用 LifetimeLedger」不成立，实测 5 个生产调用点：
`compiler_csg.cheng:26462`、`lowering_plan.cheng:1441`、
`primary_object_plan.cheng:69702`、`backend2_pipeline.cheng:4186`、
`system_link_exec.cheng:4478`；三个 entry main 均可达。
另核实无模块全局账本（ledger 一律 `var` 传参）、无 `moveSource` 布尔、
ownership 走 `OwnershipKind` 不可变字段——bullet 2 三条禁令均未违反。

**死结（与 Linux 无关）**：gate 要求 `ledgerStorageReleasedBufferCount === 6n`
（`cheng_memory_release_gate.ts:591`），而 `lifetimeLedgerRecordSequenceStorage`
只在 `capacity > 0` 时计数（`lifetime_ledger.cheng:535`）。
`body_ir_lifecycle`、`backend2_assembler_lifecycle`、`backend2_fragment_lifecycle`
从不记录 borrow ⇒ `borrows.cap` 恒 0 ⇒ 只报 5 ⇒ 每份 receipt 都被
`ledger is not physically closed` 拒。`body_ir` 是必需组件，无法回避。

三条路是禁区：让 ledger 恒报 6＝清空字段冒充释放；塞假 borrow＝伪造事件；
改 gate 的 `===6`＝削弱门禁。**唯一不造假的选项＝`LifetimeLedgerInit` 预分配全部
6 条 seq**，使 6 次释放都是真实的物理释放。这是设计变更，需拍板后再动。

**Linux 侧已实测通**（不是 Darwin 采样）：容器内 `cgroup2fs`、
`memory.max=1073741824`、`memory.swap.max=0`、`memory.peak=170930176`；
两个 target 的 `--emit:obj` 均 EXIT=0 且产出正确 ELF，容器内链接后原生运行 `run_rc=0`。
卡点是 provider 归档：`cheng_cold.c:68440` `cold_write_provider_archive` 在
`member_object_count==0` 时静默返回 false 且不设错误串（Darwin 宿主不构建 Linux
runtime provider 对象）——**在并发 lane 的文件里，只读未改**。

### 死结的第四条路（根线推荐，优于「预分配 6 条 seq」）

ledger 的 6 条 seq 是 `categoryNames`/`ownerNames`/`ownerClosed`/`objects`/
`borrows`/`categoryMetrics`（`LifetimeLedgerInit:92-97` 全部初始化为 `[]`）。

问题的本质是**合同与实现量的不是同一件事**：
gate 的 `=== 6n` 想断言「6 条 ledger 存储 seq 全部已释放」（结构性），
而 `releasedSequenceBufferCount` 实际计的是「有物理 buffer 可释放的 seq 数」（物理性）。
两者在「某组件从不 borrow」时必然分叉。

- 预分配 6 条 seq（agent 提的唯一非造假选项）能让两者重合，但代价是
  **为满足计数器而改变生产分配行为**——给从不 borrow 的组件也分配 borrow 缓冲。
- 更干净的根修：**两个量分别上报**——新增结构性 `ledgerStorageReleasedSeqCount`
  （恒 6，证明六条 seq 都走过释放路径）并保留物理性 `releasedSequenceBufferCount`，
  gate 改判 `seqCount===6 && bufferCount>0 && bytes>0`。
  这比现状**更严**（多一条结构断言），且不改任何生产分配行为，也不把
  未分配当已释放。

两条路都要同时改 `lifetime_ledger.cheng` 与 `cheng_memory_release_gate.ts`，
属跨仓设计变更，且必须能编译验证（用
`/Users/lbcheng/cheng-patches/20260725/memory/ledger_buffer_count_probe.cheng` 复跑，
当前实测 `without_borrow_buffer_count=5 / gate_requires=6 / EXIT_CODE=1`）。
本轮受配额与并发写入限制未动手，留待安静窗口。

### `published=1` 无法用冻结快照绕开（已证，别再试）

想法是把树冻结一份、让门禁在冻结副本上跑，从而躲开 churn。**行不通**：

- 门禁自身 `ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"`
  （`lsp_multifile_exact_snapshot_acceptance_gate.sh:4`）确实跟着脚本位置走，
  且 `source_closure_cid()` 用 `git -C "$ROOT" ls-files -co` —— 冻结副本没有 `.git` 就直接失败。
- 更根本的是：审计在门禁**两侧各校验一次活树**——
  `verifySemanticSnapshotAuditInputs(root, baseline, "before published candidate gate")`
  与 `"after published candidate gate"`（`cheng_semantic_snapshot_audit.ts:1502/1520`）。
  所以无论门禁在哪跑，**活树必须在整个门禁时长（约 20 分钟）内逐字节不变**。

⇒ 真实 `published=1` 只能等安静窗口，没有工程手段可以绕过。这是设计意图，不是缺陷。

## ★ 订正：regalloc source 预检已从 RED 退化为 CFAIL（新阻塞，非 EBNF）

10:17 时预检能取到快照（`snapshot_sha256=6fd7e7ca…`）并跑完 4 项检查，唯一非绿是
EBNF 那条。**15:2x 复测（CLI 新进程）已变成 `verdict=CFAIL`、`snapshot_sha256=null`**，
连检查都进不去：

```
GREEN  typedexpr_expression_leaf_coverage_ledger
CFAIL  source_snapshot
       reason: source fixture closure has unresolved import:
               fusion/regalloc_source_contract -> cheng/core/backend2/backend2_emit_ops
```

根因：`cheng-fusion/fixtures/regalloc_preflight/regalloc_source_contract.cheng`
import 了**三个已不存在的 backend2 模块**——`backend2_emit_ops`、`backend2_emit`、
`backend2_frame`。当前 `src/core/backend2/` 只有 11 个文件（assemble / assembler_lifecycle /
cid / frag_codec / fragment_lifecycle / lower / lower_slots / lower_stmt / lower_util /
pipeline / types），三者皆无。

不只是改名，是 **API 面被删**。夹具用到的三个入口现状：

| 符号 | 现状 |
|---|---|
| `PrimaryBodyIROpSizeAt` | 已迁至 `primary_object_plan.cheng:63951`（夹具已 import 为 `pobj`）【更正 2026-09-10 实读：旧写 `:60116` 已漂移，`fn PrimaryBodyIROpSizeAt(` 现址 `:63951`（`:60116` 现为 `fn PrimaryBodyIRFillResultProjectOp(`）】 |
| `PrimaryBodyIrPrepareFrameMetricsInPlace` | 已迁至 `primary_object_plan.cheng` |
| `PrimaryGlobalDataLabelRaw` | **全树 MISSING** |
| `Backend2EmitFunction` | **全树 MISSING** |

⇒ 夹具是照着已被拆掉的 backend2 emit API 写的，两个主入口全树已无定义。
并发 lane 此刻正在改 backend2 与 `tools/regalloc_production_gate.sh`（12:4x 实测），
**API 还在动，现在重写夹具是白做**。等其 refactor 落定后再按新 API 重写夹具，
届时预检才可能从 CFAIL 回到能评估检查的状态。

注意：`src/` 里另外三处 `backend2_emit_ops` 命中全是**注释**，不是真 import；
唯一真 import 在上述 fusion 夹具第 10 行。

## ✅ 内存门死结已解（2026-07-25，根线独立复验通过）

采用「结构量与物理量分开上报」方案（非预分配 6 条 seq，因为那是为满足计数器而改生产分配行为）。

**Cheng 侧** `src/core/tooling/lifetime_ledger.cheng`：
receipt 新增 `releasedSequenceCount: int32`，在 `lifetimeLedgerRecordSequenceStorage`
中**无条件**自增（位于 `if capacity > 0` 之外），物理量 `releasedSequenceBufferCount` 保持原语义；
`LifetimeLedgerReleaseStorage` 保留原 xor 腐坏检查，新增 `releasedSequenceCount != 6` 与
`bufferCount > sequenceCount` 两条 fail。`LifetimeLedgerStorageReleased` 未动。
三个 lifecycle 控制器（`body_ir_lifecycle`、`backend2_assembler_lifecycle`、
`backend2_fragment_lifecycle`）同形传递新字段并各加 `!= 6 -> fail`。

**Fusion 侧** `cheng_memory_release_gate.ts`：新增 `LEDGER_STORAGE_SEQUENCE_COUNT = 6n`，
断言改为（:605-608）
`sequenceCount !== 6 || bufferCount <= 0 || bufferCount > 6 || bytes <= 0`。
新字段进 `exactKeys` 与 `counters`，未进入的组件该项也必须报 0。
`test/item32_memory_release_gate.ts` 夹具改为死结形状（sequenceCount=6/bufferCount=5，必须被接受），
原 mutation 重指向 sequenceCount，另加 bufferCount=0 与 =7 两条，**mutation 覆盖 1 → 3**。

**根线独立复验**（非采信 agent 自述）：
```
with_borrow_buffer_count=6      with_borrow_sequence_count=6
without_borrow_buffer_count=5   without_borrow_sequence_count=6
both_paths_satisfy_gate         PROBE_EXIT=0
item32 memory release validator/mutations/MCP: PASS
```

语义上不是放宽：新接纳的只有 `bufferCount ∈ 1..5 且 sequenceCount == 6` 这一合法
「组件从不 borrow」形状，而物理完整性本来就不由该计数证明——由未改动的
`LifetimeLedgerStorageReleased`（六条 seq 全部 len==0 && cap==0）证明，且仍经
`ledgerStorageReleased` 把关。

**剩余（按序）**：①行生产者传递新键到 `compiler_payload_lifecycle.cheng`、
`compiler_csg_build_fragment_lifetime.cheng`、`primary_object_plan.cheng:66547`（在飞）；
②**全仓无任何 JSON 发射器**——没有代码写 gate 解析的 ledger/ORC 行，workload runner
与 manifest 都要新建；③两个 Linux official driver（卡 provider 归档）；
④aarch64 colima profile。

## 前沿推进轨迹（driver 构建，根线实测）

| 时刻 | 编译器 | 失败点 | 签名 |
|---|---|---|---|
| 07-24 22:02 世代 | `cheng.stage3`（churn 前） | `backend_driver_dispatch_min.cheng:535` | managed assignment lacks exact source |
| 07-25 08:53 | 当时 seed | `ccsg.CompilerCsgReachableNameIndexAppend` | use of consumed managed value |
| 07-25 10:1x | 当时 seed | `texpr.TypedExprIrAppendUnrepresentedTopLevelBodyStatements` | exact consume dataflow state=6 |
| 07-25 15:5x | **当前 seed（本次新铸）** | `BackendDriverDispatchMinReadKnownFlagOrDefault` | managed function return lacks exact value definition |

复现（seed 34s + driver 19s，共约 53s）：
```
cd /Users/lbcheng/cheng-patches/20260725/rootline
/usr/bin/cc -std=c11 -O2 -o seed_now /Users/lbcheng/cheng-lang/bootstrap/cheng_cold.c
./seed_now system-link-exec --root:/Users/lbcheng/cheng-lang \
  --in:src/core/tooling/backend_driver_dispatch_min.cheng --emit:exe \
  --target:arm64-apple-darwin --out:./drv_probe --report-out:./drv_probe.report.txt
```

**前沿在稳定前移，说明并发 lane 的收敛工作确实在推进**，不是原地打转。
`typed_expr` 那条已不再复现。

当前specimen（`backend_driver_dispatch_min.cheng:3715-3722`，该文件 08:27 后未被改动）：
```
fn BackendDriverDispatchMinReadKnownFlagOrDefault(code: int32, key: str,
                                                  defaultValue: str): str =
    var out: str
    BackendDriverDispatchMinReadFlagCodeInto(code, out)
    if len(out) > 0:
        return out
    return BackendDriverDispatchMinReadFlagOrDefault(key, defaultValue)
```
`slot=25 kind=3 type=str` 指向 `out`；`parsed=1` 但 `parsed_slot/kind/def` 全 -1
＝检查器认不出「经 `var` 出参写入的托管值」构成 value-def。

`var out: str; F(x, out); return out` 是本仓遍地在用的合法惯用形，
按「合法表面语法只修不绕」的规矩，**修在检查器（`bootstrap/cheng_cold.c`，他人独占区），
不许改业务层绕开**。

**15:43 复测（cheng_cold.c 15:42:47 新版重铸 seed）：签名完全相同**，
仍是 `BackendDriverDispatchMinReadKnownFlagOrDefault` / managed function return
lacks exact value definition。⇒ 前沿已**稳定**在此点，并发 lane 尚未触及这一条
（他们 task_plan 第 20 行显示在追 ORC 泄漏 alloc=5000/free=0/live=5000 的
managed overwrite 裸 PAYLOAD_STORE，是另一个子问题）。

## 行生产者传递已落（2026-07-25 15:37，根线复验）

- `compiler_payload_lifecycle.cheng`：4 处（字段/赋值/`!=6` fail/`ReceiptClosed` 谓词）
- `compiler_csg_build_fragment_lifetime.cheng`：4 处（同形）
- `primary_object_plan.cheng`：**仅 2 行**（:66548 panic 链 `!= 6 ||`、:66577
  `bodyIrLifecycleAllClosed` 合取 `== 6 &&`）。该文件不持有 ledger、不调
  `LifetimeLedgerReleaseStorage`、不声明 receipt 类型，只消费
  `bodylifecycle.BodyIrFunctionLifecycleReceipt`，故照搬既有 `ledgerStorageReleased`
  的两处用法，不套 3-hunk 模板。mtime 13:05:34 → 15:37:19（自己的写入），
  5 分钟后仍稳定，无争抢；size 4194454，仅 +2 行。

**诚实缺口**：后两处（两个 tooling 文件与 primary）**未经编译验证**——
凡是能触达它们的 smoke 目前全部在前端就崩（同一个 ownership 收敛阻塞）：
`compiler_csg_production_lifetime_smoke`(payload.CompilerPayloadLifecycleBegin 缺体)、
`compiler_payload_owner_ledger_kind_smoke`(expression start token is not source-owned)、
`compiler_csg_terminal_lifecycle_smoke`、`primary_object_stream_diagnostic_smoke`、
`cfg_primary_report_probe`、`build_plan_report_smoke`、`system_link_owner_ledger_lifetime_smoke`。
已用反向 A/B（撤销 hunk 重编，三个 smoke 失败签名逐字相同，再复原）证明**非本次改动引入**。
失败模式是编译错误而非静默 miscompile。**收敛落地后第一件事：重编这 7 个 smoke 做确认。**

## 窗口打开后的执行顺序（runbook，路径均已实测钉死）

前置：`find bootstrap tools src/core src/tests -type f -mmin -10 | wc -l` 为 0，
且 53 秒探针能编出 driver（见上节复现命令）。任一步失败就停，不要往下堆。

**① 在新事务目录重生成 source snapshot**（必须用已修的采集范围）
```
tools/backend2_current_source_official_build_producer.sh /absolute/absent-output
```
candidate 产物只允许落在该输出目录的 `compiler-candidate-evidence/`。旧
`artifacts/verification/current_source_compiler_main/` 保持原样作为失败证据，不再
要求“让路”。验收：新 manifest 里必须能查到 `docs/cheng-formal-spec.md` 与
`bootstrap/cheng_cold.c` 且 role=`compiler_source`。

**② 装 official driver 到钉死路径**
`artifacts/backend_driver/cheng`（`CHENG_CURRENT_OFFICIAL_DRIVER`，非此路径直接拒）。

**③ 跑 EBNF/parser 回执 harness**（约 80s，seed 35s + 两个 driver 各 40s）
```
cd /Users/lbcheng/cheng-fusion && CHENG_ROOT=/Users/lbcheng/cheng-lang \
  bun run tools/ebnf_parser_node_map_gen.ts
```
成功产物 basename 必须是 `parser-production-receipt-harness.json`
（失败态是 `...harness.rejected.json`）。
⚠️ ingress 要求 harness 自建的两个 driver 与 official driver **字节相等**，
而两者构建路径不同（harness 走 `seed system-link-exec`，official 走 candidate 脚本）——
**先证字节一致再往下**，否则回执做出来也过不了 topology。
预期计数从 `MAPPED=0/PARTIAL=125/witnessed=0/missing=971` 开始动。

**④ 七阶段 admission**：五个入参 = snapshot manifest + official driver +
harness manifest + execution policy + runner manifest。后两者**全仓不存在，需新建**
（schema 见本文档「七阶段 admission 的精确入参钉死」节；policy 要 pin 7 个 identity
输入，其中 `grammarObligation` 必须复用 ③ 的产物，不能另算）。

**⑤ 真实 `published=1`**（约 20 分钟，全程活树不能变）
```
cd /Users/lbcheng/cheng-fusion && bun run cli.ts run cheng_semantic_snapshot_audit \
  --input '{"scope":"production_closure","root":"/Users/lbcheng/cheng-lang","runPublishedCandidate":true,"timeoutSeconds":1500}'
```
（用 CLI 新进程，避开 MCP 模块缓存陷阱）

**⑥ 收敛落地后的确认动作**：重编 7 个 smoke 验证未编译验证的行生产者传递
（`compiler_csg_production_lifetime_smoke` / `compiler_payload_owner_ledger_kind_smoke` /
`compiler_csg_terminal_lifecycle_smoke` / `primary_object_stream_diagnostic_smoke` /
`cfg_primary_report_probe` / `build_plan_report_smoke` /
`system_link_owner_ledger_lifetime_smoke`）。

**⑦ 内存 8 case**：x86_64 用现成 colima `default`；aarch64 用
`colima start --arch aarch64 --profile <name> --memory 8 --cpu 4`。
仍缺 JSON 发射器（全仓为零）与两个 Linux official driver（卡 provider 归档）。

**聚合审计放最后**（`red_count` 只有 `0|1`，任一处 red 即全红，早跑纯属浪费）。

**17:57 复测（cheng_cold.c 17:01:56 版）**：`ReadKnownFlagOrDefault` managed-return
specimen 已被并发 lane 根修，前沿推进到同文件
`BackendDriverDispatchMinDryCompileCollectSourceClosureWithStats`：
```
cheng_cold: share exact source rejected body=... slot=227 kind=5 def=228 place=4 ownership=3 origin=152
cheng_cold: share(value) lacks exact source definition (recovery=0 depth=1)
```
并发 lane 已静默 44+ 分钟（可能停工）。按项目规则（共享热文件 mtime 静止 >10min
可动），root 线已授权 ownership 归因座席在严格协议下修检查器：
先字节备份到 cheng-patches、编辑前核 mtime、最小手术改、双真值方向验证、
diff 存档供 op-lane 回来 review-merge。同时布防 cold_parser.c 哨兵，
op-lane 一回来立即叫停座席。

## 18:0x 前沿再推进 + 策略调整

**17:59:46 op-lane 迁移了 `backend_driver_dispatch_min.cheng` 源侧**（46 行 diff：
specimen 调用点 `add(importEdges, edges[i])` 换成新 helper
`BackendDriverDispatchMinCloneImportEdge` 深克隆；sha256 赋值加显式 `share()`；
`pinnedFds/pinnedPaths` 参数改 `var`）——`share()` specimen 被源侧修法解决。
**这确认 op-lane 的收敛是「检查器收紧 + 源码迁移」双向的，且仍在活跃推进**
（cold_parser.c 17:12:59 未动，但 src 侧在动）。

18:03 复测：前沿推进到 `managed field projection lacks exact source definition`
（单行，无 body= 上下文可归因）。前沿轨迹更新：
dispatch_min:535 → CompilerCsgReachableNameIndexAppend → typed_expr:46707 →
ReadKnownFlagOrDefault(managed return) → DryCompileCollectSourceClosureWithStats(share)
→ **managed field projection（当前）**。一天推了 5 个 specimen，在收敛。

**策略调整**：检查器修改授权作废（op-lane 未停工，静默条件不成立）。前沿交还
op-lane 自然收敛，root 线转向零冲突战场：
`linux-link-patch-validation` 工作流已起飞（rebase 到当前 cold 源 + colima 双架构
真机运行验证 + fusion exec_diff Darwin 等价性对抗审查 + review-merge 案卷），
全程只碰 cheng-patches 副本。Linux 座席被杀前已实证：打过补丁的 cold 副本能产出
双架构 Linux exe（fix_hello/fix_ledger 四个 .err 全空），负控制=原版同输入必失败。

## 18:2x 全面接管（用户明令「全面接手推进不用等待」）

策略反转：不再等 op-lane 或静默窗口，root 线经工作流直接驱动收敛。
`ownership-convergence-takeover` 工作流：逐 specimen 循环（≤6 轮，每轮=定位→
最小复现→按 formal-spec 归因→修检查器或迁移源码→双真值验证+负控制→重探），
DRIVER_GREEN 后自动进收割段（快照重生成+official driver 安装 → EBNF 回执+字节
一致性检查+预检复测 → published=1 尝试）。写保护协议：字节备份到
cheng-patches/20260725/takeover/backups/、mtime 前后核对、撞车即停（OP_LANE_COLLISION）、
检查器修必须带「同族真违规仍被拒」负控制。

并行在飞：linux-link-patch-validation（rebase+colima 双架构+exec_diff 对抗）、
sediment-lessons-to-fusion（frontier probe / quiesce probe / 陈旧模块守卫三件套工具化）。

## ✅ Linux link 补丁验证收官（工作流 4 座席，verdict=READY_FOR_REVIEW_MERGE）

**rebase**：8/8 hunk 全部落上当前 `cheng_cold.c`（752b3c6d, 17:01:56），无 OBSOLETE。
唯一适配：op-lane 给 `cold_compile_source_to_object` 加了第 7 参（`ColdCompileStats*`），
hunk5 的探针调用补 `, NULL`（照邻近真实调用点）。产物
`cheng-patches/20260725/linux/rebase/rebased.patch`（275 行，-p1 可重放，
apply 后 sha256 与 patched 副本逐字节一致）。
座席没轻信 `patch --dry-run` 的非单调 offset，逐 hunk 人工核对落点——工艺正确。

**负控制（决定性，x86_64）**：未打补丁 seed 同输入 `error=Linux provider archive
write failed` 无产物；打补丁 seed emitRc=0 产合法 ELF。补丁就是差异。
诚实 caveat：aarch64 hello 未打补丁也能过（nolibc syscall provider 使 member 非空，
不触及空归档分支），故负控制只在 x86_64 腿有效。

**Darwin 无回归**：双 seed 编 arm64-apple-darwin hello 二进制逐字节相同且运行正确；
对抗座席全量 diff 确认 275 行=8 hunk 无夹带、无条件放宽（128/512 上限原样）。

**colima 真机**：x86_64 双 exe 全过（hello `linux_probe_ok` 15 字节 od 核对；
ledger 7 行逐字节 diff 对拍含 both_paths_satisfy_gate），VM 直跑 + 真容器两条路径。
**aarch64：hello 过，ledger 稳定 SIGTRAP（rc=133，3/3 复现，容器内同样）**——
gdb 定谳：PC=0x417b5c 处是 `brk #0xf04` poison 填充，由 `bl` 跳入 = **aarch64
codegen 真缺陷**（某函数体未发射、调用落进 poison）。该 exe 是 15:45 HEAD 世代产物。
另外发现本机已有现成 aarch64 colima profile `chengarm64`（无需新建）。

**三个重要环境事实（后续所有 probe 都要吃进去）**：
1. **`cheng_cold.head.c`(3173515B) = git HEAD 版，非工作树**；15:45 的 fix_*.exe
   全部出自 HEAD+patch 世代。工作树 cold 与 HEAD 行为差异显著。
2. **工作树 cold 新增 package-root 闸**：`cold source snapshot source path leaves
   package root`——fixture 必须位于 `<root>/src/` 之下，树外 fixture 一律拒。
3. **ledger probe 在工作树 cold 上从未编译过**（`managed field replace storage
   identity mismatch` / `duplicate function declaration identity`，双 seed 同败，
   与本补丁无关，属收敛前沿同族）。此前 15:37 的 probe 验证走的是 stage3 driver，口径不同。

**落地顺序**：rebased.patch 排在收敛工作流全部轮次结束后由 root 线落
（同文件单写者纪律），落后重铸 seed + 复跑 x86_64 负控制。
aarch64 ledger SIGTRAP 立独立案卷（poison-landing bl，需 cov/symbolicate 定函数）。

## ✅ Linux 发射线端到端打通（2026-07-25 20:0x，root 线落账）

1. **rebased.patch 已落** `bootstrap/cheng_cold.c`（8/8 hunk，落前字节备份
   `takeover/backups/cheng_cold.c.*.pre-linux-patch`；落前 mtime 19:21:44 =
   收敛轮次座席的诊断改动，非 17:01 基线——patch 仍干净落上）。
2. 补丁生效后暴露下一层**真源缺陷**：`core_runtime_provider_linux.cheng` 的
   inference_metal stub 家族被声明了两代，**10 对重名 @exportc**（gen-1 :700-821
   紧凑版 vs gen-2 :1691+ 超集版，多 4 个 out_buffer/output_receipt 变体）。
   删 gen-1 整块（备份在 takeover/backups/，断言锚定边界后 del 699:822）。
3. 复验：活树 `--emit:exe` 双 Linux target 全 rc=0 产合法 ELF；
   **x86_64 exe 在 colima 真容器跑出预期输出 `7-ok` rc=0**——
   从工作树源到 Linux 原生执行全链首次打通。
   内存门 8 case 的「两个 Linux official driver」前置从「卡死」变为「可产」。

## 收敛工作流第 1-6 轮战报（全部 FIXED_ADVANCED，负控制全过）

| 轮 | specimen | 修在哪 | 根因一句话 |
|---|---|---|---|
| 1 | managed field projection lacks exact source | checker (cold_parser.c:23254, 15 行) | `str` 被跨模块裸尾名 fallback 解析成 `system.str` 结构体，管理性分类被毒化——builtin 判定必须先于对象表查询（毒化输入，非谓词错误；修后反而能抓住此前漏过的 use-after-move） |
| 2 | managed field replace storage identity mismatch | checker (cold_parser.c:26767 族) | 字段存储分类只看 SLOT kind、目的槽却按类型问 managed drop，纯标量 struct 字段两侧口径分裂 |
| 3 | borrowed assignment lacks exact reborrow | checker | dispatch_min:4829 `out = next` 借用重绑定形 |
| 4 | managed global source | checker | Provider ws 全局计数复位形 |
| 5 | use of consumed managed value (liveness state=4) | **source** | 真消费违规，按 op-lane 模式迁移 |
| 6 | managed call-result/sret must materialize exact local owner | checker | sret 进容器前缺本地 owner 物化 |

方法论亮点：每轮先给检查器补「自报函数/槽位/谓词」的生产级诊断（留下），
再最小复现（~1s）归因修复；负控制双向甄别（round 1 的修复让检查器**多**抓住一个
真 use-after-move 而非放行——证明是修毒化输入不是削弱）。
轮 6 后前沿=另一处 liveness 消费违规；已续跑 12 轮上限（前 6 轮缓存复放）。

## 收敛 7-12 轮 + 战法切换（20:5x）

7-12 轮全部 FIXED_ADVANCED、负控制全过，但**全是同族源违规**：dispatch_min 内
`use of consumed managed value`（liveness state=4）长尾，每轮只清一处。
12 轮累计：检查器根修 6 处（cold_parser.c，各带家族级根因）+ 源迁移 6 处。
driver 仍未绿，前沿仍在同族。

**切换为清扫式**：`consume-family-sweep-and-harvest` 工作流——单座席内联
「编译→修下一处→再编译」循环（源修不需重铸 seed，每处 1-2 分钟），
每腿至多 15 处、至多 4 腿；遇非同族签名立停转 NEW_FAMILY_NEEDS_CHECKER；
每腿末尾跑回归网（tk_r1/tk_r2 正例 + tk_r1_neg_f 仍被拒）。
绿后自动收割：快照+official driver → EBNF 回执 → published=1。
模式库=takeover/ROUNDS.md（12 轮沉淀的 share/clone/materialize/reborrow 四式）。

## 清扫腿 1 战报（R13）：consume 族已清空，新族=return 位 seq 字面量

- dispatch_min 的 consume 长尾实际只剩 **1 处**（:9452 `machoRequest.outputPath`
  → `share()`，与 R12 四个兄弟字段同形），修后回归网全过。
- **R12 交接猜测被 BodyIR 证据推翻**：os.RemoveFile/@borrows 假设不成立
  （call-arg 是 read/borrow 非 consume；真消费者是 PAYLOAD_STORE op 685）。
  沉淀判例：consume_op 打印的早退 drop 是红鲱鱼，定位真消费者要看
  CHENG_COLD_DUMP_BODYIR。
- **新族**：`return ["..."]` return 位 seq 字面量不发布 exact value definition
  （parsed_def=-1）。合法形→检查器缺口；hoist 进局部=禁止的业务层绕法（座席
  已量测 hoist 形可过 ownership、但撞上另一个**预存** `unsupported cold call
  ABI kind` str[] codegen 缺口——两者不可混淆，后者是 ownership 清完后的下一道墙）。
  11 行复现 `tk_r13_probe_seqliteral_return.cheng`（0.01s）。
  R14 检查器轮已派出（预期修法=R6 的 materialize 推导用到 return 路径）。

## R15-R24 战报（10 轮全 FIXED_ADVANCED，5h，前沿离开 dispatch_min）

代表性根修：R15 `[]` 空序列 field 语境化二次发布（新增 revoke-then-republish 原语，
带自身定位诊断与严格前置条件）；R16 panic 尾终止——panic 被建模成普通 void call
导致隐式尾 return 扫描把 panic **消息字面量**当返回值，修=panic 调用所在块封
BODY_TERM_UNREACHABLE（精确块身份非启发式）；R17-R24 混合 checker/source。
前沿轨迹：dispatch_min → compiler_parser_receipt:8171 → sha256.sharedSha256KTab
→ ParserParseTypedInitializerLine → compiler_csg。当前前沿：
`managed scope preflight failed body=compilerCsgBuildConsumeWithOverridesCoreInto local=typedIrErr`。
累计 24 specimen（checker 12 / source 10 / both 2），全部带负控制与回归网。

## ★ 04:0x op-lane 复工，收敛暂停（R25 撞车停手）

R25 specimen 已修（defer 共享出口下「部分路径未执行声明」的 state=7 被一律拒——
合法形，检查器修；新增 `cold_exact_other_live_definition_for_local` 健全性守卫），
但 04:04-04:08 op-lane 同时在写 `cold_parser.c`+`cheng_cold.c`（外来特性
`declaration_origin_row`/`module_source_row`/`token_byte_offset`/
`cold_body_bind_declaration_origin`），座席按纪律**停手不回滚、撤掉临时探针**。

**双向完整性已核**（root 线复查）：我方 R1-R25 五个标记全在、op-lane 新特性全在、
Linux 补丁在——无任何一方被覆盖。保险补丁
`takeover/insurance_cold_parser_R1toR25_plus_oplane.patch`（1904 行，含双方 hunk）。

**纪律**：op-lane 活跃期间**禁止**再写 bootstrap/。哨兵已布防（bootstrap/ 静默
12 分钟即报），届时恢复 R25 遗留的第三函数（state=8 released-before-consumer，
预备修法=在 `cold_stage_exact_conditional_drop_on_edge` 按前向可达性 gate 接管，
但**必须在干净树上重测后**才可信）。

累计 25 specimen（checker 13 / source 10 / both 2）。

## ★★ 2026-07-26 10:0x 判定：两条 lane 在做同一个收敛（重复劳动）

实测证据：前沿现为 `texpr.TypedExprIrAddAssignStatementFromExpr` 的 consume 违规
（源侧，在 `src/core/lang/typed_expr.cheng`），而该文件 **10:00:43 刚被 op-lane 改**
（我方探测于 10:01）。同期 op-lane 还在写 `cold_defer_semantics_smoke.cheng`
（=R25 的 defer specimen）、`backend_driver_dispatch_min.cheng`、`repro_r3v*`，
以及 bootstrap/ 两文件（09:52/09:54）。30 分钟内 op-lane 触及 src/core 共 15 个文件。

⇒ **两条 lane 在同一批文件上跑同一个 ownership 收敛**。继续并行=争抢共享文件+
重复烧钱，且历史上正是这种局面造成过不可逆丢失。

**处置：root 线全面停止收敛写入**（bootstrap/ 与 src/core 皆停），把收敛交还 op-lane。
25 个 specimen 根修已落且完好（保险补丁在 takeover/）。root 线只做零冲突项。

### aarch64 SIGTRAP 根因已定谳（重要真缺陷，✅补丁已落 07-26 16:2x）
`cold_write_linux_aarch64_syscall_provider_object` 对 97 个 raw-libc provider 入口中的
**93 个发 `a64_brk(0xF04)` 当函数体，却仍然定义它们**（`offsets[ri] = code->count`），
于是链接器把每个调用都绑到陷阱上，还报 `unresolved_symbol_count=0`——**静默**。
症状即 `calloc` 等调用落进 poison。修法三 hunk（`offsets[ri] = -1` 让未实现名诚实
未定义 / 把 x86_64-only 导出拆表 / `valid &&` 保住精确报错）。**已于 07-26 16:2x
由 root 线落地 `bootstrap/cheng_cold.c` 并复验全绿**（复验证据见文末 07-26 落账节；
落前字节备份在 `cheng-patches/20260726/aarch64-trap/cheng_cold.c.pre-trap-patch.*`）。

### 内存证据发射器已建成（全仓首个）
`src/core/tooling/memory_release_receipt.cheng` + workload runner + 拒收守卫。
真实门禁函数接受全部 8 个 case receipt（ANY_FAILED=0），manifest 解析通过，
完整审计止于 `official driver aarch64-unknown-linux-gnu ELF machine mismatch`
（=只差 Linux official driver）。x86_64 Linux 真容器内实测 ledger 行可产
（seq=6 buf=6 bytes=784）。对抗验证工作流在飞。
**新发现两个真阻塞**：①Linux 上 `new(T)` 不进 registry（refcount=0，memRelease 报
`registry_miss`）⇒ Linux 上产不出 ORC 行；②aarch64 Linux `--emit:exe` 报
`provider external dependency unsupported: mmap`（与上面的 93 poison 同源）。

## ★★ 纠正：内存证据发射器 REFUTED（对抗验证 + root 线独立复核）

**上一节「发射器已建成、8 个 receipt 全被接受」的结论作废。** 三轴对抗审计判 REFUTED，
root 线独立复核确认要害两条：

1. **发射器根本编不过**（root 线亲测）：
   `cheng_cold: unsupported char literal` → `reachable function body missing:
   receipt.memoryReleaseDriverDocumentValid`，BUILD_RC=2（用 artifacts/bootstrap/cheng.stage3
   编 `src/tests/memory_release_workload_runner.cheng`）。当前生产模块不可编译。
2. **时间线错位**（mtime 实测）：evidence `04:30` ← gate `06:20` ← emitter `06:24`。
   即「8 个 receipt 被接受」是拿 **04:xx 的旧门禁**、由一个**源码已不存在的**二进制
   产出的证据测的；门禁与发射器随后各自被重写，证据从未重生成。

**门禁未被削弱**（重要）：06:20 版是**改严**——新增 `receiptKind`/`producerOperation`/
`stateMachineReceiptCid` 必填、新增「`component==primary` 不得声称持有 ledger」，
且我方 sequence-count 修复 5 处完好。非自导自演。

**审计的关键洞见（决定返工方向）**：旧做法用**合成 micro-loop** 产数——
ORC `iterations==5000` 来自常量、ledger 计数按槽位下标固定（1/64,4/304,3/216…
**8 个 case、两个 target、两个 backend、6 条失败路径全部逐字节相同**）、
`physicalBufferCount` 恒等于 ledger 自己的 6 条 reserve 序列。
这类「标签断言了数字并不具备的出处」正是计划禁止的伪证据。
06:20 门禁要求的 `stateMachineReceiptCid` + 组件 receipt，实质是要求
**接进真实的单函数 lower→emit→release 状态机**（计划第 4 节 bullet 4），
合成路线注定被拒。

**另两条独立真阻塞仍成立**（与上述无关，实测）：Linux 上 `new(T)` 不进 registry
（refcount=0，memRelease 报 `registry_miss`）⇒ Linux 产不出 ORC 行；
aarch64 Linux `--emit:exe` 撞 `provider external dependency unsupported: mmap`
（与 93 个 poison 同源，补丁已备）。

**返工规格**：①先修 char literal 等编译错误（cold 不支持字符字面量，改字节值）；
②废弃合成 workload，把 receipt 产出接到真实编译状态机的组件出口；
③证据必须在门禁定稿后重生成，且 evidence/gate/emitter 三者 mtime 顺序必须
gate ≤ emitter ≤ evidence。

## 2026-07-26 16:xx root 线落账（本节为最新态）

### ✅ aarch64-trap 补丁已落地并复验全绿
`proposed.patch` 3 hunk 已落 `bootstrap/cheng_cold.c`（落地时 cheng_cold.c 已静默
45min，patch `git apply --check` rc=0，先在隔离副本 cc 编译 rc=0 后才动活树，
落后活树 sha256 与已验证副本逐字节一致）。复验四门：
1. patched 树 `cc -O2` rc=0；
2. x86_64 `--emit:exe` rc=0（无回归）；
3. aarch64 `--emit:exe` rc=2 `provider export missing: calloc`（静默毒→显式失败，
   即补丁设计行为）；
4. Darwin 无回归：**冻结快照**（`cheng-patches/20260726/aarch64-trap/absnap`，
   rsync 自活树）上 pre/post 双 seed 同 `--out` 路径编 arm64-apple-darwin，
   `cmp` 逐字节相同。⚠️ 活树上做该 A/B 会假红：两次编译间隙 op-lane 改源即差
   （实测 char 969 差异即此，非补丁）。字节 A/B 一律用冻结快照。

### ★订正：ORC registry_miss 是全平台缺陷，非 Linux 特有
`a64_alloc_trap_probe.cheng`（仅 seq 字面量+Fmt 串+echo 的极简形）当前树产物在
**Darwin 本机与 x86_64 Linux 容器都** `cheng_orc_release_failure code=registry_miss
operation=normal_release detail=wrong_object_or_owner` rc=1。旧记录「Linux 上
new(T) 不进 registry」范围写窄了。该族与 op-lane 在修的 ORC 泄漏
（managed overwrite 裸 PAYLOAD_STORE）同域，root 线只立案卷不动手
（归因案卷工作流在飞，产物 `cheng-patches/20260726/a64-port/ORC_REGISTRY_MISS_DOSSIER.md`）。
**影响**：它同时挡内存 8 case 两条腿的 run/ORC 回执，收敛落地后必须复测。

### ✅ 内存发射器返工①已落：char literal 编译错误已清
`memory_release_receipt.cheng:680` `'\x00'` → `'\0'`（规范对 charLiteral 只承诺
「常见反斜杠转义」，`\xNN` 仅短字符串明文承诺；`'\0'` 为受支持等价合法形）。
复测：`unsupported char literal` 与级联 `body missing: memoryReleaseDriverDocumentValid`
均消失；workload runner 现死在共享 runtime `cheng_exec_program_capture_with_timeout`
的 ownership 收敛（op-lane 前沿，非本文件问题）。返工②（接真实状态机）待
driver 收敛后实施。

### 在飞（root 线，全部零冲突战场）
- **aarch64 nolibc core 移植工作流**（`a64-nolibc-port`）：x86_64 54 emitter vs
  aarch64 15，把 heap/stdio/dirent/env/fixed-syscall core 移植到 aarch64——内存
  8 case aarch64 腿的功能性前置。单写者协议+colima 双架构金标（x86_64 stdout+rc
  为 oracle）+冻结快照字节 A/B。产物 `cheng-patches/20260726/a64-port/`。
- **七阶段 policy/runner manifest 生成器**预制（runbook 第④步机械化）：
  `cheng-patches/20260726/sevenstage-inputs/`。
- **driver 收敛监视器**：15min 周期重铸 seed 探 dispatch_min，转绿即进收割段
  （快照→official driver→EBNF 回执→published=1）。当前前沿签名：
  `BackendDriverDispatchMinProviderWsPopOwn` 内 `atomic.LoadI32(tailCell)` 被判
  `call var-out actual is not a mutable stack local`（op-lane 收敛中）。

### ★新结构性发现：Darwin exe 字节随 `--out` 路径变化（两条字节合同的前置根修）

同 seed 同冻结源树，仅 `--out` 不同 ⇒ 产物不同（同目录异名差 872 字节；异目录同名差
218 字节）。四层级联（全部实测钉死）：
1. 系统链接时 `<out>.primary.o` 的**绝对路径**被记进 exe 符号表 OSO stab
   （`nm -ap` 可见），路径长度变化连带 `LC_SYMTAB.strsize` 变（845 处差异即此）。
2. ld 的 `LC_UUID` 是含 strtab 的内容散列 ⇒ 随路径变（969 处 16 字节）。
3. ad-hoc 签名 identifier = `<basename>-UUID<uuid十六进制>`（实测
   `snap_ab-55554944b13d…`，`55554944`="UUID"）⇒ 随 UUID 与 basename 变。
4. CodeDirectory 哈希随上述内容变。
注意 cheng 自带两个 Mach-O 写出器的 UUID 是常量（macho_direct.h:331 `0xC0+i`、
cheng_cold.c:51799 `0xD0+i`）、内部签名 identifier 是常量
`cheng.internal-link-probe`（:51598）——**变异只来自系统链接器路径**。

**击穿的合同**：①ingress 要求 harness 自建 driver 与 official driver 字节相等
（构建路径不同⇒必不等）；②GEN2/GEN3 不同 inode 原始字节完全一致（异路径⇒必不等）。

**根修规格**（生产级，不引入 mask）：
- cold 侧：系统链接 argv 加 `-oso_prefix <outdir>/`（或 chdir 到 outdir 用相对
  `.primary.o` 名）⇒ OSO 与 strtab 路径无关 ⇒ UUID 确定 ⇒ 签名确定。
- Cheng 侧孪生：`src/core/backend/system_link_exec.cheng` 同修（GEN2/GEN3 由
  Cheng driver 产出）——**待 op-lane 收敛落地后做**。
- 收割约定：所有字节比对工件（GEN2/GEN3、harness 双 driver vs official）必须
  **同 basename 异目录**产出（identifier 含 basename，改名必不等；`cheng` 是唯一
  合法 basename）。
- 落地时序：cheng_cold.c 当前由 a64-nolibc-port 工作流单写者占用，此修排其后。

#### 2026-07-29 复测结论：cold 侧两层已闭合，basename 层已在 builder 源头修复

夹具 `src/tests/borrowprobe.cheng`（`provider_link_mode=system`，真走系统 ld），
seed 由当日 `bootstrap/cheng_cold.c` 现铸，四次顺序构建（构建时刻各不相同）：

| 变体 | sha256 | 字节 |
|---|---|---|
| `--out:d1/cheng` | `9fa7f362…f0bd` | 127024 |
| `--out:d2/cheng`（异目录同名） | `9fa7f362…f0bd` | 127024 |
| `--out:d3/cheng.compiler-main` | `170affdb…f79a` | 127040 |
| `--out:d4/cheng --link-providers` | `9fa7f362…f0bd` | 127024 |

- **OSO 路径层 + mtime 层已闭合**：`-oso_prefix` 之外还需要把全部输入 .o 的
  st_mtime 归一（OSO n_value 记的是 .o mtime），两者都已在 cheng_cold.c 落地，
  异目录同名、异构建时刻现在字节全等。
- **`--link-providers` 字节中立**（本夹具）：official 带、harness 不带这一处
  不对称不必再对齐；driver 入口 provider 闭包更大，收敛后仍需复测一次。
- **basename 层定谳**：`cheng.compiler-main` 比 `cheng` 恰长 16 字节 =
  OSO 串多 14 字符按 16 对齐。所以「出件后 rename」**在原理上就不可能**补回
  字节相等——basename 在物化那一刻已写进字节。
  已改 `tools/build_current_source_compiler_main_candidate.sh`：以
  `--out:$OUT_DIR/cheng` 物化，`require_report_value output` 与 tracked-output
  都指向该路径，走完 `output_sha256` 等式后再 `mv` 成 `cheng.compiler-main`；
  那条既有等式因此同时成为「rename 未改字节」的证明。
- **仍未做**：Cheng 侧孪生（`native_link_exec_darwin.cheng` 的 system_linker
  分支既无 `-oso_prefix` 也无 mtime 归一）。GEN2/GEN3 由 Cheng driver 产出，
  这一层不修则同病。注意 Cheng std 目前**只有读 mtime 的
  `cheng_file_mtime`，没有写 mtime 的原语**，孪生补丁需要先加 provider。

### ✅ 七阶段 policy/runner manifest 生成器已预制（runbook 第④步机械化完成）

产物在 `cheng-patches/20260726/sevenstage-inputs/`：SCHEMA_NOTES.md（逐字段表+
admission 调用配方）、gen_execution_policy.ts、gen_runner_manifest.ts（只收真实
路径、拒手写 hash、写前过真判定器、写后逐字节回环）、selftest.sh。selftest 实测:
产物过全部 schema/路径/canonical 层，仅死在
`current_parser_ingress_not_admitted:…cheng.current-build-receipt.kv` 缺失层
（=official build 未产出，正确），两条突变探针 REJECTED 证明判定层非真空。

**④ 步新增五坑（SCHEMA_NOTES §7 全清单，这里记会翻车的）**：
1. `grammarObligation` 复用字段 = harness 的 `formalEbnfSha256` =
   `docs/cheng-formal-spec.md` 里唯一 ```` ```ebnf ```` fence 正文 CRLF 归一+
   trimEnd 后的 sha256——**全仓没有现成文件哈希等于它**，跑 producer 前必须先
   materialize 成无结尾换行的独立文件；今天没有任何门禁校验该等式，喂错照样 ADMITTED。
2. runner `validateInputPaths` 行号已漂移到 :460（doc 旧引 :426）；实为 4 键输入。
3. `parserIngressRaw32` 是**现场重放哈希**（bun 二进制与 corpus generation 进身份）
   ⇒ ④ 必须冻结窗口内一口气跑完。
4. **producer.sh 输出 basename 与 release 审计钉死名不一致**
   （`execution-policy.json` vs 审计要求 `execution-stage-policy.json`，
   audit:1657-1658）⇒ ④ 绿了 release 装配也拒；生成器已按审计名出件，producer.sh
   的改名待 driver 绿后一并落。
5. pin 文件 nlink===1 硬约束（硬链接备份即拒）；禁键正则 `v1|v2|legacy|compatibility`。

### ★ORC registry_miss 定谳（案卷 `cheng-patches/20260726/a64-port/ORC_REGISTRY_MISS_DOSSIER.md`）

**编译器世代回归，与 target 无关；机制级同根于 op-lane 的 ORC 战役。** 三世代矩阵
（同冻结快照、同 --out 轮换）：seed52 stage3 与 seed_final(07-26 02:32) 编的夹具
rc=0 出数；seed_trap(16:32) rc=1 逐字 `registry_miss/normal_release/wrong_object_or_owner`。
家族切分：seq 字面量触发，Fmt 串无恙。反汇编差分定点：
- 分配侧两世代**完全相同**＝raw calloc trampoline（`cheng_cold.c:22180
  codegen_emit_heap_alloc_shim`，无 header、不进 registry）；
- 16:31 世代**新增** seq 作用域退出的 `bl _cheng_mem_release(seq.data)` ⇒ 对未注册
  分配补 release ⇒ `cheng_mem_release_registered_header`
  （`program_support_backend.cheng:2912-2922`）查册 miss ⇒ :2880 panic。
- 旧世代「绿」只是**从不 release 的静默泄漏**。
⇒ 真根修＝alloc 侧闭合纪律（shim 注册进 registry），与 op-lane 的 PAYLOAD_STORE
漏 release 是同一缺口的镜像两半——**该修属 op-lane ORC 战场**；root 线持有案卷与
双向复现探针（absnap/src/tests/a64_regmiss_{seq,fmt}_probe.cheng）。
caveat：无 02:32 源快照，同根为机制+窗口级定谳非 commit 级。
另：`artifacts/bootstrap/` 整目录已再度缺失（stage3 用 seed-rescue-20260718 替位）。
