# DUOWALL_DESIGN.md —— U 组两新墙施工级刀设计（墙①BC3 PatternIterator 组行 + 墙②W4 static-arg setEnv 位点）

日期：2026-09-21。性质：**零烤设计线**——本线零编译器烤制、零 commit、活树零写入；实测仅用冻结驱动 kd_c36_b（=HEAD a8d072457 语义，B 臂 sha `591eb422…`）做夹具探针，全部产物独占本目录。
判点原始件：`.rebuild/c36_line/C36KNIFE_ATTRIB.md` + `bake_wrap.log`（RETEST c3/c6 判词）+ 本线 `probe/*.stderr.txt`（双红控逐字复现）。
预登记档案：墙①=VERIFY_phaseb_bc3_append §一.2/§五-② + **aggregate_zero_definition_group.md §7「for 模式绑定」行 + §8 读点**（判词站点/消费契约/模板先例全链在案）+ VERIFY_own_walls_append §墙4 修法预登记；墙②=staticarg_line/REPORT.md（W4 族三刀形态+判词站点）。

坐标基准：HEAD `a8d072457`（typed_expr=C3 `0447be81` + C6 `0baab732` 已落库，commit a8d072457）。**与预登记档案的行号漂移对账**：aggregate §8 读点坐标（v1 树）→现 HEAD——判词站点 `:22146`→`:22785`（drift +639，含 staticarg 三刀 +120/-1 与他线 hunks）；组注册 `:5605`→`:5738`；消费契约 `:5727`→`:5860`；Pattern 臂 `:22157`→`:22796`。施工时按任务书纪律**以函数名/原文字符串为锚，行号仅参考**（预建三刀落库后 typed_expr 行号将再漂，重对线以锚为准）。

---

## 判词权威（两墙现役判词，双源逐字一致）

- 墙①（c3 接墙，rc=1 bin=no）：`typed expr binding: exact local value-definition group unavailable`
  出处：c36 RETEST c3 + for_range_call_fixture（bake_wrap.log:43/29）；本线探针 `probe/forrange_red.stderr.txt` 在独立 scratch 根逐字复现。
- 墙②（c6 接墙，rc=1 bin=no）：`typed expr: call declaration static argument type unavailable source=…/src/std/os.cheng name=setenv line=1279 scope=setEnv scope_start=1278 args=strToCStringTemp(key), strToCStringTemp(value), 1 …`
  出处：c36 RETEST c6（bake_wrap.log:44）；本线探针 `probe/c6_red.stderr.txt` 逐字复现（scopes=381 signatures=381 bindings=802 lines=2839——context 满载，坐实 staticarg REPORT §0-3 的「非 sourceContexts 缺失」族归因）。

---

## 墙① 刀 D1：PatternIterator 迭代组注册+注册即消费（typed_expr 域）

### 机理（源码实读链，现 HEAD 坐标）

1. for 头循环变量在 parser 侧是真实词法绑定：`IntroductionKind=ParserLexicalBindingIntroductionPatternIterator`（parser.cheng:510，enum 唯一 for 位产出）。树侧精确读路径 `typedExprIrBuildRhsIdentifierFromParserActive`（typed_expr.cheng:22796）对 resolutionKind==Pattern 的标识符（:22959-22976 逐列验 Pattern 身份）调 `typedExprIrExactLocalValueDefinitionRow`（:22746）按 `valueExprTransactionDefinitionGroupRowsByPatternRow[patternRow]` 取组行，联立六坐标+`consumedFlags==1` 任一不符即 panic 判词（:22785）。
2. 组注册唯一入口 `typedExprIrRegisterDeclarationLocalGroups`（:5738，由 `TypedExprIrRegisterValueDefinitionFunctionGroups`:5481 末尾 :5708 调）过滤链三连 `continue`：`ParserDeclarationLocal`（:5759）+ 本函数行（:5765）+ **`IntroductionDeclaration`**（:5770-5772）。PatternIterator 声明行在第三闸被跳过 ⇒ 组行永不注册 ⇒ `DefinitionGroupRowsByPatternRow[patternRow]` 恒 -1 ⇒ 判词。与 own_walls 墙4 富化判词 `pattern_row=1 group_row=-1` 实锤一致，与 aggregate §7 预登记「不可达」行一致——**预登记缺口即本刀施工面**。
3. for-range 形全链其余部分**均已存在且文本路径端到端绿**：`TypedExprForHeaderRangeBounds`（:62745）认 `range(...)` 调用形（1-2 参展开 0..n/a..b）与 `..<`/`..` 算符形；后端环变量槽按 `bindingName` 行扫描建槽定型（primary_object_plan.cheng:6691-6741：range 形 start/end 节点双 int32 ⇒ foundType="int32"；for-SEQ 形走 iterable 序列型）；语料绿证=exec_diff_corpus `for_range_arith_index` 等夹具（`for offset in 0..stop` 环变量经 `TypedExprBindingRhsForRangeI32Type`:18990 文本臂定型 int32 全绿）。**唯一缺口=树侧精确路的组行合同**。
4. 静态面同构先例：`TypedExprStaticForSeqBindingElementType`（:29722）注释原文「a `for x in seq:` induction variable carries no binding row」——三文本推理臂（BindingOperandType :19710 / Enclosing :22595 / Static :29722）都绕开组行工作，唯 Pattern 精确臂无组不可绕（fail-closed 审计，不可放宽）。

### 根修（施工合同）

**形态=own_walls §墙4 预登记的「迭代组注册+消费」+ aggregate/w24 零值模板先例形，消费取「注册即消费」变体。** 关键施工决策与理由：

- **为何注册即消费（eager），非 decl-local 式语句构建点消费**：decl-local 组由 LocalDecl 语句构建消费（:30989 唯一点）；for 环变量没有 decl 语句，且 for 语句有两条产出路（结构构建器 + 文本回退）。若惰性等语句消费：凡环变量只被文本臂读取的函数（corpus 全体绿夹具即此形）组恒不消费 ⇒ 函数收尾审计 `function group was not consumed exactly once`（aggregate §1 未读也炸环）**对新绿函数批量误炸=回归**。eager 使 registered⇒consumed 不变式与语句路径无关，Pattern 臂随时可命中。
- **为何行寻址消费，非复用按名消费**：`TypedExprIrConsumeDeclarationLocalValueDefinition`（:5860）按名唯一扫描（hits≠1 panic），同函数两个同名 `for i` 必双命中——环变量同名嵌套是常见形，按名即新误炸。行寻址（声明行+组行直取）精确无歧义。

施工件（**全部内联进既有函数体**——typed_expr.cheng 冷函数数触上限，staticarg REPORT §2 禁新增顶层函数约束继续有效；`TypedExprIrAddI32ConstNode`/`typedExprIrAppendValueDefinitionExact`/`TypedExprForSeqBindingElementType`/`TypedExprScopeLoopVarTablePrepare` 均为既有函数直接调用，不新增）：

1. **签名穿线**（+2 参）：`TypedExprIrRegisterValueDefinitionFunctionGroups`（:5481）与 `typedExprIrRegisterDeclarationLocalGroups`（:5738）各加 `ctx: TypedExprSourceContext, sourceContexts: TypedExprSourceContext[]`；调用点 3 处（:5708、:64588、:64804，后两处所在 `TypedExprBuildIrForScopeWithFactsAndExprLayer` 本就持有 ctx/sourceContexts，实读确认）。
2. **注册臂**（`typedExprIrRegisterDeclarationLocalGroups` 循环体内、Declaration 臂之后并列新增）：`typedExprIrDeclarationIntroductionKind(tree, declarationRow) == ParserLexicalBindingIntroductionPatternIterator` 时：
   - 门（全精确坐标，任一不符 **skip 注册**＝旧判词保留，fail-closed 零放宽）：
     a. 声明 kind==ParserDeclarationLocal ∧ declarationFunctionRows==本函数行（与 Declaration 臂同闸复用）；
     b. `bindingPatternRow = valueExprDeclarationBindingPatternRows[declarationRow]` 合法（:5773 同式）且 `DefinitionGroupRowsByPatternRow[bindingPatternRow]==-1` ∧ `DeclarationLocalGroupRows[declarationRow]==-1`（:5781-5786 防双注册同款）；
     c. 环变量记录联证：`ParserValueExprTokenLineAt(tree, declarationNameTokenIndexes[declarationRow])`（parser.cheng:14835）得声明行号，与 `TypedExprScopeLoopVarTablePrepare(ctx)`（:22477）产出的记录表按（name==声明名 ∧ lineNumber==声明行号）双键精确命中；`RangeFlags==true`（D1 只接 range 形）；
     d. `scope.loopVarTableBuilt` 为真。
   - 载体：`TypedExprIrAddI32ConstNode(ir, ctx.sourcePath, scope.name, 声明行号, "0")`——range 形环变量类型权威=int32（后端 :6731-6741 同判据），该构造器即 LocalDeclStatement int32 零值臂现役 defining 构造器（:30951），value/share/seal 全链有绿例背书。
   - **注册**：组 CSR 十列 append 与 Declaration 臂逐列同构（:5802-5841：producerSourceIndexes/parserProducerSourceIndexes/initializerRootSourceLocalNodeIndexes=detached 根键 nodeCount+1+declarationRow/bindingOffsets=0/bindingCounts=1/typedFunctionIndexes/declarationSourceLocalRows/patternSourceLocalRows/definitionRows=-1/consumedFlags=0），组行回写 `DefinitionGroupRowsByPatternRow[patternRow]`+`DeclarationLocalGroupRows[declarationRow]`，事务根映射 density 守卫照抄（:5851-5856）。
   - **注册即消费（行寻址，内联 ~15 行）**：镜像消费尾段（:5926-5948）——`typedExprIrAppendValueDefinitionExact(ir, OriginBindingInitializer, producerSourceIndex, declarationSourceLocalRow, declarationSourceLocalRow, patternSourceLocalRow, functions2_functionNameIds.len, carrierNodeIndex, groupRow, nodes2_exprClasses[carrierNodeIndex])` 后直写 `definitionRows=definitionRow`、`consumedFlags=1`。**不**调 :5860 本体（其按名扫描与 hits 审计是 decl-local 语义）。
   - detached 指纹不变式：载体 ownerStatement=-1（AppendNode 恒写）+ 组根键 -1，与 w24/aggregate 三处跨模块放行臂（typed_expr:4226 区/frag_codec:1763 区/lowering_plan:6264-6296）同形，零新增 op 枚举、零身份面改动。
3. **D1 边界（成员切分）**：for-SEQ 形（RangeFlags==false）与字面量迭代器（`for x in [3,4,5]`，元素型推理缺，预登记「亦缺」项）**本刀不接**——门 c 不放行 ⇒ 组不注册 ⇒ Pattern 臂照旧判词（对 seq 形即墙①同族成员 2/3，红判词=D1 红判词同文）。同族后续成员另刀（镜像本臂 seq 分支：`TypedExprForSeqBindingElementType` 推理元素型+标量/nil-able 载体臂）。

### 字节漂移预算（诚实申报）

每个含 range-for 的函数新增 1 组行+1 定义行+1 个 I32Const 载体节点 ⇒ 节点/行号空间后移，**该函数的 typed IR/lowering 指纹合法漂移**（w24/aggregate 的「后端逐字节不变」承诺只覆盖新臂不触发的形态，本刀对 for 函数是新臂触发形态）。无 for 循环函数零节点零行新增，产物逐字节不变可承诺。

### 红绿口径

- **红臂**（已双源钉死）：c3 夹具 + for_range_call_fixture ⇒ rc=1 bin=no，判词 `typed expr binding: exact local value-definition group unavailable` 逐字。
- **绿判**：①两夹具该判词消失、verdict 前进（下一墙未知，如实记录）；②for_range corpus 绿夹具（arith_index/local_cond/seq_len/variable_start）run rc+stdout 逐字零漂（.o 漂移允许）；③无 for 合同夹具 primary.o 逐字节恒等；④金丝雀 2/2×每轮；⑤seq-for 夹具（probe_for_array 族）判词零漂移（D1 不触面自证）。
- 施工前置：补丁过 `tools/cheng_scratch_scope.sh` 生命周期 + `patch_preflight.py` PASS（规则 10-①：@ 注解紧贴/位移多集比对/空套件/括号平衡）+ `git apply --check`；撤销只走冻结件 `git apply -R`。

---

## 墙② 刀 W4-os：setEnv 位点规范迁移（std 源域，零编译器改动）

### 机理（源码实读链 + 本线探针定谳）

1. panic 站点：`TypedExprResolveCallDeclarationFromText`（typed_expr.cheng:30561）——声明解析**前置**实参定型 `TypedExprCallStaticArgTypesInto` 失败即 panic。判词 `name=setenv` ⇒ 炸点在解析 setenv 声明**之前**的实参定型（setenv 自身解析 :30565 未及运行）。
2. 失败实参=前两参 `strToCStringTemp(key)`/`strToCStringTemp(value)`（第三参字面量 `1` 有字面量臂）。直调文本爬梯（`TypedExprIrRhsFindSplit` 无算符逐级 level+1，d4 轮已证无算符文本恰在 level=10 抵达臂序）落到 callHead 臂（:30282）⇒ `TypedExprBindingRhsCallReturnType`（:18709）⇒ 嵌套 `TypedExprResolveCallDeclarationFromText(strToCStringTemp)`（嵌套实参 `key`→参数行 `str` 定型成功，不炸）⇒ `TypedExprResolveCallDeclarationKind`（:34276）**可见性闸** `TypedExprCallDeclarationVisibleFromImport`（:34241）——`TypedExprSymbolExportedByCase`（:12184）小写首字母且不在豁免名单 ⇒ false ⇒ **`return Missing`**（:34297-34299，限定的与裸的两 face 同闸）。回退臂 `TypedExprStaticUniqueCalleeReturnType`（:53085）→ sealed 索引下 `typedExprLocalFunctionNameRow` **本源限定** ⇒ 亦 Missing。实参型 "" ⇒ 外层 panic。
3. **规范定性**：`strToCStringTemp` 声明于 system.cheng:2888（小写首字母），os.cheng `import std/system` 后裸调——**规范 §1.4（docs/cheng-formal-spec.md:714-719）：「首字母大写导出；import 仅导入导出符号；未导出符号在模块外不可见」——该调用面属规范非法形**。静态机器正确执行了门禁；值侧 fact 解析对此面宽容（std 全树依此存活：fs/env/http/gui/os 合计 20+ 位点）＝两解析权威不对称，这正是 W4 族判词只在一部分消费者（需静态实参定型者：无注解 let-call、重载候选）暴露的原因——`os.cheng:484 getEnv` 同形因 `let raw: cstring = …` 带显式注解走绑定 RHS 路，不触发本 panic，与探针实测 :1279 先炸一致。
4. **处置定性（AGENTS 规范 3）**：非法形走门禁+规范迁移，**禁止弱化静态可见性闸**（那会把规范非法面洗成合法）。system.cheng:2891 已备导出包装 `fn StrToCStringTemp(s: str): cstring = return strToCStringTemp(s)`（逐点等价委托）——迁移=纯换名到导出面，规范合法、行为恒等、零编译器改动。

### 施工合同

补丁 `os_cheng_w4_migration.patch`（本目录，sha `c12aff0f14a30ec9…`，10 位点逐点换名 :484/:913/:1254/:1279/:1592×2/:1626/:1627/:1701/:2646）：
- 范围=os.cheng 全部 `strToCStringTemp(` 裸调位点（grep -c=10 全覆盖，无声明行误伤——声明在 system.cheng 不在本文件）。
- 同族位点迁移账（同规则待各自闭包编译触面时同法迁移，非本刀范围）：fs.cheng 9 位点 / env.cheng 3 / http.cheng 1 / gui.cheng 1。
- 与 staticarg 三刀关系：REPORT §1 成员 1（if-expr 臂）已清 ownership_drop_ir:1809；成员 2（:3176 上游行错型填充）已定性移交上游填型机——setEnv 位点是**成员 3=「跨模块未导出直调」形态**，与成员 1/2 缺臂形态不同：**编译器无臂可补，补了就是放宽门禁**；唯一根修=源面迁移。族账登记：W4 族成员 3 处置=规范迁移（非 typed_expr 臂）。
- 红绿口径：**红臂**（已双源钉死+本线复现）=os.cheng:1279 判词逐字（见判词权威）。**绿判**（本线探针已实测，kd_c36_b 同窗同夹具唯一变量=迁移）：static-arg 判词**消失**，verdict 前进至下一墙 `typed expr: ambiguous call declaration source=…/os.cheng name=Error arity=1`（`probe/c6_mig.stderr.txt`）——下一墙归**重载歧义族**（result.cheng:103 特化 `Error(Result[bool])` 与 :109 泛型 `Error[T]` 同 face 同秩命中，result 域另案），非 W4 族、非本刀域。正式落库验收另需：金丝雀 2/2、四合同 primary.o 恒等（迁移仅 os.cheng 换名，标识符等价委托，预期逐字节恒等；若漂即归因重查）、U 组口径以 c6 夹具 bin 进位为准（Error 墙清偿后另测）。

### 与预建三刀的串行/并行关系

- **刀 D1（typed_expr 域）**：与预建三刀重对线**同域同文件** ⇒ 按任务书口径**排预建三刀落库后同批施工**；行号以本档函数名锚重对；批内归因沿用 c36 先例（合并基座一次重烤、B 臂=预建三刀+D1、各刀判词各自清除即刀域绿）；预算内烤机由批编排者统一分配，D1 的绿判①②③④⑤为批内门禁子集。
- **刀 W4-os（std 源域）**：与预建三刀、与 D1 **零文件交集、零判读面交集** ⇒ **可并行**，无落库顺序约束；因零编译器改动，其验收不需要新烤驱动（冻结驱动探针即凭证，本线已实测），落库走普通 commit 流程。

---

## 本线产物与探针台账（零烤凭证）

| 件 | 内容 | sha256 前 16 |
|---|---|---|
| `probe/c6_red.stderr.txt` | 墙②红控（未迁移 scratch 根，判词逐字=判点） | 6a16867069c19fee |
| `probe/c6_mig.stderr.txt` | 墙②迁移后（同窗同夹具唯一变量=10 位点换名）：W4 判词消失→Error 歧义墙 | 5ae36c33507064b7 |
| `probe/forrange_red.stderr.txt` | 墙①红控（独立 scratch 根复现 c3 判词） | b303a179e0f66d88 |
| `os_cheng_w4_migration.patch` | 墙②施工件（/usr/bin/diff 冻结，10 位点） | c12aff0f14a30ec9 |
| 探针环境 | scratch 克隆根拷自 c36knife（cp -cR），kd_c36_b sha `591eb422…`，CHENG_*NO_CACHE 全开、BACKEND_JOBS=1，磁盘守卫登记 `.rebuild/duowall_line/tmp`；924MB 探针根已提取证据后删除 | — |

## 四件套

1. **墙族归属**：墙①=typed_expr 值定义组域（BC2→BC3 两线预登记移交的 PatternIterator 组行缺口，w24/aggregate 零值模板同族第三变体——decl-local nil-able、decl-local 聚合之后的迭代组）；墙②=W4 static-arg 单入口族成员 3（族谱：成员1 if-expr 臂已落库、成员2 上游行填移交、成员3=跨模块未导出直调，唯一非编译器臂成员=规范迁移）。
2. **BC3 预登记可复用度：高（约七成）**。缺口定位、组行合同坐标、零值模板先例、消费契约、判据约束全部在案可直接引用；本线新增的施工决策=注册即消费变体（文本路函数防收尾审计误炸）+行寻址消费（同名嵌套 for 防误炸）+D1 成员切分（seq/字面量另刀），此三项预登记未覆盖。
3. **预估规模**：D1≈+130/-2 行单文件（签名穿线 3 调用点+注册臂+内联消费，双 hunk 预检即可承载）+1 轮烤机（并入预建三刀批则零增量轮）；W4-os=10 行换名单文件、零烤机（本线探针已代验收红转前进）。
4. **置信度**：墙②**高**（机理链全 file:line 实读+规范条文+冻结驱动探针红转前进实测闭环）；墙①**中高**（缺口与合同全实读、红判词双源钉死、文本路绿证在案；未实证项=结构构建器对 for 体的认领次序对载体时序无影响这一静态推断，须烤后绿判①实测收口）。
