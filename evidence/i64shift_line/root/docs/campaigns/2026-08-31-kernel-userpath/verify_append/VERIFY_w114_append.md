
# wall114.VERIFY

## wall114 报告：v6 `ingress BodyIR ownership invalid code=15 site=2 index=3 detail=-1` 墙定性翻案（wall112 归因错误：detail=-1 非托管 call 行 resultSlot，真死点=body_ir_access `bodyIrAccessVerifyManagedValueDefinitions` 托管 def 权威审「missing release/return authority」门，detail=-1=`lastReturnConsumeTermByDefinition[ord]` 空哨兵）——缺口=cleanup/ownership 域对 `new(T)` 局部 ref def 的释放排布/消费链未达审计面（rtc=0 esc=0 cp1=0），授权面外→停手完整移交；主树零变更（wall114.patch=0 字节）；v6 判词不变、ordinary 0/0、call_fixture 0/1 零回归；烤机 2/3 轮

日期 2026-09-02。授权面=src/core/ir/body_ir_access.cheng（任务书误标 backend/，同 wall108b 勘误）。主树实际净变更=0。

### 判定（定性翻案完成，墙未死亡——撞授权边界停手移交）
1. **任务书/wall112 归因翻案（probe 实证三重）**：任务书预设「detail=-1 ⟹ main 的 `n = new(Node)`（op3）call 行 resultSlot==-1，死在 `bodyIrAccessDecodeCallOrdinal` ~:1517-1526 托管 call 行门」。本线穷尽实证推翻：(a) 发射侧考古——`PrimaryBodyIrAppendHeapObjectAllocZero`（primary_object_plan.cheng :16943）发射的 cheng_malloc allocCall 明确 `resultSlot = targetSlot`（:16994），`PrimaryBodyIrBindNewObjectAllocValueDefinitionExact`（:17034）盖 OwnMove+TypedExpr 全戳且形守卫 panic 级要求 `call.resultSlot == targetSlot`（:17088）；全仓「call.resultOwnership=OwnMove」仅 4 站点（primary :17133/:27417、lowering_plan :6587、cleanup_cfg :11684），全部守卫 resultSlot>=0——**不存在能发射 resultSlot=-1 托管 call 行的站点**；(b) lldb 断点（bodyIrAccessFail VM=0x100332928，map offset+__text 基址 0x100000758 换算，反汇编 `cheng_cold_cc14446d_2525` 标签实证）零命中——fail 站点全内联，顺带证明 wall108b 期「断点命中」的可用性在本驱动代已失效；(c) 环境变量门控 dump 探针（CHENG_BIA_W114_TRACE=1，三站点 A=托管行门 :1549/B=replay 映射门 :3033/C=CleanupRetain 权威审 :3271）随烤机驱动实测 **A/B/C 全零触发**。
2. **真死点（probe D 实锤）**：第四站点=`bodyIrAccessVerifyManagedValueDefinitions` 内 [wall108r3] OwnPlain admit 之后的 **OwnMove 托管 def 权威审「missing release/return authority」门**（body_ir_access.cheng :5297-5310 带 probe 后行号；原树态 :5273 区，`if returnTermCount <= 0 || explicitSourceOpCount != 0: fail(detail=lastReturnConsumeTermByDefinition[defDefinitionOrdinal])`）。probe D 输出（逐字节）：
   `bia_w114_probe_D defOp=3 ord=0 rtc=0 esc=0 kind=2 own=2 slot=0 row=10 oid=10 car=-1 cp1=0 mms=-1 lrtc=-1`
   ——判词四元组 (15, SiteOp, 3, -1) 的 index=defOpIndex=3（`n = new(Node)` 的 alloc def op）、**detail=-1=`lastReturnConsumeTermByDefinition[ord]` 空哨兵**（非 resultSlot）。wall108b 小节「两出口判词四元组全同构，文本不可分辨」的告诫在本墙再次应验：同四元组在不同门语义完全不同，归因必须逐站点 probe/lldb 实证，不能凭 detail 表达式直觉推断。
3. **缺口定位（rtc=0 ∧ esc=0 ∧ cp1=0 三零联立）**：op3 def（OwnMove+TypedExpr+row=10、slot0 Managed+tid=17、consumeActionRow=-1、consume link=0）在 decode 权威审中无任何释放/消费/返回证据：returnConsumeTermCount=0（无 return-term 边——main `return 0` 非托管 return，term.source Invalid，符合契约）、explicitSourceOpCount=0（**全 IR 无任何 op 的源定义对指向 (BodyOp,3)**——包括规范要求的 scope-exit 释放单元）、managedMoveStoreOp=-1、consume link=0。规范（docs/cheng-formal-spec.md :28）「scope 退出先执行 defer，再执行 releaseAllExcept(return)」——`var n: Node` 作用域退出必须 release，**释放权威（cleanup_cfg 物化的 drop/retain 单元，其源对应指向 (BodyOp,3)，或对 def 的 consume link 回写 cleanup_cfg :10406/:12011 同族）未排布或定义域选择错位（如排到 (EntrySlot,0)）**。发射侧 consume link 权威写点全集=managed_lvalue_replace :1635、exact_def_merge :1955、cleanup_cfg :10406/:12011——**均在授权面外**。
4. **多臂裁定（授权边界停手）**：本门在授权文件内，但 admit 修法无可联立合法形——「OwnMove def 无释放权威无消费链无返回边」正是本门要挡的真 RED（ref 泄漏/悬空托管定义守卫面），放行=真弱化，违背「严禁弱化守卫」；正确修面在 cleanup_cfg/ownership_drop_ir 域（释放 action 对 `new(T)` 局部 ref def 的排布缺失或定义域选择错位 + consume link 回写缺失），该域=cold_nested/w86r/w113 并行线领地。**按纪律停手完整移交**。移交修法方向：(i) 核对 v6 main 的 cleanup plan 是否为 op3 def 排布 release action（ownershipActionSourceDefinition* 列的落值域）；(ii) 若排到 (EntrySlot,0) 域，修正 reaching-definition 到 (BodyOp,3)；(iii) 释放单元物化后按 cleanup_cfg :10406/:12011 同族回写 op3.valueDefConsumeOpIndexPlusOne，使 decode 权威审走 :5273 else 的消费链臂（该臂对 cleanup 消费形已有 canonicalConsume 审：:5332-5344 要求 consumeOp/ consumeCall 源对双等 (BodyOp,defOpIndex) + callUsesSourceSlot——drop 单元源对已满足此形）。

### 判词富化（步骤①形态说明）
授权面内 body_ir_access 为纯验证器（无 IO 通道），production 侧判词模板（ownership_body_ir_production.cheng :1300-1319，非本线授权面）只读 table 四元组——「call 行全列坐标入判词」的永久形态需 production 配合，本线不可达。落地形态=**任务生命周期绑定的环境变量门控 dump 探针**（CHENG_BIA_W114_TRACE=1，四站点 A/B/C/D，默认关闭零行为变化），随烤机驱动实测后**已全部还原**（主树 body_ir_access.cheng 探针零残留，git diff 归零验证；probe 代码全文存 /tmp/oob_ab/w114/ 探针日志与 VERIFY 本节引用）。

### 门禁与验收实况（cwd=仓库根；烤机 2/3 轮；零抬帽）
| 门 | 结果 |
|---|---|
| 秒级门（cheng_w114 --emit:obj body_ir_access.cheng，快照根） | probe 态 rc=0 两轮均过；probe 还原后主树 diff 归零（+199/−18 与进入前一致，[wall114] 残留 grep=0） |
| 烤机 1（probe A/B/C）kernel_driver_w114_probe | rc=0，sha256=506604a7f7ef6ff3d290a4b50a17e84bc33dd01b4db67bc7a5cbbf008e28a690 |
| 烤机 2（probe D）kernel_driver_w114_probe2 | rc=0，sha256=8df41dda8115c8c2be63ffb045587ac835bbd16a537bd0e7506aa38321d77c1a |
| v6 × w112 基线驱动（快照根/主树根双跑） | compile rc=1，判词与 wall112 期逐字节同（detail=-1），零推进零回归 |
| ordinary × w112 驱动（主树根） | **compile=0 / run=0** 不回归 |
| call_fixture × w112 驱动（主树根） | **compile=0 / run=1** 契约预期不回归 |
| 车头 cheng_w114（clang 重建，warning 均冷链既有噪音） | 构建 rc=0；v6 语义参照沿用 wall112 期 0/0 记录 |
| cold_nested | 未触碰（w113/w86r 并行线领地；本线验证期其 probe 循环持续占主树租约，本线改用 /private/tmp 快照根 + cheng_scratch_scope 纪律完成全部实验，主树租约零争用冲突残局） |

### 实验方法论沉淀（后续归因直接复用）
1. **根树租约被并行线长占时的实验通道**：rsync 源树快照（src+bootstrap+tools+platform+ts-csg+receipts+manifests，APFS clonefile 零成本）→ `--root:/private/tmp/...`（**必须 /private/tmp canonical 拼写**，/tmp 是 symlink 会死 atomic tree "parent component open failed"）→ 独立租约；烤机用快照内 tools/build_kernel_driver.sh（ROOT=脚本父目录）+ --driver C 车头。
2. **line map→断点地址换算**：驱动 map（cheng_line_map）offset 为 __TEXT,__text 内偏移，VM=0x100000758+offset；函数符号在二进制中=mangle 序号 `_cheng_cold_cc14446d_<N>`，map entry 行首 token 即序号（如 bodyIrAccessFail=2525）。
3. **同构判词多门分辨**：全文件 ErrorOwnership fail 出口 107 处逐站点过滤（site=Op ∧ detail 可=-1）+ 环境变量门控 dump 探针随烤机驱动分辨，优于 lldb 断点（小函数全内联后断点失效）。

### 交付与统计
- /tmp/oob_ab/wall114.patch=**0 字节**（主树零净变更，probe 用后还原；wall108b 0 字节 patch 先例同款，sha256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855）。apply 前后 git diff --stat -- src/core/ir/body_ir_access.cheng 均为 +199/−18（w82/w108/w111 在树 hunks，本线 +0/−0）。
- 探针 zz_probe_w114.cheng 未创建（v6 夹具即单变量验证物，墙判词即实况；判词富化以四站点门控 dump 实现，用后已还原）；编排者资产（zz_v6_w7.cheng、user_path_gate.*）零触碰；未 git commit；快照根 /private/tmp/oob_ab/w114/snap 实验毕即删。
- /tmp/oob_ab/w114/：v6_base.{compile.log,stderr}（基线复现）、v6_snap.log（首次快照根跑通+trace）、v6_probe.log（probe A/B/C 零触发）、v6_probe2.log（**probe D 实锤 dump**）、secsgate_probe{,2}.log、bake_probe{,2}.log、{v6,ordinary,call}_final.*（快照根三门）、{ordinary,call}_mt.*（主树根回归门）、lldb_fail*.cmd/lldb_stages*.cmd（断点实验物证，全零命中=内联实证）、bia_post_cleanup.cheng（还原后存档）。
