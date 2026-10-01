
# wall98.VERIFY

## wall98 报告：`ownership body ir production: managed TypeArena layout drift` 墙——判词富化+定性完成，病根在授权面外，停手完整移交

日期 2026-09-02。承接 wall95/wall97 小节。授权面=src/core/analysis/ownership_body_ir_production.cheng（w39/w42/w44/w73 hunks 已在树）。

### 判定
v6 墙未清（诚实判定）：①判词富化已落地并烤机实证（单轮 r1==终版）；②定性收敛唯一病根：**托管槽 proof 绑定段的 canonical fact closure 配对缺失**，位于 `PrimaryBodyIrPrepareManagedBodyOpValueDefinitionExact`（src/core/backend/primary_object_plan.cheng:17732-17739）——修法须改 primary_object_plan 或 exact_def_derive（均授权面外），按纪律停手移交。授权面内无可契约对齐修法：`OwnershipBodyIrProductionApplyOwned(bodyIR)` 签名无权威窗口（exactDefWindow 十列只在 derive 调用点送达），BodyIR/exactDef sidecar 均不含 TypeArena 六列，分析层自算六列=第二权威=严禁；弱化 drift 判据（对借视形放行）=弱化守卫=严禁（w73 RefObject 臂注释明示 fact 形状审计是既定契约义务）。

### 烤机与门禁（cwd=仓库根，零抬帽，烤机 1/3 轮）
- 车头：/tmp/oob_ab/cheng_w98（bootstrap/cheng_cold.c，clang rc=0，13 warnings 全既有 format 类）sha256=7fcd8c28…a3717
- 烤机：kernel_driver_w98 rc=0，sha256=66ea6e36…50a5，size 184969216
- 秒级门：cheng_now3 编 ownership_body_ir_production.cheng --emit:obj rc=0
- v6 × w98：compile rc=1（墙仍在，富化判词见下）；车头 cheng_w98 × v6：compile=0 / run=0（语义参照 r=7 保持）
- ordinary × w98：compile=0 / run=0 不回归；call_fixture × w98：compile=0 / run=1 契约预期不回归
- RSS：全程零 rc=125；两次「os atomic tree: parent lease unavailable」为并行线（w95d 臂）持树租约，静置串行重试即消

### 富化判词实证（v6 fn=2 outer，op=1）
```
ownership body ir production: managed TypeArena layout drift shape_valid=1 slot_type_id=16 fact_row=-1 fact_count=3 slot_name=#nev34 slot_type_kind=4 slot_storage=2 slot_size=8 slot_align=8 fact_kind=-1 fact_scalar=-1 fact_child=-1 fact_fixed=-1 fact_size=-1 fact_align=-1 op=1 op_kind=14 own=3 origin_kind=1 origin_id=5 sem_row=5 fn=2
```
读法：四条件中**条件 2 命中（fact_row=-1）**——shape_valid=1、槽 proof 健康（tid=16=Box、mg=2=Managed、8/8、tk=4=LocalPtr），但 **Box(tid=16) 的 canonical fact 行从未绑进 fn2 的 fact 表**（fact_count=3 无 16）。op=1 即 w95/w97 同一 FieldLoad（n.arena 借视定义，own=3=OwnBorrowShared，staging 槽 #nev34）——w97 hop 放行后到达的下一门即本墙，与 w97 移交定性（独立预存墙）一致。

### 机理（定性三问逐答）
1. **drift 两权威**：slot 权威=localSlots[#nev34].typeArenaTypeId=16（字段自身 storage 权威，BodyIRBindLocalSlotTypeArenaProof 绑定）；fact 权威=bodyIR.typeFact* 六列表（绑定权威=lowering.typeArena* 六列+artifactCid 直传）。两者由 w90/w97 derive 臂对齐（def 行借主权威 20 → hop 以槽冻结 TypeId 16 逐跳证明），对齐后 ownership production 按槽权威查 fact 表——16 缺席。
2. **缺哪段生产**：绑槽 proof=16 的生产段 `PrimaryBodyIrPrepareManagedBodyOpValueDefinitionExact`（primary_object_plan.cheng:17732-17739）只绑 artifactCid+槽 proof，**零 fact closure**。v6 调用链：`PrimaryBodyIrMaterializeManagedBorrowedNodeValueExact`（:17933）→ Prepare。对照同树三处活例，「绑托管槽 proof 必配 fact closure」是既定契约形：(a) lowering_plan.cheng:23158-23175 `typeClosureOk`(ManagedLvalueReplaceProductionBindTypeClosure)+`slotProofOk` 联立 panic；(b) 同文件 `PrimaryBodyIrAppendManagedGlobalStore` :17996-18009 同款联立；(c) primary field chain :29487（fact closure）+:29520（槽 proof）先后配对。Prepare 是唯一缺臂的绑定面（全树 7 个 Prepare 调用点共享该缺口；backend2_lower:576 的对称面未逐行核实，接力应查）。
3. **为何此前不可达**：derive 先死（w95 hop invalid）时 ownership production 恒不达；w97 放行后第一次到达即死=独立预存墙，与本臂富化改动零交集（富化只动判词文本路径）。

### 修法配方（移交下一臂，契约对齐零弱化；二选一，首选甲）
- **甲（derive hop 配对补绑，单点、双管线共享）**：src/core/analysis/exact_def_derive.cheng field-borrow 臂 `bodyIrExactDefFieldHopValid` 命中返回前，为 slotTid 配对绑定 canonical fact closure——window（artifactCid+六列，LoweringPlanStub 直传权威）在手，与 primary field chain/lowering/managed-replace 各绑定面同权威源；可复用 managedreplace.ManagedLvalueReplaceProductionBindTypeClosure（child 闭包语义与 ownership production RefObject/Borrow 臂 child 在册性审计同源）。语义：hop 放行 def/slot 失配形 ⇔ destination 槽 storage 权威坐实 ⇔ 该 TypeId 的 fact 义务由 hop 配对补上（w97「hop 的 fieldTypeId=destination 槽冻结 TypeId」的配对延伸）。
- **乙（Prepare 段补 closure）**：primary_object_plan.cheng:17732-17739 配对 BindTypeClosure；需解决六列入参（Prepare 签名仅 typedIr，若 TypedExprIr 无六列投影则改签名+7 调用点，手术面大）。
- 两配方均非弱化：绑定的行值=权威直传，BodyIRBindCanonicalTypeFact 幂等（已存在同值行→true），既有 fact 表绑定面行为零变化。
- 注意：derive 改动属字节敏感面（w95 预警仍在），烤机窗口与 GEN 固定点协同由编排者统筹。

### wall98 产物
- /tmp/oob_ab/wall98.patch（==wall98_r1.patch，vs HEAD 累积式含在树 w39/w42/w44/w73 hunks，reverse-check 过，167 行）sha256=40e59eae…daf
- 本臂净归属：ownership_body_ir_production.cheng 1 hunk（drift 判词富化：diag 条件化七列+槽/op/fn 坐标全列入判词，wall91/w94 cleanup_cfg 先例同款；守卫判定零改动）
- apply 前 git diff --stat：93 insertions(+), 6 deletions(-)（99 行，在树前臂 hunks）；apply 后：118 insertions(+), 7 deletions(-)（125 行）
- /tmp/oob_ab/w98/：bake_r1.log、v6_verdict_w98_r1.log（富化判词全 log）、ordinary_compile/run.log、call_fixture_compile/run.log、v6_cold_compile/run.log（车头语义参照）、tc.o（秒级门产物）
- 探针：本臂未建（富化判词一次给全实况，无需探针）；他人文件/编排者 user_path_gate.* 工作目录零触碰；未 git commit；主树仅动授权文件

### 遗留
1. v6 墙链未终：本墙清（甲配方）后，ownership production 对 op=1 将进 wall73 RefObject 臂（tid=16=RefObject kind），其后还有 own!=Shared 的 drop-glue 拒臂（ref owned 定义 drop-glue 权威缺失，wall73 判词面保留）与 call-mirror 段；op=1 是 Shared 借视形，预期 RefObject 臂审计过即落穿。后继墙以实测为准。
2. backend2 线对称缺口未核实（backend2_pipeline:1883 同跑 ownership production；backend2_lower:576 绑定面覆盖范围需查）。
3. fn2 fact 表 3 行的具体来源未逐行定位（不影响定性：Box=16 缺席已实锤；接力可用 w98 富化判词+探针复证）。
