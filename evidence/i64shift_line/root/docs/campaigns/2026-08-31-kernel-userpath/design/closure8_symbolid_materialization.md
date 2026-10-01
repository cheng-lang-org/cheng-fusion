# closure8 `declaration SymbolId is not materialized` — 机制链与修法 (a) 设计

**状态：设计 + 补丁（未编译、未落树、未跑任何夹具）。本文件不是"已修复"报告。**

- 补丁：`patches/closure8_symbolid_from_index.patch`（`git apply --check` 通过，只含本单 hunk）。
- 失败点：`src/core/lang/typed_expr_type_arena.cheng:1745-1748`。
- 根因（一句话）：逐源流式驱动在**每源 append 内部**就立即做 nominal 解析，而 `state.symbolByDeclarationRoot` **只被填过已 append 的那些源**；任何跨源前向边（nominal 解析到森林里**排在后面**的源）查表必得 `-1`，逐字得到该判词。
- 修法 (a) 落地形态：索引新增一列**符号根平铺表** `declarationSymbolGlobalRoots`（森林序，行的下标**就是** SymbolId），Init 阶段一次性把全表种进 `symbolByDeclarationRoot`；`value.symbolCount` 顺序发号**保留不动**，并在 4 个点上 fail-closed 断言两种派生逐点相等。
- **一处与派单的偏差，必须先看**：派单要求断言 `Σ_s declarationSymbolCountBySource[s] == index 中的条目总数`。字面形态（右端 = `producerSourceIndexes.len`，即 `RootKind == TypeDeclarationRhs` 条目数）**不是一个恒等式**，见 §4。本补丁断言的是"Σ 逐源计数 == **符号空间自身**的行数"，并另加一道**拿驻留树逐源核对**的实打实断言（§3 断言 2）。要字面形态的三行改法也写在 §4。

---

## 1 机制链（逐跳 file:line，行号取自当前工作树）

### 1.1 失败那一跳

| 跳 | 位置 | 事实 |
|---|---|---|
| 1 | `typed_expr_type_arena.cheng:1631` | `typedExprTypeArenaResolveNominal(state, localOut, typeSyntaxNodeIndex, ...)` |
| 2 | `:1735-1736` | `authorityRow = typedExprTypeArenaAuthorityRow(state, typeSyntaxNodeIndex)`（二分 `state.authority.typeSyntaxNodeIndexes`，键是**全局**行） |
| 3 | `:1740-1741` | `declarationRoot = state.authority.declarationRootTypeSyntaxNodeIndexes[authorityRow]` —— **全局**声明根，可属于任意源 |
| 4 | `:1745` | `let symbolId = state.symbolByDeclarationRoot[declarationRoot]` |
| 5 | `:1746-1748` | `if symbolId < 0: err = " typed expr type arena: declaration SymbolId is not materialized"` |
| 6 | `compiler_csg.cheng:35764` | 该 err 被包装成 `TypeArena production failed source_index={sourceIndex}: {buildErr}` ⇒ 实测判词里的 `source_index=0` 就是这个循环变量 |

### 1.2 为什么 `symbolByDeclarationRoot` 那一刻是 `-1`

| 跳 | 位置 | 事实 |
|---|---|---|
| 1 | `compiler_csg.cheng:35669` | `for sourceIndex in 0..<work.orderedSources.len` —— 逐源主循环 |
| 2 | `:35732` | 每源先 append **该源自己**的 authority 行 |
| 3 | `:35747-35763` | 紧接着调 `TypedExprTypeArenaAppendSourceFromTreeInto(..., sourceIndex, sourceIndex, tokenBase, ..., declarationIndex.typeSyntaxBaseBySource[sourceIndex], ...)` |
| 4 | `typed_expr_type_arena.cheng:7578-7662` | 这一**个**函数内部按序做完：`FillDeclarationSymbols`（`:7641`）→ `BuildSyntaxOwnership`（`:7645`）→ `ReserveAggregatesRec`（`:7648`）→ **`InternSyntaxRec`（`:7657-7659`）** |
| 5 | `:6748-6811` | `typedExprTypeArenaFillDeclarationSymbols` 遍历 `0..<tree.typeSyntaxCount`（**本源的局部行**），只写 `viewTypeSyntaxBase + row` ⇒ 只覆盖**本源**的全局行；发号 `:6786`、写表 `:6787-6788`、自增 `:6810` |
| 6 | `:7657` | `InternSyntaxRec` 在**同一个 append 调用里**就跑解析，于是源 k 解析时，源 j>k 的行仍是 Init 时的 `-1`（初始化于 `:4805-4809`） |

全林驱动不会撞：`TypedExprTypeArenaBuildFromParserTreeInto:7757` 只有一棵合并树，`FillDeclarationSymbols` 一次填完全部声明根，之后才 `InternSyntaxRec`（`:7780` → `:7657`）。

### 1.3 跨源前向边确实存在（不是"只可能指向更小的行"）

| 跳 | 位置 | 事实 |
|---|---|---|
| 1 | `typed_expr_type_arena.cheng:4606` | `TypedExprTypeResolutionAuthorityAppendSourceInto`（每源追加 authority 行） |
| 2 | `:4684-4696` | 限定名：解析结果 `declarationRoot` 直接落进 `declarationRootTypeSyntaxNodeIndexes` |
| 3 | `:4727-4738` | 非限定名：`typedExprTypeAuthorityIndexResolveUnqualifiedInto` 的结果同样落列 |
| 4 | `:4463-4511` | 该函数：先在本源找（`:4472-4475`），找不到就走 **import fallback** |
| 5 | `:4486-4490` | `candidateRoot = typedExprTypeAuthorityIndexFindDeclaration(index, sortedEntryRows, imports.targetSourceIndexes[importRow], name)` —— **目标源只要求 `ownerSourceIndex == producerSourceIndex`（`:4480-4483`），对目标源的先后没有任何约束** |
| 6 | `:4421-4445` | `FindDeclaration` 返回 `index.globalTypeSyntaxRoots[entryRow]`（**全局**行），条目按 `(source, name)` 有序 |
| 7 | `:4426-4441` | 二分只按 `(entrySource, name)` 定键 ⇒ 返回值可属于**任何**源 |

⇒ 源 0 的一个 nominal 经 import 指到源 3 的声明根，是**语义合法**的边，而 `symbolByDeclarationRoot[该全局行]` 在源 0 解析时必然 `-1`。逐字复现判词。

**同一类缺陷还有第二处**（本补丁顺带一并修掉，因为同一个种子化动作覆盖它）：
`typed_expr_type_arena.cheng:7044-7047`，泛型应用取 `state.symbolByDeclarationRoot[declarationRoot]` 后 `if ... || symbolId < 0: err = " typed expr type arena: generic application arity authority mismatch"`；`declarationRoot` 同样来自 `authority.declarationRootTypeSyntaxNodeIndexes`（`:7034-7036`）。

### 1.4 两条顺序一致（修法 (a) 的全部依据）

| # | 事实 | 位置 |
|---|---|---|
| ① | 索引按**源序 + 源内行升序**登记，`globalTypeSyntaxRoots` 单调递增 | `:3666-3680`（`for typeSyntaxRow in 0..<tree.typeSyntaxCount`）+ `:3626`（`typeSyntaxBase + localRow`）；pass0 逐源调用于 `compiler_csg.cheng:33195`、seal 于 `:33213` |
| ② | `FillDeclarationSymbols` 也按**源序 + 源内行升序**发号，号码从 `value.symbolCount` 连续累加 | `:6756-6759`（过滤 `DeclarationCreatesSymbol`）+ `:6786`/`:6810`；源序由 `AppendSourceFromTreeInto` 的调用序保证（`compiler_csg.cheng:35669`） |

两条用的**是同一个谓词**：索引 pass0 与 append 相都调 `typedExprTypeArenaDeclarationCreatesSymbol`（定义 `:1383-1397`）。
⇒ **第 k 个被 append 的符号，其声明根就是索引里第 k 个符号根。** 这就是修法 (a)。

---

## 2 修法 (a) 的精确形态

### 2.1 用到的既有索引/计数（字段名 + 定义处）

| 字段 | 定义 | 填充 | 用途 |
|---|---|---|---|
| `declarationSymbolCountBySource: int32[]` | `:122` | `:3692`（本补丁改为由新列差值推出） | 逐源符号数 = 前缀和 `Σ_{s<src}` |
| `typeSyntaxBaseBySource: int32[]` | `:110` | `:3681` | 源 → 全局行基址（本补丁未直接用到，作为索引行序的证据） |
| `globalTypeSyntaxRoots: int32[]` | `:106` | `:3626` | `RootKind == TypeDeclarationRhs` 条目（**不等于**符号集合，见 §4） |
| `producerSourceIndexes: int32[]` | `:102` | `:3620` | 条目 → 源 |
| `producerSourceCount / typeSyntaxCount` | `:127-128` | `:3698-3699` | 全局行空间 |

**没有**现成的"逐源符号序号 / 符号根平铺表"——`declarationSymbolCountBySource` 只给了**计数**，没给**是哪些根**。缺失的正是"源内第几个符号"这半个信息。本补丁补的就是它。

### 2.2 新增一列（唯一的新数据）

```cheng
# typed_expr_type_arena.cheng:101 的 TypedExprTypeDeclarationIndex 内，:122 之后
declarationSymbolGlobalRoots: int32[]
```

- 语义：森林序下**每一个** `DeclarationCreatesSymbol` 为真的 TypeSyntax 行的**全局行号**，一行一个。
- 填充点：`:3685-3692` 那段**原本只做计数**的循环，改成"边走边登记"，源内计数由差值推出（一次遍历产出两个读数，不可能互相漂移）。
- 全林驱动没有索引，用同一个遍历函数在其合并树上跑一遍（`TypedExprTypeArenaBuildFromParserTreeInto:7775` 附近）。

### 2.3 恒等式

```
globalSymbolId(declarationRoot)
  = Σ_{s < src(declarationRoot)} declarationSymbolCountBySource[s]     # 前缀和
  + (declarationRoot 在源内的符号序号)                                   # 源内序号
  == row of declarationRoot in declarationSymbolGlobalRoots             # 平铺表下标
```

平铺表**把前缀和与源内序号合成了一次下标**，所以实现里不必真的做加法：`symbolId = 表内下标`。

### 2.4 生效方式：Init 期种子化（不是查找期特判）

`symbolByDeclarationRoot` 本来就是**全局行索引**的数组（`：4805-4809`，长度 = `typeSyntaxCount`）。所以修法 (a) 不需要一个新的查找函数，只要在 Init 阶段把整张表种进去：

```cheng
for symbolId in 0..<declarationSymbolGlobalRoots.len:
    symbolByDeclarationRoot[declarationSymbolGlobalRoots[symbolId]] = symbolId
```

此后：
- `:1745`、`:7045`、`:7146`、`:4987`、`:5000`、`:6770` 六处读点**一行不改**，语义变成"该根是否是一个符号根"，而不是"该根是否已被 append"；
- `FillDeclarationSymbols` 仍然按原顺序发号、仍然写同一个槽（幂等），只是多了一条"两种派生必须相等"的断言；
- 一切消费列（`symbolDeclarationRootTypeSyntaxNodeIndexes`、`symbolCount`、依赖图、SCC、member CSR）**顺序与内容完全不变**。

### 2.5 补丁 hunk 清单

| # | 文件 | 位置（旧行） | 内容 |
|---|---|---|---|
| 1 | `typed_expr_type_arena.cheng` | `:121` | 索引加列 `declarationSymbolGlobalRoots` |
| 2 | 同上 | `:338` | build state 加 `declarationSymbolTotal` |
| 3 | 同上 | `:1411` 后 | 新增 `typedExprTypeArenaAppendDeclarationSymbolRootsFromTreeInto`（**唯一遍历**，索引构建与全林驱动共用） |
| 4 | 同上 | `:3531` | 索引 shape：新列行序严格递增 + 界内 |
| 5 | 同上 | `:3684` | 索引构建：计数循环改为登记循环，逐源计数由差值推出 |
| 6 | 同上 | `:3841` | `TypedExprTypeArenaLimitsFromIndexInto` 入口：**断言 1** |
| 7 | 同上 | `:4308` | 逐源 verify 的 guard 补 `declarationSymbolCountBySource.len` |
| 8 | 同上 | `:4387` | `TypedExprTypeDeclarationIndexVerifySourceAgainstInto` 尾部：**断言 2（拿驻留树核对整片切片）** |
| 9 | 同上 | `:4789`/`:4805` | Init 加参 + 种子化（含种子合法性硬失败） |
| 10 | 同上 | `:6786` | `FillDeclarationSymbols`：**断言 3** |
| 11 | 同上 | `:7533`/`:7556` | `TypedExprTypeArenaAllocateFromLimitsInto` 透传 |
| 12 | 同上 | `:7673` | `TypedExprTypeArenaSealInto`：**断言 4** |
| 13 | 同上 | `:7773` | 全林驱动：从合并树建同表并透传 |
| 14 | `compiler_csg.cheng` | `:35634` | 流式驱动：把索引的符号根表交给 Init |

---

## 3 断言位置与判词文本（4 道，全部 fail-closed，无兜底）

| # | 函数入口 | 判词 | 抓什么 |
|---|---|---|---|
| 1 | `TypedExprTypeArenaLimitsFromIndexInto`（`:3797`，body 内 `:3841` 之后） | ` typed expr type arena: declaration symbol root authority mismatch per_source_sum={...} symbol_roots={...} sources={...}` | 索引里"逐源计数之和"与"符号根表行数"不一致 ⇒ 登记循环被改坏、某源被登记两次/漏登记 |
| 2 | `TypedExprTypeDeclarationIndexVerifySourceAgainstInto`（`:4292`，尾部 `:4387` 之后） | ` typed expr type arena: declaration symbol root count mismatch source_index={...} tree_roots={...} index_count={...}` / `... root slice mismatch source_index={...} symbol={...} tree_root={...} index_root={...}` | **实打实的那道**：拿**驻留的单源树**重跑同一个谓词，逐行比对索引该源的切片（基址由前缀和算）。这条不依赖任何"两个数字同源"的自证 |
| 3 | `typedExprTypeArenaFillDeclarationSymbols`（`:6748`，`:6786` 处） | ` typed expr type arena: declaration SymbolId derivation mismatch root={...} indexed={...} sequential={...}` | 索引派生号（种子里）与顺序计数器在**每个符号**上必须相等 |
| 4 | `TypedExprTypeArenaSealInto`（`:7667`，`:7673` 之后） | ` typed expr type arena: declaration SymbolId materialization mismatch materialized={...} indexed={...}` | 全部源消费完后，物化总数必须等于索引预测总数（防"少 append 一个源"） |

另加两处**非断言**的硬失败（防越界/错值，不是补丁的语义核心）：
- Init 种子化：` typed expr type arena: declaration symbol root seed invalid symbol={...} root={...} type_syntax={...}`（根越界或同一根被登记两次）。
- 索引 shape：`... declaration symbol root shape invalid ...` / `... row invalid ...` / `... order invalid ...`。

断言 2 的位置是刻意的：`compiler_csg.cheng:35721-35731` 在**每源 production 之前**就调它，且此时**该源的树还在手上**——这是整个流程里唯一能"拿真值反查索引"的时刻。放在这里，索引错在源头就炸，不会拖到解析期变成一个下游症状。

---

## 4 与派单字面形态的偏差（**必读**）

> **〔本席裁决（2026-09-11 深夜，独立复核后批准该偏差）〕** 已亲自 read 核对两侧判据，偏差成立，**按本补丁的形态落地**：`typedExprTypeArenaDeclarationCreatesSymbol`（`:1389-1397`）确为 `RootKind == TypeDeclarationRhs` **∪**（`FieldDeclaration` ∧ 该根自身语法 kind 属 `Object/ImplicitObject/RefObject`，经 `:1366-1380` 判定）⇒ **内联对象字段根确实发号**；而索引登记循环（`:3666-3670`）只收 `RootKind == ParserTypeSyntaxRootTypeDeclarationRhs` ⇒ 索引条目集是符号空间的**真子集**，字面断言 `Σ counts == index 条目总数` **不是恒等式**，会误杀含内联 object 字段的合法源——按"禁止误杀合法程序 + 只做可证的硬失败"，**驳回字面形态**。同时核过：`declarationSymbolCount` 的计数循环（`:3685-3692`）用的是同一个谓词 ⇒ 它与新增平铺表 `declarationSymbolGlobalRoots` 的登记集合**逐行同源**，断言 1 的右端取符号空间自身行数是自洽的；`value.symbolCount` 顺序发号与表下标一致的前提也由此保证。保留全部 4 道 fail-closed 断言（尤其 ② 拿驻留单源树对索引切片做反查，挂在 production 之前 `compiler_csg.cheng:35721`）——那才是真正兜住"索引与符号集合一致"的那一道，字面形态换成它也换不来更强的保证。
>
> **〔4 道断言的逐条落点（本席按补丁 hunk 反查 enclosing fn 核过，非转述）〕** ① `TypedExprTypeArenaLimitsFromIndexInto`（`typed_expr_type_arena.cheng:3797`）── 判词 `declaration symbol root authority mismatch per_source_sum=… symbol_roots=…`；② `TypedExprTypeDeclarationIndexVerifySourceAgainstInto`（`:4292`）── 判词 `declaration symbol root count mismatch source_index=… tree_roots=… index_count=…` 与 `declaration symbol root slice mismatch source_index=… tree_root=… index_root=…`（**这就是反查**，逐行拿驻留单源树对索引切片）；③ `typedExprTypeArenaFillDeclarationSymbols`（`:6748`）── `declaration SymbolId derivation mismatch root=… indexed=… sequential=…`；④ `TypedExprTypeArenaSealInto`（`:7667`）── `declaration SymbolId materialization mismatch materialized=… indexed=…`。另有 `typedExprTypeDeclarationIndexShape`（`:3495`）的形状/序断言（含 `previous=` 的严格递增检查）。种子化落在 `typedExprTypeArenaBuildStateInitInto`（`:4788`），新列经 `TypedExprTypeArenaAllocateFromLimitsInto`（`:7532`）与 `TypedExprTypeArenaBuildFromParserTreeInto`（`:7757`）贯通。

派单要求：`Σ_s declarationSymbolCountBySource[s] == index 中的条目总数`。

**字面右端（`index.producerSourceIndexes.len`）不是恒等式。** 证据：

- 符号谓词：`typedExprTypeArenaDeclarationCreatesSymbol`（`:1383-1397`）= `RootKind == TypeDeclarationRhs`（`:1390-1391`）**∪** `RootKind == FieldDeclaration` 且该字段根**自身**的语法 kind 是 `Object/ImplicitObject/RefObject`（`:1392-1397`，kind 判据在 `typedExprTypeArenaAggregateStructuralKind:1366-1380`）。也就是说：**内联对象/ref-object 字段根也发号**。
- 索引条目：只收 `RootKind == TypeDeclarationRhs`（`:3666-3670`）。
- ⇒ 只要闭包里有一个源写了"字段类型是内联 object"，`Σ counts > producerSourceIndexes.len`，字面断言就会**误杀一个合法程序**。
- closure8 / 234 源当前**实测相等**（`decl_index entries=…` 打于 `compiler_csg.cheng:39122`，`ta_limits … declaration_symbols=…` 打于 `:33224` 与 `:35631`，两者 1314 == 1314）——这是**巧合级别的语料事实，不是不变量**。

因此本补丁：

1. 断言 1 的右端用**符号空间自己的行数** `declarationSymbolGlobalRoots.len`（这才是"索引中的符号条目总数"）；
2. 补上断言 2 做真正的反查，使整条链**不依赖** `Σ counts == TypeDeclarationRhs 条目数` 这个巧合；
3. 于是**将来任何源写内联对象字段都不会踩雷**——平铺表天然把它算进去。

**若派单坚持字面形态**，三行改法（放在 `:3829` 之后，与断言 1 并列）：

```cheng
    if candidate.declarationSymbolCount !=
           index.producerSourceIndexes.len:
        err = Fmt" typed expr type arena: declaration symbol count is not the declaration index entry count per_source_sum={candidate.declarationSymbolCount} entries={index.producerSourceIndexes.len}"
        return false
```

代价：任何含内联对象字段的闭包直接硬失败。**建议不采纳**；如果采纳，等于把"字段根发号"这条既有语义变成不可达状态，需要另开一单决定字段根到底该不该发号。

---

## 5 验证计划

**前置纪律**：234 源那一跑必须持有 `.rebuild/COMPILE_SLOT.lock`（见 `.rebuild/remap_exp/session_full234.sh:12-14`）。以下命令本单**一条都没跑**。

### 5.1 最小复现（closure8，8 源）

夹具形状与驱动调用照抄既有 harness：`.rebuild/s1b_step3/ab_arena_prep.sh:129-146`（tag `ab_closure8`）与 `:17-22`（`compile_once`）。夹具源文本 = `src/tests/ug_s1b3_multisource.cheng`：

```
import std/buffer

type
    S1aImported = object
        buf: GrowByteBuffer
        tag: int32

type
    S1aLocal = object
        imported: S1aImported
        ordinal: int32

fn main(): int32 =
    return 0
```

`GrowByteBuffer` 来自 `std/buffer` ⇒ 源 0 上必有一条**跨源前向边**，正是本判词的扳机。

```
BACKEND_JOBS=1 CHENG_DISABLE_COLD_OBJECT_CACHE=1 CHENG_ENTRY_CACHE=0 \
CHENG_NO_CACHE=1 CHENG_STRICT_NO_CACHE=1 CHENG_CSG_MEM_TRACE=1 \
timeout 900 .rebuild/s1b_step3/kd_<新烤标签> system-link-exec --root:/Users/lbcheng/cheng-lang \
  --in:/Users/lbcheng/cheng-lang/src/tests/ug_s1b3_multisource.cheng \
  --emit:exe --target=arm64-apple-darwin \
  --out:/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/<tag>.exe
```

| 判据 | 读数 | 结论 |
|---|---|---|
| **通过** | stderr 不含 `declaration SymbolId is not materialized`；`grep -c 'tag=forest_appended' == 8`；不含 `resource_guard` / `rss_limit_exceeded` | 本条卡点消失，逐源消费跑完 8 源 |
| 失败 A | 仍出现该判词 | 根因未修（检查 Init 是否真的拿到 `declaration.globalSymbolRoots`，即 `compiler_csg.cheng:35636` 是否落到新签名） |
| 失败 B | 出现 `declaration symbol root … mismatch`（断言 1/2/3/4 任一） | 索引派生与顺序发号**不一致** ⇒ 修法 (a) 的前提（§1.4 两条顺序一致）不成立，**停手上报**，不要加兜底 |
| 失败 C | 出现 `arena array: read out of bounds` | 另一类缺陷（与 `patches/s1b_step3i` 处理的那条同族），与本修法无关 |

### 5.2 234 源正式验收（默认 768 MiB 硬门）

```
KD_DRIVER=<新烤驱动> bash .rebuild/remap_exp/full_run2.sh <label> default 1800
```

（`gate=default` 时驱动自带 768 MiB 门不放宽，见 `.rebuild/remap_exp/full_run2.sh:9-11`、`:22-26`；摘要读法见同文件 `:63-72`。）

| 判据 | 读数 | 结论 |
|---|---|---|
| **通过** | `forest_appended_lines=234` **且** `guard_hits=0`（`guard_line=` 空） | 满足验收线 |
| 失败 | `guard_hits>0` 且含 `rss_limit_exceeded` | 内存侧（是 ① / ⑤ 的战场，不是本单） |
| 失败 | `rc=2` 停在别的判词 | 下一层卡点（如 `portable TypeArena Symbol join duplicate`），本单不覆盖 |

### 5.3 反回归（不得只看 closure8）

- 等价电池：`ordinary_zero_exit_fixture` / `call_fixture` / `cold_nested_fmt_interpolation_smoke` / `arena_shapes` / `pair2` / `v6`，同一 harness（`.rebuild/s1b_step3/ab_arena_prep.sh:67-151`）。**两侧必须同 `--out`**（该脚本 `:16` 已 `rm -f` 复用同一 tag 名，符合"同 out"口径）。
- 全林驱动不被破坏：`src/tests/typed_expr_type_arena_smoke.cheng`（`TypedExprTypeArenaBuildFromParserTreeInto` 签名未变，调用点 `:41` 起共 20 余处）。
- 字节中性**预期**：新列只进索引与 build state，不进 `TypedExprTypeArena`；`typedExprTypeArenaHash`（`:644`）只哈希 arena 自身的列，且各列内容与顺序未变 ⇒ TypeArena 的 `artifactRaw32` 应逐字节不变。**这是推理，不是实测**（见 §6）。

---

## 6 未测项（不得当 0 用）

1. **补丁未落树、未编译、未运行**。`git apply --check` 通过只证明上下文匹配，不证明 Cheng 能编译。本单**禁止编译**（槽位被占），所以"设计完成"**不等于**"已修复"。
2. **Cheng 编译期语义未验**：
   - 新函数形参 `out: var int32[]` 被"局部数组实参"绑定 —— 有先例（`:3538-3545`、`:3662-3663`），但**未编译验证**；
   - `typedExprTypeArenaAppendDeclarationSymbolRootsFromTreeInto` 标 `@borrows` 且注释放在 `@borrows` **之前**（仓规：属性与 `fn` 之间夹注释会失效），**未编译验证**；
   - `let symbolRootsBase = out.declarationSymbolGlobalRoots.len`（`:3686` 处）取自 ref-object 形参的字段 —— 有先例（`:1180`、`:1278`），**未编译验证**；
   - 三元表达式写进 `Fmt` 的插值槽（断言 2 的 `index_root={... ? ... : -1}`）—— 仓内先例是 `${... ? 1 : 0}`（`:35604`），**本处形态未编译验证**。
3. **`declarationSymbolGlobalRoots` 是否进任何身份/哈希/CID 面：未核**。索引对象本身不进 `typedExprTypeArenaHash`（`:644` 起只吃 `TypedExprTypeArena`），但"索引是否被别处哈希/CID 化"**本单没有全仓排查**。
4. **234 源闭包内是否存在内联对象字段源：未测**。若存在，`Σ counts != producerSourceIndexes.len` 的偏差为真（本补丁仍正确，但 §4 的字面形态会误杀）。
5. **`typed_expr_type_arena.cheng:1622-1629` 的注释现在是错的**（原文"cross-source edges always point at a smaller row"）。本判词的存在恰好证明前向边存在。建议顺手改这一句，但要改的是注释文本、位置在 `@borrows` 上方，**本单未纳入补丁**以保持 hunk 最小：
   > `# lives in an earlier source (cross-source edges always point at a smaller row)` → `# lives in another source: the import fallback may resolve forward (a larger row), so this fact is read from the SymbolId space the index materialised, not from the append cursor`
6. **`docs/campaigns/2026-08-31-kernel-userpath/patches/check_no_inline_comment_after_or.py` 未在落树后的整文件上跑**。本单只对补丁的 `+` 行做了等价 grep（`||`/`&&` 后无注释、`@borrows` 后紧跟 `fn`），通过。
7. **未核**：`pair2` 的 `portable TypeArena Symbol join duplicate` 与本判词是否同源（预诊断文档 §8.8 把这个合流标为假设）。本补丁**不声称**修掉它。
