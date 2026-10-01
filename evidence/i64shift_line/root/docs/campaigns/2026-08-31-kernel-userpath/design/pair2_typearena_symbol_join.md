# pair2：`portable TypeArena Symbol join duplicate` 机制与修法

**〔本席裁决（2026-09-11 深夜，独立复核后批准）〕** 方向成立，**按本补丁落地**：已亲自 read 核对两处——可携带侧的 join（`compiler_snapshot_builder.cheng:24839-24857`）确实只按 `arenaSymbolId >= 0` 认领、且 `24853-24854` **Field 也会写表**、豁免分支在 `24849/24851`；同族**生产** join（`:17145-17156`）的注释逐字写着“the arena grants a declaration SymbolId only to a declaration’s own root row… A field whose declared type merely references a nominal declaration owns no SymbolId” ⇒ **可携带侧是偏离生产口径的一侧**，修法方向（收紧为精确所有权 + 删除 Field 豁免）正是向生产口径对齐，**属于收紧而非放宽**，符合“不得用近似键、身份必须精确”。与 closure8 补丁（改 `typed_expr_type_arena.cheng` + `compiler_csg.cheng`）**文件面不重叠**，可各自独立落树与回退。（本补丁目标文件相对 HEAD 干净，无他手 WIP 碰撞）

范围：只读源码 + 出补丁设计。**本席未运行任何编译/烤制命令**，结论由源码不变量推得，直接观测项全部列在 §5。

补丁：`patches/pair2_typearena_symbol_ownership.patch`（`git apply --check` 通过；1 file changed, 31 insertions(+), 8 deletions(-)；只含本席自己的 hunk，未改任何源文件本体）。

## 1. 结论

判词 `compiler snapshot builder: portable TypeArena Symbol join duplicate` **不是**"两个非 Field 声明行共用同一个 arena TypeId"（`design/deterministic_model_derivation.md:622` 的判读），而是：

> **一个"引用型 Field 行"抢到了被引用声明的 arena TypeId 的认领权**（因为它的 arenaTypeId 就等于被引用声明的 TypeId，且它读到的是被引用声明挂在该 TypeId 上的 arena Symbol），**随后真正的声明行到达时发现 TypeId 已被占用，而它自己是 Type 行、不在 Field 豁免面内，于是报 duplicate。**

修法方向：**join 侧**——把"认领"从 `arenaSymbolId >= 0` 收紧为**精确所有权**（该 arena Symbol 的声明 root 必须就是本投影行自己的 TypeSyntax root），并**删除 Field 豁免**（门禁下豁免不再需要，留着反而会吞掉"两个 owner 抢同一 TypeId"这类真冲突）。**分配侧不动**：arena 在同一 TypeId 上共享 TypeId 是名义引用的定义行为，且分配侧本身已是单射（§3 判据 1）。

## 2. 机制链（逐跳 file:line，行号以工作树为准）

1. **源顺序 = canonical documentCid 序，与 import 方向无关**
   `src/core/tooling/compiler_snapshot_builder.cheng:46-48`（注释："This array is in canonical documentCid order; producerSourceIndex binds each row to the immutable parser producer order"）；`:9916-9919` 断言 `canonicalDocumentCids` 严格递增；`:9934-9944` 该 CID 由 `CompilerWorldDocumentCidInto(packageId, modulePath)` 生成；`:9922-9928` 建 producer↔canonical 双射；`:2203-2205` 表构建按 `sourceIndex`（canonical 序）循环；`:2303` `add(parserSidecars.producerSourceIndexes, producerIndex)` 记下交叉表；`:2475-2477` 每个 source 的 declaration/typeSyntax 行按该顺序追加。
   ⇒ **声明行序是 documentCid 序**（内容/模块路径决定），arena/forest 的 producer 序另存于 `producerSourceIndexes`。这是 pair2 表现为"夹具专属"的根源：两个源的相对次序由一个哈希定序决定。

2. **投影行的 `arenaTypeIds` 从哪来**
   `:16840-16844` 调 `compilerSnapshotBuilderDeclarationArenaTypeIdsInto`（定义 `:16034`）；`:16132-16137` `globalTypeRow = arenaTypeStarts[producer] + sourceLocalTypeRow`，`:16138-16145` 断言该全局行确属本 producer 且 `typeSyntaxTypeIds[globalTypeRow]` 在范围内；`:16959` `add(out.arenaTypeIds, arenaTypeId)`。
   行对齐不是猜的：`:15052-15060` 与 `:15442-15448` 分别断言 arena 的 `typeSyntaxProducerSourceIndexes[base+k] == producerSourceIndex` 且 `typeSyntaxSourceLocalRows[base+k] == k`（`base` 即该 producer 的全局基址）。
   ⇒ **投影行的 arenaTypeId 就是该声明 root 那一行的 TypeId**，不存在"映射到别的源的行"的错位。

3. **字段行的 arenaTypeId 是什么：就是被引用声明的 TypeId（设计如此）**
   字段声明的 TypeSyntax root 是它的**成员类型**语法行；名义引用经 `typed_expr_type_arena.cheng:1631` `typedExprTypeArenaResolveNominal`，`:1758-1762` 取 `targetTypeId = typeSyntaxTypeIds[declarationRoot]`，`:1772` `typeIdOut = targetTypeId` 直接返回**被引用声明自己的 TypeId**。
   ⇒ `Field cell: S1aLibCell` 的 `arenaTypeId` 与 lib 里 `type S1aLibCell` 的 `arenaTypeId` **同值**。这是名义引用的定义行为，不是分配侧 bug。

4. **挂在那个 TypeId 上的 arena Symbol 是"声明者"的**
   `typed_expr_type_arena.cheng:6748` `FillDeclarationSymbols` 只给"创建符号的声明 root"发符号（判定谓词 `:1383-1397` `DeclarationCreatesSymbol`：TypeDeclarationRhs root，或内联聚合的 FieldDeclaration root），`:6786-6792` 把**该 root 的全局 TypeSyntax 行**写进 `symbolDeclarationRootTypeSyntaxNodeIndexes[symbolId]`，`:6810` `symbolCount++`。
   声明行回填自己的 TypeId 时也带自己的 symbol：`ReserveAggregate` `:1260`（object/refobject/enum，`:1300-1301` `symbolIds[typeId] = symbolId`，`:1357-1360` `typeSyntaxTypeIds[root] = typeId`）；`RealizeDeclarationsRec:7273` 为其调度点；alias 行在 `:7145-7155` intern 时 `symbolId = state.symbolByDeclarationRoot[root]`。
   ⇒ 对名义 TypeId，`symbolIds[T] = 声明者的符号`。引用型字段行读到的就是别人的符号（这正是它后面会抢的原因）。标量行不参与：`SeedSemanticScalarRows:1413-1444` 以 `symbolId = -1` intern。

5. **分配侧不可能把同一 TypeId 给两个不同声明**
   intern 的 hash/判等键**包含 `symbolId`**：`typed_expr_type_arena.cheng:953-976`（`TypeHash` 把 `symbolId` 喂进 hash）与 `:978-1013`（`TypeEqual` 逐列比较含 `symbolIds`），去重在 `:1025` `typedExprTypeArenaIntern`。两个不同声明 root 的 arena Symbol 不同 ⇒ 不可能 intern 到同一 TypeId。
   **⇒ §1 引用的旧判读（"两个非 Field 声明行共用同一 arena TypeId"）被这条否证**：真出现两个 Type 行同 TypeId，只可能是"其中一行的 arenaTypeId 不是它自己的 TypeId"，也就是第 6 条的"抢"。

6. **join 现状：谁能写认领表**（`compiler_snapshot_builder.cheng:24839-24857`）
   ```
   24843  if arenaSymbolId >= 0:
   24844      if typeSymbolIdByArenaTypeId[arenaTypeId] >= 0:
   24849          if expectedSymbolKind != CsgCompilerSymbolField:
   24851              err = "... portable TypeArena Symbol join duplicate"; return false
   24853      else:
   24854          typeSymbolIdByArenaTypeId[arenaTypeId] = symbolId
   ```
   ⇒ 认领条件只有 `arenaSymbolId >= 0`；**表空时无条件写入自己的 symbolId（Field 也写）**，只有"已被占用"时才用 Field 豁免放行。字段行因此能**抢**。

7. **失败序列（pair2 的两个源，documentCid 序把引用方排在声明方之前）**
   | 投影行 | arenaTypeId | `symbolIds[T]` | 表状态 | 结果 |
   |---|---|---|---|---|
   | `Type S1aHolder`（引用方源） | T_holder | 自己的符号 | 空 | 认领 ✓ |
   | `Field cell: S1aLibCell` | **T_cell** | **lib 的 S1aLibCell 符号 ≥ 0** | T_cell 空 | **Field 写入 T_cell = 字段 cell 的符号（抢）** |
   | `Field tag: int32` | T_i32 | -1 | — | 跳过 |
   | `Type S1aLibCell`（声明方源） | T_cell | 自己的符号 | **已被占** | 本行是 Type ⇒ `:24851` **duplicate ✗** |

   顺序反过来（声明方在前）时，走的是 `:24849` 的 Field 豁免 ⇒ **wall101/wall111c 加的豁免只覆盖了顺序的另一半**，这也解释了为什么这对夹具在打豁免前后都是同一句判词。

8. **抢到的认领本身就是错的（不只是报错问题）**
   消费者 `compilerSnapshotBuilderAppendArenaTypeRow` 把认领表**直接**写进 `declSymbolIds`：`:14281`（Object）/`:14287`（RefObject）/`:14295`（Enum）/`:14300`（Alias）⇒ 名义 Type 行的声明符号会变成**某个字段符号**，正是 `:17145-17154` 的 w53 注释警告的"the type row's declSymbolId authority would be overwritten"。

9. **两条驱动同一句的解释**
   canonical 建表对全林与逐源是同一处代码（`:10016` 与 `:11198` 都调 `compilerSnapshotProductionCanonicalSourceRowsBuildInto`），所以 r7（全林）与 r8（逐源）会得到同一句判词——与 §7 的顺序成因一致，而不是"两条驱动各有一套缺陷"。

## 3. 修法判定：join 侧是权威（三条判据）

1. **arena 不变量（第一性原理）**：intern 键含 `symbolId`（`:953-1013`）+ 声明行自带自己的符号（`:1260-1360`、`:7145-7155`）⇒ 分配侧已是单射，**没有"分配侧不该让两行共用 TypeId"这个修法对象**；共享 TypeId 是名义引用（`:1772`）的定义行为。
2. **同族生产代码判例**：**非 portable 的同一个 join** 早已用所有权口径——`compiler_snapshot_builder.cheng:17145-17154`（w53 注释）+ `:17267-17274`
   ```
   # wall w53: only a declaration that owns its own arena Symbol may
   # claim the arenaTypeId for the appended snapshot Symbol. ...
   if (aliasDeclaration || aggregateDeclaration) &&
      arenaSymbolDeclarationRoot == arenaTypeSyntaxRow:
       typeSymbolIdByArenaTypeId[arenaTypeId] = symbolId
   ```
   且 `:17178-17181` 对非聚合字段显式要求"不得持有声明符号"。portable 侧是同一 join 的第二实现，口径应与之一致（本补丁就是把 portable 侧对齐到已生产验证的口径）。
3. **消费者语义**：`:14281-14300` 把认领表当"该 Type 行的声明符号"消费 ⇒ 认领者只能是 owner。

**补丁做什么**：认领前先证所有权——`arenaSymbolId < csg.typeArena.symbolCount`、`arenaSymbolRoot = symbolDeclarationRootTypeSyntaxNodeIndexes[arenaSymbolId]` 在范围内，且 `arenaSymbolRoot == projection.arenaTypeSyntaxRows[projectionRow]` 时才认领；非 owner 的 **Type** 行 fail-closed 报新判词 `portable Type declaration SymbolId not owned row=… declaration=… symbolId=… arenaTypeId=… arenaSymbolId=… arenaSymbolRoot=… rowRoot=…`。`projection.arenaTypeSyntaxRows` 与 `symbolDeclarationRootTypeSyntaxNodeIndexes` 都是**全局 TypeSyntax 行号**，比较是精确 int32 坐标，无 name/arity 之类近似键。无 fallback / stub / 降级 / 启发式后处理。

**为什么这不是"扩豁免"，不会掩盖真的身份冲突**（本单最容易犯的错）：
- 方向相反：本修法**收窄**认领面（把"先到先得"换成"必须自证所有权"），并**删除** Field 豁免整条分支。
- 字段行从此**不再进入认领分支**（它的 arena Symbol 的 root 不是它自己）⇒ 它既抢不到，也不需要被豁免放过；"Field 豁免吞掉冲突"这条通道被物理删除。
- `join duplicate` 检查**保留**，且在新口径下只有一种可能触发：**两个自证为 owner 的行抢同一 TypeId**。健康 arena 下不可达（5），一旦出现就是真冲突，仍然 fail-closed。
- 非 owner 的 Type 行不是静默跳过，而是显式报错（见上），避免"少认领"被下游 Cid 校验以模糊判词吸收。

## 4. 验证计划（由串行落树者执行；本席不跑编译）

| # | 命令 | 期望读数 | 通过/失败判据 |
|---|---|---|---|
| 0 | 基线复现：`.rebuild/s1b_step3/r8/pair2_r8.sh <tag>`（或 r7 全林版） | `rc=2`，末行 `compiler snapshot builder: portable TypeArena Symbol join duplicate` | 若基线已不是这句，说明前提变了，停手复核 |
| 1 | `git apply --check patches/pair2_typearena_symbol_ownership.patch` | 静默 | **本席已验：CHECK_OK**；`--stat` = 1 file changed, 31 insertions(+), 8 deletions(-) |
| 2 | 重烤驱动后复跑 pair2 | 不再出现该句（理想 `rc=0`，两源各自 `forest_parsed/…` 前进） | 仍出同句 = 修法无效（转 §4 判词 (a)） |
| 3 | 判决电池 A/B（`ab_repro_r8.sh` 同口径）与 `closure8` | pair2 不再 DIFFER；closure8 不受影响 | 任一出现**新**判词按 §4 表归因 |
| 4 | **顺序无关性抽验**：把 lib/main 的 `modulePath` 互换或改名使 documentCid 序反转，各跑一次（可用最小同文件前向引用变体：先 `type A = object { b: B }` 后 `type B = object { x: int32 }`） | **两个方向都不出现该句** | 旧代码是一侧炸一侧过；若只有一个方向过 = 认领门禁没生效 |
| 5 | 门禁：`gate_r8.sh <tag> kd_<tag>` | `forest_appended=234`、无 `rss_limit_exceeded` | 出现新 panic/回归 = 失败（本补丁只动认领口径，预期对 RSS 无影响，**未测**） |

**若修法判断错了，会先在哪条判词上暴露**（按假设逐条给判词）：
- (a) 真实成因若是"两个不同声明共用 TypeId"（本席否定）⇒ 新代码会在同一处给出 **`portable Type declaration SymbolId not owned row=… arenaSymbolRoot=… rowRoot=…`**。出现这句即判据 1 被推翻，改查行对齐（`:15052-15060`/`:15442-15448`）与该 root 的 parser 种类，而不是继续在 join 侧打补丁。
- (b) 真实成因若是文档序（本席主张）⇒ 该句在**任何顺序**下都不再出现，Field 行被静默跳过（合法共享），声明行认领自己的 TypeId。
- (c) 若还有消费者按旧口径假设"认领可能是字段符号"⇒ 会在严格 replay 看到 `portable Type final CID projection drift row=… joinedOwnerSymbolId=… declSymbolId=…`（`:25161` 的 Fmt 诊断已带全坐标），说明覆盖不全，需要再对齐一处消费者。

## 5. 未测项（本单是设计+补丁，不是"已修复"）

- **未运行任何编译/烤制**：pair2"哪两行、哪两个源"**不是实测观测**，而是由 §2 的源码不变量推出的唯一自洽机制；直接观测（打印冲突行、两个认领者、`arenaSymbolRoot`）未做。§2.1 的"documentCid 序把引用方排前"是推论，不是读数。
- 未验证 Cheng 是否允许**同文件前向引用**（§4 步骤 4 的变体能否成立）；未跑。
- 未逐例验证泛型特化 / 内联对象字段 / 枚举载荷三类行上 `arenaSymbolRoot == arenaTypeSyntaxRows[row]` 的等式；本席只核了 object/refobject/enum（`ReserveAggregate`+`RealizeDeclarationsRec`）与 alias（`InternSyntaxRec` alias 臂）四条构造路径，以及 `DeclarationCreatesSymbol` 的谓词。
- 未验证补丁能否**编译**（禁编译纪律），仅 `git apply --check` 通过；`Fmt"…"` 与多行续行写法对齐同文件既有用法（`:17176`、`:25161`、`:24844-24850`），但未过前端。
- 未评估与另两手在飞改动（`closure8` 的 `declaration SymbolId is not materialized`、`T[具名常量]` 长度移植）的交互。注意 `src/core/lang/typed_expr_type_arena.cheng` 在工作树里**已存在别的会话的未提交改动**（`git status` = ` M`），本席**未触碰该文件**；本补丁只动 `compiler_snapshot_builder.cheng`（该文件当前相对 HEAD 干净，`git diff` 为空）。
- 未测 234 源门与 RSS 读数（§4 步骤 5 的期望值是设计预期，不是实测）。
