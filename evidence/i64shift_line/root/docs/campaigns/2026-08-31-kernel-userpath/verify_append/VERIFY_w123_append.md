# wall123.VERIFY

## wall123 报告：cold_nested `exact identity schema [freeze] op row=13 managed borrow projection is broken parent_live=0` 墙——定性闭合=identity BORROW_PROJECTION 域缺 owned-entry-root 整值借视直等臂，修面在 exact_def_identity.cheng（授权面外+并行 v6 线在途领地），撞契约边界停手完整移交；主树零改动零烤机（预算 0/3 未用）

日期 2026-09-03。授权面=src/core/analysis/cleanup_cfg.cheng + src/core/analysis/exact_def_freeze.cheng。复现驱动=kernel_driver_w122 4054f823…（w122 修法终态，cwd=仓库根）。

### 判定
墙未清，定性 100% 静态闭合并经运行 dump 全列互证：**批 3 identity BORROW_PROJECTION 主门对「owned（Move）entry 形参根的整值借视直等投影」无放行臂**。wall27 直等臂与 wall104r2 链式臂的 entry 所有权互证子句均只接 OwnBorrowShared/OwnBorrowUnique 根，owned Move 根 fail-closed 双双拒绝后落回原主门；原主门按 derive 侧既定槽域拼写契约（EntrySlotTag 域下 opOriginIds=借主槽 id）把 origin=0 误读为 op 行 0（LoadConst 非定义行）→ parent_live=0/parent_slot=-1 类别错误判词。修法=exact_def_identity.cheng 参数基座臂所有权互证子句的 owned 根扩展（契约对齐零弱化），该文件不在本臂授权面且为并行 v6 线（w27/w90/w104 系 hunks 作者）在途领地 → 按纪律停手，全量证据+修法 spec 移交。

### ①富化（wall84 reject dump 全列实况，/tmp/oob_ab/w123/cold_nested_base.log）
`primary exact def freeze validate rejected fn=0 ops=31 slots=22 sealed=1 entry_params=2` 附全列，关键解码（tag 权威=core_types.cheng OwnershipKind enum 0=Invalid/1=Plain/2=Move/3=BorrowShared/4=BorrowUnique；body_ir_exact_def.cheng place 3=Param/4=BorrowProjection；typeKind 3=LocalStr）：
- entry 车道：p0=0（`name: str`）、p1=1（`ordinal: int32`）；eo0=**2=OwnMove**、eo1=1=OwnPlain——`nestedFmt` 无 var 形参无 @borrows，PARAM 臂契约「MOVE/PLAIN⇔!var&&!borrows_args」既定冻结，eo0=Move 忠实。
- op13：k=14(FieldLoad) t=14 vds=14 vdo=3(BorrowShared) bod=1(EntrySlotTag) bor=0 oid=0 opk=4(BorrowProjection) operands=[0,14,0,24]。
- s0：tk=3(LocalStr) tid=13 sz=24 epk=3(Param)；s14：tk=3 tid=13 sz=24 epk=4(BorrowProjection)。
- 形状=**整值借视直等形全要件成立**：base=operands[0]=0==借主槽 0；off=0；width=24==s0 全宽；s14.tid 13==s0.tid 13；dst/target 双直等 vds。

### ②定性（三层，逐条对 dump 互证）
1. **两放行臂唯一假支=entry 所有权互证子句**：exactDefIdentityParamBorrowViewProjectionValid（exact_def_identity.cheng:1810）逐子句核 dump——ownerSlot 界内✓、paramRoot（slot0∈entryParameterSlotIds）✓、基座直等✓、FieldLoad/4 操作数✓、operands[1]==vds==target✓、off==0✓、width==借主全宽 24✓、TypeId 双等 13==13✓，至 ：1848 `entryOwnership != BorrowShared && != BorrowUnique` 带注释「var 托管借视形参…非 Borrow 根仍 fail-closed」→ eo0=2=Move **return false**；wall104r2 链式臂 exactDefIdentityEntrySlotChainedProjectionValid（:1869）在 ：1887 同一互证子句同假（且其链上溯首跳 `cur==ownerSlot` 直等排除臂也拒绝直等形）。两臂外无第三臂。
2. **原主门类别错误**：paramBorrowViewProjection（:1990）前置全真但两形臂皆 false → 落 ：2013 原相等子句：originInRange(0<31)✓、originReaches✓，但 parentSlot=ops[0].valueDefSlot=**-1**（ops[0]=LoadConst 非定义行）、parentOwnership=0=OwnInvalid∉{1,2,3,4}、baseMatchesParent(-1≠operand 0)=false、parentLive 走 exactDefIdentityProjectionParentLiveBeforeOp 时 ops[0].vdo=0 非任何所有权分支 → false。判词 24 列与本 trace **逐列全等**（含 parent_type/-1、parent_slot_type/-storage/-kind/-size 全 -1 系 parentSlot=-1 守卫短路）。槽域 origin 被行域解读=wall104r2 注释自认的「类别错误，不是有意义的守卫」——该臂只补了链式形，直等形 owned 根仍真空。
3. **授权面内无可修性（停手依据）**：freeze 侧（exact_def_freeze.cheng）在本路径零假门——组合入口 ExactDefIdentityValidateInto（exact_def_identity.cheng:2804）先批 2 ExactDefFreezeValidateInto 后批 3，判词出自批 3 place 分派，批 2 已过；cleanup 侧（cleanup_cfg.cheng）零关联——op13 为 lowering 行非物化追加：cleanup_cfg 全文 0 处 BodyOpFieldLoadTag、追加 def 族仅 CopyLocal/LoadConst/Call（:12885 投影行即 CopyLocal+Move 非借视）、bod/bor 落戳写者仅在 core_types/primary_object_plan/backend2_lower_slots、op13 侧车行（opk=4/oid 槽域拼写）仅 derive EntrySlotTag 臂（exact_def_derive.cheng:740-760 既定契约「参数借主投影 origin=借主槽 id 槽域拼写」）会落且 derive 先于物化跑。两授权文件内任何改动只可能是绕过/弱化（工程规范 3 禁）。

### ③修法 spec（移交 v6 线，契约对齐零弱化）
修面=src/core/analysis/exact_def_identity.cheng `exactDefIdentityBorrowProjectionDefinitionValid` 的参数借视前置（:1990 paramBorrowViewProjection）新增同域第三臂（或 wall27 臂互证子句扩展），放行形=**owned entry 根整值借视直等**：wall27 既有形状子句逐字保留（基座直等/FieldLoad 4 操作数/双直等/off==0/width==借主全宽/TypeId 双等），互证子句对 eo∈{OwnMove,OwnPlain} 根改放行并补 owned 根特有活性证据——候选=借主槽写者集扫描（复用 exactDefIdentityIdentityViewSlotTerminalValid 同款「写者集」扫描：借主 entry 槽在体内零 def 写零 store 族写即原值贯穿，cold_nested 实况 s0 零写者成立；或复用消费 dataflow 既有原语）——owned 形参共享借视在其原值未消费前语义健全（车头 cheng_final 同输入 0/0 pass 为语义参照）。fail-closed 纪律：不合形一律 return false 落原判词，其余形状零触碰；该扩展对现行绿路径纯增量（现拒绝形才可达）。落地后冷_nested 判词预计推进（批 3 后段 consume-edge 审计/槽循环对该体未达，或有后续墙，须重跑定位）。

### 门禁与验收实况（cwd=仓库根；零烤机、RSS 零抬帽、预算 0/3）
| 门 | 结果 |
|---|---|
| cold_nested × kernel_driver_w122 | compile rc=1，判词原文在（本墙在，树零改动故与 w122 移交态恒等） |
| ordinary_zero_exit × w122 | compile=0 / run=0 不回归 |
| zz_call_fixture_w7 × w122 | compile=0 / run=1 契约预期不回归 |
| 车头 × cold_nested | compile=0 / run=0，输出 `cold_nested_fmt_interpolation=pass`（HEAD 提取件 cheng_w123_head；任务配方在途 bootstrap/cheng_cold.c 直烤撞 `cold object cache path authority failed (recovery=0 depth=1)`——w122 同记树态缺口，按其配方降级 HEAD 提取件，与 w122 降级件判等价） |
| v6 × w122 | 未重跑（并行线在先只记录，w122 记录 rc=2 csg parameter type drift 仍为该线领地态） |
| 秒级门 | 不适用（零树改动） |

### 交付与统计
- **主树零改动**：cleanup_cfg.cheng / exact_def_freeze.cheng 进场=离场 sha256 闭合（4431966f01aeb85d… / a4fbbf54260ae5466…，/tmp/oob_ab/w123/authorized_files_sha_start.txt）；git diff --stat（进场态，vs HEAD）：cleanup_cfg +120、exact_def_freeze 193 行域、exact_def_identity +78——全部为既有各线 hunks，本臂零增量；**无 wall123.patch**（零 hunk 可交付，不出空补丁）。
- 零烤机：无树变化无可烤产物，烤机预算 0/3 保留。注记：ts-csg 线 build_kernel_driver.sh 管线迁移在途（w125b 记录 rc=9 组合描述符毒化），下线烤机前须候迁完。
- 作业目录 /tmp/oob_ab/w123/：cold_nested_base.log（wall84 全列 dump 复现件）、accept_w123.sh、fresh rc 全套 log、authorized_files_sha_start.txt、车头两态（cheng_w123 在途直烤件/失败 log、cheng_w123_head HEAD 提取件+cheng_cold_head.c、cn_head_compile/run_w123.log）。
- 零探针夹具、零他人资产触碰、未 git commit。
