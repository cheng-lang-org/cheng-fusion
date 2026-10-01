# arena 容量收紧 与 逐源 `U0` 削减 —— 机制链 / 内存账 / 验证计划

**〔本席机器核对（2026-09-11 深夜，纯静态，未跑编译）〕** 你列的"次不确定：201 列名单是手写枚举，列名漂移只能靠评审"已被机器检消除，三条结果：① `parser.cheng` 的 `ParserValueExprTree` 结构体里 `arenamod.ArenaArrayInt32` 字段**恰好 201 个**；② 补丁里 `tree.<name>` 引用的列名集合与该 201 列**完全相等**（缺失 0 个；多出的两个是 `tree.arena` 与 `tree.lifecycleState`，不是列）；③ `ParserValueExprTreeArenaColumnCensusInto`（记）与 `ParserValueExprTreeArenaColumnCensusApply`（预留）**各 201 列、且顺序逐位相同**（`same set: True` / `same order: True`）—— 这一条最关键：两侧顺序若不一致，长度会被静默地套到错列上，而"覆盖断言只保长度不保语义"。另外核了 pin 的口径分层：`TypedExprTypeArenaLimitsColumnBytes = TypedExprTypeArenaLimitsColumnRows × 4`（`:3747-3749`）是**精确计数**，与你说的一致；残差预算确实只是预算，靠 `pinned capacity overrun` 断言兜底（这一条保留，不当已解决）。


口径：本文所有 file:line 均对**工作树当前内容**（2026-09-11 夜，`git status` 有既有 WIP）逐行 `read` 复核过。
凡标"推算"的数字都给出完整算式；凡未测的项集中在 §6，不得当 0 用。

两个补丁（互不依赖，可分别落树/回退）：

| 补丁 | 文件 | 内容 |
|---|---|---|
| `patches/typearena_pinned_capacity.patch` | `src/core/lang/typed_expr_type_arena.cheng` | TypeArena 缓冲区**一次定容** + 每类型列预留 + fail-closed 容量断言 |
| `patches/tree_arena_column_census.patch` | `src/core/lang/parser.cheng`、`src/core/tooling/compiler_csg.cheng` | pass0 记 201 列实测终值；pass1 逐列按终值预留，消灭 `ArenaArrayInt32Add` 的弃块 |

两个补丁均已通过 `git apply --check`（对当前工作树，逐字）：

```
git apply --check patches/typearena_pinned_capacity.patch        # rc=0
git apply --check patches/tree_arena_column_census.patch         # rc=0
```

**〔2026-09-11 深夜 · 文本 rebase：`typearena_pinned_capacity.patch` 换基线，语义一字不改〕**
`patches/closure8_symbolid_from_index.patch` 落树后，本补丁的原版（对 closure8 落树**前**的工作树所出）在
`:7548` 附近冲突而失效，**旧版作废**。现版本以 **closure8 已落树后的当前工作树**为基重出：

* 新 `sha256 = fc0c3f1364721f5ac704e6b230557fd38562b450873c5fbd20c60d819f07fe4c`（12,533 B，6 hunk）。
* **新增行 194 行，与旧版逐字节相同**（`added lines old=194 new=194 identical=True`，`removed lines` 两版都是 0 行）
  ⇒ 19 列 type-side 预留、残差预算公式、`TypedExprTypeArenaPinnedArenaBytes`、
  `typedExprTypeArenaRequirePinnedCapacity` 及两个挂载点全部原样。（**措辞更正**：本补丁**从未**替换
  `ArenaInitDefault` 的容量，只是在它之后追加 `ArenaReserveCapacity`；`1048576` 是 arena 的出生地板，
  这一点正是 kd_r9i 假阳性的根因，详见 §5"kd_r9i 假阳性"。）
* **上下文行只有 1 行差异**，且只来自 closure8：`typedExprTypeArenaBuildStateInitInto` 新增了
  `declarationSymbolGlobalRoots` 实参，重出时原样保留在上下文里。
* **closure8 对预留列预算无语义影响**（已核，不是推断）：closure8 的 `declarationSymbolGlobalRoots`
  是 `TypedExprTypeDeclarationIndex` / build state 上的 **Cheng `int32[]` 序列，不是 `arenamod.ArenaArrayInt32` 竞技场列**
  （`typed_expr_type_arena.cheng:134`、`:4878`、`:7647`）；`TypedExprTypeArena` 的 arena 列数不变（110 列，
  19 个 type-owned + 3 个载荷列全部在位）；closure8 的新遍历 `typedExprTypeArenaAppendDeclarationSymbolRootsFromTreeInto`
  只对普通 `int32[]` 做 `add`，**零竞技场分配**；`limits.declarationSymbolCount` 语义不变
  （仍为逐源和，只是改从 roots 数组长度读）⇒ 本补丁的 `R = typeSyntaxCount + declarationSymbolCount + 64` 与残差预算**均不需改**。
* 自验：`git apply --check` **exit 0**；`git apply -R --check` 在**未落树的当前树上必然 exit 1**
  （反向检查只能对"已含补丁新侧"的树成立）。真正的反向验证在 scratch 目录做：
  在内存里把本补丁正向施加到当前树文本 → 落到 `/tmp` scratch → `git apply -R --check` **exit 0** →
  `git apply -R` 后与仓库当前文件**逐字节相同**（`518734 B` 两侧）。
  仓库工作树**全程零写入**，scratch 已删除。

**〔2026-09-11 深夜 · `typearena_pinned_capacity.patch` 第 2 版：修正断言谓词（kd_r9i 假阳性）〕**
第九手 `kd_r9h` vs `kd_r9i` 实测 4/4 稳定复现 `pinned capacity overrun phase=append_source
capacity=1048576 pinned=6020`（另 6432 / 7096），已 `git apply -R` 撤回。
**判定 = (b) 断言谓词过严，不是 (a) pin 没装上**；判据②（产物逐字节相同）满足，pin 在未触发断言的路径上中性。
定位、三条证据、量级佐证、修法与"为什么不削弱原意"全部写进 §5"kd_r9i 假阳性"。

* 新 `sha256 = acc9df83fff02e6c341b844869f869d73ed9faac605b7e5e3900aabfcdaa1af3`（15,678 B，7 hunk）。
* **前两版（`3c685b52…`、`fc0c3f13…`）全部作废。**
* 与 `fc0c3f13…` 的对拍：旧版 6 个 hunk 逐字重放成功；**194 行新增中 192 行逐字节保留**，
  被替换的只有 2 行（`if capacity != state.pinnedArenaBytes:` → `if capacity > …`；
  `TypedExprTypeArenaPinnedArenaBytes(` → `TypedExprTypeArenaPinnedCapacity(`），
  另新增 33 行（具名地板常量、`TypedExprTypeArenaPinnedCapacity`、安装校验、谓词理由注释）。
* 自验：`git apply --check` **exit 0**；scratch 反向验证 `git apply -R --check` exit 0、
  `git apply -R` exit 0，与仓库当前文件**逐字节相同**（`520,663 B` 两侧）。

**〔2026-09-11 深夜 · `tree_arena_column_census.patch` 补全（第九手编译失败的修复）〕**
第九手报"r9e 列普查补丁漏更新 `CompilerCsgBuildParserForestAuthorityInto` 调用点 ⇒ 编译失败"，已 `git apply -R` 撤回。
**根因核实（不是他说的那一处，但确实是我漏的）**：我给
`ParserValueExprReadTreeFromTextReserved` / `ParserValueExprReadMigrationSourceTreeFromTextReserved`
加了第 3 个形参 `arenaColumnCensus`，却只更新了 **pass 1** 的两个读树调用点；**pass 0** 的两个读树调用点
（就在 `CompilerCsgBuildParserForestAuthorityInto` 内）仍按旧元数调用 ⇒ 元数不匹配。
`CompilerCsgBuildParserForestAuthorityInto` 自身的调用点在旧补丁里**是有**的（hunk7），那处没漏。
**旧版作废**；新版 `sha256 = 655c68561133e708024fb6c717e868e1298cf44f9e96d94e2308eb4598b85227`（88,477 B，15 hunk）。

补全方式与自验（纯文本，未编译）：

* 旧版 13 个 hunk 的**旧侧逐字命中当前工作树**（每 hunk `match=1`），其**新增行 1,336 行在新版中逐字节保留**
  （`old ⊆ new: True`，`only-in-old = 0`）。
* 本次只**新增 8 行**（4 行注释 + 2×2 行调用实参），另有 2 行旧调用行被替换：
  `parserInputText, sourceArenaReserve, sourceTree, err)` → `parserInputText, sourceArenaReserve, noColumnCensus,`
  `sourceTree, err)`。全文**无其它删除**。
* `git apply --check` **exit 0**；反向验证在 `/tmp` scratch 做（工作树零写入）：
  `git apply -R --check` exit 0、`git apply -R` exit 0，两个文件与仓库当前内容**逐字节相同**
  （`parser.cheng` 1,736,003 B、`compiler_csg.cheng` 2,157,014 B）。

### ★ 本补丁涉及的全部调用点清单（第九手落树后若仍报编译错，按此表逐行对）

**A. `parserValueExprReadTreeFromTextMode`（定义 1 + 调用 8，全部 6 实参）**
形参序列：`text: str, migrationSourceSyntax: bool, arenaReserveBytes: int32, arenaColumnCensus: int32[], tree: var ParserValueExprTree, err: var str`

| # | patched 行 | 所在函数 | 实参序列 |
|---|---|---|---|
| A1 | `parser.cheng:28377` | `parserValueExprReadTreeFromTextMode`（**定义**） | 见上 |
| A2 | `parser.cheng:28568` | `ParserValueExprReadTreeFromText` | `text, false, 0, noColumnCensus, tree, err` |
| A3 | `parser.cheng:28577` | `ParserValueExprReadMigrationSourceTreeFromText` | `text, true, 0, noColumnCensus, tree, err` |
| A4 | `parser.cheng:28587` | `ParserValueExprReadTreeFromTextReserved` | `text, false, arenaReserveBytes, arenaColumnCensus, tree, err` |
| A5 | `parser.cheng:28597` | `ParserValueExprReadMigrationSourceTreeFromTextReserved` | `text, true, arenaReserveBytes, arenaColumnCensus, tree, err` |
| A6 | `parser.cheng:37712` | `ParserApplyNormalizedFunctionAnnotationsInto` | `text, migrationSourceSyntax, 0, noColumnCensus, tree, err` |
| A7 | `parser.cheng:38326` | `ParserNormalizedImportcTargetColumnsInto` | `text, migrationSourceSyntax, 0, noColumnCensus, tree, err` |
| A8 | `parser.cheng:38585` | `ParserReadNormalizedFfiHandleContracts` | `text, false, 0, noColumnCensus, tree, err` |

**B. `ParserValueExprReadTreeFromTextReserved`（定义 1 + 调用 2）**
形参序列：`text: str, arenaReserveBytes: int32, arenaColumnCensus: int32[], tree: var ParserValueExprTree, err: var str`

| # | patched 行 | 所在函数 | 传的 census | 角色 |
|---|---|---|---|---|
| B1 | `parser.cheng:28581` | `ParserValueExprReadTreeFromTextReserved`（**定义**） | — | — |
| B2 | `compiler_csg.cheng:33184` | `CompilerCsgBuildParserForestAuthorityInto` | `noColumnCensus`（**空**） | **pass 0 测量相** |
| B3 | `compiler_csg.cheng:35759` | `CompilerCsgStreamTypeArenaFromDeclarationIndexInto` | `sourceColumnCensus` | **pass 1 应用相** |

**C. `ParserValueExprReadMigrationSourceTreeFromTextReserved`（定义 1 + 调用 2）**
形参序列同 B。

| # | patched 行 | 所在函数 | 传的 census | 角色 |
|---|---|---|---|---|
| C1 | `parser.cheng:28591` | `ParserValueExprReadMigrationSourceTreeFromTextReserved`（**定义**） | — | — |
| C2 | `compiler_csg.cheng:33180` | `CompilerCsgBuildParserForestAuthorityInto` | `noColumnCensus`（**空**） | **pass 0 测量相** |
| C3 | `compiler_csg.cheng:35755` | `CompilerCsgStreamTypeArenaFromDeclarationIndexInto` | `sourceColumnCensus` | **pass 1 应用相** |

**D. `CompilerCsgBuildParserForestAuthorityInto`（定义 1 + 调用 1，均 10 实参）**
形参序列：`reusableTree: var parser.ParserValueExprTree, reuseTree: bool, sourceSnapshots: var CompilerCsgSourceText[], sourceSnapshotIndex: var CompilerCsgSourcePathIndex, sourcePaths: var str[], profiles: var parser.NormalizedExprCallProfile[], declarationIndex: var typearena.TypedExprTypeDeclarationIndex, sourceArenaBytesOut: var int32[], sourceColumnCensusOut: var int32[], err: var str`

| # | patched 行 | 所在函数 | 第 9 实参 |
|---|---|---|---|
| D1 | `compiler_csg.cheng:33078` | `CompilerCsgBuildParserForestAuthorityInto`（**定义**） | `sourceColumnCensusOut: var int32[]` |
| D2 | `compiler_csg.cheng:39163` | `compilerCsgBuildConsumeWithOverridesCoreInto` | `work.typeArenaForestSourceColumnCensus` |

**E. 生产/消费对（同一补丁内的两端，缺一即静默失效）**

| 端 | patched 行 | 调用 | 说明 |
|---|---|---|---|
| 生产 | `compiler_csg.cheng:33201`（pass 0 循环内；该源的 `ParserValueExprTreeRelease` 在 `:33227`，所以此时树仍驻留） | `parser.ParserValueExprTreeArenaColumnCensusInto(sourceTree, sourceColumnCensusOut)` | 在 `ParserValueExprTreeRelease(sourceTree)` **之前**读 201 列终长 |
| 消费 | `parser.cheng:28399`（`parserValueExprReadTreeFromTextMode` 内） | `ParserValueExprTreeArenaColumnCensusApply(tree, arenaColumnCensus, 0, err)` | 在 `ParserValueExprAppendDeclarationLexicalScope` **之前**、任何列被写之前 |
| 承载 | `compiler_csg.cheng:1487` | `typeArenaForestSourceColumnCensus: int32[]`（`CompilerCsgWork` 字段） | 扁平数组，`sourceIndex × 201 + j` |

**F. 仓库内**不存在其它调用点（`grep -rn --include=*.cheng` 排除 `.rebuild`/`node_modules` 后，
`ReadTreeFromTextReserved` / `ReadMigrationSourceTreeFromTextReserved` 仅命中上表 B1/B2/B3 + C1/C2/C3）。
`ParserValueExprReadTreeFromText`（3 实参，无 reserve）与 `ParserValueExprReadMigrationSourceTreeFromText`（3 实参）
**不在本补丁面内**，签名未改，外部调用点一个都不用动：`compiler_parser_receipt.cheng:3997`/`:4000`、
`compiler_csg.cheng:33285`/`:33288`、`backend_driver_dispatch_min.cheng:1441`、`driver_safe_contract.cheng:171`、
`parser.cheng:35024`/`:35029`（patched 行号）、以及 `src/tests/typed_expr_type_arena_smoke.cheng`
的 12 处断言（`:36`/`:238`/`:264`/`:378`/`:431`/`:521`/`:544`/`:567`/`:692`/`:835`/`:842`/`:870`/`:982`/`:1009`）。

---

## 1. 结论先行

1. **容量 `115,507,584` 不是"算出来的容量"，是 doubling 的产物，且已逐字节复算命中。** 现行容量链是
   `1,048,576 → 14,438,448 → 28,876,896 → 57,753,792 → 115,507,584`（4 次 `cheng_realloc`，
   `= 2 × 57,753,792`）。**`115,507,584 = 32 × tokenCount`（tokenCount=3,609,612）**，是巧合但不是偶然：
   doubing 恰好在"4 条 token 列铺满、第 5 条（`typeSyntaxTypeIds`）落地"那一次触发。见 §2.2。
2. **真正的代价不是"容量比用量大 42 MiB"，而是那 4 次 `cheng_realloc` 的整块拷贝。**
   mmap 档（≥256 KiB）的 `cheng_realloc` 是 `malloc + memcpy(min(oldSize,newSize)) + release`
   （`src/core/runtime/program_support_backend.cheng:6248-6259`），4 次共拷 **`102,117,712 B`**（精确值，见 §3.1）。
   同窗口在该点位的实测增量是 `r8s1 633,422,856 → r8s2 728,089,680`（`Δ=94,666,824 B`）。
   **⇒ 补丁 1 把这条链压成 1 次 `1,048,576 B` 拷贝，期望省 ≈ 93.6 MB（上限 101.07 MB）。**
   这比 `deterministic_model_derivation.md` §8.4-0 记的"可达收益 23.6 MB / 上限口径 32 MB"大一个量级，
   因为那里的口径是"capacity 115.5 → 83.5"，而这里定位到的是 copy churn。
3. **`U0` 的来源可精确拆解：`tree.arena` 只被一个原语使用——`ArenaArrayInt32Add`，且恰好覆盖 201 个 `ArenaArrayInt32` 列**
   （`parser.cheng` 里 `ArenaAllocBytes` / `ArenaAllocZero` / `ArenaArrayU8Add` 调用点 **0 个**；201 列全部是 Add 目标，
   无遗漏列、无多出列，见 §4.2 的机器核对）。⇒ **`U0 = Σ_c 4·(2^(k_c+1) − 8)`，弃块 = `U0/2 − 16·C`，
   与"活数据长度分布"无关。**
4. **削得动，而且省量可证、不需要先做那条"判决性测量"。** 修法 = pass1 按 pass0 实测的**逐列终值**预留，
   `src=134` 处省 `≥ 140,599,840/2 − 16×201 = 70,296,704 B`（67.0 MiB），
   把 §8.6-4 的 `845,867,256 B` 下界压到 `775,570,552 B`，门内余量 **28.4 MiB**。
   `deterministic_model_derivation.md:543` 说"未测前不得声称该杠杆的收益"——那个 caveat 由本推导解除：
   收益是弃块的**恒等式**，不是比值假设。
5. **容量收紧后的越界路径是"静默增长"，不是硬失败、也不是越界写。** 见 §5。补丁 1 为此附带 fail-closed 断言
   （`typedExprTypeArenaRequirePinnedCapacity`），判词 `typed expr type arena: pinned capacity overrun phase=… capacity=… pinned=…`。

---

## 2. 机制链：容量从哪来

### 2.1 现行定义处（唯一权威）

| 环节 | file:line | 事实 |
|---|---|---|
| 缓冲区初值 | `src/core/lang/typed_expr_type_arena.cheng:7542` | `value.arena = arenamod.ArenaInitDefault(1048576)` |
| 62 列预留 | `typed_expr_type_arena.cheng:7554` | `typedExprTypeArenaReserveColumns(value, limits)` |
| 预留块本体 | `typed_expr_type_arena.cheng:3872-4040` | 逐列 `typedExprTypeArenaReserveColumn(value.arena, <count>, "<name>")` |
| 单列预留 | `typed_expr_type_arena.cheng:3852-3862` | → `arenamod.ArenaArrayInt32ReserveEmpty(arena, out, capacity)` |
| 预留原语 | `src/core/runtime/arena.cheng:316-334` | `ArenaArrayInt32ReserveEmpty` → `ArenaAllocBytesAligned(arena, cap*4, 4)` |
| **容量增长点** | `src/core/runtime/arena.cheng:230-242` | `if nextUsed > arena.capacityBytes:` → `growCap = capacityBytes*2`；`if nextUsed > growCap: growCap = nextUsed` |
| 容量常量 | 无 | **全仓不存在容量常量**：`grep -rn "115507584" src/` 零命中 ⇒ 容量是运行期 doubling 的产物 |
| 列数口径 | `typed_expr_type_arena.cheng:3731-3744` | `TypedExprTypeArenaLimitsColumnRows`：`4·token + 20·typeSyntax + 1·child + 5·enumVariant + 6·declSymbol + 5·function + 2·source + 3·bracketArg + 14·genericSymbol + 2·genericSymbolChild` |
| 字节口径 | `typed_expr_type_arena.cheng:3747-3749` | `ColumnRows × 4` |
| limits 来源（流式） | `typed_expr_type_arena.cheng:3797-3847` | `TypedExprTypeArenaLimitsFromIndexInto`：**从 sealed 声明索引逐源累加**，含跨源累计 |
| limits 来源（全林） | `typed_expr_type_arena.cheng:3758-3782` | `...FromTreeInto`：从合并树取同一批标量 |
| 调用点 | `src/core/tooling/compiler_csg.cheng:33220` | pass0 末 `TypedExprTypeArenaLimitsFromIndexInto(declarationIndex, columnLimits, err)` |

**计数口径的三个要点（逐条核过）**：

* **含跨源累计**：`typedExprTypeArenaLimitsFromIndexInto` 在 `:3818` 对 `0..<index.producerSourceCount` 累加
  `*CountBySource`（`:3689-3697` 在 pass0 逐源写入）⇒ 234 源的量是**全闭包和**，不是单源。
* **不含 `AppendFrom` 增量**：`ArenaArrayInt32Add` 是这 62 列的唯一填充原语；`ParserValueExprTreeAppendFromImpl`
  是**parser 树**的并林路径，与 TypeArena 的 62 列无关。TypeArena 侧无 `AppendFrom`。
* **不含 TypeId 侧 22 列**：预留块只覆盖由 limits 命名的列；`typeCount` 侧的 19 列 + 3 个载荷列
  （`typeKinds … originProducerSourceIndexes`、`childTypeIds`/`childNameIds`/`traitPremiseTypeIds`）
  **不在预留块内**，走 `typedExprTypeArenaIntern` 的 `ArenaArrayInt32Add`（`:1179-1255`，逐列 `Add`）⇒ 仍是 doubling。
  实测 `used − column_bytes = 71,035,484 − 71,033,660 = 1,824 B` 就是它们在 `typeCount=15` 时的首块（≈23 列 × 64 B + 对齐）。

### 2.2 `115,507,584` 的逐字节复算（**命中**）

r8/fix2 实测：`tokenCount=3,609,612`、`typeSyntaxCount=157,853`、`columnBytes=71,033,660`。
记 `T = 4×3,609,612 = 14,438,448`（每条 token 列字节数）、`S = 4×157,853 = 631,412`。
预留块前 5 条：`tokenProducerSourceIndexes / tokenKinds / tokenSpanStarts / tokenSpanEnds`（各 T），
第 5 条 `typeSyntaxTypeIds`（S）。代入 `arena.cheng:230-242`：

| # | 分配 | `nextUsed` | 旧 cap | `growCap = max(2·cap, nextUsed)` | 新 cap | `cheng_realloc` 拷贝 `min(old,new)` |
|---|---|---|---|---|---|---|
| 0 | — | 0 | 1,048,576 | — | 1,048,576 | — |
| 1 | T | 14,438,448 | 1,048,576 | max(2,097,152, 14,438,448) | **14,438,448** | 1,048,576 |
| 2 | T | 28,876,896 | 14,438,448 | max(28,876,896, 28,876,896) | **28,876,896** | 14,438,448 |
| 3 | T | 43,315,344 | 28,876,896 | max(57,753,792, 43,315,344) | **57,753,792** | 28,876,896 |
| 4 | T | 57,753,792 | 57,753,792 | 不触发 | 57,753,792 | 0 |
| 5 | S | 58,385,204 | 57,753,792 | max(115,507,584, 58,385,204) | **115,507,584** | 57,753,792 |
| 6+ | 其余 57 列 | ≤ 71,033,660 | 115,507,584 | 不触发 | 115,507,584 | 0 |

⇒ **容量恰为 `115,507,584`，与实测逐字节相同**；总拷贝 `= 1,048,576 + 14,438,448 + 28,876,896 + 57,753,792 = 102,117,712 B`。
同时 `115,507,584 = 32 × tokenCount` 的巧合得到解释。

### 2.3 上游文档声称的"`typeCount` 可证上界"——**核清后判定：不成立**

`deterministic_model_derivation.md:496` 声称 `typeCount ≤ typeSyntaxCount + 种子数`，据此把容量钉到 ≈83.5 MB。
逐步核 `typedExprTypeArenaIntern(` 的调用点（`grep -rn` 共 **15 行 = 1 处定义 `:1025` + 14 处调用**，全部在
`typed_expr_type_arena.cheng` 内，无对外包装）：

| 调用点 | 所在函数 | 每个 TypeSyntax 行至多一次？ |
|---|---|---|
| `:1426` | `typedExprTypeArenaSeedSemanticScalarRows`（`:1414`） | 常数轮（实测 `type_count=15`） |
| `:1654`、`:1704` | `typedExprTypeArenaResolveNominal`（`:1631`） | ✅ 由 `InternSyntaxRec` 每行调一次 |
| `:6964/6974/6991/7014/7081/7107/7125/7137/7148`（9 处） | `typedExprTypeArenaInternSyntaxRec`（`:6874`） | ✅ `while` 每轮 `typeSyntaxNodeIndex` 严格 +1 |
| `:5576`、`:5683` | `typedExprTypeArenaSpecializeTypeInto`（`:5418`） | ❌ **不成立** |

另两条生产路径也不在"每 TypeSyntax 行一行"里：
`typedExprTypeArenaReserveAggregate`（`:1260`，经 `:6825` `ReserveAggregatesRec` 调）为每个聚合声明符号建一行；
`typedExprTypeArenaSpecializePendingRec`（`:7351`，在 **Seal 相**、`:7689` 调用）对 `pending.typeIds` 每一行
（`:7098` 写入）跑 `SpecializeTypeInto`，而 `SpecializeTypeInto` 内部再 `Intern` **新的 `TypedExprStructuralTypeApply`**
（`:5576`），且 `memo` 是**每次调用新建**（`:7387-7392`）而非全局 ⇒ **一个 pending 行可产生多于一个 TypeSyntax 行之外的新类型**。

⇒ **`typeCount ≤ typeSyntaxCount + 种子` 不可证**；`declarationSymbolCount` 那一项可证（≤ limits 字段），
泛型特化那一项不可证。**`deterministic_model_derivation.md:496` 的量级估算（19×157,859×4 ≈ 12.0 MB ⇒ 容量 ≈83.5 MB）
因此不能按"可证"引用。**

**补丁 1 的处理方式：不把这个上界当承重墙。** 预留取
`R = typeSyntaxCount + declarationSymbolCount + 64`（前两项都有出处），特化行归入"残差预算"，
**并且用 fail-closed 断言兜底**（§5）。预算越界 = 响亮硬失败，而不是静默 2× 膨胀。

---

## 3. 内存账（补丁 1）

### 3.1 省量：`cheng_realloc` 拷贝链

**公式**（全部回源，非推算）：

```
拷贝总量 = Σ_steps min(oldSize, newSize)
        = 1,048,576 + 14,438,448 + 28,876,896 + 57,753,792 = 102,117,712 B     (精确)
```

依据：`src/core/runtime/program_support_backend.cheng:6248-6259`（mmap 档分支）
`cheng_malloc_locked(size)` → `cheng_bytes_copy(freshM, p, min(oldSize,size))` → `cheng_mem_release_locked(p)`；
`:6086-6093` 定 ≥256 KiB 走 `c_mmap_anon`。

| 量 | 修前 | 修后 | 差 |
|---|---|---|---|
| `cheng_realloc` 次数（预留块内） | 4 | 0 | — |
| 拷贝字节 | `102,117,712` | `1,048,576`（定容那一次，从初值 1 MiB 起） | **`101,069,136 B`（上限）** |
| 同窗口该点位实测增量（`r8s1→r8s2`） | `94,666,824` | 预期 ≈ `1.0 MB` 量级（未测） | **期望 ≈ `93.6 MB`** |
| 容量 | `115,507,584` | `94,391,220`（推算，见下） | `−21,116,364 B` |

**容量推算**（`fix2` 那份 limits 代入补丁公式）：
`R = 157,853 + 1,314 + 64 = 159,231`；
`typeSide = (159,231×19 + 58,648×3 + 159,231×3) × 4 = 3,679,026 × 4 = 14,716,104 B`；
`residual = (157,853×12 + 58,648×4 + 1,314×24) × 4 = 2,160,364 × 4 = 8,641,456 B`；
`pin = 71,033,660 + 14,716,104 + 8,641,456 = 94,391,220 B`（90.0 MiB）。
**误差界**：`columnBytes` 与 `typeSide` 是精确计数；`residual` 是**预算**（§2.3 说明为什么它不能是精确计数），
预算内的容量是"已映射未触碰"，按 `program_support_backend.cheng:6106-6108`（"未触页不占 RSS"）**不计入足迹**。
⇒ **容量数字的误差不转化为 RSS 误差**，真正的误差只落在"预算够不够"上，由 §5 的断言兜底。

### 3.2 不重复计算的量

* §8.4-0 把收益记成"capacity 115.5 − 83.5 ≈ 32 MB"是**容量口径**，本文改成**拷贝口径**（`102.1 MB → 1.05 MB`）；
  两者不叠加，只取其一。若验收实测只认到 32 MB，说明 `cheng_realloc` 的旧块被 `munmap` 真归还、
  拷贝 churn 未驻留——**届时以 §5 的实测读数为准，不得两处相加**。
* 补丁 1 **不改变** pass0 峰值（TypeArena 在 pass0 期间尚未分配），也不改变 `columnBytes` 本身。

---

## 4. 机制链 + 内存账（补丁 2，逐源 `U0`）

### 4.1 `U0` 的身份

`U0(k) = work.typeArenaForestSourceArenaBytes[k]`，写入点 `compiler_csg.cheng:33178-33180`：
`let sourceArenaUsed = Int32(arenamod.ArenaUsed(sourceTree.arena))`，取自 **pass0 的单源树**，
而 pass0 的 `sourceArenaReserve = 0`（`compiler_csg.cheng:33154`）⇒ **pass0 的解析没有任何预留**。
循环内 pass1（`compiler_csg.cheng:35693-35706`）用 `U0(k)+65536` 做 `ArenaReserveCapacity`，
**只定缓冲区，不定列**。

### 4.2 `U0` 的构成（机器核对，非推测）

1. `tree.arena` 只由一个原语写：`ArenaArrayInt32Add`。逐文件核对：
   `grep -n "ArenaAllocBytes\|ArenaArrayU8Add\|ArenaAllocZero\|ArenaAllocBytesAligned" src/core/lang/parser.cheng` → **0 命中**。
2. `ParserValueExprTree`（`parser.cheng:568-913`）共 **258 字段，其中 201 个是 `arenamod.ArenaArrayInt32`**；
   机器核对：**201 列全部是 `ArenaArrayInt32Add` 的目标，且没有任何 Add 目标落在 201 列之外**（§4.4 脚本）。
3. ⇒ `U0 = Σ_c 4·(2^(k_c+1) − 8)`，`c` 遍历"至少分配过一次"的列，`2^(k_c)` 是该列最后一块的容量。

**逐列块结构**（`arena.cheng:373-397`）：`NewCap = 8`；每次 grow `newCap = capacity*2`，
`ArenaAllocBytesAligned(arena, newCap*4, 4)` 在 bump 顶开新块，**旧块原地留下、永不回收**。

**⇒ 每一列（终长 `L_c`、最后一块 `2^k_c`）的账（精确恒等式）**：

```
used_c        = 4·(2^(k_c+1) − 8)          # arena 里为这一列占掉的字节
final_block_c = 4·2^k_c
abandoned_c   = 4·(2^k_c − 8) = used_c/2 − 16     # 弃块
live_c        = 4·L_c      ≤ final_block_c
```

* **弃块 `abandoned_c` 在驻留上是实的**：一块只有在写满 `capacity` 之后才会触发下一次 grow ⇒ 旧块每格都写过。
* **最后一块的尾巴 `2^k_c − L_c` 不驻留**：mmap 页由内核零填充、未触碰不计费（`program_support_backend.cheng:6106-6108`）。
  这解释了 `T(src=134)=106,430,512 < U0=140,599,840`。

**⇒ `src=134` 的账**：

```
U0(134) = 140,599,840 B
弃块总量 = U0/2 − 16·C   (C = 至少分配过一次的列数 ≤ 201)
         ≥ 140,599,840/2 − 16×201 = 70,299,920 − 3,216 = 70,296,704 B = 67.04 MiB   (可证下界)
修后 pass1 该源 arena = live 部分（明细未测，见 §6）
削减区间 = [U0/2 − 16C , 3U0/4 + 8C) = [70,296,704 , 105,451,488) B
```

**修法（算法/数据结构层，不是调参）**：pass0 解析结束时把 201 列的**实测终长**记进
`work.typeArenaForestSourceColumnCensus`（每源 201 个 int32，234 源共 188 KB）；
pass1 在 `parser.cheng:27126` 之后、**任何列被写之前**，对 201 列逐一
`ArenaArrayInt32ReserveEmpty(tree.arena, tree.<col>, census[i])`。
此后 `ArenaArrayInt32Add` 的 grow 分支（`arena.cheng:380`）永不进入 ⇒ 弃块归零。

**为什么"逐列终长"是实测而不是启发式**：pass0 与 pass1 解析的是**同一份 `parserInputText`**
（都由 `ParserRewriteMultilineStringSourceTextWithCoordinateMap` 从同一 `sourceText` 得到）、
同一 `migrationSourceSyntax` 标志、同一 parser 代码；`arenaReserveBytes` 只影响缓冲区容量，不影响任何列的 `len`。
短记的后果不是崩溃而是"该列重新走 grow"（=退回今天的开销），并且
`ArenaUsed(tree.arena)` 会超过调用方预留的 `U0(k)+65536` —— 这是可观测的（§5）。

**对门内下界的修正**（沿用 §8.6 的同窗口算术，仅替换 `U0`）：

```
修前下界（§8.6-4）: 845,867,256 B  ⇒ 超门 40,560,888 B (38.7 MiB)
修后下界（本补丁）: 845,867,256 − 70,296,704 = 775,570,552 B
                 ⇒ 余量 805,306,368 − 775,570,552 = 29,735,816 B (28.36 MiB)
```

### 4.3 补丁 2 的边界（**必须写进判词**）

* **只削 pass1（消费循环）**。pass0 的逐源瞬时（`src=134` 的 `+106,430,512`）**不动**——
  pass0 解析前没有"该源各列终长"可用，这是先有鸡还是先有蛋，**不是本补丁能解的**。
  要削 pass0 瞬时必须另找先验计数（例如把 lex 拆成"先计数后落列"），**本轮不做，也不声称**。
* 201 列名单是**手写枚举**（`ParserValueExprTreeArenaColumnCount = 201`），
  与 `parser.cheng:642-913` 的 `ArenaArrayInt32` 字段表一一对应。加列而不同步会**静默少预留一列**
  （退化为今天的 doubling，不是错误）——因此 pass0 侧的覆盖断言是
  `census.len == sources × 201`（`compiler_csg.cheng` 的 per-source measurement postcondition），
  只保长度不保语义；列名漂移只能靠代码评审。

### 4.4 核对脚本（可复现）

```bash
# 1) tree.arena 没有任何非列分配
grep -cE "ArenaAllocBytes|ArenaArrayU8Add|ArenaAllocZero|ArenaAllocBytesAligned" src/core/lang/parser.cheng   # → 0

# 2) ParserValueExprTree（parser.cheng:568-913）的 ArenaArrayInt32 列数 = 201
awk 'NR>=569 && NR<=913' src/core/lang/parser.cheng | grep -c ": arenamod.ArenaArrayInt32$"   # → 201

# 3) 201 列全部是 ArenaArrayInt32Add 的目标，且无 201 列之外的 Add 目标
#    （用 Python 对每个 Add 调用点取第一实参 `tree.<name>` 后与列表求差；差集为空）
```

---

## 5. 特别核实：容量不足时是硬失败还是静默？

**判词：静默增长——既不是 panic，也不是越界写，但也不是"静默降级"到一个错误结果；它是"静默地把容量翻倍"。**

逐跳回源（这是本任务要求的那一条路径）：

| 跳 | file:line | 行为 |
|---|---|---|
| 列追加 | `src/core/runtime/arena.cheng:373-397` | `if arr.len >= arr.capacity:` → `newCap = capacity*2` → `ArenaAllocBytesAligned(arena, newCap*4, 4)` → 拷贝 → **旧块废弃**。**无边界检查、无返回失败、无 panic** |
| 列写入 | `arena.cheng:395-397` | `arenaStoreU32(arena, arr.offset + arr.len*4, v)` —— 写的是**本次分配块内**的槽位，不越界 |
| 缓冲区增长 | `arena.cheng:230-243` | `nextUsed > capacityBytes` → `growCap = max(capacityBytes*2, nextUsed)` → `cheng_realloc`；**只有分配失败才 `panic("arena: grow allocation failed")`** |
| 硬失败路径（**唯一**） | `arena.cheng:336-351` | `ArenaArrayInt32AddReserved` 在 `arr.len >= arr.capacity` 时 `panic("arena array: reserved capacity exhausted")` |
| 该硬失败路径是否被用到？ | `grep -rn "AddReserved" src/` | **typed_expr_type_arena.cheng / parser.cheng 均 0 命中** ⇒ 这条路径对本文两条杠杆**完全没接线** |

**⇒ 若 used 超过容量：容量涨到 `max(2·cap, nextUsed)`，不 panic、不越界。**
后果是：把"容量不足"伪装成**它本来要修的那个症状**——更大的 footprint 与更慢的编译，逐字节不产生任何新判词。
这正是 §5 要求 fail-closed 断言的理由。

### 补丁 1 附带的 fail-closed 断言（**2026-09-11 深夜修订，见下方"kd_r9i 假阳性"一节**）

```
[T-1 安装校验] 在 pin 施加点（ArenaReserveCapacity 之后立刻）
  installedCapacity = ArenaCapacity(value.arena)
  if installedCapacity != pinnedArenaBytes
     → panic("typed expr type arena: pinned capacity not installed capacity=… pinned=…")

[T-2 越界] typedExprTypeArenaRequirePinnedCapacity(value, state, phase)
  if state.pinnedArenaBytes <= 0   → panic("…: pinned capacity missing phase=…")
  if ArenaCapacity(value.arena) > state.pinnedArenaBytes
                                   → panic("…: pinned capacity overrun phase=… capacity=… pinned=…")
```

* `pinnedArenaBytes` 现在是**有效天花板** = `max(预算值, TypedExprTypeArenaInitialArenaBytes)`，
  由新增的 `TypedExprTypeArenaPinnedCapacity(limits, err)` 计算；`ArenaInitDefault` 的实参也换成同一个具名常量。
* 挂点：`TypedExprTypeArenaAppendSourceFromTreeInto` 尾（`phase=append_source`）、
  `TypedExprTypeArenaSealInto` 尾（`phase=seal`）——每个源的追加与整个 Seal 结束各查一次，O(1)。
* **为什么成立（完备性）**：`capacityBytes` 在 build 期内只经两条路移动——
  `ArenaReserveCapacity`（升到 pinned）与 `ArenaAllocBytesAligned`（`growCap = max(2·capacity, nextUsed)`，
  `arena.cheng:230-242`）。任何列超预留都会让 `capacity ≥ 2·pinned > pinned` ⇒ **严格大于**当且仅当发生过增长。
* **为什么成立（可靠性）**：pin 之前先在 `ArenaInitDefault` 之后一次 `ArenaReserveCapacity`，
  预留块与 TypeId 侧预留的总和由同一个 `TypedExprTypeArenaPinnedArenaBytes(limits)` 算出 ⇒
  这两块**永不**超 pin；只有残差列有理论可能，而那正是断言要抓的。
* **T-1 为什么必要**：T-2 只查"没长过天花板"，若 pin 根本没装上，T-2 就是空转。
  T-1 在**唯一施加点**读回容量，把"装上没装上"变成一次显式断言，而不是从后续读数反推。
* **崩溃语义**：`panic`（let-it-crash），进程立即退出、判词独有可 grep。**不是**返回值错误、**不是**兜底。
* 补丁 2 的 fail-closed 面较弱且**故意如此**：census 短记不会 panic，只会退回 doubling——
  因为它是"少省一点"，不是"算错"。这条差异必须写进判词，不得混为一谈。

### ★ kd_r9i 假阳性：定位、判定与修法（2026-09-11 深夜，本补丁第 2 版）

**实测（第九手，`kd_r9h` vs `kd_r9i`，同一 `--out`，4/4 稳定复现）**：
```
ordinary_zero_exit_fixture   A rc=0  B rc=1  "pinned capacity overrun phase=append_source capacity=1048576 pinned=6020"
call_fixture                 A rc=0  B rc=1  同判词 capacity=1048576 pinned=6432
cold_nested_fmt_interpolation_smoke A rc=0 B rc=1 同判词 capacity=1048576 pinned=7096
driver_identity_probe        r9h rc=0 sha=7f071c49… / r9i rc=1 NO_ARTIFACT
```
判据②（产物逐字节相同）**满足**：三件在 B 侧写出产物且 sha 与 A 侧相同 ⇒ pin 在未触发断言的路径上中性。
违反的是判据①。

**判定：是 (b) 断言谓词过严，不是 (a) pin 没装上。** 三条证据（全部可由实测判词本身读出，无需编译）：

1. 判词里 `pinned=6020 > 0`。`state.pinnedArenaBytes` 在本补丁里的**赋值点只有一处**，
   就紧跟在 `ArenaReserveCapacity(value.arena, pinnedArenaBytes)` 之后；而同一函数里有一条
   `if state.pinnedArenaBytes <= 0: panic("…: pinned capacity missing phase=…")` —— 它**没有**触发。
   ⇒ pin 计算与 `ArenaReserveCapacity` 调用**确实执行过**。
2. `capacity=1048576` **恰好**是 `ArenaInitDefault(1048576)` 给 arena 的出生容量（补丁**没有**替换它，
   只是在它之后追加 `ArenaReserveCapacity`——早期文档里"`ArenaInitDefault` 的容量替换"措辞有误，此处更正）。
3. `ArenaReserveCapacity`（`src/core/runtime/arena.cheng:202-203`）在
   `minCapacity <= arena.capacityBytes` 时**直接 return，不碰 `capacityBytes`**。
   6020 ≤ 1,048,576 ⇒ pin 是**合法 no-op**，`capacity` 停在出生地板。
   ⇒ `capacity != pinned` 对**所有预算低于 1 MiB 的源**恒真、恒假阳性。

量级佐证（纯算术，说明 pin 公式确实跑过）：`R = typeSyntaxCount + declarationSymbolCount + 64 ≥ 64`，
`typeSide ≥ 64×19×4 + 64×3×4 = 5,632 B` ⇒ **pin 的绝对下界 ≈ 5.6 KB**；
实测 6,020 / 6,432 / 7,096 全部落在"5,632 + columnBytes + residual"的量级上，与公式一致。
若 pin 根本没安装，`pinnedArenaBytes` 会是 0，判词必是 `pinned capacity missing`（**另一条**判词）。

**修法（本版补丁）**（同时满足"真越界仍响亮失败 / 小源不误杀 / 不改成什么都不查"）：

| 项 | 内容 |
|---|---|
| ① 单一化地板 | 新增 `TypedExprTypeArenaInitialArenaBytes: int32 = 1048576`；`ArenaInitDefault` 改用它 |
| ② 有效天花板 | 新增 `TypedExprTypeArenaPinnedCapacity(limits, err) = max(预算值, 地板)`；`state.pinnedArenaBytes` 存**天花板** |
| ③ 独立安装校验 | 在 pin 施加点读回 `ArenaCapacity` 并要求 `== pinnedArenaBytes`，判词 `pinned capacity not installed`（**新判词**） |
| ④ 越界谓词 | `capacity != pinned` → **`capacity > pinned`**（判词 `pinned capacity overrun` **不变**） |

**为什么这不削弱原意（三条论证）**：

1. **真越界必然被抓**：越界唯一路径是 `ArenaAllocBytesAligned`（`arena.cheng:230-242`），
   它把容量置为 `max(2·capacity, nextUsed) ≥ 2·pinned > pinned` ⇒ 严格 `>` 必然触发。
   在**所有可达状态**上 `capacity ≥ pinned` 成立（容量只经这两条路单调不减），
   所以 `>` 与 `!=` 在"真越界"上完全等价；两者只在"pin 低于地板"这一**良性**状态上分道。
2. **"pin 没装上"没有被放过**：那正是 T-1 的职责，且它在**唯一施加点**上做，比 `!=` 在末端反推更强
   （末端反推无法区分"pin 没装"与"pin 合法 no-op"，这次假阳性就是这两种情形混在一起）。
3. **不做假绿**：两条断言都在，判词各不相同、可 grep；没有任何 "skip if small" 之类的旁路。

**已知盲区（必须写进判词，不得当成 0）**：当预算 < 1 MiB 时，天花板 = 1 MiB，
而 1 MiB 在 `ArenaInitDefault` 时**已经承诺**（无论 pin 与否都占）。此时某列即使超预留，
只要 `used` 仍在 1 MiB 内，容量不增长 ⇒ **T-2 在该区间不触发**。
这是良性的：该区间内越界**不可能把 arena 撑大**（它已经被分配了），
RSS 代价为 0，T-2 要防的"静默 2× 膨胀"在此不存在。
**验收输入（234 源，预算 ≈ 94.4 MB ≫ 1 MiB）不在盲区内**，T-2 对它完全有效。
若要连小源盲区也堵上，可加一条 `ArenaUsed(value.arena) > 预算值` 的紧断言——**本轮不加**：
它等价于"残差预算必须精确覆盖实际用量"，在残差用量未实测前会引入**新的**假阳性风险，
与本次教训同类。此处记为后续项。

---

## 6. 验证计划

### 6.1 落树顺序（**串行**，一次只验一个补丁）

```bash
git apply patches/typearena_pinned_capacity.patch
# 烤驱动（编译槽位空闲时）→ 234 源默认门跑一轮
grep -E "^(r8|csg_mem|compile_progress|GATE_DONE|forest_)" <gate>.summary.txt
```

### 6.2 判据（补丁 1）

| 项 | 通过 | 失败 |
|---|---|---|
| 容量 | 首次分配后 `ArenaCapacity` 稳定于 `≈94,391,220 B`（推算值；**允许 ±residual 预算差**，只要**只出现一次 realloc**） | 出现 `115,507,584` 或任何 2 倍值 ⇒ 定容没生效 |
| `used`（`r8s2` 点位） | `used == 71,035,484 + typeSide 预留`（TypeId 侧预留后 used 会上升到 ≈ `71,033,660 + 14,716,104 = 85,749,764`，**这是预期的**） | `used` 不变 ⇒ 预留块没跑 |
| footprint | `r8s1 → r8s2` 的 Δ 从 `94,666,824` 落到 **≤ 5 MB** | Δ 仍 ≈ 94 MB ⇒ `cheng_realloc` 链没被消除 |
| fail-closed（T-1） | 全程**无** `pinned capacity not installed` | 出现 ⇒ **pin 没装上**（T-2 变空转，必须先修 T-1 才谈其余） |
| fail-closed（T-2） | 全程**无** `pinned capacity overrun` | 出现 ⇒ **arena 真的长过天花板**：`capacity > pinned`，即某列超预留（见 6.5） |
| 小源回归（kd_r9i 复现件） | `ordinary_zero_exit_fixture` / `call_fixture` / `cold_nested_fmt_interpolation_smoke` 三件 **rc=0 且产物 sha 与 r9h 逐字节相同** | 任一 rc≠0 ⇒ 断言仍有假阳性；sha 不同 ⇒ 判据② 破 |
| `forest_appended` | 不回归（补丁 1 不改语义） | 任何 `forest_appended < 234` |
| 产物 | 与打补丁前 **逐字节相同**（`ArenaReserveCapacity` 不改内容） | 有差异 ⇒ 布局泄漏进了产物身份，**必须查** |

### 6.3 判据（补丁 2）

```bash
git apply patches/tree_arena_column_census.patch
```

| 项 | 通过 | 失败 |
|---|---|---|
| `forest_parsed_lines` / `forest_appended_lines` | `234 / 234` | 任一小 234 ⇒ 回归 |
| 逐源循环瞬时 | `src=134` 处相对修前**降 ≥ 70 MB**（对照同窗口读数；期望落到 `≈ live`） | 降幅 < 30 MB ⇒ 预留没生效或 census 全 0 |
| `guard_line` | **空**（零 `rss_limit_exceeded`） | 出现 ⇒ 未达标 |
| `ArenaUsed(tree.arena)` vs pass0 的 `arena=U0` | pass1 的 `ArenaUsed` **必须 < `U0(k)`**（同源同文本 ⇒ 列长相同、无弃块） | 相等 ⇒ census 没被消费 |
| census 覆盖 | 无 `parser forest per-source column census coverage invalid` / `streaming source column census missing` | 出现 ⇒ 覆盖断言按设计生效 |
| 产物 | 与补丁前**逐字节相同** | 有差异 ⇒ 树 arena 布局泄漏进产物，**必须查**（这是本补丁最大的语义风险面） |

### 6.4 联合验收（唯一验收线）

```
kd_* 干净驱动、默认 768 MiB 硬门、234 源闭包：
  要求 forest_appended=234 且全程无 rss_limit_exceeded
```

### 6.5 失败时的第一动作

* `pinned capacity not installed capacity=… pinned=…`：**pin 施加点没生效**。
  先核 `TypedExprTypeArenaInitialArenaBytes` 与 `ArenaReserveCapacity` 的先后顺序，
  以及 `pinnedArenaBytes` 是否真的大于等于出生地板（`arena.cheng:202-203` 的早退分支）。
  这一条**必须先修**，否则 T-2 是空转。
* `pinned capacity overrun phase=seal capacity=<≥2P>`：残差预算不够。
  **不要**去调大常数了事——先在同一轮读 `ArenaUsed(value.arena)` 与 `typeCount`，
  用实测值替换 `TypedExprTypeArenaResidualColumnBytes`，并把该列名加进
  `typedExprTypeArenaReserveTypeSideColumns` 或残差明细里。
* `pinned capacity overrun phase=append_source`：同上，但嫌疑集中在 `member*`/`resolution*` 家族。
* **判词分辨口诀**：`capacity == pinned` 正常；`capacity == 1,048,576 且 pinned 远小于它` 正常
  （预算低于出生地板的源，见 §5 盲区）；只有 `capacity > pinned` 才是越界。
* 补丁 2 若产物不逐字节相同：先撤补丁 2（补丁 1 独立），再定位是哪一列的长度被布局影响。

---

## 7. 风险

1. **容量收太紧会 panic 吗？** 会——但只在**残差预算真的不够**时，判词独有（§5）。pin 本身不会造成 panic：
   `ArenaReserveCapacity` 只在 `cheng_realloc` 返回 nil 时 `panic("arena: reserve allocation failed")`。
2. **会不会把"容量不足"伪装成别的错？** 修前会（伪装成 `rss_limit_exceeded`，零新判词）；
   补丁 1 之后不会（`pinned capacity overrun` 先于门触发）。补丁 2 仍会伪装成 `rss_limit_exceeded`（见 §5 末），
   这是本设计**已知且已声明**的不对称。
3. **`typeCount` 上界不可证**（§2.3）⇒ 预算是预算。落地后必须在同轮读到 `typeCount` 与真实
   `used` 才能把预算换成实测；**在读到之前，`pinnedArenaBytes` 不得写进任何"可证"判词。**
4. **身份面**：`typedExprTypeArenaBuildState` 新增字段 `pinnedArenaBytes` 是**私有 build 结构**；
   `typedExprTypeArenaHashMaterialized`（`:710-735`）只枚举显式列出的标量，
   同文件 `:208-210` 已就同类问题写明"未被枚举的列不扰动 `artifactRaw32`"——
   但这条**只是同族先例，不是本字段的实测**（§8 未测项 3）。
5. **补丁 2 的布局变化**：pass1 树 arena 的偏移全变。所有消费方走 `(arena, arr, i)` 三元组，
   偏移不外泄；但"产物逐字节相同"必须实测（6.3 最后一行），**不得以推理代替**。
6. **每源多一次 201 长度读取 + 201 次 `census` 读取**（225 KB 总拷贝、804 B/源临时序列）——量级可忽略，
   但若 `build_cheng` 对超长函数有上限，`ParserValueExprTreeArenaColumnCensusApply`（201×5 行）需拆分。
7. **不得与 §8.4-0 的 32 MB 相加**（§3.2）。

---

## 8. 未测项（不得当 0 用）

1. **pass1 修后 `ArenaUsed(tree.arena)` 的绝对值**（即 `live`）：本文只证了削减量的下界，没测修后值。
2. **`r8s1 → r8s2` 的实测 Δ 在补丁 1 之后是多少**：期望 ≈1 MB，未测。
3. **`typedExprTypeArenaBuildState.pinnedArenaBytes` 是否真的不进任何身份面**：只做了同族先例推理（风险 4）。
4. **残差预算是否够**：`memberCount` / `resolutionCount` / `nominalDependencyCount` /
   `symbolDependencyCount` / `sccCount` 在 234 源闭包上的真实值**未测**；本文给的是预算，不是界。
5. **pass0 逐源瞬时（`src=134` 的 `+106,430,512`）本轮不动**，其占比（弃块 vs 最后一块尾巴）未测。
6. **C（至少分配过一次的列数）的真实值**：本文取下界时按 `C ≤ 201` 保守取，未测实际值。
7. **两个补丁的产物字节恒等性**：未测（6.2 / 6.3 最后一行）。
