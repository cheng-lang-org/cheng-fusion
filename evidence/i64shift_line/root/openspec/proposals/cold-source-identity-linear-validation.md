# Cold Source Identity Linear Validation

状态：`applying`。2026-08-09 用户已明确确认进入 apply；当前按实施原子1开始显式
`ColdCompilationContext`、epoch、worker lease、compile-owner recovery与结构门迁移。原子1只建立context基础，
legacy locator仍允许暂存，生产性能与动态完成信用保持0；其余原子必须继续按下文依赖顺序推进。

## 动机

`system_link_exec_pure_main.cheng` 的现行真实闭包为 `178` 个文件、`563356` 行、
`27575444` raw bytes、`1357` 条 import edge。O0 diagnostic compiler 的 live sample 显示，前
6 分钟仍全部停在 transitive import/type/signature identity 阶段，尚未进入 parser BodyIR、object、
provider 或 linker。

根因不是 source identity 证明本身，而是同一不可变证明被逐 declaration、逐临时 `Symbols`、逐
`source_open` 重算：

```text
symbols_declaration_origin_intern
  -> symbols_source_identity_require_snapshot
    -> symbols_source_identity_validate
      -> canonical order + document CID + root CID + row equality
```

`symbols_new_type_scan` 还会为每个模块创建 child Symbols，其第一次 origin intern 再复制并全验整张
source table；`source_open` 在 active snapshot 下每次 mmap、复制整文件、mprotect，类型/签名/global/
transitive walk 重复消费；随后每个 declaration 又从源码第 0 byte 计行，并线性扫描已有 origin rows。
正确目标是让完整验证次数与 declaration/module 数量无关地固定，同时保持 seal 与生产写出前的全量拒绝。

## 唯一事实结构

0. 每次编译拥有显式 `ColdCompilationContext*`，并贯穿 snapshot、Parser、root/child Symbols、symbol closure、
   type workspace 与 tracked writer。禁止用进程全局 `ColdActiveSourceSnapshots` 恢复 authority；两个 context
   可以并行，但任何 receipt、epoch、Parser 或 cache entry 都不得跨 context adopt。若实现尚未支持并行，
   只能由进程级唯一 compile owner 在第二次 begin 时 hard-fail，不能无锁覆盖全局 active pointer。
   context 内有两个独立、非零且溢出 hard-fail 的单调 epoch：`source_seal_epoch` 标识一次 snapshot seal；
   `symbol_scope_epoch` 标识每个 root/child Symbols 的语义作用域实例。child 可共享 source receipt，但不同
   scope 必须拥有不同 `symbol_scope_epoch`。
   `ColdCompilationContext*`/id、两个 epoch、`semantic_generation`、`type_graph_generation`、
   `layout_generation`、pointer、absolute/diagnostic path、filesystem alias、hash bucket、capacity 与 work counter
   全部只是进程 capability/诊断，绝不进入 portable receipt CID、CSGC、facts_root 或 proof。portable identity
   只编码后文明确列出的规范字段。

   context基础设施必须使用Arena+SoA与`int32`行身份，不能以`Symbols*`、`Parser*`或线程ID充当authority键：

   ```text
   ColdCompilationContextRows
     context_ids: uint64[]                  # 非零、进程本地、溢出拒绝
     states: uint8[]
     begin_jump_depths: int32[]
     source_epoch_counters: uint64[]
     active_source_epochs: uint64[]
     scope_epoch_counters: uint64[]
     active_snapshot_rows: int32[]          # -1 或exact row
     outstanding_worker_leases: int32[]
     stop_requested: _Atomic uint8[]         # 0/1，worker failure后release-publish
     first_failed_worker_rows: _Atomic int32[] # -1或exact lease row，仅local诊断

   ColdSymbolScopeRows
     context_rows: int32[]
     context_ids: uint64[]
     parent_scope_rows: int32[]             # root=-1
     symbol_scope_epochs: uint64[]
     bound_source_seal_epochs: uint64[]     # root seal前为0
     roles: uint8[]
     states: uint8[]

   ColdWorkerLeaseRows
     context_rows: int32[]
     context_ids: uint64[]
     source_seal_epochs: uint64[]
     symbol_scope_rows: int32[]
     symbol_scope_epochs: uint64[]
     worker_roles: uint8[]
     states: uint8[]
     result_codes: _Atomic uint8[]           # NONE/OK/ERROR，worker单写release-publish
   ```

   跨节点join固定使用`(context_id,int32 row,epoch)`；registry/Arena pointer、owner thread只可作短生命周期
   载体或single-writer断言，不能作identity/cache key。若首实现选择single-owner，进程级状态只保存原子claim与
   下一个nonzero context id，不保存snapshot/receipt pointer；第二次begin在任何覆盖前hard-fail，释放后顺序下一次
   compile必须取得新id。状态机固定为：

   ```text
   context: EMPTY -> ACTIVE -> DRAINING -> RELEASED
                    \-> POISONED -> DRAINING -> RELEASED
   snapshot: EMPTY -> BUILDING -> SEALED -> DETACHED
                                  \-> ABORTED -> DETACHED
   symbol scope: EMPTY -> LIVE_PRESEAL -> SOURCE_BOUND -> CLOSED
                                    \-> ABORTED -> CLOSED
                       LIVE_PRESEAL -> ABORTED -> CLOSED
   worker: EMPTY -> RESERVED -> RUNNING -> EXITED -> JOINED
                       \-> CANCELLED             # 未启动worker
   ```

   BUILDING→ABORTED必须释放全部未发布builder且receipt pointer/source epoch始终为0；LIVE_PRESEAL或SOURCE_BOUND
   →ABORTED必须释放本scope私有storage但不得释放owner receipt。RESERVED尚未启动可唯一CANCELLED；RUNNING不能直接
   cancel或release，必须先EXITED再JOINED。worker reserve时result必须为NONE；正常或错误退出必须分别单写
   release-publish OK/ERROR，再release-publish EXITED；owner join后必须acquire读取且拒绝EXITED+NONE、非EXITED结果或二次写结果。
   source seal epoch只能在root完整全验后生成，所有receipt字段写完后最后release-publish SEALED；scope epoch在每个
   root/child scope发布前唯一生成，child必须直接绑定同context的已seal source epoch。0、复用、root/child同scope、
   溢出或失败后复用半发布epoch全部拒绝。context end只接受snapshot detached、全部scope closed、全部worker
   JOINED/CANCELLED且outstanding为0；POISONED仍有worker时禁止longjmp恢复并terminal fail-stop。

   两个生产入口`cold_compile_source_path_to_macho`与`cold_compile_source_to_object`必须统一为
   `arena open -> context begin -> snapshot begin(context) -> root scope -> capture/seal/bind -> Parser/child/worker exact join
   -> all workers join -> snapshot detach -> context release -> 原有arena/output cleanup`，并收敛到唯一退出段；异常unwind
   同步消费context。所有`Parser`位置初始化必须改走唯一issuer/helper，禁止新增字段依赖零初始化而静默丢失context。

   context begin前，每个生产入口必须先在本入口栈上建立唯一compile-owner outer recovery frame，且frame所需的
   `Arena*`/`ColdCompilationContext*`自动变量必须在`setjmp`前固定，避免longjmp后读取未定义的非volatile自动值。
   现有jump stack只允许恢复控制流，不能保存或恢复context/snapshot/receipt authority；即使内层把普通
   `ColdErrorRecoveryEnabled`关闭，`die()`仍必须跳回本compile-owner frame并进入唯一cleanup。context begin到
   snapshot locator发布之间的失败也必须由该frame清理，不能为此新增进程全局context pointer。worker线程绝不跨线程
   longjmp owner frame：worker每次领取任务前必须acquire检查context `stop_requested`。worker错误必须先向exact lease row
   单写release-publish `ERROR`，再执行
   `compare_exchange(first_failed_worker_rows[context_row], -1, lease_row)`；无论CAS胜负都必须随后
   `atomic_store_release(stop_requested[context_row], 1)`，然后走
   `RUNNING -> EXITED`；任一worker观察到stop后不得再领新任务，但仍必须发布`OK`并退出。owner逐一join成
   `JOINED`后必须按lease row检验全部result，有`ERROR`才把context置`POISONED`并进入cleanup；部分
   `pthread_create`失败必须把未启动的`RESERVED`唯一转`CANCELLED`、
   join全部已启动worker后再失败。运行中worker无法确认退出或`pthread_join`失败时terminal fail-stop，禁止释放其
   context/Arena后返回。`first_failed_worker_row`与其竞态顺序只是local control/diagnostic，不得进入portable
   receipt/CID/CSGC/facts/proof；可回放的failure只能编码canonical error class，需要选择多错误时必须在join后按
   canonical worker/work-item row顺序派生，不得使用first-CAS获胜顺序。

   本条是最终完成不变量，不是原子1的完成声明：原子1合入时`ColdActiveSourceSnapshots`可暂时作为legacy locator，
   但不得签发新authority且`performance_credit=0`；只有原子2+3把全部生产authority join迁到context并证明该global
   authority恢复路径零可达后，才可宣称本条完成。
1. `ColdSourceSnapshotTable` 在 `seal` 成功后发布唯一、只读 `ColdSourceIdentityReceipt` 与
   `source_seal_epoch:uint64`。receipt 至少绑定 schema、package id、canonical module path/source rows、
   content/document/root CID、portable `ImportResolverReceiptCID`、`import_parser_schema`、
   line-start CSR、import-edge CSR及它们的shape/CID；resolver receipt必须绑定规范package/module解析映射、
   resolver schema与portable package identity，absolute path只属于local locator。epoch只表示本进程中一次不可变seal，不进入
   portable CID，`0` 非法，溢出 hard-fail。receipt 只能由 snapshot owner 构造，不能从 caller bytes、
   path、布尔值或持久 cache 反序列化为已验证 capability。seal 事务不可拆分，固定顺序是：每个 source row
   恰好一次 capture/materialize → 在未发布builder上构造line-start CSR并逐source恰好一次扫描import declarations、
   发布完整edge SoA builder → full-validate builder bytes/metadata/root/line/edges/resolver/schema → 对每行构造portable framed source key
   `(documentCID, contentCID, packageId, canonicalModulePath UTF-8, sourceBytes)`，按完整 key byte-radix
   canonicalize source rows并 remap alias/import edge/source-row引用 → 对portable edge full key
   `(parentDocumentCID,childDocumentCID,alias UTF-8,tokenByteOffset)`做完整byte-radix、exact dedup与collision check，
   按canonical parent row重建edge CSR并签发edge CID → 构造
   receipt → full-validate receipt → 冻结只读存储 → 最后一次发布 pointer/epoch；失败时
   pointer 与 epoch 均保持未发布。
   import scanner必须直接实现正式import grammar并发布结构化结果：单模块`import M [as A]`与分组
   `import P/[a,b,...]`逐member完整展开，alias、token offset与resolver query都从源token范围生成。缺`]`、空member、
   重复`as`、分组`as`、字符串/相对/绝对路径、尾随非注释token或任一未解析module必须hard-fail，不能以“不是import”
   静默跳过。现行`cold_parse_import_line`的group首项TODO、栈上`full_path` Span、`cold_import_source_path`的`stat`探测/
   前缀猜测均不得包装成seal authority；必须由唯一exact parser + resolver receipt issuer替换，diagnostic local path仅是
   resolver结果的locator投影。
2. seal 前 builder 可以追加 semantic source row、canonical module path、diagnostic alias、line CSR 与
   import edge；seal 后任何修改 count、bytes、path、CID、root、alias、CSR 或 edge 的公开/私有 mutator
   都必须 hard-fail。现行 `views` 是已 munmap 指针的非 authority 注册表，必须删除；seal 后 consumer
   只借用 snapshot owner 在 capture 时为每 row 建立的一次只读 canonical mapping（或 seal 时一次建立的
   read-only slab），禁止再 mmap/copy/mprotect/munmap 每次读取。diagnostic alias/path 只绑定 local
   capability 与错误位置，改变时使该 local capability 失效，但不得改变 portable Source receipt CID。
   普通非 Cheng 文件的 owning `source_open_raw -> ColdOwnedSource` 与 Cheng snapshot 的
   `cold_source_snapshot_borrow_path/row -> const ColdSourceBorrow*` 必须是不同静态类型，不能与raw owner都返回
   `Span`再猜owner。`ColdSourceBorrow`是consumer不可见布局、只能由snapshot owner构造的opaque registry row；
   私有owner表绑定`(context,source_seal_epoch,canonical_source_row,base_offset,ptr,len,state)`，caller只能复制
   `const` handle pointer，不能聚合初始化、覆写字段或据此恢复authority。每次 consume 必须从handle精确join
   active owner row，并以 checked arithmetic 验证
   `ptr == canonical_row.ptr + base_offset`、`base_offset <= canonical_row.len`、
   `len <= canonical_row.len - base_offset`。跨线程读取还必须由owner登记不可跨context存储的
   `ColdSourceBorrowWorkerLease`，worker退出时唯一consume；snapshot owner统一释放mapping，context detach/release
   前全验active worker lease count为0。
   解码后的 fmt/interpolation 等 arena payload 不是 canonical source mapping，必须使用另一静态类型
   opaque `ColdParserView { payload, owner_borrow, origin_offset_map }`；它同样只能由Parser owner构造，map 的每个边界必须单调、属于同一 canonical
   source row、落在 owner borrow 范围内且完整覆盖 payload 的 source-origin 投影，semantic identity 只能来自
   `owner_borrow`，不得从 decoded payload 指针反推。Parser必须消费 `ColdSourceBorrow` 或 `ColdParserView` 并
   传播 exact `(context,source_seal_epoch,canonical_source_row,base_offset)`；所有Cheng cleanup同批删除consumer
   `munmap`，否则首个旧cleanup会卸载owner mapping并让sibling borrow UAF。
   唯一构造面固定为：snapshot owner用exact numeric `(local_start,len)`从active owner borrow签发sub-borrow；Parser
   owner在decoded/synthetic payload产生的同一步签发带完整origin map的`ColdParserView`；
   `cold_parser_issue_from_borrow`、`cold_parser_issue_from_view`与`cold_parser_child_slice(owner,local_start,len)`是仅有
   Parser issuer。禁止保留`parser_child(owner, Span)`、`cold_parser_source_view_offset`或先丢成`Span`后再用指针差、
   文本搜索、source line恢复origin map。只做无语义身份的参数/类型文本词法扫描必须改用另一静态类型
   `ColdLexicalCursor`，不能构造context/epoch为0的Parser；所有语义Parser root、copy/probe/child都必须经issuer并
   保持同context/scope/source epoch。
3. root `Symbols` 在 seal 后显式 adopt receipt；所有 `symbols_new_type_scan` child 只保存同一个 receipt
   指针、source seal epoch 与各自唯一的 symbol scope epoch，不复制 source rows，不重算 SHA/排序/metadata。
   child adopt 必须证明
   `child.arena == parent.arena`、`child.context == parent.context`、parent receipt 已验证、active snapshot
   receipt pointer/source seal epoch 完全相等；
   只允许 owner-thread single writer 或 CAS `NULL -> receipt`，禁止先发布 attached bool 再填字段。snapshot/receipt 的
   生命周期覆盖全部 root/child Symbols，child cleanup 不得释放 owner storage。adopt 只在 receipt 已完成
   全验且 owner active/sealed 时原子发布：

   ```text
   source_identity_receipt = snapshot.receipt
   source_identity_seal_epoch = snapshot.source_seal_epoch
   symbol_scope_epoch = context.next_nonzero_symbol_scope_epoch()
   ```

   任一步失败不得留下可复用的 receipt/epoch。`Symbols*`、`ObjectDef*` 或 allocator 地址都不得作为
   receipt/cache 身份，避免释放后地址复用命中旧 compile。
4. declaration interning 的热路径只允许做 O(1) immutable join：context、active、sealed、receipt pointer、
   source seal epoch 与 exact source row 必须精确相等。它不再排序 source rows、复制 source
   identity、重算 SHA 或逐行比较副本。
5. 在任何 object/executable/map/report 的首个任意 byte 写出前，compiler 必须先原子取得 context/snapshot/
   source/body/symbol/type/layout receipt 的 `prepublish lease` 并冻结所见版本，再在 lease 内重新完整验证 live
   snapshot、`ColdSourceIdentityReceipt`、`ColdSemanticBodyReceipt`、`SymbolClosureReceipt`、`ColdTypeIdentityReceipt` 与
   `TargetLayoutReceipt`，重算各自 CID，并核对 context、source/symbol epoch、root/count/package id、
   semantic/type graph/layout generation。验证失败释放 lease且零输出；成功后在同一 lease 内恰好签发一次
   `PrepublishTicket { compilation_context_id, source_seal_epoch, source_root, symbol_scope_epoch,
   semantic_body_receipt_cid, symbol_receipt_cid, type_receipt_cid, layout_receipt_cid,
   semantic_generation, type_graph_generation,
   layout_generation }`；每个 tracked writer 的首字节必须消费同一 ticket。context 不再 active，source
   receipt/epoch、semantic body receipt、symbol receipt/scope/semantic generation、type receipt/graph generation、layout receipt/
   generation 任一变化都使 ticket 立即失效。lease 存续期间 detach 及任何 receipt/generation mutator 都必须
   hard-fail。每个 external-visibility 操作以及最终 atomic rename 前必须再次精确 join ticket+lease；失效只
   丢弃私有 temp，绝不 publish。首字节边界覆盖 write/pwrite、writable mmap、truncate>0、
   copy/clone/hardlink/rename 非空文件、object-cache restore 与外部 writer spawn；ticket 前只可建立 size=0
   的私有 temp，失败不得触碰既有 destination，全部成功后才用同文件系统 atomic rename 发布。
   验证失败时 tracked outputs 保持空，禁止把最终 report 之后的复验/删产物当生产拒绝。context、snapshot与
   五类receipt的生命周期必须提升到`cold_cmd_system_link_exec` artifact coordinator并覆盖object、executable、
   map、report、external writer及最终rename；`cold_compile_source_to_object`返回后不得提前detach/release。
   失败诊断只允许写 stderr 或 guard-owned diagnostic fd；最终 report 属于 tracked artifact，只能在同一
   prepublish ticket/lease 成功后写入私有 temp 并于 terminal join 后发布。早期
   `cold_write_system_link_exec_report(false, ...)` 不得写 report path，也不得以“失败报告”绕过零字节合同。
6. 每个 artifact 的 `source_identity_full_validation_count` 必须精确为 `4`：seal 前 builder live
   bytes+metadata/root 一次、canonical receipt 一次、terminal live readonly bytes/root 一次、terminal
   receipt/rows 一次；child adopt 与 declaration join 均
   不得增加。报告还必须写入
   `source_identity_o1_join_count`、`source_identity_child_adopt_count`、`source_bytes_hashed`、
   `source_materialized_view_count`（必须等于 source count）、`source_materialized_bytes`（必须等于 snapshot
   source bytes）、`source_materialized_bytes_after_seal`（必须为 0）、固定的
   `semantic_body_terminal_full_validation_count == 1`、`symbol_terminal_full_validation_count == 1`、
   `type_terminal_full_validation_count == 1`、
   `layout_terminal_full_validation_count == 1`、seal/prepublish epoch 与 receipt CID。terminal count 不能随
   declaration、child、type query 或 layout row 数增长。`source_bytes_hashed` 必须等于
   `5 * total_source_bytes`：capture 签发 content CID 一遍，四次 full validation各重哈一遍。分别记录
   `source_capture_hash_bytes == total_source_bytes` 与
   `source_full_validation_hash_bytes == 4 * total_source_bytes`。计数不是 authority，
   verifier 必须从 phase receipt 重算顺序和工作量。
7. 每个昂贵生产入口必须有 context-local one-shot work state，不能只信可写 counter：每个 source row 的
   materialization/import scan、每个 module skeleton、每个 exact edge projection、每个 semantic body extent，
   以及 root 唯一 TypeWorkspace 分别持有 `UNSEEN -> ACTIVE -> SEALED` 状态；executor 重复进入、跳过 ACTIVE
   或失败后把半成品标 SEALED 均 hard-fail。合法 lookup/join 与 executor 严格分离：
   `UNSEEN` 才能 claim executor；`ACTIVE` 同完整key只登记递归/backedge join；`SEALED` 同完整key只返回既有
   canonical row且不执行、不增work counter；不同key/identity复用任一状态直接拒绝。原始 mmap/pread、import scanner、module/body parser、
   edge projector 与 workspace allocator 只能从这些受控入口可达，结构门禁止任何直达旁路。terminal verifier
   全验 state bitset、row shape 与 receipt coverage，所有 work counter 只由成功状态迁移派生，调用者不得递增或
   覆写，因此重复工作不能靠不记账假绿。

## Declaration Origin

1. snapshot seal 时按 source row 构造 line-start CSR：`source_line_offset/count` 与排序的
   `line_start_byte_offset`。总 row 数恰为所有 source 的 LF 数加 source 数，溢出、非单调、越界、
   非零首行或最后行越过 source length 全拒绝。token offset 必须满足 `0 <= offset < source.len`；
   `offset == source.len` 是 EOF、不得伪装成 declaration origin，LF byte 归属它结束的前一行。
2. line lookup 在对应 CSR slice 内以 token byte offset 做 binary search；不得从 source byte 0 重扫。
   `symbols_declaration_origin_intern` 与 `cold_require_declaration_origin_projection` 必须共用该唯一查询；
   禁止任何一个 verifier 私自重新从 byte 0 数行。symbol closure 构建期的 canonical declaration rows 已按
   `(documentCID, tokenByteOffset, ...)` 排序，必须为每个 source 用单调 line cursor 一次批量投影行号；随机
   diagnostic lookup 才允许 binary search，不能把逐 declaration `O(log lines)` 冒充构建期严格线性工作。
3. `Symbols` 使用 Arena + SoA、`int32` child row 的 exact Patricia index，键固定为
   `(module_source_row, token_byte_offset)`，值为 `declaration_origin_row:int32`。Patricia 命中必须继续比较
   完整二元键；重复键只返回同一 row，重复不同 authority/path/line hard-fail。production authority lookup
   禁止 hash bucket/open-addressing 或线性 row scan；Patricia 路径只由 framed key bits决定，最坏工作量按
   查询 key 总字节线性计费。
4. Patricia node/capacity 不进入 semantic fingerprint；canonical declaration identity 仍由二元键、
   source snapshot root 与 authority kind决定。不得使用 path、文本、行号或指针作近似键。
5. parser/signature/type/global API 必须显式携带 `(source_seal_epoch, canonical_module_source_row, base_offset)`；
   entry/parser 只能在 seal/remap 后取得 canonical row。删除
   `cold_source_snapshot_origin_from_view` 的指针范围反查。source span 只是该 row 的只读 payload，不能
   用地址或 view ordinal恢复身份。

## Import Graph

1. seal 前 closure collector 对每个 source row 只扫描一次 import declarations，发布 SoA edge：parent
   source row、child source row、canonical alias、token byte offset，并按 parent 构造 CSR。路径只用于
   诊断与 snapshot row join，不作 identity。
2. portable edge key 固定为 `(parentDocumentCID, childDocumentCID, alias UTF-8 bytes, tokenByteOffset)`；
   edge 以该精确四元组去重，同 child 在不同 parent/alias 下仍是不同合法 edge。cycle 通过 canonical
   SCC 处理，每个 module declaration skeleton 只解析一次，每个 edge alias projection只物化一次。
   edge canonical comparator 就是 portable edge key；SCC id 取成员 document CID 有序列表的
   domain-separated CID，hash 相等时继续比较完整成员列表；condensation DAG 的 topological ready-set 以
   canonical dependency rank与完整成员 key打破平局。rank 以一次 Kahn/Tarjan O(V+E) 数据流计算，最终行对
   framed `(rank,SCC CID,full member list)` 做固定字节 radix；alias/member variable bytes也走 byte-radix，
   exact compare只处理相等/碰撞。禁止 heap/comparison sort 或不完整 qsort comparator。discovery、线程调度
   或 hash-table insertion 顺序不得进入行号。
3. types、functions、globals、consts 和 enum 必须按 `source_row` 消费同一 graph/edge identity；禁止
   `source_open(path)`、各自 direct-import rescan 或各自递归 visited 集合。任何 unresolved edge、重复
   不同 child、alias collision、const/type-alias cycle 或未绑定 reference edge 均在 symbol publication 前 hard-fail。

## Symbol Closure

1. import graph seal 后先生成 canonical module skeleton CID；在最终 symbol freeze 前必须完成后文唯一
   `ColdSemanticBodyReceipt`，随后生成唯一
   `SymbolClosureReceipt = H(source_receipt_cid, parser_schema, module_skeleton_cid,
   semantic_body_receipt_cid, canonical_declaration_rows, exact_edge_projections)`。每个 source skeleton 恰好 parse 一次，每个 exact
   edge alias projection 恰好物化一次；entry signatures 不得自扫两遍，transitive collector 不得再分别
   扫 types/signatures/globals。
2. 构建顺序固定为：全图 predeclare skeleton/name/exact origin → 按 canonical SCC 每条 reference edge
   恰好解析/绑定一次 const/type/enum/signature/global → canonicalize → 冻结 declaration rows。禁止迭代
   fixpoint；const/type-alias cycle直接拒绝。declaration/origin comparator 固定为
   framed `(documentCID, tokenByteOffset, declarationKind, portableEdgeKey, full canonical declaration payload)`
   做 byte-radix canonicalize，随后 remap 所有 declaration owner、
   binder、semantic field dependency 与 type-query source row。backedge 不能把未完成 SCC 标 done；同 exact edge
   重复消费、同 child 不同 parent/alias误合并均 hard-fail。
3. 删除 `ColdImportTypesOnce`、`ColdTypeScanStack` 等全局近似 visited/caches；禁止
   `cold_rescope_unresolved_object_field_types` 按 last component 猜 owner。object by-value/inheritance
   dependency 必须形成 exact declaration-row DAG，cycle 拒绝；SymbolClosure 只冻结 semantic field type/
   dependency，不计算或哈希 target size/alignment/offset。不得每批 direct import 后重跑全表 fixpoint。
4. module skeleton index 使用 Arena+SoA `int32` Patricia，key 固定为
   `(documentCID, contentCID, parser_schema)`；edge projection key 固定为
   `(symbol_scope_epoch, portableEdgeKey)`；scope epoch 只包在内存 cache key 外层，不进入 edge projection 的
   portable identity。Patricia 命中后比较完整 key；path、name+arity、指针、FNV64、hash bucket或线性 row scan
   均不能作为 authority。cache 只在当前 sealed source receipt/context 内有效；
   任何跨 compile 或持久 cache 都是不可信数据，必须重算完整 key、shape 与 CID，且不能恢复 validated capability。

## Semantic Body Closure

1. final `SymbolClosureReceipt` 与任何 portable TypeId 冻结前，必须从 canonical module skeleton 对每个函数 body
   的 exact source extent 恰好扫描一次，发布 target-neutral、Arena+SoA 的 `ColdSemanticBodyReceipt`。receipt
   绑定 source receipt CID、该 SourceReceipt 内唯一 `canonical_import_edge_csr_cid`、parser/body schema、module skeleton CID、canonical body fact rows、
   exact semantic dependency edges，以及全部生成 declaration/type-query key；不得绑定 target ABI、slot size、
   field offset、pointer、epoch 或 layout row。
2. body fact 必须足以无源码重读地回放语义 lowering：canonical expression/operator rows、declaration/binder 的
   portable framed full key与CID（绝不保存pre-freeze mutable symbol row）、generic argument frames、closure capture identities、specialization keys、managed helper/runtime
   dependency intents、initializer semantic expressions、`borrows_args`、result ownership、borrow-result root proof与
   control-flow skeleton。
   specialization key 至少绑定 template declaration CID 与 ordered raw type-query keys；closure key绑定 exact
   source origin/extent、capture identities与signature queries，禁止 `__anon_N`/discovery ordinal。构建使用 exact-key Patricia worklist；
   每个新 specialization/closure/helper/runtime dependency key 只允许 `UNSEEN -> ACTIVE -> SEALED` 一次，递归
   backedge join 同一 ACTIVE key；diamond/multi-caller 对同一 SEALED full key只返回既有row、不得重跑executor，
   异 identity 冲突或无法闭合的 cycle hard-fail。worklist 清空是有限依赖图遍历，
   不得用重复全表 fixpoint、name+arity、last component 或 target layout 猜测补齐。
3. body pass 发现的 Function/Object/helper declaration、semantic edge与 raw type query 必须以portable full key/CID
   在最终 SymbolClosure canonicalize 前全部 predeclare 并进入其 receipt；final SymbolClosure 冻结并remap后，构造
   local-only SoA projection `body_fact_row -> canonical declaration/binder row`，逐row同时对拍 SemanticBodyReceipt
   portable key/CID与SymbolClosure canonical row。projection不进入portable CID，不得反写已冻结body receipt；错行、
   漏行、多行或任一key/CID不等均拒绝。随后只由 root TypeWorkspace 解析唯一 Type rows。
   TypeReceipt/TargetLayoutReceipt 签发后，BodyIR builder 只能消费冻结的 body fact + 已验证projection + canonical
   TypeRow/LayoutRow；禁止重读 source、再次 parser body、调用任何 `symbols_add_*`、新建 specialization/closure/
   helper，或发起 receipt 中不存在的 type query。Windows/Linux/A64/WASM 等 target runtime function rows、link name、
   external binding与ABI helper projection只能由 TargetLayout/Artifact phase从 target-neutral dependency intent 派生，
   不得进入 SemanticBody/Symbol portable identity。任一 late discovery 在首个 BodyIR row 前 hard-fail。
4. canonical body row 顺序由 framed `(owner declaration CID, source extent, semantic kind, full payload)` 做固定
   byte-radix并 remap全部 child/edge row；相同完整 identity折叠，不同 preimage 同 CID hard-fail。正文扫描、
   dependency edge与生成 key 的实际 work 由 one-shot state 证明，不能只上报计数。

## Type Identity Workspace

1. child Symbols 在 mutable symbol-closure 阶段只发布带各自 `symbol_scope_epoch` 的 module skeleton、exact
   edge projection 与 semantic body facts，不得发布 final portable TypeId 或 layout。`ColdSemanticBodyReceipt`与
   `SymbolClosureReceipt` 冻结后，只由 root
   Symbols 建立唯一、generation-stamped `ColdTypeIdentityWorkspace`，canonical declaration owner、formal TypeId
   与 semantic field owner 各发布一次；它不计算或 refine target layout。`symbols_new_type_scan` 不得各自
   calloc/build/free 全图。若构建期
   共享 interner，key 必须包含 child scope epoch 隔离作用域，最终 receipt 只能采纳 root canonical rows。
2. type query 的完整 key 固定为 `(symbol_scope_epoch, semantic_generation, source_seal_epoch, raw_type_cid,
   binder_kind, binder_owner_cid, ordered_generic_name_frames, type_schema)`；type node intern 使用 Arena+SoA
   `int32` Patricia 将该 framed canonical key映射到 row，命中后比较完整 identity。禁止 authority hash bucket、
   open addressing、对 `type_count` 线性扫描或按 declaration 再递归 import persistent row。
3. workspace 冻结后发布 `ColdTypeIdentityReceipt`，其 CID 绑定 `SymbolClosureReceipt`、type schema 与
   canonical TypeNode/child/CID rows。先对依赖 DAG 以 O(V+E) 计算每个 node 的 deterministic dependency rank，
   再对 framed `(rank,TypeNode CID,full canonical identity)` 做固定字节 radix，禁止 heap/comparison sort。
   CID 相同且完整 canonical identity相同必须折叠为唯一 row；CID 相同但 identity不同是 hash collision并
   hard-fail。随后 remap child rows、formal rows与 canonical object rows。cycle 或任一漏 remap都 hard-fail。
   后续 formal/type owner
   查询只读 receipt；任何新增
   node、edge 或 CID 都禁止原地修改。语义 declaration/edge/field/layout-input 变化先推进
   `semantic_generation` 并重建 SymbolClosure；只增加/改变派生 TypeNode 时推进 `type_graph_generation` 并
   签发新 TypeIdentityReceipt，两种旧 receipt 都立即不可用。
4. owner CID cache 的唯一键为
   `(symbol_scope_epoch, source_seal_epoch, exact_object_row, semantic_generation)`；不得使用 `Symbols*`、
   `ObjectDef*`、name、path 或 allocator 地址。任一 generation/epoch 漂移必须 miss 后从 workspace 重算，
   不能返回旧 CID。
5. target ABI/layout 与 target-only runtime binding 使用独立
   `TargetLayoutReceipt = H(type_identity_receipt_cid, semantic_body_receipt_cid, target_abi_receipt,
   canonical size/align/offset rows, canonical target function/global/runtime projection rows)`；
   它在 type receipt 冻结后对 semantic dependency DAG 做恰好一次 topological layout，使用独立非零
   `layout_generation`。依赖 rank只决定计算就绪性，receipt row/storage 顺序必须直接沿 frozen TypeReceipt 的
   canonical object row顺序线性写入并 remap所有 layout引用，不得再次 comparison-sort。target size/alignment/
   offset 不得进入 portable semantic Type CID，也不得反向修改
   frozen type/body/symbol receipt；artifact ticket 必须绑定并 terminal full-validate该 layout receipt。
   为满足这一顺序，source/SymbolClosure阶段解析module/declaration skeleton、signature、semantic field type、
   type dependency与完整 target-neutral SemanticBodyReceipt，不得提前发射函数BodyIR。root TypeReceipt冻结、
   TargetLayoutReceipt签发后，函数body lowering只回放冻结body facts并消费
   `(canonical TypeRow, target LayoutRow)`生成slot size/align/field offset；
   `cold_parser_slot_size_from_type*`必须改成只读layout receipt lookup。现行`ObjectDef.slot_size`、
   `ObjectField.kind/offset/size/array_len`、`ObjectDef.slot_size`、
   `TypeDef.max_slot_size/max_field_count`、`Variant.field_kind/field_offset/field_size`、
   `FnDef.param_kind/param_size[]`、`BodyIR.return_size/slot_size/slot_aux`、
   `GlobalDef.kind/size/init_data`、synthetic helper/runtime param kind/size、sequence element kind/size与任何由ABI决定的
   initializer bytes不能再由layout反写semantic Symbols；它们必须迁入Layout/derived artifact SoA，SymbolClosure
   fingerprint只绑定raw semantic types、initializer semantic expression与helper semantic key，不得绑定这些target值。
   target-only `FnDef.name/link_name/is_external/arity/ret` 或新增 runtime rows也必须改为 artifact projection，不能
   冻结后回写 semantic Symbols。
   遗漏任一body入口、继续在Type freeze前依赖target layout，
   或layout后写回Symbols都hard-fail。
6. `semantic_generation` 与 `type_graph_generation` 必须分离：type node intern 只能推进 graph generation，
   不能推进作为 query cache key 的 semantic generation而让当前 session 自废缓存。persistent graph writer
   必须逐 row 重算/全验 CID 后线性 clone 或直接只读 receipt，禁止对每 source row递归 import。
7. 本提案所有 `H(...)`/receipt CID 都使用独立 domain tag、字段 count、逐字段 length-prefix 与规范大端整数的
   SHA-256；禁止裸拼接、宿主字节序、padding、pointer 或 raw struct bytes。全域统一 collision invariant：
   同一 domain CID与完全相同 framed preimage必须折叠为唯一 identity；同一 CID但 framed preimage不同必须
   hard-fail，source/SCC/symbol/type/layout/proof无例外。索引命中后仍逐字段全量比较。

## 失效矩阵

- source receipt：任一 source byte、canonical module path、content/document/root CID、package、count、portable
  edge/alias、import resolver输入或 seal epoch 改变，整份 receipt capability失效；diagnostic/absolute path变化
  只使 local locator失效，不改变 portable CID。
- line/origin index：source epoch、source row 或 row bytes 任一改变即失效；旧 Parser triple 不得跨 epoch使用。
- import graph：source epoch、resolver receipt、edge 四元组或 import parser schema 改变即失效。
- symbol closure：source/import receipt、parser schema、canonical declaration row、semantic field dependency 或
  edge projection任一改变即失效；frozen 后任何 declaration/semantic field改动直接拒绝。
- semantic body：source/import/module skeleton/body schema、任一 body extent/fact/dependency、specialization、
  closure capture、helper/runtime dependency或raw type-query key改变即失效；freeze 后 late discovery、源码重读、
  body reparse或新增 symbol/type query直接拒绝。
- child adopt：compilation context、active receipt pointer、source epoch、symbol scope epoch 或 Arena 任一非法/
  不同直接拒绝；attach 失败不得残留 pointer。
- type workspace/cache：任一 symbol mutator先推进 semantic generation并清空 query cache；binder owner、source
  epoch、type parser schema 任一改变即 miss。TypeIdentityReceipt 冻结后任何 Types/Objects/Functions/
  Consts/Globals/origins/type rows mutation立即拒绝；target ABI/layout变化只失效 TargetLayoutReceipt。
- target layout：type receipt CID、target ABI receipt、canonical size/align/offset row 或 layout generation 任一
  改变即失效；不得反向失效或改写 portable Type CID。
- snapshot detach：所有 root/child join、Parser lookup 与 receipt adopt 立即失效；即使虚址随后被新 compile
  复用，也不得凭 pointer 命中旧 authority。
- compilation context：receipt、Parser、child、workspace、ticket 任一跨 context 使用立即拒绝；第二 compile
  不得覆盖第一 compile 的 active state，single-owner 实现必须在 begin 处拒绝并发。

## 实施原子与依赖顺序

生产迁移只能按以下 merge-safe 边界推进；编号表示依赖，不表示可以让半成品上线：

1. 显式 `ColdCompilationContext`、非零 source/scope epoch、worker lease与single-owner排他入口先落；该步只完成
   context基础设施，legacy global locator仍在，item 0尚未完成且`performance_credit=0`。
2. 一次source materialization、line CSR、import edge SoA/CSR、完整source-key radix/remap与最终
   `ColdSourceIdentityReceipt`组成一个不可拆seal事务。只发bytes receipt再补line/import属于不完整authority。
3. 同时引入`ColdOwnedSource`/`ColdSourceBorrow`静态所有权分流、Parser triple传播，删除views/pointer containment与
   全部Cheng consumer munmap。2和3可以分开review，但在两者同时完成前不得合入生产入口。
4. root/child Symbols改为receipt pointer+epoch/scope的O(1) adopt，删除五套source arrays copy/full validate；这是
   第一处直接消除当前9–17分钟热点的收益。合法最快review batch是2+3+4，不能单改open_view或先adopt未完成receipt。
5. declaration origin改line CSR单调投影+Patricia exact index，删除byte0重数行与pointer-origin反查。
6. import CSR成为唯一authority后，一次删除legacy per-kind rescan/visited/fixpoint，发布parse-once
   module skeleton，完成一次 target-neutral SemanticBodyClosure，再冻结`SymbolClosureReceipt`；CSR adapter、legacy
   scanner或 body reparse 任一并存期间不得计完成。
7. root唯一TypeWorkspace/TypeReceipt、独立TargetLayoutReceipt及“module skeleton→SemanticBodyReceipt→
   SymbolClosureReceipt→Type→Layout→body fact replay/BodyIR”阶段切换同批完成；layout不得反写Symbols，
   BodyIR不得在LayoutReceipt前发射或在其后发现新语义事实。
8. prepublish lease/ticket最后接入全部sink；context owner提升到system-link artifact coordinator，cache restore、
   object/executable/map/report、external writer与最终rename无一可绕过。

不能把7或8提前当性能入口；当前最大wall-time杠杆是2+3+4，随后才是5+6与Type/Layout。

## Files / Action / Verify / Done

| files | action | verify | done |
| --- | --- | --- | --- |
| `bootstrap/cheng_cold.c`、`cold_types.h`、`cold_parser.[ch]` | context/scope/worker Arena+SoA registry、compile-owner outer recovery frame、worker error/partial-create drain、两个compile入口唯一cleanup、Parser/child exact join | 第二begin、begin到snapshot locator间失败、跨context/epoch、零/复用epoch、worker error/partial create/join、任一退出遗留claim、combined/split字段顺序mutation全拒绝 | 只完成context基础设施；legacy locator仍在且性能信用为0 |
| `bootstrap/cheng_cold.c`、split snapshot/type headers | immutable receipt、source/scope epoch、root/child O(1) adopt、prepublish full verify | seal 后 mutation、epoch/root/count/package/context drift 全拒绝 | declaration 与 child 热路径零 SHA/排序/copy/row scan |
| snapshot lifecycle 与 fingerprint contracts | read-only slab、line-start CSR、exact import parser/resolver receipt、numeric sub-borrow/ParserView issuer、grow/release、terminal receipt | 空/单行/末尾 LF、group完整展开、非法/未解析import、stack Span、最大 offset、origin map overflow、post-seal copy/munmap mutations | 行号/import精确且 source bytes 只捕获一次，Parser零pointer containment |
| declaration origin intern/index | exact pair SoA index、collision-safe lookup | collision、错 row、删 key、path/line 近似键 mutations | 同 pair 唯一 row，不同 pair 不合并 |
| import collector | canonical edge/SCC | cycle、diamond、alias、重复 edge、删 edge、新模块 mutations | 1357 edge 各扫描/消费一次 |
| symbol closure | predeclare→单次 SCC edge bind→freeze、parse-once skeleton/exact edge projection、semantic dependency DAG | entry双扫、各族独立 rescan、last-component owner猜测、fixpoint全表重扫 mutations | 每 source skeleton一次、每 exact projection一次 |
| semantic body closure | 每个 exact body extent 一次 target-neutral parse、exact dependency/monomorphization worklist、冻结 body facts | late specialization/closure/helper/type query、body reparse、source extent漂移 mutations | Layout后只回放 body facts，零源码重读/新增symbol |
| type identity graph/cache | symbol freeze 后 root 唯一 workspace、CID index、generation-stamped receipt/cache key | child graph 重建、线性 intern、pointer reuse、epoch/generation drift mutations | type/formal/object identity 各发布一次 |
| target layout | TypeReceipt 后独立 ABI layout receipt、单次 topo | ABI 漂移不改 Type CID、layout generation/ticket mutation | 每 target layout row恰好一次 |
| 新 performance contract 与 full PURE gate | one-shot work states、O0/O2 诊断、固定派生 counters、最终字节/诊断对拍 | 重复 work 不记账、绕过受控入口、2x source/edge/body/type、早期失败report mutations | 性能结论不依赖墙钟阈值 |

固定新增门名：

```text
tools/cold_source_identity_linear_validation_gate.sh
tools/cold_source_identity_linear_validation_gate_contract_test
tools/cold_import_graph_single_scan_gate.sh
tools/cold_import_graph_single_scan_gate_contract_test
```

现存 direct-C gate 不能在 context/typed-borrow 切换后靠测试专用旧入口继续构造
`ColdActiveSourceSnapshots`、裸 `ColdSourceSnapshotTable`、`cold_source_snapshot_*` 或
`symbols_new_type_scan`。以下14个嵌入 `bootstrap/cheng_cold.c` 的 C harness、15个调用wrapper及一个独立静态门
必须在首个生产 batch 同步迁移到真实 `ColdCompilationContext`、owner-only source borrow/ParserView
issuer；结构门必须扫描 `tools/*.c`，任一旧 global/API 或测试专用 backdoor 残留即 RED：

```text
tools/cold_body_op_schema_differential_gate.c
tools/cold_body_op_schema_differential_gate.sh
tools/cold_call_var_out_definition_gate.c
tools/cold_call_var_out_definition_gate.sh
tools/cold_exact_borrowed_phi_lift_gate.c
tools/cold_exact_sequence_literal_boundaries_gate.c
tools/cold_exact_sequence_literal_boundaries_gate.sh
tools/cold_external_borrows_effect_authority_gate.c
tools/cold_external_borrows_effect_authority_gate.sh
tools/cold_generic_seq_cleanup_exact_identity_gate.c
tools/cold_generic_seq_cleanup_exact_identity_gate.sh
tools/cold_generic_specialized_layout_rebind_gate.c
tools/cold_generic_specialized_layout_rebind_gate.sh
tools/cold_loop_local_plain_scope_identity_gate.c
tools/cold_frozen_param_identity_gate.sh
tools/cold_loop_local_plain_scope_identity_gate.sh
tools/cold_qualified_generic_typegraph_gate.sh
tools/cold_loop_projection_call_arg_origin_gate.c
tools/cold_loop_projection_call_arg_origin_gate.sh
tools/cold_managed_field_sequence_literal_gate.c
tools/cold_managed_field_sequence_literal_gate.sh
tools/cold_managed_replace_identity_gate.c
tools/cold_managed_replace_identity_gate.sh
tools/cold_managed_var_forward_identity_gate.c
tools/cold_managed_var_forward_identity_gate.sh
tools/cold_object_declaration_provenance_gate.c
tools/cold_object_declaration_provenance_gate.sh
tools/cold_rv64_str_call_abi_gate.c
tools/cold_rv64_str_call_abi_gate.sh
tools/final_schema_result_ownership_gate.sh
```

这些 wrapper 只能作为局部 C/API 回归，不产生 source-seal、O(1) adopt、full PURE 或性能动态信用；
同一个 C harness 被多个 wrapper 消费时必须只迁移唯一 fixture builder，禁止在 wrapper 内各自伪造
context/receipt。`final_schema_result_ownership_gate.sh` 当前直接抽取
`symbols_source_identity_validate`、`cold_source_identity_metadata_validate`与
`symbols_source_identity_origin_join`，并硬钉Symbols内五套source arrays/CID validator；它必须改为验证
immutable source receipt + exact context/scope/epoch + declaration origin row join，且对旧function/array名做
zero-occurrence退役断言，不能保留旧validator作为测试oracle。
全量嵌入 `cheng_cold.c` 且调用 `symbols_new*` 的受影响闭包固定为上述14个 C harness、15个harness wrapper；
`final_schema_result_ownership_gate.sh` 是额外的旧source-array静态门，不计入15个wrapper；
`cold_body_op_schema_differential_gate.c`、`cold_exact_borrowed_phi_lift_gate.c`、
`cold_loop_projection_call_arg_origin_gate.c`与`cold_managed_replace_identity_gate.c`当前还直接构造零值Parser，
必须改由同context/scope/epoch的唯一ParserView issuer签发，不能用测试代码手填新字段伪造合法view。

最终 verify/publish 面还必须显式同步或保持非回归：

```text
src/core/tooling/system_link_exec_pure_main.cheng
tools/system_link_exec_pure_current_source_producer.sh
tools/system_link_exec_pure_current_source_producer_contract_test
tools/build_current_source_compiler_main_candidate.sh
tools/build_current_source_compiler_main_candidate_contract_test.sh
tools/cold_body_op_schema_differential_gate.sh
tools/system_link_exec_pure_production_lane_engine
tools/system_link_exec_pure_production_lane_engine_contract_test
tools/system_link_exec_pure_cross_platform_compositor
tools/system_link_exec_pure_cross_platform_compositor_contract_test
tools/system_link_exec_pure_darwin_authority_publisher
tools/system_link_exec_pure_darwin_authority_publisher_contract_test
tools/system_link_exec_pure_production_gate
tools/system_link_exec_pure_production_gate_contract_test
```

- `system_link_exec_pure_main.cheng` 是full PURE的真实coordinator/sink，必须持有context owner并在任何
  object/executable/map/report首字节及最终rename前消费、复验prepublish ticket。
- `system_link_exec_pure_current_source_producer.sh`及contract是已知不可达的历史诊断回归面，不在本提案
  apply修改集，也不产生source-seal、full PURE或发布完成信用；本提案只要求任何把它接到正式发布路径的
  调用或门禁固定RED，不得把旧single-lane producer改造成或宣称为正式publisher。
- 正式发布验收依赖独立cross-platform production authority提案提供的production lane engine、
  cross-platform compositor、Darwin authority publisher、三组contract及production gate/contract；这些文件
  不由本提案创建。本提案完成后仍须由该链对拍source/body/symbol/type/layout receipts、固定work counters、
  零失败report与ticket/lease；缺Linux exact-1GiB或Darwin行为lane任一回执都不得发布。
- `build_current_source_compiler_main_candidate.sh`及contract当前只生成Darwin candidate且自身报告
  `release_status=pending_nested_toolchain_and_publisher`、publisher receipt missing；它只能用于诊断/候选编译，
  不得作为正式单lane publisher或full PURE完成证据。
- `cold_body_op_schema_differential_gate.sh`继续证明BodyOp/BodyIR/Local split-amalgamated不回归，但当前并不比较
  `ColdCompilationContext`、`ColdOwnedSource`、`ColdSourceBorrow`、`ColdParserView`与Parser context/epoch字段；
  新source identity gate必须补这些exact layout/issuer/consumer mutations，不能拿现有BodyOp PASS冒充context ABI绿。

## 必杀 Mutation

1. seal 后新增/替换 source byte、path、content/document/root CID、alias、CSR 或 import edge。
2. receipt 未完成即发布 pointer/epoch，删 snapshot/receipt 任一 full verify，或失败 recovery 后复用旧 epoch。
3. declaration/child 热路径恢复 metadata/root CID 重算、复制整张 source table，或仅比较 caller 提供的
   validated 布尔值。
4. prepublish full verify 移到 artifact 写出后，删 prepublish verify，或经 header、writable mmap、truncate、
   hardlink/rename、cache restore、外部 writer 任一路径留下非空输出。
5. line-start CSR 删首行、交换 offset、错 source slice、token 恰在 LF/EOF 边界时偏一。
6. origin hash collision first-match、只按 source row/offset/path/line 的任一子集去重。
7. diamond import 重复扫描、同 child 不同 alias误合并、cycle 跳过未完成声明、edge 删除或新增模块
   未进入 closure。
8. O2 compiler 与 O0 reference 对同一冻结源码的成功原始 artifact/map/report semantic fields 不一致，
   或负例诊断/零产物合同不同。
9. seal 后任一 consumer重新 mmap/copy/mprotect/munmap source；以 Span 指针反查 source row；view registry
   保留已释放地址；child 释放共享 receipt/slab。
10. 每模块重建 type graph、type intern 恢复线性扫描、persistent writer 逐 row 递归 import；cache key
    改回 `Symbols*`/`ObjectDef*`，或 owner/source/type generation 任一漂移仍命中旧 CID。
11. 同一 snapshot 建 178 个 child、各 intern 一个 origin，full validation count 必须仍为 4、child adopt
    必须为 178；恢复 full attach/copy 立即由 validation/copy work counter拒绝。
12. 同一 source row 借用 N 次，materialized view count 与 materialized bytes 仍只等于 snapshot source 数/总字节；
    恢复每次 open_view 即拒绝。child 采用上次 compile receipt、同 root 新 epoch、不同 Arena、detach 后
    虚址复用、Parser triple 删 epoch/row，均必须 hard-fail。
13. entry signature 恢复双扫、types/functions/globals/consts/enums 任一恢复独立 source scan/visited、
    diamond edge误合并/重复消费、SCC backedge提前 done、删/加 edge不改变 SymbolClosureReceipt，均拒绝。
14. skeleton key 删除 content CID/parser schema，edge key删除 parent/child/alias/token任一字段，type key删除
    binder owner/generic order/source epoch/semantic generation/type schema任一字段，强制 hash bucket collision
    后 first-match，均必须由全键对拍 mutation 杀死。
15. 使用 raw struct/FNV fingerprint作 receipt、恢复 last-component owner猜测、每 direct import 后全表 layout
    fixpoint、type intern线性扫、每 query分配 type_count workspace、persistent type graph递归 import，必须由
    work counter或语义 mutation拒绝。
16. 打乱 closure discovery 顺序后若 source/origin/import rows、CSGC 或 receipt bytes变化即拒绝；删除
    document-CID canonical remap、漏 remap alias/edge/parser row均必须由对拍 mutation杀死。删 prepublish
    ticket、writer不消费 ticket、签发后推进 semantic generation、把 terminal verify放到首写后再 unlink，
    均必须留下零 tracked byte并由顺序门拒绝。
17. root/child 复用相同 symbol scope epoch、child 在 SymbolClosure freeze 前发布 final TypeId、type key 删除
    scope epoch/type schema、SCC/declaration/TypeNode ready-set 改用 discovery 或 hash insertion 顺序，均必须由
    打乱调度后的 receipt/CSGC 字节对拍杀死。
18. 两个 `ColdCompilationContext` 并发 begin 后若 active snapshot、Parser、receipt、cache 或 prepublish ticket
    串用即拒绝；恢复进程全局 active pointer、跨 context adopt，或 single-owner 实现默许第二 begin，必须在
    首个 artifact byte 前 hard-fail。
19. 把 diagnostic path、context/epoch、hash bucket/counter混入任一 portable CID，或 declaration portable key
    误用含 scope epoch 的 cache key；跨目录/跨进程同源码对拍必须逐字节不变。
20. target ABI size/offset混入 Type CID、SymbolClosure 重做 layout、Type workspace refine layout、layout receipt
    未进 ticket/terminal verify，或任一 layout generation漂移后仍写首字节，均拒绝。
21. SCC fill恢复迭代 fixpoint、单 edge重复 bind、const/type-alias cycle收敛、每 edge复制整模块 projection、
    terminal/hash pass 次数随 declaration/type query增长，均由精确工作 counter拒绝。
22. ticket首写后 detach/推进 generation、external visibility或最终 rename 不复验 lease、失效 temp仍 publish；
    semantic/type/layout generation混入 portable CID；相同 TypeNode不折叠或不同 identity的 CID collision被合并，
    均由字节对拍和零发布 mutation拒绝。
23. 最后一次 terminal validate read 后、ticket commit 前用 barrier推进 generation；必须因 lease禁止 mutator或
    ticket join失败而保持零 byte。source/declaration/layout shuffled insertion 必须得到逐字节相同 rows/receipt。
24. 对 source/SCC/symbol/type/layout 任一 domain 强制相同 digest、不同 framed preimage必须 hard-fail；把
    origin/skeleton/type Patricia恢复 hash/open-addressing并强制所有 key同 bucket，或恢复线性 row scan，必须由
    key-byte/probe work上界与结构门拒绝。
25. source row remap 后不按 portable edge full key radix、保留 discovery edge ordinal/重复 edge、未按 canonical
    parent重建CSR，或 SourceReceipt漏绑 resolver receipt CID/import parser schema；打乱发现顺序、仅改变resolver/
    schema时必须分别逐字节同值或失效重建，不能复用旧 capability。group import只消费首member、返回栈上拼接
    `Span`、非法import静默当普通行、用`stat`/搜索路径顺序猜resolver结果、或漏掉任一member alias/token offset都拒绝。
26. caller聚合伪造/覆写`ColdSourceBorrow`、绕过opaque owner row、consume不join active registry、错 ptr/base/len、
    整数溢出、跨 row、跨context存储worker lease、detach 前仍有 worker lease，或把 decoded arena payload冒充
    canonical borrow；`ColdParserView`删owner/map、origin map非单调/越界/跨row/未完整覆盖时必须拒绝。恢复
    `parser_child(owner, Span)`/pointer containment、payload生成后才猜origin map、semantic Parser零context/epoch、
    positional initializer静默漏authority，或用`ColdLexicalCursor`进入declaration/body publication均由结构/动态门拒绝。
27. Type/Symbol freeze 后 body parser 新增 specialization、closure、managed helper/runtime dependency或type query，
    Layout后重读源码/reparse body/调用 `symbols_add_*`，或同一 body extent 第二次进入 parser，必须在首个BodyIR row
    前拒绝。body receipt保存pre-freeze symbol row、漏建/错建portable-key到canonical-row projection，或打乱
    monomorphization发现顺序后 SemanticBody/Symbol/Type receipt bytes变化均拒绝。
28. `FnDef.param_kind/param_size`、`BodyIR.return_size/slot_size/slot_aux`、`Variant.field_kind/field_size/offset`、
    `GlobalDef.kind/size/init_data`、Object/Type layout字段、helper element kind/size、target-only Fn/link row或initializer bytes
    任一残留semantic Symbols/fingerprint，layout后反写它们，或target ABI变化导致Symbol/Type CID变化，均拒绝；
    同semantic input不同ABI只能改变TargetLayout/derived artifact receipt。
29. 重复executor materialize/import scan/skeleton/body parse/edge projection/workspace build但不递增counter，手改counter
    假装一次、跳过one-shot ACTIVE、SEALED后再次执行，或绕过受控mmap/scanner/parser/allocator入口，必须由
    state/coverage/结构门拒绝；diamond/multi-caller 对同一 SEALED full key 的lookup必须返回同row且零新增work。
30. 任一 prepublish 失败仍调用 `cold_write_system_link_exec_report(false, ...)` 写 report path，或把失败report标成
    非tracked semantic output绕过ticket；destination及所有tracked report/object/map/executable必须保持零byte/原值。
31. context基础原子必须独立拒绝：第二个begin覆盖active owner；跨context snapshot/Symbols/Parser/worker adopt；
    source/scope epoch为0、复用、溢出或root/child相同；BUILDING/LIVE_PRESEAL/SOURCE_BOUND失败无合法ABORTED清理、
    ABORTED仍发布epoch或遗留builder/scope storage；Parser删除或漂移
    context/scope/epoch；context begin到snapshot locator发布间die、内层关闭普通recovery后绕过owner frame、longjmp后
    读取未定义自动值、worker跨线程longjmp、EXITED仍为NONE或result二次写、worker错误不发布ERROR/stop、
    stop/result用非原子或错memory order、覆盖first failure、worker错误或观察stop后仍继续取任务、把first-CAS竞态顺序
    混入portable failure/receipt/CID/CSGC/facts/proof、部分create后漏join、RUNNING直接cancel/release、
    worker未reserve、错scope、提前context end、漏join或双join；任一正常/错误/unwind出口遗留
    owner claim；把local context/path/epoch/counter混入portable root/CID。两个顺序context编译同源码必须得到相同
    portable root、object与map bytes；恢复未绑定`symbols_new`生产入口或依赖结构体零初始化必须由结构门拒绝。
    该组绿仍固定`performance_credit=0`，不得冒充source seal/adopt已优化。

## 两级探针

- 每个所有权修复批次只运行直接导入被改模块并真实调用目标 API 的正/负小 fixture；它证明局部语言
  合同，不产生 full PURE production credit。
- batch 收口后才运行一次 `system_link_exec_pure_main.cheng` 全 `178` 文件闭包；正式结论仍要求
  current-source O2 compiler、冻结 source/import closure、精确 1 GiB guard 与完整产物/报告。
- `emit:obj`、dry-compile、小 fixture 或 O0 超时均不得替代最终 full gate。

固定 work counters 至少包括：

```text
source_materialized_bytes == total_source_bytes
source_capture_hash_bytes == total_source_bytes
source_full_validation_hash_bytes == 4 * total_source_bytes
source_bytes_hashed == 5 * total_source_bytes
readonly_source_materialization_count == source_count
source_radix_input_bytes == total_framed_source_key_bytes
source_radix_output_rows == source_count
import_source_scan_count == source_count
import_edge_parse_count == edge_count
import_edge_radix_input_bytes == total_framed_portable_edge_key_bytes
import_edge_radix_output_rows == unique_portable_edge_count
import_parent_csr_rebuild_row_count == source_count + unique_portable_edge_count
module_skeleton_parse_count == source_count
semantic_body_extent_parse_count == canonical_body_extent_count
semantic_body_dependency_edge_visit_count == canonical_body_dependency_edge_count
semantic_body_generated_key_seal_count == unique_generated_semantic_key_count
semantic_body_symbol_projection_row_count == canonical_body_symbol_reference_count
semantic_body_symbol_projection_mismatch_count == 0
edge_projection_count == unique_exact_edge_projection_count
symbol_projection_row_count == canonical_projected_output_row_count
declaration_radix_input_bytes == total_framed_declaration_key_bytes
declaration_radix_output_rows == canonical_declaration_row_count
origin_patricia_key_bit_tests <= 8 * total_origin_lookup_key_bytes + origin_lookup_count
skeleton_patricia_key_bit_tests <= 8 * total_skeleton_lookup_key_bytes + skeleton_lookup_count
source_identity_full_validation_count == 4
semantic_body_terminal_full_validation_count == 1
symbol_terminal_full_validation_count == 1
type_terminal_full_validation_count == 1
layout_terminal_full_validation_count == 1
symbol_terminal_row_validate_count == canonical_symbol_row_count
symbol_terminal_dependency_edge_validate_count == canonical_symbol_dependency_edge_count
type_terminal_row_validate_count == canonical_type_node_count
type_terminal_dependency_edge_validate_count == canonical_type_dependency_edge_count
layout_terminal_row_validate_count == canonical_layout_row_count
layout_terminal_dependency_edge_validate_count == canonical_layout_dependency_edge_count
type_build_workspace_alloc_count == 1
type_node_cid_build_compute_count == unique_type_node_count
type_node_cid_terminal_compute_count == unique_type_node_count
type_query_miss_count == unique_exact_type_query_key_count
type_patricia_key_bit_tests <= 8 * total_type_query_key_bytes + type_query_count
layout_output_rows == canonical_layout_row_count
layout_row_order_mismatch_count == 0
source_materialization_one_shot_sealed_count == source_count
import_scan_one_shot_sealed_count == source_count
module_skeleton_one_shot_sealed_count == source_count
semantic_body_one_shot_sealed_count == canonical_body_extent_count
edge_projection_one_shot_sealed_count == unique_exact_edge_projection_count
type_workspace_one_shot_sealed_count == 1
one_shot_reentry_count == 0
one_shot_bypass_entry_count == 0
one_shot_sealed_lookup_count == exact_reused_sealed_key_lookup_count
tracked_failure_report_bytes == 0
```

确认后按“compilation context → 完整source seal（一次mapping+line CSR+import edge CSR+radix/remap+receipt）与typed
borrow/ParserView迁移 → root/child O(1) adopt → origin index → import/module skeleton唯一authority →
SemanticBodyReceipt/SymbolClosureReceipt → root TypeReceipt → TargetLayoutReceipt → body fact回放/BodyIR →
全sink prepublish lease → O2/current-source对拍 → full PURE”顺序apply；
其中source seal、typed borrow、child adopt应作为首个性能review batch。任何阶段如果零产物/拒绝边界弱于现行实现，
立即hard-fail，不保留fallback路径。
