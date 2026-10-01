# Regalloc 生产门禁

`tools/regalloc_production_gate.sh` 只在证据可由原始文件现场重算时放行。源码关键词、`status=proved`、汇总计数和未绑定到机器码的 Ack 都不是生产证据。

它是 regalloc 分门，不是最终发布终点。最终 `RELEASE_GREEN` 还必须由 `tools/backend2_current_source_release_evidence` 验证唯一 current binding：同一 source snapshot 贯穿七阶段和全部 primary/backend2 target leg，七阶段执行身份逐列一致，双后端 receipt 独立，GEN2/GEN3 不同 inode 且原始字节相等。任何一项缺失时只允许 `HARD_RED`。

## 运行

静态审计：

```bash
tools/regalloc_production_gate.sh --static-only
```

静态模式固定 `production_status=RED`，因为没有运行 receipt、object、ABI 和性能证据。

门禁自身的快速对抗自测：

```bash
tools/regalloc_production_gate.sh --self-test
```

自测同时调用 evidence 自测，验证 gate/evidence 共用的只读 external-lock validator；还覆盖真机字段拒绝、compile/perf 交错样本重算与乱序拒绝、expected compiler hash、无 `HOME` 的 `set -u`、动态 SP 寻址、多宽度 spill 计数、必需状态全集，以及私有执行 bundle 的实际 SELF、缺参、错 SHA、非规范路径、symlink、同 inode 和执行后替换拒绝，不执行 Cheng full compile。

Fusion/release 从调用方持有的私有 bundle 执行时，六项绑定参数必须完整成组：

```bash
/absolute/private-bundle/regalloc_production_gate.sh \
  --source-root:/absolute/cheng-tree \
  --exec-bundle:/absolute/private-bundle \
  --exec-self-sha256:<gate-sha256> \
  --exec-guard-sha256:<guard-sha256> \
  --exec-evidence-sha256:<evidence-sha256> \
  --exec-lock-validator-sha256:<validator-sha256>
```

bundle 固定消费四个 basename。门禁要求 source root、bundle 和实际 `BASH_SOURCE` 均为无 symlink 的规范路径，四个源文件为不同 inode；使用 `O_NOFOLLOW` 文件描述符读取并核对显式 SHA256，再写入只读、逐文件与逐目录 `fsync` 的执行快照。最终判决前再次验证源 bundle、快照、identity manifest 的 inode、时间戳和 SHA256。任一绑定缺失或漂移都使 `exec_bundle_identity` / `exec_bundle_freshness` 变 RED。无六项参数时只允许仓库 `ROOT/tools` 作为唯一当前执行入口。

完整门禁：

```bash
REGALLOC_GATE_OFFICIAL_MANIFEST=/absolute/current-driver.manifest \
REGALLOC_GATE_OFFICIAL_MANIFEST_SHA256=<sha256> \
REGALLOC_GATE_BASELINE_MANIFEST=/absolute/baseline-driver.manifest \
REGALLOC_GATE_BASELINE_MANIFEST_SHA256=<sha256> \
REGALLOC_GATE_JOBS_LOCK=/absolute/jobs.lock \
REGALLOC_GATE_JOBS_LOCK_SHA256=<sha256> \
REGALLOC_GATE_EXEC_DIFF_LOCK=/absolute/exec-diff.lock \
REGALLOC_GATE_EXEC_DIFF_LOCK_SHA256=<sha256> \
REGALLOC_GATE_TARGET_EMIT_LOCK=/absolute/target-emit.lock \
REGALLOC_GATE_TARGET_EMIT_LOCK_SHA256=<sha256> \
REGALLOC_GATE_GEN3_LOCK=/absolute/gen3.lock \
REGALLOC_GATE_GEN3_LOCK_SHA256=<sha256> \
tools/regalloc_production_gate.sh
```

所有 Cheng full compile 前都先执行 `dry-compile` 并保存八个规定字段。full compile、链接和执行统一受 1 GiB process-tree guard 约束，stdout/stderr 和大报告只写入 `/tmp/artifacts/regalloc-production-gate/<run-id>`。

## 放行条件

生产绿必须同时满足：

1. current official driver 与 immutable baseline 身份、哈希和输入闭包有效。
2. current driver 对真实 `primary_object_plan.cheng` 完成 guarded compile；身份闭包则绑定真实 driver dispatch，因此同时覆盖 primary 与 backend2 生产入口。
3. compile report 给出唯一 production receipt、fill 前产生的独立 frozen plan/recipe snapshot、生产 import closure 和 action machine-fragment ledger。
4. 门禁从 snapshot 的完整 constraints、plan 和 40 字段 Action 重算 native hash，再验证 ledger 的每个机器 action 映射到 object 的唯一机器码区间。
5. object 的每个外部 `__text` 符号都有函数 receipt，不能只覆盖白名单。
6. cycle-copy、address-escape stack-home 两个独立 smoke 均由 official driver 编译并执行成功。
7. x18、x29、SP 对齐、frame balance、callee-saved 和 x8 sret 的静态/运行 ABI 门通过。
8. 四份外部锁全部由 raw artifacts 重算通过。
9. Darwin arm64 真机证明有效，`sysctl.proc_translated=0`，拒绝 Rosetta/虚假 target 标签。
10. compile wall、process-tree RSS、spill density 和 `__TEXT` 比率实测通过。

生产闭包必须存在规范调用形，且源码闭包和 official driver 二进制都不得残留 legacy liveness/linscan/overlay 符号；缺闭包、缺规范调用点或任一命中均为生产 RED。

## Import Closure

门禁按正式 import 表面解析单模块、`as` 和分组导入，生成带文件与边的确定性闭包：

```text
schema=regalloc_source_manifest
entry=src/core/tooling/backend_driver_dispatch_min.cheng
entry_module=core/tooling/backend_driver_dispatch_min
target=arm64-apple-darwin
file_count=<N>
file.0.module=<canonical module>
file.0.path=<repo-relative path>
file.0.sha256=<sha256>
...
import_edge_count=<M>
edge.0.from=<file index>
edge.0.to=<file index>
...
manifest_payload_sha256=<sha256 of all preceding lines>
```

official manifest 引用的闭包必须与现场生成物逐字节相同。唯一 compile receipt 必须再次绑定同一绝对路径与 SHA256；闭包逐文件复算后必须恰好包含当前 `regalloc_single_pass.cheng`、`primary_object_plan.cheng`、`backend2_pipeline.cheng` 和 `backend2_assemble.cheng`。仅有 file count 或源码关键词不算接线证明。

## Driver Identity

current 与 baseline manifest 使用：

```text
schema=regalloc_driver_manifest
role=official_current|immutable_baseline
driver_path=<absolute regular file>
driver_sha256=<sha256>
source_git_tree=<40 or 64 lowercase hex>
source_manifest_path=<absolute regular file>
source_manifest_sha256=<sha256>
allocator_path=<absolute regular file>
allocator_sha256=<sha256>
target=arm64-apple-darwin
certification_report_path=<absolute regular file>
certification_report_sha256=<sha256>
manifest_payload_sha256=<sha256 of all preceding lines>
```

certification report 只冻结身份，不证明 regalloc 已运行。真正生产接线只由后续 production receipt、frozen snapshot、machine-fragment action ledger 和 object/disassembly 共同证明。current 还必须绑定当前 `artifacts/backend_driver/cheng`、当前 allocator、当前 `HEAD^{tree}` 和现场 closure；baseline driver hash 必须与 current 不同。current 与 baseline 都从各自 `allocator_path` 的规范 `src/core/backend/regalloc_single_pass.cheng` 位置确定 workspace root；closure path 必须是该 root 内无 `..`/symlink 重定向的规范 repo-relative path，字段全集、module/path 唯一性和 allocator 在 closure 中的存在性都逐项验证；baseline 不允许以空 workspace root 跳过验证。

## Compile Receipt

compile report 必须包含：

```text
regalloc_receipt_schema=regalloc_single_pass.production
regalloc_allocator=regalloc_single_pass
regalloc_wiring_mode=production_default
regalloc_allocator_source_sha256=<current allocator>
regalloc_driver_sha256=<official driver>
regalloc_source_manifest_sha256=<production closure>
regalloc_target=arm64-apple-darwin
regalloc_production_import_closure_path=<absolute current manifest>
regalloc_production_import_closure_sha256=<sha256>
regalloc_action_emission_ledger_path=<absolute ledger>
regalloc_action_emission_ledger_sha256=<sha256>
regalloc_frozen_plan_snapshot_path=<absolute snapshot>
regalloc_frozen_plan_snapshot_sha256=<sha256>
regalloc_fixture_source_sha256=<sha256>
regalloc_output_object_sha256=<sha256>
regalloc_object_text_symbol_count=<uint>
regalloc_object_text_symbol_inventory_sha256=<sha256>
regalloc_outgoing_stack_arg_action_count=<uint>
...
```

全局必须满足 plan count = frozen count = function receipt count，action count = Ack count，且 unacknowledged、unknown shape、env gate、legacy overlay action、aggregate-register assignment、missing restore path 全为 0。snapshot、ledger、compile report 和 object 必须是四个不同的 compile-work-dir 常规文件。register assignment、spill、reload、call-clobber 必须真实出现；runtime fixture 还要求 edge copy、cycle break、critical edge、sret exclusion 和 address-escape memory action。

每个函数除 BodyIR/plan/action/size/fill/ack/machine hashes 外，新增：

```text
regalloc_function_N_symbol_byte_start=<decimal object text address>
regalloc_function_N_symbol_byte_length=<bytes>
regalloc_function_N_symbol_bytes_sha256=<sha256>
regalloc_function_N_action_semantic_root_sha256=<ordered ActionAt semantic root>
regalloc_function_N_action_ledger_root_sha256=<recomputed root>
regalloc_function_N_machine_fragment_root_sha256=<frozen fragment root>
regalloc_function_N_abi_ingress_root_sha256=<frozen ABI ingress root>
```

函数 receipt 集合必须与 `nm` 读出的 object 外部 `__text` 符号集合完全相等。门禁按 `(byte_start,symbol)` 排序，以 `symbol.N.name/byte_start/byte_length/bytes_sha256` 四行重建 inventory root。每个符号必须从起点到下一个符号连续反汇编；`symbol_bytes_sha256` 和 `machine_slice_sha256` 都必须等于现场 AArch64 指令字按 little-endian 四字节连接后的 SHA256。

## Frozen Plan Snapshot

`regalloc_frozen_plan_snapshot` 必须在 allocator plan 和 target machine recipe 都冻结后、首次 fill 前直接写出，禁止由 ledger 或 object 反序列化生成。任何尚未提供当前完整字段的 producer 都稳定必红，不能回退到旧 schema 推测 effect 或 recipe 来源。全局固定：

```text
schema=regalloc_frozen_plan_snapshot
phase=allocator_and_machine_recipe_freeze_before_fill
fixture_source_sha256=<sha256>
source_manifest_sha256=<sha256>
driver_sha256=<sha256>
target=arm64-apple-darwin
function_count=<N>
...
snapshot_payload_sha256=<sha256 of all preceding lines>
```

每个函数必须绑定 symbol、BodyIR hash、机器 recipe 来源，并证明快照时状态为：

```text
function.N.recipe_origin=body_ir_adapter
function.N.frozen=1
function.N.finalized=0
function.N.emission_symbol_bound=0
function.N.next_issue_ordinal=0
function.N.next_ack_ordinal=0
function.N.action_emission_count=0
```

`recipe_origin` 是 snapshot payload SHA256 保护的实际 emitter 路径事实。生产门禁只接受 `body_ir_adapter`；`fixed_template`、缺字段和未知值全部 hard-fail。这样合法的空 BodyIR 仍可由真实 adapter 发射，而 `RegallocProductionEmitAarch64FixedFunction` 用空 BodyIR 包装任意预制机器码、再把整函数冒充单个 term fragment 的 receipt 永久不能放行。

constraints 的 14 项为 `register_universe`、`allocatable_caller_regs`、`allocatable_callee_regs`、`reserved_regs`、`call_clobber_regs`、`fixed_arg_regs`、`fixed_result_reg`、`fixed_sret_reg`、`fixed_return_reg`、`parallel_copy_scratch_reg`、`packed_stack_args`、`stack_arg_slot_bytes`、`stack_alignment_bytes`、`gpr_type_kinds`。AArch64 Darwin 固定值逐项精确验证：寄存器全集 `0..30`、caller `9..15`、callee `19..22`、reserved `0..8,16,17,18,29,30`、call-clobber `0..18,30`、参数 `0..7`、result/return `0`、sret `8`、scratch `16`、packed `1`、slot `8`、alignment `16`、GPR type kinds `1,4,6`。

plan 的 57 项严格按 native 顺序保存；BodyOp kind/arity 与 access-fact 六数组共同构成 allocator 语义证明真源：

```text
stack_slot_count call_count call_arg_counts call_reachable position_count
block_entry_positions block_exit_positions body_op_kinds body_op_operand_counts
op_before_positions op_after_positions
term_before_positions term_after_positions value_def_positions
value_def_fact_indices value_def_blocks value_def_is_entry value_end_positions
value_slot_indices value_type_kinds value_classes value_memory_homes
value_assigned_regs value_use_offsets value_use_positions value_use_fact_indices
value_use_kinds value_use_source_blocks value_use_target_blocks call_positions
allocation_order reg_interval_offsets reg_interval_values operand_reg_by_fact
access_fact_registers access_fact_is_allocator_clobber
access_fact_block_indices access_fact_op_indices access_fact_term_indices
access_fact_edge_indices
op_action_starts op_action_counts term_action_starts term_action_counts
block_entry_action_starts block_entry_action_counts function_entry_action_start
function_entry_action_count block_exit_action_starts block_exit_action_counts
edge_source_blocks edge_target_blocks edge_action_starts edge_action_counts
virtual_entry_action_starts virtual_entry_action_counts used_callee_mask
```

六个 access-fact 数组与 `operand_reg_by_fact` 等长，以数组下标作为唯一 fact ordinal；clobber bool 为 1 的 fact 必须全部且各一次被同 site fragment 引用。

数组使用无空格逗号分隔的十进制整数，空数组为空值；bool 只能为 `0|1`。

每条 frozen Action 额外保存 `acknowledged=0`、`ledger_kind`、`fragment_ordinal` 和五个 bool effect：`effect_sp_load effect_sp_store effect_call effect_x16 effect_x17`，并继续按 native 顺序保存以下 40 字段：

```text
consumer_ordinal action_kind placement position block_index op_index term_index
fact_index value_id other_value_id source_location target_location
source_reg target_reg source_stack_slot target_stack_slot scratch_reg
target_memory_home source_block target_block edge_index requires_edge_split
parallel_group parallel_ordinal related_action_ordinal fixed_kind fixed_ordinal
pass_kind encoded_value call_ordinal abi_size_bytes abi_size_explicit
outgoing_stack_arg_index outgoing_stack_byte_offset
outgoing_stack_byte_width outgoing_stack_frame_bytes
semantic_kind semantic_start semantic_end semantic_register
```

函数 recipe 还必须保存：

```text
parameter_value_ids parameter_widths parameter_home_offsets returns_via_sret
frame_size_bytes callee_region_end ingress_region_start ingress_region_size
body_region_start block_offsets
```

frame 区域严格满足 `0 <= callee_end <= ingress_start <= ingress_end <= body_start <= frame_size`，frame size 按 target alignment 对齐，body 区足以容纳全部 stack slots。无真实 home 的低位参数只有在冻结 Action 确实产生 stack source/target 时，才在 body 区获得 allocator spill slot；该槽不得出现在 ABI ingress。第 8 个以后参数的 `parameter_home_offset` 必须为 `-1`，入口值只能从 caller frame 读取。

每个函数必须有按机器 offset 严格单调的统一 fragment 表。`owner_kind` 只允许 `action|op|term|edge|edge_trampoline|abi_ingress|frame_prologue|frame_epilogue`；no-def store、BodyOp/BodyTerm、edge trampoline 和 frame 机器序列都必须建 fragment，禁止因没有 Action 而豁免。每条 fragment 按以下固定顺序保存：

```text
owner_kind action_ordinal block_index op_index term_index edge_index
source_block target_block requires_edge_split ingress_ordinal value_id
machine_offset machine_size machine_sha256
effect_sp_load effect_sp_store effect_call effect_x16 effect_x17
effect_written_regs allocator_clobber_fact_indices branch_target_offsets
trampoline_offset target_offset fragment_sha256
```

fragment range 必须非空、四字节对齐、位于 symbol 内、按 ordinal 单调且互不重叠；`block_offsets` 必须按最终 RPO 物理递增，每个 op/term/action/edge/edge_trampoline fragment 必须落在其 block/source-block 区间。唯一 `frame_prologue` 必须从 symbol offset 0 开始，精确拥有初始 SP 分配与 callee save，并在首条 ABI ingress 前结束。每个 `frame_epilogue` 绑定唯一 op 或 term site，精确拥有 restore/teardown/ret；绑定 term 时可完成该 block 的 terminator coverage。

五个 effect 是 recipe 的精确存在位，不是 kind 推断值。`effect_written_regs` 必须排序去重，且不能靠自声明取得授权：action/edge 只能写该 Action 的 `target_reg`，其余写必须逐寄存器绑定同 site 的 `allocator_clobber_fact_indices`；op/term/edge_trampoline/ingress 没有对应 frozen clobber fact 就不得写 x9..x15/x19..x22。`frame_epilogue` 只例外允许写冻结 mask 中的 callee restore 寄存器，门禁仍从 object 重算其精确集合。每个 clobber fact 恰好由一个 fragment 消费。因此 StrEq 私自使用 x9..x15 必红。

同一 edge 可有多条机器 Action，因此 edge-action fragment 的稳定 site key 是 `(edge_index, action_ordinal)`；`trampoline_offset/target_offset/branch_target_offsets` 必须为空值，不能让任一 Action 冒充整条 trampoline。每条有机器 edge copy 的 edge 必须另有且仅有一条 `edge_trampoline` fragment，稳定 site key 是 `edge_index`，`action_ordinal=-1`。edge-action fragments 从 `trampoline_offset` 起按 action 顺序连续铺设，独立 trampoline fragment 紧随其后且只拥有最后一条 branch。

critical edge 按 CFG 结构严格重算：source 出度大于 1 且 target 入度大于 1。该分类必须与所有 edge-action 及 `edge_trampoline.requires_edge_split` 完全一致。source term 的真实 branch target 必须是独立 trampoline 的 `trampoline_offset`，trampoline fragment 的唯一真实 branch target 必须是 `block_offsets[target_block]`；所有 branch target 只能指向 block start 或冻结 trampoline，不能跳进 action/frame fragment 中部。唯一额外合法目标是同 op site 的 `frame_epilogue` 精确末尾，用于 legacy early-return 跳过该 op 自身的 epilogue。

ABI ingress 使用独立表：

```text
role=parameter_home|sret_pointer
param_ordinal value_id reg width sp_offset
machine_offset machine_size machine_sha256 entry_sha256
```

x0..x7 行必须逐项等于真实 parameter/value/home，且只为 `value_memory_homes=1` 的寄存器入参生成；x8 行仅 `returns_via_sret=1` 时存在一次，固定 `param_ordinal=-1,value_id=-1,width=8`。每行必须对应唯一 `abi_ingress` fragment，且 effect 精确为 `sp_store=1`、其余为 0。

门禁复制 native canonical：int32/int64/bool 为 `decimal;`，text 为 `len:value;`，array 为 `count;` 后接元素。现场重算唯一 current `regalloc-action`、`regalloc-action-semantic-root`、`regalloc-machine-fragment/root`、`regalloc-abi-ingress/root`、`regalloc-constraints`、`regalloc-plan`，并要求 receipt 的 plan/action/fragment/ingress roots 与 snapshot 完全一致。

## Machine Fragment Emission Ledger

ledger schema 为 `regalloc_action_emission_ledger`，是 emission 结果，不是 plan 或 recipe 真源；最后一行为 payload hash：

```text
schema=regalloc_action_emission_ledger
fixture_source_sha256=<sha256>
output_object_sha256=<sha256>
function_count=<N>
function.0.symbol=<symbol>
function.0.action_count=<M>
function.0.fragment_count=<F>
function.0.abi_ingress_count=<I>
function.0.action.0.kind=<kind>
function.0.action.0.action_kind=<native int32 kind>
function.0.action.0.consumer_ordinal=<action index>
function.0.action.0.placement=<int>
function.0.action.0.position=<int>
...=<snapshot 中其余 40 字段、fragment_ordinal 和五个 effect，逐字段完全相等>
function.0.action.0.semantic_sha256=<sha256>
function.0.action.0.ack_kind=machine_emitted|structural_validated
function.0.action.0.binding_kind=machine|structural
function.0.action.0.owner_plan_sha256=<function plan sha256>
function.0.action.0.machine_offset=<symbol-relative byte offset>
function.0.action.0.machine_size=<byte count>
function.0.action.0.machine_sha256=<sha256>
function.0.action.0.binding_sha256=<canonical binding hash>
function.0.fragment.0.*=<snapshot fragment 全字段，逐字段完全相等>
function.0.fragment.0.fragment_sha256=<canonical fragment hash>
function.0.abi_ingress.0.*=<snapshot ingress 全字段，逐字段完全相等>
function.0.abi_ingress.0.entry_sha256=<canonical ingress hash>
...
function.0.root_sha256=<ordered action binding root>
function.0.fragment_root_sha256=<ordered fragment root>
function.0.abi_ingress_root_sha256=<ordered ingress root>
ledger_payload_sha256=<sha256 of all preceding lines>
```

必须绑定机器码的 kind：`register_assignment`、`spill`、`reload`、`call_clobber`、`edge_parallel_copy`、`parallel_copy_scratch_save`、`parallel_copy_scratch_restore`、`critical_edge_copy`、`stack_home_store`、`stack_home_reload`、`fixed_result_move`、`outgoing_stack_arg_store`、`sret_return_store`。

只允许结构绑定的 kind：`sret_result_binding`、`value_classification`、`liveness_interval`、`sret_exclusion`、`address_escape_home`、`callee_saved_selection`、`dead_value`、`coalesced_copy`。结构 action 的 offset/size 必须为 0，machine hash 必须是空字节 SHA256。门禁由 native `action_kind`（以及 fixed-load source location、critical-edge flag）确定 ledger kind，不接受 snapshot 自由改名；未知 kind 直接失败。

`coalesced_copy` 固定对应 native action kind 128，只允许单操作数 `LoadLocal|StoreLocal|CopyLocal` 的唯一普通 Use + 唯一 Def。源/目标必须落在同一 allocator GPR，类型只能同型 `I32/I64/Ptr` 或无表示变化的 `I64↔Ptr`；`I32→I64` 必须发射 `SXTW`，`I64→I32` 必须发射 W 宽 ORR，均不得伪装结构动作。源若是 `AddressHome`，其 assigned reg 必须为 -1，kind128 的 `related_action_ordinal` 必须严格指向同 op-before、同 source fact/value、同寄存器的既有 `ReloadOperand`；直接 GPR 源则 related 必须为 -1。伪造、缺失、未来 ordinal 或错误 reload provenance 全部 hard-fail。

`Ptr(aux=I32|I64|Str)` 作为上述 local-copy op 的 target 表示内存 write-through，不是 local Def，更不是 `coalesced_copy`：事实固定为 source Use、target pointer Use、`MemoryIndirectWrite`。adapter 必须由 op-site recipe 发射真实 store；`I32→I64` 先 `SXTW` 再 `STR`。权威 smoke 当前覆盖 I32/I64/Ptr 标量 write-through；正式 24B Str 仍由 canonical Aggregate/FieldStore 路径证明，不以合成 16B Str 夹具冒充覆盖。

机器 Action 必须双向绑定唯一 action/edge fragment；结构 Action 的 `fragment_ordinal=-1`、五个 effect 全 0、offset/size 为 0、machine hash 为空字节 SHA256。机器 Action 的 range/hash/effect 必须逐字段等于 linked fragment。门禁从 object 现场截取 fragment 字节重算 hash，再从反汇编精确重算 SP load、SP store、call、x16、x17、显式写 allocatable regs 和 direct branch targets；SP effect 使用 fragment 内常量/SP 符号传播，`movz/movk + add xN,sp,xN + [xN]` 的大偏移访问不能漏报。

Action binding canonical 在原字段后追加：

```text
kind
semantic_sha256
ack_kind
binding_kind
owner_plan_sha256
machine_offset
machine_size
machine_sha256
fragment_ordinal
effect_sp_load
effect_sp_store
effect_call
effect_x16
effect_x17
```

门禁不从 ledger 自证 plan/recipe。symbol 内每条指令——包括严格 frame 建立、callee save/restore 和 teardown——都必须恰好属于一个 fragment；frame 指令只能由显式 `frame_prologue|frame_epilogue` 拥有。SP load/store、`bl/blr`、x16、x17 只是额外 effect 全等检查，不再用不完备的 ledger-kind 白名单。因此复合 producer+store、Address source、间接 BLR 可以由真实 fragment 精确声明，不会误红；漏 effect、伪 owner、重叠 owner、no-def store 无 owner 都必红。`outgoing_stack_arg_store` 的 ABI offset/width/frame 仍从 snapshot constraints 重算并与真实 scalar store 全等。

ABI ingress 必须紧接完整 SP 分配及全部 strict callee saves，位于首个 body fragment 前，行之间连续。store 只允许直接 `[sp,#const]`，槽位在独立 ingress region 内、对齐、两两不交叠且不与 callee/body region 交叠。x0..x7 中没有真实 memory home 的参数直接由入口 `register_assignment` action 搬到 allocator register，不得伪造 ingress 槽；有真实 home 的参数才允许 ingress store 与绑定同一 value 的 reload Action fragment。入口后禁止再次写这些槽；sret slot 只允许 `sret_return_store` fragment 精确读取，且 CFG must-analysis 要求每个可达 return 路径经过该 store。存在 ingress 时，无法由符号传播证明固定 offset 的动态 SP 访问直接失败。非 sret 函数出现 x8 ingress、sret 函数缺 x8、间接构造 ingress 槽地址均失败。

## 权威 Smoke

以下文件属于 fixture bundle，并由 official driver 先 dry-compile、再在 1 GiB guard 下编译执行：

- `src/tests/regalloc_parallel_copy_cycle_smoke.cheng`
- `src/tests/regalloc_address_escape_stack_home_smoke.cheng`
- `src/tests/regalloc_coalesced_copy_smoke.cheng`
- `src/tests/regalloc_structured_proof_contract_smoke.cheng`
- `src/tests/regalloc_gate_runtime.cheng`

structured-proof smoke 固定执行 `BeginSymbol -> ActionAt/Ack... -> SealSymbol -> Finalize`，覆盖完整 Action 快照 ticket、逐条 Ack、单调且不重叠的发射区间、未消费 action hard-fail，以及混合宽度 stack args 的 offset/width/frame。完整 symbol hash 只能在字节全部发射后 Seal，禁止发射前预填 hash 或事后伪回放。cycle smoke 覆盖二环、三环、寄存器/栈环、无操作 copy、非法 scratch 与 critical-edge 标记。stack-home smoke 额外以 AddressHome reload→同寄存器 copy 验证 adapter recipe、唯一 LDR producer、结构零字节 receipt 和伪 provenance 拒绝。coalesced smoke 覆盖三种 local-copy op、类型转换边界、write-through 事实/STR recipe、生产 emitter receipt 和结构动作 mutation。

## ABI

`objdump -dr` 与 CFG 静态解释器执行：

- x18 任何使用都失败。
- x23-x28 不允许 allocator 使用；运行探针仍把它们设为哨兵验证 callee 保持。
- x29 只允许 frame 建立、frame-based load/store、保存和恢复；普通值写入失败。
- x19-x22 的真实机器使用 mask 必须等于 receipt mask。
- 每个使用的 callee-saved 和 x29 必须在首次写前保存，槽位不被覆盖，每个可达返回路径从同一槽恢复。
- 沿 CFG 精确传播 SP delta；join 状态必须一致，每个 `bl/blr` 点必须 16-byte 对齐，每个 `ret` 的 delta 必须回到 0。
- ABI ingress 只接受 frozen snapshot/action ledger 的独立严格表；x0..x7 仅真实 home，x8 仅真实 sret，入口后槽位不可写，sret store 覆盖所有可达 return。
- 间接 branch/call、未知动态 SP 写和无法证明的返回路径直接失败。
- 24B aggregate 必须在机器码中出现 x8 sret。

汇编 probe 额外在真实调用前后比较 x19-x28、x29、SP，并验证 SP 调用点对齐。

## Raw External Locks

锁不再携带 `status=proved` 或结论字段：

```text
schema=regalloc_external_lock
lock_kind=jobs_determinism|exec_diff|target_emit_hard_fail|gen3_fixed_point
driver_sha256=<official driver>
source_git_tree=<current tree>
source_manifest_sha256=<current closure>
allocator_sha256=<current allocator>
target=arm64-apple-darwin
generated_at_epoch_seconds=<uint>
expires_at_epoch_seconds=<uint>
raw_manifest_path=<absolute regular file>
raw_manifest_sha256=<sha256>
lock_payload_sha256=<sha256 of all preceding lines>
```

有效期最多 86400 秒。raw manifest：

```text
schema=regalloc_external_raw_manifest
lock_kind=<same kind>
artifact_count=<N>
artifact.0.role=<role>
artifact.0.path=<absolute regular file>
artifact.0.sha256=<sha256>
...
manifest_payload_sha256=<sha256 of all preceding lines>
```

门禁与生成器只调用 `tools/regalloc_external_lock_validator.py` 这一套只读验证器，逐个复算 raw artifact、payload hash、规范绝对路径，并在判决前二次确认所有已读文件未漂移：

- `jobs_determinism`：要求 `jobs1_object/jobsn_object/jobs1_report/jobsn_report`；wrapper 必须逐项绑定 source、dry/full report、guard、stdout/stderr、worker 数和 production receipt，最后逐字节比较两个 object。
- `exec_diff`：要求 `exec_diff_report/exec_diff_cases`；cases 使用 `regalloc_exec_diff_cases`，拒绝少于 209 case，并与现场按文件名排序重建的 corpus inventory 逐字节相等。每 case 同时绑定 actual/reference 的 object、compile report、guard、stdout/stderr；门禁复算 actual production receipt、Mach-O object、runtime rc 与输出字节。
- `target_emit_hard_fail`：要求 `target_emit_matrix`；matrix 的 `canonical_matrix_id` 固定为 `regalloc_target_emit_canonical.16x3`，target/emits 的顺序和数量不可变。每 case 的 evidence、guard、report、artifact 和 Mach-O/ELF/Wasm 头现场复算。
- `gen3_fixed_point`：要求 `gen2_driver/gen3_driver/gen2_fixed_object/gen3_fixed_object/gen3_lineage`；两个不同 inode 输入、两个 driver、两个 fixed object、两份 production compile receipt/guard/stdout/stderr 全部绑定并逐字节复算。

## 性能

运行微基准仍保留 ABBA/BAAB 七配对、5% 墙钟回归和 10% 噪声门，但不再是性能绿的充分条件。`perf.pairs.tsv` 改为每次执行一行，按真实 pair/ordinal 顺序保存 role、elapsed、executable、elapsed/stdout/stderr/guard 的绝对路径与 SHA256；验证器拒绝先按 role 重排再汇总。最终报告同时绑定 raw TSV 与 payload-hashed verdict。

所有性能样本必须在 `uname -s=Darwin`、`uname -m=arm64`、`hw.optional.arm64=1`、`sysctl.proc_translated=0` 的同一主机上产生；proof 绑定 `hw.model`、`kern.osversion`、target 和 payload SHA256。

正式性能门还会用 current 与 immutable baseline 编译同一份真实 `primary_object_plan.cheng`。固定执行三组、每组四次，奇数组 ABBA、偶数组 BAAB，共 12 个顺序样本：

- `compile_wall_ns`：外层 monotonic wall；每组 current/baseline 比率、最大比率和中位数从 raw TSV 重算，最大比率 `<= 1.05`，组间 spread `<= 10%`。
- `compile_process_tree_peak_bytes`：来自每次独立验证的 guard report；同样按组三次重算，最大比率 `<= 1.05`、spread `<= 10%`，且 12 次都不超过 1 GiB。
- compile raw TSV 的每行绑定 metrics/object/report/guard/stdout/stderr 的绝对路径和 SHA256；guard 的 Darwin process-tree、采样、stream path 和 resident/phys-footprint 字段全部现场重验。同一 role 的 object 必须确定。验证器还会直接复算本次 `primary_object_plan.cheng`、official current driver snapshot、immutable baseline driver snapshot 的 expected SHA256，要求每一行 source/compiler hash 精确匹配；仅证明样本内部一致不够。verdict 再绑定 raw TSV SHA256 和 payload SHA256。
- `spill_density_ppm`：从 object 反汇编统计 AArch64 byte/half/word/x/pair/non-temporal/acquire/exclusive 等真实 SP load/store。只排除入口连续保存且在每个返回点从相同 SP 槽恢复的 x19-x30 frame 指令；current 必须低于 baseline 且 `<= 250000`。
- `__TEXT`：production object 必须小于 baseline object。
- `__TEXT/clang`：同语义 `regalloc_gate_perf.cheng` 与 `regalloc_gate_perf_oracle.c` 都执行相同 checksum，目标文件 `__text` 比率必须 `<= 2.0`。

四项任一没有 raw measurement、编译未完成、source hash 不同或 compiler hash 相同都失败。

## 内存边界

guard 逐字段验证 `beat_c_process_memory_guard`、process-tree identity history、Darwin resident/phys-footprint、0.01 秒采样、无逃逸 PID 和观测峰值 `<= 1073741824`。

这是 sampled process-tree limit；用户态采样不能证明采样间瞬时峰值，因此报告固定保留：

```text
hard_memory_limit_proof_status=not_provable_userspace_poll
```

## 最终状态

报告 schema 为 `regalloc_production_gate`。报告绑定 native-host proof、执行 bundle identity、四工具 expected/actual SHA256、perf/compile raw samples、两份 pair verdict、required-status manifest、校验时冻结的 186 行实际生产状态和 payload-hashed verdict 的路径与 SHA256。

完整 run 的生产/BOTH 必需状态集合固定为 186 个键：新增 `source_legacy_file_absence`（R5 旧链三文件 `regalloc_liveness/linscan/overlay.cheng` 重新出现即 RED，独立于 import 闭包扫描）、`exec_bundle_identity` 与 `exec_bundle_freshness`，其余覆盖基础身份、闭包、四锁、七条 dry、合同与 smoke、14 个 runtime 断言（含 `dynamic_indexed=1200`、`stack_args=385`）、runtime/perf/workload receipt、7×4 次 perf run 的 guard/result、3×4 次 workload compile 的 guard/result、clang 对照、源码/fixture freshness 和最终性能判定。门禁在写入 meta 状态前要求实际 `(key,scope)` 集合与该 manifest 完全相等、全部 GREEN、无额外生产键，并显式要求 `mode=run`、`driver_role=production`、contract 成功；缺键不再能靠 `RED count=0` 假绿。

缺 official/baseline 身份、production receipt、frozen snapshot、machine-fragment action ledger、任一 raw lock、任一 authoritative smoke、ABI、四类性能测量或必需状态键时，脚本稳定非零退出并列出具体 RED 原因。
