# CSG-Core Merkle DAG

## Motivation

历史 `facts_root` 是 canonical fact lines 的全量 SHA-256。它只能证明一次完整序列化
字节一致，局部验证必须重读全图，`append/replace/delete` 回执也不能独立重放根转换。

本提案要求把唯一 `facts_root` 原地升级为内容寻址 Patricia Merkle DAG，不保留旧 root
并行版本，不改变 CSGC 64 字节 header，不新增另一种生产 facts 格式。当前纯 Cheng 源码
已有候选 root/proof/replay 与 proof cargo 实现；本提案只同步其字节合同和当前真实状态，
不把源码存在或静态检查记作动态生产完成。

## Canonical Identity

每条 fact 的唯一 Merkle key：

```text
存在非空 id  -> "id:" + id
否则         -> "anonymous:" + kind + ":" + hex(fact_hash)
```

key 必须全局唯一。相同 `id`、完全相同的匿名 fact、SHA-256 key collision 全部
hard-fail。匿名 fact 修改按 delete+insert 回放。

## Hash Contract

全部 hash 使用 SHA-256。`text(x)` 固定为 `u32le(UTF-8 byte length) || UTF-8 bytes`；
下列 hash preimage 中的 CID/hash 字段固定写入 32 个原始字节，不写 `sha256:` 文本或
hex。禁止字符串直接拼接：

```text
key_hash =
  SHA256(text("csg_core.merkle.key") || text(key))

fact_hash =
  SHA256(text("csg_core.merkle.fact") || text(canonical_fact))

leaf_hash =
  SHA256(text("csg_core.merkle.leaf") || key_hash || fact_hash)

branch_hash =
  SHA256(text("csg_core.merkle.branch") ||
         u32le(split_bit) ||
         u32le(left_count) || left_hash ||
         u32le(right_count) || right_hash)

empty_hash =
  SHA256(text("csg_core.merkle.empty") || text(""))

subgraph_hash =
  SHA256(text("csg_core.merkle.subgraph") ||
         u32le(fact_count) || dag_root_hash)

subgraph_cid = "sha256:" + hex(subgraph_hash)

facts_root =
  "sha256:" + hex(
    SHA256(text("csg_core.merkle.facts_root") ||
           text(standard = "csg_core::v1") ||
           u32le(profile_count) ||
           text(profile[0]) || ... || text(profile[n-1]) ||
           text(schema_namespace = "csg_core::v1") ||
           schema_fact_hash ||
           subgraph_hash))
```

`schema_fact_hash` 是唯一 canonical `csg.core.schema` fact 的 `fact_hash`，也是
`schema_cid` 的 32 字节 payload。profiles 必须由 validator 从 facts 唯一推导，非空、
包含 `csg_core`、按 UTF-8 字节严格升序且无重复；`profile_count` 与完整有序集合同时入根。
调用方提供的 profile、standard 或 schema binding 不是生产 authority，`profile_set_cid`
也不能替代 facts root preimage 中的完整 profile 集合。

Patricia branch 只存在于两个 key hash 首次分叉的位置，不保留 unary node。结构由
key set 唯一决定，与输入顺序、插入顺序和历史编辑顺序无关。

## Proof Cargo

局部证明仍使用唯一 CSGC 物理格式，proof cargo 的 canonical 逻辑行由以下 facts 组成：

```text
csg.merkle.proof
csg.merkle.proof_profile*
csg.merkle.proof_step*
```

header 精确绑定 `dag_root_cid`、`subgraph_cid`、`facts_root`、`fact_count`、
`standard`、`profile_count`、`schema_namespace`、`schema_cid`、`query_key`、`exists`、
`terminal_present`、`terminal_key`、`terminal_fact_hash` 与 `path_count`。

每个 `csg.merkle.proof_profile` 固定携带 `id="profile:<ordinal>"`、`ordinal` 和
`profile`，ordinal 从 0 连续递增，完整恢复 header 承诺的 canonical profile 集合。
每个 `csg.merkle.proof_step` 固定携带 `id="step:<ordinal>"`、`ordinal`、
`split_bit`、`direction`、`sibling_count` 与 `sibling_hash`。路径按 root -> leaf，
`split_bit` 严格递增。整数和布尔字段使用无前导零十进制字符串，布尔只允许 `"0"`/
`"1"`。writer 先物化唯一逻辑集合，再由唯一 CSGC encoder 决定 canonical physical order；
decoder 按 ordinal 恢复 profiles/steps，并以同一 writer 重编码逐字节对拍。重复、缺失、
ordinal 漂移、count 漂移或非 canonical CSGC 均拒绝。

支持：

```text
inclusion proof
non-membership proof
replace transition
insert transition
delete transition
```

验证器只消费 proof cargo、目标 fact（membership 时）和外部可信的 expected
`facts_root`，不读取原始全量 `.csgc`。cargo 自报的 `facts_root` 不能充当生产 authority。

## Incremental Transaction Operation

唯一 transaction-operation wire 是只含一个 canonical
`csg.merkle.transaction_operation` fact 的 CSGC。逻辑行按 writer 固定顺序携带：

```text
after_dag_root_cid, after_fact_count, after_facts_root,
after_profile_set_cid, after_profiles,
before_dag_root_cid, before_fact_count, before_facts_root,
before_profile_set_cid, before_profiles,
fact, fact_cid, id, kind, operation_kind, proof_cid, query_key, schema
```

`before_profiles/before_profile_set_cid` 来自 proof 的 canonical binding；
`after_profiles/after_profile_set_cid` 来自 after facts/manifest 的 canonical binding。
proof 的 standard 与 schema namespace 必须分别精确等于 `csg_core::v1`；foreign
identity 在 proof cargo、patch 和 operation encode 前 hard-fail。builder 先 replay proof 得到
`patch.afterSubgraphCid`，然后以 proof 的 standard、schema namespace、schema CID 和 after
profiles 调用唯一 `CsgCoreMerkleFactsRootForSubgraph`，得到
`after_facts_root`。因此 after root 是 `afterSubgraph -> afterFactsRoot` 的确定性重绑定结果，
不是 caller 输入，也不能沿用 before profiles。

profile set 变化时 incremental admission 只接受恰好一个 operation；零 operation、多个
operation、非末端切换、before proof/profile 链不连续或最终 after binding 不等于 next manifest
全部 hard-fail。profile 不变时，每个 operation 都必须保持 current binding。

insert/replace fact 必须逐字节等于唯一 canonical JSON；delete fact 必须为空且
`fact_cid="none"`。fact、proof cargo、operation cargo 和 next CSGC 任一不是 canonical bytes，
都必须在 root/plan/receipt/successor commit/生产执行之前拒绝，禁止 decode 后规范化再继续。proof 与 operation
decoder 都必须由唯一 writer 重编码并对输入逐字节对拍；replay 还必须对拍 proof CID、before root、
after root、DAG root、fact count、profile binding 和原始 bytes。所有 physical cargo/receipt 的字符串
转义只允许调用 `json_canonical.CsgCoreJsonQuote`；禁止模块复制 JSON quote，控制字节必须稳定回放。

公开 bound builder 对 raw fact 执行逐字节 canonical equality，空记录或 mismatch 在 root 绑定前拒绝；
transaction request 在生成 request CSGC/读取 store 前预检全部 replacement，operation 在 proof cargo
前预检 kind 与 raw fact。production CSGC 完整解码必须先沿 policy-selected store 的连续 successor
链绑定 validated tail、对象 CID、directory CID 与 fact count，并在 decode 前后双读同一 tail key 的
successor absence；缺少 authority 的 strict CLI 变换直接拒绝。relfacts 的 before/after 还必须各自
绑定该 immutable 链内可验证的历史 generation；tail authority 不能证明普通路径。publication authority 已改为 immutable head blob 与
`successors/<previousHeadCid|genesis>` held-dirfd no-replace directory commit，该 commit 是唯一线性化点；same exact bytes
可复用，不同 bytes 冲突，重启只沿连续 successor 恢复，禁止删除 authority。该源码协议与 32 类静态
mutation 已闭合，但真实双进程逐 syscall crash matrix 尚缺。纯 Cheng launcher 现只接受 provider-owned
activation event stream；事件源未接线时 encode/replay 在任何 history/candidate/sidecar I/O 前精确
`HARD_RED:production_launcher_held_exec_event_source_unwired`。

canonical JSONL 是 pure Cheng `pack` 的唯一生产者输入，不是生产执行 authority。strict
`admit/root/index/prove` 只接受 policy-selected validated successor-tail 授权 CSGC；`pack` 反向拒绝 CSGC 输入。
bootstrap C/H、Python、Rust、TS source/dist/frozen 都不得拥有第二套 CSGC、facts_root 或 proof 算法；
quarantine、不可发布声明或 wrapper reachability 不能把物理存在的第二 codec 变成合法证据。

## Files / Actions / Verification / Done

```text
src/core/csg_core/merkle_dag.cheng
  action: SOURCE_PRESENT；实现 Patricia root、proof、insert/replace/delete replay
  verify: SOURCE_REVIEW_ONLY；已对拍本提案中的 domain/framing/binding，未跑 current-source 动态门
  done: NOT_CREDITED；未以受认证 launcher 回执证明 root/order invariance 与正反 replay

src/core/csg_core/merkle_cargo.cheng
  action: SOURCE_PRESENT；以唯一 CSGC 编解码 proof/proof_profile/proof_step
  verify: SOURCE_REVIEW_ONLY；已核 header/profile/step 字段、count、重编码逐字节拒绝路径
  done: NOT_CREDITED；未做 current-source 跨进程 encode/decode/verify 动态对拍

src/core/csg_core/validator.cheng
  action: SOURCE_PRESENT；从 canonical facts 推导 standard/profiles/schema 后调用 Merkle DAG
  verify: SOURCE_REVIEW_ONLY；已见 validate/root binding 接线，未执行仓库级唯一 authority 动态门
  done: NOT_CREDITED；未据此声称仓库第二 root 已被动态排除

src/core/csg_core/data_edit.cheng
  action: SOURCE_PRESENT；edit 前生成 proof/replay，候选 strict admission 后对拍完整图 root/count
  verify: SOURCE_REVIEW_ONLY；已见 append/replace/delete 接线，未跑变异或崩溃回放动态门
  done: NOT_CREDITED；proof/fact/direction/count/root 全部漂移拒绝尚无本轮动态回执

src/core/csg_core/cli.cheng
  action: SOURCE_PRESENT；JSONL 只进入 canonical pack；strict admit/root/index/prove 只读 validated successor-tail 授权 CSGC；prove/verify-proof/replay 使用 merkle_dag + merkle_cargo
  verify: STATIC_CONTRACT；CLI output 49、TS lazy authority、unique held-exec fail-closed 50 类 mutation 通过；跨进程 fixed-point contract 35 类 mutation 通过并覆盖提前成功、间接副作用、alternate proof、output buffer 生命周期与 stdout 封存；默认 fixture 只标 reviewed_default_path_untrusted，任何 override 标为 override_nonproduction，当前动态信用为 0；bootstrap binary/text codec、公开命令、tools 旧 surface、frozen 第二 identity 与 stale quarantine 已物理删除
  done: NOT_CREDITED；跨进程授权 CSGC/root/proof/replay 仍无正式 stage3 与动态回执

src/core/csg_core/merkle_transaction_operation.cheng
  action: SOURCE_PRESENT；operation wire 同时绑定 before/after profiles、profile_set_cid、root/count 与 proof CID
  verify: SOURCE_REVIEW_ONLY；已核 afterSubgraph 以 after profiles 重绑定 afterFactsRoot 及逐字节 replay
  done: NOT_CREDITED；未跑 current-source 跨 profile 单 operation 正反动态矩阵

src/core/csg_core/merkle_admission.cheng
  action: SOURCE_PRESENT；incremental admission 证明 proof/profile/root 链并限制跨 profile 为单 operation
  verify: SOURCE_REVIEW_ONLY；已核 previous/next binding、terminal transition 和 final root 对拍
  done: NOT_CREDITED；未取得受认证 production launcher 与受限动态闭包回执

src/core/csg_core/{merkle_store,compiler_snapshot_cargo}.cheng
  action: SOURCE_PRESENT；snapshot receipt 绑定目标 predecessor-keyed immutable successor record 与该 record 的 authoritative receipt，不依赖 mutable current 或后置 publication fence
  verify: STATIC_CONTRACT；snapshot static 8、request admission 92、compiler wiring 21 类 mutation 通过；fixture 覆盖 A→H1、B→H2 后重放 A 仍返回 H1/R1，连续链 validated tail 仍为 H2
  done: NOT_CREDITED；current-source 动态探测因 swap≠0 在编译前拒绝；manifest logical closure 已静态闭合但 heap/allocation/native identity 仍 HARD_RED，官方 stage3 与正式 1 GiB 动态回执仍缺失

ts-csg/src/csg-standard.ts
  action: SOURCE_PRESENT；所有 physical writer/reader/root/identity API 先调用 held-exec launcher identity guard
  verify: GUARDED_GENERATION；source/dist/frozen 三层同为 `held_exec_fail_closed`，48-file freeze manifest=`4f359571…b357`；hostile missing input 先报 launcher HARD_RED，零输入触碰
  done: NOT_CREDITED；provider activation event source 未接线，fail-closed 不能替代正式 native execution receipt

tools/csg_core_production_release_milestone_gate.sh
  action: SOURCE_PRESENT；跨进程 fixed-point 是 relfacts 后、crash 前的第九条件，钉住 fixture/gate/contract；pathname 对拍只能形成 zero-credit observation，并立即 HARD_RED 等待 OS-owned held-exec execution identity
  verify: STATIC_CONTRACT；release 49、aggregate 55 类 mutation 通过，覆盖跳过条件、接受 dynamic0/override/path authority、fixture/gate/contract 漂移及绕过 held-exec fail-stop
  done: NOT_CREDITED；当前 official stage3 缺失，真实 release 必须先 HARD_RED，不能以静态 35 mutation 或 pathname 对拍代替生产动态固定点

docs/csg-core-standard.md
  action: SYNCED；facts_root framing、proof_profile cargo 与 incremental before/after profile binding 已同步
  verify: SOURCE_REVIEW_ONLY；已对拍 merkle_dag/merkle_cargo/merkle_transaction_operation/merkle_admission
  done: NOT_CREDITED；文档同步不替代 current-source 动态门或 production authority
```

本提案当前 `dynamic_completion_credit=0`。streaming manifest 的逻辑语义闭包已闭合，但总堆、
allocation ledger 与 native execution identity 证明仍为 `HARD_RED`；provider-owned activation event source
与跨会话 replay anchor 未接线，精确 `HARD_RED:production_launcher_held_exec_event_source_unwired`、
`launcher_exec_identity=HARD_RED`。因此 production status 固定为 `HARD_RED`，本次文档
同步、源码静态阅读、`rg` 或 `diff --check` 都不能改变该状态。

## Prohibited

- 不保留 legacy flat root 兼容字段。
- 不把 proof 改成新的 JSONL 生产格式。
- 不使用输入 ordinal、源码行号、name+arity 或内存地址作为 fact key。
- 不允许 proof verifier 重新读取原始 facts cargo。
- 不用随机 treap、历史相关 B-tree 或启发式 bucket 产生多个有效 root。
- 不允许 strict admit/root/index/prove 接收 JSONL、普通路径解码结果或未被已验证 successor record 命名的 CSGC。
- 不允许 bootstrap C/H、Python、Rust、TS source/dist/frozen 保留第二 CSGC/root/proof codec；quarantine 不算删除。

## BodyIR Cleanup Authority

CSG/Merkle 完整性不能替代所有权调度授权。生产 BodyIR 必须同时携带三个互不替代的证明域：

```text
BodyIRCleanupIntentSidecar
  rewrite 前封印原始 CFG、退出边、作用域、selected defer CSR
  以及 defer/snapshot/drop/transition 的完整 unit 意图顺序

BodyIRCleanupScheduleSidecar
  rewrite 后绑定每个 intent unit 的物理范围、唯一直接后继、
  获准 continuation、payload CID 与 placement CID

BodyIRDeferReplaySidecar
  只证明 defer template 与 replay 内容等价
  通过 int32 intent/unit row 加入完整 cleanup authority
```

授权成立必须同时满足：

```text
relation proof
  template 与 replay、ownership action 与 unit payload 精确等价

placement proof
  source edge 直接进入首 unit
  unit 只能直接进入下一个获准 unit 或最终 continuation
  unit 内部块没有未授权 predecessor
  实际 unit 集合和顺序与 intent 完全相同

external admission
  最终 authority root 与上层 CompilerCSG/CSGC 提供的 expected root 相同
  expected root 的信任链固定为已验证 immutable successor/manifest/receipt 下的
  factsRootCid -> FunctionId -> functionFragmentCid/interfaceCid
```

`reachable(source, unit)` 不是 placement proof。detour、diamond bypass、遗漏/额外/交换
unit、错误 condition slot、错误 clear policy、drop/defer 交换、transition 提前和外部
predecessor 必须在重算 artifact 内全部 hash 后仍被拒绝。

封印顺序固定为：

```text
sealed CompilerCSG/OwnershipDrop authority
  -> seal cleanup intent
  -> open exact BodyIR mutation
  -> append-only materialization + 唯一 source-edge rewrite
  -> seal BodyIR control flow
  -> seal cleanup schedule
  -> compare external expected authority root
  -> backend2/BodyIrAccess/primary/regalloc 重复验证
```

禁止：

- 从 rewrite 后 CFG 反推已经丢失的原始 edge/scope 意图。
- 用 BFS、存在路径或源码文本作为 placement authority。
- 由 seal 覆盖调用方提供的 CID 来“修复”不一致。
- 仅记录 defer replay，遗漏 snapshot/drop/transition。
- 只校验 artifact 内部自填 root，不与外部 expected root 对拍。
- 从 BodyIR、skip-lower envelope 或其同文件 receipt 读取 expected root；这些字节与 artifact 同属一个
  可重哈希边界，不能充当外部授权。

## Ownership Transition Matrix

CSG 持久化和 cleanup authority 开始 lowering 前，所有托管值转换必须命中下列
静态冻结矩阵。接口种类不得在实现阶段追加；只有 `op_id`、CFG row/range、CID 和
root 等物理值允许按已冻结接口晚绑定。

| source | target | admitted transition | required immutable evidence | otherwise |
|---|---|---|---|---|
| Owned temporary/call result | owning local/field/return/container | Move | exact TypeId、value-def、place、origin、single consume、CFG live | hard-fail |
| Owned named value | second owner | explicit `share(value)` | owner root、Share definition、retain、new Move value-def | hard-fail |
| Borrowed value | borrowed `var`/`@borrows` call | Borrow | owner root、projection、callee/formal identity、non-escape | hard-fail |
| Borrowed `str` | owning local/field/return/container | explicit owned clone such as `strings.CloneStr` | borrowed source edge、Owned call result、independent allocation | hard-fail |
| Borrowed value | `share(value)` | none | none | hard-fail |
| Exact static `str` literal | owning `str[]` element | Plain record transfer | STR_LITERAL producer、exact TypeId、zero-owner store flags、single consume | hard-fail |
| Plain unmanaged value | value local/field/return/container | byte value transfer | exact type/layout/value-def | hard-fail |
| Any live managed value | overwrite/drop | Replace/Drop | new-value ownership、old-value current definition、retain-before-release、single consume | hard-fail |
| Branch/loop definitions | CFG merge | ownership-preserving merge | immutable predecessor CSR、same owner root、per-edge liveness | hard-fail |

逐层职责固定为：

```text
TypedExpr  决定 Owned/Borrowed/Plain、escape 与显式 share/clone 意图
CallOp     绑定 callee/formal、Borrow/Move/Share 参数边和返回摘要
BodyIR     发布不可变 value-def/source/consume/CFG placement
backend    只消费 BodyIR 所选动作，禁止按 callee/name/LocalSlot 猜 ownership
ORC        执行 retain/release/move/drop 并产生可对拍计数与终态回执
```

必须固定覆盖：无显式 owned value 的 borrowed→`str[]`、borrowed→return/field、
重复 consume、merge 后复活、错 owner root、错 placement、retain/release 次序交换。
