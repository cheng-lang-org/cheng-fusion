# CSG-Core Atomic Admitted Delta Batch

状态：`proposed`。本提案只定义合同、替换范围和验收矩阵；在用户确认前，不修改
`docs/csg-core-standard.md`、生产源码、门禁或测试，不产生动态完成信用。

## Motivation

当前 transaction-operation 把每条 fact patch 都当成一个完整的 before/after
`facts_root` 迁移，并把 proof 的 `schema_cid` 沿用到 after root。该模型只可能正确表达
schema/profile binding 不变的局部修改。

生产 validator 的 binding 由完整 facts 唯一推导，并要求 schema `features` 与实际 fact kind
精确闭合。一次真实 profile add/remove/change 至少同时改变 schema fact 与一个 dialect fact；
匿名 schema fact 变化还天然表现为 old-schema delete + new-schema insert。因此“profile 变化恰好
一个 operation”与完整双侧 production admission 不可同时成立。

本提案以完整语义为准：一次 before/after 变化只有一个原子的
`CsgCoreMerkleAdmittedDeltaBatch`。batch 内可以有多个有序 operation，但只有 batch 的两个
端点是 production-admitted facts 状态；中间 Patricia 状态只用于结构 proof 链，不伪装成
合法 `facts_root`，也不得被 manifest、receipt、CLI 或生产执行观察。

## Non-negotiable Invariants

1. before 与 after 必须分别由同一个纯 Cheng
   `CsgCoreProductionAdmitFactLinesWithDag` 完整准入；任一非 canonical、不完整、unsupported、
   tombstone、schema/profile 未闭合输入在构造 diff 前 hard-fail。
2. canonical diff 只能由两个已准入端点重新计算。caller 提交的 operation、顺序、root、CID、
   profile 或 schema 都不是 authority。
3. batch 是 operation/proof/plan/receipt/replay 的唯一语义能力。旧单 replace builder、proof-only
   replay、caller operation 数组和 relfacts 文本 sidecar 都不能成为并行生产 authority。
4. `before_facts_root` 只用 before binding 计算；`after_facts_root` 只在全部 operation 完成后，
   用 after 的 standard、完整 profiles、schema namespace、`after_schema_cid` 与最终 subgraph
   计算一次。不得逐 operation 猜测或沿用 binding。
5. 中间状态只承诺 DAG root、subgraph CID 与 fact count，字段名固定为 `state_*`；不得称作或
   输出 `facts_root`。
6. 同一组 canonical before/after CSGC 必须得到唯一 diff、唯一 operation 顺序、唯一 proof
   bytes、唯一 operation bytes、唯一 batch CSGC bytes、唯一 `delta_cid` 和唯一 after
   `facts_root`。
7. 任一失败返回空 capability、空 bytes、空 CID、空 root、空 receipt；不得写 stdout、目标文件、
   successor 或启动 production execution。

## Unique Batch Capability

新增的唯一强类型能力由 `merkle_admission` 的 Arena + SoA registry 持有。公开值只是一枚
可验证 handle，不能靠名义类型自授权：

```text
CsgCoreMerkleAdmittedDeltaBatchHandle
  row: int32
  deltaCid: str

private CsgCoreMerkleAdmittedDeltaBatchSoA[row]
  beforeAdmission / afterAdmission
  beforeCsgcBytes / afterCsgcBytes
  beforeCsgcObjectCid / afterCsgcObjectCid
  beforeCsgcDirectoryCid / afterCsgcDirectoryCid
  beforeDagRootCid / afterDagRootCid
  beforeSubgraphCid / afterSubgraphCid
  beforeFactCount / afterFactCount
  beforeFactsRoot / afterFactsRoot
  beforeProfiles / afterProfiles
  beforeProfileSetCid / afterProfileSetCid
  beforeSchemaCid / afterSchemaCid
  deltaContextCid
  operationRows: int32[]
  operationBytes / operationCids
  proofBytes / proofCids
  batchCsgcBytes / deltaCid
```

跨 batch/operation/proof 身份只使用 `int32` row。每次 resolve 都必须检查 row 边界、handle
`deltaCid` 与该行原始 batch bytes 重算值，并重放所需边界；伪造 handle、caller 布尔、对象地址或
缓存 struct 都没有 authority。唯一 issuer 接受完整 before/after CSGC bytes，完成双侧 admission、
diff、proof、replay、CSGC 重编码对拍后才登记该行。跨进程只传原始 batch CSGC，接收方必须重新
签发本进程 handle。`row` 与进程 generation 只用于内存寻址，严禁进入 wire、CID、root、proof、
plan 或 receipt。

`delta_context_cid` 在 proof 与 operation 编码前计算，用于阻止跨 batch 拼接且避免 CID 环：

```text
delta_context_cid =
  "sha256:" + hex(
    SHA256(text("csg_core.merkle.admitted_delta.context") ||
           before endpoint binding ||
           after endpoint binding ||
           u32le(operation_count) ||
           each ordinal/kind/query_key/before_fact_cid/after_fact_cid))
```

endpoint binding 必须包含 CSGC object/directory CID、facts root、DAG root、subgraph CID、fact
count、standard、schema namespace、schema CID、完整 profiles 与 profile-set CID。所有文本按
既有 `text(x)` 长度前缀规则编码，CID 写 32-byte payload；禁止分隔符拼接。

## Canonical Diff and Operation Order

每个 fact key 最多产生一个逻辑 operation：

```text
before absent, after present       -> insert
before present, after absent       -> delete
same key, different canonical fact -> replace
same key, same canonical fact      -> no operation
```

匿名 fact 的 key 含 fact hash，所以内容变化必然是 delete + insert，禁止启发式折叠成 replace。
有稳定 `id` 的 fact 只有 key 相同且 bytes 变化时才是 replace。零 operation 不签发 batch；两个
端点 facts 相同但 binding 不同以 `merkle_delta_binding_only_transition_forbidden` 拒绝。

唯一执行顺序：

1. 从完整 before/after canonical physical facts 计算全部逻辑 operation。
   两侧分别建立 exact fact-key→`int32` row 索引；每次 operation 都必须回查原始 canonical fact
   bytes 与 CID，重复、缺失或 caller fact 不一致立即拒绝。
2. 若 schema CID 或 profile set 变化，找出唯一“after fact kind 为 `csg.core.schema`”的 insert 或
   replace，定义为 terminal schema operation；缺失、重复或 delete-only 均拒绝。
3. 其余 operation 按 `query_key` 的原始 UTF-8 bytes 严格升序；重复 key 拒绝。
4. terminal schema operation 固定追加为最后一项。若 binding 不变，不存在 terminal 特例，全部
   operation 只按 query key 排序。

这样 profile add 的最小形状是“dialect insert + old anonymous schema delete + new anonymous
schema insert terminal”；remove 是其逆语义；profile A→B 是 old dialect delete + new dialect
insert + schema delete/insert terminal。即使调用方把 delete/insert 分组、反转输入或伪造 replace，
重算后也只能得到同一顺序。

## Sole CSGC Wire

### Batch cargo

唯一 batch cargo 使用现有 64-byte CSGC。第一条是
`csg.merkle.admitted_delta_batch` header，随后恰好 `operation_count` 条
`csg.merkle.admitted_delta_batch_operation` reference。header 逻辑字段固定为：

```text
after_csgc_directory_cid
after_csgc_object_cid
after_dag_root_cid
after_fact_count
after_facts_root
after_profile_set_cid
after_profiles
after_schema_cid
after_schema_namespace
after_standard
after_subgraph_cid
before_csgc_directory_cid
before_csgc_object_cid
before_dag_root_cid
before_fact_count
before_facts_root
before_profile_set_cid
before_profiles
before_schema_cid
before_schema_namespace
before_standard
before_subgraph_cid
delta_context_cid
id = "delta"
kind = "csg.merkle.admitted_delta_batch"
operation_count
schema = "csg_core::v1"
```

每条 reference 固定为：

```text
id = "operation:<ordinal>"
kind = "csg.merkle.admitted_delta_batch_operation"
operation_cid
operation_csgc_hex
operation_kind
ordinal
proof_cid
proof_csgc_hex
query_key
schema = "csg_core::v1"
```

`ordinal` 从 0 连续递增。`operation_csgc_hex/proof_csgc_hex` 是相应唯一 CSGC bytes 的 lowercase
hex，长度必须为偶数并受 batch resource budget 约束；CID 必须从解码出的真实 bytes 重算。
因此 batch CSGC 是自包含的，不依赖 caller object resolver。store 可以按 CID 提取并去重这些
对象，但不得生成或接受另一种 object bytes。batch decoder 必须 typed-decode、重算 context、
逐项 replay、用唯一 writer 重编码并与输入 bytes 逐字节相等。

```text
delta_cid =
  "sha256:" + hex(
    SHA256(text("csg_core.merkle.admitted_delta") ||
           u32le(batch_csgc_byte_count) || batch_csgc_bytes))
```

### Operation cargo

原 `csg.merkle.transaction_operation` 原地替换，不增加 v2/legacy decoder。`fact/fact_cid` 与
逐 operation `before_facts_root/after_facts_root` 删除，改为显式双侧 fact 和结构状态：

```text
after_dag_root_cid
after_fact
after_fact_cid
after_fact_count
after_schema_cid
after_state_subgraph_cid
before_dag_root_cid
before_fact
before_fact_cid
before_fact_count
before_schema_cid
before_state_subgraph_cid
delta_context_cid
id = "operation:<ordinal>"
kind = "csg.merkle.transaction_operation"
operation_count
operation_kind = "delete" | "replace" | "insert"
ordinal
proof_cid
query_key
schema = "csg_core::v1"
```

`before_schema_cid/after_schema_cid` 始终绑定 batch 的两个 production-admitted 端点，不表示
中间图已经通过 schema admission。delete 要求 after fact 为空且 CID=`none`；insert 要求 before
fact 为空且 CID=`none`；replace 要求双侧非空、key 相同、bytes 不同。fact CID 必须由 raw
canonical bytes 重算。

### Sole proof cargo

不新增第二 proof kind。现有唯一 `csg.merkle.proof` 原地成为按 `proof_scope` 判别的严格 tagged
union：

```text
proof_scope = "snapshot"       -> 现有 facts_root/schema/profiles binding
proof_scope = "admitted_delta" -> delta_context_cid + operation_ordinal + state_subgraph_cid
```

公共结构字段 `dag_root_cid/query_key/exists/terminal/path/fact_count` 保持一套算法和 writer。
`admitted_delta` proof 不携带、计算或输出中间 `facts_root`；它证明 operation 前 state subgraph
上的 membership/non-membership，并绑定 batch context 与 ordinal。两个 scope 的字段集合互斥，
缺字段、混合字段或 legacy 无 tag cargo 全部 hard-fail。decoder 仍必须按同一 writer 重编码逐字节
对拍，proof CID 必须由实际 proof bytes 重算。proof 的 `delta_context_cid` 必须等于 batch header
重算值，因此它同时绑定 before/after facts root、schema/profile、CSGC object/directory、DAG/subgraph、
fact count 与完整 canonical operation descriptor 序列，而不是只绑定当前 key。

## Root and Proof State Machine

issuer 固定执行以下状态机，任一步失败即销毁私有缓冲区并返回零输出：

```text
strict-admit(before CSGC) -> exact before endpoint
strict-admit(after CSGC)  -> exact after endpoint
derive canonical diff/order/context
current = before DAG/subgraph/count
for ordinal in canonical operations:
  derive proof from current state
  encode proof; decode/re-encode byte-compare
  apply exactly one insert/delete/replace
  compare operation before_state with current
  compare operation after_state with replay result
  encode operation; decode/re-encode byte-compare
  current = replay result
require current DAG/subgraph/count == admitted after endpoint
compute after_facts_root once with exact after binding
require equality with admitted after facts_root
encode batch; decode/replay/re-encode byte-compare
register SoA row and return handle
```

每个 proof 只能证明其 ordinal 的 pre-state；proof 跨 ordinal、跨 batch、跨 before state 重放均
拒绝。最终 after root 必须同时通过 full after DAG、operation 链和 after binding 三路对拍。

## Layer Replacement

```text
wire/schema
  新增唯一 batch header/reference closed-field schema；原 operation/proof schema 原地升级，
  旧缺字段 cargo hard-fail，不保留兼容 reader。

operation
  merkle_transaction_operation 只接受 batch context + ordinal + 双侧 fact/schema + state subgraph；
  删除 proof-only、single-replace 与 caller-provided after-root 生产入口。

admission
  merkle_admission 成为唯一 batch issuer/replayer；双侧 ProductionAdmit、exact fact lookup、
  canonical diff、逐步 proof、最终 DAG/CSGC 对拍全部在同一调用中闭合。

transaction
  merkle_transaction 不再限制 operations.len==1，也不逐项调用 admitted-replace builder；
  只把完整 before/after CSGC 交给 batch issuer，并从可重新 resolve/replay 的 admitted handle
  生成 plan。

store
  merkle_store bottom admission 从内容寻址原始 batch bytes 提取其内嵌 operation/proof CSGC，
  重新 typed-decode；重建 request diff、context、顺序与 replay 后才允许 predecessor-keyed
  successor commit。

replay
  transaction、receipt reuse、historical replay 与 CLI 共用同一个 batch replay；不得保留
  relfacts-only、proof-only 或 caller-array replay。

CSGC
  endpoint、proof、operation、batch、plan、receipt 全部复用唯一 CSGC encoder/decoder；
  每层都做 writer roundtrip byte equality，任何可塑编码先于 root/plan/output 拒绝。

CLI
  生产接口统一为 `csg delta encode/replay` 并只读写 admitted-delta `.csgc`。历史
  `csg relfacts encode/replay` 文本 sidecar 从生产面 hard-fail；若保留，只能是显式 sandbox
  debug export，必须 `complete=false` 且不能携带可消费 root/proof/capability。`delta replay`
  只需 authoritative before/after CSGC 与自包含 delta CSGC，不接受 caller 指定 object resolver。
```

plan header 与 receipt 必须新增 `delta_cid`、`delta_context_cid` 和 `operation_count`，并继续绑定
有序 operation/proof CID。plan root 从最终将持久化的 batch/operation/proof 原始 bytes 重建；
caller 缓存 CID 不可用。request 的 replacement facts 仍须和 full diff 一一对应。

## Failure and Atomic Commit Contract

- Plan 全程只读；成功前 store write count、publish count、CLI stdout、目标文件均为零。
- Apply 只可写 transaction-private held-directory staging。所有 batch、operation、proof、manifest、
  receipt 与 referenced objects 写完、fsync、从 held fd 重读并 replay 成功后，才允许唯一一次
  predecessor-keyed successor no-replace directory commit。
- commit 前失败必须让 staging 不可达且不返回任何 CID/root/receipt；commit 后 recovery 必须看到
  完整 successor。不存在“只提交 operation 前缀”“先发布 manifest 再补 proof”或可观察的 profile
  中间态。
- CLI 目标采用 held parent dirfd + exclusive temp + fsync + atomic no-replace rename。错误退出时 stdout
  与目标文件均为空/不存在，只允许 stderr 的稳定 `error: merkle_delta_*`；参数错误返回 2，admission/
  replay/store 错误返回 1，完整成功返回 0。
- production execution 只能消费已 claim 且重新 replay 的 admitted batch successor；任何失败、
  未登记 handle、旧 wire、
  prefix receipt 或 launcher authority 不完整都在 source/provider/cache/native child I/O 前拒绝。

## Standard Clauses to Replace After Approval

以下均是替换，不是追加例外：

1. `docs/csg-core-standard.md:500-514`：plan 从只绑定有序 operation 三元组改为直接绑定唯一
   `delta_cid/delta_context_cid`，并继续核对其内有序 operation/proof CID。
2. `docs/csg-core-standard.md:516-559`：把单 operation wire、“用 proof.schema_cid 逐 operation
   计算 after_facts_root”和“profile 变化恰好一个 operation”替换为 batch wire、显式 before/after
   schema CID、state subgraph proof、多个 canonical operation 与仅终点 after-root 重绑。
3. `docs/csg-core-standard.md:570-575`：把 `operation_kind|length:key` 排序替换为 query-key UTF-8
   顺序 + terminal schema operation；plan 必须直接绑定 `delta_cid/context_cid`。
4. `docs/csg-core-standard.md:586-594`：Plan/Receipt 从逐 operation 最终 roots 改为重放 admitted batch
   并只对拍两个 admitted endpoints。
5. `docs/csg-core-standard.md:608-626`：operation producer 与 bottom admission 改为先重建完整
   before/after diff/context/order，再验证 batch 与 request/replacement 一一对应。
6. `docs/csg-core-standard.md:632-637`：把先写全局 referenced objects 的顺序替换为 transaction-private
   held-directory staging、全量重读 replay、唯一 successor no-replace commit；失败不得留下 authority。
7. `docs/csg-core-standard.md:641-655`：单 proof 直接得到完整 transition after root 的表述替换为
   per-operation state-subgraph proof 链 + batch final after binding；中间状态明确不是 facts root。
8. `docs/csg-core-standard.md:1016-1059`：生产 relfacts 文本 sidecar 与 `csg relfacts` 终局接口替换
   为 admitted-delta CSGC 与 `csg delta encode/replay`；保留双侧 historical authority、strict
   admission 与 after oracle 要求。
9. `docs/csg-core-standard.md:1633-1639`：验收从单 insert/replace/delete 与泛化 profile change，替换
   为 batch fixed-point、profile add/remove/change、删插重排、跨 batch 拼接、prefix/partial commit。
10. `openspec/proposals/csg-core-merkle-dag.md` 的同名单-operation/profile-transition 段落由本提案
   supersede；归档时必须同步，不能留下两份 normative 口径。

`docs/csg-core-standard.md:314` 的“profiles 由实际 fact kind 唯一推导”、`:427-440` 的唯一
facts-root 公式以及 `:1031-1057` 的双侧 strict admission/after oracle 原则保留并成为实现依据，
不得放宽 validator 闭包来迁就旧模型。

## Required Positive Matrix

| Case | Canonical delta | Required result |
|---|---|---|
| one stable-id replace | one replace | batch/replay/final roots pass |
| anonymous fact change | delete + insert | fixed bytes/order; no replace folding |
| multi-key mixed delta | delete/replace/insert | query-key order and exact after DAG pass |
| profile add | dialect inserts + old schema delete + new schema terminal | after profiles/schema/root exact |
| profile remove | dialect deletes + old schema delete + new schema terminal | reverse replay endpoint exact |
| profile A→B | old dialect deletes + new dialect inserts + schema terminal | no intermediate manifest/output |
| same semantic input order/history perturbation | same derived diff | identical proof/op/batch CSGC and CIDs |
| receipt reuse/restart | reread stored raw objects | identical batch replay and successor |

profile fixtures 必须使用 validator 当前真实 kind/feature mapping 构造，不能手填 profile 数组或 Mock
manifest；add/remove/change 都必须同时验证正向与反向 transition。

## Required Mutation Matrix

| Family | Mutations that must be RED |
|---|---|
| endpoint admission | before/after noncanonical bytes, missing schema, duplicate schema, feature/fact-kind mismatch, incomplete/unsupported/tombstone |
| cross-batch | swap one proof, operation, context CID, endpoint schema CID, batch CID or ordinal between two independently valid batches |
| diff completeness | omit changed key, add unchanged key, duplicate key, forge replace for anonymous change, wrong fact CID, binding-only zero diff |
| ordering | swap adjacent operations, reverse all, group all deletes before inserts, move terminal schema operation earlier, duplicate/skip ordinal |
| proof chain | proof against endpoint instead of current state, wrong membership mode, wrong path direction/sibling/count, reuse proof at another ordinal |
| binding | use before schema/profile for final root, caller-provided after root, wrong before/after schema CID, profile set CID or schema namespace |
| batch CSGC | truncate header/ref, extra ref, count drift, alternate dictionary order, unused entry, extra field, noncanonical integer/escape, re-encode mismatch |
| replay | wrong before CSGC, wrong after oracle, valid batch with another endpoint, apply only prefix, apply suffix twice, mutate final DAG/root/count |
| plan/receipt | reorder op/proof CID, replace delta CID, cached CID without raw bytes, receipt missing terminal op, reuse on another predecessor |
| partial commit | crash after each staged object, after fsync, before successor commit, during no-replace conflict, immediately after commit; recovery sees zero or complete successor only |
| CLI zero output | every parse/admission/replay/store mutation asserts nonzero exit, empty stdout, absent destination and zero production child starts |
| legacy bypass | old single-replace builder, proof-only decoder/replay, relfacts production sidecar, direct caller operation array, legacy schema cargo remain unreachable/hard-fail |

contract tests 必须真正删/换/乱序对应 token 或调用边，证明 gate 能红；只检查错误字符串存在不算
mutation coverage。

## One-batch Implementation Scope After Approval

此变更不能拆成“先让 profile gate 变绿、以后再补 store/replay”的可发布中间态。获批后的唯一
apply 批次必须同时覆盖：

```text
docs/csg-core-standard.md
openspec/proposals/csg-core-merkle-dag.md
src/core/csg_core/merkle_dag.cheng
src/core/csg_core/merkle_cargo.cheng
src/core/csg_core/merkle_transaction_operation.cheng
src/core/csg_core/merkle_admission.cheng
src/core/csg_core/merkle_transaction.cheng
src/core/csg_core/merkle_transaction_request.cheng
src/core/csg_core/merkle_transaction_receipt.cheng
src/core/csg_core/merkle_store.cheng
src/core/csg_core/merkle_store_codec.cheng
src/core/csg_core/merkle_store_pipeline.cheng
src/core/csg_core/relfacts.cheng
src/core/csg_core/cli.cheng
src/tests/csg_core_merkle_admitted_delta_batch_smoke.cheng
tools/csg_core_plan_proof_admission_binding_gate.sh
tools/csg_core_merkle_dag_operation_static_gate.sh
tools/csg_core_profile_transition_static_gate.sh
对应 contract mutation gate
```

实际文件名以 apply 前 `rg` 的唯一 owner 为准；不得新建平行 store、codec、proof 或 CLI runtime。
`bootstrap/cold_parser.c` 与 ProductionAdmittedInput capability 提案不在本变更范围。
生产语义实现只允许纯 Cheng；shell 只做静态/变异/动态编排，不得承载 diff、root、proof、replay
或 canonical CSGC 算法。

## Verification and Done

```text
bash -n
  所有新增/修改 shell gate 与 contract test

static/contract
  unique batch owner/reachability
  operation/proof legacy hard-fail
  canonical order + terminal schema
  exact before/after schema/profile/root binding
  CSGC decode/re-encode byte equality
  plan/receipt/store bottom replay
  CLI zero-output and production pre-exec denial
  上述 mutation matrix逐项 RED

focused pure Cheng
  stable replace
  anonymous delete+insert
  mixed multi-operation
  profile add/remove/A→B 双向
  cross-batch and prefix replay rejection

production dynamic
  official current-source stage3/backend_driver
  精确 1 GiB process-tree guard
  两独立进程输出 final CSGC/facts_root/batch/proof/stdout byte-identical
  syscall crash matrix验证 zero-or-complete successor
```

Done 必须同时满足规范、源码、静态 mutation、纯 Cheng focused dynamic、store crash 与正式跨进程
fixed-point；缺少 official `artifacts/bootstrap/cheng.stage3` 或
`artifacts/backend_driver/cheng` 时固定 `dynamic_completion_credit=0`。Darwin 上无法提供 Linux
cgroup v2 kernel aggregate 证明时必须如实 HARD_RED，不得用 shell RSS 轮询或 pathname 观察替代。

## Confirmation Boundary

当前停在 OpenSpec `propose`。用户确认本提案前，不进入 `apply`；确认后必须按上述一个原子批次
实施、验证，最后才进入 `archive`。
