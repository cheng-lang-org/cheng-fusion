# s1b_impl_progress —— S1b 实施进度（S1b-0 落地 / S1b-1 未开工）

date_utc=2026-09-11 · 实施席（对 `src/**` 有写入，**未编译、未持槽位、未 commit**）
· 主树 HEAD `e9688f530ac109bb6e434d6b8e03eac1faa08e17`（`git rev-parse HEAD` 实读）
· 施工图 `design/pa_s1b_edit_plan.md` **rev.3**（368 行）· 设计 `design/incremental-forest-consumption.md` **rev.3**（409 行）
· 原始件 `.rebuild/s1b_impl/`（5 件）+ `MANIFEST.sha256`
· **本文只新增本文件，未改任何其它文档**（多线在写）

---

## 0. 一句话结论

**S1b-0 已按施工图 §1.2 的 0a/0b/0d/0e/0f + §1.1 的 R0 形参换装落地（工作树 + 三个 patch），但 0c 未落地**；**S1b-1 / S1b-2 未开工**——施工图要求的「原子切换、不许留半流式中间态」意味着它只能在一次成型时应用，本轮**编译槽位被 `authfix phase2b` 全量 234 源烤机占满（全程 22+ 分钟未释放）**，因此本轮**没有任何一条 B 判据被验证**，也**没有任何新实测数字**。本轮真正的新增价值 = 落地的 S1b-0 + **三条由实读得到、会改变 S1b-1 做法的施工图更正**（其中 0c 那条按原文照做会**破 B4**）。

---

## 1. 本步做了什么（逐条对应施工图条目）

> 下表 `落点` 列的所有行号均为**改动后工作树现行号**，并逐条 `grep 点名符号`复核（见 §4-V9）。

| 施工图条目 | 状态 | 落点（工作树现行号，逐条 grep 复核） | 说明 |
|---|---|---|---|
| **0a** 工作集增 `typeArenaForestSourceArenaBytes` | ✅ 已落地 | `compiler_csg.cheng:1477`（字段）、`:33076`（形参 `sourceArenaBytesOut`）、`:33180`（写入）、`:38911`（调用点） | 原函数局部 `forestSourceArenaBytes` 删除，改为出参写进工作集；入口新增 `sourceArenaBytesOut.len != 0` 前置门；**rev.2 追加**：出口 post-condition 校验（`len == sourcePaths.len` 且索引三列同长，hard-fail）+ `reuseTree` 分支改 hard-fail，见 §9.1 |
| **0b** 索引消费侧辅助 | ✅ 已落地 | `typed_expr_type_arena.cheng:3418-3512` | 4 个纯函数：`…EntryLess`（`:3425`，复刻 `typedExprTypeAuthorityDeclarationLess` 的 (source, 名文本, 根) 三段序）、`…EntryKeyEqual`、`…EntryExported`、`…EntryForRoot`（按 `globalTypeSyntaxRoots` 严格升序二分） |
| **0b-补** 按键排序视图 | ✅ 已落地 | `typed_expr_type_arena.cheng:3494-3541`（入口 `:3514`） | `TypedExprTypeDeclarationIndexSortedEntryRowsInto`：原地堆排序置换（与 authority 的 `…RootSiftDown/SortRoots` 同形同 tie-break），索引行序是并林序、非键序 |
| **0c** TypeArena Seal 列（Seal 段 7 处树读所需事实） | ❌ **未落地** | — | **理由见 §6.1：按施工图原文照做会改 `internPool` 位序 ⇒ 破 B4**。施工图已按本席三条更正改为 rev.4（§9.2），0c 待实施；正确列形态 = 名文本用 `str[]` 文本表 + Seal 原位 `Intern` |
| **0d** R1 侧 append/seal 拆分 + `producerFunctionBase` | ✅ 已落地 | `typed_expr.cheng:30959`（`AddManualScopeCallDeclarationsRec` 增形参）、`:31014`（`…WithManualAuthority` 增形参）、`:36953`（新 `TypedExprBuildIndexAppendContextCallDeclarationsManual`）、`:36984`（`FinishCallDeclarationsManualRec` 改薄） | 全林驱动的调用点传 `producerFunctionBase=0` ⇒ **行为逐字节不变**；`< 0` 判词改为 `< producerFunctionBase`（base=0 时等价）。Seal 仍复用既有 `TypedExprBuildIndexSealCallDeclarations` |
| **0e-I1** `forest_parse_begin/end`（含 `live`） | ✅ 已落地 | `compiler_csg.cheng:33153-33164`（begin，emit `:33161`）、`:33183-33190`（end，emit `:33186`） | 新增 `forest_parse_begin pass=N src=N reserve=N` 与 `forest_parse_end pass=0 src=N arena=N parse_ms=N`；**原 `forest_parsed` 标签逐字保留**（老分析脚本不破），位置不变（仍在 `add()` 之后、索引构建之前）。`live` 由既有 `compilerCsgMemTraceEmit` 统一附加（`:1606`） |
| **0e-I2** `frontier_store cap_bytes` | ✅ 已落地 | `compiler_csg.cheng:38278`（落 `typed_ir_done` 之后） | 每轮发 `frontier_store round=N cap_bytes=… sources=… builds=… hits=…` |
| **0e-并林计时** | ✅ 已落地 | `compiler_csg.cheng:33225`（`append_end src=N append_ms=N forest_arena=N`） | 为 S1b-N 的森林窗基线留逐源序列 |
| **0f** 逐源对拍门 | ✅ 已落地 | `typed_expr_type_arena.cheng:3543-3651`（入口 `:3551`） | `TypedExprTypeDeclarationIndexVerifySourceAgainstInto(tree, producerSourceIndex, typeSyntaxBase, declarationBase, index, err)`：按单源树逐 `TypeDeclarationRhs` 根核对 (source, key, globalRoot, globalDeclRow, kind, exported) + 前缀和单点对账（非末源比下一源基址，末源比索引总数） |
| **§1.1-4/5/6/7/11/12** R0 形参换 `expectedSourceCount` | ✅ 已落地 | `compiler_csg.cheng:33246`/`:33412`（形参）、`:33399`/`:33420`（形状校验）、`:37206`/`:37364`（调用点实参 = `work.orderedSources.len`） | R0 不再吃森林（设计 §0-1 的「寄生参数」） |
| **S1b-1** 原子切换 | ⛔ **未开工** | — | 见 §3、§6 |
| **S1b-2** 删林 | ⛔ 未开工 | — | 依赖 S1b-1 |

**未触及**（按红线）：`src/core/backend/primary_object_plan.cheng` 一字未动（`70339` 硬 panic 与串行臂原样）；`src/core/lang/parser.cheng` 未动（他线 WIP `+192/−96` 在写）；`src/**` 无 `cp` 整文件、无 `git checkout --` / `git restore` / `git stash`。

---

## 2. 改动前后代码原文（三处代表性 hunk；全量见 patch）

### 2.1 `compiler_csg.cheng` — 并林 pass0 计量改写出参 + I1 埋点（0a + 0e）

```diff
-    var totalArenaBytes: int64
-    var forestSourceArenaBytes: int32[]
+    var totalArenaBytes: int64
@@
             var sourceArenaReserve: int32
-            if mergePass == 1 && sourceIndex < forestSourceArenaBytes.len:
+            if mergePass == 1 && sourceIndex < sourceArenaBytesOut.len:
                 # Pass 0 measured this source's final arena bytes; reserve the
                 # same size (plus alignment margin) before re-parsing to avoid
                 # the geometric doubling reallocs.
-                sourceArenaReserve = forestSourceArenaBytes[sourceIndex] + 65536
+                sourceArenaReserve = sourceArenaBytesOut[sourceIndex] + 65536
+            # [S1b-0e / I1] Begin of the per-source parse window.  This is the
+            # only place that can attribute the resident cost of parsing one
+            # source, because `forest_parsed` below fires after the tree has
+            # already been consumed and released.
+            let parseBeginNs =
+                monotimes.MonoTimeNs(monotimes.GetMonoTime())
+            if compilerCsgMemTrace:
+                let parseBeginTag = Fmt"forest_parse_begin pass={mergePass} src={sourceIndex} reserve={sourceArenaReserve}"
+                compilerCsgMemTraceEmit(parseBeginTag)
@@
                 let sourceArenaUsed = Int32(arenamod.ArenaUsed(sourceTree.arena))
                 totalArenaBytes = totalArenaBytes + Int64(sourceArenaUsed)
-                add(forestSourceArenaBytes, sourceArenaUsed)
+                add(sourceArenaBytesOut, sourceArenaUsed)
+                let parseEndNs =
+                    monotimes.MonoTimeNs(monotimes.GetMonoTime())
                 if compilerCsgMemTrace:
-                    let forestDoneTag = Fmt"forest_parsed src={sourceIndex} arena={sourceArenaUsed}"
+                    let parseMs = strings.Int64ToStr(
+                        (parseEndNs - parseBeginNs) / int64(1000000))
+                    let forestDoneTag = Fmt"forest_parse_end pass=0 src={sourceIndex} arena={sourceArenaUsed} parse_ms={parseMs}"
                     compilerCsgMemTraceEmit(forestDoneTag)
+                    let forestPtrTag = Fmt"forest_parsed src={sourceIndex} arena={sourceArenaUsed}"
+                    compilerCsgMemTraceEmit(forestPtrTag)
```

### 2.2 `typed_expr.cheng` — R1 逐源化的 `producerFunctionBase`（0d）

```diff
                 producerFunctionRow =
+                    producerFunctionBase +
                     typedExprManualConsumeTreeFunctionRowExact(
                         manualTree,
                         producerSourceIndex,
                         ctx.scopes[
                             i].manualConsumeFunctionDeclarationRow)
-                if producerFunctionRow < 0:
+                if producerFunctionRow < producerFunctionBase:
                     panic("typed expr: manual-consume constructor function identity missing")
```

并在 `:36946` 新增薄封装（原 `FinishCallDeclarationsManualRec` 的循环体**逐字搬入**，故 append 顺序 / 域计数不变）：

```cheng
@borrows
fn TypedExprBuildIndexAppendContextCallDeclarationsManual(
        index: var TypedExprBuildIndex,
        sourceContexts: var TypedExprSourceContext[],
        ctxIndex: int32,
        manualTree: parser.ParserValueExprTree,
        producerFunctionBase: int32): bool = ...
```

### 2.3 `typed_expr_type_arena.cheng` — 逐源对拍门（0f）核心判词

```cheng
        let entryRow = typedExprTypeDeclarationIndexEntryForRoot(
            index, typeSyntaxBase + localRow)
        if entryRow < 0:
            err = Fmt" ... declaration index source entry missing ..."
            return false
        if index.producerSourceIndexes[entryRow] != producerSourceIndex ||
           !typedExprTypeDeclarationIndexEntryKeyEqual(
               index, entryRow, producerSourceIndex,
               parser.ParserValueExprTokenText(
                   tree,
                   parser.ParserValueExprTypeSyntaxDeclarationOwnerTokenAt(
                       tree, typeSyntaxRow))) ||
           index.globalDeclarationRows[entryRow] !=
               declarationBase + declarationRow ||
           index.declarationKinds[entryRow] !=
               arenamod.ArenaArrayInt32Get(
                   tree.arena, tree.declarationKinds, declarationRow) ||
           index.declarationExportedFlags[entryRow] !=
               (arenamod.ArenaArrayInt32Get(
                    tree.arena, tree.declarationExportedFlags,
                    declarationRow) != 0):
```

---

## 3. S1b-1 为什么没有开工（不是「没做」，是「不能半做」）

施工图 §1.2-S1b-1 与 §6.2-4 把 S1b-1 定为**原子步**，且设计 §4.3-1 把「保留任何整林同时在场的新形态」列为红线。施工图 §1.2 的理由是三条**不可拆**：

1. 并林在 `src=2` 卡死 ⇒ 留着拿不到任何全量数据；
2. R1（`compiler_csg.cheng:38934`）与物化相**都吃 `manualTree=森林`** ⇒ 一并林无人能喂；
3. `Init/AppendSource/Seal` 拆分后 `Seal` 段有 **7 处必须读树**的调用（施工图 §2.2），其事实必须先由 0c 新列补齐。

本轮 0c 被 §6.1 的更正挡下（照原样做会破 B4），因此 S1b-1 的三个前置里有一个不成立 ⇒ **按纪律不进入 S1b-1**，工作树停在「S1b-0 已落地、S1b-1 零改动」这个**可编译、行为不变的连贯态**，而不是半流式态。

---

## 4. 每步验证命令 + 原始输出 + rc

本轮**唯一能做的验证 = 不依赖槽位的静态自检**（硬约束原文：「你先做不依赖槽位的编码与静态自检」）。**没有驱动 sha，没有 `lease_hits`（未起任何编译进程，故无租约读数）**。

| # | 命令 | 原始输出 | rc |
|---|---|---|---|
| V1 | `git diff -- src/core/tooling/compiler_csg.cheng > raw.diff` → `python3 .rebuild/s1b_impl/filter_patch.py raw.diff s1b_0_compiler_csg.patch "GEN2-P1"` | `DROPPED HUNK: @@ -30967,6 +30973,33 @@ fn CompilerCsgFrontierParsedSourceStoreRelease(` / `DROPPED HUNK: @@ -37771,6 +37827,10 @@ fn compilerCsgBuildTypedIrReachRoundPrepare(` / `kept=14 dropped=2` | 0 |
| V2 | `git apply --check -R .rebuild/s1b_impl/s1b_0_compiler_csg.patch` | （无输出）`REVERSE_APPLY_CHECK_OK` | 0 |
| V3 | 同上，`s1b_0_typed_expr.patch` / `s1b_0_type_arena.patch` | `REVERSE_OK` ×2 | 0 |
| V4 | 结构化 lint（脚本内联 `python3 -c`）：tab / 行尾空白 / 括号净差 / `fn` 无缩进体 | `s1b_0_compiler_csg.patch: added=55 tabs=0 trailing_ws=0 paren_delta=0 bracket_delta=0 fn_without_indented_body=[]`<br>`s1b_0_typed_expr.patch: added=56 tabs=0 trailing_ws=0 paren_delta=-1 bracket_delta=0 fn_without_indented_body=[]`<br>`s1b_0_type_arena.patch: added=233 tabs=0 trailing_ws=0 paren_delta=0 bracket_delta=0 fn_without_indented_body=[]` | 0 |
| V5 | 净括号平衡（added − removed） | 三个 patch 均 `added_minus_removed_paren_delta= 0`（V4 里 typed_expr 的 `-1` 是 diff 切行artifact，不是真失衡） | 0 |
| V6 | 陈旧符号 grep：`grep -n forestSourceArenaBytes compiler_csg.cheng` | 空（无残留） | 1（无命中即预期） |
| V7 | 5 参调用核查：`grep -n -A6 "…WithManualAuthority(" typed_expr.cheng` | 唯一定义点 `:31011-31019`（5 形参）、唯二调用点 `:36963-36968`（5 实参）；全文计数 2 | 0 |
| V8 | Fmt 插值能力核查（避免引入不支持的表达式形式） | 仓内既有先例：`parser.cheng:2288 Fmt"…{i + 1}"`、`typed_expr.cheng:12336 Fmt"{…}{sourceContexts[i].sourcePath}"`、`compiler_csg.cheng:33369` 三元表达式 ⇒ 算术/索引/三元**均已支持**；本轮为此把 `[producerSourceIndex + 1]` 预先提为局部量，不依赖未证形式 | 0 |
| V9 | 逐条锚点复核：对 §1 表 全部落点跑 `grep -n <点名符号>` | `1477 typeArenaForestSourceArenaBytes` / `33076 sourceArenaBytesOut: var int32[]` / `33180 add(sourceArenaBytesOut,…)` / `38911` / `33161 forest_parse_begin` / `33186 forest_parse_end` / `33225 append_end src` / `38278 frontier_store round` / `33246`+`33412 expectedSourceCount: int32` / `33399`+`33420 expectedSourceCount != accumulator.sourcePaths.len` / `37206`+`37364 work.orderedSources.len`；`type_arena:3418/3425/3494/3514/3543/3551/3652`；`typed_expr:30959/31014/36953/36984` —— **全部命中且语义相符** | 0 |

**未做（并诚实声明）**：**编译、烤机、夹具、A/B `cmp` 一律未做** ⇒ 本轮**没有任何一条 B 判据的判词**（B1/B2/B2b/B2c/B3/B4/B5/B6 全部未验证），**也没有任何新实测数字**。任何「S1b-0 不破等价」的说法在本轮**不成立为结论**，只能由下一轮的 B4 硬门结案。

---

## 5. 实测数字（本轮）

**本轮无新实测数字。** 槽位被占、未起任何编译进程。以下仅为**引用既有基线**（不是本轮读数，不得当现值用）：

| 量 | 值 | 出处（照录） |
|---|---|---|
| 森林 Σ | `1,290,508,960 B` = 1,230.73 MiB = 门线 1.53× | VERIFY §二十一 B 轮 |
| 森林窗 `after_profile_lookup since_ms` | `774,266 → 553,914 ms` | VERIFY §22.7 |
| 整轮 wall（29 源入口） | `793s → 577s` | VERIFY §22.7 |
| peak rss（B 轮抬门 4GiB，缓存前树） | `2,107,262,968 B` | VERIFY §二十一 |
| peak rss（缓存后，抬门 4GiB） | `2,146,535,464 B` = 2.00 GiB，`rc=1 @583s` | VERIFY §22.8 |
| 默认门 768MiB 死点 | `rc=125 @176s`、`forest_parsed=61`、guarded `rss_bytes=836,453,576 > 805,306,368`、`forest_appended=0` | VERIFY §22.8 |
| pass0 活块 | `live 1,470,764 → 3,089,597`（Δ=1,618,833，单调），pass0 末 rss `781,288,480 B` | VERIFY §二十一 B 轮 |
| 并林窗前保底 | `609,387,432 B` | VERIFY §二十一 B 轮 |
| 驱动 sha（历史） | `kd_sha256=b2228aa29cb0d198d1d3d6b6a711e8873e65e20278c468940a63c2a7779b46f0`（B 轮，缓存前树） | 施工图 附录 B |

**门内是否跑完**：否。默认 768MiB 门下仍死在 pass0 第 62 源（`src=61` = `core/backend/primary_object_plan.cheng`），并林尚未开始——这是本轮**未改变**的现状。

---

## 6. 阻塞与不确定

### 6.1 【施工图更正 · 会破 B4】0c 的 `typeSyntaxOwnerTokenNameIds` 按原文照做会改 `internPool` 位序

施工图 §2.2 第 5/6/7 项要求把 Seal 段的「owner token 文本」换成 0c 新列 `typeSyntaxOwnerTokenNameIds`（intern id），§2.3 则断言「两种驱动的 intern 顺序完全相同 ⇒ 产物逐字节等价（构造性等价）」。**这两句互相矛盾，实读证据如下**：

1. `internPool` 的 id 是**入池位序分配**（`intern.cheng`：`Intern` 先 `FindInternId`，未命中走 `internPoolAppendUnique`，返回 `pool.texts.len - 1`；设计 §1.6 已实读确认）。
2. 现在**存在两个不同相位的 Intern 调用**（锚点=**工作树**，`typed_expr_type_arena.cheng` 基线零他线 WIP）：
   - **AppendSource 相**：`FillGenericSymbols`（`:5196`）、`FillDeclarationSymbols`（`:5313`）——按源序；
   - **Seal 相**：`BuildObjectDeclaration` / `BuildTupleAliasMembers` / `BuildEnumDeclaration` 内的字段名/变体名 `Intern`（`:1634` / `:1816` / `:1940`）——按 `RealizeDeclarationsRec` 的声明序遍历。
3. 因此今天的池序 = **[全部源的 generic+symbol 名]** 然后 **[全部字段/变体名]**。若把字段/变体名的 `Intern` 前移到 `FillTypeSyntax`（AppendSource），池序变成 **[源 0 的 generic+symbol+字段/变体]**、**[源 1 的 …]**、…… ⇒ **同一段文本拿到的 id 不同** ⇒ `symbolNameIds` / `childNameIds` / `memberNameIds` 变化 ⇒ `artifactRaw32` 变化 ⇒ **B4 整林不等价**。
4. `artifactRaw32` 由 `typedExprTypeArenaHashMaterialized`（`:408`）**逐列显式枚举**，不是「哈希整个 arena」⇒ 反过来也说明：**0c 新增列只要不进这个枚举表，就不会扰动 `artifactRaw32`**。这正是 0c 能宣称「纯加、B4 不变」的机制，但前提是**不许提前 Intern**。

**正确形态（S1b-1 前置，须先改施工图 §1.2-0c / §2.2）**：0c 应带的是**文本侧表**（`str[]`，按全局 TypeSyntax 行 / 变体行索引），Seal 期在该 Intern 的**原位**用同一段文本调 `Intern`。仅当文本已在前序相位入池时，提前取值才等价——而字段名/变体名与声明名通常**不同文本**，不满足。

> 这条是本轮最重要的产出：按施工图原文实施 0c，会得到一个**编译通过、语义看似对、但 B4 整林不等价**的版本，而施工图 §6.2-4 把「B4 不等价」定为**直接否决**。

### 6.2 【施工图更正 · 缩小工作量】§2.3 的「所有 `0..<tree.X` 循环边界都要改」对 `Fill*` 族不成立

§2.3 第 135/137 行要求把 `FillDeclarationSymbols`/`FillFunctions`/`FillTokens` 等 fill 类的循环与写入都改成 `base + 局部行`。实读推翻：**这些函数全部用 `arenamod.ArenaArrayInt32Add(value.arena, value.column, …)` 追加**（工作树锚点：`FillTokens:4902`、`FillTypeSyntax:4926`、`FillBracketArgs:5139`、`FillGenericSymbols:5165`、`FillGenericSymbolChildren:5249`、`FillDeclarationSymbols:5265`），是**顺序 append**：

- 只要按源序驱动、且每次 append 的行数与整林一致，**全局行号自动成立**；
- 这些函数**一行都不用改**（循环上界本来就是**单源树**的 `tree.X`，不是全局数）；
- 真正需要全局行空间的只有：**按行寻址的 `state.*` 数组**（工作树锚点 `IndexFields:3652`、`BuildSyntaxOwnership:3705`、`PreflightBracketAuthority:1479`、`InternSyntaxRec:5365` 的游标上界）与 **`ReserveAggregatesRec` 的 symbolId 循环**（工作树 `:5327`，须限制到本源 symbol 区间）。§2.3 第 136 行已点到 `ReserveAggregatesRec`，但不该把 `Fill*` 族一并列进去。

⇒ S1b-1 的 `AppendSource` 改动面比施工图小一档。

### 6.3 【实现约束 · 施工图未写】`IndexFields` 逐源化要求 `fieldCount` 游标跨源持久

`IndexFields`（工作树 `:3652`）是三段式：先按 declarationRoot 计数、再**按 declarationRoot 升序**分配 start、再回填。三段都在 `state` 全局数组上做时，逐源执行与整林执行**结果相同**——因为源 k 的所有根行号都大于源 k−1 的根行号（`typeSyntaxBase` 升序）。但这要求 `fieldStartsByDeclarationRoot/fieldCountsByDeclarationRoot/fieldTypeSyntaxNodeIndexes` 在 **Init 期就按索引总数分配**，且**分配游标 `fieldCount` 跨源延续**；否则 CSR 会按源重置 ⇒ `symbolMemberStarts/Counts` 错。同理 `BuildSyntaxOwnership`（工作树 `:3705`）的 parent 段与反向段逐源可做（父节点恒同源，判词 `"TypeSyntax parent crosses source"` 在 HEAD `:3515` / 工作树 `:3748`），但 `typeSyntaxParentNodeIndexes/typeSyntaxEnclosingSymbolIds` 必须 Init 期全局分配。

### 6.4 【施工图未覆盖】`reuseLinkPlanExprLayer` 路径没有 pass0 计量

本轮 0a 让 pass0 计量写进 `work.typeArenaForestSourceArenaBytes`，但 **reuse 分支（`reuseTree==true`）在 `compiler_csg.cheng:33085-33095`（工作树）提前 return，不做逐源 parse ⇒ 该数组保持为空**。这是事实陈述，不是缺陷（reuse 下本来就没有逐源测量），但 S1b-1 的逐源物化驱动在该路径上**拿不到 reserve 值**。施工图 §1.1-5 只说「reuse 分支改为整林按源行区间喂同一 `AppendSourceInto`」——按 §6.2 的更正，这条路必须**同时**决定 reserve 从哪来（整林 clone 时按源行区间量 `ArenaUsed`，或对该路径拒绝 streaming 并保留整林）。**未定，须先定再做。**

### 6.5 不确定项（不得当结论用）

- **0c 的完整列清单**（实读枚举，供 S1b-1 直接用）：Seal 段（`:1550-2058`）实读需要的树事实只有 6 类：
  1. 子 CSR 载荷 `tree.typeSyntaxChildNodeIndexes`（starts/counts 已在 arena `typeSyntaxChildStarts/Counts`）；
  2. 枚举变体 CSR 载荷 `tree.typeEnumVariantPayloadTypeSyntaxNodeIndexes`、`typeEnumVariantNameTokenIndexes`（后者须为**文本表**，见 §6.1）；
  3. 变体全局行 `ParserValueExprTypeSyntaxEnumVariantRowAt`（可由已在 arena 的 `typeSyntaxEnumVariantStarts` + offset 得出）；
  4. 变体的 `typeEnumVariantProducerSourceIndexes` / `DeclarationOwnerNodeIndexes` / `DeclarationOwnerTokenIndexes` / `Ordinals`（**全局变体行空间**，需 Init 期全局基址）；
  5. owner/字段/变体名 token 的**文本**（非 intern id）；
  6. token kind（`tokenKinds` 已在 arena）。
  **本清单来自对工作树 `:1321-2100` 全量 `state.tree` 命中（78 处）与 accessor 定义体（**HEAD** `parser.cheng:15981` / `:16118` / `:16203` / `:16216` / `:16227` / `:14153`，工作树因他线 WIP 整体位移）的实读**，但**未经编译验证**。
- `typed_expr_type_arena.cheng` 与 `typed_expr.cheng` 在工作树**基线为 0 改动**（`git status` 实读），故本轮这两个文件的 diff 100% 属于本席。
- `compiler_csg.cheng` 工作树**含他线 WIP `+31/−0`（`CompilerCsgFrontierParsedSourceStoreEvictAll`）**：本轮 patch 已按 hunk 剔除（V1 的 `kept=14 dropped=2`），**未把他人 WIP 收进我的件**。
- 行号偏移已复核：`compiler_csg.cheng` 工作树相对 HEAD **+27（`:30967` 之前）/ +31（`:30967` 之后）**；`parser.cheng` 工作树相对 HEAD `+192/−96` ⇒ **一律以 HEAD 为锚**，本轮所有 grep 均在**工作树**完成并已在 §1 表中标注为「工作树现行号」。

---

## 7. 待槽位验证清单（下一轮开工即按序执行）

**抢锁前置（硬约束原文）**：锁不存在 **或** owner pid 已死；`ps` 无 `cheng_cold*` / `system-link-exec` / `rebake_v3*`；**连续 ≥3 次静默采样**。`mkdir .rebuild/COMPILE_SLOT.lock` 成功后写 `owner.txt`（pid + 时间 + 用途）。撞 `os atomic tree: parent lease unavailable` ⇒ 该轮作废重试，**不拿被污染轮次当结论**。

1. **S1b-0 回归轮**（第一优先，验「纯加不破等价」）：
   a. C 链烤驱动（`cc -std=c11 -O2 bootstrap/cheng_cold.c`, ≈166~200s），记录 `kd_sha256`；
   b. 四夹具（ordinary / call_fixture / cold_nested / v6）+ 2 源对 + 8 源闭包，**同 `--in` / 同 `--out` 的 A/B `cmp`**（S1a 基线：`d3cca8c1/4f9af51f/0b89d8dd/6eca55c6`、`793afdce…`/`d285f4be…`、`9779b97d`）；
   c. 判 `decl_index verified=1`；`lease_hits` 必须 =0，否则该轮整体作废；
   d. 读新埋点：`forest_parse_begin/end`（**首次拿到 I1 的逐源 parse 窗口 Δrss 与 `live`**，验施工图 §3.1 的 `1.34×arena` 单点推算）、`append_end`（森林窗逐源基线）、`frontier_store`（I2 首次出数）。
   e. **任一不等价 ⇒ 立即 `git apply -R` 三个 patch 回退，S1b-0 判不成立**（不许「先落地后修」）。
2. **改施工图 §1.2-0c / §2.2 / §2.3**（按 §6.1/§6.2/§6.3 三条更正），再实施 0c。
3. **S1b-1 原子切换**（一次成型，不留半流式）：0c → `Init/AppendSource/Seal` 拆分 → 权威相索引化 → 逐源驱动 → R1 逐源 → Seal 接线 → **同一步内删并林半段（工作树 `compiler_csg.cheng:33111-33237` 的 `while mergePass < 2` 整段；HEAD 对应 `33076-33168`）**；reuse 路径同期定形态（§6.4）。
4. **S1b-2**：`grep -rn typeArenaParserForest src/ --include=*.cheng` 真零命中。
5. **B 判据**：B2b（森林窗 <120s，第一判据）→ B2c（`live` 平台化）→ B2（对照 `2,107,262,968 B`）→ B4（硬门）→ B5/B6。
   **注意**（设计 §0.4-ii / 施工图 §0.7）：**B2b 的 after 面须先修 TRIAGE 的 `authority invalid`（独立于本刀）才读得到**；且 **S1b 不是「全量跑完」的充分条件**。

---

## 8. 纪律回执

**`git diff --numstat`（`src/`，改动后实读）**：

```
56      23      src/core/lang/typed_expr.cheng          # 基线 0/0    → 全部本席
233     0       src/core/lang/typed_expr_type_arena.cheng # 基线 0/0    → 全部本席
86      18      src/core/tooling/compiler_csg.cheng     # 基线 31/0   → 本席 delta = +55/−18
```

其余文件（`parser.cheng` +192/−96、`program_support_backend.cheng` +90/−18、`primary_object_plan.cheng` 等）**与本轮基线逐字节相同，本席未触碰**（`primary_object_plan.cheng` 在工作树无改动）。

**是否持锁**：**否**（截至本节落笔）。未 `mkdir .rebuild/COMPILE_SLOT.lock`，未写 `owner.txt`，未起任何 `cheng_cold*` / `system-link-exec` / `rebake_v3*` 进程。
（rev.3 补：跑批器**已具备抢锁能力**并正在等锁，但**尚未取得**，见 §10.4/§10.5。）

**【口径变更留痕·父席 2026-09-11 裁定，立即生效】等待条件由「静默窗」放宽为「锁空即抢 + 租约判有效性 + 撞车作废重试」，原因：他线持续无锁烤机致静默窗不可得。**

具体：① 锁空（`owner.txt` 不存在或 owner pid 已死）即抢，**不再要求 `ps` 静默、不再要求 `quiet_streak`**；② 起跑后以 workspace-root 原子树租约为有效性判据——`lease_hits>0` 或 `os atomic tree: parent lease unavailable`（含 `compile_rc=2` 且 stderr 带该串）⇒ **该轮作废、不取任何数字**，记录 attempt 序号 + 时间戳 + rc + 撞车原文，等 30–60s 重试；③ 优先跑单次烤机的 `kd_prev`（~200s），便于插进他线两轮烤机之间；④ 撞车轮**永不算证据**；`cmp` 不等价 ⇒ 立即 `git apply -R`、S1b-0 判不成立。变更理由与落地实现见 §10.4，本席的一次事故与修复见 §10.5。

**【脚本静默退出留痕·rev.4】** 第 3 次挂起的跑批器（20:34:52 启动）在 **20:35:47 被 SIGTERM 打死**，证据：`regression_driver.log` 内独占一行 `Terminated: 15             sleep 15`，随后 `round.log` 停在 `20:35:47 lock held by 2121; waiting`，此后无任何行。

- **不是** `LOCK_WAIT_SEC` 到点（当时才等了 55s，上限 5400s）；
- **不是**锁目录消失导致的判定（`ensure_lock` 在锁被他人持有时只打印等待行，不会退出）；
- **不是**脚本自身逻辑（`ensure_lock` 返回非 0 才 `exit 0`，且会先打印 `lock wait exceeded …`，日志里没有）。
- ⇒ **判定：收到外部 SIGTERM**。最可能来源是**进程组定向信号**——在同一轮内我先对上一个作业发起过终止（`job_kill` + `pkill -TERM -f run_s1b0_regression.sh` 清理 pid 4387），若新作业与旧作业共享进程组，延迟投递的组信号会把新脚本一并打死。这与「`pkill -f` 只按命令行匹配」不符，但与「按作业进程组投递」完全吻合。
- **修复（两次）**：
  1. 首次尝试 `setsid bash …` 直接 **exit 127**——**macOS 没有 `setsid(1)`**（util-linux 才有）。留痕：脚本名不要假设 Linux 工具链。
  2. 改用 `.rebuild/s1b_impl/launch_regression.py`：`os.setsid()` + `os.execv("/bin/bash", …)`。`os.setsid()` 在「已是进程组组长」时抛 `EPERM`，launcher 捕获后继续（那种情形下作业本来就有独立进程组，别的作业的组信号打不到它）。**`execv` 保留 PID ⇒ 作业仍由 harness 追踪，不是脱管 nohup**。
  - **复验（实读）**：`launcher: setsid ok, new session pgid=21636`；进程表显示跑批器 pid 21636 的 `PGID=21636`、独立 session；同时 `round.log` 在 `lock held by 19989; waiting`，工作树仍为规范态 `42fd9f09…`。
- **副作用核对（实读）**：被打死时脚本**尚未持锁**（锁在 `authfix` 手里），`trap` 走的是「无 patch 需复原、无锁需释放」分支 ⇒ **工作树与锁均未受影响**；三个文件 sha 仍为 `42fd9f09…`/`32a99253…`/`6b87c767…`；`src/tests/` 下**无本席遗留夹具**（`ug_s1b0_*` / `ug_s1a_ms_*` / `ug_s1a_multisource.cheng` 实读均不存在）。

**锁状态（本轮五次实读）**：

```
.rebuild/COMPILE_SLOT.lock/owner.txt:
  owner_pid=68658
  started=2026-09-11 03:43:51
  purpose=authfix phase2b: negative probes + dup-in probe + full234 raised/default
ps -p 68658 → bash .rebuild/auth_fix/session_phase2b.sh   (ELAPSED 17:42 → 22:27 → 24:23，交稿时仍存活)
ps aux | grep -E "cheng_cold|system-link-exec|rebake_v3" → 3 条（含 pid 68895 system-link-exec 全量 234 源自烤，99.6% CPU，交稿时仍在跑）
```

⇒ **抢锁三条件一条不满足（owner 存活 + 烤机在跑）**，故本轮**未排队、未编译**。

**其它红线自查**：未 `commit` / `push`；未建分支 / worktree；未 `cp` 整文件；未 `git checkout --` / `git restore` / `git stash`；撤回手段只备 `git apply -R`（三个 patch 均 `--check -R` 通过）；未引入 fallback/降级/启发式；未为「跑完」跳过任何检查（本轮**根本没跑**，并已如实声明无判词）；未改 `primary_object_plan.cheng`；只新增 `docs/campaigns/2026-08-31-kernel-userpath/design/s1b_impl_progress.md` 一个文档。

**原始件**（`.rebuild/s1b_impl/`，附 `MANIFEST.sha256`）：

| 文件 | sha256 |
|---|---|
| `filter_patch.py` | `d91713546070b67c024839e27f436e99fc450e43980c0b5df9bd22363f16b23f` |
| `raw_compiler_csg.diff`（含他线 GEN2-P1 两 hunk，仅留证） | `02170ce90e058fcf14fb0ade3c6cd69a0ccb4304948750fce7d64ec60dcaa93f` |
| `s1b_0_compiler_csg.patch`（14 hunk，已剔他线 WIP） | `1951f1be74921874865dc58a92df4f135771cd768770d3bb9cb675ad1289dc93` |
| `s1b_0_typed_expr.patch` | `e1567b64c90f8e7bc31f2ec080a99873d303a62d85e2fa03bba1a348a8dbcad4` |
| `s1b_0_type_arena.patch` | `d0a470591884485d3038f96cd3a9554bab8c40c5734a58da1304c3801004ab0e` |

**改动后 `src/` 三文件 sha256**（供收割方核对）：

```
6b87c7671e7c975510c7bf7cb25cab976174316593bd2ce811f6ca7967397113  src/core/lang/typed_expr_type_arena.cheng
32a99253d4bd952749ca02afb24f229a0675b494e3cf6220d727e983f61a63ee  src/core/lang/typed_expr.cheng
42fd9f090f9277957d6ba9c8f3f9a95acd219f1155074f1fcda454a803ce69c6  src/core/tooling/compiler_csg.cheng
```

---

## 9. rev.2 追加（裁决落地：reuse 定谳 + 施工图 rev.4 + patch 入库）

### 9.1 reuse 路径定谳：**结构上不可达**，已用 hard-fail 钉死（裁决 ①/④）

**问：它在什么条件下被走到？** 判据式 = `reuseLinkPlanExprLayer = linkPlan.exprLayer.sourceCount > 0 || linkPlan.exprLayer.exprs.len > 0`（`compiler_csg.cheng` 工作树 `:38618` 一带，HEAD `:38611`）。

**答：恒为 false。两条独立证据：**

1. **静态（写入面穷举）**：`plan.exprLayer` 的**唯一非空写入点**是 `system_link_plan.cheng:4899` 的 `parser.NormalizedExprLayerMoveInto(plan.exprLayer, parsed.normalizedExprLayer)`。而 `parsed.normalizedExprLayer` 的两条产生路径**都赋空层 `NormalizedExprLayer()`**：
   - `system_link_plan.cheng:4738`（`var exprLayer = parser.NormalizedExprLayer()`）→ `:4752`（`parsed.normalizedExprLayer = exprLayer`）——即 `BuildSystemLinkPlanStubWithRequestFieldsAndExternalPackageRoots` 的 request-fields 分支；
   - `:4757-4763` 的 `else` 分支 → `parser.cheng:39156` `ParseOrdinarySourceHeaderStubWithExternalPackageRoots` → `:39143` `ParseOrdinarySourceHeaderStubCoreNoExternalPackageRoots`，其 `:39116` `var exprLayer = NormalizedExprLayer()` → `:39129` `parsed.normalizedExprLayer = exprLayer`（该函数只逐字节扫 `fn main`，**不做任何表达式归一化**）。
   另两条相关事实：`SystemLinkPlanBuildImmutableSourceOverlayInto`（LSP 路径，`system_link_plan.cheng:3621`，`lsp_server.cheng:3202` 调用）在 `:3621-3900` 内 `exprLayer` **零命中**（整体 `out = SystemLinkPlanStub()` 默认空）；`plan.exprLayer` 的其余出现只有 `:2413`/`:2960` 两处**重置为空**的释放路径。全仓 `NormalizedExprLayerMoveInto(plan.exprLayer,` 只有 `:4899` 一处（`src/tests/system_link_payload_lifecycle_smoke.cheng:63` 是**源码扫描计数断言**，不是行为路径）。
2. **实测（历史日志全量）**：`.rebuild/` 下全部文本日志中 `forest_build_start` 命中 **71 次，`mode=reparse` 71、`mode=clone` 0**。

⇒ 裁决 ④ 适用（**证明不会走到**）。**已执行**：`compiler_csg.cheng` 的 `reuseTree` 分支由「clone 整林」改为 **hard-fail**（工作树 `:33085-33126`），诊断串点名「reusable parser forest path is structurally unreachable and has no per-source arena reserve」，并在注释里固化上面两条证据与「若复活必须自己产出 `sourceArenaBytesOut`，驱动不得兼容、不许用默认值/0 代替」。**不做**裁决明令禁止的两件事：不为它发明跳过、不加 fallback。

> 副作用说明：`reusableTree` 形参在新分支里由诊断串读取（`reusable_sources={reusableSources}`），因此仍被使用（该编译器对未使用形参有要求，见 `parser.cheng:39155` 的裸表达式 silencing 写法）。

**同轮补的驱动前置/后置断言**（裁决 ②）：

- 入口（原有）：`sourceArenaBytesOut.len != 0` ⇒ 拒。
- **出口（rev.2 新增，工作树 `:33258-33271`）**：
  ```
  if sourceArenaBytesOut.len != sourcePaths.len ||
     declarationIndex.producerSourceCount != sourcePaths.len ||
     declarationIndex.typeSyntaxBaseBySource.len != sourcePaths.len ||
     declarationIndex.declarationBaseBySource.len != sourcePaths.len:
      err = Fmt" ... parser forest per-source measurement coverage invalid expected=… arena_bytes=… index_sources=…"
      parser.ParserValueExprTreeRelease(out)
      return false
  ```
  这是 S1b-1 逐源物化驱动的**唯一前置事实**（每源 reserve 必须来自**本轮实测**），不满足即 hard-fail。

### 9.2 施工图 `pa_s1b_edit_plan.md` 已改 rev.4（裁决 ③）

**改动限于**：§1.2-0c、§1.2-1b（reuse 子句）、§2.2（AppendSource 段 + Seal 表 5/6/7 行）、§2.3（循环边界）、§6.5（新增 8/9/10/11 四条）。**hunk 头**（`git diff -U0` 实读）：

```
@@ -53,5 +53,8 @@    §1.2-0c  → rev.4：名文本列改 str[] 文本表 + 完整列清单 + artifactRaw32 红线
@@ -65 +68 @@       §1.2-1b  → reuse 子句作废并指向 §6.5-11
@@ -108 +111,5 @@   §2.2 AppendSource → 更正 1（Fill* 族零改写）+ 更正 2（IndexFields 两条硬前提）
@@ -120,3 +127,3 @@   §2.2 Seal 表 5/6/7 → 换成「文本表 + Seal 原位 Intern」并点名 Intern 位
@@ -135,5 +142,6 @@   §2.3 循环边界 → 原文 fill 族那条作废；新增 seal 相 Intern 原位性
@@ -309,0 +318,4 @@   §6.5 → 新增 8（0c 文本侧表+原位 Intern）、9（Fill* append 零改写）、10（IndexFields 游标/Init 分配）、11（reuse 不可达 + 断言）
```

numstat：`27 15 docs/campaigns/2026-08-31-kernel-userpath/design/pa_s1b_edit_plan.md`。patch 已落 `.rebuild/s1b_impl/s1b_plan_rev4_doc.patch`（sha256 `03f2ae01be3a3e8e12eca92c964b1c2ed8c2af3d155298a3ce0dfd385fd354cc`），`git apply --check -R` 通过。

> 注：§2.2 的 `Fill*` 族「零改写」更正使 S1b-1 的 `AppendSource` 改动面比施工图**小一档**；§6.5-11 使 S1b-1 **不再需要为 reuse 保留任何形态**（原 §1.1-5 那条「整林按源行区间喂」的设计需求随之消失）。

### 9.3 patch 已落版本库目录（`.rebuild` 是 gitignore）

`docs/campaigns/2026-08-31-kernel-userpath/patches/`（`MANIFEST` 同步更新为 `s1b_0_MANIFEST.sha256`）：

| 文件 | sha256 |
|---|---|
| `s1b_0_compiler_csg.patch`（**15 hunk**，已剔他线 GEN2-P1 两 hunk） | `847298918f13608e4dfb265fc2f045b7e30475d0759cfea751ad43c9c1248774` |
| `s1b_0_typed_expr.patch` | `e1567b64c90f8e7bc31f2ec080a99873d303a62d85e2fa03bba1a348a8dbcad4` |
| `s1b_0_type_arena.patch` | `d0a470591884485d3038f96cd3a9554bab8c40c5734a58da1304c3801004ab0e` |
| `s1b_plan_rev4_doc.patch` | `03f2ae01be3a3e8e12eca92c964b1c2ed8c2af3d155298a3ce0dfd385fd354cc` |

四件均 `git apply --check -R` 通过（与当前工作树逐字节一致）。`.rebuild/s1b_impl/MANIFEST.sha256` 已同步（含 `filter_patch.py` / `raw_compiler_csg.diff`）。

### 9.4 rev.2 后的 numstat 与结构性自检

```
56      23      src/core/lang/typed_expr.cheng            # 基线 0/0   → 全部本席
233     0       src/core/lang/typed_expr_type_arena.cheng # 基线 0/0   → 全部本席
129     29      src/core/tooling/compiler_csg.cheng       # 基线 31/0  → 本席 delta = +98/−29
```

| # | 检查 | 结果 | rc |
|---|---|---|---|
| V10 | patch hunk 计数 | `s1b_0_compiler_csg.patch`：`+` 99 行（含 `+++` 头）→ 实增 98；`-` 30 行（含 `---` 头）→ 实删 29 | 0 |
| V11 | 三个 src patch 净括号平衡 | `compiler_csg added=98 net_paren=0` / `typed_expr added=56 net_paren=0` / `type_arena added=233 net_paren=0` | 0 |
| V12 | 四 patch `git apply --check -R` | 全部 OK（与工作树逐字节一致） | 0 |
| V13 | 施工图 rev.4 patch 反向校验 | `PLAN_PATCH_REVERSE_OK` | 0 |

### 9.5 槽位实况（裁决 ② 的排队前置——**未满足，本轮未抢**）

**关键变化**：`authfix`（owner 68658）已于本轮中途**释放**锁——`.rebuild/COMPILE_SLOT.lock/` 目录与 `owner.txt` 均已消失，pid 68658 已死。**但抢锁第二条件立刻被另一条线破坏**：

| 采样 | UTC | `COMPILE_SLOT.lock` | `cheng_cold*`/`system-link-exec`/`rebake_v3*` |
|---|---|---|---|
| 1 | 20:15:4x | 不存在 | **2 条**：pid 95366 `.rebuild/run_m73x/kernel_driver system-link-exec`（99.1% CPU，跑 `src/tests/ug_gate_probe_while.87142.cheng`）+ 其 guard 包装 pid 95361 |
| 2 | 20:16:14 | 不存在 | **仍在**：pid 95366 / 95361 |
| 3 | 20:16:38 | **已被 `authfix-phase3lite`（pid 96276）取得**（04:16:32） | pid 95366 / 95361 仍在 |
| 4 | 20:17:00 | 同上，owner=96276 | pid 95366 / 95361 仍在 |
| 5 | 20:17:20 | 同上，owner=96276 | **2 条仍在** |

⇒ **三条件中第二条件不满足（`ps` 内有 `system-link-exec`），故本轮未 `mkdir` 锁、未编译**。另注：`run_m73x` 这条线**自己并未建 `COMPILE_SLOT.lock`**，即它没有走原子锁协议——这是并发污染的实际来源，按 §6.4「`lease_hits=0` 是任何数据入账的前置条件」，即便我此刻起跑，读数也在他的窗口内，**不可入账**。

**结论**：S1b-0 回归轮**继续等待**；须等 `run_m73x` 静默，并满足「连续 ≥3 次静默采样、间隔 ≥15s」后才 `mkdir` 锁。

### 9.6 【rev.2 新增·会改验收做法】B4 的 A/B 必须是**同一工作树内**的 prev vs S1b-0，不能直接对 VERIFY §十九 的存档 sha

裁决 ② 给的基线写的是「对 S1a 基线（`d3cca8c1/4f9af51f/0b89d8dd/6eca55c6`、`793afdce…`/`d285f4be…`、`9779b97d`）」。**照字面直接比会得到假阴性**，理由：

1. 复核 VERIFY §十九 原文（`:19/:21/:24-25`）：`793afdce…`/`d285f4be…` **是驱动（kd）自身的 sha256，不是夹具产物**；夹具产物基线才是 `d3cca8c1/4f9af51f/0b89d8dd/6eca55c6`，多源对是 `9779b97d`。两组不可混为一谈。
2. 更关键：**当前工作树已相对 S1a 时点漂移**——`src/core/lang/parser.cheng` `+192/−96`（他线 TRIAGE correctness 修复在写）、`program_support_backend.cheng` `+90/−18`、`bootstrap/cheng_cold.c` `+63/−10` 等。夹具产物由**整个编译器**决定，所以「S1b-0 驱动 vs 存档 S1a sha」的差**无法归因**：不等价时既可能是我的三处改动，也可能是他线 WIP。

⇒ **本轮 B4 的正确做法（同一工作树内的 A/B）**：

```
① git apply -R  s1b_0_compiler_csg.patch  s1b_0_typed_expr.patch  s1b_0_type_arena.patch
   → bake  → kd_prev   （记 kd_sha256_prev、lease_hits）
② git apply    三个 patch（用 .rebuild/s1b_impl/ 或 patches/ 内的同一份，改完核对
   src/ 三文件 sha256 == 6b87c767… / 32a99253… / 42fd9f09…）
   → bake  → kd_s1b0   （记 kd_sha256_s1b0、lease_hits）
③ 四夹具 + 2 源对 + 8 源闭包：**同 --in、同 --out**，两驱动各跑一遍，对产物做 `cmp`
   （禁跨路径比 sha——exe 内嵌自身路径，跨路径比会被自身路径/`proofDigest` 污染）
④ `decl_index … verified=1` 必须出现；两驱动逐条比对 trace
⑤ VERIFY §十九 的存档 sha 只作**附加旁证**（不等不算失败，须先归因到具体改动）
```

**判词**（裁决不折不扣）：③ 中任一 `cmp` 不等价 ⇒ **立即 `git apply -R` 三个 patch，S1b-0 判不成立**；`lease_hits != 0` 或撞 `os atomic tree: parent lease unavailable` ⇒ 该轮整体作废重跑，**不得当结论**。

**已就位的现成脚本**（`.rebuild/run_b5/`，前轮实际用过）：`wait_slot.sh`（要求**连续 6 次、间隔 15s** 的静默采样 = 比硬约束的 ≥3 次更严）、`acquire_lock.sh`（`mkdir` 原子 test-and-set + stale-owner 回收）、`bake.sh`（`HEAD_BIN` 默认 `$HOME/.cheng-complete-0910/cheng_cold_v3`，实读存在，2026-09-10 15:43）、`run_fixtures.sh`（**各 phase 共用同一 `--out` 路径**，正是「同 `--out`」口径）、`release_lock.sh`（owner 校验释放）。`run_fixtures.sh` 目前只覆盖 3 个夹具（缺 `cold_nested`）。**2 源对 / 8 源闭包入口当时是开工缺口，已在 §10.1 关闭。**

### 9.7 rev.2 后的下一步最小动作

1. **等锁**：当前 `COMPILE_SLOT.lock` 由 `authfix-phase3lite`（pid 96276，04:16:32 取得）持有，且 `run_m73x/kernel_driver`（pid 95366）**未持锁**在跑 ⇒ 第二条件不满足。等两者静默 → `wait_slot.sh`（6×15s）→ 再 `acquire_lock.sh`。
2. **S1b-0 回归轮**：按 §9.6 的 ①~⑤ 执行（同工作树 prev vs S1b-0）。
3. **首次收割 I1/I2**：`forest_parse_begin/end` 的 Δrss + `live`、`append_end` 逐源 `append_ms`、`frontier_store cap_bytes` 逐轮；验/证伪施工图 §3.1 的 `1.34×arena` 单点推算。
4. 回归通过后才实施 **0c**（rev.4 文本表形态）→ 再进 **S1b-1 原子切换**。

---

## 10. rev.3 追加（裁决 ① 落地：2 源对 / 8 源闭包入口定位 + 回归轮跑批器 + 768 硬门）

### 10.1 两条补充夹具的**入口文件已定位**（附证据链；它们不是文件，是脚本内联生成）

`fixtures/` 目录里没有它们，原因查清了：**这两条夹具的源文件是脚本用 `printf` 现场生成的，跑完即 `rm`**，从不落库。定位路径：VERIFY §十九 只写了「另测 2 源对与 8 源闭包（entries=35）」与「多源对 `9779b97d`」，未写入口名 ⇒ 按 `entries=35`/`sources=8`/`entries=2`/`sources=2` 反查 `.rebuild/run_s1a/` 原始件，命中两个脚本。

**① 2 源对（`msp2`，基线 `9779b97d…`）—— 出处 `.rebuild/run_s1a/run_ms_pair2.sh`**

| 项 | 实读值 |
|---|---|
| 入口（`--in`） | `src/tests/ug_s1a_ms_main.cheng`（运行时生成，跑完删除） |
| 源 1 | `src/tests/ug_s1a_ms_lib.cheng`，trace `tag=src=0 decls=1 path=src/tests/ug_s1a_ms_lib.cheng`，`forest src=0 bytes=90` |
| 源 2 | `src/tests/ug_s1a_ms_main.cheng`，trace `tag=src=1 decls=1`，`forest src=1 bytes=155` |
| 索引回执 | `decl_index entries=2 sources=2 type_syntax=7 declarations=7 verified=1` |
| 基线 | `msp2_before_compile_rc=0 exe_sha256=9779b97db139b24f90f7dd3c118d03b9cc8d5b8c4c7d08b3a3c891f5ca378356`；`msp2_s1a_compile_rc=0 exe_sha256=9779b97d…`（**两驱动同一 sha**）；`run_rc=0` |
| 口径 | 脚本自述「IDENTICAL input and output paths」——`--out` 两驱动共用 `$OUT/msp_canon.exe` |

源文本（逐字取自该脚本的 `printf`，回归轮按同一字节重放）：
```cheng
# src/tests/ug_s1a_ms_lib.cheng
type
    S1aLibCell = object
        value: int32

fn S1aLibProbe(): int32 =
    return 7
```
```cheng
# src/tests/ug_s1a_ms_main.cheng
import cheng/tests/ug_s1a_ms_lib

type
    S1aHolder = object
        cell: S1aLibCell
        tag: int32

fn main(): int32 =
    return S1aLibProbe() - 7
```

**② 8 源闭包（`multisource`，`entries=35`）—— 出处 `.rebuild/run_s1a/run_residual2.sh`**

| 项 | 实读值 |
|---|---|
| 入口（`--in`） | `src/tests/ug_s1a_multisource.cheng`（运行时生成，跑完删除） |
| 闭包 | 8 源；`tag=forest src=0..7 bytes=210 / 5930 / 33495 / 10874 / 2184 / 2730 / 13660 / 103363`；`tag=src=1 decls=20 path=src/std/buffer.cheng` |
| 索引回执 | `decl_index entries=35 sources=8 type_syntax=2421 declarations=2487 verified=1`（s1a 侧） |
| 基线 | `multisource_before_compile_rc=2`、`multisource_s1a_compile_rc=2`，**两侧末行判词逐字相同**：`compiler parser receipt: normalized expression parser node missing exprIndex=5 kind=1 line=50 surface=if rootNode=-1 originNode=-1 role=0`（既有 receipt 判词，pre-existing） |
| **重要** | **两侧都没有产物**（`.rebuild/run_s1a/ms.before.exe` / `ms.s1a.exe` 实读均不存在）⇒ 这条**不能用 exe `cmp` 判等价**，判据 = **rc 相同 + 末行判词逐字相同**（回归轮已按此实现） |

源文本（逐字取自该脚本的 `printf`）：
```cheng
# src/tests/ug_s1a_multisource.cheng
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

> 上一版把这条列为「开工前置缺口」，**现已关闭**；回归轮脚本内联与上述**逐字相同**的字节。

### 10.2 回归轮已写成单键跑批器（`.rebuild/s1b_impl/run_s1b0_regression.sh`）

一次调用完成：**等静默窗（6×15s，严于硬约束的 ≥3）→ `mkdir` 原子抢锁 + 写 `owner.txt` → 抢锁后复验静默 → `git apply -R` 烤 `kd_prev` → `git apply` 复原并核对三文件 sha256 命中 `42fd9f09…`/`32a99253…`/`6b87c767…` → 烤 `kd_s1b0` → 跑批 → 判词 → owner 校验释放锁**。

- **跑批口径**：四夹具 + 2 源对 + 8 源闭包，**每项两驱动共用同一 `--in` 与同一 `--out`**；有产物走 `cmp`（`CMP=IDENTICAL/DIFFER`），无产物走 **rc + 末行判词**比对（`JUDGEMENT=IDENTICAL/DIFFER`）。逐项记 `compile_rc` / `lease_hits` / `exe_sha256` / `decl_index` 行。
- **判词**：`lease_hits` 合计 `!= 0` ⇒ `VOID`（污染轮，非结果）；任一 `CMP=DIFFER` / `JUDGEMENT=DIFFER` ⇒ **立即 `git apply -R` 三个 patch 并写 `S1b-0 NOT ESTABLISHED`**；全绿 ⇒ `S1b-0 EQUIVALENT`。
- **安全**：`trap EXIT/INT/TERM` 保证任何退出路径都**先复原 patch 再释放锁**；`RELEASED` 幂等标志防重复释放；抢锁后若发现烤机进程重新出现 ⇒ 判该轮作废并退出（不抢跑）。
- **静态自检（已做，未起任何编译）**：`bash -n` 主脚本 `SYNTAX_OK`、抽出的 `battery.sh` `BATTERY_SYNTAX_OK`；四个夹具源文件实读 `present`；`$HOME/.cheng-complete-0910/cheng_cold_v3` 实读存在（2026-09-10 15:43）。
- 产物落 `.rebuild/s1b_impl/regression/`（`round.log` / `bakes.txt` / `battery.txt` / `VERDICT.txt` + 每项 stdout/stderr）。
- ~~已作为受管后台作业启动~~ **（该版本已被 §10.4 的政策取代并终止）**：起跑即进入等静默窗循环，实测 `procs=4 streak=0`（`authfix-phase3lite` + `run_m73x` 两组烤机在跑），`streak` 从未累到 6 ⇒ **未抢锁、未起任何编译**。

### 10.3 768 MiB 硬门（裁决 ②）已确认入库，本席口径随之收紧

`tools/user_path_gate.sh:47` 实读 `RSS_CAP_MIB=768    # 硬门（2026-09-11 用户裁定；旧值 1024 仅是"最后防线"，已废止）`；commit `ae64d4641`（`git show --stat` = 该文件 +7/−5）。

对本刀的影响，逐条记死：

- **B2 达标线 = 默认 768MiB 门内全量 234 源跑完并林**，这是**门禁判词**不是测量口径；`--rss-cap-mib` 覆写**只许诊断**，任何抬门轮次必须在报告里标 `diagnostic`，且**其状态本身即病态证据**（不得当作"另有合格线"）。
- 施工图 §5 的 **B2 反向判词（对照 B 轮 `2,107,262,968 B`）降级为诊断参考**，不再是达标线。
- B2b（森林窗 <120s）与 B2c（`live` 平台化）**保持**：它们判「墙是否被移除」，硬门判「是否达标」，两者不冲突。
- 「降了 X%」在任何位置都**不算达标**（施工图 §4 假绿第 10/11 条 + 本次裁定）。

### 10.4 【口径变更·留痕】等待条件由「静默窗」放宽为「锁空即抢 + 租约判有效性 + 撞车作废重试」

**变更原文（父席 2026-09-11 裁定，立即生效）**：

> 他线 `run_m73x` 在**连续不断地烤机**（pid 1077/1118 又起一轮），而它**从不建锁**。「6×15s 静默」条件在这种对手面前会**无限饥饿**。改成：① **锁空即抢**（`owner.txt` 不存在或 owner pid 已死）⇒ 立刻持有，**不再要求 `ps` 静默、不再要求 quiet_streak**；② **起跑后看租约**：出现 `lease_hits>0` 或 `os atomic tree: parent lease unavailable`（或 `compile_rc=2` 且 stderr 含该串）⇒ **该轮作废、不取任何数字**，释放锁、等 30–60s 重抢重跑，并把每次撞车记为 attempt 序号 + 时间戳 + rc + 撞车原文；③ 优先跑单次烤机那一步（`kd_prev`，~200s），比整套 ①~⑤ 更容易插进他线两轮烤机之间；④ 红线不变：撞车轮**永不算证据**；`cmp` 不等价 ⇒ 立即 `git apply -R`、S1b-0 判不成立。

**变更原因（环境约束逼出，非偏好）**：真正起互斥作用的是 workspace-root 原子树租约；`COMPILE_SLOT.lock` 只管**参与协作的线**。`run_m73x` 不参与协作且持续烤机 ⇒ 「等它静默」等于把进度交给一个不管我们的对手，静默窗**不可得**。故改为：**先占锁保证协作线之间的树一致性，再用租约判本轮有效性**。

**本席落地（policy rev.2，`.rebuild/s1b_impl/run_s1b0_regression.sh` 已改写）**：

| 项 | 实现 |
|---|---|
| 抢锁 | `ensure_lock`：`mkdir` 成功即持有并写 `owner`/`owner.txt`；锁被持且 owner **存活**则等 15s；owner **已死**则 `rm -rf` 回收。**不再有 `ps`/quiet_streak 条件** |
| 等锁上限 | `LOCK_WAIT_SEC=5400`（90 min）：超时即以 `lock wait exceeded …; giving up without touching the tree` 干净退出（**不 revert、不持锁**）。理由：协作线已出现过「首个进程崩溃→2 分钟后第二个进程重新持锁」的形态，无界等待会被饿死 |
| 撞车判定 | `collision_hits = grep -c 'parent lease unavailable'`；`bake_once`/`compile_once` 只在该值为 0 **且** rc=0 时算干净 |
| 作废重试 | `bake_round`（`MAX_ATTEMPTS=8`，`RETRY_SLEEP=45`）与 battery 的 `run_pair` 逐项重试；每次撞车写 `attempts.txt`：`时间戳 + VOID attempt=N + rc + 撞车原文` |
| 撞车计数入报告 | 末尾 `VALIDS/VOIDS` 汇总 + `attempts.txt` 全量留档；verdict 串带 `void_attempts=N`，并回答「本轮共几次撞车、最终有效轮是第几次」 |
| **一处有意偏离** | 政策说「释放锁、等 30–60s 重抢」。本席在 **patch 处于 reverted 态**的那一段**保持持锁**，不释放——因为释放会把一个**非规范 `src/**`** 暴露给其它线（这正是 §10.5 那次事故的形态）。其余阶段（`kd_s1b0` 烤制、battery）**照政策释放→睡→重抢** |

### 10.5 【事故与修复·如实登记】跑批器曾**先 revert 后抢锁**，污染并发线 95 秒

**事实**：policy rev.2 的首版脚本把 `git apply -R` 写在 `ensure_lock` **之前**。20:24:40（local 04:24:40）脚本一启动就 revert 了三个 patch，然后才进入等锁循环（`lock held by 2121; waiting`）。此时 `authfix phase3lite`（pid 2121，04:23:27 取得锁）**正持有锁**。⇒ **一个非规范的 `src/**` 在锁外暴露了约 95 秒**。

**影响评估（实读，结论：未污染对方结论）**：

- `authfix` 的 `phase3lite.log` 实读：04:23:27 取得锁后进入 **drain 阶段**（等 `cheng_cold|^kd|kernel_driver` 归零），`DRAIN-CLEAR 04:26:29`，**`[1] synthetic same-producer duplicate control` 直到 04:26:29 才开始**。
- 其首批编译产物 mtime 全部 ≥ **04:26:29**（`negative/sameprod_fixed.stdout.txt` 04:26:29、`.stderr.txt` 04:27:02），即**全部发生在 04:26:15 我复原之后**。
- 我的 revert 窗口 = 04:24:40 → 04:26:15，与该线 **drain 窗口完全重叠**，期间对方**没有起任何编译**。
- 另：该线用预烤驱动 `kd_fix` 编译 `ug_neg_*` 控制件，其闭包**不含**我改的三个编译器文件（`compiler_csg.cheng` / `typed_expr.cheng` / `typed_expr_type_arena.cheng`）。
- ⇒ **该线测量不受影响**；但我仍按纪律登记为「已发生的共享树污染事件」。

**修复（已落地并复验）**：

1. 终止旧跑批器，`trap EXIT/INT/TERM` 生效，**三个文件已回到规范态**（实读 `42fd9f09…`/`32a99253…`/`6b87c767…`，全部命中）。
2. 脚本改为 **`ensure_lock` → `[ "$HELD" = 1 ] || exit 1` → 才允许 `git apply -R`**，并加注释「ORDERING IS LOAD-BEARING … Never revert unheld」。
3. **复验（实读）**：新跑批器启动后处于 `lock held by 2121; waiting`，同时 `shasum` 显示工作树**仍是规范态**（`42fd9f09…`/`32a99253…`）⇒ **等锁期间不再触碰 `src/**`**，修复有效。
4. 另注（非本席造成）：`authfix` 的第一轮（pid 96276）在 04:21:50 死于自身脚本 `line 57: tag: unbound variable`，与本席无关。

---

## 11. rev.5 追加（S1b-0 判词入库 + 0c 开工前发现施工图两处**实质错误**，**先报再动**）

### 11.1 S1b-0 回归轮判词（父席已认，绿灯放行）

```
VERDICT: S1b-0 EQUIVALENT: identical=6 no_artifact_resolved_by_judgement=1 void_attempts=4
kd_prev  = cc79f125a8e5fe76d7d8d96bfa76fdac779b9384ffea50a74a72e36451e47d94  (rc=0 wall=202s)
kd_s1b0  = 10201ba73601ed7314ae09654772b56c9a4febbbd1a7bd4e788d108f0480a209  (rc=0 wall=202s)
有效轮 lease_hits=0；4 次撞车全部作废（attempts.txt）
```
逐项：四夹具 `CMP=IDENTICAL`（`8a9172e1…`/`1a652014…`/`1ffa4770…`/`b3a7cfc0…`）、2 源对 `CMP=IDENTICAL`（`516a2b49…`）、8 源闭包 `CMP=NO_ARTIFACT` + `JUDGEMENT=IDENTICAL`（两侧 `compile_rc=2`、末行判词逐字同）；六项全部 `decl_index … verified=1`。

**留痕（口径精度问题，如实登记）**：4 次作废的 `bake_prev` 记录为 `rc=2 wall=2s lease_hits=0 raw=''` —— 即**不是** lease 撞车（`raw` 为空），而是 `rc≠0`。我的 `bake_once` 判据是「`hits==0` **且** `rc==0` 才算干净」，所以它们被**保守地**作废、从未当证据用（判定不受影响）；但**作废原因未查明**（每轮 `bake_$tag.log` 被覆盖，早期轮内容已丢失）。⇒ 下一轮起：每轮保留独立 `bake_$tag.attemptN.log`，并把末行非 `csg_mem` 原文写进 `attempts.txt`。

### 11.2 【rev.5·先报再动】0c 开工前实读发现施工图两处**实质错误**

**① §6.5-8 自己写错了一处**：§1.2-0c / §2.2 把 `typeSyntaxChildStarts/Counts`、`typeSyntaxEnumVariantStarts/Counts` 标为「**已在** arena」——**实读推翻**。全文命中这四名的行（`2160/2170/2171/2200/2218/2238/2408/2409/2417/2418`）**逐行都是 `tree.` / `state.tree.`**，`FillTypeSyntax`（工作树 `:4926`）实际只填 16 列、不含这四列。⇒ **0c 新列清单必须补上这四列**。

**② 更严重：CSR 载荷与所有「producer source index」列必须基址重算，照抄单源树 = 静默 miscompile**。HEAD `parser.cheng` 的 `AppendFromImpl` 并林时对每源做三类重算，**单源树上这些值全是源内局部**：
- `out.typeSyntaxChildNodeIndexes ← typeSyntaxOffset + sourceChild`（`:11102`）；`typeSyntaxChildStarts ← childStart`，`childStart` 是**目标侧运行游标** `out.typeSyntaxChildCount`（`:11235`）⇒ arena 侧须 `childBase + treeChildStart`（`-1` 保持 `-1`）。
- `typeSyntaxEnumVariantStarts ← -1 : typeEnumVariantOffset + sourceVariantStart`（`:11270-11280`）；`typeEnumVariantPayloadTypeSyntaxNodeIndexes`（`:11012`）同理，载荷行号要加 **`typeSyntaxBase`**。
- **`typeSyntaxProducerSourceIndexes ← sourceOffset + sourceProducerIndex`（`:11194`）**，`sourceOffset` 是运行源序 ⇒ **单源树该列恒为 0**。流式模式下 arena 的每个 producer-source 列**必须写循环下标**；照抄会把**全部行记成源 0**，而且会让 `BuildSyntaxOwnership` 的 `"TypeSyntax parent crosses source"` 恒真（0==0）**把错误藏住**。
- 受影响读取点（工作树实读，7 处）：`:3742`/`:3746`、`:4908`、`:4931`、`:5060`、`:5173`、`:5291`，外加新增的 `typeSyntaxEnumVariantProducerSourceIndexes`。
- ⇒ **`AppendSourceInto` 签名必须带 `producerSourceIndex`**——施工图 §1.2-1a 的现签名 `…AppendSourceInto(tree, typeSyntaxBase, declarationBase, declarationIndex, state, out, err)` **没有它**。

两条已写入施工图 **§6.5-12 / §6.5-13**（rev.5）。**按父席「有阻塞或与施工图不符先报再动」，0c 代码在拿到确认前不动。**

### 11.3 修正后的 0c 列清单（rev.5 定稿版，供实施直接用）

| # | 列 | 类型 | 说明 |
|---|---|---|---|
| 1 | `typeSyntaxChildStarts` | arena i32 | **新增**（非「已在」）；值 = `childBase + treeChildStart`，`-1`→`-1` |
| 2 | `typeSyntaxChildCounts` | arena i32 | **新增**；直接抄 count |
| 3 | `typeSyntaxChildTypeSyntaxNodeIndexes` | arena i32 | **新增**；载荷 = `typeSyntaxBase + treeChild` |
| 4 | `typeSyntaxEnumVariantStarts` | arena i32 | **新增**；= `variantBase + treeVariantStart`，`-1`→`-1` |
| 5 | `typeSyntaxEnumVariantCounts` | arena i32 | **新增**；直接抄 |
| 6 | `typeSyntaxEnumVariantPayloadTypeSyntaxNodeIndexes` | arena i32 | **新增**；= `typeSyntaxBase + …`，`-1`→`-1` |
| 7 | `typeSyntaxEnumVariantProducerSourceIndexes` | arena i32 | **新增**；= **循环下标** |
| 8 | `typeSyntaxEnumVariantDeclarationOwnerNodeIndexes` | arena i32 | **新增**；= `typeSyntaxBase + …`，`-1`→`-1` |
| 9 | `typeSyntaxEnumVariantDeclarationOwnerTokenIndexes` | arena i32 | **新增**；= `tokenBase + …`，`-1`→`-1` |
| 10 | `typeSyntaxEnumVariantOrdinals` | arena i32 | **新增**；直接抄 |
| 11 | `typeSyntaxOwnerTokenTexts` | `str[]` | **文本表**（非 intern id），按全局 TypeSyntax 行 |
| 12 | `typeSyntaxNameTokenTexts` | `str[]` | 同上 |
| 13 | `typeSyntaxDeclarationOwnerTokenTexts` | `str[]` | 同上 |
| 14 | `typeSyntaxEnumVariantNameTokenTexts` | `str[]` | **文本表**，按全局变体行 |
| 15 | `functionBaseBySource` / `declarationFunctionBase` | index i32 | 加在 `TypedExprTypeDeclarationIndex` 上（§2.1） |

**红线（不变）**：以上新列**一律不得**加进 `typedExprTypeArenaHashMaterialized`（工作树 `:408`）的逐列枚举表；名文本只在 Seal 原位 `Intern`。
**另需核查（未做）**：`TypedExprTypeArenaClone`（工作树 `:8242` 一带）是**逐列显式**拷贝 ⇒ 新列若不加进去，clone 后会**静默丢列**；`TypedExprTypeArenaStrictValidateInto`（`:6822` 一带）也逐列校验长度。两者都要同步。

### 11.4 那 4 次作废的定谳：**环境作废（他线污染），非本席脚本问题**

父席给的线索经核对**完全坐实**（时间线 + 文件 mtime 双重吻合）：

| 事件 | UTC | 本地 (UTC+8) | 与污染窗 04:39→05:18 的关系 |
|---|---|---|---|
| `bake_prev` VOID ×4 | 21:15:20 / 21:16:07 / 21:16:54 / 21:17:41 | **05:15:20 – 05:17:41** | **全部落在窗内** |
| `bake_prev` VALID（attempt 5） | 21:21:48 | **05:21:48** | **在 05:18 回退之后** |
| `bake_s1b0` VALID | 21:25:11 | 05:25:11 | 之后 |
| battery 六项 | 05:25–05:43 | — | 之后，全部干净 |

- `src/core/tooling/backend_driver_dispatch_min.cheng` 的 mtime 实读 = **`09-11_05:18`**，正对应「05:18 才回退」。
- 作废签名 = `rc=2 wall=2s` + 无 lease 文本，与「`theory_emit` 未验证接线在树时任何 bake 都是 `rc=2 wall=1-2s`」逐条吻合。
- ⇒ **判定：环境作废（他线污染）**。**但原文判词已不可考**——当时每轮覆盖同一个 `bake_$tag.log`，4 次的 stderr 全被 attempt 5 覆盖。故本条只能标「环境作废（时间线+mtime 坐实，**原文已丢失**）」，**不能**标成"已见 `call argument exact transfer authority is invalid`"。
- **此即「作废要留原因」的价值**：保守作废保住了 S1b-0 的结论（未被污染数据污染），但没有 per-attempt 原文就无法自证是谁污染了谁，只能靠父席这条线的旁证反推。
- **已修**：`bake_once` 改为写 `bake_$tag.attempt$n.log`（不再覆盖），`attempts.txt` 每条记 `rc` / `lease_hits` / **末行非 `csg_mem` 原文**（`tail='…'`）。下一轮任何作废都会自带原因。
- **对 S1b-0 结论的影响**：无。4 次作废**从未进入判据**；有效轮 `lease_hits=0`、六项等价。**结论不变**。

---

## 12. rev.6 追加（0c 已实施 + 一处**我自己引入的编译错误**已修 + A/B 轮在跑）

### 12.1 0c 已实施（工作树 + `patches/s1b_0c_type_arena.patch`）

按 rev.5 定稿清单落地，**只动 `typed_expr_type_arena.cheng`**，delta = **+405/−1**：

| 落点 | 内容 |
|---|---|
| struct（`:157` 之后） | 10 个 arena 列（`typeSyntaxChildStarts/Counts/ChildTypeSyntaxNodeIndexes`、`typeSyntaxEnumVariantStarts/Counts/PayloadTypeSyntaxNodeIndexes/ProducerSourceIndexes/DeclarationOwnerNodeIndexes/DeclarationOwnerTokenIndexes/Ordinals`）+ 4 张 `str[]` 文本表（`typeSyntaxOwnerTokenTexts`/`NameTokenTexts`/`DeclarationOwnerTokenTexts`/`EnumVariantNameTokenTexts`） |
| 新 helper `:4960` | `typedExprTypeArenaTokenTextOrEmpty(tree, tokenIndex)`——越界 token 返回 `""`（文本表的「缺席」值，**从不 Intern**） |
| `FillTypeSyntax` `:4970` | 增形参 `viewProducerSourceIndex: int32`；**四个 view 基址由目标列的当前长度直接导出**（`value.typeSyntaxTypeIds.len` / `…ChildTypeSyntaxNodeIndexes.len` / `…EnumVariantOrdinals.len` / `tokenProducerSourceIndexes.len`）⇒ 整林驱动下**全为 0、每条 rebase 都是恒等**，逐源驱动下自动等于该源的全局基址。**这是本次实现的关键简化：不需要把四个基址当形参传，也不需要改任何调用点语义** |
| 同处 | child CSR（starts 用 `-1` 保持 / 载荷加 `viewTypeSyntaxBase`）、enum variant CSR（同上）、variant payload（`+viewTypeSyntaxBase`）、`ProducerSourceIndexes`（**写 `viewProducerSourceIndex` 形参**）、`DeclarationOwnerNodeIndexes`（`+viewTypeSyntaxBase`）、`DeclarationOwnerTokenIndexes`（`+viewTokenBase`）、`Ordinals`（原样）、4 张文本表 |
| `TypedExprTypeArenaClone` `:8390` | **逐列显式**拷贝，已把 14 个新列全部补齐（漏一列即静默丢列） |
| `TypedExprTypeArenaStrictValidateInto` `:6972` | **有意不加**新列的长度校验：加了会让该 validator 拒绝任何非 `FillTypeSyntax` 构造的 arena ⇒ 属行为变更、破坏 0c 的「纯加」契约。**登记为 S1b-1 项**（Seal 真正消费这些列时同步收紧） |
| `typedExprTypeArenaHashMaterialized:408` | **一字未动**（新列不进枚举表 ⇒ 不扰动 `artifactRaw32`） |

### 12.2 ⚠️ 我自己引入又修掉的一处编译错误（留痕）

首次落地时我把一段说明性注释**插在 `StrictValidateInto` 的 `||` 条件链中间**：

```
       value.typeSyntaxBracketBaseTypeSyntaxNodeIndexes.len !=
           value.typeSyntaxCount ||
       # [S1b-0c] Deliberately NOT tightened here. ...
       value.functionSourceStarts.len != value.producerSourceCount ||
```

`cheng_cold` 判词（**新加的 per-attempt 日志第一次就发挥了作用**，`bake_prev.attempt1.log`）：

```
  |        # [S1b-0c] Deliberately NOT tightened here.  Row-aligned checks for the
cheng_cold: expected : after condition (recovery=1 depth=2)
cheng_cold: reachable function body missing: typearena.TypedExprTypeArenaStrictValidateInto
[cheng_cold] primary object emit failed
```

⇒ **Cheng 不允许在 `||` 之后、下一个操作数之前插入注释行**。已删除该注释、条件链恢复原状（`grep -c "Deliberately NOT tightened"` = 0），`patches/s1b_0c_type_arena.patch` 已重生成（`git apply --check -R` 通过）。
**这正是「作废要留原因」的直接收益**：上一轮同类失败只能靠时间线反推，这一轮**第一次尝试就拿到了原文**。

### 12.3 跑批器两处自身缺陷（已修）

1. **TERM trap 不退出**：`trap 'release_all' EXIT INT TERM` 里 handler 只复原+释放、**不 `exit`**，导致 SIGTERM 后脚本**继续跑**（实测：被杀后又重新抢锁 06:31:22 接着烤）。已改为 `trap 'release_all' EXIT` + `trap 'release_all; exit 130' INT TERM`。
2. **失败轮会记录陈旧 `kd_sha256`**：bake 失败不覆盖 `kd_$tag`，脚本却照读该文件的 sha（实测 attempt1 报出上一轮的 `cc79f125…`）。已在 bake 前 `rm -f "$OUT/kd_$tag"`。
3. 另：`pkill -TERM` 对处于 `sleep 45` 的脚本**最多延迟 45s** 才生效（bash 在前后台命令结束后才跑 trap）——与早先观察到的 `Terminated: 15 sleep 15` 同一机制。

### 12.4 当前状态

**0c A/B 轮在跑**（受管后台作业，`setsid` 隔离）：22:33:22 抢到锁（owner 55781），已 `apply -R` 进入 prev 态，`bake prev` attempt1 进行中（100% CPU）。判定口径与 S1b-0 轮相同：**同一工作树内 (S1b-0+0c) vs (HEAD)**，六项 battery，`cmp` 或 rc+末行判词。
**读法声明**：S1b-0 单独的等价性已由 §11.1 独立证明，故本轮不等价即可**归因到 0c**；本轮等价则 0c 亦为纯加。

### 12.5 【方法学缺陷·已修】0c 轮的 A/B 一度**口径错位**

第一次启动 0c 轮时，跑批器只 `apply -R` 了三个 **S1b-0** patch，**没有**回退 0c ⇒ 两侧都含 0c，A/B 实际比较的是「HEAD+0c」vs「HEAD+S1b-0+0c」，**差的只是 S1b-0，0c 根本没被隔离**（等于把已验证过的 S1b-0 又证一遍）。已终止该轮（未取任何数字）。

**修法**：把 0c 从 S1b-0 的 patch 里**拆出来**成独立件 `patches/s1b_0c_only_type_arena.patch`（173 增行，5 hunk：`@@ -155,6 @@` struct、`@@ -4687,12 @@` helper、`@@ -4793,6 @@` FillTypeSyntax、`@@ -5784,7 @@` 调用点、`@@ -8010,6 @@` Clone）。拆分依据：S1b-0 的 type_arena hunk 带 `S1b-0b`/`S1b-0f` 标记，按 hunk 过滤即可分离。
**组合性已验证（实读）**：`apply -R s1b_0c_only` + `apply -R s1b_0_type_arena` ⇒ `git diff --numstat` **为空（精确到达 HEAD）**；正向 `apply s1b_0_type_arena` + `apply s1b_0c_only` ⇒ **405/1（精确回到当前）**。
跑批器已改为四件（`P4=s1b_0c_only_type_arena.patch`），revert/apply 均含 P4，期望 sha 更新为 `5a1607d0e4b7aa4e6ebb8746602de8efb1ff786d2700376f1b5a7222fa737c50`。

### 12.6 当前状态（交稿时）

**0c 隔离轮在跑**（受管后台作业 + `setsid` 隔离）：22:35:44 抢到锁（owner 56909），已四件全 `apply -R`，**A 侧精确等于 HEAD**（`git diff --numstat` 只剩他线 GEN2-P1 的 `compiler_csg 31/0`，该量两侧恒定、相互抵消）。随后按序：`bake prev` → 四件复原并核对三 sha → `bake s1b0` → 六项 battery → `VERDICT.txt`。

**判词口径**：A=HEAD vs B=S1b-0+0c ⇒ 不等价即可**归因到 0c**（S1b-0 的等价性已由 §11.1 独立证明）；等价则 0c 亦为纯加。撞租约照 policy rev.2 作废重试，`attempts.txt` 现在带 `rc`/`lease_hits`/**末行原文**。

**交付物**：`patches/` 下五件（`s1b_0_compiler_csg` / `s1b_0_typed_expr` / `s1b_0_type_arena` / `s1b_0c_only_type_arena` / `s1b_plan_doc`）+ `s1b_0_MANIFEST.sha256`。

### 12.7 【纪律回执·rev.6 追加】四条由本轮实测挣来的经验（父席裁定入库）

1. **「作废必须留原因」是可直接兑现的收益，不是口号。**
   `bake_once` 从「每 tag 覆盖一个 log」改成「每 attempt 独立 `bake_$tag.attempt$n.log` + `attempts.txt` 记 `rc`/`lease_hits`/**末行非 `csg_mem` 原文**」后，**第一次运行就当场抓到原文**：
   ```
   cheng_cold: expected : after condition (recovery=1 depth=2)
   cheng_cold: reachable function body missing: typearena.TypedExprTypeArenaStrictValidateInto
   ```
   对照：**上一轮同类失败（4 次 `rc=2 wall=2s`）只能靠时间线与 mtime 反推**，且原文永不可考。⇒ **任何"作废/丢弃一轮"的路径，必须同时落盘足以自证的原文**；否则事后只能得到"结论对但证据强度不可考"。
2. **语言事实（Cheng）**：**不允许在 `||` 之后、下一个操作数之前插入注释行**。写在条件链中间的注释会让 `cheng_cold` 报 `expected : after condition`，并把整个函数体判成 `reachable function body missing`（表象指向函数、真因在注释位置）。⇒ 注释只能放在整个 `if` 语句之前，或条件链闭合之后。
3. **脚本自身缺陷：「杀不掉、反而又抢锁」是最危险的一类。**
   `trap 'release_all' EXIT INT TERM` 的 handler 只复原 + 释放、**不 `exit`** ⇒ 收到 SIGTERM 后脚本**恢复循环并重新 `mkdir` 抢锁接着烤**（实测 pid 53369 被杀后于 06:31:22 重新持锁）。这会造成「以为进程已停、实际还在跑」的假象，进而污染他人轮次。已改 `trap 'release_all' EXIT` + `trap 'release_all; exit 130' INT TERM`。
   **配套事实**：`pkill -TERM` 打在处于 `sleep 45` 的脚本上，**最多延迟 45s 才生效**（bash 在前后台命令结束后才执行 trap）——早先观察到的 `Terminated: 15             sleep 15` 就是同一机制。⇒ 清理这类脚本必须**等一个 sleep 周期或直接 SIGKILL 后清陈旧锁**。
   第三个缺陷：bake 失败时 `kd_$tag` 保留上一轮文件，脚本却照读其 sha（实测把上一轮的 `cc79f125…` 当本轮结果报出）。已在 bake 前 `rm -f`。
4. **A/B 口径必须自查「差集是否等于被测对象」。**
   0c 首次启动时只回退三个 S1b-0 patch ⇒ 两侧都含 0c ⇒ **实际比较的是 S1b-0、0c 根本没被隔离**；若不自查，就会产出一个「等价」的**假绿判词**（而且看起来完全正常）。修法不是"多回退一个文件"，而是**把被测增量拆成独立件，并用测量证明拆分正确**：`-R 0c_only` + `-R s1b_0_type_arena` ⇒ `git diff --numstat` **为空**（精确到 HEAD）；正向两件 ⇒ **405/1**（精确回当前）。⇒ **凡 A/B，必须先回答"两侧的差集到底是什么"**，再跑。

---

## 13. rev.8 —— S1b-1 **未开工**：交稿时预算耗尽，按纪律不开「半流式态」

### 13.1 为什么不在本轮起手（决定与理由，供复核）

S1b-1 是施工图定为**原子、不可拆**的一步（§1.2-S1b-1 / §6.2-4），内容为：删并林半段 + `Init/AppendSource/Seal` 重构 + 权威相索引化 + 逐源驱动 + R1 逐源 + Seal 接线 + Seal 段 7 处树读替换（其中 3 处是大函数：`BuildObjectDeclaration` / `BuildTupleAliasMembers` / `BuildEnumDeclaration`，合计 ~500 行）+ `StrictValidateInto` 补校验。估工 **12~16h**。

本轮已完成的 0c/回归/夹具/政策落地消耗后，**剩余预算不足以一次成型**。两条硬约束同时约束了选择：

1. **施工图 §1.2 + 红线**：「原子切换必须一次成型，不许留半流式中间态」。
2. **父席 2026-09-11 新令**：「**未验证源码不许进工作树**」（`theory_emit` 污染事件后的明令）。

⇒ 若此刻起手，产出的必然是**未经验证的、部分应用的 S1b-1**，同时违反 1 与 2。故**选择不起手**，改为把「可被下一位执行者直接接手的已验证锚点」固化下来（本节）。

**这不是「没做」，是把「不许留半流式态」这条约束执行到底。**

### 13.2 S1b-1 起手锚点（**全部在改动后工作树逐条 `grep` 复核**，可直接用）

`src/core/lang/typed_expr_type_arena.cheng`（当前 = HEAD + S1b-0 + 0c）：

| 目标 | 锚点（工作树行号） |
|---|---|
| `TypedExprTypeArenaBuildFromParserTreeInto`（待拆 Init/AppendSource/Seal） | **`:6144`** |
| `typedExprTypeArenaBuildState`（`state.*` Init 期全局分配） | `:253` 一带 |
| `IndexFields`（`fieldCount` 游标须跨源持久） | **`:3685`** |
| `BuildSyntaxOwnership` | **`:3738`** |
| `DependencyIndirect`（Seal 树读 #4） | **`:3819`** |
| `ObjectBaseTargetInto`（Seal 树读 #2） | **`:4501`** |
| `ReserveAggregatesRec`（symbolId 循环 → 本源区间） | **`:5475`** |
| `InternSyntaxRec`（游标上界 → 全局行） | **`:5513`** |
| `RealizeDeclarationsRec`（Seal 树读 #1） | **`:5901`** |
| `SpecializePendingRec`（Seal 树读 #3） | **`:5977`** |
| `PreflightBracketAuthority` | **`:1512`** |
| `StrictValidateInto`（**死账：新列校验与 Seal 消费同刀落地**） | **`:6937`** |
| Seal 段 7 处树读中**最大的 3 处**（需 0c 文本表 + CSR） | `BuildObjectDeclaration` / `BuildTupleAliasMembers` / `BuildEnumDeclaration`（在 `:1550-2058` 原区间，现整体 +约 42） |
| 名 `Intern` 原位点（**Seal 期才可 Intern**） | `:1634` / `:1816` / `:1940` 一带（同上位移） |

`src/core/tooling/compiler_csg.cheng`（当前 = HEAD + S1b-0 + 他线 GEN2-P1）：

| 目标 | 锚点（工作树行号） |
|---|---|
| `CompilerCsgBuildParserForestAuthorityInto`（并林函数外壳） | **`:33067`** |
| **并林半段**（待整体删） | **`var totalArenaBytes: int64` `:33130` → `while mergePass < 2` `:33136` → `declarationIndex.sealed = true` `:33251`** |
| `CompilerCsgTypeArenaFinalizeParserForestInto`（能力拆三块） | **`:35600`** |
| `work.typeArenaParserForest` 其余引用 | `:35609/:35610/:35622/:35626/:35631/:35634/:35639/:35641/:36090/:36121` + 调用点 |
| `work.typeArenaForestSourceArenaBytes`（0a 产物，S1b-1 的 reserve 来源） | `:1477`（字段）/`:33076`（形参）/`:33180`（写入）/`:38911`（调用点） |
| R0 `expectedSourceCount`（已换装） | `:33246`/`:33412` 形参；`:37206`/`:37364` 调用点 |

### 13.3 下一位执行者的最小开工序（按 rev.5 裁决）

1. **先补 `StrictValidateInto`**（`:6937`）的新列校验——**与 Seal 消费同刀**，不要单独落地（单落地会拒绝非 `FillTypeSyntax` 构造的 arena ⇒ 破等价）。
2. 拆 `:6144` 为 `Init` / `AppendSource(tree, producerSourceIndex, typeSyntaxBase, declarationBase, declarationIndex, state, out, err)` / `Seal`：
   - `state.*` 在 **Init** 期按 `index.typeSyntaxCount` 全局分配；
   - `IndexFields`（`:3685`）的 `fieldCount` **分配游标跨源持久**；
   - 六个 `Fill*` 族**零改写**（顺序 `ArenaArrayInt32Add` 自动全局行号）；
   - **全部 producer-source 列由 `producerSourceIndex` 形参写入**（照抄单源树会给全部行记源 0，且让 parent-crosses-source 校验恒真）；
   - CSR：`childBase + treeChildStart`（`-1` 保 `-1`）、载荷 `+ typeSyntaxBase`、变体 starts/payload `+ typeSyntaxBase`、`DeclarationOwnerTokenIndexes + viewTokenBase`。
3. 权威相索引化（`BuildSourceInto`），逐源驱动（`CompilerCsgStreamTypeArenaFromDeclarationIndexInto`），R1 逐源（`producerFunctionBase` 已在 S1b-0-0d 就位），**同一步内删 `:33130-33251` 并林半段**。
4. 每轮字节等价前置门 + policy rev.2 抢锁/作废口径；达标线 = **默认 768MiB 门内全量 234 源跑完并林**（抬门只许诊断且标 `diagnostic`）。

### 13.4 交稿时的机械状态（实读）

- 工作树 = **HEAD + S1b-0 + 0c**（三文件 sha：`compiler_csg 42fd9f09…`、`typed_expr 32a99253…`、`type_arena 5a1607d0…`），**无未验证的半成品**。
- 0c 隔离轮已判 **`identical=6 differ=0 no_artifact=1 voids=0`**（父席已认绿灯）。
- `patches/` 六件：`s1b_0_compiler_csg` / `s1b_0_typed_expr` / `s1b_0_type_arena` / `s1b_0c_only_type_arena` / `s1b_plan_doc` + `s1b_0_MANIFEST.sha256`。
- 跑批器（`.rebuild/s1b_impl/run_s1b0_regression.sh` + `launch_regression.py`）已是**四件 scoping + per-attempt 留原文 + policy rev.2**，下一位直接改 `P1..P4` 即可复用。

---

## 14. rev.9 —— S1b-1 按**增量轮**开工；第 ① 步已实施并排队验证

父席 2026-09-11 裁决把口径说准：**约束的是"树的状态"，不是"能不能动手"** —— 允许为验证而应用，但**每一轮结束树必须处于"已验证等价"态或已完全回退**，绝不留半成品交稿。据此把 12~16h 的 S1b-1 拆成可独立验证的轮次推进。

### 14.1 第 ① 步（本轮）：`StrictValidateInto` 新列校验 —— **已实施**

落点 `typed_expr_type_arena.cheng`（工作树 `:6971-6997` 与 `:7095-7119`），两处：

1. **形状门内新增 12 项长度校验**（`:6971` 一带）：
   - 行对齐组：`typeSyntaxChildStarts/Counts`、`typeSyntaxEnumVariantStarts/Counts`、`typeSyntaxOwnerTokenTexts`/`NameTokenTexts`/`DeclarationOwnerTokenTexts` 各 `== typeSyntaxCount`；
   - 变体族互等（每变体一行）：`…PayloadTypeSyntaxNodeIndexes` / `…ProducerSourceIndexes` / `…DeclarationOwnerNodeIndexes` / `…DeclarationOwnerTokenIndexes` / `…EnumVariantNameTokenTexts` 各 `== …EnumVariantOrdinals.len`。
2. **child CSR 载荷对账**（`:7095` 一带，形状门之后）：`typeSyntaxChildTypeSyntaxNodeIndexes.len` 必须等于逐行 `typeSyntaxChildCounts` 之和（该列在本对象上没有标量总数，只能求和；短了就会在 Seal 期变成越界读，正是这个 validator 该拦的形态）。

**为什么现在才加**：这几项若在 0c 那轮就加，会拒绝任何**不经 `FillTypeSyntax` 构造**的 arena ⇒ 属行为变更、破坏 0c 的「纯加」契约。故当时**有意不加并登记为死账**，现在与「Seal 真正消费这些列」同一批落地——**死账已销**。

### 14.2 独立可验性（本轮的关键，用测量证明）

第 ① 步拆成独立件 `patches/s1b_1a_validate.patch`（2 hunk，均落在 `StrictValidateInto`）。**组合性实读验证**：

```
反序回退  -R 1a + -R 0c_only + -R s1b_0_type_arena
  ⇒ git diff --numstat src/core/lang/typed_expr_type_arena.cheng  为空（精确到达 HEAD）
正序应用  s1b_0_type_arena + 0c_only + 1a
  ⇒ git diff --numstat = 450 / 1（精确回到当前工作树）
```
⇒ 三个件互不重叠、可任意独立增删。

**跑批器已扩到五件**：`P1=s1b_0_compiler_csg` / `P2=s1b_0_typed_expr` / `P3=s1b_0_type_arena` / `P4=s1b_0c_only_type_arena` / `P5=s1b_1a_validate`；`SHA_TARENA` 更新为 `4161ad9b40c2a65f97d9885a75282741e56d89ba18b23426d89e789a575d5738`。revert/apply/trap 三处均含 P5。

### 14.3 当前状态（交稿时）

- **第 ① 步 A/B 轮已挂起**（受管后台作业 + `setsid` 隔离）：23:07:21 起在**等锁**（`lock held by 73329`，owner = `pool68-fixABCD`）。**等锁期间不触碰 `src/**`**（`git diff --numstat` 实读 = `56/23`、`450/1`、`129/29`，即 S1b-0+0c+1a 完好）。
- 抢到锁后按既有口径跑：A=HEAD（五件全 `apply -R`）vs B=S1b-0+0c+1a，`bake prev` → 复原核对三 sha → `bake s1b0` → 六项 battery → `VERDICT.txt`；撞租约照 policy rev.2 作废重试（per-attempt 留原文）。
- **判词口径**：不等价 ⇒ 立即 `git apply -R` 五件、判第 ① 步不成立（并给出原文）；等价 ⇒ 第 ① 步成立，进第 ② 步（`state.*` Init 期全局分配 + `IndexFields` 游标跨源持久 + producer-source 列走形参 + CSR 基址重算，**仍是整林驱动、行为应等价**），再到第 ③ 步（权威相索引化 + 逐源驱动 + **同步删并林段 `:33130-33251`**，真正改行为、必须一次成型并跑门内全量）。

### 14.4 后续增量轮的锚点（沿用 §13.2，仅 type_arena 侧因 0c/1a 插入而位移）

`BuildFromParserTreeInto` `:6164` · `IndexFields` `:3685` · `BuildSyntaxOwnership` `:3738` · `DependencyIndirect` `:3819` · `ObjectBaseTargetInto` `:4501` · `ReserveAggregatesRec` `:5475` · `InternSyntaxRec` `:5513` · `RealizeDeclarationsRec` `:5901` · `SpecializePendingRec` `:5977` · `PreflightBracketAuthority` `:1512` · `StrictValidateInto` `:6937`（已改）。`compiler_csg.cheng` 侧不变：`BuildParserForestAuthorityInto :33067`、并林半段 `:33130`→`:33136`→`:33251`、`FinalizeParserForestInto :35600`。

---

## 15. rev.10 —— 第 ① 步首次提交**把我自己刚记录的语言事实又犯了一次**（已修，定性更正）

### 15.1 事实与定性（**更正：不是环境作废，是补丁编译错误**）

第 ① 步首版（`s1b_1a_validate` 初版）A/B 轮 **8 次尝试全部作废**，`rc=2 wall=24s lease_hits=0`。父席从 per-attempt 日志挖出原文（去掉 `[CVOG]` 噪声后——那是 `bootstrap/cold_parser.c` 里**早已提交**的既有插桩，`git diff` 为空，**不是污染源**）：

```
  |        # [S1b-1a] Seal-phase parser facts.  Row-aligned columns must cover
  |                                                                          
cheng_cold: expected : after condition (recovery=1 depth=2)
cheng_cold: reachable function body missing: typearena.TypedExprTypeArenaStrictValidateInto
cheng_cold: reachable cold function body missing (recovery=0 depth=1)
[cheng_cold] primary object emit failed
```

⇒ **定性更正：这 8 次是「补丁编译错误（附原文）」，不是环境作废。** 依据：全部 `rc=2` 且 **`lease_hits=0`**（无任何租约撞车），且判词直指我新加的源码行。上一轮 §11.4 对 **S1b-0 那 4 次**的「环境作废」定性**不变**（那次有 `lease_hits` 无关但时间线+mtime 双重坐实他线污染），**两次定性不同、各自有据**，不得混用。

### 15.2 错误本身：**我在 §12.7-② 刚记录完这条语言事实，下一轮就自己犯了**

§12.7-② 原文：「**Cheng 不允许在 `||` 之后、下一操作数之前插入注释行**（表象是 `reachable function body missing`，真因在注释位置）」。而 `s1b_1a_validate` 初版里，我把 `# [S1b-1a] Seal-phase parser facts…` 那段注释**又插进了 `||` 条件链中间**（`:6974-6981`）。⇒ **记录规则 ≠ 不再犯错；规则必须落成机器可查的形态，而不是靠记性。**

### 15.3 修法与自证

1. **注释整段移出条件链**，落在形状门之后（`return false` 之后、`var typeSyntaxChildTotal` 之前），并在注释里显式写死：
   > `NOTE: this comment sits AFTER the condition chain on purpose. Cheng does not accept a comment line between || and the next operand … Do not move it back in.`
2. **加了一道机器检查**（本次实跑）：扫 `StrictValidateInto`（`:6937-7150`）内**每一条以 `||` 结尾的行**，断言其**下一行不是注释** ⇒ 输出 `check done`，**零命中**。
3. **重生成 `s1b_1a_validate.patch`**（仍 2 hunk，均落在 `StrictValidateInto`）并**重新验证组合性**：
   ```
   反序回退 1a + 0c_only + s1b_0_type_arena ⇒ numstat 为空（精确到 HEAD）
   正序应用 三件                            ⇒ numstat = 450/1（精确回当前）
   ```
   `SHA_TARENA` 更新为 `8b8332eeb944aeda3aa7490eecc23179509b10523f1ec11d7ef29c0798396605`。
4. **修复有效性当场自证**：重跑 A/B，`bake prev attempt1 rc=0 wall=210s lease_hits=0` **一次过**（修复前同一轮 8 次全废）⇒ 判词与修复对因。

### 15.4 per-attempt 留原文的价值（第二次兑现）

S1b-0 那 4 次同类失败**只能靠时间线+mtime 反推**、原文永不可考；这次 `attempts.txt` 直接把 `expected : after condition` 与出错源码行攥在手里，定位到行、一次修掉。**两轮对比即是这条纪律的量化收益。**

### 15.5 当前状态（交稿时）

第 ① 步 A/B 轮**已在跑**（受管后台作业 + `setsid`）：23:34:14 抢到锁（owner 92564），23:37:44 `bake prev` **attempt 1 即 VALID**（`kd_prev = 43b6a2bca…`，与上一轮 A 侧逐字节一致，符合预期——A 侧同为 HEAD），四件复原并核对三 sha 全中（`42fd9f09…`/`32a99253…`/`8b8332ee…`），随后 `bake s1b0` → 六项 battery → `VERDICT.txt`。
**判词**：等价 ⇒ 第 ① 步成立、死账销、进第 ② 步；不等价 ⇒ 立即 `git apply -R` 五件、判第 ① 步不成立并给出原文。

---

## 16. rev.11 —— **第 ② 步按我 §14.3 的范围做不出来**（先报再动）；`||` 检查已落成脚本

### 16.1 结论：第 ② 步在「仍是整林驱动」的前提下是**恒等变换**，其中「producer-source 列走形参」一项**根本无法实现**

实读三条（工作树）：
1. `FillTypeSyntax` 在整林模式下**只被调用一次**、吃整棵树（`:6168` `typedExprTypeArenaFillTypeSyntax(value, tree, 0, err)`）。
2. 树上的 `typeSyntaxProducerSourceIndexes[row]` 是 **逐行变化**的——`ParserValueExprTreeAppendFromImpl` 写的是 `sourceOffset + sourceProducerIndex`（HEAD `parser.cheng:11194`），源 0 的行是 0、源 1 的行是 1…… ⇒ **一个标量形参不可能复现一列逐行变化的值**。
3. 四个 view 基址在行循环**之前**捕获一次（`:4979-4982`），整林驱动下 `value.*` 各列此刻全空 ⇒ **基址全为 0、每条 rebase 都是恒等**。

⇒ **「全部 producer-source 列由 `producerSourceIndex` 形参写入」这一项，只有在 `FillTypeSyntax` 被逐源调用时才有意义**，即属第 ③ 步（`AppendSource` 拆分），不属于第 ② 步。同理由，`state.*` 按 `index.typeSyntaxCount` 分配在整林下与按 `tree.typeSyntaxCount` **数值相同**（索引就是从同一棵树建的），`IndexFields` 的 `fieldCount` 游标在整林下**本来就是全局一次**。

**因此第 ② 步不是"行为应等价的增量"，而是恒等变换**：它无法"独立验证某行为"，只能验证"没弄坏"。把它单列一轮，代价≈一轮槽位（bake×2 + 六项 battery ≈ 25 min）而产出为零行为变化 —— **这是我 §14.3 自己划错的范围，按"与施工图不符先报再动"上报。**

### 16.2 建议的修正切法（请裁）

把原第 ② 步的准备工作**并入第 ③ 步的同一次成型**，因为它们在整林驱动下全部退化为恒等、且其中一项只有在逐源调用时才成立：

- 第 ③ 步（一次成型）内部顺序：`state.*` 改按索引总数分配 → `AppendSource` 增 `producerSourceIndex` 形参并逐源调用 `FillTypeSyntax`（此时四个基址自动非零、rebase 自动生效、producer-source 列由形参写入）→ `IndexFields` 游标跨源持久 → 权威相索引化 → 逐源驱动 → **同步删并林段 `:33130→:33136→:33251`**。
- 这样第 ③ 步仍是"一次成型"，但**不再有一个空转的中间轮**。
- 若你坚持要一个可独立验证的中间轮，**唯一有意义的第 ② 步**是：**只拆 `Init`（把 `state.*` 分配与 bucket/scalar 种子搬出去），AppendSource/Seal 暂不拆**——但那仍然是恒等（整林下 Init 与 Appendsource 本来就在同一次调用里），**同样零行为变化**。⇒ 我的判断是：**没有值得单列的中间轮**，第 ② 步应当并入第 ③ 步。

### 16.3 新增机器检查脚本（按你的第 ③ 条纪律）

`.rebuild/s1b_impl/check_no_inline_comment_after_or.py`（副本已放 `patches/`）：扫描给定文件中**每一条以 `||` 结尾的行**，若其下一行是注释即报错并给出行号与两行原文；退出码 0/1。
**本次实跑**（对 `typed_expr_type_arena.cheng` / `compiler_csg.cheng` / `typed_expr.cheng`）：`OK: no comment follows a \`||\` line in 3 file(s)`。⇒ 「规则落成机器可查的形态」已兑现，以后每次改这三个文件都跑一遍。

### 16.4 三类作废定性的口径（按你第 ② 条纪律固化）

| 类别 | 判据 | 实例 |
|---|---|---|
| **环境作废** | `lease_hits>0`，或**无** `lease_hits` 但有独立旁证（时间线 + 文件 mtime 等） | S1b-0 那 4 次（时间线 + `dispatch_min` mtime=05:18 坐实他线污染，**原文已丢失**） |
| **补丁编译错误** | `rc=2` 且 `lease_hits=0`，且 per-attempt 原文指向本轮新增源码 | 第 ① 步那 8 次（`expected : after condition`，**原文在手**） |
| **租约撞车** | stderr 含 `os atomic tree: parent lease unavailable`，或 `compile_rc=2` 且带该串 | 本轮尚未出现 |

⇒ 三类**各自有据、不得混用**；任何作废记录必须同时留 `rc` / `lease_hits` / 末行原文三项。

---

## 17. 【独立可引】作废定性三分类表（父席 2026-09-11 认定为本夜最有复用价值的产出之一）

> 本表独立成节，供其它线直接引用。**任何"作废/丢弃一轮"的记录，必须同时留下 `rc` / `lease_hits` / **末行原文**三项**；缺任一项即不可定性。

| 类别 | 判据（必须全部满足） | 实例（2026-09-11） | 证据强度 |
|---|---|---|---|
| **环境作废** | ① `lease_hits > 0`，**或** ② 无 lease 命中但存在**独立旁证**（时间线 + 文件 mtime / 进程表等） | S1b-0 的 4 次 `bake_prev`（`rc=2 wall=2s lease_hits=0`）：作废时刻 05:15:20–05:17:41 全落在 `theory_emit` 污染窗 04:39–05:18 内，valid 轮 05:21:48 在 05:18 回退之后，`backend_driver_dispatch_min.cheng` mtime 实读 = `05:18` | **时间线+mtime 坐实；原文已丢失**（当时每轮覆盖同一 log，被 attempt5 覆盖）⇒ 只能标「环境作废（原文不可考）」，**不得**声称见过具体判词 |
| **补丁编译错误** | `rc = 2` **且** `lease_hits = 0` **且** per-attempt 原文指向**本轮新增源码** | S1b-1a 的 8 次 `bake_s1b0`（`rc=2 wall=24s lease_hits=0`）：`cheng_cold: expected : after condition` + `reachable function body missing: typearena.TypedExprTypeArenaStrictValidateInto`，且原文里直接印出出错的注释行 | **原文在手**（per-attempt 日志），可定位到行、一次修掉 |
| **租约撞车** | stderr 含 `os atomic tree: parent lease unavailable`，**或** `compile_rc=2` 且 stderr 带该串 | 本轮（S1b-0 / 0c / 1a 各轮）**尚未出现**；历史见 VERIFY §十九「11 轮 8 次全 rc=2、两份 stderr 各含 1 次该串」 | 判词唯一且明确 |

**配套纪律**：
1. **三类各自有据、不得混用**——把「补丁编译错误」写成「环境作废」会掩盖自己的错；把「环境作废」写成「补丁错误」会冤枉自己的代码。
2. **per-attempt 留原文是这条纪律的实现手段**：`bake_once` 写 `bake_$tag.attempt$n.log`（不覆盖）+ `attempts.txt` 每条带 `rc` / `lease_hits` / 末行非 `csg_mem` 原文。**两轮对比即量化收益**：S1b-0 那 4 次只能反推、原文永不可考；S1b-1a 这 8 次直接攥住 `expected : after condition` 与出错行。
3. **机器可查优于口头规则**：`patches/check_no_inline_comment_after_or.py` 扫「以 `||` 结尾的行的下一行是否为注释」，本次对三个文件实跑 `OK`。**规则从口头变成可执行**（建议进 `lessons.md`）。
