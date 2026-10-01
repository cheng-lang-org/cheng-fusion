# wall121b.VERIFY

## wall121b 报告：cold_nested `ingress BodyIR ownership invalid code=15 site=2 index=12 detail=14` 墙死亡（body_ir_access.cheng 单文件单臂：①r1 探针轮 joint-fail 各析取支+借主 ordinal/入口所有权全列实运行钉死 tbov=0 唯一假支+eo0=2（探针用后整块还原零残留）→②定性=OwnMove 入口=不可变 Owned 托管形参唯一冻结形（lowering_plan 冻结臂 mutable 即 panic + typed_expr canonical Owned 行自权威 + BodyOp 借主臂同认 OwnMove 的镜像缺臂）→③[wall121b] EntrySlot 借主臂补 OwnMove∧mg==Managed admit，联立自证 fail-closed 零弱化）——cold_nested 判词推进至 `ownership body ir production: materialized BodyIR ownership invalid code=15 site=1 index=-1 detail=3`（物化后 final decode 的 deferReplay 映射计数恒等门，生产者=cleanup_cfg 领地，授权外停手完整移交）；ordinary 0/0、call_fixture 0/1、车头 v6 0/0、车头 cold_nested 0/0 pass 零回归；v6 驱动同 w117f 旧判词（并行线在先只记录）；烤机 2 轮（r1 探针+r2 修法，预算 2/3）

日期 2026-09-03。授权面=src/core/ir/body_ir_access.cheng（唯一改动文件）。进场树态：该文件 vs HEAD +250/−13（w82/w108/w111 在树 hunks）， Sha256=b9b133a6…a86b8d5 快照存 /tmp/oob_ab/w121b/bia_pre.cheng。

### 判定与机理
1. **复现（kernel_driver_w117f 83018c7f…，cwd=仓库根）**：cold_nested compile rc=1，判词与 w117f 移交逐列吻合：`(15,2,12,14) fn=0 op_kind=14 op_target=14 a0=0 a1=14 a2=0 a3=24 vd_slot=14 vd_own=3 vd_row=0 vd_node=4 vd_origin=1 vd_origin_id=0 bo_row=0 bo_domain=1 bo_def_row=0 consume_plus1=0 action_row=-1 src_domain=0 src_row=-1 s0:tk=3:mg=2:off=-1:tid=13`。tk=3=LocalStrTag、mg=2=Managed、off=-1=形参槽、vd_own=3=OwnBorrowShared、bo=(EntrySlot,0)。
2. **①r1 探针轮（wall114 先例，env=CHENG_BIA_W121B_TRACE 门控，fail 路径专属，imports std/os+std/strformat 临时加入，用后整块还原）**：r1 驱动（kernel_driver_w121b_probe，sha256=5aa0e4e1…2a16）实测 joint-fail dump 恰一条：`bia_w121b joint_fail index=12 vd_slot=14 tbov=0 tocmv=1 sdv=1 cdsv=1 fact=1 bo_domain=1 bo_row=0 bo_sem=0 owner_ord=0 owner_mg=2 owner_off=-1 eo0=2 esem=0`。**tbov=0=typedBorrowOwnerValid 唯一假析取支**（wall108b 级 probe 实证，排除 decode 出口与其余联合支）；**eo0=2=entryDefinitionOwnershipKinds[0]=OwnMove 实运行铁证**；owner_ord=0（借主已注册托管定义）∧ owner_mg=2（Managed）∧ esem=0==bo_sem（语义行恒等成立）→ admit 联立其余支全真。探针态秒级门 rc=0。
3. **②定性（三层契约联立）**：(a) 冻结权威 `LoweringBodyIrFreezeEntryDefinitionOwnership`（lowering_plan.cheng:22554，OwnMove 盖章 :22677-22682）：managed∧Owned 形参恒 OwnMove，mutable 即 panic "mutable managed parameter is owned" ⇒ **OwnMove 入口=不可变 Owned 托管形参的唯一冻结形**；Borrow* 仅 borrowed-view 臂（mg==Unmanaged 配对）。(b) typed_expr canonical（w117f 已证：:5841-5876 Owned 行自身即借主权威）。(c) body_ir_access 内部不一致佐证：[wall82] 注册臂已把 mg==Managed∧OwnMove 入口注册为托管定义（:3282 区，ownership ∉{Invalid,Plain} 即注册），下方 BodyOp 借主臂同认 OwnMove 借主（:5280），唯 EntrySlot 臂漏 OwnMove——缺臂非禁形。安全性：共享借视 def 仍 OwnBorrowShared 最弱主张；借主不可变=全函数体持有，单调强于已 admit 的 BorrowUnique 可变视图（wall82 同款单调论证）。
4. **③修法（[wall121b] 单臂，净 +29/−1）**：EntrySlot 借主臂 typedBorrowOwnerValid 析取补第三形 `ownerOwnership==OwnMove ∧ bodyIR.localSlots[bo_def_row].managedStorageKind==BodyManagedStorageManagedTag`；[wall82] 原注释块原文本前缀保留+[wall121b] 注记锚定。ordinal>=0（注册托管定义）∧ pairShapeValid ∧ 非自身 ∧ ownerSemanticRow==bo_sem 恒等四联立原样保留；return 边逃逸守卫零触碰；mg==Managed 联立自证 owned 入口存储真相（OwnMove+Unmanaged 在注册臂即 ordinal<0 拒，双保险 fail-closed）；非该形走原判词原 detail 逐字节不变；禁止提取共享 helper（[wall108r2] 警示同款）。
5. **下一墙（授权外停手完整移交）**：cold_nested 新判词=`ownership body ir production: materialized BodyIR ownership invalid code=15 site=1 index=-1 detail=3 fn=0`（ownership_body_ir_production.cheng:1910 [wall111b] 富化包装打印；site=Entry ∧ index=-1 ∧ detail=3 恰为 body_ir_access.cheng :3241 fail（`bodyIrAccessBuildDeferReplayIndex` 尾门 `mapRow != bodyIR.deferReplay.templateOpMapStarts.len`，detail=mapRow=3））。机理：ApplyOwned 尾部 `CleanupPlanMaterialize`（cleanup_cfg 领地）物化后 final decode 重审，defer 清理单元（cleanupIntent.unitKinds==DeferTag 计 3 个）与 deferReplay 模板映射数失配（templateOpMapStarts.len>3；若 len<3 则会先死 :3090 区内门 index=unitRow≠-1）。**物化产物与 sidecar 计数失配的修面在生产者文件 cleanup_cfg.cheng（w86/w113/w117b/w121 系领地），verify 侧拒收是正确 fail-closed 行为，本臂不改**。移交证据：fn=0 nestedFmt（lazy_store paramCap=4）、本墙死亡判词 /tmp/oob_ab/w121b/cold_nested_compile_w121b.log、dump 手段可复用 r1 探针配方（cleanup_cfg 侧建议 env 门控 dump templateOpMapStarts.len 与 defer 单元计数）。
6. **v6 驱动只记录**：v6 × w121b compile rc=2 `lowering plan: compiler csg semantic parameter type drift function=addCol line=30 index=0 expected=@borrow:Box actual=Box`（与 w117d/e/f 记录同点，v6 线并行领地在先，非本臂回归）。

### 门禁与验收实况（cwd=仓库根；RSS 零抬帽）
| 门 | 结果 |
|---|---|
| 车头重建 | 在途 bootstrap/cheng_cold.c:108660 fexecve 未声明死（与 w117f 同点，composition 线两头在途）；按 w117f 配方降级 HEAD 提取件 `clang -std=c11 -O2 -I bootstrap` rc=0，cheng_w121b sha256=7e5e83347b0dc46171c84954c0ced5e2accdfc2efa1630d32ad955cd26f8ed79 |
| 秒级门 ×2（探针态/fix 态 --emit:obj） | rc=0 / rc=0 |
| 烤机 r1（探针驱动，HEAD 脚本+HEAD manifest+ROOT 修正+CHENG_COLD_OBJECT_CACHE_ROOT 任务级隔离；worktree 脚本 --composition-manifest 旗标被 HEAD 车头拒=w117f 轮1 同款） | rc=0，kernel_driver_w121b_probe sha256=5aa0e4e1fea3d4ad7059637a231621a495328f567813273bc047e824195b2a16 |
| 烤机 r2（fix 驱动，同配方） | rc=0，kernel_driver_w121b sha256=0bfacccf758c75cfe11e0dc0d729f759c96e6eacc388bfc58272ef9ad47e8767 |
| cold_nested × r2 | compile rc=1，ingress 四元组 (15,2,12,14) grep=0（**本墙死亡**）→ 推进 `materialized … code=15 site=1 index=-1 detail=3`（移交墙，判定 5） |
| ordinary × r2 | compile=0 / run=0 不回归 |
| call_fixture（zz_call_fixture_w7）× r2 | compile=0 / run=1 契约预期不回归 |
| 车头 × v6（冷链门） | compile=0 / run=0 |
| 车头 × cold_nested（语义参照） | compile=0 / run=0 输出 `cold_nested_fmt_interpolation=pass` |

### 交付与统计
- /tmp/oob_ab/wall121b.patch（402 行，单文件累积 vs HEAD 以当前树态生成=在树 w82/w108/w111 hunks+本臂，forward-exact 到 HEAD 基 + `git apply --check --reverse` 双过；sha256=8df33dd757b067617544ac60f5fa03ebd3fde79cc93c44caa30136e54df1ff5d）。本线净归属=单 hunk +29/−1（apply 前后 git diff --stat：+250/−13 → +279/−14）。
- 探索件 /tmp/oob_ab/wall121b_r1.patch（388 行，r1 探针态累积 patch，**用后已还原勿 apply**，probe hunks 在现树 grep=0）；作业目录 /tmp/oob_ab/w121b/（bia_pre.cheng 快照、bake/secsgate/验收全 log、accept_w121b.sh、HEAD 脚本/manifest 提取件）。
- 烤机 2/3 轮（r1 探针+r2 修法）；主树仅 src/core/ir/body_ir_access.cheng 一文件在改；零探针夹具（zz_probe_w121b.cheng 未建：r1 探针为源内 dump 非夹具）；zz_v6_w7.cheng 等他人资产零触碰；未 git commit。树内既有未跟踪 src/core/ir/body_ir_access.cheng.rej（3869 字节，他线历史 apply 残留，本线未动，仍留原处）。
