# wall131.VERIFY

## 判定：烤机预算 4/4 用尽，双墙各自「判词推进、未清墙」，停手完整移交。

- **墙 2（cold_nested）——实质修复，判词大幅推进**：`data_reloc_no_fill_record`（primary 数据重定位填装缺失）根因定性为 fill record 字典序排序前提被发射流乱序破坏（RealFor 二分 miss），修法=call reloc 既有先例同构的本函数段插入排序（r2 实证墙死）。r2/r4 判词推进至新死点 `reason=typed_ir_contract function=main line=7 reason=missing_call_target code=6 detail=140`（primary 侧全绿：items=3 words=195 missing=0/0/0 abort=-）。新死点属 TypedExpr LetCall statement 构造链（typed_expr.cheng:9515-9521，main:7 `let actual = nestedFmt("asset", 7)` 的 statements2_callTargetIds 为空），已定性待下线修。
- **墙 1（v6）——修法机制验证到位，最终语义验证被树态漂移拦截**：方案甲全链落地（CallOp.argFormalOwnerships 列 + AppendCallOp 落列 + derive 批 2 镜像 + sentinel 字节不变契约）。r2 trace 实锤 wall130 spec 的盲点：文本权威 `PrimaryBodyIrResolvedTargetParamType` 丢 var 前缀（`owns=2,2`，fill→skip 链路通、镜像机制正常），据此第三版落列改用 callee TypedExpr `nodes2_paramMutableFlags` 结构列第一权威（两处既有权威互证：binding 校验「non-parameter mutable authority」+ primary 参数借主臂 :17947），文本仅 fallback。r3 烤机失败（新函数漏 @borrows 注解被借用门拒，修复后车头全闭包复验通过）；r4 驱动上 v6 编译路径被岔墙 `cleanup_cfg: type layout row invalid` 拦截于首函数构造早期（4 函数仅 3 条 ledger、零 call 发射、零落列 trace，自洽）。岔墙归因他线在途树态：typed_expr.cheng 04:53 被他线改动（45 hunks 零 [wall131] 标记），本线增量（只读 paramMutableFlags + @borrows 注解）不触 TypeArena/type layout 注册链；r2→r4 唯树态差异即本线第三版（列值）与他线 typed_expr，后者为唯一可致类型注册序漂移项。4746 墙在 r4 树态不可达，是否修复无法在漂移树上验证——v6 修法待树态冻结后一轮烤机即可验证（判词富化已就位）。

日期 2026-09-04。车头=/tmp/oob_ab/cheng_w126（sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89，与 wall128/129/130 记录逐字节同）。烤机配方=head 三件套 + CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w131/cold_cache + CHENG_ENTRY_CACHE=0，cwd=仓库根。

## 烤机台账（4/4，全部 sha256+size）

| 轮 | 产物 | sha256 | size | 内容 | 结果 |
|---|---|---|---|---|---|
| r1 | kernel_driver_w131_r1 | 92613f40c4e93234990b4b2de216550d79cca2cb29e690b622c1051b1c759b79 | 186220080 | v6 方案甲（文本权威版）+ cold_nested 判词富化 | v6 未推进；cold_nested 富化实锤 |
| r2 | kernel_driver_w131_r2 | 633adb2b25e3a7c58fb332db5cb70ee85c67c8febc660ca88894822a0b6b443c | 186236496 | + data reloc 排序修法 + v6 fill/mirror/skip trace | cold_nested 墙死判词推进；v6 trace 实锤 owns=2,2 |
| r3 | （无产物） | — | — | + 落列第三版结构化权威（paramMutableFlags） | 烤机失败：新函数漏 @borrows 被借用门拒 |
| r4 | kernel_driver_w131_r4 | d9ee68629a057b5e205e4369b9500f1ba7eb5ba311c8aa9a975c239ec1f37918 | 186252944 | + @borrows 修复 | v6 被岔墙拦（他线 typed_expr 树态）；cold_nested 维持推进态 |

r3 失败复现与修复验证：车头编 dispatch_min 全闭包复现 `borrowed actual cannot bind non-var non-@borrows formal caller=PrimaryBodyIrFillCallArgFormalOwnerships callee=PrimaryBodyIrTypedParamMutableAt formal_ordinal=1`；补 @borrows（与同文件 TypedParamTypeAt 先例逐列对齐）后同闭包复验 emit obj 181103677 字节、report 零 error（/tmp/oob_ab/w131/r3b_repro_head.o/.report.txt）。教训已记：同文件新函数注解必须与既有先例逐列对齐，primary_object_plan 单文件秒级门被 codegen_a64_fill_units.cheng :471 既有硬语法雷遮蔽（任务书已知雷），借用门类失败只能全闭包复现。

## r4 门禁实况（cwd=仓库根）

| 门 | r4（kernel_driver_w131_r4） | r2 | r1 | 车头 cheng_w126（语义参照） |
|---|---|---|---|---|
| zz_v6_w7 | compile rc=1，判词 `cleanup_cfg: type layout row invalid`（岔墙，见判定） | rc=1 判词 4746 逐字不变 | rc=1 判词 4746 逐字不变 | 0/0 |
| cold_nested | rc=2，`reason=typed_ir_contract function=main line=7 reason=missing_call_target code=6 detail=140 primary_missing=0 lowering_missing=0 items=3 words=195 body_kind=- abort=-`（data_reloc 墙死，primary 全绿） | 同 r4（r2 首达） | rc=2 同墙 `data_reloc_no_fill_record fn=_cheng_program_source_entry` + 富化判词 | 0/0 `cold_nested_fmt_interpolation=pass` |
| ordinary_zero_exit | 0/0 | 0/0 | 0/0 | 0/0 |
| call_fixture | 0/1（契约预期） | 0/1 | 0/1 | 0/1 |

log 档案：/tmp/oob_ab/w131/{lead,r1,r2,r4}_*.log、r4_gates_summary.txt、r2/r4 trace 采集存档于判定引文。

## 墙 2（cold_nested）定性闭环

1. **富化判词实锤**（r1，`phase=data_reloc_no_fill_record_detail`，fail-closed 仅死点路径）：`fn_base=104 op_index=8 sub_index=0 fill_records=8 fill_sorted=0 … tail=|r6:fb=104:oi=9:si=0|r7:fb=104:oi=8:si=0`——oi=9 先于 oi=8 append，`fill_sorted=0` 实证排序前提破坏。
2. **根因**：`PrimaryObjectPlanRecordRegallocProductionRelocs` 按 recipe reloc 流（wordIndex 发射序）遍历，`regallocA64BindFunctionRelocOwners`（regalloc_aarch64_adapter.cheng:3786-3817）的 opIndex 由 ownerOpByWord 反查——嵌套 fmt/桥形态下发射序≠op 存储序，`PrimaryBackpatchRecordDataRelocEmitFirst` 流序 append 的 (fnBase,opIndex,subIndex) 非字典序，`PrimaryBackpatchDataRelocRealFor`（:1480）二分前提（注释自称「within a function ops fire in opIndex-increasing order」）对 regalloc adapter 流不成立 → Resolve 查 (104,8,0) miss → `data_reloc_no_fill_record` → abort 回滚（items=1 words=0）。
3. **修法**（primary_object_plan.cheng，[wall131] 同构 call reloc 先例 :74023-74047）：Record 末尾对本函数新加 fill record 段 [dataRecordCountBefore, len) 按字典序插入排序，四列（fnBase/opIndex/subIndex/realPos）并行移动。记录内容与配对关系零变化，查找前提恢复为声明契约，消费谓词零放宽。r2 实证：`fill_sorted` 后 data_reloc 墙死、entry bridge（actions=26 words=25 relocs=4）亦过。
4. **新死点定性**（typed_expr.cheng:9515-9521，授权面外未触碰）：`TypedExprBootstrapContractValidateFunction` 对 main（line=7，`let actual = nestedFmt("asset", 7)`）的 LetCall statement 校验 `statements2_callTargetIds` intern 文本为空 → detail=140 missing_call_target。构造链需查 LetCall statement 的 callTarget 记录臂（typed_expr/compiler_snapshot_lowering_bridge 域）。

## 墙 1（v6）修法链与证据

1. **方案甲全链落地**（wall130 spec 逐项）：① core_types.cheng CallOp 加 `argFormalOwnerships: int32[]`（与 argSlots 平行，sentinel 契约注释）；② primary_object_plan.cheng 新函数 `PrimaryBodyIrFillCallArgFormalOwnerships`（importc→不落列；逐实参 var→OwnBorrowUnique / 值→OwnMove；权威缺失 panic fail-closed），AppendCallOp 在 `PrimaryBodyIrFillCallAbiSizes` 成功后落列（ABI fill 已证每实参形参类型权威非空）；③ exact_def_derive.cheng 批 2 臂：`formalOwns.len != 0 && len != argCount` panic；仅 `formalOwns[argOffset]==OwnBorrowUnique ∧ argDef>=0` 处以形参权威覆盖定义行 Move 镜像，其余行值与 len==0 保持既有行为逐字节不变。消费侧零改动：body_ir_access:1360 校验只禁「称 Move 而定义非 Move」（BorrowUnique 合法）、:1421 consumesDefinition=（==OwnMove）自然失活、freeze 通道②同判。backend2 零改动（其 BodyIR codec 不含新列 → len==0 sentinel 旧行为）。
2. **r2 trace 实锤文本权威丢 var**：`phase=call_arg_formal_ownership_fill function=main line=47 target=outer argc=2 owns=2,2`（应为 4,2）；`outer line=36 target=addCol owns=2,2,2`（应为 4,4,2）；`phase=exact_def_arg_formal_skip op=17 call=4 arg=0 formal=2 def=3`。fill→skip 链路通、镜像机制正常，死点=判定权威。AppendCallArgs :24989 targetNeedsAddress 同用此文本权威——wall130「文本道 var 臂必负编码」推论的前提（该道能识别 var）不成立，v6 正槽 StackValue 形态由此统一解释。
3. **第三版结构化权威**：新函数 `PrimaryBodyIrTypedParamMutableAt`（@borrows）遍历 callee TypedExpr functions2 节点域的 ParamRef 声明节点（paramSlots==argIndex），读 `nodes2_paramMutableFlags`（1=var/0=非 var/-1=无权威走文本 fallback）。列语义两处既有权威互证：TypedExpr 绑定校验「non-parameter mutable authority」（typed_expr.cheng:3203/3471，仅 ParamRef 可 true）+ primary 参数借主臂注释（:17947 消费先例，「Owned=不可变托管形参 / Borrowed=var 形参自根」）。
4. **验证状态**：@borrows 修复后全闭包编译通过（r3 复验）；语义级 v6 0/0 验证被 r4 树态岔墙拦截（见判定）。trace 已就位（FAIL_TRACE 门控），下线一轮烤机：`owns=4,2` + mirror 判词出现 = 修复链贯通；届时若 4746 仍现则 Kill 另有来源（ownership_body_ir_production states 域，需新定性）。

## 移交事项（下一线）

1. **墙 1（v6）**：修法在树（本线三文件 +328/−11，全带 [wall131] 标记）。待树态冻结（他线 typed_expr 岔墙 `cleanup_cfg: type layout row invalid` 消退）后一轮烤机验证。若 owns=4,2 且 4746 死→清墙；若 4746 仍现→Kill 来源在 ownership_body_ir_production states 域另行定性（禁在 decode/freeze/identity 消费侧放行）。若岔墙持续：typed_expr 04:53 版 45 hunks 的类型投影序与 cleanup_cfg type layout 注册连续性校验（cleanup_cfg.cheng:1368 `ownershipTypeId != typeLayoutCids.len + 1`）的交互需归属线定性。
2. **墙 2（cold_nested）新死点**：TypedExpr LetCall statement `statements2_callTargetIds` 空（main:7），域=typed_expr / compiler_snapshot_lowering_bridge 构造链。wall132 预诊线如仍诊断旧 data_reloc 墙：该墙已由本线修复，请改诊此新死点。
3. **判词富化资产保留**：`phase=data_reloc_no_fill_record_detail`（fail-closed 仅死点路径，含 fill_sorted 自证列）与 `phase=call_arg_formal_ownership_fill / exact_def_arg_formal_mirror / exact_def_arg_formal_skip`（FAIL_TRACE 门控，生产零输出）均为终态保留，fail-closed 显性化非兜底。
4. **烤机预算**：4/4 用尽（r1/r2/r4 productive，r3 失败于 @borrows——失败复现与修复验证零轮次消耗秒级完成）。

## diff 统计与交付

- **/tmp/oob_ab/wall131.patch**：当前树态 `git diff HEAD` 全树生成，12710 行，59 files +7669/−1148（含他线在途 hunks 原样照录）；`git apply --check --reverse` **PASS**。本线改动=3 文件 +328/−11：core_types.cheng（CallOp 加列 1 hunk）、exact_def_derive.cheng（批 2 镜像+trace 1 hunk）、primary_object_plan.cheng（落列函数+调用点+TypedParamMutableAt+data reloc 排序+富化判词 6 hunks），全带 [wall131] 标记（8 处），同文件他人 hunks 原样保留。
- 未 git commit、零分支/worktree；src/tests 零探针残留（本线未入仓探针）；临时产物全部收在 /tmp/oob_ab/w131/（r1/r2/r4 驱动、门禁 log、trace 采集、复现产物），车头/门禁脚本用后随任务目录清理。
