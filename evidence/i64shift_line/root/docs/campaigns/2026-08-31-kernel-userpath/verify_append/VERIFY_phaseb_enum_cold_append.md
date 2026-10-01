# VERIFY_phaseb_enum_cold_append.md —— PhaseB-enum-cold 线（freeze 身份墙：enum 全绿最后一跳）2026-09-05

锚点 commit=69817b8b2。全程无 git commit、无分支。工作目录 /tmp/oob_ab/phaseb_enum_cold/。车头=head 三件套（/tmp/oob_ab/w139/build_kernel_driver_w139.sh + kernel_manifest_head_git.cheng + cheng_w126），CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/phaseb_enum_cold/cold_cache（任务级）、CHENG_ENTRY_CACHE=0。并行线（wall150、PhaseB-csg、PhaseB-parser）在途 hunks 原样保留、零触碰、零 revert；烤机与门禁全程租约串行退避（wall150 在飞期门禁多次 lease-unavailable 退避重跑）。

## 一、墙面归属定性

**判词复现**（r9 驱动 /tmp/oob_ab/phaseb_enum_schema/kernel_driver_w5_r9，PhaseB-enum-schema 线终态）：

```
cheng_cold: exact identity schema [freeze] body=0 producer=0 slot row=0 has partial authority
kind=1 exact_type=7 place=0 origin=-1 storage=0 ... slot_name=s slot_sz=4 slot_al=4 slot_mg=1
sentinel=0 pa_type=0 pa_place=1 pa_origin=1 pa_stor_unknown=1 ... writers=1 defs=0 readers=5 args=0
```

**归属：`.cheng` 侧 src/core/analysis/exact_def_identity.cheng 槽循环（批 3 主审 partial authority 门）**。判词由该文件 `exactDefIdentitySlotPartialAuthorityLine`（:346）发出；r9 驱动为 `.cheng` 管线烤成品，实证抛点在 `.cheng` 冷链。C 侧 bootstrap/cheng_cold.c:70113 为同铭文镜像基座，未触发。

**根因（C 冷链 kind 分裂的精确形态）**：判词字段 `slot_name=s` 是 PhaseB-A 移交第 4 条「SLOT_I32/VARIANT 槽种类在冷链侧缺臂」的表层投影；用标量探针（src/tests/zz_phaseb_enum_cold_i32_probe.cheng，`let x: int32 = 3` + `if x == 3`）实测**与 t_enum 判词同源同形**（BodyIR dump 除常量值外逐字节一致：ops=8 slots=8、o0=LoadConst+o1=CopyLocal(vds=-1)、s0:tk=1:mg=1:tid=7 非 sentinel）。即墙非 enum 特有，而是「**rhs 节点化 + TypeArena proof 绑定的非托管标量 let 槽**」普遍缺口，enum（归一 i32 标量语义，tid 同为 7）只是 PhaseB 线第一个撞线夹具。三重分裂链：

1. **槽种类分类**：C 冷链 enum let 槽 = SLOT_VARIANT（cheng_cold.c:18327）；`.cheng` 侧 enum 降 LocalI32Tag 标量（primary_object_plan.cheng:5012 enum→I32 4B），两者值语义等价。
2. **sentinel 判定序**：C 侧 `cold_slot_authority_sentinel_is_canonical_unmanaged_uncached`（cheng_cold.c:58131）对 SLOT_I32/I64/F32/F64 值载体槽**无条件豁免，不看绑定列**；SLOT_VARIANT 走变体臂（variant_count>0 ∧ 尺寸匹配 ∧ 非 managed drop → 豁免）。`.cheng` 侧 BodyIrExactDefSlotIsSentinel（body_ir_exact_def.cheng:317）在 kind 臂**之前**有绑定列前置（`typeArenaTypeId>=0 ∨ managedStorageKind≠Unknown → 非 sentinel`，防 str/seq/object 托管载体误判的设计裁定）。
3. **proof 绑定面把槽踢出豁免域**：`let s` 声明 RHS 节点化（typed_expr.cheng:60018 BuildStatementValueRoot）→ primary_object_plan.cheng:52978 对 rhsNodeIndex≥0 的声明绑槽 proof（tid=7+mg=Unmanaged）→ 槽非 sentinel；而该形 BodyOp 侧无 def 戳通道（wall105 定性：OwnPlain 无 TypedExpr value-def，derive 无从落戳，derive 层无契约内修法）→ exactDef 三列全 sentinel（place=INVALID/origin=-1/storage=UNKNOWN）→ 槽循环 partial authority `pa_place/pa_origin/pa_stor_unknown` 三臂齐中必死。

四夹具历史全绿的原因：ordinary/call 无 let，cold_nested 的 let 是 str（托管，有 managedLocalDefinition 盖戳通道），v6 的 let 均被既有权威通道覆盖（ref/var 形参/字段 store）。

## 二、修法（.cheng 侧为主；C 侧经核对无需动）

**改动文件：仅 src/core/analysis/exact_def_identity.cheng（+54 行，[phaseB-enum-cold] 标记）**，落点=槽循环 sentinel 豁免之后、partial authority 探测之前，新增「标量值载体槽 admit 臂」（wall127 容忍臂收窄镜像款式）：

- 谓词（合取，任一不符即不进本臂、走原门 fail-closed）：
  1. 槽 typeKind ∈ {LocalI32Tag, LocalI64Tag, LocalF64Tag}（C 58131 无条件臂的 kind 域镜像）；
  2. managedStorageKind == Unmanaged ∧ typeArenaTypeId ≥ 0（正是被 sentinel 绑定列前置踢出的域）；
  3. exactDef 三列全 sentinel（place=INVALID ∧ origin=-1 ∧ storage=UNKNOWN——放行「未落戳」而非「漂移」，derive 一旦落戳即退出本臂走原门）；
  4. 非 entry 形参（entryParameterSlotIds 不含，防 param 权威洞放行）；
  5. 每个写该槽的 op（target==slot）自身 valueDefSlot<0 且 kind ∈ {LoadConst, CopyLocal, LoadLocal, BinOp, Cmp} 直接值载入形，且 writers≥1（writers==0 孤儿槽、Call 写入形（wall105 判词富化领地）、带 def 戳形全不放行）。
- 放行动作 = `continue`（与 sentinel 同路：批 3 计数门零触及、derive 零写、sentinel 谓词零改动）。

**零弱化论证**：本臂只收窄「今天必死」的域（mg=Unmanaged ∧ tid≥0 的标量槽抵达 partial authority 门时 pa_place/pa_origin/pa_stor_unknown 三臂必中），不改变任何今天绿的程序的行为；对齐的正是 C 冷链已承认域（SLOT_I32 无条件臂）+ 健康值载体证据（写入形白名单 + writers≥1）。判词族、rc 语义、计数门、derive 输入证据全部不动。

**C 侧桥接级核对结论（零改动）**：C 冷链（车头语义参照）对同类槽经 SLOT_I32 无条件臂/SLOT_VARIANT 变体臂放行，行为自洽且为本次对齐的权威语义；`.cheng` 侧单边补臂即恢复两链一致，无需 bootstrap 改动。验收门 3（车头重编）按「未动 C 链」免触发。两侧契约对齐关系：`.cheng` admit 臂谓词 1（kind 域）↔ C 58131 kind 枚举；谓词 2/3 ↔ C 无条件臂「不看绑定列/侧车」的净效果；谓词 5 ↔ C 槽循环上游 op 审计（C 68257 段 definition tuple 门）对无戳 op 的既有拒绝域——`.cheng` 侧用白名单表达，比 C 更窄（收窄方向允许）。

## 三、验收门禁（r10 驱动 /tmp/oob_ab/phaseb_enum_cold/kernel_driver_r10，size=186813584，sha256 181d7eaf732749c60610b110361ea912e0c19f613df0ff232f7dff6c2eb4602f）

| 件 | 合同 | 实测 | 判定 |
|---|---|---|---|
| **t_enum** | compile=0 + run=0 `t_enum=pass` | compile=0 run=0 stdout `t_enum=pass` | **PASS（enum 端到端全绿收官）** |
| 标量 let 探针 zz_phaseb_enum_cold_i32_probe | compile=0 + run=0 `probe_i32=pass` | compile=0 run=0 `probe_i32=pass`（同墙定性件随修转绿） | PASS |
| 四夹具 ordinary | 0/0 | compile=0 run=0 | PASS |
| 四夹具 call_fixture | 0/1 | compile=0 run=1 | PASS |
| 四夹具 cold_nested | 0/0 + `cold_nested_fmt_interpolation=pass` | compile=0 run=0 stdout `cold_nested_fmt_interpolation=pass` | PASS |
| 四夹具 v6 | 0/0 | compile=0 run=0（r=7/offset=8/n=108 语义路径全过） | PASS |
| 车头回归门（C 链改动条件门） | 未动 C 链 → 免触发 | bootstrap/ 零改动 | N/A |
| patch reverse-check | HEAD 态 apply + reverse-check | APPLY_OK + REVERSE_CHECK_PASS | PASS |

## 四、烤机台账

| 轮 | 内容 | size | sha256 | 用时 |
|---|---|---|---|---|
| r10 | + exact_def_identity.cheng 标量值载体槽 admit 臂（54 行，单文件） | 186813584 | 181d7eaf732749c60610b110361ea912e0c19f613df0ff232f7dff6c2eb4602f | 10:02:33→10:06:20（约 4 分钟） |

烤机预算：3 轮授权，实耗 **1 轮**（修前用 r9 现成驱动复现判词 + 标量探针同墙实证完成全部定性，未烧烤机；一轮烤成即过 t_enum/探针/四夹具中 4 门）。

## 五、交付

**patch**：/tmp/oob_ab/phaseb_enum_cold/phaseb_enum_cold.patch（65 行，1 文件，[phaseB-enum-cold] 标记，reverse-check PASS）。

**临时件清理**：src/tests/zz_phaseb_enum_cold_i32_probe.cheng（任务级定性探针）验收后已按生命周期纪律删除；其门禁证据（compile=0 run=0 `probe_i32=pass`）已录入第三节。

**enum 收官状态**：t_enum compile=0 run=0 `t_enum=pass`——enum 全链（parse→typed→csg→snapshot→lowering→exact-def freeze→codegen→run）端到端全绿，PhaseB-enum 战役收官；四夹具 4/4 零回归。

## 六、租约与门禁时序补记

门禁执行期与并行线长烤窗交错：r10 烤机窗口（10:02-10:06）恰逢租约空窗一次通过；cold_nested/v6 两门三度 lease-unavailable（10:07/10:19/10:20-10:24 wall150 系在飞），按串行退避纪律重跑，cold_nested 于 10:1x 空窗转绿、v6 于 10:25:26 空窗一次编译运行通过。全程无并行烤机、无租约抢占写操作。
