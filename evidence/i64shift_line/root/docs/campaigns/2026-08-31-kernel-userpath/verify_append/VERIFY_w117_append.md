# wall117.VERIFY

## wall117 报告：v6 `ownership body ir production: managed TypeArena layout drift … slot_type_id=17 fact_row=-1 fact_count=1 slot_name=n op=3` 墙死亡（wall116 移交修法落地：new-object 定义盖章点补 fact closure 配对绑定）——v6 判词推进至 `ownership body ir production: managed ref owned definition drop-glue authority missing kind=8 … op=3 own=2`（wall73 fail-closed 拒臂，在树注释明示补齐须 program_support_backend var-ptr ABI glue + 双 backend 符号白名单三文件，授权面外契约边界→停手完整移交）；ordinary 0/0、call_fixture 0/1 零回归，cold_nested 1（并行线在先只记录）；烤机 1/3 轮一次过；零 rc=125 零租约冲突

日期 2026-09-03。授权面=src/core/backend/primary_object_plan.cheng 与 src/core/analysis/exact_def_derive.cheng。主树净变更=primary_object_plan.cheng +42/−0（3 hunk 区；本臂实际改动=绑定函数签名 +6 列、盖章联立 +closure、两调用点直传六列）；exact_def_derive.cheng 本臂零触碰（在树 236/5 为 w25/w90/w95/w100 前臂 hunks）。

### 判定（本墙死亡，判词推进至授权面外契约边界，同域无残留臂）
1. **修法落地（wall116 移交两候选中选「primary_object_plan 分配点」，wall98 定性「绑托管槽 proof 必配 fact closure」契约形同款）**：`PrimaryBodyIrBindNewObjectAllocValueDefinitionExact` 的 TypeArena 盖章联立（:17124 区）在 `BodyIRBindTypeArenaArtifactCid`+`BodyIRBindLocalSlotTypeArenaProof` 之后追加 `managedreplace.ManagedLvalueReplaceProductionBindTypeClosure` 第四联立臂——与两在树先例逐字同构（`PrimaryBodyIrAppendManagedGlobalStore` :18030 区 slot proof+closure 联立、lowering transport bridge :27439 区 closure+slot proof 联立）。签名扩 6 列（structuralKinds/scalarKinds/childTypeIds/fixedLengths/sizeBytes/alignBytes），两唯一调用点（decl-init 臂 :23578 区、node-eval 臂 :45355 区，enclosing 均 `lowering: var lower.LoweringPlanStub`）以 `lowering.typeArena*` 权威直传；artifactCid 用盖章点既有 `typedIr.valueDefinitionTypeArenaArtifactCid`（=lowering.typeArenaArtifactCid，lowering_plan :6099 直传投影）。panic 判词富化（原文本作前缀 grep 仍命中）：`…proof unavailable tid=… fn=… fact_count=…`。绑定幂等（BodyIRBindCanonicalTypeFact 既有同值行→true），失败=窗值不可 bind=证据洞 hard fail 无兜底；守卫零弱化（drift 四条件、wall73 形状审计、drop-glue 拒臂判定全部原样）。
2. **为何是分配点而非 derive 配对扩展**：wall98 已定性缺臂本体在发射侧盖章段（「Prepare/盖章段绑槽 proof 零 fact closure」家族），wall100 走 derive 单点系因 Prepare 7 调用点手术面大；new-object 盖章函数全树仅 2 调用点且 `lowering` 均在作用域，分配点配对=最小手术+契约原位。backend2_lower_slots 对称面（自有 AppendHeapObjectAllocZero 副本）在授权面外，只记录不触碰。
3. **v6 判词推进实锤（kernel_driver_w117 sha256=c2dbf549…c58f）**：旧判词 `managed TypeArena layout drift` 在 v6 compile.log/stderr **0 命中**（grep 实证）；新判词 `ownership body ir production: managed ref owned definition drop-glue authority missing kind=8 child=-1 slot_type_kind=4 slot_size=8 slot_align=8 op=3 own=2`。读法：op=3 即 main 的 `n = new(Node)` def（OwnMove），fact closure 绑定后 drift 四条件全过（fact_row≥0、8/8 尺寸对齐核对过）、wall73 RefObject 臂形状审计全过（scalar=Invalid、fixed=0、载体槽 LocalPtrTag、child=-1 闭包域放行），死在 :428 区 OwnMove fail-closed 拒臂——`kind=8`=TypedExprStructuralTypeRefObject（typed_expr_type_arena.cheng 枚举序 Invalid0…Object7,RefObject8）。与 wall97 预告一致（「op=1 Shared 借视形落穿，own!=Shared drop-glue 拒臂保留」）。
4. **下一墙定性（契约边界，停手移交）**：wall73 拒臂在树注释自证补齐面=`ownership_drop_ir` 硬契约（ref owned 定义出口必产 DropPlace）+ runtime 无 var-ptr ABI glue（唯一在册 cheng_str_drop_owned 是 str 头 ABI、cheng_mem_release 按值 ABI 不匹配）→ 补齐须 program_support_backend（新 glue）+ primary_object_plan/backend2_lower_slots（符号白名单）三文件。program_support_backend 与 ownership_body_ir_production 均在本臂授权面外；任何「放行 OwnMove RefObject def」的在授权面内改法都等于弱化 wall73 守卫=严禁。同域检查：exact_def_derive 对 new-object def（直定义形 slotTid==exactTypeId）无缺臂；wall98 遗留的 Prepare 段缺口当前不可达（v6 现有 def 均已配对）。
5. **秒级门归因（既有缺口，wall28/w33/w35 已归档同签名）**：`cheng_w117 --in:primary_object_plan.cheng --emit:obj` rc=2，死点=闭包内 `codegen_a64_fill_units.cheng` 裸块语法（`var pos = offset` 后裸缩进块，:471 区）触发冷链 `trailing tokens in let initializer`。A/B 归因：cheng_w116（本臂前置头，未含本臂编辑）同命令同死；fill 文件单文件直入 rc=2 同判词（该文件 HEAD 态零 diff，Aug 28 落树，早于冷链 publish）；VERIFY.md :1610/:1948/:2616/:2719 四处已归档「该秒级门对任意内容均不可达」。本臂编辑语法由烤机实证通过（manifest 闭包含 primary_object_plan，烤机 rc=0）。
6. **cold_nested 判词（只记录，非本臂归因）**：`ownership body ir production: materialized BodyIR ownership invalid` compile=1。该夹具 0 处 `new(`，本臂绑定函数零触发、fact 表零变化，结构性不可归因本臂；该墙属并行线（w86r cleanup_cfg/exact_def_freeze 在树 M 态）窗口，按派发须知静置归因。

### 门禁与验收实况（cwd=仓库根；烤机 1/3 轮一次过；零抬帽；零 rc=125；零租约冲突）
| 门 | 结果 |
|---|---|
| 车头重建 cheng_w117（clang bootstrap/cheng_cold.c） | rc=0（72 行 warnings 全冷链既有噪音），sha256=0fe2450a139fb34f0ec19db558923149cd87f42a758083ab53d5908bc63d4bb4 |
| 指定秒级门 primary_object_plan.cheng --emit:obj | rc=2（既有缺口，wall28/w33/w35 已归档同签名，A/B 归因见判定 5；烤机=权威编译验证 rc=0） |
| 车头 × v6（语义参照） | compile=0 / run=0（冷链不含本臂 .cheng 编辑，绿面保持） |
| 烤机 1 kernel_driver_w117 | rc=0，sha256=c2dbf549ba5a82ab99337f1bf86577ec07498b4b18e8eabcac72d55134f5c58f，size 185380544 |
| **v6 × w117** | compile rc=1 判词推进：`managed TypeArena layout drift` 0 命中，新墙=wall73 `managed ref owned definition drop-glue authority missing kind=8 … op=3 own=2`（契约边界） |
| ordinary × w117 | compile=0 / run=0 不回归 |
| call_fixture × w117 | compile=0 / run=1 契约预期不回归 |
| cold_nested × w117（只记录） | compile=1 `materialized BodyIR ownership invalid`（并行线窗口，结构性非本臂归因，见判定 6） |

### 交付与统计
- /tmp/oob_ab/wall117.patch（==wall117_r1.patch，单轮收敛，113175 字节，vs HEAD 累积式以当前树态生成，reverse-check 过；sha256=dd03e213440764ee9086194ba63e744536a1f6534b1b361b94f85fcb69491c20）。本臂净归属=primary_object_plan.cheng 3 hunk 区：@@ -16965,6 +17021,168（签名+盖章联立，区内含前臂上下文）、@@ -23200,13 +23541,34（decl-init 调用点直传六列）、@@ -44781,13 +45335,32（node-eval 调用点直传六列）；exact_def_derive.cheng 本臂零 hunks。
- apply 前后 git diff --stat（本臂两授权文件）：primary_object_plan.cheng 930→972 insertions（本臂净 +42/−0）、exact_def_derive.cheng 236/5 不变；全树 6843→6885 insertions。
- 产物 /tmp/oob_ab/w117/：bake1.log、secsgate.log+secsgate_fill*.log（秒级门 A/B 归因）、v6_cold.log+v6_cold_run.log（车头语义参照 0/0）、v6_w117_compile.log+v6_w117.stderr（新判词全文）、ordinary_*/call_*/cold_nested_* 编运 log、accept_w117.sh、diffstat_pre/post.txt、pobj.diff。
- 未创建探针夹具（v6 夹具即验证物）；编排者资产（zz_v6_w7.cheng、user_path_gate.* 工作目录）零触碰；未 git commit；烤机 1/3 轮。

### 移交（授权面外契约边界，完整证据）
1. 下一墙=`ownership_body_ir_production.cheng` :428 区 wall73 OwnMove 拒臂（判词已带 kind/child/slot/op 全列）。修法面三文件：program_support_backend（var-ptr ABI drop glue 新符号）+ primary_object_plan/backend2_lower_slots（drop call 符号白名单）+ ownership_body_ir_production（拒臂放行/改判）。四者均在 wall117 授权面外。
2. backend2_lower_slots 对称 new-object 盖章面未核（自有 AppendHeapObjectAllocZero 副本 :8326 区）；backend2 管线若启用同型 new-object def 需同款 closure 配对（wall98 遗留 2 同族）。
3. wall98 遗留 1 的 Prepare 段缺口（:17732 区，7 调用点）仍未配对，当前 v6 不可达；后续若暴露按 wall117 同款分配点配对或 wall100 derive 配对扩展处理。
