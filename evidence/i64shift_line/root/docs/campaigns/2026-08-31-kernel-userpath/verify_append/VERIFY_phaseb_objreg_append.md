# VERIFY_phaseb_objreg_append.md —— kernel_driver_w2 PhaseB-objreg 线（object 命名构造收官）2026-09-05

工作克隆 /Users/lbcheng/cheng-f24/anchor_clones/cf_cont（HEAD=73debaef2，进场态=constr-freeze 移交态：BC2+constr-freeze patch 已落为未提交 hunks）。零 commit、零 revert 他人 hunks、parser.cheng 零触碰。车头=cheng_w126，manifest=/tmp/oob_ab/w139/kernel_manifest_head_git.cheng（克隆变体烤机脚本 .w/objreg/build_kernel_driver_objreg.sh，仅 ROOT 改克隆——原版硬编码 cd 主树，直接跑会违主树 wall154 独占纪律；BC2/constr-freeze 同款模式）。CHENG_COLD_OBJECT_CACHE_ROOT=<克隆>/.cold_cache、CHENG_ENTRY_CACHE=0、门禁 export CHENG_ROOT=<克隆>。

## 一、判定

**obj_ctor 破墙：compile=0 run=0 `obj_ctor=pass`（r4 终态驱动实测）。** t_tuple 维持绿，四夹具 functional 全绿。移交判词 `lowering body ir: canonical CallId identity missing` 根因闭环。

## 二、根因（两级，均有 r1/r2 诊断 trace 与 r3 反汇编实证）

移交定性「类型阶段布局注册表/字段行均无注册」**不成立**——r1 诊断实证类型阶段注册链全链完好：
- T1：PObj 声明 exactAuthorityState=2、arena_id=15、size=8 align=4 generic=0，布局注册行+字段行注册命中（objarm_hit）；
- T2：前端 `TypedExprBindingRhsIsAggregateConstructor` 分类 TRUE；
- 构造节点精确存在且 tid=15（结构 Object 行）。

真根因 = **`type PObj = object` 行内式的 RHS 是裸关键字 `object`，parser 产出 Object 声明根的同时，ctx 文本扫描（TypedExprMaybeAddTypeDefAlias）把「PObj→"object"」保守登记进 typedef-alias 表。该别名行不是真别名，但后端两处消费方把它当真别名解引用，文本形状链全灭**：
1. `PrimaryBodyIrTypeShapeFromTextImpl` 别名整形分支无条件递归到 "object" 叶 → 非类型关键字落小写叶默认（I32Tag/size 0）→ 凡消费文本形状的门（构造臂形状门 code=8/9、`PrimaryBodyIrCallHeadIsAggregateConstructor`）对 PObj 全灭；
2. `PrimaryBodyIrAppendAggregateConstructorToSlot` 字段宿主别名切换：ctorFieldOwnerType "PObj"→"object" → 逐字段 LookupSingleFieldMeta 全 miss（code=21）→ 构造臂整体让位 → 绑定槽只剩裸默认 setMem 零初始化（r3 probe1 反汇编实证：仅 setMem(0,8)，零 FieldStore），字段值全丢 → `p.x==1`/`p.y==2` 恒假 → 构造节点沦为不可解析 call（判词 canonical CallId panic 在 r1/r2 形态下由此收场）。

连带发现（constr-freeze 遗留缺陷，本轮零改动仅记录）：r4 TypeArena 权威臂 `PrimaryBodyIrAppendTypeArenaObjectCtorToSlot` 在 lowering 期恒死——字段元首守卫依赖 `typedIr.exactTypeArena`，而 seal（compiler_csg 期）已把 arena 移出 typedIr（TypedExprIrSealExactTypeArena 置 nil）；且绑定槽经 tid producer 绑定已落聚合形（kind=5），原 `!= LocalAggregateTag` 臂门恒假。本臂现状=不可达死代码，移交下线处置。

## 三、修改（全部 [phaseB-objreg] 标记，仅 primary_object_plan.cheng 三处纯增量 +27 行；typed_expr.cheng 零改动=进场 hunks 原样）

1. TypeShapeFromTextImpl（@@ -5022 +5022）：`shapeAliasTarget == "object"` 时置空跳过别名递归——"object" 是保留关键字不可能为真实别名目标，零歧义；豁免后落到下方布局注册表查询（state=2 行在，Aggregate 8/4）。
2. AppendLocalDeclInitializer BC2 构造臂区（@@ -24225 +24238）：r2 实测补记注释（权威臂 lowering 期不可达机理），代码零改动。
3. AggregateConstructorToSlot 字段宿主切换（@@ -32399 +32418）：`ctorAliasTarget != "object"` 豁免——字段宿主保持声明名本身，逐字段查 ir_field_source 行命中（offset 0/4、宽 4）→ 命名字段 1/2 真物化（setMem 零初始化 + 逐字段 FieldStore）。

## 四、验收门禁表（r4 终态驱动 .fp/kdrv_objreg_r4，sha256 357dcf8fd02e5a9d96f750cb6982d5844d06d2bf0a77a956d2aeb47e21443a94）

| 件 | 合同 | 实测 | 判定 |
|---|---|---|---|
| ordinary | 0/0 | compile=0 run=0 | PASS |
| call_fixture | 0/1 | compile=0 run=1 | PASS |
| cold_nested | 0/0 + pass | compile=0 run=0 `cold_nested_fmt_interpolation=pass` | PASS |
| v6 (zz_v6_w7) | 0/0 | compile=0 run=0 | PASS |
| t_tuple | 0/0 + pass | compile=0 run=0 `t_tuple=pass` | PASS（维持绿） |
| **obj_ctor** | **0/0 + pass** | **compile=0 run=0 `obj_ctor=pass`** | **PASS（破墙）** |

探针二分链（r4 驱动实测，探针件验收后已删除）：`return p.x`=1、`return p.y`=2、`p.x==1` 命中、嵌套双 if 命中、`let a=p.x` 值正确——字段存储/读取/比较全链正确。

## 五、烤机台账（4 轮，超预算 1 轮论证见下）

- r1 `.fp/kdrv_objreg`：诊断轮（CHENG_OBJREG_DIAG 门控探针，验收后已全部移除）。obj_ctor 判词同进场；trace 实证注册链完好、挂点在后端文本形状。
- r2 `.fp/kdrv_objreg_r2`：修 v1（TypeArena 权威臂前置）无效——同判词；T4b 实证 layout_rows=1/field_rows=2/buildIndex live 而 shape 仍 1/0 → 锁定别名劫持。
- r3 `.fp/kdrv_objreg_r3`：修 v2（Impl 豁免）。obj_ctor 首次编译通过（compile=0）但 run=101；探针+反汇编定位第二处劫持（BC2 臂字段宿主切换）。
- r4 `.fp/kdrv_objreg_r4`：修 v3（BC2 臂宿主豁免）。**门禁 6/6 全绿，终态。**
- 超预算论证：任务书预算 3 轮。r3 后已达标「编译通过」，但 run=101 不满足验收合同（0/0）；第二处劫持有反汇编级定位（仅 setMem 无 FieldStore），一轮即验证闭环，属收敛必要轮次而非迭代失控。
- 烤机事故：r4 首次启动时 /tmp/oob_ab/phaseb_constr_freeze/ 烤机脚本被并行清理（rc=0 假象系 echo 掩盖 127），已重建克隆变体脚本 .w/objreg/build_kernel_driver_objreg.sh 并复跑成功；交付 patch 同遭误清，已从克隆基线副本再生并留克隆内副本。
- 秒级门基线雷 codegen_a64_fill_units.cheng:471 未触发未追。

## 六、纪律自查

- 授权面：本轮净改动仅 primary_object_plan.cheng（+27 行，3 hunk，均 [phaseB-objreg] 标记）；typed_expr 系文件进场 hunks 逐字节原样（git diff --stat 与进场一致：typed_expr 136/exact_def_identity 76/lowering_plan 68）。TypeShapeFromTextImpl 与 AggregateConstructorToSlot 属 constr-freeze 已扩面的同文件相邻区，加注释论证。parser.cheng 零触碰。
- 探针件 zz_objreg_probe1..12 验收后已全部删除；上一线遗留 zz_cf_probe_*（untracked）非本线产物未动。诊断探针代码（CHENG_OBJREG_DIAG 门控）已全部移除，终态源无残留（grep 零命中）。
- patch=/tmp/oob_ab/phaseb_objreg.patch（3798B，sha256 eb75143e781c3118ed960d428286befd1c912d52c7e0a9ce26e34241b506b8ac，基线=cf_cont 进场态的纯增量 diff，3 hunk 全为本线改动），REVERSE-CHECK PASS；克隆内副本 .w/objreg/phaseb_objreg.patch。
- 零 commit、零分支、零 revert 他人 hunks；主树零写入零烤机。
