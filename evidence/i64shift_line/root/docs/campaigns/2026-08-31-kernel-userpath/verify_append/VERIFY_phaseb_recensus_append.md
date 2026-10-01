# VERIFY_phaseb_recensus_append.md —— Phase B 缺口重普查线（PHASEB-RECENSUS）2026-09-06

锚点=合入态主树 /Users/lbcheng/cheng-lang（git 73debaef2 + 三补丁 + 在途 hunks，见 VERIFY_merge_0906_append）。驱动=/tmp/oob_ab/merge_0906/run_m2/kernel_driver_merge（合入态烤成品，未重烤）。方法=纯只读 + 最小正探针驱动实测；探针件 `docs/campaigns/2026-08-31-kernel-userpath/fixtures/probes_recensus/probe_*.cheng`（19 件，每件单一特征 + `<name>=pass` 自查判词），gate 同款调用形态（system-link-exec + in-src 暂编即删 + 全禁缓存 + 任务 scratch scope 生命周期），与 GEN2-LADDER 烤机窗错峰串行。零源码改动、零 git commit、零分支。

**旧清单（pure-cheng-kernel-closure-plan.md Phase B，定稿 9/3）大半已过期**：12 特征中 4 项已绿（while/enum/tuple/assert + 清单外 varinit），5 项原定性已变质（closure 已非 parse 全缺等）。以下全部为合入态驱动实测终判，非静态推断。

## 一、结论先行

**Phase B 剩余缺口 = 10 红 6 绿（19 探针实测）。** 红缺口归并为 10 面墙，按「使用量 × 缺臂深度」派单序：

| 序 | 墙 | 覆盖探针 | 合入态判词（逐字） | 相 |
|---|---|---|---|---|
| 1 | **W2 role 预绑通杀墙**（break/continue/defer 三关键字连坐） | probe_break / probe_continue / probe_defer | `parser value expr: prebound statement root has no role` | parse |
| 2 | **for range 节点墙**（`..<` 无 parser 值表达式节点） | probe_for | `compiler parser receipt: normalized expression parser node missing exprIndex=1 kind=2 line=4 surface=..< rootNode=-1 originNode=-1 role=0` | parse/receipt |
| 3 | **when/block 语句产线墙**（StmtUnsupported detail=64，同族两件） | probe_when / probe_block | `ownership body ir production: ingress BodyIR ownership invalid code=1 ... a0=0 a1=64`（a0=0=TypedExprIrStmtUnsupported） | lowering/BodyIR |
| 4 | **match case-else 吞并墙** | probe_match | `PARSER_BRANCH_WITHOUT_IF token_index=29 token_kind=15 ...` | parse |
| 5 | **closure 匿名 fn 结构值墙** | probe_closure | `typed expr: unsupported structural value case=12 parser_kind=26 surface=fn (a: int32, b: int32): int32 = a + b` | typed |
| 6 | **generic node authority 墙** | probe_generic | `typed expr: node value/share authority is incomplete` | typed |
| 7 | **try/except 块语句 parse 墙** | probe_try | `compiler csg: normalized decl read failed: ... parser type syntax: field declaration type missing statement_offset=82 statement_offset=61` | parse |
| 8 | **seq FieldGet 布局权威墙**（清单外） | probe_array | `compiler csg: FieldGet layout is not in exact authority node=14` | csg |
| 9 | **obj_ctor 合入缺口**（实现已在 objreg 线克隆，未进主树） | probe_objctor | `lowering body ir: canonical CallId identity missing`（=objreg 线进场原判词；主树 primary_object_plan.cheng grep `[phaseB-objreg]`=0 且「object 伪别名豁免」代码不在树） | lowering |
| 10 | **sizeof nested-call 墙** | probe_sizeof | `typed expr: structural nested call argument did not build`（compile=1） | typed |

**绿（入 user_path_gate 探针区基线候选，可直接登记）**：probe_while / probe_enum / probe_tuple / probe_assert / probe_varinit / probe_mod 全部 compile=0 run=0 且 stdout 自查判词 `<name>=pass`。

## 二、旧清单 12 特征逐项终判（合入态实测 vs 9/3 旧判）

| # | 特征 | 旧判（9/3 plan） | 旧使用量 | 重普查使用量（src/core，2026-09-06） | 合入态终判 | 探针证据 |
|---|---|---|---|---|---|---|
| 1 | while loop | parse 缺失 | 16 文件/863 | 204 文件/3162（`while `） | **绿** | probe_while 0/0 `probe_while=pass`（无 init var + 倍增循环） |
| 2 | for loop | parse 缺失 | 31/3398 | 345/13578（` for `） | **红**（range 节点墙，§一序 2） | probe_for compile=2 |
| 3 | closure/lambda | parse 缺失（parser 无匿名 proc） | 5/20 | 1/1（`fn (`） | **红**（定性变质：parser 已产节点 parser_kind=26，typed 结构值通道无 case=12 臂——缺口从 parse 前移到 typed） | probe_closure compile=1 |
| 4 | try/except | parse 缺失（表达式形在，块形缺） | 4/7 | 62/263（`try:`）；except 2/2 | **红**（块语句形 parse 墙，§一序 7） | probe_try compile=2 |
| 5 | tuple type | parse 缺失 | 6/15 | 7/41（`tuple[`） | **绿**（PhaseB-tuple-snap/csg/enum-schema 系线收官后全通） | probe_tuple 0/0 `probe_tuple=pass` |
| 6 | enum 表达式 | parse 缺失 | 10/21 | .Err 10 文件/128、.Ok 3/6 | **绿**（PhaseB-enum-schema/enum-cold 收官） | probe_enum 0/0 `probe_enum=pass` |
| 7 | sizeof | 管线缺臂（recon 推断已覆盖待重测） | 10/1010 | 36/1841（`sizeof(`） | **红**（typed nested-call 墙；recon 的"已覆盖"推断翻案——折叠臂只覆盖独立形，`int32(sizeof(int32))` 实参形未 build） | probe_sizeof compile=1 |
| 8 | match/case | typed value-def producer 缺 | 9/56 | 29/118（`case `）；`of ` 174/2171 | **红**（墙在更上游：parse case-else 吞并，§一序 4；producer 臂仍未到） | probe_match compile=2 |
| 9 | when | for-range 绑定表缺 | 9/145 | 51/371（`when `） | **红**（连 AST kind 都无，StmtUnsupported，§一序 3） | probe_when compile=1 |
| 10 | generic[T] | node authority 缺 | 4/122 | 12/159（`[T]`） | **红**（判词与旧定性精确对位：node value/share authority incomplete，§一序 6） | probe_generic compile=1 |
| 11 | assert | 待重测定性 | 7/120 | 9/131（`assert(`） | **绿（销账）**（bc 线 W5 detail=63 墙已修；合入态断言真形全通） | probe_assert 0/0 `probe_assert=pass` |
| 12 | defer（清单外第 12 种候选） | 未测 | — | 39/184（`defer:`） | **红**（并入 W2 role 墙族，§一序 1；kernel 链首次实测定性） | probe_defer compile=1 |

**过期修正**：plan 的「B1 parse 层 6 种」中 while 已绿、enum/tuple 已绿；「B2 管线层 5 种」中 assert 已绿、sizeof 仍红（recon 推断翻案）、match 墙实际在 parse。Phase B 真实剩余 = 上表红项。

## 三、清单外伴生/高频形普查（top 7 实测）

| 探针 | 形 | 使用量 | 终判 | 判词/输出 |
|---|---|---|---|---|
| probe_break | `break` | 130 文件/1465 | **红** | `parser value expr: prebound statement root has no role`（与 bc 线 W2 判词逐字一致，墙未动） |
| probe_continue | `continue` | 169/3922 | **红** | 同上（W2 同族首证：continue 与 break 同判词） |
| probe_varinit | `var x: T = init` + 读 | var 57788 声明位 | **绿** | 0/0（bc 线 W1「带初始化绑定 LocalRef 缺 exact TypeId」墙已修——归因 9/5→9/6 间主树吸收的 typed_expr/parser 修复；`var v: int32 = 1` 全形可用） |
| probe_array | seq 字面值 `let xs: int32[] = [...]` + `xs[1]` + `xs.len` | `xs[` 78；`.len` 42793（含全部对象） | **红** | `compiler csg: FieldGet layout is not in exact authority node=14`（seq 行布局权威缺臂；连坐 for 数组迭代形） |
| probe_block | `block:` 语句 | 20/63 | **红** | 同 when 族 `a0=0 a1=64`（StmtUnsupported——block 与 when 共享「语句头无产线」墙形，一次施工可同修两件） |
| probe_mod | `%` 算子 | — | **绿** | 0/0（基本算子通道无缺口） |
| probe_objctor | object 命名构造 | — | **红（合入缺口）** | `lowering body ir: canonical CallId identity missing`；objreg 线在其克隆 r4 已 0/0 `obj_ctor=pass`，主树无其 hunks（grep 证）→ 施工=合入动作非实现 |

## 四、补注：probe_sizeof 判词

补跑实测（同驱动，compile rc=1）：`typed expr: structural nested call argument did not build`。定性：sizeof→常量折叠臂在（recon 证实，独立形 `let a: int32 = int32(sizeof(int32))` 单独可用性未单测，本件红点在 nested call 实参构建）；**作为实参嵌在另一 call 内的 sizeof（`int32(sizeof(int32)) + int32(sizeof(int8))` 形）在 structural nested call 实参通道未 build**。与旧 plan B2 表「sizeof | typed_expr nested call | 0.5 日」精确对位，plan 定性未过期。

## 五、施工元组（gsd 粒度，按 §一排序）

**1. W2 role 预绑墙（break/continue/defer，5571 hits/168 文件，连坐一切含三关键字的循环体——while 虽绿但实用循环形全被它拦）**
- files: src/core/lang/parser.cheng（Role enum 尾部 + BindStatementRoots 认领臂 + cached 读路径预绑写点排查）
- action: 按 bc 线移交设计——Normal izedExpr Break/Continue/DeferStmt 补 ParserValueExprNormalizedStatementRole 映射（新增 LoopExit/LoopNext/Deferred 臂或复用既有 role 族），BindStatementRoots 显式认领；root≥0 且 role=Invalid 的 cached 行 fail-closed 定位
- verify: probe_break/probe_continue/probe_defer 三件 0/0 + 判词行；t_while（var-init+break 混合体）0/0
- done: 三探针入基线探针区绿
- 面: 4-8；档=中

**2. for range 节点墙（13578 hits/345 文件，全库最大户）**
- files: src/core/lang/parser.cheng（range 二元节点 + LoopSource 根绑定）, src/core/lang/typed_expr.cheng（range→计数循环降级）, lowering/primary 消费既有 For 臂（primary PrimaryBodyIrBuildForRangeLoop 真身已在）
- action: `..<`/`..` 值表达式节点产线 + for 头 LoopSource 绑定同锚节点；typed 降级 for-in range 为计数循环（复用已绿的 while CFG）
- verify: probe_for 0/0 + 判词行；扩展件 for-in seq（依赖 §五.8 seq 墙先修）
- done: probe_for 入基线绿
- 面: 5-9；档=中

**3. when/block 语句产线墙（when 371 + block 63 hits，一件修两红）**
- files: src/core/lang/parser.cheng（"when"/"block" 语句头臂）, typed_expr.cheng（when→if 同构折叠消费）
- action: bc 线 W6 授权方案——when 映射 NormalizedExprIfStmt 同构折叠（:5870 seeding + :24093 arm13 + :25349/:25408 关键词族）；block 同族补语句头产线（匿名 block = 透传 suite）；语义=运行期 if 链（编译期分相语义 spec 缺口移交 spec owner）
- verify: probe_when/probe_block 0/0 + 判词行
- done: 双探针入基线绿
- 面: 3-6；档=中

**4. match case-else 吞并墙（case 118 + of 2171 hits）**
- files: src/core/lang/parser.cheng（早退分支排除 headerKind==ParserValueTokenCase）, typed_expr/primary（判定树臂核）
- action: parse 墙清后实测 probe_match；若推进到 typed value-def producer/primary 判定树臂，按 bc 线 C1 元组续作（降级比较链，不新增 BodyIR op）
- verify: probe_match 0/0 + 判词行
- done: probe_match 入基线绿
- 面: 4-8（parse 臂 1-2 面 + 下游臂核 3-6 面）；档=中

**5. generic[T] node authority 墙（159 hits/12 文件）**
- files: src/core/lang/typed_expr.cheng（node value/share authority 臂，显式实例化形先行）
- action: `identity[int32](42)` 实例化节点的 value/share 权威补臂；判词挂点 typed_expr node authority 门
- verify: probe_generic 0/0 + 判词行
- done: probe_generic 入基线绿
- 面: 5-9；档=中

**6. try/except 块语句墙（263 hits/62 文件；EH 是唯一需 BodyIR 新 op 语义的缺口）**
- files: src/core/lang/parser.cheng（try:/except 子句块解析——现挂 type syntax 误读）, typed_expr.cheng（EH scope）, core_types/body_ir（EH op 族）, primary_object_plan.cheng（landingpad 发射）
- action: 先修 parse 误读（except 行被 parser type syntax field 臂吞——判词 statement_offset=82/61），再 EH 模型裁定（表驱动 landingpad，禁启发式兜底）
- verify: probe_try 0/0 + 判词行；扩展命中形 raise+捕获件
- done: probe_try 入基线绿
- 面: 10-18；档=大

**7. closure 匿名 fn 结构值墙（使用量小但 Phase D 闭包自举硬前置）**
- files: src/core/lang/typed_expr.cheng（结构值 case=12 臂 + TypedExprIrOpClosure 捕获物化——capture rows 模型已在）, lowering/primary（闭包环境分配+调用约定）
- action: typed 结构值通道认领 parser_kind=26 匿名 fn 节点；捕获 env 物化与调用点解引用
- verify: probe_closure 0/0 + 判词行；扩展捕获外部变量件
- done: probe_closure 入基线绿
- 面: 6-12；档=中大

**8. seq FieldGet 布局权威墙（连坐 for 数组形与 .len 全族）**
- files: src/core/csg_core/compiler_csg.cheng（seq 行 FieldGet layout authority 臂）
- action: `let xs: int32[] = [...]` 字面值绑定 + `xs[i]`/`xs.len` 读的 csg 布局权威补臂（判词 node=14 FieldGet）
- verify: probe_array 0/0 + 判词行
- done: probe_array 入基线绿
- 面: 3-6；档=中小

**9. obj_ctor 合入动作（非施工，最小成本）**
- files: 主树 src/core/backend/primary_object_plan.cheng（+27 行 [phaseB-objreg] 三 hunk，从 /Users/lbcheng/cheng-f24/anchor_clones/cf_cont 提取）
- action: objreg 线终态 hunks 提取 → 主树 apply → 重烤驱动 → probe_objctor 复验
- verify: probe_objctor 0/0 + `probe_objctor=pass`
- done: probe_objctor 入基线绿
- 面: 1-2（合入+烤机复验）；档=小

**10. sizeof nested-call 实参墙（1841 hits/36 文件，plan 预估 0.5 日维持）**
- files: src/core/lang/typed_expr.cheng（structural nested call 实参通道认领 sizeof 折叠值）
- action: nested call 实参构建时对 sizeof 实参走既有常量折叠值通道（独立形折叠臂已在，判词 `structural nested call argument did not build`）
- verify: probe_sizeof 0/0 + `probe_sizeof=pass`（a=4、b=5 双折叠断言）
- done: probe_sizeof 入基线绿
- 面: 1-3；档=小

## 六、交付与纪律

- 探针件：`docs/campaigns/2026-08-31-kernel-userpath/fixtures/probes_recensus/probe_*.cheng`（19 件）+ run_probes.sh（gate 同款调用形态，可复跑，判词模式未命中自动打 log 尾部）+ recensus_wait_run.sh（烤机错峰包装）。绿件（probe_while/enum/tuple/assert/varinit/mod）可直接登记 user_path_baseline.tsv 探针区（五列格式，第五列 `-`）。
- 实测台账：19 件串行驱动实测，rc 紧邻捕获，判词逐字取自 compile.log；全程与 GEN2-LADDER（l3b4 gen2_trace/gen2_zone 轮次）错峰，无并发编译负载。
- 零源码改动、零 commit、零分支；in-src 暂编件用毕即删；scratch scope 生命周期绑定。

## 七、主线程复验与基线入册（2026-09-06，收割追加）

1. **objctor 合入缺口修复**：本报告第九条（obj_ctor=合入缺口）由主线程执行——patches/phaseb_objreg.patch（primary_object_plan 三处 +27）git apply 干净落地主树，重烤 m3 驱动（sha256=96c728ce8b29babc2461713fb203e38c4e76074e062540b7c0e0798780f98625，rc=0 wall 258s），probe_objctor 实测 compile=0 run=0 `probe_objctor=pass`。
2. **7 件探针入册**：probe_while/enum/tuple/assert/varinit/mod/objctor 七文件落 src/tests/ 常驻（gate 探针区合同=第二列相对 src/tests），user_path_baseline.tsv 探针区注册七行（五列，第五列 `-`）。
3. **全门复验（m3 驱动）**：`--require-probes-green` rc=0——四夹具 4/4 PASS + 探针区 7/7 PROBE-PASS，max_process_tree_peak=979,484,672B < 1GiB。语言面探针基线自此含 7 件常驻回归。
4. run_probes.sh 补 PROBE_DRIVER 环境覆盖（默认仍 m2 载具，行为不变）。
