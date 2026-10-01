# wall116.VERIFY

## wall116 报告：v6 `ingress BodyIR ownership invalid code=15 site=2 index=3 detail=-1` 墙死亡（本战役目标墙清墙）——body_ir_access :5259 OwnMove cp1==0 臂落 [wall116] 待物化 admit（与 primaryCleanupWillMaterialize 同构谓词 + TypedExpr 全戳/Managed 槽/哨兵列/rtc==0∧esc==0 收窄 + 非 manual-consume），v6 判词推进到 production 侧 type-fact 门 `managed TypeArena layout drift … slot_type_id=17 fact_row=-1`（[wall98]/[wall100] 已定性的「托管槽 proof 绑定零 fact closure」缺臂家族，修法面=primary_object_plan/exact_def_derive，授权面外→停手移交）；ordinary 0/0、call_fixture 0/1、冷链 v6 0/0 零回归；烤机 1/3 轮

日期 2026-09-03。授权面=src/core/ir/body_ir_access.cheng（任务书 backend/ 误标，wall114 勘误同款）。主树净变更=本文件 +54/−0（单 hunk；文件全 diff +253/−18 含 w82/w108/w111 在树 hunks）。

### 判定（本墙死亡，判词推进，同域多臂无残留——下一墙在授权面外停手移交）
1. **修法落地（方向 a，wall115 推荐获批）**：`bodyIrAccessVerifyManagedValueDefinitions` cp1==0 臂内、appendOnlyMove 臂之后/return-term 权威审之前，插 [wall116] 待物化 admit（:5280 区，[wall108r3] 同族第四道门，行内全列拼写、无共享 helper）。谓词=OwnMove ∧ TypedExpr 全戳（originKind=TypedExpr ∧ originId==semanticRow ≥0 ∧ exprNode≥0）∧ consumeActionRow==-1 ∧ 借主三列全哨兵 ∧ 源对 (Invalid,-1) ∧ 槽 valid ∧ Managed+tid≥0 ∧ rtc==0 ∧ esc==0 ∧ 非 manual-consume（manualConsume.sourceDefinition* 扫描行内联，primary :65811 同款）。rtc==0∧esc==0 收窄使 admit 恰覆盖本墙形（probe D 实况 rtc=0 esc=0），rtc>0/esc>0 形走原臂零变化。
2. **fail-closed 自证（结构在案）**：admit 命中 ⇒ production `ownershipBodyIrCleanupDefinitionCount>0`（:1375，同谓词计数）必走物化路径 ⇒ :1388 同谓词循环 `RequireOwnedDefinition` 逐列复查（含 admit 未查的 TypeArena fact shape/size/align 与 structural leaf 审）⇒ CleanupPlanMaterialize 补权威+cop 回写 ⇒ :1798 final `BodyIrAccessDecode` 重审同一验证器。物化任何失约=production 侧 hard fail，不可能静默逃逸。v6 实测正落在该 fail-closed 链上（见 3）。
3. **v6 判词推进实锤（kernel_driver_w116，sha256=a255ffac49c91dc08e7f5baea25f9ae6a5bac89a784af224f447240937c4a3fd）**：旧判词 `ingress BodyIR ownership invalid code=15 site=2 index=3 detail=-1` 在 v6 编译日志 **0 命中**（grep 实证）；新判词 `ownership body ir production: managed TypeArena layout drift shape_valid=1 slot_type_id=17 fact_row=-1 fact_count=1 slot_name=n slot_type_kind=4 slot_storage=2 slot_size=8 slot_align=8 op=3 op_kind=2 own=2 origin_kind=1 origin_id=10 sem_row=10 fn=3`——op=3 即 `n = new(Node)` def，ingress decode 审已放行（admit 生效），死在 ownership_body_ir_production.cheng :356-363（[wall98] 判词富化形）的 TypeArena fact 权威审。
4. **下一墙定性（考古在案，授权面外停手）**：tid=17（Node）fact_row=-1 而 slot proof 在册（mg=2 tid=17）——`PrimaryBodyIrBindNewObjectAllocValueDefinitionExact`（primary_object_plan.cheng :17124-17133 区）只绑 `BodyIRBindTypeArenaArtifactCid`+`BodyIRBindLocalSlotTypeArenaProof`，**不绑 fact closure**；ApplyOwned 前唯一 fact 绑定点=exact_def_derive :405 field-hop 配对绑定（[wall100] 单点），只覆盖 hop 命中类型。wall98/wall100 已定性此为「托管槽 proof 绑定段绑槽 proof 零 fact closure，唯一缺臂绑定面」家族——new-object def 的自身类型不在 hop 配对覆盖内。修法方向（移交）：沿 wall100 先例在发射/derive 侧为 new-object def 的 exactTypeId 补 fact closure 绑定（primary_object_plan 分配点或 exact_def_derive 配对扩展，单点共享双管线）；或按 (b)/(c) 候选重排（wall115 条目 4）。涉及文件全在授权面外→按纪律停手。
5. **同域多臂检查（授权面内零残留）**：ingress decode 审时序矛盾形仅 OwnMove cp1==0 一臂（cleanup 物化路径唯一入口谓词）；OwnBorrowShared 臂（:5247，借用无 cleanup 义务）与 cp1!=0 canonical-consume 臂（物化后 final decode 审消费单元）均无「权威在后续才产生」的时序形。授权面内无后续臂。

### 门禁与验收实况（cwd=仓库根；烤机 1/3 轮；零抬帽；无 rc=125）
| 门 | 结果 |
|---|---|
| 车头重建 cheng_w116（clang bootstrap/cheng_cold.c） | rc=0（13 warnings 均冷链既有噪音） |
| 秒级门（cheng_w116 --emit:obj src/core/ir/body_ir_access.cheng） | rc=0 |
| 冷链 v6 门（cheng_w116 --emit:exe zz_v6_w7.cheng + 单跑） | compile=0 / run=0（语义参照一致） |
| 烤机 1 kernel_driver_w116 | rc=0，sha256=a255ffac49c91dc08e7f5baea25f9ae6a5bac89a784af224f447240937c4a3fd |
| v6 × w116 驱动 | compile rc=1 但判词推进：旧 ingress 墙 0 命中，新墙=production type-fact 门（见判定 3） |
| ordinary × w116 驱动 | compile=0 / run=0 不回归 |
| call_fixture × w116 驱动 | compile=0 / run=1 契约预期不回归 |

### 交付与统计
- /tmp/oob_ab/wall116.patch（=wall116_r1.patch，单轮收敛，21703 字节，以当前树态生成含 w82/w108/w111 在树 hunks；本线净贡献 +54/−0）。apply 前 git diff --stat=+199/−18（sha256=ddc20a76af01215e）、apply 后 +253/−18。
- 产物 /tmp/oob_ab/w116/：secsgate.log、v6_cold.log、v6_cold_run.log、bake1.log、v6_w116_compile.log（=v6_w116_nextwall.log，新判词全文在案）、ordinary_{compile,run}.log、call_{compile,run}.log、tc.o、v6_cold.exe、v6_w116.exe、ordinary_w116.exe、call_w116.exe。
- 未创建探针夹具（v6 夹具即验证物）；编排者资产（zz_v6_w7.cheng、user_path_gate.*）零触碰；未 git commit；烤机 1/3 轮。
