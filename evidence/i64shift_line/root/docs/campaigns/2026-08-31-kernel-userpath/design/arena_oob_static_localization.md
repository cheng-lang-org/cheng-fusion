# arena OOB（`arena array: read out of bounds`）修法设计

对象：`src/core/lang/typed_expr_type_arena.cheng`（工作树 10373 行快照，2026-09-11 21:5x）。
补丁：`patches/s1b_step3p_forward_declaration_failclosed.patch`（4 hunk，`git apply --check` rc=0，22 个 `+` 行，未改源文件本体）。

---

## 0 结论

1. **机制**：preflight 拿 `state.authority` 里的**全局** `declarationRoot` 去读 `value.typeSyntaxGenericSymbolCounts` —— 这是一根**按源前缀物化**的列，`len` 只到"已 append 的源"为止。声明根落在**后面的源**（前向跨源边）时，读点直接越过 `len`，`ArenaArrayInt32Get` 抛出无坐标判词。lldb 栈与源码逐帧对得上（§1）。
2. **`genericCount` 判什么**：判同一个 `Base[...]` 语法是**定长数组**还是**泛型应用**，并给 arity / 尾部默认 / childCount 三条断言提供上界。它必须来自**声明根**，不能来自本源（§2）。
3. **三选一：选 (c)（读点 fail-closed）**，但**它只是诊断步，不是解**——234 源门内 source 0 仍会失败，只是由 panic 变成带坐标判词。(a) 单独不充分：计数从全局侧拿到之后，下一跳是 base 那个 Nominal 行自己的 `ResolveNominal`，它要的是**声明根的 TypeId**，而那个 TypeId 是**声明源被 append 时**才预留出来的，前向边下根本还不存在（§3.1）。(b) 不可能：要让声明先于使用物化，必须改 `orderedSources` 顺序，那会改掉所有全局行基址 ⇒ 索引行序 / 收据 / artifact 哈希全变（§3.2）。
4. 补丁里另含 **一条真修（不是诊断）**：`typedExprTypeArenaReserveAggregate` 用 `state.tree`（单源树）配**全局行** `declarationRoot` 读 producer source —— 改成读 arena 同名列。这是 src≥1 的**静态可证必然越界**，且整林驱动下取值逐字等价（§4 hunk 1）。
5. **本单未编译、未运行**；全部断言可复现到 file:line（§6 列了未测项）。

---

## 1 机制：lldb 栈 → 源码逐帧

| lldb 帧 | 现文件位置 | 事实 |
|---|---|---|
| `#2 ArenaArrayInt32Get` | `src/core/runtime/arena.cheng:400-402` | **全仓唯一**产出该句判词的点：`if i < 0 \|\| i >= arr.len: panic("arena array: read out of bounds")`。只有 `Get`/`U8Get`/`GetByte` 三族，U8 与 byte 各自另有判词 ⇒ 命中的必是 `ArenaArrayInt32Get`。 |
| `#3 typedExprTypeArenaSyntaxGenericSymbolCountAt` | `:485-489` | 裸访问器，**无任何守卫**，直接 `ArenaArrayInt32Get(value.arena, value.typeSyntaxGenericSymbolCounts, row)`。（对照：`typedExprTypeArenaInt32At :1496` 是**带守卫**的同族，判词是 `typed expr type arena: read out of bounds`，与本次观测句不同 ⇒ 排除。） |
| `#4 typedExprTypeArenaPreflightBracketAuthority` | 入口 `:1873`；读点 `:1918-1920` | `declarationRoot` 取自 `:1915-1917` 的 `state.authority.declarationRootTypeSyntaxNodeIndexes[authorityRow]` —— **全局行**。守卫只有 `authorityRow >= 0`（`:1910`）。 |
| `#5 TypedExprTypeArenaAppendSourceFromTreeInto` | `:7884`；preflight 调用点 `:7960` | 逐源 append 相；调用方驱动 `CompilerCsgStreamTypeArenaFromDeclarationIndexInto`（`src/core/tooling/compiler_csg.cheng:35802`）。 |

列的行空间：

* `value.typeSyntaxGenericSymbolCounts` 预留长度 = `limits.typeSyntaxCount` = **全林**（`:3979-3980`；`candidate.typeSyntaxCount = index.typeSyntaxCount`，`:3876`）。
* 该列**逐源**追加：`FillTypeSyntax` 每行一次 `ArenaArrayInt32Add`（`:6409-6411`）⇒ `len` = **已物化前缀**（= `viewTypeSyntaxBase + viewTypeSyntaxCount`）。
* preflight 自己那条拍板检查（`:1888-1893`）恰好把"已物化前缀 == 本源的全局区间末端"钉死：`value.typeSyntaxParserKinds.len != viewTypeSyntaxBase + viewTypeSyntaxCount` 即判词。
  ⇒ **`declarationRoot >= value.typeSyntaxGenericSymbolCounts.len` ⟺ 声明根在本源之后（前向跨源边）**。这不是推测，是 `:1888-1893` + `:3979-3980` 两条直接推出来的。
* `authorityRow` 只在 Nominal / Qualified 行上写（`add(out.typeSyntaxNodeIndexes, globalRow)`，`:4788` 与 `:4830`）⇒ `authorityRow >= 0` 就蕴含基座是 Nominal/Qualified，preflight 里那个 kind 判断是冗余的，`InternSyntaxRec :7154-7156` 无条件读同一列也就在同一条可达路径上。

**同类第二跳（同源）**：`typedExprTypeArenaResolveNominal`（`:1675`）——裸 nominal 前向边走这条：`:1789-1792` SymbolId 检查（closure8 之后**必然通过**，因为 `symbolByDeclarationRoot` 已由索引播种）→ `:1793-1795` 读 `typeSyntaxDeclarationOwnerTokenIndexes[declarationRoot]`（**另一个按源前缀列**）→ 同样 panic。再往后 `:1802-1805` 读 `typeSyntaxTypeIds[declarationRoot]`，即便物化也只会得到 `-1` ⇒ 判词 `declaration TypeId is unavailable`。⇒ **closure8 把判词换成了 panic**，与本单观测一致。

---

## 2 `genericCount` 判什么（修法不能跑偏的前提）

`Base[args]` 这一种语法有两种语义，parser 不区分，TypeArena 必须判：

* `T[N]`（`T` 是普通类型，N 是 const 表达式）⇒ **定长数组**；
* `Foo[A]`（`Foo` 是泛型声明）⇒ **泛型应用**。

判据只能是"基座**声明**了几个泛型形参"，四个用途都在 `genericCount` 上：

| 用途 | 位置 | 内容 |
|---|---|---|
| Apply vs FixedArray 分叉 | preflight `:1923`；`InternSyntaxRec :7157` | `genericCount > 0` 走 Apply，否则走 `state.bracketConstLengths[row] > 0` 的 FixedArray |
| arity 上界 | `:1930-1934`；`InternSyntaxRec :7163-7164` | `argCount <= 0 \|\| argCount > genericCount` ⇒ `generic application arity authority mismatch` |
| 尾部省略实参必须有默认 | `:1945-1950` | `argCount..<genericCount` 每个形参都要有 default TypeSyntax |
| child CSR 对齐 | 同上 | `childCount != argCount + 1` |

**为什么必须看声明侧，不能看本源**：

* `typeSyntaxGenericSymbolCounts[baseRow]` 是**基座那一行自己**声明的形参个数。基座行是 Nominal **引用**行（无泛型形参），它声明几个形参这件事只写在**声明根行**上，使用点不重复形参表。
* 实参可以省略尾部（有默认值），所以 `argCount` 也不等于形参个数。二者只能问声明。
* `genericStart`（同一列族的 Start）是**全局泛型符号行窗口基址**，用来索引"默认类型 / 约束"两根列 —— 也只有声明根知道。

⇒ 这个判据在 **三处**被用：preflight `:1918-1920`、`InternSyntaxRec :7154-7156`、`CompleteGenericArgumentsInto :6094-6098`。**只修 preflight 一处只是把 panic 往后挪一跳。**

---

## 3 三选一与判据

### 3.1 (a) 计数改从全局侧取 —— **不充分**
事实：S1a 索引**没有**"声明根 → 泛型符号数/窗口"的列。逐列核过 `TypedExprTypeDeclarationIndex`（`:101-142`）：`producerSourceIndexes / declarationNameTexts / declarationKinds / declarationExportedFlags / globalTypeSyntaxRoots / globalDeclarationRows / *BaseBySource / *CountBySource / declarationSymbolGlobalRoots / producerSourceCount / typeSyntaxCount / declarationCount / sealed`，只有**按源总数**（`genericSymbolCountBySource :137`）与**按源基址**（`typeSyntaxBaseBySource :110`），没有按声明根的窗口。要做 (a) 必须新增列 + 穿 `TypedExprTypeArenaAllocateFromLimitsInto :7819` / `typedExprTypeArenaBuildStateInitInto :4881` / 整林驱动 `:8095` 与流式驱动 `compiler_csg.cheng:35666` 两个调用点。

更关键的是**它单独不够**：计数拿到之后，同一个 bracket 行的**基座 Nominal 行更早被访问**（子行先于父行），走 `ResolveNominal`，那里要 `typeSyntaxTypeIds[declarationRoot]`。而声明根的 TypeId 是**声明源被 append 时**由 `typedExprTypeArenaReserveAggregate` 写进去的（`:1382-1384`，由 `ReserveAggregatesRec :6942` 逐源驱动）。声明在后面的源 ⇒ 这个 TypeId **还没被算出来**（不是"没物化"，是"不存在"）。同一理由适用于泛型尾默认/约束：它们的 TypeId 也在后续源里。

⇒ (a) 是**将来真修的一部分**（配合 3.3 的推迟/定序才成立），**不是本轮可闭环的解**；且它仍必须把三处读点全部改成全局侧并加 fail-closed，改动面 ~14 hunk、全新索引列、无编译验证 —— 本轮风险最高。

### 3.2 (b) 保证 preflight 之前声明根已物化 —— **不可能**
物化顺序 = `orderedSources` 顺序，由 `CompilerCsgSortSourcePathModulePairs`（`compiler_csg.cheng:26881` 起）按**路径/模块对**排序，**不是依赖序**（`pair2_ord1` rc=0 / `pair2_ord2` rc=1 就是这个事实的实测对照）。要让声明先于使用，只能改全局源序 ⇒ 所有 `typeSyntaxBaseBySource` / token / function / SymbolId 基址全变 ⇒ 索引行序、收据、artifact 哈希全变。那是另一个战役的决定（且 import 环下也不可能完全定序）。

### 3.3 (c) 读点 fail-closed —— **本轮采纳，但明确是诊断步**
* 它**不放松任何守卫**：只把"越界读"换成"带坐标判词"，所有既有判词与分支原样保留、顺序不变（`ResolveNominal` 里我把新守卫放在 `declaration SymbolId is not materialized` **之后**，closure8 的判词分级不被扰动）。
* 它**不是解**：234 源门内 source 0 会由 panic 变成判词，`forest_appended` 仍为 0。**不要把它记成"门内达标"**。
* 它的价值：一次运行就把"前向跨源边"的**全部**坐标打出来（而不是一次一个 panic），足以支撑下一步在"改源序"与"加推迟解析"之间的架构决策。
* **不需要额外插桩探针**：要区分的两个假设（"未物化前缀" vs "跨源基座"）由判词自带的坐标即可判定 —— `declaration_root >= view_base + view_rows` ⇒ 声明在**后面的源**；`view_base <= declaration_root < materialised` ⇒ 只是同源视图坏了（当前不可能，出现即说明 `:1888-1893` 的拍板被绕过）。判词里 `materialised` 取的是**被读列自己的 `len`**，所以它同时是该 panic 的精确触发条件。

---

## 4 补丁（`patches/s1b_step3p_forward_declaration_failclosed.patch`）

| # | 位置（现文件行） | 性质 | 内容 |
|---|---|---|---|
| 1 | `:1372-1375` | **真修** | `typedExprTypeArenaReserveAggregate`：`parser.ParserValueExprTypeSyntaxProducerSourceIndexAt(state.tree, declarationRoot)` → `typedExprTypeArenaSyntaxProducerSourceIndexAt(localOut, declarationRoot)`。 |
| 2 | `:1786-1795` | fail-closed | `ResolveNominal`：读 `typeSyntaxDeclarationOwnerTokenIndexes[declarationRoot]` 之前，用**被读列的 `len`** 挡一道，判词带 `nominal_row / declaration_root / materialised / total`。 |
| 3 | `:1910-1921` | fail-closed | preflight（lldb 落点）：读 `typeSyntaxGenericSymbolCounts[declarationRoot]` 之前挡一道，判词带 `bracket_row / base_row / authority_row / declaration_root / view_base / view_rows / materialised / total`。 |
| 4 | `:7150-7157` | fail-closed | `InternSyntaxRec` 同一前向边（preflight 之后的下一跳），同坐标集。 |

**hunk 1 为什么是真修、且为什么是必然越界**：

* `declarationRoot` 是**全局行**：它来自 `symbolDeclarationRootTypeSyntaxNodeIndexes`，写的是 `viewTypeSyntaxBase + typeSyntaxNodeIndex`（`FillDeclarationSymbols` 的追加点 `:6908`）。
* `state.tree` 是**当前源的单源树**，行空间是 `0..<tree.typeSyntaxCount`（`state.tree = share(tree)`，`:7939` 区域）。两者只在源 0（base=0）重合。
* 源 k≥1 的越界条件是 `Σ_{j<k} count_j + localRow >= count_k`；只要前面源的总 TypeSyntax 行数 ≥ 本源的 `typeSyntaxCount`，**该源第一个聚合声明就必越界**（对象/ref object/enum 或它们的字段声明）。
* 等价性：`FillTypeSyntax` 往该列写的就是 `viewProducerSourceBase + ParserValueExprTypeSyntaxProducerSourceIndexAt(tree, row)`（`:6356-6359`）。整林驱动 `viewProducerSourceBase = 0`、行空间即全局 ⇒ 换读 arena 列**取值逐字相同**；流式驱动下才是正确值。**这是坐标替换，不是重新推导。**同形调用在本文件已有先例：`:1993-1996` 与 `:2296-2297` 都是 `typedExprTypeArenaSyntaxProducerSourceIndexAt(localOut, declarationRoot)`。
* 唯一调用者是 `ReserveAggregatesRec :6981`，`declarationRoot` 恒为当前源已 `FillTypeSyntax` 物化的行 ⇒ arena 列该行必然可读。

**编译级核账（逐块，块内标识符在该插入点是否已绑定）**：

| hunk | 引用 | 绑定证据（现文件行） |
|---|---|---|
| 2 | `typeSyntaxNodeIndex` / `localOut` / `declarationRoot` | `fn typedExprTypeArenaResolveNominal :1675` 形参；`declarationRoot` 于 `:1785` 绑定 —— 均在插入点 `:1793` 之前。 |
| 2,3,4 | `typeSyntaxDeclarationOwnerTokenIndexes` / `typeSyntaxGenericSymbolCounts` | `TypedExprTypeArena` 字段，`:3969` 与 `:3979` 由 `typedExprTypeArenaReserveColumn` 赋值。 |
| 3 | `viewTypeSyntaxBase` / `viewTypeSyntaxCount` | preflight 形参 `:1876-1877`（入口 `:1873`）。 |
| 3,4 | `baseTypeSyntaxNode` / `authorityRow` / `declarationRoot` | `:1905` / `:1907` / `:1915`（preflight）、`:7144` / `:7147` / `:7151`（InternSyntaxRec）—— 均在各自插入点之前。 |
| 3 | `Fmt` 槽里写 `{...len}` 成员访问 | 仓内既有已编译先例：`:1894` 的 `materialised={value.typeSyntaxParserKinds.len}`。 |
| 4 | `typedExprTypeArenaSyntaxProducerSourceIndexAt` | 定义 `:411-417`，在调用点 `:1374` **之前**（函数序无关，但此处仍在前面）。 |

**未放松任何守卫**：4 个 hunk 全部是新增分支或等值替换；`ResolveNominal` 的 `declaration SymbolId is not materialized` 仍先于新守卫触发；三处新守卫在**整林驱动**下恒不触发（整林 `len == typeSyntaxCount`，而 `:1786` 已保证 `declarationRoot < typeSyntaxCount`）。

---

## 5 验证计划

1. 编译（本席禁止；需执行手）。
2. 跑 `r8_btypes_const_bracket_main` / `closure8` / `pair2_ord2`：**期望不再出现** `arena array: read out of bounds`，改为
   ` typed expr type arena: bracket base declaration is not materialised bracket_row=… base_row=… authority_row=… declaration_root=… view_base=0 view_rows=… materialised=… total=…`
   或 ` typed expr type arena: nominal declaration is not materialised nominal_row=… …`。
3. 读坐标定性：`declaration_root >= view_base + view_rows` ⇒ 被引声明在**后面**的源（前向边）⇒ 下一步是架构选择（改源序 / 加推迟解析），不是继续加守卫。
4. 234 源门：**预期仍是 `rc=1`、`forest_appended=0`，但末行从 panic 变判词**。这**不算达标**。
5. **反回归（整林驱动必须逐字节不变）**：`src/tests/typed_expr_type_arena_smoke.cheng`（走整林驱动 `TypedExprTypeArenaBuildFromParserTreeInto :8070`，它调 `AllocateFromLimitsInto :8095` / `AppendSourceFromTreeInto :8102`，base 全 0）。四 hunk 在整林下：hunk 1 取值等价；hunk 2/3/4 恒不触发 ⇒ `artifactRaw32` 应不变。
6. **若修法错了会先在哪暴露**：
   * hunk 1 取错值 ⇒ 先在 `typed expr type arena: declaration SymbolId derivation mismatch` / `exact nominal edge token mismatch` / `origin producer source` 类判词或整林冒烟上红。
   * hunk 2/3/4 守卫过宽（误伤整林）⇒ 会看到自相矛盾读数 `view_base=0` 且 `declaration_root < materialised` 却触发判词 ⇒ 立即回退，说明判据写错（应为被读列的 `len`，不是 `typeSyntaxCount`）。
   * panic 换位（如 `ResolveNominal` 尾部的 `str[]` 读抛 `seq index out of bounds`）⇒ 说明 hunk 2 没拦住，检查是否误用了 `typeSyntaxCount` 当界。

---

## 6 未测项（诚实清单）

1. **未编译、未运行**（槽位被占，本席只读）。一切"取值等价/恒不触发"是静态推理，不是实测。
2. 补丁针对 `typed_expr_type_arena.cheng` **10373 行**的工作树快照；该文件本轮正被另一手编辑（我观测到 20 分钟内 +194 行、lldb 帧行号 1868/1913 已漂到 1873/1918）。`git apply --check` 现为 rc=0 且逐行 context 比对 0 失配，但**再次编辑后需重取上下文**。
3. 未证明 234 源 source 0 的前向边一定落在 **bracket 基座**型（lldb 栈显示是）；裸 nominal 前向边是另一条同类路径（hunk 2 覆盖），二者都未运行验证。
4. 未核"别处是否已把声明级泛型窗口哈希/CID 化"（只逐列核了索引类型 `:101-142` 没有该事实）。
5. `orderedSources` 可否拓扑化、代价与哈希影响面：**未评估**（属另一个决定）。
6. 未核 `pair2_ord1`（rc=0）是否恰好因为基座声明在**前面**的源 —— 若成立，可作为"源序即根因"的现成对照，但本席无运行时证据。
