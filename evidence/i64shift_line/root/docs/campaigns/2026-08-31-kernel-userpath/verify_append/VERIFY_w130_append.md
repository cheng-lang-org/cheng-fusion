# wall130.VERIFY

## 判定：授权面内穷尽定性完成——「derive 批 2 接 callee 形参 ownership 权威」的字面修法在 wall130 授权面内不可达（callee 形参声明权威的物理载体不存在于 derive 输入闭包，落列动作全在授权面外），按纪律停手完整移交；r1 烤机实证当前树态墙态逐字不变（index=22 phase=4746）、ordinary 0/0 / call 0/1 零回归、车头四门全绿；源码零改动（57 files 全树 diff 均他线在途 hunks 原样）

日期 2026-09-04。授权面=src/core/analysis/exact_def_derive.cheng（主）+（条件）src/core/analysis/exact_def_identity.cheng。本轮源码零改动：exact_def_derive.cheng 相对 HEAD 零 diff（批 2 臂即 wall128 定性时原样），identity 未触碰（他线活动文件，且已证明与本墙无关，见定性 5）。车头=/tmp/oob_ab/cheng_w126（sha256=0f198c5e6266597ff888e81a24fced244669d32b24b49b894cb8b51887c35d89，与 wall128 记录逐字节同）。烤机配方=head 三件套 + CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w130/cold_cache 任务级隔离 + CHENG_ENTRY_CACHE=0，rc=0。

### 烤机（1/3 轮，预算内；r2/r3 未动用——无授权面内修法可验证）

- kernel_driver_w130_r1：sha256=0e47402daa4b7cd2a0946068999e0443bebc4d767cdd87d38e9af5e80c531779，size=186170640。

### r1 门禁实况（cwd=仓库根）

| 门 | r1（kernel_driver_w130_r1） | 车头 cheng_w126（语义参照） |
|---|---|---|
| zz_v6_w7 | rc=1，判词逐字见下（进场态复现） | 0/0 |
| ordinary_zero_exit | 0/0 | 0/0 |
| call_fixture | 首跑 rc=2 租约冲突（wall129 长烤机占用 atomic tree）；串行退避第 1 次重试即 **0/1（契约预期）** | 0/1（契约预期） |
| cold_nested | 6+1 次退避重试全部 `parent lease unavailable`（wall129 线长烤机持续占用，末次隔 8 分钟仍忙）；该门按任务书「只记录不设门」，未复跑成功如实归档；wall128 r3 实录 rc=2 机器词墙判词（墙 A 域，wall129 修面中） | 0/0 `cold_nested_fmt_interpolation=pass` |

- v6 进场判词（逐字，/tmp/oob_ab/w130/r1_zz_v6_w7_compile.log）：`ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=22 detail=0 fn=3 op_kind=9 op_target=15 op_operands=1 a0=0 vd_slot=15 vd_own=3 vd_row=10 vd_node=83 vd_origin=1 vd_origin_id=10 bo_row=10 bo_domain=2 bo_def_row=3 consume_plus1=0 action_row=-1 src_domain=0 src_row=-1 slots=36 sealed=1 phase=4746 slot0defops=d3:k2:o2 replacerows= mcrows= …`——与 wall128 r3 移交态**逐字一致**（含 [wall128] dump 富化列）；slot 投影 `s0:tk=4:pk=0:mg=2:aux=0:off=16:tid=17`（slot0=Ptr/StackValue/Managed/off=16）。wall129 在途改动未推进也未回退此墙。

### 定性（killer 链逐环源码实证；授权面内不可达的必然性）

1. **killer 链四环全部核实在案**：①derive 批 2 臂（exact_def_derive.cheng:566-598）对值编码实参（`argSlots[i]>=0`）无条件镜像 `ops[argDef].valueDefOwnership`（:590-591）→ o17（outer(n,2)，callRow4）实参 slot0 落 def3（new(Node) CallOp，OwnMove）的 Move 戳；②消费判定全部是 `argOwnership==OwnMove` 精确谓词：freeze 通道②（exact_def_freeze.cheng:588-589）、decode 绑定（body_ir_access.cheng:1421-1422 `consumesDefinition = argumentOwnership == OwnMove`）；③CFG transfer Kill（body_ir_access.cheng:4421-4423）对 `exactCallArgRow>=0 ∧ consumesDefinition` 的 fact Kill slot0（[wall128] 合成桥守卫只豁免 semanticCallExprNodeIndex==-1 的合成 call，o17 是用户 call 照常 Kill）；④op22（n.col.offset 基 staging，CopyLocal slot15←slot0）Use slot0 撞 states[0]=-1 → phase=4746。
2. **正确语义需要 callee 形参声明权威**（outer 的 `n: var Node` → BorrowUnique 非消费；owned/value 形参 → Move 镜像保持）。该权威的物理载体排查（穷尽）：
   - CallOp 行（core_types.cheng:523-598 全字段读过）：argSlots/argPassKinds/argAbiSizes 均为 ABI 形态列，无任何形参 ownership 列；
   - o17 实证形态 = **正槽编码 + StackValue 类 passKind**：fact (Use,FixedCallArg,ordinal=0,slotIndex=0,definitionRow=3,consumes) 存在 → decode 绑定 :1357 `encodedSlot<0 即 fail` 通过 → argSlots[4][0]=0；fact 生成道（body_ir_access.cheng:1027-1035）对 ParamAddress/BorrowAddress/ByAddressAggregate 强制 `CallArgSlotIsAddress`（负编码）否则 ErrorEncodedArg——decode 通过排除全部地址车道 → passKind∈{StackValue,SretResult,ForwardEntrySret}，用户位置实参=StackValue。**StackValue 无 var/value 区分度**；
   - r1 判词 slot 投影 `s0:…:off=16` → stackOffset≥0 → LocalIsParam(slot0)=false（primary_object_plan.cheng:7962-7965）→ AppendCallArgs 文本道 var 臂（:26383-26479，LocalIsParam∧CarriesAddressValue 判 :26470）对本形必落 CallArgSlotAddress 负编码+ParamAddress（:26476-26478）——与实证正槽编码矛盾 → **n 实参由 NodeEval 通道/WholeCallExpr 内部臂以 StackValue+正槽编码发射 var 形参实参**（精确发射臂定位属生产侧功课，下一线有 debug 手段）；
   - derive 输入三类权威（transport 三列投影 / BodyOp.valueDef* / BodyIR 结构列+类型窗）均不含 callee 签名；transport SoA（lowering_plan.cheng:570-591）仅覆盖 value-def 行；BodyIR 为单函数实例，callee 的 entryDefinitionOwnershipKinds 跨函数不可见；
   - BodyIrExactDefDerive 调用点全仓恰两个（primary_object_plan.cheng:66333、backend2_pipeline.cheng:1843），函数签名/调用点/CallOp 结构/契约窗（body_ir_exact_def.cheng）全部在 wall130 授权面外。【更正 2026-09-10 实读：`primary_object_plan.cheng` 侧旧写 `:65936` 已漂移，`if !exactdefderive.BodyIrExactDefDerive(` 现址 `:66333`；`backend2_pipeline.cheng:1843` 复核实读未变，仍为 `if !exactdefderive.BodyIrExactDefDerive(`。「全仓恰两个」的计数复核实读成立】
3. **结论**：「批 2 接 callee 形参 ownership 权威」必须先由生产侧把 callee 形参权威落成 derive 可读的列（CallOp 新列或 derive 契约窗新列），再由批 2 逐列镜像——**落列动作本身越过授权面**。授权面内对批 2 落戳的任何替代改动都只能基于实参表面形态（槽编码+StackValue+局部槽），任务书明令「禁按实参表面形态猜」，wall128 定性 7 亦裁定「var-borrow 伪消费的豁免只能来自 callee 语义权威，不能来自 decode 猜测」。不硬凑、不越域。
4. **identity 条件授权面裁定为不满足必然性**：exact_def_identity.cheng 为消费侧校验器（:2380 仅诊断 emit 读列），非生产权威；CFG Kill 执行点在 body_ir_access（零触碰领地）；identity 的任何 admit/容忍改动都不消除 Kill，无法推进此墙。未触碰。
5. **owned 形参真消费防线零弱化自证**：本轮零改动，批 2 Move 镜像臂原样；address 编码形（BorrowShared 非消费）、freeze 通道①、wall126/wall127/wall128 各守卫全部原样。

### 移交（下一线按定性落点授权）

1. **v6 第二层（index=22 CopyLocal 墙）唯一修面 = 生产侧落列 + derive 批 2 镜像**，两段缺一不可，建议授权面（需编排者裁定）：
   - **方案甲（推荐，最小面）**：core_types.cheng CallOp 加 `argFormalOwnerships: int32[]`（与 argSlots 平行，默认全 OwnInvalid=sentinel；DOD/Arena/SoA 同规）；发射臂按 callee 形参声明权威填列——AppendCallArgs（:24989 targetNeedsAddress 判定处已知 callee 签名）与 NodeEval 实参道（:30646 同判）各自在 add(argSlots) 处同序 add：var/借用形参→BorrowUnique、值/owned 形参→Move、importc/合成 call→全 sentinel；derive 批 2 臂（exact_def_derive.cheng:584-598）改镜像规则：`argFormalOwnerships[argRow]!=OwnInvalid 时以它为权威落 argOwnerships（var/借用形参落 BorrowUnique 非 owning），sentinel 时保持现 Move 镜像`（fail-closed：新列 sentinel=行为逐字节不变）；backend2 发射道（backend2_pipeline 同名实参道）同列同序镜像。验收=v6 0/0 + ordinary 0/0 + call 0/1 + wall127/128 守卫域判词逐字不动。
   - **方案乙**：derive 契约窗（BodyIrExactDefTypeArenaWindow）加 call-arg 形参 ownership CSR 列，两调用点构造窗时从 lowering 平面（PrimaryObjectIrFunction.callTargetTypedFunctionIndexes→TypedExpr 形参列）填列——面比甲宽（body_ir_exact_def+两调用点+窗 shape 校验），仅当甲的 CallOp 列被冻结裁定否决时用。
   - 生产侧发射臂的精确定位功课：NodeEval 通道对「局部 var 实参 + var 形参」的 StackValue+正槽编码发射点（本轮实证排除 AppendCallArgs :26383 臂，见定性 2）。**禁**在 decode/freeze/identity/CFG 任何消费侧对「StackValue+槽编码」形做放行（=表面形态猜，违禁；wall128 守卫谓词不可放宽至用户 call）。
2. **墙 A（cold_nested 机器词墙）**：wall128 移交原样（wall129 线修面中，本轮门禁因租约冲突未复跑，无新信息）。
3. **烤机预算**：3 轮仅动用 r1；r2/r3 留给下一线（方案甲落地后一轮烤机即可验证，判词富化已就位）。

### 交付与统计

- **/tmp/oob_ab/wall130.patch**：12362 行（当前树态 `git diff HEAD` 全树生成，57 files +7438/−1128，全部他线在途 hunks 原样照录；`git apply --check --reverse` **PASS**；sha256=4433769589df84799163bbf698c9746a9028a6c67218ba0a3a4c3049f1f10c43）。相对 wall128.patch 的增量=wall129 线在途改动（文件集相同，±19 行级差异），**本轮自身零源码改动**。
- 未 git commit、零分支/worktree；src/tests 零探针残留（本轮无探针入仓）；作业目录 /tmp/oob_ab/w130/（kernel_driver_w130_r1、bake_r1.log、gates_r1.sh、四门禁 log、lead 参照 log）。
- 作业脚本 /tmp/oob_ab/w130/gates_r1.sh 用后可随目录一并清理；临时目录未用裸 /tmp，全部收在 /tmp/oob_ab/w130/ 任务目录内。
