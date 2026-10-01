# wall133.VERIFY

## 判定：烤机预算 3/4 用尽，双墙各自「修法生效、判词再推进」，新死点均落在授权面外，停手完整移交。

- **墙 A（cold_nested）——wall132 spec 核验采纳并执行，typed 契约门 140 墙死**：修法=typed_expr.cheng `TypedExprBootstrapContractValidateFunction` 空 target 分支加 callee∈{echo,Echo} 豁免（与 primary_object_plan:54883 wall113 消费谓词 `len(target)==0 && callee∈{echo,Echo}` 逐字段对齐，其余空 target 仍 140 fail-closed，141/142 原样落穿）。r2 实证：判词从 `typed_ir_contract missing_call_target code=6 detail=140`（rc=2）推进为 provider 编译墙 `system link exec runtime: provider compile failed rc=2 source=src/core/runtime/core_runtime_provider_darwin.cheng` → `cheng_cold: export root cheng_str_drop_owned not found`——driver 内 typed 门、primary 全链（main 155/nestedFmt 68/bridge 26 三 ledger）、plan ready 全部通过，墙前移至 system-link 阶段。
- **墙 B（v6）——cleanup type layout 注册臂 ref 句柄补齐，row invalid 墙死**：定性=ownership_body_ir_production 准入白名单（在树新增，LocalStr/LocalPtr/LocalAggregate 三 kind + `add(localTypeKinds, slot.typeKind)` 落列）把 ref 句柄槽（LocalPtrTag）首次送进 cleanup 类型注册循环，而 cleanup_cfg `cleanupCfgStageTypeLayoutIndexRegisterType` 的 kind 校验（基线）只收 Str/Aggregate——kind 集消费侧漏同步。修法=注册臂 kind 行补 `typeKind != coreir.LocalPtrTag` 第三臂（与 wall121 同文件 Verify 臂先例逐列同构；准入侧三 kind 白名单+wall118 glue 是设计权威，故修面必在 cleanup_cfg 注册侧，非 wall131 领地文件）。r2 实证：`cleanup_cfg: type layout row invalid` 墙死，判词推进为 `cleanup_cfg: cleanup source control cid invalid st=103 off=9 … fn=3`。r3 富化实锤：`slot=[id=9 typeId=7 kind=1 storage=1 size=4 align=4] factIds=[16,17]`——slot9=int32（kind=1=LocalI32Tag）unmanaged（storage=1=Unmanaged）带 proof typeId=7，在册 fact 仅 [16,17]（Node/Box 托管闭包）→ 匹配 0。
- **4746 墙确认已死**：r1/r2/r3 三轮 v6 判词均无 4746 形态；wall131 argFormalOwnerships 修法的 fill/mirror 链语义验证仍被岔墙序列拦在更早处，待新墙清后验证。

日期 2026-09-04。车头=/tmp/oob_ab/cheng_w126（sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89，与 wall128-131 记录逐字节同）。烤机配方=head 三件套 + CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w133/cold_cache + CHENG_ENTRY_CACHE=0，cwd=仓库根。

## 烤机台账（3/4，全部 sha256+size）

| 轮 | 产物 | sha256 | size | 内容 | 结果 |
|---|---|---|---|---|---|
| r1 | kernel_driver_w133_r1 | 94e8d3a05f313643abba77cd8bfa805e05f3ce6018f02462cc6d07e1524585ec | 186252944 | 进场复现（零树改动） | 双墙判词与 wall131 r4 逐字同；4746 死确认 |
| r2 | kernel_driver_w133_r2 | 3c0012ccd7634a84cce800a84626cf5cb198cc4c72a4bdcff6b3590416f200a8 | 186252944 | 墙A echo 豁免 + 墙B Ptr 臂+row invalid 判词富化 | 双墙修法生效、判词双推进 |
| r3 | kernel_driver_w133_r3 | 91e53734cda65970bab34feb63157712f9eaff4fe86e482442a2d1ca6d789521 | 186269360 | + source control cid 判词 st=103 slot/fact 明细富化 | 富化实锤 v6 新死点精确形状；判词前缀与 r2 逐字同 |

秒级门：cleanup_cfg.cheng × 车头 --emit:obj rc=0（r2/r3 两版均过，产物 /tmp/oob_ab/w133/w133_cleanup_cfg*.o）。typed_expr.cheng 秒级门**基线即死**（与本线 hunk 无关，对照实验实证：还原 hunk 后车头同判词 rc=2 `cheng_cold: managed element field read lacks exact array root (recovery=0 depth=1)`，与 codegen_a64_fill_units :471 同类既有硬雷面；wall132 验收清单该 item 对本树态不可达）——typed_expr 修法编译正确性由 r2/r3 烤机全闭包证明。

## 门禁实况（cwd=仓库根）

| 门 | r1 | r2 | r3 | 车头 cheng_w126（语义参照） |
|---|---|---|---|---|
| cold_nested | rc=2 `missing_call_target code=6 detail=140` | rc=2 provider 墙（见判定） | 同 r2 逐字 | 0/0 `cold_nested_fmt_interpolation=pass` |
| zz_v6_w7 | rc=1 `cleanup_cfg: type layout row invalid` | rc=1 `cleanup source control cid invalid st=103 off=9 slots=41 facts=2 fn=3` | 同 r2 + `slot=[id=9 typeId=7 kind=1 storage=1 size=4 align=4] factIds=[16,17]` | 0/0 |
| ordinary_zero_exit | 0/0 | 0/0 | 0/0 | 0/0 |
| call_fixture | 0/1（契约预期） | 0/1 | 0/1 | 0/1 |

log 档案：/tmp/oob_ab/w133/{r1,r2,r3}_*.log、lead_*.log、gates_rN.sh、lead_gates.sh。

## 移交事项（下一线）

1. **墙 A 新死点（provider roots 分派，src/core/backend/system_link_exec_runtime.cheng——授权面外）**：driver 对 cheng_str_drop_owned 的 reloc 触发 `SystemLinkExecRuntimeAddCoreRuntimeRoots`（:1788 条件臂）把它列进 **core_runtime provider**（core_runtime_provider_darwin.cheng）export roots，但该源无此导出（:1789-1791 注释自证「live in program_support_backend.cheng … darwin core provider source does not export them」）；而 program_support 通道 `AppendProgramSupportRelocRoots`（:2267）有「主对象自身定义即跳过」谓词（definitionIndex 命中 continue），core_runtime 通道缺同一谓词——两通道对同一 reloc 符号分派不一致。修法候选：core_runtime 条件臂补「主对象未定义该符号」精确谓词，或 str glue reloc 全权归 program_support 通道。归属线定性（注意 str drop reloc 来源=main 的 `let actual: str` 作用域尾 drop，属合法语义需求）。
2. **墙 B 新死点（typeFact 闭合审计 vs 生产 bind 缺口，src/core/ir/core_types.cheng `bodyIRCleanupReferencedTypeFacts`——授权面外）**：审计对**一切 typeId>=0 的 slot**（wall62 域谓词明文承认「typeId>=0 ∧ storage==Unmanaged」是在册合法形态）要求 typeFact 匹配数==1，但生产侧 bind（managed_lvalue_replace `managedLvalueReplaceProductionBindTypeClosureInner` 等）只对托管 store 闭包 bind fact → 带 proof 的 unmanaged 标量槽（v6 main slot9=int32 typeId=7）恒无 fact → st=103 必死。该审计是基线原样、v6 链首次到达（此前死于 4746/row invalid）。修法候选二选一由归属线定：a) 审计臂精确放行 `storage==Unmanaged ∧ typeKind∈{I32,F64,I64}` 槽（镜像 wall62 Unknown 放行先例）；b) 生产侧为带 proof unmanaged 标量 bind fact 行（blast 更大）。ordinary/call 夹具不触此墙（其 slots 无「带 proof 的 unmanaged」形态或 fact 凑齐），v6 首爆因它是首个走到该审计的 ref+标量混合夹具。
3. **wall131 移交债**：argFormalOwnerships fill/mirror 的语义级验证（owns=4,2 + mirror 判词）在 r2/r3 树态仍未达（岔墙序列未清）；v6 清墙后一轮烤机即可验证。
4. **判词富化资产保留**：`cleanup_cfg: type layout row invalid` 失败臂九字段明细与 `cleanup source control cid invalid` 的 `slot=[…] factIds=[…]` 尾列（均 fail-closed 仅死点路径取数，[wall133] 标记）为终态保留。
5. **仓库根运行残档**：门禁驱动会在仓库根落 `system_link_exec_provider.1.o.compile.log`（provider 编译失败时的现场 log，r2/r3 门禁产生，未跟踪文件）；归属线复现 provider 墙时可直接复用，任务终了可清。

## 与 wall132 spec 的差异点

1. 豁免 hunk 标记用 [wall133]（本线 hunks 纪律），注释注明「wall132 spec」与 wall113 镜像来源；谓词/列契约/显式不做面与 spec 逐字一致。
2. spec 验收清单「秒级门 typed_expr rc=0 后再进烤机」对本树态不可达（基线硬雷，对照实验实证与本 hunk 无关），以烤机全闭包代替。
3. spec 第 4 项验收预期「zz_v6_w7 判词与 r4 逐字相同」因本线墙 B 修法而自然失效（row invalid 已死、判词推进）——属本线任务书授权范围。

## diff 统计与交付

- **/tmp/oob_ab/wall133.patch**：当前树态 `git diff HEAD` 全树生成，12795 行，59 files +7715/−1157（含他线在途 hunks 原样照录）；`git apply --check --reverse` **PASS**（sha256=98635ba3baebd9e0e8b747df528e74e2fab09ab3bfce082c1e3d5017436ab5fc）。
- **本线增量=2 文件 3 hunks，全带 [wall133] 标记**：typed_expr.cheng 1 hunk（echo 豁免臂，+21 净行）；cleanup_cfg.cheng 2 hunks（注册臂 Ptr 第三臂+row invalid 判词富化；source control cid 判词 slot/fact 明细富化）。同文件他人 hunks 原样保留（typed_expr +164/−16 早线资产逐字未动）。
- 未 git commit、零分支/worktree；src/tests 零探针残留（本线未入仓探针，已核）；临时产物全部收在 /tmp/oob_ab/w133/。
