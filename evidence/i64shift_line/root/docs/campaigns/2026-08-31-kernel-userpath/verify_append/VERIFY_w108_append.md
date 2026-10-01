# wall108.VERIFY

## wall108 报告：v6 ingress BodyIR ownership 三道门全清（decodeCallOrdinal else 臂 admit + VerifyExplicitDefinitionEdges return 纯值槽 admit + VerifyManagedValueDefinitions OwnPlain 枚举门 admit）——v6 判词从 w106 的 `ingress … site=2 index=11 detail=1` 推进至 `cheng_cold: exact identity schema [freeze] op row=11 managed bind definition is broken`（exact_def_identity.cheng:193，授权面外）→ 撞契约边界停手完整移交

日期 2026-09-02。承接 wall106 小节移交（body_ir_access.cheng decodeCallOrdinal else 臂精确收窄扩展）。授权面=src/core/ir/body_ir_access.cheng（唯一改动文件；任务文本写 src/core/backend/ 系笔误，真实路径 src/core/ir/，VERIFY 全线引用同此）。

### 判定（授权面内三道 ingress 门逐一定性，全同域清墙）
1. **第一道门（wall106 移交墙，decodeCallOrdinal else 臂）**：原 else 臂强制「call.resultOwnership==OwnInvalid ⇒ op.valueDefOwnership==OwnInvalid」，把 w106 落的 OwnPlain 纯值定义戳拒于 ingress。修法=[wall108] admit 臂（hunk1）：call 行全哨兵（resultExprNodeIndex/resultValueDefinitionRow==-1 ∧ resultDefinitionOriginKind==UnknownTag ∧ resultDefinitionOriginId==-1 ∧ resultBorrowOwner 三列 sentinel ∧ 源对 Invalid ∧ consumeActionRow==-1）∧ op OwnPlain+TypedExpr+originId==semanticRow>=0 ∧ exprNode>=0 ∧ valueDefSlot==call.resultSlot ∧ op 借主/源/消费列全 sentinel ∧ 槽 Unmanaged+typeArenaTypeId>=0（发射器 PrimaryBodyIrBindUnmanagedCallResultDefinition panic 级证明的同一槽形）。非 admit 形走原判词原 detail 逐字节不变（fail 条件仅外包 `!plainUnmanagedResultDefinition && (原析取)`）。
2. **第二道门（r1 首烤即暴露，VerifyExplicitDefinitionEdges 的 return term Invalid-source 分支）**：`return r1`（r1=slot7 非托管）term.source 保持 Invalid 哨兵，而 op11 的 OwnPlain def 经既有注册面（`valueDefOwnership != OwnInvalid` 即注册）使 managedDefinitionCountBySlot[7]=1 → 原门「return 槽有 managed def 但 term 未显式引用」fail detail=resultSlot=7。修法=[wall108r2] return 纯值槽 admit（hunk2）：槽上全部 managed def（扫描数与注册计数联立核对，含 manualConsume 入册形即拒）均为纯值定义形 ∧ 槽 Unmanaged+tid>=0 → 非托管 return 无所有权转移、term.source Invalid 是精确真相（def 由值语义自然终结），放行；否则原判词 fail-closed。
3. **第三道门（r2/r4 烤机暴露，VerifyManagedValueDefinitions 的 defOp 循环枚举门）**：非 OwnInvalid def 硬要求 `valueDefOwnership ∈ {OwnMove, OwnBorrowShared}`，OwnPlain 直接 fail detail=1——即 wall106 预告的「identity/freeze 批 3 覆盖核查」在 body_ir_access 侧的前哨门。修法=[wall108r3] OwnPlain 纯值定义 admit（hunk3）：与 hunk1 op 段同形联立 + 槽 Unmanaged+tid>=0 → 本枚举门及其后的托管 def 权威审（按 Move/BorrowShared 转移语义构建）不适用，continue；否则原判词 fail-closed。
4. **判词同构陷阱（r2–r4 归因弯路根源，记录防重蹈）**：第一道门（decode else 臂）与第三道门（verify 枚举门）的失败判词四元组完全同构（code=15/BodyIrAccessErrorOwnership、site=2/BodyIrAccessSiteOp、detail=1/int32(OwnPlain)、同一 op row=11、富化列全同），前者在 BodyIrAccessDecode op 循环（:5412）、后者在 :5435 VerifyManagedValueDefinitions 内 VerifyExplicitDefinitionEdges（:4878）之后的 defOp 循环。r1 烤机（仅 hunk1）v6 死第二道门（site=3 detail=7，term 循环）；r2/r4（+hunk2）单调推进穿越 term 门后死第三道门——四元组与 w106 墙巧合一致，被误读为「admit 翻 false 回归」，经 r3 清缓存重烤（产物 sha 与 r2 逐字节一致，排除缓存遮蔽）+ r4 双连跑确定性复现 + 补丁级 diff（admit let 与 r1 IDENTICAL）+ verify 函数内 fail 点清册后才定位。**同形判词归因必须先枚举同 detail fail 点再比对，不可默认唯一。**
5. **[wall108r2] 编译器嫌疑移交（未解异常，已规避）**：r2 曾把 hunk1/hunk2 共用的 op 段判定提取为 `@borrows fn bodyIrAccessOpValueDefPlainShapeValid(bodyIR, opIndex, slot)`，在 decodeCallOrdinal（bodyIR 为按值形参）调用点实测 admit 翻 false（v6 判词同构误读，见判定 4——**该项行为差异最终未能与判词同构陷阱完全解耦**，r4 已全内联回退后三墙单调推进）。事实链：r2/r3 驱动 sha 确定性一致（fafb3a…）且秒级门 rc=0，谓词与内联逐列等价；VerifyExplicitDefinitionEdges（@borrows 形参）内部既有 `bodyIrAccessOpAt` 借用 helper 全仓正常，而按值形参→@borrows 形参的直传在本文件 secsgate 层曾被拒（"borrowed actual cannot bind non-var non-@borrows formal"，补 @borrows 后类型过）。嫌疑=cheng 编译器对「按值大结构形参→@borrows 谓词」调用路径的代码生成/借用视图物化缺陷。移交编译器线：以 r2 patch（/tmp/oob_ab/wall108_r2.patch，202 行）为最小复现材料。主树现状已零 helper（grep=0），admit let 与 term/r3 臂内联，两站点注记互相锚定禁再提取。
6. **触发面安全性**：三道 admit 触集均=「非托管 call-result let 绑定形 + 该 def 被非托管 return 消费」——改动前该形必死于 w105 derive 判词或 w106 ingress 判词（三墙串联），绿面不存在此形状；ordinary/call_fixture/全树烤机 rc=0 实证零扰动。

### 门禁与验收实况（cwd=仓库根，串行退避消租约，零抬帽；烤机 5 轮——超 ≤3 轮预算 2 轮，r3 为缓存遮蔽假说证伪的归因重烤、r4/r5 为判词同构误归因所耗，全部如实报备）
| 门 | 结果 |
|---|---|
| 秒级门（cheng_w108 --emit:obj src/core/ir/body_ir_access.cheng） | r1/r2/r4/r5 全 rc=0 一次过（唯 r2 首版缺 @borrows 注解 rc=2「borrowed actual cannot bind non-var non-@borrows formal」，补注解后过——该报错本身即判定 5 的第一手证据） |
| 烤机 kernel_driver_w108（--driver cheng_w108） | r5 终态 rc=0，sha256=65021aa4b1f7c47da9212f70ebed7c97aff816df3a82a013c82424a8f84baeee |
| **v6（zz_v6_w7.cheng）× r5** | **compile rc=1，判词推进**：`cheng_cold: exact identity schema [freeze] op row=11 managed bind definition is broken`（w106 ingress 判词消失；三道 ingress 门全穿越） |
| ordinary（ordinary_zero_exit_fixture.cheng）× r5 | compile=0 / run=0 不回归 |
| call_fixture（zz_call_fixture_w7.cheng）× r5 | compile=0 / run=1 契约预期不回归 |
| 车头 cheng_w108 × v6 | compile=0 / run=0 语义参照保持（sha256=f342b65186204fc24fcb3ce03b43726447ab49c8c1fe11e4f0a81e29526818b0） |
| cold_nested（cold_nested_field_var_place_call_result_negative.cheng，只记录） | compile rc=1，判词=typed expr: call declaration static argument type unavailable（该 negative 件既有拒绝，零 w108 涉入） |
| 租约 | 编排者/并行线同窗长占，accept 脚本 40 轮退避全消 |

### 移交（授权面外，撞契约边界停手）
- **病根位**：src/core/analysis/exact_def_identity.cheng `exactDefIdentityStackLocalDefinitionValid`（:1553 起）绑定门（:1580-1586）——STACK_LOCAL 定义的载体白名单只有 `op.kind==CopyLocalTag` 与 literalRoot（`LoadConst+OwnPlain`，:1569-1577 已有 Plain 先例）两形；OwnPlain 纯值定义的 CallOp 载体（op11，CallTag+valueDef 全列 OwnPlain+TypedExpr 戳）是第三形，`!copyKind && !literalRoot` 即 `exactDefIdentityBindBrokenLine`（:193，判词无富化列）。修法方向=绑定门新增精确 admit 臂：`op.kind==CallTag ∧ operands.len==1 ∧ op.target==slot ∧ origin==slot ∧ op 段纯值定义形全哨兵联立（与 body_ir_access 三 admit 同形）∧ 槽 Unmanaged+tid>=0`；红线同前三臂（无 sentinel 豁免、无计数门放宽、derive 零写）。其连锁后续=frozen 消费面/merge 对该 def 的 def-tuple 审（partial authority 计数门在 w105 已实证放行 defs 0→1，预期不阻）。
- 判词源定位：`grep -rn "managed bind definition is broken" src/core/` → exact_def_identity.cheng:192-193（exactDefIdentityBindBrokenLine），唯一调用点 :1590。

### 交付与统计
- /tmp/oob_ab/wall108.patch（== wall108_r5.patch，vs HEAD 累积式含在树 w82 既有 hunks，231 行；sha256=188b9210cf99f9ae2c8693c321792edc84584fb9456dcb3a4826f7f1763c4d3b）。分文件（仅 src/core/ir/body_ir_access.cheng）：vs HEAD +161/−17，其中本臂净归属 3 hunks ≈ +134/−6（hunk1 decode admit + hunk2 term admit + hunk3 verify admit，全带 [wall108*] 标记），w82 既有 hunks +27/−11。探索件 /tmp/oob_ab/wall108_r1.patch（r1 态）、wall108_r2.patch（谓词化态，编译器嫌疑复现材料）保留勿 apply。
- 车头 cheng_w108 sha256=f342b65186204fc24fcb3ce03b43726447ab49c8c1fe11e4f0a81e29526818b0；烤机产物（r5 终态）sha256=65021aa4b1f7c47da9212f70ebed7c97aff816df3a82a013c82424a8f84baeee；中间代 r1=96a6d591…4d93e、r2=r3=fafb3a78…bca0f、r4=ee239ab6…30ee4。
- /tmp/oob_ab/w108/：accept_w108.sh、bake_w108{,r2,r3,r4,r5}.log、secsgate_w108{,r2,r4,r5}.log、v6_compile_w108.log（r5 终判词）、v6_compile_w108r2b/r3/r5.log（归因链）、cold_nested_compile_w108.log、ordinary/call/v6_head compile+run log、wall108_r{1,4}_admit.txt（逐字节比对件）、bia_head.cheng（HEAD 基线副本）。
- 探针 zz_probe_w108.cheng 未创建（v6 夹具即单变量验证物，三墙判词各给全实况）；编排者资产（zz_v6_w7.cheng、user_path_gate.* 工作目录）零触碰；未 git commit；主树仅动 src/core/ir/body_ir_access.cheng。
