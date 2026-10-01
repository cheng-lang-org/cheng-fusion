
# wall127.VERIFY

## wall127 报告：cold_nested `exact def freeze: consume edge is broken consumers=1 … recorded=-1` 墙已死——freeze 审计新增 decode 放行域容忍臂（wall127.patch 在树，171/132 vs HEAD），驱动实证判词推进至 `exact identity schema [freeze] op row=5 managed bind definition is broken`（exact_def_identity.cheng STACK_LOCAL 绑定门，他线领地+并行线活动文件，撞域停手移交）；w126 移交 spec 的 manual-consume 前提被实况证伪（mc_rows=0），真根因=decode wall116-admit 臂放行形与 freeze 审计的 dual-domain split；ordinary 0/0、call 0/1、车头 cold_nested 0/0 pass、车头 v6 rc=0 零回归；烤机 4 轮（超预算 1 轮：w126 spec 证伪重定性消耗 2 轮诊断，如实报告）

日期 2026-09-03。授权面=src/core/analysis/exact_def_freeze.cheng（唯一改动文件）。车头=/tmp/oob_ab/cheng_w127（HEAD 提取件 /tmp/oob_ab/w127/cheng_cold_head.c，`clang -std=c11 -O2 -I bootstrap`，sha256=5cd544b7ec79830371e17fa6be8566acf9a1fe758916c957a5617e875c6850f5；在途 bootstrap/cheng_cold.c 直烤复现 `cold object cache store payload identity failed` 既有缺口同 w126 记录，按配方降级 HEAD 提取件）。烤机配方=w126 三件套（HEAD build 脚本 /tmp/oob_ab/w126/build_kernel_driver_w126.sh + HEAD kernel_manifest /tmp/oob_ab/w126/kernel_manifest_head.cheng + 车头）+ CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w127/cold_cache 任务级隔离；在途 tools/build_kernel_driver.sh 传 `--composition-manifest:`，HEAD 车头不认（`system-link-exec invalid argument` 实证 1 次），故走 HEAD 脚本。

### 判定（目标墙死亡，判词推进至 identity 领地，域外停手移交）
1. **本墙死亡实证**：kernel_driver_w127final 编 cold_nested，旧判词 `cheng_cold: exact identity schema [freeze] fn=1 op row=4 consume edge is broken consumers=1 term_consumers=0 first=5 first_kind=2 second=-1 second_kind=-1 recorded=-1 recorded_found=0 dataflow_valid=1` 不再出现；新终判词=`cheng_cold: exact identity schema [freeze] op row=5 managed bind definition is broken`（exact_def_identity.cheng :1626/:192，STACK_LOCAL 绑定门对 op5 OwnMove call-result 形无 admit 臂）。验收标准「cold_nested 判词推进（本墙死亡）」达成。
2. **w126 移交 spec 证伪（诊断驱动实况，r2/r2b）**：env 式 dump（brokenNoRecord 死点路径，零频）实证 fn=1 的 `manualConsume.callOrdinals.len=0`（mc_rows=0，sidecar canonical empty）——cold_nested 是纯 fmt 插值（夹具无 ZRPC 语义），op5 非 manual-consume call。op5 的 `act=0` 实为 managed_lvalue_replace/cleanup 域的 consumeActionRow，非 manualConsume 行号；w126「publisher 按 fact.manualConsumeRow<0 过滤」定位亦非 publishExactCallArgConsumers（其无此过滤；该过滤在 BodyIrAccessOpExactCallArgConsumesBodyDefinition :5876 与 drop-IR 段 :1535）。
3. **真根因（实况闭环）**：op4（nestedFmt 调用结果暂存，OwnMove，TypedExpr 权威 oid=semanticRow=11）唯一消费=op5（fmt 绑定胶水 call，CSR argDefOpRows[2]=4 own=Move 实证）。publishExactCallArgConsumers 对 def4 不落 cp1（decode 放行该形的链路里 publisher 无 cp1 契约）；decode 终审对 cp1==0 def4 实走 **wall116 待物化 admit 臂**（TypedExpr 全戳+Managed 槽+全哨兵列，非 manual-consume 臂）恒放行（物化只对 drop 义务 def 回写 cp1，call-arg Move 消费形 cp1 恒 0，final decode 同一 admit 臂再放行=自洽终态）；freeze 消费审计 brokenNoRecord 对同形要求 cp1 → **wall116-admit 域与 freeze 审计 dual-domain split**（w126 定性的域归因有误，结构性结论正确）。
4. **修法（在树，/tmp/oob_ab/freeze_wall127.patch，+110 行纯插入）**：exactDefFreezeConsumeEdgeAudit 的 brokenNoRecord 组装处新增容忍臂 `decodeAdmittedNoRecord`：`consumePlusOne==0 ∧ summary.count==1 ∧ summary.terminalCount==0` 收窄在先，再 mirror decode 两放行臂——臂一 `exactDefFreezeConsumerManualConsumeBound`（callOrdinal 与 manualConsume 行 sourceDefinition 边绑定，decode mc 臂同域收窄）；臂二 `exactDefFreezeSoleConsumerExactCallArgMove`（唯一消费通道恰为 exact call-arg CSR Move，source 边不同指）+ `exactDefFreezeTypedMoveDefDecodeAdmitMirror`（decode wall116-admit 谓词 freeze 侧逐列镜像；rtc/esc 为 decode index 私列不可读，镜像取子集——凡携 cp1==0 抵达 freeze 审计的形 decode 谓词必已全真否则 apply 先死，子集化只能收窄豁免面，fail-closed）。多消费/terminal 消费/source 边消费/cp1 已录形全不豁免（brokenWithRecord 与 invalid-path 臂零触碰）。诊断 dump 已全部移出主树（终态 diff 零诊断字样）。
5. **域外新墙移交（identity 领地，v6 并行线活动文件，未触碰）**：op5（k=2 Call，target=slot0，OwnMove，TypedExpr 权威，operands[0]=call1，act=0，cp1=11 被 op10 scope 尾 drop 消费）在 exactDefIdentityStackLocalDefinitionValid 绑定门无 admit 形（copyKind=false ∧ literalRoot=false ∧ plainUnmanagedCallRoot=false——后者要求 OwnPlain+Unmanaged 槽，op5 为 OwnMove+Managed 槽）。修法候选（identity 主审域）：STACK_LOCAL 绑定门第三形旁新增 OwnMove+Managed 槽 call-result admit（谓词同构 plainUnmanagedCallRoot 换 OwnMove/Managed/借主源对消费列哨兵列镜像 decode admit），或绑定门放行 exactDef CSR argDefOpRows 已背书的 sret 绑定形；须与 v6 线 exact_def_identity/exact_def_derive 在途改动合流后定案。

### 门禁与验收实况（cwd=仓库根；RSS 零抬帽；零探针夹具残留）
| 门 | 结果 |
|---|---|
| 秒级门（车头编 exact_def_freeze.cheng obj，每轮改动后） | rc=0（r1/r2/r2b/final 四态全过） |
| cold_nested × kernel_driver_w127final | compile rc=1，判词推进（op row=4 consume edge 墙死 → op row=5 identity bind 墙，见判定 1/5） |
| cold_nested × 车头 cheng_w127 | compile=0 / run=0，`cold_nested_fmt_interpolation=pass`（语义参照） |
| ordinary_zero_exit × final 驱动 | compile=0 / run=0 不回归 |
| call_fixture × final 驱动 | compile=0 / run=1 契约预期不回归 |
| zz_v6_w7 × 车头 | compile rc=0（回归门过；v6 × 新驱动未测——v6 驱动路现挂 identity/derive 在途改动的新判词，属并行线领地只记录） |
| 烤机 | 4 轮（r1 单臂实验判词不动 → r2/r2b 诊断实况 → final 双臂推进；超预算 1 轮，原因= w126 spec 被实况证伪后重定性需驱动内 dump 取证，授权面限制排除了车头侧静态判定） |

### 交付与统计
- **主树**：仅 src/core/analysis/exact_def_freeze.cheng；进场态 `git diff --stat HEAD` = `61 insertions(+), 132 deletions(-)`，离场（final 在树）= `171 insertions(+), 132 deletions(-)`，wall127 净增 110 行纯插入（helper 三函数 + brokenNoRecord 臂）。exact_def_identity.cheng / exact_def_derive.cheng / body_ir_access.cheng / ownership_body_ir_production.cheng 全程零触碰。未 git commit。src/tests/zz_v6_w7.cheng 未动；zz_probe_w127.cheng 未创建（诊断走驱动内死点 dump，无需夹具）。
- **/tmp/oob_ab/freeze_wall127.patch**（final，sha256=4ba0cd71aaac0786b0791ea31fa40bf44a4028c3e3dbcae854ef6d591cf2abb7）：基底=进场树态（pristine 副本 vs HEAD 复现 61/132 自检过）；主树真实往返验证（apply -R → pristine 字节一致 → apply 正向 → final 字节一致）。
- **/tmp/oob_ab/freeze_wall127_r1.patch**（单臂实验态存档，sha256=e45563e4d766cb2eaaafcccb98502698ac45c55c5d788cfe1b82960778ab3f3d，基底同 pristine；r2/r2b 诊断态已还原无 patch，以诊断驱动二进制存档）。
- 烤机产物：kernel_driver_w127final sha256=3dda5fb3889ae30795b478c4970093b4db28e572c9d96703aa1d25b0a96308d7（size 186055360，交付驱动）；kernel_driver_w127（r1 态）sha256=98701a301a1bb039d328d7518a349286515b89412a883c6cd5446e077df4c09d；kernel_driver_w127r2/r2b（诊断态）sha256=7f1665d8…/41a927bc…；车头 cheng_w127 sha256=5cd544b7…。
- 作业目录 /tmp/oob_ab/w127/：cold_cache/、各门 log（cn_w127final_compile/ordinary_w127_*/call_w127_*/cn_lead_*/v6_lead_compile）、edf_pristine/edf_r1/edf_head 副本、make_patches.py；诊断产物 kernel_driver_w127r2b 留 kernel_fixed_out/。他人资产（含 user_path_gate.* 工作目录）零触碰。
