# wall148.VERIFY

## 判定

**v6 收官：四墙连破，run 段 SIGSEGV 清除，四夹具 4/4 全绿，车头语义参照全绿。** r4 驱动 `zz_v6_w7.cheng` compile=0 / **run=0**（夹具内建合同 r=7、col.offset=8、arena.n=108 全过，run.log 零输出零残留），`ordinary_zero_exit` 0/0、`call_fixture` 0/1（契约预期）、`cold_nested_fmt_interpolation_smoke` 0/0 `=pass` 零回归；车头 cheng_w126 四门同跑全绿。烤机预算 4/4 用满（r1 修法主体、r2 proof 补全、r3 判词富化取证、r4 收官），每轮 sha256/size 入台账。patch reverse-check PASS。

## 一、根因（承接 wall146 移交定性，本轮逐指令闭环）

v6 run=139 的 SIGSEGV 是**同一根因的三处同族暴露**：`var T` 借用视图形参在 call-resolution 元数据中被前端编码为内部借用标记拼写（`TypedExprCallParamType` 对 mutable 形参返回 `@borrow:T`，注释明言这是替代旧 `var T` 拼写的 source-impossible 标记），而后端 `PrimaryBodyIrTypeTextIsVarParam` 仍只认 `var` 前缀 → **var 性判定恒假 → 全部 var 借用视图访问降级为值语义**：

1. **D3（wall146 主判）call-arg 值通道**：`addCol(n.arena, n.col, 1)` 的 var 字段实参在节点路径分类（`AppendCallExprNodeToSlot`）落入通用 EvalNode 臂，物化成 `#nev` 值槽（Box 句柄 load / Col 值拷贝），callee 拿到错位视图。r3 相位轨迹实证修复生效：`args=#vfaddr41#0,#vfaddr41#1,#nev37`（地址槽）。
2. **D2 整对象借用实参传值**：`outer(n, 2)` 传了 n 槽的值（Node 地址）而非槽地址，callee 二级解引用全部错位。修复后走 `CallArgSlotAddress(n 槽)` + ParamAddress，借用链按槽地址转发。
3. **D1 `n.arena.n = 100` 单跳写入**：点路径中间 ref 跳被按 inline 偏移直写，100 写进 arena 字段槽低半字 clobber 句柄（崩溃现场 [NodeAddr]=0x0100_00000064 实证）；`a.n = a.n+v`（var ref 形参根）写侧同样缺一跳（读侧借视投影本就正确，读写不对称实证）。

对照锚：C 车头链 v6_ref.o 反汇编（`outer` arg=nodeAddr+0/+8 地址形；`addCol` 形参侧 `a.n=[*(*a)]` 读写对称）逐指令对拍；ABI 约定与 ZRPC 契约一致——借用证明后瞬时生成物理地址，借用视图实参=句柄槽地址。

## 二、修法（4 文件 25 处 [wall148] 标记；与在树他人 hunks 零接触）

1. **var 性第一权威换轨（[wall131] 同源裁定的落地）**：`AppendCallArgs` 与 `AppendCallExprNodeToSlot` 两级分类点（backend2_lower_slots.cheng + primary_object_plan.cheng 孪生共 4 处）改为 `PrimaryBodyIrTypedParamMutableAt(...) == 1 || 既有文本判定`——结构列权威、文本 fallback 兜底、fail-closed 只增不删。backend2 侧补 `PrimaryBodyIrUniqueTypedFunctionIndex` + `PrimaryBodyIrTypedParamMutableAt` 镜像（plan 侧既有）。
2. **双拼写内型剥取**：新助手 `PrimaryBodyIrVarParamRuntimeInnerType`（先剥 `@borrow:` 标记、否则 `StripVarType`），替换 var 臂内全部 `StripVarType(targetParamType)` 形变位点；`MaterializeVarFieldAddressSlot` 门同改双拼写接受。
3. **借用视图根解引用跳**：`MaterializeExactFieldPathAddress`（backend2）与 `PrimaryBodyIrMaterializeVarBorrowBase` + 两处 BinOp 装配（plan）——可变 ParamRef 根且槽为 PtrTag 时先发一跳 FieldLoad 解句柄槽得对象基址（位于全链校验之后，被拒路径零发射契约不变）。
4. **借用视图/引用中跳 store**：新助手 `PrimaryBodyIrAppendBorrowViewFieldStore`（backend2_lower_slots + plan 孪生）接入 `AppendSimpleFieldAssignFast`——var ref 形参根先解一跳、点路径 ref 中跳经句柄装载、叶偏移精确落 store；全链 meta 先验后发射，任一 miss 返回 false 交回既有 naive 路径（非借用形态零行为漂移）。
5. **Site-1 既有槽直传槽地址（r4 收官修）**：AppendCallArgs var 块对既有具名槽不再经 `FindOrCreateTypedSlot` 重建（重建触发既有槽 kind 变形/新建——r3 诊断实证 main slot0 被占位化：`diag_call_target=cheng_malloc diag_call_result_slot=0 slot_name= tk=0`），var 形参按值转发借用地址、本地槽 `CallArgSlotAddress` 直传，然后 continue。
6. **契约卫生**：新构造 BodyOp 全部补 `BodyIRApplyBodyOpDefaultProof`（规范要求 var op 后立即调用）；`SliceBytes` 入 str[] 显式 `share`（ORC 门）。
7. **判词富化（[wall148]，wall85/87/90 同文件先例）**：`exact_def_derive.cheng` TypeId-drift 判词追加 `fn_row/diag_call_target/diag_call_result_slot/slots` 四列（r3 取证即靠它定位 slot0 占位化；读列全部界内守卫）。

## 三、烤机台账（预算 4/4；配方=复用 w146 验证过的 w139 rebuild 通道 + kernel_manifest_head_git.cheng，driver=cheng_w126，cwd=仓库根；任务书 w126 脚本路径已被清理故用同通道 w139 版）

| 轮 | 产物 | sha256 | size | 内容 | 结果 |
|---|---|---|---|---|---|
| r1 | kernel_driver_w148_r1 | 71ac2c44d37d97ffefdb980e0c0f1e7ac8040856a41b9f18253d4eb7688e6dcf | 186499808 | 修法主体（分类换轨+内型剥+根解引用+store hop） | v6 run=139 → **compile=1** 新墙（判词推进）；ord/call/cn 零回归 |
| r2 | kernel_driver_w148_r2 | b4bd53b850ae047d0931938718535585d9ce3370c231a8b7f660a7f065207b7a | 186499808 | + BodyOp default proof 全量补全 | v6 同判词（proof 非独根因）；四门零回归 |
| r3 | kernel_driver_w148_r3 | 9f5506b1e997cf7cc84813680ee5ef50ff3932ed5b4ea8bc805d59918f511b8d | 186499840 | + derive 判词富化（fn_row/call 坐标/slots） | 取证命中：main op=3 cheng_malloc result_slot=0 slot0 占位化 |
| r4 | kernel_driver_w148_r4 | 20a53e3bca7801c76d046ec8a2f55b1618fb7542c2024a163f9e35fc0516512a | 186499840 | + Site-1 既有槽直传槽地址（绕开重建变形） | **v6 compile=0 run=0 收官**；四门 4/4；车头参照全绿 |

判词推进实录（v6，逐字）：w146 移交 `run=139 SIGSEGV fault 0x1900000000` → r1/r2/r3 `exact def derive: def/slot TypeId drift op=3 slot=0 … fn_row=3 diag_call_target=cheng_malloc diag_call_result_slot=0 slots=27` → r4 **compile=0 run=0 零判词**。

## 四、门禁实况（r4 驱动，cwd=仓库根）

| 门 | r4 驱动 | 车头 cheng_w126 |
|---|---|---|
| zz_v6_w7 | **0/0（收官）** | 0/0 |
| ordinary_zero_exit_fixture | 0/0 | 0/0 |
| call_fixture | 0/1（契约预期） | 0/1 |
| cold_nested_fmt_interpolation_smoke | 0/0 `=pass` | 0/0 `=pass` |

秒级门：本轮 4 个改动文件 × 车头 `--emit:obj` 单发——backend2_lower_slots rc=0（13.3MB）、backend2_lower rc=0（14.5MB）、exact_def_derive rc=0；primary_object_plan 单文件 rc=2 为既有基线雷（import 闭包内 codegen_a64_fill_units.cheng:471，w146 同款记录，非本线引入；其全量编译门由 manifest 烤机覆盖，r1-r4 四轮全过）。首建 obj 曾 rc=2 系 ORC 门（SliceBytes 借用入 str[] 需显式 share），按门修正后过——门工作正常实证。

## 五、diff 统计与交付

- **/tmp/oob_ab/wall148.patch**：当前树态 `git diff HEAD` 全树生成，19286 行，101 files +10023/−1454（含 wall7-147 各并行线在途 hunks 原样照录）；`git apply --check --reverse` **PASS**（sha256=e7513a2b0eee3e645965314408fe180ff99eada9167d81506da938cf80b82ba3）。
- **本线净增量（4 文件，全带 [wall148] 标记 25 处）**：①backend2_lower_slots.cheng（+310：结构权威镜像、双拼写剥取、根解引用跳、BorrowViewFieldStore、分类点换轨）；②primary_object_plan.cheng（孪生同修 + VarBorrowBase/BorrowViewFieldStore + 判词富化同款位点）；③backend2_lower.cheng（+14：SimpleFieldAssignFast 接入 store 臂）；④exact_def_derive.cheng（+50 内含他人 hunks：TypeId-drift 判词富化 4 列）。授权面外唯一触碰=exact_def_derive.cheng 判词字符串扩展（诊断必需，wall85/87/90 同文件先例，已论证）。
- src/tests 零本线残留（35 项在树脏文件均系并行线/历史残档）；本线临时产物全在 /tmp/oob_ab/w148/；未 git commit、零分支/worktree。
- 车头参照 sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89（cheng_w126，与 wall128-146 记录逐字节同）；C 参照对象 /tmp/oob_ab/w148/v6_ref.o（v6_ref run=0）。

## 六、移交事项

1. **v6 已收官，kernel_driver_w148_r4 为当前最优驱动**（/tmp/oob_ab/w148/kernel_driver_w148_r4）。复烤配方 bake_r4.sh；门禁 gates_r4.sh（含 60s×12 租约退避——本轮租约冲突频繁，wall147/149 并行烤机期间需耐心退避）。
2. **判词富化遗产**：TypeId-drift 判词现带 fn_row/call_target/call_result_slot/slots 四列，后续任何线触发即得函数级坐标零盲猜。
3. **契约注记（后续线必读）**：a) var 形参在 call-resolution 元数据中的权威拼写是 `@borrow:T`（TypedExprCallParamType），`PrimaryBodyIrTypeTextIsVarParam` 的 `var` 前缀判定只对局部绑定文本有效——任何新 var 判定点必须走 `PrimaryBodyIrTypedParamMutableAt` 结构列（[wall131]+[wall148] 双实证）；b) 新构造 BodyOp 必须立即 `BodyIRApplyBodyOpDefaultProof`（valueDefSlot 零值默认会被 derive 当 slot0 定义）；c) AppendCallArgs var 块对既有具名槽禁止经 FindOrCreateTypedSlot 重建（kind 变形/占位化风险，v6 实证）。
4. **wall149 共存注记**：编排者通报 wall149 在 program_support_backend.cheng 的 quarantine ring 修复已在本轮 r3/r4 烤机闭包内，门禁全绿，无冲突。buffer.cheng 去重恢复与本线零交集（v6 闭包不含）。
5. **语义对照资产**：/tmp/oob_ab/w148/v6_ref.o 为 C 车头链正确发射序列（outer/addCol/compute/main 全函数），后续借用 ABI 工作可继续对拍。

日期 2026-09-04。
