# 模块 const 扫描墙（`module const scan made no progress`）定位与修法

> 任务来源：owner（全森林 234 源 pass 0 解析相新墙，实测判词 `parser type syntax: module const scan made no progress`）。
> 取证：`.rebuild/s1b_step3/gate/r25_raised.stderr.txt` / `.summary.txt`（抬高内存门的诊断跑：`guard_hits=0`、`forest_parsed_lines=158`、`forest_appended_lines=0`、`rc=2`）。

## 0. 结论（先行）

**这堵墙不是 parser 缺口，也不是判据过严，而是失败源自身的括号不平衡（worktree 未提交改动引入的笔误）。**

- 失败源 = `src/core/tooling/compiler_csg.cheng`（`forest src=158 bytes=2175393`，全仓唯一字节数匹配）。
- 缺陷 = `:33266` 多了一个右括号：`sourceTree.nodeCount))`，该语句只开 1 个 `(` 却闭了 2 个。
- 该文件**全局括号深度 = -1**（HEAD 版本 = 0，见 §3 证据表），所以是 worktree 侧新引入的，不是历史遗留。
- 修法 = 去掉那一个 `)`（`patches/module_const_scan_progress_csg_paren.patch`，1 行）。**parser 的守卫一字不改**——它在这里的行为完全正确（fail-closed）。
- 与已修两件（`s1b_step3l_global_const_block_bindings.patch`、`s1b_step3o_module_const_expr_read.patch`）**不是同根**：本墙与模块 const 的绑定/表达式语义无关，是无关语句上的括号笔误。

## 1. 判词点与完整判据（逐字）

判词产生点：`src/core/lang/parser.cheng:26800-26802`，函数 `parserTypeSyntaxModuleConstCollectInto`（`:26782` 起），主循环 `while cursor < tokenLimit:`（`:26796`）。

```cheng
26796:    while cursor < tokenLimit:
26797:        var lineEnd = ParserValueExprLogicalLineEnd(tree, cursor, tokenLimit)
26798:        lineEnd = ParserValueExprExtendIndentedValueRange(
26799:            tree, cursor, lineEnd, tokenLimit)
26800:        if lineEnd <= cursor:
26801:            err = "parser type syntax: module const scan made no progress"
26802:            return false
```

**判定条件**：不是"扫到的条目数为 0"，也不是"cursor 与上一轮相等"，而是**本轮的 `lineEnd` 没有超过本轮起点的 `cursor`**（`lineEnd <= cursor`）。

**为什么它会成立**（两条链，缺一不可）：

1. `ParserValueExprExtendIndentedValueRange`（`:26408`）只可能返回 `lineLimit`（它的入参，即 `LogicalLineEnd` 的结果）或更后的位置：函数体 `var cursor = lineLimit`，内部所有推进都用 `LogicalLineEnd` 且带 `next <= cursor` 的进度检查（`break` 或 `panic`）。⇒ `lineEnd <= cursor` **只可能来自 `LogicalLineEnd` 本身返回了 `cursor`**。
2. `ParserValueExprLogicalLineEnd`（`:21588`）以**本区间首 token 为深度基准**（`parenDepth`/`bracketDepth`/`braceDepth` 全部从 0 开始），当深度转负时直接返回当前下标：

```cheng
21634:        if parenDepth < 0 || bracketDepth < 0 || braceDepth < 0:
21635:            return cursor
21636:        cursor = cursor + 1
```

⇒ `lineEnd == cursor` ⟺ **游标当前指向的 token 是一个闭括号**（`)`/`]`/`}`），此时深度在第一个 token 上即转负、函数原样返回起点。守卫随即以"扫描无法推进"硬失败。

⇒ 该守卫是**正确且必要**的 fail-closed 检查：它把"源码在当前位置已经无法按逻辑行切分"暴露成硬错误，而不是让扫描器死循环或静默跳过。**本方案一分不动它。**

## 2. 失败源与形态

**源**：`forest src=158 bytes=2175393` = `src/core/tooling/compiler_csg.cheng`（`wc -c` 精确相等，全仓唯一）。

**形态**：与模块级 `const` 的任何写法**无关**。触发点在 `CompilerCsgBuildParserForestAuthorityInto` 内的内存追踪调用（`:33258-33266`）：

```cheng
33258:        parser.ParserMemTraceArenaStage(
33259:            "p0_release_before",
33260:            sourceIndex,
33261:            arenamod.ArenaUsed(sourceTree.arena),
33262:            arenamod.ArenaCapacity(sourceTree.arena),
33263:            langintern.InternPoolLogicalPayloadBytes(sourceTree.internPool),
33264:            langintern.InternPoolCount(sourceTree.internPool),
33265:            sourceTree.tokenCount,
33266:            sourceTree.nodeCount))          ← 多一个 `)`
```

逐行括号深度（注释/字符串已剔除）：`33258` 起为 1（`ParserMemTraceArenaStage(`），`33259-33265` 恒为 1，到 `33266` 连闭两个 ⇒ **1 → 0 → -1**。

## 3. 判定与新根/同根分析

**判定：(c) 的变体 —— "既有潜伏被上游修复暴露"不成立；这是**源码笔误**（新引入的源缺陷），不是 parser 的生产者缺口，也不是判据过严。**

四条独立证据（互相印证，不依赖我的近似词法器单独成立）：

| # | 证据 | 复现方式 |
|---|---|---|
| 1 | 该文件**全局括号深度 = -1**，`min=-1` 首次出现在 `:33266`，其后直到 EOF 恒为 -1 ⇒ 全文件恰好一个多余 `)`，其余部分自平衡 | 注释/字符串感知的逐行括号扫描 |
| 2 | HEAD 版本**全局 = 0、min = 0**（从不转负）⇒ 不是历史遗留，是 worktree 侧新引入 | `git show HEAD:src/core/tooling/compiler_csg.cheng` 后同样扫描 |
| 3 | 该行**位于 worktree 未提交 diff 的新增行内**（`git diff` 输出 `+            sourceTree.nodeCount))`） | `git diff -U2 src/core/tooling/compiler_csg.cheng` |
| 4 | 同族兄弟调用 `p0_release_after`（`:33271-33280`）传 8 个实参、以**单个** `)` 收尾；`ParserMemTraceArenaStage`（`parser.cheng:89-96`）恰好 8 个形参 ⇒ `))` 是笔误 | 直接读源码 |

**与原两件 parser 补丁的关系：新根。**
- `s1b_step3l_global_const_block_bindings.patch`（模块级 const 块绑定）与 `s1b_step3o_module_const_expr_read.patch`（模块级 const 表达式读取）修的是"模块 const 的绑定/表达式读"两条语义路径；
- 本墙的失败语句是内存追踪调用（`ParserMemTraceArenaStage`），里面**没有任何 const**；且扫描在其之前已顺利走过该源的全部 const 行（该源在 158 号之前无失败，前 157 个源全部解析成功）；
- ⇒ 两件旧补丁**不改**，本堵墙也不是它们没修干净。

**为什么现在才暴露**：pass 0 逐源解析，前面 157 个源都过了；该源此前被 768 MiB 内存门先杀掉（`guard_hits=1`），抬高门后才第一次真正走到它的这一行 ⇒ 属"更深一层的独立缺陷"，与上游修复是**并列**关系而非因果。

## 4. 修法与"无关输入逐位不变"

**修法**：`src/core/tooling/compiler_csg.cheng:33266`，`sourceTree.nodeCount))` → `sourceTree.nodeCount)`（一个字符）。

补丁：`patches/module_const_scan_progress_csg_paren.patch`（1 insertion / 1 deletion，只碰这一个文件），冻结副本 `.rebuild/s1b_step3/r9/patchgen/module_const_scan_progress_csg_paren.frozen.patch`。

**为什么无关输入逐位不变**：
- 补丁只改一行里的一个字符，**不动任何 parser 代码**（守卫、`LogicalLineEnd`、扫描器循环全部原样）；
- 修后该文件括号深度回到 **0 且 min = 0**（实测：修前 -1/-1@33266，修后 0/0）；
- 森林其余 233 个源的源文本完全不变 ⇒ 它们的 token 流、逻辑行切分、`typeConstModule*` 表逐位不变；
- 修前该源根本无法完成解析（硬失败），所以**不存在"改前能过、改后变了"的输入**。
- 8 实参 ↔ 8 形参、与兄弟调用同形（§3 证据 4）⇒ 不是"用括号凑平衡"，是恢复作者本意。

## 5. 未测项表

| # | 未测项 | 说明 |
|---|---|---|
| 1 | **未编译、未跑门禁** | 按纪律（编译槽由 owner 调度）；本墙结论全部来自静态读码 + 括号平衡实测 |
| 2 | 修后 `forest_parsed_lines` 是否到 234 | 预期能过（该源是 core 树里唯一的负平衡源），但未实测；若 158 号源之后仍有墙，应以门禁实测为准 |
| 3 | 我的括号扫描器是**近似词法器** | 跳过 `#` 注释、`"…"`/`'…'`/三引号/反引号；结论已用证据 2/3/4 交叉验证，不单靠它 |
| 4 | 森林其余源是否有"开括号不平衡" | 全仓扫描显示 core 树里只有本文件是**负**平衡；正平衡命中集中在 `src/tests/**`（含 `cold_multiline_postfix_unclosed_negative.cheng` 这类负例夹具）或为我近似词法器的伪影，未逐个定案 |
| 5 | `LogicalLineEnd` 的"深度转负即返回 cursor"是否有意 | 从调用点看是有意的错误恢复语义（`ParserValueExprFindTopLevelKind` 等亦容忍不平衡），本轮未改、未测 |

## 6. 需要裁决

1. **接受"修源码笔误"而非"修 parser"** 这一判定与补丁落点（`compiler_csg.cheng:33266`）。
2. 该行位于**未提交 WIP hunk 内**（该文件在 worktree 里是 `M`）：我只出补丁、不碰工作树；合炉前请确认与该 WIP 的持有者不冲突。
3. 可选的判词增强（**不放宽守卫**）：把 `:26800-26802` 的判词加上 token 行/偏移，例如
   `parser type syntax: module const scan made no progress line={…} offset={…}`，
   取值可用 `ParserValueExprTokenLineAt(tree, cursor)` / `ParserValueExprTokenStartAt(tree, cursor)`。
   这样下一次遇到同类不平衡源时能直接指到行，而不是要人去反推扫描器。本轮**未做**（属另一件事，且 `parser.cheng` 是共享文件）。
