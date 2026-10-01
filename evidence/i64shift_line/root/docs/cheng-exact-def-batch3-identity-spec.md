侦察完成。以下为批 3 算法规格全文。

---

# ExactDef 批 3 算法规格（自 C 冷链提取）

> 2026-08-25 侦察代理产出，供批 3（identity schema 主审 + 投影权威）实施使用。
> 配套设计：docs/cheng-exact-def-rewrite-design.md §4 批 3、§5-3、§6；格式对齐批 2 规格。
> 行号为当前树实测：任务书所给 cold_parser.c:82377/29384/30060 分别对应当前 82840/~29869/~30427（漂移 +370~490）；cheng_cold.c:61027 无漂移，锚定 60946-61104 拒点域。当前树冷_parser.c:29601（`[pub]`）、cheng_cold.c:61135-61140（`[upv]`，无条件打印）是探针残留，不移植。

## 0. 主审入口与骨架（`cheng_cold.c:67588-70153+`）

调用点三处：`71551`（body-store-freeze 未冻结承认时）、`71564`（optimized 阶段）、`105367`（契约承认路径）。

- 入口门：`67592-67596` null body → `... null body`；`67597-67614` symbols 空 / `producer_function_row` 越界 / 该函数 `result_ownership_summary` ∉ {OWNED, BORROW_SHARED} → `... function result ownership summary missing`。返回 false。
- 列门宏 `COLD_EXACT_REQUIRE_COLUMNS`（`67625-67661`）：op 族 12 列（八戳+source+四 read-edge）、term 族 1 列、slot 族 4 列、call_arg 族 4 列；count>0 且列缺 → `... %s columns missing`。
- 预检循环（`67663-67750`，逐 op，判词均返 false）：global scalar store 候选（I32_REF_STORE/PTR_STORE_I64 + GLOBAL + I32_REF/I64_REF + PLAIN storage）须过 `cold_exact_global_scalar_store_tuple_valid` → `global scalar store tuple is broken`；`cold_exact_abi_pointer_param_store_tuple_valid` → `typed ABI pointer store authority is broken`；TEXT_SET_INIT 的 a/b/c 必须 -1/0/0 → `TEXT_SET_INIT has non-canonical unused operands op=%d a=%d b=%d c=%d`；两条 fixed-array 形状校验（`65370/65418`）→ 对应判词。
- read-edge 总门（`67752-67758`）：`cold_exact_managed_read_edges_valid` 不过 → `managed direct-read edges are incomplete or non-canonical`（批 2 §4 完成器的总判词，此处是调用关系：主审把 read-edge 终校验内联为前置门）。
- **块区间三判词**（`67760-67852`）：①`block_count>0` 而 `block_op_start/block_op_count` 列缺 → `block op-range columns missing`（67760）；②逐块 `start<0 || count<0 || start>op_count || count>op_count-start` → `block=%d op range [%d,%d) is outside op table count=%d`（67783）；③`covered_by_block[op]` 已占 → `block=%d op range [%d,%d) overlaps block=%d range [%d,%d)`（67797）；④覆盖总数≠op_count → `function=%.*s block ranges cover %lld of %d ops; orphan op rows are forbidden`（67811）+ 前 32 块 dump（`exact identity block range function block start count term`）+ 前 16 个孤儿行 dump（`exact identity orphan op function op kind dst a b c`）。

## 1. 定义组完整性（主循环 `67861-69554`）

逐 op 顺序：raw seq mutation owner（67862）→ open-drop 义务/标记对（67891-67940）→ 戳列读取 → 三分支。

**空组哨兵形**（`67941-67946`）：七列全空 = `slot==-1 && exact_type==-1 && producer==-1 && place==INVALID && own==INVALID && origin==-1 && consume==0`。空组行走 `67947-68280` 豁免链（source 携带的 release/mutation/managed-replace 四 tuple、string release、generic structural copy、EXACT_PLAIN_SCOPE_END、scalar field read、scalar borrow projection root（`68038-68055` 要求派生根==source，否则 `scalar borrow projection root drift source=%d derived=%d`）、managed opaque index 缺定义硬拒（68069）、opaque object append tuple、managed copy 缺 source 硬拒（68147：source==-1 且 dst/src 任一侧 storage∈{STR,SEQUENCE,OBJECT}）、PAYLOAD_STORE call-temporary 消费硬拒（68186）、global payload store tuple、consume-only 边校验 `68256-68278`（source≥0 && reaches && 四类消费形态 && 同槽 && source own∈{MOVE,PLAIN}，否则 `managed consume-only edge is broken`））。

**`has partial definition tuple`**（触发条件 `68340-68359`，非空组且任一析取成立）：`slot∉[0,slot_count)`；`exact_type<0 && !(GLOBAL_ADDR && place==GLOBAL)`；`producer<0 || producer!=body->producer_function_row`；own∉{PLAIN,MOVE,BORROW_SHARED,BORROW_UNIQUE}；place∉{TEMPORARY,STACK_LOCAL,PARAM,BORROW_PROJECTION,GLOBAL,CFG_MERGE,SHARED_COPY,MEMORY_VERSION}（**INVALID 不在白名单**：半填组即部分组）；`origin<0`；`consume<0 || consume>op_count`。判词字段序（68361）：`op row=%d has partial definition tuple slot=%d exact_type=%d producer=%d body_producer=%d place=%d ownership=%d origin=%d consume_plus_one=%d op_count=%d kind=%d dst=%d a=%d b=%d c=%d`。

通过后按 place 八臂分派：TEMPORARY（68427-68804，见 §3 注）/ MEMORY_VERSION（68805-68822，转批 5 `cold_exact_schema_var_out_definition_valid`，判词 `call memory version is broken call=%d formal=%d carrier=%d`）/ STACK_LOCAL（§3）/ PARAM（§3.4）/ BORROW_PROJECTION（§5.4）/ GLOBAL（69315-69340：GLOBAL_ADDR 根，dst==slot、source==-1、consume==0、own==BORROW_SHARED、origin∈[0,global_count)、a==origin、b==c==0，否则 `managed global definition is broken global_row=%d source=%d ownership=%d consume_plus_one=%d`）/ SHARED_COPY（69341-69391：COPY_COMPOSITE、dst==slot、own==(storage==PLAIN?PLAIN:MOVE)、source==-1、origin∈[0,op_count) 且 reaches、op_a 为槽、def_slot[origin]==op_a、origin own 为 owned 或 borrow 族，否则 `managed shared-copy definition is broken slot origin source_own op_dst op_a origin_def_slot origin_reaches op_kind`）/ else=CFG_MERGE 臂（69392-69553，批 4 域：NOP 形转 `cold_exact_memory_version_cfg_merge_valid`；COPY_COMPOSITE 形全字段门含双前驱、双 current、双 consume 容忍，判词 `managed CFG merge definition is broken ...` 21 字段）。

## 2. def↔slot 四字段一致（type/place/origin/storage）

分两层落实（注释 `68377-68382` 自述：op 层钉 type/storage，槽层独立证 place/origin 命名唯一规范定义）：

- **op 层（type+storage）**：`68374-68426`。`storage=cold_canonical_storage_obligation_for_body_slot(slot)`；`type_less_global_root` 豁免（68388-68395：GLOBAL_ADDR+GLOBAL+exact_type<0+storage==UNKNOWN+槽 kind 本非托管）。触发判词（68396-68400 任一）：`storage==UNKNOWN && !豁免`；`exact_type>=0 && slot_exact_type_id[slot]!=exact_type`；`slot_managed_storage_kind[slot]!=storage`。判词=`slot authority mismatch ...` 七字段（批 1 判词，`68402`：def_type/slot_type/def_place/slot_place/def_origin/slot_origin/def_storage/slot_storage——**place/origin 只打印不比较**，比较在槽层）。
- **槽层（place/origin+计数）**：倒排计数 `69942-69961`——定义行计入 `slot_definition_counts[slot]` 当且仅当 `def_slot∈[0,slot_count) && def_exact_type==slot_exact_type && def_producer==body_producer && def_place==slot_place && def_origin==slot_origin && (slot_place==TEMPORARY ⇒ def_origin==op)`（INT32_MAX 溢出 die）。槽循环 `70036-70152`：slot 级 partial authority 门（70051-70090：exact_type≥0（global_address_slot 豁免）、place 白名单、origin≥0、storage==expected_storage、place 特化 origin 界——STACK_LOCAL⇒origin==槽号、PARAM⇒origin<param_count、BORROW_PROJECTION/CFG_MERGE/SHARED_COPY⇒origin<op_count、GLOBAL⇒origin<global_count、MEMORY_VERSION⇒origin 为同槽 NOP+MV 行且过 var-out 校验且块内 current-at-predecessor）→ 判词 `slot row=%d has partial authority ...`（70092）；计数门（70121-70146）：`definition_count = place==MEMORY_VERSION ? 1 : counts[i]`；STACK_LOCAL⇒≥1；raw_abi_parameter（PARAM 且 param_slot/param_exact_type/kind/size 与 FnDef 全等）⇒==0；其余⇒==1；违→`slot row=%d definition count=%d`（70149）。

## 3. STACK_LOCAL 绑定臂与 source chain 六臂（`68823-69053`）

NOP 形（68824-68878）：aggregate_borrow_result_version（BORROW_SHARED+source≥0+op_b==slot+结果摘要是 BORROW_SHARED+storage∈{PLAIN,OBJECT,STR}）→ `cold_exact_plain_borrow_result_local_version_valid`，否则转批 5 var-out 校验（判词 `call var-out definition is broken call formal carrier`）。

非 NOP 门序：**绑定门**（68895-68904）：`copy_kind`=COPY_COMPOSITE/COPY_I64/PAYLOAD_STORE；`literal_root`=source==-1+STR_LITERAL+a∈字面量界+槽 STR+own PLAIN+过静态串校验。`(!copy_kind&&!literal_root) || dst!=slot || origin!=slot || (!literal_root && op_a∉[0,slot_count))` → `managed bind definition is broken`（68901）。**根门**（68905-68916）：source==-1 且非 literal_root 时，op_a 槽必须 place==INVALID && origin==-1 && storage==UNKNOWN，否则 `managed root definition is broken`（68913）。

**六臂**（source≥0 时，先算 `source_ownership`（68918-68922））：

1. `move_edge`（68923-68926）：own[i]==MOVE && own[source]∈{MOVE,PLAIN}。
2. `borrow_edge`（68927-68933）：own[i]∈{BORROW_SHARED,BORROW_UNIQUE} && own[source]∈{BORROW_SHARED,BORROW_UNIQUE}。
3. `plain_static_string_edge`（68934-68938）：storage==STR && own[i]==PLAIN && `cold_exact_plain_static_string_definition_valid(i)`（**验的是 i 自身**：63981-64014 要求槽 STR/COLD_STR_SLOT_SIZE/STR storage、dst==slot、exact_type==managed_type_id、place∈{STACK_LOCAL,CFG_MERGE} 且 origin 分别==slot/==自身、own==PLAIN、read 边 dst/b/c 三列 -1；CFG_MERGE 形另证双输入）。
4. `plain_copy_edge`（68939-68950）：`plain_copy_tuple_valid(source,i)`（§6.2）&&（`cold_plain_value_copy_is_independent(slot[source],其kind)` || `cold_exact_borrow_result_neutral_staging_value_valid(slot[source], i)`）。
5. `plain_shared_copy_edge`（68961-68969）：`plain_copy_tuple_valid(source,i)` && own[source]==PLAIN && place[source]==SHARED_COPY && 槽 storage[def_slot[source]]==PLAIN。
6. `borrowed_plain_snapshot_edge`（68970-68992）：`plain_copy_tuple_valid(source,i)` && own[source]==BORROW_SHARED && def_slot[source]∈[0,slot_count) && 槽 storage==PLAIN && place[source]∈{BORROW_PROJECTION,SHARED_COPY,TEMPORARY,STACK_LOCAL,PARAM} && `cold_borrow_result_root_valid(source)`。

**链门**（69010-69022）：`source<0 || (!mv_source_view_edge && !reaches(source,i)) || def_slot[source]!=op_a[i] || place[source]==INVALID || 六臂皆假` → 判词（69024）`op row=%d source chain is broken source=%d source_slot=%d operand=%d ownership=%d source_ownership=%d place=%d`（source_slot/place 取 source 行戳，越界给 -1/INVALID）+ 链 dump（`69040-69049`，`  chain op=%d kind dst a b c def_slot def_own def_place`，区间 `[max(0,source-12), i+2]`）+ 返 false。

### 3.4 PARAM 臂（69054-69106）

- `cold_exact_param_definition_edge_valid`（62156-62237）不过 → `managed parameter definition is broken`（69058）。谓词：place==PARAM && origin∈[0,param_count) && `raw_slot=param_slot[origin]`∈[0,slot_count)；`expected_copy = slot_size[raw]==8 ? COPY_I64 : COPY_COMPOSITE`；`borrowed = op_b==1`；physical_ref=八种 REF kind。NOP 形（62193-62199）：var-param 版本标记行，op_c 链到入口拷贝行递归继承（child≠op）。非 NOP：`kind==expected_copy && dst==def_slot && op_a==raw_slot && op_b∈{0,1} && op_c==0 && source==-1` 且所有权析取（!borrowed⇒own∈{MOVE,PLAIN}；borrowed⇒(UNIQUE && (physical_ref || raw==ARRAY_I32 || raw==OBJECT)) || (SHARED && !physical_ref)）且（!borrowed || consume==0 || consume 指向 NOP 标记行）。
- 效应门（69062-69106）：producer 越界或 origin<0 → `managed parameter effect owner is invalid`；`exact_effect` 四析取（origin<arity 且：UNIQUE&&形参 var；SHARED&&!var&&borrows_args；MOVE&&!var&&!borrows_args；PLAIN&&!var&&槽 storage==PLAIN&&canonical==PLAIN&&param_exact_type_id[origin]==exact_type）→ 否则 `managed parameter effect mismatch`。

### 3.5 TEMPORARY 臂要点（68427-68804，完整性引用）

门（68723-68733）：`!ownership_matches_storage || dst!=slot || origin!=i || (source!=-1 && 六通道皆假) || !direct_call_result_matches_summary || consume<0` → 判词 `temporary definition is broken source producer_consume object_field_decomposition ref_object_field_decomposition borrowed_source call_summary operand source_slot source_consume exact_type source_type`（68736）。ownership_matches_storage（68553-68563）= PLAIN↔PLAIN 或三条 address-bearing PLAIN 豁免（allocation 68539-68549 / call 68527-68538 / field_take `65848`）或非 PLAIN↔MOVE 或借用+`borrow_result_root_valid(i)`；source 六通道=producer_consume（68564-68581：reaches+op_a 槽等+type/producer 等+own∈{MOVE,PLAIN}+source consume>0）/ object_field_decomposition（带 source/final 双行缓存 68582-68597，`65978`）/ ref_object_field_decomposition（68598-68615，`66201`）/ borrowed_source_edge（68616-68640：借用 && kind∈{MAKE_COMPOSITE,STR_SLICE,CALL_I32,CALL_COMPOSITE} && reaches && source 三证之一：borrow_result_root/borrow_result_owner_root/`cold_exact_shared_projection_edge_valid`（cold_parser.c:20121-20223））/ borrowed_plain_snapshot_temp（68646-68666）/ plain_static_string_temp_snapshot（68672-68683）。call 行另过 `direct_call_result_matches_summary`（68684-68722：callee 摘要非 UNKNOWN 且 PLAIN↔OWNED / 非PLAIN↔OWNED / address_bearing↔OWNED / BORROW_SHARED↔BORROW_SHARED 四析取）。

## 4. mv_source_view_edge 臂（`69003-69009`）与槽终校验

- 身份视图行谓词（67524-67531）：`op_kind==NOP && place∈{MEMORY_VERSION,CFG_MERGE}`。
- 臂条件（69003-69009）：`source∈[0,op_count) && row_is_identity_view(source) && def_slot[source]==op_a[i] && cold_exact_identity_view_slot_terminal_valid(i, op_a[i], source_ownership, exact_type[source])`。**只放电支配子句**（`!mv && !reaches` 中的 reaches），链门其余四类检查（source≥0、同槽、place 有效、六臂析取）全部保留——注释 `68993-69002` 自述。
- 槽终校验（67557-67586）：遍历全部 op，凡 `op!=consumer && op_dst==operand_slot && schema(op_kind).writes_dst_slot` 的物理写者：①`def_slot[op]<0`（无侧车）→false；②`place[op]==INVALID`→false；③`exact_type_id>=0 && def_exact_type[op]!=exact_type_id`→false；④`!ownership_view_matches(own[op], ownership)`→false（67533-67542：严格相等，或双方同属借用族 {SHARED,UNIQUE}）。全部写者过关后，至少一个写者 `reaches(op,consumer)`（`dominating` 标志）才 true。注释（67544-67556）给出证明含义：任一路径上的当前写者都是同族侧车化定义，真断链（视图漂移/缺侧车/无效 place/无支配写者/类型漂移）仍拒。证据：identity-schema-20260825/ANALYSIS §2-3（三亚形同根：视图行块不支配消费者）。
- **Cheng 侧终校验应证不变量**（设计 §5-3 裁定：Cheng 无 NOP/MV 元数据视图行，支配子句真空成立，臂转纯槽终校验）：对 source 边（def→consumer，operand_slot=consumer 基槽）：∀ 物理写者 w（w≠consumer、w 写 operand_slot：StoreLocal/CopyLocal/FieldStore/IndexedStore/GlobalStore 等写 dst 槽的 op）：w 必带 value-def 侧车（valueDefSlot≥0）、placeKind≠INVALID、（source exactType≥0 时）w.exactType==source.exactType、ownViewMatches(w.own, source.own)；且 ∃ w reaches consumer。任一不满足 → 维持 `source chain is broken` 判词同文本同字段序。

## 5. 投影权威

### 5.1 帧自有谓词（`cold_parser.c:29748-29769`，声明 25380）

`cold_exact_shared_projection_roots_frame_owned(body, projection)`：projection∈[0,op_count) && place==BORROW_PROJECTION && own==BORROW_SHARED && `origin=def_origin[projection]`∈[0,op_count) && place[origin]∈{STACK_LOCAL,TEMPORARY} && own[origin]∈{MOVE,PLAIN} && `def_origin[origin]==def_slot[origin]`（origin==destination 槽约定）。注释（29740-29747）：retained shared 投影（MakeFillText 类 CALL_COMPOSITE 构造器对 str 字段发布的臂）share 是 retain 非转移，权威留在帧自有根值定义；身份纯 int32 行/槽。

**与 STACK_LOCAL/TEMPORARY 同约定对照表**：

| 消费点 | 条件 | 证据 |
|---|---|---|
| frame_owned 的 origin 约定 | place∈{STACK_LOCAL,TEMPORARY} && own∈{MOVE,PLAIN} && origin==slot | cold_parser.c:29757-29768 |
| 点活性对 plain owned staging copy 的承认 | `oxa_cap && place∈{TEMPORARY,STACK_LOCAL} && def_origin==def_slot` → parent_live=true | cheng_cold.c:60798-60813 |
| oxa walk 第三臂 | 同上逐字（own∈{MOVE,PLAIN} && origin==slot） | cold_parser.c:82847-82860 |

三处同一槽约定，批 3 在 Cheng 侧必须共享同一 helper（批 2 walker 的 parent-live 臂与批 3 投影权威同源单实现）。

### 5.2 三处接线

- **门 1（调用边界承认，cold_parser.c:29784-29903）**`cold_reject_borrowed_actuals_at_resolved_call_boundary`：callee 非 borrows_args 时逐形参，var 形参与 ffi_handle borrow 跳过；实参 own∈借用族时先全字段重证（29838-29860，`borrowed actual call-boundary authority is incomplete` die），随后**帧自有豁免**（29869-29878）：`own==BORROW_UNIQUE && source.place==MEMORY_VERSION && source.value_def_op_id∈[0,op_count) && consume[该行]==0（未消耗纪元） && frame_owned(source.origin_id)` → continue；否则判词 `borrowed actual cannot bind non-var non-@borrows formal caller_function_row callee_function_row formal_ordinal source_value_def source_type_id source_ownership source_place source_origin caller callee` + die。
- **门 2（物化转移最后防线，cold_parser.c:30415-30446）**：借用实参过完全字段形状校验（30391-30413，`call argument exact borrowed authority is invalid` die：def<call_op、def_slot 合法、def place/own/origin 与 CSR 三列一致（SHARED 实参可持 UNIQUE 定义=&mut→& 降级）、consume==0、`is_live_before_op(def,call_op)`）后，非 @borrows/非 var/非 ffi_handle 且托管时，**同规则豁免**（30427-30432：`own==BORROW_UNIQUE && def place==MEMORY_VERSION && frame_owned(def_origin[definition])`），否则 `by-value borrowed argument bypassed resolved boundary fn row def formal arity` + die。注释 30421-30426：两门必须同规则，否则互相矛盾。
- **walk（字段路径存入 ref，cold_parser.c:82813-82877）**：前置（82813-82823）：`!exact_unique_root && base_authority.place==MEMORY_VERSION && vdo∈[0,op_count) && own==BORROW_UNIQUE && def_slot[vdo]==base_ref_slot && consume[vdo]==0`。爬升规则：`oxa_walk=source[vdo]`，至多 64 跳，每跳四分派——place==BORROW_PROJECTION&&own==BORROW_SHARED → `frame_owned(walk)`；place==BORROW_PROJECTION（非 SHARED）→ `unique_projection_root_valid`；place∈{STACK_LOCAL,TEMPORARY} → 槽约定直判（同上表）；其他 → `unique_var_param_authority_valid`。终止：`exact_unique_root || place[walk]!=MEMORY_VERSION || def_slot[walk]!=base_ref_slot` 即 break；`next=source[walk]`，`next<0 || next>=walk`（非严格下降）break。语义：未消耗 MV 纪元的不可变 source 列爬到已承认根，纪元借出该根的独占权威。

### 5.3 borrow projection 同槽 tie（两处，证据 borrow-projection-20260825/ANALYSIS §2-3）

- **发布器戳（cold_parser.c:29602-29647）**：投影载体 var-out 发布在 definition 后插 root=definition+1 行（NOP/MV/BORROW_UNIQUE/dst=local->slot/a=call_op/b=param_index/c=definition/origin=prior||root/source=prior/证书位 29642-29645）；**consume 戳加同槽 tie**（29636-29641）：仅当 `prior>=0 && prior<root && def_slot[prior]==def_slot[root] && consume[prior]==0` 才写 `consume[prior]=root+1`；跨槽谱系边由 origin/source 列承载，不占 consume 列。
- **分类器 source 臂（cheng_cold.c:52835-52860）**：call-pinned var-out NOP（consumer NOP+place MV+op_a 指向 CALL_I32/CALL_COMPOSITE/SEQ_I32_ADD/SEQ_STR_ADD/SEQ_OPAQUE_ADD）→ `return def_slot[consumer]==def_slot[definition]`（同槽=版本取代消费；跨槽=谱系豁免非消费）。与 frozen origin 通道三限制同构。负例载荷：禁分类器同槽豁免 → op712 `consume edge is broken consumers=1 first=717` 回归。

### 5.4 BORROW_PROJECTION 臂（`69107-69314`）与判词全字段

前置候选校验：ABI pointer projection（69108-69130）/ ABI pointer ref-object（69131-69152）/ direct_var_value_object_projection（69198-69230：整值解引用跨 OBJECT_REF→OBJECT 载体域、nominal 行不变、parent/child TypeId 域商与余数关系、origin place∈{PARAM,MEMORY_VERSION}，触发则过 `cold_exact_var_value_object_projection_tuple_valid`，否则 `var value-object projection tuple is broken slot origin`）。

主门（69244-69261 任一假即判词）：`copy_kind`（11 种：COPY_COMPOSITE/COPY_I64/PTR_LOAD_I64/PAYLOAD_LOAD/FIELD_REF/LOCAL_ADDR/SEQ_STR_INDEX_DYNAMIC/SEQ_OPAQUE_INDEX_DYNAMIC/SEQ_OPAQUE_INDEX_REF_DYNAMIC/ARRAY_OPAQUE_INDEX_DYNAMIC/ARRAY_OPAQUE_INDEX_REF_DYNAMIC）&& dst==slot && source==-1 && consume==0 && `ownership_valid`（69176-69182：BORROW_SHARED 直接承认——**share 是 retain 非转移**；BORROW_UNIQUE 须 `cold_exact_unique_projection_root_valid`）&& origin∈[0,op_count) && reaches(origin,i) && `sequence_object_projection_valid`（69183-69188：SEQ_OPAQUE_INDEX_DYNAMIC 取 SLOT_OBJECT 须过对象投影 tuple）&& `cold_exact_projection_parent_live_before_op(origin,i)` && （def_slot[origin]==op_a[i] || `cold_var_projection_base_matches_parent(i,origin)`）&& own[origin]∈四值。

**判词字段序与来源**（69263，21 字段）：`slot origin ownership kind copy_kind dst_match source consume ownership_valid origin_in_range origin_reaches sequence_valid parent_live parent_slot operand parent_ownership parent_param_root parent_type parent_slot_type parent_storage parent_kind parent_size`。其中 parent_* 全部以 origin 行为键：`parent_slot`=def_slot[origin]；`operand`=op_a[i]；`parent_ownership`=own[origin]；`parent_param_root`=`cold_exact_borrowed_ref_object_param_mutation_root_valid(origin)`（60952-61026：CFG_MERGE+SHARED 形双输入同根归约到 PARAM 根，再证 PARAM+SHARED+producer+`param_definition_edge_valid`，槽/TypeId 域 OBJECT_REF+REF kind+8B+OBJECT storage+canonical ObjectDef 恒等——**任务书「拒点 61027」即此函数尾与紧随的 `cold_var_projection_base_matches_parent`（61033-61104）：基槽匹配三形（直等 / PAYLOAD_LOAD 经 ARRAY_OPAQUE_INDEX_DYNAMIC+PAYLOAD_LOAD 载体回 FIELD_REF 跳 / ARRAY_OPAQUE_INDEX_REF_DYNAMIC 基槽经 FIELD_REF 跳或父载体拷贝链）**）；`parent_type`=exact_type[origin]；`parent_slot_type`=slot_exact_type_id[def_slot[origin]]；`parent_storage`=`cold_recorded_storage_obligation_for_body_slot(def_slot[origin])`；`parent_kind`/`parent_size`=slot_kind/slot_size[def_slot[origin]]（各字段在 origin/slot 越界时给 -1）。

parent_live 双车道（60724-60832）：父借用 → `cold_exact_borrow_parent_live_before_projection`（60362-60722：前置全字段 → 同块半开区间无同槽定义 → `is_current_at_consumer` → 逆 relevant 切片（哨兵 `borrow projection reverse queue overflow`，容量 3B+1，`borrow projection work queue size overflow`）前向纪元 walker，definition 置 LIVE、同槽他定义置 UNDEFINED、按位或 join、投影点须纯 LIVE）；父 PLAIN/MOVE → `is_live_before_op`，失则三兜底（staging copy 槽约定+current（60798-60813）、MV 行即槽头+current（60814-60823）、CFG_MERGE 自根+头链爬升命中+current（60824-60829），爬升沿 source 列、负则 origin 列、严格下降、≤64 跳）。

## 6. 辅助谓词（批 2 豁免序引用、批 3 域）

1. **`cold_exact_plain_memory_version_source_read(source, version)`**（52630-52692）：version=NOP+MV+PLAIN && source own==PLAIN && source[version]==source && origin[version]==source；同槽（def_slot 互等、dst==slot）、exact_type 双等且==slot 列、producer 双等、槽 storage==PLAIN；source place 三形（STACK_LOCAL&&origin==slot / MV&&NOP&&origin≥0 / CFG_MERGE&&origin==自身）；`projection=op_b[version]`、`store=op_a[version]` 满足 `projection<store && store+1==version`、projection=FIELD_REF 且 source 列==source 且七戳全空组、store=ARRAY_I32_INDEX_STORE 且 op_a==dst[projection] 且 op_c==0。MOVE 聚合故意不匹配（保留唯一消费边）。
2. **`cold_exact_plain_copy_tuple_valid(source, copy)`**（52241-52305）：`source_reaches_copy`（52252-52259：source≠copy 且（source<copy 或（source place∈{CFG_MERGE,MV} 且 reaches））——**该谓词自身无 CFG 查询例外只此一处**）&& copy=COPY_COMPOSITE && source 列[copy]==source && place[copy]==STACK_LOCAL && own[copy]==PLAIN && own[source]∈{PLAIN,BORROW_SHARED,BORROW_UNIQUE}；双槽合法且不同槽、op_a==source_slot、dst==destination、b==c==0、kind 同且∈{OBJECT,ARRAY_I32}、size 同、双槽 storage 皆 PLAIN、exact_type 双等且≥0、producer 双等、`origin[copy]==destination`。
3. **`cold_exact_opaque_sequence_take_source_tuple_valid(seq_def, take)`**（52311-52458，无 CFG 查询，供消费数据流自调）：take=SEQ_OPAQUE_TAKE_DYNAMIC 且 source 列==seq_def；element/sequence/index 三槽两两不同、sequence kind∈{SEQ_OPAQUE,SEQ_OPAQUE_REF,SEQ_STR,SEQ_STR_REF}、index=I32/4B、`slot_size[element]==slot_aux[sequence]>0`、sequence size（值 16/ref 8）、sequence storage==SEQUENCE、element storage∉{UNKNOWN,PLAIN}、`element_type_id=op_c>0` 且==slot 列；take 行戳全形（dst==element、type==element_type、producer、TEMPORARY、MOVE、origin==take、consume∈(0,op_count]）；seq_def 行戳（槽/type/producer/place≠INVALID/origin≥0/所有权按 kind 二析取：值 kind⇒MOVE 或 UNIQUE+BORROW_PROJECTION，ref kind⇒UNIQUE/`consume[seq_def]!=take+1`）；载体域三分支（str 序列⇒STR/COLD_STR_SLOT_SIZE/type 双等；序列元素⇒kind 域等+16B+SEQUENCE storage；对象域⇒element_domain==expected(OBJECT|OBJECT_REF)&&payload>0&&sequence_type 余数==262144+payload，指针族另要 8B）。
4. **`cold_exact_owned_object_field_projection_shape(definition, projection)`**（52465-52546）：definition 合法、projection∈(definition,op_count)；source_slot=OBJECT/>0/OBJECT storage、def type≥0 且域==OBJECT、STACK_LOCAL+MOVE、consume∈(0,op_count]、projection≤final=consume-1；child=dst[projection] 合法、PAYLOAD_LOAD、a==source_slot、b≥0、c>0、b≤size-c、child size==c、child storage∉{UNKNOWN,PLAIN}、child type==projection 行 type、child place==TEMPORARY && child origin==projection；projection 行戳全形（slot==child、type≥0、producer、TEMPORARY、MOVE、origin==projection、source 列==definition）；非末投影时末投影同块同形（同 PAYLOAD_LOAD+同 source_slot+source 列==definition+slot/place/own 戳）。
5. **`cold_exact_owned_ref_object_field_projection_shape(definition, projection)`**（52551-52620）：source_slot kind∈{PTR,OBJECT_REF,OPAQUE_REF}、8B、OBJECT storage、def type 域==OBJECT_REF、STACK_LOCAL+MOVE；release_call=consume-1>projection 且 CALL_I32 且 source 列==definition 且 def_slot==-1（父指针 owner 由规范 release 调用唯一消费）；projection/child 条件同 4（b+c 防溢出用 `b<=INT32_MAX-c`）。

## 7. 审计段调用关系（批 2 §2 已覆盖判词本体）

主循环结束后（69555-69760）：`cold_exact_consumer_summary_build` 失败 → `exact consumer summary is malformed`；随后逐定义行（def_slot≥0）算 `plain_single_constructor_move`/`recorded_consumer_found`/`single_consumer_proved`/`consumption_dataflow_valid`/两条 PLAIN 容忍（read-then-scope-end 69607-69660、static-string multi-read 69666-69670，均复用批 1/批 2 谓词），再按批 2 §2 的条件式发 `has invalid path consume`（69677-69718，附 consume candidate dump 69701-69715）与 `consume edge is broken`（69720-69758）。批 3 只保证：审计与主审同函数顺序执行、共享同一 consumer summary（四枚举位点同源单遍产出的消费方）、判词文本字段序零改动。其后 term 循环（69761-69923：void return tuple / borrowed return root / return definition 三族）、槽循环（§2）、call_arg 循环（70154+，批 5 域）依次串行。

## 8. Cheng 基板差异提醒（19 op tag 无 FIELD_REF/LOCAL_ADDR 载体）

Cheng BodyOpKind 20 值（0-19，core_types.cheng:121-180；设计称 19 个有效 tag）：投影面只有 **FieldLoad/FieldStore（域投影）、IndexedLoad/IndexedStore（索引投影）、CopyLocal（拷贝）、ResultProject（结果投影）、LoadLocal/StoreLocal、GlobalLoad/GlobalStore、Call**；无 NOP/MEMORY_VERSION/CFG_MERGE 行、无 LOCAL_ADDR/FIELD_REF 地址行、无 PAYLOAD_LOAD/PAYLOAD_STORE、无 EXACT_PLAIN_SCOPE_END、无 CALL_I32/CALL_COMPOSITE 区分（统一 Call）。

- **六臂对应物**：move/borrow/plain-shared/borrowed-snapshot 四臂的结构列（kind==COPY_COMPOSITE/COPY_I64）→ Cheng `CopyLocal`（PAYLOAD_STORE 臂 → `FieldStore`/`StoreLocal`，须先核对 lowering 是否在同形处发绑定戳）；plain_copy_tuple_valid 的 kind∈{OBJECT,ARRAY_I32} → LocalType `LocalAggregate`（Cheng LocalType 7 值更粗，OBJECT/ARRAY_I32 区分须走 typeArenaTypeId 侧车列，批 1 §3.2 opExactTypeIds）；plain-static 臂的 STR_LITERAL 根 → `LoadConst`+str storage 侧车；六臂其余纯戳列判定原样。
- **mv_source_view_edge 臂**：Cheng 无身份视图行 → `row_is_identity_view` 真空，臂退化为 §4 的槽终校验（写者集=Cheng 写 dst 槽的 op 集，writes_dst_slot 由 Cheng op schema 给出：StoreLocal/CopyLocal/FieldStore/IndexedStore/GlobalStore）；判词保留。
- **BORROW_PROJECTION 臂 11 种 copy_kind** → Cheng 投影 op 集 {FieldLoad, IndexedLoad, CopyLocal, ResultProject, LoadLocal（ref 形）}；FIELD_REF/LOCAL_ADDR 两载体无对应行，`cold_var_projection_base_matches_parent` 的两条 FIELD_REF 跳臂（61049-61103）真空，只余直等臂（61041-61043：op_a==def_slot[parent]）；`parent_param_root` 谓词的 PARAM 根判定照转（origin 槽/TypeId/8B/OBJECT storage/规范 ObjectDef）。
- **plain_memory_version_source_read**：依赖 FIELD_REF+ARRAY_I32_INDEX_STORE+NOP-MV 三行链，Cheng 全无载体 → 谓词真空；其批 2 消费谓词豁免位①的语义须按 Cheng 的 IndexedStore 写回版本形重证（与批 2 规格 §6「无载体」清单同一条）。
- **param_definition_edge_valid**：expected_copy 二值 → `CopyLocal`（8B/聚合宽度由 typeArena 给）；NOP 标记递归臂（62193-62199）真空；physical_ref 八种 REF kind → LocalType+typeArena 侧车联合判定。
- **哨兵/审计**：空组豁免链中 release/mutation/EXACT_PLAIN_SCOPE_END/PAYLOAD_STORE 各硬拒均真空（Cheng 无对应 op）；审计段 consumer summary 的四枚举位点已在批 2 同源产出，批 3 不重造。
- **与批 1 侧车列的衔接**：本批全部判定键 = 批 1 侧车 `opPlaceKinds/opExactTypeIds/opOriginIds/opProducerFunctionRows/opSourceDefOpRows` + `slotPlaceKinds/slotOriginIds/slotStorageKinds` + `ops[i].valueDef*` 既有列 + 批 2 工作区的 reaches/current/dominates 事实；`has partial definition tuple`、`source chain is broken`、`managed borrow projection is broken`、`managed parameter definition is broken`、块区间三判词五条文本逐字保留（含 `cheng_cold:` 前缀与字段序），经统一 verdict helper 输出。槽层四字段一致所需 `slot_exact_type_id/place/origin/storage` 四列 = 批 1 侧车 slot 族 + core_types 既有 typeArenaTypeId。