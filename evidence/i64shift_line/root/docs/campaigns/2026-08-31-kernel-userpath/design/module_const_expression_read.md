# 表达式位置的模块级 `const` 读取：`declaration producer identity split` 机制、修法与验证计划

本单只做**只读源码 + 出补丁设计**：全程未运行任何编译/烤制命令，未改动任何源文件。
唯一执行过的验证是 `git apply --check`（exit 0）。**本文所有断言都可被 `read`/`grep` 复现**；
凡未实测的一律标注"未验证"。

## 0 结论（先行）

1. **待验假设成立**：模块级 `const` 在表达式位置被读取时，parser 侧确实给出**非 None** 的
   `Pattern` 解析并指向该 const 的声明行（`functionRow == -1`），于是走到 `typed_expr.cheng:22218`
   的四条件守卫并 panic。
2. **四条条件里炸的是第 4 条 `parserFunctionRow < 0`**；另外三条按 parser 自身的不变量**必为假**（§1.4）。
3. **正确修法是 (A)：表达式位置先按常量折叠**（复用 `TypedExprModuleConstLiteralForContext` +
   `TypedExprIrBuildModuleConstLiteralNode`），产出字面量叶节点。(B)（在该路径接受模块级声明、
   建全局/常量引用）**是错的**：它与 C 链语义不符，且要落地必须动 `:22218` 守卫与函数局部
   value-definition 组的不变量（§2）。
4. 
**〔本席修正（2026-09-11：插入位置编译级缺陷，已修）〕** 原补丁把新块插在 `let parserFunctionRow = …` 绑定**之前**，而条件读 `parserFunctionRow < 0` ⇒ 用前声明，**编不过**。已将该块整体移到绑定**之后**、`if parserProducerSourceIndex < 0 ||` 之前（原文件 22215 行前）；块内 9 个引用已逐条核定在该点均已绑定，修正后 `git apply --check` exit 0。方法与你顾问的一致：取出 `+` 块 → 在正确锚点重新插入 → `/usr/bin/diff -u` 重生成补丁（未动任何源文件）。
补丁：`patches/s1b_step3o_module_const_expr_read.patch`（单文件、单 hunk，只碰
   `src/core/lang/typed_expr.cheng` 一处新增分支；`:22218` 守卫与其四条判据逐字未动）。

---

## 1 机制链（file:line）

### 1.1 parser 侧：模块级 `const` 是一条**真实词法绑定**（不是"分类错误"）

以 `r8_fixed_len_named_const_main.cheng`（`const` 块里 `SlotCount: int32 = 4`，`fn main` 里
`s.values[SlotCount - 1]`）为例，逐跳如下：

| # | 事实 | 位置 |
|---|---|---|
| 1 | 顶层读入后，`activeFunctionRow = -1`、活动词法作用域 = Source 作用域 | `parser.cheng:7767-7768`；`parser.cheng:27133-27138`（`ParserDeclarationLexicalScopeSource`） |
| 2 | 顶层语句循环把每个语句交给 `ParserValueExprProcessStatementRangeWithTypeOwner` | `parser.cheng:27021-27027` |
| 3 | 列 0 的 `const` 单独成行 ⇒ 进入绑定块；块内缩进条目交给 `ParserValueExprProcessBindingEntryRange` | `parser.cheng:26701-26710`（块头）、`parser.cheng:26711-26729`（条目，调用点 `:26719`） |
| 4 | 该函数为条目建 `ParserDeclarationLocal`（`functionRow` 取 `tree.activeFunctionRow` = **-1**）与 Pattern 绑定 | `parser.cheng:24065-24072`、`parser.cheng:22062-22072`（`:22068` 传 `tree.activeFunctionRow`） |
| 5 | 条目注册进词法绑定表；**绑定的作用域行取声明自己的 `declarationLexicalScopeRows`（= Source）** | `parser.cheng:24179-24189`（有初值臂）→ `parser.cheng:9958` → `parser.cheng:9983-9984` |
| 6 | `const` 的**单行**形（`const X: int32 = 1`）走同一函数 | `parser.cheng:25389-25400`（语句核心的 let/var/const 臂）→ `ParserValueExprProcessBindingEntryRange` |
| 7 | 函数体作用域的父链 = 建例程时的活动作用域；模块级的例程 ⇒ 父 = Source 作用域 | `parser.cheng:22885-22910`（`:22904-22909`） |
| 8 | 可见性查找沿作用域父链上溯 ⇒ **函数体内能看到模块级 const 绑定** | `parser.cheng:9891-9929`（`:9903-9928` 上溯）；可见性判据 `parser.cheng:9850-9888`（Initializer 引入者只要求 `nodeIndex > 初值根`） |
| 9 | 解析标识符时按"有无 Pattern 行"记 kind：有 ⇒ `Pattern`，无 ⇒ `Parameter`；同时写 declarationRow | `parser.cheng:10070-10110`（kind 选择 `:10090-10093`，写入 `:10094-10108`） |
| 10 | `ParserValueExprNodeBindingResolutionAt` 只是这三列的**纯读**（不做任何函数局部过滤） | `parser.cheng:10158-10183` |

**关键：第 10 条说明"非 None 解析"完全是 parser 的既定语义，不是误报。** 收据校验器同样承认它：
`ResolutionPattern` 只要求被解析声明 `kind == ParserDeclarationLocal`，**不含任何 functionRow 约束** ——
`compiler_parser_receipt.cheng:5697-5720`。

### 1.2 typed_expr 侧：模块级 const 走不到"文本折叠"那条路

同一条 `SlotCount` 在结构化值表达式里是 `ParserValueExprIdentifier` 节点：

- 结构值消费者对 Identifier 直接调 `typedExprIrBuildRhsIdentifierFromParserActive`：
  `typed_expr.cheng:25217-25223`（`typedExprIrBuildValueExprNodePrefixActive`）。
- 而**文本路径** `TypedExprIrBuildRhsIdentNode` 早就把模块 const 折成字面量：
  `typed_expr.cheng:22464-22474`（`refType == ""` ⇒ 查模块常量表 ⇒ 建字面量节点）。
  但它在 `parserValueExpr` 路径上只在**解析为 None** 时才被调用：`typed_expr.cheng:22191-22194`。
- 四个夹具的读法都必然走结构路径：`s.values[SlotCount - 1]` 是 `ParserValueExprIndex`
  （`typed_expr.cheng:25356-25379`：基座与下标都递归 `TypedExprIrBuildValueExprNode`），
  下标是 `ParserValueExprBinary`（`:25440-25467`），其左操作数就是那个 Identifier。

### 1.3 于是命中的是 `:22218`

`typed_expr.cheng:22181-22196` 拿到非 None 的 `Pattern` 解析 + 合法 declarationRow ⇒ **不早退**；
`typed_expr.cheng:22197-22214` 读出三列；`typed_expr.cheng:22215-22218` 四条件或起来 ⇒ panic。

### 1.4 四条守卫逐条排除（静态闭合，**哪一条为真可判**）

| 条件 | 取值 | 依据 |
|---|---|---|
| ① `parserProducerSourceIndex < 0` | **假** | `nodeProducerSourceIndexes` 在节点追加时恒写 0（`parser.cheng:15767-15769`），且节点源域校验要求 `0 <= index < producerSourceCount`（`parser.cheng:12192-12196`）。夹具是单源（`--in` 单文件），producer = 0。 |
| ② `parserProducerSourceIndex != declarationProducerSourceIndex` | **假** | 声明侧同样恒以 0 追加（`parser.cheng:9644-9646`），森林合并时统一改写为 `sourceOffset + producerSourceIndex`（`parser.cheng:11408-11411`）。单源 ⇒ 两侧同为 0。 |
| ③ `declarationSourceLocalRow < 0` | **假** | 建于 `parser.cheng:9644-9648`（`sourceLocalRow = row >= 0`），合并时改写为 `sourceLocalRow`（`parser.cheng:11412-11413`）。 |
| ④ `parserFunctionRow < 0` | **真** | 模块级条目的 `declarationFunctionRows == -1`（条目在 `activeFunctionRow == -1` 时建行：`parser.cheng:22068` + 初始值 `:7767`），并在合并时保持 -1（`parser.cheng:11433-11436`）。 |

结论：**panic 来自第 ④ 条**，即"该函数的两个可表示支路（`OpLocalRef` / `OpParamRef`）都要求声明是函数局部"。

### 1.5 独立旁证（产物读数，非编译）

- `fixtures_r9g.txt`：四件正例（`r8_fixed_len_named_const_main` / `r8_fixed_len_inline_arith_main` /
  `r9_fixed_len_forward_const_main` / `r9_fixed_len_untyped_const_main`）`compile_rc=1`，末行全部
  `typed expr binding: declaration producer identity split`；负例
  `r8_fixed_len_non_int32_main` 仍是 `parser type syntax: fixed array length const must be int32 ...`
  （路径无关）。路径：`.rebuild/s1b_step3/r9/fixtures_r9g.txt`。
- 崩溃时刻：`fx_r8_fixed_len_named_const_main.stderr.txt` 尾部为
  `csg_mem tag=typed_ir_round round=0 funcs=0` → 紧接着该判词 ⇒ 死在**第 0 轮、第一个函数的
  typed 节点构建期**，与"`main` 体内读 const"一致。
- 形态对照：`.rebuild/s1b_step3/r9/ab_r9.txt` 里 `probe_const_only` 在**两个不同驱动**（含/不含
  const 长度移植）上判词逐字相同（`verdict=IDENTICAL`，同在 `:22218`），而 `probe_lit_arith` /
  `probe_struct_literal` 两侧死在**不同**的判词（`exact local value-definition group unavailable`
  → `producer lacks exact type or ownership proof`）⇒ 该 panic 与聚合零值/所有权那两条墙**不同源**。
  同时 `probe_local_only` 两侧 `rc=0`（`ab_r9.txt`）。
  **诚实标注**：两份探针源（`src/tests/r9probe_*.cheng`）已被清理，我**无法**核对
  `probe_local_only` 与 `probe_const_only` 的确切源码差异；"局部绑定孪生体"只是由命名与
  `ab_r9.sh:31-35` 的清单顺序推得，**未验证**。上面的 §1.1-§1.4 静态链不依赖这条旁证。

---

## 2 修法判定：选 (A)，驳回 (B)

**(A) 表达式位置的模块级 `const` 先折叠成字面量。** 判据：

1. **C 链语义**：C 链在 primary 就查符号表并物化常量：`cold_parser.c:53180-53184`
   （`parser_find_const` → `cold_materialize_const_value`），后者发的是
   `BODY_OP_I32_CONST` / `I64_CONST` / `F32_CONST` / `F64_CONST` / `STR_LITERAL`
   （`cold_parser.c:51680-51730`）——**是立即数字面量，从来不是存储读**。
   定长数组长度那条路也一样：`cheng_cold.c:30173-30180`（`symbols_find_const` + `cold_const_i32_value`）。
2. **规范语义**：`docs/cheng-formal-spec.md:555` 把 `T[N]` 的 N 定为**编译期常量**；`const` 在文法里
   与 `let`/`var` 同属 `storage`，但其值是编译期常量（同文件 `:167`）。同一名字在类型位置被当编译期常量、
   在表达式位置被当运行期槽位，会让两处语义分叉。
3. **本仓既有对齐**：文本路径的同一标识符早已这样折（`typed_expr.cheng:22464-22474`）；解析面的同一折法
   在枚举常量上也有先例（`typed_expr.cheng:25316-25337`，同样从 parser 节点折成 `I32Const` 叶）。
4. **不动任何守卫即可落地**：折叠后的字面量叶不携带 binding 身份列（默认 -1），因此
   `TypedExprIdentifierBindingAuthorityStrictValidateParserTreeInto` 会**跳过**它
   （`typed_expr.cheng:3318-3324`：`producerSourceIndex < 0 ⇒ continue`）。

**(B) 在该路径接受模块级声明（建全局/常量引用）为什么错**（具体到不变量）：

1. **要落地必须放宽 `:22218`**。该函数的两条支路都发**局部**身份引用，且
   `TypedExprIrOpLocalRef` 需要"精确局部 value-definition 组"：`typed_expr.cheng:22130-22154`
   （组必须 `consumedFlags == 1`、`definitionRow` 合法）。模块级声明不属任何 typed 函数 ⇒ 无组可编址 ⇒
   接受 `functionRow < 0` 就要**为它伪造/新增一个全局 value-definition 组**，正是该守卫禁止的事。
2. **与 C 链不符**：C 链对 `const` 从不发存储读（§2.1）；发全局引用等于把编译期常量降级成运行期槽位。
3. **与"类型位置"分叉**：`T[SlotCount]` 的长度是 parse 期烘焙进类型身份的（`parser.cheng:18925-18961`
   用 `parserTypeSyntaxModuleConstValueInto` 一族求值）。若表达式位置读的是运行期存储，同一个 const 在
   两个位置可能取到不同值（例如某类 const 根本没有被物化成全局），而 `const` 是不可变的编译期常量。
4. **没有对应节点种类**：后端/realizer 的 `LocalRef` 全链路假设函数局部（值定义、所有权、槽位）；
   新增"模块 const 引用"是一张独立的、跨 primary/backend2/所有权审计的施工单，不是本墙的修法。

**一句话判据**：`const` 在表达式位置与类型位置必须是**同一个编译期值**，所以表达式位置必须先折叠（A）；
(B) 既不符合 C 链，又必须动 `:22218` 与函数局部 value-definition 组的不变量。

---

## 3 语义边界（逐个回答）

### 3.1 模块级 const 不在常量表里（RHS 非字面量）怎么办

分三类，**本补丁的行为都是"保持原 panic"**（判据零放宽）：

| 形态 | 常量表 | 折叠结果 |
|---|---|---|
| `const X = uint64(1)` / `const X: int32 = 0x10` | 命中（文本扫描按 `const` 行收 RHS 原文，`typed_expr.cheng:21377-21425`） | **可折**：`TypedExprIrBuildModuleConstLiteralNode` 有 `castType(intLiteral)` 分支（`typed_expr.cheng:21809-21841`），发 `I64Const`/`I32Const` 且 resultType 取 cast 目标类型 |
| `const X = A * 2`（RHS 是算术/表达式） | 命中，但值是原文 | **折不了**（该 builder 返回 -1，`typed_expr.cheng:21842`）⇒ 落回 `:22218` 原 panic。**这是已知缺口**，修它需要把 parser 的 parse 期 int32 常量表（`parserTypeSyntaxModuleConstValueInto`，`parser.cheng:18084`；`parserTypeSyntaxModuleConstFindInto`，`:17972`）向 typed_expr 侧暴露，属另一单 |
| `alias.Name`（跨模块限定名） | 不适用 | **根本不进本函数**：`alias.Name` 是 `ParserValueExprField`（`typed_expr.cheng:25316-25355`），不是 `Identifier`。本补丁一根毫毛都没碰它。**未验证**其今天是否可用 |

注意：**前向引用不影响折叠**。本补丁查的是 typed_expr 自己的**全文文本扫描表**
（`TypedExprModuleConstEntryForLine`，`typed_expr.cheng:21377-21425`，逐行扫整源），
与声明顺序无关 ⇒ `r9_fixed_len_forward_const_main`（`const` 写在 `type` 之后）与后向引用同解。
表里的条目在 build index 封存时就已对该源扫描并注册（`typed_expr.cheng:37026-37033`），
`TypedExprModuleConstLiteralForContext` 再查一次（`:21648-21712`）。

### 3.2 类型位置 vs 表达式位置：两条路，互不影响

- **类型位置**（`T[N]`）：parser 内部的 parse 期常量表 + 括号参数三级判定
  （`parser.cheng:18925-18961`；表建在 `:17972-18120`、预扫描 `:26334-26380`），产出的是**类型语法**里的
  定长长度，不产生 typed 节点。
- **表达式位置**：typed_expr 的节点生产面。

本补丁**只碰 `typed_expr.cheng`、只在 `typedExprIrBuildRhsIdentifierFromParserActive` 里加一条前置分支**：
不新增/修改 parser 列、不动 `ParserTypeConstExpr*`、不动括号参数分类、不动收据镜像。
反过来，类型位置那条路也不读 `nodeBindingResolution*` 列。两边唯一共享的是**同一张"名字 → 字面量"文本表**
（各查各的），因此不存在"改一处坏另一处"的耦合面。负例夹具（`str` 常量作长度）的判词由 parser 侧
（`parser.cheng:18946-18950`）决定，本补丁**不可能**改变它。

### 3.3 `for ... in` 迭代变量 / 模式绑定 / 参数会不会误伤

不会，逐条给出理由（**都不满足新增分支的前两个合取项**）：

- **参数**：解析 kind 是 `Parameter`（patternRow == -1，`parser.cheng:10090-10093`），新增分支要求
  `Pattern` ⇒ 直接跳过。且参数声明的 `functionRow` 由 `tree.declarationFunctionCount` 给出，恒 ≥ 0
  （`parser.cheng:22889-22901`）。
- **函数内模式绑定**（`let`/`var`/`match`/解构）：声明行 `functionRow = activeFunctionRow >= 0`
  ⇒ 新增分支的 `parserFunctionRow < 0` 不成立 ⇒ 老老实实走原 `Pattern` 支路。
- **`for ... in` 迭代变量 / 推导式迭代变量**：注册为 `PatternIterator`
  （`parser.cheng:25237` 一带 / `:19439-19447`），且在函数内 ⇒ `functionRow >= 0` ⇒ 不受影响。
- **真正会被新分支接住的**只有一种：**解析到"模块级 Source 作用域声明"** 的标识符（这正是目标形态）。
  新增分支还额外限定作用域 kind == `ParserDeclarationLexicalScopeSource`
  ——这与本仓既有的模块级全局声明判据同源（`compiler_csg.cheng:33457-33473`：
  `ParserDeclarationLocal` + `functionRow == -1` + Source 作用域）。
- **遮蔽安全**：函数内局部与模块 const 同名时，`ParserValueExprLexicalBindingFindVisible` 从内层向外层
  上溯，取到的是**局部**声明（`functionRow >= 0`）⇒ 新增分支不触发，折叠不会越过遮蔽（§5 的
  `D2` 夹具就是这条）。
- **块内同名遮蔽（模块级语句）**：`for`/`if` 体里 `let X = 5` 而模块又有 `const X = 3` 时，遮蔽者的声明
  作用域是 Block 而非 Source ⇒ 新增分支不触发 ⇒ 仍是原 panic（今日行为不变，无静默取错值的口子）。

---

## 4 补丁

`patches/s1b_step3o_module_const_expr_read.patch`（`git apply --check` = **exit 0**，已验）。
单 hunk，插在 `typed_expr.cheng:22209`（`declarationSourceLocalRow` 读完之后）与 `:22210`
（`parserFunctionRow` 读之前）之间，**新增**一条前置分支：

- 条件 = `resolutionKind == Pattern` **且** `parserFunctionRow < 0` **且** 声明的词法作用域 kind ==
  `ParserDeclarationLexicalScopeSource`（即"模块级绑定"）；
- 动作 = 查模块常量表（`TypedExprModuleConstLiteralForContext`）；命中且能建出字面量节点
  （`TypedExprIrBuildModuleConstLiteralNode`）就 `return` 该节点；否则**原样落回** `:22215-22218` 守卫。

**为什么这不是"放宽守卫"**：`:22215-22218` 的四个条件、判词、panic 位置**逐字未动**；新增分支是一个更窄、
且语义上不可表示的分支（"编译期常量读取"），它把这类节点变成**无 binding 身份的字面量**，而不是让
局部身份引用去接受函数外声明。所有未命中折叠的形态（模块级 `var`/`let`、非字面量 RHS 常量、
生产式不等、作用域不是 Source）都**照旧** panic。

新增分支不需要新列、不需要新枚举成员、不需要改 parser——因此也不进"枚举/列集合身份哈希"的位移面
（本战役对此有历史教训）。

---

## 5 验证计划（交给占槽的一手执行；本席未跑）

### 5.1 落树
```
git apply --check patches/s1b_step3o_module_const_expr_read.patch   # 期望 exit 0（已验）
git apply          patches/s1b_step3o_module_const_expr_read.patch
```

### 5.2 主判据（四件正例 + 一件负例 + 一件既有 panic）
用含本补丁新烤的驱动跑 `fixtures_r9.sh` 等价命令，读 `fixtures_r9h.txt` 一类的产物：

| 对象 | 期望读数 |
|---|---|
| `r8_fixed_len_named_const_main` / `r8_fixed_len_inline_arith_main` / `r9_fixed_len_forward_const_main` / `r9_fixed_len_untyped_const_main` | `typed expr binding: declaration producer identity split` **出现次数 = 0**；推进到下一道墙或直接 `compile_rc=0`（若 rc=0，还须跑产物，期望 `run rc=0`：三件 `s.used` 分别 16 / 7 / 7 / 7） |
| `r8_fixed_len_non_int32_main` | 判词**逐字不变**：`parser type syntax: fixed array length const must be int32 name=SlotName statement_offset=752` |
| `binary_types_via_import` | 仍是既有 `arena array: read out of bounds`（本补丁不涉） |

### 5.3 形态选择性（A/B 字节对照）
同 `--out` 串行两跑（本战役已确定的口径：产物把自身输出路径嵌进 proofDigest，两侧 `--out` 不同即作废）：
对**不含"模块级 const 在表达式位置被读"**的夹具（`ordinary_zero_exit_fixture`、`call_fixture`、
`probe_ordinary`），补丁前后应 `verdict=IDENTICAL` 且 sha 逐字节相同 ⇒ 证明改动只在目标形态上生效。

### 5.4 若修法错了，会先在哪条判词暴露

| 错误类型 | 先暴露的读数 |
|---|---|
| 常量表查不到（build index 冻结态没有该源条目 / 表未扫） | **原判词不变**（`declaration producer identity split`）⇒ 表现是"补丁没生效"，不是错修。可加一度读数：在分支里临时打印 `moduleConstLiteral`（**只加打印，不动判据**） |
| 折叠出的节点缺 parser 来源证明 | `typed expr: node origin proof is missing or contradictory fn=main line=... op=...`（`typed_expr.cheng:6433`）——新增分支在 origin 栈非空处执行，正常应取到栈顶；若栈为空即报这句 |
| 折叠出的节点没绑结构 TypeId | 下游 compiler csg 的 exact TypeId 权威门（materialize 面）报 `exact type` 类判词；`TypedExprIrAddRhsLeafNode` 内已按 resultType 绑 reserved scalar TypeId（`typed_expr.cheng:20599-20626`），正常不会发生 |
| 作用域判据写错（把 Block 当 Source，或反之） | 若**过窄**⇒ 目标形态仍报原判词（补丁无效）；若**过宽**⇒ 也只影响"模块级非 const 同名绑定"这种今天本就 panic 的形态，且折叠只在常量表命中时发生 ⇒ 最坏是**运行期值错**（夹具 `if s.used != 16: return 2` ⇒ `run rc=2`），**不会静默 miscompile 到别的形态** |
| 折叠值本身错（表里字面量解析错） | 同上：`run rc=2`（`s.used` 不等于期望值）——所以 5.2 表里那三个期望值是**必须跑的**，不能只看 `compile_rc` |

### 5.5 若仍要"用读数区分是哪一条守卫"
本席已用静态不变量把四条逐条判定（§1.4），**不需要**额外编译。若要把静态结论钉成实测，最小成本是
**一次诊断编译**（不是放宽判据）：把 `:22218` 的 panic 文案临时扩成四列读数，例如
`panic(Fmt"typed expr binding: declaration producer identity split ps={parserProducerSourceIndex}/{declarationProducerSourceIndex} local={declarationSourceLocalRow} fn={parserFunctionRow}")`，
判据与 panic 位置不变。期望读数：`ps=0/0 local>=0 fn=-1`。
另有一条**纯夹具**判别（上游已在跑，用于确认"是不是 const 参与"而非"是哪一条"）：
把一件正例的下标改成字面量 `s.values[3]`，若通过则确认 const 读取是触发点。

---

## 6 未测项（诚实清单）

1. **未编译、未烤、未跑任何夹具**：本单只出补丁与设计；`git apply --check` 是唯一执行过的验证。
2. **补丁本身未编译过**：`TypedExprModuleConstLiteralForContext(ctx, share(surfaceText))` 与
   `TypedExprIrBuildModuleConstLiteralNode(...)` 的调用形态虽与既有调用点（`typed_expr.cheng:22464-22474`）
   逐参对齐，但**该 hunk 的 Cheng 语法/借用门未过编译器**。
3. **未验证** `TypedExprModuleConstLiteralForContext` 在本路径（可能在冻结 build index 下首次被调）一定拿得到
   条目。静态依据是索引封存时已对每个 source 扫描并注册（`typed_expr.cheng:37026-37033`）+
   自初始化分支（`:21669-21699`），实跑未验。
4. **未验证**折叠出的字面量叶在下游（value-definition / ownership 审计、CSG 快照、primary/backend2）
   不被要求携带 binding 身份。静态依据：该审计器对 `bindingParserProducerSourceIndex < 0` 的节点
   `continue`（`typed_expr.cheng:3318-3324`），实跑未验。
5. **非字面量 RHS 的模块级 const 在表达式位置仍然 panic**（`const X = A * 2`、`const X = f()`）；
   本补丁**不修**。这是本形态的已知缺口，需要另一单（把 parse 期 int32 常量表向 typed_expr 暴露）。
6. **跨模块限定常量**（`alias.Name`）不经过本函数，未覆盖、未验证。
7. **模块级 `var`/`let` 在表达式位置读取**仍是原 panic（既有行为，本补丁未改，也不该在本单改）。
8. **`probe_local_only` / `probe_const_only` 的真实源码差异未核**（探针源已被清理），只有产物读数。
9. **本报告未测**四件夹具在本补丁之后是否真的 `rc=0` —— 它们可能（很可能）推进到**下一道墙**
   （例如结构索引元件布局、覆盖闸、所有权面）。**"设计完成"不等于"已修复"**。
10. 补丁基于**当前工作树**（`typed_expr.cheng` 有他人未提交改动）生成；行号以本席 `read` 到的
    worktree 版本为准（`git rev-parse HEAD = bef1894fa3ee9ba95e60d02bb895867e6534c69e`）。
    若该文件在落树前被其他手改动，需以 `git apply --check` 重验（本 patch 的锚点上下文是
    `declarationSourceLocalRow` 读取尾部 + `parserFunctionRow` 读取头部，改到该区域才会冲突）。
