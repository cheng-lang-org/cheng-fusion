# w40 判词定位与修法 —— `compiler csg: typed-node exact producer TypeId missing node=8 op=38 o0=-1 o1=-1`

只读源码 + 出补丁设计。**全程未运行任何编译/烤制/lldb**；所有行号均可用 `read`/`grep` 在本工作树复现。
补丁：`patches/w40_textpath_module_const_fold.patch`（`git apply --check` rc=0，已实测；**未落树**，源文件本体零改动）。

---

## 0. 结论先行

1. **node=8 是谁**：一个 `TypedExprIrOpLocalRef`，由文本路径 `TypedExprIrAddRhsLocalRefNode`（`src/core/lang/typed_expr.cheng:20899`，opKind 赋值在 `:20911`）为**模块级 `const` 标识符**发布的"函数局部槽读"节点。具体位置 = `s.values[<const> - 1] = <字面量>` 这条赋值语句 **LHS 下标表达式**里的 `<const>`：
   - `r8_fixed_len_named_const_main`:25-26 → `SlotCount`
   - `r8_fixed_len_inline_arith_main` → `SlotStep`
   - `r9_fixed_len_forward_const_main` → `LateCount`
   - `r9_fixed_len_untyped_const_main` → `UntypedCount`

   **不是** `s.values[0] = 7` 的 LHS 根。理由见 §2：该门在**第一个**越界节点就返回，node=8 被报出即证明 node 0..7 全部绑定成功——而 `s` 的两个 LHS 根 LocalRef 恰好就在 node 1 与 node 6。

2. **既有还是新引入**：**新引入**（本战役在飞补丁 `patches/s1b_step3l_global_const_block_bindings.patch` 引入的表示回归），被 `patches/s1b_step3o_module_const_expr_read.patch`（= r9h 相对 r9g 的唯一 delta）揭盖后本轮首次可达。
   **不是** wall24 那类"文本路径 LHS LocalRef 根不产列 ⇒ 全 IR 审计必炸"的 pre-existing 潜伏墙：那个形状（`s` 的 LocalRef 根）已被 wall43 补齐（`:20743-20819` + `:20916-20920`），且本判词本身就证明它成功了。新的缺口是"文本路径读到**模块级** `const` 时既不确定量折叠、又发 LocalRef"。

3. **修法一句话**：文本路径读出模块级 `const` 时必须**先按 const 语义折叠成常量节点**（复用既有 `TypedExprModuleConstLiteralForContext` + `TypedExprIrBuildModuleConstLiteralNode`，与精确解析路径 `:22237-22258` 同一函数、同一字面量），而不是给它绑一个 TypeArena TypeId 后放它继续当"函数局部槽读"——后者即使过门也不可下降（依据：`src/core/backend/primary_object_plan.cheng:18055-18062`）。

4. **若判断错了会先在哪条判词暴露**：见 §5.3（最短路径 = 判词原样不变、node 号不变 ⇒ 折叠条件没生效；其次 = 四件 `compile_rc=0` 但 `run_rc=2` ⇒ 折错值；再次 = `primary: managed semantic binding value-definition missing node=…` ⇒ 有人把修法做成了"给 LocalRef 绑 TypeId"）。

---

## 1. 机制链（file:line）

### 1.1 判词现场

`src/core/tooling/compiler_csg.cheng:34391-34398`：

```
exactTypeIds[nodeIndex] = texpr.TypedExprIrNodeStructuralTypeIdAt(ir, nodeIndex)
if exactTypeIds[nodeIndex] < 0 || exactTypeIds[nodeIndex] >= typeArena.typeCount:
    # [w40] verdict carries the node triple so the missing production site on the
    # typed_expr side is identifiable without a rebake.
    err = Fmt" compiler csg: typed-node exact producer TypeId missing node={nodeIndex} op={…} o0={…} o1={…}"
    return false
```

- `TypedExprIrNodeStructuralTypeIdAt` = `typed_expr.cheng:4775-4781`，直读 `nodes2_structuralTypeIds` 列。
- `op=38` 逐项数 `TypedExprIrOpKind` 枚举（`typed_expr.cheng:157`）= `TypedExprIrOpLocalRef`（独立复核，非引用任务书）。
- 该循环 `for nodeIndex in 0..<typedNodeCount` 且**首个**不合格即 `return false` ⇒ 报出的 node 号是**最小**越界节点 ⇒ node 0..7 全部合格。

### 1.2 `TypedExprIrOpLocalRef` 的全部生产点（全仓仅两处）

| # | 站点 | 触发语法形态 | 是否绑定结构类型 | 漏绑后果 |
|---|---|---|---|---|
| (a) | `TypedExprIrAddRhsLocalRefNode` `:20899`，`node.opKind = TypedExprIrOpLocalRef` 在 `:20911` | **文本路径**标识符读：`TypedExprIrBuildRhsIdentNode`（`:22437`）走完全部精确分支后，在 `:22558-22563` 调它。赋值 LHS 文本、下标表达式、字段路径根等全部经此 | 调 `typedExprIrBindNodeStructuralType(ir, node, wall43TemplateTypeId)`（`:20920`；helper 在 `:4892`）。模板由 `typedExprIrDeclarationLocalTemplateStructuralTypeId`（`:20743`）解析 | 模板返 `-1` 时 bind 对 `-1` 是 **no-op**（`:4896-4897`），列保持 `-1` ⇒ 本判词 |
| (b) | `typedExprIrAddExactBindingRefNode` `:22017`，调用点 `:22306`(ParamRef) / `:22349-22361`(LocalRef，`opKind` 常量在 `:22356`) | **精确绑定路径**：parser 值表达式树里带 binding resolution 的 Identifier（`typedExprIrBuildRhsIdentifierFromParserActive`） | 不调 bind，改从模板节点**克隆列**：`node.resultStructuralTypeId = nodes2_structuralTypeIds[templateNodeIndex]`（`:22079-22082`），模板 = value-definition 的 defining 节点 | 模板列本身必已绑（`TypedExprIrSealExactTypeArena:4821-4831` 逐行互证），故该臂不产 `-1` |

只有 (a) 能产 `-1`。

### 1.3 wall43 模板对"模块级 const"必然返 `-1`

`typedExprIrDeclarationLocalTemplateStructuralTypeId`（`:20743-20819`）的扫描判据：

- `:20760-20766` 声明 kind 必须 = `parser.ParserDeclarationLocal`；
- `:20767-20772` **`declarationFunctionRows[declarationRow]` 必须 == `ir.valueExprCurrentParserFunctionRow`**（当前函数）；
- `:20773-20775` 引入 kind 必须 = `ParserLexicalBindingIntroductionDeclaration`；
- `:20780` 名字 token 必须等于查询名；`:20784` 必须唯一命中。

模块级 `const` 条目在 parser 侧确实是 `ParserDeclarationLocal` + `Source` 作用域（`s1b_step3o` 补丁注释 `:22215-22219` 明写；`compiler_csg.cheng:33484-33499 compilerCsgParserGlobalDeclaration` 的模块级判据是同族 `Local + functionRow == -1 + Source`），但其 **`functionRow == -1`**，与"当前 parser 函数行"永不相等 ⇒ `hits == 0` ⇒ `return -1` ⇒ `typedExprIrBindNodeStructuralType` no-op ⇒ `nodes2_structuralTypeIds[node] == -1`。

### 1.4 为什么这个名会走到 (a)：绑定表把它解析成了"可见的全局绑定"

`TypedExprIrBuildRhsIdentNode`（`:22437`）顺序：

1. `:22445-22488` 参数索引快路径 —— `SlotCount` 不是参数，miss；
2. `:22493` 枚举常量 —— miss；
3. `:22502-22506` `refType = TypedExprBindingRhsLocalRefType(ir, ctx, scope, lineNumber, name)`；
4. `:22507` `if refType == "":` —— **只有**为空才走既有"模块常量折叠"（`TypedExprModuleConstLiteralForContext` → `TypedExprIrBuildModuleConstLiteralNode`，`:22508-22518`）；
5. `:22558-22563` 兜底 `return TypedExprIrAddRhsLocalRefNode(...)`。

而 `TypedExprBindingRhsLocalRefType`（`:18977-19000`）第一步是 `TypedExprLookupBindingType`（`:50767`）→ `TypedExprLookupBindingTypeIndexed`（`:50631`）→ `TypedExprLookupBindingBestIndexIndexed`（`:50490`），其**全局臂**在 `:50556`：`if binding.globalFlag && bestLine < 0: bestLine = binding.lineNumber; bestIndex = bindingIndex` —— 即 **`globalFlag` 的绑定对函数体内可见**。

于是：

- 模块级 `const` 自 `s1b_step3l` 起进 `ctx.bindings`（工作树 `typed_expr.cheng:54963` `var inGlobalConstBlock = false`，`:54993-55000` 有类型标注条目经 `TypedExprMaybeAddBinding(..., globalFlag=true, mutableFlag=inGlobalVarBlock=false, ...)`；无标注条目经 `:55001-55018 TypedExprConstBlockEntryBinding` + `TypedExprMaybeAddBindingInit(..., false, ...)`）；
- ⇒ `refType == "int32"`（非空）；
- ⇒ `:22507` 的 `refType == ""` 不成立，**既有 const 折叠被跳过**；
- ⇒ 落到 `:22558`，发 LocalRef；
- ⇒ §1.3 模板 `-1`；
- ⇒ node=8 判词。

**s1b_step3l 之前**：`const` 块条目根本不进 `ctx.bindings`（`git show HEAD:src/core/lang/typed_expr.cheng | grep inGlobalConstBlock` 无命中；`patches/s1b_step3l_global_const_block_bindings.patch` 是唯一引入者），`refType == ""` 成立 ⇒ 走 `:22508` 折叠成 `I32Const` ⇒ **不存在这个节点**。

### 1.5 为什么 s1b_step3l 的回归当时没爆：s1b_step3o 揭盖

- parser 侧把模块 `const` 记成模块级 `ParserDeclarationLocal`，**与 `ctx.bindings` 无关**；所以**精确解析路径**（值表达式树里的 Identifier，例如 `s.used = s.values[0] + s.values[SlotCount - 1]` 的 RHS 读）在 step3l 前后一样会撞 `:22259-22262` 的
  `panic("typed expr binding: declaration producer identity split")`（`declarationSourceLocalRow < 0 || parserFunctionRow < 0`）。
  战役文档实测：`s1b_step3_progress.md:1820`（§15.6 第 5 条）——把 `SlotCount - 1` 换成字面量 `3` 后该 panic 消失并推进到 `compiler snapshot builder: object field TypeArena authority invalid`。
- 该 panic 发生在 typed IR 构建期，**早于** compiler_csg 的 typed-node 门；所以 step3l 造出的那个 `-1` 节点一直存在但从未被读到。
- `s1b_step3o_module_const_expr_read.patch`（r9h 的唯一 delta，54 行）在 `:22215-22258` 给**精确路径**补了模块常量折叠，panic 消失（`s1b_step3_progress.md:1848` 判据①成立），typed IR 得以构建完，门第一次被执行 ⇒ node=8 判词（同文件 `:1841-1844`，四件正例逐字同句）。

### 1.6 判词只暴露最小越界节点 ⇒ node 0..7 全部合格（本判词的"自带证据"）

四件夹具 `main` 的形状（`docs/campaigns/2026-08-31-kernel-userpath/fixtures/r8_fixed_len_named_const_main.cheng:23-30` 等）与型别化节点的创建顺序（`typed_expr.cheng:61645-61655`）：

| 顺序 | 动作 | 代码坐标 | 节点 |
|---|---|---|---|
| 1 | `TypedExprIrAddParamNodes`（`fn main(): int32` 无参） | `:61645`，`:15039` 循环体不执行 | 不产 |
| 2 | `TypedExprIrAppendParameterValueDefinitionsExact`（顺带把 `valueExprCurrentParserFunctionRow` 置为当前函数行） | `:61650`，值定义在 `:15234` | 不产 |
| 3 | `TypedExprIrAppendLocalDeclStatementsForScope`：`var s: Slots`（无初值）→ nil 臂落空 → **w24-agg 聚合零值模板** `TypedExprIrAddAggregateZeroDeclarationLocalTemplate`（`:29495`，op = `NilPtr`，`typedExprIrBindNodeStructuralType(ir, aggNode, aggTypeId)` 在 `:29625`） | `:61653`，`:29789` | **node 0** |
| 4 | 语句 `s.values[0] = 7`：LHS 先建（`:60456-60464`，`TypedExprIrBuildExprNodeWithExpectedType`→`TypedExprIrBuildExprNode`→`TypedExprIrBuildRhsIndexNode:23051`→base `s.values` 经 `TypedExprIrBuildRhsFieldPathNode:22685` 先建根、再建 FieldGet；下标 `0` 后建）→ `LocalRef s`, `FieldGet values`, `I32Const 0`, `IndexGet`；RHS `7` 后建 | `:23065-23081`，`:22685-22695`，`:60563` | **node 1..5** |
| 5 | 语句 `s.values[<const> - 1] = <字面量>`：同样先 LHS base（`LocalRef s`, `FieldGet values`），再下标表达式 `BuildRhsNodeLevel("SlotCount - 1"):23628` → `BuildRhsPrimaryNode:23283` → `:23388-23389` → `TypedExprIrBuildRhsIdentNode` → **`TypedExprIrAddRhsLocalRefNode`** | `:23065-23081`，`:23022-23028`，`:22437`，`:22558` | **node 6, 7, 8(←判词), 9, 10, 11** |

即 **node=8 = 该 const 标识符的 LocalRef**（`node 9 = I32Const 1`、`node 10 = I32Sub`、`node 11 = IndexGet`）。
此表是**代码阅读推断**，绝对序号未经运行时验证（见 §6）；但 node=8 的**身份**不依赖序号，见 §2。

---

## 2. node=8 身份的独立佐证（不依赖 §1.6 的序号算术）

三条互相独立的证据把 node=8 钉在"模块 const 读"上：

- **E1（形态）**：`op=38` 是 LocalRef。该表达式里能产 LocalRef 的标识符只有两个：`s` 与 `<const>`。而 `o0=-1 o1=-1` 与 LocalRef 叶节点一致（`:20924-20926`），对两者都成立，不能区分。
- **E2（首越界即返回）**：门在最小越界节点返回。`s` 的 LHS 根 LocalRef 出现在 node 1 与 node 6（§1.6）；若 `s` 的 LocalRef 绑不上，判词必报 node=1。既然报 node=8，说明 node 1/6 都绑成功了 ⇒ 失败的只能是 `<const>` 那个 LocalRef。
- **E3（字面量替身实验，上游实测）**：`s1b_step3_progress.md:1820` —— 把 `SlotCount - 1` 换成字面量 `3`、其余一字不动，该形状的墙消失并推进到下一道（`compiler snapshot builder: object field TypeArena authority invalid`）。若 node=8 是 `s` 的读，替换下标字面量不可能让它消失。⇒ node=8 是**只因子表达式里那个 const 读而存在**的节点；而该子表达式里唯一的 `op=38` 节点就是 const 标识符本身（`I32Const 1` 是 op=10、`I32Sub` 是 op=12）。

**不确定性**：E3 依赖战役文档记录的实验（`SlotCount - 1` 两处同时替换），本席未复跑；§1.6 的绝对序号（0..8）是静态推断。二者都不影响结论"node=8 = 模块 const 标识符的 LocalRef"，只影响"它落在哪一行"的精确表述（line 26 的 LHS 下标 vs line 27 的 RHS 下标）——后者由语句源序决定（`TypedExprIrAppendStatementsForScope` 按源序，`:61655`），line 26 在 line 27 之前。

---

## 3. 既有 vs 新引入：判据

**判定：新引入（在飞补丁 s1b_step3l 造的表示回归），由 s1b_step3o 揭盖首次可达。**

判据逐条可复现：

| 判据 | 复现方式 | 结果 |
|---|---|---|
| C1 门与 (a) 站点是既有的 | `git log -S` 与 `read` | 门 `:34393` 与 wall43 均在 `a51113b7a`（2026-09-01）前存在；四件夹具是 2026-09-1x 才跑的 |
| C2 "模块 const 进 `ctx.bindings`"是新代码 | `git show HEAD:src/core/lang/typed_expr.cheng \| grep -c inGlobalConstBlock` = **0**；`grep -n inGlobalConstBlock src/core/lang/typed_expr.cheng` = **3 处，均在未提交 diff 内** | 该行为是工作树 WIP，唯一引入者是 `patches/s1b_step3l_global_const_block_bindings.patch`（该 patch 223 行，含全部 3 处 `inGlobalConstBlock`） |
| C3 没有 step3l 时该节点不存在 | §1.4 尾段推理：`refType == ""` ⇒ `:22508` 折叠为 `I32Const` | 该形状在 step3l 前不可能产 `op=38` |
| C4 为什么现在才看见 | `s1b_step3_progress.md:1812/1817`（step3l 时期卡点是 panic `declaration producer identity split`）、`:1841-1848`（r9h=+step3o 后 panic 消失、新墙 node=8） | panic 在 typed 构建期、门在其后 ⇒ 潜伏期成立 |

**与 wall24 记录的关系（明确区分）**：wall24 移交的是"文本路径 LHS LocalRef 根不产 **binding 五列** ⇒ 全 IR 审计必炸"，其结构类型版本由 **wall43** 补齐（`:20722-20741` 注释自述："赋值 LHS 文本路径 …此前是 LocalRef 生产者中唯一不发布 structuralTypeId 的拼写；kernel_driver_w40 编 v6: main `n = new(Node)` LHS node=57 op=38 实证"）。本判词**不是**那一条的复现：
- 那条的失败者是"函数局部 `s` 的 LHS 根"，wall43 之后已绑成功（本判词 node 0..7 合格即为证据）；
- 本条失败者是"**模块级** `const` 的文本读"，它既没有函数局部 value-definition 组可编址，也**根本不该被表示成局部槽读**（§4.3）。

---

## 4. 修法与判据

### 4.1 类型从哪来 —— 唯一正确来源

`const` 是编译期常量，**从不发存储读**：

- 规范：`docs/cheng-formal-spec.md:555`（`T[N]` 的 N 是编译期常量）。
- C 链：`parser_find_const`（`bootstrap/cold_parser.c:53180` 一带）→ `cold_materialize_const_value`（`:51680` 一带）发 `BODY_OP_I32_CONST`（坐标由 `s1b_step3o` 补丁注释 `typed_expr.cheng:22224-22226` 给出，本席未逐行复核 C 链）。
- 既有代码已经把这条语义实现为"折叠成常量节点"：精确解析路径 `:22237-22258`（step3o）与文本路径 `:22508-22518`（既有回落）是**同一个** `TypedExprModuleConstLiteralForContext` → `TypedExprIrBuildModuleConstLiteralNode`。

所以该标识符读的**唯一正确**节点是常量叶节点，其精确结构类型由**常量自身的标量类别**决定：

- 表来源：模块 const 表（`module_const_literals` / buildIndex 键 `"module_const"` / `"ctx_module_const_source"`，`:21648-21712`），值文本取自 `const` 条目自身的初始化字面量（parser 侧 `ParserValueExprProcessBindingEntryRange` 一族发布的条目；`s1b_step3o` 注释 `:22216-22218`）。
- 类型落点：`TypedExprIrBuildModuleConstLiteralNode`（`:21765-21842`）按字面量类别发 `StrLit`/`BoolLit`/`CharLit`/`I32Const`/`I64Const`，全部经 `TypedExprIrAddRhsLeafNode`，后者在 `:20707-20713` 调
  `typedExprIrBindNodeStructuralType(ir, node, typedExprIrReservedScalarTypeId(ir, semanticScalarKind))`（`:4837-4843` → `typearena.TypedExprTypeArenaReservedScalarTypeId`）。
- 等价的"声明类型语法根 → TypeArena TypeId"既有查询是 `typearena.TypedExprTypeArenaTypeIdForTypeSyntax(arena, typeSyntaxRoot)`，本仓两处用法：`:29439`（w24 nil 模板，取 `declarationTypeSyntaxRootIndexes`）与 `:29555-29562`（w24-agg 聚合零值模板，同一坐标）。**它与字面量标量类别必须一致**（`const SlotCount: int32 = 4` 两条路都给 `int32` 的保留标量 TypeId）。本补丁取字面量路，理由：只有它同时给出**值**；const 读的正确性既要类型精确也要值精确，而值的唯一权威就是 const 条目的初始化字面量。

> 任务书给的坐标 `typed_expr.cheng:47485 TypedExprIrLookupTypeLayout` 与工作树不符：`:47485` 落在 `TypedExprIrTypeIsEnum`（`:47465`）内，`TypedExprIrLookupTypeLayout` 实际在 **`:47700`**（`@borrows`，`:47699`）。本补丁不需要它（见 4.4）。

### 4.2 为什么不能用"节点操作数类型推断"之类的启发式

1. **对本节点是空操作**：LocalRef 叶节点（`:20924-20926`）`operand0/1/2 == -1`，判词自己也带着 `o0=-1 o1=-1`。没有操作数就没有可推断的源。
2. **即便有操作数也违反本仓已定契约**：本战役反复确立的是"producer freezes, csg never derives"（`:20912-20915` 注释原文）。结构 TypeId 是**生产侧冻结的权威列**，跨模块审计（`TypedExprIrSealExactTypeArena:4821-4831` 与 `valueDefinitions_exactTypeIds` 逐行互证）都建立在"该列由生产点按声明/定义权威写入"之上；用使用点上下文倒推会把这列变成推导量，与 seal 审计和 csg 的交叉校验对不上。
3. **会把"类型对但值错"合法化**：const 读必须折成**值**。只补类型不补值，等于把一个编译期常量变成一次运行期"读"。

### 4.3 备选 A（已否决）：给该 LocalRef 绑 `const` 声明类型语法根的 TypeId

做法：在 (a) 站点（或 wall43 模板 helper）加一条"模块级 const"分支，用 `declarationTypeSyntaxRootIndexes[row]` → `TypedExprTypeArenaTypeIdForTypeSyntax` 给节点绑类型。

**否决依据（可复现）**：该节点**不可下降**。`src/core/backend/primary_object_plan.cheng:18051-18062`：

```
if opKind == texpr.TypedExprIrOpParamRef || opKind == texpr.TypedExprIrOpLocalRef:
    let bindingRow = texpr.TypedExprIrNodeBindingValueDefinitionRowAt(typedIr, currentNodeIndex)
    if bindingRow < 0 || …:
        panic("primary: managed semantic binding value-definition missing node=…")
```

模块 const 没有函数局部 value-definition ⇒ `bindingValueDefinitionRow == -1`（文本路径 LHS 窗口的盖章 `:60487-60527` 只写 origin/synthetic/span 三列，不写 binding 五列）⇒ 备选 A 只是把墙从 compiler_csg 挪到 primary（或更下游的静默错槽读，取决于走哪条后端路径）。这违反"Let it crash：关键路径必须用生产级方案打通，不得绕过/兜底"。
同时它与 `s1b_step3o` 注释 `:22220-22223` 的既有裁定直接冲突："它的两条支路都发精确的**局部**身份引用…模块级声明没有函数局部定义可编址，**在该表示里不可表示**——所以这里不能放宽守卫，只能先按 `const` 的语义把读取折成常量。"

### 4.4 为什么不动 TypeArena / 不动 `compiler_csg.cheng`

- 判词不是"TypeArena 里没有这个类型"，而是"节点没有发布类型"。`Slots` / `int32[4]` 的 TypeArena 条目由既有 w24-agg 路径正常建成（node 0 就绑上了 `aggTypeId`，否则 node=0 会先爆）。
- 门 `:34393-34398` **一字不改**，任何守卫判据零放宽。

### 4.5 补丁内容

`patches/w40_textpath_module_const_fold.patch`（unified diff，`a/src/core/lang/typed_expr.cheng`；`git apply --check` rc=0，`git apply -R --check` 在对侧失败＝本补丁未落树的正常读数）：

在 `TypedExprIrBuildRhsIdentNode` 内、`let refType = …` 之前插入"本行胜出绑定是否模块级"的判定，并把既有常量折叠的守卫由

```
if refType == "":
```

改为

```
if refType == "" || moduleScopeBindingRef:
```

判定体：

```
let moduleConstBindingRow = TypedExprLookupBindingBestIndex(
    ctx,
    TypedExprScopeIndexForLine(ctx.scopes, lineNumber),
    lineNumber,
    share(name))
var moduleScopeBindingRef = false
if moduleConstBindingRow >= 0 &&
   ctx.bindings[moduleConstBindingRow].globalFlag &&
   ctx.bindings[moduleConstBindingRow].functionName == "":
    moduleScopeBindingRef = true
```

- 用**既有**查询 `TypedExprLookupBindingBestIndex`（`:50620`；正是 `TypedExprLookupBindingTypeIndexed` 自己用的那一支），不新增查找语义。
- 判据 = "该名在**本行**胜出的绑定是模块级（`globalFlag` 且 `functionName == ""`）"。
- 折叠体原封不动（`constLiteral == ""` 或 `constNode < 0` 时**原样落穿**到本地路径 ⇒ 模块级 `var`/`let` 与不可物化常量的行为逐字不变 ⇒ fail-closed，零放宽）。
- 同名函数局部遮蔽时胜出绑定不是模块级 ⇒ 走原本地路径，逐字不变。

**全仓影响面（可复现）**：扫描 7256 个 `.cheng`（脚本临时代码见 §7 已删除的 `patches/.w40_const_shadow_scan.py`，逻辑：收集缩进 `const` 块条目名 × 同文件 `var|let|for` 绑定名），**const/局部同名命中 1 处**：`src/libp2p/mobile_ffi/unimaker_compat_ffi.cheng` 的 `base58Alphabet`（const `:226`，局部 `let :4887`，使用 `:4895`）——局部在**使用点之前**声明，胜出绑定是局部 ⇒ 本补丁对该处 no-op。`for` 变量同名命中 **0** 处。

### 4.6 块内标识符逐点绑定核对（编译级陷阱：不得引用后面才声明的 `let`）

| 插入块内标识符 | 该点是否已绑定 | 依据 |
|---|---|---|
| `ctx` | ✅ 函数参数（`ctx: var TypedExprSourceContext`） | `:22438-22442` |
| `scope` / `lineNumber` / `name` | ✅ 函数参数 | 同上 |
| `TypedExprLookupBindingBestIndex` | ✅ 函数（非 `let`）——**前向引用合法**：同文件 `TypedExprBindingRhsLocalRefType`（`:18977`）已前向调用 `TypedExprLookupBindingType`（`:50767`）与 `TypedExprIrPriorBindingType`（`:55614`） | `:50620` |
| `TypedExprScopeIndexForLine` | ✅ 函数，前向引用（同上）；`ctx.scopes` 字段已存在 | `:27738` |
| `share(...)` | ✅ 本函数 `:22504`/`:22509` 已在同点同用途使用 | `:22437` 起 |
| `moduleConstBindingRow` | ✅ 本块 `let` 先声明后使用 | 补丁内 |
| `ctx.bindings` / `.globalFlag` / `.functionName` | ✅ `TypedExprSourceContext.bindings: TypedExprBinding[]`；字段由 `TypedExprMaybeAddBindingInit`（`:17702-17705`）写入 | `:50546` 同款读法 |
| `moduleScopeBindingRef` | ✅ 本块 `var … = false` 先声明；`var x = false` 同款见 `:54963` | 补丁内 |
| `refType`（改动行） | ✅ 紧邻上方既有 `let refType = …` 已绑定 | `:22502-22506` |
| `constLiteral` / `constNode` | ✅ 折叠体内既有，未改 | `:22508-22518` |

语言陷阱自查：新块内**无** `||` 后跟注释；多行条件（`:22237-22246` 同款 `&&` 收尾）内**无**注释；`@borrows` 与 `fn` 之间无夹注释；未给 `var` 局部赋结构体字段（无 body-store-freeze 风险）。

---

## 5. 验证计划

### 5.1 已完成的只读验证

1. `git apply --check patches/w40_textpath_module_const_fold.patch` → **rc=0**（实跑）。
2. `git diff --stat -- src/core/lang/typed_expr.cheng` 前后一致（487 insertions / 72 deletions）⇒ 源文件本体零改动（实跑）。

### 5.2 待做的编译级验证（**本席未做**：编译槽位被另一手占用，硬纪律禁止）

| 步 | 命令（示意，复用战役既有脚本） | 期望读数 |
|---|---|---|
| V1 | 落树补丁后按 `kd_r9h` 同一烤法重烤一份驱动 | bake `rc=0`，`lease_hits=0` |
| V2 | 同一四件正例 `fixtures_r9.sh` | `compile_rc` 由 `2` 变为 `0`，或推进到下一道墙（已知下一道是 `compiler snapshot builder: object field TypeArena authority invalid`，`s1b_step3_progress.md:1820`）；**末行不得再出现** `typed-node exact producer TypeId missing node=8 op=38` |
| V3 | 负例 `r8_fixed_len_non_int32_main` | 判词逐字不变：`parser type syntax: fixed array length const must be int32 name=SlotName` |
| V4 | `binary_types_via_import` | 仍 `compile_rc=1 / arena array: read out of bounds`（本补丁不碰 TypeArena 越界；若它消失才是异常） |
| V5 | 无模块 const 的对照件 `ordinary_zero_exit_fixture` / `call_fixture` / `cold_nested_fmt_interpolation_smoke` / `v6_direct1_repro` | **与基线逐字节相同**（同 `--out` 串行两跑再 `shasum`，口径见 `s1b_step3_progress.md:1805`） |
| V6 | 四件产物真跑 | `run_rc=0`（这是"折对值"的唯一证据；`s.used != 16/7` 分支会返 2） |

### 5.3 若修法错了，先在哪条判词暴露

| 错法 | 首暴露判词 / 读数 | 位置 |
|---|---|---|
| 判据没生效（胜出绑定不是模块级、或 `constLiteral` 取空） | **判词原样不变**：`compiler csg: typed-node exact producer TypeId missing node=8 op=38 o0=-1 o1=-1`（node 号也不变） | `compiler_csg.cheng:34397` |
| 判据过宽（把模块级 `var`/`let` 也折了） | 模块级全局读被折成常量 ⇒ 该全局的写入失效 ⇒ 后端值错 / `typed expr: … no_node`；最先在**含模块级 `var` 全局**的件上暴露（本四件无模块 var，暴露不了，故必须跑 V5 之外的全局夹具） | `typed_expr.cheng:22508` 邻域 |
| 折错值（取了错条目） | 四件 `compile_rc=0` 但 `run_rc=2`（`if s.used != 16: return 2`） | 产物运行 |
| 有人把修法做成备选 A（给 LocalRef 绑 TypeId） | `primary: managed semantic binding value-definition missing node=…` | `primary_object_plan.cheng:18061` |
| 误伤本地路径（遮蔽/for 变量） | `typed expr binding: exact local value-definition group unavailable` / `typed expr binding: declaration producer identity split` 族 panic | `typed_expr.cheng:22146` / `:22262` |

---

## 6. 未测项（诚实）

1. **未运行任何编译/烤制/lldb**（硬纪律）。V1-V6 全部为计划。
2. §1.6 的节点绝对序号（node 0..8 的表）是**代码阅读推断**，未经运行时验证。node=8 的**身份**另有 E1-E3 三条独立证据（§2），不依赖该算术；但"它落在 line 26 的 LHS 下标"这一句依赖语句源序 + 序号算术。
3. E3（字面量替身实验）取自 `s1b_step3_progress.md:1820` 的既有记录，本席未复跑，也未核实其替换是否两处 `SlotCount - 1` 同时替换。
4. **未验证** for-range 循环变量与模块 const 同名时 `TypedExprLookupBindingBestIndex` 的胜出者（循环变量可能不在 `ctx.bindings` 而在 `scope.loopVarRecord*`）。全仓扫描显示该形态 **0 处**（§4.5），但这是"当前仓库没有"，不是"语义上不可能"。若出现，本补丁会把一个今天 hard-fail 的形状折叠成按 const 值编译——**这是本补丁已知的残留风险**，判据应随 `TypedExprEnclosingForRangeBindingIsI32`（`:21949`）进一步收紧；本席未加该守卫，因为它有"`!scope.loopVarTableBuilt` 时假定 true"（`:21958-21962`）的相位语义，误加会反向把本修法关掉。
5. **未验证** step3o 之后 line 27 RHS 的 `SlotCount` 是否仍走文本路径。若仍走，本补丁一并修好；若已全走精确路径，本补丁对该处 no-op。
6. **未验证** `git apply` 落树后的编译可过性（含 Cheng 语法/所有权检查）。§4.6 是静态核对，不是编译回执。
7. **未验证** `docs/cheng-formal-spec.md:555` 与 C 链 `cold_parser.c:53180/51680` 的原文（沿用 `s1b_step3o` 补丁注释给出的坐标，本席未逐行复核这两个文件）。
8. 备选 A 的否决依据（`primary_object_plan.cheng:18055-18062` 的 panic）是**代码阅读**结论：该 panic 只在"managed semantic 投影"路径上必触发，其它后端路径（backend2 / 文本 realizer）未逐一核；故表述为"不可下降（至少在该路径上必炸）"。

---

## 7. 纪律回执

- 全程只 `read` / `grep` / `git apply --check` / `git diff` / `git show` / `python3`（纯文本扫描）；**零编译、零烤制、零 lldb**。
- **零源文件改动**（`git diff --stat -- src/core/lang/typed_expr.cheng` 前后一致）；未 `cp` 整文件、未 `git checkout --` / `restore` / `stash`、未 commit/push/建分支/建 worktree。
- 未放宽 `compiler_csg.cheng:34397` 或任何守卫判据。
- 临时脚本 `patches/.w40_const_shadow_scan.py` 已删除（结果与逻辑已写入 §4.5）。
- 落盘产物：`patches/w40_textpath_module_const_fold.patch`（本文件）。
