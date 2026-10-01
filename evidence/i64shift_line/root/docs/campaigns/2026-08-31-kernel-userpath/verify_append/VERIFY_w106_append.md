# wall106.VERIFY

## wall106 报告：发布侧三层补全落地之②（非托管 call-result let 绑定形 op 全列 OwnPlain 纯值定义戳）——v6 判词从 derive 层 wall105 推进到 ownership ingress AccessDecode 契约边界（body_ir_access.cheng:1623，运行时钉死）；附 w105 移交定性一处关键修正：TypedExpr 权威行并非缺失，绑定面早已发布（①层零缺口）；第三文件契约扩展=完整移交

日期 2026-09-02。承接 wall105 小节移交（v6 槽 7 call-result 定义行缺失，发布侧三层补全）。授权面=src/core/lang/typed_expr.cheng（①）+ src/core/backend/primary_object_plan.cheng（②）。主树实际只动 primary_object_plan.cheng（①层经定性为零缺口，未改，见判定 1）。

### 判定（三层因果链修正 + 授权面内修法收敛）
1. **w105 移交定性第①层修正（typed_expr 无缺口）**：v6 `let r1 = addCol(...)` 的 CallExpr 节点**已有** produced value-definition 权威行——绑定面 `PrimaryBodyIrBindLocalSlotFromTypedProducerExact`（primary_object_plan.cheng:5798）消费 `TypedExprIrNodeProducedValueDefinitionRowAt(rhsNodeIndex)` 且对行缺失/origin≠BindingInitializer 即 panic（:5817-5826），槽 7 的 tid=7+mg=1（Unmanaged）BodyIRBindLocalSlotTypeArenaProof 证明即该行的投影（w105 判词 slot_tid=7/slot_mg=1 实证绑定面已跑）→ 行必然存在，origin=BindingInitializer、exactTypeId=7、definingNode=该 CallExpr。w105 引「OwnPlain 没有 TypedExpr value-def」（:26727 注释）推出「①层不发布」系半区误读：该注释只描述 CallOp 行（resultOwnership 不能取 OwnPlain，因 AccessDecode :1592 OwnPlain 臂要求 resultValueDefinitionRow==-1 而 typedOrigin :1534-1537 要求 originId==vrow>=0，矛盾），不描述 BodyOp valueDef 列。**本臂①层零改动，仅把该注释的语义半区澄清补进源码（:26757 区 [wall106] 注记）。**
2. **第②层（lowering，本臂落地面）**：通用 call 发射臂（:27065 区）对非托管形落 **OwnPlain 纯值定义戳**（新函数 `PrimaryBodyIrBindUnmanagedCallResultDefinition`，:26793）：op.valueDef{Slot=r1, ExprNodeIndex=node54, Ownership=OwnPlain, OriginKind=TypedExpr, OriginId=semanticRow, SemanticRow=semanticRow}，借主/源/消费列保持 Invalid/-1；call 行权威列零接触（OwnInvalid 语义保留，AccessDecode else 臂契约不动）。触发面=托管两臂（OwnMove/OwnBorrowShared 戳臂、managedLocalDefinition 绑定臂）皆不接 ∧ 槽非 sentinel（tid>=0）∧ storage=Unmanaged；权威行查不到/origin 越域/节点漂移/TypeId 漂移/borrow owner 非法/transport 窗不符/已绑非零戳全 panic（fail-closed，零启发式）。语义依据：非托管标量无所有权转移无 cleanup 义务（storage=PLAIN），OwnPlain=纯值定义；先例=entry freeze 对非托管参数戳 OwnPlain（lowering_plan.cheng:22646 区）；ApplyOwned 的 TypedExpr-origin 托管扫描（ownership_body_ir_production.cheng:1349）只对 Move/BorrowShared 生效，OwnPlain 合法绕开其 ManagedTag 槽要求。derive/identity 既有臂原样消费：transport 窗行命中 → BindingInitializer origin → STACK_LOCAL/origin=slotRow 落车道（exact_def_derive.cheng:893-896），storage=PLAIN，defs 计数 0→1，wall105 判词块（vds<0∧CallTag∧非sentinel∧count==0）不再命中。
3. **第③层后新契约边界（运行时钉死，第三文件授权外）**：v6 判词从 `exact def derive: call result definition authority missing op=11…`（wall105）推进为 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=11 detail=1 fn=2 … vd_slot=7 vd_own=1 vd_row=7 vd_node=54 vd_origin=1 vd_origin_id=7 …`（w106 烤机驱动实测）。坐标逐位钉死：code=15=BodyIrAccessErrorOwnership、site=2=SiteOp、index=11=o11、detail=1=int32(vd_own=OwnPlain)——失败点=body_ir_access.cheng:1623（bodyIrAccessDecodeCallOrdinal else 臂首析取：call.resultOwnership==OwnInvalid ⇒ 强制 op.valueDefOwnership==OwnInvalid，:1640-1645 fail 即 detail=vd_own）。该门在 OwnershipBodyIrProductionApplyOwned 入口无条件跑（ownership_body_ir_production.cheng:1299），derive（在先）已过、ingress（在后）必炸 ⇒ **授权面内任何戳形均不可变绿**：OwnPlain 死 :1623（本臂实测）；OwnMove/OwnBorrowShared 死 ownership scan 的 ManagedTag 槽要求（:292-334，非托管槽必炸）且 AccessDecode :1566 强制 op/call 所有权列镜像；Partial（OwnInvalid 戳）死 derive :649 partial definition tuple。**下一臂唯一修法=body_ir_access.cheng decodeCallOrdinal else 臂新增精确收窄臂： admit「call 行全哨兵（OwnInvalid/Unknown/-1 全列）∧ op.valueDefOwnership==OwnPlain ∧ vd_originKind==TypedExpr ∧ originId==semanticRow>=0 ∧ vdExprNodeIndex>=0 ∧ vdSlot==call.resultSlot ∧ 借主/源/消费列全 Invalid/-1」的纯值定义形（建议同时核槽 tid>=0+Unmanaged 或由 op/槽列联立自证）；红线不破：无 sentinel 豁免、无计数门放宽、derive 零写。** 后续连锁预告：该臂放开后还需核 exact_def_identity/freeze 批 3 def-tuple 审对 Plain+TypedExpr+CallOp 形的既有臂覆盖（本臂未达该门，未验证）。
4. **触发面安全性论证（绿面零扰动）**：非 sentinel 非托管 call 目标槽在改动前恒 defs==0（全树无任何对非托管槽落 valueDef 戳的臂；merge defs 走 exactDef 侧车列不入 op.valueDefSlot 倒排）⇒ 该形状今天必炸 wall105 判词 ⇒ 改动前不存在含此形状的绿程序 ⇒ 新臂触发集=空∩绿面。ordinary（无 call）、call_fixture（托管形走既有两臂）、全树烤机 rc=0 实证。

### 门禁与验收实况（cwd=仓库根，串行重试消租约，零抬帽，烤机 1/3 轮，零 rc=125）
| 门 | 结果 |
|---|---|
| 秒级门（C 链 cheng_w106 --emit:obj primary_object_plan.cheng） | rc=2，死因=codegen_a64_fill_units.cheng:9 闭包 parse（既有死因）；A/B：hunks revert 后逐字节同一死因（cmp 一致）→ 本臂零新增死因。typed_expr 未改动，pop=105 A/B 门不适用 |
| w105 烤机驱动 --emit:obj primary_object_plan.cheng | rc=139 确定性 SIGSEGV，A/B：baseline 同样 rc=139（与本臂无关的既有不稳，如实记录） |
| 烤机 kernel_driver_w106（--driver cheng_w106） | rc=0（生产前端完整类型过本臂代码），sha256=2cbd06ddb94caddc038f62c3ee72678395f21b915b80ac28a62f5c2156b01b76，size 185216096 |
| **v6 × w106** | **compile rc=1，判词推进**：wall105 derive 判词消失 → ingress 判词（判定 3 全文）；戳列 vd_slot=7/vd_own=1/vd_row=7/vd_node=54 实证落戳 |
| ordinary × w106 | compile=0 / run=0 不回归 |
| call_fixture（zz_call_fixture_w7）× w106 | compile=0 / run=1 契约预期不回归 |
| cold_nested（cold_nested_field_var_place_call_result_negative.cheng，只记录） | compile rc=1，判词=typed expr call declaration static argument type unavailable（该 negative 件既有拒绝，零 wall106 涉入） |
| 车头语义参照 cheng_w106（C 链）× v6 | compile=0 / run=0（clang rc=0，13 warnings 全既有 format 类） |
| 租约 | 编排者/w104b 同窗，90-150s 退避串行全消，未影响任何门 |

### 交付与统计
- /tmp/oob_ab/wall106.patch（== wall106_r1.patch，vs HEAD 累积式含在树既有 hunks，1164 行；sha256=547514b619636fcfa7d4131eaa477ad1cbf950b4bb38f4cbb289a24351b65d26）。分文件（仅 primary_object_plan.cheng）：git diff --stat apply 前 +605/-59 → apply 后 +747/-73；本臂净归属 +142/-14（2 hunks：[wall106] 注记+新函数 hunk1 +123/-9、发射第三臂 hunk2 +19/-5，全带 [wall106] 标记）
- 车头 cheng_w106 sha256=7f7f2c546d295dca04f41d36bcd62d7a5885d80996112584234a74e1c68524e9；烤机产物 sha256=2cbd06ddb94caddc038f62c3ee72678395f21b915b80ac28a62f5c2156b01b76（size 185216096）
- /tmp/oob_ab/w106/：v6/ordinary/call 三夹具 compile+run log、v6_w105_baseline.log（改前判词）、secsgate_pobj{,_base,_w105}.log（A/B 双向）、bake_w106.log、wall106_ab.py（A/B round-trip 工具）、v6_head_w106.exe（车头语义参照）
- 探针 zz_probe_w106.cheng 未创建（v6 夹具即单变量验证物，ingress 判词一次给全戳列实况）；编排者资产（zz_v6_w7.cheng、user_path_gate.* 工作目录）零触碰；未 git commit；主树仅动 primary_object_plan.cheng（typed_expr 零改动）；烤机 1/3 轮
- 遗留移交：body_ir_access.cheng :1623 else 臂精确收窄扩展（判定 3 给全 admit 谓词与红线）→ 后续 identity/freeze 批 3 Plain+TypedExpr+CallOp 覆盖核查 → v6 全绿
