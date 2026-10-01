# 聚合裸声明零值定义模板（decl-local value-definition group 墙的同构扩展）

**〔本席裁决（2026-09-11 深夜，独立复核后批准）〕** 方向与判据成立，三条关键声明本席逐条 read 核过：① 组审计 panic 确在 —— `typed_expr.cheng:2810` `typed expression value definition: function group was not consumed exactly once`（你写 :2804-2805，行号略漂，语义一致）；② 补丁的判据确实是**结构 kind + 布局查询**，不是字符串启发（补丁里出现 `TypedExprStructuralTypeObject` / `TypedExprTypeArenaFixedLengthAt` / `TypedExprIrLookupTypeLayout`）；③ **最关键的一条已核实**：后端自己的 `PrimaryBodyIrCanonicalTypeLayout`（`src/core/backend/primary_object_plan.cheng:6995-7014`）第一件事就是调 `texpr.TypedExprIrLookupTypeLayout(...)` ⇒ 补丁的判据与后端实际发射路径**同一函数、同一坐标**，这是能拿到的最强地基（不是“我们也算了一遍布局”而是“就是同一个函数”）。另：复用 wall24 的 detached NilPtr 载体指纹（三处跨模块审计已放行）、不新增 op 枚举、语句 rhs 保持 no_node —— 这三条使得"后端逐字节不变"是可期待的，而不是口号。


**〔v2 裁决（2026-09-11 深夜：**本席假设被静态证伪，原作者诊断成立**）〕** 本席先前推测的"载体 NilPtr 是 Owned、非托管聚合定义是 Unmanaged ⇒ 不等"是**错的**，已亲自 read 核实：消费点 `:5808` 传给 `typedExprIrAppendValueDefinitionExact` 的最后一个实参**就是** `ir.nodes2_exprClasses[definingTypedNodeIndex]`，`:6077` 又它存成 `ownership` ⇒ `:6093` 那条比较是**同一列自比、恒为假**，不可能触发。真死因是 `:6089 ownership <= Int32(TypedExprExprUnknown)`：符号常量维度的定长数组使 `TypedExprIrTypeContainsManagedStorage` 返回 false ⇒ exprClass=Unknown ⇒ 炸 `:6098`；根因在 `:48087-48090` 建 `fixedCtx` **只设 `sourcePath` 未设 `buildIndex`**，而姊妹点 `TypedExprIrLookupTypeLayout`（`:47659-47661`）**两个都设**（两处均已本席 read 核实），而 `TypedExprConstDimIntValue` 在 `ctx.buildIndex==nil` 时直接 return false（`:19981-19982`）。v2（`patches/aggregate_zero_definition_group_v2_incremental.patch`，+21/−0，2 hunk，`git apply --check` 复验 exit 0）就是补这个缺口 + 把"托管存储类可判"作为模板准入门，**`:6089-:6098` 判据一字未放宽**。落树顺序因此调整为：**v2 先落（烤 `kd_r9g`）→ 再落容量 pin + 列普查（烤 `kd_r9e`）→ `kd_r9e` 与 `kd_r9g` 逐字节比**（而非与 `kd_r9f`：v2 合法改变了符号维度定长数组的可判性，拿 `kd_r9f` 当基线会把 v2 算进去）。
**〔落树顺序约束（必须遵守）〕** 本补丁**不得**在 `kd_r9e` 之前落树：`kd_r9e` 的判据是"与 `kd_r9d` 产物**逐字节相同**"，而本补丁**合法地改变行为**（为聚合裸声明补 defining 节点）⇒ 提前落树会把它和容量 pin/列普查的中性混在一起，两个结论同时作废。正确顺序：`kd_r9e` 字节比对通过→ 再落本补丁 → 烤 `kd_r9f` → 验收：四件正例应从 `rc=1`（本墙）转 `rc=0`，负例必须仍为 `rc=2` 且判词逐字不变，并按你的四分类表验**前两类（序列 69,810 / 内建标量 60,322）产物逐字节不变**。


**状态：v1 已落树并实测（组墙四件正例全部消失），v2 为其 21 行增量修（`:6098` 下一跳）。本席未编译、未烤机。**
v1 = `patches/aggregate_zero_declaration_local_definition_group.patch`（已落树）；
v2 = `patches/aggregate_zero_definition_group_v2_incremental.patch`（本次交付，在 v1 已落树的当前树上
`git apply --check` exit 0）。按纪律本席未运行任何编译/烤制命令，故文中凡"会/应"均为静态推断，
实测结论以 `kd_r9f`（v2）为准。**坐标说明（重要）**：本文件正被并行编辑，纯行号会漂，故**以函数名/原文字符串为锚**，
行号仅作参考。两版相同的坐标（v1 插入点 `:29418` 之前）：`:22146`、`:2810`、`:6089`、`:6098`、`:19972`、`:19981`；
**v2 直接操作的两处**按当前（v1 已落树）树给出：模板内 (C) 门 = 当前树第 29550 行后、定长数组常量上下文 =
当前树第 48087 行后（`typedExprIrTypeContainsManagedStorageActive` 当前树 `:48049`、`TypedExprIrTypeContainsManagedStorage`
当前树 `:48278`、`TypedExprIrLookupTypeLayout` 当前树 `:47644`、`TypedExprIrAppendFunction` `:2767` 两版相同）。

## 0. 一句话

裸 `var s: Slots`（按值复合、非 nil-able）会注册一个 decl-local value-definition 组，但零值臂
（`typed_expr.cheng:29505-29563`）只有 seq 与 int32/uint32/int64/uint64/bool/str，按值复合类型无臂可用
⇒ 组 registered 却永不 consumed ⇒ 该局部首个精确读在 `:22146` 炸（一次也没读则在函数收尾 `:2804` 炸）。
修法 = 给这类声明补一个 detached 零值定义载体（复用 wall24 的 NilPtr 指纹形态）；v2 再修"该载体的
exprClass/ownership 类不可判"这条被 v1 暴露出来的下游缺口（符号维度定长数组字段 + 常量上下文缺 build index）。

## 1. 机制链（逐跳 file:line，全部已复核）

| 环节 | 位置 | 要点 |
|---|---|---|
| 组注册 | `src/core/lang/typed_expr.cheng:5605-5724` `typedExprIrRegisterDeclarationLocalGroups` | 过滤 `:5625-5639`：`ParserDeclarationLocal` + 本 parser 函数 + `IntroductionDeclaration`；组行回写 `valueExprTransactionDeclarationLocalGroupRows[declRow]` `:5716`；`definitionRows=-1`/`consumedFlags=0` `:5701-5708` |
| 注册时机 | `:5348` 函数，`:5575-5576` 调用；调用点 `:61524-61532` | 在**函数体语句构建之前**（`:61614` 才 append decl 语句），故模板执行时组必已注册且未消费 |
| 消费点 | `:29421-29586` `TypedExprIrAddLocalDeclStatement` | 零值臂 `:29505-29563`；`declLocalDefiningNodeIndex = stmt.rhsNodeIndex` `:29567`；`<0` 回落 nil 模板 `:29574`；`>=0` 才消费 `:29577` |
| 消费契约 | `:5727-5819` `TypedExprIrConsumeDeclarationLocalValueDefinition` | 名称唯一扫描 `:5747-5771`（hits!=1 panic）；组必须已注册 `:5772-5776`；**不得二次消费** `:5777-5781`；追加 valueDefinition 并写 `definitionRows` + `consumedFlags=1` `:5798-5818` |
| 守卫/判词 | `:22107-22154` `typedExprIrExactLocalValueDefinitionRow` | 四坐标 + `consumedFlags==1` 联立 `:22124-22145`，panic `:22146`；唯一调用点 `:22294-22304`（`typedExprIrBuildRhsIdentifierFromParserActive` `:22157` 的 Pattern 臂——即"首个精确读"） |
| 未读也炸 | `:2767` `TypedExprIrAppendFunction`，守卫块 `:2796-2810`，panic `:2810` | 判词 `typed expr value definition: function group was not consumed exactly once`（此前本席写 :2804-2805 系推算，本席裁决复核为 `:2810`，已按源码更正；v1 插入点在 `:29418` 之后，本坐标两版树相同） |
| 模板节点做什么 | `:22017-22105` `typedExprIrAddExactBindingRefNode` | 从模板复制 `resultType` `:22068`、proof/managed/send/sync `:22069-22078`、`resultStructuralTypeId` `:22079-22084`；读节点自身带 `bindingValueDefinitionRow` `:22104`。即模板提供**类型 + 类型证明列 + value-definition 行**，不求值 |
| 后端发射 | `src/core/backend/primary_object_plan.cheng:53426-53457` | `LocalI32/I64/Ptr/F64` → `LoadConst 0`；`LocalAggregate/LocalStr` → `PrimaryBodyIrAppendZeroLocalSlot`（`:17897-17939`，`setMem` 全零）；语句 rhs 恒 no_node 的契约注释 `:52971-52976` |
| 后端槽型 | `:5727-5742` → `:5693-5724` → `:4753+` / 兜底 `:5704-5721` → `PrimaryBodyIrCanonicalTypeLayout` `:6995-7014` | 文本整形给不出正尺寸时用 `TypedExprIrLookupTypeLayout` 查布局，命中 `size>0/align>0` 即**无条件** `LocalAggregateTag` |
| arena→槽型映射 | `src/core/backend/canonical_type_chain.cheng:102-141` | `Object/FixedArray/Tuple/Sequence/Optional → LocalAggregateTag`；`RefObject/Function → LocalPtrTag` |

**三处跨模块"detached 零值声明模板"放行臂**（都以 `origin=BindingInitializer + ownerStatement=-1 +
opKind=NilPtr + parserOrigin=-1 + Desugared + NoSource` 为指纹，逐列联立才放行）：
`typed_expr.cheng:4226-4249`（value-definition authority）、
`typed_expr_frag_codec.cheng:1763-1788`（定义行 owner 审计）、
`lowering_plan.cheng:6264-6296`（ownership transport owner statement）。

## 2. 判据（可证，无启发式）

**判据 = (A) 类型语义类 ∧ (B) 后端槽型查询 ∧ (C) 托管存储类可判，三者都必须命中，任一不符返回 -1（fail-closed，旧判词保留）。**

- **(A) 精确类型类**：该**声明行自带的绑定注解 TypeSyntax 根**（`declarationTypeSyntaxRootIndexes[declRow]`）
  经 `typearena.TypedExprTypeArenaTypeIdForTypeSyntax`（`typed_expr_type_arena.cheng:9562-9568`）解析出的
  TypeId，其 `TypedExprTypeArenaKindAt`（`:9671`，枚举 `:13-27`）必须 ∈
  {`TypedExprStructuralTypeObject`，`TypedExprStructuralTypeFixedArray` 且 `FixedLengthAt>0`（`:9749`）}。
  绑定注解根由 `parser.cheng:24002-24064`（`ParserValueExprProcessBindingEntryRange` →
  `ParserTypeSyntaxRootBindingAnnotation`）建，`:24080-24086` 统一盖到每个声明行；参数路径同源
  （`typed_expr.cheng:15011-15022`）。语义：**按值复合、非 nil-able**；nil-able 家族是
  RefObject/Borrow/指针（由 w24 臂先手处理）。
- **(B) 后端裸声明槽定型查询**：`TypedExprIrLookupTypeLayout(ir, ctx.sourcePath, bindingType, size, align, fieldCount)`
  （`typed_expr.cheng:47485-47559+`）必须命中且 `size>0 && align>0`。
  依据：后端 `PrimaryBodyIrCanonicalTypeLayout`（`primary_object_plan.cheng:6995-7014`）**就是**这个函数，
  且后端在 `:5120`（命名复合内联分支）与 `:7003`（文本整形失败后的兜底，`:5704-5721` 调用）用它，
  参数同为 `(stmt.sourcePath, 类型文本)`。命中即槽型被强制为 `LocalAggregateTag`，聚合零值发射随之成立。
  布局行在 metadata 阶段一次性建全（`typed_expr.cheng:62067-62083`，早于函数体构建），查询结果稳定。
  这一条不是文本匹配：它与后端**同一个函数、同一坐标**，排除了"前端认定聚合、后端落回大写叶→8B 指针槽"的错位。
- **(C) 托管存储类可判（v2 新增，直接封 `:6098` 的口）**：
  `TypedExprIrTypeContainsManagedStorage(ir, ctx.sourcePath, bindingType, hasManaged)`（`:48278-48290`）必须返回 true。
  理由见 §3：返回 false 时节点 exprClass = `TypedExprExprUnknown`（`:2965-2969`），而消费点把该列**原样**当
  ownership 传下去（`:5808`），`:6089 ownership <= Int32(TypedExprExprUnknown)` 必炸 `:6098`。
  类不可判就拒发模板，绝不让 Unknown 流到守卫。

**显式拒绝（一律返回 -1，旧判词原样保留，零弱化）**：Alias / Apply / Optional / Tuple / GenericParameter /
Scalar / Invalid；非本函数或非 `Declaration` 引入的声明行；同名声明行不唯一（hits≠1）；绑定注解 TypeSyntax 根缺失；
TypeId < 0；布局查询未命中或尺寸非正；托管存储类不可判；组坐标不联证（见下）。

**组坐标联证（模板自证"紧随其后的消费点必然命中同一组"）**：`valueExprTransactionDeclarationLocalGroupRows[declRow]`
必须落在本事务区间内、`valueDefinitionGroups_typedFunctionIndexes == ir.functions2_functionNameIds.len`
（与消费点 `:5805`、守卫 `:22301` 同一表达式）、`definitionRows == -1`、`consumedFlags == 0`。

### 语料四分类期望行为（父级静态扫描：241,911 处 / 3,491 文件）

| 类别 | 处数 | 补丁后的路径 | 期望 |
|---|---|---|---|
| 序列 `T[]` | 69,810 | `:29505` seq 臂给 `rhsNodeIndex` | 新臂**不可达**；产物**逐字节不变**，被改动即回归 |
| 内建标量 int32/uint32/int64/uint64/bool/str | 60,322 | `:29522-29563` 标量臂 | 同上，**逐字节不变**，被改动即回归 |
| 定长数组 `T[N]` | 609 | 两臂落空 → 新臂 | kind=FixedArray 且 n>0 且 (B)(C) 可判 ⇒ 消费组；否则 -1（旧判词保留） |
| 其余命名类型 | 111,100 | 落空 → 新臂 | kind=Object 且 (B)(C) 可判 ⇒ 消费组；标量别名/枚举/ref/别名/泛型参/未知 ⇒ -1 或本就在臂内 |

## 3. kd_r9f 实测回执与 v2 诊断（含对派单假设的证伪）

**观测**（本席回执）：`r8_fixed_len_named_const_main` / `r8_fixed_len_inline_arith_main` /
`r9_fixed_len_forward_const_main` / `r9_fixed_len_untyped_const_main` 四件正例上，v1 让组墙判词消失，
随后 `compile_rc=1`，`last: typed expr value definition: producer lacks exact type or ownership proof`（`:6098`）；
负例 `must be int32` 逐字不变。

**派单假设**（"NilPtr 在 fresh-Owned 清单 ⇒ 载体 exprClass=Owned，而聚合定义 ownership 应为 Unmanaged ⇒ 相等性判据 `:6093` 炸"）
**经静态复核不成立**，两条独立理由：

1. `:5798-5808` 消费点调用 `typedExprIrAppendValueDefinitionExact` 时，最后一个实参**就是**
   `ir.nodes2_exprClasses[definingTypedNodeIndex]`；`:6077` 把它存成 `ownership`。因此 `:6093` 的
   `ownership != Int32(ir.nodes2_exprClasses[definingTypedNodeIndex])` 是**同一列自比、恒真**，不可能是死因。
2. fresh-Owned 清单 `:2996` 只在 `hasManaged == true` 时才可达（`:2970-2971` 在非托管时已提前 return Unmanaged），
   所以"NilPtr ⇒ 一律 Owned"本身也不成立。

**真正死因**：`:6089 ownership <= Int32(TypedExprExprUnknown)`，即 `exprClass == Unknown`（`:6098`、`:19981` 两版树相同；
`:48049`/`:48087`/`:48245`/`:48275`/`:48278` 为当前 v1 已落树读数，锚点见各条函数名）：

```
:6555        AppendNode → typedExprNodeExprClassExact
:2964-2969   !TypedExprIrTypeContainsManagedStorage(...) ⇒ return TypedExprExprUnknown
:48278-48290 TypedExprIrTypeContainsManagedStorage → typedExprIrTypeContainsManagedStorageActive(:48049)
:48087-48090 定长数组分支建 fixedCtx 时【只设 sourcePath，不设 buildIndex】
:20009-20032 TypedExprIrFixedArrayTypeParts → TypedExprConstDimIntValue
:19981-19982 ctx.buildIndex == nil ⇒ 直接 return false        ← 符号维度在此必败
:48275       其余分支("int32[SlotCount]" 既非标量/Bytes/ref/指针, 别名与字段行均 miss) ⇒ return false
:48245       字段递归失败 ⇒ 整个类型查询 false
⇒ exprClass=Unknown ⇒ :5808 原样传成 ownership ⇒ :6089 炸 :6098
```

**与观测吻合的三条互证**：
1. 四件夹具的数组维度**全部是符号常量**（`SlotCount`、`SlotStep * 2`、`LateCount`、`UntypedCount`），
   而字面维度（`int32[4]`）不需要 build index、原代码即可解析 ⇒ 只有符号维度中招。
2. 字段类型文本由 parser receipt 原样存储（`TypedExprIrAppendTypeFieldLayout` `:45618` 归一、`:45703` 入列，
   且 `:45651` 用 receipt payload 逐字对拍 ⇒ **不可**在存储侧 canonicalize），
   所以递归看到的正是 `int32[SlotCount]`。
3. 姊妹点 `TypedExprIrLookupTypeLayout` 的常量上下文（当前树 `:47659-47661`）早就用
   `TypedExprSourceContextSetBorrowedBuildIndex(constCtx, ir.buildIndex)` **加上** `constCtx.sourcePath` 建常量上下文
   （其注释明说 symbolic fixed-array lengths such as `uint8[fixedBytes32Size]` 在这里也能解析到声明值），
   而托管存储查询漏了前半 ⇒ 是实现缺口，不是判据问题，更不是 `:6098` 该放宽。

**同型未修缺口（明确记录，不在本单）**：`typedExprIrVisitManagedStrFieldOffsetsActive:47819-47820` 有同款
`fixedCtx`（只设 sourcePath），影响"聚合内含 `str` 叶子且经符号维度定长数组"的枚举；与本单 `:6098` 无关，
是否同补 build index 应由托管聚合 drop 那条线单独定夺。

**v2 的两条对应动作**：① 把 (C) 变成模板准入条件（类不可判即拒发 ⇒ 旧判词，绝不让 Unknown 到 `:6098`）；
② 给该常量上下文补 borrowed build index（nil/released 时保持原样，不改行为、不 panic）。**`:6089-:6098` 一字未动。**

## 4. 补丁说明

文件与落树顺序：**v1 → v2，两版都受顶部"落树顺序约束"同一条款约束**（不得在 `kd_r9e` 之前落树）。

1. `patches/aggregate_zero_declaration_local_definition_group.patch`（**v1，已落树**）：仅
   `src/core/lang/typed_expr.cheng`，**2 hunk、+159/-0**。
   - hunk1：在 `typedExprIrAddNilZeroDeclarationLocalTemplate`（`:29361-29418`）之后新增
     `typedExprIrAddAggregateZeroDeclarationLocalTemplate`（判据 A/B + detached 载体构造）。
   - hunk2：消费点 `:29568-29575` 内，nil 臂返回 -1 时再试聚合臂；`stmt.rhsNodeIndex` 仍**不接**。
2. `patches/aggregate_zero_definition_group_v2_incremental.patch`（**v2，本次交付**）：仅
   `src/core/lang/typed_expr.cheng`，**2 hunk、+21/-0**，在 v1 已落树的当前树上 `git apply --check` exit 0。
   - hunk1（当前树第 29550 行后，+12 行）：模板内补 **(C)** 托管存储类可判门。
   - hunk2（当前树第 48087 行后，+9 行）：定长数组分支的常量上下文补
     `if ir.buildIndex != nil && !ir.buildIndex.released:` → `TypedExprSourceContextSetBorrowedBuildIndex(fixedCtx, ir.buildIndex)`
     （nil/released 保持原样：不改行为、不 panic）。
   - 判据零放宽：`:6089-:6098` 未动；`TypedExprConstDimIntValue` 既有的越界/非法表达式 panic 未动。
3. **对拍（本次自验，可复现）**：
   - `git apply --check patches/aggregate_zero_definition_group_v2_incremental.patch` → exit 0；
     在临时目录树副本上实放补丁后再与源文件做 `difflib.SequenceMatcher` 对拍：
     opcodes = `[('insert',29550,29550,29550,29562), ('insert',48087,48087,48099,48108)]`
     ⇒ **只有 2 处纯插入、共 21 行；0 删除 0 替换** ⇒ 补丁内所有上下文行与当前源文件**逐字节相同**。
   - v1 的载体构造行与消费点第二臂**本次一行未改**；v2 只在 v1 之上追加两段。

**载体节点形态 = 与 w24 逐列同款的 detached NilPtr 叶**：
`opKind=NilPtr` + `originParserNodeId=-1` + `syntheticOriginKind=Desugared` + `spanAuthorityKind=NoSource` +
`ownerStatementIndex=-1`（`AppendNode` 恒写 -1）、operands 全 -1、`funcRefCallDeclarationRow` 走结构体默认 -1、
`resultType=bindingType`、`resultStructuralTypeId=` 判据 (A) 的 arena TypeId（经 `typedExprIrBindNodeStructuralType`
`:4892-4914`，同时盖 managed/send/sync/proof 四列）。

**为什么不新增 op 种类**：detached 零值模板的指纹是三处跨模块审计的**既有放行臂**（§1 末），三处都按
`opKind==TypedExprIrOpNilPtr` 逐列比对。新增枚举成员会同时进入：`TypedExprIrOpKind`（`:157`）、op 文本表（`:2540+`）、
`TypedExprIrCountOpKind` 报表（`:13053+`）、frag codec 的 op 编码、三处放行臂、`typedExprNodeExprClassExact`
的 fresh-Owned 清单（`:2996`）——收益为零、风险面大。复用 NilPtr 后**上述所有面零改动**。

**审计怎么过（静态核对）**：
- value/share：`AppendNode` `:6555-6573` + `:6614-6627`。非托管聚合 → `exprClass=Unmanaged` → `share=None`/proof=`TypeTrait`；
  托管聚合 → `NilPtr` 已在 fresh-Owned 清单 `:2996` → `Owned` → `share=Local|ThreadSafe`。两条都完整。
- node authority replay（`compiler_csg.cheng:34139+`）：节点精确 TypeId **由 IR 自身 `resultStructuralTypeId` 采信**
  （`:34391-34398`，只校验在 TypeArena 域内）；`compilerCsgTypedNodeScalarKind`（`:33846-33916`）**不含 NilPtr** ⇒
  无标量交叉；proof/trait 联立 `:34729-34754`；ownership premise 按"托管⇒Owned/Borrowed、非托管⇒Unmanaged"
  `:34779-34819`，与上游 exprClass 一致；绑定写回 `:34930-35000`。
- seal：`TypedExprIrSealExactTypeArena:4808-4835` 要求 `valueDefinitions_exactTypeIds == nodes2_structuralTypeIds[defining]`，
  而 `typedExprIrAppendValueDefinitionExact:6078-6079` 正是由 defining 节点派生该值 ⇒ 自洽。
- 可达性：`typed_expr.cheng:3961-3969` 只审计 `ownerStatementIndex >= 0` 的节点，`owner=-1` 的 detached 载体豁免。
- ownership transport：`lowering_plan.cheng:6101-6122`（BindingInitializer 组坐标校验）+
  `:6207-6212`（托管⇒Owned/Borrowed、非托管⇒Unmanaged）+ `:6275-6296`（owner=-1 放行臂）全数满足。
- **后端逐字节不变**：`stmt.surfaceText=""`（`:29466`）、`stmt.rhsNodeIndex` 不接；后端 `bindingTargetDefinitionRow`
  的唯一读取点是 `new(T)` 文本臂（`primary_object_plan.cheng:23980-23991`），而该臂只在 `surfaceText != ""` 时可达
  （`:53458`）⇒ 裸声明的语句发射与今天逐字节相同，模板节点只被后续精确读当类型/证明模板复制。

### 托管聚合的预期行为（按判据 (C) 分类）

**行内 ownership 恒等于同一节点的 exprClass 列**（`:5808`），所以"托管与否"不再是 `:6093` 的风险来源，
而是两条都必须"类可判"的路径：

| 形态 | 类判定出处 | 走模板？ | ownership / 下游 |
|---|---|---|---|
| 字段全为标量 / 裸指针 / 字面维度定长数组 | 字段递归命中 `:48114-48122`，hasManaged=false | **走** | Unmanaged；transport 走非托管臂（`lowering_plan.cheng:6211-6212`）；**四件 r8/r9 夹具属此类** |
| 字段含 `str` / `T[]` / `seq[...]` | `:48064-48071` ⇒ hasManaged=true | **走** | Owned（NilPtr 在 fresh-Owned 清单 `:2996`）；transport 走托管臂（`:6207-6209`）；**drop 平衡未验证**（§6-3） |
| 字段含 `ref` / `ref object` | `:48135-48145` ⇒ hasManaged=true | **走**（声明类型是 Object；纯 `ref` 声明的 nil-able 家族仍由 w24 臂先手） | 同上 |
| 字段行缺失 / 字段元素类型不可解析 / owner 歧义 | 查询返回 false | **不走** → -1 | 旧判词保留：`:22146` 组墙 或 `:2810` 收尾组审计（fail-closed，不弱化） |
| 符号维度定长数组字段 | v2 前 false；v2 后按 `TypedExprConstDimIntValue` 的真实解析结果定 | v2 后**走**（常量解析不出/越界/非法表达式仍按既有 panic 或 -1） | 同第一行 |
| 泛型参数叶 / 别名 / Tuple / Optional / Apply | (A) 直接 -1 或非托管分支不适用 | **不走** | 旧判词保留 |

## 5. 验证计划

夹具（建议放 `docs/campaigns/2026-08-31-kernel-userpath/fixtures/`，本例仅给内容，本单未创建）：

- **已有实测（v1）**：`kd_r9f` 四件正例组墙消失，下一跳 `:6098`；负例 `must be int32` 逐字不变。
  **v2 期望**：`:6098` 消失，四件正例按本席裁决口径从 `rc=1` 转 `rc=0`，负例仍 `rc=2` 且判词逐字不变；
  四分类前两类产物逐字节不变。若 v2 后仍是 `:6098`，剩余腿只能是字段行缺失（见 §6-2），需另一线定夺。
- **F1 读→组墙（主判词）**：`Slots = struct { values: int32[4] }`；`fn main() -> int32` 内
  `var s: Slots` 后 `s.values[0] = 7`；`return s.values[0]`。期望：`:22146`
  `typed expr binding: exact local value-definition group unavailable` **消失**。
- **F2 不读→收尾组审计（区分"注册了但没被读"）**：同 F1 但删掉一切对 `s` 的读，只留 `return 0`。
  期望：`:2810` `typed expr value definition: function group was not consumed exactly once` **消失**。
  F1/F2 一起才能把"注册了没读"与"被读才炸"分开——静态语料扫描给不出这一层。
- **F3 符号维度定长数组（第三类，v2 主战场）**：直接复用四件 r8/r9 夹具
  （`SlotCount` / `SlotStep * 2` / `LateCount` / `UntypedCount`）。期望同"已有实测（v1）"行。
- **F4 nil-able 回归（wall24 家族）**：`Node = ref { v: int32 }` 上 `var n: Node` + 读；期望判词不变、行为不变
  （证明新臂没有抢走 nil 臂的路径）。
- **no-op 回归判据（必须项）**：① 只含序列/内建标量裸声明的程序（对应 69,810 + 60,322 两类），
  同一编译器、同一 flag、打补丁前后 `.o`/可执行文件 **`cmp` 逐字节相同**；② 既有夹具（如 `v6_direct1_repro.cheng`、
  `ordinary`、`call_fixture`）的 stderr 判词集合逐字不变（除本单目标判词消失外不得新增/漂移）；
  ③ 本补丁为纯新增，**若任何已工作程序出现新判词（哪怕只多一行），即视为回归**。
- **失败信号**（按出现顺序最可能先炸的判词）：`typed expr: node value/share authority is incomplete`(:6627) /
  `typed expr value definition: typed authority drift`(:4270) / `compiler csg: typed-node ... drift` /
  `lowering ownership transport: ...` / `primary body ir local binding: ...`。

## 6. 未测项（明确未验证）

1. **本席未编译、未烤机**：v1/v2 都只做 `git apply --check` + 字节对拍 + 静态推演；Cheng 语法未过编译器。
2. **v2 hunk2 的充分性**：静态链证明"符号维度 + 无 buildIndex ⇒ 查询失败"，但未实测 v2 后四件夹具是否真的越过
   `:6098`；若仍失败，剩余腿只能是**字段行缺失**（prescan 退化 size 与逐字段行不同源，见 `typed_expr.cheng:47392-47398`
   注释），那属定长数组线范围，本席未验证。
3. **托管聚合的 cleanup/drop 平衡**（本单最大未验证面）：值定义记 `Owned` 后是否新增 drop、
   drop 是否与"全零 = 空托管值"平衡，未验证。
4. **运行期行为**：未验证 `setMem` 的字节数、`s.values[0]` 的地址计算与零值语义。
5. 未覆盖形态（显式不处理，旧判词保留）：`var p: ptr`/`Slots*` 等指针与借用形、匿名结构、Tuple、Optional、
   类型别名、泛型参数叶、跨模块限定名的极端形态。
6. 未验证 `TypedExprIrLookupTypeLayout`/`TypedExprIrTypeContainsManagedStorage` 的额外查询对构建索引遥测
   （`queryLookupCount`）以外的任何产物有影响；已静态确认该计数器不被任何 CID/回执消费。v2 后每个聚合裸声明
   多两次查询（布局 + 托管类），性能影响未实测。
7. 同型未修缺口：`typedExprIrVisitManagedStrFieldOffsetsActive:47819-47820` 的 fixedCtx 同样只设 sourcePath，
   未修、未验证（见 §3 末）。

## 7. 可能误伤的形态 + 先暴露的判词

| 形态 | 机理 | 先在哪条判词暴露 |
|---|---|---|
| 托管聚合（含 `str`/`T[]`/`ref` 字段） | 值定义 ownership=Owned，cleanup/ownership 可能新增 drop | `lowering ownership transport: managed ownership class drift`(`lowering_plan.cheng:6218`) 或 cleanup 域 panic；若编译期不炸则运行期 drop 崩溃 |
| 含引用字段聚合 | 同上（managed 判定由物理类型决定，`compiler_csg.cheng:34799-34808`） | 同上 |
| 定长数组维度解不出 | 判据 (A)/(B)/(C) 任一 -1 | 旧判词 `... exact local value-definition group unavailable`(:22146) 或收尾组审计(:2810) **仍在**（fail-closed，不是新伤） |
| 符号维度但类/布局查询不可判（v2 前实测形态） | v2 前 (C) 不在判据内 ⇒ Unknown 流到 `:6089` | `typed expr value definition: producer lacks exact type or ownership proof`(:6098)；v2 后此形态改走 -1 → 旧判词 |
| 维度可解但后端 size 退化（`typed_expr.cheng:47392-47398` 注释的 dedup-suppress 退化 size） | 零填只覆盖退化后的字节数 | 编译期可能静默；qualified 名会先撞 `defectB_aggr_addr` poison 门（`primary_object_plan.cheng:52984-53000`） |
| 带 `defer` 的裸声明 | 模板 owner=-1 与 defer 作用域机器正交；defer 套件内再读该局部走同一精确读路径 | 若 defer 侧另有 owner 假设，先炸 `typed expr: statement root owner drift`(`:3833`) 或 normalized scope 域判词 |
| `for` 模式绑定 | `IntroductionKind=PatternIterator`（`parser.cheng:469`）不注册 decl-local 组 | **不可达**（本补丁不涉及） |
| 模块/全局裸声明 | 注册过滤要求 `ParserDeclarationLocal` + 本 parser 函数行（`:5625-5639`） | **不可达** |
| 同函数同名遮蔽（两个 `var s: Slots`） | 声明行扫描 hits≠1 → -1 | 旧判词（消费点同款 `declaration-local identity is not unique` `:5771`） |
| 空结构体 `struct {}` | kind=Object 会命中，但后端布局 `fieldCount==0` 不进 `:5126` 分支 | 可能落到 8B 指针槽（编译期不报）；属已知低危形态，建议落树后单独核 |
| 泛型参数叶 `var x: T` | arena kind=`GenericParameter` | 判据 (A) -1，行为不变 |
| 含 `str` 叶子且经符号维度定长数组的聚合（drop 枚举） | `typedExprIrVisitManagedStrFieldOffsetsActive:47819-47820` 同款缺 build index | 该线自己的判词（本单未修、未验证） |

## 8. 复现本说明的读点（供复核）

`sed -n '22100,22160p;2750,2812p;2930,3010p;3960,3975p;4200,4275p;4780,4840p;5380,5830p;6000,6100p;61500,61540p;62030,62090p;29340,29590p' src/core/lang/typed_expr.cheng`
（nil 臂、消费点、注册点、exprClass 生产、`(:6089,:6098)` 守卫、判据所用 API）；
托管存储/常量解析链：`sed -n '19960,20035p;47780,47830p;48040,48290p;48290,48310p;47485,47560p' src/core/lang/typed_expr.cheng`；后端：
`sed -n '4750,4830p;5010,5140p;5690,5745p;6990,7020p;17890,17945p;52960,53010p;53420,53460p' src/core/backend/primary_object_plan.cheng`；
镜像臂：`typed_expr_frag_codec.cheng:1755-1790`、`lowering_plan.cheng:6100-6130,6240,6300`。
