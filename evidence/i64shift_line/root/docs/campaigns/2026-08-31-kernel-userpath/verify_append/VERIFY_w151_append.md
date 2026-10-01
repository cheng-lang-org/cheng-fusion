# VERIFY_w151_append.md —— kernel_driver_w2 战役 wall151 线（树健康定谳：当前组合态 rc=133 归因）

日期：2026-09-05 09:49–10:30。工作目录=仓库根（全程只读，主树零写入、零 commit、零分支）；作业区 /tmp/oob_ab/w151/；克隆作业区 /Users/lbcheng/cheng-f24/anchor_clones/w151（detached @69817b8b2，用毕清理干净 status=0）。车头三件套：/tmp/oob_ab/w139/build_kernel_driver_w139.sh + /tmp/oob_ab/w139/kernel_manifest_head_git.cheng + /tmp/oob_ab/cheng_w126；CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w151/cold_cache、CHENG_ENTRY_CACHE=0。烤机预算 6 轮，**实用 1 轮**。

## 一、判定

**H2 成立。wall150 r5 是污染产物：烤机窗（07:57-08:09）恰逢 enum-schema 线在途 bug 态，trap 点实测落在该线授权面函数 snapshot_schema.csgCompilerTypeStructureAppendInto——该缺陷已被 enum-schema 线自己 r7（structureAppend 防御+canonicalize 五列搬运）修复。当前树健康：r1 终态驱动四面夹具 4/4 一次过，wall150 移交的 cold_nested 6-10MiB RSS 缺口也已随之消失。**

无 H1，无二分，无 wall151.patch（无需修复）。

## 二、先行证据（烤机前已获取）

1. **enum-schema 线自身经历过四夹具 133 trap 并已自修**（/tmp/oob_ab/VERIFY_phaseb_enum_schema_append.md §三/§五）：r6 态「同轮四夹具 133 trap=canonicalize 漏搬运，lldb+map 符号化定位」；r7 修复 premisesExact 子序列+canonicalize 五列搬运+**structureAppend 防御**；r9 终态（sha cb84245d…，树态含并行线 08:2x-09:1x 在途漂移）四夹具 4/4 零回归。
2. **时间线对齐**：wall150 r5 烤机 log mtime=08:09:37（烤机窗约 07:57-08:09）；enum-schema 线 r5→r9 烤机序列（r6 起每轮暴露恰一墙）正落在 08:0x-09:1x——wall150 r5 吸入的正是 schema v8 enum 扩展+canonicalize 漏搬运的**在途 bug 态**，而非终态。
3. patch 覆盖面对账：w5_hunks.patch=system_link_exec+merkle_dag+merkle_transaction；phaseb_a.patch=parser/typed_expr_type_arena/compiler_csg/compiler_snapshot_builder/t_tuple；phaseb_enum_schema.patch=cargo/schema/validator/builder/lowering_bridge+6 smoke+gate.sh；typed_expr.cheng/compiler_parser_receipt.cheng/exact_def_identity.cheng/bootstrap 在途 hunks 属 csg 续线/bootstrap 线，不在任何 patch。
4. 三 patch 在克隆 HEAD 上 `git apply --check` 全 PASS（二分预案就绪，未动用）。

## 三、当前树烤机定谳（第 1 步，决定性）

1. **静默窗**：并行线（csg 续线）09:46 typed_expr / 09:52 探针 / 10:01+10:03 exact_def_identity 连续在途；轮询 cheng_tree_quiesce_probe，10:13:20 起最近改动静默 >10 分钟后开烤；烤机窗（10:13:30-10:17:29）内 src/core+bootstrap+tools 零改动（复核 mtime），r1 闭包可信。
2. **烤机**：kernel_driver_w151_r1，sha256=30d06b492610b30921c099ba4a60e01211a005203de866a32498f1275a71f081，size=186813600，entries=35，entry=src/core/tooling/backend_driver_dispatch_min.cheng，build=ok。
3. **四面门禁一次过**（/tmp/oob_ab/w151/gate_w151r1.log，rc=0 attempt=1 无退避）：

| FIXTURE | COMPILE | RUN | COMPILE_RSS_KiB | RESULT |
|---|---|---|---|---|
| ordinary | 0 | 0 | 708896（692MiB） | PASS |
| call_fixture | 0 | 1 | 706416（690MiB） | PASS |
| cold_nested | 0 | 0 | 816032（797MiB） | PASS |
| v6 | 0 | 0 | 923920（902MiB） | PASS |

summary: pass=4 stale=0，process_tree_peak=946094080B（924MiB）< 帽 1GiB。

4. **对照 wall150 r5 全灭表**（四行 COMPILE=133/stale=4）：同一门禁、同车头通道，r5 态树→全灭，当前树→4/4。**当前组合态无 rc=133 缺陷，H1 不成立。**
5. **顺带收官**：cold_nested 797MiB（wall150 r2 时代 1024.6-1034MiB 贴帽爆）——wall150 §五.1 移交的 6-10MiB 缺口已被后续线改动（enum-schema/csg 续线）消化，四夹具全部回到帽内富余 ≥120MiB。ordinary/call_fixture 同步降至 ~692MiB。

## 四、wall150 r5 污染归因闭环（只读复跑+符号化）

1. r5 驱动本体复跑（同环境变量、同夹具、--root 指隔离克隆）：rc=133 复现，stderr 全空（fail-stop trap 无判词，与 wall150 台账一致）——133 固化在 r5 产物内，非环境瞬态。
2. lldb 定位 trap：thread #2，EXC_BREAKPOINT brk #0x2 @ `cheng_cold_6d296f99_3055 + 8520`。
3. 符号化（r5.primary.o.map line map）：`cheng_cold_6d296f99_3055` = **snapshot_schema.csgCompilerTypeStructureAppendInto**（/Users/lbcheng/cheng-lang/src/core/csg_core/compiler_snapshot_schema.cheng:5599，size=23440）。
4. 归因：trap 函数=enum-schema 线授权面主文件的本体函数，且正是该线 r7 修复项「structureAppend 防御+canonicalize 五列搬运」的同一函数。因果链闭合：wall150 r5（08:09 烤）吸入 schema v8 扩展的 canonicalize 漏搬运 bug 态 → 四夹具全灭；enum-schema r6（08:1x 烤）同态复现同 133 → r7 修复 → r9 4/4；当前树（终态 hunks）→ wall151 r1 4/4。

## 五、根因与修法

根因定性：**烤机与并行线在途编辑的时序冲突**（半成品闭包吸入），非组合态运行时缺陷。wall150 r5 的 133 由 enum-schema 在途 bug（csgCompilerTypeStructureAppendInto 域，canonicalize 漏搬运族）造成，该 bug 已由肇事线自愈。机理教训（供战役流程沉淀）：head 驱动烤机前必须确认 src/core 闭包域 ≥10 分钟静默（cheng_tree_quiesce_probe），烤机窗内闭包域再变更则烤机作废——本次已在流程中执行并验证。

无需修复、无需 spec 移交。/tmp/oob_ab/wall151.patch 不存在（无修复内容）。

## 六、交付物

- /tmp/oob_ab/VERIFY_w151_append.md（本文）。
- /tmp/oob_ab/w151/：kernel_driver_w151_r1（+bake.log/.report/.map 五件）、gate_w151r1.log、cold_cache/、r5_ordinary_repro.log（空 stderr 复现件）、r1_ordinary_repro.log（provider 链环境缺项 rc=2 对照件，正式口径以 gate_w151r1.log 为准）、r5_repro_cache/。
- 烤机台账：预算 6，实用 1（r1）。
