## wall95（v6 hop children 墙，w95 臂）——判词富化+定性完成，病根在授权面外，停手移交

日期 2026-09-02。承接 wall85/wall90 小节（原 VERIFY.md 已被 /tmp 清理，本文件为重建首节，w95 依据任务书与树态重建上下文）。

### 判定
v6 墙未死（诚实判定）：op=1 slot=3 判词原样复现。①判词富化已落地并烤机实证；②定性收敛为唯一病根：**layout children 生产的 RefObject 臂缺失**，位于 `CompilerCsgCanonicalTypeFactsInto`（src/core/tooling/compiler_csg.cheng:12783 起）+ 配对 containment 校验豁免（src/core/backend/lowering_plan.cheng:25694）——**均在 w95 授权文件面（exact_def_derive.cheng / typed_expr.cheng）之外**，按纪律停手完整移交。derive/hop 侧无可契约对齐的授权内修法（窗口无 RefObject 偏移列，分析层自算布局=第二布局权威=启发式，严禁）。

### 烤机与门禁（cwd=仓库根）
- 车头：`/tmp/oob_ab/cheng_w95`（bootstrap/cheng_cold.c，clang rc=0，13 warnings 全部既有 format 类）
- 烤机：`kernel_driver_w95` rc=0，sha256 `e821a8c98560c00ea58c70f84ba3ff32880e4d23fef163ec560c3b86ab15e40d`，size 184919968
- 秒级门：cheng_now3 编 exact_def_derive.cheng rc=0（期间两遇 w94 root 租约，串行重试即消，同移交预警）
- v6（kernel_driver_w95）：compile rc=1（墙仍在，判词见下）；ordinary compile=0 run=0；call_fixture compile=0 run=1 —— 富化改动零行为面变化，门禁不回归
- RSS：本轮 v6/ordinary/call_fixture 均 rc 正常未撞 125

### 富化判词实证（v6 op=1 slot=3，单行节选）
```
exact def derive: field borrow hop invalid op=1 slot=3 fn=2 shape=10 expect_tid=16 offset=0 width=8 dst_name=#nev34 dst_tk=4 dst_sz=8 dst_al=8 base_slot=2 base_tk=4 base_sz=8 owner_tid=20 physical=17:kind=8:sz=8:al=8 field_physical=16 residual_off0=1 residual_fullw=1 residual_same_phys=0 children_start=3 children_count=0 children_csr_len=3 children=[]
```
读法：shape=10=children 三元组未命中（整值残形三条件 off0/fullw 已满足、same_phys=0 正确拒绝）；owner 行 physical=17 **kind=8=TypedExprStructuralTypeRefObject**（枚举序核实 typed_expr_type_arena.cheng:10-25），8/8=指针句柄（wall47 权威活体）；期望三元组 (16=Box,0,8)=arena 字段；**children_count=0** 而 children_csr_len=3（全窗仅 Col 的 3 个 int32 字段行——Object 行投影正常、RefObject 行被生产段整体丢弃）。w90 预言的「Node 行 children 挂法核实」结局实锤。

### 机理（定性三问逐答）
1. **children 该由谁发布**：TypeArena 层已正确挂——`typedExprTypeArenaBuildObjectDeclaration`（src/core/lang/typed_expr_type_arena.cheng:1518 起）对 `ParserTypeSyntaxObject→Object` 与 `ParserTypeSyntaxRefObject→RefObject` 同一路径，字段 childTypeIds/childNames 全部挂声明行自身（Node 行 childCount=4）。投影层唯一权威 `CompilerCsgCanonicalTypeFactsInto` 的 layoutChildCount 分配链：Alias/Apply/Sequence/FixedArray/Optional→1；Tuple/Object/Enum→childCount；**RefObject 两臂皆漏→恒 0**。
2. **(16,0,8) 该挂到哪行**：Node RefObject 行（physical=17）的 pointee-offset 空间字段行——即 wall47 exact-layout 判词原话（compiler_snapshot_schema.cheng:9245-9248）："RefObject layout rows carry the 8/8 pointer-handle extent while their field rows live in pointee-offset space (backend handle-deref addressing)"，且该处 containment 校验已带 ref 豁免（`!refObjectLayout &&` 前缀）。derive hop 对 RefObject owner 查本行 children 的方向**正确**，数据只是没被投影。
3. **缺哪段生产**：compiler_csg 投影三段 RefObject 臂——(a) layoutChildCount=childCount；(b) 逐子偏移走 Tuple/Object 的 aggregateCursor（pointee 空间）；(c) member identity 块（Object||Enum→symbol member 查找，identityKind=2）纳入 RefObject（RefObject 声明行同有 symbolId+members，build 路径同一函数）。配对豁免：lowering_plan.cheng:25694 `byteOffset > typeArenaSizeBytes[typeId] - byteWidth` 对 structuralKinds[typeId]==RefObject 跳过（wall47 snapshot schema 同款）；managed_lvalue_replace.cheng:813 同形校验现存无活调用方（ManagedLvalueReplaceBuildDropGlueDescriptorExact 全树零调用），契约一致性建议同改。活校验面仅 lowering_plan 一处（backend2/primary_object_plan 只构造窗口无校验；body_ir_exact_def 窗形状校验无 containment）。

### 修法配方（移交下一臂，契约对齐零弱化）
- src/core/tooling/compiler_csg.cheng `CompilerCsgCanonicalTypeFactsInto`：RefObject 臂三段（上述 a/b/c）
- src/core/backend/lowering_plan.cheng:25694 附近：ref 行 containment 豁免
- src/core/analysis/managed_lvalue_replace.cheng:813：同款豁免（一致性）
- derive/exact_def_derive.cheng 无需再改（hop 命中后 v6 应绿；wall95 富化判词保留作永久守卫面）
- 预警：改 compiler_csg 投影会改 lowering plan 字节→烤机属字节敏感面，注意与 GEN 固定点/快照再生的编排协同

### w95 产物
- /tmp/oob_ab/wall95.patch（当前树态，分文件：exact_def_derive.cheng 含 [wall95] 富化 hunk；typed_expr.cheng 本臂零新 hunk，其 diff 内容为前臂既有）
- /tmp/oob_ab/w95/：v6_verdict_w95_keep.log（富化判词全log）、bake_r1.log、ordinary/call_fixture 编运 log、tc_gate.log
- apply 前 git diff --stat（两授权文件）：exact_def_derive 66 行、typed_expr 195 行（既有）；apply 后：exact_def_derive 110 行(+44)、typed_expr 195 行（不变）


## wall95-B（cleanup_cfg consume authority 墙 + CallOp/BodyOp drift 同域臂，cfg_wall95 臂 = kernel 用户路径 cold_nested）——两臂全灭：r2(w95c) 富化判词一烤钉死臂1漂移形=TypedExpr OwnMove def cop=7/car=-1 被 ManagedStoreNone ingress 消费 op（car=5 陈旧）消费，契约对齐双列修法一烤穿墙；r3(w95d) 臂2（终审 CallOp 配对 car 列与 decode owned-call-mirror 生产不变量相反）对齐修法一烤穿墙；cold_nested 越过 cleanup_cfg 终审全域推进至 backend2 域 `backend2_bodyir_codec_data_relocation_identity_invalid`（授权面边界停手移交）；ordinary 0/0、call_fixture 0/1 不回归；本臂烤机 3/3 轮

日期 2026-09-02。与上节「wall95（v6 hop children 墙，w95 臂）」为并行双臂共享 w95 窗口：上节领地 exact_def_derive/typed_expr（v6 线），本节领地 src/core/analysis/cleanup_cfg.cheng（cfg 线）；cheng_w95 车头与 kernel_driver_w95 基线烤机为 v6 线所建（本线复用为复现/门禁/烤机车头），两线 w95 目录文件名无冲突。

### 判定
- **臂1 死亡（w95c）**：A/B 同窗实证——kernel_driver_w95 基线编 cold_nested rc=1 `cleanup_cfg: managed BodyOp consume authority invalid`（无取数列）；w95b 富化轮同判词携全列定案；w95c 该判词消失。
- **臂2 死亡（w95d）**：w95c 编 cold_nested rc=1 推进至 `cleanup_cfg: managed CallOp/BodyOp authority drift`（同终审同域后续臂，静态经 decode owned-call-mirror 定性）；w95d 该判词消失，cold_nested 越过 `CleanupBodyIrManagedAuthorityFinalStrictValidate` 全域（per-op 三臂 + CallOp 配对臂），推进至 backend2 域判词 `backend2_bodyir_codec_data_relocation_identity_invalid`——非 cleanup_cfg 领地，按纪律停手完整移交。
- 主树仅改 src/core/analysis/cleanup_cfg.cheng。vs HEAD：本线 apply 前 +503/−128（w44/57/62/64/69/76/79 hunks 在树态）→ apply 后 +655/−152（本线净 +152/−24，4 hunk）。

### 补丁与烤机（cwd=仓库根）
- 补丁（vs HEAD 累积式，`git apply --check -R` 对当前树干净过）：终件 /tmp/oob_ab/cfg_wall95.patch（sha256=aedd13ea43aa2ba0388f4ce9427ed5392399e7566efe14a8d598c7662a4c1059，1099 行）；分件 r1=/tmp/oob_ab/cfg_wall95_r1.patch（富化轮 4ec47f44246734d17ec92a3816f434c937d66fc6fae693d43a4eb989ad0146bc，926 行）、r2=/tmp/oob_ab/cfg_wall95_r2.patch（臂1修法轮 15f277a7a0c5c3c285dc58f7ac36a7f6c05f124e98a0f0a22ff06483e06b1a4a，1030 行）、r3=/tmp/oob_ab/cfg_wall95_r3.patch（臂2修法轮=终件同内容）。r1⊂r2⊂r3，单独 apply r3 即树态。
- 烤机（本臂 3/3 轮）：r1=kernel_driver_w95b（富化诊断）sha256=2bad1a43a45878d2f6a5325cee66cd5ef8ff7225169ec7ef14dce43f586c9d5c size=184936384；r2=kernel_driver_w95c（臂1修法定案）sha256=29be7099331c99759dc802baf043e26bb52a8e889a2a7609f39360903193477a size=184952800；r3=kernel_driver_w95d（臂2修法定案）sha256=a1a5eae50ea63461b6e65d5a9830d5dac6aeb000bafc4393d9faa31498882833 size=184985632。车头 cheng_w95 sha256=3af650ddcf0408330f5eaddeda11264bafc0f4263c166a8e6029d59bbe94632b（v6 线建）。
- 秒级门（cheng_w95 编 cleanup_cfg --emit:obj）三轮全 rc=0（w95/tc_gate_r1/r2/r3.log，G1 过）。

### 臂1 机理（w95b 富化判词一烤定案）
1. 漂移形：fn=0 op=5 opkind=2(Call) target=6 cop=7 car=-1 own=2(OwnMove) okind=1(TypedExpr) eni=semrow=oid=2 dom=0/srow=-1，消费 op=6（c_opkind=2 c_target=-1 c_car=5）。
2. 病根：wall35 生产道 ingress intrinsic 消费（`ManagedLvalueReplaceProductionBindIntrinsicSourceConsume` managed_lvalue_replace.cheng:1634-1636 + `PrimaryBodyIrAppendSeqStrAddValueSlot` primary_object_plan.cheng:18024-18075，cheng_seq_str_add 收编 fmt 插值 piece）按设计只绑源 def cop 边、源 def car 恒 -1（消费权威在 call/op 对列）；cold_nested fn=0 触发 insertFlagInitializers 头插 initializerCount=1 后，源 def cop 随迁（6→7）而消费 op/call 的 consumeActionRow=5 列不在随迁车道 → 终审单臂一致判死。
3. 修法（w95c，两 hunk，契约对齐零弱化）：(a) ops 平移循环新增 ingress 形 elif——ManagedStoreNone + Call 单 operand + op/car==自身原始行 + call/op 源定义对同指 + 源 def TypedExpr/OwnMove/cop==自身行+1/car==-1 八列全匹配才把 op 与 call 的 consumeActionRow 随 initializerCount 平移（callSequence 行 move-out 读-改-写无条件闭合，wall79 契约）；(b) 终审一致臂三臂化——新增 ingress 臂 C1..C8 逐列镜像 wall35 生产拼写（kind=Call/单 operand/operand 界内/target=-1/op 源定义对指本行/op action 行=cop-1/call ManagedStoreNone+源定义对指本行+action 行=cop-1/源 def Invalid+-1+TypedExpr+OwnMove+oid==semrow），全过方放行 car==-1；范围臂与 (cop==0↔car==-1)、(cop>0↔car>=0) 原臂逐字保留，非 ingress 形零放行增量。判词新增 i_valid/i_ord/i_c1..i_c8。

### 臂2 机理（静态 decode-mirror 定性，无需第二轮富化）
1. 形：被 cleanup move 消费的 TypedExpr call def（op.car=X≥0 由 move-source 戳/迁移车道设置），其自身 call 的 consumeActionRow=-1（decode 强制）→ 终审 CallOp 配对联判末列 `op.car != call.car` 判漂移。
2. 病根：终审配对联判的 car 列与 decode owned-call-mirror 生产不变量**相反**——body_ir_access.cheng:4920-4954 对 TypedExpr call def 无条件钉 `call.consumeActionRow == -1`（且不比 def 侧 car；def 侧消费账归 def op 独有，由 per-op 臂全量审）。decode 先于终审运行且通过 ⇒ 配对 car 列对一切合法被消费 call def 形必判死（cold_nested 首次走到该域=首个暴露夹具；call_fixture 无此形故绿）。
3. 修法（w95d，一 hunk）：配对 car 列改为 `(op.car != call.car) && (call.car != -1)`——call 侧携动作行且与 op 侧不一致仍判死（managed-replace 对两侧同 action 行相等照旧要求），call 侧 -1 时 op 侧 car 交回 per-op 臂管辖（其权威已在该处全量验证）；同 hunk 附判词富化（dup/c_target..c_car 十一列 + op_car/call_car/call_own/call_result/ops）。另富化同域 `consume site does not reach managed definition` 臂（cop/consume_op/def_dom/def_row/ops/op_car/okind 列）。

### 门禁与验收实况（cwd=仓库根，RSS 默认帽零抬）
| 件 | 结果 |
|---|---|
| cold_nested × w95b | compile rc=1 臂1判词携全列（定案数据） |
| cold_nested × w95c | compile rc=1 推进 `managed CallOp/BodyOp authority drift`（臂1死亡实证） |
| cold_nested × w95d | compile rc=1 推进 backend2 域 `backend2_bodyir_codec_data_relocation_identity_invalid`（cleanup 终审全域穿过） |
| ordinary_zero_exit_fixture × w95d | compile rc=0 / run rc=0 不回归 |
| zz_call_fixture_w7 × w95d | compile rc=0 / run rc=1 契约预期不回归（× w95c 同样 0/1 不回归） |
| v6 | 上节领地，并行线在先只记录 |
| 探针 | 未启用（臂1富化判词一烤取得全列，臂2静态定性；zz_probe_w95 未创建，src/tests 零残留） |

### 移交与遗留
1. **下一墙（backend2 领地，授权外停手）**：`backend2_bodyir_codec_data_relocation_identity_invalid`（cold_nested × w95d，/tmp/oob_ab/w95/cold_nested_d.stderr）——判词无取数列，接力先富化；领地 src/core/backend2/（backend2_pipeline/backend2_frag_codec 等），与 exact_def 侧车 w83 行系平移可能有交（本线 w95c 臂1(a) hunk 新增了 callSequence 行的 ingress car 随迁，接力归因时先对照 w95c 前后行为）。
2. **ingress 源 def car 语义遗留**：臂1修法未给源 def 补 stamp car（那需改 managed_lvalue_replace.cheng，授权外），以终审 ingress 臂对齐生产拼写；若后续域要求 def-car 列非 -1，须由生产道统一 stamp 并同步 decode。
3. **烤机预算 3/3 用尽**（本臂 w95b/w95c/w95d；kernel_driver_w95 为上节 v6 臂所烤不计本臂）。后续墙需新立项烤机。
4. 并行干扰记录：验收窗口多次「os atomic tree: parent lease unavailable」串行退避消解；w95 目录两线共用（文件名无冲突）。

### 纪律执行
主树仅改 cleanup_cfg.cheng；他线领地（exact_def_*/typed_expr/primary_object_plan/managed_lvalue_replace/backend2）零触碰（仅只读引用定性）；未 git commit；禁抬 RSS 帽；未启用降级/兜底/启发式补丁；产物集中 /tmp/oob_ab/w95/；本节经 python3 append 一次性并入，未整文件读改写。
