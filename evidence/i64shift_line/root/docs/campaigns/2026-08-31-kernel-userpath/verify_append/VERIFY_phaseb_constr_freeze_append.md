# VERIFY_phaseb_constr_freeze_append.md —— kernel_driver_w2 PhaseB-constr-freeze 线（命名聚合构造两面 freeze/identity 墙）2026-09-05

主树 /Users/lbcheng/cheng-lang（HEAD=73debaef2，进场 git apply /tmp/oob_ab/phaseb_bc2.patch，REVERSE-CHECK PASS 后落位）。零 commit、零 revert、parser.cheng 零触碰（wall152 领地只读）。车头=cheng_w126 + /tmp/oob_ab/w139 锚点 manifest，CHENG_COLD_OBJECT_CACHE_ROOT/CHENG_ENTRY_CACHE 按 任务书 export。烤机预算 4/4 用尽（r1–r4，见台账）。

## 一、复现与定性（进场实测，BC2 r5 驱动）

- t_tuple compile=1 `primary exact def freeze validate rejected`（identity 槽循环 partial authority，判词 pa_place/pa_origin/pa_stor_unknown 三臂齐中，slot_name=p exact_type=16 mg=1）。
- obj_ctor compile=1 `lowering body ir: canonical CallId identity missing`——**不在 freeze/identity 域**：构造节点 Probe 走过 ctor 分支（`CallHeadIsAggregateConstructor("PObj")`=false）在 ExactCallNodeAuthority miss（trace `node_eval_miss op=call_node_authority`×2），语句级落 AppendCallOp 通用 call 发射 → callSequence 行 canonical 绑定 panic（lowering_plan.cheng:23808）。经请示获准扩授权面到 primary_object_plan.cheng。

## 二、根因链（三处定性，均有实测/代码实证）

1. **t_tuple 真实 realizer 不是 BC2 钩子挂点**：`Pair(x: 1, y: 2)` 走 AppendLocalDeclInitializer ctor 臂失败（AggregateConstructorToSlot 字段预校验 code=21：LookupSingleFieldMeta 的 tuple owner 臂门只认 owner 文本直接 `tuple[` 形，owner=别名名 "Pair" 时 miss）→ 落 AppendCallOp 零初始化臂（trace ctor_call_zeroinit）→ **只有 setMem 零初始化，命名字段值 1/2 从未物化**（r5 dump 的 o3/o6 是 FieldLoad 非 FieldStore——BC2「逐字段 FieldStore 全对」定性有误）。
2. **BC2 盖章函数守卫不认 Unmanaged 行**：typed 绑定行 ownership=节点 exprClass=`TypeContainsManagedStorage("Pair")=false → Unmanaged(3)`，而守卫要求 Owned → r1 实测 panic `definition authority invalid row=0 origin=2`（origin=2 即 BindingInitializer，挂的是 ownership）。且 setMem 是 void 地址写 call（op.target=-1、call.resultSlot=-1），body_ir_access decode 的 Call def 承认域要求 op.target==call.resultSlot==valueDefSlot 的返回值形——**对 setMem 落 op def 戳在 decode ingress 必死**，primary 盖章路线整体不成立。
3. **obj_ctor 的 registry/字段行缺口**：`type PObj = object`（行式/块式同，r3 探针实证）在 typed-ir layout registry 与 ir_field_source 字段行均无注册行 → TypeShapeFromText miss → 槽/头形状门全挂。对照 v6（type 块 ref-object 族）绿但本地聚合声明形无先例。

## 三、本轮修改（全部主树态，patch 71370B）

- **primary_object_plan.cheng**：
  1. `PrimaryBodyIrObjectDeclShapeFromFieldRows` + TypeShapeFromTextImpl registry miss 后置臂：field-owner 行链（ir_field_source/fieldRowNext，与 TypedExprIrRecomputeTypeLayoutFromFields 同机械）重算 object 声明 whole size/align（r4 实测该链对 user fixture object 声明为空，未生效——保留作 registry 就绪时的正解通道）。
  2. `PrimaryBodyIrAppendTypeArenaObjectCtorToSlot` + AppendLocalDeclInitializer 前置臂（TypeArena 权威版 object 构造下降）：构造节点精确 tid → lowering TypeArena 投影（StructuralKinds==Object/Size/Align/Layout children）+ declaration symbol member 表（symbolMemberStarts/Counts/memberNameIds/memberOrdinals 直读 exactTypeArena）→ 命名字段→member 行→layout child offset/width/childTid → 标量值物化 → 零初始化 setMem + 逐字段 FieldStore。槽重定型：预校验全过后旧槽改名让位、按权威重建聚合槽并 BodyIRBindLocalSlotTypeArenaProof 重绑 tid proof。fail-closed：tid 非 Object/字段未命中/非标量载体/预校验失败一律 false 落穿（零发射）。
  3. BC2 盖章函数守卫分裂：行 ownership==Unmanaged 静默让位（identity admit 兜底）；Borrowed/Unknown 显式 panic 原样；Owned 原盖章语义不变。
  4. LookupSingleFieldMeta tuple owner 臂门扩展：owner 文本 `tuple[` 形或 owner 别名解引用至 `tuple[` 形双门（t_tuple 命名字段物化的前置）。
- **exact_def_identity.cheng**：identity 槽循环新增聚合构造绑定槽 admit 臂（enum-cold 同款式，镜像 decode `DecodeCallOrdinal` setMem CallWriteHome 已承认域）：槽 proof 已绑 ∧ mg∈{Unmanaged,Managed} ∧ 三列全哨兵 ∧ 非 entry 形参 ∧ 恰一个 decode 同款 setMem 全覆盖写本槽 ∧ defs==0 ∧ readers>=1 → continue（计数门不触及，与 sentinel 同路）。r5 已实证批2 read-edge/批4 merge 全绿、槽循环为唯一挂点，admit 后即绿。
- typed_expr/lowering_plan：仅 BC2 patch 原样（本线零新增）。

## 四、验收门禁表（r4 终态驱动，克隆 cf_cont=.fp/kdrv_cf_r4，sha256 c42fa95af66531fdfae39310ef0b2802a39652f4cb74bfc527e3ec1b49be0fb6）

| 件 | 合同 | 实测 | 判定 |
|---|---|---|---|
| ordinary | 0/0 | compile=0 run=0 | PASS |
| call_fixture | 0/1 | compile=0 run=1 | PASS |
| cold_nested | 0/0 + pass | compile=0 run=0 `cold_nested_fmt_interpolation=pass` | PASS |
| v6 | 0/0 | compile=0 run=0 | PASS |
| **t_tuple** | 0/0 + pass | **compile=0 run=0 `t_tuple=pass`** | **PASS（freeze 墙破）** |
| **obj_ctor** | 0/0 + pass | compile=1 `lowering body ir: canonical CallId identity missing` | **未破（见五）** |

冷链对照：r3 起四夹具+t_tuple 在克隆（73debaef2+patch 纯净闭包）全绿；主树因 wall152 在飞（parser.cheng 228 行 hunks 中间态致闭包 `parserForwardingProductionAuthorityTargetValid` 缺失，pregate rc=2）r3/r4 转克隆烤机——BC2 同款模式，主树零写入。

## 五、obj_ctor 定性移交（预算/授权面双约束）

r4 判词与 r5 逐字相同 → TypeArena ctor 前置臂未命中，推断挂点=构造节点 `structuralTypeId`（占位构造 CallExpr 节点的 tid 绑定通道未覆盖此形；BindLocalSlotFromTypedProducerExact 走的是绑定行 exactTypeId，节点本体 tid 待证）。下一线建议：
1. 带 trace 烤机确认 `TypedExprIrNodeStructuralTypeIdAt(rhsNode)` 值与 `typeArenaStructuralKinds` 判定（r4 helper 入口两守卫）；
2. 若节点 tid 确为 -1：需 typed_expr 公开「绑定行 exactTypeId→tid」复用出口（行 0 的 exactTypeId 即 PObj tid）——授权面 typed_expr/typed_expr_type_arena；
3. 字段读取（`p.x`）文本路径 LookupSingleFieldMeta 同样缺 object owner 权威，需同源补齐（TypeArena childNameIds+layout 投影已有，缺公开出口）。

## 六、纪律自查

- 授权面：exact_def_freeze.cheng（零改动，仅 BC2 patch 覆盖）/ exact_def_identity.cheng（admit 臂）/ primary_object_plan.cheng（用户批准扩面）/ typed_expr.cheng+lowering_plan.cheng（仅 BC2 patch）。parser.cheng 零触碰。
- 探针件 zz_cf_probe_zero_ctor/var_field/obj_block（src/tests）验收后已全部删除；克隆 cf_cont 为任务级克隆（BC2 bc_cont 同款），含门禁脚本与驱动副本。
- patch=/tmp/oob_ab/phaseb_constr_freeze.patch（71370B，sha256 b0d9a9996bd2bff6529617619f3f615a7fa0fda9670f593ff08304794833d89e），含 BC2 apply 后态；REVERSE-CHECK PASS。
- 烤机台账：r1 主树（panic→定性 Unmanaged 行）、r2 主树（wall152 中间态污染，FAILED 未产出）、r3 克隆（t_tuple 全绿+四夹具绿）、r4 克隆（终态：同 r3 + obj_ctor 未破）。预门 6 次不计。
- 秒级门基线雷 codegen_a64_fill_units.cheng:471 未触发未追。
