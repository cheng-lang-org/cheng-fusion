
# wall115.VERIFY

## wall115 报告：v6 `ingress BodyIR ownership invalid code=15 site=2 index=3 detail=-1` 墙定性二次翻案完成——真断点=**管线时序矛盾**：ingress decode 权威审是 `OwnershipBodyIrProductionApplyOwned` 第一步，cleanup plan 构建/物化全在其后，wall114 移交方向（cleanup_cfg 排布 release action + consume link 回写）在时间轴上不可能到达 audit 面；触发器（P1-P5 差分实锤）=**var 参数借用调用**迫使 primary 发射侧对 `n = new(Node)` 盖 OwnMove+cp1=0 def 戳；修法面（body_ir_access admit 臂 / production 流程 / primary 盖戳）全在授权面外→停手完整移交；主树零变更（wall115.patch=0 字节）；探针烤机 1 轮实锤物化零触发；v6 判词逐字节不变、ordinary 0/0、call_fixture 0/1 零回归；烤机 1/3 轮

日期 2026-09-03。授权面=src/core/analysis/cleanup_cfg.cheng 与 src/core/analysis/ownership_drop_ir.cheng。主树实际净变更=0（探针用后还原，两文件 sha256 与进入前逐一相等：cleanup_cfg=102d1668…5422a6、ownership_drop_ir=973bec32…89b183e）。

### 判定（定性二次翻案完成，墙未死亡——修法面在授权面外停手移交）
1. **wall114 移交方向翻案（探针轮实锤）**：wall114 假设「cleanup plan 对 op3 def 的 release action 排布缺失/定义域错位，物化后按 cleanup_cfg:10406/:12011 同族回写 cop 即可放行」。本线在 cleanup_cfg 内三站点（edge-action 搬运循环 `cleanupCfgStageQueueOwnershipExit`、exit DropPlace 物化臂、drop 单元 cop 回写点）布环境无关 dump 探针随烤机驱动实测：**v6 与 P5 探针编译全程三站点零触发**（`cc_w115_*` 行计数=0），且判词先于一切 plan 活动打出。管线索（源码考古）：`CleanupPlanMaterialize` 在 ownership_body_ir_production.cheng :1793、`CleanupPlanBindOwnershipOpTransitions`/`CleanupPlanQueueOwnershipExit` 在 :1717-1743 区，全部位于 `OwnershipBodyIrProductionApplyOwned` **函数内部**；而 decode 权威审 `bodyaccess.BodyIrAccessDecode` 是该函数**第一步**（:1289 区）。即：**wall114 认定的「释放权威未排布」不是排布缺失，而是 audit 与物化的先后关系被倒置——物化得再好也到不了这个 audit 面**。
2. **触发器（P1-P5 最小形差分，w113 基线驱动零烤机完成）**：以 src/tests/zz_probe_w115.cheng（用后已删）五轮二分——P1（最小 new+return）过 ingress（挂另案墙 `lowering plan: call target exact TypedExpr identity missing function=main call_index=0`）；P2（+托管字段 replace）过 ingress（同挂 lowering plan 另案墙）；P4（+if-return 分支+多 return 点）过 ingress；**P5（+`let r = use(n, 2)` var 参数借用调用）即复现同判词** `code=15 site=2 index=3 detail=-1 fn=1`（op3=new def、vd_own=2、vd_origin=1、vd_origin_id=2、cp1=0、car=-1、src=(0,-1)），与 v6 fn=3 dump 逐列同构。**分支、多 return、托管字段 replace 均非触发器；var 参数借用调用是**。
3. **根因定性（管线时序矛盾，非程序非法）**：primary 发射侧（primary_object_plan.cheng :65802 区 `primaryCleanupWillMaterialize` 谓词）扫描「OwnMove ∧ cp1==0 ∧ 非 manual-consume」def，命中即走 cleanup 物化路径（谓词与 production 扫描条件同构）。var 借用调用形态令 primary 对 `n = new(Node)` 行盖 OwnMove+TypedExpr+cp1=0 def 戳（P4 形无此戳，直接走 zero-cleanup fast-return——这同时解释 P4r 过 ingress 且探针零输出）。随后 ApplyOwned 第一步 decode 权威审（body_ir_access.cheng :5286-5296 区，wall114 probe D 同门）要求该 def **此刻已有**释放/返回/消费权威（rtc>0∧esc=0 或 cp1!=0 或 appendOnlyMove），而 drop 单元与 cop 回写要等同函数末尾物化才产生——**凡触发「谓词命中→cleanup 路径」的合法程序必死此门，与程序合法性无关**。P5 是最小合法复现。
4. **多臂裁定（授权边界停手）**：cleanup_cfg/odir 全部执行面在 decode 审之后（探针零输出实锤），授权面内不存在任何可联立修法。修法候选（全在授权面外，按侵入度排序）：(a) **body_ir_access :5259 OwnMove cp1==0 臂加「待物化 admit」**——def 满足与 `primaryCleanupWillMaterialize` 同构的谓词（OwnMove ∧ cp1==0 ∧ 非 manual ∧ Managed 槽 ∧ TypedExpr 全戳）时放行，依据=同谓词已证明 cleanup 物化在同次 ApplyOwned 内随后补权威+回写，**非弱化**（wall114「admit=真弱化」裁定的前提「无法证明权威必达」被本线谓词同构证据推翻；若物化侧失败仍有后续门 fail-closed）；(b) production 流程重排（decode 审延后至物化后）——动 ApplyOwned 全序，面大；(c) primary 盖戳策略（不盖 cp1=0 戳或提前排权威）——更早域，牵动 staging 序。**推荐 (a)**：单点、谓词同构、与 wall64/wall95 同族「生产拼写镜像」先例一致。
5. **附带发现（另案，非本墙）**：P1/P2/P4 过 ingress 后全数死 `lowering plan: call target exact TypedExpr identity missing function=main call_index=0`（`new(T)` 无参调用形态，call_index=0）——当前树上任何走到 lowering plan 的 new(T) 形均挂此墙，v6 因更早死 ingress 从未到达。**v6 即使本墙清后，下一墙大概率是它**（多臂移交一并记录）。

### 门禁与验收实况（cwd=仓库根；烤机 1/3 轮；零抬帽；无 rc=125）
| 门 | 结果 |
|---|---|
| 探针态秒级门（cheng_w114 --emit:obj cleanup_cfg.cheng） | rc=0（探针可编） |
| 烤机 1（探针驱动）kernel_driver_w115_probe | rc=0，sha256=637aa7c30e442a3950d61b54034418c38566c7c98f25279a49ac38a44e9d4333（strings 实证 3 个探针 token 已烤入） |
| v6 × w113 基线驱动 | compile rc=1，判词与 wall114 期逐字节同（detail=-1 fn=3），零推进零回归 |
| v6 × w115_probe 探针驱动 | rc=1 判词逐字节同 ∧ 探针行 0（探针对判词零影响的双重对照） |
| ordinary × w113 驱动（主树根） | compile=0 / run=0（分步实测） |
| call_fixture × w113 驱动（主树根） | compile=0 / run=1 契约预期（分步实测；一次性 system-link-exec 不透传 exe rc，须 --emit:exe 后单跑记 rc） |
| cold_nested | 未触碰（并行线领地；本轮无主树变更无交互） |

### 移交证据包（/tmp/oob_ab/w115/）
- p1.log / p2.log / p4.log / p5.log：P 系列 w113 基线差分实录（P5 判词全 dump 在案）
- p5_probe.log：P5 × 探针驱动（判词同 ∧ cc_w115 零行=物化零触发实锤）
- p4_probe.log：P4r × 探针驱动（过 ingress ∧ 挂 lowering plan 另案墙 ∧ cc_w115 零行=zero-cleanup fast-return 实锤）
- v6_probe_drv.log：v6 × 探针驱动（判词逐字节同 w113 基线）
- bake_probe.log：烤机轮 1 台账；cleanup_cfg.pre.cheng / ownership_drop_ir.pre.cheng：探针还原比对基线（sha256 与主树现值逐一相等）
- 探针站点源码位置（还原前形态已入 git 工作区后即还原，未留痕）：cleanup_cfg.cheng `cleanupCfgStageQueueOwnershipExit` edge-action 循环 / exit DropPlace 物化臂 / `cleanupCfgAppendOwnershipDropUnit` 回写点

### 交付与统计
- /tmp/oob_ab/wall115.patch=**0 字节**（主树零净变更；wall114/wall108b 0 字节 patch 先例同款，sha256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855）。apply 前后 git diff --stat：cleanup_cfg.cheng +748/−124 区（=w52/w86/w95/w113 在树 hunks，本线 +0/−0）、ownership_drop_ir.cheng +30/−0（同前，本线 +0/−0），两文件 sha256 进入前后逐一相等实证。
- 探针夹具 src/tests/zz_probe_w115.cheng 用后已删（ls 实证不存在）；编排者资产（zz_v6_w7.cheng、user_path_gate.*）零触碰；未 git commit。
- 烤机 1/3 轮（探针轮；停手移交不再烧轮 2/3）；车头复用 cheng_w114（未重建，bootstrap 未动）。
- 纪律自省：本线两次误用 heredoc 写临时探针文件（均单行正常退出未卡 shell，文件即写即弃），后续严格 str_replace_editor 落盘。
