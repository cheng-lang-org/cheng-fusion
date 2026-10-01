# pa_s1b_edit_plan —— S1b（删合并森林 + R2 物化相两段化）行级施工图

date_utc=2026-09-11（**rev.3**，按 `9c368085c` 回执 `VERIFY §21.9` + `§22.1-22.9` 重新界定 S1b-N、并按 `TRIAGE` 修正「删并林 = 全量能跑完」的前提表述）· **只读分析席**（对 `src/**` 零写入、零编译、零 git 写）· 主树 HEAD `9c368085c`（工作树含他线 WIP，本席不动）
· 前置：S1a（索引相）已入库 `f92f573f2`，产物 = `typed_expr_type_arena.cheng:90-115`（索引结构）+ `:3123-3416`（构建/对拍）+ `compiler_csg.cheng:33042/33145/38848-38861`（双产出与硬门）；同族站点两处缓存已入库 `c5f6c6736`（`parser.cheng` +43/−8，字节等价经同路径 A/B `cmp` 逐字节相同验证）
· 权威设计：`design/incremental-forest-consumption.md`（下称 **设计**）· 实测数：`verify_append/VERIFY_fullgo_0910_append.md`（下称 **VERIFY**；**§二十一 A/B 双轮**为 rev.2 证据，**§21.9 时间墙根因 + §22.1-22.9 remap 缓存实验**为本 rev 新证据）· correctness 定性：`design/authority_invalid_triage.md`（下称 **TRIAGE**）
· 下列所有 `文件:行` 均为**本席实读**；凡不能从代码确定的写「未验证」。**数字标注**：`[实测]` = 原始 stderr/progression 读数或探针直方图；`[估计]` = 本席推算，未验证。
· **锚定纪律（2026-09-11 rev.3 重锚）**：本文件行号锚定 HEAD `9c368085c`，rev.3 所有 `文件:行` 均已按该 sha `grep` 点名符号复核。`git diff --numstat bc4f9d582..9c368085c -- src/` = 仅 `parser.cheng`（+43/−8，即 `c5f6c6736` 两处缓存）与 `primary_object_plan.cheng`（+36/−6，P-B 线）⇒ ① **`parser.cheng` 在 `:10540` 之后的旧锚点全部漂移，且漂移量按插入点累积**（token 段 +7、typeSyntax 段 +18/+24、region 段起 +35；文件净 +35），本 rev 已逐条重锚并保留补丁前旧行号于〔〕内以便回对 VERIFY；② `compiler_csg.cheng` 零提交漂移，rev.2 锚点仍有效。（更早的 `f92f573f2` 重锚结论不变：`typed_expr_type_arena.cheng` 后移 27~323 行，rev.1 行号只对 `b6b4816e4` 有效、已作废。）

---

## 0. 结论先行（rev.3）

1. **设计的「拆 `TypedExprTypeArenaBuildFromParserTreeInto` 为 Init/AppendSource/Seal」在现码字面上不成立**。该函数现在 `typed_expr_type_arena.cheng:5763`（设计写的 5440 是旧行号），且 **Seal 段有 7 处必须读输入树的调用**（清单见 §2.2）。不先补事实就拆 = 硬失败或静默错。
2. **权威相用索引替换 100% 可行**（S1a 的索引已含 key/kind/exported/globalRoot/globalDeclRow/前缀和，S1a 的 `VerifyAgainstForestInto` 已通过 B1 对拍）。**本刀主体工作量在物化相**，不在权威相。
3. **前提条款（两段式，按 `VERIFY §二十一` 实测重写）**
   - **(i) Σ 不得先攒后消，pass0 的逐源消费必须流式。** `[实测]` B 轮抬门：pass0 全量 234/234，**Σ=`1,290,508,960 B`=1,230.73 MiB = 门线 805,306,368 B 的 1.60×**（与 §六/§八 逐字节一致）。`[实测]` A 轮干净槽位（`lease_hits=0`）默认门下 **rc=125 @176s**：`forest src=61` 入口 rss 已 **651,068,400 B（620.9 MiB）**，parse 中守卫读数 **836,388,064 B（797.6 MiB）> 805,306,368**，`forest_parsed_lines=61`（src 0..60 完成）。⇒ **门内墙在 pass0 大源侧**：`src=61`=`core/backend/primary_object_plan.cheng`（单源树 131.76 MiB）叠 609~627 MB 保底撑穿门线。
   - **(ii) 删并林分支是「必要但不充分」：它只移除并林调用点上的这条时间墙，不是「全量构建能否跑完」的充分条件。** `[实测]` B 轮 pass1 `mode=reparse` 精确预留 1.23GiB 触页后 rss 745→1,985.7 MiB，**只 append 完 `src=0/1` 就卡死在 `src=2`**（`core/analysis/cleanup_cfg.cheng`，817,253 B / 16,458 行 / 811 声明；与 trace `bytes=817253` 逐字节相等），**16+ 分钟零输出、100% CPU**；两次 `sample`（22:39/22:41）栈 **identical** = `ParserValueExprTreeAppendFromImpl` ← `CompilerCsgBuildParserForestAuthorityInto`，热点 59% `langintern.Intern/FindInternId` + 41% `strings.CloneStr→cheng_malloc`；peak rss **2,107,262,968 B=2,009.6 MiB**；`type_arena_lines=0`、`typed_ir_done_lines=0`、`forest_appended_lines=2`。⇒ **「必要」**：不删并林连一次 append 都推不动（拿不到任何全量数据）；**「不充分」**：同族时间墙在 `ParserValueExprTreeAppendFromImpl` 内**本就多处存在**（§6.3 三处站点，删并林后仍有两处残余调用点汇入同一 impl），且全量当前真正的拦路虎是 correctness 错（第 7 条）——删完并林全量照样 rc≠0。
4. **TypeArena 不是门内决定项（改写 rev.1 的第 3 条）**：`[实测/实读]` `value.arena = ArenaInitDefault(1048576)` + 独立 `internPool`（`:5776-5778`），与 `ParserValueExprTree.arena` **非同一 buffer**；真正共驻点是**并林生产窗** `:35545`（整块森林仍活 + TypeArena 生长 + 保底 609,387,432 B），`:35553` 释放森林后 B5 看到的 TypeArena 是后继 ⇒ **其 `used` 不得与 1,230.73 MiB 相加**。TypeArena 本体字节两轮均 0 行（`type_arena_lines=0`）⇒ **仍无实测值**，但门在它之前已被森林单独穿透（1.60×）⇒ 它**不可能是** 768MiB 的决定项。B5 重挂的理由是「对拍/回归 + 补齐口径」，**不再是算术缺口**。
5. **reuse 路径必须同期定形态**（`reuseLinkPlanExprLayer`，`compiler_csg.cheng:38544`）。推荐「同一 AppendSource 驱动 + 整林按源行区间喂」，顺带删掉 `33055` 的全林 clone（该路径内存反而降 1.2GB）。不推荐在 S1b 里新造 parser 切片 API。
6. **新增风险条款 + 子任务占位 S1b-N（rev.3 重新界定：消三处同族站点的冗余整段 `clone+intern`）**：时间墙挂在 `ParserValueExprTreeAppendFromImpl`（`parser.cheng:10222`）内**三处同族站点**的「循环每项都对所属源的**整段源文本**做一次 `CloneStr` + `Intern`」上：token 循环 `:10553`（已补）、typeSyntax 循环 `:10978`（已补）、region 循环 `:11699`（**未补，`[实测]` 为残余主项**）。S1b 删掉的是并林分支，**不删这三处站点**；且 `ParserValueExprTreeAppendFrom` 在删并林后仍有残余调用点（§6.3）⇒ 触发 S1b-N 后按同形状补 per-source remap 缓存。**旧假设「探测爆炸」与「hash 常量」已被探针实测证伪**（§6.3）。触发条件、判据、边界见 §6.3。
7. **全量的成败当前由 correctness 决定，不由资源决定（rev.3 新增，引 TRIAGE）。** `[实测]` 全量 234 源抬门 4GiB（**diagnostic**）：rc=1 @583s、`forest_parsed=234`、`forest_appended=40`、pass0 全 234 源 el≤281s、并林 0→39 约 297s、最长零输出窗 90s、peak rss **2,146,535,464 B（2.00 GiB）**——**既没撞门也没卡死**，止步于 `authority invalid row=91185 kind=5 arm=0 auth_kind=7 auth_row=7838 expected_auth=0 owner=91184 span=26254:26272 source_local=1085 producer=40`。该缺陷 TRIAGE 定性为**消费者/索引侧**：判重 map key 只有 `(spanStart,spanEnd)` 源内偏移、缺 producer/源维度 ⇒ 跨源同 span 被误判「同源重复声明」；**pre-existing（早于 S1a）**，与小复现 `did_subscribe_smoke.cheng`（37 源、rc=1 @86s、`producer=8`）**同类同文**。⇒ ① **S1b 不得据此降级为「只剩内存轴」**（时间墙与 pass0 活块两条轴都仍是真问题）；② **S1b 也不得被当作全量跑完的充分条件**（correctness 不改，删完并林全量照样 rc≠0）；③ 「可断言的部分」只有资源侧：intern 二次代价已从两端大幅削减，当前决定全量成败的是 correctness，不是资源（§22.8 原文口径，未跑到的 `src=41..233` 是否还有别的错**未定**）。

---

## 1. 逐处编辑清单（先加后删，每步可编译）

### 1.1 `typeArenaParserForest` 全仓引用（文本命中 24 处，全在 `compiler_csg.cheng`，零外部文件命中；其中可操作引用 16 组，余为函数内局部命名与错误串）

| # | 位置 | 现形态 | 新形态 | 所属步 |
|---|---|---|---|---|
| 1 | `:1471` | 工作集字段 `typeArenaParserForest: parser.ParserValueExprTree` | **删** | S1b-2 |
| 2 | `:33027-33032` | `parserForestReleasePending`（**已死码，全仓零调用**） | **删** | S1b-2 |
| 3 | `:33034-33179` | `CompilerCsgBuildParserForestAuthorityInto`（pass0 索引+计量、**pass1 一次预留+并林=时间墙**） | 拆成 `CompilerCsgBuildTypeDeclarationIndexInto`（只留 pass0，抽掉 `totalArenaBytes`/`out`）；**并林半段（`:33076-33168`）在 S1b-1 整体删除**（前置项，非优化项） | S1b-1（并林段）/ S1b-2（外壳） |
| 4 | `:33186` | R0 形参 `typeArenaParserForest` | 换 `expectedSourceCount: int32` | S1b-0 |
| 5 | `:33339-33342` | R0 形状校验读 `producerSourceCount` | 改比 `expectedSourceCount` | S1b-0 |
| 6 | `:33354` | R0 第二形参 | 同 4 | S1b-0 |
| 7 | `:33362-33365` | 第二形状校验 | 同 5 | S1b-0 |
| 8 | `:35512-35567` | `CompilerCsgTypeArenaFinalizeParserForestInto`（import 权威 + 权威相 + 物化相 + 释放） | 能力拆三块：import 权威前移（`:35528-35535`）、权威+物化进流式循环、receipt 校验（`:35554-35565`）移到 Seal 后 | S1b-1 |
| 9 | `:36002` | abort 路径 `TreeRelease(work.typeArenaParserForest)` | **删** | S1b-2 |
| 10 | `:36033` | payload-move 断言里 `work.typeArenaParserForest == nil` | **删该合取项** | S1b-2 |
| 11 | `:37150` | R0 reuse 调用点实参 | 改传 `work.orderedSources.len` | S1b-0 |
| 12 | `:37308` | R0 exact 调用点实参 | 同 11 | S1b-0 |
| 13 | `:38842` | 并林调用实参 | 换流式入口（S1b-1）；并林分支与其 `:33076-33168` 整体删（S1b-2 清外壳） | S1b-1 / S1b-2 |
| 14 | `:38854` | `VerifyAgainstForestInto` 实参（**整林对拍门**） | 改为逐源对拍门（S1b-0 的 0f 产物，在 pass0 内逐源校验）；整林门随森林一起删 | S1b-0（0f）/ S1b-2 |
| 15 | `:38868` | R1 的 `manualTree` | 逐源树（流式循环内） | S1b-1 |
| 16 | `:38910` | `CompilerCsgTypeArenaFinalizeParserForestInto(work, err)` 调用 | 换 `…SealTypeArenaInto` | S1b-1 |

### 1.2 步梯（每步结束必须 rc=0 可编译，且不得留半成品态）

**S1b-0｜纯加，零行为变化（可独立提交）**
- 0a. `CompilerCsgBuildWorkingSet` 增 `typeArenaForestSourceArenaBytes: int32[]`；`compiler_csg.cheng:33135-33137` 的 pass0 计量同时写进工作集（现在只写函数局部 `forestSourceArenaBytes`）。
- 0b. 索引消费侧辅助（`typed_expr_type_arena.cheng`，纯加）：按 `globalTypeSyntaxRoots` 二分取条目行（该列按森林行序天然升序，`:3240-3247`）、按键排序视图（复用 `typedExprTypeAuthorityDeclarationLess` 语义，`:2469-2490`）、按索引判 `exported` 与 key 相等。
- 0c. TypeArena 增 Seal 所需列并在 `typedExprTypeArenaFillTypeSyntax`（工作树 `:4926`，HEAD `:4693`）内填充（**纯加，B5/B4 必须逐字节不变**）：
  - **【rev.4 更正，依据 §6.5-8：名文本列必须是文本侧表 `str[]`，禁止存 intern id】** 原文的 `…VariantNameTokenNameIds` / `typeSyntaxOwnerTokenNameIds` 若在 `FillTypeSyntax` 内 `Intern`，会改 `internPool` 入池位序 ⇒ `symbolNameIds/childNameIds/memberNameIds` 取值变 ⇒ `artifactRaw32` 变 ⇒ **破 B4**。正确形态 = 存**文本**，Seal 在**原调用位**调 `Intern`（Seal 相名 `Intern` 点：工作树 `:1634`/`:1816`/`:1940`）。
  - `typeSyntaxChildStarts/Counts` + 新列 `typeSyntaxChildTypeSyntaxNodeIndexes`（CSR 载荷）—— **【rev.5 更正：这三列 arena 里原本都没有，全部须新增；此处 rev.4 原写「已在」是错的，依据 §6.5-12】**；且 starts 须 `childBase + treeChildStart`（`-1`→`-1`）、载荷须 `typeSyntaxBase + treeChild`（依据 §6.5-13）
  - `typeSyntaxEnumVariantStarts/Counts`（**【rev.5 更正：同样并非「已在」，须新增】**）+ 新列 `typeSyntaxEnumVariantPayloadTypeSyntaxNodeIndexes`、`typeSyntaxEnumVariantNameTokenTexts`（**文本表**）、`typeSyntaxEnumVariantProducerSourceIndexes`（**= 循环下标，不是树值**）、`…DeclarationOwnerNodeIndexes`、`…DeclarationOwnerTokenIndexes`、`…Ordinals`（后四列是**全局变体行空间**，须 Init 期给基址）
  - `typeSyntaxOwnerTokenTexts`、`typeSyntaxNameTokenTexts`、`typeSyntaxDeclarationOwnerTokenTexts`（**文本表 `str[]`**）
  - `functionBaseBySource` / `declarationFunctionBase`（见 §2.1；R1 记录森林全局函数行的唯一来源）
  - **红线**：以上新列**一律不得**加进 `typedExprTypeArenaHashMaterialized`（工作树 `:408`）的逐列枚举表——该表是 `artifactRaw32` 的唯一来源，**新列不进表**才是 0c 能宣称「纯加、B4 逐字节不变」的机制。
  - **列清单出处**：对 Seal 段（`typed_expr_type_arena.cheng` 工作树 `:1550-2058`）全量 `state.tree` 命中（78 处）+ accessor 定义体（HEAD `parser.cheng:15981/:16118/:16203/:16216/:16227/:14153`）实读；**未经编译验证**。
- 0d. R1 侧（`typed_expr.cheng`，纯加）：把 `:36944-36962` 的单 ctx 体抽成 `TypedExprBuildIndexAppendContextCallDeclarationsManual(index, contexts, ctxIndex, manualTree, producerFunctionBase)`；Seal 直接复用现有 `TypedExprBuildIndexSealCallDeclarations`（`:31077`）。
- 0e. 埋点：`type_arena cap/used/types/tokens` 上移到 `compiler_csg.cheng:38912` **之前**（或改读 `work.typedIr.exactArena`）；`forest_parse_begin/end`（设计 I1，**A 轮已证门内墙在 pass0 大源**，这条现在是必测项）落进 `:33104` 旁；`frontier_store cap_bytes`（设计 I2）落进 `:38209` 旁；并林相的 `append_begin/end` 计时（为 S1b-N 的森林窗基线留数）落进 `:33162` 旁。
- 0f. 逐源对拍门（`typed_expr_type_arena.cheng`，纯加）：`TypedExprTypeDeclarationIndexVerifySourceAgainstInto(tree, producerSourceIndex, typeSyntaxBase, declarationBase, index, err)` —— 把 `:3309-3416` 的整林校验按单源切片（条目游标区间 + 前缀和单点），使 pass0 内每源即可对拍；整林门（`:38853-38858`）在 S1b-2 随森林删除。

**S1b-1｜原子切换：三相当量重构 + 逐源流式驱动 + R1 逐源 + Seal 接线 + **删并林半段**（第一个「并林不再阻断 append」的可测态；全量能否 rc=0 由 correctness 决定，见 §0.7）**
> 为什么必须原子：① 并林在 `src=2` 就卡死（[实测] §二十一 21.2），**留着它连一次 append 都推不动**（这是「必要」）；但这**不**使删并林成为全量跑完的充分条件（§0.3-ii / §0.7）；② R1（`:38866`）与物化相都吃 `manualTree=森林`，一并林无人能喂 ⇒ 三步不可拆。
- 1a. `typed_expr_type_arena.cheng:5763` 拆为 `…InitInto(totalsFromIndex, out, err)` / `…AppendSourceInto(tree, typeSyntaxBase, declarationBase, declarationIndex, state, out, err)` / `…SealInto(state, out, err)`；`state` 全部数组保持**全局行空间**，新增 `viewTypeSyntaxBase/viewDeclarationBase/viewTokenBase` + 访问器包装（§2.3）。
- 1b. **删除并林半段**：`compiler_csg.cheng:33076-33168` 的 `totalArenaBytes`/一次预留/`ParserValueExprTreeAppendFrom`/`forest_appended` 整段删除；`CompilerCsgBuildParserForestAuthorityInto` 收缩为纯 pass0（含 0f 逐源对拍）；~~`reuse` 分支改为「整林按源行区间喂同一 `AppendSourceInto`」（§1.1-3/5），不再 clone~~ **【rev.4 更正：reuse 分支已证不可达（§6.5-11），S1b-0 已把它改成 hard-fail；S1b-1 不需为它保留任何形态】**。
- 1c. 权威相：`TypedExprTypeResolutionAuthorityBuildPackageForestInto`（`:2921`）增「索引+单源树」变体 `…BuildSourceInto(tree, typeSyntaxBase, declarationIndex, sortedEntries, imports, out, err)`；新调用点唯一在流式循环内。
- 1d. 新增 `CompilerCsgStreamTypeArenaFromDeclarationIndexInto(work, index, sourceArenaBytes, err)`：逐源 `ImmutableSourceSnapshotText` → `ParserRewriteMultilineStringSourceTextWithCoordinateMap` → `ParserValueExprReadTreeFromTextReserved(text, sourceArenaBytes[i] + 65536)`（现成 pass1 配方，`:33115-33126`）→ 权威 `…BuildSourceInto` → `…AppendSourceInto` → **同源内**追加 R1（`ctxIndex == producerSourceIndex`，见 §2.4）→ `TreeRelease`＋每源 relief。
- 1e. 循环后：R1 `SealCallDeclarations`（`:31077`）→ `…SealInto` → `typed_context_lookup_built`（`:38872`）→ R0（`:38881`，已按 0a/0b 换形参）→ receipt 校验（旧 `:35554-35565`）。
- 1f. 保持 `typedMetadataContexts`（`:36642`，森林窗之前建好）与 `sourceSnapshots` 的所有权不变；`Finalize` 函数改名/收缩后，`:38910` 调用点随之换形。

**S1b-2｜删林（纯删除，grep 可证）**
- 2a. 删 §1.1 表中 1/2/9/10 与 `:33034-33179` 的函数外壳、`CompilerCsgTypeArenaFinalizeParserForestInto`（`:35512-35567`）残留、`:38842`/`:38854` 旧实参。
- 2b. 全仓 `grep -rn typeArenaParserForest src/` 必须**真零命中**（设计 §4-8）。

**S1b-N｜占位（消三处同族站点的冗余整段 `clone+intern`）——本 rev 只重新界定范围/触发/判据，不预编补丁内容，见 §6.3**

---

## 2. R2 两段化：最小改动面与边界

### 2.1 权威相改吃 S1a 索引（改动面小）

**S1a 索引已够用**：`:101-115` 的 `(producerSourceIndexes, declarationNameTexts, declarationKinds, declarationExportedFlags, globalTypeSyntaxRoots, globalDeclarationRows)` + `(typeSyntaxBaseBySource, declarationBaseBySource)` 恰好覆盖 `BuildPackageForestInto` 的跨源读取面：
- `typedExprTypeAuthorityDeclarationKeyEqual`（`:2492`）先比 `ProducerSourceIndex` ⇒ 索引字段可直接实现；
- `DeclarationLess/FindDeclaration`（`:2469/:2574`）只看 (source, 名文本, 声明根)；
- `DeclarationExportedInto`（`:2711`）读 `tree.declarationExportedFlags` ⇒ 索引已含；
- `ResolveQualifiedInto`（`:2844`）经 `imports.targetSourceIndexes[importRow]` 定位目标源 ⇒ 索引按源可查；
- `FindGenericSymbol`（`:2742`）只读**当前源**树（`:3077` 传入的 `producerSourceIndex` 即当前行所属源）⇒ 单源树即可。

**函数签名（新增，纯加）**
```
TypedExprTypeResolutionAuthorityBuildSourceInto(
    tree,                       # 当前单源树
    producerSourceIndex,        # == 循环下标
    typeSyntaxBase,             # 该源全局 TypeSyntax 基址（索引 S-c）
    declarationIndex,           # S1a 索引（sealed）
    sortedEntryRows,            # 按 (source, name) 排序的索引条目行（0b 产物）
    imports,                    # CompilerCsgTypeImportAuthorityBuildInto 产物（不吃森林，:35464）
    out, err)                   # 全局 authority，逐源追加
```
**调用点**：唯一并林调用点 `compiler_csg.cheng:38835` → S1b-2 的逐源循环内。
**索引需要补的事实**：只有 `functionBaseBySource`（+ `declarationFunctionCount` 总数），用于 R1 记录**森林全局函数行**（见 §2.4）。声明语义字段**一个都不用补**（S1a 的 B1 对拍已证）。

### 2.2 物化相 `5763` → Init / AppendSource / Seal 的真实边界

**Init（一次）**：`:5776-5779`（arena/internPool/producerSourceCount）+ `:5811-5822` bucketHeads（**尺寸改用索引总数 `index.typeSyntaxCount`**）+ `:5826` `SeedSemanticScalarRows`（`:5823-5825` 注释明确与源无关，必须在 Init）。

**AppendSource（逐源，树在场）**：`FillTokens`、`FillTypeSyntax`、`FillFunctions`、`FillBracketArgs`、`FillGenericSymbols`、`FillGenericSymbolChildren`、`FillDeclarationSymbols`、`IndexFields`、`BuildSyntaxOwnership`、`ReserveAggregatesRec`、`PreflightBracketAuthority`、`InternSyntaxRec`；`CompleteGenericArgumentsInto` 与 `ResolveNominal` 在循环内被调用。

> **【rev.4 更正 1，依据 §6.5-9】上列 6 个 `Fill*` 族不需要任何行空间改写。** 它们全部用 `arenamod.ArenaArrayInt32Add(value.arena, value.column, …)` **顺序 append**（工作树锚点：`FillTokens:4902`、`FillTypeSyntax:4926`、`FillBracketArgs:5139`、`FillGenericSymbols:5165`、`FillGenericSymbolChildren:5249`、`FillDeclarationSymbols:5265`），循环上界本来就是**单源树**的 `tree.X`。只要按源序驱动且每源 append 行数与整林一致，**全局行号自动成立**，这 6 个函数**一行都不用改**。原文「写入 `value.*` 时须用 `base + 局部行`」对它们不成立（见 §2.3 更正）。
>
> **【rev.4 更正 2，依据 §6.5-10】`IndexFields` / `BuildSyntaxOwnership` 逐源可做，但有两条硬前提**：① `fieldStartsByDeclarationRoot / fieldCountsByDeclarationRoot / fieldTypeSyntaxNodeIndexes / typeSyntaxParentNodeIndexes / typeSyntaxEnclosingSymbolIds` 必须在 **Init 期按索引总数一次性分配**（工作树 `:253-265` 的 `typedExprTypeArenaBuildState` 现在按 `tree.typeSyntaxCount` 分配）；② `IndexFields` 的 **`fieldCount` 分配游标必须跨源延续**（工作树 `:3652`）。三段式按 declarationRoot 升序分配，而源 k 的所有根行号恒大于源 k−1 ⇒ 逐源与整林结果相同；**游标一旦按源重置，CSR 即错、`symbolMemberStarts/Counts` 静默错**。`BuildSyntaxOwnership` 的 parent 段与反向段逐源可做（父节点恒同源，判词 `"TypeSyntax parent crosses source"` HEAD `:3515` / 工作树 `:3748`）。

**Seal（一次，无树）**：`FillGenericSymbolTypesRec(:5413)`（**本身零树读**）、`RealizeDeclarationsRec(:5520)`、`FinalizeObjectBases(:4481)`、`SpecializePendingRec(:5596)`、`PatchPendingApplyRec(:5659)`、void 校验（`:5881-5897`）、`BindFunctionOwnersRec(:5684)`/`BindFunctionReturnsRec(:5708)`、`authorityUsed` 双校验（`:5912-5921`）、`BuildDependencyProof(:3762)`、`ComputeTraitFlags(:1159)`/`ApplyTraitFlagsRec`、`complete`+`artifactRaw32`（`:5934-5935`）、`StrictValidateInto(:6556)`。

**Seal 段现存 7 处必须读树的调用 → 替换（全部为「事实已在 arena 或 0c 新列」）**

| # | 位置 | 读什么 | 换成 |
|---|---|---|---|
| 1 | `:5530-5531` RealizeDeclarationsRec | 声明根 parser kind | `typeSyntaxParserKinds[root]`（`:4713` 已填） |
| 2 | `:4270-4271` ObjectBaseTargetInto | `targetRoot` parser kind | 同上 |
| 3 | `:5617-5622` SpecializePendingRec | 声明根 genericSymbolStart/Count | `typeSyntaxGenericSymbolStarts/Counts`（`:4756-4761` 已填） |
| 4 | `:3553-3570` DependencyIndirect | `targetRoot`/`cursor` kind | `typeSyntaxParserKinds` |
| 5 | `:1550-1743` BuildObjectDeclaration | 子 CSR / 字段名 token 文本 / declOwner | 0c 新列 `typeSyntaxChildTypeSyntaxNodeIndexes` + **`typeSyntaxOwnerTokenTexts`/`typeSyntaxNameTokenTexts`（文本表，Seal 原位 `Intern`；工作树 `:1634`）** + `typeSyntaxDeclarationOwnerNodeIndexes`（`:4751` 已填） |
| 6 | `:1744-1861` BuildTupleAliasMembers | 同上 | 同上（Seal 原位 `Intern`：工作树 `:1816`） |
| 7 | `:1862-2058` BuildEnumDeclaration | variant CSR + 变体名 token 文本 + rootKind | 0c 新列 `typeSyntaxEnumVariant*`（含 `…NameTokenTexts` **文本表**，Seal 原位 `Intern`：工作树 `:1940`）+ `typeSyntaxRootKinds`（`:4766` 已填） |

> `InternSyntaxRec:5284` 与 `CompleteGenericArgumentsInto:4508-4514` 也会读到**别的源**的声明根（authority 解出的 `declarationRoot`），但换成 arena 列 `typeSyntaxGenericSymbolStarts/Counts`（上表第 3 项）即可，**AppendSource 段内解决，不需要新索引字段**。跨源可解性的硬前提已由现码证明：`ResolveNominal:1440-1444` 要求 `typeSyntaxTypeIds[declarationRoot]` 已有效 ⇒ **所有跨源边都指向更小全局行** ⇒ 按源序 append 保持同一不变量（证据：`:1442-1444` 的 `declaration TypeId is unavailable` 硬失败）。

### 2.3 state 行空间约定（本刀的关键不变量）

`typedExprTypeArenaBuildState`（`:253-265`）新增 `viewTypeSyntaxBase / viewDeclarationBase / viewTokenBase`，并加一层访问器包装，规则：

- **写入 `value.*` 的列一律用全局行号**（`value` 的列长 = 索引总数，与整林完全一致）。
- **读 `tree` 一律 `treeRow = globalRow - viewBase`**；整林驱动下 `viewBase = 该源全局基址`，单源驱动下 `viewBase = 0` ⇒ **两种驱动的全局行号、intern 顺序、symbolId 顺序完全相同 ⇒ 产物逐字节等价（构造性等价，不靠抽样）**。
- `state.*` 数组（`symbolByDeclarationRoot / authorityUsed / fieldStarts / fieldCounts / fieldTypeSyntaxNodeIndexes / typeSyntaxParentNodeIndexes / typeSyntaxEnclosingSymbolIds / bucketHeads`）**全部保持全局长度**（约 4B × TypeSyntax 行数量级 ≈ 数 MB，可接受），这是避免 local/global 双坐标系的唯一要求。

**必须同步改的循环边界（漏一处即静默错/越界）**
- AppendSource 段**按行寻址**（非 append）的循环 → 全局行号：`IndexFields`（工作树 `:3652`）、`BuildSyntaxOwnership`（`:3705`）、`PreflightBracketAuthority`（`:1479`）、`InternSyntaxRec`（`:5365`）的游标上界。
- `ReserveAggregatesRec`（工作树 `:5327`）的 `symbolId` 循环 → 本源 symbol 区间（`symbolBase ..< symbolBase + 本源声明数`）。
- **【rev.4 更正，依据 §6.5-9】原文此处写的「`FillDeclarationSymbols`/`FillFunctions`/`FillTokens` 等 fill 类的 `0..<tree.X` → …写入 `value.*` 时须用 `base + 局部行`」作废**：这 6 个 `Fill*` 族是 `ArenaArrayInt32Add` 顺序 append，循环上界与写入索引本来就是源内局部，按源序驱动即自动落到正确全局行，**不需要任何改写**（详见 §2.2 更正 1）。
- **seal 相名 `Intern` 的原位性（rev.4 新增，依据 §6.5-8）**：`BuildObjectDeclaration`/`BuildTupleAliasMembers`/`BuildEnumDeclaration` 里的 `langintern.Intern(localOut.internPool, strings.CloneStr(<名文本>))` 必须**仍然在 Seal 相执行**；AppendSource 只许把**文本**存进 0c 文本表，**不得提前 `Intern`**，否则池序改变即破 B4。
- Seal 段（`FillGenericSymbolTypesRec`、`RealizeDeclarationsRec`、`BindFunctionReturnsRec` 等）的 `0..<value.X` **保持全局**，且只读 `value.*` 计数，**不得再读 `state.tree`**。
- 入口 `typedExprTypeArenaTreeShape`（`:2381`）/ `typedExprTypeArenaParserAuthorityShape`（`:2149`）由「整林一次」改为「每源一次（单源树）+ 与索引总数对账」。

### 2.4 R1 逐源化：已闭环的证据与必做项

- `ctxIndex == producerSourceIndex`：`typed_expr.cheng:36946-36950` 直接以 `ctxIndex` 作 `producerSourceIndex` 传下。
- 树查询按源过滤：`typedExprManualConsumeTreeFunctionRowExact`（`:30888-30906`）以 `(producerSourceIndex, declarationSourceLocalRows)` 过滤 ⇒ 单源树等价。
- **必做**：该函数返回的是**树内**函数行；整林下 = 森林全局行，单源下 = 源内行。为保持记录值逐字节一致，`:30959`/`:31003`/`:36944` 需加 `producerFunctionBase` 形参，记录 `functionBase + localRow`（HEAD `parser.cheng:10280` / `:11319-11320` / `:11387-11388` 证明整林就是 `functionOffset + localRow`；旧锚 11284/11352，rev.3 已重锚）。`functionBaseBySource` 取自索引（§2.1 补项）。
- 残留风险（**未验证**，B4 必测）：`compiler_csg.cheng:38866` 建的那个 index 的下游消费者是否还有跨源比较 `callDeclarationProducerFunctionRows` 的地方；typed 侧自建于 `typed_expr.cheng:37327`（用 `ir.valueExprTree`，行空间自洽）。

---

## 3. 合并森林删除后：typed 相从哪里取树

**结论：typed 相根本不需要森林，也不需要新决策。** 证据（本席实读）：
- 轮循环入口 `compiler_csg.cheng:39069`，其准备段 `:37746-37780` 的每轮重建实参是 `work.frontierParsedSources`（`:37780`），不是森林；
- 该 store 的每源解析走 `CompilerCsgFrontierParsedSourceStoreEnsure`（`:30719`），内容是该源的 `NormalizedExprLayer`（`:30825` move 进 `fullSourceLayers[profileIndex]`），**不是 `ParserValueExprTree`**；
- 森林在旧路径 `:35553` 释放，早于轮循环；`work.typeArenaParserForest == nil` 还是 payload-move 的硬断言（`:36033`）⇒ 结构上轮循环不可能读森林（设计 P2 复验通过）。

### 3.1 每源 parse 预算（与现状同为 2 遍，不增加）——含 A 轮实测点

- pass A（索引相）**无精确预留**（先有鸡还是蛋：预留值来自本遍），瞬态 = doubling 峰值。`[实测推算]` A 轮在 `src=61` 的实测点：入口 rss **651,068,400 B**，守卫读数 **836,388,064 B** ⇒ Δ=**185,319,664 B（176.7 MiB）**，对照该源最终 arena **138,162,976 B（131.76 MiB）** ⇒ **瞬态 ≈ 1.34 × 单源 arena**（不是 `parser.cheng:26647-26650`（旧锚 `:26604-26617`，rev.3 已重锚）自述的「268MB+134MB」——那条是另一次/另一形态的观测）。该系数为**单点推算，非上界**，I1（0e 的 `forest_parse_begin/end`）仍须全量实测。
- pass B（物化相）用 `sourceArenaBytes[i] + 65536` 精确预留（现成配方 `:33115-33119`）⇒ 瞬态≈0（B3 判据）。
- **I2（二次长林）**：`frontierParsedSources` 只在 `:39106-39108` 整批释放，`Ensure` 命中即返回（`:30743-30774`）无逐轮回收；round 0 的 frontier 覆盖全部可达函数 ⇒ 该 store 很可能长到全部 234 源。容量函数已存在（`:30912`）但**未在本相上报** ⇒ 0e 补 `typed_ir_done` 旁的 `frontier_store cap_bytes=` 埋点。判据：cap 随 round 单调升到 GiB 级 ⇒ 墙只是搬了家，必须给 store 加上界。**（rev.3 注：该上界已由另一条线的在途 WIP 在做——`CompilerCsgFrontierParsedSourceStoreEvictAll`，见 §6.4；本条保留为验收判据，本刀不重复实现。）**

### 3.2 「S1b 是否足够」的判定（按 `VERIFY §二十一` 原始件重算，本席新增）

**结论：S1b 单独不可能过 768MiB。** 依据（全部来自 `.rebuild/run_b5/full/` 原始件）：

| 量 | 值 | 出处 |
|---|---|---|
| 并林窗前保底 | `609,387,432 B`=581.2 MiB | B 轮 `after_profile_source_payload_release` |
| pass0 走完 234 源 | rss **`781,288,480 B`=745.1 MiB**、**live=`3,089,597`** | B 轮 `forest_parsed src=233` |
| pass0 起点 live | `1,470,764` | B 轮 `forest_parsed src=0` |
| 门线 | `805,306,368 B`=768 MiB | VERIFY §一 |

⇒ pass0 结束时距门线只剩 **24,017,888 B（22.9 MiB）**，而 pass0 自身**净增 live=1,618,833 个活块 / rss +171.9 MB**（`[实测]` src=0→233，单调；粗算 ≈106 B/活块）。**S1b 不动 pass0**（索引相原样保留）⇒ 材料化相一开始就贴着门线跑。

⇒ **第二刀的真靶是 pass0 的活块累积**（不是 TypeArena，也不是 Σ）：0e 的 `forest_parse_begin/end` 必须同时记 `live`，用「每源 begin/end 的 live 差」判归属；现成 trace 已在 `forest_parsed` 行带 `live`（`:33139` 格式），扩一个字段即可。**归因未验证**（谁在 234 次 parse→release 里留下 1.62M 活块：源文本/坐标图/词法缓存/intern 池均候选），但**现象与量级已实测**，第二刀可据此定向。

### 3.3 子任务占位：S1b-M（打 pass0 活块累积，内存轴）

- **状态**：占位，**不预编方案**；由父席在 S1b-1 落地并拿到 0e 的 `live` 逐源曲线后定夺。
- **触发条件**：S1b-1 落地后，任一轮 768MiB 门在材料化相之前/之中死亡，且 `forest_parse_*` 的 live 曲线复现单调累积（Δlive ≥ 1M）。
- **判据**：该曲线的 owner 必须是**单一可命名结构**（不得以「内存压力/碎片」结案）；修后 pass0 末 rss 必须回到 `609,387,432 B + Δ`（Δ 为可解释的小量），且 B4 语义等价不破。
- **红线**：不得用 `ProcessMemoryPressureRelief` 频次、降采样或「释放不属于本刀的结构」冒充（与 §6.2 同）。

---

## 4. 假绿清单对齐（设计 §4 九条逐条）

| # | 假绿 | 本刀如何规避（判据） |
|---|---|---|
| 1 | 调守卫值换 rc=0 | 门线固定 805,306,368 B + 内门 768MiB；判词必须**双门同跑**且 phys 降幅入账（§5 反向判词） |
| 2 | 只改后备不改消费 | 本刀改的是**消费形态**（逐源 parse→生产→释放），不引入 mmap/文件后备；`forest_appended` 必须零命中 |
| 3 | 靠 relief 掩盖活块 | 逐源 `TreeRelease` 是**真删活块**；`:33089`/`:33165` 的 relief 随并林半段删除，`:33160`（pass0 每源）与材料化循环内的每源 relief **只算常规归还，不得作为达标证据**；B2 判 phys、B2c 判 live 曲线 |
| 4 | 把 `totalArenaBytes` 改小/分段 reserve | 该变量与其一次性预留**整体删除**（并林半段 `:33076-33168`），不是改小 |
| 5/6 | pass0 降采样 / 源字节×系数估 arena | 预留值仍来自 pass A **实测** `ArenaUsed`（`:33135`），逐源逐值，不抽稀不估 |
| 7 | 只改埋点让 trace 消失 | B1 同时要求 `grep -rn typeArenaParserForest src/` **真零命中** + 代码路径删除；埋点改名不算 |
| 8 | 改名藏字段 | 同上，零命中是硬门 |
| 9 | 只拆 R1 不拆 R2 | 本刀 R2 是主体（§2.2 七处 Seal 树读替换），R1 只是附赠；B2 若 phys 不降即证伪「只拆 R1」式偷工 |
| 10 | **只删并林就宣称过 768MiB**（rev.2 新增） | `[实测]` pass0 末已占门线 96.9%（`781,288,480/805,306,368`，§3.2）⇒ 删并林只买到「并林相不再卡死」，**既不买到门线、也不买到全量 rc=0**（§0.3-ii / §0.7）；由 B2c 与 S1b-M 挡住内存侧，correctness 侧由 TRIAGE 单独结案 |

---

## 5. 验收口径（B1-B6 具体命令与期望）

口径基线：`VERIFY §一`（外门 + 内门 + `CHENG_CSG_MEM_TRACE=1`，四夹具 `BACKEND_JOBS=1/2`、禁缓存四件套）+ `VERIFY §二十一`（A 轮默认门 = 对照；**B 轮抬门 4GiB** = 观测资源相上限的口径：`CHENG_PARENT_RSS_GUARD=1` + `CHENG_PROCESS_MAX_RSS_BYTES=4294967296`）+ `VERIFY §22.4/§22.7`（时间墙口径：入口 `src/tests/typed_expr_type_arena_smoke.cheng`，默认 768MiB 门 + `CHENG_CSG_MEM_TRACE=1` + 盒 1200s，**森林窗基线 `after_profile_lookup since_ms=553,914`**）；**`--out` 必须落仓库内或 `$HOME`，不得落 `/private/tmp`**（VERIFY §三 已排除缓存/权限/符号链接三组对照）。驱动 = C 链烤（`cc -std=c11 -O2 bootstrap/cheng_cold.c` → 166~200s），落点 `.rebuild/run_*/kd`，时间盒 ≥6min 并保存 stderr/progression 原始件。

| 判据 | 命令/操作 | 期望 | 反向判词 |
|---|---|---|---|
| **B1 森林消失** | ① `grep -rn "typeArenaParserForest" src/ --include=*.cheng` ② 抬门跑（`CHENG_CSG_MEM_TRACE=1`）看 trace | ① **0 命中**；② 无 `forest_build_start/forest_appended/forest_parsed`，新增 `ta_stream_*` 序列且**每源 parse 后有释放** | 仍有任一 `forest_appended` ⇒ S1b 未生效 |
| **B2 峰值** | **抬门 4GiB**（`CHENG_PARENT_RSS_GUARD=1` + `CHENG_PROCESS_MAX_RSS_BYTES=4294967296`，[实测] B 轮口径）1 跑 | phys/rss 峰 **< 2,107,262,968 B（[实测] B 轮 2,009.6 MiB）**，且**降到 pass0 量级**（B 轮 pass0 末 781,288,480 B）⇒ 降幅 ≈ **1.26 GiB** | 若峰仍 ≥ 1.5GiB 或仍出现「pass1 预留后 OOM/卡死」⇒ 并林未被真正移除 |
| **B2b 森林窗量级（新，本刀第一判据；rev.3 改判据）** | 29 源入口（`typed_expr_type_arena_smoke`）默认门 + 盒 1200s，读 `after_profile_lookup since_ms`；全量侧另跑抬门 4GiB + 0e 的 `append_begin/end` 计时 | **森林窗降到量级不同（<120s）**（基线 `[实测]` 553,914 ms，§22.7）且 pass0 234/234 源完成；全量 rc 由 correctness 决定（§0.7）⇒ **不得据 rc≠0 判 S1b 失败，也不得把 rc≠0 之外的任何读数当作全量跑通的证据** | 森林窗仍停在 **553.9s 量级**、未降到 <120s ⇒ **触发 S1b-N**（§6.3，§22.7 判词原文即此口径）；出现 100% CPU 长时间零输出且 `sample` 栈落在 `Intern/FindInternId`/`CloneStr` ⇒ 只作佐证，**不再以「>6min 零输出」为判据** |
| **B2c pass0 活块曲线（新）** | 0e 的 `forest_parse_begin/end` + `forest_parsed` 的 `live` 字段，逐源落 TSV | 曲线**平台化**（Δlive 不再单调升）；目标是 pass0 末 rss 回到 `609,387,432 B` 量级 | Δlive ≥ 1M 且 owner 不明 ⇒ **触发 S1b-M**（§3.3），不得以「碎片/压力」结案 |
| **B3 单源瞬态** | `forest_parse_end.rss − forest_parse_begin.rss`（0e 埋点）对最大源（`src=134` `typed_expr.cheng` 134.09 MiB；`src=61` `primary_object_plan.cheng` 131.76 MiB） | pass B ≤ 单源 arena + 64 KiB（精确预留生效）；**pass A 如实上报**（首测点为 1.34×arena，[实测推算]） | pass B 仍见 ≈1.5×arena ⇒ 前缀和没用于 reserve |
| **B4 语义等价（硬门）** | 四夹具（ordinary / call_fixture / cold_nested / v6）+ 2 源对 + 8 源闭包，S1a 驱动 vs S1b 驱动**产物 sha256 全等**（S1a 基线：`793afdce…`/`d285f4be…`，四夹具 `d3cca8c1/4f9af51f/0b89d8dd/6eca55c6`，多源对 `9779b97d`，见 VERIFY §十九） | 全等 + `decl_index verified=1` + 逐源对拍门（0f）全绿；产物名需一致（exe 内嵌自身路径） | 任一不等 ⇒ 语义不等价，直接否决，不接受「差一点」 |
| **B5 TypeArena 对拍 + 口径** | **锚点已死必须重挂**：`type_arena` 行在 arena bind/move 之后恒不触发（[实测] A/B 两轮 `type_arena_lines=0`；死码址 = 原锚 `:38877`，位移后编号 `:38930`）；已由 `43e12c322` 移位到 `:38912`（guard）/`:38914`（emit），位于 `:38921` bind **之前** | ① `types/tokens/used` 与 S1a 驱动相等；② 首次拿到 TypeArena 本体字节；③ **口径**：该 `used` 与 1,230.73 MiB **不得相加**（两个独立 arena，共驻点只在 `:35545` 并林窗，该窗本刀已删） | 不等 ⇒ 索引相或 AppendSource 丢字段 |
| **B6 索引相独立性** | S1a 已过（VERIFY §十九 B1/B3 对拍通过、`decl_index verified=1`） | 本刀只做**回归复验**（同门跑一次 + 0f 逐源门） | 复验不等 ⇒ 本刀破坏了索引相 |
| **I1/I2 插桩** | `forest_parse_begin/end`（`:33104` 旁，含 `live`）+ `append_begin/end` 计时（`:33162` 旁）+ `frontier_store cap_bytes`（`:38209` 旁） | B1/B2 两跑内必须出数 | 无数据仍宣称达标 = 自证假绿 |

**成本（rev.2 更新）**：每轮 = C 链烤机 ≈166~200s + 自烤/夹具 ≈200s ⇒ **≈7 分钟 wall/轮**（抬门跑在并林未删时是 **1271s**，[实测] B 轮 —— 删并林后应回到常规量级）。S1b-0 / S1b-1 / S1b-2 各至少 1 轮，B2b 时间墙 + B2c live 曲线 + B2 抬门 + B4 夹具电池再加 2~3 轮 ⇒ 预计 **6~8 轮 ≈ 50~60 分钟纯 wall**，不含判词定位。**独占槽是硬前提**，且注意 `VERIFY §二十一` 的升级：改用 `mkdir .rebuild/COMPILE_SLOT.lock` 原子 test-and-set（`ps`+协作旗标存在同秒双起，check-then-act 不是互斥原语），释放走 owner 校验的 `release_lock.sh`。

---

## 6. 估工与风险（rev.3：§6.3 重新界定，工时表未变）

### 6.1 步序重排的理由与工时

**重排理由**：`[实测]` 并林在 `src=2` 卡死（§二十一 21.2）⇒ rev.1 的「整林驱动桥接态」**拿不到任何全量数据**（全林根本盖不起来），也失去等价门价值；因此把「三相当量重构 + 逐源驱动 + R1 逐源 + 删并林」压成**一个原子步 S1b-1**，最快产出「并林不再阻断 append」的可测态；删林外壳降级为纯删除步 S1b-2。**（rev.3 限定：该可测态的 rc 由 correctness 决定，不是「全量跑完」态，见 §0.3-ii / §0.7。）**

| 步 | 内容 | 估工（区间） | 依据 | 备注 |
|---|---|---|---|---|
| S1b-0 | 预埋：Seal 列 + 索引辅助 + 逐源对拍门(0f) + R1 append/seal + 埋点(含 live) | 5~6h | [估计]（rev.1 的 5h + 0f/live 增量） | 纯加，行为不变，一轮烤机回绿 |
| S1b-1 | **原子切换**：删并林半段 + Init/AppendSource/Seal 重构 + 权威相索引化 + 逐源驱动 + R1 逐源 + Seal 接线 | 12~16h | [估计]（rev.1 的 8h+6h 合并，减去桥接态省下的对拍工） | 最高风险：行空间包装漏一处即静默错；reuse 分支同期改「按源行区间」 |
| S1b-2 | 删林（字段/死码/abort/断言/旧实参 + grep 零命中） | 2~3h | [估计] | 纯删除，grep 可证 |
| 验收 | B1/B2/B2b/B2c/B3/B4/B5/B6 + I1/I2 | 7~9h | [估计] 6~8 轮 wall | B2b 时间墙与 B2c live 曲线为本刀新增判据 |
| **核心小计** | | **26~34h** | | 设计原估 19.5h 仍偏低：**Seal 的 7 处树读（§2.2）设计未计** |
| 缓冲 | I3 残留 / reuse 属性 / 在途 WIP 冲突 | +8~12h | [估计] | |
| **合计（不含 S1b-N/M）** | | **34~46h** | | |
| **S1b-N（时间轴，占位）** | 消三处同族站点的冗余整段 `clone+intern`（rev.3 重新界定） | **未定** | `[实测]` VERIFY §21.9 / §22.7 / §22.9 | 触发条件与判据见 §6.3，本 rev 不预编补丁内容 |
| **S1b-M（内存轴，占位）** | 消 pass0 活块累积（1.62M 活块 / +172 MB） | **未定** | [实测] §3.2 | 触发条件见 §3.3 |

> **实测 vs 估计**：`[实测]` = Σ=1,230.73 MiB、A 轮 rc=125@176s 与守卫读数 836,388,064 B、B 轮 pass0 末 781,288,480 B + live 3,089,597、并林卡死 `src=2` 与两次 identical 栈、peak 2,107,262,968 B、`type_arena_lines=0`；`[实测推算]` = pass A 瞬态 1.34×arena（单点，非上界）；`[估计]` = 全部工时、缓冲区、以及 §3.2 的「第二刀是 pass0」定向（现象实测、归因未验证）。**rev.3 追加 `[实测]`（全部照录 VERIFY 原始读数）**：29 源入口森林窗 `after_profile_lookup` **774,266 → 553,914 ms（−28.5%）**、整轮 **793s → 577s**、最长零输出窗（字节口径）**598s → 397s**、`forest_appended` **29/29**（§22.7）；探针直方图 `worst=51` 恒定、20min 内 `steps` 未跨 524,288（§21.9②⑤）；全量 234 源默认门 **rc=125 @176s**、抬门 4GiB **rc=1 @583s / `forest_parsed=234` / `forest_appended=40` / peak 2,146,535,464 B**（§22.8）。

### 6.2 红线（不得降级）

1. 不得保留任何「整林同时在场」的新形态（含 mmap/文件后备/分段 reserve）；
2. 不得用 relief 频次、埋点改名、守卫调参换判词；
3. 不得为省事对 Seal 做「再 parse 一遍全林」的偷跑（那就是把森林换个名字搬回来）；
4. B4 不等价即否决，不许「先落地后修」；
5. **不得把 pass0 的 1.62M 活块累积用「内存压力/碎片」结案**（§3.3 判据）。

### 6.3 S1b-N（占位，rev.3 重新界定）——消三处同族站点的冗余整段 `clone+intern`

- **范围（rev.3 改写：不再是笼统的「intern/CloneStr 二次代价」）**：`src/core/lang/parser.cheng` 的 `ParserValueExprTreeAppendFromImpl`（HEAD `:10222`）内**三处同族站点**，形状一致 = 「循环每项都对**该项所属源的整段源文本**做一次 `CloneStr`（malloc+memcpy L 字节）+ `Intern`（hash O(L) + 探测逐字节比对 O(L)）」：

| # | 站点（HEAD `9c368085c`；〔〕内为 `c5f6c6736` 之前旧行号） | 形态 | 现状 |
|---|---|---|---|
| 1 | token 循环 `:10553`（`Intern/CloneStr` `:10564-10567`）〔旧 `:10546-10551`〕 | `0..<sourceTree.tokenCount` | **已补** per-source remap 缓存（`remappedTokenSourceIds` `:10552`） |
| 2 | typeSyntax 循环 `:10978`（`Intern/CloneStr` `:10990-10993`）〔旧 `:10954-10960`〕 | `0..<sourceTree.typeSyntaxCount` | **已补**（`remappedTypeSourceIds` `:10977`） |
| 3 | region 循环 `:11699`（`Intern/CloneStr` `:11706-11710`）〔旧 `:11664-11675`〕 | `0..<sourceTree.regionCount` | **未补** —— `[实测]` §22.9 定为主残余（`sample` 热点偏移 +90536/+90504，前序调用唯一对应 region 循环） |

  两处已补的修复已入库 commit `c5f6c6736`（`parser.cheng` +43/−8，net +35），**字节等价经同路径 A/B `cmp` 逐字节相同验证**（§22.3 / §22.7 表：`ordinary`/`call_fixture` 的 exe 与 primary.o 两侧 `cmp_IDENTICAL`）；第三处**测试过热度、未加缓存**（超出该轮授权）。

- **两条旧假设已由探针实测证伪（rev.3 新增，§21.9）**：
  1. **不是「探测爆炸」**：`[实测]` `worst=51` 恒定，且 20 min 内 `steps` 未跨下一几何阈值 524,288（5 行直方图全部产生在开跑约 5s 内，此后零新行）⇒ 平均 <217 步/s，线性探测没有退化。
  2. **不是「hash 常量」**：intern id 由 `internPoolAppendUnique` 按**位序分配**（返回 `pool.texts.len - 1`），hash（`internPoolTextHash`）只影响**探测路径**、不决定 id 取值；`Intern` 先 `FindInternId`、命中即返回（`intern.cheng:728-748`）——这也正是 per-source 缓存**不改变任何 id** 的原因（§22.1 源码核验）。
  ⇒ 根因在**调用侧**：代价随「源字节 × 项数」双线性爆炸，只能靠消除冗余调用（补缓存）解决，**不是**换 hash、调探测参数或改 intern 结构。

- **残余实测口径（rev.3 照录 §22.4/§22.7）**：入口 `src/tests/typed_expr_type_arena_smoke.cheng`（29 源），默认 768MiB 门 + `CHENG_CSG_MEM_TRACE=1`，盒 1200s。森林窗 `after_profile_lookup` **774,266 → 553,914 ms（−28.5%）**；整轮 **793s → 577s**；最长零输出窗 **598s → 397s**；`forest_appended` **29/29 全过**。修复前：盒到期 rc=143 @1213s、`forest_appended=2`。**读法声明**：该驱动 stderr 为块缓冲，字节口径的「零输出窗」**不等于停摆**，必须配 `sample` 栈与计数判读（§22.4 已声明）。

- **触发条件（rev.3 改写：判据 = 森林窗是否降到量级不同，不再用「6 min 零输出」）**：
  1. S1b-1 落地（并林已删）后，同一 29 源入口的森林窗仍停在 **553.9s 量级**、**未降到量级不同（<120s）** ⇒ 启动 S1b-N（补第三处 `:11699`）。（§22.7 判词原文即此口径：「未降到『量级不同』（<120s），故仍判部分缓解，不判『时间墙消除』」。）
  2. 全量 234 源在 pass0/森林相出现 **100% CPU 长时间零输出**且 `sample` 栈落在 `langintern.Intern/FindInternId` 或 `strings.CloneStr→cheng_malloc`（`[实测]` §22.9 的 el≈400s 采样即此形）——**本条只作佐证，判据仍是森林窗量级**。
  3. 全量跑完（correctness 修复落地后）但森林相 wall 比删并林前的同相 wall 高一个量级（时间回归）。

- **判据（触发后由 S1b-N 自己定义方案，本 rev 只定验收面）**：
  - **森林窗 <120s（量级不同）** 且 pass0 234/234 源完成；全量 rc 由 correctness 决定（§0.7）⇒ **S1b-N 不以「全量 rc=0」为验收面**；
  - 语义面 B4 硬门不破（四夹具产物 sha 全等）；
  - **不得**以减少 intern 调用次数但改变 intern 顺序/identity 的方式换时间（`typed_expr.cheng:36946`、`parser.cheng:10303-10313`（node 循环缓存）的精确身份链条不得松动）。

- **删并林后必做核查（rev.3 新增，§22.5 的结论落到本刀）**：并林调用点 `compiler_csg.cheng:33162` 删除后，`ParserValueExprTreeAppendFrom`（`:10218` → `:10222`）**仍有残余调用点**：
  - `compiler_csg.cheng:30382`（把 `functionLayer.valueExprTree` 追加进 `target.valueExprTree`，单源 `producerSourceCount==1`）；
  - `parser.cheng:3646`（delta 层树 `ParserValueExprTreeAppendFrom(total.valueExprTree, delta.valueExprTree)`）。
  ⇒ 两者**都汇入同一个 `AppendFromImpl`**（缓存只可能在该 impl 内、调用点无法各自持有），因此第三处站点**不补就会从这两条路重新成墙**：单源大 delta/function layer 同样吃 `regionCount × L`。**S1b-1 落地时必须复核这两条残余路径的实际输入尺度**，不能只核「并林没了」。（`:14568` 的 `langintern.Intern` 是词法期每源一次、非循环站点，不在同族。）

- **状态（rev.3 更新）**：**占位，本 rev 只界定范围/触发/判据，不预编补丁内容。** rev.2 挂着的那条单源时间盒测量（`.rebuild/run_b5/single/`，入口 `src/core/analysis/ownership_drop_ir.cheng`，10 源闭包含 `cleanup_cfg.cheng`）**已结束**：`[实测]` 其 summary 为 `verdict=finished rc=1 wall=221s timebox=360s`、`forest_appended=10/10`、`guard_hits=0` ⇒ **未挂死**；rev.2 的触发条件 1（「单源/10 源闭包在 6min 盒内未跑完」）这一支**不被该测量支持**，故 rev.3 删去该条、改以森林窗量级为准。

- **边界**：S1b-N 与 S1b-1/2 **互不阻塞**（S1b-1/2 不碰 `AppendFromImpl` 内这三处循环）；若触发，其工作量不计入 §6.1 的 34~46h。**与 correctness 修复线也互不阻塞、且不得互相冒充**：TRIAGE 的修复落在同族判重域（`parser.cheng:8951-8966` 建表 / `:8976-9057` 填充的 span-keyed map，HEAD 实读），S1b-N 落在 append 循环（`:10222` 内），两者不共享 hunk，但**同在 `parser.cheng`** ⇒ 触发 S1b-N 前该文件的在途 WIP 必须先落或先冻结（§6.4）。

### 6.4 冲突面

- `src/core/backend/primary_object_plan.cheng`（P-B 线高频改，A 轮门内死点 `src=61`，单源树 131.76 MiB）：本刀**不碰**该文件；但 I1 埋点必然包含它，且其 mtime 会被本轮读到（[实测] A 轮 `bytes=4490367` 与 §二十一 21.3 的文件映射逐字节对上；**rev.3 追加**：该文件在 `bc4f9d582..9c368085c` 已 +36/−6，故 §22.8 同一死点读数为 `tag=forest src=61 bytes=4490588`——**A 轮那个字节数是历史读数，不得当现值用**）。改期规则按 `lessons.md`：确认 mtime 静止 >10min，提交只用 `git apply --cached` 挑自己的 hunk。
- 在途 WIP：`src/core/lang/typed_expr.cheng`（+35/−11，他线）与本刀 §2.4/§1.2-0d 强重叠 ⇒ **开工前必须先落或先冻结该 WIP**，否则 `TypedExprBuildIndexAppendContextCallDeclarationsManual` 的插入点会撞。
- 在途 WIP（**rev.3 新增**）：`src/core/lang/parser.cheng` 工作树 `git diff --numstat` = **+192/−96（未提交）**，内容是 TRIAGE 那条 correctness 修复在写（判重域从纯 span 改为 `(producer, span)` 精确计数，新增 `parserForwardingProductionDeclaration/LexicalScopeSpanProducerCount` 一类 helper）。**S1b 本体不碰该文件**；但 §6.3 的第三处站点补丁落在同一 `AppendFromImpl` 内 ⇒ **触发 S1b-N 前该 WIP 必须先落或先冻结**。另注：本 rev 的 `parser.cheng` 锚点以 **HEAD** 为准（工作树因这 +192/−96 而整体位移，直接读工作树会切错行）。
- `compiler_csg.cheng` 是 S1b 的爆炸半径全部所在（**24 处**，2026-09-10 夜 HEAD 实读；rev.2 初稿写 23，已更正），单文件独占期必须协商。
- 在途 WIP（**rev.3 新增，同文件**）：`src/core/tooling/compiler_csg.cheng` 工作树 `git diff --numstat` = **+31/−0（未提交）**，内容 = 新增 `CompilerCsgFrontierParsedSourceStoreEvictAll`（工作树 `:30977`）+ 在 `compilerCsgBuildTypedIrReachRoundPrepare` 内调用（工作树 `:37804`）——**正是 §3.1-I2 指出的「frontier store 无上界」**，另一条线在补。影响：该 WIP 使工作树行号相对 HEAD **+27（`:30967-37771` 区间）/ +31（`:37771` 之后）**（实证：并林调用点工作树为 `:33189`，HEAD 为 `:33162`），而本文件的 24 处 `compiler_csg.cheng` 锚点**全部按 HEAD 写** ⇒ **直接读工作树会切错函数**；S1b 开工前该 WIP 必须先落或先冻结，并按落地后的 sha 重锚。
- **槽位纪律升级**（`VERIFY §二十一`）：改用 `mkdir .rebuild/COMPILE_SLOT.lock` 原子 test-and-set（`ps`+协作旗标存在同秒双起，check-then-act 不是互斥原语），释放走 owner 校验的 `release_lock.sh`；`lease_hits=0` 是任何数据入账的前置条件（并发污染轮实测同点守卫读数 919,094,424 B vs 干净 836,388,064 B）。

### 6.5 与设计文档不一致处（需回改设计）

1. `TypedExprTypeArenaBuildFromParserTreeInto` 行号 5440 → **5763**；`Seal` 边界不是 `5453-5500`。
2. B5 埋点 `compiler_csg.cheng:38877` 是死码（位移前址）→ 现址 **`:38912`（guard）/`:38914`（emit）**，位于 `:38921` arena bind **之前**（`43e12c322` 位移 9 行）；两轮实测 `type_arena_lines=0`，须重挂。[修正 2026-09-10 夜：本条原写「现 `:38924`」有 off-by-10，`:38924` 实为 `if !compilerCsgBindTypedIrExactDeclarationLayoutsInto(`；设计文档 `incremental-forest-consumption.md` 按实读 `:38912/:38914` 落笔，此处同步更正。]
3. `patches/s1a_step1.patch` 在本仓**不存在**（`ls patches/` 无此文件）；S1a 的回退基准是 commit `f92f573f2`。
4. **设计 §2.0 的算术需补两项**：TypeArena 本体（两轮无实测；口径上不得与 Σ 相加，§0.4）+ **pass0 活块累积（[实测] +172 MB / +1.62M live，§3.2）**——后者是设计未预见的第二刀靶。
5. `compilerCsgBuildConsumeWithOverridesCoreInto` 现为 `:38299`（设计写 38271）。
6. 设计 §3 的证伪路径（phys 降幅 < 1,230.7 MiB×80% ⇒ 前提被证伪）**在本刀口径下要改写**：并林已被证明是**时间墙**（不只是内存墙），故 **B2b「森林窗量级」优先于 phys 降幅**；phys 反向判词改为对照 B 轮实测峰 `2,107,262,968 B`。
7. **rev.3 的 S1b-N 界定与前提修正须同步进 `design/incremental-forest-consumption.md`**（该文件由另一条线维护，本席**只登记条目、不改该文件**）：
   - ① 时间墙根因 = `ParserValueExprTreeAppendFromImpl` 内**三处同族站点**的冗余整段 `clone+intern`（VERIFY §21.9 / §22.1-22.9）：两处已由 `c5f6c6736` 修复，第三处 HEAD `parser.cheng:11699`（`Intern/CloneStr` `:11706-11710`）**未补**，且删并林后仍由 `compiler_csg.cheng:30382` / `parser.cheng:3646` 两个残余调用点汇入同一 impl ⇒ 设计若写「删并林 = 时间墙消除」须改为「消除并林相那一条，同族站点仍在」。
   - ② 设计（及本文件 rev.2）里「删并林 = 全量能跑完的前提」的表述须改为**必要但不充分**（§0.3-ii）。
   - ③ 全量当前的拦路虎是 TRIAGE 的 correctness 缺陷（`authority invalid`，消费者/索引侧 key 域缺 producer 维度，pre-existing）：S1b **既不因此降级为「只剩内存轴」，也不构成全量跑完的充分条件**（§0.7）。
8. **【rev.4 新增｜0c 必须文本侧表 + Seal 原位 Intern】** 0c 的名文本列**不得**存 intern id。`internPool` 的 id 是入池位序分配（`Intern` 先 `FindInternId`，未命中走 `internPoolAppendUnique` 返回 `pool.texts.len - 1`）；今天字段名/变体名在 **Seal 相**才入池（`typed_expr_type_arena.cheng` 工作树 `:1634`/`:1816`/`:1940`），而 `FillGenericSymbols`（`:5196`）与 `FillDeclarationSymbols`（`:5313`）在 **AppendSource 相**入池 ⇒ 池序是「[全部源 generic+symbol 名] 然后 [全部字段/变体名]」。若把名 `Intern` 前移到 `FillTypeSyntax`，池序变成按源交错 ⇒ 同文本不同 id ⇒ `symbolNameIds`/`childNameIds`/`memberNameIds` 变 ⇒ `artifactRaw32` 变 ⇒ **B4 整林不等价**（§6.2-4 定为直接否决）。**正确形态**：0c 存 `str[]` 文本表，Seal 在原调用位 `Intern`。**机制依据**：`artifactRaw32` 由 `typedExprTypeArenaHashMaterialized`（工作树 `:408`）**逐列显式枚举**，不是哈希整个 arena ⇒ 新列只要不进该枚举表就不扰动 `artifactRaw32`——这正是 0c 能宣称「纯加、B4 不变」的机制，但**前提是不许提前 Intern**。
9. **【rev.4 新增｜§2.2 AppendSource 段的 `Fill*` 族不需要行空间改写】** 6 个 fill 全部用 `arenamod.ArenaArrayInt32Add(value.arena, value.column, …)` **顺序 append**（工作树锚点 `FillTokens:4902`、`FillTypeSyntax:4926`、`FillBracketArgs:5139`、`FillGenericSymbols:5165`、`FillGenericSymbolChildren:5249`、`FillDeclarationSymbols:5265`），循环上界本就是单源树的 `tree.X` ⇒ 按源序驱动即自动落到正确全局行，**一行都不用改**。原文 §2.3「写入 `value.*` 时须用 `base + 局部行`」对这 6 个函数不成立。
10. **【rev.4 新增｜`IndexFields`/`BuildSyntaxOwnership` 逐源化的两条硬前提】** ① `fieldStartsByDeclarationRoot`/`fieldCountsByDeclarationRoot`/`fieldTypeSyntaxNodeIndexes`/`typeSyntaxParentNodeIndexes`/`typeSyntaxEnclosingSymbolIds` 必须在 **Init 期按索引总数一次性分配**（现 `typedExprTypeArenaBuildState` 工作树 `:253-265` 按 `tree.typeSyntaxCount` 分配）；② `IndexFields`（工作树 `:3652`）的 **`fieldCount` 分配游标必须跨源延续**，按源重置即 CSR 错、`symbolMemberStarts/Counts` 静默错。逐源与整林等价的原因：三段式按 declarationRoot 升序分配，而源 k 的所有根行号恒大于源 k−1。`BuildSyntaxOwnership`（`:3705`）的 parent 段与反向段逐源可做（父节点恒同源，判词 `"TypeSyntax parent crosses source"` HEAD `:3515`/工作树 `:3748`）。
11. **【rev.4 新增｜reuse 路径已被证不可达，并被断言钉死】** `reuseTree` 即 `linkPlan.exprLayer.sourceCount > 0 || linkPlan.exprLayer.exprs.len > 0`（`compiler_csg.cheng` 工作树 `:38611` 一带）。`plan.exprLayer` 的唯一非空写入点是 `system_link_plan.cheng:4899` 的 `NormalizedExprLayerMoveInto(plan.exprLayer, parsed.normalizedExprLayer)`，而 `parsed.normalizedExprLayer` 的两条来源（`system_link_plan.cheng:4738→:4752` 的 request-fields 分支、`parser.cheng:39116→:39129` 的 source header stub 分支）**都赋 `NormalizedExprLayer()` 空层**；immutable-source-overlay 构建器（`system_link_plan.cheng:3621-3900`）**完全不碰该字段**（零命中）。实测吻合：全部 `.rebuild/` 文本日志 `forest_build_start` 命中 **71 次，mode 全为 `reparse`，`clone` 0 次**。⇒ **reuse 分支是死码**，`CompilerCsgBuildParserForestAuthorityInto` 的 `reuseTree` 分支已由 S1b-0 改为 **hard-fail**（不再 clone），理由：被复用的整林**没有任何逐源 arena 实测**，会让物化相拿到空 reserve，而「空数组里取 reserve」正是红线禁止的落穿形态。**若该路径将来复活，它必须在自己的 Init 期产出 `sourceArenaBytesOut`；驱动不得为它兼容，也不许用默认值/0 代替。**
12. **【rev.5 新增｜更正 §6.5-8 自己的一处错：那四列 arena 里根本不存在】** §1.2-0c 与 §2.2 曾写「`typeSyntaxChildStarts/Counts`（**已在** arena）」「`typeSyntaxEnumVariantStarts/Counts`（**已在**）」——**实读推翻**：`typed_expr_type_arena.cheng` 全文对这四个名字的命中**全部是 `tree.*` / `state.tree.*`（parser 树）**，没有任何一处在 `value.*`/arena 列上（命中行 2160/2170/2171/2200/2218/2238/2408/2409/2417/2418，逐行核对均为 `tree.`）；`FillTypeSyntax`（工作树 `:4926`）实际只填 16 列，**不含**这四列。⇒ 0c 新列清单**必须补上这四列**，不是「已在」。
13. **【rev.5 新增｜CSR 载荷与「producer source index」列必须基址重算，不能照抄单源树】** `ParserValueExprTreeAppendFromImpl` 并林时对每个源做了三类重算（HEAD `parser.cheng` 实读），**单源树上这些值全是源内局部**：
    - `out.typeSyntaxChildNodeIndexes ← typeSyntaxOffset + sourceChild`（`:11102`）；`out.typeSyntaxChildStarts ← childStart`，而 `childStart` 是**目标侧运行游标** `out.typeSyntaxChildCount`（`:11235`）⇒ arena 侧须 `childBase + treeChildStart`，`-1` 保持 `-1`。
    - `out.typeSyntaxEnumVariantStarts ← -1 : typeEnumVariantOffset + sourceVariantStart`（`:11270-11280`）；`out.typeEnumVariantPayloadTypeSyntaxNodeIndexes`（`:11012`）同理 ⇒ 载荷里的行号要加 **`typeSyntaxBase`**。
    - **`out.typeSyntaxProducerSourceIndexes ← sourceOffset + sourceProducerIndex`（`:11194`）**，`sourceOffset` 是目标侧运行源序 ⇒ **单源树该列恒为 0**。流式模式下 arena 的每一个「producer source index」列**必须写循环下标**，**照抄树值会把全部行记成源 0** —— 这是**静默 miscompile**，且会让 `BuildSyntaxOwnership` 的 `"TypeSyntax parent crosses source"` 校验恒真（0==0），把错误藏住。
    - 受影响读取点（工作树实读，7 处）：`:3742`/`:3746`（parent 跨源校验）、`:4908`（FillTokens）、`:4931`（FillTypeSyntax）、`:5060`（FillFunctions）、`:5173`（FillGenericSymbols）、`:5291`（FillDeclarationSymbols），外加 §6.5-8 新增的 `typeSyntaxEnumVariantProducerSourceIndexes`。
    - ⇒ **`AppendSourceInto` 签名必须带 `producerSourceIndex`**（施工图 §1.2-1a 现签名**没有它**），上述列一律由该形参写入。

---

## 附录 A：本席实读锚点（全部 `文件:行`）

```
compiler_csg.cheng
  1471 字段 · 33027 死码 helper · 33034-33179 并林函数（33050-33061 reuse clone；33076-33092 totalArenaBytes+reserve；33104-33106 forest trace；33115-33119 精确 reserve；33134-33160 pass0 索引+计量+释放；33161-33168 pass1 并林；33169-33173 索引 seal）
  33182-33347 R0 ObserveSourceTree（33186 形参；33339-33342 形状校验）· 33350-… R0 ObserveExactSourceTree（33354；33362-33365）
  35464 TypeImportAuthorityBuildInto（不吃森林）· 35512-35567 Finalize（35521-35525/35528/35537/35545/35553/35554-35565）
  36002 abort 释放 · 36033 payload-move 断言 · 36642 metadataContexts 构建 · 37102/37142/37150 R0 reuse · 37308 R0 exact
  37746-37780 每轮 exprLayer 重建（读 frontierParsedSources）· 38209-38212 typed_ir_done · 38290/38299 定义 · 38544 reuse flag
  38794 metadata_contexts_built · 38825 相位埋点 · 38834-38845 并林调用 · 38853-38858 索引对拍门 · 38866-38871 R1 · 38881 R0
  38910 finalize · 38912/38914 type_arena 埋点（43e12c322 新址，位于 bind 之前；死码址 38877）· 38921-38923 arena bind · 38924 BindTypedIrExactDeclarationLayouts · 38930 after_type_arena_production · 39069 轮循环 · 39106-39108 frontier 统计与释放
  frontier store: 30719-30774 Ensure（30743-30774 命中返回）· 30825 move 进 fullSourceLayers · 30912 CapacityBytes · 39107 Release
typed_expr_type_arena.cheng
  73-78 authority 结构 · 90-115 S1a 索引结构 · 253-265 buildState · 101-115 索引列
  723-957 Intern · 1284-1299 AuthorityRow · 1321-1455 ResolveNominal（1418-1444 跨源；1433 owner token 树读；1440-1444 TypeId 必须已有效）
  1479-1549 Preflight · 1550-1743 BuildObject · 1744-1861 TupleAlias · 1862-2058 BuildEnum · 2149-2378 ParserAuthorityShape
  2459-2509 Less/KeyEqual · 2574-2602 FindDeclaration · 2711-2740 ExportedInto · 2742-2789 FindGenericSymbol
  2791-2842/2844-2919 ResolveUnqualified/Qualified · 2921-3110 BuildPackageForestInto · 3123-3416 S1a 索引（3240-3247 行序；3254-3299 BuildSource；3309-3416 VerifyAgainstForest）
  3419-3469 IndexFields · 3472-3550 BuildSyntaxOwnership · 3553-3573 DependencyIndirect · 3762-3861 DependencyProof
  4235-4280 ObjectBaseTargetInto（4270 树读）· 4283-4392 FinalizeObjectBaseDfs · 4481-4492 FinalizeObjectBases · 4494-4667 CompleteGenericArgumentsInto（4508-4514 树读）
  4669-4691 FillTokens · 4693-4797 FillTypeSyntax（4713 parserKind；4751 declOwner；4756-4761 genericStart/Count；4766 rootKind）· 4799-4904 FillFunctions
  4906-4930 FillBracketArgs · 4932-5014 FillGenericSymbols · 5016-5030 FillGenericSymbolChildren · 5032-5092 FillDeclarationSymbols
  5094-5127 ReserveAggregatesRec · 5132-5410 InternSyntaxRec（5284-5291 声明根树读）· 5413-5518 FillGenericSymbolTypesRec（零树读）
  5520-5594 RealizeDeclarationsRec（5530 树读）· 5596-5656 SpecializePendingRec（5617-5622 树读）· 5659-5681 PatchPendingApplyRec
  5684-5705 BindFunctionOwnersRec · 5708-… BindFunctionReturnsRec · 5763-5941 BuildFromParserTreeInto（5776-5779 Init；5811-5822 bucket；5826 scalar；5912-5921 authorityUsed；5934-5935 hash；5936 validate）
  6556 StrictValidateInto
typed_expr.cheng
  579 callDeclarationProducerFunctionRows · 1204 valueExprTree 字段 · 4802 arena move 进 typedIr · 7345-7360 BeginValueExprBorrow
  14898-14951 函数身份（14946-14949 functionRowOut）· 15085-15160 手动消费消费者（15115 比较行）
  2090 BuildStructuredTypeArenaFromParserTreeInto（wrapper）· 30635-30717 AddCallDeclarationWithProducer · 30830 AddScopeCallDeclaration
  30888-30906 TreeFunctionRowExact（按 producerSourceIndex 过滤）· 30959-31000 AddManualScopeCallDeclarationsRec · 31003-31015 AddContext（36946-36950 ctxIndex 即 producerSourceIndex）
  31077 SealCallDeclarations · 36935-36964 FinishCallDeclarationsManualRec · 37327-37336 typed 侧自建 index（用 ir.valueExprTree）
  37021-37080 ManualConsumeParameterTypeId · 66337-66352 build index + lookup · 66526-66542 R1 入口
parser.cheng   # rev.3 已按 HEAD 9c368085c 逐条重锚；`:10540` 之后的旧锚点因 c5f6c6736（+43/−8）漂移，漂移量按插入点累积（+7 / +18 / +24 / +35）
  562 Tree 结构 · 10218 AppendFrom · 10280 functionOffset · 10303-10313 逐节点重映射（remappedSourceIds，node 循环缓存）
  10222 AppendFromImpl · 10552/10553 token 循环缓存（Intern/CloneStr 10564-10567）· 10977/10978 typeSyntax 循环缓存（10990-10993）
  11699 region 循环（Intern/CloneStr 11706-11710，**同族三处中唯一未补**）· 14568 词法期每源一次 Intern（非同族）· 3646 delta 层 AppendFrom 调用点
  10722 typeSyntaxOffset（旧 10704）· 11270 源侧 declarationFunctionRows · 11319-11320 目标侧 rebase（functionOffset+functionRow，旧 11284）
  11387-11388 declarationFunctionCount 累加（旧 11352）· 26649 精确容量自述「268MB+134MB」（旧 26604-26617）· 26810 ReadTreeFromTextReserved（旧 26775）
```

**附录 B：`VERIFY §二十一` 实测锚点（rev.2 新证据，原始件在 `.rebuild/run_b5/`）**

```
A 轮（默认门，干净槽位，lease_hits=0）：rc=125 @176s；末两行 = forest_parsed src=60 arena=246432 rss=651346928 live=1770670 / forest src=61 bytes=4490367 rss=651068400 live=1770656；
  守卫读数 rss_bytes=836388064 > limit_bytes=805306368；trace 采样峰 716,883,000 B（forest_parsed src=47）；pass0 前 61 源 Σ=255,983,072 B
B 轮（抬门 4GiB，CHENG_PARENT_RSS_GUARD=1）：rc=143（B5 于 22:41:43 主动 SIGTERM）wall=1271s；pass0 234/234 Σ=1,290,508,960 B；
  pass0 末 forest_parsed src=233 arena=117280 rss=781288480 live=3089597；src=0 起点 live=1470764；stage：after_profile_source_payload_release rss=609387432
  pass1：forest src=0 rss=2072512456 → appended src=0 rss=2082195424 → appended src=1 rss=2107262968 → forest src=2 bytes=817253 rss=2107262968 后 16+min 零输出
  两次 sample identical：ParserValueExprTreeAppendFromImpl ← CompilerCsgBuildParserForestAuthorityInto；59% langintern.Intern/FindInternId + 41% strings.CloneStr→cheng_malloc
  peak max_rss=2,107,262,968 B；type_arena_lines=0 / typed_ir_done_lines=0 / facts_lines=0 / forest_appended_lines=2
  src=2 = core/analysis/cleanup_cfg（817,253 B / 16,458 行 / 811 声明）；索引→文件映射与 §八 全对（identify_src2.py / closure_estimate.py）
  progression：src=19 rss 594.1MB → 39 598.4 → 59 607.0 → 79 627.7 → 119 633.4 → 139 670.4 → 179 743.4 → 219 752.6 → 233 781.3（live 同步 1.47M→3.09M）
驱动：.rebuild/run_b5/kd，kd_sha256=b2228aa29cb0d198d1d3d6b6a711e8873e65e20278c468940a63c2a7779b46f0（bake rc=0/197s）
槽位：.rebuild/run_b5/{acquire_lock.sh,release_lock.sh,locked_runs2.log}（mkdir COMPILE_SLOT.lock 原子 test-and-set；22:17:36 取得 / 22:41:43 释放）
```
