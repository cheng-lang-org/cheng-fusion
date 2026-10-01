# VERIFY_phaseb_parser_w2_append.md —— Parser 域 PhaseB 施工线（PHASEB-PARSER）2026-09-06

锚点=工作克隆 /Users/lbcheng/cheng-f24/anchor_clones/pb_parser（自合入态主树 cp -cR，含 wall154 在途 hunks；主树代码零接触，checkpoint 只落 campaign docs/patches）。基线驱动=run_m3/kernel_driver_merge（复现用），施工烤机=本线克隆自烤（cheng_w126 车头，backend_driver_dispatch_min 全量自宿主，全禁缓存+每轮新鲜缓存根，BACKEND_JOBS=8，峰值 RSS≈784MB<1GiB）。方法=帧级定性（诊断插桩烤机三轮）→ 根修 → 负例 fail-closed → 全量回归 → 配对烤机 sha 锁。

## 一、结论先行

**W2 role 预绑通杀墙（break/continue/defer 三关键字连坐）已穿**：probe_break / probe_continue 翻绿（compile=0 run=0 `probe_break=pass` / `probe_continue=pass`）；probe_defer 的 **parse 相墙穿**，判词前移至 BodyIR 层 `body ir control flow: defer action bytes invalid`（ir/core_types 域，见 §六移交）。**match case-else 吞并墙已穿**：`PARSER_BRANCH_WITHOUT_IF` 判词消灭，probe_match 判词前移至 typed 层 `typed expr: call declaration static argument type unavailable ... args=Color.Red`（enum 限定名实参静态定型墙，typed_expr 域，见 §六移交）。探针判词从 parse 相全数前移出 parser 域。

原 W2 判词（逐字）：`parser value expr: prebound statement root has no role`；原 match 判词（逐字）：`PARSER_BRANCH_WITHOUT_IF token_index=29 token_kind=15 ...`。

## 二、W2 根因（带诊断烤机实锤，三层叠加 + 链上两门）

诊断方法：panic 行身份插桩（kind/line/col/surface/root/callNode）+ 四阶段零行检查（after-structured-seeds / before-call-events / after-call-events / stamp-fmt-entry），三轮烤机逐层排除。

1. **【panic 直因】sidecar 认领臂 move-out 早退泄漏**：`ParserValueExprStampStrFormatFacts` 的 sidecar structured 认领循环先 `var expr = layer.exprs[exprIndex]`（受管聚合**移出**，槽位置零）后按 `ParserValueExprNormalizedStatementRole` 找 root event；BreakStmt/ContinueStmt/DeferStmt 无 role 映射 → role=Invalid → `nodeIndex<0: continue` **早退不写回** → 槽位成零值行（实锤：panic 行 `kind=0 line=0 col=0 surface=[] root=0 callNode=0`，t_break_min 中 break 行 index=1/total=3、t_defer_min 中 defer 行 index=0/total=3）。零值行 root=0≥0 且 role=0=Invalid，撞终校验 panic。阶段检查证明零行产生于 stamp-fmt-entry 之后（即该循环自身）。
2. **【结构缺位】三关键字语句无 parser 节点身份**：dispatcher 对 break/continue 仅裸校验（不产节点不注册 statement root event），defer 同；receipt 契约要求每 normalized 行携带 origin/root 节点（`normalized expression parser node missing` 同 probe_for W3 形），故仅修 1 会让三关键字行死于 receipt。
3. **【值域门三处】** role 枚举扩尾需同步三处镜像门（详见 §三）。

根修（五文件，全部带 [phaseB-parser-w2]/[phaseB-parser] 标记）：
- parser.cheng：①role 枚举尾部追加 LoopExit/LoopNext/Deferred/CaseElse；②节点 kind 尾部追加 `ParserValueExprKeywordStmt`（零子叶节点，span=关键字 token，身份锚不作值表达式消费）；③dispatcher break/continue 臂与 defer 臂产 KeywordStmt 节点 + 同 anchor 语句 root；④`ParserValueExprNormalizedStatementRole` 补 BreakStmt→LoopExit / ContinueStmt→LoopNext / DeferStmt→Deferred / ElseStmt→CaseElse 映射；⑤sidecar 认领臂重构：认领判定全借用读，expr 仅在确定绑定后移出且立即写回（**skip 路径零移出**，泄漏类根除）；⑥绑定 role 显式跟踪（事件命中→映射 role；Else 继承→Condition，if 链 else 行为零漂移）；⑦statement roots 严格校验上界 CaseGuard→CaseElse。
- compiler_parser_receipt.cheng：normalizedExpr 身份 role 上界 CaseGuard→CaseElse。
- csg_core/compiler_snapshot_schema.cheng：role 上界硬编码镜像 12→16（该文件不 import parser 的零依赖契约保持，注释锚点注明枚举尾部序数）。
- tooling/compiler_csg.cheng + backend/lowering_plan.cheng：expr summary 直方图补 deferStmt/breakStmt/continueStmt 三槽（struct+fill+KindCountTotal+ShapeValid），`kind_total==exprCount` 守恒恢复。

## 三、match case-else 根因与根修

根因：`case c` colonless 头经 ExtendIndentedValueRange 尾部 case 臂吞并同列 of/else 行后，`While/Match/Case` 头臂把臂区行丢给通用 `ProcessSuiteRange` 逐行分类——`of X:` 行分类器 -1 直通既有 of 臂产线，`else:` 行被分类器按「孤儿 elif/else（缺 if 头）」判 -3 硬拒（规范 §stmt/ifStmt：else 只是 if 续支；**但 §stmt/caseStmt caseBranch 明文 `"else" ":" suite` 是 case 分支**）。

根修（parser.cheng）：①`ParserValueExprProcessCaseBranchLines`——case 头后臂区专用循环，逐支精确消费（of 臂走既有 ProcessStatementRange 路径零改动，保 pattern bindings/CaseArm region/guard 全契约；非 of/else 头 PARSER_CASE_BRANCH_EXPECTED 硬拒）；②`ParserValueExprProcessCaseElseBranchRange`——else 臂产线（Block 词法域+套件产线，与 of 臂同构；不产 CaseArm region——region 权威链绑 pattern 唯一性，无 pattern region 会撞 forwarding authority 计数；产 KeywordStmt 节点+CaseElse root 供 ElseStmt seed 行认领）。

## 四、bc3 先行工作裁决（audit_bc3.patch，77KB，参考实现读）

- **W2 核心（parser role/事件、csg summary 桶、receipt/schema 上界）与本案同构**：bc3 用 ParserValueExprBreak/Continue 两节点 kind + LoopExit/LoopNext 两 role；本案单 KeywordStmt kind + LoopExit/LoopNext/Deferred/CaseElse 四 role。**本案为严格超集**：bc3 无 defer 通道（DeferStmt 行在 bc3 下仍触零值行 panic）、无 match-else 的 ElseStmt seed 认领通道。
- **决定性差异——零值行 panic 机制 bc3 全程未触及**：其设计隐含「seed 行必能命中 root event」，而 move-out 早退泄漏是任何 role 搜索失败的 sidecar 行（含 bc3 场景中 `else:` 行）的通用爆点。本案 ⑤ 为根修，bc3 无对应物。
- **bc3 的 W4 of 臂重实现不吸收**：其以 ParseExpression 重写 of 臂并硬拒 guard 形，退化既有 ParseCaseEntryListRange 的 bindings 注册/alternatives/CaseArm region/guard 契约；本案复用既有 of 臂产线，of 路径零改动。
- **bc3 独有的 CaseStmt seed + 臂域 else 抑制 + ExtendIndentedValueRange case 早退排除**：服务于下游 typed/primary 的 case 语句产线（StmtCase 消费位仍未到），属 typed 产线进场时的先行动作，本案不抢——已作为 match 链移交件记录（§六）。
- bc3 的 when 折叠（W6）与命名聚合构造 lowering 臂（objctor/phaseB-bc2）分属 W6 墙与 objreg 线，非本线裁决范围。
- **收编动作**：按 bc3 的极简口径撤销本案初版加在 CompilerCsgReport 的三行 expr_surface_* 报告文本（报告为独立子命令输出，非契约字段；少漂移）。

## 五、负例 fail-closed（fix3 驱动实测）

| 负例 | 判词 | 认定 |
|---|---|---|
| 孤儿 else（无 if 头） | `PARSER_BRANCH_WITHOUT_IF` | -3 门禁对 if 链保持 ✓ |
| `break n`（尾随 token） | `parser value expr: trailing token after terminal statement` | ✓ |
| `continue now`（尾随 token） | 同上 ✓ | ✓ |
| `defer x = 1`（缺冒号） | `parser value expr: suite separator missing` | ✓ |
| `of Red`（缺冒号） | `parser value expr: case branch separator missing` | ✓ |
| 臂区间杂行（`42` 行） | parse 合法（expressionStmt∈statementCore，臂区止于首个非 of/else 同列行），typed 层另报语义错 | CASE_BRANCH_EXPECTED 为 dead-man 硬门（不可达防御）|

## 六、移交（判词已定位到帧，非本线域）

1. **probe_defer 剩余墙**：`body ir control flow: defer action bytes invalid`（src/core/ir/core_types.cheng:3281，Seal 时 `BodyIRControlFlowDeferActionCid` 产出无效 CID——defer action 产线缺/坏）。parse/receipt/schema/summary/csg/typed 全通。
2. **probe_match 剩余墙**：`typed expr: call declaration static argument type unavailable ... args=Color.Red`（typed_expr.cheng:29330；`TypedExprStaticExprTypeAtLevel` 无 enum 限定成员臂——对照 probe_enum 绿于 let/== 通道）。隔离实证：无 case 的 t_enum_arg 同判词，**与 case 产线无关的独立 typed 墙**。bc3 的 CaseStmt seed 臂域件（§四）为 case 产线进场时的配套参考。
3. **probe_for（W3，Stretch 未开工）**：判词与基线逐字不变（`surface=..< rootNode=-1`），本案未动 range 产线。
4. typed_expr.cheng 本案零改动（WAVE 域零重叠落盘）。

## 七、终验契约

- **配对烤机**：r1/r2 全冷（CHENG_DISABLE_COLD_OBJECT_CACHE=1 + 每轮新鲜缓存根）自宿主烤机，wall=207s/204s，峰值 RSS=783MB/782MB（<1GiB 进程树守卫）。
- **sha 锁**：r1_sha=r2_sha=`b2d1f0f17dba3ed919e6ce71776d711f2faa26cd63acd3ad07ed618343a37947`（SHA-EQ-CONFIRMED）。
- **全量回归**（同一 sha 驱动，19 探针）：9 绿（while/enum/tuple/assert/varinit/mod/objctor/**break**/**continue**）+ defer/match 判词前移（§六）+ 其余红判词与基线逐字一致，零回归。
- **四夹具门**（tools/user_path_gate.sh，r1 驱动）：`pass=4 known_red=0 stale=0`；探针区 `probe_pass=9 probe_red=10 probe_stale=0`；`max_process_tree_peak_bytes=1011810304 < rss_cap_bytes=1073741824`。
- **烤机报告契约字段零漂移**：r1 报告 118 字段键与 run_m3 参照逐一相等（diff 空）。
- **patch 验证**：patches/phaseb_parser_w2.patch（5 文件，+净 177 行 parser 及 4 文件镜像门/桶）对收编 WAVE2 后的主树 `patch -p1 --dry-run` 干净、实套后 marker 计数吻合且与 WAVE2 并行改动共存。
- **负例**：§五 5/5 fail-closed。

## 八、tsv 刷新指令（主线程执行或已由本案落主树）

```
probe_break    probe_break.cheng    0  0  -
probe_continue probe_continue.cheng 0  0  -
probe_defer    probe_defer.cheng    1  0  body ir control flow: defer action bytes invalid
probe_match    probe_match.cheng    1  0  typed expr: call declaration static argument type unavailable
```

## 九、纪律自查

零 commit、零分支、零 worktree、零 git restore 整文件；主树源码零接触（patch 对主树副本 `git apply --check` 干净实证）；临时区=克隆 .w/（patchtest 副本已清）；烤机窗按收紧后协议（owner 覆盖写接管、轮次进克隆 .w/、绝不 rm -rf bake_win）；诊断插桩已全数还原（grep [PHASEB-PARSER diag]=0、DiagAssertNoZeroRows=0、panic 判词逐字还原）。

## 十、主线程合入复验（2026-09-06，收割追加）

phaseb_parser_w2.patch git apply 干净落地主树；配对烤机 m10=m11=e12e713f93504a61b89d76050c792297b0d24c9b21fab6eb8fe1aefd32b1c2ca（rc=0，239/264s）；全门认证 rc=0——四夹具 4/4、探针区 **9 绿**（+probe_break/+probe_continue 翻绿）/10 红（defer/match 判词已按本线刷新至前移墙）/0 STALE，树峰 978,763,776B < 1GiB。主树现役认证驱动自此为 e12e713f。剩余 10 红中 2 件判词已前移至 BodyIR/typed 域（WHENBLOCK 线与后续 typed 域施工的正靶）。
