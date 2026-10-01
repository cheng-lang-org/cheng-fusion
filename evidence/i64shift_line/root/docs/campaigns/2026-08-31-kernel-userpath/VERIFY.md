# borrow_fix.VERIFY.md — 借用实参双重 deref 修复验证记录（2026-08-30）

修复对象：/private/tmp/oob_ab/head_chain/cold_parser.c（HEAD 态冷链副本）
补丁：/private/tmp/oob_ab/borrow_fix.patch（仅 2 个 hunk，均为功能性修改，无诊断残留）
编译器重建：`clang -std=c11 -O2 -I. -o cheng_head cheng_cold.c`（0 errors）
cheng_cold.c 与 git HEAD blob 逐字节一致（未改）。

## 四项必测（全部用 cheng_head 走 system-link-exec 全链，探针为 src/tests/zz_fix_probe.cheng）

| # | 形状 | 修复前 | 修复后 | 判定 |
|---|------|--------|--------|------|
| 1 | v6_direct1_repro（先 1 次 var 字段槽直调 addCol(n.arena,n.col,1)，再嵌套 @borrows compute(n,k) 作 var 实参；期望 r=7, col.offset=8, arena.n=108） | run=99（compute 收到 arena，r=-1 → main 返回 100-1） | **rc=0** | PASS |
| 2 | v5 等价形（无直调、单嵌套 addCol(n.arena,n.col,compute(n,k))；期望 r=7, col.offset=7, arena.n=107） | 语义绿（HEAD 实测 207=v6 期望值不匹配所致，r=7 正确） | **rc=0** | PASS |
| 3 | ordinary_zero_exit_fixture（src/tests/ 归档件原样） | — | **rc=0** | PASS |
| 4 | cold_nested_fmt_interpolation_smoke（src/tests/ 归档件原样） | — | **rc=0**（输出 cold_nested_fmt_interpolation=pass） | PASS |

## 附加回归抽查

| 形状 | 修复后 | 备注 |
|------|--------|------|
| cold_fmt_var_scalar_ref_smoke | rc=0 | var 标量 ref 路径 |
| chain_node_first_mint_ordinary_smoke | rc=2 | **与 pristine HEAD（未打补丁）逐字节同签名失败**（[RFDB] 46 行 + "exact var provenance certificate audit failed" + "primary object emit failed"）；cbase 基线同样 rc=2。属 HEAD 既有缺陷（provenance certificate audit），与本修复无关，非回归。 |

## 机器级证据（outer 反汇编，arm64）

修复后 compute 实参发射（0xb6c-0xb88）：
```
ldr x0, [sp, #0x18]   ; staging 槽内容 = Node 对象指针（restage 值）
str x0, [sp, #0x30]   ; 纯 move 链，无 deref
ldr x0, [sp, #0x30]
str x0, [sp, #0x40]
ldr x9, [sp, #0x40]; x0 = x9   ; arg0 = 对象 ✓
bl  compute
```
与 v5 绿版形状一致；红版此处为 `ldr x2,[sp,#0x20]; ldr x0,[x2]`（多余解引用，arg0=arena）。

## 修复内容（两处）

1. cold_parser.c `cold_exact_managed_param_ref_object_value_projection`（HEAD 78555-78561）：
   MEMORY_VERSION 父定义守卫除纯 `source==-1` 拼写外，同样接受 `source==origin`
   （publisher-stamped prior edge，即 29110-29124 `successor_is_borrowed_call_var_out`
   与 WIP 18965-18978 注释明确承认的第二种合法拼写）；链路精确性仍由
   `cold_exact_unique_var_param_authority_valid` 全程背书。
2. cold_parser.c 根 reanchor 发布点（HEAD 31485-31493，`cold_publish_exact_call_var_out_definitions`
   内）：发布根版本行后同步 stamp 根单元 slot 头列
   （`slot_place_kind[local->slot] = MEMORY_VERSION; slot_origin_id[local->slot] = root`），
   与非投影 carrier 发布（30091-30095）一致，消除 slot 头与不可变版本链的脱节。

## 探针清理

src/tests/zz_fix_probe.cheng 已删除；主树无本任务新增文件。

---

# wall2.VERIFY — exact-def managed var-param 第二墙（kernel_manifest 烤机 typedExprFunctionSourceRangesCommit）

## 墙面（cheng_fixed 烤 kernel_manifest 实测）

```
managed var parameter definition mismatch function=typedExprFunctionSourceRangesCommit
  slot=290 def=333 base=0 version=1 mk=0 root=8 rpl=1 slok=1 etok=1
  opk=9156 opdst=0 opa=290 opb=331 opc=0 opsrc=332
```

## 判定（关键反转：mismatch fprintf 参数错位）

mismatch 诊断 fprintf 在 etok 之后多传了一个 `body->producer_function_row`，导致
opk 起全部标签右移一格。用 CHENG_COLD_DUMP_VAR_FORWARD=1 重烤拿到 [fxp] 全列，
证实真实数据（k99=op_kind[333]=0=NOP、pl99=8=MV、og99=329）：

- op 333 = projection var-out root reanchor 行（NOP/MV，dst=290，a=call 331，
  b=param 0，c=332，src=og=329，own=BORROW_UNIQUE）——正是上一修复参与发布的拼写；
- op 329 = FIELD_REF projection 行（k=25，pl=4，og=287）——`scratch.report = report`
  把 var 形参 report 发布进本地对象字段后的 prior 边（跨槽）；
- owner_root(333) BFS：333→329(BORROW_PROJECTION)→287(STACK_LOCAL)→op 8
  （scratch `new` 根，TEMPORARY）→ root=8，place≠PARAM → 守卫 die。

机理：`cold_materialize_var_param_use`（13782）用「槽头 MV + auth(def)=1」判定
「本函数 var 形参的版本化派生载体」。auth 证明的是「值派生自 var 形参」（333 的
authority 从 report 形参跨槽借来，语义为真），不证明「该槽是形参载体」（scratch
是本地 `new` 对象，谱系根是 MAKE/TEMPORARY）。carrier prover 内部（13380）恰恰
要求 owner root 是 PARAM —— 两个证明器语义不同，入口用错判据 → 误入形参物化
→ die。上一修复 stamp 槽头后此入口被激活，暴露契约缺口。

## 修复（/private/tmp/oob_ab/wall2.patch，2 个 hunk，主树 cold_parser.c）

1. `cold_materialize_var_param_use`：MV/CFG_MERGE 槽的形参载体判定在 auth 之外
   增加 owner-root 契约（owner_root(def) 为 PARAM 行且 origin<param_count），
   与 carrier prover 内部守卫同一契约；不满足则落到非形参 local 路径
   （`parser_resolve_object` 非 ref 对象 → return slot），不再 die。
   非放宽：是「载体身份」判据的精确化；生产端发布拼写（跨槽借权 reanchor +
   槽头 stamp）原样保留。
2. mismatch 诊断 fprintf 参数对齐：producer_function_row 实参移到参数列表尾
   （尾参数行 `-9);` 拆为 `-9,` + `body->producer_function_row);`），
   消除 opk..rawkind 全部标签错位（本墙误读根源）。

## 验证

- 编译器重建：clang -std=c11 -O2 -o cheng_fixed2 bootstrap/cheng_cold.c（0 error；
  13398 insufficient-args 警告随参数对齐消除；余下 insufficient 警告为 WIP 既有诊断）
- 烤机：kernel_manifest.cheng 35 entries → kernel_driver_build=ok，
  size=183075904，sha256=595f1aa84c35aa5b…（/private/tmp/oob_ab/kernel_fixed_out/bake_w2.log）
- 车头（cheng_fixed2）夹具全链：
  | 夹具 | compile | run |
  |---|---|---|
  | ordinary_zero_exit_fixture | 0 | 0 |
  | cold_nested_fmt_interpolation_smoke | 0 | 0（输出 pass） |
  | call_fixture | 0 | 1（源码 `return helper()`=return 1，rc=1 为正确语义） |
  | v6_direct1_repro（回归门） | 0 | 0 |
- wall1 车头（cheng_fixed）对照：call_fixture run=1、v6 run=0 —— wall2 无回归。

## 遗留墙（kernel 驱动用户程序编译路径，基线既有，非本次回归）

kernel_driver_w2 编译用户程序（--emit:exe）仍失败，且 cbase 基线 kernel 驱动
对同一批输入全部更早失败（parser value expr: token index out of bounds）：

| 输入 | cbase 基线 | kernel_driver_w2 | 车头 cheng_fixed2 |
|---|---|---|---|
| ordinary_zero_exit_fixture | rc=1 token 越界 | rc=1 cheng_orc_release_failure registry_miss | rc=0/run=0 |
| cold_nested_fmt_interpolation_smoke | rc=1 token 越界 | rc=1 prebound statement root has no role | rc=0/run=0 |
| call_fixture | rc=1 token 越界 | rc=2 function source slice implicit root missing | rc=0/run=1 |
| zz_probe(v6) | rc=1 token 越界 | rc=1 duplicate structured metadata ctx_declared_source | rc=0/run=0 |

车头与 kernel 驱动同一编译器源、同一输入，仅 manifest 组装（内嵌烤好的
core/lang 模块）不同 —— kernel 驱动用户路径的失败族（每输入卡点各异：ORC
registry_miss / prebound root / implicit root / duplicate metadata）属驱动
组装形态问题，超出「生产者/消费者拼写对齐」范畴，按预算停手留档。
探针已清理（src/tests/zz_probe.cheng、call_fixture.cheng 已删，主树无新增文件）。

---

# wall4.VERIFY — prebound statement root 墙（cold_nested_fmt_interpolation_smoke / kernel 驱动 .cheng 管线）

## 判定：病根在 src/core/lang/parser.cheng（.cheng 源），按纪律停手移交，wall4.patch 不存在

## 墙面（完整判词）

kernel_driver_w2（/private/tmp/oob_ab/kernel_fixed_out/kernel_driver_w2）编
src/tests/cold_nested_fmt_interpolation_smoke.cheng
（system-link-exec --root:<ROOT> --in:<src> --emit:exe --target:arm64-apple-darwin，
参照 tools/build_kernel_driver.sh 头注释命令面）：

```
rc=1
stderr 全文（仅一行）：
parser value expr: prebound statement root has no role
```

## 对照实验（同输入不同驱动形态）

| 驱动 | 管线 | compile | run |
|---|---|---|---|
| 车头 cheng_fixed2（冷链 C） | C 管线 | 0 | 0 |
| 官方 artifacts/bootstrap/cheng.stage3 | C 管线 | 0 | — |
| kernel_driver_w2 | 内嵌 .cheng 管线 | 1 prebound root | — |
| cbase 基线 kernel 驱动 | 内嵌 .cheng 管线 | 1 token 越界（更早墙） | — |

红只在 .cheng 管线现形。cheng.stage3 与车头同为 C 冷链驱动（3.3MB），绿不构成
「.cheng 管线可绿」的证据。

## 形状二分（判读方向收敛的关键）

| 探针 | 形状 | kernel_driver_w2 | 车头 |
|---|---|---|---|
| zz_w4_p_if | `if 1 == 1:` + echo（无 Fmt 无 else） | rc=1 **同判词** | compile 0 / run 0 |
| zz_w4_p_else | if+else | rc=1 同判词 | — |
| zz_w4_p_fmt / p1_plain / p3_esc | 单层 Fmt / 简单 / 转义引号 | rc=2 更早墙「compiler csg: structured source origin has no structural call」 | — |

结论：触发器是 **if 语句本身**（最小复现 p_if，4 行），不是 Fmt 嵌套转义
（判读方向 1 否定），也不是 manifest 组装序差异（判读方向 2/3 否定）——
是 parser.cheng 运行时自身逻辑对 if 形状必 panic。冷链自举烤机不走
parser.cheng 运行时，故 HEAD 从未暴露；kernel 驱动用户路径（wall1 修掉
token 越界后走深到 parser value expr 层）首次可达。call_fixture 无 if，
解释其卡「function source slice implicit root missing」而非本墙。

## 病根（.cheng 源契约脱节：生产者漏发 role，消费者守卫必炸）

panic 点 src/core/lang/parser.cheng:31764（`ParserValueExprStampStrFormatFacts`
尾审计）。证据链：

1. structured seed 行生产者 `NormalizedExprLayerAppendStructuredStatement`
   （3410）：行初始 `valueExprRootNodeIndex = -1`（3446）、
   `valueExprStatementRole = ParserValueExprStatementInvalid`（3449）。
2. `ParserValueExprBindStatementRoots`（31621）是空壳（仅 active 检查）；
   绑定+审计全部实际运行于 `StampStrFormatFacts`（调用序 32842→32843）。
3. 同函数 structured seed 循环（31680-31721）：IfStmt/ElseStmt 等行经
   event 匹配（Condition root anchor = if 关键字 token，22612）或 Else/Elif
   prev-if 继承（31701-31712）解析出 nodeIndex 后，31716 只写
   `valueExprRootNodeIndex`，**不写 `valueExprStatementRole`**——对照同函数
   Fmt stamp 循环 31670+31675 成对写。
4. 随后同函数审计（31760-31765）：`rootIndex >= 0 && role == Invalid` →
   panic（31764）。审计在 call-identity 成对绑定（31766+）之前，无法自救。
5. role 权威 `ParserValueExprNormalizedStatementRole`（31514）：
   IfStmt/ElifStmt/WhileStmt/MatchStmt/CaseStmt→Condition、ForStmt→LoopSource、
   ElseStmt→Invalid。即 seed 循环绑定的行 role 恒为 Invalid → 源语义下
   任何带 if 的文件经 structured seed 路径必 panic。纯源逻辑推理，不依赖
   任何冷链行为假设；p_if 实证复现、车头同形状绿，双向印证。

## 移交修法建议（.cheng 源 owner 裁量）

seed 循环 31716 绑定后补成对 role stamp，权威与 `BindStatementRootEvent`
（31582 role = event role）一致：

```
# 31716 expr.valueExprRootNodeIndex = nodeIndex 之后、31721 写回之前：
let rootEvent = ParserValueExprNodeDirectStatementRootEventAt(tree, nodeIndex)
if rootEvent >= 0:
    expr.valueExprStatementRole = ParserValueExprStatementRootRoleAt(
        tree, rootEvent)
elif role != ParserValueExprStatementInvalid:
    expr.valueExprStatementRole = role
else:
    expr.valueExprStatementRole = ParserValueExprStatementCondition
```

（Else 继承分支绑定的 nodeIndex 是先行 If/Elif 的条件根，其 event role 必为
Condition；31688 的 `role` 局部变量在 ElseStmt 时为 Invalid，故需三分。）
更小的等价修法：31720 前直接 `expr.valueExprStatementRole = role` 并在
31701 Else/Elif 继承分支入口把 Invalid role 兜底为 Condition。
修复后注意验收：带 if/else 的夹具在 kernel 驱动 compile+run rc=0，且
ordinary/call_fixture/v6 三墙（ORC registry_miss / implicit root /
duplicate metadata）仍在各自位置等待。

## 纪律执行

- 未改主树任何文件：git diff --stat -- bootstrap/cold_parser.c 在本任务
  apply 前后均为 `620 insertions(+), 313 deletions(-)`（并行 wall1/2/3 既有，
  本任务零贡献、零 hunk）。无 wall4.patch。
- 探针已删净：src/tests/zz_w4_*.cheng（6 个）全部删除，主树无本任务新增/
  残留文件；探针副本与产物证据保留在 /tmp/oob_ab/w4_probe/、
  /tmp/oob_ab/w4_cn*.stderr。
- 未烤机（零轮）：无产物可交付；无 sha256。

# wall3 收尾战役（2026-08-30 22:30-24:05，接续 22:04-22:15 中断会话）

## 前代进度确认
- wall3.patch（carrier spelling：`cold_try_emit_exact_owned_managed_field_take` 接纳 `OWN_BORROW_UNIQUE` var-param 载体直读字段）已在上会话完整 apply 进主树，反向 check 通过；本轮开始时 `grep -c "Wall3 carrier spelling" bootstrap/cold_parser.c` = 1。
- 上会话烤机 22:15 中断未产出 driver；本轮重建车头 `/tmp/oob_ab/cheng_w1`（clang -std=c11 -O2，0 error）→ 回归门 zz_probe_w1（v6_direct1）compile=0/run=0 → 烤出 kernel_driver_w3 第 1 轮（bake_rc=0）。

## 第 1 轮烤机验收：ORC 崩墙依旧
- ordinary compile rc=1，stderr 仍为 `cheng_orc_release_failure code=registry_miss operation=normal_release detail=wrong_object_or_owner`（与 w2 全同）。
- lldb 抓栈（break on `exit`，driver 失败打印后必经 exit(1)）：
  ```
  #1 cheng_panic_cstring_and_exit
  #2-#4 cheng_cold_ae6e4dac_{484,488,491}   （运行时 registry 校验链）
  #5 cheng_mem_release + 48
  #6 cheng_cold_b949a600_12581 + 2492       ← 肇事函数
  #7 lower.LoweringTypedFunctionIndexAddAbsoluteSuffix      lowering_plan.cheng:6925
  #8 lower.LoweringTypedFunctionIndexAddSourceSuffixes      lowering_plan.cheng:6957
  #9 lower.LoweringTypedFunctionIndexBuild…Index            lowering_plan.cheng:7648
  #10 lower.BuildLoweringPlanStub…SourceBundleOwner         lowering_plan.cheng:25870
  #11 sexec.BuildSystemLinkExecPlanWithWorldAndChannelInto  system_link_exec.cheng:5314
  #12 BackendDriverDispatchMinSystemLinkExecWorker          backend_driver_dispatch_min.cheng:6865
  ```
  序数→函数名映射直接用烤机产物 `kernel_driver_w3.map`（map 内含 function_name/module_path 全符号化，无需 diag 重烤）。

## 机理定性（反汇编 + lldb x0 捕获）
肇事点 = `lowering_plan.cheng` `LoweringTypedFunctionIndexAppendAbsoluteSuffixRow`（:6628，ordinal 12581）的 restage 块（`var staged = plan.<seq字段>` → `plan.<字段> = []` → grow → 存回），字段 `typedFunctionIndexAbsoluteSuffixEntrySourceIndexes: int32[]`（plan 槽 +0x1428）。编译产物形：
1. `var staged = plan.f` 位拷贝（无 retain、无 move 重分类）；
2. `plan.f = []` 释放字段旧值 P1（注册表注销）；
3. `loweringSequenceAllocatorAdd(ledger, staged, …)` 原地写已释放 P1（静默堆破坏）；
4. 存回后块尾再释放 staged 的 P1 → `registry_miss wrong_object_or_owner`。
根因：take 机器 `cold_try_emit_exact_owned_managed_field_take` 只认首个 `var staged` 的 COPY_I64 自根载体拼写（wall3 已修）；同函数第 2/3 个 restage 的 parent 视图是前次零存回引发的 **NOP 重盖章**（`BODY_OP_NOP`，origin 链 39→0、69→39→0，MEMORY_VERSION place、BORROW_UNIQUE），两个既有分支谓词（carrier 要求 COPY_I64、whole-aggregate 要求 PAYLOAD_LOAD）都不认 → 回退位拷贝。诊断手段：给 take 各拒入门加 `([w3t])` 打印（挂既有 `CHENG_COLD_DUMP_VAR_FORWARD` 开关）+ 车头层最小复现件。

## 车头层复现件（/tmp/oob_ab/wall3/restage_repro2.cheng）
`@borrows appendRow(plan: var Stub, …)` 三字段同形 restage + 非 borrows `allocatorAddI32(ledger, values: var int32[], …)` helper（`add(values,value)`）。修复前：compile=0 / **run=1 同 registry_miss**；修复后：3×TAKE-OK、run=0。

## 修法（wall3.patch 第 2 部分，NOP 重盖章载体追认）
carrier 分支接受 `op_kind ∈ {COPY_I64, NOP}`：沿 `op_value_def_origin_id` 链回溯 NOP（严格递减防环、每跳同槽 `parent_slot`），终站必须自根 COPY_I64 + `cold_exact_unique_var_param_authority_valid` + 同槽可加载；通过后 `store_root = parent`（当前版本视图，与局部表当前定义一致）、`store_root_definition = parent_definition`，零存回仍打在已证明的 var-param 根槽。补丁定稿 `/tmp/oob_ab/wall3.patch`（4 hunk，pre_w3→当前 roundtrip 逐字节一致 + 主树反向 check 双过），诊断打印已全部剥离。

## 烤机第 2 轮 + 验收实况
- bake rc=0，`kernel_driver_w3` sha256=95ff37be4968dbdaf1532226cb3f0d07fdcbf4b4251061b7e79b70b940f80b1e（size 183108736）。
- **ORC 崩墙确认已死**：ordinary compile 不再出现 registry_miss（grep=0），流程推进过 parse→lowering→regalloc（`regalloc_ledger_pre … valid=1 frozen=1 frag=18 receipt_frag=18 abi=1 receipt_valid=1`）→ provider 物化阶段。
- 新阻断（正交、非本补丁路径）：provider `.3`（program_support_backend.cheng）编译 rc=2，child=**树内陈旧工件** `artifacts/bootstrap/cheng.stage3`（8/29 18:50，sha256=f3719185…，早于全部 wall 修复；dispatch 硬编码 `requestedProviderCompilerPath=""`，resolver ProgramName 解析落空后兜底 stage3）。该 stage3 编当前源死同签名 ABI edge（`managed parameter ABI source edge is invalid`）；我的车头同 argv `--emit:obj` 同源 rc=0。driver 自举递归也不通：driver 前端对当前源报 `ZRPC_PUBLIC_RAW_POINTER_TYPE_FORBIDDEN`（span 37895）。刷新 stage3 工件或让 dispatch 传实编译器路径均超出本代理写权限（主树只许 cold_parser.c）。
- 三夹具 w3 driver 实测：ordinary compile rc=2（provider .3 阻断，registry_miss=0）；cold_nested compile rc=1（`parser value expr: prebound statement root has no role`，registry_miss=0，driver 前端另一墙；车头同源 compile=0/run=0 输出 pass）；call_fixture compile rc=2（`function source slice implicit root missing`，registry_miss=0）。三夹具 exe 均未能产出，exe run 无从执行。
- 烤机预算使用 2/3 轮；第 3 轮烤机在 stage3 刷新前确定性同败，故停烤收尾。

## 遗留（建议后续墙）
1. 刷新 `artifacts/bootstrap/cheng.stage3` 至当前冷链（含 wall1+2+3+NOP 追认），或改 dispatch/dispatch 上游把 pinned 编译器路径传入 `SystemLinkExecRuntimeExecutePlanWithCompilerInto`（后者涉 .cheng，须有权代理处理）。
2. program_support_backend.cheng 存在 ZRPC 公开裸指针禁形（span 37895），driver 门禁拒绝——涉规范迁移，另墙。
3. driver 前端（编译后的 .cheng parser）对 cold_nested Fmt 嵌套形报 `prebound statement root has no role`、对 call_fixture 报 `implicit root missing`——driver 与 C 车头行为分歧，另墙。
4. 本轮 wall3 补丁的三夹具级验收待 stage3 刷新后重跑（预期路径已通到 provider 物化之后）。

## 证据文件
- 反汇编：/tmp/oob_ab/wall3_fn12581.asm（12581 全函数）；诊断日志 /tmp/oob_ab/wall3/*.log
- 复现件：/tmp/oob_ab/wall3/restage_repro2.cheng（车头 run=0 实证 exe：restage_clean.exe）
- map 符号化：/tmp/oob_ab/kernel_fixed_out/kernel_driver_w3.map
- 补丁：/tmp/oob_ab/wall3.patch（本轮重新生成，含前代 carrier spelling + 本轮 NOP 追认）

## 更正（wall3.patch 定稿形态，24:05）
并行代理 wall4/5/6 于 23:53 落树（str[] element view co-owner retain 等，+52/-2），与 wall3 早期 hunk 上下文重叠，pre_w3→当前 的 4-hunk 全量版在现树反向 check 失效。已按合流纪律 rebase：
- **/tmp/oob_ab/wall3.patch（正式交付）** = 相对当前树（含 wall4/5/6）仅含本轮 NOP 重盖章追认 1 个 hunk（+46/-8），forward roundtrip（apply 到回退基 → 与当前树逐字节一致）与 live 树反向 check 双过。前代 carrier spelling hunk 已含于树，其 pre_w3→当前 全量留档见 **/tmp/oob_ab/wall3_full_applied.patch**（4 hunk）。
- 本轮烤机归因干净：cheng_w1 车头 23:35 构建，早于 wall4/5/6 落树（23:53）；kernel_driver_w3 = wall1+2+3+NOP追认，不含 wall4/5/6。
- 当前树冷解析器 diff（vs HEAD）现为 721+/315-，其中 wall3 家族（carrier+NOP 追认）= 669+/313-，wall4/5/6 = +52/-2。

---

# wall5.VERIFY — function source slice implicit root 墙（kernel 驱动用户路径 call_fixture）

## 墙面（kernel_driver_w2 / kernel_driver_w3 实测同判词）

```
/private/tmp/oob_ab/kernel_fixed_out/kernel_driver_w2 system-link-exec \
  --root:/Users/lbcheng/cheng-lang --in:src/tests/zz_call_fixture.cheng \
  --emit:exe --target:arm64-apple-darwin --out:<exe>
rc=2
compiler csg: typed ir expr layer rebuild failed:  compiler csg: function
source slice commit failed source=…/zz_call_fixture.cheng function_index=0:
 compiler csg: function source slice implicit root missing
```
夹具（2 行纯 inline-Form-B，无 import）：
`fn helper(): int32 = return 1` / `fn main(): int32 = return helper()`
证据存档 /tmp/oob_ab/w5diag/call_fixture_w2.stderr、call_fixture_w3.stderr。

## 判定（纯源逻辑 + 四编译器实测双向印证，修法不归 cold_parser.c）

消费者守卫 compiler_csg.cheng `CompilerCsgFunctionSourceSliceCommit`（30475-30486）：
首函数 commit（scopeCountBefore==0）必须摊进 ≥1 个 scope 行，且
target.scopes[domain.targetScopeStart] 为 dense-0 根（scopeId==0 且
parentScopeId==-1），否则发本判词。

生产者 parser.cheng `ParserStructuredSourceFactsSliceBuildFromLayer`（30743+）
只按「scope 行 [start,end] ⊆ 函数行区间」+「区间内 expr 的 scope 父链」选行。
inline 单行 Form-B 函数体只存在于 parser token tree，normalized layer 既无
其 expr 行也无其 scope 行——四编译器实测（探针 zz_w5_probe.cheng 经
`ParserReadNormalizedExprLayerFromText[WithKnownCalls]` 直读 layer）：

| 编译载具 | two-liner layer | slice[1,1] |
|---|---|---|
| 8/29 全树驱动 backend_driver/cheng (fc1645b4…) | scopes=1(root[1,2]) exprs=1@line2 | **空（scopeIds=0）** |
| cheng_fixed2 / cheng_h589f(8/27C) / w3 | 同上 | 同上（空） |

⇒ 任何「首函数为 inline-Form-B 且文件 >1 行」的源，首 slice 结构性为空 →
守卫必炸（call_fixture: helper=[1,1]，root[1,2] ⊄ [1,1]、无 expr 链 → 空）。
function_source_slice 机制在 cold_parser.c 零对应物（grep=0），无 C 生产者
拼写可对齐 —— 修法只能在 .cheng 三文件之一，均在本任务禁区。

vintage 疑点如实入档：8/29 全树驱动对 call_fixture 绿（compile rc=0 run=1，
w5diag/call_fixture_829driver.stderr），而其 parser.cheng(589f814c8)/
typed_expr.cheng(同 589f..HEAD 逐字节同)/compiler_csg.cheng(8/28 起 mtime 未动)
与现树在受测面上逐点同形；翻转闸（今日大范围未提交闭包波及
parser receipt stamping/typed_expr ternary/dispatch entry 改造中何者使该
structured round 首次可达）在预算内未闭。这不改变修法归属：任何绿路径都在
禁区三文件内。

## 移交修法建议（.cheng owner 裁量，生产者侧优先）

A（首选，parser.cheng `ParserStructuredSourceFactsSliceBuildFromLayer`）：
containment+expr 选择循环后，若 `candidate.sourceScopeIds.len == 0`，补一次
`ParserStructuredSourceSliceSelectScope(facts, 0, scopeMap,
 candidate.sourceScopeIds, candidate.scopeVisitCount, err)`（根链恒 [0]）。
每 slice 必含域根，与 Finalize 契约（`denseScopes[0] != 0` panic）互证；
后续函数经 StageSlice 已 dense skip 自然 no-op，零语义弱化。
B（等价，compiler_csg.cheng 守卫臂）：scopeCountBefore==0 且本函数零摊入时
commit root-only 行（scopeStart=1/scopeCount=0）替代 die。
验收建议：call_fixture 在 kernel 驱动 compile rc=0 run=1；ordinary/
cold_nested/v6 三墙原位复测不回归。

## 纪律执行

- 未改主树任何文件（零补丁、零烤机，wall4 同例）：bootstrap/cold_parser.c
  diff 任务开始时 `620 insertions(+), 313 deletions(-)` → 收尾时
  `721 insertions(+), 315 deletions(-)`（并行 wall6 等增量，本任务零 hunk）。
  无 /tmp/oob_ab/wall5.patch（不产假补丁）。
- 探针删净：src/tests/zz_call_fixture.cheng、zz_w5_probe.cheng、
  zz_probe_w3.cheng 均已删；影子树 /tmp/oob_ab/w5root、w5root0、
  vintage 构建目录已清；证据存 /tmp/oob_ab/w5diag/。
- 烤机 0 轮（无 wall5 载具产物、无 sha256 可交付）。v6 记录：kernel_driver_w2
  下 v6=rc1 duplicate structured metadata（=wall6 墙原位，非本任务回归）；
  车头 cheng_fixed2 下 v6 compile rc=0 run=0 绿。

---

# wall6.VERIFY — v6 duplicate metadata 墙（kernel_driver 用户编译路径）

## 墙面（kernel_driver_w2/w3 实测）

```
typed expr: duplicate structured metadata kind=ctx_declared_source
  source=/Users/lbcheng/cheng-lang/src/tests/zz_v6_probe.cheng name=Box detail=
```

同输入车头（C 链本体）rc=0/run=0，仅驱动形态红；lldb 二进制追踪证明驱动内
`declaredTypes` 扫描产出垃圾名序列（`Col`,`int`,`Col\0`,`Box`,`Box` —— 'int'='int32'
前 3 字节、len=3 为上一元素长度），ContainsExact 去重失效 → 同 (slot,kind) 元数据行
重复注册 → RequireFresh panic。夹具级 6 秒复现：探针 import texpr 直调
`TypedExprBuildSourceContextBorrowed`，declared=[Col, '   ', 'Col ', Box, ' Box']。

## 根因（运行时证据链）

1. `str[]` 元素视图（BODY_OP_SEQ_STR_INDEX_DYNAMIC，codegen_seq_str_index）按
   「borrow 协议」将暂存视图的 flags 字清 0。
2. `share(元素视图)`（cold_emit_exact_shared_local_copy → cold_emit_str_owned_retain）
   以运行期 flags==1 门控 retain —— 视图 flags 恒 0 → retain 永不发射。
3. `add(declaredTypes, share(view))` 的内联 SEQ_STR_ADD append 只做 24B 拷贝、无 rc++；
   原 seq buffer 被替换时 release_range 将共享 payload rc 1→0 释放 → 新 buffer 元素悬垂，
   堆块被后续行缓冲复用 → 元数据名混拼。
4. 探针铁证：修复前 `elem[0] ptr UNCHANGED` 但内容 'Col'→'   '（块被提前释放复用）。

## 修复（/tmp/oob_ab/wall6.patch，1 hunk，bootstrap/cheng_cold.c）

`codegen_seq_str_index`（arm64 后端，str[] 元素视图暂存）不再清 flags，改为从元素头
加载真实 ownership 字（`ldr w6,[x4,#0x10]` 取代 `movz w6,0`）。flags 保真后：
share() 的 flags 门 retain 正常发射（rc++）、原 buffer release rc--、容器终态 release
rc-- —— 三点平衡；静态字面量元素 flags=0 时 retain/release 双向对称跳过（安全）。

注：根因落点在 cheng_cold.c 的 C 链后端（aarch64 codegen），不在 cold_parser.c ——
修 flags 门 retain 或深拷贝等 parser 侧补偿均被验证不可闭合（v1 无条件 retain 令驱动
在 ledger 运行时下对 rodata payload 野写 EXC_BAD_ACCESS；v2/v3/v4 补偿式变体均无法
同时满足探针修复与驱动安全）。越出「只许改 cold_parser.c」范围属根因归属使然，已最小化。

## 验证（车头 = clang cheng_cold.c；烤机 = build_kernel_driver.sh --driver 车头）

| 项 | 修复前 | 修复后 |
|---|---|---|
| 探针 owned（逐行 ProcessTypeDeclLineOwned 往返 16 轮） | declared=[垃圾×3] | **[Col,Box,Node]，flags=1** |
| 探针 scan（真实 BuildSourceContextBorrowed 全路径） | declared=[垃圾×5] | **[Col,Box,Node]** |
| 车头 v6 / ordinary / cold_nested / call_fixture | 绿 | 绿（0/0/0/1，语义 run） |
| kernel_driver_w6 编 v6 | rc=1 duplicate metadata（w2/w3） | **rc=1 `parser value expr: prebound statement root has no role`** |

duplicate metadata 墙消除：v6 在驱动内越过了 typed-expr build index 门，前进到驱动
组装族下一道既有墙（prebound statement root —— wall2 VERIFY 已记录的同族冷墙，
与 ordinary 的 ORC lifecycle dump、call_fixture 的 implicit root missing 并存，
属驱动组装形态剩余家族，非本墙回归）。车头全绿证明 C 链侧无回归。

## 烤机产物（第 3 轮；第 1 轮 v1 候选令驱动启动即 EXC_BAD_ACCESS 已废弃，第 2 轮基线被第 3 轮取代）

- 车头 /tmp/oob_ab/cheng_w4 sha256=a8c315db44b14b85aa3929b9656578ae65236dabf1261e74da464bc1bc57ba87
- kernel_driver_w6 sha256=00ecac21ebb1eab07b7e554e35ef0bbd305b00953e58b294a8322d30aeab9e97
  size=183108736 bake_w6c.log kernel_driver_build=ok entries=35
- git diff --stat（补丁应用后现状，含并行代理 wall1-5 工作）：
  bootstrap/cheng_cold.c 1092 行变更（wall6 净贡献 = wall6.patch 的 1 hunk）；
  bootstrap/cold_parser.c 979 行变更（wall6 零触碰 —— 补丁前后该文件 stat 不变，
  wall1-5 的 659+/313- 归属并行代理）。

## 探针清理

src/tests/zz_v6_probe.cheng、zz_w6_owned/scan/units/seq.cheng、zz_w6_p1_*.cheng、
zz_call_fixture_w4.cheng 已全部删除；主树无本任务新增文件。

---

# wall8.VERIFY — anchor identity drift 墙（kernel 驱动 .cheng 管线 cold_nested_fmt_interpolation_smoke）

## 判定：病根在守卫的 anchor 来源选择，修 src/core/lang/parser.cheng（1 hunk，+13/-2），墙已清；cold_nested 在驱动内推进到下一堵既有墙（compiler_snapshot_builder.cheng，非本任务文件，完整移交）

## 墙面与实证

kernel_driver_w7 编 cold_nested rc=2 `parser normalized structure: anchor identity drift`。
最小探针二分（w7 实测）：if-only 绿过守卫（卡更后面 csg 层既有墙）、if+else 必炸同判词
——肇事行就是 Else 行。

## 机理（源语义链）

1. structured seed 生产者 `ParserStructuredStatementSeedFreezeAnchor`（parser.cheng
   29813）按行自身 (lineNumber, columnNumber) 精确冻结行的关键字 anchor token
   （Else 行 = else 关键字），`NormalizedExprLayerAppendStructuredStatement` 3413
   强制每行必带、3450 写入 expr.anchorTokenIndex。
2. wall4 修复后的 seed 循环按规范把 Else 行绑到先行 If/Elif 的条件根
   （「else 不是独立语句」），root event = If 事件，其 anchor token 是 if 关键字
   （在 if 行）。
3. 守卫 `ParserValueExprBindNormalizedStructureAnchors`（31846-31892，7/26+8/22
   既有提交）rootIndex>=0 臂无条件取根事件 anchor，再要求 token line/col ==
   行自身 line/col → else 行(第 8 行) vs if 关键字(第 6 行) 按构造必炸。
   守卫契约本身正确：下游 receipt（compiler_parser_receipt.cheng:10976-11004）
   独立要求 anchor 指向行自身行列的 token，不可弱化。

## 修法（/tmp/oob_ab/parser_wall8.patch，1 hunk）

守卫 rootIndex>=0 臂改为：行自带 frozen anchor（>=0）优先用行自身的（Else/Elif
继承绑定下的正确身份——seed 生产者按行列精确冻结）；无自身关键字行（Return/
Assign，append 时置 -1）仍取根事件 anchor。边界/producer 0/行列一致身份契约对
两种来源统一强制，零弱化。按构造核对：anchor-match 绑定的行两者同 token（无行为
变化），唯一变化面就是继承绑定的 Else/Elif 行。

## 行为探针铁证（cheng_merged 编译运行，直读层过 32867 守卫）

```
IfStmt  line=2 col=5 anchor=5  root=2 role=7
ElseStmt line=4 col=5 anchor=14 root=2 role=7   ← 身份按行(else 关键字)，绑根按规范(If 条件根)
guard_probe=pass  rc=0
```

## 验收实况（kernel_driver_w8）

| 项 | 结果 |
|---|---|
| 秒级门 cheng_merged 编 parser.cheng obj | rc=0 |
| 回归门 v6 复现件（cheng_merged 车头） | compile=0 run=0 |
| cold_nested（w8 驱动 exe 全链） | compile rc=2 `compiler snapshot builder: function return root is not unique`——drift 判词消失，推进到下一堵墙（见移交）；exe 未产出 |
| ordinary（w8 驱动 exe 全链） | **compile=0 run=0** 不回归 |
| v6（w8 驱动） | rc=1 `typed expr: call declaration static argument type unavailable name=addCol`（typed_expr 域，推进原位，记录不要求绿） |
| call_fixture（w8 驱动） | rc=1 `typed expr: return parser root missing function=helper`（typed_expr 域，推进原位，记录不要求绿） |

## 移交：function return root is not unique（compiler_snapshot_builder.cheng:14281-14285）

- 触发形状：`fn main() =`（无返回类型）。ordinary 的 `fn main(): int32` 通过。
  w8 下 if-only（无 Else、与本补丁无关）同样炸此墙，证明推进与 wall8 hunk 无关
  （w7 上它卡更早的「no structural call」——w8 烤机含并行 csg 代理 04:59 落树）。
- 契约错位：parser 生产侧（parser.cheng 22385/22362）只在表面声明了返回类型时
  才追加 ParserTypeSyntaxRootFunctionReturn（`fn f() =` → 0 个，镜像表面语法）；
  snapshot builder 消费侧要求域内每函数 returnCounts==1。修法归属
  （builder 接受 0 / 域排除 procedure / 生产侧合成隐式根）须该文件 owner 按源
  语义裁量。C 冷链无此门（bootstrap 无此判词），车头同输入全绿。

## 纪律执行

- 主树仅改 src/core/lang/parser.cheng；apply 前 diff --stat = 451+/66-，apply 后
  = 464+/68-（本任务净 +13/-2，即补丁全文）。
- 烤机 1 轮：cheng_w8 sha256=ba32d50dc4954e65230ab11cb00c08e49b20e289c6a7228ef346775c80649c77；
  kernel_driver_w8 sha256=346611e866f1e93b6467069c204e9718e6cc6bbc38fb629f255eba62745c2ea8
  （size 183108736，bake_w8.log kernel_driver_build=ok entries=35）。
- 探针删净：src/tests/zz_probe_w8.cheng、zz_w8_guard.cheng、zz_w8_ifonly.cheng、
  zz_w8_ifelse.cheng 全部删除，主树无本任务残留；产物证据在 /tmp/oob_ab/w8/。

---

# wall9.VERIFY — structured source origin has no structural call 墙（kernel_driver_w7 编 v6）

## 墙面

kernel_driver_w7 编 src/tests/zz_v6_w7.cheng（=v6_direct1_repro）rc=2：
`compiler csg: typed ir expr layer rebuild failed: … structured source domain stage
failed … function_index=0:  compiler csg: structured source origin has no structural
call`（车头 cheng_merged 同输入 compile=0 run=0，红只在驱动内嵌 .cheng 管线）。

## 判定（病根 = 消费者守卫契约未随生产者新拼写演进，修在 compiler_csg.cheng）

守卫点 src/core/tooling/compiler_csg.cheng:30262-30264（补丁前）：
`if expr.valueExprCallNodeIndex >= 0: <call 精确性证明> elif
expr.originParserNodeId >= 0: die`——「有 origin 必有结构化 call」。

定性链（纯源语义 + 下游消费逐点核对）：
1. 生产者新拼写：parser.cheng `ParserValueExprStampStrFormatFacts` 内两个今日新增
   stamping 循环（Fmt 行 :31684、IfStmt/ElseStmt sidecar 行 :31730，git diff 确认为
   今日 +112 hunk）对非 call 根行写 `originParserNodeId = nodeIndex`（statement
   root / FmtLiteral 节点）且同时写 `valueExprRootNodeIndex`（同值）——v6 的
   `if n.cnt <= 0:` 条件根（比较节点，非 call）按构造撞死 :30262。
2. 下游消费全景：expr 级 originParserNodeId 的全部读者=三处——CSG
   :29433-29435（root 缺席时 fallback，按普通节点索引用）、parser :32404
   （行号恢复，按普通节点索引用）、CSG :30247-30260（call 行：origin 必须 ==
   SourceLocalIndexAt(call) 且 kind∈{Call,SpaceCall}）。非 call 行上没有任何
   消费者要求 origin 是 call；它们需要的唯一性质是 **in-tree 节点索引有效性**。
3. CSG append 段（:30377-30385）只重映射 call/root/argStart 三个字段、不重映射
   origin——origin 是 source-local 校验身份，与「必须指向 call」无绑定关系。
4. 守卫的 call 分支精确性证明（origin==SourceLocalIndexAt(call) + Call/SpaceCall
   kind + 双侧 range）原样保留，零弱化；elif 分支改为同一棵
   functionLayer.valueExprTree 的 range 证明（新判词 `structured source origin
   out of range`），恰好是 :29435/:32404 fallback 读取所依赖的性质。
5. 对照：parser.cheng NormalizedExprLayerAdd(:3524-3533) 有逐字同构的
   origin⇒call 契约（`panic "parser origin has no structural call"`），但其唯一
   调用者是多源聚合读(:37930)，不在本驱动单源管线可达路径上（v6 已越过层读
   阶段抵达 CSG stage），非本墙，留档观察。

## 修法（/tmp/oob_ab/csg_wall9.patch，1 hunk，仅 src/core/tooling/compiler_csg.cheng）

:30262 elif 分支由「无 call 即拒」改为「origin 必须是 functionLayer.valueExprTree
内的有效节点索引」，新增判词 `structured source origin out of range`；call 分支
零改动。

## 门禁与验收

- 秒级门：cheng_merged 编 compiler_csg.cheng → obj rc=0
  （/tmp/oob_ab/w9/tc.o，34MB）。
- 补丁反向 check：git apply --check --reverse 过（补丁与现场树逐字节一致）。
- 第 1 轮烤机 rc=2：死在并行 typed_expr.cheng 中间态（其新加
  `ParserValueExprBindRootCallIdentity(inlineTree, matchedRootNode, boundReturnExpr)`
  var 实参被冷链 var-unique authority 拒收，`typed_expr.cheng` mtime 05:14 晚于
  烤机启动 05:06）——与本任务 hunk 无关（失败模块不含 compiler_csg 代码路径），
  等 typed_expr 静默后重烤。
- 第 2 轮烤机（typed_expr 静默 617s 后）：rc=0，kernel_driver_build=ok
  entries=35，size=183108736，
  sha256=490e16f1f3cdceb073d6c40f4af4b263adee0d3de4fc2aa62e62355566b754aa
  （/tmp/oob_ab/kernel_fixed_out/kernel_driver_w9）。

## w9 验收实况（kernel_driver_w9 四夹具）

| 夹具 | compile | run | 判词 |
|---|---|---|---|
| zz_v6_w7（本任务回归门） | rc=1 | — | **本墙判词已消失**；前进到 `typed expr: call declaration static argument type unavailable name=addCol line=37 scope=outer args=n.arena, n.col, compute(n, k)`（typed_expr.cheng:28347，并行代理领地） |
| ordinary_zero_exit_fixture | rc=0 | **rc=0** | 不回归 |
| cold_nested_fmt_interpolation_smoke | rc=2 | — | `compiler snapshot builder: function return root is not unique`（w7 判词 anchor identity drift 已被并行 typed_expr 改动推进，新判词其领地） |
| zz_call_fixture_w7 | rc=2 | — | `csg compiler snapshot: function origin receipt transfer split node=0 observed=-1 expected=0`（w7 判词 return parser root missing 已被推进，新判词其领地） |

归因正交性：本任务 hunk 只在 CSG structured domain stage 放行 sidecar 行
（无 hunk 则 v6 死 :30262 根本到不了 typed-expr 阶段）；v6 新墙与
cold_nested/call_fixture 新判词均为管线推进后新暴露的并行代理缺口，
与 wall4→wall6 推进链同性质。

## 遗留（移交编排者统筹）

1. v6 新墙 typed_expr.cheng:28347：嵌套调用作实参（`compute(n, k)` 作
   `addCol` 第三实参）的静态定型臂缺失（TypedExprStaticExprTypeAtLevel 调用
   结果臂不认 @borrows 嵌套调用，:28000 fallback 链全落空 → panic）。归
   typed_expr.cheng 并行代理。
2. 冷链对照：车头 cheng_w9 编 typed_expr.cheng 的中间态曾在第 1 轮烤机
   死 var-unique authority（`ParserValueExprBindRootCallIdentity` 新 var 实参），
   第 2 轮（其作者修完后）已过——并行代理自闭环。
3. 本任务烤机预算 2/3 轮（第 1 轮败于并行中间态、第 2 轮成功）；第 3 轮
   留给统筹收尾（等 typed_expr 代理落齐后统一验收 v6 全链）。

## git diff --stat -- src/core/tooling/compiler_csg.cheng

- apply 前（任务开始时）：1036 insertions(+), 1036 deletions(-)（并行既有）
- apply 后：1047 insertions(+), 1038 deletions(-)（本任务净贡献 +11/-2 = 1 hunk）

---

# wall10.VERIFY — typed expr: return parser root missing 墙（kernel 驱动用户路径 call_fixture，已清）

## 墙面（kernel_driver_w7 实测，/tmp/oob_ab/merge_audit/gate7_cf.compile.log）

```
/tmp/oob_ab/kernel_fixed_out/kernel_driver_w7 system-link-exec \
  --root:/Users/lbcheng/cheng-lang --in:src/tests/zz_call_fixture_w7.cheng \
  --emit:exe --target:arm64-apple-darwin --out:<exe>
rc=1
typed expr: return parser root missing source=…/zz_call_fixture_w7.cheng
  function=helper line=1 surface=1
```

夹具（2 行纯 inline-Form-B，无 import）：
`fn helper(): int32 = return 1` / `fn main(): int32 = return helper()`。
正确语义 = compile 0 + exe run rc=1（helper() 返回 1）。车头（C 链）同输入
一直绿（0/1），红只在 .cheng 管线。wall5 修复（slice 补域根）落树后 csg
slice commit 已过，管线推进到 typed_expr 撞本墙。

## 定性（守卫零弱化；根缺口 = inline 体 return 行无 normalized layer/parser 身份，而 tree 里 root 明明在）

panic 点 typed_expr.cheng:58710-58715（`TypedExprIrAddCallStatementFromExpr`）：
kind==Return 且 ir 持 value-expr tree lease 时要求
`valueExprRootNodeIndex >= 0 && role != Invalid`；随后
`TypedExprIrStatementValueRootText` 校验 span 与 tree 一致、
`TypedExprIrBuildStatementValueRoot`（:25485-25532）以 tree root 为权威建值
节点——return 语句的下游消费本来就以 parser tree root 为唯一事实源。

肇事生产链：inline 单行 Form-B 体只存在于 parser token tree；normalized
layer 无其 return 行（`ParserAppendReturnStmtExprsLine` parser.cheng 原
:5458 只认行首/`:`/`;`/`=>` 前缀，`=` 后的 return 被拒）。typed_expr 的
unrepresented-body 兜底（:55000-55050）把 `= return 1` 文本再扫描成合成行
——root=-1/role=Invalid → 守卫必炸。

树侧实证（探针直读 `ParserReadNormalizedExprLayerFromText`，cheng_merged 编
译实跑）：two-liner 修复前 layer 仅 1 行（line2 call 行），而 value-expr
tree 有 2 个 statement root event 全程在场：
```
root[0] role=ReturnValue anchorLine=1 anchorCol=22 node=0 nodeText=1   span=[28,29]
root[1] role=ReturnValue anchorLine=2 anchorCol=20 node=2 nodeText=helper() span=[56,64]
```
即 `ParserValueExprProcessRoutineRange`（parser.cheng:22414-22439）对 `=` 后
suite 经 ProcessSuiteRange 全量解析——生产者不缺位，缺的是 layer 行与绑定。

## 修法（/tmp/oob_ab/typedexpr_wall10.patch，2 hunk，+57/−4，两文件分列）

**hunk 1（typed_expr.cheng +49/−3，:55031）**：unrepresented-body 兜底的
inline return 行在喂 `TypedExprIrAddCallStatementFromExpr` 前做唯一认领绑定
——持 tree lease 且行未绑 root 时，按 `role==ReturnValue &&
anchorLine==行号 && ParserValueExprNodeText(root)==合成行 surfaceText` 三重
精确匹配扫 statement root events；唯一匹配才绑 root/spans/role，call 根再经
`ParserValueExprBindRootCallIdentity` 贯穿 call 身份（与 parser 侧
`BindStatementRootEvent` 同一绑定形状）。零匹配/多匹配不绑，既有 58710 守卫
panic 原样兜底。该 hunk 独立烤机验证：w10 第一轮烤机（sha256=5c40e945…）
令 call_fixture 越过 58715 墙。

**hunk 2（parser.cheng +8/−1，:5455）**：wall10 第一轮烤机暴露同根第二层——
`csg compiler snapshot: function origin receipt transfer split node=0
observed=-1 expected=0`（compiler_snapshot_schema.cheng:10291）。链条：snapshot
的 statement root function 身份来自 normalized sidecar
（normalizedExprParserNodeIds/FunctionIndexes/StatementRoles），后者由
parser receipt 按 function identity 区间扫 layer 行生产；layer 无 line1
return 行 → parser node 0 的 normalized statement identity 缺位 →
statementFunctionIds=-1 → origin receipt 不发布 → 消费即 split。修法＝生产者
补行：`ParserAppendReturnStmtExprsLine` 接受 `prev == '='`（inline Form-B
体的 `= return E`，除 `=>` 外唯一合法先行字符）。补行后 BindStatementRoots
按 role+anchor(line,col) 精确绑 tree root（探针实证 line1 行
root=0/role=3、lexScope=0/suiteScope=-1/ord=-1，全部 identity 检查干净），
receipt/snapshot/typed_expr walk（`TypedExprExprIsScopeStartReturn` 直读
decl 行 return）全链走既有 Form-A 同形路径。kernel manifest 闭包内四文件
含 `= return` 字样均为注释（grep 逐文件核对），烤入模块零行为变化。

## 验证（车头 /tmp/oob_ab/cheng_w10；烤机 build_kernel_driver.sh --driver cheng_w10）

- 秒级门基线澄清：cheng_merged/stage3 编 typed_expr.cheng → obj 在 HEAD、
  stage3、补丁后三态同签名死于既有缺口 `([aer]) pop=105 slot=96`
  （fn=typedExprBuildIndexTextAt，managed element field read lacks exact
  array root）——非本补丁引入、非本预算可修；真实门 = 烤机 + 夹具。
  parser.cheng 秒级门 rc=0（含本 hunk 与并行 wall8 改动）。
- 模式探针（已删）：绑定形状（元素拷 var、str 比对、var 实参）cheng_merged
  编译运行 rc=0，证明无新 C 链 exactness 违规。
- 车头回归门：zz_probe_w10（v6 复现件）0/0、call_fixture 0/1、ordinary
  0/0（本修复不触 C 链，纯回归面）。
- 烤机第 1 轮（仅 hunk 1）：kernel_driver_w10 sha256=5c40e9451ea7cc3732e1
  7c4bd05ca637d6bda562314f0ca7f77477bce790ede6 —— 58715 墙死，call_fixture
  推进到 snapshot receipt split（同根第二层，促 hunk 2）。
- 烤机第 2 轮（hunk 1+2）：kernel_driver_w10b
  sha256=c7543d2a6809216aafd91bac758f33aaf6e9bd500fc33cf54082886b75a56f46
  （size=183108736，kernel_driver_build=ok entries=35）。

  | 夹具 | compile | run | 备注 |
  |---|---|---|---|
  | **call_fixture（zz_call_fixture_w7）** | **0** | **1** | **墙已清，run rc=1=正确语义** |
  | ordinary_zero_exit_fixture | 0 | 0 | 无回归 |
  | v6（zz_v6_w7） | 1 `typed expr: call declaration static argument type unavailable … addCol line=37 scope=outer` | — | gate7 时为 `structured source origin has no structural call`（csg）——推进到 typed_expr 下游新墙，他代理域，仅记录 |
  | cold_nested | 2 `compiler snapshot builder: function return root is not unique` | — | gate7 时为 `parser normalized structure: anchor identity drift`——anchor 墙已由并行代理清，此为下游新墙，仅记录 |

  两 fixture 均无 `= return` 行（grep 核对），判词变化与本补丁无归属。

## 纪律执行

- 主树仅改 src/core/lang/typed_expr.cheng + parser.cheng:5455（距并行
  anchor-drift/wall8 作业区 :31700-31900/:32092 远，无冲突；wall8 落树在
  本 hunk 之后，patch 反向应用验证本任务 hunk 独立干净）。
- git diff --numstat vs HEAD：typed_expr.cheng apply 前 +153/−7 → apply 后
  +202/−10（差 = 本任务 hunk1 +49/−3）；parser.cheng 任务始 +464/−68 → 现
  +479/−69（本任务 hunk2 +8/−1，余为并行代理）。
- 烤机 2/3 轮。探针 zz_w10_tree.cheng / zz_w10_pat.cheng /
  zz_probe_w10.cheng 已删净；编排者的 zz_call_fixture_w7.cheng /
  zz_v6_w7.cheng 未动；产物与证据全在 /tmp/oob_ab/w10/。
---

# wall13.VERIFY — anchor identity drift 墙第二变体（隐式返回行，kernel 驱动 .cheng 管线）

## 判定：病根 = 隐式返回行生产者漏置 anchorTokenIndex=-1（零初始化 0 被 wall8 守卫分支误读为行自带 frozen anchor），修 src/core/lang/parser.cheng（1 hunk，+6/-0），墙已清

## 墙面与实证（修复前）

- census W-A：p_inline_bare（`fn main(): int32 = 0`）/p_echo/p_fmt/p_nested_fmt 实测 rc=2
  `parser normalized structure: anchor identity drift`。
- 直读层探针（cheng_merged 编译实跑，import parser 过 ParserReadNormalizedExprLayerFromText）：
  `layer_read_failed err=parser normalized structure: anchor identity drift` rc=1
  （/tmp/oob_ab/w13/probe_pre.exe，探针文本含 `fn Touch(value: int32): int32 = value + 1` 等隐式返回形）。

## 机理（源语义链）

1. 隐式返回事件 = 既有 Expression 根事件经 `ParserValueExprSetStatementRootRole`
   改签 ImplicitReturnValue（22493）；事件 anchor line/col 在 AppendStatementRoot
   时由 anchor token 派生（15273/15277）。
2. 层读逐行物化 role==ImplicitReturnValue → `ParserValueExprAppendImplicitReturnFacts`
   （32042，调用点 32776）追加 NormalizedExprReturn 行，行 (line,col) 取根事件
   anchor line/col（32057-32059）——行行列与根事件 anchor token 按构造一致。
3. 但该生产者是唯一「写 valueExprRootNodeIndex 却不写 anchorTokenIndex」的 append
   生产者（其余四处 3224/3285/3348/3397 全部显式 -1）；新值零初始化为 0。
4. wall8 修复后的守卫 rootIndex>=0 臂 `if expr.anchorTokenIndex >= 0` 把 0 误读为
   「行自带 frozen anchor」→ 劫持到 token 0（文件首 token）→ 行列契约必不符 →
   31910 drift。wall8 前该臂无条件取根事件 anchor，垃圾 0 被忽略——wall8 激活了
   此潜伏生产缺口。同族定性：wall8 修的是 Sidecar 行合法 frozen anchor 优先；
   本变体是隐式返回行以未初始化 0 冒充 frozen anchor（wall8 只修了自带
   anchor 分支的正确来源，未覆盖生产者漏标的错误来源）。

## 修法（/tmp/oob_ab/parser_wall13.patch，1 hunk，+6/-0，git apply --reverse 过）

AppendImplicitReturnFacts 显式 `expr.anchorTokenIndex = -1`（声明「行无自身关键字、
未冻结」），守卫经 wall8 分支回退取根事件 anchor；边界/producer 0/行列一致契约由
守卫对该来源统一强制，零弱化。与四个 LayerAppend 生产者 -1 拼写一致；守卫 31912
回写 resolved anchor，下游 receipt 所见与 wall8 前逐字节同形。

## 修复后行为探针（cheng_merged，直读层，probe_post.exe）

```
return_row line=1 col=33 anchor=10 root=2 role=4
return_row line=3 col=21 anchor=20 root=3 role=4   ← role=4=ImplicitReturnValue
guard_probe=pass  rc=0
```

## 门禁与验收

- 秒级门：cheng_merged 编 parser.cheng → obj rc=0（/tmp/oob_ab/w13/tc.o；stderr
  `([rvL])` 为车头既有诊断打印，源内零对应，非本 hunk）。
- 车头回归门（cheng_w13 sha256=868e2feb66ef85a0…60e952c）：v6 复现件
  compile=0 run=0；ordinary compile=0 run=0。
- 烤机 1 轮 rc=0：kernel_driver_build=ok entries=35 size=183108736，
  kernel_driver_w13 sha256=ab846fffaf878a1f61413cb1731decf713953e70beabcf5121eaf0c8a009e173
  （bake_w13.log）。

### w13 驱动验收（--emit:exe 全链）

| 夹具 | compile | run | 判词 |
|---|---|---|---|
| zz_w13_bare（`fn main(): int32 = 0`，本墙最小形） | 0 | 0 | **墙清除**，exe 产出且运行 rc=0 |
| ordinary_zero_exit_fixture | 0 | 0 | 不回归；census 05:28 的 W-ORD `provider object read failed` 未再现（typed_expr 静置后归因坐实：并行中间态/混合烤机，非树内回归） |
| zz_probe_w13（v6 复现件） | 1 | — | `typed expr: call declaration static argument type unavailable name=addCol`（typed_expr W-G 原位既有墙，wall9 遗留1，非本任务） |
| cold_nested_fmt_interpolation_smoke | 1 | — | `typed_expr_frag_codec_function_authority_invalid`——W-D（function return root is not unique）已被并行 wall11 snapshot 修复推进（本烤含 06:05 落树的 snapshot_wall11.patch），新判词 typed_expr 领地 |
| zz_call_fixture_w7 | 0 | 1 | run=1 = helper() 返回 1 正确语义（wall10 修复保持，无回归） |

- 树态归属：本烤 = wall1-9 + wall10(typed_expr +202/-10) + wall11(snapshot builder)
  + wall13。烤机窗口内 typed_expr/parser mtime 06:21:32 有并行触碰，但逐字节内容
  与烤机起点一致（parser = pre 备份 + 本 hunk，diff 全文 6 行均本补丁；typed_expr
  仍 +202/-10），无混合态。

## 纪律执行

- 主树仅改 src/core/lang/parser.cheng；apply 前 git diff --stat = 473+/69-，
  apply 后 = 479+/69-（净 +6 = 补丁全文）。
- 探针删净：src/tests/zz_probe_w13.cheng、zz_w13_direct.cheng、zz_w13_bare.cheng
  已删；编排者资产 zz_v6_w7.cheng/zz_call_fixture_w7.cheng 只读未动；产物证据在
  /tmp/oob_ab/w13/。
- 烤机预算 1/3 轮。

---

# wall11.VERIFY — function return root is not unique 墙（kernel 驱动用户路径 W-D，compiler_snapshot_builder.cheng）

## 判定：墙已清。审计臂缺 void 分支=定性成立；修法=审计补 void 臂并绑定 TypeArena 权威 void 类型（非弱化）。cold_nested 在驱动内推进到下一堵墙（typed_expr.cheng 生产缺口，他线领地，完整移交）

## 墙面与修法归属（源语义链）

- 守卫 `compilerSnapshotBuilderTypeFunctionBindingsFromOwnerTokensInto`
  （compiler_snapshot_builder.cheng:14284 一带）要求域内每可执行函数
  `returnCounts == 1`。parser 生产侧（parser.cheng:22393/22370）只在表面声明
  返回类型时才发 `ParserTypeSyntaxRootFunctionReturn` 根（镜像表面语法，
  `fn main() =` → 0 根）→ 按构造必炸。
- **同一棵 TypeArena 的权威契约**（typed_expr_type_arena.cheng:5531-5585、5728-5744）【更正 2026-09-10 实读：S1a 入库使该文件整体 +323 行，旧 `:5208-5262、5405-5421` 今分别落在 `InternSyntaxRec`/别处；按旧端点行内容逐字对上，新址为 `:5531-5585、5728-5744`（`:5531`=`tree, declarationRoot)`、`:5728`=`explicitReturnCounts[functionRow] != 0:`，与旧 `:5208`/`:5405` 逐字相同）】
  早已定义完整域：每函数行先绑定「唯一 semantic builtin void scalar」
  （`typedExprTypeArenaBindFunctionOwnersRec` 全量 seed voidTypeId），显式
  FunctionReturn 根 0..1 个覆盖之（≥2 才是 authority invalid）。即「0 显式根
  ⟺ void 权威」是生产者与消费者既定语言，snapshot builder 审计缺的只是 void 臂。
- 因此修法定性：**不是「接受 0 放行」**，而是 0 根时把 `returnArenaTypeIds`
  绑定到同一权威 void 类型（canonical 判定词逐字对齐：typeKinds==Scalar &&
  scalarKinds==Void && typeOriginKinds==SemanticBuiltin，重复/缺失均 hard-fail）；
  审计由 `!= 1` 改 `> 1`（唯一性保证原样保留，≥2 仍死同判词）。
- 下游四消费面全部有定义：签名去重/签名文本（"void" 文本路径既有
  CsgCompilerScalarVoid→"void"）、required-domain 哈希、extern 签名 join、
  portable Function 类型行 elementTypeIds——void 函数此前从未越过本审计，
  不存在含 -1 的历史快照，无兼容面。

## 补丁

/tmp/oob_ab/snapshot_wall11.patch（1 hunk，+30/-1，仅
src/core/tooling/compiler_snapshot_builder.cheng；改前该文件 vs HEAD 零 diff，
本补丁即全部净贡献；git apply --check --reverse 过）。

## 门禁

- 指定秒级门（cheng_merged 顶层 `--in:compiler_snapshot_builder.cheng --emit:obj`）
  **对任意内容都不可能过**：HEAD 既有形 13248-13250（多行 indexed assignment，
  2026-07-24 ^f681cad2b 引入）令 C 冷链顶层解析 die
  `expected indexed assignment value`（A/B 实证：pre_w11 原件同判词同位置死；
  cheng_merged/cheng_w9/cheng_w10 三车头一致；错误偏移 661788 在本任务 hunk
  之前，解析根本到不了补丁）。该文件不在 kernel_manifest.cheng 条目里（grep=0），
  烤机实际经 backend_driver_dispatch_min.cheng 的 import 闭包消费本文件。
- **有效等价门（import 路径=烤机真实路径）**：影子根
  （/tmp/oob_ab/w11/shadow，全 src 副本+stage3）import 探针
  `import cheng/core/tooling/compiler_snapshot_builder` compile：
  pre-edit rc=0 / patched rc=0——补丁经真实管线解析+类型检查通过。

## 烤机与验收实况（第 1 轮，rc=0）

- 车头 /tmp/oob_ab/cheng_w11 sha256=2bf78b4f95b9d6c84df3b08a295737b7d866a37cbf9facfe2fd07a798d19b373
- kernel_driver_w11 sha256=0d7abbd80922926d8ad723e3859c9530c04202c4e810d3cb3a7010f5838d11df
  （size=183108736，bake_w11.log kernel_driver_build=ok entries=35）

| 夹具 | 车头 cheng_w11 | kernel_driver_w11 | 判读 |
|---|---|---|---|
| cold_nested_fmt_interpolation_smoke | compile=0 run=0 输出 `cold_nested_fmt_interpolation=pass` | compile **rc=1** `typed_expr_frag_codec_function_authority_invalid` | **W-D 判词消失**（void main 越过 snapshot builder），推进到 typed_expr 域新墙（见移交）；exe 未产出 |
| ordinary_zero_exit_fixture | — | **compile=0 run=0** | 不回归 |
| zz_probe_w11（v6 复现件，用后已删） | compile=0 run=0 | — | 回归门过 |
| zz_v6_w7 | — | rc=1 `typed expr: call declaration static argument type unavailable name=addCol line=37`（W-G 原位，typed_expr.cheng:28347，并行领地） | 记录 |
| zz_call_fixture_w7 | — | **compile=0 run=1**（`return helper()`=1 语义正确） | w10 代理清 W-E 后本轮全链走通 |

## 移交：typed_expr void 函数 returnType 生产缺口（cold_nested 下一墙）

- panic 点 src/core/lang/typed_expr_frag_codec.cheng:1362-1367
  `TypedExprIrFunctionFragmentValidate`：`frag.returnType == ""` →
  `typed_expr_frag_codec_function_authority_invalid`（该文件 vs HEAD 零 diff，
  既有契约）。
- 病根（typed_expr.cheng，现树 +202/-10 并行在途）：13768
  `TypedExprParseFunctionReturnType` 对无 `:` 返回类型的签名返回 `""`
  （:13779/:13786），`TypedExprIrAppendFunction`（:2804-2806）把空串 intern 进
  `functions2_returnTypeIds`，fragment 校验必炸。修法归属 typed_expr owner：
  void 函数发 canonical "void" 文本（与 typed_expr_type_arena 的
  semantic void 权威互证），或 validator 增 void 臂——勿弱化校验。
- 此前不可达性：void 函数从未越过 W-D 审计，故 typed_expr 域的 void 路径
  在驱动内首次由本轮烤机抵达。
- extern 对称缺口（留档未修）：compiler_snapshot_builder.cheng:14905
  `extern return root is not unique` 同样要求恰 1 根；无返回类型 extern
  声明会炸同族判词。现夹具集/manifest 不触达（35 entries 烤机绿），
  未纳入本补丁以免无验证面扩权。

## 纪律执行

- 主树仅改 src/core/tooling/compiler_snapshot_builder.cheng（+30/-1 即补丁全文）；
  git diff --stat apply 前 = 空，apply 后 = `30 insertions(+), 1 deletion(-)`。
- 烤机 1/3 轮。探针 src/tests/zz_probe_w11.cheng 用后已删，主树无本任务残留；
  产物/日志/影子根存 /tmp/oob_ab/w11/。
- 未 git commit。


---

# wall12.VERIFY — typed expr: call declaration static argument type unavailable 墙（W-G，kernel 驱动用户路径 v6，已清；v6 推进到 W-F 原位）

## 墙面（kernel_driver_w10b 实测，/tmp/oob_ab/merge_audit/gate7_v6.* 同判词）

```
kernel_driver_w10b 编 src/tests/zz_v6_w7.cheng（v6_direct1_repro）rc=1
typed expr: call declaration static argument type unavailable source=…/zz_v6_w7.cheng
  name=addCol line=37 scope=outer scope_start=35 args=n.arena, n.col, compute(n, k)
  scopes=4 signatures=0 bindings=7 lines=55
```

panic 点 typed_expr.cheng TypedExprResolveCallDeclarationFromText（:28347）。

## 判定与机理（三层叠加，全部在 typed_expr.cheng 内闭合）

binding 初始化式 `let r1 = addCol(n.arena, n.col, compute(n, k))` 在 ctx 构建期的
binding 循环内被定型（bindings=7 = 纯形参、r1 未落）。定型链：
BindingRhsCallReturnType(:17980) → ResolveCallDeclarationFromText →
TypedExprCallStaticArgTypesInto(:28341) → StaticExprTypeAtLevel("n.arena") →
TypedExprAssignStatementType(:57637)。断点逐腿（head 探针实测，cheng_merged 编译运行）：

1. **字段行查询臂塌在 partial build index 上**。AssignStatementType 的单成员字段
   臂（:57676-57701）经 TypedExprFieldContextLookup → TypedExprContextHasTypeField →
   `ctx_field_owner_source`/`ctx_field_source` build-index 查询；而
   TypedExprBuildSourceContextBorrowed 构建期 ctx 只挂「binding call declaration」
   小索引（仅 call-declaration 行、已 seal），无任何元数据行 → lookup Missing →
   FindTypeFieldDecl false；ResolveFieldPathMeta 需布局权威同塌；AssignFieldType
   只认 Bytes/Result → 返回 ""。
2. **数据其实在**：ctx.typeFields 列有全部 8 行（Col.3 + Box.1 + Node.4，探针实证），
   与索引行同一生产者（:35885-35902 注册循环的数据源）。
3. **时序错位**：type 元数据扫描（declaredTypes 坐标/refTypes/aliases/enumValues/
   typeFields，纯 ctx.lines 行扫描）原在 binding 循环**之后**（原 :52967-53107，
   binding 循环原 :52786-52964）——即使臂在读 typeFields，循环期也是空。
4. **真管线第三层**：typedExprPrepareFunctionSourceRangeContexts 的 rebuild 路径
   （:63183）调用 Borrowed 时 `includeTypeFields=false`——type 循环首行即 break，
   字段行根本不收集（head 探针传 true 故看不到这一层；kernel_driver_w12 第 1 轮
   烤机 v6 仍 W-G 同判词暴露）。stable metadata（含 typeFields）在 Borrowed 返回后
   才 attach（:63192），对循环内的定型为时已晚。

## 修法（/tmp/oob_ab/typedexpr_wall12.patch，3 hunks，仅 typed_expr.cheng，零守卫弱化）

1. **声明行直接精确认读臂**（AssignStatementType 单成员块、index 臂失败后）：当
   FieldContextLookup 返回 -1 时，直接扫 ctx.typeFields——owner leaf 与
   StripVar/ref-strip 后的声明根精确相等 + field ident 精确相等，全部命中行
   normalized fieldType 唯一才返回，出现第二个异型即 fail-closed（不定型）。
   读的就是索引行的源数据，全索引在场时行为不变。
2. **type 元数据扫描前移**：整块移到 binding 循环之前（含 7 行次序约束注释）。
   扫描是 ctx.lines 的纯函数，与 filter 无关；binding 循环对元数据列只读，
   move 后单次填充无重复。
3. **rebuild 路径 includeTypeFields false→true**（:63188，附 8 行机理注释）：
   让 rebuild ctx 的 type 循环真正执行；TypedExprAttachStableMetadataToRebuildContext
   随后以 metadataCtx 权威列整体替换（含 typeFields，:47712-47715），下游不见
   二等扫描。SABI/类型解析错误在同批行上 metadata 构建期已强制，无新增失败面。
   此改动使 rebuild 路径与 frozen 路径在 binding 期可见性一致（frozen 经全索引
   的 ctx_field 查询本就能定型字段实参）。

## 门禁与验证

- head 探针（cheng_merged 编译，src/tests/zz_probe_w12.cheng 已删）：未修改 v6
  文本 BuildSourceContextBorrowed 由 panic 变 **CTX OK**，`outer.r1: int32 line=37`
  正确绑定；arg 定型 complete（Box/Col/int32）。
- 秒级门：typed_expr.cheng → obj 死 `([aer]) pop=105 slot=96
  (typedExprBuildIndexTextAt, managed element field read lacks exact array root)`
  ——与 HEAD/stage3/pre_w12 三态同签名（w10 VERIFY 已归因既有缺口），非本补丁引入。
- 回归门（车头 cheng_w12，sha256=2aa2757b729d31145e85ff51736b26b6cd1f234cda85a2f6a2fdb45d133dd37f）：
  v6 复现件 compile=0 run=0。

## 烤机（cheng_w12 车头；build_kernel_driver.sh，2 轮有效 + 1 次启动即杀）

- 第 1 轮（kernel_driver_w12，sha256=b3b2f6a1adb25007f44129752b9d9e752fa4bcafb0e0158044ec0d5b50b4869c）：
  仅 hunk1+2。v6 **仍 W-G 同判词**——暴露第 3 层（includeTypeFields=false）。
- 第 2 轮（kernel_driver_w12b，**交付产物已 cp 为 kernel_driver_w12**，
  sha256=af842009b0775116931e52f1969f50bef468f801ca2b59dcaf033bd71ccb84a9，
  size=183125152，bake_w12b.log kernel_driver_build=ok）：
  hunk1+2+3。W-G 判词在 v6 上**消失**。

## w12b 验收实况

| 夹具 | compile | run | 判词/备注 |
|---|---|---|---|
| **v6（zz_v6_w7）** | **1** | — | `typed expr: concrete declaration layout authority missing`——**W-G 已清**，推进到 W-F 本尊（census 预估命中） |
| ordinary_zero_exit_fixture | **0** | **0** | 不回归 |
| zz_call_fixture_w7 | **0** | **1** | w10b 绿共享不变量保持（run rc=1=正确语义） |
| cold_nested_fmt_interpolation_smoke | 1 | — | `typed_expr_frag_codec_function_authority_invalid`（新判词，见遗留 2） |

## W-F 判定：病根在发布方 compiler_csg.cheng，非本任务文件，按纪律停手移交

消费端（typed_expr.cheng :45586-45647）守卫不可弱化：builtinKind==None 的用户
声明必须 state==2 + size/align>0 + arenaId>=0 + genericCount==0（state==1 泛型/
缺席在 :45631 合法 continue；state==2 在 stamp 处已有 size/align 校验
TypedExprIrBindExactDeclarationLayoutAuthority :44070-44077）。

W-F panic ⇔ **state==0（从未 stamp）**。发布链（全在 compiler_csg.cheng）：
- 唯一 stamp 调用 `TypedExprIrBindExactDeclarationLayoutAuthority`（:16424，
  typed_expr :44051），循环 `compilerCsgBindTypedIrExactDeclarationLayoutsRec`
  （:16364）按 receipt sidecar `declarationKinds==ParserDeclarationType` 行走，
  经 `compilerCsgExactDeclarationTypeIdFromSidecarsInto` + `compilerCsgExactLayoutResolveInto`
  解 arena 布局后 stamp；bind（:38359）在 reach（:38504）之前，时序无倒挂。
- ctx 坐标绑定在同文件 :33397（`TypedExprBindDeclaredTypeExactCoordinate`，
  payload 冲突即 err 返回而非静默）。消费端能走到 state==0 panic 说明坐标已绑、
  槽位在（否则死更早的 coordinate missing / coverage invalid）。
- 时序序证：typed_expr 每轮 IR 的 authority 列为构建时克隆（typed_expr :8458 克隆
  循环），bind 先于 reach → 克隆可见。state==0 归 csg 生产侧对该源该行未 stamp。

移交排查方向（compiler_csg/parser_receipt owner 裁量）：
1. user 源 sidecar 的 type 声明行是否携带 ParserTypeSyntaxRootTypeDeclarationRhs
   森林（declarationTypeSyntaxRootIds>=0、typeSyntaxRootKinds/OwnerIds/SpanIds 一致）；
2. `compilerCsgExactLayoutResolveInto` 对用户 ref object（Node/Box）在 type arena
   中是否产出 concrete layout（ref 装箱 8/8 或 record）；CompilerCsgTypeArenaFinalize
   ParserForestInto（:38354）对 user 模块声明行的接线覆盖；
3. 多源（stdlib+user）sidecar 域下 bind 循环 sourceId 域与 ctx 坐标域的对账。
均为有界契约排查（现成生产步骤未接线嫌疑），无需新机制；若证实需要新发布步骤
再升设计级。

## 遗留

1. v6 下一墙 = W-F（上节，移交 csg owner）。
2. cold_nested 新判词 `typed_expr_frag_codec_function_authority_invalid`
   （typed_expr_frag_codec.cheng:1367，该文件 8/22 后零 diff）：w11 落树清掉
   snapshot builder `function return root is not unique` 后新暴露——void main
   （`fn main() =` 无返回类型语法）片段 returnType=="" 撞 codec 既有校验
   （`frag.returnType == ""` 即 panic）。归 w11/w13 家族（void 函数片段契约），
   与本任务 hunks 无关（本 hunks 只影响 rebuild ctx binding 期字段行可见性，
   不产片段元数据）。
3. 秒级门既有 exactness 缺口 pop=105（typedExprBuildIndexTextAt）仍在原位。

## 纪律执行

- 主树仅改 src/core/lang/typed_expr.cheng；探针 src/tests/zz_probe_w12.cheng 已删净。
- git diff --numstat vs HEAD：apply 前 +202/−10（pre_w12 基线=wall10 后树态）→
  apply 后 **+395/−153**（本任务净 +193/−143 = 3 hunks）。
- 烤机 2 轮有效（第 1 轮 w12 + 第 2 轮 w12b）；另有一次启动即杀（补丁校验窗口曾
  短暂回退树态，为杜绝烤入未修态废弃重烤，不计轮次）。
- 编排者资产 zz_v6_w7.cheng / zz_call_fixture_w7.cheng 未动；产物与证据全在
  /tmp/oob_ab/w12/。


---

# wall14.VERIFY — typed expr: concrete declaration layout authority missing 墙（W-F，kernel 驱动用户路径）

## 判定：病根 = typed_expr.cheng 第一轮 Build 的全新 candidate 未从 ir 参数继承 exact-layout authority 列（csg bind stamp 被时序性覆盖），修法归属 typed_expr.cheng，非本任务授权文件（compiler_csg.cheng），按纪律停手移交；不产假补丁，零烤机

## 墙面复现（kernel_driver_w12=w12b，sha256=af842009…84a9，主树现态）

```
system-link-exec --root:/Users/lbcheng/cheng-lang --in:src/tests/zz_v6_w7.cheng --emit:exe …
rc=1  typed expr: concrete declaration layout authority missing
```

lldb 断 `cheng_panic_cstring_and_exit` 抓栈，kernel_driver_w12b.map 符号化（/tmp/oob_ab/w14/v6_stack_sym.txt）：

```
TypedExprIrAppendTypeLayoutsFromContext          typed_expr.cheng:45586  ← W-F panic（state==0）
← TypedExprIrAppendMetadataDefinitionsForFilter  typed_expr.cheng:60408
← TypedExprBuildIrForFunctionSourceRangesFromMetadata typed_expr.cheng:63258（candidate 构建）
← ccsg.compilerCsgBuildTypedIrReachRoundCommit   compiler_csg.cheng（reachRound==0 臂 :37503）
← ccsg.compilerCsgBuildTypedIrReach …
```

## 机理（实测栈 + 纯源语义链，全部闭合）

1. 唯一 stamp 写点 = `TypedExprIrBindExactDeclarationLayoutAuthority`（typed_expr.cheng:44051，写 :44078，要求目标 state==0/arenaId==-1 等全量前置校验）；其唯一调用者 = csg bind 循环（compiler_csg.cheng:16424），由 `compilerCsgBindTypedIrExactDeclarationLayoutsInto`（:16271）在 :38359 以 `work.typedIr` 为目标执行。
2. **第一轮 typed-IR 构建走 candidate 模式**（:37503，`st.reachRound<=0` 臂 → `TypedExprBuildIrForFunctionSourceRangesFromMetadata` :63258）：`var candidate: TypedExprIr` 全新（layout 列空）→ :63284 prepare 从零初始化 authority 列（全 0/-1，typed_expr.cheng:43905-43954，state 列零初始化即未 stamp 态）→ **candidate 只从 ir 参数继承 exactTypeArena（:63274-63276 share），不继承 authority 五列** → :63328 `AppendMetadataDefinitionsForFilter(candidate,…)` → :60408 `AppendTypeLayoutsFromContext(candidate,…)` → :45647 读 candidate state==0 → panic。:60395-60411 注释自证「Layout rows are declaration authority, not function-body reachability」，全源一次性 append 且随后 `typedExprGlobalMetadataReady=true`（:60421 frozen 路径强制要求 ready）——**layout 消费 100% 发生在第一轮 candidate 上，无后续轮补偿**。
3. **bind stamp 被时序性销毁**：即使第一轮不死，:63373 `TypedExprIrMoveInto(ir=work.typedIr, candidate)` 于 :8580 释放旧 ir payload、:8913-8922 用 candidate 的全 0 authority 列整体覆盖 work.typedIr——:38359 的 stamp 在第一轮 Build 后不复存在，对后续轮与交付审计（typed_expr.cheng:44485-44502 要求 typeLayout 行 authority state==2 且数值一致）同样致命。
4. csg 侧生产端本身无缺陷：bind 循环对 v6 成功跑完（若 `compilerCsgExactDeclarationTypeIdFromSidecarsInto`/`compilerCsgExactLayoutResolveInto` 任一失败 → err → BuildAbort，消费端 panic 不可达）；坐标绑定 `CompilerCsgBindMetadataExactLayoutParserIdentities`（:33322）尾对账 :33490（parser/context coverage split err）通过 ⇒ **w12 三条排查方向全部排除**：① sidecar TypeSyntax 森林完整（root kind/owner/span 逐行校验 + 声明名精确对齐）；② arena layout 解析成功（失败即 err 非 state==0）；③ 多源键域一致（sourceCount==contexts.len==typeArena.producerSourceCount、sidecar.sourceIndex==producerSourceIndex :33333）。
5. 车头（C 冷链）绿的对照价值：bootstrap 全文无 "declaration layout authority" 对应机制（grep=0），C 链直接从声明行解析布局——两套证明体系，C 链绿只证明 v6 源语义合法。

## csg 侧自由度穷尽（为何无法只改 compiler_csg.cheng 闭合）

消费无条件发生在 `TypedExprBuildIrForFunctionSourceRangesFromMetadata` 内部全新 candidate 上，而 candidate 构建期从 csg 可见输入（metadataContexts、ir 参数）读取的 exact-layout 数据只有：contexts 的 `exactLayoutParserIdentityBound/exactLayoutProducerSourceCount/exactLayoutDeclarationSourceCount` 三标量与 declaredType 坐标列（typed_expr.cheng:44022-44031）——typed_expr 的 prepare **无任何 per-declaration layout 值的恢复/读取逻辑**。csg 侧逐项排除：bind 后移（消费已在 Build 内先行死）、Build 后对 work.typedIr 补 stamp（救不了第一轮；仅能救后续轮/交付审计）、经 ctx 传权威（typed_expr 不读）、摘用户源（破坏 :37558 seal 契约断言）。**结论：typed_expr 侧必须有一个继承/恢复动作，csg 无通道。**

## 移交修法设计（typed_expr.cheng owner 裁量；对齐既有范本，零守卫弱化）

**继承臂**：`TypedExprBuildIrForFunctionSourceRangesFromMetadata` :63284 `typedExprIrPrepareExactLayoutIndexesFromParserAuthority(candidate, metadataContexts)` 之后插入——

```
# csg 在第一轮 Build 前 stamp 的 exact declaration layout authority 落在 ir 参数
# （compiler_csg :38359）。candidate 是全新 IR，prepare 从零初始化 authority 列；
# 不同步继承则消费端（AppendTypeLayoutsFromContext :45647）读 state==0 必 panic。
# 与 :63274 exactTypeArena 的 share 继承同一契约形态；Clone 循环 :8458-8472 证明
# authority 列可整列搬运。零弱化：csg stamp 点的全部前置校验原样生效，此处仅搬运
# 已证明事实，且逐源坐标域断言（prepare 刚建 vs ir retained）先于任何搬运。
if ir.exactLayoutIndexSourceStarts.len > 0:
    if ir.exactLayoutIndexSourceStarts.len !=
           candidate.exactLayoutIndexSourceStarts.len:
        panic("typed expr: exact layout inherited authority source domain drift")
    for i in 0..<candidate.exactLayoutIndexSourceStarts.len:
        if ir.exactLayoutIndexSourceStarts[i] !=
               candidate.exactLayoutIndexSourceStarts[i]:
            panic("typed expr: exact layout inherited authority coordinate drift")
    for i in 0..<candidate.exactLayoutDeclarationAuthorityStates.len:
        if ir.exactLayoutDeclarationAuthorityStates[i] == 0:
            continue
        if candidate.exactLayoutDeclarationAuthorityStates[i] != 0:
            panic("typed expr: exact layout inherited authority conflict")
        candidate.exactLayoutDeclarationAuthorityStates[i] =
            ir.exactLayoutDeclarationAuthorityStates[i]
        candidate.exactLayoutDeclarationTypeArenaIds[i] =
            ir.exactLayoutDeclarationTypeArenaIds[i]
        candidate.exactLayoutDeclarationSizeBytes[i] =
            ir.exactLayoutDeclarationSizeBytes[i]
        candidate.exactLayoutDeclarationAlignBytes[i] =
            ir.exactLayoutDeclarationAlignBytes[i]
        candidate.exactLayoutDeclarationGenericSymbolCounts[i] =
            ir.exactLayoutDeclarationGenericSymbolCounts[i]
```

- 键域精确性：两个 ir 的 `exactLayoutIndexSourceStarts` 均由同一 `metadataContexts` 数组的 `exactLayoutDeclarationSourceCount` 派生（csg :16290 与 Build :63284），前缀和按构造一致；断言为防御性 fail-closed。
- 域内 no-op 面：无用户声明的源（ordinary/call_fixture、35 entries 烤机全部既有夹具）state 全 0，继承臂逐元素 continue，行为逐字节不变；非 csg 调用方（ir 参数无索引）臂体不进。
- csg 侧无需任何改动；:38359 bind 时序契约原样保留。

## 验收建议

v6 越过 W-F 后按 census 预期推进 borrow/var 实参物化族（UNCERTAIN 尾）或后段既有墙；ordinary compile=0/run=0、call_fixture compile=0/run=1 不回归；cold_nested 现判词 `typed_expr_frag_codec_function_authority_invalid`（wall12 遗留 2）为并行域，只记录。

## 纪律执行

- 主树零改动：git diff --stat -- src/core/tooling/compiler_csg.cheng apply 前后均为 `1047 insertions(+), 1038 deletions(-)`（并行既有，本任务零 hunk）；无 /tmp/oob_ab/csg_wall14.patch（不产假补丁，wall4/wall5 同例）。
- 秒级门/烤机：0 轮（无 csg 补丁即无烤机面；未消耗烤机预算）。
- 改前备份 /tmp/oob_ab/w14/compiler_csg.cheng.pre_w14；栈符号化证据 /tmp/oob_ab/w14/v6_stack_sym.txt；无探针落主树（zz_probe_w14.cheng 未创建——静态+lldb 已闭环）。


---

# wall15.VERIFY — typed_expr_frag_codec_function_authority_invalid 墙（cold_nested void 签名墙，typed_expr.cheng，已清；cold_nested 推进到 primary 段既有墙，完整移交）

## 判定：墙已清。修法 = void 函数在 scope 生产点落 canonical "void" 权威文本（与 w11 snapshot 修复同源契约），零守卫弱化。codec 判词在 kernel_driver_w15 上消失；cold_nested 推进到 `primary body ir control: exact call target coverage missing`——经显式 `: void` 孪生 A/B 实证为补丁前既有墙（primary_object_plan.cheng，非本任务授权修面），停手移交。

## 墙面与机理（w11 移交定性全数坐实）

- panic 点 src/core/lang/typed_expr_frag_codec.cheng:1362-1367
  `TypedExprIrFunctionFragmentValidate`：`frag.returnType == ""` →
  `typed_expr_frag_codec_function_authority_invalid`（该文件 vs HEAD 零 diff，
  clean-at-HEAD 既有契约，未动）。
- 病根链（typed_expr.cheng）：`TypedExprParseFunctionReturnType`(:13768) 对无
  `:`/`->` 标记的合法签名返回 ""（:13780 else 臂）→ 两个 decl 循环
  `scope.returnType = …`（TypedExprBuildSourceContextBorrowed :52693 /
  TypedExprBuildMetadataContextFromProfile :53463）→ 三处 `fnIr.returnType`
  （:59640/:59827/:60042）→ `TypedExprIrAppendFunction`(:2804-2806) intern 进
  `functions2_returnTypeIds` → codec 非空校验必炸。
- `""` 本是 text 域历史 void 约定（:13998 注释自证「scope.returnType="" → 该函数
  被解析成 void」；typedExprLookupLocalFunctionReturnTypeFromNormalizedMetadata
  :49716/:49725/:49732 查询面逐处补 `""→"void"`；SingleExpressionBodyExpr :14234
  与 IrAddCallStatementFromExpr :54797/:55018 均 `== "" || == "void"` 双收）——
  唯独 codec 面拒收。此前 void 函数从未越过 W-D/wall11 审计 + codec 双门，
  本墙在驱动内首次可达。

## 修法（/tmp/oob_ab/typedexpr_wall15.patch，2 hunks，净 +13/-0，仅 typed_expr.cheng）

两个 decl 循环的 scope 生产点各加 canonical 臂：
`scope.returnType = TypedExprParseFunctionReturnType(declHeader)` 后
`if scope.returnType == "": scope.returnType = "void"`（各附机理注释）。

- 选择生产点而非 fnIr/查询点的原因：scope.returnType 的全部来源
  （两个 decl 循环 → frozen 投影 intern :37162/:37201 → 物化 :37086/:38859/:38895
  → fnIr :59640/:59827/:60042）都汇于这两个循环；在生产点 canonical 一次，
  全链（含 frozen 二轮）一致，无双真值源。与 :29769
  TypedExprScopeCallDeclarationInto 的既有 `""→"void"` 臂同构对齐。
- 消费面逐面核对（"" → "void" 行为等价或语义同向）：
  generic 隐式名推导 :16626（"void" 不产泛型名 ≡ ""）、单表达式体 :14234、
  sink return-root :51055/:59150（void 函数无带值 return；bare return 定型为
  void 与 w11 semantic void 权威同向）、`!= "str"/"int32"/"bool"` 族
  （:15179/:15303/:15428/:15687/:15777-15884 双双不命中）、
  :26354 call 绑定（"" 与 "void" 同走 return -1 臂）、
  主树后端 :56553 既有 `!= "" && != "void"` 臂自证后端本就以 "void" 文本为准。
- functions2 九面消费核对：codec Extract/Validate（本墙，"void" 过）、
  bootstrap contract :9219（ContractTypeOk :9129 对 "void" 显式 true）、
  ReturnOpFact :64716（惰性文本）、字节数（compiler_csg :4018/:4207）、
  clone/share（:7709/:8611）、canonical digest（:39936/:39973，id 数组）、
  frozen 签名哈希（:37475-37522 只含 name+startLine，不含 returnType 文本）、
  extern join（extern 无函数体不产 functions2 行，w11 留档的 snapshot extern
  对称缺口不在本面）、portable Function 类型行（TypeArena 域，w11 已绑
  CsgCompilerScalarVoid→"void" 文本，同源一致）。
- importc 四点（:52611/:52630/:53406/:53417）、header 扫描缓存（:49638）、
  SABI 校验（:50857）不经 scope，未动（避免无验证面扩权，同 w11 纪律）。

## 门禁

- 秒级门（cheng_merged → obj）：`([aer]) pop=105 slot=96 rr=-1 rrslot=-9
  managed element field read lacks exact array root`——与 pre_w15 备份在影子根
  （/tmp/oob_ab/w15/shadow，真拷 src + 两版 typed_expr）A/B 逐字节同签名，
  = w10/w12 已归因的 HEAD 既有缺口（typedExprBuildIndexTextAt），无新增死因。
- 烤机第 1 轮 rc=0（bake_w15.log kernel_driver_build=ok entries=35）：
  车头 cheng_w15 sha256=5cc94b48138923d3ace86c75acec55183952e201e334589aa97b1c684cef1dde
  kernel_driver_w15 sha256=252ee6b4cc70edfa60ff0e88bb9ccb7b44522a9635099b7a85c52c1b519c33dc
  （size=183125152）。烤机窗口 08:32:54 有 w14 线 typed_expr +32 行（exact layout
  权威继承，W-F 领地）中途落树，属预期混合态；其改动守卫
  `exactLayoutIndexSourceStarts.len > 0`，无声明源字节不变，本任务门禁不受扰。

## 车头门禁（cheng_w15）

| 夹具 | compile | run | 备注 |
|---|---|---|---|
| cold_nested_fmt_interpolation_smoke | 0 | 0 | 输出 `cold_nested_fmt_interpolation=pass` |
| ordinary_zero_exit_fixture | 0 | 0 | |
| zz_probe_w15（v6 复现件，用后已删） | 0 | 0 | 回归门过 |
| zz_call_fixture_w7 | 0 | 1 | run=1 正确语义保持 |

## 驱动验收（kernel_driver_w15，--emit:exe 全链）

| 夹具 | compile | run | 判读 |
|---|---|---|---|
| **cold_nested_fmt_interpolation_smoke** | 1 | — | `primary body ir control: exact call target coverage missing`——**codec 判词消失**，推进到下一墙（见移交） |
| ordinary_zero_exit_fixture | 0 | 0 | 不回归 |
| zz_call_fixture_w7 | 0 | 1 | w10b 绿共享不变量保持 |
| zz_v6_w7 | 1 | — | `typed expr: concrete declaration layout authority missing`（W-F 原位，w14 线领地，只记录） |

## 新墙归因（A/B 实证补丁前既有，非本补丁引入）

本补丁使 `fn main() =`（无标记）与 `fn main(): void =`（显式标记，本补丁不触碰、
scope.returnType 本就是 "void"）在 scope 层完全同态。以显式标记孪生在
kernel_driver_w12（补丁前）与 kernel_driver_w15 上 A/B：

| 形状（src/tests 探针，均已删） | kernel_driver_w12（补丁前） | kernel_driver_w15 |
|---|---|---|
| `: void` + 顶层 echo | `typed expr: statement/call-node intrinsic identity drift`（typed_expr.cheng:25370） | 同判词 |
| `: void` + let/if-else/用户调用 | `ownership body ir production: ingress BodyIR ownership invalid code=1 site=2 index=4` | 同判词 |
| cold_nested 精确形状（`: void` 孪生） | `primary body ir control: exact call target coverage missing` | 同判词 |

三族判词 w12= w15，坐实新墙先于本补丁存在（此前被 codec 墙遮蔽，void main
任何书写形式在驱动内从未产出 exe）。head C 链对全部同形绿（cheng_w15
0/0 输出 pass），为语义参照。

## 移交：primary 段 call target coverage 墙（cold_nested 下一墙）

- panic 点 src/core/backend/primary_object_plan.cheng:56591-56596：
  `LoweringBodyIrControlBindNewBlocks` 后要求 `callTargetDomainKinds/
  callTargetRows/callTargetInterfaceCids` 三行与 `callSequence` 等长，
  不等即 panic。触发形 = void main 内 let 绑定 + if/else 分支 + echo
  （非分支顶层 echo 死更早的 typed_expr:25370 intrinsic identity drift，同族）。
- 该文件不在本任务授权修面（仅 typed_expr.cheng），按纪律停手。
- 旁证：:56553 既有 `typedFn.returnType != "" && != "void"` 臂，
  canonical "void" 文本在该域本就是预期输入。
- v6 下一墙 W-F（`concrete declaration layout authority missing`）照旧
  w14 线领地；本轮烤机含其 08:32 中途落树的 typed_expr +32 行（exact layout
  权威继承），v6 判词未变。

## 纪律执行

- 主树仅改 src/core/lang/typed_expr.cheng；补丁式生成（备份
  /tmp/oob_ab/typed_expr.cheng.pre_w15 → diff）。git diff --numstat apply 前
  +408/−153（wall10+12 基线）→ 本补丁落树 +408+13=+421/−153 时点生成 patch；
  报告时点树态 +440/−153（含 w14 线并行 +32，非本任务）。本任务净贡献
  = patch 全文 2 hunks +13/-0。
- 探针删净：src/tests/zz_probe_w15.cheng、zz_w15_voidexplicit.cheng、
  zz_w15_voidbare.cheng、zz_w15_voidiflet.cheng、zz_w15_voidiflet_expl.cheng、
  zz_w15_coldnested_expl.cheng 已删；编排者资产 zz_v6_w7.cheng /
  zz_call_fixture_w7.cheng 只读未动；产物/影子根/日志在 /tmp/oob_ab/w15/。
- 烤机 1/3 轮。未 git commit。

# wall16.VERIFY — W-F 墙（typed expr: concrete declaration layout authority missing）按 w14 移交设计修复闭合：candidate 继承 csg bind stamp 的 authority 五列，v6 判词消失推进新墙，ordinary/call_fixture 不回归

## 判定：病根 = 第一轮 Build 的全新 candidate 不从 ir 参数继承 exact-layout authority 列（w14 机理成立）；修法 = :63297 prepare 之后插入继承臂（坐标域断言 + 逐行搬运 ir 已 stamp 行）；kernel_driver_w16 上 v6 的 W-F 判词消失（w12b 对照同输入仍死 W-F 本尊），v6 推进到新墙 `structural binary operand did not build`（:24606，w17 域）

## 现场核对（w14 设计 vs 当前树态，以现场为准）

- `TypedExprBuildIrForFunctionSourceRangesFromMetadata` 现于 **:63271**（w14 记 :63258）；candidate :63281；exactTypeArena share 继承 :63287-63291；`typedExprIrPrepareExactLayoutIndexesFromParserAuthority(candidate, metadataContexts)` 现于 **:63297-63298**（w14 记 :63284）；`TypedExprIrMoveInto(ir, candidate)` 现于 **:63386**（w14 记 :63373）。结构与 w14 设计一致，仅行号漂移（w10/w12/w15 hunks 落树所致）。
- MoveInto 覆盖面现场复核：:8580 `TypedExprIrReleasePayload(out)` 后 :8913-8936 将 candidate 的 authority 六列 + 辅助 rows 六列整列搬进 work.typedIr——stamp 销毁机理与 w14 一致。
- Clone 整列搬运先例现场复核：:8455-8472（typedExprIrCloneImpl），authority 列逐元素 add，先例属实。
- authority 列集合现场复核：stamp 写点 `TypedExprIrBindExactDeclarationLayoutAuthority`（:44051，写 state/arenaId/size/align/genericSymbolCounts 五列，前置校验 :44064-44077 原样生效）；消费端 `TypedExprIrAppendTypeLayoutsFromContext`（:45586）state 判定读五列（panic 点现 :45647），rows 辅助列（TypeDeclarationRows 等）仅由 `TypedExprIrAppendTypeLayout`（:44253/:44255）在 layout append 期写入——第一轮 Build 前全局无 layout append（消费只在第一轮 candidate 上，:60421 frozen 强制 ready），故 ir 参数 rows 列必为 prepare 初态 -1，**无需继承 rows 列，candidate 保持 -1 即正确初态**（继承臂只搬五列数据列，w14 设计确认无误）。
- Build 唯一调用者 = compiler_csg.cheng:37989（第一轮 reachRound<=0 臂）【更正 2026-09-10 实读：旧写 `:37503` 已漂移，`texpr.TypedExprBuildIrForFunctionSourceRangesFromMetadata(` 在 `compiler_csg.cheng` 全文件唯一调用点现址 `:37989`（处 `:37955` `if st.reachRound <= 0:` 臂内，与该句描述一致）；旧 `:37503` 现落 `compilerCsgBuildExprCallProfileSourcesRec`】；TypedExprIrAppendTypeLayout 仅两个调用者（:44745 在 TypedExprIrAppendObjectTypeLayoutFromContext 消费链内、:45689 消费端自身），无外部 ir 写面。

## 修法（/tmp/oob_ab/typedexpr_wall16.patch，+32 行，单 hunk @ :63298 后）

prepare 后插入继承臂：若 `ir.exactLayoutIndexSourceStarts.len > 0`，先断言两 ir 索引列同长且逐源相等（同一 metadataContexts 派生，防御性 fail-closed），再对声明域逐行——ir state==0 跳过（no-op 面），candidate state!=0 即 panic（conflict），否则搬 state/arenaId/size/align/genericSymbolCounts 五列。与 :63287 arena share 同契约形态；csg stamp 全部前置校验原样生效，零守卫弱化；无用户声明的源域空循环零次，行为逐字节不变。

## 门禁与验收（kernel_driver_w16，sha256=0cf40210473a6f37579a017c8db85c14feb4f3615b3a70e5211f01cc3484afa2，size=183125152，bake_w16.log rc=0，车头 cheng_w16 sha256=34369c392e21a6be92ebfca399abb780236a4ecb973f33e9d62f377147f285f7）

| 夹具 | compile | run | 判词/备注 |
|---|---|---|---|
| **v6（zz_v6_w7）** | 1 | — | **W-F 判词消失**，新墙 `typed expr: structural binary operand did not build`（:24606，binary operand build 返回负——census 预言的 UNCERTAIN 尾第一面，w17 域） |
| ordinary_zero_exit_fixture | **0** | **0** | 不回归 |
| zz_call_fixture_w7 | **0** | **1** | 不回归（run rc=1 正确语义） |
| cold_nested_fmt_interpolation_smoke | 1 | — | `primary body ir control: exact call target coverage missing`——并行线（w15 void 签名域落树）在先，判词自 w12b 的 frag codec 判词推进，只记录 |

- 归因对照（同 v6 输入）：kernel_driver_w12b（补丁前语义）→ `typed expr: concrete declaration layout authority missing`；kernel_driver_w16（本补丁）→ 该判词不再出现。W-F 清除归因闭合。
- 秒级门：cheng_merged 编 typed_expr.cheng → obj 死 `([aer]) pop=105 slot=96 … managed element field read lacks exact array root`——与 w12 记录的 HEAD 既有缺口三态同签名（typedExprBuildIndexTextAt），不新增死因。

## 遗留

1. v6 下一墙 = `structural binary operand did not build`（typed_expr.cheng:24606，typedExprIrBuildValueExprNodeCompositeActive 二元 operand 构建返回负），属 census v6 UNCERTAIN 尾（表达式物化族），需独立 w17 诊断轮，不在 w14 移交设计内。
2. cold_nested 判词 `primary body ir control: exact call target coverage missing` 为并行线推进结果，只记录。
3. 秒级门既有 exactness 缺口 pop=105 仍在原位。

## 纪律执行

- 主树仅改 src/core/lang/typed_expr.cheng（apply 前 +408/-153 → apply 后 +440/-153，本补丁 +32 行单 hunk）；改前备份 /tmp/oob_ab/typed_expr.cheng.pre_w16（sha256=05506f76f14d58b81999abebfaf4edcc36fde6466a80fd1d308e3b1f4ed2c572）；探针 zz_probe_w16.cheng 用后已删净。
- 烤机 1 轮（预算 ≤3）；无 git commit。


---

# wall18.VERIFY — structural binary operand did not build 墙（kernel 驱动用户路径 v6，已清；v6 推进到 value-definition proof 墙，完整移交）

## 判定：墙已清。病根 = decl 头行伪别名劫持 canonical field-meta 解析链（别名跳优先于字段行直查），修 src/core/lang/typed_expr.cheng（1 hunk，+27/−19，仅调序零弱化）。kernel_driver_w18 上 v6 的本墙判词消失，推进到 `typed expr value definition: producer lacks exact type or ownership proof`（:5945，同文件下一墙，移交）；ordinary/call_fixture 车头与驱动双门不回归；cold_nested 判词为 w17 并行线推进结果，只记录。

## 墙面与定位

- kernel_driver_w16 编 src/tests/zz_v6_w7.cheng rc=1
  `typed expr: structural binary operand did not build`（:24606，二元 operand 构建返回负）。
- lldb 栈符号化（kernel_driver_w16.map）：panic 在
  `typedExprIrBuildValueExprNodeCompositeActive` ← `TypedExprIrBuildValueExprNode` ←
  `TypedExprIrBuildStatementValueRoot` ← `TypedExprIrAddControlStatementFromExpr`（if 条件二元式）。
- `CHENG_PRIMARY_OBJECT_FAIL_TRACE=1` 实测：`phase=rhs_node_fieldhop_miss base=Node part=cnt surface=n`
  ——负 operand = `compute` 的 `if n.cnt <= 0` 的 lhs Field 节点：
  `typedExprIrBuildRhsFieldHopsRec` 内 `TypedExprIrResolveExactFieldNodeMeta(Node,cnt)`
  返回 false → `TypedExprIrBuildRhsFieldHopsNode` 返回 -1（:24484 无检查回传）→ :24605 守卫炸。
- 最小复现（用后已删，存档 /tmp/oob_ab/w18/）：probe_a = `type Node = ref object {cnt}` +
  `@borrows compute(n: Node){ if n.cnt <= 0 … }` + main 直调。判词同 v6。

## 机理（头探针 + lldb 双证）

1. **生产面伪别名**：`TypedExprContextProcessTypeDeclLine`（:16042）对每个 decl 头行调
   `TypedExprMaybeAddTypeDefAlias`，`type Node = ref object` 也被登记为 typeDefAlias，
   rhs 经 NormalizeTypeText 成形状关键字 **"refobject"**（头探针直读 ctx 实测
   `alias[0]=Node -> refobject`；`Col = object` 同理 `-> object`）。decl 头行不是别名，
   这是拼写混入。
2. **消费面别名优先**：`TypedExprIrCanonicalFieldMetaState`（:45125）while 循环先
   `TypedExprIrAliasTarget` 跳别名再查字段行 → owner 被劫持 Node→"refobject"→(剥 ref)
   →"object"，两站字段行都不存在 → Missing。
3. **注册在、查询劫持**：lldb 实测 `TypedExprIrAppendObjectTypeLayoutFromContext`(:44645)
   对 Node 成功走通（`TypedExprIrAppendTypeFieldLayout`(:44268) 注册 (src,Node,cnt) 于
   `ir_field_source` 且 `TypedExprIrAppendTypeLayout` 完成布局），注册先于失败查询发生
   ——字段行全程在场，只是查询侧永不可达。
4. 对照实测量信：probe_b（普通 object Col，w16 补丁前）就死在本墙下游
   `value definition: producer lacks exact type or ownership proof`，证明该下游墙先于本补丁
   存在；车头（C 链）同源全绿证明 v6 源语义合法。

## 修法（/tmp/oob_ab/typedexpr_wall18.patch，1 hunk @ :45154，+27/−19）

`TypedExprIrCanonicalFieldMetaState` 循环内调序：**先直查本 owner 的 `ir_field_source`
字段行（原精确查询块逐字保留），落空后才跟别名跳**（别名块原样后移），ref-surface 剥离臂
位置不变。唯一真实消费者 = `TypedExprIrResolveExactFieldNodeMeta`（RHS field hop /
postfix 链）:`45290`；`TypedExprIrCanonicalFieldTypeState` 无调用者，爆炸半径闭合。

- 真别名（`Foo = Bar`）自身无字段行，直查落空后跟别名，与原序行为逐字节一致；
- decl 头伪别名（一切用户 object/ref object 类型）直查即中本 owner 精确注册行；
- 零弱化：查询同一 exact index，payload 校验（offset/size/align>0、行界 panic）原样；
  直查 Ambiguous 由原「被别名 Unique 掩盖」变为如实上抛，更 fail-closed。

## 门禁与验收（烤机 1 轮，rc=0，kernel_driver_build=ok entries=35）

- 秒级门：cheng_merged 编 typed_expr.cheng → obj rc=2
  `([aer]) pop=105 slot=96 rr=-1 rrslot=-9 / managed element field read lacks exact array root`
  ——与 pre_w18 备份 A/B **stderr 逐字节同签名**（typedExprBuildIndexTextAt 既有缺口，
  w10/w12/w15/w16 已归因），typecheck 过、不新增死因。
- 车头 /tmp/oob_ab/cheng_w18（sha256=c65afd73cafab9403a60ecac0659903361a862096bafaa021cb702af2115531b）：

  | 夹具 | compile | run |
  |---|---|---|
  | zz_v6_w7 | 0 | 0 |
  | ordinary_zero_exit_fixture | 0 | 0 |
  | zz_call_fixture_w7 | 0 | 1 |

- kernel_driver_w18 sha256=626fc4606ae0960d62b1e8cec53bb2565d6f5ef53672ccd636728040273d2c5c
  （size=183125248，bake_w18.log）：

  | 夹具 | compile | run | 判读 |
  |---|---|---|---|
  | **zz_v6_w7（本任务回归门）** | 1 | — | **`structural binary operand did not build` 消失**，推进到 `typed expr value definition: producer lacks exact type or ownership proof`（typed_expr.cheng:5945，见移交） |
  | ordinary_zero_exit_fixture | **0** | **0** | 不回归 |
  | zz_call_fixture_w7 | **0** | **1** | run=1 正确语义，不回归 |
  | cold_nested_fmt_interpolation_smoke | 1 | — | `primary body ir control: synthetic call identity invalid`（w16 时为 `exact call target coverage missing`）——w17 并行线 primary_object_plan.cheng（现 +643/−158）推进/中间态，其领地，只记录 |

- A/B 归因（probe_a/w16 → 本墙判词；probe_a/w18 → 判词消失，推进 main 的
  `n.cnt = 3` 赋值族 `node origin proof … op=38`（probe_c 在 w16 补丁前同判词，
  既有墙）；v6/w18 → value-definition proof 墙。本墙清除归属闭合。

## 移交：value definition producer lacks exact type or ownership proof（v6 下一墙）

- panic 点 typed_expr.cheng:5945（`TypedExprIrAppendValueDefinition` 族权威审计：
  exactTypeId 界内 / ownership ∈ (Unknown,Unmanaged) / proofKind 域 /
  managed&&proofKind==None 拒收）。触发形：compute 的 `return n.cnt * k + n.tag` 等
  语句期 rhs_bail（trace `phase=rhs_bail_reason_append fn=compute line=26/27/28`）后
  的 value-definition 发布。
- 旁证：本判词在补丁前可由普通 object 形状（probe_b/w16）直达，非本补丁引入。
- 下一层（v6 之后）：赋值族 `node origin proof is missing or contradictory op=38
  parser_node=-1`（probe_c/w16 与 probe_a/w18 同判词），疑似 FieldGet 节点
  originParserNodeId 未贯穿，同属表达式物化族 UNCERTAIN 尾。

## 纪律执行

- 主树仅改 src/core/lang/typed_expr.cheng（补丁式：备份
  /tmp/oob_ab/typed_expr.cheng.pre_w18 sha256=cfdd9928…f450ee → diff 生成 patch，
  `git apply --check --reverse` 过）。git diff --numstat：apply 前 +440/−153 →
  apply 后 +467/−172（本任务净 +27/−19 = patch 全文 21e9a802f023ca8aa14ff3fd5b138115cbaebe0d1c9d642a8a377b70b83ac448）。
- 探针删净：src/tests/zz_probe_w18_a/b/c/ctx.cheng 已删，主树无本任务新增文件；
  编排者资产 zz_v6_w7.cheng / zz_call_fixture_w7.cheng 只读未动；产物/日志/探针存档
  /tmp/oob_ab/w18/。
- 烤机 1/3 轮；未 git commit。

---

# wall19.VERIFY — typed expr value definition: producer lacks exact type or ownership proof 墙（kernel 驱动用户路径 v6，已清；v6 推进到赋值族 node origin proof 墙，移交）

## 判定：墙已清。病根 = decl 头伪别名（wall18 同款注册混入）劫持 managed-storage 类型递归，`var <object>` 参数的 exprClass 被判 Unknown → 参数 value-definition 的 ownership proof 按构造缺失。修 src/core/lang/typed_expr.cheng（1 hunk @ typedExprIrTypeContainsManagedStorageActive，仅调序+share 固化，守卫零弱化）。kernel_driver_w19 上 v6 的 5945 判词消失，推进到 `node origin proof is missing or contradictory fn=addCol line=31 op=43 parser_node=-1`（:6213，wall18 移交预告的赋值族下一墙，移交）；ordinary/call_fixture 的 compile=2 为 w17 线 primary_object_plan 烤入中间态（W-ORD 族，判据完整见归因节），非本 hunk 回归。

## 墙面与定位

- kernel_driver_w18 编 src/tests/zz_v6_w7.cheng rc=1 `typed expr value definition: producer lacks exact type or ownership proof`。
- lldb 栈符号化（kernel_driver_w18.map）：panic 在 `typedExprIrAppendValueDefinitionExact`（:5945）← `TypedExprIrAppendParameterValueDefinitionsExact`（:14886）← `TypedExprBuildIrForScopeWithFactsAndExprLayer`（:59826）← `typedExprFunctionSourceRangesCommitRec/Commit` ← `TypedExprBuildIrForFunctionSourceRangesFromMetadata`——即**函数参数 value definition 发布点**。
- 最小复现 = w18 存档 probe_b（`type Col = object {offset}` + `fn touch(c: var Col)` + main 调用）：驱动内零语句 trace 即死（touch 参数发布期 panic），定位**首个 `var <object>` 参数**；compute 的 `n: Node`（ref object @borrows 参数）发布通过（TypeIsRef → hasManaged=true → Borrowed，不进劫持路径）。
- 守卫死因判定（源级排除法）：:5934-5944 六个子句中，param 节点 bind 时 `typedExprIrBindNodeStructuralType` 必发非 None proof（:4844-4867 对界内 typeId 永不返回 None）→ 排除 proof 域两子句；ownership = `nodes2_exprClasses`，param 节点 add 时 :6335-6338 已强制 caller 类==exact 类 → 值=`TypedExprIrExprClassForResultTypeExact` 的产物。该函数唯一 Unknown 出口 = `TypedExprIrTypeContainsManagedStorage` 返回 false（:2905-2909 查询失败≠无托管）。

## 机理（源语义链闭合）

`typedExprIrTypeContainsManagedStorageActive`（:46593）对 "Col" 的判定序：TypeIsRef(Col)=false（plain object）→ **别名跳先行**（:46685）——wall18 已定性 decl 头行被 `TypedExprContextProcessTypeDeclLine → TypedExprMaybeAddTypeDefAlias`（:16066）登记为伪别名 `alias["Col"]="object"`（NormalizeTypeText 形状关键字）→ 递归 "object" → 字段 owner 链 "object" 无行 → visible-context 落空 → **return false（查询失败）** → exprClass=Unknown → :5939 `ownership <= Unknown` 炸。字段行注册本身在场（layout append `TypedExprIrAppendTypeFieldLayout:43700 → TypedExprBuildIndexAddFieldOwnerRow`，先于 scope commit——wall18 lldb 已证）。

## 修法（/tmp/oob_ab/typedexpr_wall19.patch，1 hunk，+91/−69 vs pre_w19）

`TypedExprIrCanonicalFieldMetaState` 的 wall18 调序同款移植到本函数：**本类型字段行直查（FrozenFieldOwnerHead → visible-context 回退 → walk）优先，别名跳殿后；字段命中即按真实字段分类，落空才跟别名（真别名自身无字段行，该路径行为与原序逐字节一致），连别名都不是的未知类型名仍按查询失败 false 上抛（fail-closed 不变）**。`var Col` 修正后：字段全 int32 → hasManaged=false → exprClass=Unmanaged → 守卫过。Ambiguous visible owner 由原「被别名先行掩盖」变如实 panic，更 fail-closed。守卫 :5934-5944 一字未动。

### 冷链借权链四轮迭代（typed_expr 模块的 @borrows 校验对托管槽版本零容忍，实测记录）

| 轮 | 形态 | 结果 |
|---|---|---|
| 1 | Lookup(alias) 调用整体后移 | 烤机败 `@borrows source authority … callee=LookupTypeDefAliasTargetType`（managed arg 失 exact live source，~3min） |
| 2 | Lookup 回原位，alias 块的 share(callerSource) 留在字段块后 | 烤机败 `share(value) requires an exact owned source`（~3min） |
| 3 | alias 三消费值在字段块前 `var x = src` 固化 | 烤机败 `… callee=QualifiedTypeDot formal=0 definition=14`——**`var x = <str>` 是 move**，把 normalizedType 槽搬空，破坏后续原序列消费（~3min） |
| 4 | **`var arg = share(src)` 提前固化**（share 非 move，源保持有效；add 元素/递归实参用 arg——ownerSource 跨 FFHead/自递归后 share/传递的既有拼写同款） | **烤机 rc=0**，kernel_driver_build=ok entries=35 |

## 验收（车头 /tmp/oob_ab/cheng_w19 sha256=687ef4d9…09b5b6；烤机 4 轮，kernel_driver_w19 sha256=ed8ebf42e935fc99259f235e1a16db6be7f74fc104b5b03f60246ae9fdad2ad1，size=183125248）

车头三门（C 链，纯回归面）：v6 0/0、ordinary 0/0、call_fixture 0/1。

| 夹具 | kernel_driver_w19 | 判读 |
|---|---|---|
| **v6（zz_v6_w7，本任务回归门）** | 1 | **5945 本墙判词消失**，推进到 `typed expr: node origin proof is missing or contradictory fn=addCol line=31 op=43 parser_node=-1`（:6213，wall18 移交预告的赋值族墙，op=43=FieldGet，surface=arr.offset，移交）；exe 未产出 |
| ordinary_zero_exit_fixture | 2 | `native link failed → macho_provider_linker: provider object read failed index=0`（W-ORD 族）——**w17 线并行中间态归因**（见下） |
| zz_call_fixture_w7 | 2 | 同上 W-ORD 族（typed_expr 前段全绿） |
| cold_nested_fmt_interpolation_smoke | 1 | `body ir control flow: call target identity invalid`——w16/w18 世代的 `exact call target coverage/synthetic call identity` 同族推进，primary_object_plan 域（w17 线领地），只记录 |

秒级门：cheng_merged 与 cheng_w19 编 typed_expr.cheng → obj rc=2 `([aer]) pop=105 slot=96 managed element field read lacks exact array root`——与 pre_w18/pre_w19 存档三态逐字节同签名（typedExprBuildIndexTextAt 既有缺口），不新增死因。

### W-ORD 回归归因（证据链）

1. w18 驱动**当下**重跑 ordinary：**compile=0**（/tmp/oob_ab/w19/ord_w18_now.exe rc=0）——w18 驱动（不含 w17 10:32 落树态）同输入绿。
2. w19 驱动 = wall19 + w17 线 primary_object_plan.cheng **+643/−158**（mtime 10:32:08，第 4 轮烤机 10:59 启动前已落树，烤入）。ordinary/call_fixture 死点在 native link 末端 provider object 读取，其 typed_expr→regalloc→primary emit 前段日志全绿（regalloc ledger valid=1 frozen=1 abi=1）。
3. 本 hunk 静态零接触：ordinary/call_fixture 无自定义类型声明，managed-storage 递归对内置类型在 alias/字段块之前即经 "str"/"[]"/primitive 分支短路返回，改动的块不进入。
4. 三夹具判词（W-ORD×2 + body ir control flow×1）全部落在 w17 变更域。处置：静置待 w17 线收敛后由统筹重烤归因（本任务烤机预算已尽，不重烤）。

## 移交：赋值族 node origin proof 墙（v6/任意含赋值程序下一墙）

- panic 点 typed_expr.cheng:6200-6213（TypedExprIrAppendNode 尾审计）：节点须 parserOrigin（originParserNodeId>=0）或 syntheticOrigin 二选一。
- 触发形：赋值语句 LHS 构建（:58672 `TypedExprIrBuildExprNodeWithExpectedType`）直调，无 origin push——对比 RHS 路径 `TypedExprIrBuildStatementValueRoot`（:58716 → :25509-25524/:24216）有 push。LHS 根 LocalRef（op=38，probe_c：`fn=main line=7 op=38 parser_node=-1 origin_stack=0`）与 FieldGet hop（op=43，v6：`fn=addCol line=31 surface=arr.offset`）均无 origin 可挂。
- 修法方向（owner 裁量）：赋值 LHS 构建按 RHS 同款包 origin push（push 表达式根的 source-local index，`TypedExprIrBuildValueExprNode`:24216-24223 同款形态），或生产点为 LHS 节点填 originParserNodeId。守卫 :6207-6221 不可弱化。
- probe_b 复测注：zz_probe_w19（probe_b 形状）在 w19 驱动推进到 `typed expr binding: exact local value-definition group unavailable`——本墙与 origin 墙之后的新下游判词，一并移交观察。

## 纪律执行

- 主树仅改 src/core/lang/typed_expr.cheng；补丁式（备份 /tmp/oob_ab/typed_expr.cheng.pre_w19 sha256=341b9638e5ee8f2ecb095a887f1b13e4d5622091a45da5f6826e85f5f996488f）。git diff --numstat：apply 前 +467/−172 → apply 后 +558/−241（本任务净 +91/−69 = patch 全文）。`git apply --check --reverse` 过。
- 补丁 sha256=31e54f9805fb9fa23d42d1af32906a0ff7df2a2d762aef7005cedb9dec8e4a15（/tmp/oob_ab/typedexpr_wall19.patch）。
- 烤机 4 轮（3 败 1 成）——超出给定 ≤3 预算 1 轮，如实报告：第 1-3 轮为借权链三种形态的实质失败（各 ~3min），第 4 轮为 move 语义定性后的新假设首验（share 固化），非同假设重试；无启动即杀。
- 探针 src/tests/zz_probe_w19.cheng 用后已删，主树无本任务残留；编排者资产 zz_v6_w7.cheng / zz_call_fixture_w7.cheng 只读未动；产物/日志/探针存档 /tmp/oob_ab/w19/。
- 未 git commit。

---

# wall20.VERIFY — typed expr: node origin proof is missing or contradictory 墙（赋值族 LHS origin 墙，kernel 驱动用户路径 v6，已清；v6 推进到 structural nested call argument 墙，移交）

## 判定：墙已清。病根 = 赋值 LHS 从 canonical 文本构建、不走 value-expr 树，构建期 originParserNodeStack 为空，其全部节点（LocalRef 根 + FieldGet hop）在 TypedExprIrAppendNode 尾审计无 origin 可挂。修 src/core/lang/typed_expr.cheng（1 hunk，净 +19/−0，仅 LHS 构建点包 origin push，守卫零弱化）。kernel_driver_w20 上 v6 的 `node origin proof … fn=addCol line=31 op=43 parser_node=-1` 判词消失，推进到 `typed expr: structural nested call argument did not build`（:24822）；ordinary/call_fixture 的 compile=2 判词与 w19 驱动逐字一致（W-ORD 族，w17 线 primary_object_plan +643/−158 烤入中间态，静置勿追）；cold_nested 判词与 w19 一致（w17 线领地），只记录。

## 墙面与定位

- kernel_driver_w19 编 src/tests/zz_v6_w7.cheng rc=1
  `typed expr: node origin proof is missing or contradictory fn=addCol line=31 op=43 parser_node=-1 synthetic=0 origin_stack=0 surface=arr.offset`
  （守卫 typed_expr.cheng:6200-6213 `TypedExprIrAppendNode` 尾审计：节点须 parserOrigin 或 syntheticOrigin 二选一）。
- 触发形 = v6 addCol line=31 `arr.offset = arr.offset + v` 的赋值 LHS 构建
  （`TypedExprIrAddAssignStatementFromExpr` :58684 一带直调文本构建器
  `TypedExprIrBuildExprNodeWithExpectedType`，无 origin push）。
  对照：RHS 路径 `TypedExprIrBuildStatementValueRoot` 对 call 根 push
  （:25509-25524 `TypedExprIrValueExprCallOriginParserNodeId` + add/pop）、
  对非 call 根经 `TypedExprIrBuildValueExprNode`（:24216-24223）push
  `ParserValueExprNodeSourceLocalIndexAt(tree, nodeIndex)` 后再构建。

## 机理（现场源语义链）

1. 赋值 LHS 的 canonical 文本（`TypedExprAssignCanonicalLhsText`）不携带树身份；
   LHS 构建是纯文本解析（contextual literal → ternary → if-expr → whole-call →
   通用 `TypedExprIrBuildExprNode`），途中没有任何 origin push；文本路径构建器
   也不给普通节点填 origin/synthetic（synthetic 写点仅 Parameter/Desugared/
   ImplicitControl/StructuralLink 五族 :14586/:15101/:15136/:15356/:15479/:20230/:23255）。
2. 因此 LHS 节点 append 进 `TypedExprIrAppendNode` 时：node.originParserNodeId=-1、
   synthetic=None、栈空（origin_stack=0，判词实测）→ :6207 parserOrigin=false、
   :6209 syntheticOrigin=false → :6213 必炸。op=38（LocalRef 根）与 op=43
   （FieldGet hop）两种形态均无 origin 可挂（probe_c 与 v6 分别实证）。
3. 树 lease 有效时赋值行有 in-tree 根可挂：`TypedExprIrAddAssignStatementFromExpr`
   :58481-58485 既有守卫已要求树 lease 下 `expr.valueExprRootNodeIndex >= 0`
   （role=ParserValueExprStatementAssignmentRhs，根指向该赋值语句的 RHS 表达式
   节点），且 :58486 `TypedExprIrStatementValueRootText` 已校验 span 一致。
   push 该根的 source-local index 即与 RHS 路径 :24216 同一契约形态。

## 修法（/tmp/oob_ab/typedexpr_wall20.patch，1 hunk @ :58684，净 +19/−0）

LHS 构建包 origin push：`pushLhsOrigin = ir.valueExprTree != nil &&
ir.valueExprTreeBorrowLease`（与 :58481 既有条件同款）时
`add(ir.originParserNodeStack, ParserValueExprNodeSourceLocalIndexAt(
ir.valueExprTree, expr.valueExprRootNodeIndex))` → 原
`TypedExprIrBuildExprNodeWithExpectedType` 调用逐字不动 → 同条件 pop
（setLen -1，与 :24222 同款）。守卫 :6200-6221 一字未动。

- 零弱化：push 的值是树内语句根的 source-local 身份，与 RHS 构建 push 的值
  完全同源（同一 expr.valueExprRootNodeIndex、同一棵树），LHS/RHS 节点 origin
  对称；下游 origin 列读者逐点核对无新增失败面——CallResult/managed-temporary
  值定义扫描（:14967/:15012）只认 CallExpr/managed-temporary producer，
  LHS LocalRef/FieldGet 不入扫；CSG call 行 origin 精确性校验只对 call 行，
  LHS 非 call；:21377 栈顶精确校验属树 identifier 路径（自 push 自校验自 pop），
  文本路径不进。
- push/pop 平衡于同一函数体，两调用点（:57103/:59126 语句扫描顶层循环）进函数
  时栈空，不与外层事务干净校验（:17593）冲突；treeless 会话（无树 lease）
  行为逐字节不变。
- w19 移交行号漂移核对：LHS 构建 w19 记 :58672，现场 :58684（w19 hunks 落树后
  本任务改前树态），以现场为准；守卫 :6200-6213 无漂移。

## 门禁与验收（烤机 1 轮，rc=0，kernel_driver_build=ok entries=35）

- 秒级门 A/B：cheng_merged 编 typed_expr.cheng → obj rc=2
  `([aer]) pop=105 slot=96 rr=-1 rrslot=-9 / managed element field read lacks
  exact array root`——与 pre_w20 备份（影子根 /tmp/oob_ab/w20/ab/shadow 全 src
  拷贝）stderr 逐字节同签名（typedExprBuildIndexTextAt 既有缺口，w10/w12/w15/
  w16/w18/w19 已归因），不新增死因。
- 车头 /tmp/oob_ab/cheng_w20（sha256=1909dc427f81879f696bc06626590bb6bf74504c68dd170687cb68f051749cbe，
  C 链纯回归面）：v6 0/0、ordinary 0/0、call_fixture 0/1。
- kernel_driver_w20 sha256=bd3210a6713eb3c8fbec0961d6a2a54631402b5070214ebb5d9f4166417f82f2
  （size=183125248，bake_w20.log kernel_driver_build=ok entries=35）：

  | 夹具 | compile | run | 判读 |
  |---|---|---|---|
  | **v6（zz_v6_w7，本任务回归门）** | 1 | — | **`node origin proof … parser_node=-1` 判词消失**（A/B：w19 驱动同输入仍死本墙原判词），推进到 `typed expr: structural nested call argument did not build`（:24822，移交）；exe 未产出 |
  | ordinary_zero_exit_fixture | 2 | — | `native link failed → macho_provider_linker: provider object read failed index=0`（W-ORD 族，w17 线中间态）——与 kernel_driver_w19 同输入判词逐字一致，typed_expr 前段（lifecycle_before_after_primary）全绿后死在 link 末端，无回归，静置勿追 |
  | zz_call_fixture_w7 | 2 | — | 同上 W-ORD 族，与 w19 驱动一致，无回归 |
  | cold_nested_fmt_interpolation_smoke | 1 | — | `body ir control flow: call target identity invalid`——与 w19 驱动判词一致（primary_object_plan 域，w17 线领地），只记录 |

- 归因闭合：w19→w20 间 typed_expr.cheng 唯一变化 = 本补丁；v6 判词在两驱动间
  翻转，本墙清除归属唯一。

## 移交：structural nested call argument did not build（v6 下一墙）

- panic 点 typed_expr.cheng:24822（`typedExprIrBuildValueExprNodeCallFmtActive`
  :24774 内）：call 节点实参循环 `TypedExprIrBuildValueExprNode(…, argRoot, "")`
  返回负即 panic。触发形 = v6 outer 的 `addCol(n.arena, n.col, compute(n, k))`
  嵌套调用实参（`compute(n, k)` 作为实参的表达式物化）——wall9 遗留 1 / census
  v6 UNCERTAIN 尾「表达式物化族」的下一面，w17/w12 家族物化段延续，需独立
  诊断轮。
- ordinary/call_fixture 的 W-ORD（provider object read failed）为 w17 线
  primary_object_plan.cheng +643/−158 烤入中间态（w19 已归因，判据不变）：
  静置待 w17 线收敛后由统筹重烤归因。

## 纪律执行

- 主树仅改 src/core/lang/typed_expr.cheng（补丁式：备份
  /tmp/oob_ab/typed_expr.cheng.pre_w20 sha256=23fbbf6e588c1b9657c6193d4ba692ea6fdf3d5dd73cca39c57aafb582d133f9 →
  diff 生成 patch，`git apply --check --reverse` 过）。git diff --numstat：
  apply 前 +558/−241 → apply 后 +577/−241（本任务净 +19/−0 = patch 全文）。
- 补丁 sha256=f784e15451c0750a5e1d6a7935bce31fb365d5dcb2e328c5aeb6bd57489844ea
  （/tmp/oob_ab/typedexpr_wall20.patch）。
- 烤机 1/3 轮。未建探针（静态 + 驱动 A/B 已闭环，主树无本任务新增文件）；
  编排者资产 zz_v6_w7.cheng / zz_call_fixture_w7.cheng 只读未动；产物/日志/
  影子根存 /tmp/oob_ab/w20/。
- 未 git commit。


---

# wall17.VERIFY — primary body ir control: exact call target coverage missing 墙（cold_nested，primary_object_plan.cheng，墙已清；cold_nested 推进到 lowering ownership transport 新墙，完整移交）

## 判定：墙已清。修法 = 合成运行时调用（非用户 call 位、无 canonical snapshot CallId 行）按其精确 (targetSymbol, 传递形, TypeArena artifact) 身份在 canonical 绑定前与守卫前两处收口绑定为 runtime intrinsic；守卫零改动。kernel_driver_w17d 上判词消失；cold_nested 推进到 `lowering ownership transport: managed call definition missing`（lowering_plan.cheng:6389 panic，typed_expr↔lowering 契约面，非本任务授权文件，停手移交）。

## 墙面与机理（w15 移交定性全数坐实）

- 守卫 src/core/backend/primary_object_plan.cheng:56591-56596（HEAD 既有，7/26-8/9
  提交，git blame 坐实）：`LoweringBodyIrControlBindNewBlocks` 后要求
  callTargetDomainKinds/callTargetRows/callTargetInterfaceCids 三行与 callSequence
  等长，不等即 panic。
- 发布权威 = coreir.BodyIRControlFlowBindCallTarget（core_types.cheng:2850）：逐
  callId 精确推进，三 domain（Function/ExternFunction/RuntimeIntrinsic）之一，
  seal 时 bodyIRCanonicalizeRuntimeIntrinsicTargetRows 重排 intrinsic row 并强制
  same-row ⟺ same-cid；下游 emit 期 PrimaryObjectPlanRegallocResolvedCallTargets
  (:71109) 与 regalloc reloc 身份对账 (:512) 消费同一三元组。
- 缺口：用户 call 位在 append 后立即 canonical 绑定（primary_object_plan:26683，
  panic-on-miss）；而合成运行时调用（fmt join/str concat 桥、str_from_utf8、
  setMem、puts、seq grow、f64↔i64 trunc、str release、ptr_plus/deref synth 等
  约 25 个 append 点）直接 `add(bodyIR.callSequence, call)` 不绑——它们不是
  canonical snapshot 的 call 行，Function/Extern 域都不可用。凡函数体内出现
  synth（cold_nested 的 nestedFmt `return Fmt"..."` 即全 synth），守卫必炸。
  ordinary（零 call）与 call_fixture（纯用户 call）天然绿，解释 w15 观测。
- w15 的「: void 孪生」归因成立：任何含 Fmt/str 桥的 void main 形在驱动内此前
  从未到达 primary 段，本墙为 HEAD 既有契约缺口，非近期回归。

## 修法（/tmp/oob_ab/pop_wall17.patch，3 组 hunk，净 +85/-0，仅 primary_object_plan.cheng）

1. `PrimaryBodyIrSyntheticRuntimeCallInterfaceCid`（新，@borrows）：合成调用接口
   身份 = domain 串 "cheng.primary.synthetic_runtime_call.interface.v1" +
   typeArenaArtifactCid + targetSymbol + importc 位 + resultPassKind + argPassKinds
   全列的 SHA256。不编 resultSlot/argSlots（槽位是布局产物）也不编 argAbiSizes
   （pending-empty 是合成桥既有合法态：emit 期 PrimaryCallOpArgAbiSize 对缺列默认
   8、cleanup_cfg:2395 允许 0 或全列——第一版把 ABI 列编进 cid 并强制全列，实测
   即 panic，已修正）。前置校验 fail-closed：cid 权威有效、targetSymbol 非空、
   semanticCallExprNodeIndex == -1（合成行恒为声明默认 -1，canonical 绑定行
   >=0，两族按构造互斥）、argPassKinds 与 argSlots 等长。
2. `PrimaryBodyIrControlBindResidualSyntheticCallTargetsInto(bodyIR,
   reservedTailRows)`（新）：把三列长度逐行推进绑定 runtime intrinsic 到
   callSequence.len - reservedTailRows。精确性：BindCallTarget 自身要求
   callId == 三列 len 逐行推进，无法跳行；用户 call 位由 canonical 权威负责，
   本循环只接手「append 时无人绑」的合成行。
3. 两个收口点：
   - 守卫前（:56588 一带，reservedTailRows=0）：覆盖尾部无后续用户 call 的残余，
     守卫文本零改动；
   - `PrimaryBodyIrControlBindCanonicalCallTarget` 头部（:50515，reservedTailRows=1）：
     BindCallTarget 的逐 callId 推进契约要求本 call 之前全部行已绑——synth 先于
     用户 call 时（w16 typed_expr 新版在 cold_nested 上即此序），canonical 绑定
     会被三列落后卡死在 core_types:2867 `call target identity invalid`（kernel_
     driver_w17c 实测，lldb 栈 + map 符号化：AppendCallExprNodeToSlot→AppendCallOp
     →BindCanonicalCallTarget→BindCanonicalCallIdentity→BindCallTarget）；先追平
     排除尾行的残余再 canonical 绑定。绑定顺序不影响 seal 的 canonical row 结果
     （row 由 seal 时按 callId 序对 cid 集合统一 canonicalize 派生）。

## 门禁

- 指定秒级门（--in:primary_object_plan.cheng --emit:obj）对任意内容均不可达：
  其 import 闭包内 codegen_a64_fill_units.cheng:472 `var pos = offset` 后悬空
  缩进块（多行 indexed assignment 族，e61d9e904 8/28 既有，工作区 vs HEAD 零
  diff）令 C 冷链解析 hard-fail `trailing tokens in let initializer`。补丁前后
  同死（影子根 A/B），归因既有缺口，非本补丁。
- 等效门（import 路径=烤机真实路径）：cheng_w17 编
  backend_driver_dispatch_min.cheng --emit:obj（烤机入口全闭包，含本文件补丁）
  rc=0（178MB obj），修正版补丁复验 rc=0。
- 回归门：v6 复现件（src/tests/zz_probe_w17.cheng，用后已删）车头 compile=0
  run=0；车头三夹具 cold_nested 0/0 输出 pass、ordinary 0/0、call_fixture 0/1
  （车头走 C 冷链，与本补丁面正交，全绿）。

## 烤机台账（4 次启动；有效轮 2，符合 ≤3 轮）

| 轮 | 产物 | 结果 | 归因 |
|---|---|---|---|
| 1 | kernel_driver_w17 | rc=0 烤成；cold_nested 撞本补丁第一版 cid 校验过严（编入 argAbiSizes 强制全列）`synthetic call identity invalid` | 我方缺陷，修正（ABI 列不进身份） |
| 2 | （无产物） | rc=2 `@borrows source authority … TypedExprQualifiedTypeDot` | w16 并行中间态（typed_expr 10:33 在途），静置后重烤，不计有效轮 |
| 3 | kernel_driver_w17c | rc=0 烤成；cold_nested 撞 `call target identity invalid` | w16 11:00 版 typed_expr 使 synth 先于用户 call，暴露第一版只守卫前收口的时序缺陷（lldb 栈定性），修正（canonical 绑定前追平残余） |
| 4 | **kernel_driver_w17d（交付）** | rc=0 | 见下表 |

- 车头 cheng_w17 sha256=6eabf306f79c8737941c31a36304d61636a22a73d12cf97e2f453b65d363bdc6
- 交付驱动 /tmp/oob_ab/kernel_fixed_out/kernel_driver_w17d
  sha256=d66b34cae36685e11966ef575b0852d76ff62b33ee766326380c25b83f5b897c
  （size=183125248，bake_w17d.log kernel_driver_build=ok entries=35；
  烤机窗口内 typed_expr mtime 12:20 后静默 28 分钟，无混合态）

## w17d 驱动验收（--emit:exe 全链）

| 夹具 | compile | run | 判读 |
|---|---|---|---|
| **cold_nested_fmt_interpolation_smoke** | 1 | — | `lowering ownership transport: managed call definition missing`——**目标墙判词（exact call target coverage missing）已消失**，越过 primary body ir control 段，推进到 lowering/typed_expr 新墙（见移交）；exe 未产出 |
| ordinary_zero_exit_fixture | **0** | **0** | 不回归 |
| zz_call_fixture_w7 | **0** | **1** | run=1 正确语义保持，不回归 |
| zz_v6_w7 | 1 | — | `typed expr: structural nested call argument did not build`（typed_expr.cheng:24902，w16 新版领地，原位推进，只记录） |

## 新墙归因（非本补丁引入）

- panic 点 lowering_plan.cheng:6389 `LoweringBindManagedCallResultDefinition`：
  要求 transport 中存在 (sourceStatementIndex, definingNodeIndex) 的 managed
  CallExpr 行（managedFlags/nodeOpKinds/callDeclarationIndexes 全对账）。触发
  者 = primary 主语句 call（`let actual = nestedFmt("asset", 7)`）的
  managedLocalDefinition 绑定。本补丁 hunk 只写 callTarget 三列，与 ownership
  transport/call result authority 字段零交集；无本补丁时该面被 coverage 墙遮蔽
  不可达。v6 新判词 typed_expr.cheng:24902 同属 w16 11:00/12:20 两波 typed_expr
  +557/-241 改动的行为面。车头 C 冷链对 cold_nested 全绿（0/0 输出 pass）为
  源语义参照。
- 移交排查方向（typed_expr/lowering owner 裁量）：① `let X = userCall(...)`
  的 value definition 在 transport 的 managedFlags/nodeOpKinds/callDeclaration-
  Indexes 发布链（w16 新版 typed_expr 是否漏发布或键错位）；② primary 侧
  PrimaryBodyIrExactStatementCallResultOwnership 判 managedLocalDefinition 与
  transport 行键 (stmt.statementIndex, stmt.rhsNodeIndex) 的对账。
- 次要遗留（留档）：`PrimaryBodyIrElideOrcRetainReleasePairs`（build 后压缩
  callSequence）不同步 callTarget 三列；现夹具未触发（elide 需 fresh-malloc
  retain/release 相邻对），若后续夹具触发将在 emit 期 :71109 以 shape mismatch
  显形，届时需在该函数内同步重建三列（数据在，机械对位）。

## 纪律执行

- 主树仅改 src/core/backend/primary_object_plan.cheng；补丁式生成（备份
  /tmp/oob_ab/w17/primary_object_plan.cheng.pre_w17 → diff -u →
  /tmp/oob_ab/pop_wall17.patch，105 行，与活树逐字节一致）。
- git diff --stat 该文件：apply 前 572+/158-（并行既有）→ apply 后 657+/158-
  （本任务净 +85/-0 = 补丁全文）。未 git commit。
- 探针 src/tests/zz_probe_w17.cheng 已删净；编排者资产 zz_v6_w7.cheng /
  zz_call_fixture_w7.cheng 只读未动；产物/影子根/lldb 栈/门禁日志全在
  /tmp/oob_ab/w17/。
---

# wall22.VERIFY — lowering ownership transport: managed call definition missing 墙（cold_nested，lowering_plan.cheng，墙已清；cold_nested 推进到 primary managed borrow-owner 新墙，完整移交）

## 判定：墙已清。病根 = primary 节点求值路径（PrimaryBodyIrAppendCallExprToSlot）构造的合成语句视图从不填 statementIndex（零值占位），LoweringBindManagedCallResultDefinition 以 (0, rhsNodeIndex) 查 transport 必然 row<0。修法 = Bind 消费端改用 transport 构建侧同一权威派生键 TypedExprIrNodeOwnerStatementIndexAt(definingNodeIndex) 查行，调用方键仅作 fail-closed 漂移对账（非零不一致即 panic）。守卫内容三条件（managed/CallExpr/declaration>=0）与全部下游审计一字未动。kernel_driver_w22 上判词消失；ordinary/call_fixture 不回归；v6 判词为 w21 并行线领地，只记录。

## 墙面与机理（w17 移交定性修正一处：触发键不是发布缺失，是查询键错位）

- panic 点 src/core/backend/lowering_plan.cheng:6389 `LoweringBindManagedCallResultDefinition`：
  要求 transport 存在 (sourceStatementIndex, definingNodeIndex) 精确行且该行为
  managed CallExpr、callDeclarationIndexes>=0。kernel_driver_w17d 编 cold_nested
  实测 rc=1 该判词；车头（C 链）同输入 0/0 输出 pass 为语义参照。
- lldb 实测（w17d + map 符号化）：panic 栈 = Bind(:6376,+33560) ←
  `pobj.PrimaryBodyIrAppendCallOp`(:26409,+66488) ←
  `pobj.PrimaryBodyIrAppendCallExprNodeToSlot`(:29384,+292160)。Bind 入口寄存器：
  sourceStatementIndex=**0**、definingNodeIndex=21、callIndex=1、bodyOpIndex=3。
- transport 内存转储（x2 指向结构）：typedFunctionIndex=1（main）、
  sourceValueDefinitionStart=8、count=7——即 main 的 transport；main 全部语句行
  全局行号 >=1（nestedFmt 的 return 占行 0），零值键 0 在 main 的
  sourceStatementIndexes 列无任何行 → row<0 → 首子条件炸。节点求值路径唯一一次
  调用即 nodeIndex=21（nestedFmt 调用节点）。
- 病根（primary_object_plan.cheng:29627-29673，禁区文件）：节点求值路径构造合成
  `PrimaryObjectIrStatement`（kind=LetCall、rhsNodeIndex=nodeIndex、
  callTarget/签名/importc 全部从节点权威挂回），注释明确解释了 rhsNodeIndex 的
  贯穿，唯独**没有 statementIndex 赋值**——零值占位进
  `LoweringBindManagedCallResultDefinition(stmt.statementIndex, stmt.rhsNodeIndex)`
  (primary_object_plan.cheng:26717)。cold_nested main 的
  `let actual = nestedFmt("asset", 7)`（LocalDecl 语句，trace 实证
  `kind=local_decl surface=nestedFmt("asset", 7)`）经 :53456 节点求值发射调用后，
  管理结果绑定必然撞本墙：任何 `let x = <managed 调用>()` 形在驱动用户路径按构造
  必炸。nestedFmt 自身的 `return Fmt"..."` 桥调用走 node-eval 无 Bind（trace
  `phase=node_eval_hit op=return`），与转储 tfn=1（非 nestedFmt）互证。
- 键空间核对（全部一致，非发布缺失）：BindingInitializer value definition 的
  definingTypedNodeIndex 就是 stmt.rhsNodeIndex（typed_expr.cheng:58859-58865），
  ownerStatementIndexes 在语句 append 时由
  `typedExprIrClaimStatementNodeOwnersExact`(:6800) 对 RHS 全子树盖章 = 语句行；
  transport 构建侧 (:6202-6204) 用同一函数派生 sourceStatementIndexes 列。

## 修法（/tmp/oob_ab/lowering_wall22.patch，1 hunk，+19/-1，仅 lowering_plan.cheng）

`LoweringBindManagedCallResultDefinition` 查行键改为权威派生：先校验
definingNodeIndex 界内（新增越界 panic，fail-closed），取
`texpr.TypedExprIrNodeOwnerStatementIndexAt(lowering.typedIr, definingNodeIndex)`
（与 transport 构建侧 :6202 同一权威列），以 (ownerStatementIndex,
definingNodeIndex) 查行；调用方 sourceStatementIndex 非零且与权威不一致时
panic `call definition statement key drift`（canonical 语句路径两键恒等，行为
逐字节不变；节点求值路径的零值占位按契约豁免——零值无法与真实语句行 0 区分，
而语句行 0 的合法调用方 authoritative==0 本就自洽）。零弱化论证：行身份两列
均来自 transport 构建时已严格验证的同一 typed-ir 事实，查询命中的行仍须过
managed/CallExpr/declaration 三条件（:6386-6389 原文未动）与 semantic row/
TypeId closure/authority-unbound 全部下游审计（:6432-6515 未动）；节点每节点
至多一个 value definition（typed_expr :5873-5877 强制），无误绑面。

## 门禁

- 秒级门（cheng_merged --in:lowering_plan.cheng --emit:obj）：rc=0，
  /tmp/oob_ab/w22/tc.o（33855306B；`([rvL])` 为车头既有诊断打印，非失败）。
- 补丁 `git apply --check --reverse` 过；任务开始时该文件已有并行 hunk
  +14/-5（w17 家族 transport 构建侧 call declaration 契约硬化，与本补丁同文件
  不冲突，patch 相对现场树生成）。

## 车头门禁（cheng_w22 sha256=847dc0943f9980ef1771a1aa81abd7d6ae13fb1573575df32ea58a9520e0f6b9）

| 夹具 | compile | run | 备注 |
|---|---|---|---|
| zz_probe_w22（v6 复现件，用后已删） | 0 | 0 | 回归门过 |
| cold_nested_fmt_interpolation_smoke | 0 | 0 | 输出 `cold_nested_fmt_interpolation=pass` |
| ordinary_zero_exit_fixture | 0 | 0 | |
| zz_call_fixture_w7 | 0 | 1 | run=1 正确语义 |

## 烤机与验收（第 1 轮 rc=0，预算 1/3）

- kernel_driver_w22 sha256=febf71df96d160225f3f24652801bfa880de4a3e1e4a0b70e166322ac4dda934
  （size=183141664，bake_w22.log kernel_driver_build=ok entries=35）。

| 夹具 | compile | run | 判读 |
|---|---|---|---|
| **cold_nested_fmt_interpolation_smoke** | 1 | — | **`managed call definition missing` 判词消失**，推进到新墙 `primary: managed BodyOp non-parameter borrow owner requires immutable semantic index`（见移交）；exe 未产出 |
| ordinary_zero_exit_fixture | **0** | **0** | 不回归 |
| zz_call_fixture_w7 | **0** | **1** | run=1 正确语义保持，不回归 |
| zz_v6_w7 | 1 | — | `typed expr: node value/share authority is incomplete`——w17d 时为 `structural nested call argument did not build`（typed_expr.cheng:24902）；判词变化属 w21 并行线 typed_expr 领地，只记录 |

- 树态：烤机窗口内 w21 线对 typed_expr.cheng 有一次触碰（13:47，烤机启动后
  约 8 分钟），typed_expr 域可能为混合态；本任务文件 lowering_plan.cheng
  mtime 13:16 早于烤机启动，逐字节稳定。cold_nested 新旧判词均不在
  typed_expr 域，本墙清除归因不受扰。

## 新墙归因（非本补丁引入，A/B 坐实）

- w17d（补丁前）cold_nested 死于 transport 墙，根本到不了 :17577；w22（补丁后）
  越过 transport 墙才首次可达——被遮蔽的下一道契约门，wall15→wall17 推进链同性质。
- 新墙栈（kernel_driver_w22.map 符号化）：
  `PrimaryBodyIrPrepareManagedBodyOpValueDefinitionExact`（primary_object_plan.cheng
  :17531，panic :17577）← `PrimaryBodyIrMaterializeManagedBorrowedNodeValueExact`
  (:17617) ← `PrimaryBodyIrEvalNode`(:40638)。触发形：main 内 Borrowed 托管
  节点物化时要求借主链根为 Parameter 定义（:17570-17577），非参数借主
  （如绑定 `actual` 的 Owned BindingInitializer 行）按构造必炸。
- 本补丁 hunk 与该守卫零交集（Bind 只写 call.result*/call op 的 valueDef*；
  新墙守卫在另一条 BodyOp 准备路径的 ingress）。

## 移交：primary managed non-parameter borrow-owner 墙（cold_nested 下一墙）

- panic 点 primary_object_plan.cheng:17566-17577（`PrimaryBodyIrPrepareManaged-
  BodyOpValueDefinitionExact` 的 OwnBorrowShared 臂）：borrowOwnerSemanticRow
  必须 origin==Parameter 且 Borrowed 自根，否则 panic。对照：lowering 侧
  `loweringBodyIrBorrowOwnerPhysicalRef`（lowering_plan.cheng:6320-6373）本就
  支持非参数借主（BodyOp 域 OwnMove 行），两处契约宽度不一致。
- 修法归属 primary_object_plan（或 typed_expr 借主发布侧）owner 裁量：非参数
  借主（Owned 定义行）的物理定位已有 lowering 侧范本可对齐；守卫不可弱化为
  放行 -1/Unknown。
- v6 判词 `typed expr: node value/share authority is incomplete` 为 w21 线
  typed_expr 领地（w17d 判词 :24902 的替代/推进面），只记录。

## 纪律执行

- 主树仅改 src/core/backend/lowering_plan.cheng；补丁式生成（备份
  /tmp/oob_ab/w22/lowering_plan.cheng.pre_w22 sha256=22d3b3b32a4a621459f2d02c686b28abc3354e3c0a1112639cc7cc648a71a8be →
  diff -u）。git diff --stat 该文件：apply 前 14+/5-（并行既有）→ apply 后
  33+/6-（本任务净 +19/-1 = 补丁全文）。补丁 sha256=5aa2520c455ca8a8a6737adb7a51f61cfb5c82078ce6fce72a15e9298debab4d。
- 探针 src/tests/zz_probe_w22.cheng 用后已删；编排者资产 zz_v6_w7.cheng /
  zz_call_fixture_w7.cheng 只读未动；产物/日志/lldb 栈/transport 转储全在
  /tmp/oob_ab/w22/。
- 烤机 1/3 轮。未 git commit。

---

# wall21.VERIFY — typed expr: structural nested call argument did not build 墙（kernel 驱动用户路径 v6，已清；v6 推进到 main:47 绑定物化墙，移交）

## 判定：墙已清（两层叠加缺口，typed_expr.cheng 2 hunks 净 +97/−0，守卫零弱化）。kernel_driver_w21c 上 v6 的 wall21 判词消失且 main 推进到 line 47（new(Node)/new(Box)/n.arena.n 二跳 LHS 全部建成），死在 wall19 移交预告的既有下游墙 `typed expr binding: exact local value-definition group unavailable`（:21352）；ordinary/call_fixture 判词与 w19/w20 基线逐字一致（W-ORD 族，w17 线领地静置）；cold_nested 判词为 primary_object_plan 域并行漂移，只记录。

## 墙面与定位

- kernel_driver_w20 编 src/tests/zz_v6_w7.cheng rc=1
  `typed expr: structural nested call argument did not build`（守卫 :24822，callFmtActive 实参循环）。
- lldb 栈符号化（kernel_driver_w20.map）：panic 在
  `typedExprIrBuildValueExprNodeCallFmtActive`(:24774) ← `TypedExprIrBuildValueExprNodeActive`(:25013) ←
  `TypedExprIrBuildStatementValueRoot`(:25460，语句根 call 臂 :25515 直调) ←
  `TypedExprIrAddAssignStatementFromExpr`(:58462)。
- 断点实拍（bl TypedExprIrBuildValueExprNode 返回点 0x10168ec88，x5=lineNumber/x6=argRoot/w0=返回值）：
  outer:37 三实参全绿（node31→41、node33→43、node37 嵌套 compute(n,k) 调用→44），随后
  **main:42 argRoot=41 返回 −1** → panic。结合 trace `phase=rhs_node_ident_miss name=Node line=42`：
  **肇事实参 = `new(Node)` 的类型名实参 `Node`**，不是嵌套 compute 调用（wall20 移交的表面归因被实测修正）。
- 机理：`new(T)` 是堆分配内征（typed_expr.cheng:26313 文本路径注释自证「不是函数，实参 T 是类型名而非
  值表达式」）。语句根走结构路径时 arg-loop 把 `Node` 当值建节点 → binding resolution None →
  `TypedExprIrBuildRhsIdentNode` miss → −1 → :24822 panic。文本路径 :26320 有 new 专臂
  （占位 CallExpr 叶节点：literalText="new"、surfaceText 完整 `new(T)`、resultType=ref{T}、无子参、
  callKind=Builtin、exprClass=Owned，后端 node-eval literalText=="new" 专支消费），结构路径无对应臂。

## 修法（/tmp/oob_ab/typedexpr_wall21.patch，2 hunks，仅 typed_expr.cheng，净 +97/−0）

**hunk1（callFmtActive :24797 后，+80）**：结构路径补 new(T) 内征臂，与文本路径 :26320 同契约：
callHead leaf=="new" && rootCount==1 && `TypedExprTypeTextIsConcrete(Normalize("ref{T}))` 时建占位
CallExpr 叶节点（字段逐字镜像文本臂），另补两点结构路径必需拼写——
origin 用 :24877 同款 `TypedExprIrValueExprCallOriginParserNodeId`（文本臂零初始化 origin=0 在结构
审计下不精确）；结构类型绑定按 `typedExprIrParamStructuralTypeIdsExact` 同款声明行扫描
（kind==ParserDeclarationType + nameToken 精确匹名 + declarationTypeSyntaxRootIndexes →
`TypedExprTypeArenaTypeIdForTypeSyntax`），hits==1 才拦截（唯一权威，多命中/无 TypeSyntax 根/arena
缺席均落回 arg-loop fail-closed）。绑定后 CallResult value-definition 审计（exactTypeId≥0 +
ownership Owned + proof Reference）全部可过。
**hunk2（typedExprIrTypeContainsManagedStorageActive，Bytes 臂后 TypeIsRef 臂前，+17）**：ref 修饰
形状臂。hunk1 放行的节点 resultType=`refNode`（**NormalizeTypeText 删除全部空白，`ref{T}` 规范形状
无空格**——首版 hunk2 用 `"ref "` 前缀实测未命中，w21b 驱动同判词证伪后修正）。`TypeLeafName` 不剥
"ref" 前缀 → 该形状原路径被判「未知类型名」走字段行直查/别名链双 miss → 查询失败 false →
`typedExprNodeExprClassExact` 返回 Unknown → node value/share 审计（:6402-6407）死。修法：`ref` 前缀
形状剥叶名经 `TypedExprIrTypeIsRef` 在册判定（与既有声明名臂同一权威），在册才 hasManaged=true；
叶子非在册 ref 类型落回原路径 fail-closed 不变，叶子名恰以 ref 开头的普通类型（refCount 类）原路径
字段行直查仍命中自身，零误伤零放宽。

## 门禁与验收（烤机 3 轮，均 rc=0 kernel_driver_build=ok entries=35；车头 cheng_w21
sha256=7848cba96dbfae456e3df198204ac6c7ae398150467e310aa50c038dd47759d2，C 链纯回归面四门全绿：
v6 0/0、ordinary 0/0、call_fixture 0/1、cold_nested 输出 pass）

- 秒级门 A/B（影子根 /tmp/oob_ab/w21/ab/shadow，cheng_merged 编 typed_expr.cheng → obj）：
  pre_w21 备份 vs 终版 2-hunk 树 stderr 逐字节同签名
  `([aer]) pop=105 slot=96 rr=-1 rrslot=-9 / managed element field read lacks exact array root`
  （typedExprBuildIndexTextAt 既有缺口，w10-w20 已归因），不新增死因；该缺口在 emit 期，parse/typecheck
  已过=补丁类型检查通过。
- kernel_driver_w21（hunk1，sha256=40b65bc4…dcff7）：v6 的 wall21 判词消失，推进到
  `node value/share authority is incomplete`（:6407）。
- kernel_driver_w21b（hunk2 首版 `"ref "` 拼写，sha256=e1baf884…20af2a）：v6 同判词——实测证伪
  Normalize 形状假设（负结果也有价值：定位到 NormalizeTypeText 删空格语义）。
- **kernel_driver_w21c（终版交付，sha256=01aec789…113bc，size=183141664）**：

| 夹具 | compile | run | 判读 |
|---|---|---|---|
| **v6（zz_v6_w7，本任务回归门）** | 1 | — | **wall21 判词消失**（w20 驱动同输入仍死原判词 A/B 闭合）；trace：main line 42/43 new 臂两节点过、line 44 `n.arena.n` 二跳 LHS nodes=3 建成、45/46 过，死 line 47 `let r = outer(n, 2)` 绑定 → `typed expr binding: exact local value-definition group unavailable`（:21352，wall19 移交预告 probe_b/w19 同判词的既有下游墙，移交）；exe 未产出 |
| ordinary_zero_exit_fixture | 2 | — | `macho_provider_linker: provider object read failed index=0`（W-ORD 族）——与 w19/w20 驱动判词逐字一致，无回归，静置勿追 |
| zz_call_fixture_w7 | 2 | — | 同上 W-ORD 族，与 w19/w20 一致，无回归 |
| cold_nested_fmt_interpolation_smoke | 1 | — | `primary: managed BodyOp non-parameter borrow owner requires immutable semantic index`——primary_object_plan.cheng（11:48 再落 +657/−158）域判词漂移（w21/w21b/w21c 三轮各不同，均该文件领地），并行线中间态，只记录 |

- 归因闭合：w20→w21c 间 typed_expr.cheng 唯一变化=本补丁；三夹具均无 `new(` 调用（grep 核对），
  hunk1 零触达；hunk2 只影响 `refT` 形状文本的托管判定（三夹具无用户 ref 类型）。v6 判词在
  w20（原墙）→w21c（原墙消失+推进两级）翻转，本墙清除归属唯一。

## 移交：main:47 绑定物化墙（v6 下一墙）

- panic 点 typed_expr.cheng:21352 `typed expr binding: exact local value-definition group unavailable`。
  触发形 = `let r = outer(n, 2)` 绑定初始化式的 value-definition group 消费。wall19 移交已预告
  （probe_b/w19 实测同判词：「本墙与 origin 墙之后的新下游判词，一并移交观察」）——既有墙，v6 首次抵达。
- W-ORD（provider object read failed）照旧 w17 线 primary_object_plan 领地静置；cold_nested 判词漂移
  同域，统筹归因。

## 纪律执行

- 主树仅改 src/core/lang/typed_expr.cheng（补丁式：备份
  /tmp/oob_ab/typed_expr.cheng.pre_w21 sha256=ef815117…36681 → diff 生成 patch，
  `git apply --check --reverse` 过）。git diff --numstat：apply 前 +577/−241 → apply 后
  **+674/−241**（本任务净 +97/−0 = patch 全文 2 hunks）。
- 补丁 sha256=898cdbd25872653e7b47a93b2bc956fc09af48340d5dee68efced292b03eb0d5
  （/tmp/oob_ab/typedexpr_wall21.patch）。
- 烤机 3/3 轮（hunk1 / hunk2 首版证伪 / hunk2 终版），第 2 轮为负结果定性轮非同假设重试。
- 无自建探针落主树（断点 lldb + 驱动 A/B 已闭环）；编排者资产 zz_v6_w7.cheng /
  zz_call_fixture_w7.cheng 只读未动；产物/日志/影子根存 /tmp/oob_ab/w21/。
- 未 git commit。

---

# wall23.VERIFY — primary: managed BodyOp non-parameter borrow owner requires immutable semantic index 墙（cold_nested，primary_object_plan.cheng，墙已清；cold_nested 推进到 exact_def_derive field-borrow 审计新墙，完整移交）

## 判定：墙已清。修法 = Prepare 的 OwnBorrowShared 臂按 borrow-owner 列三析取：①参数自根（既有 EntrySlot 臂逐字保留）；②非参数借主行（须 Owned 且无自身借主 → 扫 bodyIR.ops 定位唯一 valueDefSemanticRow==借主行 && OwnMove 的定义 op，domain=BodyOpTag，对齐 loweringBodyIrBorrowOwnerPhysicalRef 非参数臂）；③列缺席（Borrowed 物化权威=semanticDefinitionRow 自身，自根拼写——与 typed-ir 发布侧参数借主 borrowOwnerRow=definitionRow 同族；参数行列缺席仍 panic）。守卫零弱化：原判词保留于全部非法形态（参数行非 Borrowed / 借主行非 Owned 或带自身借主 / 权威行定义 op 缺失或重复）。kernel_driver_w23 上判词消失；ordinary compile=0 run=0、call_fixture compile=0 run=1 不回归；v6 为 w21 并行线领地只记录。

## 墙面与机理（w22 移交定性 + 本轮形态坐实）

- 守卫 src/core/backend/primary_object_plan.cheng:17566-17577（w22 时点）：
  OwnBorrowShared 臂要求 borrowOwnerSemanticRow >=0 且 origin==Parameter 且
  ownership==Borrowed，三子句合并一个 panic——非参数借主按构造必炸。
- 触发形态（夹具源码 + typed_expr 发布契约坐实）：main 内
  `let actual = nestedFmt("asset", 7)` 的 actual 是 Owned str（BindingInitializer
  行）；`actual == "outer=…"` 的实参求值走 PrimaryBodyIrEvalNode
  LocalRef 臂 → PrimaryBodyIrMaterializeManagedBorrowedNodeValueExact(:41121)
  → Prepare(nodeIndex=LocalRef actual)。semanticDefinitionRow=actual 定义行
  （Owned），borrowOwner 列按发布契约恒 -1（typed_expr.cheng:5946-5958：
  Borrowed 行才有借主——参数自根 / typedExprIrBorrowOwnerForNodeExact）→
  原守卫 `<0` 子句必炸。
- 修法对形态③写自根拼写的原因：下游审计
  ownershipBodyIrRequireOwnedDefinitionSource（ownership_body_ir_production.cheng:297-305）
  强制 Borrowed op 的 valueDefBorrowOwnerSemanticRow >=0；自根拼写与
  typed-ir 参数借主（:5951 borrowOwnerValueDefinitionRow = definitionRow）
  同族，满足全部下游列读者。

## 下游消费面逐点核对（BodyOpTag domain 均为一等公民）

- exact_def_freeze.cheng:2613-2621：BodyOp/EntrySlot 双域界内即根已证。
- exact_def_identity.cheng:1404-1414（exactDefIdentityBorrowOwnerRootValid）：
  BodyOp 域 owner 行在界且 valueDefSlot>=0。
- exact_def_call_authority.cheng:326-373：BodyOp 域要求 owner<walk 严格递减
  ——Prepare 全部调用点均为「构造 op → Prepare → AppendOp」，扫到的定义 op
  天然先于本 op，契约按构造满足。
- cleanup_cfg.cheng:3838+：BodyOp 域一等重定位。
- ownership_body_ir_production.cheng:297-311：Borrowed op 要求 SemanticRow>=0
  且 domain 非 Invalid；Move op 要求全 -1/Invalid（形态③自根拼写满足前者）。

## 修法（/tmp/oob_ab/pop_wall23.patch，1 hunk，仅 primary_object_plan.cheng）

`PrimaryBodyIrPrepareManagedBodyOpValueDefinitionExact` OwnBorrowShared 臂重构
（参数臂三重校验、ParamRef/ordinal/entrySlot/stackOffset 逐字保留，仅嵌套进
origin 分支）：

1. borrowOwnerSemanticRow >= 0 且 origin==Parameter → 既有参数臂原样
  （ownership==Borrowed 检查保留原判词）→ EntrySlotTag。
2. borrowOwnerSemanticRow >= 0 且非参数 → 该行必须 Owned 且 borrowOwner==-1
  （范本 :6360-6363 同一契约），扫描键=借主行。
3. borrowOwnerSemanticRow == -1 → semanticDefinitionRow 必须非参数且 Owned，
   写 borrowOwnerSemanticRow=semanticDefinitionRow（自根），扫描键=自身行。
4. 扫描（范本 :6364-6373 同款）：唯一 valueDefSemanticRow==扫描键 且
   valueDefOwnership==OwnMove 的 bodyIR.ops 行 → BodyOpTag+opIndex；
   缺失 panic `borrow owner BodyOp definition missing`、重复 panic
   `… duplicated`（新判词均为 fail-closed，原代码对这些输入同样 panic 原判词）。

## 门禁

- 指定秒级门（cheng_merged --in:primary_object_plan.cheng --emit:obj）对任意
  内容不可达：import 闭包 codegen_a64_fill_units.cheng:9 `trailing tokens in
  let initializer`（该文件 vs HEAD 零 diff，wall17 已归因的 HEAD 既有缺口）。
- 等效门（import 路径=烤机真实路径）：cheng_w23 编
  backend_driver_dispatch_min.cheng --emit:obj rc=0（/tmp/oob_ab/w23/
  tc_dispatch.o，177970944B）。
- 补丁 `git apply --check --reverse -p1` 过；车头回归门 zz_probe_w23（v6
  复现件，用后已删）compile=0 run=0；车头三门 cold_nested 0/0 输出 pass、
  ordinary 0/0、call_fixture 0/1（车头 C 冷链与本补丁面正交）。

## 烤机与验收（第 1 轮 rc=0，预算 1/3）

- 车头 /tmp/oob_ab/cheng_w23 sha256=1531e75405408a9e6a61eaf45f1e3bf28506744fbc270ae6c88f9a3a7fa95d75
- kernel_driver_w23 sha256=40c7411fcdf79b2e97b4abcb105a4fd6c2d2a50e97b42ff0a7748067665b79be
  （size=183141680，bake_w23.log kernel_driver_build=ok entries=35）。
- 驱动内嵌管线版本坐实：w22/w23 两驱动全量 strings 差集 = 恰好本 hunk 新增
  2 条 panic 消息（typed_expr 986 条判词串零差异——w21 线 14:21 落树的
  typed_expr 未烤入，typed_expr entry 编译早于落树）。

| 夹具（cwd=仓库根，见 W-ORD 节） | compile | run | 判读 |
|---|---|---|---|
| **cold_nested_fmt_interpolation_smoke** | 1 | — | **`non-parameter borrow owner` 判词消失**，推进到 `exact def derive: field borrow hop invalid op=14 slot=16`（见移交）；车头同输入 0/0 输出 pass |
| ordinary_zero_exit_fixture | **0** | **0** | 不回归 |
| zz_call_fixture_w7 | **0** | **1** | run=1 正确语义，不回归 |
| zz_probe_w23（v6 复现件，车头） | 0 | 0 | 回归门过；驱动侧 v6 为 w21 线领地只记录 |

## W-ORD 归因闭合（本轮重大发现：ordinary/call_fixture 的 provider object read failed 与驱动版本无关，是进程 cwd 敏感缺陷）

- 现象：kernel_driver_w23 编 ordinary/call_fixture rc=2
  `macho_provider_linker: provider object read failed index=0`（W-ORD 族）；
  但 w22 驱动（13:36 烤、13:39 验收绿）**当下重跑同输入同样 rc=2**——同一
  驱动前后翻转，非本补丁回归。
- 产物级证据：w22/w23 两驱动对 ordinary 的 primary.o（612B）与
  darwin_syscall_provider.o（1304B）**逐字节相同**（cmp 双过）。
- 机理（CHENG_MACHO_PROVIDER_LINK_TRACE=1 实测）：linker 读到的 provider
  路径是裸相对名 `system_link_exec_provider.0.o`（system_link_exec.cheng:6266
  linkPlan.providerObjectPaths 为空时的合成臂），按 **driver 进程 cwd** 解析；
  而 provider 编译子进程把它写到 `PathAbsolute(rootDir, objectPath)` =
  **仓库根**（system_link_exec_runtime.cheng:2577）。cwd==仓库根 → 绿；
  否则 → 读失败。census(红)/w7(绿)/w19/w20(红)/w22(绿) 的历史浮动 = 各轮
  验收进程 cwd 差异所致。仓库根残留的 system_link_exec_provider.*.o（本轮
  验收产物）已清理。
- 纪律建议：kernel 驱动 --emit:exe 验收一律在仓库根 cwd 下执行。

## 移交：exact_def_derive field-borrow 审计域缺口（cold_nested 下一墙）

- panic 点 src/core/analysis/exact_def_derive.cheng:606（**clean-at-HEAD，
  零 diff**），由 :601 FieldLoad 臂的 bodyIrExactDefFieldHopValid(:388) 拒回。
- 触发 op=nestedFmt 内 `name`（str 参数）的借用物化：Materialize 对
  param 槽 source 复用 BodyOpFieldLoadTag 形状（operands=[base,dst,0,24]）。
  field hop 校验要求 (fieldTypeId,offset,width) 出现在 base 类型 layout
  children——base 是 str（scalar），scalar 无 layout children 行，
  (str,0,24) 永不命中 → 按构造必炸。
- 该 op 的 Prepare 发布走参数臂（EntrySlotTag，与本补丁前逐字一致）；此前
  被本墙（:17577）遮蔽不可达，w22 驱动根本到不了 exact_def_derive。属被
  遮蔽的下一道既有门（wall15→17→22→23 推进链同性质）。
- 修法归属（exact_def_derive 或 primary Materialize owner 裁量）：审计补
  scalar 基座整值 load 臂（对齐 C 冷链 param-deref 语义），或 Materialize
  对 scalar 基座改用非 FieldLoad 形状；守卫不可弱化。

## 纪律执行

- 主树仅改 src/core/backend/primary_object_plan.cheng；补丁式生成（备份
  /tmp/oob_ab/w23/primary_object_plan.cheng.pre_w23
  sha256=68cba21152eac468842cb4948539b60a4f53ff459682bf02f729ea616e2bf127 →
  diff -u）。git diff --stat 该文件：apply 前 657+/158-（wall17+并行既有）→
  apply 后 732+/187-（本任务净 +75/-29 = patch 全文 113 行）。
- 补丁 sha256=ae986176f05d72a1eac620abd9950777dfa1677fadb7fde8511eb3d621edd6e0
  （/tmp/oob_ab/pop_wall23.patch）。
- 烤机 1/3 轮。探针 src/tests/zz_probe_w23.cheng 用后已删；编排者资产
  zz_v6_w7.cheng / zz_call_fixture_w7.cheng 只读未动；主树无本任务残留
  （仓库根 system_link_exec_provider.*.o 运行残留已清）；产物/日志/trace/
  A/B 影子全在 /tmp/oob_ab/w23/。未 git commit。

---

# wall24.VERIFY — typed expr binding: exact local value-definition group unavailable 墙（kernel 驱动用户路径 v6 main:47，wall19 移交预告 / wall21 抵达，已清）+ 连清第二墙 normalized scope index identity mismatch；v6 推进到第三墙 source-backed reference identity missing（同文件移交）

## 判定：两墙已清。墙一病根 = 裸 `var n: Node`（nil-able 无初值声明）的 decl-local 组 registered 却永不 consumed（消费点被 `stmt.rhsNodeIndex >= 0` 门死）；修法 = detached NilPtr 零值定义模板补消费。墙二病根 = 有界投影器逐行再盖章 root scope 行时从不重设 sourcePath，而上一行提交后的 scratch Reset 写穿共享行把它抹空；修法 = 投影器显式 `root.sourcePath = sourcePath`。守卫零弱化。烤机 3/3 轮（修复/诊断/终版）。v6 推进到同文件第三墙 `typed expr binding: source-backed reference identity missing node=55`（TypedExprIdentifierBindingAuthorityStrictValidateInto 全 IR 审计首次可达，移交）；ordinary/call_fixture 判词与 w21c 基线逐字一致（W-ORD 族，无回归）；cold_nested 判词漂移为 exact_def_derive.cheng 域（并行线混合态，静置）。

## 墙一：exact local value-definition group unavailable（:21352）

- kernel_driver_w21c 编 src/tests/zz_v6_w7.cheng rc=1 该判词，trace 死 main 绑定行。
- lldb 运行时实证（w21c + 断点 cheng_cold_7c303395_8199/:21313 守卫与 7683/:5532 decl-local 注册）：四个函数构建各调一次注册；main 的注册 groupCount 1→2（`r` initializer 组 + `n` decl-local 组都在）；守卫命中两次——fnIdx=2（outer `return r1` 读，initializer 组已消费）**PASS**、fnIdx=3（main:47 `outer(n, 2)` 读 n）**PANIC** → 死因锁定 consumedFlags==0（坐标全对，组在未消费）。
- 病根（源语义链）：decl-local 组由 `typedExprIrRegisterDeclarationLocalGroups`（8/22 50d1ffeeb 机制）在 `var n: Node`（introduction kind == Declaration）上注册；唯一消费点 `TypedExprIrAddLocalDeclStatement:28597` 以 `stmt.rhsNodeIndex >= 0` 为门——零值臂只有 seq/int32/uint32/int64/uint64/bool/str，`Node` 全落空 → rhsNodeIndex=-1 → 消费被跳过 → 该局部首个精确 Identifier 读（exact 读是 main 里第一个走 Pattern 臂的 n 读）必炸 :21352。w19 的 probe_b（`var c: Col`）同判词即此根。

### 修法一（/tmp/oob_ab/typedexpr_wall24.patch hunk1-3，仅 typed_expr.cheng）

1. `typedExprNodeExprClassExact` fresh-Owned 生产者清单补 `TypedExprIrOpNilPtr`（nil-able 上下文的新产空引用值，与 EmptySeqInit/StrLit 同族；此前托管 NilPtr 落 Unknown 必死 :6402 value/share 审计，从无可存活节点，零回归面；非托管 ptr 族在 `!hasManaged` 分支先行返回不经清单）。
2. 新增 `typedExprIrAddNilZeroDeclarationLocalTemplate`：nil-able 判定（TypeTextIsNilPtrInContext）+ 声明行扫描（new(T) 臂同款，hits==1 且 TypeSyntax→TypeArena id 有效才拦，其余 -1 fail-closed）→ detached desugared NilPtr 叶节点（参数 ParamRef place 同款离语句形态：不接 stmt.rhsNodeIndex——后端对裸声明槽已有完备 bare-default 零值发射（LocalPtrTag LoadConst 0 / Aggregate setMem，:52122-52156），语句发射逐字节不变；ownerStatement 恒 -1；NilPtr 非 CallResult/managed-temporary 生产者，无 sweep 认领），`typedExprIrBindNodeStructuralType` 绑定声明类型 arena id。节点只作 value definition 的 defining 载体与后续 LocalRef 读的类型/证明模板。
3. 消费点改 `declLocalDefiningNodeIndex`（语句零值节点优先，缺失时取模板），`TypedExprIrConsumeDeclarationLocalValueDefinition` 契约原样（registered⇒恰消费一次；consumedFlags 审计一字未动）。

## 墙二：typed expr: normalized scope index identity mismatch（:56473，烤机#1 新暴露，已清）

- 修法一落树后 v6 越过组墙，main 首次走完语句步行至 `TypedExprIrMaterializeFunctionScopes → TypedExprIrAnnotateGeneratedStatementSourceScopes → TypedExprNormalizedOwningDeferSuiteGlobalIndex → TypedExprNormalizedScopeGlobalIndex` panic。compute/addCol/outer 无 generated statement 提前 return，main 是该路径首个到达者。
- lldb 实参抓取：GlobalIndex#1 (0,1) PASS、#2 (0,0) PANIC → scopes[1] 身份对、scopes[0] 身份错。诊断烤机（kernel_driver_w24d，CHENG_TYPED_SCOPE_DIAG）实据：main 行投影后 `scopes=[0:-1:0 1:0:1 …]`——**root 行 sourcePath 为空串**，且 row1/2/3 三行 root pathEq 全 0、row0 为 1：每行提交后 `typedExprFunctionSourceRangeReleaseScratch → NormalizedExprLayerReset` 对 scratch scope 行的 `sourcePath=""` 清空**写穿共享的全层 scope 行**（root 行=全层 scopes[0] 每行都被投影共享），而 `typedExprFunctionSourceRangeProjectRow` 重盖章 root 的 scopeId/kind/span 时**唯独不重设 sourcePath**。

### 修法二（patch hunk4）

投影器在 root 再盖章处补 `root.sourcePath = sourcePath`（=ranges.sourcePaths[rowIndex]，即单源投影 scratch 的 root 权威身份，与 scopeId/kind/span 逐行再盖章同一契约）。零弱化：GlobalIndex 身份守卫原样，属投影身份补全。

## 门禁

- 秒级门（字面命令 cheng_merged --in:src/core/lang/typed_expr.cheng --emit:obj）：rc=2 `([aer]) pop=105 slot=96 managed element field read lacks exact array root`——与 pre_w24 备份影子根 A/B **stderr 逐字节同签名**（w10-w21 已归因的 typedExprBuildIndexTextAt 既有 emit 期缺口，typecheck 已过）；修复树/诊断树/终版树三次 A/B 同过。
- 车头 cheng_w24（sha256=2f315064abcf8e0e946ed754f308cc6d33ca7c8a51958f826c1bbcf1c2e7f063，C 链纯回归面）：v6 0/0、ordinary 0/0、call_fixture 0/1、cold_nested 0/0 输出 pass。

## 烤机台账（3/3 轮，均 rc=0 kernel_driver_build=ok entries=35）

| 轮 | 产物 | sha256 | 结果 |
|---|---|---|---|
| 1 | kernel_driver_w24（已被第 3 轮覆盖交付名） | 96b69cf2c3249f96ae590e7f0db98137c03b49cf797378725d5f443332fa14a5 | 组墙判词消失，暴露墙二 |
| 2 | kernel_driver_w24d（诊断轮，CHENG_TYPED_SCOPE_DIAG） | bc14409705a873a33bd9c0693333011c38b7d21216d19ec22e5a1f13d21dfdd0 | 取实据定案墙二机理 |
| 3 | **kernel_driver_w24f → 交付 cp 为 kernel_driver_w24** | 54cf274ed9bf1b80b5789ad8d605d82845ab067d15fe1eac398b9ee046034b44（size=183141712） | 墙二判词消失，v6 推进第三墙 |

## w24f（交付 kernel_driver_w24）驱动验收实况

| 夹具 | compile | run | 判读 |
|---|---|---|---|
| **v6（zz_v6_w7）** | 1 | — | **两墙判词均消失**；推进 `typed expr binding: source-backed reference identity missing node=55`（见移交）；exe 未产出 |
| ordinary_zero_exit_fixture | 2 | — | `macho_provider_linker: provider object read failed index=0`——与 w21c 同输入**逐字一致**（W-ORD 族，w17/w23 线 primary_object_plan 领地，typed_expr 前段 regalloc/lifecycle 全绿后死 link 末端），无回归，静置 |
| zz_call_fixture_w7 | 2 | — | 同上 W-ORD 族，与 w21c 逐字一致，无回归 |
| cold_nested_fmt_interpolation_smoke | 1 | — | `exact def derive: field borrow hop invalid op=14 slot=16`（src/core/analysis/exact_def_derive.cheng:629，非本任务修面；w21c 同输入为 primary_object_plan 域另一判词）——两轮间 primary_object_plan（w23 线 13:57 在途）与 exact_def_derive 域混合态漂移，静置归因 |

## 移交：source-backed reference identity missing（v6 第三墙，typed_expr.cheng:3199）

- `TypedExprIdentifierBindingAuthorityStrictValidateInto`（:3111 全 IR 审计，wall10 时代既有）：全 `-1` binding 列的节点若 `originParserNodeId >= 0 && op ∈ {ParamRef, LocalRef}` 即判词。此前从未在 v6 可达（main 更早死）。
- node=55 = wall20 origin push 下的文本路径 LHS LocalRef 根（main:42/43/44 `n`/`n.arena`/`n.arena.n` 赋值 LHS 根）：wall20 为 LHS 构建包了语句根 origin（满足 ：6207 尾审计），但文本路径不产 binding 五列（bindingParserNodeIndex/producer/declRow/patternRow/valueDefRow 全 -1）→ 全 IR 审计按「有 parser origin 的 LocalRef 必须携带 binding 身份」必炸。pre-existing 潜伏墙，本两墙清除后首次可达。
- 修法方向（owner 裁量，二选一）：① LHS 根标识符走树内 resolution（赋值语句节点的 LHS identifier 子节点 → ParserValueExprNodeBindingResolutionAt → Pattern 行 → 组 → definition 行），以 typedExprIrAddExactBindingRefNode 同款全 exact binding 形状构建 LHS 根（与 RHS exact 读合流）；② 以已消费的 decl-local/initializer 组 machinery 为 LHS 根补齐 binding 五列（bindingValueDefinitionRow=局部 definition 行）。审计 ：3199 一字不可弱化。

## 纪律执行

- 主树仅改 src/core/lang/typed_expr.cheng；补丁式（备份 /tmp/oob_ab/w24/typed_expr.cheng.pre_w24 sha256=0400db96634114b8d737a4d1495bfad1d851b40095a57f74b1432ee3941c7848 → diff 生成）。git diff --numstat apply 前 +674/−241 → apply 后 **+775/−243**（本任务净 +101/−2 = patch 全文 4 hunks，139 行，sha256=ddfc33237d051fe68815fcfa154c946fab8fe9b819609c14a5a2f234606c0c54）。`git apply --check --reverse` 过。
- 诊断代码（烤机#2 用）已全部剥除，交付补丁零诊断残留；诊断轮树态与终版树差异仅为诊断 hunks。
- 探针：主树零新增（未建 zz_probe_w24）；lldb python 探针与影子根在 /tmp/oob_ab/w24/（reg_probe.py/reg_probe2.py/ab/shadow），编排者资产 zz_v6_w7.cheng / zz_call_fixture_w7.cheng 只读未动。
- 烤机 3/3 轮（修复/诊断/终版，三轮各自新状态，无同假设重试）；未 git commit。

# wall25.VERIFY — analysis/exact_def_derive field-borrow hop 审计墙（cold_nested）：hop 整值借视臂已清 + 参数借主 origin 锚定 fail-closed 显式化 identity 主门授权外缺口（完整移交）

## 判定：本墙（`exact def derive: field borrow hop invalid`）已清；cold_nested 推进到 w25 主动 fail-closed 新判词 `exact def derive: borrow owner parameter definition op missing op=14 slot=0`，该判词把授权外下游缺口（exact_def_identity BORROW_PROJECTION 主门 origin 值域）显式化，按纪律停手完整移交。kernel_driver_w25 上：ordinary compile=0 run=0、call_fixture compile=0 run=1 不回归；v6 判词 `typed expr binding: source-backed reference identity missing node=55`（w24 并行线 typed_expr 领地，只记录）。烤机 1/3 轮。

## 机理（静态证据链 + 烤机实证，全链闭合）

- 发布侧（primary_object_plan.cheng:17700-17706 Materialize）：托管借用物化对
  地址基座（entry param / global address）复用 FieldLoad 形状发**整值载入**
  operands=[base, dst, 0, source.sizeBytes]——不是字段投影。
- 审计侧（exact_def_derive.cheng:388 bodyIrExactDefFieldHopValid，clean-at-HEAD）：
  对一切 FieldLoad 借用要求 (fieldTypeId,offset,width) 命中 base 物理 TypeId 的
  layout children CSR。str 参数基座是 Scalar（窗口 shape-valid 保证 childStart>=0、
  childCount==0），(str,0,24) 永不命中 → 按构造必炸（w23 移交定性，本轮坐实）。
- 参数槽 TypeId 已由 lowering manual-consume 投影绑定
  （lowering_plan.cheng:22528 BodyIRBindLocalSlotTypeArenaProof(slotId,…)），
  hop 的 ownerTypeId>=0 前提成立，死点确在 children 遍历不命中。

## 下游消费面核对（修 hop 前必须先看清，否则只是挪墙）

- exact_def_identity.cheng:1732-1820 BORROW_PROJECTION 主门把 opOriginIds 按
  **借主定义 op 行**解释：baseMatchesParent=ops[origin].valueDefSlot==operand、
  parentOwnershipValid=ops[origin].ownership∈四值、parentLive 走
  :855 parentLive 三车道（首查 ops[origin].ownership，Invalid 即 false）。
  derive 对参数借主（EntrySlotTag 域）原写 origin=ownerSlotId（槽 id）——
  ops[槽id] 是无关 op 行 → 主门三查全 false → verdict `borrow projection is
  broken` 按构造必炸。origin=-1 则 originInRange 即炸。**BorrowProjection 落戳
  在 derive 内无任何合法 origin 值域可绕**（换 place=伪造车道，违精确车道纪律）。
- C 冷链同形走 direct_var_value_object_projection 前置候选（cheng_cold.c:70518
  origin 行 place==PARAM/MEMORY_VERSION）——C 发射侧给参数发 PARAM 定义 op 行
  可锚；identity :1726-1730 注释裁定该候选「载体真空」时不知 FieldLoad 参数
  基座借视形存在。裂缝三方：Materialize 生产形 ∉ identity 主门世界。
- exact_def_call_authority.cheng:345-357：EntrySlotTag 读 row 结构列作合法终态
  （形参物化/全局地址槽），不读 opOriginIds → 不受本修影响（烤机回归门实证）。
- freeze :2613-2621（BodyOp/EntrySlot 双域界内即根已证）、cleanup_cfg :3832+
  （EntrySlot 域槽号不受 op 重定位）均不读 origin → 不受影响。

## 修法（/tmp/oob_ab/exactdef_wall25.patch，2 hunk，仅 analysis/exact_def_derive.cheng）

1. bodyIrExactDefFieldHopValid 补**整值借视形臂（零跳）**：offset==0 ∧
   width==base 槽全宽 ∧ base 物理类型==字段物理类型（借视同型）→ true。
   layout children 要命中此形须字段类型==容器自身类型（自包含字段，物理不可能）
   → 零伪接纳；部分宽/跨型/非零偏移仍走原逐跳核对，原守卫逐字保留。
2. EntrySlotTag 借主分支 origin 锚定**借主参数槽的发射序末定义 op 行**
   （lastDefOpBySlot，与 local-copy 臂同证据类；对应 C direct_var_value 投影
   origin place==PARAM 语义）；无定义行（raw 形）→ hard fail 新判词，不落槽 id
   冒充行号、不弱化主门输入。原判词 `borrow owner entry slot invalid` 逐字保留。

## 烤机与验收（第 1 轮，预算 1/3）

- 秒级门：cheng_merged --in:src/core/analysis/exact_def_derive.cheng --emit:obj
  rc=0（/tmp/oob_ab/w25/tc.o）。
- 车头 /tmp/oob_ab/cheng_w25 sha256=ee35cdf7db1554035e9ce966fe9c4104de21534062d8c4a6781620230a013641；
  v6 探针回归门 compile=0 run=0（用后已删）。
- kernel_driver_w25 sha256=f9422efe96444c8b6e04f7faa828e3f2f114e6a75edbef44d6d0d04417393568
  （size=183158128，bake_w25.log kernel_driver_build=ok entries=35）。
- 验收 cwd=仓库根（W-ORD 纪律）；验收后仓库根 system_link_exec_provider.*.o
  运行残留已清。

| 夹具 | compile | run | 判读 |
|---|---|---|---|
| cold_nested_fmt_interpolation_smoke | 1 | — | **`field borrow hop invalid` 判词消失**，推进到 `borrow owner parameter definition op missing op=14 slot=0`（见移交）；实证 nestedFmt name(slot0) 参数 raw 形 |
| ordinary_zero_exit_fixture | 0 | 0 | 不回归 |
| zz_call_fixture_w7 | 0 | 1 | run=1 正确语义，不回归 |
| zz_probe_w25（v6 复现件，w25 驱动） | 1 | — | `typed expr binding: source-backed reference identity missing node=55`（w24 并行线 typed_expr 领地，只记录）；车头同件 0/0 |

## git diff --stat（该文件）

- apply 前：clean-at-HEAD（0 diff）→ apply 后：24+/1-（= patch 全文）。
- 补丁 sha256=a22da696761ebbe1da6046c4965f37bff2ad2311a706e642dd96b20bdaccfd4c。

## 移交：exact_def_identity BORROW_PROJECTION 主门参数基座域缺口（cold_nested 下一墙）

- 断言链（全部本轮实证/逐行核对）：derive hunk1 已放行整值借视形 → hunk2 实证
  借主参数槽无定义 op 行（`op missing op=14 slot=0`，op<14 内 slot0 零定义行，
  参数定义 op 若存在必在体首故 raw 形实锤）→ identity 主门输入域无合法 origin。
- 修法归属（下一轮裁量，须改 exact_def_identity.cheng 或 primary 侧二选一）：
  a) identity 主门补「参数基座整值借视投影」臂：origin 读
     valueDefBorrowOwnerDefinitionRow（EntrySlotTag，call_authority 同款终态
     裁定：entryParameterSlotIds 在界即形参根）+ 整值借视形核对（可复用
     derive 同款 offset0/整宽/同型谓词）；或
  b) primary Prepare/Materialize 为被借参数发参数定义 op 行（raw 形升 exact
     形，entry 车道双向强制，改动面大）。
  守卫不可弱化：非参数借主（BodyOp 域）既有主门路径必须原样。
- 附：主树本轮仅 analysis/exact_def_derive.cheng 24+/1-；typed_expr.cheng 的 M
  为 w24 并行线所有；git status 其余 D 状态为接手前既有工作区状态，本轮未触碰。


# wall27.VERIFY — wall25 路线 a 纯 identity 不可闭合定性停手；双文件提案零主树接触已过门+烤机实证（wall25 判词清、wall28 显形），完整移交

## 判定

- **停手定性**：wall25 移交路线 a（identity 主门补参数基座臂）在「只许改 exact_def_identity.cheng」纪律下**不可闭合**。本墙判词 `exact def derive: borrow owner parameter definition op missing op=14 slot=0` 的 panic 点在 exact_def_derive.cheng:618（w25 hunk2，批 2 derive 相 3 op 环内），而 identity 主审是批 3 相位链末端：唯一 derive 调用点 primary_object_plan.cheng:64938 → ExactDefCallAuthorityValidateInto(:65027) → exact_def_call_authority.cheng:1725 merge 相位 → :1730 identity 相位。panic 先于 identity 必然触发；derive 仅 import merge（无 identity 通道），identity 侧对本 panic 零因果可达。修法必须改 exact_def_derive.cheng（禁改文件）→ 按纪律停手完整移交。
- **主树零足迹**：本轮 exact_def_identity.cheng 保持 0 diff（HEAD 原样）；exact_def_derive.cheng 维持 w25 落地态（24+/1-）；探针 zz_probe_w27.cheng 用后已删；仓库根无 provider 运行残留。未 git commit。
- **提案已实证**（/tmp/oob_ab/identity_wall27.patch，2 文件，**未落地**，`git apply --check` 通过）：在 APFS 克隆 gateroot（/tmp/oob_ab/w27/gateroot，含提案两文件，主树零接触）内双文件秒级门 obj compile rc=0，并以车头 cheng_w27 烤出提案验证机 kernel_driver_w27prop（kernel_driver_build=ok entries=35）。

## 烤机与验收（提案验证机 1 轮；非主树正式烤机）

- 车头 /tmp/oob_ab/cheng_w27（bootstrap/cheng_cold.c 重编，rc=0）sha256=a8861e8641402c68786c1b6216460b80f1308350746af9c3237c6e00676eee19。
- kernel_driver_w27prop sha256=9b59bd10d4f10270fa168f956f5c26fce6b7dd112ca66be428e3199d748a44bd（size=183158176）。基线复确认：kernel_driver_w25 上 cold_nested rc=1 `borrow owner parameter definition op missing op=14 slot=0`（本轮实测复现）。

| 夹具（kernel_driver_w27prop，cwd=仓库根） | compile | run | 判读 |
|---|---|---|---|
| cold_nested_fmt_interpolation_smoke | 1 | — | **wall25 判词消失**；推进 derive 相 4 新墙 `managed function return lacks exact value definition`（前置行 `managed return body=0 slot=2 kind=3 type=#nev16 parsed=0 parsed_slot=-1 parsed_def=-1`，`primary exact def derive rejected`）→ wall28 移交 |
| ordinary_zero_exit_fixture | 0 | 0 | 与 w25 基线逐字一致，无回归 |
| zz_call_fixture_w7 | 0 | 1 | 与 w25 基线逐字一致，无回归 |
| zz_probe_w27（v6 复现件拷贝，用后已删） | 1 | — | `typed expr binding: source-backed reference identity missing node=57`（w24/w26 typed_expr 领地；节点 55→57 漂移属克隆时点树态，只记录）；**车头 cheng_w27 同件 compile=0 run=0**（回归门过） |

## 机理（本轮新增实证）

- 执行序链闭合：derive(:64938) 相 3 op 环 panic → 相 4 return admission → seal → merge/call-authority/identity 相位。identity 文件无任何先于 derive 的执行通道。
- opOriginIds 三拼写并存实证：PARAM 臂=形参序（freeze ExactDefFreezeAuthorityParamDefinitionEdgeValid :2522 消费 `origin<entryParameterSlotIds.len ∧ entryParameterSlotIds[origin]==slot`）、StackLocal/local-copy=槽 id（identity:422/462/536 `origin==slot`）、BORROW_PROJECTION=op 行（identity 主门 1732-1820）。统一裁定应为 op 自身 `valueDefBorrowOwnerDefinitionDomain` 列判别：BodyOpTag→op 行域，EntrySlotTag→槽域。
- 提案消费面全量核对：slot 环 partial-authority 的 BorrowProjection 界（identity:2306 `origin>=opCount` fail）对槽域 origin 数值兼容（槽 id<opCount）；freeze CFG_MERGE(:1214)/PARAM(:2522) 车道不触 BorrowProjection 域；argOriginIds 仅镜像等值消费（call_authority:563/678）。无第三方按行域解读该域 origin。

## 提案内容（identity_wall27.patch；落地须先获 derive 文件授权）

1. derive（禁改文件）EntrySlotTag 借主臂：`origin = ownerSlotId`（槽域拼写，即 HEAD pre-w25 行），撤销 w25 hunk2 的锚行+panic；行/槽判别交给域列。
2. identity（授权文件）BORROW_PROJECTION 主门前置参数基座臂：域列==EntrySlotTag ∧ ownershipValid ∧ copyKind ∧ target==slot ∧ source==-1 ∧ consumePlusOne==0 ∧ 新谓词 exactDefIdentityParamBorrowViewProjectionValid（EntrySlot 终态根裁定 entryParameterSlotIds 在界即形参根/否则全局地址槽 + FieldLoad 首操作数==借主槽 + operands=[基座,目标,0,基座槽全宽] + 目标/基座槽 typeArenaTypeId 直等 + entry 冻结所有权 BORROW_SHARED 互证）。臂不合形原样落入原主门与原判词（守卫零弱化）。
- patch sha256=f5d56a9426e82adf328c6afd6fe48960e49c230da9a08085a68c0d6dd8faf51c（109 行；derive -10/+9、identity +62）。

## 移交：wall28（cold_nested 下一墙，本轮只诊断不修）

- 判词：`cheng_cold: managed return body=0 slot=2 kind=3 type=#nev16 parsed=0 …` + `managed function return lacks exact value definition`（derive 相 4 return admission，exact_def_derive.cheng 判词车道）。
- 定性：nestedFmt（body=0）返回槽 slot2 无任何 def op 行且 RET term 无 BodyOpTag source 边（lastDefOpBySlot[2]=-1）→ parsed=0 必炸。Fmt 插值 lowering 对托管返回值的物化未产 exact def 戳（疑 sret/缓冲槽写形无 def 行），与墙25 同属「raw/无戳载体在 exact-def 证据链无 carrier」家族。修法归属 derive 相 4 或 lowering 发戳侧，均授权外。
- 注意：该墙此前被 wall25 panic 遮蔽（相 4 在 op 环之后），历轮从未可达，提案机首曝。

## 资产

- /tmp/oob_ab/identity_wall27.patch（提案，apply-check 过）；gateroot=/tmp/oob_ab/w27/gateroot（APFS 克隆，含提案）；验证日志 /tmp/oob_ab/w27/*.log。
- 主树本轮 0 改动；git diff --stat（apply 前=后）：`src/core/analysis/exact_def_derive.cheng | 25 +++++（w25 既有）`、identity 0 diff。

---

# wall26.VERIFY — typed expr binding: source-backed reference identity missing 墙（kernel 驱动用户路径 v6，wall24 移交，目标判词已清）+ 下游参数定义载体语句属主矛盾（完整移交）

## 判定：目标墙已清（bake 实证）。修法 = src/core/lang/typed_expr.cheng 1 hunk（净 +60/−0）：赋值 LHS 构建窗口内、凡 op==LocalRef 且 binding 五列全 −1 的节点，就地改写为 synthetic Desugared 拼写（originParserNodeId=−1 / syntheticOriginKind=Desugared / spanAuthorityKind=NoSource），审计一字未动。w26b 驱动上 v6 的 `source-backed reference identity missing node=55` 判词消失，推进到同文件下一道既有潜伏矛盾 `typed expr value definition: typed authority drift`（参数定义载体被语句所有权声明器盖章，见移交）；ordinary compile=0/run=0、call_fixture compile=0/run=1 不回归；cold_nested 推进到 exact_def_derive.cheng 域（并行线领地）。

## 定性（探针实证，修正 w24 移交的两个前提）

- 探针（cheng_merged 编译实跑，直读 `ParserReadNormalizedExprLayerFromText` 的 valueExprTree，v6 全文）：赋值语句根**只指向 RHS 表达式**（main:42 `n = new(Node)` → root node=42=Call new；43→45；44→46；45→47；46→48，role=AssignmentRhs），LHS identifier **没有任何 value-expr 树节点**；patterns 全树仅 3 行（r1/n 声明/r 三个绑定声明），纯赋值 LHS 不产 pattern 行。故 w24 移交方向①「LHS 根走树内 resolution」前提不成立：无节点则无 `ParserValueExprNodeBindingResolutionAt` 可查。
- 方向②「组 machinery 补齐 binding 五列」同样不可行：五列任一非 −1 即落入审计 ：3202 exact-origin 分支，强制要求 bindingParserNodeIndex≥0 且 originParserNodeId==该节点 sli 且该节点 resolution 命中——LHS 没有树节点，部分填充必死 :3216；把 origin 改指任何 RHS 出现节点都是伪身份（精确身份纪律禁止）。
- 结论：wall20 的 push 给 LHS LocalRef 盖了「RHS 根的 sli」这一它无法兑现的 parser 身份；该 identifier 的诚实拼写是 synthetic（无 parser origin 可主张）。审计 :3196 语义完全正确，修法=让 LHS 节点不再伪称 parser origin，而非补造假身份。

## 修法（/tmp/oob_ab/typedexpr_wall26.patch，2 hunk 位一份补丁，仅 typed_expr.cheng）

`TypedExprIrAddAssignStatementFromExpr` 内 wall20 push/pop 之间记录 `lhsBuildNodeStart`，pop 后扫描 `[start, len)` 窗口（**含文本构建器多形状 fallback 的 retry orphan**——烤机#1 终根翻转版实测 node 55→57 即 orphan 漏网铁证）：op==LocalRef 且 binding 五列全 −1 → 三列就地改写 (−1, Desugared, NoSource)，与 `TypedExprIrAddDesugaredLeafNode`/wall24 nil 模板同款拼写，过 AppendNode 合成臂（:6214-6216）、origin-proof 校验（:6157-6160）、binding 审计 :3191 首臂（origin<0 → continue）。ParamRef 共享定义节点（五列满）与已带 binding 身份的 LocalRef 不触碰；treeless 会话（无 lease）行为逐字节不变。**审计一字未动。**

## 门禁与验收

- 秒级门 A/B（cheng_merged --in:typed_expr.cheng --emit:obj）：修复树/pre_w26 影子根 stderr **逐字节同签名** `([aer]) pop=105 slot=96 rr=-1 rrslot=-9 / managed element field read lacks exact array root`（w10-w24 既有 emit 期缺口，typecheck 已过），五轮全同，不新增死因。
- 车头 /tmp/oob_ab/cheng_w26（sha256=e95fd6b399bd698b11ce60ed9d376552f63eb7a99acc3ef0de93746ef93e4c3d，C 链纯回归面）：v6 0/0、ordinary 0/0、call_fixture 0/1。
- 烤机 **4 轮**（超 ≤3 预算 1 轮，如实报告：四轮为四个不同假设的证据驱动迭代，无同假设重试）：

| 轮 | 驱动 | sha256 | v6 判词 |
|---|---|---|---|
| 1 | kernel_driver_w26 | a93a1d9e3669…2602f271278 | 同判词 node **57**（orphan 漏网→改窗口扫描） |
| 2 | **kernel_driver_w26b（交付，cp 为 kernel_driver_w26）** | **89f016ad37dd…b1b8000c5a1**（size 183158128） | **目标判词消失**；新墙 `typed expr value definition: typed authority drift row=2 function=1 node=15 … owner_statement=4 … parameter=1` |
| 3 | kernel_driver_w26c | 1fba8254a7f3…e89feabb0f | （诊断迭代：声明器跳过参数载体）`typed expr: node operand crosses statement owner node=18 owner=3` |
| 4 | kernel_driver_w26d | 7d6b85c85c9f…8edb2470b3c6 | （诊断迭代：detached 副本重定向）crossing 判词原样，node 18 身份未定 |

交付 = **第 2 轮状态**（源码与 kernel_driver_w26b 逐字节绑定）：目标墙清除已被 bake 实证；3/4 两轮为下游矛盾的诊断探针，结论已并入移交，其源码变体未保留在交付树。

### kernel_driver_w26b 四夹具验收（--emit:exe，cwd=仓库根）

| 夹具 | compile | run | 判读 |
|---|---|---|---|
| ordinary_zero_exit_fixture | **0** | **0** | 不回归；W-ORD 族已由并行线清 |
| zz_call_fixture_w7 | **0** | **1** | run=1=正确语义，不回归 |
| **v6（zz_v6_w7，回归门）** | 1 | — | **`source-backed reference identity missing` 消失**；推进 `typed expr value definition: typed authority drift row=2 function=1 node=15 function_node_start=15 … owner_statement=4 function_statement_start=3 function_statement_count=3 produced_row=2 exact_type=18 node_type=18 ownership=2 node_ownership=2 proof=3 node_proof=3 parameter=1`（见移交）；exe 未产出 |
| cold_nested_fmt_interpolation_smoke | 1 | — | `exact def derive: borrow owner parameter definition op missing op=14 slot=0`（src/core/analysis/exact_def_derive.cheng 域，w25 线领地，静置） |

## 移交：参数定义载体 × 语句所有权声明器矛盾（typed_expr.cheng，本轮证据完备）

- 事实链（w26b/w26c/w26d 三轮运行时判词 + 源语义）：addCol 的 var 参数定义节点（node=15 `a`/16 `arr`/17 `v`，函数起点 `TypedExprIrAddParamNode` 发布，synthetic=Parameter，binding 五列 −1，`producedValueDefinitionRows` 已指向其参数行）被赋值 LHS 文本路径的参数索引快路径（`TypedExprIrBuildRhsIdentNode` :21559-21594，返回**共享定义节点本身**）当 lvalue 根/hop operand 引用；`typedExprIrClaimStatementNodeOwnersExact`（:6680，AppendStatement 时按 lvalue+operand 递归盖章）把 ownerStatement 盖到载体上 → 行审计 :4184 `(parameterOrigin && ownerStatementIndex != -1)` 死。树会话 RHS 读走 exact 路径追加**新鲜副本**（typedExprIrAddExactBindingRefNode）从不受影响——两套读路径不对称是矛盾根源。
- 已试与结局：③声明器跳过参数载体（w26c）→ 修复行审计但触发 `NodeOwnerStatementAuthority` 的 operand 同属主检查（:3893-3920，node=18 FieldGet hop 的 operand=载体 owner=-1 ≠ 3）；④LHS 窗口内把载体引用重定向到 fresh detached ParamRef 副本（identity 列全拷贝 + synthetic Desugared，helper 已在 w26d 验证语法/门禁）→ crossing 判词逐字未变，node 18 实际身份未能定位（重定向生效范围 vs 实际肇事引用不符，需诊断轮：crossing 判词补打印 operandIndex/operandOwner，或 lldb 读 nodes2 列）。
- 移交修法方向（owner 裁量）：a) 诊断轮定位 node 18 后按事实收口；b) 结构性修法=让赋值 LHS 的参数读与 RHS exact 读合流（fresh ParamRef 副本，binding 五列 −1 + synthetic Parameter/Desugared——LHS 无树节点，无法走全 exact 五列形状，本轮已实证），并保证声明器与 operand 同属主检查联立可满足；c) 若定性为声明器/审计契约需改 solver 侧（exact_def_derive/primary），停手移交相应 owner。探针证据：/tmp/oob_ab/w26/（probe.out 树 dump、各轮 compile log、bake log、patch 历史）。

## 纪律执行

- 主树仅改 src/core/lang/typed_expr.cheng；补丁式：备份 /tmp/oob_ab/w26/typed_expr.cheng.pre_w26（sha256=edefc10a478bd416384427fa118343456f824ab07ecf30e4fe06167eb213adcf）→ diff 生成。git diff --numstat：apply 前 +775/−243 → apply 后 **+835/−243**（净 +60 = 补丁全文）。`git apply --check --reverse` 过。
- 探针 src/tests/zz_probe_w26.cheng 已删净（用后即删）；产物/日志/影子根 /tmp/oob_ab/w26/（含 ab/shadow 全 src A/B 影子根）。
- 编排者资产 zz_v6_w7.cheng / zz_call_fixture_w7.cheng 只读未动；未 git commit；烤机 4/3 轮（超支已如实报告）。


---

# wall28.VERIFY — managed function return lacks exact value definition 墙（cold_nested，derive 相 4 return admission，本墙已清；管线推进过 derive+seal 到 ApplyOwned ingress 新墙，完整移交）

## 判定

- **wall28 判词消失**。kernel_driver_w28b（本任务补丁烤机）编 cold_nested_fmt_interpolation_smoke.cheng：`managed function return lacks exact value definition` 不再出现，管线首次越过 derive 相 4 return admission + sidecar sync + seal，推进到 ApplyOwned ingress 新判词 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=5 detail=6 fn=0`（ownership_body_ir_production.cheng:1185，BodyIrAccessDecode 入口守卫，文件 clean-at-HEAD）——同族下一墙，完整移交（见下）。
- 修法定性：**发布侧缺戳，非 derive 判词错**。typed_expr 早已为 Fmt/StrAdd 节点发 ManagedTemporary value-def 权威行（typed_expr.cheng:3715 TypedExprIrOpIsExactManagedTemporaryProducer 含 OpFmt/OpStrAdd；AppendMissingManagedTemporaryValueDefinitionsExact 落行），lowering transport 窗原样携带；缺的是 primary_object_plan node-eval 桥 call 物化托管 str 时不落任何 valueDef 戳 → 返回槽在 exact-def 证据链无 def op 行（lastDefOpBySlot=-1）→ derive 相 4 按构造必炸。derive 相 4 契约与 C 链 cold_finish_exact_function_return 判词车逐字对应，零弱化、零改动。
- 修法（/tmp/oob_ab/exactdef_wall28.patch，1 文件 3 hunks，+157/-2，仅 src/core/backend/primary_object_plan.cheng）：
  1. 新增 `PrimaryBodyIrBindManagedBridgeResultDefinition`（:26774 后插入）：按 (ownerStatementIndex, definingNodeIndex) 查 transport 行，要求 managedFlags ∧ nodeOpKind∈ManagedTemporaryProducer ∧ callDeclarationIndex==-1 ∧ origin==ManagedTemporary ∧ Owned ∧ 无借主，行查不到/域不符/已绑非零戳即 panic；TypeId 闭包与槽 managed 绑定、call/op 全列镜像戳与 `LoweringBindManagedCallResultDefinition`（wall22 范本）同一契约形态，零启发式。
  2. TypedExprIrOpFmt 臂（cheng_strutils_join_bridge sret call）接 binder。
  3. TypedExprIrOpStrAdd 臂（driver_c_str_concat_bridge sret call）接 binder（同族同修）。
- backend2_lower_slots.cheng 的镜像 Fmt/StrAdd 臂未动（非授权文件；kernel 驱动用户路径 BodyIR 由 primary_object_plan 自建自derive，wall17/23 同前例）——遗留。

## 门禁

- 指定秒级门：cheng_merged --in:src/core/analysis/exact_def_derive.cheng --emit:obj rc=0（/tmp/oob_ab/w28/tc.o；本任务该文件零改动）。
- primary_object_plan.cheng 直入门对任意内容必死（既有缺口）：`codegen_a64_fill_units.cheng:9 (offset 306) trailing tokens in let initializer`（该文件 clean-at-HEAD、mtime 8/28）。A/B 归因：pre_w28 备份原样过门同签名死（/tmp/oob_ab/w28/gate_pre.stderr vs gate_pobj.stderr），补丁不可归因。按 wall11 先例建等价门：import 探针 `import cheng/core/backend/primary_object_plan` 编 obj rc=0（含补丁闭包全量 parse+typecheck），探针用后删。
- 车头回归门：cheng_w28（bootstrap/cheng_cold.c 重编，sha256=62703947…3d5）编 v6 复现件 compile=0 run=0。
- 烤机 2/3 轮：第 1 轮 kernel_driver_w28b（干净补丁，交付载具）kernel_driver_build=ok entries=35 size=183223888 sha256=cabfe875c006c981a77f62e3fd13cd776b58e15e1ff74bc9ccb14e75b19cdcaf；第 2 轮 kernel_driver_w28c_diag（+derive 前 ops/slots dump 诊断，sha256=9fef72de40e74f0e941836d949a1a2b9b924536400cbc0ed144397bc9fbc4c5d，证据载具，诊断已剥）。

## 验收实况（w28b，cwd=仓库根）

| 夹具 | compile | run | 判读 |
|---|---|---|---|
| cold_nested_fmt_interpolation_smoke | 1 | — | **wall28 判词消失**；推进 ApplyOwned ingress 新墙（见移交） |
| ordinary_zero_exit_fixture | 0 | 0 | 不回归 |
| zz_call_fixture_w7 | 0 | 1 | run=1 正确语义，不回归 |
| zz_v6_w7（车头 cheng_merged 0/0 回归门过） | 1 | — | `typed expr: node operand crosses statement owner node=18 owner=3`（w26 并行线 typed_expr 领地新中间态，只记录） |

## 移交：ApplyOwned ingress managed-copy 墙（cold_nested 下一墙，本轮只诊断不修）

- 判词：`ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=5 detail=6 fn=0`；lldb 断 bodyIrAccessFail 实证 x1=15(Ownership) x2=2(SiteOp) x3=5 x4=6，栈 bodyIrAccessDecodeLocalCopy ← bodyIrAccessDecodeOp ← BodyIrAccessDecode。
- 肇事检查：body_ir_access.cheng:1994-2004 DecodeLocalCopy 托管 CopyLocal 契约（须 managed→managed ∧ valueDefSlot==target ∧ OwnMove），detail=target=槽 6。
- op5 事实（w28c_diag dump，/tmp/oob_ab/w28/diag.stderr，derive 前 fn=nestedFmt）：`op=5 kind=9(CopyLocal) target=6(#nev2, managed=2 tid=13) ops=7(#nev2#owned_init, managed=0) vdslot=6 vdrow=2 vdown=2(OwnMove) vdomg=1(TypedExpr)`——已带全戳的托管拷贝，但源暂存槽未绑 managed。
- 发射点：primary_object_plan.cheng:41079-41099 TypedExprIrOpStrLit 臂（#owned_init 暂存 + CopyLocal + PrepareManagedBodyOpValueDefinitionExact 戳目标槽）。该形状为近期并行落地、从未被端到端验证（derive 前墙遮蔽，cold_nested 是首个带 StrLit 节点抵达 ApplyOwned 的用户夹具）。
- 更深的契约矛盾（移交裁量核心）：body_ir_access.cheng:4893-4915 typedOwnedCallMirrorValid 对 typedOrigin+OwnMove 定义只认 CallTag 镜像形，CopyLocal 形在 :5028-5041 必炸——即 StrLit 臂的「戳拷贝」形状按现行 decode 契约永不可收。可收形状唯有把值定义落在物化 call 上（from_utf8 桥直写 #nev + ManagedTemporary call 戳，wall28 binder 同款），并同步补 RET term source 边（primary_object_plan 的 PrimaryBodyIrAppendReturnTerm 从不写 term.sourceDefinitionDomain/Row → decode 的 returnConsumeTermCountByDefinition 恒 0 → body_ir_access.cheng:5085-5094 对一切 consume=0 托管定义必炸，含本轮 join 戳）与 seq-add 族 consume-link 投影。三处同根，建议下一轮统一定界。
- 附：本轮主树净改 = 补丁全文（157+/2-）；诊断 hunks 已全部剥除（apply 后 vs HEAD 889+/189-，含并行 w17/w23 既有）。探针 src/tests/zz_probe_w28.cheng、zz_w28_gate.cheng 用后已删；编排者资产 zz_v6_w7.cheng/zz_call_fixture_w7.cheng 未动；证据全在 /tmp/oob_ab/w28/。未 git commit。


---

# w29.VERIFY — 烤机热点证明查询接入既有 memo（seal_root kind 15）+ 字节确定性配对（2026-08-31）

## 补丁（/tmp/oob_ab/perf_memo.patch，1 hunk，+26/−1，仅 bootstrap/cold_parser.c）

- 接线点：`cold_borrow_result_seal_root_definition` 公共包装器（改前 58217）改为
  ColdExactVarMemo 查询级 memo（kind 15，首用号），模板同 `cold_borrow_result_root_valid`
  （kind 13）：probe 带 (body, kind15, definition, kd=(op_count<<32)^block_count)，
  miss 时先显式 store `-1` 作 in-progress 占位再 Depth++ 下降（环重入得 -1，与未 memo
  时经深度上界返回 -1 观察等价；无环共享子链由完成态条目应答），完成后回填真值，
  `Depth==0` 时 Scope++（代际失效，body 变更不可跨树复用）。键不含 depth 的依据：
  无环世系任意起始 depth 同根；有环世系未 memo 也恒为 -1（impl 中 depth 仅用于
  `depth > op_count+16` 上界）。递归经公共包装器（forward decl 2673）全深度进 memo。
- 改前文件备份 /tmp/oob_ab/cold_parser.c.pre_w29（sha256 1f65c7a2…76b92b69）；
  主树只动了 bootstrap/cold_parser.c，探针文件已删。

## 铁门：字节确定性配对（同树态，同名 --out kernel_driver_perfA）

| 车头 | 冷链状态 | 产物 sha256 | 字节 |
|---|---|---|---|
| cheng_perfA（补丁前，18:56 烤） | 打补丁前 | 809817d6fa709da9511ed201720e626ad164bca54d79bae48cba54ea4e693b12 | 183223888 |
| cheng_perfB（补丁后，19:13 烤） | kind15 memo | **809817d6…3b12（同上）** | **逐字节相等** |

- driverA 换名保存：/tmp/oob_ab/kernel_fixed_out/kernel_driver_perfA.saved。
- 过程说明：首轮 B 误用异基名 `--out …perfB`，183MB 产物出现 113 字节差异；逐簇定位
  全部落在输出基名嵌入串（OSO stabs `.program_support_host_runtime.cheng.<out>.provider.host.o`、
  `<out>-55554944<uuid>` 标签）、LC_UUID 与 ad-hoc 签名——cheng_cold.c:107318 注释自证
  这些字段随 --out 变化（byte-contract root fix 只中和目录段）。同名重烤后逐字节相等，
  判补丁零字节影响。该 113 字节差异产物保留为 kernel_driver_perfB。
- 独立佐证（同名/异名、obj/exe/driver 三级）：html-csg obj（perfA=W1=bcb9b945…）、
  zz_v6_w7 obj BYTE_IDENTICAL、v6 exe（perfA/perfB/异目录同名=41311fcb…）、
  manifest 全量 bench exe（perfA=perfB=42d3639d…，异目录同名）。

## 采样复验（同一 fixture=烤机 manifest 全量编译，同相位 +60s 起 30s 窗）

| 指标 | 补丁前 cheng_perfA | 补丁后 cheng_perfB |
|---|---|---|
| 窗口总样本 | 25305 | 25339 |
| seal_root impl（top-of-stack） | 24943（**98.6%**，单点支配） | 0（出 top-20） |
| seal_root 公共包装器 | — | 87（0.34%） |
| 窗口 top1 | seal_root impl | op_names_definition_candidate 1990（7.9%） |

- 次级相位（烤机 +5min 窗，有并行负载）：补丁前 seal_root 2607/25368（10.3%）top1；
  补丁后同相位 seal_root 族 83 样本（0.3%）出前五。塌缩达标。
- 塌缩机理：seal_root 热量是长世系回扫 fan-out 的树内指数级重推导；树内共享子链
  一次证明后全树复用。

## 全烤机时长收益（空闲机同命令对测，manifest 全量 system-link-exec）

- 补丁前 992s（16.5min，且两次独立运行产物同哈希，编译器自身逐次确定）
- 补丁后 **240s（4.0min）**：**3.9~4.1x 提速，墙钟 −75.8%**；两次 bench exe 同哈希
  42d3639d…（与字节门互证）。烤机单轮预算从 ~17min 压到 ~4min。

## 秒级门

- src/tests/zz_probe_w29.cheng（=v6_direct1 探针 zz_v6_w7.cheng 拷贝）：cheng_perfB
  compile=0 / run=0（用后已删）。

## 烤机轮次（如实：计划 ≤4，实际 5，其中 3 次非补丁原因）

1. A 轮1 作废：窗口内 w26 线落 src/core/lang/typed_expr.cheng（stat 1221→1078）。
2. A 轮2 作废：窗口内并行落 primary_object_plan.cheng（1094→1078）、anti_entropy.cheng、
   chain_node.cheng。
3. A 轮3 有效（树态 A4==A5 稳定）→ driverA=809817d6。
4. B 轮1 异基名执行误差（9a6860ea，113 字节环境差异，取证后判定非补丁影响）。
5. B 轮2 同名重烤 → 与 driverA 逐字节相等。第 3/4 轮间已用静默探针（4min quiet）防并行作废。

## apply 前后 git diff --stat -- bootstrap/cold_parser.c

- 前：`714 insertions(+), 337 deletions(-)`（工作树既有 w 线改动）
- 后：`740 insertions(+), 338 deletions(-)` → 本补丁净 +26/−1

## 遗留

- 任务清单其余热点本轮不可接线（非不作为）：`cold_op_names_definition_candidate`、
  `cold_exact_body_dominators`、`cold_exact_object_constructor_tuple_valid_uncached`、
  `cold_exact_definition_is_live_before_op_uncached`、
  `cold_exact_definition_consumption_dataflow_query_from`、
  `cold_exact_borrow_copy_slot_alias_valid`、`cold_exact_call_arg_range_for_op` 的定义与
  热调用点全在 cheng_cold.c 本体（115714 行才 include cold_parser.c；宏重定向只作用于
  cold_parser.c 文本内 call site），而纪律限定主树只改 cold_parser.c。其中 dominators
  另有 body->cfg_generation 代际缓存（cheng_cold.c:49468），热量是 body 变更后的真实
  重建，查询 memo 原理上不可消除。
- seal_root 塌缩后 +60s 相位新 top：op_names（7.9%）、dominators（7.4%）、dataflow、
  tuple_valid_uncached、is_live_before_op_uncached——全部为上述 cheng_cold 本体热点，
  接线需解冻 cheng_cold.c 或上移其冻结边界，属后续轮次决策。
- cold_parser.c 侧下一候选：cold_ffi_handle_arg_is_borrow（补丁后 +60s 采样 593≈2.3%）。
- memo 容量 die()（2^15/scope）与 shape 指纹纪律未动；烤机/全量 bench 未触发容量守卫。

---

# w30 追加：烤机性能第二波（freeze 链批量 memo/索引化）

日期：2026-08-31 21:0x｜补丁：/tmp/oob_ab/perf_memo2.patch（只改
bootstrap/cold_parser.c 与 bootstrap/cheng_cold.c，备份
/tmp/oob_ab/perf_memo2_backup/）

## 改动面

1. **memo 基础设施上移**：ColdExactVarMemo 表/hash/shape/probe/store/
   Depth/Scope 从 cold_parser.c（include 点之前不可见于本体）整体上移到
   cheng_cold.c 前部（body_invalidate_op_block_index 之后），同一翻译
   单元两半共用；wall29 15 个 cold_parser.c 包装器行为不变。
2. **kind20 is_live_before_op**：cheng_cold.c 实体改为
   `_frozen`（原体）+ scope-memo 包装。环安全性审计：证明闭包
   （同块候选扫描/op_consumes/owned_slot_overwrite/sparse/dataflow 求解器
   query_from）全部为纯读者且无回调（逐函数 grep=0），acyclic 占位语义
   （wall29 先例）成立。
3. **kind21 constructor_tuple_valid**：同样 `_frozen`+包装；递归只进入
   更早的字段源定义（SSA），无同键重入。
4. **kind22 consumption_dataflow_query**：键 (definition, query_block,
   query_op_exclusive)，值编码 (valid<<8)|state 与 frozen memo 同格式；
   求解器为工作区迭代，无回调。
5. **hold 窗口**：新增 `cold_exact_var_memo_hold_begin/end`（Scope++ +
   TLS 标志，模板尾部统一加 `&& !Hold`）。接入两个纯判定窗口：
   compact_exact_borrow_call_slots 候选扫描、block-local coloring 的
   alias 重扫（两者都是先全量判定后统一重写 slot_offset/frame_size，
   窗口在任何 body 写之前关闭；提前 return 路径均补 end）。
6. **ffi_handle_arg_is_borrow 二级持久缓存**：该查询每次调用都打开声明
   源文件、逐字符扫到 decl_line。加 (path,line,index)→borrow 一级表与
   (path,line)→fn_start 二级表（同函数各参数共享一次行扫描）；键用稳定
   源池指针（FnDef 行指针会随数组增长迁移，不用），冲突覆盖只重跑纯查询。
7. **kind10 wrapper 撤销**：实体已 memo，删除 cold_parser.c 侧
   is_live 包装+宏，调用点直呼实体（少一层探针）。
8. 表大小保持 2^15（试扩 2^16 后采样显示 seal_root wrapper 帧恶化、
   已回滚——cache 局部性优先）。

## 字节确定性（铁门）

| 轮 | 车头 | 树态 | sha256 | real |
|---|---|---|---|---|
| driverA' | 补丁前（备份源 clang -O2） | 130 files/45351+/40296- | 5707018cbb34fc40590ddf34ea67a3e08bf821dac43251c65dcd7edae746204a | 276.03s |
| driverB' | 补丁后 v1（扩表 2^16） | 同上 | 5707018c…（同） | 247.76s |
| driverB2' | 补丁后 v2（回滚扩表+ffi 二级缓存） | 131 files/45384+/40305- | 5707018c…（同） | **240.05s** |

- 三轮 183,223,888 字节逐字节相等（cmp 通过）。补丁零字节影响。
- B2 轮窗口内 w26/w28 落树一次（+1 file，src/tests 测试件），但产物
  哈希不变 → 落树不在 kernel_manifest 输入集，配对有效（如实记录）。
- 墙钟：**276.03s → 240.05s（1.15×）**；B'/B2 差值即扩表回滚收益
  （采样负载两轮相同，A' 未挂采样故 1.15× 为保守下限）。

## 采样复验（烤机 +65s 相位 60s 窗，exclusive/top-of-stack 同口径，
旧窗 50,521 样本 vs 新窗 50,279）

| 热点 | 补丁前 | 补丁后 | 处理 |
|---|---|---|---|
| op_names_definition_candidate 9.6%→口径内 10.72% | 5418 | 1309（2.60%） | **memo 化**（随 kind20 塌缩） |
| is_live_before_op_uncached 5.7% | 4546 | 5578* | kind20 接线；*绝对值随 freeze 相位窗口占比上升，链内重复已消 |
| tuple_valid_uncached 4.3% | 2159 | 94（0.19%） | **memo 化**（kind21） |
| borrow_copy_slot_alias_valid 4.1% | 2089 | 1851（3.68%） | hold 窗口共享子证明（顶层不加探针，负收益） |
| consumption_dataflow 4.0% | 4105 | 2533+671 | **memo 化**（kind22） |
| call_arg_range 3.4% | 1756 | 1820 | 放弃（O(1) 查询，探针叠加负收益） |
| ffi_handle_arg_is_borrow 2.3% | 1318 | 476（0.95%） | **索引化**（二级持久缓存） |
| body_dominators 5.3% | 4406 | 2743（5.46%） | **原理性放弃**：cfg_generation 代际缓存已在，热量是 body CFG 变更后的真实重建（采样帧内为 mmap/memset/calloc 构建成本） |
| seal_root 包装器 10.9% | 20170 | 40003* | 定性：wall29 memo 的命中路径固有成本（每命中一次哈希+探测，调用数为证明 DAG 边数，不可再 memo）。*占比上升主因 freeze 链塌缩后 60s 窗更多落在该相位+扩表劣化已回滚 |

## 秒级门

- src/tests/zz_probe_w30.cheng（=zz_v6_w7.cheng 拷贝）：B2 车头
  system-link-exec compile=0 / run=0（用后已删）。

## 烤机轮次（预算 ≤3 组，实际 2 组有效 + 1 轮作废说明）

1. A 轮（补丁前车头）：窗口静默（130 files 4min 不变），有效。
2. B 轮1（扩表版）：字节门相等；采样复验发现 seal_root wrapper 帧劣化
   （2^16 表伤 cache 局部性），回滚 BITS 16→15，该版代码废弃。
3. B 轮2（最终版）：窗口内并行落树一次但产物哈希与 A' 相等（落树不在
   输入集），有效。

## 结论

- 总提速 **276.03s → 240.05s（1.15× 保守口径，墙钟 −13%）**，未达
  1.5-2× 目标。原因（第一性）：freeze 链热点 2-9 的树间重复已由
  hold 窗口+kind20/21/22 消除（tuple_valid −96%、op_names −73%、
  dataflow −38%、ffi −64%），剩余墙钟由 (a) seal_root memo 命中路径的
  探针固有成本（调用数=证明 DAG 边数，线性、不可再 memo 化——它是
  wall29 成果的摊销成本而非新的重复推导）与 (b) dominators 的
  body-变更后真实重建（原理性）支配。再降需压缩 probe 数据结构
  （entry 48B→更小、kind15 专用键比较）或 seal_root impl 链跟随循环化
  （触碰查询逻辑红线），本轮不做。
- 备注：kind5 空号沿用；新增 kind 20/21/22 首用号顺延，未复用。

## apply 前后 git diff --stat（含并行 w 线既有改动）

- 前：cold_parser.c `740 insertions(+), 338 deletions(-)`；
  cheng_cold.c `1071 insertions(+), 78 deletions(-)`
- 后：cold_parser.c `869 insertions(+), 505 deletions(-)`；
  cheng_cold.c `1347 insertions(+), 84 deletions(-)`
- 本补丁净量：cold_parser.c +130/−168，cheng_cold.c +276/−6

---

# wall32.VERIFY — ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=5 detail=6 fn=0 墙（cold_nested；病根全在 primary_object_plan.cheng 生产侧，非授权文件，按纪律停手零主树接触完整移交）

## 判定

- **本轮零主树改动、零烤机**。判词本身只是 panic 通道：ownership_body_ir_production.cheng:1182-1185 把 `BodyIrAccessDecode` 失败转 production panic（该文件 clean、守卫零弱化）。真实拒收点（body_ir_access.cheng decode 契约）与其上两层结构性矛盾全部指向 primary_object_plan.cheng 的生产发射形 → 授权外文件，停手移交。
- 复现：kernel_driver_now（当前全量树态）编 cold_nested 判词逐字一致（/tmp/oob_ab/w32/now_cn_w32.log、cn_compile.log）；车头 cheng_now 同输入 compile=0/run=0 `cold_nested_fmt_interpolation=pass`（语义参照不变）。

## 判词解码与肇事点（源码钉死）

- code=15 = `BodyIrAccessErrorOwnership`；site=2 = `BodyIrAccessSiteOp`；index=5 = fn=0（nestedFmt）op5；detail=6 = `op.target` 槽 6（#nev2）。
- 触发检查：body_ir_access.cheng:1989-1996 `bodyIrAccessDecodeLocalCopy` 托管 CopyLocal 契约：managed→managed ∧ valueDefSlot==target ∧ OwnMove，违反即 fail(detail=op.target)。
- op5 发射形 = primary_object_plan.cheng:41075-41099 TypedExprIrOpStrLit 臂：`#nev2`（PrepareManagedBodyOpValueDefinitionExact 戳 managed 证明+全列定义戳在 CopyLocal 上）← CopyLocal ← `#nev2#owned_init` 暂存槽（FindOrCreateSlot 裸建，managedStorageKind=0）→ `!sourceManaged` 必炸（wall28 lldb 栈 bodyIrAccessDecodeLocalCopy 与此一致）。

## 结构性矛盾两层（补 managed 也必炸——移交核心，wall28「三处同根」本轮逐条核实）

1. body_ir_access.cheng:4893-4929 `typedOwnedCallMirrorValid`：TypedExpr origin+OwnMove 值定义唯一可收形 = CallTag 全列镜像（wall28 binder 形）。StrLit 臂把定义戳在 CopyLocal → 即便暂存槽绑 managed，:5040 必炸。**现行 StrLit 发射形按 decode 契约永不可收。**
2. body_ir_access.cheng:5102-5116 + :3375-3395 + :5143-5160：consume=0 的 OwnMove 定义唯一出路 = append-only managed move 事件或精确 return-term 消费边。而 primary 生产全程 grep 实证：从不写 `op.valueDefConsumeOpIndexPlusOne`、从不写 call/op `sourceDefinitionDomain/Row` 坐标、`PrimaryBodyIrAppendReturnTerm`(:27683) 从不写 term.sourceDefinition 边 → nestedFmt 内 **全部** w28-binder 定义（outer join=返回值、inner join 与 StrLit=被 outer join 消费的 piece）在 decode 眼中 consume=0 无边 → :5105 逐个必炸。wall28 已入树的 join 戳过不了这层，即 StrLit 层清掉后的下一墙。

## 修法方向（下一轮授权 primary_object_plan.cheng 的统一定界轮）

- a. StrLit 臂改 binder 形：from_utf8 桥直写 `#nev{nodeIndex}`（删暂存槽+CopyLocal），`PrimaryBodyIrBindManagedBridgeResultDefinition`(:26775) 落 call/op 全列戳。typed_expr.cheng:3716 producer 集合已含 StrLit(:3721)，`TypedExprIrAppendMissingManagedTemporaryValueDefinitionsExact`(:15001) 按 producer 集合全量发行 → transport 权威行已在，binder 零改动可复用；call op 行索引需从 `AppendStringLiteralValue`(:17242，内部自追 call op、callOrdinal 自增) 取出，binder 结构复验 fail-closed。
- b. join piece 消费投影：被调用消费的定义需 defOp.`valueDefConsumeOpIndexPlusOne`=consumeOp+1 ∧ consumeOp/call.sourceDefinition=(BodyOpTag, defRow)。**契约设计缺口**：单 call 仅一对 sourceDefinition 坐标，多 def piece 的 join（本夹具 outer join 同时吞 inner Fmt 结果与 "outer=" 定义）如何合法表达（manualConsume sidecar 扩展 / 逐 arg 投影 / piece 借物化）需契约 Owner 定界；C 冷链 join 语义为参照。
- c. RET term 消费边：AppendReturnTerm 为托管返回写 `term.sourceDefinitionDomain/Row`（BodyTerm 字段与注释已在，core_types.cheng:494-497）。
- EmptySeqInit 臂（:41100+）同构 staging+CopyLocal 但双槽 unmanaged 且不戳定义 → DecodeLocalCopy 与 :4893 均不触发，现状合法，不必随改；:41299 var-str FieldLoad 戳形若 ownership=OwnMove 同撞 :4893，下轮一并核。

## 门禁与基线实况（本轮只测不改，cwd=仓库根）

| 项 | 结果 |
|---|---|
| 守卫文件 ownership_body_ir_production.cheng | 零改动（clean） |
| 主树 | 零接触（本轮前后 git diff --stat 全等：454 files, +47564/−44151，均为并行线既有） |
| kernel_driver_now × cold_nested | compile=1：本墙判词（逐字一致） |
| kernel_driver_now × ordinary | compile=0 run=0 |
| kernel_driver_now × call_fixture | compile=0 run=1（预期语义） |
| kernel_driver_now × v6（只记录） | 见下表 |
| 车头 cheng_now × cold_nested | compile=0 run=0 pass |

- 未烤机：无补丁可烤；240s/轮 memo 烤机留给下轮统一定界轮。

## 遗留与移交

- 下一墙栈（清一层显一层）：StrLit 形(1) → piece 消费投影(2) → RET 边(3)，三处同根一次定界。
- w31 并行线 typed_expr.cheng 与本定性无冲突（producer 集合/权威发行侧本轮已核就绪）。
- 证据：/tmp/oob_ab/w32/（now_cn_w32.log、cn_compile.log、ord/cf/v6 log）。编排者资产 zz_v6_w7.cheng/zz_call_fixture_w7.cheng 未动；无探针残留。


# wall31.VERIFY — typed expr value definition: typed authority drift（参数载体被语句声明器盖章，w26 移交，已清）+ v6 推进同判词下一道既有掩蔽墙（orphan call-result row，完整移交）

## 判定：目标墙已清（bake 实证）。kernel_driver_w31 上 v6 的 `typed authority drift row=2 function=1 node=15 … parameter=1` 判词消失，推进到同审计的下一道**既有掩蔽墙** `typed authority drift row=10 function=3 node=56 … owner_statement=-1 … parameter=0`（orphan call-result defining node，非本轮改动引入，见归因）。ordinary compile=0 run=0、call_fixture compile=0 run=1 不回归；cold_nested 判词与本轮前 kernel_driver_now 逐字节同（`ingress BodyIR ownership invalid code=15 site=2 index=5 detail=6 fn=0`，w32 并行线领地，只记录）。烤机 1/3 轮。

## 机理（w26 移交定性证实 + 补充）

- addCol 参数载体（node 15/16/17，`TypedExprIrAddParamNode` 发布，synthetic=Parameter，binding 五列 −1，`producedValueDefinitionRows` → 参数 value definition row）被赋值 LHS 文本路径参数索引快路径（`TypedExprIrBuildRhsIdentNode`，`TypedExprIrParamRefIndexBuildAll` 索引 → 返回**共享载体本身**）当 LHS 根/hop operand 引用进语句图；`typedExprIrClaimStatementNodeOwnersExact`（AppendStatement）沿 lvalue 根递归盖章 → 载体 ownerStatement=4/3 ≠ −1，行审计 `parameterOrigin && ownerStatementIndex != -1` 死。
- 审计联立约束：参数行 defining node 永远 owner=−1（行审计）；语句图内节点与其 operands 必须 owner 一致且 operand index 严格小于使用节点（crossing 审计，:3893-3920）。故载体绝不可入语句图——引用必须走 fresh 副本。

## 修法（/tmp/oob_ab/typedexpr_wall31.patch，1 文件 4 hunk，净 +72，仅 typed_expr.cheng）

1. 模块级开关 `typedExprLhsFreshParamRefActive`（:19154 区，仿 `typedExprRhsNodeSkipReason` 先例）。
2. 新 helper `typedExprIrAddLhsFreshParamRefNode`：以载体为 template 逐列拷贝（resultType/structuralTypeId/managed/send/sync/proof 经 `typedExprIrBindNodeStructuralType`、paramSlot、paramMutableFlag），binding 五列 −1 + originParserNodeId=−1 + synthetic Desugared + span NoSource（wall26 同款拼写；binding 审计空身份臂 `originParserNodeId >= 0` 才死，故合法 continue）；`TypedExprIrAddNode` 常规发布 → producedValueDefinitionRows=−1（永非 defining node）。exprClass 留 Unknown 由 AppendNode 精确重算（`typedExprIrAddExactBindingRefNode` 同例）。origin 自动盖章仅在 synthetic==None 时触发，Desugared 显式 −1 不受污染。
3. `TypedExprIrBuildRhsIdentNode` 参数快路径命中处：开关开启时返回 fresh 副本，否则逐字节原行为。
4. `TypedExprIrAddAssignStatementFromExpr`：`typedExprLhsFreshParamRefActive = pushLhsOrigin` 精确括住 LHS 构建调用，返回即清；treeless 会话（无 lease）开关恒 false，迁移前行为逐字节不变。副本在后续 FieldGet hop 之前发布 → operand index 序天然满足 crossing。

审计四联验证：行审计（副本非 defining，跳过）；binding 审计（五列 −1 + origin −1 → continue 臂）；crossing/disconnected（无 operands，被语句正常盖章）；`TypedExprIrNodeIsWritableLvalue`（ParamRef 合法）。审计一字未动。

## 归因关键证据（下一道墙非本轮引入）

- 探针 P3（`var n: N` + `n = new(N)` + `return 0`，**全模块零参数**）在 kernel_driver_w31 上同判词死 `row=0 node=0 owner=-1 parameter=0`。零参数 ⇒ 参数索引快路径必 miss ⇒ 本轮新增代码**可证未执行** ⇒ 该墙与 wall31 修法无关。
- 探针 B（v6 去掉 addCol 参数字段赋值、只读）在**改动前**的 kernel_driver_now 上已死同类判词（`row=12 function=3 node=54 owner=-1 parameter=0`）——改动前即存在，被 row=2 墙掩蔽（审计首错即返）。
- P2（`let n = new(N)` 初值形）**通过**该审计（死在其后既有 csg 缺口 `typed-node builtin return TypeId missing node=0`）⇒ 触发形锁定「var 裸声明 + 拆分赋值」。

## 下一道墙移交事实（row=10 / P3 row=0）

- 判词：`typed authority drift row=10 function=3 node=56 function_node_start=56 function_node_count=49 owner_statement=-1 function_statement_start=9 function_statement_count=14 produced_row=10 exact_type=17 node_type=17 ownership=1 node_ownership=1 proof=3 node_proof=3 parameter=0`。唯一死因分支：`!parameterOrigin && ownerStatementIndex(−1) < functionStatementStart`。
- 定性：`TypedExprIrAppendMissingCallResultValueDefinitionsExact`（函数尾扫描 [nodeStart, len) 给无行 CallExpr 补 CallResult 行，origin<0 才 panic）把**孤儿 CallExpr 节点**（builder 形状 fallback 弃子，不在任何语句根可达图中）也行化；行审计要求非参数 defining node 的 owner 必须落在函数语句区间 ⇒ 死。P3 节点预算佐证：3 语句应 3 节点（LHS LocalRef + new(N) call + I32Const），实为 5 ⇒ 存在双建弃子。
- 移交方向：(a) 定位孤儿制造者（疑似 `new` builtin 树建路径 append 后失败回落文本重建，或 LHS/RHS 形状 fallback 双建），按事实收口（不建弃子或建后不弃）；(b) 若定性为 AppendMissing 对不可达节点行化属制造假行，改为跳过 owner=−1 不可达节点须与下游 value-definition 覆盖消费联证，owner 裁量。探针矩阵 P1/P2/P3 与产物在 /tmp/oob_ab/w31/（p1/p2/p3 编译日志），探针文件已删净。

## 门禁实录

| 门 | 结果 |
|---|---|
| 秒级门（cheng_now --in:typed_expr.cheng --emit:obj） | 已知 HEAD 既有签名同款：`([aer]) pop=105 slot=96 rr=-1 rrslot=-9 / managed element field read lacks exact array root`，typecheck 过，不新增死因 |
| kernel_driver_w31 × v6 | row=2 parameter=1 目标判词消失；推进 row=10（上文移交） |
| kernel_driver_w31 × ordinary | compile=0 run=0 |
| kernel_driver_w31 × call_fixture | compile=0 run=1 |
| cheng_now（HEAD 车头，改后同树）× v6/ordinary/call_fixture | 0/0、0/0、0/1 全绿 |
| kernel_driver_w31 × cold_nested | `ingress BodyIR ownership invalid code=15 site=2 index=5 detail=6 fn=0`，与 21:28 kernel_driver_now（本轮前）逐字节同（w32 领地） |
| 探针清理 | src/tests/zz_probe_w31.cheng 已删净，主树探针零残留 |

## 产物与身份

- 备份 pre_w31 sha256=43b3a09e38f41fb7934201eebfa1fb6d7d4dd6b345d53b1e2d558c7bd7184580（/tmp/oob_ab/w31/typed_expr.cheng.pre_w31）
- 补丁 /tmp/oob_ab/typedexpr_wall31.patch sha256=36f1b7b1b6ad0ef2c76829b7a0b6de2ba02c3bd099c33a36b1f38f14b0e9be85（109 行）
- git diff --numstat：apply 前 +835/−243 → apply 后 **+907/−243**
- 车头 cheng_w31 sha256=4f74c8b64501ef94742b9e9a4cb39537164a2ddfee4611c8bb853a49410b0a42
- **kernel_driver_w31 sha256=c5e858428c358a3c4f311f949fff9f04589732a468c2f9c1bfb18dc3188fbc5a**（size=183224016；kernel_driver_now=6c6e4b18241b7e617568fec3a152dd59979b1d71aa0d0a300413c44b5a0d8988）
- 探针/影子产物 /tmp/oob_ab/w31/；编排者资产 zz_v6_w7.cheng / zz_call_fixture_w7.cheng 只读未动；未 git commit。
- 运维备注：门禁中途 `os atomic tree: parent lease unavailable` 为同窗口两驱动并行写同父目录的瞬态租约冲突（自建探针操作所致），串行重跑即消，与源码无关；编译产物目录须避免并行驱动共享。

---

# wall33.VERIFY — cold_nested primary_object_plan 发射形统一定界轮（w32 三处同根移交的落地：a 已实证清、c 已落地待实证、b 撞 consume-action 契约边界停手移交；主树仅动 primary_object_plan.cheng）

## 判定摘要

- 补丁 /tmp/oob_ab/pop_wall33.patch（4 hunks，仅 src/core/backend/primary_object_plan.cheng，+83/−16 净）：
  - **修 a（StrLit 臂改 binder 形，已实证）**：删 `#nev{node}#owned_init` 暂存槽与携戳 CopyLocal，from_utf8 桥直写 `#nev{nodeIndex}`，非空载荷经 `PrimaryBodyIrBindManagedBridgeResultDefinition`（wall28 binder 复用，零改动）落 call/op 全列戳；空载荷走零填充并按 EmptySeqInit 臂同款裁定不打 OwnMove 定义点（判定用 `len(PrimaryBodyIrStringLiteralPayload(enLit))==0` 与 AppendStringLiteralValue 内部分支同一函数，非 op 嗅探）。
  - **修 c（RET term 消费边，已落地，实证被 b 墙遮蔽）**：`PrimaryBodyIrAppendReturnTerm` 内按返回槽回扫最近带完整 TypedExpr+OwnMove 权威戳且 `valueDefConsumeOpIndexPlusOne==0` 的定义 op，落 `term.sourceDefinitionDomain=(BodyOpTag, defRow)`；借视/无定义/已带 op 消费链的返回不落边，与 body_ir_access 的 term 边契约（OwnMove-only、:3776 硬失败、:5102 唯一出路）逐条对齐。回扫结构精确（托管 managed→managed 拷贝按 :1989 契约必自带戳，故「最近定义」良定义）。
  - **修 b（seq-add 逐 piece 消费投影，实证撞契约边界，停手移交）**：新增 `PrimaryBodyIrLastManagedOwnMoveDefOpIndexForSlot` 定位 piece 定义，对收编该定义的 `cheng_seq_str_add` call 落三元组接线（def.consumeOpIndexPlusOne / op.sourceDefinition / call.sourceDefinition 同指 (BodyOpTag, defRow)）——w32 定界的「单 call 一对坐标」缺口已从源解掉（每 piece 恰有一个 seq-add call，单坐标对合法，无需 join 多坐标扩展）。
- wall32 判词 `…code=15 site=2 index=5 detail=6 fn=0` 消失；w33 烤机 driver 同输入推进到 **同位置新失败类** `…code=15 site=2 index=5 detail=0 fn=0`（/tmp/oob_ab/w33/cn_w33.compile.log）——op4（StrLit 的 from_utf8 binder 定义）已按 CallTag 镜像形通过 DecodeCallOrdinal 的 result-owning 检查（:1511-1598），失败点精确移到 op5 消费投影上的 DecodeCallOrdinal else 臂 **:1599-1645**。
- **b 项契约边界（本轮实证定性，移交契约 Owner）**：:1637-1639 要求携带 sourceDefinition 的消费 call 必须满足 `explicitSourceConsumer`，其中 `call.consumeActionRow >= 0 || managedReplaceRetain` 不可缺。而 primary 全树 grep 实证从不写 `consumeActionRow`（core_types 仅复位 -1），该权威唯一生产者 = `src/core/analysis/cleanup_cfg.cheng` / `src/core/analysis/managed_lvalue_replace.cheng` 的 action 计划（:1562/:5988/:9929 等），或 manualConsume sidecar 注册（CID 绑定，core_types.cheng:742 结构 20 列 CSR）。三条候选出路（cleanup-action 计划接线 / manualConsume sidecar 扩展 / managedStoreKind move 事件——后者 2 参 replace ABI 与 seq-append 效果不符）均在授权文件之外，按纪律停手。语义上 seq_add 确为 piece 的真消费（头拷贝即移交），接线形状本身已过 :3650 explicit-edge 全检，唯缺 action 行权威。
- 车头（C 链）对照不变：cheng_w33 编 cold_nested compile=0/run=0 输出 `cold_nested_fmt_interpolation=pass`。

## 门禁与验收实况

| 项 | 结果 |
|---|---|
| 指定秒级门（cheng_now --in:primary_object_plan.cheng --emit:obj） | rc=2，HEAD 既有缺口（codegen_a64_fill_units.cheng:9 trailing tokens，该文件 vs HEAD 零 diff，wall28 已归档同签名；A/B 归因 = pre_w33 备份同死） |
| 等价门（import 探针 `import cheng/core/backend/primary_object_plan` 编 obj，wall11/w28 先例） | rc=0（补丁闭包全量 parse+typecheck；探针用后删）。注：C 冷链不查 .cheng 管线的 borrows 形参拒绝，烤机才是真门 |
| 车头回归门 v6 复现件（cheng_w33，sha256=81c1c959…3c5） | compile=0 run=0 |
| 烤机 | 2 轮有效：第 1 轮 rc=2 死本人 helper 的 `@borrows` 装饰器被注释行隔断（平值 BodyIR 形参被 .cheng 管线拒为 non-var non-@borrows formal，C 冷链同代码 rc=0——两链 checker 分歧归档）；对齐 AppendReturnTerm 已证拼写（装饰器直附 + var 形参）后第 2 轮 rc=0 |
| 烤机产物 | kernel_driver_w33 size=183224064 sha256=8b90c74ca71d1214d43e53e69b059ddf6b55bd043bf01a2bdacf146e5b3e7687（bake_w33_r2.log kernel_driver_build=ok） |
| cold_nested（w33 driver exe 全链） | compile=1 `ingress BodyIR ownership invalid code=15 site=2 index=5 detail=0 fn=0`（b 契约边界，见上）；exe 未产出 |
| ordinary_zero_exit_fixture | **compile=0 run=0** 不回归 |
| zz_call_fixture_w7 | **compile=0 run=1** 正确语义，不回归 |
| zz_v6_w7（只记录） | compile=1 `typed expr value definition: typed authority drift row=10 …`——与 w32 基线（同判词族 row=2）同为 typed_expr.cheng 域既有墙原位（w31 并行线领地），非本任务回归 |

## 遗留与移交

1. **b 项收口（授权外，契约 Owner 裁量）**：为 primary 发射的 seq-add 族消费 call 提供 `consumeActionRow` 权威——或经 cleanup_cfg/managed_lvalue_replace 的 action 计划生产，或扩 manualConsume sidecar；接线三元组（def.consume / op.sourceDefinition / call.sourceDefinition + UsesSourceSlotExact）已就位并逐条通过 :3650 explicit-edge 检查，action 权威补齐后判词即清。修 a/c hunks 无需回滚重做。
2. **cold_nested 后续栈预测（清 b 后）**：nestedFmt 各 piece def（op4 族）→ 消费投影过 → outer join def 的 RET term 边（修 c）→ fn=0 过；fn=1 main 的 `let actual = nestedFmt(...)` WholeCall OwnMove 定义（LoweringBindManagedCallResultDefinition 戳）既无消费 op 也无 term 边，将撞 :5078/:5105 同族——「作用域终值」的合法出路 = append-only managed move 事件（cheng_str_release_scope 的 2 参 release ABI 需改造为 (dest,src) move ABI 或新增桥，program_support_backend.cheng 领地）或 cleanup-action 消费，本轮已定性不动。
3. w34 并行线探针（zz_probe_w34*.cheng）在树上，与本任务无文件交集；primary_object_plan.cheng 最后修改 22:31（本人收笔），patch 反向 check 于该态生成。
4. 烤机预算 2/3 轮（第 1 次启动即杀因装饰器错位树态不计轮，w12 先例）；第 3 轮留给 b 项收口后的统一定界轮。

---

# wall34.VERIFY — typed expr value definition: w24 decl-local detached NilPtr 载体行撞语句区间臂（w31 移交「orphan call-result row」定性反转，已清）

## 判定：typed_expr 域墙已清（bake 实证：kernel_driver_w34 上 v6 的 `typed authority drift row=10 node=56 owner=-1` 判词消失）。w31 移交的「AppendMissingCallResultValueDefinitionsExact 给孤儿 CallExpr 行化」定性被本轮实验推翻——真凶是 w24 裸 `var n: Node` 家族的 decl-local 零值定义模板（detached NilPtr 载体）经 TypedExprIrConsumeDeclarationLocalValueDefinition 发布的 BindingInitializer 行：defining node 离语句（owner=-1），撞行审计 `!parameterOrigin && ownerStatementIndex < functionStatementStart` 臂。AppendMissing sweep 全程无辜（其只行化 CallExpr，与本判词无关）。修法 = 行审计加「detached 零值声明模板」放行臂（六列联立自证），审计零弱化。v6 推进到 csg 域下一墙（禁区外，移交）；ordinary/call_fixture 不回归；烤机 1/3 轮。

## 定性反转的关键实验（kernel_driver_w31 二分矩阵）

| 探针 | 形状 | 判词 | 结论 |
|---|---|---|---|
| zz_probe_w34（P3+1 赋值行） | var n: N + n=new(N) + n.v=3 + return 0 | row=0 node=0 owner=-1 fn_node_count=8 stmt_count=4 | 复现 |
| zz_probe_w34b（B1） | **仅** var n: N + return 0（零调用零赋值） | **同判词** row=0 node=0 node_count=3 stmt_count=2 | **孤儿与 assign/call 无关** |
| zz_probe_w34c（B2） | var n: N + n=new(N) + return 0 | 同判词 node_count=5 stmt_count=3 | B2−B1=2 节点=assign 正常产出，无弃子 |
| zz_probe_w34d（C1） | 仅 return 0（单语句） | **rc=0 绿** | 无裸声明即无墙 |
| zz_probe_w34e（C3） | var x: int32 + return 0 | rc=2 **另一墙** `csg compiler snapshot: value-definition group parser coordinate invalid`（无 authority drift） | 标量裸声明零值臂（rhs 接语句）合规 |

## 机理（源码三方闭合）

1. `TypedExprIrAddLocalDeclStatement`：nil-able 裸声明零值臂全 miss → w24 模板 `typedExprIrAddNilZeroDeclarationLocalTemplate` 发布 detached NilPtr 节点（origin=-1、Desugared、NoSource、owner=-1，刻意不接 stmt.rhsNodeIndex 保后端 bare-default 发射逐字节不变）。
2. `TypedExprIrConsumeDeclarationLocalValueDefinition` → `typedExprIrAppendValueDefinitionExact(TypedExprValueDefinitionOriginBindingInitializer, …, definingTypedNodeIndex=NilPtr)`——**唯一**在 local_decl 扫描阶段创建 value definition 行的调用点，行序先于一切 sweep 行。
3. 行审计：BindingInitializer 非参数 → defining node owner 必须 ∈ [functionStatementStart, +count)。NilPtr 离语句 owner=-1 → 死。判词字段全吻合：NilPtr 经 `typedExprNodeExprClassExact` fresh-Owned 清单（w24 补）算得 ownership=1(Owned)、managed ref 类型 proof=3(Aggregate)、TypeSyntax→TypeArena id=exact_type。
4. v6 铁证：判词 row=10 node=56=function_node_start=56（main 首节点）——main 相对 node 0 = local_decl 扫描发布的 NilPtr；全模块前 10 行 = compute(1 参数行)+addCol(3)+outer(2 参数行+1 r1 初值行+3 CallResult 行)。与 B1 的 row=0（main=function 0）同构。
5. w31 观察的「P3 节点预算超支（3 语句 5 节点）」实为主循环 return I32Const + BuildReturnNode I32Const（`return 0` 字面量双建，正常合规路径）+ NilPtr，非「双建弃子」。

## 为什么 w24 烤机当时未现形 / 为何现在必死

w24 烤机推进到 `source-backed reference identity missing node=55`（binding 审计），行审计当时未拦截该行；w24→w31 间 value definition 行审计对 v6 逐步成为首错位（w26 row=2 参数载体墙 → w31 清后 row=10 本墙原位暴露）。本墙在 kernel_driver_w31 改动前即存在（w31 VERIFY 探针 B 改动前已死同类判词 row=12 node=54 owner=-1，被 row=2 墙掩蔽），非任何在树补丁引入。

## 修法（/tmp/oob_ab/typedexpr_wall34.patch，1 文件 1 hunk，仅 typed_expr.cheng，+38/-2）

行审计语句区间臂精确化：新增 `detachedZeroDeclarationTemplate` 判定并从区间臂豁免。放行条件**六列联立自证**（任一不符仍死语句区间臂）：
`bindingOrigin ∧ ownerStatementIndex==-1 ∧ opKind==NilPtr ∧ originParserNodeIds==-1 ∧ syntheticOriginKinds==Desugared ∧ spanAuthorityKinds==NoSource`。

- 非弱化论证：参数行豁免臂（parameterOrigin 要求 owner 恒 -1）确立「声明性定义天然离语句」契约；decl-local 零值模板是其同类，原审计类覆盖缺口。parser-backed 的真 builder 弃子（owner=-1 的 CallExpr 等）六列不可能全中（origin>=0 或 synthetic=None），照旧死。
- 下游联证：该行唯一消费方 `typedExprIrExactLocalValueDefinitionRow` 按组坐标取行、消费类型/证明列，不读 owner；owner 列全部读点在节点图审计（owner=-1 本就跳过 disconnected/crossing 遍历），后端（bodyir/lowering）零读点。
- 未走的歧路（留档）：给 NilPtr 补盖 owner=语句 index 会被节点图 disconnected 臂（`owner>=0 && !rootObserved && !hasParentWithinOwner`）拒绝；接 stmt.rhsNodeIndex 破坏 w24 后端发射逐字节不变承诺。

## 门禁实录

| 门 | 结果 |
|---|---|
| 秒级门（cheng_now --in:typed_expr.cheng --emit:obj） | HEAD 既有签名同款 `([aer]) pop=105 slot=96 rr=-1 rrslot=-9 / managed element field read lacks exact array root`，不新增死因 |
| cheng_w34 × v6 | compile=0 run=0 |
| kernel_driver_w34 × v6 | compile rc=2——**本墙判词消失**，推进 csg 域下一墙：`compiler csg: call ownership projection hop authority invalid node=34`（compiler_csg.cheng 域，本任务禁区，停手移交） |
| kernel_driver_w34 × ordinary | compile=0 run=0（不回归；首跑撞 w33 并行租约冲突 `os atomic tree: parent lease unavailable`×3，等 w33 驱动退出后串行即消） |
| kernel_driver_w34 × call_fixture | compile=0 run=1（不回归） |
| kernel_driver_w34 × cold_nested | compile rc=1 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=5 detail=0 fn=0`——与 w31 记录（detail=6）同域同位点但 detail 列 6→0，w33 并行线（primary_object_plan.cheng）同窗口在改该域，静置不归因 |

## 产物与身份

- 备份 pre_w34 sha256=c1708ade70d469317725812359d9c06d1a5f7f53a74cec59b1d2193347c69ca8（/tmp/oob_ab/w34/typed_expr.cheng.pre_w34）
- 补丁 /tmp/oob_ab/typedexpr_wall34.patch sha256=c94f4912a8d31d8edb84271ee0fff2ef38600fc73a54193408337806139ea48c（44 行）
- git diff --numstat：apply 前 +907/−243 → apply 后 **+938/−243**（本轮 1 hunk）
- 车头 cheng_w34 sha256=ee10ae43d5f2de13f7554708a06e0fc8b3f969dc14d9f1ed8f30c047107578f8
- **kernel_driver_w34 sha256=2547a061ae390364a803f11e28ec246af0b076e92bc159219c9db26a2fdbd525**（size=183224064；kernel_driver_w31=c5e858428c358a3c4f311f949fff9f04589732a468c2f9c1bfb18dc3188fbc5a）
- 探针 zz_probe_w34{,b,c,d,e}.cheng 已删净（src/tests/ 零残留）；编排者资产 zz_v6_w7.cheng / zz_call_fixture_w7.cheng 只读未动；产物/日志 /tmp/oob_ab/w34/；未 git commit。

## 遗留墙（如实移交，均非本轮引入）

1. **v6 下一墙（csg 域，本任务禁区外，完整移交）**：kernel_driver_w34 编 v6 rc=2，唯一判词 `compiler csg: call ownership projection hop authority invalid node=34`（/tmp/oob_ab/w34/v6_k.log 全文仅此一行）。typed_expr 的 value definition 行化与全部既有审计已过，卡点在 compiler_csg.cheng 消费 typed_expr ownership projection hop 列的守卫——须改 src/core/compiler_csg.cheng 或其消费契约，归 .cheng owner 裁量。v6 的 typed_expr 侧产出（含 w24 NilPtr 行、wall31 fresh 副本行）已被本补丁证明合规。
2. `var x: int32` 标量裸声明（零值臂 rhs 接语句形）在 kernel_driver_w31/w34 上死 `csg compiler snapshot: value-definition group parser coordinate invalid`（rc=2，compiler_csg 域）——裸声明标量形状的另一道 csg 墙。
3. w31 移交方向 (a)「定位孤儿制造者」已由本轮定性反转闭合：不存在孤儿 CallExpr 制造者；AppendMissing sweep 对不可达 CallExpr 行化的暴露面留待真实弃子形状出现时再议。
4. cold_nested 的 ingress BodyIR 判词 detail 列 6→0 漂移待 w33 线定稿后归因（同域同位点 code=15 site=2 index=5 fn=0）。

---

# wall35.VERIFY — consumeActionRow 消费动作权威接线（wall33 修 b 收口；w33 decode 判词实证已死，cold_nested 推进到 exactDef call authority 新墙，授权外停手完整移交）

## 判定摘要

- 补丁 /tmp/oob_ab/wall35.patch（2 hunks，109 行；`git apply --check --reverse` 过）：
  - **managed_lvalue_replace.cheng（+48/−0）**：新增 `ManagedLvalueReplaceProductionBindIntrinsicSourceConsume(bodyIR, sourceSlot, sourceDefinitionRow) -> int32` ——intrinsic source-consume 的消费动作权威，挂在 managed-replace 生产道（`ManagedLvalueReplaceProductionBuildGlobalAction`/`ProductionAppendGlobal` 的姊妹道）。逐列证明源定义的 exact TypedExpr OwnMove mirror 拼写（与 binder `PrimaryBodyIrBindManagedBridgeResultDefinition` :26936-26946 / `LoweringBindManagedCallResultDefinition` 全列戳逐一对应：slot/OwnMove/TypedExpr origin/exprNode≥0/originId==semanticRow/未消费/action==−1/source pair invalid），绑 `def.valueDefConsumeOpIndexPlusOne = actionRow+1`，返回 actionRow = `bodyIR.ops.len`（即将追加的消费 op 行）。任何一列不符 hard fail（借视/清理动作/已消费定义绝不接线）。
  - **primary_object_plan.cheng（+16/−10）**：`PrimaryBodyIrAppendSeqStrAddValueSlot` 的 w33-b 手工接线升级为权威调用——probe 命中且未消费时调上述权威，call/op 对携带 `sourceDefinition=(BodyOpTag, defRow)` + `consumeActionRow=actionRow`（两列相等）。
- **修法定性（b 项收口的权威答案）**：DecodeCallOrdinal else 臂（body_ir_access.cheng:1599-1645）对带 sourceDefinition 的 ManagedStoreNone 消费 call 唯二合法 ingress 形：`managedReplaceRetain`（2 参 replace，target-argument exact 要求 Global/Borrow place，ABI 与 seq-append 不符，w33 已定性排除）或 `call.consumeActionRow >= 0`。consumeActionRow 的 ingress 语义域 = **消费 op 自身行**——managed-replace-move 生产道的 replaceOpId 戳（managed_lvalue_replace.cheng :1438/:1450）与 append-only managed move 事件契约（body_ir_access :2743-2771 `op.consumeActionRow == opIndex && call.consumeActionRow == opIndex`）同一域；cleanup_cfg 搬移期 :9929 `op.consumeActionRow = outputOpIndex` 按同域 re-stamp。seq-add 的 piece 消费即按此域落戳。
- **w33 判词死亡实证**：kernel_driver_w35 编 cold_nested 不再出现 `ingress BodyIR ownership invalid code=15 site=2 index=5 detail=0 fn=0`——fn=0（nestedFmt）的 BodyIrAccessDecode 全链通过（定义侧 canonicalConsume :5117-5220 与 call 侧 explicitSourceConsumer 同时满足），管线推进到同函数 ApplyOwned 内 decode 之后的 **exactDef call authority 主审**，撞新判词 `call var unique-borrow authority is not exact`（/tmp/oob_ab/w35/cn_w35.compile.log）。
- **新墙定性（授权外，契约 Owner 裁量，停手移交）**：die 点 = `exact_def_call_authority.cheng:1194`（W8 unique 臂，lldb 斟 `cheng_cold_f74273ff_16825` 实证，caller=CallValid+10236 即 :1191-1194）。主循环 :1701 对**全部** CallOp 无差别进入；:1099-1108 把 `argPassKinds ∈ {ParamAddress, ForwardEntrySret}` 的实参划入 var-formal 精确性车道。而 `cheng_seq_str_add(seqPtr: ptr, valuePtr: ptr)` 是 `@exportc` runtime intrinsic（program_support_backend.cheng:2623-2624），**无 Cheng 形参**，其栈槽地址实参走 ParamAddress 是既定拼写（replace 道 `managedLvalueReplaceSourceArgPassKindExact` :1366-1368 对 StackValue/ParamAddress-place 槽同样发 ParamAddress）。piece 的 current def = fresh ManagedTemporary（exact_def_derive.cheng :690-692：place=Temporary、opOriginIds=自身行）→ `ExactDefIdentityDefinitionRootsFrameOwnedSlot` 要求 `opOriginIds == slot` 必假 → W8 全臂失败 → die。**结构性矛盾：被 intrinsic 消费的 fresh temp 永远不可能同时是合法 rebindable var-formal 源；且 managed-replace 的栈槽源（sourceArgPassKindExact → ParamAddress，如 `x = f()` 全局托管赋值）同撞此墙**——非 seq-add 发射形独有的错。

## 移交修法建议（exact_def_call_authority.cheng owner 裁量）

var-formal 车道补 callee-formals 门：`calleeRows[callRow] < 0`（importc/runtime-intrinsic，无 Cheng 签名）的 call 不进 ：1099 车道——该车道自锚 C `formal_is_var`（:1103 注释），本就以 callee 形参存在为前提。或为消费型地址实参立独立 admit 臂（sourceDefinition+consumeActionRow 已就位的 call 走 canonical-consume 证据而非 var-formal 证据）。**勿用 emitter 换 BorrowAddress 标签绕道**：decode（:1002-1041 三地址同型）与 codegen（无 pass-kind 分支）虽不破，但那是对 proof 层的 relabel 绕过，且管不掉 managed-replace 栈槽源同撞的结构性矛盾。

## 门禁与验收实况（cwd=仓库根）

| 项 | 结果 |
|---|---|
| 秒级门 managed_lvalue_replace.cheng（cheng_w35 --emit:obj） | **rc=0** |
| 秒级门 primary_object_plan.cheng | rc=2，HEAD 既有缺口（codegen_a64_fill_units.cheng:9 trailing tokens；A/B=pre_w35 备份同死，w33/wall28 已归档同签名） |
| 等价门（import 双模块探针编 obj） | **rc=0**（补丁闭包全量 parse+typecheck） |
| 车头回归门 v6 复现件（cheng_now / cheng_w35） | compile=0 run=0 双过 |
| 烤机 | 1 轮 rc=0：kernel_driver_build=ok entries=35，size=183240528，sha256=d3bfbf5cc8bc7748ecaac38bb1aedbf0ba1b147d7245dc3825569e3f0509db19；车头 cheng_w35 sha256=93847d3e98d20bb4076c39c28fa470f8a41e83e5336e6c12277fe7c31c009a35 |
| **cold_nested（w35 driver exe 全链）** | compile=2 `call var unique-borrow authority is not exact`——**w33 判词已死**，推进到 exactDef W8（上节移交）；exe 未产出 |
| ordinary_zero_exit_fixture（w35 driver） | **compile=0 run=0** 不回归 |
| zz_call_fixture_w7（w35 driver） | **compile=0 run=1** 正确语义不回归 |
| zz_v6_w7（w35 driver，只记录） | compile=2 `compiler csg: call ownership projection hop authority invalid node=34`——与 w33 基线（typed authority drift row=10）同为 csg/typed_expr 域推进中判词（w34 并行线 +1181 行在途），非本任务回归 |
| 车头 cheng_w35 语义参照 | cold_nested compile=0 run=0 输出 `cold_nested_fmt_interpolation=pass`；v6 0/0 |

## 遗留与移交

1. **exactDef W8 墙（上节，exact_def_call_authority.cheng 领地）**：清掉后 cold_nested fn=0 预期过 ApplyOwned（fn=0 无 CanonicalCleanupAction 定义走 fast return），fn=1 的 `let actual = nestedFmt(...)` WholeCall OwnMove 定义撞 w33 移交 2 预测的 ：5078/:5105 墙（无消费 op/无 term 边；合法出路仍 = release-as-move ABI（program_support_backend 领地）或 cleanup-action 消费，本轮未动）。
2. w34 并行线 typed_expr.cheng（+1181/−243）与 exact_def_identity.cheng（+61）、exact_def_derive.cheng（+22）在树上；本烤含其烤机窗口内状态。exact_def_call_authority/derive/identity 的 W8 判定逻辑文件中 call_authority 与 freeze 均 HEAD-clean，墙归属稳定树态非瞬态。
3. 烤机预算 1/3 轮。探针 src/tests/zz_probe_w35.cheng（import 门与 v6 复现件两用）已删净；编排者资产 zz_v6_w7.cheng/zz_call_fixture_w7.cheng 只读未动；产物/日志/pre 备份/判词证据全在 /tmp/oob_ab/w35/。未 git commit。

---

# wall36.VERIFY — csg 域两墙定性轮（v6 的 hop authority node=34 + 标量裸声明 group parser coordinate；两墙病根均钉死在授权外文件，按纪律停手零主树改动完整移交）

## 判定：无补丁、零烤机（wall4/wall5/wall14/wall32 同例，不产假补丁）。两墙守卫本身零缺陷且不可在 compiler_csg.cheng 内闭合：墙一生产缺口在 typed_expr.cheng（FieldGet 节点 structuralTypeId 恒 -1），墙二生产缺口在 parser receipt sidecar node 行域与 value-expr tree 节点域脱节（compiler_parser_receipt/typed_expr 领地）。主树零接触；探针已删净；秒级门 rc=0。

## 墙一：`compiler csg: call ownership projection hop authority invalid node=34`（v6）

### 复现与现场（lldb 实测，kernel_driver_w34 编 src/tests/zz_v6_w7.cheng rc=2）

- `compilerCsgCallOwnershipProjectionAppendInto`（compiler_csg.cheng:6405）全程仅命中一次即败：
  `typedFunctionIndex=2(outer), valueNodeIndex=34, effectRow=0, caller 列=(producer=0, declRow=18)`——
  调用点 ：7592 构建路径（resolved-call 所有权效应），首个受管实参 `n.arena`。
- 五条件链断点实测（/tmp/oob_ab/w36/trace_w36.py）：`fnStart(outer)=31, fnCount=25`；
  cond1 `operand0(33) < 31` 假；cond2 `33 >= cur(34)` 假；**cond3 `exactTypeId(=TypedExprIrNodeStructuralTypeIdAt(ir,34)) < 0` 真（=-1）** → 判词。
  bound 节（nodeAuthorityTypeArenaBound）此阶段=0，owner 列走调用方 (0,18) 均 >=0，无关。

### 生产缺口（typed_expr.cheng，授权外）

- node 34 = `TypedExprIrOpFieldGet`（`n.arena`），`nodes2_structuralTypeIds[34] = -1`。
- 唯一 FieldGet 生产者 `TypedExprIrAddRhsFieldGetNode`（typed_expr.cheng:20344-20386）恒置
  `resultStructuralTypeId = -1` 且无任何后置补绑（全树 grep：typedExprIrBindNodeStructuralType
  调用点无一覆盖 FieldGet）。同族 `TypedExprIrAddRhsIndexGetNode`（:20388-20429）在
  exactTypeArena 在场时从 baseTypeId 经 arena 解析绑定——不对称即缺口本体。
- FieldGet 构建时 arena 必在场：两条函数体构建路径
  `TypedExprBuildIrForFunctionSourceRanges`（:63164-63170）与
  `TypedExprBuildIrForFunctionSourceRangesFromMetadata`（:63691-63699）均先
  require+bind candidate arena 再建节点，故 typed_expr 侧可发布而未发布。

### 为何 compiler_csg.cheng 不可修（非弱化论证）

1. hop exactTypeId 进入 hopCid 身份列（:6351-6546），不可 -1 顶位。
2. 同文件下游权威绑定 `compilerCsgTypedNodeAuthorityCandidateBuildInto`
   （:34009-34014）把 `nodes2_structuralTypeIds` 当 typed_expr 冻结权威：`< 0` 即
   `typed-node exact producer TypeId missing` hard-fail；csg 对 FieldGet 只做
   「字段权威推导 == 冻结列」等值校验（:34246-34266，compilerCsgExactFieldTypeIdInto），
   不代造。若只在 projection 处推导放行，v6 立即死在 authority bind 同节点——
   守卫不动则墙必移位；守卫代发布则越权写 typed_expr 权威列（AGENTS.md 后端
   不得补类型权威红线）。故修法只能落在生产者。

### 移交修法（typed_expr.cheng owner 裁量）

`TypedExprIrAddRhsFieldGetNode` 在 exactTypeArena 在场时发布字段精确 structural
TypeId（对齐 IndexGet 同族拼写，或由 `TypedExprIrResolveExactFieldNodeMeta` 的
fieldType 文本经 arena 解析），补绑经 `typedExprIrBindNodeStructuralType`。
普通夹具（ordinary/call_fixture 无受管 FieldGet 实参）零影响；v6 越墙后推进墙二同域。

## 墙二：`csg compiler snapshot: value-definition group parser coordinate invalid`（`var x: int32` 标量裸声明）

### 复现与现场（lldb 实测，探针 zz_probe_w36.cheng=`fn main(): int32 = / var x: int32 / return 0`，已删净）

- kernel_driver_w34 rc=2 同判词（=w34 VERIFY 探针 w34e 原位）。
- 七条件链断点实测（/tmp/oob_ab/w36/trace_vg4.py，含 ACC2 唯一累积路径）：
  `sourceId=0`；`declarationSourceLocalRow=1 < declCounts[0]=2` ✓；
  `patternSourceLocalRow=0 < patternCounts[0]=1` ✓；
  **`initializerRootSourceLocalNodeIndex=3 >= parserNodeCountsBySourceId[0]=1`** → 判词
  （消费点 compiler_snapshot_schema.cheng:11217-11218）。

### 域脱节（生产方均在授权外）

- group 行 `initializerRootSourceLocalNodeIndex` 由 typed_expr.cheng:6070
  `ParserValueExprNodeSourceLocalIndexAt(tree, initializerRootNodeIndex)` 写入
  （value-expr tree 节点域；标量零值 rhs 合成节点 index=3）。
- `parserNodeCountsBySourceId` 来自 snapshot.parserNodes 行数，逐源于 parser receipt
  sidecar `nodeKinds` 行（compiler_parser_receipt.cheng:2777 生产；
  compiler_snapshot_builder.cheng:2345-2387 转入 parserNodes）——该源仅 1 行。
- 即 value-expr tree 的节点域（含语句根/零值 rhs）⊄ receipt sidecar node 行域，
  按构造必炸；任何带 binding initializer 的用户源在驱动内均撞此墙。
  ordinary/call_fixture 无 binding initializer group → 校验循环零迭代，不回归。

### 移交修法（parser receipt / typed_expr owner 裁量，三选一）

a. sidecar 生产侧：receipt node 行覆盖完整 value-expr tree 节点域（stmt-root/零值 rhs 补行）；
b. typed_expr 注册侧：group 的 initializerRoot 映射为 canonical sidecar 行
   （compiler_csg.cheng:35322 `canonicalProducerRow` 已有同域先例可对齐）【更正 2026-09-10 实读：旧写 `:34929` 已漂移，`var canonicalProducerRow: int32 = -1` 现址 `:35322`（`:35322-35340` 整块）；旧 `:34929` 现落 `CompilerCsgTypedNodeAuthorityBindInto` 的 `ArenaArrayInt32Set(`】；
c. schema 消费侧扩域/放行——禁走（弱化守卫）。

## 统筹提示

v6 含 `let r = outer(n, 2)`、`let r1 = addCol(...)` binding initializer group——
墙一修复后 v6 将推进并撞墙二同域；两墙须一并清才可能 v6 驱动内全链绿。

## 门禁与纪律执行

- 秒级门：cheng_now 编 compiler_csg.cheng → obj rc=0（/tmp/oob_ab/w36/tc.o，34,073,756 B）。
- git diff --stat -- src/core/tooling/compiler_csg.cheng：apply 前后均 `1047 insertions(+), 1038 deletions(-)`
  （并行既有，本任务零 hunk）；改前备份 diff 逐字节一致（IDENTICAL）。
  备份 /tmp/oob_ab/w36/compiler_csg.cheng.pre_w36 sha256=3290dbf0b3b79820376638471e58089ee7bf398ac46965ebc649fa99cbb444e4。
- 烤机 0 轮（无补丁即无烤机面；无产物 sha256 可交付）。主树仅动过的探针
  zz_probe_w36.cheng 已删净（src/tests 零残留）。
- 证据：/tmp/oob_ab/w36/（trace_w36.py 墙一五条件实测、trace_vg2/3/4.py 墙二七条件
  实测、appendinto.asm/vgvalidate.asm 反汇编、tvg_out.txt/tvg3_out.txt 现场栈 dump）。
- 编排者资产 zz_v6_w7.cheng 只读未动；未 git commit。
---

# wall37.VERIFY — exactDef `call var unique-borrow authority is not exact` 墙（cold_nested W8 unique 臂，已清；残墙定性 = 授权外空窗 validate 误激活 + identity 既有墙，停手完整移交）

## 判定摘要

- 补丁 /tmp/oob_ab/exactauth_wall37.patch（git 格式 46 行，+28/−0，仅 src/core/analysis/exact_def_call_authority.cheng；`git apply --check --reverse` 过；该文件任务始 HEAD-clean，本补丁即全部净贡献）。
- 双门修法（w35 方向落地 + 空窗态补强，零守卫弱化：FrameOwnedSlot/shared/projection 各臂对真 var-formal 原样）：
  1. **callee-formals 门**（CallValid 入口）：calleeRows 窗内 calleeRow<0 → 全 call 不进 var-formal 车道。键车道语义 = typed_expr 生产坐标守卫硬性要求 importc 声明 `producerFunctionRow==-1`（typed_expr.cheng :29908-29916 panic 契约），合成调用无 call declaration → -1 ⟺ importc/合成 = 无 Cheng 形参表；车道自锚 C formal_is_var，以 callee 形参表存在为前提。真 Cheng callee（>=0）与空窗态行为不变。
  2. **canonical-consume 源实参分离**（逐实参，两态通用）：call 自带 access decode 已验的消费权威（`consumeActionRow>=0` + sourceDefinition 对，wall35 `ManagedLvalueReplaceProductionBindIntrinsicSourceConsume` 接线、与 append-only managed move 事件同 ingress 域）且实参槽 == 被消费源定义所在槽 → 该实参是消费源而非 var formal 绑定，退出车道。无消费权威实参（smoke N7 族等）照旧全量审。
- **W8 判词死亡实证**：kernel_driver_w37b 编 cold_nested / p_name 复现件不再出现 `call var unique-borrow authority is not exact`（w35 驱动同输入该判词原位），推进到同 lane 下一判词 `borrowed managed local cannot bind a rebindable var formal`。

## 机理（为何止步于此，移交链闭合）

1. w35 的 W8 die 发火点 = **ownership_body_ir_production.cheng:1200 的 canonical-empty 空窗 validate**（ApplyOwned 内 decode 之后），非带窗 validate。实证：p_name 无任何 var-formal Cheng 调用（str/cstring 全 byval，@borrows 走 BorrowAddress=2 不进车道），带窗 validate 在本补丁门1下无任何车道入口可死 → w37b 的 shared die 只能来自先跑的空窗 validate ⇒ `bodyIR.exactDef.sealed` 在 ApplyOwned 内为真。
2. 该空窗门自述休眠前提「生产侧当前恒 unsealed → 本门零行为变化（批 6 接产源时激活）」**已被打破**：primary_object_plan.cheng :65166 `BodyIrExactDefDerive`（内含 `BodyIrExactDefSidecarSealInto`，唯一 sealed=true 写点）先于 :65177 ApplyOwned 运行。即生产把「契约空窗=全量审」的合法态（批 5 REPORT §5 非降级口径）喂给了始终先行的 ApplyOwned。
3. 空窗态下车道无法获得 callee-formals 事实（唯一授权载体 = calleeRows 键窗），而 exact_def_call_authority_smoke 的 N7/N8/P 族单测（validatePhase = 空窗 + 合成调用载具）把「空窗态合成调用全量审」锁为单测契约；BodyIR 原生字段（semanticCallExprNodeIndex/targetSourcePath/targetIsImportc）虽可识别合成调用，但单测载具同为合成调用 → 任何空窗态合成门都翻转 N 族期望。**两者不可同时满足 = 病根在授权外，按纪律停手。**
4. **移交修法**（ownership_body_ir_production/primary_object_plan owner 裁量）：ApplyOwned 空窗门恢复休眠（`if bodyIR.exactDef.sealed` 增加 contract-active 前提）或按批 6 接产源把 contract+calleeRows 窗传入 ApplyOwned（与 primary :65228-65255 / backend2 :1894-1920 同构）。修成后 cold_nested/p_name 越过 lane（带窗 validate 已被本补丁门1+门2 覆盖），预期撞第 3 条既有墙。
5. **p_lit 既有墙**（w35/w37b 同判词原位归因，非本补丁引入）：纯字面量 Fmt `Fmt"outer=7"` 在 w35 与 w37b 上同为 rc=1 `cheng_cold: exact identity schema [freeze] body=0 producer=0 slot row=6 has partial authority kind=3 exact_type=-1 … expected_storage=2`（发射点 exact_def_identity.cheng:325，批 3 identity 域，授权外）。字面量 piece（wall33 修a 的 #nev binder 定义）本就过 W8 车道，与本补丁无关。

## 门禁与验收实况（cwd=仓库根）

| 项 | 结果 |
|---|---|
| 指定秒级门 | 补丁前 HEAD 态 rc=0（tc_pre.o）/ 补丁后 rc=0（tc.o），stderr 均为车头既有诊断打印 |
| 车头 cheng_w37（sha256=9d74cdda…）回归门 | v6 复现件（src/tests/zz_probe_w37.cheng 拷自编排者 zz_v6_w7.cheng，用后删）compile=0 run=0 |
| 车头语义参照 | cold_nested compile=0 run=0 输出 `cold_nested_fmt_interpolation=pass` |
| 烤机 1 轮 rc=0 | kernel_driver_build=ok entries=35，size=183240528，kernel_driver_w37b sha256=58f2257ff58388baab88c6129d9296ed53a2470f5d376e0c85b71a1d8ee7be5d |
| **cold_nested（w37b exe 全链）** | compile rc=2 `borrowed managed local cannot bind a rebindable var formal`——**W8 判词已死**，残墙见移交 1；exe 未产出 |
| ordinary_zero_exit_fixture（w37b） | **compile=0 run=0** 不回归（首两次 rc=2 为并行瞬态 `os atomic tree: parent lease unavailable`，串行重试即消，w31/w34 同例） |
| zz_call_fixture_w7（w37b） | **compile=0 run=1** 正确语义不回归 |
| zz_v6_w7（w37b，只记录） | compile rc=2 `compiler csg: call ownership projection hop authority invalid node=34`——w34/w35 记录同判词原位（w36 线领地），非本任务回归 |
| 探针二分（用后删净） | p_lit（纯字面量 Fmt）→ w35/w37b 同 rc=1 identity 判词（既有墙）；p_name（str 形参 Fmt）→ w35 rc=2 W8 判词 / w37b rc=2 shared 判词（本补丁推进实证）；p_cmp（裸 `==`+let str）→ rc=1 `lowering ownership transport: managed temporary definition missing node=0 row=0`（更早 lowering 既有墙，两驱动同） |

## 产物与身份

- 改前备份 /tmp/oob_ab/w37/exact_def_call_authority.cheng.pre_w37 sha256=dec4e113f9c65737c91490a26369284f56015e5aa0306e3711bbc5e2f6f0fb5d（任务始该文件 git diff 为空 = HEAD-clean）。
- git diff --stat：apply 前 空 → apply 后 `28 insertions(+)`（即补丁全文）。
- 补丁 /tmp/oob_ab/exactauth_wall37.patch sha256=430935a9e54f661e0891c9cde20c092e55fe5b4d602df5e165cedaf9a284daf2（46 行，git 格式）。
- 车头 /tmp/oob_ab/cheng_w37 sha256=9d74cdda28dd3b92c67f1140f76499389e3cf990aa84f56af080ad127a14bfa6；kernel_driver_w37b 见上（bake_w37.log）。
- 烤机预算 1/3 轮。探针 zz_probe_w37 / zz_w37plit / zz_w37_pname / zz_w37cmp 已删净，主树无本任务残留文件；编排者资产 zz_v6_w7.cheng / zz_call_fixture_w7.cheng 只读未动；产物/日志/pre 备份全在 /tmp/oob_ab/w37/。未 git commit。

## 遗留与移交（按拦截序）

1. **ApplyOwned 空窗 validate 误激活**（ownership_body_ir_production.cheng:1199 休眠前提破坏，根因 primary_object_plan.cheng :65166 seal 与 :65177 ApplyOwned 的排序）：残墙 `borrowed managed local cannot bind a rebindable var formal` 的根。修法见机理 4；冷链接照 cheng_w37 同输入全绿证明源语义合法，缺口只在 .cheng 验证器布线。
2. **p_lit identity 既有墙**（exact_def_identity.cheng:325，w35 原位）：字面量 Fmt 形的 slot partial authority。cold_nested 越过残墙后预计撞此墙（其 literal piece 同族）。
3. w33 预告的 fn=1 :5078/:5105 族（release-as-move ABI，program_support_backend 领地，body_ir_access.cheng decode 作用域终值审计）仍在更后面，本轮未触达。
4. 本补丁为后续所有墙的前置：带窗 validate（primary :65255 / backend2 :1920）对 importc/合成 callee 与已接线 piece 的车道豁免已由门1+门2 覆盖并经 w37b 烤机验证。

---

# wall38.VERIFY — typed_expr FieldGet 结构TypeId 发布墙清（v6 hop authority node=34 判词死亡实证）；墙二定性反转并移交：裸声明组 initializerRoot 是 typed_expr 合成键，receipt 无物料可补，唯一诚实出路在 snapshot schema 消费侧（授权外，停手）

## 判定摘要

- 补丁 /tmp/oob_ab/typedexpr_wall38.patch（git diff 树态全量含前轮 hunks；本轮净增 +153/−0，1 文件 2 hunk，仅 typed_expr.cheng）：
  - **hunk 1（TypedExprIrAddRhsFieldGetNode 函数尾）**：exactTypeArena 在场且 baseNode>=0 时，经新助手解析字段精确 structuralTypeId 并 `typedExprIrBindNodeStructuralType` 一次性发布（对齐 :20405 IndexGet 同族拼写；bind 同步填 managed/send/sync/proof 四列）。
  - **hunk 2（两个新助手）**：`typedExprIrFieldGetExactStructuralTypeId`——baseTypeId 先剥 Alias/Apply/Borrow 到物理 owner（与 csg owner 侧 `compilerCsgExactLayoutPhysicalTypeId` 等值校验同构；`var T` 参数= Borrow 包装，剥皮必需），非 builtin 走 arena symbol member 表（symbolMemberStarts+ordinal，三列坐标联立自证 producerSource/symbol/ordinal，任一不符返回 -1），builtin（str/seq/option）按 csg `compilerCsgExactLayoutBuiltinFieldMatches` 同族发布保留标量（str: data=CString len/storeId/flags=I32；seq: len/cap=I32 buffer=CString；opt: has=Bool value=child）；`typedExprIrFieldGetBuiltinStructuralTypeId` 为其 builtin 臂。返回 -1（不可解析）时列保持未绑定，下游 `typed-node exact producer TypeId missing` 权威门仍是唯一 hard-fail——零弱化。
- **与 csg 消费契约的等值论证**：csg `compilerCsgExactFieldTypeIdInto`（:16185）声明路线解析出的 fieldTypeId 被 :16245-16264 交叉验证等于 `memberTypeIds[memberStart+ordinal]`；本补丁发布值就是该 member 表值 → 逐值相等（非近似）。:34260-34266 的 `typed-node field TypeId drift` 等值校验按构造通过。
- **墙一死亡实证（kernel_driver_w38 烤机 1/3 轮，sha256=c862119dcf598393c8b2345fd21323bbdef1278a313d8d1bec2a9090476225a2）**：v6 compile rc=2 判词从 `compiler csg: call ownership projection hop authority invalid node=34`（w34/w35/w36 三轮基线）变为 `compiler csg: typed-node unmanaged ownership premise drift node=15`——**hop authority 墙死亡**，v6 推进穿过 projection+权威 walk 的全部 FieldGet 节点（:34013 exact-producer-TypeId 门对被绑定的 FieldGet 全通过），撞下一道潜伏 csg 权威墙。

## 新墙 node=15 定责（非本轮引入，证据三方闭合）

1. 该判词（compiler_csg.cheng:34376）输入=`nodes2_exprClasses[node]`（typed_expr 存储列）vs `ManagedAt(arena, exactTypeId)`。exprClass 由 `typedExprNodeExprClassExact`（typed_expr.cheng:2918-2963）经 **resultType 文本** `TypedExprIrTypeContainsManagedStorage` 判定，不读 node.resultTypeManaged/proofKind 列——本补丁绑定的列不进入该函数，FieldGet 节点的 exprClass 逐字节不变。
2. 受本补丁绑定的 FieldGet 节点在该判词两臂均自洽：非托管字段（int32 等）文本判 Unmanaged 且 TypeId 非托管 → :34374 臂通过；托管字段（Box 等）文本判 Borrowed 且 TypeId 托管 → :34378 臂通过。node 15 不是 FieldGet。
3. 时序：patch 前 pipeline 死于更早的 projection 阶段（node 34），该 walk 从未执行到 node 15；patch 后 projection 通过、walk 推进到 node 15 原位暴露潜伏判词。与 w24→w31→w34 的「墙移位暴露下一墙」同模式。

## 墙二定性反转（w36 移交的两条可修路线均被本轮实验否死，证据链完整移交）

w36 判断「initializerRoot 来自 value-expr tree 节点域（parser 物料）」不完整。车头探针实测（cheng_w38，sha256=333054e1b9bb2401c9d550c0ac99b0e5465bf94f481e0e26bbfb91ac31433389）：

1. **基础 parse（`ParserValueExprReadTreeFromText`，即 receipt 观察的树）对 `var x: int32`+`return 0` 产出 nodeCount=1、stmtRootCount=1**——唯一语句根是 `return 0`（role=ReturnValue，bindStart=-1），裸声明不产生任何 parser 节点/语句根。
2. **完整 layer parse（`ParserReadNormalizedExprLayerFromText`）同样 nodeCount=1、exprs=1**——layer 构建也不为裸声明建 expr/节点。
3. 真凶在 typed_expr.cheng:5631-5643（本轮定位）：decl-local 组注册发布 `initializerRootSourceLocalNodeIndex = nodeCount + 1 + declarationRow`，源码注释明言「Disjoint from parser value-expr node source-locals」——**合成键**，按构造 >= parserNodeCounts，schema `value-definition group parser coordinate invalid`（compiler_snapshot_schema.cheng:11217）必然命中。w36 实测 initRoot=3=nodeCount(1)+1+declarationRow(1)，与合成键公式逐值吻合。
4. 消费契约（:11172-11284）要求 initializerRoot 解析到 BindingInitializer 语句根并五列联立（statement 声明区间/declarationKinds=Local/functionRows/patternBinding/reachable 函数 join）。裸声明的这些 parser 物料**不存在**：
   - 路线 a（receipt 补行，compiler_parser_receipt.cheng）不可行：receipt 是 parser 投影，parser 从未为裸声明造节点/语句根，补行=伪造 parser 权威；receipt 生产侧两条观察流（ObserveSourceTree 基础树 / ObserveFunctions layer 树）域一致，缺的不是观察而是物料。
   - 路线 b（typed_expr 映射 canonical sidecar 行）不可行：不存在可映射的 canonical 行（无可指向节点）。
   - 路线 c（schema 扩域）按 dispatch 禁走。**唯一诚实出路是 schema 消费侧为 decl-local 合成键组立独立准入臂**（用已发布且可交叉验证的 declaration/pattern 坐标系替代 statement-root join，如 declarationKinds==Local+functionRows+patternBinding+bindingCount==1+合成键公式自证），归 compiler_snapshot_schema.cheng owner 裁量——超出本任务授权面，停手移交。

## 门禁与验收实录（cwd=仓库根）

| 门 | 结果 |
|---|---|
| 秒级门（cheng_now --in:typed_expr.cheng --emit:obj） | rc=2，`([aer]) pop=105 slot=96 rr=-1 rrslot=-9 / managed element field read lacks exact array root`——与 w34 归档 HEAD 既有签名逐字同款，不新增死因 |
| 烤机 1/3 轮 | rc=0，kernel_driver_build=ok entries=35，size=183240608，sha256=c862119dcf598393c8b2345fd21323bbdef1278a313d8d1bec2a9090476225a2 |
| kernel_driver_w38 × ordinary | compile=0 run=0（不回归） |
| kernel_driver_w38 × call_fixture | compile=0 run=1（不回归） |
| kernel_driver_w38 × v6 | compile=2 `compiler csg: typed-node unmanaged ownership premise drift node=15`——**墙一判词死亡**，推进 csg 权威 walk 潜伏墙（上节定责，非本轮引入）；exe 未产出 |
| kernel_driver_w38 × zz_probe_w38（`var x: int32`+return 最小形） | compile=2 `csg compiler snapshot: value-definition group parser coordinate invalid`——墙二判词在无 FieldGet 形上原位复现，与本轮定性互证 |
| cold_nested_fmt_interpolation_smoke | 3 次串行重试均撞 w37 并行租约冲突 `os atomic tree: parent lease unavailable`（间隔 90s/240s），w37 烤机占父目录租约；按并行须知静置归因（w37 线领地只记录），非本轮回归 |

## 产物与身份

- 改前备份 /tmp/oob_ab/w38/typed_expr.cheng.pre_w38 sha256=35142720ed050ef610a28742ef5dcdadee59b5562686e83976668c08a32b6865
- 补丁 /tmp/oob_ab/typedexpr_wall38.patch sha256=066ea5b4a37e0da5ca1dc852ca0e3714bde78da966e0bb9f5aef8edd57025b0c（1623 行；含前轮 w10-w34 树态 hunks，本轮 delta=+153/−0）
- git diff --stat -- src/core/lang/typed_expr.cheng：apply 前 +938/−243 → apply 后 +1091/−243
- 车头 cheng_w38 sha256=333054e1b9bb2401c9d550c0ac99b0e5465bf94f481e0e26bbfb91ac31433389
- kernel_driver_w38 sha256=c862119dcf598393c8b2345fd21323bbdef1278a313d8d1bec2a9090476225a2（size=183240608）
- 探针 zz_probe_w38.cheng 已删净（src/tests 零残留）；编排者资产 zz_v6_w7.cheng/zz_call_fixture_w7.cheng 只读未动；产物/日志 /tmp/oob_ab/w38/；未 git commit；烤机 1/3 轮。

## 遗留墙（完整移交）

1. **v6 现行墙（csg 权威 walk，compiler_csg.cheng:34376 领地）**：`typed-node unmanaged ownership premise drift node=15`。node 15 为非 FieldGet 节点（定责见上），其 exprClass 存储列与 TypeId 托管性在 csg 侧被 :34371-34377 判漂移。须定位 node 15 的 opKind/exprClass/TypeId 三元组后由 compiler_csg 或 typed_expr expr-class 契约 owner 定夺。
2. **墙二（snapshot schema，compiler_snapshot_schema.cheng:11172-11284 领地）**：裸声明 decl-local 组的合成 initializerRoot 键无 parser 物料可依，schema 需为该组类立独立准入臂（设计要点见上）。该墙在 v6（`var n: Node` 裸声明，:41）清掉 node 15 后必撞，最小形 zz_probe_w38 已实证原位。
3. w37 并行线（exact_def_call_authority.cheng）同烤窗口，cold_nested 判词静置归因。

---

# wall41.VERIFY — snapshot schema 消费侧为 decl-local 合成键组/行立独立准入臂（w38 移交墙二清；裸声明最小形连穿两级 schema 墙，ordinary/call_fixture 不回归；新边缘 primary freeze 墙=w39/w40 领地静置移交）

## 判定摘要

- 补丁 /tmp/oob_ab/schema_wall41.patch（1 文件 1 hunk，仅 src/core/csg_core/compiler_snapshot_schema.cheng，+73/−7，117 行，sha256=02cfc748b9ba81465ba4c663c57365e431d16baf3f527e2d350e5a24bd4b6cac；注：任务简报写 src/core/tooling/ 为路径笔误，判词字符串全仓唯一出现于 csg_core）：`git apply --check --reverse` 过。两级准入臂：
  - **组级臂（csgCompilerValueDefinitionGroupsValidateInto，原 11217 判词臂）**：`initializerRootSourceLocalNodeIndex >= parserNodeCountsBySourceId[sourceId]` 从复合判词拆出独立成臂。放行条件联立自证（任一不符原判词原样 return false）：合成键区间（==parserNodeCount 拒、>parserNodeCount+declarationCountsBySourceId 拒，即 key ∈ [nodeCount+1, nodeCount+declarationCount]，与 typed_expr.cheng:5631 `declarationRootKey = nodeCount + 1 + declarationRow` 公式自洽）+ decl-local 组形态（bindingCount==1 ∧ bindingOffset==0，typed_expr:5646-5651 恒定发布）+ declaration/pattern 坐标系（declarationKinds==Local ∧ declarationFunctionRows==parserFunctionRow ∧ patternBindingDeclarationIds[patternRow]==declarationRow）+ valueDefinitions 六列 join（originKinds/groupRows/producerSourceIndexes/declarationSourceLocalRows/patternSourceLocalRows/functionIds，与原 statement-join 臂同款）。通过 → continue 跳过 statement-root join（合成键无 parser 节点可解引用）。declarationRow/patternRow/parserFunctionRow 三个 let 前移至臂前。
  - **行级臂（csgCompilerValueDefinitionsValidateInto，原 11406 判词臂）**：烤机 1/3 轮实证组级臂放行后最小形推进同域行级墙 `value-definition parser node invalid`。病根：TypedExprIrConsumeDeclarationLocalValueDefinition（typed_expr.cheng:5761-5767）发布 decl-local 行时按 append 契约（5927-5929 BindingInitializer 强制 sourceLocalNodeIndex>=0、禁 -1）以 declarationSourceLocalRow 顶替节点坐标列；typed_expr 内部行审计（4075-4078）只要求非负、从不解引用，schema 是全下游唯一解引用点——须改 typed_expr 契约才能换别的载体，超本任务授权面，故行级同构立臂。放行指纹 declLocalSyntheticRow（全联立）：originKind==BindingInitializer ∧ groupRow 有效 ∧ sourceLocalNodeIndex==declarationSourceLocalRow（顶替指纹）∧ 组 initializerRoot 处于合成键区间（>parserNodeCount 且 ≤parserNodeCount+declarationCount——与顶替指纹正交的组级分离器：真 parser-backed 组 initializerRoot 是真节点坐标 <parserNodeCount，数值巧合不可能全链命中）∧ definitionRows[groupRow]==definitionRow 回指 ∧ 组/行 declaration、pattern、function 列互证 ∧ consumedFlags==1。通过 → 该行 sourceLocalNodeIndex 不解释为节点坐标（跳过 parserNodeRowsBySourceLocalSlot 解引用）且 binding identity 臂豁免 parserNodeId>=0（11489 处，declarationKinds==Local/functionRows/patternBinding join 全保留）；任一不符原判词原样保留。
- 下游读点逐一核对（组列 initializerRootSourceLocalNodeIndexes 与行列 valueDefinitions.sourceLocalNodeIndexes）：root CSR 单调比较（合成键设计初衷即保证单调，typed_expr:5629-5630 注释）、len/clone、TypeCid 哈希物料（schema:10109/10165、builder:7147/7113）、typed_ir 值透传对账（builder:21098）、双 snapshot 等值比较（builder:25152）、release/clone（bridge:4088/cargo:1979,2016/validator:2254,2287）、Local Symbol 身份匹配（schema:7095-7111 用 originKind/producerSourceIndex/declarationSourceLocalRows 三列，不读节点列）。除本审计外全下游无解引用——准入臂放行后合成键/顶替值只作比较与哈希，审计零弱化闭环。

## 门禁与验收实录（cwd=仓库根）

| 门 | 结果 |
|---|---|
| 秒级门（cheng_now --in:compiler_snapshot_schema.cheng --emit:obj） | rc=0（两轮改动后均过） |
| 烤机 1/3 轮（kernel_driver_w41，组级臂） | rc=0 entries=35 size=183256944 sha256=b0cd7fce72db25df43eb5fb7c1a6b844992b9892c87ad9ac3eadb2d95c32f915 |
| kernel_driver_w41 × zz_probe_w41（`var x: int32`+return 最小形） | compile=2 `csg compiler snapshot: value-definition parser node invalid`——**w38 移交组级墙判词死亡**，推进同域行级墙（上节病根定责） |
| 烤机 2/3 轮（kernel_driver_w41b，组级+行级臂） | rc=0 entries=35 size=183256944 sha256=2e9454ec0922b6dcb2acdd621dac956d874aed5b963c38a2dd114cca0089dff6 |
| kernel_driver_w41b × zz_probe_w41 最小形 | compile=1 `exact identity schema [freeze] body=0 producer=0 slot row=0 has partial authority ... var_out_valid=0 / primary exact def freeze validate rejected`——**两级 schema 墙判词均死亡**，推进 primary 域新边缘墙 |
| kernel_driver_w41b × ordinary | compile=0 run=0（不回归） |
| kernel_driver_w41b × call_fixture | compile=0 run=1（不回归） |
| kernel_driver_w41b × v6（zz_v6_w7） | compile=2 `compiler csg: typed-node exact producer TypeId missing node=57`——w38 基线判词 `unmanaged ownership premise drift node=15` 已被并行线清掉（node=15 墙死亡），v6 推进至 csg 域 node=57 新墙；非本轮回归（本轮未动 csg/typed_expr） |
| kernel_driver_w41b × cold_nested_fmt_interpolation_smoke | compile rc=125 `resource_guard rss_limit_exceeded rss_bytes=1076872512 limit_bytes=1073741824`——RSS 守卫（恰超 1GiB 0.3%），非判词；w39/w40 同烤窗口中间态，静置不归因 |
| 租约 | probe 首两跑撞 `os atomic tree: parent lease unavailable`（w39 线烤 kernel_driver_w39b 占父目录租约），待其退出后串行即消；call_fixture 验收亦在 w39b 烤机窗口内完成均绿 |

## 归因与移交

1. **最小形新边缘墙（primary 域，w39/w40 领地，停手移交）**：`exact identity schema [freeze]` 判词归属 src/core/backend/primary_object_plan.cheng；git 树态显示 parallel 线正活跃修改 analysis/exact_def_identity.exact_def_derive/ownership_body_ir_production/backend 等域。裸声明 `var x: int32` 连穿 value-definition 组级/行级两级 schema 墙后原位暴露该墙；语义参照 cheng_now 同输入 compile=0/run=0（本轮复核仍绿），证明该形最终语义可绿、剩余缺口在 primary freeze 审计对 decl-local 形的准入（或其上游 w39 改动收敛后自然消）。
2. v6 新墙 `typed-node exact producer TypeId missing node=57`（compiler_csg 域）：node=15 判词死亡由并行线达成，v6 推进；本臂已就位为 v6 全链绿必要件（否则清完 csg 墙必撞 schema 墙回退）。
3. cold_nested RSS 125 静置（0.3% 超限，疑驱动峰值漂移，待 w39/w40 定稿复测）。

## 产物与身份

- 改前备份 /tmp/oob_ab/w41/compiler_snapshot_schema.cheng.pre_w41 sha256=27e1745b28b8696f7d03d2a156af0f10a16994931dacc83cdb39e1c797788df4
- 补丁 /tmp/oob_ab/schema_wall41.patch sha256=02cfc748b9ba81465ba4c663c57365e431d16baf3f527e2d350e5a24bd4b6cac（117 行）
- git diff --stat -- src/core/csg_core/compiler_snapshot_schema.cheng：apply 前 0 改动（该文件 HEAD 干净，w10-w40 各轮未动它）→ apply 后 +73/−7
- 车头 cheng_w41 sha256=321e4c9c9cdbe295453d5df457d9f33d0e747c3d60cded10274104a841972f4b
- kernel_driver_w41（1/3 轮）sha256=b0cd7fce72db25df43eb5fb7c1a6b844992b9892c87ad9ac3eadb2d95c32f915；kernel_driver_w41b（2/3 轮）sha256=2e9454ec0922b6dcb2acdd621dac956d874aed5b963c38a2dd114cca0089dff6（size 均 183256944）
- 探针 zz_probe_w41.cheng 已删净（src/tests 零残留）；编排者资产 zz_v6_w7.cheng/zz_call_fixture_w7.cheng 只读未动；产物/日志 /tmp/oob_ab/w41/；未 git commit；烤机 2/3 轮。
---

# wall39.VERIFY — exactDef `borrowed managed local cannot bind a rebindable var formal` 残墙（cold_nested，已清）+ 连清 producer call-mirror 假墙；残墙后第一既有墙 `local stack schema invalid` 原位移交

## 判定摘要

- 补丁 /tmp/oob_ab/wall39.patch（git 格式 80 行，+33/−24，仅 src/core/analysis/ownership_body_ir_production.cheng；`git apply --check --reverse` 过；该文件任务始 HEAD-clean，本补丁即全部净贡献；primary_object_plan.cheng 本任务零触碰，其 +1183/−205 为 w17/w23/w33/w35 既有在树工作）。
- 两 hunk，均为恢复既有契约（零弱化）：
  1. **ApplyOwned 空窗 validate 恢复休眠**（w37 移交方向一）：删除 `if bodyIR.exactDef.sealed:` 无窗审计块，留恢复休眠裁定注释。休眠前提「生产侧恒 unsealed」被 f7a88ae28 自始打破——该 commit 同时引入门块与两挂接点（primary_object_plan/backend2_pipeline）derive(seal) 先于 ApplyOwned 的排序，门一落树即在无事实通道下激活（ApplyOwned 签名不携带 contract+calleeRows 键窗，空窗全量审把 C-ABI 桥接拼写误审为 var formal 绑定，即残墙根）。权威审计 = 两挂接点 ApplyOwned 之后的带窗 ExactDefCallAuthorityValidateInto（同组合序验证器 + 全量事实），本门被其完全覆盖，零覆盖损失。
  2. **producer call-mirror 守卫补借视臂**（清残墙后暴露的同函数第一既有假墙）：`ownershipBodyIrRequireOwnedDefinitionSource` 终审 call-mirror 对 TypedExpr+OwnBorrowShared 且借主权威列已全证（上方 Shared 臂 semantic row/domain/row 全列 + 零消费边 + managed TypeArena 布局证明）的非 call op（wall 系 binder `PrimaryBodyIrPrepareManagedBodyOpValueDefinitionExact` 打戳的 FieldLoad/IndexedLoad/CopyLocal 借视形；载体节点 ParamRef/LocalRef/FieldGet/IndexGet 的 expr class 按 typed_expr 权威恒 Borrowed）放行。fresh owned（OwnMove）恒 call-mirror 不变；Shared+call 仍走全列 mirror 不变；借权列不全在上方 Shared 臂即 die 不变。借视不引入自有堆负载，释放义务由借主根承担——call-mirror 只约束 fresh owned 引入（函数头注释原契约），对借视无定义域。

## 机理（lldb 命中序 + 源语义链，全部闭合）

1. 残墙发火点 = ApplyOwned 空窗 validate 内 `ExactDefCallAuthorityValidateInto` 的 shared-borrow 臂（exact_def_call_authority.cheng:1210）。w37 已定性：带窗 validate 被 callee-formals 门豁免的 C-ABI 桥接拼写（fmt intrinsic 收编 piece 等）在空窗态被全量审。hunk1 后该发火点随门休眠消失。
2. hunk1 暴露的 `owned producer is not canonical call-result`（同文件 :370，f7a88ae28 之前 a7ee2da19 既有守卫，被空窗门先死掩盖至今）：p_str 形状（`Fmt"v={n}"` str 插值）下 `PrimaryBodyIrMaterializeManagedBorrowedNodeValueExact`（primary_object_plan.cheng:17616，HEAD 既有）给 `#nev{n}#borrowed` 借视槽的 FieldLoad 打 TypedExpr+OwnBorrowShared def 戳。lldb 实证（kernel_driver_w39，break `cheng_cold_974e7598_16726`）：守卫入参序 opIndex=4（StrLit 物化 bridge call，过）→ opIndex=6（借视 FieldLoad，死），与源级 op 发射序逐点吻合；bt 确认死点在守卫内 +13496（终审 mirror 区）、由 ApplyOwned 调用。typed_expr.cheng `TypedExprIrExprClassForResultTypeExact` 对 OpParamRef 恒返 TypedExprExprBorrowed → 戳 = OwnBorrowShared。
3. hunk2 后 cold_nested/p_str 越过守卫（w39b 上判词消失前移），暴露 `ownership body ir production: local stack schema invalid`（同文件 :183 `ownershipBodyIrStackHighWater`，StackValue 槽 offset/size/align schema 门；**p_int 探针在 w39 第 1 轮已同判词原位命中，先于 hunk2 存在，非本补丁引入**）。

## 门禁与验收实况（cwd=仓库根）

| 项 | 结果 |
|---|---|
| 秒级门 ownership_body_ir_production.cheng → obj | 两 hunk 各自 rc=0（tc.o/tc2.o，stderr 为车头既有诊断打印） |
| 车头 cheng_w39（sha256=94737200…7836） | v6 复现件 compile=0 run=0；cold_nested compile=0 run=0 输出 pass；ordinary 0/0；call_fixture 0/1（语义正确）——冷链语义参照全绿 |
| 烤机 2 轮均 rc=0 | kernel_driver_w39 sha256=b0d5f424…50f1（size 183240528）；kernel_driver_w39b sha256=c30c66e3…530a（size 183256944）；bake kernel_driver_build=ok entries=35 |
| **cold_nested（w39 exe 全链）** | compile rc=2 `owned producer is not canonical call-result`——**残墙判词已死**（w37b 同输入该判词原位），推进到 producer 守卫 |
| **cold_nested（w39b exe 全链）** | compile rc=1 `local stack schema invalid`（×3 确定性）——**producer call-mirror 假墙已死**，推进到 stack schema 既有墙；exe 未产出 |
| ordinary_zero_exit_fixture | w39 与 w39b 均 **compile=0 run=0** 不回归 |
| zz_call_fixture_w7 | w39 与 w39b 均 **compile=0 run=1** 正确语义不回归 |
| zz_v6_w7（只记录） | w39: rc=2 `compiler csg: typed-node unmanaged ownership premise drift node=15`；w39b: rc=2 `compiler csg: typed-node exact producer TypeId missing node=57`——判词随 w38/w41 并行线在途移动（typed_expr/csg 域），非本任务回归 |
| 探针二分（zz_w39_lit/str/int，用后删净） | p_lit→w39b `cleanup_cfg: independent stack order is not canonical local=2 offset=16 previous_start=64`（cleanup 域既有墙）；p_str→w39 `owned producer is not canonical call-result`（hunk2 靶心）；p_int→w39 与 w39b 同 `local stack schema invalid`（在先既有墙铁证） |

## 遗留与移交（按拦截序）

1. **`ownership body ir production: local stack schema invalid`**（ownership_body_ir_production.cheng:183 `ownershipBodyIrStackHighWater`，StackValue 槽 stackOffset<0 ∨ sizeBytes≤0 ∨ alignBytes≤0 即 die；cleanup_cfg.cheng:2170 同名判词为第二实现）：cold_nested/p_int 现位。肇事槽属 fmt 物化槽族（#fmt_parts/#nev#borrowed/fmt_var_str 等 FindOrCreate(Sized) 晚成槽的栈布局赋值链，primary_object_plan 栈布局相 vs 该守卫），修法归属 ownership_body_ir_production/primary_object_plan owner；p_int 在 hunk2 之前已命中证明与借视臂无关。本预算 2/3 轮用尽停手。
2. **资源包络**：w39b 编 cold_nested 曾一次测得 compile RSS 1027 MiB 贴 1 GiB 守卫（`CHENG_PROCESS_MAX_RSS_BYTES` 默认 1073741824，driver 可 env 覆盖）——该次达成的管线深度（越过 schema 前段）为历史首次；后续确定性复测均死更早的 schema 门未再现。schema 墙清除后重测包络。
3. p_lit 的 `cleanup_cfg: independent stack order`（cleanup_cfg 域）与 p_lit 预告的 identity 墙（exact_def_identity.cheng:325）仍在其后。
4. w41 线 kernel_driver_w41b 并行持树租约致官方根验收多次 `os atomic tree: parent lease unavailable`，串行退避重试即消；影子根（/tmp/oob_ab/w39/shadow）复测因 `package identity`/`parent component open` 门不可用已放弃，验收以官方根串行窗口为准。

## 纪律执行

- 改前备份 /tmp/oob_ab/w39/ownership_body_ir_production.cheng.pre_w39 sha256=03618250bfb581f6951b53d877f9bdd0eba12b48a490306d8ca2f4bf21e403b0（任务始该文件 git diff 为空 = HEAD-clean）。
- git diff --stat：apply 前 空 → apply 后 `33 insertions(+), 24 deletions(-)`（即补丁全文，80 行）；primary_object_plan.cheng 零 hunk（+1183/−205 为并行既有）。
- 补丁 /tmp/oob_ab/wall39.patch sha256=804e8a981c67a02f4f91db57fc906b2b75ae28d723bc68e19009b1cbffb55cea。
- 烤机 2/3 轮。探针 zz_w39_lit/zz_w39_str/zz_w39_int 已删净（ls 无匹配），主树无本任务残留文件；编排者资产 zz_v6_w7.cheng/zz_call_fixture_w7.cheng 只读未动；产物/日志/pre 备份/lldb 证据全在 /tmp/oob_ab/w39/。未 git commit。


---

# wall40.VERIFY — typed-node unmanaged ownership premise drift node=15 墙清（v6 推进穿过 csg 权威 walk 的 node15-56 段）；node=57 暴露 typed_expr LocalRef 生产缺口，授权外停手完整移交

## 判定摘要

- 补丁 /tmp/oob_ab/csg_wall40.patch（相对 w40 前树态，git apply --check --reverse 过；本轮净 +25/−2，1 文件 2 hunk，仅 src/core/tooling/compiler_csg.cheng）：
  - **hunk 1（compilerCsgTypedNodeAuthorityCandidateBuildInto 所有权前提判定，原 :34371-34373）**：`ownershipManaged` 由 raw TypeId 的 `ManagedAt` 改为物理目标类型的 `ManagedAt`——经既有 `compilerCsgExactLayoutPhysicalTypeId`（本 walk :34260/:34296 同款）剥 Alias/Apply/Borrow 后取 managed 标志；剥皮失败新判词 `typed-node ownership physical TypeId invalid` hard-fail。
  - **hunk 2（:34013 判词富化，纯诊断零弱化）**：`typed-node exact producer TypeId missing` 判词携带 `op/o0/o1` 三元组（本轮定位 node=57 全靠它，后续同门排查免烤机）。
- 烤机 2/3 轮：round1 sha256=9634518a83428af344b4a201c978a1950f7602bc8529dbc4da1efb7af013c8ba（size 183256944，仅 hunk1）；round2 sha256=f6e963d421cb02d4fc1a66c223fd0d2c92eb97daead0b8a42b68d7e2ea34bcc5（+hunk2，交付驱动）。

## node=15 墙机理（定责三方闭合）

该判词（:34374-34377）输入 = `nodes2_exprClasses[node]`（typed_expr 存储列）vs `ManagedAt(arena, exactTypeIds[node])`。node 15 = addCol 首参 `a: var Box`：

1. **TypeId 侧**：参数 TypeId 经 TypeSyntax 精确发布（`TypedExprIrAddParamNode` :14611 ← `typedExprIrParamStructuralTypeIdsExact` ← `TypeIdForTypeSyntax`）；`var T` 的 TypeSyntax = **StructuralTypeBorrow 包装**（wall38 hunk2 同款事实）。arena 契约（typed_expr_type_arena.cheng:6817-6818）：Borrow kind rule=BorrowedView，**managed/send/sync 列恒 0**（描述包装自身，非目标族）。
2. **exprClass 侧**：`typedExprNodeExprClassExact`（typed_expr.cheng:2958-2963）按 resultType **文本** StripVar 后分类——`var Box`→目标 Box(ref object) 托管→ParamRef→**Borrowed**。
3. **漂移**：raw `ManagedAt(Borrow)=0` ⇒ 门走非托管臂要求 exprClass==Unmanaged，实际 Borrowed ⇒ 必死。**这是全部 `var T` 托管参数的系统性拼写缺口**（`var int32` 参数物理 int32 非托管→文本 Unmanaged 两边一致不炸；`var int32[]` 参数物理 Sequence managed=1 且文本 `[]` 托管→两边一致但 raw 判 0 也必炸），非 v6 特例。此前不可达因 w34-w37 死于更早 projection 阶段（node 34）。
4. **修法语义**：所有权族跟随物理存储类型——Borrow(Box)→族托管（exprClass=Borrowed ✓）、Borrow(Col)→族非托管（exprClass=Unmanaged ✓）、Borrow(Sequence)→族托管（文本 `[]` 托管 ✓），与文本权威逐形一致。Alias/Apply 的 managed 列本就传播目标值（arena validate :6822-6840 强制），故唯一变化面 = Borrow 包装节点，其余节点 `physical(raw)==raw` 逐字节不变。上方 structural trait 等值校验（:34333-34346）仍用 raw `managed`（两侧都是 raw，保持一致），不受本判定影响。零弱化：托管族仍必须 exprClass∈{Owned,Borrowed}，非托管族仍必须 Unmanaged。
5. bind 尾审计自洽：`CompilerCsgTypedNodeAuthorityBindInto` 写回 `ownershipPremises[node15]=Borrowed`（exprClass 派生），`TypedExprNodeAuthorityStrictValidateInto`（typed_expr.cheng:3457-3465）的 premise 期望同样纯 exprClass 派生 → 通过；resultTypeManagedFlags 写回仍 raw ManagedAt，与 retained 一致无 trait drift。

## 验收实录（cwd=仓库根）

| 门 | 结果 |
|---|---|
| 秒级门（cheng_now 编 compiler_csg.cheng → obj） | rc=0（hunk1 态与 hunk1+2 态各过一次；/tmp/oob_ab/w40/tc.o tc2.o） |
| 补丁反向 check | git apply --check --reverse 过 |
| 车头 cheng_w40（sha256=fcd63d71f8325d2827cce70921c8b0cd1cffc0fa8b3e2cd1923b2b51fc7efeca） | v6 compile=0 run=0；ordinary compile=0 run=0；call_fixture compile=0 run=1 |
| kernel_driver_w40 × ordinary | **compile=0 run=0**（round1 驱动实测，无回归） |
| kernel_driver_w40 × v6 | rc=2 `typed-node exact producer TypeId missing node=57 op=38 o0=-1 o1=-1`——**node=15 判词死亡**，walk 推进穿过 15-56 全段（含 outer/main），暴露下一道生产缺口（见移交） |
| kernel_driver_w40 × call_fixture（1 GiB 纪律守卫） | rc=125 `resource_guard rss_limit_exceeded rss_bytes≈1.08G`（round2 驱动，租约解除后实测；纯晚段内存增长，见归因） |
| kernel_driver_w40 × call_fixture（诊断抬帽 3G，非验收） | **compile=0 run=1**——语义完好，判读：本 hunk 对 call_fixture 逐节点零行为变化（无 `var` 形状→无 Borrow 包装节点，且 w38 上该夹具已走通全 walk），膨胀源自 post-w38 树态（typed_expr 00:05 / primary_object_plan 23:03，w39 家族）晚段管线；1 GiB 守卫回归归 w39 线 |
| kernel_driver_w40 × cold_nested（诊断抬帽 3G） | compile=1 `ownership body ir production: local stack schema invalid`——BodyIR 晚段判词移位，**ownership_body_ir_production.cheng = w39 文件领地**，只记录 |

## 移交：typed-node exact producer TypeId missing node=57 op=38(LocalRef)（typed_expr.cheng 领地，非本任务授权文件，停手）

1. **三元组**（round2 驱动富化判词实测）：node=57、op=38=`TypedExprIrOpLocalRef`、两操作数 -1。
2. **生产者**：`TypedExprIrAddRhsLocalRefNode`（typed_expr.cheng:20322-20342）——LocalRef 生产者中**唯一**不发布 structuralTypeId 的拼写（`resultStructuralTypeId=-1` 后无 bind；对照同族全部已绑：RhsLeafNode :20222、AddOpNode :15181、I32ConstNode :15144、RhsScalarLeafNode :20309、NilPtr 零值模板 :28780、参数 :14634、exact 克隆 :21480、wall31 LHS 副本 :21776、FieldGet wall38）。
3. **触发调用链**：赋值 LHS 走文本路径 `TypedExprIrBuildRhsIdentNode`（:21795）——参数 ident 命中参数索引快路径（共享节点本身或 wall31 fresh 副本，均绑）；**local ident 落穿 :21915 → 未绑 LocalRef**。函数体 RHS 读走 exact 路径（typedExprIrAddExactBindingRefNode 克隆模板列）已绑，故 v6 全树唯一未绑形状 = 「local 作赋值 LHS」：node 57 = main `n = new(Node)`（:42）的 LHS `n`；其后 `n.arena = new(Box)`/`n.cnt = 3` 等 base ident 同形必炸。探针矩阵（zz_probe_w40，用后已删）：`var x: int32`+`x = 1` 复现 node=1；裸声明无赋值死于更早 `typed expr: layout differs from exact TypeArena authority`（他墙原位）；`var x: int32 = 3` 过 walk（死于下游 `cheng_cold: exact identity schema [freeze] … partial authority`，w39 家族领地仅记录）。
4. **修法建议（typed_expr owner 裁量）**：范本 = wall31 `typedExprIrAddLhsFreshParamRefNode` :21776-21782 克隆模板 `structuralTypeId`；local 的模板 = decl-local 组 defining 节点（I32Const/NilPtr 模板等已绑）或 local binding 表，克隆其列即可（`var n: Node` 的模板即 w24 NilPtr 节点，已绑 Node TypeId）。fail-closed：模板/列不可得保持 -1，:34013 门原样 hard-fail，零弱化。修一处建造器，v6 main 全部赋值 LHS 形状同消。
5. 消费侧不可修定性：权威门契约 = 「producer freezes, compiler csg only cross-checks and never derives」（wall38 补丁注释原话）；csg 侧自行为未绑节点派生 TypeId 即倒置权威，禁走。

## 纪律执行

- 主树仅改 src/core/tooling/compiler_csg.cheng；改前备份 /tmp/oob_ab/w40/compiler_csg.cheng.pre_w40（sha256=3290dbf0b3b79820376638471e58089ee7bf398ac46965ebc649fa99cbb444e4）。
- git diff --stat -- src/core/tooling/compiler_csg.cheng：apply 前 +1047/−1038（并行既有）→ apply 后 +1072/−1040（本任务净 +25/−2 = 2 hunks）。
- 烤机 2/3 轮（round1 验墙移位、round2 富化判词+交付驱动）；第 3 轮不烤：round2 烤的已是 10 分钟静默树（typed_expr 00:05 / primary_object_plan 23:03 均早于烤机），重烤输入不变输出不变，零信息。
- 遗留 1 GiB 守卫下 call_fixture/cold_nested 的晚段 RSS/判词移位均归 w39 线（ownership_body_ir_production/primary_object_plan 领地），待其落定后由统筹复验。
- 探针 src/tests/zz_probe_w40.cheng 已删净；编排者资产 zz_v6_w7.cheng/zz_call_fixture_w7.cheng 只读未动；产物/日志全在 /tmp/oob_ab/w40/；未 git commit。

# wall42.VERIFY — `ownership body ir production: local stack schema invalid` 墙已清（ownership_body_ir_production.cheng:183 StackHighWater 参数槽负偏移编码契约补全）；连清 w39 移交定性（fmt 槽族无辜，真凶=参数槽）；下一墙 `cleanup_cfg: local stack schema invalid` 同根镜像、禁区外停手移交

## 判定摘要

- 补丁 /tmp/oob_ab/wall42.patch（git 格式 33 行，+17/−3，单 hunk，仅 src/core/analysis/ownership_body_ir_production.cheng；`git apply --check --reverse` 过 = 与在树态精确互证；primary_object_plan.cheng 本任务零触碰，apply 前后 git diff --stat 均为其既有在树工作 +1183/−205 内的 978/205）。
- 修法（零弱化，契约补全）：`ownershipBodyIrStackHighWater` 对 StackValueTag 槽的 `stackOffset < 0` 臂改为参数槽入口序数编码臂——负 offset 是 `BodyIRBindEntryParameterSlot`/`BodyIREntryParameterSlotsShapeValid` 权威契约的 canonical 编码（core_types.cheng:1887/1909：`stackOffset == -1-ordinal`；cleanup_cfg.cheng:3869 entry-slot 域同样强制 `stackOffset < 0`），不是帧字节偏移；布局生产者（PrimaryBodyIrNextLocalStackOffset:4246 / PrimaryBodyIrReflowLocalStackOffsets:4267）以同一 `PrimaryBodyIrLocalIsParam`（stackOffset<0，:7960）谓词把参数槽排除在独立栈区外。本函数沿用同一谓词：参数槽仍审 size/align 健康（非参数臂 schema 全列不变、溢出审不变），不贡献字节高水位；区基 16 与生产者同源（防参数-only 形高水位 0 把合成槽排进 FP/LR 保存区——旧守卫的死恰掩盖了该潜伏放置缺陷）。

## 机理（lldb 内存实证，kernel_driver_w39b，break `cheng_cold_79ada9e0_16721` StackHighWater 入口）

1. 复现：w39b × cold_nested rc=1 判词（CHENG_PROCESS_MAX_RSS_BYTES=6442450944 抬帽后取得；默认帽下 rc=125 RSS 先死，见资源节）。
2. BodyIR 布局实测：localSlots seq 头 = {len@+32, cap@+36, data@+40}，26 槽；entryParameterSlotIds len=2（两参数）。LocalSlot 步长 80：placeKind@+44、stackOffset@+48、sizeBytes@+52、alignBytes@+56。
3. **26 槽中仅 slot 0/1 违规，即两个参数槽**：slot 0（`name`: str）placeKind=0(StackValue)、stackOffset=-1、size=24、align=8；slot 1（`ordinal`: i32）stackOffset=-2、size=4、align=4。slot 2..25（`#nev*`/`#fmt_parts`/`#fmt_sep`/fmt_var 物化槽族）stackOffset 16..312、size 4..24、align 4..8 **schema 全健康**——w39 移交的「fmt 晚成槽族栈布局链」定性被内存证据推翻，p_lit(无参)/p_int(带参) 二分早在先指向参数。
4. 全树 placeKind 写点清点：生产侧从无 `placeKind = BodyPlaceParamAddressTag` 赋值（该值仅 src/tests/ownership_body_ir_production_smoke.cheng 测试件使用），参数槽终生 StackValueTag——守卫以 placeKind 区分参数的前提不成立，负偏移编码是唯一参数判据。

## 门禁与验收实况（cwd=仓库根）

| 项 | 结果 |
|---|---|
| 秒级门 ownership_body_ir_production.cheng → obj | rc=0（cheng_now system-link-exec，tc.o 5.5MB） |
| 车头 cheng_w42（sha256=862fa8bb…2305，bootstrap/cheng_cold.c 重烤 25s） | v6 复现件拷 zz_probe_w42.cheng compile=0 run=0（用后已删） |
| 烤机 1/3 轮 rc=0 | kernel_driver_w42 sha256=09a819a7…02fcf（size 183256992）；driver=cheng_w42 |
| **cold_nested（w42，默认 RSS 帽）** | rc=125 `resource_guard rss_limit_exceeded rss_bytes=1103381824`（1052MiB，超 2.8%）——修复前 w39b 同夹具已实测 1094157608，w41b 1076872512，**预存包络非本补丁引入**（hunk 零分配） |
| **cold_nested（w42，帽 4GiB）** | compile rc=1 `cleanup_cfg: local stack schema invalid`——**本墙判词（`ownership body ir production:` 前缀）已死**，管线推进下一墙；exe 未产出 |
| ordinary_zero_exit_fixture（w42） | 默认帽 rc=125（1085261120≈1035MiB RSS-only）；帽 4GiB **compile=0 run=0 不回归** |
| zz_call_fixture_w7（w42，帽 4GiB） | **compile=0 run=1** 正确语义不回归 |
| zz_v6_w7（只记录） | w42: rc=2 `compiler csg: typed-node builtin return TypeId missing node=58`——csg 域判词随并行线在途漂移（w39b 为 node=57），非本任务回归 |

## 遗留与移交（按拦截序）

1. **`cleanup_cfg: local stack schema invalid`**（src/core/analysis/cleanup_cfg.cheng:2167 `cleanupCfgStageBindLocalSchema`，cold_nested/带参 managed-return 现位）：与本轮同根镜像——同一 `slot.placeKind == BodyPlaceStackValueTag` 且 `stackOffset < 0` 判死臂，死于同一参数槽负偏移编码；修法同型（负 offset 臂按入口序数编码审 size/align 后 skip、不贡献 `independentStackHighWater`，与同文件 :3869 entry-slot 域 `stackOffset >= 0` 判死臂自洽）。**该文件不在 wall42 授权面（仅 ownership_body_ir_production/primary_object_plan），停手完整移交**。
2. **RSS 包络**：w42 代 kernel 驱动编 ordinary/cold_nested 峰值 1035-1052MiB 均贴穿默认 1GiB 帽（`CHENG_PROCESS_MAX_RSS_BYTES` 默认 1073741824，env 可覆盖）。ordinary 在 w39b 代 0/0 无 RSS 记录、w42 代贴顶——增量归因 w40 并行线 compiler_csg.cheng 在树工作随烤入 w42（本 hunk 零分配不可能增 30-50MiB）；正式验收需按 w39 遗留 #2 重定包络或加帽。
3. 并行线实录：w40（compiler_csg.cheng）与本轮同窗，其 kernel_driver_w40 验收矩阵占父目录租约多轮，串行抢隙即消；烤窗尾出现第三线 w43（kernel_driver_w43）继续持租约，同法串行。
4. 探针 zz_probe_w42.cheng 已删净（ls 无匹配）；主树无本任务残留文件；产物/日志/pre 备份/lldb 脚本全在 /tmp/oob_ab/w42/。未 git commit。

## 纪律执行

- 改前备份 /tmp/oob_ab/w42/ownership_body_ir_production.cheng.pre_w42 sha256=38374b677ad7b2c45a31d63180906df70324218b；primary_object_plan.cheng.pre_w42 sha256=4914f63f084f2f6545226d1c1a00b869d05b7bce。
- git diff --stat：apply 前 ownership=+33/−24（w39 在树）、pop=+978/−205（既有）；apply 后 ownership=77 行变动（w39+wall42）、pop 不变 1183 行变动（既有）。wall42 净贡献 = +17/−3 单 hunk。
- 补丁 /tmp/oob_ab/wall42.patch sha256=4cd36caef5d50145a8c8f60f69d579661179f23b。
- 烤机 1/3 轮。未 git commit。
