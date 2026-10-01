侦察完成。以下为批 5 算法规格全文。

---

# ExactDef 批 5 算法规格（自 C 冷链提取）

> 2026-08-25 侦察代理产出，供批 5（var-out 分类器 + 调用权威 + seal root + 程序契约）实施使用。
> 配套设计：docs/cheng-exact-def-rewrite-design.md §4 批 5、§5-1/§5-4、§3.4、§6；格式对齐批 2/3/4 规格。
> 行号为当前树实测：任务书锚点 cold_parser.c:25499/28856/55679-56049 均无漂移。cheng_cold.c 侧契约域锚定 104235-10618（derive）/105045-10495（admit+快照）。批 1 侧车已落仓（`src/core/ir/body_ir_exact_def.cheng`，360 行，无程序契约五列——批 5 扩列）。

## 0. 公共基元（批 2/3/4 已规，此处只列批 5 消费点）

- `reaches/is_current_at_predecessor/is_current_at_consumer/is_live_before_op`（批 2 §0）：late-merge 臂（26071-26080）、初始化源（26471-26475）、root-live（22384-22397）、root publication（25447-25455）。
- `cold_exact_owned_cfg_merge_authority_valid` / `borrowed_merge_authority_valid(_impl)` / `borrowed_merge_projection_consume_keeps_slot` / `borrowed_merge_successor_at_call` / `unique_borrow_merge_authority_valid`（批 4 §3）：见 §1.7/§2.7/§3.3 消费点。
- 帧自有谓词 `cold_exact_shared_projection_roots_frame_owned`（cold_parser.c:29748-29769，批 3 §5.1）：批 5 第四处接线在 root publication（25416）。
- `cold_exact_var_projection_carrier_valid` / `unique_projection_root_valid` / `unique_var_param_authority_valid` / `param_definition_edge_valid` / `var_owner_root_definition` / `borrow_result_root_valid` / `borrow_result_owner_root_valid`（批 3 域）：批 5 全程复用，禁止重实现。
- `cold_exact_mutually_exclusive_consumer_pair_valid`（批 2 consume 域）：source_consume_exclusive（26094-26099）。

## 1. var-out 分类器 `cold_exact_call_var_out_definition_valid_impl`（cold_parser.c:25499-26660）

### 1.0 wrapper（26789-26831）

查询域 memo（键域 1，`cold_exact_var_memo_probe`），`row_complete`（`def_slot!=-1 || place!=INVALID`，26807-26811）不入缓存——发布中 NOP 行不得进 memo。Cheng 不移植 memo：freeze 单遍顺序推导天然归纳（对照证书重发器 26838+ 的归纳注释）。wrapper 内 `([voenter])/([vofail])` 为探针。

### 1.1 入口门 + sentinel 静默拒 + MEMORY_VERSION 域门（25507-25543）

1. 参数门（25507-25512）：`!body || !symbols || def∉[0,op_count) || kind[def]!=NOP` → false，无判词。
2. **sentinel 静默拒**（25521-25533）：八列全空（`slot==-1 && type==-1 && producer==-1 && place==INVALID && own==INVALID && origin==-1 && consume==0 && source==-1`）→ false，**无判词**。注释（25513-25520）：普通 NOP 可巧合共享 call/formal tuple（条件 CFG lowering 是一类 producer），全哨兵行「不声称是定义」；外围 schema 在「无唯一合法 var-out 定义」时硬拒。这是精确域划分非启发式。
3. **MEMORY_VERSION 域门**（25539-25543）：`place[def]!=MEMORY_VERSION` → false。注释（25534-25538）：CFG_MERGE 行用 `(a=slot,b=version,c=predecessor)` tuple，永不得作 call/carrier 索引探。

### 1.2 mutation 形歧义排除 + fixed-array 快放（25544-25592）

- 若 `cold_exact_native_sequence_mutation_version_valid(def) || cold_exact_scalar_var_mutation_version_valid(def)`：发布形与 mutation 形共享 NOP(slot,X,Y) 骨架，须形状析取 `vo_row_shape`（25554-25568）：`op_a=vo_call∈[0,def) && kind∈{CALL_I32,CALL_COMPOSITE} && op_c=vo_carrier∈[0,vo_call) && kind[vo_carrier]∈{LOCAL_ADDR, FIELD_REF, SEQ_OPAQUE_INDEX_REF_DYNAMIC, ARRAY_OPAQUE_INDEX_REF_DYNAMIC, COPY_I64, COPY_COMPOSITE}`。非发布形状 → false（25569-25583）。通过则**继续走 var-out 严格路径**（不放行）。
- `cold_exact_plain_fixed_array_field_store_version_valid(def)` → **直接 true**（25585-25592）。

### 1.3 索引结构门（25593-25622）

取值 `value_slot=op_dst, call_op=op_a, param_index=op_b, carrier_op=op_c`。触发条件（25605-25613）：`value_slot∉[0,slot_count) || call_op∉[0,def) || carrier_op∉[0,def) || !(dst[carrier]==value_slot || (LOCAL_ADDR && a[carrier]==value_slot) || (COPY_I64 && a[carrier]==value_slot) || kind[carrier]==NOP)`。注释（25597-25604）：carrier 可以是调用前 staging（dst 钉）或 out-staging 拷贝；forwarded `var T` 实参从读侧钉（`op_a==value_slot`）。
判词字段序（25615）：`call var-out definition index structure mismatch definition=%d call=%d carrier=%d slot=%d ckind=%d cdst=%d ca=%d csrc=%d`（csrc=carrier 的 source 列）。

### 1.4 carrier 五分类 + S4 严格合取（25623-25798）

1. `carrier_is_local_addr`（25623-25627）：LOCAL_ADDR && a==value_slot && b==0 && c==0。`carrier_local_projection_authority_valid` = 该形 && `cold_exact_var_projection_carrier_valid(carrier)`（25628-25631）。
2. `carrier_is_projection`（25636-25641）：kind∈{FIELD_REF, SEQ_OPAQUE_INDEX_REF_DYNAMIC, ARRAY_OPAQUE_INDEX_REF_DYNAMIC}。`carrier_projection_authority_valid` = 该形 && projection_carrier_valid（25642-25645）。注释：字段/下标投影实参（graph.commands）的写回目标是投影字段本身，carrier 的 dst 即地址槽。
3. `carrier_is_forwarded`（25648-25651）：COPY_I64 && `def_slot[carrier]==dst[carrier]`（转发托管 var 载体是带全权威的 COPY_I64 地址定义，强于哨兵 LOCAL_ADDR）。
4. `carrier_is_var_array_local`（25658-25681）：`(COPY_COMPOSITE||NOP) && def_slot[carrier]==value_slot && producer[carrier]==body_producer && ((own==PLAIN && place∈{STACK_LOCAL,MEMORY_VERSION,CFG_MERGE}) || (own==BORROW_UNIQUE && place∈{PARAM,MEMORY_VERSION,CFG_MERGE})) && slot_kind[value_slot]==SLOT_ARRAY_I32`。`var T[N]` 实参的载体是帧驻数组本地自己的当前定义——无地址载体行。
5. `carrier_is_projection_publication`（25690-25698，wall6 第五分类）：`kind[carrier]==NOP && place[carrier]==MEMORY_VERSION && a[carrier]==call_op && b[carrier]==param_index && def_slot[carrier]!=value_slot && cold_exact_call_var_out_definition_valid(carrier)`（递归完整校验；op 严格递减保证终止）。注释（25682-25689）：投影载体 var 实参发布两行——投影 cell 版本行 + 紧随其后根 cell 版本行，根行的 carrier 就是同调用同形参的投影发布行。

调用种类门（25699-25706）：`kind[call_op]∉{CALL_I32,CALL_COMPOSITE}` → false。

**S4 合取**（25707-25714）：`(!五分类任一) || (local_addr && !sentinel(carrier) && !local_proj_auth) || (projection && !proj_auth)` → 判词（25717）`call var-out definition base structure mismatch body=%.*s definition=%d call=%d call_kind=%d carrier=%d carrier_kind=%d carrier_dst=%d carrier_a=%d carrier_b=%d carrier_c=%d carrier_def_slot=%d carrier_place=%d carrier_ownership=%d carrier_origin=%d carrier_type=%d slot=%d` + nearby-op dump（25745-25765）+ consumer-nearby dump（25766-25794，仅 recorded_consumer 在窗口外时）。LOCAL_ADDR 的 sentinel 豁免：`cold_exact_op_tuple_is_sentinel(carrier)` 真则免投影权威（未初始化 LOCAL_ADDR 是唯一合法哨兵载体）。

### 1.5 根行早返回 helper（25799-25807 → 25395-25497）

`carrier_is_projection_publication` → `return cold_exact_call_var_out_root_publication_valid(body, symbols, def, call_op, param_index, carrier_op, value_slot)`。注释（25799-25803）：formal/call-arg 接线归 carrier 层（已全证），根行自带帧自有构造链证明，不得被强过 formal 的字段身份。

helper 本体（25395-25497）：`arm=origin[def]`，`field_carrier=op_c[carrier]`。两 arm 形态：

- **arm 形 1 字段投影**（25405-25418）：`arm∈[0,call_op) && kind∈投影三种 && place==BORROW_PROJECTION && dst[arm]==def_slot[arm] && a[arm]==value_slot && (frame_owned(arm) || unique_projection_root_valid(arm))`——arm 定义自己的投影 cell 同时读根 cell（wall6 形）。
- **arm 形 2 根纪元**（25426-25457）：`arm<op_count && def_slot[arm]==value_slot && dst[arm]==value_slot && producer 同体 && own∈{BORROW_UNIQUE,MOVE,PLAIN} && ((PARAM && param_definition_edge_valid(arm)) || (STACK_LOCAL && origin[arm]==arm) || (CFG_MERGE && origin[arm]==arm && (borrowed_merge_authority_valid(arm,true,true) || is_current_at_consumer(arm,call_op))) || (MEMORY_VERSION && (证书位[arm]==1 || is_current_at_consumer(arm,call_op) || 递归 var_out_valid(arm))))`。

合取门（25458-25477）：`arm/field_carrier 越界 || source[def]!=arm || place[def]!=MV || own[def]!=BORROW_UNIQUE || !两形任一 || origin[carrier]!=arm || field_carrier kind∉投影三种 || a[field_carrier]!=dst[arm] || def_slot[def]!=value_slot || type[def]!=slot_type[value_slot] || producer 不同体` → 判词（25479）`call var-out root publication authority mismatch body=%.*s definition=%d call=%d param=%d carrier=%d arm=%d field_carrier=%d slot=%d arm_kind=%d arm_place=%d carrier_origin=%d def_source=%d def_origin=%d def_own=%d`。全 int32 行/槽键，零名字键。

### 1.6 formal/ABI/权威严格合取（cid gate，25808-26363）

- carrier/function 门（25808-25818）：`carrier_slot=dst[carrier]∉[0,slot_count) || function_row=a[call_op]∉[0,function_count)` → `call var-out definition carrier/function mismatch definition=%d carrier_slot=%d function_row=%d`。
- formal 范围门（25819-25835）：`param_index∉[0,arity) || param_index>=arg_count || arg_start<0 || arg_start>call_arg_count || param_index>=call_arg_count-arg_start`（CALL_COMPOSITE 的 arg_count=op_c[call]，否则=function->arity）→ `call var-out definition formal range mismatch definition=%d formal=%d arity=%d arg_start=%d arg_count=%d call_arg_count=%d`。
- `source_definition`（25842-25851）：`direct_source>=0 ? direct : (version_parent==def ? -1 : version_parent)`。
- **expected_ownership**（25880-25899）：def 自身借用族 → 自身 own（借出版本 NOP 按设计携带自身借用权）；否则 source 借用族且非 independent_borrowed_local_cell → 继承 source own；否则 storage==PLAIN→PLAIN，否→MOVE。
- call-arg 权威三车道（26007-26037）：`sentinel`（四列全空）/ `matches_exact_source`（source<call 或 late-merge-current 且 CSR 四列==source 行四列）/ `matches_exact_carrier`（非 sentinel 且 CSR 四列==carrier 行四列）。
- `local_addr_call_arg_binding_valid`（26043-26053）：非 local_addr 形免；否则 sentinel∨matches_source∨(local_proj_auth && matches_carrier && `version_chain_reaches(source, origin[carrier])`)。
- `forwarded_carrier_authority_valid`（26100-26153）：三析取——(a) carrier 是 PARAM+BORROW_UNIQUE+producer 同体+consume==0；(b) `forwarded_carrier_is_global_projection`（26062-26067：source 过 `cold_exact_global_var_call_authority_valid`，复用全局调用全证）；(c) matches_carrier 且 source 行全字段（slot==value_slot、type 等、producer 同体、own==BORROW_UNIQUE、consume∈{空,==def+1,互斥对,other_slot} 26068-26123）且 carrier 行全字段（a==value_slot,b==0,c==0,type 等、producer 同体、place==STACK_LOCAL、own==BORROW_UNIQUE、origin==carrier_slot、consume==0、source==source_definition、forwarded_source_is_projection⇒source place==BORROW_PROJECTION）且 carrier_slot 槽四列一致。注释（26054-26061）：转发 var 载体是不可变借用定义，可变模块全局走 GLOBAL_ADDR 共享根+每调用 COPY_I64 UNIQUE BORROW_PROJECTION 的精确形。
- `projection_carrier_binding_valid`（26157-26168）：非投影形免；否则 matches_carrier && value_slot==carrier_slot && def_slot[carrier]==carrier_slot && type 等 && own==BORROW_UNIQUE && slot_type 等。注释：同根诱饵槽/哨兵 call-arg tuple 不是字段权威。
- `projection_slot_authority_valid`（26174-26179）：非投影形免；否则 `slot_place[value_slot]==BORROW_PROJECTION && slot_origin[value_slot]==origin[carrier]`。注释（26169-26173）：槽元数据只命名终态（可为更晚 CFG_MERGE），历史版本不得因不再是槽头被拒。
- `source_edge_valid`（26180-26197）：自根 NOP（origin==def）→ `direct==-1 && parent==def`；source<0 → 同上；借用源或 independent cell → `direct==-1 && parent==source`；否则 `direct==source && parent==source`，或 `(direct∈[0,def) && direct==parent && direct==origin[def])`。

**严格合取**（26237-26277，任一假即拒）：`!formal_is_var || formal_type.len<=0 || producer 越界 || !(ref_kind(formal_kind) || formal_is_var_fixed_array) || slot_kind[carrier_slot]!=formal_kind || slot_size[carrier_slot]!=(fixed_array?param_size:8) || call_arg_slot!=carrier_slot || call_arg_offset!=0 || !local_addr_binding || !forwarded_authority || !projection_binding || exact_type_id<0 || !(fixed_array ? param_exact_type_id>=0 && equal : var_formal_value_type_ids_same) || managed_type_id(value_slot)!=exact_type_id || storage==UNKNOWN || def_slot[def]!=value_slot || producer[def]!=body_producer || place[def]!=MEMORY_VERSION || own[def]!=expected_ownership || !source_edge_valid || slot_exact_type[value_slot]!=exact_type_id || !projection_slot_authority || slot_storage[value_slot]!=storage`。
判词（26279）`call var-out definition authority mismatch definition=%d source=%d call_arg=%d formal=%d value_slot=%d exact_type=%d storage=%d sentinel=%d source_match=%d` + 三组诊断块（carrier authority 26285 / conds 26291 / authority rows 26327，诊断块不移植）。

- object 身份门（26364-26386）：`param_exact_object_is_ref[param]>=0` 时实际 TypeId 的 object layout 必须存在、domain∈{OBJECT,OBJECT_REF}、is_ref 位相等，否则 `call var-out definition object identity mismatch definition=%d formal=%d`；否则若 storage==OBJECT → `call var-out definition non-object formal mismatch definition=%d formal=%d`。

### 1.7 late CFG merge 臂（25900-26006）

`source_is_late = source>=def`（25900-25901）。仅当完整证明链成立才合法：`in_range(25907-25909) && place[source]==CFG_MERGE && value_identity`（slot/type 等，或 `projection_parent_valid` 25926-25939：carrier 投影 + origin[carrier]==source + a[carrier]==def_slot[source] + def_slot[carrier]==value_slot + type 等 + read_source(carrier,A)==source）`&& producer 同体 && ownership_transition`（owned↔{MOVE,PLAIN} / borrowed↔同借用族，25914-25925）`&& (owned ? owned_cfg_merge_authority_valid : borrowed 双析取+successor_at_call)（25955-25965）&& reaches(source,call) && is_current_at_predecessor(source, call_block, call)（25966-25980）`。注释（25902-25906）：循环头 merge 在循环体后排，行序永非权威。判词（25987）`call var-out late CFG merge parent is not exact fn=%.*s definition=%d source=%d call=%d slot=%d in_range=%d tuple=%d merge=%d block=%d reaches=%d current=%d`。

### 1.8 块门 / 邻接门 / 未初始化形（26388-26451）

- 块门（26400-26409）：`call_block<0 || (!var_array_local && carrier_block!=call_block) || definition_block!=call_block` → `call var-out definition block mismatch definition=%d call_block=%d carrier_block=%d definition_block=%d`。注释（26394-26399）：REF 载体是调用点瞬态行必须与调用同块；`var T[N]` 载体是值当前所在的块，活性由初始化源证明。
- 邻接门（26410-26438）：扫 `(call_op, definition]`，每行须 NOP && a==call_op && b>previous_param 严格递增；**同参锚行豁免** `same_param_anchor_row`（26418-26426：NOP && a==call && b==prev && c==op-1 && op-1 亦同调用同参 NOP——投影发布两行组）。违 → `call var-out definition adjacency mismatch definition=%d op=%d previous_param=%d`。
- 未初始化源形（26439-26447）：`source==-1` 时要求 call-arg sentinel 且 `[0,def)` 内无任何 def_slot==value_slot 行 → true。

### 1.9 初始化源与 representative（26452-26659）

- `source_is_projection`（26456-26459）= carrier 投影 || forwarded source 投影 || 全局投影——初始化源证明在 reparse 期已卸（唯一根链+根活性），跳过 LOCAL_ADDR 形校验。
- `initialized_source_valid`（26471-26475）= late_merge_current || `cold_exact_initialized_var_source_valid(source, call_op, value_slot, type, storage)`（27026-27065 wrapper，memo 键域 2，证书行永不服务旧 memo）。
- `oxa_pub_merge_phi_succession`（26484-26506）：自根 CFG_MERGE phi（NOP+CFG_MERGE+origin 自指+MOVE+producer 同体+slot/type 等）且 `consume[source]==def+1 && slot_origin[value_slot]==def` → 承认为该 cell 的精确继任（phi 块可在 relocation shell 后，dataflow walk 会错读 UNDEFINED）。
- 门（26507-26511）：`(!proj && !init_valid) || (!proj && !borrowed && !op_consumes_definition(source,def))` → 判词（26513）`call var-out definition source mismatch fn=%.*s definition=%d source=%d call=%d slot=%d ownership=%d place=%d consume=%d srcvalid=%d consumed=%d stor=%d mstor=%d live=%d skind=%d tsrc=%d twant=%d prodsrc=%d prodwant=%d` + source CFG dump（26558-26584）。
- 投影源快放（26587-26588）：`source_is_projection` → true。
- representative（26589-26658）：`rep=consume[source]-1`；rep<0 且非借用且 consume 已证 → rep=def（26590-26597）；(rep<0 || other_slot) 且 source 借用族 → rep=-2（26603-26610，借出源不被调用消费，版本 NOP 是纯 call-happened 标记）；rep==-2 → true（26611-26615）；否则 `rep∉[0,op_count) || !op_consumes_definition(source,rep)` → 判词（26624）`call var-out definition representative mismatch fn=%.*s definition=%d source=%d representative=%d source_kind=%d source_place=%d source_ownership=%d source_origin=%d source_edge=%d representative_kind=%d representative_place=%d representative_ownership=%d representative_origin=%d representative_a=%d representative_a_kind=%d representative_b=%d representative_source=%d`。

### 1.10 与批 3 MEMORY_VERSION 臂的衔接

- 主审 MEMORY_VERSION 臂（cheng_cold.c:68805-68822，批 3 §1）调 `cold_exact_schema_var_out_definition_valid`（67445-67462）：证书位快道（`certified` 且非 verify 模式 → true；verify 模式下证书漂移 die `frozen exact var provenance certificate drifted`）→ 未证行落本分类器；false → 判词 `call memory version is broken call=%d formal=%d carrier=%d`。
- 槽层 MEMORY_VERSION origin 门（批 3 §2，70051-70090）：origin 须为同槽 NOP+MV 行且过本分类器且块内 current-at-predecessor。
- STACK_LOCAL NOP 形非 borrow-result 版本 → 转本分类器，判词 `call var-out definition is broken call=%d formal=%d carrier=%d`（批 3 §3，68824-68878）。
- canonical_root 的 MV 臂（56424-56431）要求四版本验证器之一，var-out 为其一。

## 2. 调用权威三族（发布器 `cold_publish_exact_call_var_out_definitions`，28436-29652）

### 2.1 骨架与门序

调用点 30749（var-arg reparse 后）。门序：状态门 die `call var-out definition state is invalid`（28444-28453）→ **`ColdBorrowResultContractProbe && callee 结果 BORROW_SHARED → 整体 return`（28454-28458，探针降级旁路，不移植）** → 解析绑定 die `call var-out resolved function binding is invalid`（28466-28477：function_row 反查、kind、op_a/op_b/op_c 与 arg 窗一致）→ 两两 var 实参 place 重叠 die `overlapping places cannot bind multiple var formals in one call`（28495-28518，`cold_var_places_overlap`）→ 逐形参主循环。

主循环首：槽头刷新（28540-28592）——倒扫同槽同 producer 最新行 best；仅当 `carrier_pins_version（COPY_I64 载体 source 钉版本）|| !snapshot_live || best_live` 才采用（28551-28563 注释：流式最新≠路径当前，sibling 分支行不得盖快照）；无版本行且槽权威哨兵 → `value_def_op_id=-1`（未初始化 cell，防跨 cell 串谱系）。

随后逐臂（对每形参）：`carrier_is_var_array`（28611-28645：ARRAY_I32 形参+var 限定+carrier==source 且 CSR 四列==source 行四列+owned/forwarded 两链 place 白名单）→ **可变性门**（28666-28716）：`!local->is_mutable_place && !exact_ref_object_member_place`（28654-28665：根 place 是 ref-object 且 carrier 为投影四种之一且 projection_carrier_valid）→ die `call var-out actual is not a mutable stack local`。注释（28646-28653）：LOCAL_ADDR 只证瞬态 ABI 载体，永不得把 `let`/byval 形参/全局升级为可变 place；全局 var 本身即可变 place（GLOBAL_ADDR 直写不朽全局存储），门只键可变性位。`storage==UNKNOWN → continue`（28720，标量无 nominal 身份）。

### 2.2 @borrow_result var root 臂（28721-28863）

契约合取 `exact_borrow_result_root_formal`（28721-28736）：callee `result_ownership_summary==BORROW_SHARED && root_kind==FORMAL && root_formal_index==param_index && (formal_mask==0 || (param_index<32 && formal_mask==1<<param_index)) && root_global_row==-1 && root_read_only_proof==READ_ONLY_PROVEN`（singleton-only，注释 28728-28729）。

成立 → `cold_exact_borrow_result_var_root_call_valid`（24468-24724）不过 → die **`@borrow_result var root call authority is not exact`**（28856，无字段，诊断在 env 门 28742-28854，不移植）。过 → **`continue`，不发 post-call 版本行**（28858-28863 注释：callee CFG 全证此形参不可 rebinding/mutation 其 owner，精确 LOCAL_ADDR 投影仍是调用/结果根，owned 本地保持入参版本；发版本行会谎称发生 mutation）。

`var_root_call_valid` 合取（24473-24723）——参数门（非 global、is_mutable_place、callee 五槽全等、return_exact_type_id>=0）+ 三种载体形：`carrier_is_local_address`（24527-24532）/ `carrier_is_forwarded_var_parameter`（24539-24557：source 的 `var_owner_root` 是 PARAM 且 value_kind 是 ref 族、source 行 BORROW_UNIQUE 同槽、carrier COPY_I64(a=slot,b=0,c=0)、`unique_var_param_authority_valid(source)`）/ `carrier_is_exact_projection`（24571-24582：投影三种 + projection_carrier_valid + `projection_terminal_authority_root(carrier)==source`）+ 身份链（identity_slot/kind/type/storage 按投影形切换 24583-24605）+ **主合取**（24611-24692）：function_row 回绑、source<carrier、formal_is_var、ref kind、source storage/type 非 UNKNOWN、`var_formal_value_type_ids_same`、`initialized_var_source_valid(source, call_op, slot, type, storage)`、三形析取、`dst[carrier]==carrier_slot`、槽 kind==formal_kind、size==8、carrier 行全 tuple（def_slot==carrier_slot、type==param_exact_type_id、producer 同体、place==BORROW_PROJECTION、own==BORROW_UNIQUE、origin==projection_origin、consume==0、source==-1）、CSR 四行==carrier 车道、槽四列（type/place==BORROW_PROJECTION/origin 三析取含 owner_root 归约 24672-24681/storage）、`reaches(source,carrier) && reaches(carrier,call)`、**`cold_exact_borrow_result_call_root(function, call_op)==carrier_op`**（结果根必须正是此载体）、`source[call_op]==carrier_op`、carrier 与 call 同块（24716-24723）。

### 2.3 callee CFG 全证 = read_only 推导（cheng_cold.c:104566-10582 → cold_parser.c:57967-58353）

derive 时对 formal_mask 每成员调 `cold_borrow_result_formal_root_read_only(body, symbols, formal)`：

1. PARAM 根唯一（57986-58039）：全 op 扫 place==PARAM && origin==formal，必须恰好一行且过 `param_definition_edge_valid`、type==param_exact_type_id、producer 同体。
2. 不动点闭包（58064-58176）：`dependent_definition[op]`（source 边 / BORROW_PROJECTION origin / CFG_MERGE op_b 三通道依赖传染）+ `alias_slot[slot]`（root 槽+raw 形参槽起，alias-producer kind（`cold_borrow_result_root_alias_producer_kind`）且（source alias ∨ 精确 alias 投影 ∨ 标量借用投影根 dependent）且目标槽 pointer-like/ref-kind 时传染）；迭代预算 `op_count+slot_count+1` 超 → false（58080-58098）。
3. 全 op 扫描拒绝集（58181-58353，任一即 false）：dependent 行 consume!=0（`dependent consume/release`）；非根行 dst∈{root_slot, raw_root_slot} 且非 NOP（`root slot rebind`）；mutation 目标槽 ∈ alias_slot（`root alias mutation`，`cold_borrow_result_mutation_target_slot`）；dependent consume-only 边（`dependent consume-only edge`）；调用实参 root-related 时——var 形参 callee 必须自身五槽全证（`unproved mutable call`，58277-58293），非 var 形参必须 `callee->borrows_args && def>=0 && arg_own∈借用族`（`unproved borrowed value call`，58294-58304）。

这就是「callee CFG 全证不可 rebinding/mutation → 保持入参版本」的 C 实现全貌。

### 2.4 全局臂（28865-28899）

`local->is_global && value_def_op_id>=0` → `cold_exact_global_var_call_authority_valid(global_def, carrier, call_arg_row, call_op)`（28389-28434）：global_def 是 GLOBAL_ADDR+GLOBAL+BORROW_SHARED+origin>=0+consume==0+`is_live_before_op(call)`；CSR 四行==carrier 车道（def==carrier、slot==dst[carrier]、place==BORROW_PROJECTION、own==BORROW_UNIQUE、origin==origin[carrier]）；carrier 行 BORROW_PROJECTION+BORROW_UNIQUE+projection_carrier_valid+`unique_projection_source_untouched(carrier, call)`；终 `projection_terminal_authority_root(carrier)==global_def`。不过 → die **`call var global source is not live unique authority`**（28897，无字段，诊断 28875-28896 不移植）。全局实参**永不发 post-call 版本行**（29584-29588 注释：callee 写入已经 GLOBAL_ADDR 落到全局存储，版本 NOP 只会错锚 STACK_LOCAL 形定义到全局影子）。

### 2.5 shared-borrow 臂（28900-28914）

`call_arg_ownership==BORROW_SHARED` 时：`cold_exact_shared_borrow_var_call_valid`（23111-23230：LOCAL_ADDR/GLOBAL_ADDR 完整地址载体、def 行 BORROW_SHARED 全 tuple、CSR 四行一致、live_before_call、同块、ref-object formal 身份五件）不过 → die `call var shared-borrow authority is not exact`（28905）；**随后无条件 die `borrowed managed local cannot bind a rebindable var formal`（28913）**——共享借用实参绑可变 var 形参必拒，前门只决定判词族。Cheng 侧须同构：此臂是负例族判词分流器，不是放行路径。

### 2.6 投影实参臂（28915-29031）

`call_arg_own==BORROW_UNIQUE && !var_array && !global && carrier∈{FIELD_REF, SEQ/ARRAY_OPAQUE_INDEX_REF_DYNAMIC}`：`exact_live_ref_object_member`（28934-28945：ref-object member place + CSR def==carrier + projection_definition_valid + unique_projection_root_valid + source_untouched + live_before_call）或 `cold_exact_unique_borrow_root_live_at_call(carrier, call_op)`（22325+，见 §2.7）必须一真；`staged_copy_of_carrier`（28950-28961：ABI staging COPY_I64 的 source 钉 carrier 且槽/类型同身份）可替代 CSR def==carrier。否则 die `call var projection root is not a live mutable place`（29030）。注释（28925-28933）：直接字段/下标实参无 LOCAL_ADDR 载体，用与命名 unique alias 相同的投影到根全证；ref-object 绑定冻结指针 cell 而非载荷，非 var 根为共享借用时也可借出一个精确子投影。

### 2.7 W8 unique-borrow 臂（29032-29090 → 23488-24460 域）

`call_arg_own==BORROW_UNIQUE && !var_array && !global`（非投影载体形）→ `cold_exact_unique_borrow_var_call_valid` 不过 → die **`call var unique-borrow authority is not exact`**（29082，诊断 29040-29080 不移植）。过 → 落公共载体/formal 检查 + 发 post-call 版本行（29084-29089 注释：唯一借用根于可变栈本地+精确 dataflow-live 定义链+LOCAL_ADDR 载体，rebinding 声音）。

谓词内部（23488+）：
- 快照修正三连环（23508-23610）：(a) 快照已被 consume 且 consume<call → 倒扫同槽最新行（23514-23526）；(b) unique CFG_MERGE 不 current 于调用 → owner_root 同槽且 current 则改用 owner_root（23534-23557）；(c) 快照不 reaches 调用 → 唯一 reaches&&current 的同槽生产者替补，多于一个则 -2 弃（23565-23610）。
- 定义接受析取 `definition_is_memory_version`（23729-23741）：native_sequence 版本（23620-23631）/ scalar_var 版本（23632-23639）/ shared 版本（23681-23701：MV+{PLAIN,SHARED,MOVE}+origin 同槽前行+type 等+root_live）/ unique 版本（23710-23728：同构 BORROW_UNIQUE）/ **分类器真**（23734-23740：MV+UNIQUE+`cold_exact_call_var_out_definition_valid`）/ var-out 证书位（23640-23645）；另有 `definition_is_unique_merge`（23612-23619：CFG_MERGE+UNIQUE+`unique_borrow_merge_authority_valid`）、`definition_is_unique_projection`（23742-23749）、`oxa_frame_owned_unique`（23655-23661：未消耗同槽 UNIQUE 纪元=帧独占当前视图）。
- `carrier_is_exact_local_projection`（23750-23779）：LOCAL_ADDR(a=slot,b=0,c=0) 且（origin[carrier]==def 或 owner_root 归约相等+projection_carrier_valid 或未消耗同槽纪元豁免 23766-23779）。
- 尾部（23857+）：carrier 形成立时做 formal/ABI/身份全字段 + `definition_is_independent_borrowed_local_cell` 等（23857-24460 域，与 §1.6 同族字段门）；判词级诊断 `exact-var-forward gate ...` 仅在 env 下（23812-23856，不移植）。
- `cold_exact_unique_borrow_root_live_at_call`（22325-22470）：入口全字段门（type/producer/own 域；SHARED 根仅 GLOBAL place / bridge-cast / ≤8 跳 COPY_COMPOSITE re-share 继承三豁免 22339-22376）+ `current_at_call = is_current_at_predecessor(def, call_block, call)` + `historical_reaches_slot_head` + `live_before_call` + `exact_current_merge_authority`（22409-22422：current 且 CFG_MERGE 且（UNIQUE+借用 merge 权威双析取 / MOVE|PLAIN+owned merge 权威））+ var-out 证书位（22423-22427）。

### 2.8 公共门与发布（29091-29651）

- 公共载体门（29139-29187）：`carrier>=call || !四形任一 || call_arg_slot 越界 || dst[carrier]!=call_arg_slot || (local_addr && !sentinel && !local_proj_auth && !裸 BORROW_PROJECTION 形 29150-29156) || (projection && !proj_auth && !plain_place_valid)` → die `call var-out actual carrier is not exact`（29186）。
- 投影根重锚（29188-29200）：`source_definition = origin[carrier]`（parser local 可能还指着 sealed merge 前的旧分支定义）越界 → die `call var-out projection root definition is invalid`。
- plain 投影边界（29219-29240）：formal_var+sentinel+kind/size 全等 → `continue`（非托管标量/定长元素无 owned 载荷，发托管 MV 会捏造所有权事实）；形错 → die `plain var projection boundary is not exact`。
- formal/actual 身份门（29251-29296）→ die `call var-out formal/actual identity is not exact`。
- 未初始化源（29302-29364）：槽列回收（MV 槽头未消耗行）→ 恢复；`!slot_authority_sentinel && !stale_closed_cell_state` → die `uninitialized call var-out slot has exact authority`。
- 根活性（29365-29582）：投影/全局/转发形 `cold_exact_var_out_source_live_at_call(source, call_op)`（22768+）或单写者事实（parser 表钉此行为当前定义且行钉同 cell，29380-29386）；LOCAL_ADDR 形走 `cold_exact_initialized_var_source_valid` 系（29500-29582，含 `oxa_init_merge_phi_current` 单写者 phi 豁免 29550-29579）→ die `initialized call var-out source is not exact and live`（29581）。
- 发布（29589-29651）：`cold_publish_exact_call_var_out_definition` 发投影 cell 版本行；**投影载体补发根 cell 版本行**（29602-29647：`cold_body_insert_op_after_in_block(definition)`，root=def+1，NOP/dst=local->slot/a=call_op/b=param_index/c=definition/MV/BORROW_UNIQUE/origin=prior||root/source=prior/证书位=1；**consume 只写同槽 tie**（29636-29641：`prior>=0 && prior<root && def_slot[prior]==def_slot[root] && consume[prior]==0` → `consume[prior]=root+1`，跨槽谱系走 origin/source 列））；非投影或同槽时 `local->value_def_op_id=definition`（29648-29650；29595-29600 注释：投影实参 mutation 的是根的字段，根本地身份不变）。

### 2.9 墙3 store 爬升 + 帧自有第三处接线（82776-82926）

`cold_parse_store_field_path_into_ref_exact`（82776；80123 为前向声明，83554 为公开 wrapper）：`base_authority` 进函数后先判 `exact_unique_root`（82797-82807：place==BORROW_PROJECTION→`unique_projection_root_valid(vdo)`，否则→`unique_var_param_authority_valid(vdo)`）；不成则 **MV 纪元爬升**（82813-82877）：前置 `place==MEMORY_VERSION && vdo∈[0,op_count) && own==BORROW_UNIQUE && def_slot[vdo]==base_ref_slot && consume[vdo]==0`；`walk=source[vdo]`，至多 64 跳，每跳四分派——BORROW_PROJECTION+SHARED → **`cold_exact_shared_projection_roots_frame_owned(walk)`（帧自有谓词第三处接线，82839-82841；前两处=批 3 §5.2 门 1 的 29869-29878 与门 2 的 30427-30432）**；BORROW_PROJECTION 非 SHARED → `unique_projection_root_valid`；STACK_LOCAL/TEMPORARY → 槽约定（own∈{MOVE,PLAIN} && origin==slot，82847-82860）；其他 → `unique_var_param_authority_valid`。终止：`exact_unique_root || place[walk]!=MV || def_slot[walk]!=base_ref_slot`；`next=source[walk]`，非严格下降 break。
随后 `unique_index_authority`（82904-82913：base_authority 槽/kind 钉 base_ref_slot+`op_tuple_matches_result`+UNIQUE+exact_unique_root）或 `ref_handle_authority`（82914-82917）必须一真，否则 die **`indexed element field store lacks exact unique base authority`**（82923，无字段；`[iba]/[iba2]/[ibm]` 探针 82920-82922 不移植）。墙3 案例（ANALYSIS §2）：`MakeFillText` 构造臂 retained SHARED 投影（712）+ 未消耗 MV 纪元（717），walk 第一跳即走新接线。

## 3. seal root + canonical_root

### 3.1 `cold_borrow_result_seal_root_definition_impl`（55679-56040；wrapper 56041-56051）

- 预算：**`depth > op_count + 16` → -1**（55684）；wrapper 只查 `depth<0`/越界（56046-56050）。内部子循环另有 16 跳预算（55887 mutation 载体归约、55963 槽别名归约）。
- 臂序（严格按行）：
  1. **callee 契约优先**（55703-55711）：kind∈{CALL_COMPOSITE, CALL_PTR} → `cold_exact_borrow_result_call_root(callee, def)`（2721-2855，见 §4.4）>=0 即返回。注释：借用调用结果的权威来自 callee 声明契约，而非发射端 staging 源行——先问 callee 防 versioned 边抢占权威答案。
  2. versioned source 边（55712-55714）：`usr=source[def]>=0 && usr!=def` → 递归。
  3. 形参入口拷贝（55715-55721）：`shared_borrow_param_definition_valid(def, def_slot)` → 自身即稳定根。
  4. 逐字借用 staging 拷贝（55726-55739）：COPY_I64/COPY_COMPOSITE + place==BORROW_PROJECTION + source<0 + c==0 → 倒扫 `dst==op_a && def_slot>=0` 的首行递归。
  5. **REF 形白名单**（55758-55782）：kind∈{FIELD_REF, PAYLOAD_LOAD, SEQ_STR_INDEX_DYNAMIC, SEQ_OPAQUE_INDEX_DYNAMIC, SEQ_OPAQUE_INDEX_REF_DYNAMIC, ARRAY_OPAQUE_INDEX_DYNAMIC} → source 边递归；否则投影契约（a=base 槽，c=offset 非定义 id）倒扫 `dst==carrier && reaches(q,def)` 递归；无 → -1。
  6. 形参物化行（55794-55820）：COPY_COMPOSITE/COPY_I64 + place==PARAM + source<0 → `origin∈[0,param_count) && a==param_slot[origin] && c==0 && slot_kind[param_slot[origin]]∈{OBJECT, STR, OBJECT_REF, STR_REF}` → 自身。注释（55783-55793）：`var T` 形参是按引用传的隐式独占借用，物理解引用仍根在形参；**标量/序列槽（I32/I64/PTR/SEQ_*）无单一托管权威，永不成根**。
  7. owned 生产者块（55823-55872）：kind∈{MAKE_COMPOSITE, CALL_COMPOSITE, CALL_PTR, COPY_COMPOSITE} 且（own∈{PLAIN,MOVE} 或复合 kind）——COPY_COMPOSITE：source 边递归，否则倒扫全部 `dst==a[def] && def_slot==a[def] && reaches` 写者，**merge_root 全体一致**（任一 -1 → -1；不一致 → -1，55845-55861）；调用 kind 再试 `borrow_result_call_root`。
  8. 非 MAKE_COMPOSITE → -1（55873-55874）。**MAKE mutation 扫描**（55878-56020）：顺扫 `q>def` 的 PAYLOAD_STORE，载体经 ≤16 跳归约（FIELD_REF 投影→a[proj]；COPY_COMPOSITE 别名→其 source/槽；零跳直写 `base==dst[def]` 即中）命中本 make → 值槽 `a[q]` 的最新写者 wdef（倒扫）再经槽别名归约（≤16 跳 NOP/COPY 无 source 边跟 op_a；无写者时找形参入口物化行 55982-56000）→ 递归 r4；**全部贡献根须一致**（r4<0 或 ==def 跳过；不一致 → -1）。mroot>=0 → 返回。
  9. 终末（56021-56039）：place∈{PARAM, GLOBAL} → 自身；MAKE_COMPOSITE + place∈{TEMPORARY, STACK_LOCAL} + own∈{PLAIN,MOVE} → 自身（owned 本地构造即自身 canonical 权威——每个归属 store 要么上面贡献了 sealed 托管根，要么只带标量载荷）；否则 -1（**借用构造在此硬失败**）。
- 消费点：`cold_exact_unique_projection_root_valid` 首选权威（cheng_cold.c:61122-61125）+ TEMPORARY 根豁免（61163-61165）；`cold_exact_projection_terminal_authority_root_definition`（55213+ 域）经 canonical_root。

### 3.2 `cold_borrow_result_canonical_root_definition_impl`（56340-56529）

入口（56343-56359）：`def_slot∈[0,slot_count) && type>=0 && producer 同体 && own∈{SHARED,UNIQUE,PLAIN,MOVE}`，否则 -1。臂序：`owner_root_valid(def)` → 自身（56360-56364）；place∈{PARAM,GLOBAL} → 自身；owned 生产者（MAKE/CALL_COMPOSITE/COPY_COMPOSITE + PLAIN|MOVE）→ 自身（56371-56382）；**视图临时**（56390-56410）：无 source 且 kind∈{FIELD_REF, PAYLOAD_LOAD, STR_SLICE} → op_a 载体槽的 reaching 写者递归（op_c 永非定义 id）；BORROW_PROJECTION → 递归 origin（56411-56416）；**MEMORY_VERSION**（56417-56436）：root=source>=0?source:origin，`root∈[0,op_count) && root!=def && 四版本验证器之一（native_seq/scalar_var/fixed_array/**call_var_out**）` → 递归；STACK_LOCAL 且（NOP 或 `borrow_result_local_copy_valid_at`）→ 递归 source（56437-56447）；**CFG_MERGE**（56448-56481）：`borrow_result_cfg_merge_sources(def, &first, &second)` 不过 → -1；UNIQUE 时先试 `var_owner_root` 的 canonical 快捷（56456-56469）；**两臂 canonical 必须同行**否则 -1；TEMPORARY 限定三种：STR_SLICE（56484-56504：root=source，槽 STR、type/行域/a==def_slot[root]/reaches 全门）/ CALL_I32|CALL_COMPOSITE（56505-56521：callee 必须 `BORROW_SHARED && borrows_args`，递归 source）/ MAKE_COMPOSITE（递归 source）；其他 → -1。

### 3.3 §5-4 对照：Cheng freeze 只校验的不变量全集

设计 §5-4 裁定：Cheng 无 NOP/MV 行且「lowering 已解析 owner 物理行并证先序；TypedExpr 强制 owner 行单调无环」，seal 递归+深度预算整体**由上游不变式替代**。Cheng 侧 freeze 只校验（不重走）时应验的不变量全集：

1. **输入即权威**：每借用定义行的 borrowOwner 物理三元组（domain∈{形参物化/全局/帧内 owned 构造}, ownerRow int32, ownerTypeId）已由 lowering 解析落列；freeze 逐行核 domain 合法、ownerRow 行域内、ownerTypeId==定义行 TypeId。
2. **单调无环**：TypedExpr 冻结列保证 ownerRow<dependentRow（或携带 lowering 的显式先序见证）；`op_count+16` 深度预算与 16/64 跳内预算**结构性多余**，不移植。
3. **承认集终态封闭**：owner 链终态只能是 §3.1-9 三种（PARAM 物化/GLOBAL/owned 本地构造 PLAIN|MOVE）；merge 双输入 owner 必须同一物理行（对应 56478-56480 双臂一致 + 55845-55861 merge_root 一致 + 56014-56015 mutation 贡献一致三处「一致才收」）；借用构造无终态 → hard fail（对应 56039 return -1）。
4. **拒绝面保持**：标量/序列槽不成根（§3.1-6 白名单反面的 Cheng 等价：owner domain 非托管种类即拒）；callee 契约优先序（§3.1-1）转为程序契约表直读（§4）。

## 4. 程序契约表（FnDef `borrow_result_root_*` 五槽）

### 4.1 槽位与填充/消费全景

五槽（cheng_cold.c:20430 声明区）：`borrow_result_root_kind`（UNKNOWN/STATIC/FORMAL/GLOBAL）/ `_formal_index` / `_formal_mask`（32 位形参集）/ `_global_row` / `_read_only_proof`（UNKNOWN/PROVEN）。填充点：解析默认（23502）、模板特化拷贝（27344-27348）、CID 指纹标量（23918）、**唯一推导点 `cold_function_contract_derive_borrow_result`**（104235-10618，发布在 10609-10618）。消费点（全枚举）：var root 门（cold_parser.c:28721-28736）、var_root_call_valid（24486-24494）、read_only 扫描内 var-形参调用豁免（58282-58289）、`cold_exact_borrow_result_call_root`（2727-2854）、managed_call_result PLAIN 借用边（cold_parser.c:2883-2922：STATIC 保持 owned-plain 发布，动态根结果发 BORROW_SHARED 戳+`source[call]=borrow_root`）、seal root callee 优先臂（55703-55711）、canonical_root 调用臂（56505-56521）、seal 发布区（57689-57930：alias 继承/校验）、external 校验（105266-105274）、模板一致性（17838/17941/17974/21980/24488）、derive 外 consult（59827/69815/69916/79031/79269）。

### 4.2 derive 全流程（cheng_cold.c:104235-10618）

1. 快照指针 `encoded = expected_borrow_contracts + row*5`（104241-10446），缺 → reject `borrow-result comparison snapshot is missing`。
2. OWNED 结果：五槽必须全 UNKNOWN/-1/0/-1/UNKNOWN 否则 reject `owned result carries borrow-root metadata`，return（104252-10466）。
3. 非 BORROW_SHARED → reject `result ownership summary is invalid`；无完整 CFG（!body || block_count<=0 || term_count<=0）→ reject `borrowed result lacks a complete CFG`（104273-10478）。
4. BFS 可达块（BR/CBR/SWITCH 边校验 104300-10389：switch 边窗属于性+连续性双门；UNREACHABLE 跳过；非 RET → reject `reachable terminator kind is invalid`；块无 term → `reachable block has no exact terminator`；队列超 block_count → `CFG reachability budget exceeded`）。
5. 逐 RET（104390-10538）：`def=term_source_value_def_op_id`——-1 时托管返回 domain（10 种）或裸 ptr 结果必须 `cold_borrow_return_term_is_exact_nil` 否则 reject `managed borrowed RET sentinel is not exact nil`，记 saw_static；静态串字面量 → saw_static；裸 ptr → `scalar_borrow_projection_root`；否则要求 `type[def]==return_exact_type_id && borrow_result_root_valid(def)` → `canonical_root(def)`；root 越界 → reject `reachable RET canonical root is missing`。root place==PARAM：`dynamic_kind==GLOBAL || origin∉[0,arity) || origin>=32 || param_exact_type_id<0 || !=type[root]` → reject `formal borrow root identity is invalid`；否则 `dynamic_kind=FORMAL, formal_mask|=1<<origin`。place==GLOBAL：重算全局 TypeId（global_probe.ret=globals[origin].type_name 过 `cold_exact_return_type_id_from_signature`），`dynamic_kind==FORMAL || origin 越界 || type<0 || !=type[root] || (global_row>=0 && !=origin)` → reject `global borrow roots are inconsistent`；否则 `dynamic_kind=GLOBAL, global_row=origin`。其他 place → reject `canonical borrow root is not a formal or global`。
6. 收口：`return_count<=0` → reject `borrowed function has no reachable RET`；UNKNOWN && !saw_static → reject `borrowed function has no return root`，否则 STATIC；FORMAL && mask==0 → reject `formal root set is empty`；**FORMAL 每成员过 read_only（§2.3）不过 → reject `formal borrow root is not read-only`**，全过 → `read_only=PROVEN`（104566-10582）；`formal_index`=mask 最低位。
7. 五元组与快照逐字段比对（10592-10605）不等 → reject `serialized borrow-result five-tuple does not recompute`；**只发布独立推导的元组**（10606-10618 注释：借用 callee 按精确 DAG 序对后续调用方证明可见；任何调用方观测不到 encoded 快照）。

### 4.3 expected_borrow_contracts 快照 + admit_row 顺序无关化（105386-10495）

- `cold_require_function_contract_admission`：`state=calloc(count)`（0 未入/1 在栈/2 已认），`expected_borrow_contracts=malloc(count*5*int32)`（105405-10421）。**先全表快照五槽（105422-10440）**，再把选中非 external 且 BORROW_SHARED 的函数五槽复位 UNKNOWN（105441-10458）——推导结果必须与「解析期序列化进 FnDef 的五槽」逐字段重算相等（§4.2-7），这就是顺序无关化：函数行序/推导序不得影响可见契约。
- external 先行 derive borrows_args（105467-10477 注释：external 无 Cheng body，须在任何调用方 BodyIR 校验 call-arg ownership 前封 parser/facts 效应权威）。
- `cold_function_contract_admit_row`（105045-10384）：state==2 直返；**state==1 → reject `borrow-result callee graph contains a cycle`**（105050-10554）；arity 门；逐形参 TypeNode 建图 + kind/size/TypeId/object_is_ref 重算（105072-10165）不等 → reject `formal ABI or exact TypeId does not recompute`；return 同理（`return has no exact TypeNode` / `return ABI or exact TypeId does not recompute`）；default 无 parser origin → `parameter default lacks parser-owned wire identity`；declaration origin 投影三判词；`ffi_owned_result_free` → reject；derive_borrows_args → external 五槽必须全 UNKNOWN 域；递归 admit borrow-result callee（105362-10363，callee 越界 → `borrow-result callee is outside admitted Function rows`）；**derive_borrow_result（105365）**；identity schema 主审（105367-10376，批 3 §0 第三调用点）；释放 dominators/consumer-index/frozen-facts 缓存；state=2。
- 收尾：free + NULL（105486-10488）；`type_graph->node_count` 增长 → reject `admission discovered a TypeNode missing from the frozen graph`。

### 4.4 `cold_exact_borrow_result_call_root`（cold_parser.c:2721-2855）

调用点侧契约直读：callee 必须 BORROW_SHARED 且 return_exact_type_id>=0 且 `managed_type_id(dst[call])==return_type`；FORMAL：singleton（mask==0||mask==1<<index）走 `..._for_formal(index)`；multi-root 要求每成员解析到已证借用实参且**全部 canonical 到同一根**且该根 reaches 调用（2806-28026）；GLOBAL：`formal_index==-1 && global_row∈[0,global_count)`，扫 `[0,call)` 内 place==GLOBAL && origin==global_row && SHARED && reaches 的定义**必须恰好一行**（2849 重覆 → -1）。

### 4.5 §3.4 对照：Cheng ExactProgramContract 每列推导规则

不重建状态机。程序级侧车五列（批 1 侧车扩列），在 compiler_csg 全程序门 seal；TypedExpr 冻结列已存在：`functions2_resultExprClasses`（typed_expr.cheng:1252，Owned/Borrowed，59225/59412/59627 由 `scope.borrowResult` 落）、`borrowResults: bool[]`（signature/scope 行，typed_expr.cheng:691/36845/36884）、`functions2_manualConsume*`（1253-1261，Presents/Target/Source ordinals/rows/TypeIds/EffectCids），compiler_csg 已校验 resultExprClass↔annotation flags（compiler_csg.cheng:9126-9156）。推导规则（对照 §4.2 逐条重证，输入换 TypedExpr owner 列）：

- `rootKind`：`resultExprClasses[row]!=Borrowed` → UNKNOWN（且其余四列须 -1/0/-1/UNKNOWN，对应 OWNED 门）；Borrowed 时扫该函数 RET 节点集（`functions2_returnNodeIndexs`+`functions2_valueDefinition*` 物化 owner 行）：全部静态（nil/静态串）→ STATIC；owner domain 全形参 → FORMAL；全同一全局行 → GLOBAL；混合/无 → hard fail（对应三判词）。
- `formalIndex/formalMask`：FORMAL 时逐 RET 的 owner 形参序并 mask（origin<32、TypeId 与形参冻结 TypeId 相等，对应 `formal borrow root identity is invalid`）；index=mask 最低位。
- `globalRow`：GLOBAL 时唯一全局行（TypeId 重算相等、行唯一，对应 `global borrow roots are inconsistent`）。
- `readOnlyProof`：FORMAL 时对 mask 每成员验 TypedExpr 函数体 owner 图——等价 §2.3 四拒绝集（dependent consume / 根槽 rebind / 别名 mutation / 未证可变调用）在 TypedExpr 物理 owner 行上的重述；manualConsume* 行提供 consume 事实。全过 → PROVEN。
- 顺序无关化：推导只读冻结列，天然顺序无关；快照重算比对（§4.2-7）在 Cheng 侧转「推导列==TypedExpr 冻结列直读结果」的恒等校验，callee 图环由 TypedExpr owner 行单调结构性排除（`borrow-result callee graph contains a cycle` 真空，不移植）。

## 5. 证据目录对照

- **varout-authority-20260825/**（无 ANALYSIS.md）：receipts/fixtures_rc.txt——6 smoke（array_element_field_assign / cold_nested_ref_seq_index_store / seq_element_field_writeback 绿；b2_writer_units_dispatch / cold_bootstrap_slice_object_field_index / x64_f64_call_frame_layout 树中间态 rc=2）修前修后 rc 全同、w3neg1 rc=2 同拒；fixtures_verdict.txt 判词 md5 修前修后逐对同；driver_rebuild.rc 在档；work/ 持 `cold_parser.varout-authority.patch` + before/after 双快照 + negmut-guard-disabled-red-return.err.gz（负例：禁 negmut 守卫回归）。= 分类器主体（§1）+ forwarded/global/projection 权威合取（§1.6）落地的回执域。
- **wall6-varout-20260825/ANALYSIS.md**：§2 行级根因（706/712/713/714/715/716/717 七行谱系）——第五分类断点（carrier=NOP MV、def_slot≠value_slot → S4 struct-fail）；§3 根修=第五分类+S4 析取扩臂+根行早返回 helper（§1.4-1.5 逐条对应）；§4 四件套：4+1 个 indexed-store 族 smoke 零漂移、w3neg1/w3neg1-inroot 同拒、驱动重建 rc=2（墙6 判词 0 命中，新首红=read-edge freeze 族 12 条，批 2 域）；**§6 明示 depth2 `@borrow_result var root call authority`/W8 仍被遮挡未枚举**——批 5 夹具负例面须自备，不能援引墙6 回执宣称这两族已绿。
- **wall3-call-authority-20260825/ANALYSIS.md**：帧自有谓词「一处定义三处接线」全案（墙3 walk=§2.9；墙4 双门=批 3 §5.2 门 1/2）；w3neg1-negative-fixture.cheng 负例夹具在档（@borrows 函数内 param 借用传 byval 必拒，PARAM 根不在承认面）；§7 逐墙状态。批 5 负例夹具固化时直接取 w3neg1/w3neg1-inroot（设计 §7-5）。

## 6. Cheng 基板差异提醒

**五种写回物理形态逐形态重证要点**（Cheng 无 NOP/MEMORY_VERSION 行，BodyOpKind 见 core_types.cheng:121-141；分类器五分类按物理形重组）：

1. **CopyLocal 写回**（≈C LOCAL_ADDR 载体形）：Cheng 形 = 调用后 BodyOpCopyLocal/StoreLocal 写回 var cell。重证点：call-arg CSR 行与写回行的槽/TypeId 同一；载体（地址投影）的 origin 归约到该 cell 当前定义；哨兵载体（未初始化）与 initialized 投影的 split（对应 26038-26053 注释）——Cheng 无 sentinel tuple，转「载体定义行存在且过投影权威」单判。
2. **FieldStore 投影写回**（≈C projection 载体形）：BodyOpFieldStore/IndexedStore 经字段/下标地址投影写回。重证点：投影槽身份绑定 formal（投影槽 == call-arg 槽、TypeId 等、own==UNIQUE，对应 26157-26168）+ 根 cell 活性（对应 29365-29386）；「同根诱饵槽非权威」子句必须保留。
3. **sret forward**（≈C forwarded COPY_I64 形）：调用方 var 形参透传。重证点：载体是不可变借用定义（PARAM+BORROW_UNIQUE 或全局投影重用全证，26100-26153）；consume 四析取（空/本行/互斥对/other_slot）转批 2 consume 通道直读；source 为投影时 place 必须 BORROW_PROJECTION（26142-26144）。
4. **out 直写**（≈C var_array_local 形）：帧驻定长数组直传。重证点：无地址载体行——call-arg 四列==数组本地当前定义四列、owned/forwarded 双链 place 白名单（28611-28645）；块门豁免（26394-26403：载体块可与调用块不同，活性由初始化源证）。
5. **投影 publication**（≈C 第五分类两行组）：Cheng 物理形 = 投影槽 post-call 定义 + 根 cell post-call 定义的发布组（space 约束：同调用同形参、根行物理居后，批 4 §4 同款时序转空间）。重证点整体迁移 root publication helper（§1.5）：两 arm 形、帧自有/唯一投影根、field_carrier 环闭合（`a[field_carrier]==dst[arm]`）、递归深度=发布组内物理序（op 严格递减由 space 约束保证，memo 不移植）。

**与批 2 walker 共享面**：`reaches/is_current_at_predecessor/is_current_at_consumer/is_live_before_op`（late-merge 臂、root-live、初始化源）、互斥消费者对、consume 列四通道（representative 三段、source_consume 析取、other_slot 形）——同源单遍产出，批 5 只读不重建；`cold_exact_initialized_var_source_valid`/`var_out_source_live_at_call`/`unique_borrow_root_live_at_call` 的活体子句是 walker 查询的消费者。

**与批 3 identity 共享面**：MEMORY_VERSION 臂交接（§1.10）——Cheng 侧分类器落 `exact_def_call_authority.cheng`，主审 MV 臂经统一 helper 调用，判词 `call memory version is broken`/`call var-out definition is broken` 字段序不变；帧自有谓词四处接线（批 3 两处 + §1.5 + §2.9）必须同一 helper；`param_definition_edge_valid`/`unique_projection_root_valid`/`var_projection_carrier_valid`/`storage_authority_for_slot`/`var_formal_value_type_ids_same`/`managed_type_id` 全部批 3 单实现复用；证书位（`exact_var_provenance_certificates`）在 Cheng 无对应物——其语义=「本行已过分类器」，由 freeze 单遍归纳顺序替代（先证先行，对应 26833-26837 注释），verify 模式判词 `frozen exact var provenance certificate drifted` 真空不移植。

**批 4 merge 事实消费点**：late-merge 臂六连（owned/借用 merge 权威、projection_consume_keeps_slot、successor_at_call，§1.7）；W8 unique merge（§2.7）；root publication 的 CFG_MERGE arm（§1.5）；`oxa_pub_merge_phi_succession`/`oxa_init_merge_phi_current` 两条 phi 豁免（§1.9/§2.8——Cheng 无 relocation shell，但「自根 phi+consume 互指+槽头互指」继任形必须保留重证，转 merge 定义区间物理居首 + 互指列直读）；canonical_root CFG_MERGE 双臂一致（§3.2）；`var_owner_root` 归约（§2.2/§2.7）是批 4 owner 链事实的只读消费。

**判词零漂移口径**：批 5 五条判词逐字保留（`@borrow_result var root call authority is not exact` / `call var unique-borrow authority is not exact` / `call var-out definition authority mismatch ...` 九字段 / `call var global source is not live unique authority` / `indexed element field store lacks exact unique base authority`）+ `call var-out definition index structure mismatch ...` 八字段（重证后按 Cheng 形态填字段，设计 §6 注）+ 程序契约五槽校验文本沿用 C reject 文本（§4.2-7/§4.3 各条）。die 族无字段判词（§2.2/2.4/2.5/2.6/2.7/2.9）同样逐字。

## 7. 探针/降级残留不移植清单

`([voimpl])`、`([voret]) r23128-r23543 系列`、`([vomis])`、`([vos])`、`([vobool])/([vobool2])/([vobool3])`、`([vostage])`、`([voenter])/([vofail])`、`([pub])`（29601，墙6 ANALYSIS 已标注探针残留）、`([x22])/([w22])/([d3])/([pe])/([pe2])/([fm])/([pre9])/([own9])/([dl9])/([cgr])/([plw])/([r4p])`、`([crx])/([cr2])`、`([bre])/([brg])/([brh])/([br4])/([br5])`、`([ret])`、`([uxv])/([uxq])/([uxr])/([uxs])/([uxp])`、`([iba])/([iba2])/([ibm])/([ibn])/([ibo])`、`([mv])`、`([oxa*])` 全部；env 门 `CHENG_COLD_DUMP_BODYIR`/`CHENG_OXA_DIAG`/`CHENG_COLD_DUMP_VAR_FORWARD`；**`ColdBorrowResultContractProbe`（cold_parser.c:47，28454-28458/2893/2962/55028/58355/58445/73012/73774+/74161 共 11 处）是契约推导期降级旁路——生产严禁，Cheng 侧 hard fail**；memo 层（26789-26831 及键域 2/3/4 同族 wrapper）不移植，Cheng 由 freeze 单遍归纳。