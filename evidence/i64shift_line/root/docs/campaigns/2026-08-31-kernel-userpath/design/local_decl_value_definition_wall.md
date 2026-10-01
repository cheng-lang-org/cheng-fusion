# `compiler snapshot builder: Local declaration lacks exact value definition` 定位与修法

只读源码 + 出补丁；**全程未运行任何编译/烤制/lldb**（2026-09-11 22:4x，cd /Users/lbcheng/cheng-lang）。
锚定：`src/core/tooling/compiler_snapshot_builder.cheng` 工作树 `sha256=c4b09f68825bdff7b51fea7287902d18c78b5bcef2149a41612f38533c3a2ae0`（26,123 行，`git hash-object=9748371d165ef8b4b20e50e70fd59cd580ba970a`；**该基已含** `patches/object_field_typearena_text_fixpoint.patch`）。**下文的 `:行号` 一律指这个补丁前状态**（补丁后行号会随插入的注释位移）。
补丁：`patches/local_symbol_domain_function_scoped.patch`（3 hunk，`+31 / −8`，`git apply --check` rc=0；**未改仓库源文件本体**，`git hash-object` 前后一致）。
**注意两件补丁的先后**：`object_field_typearena_text_fixpoint.patch` **已由槽位持有者落树**（当前工作树 = 它的目标态 `c4b09f68…`）⇒ 对当前工作树再 `git apply --check` 那件会报 `patch does not apply`（预期，非缺陷）；本件（第二件）的基态 = 已含第一件的工作树，`git apply --check` = **rc 0** ✓。

---

## 0. 结论先行

1. **假设成立（证实）**：判词由**模块级 `const` 块条目**触发——它是 `ParserDeclarationLocal` 行、`declarationFunctionRows == -1`，**不可能**有函数局部 value definition，而 `:18422-18429` 的循环要求**每一条** Local 行都被"精确 value definition"见证过。
2. **但修法不止一处**：同一"Local 行 ⇒ 必有 definition"的假设在本文件有**三处计数器**，且它们互相咬合（`:18422`、`:19045`、`:24392`）。只收窄第一处，墙会立刻挪到 `:19087` 的 `declaration authority destination invalid`（符号数守恒式当场不成立）。补丁**同时收窄三处**，且**只改计数、不改任何符号的追加**（不新增/不删除任何 symbol ⇒ 产物身份面零变化）。
3. **不是放宽**：三处收窄用的判据是 `declarationFunctionRows[row] >= 0`（"这条声明属于某个函数"），与 CSG 侧把同种行判成**全局声明**的判据（`compilerCsgParserGlobalDeclaration` `compiler_csg.cheng:33484-33497`：`kind==Local && functionRows==-1 && scopeKind==Source`）**同一把尺子**；被跳过的行是**语义上不属于**函数局部符号域的行。**函数局部** Local 行一条都没少：既仍被计数、也仍被"必须被见证"的硬判拦住（`:18427-18429` 原样保留），三条相等式（`expectedLocalCount == bindingDefinitionCount`、守恒式、`projectedLocalDeclarationCount == expectedLocalDeclarationCount`）全部保留 ⇒ 真丢覆盖会**响亮失败**，不会静默通过。
4. **边界问题（模块级 `var`）**：**必须与 const 同样跳过，且判据只能是 `functionRows < 0`**——四条独立证据见 §6。用"没有 definition 就跳过"（而非"不属于函数就跳过"）才是放宽，本补丁没有那样做。

---

## 1. 判词链（file:line）

### 1.1 落点

`src/core/tooling/compiler_snapshot_builder.cheng:18422-18429`，函数 `compilerSnapshotBuilderAppendLocalSymbolsInto`（`:18006`）：

```
    var expectedLocalCount: int32
    for declarationRow in 0..<declarationCount:
        if tables.parserSidecars.declarationKinds[declarationRow] ==
               Int32(parser.ParserDeclarationLocal):
            expectedLocalCount = expectedLocalCount + 1
            if !localDeclarationSeen[declarationRow]:
                err = " compiler snapshot builder: Local declaration lacks exact value definition"
                return false
```

调用链：`compilerSnapshotBuilderTypeFunctionProjectValidatedInto`（`:23527`）→ `:24124` 调 `AppendLocalSymbolsInto` → 内部 `:18422` 判词。上游 `:23541` 先跑 `compilerSnapshotProductionUnsealedBaseStrictValidateInto`（`:21306`），后者 `:21321` 调 `compilerSnapshotBuilderParserShape`（`:788`）逐列钉死 `declarationKinds.len == declarationFunctionRows.len == declarationCount` ⇒ **`declarationFunctionRows[declarationRow]` 在本判词点可安全下标**（这是补丁新增读取该列的前提，不是新假设）。

### 1.2 `localDeclarationSeen` 只可能由"绑定初始化式 value definition"点亮

- 置位点唯一：`:18420 localDeclarationSeen[declarationRow] = true`，位于遍历 `tables.valueDefinitions` 的循环内。
- 进入该置位点的门：`:18212-18223` 只放行 `originKind == CsgCompilerValueDefinitionOriginBindingInitializer`；其余 origin 必须 `groupRow == -1`，否则 `non-binding value-definition retained Local group edge`。
- 且要求该 definition 的声明行**属于一个函数**：`:18293 ownerSymbolId != tables.functions.symbolIds[functionId]`（`ownerSymbolId` 来自 `functionSymbolByDeclaration[ownerDeclaration]`，只对 `ParserDeclarationFunction` 填充）⇒ 模块级声明即便有 definition 也会在此响亮失败。

⇒ 判据链 = `(#Local 行) == (#BindingInitializer definition)`。两边的成员集合必须一致；模块级 const 在第②集合里**结构性缺席**。

---

## 2. 假设证实（不是照抄，四条独立证据）

**E1 算术证据（实测 stderr）**：`.rebuild/s1b_step3/r9/fx_r8_fixed_len_named_const_main.stderr.txt:10`
`csg_mem tag=decl_index entries=1 sources=1 type_syntax=7 declarations=6 verified=0`。
`r8_fixed_len_named_const_main.cheng` 的声明行恰好 6 条：`const SlotCount`(**Local,-1**)、`type Slots`(Type)、`used`(Field)、`values`(Field)、`fn main`(Function)、`var s`(**Local,≥0**) ⇒ **Local 行 = 2**，其中只有 `s` 可能有 definition。

**E2 `s` 一定有 definition**：裸聚合 `var s: Slots` 的 defining 模板在 `typed_expr.cheng:29816` 调 `typedExprIrAddAggregateZeroDeclarationLocalTemplate`（`:29522`），其模板判据第 1 条硬性要求 `declarationFunctionRows[aggRow] == ir.valueExprCurrentParserFunctionRow`；消费点 `TypedExprIrConsumeDeclarationLocalValueDefinition`（`:5727`）以 `TypedExprValueDefinitionOriginBindingInitializer`（`:5800-5801`）落 definition。⇒ `bindingDefinitionCount ≥ 1`，而 `localDeclarationSeen` 只可能点亮 1 条 ⟹ **未被点亮的必是 const 行**。

**E3 模块级行拿不到 definition（结构性，不可绕）**：`TypedExprIrAppendLocalDeclStatementsForScope`（`:29831`）只遍历**函数作用域行区间**（`:29836 for lineNumber in (scope.startLine + 1)..scope.endLine`），调用点 `:61680/:61865/:62069` 均在函数作用域处理内 ⇒ 模块级行从不产生本地 decl 语句 ⇒ 从不产生 definition。

**E4 分类尺子已有权威定义**：`compiler_csg.cheng:33484-33497 compilerCsgParserGlobalDeclaration` 用 `kind==Local && declarationFunctionRows==-1 && lexicalScopeKinds[scope]==Source` 判定"**全局声明**"；本战役 ⓪（`s1b_step3l`）正是给这类行补全局绑定（`inGlobalVarBlock` 早已覆盖 `var`，⓪ 补的是 `const`）。⇒ 这些行的归属域是**全局绑定域**，不是函数局部 value-definition 域。

**结论**：假设成立；且更进一步——**收窄必须覆盖三处计数器**（§3），否则立刻在守恒式上炸。

---

## 3. 为什么必须同时动三处（三处咬合，缺一即换墙）

| # | 位置 | 计数器 | 用途 | 不收窄的后果 |
|---|---|---|---|---|
| 1 | `:18422-18429` | `expectedLocalCount` = #Local 行 | 逐行见证 + `expectedLocalCount != bindingDefinitionCount` | 本判词（当前墙） |
| 2 | `:19045-19049`（同文件 `compilerSnapshotBuilderDeclarationAuthorityCommitInto` `:19014`，调用点 `:24152`） | `localDeclarationCount` = #Local 行 | 符号守恒式 `:19073-19078`：`symbolCids.len == function + extern + source + type + field + param + **local** + generic` | 判词换成 `:19087 declaration authority destination invalid` |
| 3 | `:24392-24401` | `expectedLocalDeclarationCount` = #Local 行 | 对比 `projectedLocalDeclarationCount`（**符号域**计数，`:24177`/`:24345`） | 判词换成 `:24401 declaration Symbol projection coverage drift` |

**四件夹具上的守恒式验算**（可为烤炉复核）：符号追加侧 = 1 fn + 0 extern + 1 source + 1 type + 2 field + 0 param + **1 local(`s`)** + 0 generic = **6**；收窄前公式 = 6 + 1(多算的 const 行) = **7 ≠ 6** ⇒ 只修 #1 必在 `:19087` 炸。收窄后 6 == 6 ✓。

---

## 4. 修法（补丁已落）

`patches/local_symbol_domain_function_scoped.patch`（3 hunk，`+31 / −8`）：

- **#1** `:18422` 循环首加 `if kind != Local || declarationFunctionRows[row] < 0: continue`，把"计数 + 必须被见证"两条一起收窄到函数局部行（`err` 文本、返回语义**逐字未变**）；
- **#2/#3** 在两个 `elif ... == ParserDeclarationLocal:` 条件后追加 `&& declarationFunctionRows[row] >= 0`；
- 附一段说明注释（讲清"Local 符号域 = 函数局部域"与三条身份为何仍然成立）。

**不改**：任何 `add(tables.symbols.*)`、任何 proof/CID 计算、任何判词文本、任何其它判据。

---

## 5. "不放宽"论证（逐条）

1. **判据没变，只是作用域变正确**：三处用的都是 `declarationFunctionRows >= 0`（既有的、已被 `ParserShape` 校验过长度的列，且是 CSG 分类全局声明用的同一判据）。**没有**用"有没有 definition"当跳过条件——那才是放宽（会连带放过一个**函数局部**却丢了 definition 的声明，正是该守卫要抓的）。
2. **函数局部的覆盖一条不少**：`expectedLocalCount` 仍数每一条函数局部 Local 行，`!localDeclarationSeen` 仍逐条硬失败（`:18427-18429` 原样）。
3. **三条相等式全部保留**：`expectedLocalCount == bindingDefinitionCount`（`:18430`）、符号守恒式（`:19073-19078`）、`projectedLocalDeclarationCount == expectedLocalDeclarationCount`（`:24399`）。任何"被计数却没 definition"或"有 definition 却没被计数"的行都会打破其中一条 ⇒ **fail-closed 不变**。
4. **符号域零变化**：置位与 `add(tables.symbols.*)` 的位置/条件**一行未动** ⇒ 追加的符号集合与顺序不变 ⇒ `symbolCids`、proof CID、portable/回放面**逐字节不变**（这正是"只改期望值、不改产物"）。
5. **新读列表有上游保证**：`declarationFunctionRows` 与 `declarationKinds` 等长由 `ParserShape`（`:788`，`:874-876`）在 `:23541` 先行断言 ✓。

---

## 6. 边界：模块级 `var`（必须回答的那个）

**结论：模块级 `var` 与模块级 `const` 同等对待（一并跳过），且判据只能是 `declarationFunctionRows[row] < 0`。**

四条证据：

1. **parser 侧同形**：两者都经 `ParserValueExprAppendDeclaration`（`parser.cheng:9618`）以 `ParserDeclarationLocal` + `tree.activeFunctionRow` 记录；模块级时 `activeFunctionRow == -1`（同一条记录路径，见 `parser.cheng:22062` 的 Local 追加点）。
2. **CSG 侧同一把尺**：`compilerCsgParserGlobalDeclaration`（`compiler_csg.cheng:33484-33497`）把"Local + functionRows==-1 + Source 作用域"统一定性为**全局声明**；⓪ 修复前 `var` 块（`inGlobalVarBlock`）已有全局绑定、`const` 块没有——两者在**全局绑定域**里是同类。
3. **IR 侧结构性缺席**：`TypedExprIrAppendLocalDeclStatementsForScope`（`typed_expr.cheng:29831-29836`）只走函数作用域行 ⇒ 模块级 `var` 与 `const` 一样拿不到 `BindingInitializer` definition；而消费点 `TypedExprIrConsumeDeclarationLocalValueDefinition`（`:5727`，`:5754-5757`）硬性要求 `declarationFunctionRows == ir.valueExprCurrentParserFunctionRow` ⇒ 即便有人硬塞也会 panic，不会静默成 definition。
4. **Local 符号 Cid 的证明形状排斥它**：`:18352-18388` 的 `definitionProofCid` 是 `(sidecarCid, groupRow, definitionRow, declarationLocalRow, patternLocalRow, bindingOffsets/Counts, definingTypedNodeId, typeCid)` 的哈希——全是**函数局部表**的坐标。模块级行没有这些坐标 ⇒ 要给它符号就必须新造一个证明域（新 origin/新列/新 CID），那才是真正的身份面变更，本墙不是那个问题。

**判据为何"精确"而非"过宽"**：跳过条件是"这条声明不属于任何函数"，不是"这条声明没有 definition"。后者会把**函数局部但丢 definition** 的行一起放过（真放宽）；前者只放过语义上属于全局绑定域的行，且一旦某条被跳过的行**其实**有 definition，它会先撞 `:18293` 的 `Local value-definition parser authority incomplete`（owner 不是函数），或撞 `:18430` 的 `expectedLocalCount != bindingDefinitionCount`（被计数集合与 definition 集合不等）——两条都是响亮失败。

**未测边界（诚实）**：**函数内** `const`（若有）走的是同一条 Local 记录路径且 `functionRows >= 0` ⇒ 仍被计数、仍要求 definition；若 IR 不为函数内 const 建 definition，本补丁**不会**掩盖它（那是一条独立的、真属于函数局部域的缺口）。本席未在仓内找到函数内 const 的夹具，未测。

---

## 7. 编译级自检

- 生成器 ``.rebuild/s1b_step3/r9/patchgen/local_symbol_domain_gen.py``：三处锚点各 `occurrences == 1`；改动落在 3 个 hunk（`18422`/`19047`/`24392`）。
- **重放对拍** `patch_verify_generic.py`：把补丁 hunk 独立重放到 `orig.cheng`，与 `target.cheng` **逐字节相同**（`554e92c25f083b6013e60f76d453a4b68551ed1e30247d22654722bcd4a39063`）；`+31/−8`，`−` 行全部是这三处的原判据行（18424-18429 / 19047 / 24392）。
- **标识符绑定点逐条核** `patch_idcheck_generic.py`：31 条新增行（16 条注释）中 15 条代码行，**每个标识符在使用点均已绑定**（`tables`/`declarationRow`/`continue`/`err` 等；`declarationRow` 由同函数 `for` 循环绑定），**无"引用后面才声明的 let"**。
- Cheng 陷阱：注释只出现在 `for` 循环**上方**（不在 `if/elif` 链中间、不在 `@borrows` 与 `fn` 之间）；多行 `||`/`&&` 续行后**不带注释**；新增读取的列有上游长度保证（§5.5）。

---

## 8. 验证计划与判错信号

1. `git apply --check` = 0（**已验**）；烤驱动后四件正例：**末行不得再是本判词**（rc=0 或推进），负例 `must be int32 name=SlotName statement_offset=752` 逐字不变。
2. **若只错在 #1 没收窄**：末行会是 `declaration authority destination invalid`（`:19087`）——这正是"三处咬合"的可判别信号。
3. **若收窄过宽**（跳过了本该被见证的函数局部行）：末行会是 `Local Symbol coverage mismatch`（`:18430` 分支，`err==""` 时的包装判词）。
4. **若模块级行本该被符号化**（我的 §6 判据错）：下一道墙应出现在**引用/绑定面**——如 `binding target parser declaration missing`（`:18725` 一带）或 compiler_csg 的 `parser-owned global coverage mismatch`（全局绑定域回归），而不是继续在计数面。
5. **字节中性回归**（与上一件补丁同口径）：三件 rc=0 夹具（`ordinary_zero_exit_fixture`/`call_fixture`/`cold_nested_fmt_interpolation_smoke`）两侧同 `--out` 串行两跑，sha 必须与 `kd_r9m` 侧逐字相同——本补丁只改期望计数，理应字节中性；**若这里出现 DIFFER，说明我关于"符号追加集合未变"的判断错了**，立即回退。

---

## 9. 未测项（诚实）

1. **未编译**：补丁的 Cheng 可编译性由烤炉负责；本席只做了静态绑定/语法构造核对。
2. 三处收窄的**充分性**基于"本文件只有这三处以 kind==Local 计数"（`grep -n "ParserDeclarationLocal"` 共 7 处，其余 4 处是逐行/逐符号校验，非计数）——若别处（其它文件）也以同样假设计数 Local 行，需另找（本席只在 `compiler_snapshot_builder.cheng` 内做了穷举）。
3. `SymbolCids.len` 在**含模块级 var/const 的源**上是否真的不含这些行的符号：由 §2/§6 的静态链推出（没有任何 appender 会为它们追加符号），**未动态核**；这正是 §8.5 字节中性回归要验的点。
4. 函数内 `const` 的形态未测（§6 末）。
5. 模块级 `let`/模块级 `var` 块与单行 `var` 是否都落同一条 parser 记录路径：`ParserValueExprAppendDeclaration` 的 Local 追加点全仓只有 `parser.cheng:22062` 一处（`grep` 全仓 12 个调用点中唯一以 `ParserDeclarationLocal` 为 kind）⇒ 静态上同形；未逐形态动态验。
