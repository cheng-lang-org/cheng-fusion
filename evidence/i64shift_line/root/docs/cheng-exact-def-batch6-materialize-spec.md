侦察完毕，以下为批 6 算法规格全文。

# 批 6 算法规格（物化 restage + 构造器物化 + return 沉口）

## 1. restage 主算法

**staging 来源**：`parse_i32_array_literal`（cold_parser.c:42363）i32 尾段 :42714-42743——逐元素校验 SLOT_I32/4B/同物理类型，payload 行 offset=i*4，建 `SLOT_ARRAY_I32 align(count*4,8)`，`cold_arena_fixed_array_type` 发明 `int32[N]` 文本（:42738），`MAKE_COMPOSITE` **不发布** exact 生产者（对照 str 分支 :42523、opaque 分支 :42709 均发布——墙 3 根因）。

**staging 识别** `cold_slot_is_plain_fixed_array_literal_staging`（:14046-14082）：slot_kind==SLOT_ARRAY_I32；slot_aux(count)>0；全 op 表扫出**恰好唯一** producer；producer 为 MAKE_COMPOSITE 且 op_a==0、op_c==count、op_b 在 call_arg 界内；每 payload 行 offset==index*4、元素槽 SLOT_I32、size 4。只 pass/return，从不 die。

**restage** `cold_restage_fixed_array_literal_for_declared_element`（:14100-14183）触发条件（任一不满足原样返回、保既有判词）：
1. *value_kind==SLOT_ARRAY_I32 且槽界内（:14104）
2. 声明类型经 `cold_parse_any_fixed_array_type`（:5393-5428：剥 var、取尾 `[N]`，N 支持数字/具名 const/内联算术）解出元素+长度（:14112）
3. 声明元素 kind==SLOT_I64 **且**声明数组元素宽==8（:14117-14122）——只宽 int64/uint64/uint 族
4. staging 槽文本可解、staging_len==declared_len、staging 元素宽==4（:14125-14132）
5. staging 探针通过且 count==declared_len（:14135-14139）

**宽化臂重建**（:14140-14167）：restaged_start=call_arg_count；逐元素 PAYLOAD_LOAD 4B 快照（快照槽继承源元素类型文本）→ `cold_materialize_i64_value`（:52983-53036：I32→I64_FROM_U32/I64_FROM_I32，uint32 标记零扩展）宽化，硬校验 widened==SLOT_I64/8B 否则 `die("fixed array literal element widening is not exact int64")`；盖声明元素文本，call_arg offset=index*8。建 restaged 槽（align(count*8,8)、声明数组文本、array_len），MAKE_COMPOSITE(0, restaged_start, count)。

**发布与 @borrows 视图**（:14168-14182）：storage authority 不可证则 die；`cold_publish_owned_managed_producer`（:3038-3283）发布 restaged composite——注释明示下游 **@borrows 实参、store-then-read 投影链、managed return admission** 均读此定义。

## 2. 四沉口接线（旧锚→现树）

| 沉口 | 现树位置 | 插入点与条件 |
|---|---|---|
| 调用实参 | :29671-29703 `cold_restage_fixed_array_literal_call_args`（旧 39976 区） | 逐形参：`var` 形跳过；param_kind==SLOT_ARRAY_I32 且 actual 同 kind；成功换 `call_arg_slot[row]` 并 `cold_bind_parsed_call_arg_authority`（:17480-17537：def/place/ownership/origin 四列盖章） |
| 构造器字段 | :41224-41234 `cold_coerce_object_field_value`（旧 40543 区） | field->kind==SLOT_ARRAY_I32 && *value_kind 同 && field->type_name 非空 |
| return | :73715-73769（旧 77717 区），见 §3 | SEQ 两特例之后、槽校验之前 |
| typed let/var | :78218-78227（旧 40802 区） | kind==SLOT_ARRAY_I32 时先 `cold_parse_fixed_array_type` **只查长度**（不等 die `typed fixed array let length mismatch`），长度过才 restage——元素宽度/文本不查，全压给 restage（let 尾缺陷） |

**store 预检重排** `cold_emit_exact_fixed_array_index_store`（:82143）：修复前首道 carrier 预检在物化臂之前，把全部 8B 元素 store 的宽化臂打死。现形 :82266-82284——先按 logical_kind 物化（I32→materialize_i32_ref，I64→materialize_i64_value），之后**恰好一次**严格 carrier 校验（die `plain fixed array source kind does not match element`）；无物化臂的 kind（f32/f64/str/object 元素、i64→i32 收窄）仍同判词死。后续：TypeId 核对 :82287-82319、宽度 :82320-82331、i32 1/2/4B 直存 :82332-82350、宽元素投影存储 :82352-82379（`cold_publish_exact_scalar_borrow_projection` 防首宽投影被误判 move）。

**@borrows 视图槽盖章** `cold_emit_exact_call_borrow_view`（:61089-61250）：源槽 :61125-61130 补盖；目的槽 :61195-61208——COPY 目的槽从未被 managed-read publisher 盖（它只盖 read 边源侧），admission 前以同一 authority 值盖 destination lane（仅当仍 UNKNOWN），由原定长数组 PLAIN 特例泛化到 str/seq/object 载体；随后 COPY 定义行落 PLACE_BORROW_PROJECTION/BORROW_SHARED/origin=源定义（:61218-61236）。

## 3. return 沉口

`cold_finish_exact_function_return` 定义 cold_parser.c:73631（cheng_cold.c:31178 仅前向声明）。

**定长数组臂**（:73715-73769，SEQ_I32/SEQ_OPAQUE 特例之后）：门=return_kind==SLOT_ARRAY_I32 && kind 同 && 槽界 && return_type 非空 → staging 探针（:73735）→ 宽族走共享 restager，成功换 slot/parsed_result（:73738-73744）；**同宽同文本**（int32 元素、声明宽 4、staging 宽 4、长度等）直接 `cold_publish_owned_managed_producer` 发布 staging 自身 producer（:73746-73766）；等宽异文（uint32[N]）与长度不匹配不触碰保判词。

**判词** `managed function return lacks exact value definition`（:73811-73842）：触发=return_storage != UNKNOWN（含 PLAIN 升格臂 :73795-73808）而 parsed_result 缺失/槽/kind/def/戳任一项不符。字段序：`cheng_cold: managed return body=%.*s slot=%d kind=%d type=%.*s parsed=%d parsed_slot=%d parsed_kind=%d parsed_def=%d parsed_ownership=%d`（stderr 首行），次行 die。**批 1 derive 臂对应**：发布走 `cold_publish_owned_managed_producer`——UNKNOWN→`cold_publish_exact_managed_definition`(MOVE)；PLAIN 族（OBJECT/ARRAY_I32 六臂之一：neutral/copy/call/constructor/index-read/independent）落 PLAIN 戳 place=TEMPORARY、ownership=PLAIN、origin=producer_op（:3243-3264）。

**RET 发射臂** cheng_cold.c:71719-71744：SLOT_ARRAY_I32 并入 VARIANT/OBJECT/SEQ_* 的 x8/sret 逐 8B 拷贝臂（:71726），copy_bytes=min(slot_size, return_size)，尾部零填；缺失时判词 `unsupported cold return value kind=%d`（:71747）。

## 4. 构造器物化（W6 族）

`parse_object_constructor_typed` 区 cold_parser.c:42031-42116：
- 门 :42031-42033：field->kind==SLOT_OBJECT && value_kind==SLOT_OBJECT_REF 放行 kind 等值门
- **类型同一性** :42054-42062：物化前在原 ref 槽上 `cold_resolve_object_type_identity` 双解（expected=field->type_name vs actual=槽自身文本），不等 die `object constructor field type mismatch`——必须在物化前（物化后槽文本被盖成期望名，事后核对 vacuous）
- **物化** :42095-42099：owned_slot=SLOT_OBJECT/field->size，盖 field->type_name，PAYLOAD_LOAD（ref 源恒解引用、宽度=op_c，规避 PAYLOAD_STORE 的宽度启发式歧义）
- **发布换装** :42108-42116：`cold_publish_exact_managed_definition`（OWN_MOVE）→ 换 value_result/value_slot/value_kind=SLOT_OBJECT（修「parsed call argument lacks exact result authority」墙：deref-copy 换槽但 result 仍指 borrow 视图）
- 定长数组字段长度门 :42037-42039

**W6 判词** `str[] literal borrowed element requires an explicit owned value`（:42454-42482，str[] 字面量分支）：触发=元素 ownership 非 MOVE 且非纯静态串（PLAIN + `cold_exact_plain_static_string_definition_valid`）。字段序：`cheng_cold: str[] literal ownership body=%.*s element=%d def=%d ownership=%d place=%d origin=%d kind=%d slot=%d source=%d op_a=%d op_b=%d op_c=%d`，次行 die。前道门 `cold str seq literal element type mismatch`（:42445），后道门 `cold str seq literal payload ownership mismatch`（:42491）。纯静态串豁免发 A-read 不发 consume（:42500-42514），否则 attach consume（:42515-42518）。

## 5. Cheng 侧挂点清单（上游化裁定：声明 fixedLength/childTypeId typeArena 先验、物化一次成型、戳随物化落、验证器只验戳）

- **构造器物化**：`primary_object_plan.cheng:30348 PrimaryBodyIrAppendAggregateConstructorToSlot`。挂点 B 现成 node 证据 :30558-30560（`fieldValueNodeIndex = PrimaryBodyIrCallArgNodeIndexAt(typedIr, ctorNodeIndex, itemIndex)`）；param 副本臂 :30847-30873（宽 FieldStore 值源落形参槽→等宽 LocalAggregate 副本+FieldLoad 换 valueSlot）——批 6 在此扩 OBJECT_REF→OBJECT 物化臂（任务锚 30841 现树为 failCode=60 门内 dbg 行，臂本体 :30847 起）。发射段 :30877-30891。
- **A 挂点 Prepare 落戳**：`primary_object_plan.cheng:17479 PrimaryBodyIrPrepareManagedBodyOpValueDefinitionExact`——:17500-17509 `BodyIRBindLocalSlotTypeArenaProof` → :17553-17562 落 valueDefSlot/ExprNodeIndex/SemanticRow/Ownership/BorrowOwner 三列/OriginKind=TypedExpr。新物化 op 必须过同一 Prepare。
- **backend2 镜像**：`backend2_lower_slots.cheng:19189` 同名函数，副本臂 :19647-19673（锚 19644=failCode=60 return 行），发射 :19678-19690。
- **return 沉口现状**：`PrimaryBodyIrAppendReturnAggregateConstructor` :30898-30958（return Type(...) 共享核心+`AppendReturnTerm` :27371）；**return 位定长数组 bracket 字面量无 lowering 臂**——`PrimaryBodyIrAppendFixedArrayBracketInitializer` :22622-22712 仅在局部声明位接线（:23015-23025），return `[1,2,3]` 落 801 bail 族。批 6 须在 return 臂族（:30898/:30979/:31508/:31607/:31919/:32133/:32181/37158）新增 bracket 物化臂。
- **定长数组字面量 lowering 现状**：bracket initializer 已一次成型（:22638-22647 声明类型取 elemKind/elemSize；:22661-22673 T78 v4 对齐宽度覆盖 packed 宽度；:22704-22711 逐元素 IndexedStore），无 restage 需求，但**不落 exact 戳**。backend2 镜像 :13945、调用点 :14339。
- **验证器核戳点**：`exact_def_derive.cheng` `BodyIrExactDefDerive`（:425 主 derive）+ `BodyIrExactDefSlotAuthorityStorageClauseCheck`（:242，storage 子句判词族）；return admission（C :73811-73842 对应）应在 derive 的 return-term 消费臂核「return 槽持精确 valueDef 戳」，批 6 落地时在 :425 主体内扩臂。

## 6. 证据目录

- `cheng-patches/depth2-param-projection-20260825/`：ANALYSIS.md 根因链 6 条（staging 4B+发明文本/let 尾只查长度/字段无臂/实参无臂/store 预检杀宽化/borrow-view 目的槽不盖章）+判词锚定；补丁 `cold_parser_depth2_param_projection.patch`（sha 0ffbda1a，+225/−6）；fixtures 31 枚（d1/d2 系、iso_*、probe_i32/u64_return_literal、probe_u32_local、neg_len_mismatch/neg_mixed_literal/neg_narrow_store/neg_var_to_wide_array、append_then_move_consume_negative）。
- `cheng-patches/cchain-walls-literals-20260825/`：ANALYSIS.md（W6=非法形源迁 CloneStr、W7=@borrows、墙 3=编译器缺口根修）；补丁 5 枚（wall3_return_literal_sink +55 行、wall3_aarch64_ret_arm +7 行、w6/w7 迁移）；fixtures（wall3_return_literal 两变体、w6min_1、run_wall3_matrix.sh）。
- 仓内已固化 `_coldrepro/`：wall3_return_literal.cheng（int32[4]）、wall3_return_literal_u64.cheng（uint64[4]）、repro_own_global_array_borrow.cheng、neg_len_mismatch.cheng、neg_mixed_literal.cheng。

## 7. Cheng 基板差异提醒与批 1-5 共享面

**差异提醒**：
1. C 的 restage 是「4B staging+发明 int32[N]→后补重建」两段式；Cheng 物化一次成型（§5-5），不存在 restage 函数移植，批 6 只落「物化点消费声明 fixedLength/childTypeId + 戳随物化落」。
2. 行号锚全部以现树为准：77717/40802/39976/40543 → 73739/78226/29694/41231；primary 30841→臂本体 30847；backend2 19644→19647。
3. return 位 bracket 字面量在 Cheng 是新增臂（现落 801 bail），非扩臂。
4. 判词逐字保留：批 6 两条 `str[] literal borrowed element requires an explicit owned value`、`managed function return lacks exact value definition` + 物化戳 mismatch 族（§6）。
5. W6 在 C 侧裁定非法形（源迁 CloneStr），Cheng 验证器只验戳不豁免——借用元素未持 owned 值同拒（负例夹具）。
6. RET 臂漏 kind（cheng_cold.c:71726）是 C 专有，Cheng `AppendReturnTerm` 按聚合统一处理，无对应缺口。

**共享面**：
- **批 1**：物化戳必须与批 1 derive 定义臂同戳族（PLAIN/TEMPORARY/origin=producer 与 MOVE 臂）；构造器物化落 OBJECT storage 精确戳经同一 Prepare（:17479）。
- **批 2**：restage 快照 PAYLOAD_LOAD 与宽化 op 是 consume/read-edge 新边源；return admission 依赖点活性（`cold_exact_definition_is_live_*` 族↔freeze walker）。
- **批 3**：restage 换槽后 call_arg 四列盖章（:17529-17536）与 def↔slot 四字段一致；borrow-view 目的槽盖章（:61195-61208）与批 3 槽终校验同面；构造器物化换装必须保 def↔slot 一致，否则主审 `slot authority mismatch` 族红。
- **批 4/5**：restage 实参经 `cold_bind_parsed_call_arg_authority` 进入批 5 调用权威面；@borrows 视图（PLACE_BORROW_PROJECTION）与批 5 借用合并权威交互。
- **夹具**：wall3_return_literal 系 2 枚已固化；定长数组宽族名单=depth2 fixtures 31 枚（待固化）+仓内 neg_len_mismatch/neg_mixed_literal；等宽异文负例 probe_u32_local 刻意不触碰（深度 2 遗留 #2）。