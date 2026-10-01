# 墙二 位点图：`compiler parser receipt: normalized expression parser node missing … surface=if`

- 日期：2026-09-14 ｜ 线：RSI 融合线（**只读**：未改任何源码、未碰 `src/core/**` 与 `.rebuild/b_line/**`、未编译、未取编译槽）
- 方法：只读读码 + 复用内核线**已落盘**的原始件（含内核线自己的 B16 账本自述）；凡非原始件的推断一律标注**未验证**
- 被判判词（c6 原始件逐字）：`compiler parser receipt: normalized expression parser node missing exprIndex=5 kind=1 line=50 surface=if rootNode=-1 originNode=-1 role=0`

**一句话结论**：被判的是 parser 归一化层里一条**裸 `if` 关键字行**（`kind=1`=`NormalizedExprIf`、`detail=IfKeyword`）。它只可能被两条路认领：①`StampConditionFact`（只认领**语句位** if 的 Condition 事件）；②B16 的"同位随绑"（只挂在**有结构化种子**的跨行形上）。**表达式位单行 `let x = if … else …` 两条都不中**（行首是 `let` ⇒ 结构化种子产线直接 `return false`），于是 root/origin 恒 -1、role 恒 0(Invalid) ⇒ receipt 判词。c6 的 `line=50` 在 `import std/os` 闭包里唯一符合该形态的源是 **`src/std/buffer.cheng:50`**（`let take: int32 = if n < avail: n else: avail`）——此为**候选绑定，未验证**（判死法见 §5）。

---

## 1. 判点（file:line + 20 行上下文）

`src/core/tooling/compiler_parser_receipt.cheng:9026-9031`（判词在 **:9030**）：

```cheng
9011:                identity.functionIndex] != -1:
9012:             err = " compiler parser receipt: normalized expression identity index invalid"
9013:             return false
9014:         let functionStart =
9015:             accumulator.normalizedExprParserNodeIds.len
9016:         while exprIndex < layer.exprs.len:
9017:             let expr = layer.exprs[exprIndex]
9018:             if expr.sourcePath != identity.sourcePath ||
9019:                expr.lineNumber > identity.endLineNumber:
9020:                 break
9021:             if expr.lineNumber < identity.signatureLineNumber ||
9022:                expr.endLineNumber < expr.lineNumber ||
9023:                expr.endLineNumber > identity.endLineNumber:
9024:                 err = " compiler parser receipt: normalized expression escapes function identity"
9025:                 return false
9026:             let parserNodeId =
9027:                 parserReceiptNormalizedExprIdentityNode(expr)
9028:             if parserNodeId < 0 ||
9029:                parserNodeId >= layer.valueExprTree.nodeCount:
9030:                 err = Fmt" compiler parser receipt: normalized expression parser node missing exprIndex={exprIndex} kind={parser.NormalizedExprKindCode(expr.kind)} line={expr.lineNumber} surface={expr.surfaceText} rootNode={expr.valueExprRootNodeIndex} originNode={expr.originParserNodeId} role={Int32(expr.valueExprStatementRole)}"
9031:                 return false
```

判定链：`:9026-9029` 用 `parserReceiptNormalizedExprIdentityNode` 算出 `parserNodeId`，越界/负即判死；该函数本体在 `:8924-8932`：

```cheng
8924: fn parserReceiptNormalizedExprIdentityNode(
8925:         expr: parser.NormalizedExpr): int32 =
8926:     # A nested Call shares its enclosing statement root with the direct
8927:     # statement fact, but owns a distinct parser call node.  Receipt identity
8928:     # therefore follows the expression's exact origin first; consumers recover
8929:     # the enclosing statement through the parser parent/root sidecars.
8930:     if expr.originParserNodeId >= 0:
8931:         return expr.originParserNodeId
8932:     return expr.valueExprRootNodeIndex
```

⇒ **判死条件** = `max(originParserNodeId, valueExprRootNodeIndex) < 0`（两者都 -1）**或**其中一个 ≥ `layer.valueExprTree.nodeCount`。本次判词两值均 -1 ⇒ 属于"**完全没人认领**"，不是"越界"。
判词不含 `sourcePath`/`columnNumber`/`detailKind` —— 这是 §5 判死探针要补的三个字段（本判点的 `sourceIndex` 在调用栈里其实已知，见 §5）。

调用面：`parserReceiptObserveNormalizedExprIdentitiesInto`（`:8985-9068`），由 `:9149` 调用，逐源投影（`:8914` 的 `parserReceiptProjectNormalizedExprIdentitiesForSourceInto`）。

---

## 2. 被判的四个量各是什么、谁生产

| 判词字段 | 值 | 语义 | 生产者 / 写点（file:line） |
|---|---|---|---|
| `rootNode` | -1 | `parser.NormalizedExpr.valueExprRootNodeIndex`：`NormalizedExprLayer.valueExprTree` 里的**后序节点 id**（注释 `parser.cheng:980-984`） | 初值 -1：`parser.cheng:3389/3454/3521/3574/3631`（各 Append 族）；**写点仅 8 处**：`:34526`(`BindStatementRootEvent`)、`:34559`(`BindEnclosingStatementRootEvent`)、`:34593`(`StampSidecarRow`)、`:34894`(区间 donor 继承)、`:35265`/`:35355`/`:35401`(结构化段)、`:35442`(`StampConditionFact`) |
| `originNode` | -1 | `originParserNodeId`：**源内 parser Call/SpaceCall 节点 id**（注释 `parser.cheng:974-977`，跨源森林合并时不做偏移） | 仅 `:34508`(`ParserValueExprBindRootCallIdentity`，**只有根节点是 Call/SpaceCall 才写**)、`:34385/34430`、`:34592`(`StampSidecarRow`)、`:34903`(donor 继承)。**`StampConditionFact` 不写 origin** ⇒ "origin=-1 而 root≥0"是健康形；**两者同时 -1 = 无人认领** |
| `role` | 0 | `valueExprStatementRole`；**0 = `ParserValueExprStatementInvalid`**（枚举 `parser.cheng:302-316`，Invalid 是第 0 项） | 与 root 同批写点；Condition=7、BindingInitializer=1、AssignmentRhs=2（`:302-316`）。**role=0 是"未认领"指纹** |
| `exprIndex` | 5 | receipt 侧**跨源合并层** `layer.exprs` 的下标（不是函数内序号、不是行号） | `compiler_parser_receipt.cheng:9002`(声明，跨 identity 持续) / `:9016` / `:9058`(自增)。identity 循环 `:9003-9064`：逐函数身份消费**同 `sourcePath` 且 line ≤ identity.endLineNumber** 的行 |
| `kind` | 1 | `NormalizedExprKindCode(NormalizedExprIf) = 1` | 枚举 `parser.cheng:168-190`；代码表 `:1688-1690` |
| `surface` | `if` | 该行的 `surfaceText`，追加时写死 `"if"` | `parser.cheng:5521-5527` |

**生产者本体（这条行的诞生）**：`ParserAppendSimpleSurfaceExprsLine`（定义 `parser.cheng:5462`）逐物理行扫描标识符，命中 `if` 就追加一行 (kind=`NormalizedExprIf`, detail=`NormalizedExprDetailIfKeyword`, surface=`"if"`)，列号 = `i+1`（1-based，`:5517-5527`）。调用点每个物理行一次：`:35977-35983`（`appendIfExprs=true`）。

---

## 3. 这条行"该被谁认领"以及为什么没人认领

**认领路 A — 语句位 if**：`ParserValueExprStampConditionFact`（`parser.cheng:35420-35451`），由语句根事件分发调用（`:36037-36043` 与 `:36143-36148`），**仅当该行语句根事件 `role == Condition`**；命中后写 root/span/**role=Condition(7)**、**不写 origin**（`:35442-35447`）。
⇒ 语句位 `if c >= '0' …:`（行首即 if）必被认领。

**认领路 B — B15/B16 包含绑定 + 同位随绑**（内核线 2026-09-14 提交 `df54ef4e4`/ `0c11b718d`）：`ParserValueExprBindRangeToContainingStatementEvent`（`:34929-35003`），在 W7 段只对 **`ParserNormalizedExprKindIsSidecarStructured` 为真的事实**（`:33800-33805`：IfStmt/Elif/Else/For/Match/Case/While/Defer/Break/Continue，**不含 kind=1**）在精确 (line,col)+role 查找落空时调用（调用点 `:34709-34727`）；命中包含绑定后，**同位随绑**同 (line,col) 的裸 if 关键字行（`:34980-35002`）。

**缺口（本席读码结论，未编译验证）**：表达式位**单行** `let x = if … : … else: …`
1. **没有结构化种子** —— 结构化种子产线 `parserReadControlStmtSeedRangeMode`（`:6071-6114`）要求 trim 后**行首**是 `if/elif/else/for/while` 关键字；单行时行首是 `let`，`:6092-6114` 全部落空 ⇒ `:6113-6114 return false` ⇒ 该行**不产种子**；⇒ W7 段没有该行的事实 ⇒ **路 B 的"同位随绑"永不触发**（它挂在种子上）。
2. **路 A 也不触发** —— 该行的语句根事件是 `BindingInitializer`（锚在 `let` 行的 `=` token，见内核线账本探针读数 `anchor=(4,23)`、根 span `(5,9)-(8,14)`），不是 Condition。
⇒ 裸 if 行 `-1/-1/0` 一路留到 receipt 定谳。

**两条独立旁证（都来自内核线自己的原始件，非本席推断）**：
- 内核线 B16 账本 `.rebuild/b_line/b16_ledger_append.py:12` 原文：`b16_ctrl1line_let_if_ternary（单行同文，兄弟形：无结构化种子，kind=1 行即首墙）基线与 v4 stderr 逐字节一致（零回归），其 kind=1 单行形森林零出现、留后续线`。
- 账本 `:10` 定性："`kind=1（NormalizedExprIf/DetailIfKeyword）裸 if 关键字行被 kind=12 遮掩（健康形由 StampConditionFact 按 Condition 事件认领，病形无条件事件可认领）`"。

**顺带说明为什么它没在更早的地方被拦**：`ParserValueExprBindNormalizedStructureAnchors`（`:35008-35078`，调用点 `:36203`）只校验 sidecar-structured 种类 ∪ Return ∪ Assign（过滤 `:35018-35022`）⇒ **kind=1 豁免**，所以 "frozen anchor missing" 不会先报。

---

## 4. c6 的 `line=50` 是哪个源（候选，未验证）

- `src/std/os.cheng` 的 `import std/*` 闭包 = **14 源**（本席用 `.rebuild/wall2_probe/closure.py` 从源码解析，无编译）：`os, cmdline, buffer, seqs, system, strings, strformat, times, rawbytes, rawmem_support, result, atomic, crypto/sha256, strutils`；`os.cheng:3 import std/buffer` 是直接导入（`buffer` 确在闭包内）。非 `import std/*` 的源导入 = 0。
- 闭包里**物理第 50 行含 `if`** 的只有 3 个文件（逐字 + `if` 的 1-based 列，`.rebuild/wall2_probe/cols.py`）：

| 文件:行 | 内容 | if 列 | 形态 | 路 A 会不会认领 |
|---|---|---|---|---|
| `src/std/buffer.cheng:50` | `    let take: int32 = if n < avail: n else: avail` | **23** | **表达式位单行 let-if-ternary** | **不会**（无 Condition 事件） |
| `src/std/rawbytes.cheng:50` | `    if c >= '0' && c <= '9':` | 5 | 语句位 | 会（role 应=7） |
| `src/std/strutils.cheng:50` | `    if raw != nil && count > 0:` | 5 | 语句位 | 会（role 应=7） |

- 判词 `role=0` 排除两条语句位 ⇒ **候选只剩 `src/std/buffer.cheng:50`**；且其形态与内核线 b16 单行夹具（`let auditSlotKind = if plan >= 0 && plan < 9: plan else: -1`，if 列 25）**逐字同构**。
- **未验证点（如实登记）**：按"逐行事实计数"推算，buffer.cheng 第 50 行之前大约会产 6–8 行事实，而判词 `exprIndex=5` 意味着它是合并层的第 6 行（入口源 `c6.cheng` 只贡献 1 行 = `return 0` 行）。推算与观测差 1–3 行 ⇒ 本席对"哪些行才产事实"的模型仍有缺项，**不能据此当结论**。§5 的 K2 一行探针直接读 `sourcePath` 即可判死。

---

## 5. 一步即可判死的验证（**只列命令与探针，本席不跑**）

> 共同前提：源必须落 `<root>/src/` 下（放 `.rebuild/` 会先撞 `system link plan: entry module identity unavailable`）；探针工具自带窗口硬前置，非 FREE 直接 `exit 3`（重试壳 `wall_probe_retry.sh` 会连试 8 轮）。探针命令环境变量由 `env` 继承透传（`.rebuild/patchwork/probe_b905b_corpus.sh:15/18/61`），所以下面的 `CHENG_*` 前缀有效。

**K1（零改树，判"墙二在最新驱动上是否还在"）** —— 用 post-B16 驱动 `kd_b1701`（03:28 烤成）跑 c6：
```bash
cd /Users/lbcheng/cheng-lang
PROBE_COMPILER=$PWD/.rebuild/s1b_step3/r9/kd_b1701 \
PROBE_SRCS="$PWD/src/a9_wall_probe/c6.cheng" \
bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/wall_probe_retry.sh
# 判读：stderr 里仍是 …,exprIndex=5 kind=1 line=50 surface=if rootNode=-1 originNode=-1 role=0
#       ⇒ 墙二在 post-B16 驱动上未清（等价的"是否被 B16 覆盖"判据）。
```

**K2（一字段探针，直接判死"哪个文件/哪一列"，最省的一步）** —— 在判点 Fmt（`compiler_parser_receipt.cheng:9030`）末尾追加三个量：
```
source={expr.sourcePath} col={expr.columnNumber} detail={Int32(expr.detailKind)} srcIndex={sourceIndex}
```
（`sourceIndex` 是 `:8914` 投影函数的形参，判点可见，无需新管道。）
- 预测（**未验证**）：`source=…/src/std/buffer.cheng line=50 col=23 detail=1` ⇒ §4 候选坐实、机制=表达式位单行 if 无人认领。
- 若打印的是 `rawbytes.cheng`/`strutils.cheng` ⇒ 推翻本席模型，机制改为"语句位 if 的 Condition 事件未认领该行"（下一层再查 `StampConditionFact` 的行匹配/游标序）。

**K3（零改树，把 `exprIndex` 对齐到源；单独不足以判死文件）** —— 两个现存开关一起开：
```bash
cd /Users/lbcheng/cheng-lang
CHENG_TRACE_PARSE_SOURCE=1 CHENG_PARSER_MEM_TRACE=1 \
PROBE_COMPILER=$PWD/.rebuild/s1b_step3/r9/kd_b1701 \
PROBE_SRCS="$PWD/src/a9_wall_probe/c6.cheng" \
bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/wall_probe_retry.sh
```
- `CHENG_TRACE_PARSE_SOURCE=1`（`parser.cheng:41454-41455`）⇒ 每源一行 `parse_source <path>`，给**源序**；
- `CHENG_PARSER_MEM_TRACE=1`（`parser.cheng:102-115`）⇒ `parser_mem stage=… src_index=… token_count=… node_count=…`，给**每源 src_index 与 node 数**（后者可用于核 `nodeCount` 越界类判词）。
- **注意**：这两个开关都**不打印事实行的 (source,line,col)**，所以只能缩小范围、不能单独判死。

**K4（内核线自带探针开关，用来实证"单行形无结构化种子"）** —— `CHENG_IFSTMT_BIND_PROBE`（探针件 `.rebuild/b_line/b16_probe_ifstmt_bind.patch`，sha `9990cfe167040bb4…`；**已从工程树撤离**，`grep CHENG_IFSTMT_BIND_PROBE src/` = 0；带此探针的驱动 `.rebuild/s1b_step3/r9/kd_b16probe` 在位）：
```bash
cd /Users/lbcheng/cheng-lang
CHENG_IFSTMT_BIND_PROBE=1 \
PROBE_COMPILER=$PWD/.rebuild/s1b_step3/r9/kd_b16probe \
PROBE_SRCS="$PWD/src/a9_wall_probe/c6.cheng" \
bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/wall_probe_retry.sh
# 判读：探针只对 sidecar-structured 事实(kind>=12)打印 b16_ifstmt_probe 行；
#       单行 kind=1 形应当【零输出】（因为它挂在 W7 的 structured 分支 :34665-34669 与 :34709）。
```

**K5（判死"与 import 无关"，可选的补一枚哨兵）** —— 把 buffer.cheng:50 的形态抄成 3 行**无 import** 源（本席**未落盘**，遵守只读；建议落 `src/a9_wall_probe/c7.cheng`）：
```cheng
fn main(): int32 =
    let take: int32 = if 1 < 2: 1 else: 2
    return take - 1
```
命令同 K1，只把 `PROBE_SRCS` 换成 `c7.cheng`。预期（**未验证**）：同样撞 `kind=1 surface=if` ⇒ **墙二与 import 闭包无关**，import 只是把 `buffer.cheng:50` 带进编译单元（这一点内核线自己的单行夹具 A/B 已经实测到：原始件见 §7 第 2、3 条）。

---

## 6. 修法方向（建议，属内核领地；**未验证**）

在 `ParserValueExprBindStatementRoots` 收尾处加一趟**终扫兜底**：凡 `kind == NormalizedExprIf && detailKind == NormalizedExprDetailIfKeyword && valueExprRootNodeIndex < 0` 的裸行，直接复用 `ParserValueExprBindRangeToContainingStatementEvent` 同款 token-walk + "语句根事件 span 唯一包含该行 (line,col)" 绑定（零/多命中维持 -1，fail-closed 交 receipt）。理由：单行形没有种子，B16 的"随绑"挂不上；而裸行自身的 (line,col) 落在 `BindingInitializer` 根 span 内（跨行形的探针读数已证根 span 覆盖 if token ⇒ 单行同理，**未验证**）。
**告警**：receipt 过掉后**下道墙立刻出现** —— 多行形在 B16 v4 后实测前进到 `typed expr: node origin proof is missing or contradictory fn=main line=5 op=38 parser_node=-1 synthetic=0 origin_stack=0 surface=plan`（原始件 `.rebuild/b_line/b16_b16_repro_let_if_ternary_b1701.stderr.txt`）⇒ 非 call 根的 `origin` 证明缺失是**同一条链的下一段**，只补认领臂不会一步到 rc=0。

---

## 7. 原始件索引（本轮只读取用；sha256 供复核）

| # | 路径 | sha256 / 备注 |
|---|---|---|
| 1 | `.rebuild/patchwork/b905b_probe/c6.err.txt` | `a3a5359d6df12588fa3c676fe714c382cdc96643c6dd71046e3b87103da174fc`；867 B；**墙二判词原始件**；同目录 `c6.report.txt` 记 driver=`.rebuild/f1_line/out/kd_f102` sha `4dfd9d6109767755…` |
| 2 | `.rebuild/b_line/b16_b16_ctrl1line_let_if_ternary_b1701.stderr.txt` | `1567706c8882bfed0ed8da55ab1ab92e63137e472d7e60138227329e44780288`；138 B；03:32；**post-B16 驱动上单行形判词逐字不变**（与 `…_b1601` 同文） |
| 3 | `.rebuild/b_line/b16_b16_repro_let_if_ternary_b1701.stderr.txt` | 134 B；多行形过 receipt 后前进到 `typed expr: node origin proof …` |
| 4 | `.rebuild/b_line/b16_fixture_tree_ctrl1line_let_if_ternary.cheng` | `d193d4e9990794a461190fe6954c20f666ea7277094c547c9bf6a715168d22de`；单行夹具源（7 行，无 import） |
| 5 | `.rebuild/b_line/b16_ledger_append.py` | 8646 B；`:10-12` = 内核线自述根因与 A/B 结论（§3 引用） |
| 6 | `.rebuild/b_line/b16_probe_ifstmt_bind.patch` | `9990cfe167040bb4c72f72321008b265b20f66e24a68e194e29df764948a97ae`；`CHENG_IFSTMT_BIND_PROBE` 探针件（已撤离树） |
| 7 | `.rebuild/s1b_step3/r9/kd_b1701` / `kd_b16probe` | 03:28（post-B16 v4）/ 01:59（带探针开关） |
| 8 | 本席只读辅助件（非源码、非在飞件） | `.rebuild/wall2_probe/closure.py`（os 闭包解析）、`.rebuild/wall2_probe/cols.py`（line-50 `if` 列号） |

代码位点：判点 `compiler_parser_receipt.cheng:9026-9031`；身份式 `:8924-8932`；字段语义 `parser.cheng:168-190 / 197-213 / 302-316 / 970-997 / 1688-1690`；行追加 `:5462/5517-5527`（调用 `:35977-35983`）；认领路 A `:35420-35451`（调用 `:36037-36043 / 36143-36148`）；认领路 B `:34929-35003`（调用 `:34709-34727`）；种子产线 `:6071-6114`；结构化种类判定 `:33800-33805`；锚校验豁免 `:35008-35078`（调用 `:36203`）。

---

## 8. 未验证清单（逐条，禁止外推）

1. **未验证**：`c6 line=50` ⇒ `src/std/buffer.cheng:50`（依据=闭包内唯一"表达式位 line-50 if" + role=0 排除两条语句位；缺 sourcePath 直证）。
2. **未验证**：`exprIndex=5` 与逐行事实计数推算差 1–3 行（本席"哪些行才产事实"的模型有缺项）。
3. **未验证**：单行 `let x = if … else …` 的语句根 span 一定覆盖裸 if 的 (line,col)（跨行形的 span `(5,9)-(8,14)` 是探针实测，单行形是外推）。
4. **未验证**：两条语句位候选（rawbytes:50 / strutils:50）一定被 `StampConditionFact` 认领成 role=7（读码结论，未跑）。
5. **未验证**：§6 的终扫兜底修法与"修后前进到 typed_expr origin 墙"的路径（后者在多行形上有原始件，单行形是外推）。
6. 本文所有形如"唯一""必然"的措辞均限于**已读源码 + 已落盘原始件**范围；未编译、未取槽、未改树。
