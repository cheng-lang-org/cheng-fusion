# CSG-Core Production Admitted-Input Capability

状态：`apply`。第三刀已落进程内 Issue+Consume+证据绑定切片；CSGC/proof/HEAD lease/SCM_RIGHTS/alias 仍 HARD_RED，`dynamic_completion_credit=0`。archive 等用户验收。

## Motivation

当前生产入口虽然在 `system_link_exec` 计划内部检查 launcher admission receipt，但
正式别名、cache 和 provider 仍可在该检查之前读取源码、provider 或 cache：

- `compiler_main.cheng` 在进入 `CompilerRunSystemLinkExec` 前计算 cache key 并恢复
  executable/map/report；
- `system_link_plan.cheng` 从路径重新收集 import closure，并在 parser/source-bundle
  构造中打开和读取源码；
- `system_link_exec_runtime.cheng` 可独立读取 provider source、cache ABI 输入并启动
  provider/原生链接子进程；
- `backend_driver_main`、`backend_driver_dispatch_min`、`system_link_exec_pure_main`、
  cold bootstrap 和 `tools/csg` 各自拥有可达的生产形入口；
- 现有 `CsgCoreProductionSystemLinkExecAdmissionReceipt` 只携带 CID 标量，没有拥有并
  复验完整 CSGC、真实 proof bytes、operation/transaction replay、request/provider
  closure 和 cache output bytes，复制一个自洽 receipt 不能构成输入授权。

因此“先检查一个 receipt，再继续按路径读文件”不是生产准入。生产执行必须只消费
一个由纯 Cheng 完整验证、由 launcher runtime 一次性签发的 admitted-input
capability。任何能够编译、恢复 cache、物化 provider 或执行 native child 的正式入口，
在 claim capability 之前不得对 raw source 做 `stat/read/open/mmap`，也不得产生输出。

## Scope

本提案覆盖所有可到达 `system-link-exec`、CSG CLI production command、cache restore、
provider materialization、native link 或 held execution 的正式入口。`help/status` 等纯控制面
命令不读取生产输入，不在本合同内；它们不得转入执行路径或签发生产成功回执。

本提案不新增 CSG 格式、facts root、proof codec 或兼容 schema。现有唯一 CSGC、Merkle
root/proof、transaction request/operation/receipt 必须原地成为 capability 的输入证明。

## Attacker Model and Trust Boundary

攻击者可以控制普通进程 argv/env、请求中的全部路径、source/provider/cache bytes、文件替换
时序、alias 选择、并发 consume、进程复制、崩溃点，并能修改任何自带 hash 的 artifact 后重算
其内部 hash。攻击者还可以直接调用历史 plan/runtime/cache 入口、伪造结构完整的 receipt、在
issue/claim/commit fence 之间推进 store HEAD，或让 executable 已写完后再使 map/report 失败。

唯一外部信任根是固定安装的 `csg-production-launcher` 可执行身份、OS 派生的现有 production
store policy、内核 descriptor/process/atomic-rename 语义以及已验证 compiler/runtime identity。
CID、nonce、路径、mtime、nominal/private 类型和 caller observation 都不是独立 trust anchor。

CSGC canonical decode/re-encode、hash/root/proof、operation/transaction replay、request/source/
provider/cache/output closure seal 全部由纯 Cheng 完成。OS runtime provider 只提供 held descriptor、
原子状态、进程身份、descriptor 传递、锁和 no-replace directory commit；它不得解释 CSG 语义、
签发第二份语义 receipt 或根据路径补发现 payload。

## Authority Split

必须把三种身份分开，禁止互相冒充：

```text
semanticKernelCid
  确定性；绑定 before/after CSGC、facts_root、真实 proof bytes 与完整 replay。

executionInputCid
  确定性；绑定 semanticKernelCid、sealed CompilerRequest、源码闭包、provider 闭包、
  compiler/runtime/argv/environment 和 output contract。

leaseCid
  一次性；绑定 admittedInputCid、runtime session、generation、nonce、activation ordinal。
```

同一 canonical 语义、相同 query 和相同 transaction 必须得到唯一
`semanticKernelCid`、CSGC bytes、`facts_root` 和 proof bytes。不同执行会话的
`leaseCid` 必须不同；该差异只表达一次性执行权，不能进入或改变语义 root/proof。

## Registry Owner and Unique Issuer

registry 原地扩展
`src/core/runtime/production_held_exec_provider.cheng`，不得新增平行 registry/runtime 模块。
该模块是 admitted-input slot、activation channel、held bundle、current-HEAD lease、output parent/
staging handle 和终态的唯一 owner。内部布局固定为 Arena + SoA；跨行身份只用 `slot:int32`，
descriptor 只保存为模块私有 `int32` handle，不能保存对象地址、路径、源码行或 name+arity。

固定安装的纯 Cheng launcher 进程入口是
`src/core/tooling/csg_production_launcher_main.cheng`。它只调用
`production_launcher.CsgCoreProductionLauncherMainAdmitAndActivateInto`，后者是全仓唯一调用
`held_exec_provider.CsgCoreProductionHeldExecProviderIssueAdmittedInputInto` 的 issuer edge：

```text
tools/csg
  -> fixed installed csg-production-launcher
  -> CsgCoreProductionLauncherMainAdmitAndActivateInto
  -> CsgCoreProductionHeldExecProviderIssueAdmittedInputInto   # exactly one edge
```

现有 `CsgCoreProductionHeldExecProviderIssueInto`、
`CsgCoreProductionLauncherRequireSystemLinkExecAuthorityInto`、
`CsgCoreProductionLauncherRequireRelfactsExecutionAuthorityInto` 和 milestone issuer 不得继续签发
生产 authority；apply 时必须删除 generic issuer，或把非执行控制面改成不接触 production input、
不产生 success receipt 的纯查询。正式 alias、compiler、cache、provider、runtime 和 cold C 均不能
issue、clone、reset 或 import registry。

registry 每个 slot 至少有等长 SoA 列：state、generation、session generation、activation ordinal、
child process identity、admitted/lease/bundle/current-head/output-contract CID、held bundle handle、
publication-locator CID、HEAD shared-lease handle、output-parent handle、staging handle。issue
只有在完整 admission、held
descriptor 与 HEAD lease 全部成功后才以一次 release-store 发布 `ISSUED`；任何前置失败不得出现
live slot。公开 capability 不是 owner，只是不可授权的查询键：

capability 的公开载体只能是不可授权的索引句柄：

```text
CsgCoreProductionAdmittedInputCapability
  slot: int32
  generation: uint64
  sessionGeneration: uint64
  sessionNonceCid: str
  admittedInputCid: str
  leaseCid: str
```

真实 payload 由 runtime owner 维护在 Arena + SoA 中，以 `slot:int32` 精确定位。payload
至少绑定包含完整 before/after CSGC、proof cargo、operation cargo、transaction request/plan/
receipt cargo、admitted source bytes、provider bytes和已验证 cache candidate bytes 的唯一 held
bundle。公开句柄没有 buffer/descriptor 地址，也没有 encode/decode/clone/from-receipt 构造器。

句柄标量可以被复制，但复制品不是 authority。每次 claim 必须对 runtime registry 中的
`slot + generation + sessionGeneration + nonce + leaseCid` 做原子比较并把唯一状态从
`ISSUED` 改成 `CLAIMED`；第一份成功后，原值、复制品、并发竞争者和跨进程重放全部拒绝。
registry 记录由真实 runtime session capability 签发，caller 构造相同字段仍无法建立活记录。
同一 owner lifetime 内每次 slot reuse 都必须严格递增非零 generation，禁止回绕；到达上界时永久
退役该 slot。owner restart 必须产生新的 OS-backed session capability和session generation，旧 session
的 slot/generation/nonce/lease 即使逐字段重放也不能命中新 live record。
如果 consumer 在 held child 进程，claim 必须经 launcher 预先持有的 authenticated
activation channel 由原 runtime owner 执行；把 registry 复制到 child、从 argv 重建或
由 child-local 状态自行通过，都不是一次性授权。

状态机只有：

```text
EMPTY -> ISSUED -> CLAIMED -> COMMITTED
                         \-> ABORTED
```

没有 `CLAIMED -> ISSUED`、retry、reset 或第二次 consume。任何失败都将 lease 终结为
`ABORTED`；重试必须从当时的 current HEAD 重新完整 admission 并签发新 capability。

## Held Bundle and Cross-Process Claim

admission payload 固定编码为一个无版本、strict、无歧义 transport envelope：固定 field count，
每项为 `u32le(tag) || u64le(byte_count) || bytes`，tag 按规范顺序严格递增，禁止重复、padding、
未知 tag 和尾字节。nested CSGC/proof/operation/request/plan/receipt 必须继续由各自唯一 codec
strict decode/re-encode；transport envelope 不能解释或替代 nested authority。
`heldBundleCid` 从 envelope 全部原始 bytes 重算并由 registry 绑定。

tag 固定为：1 semantic binding、2 predecessor HEAD、3 current HEAD、4 before manifest、
5 after manifest、6 before CSGC、7 after CSGC、8 ordered proof cargo、9 ordered operation cargo、
10 transaction request、11 transaction plan、12 transaction receipt、13 source closure、
14 provider closure、15 request/tool/argv/env/resource/output contract、16 cache candidate。
可变长 cargo field 内部统一为 `u32le(count)` 后按语义 ordinal 写
`u64le(byte_count) || bytes`；source/provider 顺序来自各自 sealed closure，proof/operation顺序来自
transaction ordinal，禁止按 CID 重排。

launcher 与 child 只使用创建于 spawn 前的唯一 authenticated local datagram socket activation
channel；协议固定为四个单 datagram、固定长度 canonical frame：
`CLAIM -> ACTIVATE -> FINISHED -> COMMITTED|ABORTED`，禁止 stream partial-frame、额外 frame、
第二次 `SCM_RIGHTS` 或 pathname reopen。`ACTIVATE` 是 claim 的唯一 reply；`FINISHED` 必须绑定
lease CID、execution receipt CID、output manifest CID和staging descriptor identity，终态 ack 必须绑定
lease CID、admitted input CID和output generation CID。除该 channel 外的继承 descriptor 必须在进入
child Cheng 代码前关闭；EOF、重复、乱序或字段漂移直接 `ABORTED`。
child argv 只含正式 command 和固定 capability transport token；不得包含 source/provider/cache/
output path、bundle fd、store path或 fallback compiler。child 进入 Cheng 后的第一项副作用必须是
向 owner 发 claim；owner 同时验证 slot/generation/session/nonce/lease、实际 child process identity
和 channel identity，再以 atomic CAS 执行 `ISSUED -> CLAIMED`。CAS 成功之前 child 不持有也不能
读取 bundle 或 output-staging descriptor。

child process identity 的 OS 接口固定：Linux claim socket 开启 `SO_PASSCRED`，每个 `CLAIM` 必须
恰有一个 kernel `SCM_CREDENTIALS`，其 pid/uid/gid 与 launcher spawn 后立即持有的 pidfd和预期
credential 相等；Darwin 在 parent 关闭 child endpoint 的全部副本后，以
`LOCAL_PEERPID/LOCAL_PEEREPID` 取得 peer pid/effective pid，并与 launcher spawn 返回值和受控
unreaped parent-child process record逐项相等。缺 credential、pidfd/peerpid不支持、pid已退出、endpoint仍有
多余持有者或身份漂移时都在 CAS 前 HARD_RED；不能退化为 caller pid、argv nonce或仅 uid/gid。

CAS 成功后，owner 只通过该 channel 的单个 `ACTIVATE` reply、单个 `SCM_RIGHTS` ancillary record 传递固定
descriptor vector：`fd[0]` 恰好是一个 read-only held bundle descriptor；sealed `hit` 的 vector
count 为 1，`miss/disabled` 的 count 为 2，且 `fd[1]` 恰好是 owner-private staging directory
descriptor。child 只能按 output contract 的固定 basename 用 `openat(fd[1], ...)` 创建 entry；任何
额外 entry、子目录、symlink、hardlink 或 descriptor count/type/order 漂移都在 publication 前
HARD_RED。Linux bundle 使用 `memfd_create`，写完后必须同时具有
`F_SEAL_WRITE|F_SEAL_GROW|F_SEAL_SHRINK|F_SEAL_SEAL`；Darwin 使用 owner-private exclusive file，
写入并 `fsync` 后从同一已验证 parent descriptor 重新 `openat` 为 read-only，逐项核对
dev/inode/size/CID，立即 unlink，关闭全部 writable descriptor 后才可 issue。任一平台无法证明
只读 held transfer 时，launcher 必须在首次 source/provider/cache touch 前 HARD_RED。

child provider 把收到的 OS fd vector 导入模块私有 `int32` handle，先复验 descriptor count、类型、
identity、bundle 长度和 `heldBundleCid`，再由纯 Cheng strict-decode全部 payload。bundle descriptor、
activation channel和 output staging descriptor 都不得转成公开裸 fd/指针或长期身份。owner 始终保留独立 read-only
bundle descriptor和 registry record；child 退出、channel 关闭、第二 claim、pidfd/peerpid不等、
旧 session 或 owner 死亡全部终结为 `ABORTED`，不能由 child-local receipt 恢复。

## Complete Semantic Binding

### CSGC seal

before 和 after 都必须分别证明：

- 完整原始 CSGC bytes 由 capability payload 持有，`byteCount > 0`；
- whole-object strict decode 成功，最短 varint、唯一 dictionary、section/fact 排序、closed
  fields、canonical JSON、UTF-8 和数字格式全部合法；
- 用唯一 CSGC writer 重编码后与输入逐字节相同，禁止 decode 后规范化继续；
- `csgcObjectCid`、`csgcDirectoryCid`、`factCount` 从真实 bytes 独立重算；
- 完整 production admission 得到 `complete=true`、唯一 standard、schema CID、canonical
  profile set/profile-set CID、DAG root 和 `facts_root`；
- manifest 中每个对应字段与上述重算结果逐项相等。

只持有 fact lines、manifest、自报 CID、某个 lazy section 或 caller projection 不得签发
capability。lazy query 可以发生在签发后，但 whole-object canonical seal 必须已经完成。

### Real proof bytes

每个 proof 都必须以原始 proof CSGC bytes 进入 payload，而不是只传 `proofCid`：

- strict decode 后用唯一 proof writer 重编码逐字节相同；
- `proofCid` 和 byte count 从真实 bytes 重算；
- proof 的 standard、schema、profiles、profile-set CID、before root/count、query key、
  terminal 和全部 path steps 完整验证；
- proof 对 expected before root 验证成功；proof cargo 自报 root 不能成为 expected root；
- 相同 before root/query/terminal/path 必须只接受唯一 proof bytes。

缺 bytes、空 bytes、截断、额外尾字节、CID 相符但 byte count 不符或仅有逻辑 proof object
都必须 hard-fail。

### Replay closure

transaction 中每个 operation 按原 ordinal 连续重放：

```text
full-admitted before CSGC
  -> verify real proof bytes against current step root
  -> strict-decode and re-encode operation CSGC
  -> replay insert/replace/delete
  -> compare patch root/count/profile/schema with next full-admitted state
  -> next operation
  -> full-admitted after CSGC
  -> strict transaction request + plan + receipt replay
```

必须同时绑定：

- before/after CSGC object CID、directory CID、facts root、DAG root、fact count、schema、
  profiles 和 profile-set CID；
- 每个 proof 的真实 bytes/CID/count；
- 每个 operation 的真实 canonical CSGC bytes/CID、kind、query key、before/after fact、
  before/after root/count/profile binding；
- transaction request bytes/CID、plan bytes/root、receipt bytes/CID、ordered operation CIDs、
  invalidation CID 和 reachable node CIDs；
- transaction receipt 的 `beforeHeadCid` 等于 current head 的唯一 predecessor，最终
  after manifest/CSGC/root 等于 capability 所绑定的 current HEAD 内容。

低层 patch、单 fact admission、proof object、operation object或 transaction receipt
任一个都不能单独成为 authority。增量结果必须逐项等于完整 after rebuild。

只读生产执行不得临时伪造 identity transaction。它必须重放 current HEAD 已发布的
唯一 immutable transaction receipt 及其全部 operation/proof cargo。genesis HEAD、零 operation
receipt、空 proof 或 `proofCid="none"` 都不具备 production admitted-input 能力，必须在签发前
hard-fail。这不改动现有 transaction schema 的 zero-operation-not-publishable 规则。

### Current HEAD

`currentHeadCid` 指 policy-selected CSG store 的 validated successor tail，不是 caller
字符串，也不是 Git commit 名。policy 必须原样复用
`csgc_authority.CsgCoreCsgcProductionPolicyIssue`；不得增加接受 caller path/name 的第二 policy。

`merkle_store` 必须增加模块私有 `CsgCoreMerkleStoreCurrentHeadLease`：production consumer 持有
shared lease，所有 genesis/incremental/successor publisher 在读 expected HEAD 前取得同一 anchor
的 exclusive lease，并持有到 successor no-replace commit 与 post-commit verification 完成。lease
anchor 从 policy-selected store 的 held directory descriptor 打开并核对固定 inode/owner/mode；
不是 CID authority，也不能序列化或传给 child。任何可达 publisher 未走 exclusive lease，整个
production admission 保持 HARD_RED。

现有 transaction receipt 不增加 `afterHeadCid` 字段。current generation 的 after HEAD 必须从
真实 canonical receipt bytes 原地推导：

```text
transactionReceiptCid = CID(actual canonical receipt bytes)
derivedAfterHead = CsgCoreMerkleHeadEncodeWithReceipt(
    receipt.generation,
    receipt.afterManifestCid,
    receipt.beforeHeadCid,
    transactionReceiptCid)
```

签发只接受 `currentHead.generation == receipt.generation`、
`currentHead.previousHeadCid == receipt.beforeHeadCid`、
`currentHead.manifestCid == receipt.afterManifestCid`、
`currentHead.receiptCid == transactionReceiptCid` 且
`currentHead.headCid == derivedAfterHead.headCid`。before HEAD/manifest/CSGC 必须从唯一 predecessor
读取；after manifest/CSGC 必须等于 current HEAD。genesis、`receiptCid="none"`、零 operation、
空 proof 或无法找到唯一 predecessor 均不得 issue。

`currentHeadBindingCid` 固定绑定 production policy CID、store/lease-anchor descriptor identity、
current HEAD 全部 canonical bytes、generation/head/previous/manifest/receipt CID、transaction receipt
原始 bytes CID、before/after CSGC object/directory CID、facts/DAG root、fact count、schema和完整
profile set。字段全部从 held bytes 重算，不能使用 caller `afterHeadCid` 填空。

签发必须：

1. 从固定 production store policy 取得 shared HEAD lease，再读取并验证完整 successor history 和 tail；
2. 完整读取和验证 before/after/replay/request/provider/cache candidate；
3. 再读同一 head identity，要求 generation/head/manifest/CSGC/root 全部未变；
4. 将 shared HEAD lease 与 held store/bundle descriptor move 进 registry slot，直到 commit/abort；
5. claim 后立即验证 lease 仍指向同一 head；
6. output commit 前做最后一次 head fence，在 directory commit 线性化后才释放 shared lease。

任一漂移、lease 提前释放、publisher 绕过 exclusive lease或 fence 读到 successor 都使 capability
`ABORTED` 且零产物。shared lease 覆盖最终 fence 与 output commit 之间的窗口，因此不能出现
“fence 后 HEAD 推进、旧输入仍发布”的竞态。

Git HEAD、mtime、路径或“读取前后内容哈希相同”不能替代 source closure 和 store HEAD。

## Request, Source and Provider Closure

`executionInputCid` 必须从真实输入重算并按固定顺序绑定：

1. `semanticKernelCid`；
2. sealed `CompilerRequest` CID，包括 target、emit、backend、jobs、visibility、channel、
   exact-function、world/lock policy 和 output contract；
3. canonical source bundle：package ID、entry row、每个 canonical module path、原始 byte
   length/CID、排序 import graph、external package generation 和完整 closure CID；
4. compiler executable、runtime、launcher、toolchain和 parser/CSG producer identity；
5. provider closure：ordered provider module/source/object bytes CIDs、export roots、dependency
   edges、provider compiler identity、runtime bundle和 closure CID；
6. canonical argv CID、sanitized environment CID 和 resource policy CID；
7. output contract CID。

签发器必须在 launcher 父执行域内稳定读取所有 raw source/provider bytes，并把 bytes 或
immutable held objects 放进唯一 held bundle。正式 compiler child 不接收可重开的
source/provider/cache/output path；它在 claim 成功后只接收 owner 通过 `SCM_RIGHTS` 交付的
read-only held bundle descriptor和模块私有 staging handles。
OS/provider 只负责 held descriptor、进程身份与单次激活，所有 canonical decode、hash、root、
proof 和 replay 语义仍由纯 Cheng 实现。

closure 发现完成后禁止在 child 内按 import、环境变量、默认目录或 provider 名再次发现文件。
缺少任一 source/provider、额外 provider、顺序漂移、同路径换 inode、同 inode 改 bytes、
compiler/runtime 身份漂移全部 hard-fail。

`CompilerRequest` 中的 source/output path 只在 issuer capture 域用于稳定打开输入和输出 parent；
`executionInputCid` 只绑定 canonical source closure和内容型 output contract，物理 output parent/
basename 单独进入 `publicationLocatorCid`，路径文本本身不进入语义或 cache key。child plan/runtime
只能消费 held bytes与 exact row/index，禁止再次调用
`PathReadTextFileWithHandle`、`Realpath`、import discovery、provider name lookup或 cache path helper。

## Cache Binding

cache key 不得再从路径现场重读源码。固定推导为：

```text
cacheKeyCid = H("csg_core.production.admitted_cache_key",
                executionInputCid,
                compilerExecutableCid,
                outputContractCid)
```

cache admission 只有三种 sealed 决策：

```text
disabled  policy 在 CompilerRequest 中显式封印
miss      production output bundle directory 确实不存在
hit       同一 locator 的完整 committed output bundle 已 held-read、验证并绑定
```

存在但损坏、缺 map/report、字段漂移或 output bytes 不匹配是 hard-fail，不得当作 miss
回退重编。hit 必须把 executable/map/report 真实 bytes CID、长度、mode、bundle manifest
和 bundle 内的 cache entry receipt 组成 `cacheOutputBindingCid`；miss/disabled 绑定各自唯一
sentinel。

`admittedInputCid` 固定绑定 `executionInputCid + cacheDecision + cacheKeyCid +
cacheOutputBindingCid`。cache restore 是 production consumer，只能在唯一 claim 成功后从
payload 已验证的 committed generation 复用输出；不得重新按 cache path 读取或复制。

生产 cache 不再有独立全局目录。cache entry 是同一 output generation 的固定 manifest entry；
provider object、runtime object 等可复用 bytes 也必须列入该 generation manifest。现有
`artifacts/pure_exe_cache`、backend-driver cache 和 runtime provider/primary cache 在 production
call graph 中必须物理退役；保留的开发 cache 不能被 production request、receipt或 success marker
读取。这样 output 与新 cache entry 天然只有一个发布线性化点。

## Single-Generation Output Publication

production `--out` 原地破坏性迁移为一个完整 output bundle directory，不再表示 executable
单文件。production `--report-out` 非法；report 只能是 bundle 内固定 entry。正式 output contract
按 emit kind 精确列出并排序：`artifact`、exe 所需的 `artifact.map`、`report`、
`bundle.manifest.csgc`、`cache.entry.csgc` 以及实际 provider/runtime object entries；缺项、额外项、
名称/mode/length/CID 漂移全部 hard-fail。`artifact` 是唯一可执行/对象 payload，路径只是 locator，
authority 来自 manifest 和 held descriptor。

`report` 必须是 canonical、内容确定的生产 receipt，只能含 semantic/input/output/tool identity、
固定计数和 deterministic status；wall clock、RSS sample、absolute path、pid、session/lease/nonce等
运行观测只能写 stderr，不能进入 output manifest。否则同一 execution input 不能产生唯一
`outputGenerationCid`，必须在 publication 前 HARD_RED。

issuer 在任何 source capture 前先验证 production output interface：

- `--out` 必须是 canonical absolute bundle-directory locator；final basename 单段、非 `.`/`..`，
  parent 通过 no-follow held directory descriptor 固定；
- `--report-out`、现有单文件 output、跨文件系统 cache、symlink parent/final、可写给非 owner 的
  parent、覆盖已有非匹配 directory 均立即 HARD_RED；
- target 不存在才是 sealed `miss`；target 存在时只能作为完整 `hit` held-open并全量验证，任何
  不匹配都不能删除、覆盖或降成 miss；`disabled` 要求 target 不存在。

miss 的全部中间 bytes 只写 owner 私有 anonymous held files，再组装到同一 output parent 下的
不可采用 staging directory。child 不持有 final path；它只写 claim 后收到的私有 staging handles，
关闭后由 launcher owner 重读、strict-verify、计算完整 manifest，并验证 execution receipt 与最终
HEAD fence。所有文件和 staging directory `fsync` 完成后，唯一 publication 操作是：

```text
Linux: renameat2(held_parent, staging, held_parent, final, RENAME_NOREPLACE)
Darwin: renameatx_np(held_parent, staging, held_parent, final, RENAME_EXCL)
```

对应原语、same-device 证明或 directory durability 任一不可用，必须在编译前 HARD_RED。
no-replace directory rename 是唯一线性化点；rename 前 crash 的 staging 从不成为 lookup authority，
rename 后 generation 已完整成功，launcher 不得返回失败或执行补删除。commit 后 parent `fsync`
失败属于 durability-unknown fail-stop：进程终止且 recovery 只按完整 manifest 验证该 generation，
不得报告普通失败后重编覆盖。

hit 不写任何文件、不复制到另一 output path；claim、最终 HEAD fence和完整 held generation 复验
成功后复用同一 immutable directory并进入 `COMMITTED`。同一 cache key 想要不同 locator 时，
该 locator 缺失就是独立 miss；禁止用 post-commit hardlink/symlink/copy 制造第二发布点。

## Single Consumption Entry

唯一生产入口的抽象合同为：

```text
CsgCoreProductionConsumeAdmittedInputInto(
    capability: var CsgCoreProductionAdmittedInputCapability,
    result: var CsgCoreProductionExecutionResult,
    error: var str): bool
```

函数第一项有副作用的动作必须是原子 claim；claim 前只允许读取 argv 中的固定 capability
transport token，禁止 source/cache/provider `stat/read/open/mmap`、plan build、cache key、
report write、output create 或 child spawn。claim 由 parent owner CAS；claim 成功并收到 held bundle
descriptor 后，payload 被 move 到模块私有 execution lease，公开 capability 立即失效。child 不能
在本地把 capability 标成 claimed，也不能在 claim reply 前持有 bundle/output descriptor。

所有进入 Cheng 执行域的正式 aliases 必须只做无 I/O 的命令识别和 token 提取，
然后调用该入口恰好一次：

```text
backend_driver_main
backend_driver_dispatch_min
system_link_exec_pure_main
installed csg CLI child
```

`tools/csg` 只是不持有 authority 的 transport alias；它只能 exec 固定 launcher，并且
必须保证所启动的唯一 Cheng child 进入上述 consume 一次。wrapper 自身不得伪造
claim 或承载第二执行语义。

cache、system-link plan、runtime、provider 和 native-link 不再有独立 production entry；它们
只能接收模块私有的 claimed lease 或该 lease 的只读 phase view。任何 direct call 都是
compile-time/reachability HARD_RED。内部 phase view 不能被保存、序列化、返回或用于签发
第二个 lease。

consumer 只从 held bundle 构建 plan；cache miss 时把结果写入 anonymous/private handles并交还
launcher owner。最终 HEAD fence、output byte revalidation和 no-replace directory commit 由同一个
registry owner执行。consumer 必须等待 owner 的 `COMMITTED` acknowledgement 才能返回 0；owner
返回 `ABORTED`、channel 关闭或 acknowledgement binding 不等时必须非零退出且不能发布 report。
cache hit 同样必须 consume 一次并等待 owner 复验，不允许 alias 在 consume 外直接返回 0。

cold bootstrap 的 C `system-link-exec` 不能实现、签发或伪造该纯 Cheng capability。它只能
保留 bootstrap/diagnostic 角色；作为 production alias 时必须在读取 `--in` 前 hard-fail，
且其自写 `full_backend_codegen`/scope report 永远不能进入 production admission。

`tools/csg` production path 不得按请求即时编译 `cli.cheng`。它只能 exec 固定安装的 native
launcher并传递请求；缺 launcher、capability或已验证 generation 时直接 HARD_RED。开发构建
命令必须是显式非生产命令，不能共享 production success marker、cache或 receipt。

## Execution Flow

```text
raw request
  -> fixed installed pure Cheng launcher + production_held_exec_provider owner
      -> acquire shared current-HEAD lease and held output parent
      -> stable capture source/provider/cache bytes
      -> full before/after CSGC canonical seal
      -> real proof bytes verify + operation/transaction replay
      -> current HEAD second fence
      -> request/provider/cache/output closure seal
      -> seal one held bundle and issue one runtime-owned capability
      -> held-spawn child with activation channel only
  -> held child activation
      -> formal alias extracts token only
      -> CsgCoreProductionConsumeAdmittedInputInto (atomic claim first)
          -> owner CAS + SCM_RIGHTS delivers read-only held bundle
          -> cache hit: revalidate admitted committed generation, write nothing
          -> cache miss: compile only from admitted CSGC/source snapshot
              -> provider phases consume claimed phase view
              -> output only to private held handles
          -> return closed held outputs to launcher owner
  -> owner final current HEAD fence under same shared lease
      -> verify every output byte and execution receipt
      -> miss: one no-replace output-directory commit; hit: zero writes
      -> COMMITTED acknowledgement; release HEAD lease
```

任何箭头失败都进入 `ABORTED`，不能跳到另一条路径继续。

## Zero-Artifact Failure

“失败零产物”指失败前后的 production-visible 状态完全相同：

- output bundle directory、CSG head、alias和publication receipt 均不新增、不覆盖、不截断；已有
  合法 generation 保持逐字节不变；
- 中间输出只能写入匿名 held file（Linux `O_TMPFILE` 或等价机制；Darwin 创建后立即 unlink
  的 held fd）或未发布的私有 generation；
- 全部 bytes、mode、CID、map/report closure、execution receipt和最终 HEAD fence 通过后，
  以一个 no-replace generation-directory commit 作为唯一线性化点；
- 多个独立 rename、单文件 `--out`、独立 `--report-out`、先复制 executable 再复制 map、
  post-commit cache store和失败后删除补救都不满足本合同；
- commit 前 crash 不留下可见候选；commit 后即为成功，不允许再返回失败；恢复只接受完整
  committed generation，残留 staging 永不成为 authority。

output 和 cache entry 固定同处一个 generation；任何生产代码试图写第二 cache 目录、跨文件系统
复制或两个目录顺序提交，都必须在编译前 HARD_RED。cache hit 不新建、不恢复、不复制任何 entry。

失败诊断只允许返回值和 stderr；production report 文件本身属于输出 bundle，失败时不得写出。

## Canonical Transcript

全部 CID 使用 SHA-256，`text(x) = u32le(UTF-8 byte length) || UTF-8 bytes`，CID 字段以
32 个原始 bytes 写入。禁止字符串拼接、自报 CID或 map iteration order。

```text
semanticKernelCid = SHA256(
  text("csg_core.production.semantic_kernel") ||
  beforeBindingCid || afterBindingCid ||
  proofSetCid || operationSetCid || transactionBindingCid)

executionInputCid = SHA256(
  text("csg_core.production.execution_input") ||
  semanticKernelCid || compilerRequestCid || sourceClosureCid ||
  compilerIdentityCid || runtimeIdentityCid || launcherIdentityCid ||
  providerClosureCid || argvCid || environmentCid || resourcePolicyCid ||
  outputContractCid)

publicationLocatorCid = SHA256(
  text("csg_core.production.publication_locator") ||
  outputParentDescriptorIdentityCid || text(finalBasename) ||
  outputInterfaceCid)

admittedInputCid = SHA256(
  text("csg_core.production.admitted_input") ||
  executionInputCid || text(cacheDecision) || cacheKeyCid ||
  cacheOutputBindingCid || currentHeadBindingCid || publicationLocatorCid)

heldBundleCid = SHA256(
  text("csg_core.production.admitted_input_bundle") ||
  u64le(canonicalEnvelopeByteCount) || canonicalEnvelopeBytes)

leaseCid = SHA256(
  text("csg_core.production.admitted_input_lease") ||
  admittedInputCid || heldBundleCid || currentHeadBindingCid ||
  sessionCapabilityCid || u64le(sessionGeneration) ||
  sessionNonceCid || u64le(activationOrdinal) || childProcessIdentityCid)

outputGenerationCid = SHA256(
  text("csg_core.production.output_generation") ||
  executionInputCid || cacheKeyCid || outputBundleManifestCid)
```

`proofSetCid` 和 `operationSetCid` 按 transaction ordinal 编码 count 后逐项写 raw CID 和
byte count；不能按 CID 重排。每个 nested binding CID 必须由 payload 原始 bytes 独立重算，
不能接受 caller 的同名字段。canonical envelope 不含 lease/session/child identity，因此冻结输入的
`heldBundleCid` 唯一；一次性字段只进入 `leaseCid`。output manifest 不含 lease CID，cache miss
首次生成与后续 hit 必须得到同一个 `outputGenerationCid`。

## Audit Migration Inventory

| current surface | required migration | completion evidence |
| --- | --- | --- |
| `src/core/runtime/production_held_exec_provider.cheng` generic receipt issuer | 原地成为唯一 registry/bundle/HEAD lease/publication owner；只保留一个 admitted-input issuer edge | owner/issuer AST 唯一性；live slot、CAS、SCM_RIGHTS、跨进程 replay 动态矩阵 |
| `src/core/csg_core/production_launcher.cheng` scalar `Require*AuthorityInto` | 新 launcher main 只经 `CsgCoreProductionLauncherMainAdmitAndActivateInto` issue；旧 scalar issuer 删除 | 全仓 issue caller count=1；删除/复制/旁路 mutation 打红 |
| `src/core/tooling/compiler_main.cheng` `CompilerPureExeCacheKeyInto/TryRestore` before `CompilerRunSystemLinkExec` | 删除 pre-admission restore；正式 main 只提取 token并 consume | cache hit/miss/tamper 动态矩阵；child 首次 source/cache syscall 晚于 claim |
| `src/core/backend/system_link_plan.cheng` closure/parser/file reader | plan 只消费 held source bundle/CSGC rows；禁止路径重开和 import rediscovery | child source open/read/mmap counter=0；closure CID 与 capability 相等 |
| `src/core/backend/system_link_exec.cheng` plan 内 scalar admission | `BuildSystemLinkExecPlanWithWorldAndChannelInto` 降为 claimed-lease 私有 phase；不能 issue或接 raw request | receipt-only、direct plan和pre-claim build mutation 全拒 |
| `src/core/backend/system_link_exec_runtime.cheng` cache/provider/source subprocess | BeginExecution 只收 claimed phase view；provider/cache bytes来自 held bundle；child command 不含 raw `--in` | provider/source/cache syscall trace、child argv/env/object receipt 对拍 |
| `src/core/tooling/backend_driver_main.cheng` direct plan/runtime 与 post-success cache store | `system-link-exec` 只调唯一 consume；删除 `BackendDriverStoreSystemLinkExecCache` production edge | AST call graph唯一，cache目录写为0，删除 consume mutation打红 |
| `src/core/tooling/backend_driver_dispatch_min.cheng` `BackendDriverDispatchMinExecuteFormalRequestInto` | 正式 command只提取 token并 consume；debug/dev command不能共享 production success | direct plan/runtime reachability=0，正式 argv 无 raw path |
| `src/core/tooling/system_link_exec_pure_main.cheng` `PureSystemLinkExecRunFull` | 正式 command只提取 token并 consume；不保留 parallel pure production entry | direct parse/normalize/plan/runtime mutation打红 |
| `bootstrap/cheng_cold.c` | production 形在 raw `--in` 前 HARD_RED；bootstrap report 明确不具 production authority | C 入口 mutation、raw read syscall、伪 report 全拒 |
| `tools/csg` request-time compile/cache generation | production alias只 exec固定 launcher；删除即时编译 `cli.cheng` 和 wrapper generation cache | 缺固定 launcher先于任何 source/cache touch HARD_RED |
| `src/core/csg_core/merkle_store.cheng` successor read/publish | shared current-HEAD lease贯穿 issue→commit；所有 publisher取得同 anchor exclusive lease | reader/writer并发矩阵；final fence→commit窗口不能推进HEAD |
| 现有单文件 output、report和全部 production cache helpers | 迁移为一个 bundle-directory generation；production `--report-out` 和第二 cache 物理退役 | syscall/crash矩阵只观察0或一个完整directory generation |

`src/core/backend/backend_driver_dispatch_min.cheng` 当前是零字节兼容路径，不能成为正式入口或
验收替身。行号只记录本次审计定位，不进入 authority；实现验收必须按模块/函数结构身份和调用图
重建 inventory。

## Mutation Matrix

| mutation | required first rejection | visible artifacts |
| --- | --- | --- |
| noncanonical after CSGC、非最短 varint、dictionary/fact/section 乱序 | whole-object canonical seal | 0 |
| 同语义但第二组物理 CSGC bytes | writer re-encode byte equality | 0 |
| CSGC object/directory CID、byte/fact count 任一漂移 | CSGC binding | 0 |
| schema/profile/profile-set/DAG/facts root 漂移 | full production admission | 0 |
| 只给 proofCid、不提供 proof bytes | proof payload presence | 0 |
| proof 截断、尾字节、字段乱序或 re-encode 不等 | proof canonical seal | 0 |
| proof expected root、query、terminal、step direction/count 漂移 | proof verify | 0 |
| proof bytes 与 operation.proofCid 不等 | operation binding | 0 |
| operation bytes/CID/kind/fact/query 漂移 | operation strict decode | 0 |
| operation 删除、重复、交换或 ordinal 跳跃 | ordered replay | 0 |
| patch after root/count 与 full rebuild 不等 | admitted delta comparison | 0 |
| transaction request/plan/receipt 任一 raw bytes 漂移 | transaction replay | 0 |
| receipt operation/reachable-node/invalidation 列漂移 | transaction closure | 0 |
| genesis HEAD、零 operation receipt 或空 proof | published transaction completeness | 0 |
| current HEAD receipt bytes 与 `head.receiptCid` 不等 | transaction receipt object binding | 0 |
| current HEAD 不能由 receipt generation/afterManifest/beforeHead/receiptCid 唯一推导 | derived current-head binding | 0 |
| shared HEAD lease 缺失/提前释放或 publisher 不取 exclusive lease | lease/reachability gate | 0 |
| current HEAD 与 transaction final state 不等 | issue head fence | 0 |
| issue 中、claim 后或 commit 前 HEAD 漂移 | 对应 head fence | 0 |
| source byte、length、module path、entry或 import edge 漂移 | source closure seal | 0 |
| provider source/object/export root/dependency/compiler 漂移 | provider closure seal | 0 |
| argv/env/target/emit/backend/jobs/channel/resource policy 漂移 | executionInputCid | 0 |
| cache key 依赖 path/mtime 或现场 source read | cache key contract | 0 |
| cache entry absent | sealed miss；允许执行，不算错误 | 仅成功后一个完整 directory |
| cache entry存在但缺 executable/map/report | cache admission HARD_RED，禁止 miss fallback | 0 |
| cache output bytes/mode/manifest/receipt 漂移 | cache output binding | 0 |
| production `--report-out`、单文件 `--out` 或第二全局 cache | output-interface gate | 0 |
| existing output directory cache key 不匹配 | cache admission HARD_RED，禁止覆盖/删除 | 0 |
| cache restore 在 claim 前读取或复制 | consume-order gate | 0 |
| alias 在 claim 前 stat/read/open/mmap source | consume-order gate | 0 |
| provider 在 claim 前读取 source/object path | consume-order gate | 0 |
| alias 直调旧 plan/runtime/cache API | production reachability gate | 0 |
| generic provider/launcher issuer仍可达或第二 issuer edge 出现 | unique issuer call graph | 0 |
| 同一个 capability 连续 consume 两次 | registry state `CLAIMED` | 0/首次结果不变 |
| capability copy 并发双 consume | atomic CAS，恰好一个可 claim | 最多一个完整 bundle |
| 旧 capability 跨进程/会话重放 | session generation/nonce/activation | 0 |
| terminal slot复用未递增generation、generation回绕或owner restart复用session capability | registry lifecycle seal | 0 |
| child 在 claim 前收到/读取 bundle或staging fd | descriptor delivery order | 0 |
| hit/miss descriptor count、type、order漂移，或用第二次 `SCM_RIGHTS` 补发staging | activation reply seal | 0 |
| bundle fd 经 argv/env/path传递，或 parent仍持有 writable fd | held bundle seal/transport | 0 |
| Linux claim credential与pidfd不等，或Darwin LOCAL_PEERPID/LOCAL_PEEREPID与spawn identity不等 | activation process identity | 0 |
| caller 构造 slot/generation/CID | live registry record lookup | 0 |
| consume 失败后 reset/retry | terminal `ABORTED` | 0 |
| cache/provider 失败后切换另一实现 | no-fallback state machine | 0 |
| executable 成功后 map/report 失败 | anonymous staging，禁止逐文件 publish | 0 |
| staging bytes完成但 manifest/fsync/HEAD fence失败 | pre-commit abort | 0 |
| 两个 rename、post-commit cache write或跨文件系统 copy | single-generation publication gate | 0 |
| no-replace directory commit竞争 | 恰好一个完整 generation；另一方 sealed hit或HARD_RED | 最多一个完整 directory |
| output commit 前 execution receipt 或 final HEAD 漂移 | final admission fence | 0 |
| cold C 自报 full_backend_codegen/production scope | role/capability admission | 0 |
| `tools/csg` 缺 launcher后即时编译源码 | fixed-launcher gate | 0 |

每个 required obligation 必须绑定独立正例 bytes CID、至少一个唯一负例 bytes CID、精确
mutation path和值、固定首拒点。mutation 数量不能代替 obligation 正例或动态执行证明。

## Verification and Completion

完成必须同时具备：

1. 全仓结构调用图证明 admitted-input issue edge 精确为 1、consume-and-execute入口精确为 1；
   generic scalar issuer物理删除，旧正式入口在任何 raw input syscall前固定 HARD_RED。
2. pure Cheng 动态 gate 覆盖完整 CSGC/proof/operation/transaction replay、genesis/zero-op 拒绝、
   cache hit/miss/tamper、双 consume、并发 consume、跨进程 replay和 zero-artifact fail injection。
3. syscall/event trace 证明每个正式 child 的 capability claim 是首个生产动作，claim 前
   source/cache/provider `stat/read/open/mmap` 计数均为 0；issuer capture 与 child execution
   使用不同 scope，不得混写计数；bundle/staging descriptor vector只在owner CAS成功后通过一个
   reply中的一次 `SCM_RIGHTS` 到达匹配 child，hit/miss descriptor count、type、order逐项对拍。
4. current HEAD 动态矩阵证明现有 receipt原始bytes唯一推导after HEAD，shared lease覆盖
   issue→claim→final fence→output commit，所有publisher由同anchor exclusive lease支配。
5. 每个 failure point 和逐 syscall crash matrix 后，output bundle directory和 CSG current HEAD
   与运行前逐字节相同；成功只出现一个完整 committed directory，cache hit为0写入。
6. 同一冻结 source/request/provider/toolchain 下多次签发的 `semanticKernelCid`、CSGC bytes、
   facts root、proof bytes、operation/transaction bytes和 cache key逐字节相同；leaseCid 唯一。
7. GEN2/GEN3 原始字节固定点、正式 stage3/backend driver、held-exec identity和 source/tool
   closure全部绑定同一回执。
8. Linux 在 kernel cgroup v2 aggregate `memory.max=1073741824`、`memory.swap.max=0` 下完成；
   Darwin userspace polling 只作观测，held-fd spawn 原语未闭合时保持 HARD_RED。

文档、静态 token、单个 smoke、caller 自报 receipt、未持有真实 proof bytes或仅能 fail-closed
都不构成完成。

## Resolved Interfaces

本提案层不再保留接口二选一：

- registry owner：原地扩展 `src/core/runtime/production_held_exec_provider.cheng`，Arena+SoA、
  `int32` slot；不新增第二 runtime/registry。
- unique issuer：唯一边固定为
  `CsgCoreProductionLauncherMainAdmitAndActivateInto ->
  CsgCoreProductionHeldExecProviderIssueAdmittedInputInto`；所有 generic `Require*AuthorityInto`
  issuer退出生产调用图。
- cross-process payload：owner CAS成功后才经 authenticated channel 的一个 reply、一次
  `SCM_RIGHTS` 传递固定 descriptor vector；`fd[0]` 是唯一 read-only canonical held bundle，
  `miss/disabled` 的 `fd[1]` 是唯一 owner-private staging directory，registry和HEAD lease永不复制进child。
- atomic publication：production `--out` 是唯一 bundle directory，`--report-out` 非法，cache
  entry同 generation，miss只用一次 same-parent no-replace directory rename，hit零写入。
- current HEAD：复用现有 transaction receipt，通过
  `CsgCoreMerkleHeadEncodeWithReceipt(generation, afterManifestCid, beforeHeadCid, receiptCid)` 推导
  current after HEAD；shared lease由唯一owner持有到output commit，publisher使用同anchor
  exclusive lease。不增加 `afterHeadCid` 或平行 receipt schema。

apply 的未完成项只是生产实现与动态证据：runtime structured descriptor ABI、Linux/Darwin held
transfer、store reader/writer lease、bundle-directory publisher、四个 formal alias迁移、cold C
早拒绝、正式 stage3/backend driver和全量 crash/syscall/1GiB/fixed-point门禁。任一项未闭合都保持
HARD_RED 和 `dynamic_completion_credit=0`，不能退回旧路径、兼容读取、第二 cache、pathname
reopen或 receipt-only fallback。

## Prohibited

- capability 只绑定 CID 而不持有并复验真实 CSGC/proof/operation/transaction bytes。
- 以 nominal/private 类型、随机 nonce、自哈希 receipt或 caller observation 单独充当 authority。
- 把 registry/slot payload复制到child、child-local claim、claim前传bundle fd或从 argv/env/path传fd。
- owner 在 issue 后仍持有任一 writable bundle descriptor，或 Darwin bundle 未 unlink/未关闭writer。
- claim 后重新按 source/import/provider/cache path发现输入。
- 任一正式 alias、cache 或 provider 绕过唯一 consume 入口。
- invalid cache 当 miss、primary 失败转 backend2、pure 失败转 cold或任何其他 fallback。
- 双写、兼容 schema、`v1/v2` 平行 capability、第二 CSGC/root/proof codec。
- generic issuer、第二 registry、第二 cache、单文件 `--out`、production `--report-out`、逐文件发布后
  失败删除、失败报告文件、半成品 cache或可被后续采用的 staging。
- final HEAD fence后不持shared lease、任一publisher绕过exclusive lease、caller自报afterHeadCid。
- 用源码行号、函数名文本、path、mtime、name+arity或对象地址作为 authority identity。
