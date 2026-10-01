# Phase B 预研报告（kernel_driver_w2 战役 · 只读侦察 · 2026-09-04）

任务：找回 11 种语言特征清单原文、审计覆盖现状、产出 Phase B 工作分解与验收夹具规格，使 v6 收官当天可派实现线。
侦察方式：纯只读。未改 src/**、未改 docs/**、未烤机、未运行驱动（租约归 wall142）。

---

## 一、特征清单原文定位

**唯一权威出处**：`/Users/lbcheng/cheng-lang/docs/pure-cheng-kernel-closure-plan.md`（2026-09-03）§Phase B（L45-79）。

- L11 现状快照：`语言特征覆盖 | ~15/30 种 | 6 种 parse 缺失 + 5 种管线缺臂 + 1 种未测`
- L21：`Phase B: 语言特征实现（parse 层 6 种 + 管线层 5 种）`
- L79 验收定义：`每特性一个最小探针加入 user_path_gate.sh 基线；全部特性探针全绿 = Phase B 完成`
- L58-65 实现流程约束：每特性走 formal-spec 语法定义 → parser.cheng → typed_expr.cheng → lowering_plan.cheng → primary_object_plan.cheng → 回归探针六步垂直切片，「是语言特性，不是 bug」。

核查过 docs/cheng-minimal-kernel-plan.md、docs/memory-time-limits-plan.md、VERIFY.md、verify_append/ 54 份、design/bake_opt_design.md：**均无第二版本清单**（"kernel 使用量"统计数字仅见于 pure-cheng plan 本身，普查明细表未入库——面数预估只有 plan 里的代理日，无逐特征面数）。

### 清单逐条摘录

B1 parse 层缺失（6 种）：

| # | 特征 | kernel 使用量 | plan 实现范围 | plan 预估 |
|---|---|---|---|---|
| 1 | while loop | 16 文件/863 次 | parser 循环体解析 + typed_expr while 节点 + BodyIR 循环 lowering | 2-3 日 |
| 2 | for loop | 31 文件/3,398 次 | parser for-in 解析 + typed_expr 迭代器 + BodyIR 循环 | 2-3 日 |
| 3 | closure/lambda | 5 文件/20 次 | parser 匿名 proc + typed_expr 闭包捕获 + BodyIR | 2-3 日 |
| 4 | try/except | 4 文件/7 次 | parser 异常处理 + typed_expr + BodyIR EH 模型 | 3-5 日 |
| 5 | tuple type | 6 文件/15 次 | parser tuple 类型 + typed_expr tuple 操作 | 1-2 日 |
| 6 | enum 表达式 | 10 文件/21 次 | parser enum 成员表达式 + typed_expr enum 值 | 1 日 |

B2 管线层缺臂（5 种）：

| # | 特征 | kernel 使用量 | plan 缺臂域 | plan 预估 |
|---|---|---|---|---|
| 7 | sizeof | 10 文件/1,010 次 | typed_expr nested call | 0.5 日 |
| 8 | match/case | 9 文件/56 次 | typed_expr value-def producer | 1-2 日 |
| 9 | when | 9 文件/145 次 | typed_expr for-range 绑定表 | 0.5-1 日 |
| 10 | generic[T] | 4 文件/122 次 | typed_expr node authority | 1-2 日 |
| 11 | assert | 7 文件/120 次 | 待重测定性 | 0.5-1 日 |

附注：清单外第 12 种="1 种未测"。按排除法最可能候选是 **defer**（src/tests/t_defer.cheng 探针件已在 ce469ed71 入库，parser 有 NormalizedExprDeferStmt+inline-suite 关键字臂，tests 里另有 cold_defer_semantics_smoke/cleanup_cfg_defer_contract_smoke，但四夹具 userpath 未端到端测过）。普查明细表未入库，此条为推断，实现线开工前应先重测确认。

---

## 二、覆盖现状审计

### 2.1 战役侧结论（wall126-142 + 在树 diff）

- verify_append w126→w141 全部为**管线通用臂**：cleanup_cfg（wall126b/129/130/131/132/140/141）、ownership_drop_ir 流格（wall141 现墙 `captured-old release authority mismatch`）、body_ir_access、exact_def_freeze/identity/derive、primary_object_plan、compiler_csg。**零特征专属实现**。
- `git diff HEAD --stat`：src/core/lang 仅 typed_expr.cheng(+231)/typed_expr_frag_codec.cheng(+46) 在动，且 hunk 全是 value-def ownership authority（typedExprIrValueDefinitionOwnershipMatchesNode 系）；**parser.cheng 零触碰**。其余在树改动（cleanup_cfg +496、body_ir_access +740、bootstrap/cheng_cold.c +2122、user_path_gate.sh +606 等）全为管线/工具臂。
- **"顺带覆盖"的真实含义**：110+ 面墙修把 ownership/exact-def/regalloc/cleanup 的通用审计臂补齐了，未来特征代码流经这些段时不再撞同批墙——但**不减** Phase B 各特征自身的 parse/typed_expr/lowering/primary 专属臂工作量。
- 四夹具（ordinary/call_fixture/cold_nested/v6，已读全文）不含 11 特征任何一种，故战役对特征覆盖的直接贡献为零；基线 tsv 现态：ordinary 0/0、call_fixture 0/1 绿，cold_nested(1, cleanup_cfg)/v6(2, TypeId missing) 在飞。

### 2.2 逐特征树内实测（垂直切片四层：parser.cheng → typed_expr.cheng → lowering_plan.cheng → BodyIR/primary）

| # | 特征 | 清单判语 | 树内实测证据 | 裁定 |
|---|---|---|---|---|
| 1 | while | parse 缺失 | parser 已有 `NormalizedExprWhileStmt` kind 且有产出点(:5890)、inline-suite 关键字臂(:5360/:5574)；typed_expr 识别(:57243+，hasControlStatement)；**lowering_plan 0 处 While**；BodyIR 循环分析基建已在（src/core/ir/body_ir_loop.cheng：header/latch/back-edge/span 全套）+ BodyControlEdgeLoopBack 控制边 | **部分**（parse+识别在；循环 CFG 生产/lowering/审计臂缺） |
| 2 | for | parse 缺失 | parser 有 `NormalizedExprForStmt` + for-in 头解析(:4987)；typed_expr hasForStatement(:57491)；lowering 0 处 For | **部分**（同上，range 迭代降级缺） |
| 3 | closure/lambda | parse 缺失 | parser **无**匿名 proc 表达式解析（`proc (` 0 处；行首 `proc` 在非迁移语法下报 unsupportedKeyword :35797）；但 typed_expr 已有 `TypedExprIrOpClosure` op + 捕获行模型（capture rows/captureCount 全套 :1446/:3006/:3665-3765） | **部分**（typed_expr 捕获模型在；匿名 proc parse 全缺） |
| 4 | try/except | parse 缺失 | parser 有 `NormalizedExprTry` kind + TryPostfixQuestion detail（表达式/postfix `?` 形）且 typed_expr 有 3 处消费(:9665/:9914/:51882)；**块语句形 `try:`/`except` 子句 0 处**（except 仅 1 处注释）；BodyIR 无 EH op | **部分偏未动**（表达式形在；块语句形+EH 模型全缺——t_try 用的恰是块语句形） |
| 5 | tuple type | parse 缺失 | parser 已有 tuple[...] 类型语法+字段表（:6331/:18100 "tuple field list missing" 诊断）；cold 链认 tuple 基名；typed_expr 9 处；值构造/字段取/ABI 臂未见 | **部分** |
| 6 | enum 表达式 | parse 缺失 | parser enum 类型 metadata 全在（enumValueNames/Types/Ordinals 表 :1590-1593/:1828-1830）；成员值表达式 `Status.Ok` 专属臂未见 | **部分**（类型层在；值表达式缺） |
| 7 | sizeof | 管线缺臂 nested call | typed_expr **已有 sizeof→常量折叠**（:22859-22863 注释明言"folding keeps any expression containing it on the node-eval path; without this the call-form node build fails on sizeof"），git -S 证实 initial commit 即在，非本战役产物 | **已覆盖（待重测确认）**——plan 写于定性前，nested-call 恰是折叠覆盖的形状 |
| 8 | match/case | typed_expr value-def producer | parser 有 MatchStmt/CaseStmt kind；typed_expr 识别(:57031-57304)；**lowering 0 真臂**（grep 命中全是 AllocatorMatches 假阳性）；value-def producer 臂未见 | **部分**（parse+识别在；producer+判定树 lowering 缺） |
| 9 | when | typed_expr for-range 绑定表 | parser 仅关键字识别(:14160)，**无 WhenStmt AST kind**；typed_expr 0 处 | **未动** |
| 10 | generic[T] | typed_expr node authority | parser 500 处/typed_expr 363 处 generic 引用，genericCount 列贯穿元数据（审计面 :978 genericCount==0 门）；node authority 臂未见 | **部分**（声明/计数层厚；权威臂缺） |
| 11 | assert | 待重测定性 | parser builtin callee 表含 assert(:6262)；typed_expr 10 处引用；端到端未测（t_assert.cheng 探针在库未跑门） | **部分**（维持"待重测"） |

**覆盖分布总口径：1 已覆盖（sizeof，待重测）/ 9 部分 / 1 未动（when）；清单外 defer 推断为"1 种未测"候选。**

与 plan 出入点（实现线需知）：
1. plan 把 while/for 归"parse 缺失"——实测 parse kind 与关键字臂已在，真正缺口在**循环语义生产**（typed_expr 循环节点→BodyIR 循环块→审计臂），工作量重心后移，parse 层工作量比 plan 预估小。
2. sizeof 大概率只需重测定性（0.5 日上限），可能直接销账。
3. closure 的 typed_expr 捕获模型已存在，缺的是匿名 proc 前端——plan 的"parser+捕获+BodyIR"三段中中段已备。
4. try/except 的表达式形已占位，块语句形是净新增，BodyIR **无 EH op 族**——plan 3-5 日预估偏乐观，EH 是 11 特征里唯一需要 BodyIR 新 op 语义的。

---

## 三、Phase B 工作分解（gsd 粒度：files/action/verify/done）

面数口径：沿用战役"面墙"单位（1 面=1 次判词→定性→修→验周期）。plan 总预估 10-20 代理日 ≈ 55-100 面，与下表合计一致。

### 依赖总图与并行分组

```
前置0: user_path_gate.sh 探针位扩展（1-2 面，收官当天即可做，与特征线无文件冲突）
A组(轻量验管线): enum成员表达式 → tuple → sizeof重测   [可立即开]
B组(循环族):     while → for                           [串行链，for依赖while的循环CFG生产]
C组(语句族):     match/case ∥ when ∥ assert            [三线可并行]
D组(权威族):     generic[T]                            [依赖typed_expr.cheng空闲]
E组(重型):       closure ∥ try/except                  [最后开，依赖B组循环CFG与函数调用全链稳]
```

文件互斥纪律：parser.cheng 为 A/B/C 组共用地盘（窗口错开+rebase）；typed_expr.cheng 是万能热点（四夹具收官线在树 +231 未提交，**必须等收官落地冻结后再开工**）；lowering_plan.cheng 属 B 组主战；BodyIR op 族新增（EH/循环）动 core_types.cheng 需全树烤验。

### 逐特征四元组

**0. 前置：回归门探针位**
- files: tools/user_path_gate.sh, docs/campaigns/2026-08-31-kernel-userpath/user_path_baseline.tsv
- action: 现门硬编码"四夹具契约"（validate_baseline 强制 4 行/4 名），扩展为"四夹具+特性探针区"两段式；探针行同 tsv 五列格式
- verify: 四夹具原样 4/4 不回归 + 探针区空转 rc=0
- done: 特征夹具可逐条入库跑门
- 面: 1-2

**A1. enum 表达式**（最先做：最轻，兼当"特征垂直切片流程"的管线验证件）
- files: src/core/lang/parser.cheng（成员值表达式臂）, typed_expr.cheng（enum 值节点）, lowering_plan.cheng, primary_object_plan.cheng
- action: `Status.Ok` 点表达式解析为 enum 成员值（复用在库 enumValueNames/Ordinals 表查 ordinal）；typed_expr 发常量节点；下游按 int 常量走既有通道
- verify: t_enum 夹具 compile=0 run=0（期望 0）
- done: 探针入基线绿
- 面: 2-4；依赖: 无

**A2. tuple type**
- files: parser.cheng（值构造 `Pair(x:1,y:2)` 臂）, typed_expr.cheng（tuple 构造/字段取节点）, lowering_plan.cheng, core_types.cheng（布局复核）
- action: tuple 类型语法已在（tuple[..] 与缩进字段表）；补构造表达式+字段投影语义；布局=成员序拼装（严禁字段 offset 摊平穿层，按 AGENTS 约束逐跳核类型）
- verify: t_tuple compile=0 run=0（期望 p.x=1）
- done: 同上
- 面: 4-8；依赖: 无（与 A1 同窗口错开 parser.cheng）

**A3. sizeof 重测定性**
- files: 无新改（预期）；若重测挂则 typed_expr.cheng nested-call 臂
- action: 用现驱动烤版跑 t_sizeof 探针定性；绿则销账，挂则按挂点补臂
- verify: t_sizeof compile=0 run=0
- done: 清单第 7 项闭环
- 面: 0-2；依赖: 收官驱动可运行

**B1. while loop**（循环族地基，11 特征里最高杠杆）
- files: typed_expr.cheng（while 循环节点+循环 scope 生产）, lowering_plan.cheng（循环 CFG：header/latch/back-edge 生产，消费 body_ir_loop 既有分析形状）, core_types.cheng（如需循环控制边 op 复核）, body_ir_access/cleanup_cfg/ownership_drop_ir（循环块的审计臂顺墙补）
- action: parse 侧基本现成；主战场=typed_expr 把 NormalizedExprWhileStmt 生产为带循环 scope 的节点 → lowering 产 header/cond/body/latch 四块 + BodyControlEdgeLoopBack 回边 → 既有 CFG/cleanup/exact-def 审计对循环块的臂逐墙清
- verify: t_while compile=0 run=0（期望 i=3）；加一轮 t_while+t_普通混合体防交互墙
- done: 探针绿+四夹具零回归
- 面: 8-14；依赖: 收官落地（typed_expr.cheng 冻结）

**B2. for loop**
- files: typed_expr.cheng（for-in 绑定+range 迭代降级）, lowering_plan.cheng（降为 while 形循环）
- action: for-in 语义糖降级：range [0..<n) → 计数循环复用 B1 的循环 CFG 生产；迭代变量=普通 local 绑定表（plan 所指"for-range 绑定表"缺臂域）
- verify: t_for compile=0 run=0（期望 total=10）
- done: 同上
- 面: 6-10；依赖: **B1 串行在后**

**C1. match/case**
- files: typed_expr.cheng（value-def producer 臂——plan 点名缺臂域）, lowering_plan.cheng（判定树降为 if/比较链，复用既有分支 op）
- action: case 判别值+of 臂生产 value-def；枚举/整型判别先行（kernel 56 次主力形状）；降级为比较链不新增 BodyIR op
- verify: t_match 夹具**需补 main()**（现件缺失）后 compile=0 run=0
- done: 同上
- 面: 5-9；依赖: 无强依赖（建议在 B1 后做，借循环热身后的审计臂）

**C2. when**
- files: parser.cheng（新增 WhenStmt AST kind——现连 kind 都没有）, typed_expr.cheng（编译期条件求值）
- action: when 语义=编译期分相：defined(...) 已知则只留活臂；produced AST 折叠进条件所在的 scope
- verify: t_when 修型后（隐式 result 形需复核，建议改显式变量）compile=0 run=0
- done: 同上
- 面: 3-6；依赖: 无

**C3. assert**
- files: 定性后定（可能仅 typed_expr.cheng 断言降级臂）
- action: 先重测（清单原判"待重测"）：assert(cond, msg) 降级为 if !cond: panic/exit 形；绿则销账
- verify: t_assert compile=0 run=0
- done: 同上
- 面: 1-3；依赖: 无

**D1. generic[T]**
- files: typed_expr.cheng（node authority 臂——plan 点名缺臂域）, 可能 compiler_snapshot/实例化单态化路径
- action: 显式实例化 `identity[int32](42)` 的 typed_expr 节点权威绑定（genericCount>0 声明的实例化形状）；先做显式实例化（kernel 122 次主力形），隐式推导延后
- verify: t_tpl compile=0 run=0（期望 42）
- done: 同上
- 面: 6-12；依赖: typed_expr.cheng 空闲窗口（建议收官落地后与 B 组并行另一代理）

**E1. closure/lambda**
- files: parser.cheng（匿名 proc 表达式解析）, typed_expr.cheng（捕获物化，复用在库 TypedExprIrOpClosure+capture rows）, lowering_plan.cheng+primary_object_plan.cheng（闭包环境分配+调用约定）
- action: `proc (a: int32, b: int32): int32 = a + b` 表达式 parse → 闭包对象（code ptr+捕获 env）→ 调用点解引用；捕获行模型已在，补前端与物理化
- verify: t_closure compile=0 run=0（期望 3）；扩件测捕获外部变量形
- done: 同上
- 面: 8-15；依赖: B1（函数全链稳）后开

**E2. try/except**
- files: parser.cheng（try:/except 子句块语句解析）, typed_expr.cheng（EH scope）, core_types.cheng+body_ir（**EH op 族新增**——11 特征唯一动 BodyIR 语义的）, primary_object_plan.cheng（landingpad/展开表发射）
- action: 块语句 try 解析（表达式形已占位可参照）→ EH 模型裁定（建议最小实现=表驱动 landingpad，禁启发式兜底）→ cleanup_cfg 对 EH 边的交互审计
- verify: t_try compile=0 run=0；扩件测 except 命中形（现件只有未命中形）
- done: 同上
- 面: 12-20；依赖: 最后开（B1+E1 后）；plan 预估 3-5 日按 EH 新语义上修为 4-6 日

### 面数总表

| 组 | 特征 | 面数 |
|---|---|---|
| 前置 | gate 探针位 | 1-2 |
| A | enum / tuple / sizeof | 6-14 |
| B | while→for | 14-24 |
| C | match/case / when / assert | 9-18 |
| D | generic[T] | 6-12 |
| E | closure / try-except | 20-35 |
| **合计** | 11 特征+前置 | **56-105（中位约 75-80）** |

与 plan 10-20 代理日吻合（按 3-5 线并行 1-2 周墙钟）。风险最大项：try/except（BodyIR EH 新语义，plan 低估）、closure（调用约定+捕获物理化）；最顺 items：sizeof/assert（大概率重测销账）。

---

## 四、验收夹具规格（只写规格，未落盘）

总惯例（沿 v6_direct1_repro 在案纪律）：每件自带语义自查，main 返回 int32，错误编码 return 100+k；零外部依赖、零 echo（除对齐 cold_nested 惯例可选 pass/fail 行）。**现成基底**：src/tests/t_while/t_for/t_closure/t_try/t_tuple/t_enum/t_sizeof/t_match/t_when/t_assert/t_tpl/t_defer 12 件已在库（ce469ed71 入库），Phase B 夹具=以 t_* 为蓝本升级为"含期望值自查"的验收件，不是从零写。

| 特征 | 夹具规格（基于 t_* 修订） |
|---|---|
| while | t_while 已合规（while i<3 循环 3 次，return i=3）。升级：加嵌套 while + break 各一，期望值编码 return |
| for | t_for 已合规（for i in 0..<5 累加=10）。升级：加 for-in seq 迭代一件（kernel 主用形） |
| closure | t_closure 保留（匿名 proc 直接调用=3）；扩件二：捕获外部 local 的 lambda，期望值含捕获差分 |
| try/except | t_try 现件只有未命中形且用 discard——修订：try/except 命中形 raise+捕获 return 编码值；未命中形不进 except 分支 |
| tuple | t_tuple 已合规（Pair(x:1,y:2) 取 p.x=1）；扩件：嵌套 tuple 字段投影一件 |
| enum | t_enum 现件未消费 s——修订：`Status.Ok`/`Status.Err` 成员值参与比较/返回 ordinal，期望值编码 |
| sizeof | t_sizeof 保留（int32 折叠=4）；扩件：object 类型 sizeof+嵌套表达式内 sizeof（nested-call 形，plan 点名臂） |
| match/case | **t_match 缺 main() 必补**：case enum 判别两 of 臂+else 臂，各臂返回不同编码值 |
| when | t_when 用隐式 result——修订为显式 var；defined() 命中臂留活、未命中臂消除；期望值证明只活臂生效 |
| generic[T] | t_tpl 已合规（identity[int32](42)）；扩件：泛型 object 一件（kernel 122 次含类型族） |
| assert | t_assert 保留（真断言通过=0）；扩件：假断言触发非零退出形（rc 断言反向验证） |
| defer（清单外） | t_defer 保留（return 42 前 defer 不改返回值）；顺带定"1 种未测"销账 |

每件入库序：随对应特征 done 落 user_path_baseline.tsv 探针区（五列格式同现基线），全绿=Phase B 验收闭合（plan L79 原判）。

---

## 五、开工建议（收官日衔接）

1. v6 收官当天：先落前置0（gate 探针位扩展，1-2 面，与特征线零文件冲突），同时 A 组三线即开（enum 最先，兼验证垂直切片流程全通）。
2. typed_expr.cheng 在树 +231 未提交态是 D/B 组硬前置——确认收官线 commit 冻结后再放行。
3. 开工前先跑一轮 11 特征探针重测（用收官驱动烤版逐件跑 t_*，只读运行）：预期 sizeof/assert 部分直接销账、while/for 缺口定性收窄，面数预估可下修 5-10 面。
4. "1 种未测"普查明细表缺失——建议实现线首日把 30 种全量表补进 pure-cheng plan（当前只有 ~15/30 的约数），防 Phase B 完成判据漂移。
