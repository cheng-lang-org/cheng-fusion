# VERIFY_phaseb_bc_append.md —— kernel_driver_w2 PhaseB-B/C 实现线（while/for/match/assert/when 五特征 kernel 链）2026-09-05

锚点 commit=69817b8b2；在途 hunks（[phaseB-parser]/[phaseB-enum]/[phaseB-enum-schema]/[phaseB-enum-csg]/[phaseB-csg]）原样保留，零 revert、零 commit、零分支。树上另有他线检查点 commit 73debaef2（11:49 由并行线落，把本线当时未清理的 zz_bc_probe_* 探针件一并扫入；本线已从工作树删除全部探针件，现存 18 条 `D src/tests/zz_bc_probe_*` 即本线清理痕迹，非 revert 他线工作）。**src/core/docs 本线零改动；patch 为空（零落地 hunk），完整移交。**

## 一、烤机台账（2 轮，预算 5）

| # | 车头 | 产物 | 用途 |
|---|---|---|---|
| 1 | cheng_w126 + w139 脚本 + kernel_manifest_head_git.cheng，CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/phaseb_bc/cold_cache CHENG_ENTRY_CACHE=0 | /tmp/oob_ab/phaseb_bc/kdrv_bc0（sha256 2e126acb…，186813584B） | 当前树（=73debaef2 内容）kernel 链基线 |
| 2 | 同上，root=git archive 69817b8b2 副本 | /tmp/oob_ab/phaseb_bc/kdrv_head（186516464B） | 锚点干净树 kernel 链对照（归因在途 hunks vs 锚点预存） |

秒级门基线雷 codegen_a64_fill_units.cheng:471 未触发、未追。`os atomic tree: parent lease unavailable` 判词为并行线 flock 竞争噪声（带退避重试即消），非墙。

## 二、五特征 kernel 链判定（一句话版）

- **while**：RED。循环 CFG 生产/闭环（PrimaryBodyIrBuildWhileLoopHeader/CloseWhileLoop/loopBreakPool）在 primary_object_plan 已存在且裸 `while true:`/`while v<100` 形能出 exe；两真墙见下。
- **for**：RED。`..<` range 表达式无 parser 节点（receipt 拒 `surface=..< rootNode=-1`），数组形未及测。
- **match**：RED。`PARSER_BRANCH_WITHOUT_IF`（case-else 吞并墙，与准备线判词一致）。
- **assert**：RED。`assert(cond,msg)` 降为 TypedExprIrStmtCall，callee 无法解析 → call 臂 else 兜底 invalid op（detail=63）→ ingress BodyIR ownership UnknownOp 硬拒。
- **when**：RED。`when` 无语句产线（NormalizedExpr 无 WhenStmt kind、typed 前缀播种表无 "when "）→ TypedExprIrStmtUnsupported → invalid op detail=64。

四夹具 functional 基线（kdrv_bc0）：ordinary 0/0、call 0/1、cold_nested 0/0=pass、v6 0/0 全绿，零回归。

## 三、墙地图（本线核心产出：逐墙归因 + 修复落点）

以下全部经 **kdrv_bc0（当前树）+ kdrv_head（锚点树）双驱动复现一致** → 均为锚点 69817b8b2 预存 kernel 链缺口，非在途 hunks 回归；冷链 cheng_w126 同输入全绿作交叉对照（链条差异在 kernel 链 receipt/CSG 权威门更严）。

### W1（while/for/match 通杀）带初始化绑定的 LocalRef 缺 exact TypeId
- 判词：`compiler csg: typed-node exact producer TypeId missing node=N op=38 o0=-1 o1=-1`（op38=TypedExprIrOpLocalRef）。
- 最小复形：`var v: int32 = 1` + 任意读（w7: `if v == 1`）。对照全绿：`let a: int32 = 1`+读（w9）、`var v: int32`（无 init）+`v=1`+读（w10）→ 定性：**var 带初始化绑定读 = 红，let/无 init var = 绿**。
- 根因链：parser `var x: T = init` 的 lexical binding introduction=**Initializer**（parser.cheng :23611），而 typed_expr `typedExprIrDeclarationLocalTemplateStructuralTypeId`（wall43，:20648）与 `typedExprIrRegisterDeclarationLocalGroups`（:5601+）都只认 introduction==**Declaration** → Initializer 绑定无 decl-local 组行 → LocalRef 的 wall43 模板解析返 -1 → compiler_csg 精确生产 TypeId 门（:34236）hard-fail。
- 修复落点（移交）：typed_expr 给 Initializer 绑定补 TypeId 权威通道。已验证可行路径：语句行 SoA 已有 `statements2_bindingNameIds`（:1322）/`statements2_bindingTargetDefinitionRows`（:1375，decl-init 端在 :60056 调 AppendValueDefinitionsForBindingInitializer 后回填）/`TypedExprValueDefinitionDefiningTypedNodeIndexAt`（:4761）→ 在 TypedExprIrAddRhsLocalRefNode（:20790）wall43 失败时按（当前函数+名+definitionRow→defining node TypeId+resultType intern 全等）唯一命中解析；同名多命中保持 -1 fail-closed。注意此函数族与 [phaseB-csg] 在飞 hunk（TypedExprIrAppendValueDefinitionsForBindingInitializer :6257 区）邻接，落地前对齐窗口。

### W2（while）`break` 语句行令 kernel 链 cached 层读 panic
- 判词：`parser value expr: prebound statement root has no role`（parser.cheng :31948）。任意含 `break` 的文件即触发（w15 顶层裸 break 也红），与循环无关、与嵌套无关；continue 未测但同族（NormalizedExprBreakStmt/ContinueStmt 均无 ParserValueExprNormalizedStatementRole 映射，:31690）。
- 根因未定谳（context 耗尽停手）：BindStatementRoots 首循环出现「root≥0 且 role=Invalid」的行；已排查 parser.cheng 全部 16 处 valueExprRootNodeIndex 写点均同时置 role，事件注册全部拒 Invalid role——剩余嫌疑在 cached 读路径（ParserReadNormalizedExprLayer…CachedWithCurrent…）中某处对 seed 行的预绑。**冷链同输入绿、kernel 双驱动红**，差异必在 kernel 链独走的读路径段。
- 修复建议（移交）：给 break/continue 补正式 role 通道（enum 尾部追加 ParserValueExprStatementLoopExit/LoopNext + BindStatementRoots 显式认领臂），或在 cached 读路径定位越权预绑写点。需一次带诊断的烤机（本线预算耗尽）。

### W3（for）`..<` 无 parser 节点
- 判词：`compiler parser receipt: normalized expression parser node missing exprIndex=1 kind=2 line=3 surface=..< rootNode=-1 role=0`。
- 根因：value-expr 树表达式文法无 range 算子（`..<`/`..`）节点产线；for 头 LoopSource 事实（role=LoopSource 注册在 parser.cheng :24675）找不到同锚节点。数组形（`for x in xs`）未及独立测，疑被 W1 连坐（t_for 的 xs 为带初始化绑定）。
- 修复落点（移交）：parser 值表达式补 range 二元节点（kind/操作符表 + LoopSource 根绑定），typed 侧降级计数循环复用既有 while CFG（primary :57554 While 臂 + :57532 For 臂已存在，PrimaryBodyIrBuildForRangeLoop 已有真身）。

### W4（match）case-else 吞并墙（预存，与准备线判词一致）
- 判词：`PARSER_BRANCH_WITHOUT_IF token_index=34 …`。修法沿用 parser 线定性（早退分支排除 headerKind==ParserValueTokenCase）；下游 enum 判定表示 [phaseB-enum*] 线已提交（73debaef2 自述 enum 端到端全绿），match 臂落地后 primary 判定树臂需核（primary_object_plan 有 TypedExprIrStmtCase 分类位）。

### W5（assert）callee 不存在 → invalid op detail=63
- 判词：`ownership body ir production: ingress BodyIR ownership invalid code=1(UnknownOp) site=2 op_kind=0 … op_operands=3 a0=4 a1=63 a2=0`（a0=4=TypedExprIrStmtCall）。
- 修复落点（移交）：primary_object_plan :55415（call 臂 else，detail=63 兜底）前加 `assert` 识别臂：callCallee=="assert"，按顶层逗号切 callArgsText → condText/msgText；cond 走 PrimaryBodyIrEmitConditionOps（:13077）+ cbr 双块（ternary 臂 :23100 区有同构样板）；false 块发 C 运行时出口调用（打印 msg + 非零退出；t_assert_fail 合同 rc=1），块尾 br 归join 保 CFG 闭合。spec 缺口照旧：assert 全文零定义，实现即合同。

### W6（when）语句本体双链零产线（与准备线判词一致，任务书授权 fallback 生效）
- 判词：`… op_operands=3 a0=0 a1=64 a2=0`（a0=0=TypedExprIrStmtUnsupported）。
- spec 缺口：when 语句语义条目全文空白（defined( 零命中）→ 按任务书授权实现 **if-else 链同构形**（when/elif/else 结构与 ifStmt 同构降级），spec 缺口移交 spec owner，不发明编译期分相语义。
- 修复落点（移交）：parser 行扫描族加 "when" 头（NormalizedExpr 无 WhenStmt kind → 授权映射为 NormalizedExprIfStmt 同构折叠，:5870 seeding + :24093 arm13 + :25349/:25408 属同一关键词族），typed/primary 零新臂即可被既有 if 通道消费。

## 四、纪律自查

- 动任何 src/core 文件前均经 git diff 核对在途 hunks；本线最终未落任何 src hunk（wall43 臂与 assert 臂均已设计到函数级，因预算/上下文耗尽停手，见上移交）。
- 探针件 zz_bc_probe_{when1,when2,if1,w1..w16} 全部删除（其中 18 件被他线检查点 73debaef2 扫入版本库，工作树现存 D 状态为本线清理痕迹）；/tmp/oob_ab/phaseb_bc/head_tree 归档副本已删除；临时目录绑定本任务，冷缓存 /tmp/oob_ab/phaseb_bc/cold_cache、cold_cache_head 随任务清理。
- 全程零 commit、零分支、零 revert；烤机 2/5 轮。
