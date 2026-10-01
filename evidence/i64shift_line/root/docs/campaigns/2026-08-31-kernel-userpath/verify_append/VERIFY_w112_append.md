# wall112.VERIFY

## wall112 报告：v6 `cleanup_cfg: managed definition ownership invalid` 墙死亡（cleanupCfgValidateManagedDefinitionRow 守卫内 + CleanupBodyIrManagedAuthorityFinalStrictValidate 终审循环两站点 OwnPlain 纯值定义同构 admit）——v6 判词从 cleanup_cfg.cheng:5276 推进至 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=3 detail=-1`（production ingress=body_ir_access decodeCallOrdinal 托管 call-result 行门，授权面外）→ 撞契约边界停手完整移交

日期 2026-09-02。承接 wall110 小节移交（cleanup_cfg 授权线 OwnPlain admit）。授权面=src/core/analysis/cleanup_cfg.cheng（唯一改动文件，烤机 1/3 轮一次过）。

### 判定（本墙死亡，cleanup_cfg 域同域五调用面全清；下一臂撞授权边界停手）
1. **病根与修法（按 w110 移交配方逐列落地）**：`cleanupCfgValidateManagedDefinitionRow`（:5269）首门硬要求托管 def `valueDefOwnership ∈ {OwnMove, OwnBorrowShared}`，非托管 call-result 的 OwnPlain 纯值 def（op11）即死 :5276。修法=[wall112] 两站点同构 admit，与 exact_def_identity [wall110] admit 逐列同形（body_ir_access [wall108r3] 13 列 + CallTag 载体 3 列）：`op.kind==CallTag ∧ operands.len==1 ∧ target==valueDefSlot ∧ OwnPlain ∧ OriginKind==TypedExpr ∧ originId==semanticRow>=0 ∧ exprNode>=0 ∧ 借主三列（bo_row==-1 ∧ bo_domain==Invalid ∧ bo_def_row==-1）∧ 源对 Invalid ∧ consumeActionRow==-1 ∧ 槽范围内 Unmanaged+tid>=0`。（exact_def_identity 的 `origin==slot` 列为 exactDef 域专有 opOriginIds，BodyOp 无此列，该恒等式在本域由 originId==semanticRow 承担。）站点 A=守卫内（admit 提前 return；admit 联立逐列强于本函数原 identity/TypedExpr authority 各检，全部为 admit 真子集，无弱化），覆盖 :5759 transfer/:6012 consumer/:9750 captured-old/:12513 producer 四调用面；站点 B=终审循环（CleanupBodyIrManagedAuthorityFinalStrictValidate :5413 前 admit→continue；后续 cleanupCfgRequireExactManagedSlot 要求 ManagedTag 存储与 consume authority 审按 OwnMove/BorrowShared 托管槽转移语义构建，对 Unmanaged 槽纯值 def 不适用），镜像 wall108r3 continue 先例。两站点禁提取共享 helper（[wall108r2] 警示同款），互为锚定注记。非该形走原门原判词逐字节不变；无 sentinel 豁免、无计数门放宽、derive 零写。
2. **墙死亡实证**：烤机驱动 kernel_driver_w112 编 v6，`cleanup_cfg` 判词零出现（log grep cleanup_cfg=0），本域全绿——判词推进至 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=3 detail=-1 fn=3 op_kind=2 op_target=0 op_operands=1 a0=0 vd_slot=0 vd_own=2 vd_row=10 vd_node=56 vd_origin=1 vd_origin_id=10 …`（full slot dump 36 槽在 /tmp/oob_ab/w112/v6_compile_w112.log）。
3. **多臂裁定（下一臂：授权边界停手）**：新墙=OwnershipBodyIrProductionApplyOwned（ownership_body_ir_production.cheng :1293 入口）的 `BodyIrAccessDecode` ingress 门（判词 :1319），真实 fail 点在 body_ir_access.cheng `bodyIrAccessDecodeCallOrdinal` ~:1517-1526（resultOwnership 非 OwnInvalid 托管 call 行要求 resultSlot>=0/exprNode>=0/origin 联立，fail detail=call.resultSlot）——detail=-1 ⟹ call 行 resultSlot==-1。触发 op=fn3(main) op3（`n = new(Node)`，CallTag，OwnMove 托管 def vd_own=2，callSequence[0]）。归因双证：(a) w110 驱动 v6 死 cleanup_cfg:5276 ⟹ cleanup_cfg pass 先于 production ingress 执行，本门是纯下游新墙；(b) 死点形 vd_own=2 OwnMove+托管槽，非 [wall112] admit 放行形（admit 需 OwnPlain+Unmanaged 槽），与本次改动无因果。**病根文件 body_ir_access.cheng（cold_nested/w111 线活跃领地）与 ownership_body_ir_production.cheng 均在授权面外，按纪律停手移交**。移交修法方向：body_ir_access decodeCallOrdinal 托管 call-result 行对「resultSlot==-1 而经 argSlots 目标地址交付结果（new/构造托管 replace 形）」的 admit 臂，或与发射器 call 行生产契约对齐——须先核对 callSequence[0] 实际列（用 w112 驱动 + wall95 富化基建复现取列）。
4. **车头勘误补充**：任务书配方 `/tmp/oob_ab/cheng_final` 不存在（w110 已勘误）；按重建配方仓库根 `clang -std=c11 -O2 -o /tmp/oob_ab/cheng_w112 bootstrap/cheng_cold.c` 重建（rc=0，warning 均冷链既有噪音），v6 compile=0/run=0 语义参照达成。

### 门禁与验收实况（cwd=仓库根，零抬帽，烤机 1 轮一次过；w111 线并行验证占根树租约，ordinary 首撞 rc=2「parent lease unavailable」退避重试即消）
| 门 | 结果 |
|---|---|
| 秒级门（cheng_w112 --emit:obj cleanup_cfg.cheng） | rc=0 一次过 |
| 烤机 kernel_driver_w112（--driver cheng_w112） | rc=0，sha256=90416c8a782aea2ef6237ea68c244fdd81ddbe6ac397bd02b722171a5a76f1f0 |
| **v6（zz_v6_w7.cheng）× 烤机驱动** | **compile rc=1，判词推进**：`ownership body ir production: ingress … detail=-1`（cleanup_cfg 判词 grep=0；RSS 未触帽） |
| ordinary（ordinary_zero_exit_fixture.cheng）× 烤机驱动 | compile=0 / run=0 不回归 |
| call_fixture（zz_call_fixture_w7.cheng）× 烤机驱动 | compile=0 / run=1 契约预期不回归 |
| 车头 cheng_w112 × v6 | compile=0 / run=0 语义参照保持（车头 sha256=ce701c1e6f8e960ab8fbc3ec32bfacc58bb437a32d71017c8ed47e8e63ecec87） |
| cold_nested | 未触碰（w111 并行线领地，零涉入；其验证循环期间 observed 占租约） |

### 交付与统计
- /tmp/oob_ab/cfg_wall112.patch（== cfg_wall112_r1.patch，单轮一次过；vs HEAD 累积式含在树 w44/57/62/64/76/79+wall95 hunks，1173 行；sha256=fd42abaf3be6d1b6c35873185d2146b5445feab17f82d4022c52fac7a39726b3）。分文件（仅 cleanup_cfg.cheng）：apply 前 +655/−152，apply 后 +720/−152——本臂净归属 +65/−0（两 admit 块+两段锚注，零删除）。
- 探针 zz_probe_w112.cheng 未创建（v6 夹具即单变量验证物，墙判词即实况）；编排者资产（zz_v6_w7.cheng、user_path_gate.* 工作目录）零触碰；未 git commit；主树仅动 src/core/analysis/cleanup_cfg.cheng。
- /tmp/oob_ab/w112/：secsgate_w112.log、bake_w112.log、v6_compile_w112.log（终判词全 dump）、v6_head_compile.log、v6_head_run.log、ordinary_compile_w112.log、call_compile_w112.log、tc.o、v6_head.exe、ordinary_w112.exe、call_w112.exe。
