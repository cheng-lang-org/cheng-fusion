# ExactDef 批 2 算法规格（自 C 冷链提取）

> 2026-08-25 侦察代理产出，供批 2（点活性 walker + consume 边 + read-edge）实施使用。
> 配套设计：docs/cheng-exact-def-rewrite-design.md §4 批 2。每条给 C 行号证据。

## 0. 公共基元

- 状态位（`cheng_cold.c:54632-54637`）：`UNDEFINED=1 / LIVE=2 / CONSUMED=4 / RELEASED=8`，按位掩码，join=按位或（`54828`）。「纯 LIVE」= `(state&LIVE)!=0 && (state&(UNDEFINED|CONSUMED|RELEASED))==0`。
- place 9 值（`18399-18413`）：`INVALID0/TEMPORARY1/STACK_LOCAL2/PARAM3/BORROW_PROJECTION4/GLOBAL5/CFG_MERGE6/SHARED_COPY7/MEMORY_VERSION8`。own 5 值（`18391-18395`）：`INVALID0/PLAIN1/MOVE2/BORROW_SHARED3/BORROW_UNIQUE4`。term 4 值（`18255-18258`）：`RET1/BR2/CBR3/SWITCH4`。
- BodyIR 权威列（`18511-18532`）：`op_kind/dst/a/b/c`、`op_value_def_{slot,exact_type_id,producer_function_row,place_kind,ownership,origin_id,consume_op_index_plus_one}`、`op_source_value_def_op_id`、`op_exact_source_{dst,a,b,c}_value_def_op_id`；`term_{kind,true_block,false_block,source_value_def_op_id}`；`block_{op_start,op_count,term}`；`switch_{block,term}`；`slot_{kind,size,exact_type_id,place_kind,origin_id,managed_storage_kind}`；CSR `call_arg_{slot,value_def_op_id,ownership}`。`op_block_index` 是派生 owner，非权威。
- `reaches(def,consumer)`（`51633-51657`）：`def==consumer`→false；双块未知→`def<consumer`；单块未知→false；同块→`def<consumer`；跨块→`block_dominates(defBlock, consumerBlock)`。
- `block_dominates`（`49203-49211`）：支配树 pre/post 区间包含（双方 preorder≥0 且 `pre[d]≤pre[b] && post[b]≤post[d]`）。
- `is_current_at_predecessor(def, pred, boundaryOp)`（`51739-51826`）：`op_dominates_predecessor`（`51611-51631`）且若 boundary 与 def 同在 pred 块则 `def<boundaryOp`；然后沿 idom 链从 pred 逐块上行到 defBlock，每块扫 `[start,end)`（defBlock 起点 `def+1`，pred 块截到 boundaryOp），凡 `op_value_def_slot==slot[def] && place!=INVALID` 的 candidate 即 false；到不了 defBlock 也 false。
- `is_current_at_consumer(def, consumer)`（`60339-60349`）：`block(consumer)>=0 && reaches(def,consumer) && is_current_at_predecessor(def, block(consumer), consumer)`。

## 1. 点活性 walker

### 1.1 支配缓存

- 结构（`18474-18506`）：`built_generation, block_count, term_count, switch_count, pending_edge_{from,to}, reachable_count, edge_count, idom[B], preorder[B], postorder[B], predecessor_offsets[B+1], predecessors[E], cyclic_blocks[B]`，外加单份 query-relevant 切片状态。
- 失效（`49294-49309`）：`built_generation==cfg_generation && block_count==block_count` 命中复用，否则重建。
- 构建（`48866-49201`）：边集=每块 term 的 BR true / CBR true+false / SWITCH 全部 case + 至多 1 条 pending 边；`edge_cap=2B+switch+pending`；正逆 CSR；RPO DFS；Cooper 式 idom 不动点（`pass_limit=RPO²+1` 超了 die）；支配树 pre/post（`clock!=2*order_count` die）；Kosaraju SCC 填 `cyclic_blocks`。不可达块 `idom=-1`、`preorder=-1`。
- query-relevant 切片（`49213-49292`）：键 `(flow_entry, flow_end, query_block)`；从 query_block 沿前驱逆 BFS 裁到 `[flow_entry, flow_end)`；**哨兵 1**：`queue_tail>=block_count` → `die("exact point liveness reverse queue overflow")`；扫切片内回边置 `query_has_backedge`。

### 1.2 查询入口链

- `query_from`（`54949`）参数门（`54963-54989`）；`uncached`（`55843-55894`）：无块线性扫；`queryBlock≥0` 先试 defer 快道（解析期专用，**不移植**）；否则 `query_from(def, 0, block_count, UNDEFINED, …)`。
- `query`（`55899-55948`）：冻结期 memo，键 `(def,queryBlock,queryOp)`。
- `is_live_before_op`（`55968-56044`）：同块 `def<consumer`→半开区间扫（names_candidate&&consumes 或 owned_slot_overwrite 任一即 false；冻结用 first_consume 表）；否则 sparse 快道（`54511-54610`）；否则全查询 `state==LIVE`。
- `is_live_at_current_point`（`56222-56379`）：同块倒排索引扫；sparse；全查询；CFG_MERGE 版本链容忍（`56300-56319`）；判词 `exact point liveness failed function=%.*s definition=%d query_block=%d valid=%d state=%u consume=%d definition_block=%d`（`56322`，**仅 diag env 开启时打印**）；返回 `valid && state==LIVE`（LIVE|CONSUMED 混合即拒）。

### 1.3 主循环（`54949-55841`）

容量：**哨兵 2** `block_count > (INT32_MAX-1)/5` → `die("exact definition work queue size overflow")`；`flow_queue_capacity = 5*block_count+1`。

初始化：切片存在时校验缓存四件套（`55035-55042`）；`!relevant[flowEntry]` → 判词 `exact point liveness query is unreachable body=%.*s definition=%d query_block=%d flow_entry=%d flow_end=%d block_count=%d` + 逐块 `exact point graph block=%d relevant=%d op_start=%d op_count=%d term=%d kind=%d true=%d false=%d` 返 false。`entry_states[flowEntry]=entryState`；`queue=[flowEntry]`。

出队块 block（`55081-55827`）：

1. `relevant && !relevant[block]` → valid=false 终止。`state==0` → 终止。
2. 块 op 区间；`queryOpExcl` 在块内则截断；越界→终止。
3. 逐 op：
   - `op==definition`：`state&LIVE` → 算 borrowed/plain reentry + 七臂（§1.4），`exact_nonresource_loop_reentry` 成立 → `state=LIVE; batch_consume_op=-1; continue`；否则 valid=false。否则 `state=LIVE; continue`。
   - 候选过滤：`(names_candidate && consumes) || (纯LIVE && owned_slot_overwrite)`，否则 continue。
   - `place[op]==CFG_MERGE` → continue（phi 边上消费）。
   - 非纯 LIVE 三容忍（序）：(a) CONSUMED 且 var_out_batch_supersede/version_chain_supersede→continue；(b) CONSUMED 且代表 RET-exit 或互斥消费者对→容忍，LIVE 半→`CONSUMED|(state&UNDEFINED)`；(c) CONSUMED 且跨槽 MV/CFG_MERGE 谱系戳→同 (b)。
   - 全不容忍→判词 `exact consume dataflow body=%.*s definition=%d block=%d consumer=%d state=%u def_kind=%d def_dst=%d def_a=%d def_b=%d def_c=%d def_ownership=%d def_place=%d consumer_kind=%d consumer_dst=%d consumer_a=%d consumer_b=%d consumer_c=%d consumer_source_def=%d`→valid=false。
   - 通过：`state = consume_only_drop ? RELEASED : CONSUMED`（drop 判定 `51828-51858`：COPY_COMPOSITE 全空组+source==def+a==defslot+同 kind/size+own∈{MOVE,PLAIN}）；`batch_consume_op = CONSUMED ? op : -1`。
4. 块出口：query 点在块内→存 exit  continue。`edge_merge`（`54465-54502`：BR 后继块首 CFG_MERGE 行双臂，≥2 返 -1）≥0：非纯 LIVE→判词 `exact consume dataflow definition=%d block=%d edge_merge=%d state=%u`；own 非借用→CONSUMED。`term_source==def`：须 RET 且纯 LIVE，否则判词 `exact consume dataflow definition=%d block=%d term=%d state=%u`；借用豁免。按 term kind join 后继（`54807-54841`：越界 false、不 relevant true、有增量才入队）。

结束：`*out = valid && queryBlock 合法 ? exit_states[queryBlock] : 0`。

### 1.4 七条重入臂（`op==definition && state&LIVE` 下）

记 `succ = consume_plus_one[def]-1`，`S=slot[def]`：

1. `path_split_version_reentry`：borrowed && place∈{MV,CFG_MERGE} && own 借用。
2. `call_var_out_reentry`：def=NOP+MV+BU+source==-1；succ>def 且 NOP+MV+BU+同槽且（source[succ]==def 或 origin[succ]==def）。
3. `plain_cfg_merge_incoming_reentry`：own==PLAIN && succ>def 且 succ=NOP/COPY_COMPOSITE+CFG_MERGE+own∈{PLAIN,MOVE}+同槽+origin[succ]==succ 且（source[succ]==def 或 op_b[succ]==def）。
4. `owned_cfg_merge_version_link_reentry`：place==CFG_MERGE && own==MOVE && 0≤succ<def 且 succ=NOP+MV+同槽+source==def+origin==def。
5. `owned_same_place_merge_reentry`：place==CFG_MERGE && own∈{MOVE,PLAIN} && origin[def]==def；a=source[def]、b=op_b[def] 均 `<def` 且 `consume_plus_one[a]==consume_plus_one[b]==def+1`。
6. `version_marker_rep_reentry`：succ 合法且 NOP+place∈{MV,CFG_MERGE}+同槽。
7. 汇合=主循环第 3 步 exact_nonresource_loop_reentry 析取；RELEASED 永不重入。

辅助：`var_out_batch_supersede`（双 NOP+MV、`op_a` 相同且 CALL 钉）；`version_chain_supersede`（代表 NOP+MV 且 source==def 或 origin==def）；`mutually_exclusive_pair_valid`（`52017-52222`：双消费者不同 effective block+merge 块支配关系或定义支配+双向 BFS 不互达）。

## 2. consume 谓词（`52694-53136`）

**通道 1：source 列**——豁免按序：①plain_memory_version_source_read；②静态 str append 豁免（SEQ_STR_ADD 全条件链 `52716-52763`）；③静态 str copy 豁免（COPY_COMPOSITE `52776-52833`）；④var-out NOP 臂→直接 return `slot[consumer]==slot[def]`（同槽 tie，`52843-52860`）；⑤plain_copy_tuple_valid；⑥定长数组投影读（ARRAY_OPAQUE_INDEX_REF_DYNAMIC 全空组）；⑦place==SHARED_COPY；⑧frozen 标量 var 变异 NOP（NOP+MV+`op_a∈{I32_REF_STORE,PTR_STORE_I64}` 且 `def<consumer || (reaches && current)`）→ **return true**；⑨借用豁免（非 var-out NOP 且 own 借用）→ false；⑩opaque_sequence_take_source_tuple_valid；⑪owned_object_field_projection_shape→return `consume_plus_one[def]==consumer+1`；⑫owned_ref_object_field_projection_shape→false；⑬PAYLOAD_LOAD 读效（全空组+a==defslot+（借用 或 PLAIN/MOVE+0<c≤8+非 STR））；⑭裸指针投影行（全空组+dst/kind 白名单+def own 四值）；⑮以上皆非→**return true**。

**通道 2：CSR**（`53058-53089`）：CALL_COMPOSITE/MAKE_COMPOSITE/MAKE_SEQ_OPAQUE；`arg_start=(MAKE_SEQ? a : b)`、`arg_count=c`；首个 `call_arg_value_def_op_id[row]==def` → return `call_arg_ownership[row]==MOVE`。

**通道 3：CFG_MERGE op_b**（`53129-53135`）：`place==CFG_MERGE && op_b==def && own[def]∈{MOVE,PLAIN}`。

**通道 4：frozen var-out NOP origin**（`53105-53128`）：frozen-only && NOP+MV+CALL 钉 && `origin==def && source==-1` && 同槽 tie &&（同块 `def<consumer` 或 `reaches && is_current_at_consumer`）。

**四枚举位点必须同源单遍产出**：`names_definition_candidate`（`20922-20958`）/`consumer_index_add_op`（`53260-53310`）/`frozen_first_consume_build`（`53736-53810`，另加 owned_slot_overwrite，仅前向）/`consumer_summary_build+record`（`54334-54456`，record 重放谓词计数，terminal 经 term_source 单列）。四处均 = source 列 | frozen-origin | CSR | merge op_b。

**缺陷 A-D 终态**（consume-edge-20260825/ANALYSIS.md）：A=四枚举位点经 helper 全覆盖 origin 通道；B=reissue 借用循环门收敛为同槽 tie；C=origin 通道跨块必须 reaches+current；D=谓词/补戳器/walker 跨槽统一同槽 tie。

**审计判词**（`69563-69758`）：`has invalid path consume`（条件 `consumer_count+terminal>1 && !dataflow_valid && 两条 PLAIN 容忍不成立`；字段序 `exact identity schema [%s] fn=%.*s op row=%d kind=%d slot=%d has invalid path consume op_consumers=%d term_consumers=%d first=%d first_kind=%d second=%d second_kind=%d recorded=%d recorded_found=%d dataflow_valid=%d`）；`consume edge is broken`（四析取 `69720-69735`；字段序同上但无 kind/slot 字段）。

## 3. reissue（`cold_parser.c:26838-27024`）

先清零证书列。四循环只补 `consume_op_index_plus_one` 空位：

1. 标量 var 变异 NOP：`op_a∈{I32_REF_STORE,PTR_STORE_I64}`；source=source 列，要求 `op_b==source && origin==source`；`source<consumer`→补；否则 `reaches(source, op_a) && is_current_at(source, op_a)`→补。
2. 借用 call var-out（PARAM 形，缺陷 B 终态）：NOP+MV+CALL 钉+`source==-1`；source=origin；要求同槽 tie（不再要 place==CFG_MERGE）；空位时 `source<consumer && 同块`→补，否则 `reaches+current@call_op`→补。
3. owned call var-out：source=source 列，要求 origin==source+同槽；空位时 `source<consumer`→补（**无同块门**），否则 `reaches+current@call_op`→补。
4. 证书授予：NOP+MV 定义不被三结构验证器覆盖→必须过 `cold_exact_call_var_out_definition_valid`，否则判词 `[reissuefail] fn=%.*s def=%d kind=%d place=%d own=%d origin=%d src=%d consume=%d dst=%d a=%d b=%d c=%d slot=%d type=%d` 返 false。

## 4. read-edge

**判词链**：`cold_freeze_body_rewrites`（`cheng_cold.c:24462`）→ `cold_complete_exact_managed_read_edges` 失败 → `read-edge freeze fail row=%d fn=%.*s`（`24482`）→ `die("cold BodyIR physical-source canonicalization invalid")`（`24486`）。现树完成器在 `cold_parser.c:21525`。

**共享 helper**：operand 映射（`20587-20635`，DST/A/B/C×四列）；角色（`20535-20585`）；`operand_required`（`20977-21041`）：allowed 且非 LOCAL_ADDR 哨兵、非 str 序列字面量 staging append DST、槽静态道齐、非「全 body 无同槽定义的首存」DST。

**source_edge_valid**（`20637-20873`）：自边两形（CFG_MERGE 双臂 `20659-20701` / PARAM 边界 `20702-20726`）；一般形车道（槽链全等+（shared_borrow_param 或 global_addr 借用 或 bypass_currency））；`bypass_currency = (version_chain || cert || self_merge_aggregate || sole_mv) && reaches && (source<op || is_current_at_consumer)`；四条旁路（version_chain ≤8 跳逐跳 current / cert 自根 MV+证书 / self_merge_aggregate 半开区间无同槽定义 / sole_mv MV 同槽+consume==0+区间干净）；**reaches 门即缺陷修复 1**（`20849-20867`）。现树 `[ev]/[ev0]/[ev1]` 是探针残留，不移植。

**完成器**（`21525-21676`）：
1. 每槽定义索引（倒序插入得升序链）。
2. 逐 op×operand：`!required`→跳过；`column>=0 && edge_valid`→保留；陈旧钉线重解析（不静默死）。
3. Pass 1（状态机 current）：仅收 `edge_valid && is_current_at_consumer`；≥2→判词 `read-edge ambiguous op=%d operand=%d slot=%d resolved=%d cand=%d opkind=%d` 返 false。
4. Pass 2：Pass 1 空时启用完整 validator，同一唯一性。
5. 双空→判词 `read-edge unresolved op=%d operand=%d slot=%d candidates=%d opkind=%d dst=%d a=%d b=%d c=%d` 返 false。
6. 终校验（`21447-21518`）：`source>=0`→必须 valid，否则 `managed direct-read edge invalid fn=%.*s op=%d kind=%d operand=%d slot=%d source=%d`；required 缺失/多余→`managed direct-read edge missing/extra fn=%.*s op=%d kind=%d operand=%d slot=%d source=%d required=%d b=%d c=%d slot_kind=%d slot_place=%d slot_storage=%d`。

**解析期七处全部不移植**（设计 §5-7），Cheng seal 后不变量全集：(a) 四条 dense read-edge 列存在；(b) `required ⇔ source>=0`，`source>=0 ⇒ source_edge_valid`；(c) 每 required 边恰一个全证候选（Pass1 优先、Pass2 兜底；0→unresolved、≥2→ambiguous、陈旧重解析）；(d) 自边仅两形；(e) 四条当代性旁路全经 reaches 门，前向行额外要 current。

## 5. 数据流工作区（`54646-54795`）

SoA：`entry_states u8[B]`、`exit_states u8[B]`、`flow_queued bool[B]`、int32 对齐后 `query_relevant i32[B]`、`flow_queue i32[5B+1]`。容量：初 64 倍增，上界 `(INT32_MAX-1)/5`，`flow_queue_capacity=5B+1`。acquire 只清 entry/exit/queued 三列；租约制防 malloc 风暴；编译边界整池 drain。

## 6. Cheng 基板差异提醒

- DefinitionCfg lattice（`body_ir_access.cheng:173-191`、`3880-4367`）：稠密全定义槽粒度块级不动点，states∈{Unreached(-3),Ambiguous(-2),Consumed(-1),ordinal≥0}，stepLimit=4B+4。映射：C LIVE≈ordinal；CONSUMED≈Consumed；位掩码混合态≈Ambiguous；**C UNDEFINED≠Unreached**（入口块用 entryDefinitionOrdinals 初始化）；**C RELEASED 在 Cheng 无对应值**；C 路径敏感容忍（batch supersede、RET-exit、互斥消费者对、跨槽谱系戳、七重入臂）在 Cheng lattice 全无对应物——批 2 必须在新 walker 内重证或论证 Cheng IR 形状下真空。
- 支配关系：DefinitionCfg 只给可达不给支配。批 2 需在工作区自建 idom/pre/post + 前驱 CSR（successorBlockIds 反转）+ query-relevant 切片（两哨兵同阈值：`B 块封顶`、`B>(INT32_MAX-1)/5`、`5B+1`）。
- Cheng 无载体（设计 §5）：NOP/MEMORY_VERSION 行、EXACT_PLAIN_SCOPE_END、LOCAL_ADDR/FIELD_REF、CFG_MERGE op 行（批 4 join 块首区间）、pending dominator edge、`cur_open_block`、`exact_frozen` 门（seal 后恒 frozen 自然消解）、defer 快道（不移植）。
- reissue 归宿：四循环转为 derive 推导臂；保留形状：同槽 tie、同块前向门、跨块 reach+current@call_op。证书列→侧车位集或 derive 直出。
- 性能缓存可不移植但结构必须同源：四枚举位点单遍产出、谓词与审计共享同一枚举实现。
- 判词分级：`exact point liveness failed` 在 C 侧 diag-gated；`query is unreachable` 与三条 `exact consume dataflow` 无条件 stderr+返 false；审计两条与容量哨兵无条件 die/返 false。
