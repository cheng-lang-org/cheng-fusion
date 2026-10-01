# Cheng 侧 exact-authority/freeze 验证层重写设计

> 2026-08-25 定稿（设计代理产出，编排会话亲验来源）。对应 docs/cheng-minimal-kernel-plan.md D3 的前置主体工程。
> 前提事实：C 冷链 cold BodyIR exact-authority/freeze 验证层在 Cheng 源码侧整层缺失
> （typed_expr.cheng 中 Restage/SharedProjection/VarOut/BorrowView/StorageKind/
> ConsumesDefinition/ManagedDefinition/FreezeBody/IdentitySchema 全部 0 命中）；
> 纯 Cheng 驱动编译内核入口已实测倒在该层三族判词。

## 0. 已读依据

已读：`typed_expr.cheng:3705-4457`（权威族全文）、`core_types.cheng`（BodyOp/LocalSlot/CallOp/sidecar/seal 族）、`body_ir_access.cheng`（AccessTable/ManagedDefinitionIndex/DefinitionCfg）、`ownership_body_ir_production.cheng` 入口、`cleanup_cfg.cheng` 合并物化段、`lowering_plan.cheng` 运输与发布点、C 侧三族判词现场（`cold_parser.c:28856`、`cheng_cold.c:55045/56322`、`cold_parser.c:64174-64600`）、sentinel（`cold_parser.c:59772`）、var-out 分类器（`cold_parser.c:25499+`）、consume 谓词（`cheng_cold.c:52694+`）、seal root（`cold_parser.c:55679+`）、identity schema 关键臂（`cheng_cold.c:67588-69800`）、四个证据目录 ANALYSIS、DISTANCE.md、progress.md 8/25 条目。

未逐行读：read-edge 七处全文、restage C 全文、构造器物化区、backend2 BodyIR 构建路径、Cheng lowering 的 CFG join 现状。核对动作内置于对应批次。

## 1. 裁定：新建 BodyIR 层子系统，不扩展 TypedExprValueDefinitionAuthority* 族

**新建。TypedExpr 权威族保持原样，作为新层的身份输入被消费。**

1. **层级互斥**。TypedExpr 族验证 TypedExprIr SoA，无 CFG 块/终结符/op 行/物理槽概念；C 层 14 项全部定义在物理 BodyIR 上。塞进 TypedExpr 族会破坏其 11 列等长形状契约。
2. **职责正交且已有接缝**。TypedExpr 族证「这个值是谁」（已在 `compiler_csg.cheng:15532/16121/34997` 全程序接线）；新层证「这个值在物理 BodyIR 里的放置/寿命/消费是否精确」。接缝：lowering 写 `BodyOp.valueDefSemanticRow/valueDefExprNodeIndex`（`lowering_plan.cheng:6498-6510`），`BodyIrAccessManagedDefinitionIndex` 已按（domain,row）建索引。
3. **大量语义在 Cheng 基板上无载体**。Cheng BodyIR 19 个 op tag 对 C 的 160+；无 NOP/MEMORY_VERSION/CFG_MERGE/LOCAL_ADDR/FIELD_REF 行；只能重新证明（见 §5）。

命名遵循 `body_ir_access.cheng`/`ownership_body_ir_production.cheng` 惯例：新子系统统称 **ExactDef**。

## 2. 两侧基板对照

| 维度 | C 冷链 | Cheng 侧现状 | 裁定 |
|---|---|---|---|
| ownership 值域 | INVALID0/PLAIN1/MOVE2/BORROW_SHARED3/BORROW_UNIQUE4 | OwnInvalid..OwnBorrowUnique 同值 | 直接复用 |
| place 值域 | 9 值（INVALID..MEMORY_VERSION） | LocalSlot.placeKind 另一套 4 值地址域；BodyOp 无 place 列 | 新层携带 C 9 值域侧车列 |
| storage 值域 | UNKNOWN0/PLAIN1/STR2/SEQUENCE3/OBJECT4 | managedStorageKind 3 值 | 并存，新层加 5 值域精确列 |
| op 级戳 | op_value_def_* 八列 | BodyOp 有 valueDef*+sourceDefinition；缺 place/exactType/producerRow/readA 源边 | 缺 4 列侧车补齐 |
| 槽级戳 | slot_* 四列 | typeArenaTypeId+managedStorageKind；缺 place/origin/5 值 storage | 侧车补 3 列 |
| call-arg 戳 | call_arg_* 四列 | CallOp 有 argSlots/argPassKinds；arg 级戳缺 | CSR 侧车补齐 |
| 发布方式 | 解析期增量发布 ~100 站点 | lowering 构建完整 BodyIR 后 seal | 单遍规范推导器取代 |
| 冻结点 | body-store-freeze 全 body 重写+FunctionContractAdmission | 每 body `OwnershipBodyIrProductionApplyOwned`（两后端共同经过） | 验证器挂 ingress；跨函数契约读 TypedExpr 冻结列 |

## 3. 总体架构

### 3.1 模块划分

- `src/core/ir/body_ir_exact_def.cheng`（新）：侧车类型、形状校验、seal、CID 指纹。只 import coreir/layout。
- `src/core/analysis/exact_def_derive.cheng`（新，批 1）：规范推导器。
- `src/core/analysis/exact_def_freeze.cheng`（新，批 2）：点活性 walker + consume 边 + read-edge。
- `src/core/analysis/exact_def_identity.cheng`（新，批 3）：identity schema 主审 + 投影权威。
- `src/core/analysis/exact_def_merge.cheng`（新，批 4）：CFG merge batch。
- `src/core/analysis/exact_def_call_authority.cheng`（新，批 5）：var-out/调用权威/seal root + 程序级契约表。
- 批 6 落 lowering 三文件（物化臂）+ derive 校验扩臂。
- 接线点：`OwnershipBodyIrProductionApplyOwned` ingress、`compiler_csg.cheng`、`backend2_frag_codec.cheng`、`core_types.cheng`。

### 3.2 数据模型（SoA 侧车，内嵌 BodyIR.exactDef）

```
BodyIrExactDefSidecar =
    opPlaceKinds: int32[]              # C 9 值域 0..8，dense op 行
    opExactTypeIds: int32[]            # TypeArena TypeId，-1 未证
    opOriginIds: int32[]
    opProducerFunctionRows: int32[]
    opSourceDefOpRows: int32[]         # C op_source_value_def_op_id
    opReadADefOpRows: int32[]          # C op_exact_source_a_value_def_op_id
    # consume 列复用 ops[i].valueDefConsumeOpIndexPlusOne
    slotPlaceKinds: int32[]            # dense 槽行
    slotOriginIds: int32[]
    slotStorageKinds: int32[]          # C 5 值域 0..4
    callArgStarts: int32[]             # call-arg CSR
    callArgCounts: int32[]
    argDefOpRows: int32[]
    argPlaceKinds: int32[]
    argOwnerships: int32[]
    argOriginIds: int32[]
    sealed: bool
    exactDefCid: layout.FixedBytes32
```

**推导取代发布**：seal 后单遍推导 `BodyIrExactDefDerive(bodyIR, transport, typedIrWindow)`，输入仅限三类不可变证据：(a) LoweringOwnershipTransportSoA、(b) BodyOp.valueDef*、(c) BodyIR 结构列。逐臂证明，managed 定义推不出精确戳 = hard fail，UNKNOWN 不许通行；唯一例外镜像 C 规范条款：merge 双 UNKNOWN 按 PLAIN 纳（`cold_parser.c:64421-64423`）。

storage 规范推导 = `cold_canonical_storage_obligation_for_body_slot` 的 Cheng 版：slot kind 静态道 + nominal 槽经 typeArena 闭包证，逐层证明、禁摊平。

### 3.3 验证器

`ExactDefFreezeValidateInto(bodyIR, access, err) -> bool`：在 `OwnershipBodyIrProductionApplyOwned` 的 `BodyIrAccessDecode` 之后、既有校验之前调用，两后端同口径。判词经统一 verdict helper 写 stderr + rc≠0（不走 panic 栈，判词须单行确定可进夹具 md5）。

### 3.4 跨函数契约裁定

不重建 FunctionContractAdmission 状态机。批 5 只加程序级侧车 `ExactProgramContract`（per function row 5 列：rootKind/formalIndex/formalMask/globalRow/readOnlyProof），由 TypedExpr 冻结列（resultExprClasses/borrowResults/manualConsume*，全程序 seal 时已冻结、顺序无关）推导，在 compiler_csg 全程序门 seal。属「由上游不变式替代」而非降级。

### 3.5 判词零漂移口径（验收前提）

- **正例绿**：Cheng 驱动编译 rc=0、obj 落盘；
- **负例同拒**：同一负例在 C 链死于判词族 X，Cheng 链必须死于同族 X、同 rc；字段值不跨基板比对（op 行号/slot 号/TypeId 随 IR 代次漂移，逐字段相等不可执行）；
- **零漂移**：Cheng 驱动改动前后同基板双跑，rc 同 + stderr md5 同。
- 判词字符串 Cheng 侧**逐字保留 C 文本**（含 `cheng_cold:` 前缀与字段序）。

## 4. 依赖序分批

批 1（戳表）是一切输入；批 2（walker）是批 3/5 公共依赖；批 4 只依赖 1+2；批 6 最独立。

### 批 1：数据模型 + storage/sentinel + 推导器骨架（~1400 行）

- 落点：`body_ir_exact_def.cheng` + `exact_def_derive.cheng` + core_types 接线 + backend2_frag_codec 列读写 + 两 lowering 调用点。侧车全列一次落全。
- C→Cheng：发布戳族（param/binding/callresult/temporary 四 origin）→ derive 定义臂；borrow_view destination 戳泛化 → derive borrow-view 臂；第 5 发射点 borrow_local_copy → derive local-copy 臂；managed_field_borrow → derive field-borrow 臂；sentinel（含两实现对齐、seq_carrier 例外）→ `BodyIrExactDefSlotIsSentinel` 单实现。
- 判词：identity schema storage 子句（`slot authority mismatch def_type=%d ...` 七字段）。
- 夹具：正例 DISTANCE 9 绿集 + 6 smokes 双跑；负例 w3neg1 同拒 + borrow-view 戳值变异精确红回；零漂移同基板 md5。

### 批 2：点活性 walker + consume 边 + read-edge（~1500 行，技术风险最高）

- 落点：`exact_def_freeze.cheng`，挂 OwnershipBodyIrProductionApplyOwned ingress。
- 复用 `BodyIrAccessDefinitionCfg` lattice；新增模块内工作区 SoA（等价 ColdExactDataflowWorkspace，arena 分配）。
- C→Cheng：点活性 walker（query-relevant 剪枝+支配缓存）；consume 谓词 4 通道（sourceDefinition 边/两条 plain-static-str 豁免逐字镜像/originId 通道=cleanup 物化行同槽 tie）；四枚举位点同源单遍产出（结构上不可能漏通道）；reissue PARAM 形+同槽 tie+reach+current；read-edge seal 后单遍完成+校验。
- 判词：`exact point liveness failed ...` / `... query is unreachable ...` / `has invalid path consume ...` / `consume edge is broken ...` / `use of consumed managed value` / `cold BodyIR physical-source canonicalization invalid` / 两条容量哨兵。
- 夹具：正例加 parser.cheng 单编（196 条判词战区）；负例 negmut 禁 origin 通道回归 + 跨块互斥臂负例。

### 批 3：identity schema 主审 + 投影权威（~1300 行）

- 落点：`exact_def_identity.cheng`。
- C→Cheng：主审同构（定义组完整性、def↔slot 四字段一致、source chain 六臂）；mv_source_view_edge 臂 = 真空裁定（§5-3），保留判词、实现转槽终校验；投影帧自有承认（BORROW_SHARED retain 与 STACK_LOCAL/TEMPORARY 同约定）；borrow projection 同槽 tie（与批 2 共享 helper）。
- 判词：`source chain is broken ...` / `managed borrow projection is broken ...` / `managed parameter definition is broken` / `has partial definition tuple ...` / 块区间三判词。
- 夹具：正例 raster 族 6 smokes；负例 negmut 分类器同槽豁免禁用 → op712 形回归。

### 批 4：CFG merge batch + 借用合并权威（~900 行，解锁面最大）

- 落点：`exact_def_merge.cheng` + derive merge 定义臂。
- `cold_merge_exact_local_defs_batch` 全条款（状态门/open join 门/21 字段 mismatch/ownership 四值门/ref normalize 双臂/preserve_unique_borrow/源槽/storage 含双 UNKNOWN→PLAIN/edge staging 先行/plan ownership/destination）。时序约束（边解析边发 phi）转空间约束（join 块首连续 merge 定义区间+edge actions 物理居前）。
- 判词：merge 族全 10 条（含 21 字段 mismatch）。
- 夹具：正例 typed_expr.cheng 单编（`local=gPKindBucketCnt first_def=601 second_def=589` 形必须转绿）+ 6 smokes；负例 ref normalize 臂禁用回归。
- typed_expr.cheng 是全树咽喉，DISTANCE 实测整集 0 模块进 codegen 即死于该族。

### 批 5：var-out 分类器 + 调用权威 + seal root + 程序契约（~1300 行，打纯链首红族）

- 落点：`exact_def_call_authority.cheng` + ExactProgramContract（批 1 侧车加 5 列程序表）+ compiler_csg seal 接线。
- C→Cheng：var-out 五形态**重证**（CopyLocal 写回/FieldStore 投影写回/sret forward/out 直写/投影 publication）；@borrow_result var root + global 臂（callee CFG 全证不可 rebinding/mutation → 保持入参版本）；seal canonical_root = 由上游不变式替代（§5-4），freeze 只校验不重走；W8/cid gate/墙3 store 爬升第三处接线。
- 判词：`@borrow_result var root call authority is not exact` / `call var unique-borrow authority is not exact` / `call var-out definition authority mismatch` / `call var global source is not live unique authority` / `indexed element field store lacks exact unique base authority` + 程序契约五槽校验。
- 夹具：正例 GEN1 首红形 + raster 6 smokes；负例 w3neg1/w3neg1-inroot 同拒 + negmut 守卫禁用。

### 批 6：物化 restage + 构造器物化 + return 沉口（~800 行）

- 落点：lowering_plan/primary_object_plan/backend2_lower_slots 物化臂 + derive 校验扩臂。
- **上游化**：声明 fixedLength/childTypeId 在 typeArena 先验，物化按声明类型一次成型、戳随物化落；构造器物化定义必须落 OBJECT storage 精确戳（先核对 Cheng 物化点现状，§7-3）。
- 判词：`str[] literal borrowed element requires an explicit owned value` + 定长数组 return 字面量族 + 物化戳 mismatch 族。
- 夹具：正例 _coldrepro 宽族；负例借用元素未持 owned 值同拒。

**批次统一验证**：编出 obj（两后端 smoke 同编）+ 夹具矩阵（正例绿/负例同拒/零漂移 md5）+ 全量 6 smokes 无新红。总盘 ~7300 行，估 30-54h。

## 5. 无法镜像、只能重新证明的语义点

1. var-out NOP 五形态分类器（批 5）：Cheng 无 NOP/MEMORY_VERSION 行，按五种写回物理形态重证。
2. sentinel seq_carrier 例外（批 1）：Cheng 槽创建即默认证明、TypeArena 绑定幂等，先按真空实现，夹具守「fresh str/seq 载体不误判」。
3. mv_source_view_edge 身份视图臂（批 3）：Cheng 无元数据视图行，支配天然成立，转槽终校验。
4. bbview seal canonical_root 递归+深度预算（批 5）：被两条不变式替代（lowering 已解析 owner 物理行并证先序；TypedExpr 强制 owner 行单调无环）。
5. restage 后补语义（批 6）：Cheng 物化一次成型，验证器只验戳。
6. FunctionContractAdmission 状态机：由 TypedExpr 冻结列直读，不重建。
7. read-edge 解析期七处（批 2）：lowering 一次成型，只保留 seal 后单遍完成+校验。

## 6. 判词文本映射原则

逐字保留（含 `cheng_cold:` 前缀、字段序、printf 格式），Cheng 侧经统一 verdict helper 输出。全量 23 条映射（批号标注）：`@borrow_result var root call authority is not exact`(5)、`exact point liveness failed ...`(2)、`... query is unreachable ...`(2)、两条容量哨兵(2)、`managed CFG merge batch definition mismatch ...` 21 字段(4)、merge 族 9 条(4)、`slot authority mismatch ...` 七字段(1→3)、`managed borrow projection is broken ...`(3)、`source chain is broken ...`(3)、`has invalid path consume ...`(2)、`consume edge is broken ...`(2)、`has partial definition tuple ...`(3)、块区间三判词(3)、`call var unique-borrow authority is not exact`(5)、`call var-out definition authority mismatch`(5)、`call var global source is not live unique authority`(5)、`indexed element field store lacks exact unique base authority`(5)、`use of consumed managed value`(2)、`managed parameter definition is broken`(3)、`str[] literal borrowed element requires an explicit owned value`(6)、`cold BodyIR physical-source canonicalization invalid`(2)、`read-edge freeze fail row=%d fn=%.*s`(2)、`call var-out definition index structure mismatch ...`(5，重证后按 Cheng 形态填字段)。

## 7. 开放问题（批 1 实施前须实测裁定）

1. **判词 TypeId 空间**：侧车存 typeArenaTypeId；批 1 落地前确认 typeArenaTypeId 对 nominal 槽全覆盖，否则 OBJECT/PLAIN 规范推导缺输入。
2. **backend2 BodyIR 构建路径**：backend2 是否独立构建 BodyIR（`backend2_lower_slots.cheng:8983` 自写 valueDefSemanticRow 提示是）——若是，derive 两处接线 + codec 必须往返新列。
3. **Cheng 构造器物化点**：OBJECT_REF→OBJECT 换 value_slot 的 Cheng lowering 对应物需定位（批 6 前置）。
4. **seq_carrier 例外**与 **merge local 身份载体**：Cheng merge 请求在 join 点的表示（cleanup_cfg.cheng:15286/15331 seal 点），批 4 前置。
5. **负例夹具固化**：w3neg1 等在 cheng-patches 各 work 目录，批次落地时必须固化进仓（`_coldrepro/` 或 tests 负例目录），否则「负例同拒」不可重复。

## 8. 风险最高三点

- 批 2 walker 正确性（196 条 parser.cheng 判词族；CFG 事实源 DefinitionCfg vs C dominator cache，全新证明）。
- 批 1 推导器臂覆盖率（臂不全正例误判红且无兜底；mitigation = DISTANCE 9 绿集 + 6 smokes 全量双跑）。
- 跨基板验收口径须按 §3.5 三级执行（编排层已确认采纳，2026-08-25）。
