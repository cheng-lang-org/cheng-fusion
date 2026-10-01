# wall107b.VERIFY

## wall107b 报告：cold_nested `exact def derive: call result definition authority missing op=2 fn=1 slot=2 slot_name=nestedFmt#arg#0#str_literal#0` 墙死亡——定性=文本路径 str 字面量物化桥 call 漏接 wall33/wall28 同族 def 发布 binder（str 槽按 sentinel 谓词永非豁免），修法=四个文本路径调用点逐字同型接 PrimaryBodyIrBindManagedBridgeResultDefinition（wall33 EvalNode StrLit 臂先例），一烤穿墙；判词推进至 ownership ingress AccessDecode 域（body_ir_access.cheng，授权面外第三文件，停手完整移交）；ordinary 0/0、call_fixture 0/1 不回归，v6 同判词只记录；烤机 1/3 轮

日期 2026-09-02。承接 wall107 小节移交（cold_nested derive 层 call-result 定义行缺失，typed_expr/primary_object_plan 域）。授权面=src/core/backend/primary_object_plan.cheng + src/core/analysis/exact_def_derive.cheng。主树实际只动 primary_object_plan.cheng（exact_def_derive 零改动：发布侧补全后既有消费臂原样通过，见判定 3）。

### 判定（定性唯一收敛 + 修法）

1. **病根发射点**：`PrimaryBodyIrAppendStringLiteralValue`（primary_object_plan.cheng:17417）对非空载荷 str 字面量发 `driver_c_str_from_utf8_copy_bridge` 物化 call（resultSlot=targetSlot，resultPassKind=SretResult，call 行六列全哨兵），但 BodyOp 无任何 valueDef 戳——该函数 5 个调用点（cond 字面量/三元 then/else/decl RHS/call 实参）全部漏接 def 发布 binder。对照 EvalNode StrLit 臂（:41567，wall33 根修）：同物化后即调 `PrimaryBodyIrBindManagedBridgeResultDefinition` 落 call/op 全列 OwnMove 戳 + 槽 TypeId proof。
2. **为何必炸**：`BodyIrExactDefSlotIsSentinel`（body_ir_exact_def.cheng:317）对「未分类 str 托管值载体」返回 false（str 不在标量/聚合无条件臂）⇒ 射向 str 槽的无戳 CallOp 与 v6 的 i32 sentinel 槽不同，无任何豁免，derive [wall105] 守卫四条件合取必命中。本夹具炸点=main 内 `nestedFmt("asset", 7)` arg0 实参物化（`{stmt.callTarget}#arg#0#str_literal#0`，:25088 槽名生产点），call_row=0（from_utf8 桥）、call_result_pass=3(SretResult) 与该函数发射形逐列吻合。
3. **权威行存在性（binder 输入）**：typed_expr `TypedExprIrOpIsExactManagedTemporaryProducer`（:3726）首项即 `TypedExprIrOpStrLit`；catch-up 发布臂 `TypedExprIrAppendMissingManagedTemporaryValueDefinitionsExact`（:15049）对所有无行 producer 节点补发 ManagedTemporary 权威行；lowering transport 构建臂（lowering_plan.cheng:6335 区）全量携带。derive/freeze/ingress 对 ManagedTemporary+CallOp+OwnMove 形的消费在本夹具 fn=0 的 Fmt join 桥（wall28 binder）已全程走通，非新契约。
4. **修法（wall33 先例逐字同型，零弱化）**：4 个文本路径调用点在 `PrimaryBodyIrAppendStringLiteralValue` 成功后接同一 binder，权威行=各点在手的精确 StrLit 节点：①call 实参臂（:25086 区）`PrimaryBodyIrStatementCallArgNodeIndexAt`（同 fmt 实参臂取点方式），节点缺失/非 StrLit → failureDetail0=44 poison bail（同 fmt 臂口径）；②cond 操作数臂（:12830 区）用 `operandNodeIndex`（函数既有参数），节点缺失/非 StrLit → panic（同 :12740 "condition call operand lacks exact TypedExpr node" fail-closed 口径）；③④三元 then/else 臂（:22194/:22270 区）用入口已验界内的 `strTernThenNodeIndex`/`strTernElseNodeIndex`，非 StrLit → panic。空载荷走零填充无物化 call，按 wall33 裁定不打定义点。decl-RHS 臂（:23511）未动：该文本路径仅在节点求值放弃后可达，其 StrLit 节点可能已被绑定面 BindingInitializer 行认领（ManagedTemporary 行竞争未证），擅接 binder 有绿面 panic 风险，按契约边界停手（该形如可达仍在 derive 响亮炸出，非静默）。derive/identity/freeze/AccessDecode 零改动。
5. **触发面安全性**：改动前「str 槽+物化 Call+无戳」形状必炸 derive [wall105] ⇒ 不存在含此形状的绿程序；新增臂只把既有 fail 形变为携带权威的成功形，权威行/节点/transport/TypeId 任一不符即 binder 内 panic（fail-closed）。ordinary（无 call）、call_fixture（i32 调用）、全树烤机 rc=0 实证。

### 门禁与验收实况（cwd=仓库根，租约串行退避，零抬帽，烤机 1/3 轮，零 rc=125）

| 门 | 结果 |
|---|---|
| 秒级门（cheng_w107b --emit:obj primary_object_plan.cheng） | rc=2，A/B：.pre 快照同签名同死因（codegen_a64_fill_units.cheng:9 trailing tokens，HEAD 既有缺口，w93/w106 同归因）→ 本臂零新增死因 |
| 车头 cheng_w107b（clang rc=0，13 warnings 全既有 format 类）sha256=2e07473a22dc06d8cb5ca23b60887bb5a2a0e67541defb48d7db6d47a0262cc8 | × v6 compile=0/run=0；× cold_nested compile=0/run=0 输出 `cold_nested_fmt_interpolation=pass`（语义参照保持） |
| 烤机 kernel_driver_w107b | rc=0，sha256=e976ba4a661bb0e4f1cb140fed1968967357cc7dc34d39495a1eb799a4525ac5，size 185347712 |
| **cold_nested × w107b** | compile rc=1，**本墙死亡**：`exact def derive: call result definition authority missing` 全文零命中；regalloc ledger 期全绿（actions=155 emissions valid=1 words=104）；判词推进至 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=4 detail=4 fn=1 op_kind=9(CopyLocal) op_target=4 vd_slot=4 vd_own=3(BorrowShared) vd_row=8 vd_node=22 vd_origin=1 vd_origin_id=8 bo_row=8 bo_domain=2 bo_def_row=3 … s0/s2/s4:tk=3:mg=2:tid=13`（全列见 stderr 存档） |
| ordinary × w107b | compile=0 / run=0 不回归 |
| call_fixture × w107b | compile=0 / run=1 契约预期不回归（2 次租约退避后跑通） |
| v6 × w107b（只记录） | compile=1，判词=wall106 期既有 ingress 墙原样（`code=15 site=2 index=11 detail=1 fn=2 op_kind=2 vd_own=1 vd_row=7 vd_node=54 …`，body_ir_access [wall108] admit 臂未收该形=wall108 线领地现墙）；本臂零触发（v6 无 str 实参），车头 0/0 旁证 |

### 移交下一臂（ingress 域，授权外停手）

- **cold_nested 新墙（body_ir_access.cheng 域=wall106 移交的第三文件、wall108 线在树改动领地）**：ingress decode 拒收 fn=1(main) op4 CopyLocal def 形（code=15 detail=4，vd_own=3 OwnBorrowShared + 借主域 BodyOp/bo_def_row=3 + vd_row=8）。**归因（逐列钉死）**：本臂新戳全部为 CallTag/OwnMove(2)/借主列全 -1+Invalid；失败 def 为 CopyLocalTag(9)/OwnBorrowShared(3)/带借主——非本臂发射形，系树内既有 def（str==str 借读消费或 [wall100] hop 配对绑定族）在 derive 放行后首次抵达 ingress 门。接力修面=body_ir_access decode 的 CopyLocal+TypedExpr-origin+借主形 admit 臂（照 [wall108] 两 admit 臂先例），判词全列与 6 槽 dump 已存 /tmp/oob_ab/w107b/cold_nested_w107b.stderr。
- decl-RHS 文本臂（:23511）遗留：其权威行归属（ManagedTemporary vs BindingInitializer 竞争）未证，维持现状（可达该形仍在 derive 响亮炸出），待有夹具实证再接。
- cheng_final 车头现场本轮仍不存在，沿用各臂先例自建 /tmp/oob_ab/cheng_w107b。

### 交付与统计

- /tmp/oob_ab/wall107b.patch（149 行，sha256=4fcfeceb8bf3beab26d8b53c971c2fcc78a034431855556ab5e2ab0f5a2ad39e；单文件 primary_object_plan.cheng 7 hunk（4 站点，全带 [wall107b] 标记，vs 当前树态=wall108 期在树 hunks 之上的净增量）；`git apply --check -R` 对当前树干净过，正向 apply 到 .pre 快照与树态逐字节 cmp 一致）
- git diff --stat（primary_object_plan.cheng vs HEAD）：apply 前 747+/73- → apply 后 **839+/73-**；本臂净归属 +92/−0（4 hunk 组，全部 [wall107b]）；exact_def_derive.cheng 本臂零改动
- 车头 /tmp/oob_ab/cheng_w107b sha256=2e07473a22dc06d8cb5ca23b60887bb5a2a0e67541defb48d7db6d47a0262cc8；烤机产物 sha256=e976ba4a661bb0e4f1cb140fed1968967357cc7dc34d39495a1eb799a4525ac5
- /tmp/oob_ab/w107b/：accept_w107b.sh、tc.log/tc_pre.log（秒级门 A/B）、v6/cold_nested/ordinary/call_fixture 各 compile.log+stderr+run、primary_object_plan.cheng.pre/pop_post.cheng（A/B 物证）
- 探针 zz_probe_w107b.cheng 未创建（cold_nested 夹具即单变量验证物，src/tests 零残留）；编排者 user_path_gate.* 工作目录未动；zz_v6_w7.cheng 未动未删；未 git commit；主树仅动 primary_object_plan.cheng；烤机 1/3 轮（一次成功）
