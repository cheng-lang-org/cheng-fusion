# ExactDef 批 4 算法规格（自 C 冷链提取）

> 2026-08-25 侦察代理产出，供批 4（CFG merge batch + 借用合并权威）实施使用。
> 配套设计：docs/cheng-exact-def-rewrite-design.md §4 批 4、§7-4（progress.md:1457 裁定原文）；格式对齐批 2/批 3 规格。
> 行号为当前树实测：任务书所给 cold_parser.c:64174-64600+ 无漂移（函数体 64174-64753）；填充点 :86843/:86893/:89435 无漂移（现 86843-86846 / 86890-86896 / 89433-89438）。任务书说的「双 UNKNOWN→PLAIN 条款 :64421-64423 区」现 64421-64423 原样。探针残留（`([smgw])` 64683/64066/64116/63644、`([prd])` 63747、`CHENG_COLD_DISABLE_PHI_REMAT` 环境开关 63569/63574）不移植。

## 0. 结构体与公共基元

- 请求 `ColdExactLocalMergeRequest`（64141-64150）：`local`（Local 指针，含 name/kind/slot/value_def_op_id）、`first_def`/`second_def`（两臂当前定义 op 行）、`destination_override`（-1=新雕槽）、回填 `first_input_def`/`second_input_def`（边拷贝行）、`merge_def`、`preserve_unique_borrow`。
- 计划 `ColdExactLocalMergePlan`（64152-64168）：`source_slot`（staging 载体槽）、`destination`、`storage`、`merge_ownership`、双 `input_block`（最终 edge 块）、双 `input_predecessor`（原始前驱）+双 `input_predecessor_term`、`lift_first/second_borrowed`、`normalize_first/second_ref_value`、`preserve_unique_borrow`。
- 枚举（cheng_cold.c:18391-18413 与批 2 §0 同）：own `INVALID0/PLAIN1/MOVE2/BORROW_SHARED3/BORROW_UNIQUE4`；place `.../GLOBAL5/CFG_MERGE6/SHARED_COPY7/MEMORY_VERSION8`；storage `UNKNOWN/PLAIN/...`；SLOT kind 全表 18281-18301（OBJECT_REF=9）。
- BodyIR 权威列同批 2 §0；merge 域新增：merge 行的 `op_source_value_def_op_id`=第一输入、`op_b`=第二输入、`op_c`=第一前驱 edge 链首块、`op_exact_source_a_value_def_op_id`=merge_def 自环。

## 1. `cold_merge_exact_local_defs_batch`（64174-64753）全条款

执行顺序：状态门 → open join 门 → 逐请求计划+edge staging（第一遍循环 64199-64540）→ reopen join → 逐请求发 merge 定义（第二遍循环 64543-64747）。**所有 edge actions 先于任何 merge 定义行**（64170-64173 注释：先发 merge 行再 reopen 插下一 local 的边动作会重置块连续区间、孤儿化先发行）。

### 1.1 状态门与 open join 门

- 状态门（64180-64187）：`!parser || !body || !requests || request_count<=0 || 前驱越界 || first_predecessor==second_predecessor` → `die("managed CFG merge batch state is invalid")`。
- open join 门（64188-64192）：`merge_block=cold_current_open_block(body)`，<0 或 ≥block_count → `die("managed CFG merge batch lacks an open join block")`。
- plans=calloc 失败 → `die("out of memory staging managed CFG merges")`（64193-64195）。

### 1.2 逐请求计划（第一遍循环，64199-64540）

逐字段取值（64202-64228）：`first_slot/second_slot=op_value_def_slot[def]`（def 越界则 -1）；`first_kind/second_kind=slot_kind[slot]`；`first_type_id/second_type_id=op_value_def_exact_type_id[def]`。

- **ref 值 normalize 双臂**（64229-64254）：`first_kind_is_managed_ref`=kind∈{STR_REF, OBJECT_REF, SEQ_I32_REF, SEQ_STR_REF, SEQ_OPAQUE_REF}；`normalize_first_ref_value = first_is_ref && cold_ref_kind_for_value_kind(second_kind)==first_kind && cold_parser_exact_managed_ref_value_type_matches(body, first_slot, second_slot, first_type, second_type)`；`normalize_second_ref_value` 镜像。即一臂是托管 ref、另一臂是其值 kind 且精确类型按 ref↔value 规则匹配时，ref 臂在边上退化为值借用。
- **exact_type_family_matches**（64255-64259）：`first_type>=0 && (first_type==second_type || 任一 normalize 臂)`。
- **definition mismatch 门**（64260-64279，13 个合取，任一失败即触发 21 字段判词，判词后 `die("managed CFG merge batch definitions are invalid")` 64342）：`!local`；`first_def<0||>=op_count`；`second_def` 同款；`first_def==second_def`；`block_term[current_first]<0`；`block_term[current_second]<0`；`term_kind[block_term[current_first]]!=BODY_TERM_BR`；second 同款；`!cold_cfg_predecessor_reaches_merge(body,current_first,merge_block)`；second 同款；`first_slot<0||second_slot<0`；`!exact_type_family_matches`；`op_value_def_producer_function_row[first_def]!=body->producer_function_row`；second 同款。注意 reaches/BR 门对的是 `current_first/current_second`——随请求推进的当前 edge 链首块，不是原始前驱。
- **21 字段判词**（fprintf 64280-64340，逐字段来源，字段序即打印序）：`body`=body->debug_name（64283-64286）；`request=i/request_count`（64287）；`local`=local->name（64288-64291）；`first_def/second_def`=请求原值（64292）；`first_pred/second_pred`=current_first/current_second（64293）；`merge_block`（64293）；`first_term/second_term`=block_term[current_*]（64294-64295）；`first_reaches/second_reaches`=reaches_merge 重算 0/1（64296-64299）；`first_slot/second_slot`=op_value_def_slot[def]（64300-64303）；`first_kind/second_kind`=slot_kind[def_slot[def]]（64304-64313）；`first_type/second_type`=op_value_def_exact_type_id（64314-64317）；`first_place/second_place`=op_value_def_place_kind（64318-64321）；`first_ownership/second_ownership`=op_value_def_ownership（64322-64325）；`first_origin/second_origin`=op_value_def_origin_id（64326-64329）；`first_op_kind/second_op_kind`=op_kind（64330-64333）；`first_fn/second_fn`=op_value_def_producer_function_row（64334-64339）；`body_fn`=body->producer_function_row（64340）。（设计 §6 称「21 字段」，现树实打印 29 个值，以本清单为准。）
- **ownership 四值门**（64344-64361）：两臂 own 均须 ∈{MOVE, PLAIN, BORROW_SHARED, BORROW_UNIQUE} → 否则 `die("managed CFG merge batch ownership is invalid")`。
- **借用合并权威**（64362-64392）：`borrow_merge=双借用`；`first_borrow_root` 仅当 own==BORROW_UNIQUE 时 =`cold_exact_var_owner_root_definition(body,first_def,0)`，否则 -1；second 同款；`preserve_unique_borrow = borrow_merge && !normalize_first && !normalize_second && first_root>=0 && first_root==second_root`，回写 request->preserve_unique_borrow（64385-64386）；`merge_ownership = borrow_merge ? (preserve ? BORROW_UNIQUE : BORROW_SHARED) : MOVE`；`lift_first_borrowed = !borrow_merge && first_borrowed`（混合 owned/borrowed：借用臂在边上 retain 提升为 owned，64393-64396）。
- **canonical 槽与源槽门**（64397-64414）：`canonical_slot = normalize_first ? second_slot : first_slot`（ref 臂 normalize 时以值臂槽为头）；门：双槽在界内、`slot_kind[canonical]==local->kind`、且无 normalize 时双槽 kind 均==local->kind 且 size 相等 → 否则 `die("managed CFG merge batch source slots differ")`。
- **storage 门含双 UNKNOWN→PLAIN**（64415-64444）：`storage=slot_managed_storage_kind[canonical_slot]`；**双 UNKNOWN→PLAIN**（64421-64423 + 注释 64417-64420：纯数据 POD local 全路径 UNKNOWN，定义仅供身份追踪，按 PLAIN 收）；拒绝条件：`storage==UNKNOWN`、或 `storage!=PLAIN && second_slot storage!=storage`、或 `storage==PLAIN && second∉{PLAIN,UNKNOWN}` → fprintf（64433-64441：fn/local/first_slot/second_slot/first_storage/second_storage/kind）+ `die("managed CFG merge batch storage identities differ")`。
- **independent_plain_merge**（64445-64464）：`!borrow_merge && 双无 normalize && storage==PLAIN && 双槽 cold_plain_value_copy_is_independent` → merge_ownership 降 PLAIN、清双 lift（注释 64456-64460：只有结构独立 PLAIN 值可丢弃线性边 epoch；带地址 PLAIN 聚合如 Bytes/借用视图记录仍须一次精确 MOVE）。
- **staging 载体槽**（64465-64489）：`source_slot=body_slot(local->kind, slot_size[canonical])`；type/aux/no_alias 继承 canonical；`slot_exact_type_id[source_slot]=slot_exact_type_id[canonical]`（**从头戳播种，绝不从输入行取**，注释 64475-64477）；place=STACK_LOCAL；origin=自身；`slot_managed_storage_kind[source_slot]=storage`（注释 64483-64488：CFG_MERGE 自边校验器按此戳分类读边载体，与 merge destination 后记的 plan storage 一致）。
- **edge staging 先行**（64491-64540）：plan 记双 current 前驱+其 term（64493-64498）；双臂 `cold_insert_exact_phi_input_copy`（64500-64514，标志=normalize_*/lift_*/preserve_unique_borrow，出参=新 edge 块）；任一 edge<0 或 input_def<0 → `die("managed CFG merge batch edge staging failed")`（64515-64520）；merge_ownership==PLAIN 时双输入 def 的 own 强制改 PLAIN（64521-64529）；`current_first=first_edge; current_second=second_edge`（64530-64531，**请求间链式推进**：下一 local 的边分裂叠在本轮 edge 块之前）；plan 落 source_slot/storage/双 input_block；载体槽 storage 仍 UNKNOWN 时回填（64534-64537）。

### 1.3 `cold_insert_exact_phi_input_copy_on_sealed_edge`（63474-63753；wrapper 63755-63771 仅追加 reopen merge_block）

- 门 1（63483-63491）：body/前驱/source_def/destination/merge_block 越界、`block_term[predecessor]<0`、`def_slot[source_def]<0` → `die("managed phi input insertion is invalid")`。
- 门 2（63492-63508）：前驱 term 必须 BR（否则 `die("managed phi input edge is not a sealed predecessor")`）；若 `term_true_block[term]!=merge_block`（同边已被上一 local 分裂过）则链式接到既有边链前，edge_target 必须 reaches_merge，否则同判词。
- **transfer ownership**（63513-63516 → 63416-63472）：源槽 storage 权威 UNKNOWN → `die("managed phi transfer storage authority is unknown")`；独立 PLAIN 拷贝且源非借用 → PLAIN（注释 63437-63445：借用源豁免，preserve/shared 计划要求借用输入）；MOVE→MOVE；BORROW_UNIQUE→preserve?BORROW_UNIQUE:BORROW_SHARED；BORROW_SHARED→preserve 时 `die("managed phi unique transfer source is shared")`，否则 BORROW_SHARED；PLAIN 且非独立且 kind!=OBJECT → `die("managed phi plain transfer source kind is invalid")`，否则 independent?PLAIN:MOVE。
- **edge normalize 复检**（63528-63535）：`exact_ref_value_normalization = normalize_ref_value && 源借用 && ref_kind_for(destination_kind)==source_kind && ref_value_type_matches(source_slot,destination,...)`。
- 门 3（63536-63554）：源槽越界、（非 normalize 时 kind/size 不等）、exact_type<0、producer 不符、own 非四值、`lift_borrowed && 源非借用`、`preserve && (lift || own!=BORROW_UNIQUE)` → `die("managed phi input definition is incompatible")`。
- **边块生成与重定向**（63555-63561）：新建 edge_block，先把前驱 BR 的 true_block 改指 edge_block 再发任何精确物理源（注释 63557-63560：迟改写会把 retain/remat 消费者判为不可达）。
- **global remat**（63568-63648）：源为 GLOBAL_ADDR+PLACE_GLOBAL → remat=origin_id；否则用支配缓存对**被封前驱**（非新边块）查 `cold_exact_op_dominates_predecessor`，不支配则退 `cold_exact_phi_global_root`，<0 → 详情 fprintf（63592-63609 含 pre/post 序）+ `die("managed phi input definition does not dominate edge")`；remat 在边上新发 GLOBAL_ADDR 行+新槽全套戳（64621-63648），origin=global_index；global_index 越界 → `die("managed phi input global rematerialization is invalid")`。
- **normalize 臂**（63649-63674）：`cold_exact_managed_ref_value_borrow` 得值借用源（76638-76682+：源须借用+tuple 匹配，否则 `die("managed ref value projection lacks exact source definition")`）；结果 kind!=destination_kind 或 exact_type 不等或 own!=BORROW_SHARED → `die("managed phi ref/value normalization identity drifted")`；源替换为值借用，edge_ownership=BORROW_SHARED。normalize 源失效 → `die("managed phi ref/value normalization source is invalid")`。
- **lift 臂**（63675-63702）：`cold_emit_exact_shared_local_copy` 在边上 retain 拷贝（注释 63676-63679：原借用保留引用，提升拷贝 move 进 merge）；PLAIN 提升无 ORC，own=PLAIN（注释 63697-63698）。
- **拷贝行**（63703-63750）：action_block=当前 open 块，越界 → `die("managed phi input action block is invalid")`；发 `BODY_OP_COPY_COMPOSITE(destination, source_slot)`；物理源不精确 → `die("managed phi input physical source is not exact")`；戳：def_slot=destination、exact_type、producer、place=STACK_LOCAL、own=edge_ownership、origin=destination、source=source_def；edge_ownership==MOVE 且源 consume 未占 → `consume[source_def]=copy+1`（注释 63727-63731：标量行只记一个代表消费者，严格校验证互斥边）；发 BR 封 edge 块到 edge_target（63738-63740）；`cold_retarget_exact_merge_predecessor(body, merge_block, predecessor, action_block)`（63745-63746 → 70942-70970：把 join 块内既有 CFG_MERGE 行的 op_c 从旧前驱改写为新 edge 块，门 70945-70960）；`cold_publish_exact_managed_read`（63748-63750，批 2 read-edge 域）。

### 1.4 merge 定义发射（第二遍循环，64542-64747）

- reopen merge_block（64542）。
- **plan ownership drift 门**（64549-64575）：`plan_is_owned=merge_ownership∈{MOVE,PLAIN}`；输入 own 须落在同族（owned 计划要求输入 ∈{MOVE,PLAIN}，借用计划要求 ∈{BORROW_SHARED,BORROW_UNIQUE}）→ 否则 `die("managed CFG merge batch plan ownership drifted")`。
- **destination 校验**（64576-64598）：`destination_override<0` → 新雕槽并继承 canonical 头戳（type/exact_type/aux/no_alias，注释 64586-64587）；否则越界、kind!=local->kind、size 不等 → `die("managed CFG merge batch destination is invalid")`。destination storage 仍 UNKNOWN 时回填 plan storage（64600-64606），exact_type<0 时回填载体头戳（64607-64612）。
- **merge 行**（64613-64632）：`BODY_OP_COPY_COMPOSITE(destination, source_slot)`；戳：def_slot=destination、exact_type=载体头戳、producer、**place=CFG_MERGE**、own=plan->merge_ownership、origin=自身；`op_exact_source_a_value_def_op_id=-1` 重置（注释 64626-64627：回收行可带旧账）；`op_source=first_input`、`op_b=second_input`、`op_c=current_first`（最终 first edge 链首块）。
- **物理源自环校验**（64633-64661）：`exact_source_a!=-1 || !cold_exact_managed_read_source_edge_valid(merge_def, OPERAND_A, merge_def)` → sdbg fprintf（64639-64656：md/pre/edge/f/s/fet/set/met）+ `die("managed CFG merge physical source set is invalid")`；通过后 `exact_source_a=merge_def`（自环=canonical 物理源标记）。
- **consume 标记**（64662-64675）：输入 own∈{MOVE,PLAIN} → `consume[input]=merge_def+1`。
- **槽头戳与提交**（64676-64692）：destination place=CFG_MERGE、origin=merge_def、storage=plan storage（注释 64678-64681：槽头 canonical，绝不从输入行回写）；`local->slot=destination; local->value_def_op_id=merge_def; request->merge_def/plan->destination` 回填；merge_ownership==BORROW_UNIQUE → `cold_eager_unique_var_param_cell_view`（64689-64692 → 74895-74924：仅当 own BU+kind∈{OBJECT_REF,OPAQUE_REF,PTR}+place∈{PARAM,MEMORY_VERSION,CFG_MERGE}+unique 权威有效+三种 cell 形状之一时发 object ref 视图，否则静默返回）。
- **借用登记**（64693-64746）：`lift_first/second_borrowed` → `cold_record_exact_borrowed_phi_lift`（62946-63149：输入拷贝的 recorded source 为 shared owner，全字段门后追加 6 列 lift 表，判词 `borrowed phi lift identity is invalid`/`borrowed phi lift ownership is invalid`/`borrowed phi lift capacity overflow`）；merge_ownership 借用 → `cold_record_exact_borrowed_merge_inputs`（63151-63352：用输入拷贝的 recorded source 而非原 pre-edge def，注释 64727-64730；对表成双追加 6 列，判词 `borrowed merge pair identity is invalid`/`borrowed merge pair ownership is invalid`/`unique borrowed merge roots are not identical`/`borrowed merge pair was recorded twice`/`borrowed merge pair table is not atomic`/`borrowed merge pair count/capacity overflow`）。
- 出口回写最终双前驱（64748-64751）。

### 1.5 merge 族判词全 10 条（设计 §6「merge 族 9 条 + 21 字段 mismatch」）

| # | 判词（逐字） | 触发 | 行号 |
|---|---|---|---|
| 1 | `managed CFG merge batch state is invalid` | 状态门 13 合取任一 | 64186 |
| 2 | `managed CFG merge batch lacks an open join block` | 无 open join 块 | 64191 |
| 3 | `managed CFG merge batch definitions are invalid`（前导 21 字段 fprintf `managed CFG merge batch definition mismatch body=%.*s request=%d/%d local=%.*s first_def=%d second_def=%d first_pred=%d second_pred=%d merge_block=%d first_term=%d second_term=%d first_reaches=%d second_reaches=%d first_slot=%d second_slot=%d first_kind=%d second_kind=%d first_type=%d second_type=%d first_place=%d second_place=%d first_ownership=%d second_ownership=%d first_origin=%d second_origin=%d first_op_kind=%d second_op_kind=%d first_fn=%d second_fn=%d body_fn=%d`） | §1.2 mismatch 门 13 合取任一 | 64280-64342 |
| 4 | `managed CFG merge batch ownership is invalid` | own 非四值 | 64360 |
| 5 | `managed CFG merge batch source slots differ` | 源槽门 | 64413 |
| 6 | `managed CFG merge batch storage identities differ`（前导 storage fprintf） | storage 门 | 64433-64443 |
| 7 | `managed CFG merge batch edge staging failed` | 边拷贝/edge 块 <0 | 64519 |
| 8 | `managed CFG merge batch plan ownership drifted` | 输入 own 族与 plan 不符 | 64574 |
| 9 | `managed CFG merge batch destination is invalid` | override 槽 kind/size 不符 | 64598 |
| 10 | `managed CFG merge physical source set is invalid`（前导 `([sdbg])` fprintf，属诊断格式一部分） | 自环 read-edge 校验失败 | 64639-64658 |

附属判词（提交核对，移植时随填充点）：`managed conditional merge definition was not committed`（64808/86919）、`managed multi-line if merge definition was not committed`（77829）、`managed loop phi changed-local count drifted`（89442）、`managed loop phi input definitions are incompatible`（89401）、`managed loop phi close state is invalid`（89286）、`managed loop phi requires one open natural backedge`（89305）、`managed loop local identity query is invalid`（87437）、`managed loop global shadow lacks exact identity`（87468）、`loop borrowed merge promotion state is invalid`（88107）、`borrowed merge event order is invalid`（88132）。

## 2. 请求填充点

### 2.1 if/else join `cold_join_local_value_defs`（86252-86933）

- 入口门（86265-86313）：参数门；conditional 结果门（双臂 slot/kind/exact_type/producer/own 四值/storage 非 UNKNOWN，否则 `managed conditional result lacks exact arm definitions`）。
- 请求容量=`count + (has_conditional?1:0)`，另配 memory_version_requests 容量 count（86314-86330）。
- **证据收集**（逐 local，86342-86885）：`true_def=true_states[i].value_def_op_id`、`false_def=false_states[i].value_def_op_id`（两臂快照）；`true_def==false_def>=0` 时先回 publish consume 代表（86355-86367）；单臂不到 join 时 reconcile baseline consume（86347-86354）；双到且 def 不同：`is_global` 先走 global shadow 通道（86371-86445，同 GlobalDef 行则复原 baseline 并 continue，否则 `global shadow CFG join lacks exact row identity`）；`exactly_one_unavailable`（86463-86565）走独立链（三判词）不进 merge；**compatible**（86567-86583：双 owned / 双借用 / 混合 owned+borrowed——混合时借用臂 lift）后：恢复双快照 consume（lane informational 区分，86585-86611，同批 2 consume 通道语义）；双臂 consumption dataflow（86612-86692，含 CFG_MERGE/MEMORY_VERSION 嵌套 join 的 current-at-predecessor 救济四条——借用两条 86639-86658、owned 两条 86669-86692）；非双 uniform_live 走 move 关闭链（86750-86830，三判词 `managed branch local state is not exact`/`managed branch move state is invalid`/`managed branch move retained a live owner`）；**请求填充**（86831-86847）：`local->slot=true_states[i].slot`；`same_place_memory_version_inputs`（85992-86043：同槽+同 type+双 owned 或双 BU 同根）为真进 memory_version_requests，否则进 merge_requests；`request->local=local; first_def=true_def; second_def=false_def; destination_override=-1`。双不到/单到直接取快照（86877-86884）。
- **conditional_merged 填充**（86886-86897）：追加在 merge_requests 尾部，`local=&conditional_merged`（合成 Local：slot=conditional_first->slot、kind=conditional_kind、value_def=-1），`first_def/second_def`=两臂表达式结果的 value_def_op_id，`destination_override=-1`。
- **提交**（86898-86933）：先 `cold_merge_exact_local_defs_batch`（回写双最终前驱），再 `cold_merge_exact_same_place_memory_versions_batch`（86045-86250，同槽版本族，另族）；conditional 结果核对 merge_def 已提交（86914-86926）。

### 2.2 loop join `cold_close_exact_loop_phis`（尾部 89288-89476）

- 状态门（89280-89287）；`changed_count`=逐 local `cold_loop_local_needs_exact_phi`（87429-87520+：entry/backedge def 相同→否；非 global→双快照均精确 managed；global shadow 复用分支 join 证明+type-less 定长数组 GLOBAL_ADDR 豁免 87480-87488+borrow graph 双匹配）；为 0 直接返（89297）。
- 形状门（89298-89306）：preheader term 必须 BR→condition_block 且 backedge 无 term（一个 open 自然回边），否则判词；新建 merge_block，preheader BR 改指、backedge 分支到它、reopen、挂 pending dominator edge（89307-89312）。
- **请求填充**（89321-89439）：非 phi local 恢复 entry 定义+consume（89327-89358，注释 89328-89336）；phi local：`first_def=entry_def`（entry_states 快照）、`second_def=backedge_def`（backedge_states 快照）、**`destination_override=entry_slot`**（与 if/else 唯一的 -1 不同——loop phi 复用入口槽）；前置门：双 owned/双借用/混合 + exact_type 相等 + kind/size 相等（89369-89402，`managed loop phi input definitions are incompatible`）；consume lane 恢复（89410-89432）。
- `merge_request_count!=changed_count` → `managed loop phi changed-local count drifted`（89440-89442）；提交 batch（89444-89448）；清 pending 边、merge_block 分支到 condition_block（89449-89451）；**借用→owned 提升事件**（89452-89476：entry 借用而 merge 结果 owned → `cold_promote_exact_loop_borrow_merge_events` 88083-88200+：borrowed merge 表逐对扫，loop 区间内的 phi 把 entry 边借用事件改写为 owned，判词 88107/88132）。

### 2.3 两处单请求变体

- 条件表达式结果 `cold_merge_exact_managed_conditional_result`（64755-64813）：双臂 ColdExprResult 全字段门（64761-64789）→ 合成 Local（slot=first->slot）→ 单请求 batch → 提交核对 → publish。
- 多行值 if（77814-77834）：合成 Local（slot=then_slot、kind=arm_result_kind），`first_def=then_def; second_def=else_def; destination_override=-1`，提交核对；ref kind 臂先 `cold_exact_managed_ref_value_borrow` 对齐（77784-77796）。

### 2.4 与点活性 walker 的交互

`cold_cfg_predecessor_reaches_merge`（63830-63844 + visit 63773-63823）：权威=「每条有限后继路径都到 merge」（注释 63825-63829），三态 DFS 记忆化，BR 单后继/CBR 双后继/SWITCH 全 case（found 必须==term_case_count 63818-63819），环、open 块、exit、部分 switch 域均拒。批 4 所有 CFG 证明（mismatch 门 64270-64273、边链 63504、borrowed recorders 63012/63226）只用它，不用块序或支配；与批 2 walker 的支配缓存在 phi remat（63580-63585）与 current-at-predecessor 救济（86643-86690）处交汇。

## 3. 借用合并权威

- **borrow 根相等**：`preserve_unique_borrow` 只对双 BORROW_UNIQUE 取根（64369-64378），根相等才保 unique；任一为 shared 或根不同 → merge 降 BORROW_SHARED（64387-64392）。`cold_record_exact_borrowed_merge_inputs` 对 BU merge 复证双源均 BU 且根相同（63240-63254）。
- **根求值 `cold_exact_var_owner_root_definition`**（wrapper 27174-27195 走 memo 槽 7；impl 15029-15138）：迭代工作栈；每节点先证 slot/producer 合法；父指针按 place 分派——CFG_MERGE→{source, op_b} 双父（15081-15083）、SHARED_COPY/BORROW_PROJECTION→origin（15084-15088）、MEMORY_VERSION→source 或 origin（自指为终根，15089-15098）、有 source→source、否则 TEMPORARY/STACK_LOCAL/PARAM/GLOBAL 为终根（15099-15107）；SEQ_OPAQUE_TAKE_DYNAMIC 精确 tuple 为终根（15069-15080）；出现两个不同终根 → -1。
- **与批 3 投影权威/帧自有的共享 helper 面**：同一根函数在批 3 用于借用投影根/参数权威（17252、23280、39084、75700 等）；`cold_plain_value_copy_is_independent`（60240-60286：OBJECT 非 ref+无 managed drop+无借用地址；ARRAY_I32 同款）同时服务批 3 plain_copy_edge 臂（批 3 规格 §1 臂 4/5）与批 4 independent_plain_merge（64445）+transfer ownership PLAIN 判定（63433）；`cold_exact_storage_authority_for_slot` 为批 1 戳权威，merge 门、conditional 门、transfer 门共用；`cold_cfg_predecessor_reaches_merge`、`cold_exact_definition_reaches_consumer`（62987）与批 2 reaches/current 基元同源。
- **Cheng 侧对应物**：C 的根求值是沿 source/origin 列的游走；Cheng BodyOp 已冻结 `valueDefBorrowOwner{SemanticRow,DefinitionDomain,DefinitionRow}` 三列（core_types.cheng:475-477，注释 471-474「OwnBorrowShared 的精确寿命根」）——borrow 根相等在 Cheng = 冻结列逐值相等，不重走（与批 2 §5-7「解析期查询不移植」同一原则；批 3 投影权威同吃这三列）。

## 4. Cheng 转化对照：时序约束 → 空间约束

C 是解析期逐边发 phi：状态门/open join 门依赖「当前 open 块」这一时序位置；edge staging 与 merge 定义的先后靠调用序保证；后续请求分裂同边时靠 `cold_retarget_exact_merge_predecessor` 回写既有 merge 行 op_c。Cheng 无解析期 open 块，批 4 在 seal 后以空间不变量校验同语义：

| Cheng seal 后不变量 | 对应 C 条款 |
|---|---|
| join 块首存在连续 merge 定义区间（merge 定义集中、不被普通 op 穿插） | 第二遍循环 reopen 后连续 body_op（64542-64543）+ 排序注释 64170-64173 |
| 每条入边 pred→join 上是 edge block 链，每 local 的 input copy 是其 edge 块最后一行（`block_op_start+block_op_count==input+1`），链尾 BR→join | 63003-63005、63217-63219、63738-63740 |
| 每 local 一双 edge 块，first 侧链首块==merge 行 op_c | 64530-64531、64632、retarget 70942-70970 |
| 双前驱链首各有 BR term 且全路径到达 join（用 CSR 后继列证，等价 reaches_merge） | 64264-64273、63773-63844 |
| merge 请求身份=（merge 槽， 双前驱 blockEndStates 的 (domain,row)），def 不同才产生请求 | if/else 86368-86370 双快照 def 不同；loop 87439-87441 |
| merge 定义行三输入（source/op_b/op_c）+自环 read-edge | 64628-64661 |
| edge actions（remat/normalize/lift/copy）物理居 join 之前 | 63555-63750 全部 |
| destination/源槽/storage/ownership/plan-drift 门逐条 | 64403-64598 |
| destination_override=entry_slot（loop）vs -1（branch/conditional） | 89438 vs 86846/86896 |

**§7-4 六列精确列供数**（progress.md:1457 裁定「valueDefSlot+双前驱 blockEndStates (domain,row)，六列精确列全现成」）：

| 列 | 位置 | 供 C 侧何物 |
|---|---|---|
| `opStart/opCount/termIndex`（BodyBlock） | core_types.cheng:487-489 | block_op_start/op_count/block_term；merge 区间定位、input-copy 块末行门、edge staging 先行空间校验 |
| `opBlockIds`（DefinitionCfg） | body_ir_access.cheng:174 | cold_block_index_for_op（C 为派生非权威，Cheng 为冻结列） |
| `termSuccessorStarts/Counts/successorBlockIds`（BodyIR CSR） | core_types.cheng:992-993 | term_true/false_block、switch_*；BR 门与 reaches_merge 全路径证明 |
| `blockEndStates`（DefinitionCfg） | body_ir_access.cheng:181 | true_states/false_states/entry/backedge 快照在 join 点的当前定义 (domain,row)——first_def/second_def 的 Cheng 来源 |
| `definitionSlotsByOrdinal`（ManagedDefinitionIndex） | body_ir_access.cheng:148 | op_value_def_slot[def] |
| `valueDefSlot/valueDefOwnership`（BodyOp 侧车） | core_types.cheng:467/470 | op_value_def_slot/ownership；另有 valueDefConsumeOpIndexPlusOne(478)、valueDefOriginKind/Id(479-480)、sourceDefinitionDomain/Row(481-482) 对应 consume/origin/source 列 |

## 5. 首红判词实例逐字段解码

样例（.tmp-exec/mapgen/driver_build2.log:117；progress.md:1173 录为「typed_expr 最深语义墙」，设计 §4 批 4 夹具）：

`cheng_cold: managed CFG merge batch definition mismatch body=TypedExprBuildFactsAppendPreparedSourceRangeFacts request=0/1 local=gPKindBucketCnt first_def=601 second_def=589 first_pred=96 second_pred=97 merge_block=98 first_term=94 second_term=95 first_reaches=1 second_reaches=1 first_slot=583 second_slot=571 first_kind=9 second_kind=9 first_type=-1 second_type=-1 first_place=5 second_place=5 first_ownership=3 second_ownership=3 first_origin=357 second_origin=357 first_op_kind=156 second_op_kind=156 first_fn=11452 second_fn=11452 body_fn=11452`

- `body`：函数混淆名；`request=0/1`：唯一请求第一轮即死；`local=gPKindBucketCnt`：被合并 local。
- `first_def=601/second_def=589`：两臂当前定义行；`first_pred=96/second_pred=97`：当时 edge 链首块（本例即原始前驱）；`merge_block=98`；`first_term=94/second_term=95`：双前驱终结符行，BR 门已过（否则 reaches/term 子句先死但同判词不可区分，须看其余字段）。
- `first_reaches=1 second_reaches=1`：全路径到 merge 证明双臂通过。
- `first_slot=583/second_slot=571`：两定义落不同槽（同 global 的两次 remat）；`first_kind=9 second_kind=9`=SLOT_OBJECT_REF（18290）。
- **`first_type=-1 second_type=-1`：致死合取**。`exact_type_family_matches`（64255-64259）要求 first_type≥0，双 -1 直接假；两条 normalize 臂也要求 type≥0（74252-74262）同样假。
- `first_place=5 second_place=5`=PLACE_GLOBAL；`first_ownership=3`=BORROW_SHARED；`first_origin=357 second_origin=357`=同一 GlobalDef 行；`first_op_kind=156`=BODY_OP_GLOBAL_ADDR（17916）；`first_fn=second_fn=body_fn=11452`：producer 门通过。
- 结论：双臂是同一全局行的 GLOBAL_ADDR 重材料化（无类型 global 影子形），结构合法但精确类型戳为 -1，死于 13 合取中的 `!exact_type_family_matches`（64275）。对照 loop 填充点有同形豁免（type-less GLOBAL_ADDR 影子不需 phi，87480-87488），if/else 路径无此豁免——Cheng 批 4 夹具要求该形转绿，即 Cheng 侧 BodyIR 须在 merge 前为 GLOBAL_ADDR 影子补齐精确戳或在 derive 臂按同 GlobalDef 行（origin 相等+place GLOBAL+op GLOBAL_ADDR+own BORROW_SHARED）证同定义不收 merge 请求。

## 6. Cheng 基板差异提醒

1. **无 CFG_MERGE op 行的各条款对应物**：C 的 merge 定义是物理 COPY_COMPOSITE 行+七戳；Cheng 批 4 落点是 derive merge 定义臂（exact_def_merge.cheng）——merge 定义作为 ManagedDefinitionIndex 的派生 ordinal 存在，place=CFG_MERGE/own/destination 由侧车戳承载。C 的 `op_source/op_b/op_c` 三列（双输入+第一前驱块）在 Cheng BodyOp 只有单 `sourceDefinition{Domain,Row}`（481-482）：第二输入与前驱锚定须由空间不变量回收——merge 区间内定义序==请求序、双输入==两侧 edge 链末行 destination==merge 槽的 copy 行、op_c==first 侧链首块（批 4 落地时若需显式列，属新增侧车，设计未定，实施前须裁定）。
2. **与批 2 walker 的共享面**：reaches_merge 的 Cheng 对应物直接用批 2 DefinitionCfg（opBlockIds+CSR 后继列）做全路径到达证明，不建第二套 DFS；consume 代表（63727-63737）、consume lane informational 恢复（86585-86611/89410-89432）、current-at-predecessor 救济（86639-86692）全部复用批 2 consume 四通道与 current 基元；read-edge 自环校验（64633-64661）是批 2 read-edge 完成器的 CFG_MERGE 臂。
3. **与批 3 identity 的共享面**：borrow 根相等走批 3 同款冻结三列（valueDefBorrowOwner*），C 侧 `cold_exact_var_owner_root_definition` 的 CFG_MERGE 双父/MV/SHARED_COPY/BORROW_PROJECTION 父指针规则与批 3 source chain 六臂同源；`cold_plain_value_copy_is_independent` 与批 3 plain_copy_edge 共用；merge 行同样受批 3 主审 def↔slot 四字段一致与定义组完整性约束（批 3 规格 CFG_MERGE 臂即「else=CFG_MERGE 臂 69392-69553」的 21 字段 `managed CFG merge definition is broken`，与批 4 是同一行的两面：批 4 管发射时权威，批 3 管 seal 后主审）。
4. **DefinitionCfg lattice 的 Ambiguous 与 C open join 门**：Cheng `BodyIrAccessCfgAmbiguous=-2`（body_ir_access.cheng:187-191）是 join 点双前驱当前定义不同的汇合标记——正是 C 侧 if/else `true_def!=false_def`（86368-86370）与 loop `entry_def!=backedge_def`（87439-87441）产生 merge 请求的触发条件；C 的 open join 门（64188-64192）在 Cheng 无对应物，由「join 块首连续 merge 区间」空间不变量整体替代；`Unreached=-3` 对应 C 单臂不到 join 的 exactly_one_unavailable 分支（86463-86565，不进 merge）。
5. **填充点时序差**：C 在解析中逐 join 调 batch（current 前驱随请求链式推进 64530-64531）；Cheng 在 seal 后单遍 derive，请求间边链叠加关系须由 edge block 链的空间序（每 local 一对 edge 块、链内顺序==请求序）重建，不能依赖任何「当前 open 块」状态。
6. **判词计数差**：设计 §6 称「21 字段 mismatch」现树实打印 29 个值（§1.2 清单）；merge 族 10 条 = §1.5 表；附属提交核对判词与 borrowed 族判词（§1.5 末段）按填充点随带移植。探针残留（`([smgw])`/`([prd])`/`CHENG_COLD_DISABLE_PHI_REMAT`）不移植。