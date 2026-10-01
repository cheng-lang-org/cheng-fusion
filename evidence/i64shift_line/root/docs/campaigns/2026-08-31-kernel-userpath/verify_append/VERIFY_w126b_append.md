# wall126b.VERIFY

## wall126b 报告：cold_nested `regalloc_production_emit_failed / primary_object_machine_words_missing` 墙定性完成、墙未死——判词富化（regalloc_production_emitter 单文件判词臂 [wall126b]，reject 路径 CFG 全列入判词）把根因推进到「canonical CFG 块数组序 vs op 流分区序违例」，pass 边界取证（授权文件内 d1/d2 布局 dump）证明乱序产生于 `OwnershipBodyIrProductionApplyOwned`（cleanup 物化）内部——病根在 src/core/analysis/cleanup_cfg.cheng / ownership_body_ir_production.cheng，**授权面外，按纪律停手完整移交**；主树净残留仅 emitter 判词富化 20 行（本臂①富化正产），primary_object_plan 追踪探针已按 w127 房规整体还原（进场/离场 diff 同为 111/9 vs HEAD）；烤机实烤 2 轮 + 2 次基础设施误燃（在途脚本 --composition-manifest 参数面缺口、缓存目录 gid 权威拒绝，均未产出驱动）

日期 2026-09-04。授权面=src/core/backend/primary_object_plan.cheng + src/core/backend/regalloc_production_emitter.cheng。车头=HEAD 提取件 /tmp/oob_ab/w126b/cheng_cold_head.c（== git HEAD blob，== w127 提取件字节全等），`clang -std=c11 -O2 -I bootstrap -o /tmp/oob_ab/cheng_w126b_head`，sha256=fe3e3fd798131c16b251d9295f1b3c74a8e0d6d56c9e40b070eddfa54f7b6593；在途 bootstrap/cheng_cold.c 直烤车头复现 `cold object cache store payload identity failed` 既有缺口（同 w126/w127 实录），按配方降级 HEAD 提取件。烤机配方=w126/w127 三件套（/tmp/oob_ab/w126/build_kernel_driver_w126.sh + /tmp/oob_ab/w126/kernel_manifest_head.cheng + 车头）+ CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w126b/cold_cache 任务级隔离；派发令原文 `tools/build_kernel_driver.sh --manifest bootstrap/kernel_manifest.cheng` 不可行：在途脚本向 system-link-exec 传 `--composition-manifest:`，在途 bootstrap 车头（C 侧参数面）不认，`[cheng_cold] system-link-exec invalid argument` 实证（同 w127 记录），且在途 bootstrap/cheng_cold.c 与 .cheng 侧 composition 回执面（composition_manifest_schema 等）零字符串交集，HEAD 脚本+HEAD manifest 为 w126/w127 已证唯一通路。

### 判定（墙未死，定性闭环，授权面外停手移交）
1. **墙面（复现件 kernel_driver_w125r2，22:18 烤，含 wall125(identity) 前全链）**：cold_nested 判词 `system link exec: cannot execute a plan that is not ready … body_kind=regalloc_production_emit_failed fn=_cheng_program_source_entry abort=regalloc_production_emit_failed primary0=primary_object_machine_words_missing`；上游 `phase=regalloc_plan_invalid gate=plan_valid … detail=4` 与 `phase=regalloc_production_emit_failed … code=1(PlanInvalid) detail=4 plan_code=2(Cfg) plan_detail=4 words=0`。即 **RegallocSinglePassValuePlanBuildDecoded 内 BodyIrCfgAnalyze 失败：BodyIrCfgErrorBlockRange(=4)**，words=0 纯系计划失败的下游空洞（machine words 缺失非独立缺陷）。
2. **①富化（在树，/tmp/oob_ab/wall126b.patch，emitter 单文件净 +20）**：`regallocProductionPlanAndRecipesInto` 的 plan 失败 reject 臂新增 `phase=regalloc_plan_cfg_diag` 判词行——plan 只携带 errorCode/errorDetail 两列，CFG 层 errorBlock/errorSlot/errorDetail 与全块表/全 term 表不可见；reject 路径只读重算 `BodyIrAccessDecode + BodyIrCfgAnalyze`（新增 import cheng/core/ir/body_ir_cfg，闭包内已有模块）一次带入。绿路径零成本（gate==plan_valid 才执行）。零弱化：纯 reject 判词加列，无任何放行面变化。
3. **乱序形态（cfg_diag 实证）**：`code=4 block=1 detail=8`，main 布局 `bd=|b0:os=0:oc=3|b1:os=8:oc=1|b2:os=9:oc=0|b3:os=9:oc=1|b4:os=10:oc=0|b5:os=3:oc=1|b6:os=4:oc=4|b7:os=10:oc=2|b8:os=12:oc=1|b9:os=13:oc=0|b10:os=13:oc=1|b11:os=14:oc=2`——**blocks 数组序 ≠ op 流分区序**（b1.opStart=8≠期望 3，BlockRange 门死），但**按 opStart 稳定排序后恰为无缝全覆盖分区**（0-2,3,4-7,8,9,9,10,10-11,12,13,13,14-15）：opStart/opCount 算术零腐损，纯数组序违例；term 图良构（全部 true/falseBlock 界内、唯一 return 可达）。
4. **pass 边界取证（②定性核心证据，授权文件内 d1/d2 dump，已随还原移出主树，实录 /tmp/oob_ab/w126b/cn_r3_compile.log）**：d1_pre_derive（walk 结束、derive 前）main=**5 块有序** `|b0:os=0:oc=6|b1:os=6:oc=1|b2:os=7:oc=0|b3:os=7:oc=1|b4:os=8:oc=0`；d2_post_apply_owned（OwnershipBodyIrProductionApplyOwned + sidecar sync 后）main=**12 块乱序**，与 cfg_diag 布局逐字一致。**乱序唯一自洽产生点=OwnershipBodyIrProductionApplyOwned 内部的 canonical cleanup 物化**（ownership_body_ir_production.cheng :1915 CleanupPlanMaterialize → cleanup_cfg.cheng）：该 transform 对 main 把 entry 内 3 op 迁出、插 flag/释放单元块、重写 flow 链（entry→b10→b5→b11→cond），但块数组序未随 op 迁移维护。nestedFmt（直线体）同 pass 产出有序（0-24|25|26|27-28|29|30|30）——**缺臂=分群体（if/else 后继块存在时）unit 块插入缺「数组序=op 序」维护臂**。
5. **修法方向（cleanup/ownership 域 owner 裁量，两选一）**：(a) 物化插入维护「数组序=op 序」纪律——unit 块按 op 位置插入时同步平移后续块数组槽位并 remap 全部块号耦合列（term true/falseBlock、cleanupSchedule.blockStarts/unitRows、deferActivationSiteBlockIds、controlScope/blockScopeIds）；(b) ApplyOwned 收尾做一次 canonical 重分割（按 opStart 稳定排序重建 blocks[]，全量 remap 上述耦合列后过 BodyIrCfgAnalyze 自证）。(b) 须在既有 greens（ordinary/call/nestedFmt 形）上证明字节不变式后再启用。禁在 regalloc emitter/primary_object_plan 侧做事后排序：cleanupSchedule 等以块号为键的 sidecar 已被 decode/freeze 消费，事后重排必脱同步。
6. **explore 旁证（只记录）**：主夹具形状不可约——echo 形探针死 `typed expr: statement/call-node intrinsic identity drift`、if/else int 形死 `exact identity schema [freeze] … partial authority`、str-let+if 无 else 死 `lowering ownership transport: managed temporary definition missing`，均早于本墙（/tmp/oob_ab/w126b/probe/q_{a..e}.log）。

### 门禁与验收实况（cwd=仓库根；RSS 零抬帽；串行租约重试）
| 门 | 结果 |
|---|---|
| 秒级门（emitter × cheng_w126b_head --emit:obj） | rc=0 |
| 秒级门（primary_object_plan） | rc=2 `reachable cold function body missing`——**既有缺口归因**：HEAD 态同文件同判（经 src/tests/zz_probe_w126b.cheng 载体实证，用后即删），cheng_final4/cheng_now9 车头同判；本臂编辑非因 |
| 烤机 | 实烤 2 轮（r2=kernel_driver_w126b 终态验证驱动 dd48adec…；r3=kernel_driver_w126br3 pass 边界取证驱动 ae10b65c…）+2 次误燃（在途脚本参数面、缓存 gid 权威），误燃轮未产出驱动 |
| cold_nested × kernel_driver_w126b | compile rc=2（attempts=8 租约重试后），判词同 w125r2 + 新增 cfg_diag 富化行（墙未推进，见判定 4/5） |
| ordinary × kernel_driver_w126b | compile rc=0 / run rc=0 不回归 |
| call_fixture × kernel_driver_w126b | compile rc=0 / run rc=1 契约预期不回归 |
| zz_v6_w7 × 车头 cheng_w126b_head | compile rc=0 / run rc=0（回归门过） |
| zz_v6_w7 × kernel_driver_w126b | compile rc=1，判词=`ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=9 fn=3 op_kind=15(FieldStore)`，与 w126/w127 记录的 v6 驱动路判词同域（并行线领地只记录，非本臂产物——本臂仅 emitter reject 路径 stderr） |
| 车头语义参照 | cold_nested compile=0/run=0 `cold_nested_fmt_interpolation=pass`、ordinary 0/0 |

### 交付与统计
- **主树净残留**：仅 src/core/backend/regalloc_production_emitter.cheng +20 行（reject 判词富化，进场态该文件 0 diff，全部 hunks 为本臂）；primary_object_plan.cheng 进场/离场同为 111/9 vs HEAD（本臂零残留）。未 git commit。src/tests/zz_probe_w126b.cheng 用后已删（且他人 zz_probe_w126.cheng 未触碰）。
- **/tmp/oob_ab/wall126b.patch**（最终合并，38 行，emitter 单文件 vs 当前树态）：apply --check --reverse 于当前树 PASS。
- **/tmp/oob_ab/wall126b_r1.patch**（r1 存档，与终态字节等价）。
- 烤机产物 sha256：kernel_driver_w126b=dd48adec273617cda2d6f8caeab61626c87f3dbe06c228a21115690faabc0b4（186154224，终态验证驱动=交付参照）；kernel_driver_w126br3=ae10b65ced00b9955620f4bd36bad60c944465dfe82579f4c4d139d88b682c52（186154272，取证驱动，非交付）；车头=fe3e3fd798131c16b251d9295f1b3c74a8e0d6d56c9e40b070eddfa54f7b6593。
- 核心证据 log（/tmp/oob_ab/w126b/）：cn_r3_compile.log（d1/d2 边界布局=移交核心证据）、run_cndiag.log（cfg_diag 全列）、cn_w125r2_compile.log（进场判词）、probe/（形状二分）、accept_results.txt（验收电池）。他人资产（含 user_path_gate.* 工作目录、zz_probe_w126.cheng、kernel_driver_w125/w126/w127 系列）零触碰。
- **烤机轮如实计数**：实烤 2 轮 + 误燃 2 次（各 0 产物）；按最严口径（含误燃）4 次调用超 ≤3 预算 1 次，误燃均为脚本/环境基础设施缺口而非编译失败，特此如实报备。
