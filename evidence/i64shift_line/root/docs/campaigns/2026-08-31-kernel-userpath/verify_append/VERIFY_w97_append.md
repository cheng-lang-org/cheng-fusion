# wall97.VERIFY

## wall97 报告：`exact def derive: field borrow hop invalid op=1 slot=3` 墙清（v6 判词推进至后继所有权生产校验，授权面外停手移交）

日期 2026-09-02。承接 wall47/wall90/wall95 小节。w95 配方三文件全量落地：①compiler_csg 投影 RefObject 三段 ②lowering_plan containment 豁免 ③managed_lvalue_replace 同款豁免。烤机 1/3 轮一次完成。

### 判定
**wall97 目标墙已死。** v6 判词从 `exact def derive: field borrow hop invalid op=1 slot=3`（w95 富化实锤 children_count=0）推进为 `ownership body ir production: managed TypeArena layout drift`（bare 判词）。推进必然性证明：w95 判词 residual_same_phys=0 即整值借视臂三条件不满足，derive 对 op=1 slot=3 只能经 layout children 逐跳命中 (16,0,8) 才放行；且 BodyIrExactDefDerive（唯一 seal 写点）先于 ownership 生产校验运行（ownership_body_ir_production.cheng:1304-1306 注释自证）。本臂改动列（layoutChild*）与 drift 校验输入（slot size/align、typeFact 六列）零交集——typeFact 绑定源=lowering.typeArenaSizeBytes/AlignBytes 等未动列（primary_object_plan:29487、backend2_lower:576、managed_lvalue_replace:1245 三处核实）。

### 修法（/tmp/oob_ab/wall97.patch，sha256=a85136b3…6560，431 行，reverse-check 过；单轮 r1==终版）
1. **src/core/tooling/compiler_csg.cheng** `CompilerCsgCanonicalTypeFactsInto`（本臂 4 hunk，:12897/:12936/:12966/:12983）：(a) layoutChildCount 分配链 RefObject 并入 Tuple/Object/Enum 臂=childCount；(b) 逐子偏移 RefObject 并入 Tuple/Object aggregateCursor 臂（pointee 偏移空间，子宽=子行 exact size，Box 句柄 8 即 arena 字段宽 8）；(c) member identity 块外层纳入 RefObject、内层走 Object 臂（memberRow=memberStart+ordinal，RefObject 声明行 symbolId+members 由 typedExprTypeArenaBuildObjectDeclaration 同一函数发布，:1660-1705 核实）。
2. **src/core/backend/lowering_plan.cheng**（本臂 2 hunk，:25532 注释+:25552 豁免）：layout member containment `byteOffset > sizeBytes[typeId] - byteWidth` 加 `structuralKinds[typeId] != RefObject` 前缀（wall47 snapshot schema `!refObjectLayout &&` 同款，非弱化：ref 行 8/8 句柄、字段行居 pointee 空间，row-size 域检查对其无意义）。
3. **src/core/analysis/managed_lvalue_replace.cheng**（本臂 2 hunk，注释+:813 同款豁免）：`managedLvalueReplaceDropGlueColumnsValid` 契约一致性（其唯一调用方 ManagedLvalueReplaceBuildDropGlueDescriptorExact 全树零调用，纯死代码面）。

### 门禁与验收实况（cwd=仓库根，零抬帽，全程零 rc=125）
| 门 | 结果 |
|---|---|
| 秒级门三文件 × cheng_now3 --emit:obj | 全 rc=0 |
| 车头 cheng_w97（clang rc=0，sha256=f40d29fd…0855d）× v6 | compile=0 / run=0（语义参照 r=7 保持） |
| 烤机 kernel_driver_w97 | rc=0，sha256=ae02d032…18330，size 184936384 |
| **v6 × w97** | compile rc=1 `ownership body ir production: managed TypeArena layout drift`——**hop 墙死亡**，fn=2（outer，与 w95 死点同函数）相位后移 |
| ordinary × w97 | compile=0 / run=0 不回归 |
| call_fixture × w97 | compile=0 / run=1 契约预期不回归 |
| cold_nested × w97（只记录） | rc=1 `cleanup_cfg: managed BodyOp consume authority invalid`；× w95 同判词=并行线（w86r cleanup_cfg/exact_def_freeze）领地既有，与本臂无关 |

### 后继墙证据（移交，授权面外）
1. **v6 后继墙**：`ownership body ir production: managed TypeArena layout drift`（ownership_body_ir_production.cheng:332-339，裸判词四条件共用：ShapeValid∨typeFactRow<0∨size≠∨align≠，无富化列）。失败函数=fn2 outer（w95/w97 log 均为同两行 regalloc ledger 后死）。定性=既有潜在墙：derive 先死后从未可达；本臂不动其任何输入列。修面=ownership_body_ir_production.cheng（他线有在树改动，归属编排者裁量），建议按 wall74/w80/w87/w95 先例富化判词（op/slot/typeFact 全列）再定性。
2. **探针 A 副产物**（zz_probe_w97.cheng=v6 去嵌套直调形，已删）：w95/w97 双驱动同判词 `ingress BodyIR ownership invalid code=1 site=2 index=2 fn=1`（带全量富化 dump），车头 cheng_w97 compile=0 run=0——又一既有后墙，位置更前（ingress 门 vs per-op require 门），可作后继线现成富化样本。
3. wall47 预警的 `PrimaryBodyIrFieldChainPreflight`（primary_object_plan.cheng:29214）核实不消费 layoutChild 列（typedIr exactLayout/typeField 行），:29387 `field layout overflow` 张力仍在（ownerSize=8B 句柄 vs pointee offset），后墙候选不变。

### 交付与统计
- /tmp/oob_ab/wall97.patch（== wall97_r1.patch，vs HEAD 累积式含在树前臂 hunks；本臂净归属：compiler_csg 前 4 hunk、lowering_plan 末 2 hunk、managed_lvalue_replace 全部 2 hunk）
- git diff --numstat：apply 前 compiler_csg +92/-0、lowering_plan +153/-7、mlr +0/-0 → apply 后 compiler_csg +105/-2、lowering_plan +154/-8、mlr +5/-1（本臂净 +43/-3 行）
- 车头 cheng_w97 sha256=f40d29fdf6f676d072f0a2bbf2377aef53f98e2234ec855b14e073c75a80855d；烤机 kernel_driver_w97 sha256=ae02d0324ba30d60b44fd0637ab7d3a64f21fe81f4b1f87d4681109eb9418330
- 产物/日志全在 /tmp/oob_ab/w97/（bake_r1.log、v6_compile.log、ordinary/call_fixture/cold_nested 编运 log、gate_*.log、探针双驱动对照 log）；探针已删净；未 git commit；编排者资产只读未动
