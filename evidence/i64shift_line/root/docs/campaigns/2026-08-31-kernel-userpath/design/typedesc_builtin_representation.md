# `typedesc` 内建类型的 arena 表示 — 判定与诊断

战役：`2026-08-31-kernel-userpath`（逐源驱动 / TypeArena resolution authority）
判词现场：`.rebuild/s1b_step3/r9/fixtures_r13.txt:13`、`.rebuild/s1b_step3/r9/repro_btypes_r9.stderr.txt:94`
基线：**当前工作树**（含已落地的 `patches/ptr_builtin_type_arena_representation.patch`，故 `typed_expr_type_arena.cheng:48/:1045` 已有 `ScalarPtr`）
本轮交付：**只有诊断，不交补丁**（理由见 §7 与文末附节）

---

## 0. 结论先行

1. **判定：`typedesc` 必须建成"带实参的内建构造器"（走 bracket-apply 路径），不能建成标量。**
   三方证据互证（§2）：C 链把 `typedesc[T]` 建成 **APPLY 节点（基 = `typedesc` 的 builtin scalar 节点，实参 = `T` 的节点）**（`bootstrap/cheng_cold.c:78297-78310`、`:78349-78408`）；C 链的开放泛型占位判据**要求该 formal 的类型文本引用声明的泛型 binder**（`bootstrap/cheng_cold.c:57980-57986`）；仓内 4 处真实用法**全部**带 `[T]`、零处裸 `typedesc`（`grep -rn typedesc src --include=*.cheng`）。

2. **纯 `ptr` 镜像（6 文件 / +29−10 的逐点同构）不是"不够好"，而是可证伪的错法。**
   即便把 `"typedesc"` 加进 `typedExprTypeArenaScalarKind`，`typedesc[T]` 的**父行**是 `ParserTypeSyntaxBracketApply`；该分支在基行没有权威行时必然落进定长数组回退，并在 `src/core/lang/typed_expr_type_arena.cheng:7592` 硬失败。推演见 §2.4，**对 children 个数这一未测事实稳健**。

3. 不能照抄的根因：`ptr` 在仓内是**无参内建标量**，arena 早有"标量拼写 → 内联 Scalar 行、不进解析权威表"的既有通道（`:1808-1817` 物化快径 + `:4968-4970`/`:3619-3621` 权威过滤），`ptr` 补丁只是把 `"ptr"` 接进这条**已存在**的通道。`typedesc` 出现在**头位**且带实参，arena **没有**任何"builtin 基 + 实参"的通道 —— 这是新增机制，不是补一个 arm。

4. **忠实修法必须同时动可移植 schema 与快照投影**：`TypedExprStructuralTypeApply` 在严格校验里属 `symbolic`（需 `symbolId >= 0`：symbolic 集合 `:10031-10035`、判据 `:10047-10048`），而快照投影 `compiler_snapshot_builder.cheng:13799-13819` 的第一件事就是读 `symbolIds[typeId] >= 0`（`:13815-13819`），否则 `missingDeclarationIdentityCount++` ⇒ `admissionBlocked`（调用点 `:13953-13964`）。**只修 arena 必然把墙从"名字解析"挪到"快照 admission"，判词换句、rc 仍非 0。**

5. **规范面缺证（诚实项）**：`docs/cheng-formal-spec.md` 里 `typedesc` **0 命中**（`grep -c -i typedesc` = 0）。规范只把 `cstring/utf8_view/bytes_view/owned_cstring/str` 列为内建（`:559-563`、`:598`），没有 `typedesc` 的任何 BNF 或语义定义。⇒ **这个判定不能靠规范，只能靠 C 链 + 真实用法**；同时意味着"把 `typedesc` 建成标量"在规范上并不被禁止，禁止它的是结构事实（§2.4）。

6. **静态不可判的是"选型 A 还是 B"**（把 `TypeApply` 放宽到 builtin 基／新增一个 `TypedExprStructuralTypeKind`），不是判定本身。两者都要新增可移植 schema 序数并改快照投影；哪一条不会在 `csgCompilerTypeKindValid` / `type trait conclusion mismatch` / `invalid type CID row` 处翻车，**必须靠一次编译往返**，靠静态读码给不出。§6 给出该读数的确切形式。

---

## 1. Q1：内建类型名在**哪一处**被识别并赋予种类

### 1.1 全仓唯一的"内建拼写 → 内建种类"识别点

| 事实 | 位置 |
|---|---|
| 唯一识别函数 | `src/core/lang/typed_expr_type_arena.cheng:1023-1046` `typedExprTypeArenaScalarKind(text) -> TypedExprStructuralScalarKind` |
| 它是一张**封闭拼写表**（void/bool/char/int/uint/int8…uint64/float32/float64/str/cstring/ptr），未知一律 `TypedExprStructuralScalarInvalid` | 同上 `:1024-1046`（`ptr` 的 arm 在 `:1045`） |
| 种类枚举本体 | `:29-48` `TypedExprStructuralScalarKind`（`Ptr` 是 `:48`，追加在末尾） |
| 保留标量域（种子行）查询 | `:10473` 调 `typedExprTypeArenaScalarKind`，出口是两个 `TypedExprTypeArenaReservedScalarTypeId*`（拒绝 `Int`/`UInt`/`Ptr`） |

**三个调用点——这就是"识别并赋予种类"的全部落点：**

| # | 调用点 | 作用 |
|---|---|---|
| 1 | `typed_expr_type_arena.cheng:1805`（在 `typedExprTypeArenaResolveNominal` 内），命中分支 `:1808-1817` | **物化相**：`parserKind == Nominal && scalarKind != Invalid` ⇒ 直接 `Intern(TypeScalar, scalarKind, symbolId=-1, …)`，**不需要任何声明权威** |
| 2 | `typed_expr_type_arena.cheng:4968-4970`（索引版解析权威构建） | **权威相**：命中即 `continue` ⇒ 该 nominal 行**不进** `typeSyntaxNodeIndexes/declarationRoot…` 表，因此永远不会走到 `:4987` 的去限定名解析 |
| 3 | `typed_expr_type_arena.cheng:3619-3621`（树版孪生，逐字同构） | 同上，另一条驱动路径 |

**这条契约是写死的、不是绕过**：严格校验 `:9045-9063` 的 `nominalRequiresResolution` 明确把"structural kind 是 `TypeScalar` 或 `GenericParameter` 的 nominal 行"排除在"必须持有解析回执"之外 —— 即"标量拼写的 nominal 不需要解析回执"。

### 1.2 `ptr` 为什么原先没有、后来怎么有的

- **原先没有**：`typedExprTypeArenaScalarKind` 没有 `"ptr"` arm ⇒ 返回 `Invalid` ⇒ 调用点 2/3 **不** `continue` ⇒ 走到 `:4987` `typedExprTypeAuthorityIndexResolveUnqualifiedInto(..., "ptr", ...)` ⇒ 失败 ⇒ `:5020-5021` 打出判词 `nominal declaration is not visible … name=ptr`。
- **后来有了**：`patches/ptr_builtin_type_arena_representation.patch`（6 文件 / +29 −10）做的是"接进既存通道"，不是新增通道：
  1. `:48` 追加枚举成员 `TypedExprStructuralScalarPtr`；
  2. `:1045` 追加 `if text == "ptr": return TypedExprStructuralScalarPtr`；
  3. 于是调用点 1/2/3 **自动**生效（无需改它们）；
  4. 剩下 5 个文件是把新种类**投影出去**的镜像：`compiler_csg.cheng:12568-12570`（8/8 布局）、`canonical_type_chain.cheng:126-128`（→`LocalPtrTag`）、`compiler_snapshot_schema.cheng:139`（`CsgCompilerScalarPtr=16`）`:5192`（`csgCompilerScalarKindValid` 上界）`:5876-5878`（Send/Sync 镜像）、`compiler_snapshot_builder.cheng:14054-14055`（scalar→schema 序数）`:14076`（规范文本 `"ptr"`）、`exact_def_freeze.cheng:786-788`（定长数组地址叶）。

### 1.3 `typedesc` 现在**确切缺哪几步**

| # | 步骤 | `ptr` 的落点 | `typedesc` 现状 | 是否"缺" |
|---|---|---|---|---|
| 1 | 拼写识别 | `:1045` | `typedExprTypeArenaScalarKind("typedesc")` = `Invalid`（`:1024-1046` 无 arm） | **缺** |
| 2 | 种类枚举成员 | `:48` | 无 `ScalarTypedesc` | **缺** |
| 3 | 权威相过滤生效 | 自动（`:4968-4970`/`:3619-3621`） | 未生效 ⇒ 落到 `:4987-5021` 报 `name_not_visible`（**当前判词**） | 依赖 1 |
| 4 | 物化相内联 Scalar 行 | 自动（`:1808-1817`） | 未生效 | 依赖 1 |
| 5 | 哈希材质（枚举序数进 type hash 与列） | 自动（`:1057-1079` 的 `typedExprTypeArenaTypeHash` 吃 `Int32(scalarKind)`；列进 artifact `:933-934`） | 未参与（根本无行） | 依赖 1 |
| 6 | arena→schema 序数映射 | `compiler_snapshot_builder.cheng:14054-14055` | 无 | **缺** |
| 7 | 规范文本投影 | `compiler_snapshot_builder.cheng:14076` | 无 | **缺** |
| 8 | schema 常量 + 合法性上界 | `compiler_snapshot_schema.cheng:139`、`:5190-5192` | 无 | **缺** |
| 9 | Send/Sync 可移植镜像 | `compiler_snapshot_schema.cheng:5876-5878` | 无 | **缺** |
| 10 | 布局 / 后端 tag / 地址叶谓词 | `compiler_csg.cheng:12568-12570`、`canonical_type_chain.cheng:126-128`、`exact_def_freeze.cheng:786-788` | 无 | **缺** |
| 11 | **头位 bracket-apply** | `ptr` 不涉及（`ptr[T]` 规范禁用、仓内零用例） | `typedesc` **只**出现在头位 | **额外缺口，且是决定性的**（§2.4） |

---

## 2. Q2：标量 vs 构造器 —— 三方证据

### 2.1 规范面 `docs/cheng-formal-spec.md`（**缺证**，但间接含义明确）

- `grep -c -i typedesc docs/cheng-formal-spec.md` = **0**。规范没有 `typedesc` 的类型定义、BNF 或语义段落；对照之下 `cstring/utf8_view/bytes_view/owned_cstring` 在 `:559-563`、`:598` 有明确条目。
- 与本案相关的**仅有**两条：
  - `:518-527` **隐式类型参数**：例程头部省略 `typeParamList` 时，参数类型或返回类型里出现的自由单字母大写标识符（`T`/`U`/…）按签名从左到右补全成类型参数列表。⇒ `typedesc[T]` 里的 `T` 就是**该声明的 binder**。
  - `:531-536` **显式类型实参与缺省实参**：`typeParam ::= ident [":" typeExpr] ["=" typeExpr]`，"两者都由 parser-owned `TypeSyntax` 与精确 `genericSymbolId` 解析，**不得按名字或源码文本重建**"；`:532` "泛型 Apply 的显式类型实参按声明顺序绑定"。
- **规范的间接推论**：`typedesc[T]` 的 `[T]` 处于**泛型 Apply 的实参位**。把头 `typedesc` 降格成标量、把 `[T]` 丢掉，等于把一条规范明令"必须由精确 `genericSymbolId` 解析、不得按文本重建"的实参**丢弃**，与 `:531` 直接抵触。
- ⇒ 规范面对"是标量还是构造器"**不给正面定义**，但**不与"构造器"冲突、与"标量丢弃实参"冲突**。

### 2.2 C 链面 `bootstrap/cheng_cold.c`（**决定性**）

| 事实 | 证据（逐字） |
|---|---|
| `typedesc` 是**一等内建身份名**（裸拼写得 tag 23） | `bootstrap/cheng_cold.c:76196-76212`，`names[]` 末项 `"typedesc"` 在 `:76204`，`return i + 1` 于 `:76211` |
| 裸内建名投影成 `COLD_TYPE_IDENTITY_SCALAR` 节点 | `:78567-78574` |
| **泛型实例先拆 base/args** | `cold_type_parse_generic_instance` `:28067-28080`（首个 `[` 切分，base 非空、args 非空） |
| **基名无 nominal 声明时，C 链不丢方括号，而是建 APPLY 节点，child[0] = 该基名的 builtin scalar 节点** | `:78297-78310`（`base_object_row` 取 `cold_type_identity_nominal_object_row_readonly`，`NOMINAL_NOT_FOUND` 分支在 `:78304-78310` 递归 `build_visit(graph, base, …)` → 命中 `:78567` 的 builtin 分支） |
| 实参逐个成为 APPLY 的 child[1..] | `:78349-78408`（`application_arg_types[arg]` → `children[arg + 1]`） |
| 该 APPLY 的 `exact_type_id` 为 `-1`（无 ABI 身份，但有**结构身份**） | `:78418-78437`（`applied_object_row >= 0 ? … : -1`） |
| `set[T]`（同族"无声明的内建构造器"）甚至拿到**专属身份种类** | `:78077-78102`、`:78268-78291` → `COLD_TYPE_IDENTITY_SET`，枚举在 `bootstrap/cold_type_identity_contract.h:24`（`=14`） |
| **开放泛型占位把 `typedesc[T]` 与 `T`/`T[]`/`Container[T]` 归为同一类：ABI 依赖声明 binder 的 formal** | 注释 `:57852-57861`（逐字：`T/T[]/Container[T]/typedesc[T] is not reclassified as unmanaged merely because its TypeId is still open`） |
| 该类 formal 的准入**要求类型文本引用声明的 binder 名** | `:57980-57986`（`!cold_type_references_generic_names(function->param_type[formal], function->generic_names, function->generic_count)` 即 `return false`） |
| 裸 `typedesc` 也在 ABI 内建身份表里 | `bootstrap/cold_parser.c:717-736`，`:730` `span_eq(type, "typedesc")` |

**C 链的净结论**：`typedesc[T]` = **APPLY(基 = `typedesc` 的 SCALAR 内建节点, 实参 = `T` 的节点)**；实参进入结构身份。若把它折成裸标量，`:57980-57986` 的"类型文本必须引用 binder"判据会对 `newException` 的 `t` **直接不成立** ⇒ C 链自身语义自相矛盾。**这一条单独就足以否掉标量方案。**

### 2.3 仓内真实用法（`src/std/system.cheng:2723` 等）

`grep -rn typedesc src --include=*.cheng` 全量 4 处，**全部带 `[T]`**，**零处裸 `typedesc`**：

| 位置 | 逐字 | 说明 |
|---|---|---|
| `src/std/system.cheng:2723` | `fn newException(t: typedesc[T], message: str): T =` | `T` 是隐式 binder（规范 `:520-527`）；body `:2724` 是裸 `t` 语句、`:2725` 是裸 `message` 语句 ⇒ `t` **只被丢弃** |
| `src/core/option.cheng:14` | `fn none[T](t: typedesc[T]): Option[T] =` | 显式 `[T]`；body `:15` 裸 `t` 丢弃 |
| `src/runtime/option.cheng:18` | `fn none[T](_: typedesc[T]): Option[T] =` | 实参名写作 `_`，**连名字都不需要** |
| `src/tests/cold_open_generic_formal_authority_smoke.cheng:6` | `fn coldOpenGenericTypedescAuthority[T](t: typedesc[T]): int32 =` | body `:7` 裸 `t` 丢弃 |

**推论**：`typedesc[T]` 是**类型见证（type witness）**——它的**值**在所有用例里立即被丢弃（值语义可擦除），但它的**类型**必须携带 `T`（否则 `none[int32]` 与 `none[str]` 无法区分，C 链 `:78349-78408` 也正是在为实参建 child）。

⇒ **判定：构造器（带参）**，判据结构与语义，不依赖 `typedesc` 的物理布局。**顺带**：物理布局/ABI 宽度在 C 链里**没有专门裁定**（`cold_param_kind_from_type` `bootstrap/cold_parser.c:5385-5453` 的 `"typedesc[T]"` 会一路落到 `:5453` 的 `return 'i'` 默认值）⇒ **任何"`typedesc` 是 4 字节"之类的物理断言都是把 C 链的默认值当语义，本次不采信**，这也是 §6 未判项之一。

### 2.4 纯标量路线**可证伪**（本节是"不许照抄"的硬论证）

若只做 `ptr` 的 6 文件逐点镜像（把 `"typedesc"` 加进 `:1045`）：

1. **头行物化成功**：`typedesc` nominal 行走 `:1808-1817`，得到内联 `TypeScalar` 行、真实 TypeId。这一步没问题。
2. **父行是 `BracketApply`**：本次判词的 `type_syntax_row=1352 root_row=1354 root_generic_count=1`（`.rebuild/s1b_step3/r9/fixtures_r13.txt:13`）与 parser 的"参数类型根镜像声明泛型窗口"机制一致 —— `ParserValueExprTypeSyntaxSetGenericSymbols(tree, fieldRoot, ownerStart, ownerCount)`（`src/core/lang/parser.cheng:17738-17760` 定义，`:23930-23945` 字段/参数根调用），镜像窗口里那 1 个符号就是 binder `T`。⇒ `1354` 是 `typedesc[T]` 子树的根，`1352` 是它的头 nominal 子行。
3. **物化走 `:7502-7601` 的 `BracketApply` 分支**：
   - `authorityRow = typedExprTypeArenaAuthorityRow(state, baseTypeSyntaxNode)`（`:7509-7510`）。标量头**没有**权威行（被 `:4968-4970` 过滤掉了）⇒ `authorityRow < 0`；
   - `if authorityRow >= 0:`（`:7512`）不成立 ⇒ `genericApplied` 保持 `false`（`:7511`），走到 `if !genericApplied:`（`:7589`）；
   - 回退要求 `children.len != 1 || fixedLength <= 0` 为假，即**同时**要 `children.len == 1` **且** `fixedLength > 0`（`:7591`）；
   - `fixedLength = state.bracketConstLengths[typeSyntaxNodeIndex]`（`:7590`），该列只在"**单个** bracket 实参 **且** 该实参是**类型节点为空的正 int32 常量表达式**"时才被填 —— 见 `typedExprTypeArenaBracketConstLength`（`:1947-1965`：要求 `BracketArgCountAt == 1`、`BracketArgTypeNodeAt < 0`、const 求值 `> 0`）与填充点 `typedExprTypeArenaMaterializeBracketConstLengths`（`:1973-1991`）。
   - `typedesc[T]` 的实参是**类型节点**（`T`），`BracketArgTypeNodeAt >= 0` ⇒ `typedExprTypeArenaBracketConstLength` 必返 false ⇒ `fixedLength` 保持初值 `<= 0`。
4. ⇒ **无论 `children.len` 是 1 还是 2，判据 `:7591` 都成立**（`children.len != 1` 真，或 `fixedLength <= 0` 真），必然在 **`:7592`** 打出
   `typed expr type arena: bracket apply authority incomplete; exact generic SymbolId or bounded const AST required`。

**所以纯标量镜像把一句"名字解析"判词换成一句"形状"判词，夹具 rc 仍非 0。** 这不是"修得不够"，是方向错。

（同族印证：preflight 侧的孪生回退在 `:2087-2090`，同一条件。）

---

## 3. Q3：若判定为构造器 —— 实参如何参与身份/哈希 + "无关输入逐位不变"怎么保证

### 3.1 实参参与 arena 身份（TypeId）与哈希的确切机制

| 环节 | 机制 | 位置 |
|---|---|---|
| intern 入口 | `typedExprTypeArenaIntern(state, out, originTypeSyntaxNodeIndex, kind, scalarKind, symbolId, genericSymbolId, fixedLength, functionParamCount, baseTypeSyntaxNodeIndex, baseTypeId, children, childNameIds, typeIdOut, err)` | `:1129-1144` |
| 哈希材质 | `typedExprTypeArenaTypeHash(kind, scalarKind, symbolId, genericSymbolId, fixedLength, functionParamCount, baseTypeId, children, childNameIds)`：`children` **逐个** `typedExprTypeArenaHashStep` 进哈希 | `:1057-1079`（调用点 `:1160`） |
| 结构相等 | bucket 选择 + 逐列精确比较（哈希只选桶，不判等） | `:1160` 之后 |
| 列落盘 | `kind/scalarKind/symbolId/childStarts/childCounts/childTypeIds/…` 全列进 artifact 缓冲（`typeKinds` `:933`、`scalarKinds` `:934`、`symbolIds` `:935`） | `:812-1019` |
| **身份结论** | 只要 `typedesc[T]` 建成"基 + 实参"的多子节点，`typedesc[int32]` 与 `typedesc[str]` 的 `children` 不同 ⇒ **哈希不同 ⇒ TypeId 不同**；反之折成无子标量则两者**撞成同一个 TypeId**（身份谎言，违反"禁止用名字/文本当身份键"的逆命题：也用不着实参当身份键了） |

### 3.2 三种候选表示与各自代价（**选型 A/B 静态不可判，见 §0.5**）

**先排除一条**：

- **不可行：给 `typedesc` 造一个 builtin `SymbolId`。** `TypeApply` 在严格校验里属 `symbolic`（`:10031-10035` 定义 symbolic 集合，`:10047-10048` 判 `symbolic && (symbolId < 0 || symbolId >= value.symbolCount)` ⇒ 报 `structural payload invalid`），而快照投影 `compiler_snapshot_builder.cheng:13799-13819` 第一件事就是 `symbolIds[typeId] >= 0`（`:13815-13819`）。要让 `symbolId` 合法就得往符号域塞一个内建符号，但：
  - `symbolCount` **进 artifact 哈希**（`typed_expr_type_arena.cheng:830` `typedExprTypeArenaAppendI32(buf, value.symbolCount)`）；
  - 符号域是**sealed 声明索引**导出的稠密域：`state.symbolByDeclarationRoot` 由 `declarationSymbolGlobalRoots` 播种（`:5168-5187`），seal 相把 `value.symbolCount` 与 `declarationSymbolTotal` 对账（注释 `:372-374`）。
  ⇒ 加一个内建符号要么**位移/改变全部 arena 的 `symbolCount` ⇒ 全部 artifact CID 变**（违反战役硬约束），要么**打破 seal 对账**。两条都 disqualifying。

**选型 A：把 `TypeApply` 放宽到"builtin 基"（`symbolId == -1`、`children[0]` 是 Scalar 行）**
- 落点：`:10047-10048` 的 `symbolic` 判据开一条窄口（仅当 `kind == Apply && children[0]` 行的 `typeKinds == Scalar`）、`:7502-7601` 的 `BracketApply` 分支在 `authorityRow < 0` 时增加"基行是内建构造器标量 ⇒ 按 arity 1 建 Apply"的通道、trait 规则沿用既有的 `TypedExprTypeTraitRuleGenericApplication`（`:1252-1262` 从 `children[0]` 取 managed/send/sync —— 对标量基天然可用）。
- **代价**：可移植 schema（`compiler_snapshot_schema.cheng:110-122` 的 `CsgCompilerType*` 1..13）里 `CsgCompilerTypeApply` 的 `declSymbolId` 已经是"可选符号"语义（`csgCompilerTypeCidAppendOptionalSymbol`，`:5389` 起），**理论上**可以表达 `-1`；但 `compilerSnapshotBuilderTypeProjectionNominalHeadJoinInto`（`:13799-13819`）**强制要求**有声明符号。⇒ 必须为"无声明头的 Apply"增一条投影分支 + 决定它在可移植层是复用 `CsgCompilerTypeApply` 还是新增序数。
- **未判点**：该形态的 **layout**（`compilerCsgExactScalarLayoutInto` `compiler_csg.cheng:12568-12570`）、**后端 tag**（`canonical_type_chain.cheng:126-128`）、**Send/Sync 取值**都必须跟着裁定；C 链在这三处**没有**可比对的权威（布局只有 `cold_param_kind_from_type` 的 `'i'` 默认值），**任何取值都是新裁定**，不能自称"镜像"。

**选型 B：新增 `TypedExprStructuralTypeKind` 成员（如 `TypedExprStructuralTypeTypeDescriptor`，1 子、无符号）**
- 语义上最直白：`TypeDescriptor[T]`，`symbolId = -1`（`!symbolic` 判据 `:10049` 要求如此），`unary` 列表（`:10026-10030`）加它即满足 `childCount == 1`（判据 `:10044`）。
- **代价**：`TypedExprStructuralType*` 是 layout / BodyIR / 快照 / 后端的**主分派面**。`ptr` 文档 §2.2 已量化过：`TypedExprStructuralType*` 全仓 **303 处**、`ScalarKind` 不足 40 处。选型 B 需要逐个核对的分派点（`grep -n TypedExprStructuralType` 的实际命中）至少包括：
  `typed_expr_type_arena.cheng:1252`（trait 规则）、`:10038-10102`（严格校验）、`:6117`（syntax→semantic 映射）、`:8718-8724`、`:9098`、`:10012-10102`；`compiler_snapshot_builder.cheng:13943`；`compiler_csg.cheng:12640/12904/12924/13129/34529/35061`；`canonical_type_chain.cheng:61`；`exact_def_freeze.cheng:753`；`exact_def_derive.cheng:95`；`managed_lvalue_replace.cheng:851`；`typed_expr.cheng:7714/21037/25226`。
- 同样需要新增可移植 schema 序数（现 1..13，上界判定 `csgCompilerTypeKindValid:5186-5188`，末值 `CsgCompilerTypeGenericParameter=13`）+ 投影分支 + 布局 + 后端 tag。

**选型 C（明确否决）：把 `typedesc[T]` 折成 `T`（实参即身份，头被擦除）**
- 与 C 链 `:78297-78310`/`:78349-78408` 的 APPLY 节点直接矛盾（那里 `typedesc` 自己是一个 child，不是被擦掉）。
- 且会让 `typedesc[int32]` ≡ `int32`，与 `:78418-78437`（该 APPLY 的 `exact_type_id = -1`，"无 ABI 身份"）不一致。

### 3.3 "不含该形态的输入必须逐位不变"怎么保证

| 约束 | 做法 | 依据 |
|---|---|---|
| 枚举序数零位移 | 新 `TypedExprStructuralScalarKind` / 新 `TypedExprStructuralTypeKind` / 新 `CsgCompilerScalar*` / 新 `CsgCompilerType*` **一律追加在末尾** | 既有成员的 `Int32(...)` 值不变 ⇒ 哈希材质不变（`:1057-1079`、`:933-934`） |
| `typeCount` 零位移 | **绝不建种子行**（不改 `typedExprTypeArenaSeedSemanticScalarRows` `:1566-1596` / `AllocateFromLimitsInto`） ⇒ 不出现该形态的 arena 行数不变 | `ptr` 文档 §2.1/§2.3 的同一论证；`typeCount` 进 artifact 哈希 `:829` |
| 只影响真正用到的 arena | 走**按需 intern**（同 `int`/`uint`/`ptr` 的先例） | `:1808-1817` |
| 可移植 Type 表零位移 | 追加常量不改既有 1..15 的字节；`csgCompilerScalarKindValid` 上界只放行**新成员**一个值 | `compiler_snapshot_schema.cheng:5190-5192`；`ptr` 先例 |
| 规范文本池 | 新增 `"typedesc"` 条目；既有文本条目不移动（且 `:6036` 注释明确 Type identity excludes canonicalTextIds） | `compiler_snapshot_schema.cheng` |
| 唯一被移动的边界 | 若走标量侧，`csgCompilerScalarKindValid` 上界 `CsgCompilerScalarPtr(16)` → 新值（函数体 `:5190-5192`）；若走 TypeKind 侧，**同形上界确实存在**：`csgCompilerTypeKindValid:5186-5188` 的上界是 `CsgCompilerTypeGenericParameter(13)`，必须一起抬到新序数 | 需在落地时先 `grep` 出**全部**以这些常量为上界的区间判定，逐个确认只放行新值 |

---

## 4. 与 `ptr` 补丁的逐点对照表

`patches/ptr_builtin_type_arena_representation.patch`：6 文件 / +29 −10（`git apply --stat`）。

| # | `ptr` 补丁写入点 | `typedesc` 是否对应 | 原因 |
|---|---|---|---|
| 1 | `typed_expr_type_arena.cheng:48` 追加 `TypedExprStructuralScalarPtr` | **不对应** | `ptr` 是无参标量；`typedesc` 出现在**头位**且带实参（§2.3）。若照抄成 `ScalarTypedesc` 单成员，头行能物化（`:1808-1817`）但父 `BracketApply` 必然死在 `:7592`（§2.4）。**可以照抄的只有"末尾追加枚举成员"这一形式，不是它的语义。** |
| 2 | `typed_expr_type_arena.cheng:1045` `if text == "ptr": return …` | **部分对应** | "封闭拼写表加一条"这个动作本身同构；但 `typedesc` 若也在此返回一个**标量种类**，就把一个带参构造器降格成无参标量 ⇒ 语义错。若要保留"裸 `typedesc` 也有身份"（C 链 `:76199-76205` 给了 tag 23），这条应该**同时**存在（基节点身份），但**不能只看这条**。 |
| 3 | `typed_expr_type_arena.cheng` authority 过滤自动生效（`:4968-4970`/`:3619-3621` 无需改） | **不对应** | 标量头确实会被过滤（好事），但 `typedesc` 的头行**不是**需要解析的那一行的问题所在 —— 它的父行 `BracketApply` 需要一条 arena **从未有过**的"builtin 基 + 实参"通道。`ptr` 没有父行，所以 `ptr` 补丁从头到尾没碰过 `:7502-7601`。 |
| 4 | `typed_expr_type_arena.cheng:1183-1187`（intern 的 send/sync 排除 `Ptr`）、`:1633`（重算同判）、`:10454/:10477`（两个 reserved 标量查询显式排除） | **不对应** | 这三处都在处理"内建标量的 Send/Sync 与保留域"。`typedesc` 的对应问题不是"它是哪种标量"，而是"它作为一个 **Apply** 的 managed/send/sync 从**基**继承"（`:1252-1262` 已有 `GenericApplication` 规则），以及 `typedesc[T]` 这个 Apply 行本身的 trait 裁定。可复用的是**规则**，不是这三处编辑。 |
| 5 | `compiler_csg.cheng:12568-12570`（`Ptr` 归 8/8 标量布局） | **不对应** | `ptr` 的布局有 C 链铁证（`bootstrap/cold_parser.c:37464-37467` 8 字节）。`typedesc`/`typedesc[T]` 的布局在 C 链里**只有默认值**（`bootstrap/cold_parser.c:5385-5453`，`"typedesc[T]"` 落到 `:5453` `return 'i'`）⇒ 没有可比对的权威，**必须先裁定**（§6）。 |
| 6 | `canonical_type_chain.cheng:126-128`（`Ptr` → `LocalPtrTag`） | **不对应** | 同 5：`ptr` 有 `SLOT_OPAQUE` 的 C 链对应（`bootstrap/cheng_cold.c:30476`、`bootstrap/cold_parser.c:5447`）；`typedesc[T]` 没有对应的 coreir tag 权威。 |
| 7 | `compiler_snapshot_schema.cheng:139` `CsgCompilerScalarPtr=16` + `:5190-5192` 上界 | **部分对应** | "追加末尾常量 + 把合法性上界移到新值"这个形式同构、且必须做。但如果 `typedesc[T]` 走的是**新的 TypeKind**（选型 B），追加的应该是 `CsgCompilerType*` 的下一个序数（现 1..13 至 `CsgCompilerTypeGenericParameter=13`），并对应它的上界 —— **位置和常量族都不同**。 |
| 8 | `compiler_snapshot_schema.cheng:5876-5878`（Send/Sync 镜像排除 `Ptr`） | **不对应** | 同上，这里处理的是 `TypeScalar` 行的可移植镜像；`typedesc[T]` 的 trait 由 Apply 规则从基继承，镜像点要看最终选型落点。 |
| 9 | `compiler_snapshot_builder.cheng:14054-14055`（scalar→schema 序数）、`:14076`（文本 `"ptr"`） | **部分对应** | 映射与文本投影这两个**动作**必须做；输入的 kind 空间不同（见 7）。**注意**：`ptr` 补丁顺带改的注释在 `:14002-14005`（"`ptr` is a TypeArena scalar kind … so it never reaches this boundary"，该 `else` 分支就是 `missingSchemaKindCount++`）⇒ `ptr` 走 `Scalar` 分支、**根本不碰** `:13941-13943` 的 nominal/Apply 投影；**`typedesc[T]` 恰好要碰它**，这正是 §0.4 的第二关。 |
| 10 | `exact_def_freeze.cheng:786-788`（`Ptr` 列为地址叶、不算定长数组独立元素） | **不对应** | 该谓词问的是"这个标量是不是地址叶"。`typedesc[T]` 不是标量，且 C 链未给"type witness 是否地址叶"的裁定 ⇒ 需要独立裁定，不能照抄。 |
| 11 | `compiler_snapshot_builder.cheng` 中"Scalar 行不需要声明权威"的既有契约 | **不对应** | `:13917-13931` 对 `TypeScalar` 只查 `Int`/`UInt` 的宽度缺口，其余 scalar 直接放过；而 `:13941-13970` 对 `TypeApply` 要求声明身份 join。⇒ `typedesc[T]` 一旦建成 Apply，就**必须**过 `compilerSnapshotBuilderTypeProjectionNominalHeadJoinInto`（`:13799-13819`），而那里第一件事就是 `symbolIds[typeId] >= 0`（`:13815-13819`）。 |

**汇总**：11 点里真正"对应"的只有 2 处**形式**（末尾追加枚举/常量；封闭拼写表加 arm），其余 9 处或语义不同、或根本没有可比对的权威、或恰好踩在 `ptr` 从未触碰的快照 nominal 投影上。

---

## 5. "无关输入逐位不变"的论证

1. **artifact CID**（`typed_expr_type_arena.cheng:805-1019`，入口 `:812-840`）：哈希 `producerSourceCount/tokenCount/typeSyntaxCount/functionCount/genericSymbolCount/…/typeCount(:829)/symbolCount(:830)/memberCount/…` + 全列（含 `typeKinds` `:933`、`scalarKinds` `:934`、`symbolIds` `:935`、`childTypeIds` …）。
   - 不建种子行 ⇒ 不含该形态的 arena 的 `typeCount` **不变**；
   - 新枚举成员追加末尾 ⇒ 既有成员的 `Int32(...)` **不变**；
   - 不改 `symbolCount` 域（选型 A/B 都不引入内建符号，§3.2）⇒ `symbolCount` 列**不变**。
   ⇒ **不含 `typedesc[T]` 的 arena，artifact CID 逐位不变。**
2. **可移植 Type 行 CID**（`compiler_snapshot_schema.cheng:5621-5685` 结构追加 → `CsgCompilerTypeRowCidInto`）：追加常量在后面 ⇒ 既有 1..15 / 1..13 的 u32 字节不变 ⇒ 既有 type CID 逐位不变。
3. **唯一会"移动"的边界**：新常量使某个 `*KindValid` 的上界从旧末值抬到新末值。它放行的**恰好只有新成员这一个值**，1..旧末值的判定逐字不变 —— 是"为新成员开门"，不是"放宽既有守卫"。落地时必须 `grep` 出**全部**以这些末值为上界的区间判定（`ptr` 补丁的实测：全仓只有 `compiler_snapshot_schema.cheng:5192` 一处）并逐个确认。
4. **规范文本池**：新增一个文本条目，既有条目与既有 `canonicalTextIds` 不变；且 `compiler_snapshot_schema.cheng:6036` 注释明确 "Type identity excludes canonicalTextIds" ⇒ 文本不参与类型身份。
5. **本补丁形态**：本轮**没有补丁**，所以上述论证是"若按该设计落地则成立"的**前置条件清单**，不是已测读数 —— 见 §7 未测项第 1 条。

---

## 6. 需要哪条读数 / 下一步

### 6.1 已可判（不需新读数）

- 判定：**构造器**（§2.2 的 C 链 APPLY + `:57980-57986` 的 binder 引用准入判据，两条单独成立）。
- 纯标量镜像**必然**在 `typed_expr_type_arena.cheng:7592` 失败（§2.4，对 `children.len` 这一未测事实稳健）。

### 6.2 需要一条读数（廉价、不需要新工具）

**读数 R1（确认语法形状，去掉本报告最后一个推断）**：对 `src/std/system.cheng` 单源跑一次 TypeArena 的**类型语法行转储**（或在 `typed_expr_type_arena.cheng:7506-7510` 打一行只读探针），打印行列 `1352/1353/1354` 的 `typeSyntaxKinds`、`childCount`、`BracketArgCountAt`、`BracketArgTypeNodeAt(0)`、`genericSymbolStart/Count`。
- 期望：`1354 = ParserTypeSyntaxBracketApply`、`children = [1352, …]`、`BracketArgCountAt(1354) == 1`、`BracketArgTypeNodeAt(1354,0) >= 0`、`GenericSymbolCountAt(1354) == 1`（= binder `T`）。
- **若与该期望不符**（例如 `1354` 不是 BracketApply），§2.4 的结论仍成立（`fixedLength <= 0` 的子情形照样命中 `:7592`），但 §3 的落点需要重画。

**读数 R2（决定选型 A vs B）**：这不是一条"测量"能定的，是一次**架构裁定 + 一次编译往返**。裁定要回答的问题：
> `typedesc[T]` 在**可移植 CSG 层**是否需要一个"带上实参的精确类型行"？
> - 需要 ⇒ 必须新增 `CsgCompilerType*` 序数（或复用 `CsgCompilerTypeApply` 并允许 `declSymbolId = -1`），并给 `compiler_snapshot_builder.cheng:13799-13819` 增一条"无声明头 Apply"的投影分支。
> - 不需要（可擦除）⇒ 与 C 链 `:78349-78408` 的结构身份冲突，**必须先改 C 链或先改规范**，不能在 Cheng 侧单方面擦除。

**若走 R2 的第一支，候选落点（**尚未写入**，供一次性落地用；全部为"当前工作树"行号）：**

| 文件 | 插入点 | 一句作用 |
|---|---|---|
| `src/core/lang/typed_expr_type_arena.cheng:48` | 追加 `TypedExprStructuralScalarTypedesc` | 给裸 `typedesc` 一个内建标量身份（对齐 C 链 `:76199-76205` 的 tag 23） |
| `src/core/lang/typed_expr_type_arena.cheng:1045` 之后 | `if text == "typedesc": return TypedExprStructuralScalarTypedesc` | 封闭拼写表加 arm ⇒ authority 过滤（`:4968-4970`/`:3619-3621`）与物化快径（`:1808-1817`）自动生效 |
| `src/core/lang/typed_expr_type_arena.cheng:7509-7512` 之间 | 新增"基行是内建构造器标量 ⇒ 按声明 arity 建 Apply"的分支 | 让 `typedesc[T]` 不再落进 `:7589-7593` 的定长数组回退 |
| `src/core/lang/typed_expr_type_arena.cheng:10047-10048` | 为"Apply + 内建基（`symbolId == -1`、`children[0]` 是 Scalar 行）"开一条窄口 | 严格校验放行该形状（**窄口，不放宽其它任何形状**） |
| `src/core/lang/typed_expr_type_arena.cheng:1252-1262` | 沿用/细化 Apply 的 trait 规则（从 `children[0]` 继承） | Apply 的 managed/send/sync 已有此规则，需确认对 Scalar 基成立 |
| `src/core/csg_core/compiler_snapshot_schema.cheng:139` / `:5190-5192` | 追加可移植常量 + 上界 | scalar 侧序数；若改 TypeKind 侧则改 `:110-122` 的 `CsgCompilerType*` 与对应上界 |
| `src/core/csg_core/compiler_snapshot_schema.cheng:5876-5878` | Send/Sync 可移植镜像 | 与 arena 的 trait 结论逐字一致（否则 `:6002` `type trait conclusion mismatch`） |
| `src/core/tooling/compiler_snapshot_builder.cheng:13799-13819` | 新增"无声明头 Apply"投影分支 | **决定性**：不加则 `missingDeclarationIdentityCount++` ⇒ `admissionBlocked` |
| `src/core/tooling/compiler_snapshot_builder.cheng:14054-14055` / `:14076` | scalar→schema 序数 + 规范文本 `"typedesc"` | 与 `ptr` 同形 |
| `src/core/tooling/compiler_csg.cheng:12568-12570` 一带 | `typedesc` / `typedesc[T]` 的精确布局 | **需先裁定**（C 链只有 `'i'` 默认值，不能当权威） |
| `src/core/backend/canonical_type_chain.cheng:126-128` 一带 | coreir tag | **需先裁定** |
| `src/core/analysis/exact_def_freeze.cheng:786-788` 一带 | 定长数组元素独立性谓词 | **需先裁定** |

### 6.3 若修法错了，会先在哪条判词暴露

| 错法 | 第一条暴露判词 |
|---|---|
| 只加标量 arm、不做 bracket 通道 | `typed_expr_type_arena.cheng:7592` `bracket apply authority incomplete; exact generic SymbolId or bounded const AST required`（preflight 孪生 `:2089`） |
| arena 修好但快照投影没加"无声明头 Apply"分支 | `compiler snapshot builder` 的 `missingDeclarationIdentityCount` 非零 ⇒ `admissionBlocked`（`:13953-13964`；`ptr` 文档 §7.2 同族） |
| 忘了可移植 schema 序数 | `csg compiler snapshot: invalid type structure row`（`compiler_snapshot_schema.cheng:5662`）或 `invalid type CID row`（`:6070`） |
| 忘了 Send/Sync 镜像 | `csg compiler snapshot: type trait conclusion mismatch`（`:6002`）/ arena 侧 `trait rule or premise drift`（`:10169`，另有 `:6182` 的继承前提基数漂移） |
| 误加种子行 | 不含该形态输入的 `typeArenaArtifactCid` 与 `typeCount` **逐位变化** |
| 把 `typedesc[T]` 折成标量（实参丢失） | 静默：`typedesc[int32]` 与 `typedesc[str]` 同 TypeId。**不报错**，只在泛型实例化/特化处表现为"实参被吞" —— 属最危险一类，必须靠"两个不同实参的 TypeId 必须不同"的读数为准 |

---

## 7. 未测项（诚实清单）

| # | 未测项 | 影响 |
|---|---|---|
| 1 | **本轮零编译、零执行、零 apply**。所有结论来自静态读码；没有 `git apply`，没有补丁，没有 `git apply --check` 读数 | 所有"必然在 `:7592` 失败"的推演是**读码推演**，不是实测判词；§5 的 CID 论证是设计前置条件清单，不是已测读数 |
| 2 | **行列 `1352/1353/1354` 的语法形状是推断**（依据：判词里的 `root_generic_count=1` + parser 的参数根泛型窗口镜像机制 `parser.cheng:17738-17760`/`:23930-23945` + `:4959` 要求 `kind == Nominal`） | §2.4 的结论对该形状**稳健**（两种 children 子情形都命中 `:7592`）；但 §3/§6.2 的落点需要读数 R1 确认后才可写补丁 |
| 3 | **`typedesc` / `typedesc[T]` 的物理布局、coreir tag、Send/Sync 取值未裁定** | C 链对前者只有 `bootstrap/cold_parser.c:5453` 的 `return 'i'` 默认值、对后两者无对应物。任何取值都是**新裁定**，不是镜像；未裁定前不能写这 3 个文件的补丁 |
| 4 | **选型 A 与 B 未判**（§0.5/§6.2）：谁能在 `csgCompilerTypeKindValid`、`type trait conclusion mismatch`、`invalid type CID row` 处不翻车，只有编译能答 | 这是本轮不交补丁的直接原因 |
| 5 | **`set[T]` 是同一类的下一个墙，未处理** | `src/std/system.cheng:2817` `fn setHas(s: set[T], value: T): bool`，`set` 在仓内**无任何声明**（`grep -rn "^type .*set" src --include=*.cheng` 零命中），C 链给了它专属身份种类 `COLD_TYPE_IDENTITY_SET=14`（`bootstrap/cold_type_identity_contract.h:24`、`bootstrap/cheng_cold.c:78077-78102`）。它在 `newException`（`:2723`）之后 ⇒ `typedesc` 墙一过，**下一条判词极可能换成 `name=set`**。本报告不覆盖 |
| 6 | **`typedesc` 在 `docs/cheng-formal-spec.md` 里 0 命中** | 意味着"标量 vs 构造器"在规范上**没有正面依据**；本报告的判定完全建立在 C 链 + 真实用法上。若后续补规范，应以本次裁定为准回填 |
| 7 | **C 链对 `typedesc[T]` 的运行时行为未实测**：本报告只读码确认它的**结构身份**（APPLY 节点）与**开放泛型准入**（`:57980-57986`）。仓内 4 处用例的 `t` 全被丢弃，C 链是否真正实例化过 `newException`/`none` 未验证 | 若这 4 处实际是**死代码**，则 C 链的"处理"是未经执行检验的默认路径 —— 这会**加强**（而非削弱）§6.2 R2 的必要性：布局/tag 不能从 C 链默认值反推 |
| 8 | **`Ptr`/`Pointer[` 一类大小写变体未纳入讨论** | `parser.cheng:6500-6503` 把 `ptr`/`ptr[`/`Pointer[` 列为标量类；`ptr` 文档 §8.8 已声明不处理。`typedesc` 无已知变体拼写（`grep -rn typedesc` 全仓仅 4 处，全小写） |
| 9 | **未核验是否存在引用 `typeArenaArtifactCid` 的外部冻结基线** | 与 `ptr` 文档 §8.9 同一未测项 |
| 10 | **未核验"裸 `typedesc`（不带 `[T]`）"在仓内是否可能合法出现** | 全仓零用例；若规范将来允许，§6.2 落点表第 1、2 行才是必需（否则可能连它们都不需要） |

---

## 附：本轮为何不交补丁

任务书给了二选一："若确信修法 ⇒ 补丁 + 冻结副本 + `git apply --check` exit 0"；"若不确信 ⇒ 只交诊断"。本轮的实际情况是**判定确信、表示选型不确信**：

- 判定（构造器）有 C 链两条独立硬证 + 仓内 4/4 用例形状（§2.2/§2.3）；
- 但把它落成补丁需要**新增可移植 schema 序数 + 改快照 nominal 投影**，并且要先裁定 `typedesc` 的布局/coreir tag/Send-Sync 三个 C 链**没有权威**的量（§3.2、§7.3）；
- 在"零编译"约束下交一个 ~10 文件、动到身份层与可移植 CID 的未验证补丁，属于任务书明确判定为"比不交更贵"的**半成品补丁**（且违反 `AGENTS.md`"禁止降级/兜底/启发式"与"发布证据禁止假绿"两条）。

⇒ 本轮交付：本诊断 + 精确落点表 + 未测项清单 + 需要的两条读数（§6.2 R1/R2）。**未写任何源文件，未生成任何补丁，未 apply，未编译。**

> **§1–§7 的参照物是 `ptr` 补丁；owner 已裁定该参照物错。**
> 第二轮（§8 起）改用正确参照物：**C 链的内建类型身份契约**（`bootstrap/cold_type_identity_contract.h`）。
> §2 的三方证据、§2.4 的"纯标量镜像可证伪"、§6.2 R1、§7 未测项**仍然有效**（它们不依赖参照物）；
> §3.2 的选型 A/B 已被 §10 取代（§10.1 找到了决定性事实，见下）。

---

# 第二轮（owner 裁定后）：以内建类型身份契约为参照物的三态对表 + 选型

**本轮五问的答案位置**：T1 → §8；T2 → §9；T3 → §10；T4 → §11；T5 → §12。**仍未写补丁、未 apply、未编译。**

---

## 8. T1：C 链内建类型身份契约（权威清单，全量抄录）

### 8.1 契约本体 —— `bootstrap/cold_type_identity_contract.h` 逐行

| 序数 | 枚举名 | 头文件行 |
|---|---|---|
| 1 | `COLD_TYPE_IDENTITY_SCALAR` | `:11` |
| 2 | `COLD_TYPE_IDENTITY_BORROW` | `:12` |
| 3 | `COLD_TYPE_IDENTITY_SEQUENCE` | `:13` |
| 4 | `COLD_TYPE_IDENTITY_FIXED_ARRAY` | `:14` |
| 5 | `COLD_TYPE_IDENTITY_TUPLE` | `:15` |
| 6 | `COLD_TYPE_IDENTITY_FUNCTION` | `:16` |
| 7 | `COLD_TYPE_IDENTITY_OBJECT` | `:17` |
| 8 | `COLD_TYPE_IDENTITY_REF_OBJECT` | `:18` |
| 9 | `COLD_TYPE_IDENTITY_ENUM` | `:19` |
| 10 | `COLD_TYPE_IDENTITY_APPLY` | `:20` |
| 11 | `COLD_TYPE_IDENTITY_ALIAS` | `:21` |
| 12 | `COLD_TYPE_IDENTITY_GENERIC_PARAM` | `:22` |
| 13 | `COLD_TYPE_IDENTITY_OPTIONAL` | `:23` |
| 14 | `COLD_TYPE_IDENTITY_SET` | `:24` |
| 15 | `COLD_TYPE_IDENTITY_RAW_POINTER` | `:25` |
| 16 | `COLD_TYPE_IDENTITY_GENERIC_BINDER` | `:26` |

配套（同文件）：`COLD_GENERIC_BINDER_{NONE=0,TYPE_ROW=1,OBJECT_ROW=2,FUNCTION_DECLARATION_ORIGIN=3}`（`:29-34`）；
`COLD_TYPE_IDENTITY_DECLARATION_KIND_{TYPE=1,OBJECT=2,FUNCTION=3}`（`:36-40`）；预算常量 `:42-44`。
唯一包含者：`bootstrap/cheng_cold.c:111`（`#include "cold_type_identity_contract.h"`），另有 `:86764` 把它列为 hash 输入之一。

### 8.2 每个身份种类：判定点 + 节点形状 + exact TypeId 策略

全部判定点都在 `bootstrap/cheng_cold.c`（除非另注）。"判定点"= 从类型 span 决定该种类的那一段代码。

| 序数 | 种类 | 判定点（`cheng_cold.c`） | 触发形状 | 节点载荷 / 子节点 | `exact_type_id` |
|---|---|---|---|---|---|
| 1 | SCALAR | `:78567-78574`，名字表在 `cold_type_identity_builtin_type_tag` `:76196-76212` | 裸内建名（23 个，见 §9.2） | `payload0` = 内建 tag(1..23)；**0 子** | `-1`（`:78573`） |
| 2 | BORROW | `:77959-77975`（`cold_type_strip_var` 命中 `var` 前缀） | `var T` | 1 子 = 被借类型 | 继承子节点（`:77974`） |
| 3 | SEQUENCE | `:78123-78143`（`cold_type_is_dynamic_seq_type`） | `T[]` | 1 子 = 元素 | `cold_exact_return_type_id_from_signature`（`:78135-78137`） |
| 4 | FIXED_ARRAY | `:78145-78180`（`cold_parse_any_fixed_array_type`） | `T[N]` | `payload0` = 长度；1 子 = 元素 | `-1`（`:78179`） |
| 5 | TUPLE | `:78035-78075`（`tuple[` primary）；`:78214-78218`（`(...)` ≥2 项）；`:78243-78266`（兜底） | `tuple[A,B]` / `(A,B)` | n 子 = 成员 | `-1` |
| 6 | FUNCTION | `:77982-78022`（`cold_fn_sig_split`） | `fn(...): R` | `payload0` = 形参个数；n+1 子（末位 = 返回，缺省 `void` `:78008-78010`） | `-1`（`:78021`） |
| 7 | OBJECT | `:77921-77941`（`cold_type_identity_graph_object_node`）→ `:77932-77940`，`!is_ref` | 具名 object | `payload0` = object row；0 子 | `cold_type_identity_object_exact_type_id`（`:77938-77939`） |
| 8 | REF_OBJECT | 同上，`object->is_ref`（`:77934-77936`） | `ref object` | 同上 | 同上 |
| 9 | ENUM | `:78561-78565`（`symbols_find_type_local` 命中且无 `alias_type`） | 具名 enum TypeDef | `payload0` = type row；`payload1` = `is_enum`；0 子 | 来自 TypeDef 路径（`:78518-78520` 的 probe） |
| 10 | APPLY | `:78295-78445`。头：`:78297-78303`（**nominal 基**）/ `:78304-78310`（**builtin 基**）；实参 `:78322-78349`、建子 `:78389-78408`；首次 intern `:78410-78414`；rebound intern `:78438-78443` | `Base[A,B]`（`Base` 可以是**声明**，也可以是**内建名**） | `payload0` = arg_count；**n+1 子，`child[0]` = 头节点**（nominal 头是 OBJECT 节点，builtin 头是 SCALAR 节点） | 有 nominal 头 ⇒ object exact id（`:78418-78420`、`:78433-78436`）；**无声明头 ⇒ `-1`**（`:78437`） |
| 11 | ALIAS | `:78501-78560`（TypeDef 有 `alias_type`） | `type A = B` | `payload0` = type row；1 子 = 别名目标 | `cold_exact_return_type_id_from_signature`（`:78518-78520`） |
| 12 | GENERIC_PARAM | `:78465-78482`（span 命中 `generic_names[]`） | 泛型 binder 名（`T`） | `payload0` = 泛型**序号**；1 子 = GENERIC_BINDER | `-1`（`:78481`） |
| 13 | OPTIONAL | `:78106-78121`（`?` 后缀，排除 `\?`） | `T?` | 1 子 = 内层 | `-1`（`:78121`） |
| 14 | **SET** | `:78035-78104`（`set[` primary，**:78077-78079 强制 `formal_base=="set" && arg_count==1`**）；`:78268-78293`（兜底，同样 `:78269` 卡 arity 1） | `set[T]` | `payload0` = 1；1 子 = 元素 | `cold_exact_return_type_id_from_signature`（`:78096-78098` / `:78285-78287`）→ 见 §11.2 的实测推论 |
| 15 | RAW_POINTER | `:78447-78463`（`cold_type_has_pointer_suffix`） | `T*` | 1 子 = pointee | `-1`（`:78463`） |
| 16 | GENERIC_BINDER | `:78469-78476` | （不是独立拼写；由 GENERIC_PARAM 生成） | `payload0` = binder_kind（`contract.h:29-34`）；`payload1` = binder_id；0 子 | `-1`（`:78475`） |

### 8.3 判定优先级（`cold_type_identity_graph_build_visit` 的 if 链顺序）

**这就是"哪一处被识别"的权威顺序**（`bootstrap/cheng_cold.c:77943` 起，逐条按源码顺序）：

| 顺序 | 行 | 判据 | 产出 |
|---|---|---|---|
| 1 | `:77959-77975` | `var ` 前缀 | BORROW |
| 2 | `:77982-78022` | `fn(` 前缀（**先于任何后缀判据**，注释 `:77977-77979`） | FUNCTION |
| 3 | `:78026-78030` | `proc(` / `ref ` / `enum[` / `enum(` | **硬拒 `-1`**（"已移除/仅声明形，绝不由文本猜结构"） |
| 4 | `:78035-78104` | `tuple[` / `set[`（**primary form，先于 `[N]` 定长数组分类器**，注释 `:78032-78034`） | TUPLE / SET |
| 5 | `:78106-78121` | 尾 `?` | OPTIONAL |
| 6 | `:78123-78143` | 尾 `[]` | SEQUENCE |
| 7 | `:78145-78180` | 尾 `[N]`（可含 const 求值） | FIXED_ARRAY（`Foo[N]` 且 `Foo` 是泛型 ⇒ `-1`，注释 `:78165-78167`） |
| 8 | `:78182-78231` | `(...)` | TUPLE（≥2）/ 透传（=1） |
| 9 | `:78235-78445` | `Base[...]`（`cold_type_parse_generic_instance`） | TUPLE / SET / APPLY |
| 10 | `:78447-78463` | 尾 `*` | RAW_POINTER |
| 11 | `:78465-78482` | span == 某个 `generic_names[i]` | GENERIC_BINDER + GENERIC_PARAM |
| 12 | `:78484-78500` | 具名 object 解析 | OBJECT / REF_OBJECT（歧义 ⇒ 拒绝并打印 `TypeNode nominal object identity rejected`） |
| 13 | `:78501-78560` | `symbols_find_type_local` | ALIAS / ENUM |
| 14 | `:78567-78574` | 内建名表 | SCALAR |
| 15 | `:78575` | 都不中 | `-1`（**无兜底、无默认**） |

### 8.4 契约自带的形状守卫（可直接对表 Cheng 的严格校验）

| 守卫 | 位置 | 内容 |
|---|---|---|
| 节点域 | `:78757-78759` | `node->kind ∈ [SCALAR(1), GENERIC_BINDER(16)]` |
| 子节点形状 | `:78760-78772` | `child_count ≥ 0`、`child_start ≥ 0`、`child_start ≤ child_count_total - child_count`、**每个 child_row 必须 `< row`**（严格后序） |
| 结构节点谓词 | `cold_opaque_sequence_structural_node_kind` `:78722-78738` | BORROW / SEQUENCE / FIXED_ARRAY / TUPLE / FUNCTION / **APPLY** / OPTIONAL / **SET** / RAW_POINTER 为结构节点；SCALAR / OBJECT / REF_OBJECT / ENUM / ALIAS / GENERIC_PARAM / GENERIC_BINDER **不是** |

⇒ **契约里根本没有"必须持有声明符号"这条**：APPLY（序数 10）的头部由 `child[0]` 承载，`child[0]` 允许是 SCALAR 节点（`:78304-78310`）。这一点是 §10 选型的根据。

---

## 9. T2：与 Cheng 管线逐条对表（覆盖 / 缺失 / 部分）

### 9.1 十六个身份种类的三态表

Cheng 侧对应物一律指 `src/core/lang/typed_expr_type_arena.cheng`（除注明）。**Cheng 的 `TypedExprStructuralTypeKind` 序数 0..13 恰好一一对应 COLD 的 1..13**（`:13-27`：Invalid=0, Scalar=1 … Optional=13）⇒ 14/15/16 三个序数在 Cheng 侧**空位**。

| COLD | Cheng 等价物 | 命中路径 | 状态 |
|---|---|---|---|
| 1 SCALAR | `TypedExprStructuralTypeScalar`(1) + `TypedExprStructuralScalarKind`（18 值，`:29-48`） | 识别 `typedExprTypeArenaScalarKind:1023-1046` → 权威过滤 `:4968-4970`/`:3619-3621` → 物化快径 `:1808-1817` | **部分**（kind 覆盖；**名字表缺 5 个**，见 §9.2） |
| 2 BORROW | `TypedExprStructuralTypeBorrow`(2) | `ParserTypeSyntaxVarBorrow`（`parser.cheng:18762-18780`）→ `:7441-7450` | **覆盖** |
| 3 SEQUENCE | `TypeSequence`(3) | `ParserTypeSyntaxSeq` → `:7451-7460` | **覆盖** |
| 4 FIXED_ARRAY | `TypeFixedArray`(4) | `ParserTypeSyntaxFixedArray` → `:7489-7501`；bracket+const 走 `:7594-7601` | **覆盖** |
| 5 TUPLE | `TypeTuple`(5) | **parser 专用 kind** `ParserTypeSyntaxTuple`（`parser.cheng:18832-18860`）→ `:7602-7618` | **覆盖**（不经 bracket 路径） |
| 6 FUNCTION | `TypeFunction`(6) | `ParserTypeSyntaxFunction`（`parser.cheng:18868+`）→ `:7619+` | **覆盖** |
| 7 OBJECT | `TypeObject`(7) | 声明权威 `typedExprTypeArenaAuthorityRow` → `ResolveNominal:1880-1920` | **覆盖** |
| 8 REF_OBJECT | `TypeRefObject`(8) | 同上 | **覆盖** |
| 9 ENUM | `TypeEnum`(9) | `ParserTypeSyntaxEnum`/`Algebraic`/`Variant` | **覆盖** |
| 10 APPLY | `TypeApply`(10) | **仅 nominal 头**：`BracketApply:7512-7588`（声明权威 + 泛型窗口 + `intern(TypeApply, symbolId=声明符号)`） | **部分**：**builtin 头分支缺失** ← `typedesc[T]` 的墙（C 的 `:78304-78310` 无对应物） |
| 11 ALIAS | `TypeAlias`(11) | `ParserTypeSyntaxAlias` | **覆盖** |
| 12 GENERIC_PARAM | `TypeGenericParameter`(12) + **`genericSymbolId` 列** | 权威相 `:4974-4986` 写 `genericSymbolRows`；物化 `:1818-1878` | **覆盖（编码不同）**：C 用"子节点 GENERIC_BINDER(16) + binder_kind/binder_id"，Cheng 用行上的 `genericSymbolId`（intern 形参 `:1136`；严格校验 `:10050-10053` 要求它在 `[0, genericSymbolCount)`） |
| 13 OPTIONAL | `TypeOptional`(13) | `ParserTypeSyntaxOptional`（`parser.cheng:19005-19020`）→ `:7466-7488` | **覆盖** |
| 14 **SET** | **无** | `set` 是关键字 token（`parser.cheng:14563` `ParserValueTokenSet`），且 `parserTypeSyntaxTokenCanName:18124-18126` 允许它当类型名 ⇒ `set[T]` 走 `ParserTypeSyntaxBracketApply` + `Nominal("set")`，然后**必然**落到 `:4987-5021` 的 `name_not_visible` | **缺失** ← `set[T]` 的墙 |
| 15 RAW_POINTER | **无（设计性禁止，非缺口）** | `src/core/lang/parser.cheng:19021-19026`：类型位的 `*` 直接 `return false`，诊断码 **`ZRPC_PUBLIC_RAW_POINTER_TYPE_FORBIDDEN`**；规范 `docs/cheng-formal-spec.md:58`（禁 `T*`/`void*`/`ref T`/`ptr[T]`）、`:130`（"公开 Cheng 表面语法不提供裸指针类型 `T*`"） | **N/A**：Cheng 表面**永不产生**该形状 ⇒ 不需要 arena 表示 |
| 16 GENERIC_BINDER | **`genericSymbolId` 列**（等价编码） | 见 12 | **覆盖（不同编码）** |

**净结果**：16 个序数里 **13 个覆盖 / 1 个部分（APPLY 的 builtin 头）/ 1 个缺失（SET）/ 1 个设计性 N/A（RAW_POINTER）**；
其中 SCALAR 这一族内部另有一个**名字表缺口**（§9.2）。**`typedesc` 同时踩中两个**：它的**裸拼写**属于 §9.2 的名字缺口，它的 **`typedesc[T]`** 属于 APPLY 的 builtin 头缺口。

### 9.2 SCALAR 子表：C 的 23 个内建身份名 vs Cheng 的 18 个

C 名表（`:76199-76205`，序 = tag-1）：`void, bool, int8, uint8, char, int16, uint16, int32, int, uint32, int64, uint64, float32, f32, float64, f64, cstring, ptr, str, uint, bytes_view, utf8_view, typedesc`（**23**）。
Cheng 表（`:1024-1045`）：`void, bool, char, int, uint, int8, uint8, int16, uint16, int32, uint32, int64, uint64, float32, float64, str, cstring, ptr`（**18**）。

| C 有 / Cheng 无 | Cheng 侧现状 | 是否已被踩到 |
|---|---|---|
| `f32`、`f64` | 无 arena 身份；`parser.cheng` 的标量类表（`:6488-6493`）只列 `float/float32/float64`；`typed_expr.cheng` 有零散 f32/f64 处理 | 类型位实测用法只在 `src/.gen/dapan_p0_scene_runtime.cheng:830/842/1202`（**生成目录 `.gen/`，不在 `src/std`+`src/core` 面**） |
| `bytes_view`、`utf8_view` | **只有文本特例**，无 arena 身份：`parser.cheng:6432-6433`（内建调用名表）、`typed_expr.cheng:44780`、`:52359-52371`、`lowering_plan.cheng:17288-17290` | 类型位实测用法：`src/tests/call_hir_closure_visible_leaf.cheng:1`（`@importc fn …(payload: utf8_view)`）、`src/tests/sabi_string_bridge_smoke.cheng:76-82`。**是否在 234 源闭包内未验证** |
| **`typedesc`** | 无任何处理（全仓 `typedesc` 仅 4 处**用法**，零处理代码） | **是**：`src/std/system.cheng:2723`（判词现场） |

⇒ 结论：**SCALAR 族的名字表缺 5 个，其中 4 个（f32/f64/bytes_view/utf8_view）今天没有在森林核心面被踩到，`typedesc` 是第一个**。这正是 owner 说的"逐名字补 = 逐症状补"的量化形态：**名字表本身是一个应当一次补齐的闭集**，而不是一个个补。

### 9.3 "缺失类"的确切成员（本轮的施工对象）

| 编号 | 缺口 | 语义 | C 链参照 | 仓内受影响的源 |
|---|---|---|---|---|
| **G1** | APPLY 的 **builtin 头** | 以"无声明的内建名"为头的泛型应用 | `:78304-78310`（`NOMINAL_NOT_FOUND` → 递归建头节点）+ `:78389-78408`（实参建子）+ `:78410-78414`（intern） | `src/std/system.cheng:2723`、`src/core/option.cheng:14`、`src/runtime/option.cheng:18`、`src/tests/cold_open_generic_formal_authority_smoke.cheng:6` |
| **G2** | **SET** 身份种类 | 位集合构造器（arity 1） | 序数 14；`:78035-78104`、`:78268-78293` | `src/std/system.cheng:2817`（全仓唯一 `set[` 类型位用法） |
| **G3** | SCALAR 名字表 5 项 | 内建名闭集补齐 | `:76199-76205` | `typedesc` 见 G1；其余 4 个今天未在核心面被踩 |

**G1 是当前判词的直接原因；G2 是同一源文件里紧跟其后的下一个判词**（`:2723` → `:2817`，同一次 arena 构建、同一源，行序在后必然命中）。
**G2 不可能被"绕开"**：`set` 在仓内**无任何声明**（`grep -rn "^type .*set" src --include=*.cheng` 零命中；`grep -rn '"set"'` 只有词法器 `parser.cheng:14563` 与无关文件），所以它和 `typedesc` 是同一堵墙的两个实例。

---

## 10. T3：缺失类的最小统一表示 + 选型

### 10.1 决定性事实：**Cheng 管线已经实现了"APPLY 的头 = `children[0]`"**

这是本轮最重要的发现，它把选型从"要不要新造机制"变成"要不要拆掉两道多余的闸门"：

| 事实 | 位置（逐字） |
|---|---|
| 后端类型链**已经把 Alias/Borrow/Apply 三者一律前推到 `children[0]`** | `src/core/backend/canonical_type_chain.cheng:55-67`：`if kind != Alias && kind != Borrow && kind != Apply: return current` / `let childTypeId = lowering.typeArenaChildTypeIds[current]` / `current = childTypeId` ⇒ **Apply 的物理类型 = 第一个子节点的类型** |
| 精确布局**同样按 `children[0]` 前推** | `src/core/tooling/compiler_csg.cheng:12637-12659`：`Alias || Apply` 分支取 `childStart` 处的 `childTypeId`，递归解析后 `layoutPresent/sizeBytes/alignBytes` 全部继承该子节点 |
| intern **不要求 symbolId ≥ 0** | `typedExprTypeArenaIntern` `:1129-1160` 的校验里**没有 symbolId 判据**；标量行正是用 `symbolId=-1` 生产的（`:1812-1817`）。唯一要求 `symbolId ≥ 0` 的是 `ReserveAggregate`（`:1370-1382`），而它只服务 `Object/RefObject/Enum` 三种声明型行 |
| 可移植层的 Apply 行**本来就允许"无声明符号"** | `compiler_snapshot_schema.cheng:2644-2645` `csgCompilerOptionalIndexValid(index,count) = index == -1 || csgCompilerIndexValid(index,count)`；`csgCompilerTypeStructureAppendInto` 对 `declSymbolId` 用的正是这个 optional 校验（`:5641-5642`），写出时走 `csgCompilerTypeCidAppendOptionalSymbol`（`:5692`，函数体 `:5389`）⇒ **wire 格式无需新增序数** |

⇒ **C 的 APPLY 语义（头是节点）在 Cheng 侧已经有三个实现（后端链、布局、wire 校验），只有两道闸门还假设"头必然是声明"**：

1. `src/core/lang/typed_expr_type_arena.cheng:10047-10048`：`symbolic && (symbolId < 0 || symbolId >= value.symbolCount)` ⇒ `structural payload invalid`（`symbolic` 集合见 `:10031-10035`，含 `TypeApply`）。
2. `src/core/tooling/compiler_snapshot_builder.cheng:13799-13819`：`arenaSymbolId < 0 || arenaSymbolId >= symbolCount` ⇒ 直接 `return false` ⇒ `:13959-13964` `missingDeclarationIdentityCount++` ⇒ admissionBlocked。
   另加**第三处（生产侧）**：`typed_expr_type_arena.cheng:7509-7512` 的 bracket-apply 分支只认 `authorityRow >= 0`，没有 builtin 头的臂。

### 10.2 B1（推荐）：把 `TypeApply` 的头泛化为"任意类型节点"，`symbolId` 降级为可选回执

**内容**（三处窄口 + 内建名闭集）：

| # | 落点 | 一句作用 |
|---|---|---|
| 1 | `typed_expr_type_arena.cheng:1045` 之后 + `:48` | 闭集补名：`typedesc`（本轮）并入 `TypedExprStructuralScalarKind`（末尾追加）。**这是 §9.2 G3 的一次性补名，不是 per-name 特判** |
| 2 | `typed_expr_type_arena.cheng:7509-7512` | `BracketApply`：当 `authorityRow < 0` **且**基行 `typeKinds == TypeScalar` **且**该标量是**内建构造器头**（闭表给 arity）时，`intern(TypeApply, symbolId = -1, children = [基TypeId, 实参TypeId…])`。**arity 取自闭表，不取自语法**（理由见 §10.5 的 fail-closed 要求） |
| 3 | `typed_expr_type_arena.cheng:10047-10048` | 窄口：`symbolic(Apply) && symbolId == -1` 当且仅当 `children[0]` 的行为 `TypeScalar` 时放行；其它任何形状判定逐字不变 |
| 4 | `compiler_snapshot_builder.cheng:13799-13819` | builtin 头分支：跳过"声明符号 → 声明根 → 声明行"这条 join，令 `headTypeIdOut = children[0]`；`symbolCids`/`declarationPathCids` 不参与（wire 已经在 `:5641-5642` 用 optional 校验、`:5692` 用 optional 编码） |

**代价**：**零新增枚举、零新增可移植序数、零新增布局分支、零新增后端 tag 分支**。
新标量 `typedesc` 自身仍要补齐它作为"内建标量"的既有 6 处镜像（与 `ptr` 同类，见 §4 第 1/2/5/6/7/8 行的**形式**）。

**为什么 B1 是"统一"而不是"又一个特例"**：加进闭表的每一个内建构造器名，自动获得同一条通道（G1 与 G2 用同一个机制），不再需要新 TypeKind、新 wire 序数或新投影分支。**这正是 C 契约的形状**（`:78304-78310`：内建头与声明头走同一段代码，只有 `child[0]` 的来源不同）。

### 10.3 B2：新增 `TypedExprStructuralTypeKind`（若裁定要逐号对齐 C 的 SET=14）

- 把 `set[T]` 建成 `TypedExprStructuralTypeSet`，落在既有**非符号 unary 家族**里（`unary` 列表 `:10026-10030`；trait 规则家族 `:1021-1030`；`!symbolic` 判据 `:10049`；`unary && childCount != 1` 判据 `:10044`）—— 形状上与 `TypeOptional` 同构，实现上不算新机制。
- **代价（必须如实计入）**：`csgCompilerTypeKindValid:5186-5188` 的上界要同抬（末值 `CsgCompilerTypeGenericParameter=13` → 14）；可移植 `CsgCompilerType*` 追加一个序数；`compiler_csg.cheng:12521-12811` 的布局要有分支（否则 `:12809-12810` `exact layout structural kind unsupported`）；`canonical_type_chain.cheng:110-118` 要归类（否则 `:119-120` panic）；`compiler_snapshot_builder.cheng:13917-13950` 的投影要有分支（否则落 `else` ⇒ `missingSchemaKindCount++`）。
- **B2 不是错的，只是比 B1 贵**；它唯一的好处是"编号与 C 的 14 对齐"，而两套编号空间本来就不共享（C 16 个 / Cheng 13 个），对齐没有契约价值。

### 10.4 B3 与其它

- **B3（我的次选，若 B1 被否）**：只给 `set[T]` 走 B1 通道（把 `set` 记进内建构造器闭表，arity 1），完全不动 TypeKind 空间。
  ⇒ **B1+B3 = 一个机制 + 一张闭表**，`typedesc[T]` 与 `set[T]` 同解。我倾向 B1+B3 而不是 B1+B2。
- **排除 D1：把 `set[T]`/`typedesc[T]` 折成其实参 `T`** —— 与 C 的 APPLY/SET 节点（都显式持有头/子）矛盾，且让 `set[int32]` ≡ `int32`（身份谎言）。§3.2 选型 C 已否决。
- **排除 D2：给内建头造 SymbolId** —— `symbolCount` 进 artifact 哈希（`typed_expr_type_arena.cheng:830`）且 seal 对账 `declarationSymbolTotal`（注释 `:372-374`、播种 `:5168-5187`）⇒ 要么全量 CID 位移，要么 seal 失败。§3.2 已论证。
- **排除 D3：在 std 里声明 `type set[T]`/`type typedesc[T]`** —— 与 C 的内建身份表（`:76199-76205` 有 `typedesc`）冲突；且会得到"每模块一份"的 nominal 身份。

### 10.5 硬约束核对：只许追加序数 ⇒ 逐位不变

| 追加面 | 是否追加在末尾 | 为何既有输入逐位不变 |
|---|---|---|
| `TypedExprStructuralScalarKind` | 是（`typedesc` 加在 `Ptr` 之后） | 既有 18 个成员的 `Int32(...)` 不变 ⇒ `typedExprTypeArenaTypeHash:1057-1079` 的哈希材质不变；列值不变 |
| `TypedExprStructuralTypeKind` | **B1 不追加**；B2 才追加，同样在末尾 | 同上 |
| `CsgCompilerScalar*` / `CsgCompilerType*` | 追加在末尾 | `:139`/`:110-122` 的既有值不变 ⇒ 既有 type CID 字节不变 |
| `*KindValid` 上界 | 从旧末值抬到新末值 | **放行的恰好只有新成员这一个值**；1..旧末值判定逐字不变。落地时须 `grep` 全部同形上界（已知：`compiler_snapshot_schema.cheng:5190-5192`、`:5186-5188`） |
| `typeCount` / 种子行 | **不动** `typedExprTypeArenaSeedSemanticScalarRows:1566-1596` | 不出现该形态的 arena 行数不变 ⇒ artifact CID 不变 |
| `symbolCount` / 符号域 | **不动** | 见 D2 |
| 可移植 wire 布局 | **不动**（B1 复用 optional symbol 语义 `:2644-2645`） | 既有行的 preimage 逐字节不变；只有今天**失败**的行变成可表示 |

⇒ **B1 的"无关输入逐位不变"是构造性的**：没有任何 enum 值变化、没有任何列长度语义变化、没有任何 wire 字段变化；唯一被"移动"的是两道**准入判据**的放行集合，且放行集合的新增元素**只有 builtin 头这一种形状**。

**fail-closed 要求（B1 的必备伴随条件）**：arity **必须取自闭表**，不得取自 `BracketArgCountAt`。理由：若 arity 由语法自由取，`typedesc[A,B]`（跨语言的 `typedesc` 常写成 2 参）会**静默**构造出一个 2 参的 Apply 并一路进入身份/布局；而 C 对 `set` 是硬卡 `arg_count == 1`（`:78078`、`:78269`）。闭表 + arity 不符即 hard-fail，才与仓内"不兜底、早暴露"一致。

### 10.6 T3 结论

> **采用 B1**：`TypeApply` 的"头"= `children[0]` 类型节点，`symbolId` 只是"头恰好是声明"时的可选回执；内建名闭集（含 `typedesc`，`set` 走 B3 同表）提供头身份与 arity。
> 依据不是"这样能过"，而是 **C 契约（§8.2 序数 10）与 Cheng 已有的三处实现（§10.1）本来就是同一个模型，只有两道闸门写窄了**。
> **B2 仅在 owner 裁定"必须逐号对齐 C 的 SET=14"时启用。**

---

## 11. T4：layout / coreir tag / Send·Sync —— 消费者、失败签名、最小裁定问题清单

**先说一个把问题变小的推论**：§10.1 已证 **Apply 的 layout 与 tag 都前推到 `children[0]`**（`compiler_csg.cheng:12637-12659`、`canonical_type_chain.cheng:55-67`）。
⇒ 一旦 G1 建成"内建头 + 实参"，`typedesc[T]` / `set[T]` 的 layout 与 tag **不再需要单独裁定**，它们**就是头节点那三个量**。**三个量塌缩成一个**：*内建头标量自身的 layout / tag / Send·Sync*。

### 11.1 layout

| 面 | 位置 | 缺失/不一致时的判词或行为 |
|---|---|---|
| 生产者 | `compiler_csg.cheng:12521-12814` `compilerCsgExactLayoutInto`；`present[typeId]` 写点 `:12814` | 未知 kind：`:12809-12810` `compiler csg: exact layout structural kind unsupported` |
| Apply/Alias 前推 | `:12637-12659` | 子缺失：`:12641-12643` `compiler csg: exact forwarded layout child missing` |
| 标量布局 | `:12521-12623`（`ptr` 的 8/8 在 `:12568-12570`） | 不在标量布局表内：`:12621` `compiler csg: exact scalar layout unsupported` |
| "无布局"的既有先例 | `:12632-12636` `GenericParameter` ⇒ `layoutPresent=false, size=0, align=1` | 该形态今天就在用，不是新造 |
| 消费 | `compiler_snapshot_builder.cheng:13965-13973`（`typeProjectionExactLayoutRowByArenaType[head] < 0` ⇒ `missingDeclarationLayoutCount++`） | admissionBlocked |

### 11.2 coreir tag

| 面 | 位置 | 缺失/不一致时的判词或行为 |
|---|---|---|
| 终端 kind 分派 | `canonical_type_chain.cheng:101-141` `CanonicalTypeChainLocalKind` | 未知 kind：`:119-120` **panic** `canonical type chain: terminal local kind unsupported` |
| 标量 tag | `:121-143`（`Str→LocalStrTag`；`CString/Ptr→LocalPtrTag`；`Int64/UInt64→LocalI64Tag`；`Float64→LocalF64Tag`；`Void/Invalid→panic` `:138-142`） | **未知 scalarKind 静默落 `:143 return coreir.LocalI32Tag`** —— 最危险的一条（把 8 字节当 4 字节，不报错） |
| 前推 | `:55-67`（Alias/Borrow/**Apply**） | —— |

**`set[T]` 的旁证（仓内权威，不是 C 默认值）**：`src/std/system.cheng:2817-2824` 体内直接写 `let bits = uint64(s)`、`let mask = uint64(1) << idx`、`out = (bits & mask) != 0`
⇒ `set[T]` 的**语义就是 64 位掩码**，`uint64(s)` 这条**类型转换**是语言层对它的 ABI 断言 ⇒ 布局 8/8、tag `LocalI64Tag` 有**仓内证据**。
**C 链给不出这个结论**：`cold_exact_return_type_id_from_signature`（`cold_parser.c:1550-1638`）对 `set[T]` 会走 `cold_exact_abi_builtin_type_id`（`:1577-1581`，`"set[T]"` 不在表内 ⇒ `-1`）→ `cold_exact_nominal_type_projection_id`（`:1628-1632`，无声明 ⇒ `-1`）→ 最后落 `:1633-1637` 的 `kind * domain_size`，而 `kind` 是 `cold_param_kind_from_type:5385-5453` 对 `"set[T]"` 走到的**默认值 `'i'`**（`:5453`）⇒ **C 给 `set[T]` 的 exact TypeId 与 `int32` 同身份**。这是 C 的默认值泄漏，**不得当语义**。

### 11.3 Send / Sync

| 面 | 位置 | 缺失/不一致时的判词或行为 |
|---|---|---|
| 生产（intern） | `typed_expr_type_arena.cheng:1178-1187`（标量：`str`⇒managed；`cstring`/`ptr`⇒非 Send 非 Sync；其余⇒Send+Sync）；Apply 继承 `children[0]` 在 `:1252-1262` | —— |
| 重算（fixed point） | `:1629-1656`：标量同上（`:1629-1635`）；`Sequence/RefObject/**GenericParameter**`⇒`managed=1`（`:1636-1639`）；`Function`⇒Send+Sync（`:1640-1642`）；`FixedArray/Tuple/Object/Enum/**Apply**/Alias/Optional`⇒**Send+Sync 的 greatest fixed point**（`:1643-1653`） | 生产与重算不一致：`:10169` `typed expr type arena: trait rule or premise drift`；`:6182` `inherited trait premise cardinality drift` |
| 可移植镜像 | `compiler_snapshot_schema.cheng:5873-5880`（`TypeScalar` 行的 managed/send/sync） | 与 arena 不一致：`:6002` `csg compiler snapshot: type trait conclusion mismatch` |

**一致性的构造性保证**：intern（`:1252-1262`）令 Apply 的三旗 = `children[0]`；重算（`:1643-1653`）令 Apply 起点为 Send+Sync 并由 fixed point 从子节点收敛 ⇒ 只要**头标量自身的三旗自洽**，两侧一致。⇒ 仍然塌缩成同一个问题。

### 11.4 需要裁定的最小问题清单（一行一问 + 建议）

> 全部只需裁定**内建头标量**的三个量；`typedesc[T]` / `set[T]` 的应用行自动继承（§11 开头）。

**Q1（layout）：`typedesc` 作为内建头标量的精确布局取什么？**
建议 **(a) `layoutPresent=false, sizeBytes=0, alignBytes=1`** —— 直接复用既有的 `TypedExprStructuralTypeGenericParameter` 分支（`compiler_csg.cheng:12632-12636`），理由：`typedesc[T]` 是"类型层参量、运行期值被擦除"，与 GenericParameter 同类；C 给该 APPLY 的 `exact_type_id = -1`（无 ABI 身份，`:78437`）与此一致。
**未测风险**：`layoutPresent=false` 是否会让 `compiler_snapshot_builder.cheng:13965-13973` 计 `missingDeclarationLayoutCount` 而 admissionBlocked —— 今天 GenericParameter 形参走的就是 `false`，所以**大概率**已被容忍，但我**没有验证**（§13）。

**Q2（coreir tag）：`typedesc` 的终端 tag 取什么？**
建议 **(a) 不复用任何既有 tag，按 Q1 的"无布局"走 GenericParameter 路径的等价处理**（即让 `typedesc[T]` 在 `CanonicalTypeChainPhysicalTypeId` 后停在一个"不产生物理槽位"的状态）；若裁定必须有 tag，建议 **(b) `LocalPtrTag`**（类型见证按句柄对待，与 `cstring`/`ptr` 同列）。
**不建议** `LocalI32Tag`（`:143` 的兜底）：那是静默默认，正是 `ptr` 战役点名的最危险形态。

**Q3（coreir tag/layout，`set[T]`）：`set[T]` 的布局与 tag？**
建议 **8 字节 / 8 对齐 + `coreir.LocalI64Tag`**，依据是**仓内源码自己写的** `uint64(s)`（`src/std/system.cheng:2821`），不是 C 的默认值（§11.2）。

**Q4（Send/Sync）：`typedesc` 与 `set[T]` 的三旗？**
建议 **`typedesc`：`managed=0, send=0, sync=0`**（类型见证不是运行期值，按 `cstring`/`ptr` 的"地址类"同列）；
建议 **`set[T]`：`managed=0, send=1, sync=1`**（它是纯 `uint64` 位掩码，与 `uint64` 同列）。二者都必须**三处同时改**（`:1183-1187` 生产 / `:1633` 重算 / `compiler_snapshot_schema.cheng:5876-5878` 镜像），否则 §11.3 的判词。

**Q5（闭表 arity）：内建构造器头的 arity 由谁定？**
建议 **闭表**（`typedesc`→1、`set`→1），**arity 不符即 hard-fail**；不得由 `BracketArgCountAt` 自由取（§10.5 fail-closed）。

**Q6（选型）：B1+B3，还是 B1+B2？**
建议 **B1+B3**（§10.6）；B2 仅在"必须逐号对齐 C 的 SET=14"时启用。

---

## 12. T5：现势读数 —— 缺失内建所在源与森林位置

### 12.1 已测：11 源夹具森林逐源还原（读数为实测，非推断）

`.rebuild/s1b_step3/r9/repro_btypes_r9.stderr.txt` 的 `csg_mem tag=forest src=N bytes=M` 行给出**每源的精确字节数**；
用"字节数在全仓唯一"做键（`find src -name '*.cheng' -size <M>c`）得到逐源路径：

| 森林序 | 路径 | bytes |
|---|---|---|
| 0 | `src/chain/binary_types.cheng` | 6917 |
| 1 | `src/tests/r9_btypes_const_bracket_main.cheng`（= 夹具 65 字节副本） | 65 |
| 2 | `src/std/bytes_layout.cheng` | 14020 |
| 3 | `src/std/crypto/sha256.cheng` | 33495 |
| 4 | `src/std/rawbytes.cheng` | 10874 |
| 5 | `src/std/rawmem_support.cheng` | 2184 |
| 6 | `src/std/result.cheng` | 2730 |
| 7 | `src/std/seqs.cheng` | 13214 |
| 8 | `src/std/strings.cheng` | 13660 |
| 9 | `src/std/strutils.cheng` | 13065 |
| **10** | **`src/std/system.cheng`**（**判词现场 `source_index=10`**） | 103363 |

**结论（实测）**：
- `src/std/system.cheng` 在这条链上是**最后一源（第 11/11）**；`typedesc`（`:2723`）与 `set[`（`:2817`）**同在这一源**；
- `src/core/option.cheng`(498B) / `src/runtime/option.cheng`(665B) / `src/tests/cold_open_generic_formal_authority_smoke.cheng`(320B) **不在**这条 11 源森林里（三个字节数都没出现）⇒ 夹具链只经 `system.cheng` 踩到 G1。

### 12.2 排序规则与一处未定位的重排（诚实标注）

- **规则（读自源码）**：`src/core/backend/system_link_plan.cheng:4608-4617` 调 `parser.ParserCollectClosureWithExternalPackageRoots`
  （`src/core/lang/parser.cheng:40806-40908`）= **BFS 工作队列**：entry 入队为 0（`:40835-40836`），`while scanPos < newOrdered.len`（`:40839`）逐源展开 import 边（边序 = `ParserReadImportEdgesWithExternalPackageRoots` 的产出序，`:40866-40872`），新目标按发现序追加（`:40897-40901`）。
- **不一致处（未定位）**：纯 BFS 下 entry（夹具，65B）应在 index 0，但实测 index 0 = `src/chain/binary_types.cheng`、entry 在 index 1。⇒ 在 link-plan 与 compiler_csg 的森林之间**存在一步我未定位的重排**（候选位置：`system_link_plan.cheng:4325` `SystemLinkPlanBindSourceClosureIdentityFromFiles` / `:4411` `…BindSourceClosureGraphFromFiles`）。**这是本报告唯一没查到底的机械问题**，不影响 §12.1 的实测结论与 §12.3 的排期结论。
- **234 源森林**：我没有找到该规模的 `forest src=` 日志（`.rebuild` 全量 grep 超时被终止）。⇒ **"`src/std/system.cheng` 在 234 源森林里排第几"未测**。

### 12.3 与排期有关的三条（不依赖森林序）

1. **G1 与 G2 在同一源文件、同一 arena 构建里**：`:2723` 在前、`:2817` 在后 ⇒ **typedesc 一过，下一条判词极可能立刻换成 `name=set`**；分两次修 = 两次编译槽 + 两次回归，**必须一次做完**。
2. **`set[` 全仓只有一处**（`src/std/system.cheng:2817`），所以 G2 的触发面积是"1 源 1 行"，不会因森林顺序而在别处提前爆。
3. **G3 的另外 4 个名字**（`f32/f64/bytes_view/utf8_view`）今天只在 `src/.gen/`（生成目录，不在 `src/std`+`src/core` 面）与两个 `src/tests/**` 里以**类型位**出现 ⇒ **优先级低于 G1/G2**，但既然闭表要一次补齐，建议同轮补掉（成本 = 表项 + 与 `ptr` 同形的 6 处镜像）。

---

## 13. 第二轮未测项（追加到 §7）

| # | 未测项 | 影响 |
|---|---|---|
| 11 | **`layoutPresent=false` 的后果未验证** | Q1 建议 (a) 依赖它；今天只有 `GenericParameter` 走这条（`compiler_csg.cheng:12632-12636`），其消费者是否把它计成 missing（`compiler_snapshot_builder.cheng:13965-13973`）**未跑** |
| 12 | **Cheng 的 Apply trait 一致性（intern `:1252-1262` vs 重算 `:1643-1653`）对 builtin 头未验证** | 结论"只要头自洽就一致"是读码推演 |
| 13 | **`typeProjectionExactLayoutRowByArenaType` 是否覆盖 Scalar 行** | B1 的第 4 处改动（`headTypeIdOut = children[0]`）要求头行的布局行存在；`BuildInto` 的过滤条件未读全 |
| 14 | **234 源森林的逐源列表与 `src/std/system.cheng` 的序位未测** | §12.2；`.rebuild` 全量检索超时 |
| 15 | **§12.2 的重排步骤未定位** | 不影响实测结论，但若将来要"按森林序预测下一个撞墙源"，必须先补上这一步 |
| 16 | **`bytes_view`/`utf8_view` 是否在某个森林闭包内以类型位出现未验证** | `src/tests/call_hir_closure_visible_leaf.cheng:1`、`src/tests/sabi_string_bridge_smoke.cheng` 的闭包成员资格未查 |
| 17 | **`set[T]` 的 exact TypeId 在 C 链的实测值未取** | §11.2 的推论（落到 `SLOT_I32 * 1048576`）是从 `cold_parser.c:1550-1638` + `:5453` 读出的三段推演，**未取判词/未加探针** |
| 18 | **仍未编译、仍未 apply、仍无补丁** | 本轮全部结论都是静态读码；§10.5 的"逐位不变"是构造性论证，不是实测 CID 对比 |

**本轮交付**：§8 契约全表 / §9 三态表 / §10 选型（B1 推荐 + B2 备选 + 三条排除）/ §11 三个量的消费者-失败签名-最小裁定清单（Q1–Q6）/ §12 现势读数。**未写任何源文件，未生成任何补丁，未 apply，未编译。**

---

# 第三轮（Q1–Q6 裁定后）：补丁落地

## 14. 交付物

| 项 | 值 |
|---|---|
| 补丁 | `patches/builtin_type_constructor_arity.patch` |
| 冻结副本 | `.rebuild/s1b_step3/r9/patchgen/builtin_type_constructor_arity.frozen.patch` |
| sha256（两件相同） | `a96410958432ea1250129a27c9ce03593189b66bab3403dd7776f044ffef1ee7` |
| `cmp` | 逐字节相同（`cmp` 无输出，exit 0） |
| `git apply --check` | **exit 0**（基线 = **当前工作树**，含 op-lane 未提交 WIP） |
| `git apply --stat` | 5 文件 / **+226 −10** |
| 生成方式 | `.rebuild/s1b_step3/r9/patchgen/builtin_ctor_gen.py`：读当前文件 → 每条锚点断言 `count == 1` → 内存内替换 → `difflib` 出 diff。**未写任何源文件** |
| 未做 | **未 apply、未编译**（编译槽由 owner 统一调度） |

`typedesc` 与 `set` 在**同一补丁**（B1 + B3 一个机制 + 一张闭表），按 §12.3 的"同源相邻必须一次做完"。

## 14.1 改动清单（每条 = 当前树锚点行 + 一句作用）

| # | 文件 | 锚点（改前 `@@`） | 作用 |
|---|---|---|---|
| 1 | `typed_expr_type_arena.cheng` | `@@ -46,6` | `TypedExprStructuralScalarKind` **末尾追加** `Typedesc`、`Set` 两个成员 |
| 2 | 同上 | `@@ -1043,7` | 拼写表加 `"typedesc"` / `"set"` 两条；其后新增闭表函数 `typedExprTypeArenaBuiltinConstructorArity`（`typedesc`→1、`set`→1、其余→0） |
| 3 | 同上 | `@@ -1181,10` | intern 的 send/sync 默认分支**排除 `Typedesc`**（`Set` 保持 Send/Sync） |
| 4 | 同上 | `@@ -1630,7` | 重算（fixed point）同判 —— 与 #3 必须一致 |
| 5 | 同上 | `@@ -1807,6` | `ResolveNominal` 标量快径前置守卫：**内建构造器名必须处于 `BracketApply` 的 `child[0]`，否则 hard-fail**（Q5 追加条的落点） |
| 6 | 同上 | `@@ -7586,6` | `BracketApply` 新增 **builtin 头臂**：`authorityRow < 0` 且基行是内建构造器标量 ⇒ 按**闭表 arity** 校验后 `intern(TypeApply, symbolId=-1, children=[基, 实参…])` |
| 7 | 同上 | `@@ -10023,6` | 严格校验：算 `builtinHeadApply`（`Apply` + `symbolId == -1` + `child[0]` 是 Scalar 行） |
| 8 | 同上 | `@@ -10044,7` | `symbolic` 判据加 `&& !builtinHeadApply`（**唯一一处准入放宽，窄到该形状**） |
| 9 | 同上 | `@@ -10452,6` / `@@ -10475,6` | 两个 reserved 标量查询**显式**排除 `Typedesc`/`Set`（语义与改前一致——原本靠 `> ScalarCString` 已被排除） |
| 10 | `compiler_csg.cheng` | `@@ -12567,7` | 标量布局：`set` 归 8/8（依据 `std/system.cheng:2821` 的 `uint64(s)`） |
| 11 | 同上 | `@@ -12616,7` | `typedesc` 走**前置分支**：`layoutPresent=false, size=0, align=1`（Q1 裁定 (a)） |
| 12 | `canonical_type_chain.cheng` | `@@ -125,12` | `typedesc → LocalPtrTag`、`set → LocalI64Tag`（Q2/Q3） |
| 13 | 同上 | `@@ -140,6` | **拆地雷**：把 `:143` 的"未知 scalarKind 静默 `return LocalI32Tag`"改为**显式 32 位族白名单 + `panic(Fmt"...kind={scalarKind}")`**（Q2） |
| 14 | `compiler_snapshot_schema.cheng` | `@@ -137,6` | **末尾追加**可移植常量 `CsgCompilerScalarTypedesc=17`、`CsgCompilerScalarSet=18` |
| 15 | 同上 | `@@ -5189,7` | `csgCompilerScalarKindValid` 上界 `Ptr(16)` → `Set(18)` |
| 16 | 同上 | `@@ -5875,7` | Send/Sync 可移植镜像同步排除 `Typedesc`（与 #3/#4 三处一致） |
| 17 | `compiler_snapshot_builder.cheng` | `@@ -13941,6` | 快照投影：**builtin 头的 Apply 按 kind 放行（`continue`）**，与 Sequence/Optional/GenericParameter 同一处理方式 |
| 18 | 同上 | `@@ -14053,6` / `@@ -14074,6` | arena scalar → 可移植序数映射 + 规范文本（`"typedesc"` / `"set"`） |

## 14.2 Q1 的"先证后选"（裁定 (a) 的三条依据）

**Q1 要求：证明 GenericParameter 行不被 `compiler_snapshot_builder.cheng:13965-13973` 计成 missing，证得出来才用 (a)。**

- **F1（证明）**：`compiler_snapshot_builder.cheng:13932-13938` —— `Borrow / Sequence / FixedArray / Alias / **GenericParameter**` 这一组在**任何 layout join 之前**就 `continue` 了。所以 `GenericParameter` 的 `layoutPresent=false` **从不进入** `missingDeclarationLayoutCount`。⇒ 裁定所指的证明成立。
- **F2（对本案的追加证明，它决定了能不能照搬 (a)）**：`compiler_snapshot_builder.cheng:13705-13748` 的 `…ExactLayoutRowByArenaTypeBuildInto` 只把 **`TypedExprStructuralTypeObject` / `TypeRefObject`** 行写进那张表（`:13738-13742`，其余 kind 一律 `continue`）。⇒ **任何 Scalar 行都不可能满足 `:13965-13969` 的 layout join**。而我们的 `typedesc[T]` 是 `Apply`，原本会落进 `:13941-13943` 的 nominal join。⇒ **必须**让 builtin 头的 Apply 也走"按 kind 放行"（改动 #17）；放行之后，头标量的 `layoutPresent` 不再被该 join 读取。
- **F3（先例）**：`layoutPresent=false` 的行今天已经作为**形参类型**在用 —— 每个 `fn f[T](x: T)` 的 `T` 就是 `GenericParameter` 行；`src/std/system.cheng:2735` 的 `fn max(a: T, b: T): T` 即实例。⇒ "无布局的 formal"是被接受的既有状态。

⇒ 采 **(a)**：`typedesc` 头标量 `layoutPresent=false, sizeBytes=0, alignBytes=1`（改动 #11），**不是**"大概不会"，而是 F1+F2+F3 三条读出的事实。

## 14.3 "改前判据 / 改后判据"逐点对照

| 面 | 改前判据 | 改后判据 | 对既有输入是否变化 |
|---|---|---|---|
| 权威过滤 `arena:4968-4970` / `:3619-3621` | `scalarKind != Invalid ⇒ continue` | 同（新 kind 自动纳入） | 否（只有新拼写会命中） |
| 物化标量快径 `arena:1808-1817` | `Nominal && !Invalid ⇒ 内联 Scalar 行` | 前置守卫：**构造器名必须处于 `BracketApply.child[0]`**，否则 `builtin type constructor requires a bracket application head` | 否（既有名字 `arity()==0`，不进守卫） |
| bracket 回退 `arena:7589-7593` | 无权威 ⇒ 必须定长数组 | 其前插 builtin 头臂；**arity ≠ 闭表值即 hard-fail** | 否（既有输入基行不是构造器标量） |
| `symbolic` 校验 `arena:10047-10048` | `symbolic ⇒ symbolId >= 0` | `symbolic && !builtinHeadApply ⇒ symbolId >= 0` | 否（`builtinHeadApply` 要求 `Apply + symbolId==-1 + child0 是 Scalar`，改前不可达） |
| 生产/重算 send·sync `arena:1183-1187`、`:1632-1635` | `str`⇒managed；`cstring`/`ptr`⇒非 Send 非 Sync；其余⇒Send+Sync | 追加 `typedesc` 到"非 Send 非 Sync"；`set` 留在"Send+Sync" | 否（既有 kind 判定逐字不变） |
| reserved 标量 `arena:10454`、`:10479` | 显式排 `Ptr`/`Int`/`UInt`（且 `> CString` 已排除新 kind） | 追加显式排 `Typedesc`/`Set` | 否（**语义完全相同**，只是从"靠序数"改为"显式"） |
| 标量布局 `csg:12567-12573` | `cstring/ptr` 等 → 8/8 | 追加 `set` → 8/8 | 否 |
| 布局入口 `csg:12619-12622` | 直接调 `compilerCsgExactScalarLayoutInto` | `typedesc` 前置分支 → `present=false/0/1`；其余走原 `elif` | 否 |
| coreir tag `ctc:125-133` / `:134-139` | `cstring/ptr`→Ptr；`int64/uint64`→I64 | 追加 `typedesc`→Ptr、`set`→I64 | 否 |
| **coreir 兜底 `ctc:143`** | 其余 scalarKind **一律** `return LocalI32Tag`（含未知值） | 显式 32 位族白名单 → I32；**其余 `panic(kind=…)`** | **对 18 个既有 kind 输出逐位相同**；唯一变化是"改前不可达的未知值"由静默变响 |
| schema 常量 `schema:139-140` | `Ptr = 16` 为末值 | 追加 `Typedesc=17`、`Set=18` | 否（末尾追加） |
| schema 合法域 `schema:5191` | `[Bool, Ptr]` | `[Bool, Set]` | 只放行 17/18 两个新值 |
| schema trait 镜像 `schema:5876-5879` | 排 `Str/CString/Ptr` | 追加排 `Typedesc` | 否 |
| arena→schema `builder:14054` / 文本 `:14076` | 无 | 追加 2 + 2 条 | 否（只有新 kind 命中） |
| Apply 投影 `builder:13941-13943` | 一律走声明 join | 前置：`child[0]` 是 Scalar ⇒ `continue` | 否（既有 Apply 的 `child[0]` 是 Object/RefObject 行 ⇒ `builtinApplyHead=false`） |

## 14.4 "无关输入逐位不变"的自证（逐面）

1. **枚举序数**：两处（`TypedExprStructuralScalarKind` 的两个成员、`CsgCompilerScalar*` 的两个常量）**一律追加在末尾** ⇒ 既有成员的 `Int32(...)` 值全部不变 ⇒ `typedExprTypeArenaTypeHash:1057-1079` 的哈希材质不变。
2. **拼写表**：新增两条 arm 只对 `"typedesc"`/`"set"` 生效；其余 18 个拼写返回**原来那个** kind。
3. **种子行 / `typeCount`**：`typedExprTypeArenaSeedSemanticScalarRows:1566-1596` **一字未动** ⇒ 不出现新形态的 arena 行数不变。
4. **符号域 / `symbolCount`**：未引入任何内建 SymbolId，`symbolByDeclarationRoot` 播种与 seal 对账路径**未动** ⇒ `symbolCount` 列不变（这正是 §3.2 D2 的排除项）。
5. **artifact 列**：既有输入走的是同一批代码路径、写入同样的值；唯一新增的写入（`TypeApply` with `symbolId=-1`）只在**改前不可能存在**的形状上发生。
6. **可移植 wire 布局**：未增删字段、未改字段顺序；builtin 头的 Apply 走**同一个** `CsgCompilerTypeApply` 路径，`declSymbolId=-1` 本来就被 `csgCompilerOptionalIndexValid:2644-2645` 与 `csgCompilerTypeCidAppendOptionalSymbol:5692` 支持 ⇒ 既有行的 preimage 逐字节不变。
7. **投影准入集合**：新增的 `continue`（#17）以 `child[0].kind == Scalar` 为条件，而改前**不存在** Scalar 头的 Apply ⇒ 对既有输入准入集合不变。
8. **coreir tag**：#13 的 panic 只在 `scalarKind` 落在白名单**之外**时触发；改前能到达 `:143` 的每个 kind 都被显式列进白名单 ⇒ 既有输入的 tag 输出逐位相同。
9. **新增 hard-fail**：#5（裸构造器）、#6（arity 不符）都以"改前不可能出现的拼写/形状"为条件 ⇒ 对既有输入不可达。

⇒ **结论：对不含 `typedesc`/`set`（含裸拼写与带参形态）的输入，arena `artifactRaw32`、可移植 type CID、快照 admission 结论、布局与 coreir tag 全部逐位不变。**

## 14.5 `@borrows` 自查（硬要求 2）

| 新增/改动的函数 | 非 var 形参 | 是否需要 `@borrows` | 依据 |
|---|---|---|---|
| `typedExprTypeArenaBuiltinConstructorArity(scalarKind: TypedExprStructuralScalarKind)` | **仅一个 enum** | **不需要** | 规则是"只读访问器形参取非 var 的 `tree`/`value` 必须 `@borrows`"；该形参既不是 `tree` 也不是 `value`，且是值类型 enum。同文件先例：`typedExprTypeArenaHashStep(value: int32, item: int32): int32`（`:1048`）无 `@borrows` |
| 该函数的两处调用点 | 传的是 `ResolveNominal` 的局部 `let scalarKind` 与 bracket 臂的临时 `TypedExprStructuralScalarKind(...)` | 均非 borrowed actual | 不存在 `borrowed actual cannot bind non-var non-@borrows formal` 的触发条件 |
| 新调用的四个只读访问器 | `typedExprTypeArenaSyntaxKindAt` / `SyntaxChildAt` / `SyntaxBracketArgCountAt` / `SyntaxBracketArgTypeNodeAt` | 它们**自身**是 `@borrows`（`:446`、`:474`、`:578`、`:585`） | 调用点位于 `typedExprTypeArenaResolveNominal`（`@borrows`，`:1787`）与 `typedExprTypeArenaInternSyntaxRec`（`@borrows`，`:7279`）内，与既有同形调用一致 |

⚠ 这一条是**按规则解释**得出的（不是"照抄某个先例"）：如果烤炉报 `borrowed actual cannot bind non-var non-@borrows formal`，第一处要加的就是给 `typedExprTypeArenaBuiltinConstructorArity` 补 `@borrows`（加它应当无害，只是本席按规则字面判定不需要）。

## 14.6 第三轮未测项（追加到 §7/§13）

| # | 未测项 | 影响 |
|---|---|---|
| 19 | **仍未编译、仍未 apply** | 本补丁的全部结论来自静态读码 + `git apply --check`；"逐位不变"是**构造性论证**，不是实测 CID 对比 |
| 20 | **`layoutPresent=false` 的运行时后果未实测** | F1/F2/F3 证明它不被投影计入 missing、且 GenericParameter 形参今天就这么走；但 `typedesc[T]` formal 在 BodyIR/参数槽的实际处理未跑 |
| 21 | **builtin 头下 Apply 的两侧 trait 一致性未实测** | §11.3 的构造性论证（intern `:1252-1262` 与重算 `:1680-1694` 都从 `children[0]` 取）是读码推演 |
| 22 | **arity 闭表只有 2 项** | `typedesc`/`set` 之外的内建构造器（若将来出现）必须显式入表；不入表即落回定长数组回退并在 `:7592` 报错（**响亮，不静默**） |
| 23 | **`bytes_view`/`utf8_view`/`f32`/`f64` 4 个缺名未同轮补** | 按 owner 末条"若补名会扩大风险面就分开报"：这 4 个名字各自需要 layout/tag/Send·Sync 裁定，且 `f32` 在 `coreir` 里**没有** `LocalF32Tag`（`core_types.cheng:195-200` 只有 I32/F64/Str/Ptr/Aggregate/I64）⇒ 会引入新的语义裁定面。**建议单独一轮**。它们今天只在 `src/.gen/`（生成目录）与两个 `src/tests/**` 里以类型位出现 |
| 24 | **`exact_def_freeze.cheng:786-788` 未动** | 该谓词问"是不是地址叶"。`set` 是值（非地址叶，与现状一致）；`typedesc` 未裁定。相关形态（`typedesc[T][]` 之类定长数组）仓内不存在 ⇒ 本轮不动，**列入待裁定** |
| 25 | **未核验 `Fmt` 在 `canonical_type_chain.cheng` 的可用性** | 该文件原本零 `Fmt"` 用法。依据 `docs/cheng-formal-spec.md:119`/`:544`，`Fmt"..."` 是**语言前缀语法**（不是库函数），故无需 import。若烤炉报未定义，改法是把 `panic(Fmt"...")` 降为 `panic("canonical type chain: scalar local kind unsupported")`（丢失 kind 值） |
| 26 | **`typedExprTypeArenaBuiltinConstructorArity` 是否需要 `@borrows` 未实测** | 见 §14.5 的判定与回退动作 |

**第三轮交付**：补丁 + 冻结副本（sha256 `a9641095…`，两件逐字节同）+ `git apply --check` exit 0 + §14.1 落点表 + §14.2 Q1 证明 + §14.3 改前/改后判据对照 + §14.4 逐位不变自证 + §14.5 `@borrows` 自查 + §14.6 未测项。**未 apply、未编译、未改任何源文件。**

---

# 第四轮（kd_r17 实测换墙后）：preflight 孪生未同步

## 15. 判词点定位与判定

### 15.1 判词点：**preflight**（不是物化臂）

同一句错误串在文件里**有两处**（`grep -n "bracket apply authority incomplete"`）：

| 行（当前树） | 函数 | 相位 |
|---|---|---|
| **`:2138`** | `typedExprTypeArenaPreflightBracketAuthority`（`:2049-2140`） | **seal 相 preflight** |
| `:7694` | `typedExprTypeArenaInternSyntaxRec` 的 `BracketApply` 回退 | 物化相 |

调用顺序（`typed_expr_type_arena.cheng:8510-8519`，同一次 `AppendSourceFromTreeInto`）：

```
8510:  typedExprTypeArenaMaterializeBracketConstLengths(...)      ← 填 bracketConstLengths
8513:  typedExprTypeArenaPreflightBracketAuthority(...)           ← ★ 在这里失败
8516:  typedExprTypeArenaInternSyntaxRec(...)                    ← 第三轮加的 builtin 头臂在这里，根本没轮到
```

⇒ **判定：是"臂没走到"，不是"实参还需权威"。** 依据是**读码可证的调用顺序**：preflight（`8513`）严格早于物化（`8516`），而 preflight 里**没有任何** builtin 头的分支 —— 第三轮我改了物化孪生（`:7694` 那一侧），漏了 preflight 孪生（`:2138` 那一侧）。这与判词形态也一致：错误串**不带任何坐标**，与 preflight 的其它失败同形。

### 15.2 完整判据：两半各靠什么列

`typedExprTypeArenaPreflightBracketAuthority` 对每个 `ParserTypeSyntaxBracketApply` 行（`:2073-2076`）算：

```
2083:  let authorityRow = typedExprTypeArenaAuthorityRow(state, baseTypeSyntaxNode)
2085:  var genericCount: int32
2086:  var genericStart: int32 = -1
2087:  if authorityRow >= 0 && (base 是 Nominal 或 Qualified):
2100:      typedExprTypeArenaDeclarationGenericWindowAt(state, declarationRoot, genericStart, genericCount, err)
2104:  let argCount = typedExprTypeArenaSyntaxBracketArgCountAt(value, row)
2106:  if genericCount > 0:   ← 「exact generic SymbolId」那半
2136:  else:                  ← 「bounded const AST」那半
2137:      if state.bracketConstLengths[row] <= 0:  → ★ :2138 判词
```

| 半 | 靠什么列 | `typedesc[T]` / `set[T]` 缺哪一步 |
|---|---|---|
| `exact generic SymbolId` | `state.authority.declarationRootTypeSyntaxNodeIndexes[authorityRow]`（`:2092-2094`）→ `typedExprTypeArenaDeclarationGenericWindowAt`（`:2100`）→ `state.declarationGenericSymbolStarts/Counts` | **`authorityRow < 0`** —— 内建构造器是**标量拼写**，在权威相就被 `typed_expr_type_arena.cheng:4968-4970`（树版 `:3619-3621`）`continue` 掉了，**永远没有权威行** ⇒ 判据 `:2087` 不成立 ⇒ `genericCount` 恒为 0 ⇒ **这半永远进不去** |
| `bounded const AST` | `state.bracketConstLengths[row]`（由 `typedExprTypeArenaMaterializeBracketConstLengths` `:2022-2040` 在 append 相用 `typedExprTypeArenaBracketConstLength` `:1985-2003` 填） | 该列只在「单个 bracket 实参 **且** 该实参是类型节点为空的正 int32 常量」时才被填（`:1988-1993` 两条前置）；`typedesc[T]` 的实参是**类型节点** ⇒ 恒 `-1` ⇒ **这半也进不去** |

⇒ 两条路对 builtin 头**都不可达**，必然落 `:2138`。**这不是"顺序问题"，是"preflight 完全不知道 builtin 构造器这回事"。**

## 16. 修法：给 preflight 一份 append 相记下的判决（复用文件自己的先例）

**要求"不许放宽成没有权威就跳过"** —— 所以**不是**在 preflight 里加个 `continue`，而是把 append 相已经能算准的事实**显式记成一列**，preflight 读它并**照样硬校验**。

### 16.1 为什么必须"记列"而不能在 preflight 现算

- preflight 的契约是"**driven entirely from arena columns**"（注释 `:2042-2047`）——它跑在 seal 相，**每棵源树都已释放**（同注释；`typedExprTypeArenaMaterializeBracketConstLengths` 的存在理由就写在同一处 `:2016-2020`）；
- 要在 preflight 认出"基名是内建构造器"，需要 token 文本；而**类型语法列里没有 token 文本**，只有 token 下标（`typeSyntaxNameTokenIndexes`），取文本要 `parser.ParserValueExprTokenText(tree, token)` ⇒ **要树**。
- ⇒ 唯一与既有设计一致的走法：**append 相（树还在）算一次，写进 global 行；preflight 读列**。这与 `bracketConstLengths` **逐字同构**，是文件自己规定的模式。

### 16.2 改动清单（4 处，全部在一个文件）

| # | 锚点（改前 `@@`） | 作用 |
|---|---|---|
| 1 | `@@ -405,6`（state 字段） | 新增 `builtinConstructorArities: int32[]`，注释写明 `-1` = 非内建构造器、正值 = 闭表 arity |
| 2 | `@@ -2039,6` | 新增 `typedExprTypeArenaMaterializeBuiltinConstructorArities`：遍历本源的 `BracketApply` 行 → 取 child 0（必须是 `Nominal`）→ `ParserValueExprTypeSyntaxNameTokenAt` → `ParserValueExprTokenText` → `typedExprTypeArenaScalarKind` → `typedExprTypeArenaBuiltinConstructorArity`；>0 才写进 global 行。**非 Nominal 基（限定名/序列/元组…）一律不写**，保持原路径 |
| 3 | `@@ -5280,16`（`AllocateFromLimitsInto`） | 与 `bracketConstLengths` **同一处、同一形状**分配并全填 `-1` |
| 4a | `@@ -8510,6` | 在 `MaterializeBracketConstLengths` 之后、**preflight 之前**调用新填充（顺序与第 3 轮诊断一致） |
| 4b | `@@ -2062,6`（preflight 视图守卫） | 加 `state.builtinConstructorArities.len != state.typeSyntaxCount` 的 fail-closed 不变量（与既有 `bracketConstLengths.len` 同列） |
| 4c | `@@ -2134,7`（preflight `else`） | 单条 `if bracketConstLengths<=0` → **`if builtinArity > 0: <arity + CSR 硬校验> elif bracketConstLengths<=0: <原判词，一字未改>`** |

### 16.3 实参怎么算（规范 `:531-536` 不许按文本重建）

- **实参从不按文本重建**：物化臂用的是 `children[argOffset + 1]`，即该实参 TypeSyntax 行**已物化的 TypeId**（第三轮补丁）；preflight 侧只校验 **CSR 结构**（`BracketArgTypeNodeAt(row, i) == ChildAt(row, i+1)`），不碰身份。
- **`T` 走精确 `genericSymbolId`**：`typedesc[T]`/`set[T]` 的 `T` 在权威相由 `typedExprTypeAuthorityFindGenericSymbolSourceInto`（`:4974-4986`）按**精确泛型符号行**解析；第一轮判词从 `name=T` 推进到 `name=typedesc` 本身就证明这条窗口已经建好。
- **两个用例的 binder 形态核对（owner 点名要查）**：
  - `src/std/system.cheng:2723` `fn newException(t: typedesc[T], message: str): T` —— **没有**显式 `[T]`（隐式泛型，规范 `:520-527`）。第一轮判词里的 `root_generic_count=1` 就是它的隐式窗口。
  - `src/std/system.cheng:2817` `fn setHas(s: set[T], value: T): bool` —— **同样没有**显式 `[T]`，与 `newException` **同形**（`(s: set[T], value: T)` 里 `T` 是该例程的隐式 binder），因此由**同一个签名窗口机制**覆盖。
- **同族里的下一个候选墙（不是本补丁的范畴，但同源同函数）**：`src/std/system.cheng:2726` 的 `var e: T` 是**局部绑定注解**，走的是另一条根创建路径（`parser.cheng:24469-24506`）。该路径**已经有窗口分支**：`bindingRoutineGenericCount > 0` 时用 `ParserValueExprAppendTypeSyntaxRootWithGenericSymbols`（`:24485-24496`），而窗口来源是 `declarationGenericSymbolStarts[activeFunctionDeclarationRow]`（`:24470-24477`），该列由 `ParserValueExprSetDeclarationGenericSymbols`（`parser.cheng:9722-9746`）写在**声明行**上。⇒ **看起来已覆盖**（隐式泛型补丁确实在声明行写了窗口），但**本席没有实测**：若下一炉判词变成 `name=T`（`source_index=10`、`root_generic_count=0`），那就是这条绑定注解路径没拿到窗口 —— 请按这个坐标定位。

## 17. 交付物（第四轮）

| 项 | 值 |
|---|---|
| 补丁 | `patches/builtin_type_constructor_bracket_preflight.patch` |
| 冻结副本 | `.rebuild/s1b_step3/r9/patchgen/builtin_type_constructor_bracket_preflight.frozen.patch` |
| sha256（两件相同） | `87e7efb4693ff911a993520cae7c4a4c5b140ed5259f08828f4d506609d27bd5` |
| `cmp` | 逐字节相同 |
| `git apply --check` | **exit 0**（基线 = **当前工作树**，已含第三轮补丁 + E1/E2/E1b + BodyIR 三枚） |
| `git apply --stat` | 1 文件 / **+86 −1** |
| 生成器 | `.rebuild/s1b_step3/r9/patchgen/builtin_ctor_preflight_gen.py`（锚点断言唯一、内存内替换、**未写任何源文件**） |
| 第三轮补丁 | **未被覆盖**：`patches/builtin_type_constructor_arity.patch` sha256 仍为 `a9641095…` |
| 未做 | **未 apply、未编译** |

## 18. "改前判据 / 改后判据"逐点对照

| 面 | 改前判据 | 改后判据 | 对既有输入是否变化 |
|---|---|---|---|
| preflight 视图守卫 `:2064-2071` | `bracketConstLengths.len == typeSyntaxCount` 等 | **追加** `builtinConstructorArities.len == typeSyntaxCount` | 否（新列在 `AllocateFromLimitsInto` 同处分配，长度恒等；这是**新增**的 fail-closed 不变量） |
| preflight `else` 分支 `:2136-2139` | 无权威 ⇒ 必须 `bracketConstLengths > 0` | **先看 `builtinArity`**：`>0` ⇒ 走 arity + CSR 硬校验；否则**原判据一字未改** | 否（`builtinArity` 由 append 相写，既有输入的该列恒 `-1` ⇒ 直接落到 `elif`，逐字同前） |
| append 相 | `MaterializeBracketConstLengths` | **追加同形的一次填充调用** | 否（新函数只写新列；`bracketConstLengths` 的写入点未动） |
| `AllocateFromLimitsInto` | 3 个 global 行空间数组 | 4 个（追加一个） | 否（`state` 是构建期结构，**不进** `TypedExprTypeArena`，见 §19.3） |
| 物化臂（第三轮） | 已存在 | **一字未动** | 否 |

**新增的两条硬失败**（都在 builtin 头这条新形状上）：`builtin type constructor arity mismatch row=… expected_args=… actual_args=…`、`builtin constructor argument TypeSyntax CSR incomplete`。⇒ `typedesc[A,B]`、`typedesc[4]` 这类**响亮地失败**，不会被静默当成别的形状。

## 19. "无关输入逐位不变"自证

1. **新列只写在 `state` 上**：`typedExprTypeArenaBuildState` 是 append/seal 期的构建结构，**不是** `TypedExprTypeArena` 的一部分；artifact 哈希只读 `value.*`（`typedExprTypeArenaHashMaterialized` `:812-1019`）。全仓 `grep` 确认 `typeSyntaxParentNodeIndexes`/`bracketConstLengths` 只出现在「写入 / 读取 / 长度校验」，**没有任何 census / hash / bytes 统计**消费它们 ⇒ 新列同样不进任何 CID。
2. **既有输入的 `builtinArity` 恒为 `-1`**：append 相只在「基行是 `Nominal` 且其名字经闭表映射后 arity > 0」时写入。闭表只有 `typedesc`/`set` 两项，而两者在仓内的**类型位**用法只有 `system.cheng:2723`/`:2817`（`grep` 实证：裸 `typedesc` 0 处、裸 `set` 类型注解 0 处、`set[` 1 处）⇒ 其它任何输入的该列全是 `-1`。
3. **Arena 值逐位不变**：本补丁**不动**任何 `TypedExprTypeArena` 列、不动枚举、不动种子行、不动符号域、不动可移植 schema ⇒ 对不含该形态的输入，`artifactRaw32`、可移植 type CID、布局、coreir tag **全部逐位不变**（第三轮 §14.4 的九条继续成立，本补丁一条都没有触碰它们）。
4. **准入集合的变化面**：唯一被放行的是「`BracketApply` + 基是 `Nominal` + 基名 ∈ 闭表 + arity 与闭表相符 + 实参 CSR 完整」这一种形状；**放行后仍要过 arity 与 CSR 两道硬校验**，不是"没有权威就跳过"。
5. **内存代价**：新增一个 `typeSyntaxCount` 长的 int32 全局数组（夹具 3299 行 ≈ 13 KB；234 源按量级 ≈ 1 MB 级），远低于战役的 768 MiB / 1 GiB 门。

## 20. 第四轮未测项

| # | 未测项 | 影响 |
|---|---|---|
| 27 | **仍未编译、仍未 apply** | 判词点定位来自**调用顺序读码**（`:8510 → :8513 → :8516`）+ 判词形态（无坐标）；"preflight 失败"是**唯一自洽解释**，但没有实测断点/探针读数 |
| 28 | **`var e: T`（`system.cheng:2726`）是否已覆盖未实测** | 见 §16.3 末段；给了确切的下一条判词形态与坐标用于快速判别 |
| 29 | **`setHas` 的隐式泛型窗口是否与 `newException` 同源生效未实测** | 两者同形（均无显式 `[T]`），但只有 `newException` 的窗口被第一轮判词（`root_generic_count=1`）实证过 |
| 30 | **新列的 234 源实际内存未被量** | §19.5 是量级估算，不是测量 |
| 31 | **`Fmt` 在 `canonical_type_chain.cheng` 可用性——已由 kd_r17 销项** | 烤轮 rc=0、driver 生成成功 ⇒ 第三轮 §14.6 第 25 条**关闭**；`Fmt"..."` 确为语言前缀语法 |

**第四轮交付**：新补丁 + 冻结副本（sha256 `87e7efb4…`，两件逐字节同）+ `git apply --check` exit 0 + §15 判词点完整判据 + §16 修法与"为什么记列而不是放宽" + §17 交付表 + §18 改前/改后判据对照 + §19 逐位不变自证 + §20 未测项。**第三轮补丁未被覆盖；未 apply、未编译、未改任何源文件。**
