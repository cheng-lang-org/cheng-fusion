# CSG-Core Bound Replace Replay Single Authority

状态：`applying`。2026-08-09 用户已明确确认进入 apply；当前按实施原子1先推进AtomicTree
exclusive-or-absent、同handle连续状态机、Darwin/Linux libc与Linux aarch64 nolibc唯一provider及结构门。
在该原子及其真实并发/provider回执闭合前，生产实现、性能与动态完成信用保持0。

## 目标

把同 key、同 kind、schema/profile binding 不变的单 replace 收口为唯一生产链：

```text
已封存 before authority + canonical after fact/binding admission
  -> 唯一 proof
  -> CsgCoreMerkleReplayReplaceBound
  -> 冻结 SemanticReplaceDelta / operation carrier
  -> transaction 语义内存预验
  -> CsgcProjectionMaterialize（派生 flat bytes）
  -> projection-finalized manifest + 全 artifact prepublish verify/session
  -> content-addressed object write
  -> store durable semantic replay + projection check
  -> HEAD commit
```

当前所谓增量入口先对 before/after 各做一次完整 production admission、全量 DAG build 与 CSGC
encode，再在 `CsgCoreMerkleAdmitReplaceDelta` 生成 proof 后直接调用
`CsgCoreMerklePatchReplaceBound`；operation、transaction 继续直接消费 patch，store 只通过
`DecodeWithAdmission` 重建并对拍。`CsgCoreMerkleReplayReplaceBound` 在生产树中没有调用者，
现有静态门只检查其孤立函数体，因此不能证明 proof replay 生产可达，也不能证明真实增量；当前
root 等价只由重复 full oracle 强制，不是增量内核自身的证据。

## 冻结合同

1. `CsgCoreMerkleReplayReplaceBound` 是唯一公开 bound replace mutation primitive。
   它必须一次完成可信 before root 校验、before fact inclusion、after fact canonical/key/kind
   校验、Patricia path-copy，并从同一 patch 生成 replay summary；禁止第二次计算 root 或 patch。
2. `CsgCoreMerklePatchReplaceBound` 改为模块私有实现并使用小写标识符。生产模块、测试和门禁
   不得再导入或调用公开 PatchReplaceBound；旧公开符号不保留 alias、wrapper 或兼容入口。
3. `CsgCoreMerkleAdmitReplaceDelta` 仍是唯一 issuer。它只消费已封存、可重验的 before CSGC/DAG
   authority、canonical after fact 与同一 schema/profile binding；before inclusion proof 必须由 sealed before
   DAG 在 issuer 内唯一派生，production request/API不接收caller proof。expected proof bytes只存在于独立
   differential test进程，不能影响production success。完成
   精确 lookup 后恰好调用一次 ReplayReplaceBound；不得直接调用私有 patch engine。该语义阶段的生产可达闭包
   禁止把 whole before/after fact set 再送入 full `CsgCoreProductionAdmitFactLinesWithDag`、full DAG
   `BuildBound` 或 `CsgcEncodeCanonicalLines` 来决定 root。proof cargo、operation cargo 与 semantic plan cargo
   的有界 canonical encode 允许存在，但必须使用各自独立 domain/receipt/byte budget，且不得读取完整 after
   fact set或签发 facts_root/DAG root。full rebuild 只能存在于独立 test oracle，不能成为
   production success 的前置条件、平行 authority 或失败兜底；派生 flat CSGC 的一次规范物化属于
   第 8 条独立 projection phase，不得反向决定任何语义 authority。
4. `CsgCoreMerkleAdmittedDelta` 原地成为唯一 semantic authority carrier。carrier 绑定：

   ```text
   sealed before manifest/CSGC object identity 与 admitted DAG
   before/after facts_root、subgraph CID、fact count
   query key、before/after canonical fact
   canonical proof
   ReplayReplaceBound 的 replay summary 与 patch nodes
   ```

   replay 结果必须直接携带 canonical fact/fact hash、rebuilt/reused count 与 patch nodes；
   `CsgCoreMerkleAdmittedDelta.patch` 和
   `CsgCoreMerkleTransactionOperationCodecResult.nodes` 删除，禁止 replay、patch、codec 三份平行
   authority。所有下游只能经 `admittedDelta.replay` 读取 summary 与 nodes。
   standard/profile-set/schema identity 必须由新的依赖中性 `csg_core/identity.cheng` 唯一计算并签发
   immutable identity receipt；validator 与 merkle_dag 都只消费该模块，避免 validator↔dag 循环依赖。
   删除 `merkle_dag` 内私有重复的 profile-set CID hash 算法，禁止同一 domain/preimage 的第二实现。
   after CSGC directory/object CID 与 raw bytes 不得进入 semantic carrier；它们只属于第 8 条
   `CsgcProjectionReceipt`，禁止序列化结果成为第二 root issuer。
5. operation builder 只消费 issuer 返回的 carrier，编码 proof cargo 与 operation bytes；不得再
   调用 Patch、猜 root 或从 operation 字段重建 authority。
6. compiler snapshot cargo、PlanStore 与 ApplyStore 不得各自重算 semantic admission、Replay、whole-fact-set
   CSGC projection 或 final manifest。唯一纯内存 plan入口必须构造公开可跨模块传递但opaque、nominal、move-only的
   `CsgCoreMerklePreparedTransaction`；其字段与构造器全部为小写私有，零值、复制、二次move、字段伪造均拒绝。
   sealed payload概念上包含 admitted delta、canonical proof、operation、
   semantic manifest skeleton 与 after-fact iterator authority，并额外绑定 store identity、before HEAD、before
   manifest、before generation 与 canonical request CID。ApplyPreparedStore 必须复验 opaque seal以及当前
   store/head/generation/request 的精确 join，不能接受 caller拼装或跨 generation复用的 carrier。

   `beforeStoreIdentity` 不得再是未定义字符串或 `storeRoot` 的hash投影。新增依赖中性
   `csg_core/merkle_store_identity.cheng`，由其中唯一私有hash实现计算：

   ```text
   storeLayoutCid = H("csg_core.store_layout.v1",
       formatId, markerSchema, orderedCanonicalCategoryNames)
   beforeStoreIdentity = H("csg_core.store_identity.v1",
       formatId, storeLayoutCid, storeInstanceSeed)
   ```

   全部字段按本提案统一length-prefix编码；`storeInstanceSeed` 是store创建时由OS CSPRNG恰好生成一次并写入
   immutable `store.identity.csgc` 的32字节值，熵源不可用、短读、全零或已存在identity record时再次创建均
   hard-fail。StoreInit命中已存在且完整的store时只能走read-only Open复用原seed，不得进入create分支或生成新seed。
   复制整个store保留同一逻辑store identity；需要新identity必须新建store，禁止复制后重签。
   record/object CID、absolute path、parentPath/storeName、`writeOwnerCid`、HEAD、manifest、generation、request、
   receipt及`beforeStoreIdentity`自身均不进入该preimage，因而没有CID自环。`CsgCoreMerkleStoreInit`的新建分支只
   负责原子写初始record，成功后与既有store复用分支都必须委托唯一公开issuer
   `CsgCoreMerkleStoreOpenPathAuthority`读取、规范解码、重算并签发
   `CsgCoreMerkleStoreIdentityReceipt`与path capability；Init/Open/Plan/cargo不得有第二个store identity hash实现，
   production API也不接收caller `beforeStoreIdentity`。

   store内容authority与本机路径authority必须拆开：

   - `CsgCoreMerkleSealedBeforeAuthority` 是公开opaque、nominal、move-only且store-neutral的内容capability，唯一
     `CsgCoreMerkleSealedBeforeVerify`从完整准入的before manifest/CSGC/DAG/artifact closure签发。其portable
     `sealedBeforeContentCid = H("csg_core.sealed_before_content.v1",
     bindingIdentityReceiptCid, beforeManifestCid, beforeCsgcDirectoryCid, beforeCsgcObjectCid,
     beforeFactsRoot, beforeDagRoot, beforeSubgraphCid, factCount, beforeArtifactClosureCid)`；closure排除该CID自身、
     store identity、HEAD、transaction receipt与path。相同内容可在不同store重验为同一content CID，不携带
     `storeRoot`、OS handle、pointer或live registry row。
   - `CsgCoreMerkleStorePathAuthority` 是公开opaque、nominal、move-only但永不序列化的本地capability，只能由
     `CsgCoreMerkleStoreOpenPathAuthority`在验证absolute root、exact marker/layout、identity record及独占lease后
     签发；私有payload持有canonical root path、identity receipt与lease generation。path、handle、lease与registry
     token不得进入SemanticPlanRoot、manifest、receipt、artifact CID或任何portable bytes。
   - Prepare必须同时消费exact sealed-before capability与path capability，先证明path当前HEAD的manifest/root/count
     等于sealed-before内容，再把二者线性移入prepared carrier；portable join只记录
     `beforeStoreIdentity + sealedBeforeContentCid + beforeHeadCid + beforeManifestCid + beforeGeneration`。不同path但
     同store identity仍必须持有各自有效lease；同内容但不同store identity产生不同planRoot。任何raw `storeRoot`
     参数、caller identity/content CID、path字符串重算或仅比较HEAD文本的旁路全部拒绝。

   独占lease不是抽象前置条件，必须由纯Cheng可调用的AtomicTree连续状态机唯一实现：

   ```text
   AtomicTreeOpenVerifiedExclusiveOrAbsent(parentPath, finalName)
     -> Result[AtomicTreeExclusiveOpenResult]

   AtomicTreeExclusiveOpenResult.kind in { OPENED, ABSENT }
   AtomicTreeExclusiveOpenResult.tree != 0  # 两种成功态都必须持有live lease

   AtomicTreeBeginFromExclusiveAbsent(tree: var, stagingName)
     -> Result[AtomicTree]

   AtomicTreeCommitExclusiveNoReplaceAndOpenVerified(tree: var)
     -> Result[AtomicTree]
   ```

   Open固定顺序为：验证canonical absolute parent与single final name；以read-only/no-follow/cloexec打开
   canonical parent；在该parent directory inode上取得一次nonblocking exclusive `flock`；钉住parent dev/ino；
   在lease内唯一执行`openat(final, RDONLY|DIRECTORY|NOFOLLOW|CLOEXEC)`。只有final open精确返回`ENOENT`才是
   ABSENT；`EACCES/ELOOP/ENOTDIR`、I/O、lease busy或不支持的OS/filesystem全部Err且不得携带live handle。
   `cheng_host_flock(fd, LOCK_EX|LOCK_NB)`必须是按target互斥的唯一provider定义：Darwin与Linux libc
   closure由`program_support_host_runtime.cheng`的raw `flock` wrapper提供；Linux aarch64 nolibc closure只由
   `system_helpers_backend_nolibc_linux_aarch64.cheng`用syscall 32提供，必须原样传入`LOCK_EX|LOCK_NB`，
   syscall成功清空errno并返回0，负返回值转换为exact positive errno并返回-1。system-link对每个target
   必须证明该export的definition count精确为1，禁止libc host wrapper与nolibc wrapper同时进入同一closure。
   OPENED固定`parentFd>=0/rootFd>=0/leaseHeld=1`并钉住root dev/ino；ABSENT固定
   `parentFd>=0/rootFd=-1/leaseHeld=1`，禁止返回零handle、关闭parent或提前unlock。每次read/verify/transition与
   terminal close都必须重开canonical parent/final binding并逐项对拍保存的parent/root dev/ino；raw path不能恢复authority。

   `AtomicTreeBeginFromExclusiveAbsent`只消费exact ABSENT handle，不再接收parent/final path，不重新open、relock或
   释放parent lease；它在私有registry中原子claim旧generation，创建staging后以同一registry cell、parent FD与lease
   进入transaction，并返回新generation handle，所有旧复制立即stale且并发时只能一个claim成功。claim后任一失败必须
   rollback并终结handle；清理完整性无法证明时fail-stop。`AtomicTreeCommitExclusiveNoReplaceAndOpenVerified`同样消费
   exact transaction generation，在同一cell/lease内完成rename、durability与root identity复验后返回新generation的
   verified OPENED handle，并在此后才允许store identity/path authority issuer读取；禁止close/reopen。持锁commit仍得到
   DestinationExists表示非协作写入或协议破坏，必须hard-fail，
   不得转换成reuse。Init遇OPENED只读验证既有record且不生成seed；只有ABSENT可BeginFrom并为成功新建恰好生成一次seed。
   Plan只接受OPENED；ABSENT必须close后hard-fail，绝不调用Init/Begin/repair。

   ```text
   EMPTY
     -> EXCLUSIVE_ABSENT_HELD
          -> ABSENT_BEGIN_CLAIMED
          -> EXCLUSIVE_TRANSACTION
          -> EXCLUSIVE_COMMITTED
          -> EXCLUSIVE_OPENED_HELD
     -> EXCLUSIVE_OPENED_HELD

   EXCLUSIVE_ABSENT_HELD -> CLOSED
   EXCLUSIVE_OPENED_HELD -> CLOSED
   EXCLUSIVE_TRANSACTION -> CLOSED       # exact abort
   illegal transition or post-claim uncertainty -> POISONED -> terminal cleanup/fail-stop
   ```

   lease固定锁整个parent inode，因此同parent下不同`finalName`也互斥；这是安全但较粗的本地串行边界，不能声称
   name-scoped。OPENED与ABSENT必须锁同一parent inode，不能分别锁root与parent。lease只是同内核、协作进程的本机
   capability，绝不进入portable bytes；path/dev/ino/errno/lease generation/open kind变化不得改变CSGC、facts_root或proof。
   `O_CLOEXEC`不阻止fork继承同一open-file-description，因此path authority live期间的完整production closure必须对
   `fork/posix_spawn/全部spawn/dup/dup2/F_DUPFD/SCM_RIGHTS`零可达，或由另一个已证明的runtime interlock在child侧立即
   关闭；当前合同选择零可达。SIGKILL release动态见证只覆盖无child、无FD复制的holder，不外推成一般fork树证明。

   Open/Plan closure只允许read-only open/openat、fstat/fstatfs、`flock(LOCK_EX|LOCK_NB)`、read/pread与close。
   `creat`，带`O_CREAT/O_EXCL/O_TRUNC/O_WRONLY/O_RDWR/O_APPEND`的open，mkdir、write/pwrite/writev、fsync/fdatasync/sync、
   rename、unlink、link、symlink、truncate、chmod/chown/xattr/mknod、`MAP_SHARED|PROT_WRITE`、lockfile/tempfile创建、提前
   `LOCK_UN`及上述FD复制/进程spawn全部禁止。flock只改变内核lease状态，不计持久写；现有Open中的parent fsync不得被复用。

   projection 前的 planRoot 改成唯一 `SemanticPlanRoot`，使用 domain-separated、length-prefixed SHA-256 对以下
   portable 字段编码，绝不含 after CSGC directory/object CID、CSGC bytes、projection receipt或 final manifest：

   ```text
   beforeStoreIdentity, sealedBeforeContentCid,
   beforeHeadCid, beforeManifestCid, beforeGeneration,
   requestCid, invalidationPlanCid, semanticManifestSkeletonCid,
   operationCid, proofCid, semanticCarrierCid, formatId
   ```

   PlanStore只返回 opaque carrier与该 semantic planRoot且零写出；final transaction receipt随后绑定
   `semanticPlanRoot + semanticCarrierCid + projectionReceiptCid + finalManifestCid`。`compiler_snapshot_cargo`
   必须删除当前先 full admission/DAG/CSGC 再 PlanStore、ApplyStore重算的路径；生产请求不再接收 caller after
   CSGC bytes、after factsRoot、after DAG root或after manifest作 expected对拍。新旧 full结果对拍只存在于
   独立 differential test进程，不能影响 production success。store创建是独立显式生命周期，不属于Plan；Plan只能
   read-only Open既有identity/path authority，missing/invalid identity record直接hard-fail，禁止调用Init、create、
   repair或marker rewrite。因此live registry row分配只算进程内状态，不算artifact/store输出，Plan的object、projection、
   file-write、HEAD与receipt publish计数仍必须全部为零。
7. transaction 只消费 carrier 中同一次 replay 的 summary 更新 root/count，并消费其 patch nodes
   写 overlay。operation wire、proof bytes、manifest binding 与 replay 必须逐项相等后才能形成
   semantic receipt。成功 replace 必须先证明 `N >= 1` 且 `beforeFact != afterFact`；若不同 canonical
   fact bytes得到相同 factHash，或 changed fact得到 `afterRoot == beforeRoot`，必须作为 domain-CID collision
   hard-fail。令已验证 proof
   的 `d = splitBits.len`，并要求 `N = 1 + sum(siblingCounts)`；replay 必须恰好生成 `d + 1` 个两两
   不同、构成最终 root 完整 path 的 node CID。nodes canonical order固定为新 leaf第一，随后按 proof
   ordinal从末到首生成每层 branch直到 root：

   ```text
   semanticRebuilt = d + 1
   semanticReused = sum(2 * siblingCounts[i] - 1)
   semanticRebuilt + semanticReused = 2 * N - 1
   computed = semanticRebuilt
   discarded = 0
   ```

   全部使用 checked `int64`。这些值只能由 proof/path 集合派生，禁止相信可写 counter。物理 CAS 的
   `nodeObjectsWritten` 与 `nodeObjectsReusedFromStore` 是另一组派生计数；每个 replay-node CID必须恰好
   取得一次 CAS write/reuse outcome，二者之和必须等于 `semanticRebuilt`，不得与 semantic reused混用。
   空树、unchanged fact 不是成功边界，必须在 replay
   前拒绝。
8. transaction 必须分成三个不可逆顺序的纯内存 phase：

   - `CsgCoreMerkleTransactionAuthorityVerifyInMemory` 只消费 semantic carrier、operation/proof 与
     `SemanticManifestSkeleton`，重放并逐项对拍；skeleton 不含 csgcByteCount/directoryCid/objectCid，
     verifier 不得消费或签发 after CSGC bytes/CID。
   - `CsgcProjectionMaterialize` 只读已冻结 semantic carrier 与 authenticated after-fact iterator，恰好
     一次生成现行 canonical flat CSGC，并返回
     `CsgcProjectionReceipt { sourceFactsRoot, formatId, factCount, byteCount, directoryCid, objectCid, bytes }`。
     projection verifier 必须逐字节重验 receipt 与已冻结 facts root，但只能返回 bool，禁止返回、改写
     或重签 facts_root、DAG root、proof、replay nodes。
     `AuthenticatedAfterFactIterator` 只能由 sealed before CSGC 的 canonical physical-order stream派生：
     绑定 before object/directory/root/count、query key、before/after canonical fact与唯一 replacement ordinal；
     该 ordinal必须是唯一同 key/kind/beforeFact行并替换为 afterFact，其余行逐字节等于 sealed before stream。
     caller iterator、caller after lines或仅凭 after root反向构造 iterator全部拒绝。
   - projection通过后，唯一 `ManifestFinalizeProjection` 才能把 skeleton 与 projection receipt组合为最终
     manifest。随后 `CsgCoreMerkleTransactionPrepublishVerifyInMemory` 必须逐项重建并验证 request、canonical
     CSGC、partition/membership、每个 node segment、dependency/query shard、summary、operation/proof、最终
     manifest 与 transaction receipt 的全部 bytes/CID/交叉引用，并签发公开可跨transaction/store模块传递、
     但字段/构造器小写私有且nominal move-only的 `PrepublishSession`。零值、复制、二次move或伪造seal全部拒绝。
     session 独占path authority、不可变 artifact buffers、canonical artifact ordinal表与内部
     `nextArtifactOrdinal`。唯一公开写入口
     `CsgCoreMerkleStorePutPreparedObject(session: var)`不接收caller ordinal/kind/CID/bytes/path；它只能从live
     registry当前row借出exact sealed buffer，取得一次 write/reuse outcome后原子推进 cursor。失败使session永久
     不可提交。全部 artifact rows按序恰好推进一次、durable verifier 成功后，HEAD commit才唯一消费整个
     session；禁止复制、跳过、换序、重复推进、换buffer或二次commit。incremental transaction的完整
     source/import closure不得绕过 session直接调用 `CsgCoreMerkleStorePutObject`、
     `csgStorePutObjectVerified`、`csgStoreVerifyExistingObject`或任何 alias/wrapper；任一 artifact未覆盖、session
     伪造或失效均在首写前拒绝。

   opaque字段本身不足以证明线性使用；`merkle_transaction_authority`必须拥有唯一进程内
   `PreparedTransaction/PrepublishSession` live registry。registry使用私有Arena+SoA `int32` row与非零递增epoch，
   capability只携带私有`(row, epoch, kind, authenticator)`，并由完整payload fingerprint重验；row/epoch、随机
   authenticator、cursor、path lease与state全部是ephemeral anti-copy authority，不得序列化、持久化、进入
   SemanticPlanRoot/manifest/transaction receipt/HEAD或参与任何portable CID。进程重启后旧capability一律失效，
   durable read只能从持久receipt重新验证，不能恢复live row。

   每个transaction只允许一条原子状态链：

   ```text
   EMPTY
     -> PREPARED_LIVE
     -> PREPARED_CLAIMED
     -> SESSION_LIVE(nextArtifactOrdinal = 0)
     -> SESSION_PUT_CLAIMED(ordinal = n)
     -> SESSION_LIVE(nextArtifactOrdinal = n + 1)  [逐row重复]
     -> SESSION_ARTIFACTS_COMPLETE
     -> SESSION_DURABLE_VERIFIED
     -> SESSION_COMMIT_CLAIMED
     -> COMMITTED
   any failure -> POISONED
   ```

   `CsgCoreMerkleTransactionPrepare`只有在Replay恰好一次、semantic verifier全绿且所有projection/write counter为零后
   才能从EMPTY签发PREPARED_LIVE。ApplyPreparedStore入口必须先以CAS式registry transition原子消费
   `PREPARED_LIVE -> PREPARED_CLAIMED`，再检查store/head/generation/request join；任何失败转POISONED且零object
   write。projection/finalize/prepublish全绿后，同一row直接转SESSION_LIVE并返回session，prepared capability同时
   失效，不得存在prepared/session两个live handle。每次StorePut先claim当前row，再用registry自有buffer执行唯一
   CAS write/reuse并complete；claim、write或outcome对拍失败均POISONED。最后一row以前不得进入durable verify，
   durable成功以前不得claim commit；HEAD成功且readback相等才COMMITTED。复制的capability至多一个副本能赢得下一
   transition，其余因state/epoch不符hard-fail；POISONED、COMMITTED或旧epoch row永不复活或复用。

   authority helper的依赖方向冻结为：`identity/codec/OS primitives -> merkle_store_identity ->
   merkle_transaction_authority -> merkle_store -> merkle_transaction -> compiler_snapshot_cargo`。
   `merkle_store_identity`不得import transaction/store/cargo；`merkle_transaction_authority`可以import
   store_identity及semantic/artifact模块，但不得import `merkle_store`、`merkle_transaction`或cargo；store只消费
   authority公开opaque transition API，不能读取其私有registry。禁止反向import、callback注册、全局裸指针、
   path文本key或在store/cargo复制一份registry/seal算法。完整source/import gate必须冻结live-registry transition
   的精确授权caller集：prepared/session issue只来自对应verifier，claim/complete只来自唯一StorePut，commit只来自
   PublishHead，poison只来自列明的phase failure funnel；并证明该单向import DAG，死代码与未扫描alias不算授权。

   三个 verifier 与 manifest finalize 都通过前 `csgTransactionPut` 调用数必须为零；任一失败时所有正式 object、HEAD 与
   receipt CID 为空。保持现行 canonical flat 格式时，projection 的最终 materialize/hash/write 必然为
   `Omega(B)`（`B` 为最终 CSGC 字节数）；这不降低 semantic replace 必须为 O(path) 的要求，也不得
   被宣称为 flat object O(path)。
9. portable authority CID只能形成以下单向无环DAG：

   ```text
   semantic carrier / semantic manifest skeleton
     -> CsgcProjectionReceipt
     -> final manifest
     -> transaction receipt
     -> HEAD
   ```

   final manifest可以绑定semantic carrier/skeleton与projection receipt，但禁止包含transaction receipt CID或
   HEAD CID；transaction receipt绑定`semanticPlanRoot`、`semanticCarrierCid`、`projectionReceiptCid`、final
   manifest CID、`beforeStoreIdentity`、`sealedBeforeContentCid`、before/after manifest/root/count、operation/proof
   CID与canonical artifact closure，该closure
   明确排除transaction receipt自身及HEAD；只有HEAD同时绑定final manifest CID与transaction receipt CID。
   receipt decode后重编码必须逐字节相等。portable receipt CID preimage固定为domain-separated、length-prefixed：

   ```text
   semanticCarrierCid = H("csg_core.semantic_replace_delta.v1",
       beforeManifestCid, beforeCsgcObjectCid, beforeFactsRoot, beforeDagRoot,
       afterFactsRoot, afterDagRoot, factCount, queryKey, beforeFact, afterFact,
       canonicalProofCid, semanticRebuilt, semanticReused, orderedReplayNodeCids)
   projectionReceiptCid = H("csg_core.csgc_projection_receipt.v1",
       sourceFactsRoot, formatId, factCount, byteCount, directoryCid, objectCid)
   ```

   raw CSGC bytes只由objectCid绑定，不重复进入projectionReceiptCid；任何receipt/self/HEAD back-edge都拒绝。
   durable store verification必须只从
   这些持久字段、当前path authority验证的store identity、重新验证的store-neutral sealed-before authority、
   operation/proof与stored nodes执行 verification-only decode 并重放 ReplayReplaceBound；它只重算
   semantic carrier canonical preimage/CID并与持久字段逐字节对拍，不签发 carrier 或任何 capability。随后对 stored after CSGC
   做完整 streaming projection check，只重算 projection receipt canonical preimage/CID并与持久字段逐字节对拍，外部仅返回
   `bool`。重启后的 ReadHead/FindRequest/Historical路径不依赖已消失的内存 receipt；publish
   路径还必须把持久重算值与当前 in-memory semantic/projection receipts逐字节对拍。decoder 可以证明 bytes 是 frozen root 的
   canonical projection，但不得从 decoded CSGC 产生或替换 semantic root。proof-only decode、raw Patch、
   caller root 或 decoded-after root 均不得成为成功路径。它必须在
   `CsgCoreMerkleStorePublishHeadIncremental` 内、`csgStoreCommitHeadAtCurrent` 前完成；磁盘读回结果
   必须与内存 semantic/projection 两份回执相等。receipt中的`beforeStoreIdentity`必须与当前path authority
   identity逐字节相等；store identity record、sealed-before closure或path lease任一漂移都不得以同HEAD文本复用。
10. 任一由 caller、sealed input或全部 in-memory artifacts 可判定的语义/authority失败，必须在 object write、
   HEAD commit 与 production execution前 hard-fail；失败 carrier、bytes、CID、root、nodes与receipt全部为空。
   写后 durable phase 只允许发现 I/O、存储完整性、已有对象字节不一致或 readback漂移；若它报告任何本可在
   内存判定的语义错误，gate必须把它视为 prepublish verifier遗漏并拒绝实现。object write自身的 I/O或
   durability失败可留下不可达的 content-addressed object，但不得形成 receipt authority或HEAD，且不能被
   后续调用当作成功证明。

## 范围

本原子只处理以下 replace：

- before 是完整准入并 seal 的不可变 authority；请求必须完整携带其 CSGC/DAG/root/count/CID binding与
  canonical after fact，不接收caller inclusion proof；issuer-derived proof缺失即拒绝。after authority只能由本次 replay派生，
  不接受 caller 自报的局部 root/count/nodes；
- fact count 不变；
- query key 相同；
- fact kind 相同且不是 `csg.core.schema`；
- standard、schema namespace/CID、profiles 与 profile-set CID 不变。

本提案不依赖尚未确认的 `csg-core-atomic-admitted-delta-batch.md`，也不实现 batch、insert、
delete、schema/profile 变化或匿名 fact 的 delete+insert。

`CsgDataEditApplyLines` 当前在入口已经要求 `ops.len == 1` 且 kind 为 replace，append/delete 在任何
编辑前 hard-fail；本原子只把它的 `admittedDelta.patch` 读取迁移到唯一 replay carrier，不改变该
门。incremental admission 与 transaction/store 同样只接受单 replace。

`csgRelfactsReplayCore` 是另一条公开的 full-rebuild sidecar：单 assert/retract 目前合法，same-key
replace 的 retract+assert 分支会调用 `CsgCoreMerkleAdmitReplaceDelta` 并读取 `.patch`。本原子必须
把该 replace 分支迁移到 replay carrier，同时保持 relfacts 的 full-rebuild append/delete 行为不变；
relfacts 成功不等于 append/delete incremental store 已实现，也不得计入其完成信用。

## 实施原子与依赖顺序

用户确认apply后只能按以下merge-safe顺序推进；任一半切状态不得合入生产入口或取得动态信用：

1. AtomicTree exclusive-or-absent、同handle ABSENT→transaction连续状态机、Darwin/Linux provider roots及真实
   双进程race smoke先闭合；实现顺序固定为libc host raw flock/export + Linux aarch64 nolibc syscall/export +
   target-disjoint provider root → backend allocation-ledger
   cell/bridge/state → `std/os` opaque API → fixture/gates，禁止先暴露无provider实体的新bridge造成unresolved后再补线。
2. 新依赖中性identity唯一拥有standard/profile-set/schema preimage，删除dag重复hash，但暂不切换生产issuer。
3. store identity record/Open path authority、store-neutral sealed-before与prepared/session live-registry基础落地，仍不改写链。
4. 扩展Replay carrier，并一次切换`dag→admission→operation→transaction/data_edit/relfacts`，同时删除公开Patch与
   codec平行nodes；私有旧符号compile-negative及全部相关静态门同批更新。
5. 完成纯内存Prepare/semantic verifier、projection materialize、manifest finalize、prepublish session及request/manifest/
   receipt canonical codec；此阶段仍零object write。
6. 一次原子切换`transaction→store/store_pipeline→cargo→lowering_bridge`到ApplyPrepared/PutPrepared/Publish，
   同一改动删除raw Put、Plan/Apply重复full oracle与旧cargo free/rebuild链。
7. focused聚合fixture及现有wrapper全部通过后，最后只跑一次current-source full production/PURE/Linux 1GiB门。

当前只读审计快照中，单fresh cargo Apply至少执行6次Admit/Patch，因每次Admit内before/after各跑full
admission与whole-set CSGC encode，已经产生至少12次full admission与12次full encode；这组重复必须由上述切换
删除，不能用缓存保留旧issuer。审计时公共Replay入口并集为105 files/34个csg_core模块，canonical manifest SHA-256
为`6a824f0d02e135163beb17c0fe8ad72e467d22947123be84c317f9495d28cf3d`；该值只绑定审计快照，不是未来固定常量。
正式gate必须由current-source compiler重新解析完整closure、冻结原始manifest bytes与逐文件SHA，并要求每个新增
`.cheng`模块显式分类，禁止手写文件数或固定文件列表冒充闭包。

## Files / Action / Verify / Done

| files | action | verify | done |
| --- | --- | --- | --- |
| `src/core/csg_core/identity.cheng`、`merkle_dag.cheng`、`validator.cheng` | 依赖中性 identity receipt 唯一计算 standard/profile-set/schema identity；ReplayReplaceBound 成为唯一公开 primitive；PatchReplaceBound 私有退役；replay 单次携带 summary+nodes | 公开 Patch 全树零命中；Replay 是私有 patch唯一直接 caller；root/path 不二次计算；重复 profile hash 零命中且无 import cycle | production 只有一条 bound mutation与binding authority |
| 新 `src/core/csg_core/merkle_store_identity.cheng` | 唯一实现store layout/identity preimage，Init一次生成并持久化instance seed，Open唯一签发identity receipt与opaque move-only path authority；path/lease不进入portable bytes | 第二hash producer、caller identity、record/self/path/HEAD入preimage、seed重建/全零/短读、raw storeRoot旁路与反向import均RED | prepared跨Plan/Apply绑定同一portable store identity与本地lease |
| `src/std/os.cheng`、`src/core/runtime/program_support_backend.cheng`、`src/core/runtime/program_support_host_runtime.cheng`、`src/std/system_helpers_backend_nolibc_linux_aarch64.cheng` | 新增OPENED/ABSENT nonzero handle、parent-wide nonblocking flock、同handle ABSENT→transaction→committed OPENED连续状态机与terminal cleanup；libc host wrapper与aarch64 syscall 32 wrapper按target互斥 | 锁前existence probe、错误分类、非法状态、路径重开、FD/lease泄漏、错syscall/flags/errno及forbidden syscall mutation全拒绝 | 零持久写且无lease缝隙的纯Cheng可调用path capability |
| `src/core/backend/system_link_exec.cheng`、`src/core/backend/system_link_exec_runtime.cheng`、`src/core/tooling/backend_driver_dispatch_min.cheng`、provider-root smoke | 把AtomicTree新bridge与每target唯一flock实体加入provider closure，aarch64 nolibc与libc host export不得共存 | 删除/替换任一root、同target出现零个/两个flock definition或任一目标落unlocked fallback立即RED；Darwin、Linux x86_64与Linux aarch64真实链接无duplicate/unresolved | 源码存在的bridge不会被provider裁剪且每target只有一个flock owner |
| `src/core/csg_core/merkle_admission.cheng` | `CsgCoreMerkleAdmitReplaceDelta` 从 sealed before authority + canonical after fact 进入 Replay；`CsgCoreMerkleIncrementalAdmissionVerify` 只消费 carrier | semantic closure 中 Replay 恰好一次、Patch/full DAG build/whole-fact-set CSGC projection encode 零次；root/count/nodes 全取 replay | 非 replay 结果不能签发或验证增量 |
| `src/core/csg_core/merkle_transaction_operation.cheng` | operation 只编码/回放 carrier；删除 codec 平行 `nodes` | operation/proof 重编码逐字节一致；任何独立 nodes/root 来源立即 RED | operation 无第二 patch/root/nodes authority |
| 新 `src/core/csg_core/merkle_transaction_authority.cheng` | 唯一签发store-neutral sealed-before、semantic/projection/prepublish authority，拥有字段/构造器私有的公开opaque move-only prepared/session capability及唯一live registry；只向store暴露capability-gated transition API | 三 verifier、manifest finalize、session前 object-write count=0；registry state/epoch/cursor deletion mutation、零值/复制/二次move、删任一 artifact/交叉引用对拍或反向import即 RED | 所有内存可判定语义与派生字节校验在object write前闭合且prepared/session不并存 |
| `src/core/csg_core/csgc.cheng` | 在incremental transaction whole-fact-set closure内，flat encoder只作为frozen semantic carrier的projection materializer并签发独立receipt；不改变data_edit/relfacts/full builder各自现有合法边界 | incremental bytes/root反向依赖零命中；全局dictionary边界逐字节对拍旧encoder；非本原子的full路径不误杀 | 保持唯一CSGC字节但不制造第二root authority |
| `src/core/csg_core/merkle_transaction.cheng` | `csgTransactionApplyPatches`、`csgTransactionOperationCids`、PlanStore/ApplyStore 的 root/count/overlay/semantic receipt 只取同一 replay；semantic verify 后恰好一次 projection，随后 linear prepublish session按序驱动全部 put；计数按 proof path 派生 | 写链、三阶段顺序、summary/nodes/manifest/projection/prepublish receipt/session cursor精确对拍 | receipt 只能由 replay 结果及其唯一 projection 产生 |
| `src/core/csg_core/merkle_transaction_request.cheng` | 定义不含 projection/final-manifest identity 的 semantic request 与SemanticPlanRoot canonical preimage，显式绑定store identity与store-neutral sealed-before content CID；final receipt另行绑定projection/final manifest | planRoot字段/顺序/domain mutation全拒；caller/path/registry入preimage与projection前读取after CSGC/manifest零命中 | Plan可零写且不偷取路径或序列化authority |
| `src/core/csg_core/merkle_manifest.cheng`、`merkle_manifest_verifier.cheng` | 拆 semantic skeleton 与 projection-finalized manifest；移除 production manifest bind中的 full admission/DAG重建；durable verifier只重算持久preimage/bytes | skeleton不含CSGC身份；finalize恰好一次且只接受 projection receipt；manifest不得签发root；restart不恢复issuer | manifest不再形成语义/序列化循环 authority |
| `src/core/csg_core/merkle_transaction_receipt.cheng` | final receipt沿单向DAG持久绑定store identity、sealed-before content CID、semantic plan/carrier、projection receipt、final manifest与排除自身/HEAD的artifact closure；decode后重编码逐字节相等 | 删除/替换任一持久binding、加入path/registry/self/HEAD back-edge或重排字段立即RED；重启后无需内存回执即可独立重算并对拍 | durable read/reuse有自足且无环authority |
| `src/core/csg_core/merkle_store.cheng`、`merkle_store_pipeline.cheng` | 只消费path/session capability；唯一公开`CsgCoreMerkleStorePutPreparedObject(session: var)`从registry current row取buffer并逐ordinal推进，不接收caller path/row/bytes；`csgStoreVerifyTransactionReceipt`从persistent receipt/manifest+durable before authority执行 verification-only decode、Replay与canonical preimage/CID逐字节对拍，再只读检查stored projection，始终只返回bool；PublishHeadIncremental在commit前重验 | incremental closure直达raw PutObject、caller buffer/path、proof-only/raw Patch/decoded-root/错误operation bytes、durable verifier调用OperationBuildAdmittedReplace/AdmitReplaceDelta或签发carrier/receipt capability全拒绝；publish disk回执等于内存预验，重启读路径仅凭持久authority独立重算对拍 | HEAD前完成durable replay与projection verification且不恢复issuer权限 |
| `src/core/csg_core/compiler_snapshot_cargo.cheng`、`src/core/tooling/compiler_snapshot_lowering_bridge.cheng` | 删除 cargo→PlanStore→free→ApplyStore 的 full admission/CSGC/manifest重复计算，只线性传递path/sealed-before/prepared capability；生产参数删除raw storeRoot、caller store identity及caller after bytes/root/manifest | Plan/Apply registry row/epoch、store identity、before head/generation/request join不变；Plan零写；prepared只consume一次；full expected对拍只在独立test | snapshot cargo与bridge没有第二store/root/projection authority |
| `src/core/csg_core/data_edit.cheng`、`relfacts.cheng` | replace 消费点从 `.patch` 迁到 replay；不改变各自 append/delete 合法域 | data_edit append/delete 仍首门拒绝；relfacts assert/retract full-rebuild 正例不回归 | 不误报 append/delete incremental 完成 |
| `src/tests/csg_core_merkle_dag_smoke.cheng`、`csg_core_merkle_transaction_bound_replace_smoke.cheng` | 删除公开 Patch 正例，增加私有符号不可导入、单 carrier 与 prepublish/durable replay 正反例 | import 旧公开符号编译失败；duplicate nodes/patch carrier mutation 全拒绝 | 动态测试只经公开 Replay/Admit 进入 |
| 全量受影响gate/contract与focused smokes | 使用compiler-resolved完整 source/import closure的tokenized调用图、删除变异与新增模块分类；同步退役所有旧公开Patch、三operation oracle与raw Put断言 | 下列reachability/deletion/新增模块/alias mutations 100% kill；一个聚合Cheng fixture编译一次后执行fresh/restart/race多mode | gate证明issuer、publish、read三阶段且不能漏扫新增模块 |
| focused Cheng store smoke | 真实 before/after replace、proof cargo、operation、transaction、store 正反例 | 重复运行 bytes/root/proof/nodes/receipt 相同；错误输入首拒绝点固定；失败 object-write count=0、HEAD 不变；每node恰好一次CAS outcome | current-source 动态回执闭合后才完成 |

三组主门必须同步修改，但它们不是完整清单：

```text
tools/csg_core_incremental_replay_static_gate.sh
tools/csg_core_incremental_replay_static_gate_contract_test
tools/csg_core_unique_fact_kernel_static_gate.sh
tools/csg_core_unique_fact_kernel_static_gate_contract_test
tools/csg_core_production_admission_order_static_gate.sh
tools/csg_core_production_admission_order_static_gate_contract_test
```

同一生产切换还必须同步以下现存门/contract；任何一项继续固定公开Patch、`.patch`、平行nodes、full oracle或
三operation oracle都使切换保持RED：

```text
tools/csg_core_profile_set_static_gate.sh
tools/csg_core_merkle_dag_operation_static_gate.sh
tools/csg_core_merkle_dag_operation_static_gate_contract_test
tools/csg_core_merkle_transaction_operation_move_static_gate.sh
tools/csg_core_merkle_transaction_operation_move_static_gate_contract_test
tools/csg_core_merkle_store_replayed_node_ownership_static_gate.sh
tools/csg_core_merkle_store_replayed_node_ownership_static_gate_contract_test
tools/csg_core_compiler_merkle_transaction_wiring_gate.sh
tools/csg_core_compiler_merkle_transaction_wiring_gate_contract_test
tools/csg_core_compiler_snapshot_merkle_gate.sh
tools/csg_core_merkle_transaction_csgc_directory_gate.sh
tools/csg_core_merkle_transaction_csgc_directory_gate_contract_test
tools/csg_core_merkle_transaction_crash_static_gate.sh
tools/csg_core_merkle_transaction_crash_static_gate_contract_test
tools/csg_core_plan_proof_admission_binding_gate.sh
tools/csg_core_plan_proof_admission_binding_gate_contract_test
tools/csg_core_merkle_request_admission_static_gate.sh
tools/csg_core_merkle_request_admission_static_gate_contract_test
tools/csg_core_merkle_manifest_production_reachability_gate.sh
tools/csg_core_merkle_manifest_production_reachability_gate_contract_test
tools/csg_core_merkle_manifest_allocation_lifecycle_static_gate.sh
tools/csg_core_merkle_manifest_allocation_lifecycle_static_gate_contract_test
tools/csg_core_merkle_csgc_object_static_gate.sh
tools/csg_core_merkle_csgc_object_static_gate_contract_test
tools/csg_core_profile_transition_static_gate.sh
tools/csg_core_profile_transition_static_gate_contract_test
tools/csg_core_merkle_store_smoke.sh
tools/csg_core_merkle_store_smoke_contract_test
tools/csg_core_merkle_dag_smoke.sh
tools/csg_core_merkle_admission_smoke.sh
tools/csg_core_merkle_transaction_bound_replace_smoke.sh
tools/csg_core_merkle_transaction_bound_replace_smoke_contract_test
tools/csg_core_merkle_transaction_operation_smoke.sh
tools/csg_core_compiler_csgc_authority_wiring_gate.sh
tools/csg_core_compiler_csgc_authority_wiring_gate_contract_test
tools/csg_core_csgc_section_consumer_contract_test
tools/csg_core_csgc_section_consumer_security_probe.sh
tools/csg_core_csgc_authority_smoke.sh
tools/csg_core_csgc_authority_contract_test
tools/csg_core_csgc_authority_mutation_test
tools/csg_core_merkle_transaction_request_decode_static_gate.sh
tools/csg_core_merkle_transaction_request_decode_static_gate_contract_test
tools/csg_core_merkle_transaction_receipt_smoke.sh
tools/csg_core_merkle_transaction_receipt_static_mutation_test
tools/csg_core_merkle_transaction_request_smoke.sh
tools/csg_core_merkle_transaction_smoke.sh
tools/csg_core_compiler_merkle_bootstrap_transaction_gate.sh
tools/csg_core_compiler_merkle_bootstrap_transaction_gate_contract_test
tools/csg_core_merkle_query_smoke.sh
tools/csg_core_merkle_query_path_contract.sh
tools/csg_core_merkle_manifest_ownership_static_gate.sh
tools/csg_core_merkle_manifest_ownership_static_gate_contract_test
tools/csg_core_csgc_sealed_store_single_source_static_gate.sh
tools/csg_core_csgc_sealed_store_single_source_static_gate_contract_test
tools/csg_core_csgc_mapped_canonical_seal_static_gate.sh
tools/csg_core_csgc_mapped_canonical_seal_static_gate_contract_test
tools/csg_core_csgc_mapped_reader_static_gate.sh
tools/csg_core_csgc_mapped_reader_static_gate_contract_test
tools/csg_core_csgc_strict_decode_gate.sh
tools/csg_core_csgc_strict_decode_gate_contract_test
tools/csg_core_standard_physical_format_gate.sh
tools/csg_core_standard_physical_format_gate_contract_test
tools/csg_core_csgc_encoder_memory_static_gate.sh
tools/csg_core_csgc_encoder_memory_smoke.sh
tools/csg_core_data_edit_smoke.sh
tools/csg_core_relfacts_sidecar_static_gate.sh
tools/csg_core_relfacts_sidecar_static_gate_contract_test
tools/csg_core_relfacts_sidecar_smoke.sh
tools/atomic_tree_concurrency_smoke.sh
src/tests/atomic_tree_runtime_smoke.cheng
src/tests/system_link_atomic_tree_provider_roots_smoke.cheng
tools/atomic_tree_readonly_mapped_region_gate.sh
tools/atomic_tree_readonly_mapped_region_permission_contract_test
tools/atomic_tree_readonly_mapped_region_linux_aarch64_gate.sh
tools/atomic_tree_readonly_mapped_region_linux_x86_64_gate.sh
src/tests/atomic_tree_readonly_mapped_region_smoke.cheng
tools/runtime_exact_allocation_ledger_static_gate.sh
tools/runtime_exact_allocation_ledger_static_gate_contract_test
tools/runtime_exact_allocation_ledger_nolibc_abi_gate.sh
tools/runtime_exact_allocation_ledger_nolibc_abi_gate_contract_test
tools/linux_aarch64_provider_runtime_smoke.sh
tools/csg_core_production_gate.sh
tools/csg_core_production_gate_contract_test
tools/csg_core_exact_1g_suite
tools/csg_core_exact_1g_suite_contract_test
tools/csg_core_exact_1g_workload.sh
tools/csg_core_exact_1g_process_tree_gate
tools/csg_core_exact_1g_process_tree_contract_test
tools/csg_core_exact_1g_process_tree_receipt_validator
src/tests/csg_core_exact_1g_workload.cheng
```

以下新门名在实现第一批即固定；缺任一门、contract 或 aggregate fixture 都不得把旧门改绿后称为
store identity、prepared/session、projection authority 或 exclusive-or-absent 已闭合：

```text
tools/atomic_tree_exclusive_or_absent_static_gate.sh
tools/atomic_tree_exclusive_or_absent_static_gate_contract_test
tools/csg_core_merkle_store_identity_static_gate.sh
tools/csg_core_merkle_store_identity_static_gate_contract_test
tools/csg_core_merkle_transaction_authority_static_gate.sh
tools/csg_core_merkle_transaction_authority_static_gate_contract_test
tools/csg_core_csgc_projection_authority_static_gate.sh
tools/csg_core_csgc_projection_authority_static_gate_contract_test
tools/csg_core_bound_replay_aggregate_smoke.sh
src/tests/csg_core_bound_replay_aggregate_smoke.cheng
```

现有 `tools/csg_core_merkle_current_head_static_gate.sh` 与
`tools/csg_core_merkle_current_head_dynamic_gate.sh` 只是转调 successor crash gate 的 legacy alias，既不执行
ReadHead/FindRequest/Historical，也不证明 verification Replay；本切换必须删除这两个 alias，或把它们改成只调用
上述 aggregate 的精确 restart modes，禁止继续把现有 PASS 输出计作 current-head 动态信用。

现存门中的以下旧断言必须同批替换，不能仅改名后保留旧authority：

- `csg_core_merkle_transaction_request_smoke.sh` 与 request-decode static/contract 当前把
  `afterCsgcDirectoryCid`、after manifest放进Plan/plan-root；request artifact CID仍可作为exact `requestCid`字段，
  但不得签发或替代projection/final-manifest authority；
  新门必须证明SemanticPlanRoot不读取projection/final-manifest身份，只绑定store identity、sealed-before content、
  request及semantic skeleton。
- `csg_core_merkle_transaction_receipt_smoke.sh` 及其mutation当前固定before/after directory字段与直接
  CSGC encode/decode；新门必须改为持久绑定semantic carrier、projection receipt、final manifest、store identity与
  sealed-before content，并拒绝self/HEAD/path/registry回边。
- `csg_core_csgc_authority_contract_test` 当前固定
  `CsgCoreMerkleManifestBindCanonicalCsgcDirectory`直接完成manifest绑定；切换后只能由唯一projection receipt进入
  `ManifestFinalizeProjection`，CSGC authority不得回签facts root或semantic carrier。
- `csg_core_merkle_store_smoke.sh`、`csg_core_merkle_query_smoke.sh`、bootstrap transaction gate与transaction smoke
  当前直接调用公开raw `CsgCoreMerkleStorePutObject`或旧Plan/Apply链；生产正例必须迁到path/prepared/session，
  query fixture只能读取已由session发布并经durable receipt验证的store。
- `csg_core_merkle_admission_smoke.sh` 当前把公开 `CsgCoreMerklePatchReplace` 当必需API；该断言必须删除，
  正例只经Replay/Admit carrier，旧unbound/bound Patch公开符号都必须进入compile-negative。
- 当前 `atomic_tree_concurrency_smoke.sh` 尝试执行两个`commit-contender`并发rename case，但
  `atomic_tree_runtime_smoke.cheng`没有该mode，因此current baseline本身就是RED；fixture也只调用旧Begin/OpenVerified。
  它们必须先同步到同一mode合同，再改为上述OPENED/ABSENT/invalid、
  parent-wide lease竞争、SIGKILL释放与同handle ABSENT→transaction→OPENED连续状态机，旧结果不能计新primitive信用。
- `runtime_exact_allocation_ledger_static_gate.sh --self-test` 当前先发RED于旧cstring copy-wrapper签名期待；
  必须先同步现行allocation-ledger基线，再增加lease cell/generation/close/abort mutations，任何旧RED或跳过self-test
  都不能计AtomicTree实现信用。

动态fixture至少同步 `src/tests/csg_core_merkle_dag_smoke.cheng`、
`csg_core_merkle_transaction_bound_replace_smoke.cheng`、transaction operation/request/receipt、transaction、compiler snapshot
merkle、store、current-head、atomic-tree runtime与system-link provider-root smokes。最快验收固定为：先跑纯静态contract；
provider roots继续由独立system-link fixture真实链接验证，不计aggregate runtime mode；随后只编译一次
`src/tests/csg_core_bound_replay_aggregate_smoke.cheng`，由
`tools/csg_core_bound_replay_aggregate_smoke.sh` 反复启动同一 executable 执行以下独立 mode：
`os-opened`、`os-absent`、`os-invalid`、`lease-holder`、`lease-contender`、`lease-crash-release`、
`replay-positive`、`replay-invalid-proof`、`plan-zero-write`、`publish-first`、`restart-read-head`、
`restart-find-request`、`restart-historical` 与 `repeat-semantic-bytes`。holder/contender/crash 必须是真实双进程；
restart modes 必须是 holder/publisher 已退出后的新进程，只能读取持久 authority。两次同语义的 CSGC 原始bytes、
facts_root、proof、nodes、manifest/receipt CID逐字节对拍；所有负mode固定首拒点、object-write count=0且HEAD不变。
Linux aarch64还必须把provider-root fixture交叉编译/运行到`linux_aarch64_provider_runtime_smoke.sh` lane，
证明nolibc `cheng_host_flock`的syscall实体可达且libc host同名export不在closure；缺失native/qemu/docker runner的
`SKIP`不得计正式动态信用。
旧公开Patch不可导入仍单独使用一次最小compile-negative，不能混入运行mode。随后按
bound-replace→request/receipt→transaction/store→compiler wiring/snapshot顺序跑wrapper，再跑一次production aggregate，
最后只运行一次exact-1GiB suite及其Linux process-tree hard-memory receipt链。

## 验收矩阵

静态 reachability 必须从 compiler 解析出的完整 source/import closure 与 tokenized function graph
证明两条独立生产链。写链为：

```text
CsgCompilerSnapshotCargoMerklePlan
  -> CsgCoreMerkleStoreOpenPathAuthority
  -> CsgCoreMerkleSealedBeforeVerify
  -> CsgCoreMerkleTransactionPlanStore
     -> CsgCoreMerkleTransactionPrepare
     -> return exact opaque prepared transaction + SemanticPlanRoot
CsgCompilerSnapshotCargoMerkleApply
  -> consume exact opaque prepared transaction
  -> CsgCoreMerkleTransactionApplyPreparedStore

CsgCoreMerkleTransactionPrepare
  -> consume exact path authority + store-neutral sealed-before authority
  -> verify current storeIdentity/HEAD/manifest/generation join
  -> csgTransactionApplyPatches
     -> CsgCoreMerkleTransactionOperationBuildAdmittedReplace
        -> CsgCoreMerkleAdmitReplaceDelta
           -> CsgCoreMerkleReplayReplaceBound
              -> private patch engine
  -> CsgCoreMerkleTransactionAuthorityVerifyInMemory
  -> seal and return exact opaque prepared transaction + SemanticPlanRoot
  -> object/projection/write count == 0

CsgCoreMerkleTransactionApplyStore (direct convenience entry)
  -> CsgCoreMerkleTransactionPrepare
  -> CsgCoreMerkleTransactionApplyPreparedStore

CsgCoreMerkleTransactionApplyPreparedStore
  -> validate exact prepared seal + store/head/generation/request join
  -> semantic issuer Replay/Admit/Patch call count == 0
  -> CsgcProjectionMaterialize
  -> CsgcProjectionReceiptVerifyInMemory
  -> ManifestFinalizeProjection
  -> CsgCoreMerkleTransactionPrepublishVerifyInMemory
  -> opaque nominal move-only PrepublishSession
  -> unique public capability-gated CsgCoreMerkleStorePutPreparedObject(session: var)
     -> claim exact registry current artifact row/buffer
     -> complete exact write/reuse outcome and advance ordinal
  -> CsgCoreMerkleStorePublishHeadIncremental
     -> durable verifier Replay call count == 1
  -> HEAD commit (consume and invalidate session)
```

每个成功transaction在prepare链中恰好执行一次**semantic issuer Replay**；ApplyPreparedStore不得重新签发、
重放issuer或重新admit。首次发布在durable verifier中另执行恰好一次**verification Replay**；以后每次重启、
ReadHead/FindRequest/Historical committed verifier各自也恰好执行一次verification Replay。verification Replay只返回
验证结果，禁止签发、替换或更新semantic carrier、facts_root、DAG root、proof或nodes。direct convenience entry
只组合一次issuer phase与一次publish verification；已经调用PlanStore取得prepared carrier的cargo路径不得再调用
direct ApplyStore。

committed transaction reuse/read authority 必须从以下精确入口与 branch marker 可达同一 committed receipt verifier：

```text
CsgCoreMerkleStoreOpenPathAuthority
  -> CsgCoreMerkleStoreReadHead / CsgCoreMerkleStoreFindRequest /
     CsgCoreMerkleStoreReadHistoricalAuthority
     -> csgStoreVerifyTransactionReceipt
        -> verification-only decode + verification Replay + persisted preimage/bytes compare
        -> stored projection check; return bool only
     -> return committed authority or hard-fail

CsgCoreMerkleTransactionPlanStore / CsgCoreMerkleTransactionApplyPreparedStore
  -> CsgCoreMerkleStoreFindRequest(found == true)
     -> csgStoreVerifyCommittedReceiptProjection

CsgCoreMerkleStorePublishHeadIncremental(
    current.head.manifestCid == manifestCid &&
    current.head.previousHeadCid == expectedHeadCid &&
    current.head.receiptCid == receiptCid)
  -> csgStoreVerifyCommittedReceiptProjection
```

普通 content-addressed CAS 去重不是 committed transaction reuse，必须单独冻结为：

```text
csgTransactionPut(session: var)
  -> unique public capability-gated CsgCoreMerkleStorePutPreparedObject(session: var)
     -> registry claim current canonical row/buffer
     -> csgStorePutObjectVerified
        -> csgStoreVerifyExistingObject (only when expected object path exists)
```

该分支只在 active session 中对 expected CID 与完整 existing bytes逐字节对拍并记录一个 reuse outcome；
它不得签发 committed transaction authority，也不要求每个 CAS hit重放历史 transaction receipt。反之，
FindRequest/HEAD/history的 transaction reuse不得借普通 CAS hit绕过 committed receipt verifier。

durable verification/HEAD 链为：

```text
CsgCoreMerkleStorePublishHeadIncremental(session: var)
  -> validate live session path authority/store identity
  -> csgStoreVerifyTransactionReceipt
     -> CsgCoreMerkleTransactionOperationDecodeForReplayVerification
        -> verify persisted operation/proof/before authority shape and bytes
        -> CsgCoreMerkleReplayReplaceBound
           -> private patch engine
        -> compare replay result with persisted semantic carrier preimage/CID and nodes
        -> stream-check stored projection and compare persisted projection preimage/CID
        -> return bool only; no Admit/issuer/capability construction
  -> csgStoreCommitHeadAtCurrent
```

门必须冻结 source closure manifest 的原始字节与每个输入 SHA-256，拒绝未解析 import、重复模块、
动态遗漏和新增未扫描 `.cheng` 文件。全 closure 的导出表中
`CsgCoreMerklePatchReplaceBound` 定义/引用必须为零；独立 compile-negative 必须证明外部模块无法导入
该标识符。private patch engine 的唯一直接 caller必须是 `CsgCoreMerkleReplayReplaceBound`；所有公开
可达semantic issuer路径必须经且仅经一次issuer Replay后才能到 private patch；每个命名durable/read verifier
事件必须经且仅经一次verification Replay，不能直达、绕过或在同一phase二次调用。两类Replay的结果权限必须
分离，verification结果不能恢复issuer capability。comments、strings 与死函数不算调用边。

必须独立杀死以下 mutation：

1. 删除 Admit→Replay 调用，或恢复 Admit→Patch 直调。
2. 恢复公开 `CsgCoreMerklePatchReplaceBound`、alias、wrapper 或第二公开 patch primitive。
3. operation 丢弃 carrier，改从 proof、fact 或 wire 字段重算 patch/root，或恢复 codec 平行 `nodes`。
4. transaction 跳过 replay summary、另取 patch nodes、不对拍 semantic skeleton/projection/final manifest，
   把任一 verifier、manifest finalize或session签发移到首个 `csgTransactionPut` 之后，允许 projection回写
   semantic root，或让任一 request/partition/membership/node/dependency/query/summary/manifest/receipt artifact
   不被 prepublish verifier覆盖；复制/跳过/换序session cursor、二次commit，或从incremental closure直达
   raw `CsgCoreMerkleStorePutObject`同样必须拒绝。
5. store 把 `OperationDecodeForReplayVerification` 换成 proof-only decode、恢复调用
   `OperationBuildAdmittedReplace`/`AdmitReplaceDelta`、签发任何 semantic/projection capability、只比较 CID 不比较原始 bytes、
   使用独立 `proofDecoded.proof` 作为 authority、在 durable replay 前 commit HEAD，或让 ReadHead/FindRequest/
   ReadHistoricalAuthority/已提交transaction复用绕过 committed receipt verifier；普通CAS hit若错误签发
   committed authority也必须拒绝。
6. compiler snapshot cargo、PlanStore或ApplyStore恢复 full admission/DAG/whole-fact-set CSGC/final-manifest重算，
   prepared carrier在Plan→Apply间漂移，semantic planRoot加入任一projection/final-manifest字段，或生产API恢复
   caller store identity/raw storeRoot、caller after CSGC/factsRoot/DAG root/manifest输入。
7. 在死代码加入 Replay 调用、删除写链/verify链任一边、改变调用目标、添加未扫描模块/alias，或让
   source/import closure scanner 不完整仍返回绿。
8. 恢复 data_edit `.patch`、relfacts `.patch` 或 incremental admission 局部 patch authority；同时必须
   杀死“错误地让 data_edit append/delete 成功”和“错误地让 relfacts assert/retract 失败”两类 mutation。
9. 篡改 proof direction/sibling/count、before root/fact、after fact、query key、kind、schema/profile
   binding、operation/proof bytes、patch node、after root/count/CID，全部在 publish 前拒绝。
10. 在 production semantic 增量闭包恢复 before/after whole-fact-set full admission、full DAG build 或完整
    fact-set CSGC projection encode（不误杀有界 proof/operation/semantic-plan cargo encoder）；
   删除 dedicated projection、让 projection 调用两次或提前到 semantic freeze 前；篡改
   `computed += rebuilt + 1`、删除 proof-derived reused、让 `nodes.len != d + 1`、注入不可达/重复 node CID，
   或修改 `reachableNewNodeCids` 后重编码 receipt，全部必须在首个 object write 前拒绝。
11. 修改 identity模块的 profile-set hash domain/preimage、恢复第二 profile-set CID实现、制造 validator↔dag
    import cycle，或让 Patch使用不同 binding receipt，必须在 admission前拒绝；只比较最终root不算杀死。
12. iterator接受 caller after lines、替换零/多行、替换错误 ordinal/key/kind、改写任一未变 line，或
    issuer-derived proof被删除、替换、不等于sealed DAG唯一derivation仍被接受，全部拒绝。
13. beforeFact/afterFact不同但强制相同 factHash、changed fact强制 afterRoot==beforeRoot、nodes改为proof正序/
    任意顺序、同 replay-node取得零次或两次CAS outcome，全部在首写前拒绝。
14. 删除/合并任一命名 materialize、projection verify、prepublish、StorePut CID verify、existing bytes compare、
    durable before/final/projection readback或HEAD write counter，把node CID错误改成`framing+segment bytes`、恢复未计费
    的第二遍扫描、篡改任一逐kind exact byte/count等式，或让I/O失败仍报告`headCommitCount == 1`，全部由
    phase-qualified receipt、node-segment witness与2×字节规模测试拒绝。
15. production request恢复caller proof参数，修改semantic/projection receipt domain或任一length-framed preimage字段，
    让manifest包含receipt/HEAD CID、receipt closure包含自身/HEAD，或把prepared/session capability开放字段/构造器、
    接受零值/复制/二次move，必须由compile-negative、CID mutation与无环closure gate拒绝。
16. `beforeStoreIdentity`加入path、HEAD、record/object CID、receipt或自身，删/换domain、format/layout/category/seed
    任一framed字段，Init/Open各自实现hash，Plan接受caller identity，store seed全零/短读/二次创建仍成功，或Plan为
    补identity record调用Init/repair产生写，必须由identity preimage、唯一producer、zero-write mutation全部拒绝。
17. sealed-before content CID加入store/path/HEAD/registry row，删任一before manifest/CSGC/root/subgraph/count/artifact
    closure或binding字段；path authority可序列化、用path文本作identity、无exact marker/identity/lease仍签发，Prepare不
    消费两种capability或不对拍当前HEAD内容，receipt不持久绑定store/content identity，全部拒绝。相同before内容在
    不同store的sealed-before CID必须相同，但SemanticPlanRoot必须因`beforeStoreIdentity`不同而不同。
18. 删除live registry，以capability字段或seal hash单独判断live；允许prepared/session同时live，跳过/回退/重复任一
    state，复用旧epoch/POISONED/COMMITTED row，Put接受caller row/path/bytes，durable前commit，或在store/cargo复制
    registry/transition实现；反转`store_identity -> transaction_authority -> store -> transaction -> cargo`任一import
    边、加入callback/裸指针旁路，必须由compile-negative、tokenized caller/import DAG与逐transition deletion mutation
    拒绝。复制capability并发竞争时必须恰有一个transition成功，其余hard-fail且不能增加object/HEAD/receipt成功计数。
19. semantic issuer Replay计数不是1、ApplyPrepared重新issuer/admit、首次publish durable verification Replay计数不是1，
    或任一重启/ReadHead/FindRequest/Historical verifier事件执行零次/多次Replay；verification Replay签发、替换或修改
    semantic carrier/root/proof/nodes，必须由phase-qualified callgraph、capability absence与逐事件counter mutation拒绝。
20. AtomicTree lease必须分别杀死：把锁移到existence probe后；OPENED锁root而ABSENT锁parent或使用path/name文本锁；
    ABSENT返回零handle/关闭parent/提前unlock；BeginFrom或Commit恢复raw path并重新open/relock、close/reopen、
    不consume exact generation或让旧复制继续live；把
    `EACCES/ELOOP/ENOTDIR`、I/O、busy、unsupported任一错误当ABSENT；Open/Plan引入fsync、lockfile、create、mkdir、
    write、rename、unlink或任何持久变化；lease live允许fork/spawn/dup或Close/Abort/POISON后FD/lease不恰好释放一次；
    删除Linux aarch64 nolibc syscall 32/export，改变`LOCK_EX|LOCK_NB`、负返回值到exact errno的转换，或让libc host
    与nolibc在同target对`cheng_host_flock`定义数为0/2；把path/dev/ino/errno/lease generation/open kind写入portable CID，
    或在不支持目标走unlocked fallback。动态必须覆盖
    同parent不同finalName竞争、ABSENT→Init连续transition、OPENED复用、close后重取与无child holder SIGKILL释放。

动态验收必须使用真实纯 Cheng writer/decoder 与 current-source compiler：production semantic replace
先证明调用闭包没有 full oracle，再由独立测试进程执行 full rebuild/encode 作外部对拍；同一 before/after 输入
至少重复两次，逐字节对拍 CSGC、proof cargo、operation cargo、replay root、patch nodes 与 receipt；
正例通过 transaction/store，所有语义负例在首个 object write 前拒绝且无 HEAD、无 production
execution；durability/I/O 失败允许留下不可达 CID object，但 receipt authority 不成立且 HEAD 不变。Darwin 用户态
1GiB 守卫只能记 sampled observation；正式完成仍要求合格 Linux cgroup v2 硬门。

复杂度回执必须分相，禁止把整笔 transaction 笼统声明为 `O(path)`：只有 Merkle replay 子阶段的
工作量上界为 `O(d + len(beforeFact) + len(afterFact))` 且 `d <= 256`；authenticated iterator、flat
projection、全部 artifact 内存预验、StorePut/CAS与durable readback必须按实际触碰字节分别计费。
以下 pass/count/byte counters 是最小固定账本；实现可以在同一次物理 scan里并行更新多个命名 hash，
但不得省略任一 digest，也不得把额外 scan藏进同一 phase name：

对每个 canonical artifact row，唯一codec/schema必须先定义两项逐kind函数：

```text
cidVerifyCount(kind, row)
cidHashInputBytes(kind, row)
```

二者分别是该row必须重算的CID数量与全部canonical CID preimage字节数。domain-bytes artifact才满足
`cidHashInputBytes = domainFramingBytes + storedByteCount`；node/node-segment必须decode canonical node record，
按node CID真实domain、kind、key/fact或child/count字段preimage重算，stored segment bytes另计
`nodeSegmentBytesDecoded/Compared`，禁止用segment长度冒充node CID preimage。未知kind没有默认公式并hard-fail。
`beforeAuthorityRoleRows` 至少列出sealed before manifest/CSGC、proof path sibling nodes及重放所需的before
request/operation authority；`finalArtifactRoleRows`只列本次transaction closure。两者是逻辑coverage表，不直接
等于物理读次数。唯一物理计划固定为
`durableReadRows = canonicalDedup(beforeAuthorityRoleRows union finalArtifactRoleRows)`，按`(kind,CID)`排序并在
每行记录before/final role bitset；同一 `(kind,CID)` 即使承担两种角色也只出现/读取/验CID一次。role coverage
counter只数bit，physical read/hash/decode counter只对`durableReadRows`求和，禁止重复计费或漏读。

```text
materializePassCount == 1
materializeBytesEmitted == B
materializeSectionPayloadHashBytes == sum(sectionPayloadLen)
materializeDirectoryCidHashBytes == directoryFramingBytes + directoryBytes
materializeObjectCidHashBytes == objectFramingBytes + B

projectionVerifyPassCount == 1
projectionVerifyBytes == B
projectionVerifySectionHashBytes == sum(sectionPayloadLen)
projectionVerifyDirectoryCidHashBytes == directoryFramingBytes + directoryBytes
projectionVerifyObjectCidHashBytes == objectFramingBytes + B

prepublishArtifactPassCount == finalArtifactCount
prepublishArtifactBytesVisited == sum(finalArtifactByteCount)
prepublishArtifactCidVerifyCount ==
    sum(cidVerifyCount(kind, row) for finalArtifactRows)
prepublishArtifactCidHashInputBytes ==
    sum(cidHashInputBytes(kind, row) for finalArtifactRows)
prepublishNodeSegmentBytesDecoded ==
    sum(byteCount for final node-segment rows)

storePutArtifactPassCount == attemptedArtifactCount
storePutCidVerifyCount ==
    sum(cidVerifyCount(kind, row) for attemptedArtifactRows)
storePutCidHashInputBytes ==
    sum(cidHashInputBytes(kind, row) for attemptedArtifactRows)
storePutNodeSegmentBytesDecoded ==
    sum(byteCount for attempted node-segment rows)
storeLogicalPayloadBytes == sum(byteCount where outcome == write)
reuseExistingBytesCompared == sum(byteCount where outcome == reuse)
reuseExistingCidVerifyCount ==
    sum(cidVerifyCount(kind, row) where outcome == reuse)
reuseExistingCidHashInputBytes ==
    sum(cidHashInputBytes(kind, row) where outcome == reuse)
reuseExistingNodeSegmentBytesDecoded ==
    sum(byteCount for reused node-segment rows)
attemptedArtifactCount == writtenArtifactCount + reusedArtifactCount

durableBeforeAuthorityRoleCount == beforeAuthorityRoleRows.len
durableFinalArtifactRoleCount == finalArtifactRoleRows.len == finalArtifactCount
durablePhysicalReadCount == durableReadRows.len
durablePhysicalBytesRead == sum(durableReadRows.byteCount)
durableCidVerifyCount ==
    sum(cidVerifyCount(kind, row) for durableReadRows)
durableCidHashInputBytes ==
    sum(cidHashInputBytes(kind, row) for durableReadRows)
durableNodeSegmentBytesDecoded ==
    sum(byteCount for node-segment rows in durableReadRows)
durableProjectionReadbackBytes == B
durableProjectionSectionHashBytes == sum(sectionPayloadLen)
durableProjectionDirectoryCidHashBytes == directoryFramingBytes + directoryBytes
headCommitCount == 1
headLogicalPayloadBytes == canonicalHeadByteCount
```

durable CSGC 的 object-CID 与 section hash允许在同一次 readback scan中并行更新，因此不另造第二个
durable CSGC object-hash pass；所有其他未列出的读、hash、compare、write pass必须显式新增命名counter、
更新本合同并有对应mutation，不能归入 `framing+B`。上述 `storeLogicalPayloadBytes` 与
`headLogicalPayloadBytes` 只计canonical application payload；writer还必须分别报告成功write/pwrite调用实际接收的
`storeWriteSyscallBytes` 与 `headWriteSyscallBytes`，成功无重试重复时等于对应logical值，文件系统内部block/metadata
写不冒充application复杂度证据。I/O失败路径按实际已触碰/accepted字节报告且
`headCommitCount == 0`。flat projection明确承认并验证 `Omega(B)`。projection 对拍必须覆盖全局
dictionary token计数 `1<->2`、savings过零、index `127<->128`、payload长度变化以及首/中/末物理位置，
证明优化没有改变任何 canonical flat byte。

## 用户确认点

确认后只实施上述单 replace authority 收口；append/delete incremental store、batch 与 schema/profile
变化继续保持 HARD_RED，relfacts 既有 full-rebuild assert/retract 行为不变，另行提案。
