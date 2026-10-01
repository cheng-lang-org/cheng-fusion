# wall146.VERIFY

## 判定

**双墙全清 + 顺链新清一墙，v6 从 rc=2 推进到 compile=0，抵达 run 段新墙（SIGSEGV）后定性停手移交。** r1 烤机实证墙 A（read-edge freeze）清除；r2 烤机实证墙 C（identity BORROW_PROJECTION 链式缺臂）与墙 B（ref glue export root）清除——v6 判词链 rc=2→rc=1→**compile=0 exe 产出**（provider/link 段全过，`cheng_ref_drop_owned not found` 未再现）。run 段 `run=139 SIGSEGV` 经 lldb 栈+反汇编定性为 backend call-arg var-ref 借用视图实参物化错位（授权面外，非备用轮可安全闭环），按「撞契约边界停手」移交。四门零回归；烤机预算 2/4 用（r1/r2），r3/r4 原封移交。

## 一、双墙判定

### 墙 A（read-edge freeze，授权面内）——清

- **判词**：`cheng_cold: read-edge unresolved op=35 operand=1 slot=26 candidates=1 opkind=14 dst=27 a=26 b=27 c=0` + `read-edge freeze fail row=3 fn=3`（rc=2）。进场复现由 w142_r1 驱动零改动逐字完成（当前树无漂移）。
- **定性（dual-domain split 第四例）**：candidates=1=slot26 唯一定义行（o34 FieldLoad 投影借视 def），六子检查败于**子条件 2**（`opExactTypeIds[source] == localSlots[slot].typeArenaTypeId`）。derive [wall90] 注释明文裁定：字段投影借视形（FieldLoad ∧ OwnBorrowShared ∧ 借主域非 Invalid）def 行 exact_tid=沿投影链上溯的借主权威（v6 实况 tid=17 Node 借视），destination 槽 tid=字段自身 storage 权威（slot26 tid=16 Box 句柄），「相等在该形按构造不成立」——derive 相等核对臂已放行该形（hop 三元组放电），identity BORROW_PROJECTION 主门同列解释，**freeze read-edge 是漏网镜像域**。derive 相等核对臂反向保证：凡 tid≠slot_tid 抵达 freeze 的 def 行必为该形（其余形 derive 即 hard fail），容忍臂谓词与之三列严格对齐=零漏放。
- **修法（[wall146] exact_def_freeze.cheng 2 hunks）**：①`exactDefFreezeReadSourceEdgeValid` 子 2 内嵌字段投影借视形容忍臂（三列谓词镜像 derive fieldProjectionBorrow，tid 相等路径逐字保留）；②unresolved 失败臂富化 17 列（wall139/141 同法纯读投影：首候选行 kind/defSlot/双 tid/own/place/origin/prodFn/借主域/借主行+六子布尔）。
- **r1 实证**：read-edge 判词消失，前移 identity 墙（rc=1）。

### 墙 B（ref glue export root，授权面内）——清

- **判词**：`cheng_cold: export root cheng_ref_drop_owned not found`（wall142 P2 探针预告形）。
- **定性**：wall134 移交事项 2 的同构预判逐项吻合——`SystemLinkExecRuntimeAddCoreRuntimeRoots` 的 [wall118] 两行条件列举是错误提供者；定义唯一点=src/core/runtime/program_support_backend.cheng:6390/:6398 `@exportc`（行号与 wall134 移交精确吻合），darwin core provider 源零此导出。
- **修法（[wall146] system_link_exec_runtime.cheng 1 hunk）**：删除 `cheng_ref_drop_owned`/`cheng_ref_retain_owned` 两行列举，reloc 全权归 `AppendProgramSupportRelocRoots` 扫描臂（[wall134] 修法一镜像）。
- **r2 实证**：v6 compile=0 走完 provider 编译+链接，判词未再现。

### 墙 C（identity BORROW_PROJECTION 链式缺臂，授权面外最小触碰）——清

- **判词（r1 推进后新墙）**：`exact identity schema [freeze] fn=3 op row=34 managed borrow projection is broken slot=26 origin=4 … parent_slot=0 operand=25 …`（rc=1）。
- **定性**：o34（`slot26=FieldLoad(base=slot25)` 投影借视 def，借主 op4）是**链式投影第二跳**——base=前序 CopyLocal 借视投影（o33）结果槽 25，origin 直等臂要求 def_slot[o4]=0==operand=25 按构造不成立。identity :2143 注释自证 C 参照 `var_projection_base_matches_parent` 跳臂（C cheng_cold.c:61648 本体）被移植判「无 Cheng 载体→真空」，v6 实况证伪（Cheng 载体=CopyLocal/FieldLoad 借视投影链）——wall127 同款真空误判。与在树 [wall104r2] `exactDefIdentityEntrySlotChainedProjectionValid`（EntrySlot 借主域链式臂）构成对称缺臂。
- **修法必然性论证**：主门 baseMatchesParent 谓词在 exactDefIdentityBorrowProjectionDefinitionValid 内部，freeze 侧无法镜像（该门独立于 read-edge 审计）；修面必在 exact_def_identity.cheng，[wall146] 标记。当前树该域无并行线（wall144/145 在 tools/src/tests 域零交集）。
- **修法（[wall146] exact_def_identity.cheng 2 hunks）**：`exactDefIdentityBodyOpChainedProjectionValid` 链式臂——根互证（opOriginIds==借主行，主门 originIn4 项已按该行全查零重复）+链上溯（opReadADefOpRows 逐跳，每跳同借主根四列互证+BorrowProjection place+CopyLocal/FieldLoad 双载体形状核对，严格行号递减灭环，深度 64）+终态 base 槽==借主行 valueDefSlot；直等臂逐字保留（|| 短路），非本形 false 交回原判词（fail-closed）。
- **r2 实证**：v6 compile=0，判词消失。

## 二、run 段新墙（墙 D，定性完成停手移交）

- **判词**：r2 v6 `compile_rc=0 run_rc=139`（SIGSEGV/SIGBUS，fault 0x1900000000）。
- **崩溃栈**（lldb/cheng_crash_triage）：`addCol`+48 `ldr x16,[x10]`（x10=0x1900000000）← `outer`+100 ← main。四门其余全绿（ord 0/0、call 0/1 契约、cn 0/0 `=pass`；车头 cheng_w126 四门语义参照全绿）。
- **反汇编定性**（零烤机）：形参侧约定自洽——`var Box`（ref T）形参按「借用句柄槽」二级解引用（addCol 内 a.n=**[**[*a]**]** int32），`var Col`（值类型）一级（arr.offset=[arr]）。**outer 侧实参装配错位**：①`a` 实参应传句柄槽地址=n 槽值（Node 地址），实装 `*arena`=Box 对象头（多解一跳）；②`arr` 实参应传 n+8（Node 内 &col 槽），实装 `*(arena+8)`（基址错用 arena）。崩溃值 0x1900000000=错位解引用读到非地址数据。
- **修面域**：backend call-arg 实参物化/var-ref 借用视图 ABI（backend2_lower_slots/primary 物化域），授权面外；「实参 staging 序」正是 v6 夹具设计抓取的原生缺陷面（夹具头注：触发形=直调先于嵌套）。需要 backend2 lowering 全链取证，非 r3/r4 两轮可安全闭环。**本线三 hunk 与该缺陷零因果**（三者均为审计/roots 层放行，只决定编不编得过；生成代码语义由后端决定——无容忍臂时 v6 rc=2 根本到不了 run 段）。
- **移交首动作建议**：dump outer 调 `addCol(n.arena, n.col, 1)` 的 call-arg 实参物化 plan/frag（address 编码形 vs 值形），对照 `var ref T` 形参二级解引用约定核「句柄槽地址」实参的 lowering 臂；联立勘察 wall141 移交事项 3（@borrows 共享借用 call arg 同域）。

## 三、烤机台账（预算 2/4：r1/r2；配方=复用 w139 脚本，manifest=w139/kernel_manifest_head_git.cheng，driver=cheng_w126，cwd=仓库根；进场复现零烤机由 w142_r1 完成）

| 轮 | 产物 | sha256 | size | 内容 | 结果 |
|---|---|---|---|---|---|
| r1 | kernel_driver_w146_r1 | 0a155d93433f35dffbb8210eee7c23304765134ab20d8d646493bcc1755587cd | 186335280 | 墙 A 容忍臂+富化；墙 B 删错误提供者 | **v6 过 read-edge 墙**（rc=2→rc=1 identity 墙）；四门零回归 |
| r2 | kernel_driver_w146_r2 | f0c31b5cd4a44923668073040e7d955807e25b6a2614dc760d140f607d00434b | 186351744 | +墙 C identity 链式臂 | **v6 compile=0**（过 identity+provider+link，exe 产出）；run=139 新墙；四门零回归 |

秒级门：exact_def_freeze × 车头 rc=0（w146_edf.o 741759B）；system_link_exec_runtime × 车头 rc=0（w146_slink.o 27432089B）；exact_def_identity × 车头 rc=0（w146_idt.o 1766438B）。零既有雷。租约：r1 门禁首轮遭并行线长占（60s×N 退避补跑全过）；两轮烤机零冲突。

## 四、门禁实况（cwd=仓库根）

| 门 | r1 | r2 | 车头 cheng_w126 |
|---|---|---|---|
| zz_v6_w7 | compile=2→**compile=1** identity 墙（**推进**） | **compile=0** / run=139（**编译链全清**，run 段新墙） | 0/0（语义参照） |
| ordinary_zero_exit | 0/0 | 0/0 | 0/0 |
| call_fixture | 0/1（契约预期） | 0/1（契约预期） | 0/1 |
| cold_nested_fmt_interpolation_smoke | 0/0 | 0/0 `=pass` | 0/0 `=pass` |

判词推进实录（v6，逐字）：`read-edge unresolved op=35 …`（rc=2）→ `exact identity schema [freeze] fn=3 op row=34 managed borrow projection is broken …`（rc=1）→ compile=0 零判词 exe 产出 → run=139 SIGSEGV。

## 五、移交事项（下一线，预算 r3/r4 未动）

1. **墙 D（run 段 SIGSEGV，v6 收官最后一墙）**：定性见第二节。修面=call-arg var-ref 借用视图实参物化（backend2_lower_slots/primary 域，授权面外）。r2 驱动（kernel_driver_w146_r2）含全部三修法在 /tmp/oob_ab/w146/，复现即 `/tmp/oob_ab/w146/r2_gates/v6.exe` 或重跑门禁脚本，崩溃栈可 lldb 直取。
2. **判词富化在手**：read-edge unresolved 失败臂现带 17 列首候选投影（[wall146]），后续任何线触发即得全投影零烤机起步。
3. **联立勘察**：墙 D 与 wall141 移交事项 3（@borrows 共享借用 call arg exact_def mirror 伪消费）同在 var/borrow-arg 物化域，修 backend call-arg 时建议联立。
4. identity 链式臂契约注记：依赖 opReadADefOpRows 落戳（identity 阶段在 freeze 完成器后，r1 判词顺序实证）；若未来 read-edge 完成器时序前移需复核链条依赖。
5. 复烤配方 `/tmp/oob_ab/w146/bake_r2.sh` 改 out/rN；门禁 `/tmp/oob_ab/w146/gates_r2.sh`（已含 60s×12 租约退避）。src/tests 零本线残留（在树 32 项 src/tests 改动均系并行线/历史残档，本线零接触）。
6. 仓库根残档（他线）原样；本线临时产物全在 /tmp/oob_ab/w146/。

## 六、diff 统计与交付

- **/tmp/oob_ab/wall146.patch**：当前树态 `git diff HEAD` 全树生成，18317 行，99 files +9289/−1431（含 wall7-145 各并行线在途 hunks 原样照录）；`git apply --check --reverse` **PASS**（sha256=c4b63b3f6536f378d10fa70dbd7a544fe5c145658d315506724840e6db53a5ec）。
- **本线净增量（相对 wall142 交接树态）=3 文件 5 hunks，全带 [wall146] 标记（7 处）**：①exact_def_freeze.cheng 容忍臂 hunk+富化 hunk；②exact_def_identity.cheng 链式臂函数 hunk+主门调用点 hunk（授权面外最小触碰，必然性已论证）；③system_link_exec_runtime.cheng 删 ref glue 两行 hunk。同文件他人 hunks 原样保留。未 git commit、零分支/worktree。
- 车头参照 sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89（cheng_w126，与 wall128-142 记录逐字节同）。

日期 2026-09-04。
