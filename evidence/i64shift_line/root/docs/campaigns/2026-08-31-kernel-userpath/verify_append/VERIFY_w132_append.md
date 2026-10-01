# wall132.VERIFY

## 判定：cold_nested 的 `typed_ir_contract missing_call_target code=6 detail=140` 墙 = kernel 链 typed 契约门（typed_expr.cheng `TypedExprBootstrapContractValidateFunction`）与 wall113 已固化的「builtin echo 语句 callTarget='' 合法现状」冲突。echo/Echo 是 parser builtin（side-effect statement 类），typed 结构解析早退、无声明身份可绑，语句列 callTarget=""；kernel 链 typed_ir_contract 门无差别要求所有 call 类语句 target 非空 → 140 fail-closed。修法=门内加与 primary wall113 发射臂逐字段对齐的 echo/Echo 豁免（最小 diff，其余空 target 仍 140 零弱化）。夹具 main:7 恰为 if-then 块内 `echo("cold_nested_fmt_interpolation=pass")`——与 wall113 当年首爆注释逐字同源。

日期 2026-09-04。本线=纯只读诊断，零树编辑、零烤机、零 git 操作。

## 一、只读门禁实况表

| 门 | 结果 |
|---|---|
| cold_nested × w131_r4（wall131 烤后门禁实录 /tmp/oob_ab/w131/r4_cold_nested.log） | compile rc=2，判词：`system link exec: cannot execute a plan that is not ready reason=typed_ir_contract function=main line=7 reason=missing_call_target code=6 detail=140 primary_missing=0 lowering_missing=0 lowering_fns=2 reachable=2 items=3 words=195 body_kind=- fn=- abort=- primary0=- lowering0=-`。**data_reloc 墙已死**：三函数 ledger 全绿（main actions=155 words=104 relocs=26、nestedFmt actions=68 words=66 relocs=13、bridge actions=26 words=25 relocs=4），items=3 words=195 全就位 |
| cold_nested × w129_r3（wall129 终态实录，上一墙对照） | `body_kind=data_reloc_no_fill_record fn=_cheng_program_source_entry … primary_missing=3`——primary_missing=3 → r4 后=0，墙推进坐标吻合 |
| 车头 cheng_w126 × cold_nested（wall129 实录 + /tmp/oob_ab/w129/hd_cold_nested.log） | compile=0 / run=0，输出 `cold_nested_fmt_interpolation=pass`；exe 符号表无 echo 定义/未定义符号（nm 实证），echo 物化=main 内联 write syscall（otool：`mov x16,#0x4; svc #0x80`，字面量 0x22=34 字节 + 换行）——**C 权威链 echo=编译器内建，无声明解析** |
| 本线自有复现尝试 × w131_r4 / w129_r3 | 6 次全部 `os atomic tree: parent lease unavailable`（wall131 线连续烤机，最长退避 300s），串行退避后仍占——实况以 wall131 r4 同二进制同夹具门禁实录为准（判词与本线静态定性一致），如实报备 |
| typed_expr.cheng 在树 diff 清点 | 40+ hunks / +164-16，grep 全 diff 零 callTarget/callCallee/LetCall 相关改动——**在树 hunks 全为所有权/作用域线领地，140 门与 callTarget 生产链=HEAD 基线原样**（HEAD:9256 `TypedExprBootstrapContractValidateFunction`、HEAD:9406-9410 即 140 门） |

## 二、定性闭环（abort 门 → 缺失形状 → 对照证据）

### 1. abort 门
`system_link_exec.cheng:5983-6000`：plan ready 前对 `loweringPlan.primaryObjectIr.functions` 逐函数调 `TypedExprBootstrapContractValidateFunction`（typed_expr.cheng 当前树 9367 起；HEAD 9256）。门内 statement 循环（当前树 9498-9535）：
- `statements2_kinds ∈ {LetCall, Call, IfCall}` → statementCarriesCall；
- `LookupIntern(statements2_callTargetIds[stmtIndex])` 成功但**值为空串** → 当前树 9515-9521 `TypedExprBootstrapContractFail(..., 140, "missing_call_target")`。

r4 判词 `primary_missing=0 lowering_missing=0 items=3 words=195`：lowering/primary 两层全就绪，**唯一拦门=typed_ir_contract**；`function=main line=7` = main 内 if-then 块的 echo 语句行。

### 2. 缺失 fill 的精确形状（谁写的空串）
- 生产者：`typed_expr.cheng:7055-7057` `stmt.callTarget`（空）→ intern → `statements2_callTargetIds`。
- echo 的路由：`TypedExprBuiltinCalleeIsSideEffectStatement`（9628-9643，echo/Echo=true）让它**不被** 56473-56477 的 builtin 纯表达式 continue 拦截 → 成 `TypedExprIrStmtCall`/`IfCall` 语句；`TypedExprBuiltinCalleeReturnType`（9697-9698）echo(1 参)→"void"。但 echo 是 parser builtin（`ParserCallNameIsBuiltinCallee`），typed 结构解析器早退、无声明身份 → resolve 兜底（55159-55185 / 56563-56586）落空 → `stmt.callTarget=""` 落列。
- **这是已固化的合法现状**，不是新 bug：primary_object_plan.cheng:54874-54891（wall113 注释原文）：「裸 builtin echo 语句臂。echo/Echo 是 parser builtin，typed_expr 结构解析器对其早退，**语句/节点两列 callTarget 均为 ""（无声明身份可绑）**。此前这类语句坠入 …poison bail=63（**cold_nested 夹具 if-then 块内 `echo("...")` 首爆 op6**）」——wall113 在完整链已为同一夹具同一语句修通 primary 侧（`PrimaryBodyIrAppendUnsupportedEchoFmtCall` echo→puts 自足发射器，单字符串字面量/纯文本 Fmt 实参发单 puts call）。**kernel 链 typed 契约门是唯一没对齐该现状的消费者**。v6/ordinary/call 门禁夹具均无 echo 语句，故此墙直到 cold_nested 才首爆。

### 3. 对照证据
- **C 权威链**：/tmp/oob_ab/cheng_cold_head.c 全文无 echo 符号处理；车头 exe（hd_cold_nested.exe）nm 无 echo 定义/未定义符号、otool 实证 echo 物化=main 内联 `mov x16,#0x4; svc #0x80`（write syscall）。C 权威语义：echo=内建输出，不要求任何声明。
- **cheng 完整链**：wall113 臂已消费空 target echo 语句（发射 puts call；cold_nested 实参为纯字面量，在臂支持面内）。
- **kernel 链**：typed 契约门 140 拦截——三链中唯一的语义漂移点。

## 三、修法 spec（供编辑线直接执行）

**文件**：`src/core/lang/typed_expr.cheng`（单文件单 hunk）
**函数**：`TypedExprBootstrapContractValidateFunction`（当前树 9367 起；门=9505-9535）
**改法**：9515 `if callTarget == "":` 分支内、`return ...140...` 之前插入 echo/Echo 豁免；豁免不 return，落穿既有 141/142 检查（空串 `TextStable`=true（9299-9303 空循环），echo 行 resultType="void" `TypeOk`=true（9306-9314 空归一化为 void）——**141/142 两行无需改动**）。

diff 草案（行号以当前树为准，编辑前先读现场）：

```cheng
            let callTarget = Value(callTargetRes)
            if callTarget == "":
                # [wall132] builtin echo 语句臂豁免 (wall113 合法现状镜像):
                # echo/Echo 是 parser builtin, typed 结构解析早退, 语句列
                # callTarget="" 是既有列契约; primary :54883 自足发射臂以
                # 同一谓词消费 (len(callTarget)==0 && callee∈{echo,Echo})。
                # 仅放行 callee∈{echo,Echo} 的空 target 行, 其余空 target
                # 仍 140 fail-closed 零弱化。
                var callCalleeRes: Result[str] = langintern.LookupIntern(ir.internPool, ir.statements2_callCalleeIds[stmtIndex])
                var echoBuiltinArm = false
                if IsOk(callCalleeRes):
                    let callCalleeText = Value(callCalleeRes)
                    if callCalleeText == "echo" || callCalleeText == "Echo":
                        echoBuiltinArm = true
                if !echoBuiltinArm:
                    return TypedExprBootstrapContractFail(functionName,
                                                         arenamod.ArenaArrayInt32Get(ir.arena, ir.statements2_lineNumbers, stmtIndex),
                                                         140,
                                                         detailOut,
                                                         reasonOut,
                                                         "missing_call_target")
            if !TypedExprBootstrapContractTextStable(callTarget):
                return ...141 原样...
```

**列契约**：消费 `statements2_callCalleeIds`（写入点 7052-7054，恒有值）与 `statements2_callTargetIds`（7055-7057），两列同序并行、statementIndex 对齐；豁免谓词与 primary:54883-54884 消费谓词逐字段同真同假（`len(target)==0 && callee∈{echo,Echo}`），不引入任何近似键。
**镜像先例**：① primary_object_plan.cheng:54874-54891（wall113，同夹具同语句的完整链修法）；② C 权威链 echo 内建语义（write syscall 内联，无声明解析）。
**显式不做**：① 9628 表内其他 side-effect builtin（assert/add/setLen/Bytes*/Rawmem*/memRetain/memRelease）暂不豁免——primary 侧只有 echo 有发射臂，其余豁免会造成门放行而后端 poison 的假绿前移；等有夹具实爆再逐个对齐（fail-closed 逐墙推进）。② `TypedExprBootstrapContractValidateWholeCall`（9527 起）不动。③ 不放宽 199/141/142 任何检查。

## 四、验收门禁清单（编辑线烤机轮执行）

| 门 | 期待 |
|---|---|
| cold_nested × 新驱动 | 判词消失：若 echo 实参纯字面量（本夹具满足）→ compile 过 + run 输出 `cold_nested_fmt_interpolation=pass`；若落穿 primary 臂（非字面量/插值/多参）→ 原 poison bail 判词（wall113 fail-closed 面），属可推进下一墙非本墙回归 |
| ordinary_zero_exit × 新驱动 | compile 0 / run 0 不回归（无 call 空语句，豁免分支不触发） |
| call_fixture × 新驱动 | compile 0 / run 1 契约预期不回归 |
| zz_v6_w7 × 新驱动 | 判词与 r4 逐字相同（其 ownership 墙与 typed 门无交集；wall131 领地只记录） |
| 秒级门（typed_expr.cheng × 车头 --emit:obj） | rc=0 后再进烤机 |

## 五、移交事项

1. 本 spec 假设 wall131 r4 树态为基线（data_reloc 插入排序已在树）。若 wall131 后续 hunks 移动了 typed_expr.cheng 行号，以「`missing_call_target` 字符串定位门」为准，勿信行号。
2. 修后若 cold_nested 推进到 primary poison bail（echo 臂落穿），定性入口=primary_object_plan.cheng:54885 `PrimaryBodyIrAppendUnsupportedEchoFmtCall` 返回 false 的分支（实参形态超出发射臂）。
3. 其他 side-effect builtin（assert 等）在冷链夹具首爆时，修法镜像本 spec（豁免谓词=callee 精确匹配 + primary 侧先确认有对应发射臂）。
4. 本线探针夹具 /tmp/oob_ab/w132/p1-p4.cheng 未使用可删（仓库外 entry 夹具被 `system_link_plan.cheng:4732` entry module identity 检查拒绝，`--in` 仅支持包内路径——wall129 VERIFY 中「驱动可编译仓库外路径夹具」说法与 r4 实现不符，如实更正）。
