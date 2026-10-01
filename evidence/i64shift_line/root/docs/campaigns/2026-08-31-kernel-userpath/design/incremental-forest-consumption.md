# incremental-forest-consumption —— 森林增量消费（streaming）拆分设计

**rev.3** · date_utc=2026-09-10 · 只读分析席（对 `src/**` 零写入、零编译、零 git 写）
· **锚点世代**：主树 HEAD `9c368085c`（`git rev-parse --short HEAD` 实读），**全部 `文件:行` 已按该 HEAD 逐条 `grep -F 点名符号` 复核**。
`parser.cheng` 在 rev.2 锚点 `b28667131` 之后被 `c5f6c6736`（append 同族站点 per-source remap 缓存，`+43/−8`）改动
⇒ 本文件 `parser.cheng` 的 **>10546 行号整体 +35、10570~10971 段 +18**，rev.3 已重锚；`compiler_csg.cheng` / `typed_expr.cheng` /
`typed_expr_type_arena.cheng` 在 `b28667131..9c368085c` 内**零改动**（`git diff --numstat` 实核）。rev.2 行号只对 HEAD `b28667131` 有效、
rev.1 只对 `b6b4816e4` 有效，均已作废。工作树 `parser.cheng` 另有他线 WIP（本轮实读 `+192/−96`）⇒ **行号一律以 HEAD 为准**。
· 实测出处 `verify_append/VERIFY_fullgo_0910_append.md`（下称 **VERIFY**）§一~§十 + **§二十一 A/B 双轮** + **§二十二 remap 缓存实验（rev.3 新证据）**
· correctness 缺陷定性出处 `design/authority_invalid_triage.md`（下称 **TRIAGE**）：判重 map key 只有 `(spanStart,spanEnd)`、缺 producer/源维度 ⇒ 跨源同 span 误判、pre-existing
· 施工图 `design/pa_s1b_edit_plan.md` **rev.2**（下称 **施工图**；rev.3 由平行线在改，本设计不改该文件、只对齐口径）——两者冲突时以施工图为准，本设计只负责前提与算术
· **rev.3 增量**：① §0.4(ii) 前提由「前提」改判 **「必要但不充分」**；② 新增 **§1.6 append 同族站点的代价模型与残余项**（三站点表 + 代价模型 + 全量 234 源缓存前/后 A/B）；③ §4.2/§5 的 S1b-N 口径改「**消同族站点的冗余整段 clone+intern**」；④ rev.2 的全量 234 源"卡死"单点口径由 VERIFY §二十二 缓存后实测**并列替换**，旧外推作废。
· 数字标注：`[实测]` = 原始件读数；`[实测推算]` = 单点推算，非上界；`[估计]` = 未验证

---

## 0. 结论摘要（rev.3：前提 (ii) 改判「必要但不充分」；其余为 rev.2 前提两段式）

1. **森林（`work.typeArenaParserForest`）只有两个真实内容消费者**：R1 = 源上下文精确索引（`compiler_csg.cheng:38866`），R2 = TypeArena 生产（`compiler_csg.cheng:38910 → 35512`）。第三个疑似点 R0（`compiler_csg.cheng:37146/37308`）**只读 `producerSourceCount` 做形状校验**，数据靠自 parse（`33219/33222`），是寄生参数。
2. **typed-IR 轮循环（`compiler_csg.cheng:39069`）不读森林，且结构上不可能读**：R2 内 `compiler_csg.cheng:35553` 已 `ParserValueExprTreeRelease(work.typeArenaParserForest)`；`work.typeArenaParserForest == nil` 还是 payload-move 的硬断言合取项（`36033`）。**round>0 不会重读已释放源的树——无需插桩即可判定。**
3. **卡点不在轮循环，在 R2 的跨源类型解析**（`typed_expr_type_arena.cheng:2791/2844` 需要全局声明集）。**S1a 已把这一相建好并自证**：索引结构 `typed_expr_type_arena.cheng:90-115`、构建/对拍 `:3123-3416`、双产出 `compiler_csg.cheng:38834/38843`、硬门与 `verified=1` 埋点 `:38848-38861`，`decl_index verified=1`（VERIFY §十九）⇒ 「权威相索引化可行」**已由实测关闭**。
4. **前提两段式（rev.2 核心增量，按 VERIFY §二十一 A/B 双轮重写；其中 (ii) 已由 rev.3 按 §二十二 改判为「必要但不充分」）**
   - **(i) pass0 的逐源消费必须流式，Σ 不得先攒后消。** `[实测]` B 轮抬门：pass0 全量 234/234，**Σ=`1,290,508,960 B`=1,230.73 MiB = 门线 805,306,368 B 的 1.60×**（与 VERIFY §六/§八 逐字节一致）。`[实测]` A 轮干净槽位（`lease_hits=0`）默认门下 **rc=125 @176s**：`forest src=61` 入口 rss 已 **651,068,400 B（620.9 MiB）**，parse 中守卫读数 **836,388,064 B（797.6 MiB）> 805,306,368**，`forest_parsed_lines=61`。⇒ **门内墙在 pass0 大源侧**，`src=61`=`core/backend/primary_object_plan.cheng`（单源树 131.76 MiB，`[实测]` `bytes=4490367` 与 §二十一 21.3 文件映射逐字节对上）。
   - **(ii) 删除并林半段 `compiler_csg.cheng:33076-33168` 是「全量构建在 Cheng 链上能否跑完」的「必要但不充分」条件（rev.3 改判，取代 rev.2 的「前提」说），且不只是省内存。**
     **必要（已实测）**：并林调用点上的 token / typeSyntax 两条同族墙确实被移除——同族三站点里两处已补 per-source remap 缓存（`c5f6c6736`，缓存在 impl 内 ⇒ 对全部调用点生效），`[实测]` 同入口（`typed_expr_type_arena_smoke`，29 源）森林窗 `after_profile_lookup` **774,266→553,914 ms（−28.5%）**、整轮 **793→577s**、最长零输出窗 **598→397s**；全量 234 源抬门跑由"卡死"变为 **583s 推进到 append 40**（§1.6）。
     **不充分（两条独立理由，rev.3 新增）**：① **同族墙存在于多处**——第三处 region 循环（HEAD `parser.cheng:11699-11710`）**仍未缓存**，是本轮实测的**残余主项**（§1.6）；② **当前全量的真正拦路虎是 correctness 缺陷**——`[实测]` 抬门 4GiB（diagnostic）`rc=1 @583s`、`forest_parsed=234`、`forest_appended=40`，末行 `authority invalid … producer=40`；TRIAGE 定性为判重 key 缺 producer/源维度、跨源同 span 误判、**pre-existing 且独立于 S1b**（删并林不修它）。
     `[实测]`（**缓存前的树**，VERIFY §21.2/§21.3；rev.3 保留原文、仅标注世代）B 轮 pass1 `mode=reparse` 精确预留 1.23GiB 触页后 rss 745→1,985.7 MiB，**只 append 完 `src=0/1` 就卡死在 `src=2`**（`core/analysis/cleanup_cfg.cheng`，817,253 B / 16,458 行 / 811 声明），**16+ 分钟零输出、100% CPU**；两次 `sample`（22:39/22:41）栈 **identical** = `ParserValueExprTreeAppendFromImpl ← CompilerCsgBuildParserForestAuthorityInto`，热点 **59% `langintern.Intern/FindInternId` + 41% `strings.CloneStr→cheng_malloc`**；peak rss **2,107,262,968 B=2,009.6 MiB**；`type_arena_lines=0`、`typed_ir_done_lines=0`、`forest_appended_lines=2`。⇒ **并林在缓存前口径下是时间墙，不只是内存墙。**
   - **(iii) S1b 单独不可能过 768MiB。** `[实测]` B 轮 pass0 自身活块 `live` 从 `1,470,764`（`src=0`）单调升到 `3,089,597`（`src=233`），**Δlive=1,618,833**，rss `609,387,432 → 781,288,480 B`，距门线只剩 **24,017,888 B（22.9 MiB，已占 96.9%）**。⇒ 材料化相一开场就贴着门线跑。
5. **表述纪律（rev.3 收紧）**：凡「删并林即可过门」的说法一律作废；凡「删并林即可跑完全量」的说法**同样作废**。正确表述是——**删并林消 1.23GiB 活块 / 2,009.6 MiB phys 峰，并且是「全量跑完」的必要而非充分条件**（同族站点尚有一处未缓存；全量当前止步于独立于 S1b 的 correctness 缺陷，§0.4(ii)）；过门另需消 pass0 活块累积（第二刀，见 S1b-M，§4.2）。
6. **估工升级**：rev.1 的 19.5h 核心估值偏低——**施工图 §2.2 指出的 Seal 段 7 处树读 rev.1 未计**。对齐施工图 rev.2：核心 **26~34h**、合计 **34~46h**（不含 S1b-M/N）。

---

## 1. 数据依赖核查（最重要）

### 1.1 相位账：森林从哪来、到哪去

`compilerCsgBuildConsumeWithOverridesCoreInto`（`compiler_csg.cheng:38299`）内的顺序（行号为当前 HEAD 实读）：

| 序 | 相位埋点 / 调用 | 行号 | 与森林的关系 |
|---|---|---|---|
| 1 | `CompilerCsgTraceStage("after_profiles")` | 38644 | — |
| 2 | `CompilerCsgTraceStage("after_reachable_function_set")` | 38764 | — |
| 3 | `compilerCsgMemTraceEmit("metadata_contexts_built")` | 38794 | `typedMetadataContexts` 在森林窗之前建好（`compilerCsgBuildMetadataContextsRec` `36670`） |
| 4 | `CompilerCsgTraceStage("after_profile_source_payload_release")` | 38825 | — |
| 5 | `CompilerCsgBuildParserForestAuthorityInto(...)` | **38835**（定义 `33034`） | **写**：pass0 逐源 parse 量 arena 后释放（`33134`/`33158`，`forest_parsed` 埋点 `33139`）→ pass1 一次预留 `totalArenaBytes`（`33091-33092`）后逐源重 parse append（`33163`）再释放（`33167` `forest_appended`） |
| 6 | `texpr.TypedExprBuildSourceContextExactIndexWithManualAuthority(work.typedMetadataContexts, work.typeArenaParserForest, ...)` | **38866**（实参 `38868`） | **读 R1（整林）** |
| 7 | `compilerCsgBuildExprCallProfileSourcesRec(...)` | 38881 | 仅当 `reuseLinkPlanExprLayer`（`38544`）时读 R0（`37146-37150`）；本体自 parse（`33219`/`33222`） |
| 8 | S1a 声明索引硬门 `TypeExprTypeDeclarationIndexVerifyAgainstForestInto` + `decl_index … verified=1` | `38848-38861`（校验 `38853-38858`，埋点 `38860`）；索引构建点 `38834/38843` | S1a 产物；S1b-2 随森林删（施工图 §1.1-14） |
| 9 | `CompilerCsgTypeArenaFinalizeParserForestInto(work, err)` | **38910**（定义 `35512`） | **读 R2（整林）**；`35538` 权威相、`35546` 物化相，收尾 `35553` **释放森林** |
| 10 | `before_typed_facts` / `after_typed_facts` | 38964 / 39003 | — |
| 11 | `compilerCsgBuildTypedIrReach(work, ...)` | **39069**（定义 `38290`） | **森林已不存在** |

烧穿点：`compiler_csg.cheng:35553` `parser.ParserValueExprTreeRelease(work.typeArenaParserForest)`；终态断言合取项 `compiler_csg.cheng:36033`（abort 路径释放点在 `:36002`，**已死码 helper `parserForestReleasePending` 在 `33027-33032`，全仓零调用**）。
森林字段 `typeArenaParserForest` 全仓文本命中 **24 处，全在 `compiler_csg.cheng`，零外部文件命中**（`grep -rn typeArenaParserForest src/ --include=*.cheng`）⇒ 爆炸半径封闭。

### 1.2 typed-IR 各 round 的读取点逐条

轮循环骨架：`compilerCsgBuildTypedIrReach`（`38290`）→ `compilerCsgBuildTypedIrReachRound`（`38277`）→ `Prepare`（`37690`）/`Commit`（`37953`）。

| 读点 | 函数 + 行号 | 实参来源 | 是否碰森林 |
|---|---|---|---|
| 每轮准备：清 typed facts | `compilerCsgBuildTypedIrReachRoundPrepare` `37698` | `work.typedIrRoundFacts` | 否 |
| 每轮准备：清 expr layer | `:37705` `parser.NormalizedExprLayerReset(work.exprLayer)` | — | 否 |
| **每轮重建 expr layer** | `:37774` `compilerCsgExprLayerForFrontierFunctionsImpl(work.sourceSnapshots, work.sourceSnapshotIndex, work.exprCallProfiles, work.profileIndexLookup, work.profileCallLookupCache, work.frontierParsedSources, ...)`（实参 `:37780`） | 第 6 实参是 **`work.frontierParsedSources`**，不是森林 | **否** |
| 该 impl 的每源 parse | `compilerCsgExprLayerForFrontierFunctionsImplRec` `31037` `CompilerCsgFrontierParsedSourceStoreEnsure(...)`（定义 `30719`） | `sourceText` 取自不可变快照（`31028`） | **否**（自建 per-source 解析，`30825` move 进 `store.fullSourceLayers[profileIndex]`） |
| 该 impl 的每函数借层 | `:31095` `CompilerCsgFrontierParsedSourceFunctionLayerBorrow(...)`（定义 `30849`） | 只借 `profileIndex` 自己的层 | **否** |
| round 0 建 typed IR | `:37989` `TypedExprBuildIrForFunctionSourceRangesFromMetadata(work.frontierTypedSourceTexts, work.typedIrRoundFacts, work.exprLayer, work.typedMetadataContexts, round.typedIrFunctionRanges, work.typedIr, ...)` | 源文本 + 当轮 exprLayer + contexts | **否** |
| round 0 后 seal | `:38015` `TypedExprSealBuildSourceContextIndex(work.typedIr, work.typedMetadataContexts, ...)`；`:38025` 断言 `work.typedMetadataContexts.len == 0` | 所有权转移进 IR | 否 |
| **round>0 追加** | `:38072` `TypedExprAppendIrFunctionsForFunctionSourceRangesSealed(work.frontierTypedSourceTexts, work.typedIrRoundFacts, work.exprLayer, round.typedIrFunctionRanges, work.typedIr, ...)` | **不收 contexts**、不收森林 | **否** |
| 可达扩张 | `:38223` `CompilerCsgReachableExpandFromExactTypedIr(work.reachableSet, work.typedIr, work.parserNormalizedExprReceiptAccumulator, ...)` | typedIr + receipt | **否** |
| 轮埋点 | `:38209` `typed_ir_done round={st.reachRound} cap=… used=…` | — | 否 |
| 固定点收尾 | `:39106` `frontier_parse_cache builds/hits/acquires`；`:39107-39108` store 整批释放 | — | 否 |

`typedMetadataContexts` 由 `compilerCsgBuildMetadataContextsRec`（`36670`）在**森林窗之前**建好（`38794` 埋点在 `38835` 之前），该函数内 `typeArenaParserForest` 零命中。

### 1.3 判定表

| 命题 | 判定 | 证据（当前 HEAD 行号） |
|---|---|---|
| **P1：源 i 的树只被「源 i 自己的 typed 生产」读取（typed 生产相内）** | **成立** | 森林在 `35553` 释放，生产相入口在 `39069`；生产相全部输入为 `frontierParsedSources`（`31037`，按 `profileIndex` 自 parse 自借）+ `frontierTypedSourceTexts`（`37757` 建）+ `typedIr` |
| **P2：round>0 会再读已释放源的树** | **不成立（结构上不可能）** | 同上；`36033` 把 `typeArenaParserForest == nil` 作为 payload-move 硬断言合取项 |
| **P3：R1（context 精确索引）逐源可拆** | **成立** | `typed_expr.cheng:36946` 以 `ctxIndex` 作 `producerSourceIndex` 逐 context 调 `:31003` → `:30959`；树查询按源过滤：`typedExprManualConsumeTreeFunctionRowExact` `:30888`、`typedExprManualConsumeParameterTypeId` `:37051`。**必做**：`producerFunctionRow` 是树内行，整林=全局行、单源=源内行 ⇒ `:30959/:31003/:36944` 需加 `producerFunctionBase` 形参（施工图 §2.4；`parser.cheng:10280/11319-11320/11387` 证明整林就是 `functionOffset + localRow`） |
| **P4：R2 权威相不可直接拆、可拆为「索引相 + 物化相」** | **成立，且 S1a 已证** | 跨源读取面只有声明根：`typed_expr_type_arena.cheng:2791` 用 `sortedDeclarationRoots`（全源）查 `imports.targetSourceIndexes[importRow]`、`:2818` 判歧义、`:3077` 上溯父、`:2742` 查泛型符号；而 `typedExprTypeAuthorityDeclarationKeyEqual`（`:2492`）先比 `ProducerSourceIndex`，`DeclarationExportedInto`（`:2711`）只读导出位 ⇒ 紧凑索引足够。**S1a 索引已含全部所需字段**（`:90-115`），`decl_index verified=1` |
| **P5：TypeArena 物化相逐源可拆** | **成立，但 Seal 段有 7 处树读需先补事实** | `typedExprTypeArenaFillTypeSyntax` `:4693`、`FillFunctions` `:4799` 按源分桶；`parser.cheng:10722` `typeSyntaxOffset = out.typeSyntaxCount` 给出位置恒等。**Seal 段 7 处树读替换清单见施工图 §2.2**（rev.1 漏计，是本设计最大的估算缺口） |
| **P6：合并森林是必需的吗** | **不是** | R0 只要 `producerSourceCount`；R1 逐源过滤；R2 只需声明索引 + 逐源物化。三个消费者都不需要「整林同时在场」 |

### 1.4 可拆边界：森林被替换为三件东西

- **S-a 逐源树（瞬时）**：每次只活一棵，消费完立即释放。
- **S-b 全局类型声明索引（常驻、紧凑）**：`(producerSourceIndex, nameText, kind, exportedFlag, globalTypeSyntaxRoot, globalDeclarationRoot)`，服务 R2 权威相。**S1a 已落地**（`typed_expr_type_arena.cheng:90-115`）。
- **S-c 全局行基址前缀和（常驻、O(源数)）**：`typeSyntaxBase/declarationBase/tokenBase/functionBase`。**S1a 已落地一半**——`compiler_csg.cheng:33078-33081` 游标 + `33147-33157` 累加；`functionBaseBySource` 尚缺（施工图 §2.1 补项）。

**新增常驻成本 = S-b + S-c 的差额**，量级 = 类型声明条数 × ~64B + 234 × 数 × 4B，与 1,230.73 MiB 不同量级（**精确值未验证，见 I2**）。

### 1.5 需插桩验证项

| ID | 未知量 | 为什么重要 | 最小插桩方案 | rev.2 状态 |
|---|---|---|---|---|
| **I1** | **pass0 单源 parse 的**内部**峰值**（`forest_parsed` `33139` 在 parse 返回后才发，看不见 parse 中瞬态） | 决定 768MiB 首刀打哪一轴 | `forest_parse_begin/end`（落 `33104` 旁**并同时记 `live`**）。判据：`end.rss − begin.rss` 对最大源应 ≈1.34×arena（`[实测推算]` A 轮 `src=61`：入口 651,068,400 → 守卫 836,388,064，Δ=185,319,664 B，对照单源 arena 138,162,976 B） | **A 轮已证门内墙在 pass0 大源 ⇒ 该埋点从「建议」升级为必测项** |
| **I2** | **轮循环期间 `frontierParsedSources` 的常驻** | 该 store 跨轮持久（`Ensure` `30743-30774` 命中即返回，无逐轮回收），只在 `39107-39108` 整批释放；round 0 frontier 覆盖全部可达函数 ⇒ 很可能长到 234 源 = **二次长林** | `CapacityBytes`（`30912`）**已存在但未在本相上报**（全仓只在 `31250/31301` 的 ledger 用）⇒ 补 `frontier_store cap_bytes=`（落 `:38209` 旁）。判据：cap 单调升到 GiB 级 ⇒ 墙只是搬了家 | 未测，仍开 |
| **I3** | `producerFunctionRow`（`typed_expr.cheng:30894`）的全局/局部编码一致性 | 决定 R1 能否直接喂源本地树 | 施工图 §2.4 已给解法（加 `producerFunctionBase`，`parser.cheng:10280/11319-11320/11387` 证明整林就是 `functionOffset + localRow`）；**残留风险未验证**：`compiler_csg.cheng:38866` 建的那个 index 的下游是否还有跨源比较 `callDeclarationProducerFunctionRows`；typed 侧自建于 `typed_expr.cheng:37327` 行空间自洽 | 方案已定，风险仍开（B4 必测） |
| **I4** | 权威相里除声明索引外是否还留了别的跨源树读取 | 决定 S-b 是否完备 | 施工图 §2.1 已逐条核过（`:2492/:2469/:2574/:2711/:2844/:2742`）；`FindGenericSymbol` 只读**当前源**树 ⇒ 单源树即可 | **已关闭**（S1a 对拍 + 施工图实读） |

### 1.6 append 同族站点的代价模型与残余项（rev.3 新增，行号全部按 HEAD `9c368085c` 重锚）

**问题**：`ParserValueExprTreeAppendFromImpl`（`parser.cheng:10222`）内有多处「逐项把该项所属源的**整段源文本** `CloneStr` 后再 `Intern`」的同族循环。VERIFY §21.9 锁定 token 循环为时间墙根因（此前**无** node 循环 `:10303-10330` 那样的 per-source 缓存）；本轮把三处站点逐一定位、两处补缓存、一处留作残余。

| # | 站点（循环） | 改前行号（实验树，patch 前） | 当前 HEAD 行号（`grep -F` 复核） | 是否已缓存 | 实测状态 |
|---|---|---|---|---|---|
| 0 | node 循环（同族**参照**，本就带缓存 `remappedSourceIds`） | — | `10303-10330` | **是（既有）** | 缓存形状的来源；此处 intern 的是 `CloneStrRange(text,0,sourceLen)` |
| 1 | token 循环 `for tokenIndex in 0..<sourceTree.tokenCount` | `10546-10551` | `10546-10569`（注释 `10546-10551`，`var remappedTokenSourceIds`@`10552`） | **是**（`c5f6c6736`，patch1） | `[实测]` 同入口（`typed_expr_type_arena_smoke`，29 源）src=2 单源 append 由「>1173s 未完」变为「≤633s 完成」；整轮 793s 自结束（缓存前 1213s 盒到期） |
| 2 | typeSyntax 循环 `for typeNodeIndex in 0..<sourceTree.typeSyntaxCount` | `10954-10960`（patch1 后 `10972-10978`） | `10977-10995`（注释 `10972-10976`） | **是**（`c5f6c6736`，patch2） | `[实测]` 森林窗 774,266→**553,914 ms（−28.5%）**、整轮 793→**577s**、最长零输出窗 598→**397s**、src=2 首见 el 633→**437s** ⇒ 判词仍为**部分缓解**（未降到 <120s 量级） |
| 3 | region 循环 `for regionIndex in 0..<sourceTree.regionCount` | `11664-11675` | **`11699-11710`**（`Intern(`@`11706`、`CloneStr`@`11708`） | **否 = 残余主项** | `[实测]` 全量抬门跑 el≈400s（并林进行中）`sample`：热点仍在 `ParserValueExprTreeAppendFromImpl`，偏移 **+90536/+90504**（与 token 的 +49036/+49068、typeSyntax 的对应偏移均不同）；`lldb` 反汇编前序 = `ArenaArrayInt32Get(sourceTree.arena, sourceTree.regionSourceTextIds, …)`（`src/core/runtime/arena.cheng:400`，模块名 `arenamod`）→ `ParserValueExprSourceText`（`parser.cheng:14037`）→ `CloneStr`（`src/std/strings.cheng:468`）→ `Intern`（`src/core/lang/intern.cheng:728`）⇒ **553.9s 森林窗的主要残余，未补（超本轮授权）** |

**两处修复的入库与等价性**：`c5f6c6736`（`parser.cheng` **+43/−8**，`git show --numstat` 实核），修复后 `git show HEAD:src/core/lang/parser.cheng` sha256 = `2902d2e18b45605c3e1096a3cdbe52634c3a095f942411d22ee7eb94ecbb9198`，与缓存后实测所用驱动树**同一字节**（**仅限 `parser.cheng`**；该驱动树另有 9 条第三方 WIP，VERIFY §22.6）。字节等价经**同 `--in`/同 `--out` 的 pristine vs patched A/B `cmp`**：`ordinary_zero_exit_fixture` exe/primary.o 逐字节相同、`call_fixture` exe/primary.o 逐字节相同、`v6_direct1_repro` 两侧同 rc=2 且无产物（VERIFY §22.3/§22.7）。
**为何缓存不改 id 取值**（`[实读]` `intern.cheng`）：`Intern`（`:728`）先 `FindInternId`，命中即返回既有 id；未命中走 `internPoolAppendUnique`（`:710-725`），其返回 `pool.texts.len - 1`（`:725`）⇒ **id 是入池位序分配**；每个 `sourceId` 首见时仍在该循环同一位置触发一次 Intern，缓存的只是后续重复调用 ⇒ 入池顺序与全部 id 取值不变。三处各用**独立**缓存数组（三处 intern 的文本是否逐字节同形未证，不共用）。

**代价模型（VERIFY §21.9④，`[实测]` 根因 + 量级对拍）**：单源成本 ≈ **`tokenCount × L × (1+探测数)` 字节级内存流量**（每项一次 `CloneStr` = malloc+memcpy L 字节，加一次 `Intern` = hash O(L) + 探测×逐字节比对 O(L)）；`parser.cheng` `L=1,729,036 B`、tokenCount 数十万 ⇒ `10¹²–10¹³` 字节流量 ⇒ 内存带宽下 **16–20 分钟**，与实测停摆时长**量级吻合**。

**为什么 TypeArena / 探测 / hash 常量都不是这面墙**（逐条排除，防止把残余项归错因）：
- **TypeArena**：埋点在两轮（A/B 与 29 源 smoke）均 `type_arena_lines=0` ⇒ **无实测值**；它是独立 arena + 独立 `internPool`（`typed_expr_type_arena.cheng:5776-5778`），其生产在 `compiler_csg.cheng:35512` 的 Finalize 相、**不在** `ParserValueExprTreeAppendFromImpl` 栈上，而本轮全部 `sample` 热点都落在该函数内 ⇒ 不构成本墙。
- **探测**：探针 v2 直方图 `worst=51` **恒定**（当时 idxCap 16384/32768，远未退化），20min 内 `steps` 未跨 **524,288**（`lookups` 未跨 262,144）⇒ 非「探测爆炸」（VERIFY §21.9②⑤）。
- **hash 常量**：FNV offset basis 少一位十进制（实测 `1,469,598,103,934,665,603` = 正确值 ×10+7）是**事实**，prime 无错；但它只影响**探测路径**（`slot = hashValue & indexMask`、`step = hashValue >> 32 | 1`），而 **id 是位序分配**（上条）⇒ hash 常量不能解释"费时"，且探测步数已实测恒定（VERIFY §21.6④/§21.9⑤）。

**全量 234 源 A/B（缓存前 vs 缓存后，`[实测]`；rev.2 据 B 轮单点做的全量旧轮数/外推一律作废，本表并列缓存后实测）**

| 口径 | 缓存前（VERIFY §21.2/§21.3，B 轮） | 缓存后（VERIFY §22.8，`kd_remap2`） |
|---|---|---|
| 门 / 结果 | 抬门 4GiB；`rc=143`（22:41:43 SIGTERM）wall **1271s**，并林卡死在 `src=2`（16+min 零输出） | 抬门 4GiB（diagnostic）；`rc=1` wall **583s**，止步于 correctness 错 |
| 默认门 768MiB | `[实测]` A 轮（同缓存前的树）：`rc=125 @176s`、`forest_parsed=61`、守卫 `rss_bytes=836,388,064 > 805,306,368` | `rc=125 @176s`、`guard_hits=1`、`forest_parsed=61`、`forest_appended=0`、`max_rss=700,630,072 B`、守卫 `rss_bytes=836,453,576` ⇒ **两次都死在 pass0 取第 62 个源（src=61），并林尚未开始** |
| pass0 | 234/234，Σ=`1,290,508,960 B` | `forest_parsed=234`，`el≤281s` |
| 并林 | `forest_appended=2`（src=0/1 完成，src=2 停摆） | `forest_appended=40`；0→39 用 **~297s**；最长零输出窗 **90s**（el=397→487） |
| peak rss | `2,107,262,968 B`=2,009.6 MiB | `2,146,535,464 B`=**2.00 GiB**（未撞 4GiB 门） |
| 死点 | 无判词（被 SIGTERM 杀） | `authority invalid row=91185 kind=5 arm=0 auth_kind=7 auth_row=7838 expected_auth=0 owner=91184 span=26254:26272 source_local=1085 producer=40`（TRIAGE 定性：跨源同 span 误判、pre-existing） |

⇒ **全量 234 源跑不完 —— 但不是时间墙、也不是内存墙**：pass0 234/234 parse 完成、并林推进到 40/234、峰值 2.00 GiB 未撞 4GiB 门，止于 `producer=40` 的真实校验错误；该错误与 M3（37 源，`producer=8`）**同类同文、修复前就存在**，此前被时间墙遮住。**本节结论不外推**：未跑到的 `src=41..233` 是否还有别的错，未定（VERIFY §22.8 自陈）。

---

## 2. 候选方案

### 2.0 峰值算术（rev.2 补两项）

| 量 | 值 | 出处 |
|---|---|---|
| 门线 | 805,306,368 B = 768 MiB | VERIFY §一 |
| 森林窗入口保底 | `609,387,432 B`=581.2 MiB | `[实测]` B 轮 `after_profile_source_payload_release`（rev.1 引旧轮 551,797,672 B，已作废） |
| pass0 走完 234 源 | rss **`781,288,480 B`=745.1 MiB**、**live=`3,089,597`** | `[实测]` B 轮 `forest_parsed src=233` |
| pass0 起点 live | `1,470,764` | `[实测]` B 轮 `forest_parsed src=0` |
| **pass0 活块累积（rev.2 新增项）** | **Δlive=`1,618,833`、rss `+171.9 MB`（≈106 B/活块）** | `[实测]` B 轮 src=0→233 单调；**归因未验证**（源文本/坐标图/词法缓存/intern 池均候选） |
| 合并森林 arena（Σ） | `1,290,508,960 B`=1,230.73 MiB = 门线 **1.60×** | `[实测]` A/B 双轮，与 §六/§八逐字节一致 |
| **TypeArena 本体（rev.2 新增项，口径项）** | **两轮均 `type_arena_lines=0` ⇒ 无实测值**；且与 Σ **非同一 buffer**（`value.arena = ArenaInitDefault(1048576)` + 独立 `internPool`，`typed_expr_type_arena.cheng:5777-5778`），共驻点只在并林生产窗 `compiler_csg.cheng:35545`（森林仍活 + TypeArena 生长 + 保底 609,387,432 B），该窗本刀已删 ⇒ **其 `used` 不得与 1,230.73 MiB 相加** | 施工图 §0.4；门在它之前已被森林单独穿透（1.60×）⇒ 它**不可能是** 768MiB 的决定项 |
| 最大单源 arena | 140,599,840 B = 134.09 MiB（`src/core/lang/typed_expr.cheng`） | VERIFY §八 |
| 次大单源 | 131.76 MiB（`src/core/backend/primary_object_plan.cheng`，`[实测] bytes=4490367`）= 768MiB 门内死点 `src=61` | VERIFY §六/§八 + §二十一 21.3 |
| 单源 doubling 瞬态 | `[实测推算]` ≈**1.34 × 单源 arena**（A 轮 `src=61` 单点，**非上界**）；源码自述「268MB+134MB」（`parser.cheng:26647-26652`）是另一次/另一形态观测 | 施工图 §3.1 |
| 并林后实测峰 | **`2,107,262,968 B`=2,009.6 MiB** | `[实测]` B 轮 `max_rss`（缓存前树） |
| **缓存后全量抬门实测峰（rev.3 新增）** | **`2,146,535,464 B`=2.00 GiB**（`rc=1 @583s`，未撞 4GiB 门） | `[实测]` VERIFY §22.8（§1.6 A/B 表） |
| 森林成本 | ≈2,012 B/源行（641,443 行） | VERIFY §八 |
| 树宽 | `ParserValueExprTree`（`parser.cheng:562`）= 198 个 `ArenaArrayInt32` 列 + 59 个行族计数 | 本次实读 |

**表内世代声明（rev.3 加）**：标 `B 轮` 的行全部是**缓存前树**（`c5f6c6736` 之前）读数，本轮未重测同口径；缓存后同口径见 §1.6 的 A/B 表。`A 轮` 行同理（A/B 双轮均早于缓存）。

**四条硬结论**
- 只要「整块并林」形态存在，Σ=1,230.73 MiB = 门线的 1.60× ⇒ 768MiB 数学上不可达（VERIFY §八 结论①）。
- **并林是时间墙（缓存前口径），且同族墙不止一处**：`[实测]` 缓存前 B 轮 `src=2` 16+ 分钟零输出、`sample` 栈 identical、热点 `intern`/`CloneStr`；缓存后（`c5f6c6736`）森林窗降到 553,914 ms，但第三处 region 循环（`parser.cheng:11699-11710`）实测为本轮**残余主项**（§1.6）⇒ **「能否跑完」优先于「峰降多少」；且删并林只是「能跑完」的必要条件——当前全量止步于独立于 S1b 的 correctness 错**（§0.4(ii)）。
- 删并林后残留峰 = 保底 + 单源瞬态 + **pass0 活块累积**。`[估计]` ≈ `609.4 + 138.2 + 171.9 MB` ≈ **920 MB 量级** > 门线；即使按 pass0 末 `781,288,480 B` 起算，材料化相只剩 **24.0 MB** 余量 ⇒ **S1b 单独过不了门**。
- ⇒ **本刀的交付物 = 消 1.23GiB 活块 / 2,009.6 MiB phys 峰 + 移除并林调用点上的时间墙（「能跑完」的必要条件）；「能跑完」还取决于同族第三站点（§1.6）与独立于本刀的 correctness 死点（§0.4(ii)），过门是第二刀（S1b-M）的事。**

### 方案 A（推荐）：逐源惰性重解析——「声明索引相 + 物化相」两相流式

**形状**：删掉 `CompilerCsgBuildParserForestAuthorityInto`（`33034`）的并林半段与 `work.typeArenaParserForest`（`1471`）。

- **相 A（声明索引）**：逐源 parse → 抽 `(producerSourceIndex, nameToken 文本, kind, exported, globalRoot)` → 累计前缀和 → `ParserValueExprTreeRelease`。产物 S-b + S-c。**S1a 已实现**（`compiler_csg.cheng:33078-33081/33147-33157`、`typed_expr_type_arena.cheng:3123-3416`）。
- **相 B（物化）**：逐源 parse（**带相 A 记下的精确 reserve**，`parser.cheng:26651`）→ 用 S-b 做 `typedExprTypeAuthorityResolve*` → `AppendSourceInto`（按 `typeSyntaxBase` 偏移续写）→ R1 的 per-context 追加 → `ParserValueExprTreeRelease`。
- 收尾：`SealInto`。**真实边界（施工图 §2.2，取代 rev.1 的错误表述）**：Init = `typed_expr_type_arena.cheng:5776-5826`（arena/internPool/producerSourceCount + bucketHeads + `SeedSemanticScalarRows`）；AppendSource = `Fill*` 族（`:4669/:4693/:4799/:4906/:4932/:5016/:5032/:3419/:3472/:5094/:1479/:5132`）+ 循环内的 `:4494/:1321`；**Seal = `:5850-5941`，含 7 处必须读树的调用**（替换清单见施工图 §2.2）。

**改哪些文件/函数**（施工图 §1.1 的 16 组引用为本设计的施工面）

| 文件 | 动作 |
|---|---|
| `src/core/lang/typed_expr_type_arena.cheng` | `TypedExprTypeArenaBuildFromParserTreeInto`（**`:5763`**）拆 Init/AppendSource/Seal；`BuildPackageForestInto`（`:2921`）→ `…BuildSourceInto`（索引 + 单源树）；Seal 段 7 处树读按施工图 §2.2 替换 |
| `src/core/lang/typed_expr.cheng` | R1 侧 `:36935-36964` 抽 `AppendContextCallDeclarationsManual`；`:30959/:31003` 加 `producerFunctionBase`；Seal 复用 `TypedExprBuildIndexSealCallDeclarations`（`:31077`） |
| `src/core/tooling/compiler_csg.cheng` | 删并林半段 `:33076-33168`；删 `parserForestReleasePending`（`33027-33032`，已死码）与函数外壳 `:33034-33179`；删字段 `:1471` 与 abort/payload-move 两处（`:36002`/`:36033`）；R0 形参换 `expectedSourceCount`（`:33186/33339-33342/33354/33362-33365`，调用点 `:37150/37308`）；R1 实参 `:38868` 换逐源树；`Finalize`（`:35512-35567`）收缩/改名，调用点 `:38910` 随形 |

**每源峰值估算**：`单源 tree arena + parse 中 doubling 瞬态 + 该源消费输出`。最大源 134.09 MiB；相 A 瞬态 `[实测推算]` ≈1.34×arena；相 B 有精确 reserve ⇒ 瞬态 ≈0。
**预期总峰**：`[估计]` 相 A 峰 ≈ 保底 + 1.34×138.2 MB；相 B 峰 ≈ `609.4 MB + 138.2 MB + 输出增量` ⇒ **920 MB 量级，仍超 805 MB**。⇒ **本刀不承诺过门**（§0.5）。

**风险**：① Seal 段 7 处树读（施工图 §2.2）——**不可逆点**，替换漏一处即静默错或硬失败；② S-c 前缀和必须与 `ParserValueExprTreeAppendFromImpl`（`parser.cheng:10270-10291` 的 offset 集合）逐列一致，漏一列即 typeId 静默错配；③ `producerFunctionRow` 编码（I3）未证，B4 必测；④ **reuse 路径必须同期定形态**（`reuseLinkPlanExprLayer`，`compiler_csg.cheng:38544`）——施工图推荐「同一 AppendSource 驱动 + 整林按源行区间喂」，顺带删 `33055` 全林 clone（该路径内存反降 1.2GB）。
**不可逆点**：`typeArenaParserForest` 一旦删除，「回退到整林」的路径消失；且**并林分支必须一次性删干净**（留着就拿不到任何全量数据；rev.3 追加：删干净是「全量跑完」的必要条件，但不充分——见 §0.4(ii)/§1.6）。

### 方案 B（否决）：pass1 合并保留，改用文件/mmap 后备

**形状**：`ParserValueExprTreeAppendFrom`（`parser.cheng:10218`）的目标 arena 落临时文件，消费时 mmap 回来。

**为什么否决（不是"风险"，是"不成立"）**
- 消费者是**全量顺序遍历**：`typedExprTypeArenaFillTypeSyntax`（`typed_expr_type_arena.cheng:4693`）跑 `0..<tree.typeSyntaxCount`、`FillFunctions`（`:4799`）按声明行全遍历、`typedExprBuildSourceContextExactIndexWithManualAuthority`（`typed_expr.cheng:66383`）跑全部 contexts ⇒ 全页被 touch，常驻无异。
- 写入端 `ParserValueExprTreeAppendFromImpl` 本身要把**每个源树**逐节点读出再写目标（`parser.cheng:10304` `for nodeIndex in 0..<sourceTree.nodeCount`），写文件不减少它自己的峰值。
- **B 轮实测已独立证伪该路径**：并林窗口卡死在 `src=2`、peak 2,009.6 MiB，**与后备介质无关**。
⇒ 列入 §4.1 假绿（第 2 条）。

### 方案 C：typed-IR 与森林融合的单遍（最大改造）

**形状**：取消「先建全域再消费」的整段形态——R1/R2/typed facts 全部搬进 `frontierParsedSources` 那条 per-source 管线（`compiler_csg.cheng:31037`），`CompilerCsgTypeArenaFinalizeParserForestInto`（`:35512`）整段删除。

**每源峰值估算**：与 A 的相 B 相同。
**预期总峰**：A 的下界再减去相 A 的遍历 ⇒ `[估计]` **660 MiB 级**；但 `frontierParsedSources` 的累积（I2）会成为新天花板，必须同期加上界。
**风险**：① 相位重排 = 大范围语义搬迁，`reuseLinkPlanExprLayer`（`38544`）双路径都要覆盖；② `typedMetadataContexts` 的 seal（`38015`）语义从「round 0 一次」变成「逐源追加」，直接撞 VERIFY §九/§十 的 `context_sequence_shared` 族；③ 与在途 WIP（`src/core/lang/typed_expr.cheng` +35/−11）强冲突。
**建议**：作为 A 之后的第二代，不作为首刀。

---

## 3. 最小首刀（S1）

### S1 = 「R2 两相拆分 + 删并林半段」的原子切片

**为什么是它（rev.3 理由再收紧）**：它不只是唯一能确定性消掉 1,230.73 MiB 的改动，**更是「234 源能否跑完」的必要条件**——`[实测]`（缓存前的树）B 轮已证并林在 `src=2` 卡死，留着并林连全量数据都拿不到（施工图 §6.1 的步序重排理由）；但**不是充分条件**：同族站点尚有第三处未缓存（§1.6），且全量当前止步于独立于 S1b 的 correctness 错（§0.4(ii)）。

**范围（三态，取自施工图 §1.2，本设计不重复展开）**
- **S1-0（纯加，零行为变化）**：Seal 所需列 + 索引消费辅助 + 逐源对拍门 0f + R1 append/seal + 埋点（含 `live`）——`5~6h`。
- **S1-1（原子切换，第一个「234 源可跑完」可测态）**：删并林半段 + Init/AppendSource/Seal 重构 + 权威相索引化 + 逐源驱动 + R1 逐源 + Seal 接线——`12~16h`。**不可拆**：并林卡死 ⇒ 留着拿不到数据；R1（`38866`）与物化相都吃 `manualTree=森林`，一并林无人能喂。**rev.3 追加**：本态只是「可测」，其判词会被 correctness 死点截断（§0.4(ii)），须先按 TRIAGE 修判重 key 才能读到时间/内存面数据。
- **S1-2（纯删除，grep 可证）**：字段/死码/abort/断言/旧实参 + `grep -rn typeArenaParserForest src/` **真零命中**——`2~3h`。

**插桩（S1 自带）**：`forest_parse_begin/end` **含 `live`**（落 `33104` 旁）+ `append_begin/end` 计时（`:33162` 旁）+ `frontier_store cap_bytes`（`:38209` 旁）。**这三条无数据仍宣称达标 = 自证假绿。**

### before / after 判定口径（rev.2 改写，必须能证伪）

| 口径 | before（当前绑定） | after 合格线 | 证伪条件 |
|---|---|---|---|
| **B1 森林消失** | `forest_build_start mode=reparse` → `forest_build_done` 之间有 `forest_appended src=…` 序列（`33167`）；`[实测]` B 轮 `forest_appended_lines=2` | ① `grep -rn "typeArenaParserForest" src/ --include=*.cheng` **真零命中**；② trace 无 `forest_build_start/forest_appended/forest_parsed`，新增 `ta_stream_*` 且**每源 parse 后有释放** | 仍有任一 `forest_appended`，或仅改埋点名 ⇒ S1 未生效（假绿第 7/8 条） |
| **B2b 时间墙（本刀第一判据）** | `[实测]` 缓存**前** B 轮抬门 4GiB：pass1 `src=2` **16+ min 零输出 + 100% CPU**，`sample` 栈 identical = `ParserValueExprTreeAppendFromImpl ← CompilerCsgBuildParserForestAuthorityInto`，wall 1271s。**rev.3 现状（两处缓存已入库 `c5f6c6736`、并林未删）**：默认门 `rc=125 @176s` 死 pass0 第 62 源（并林未开始）；抬门 4GiB `rc=1 @583s`，append 40 后止步于 `authority invalid`（§1.6） | **234/234 源跑完**、无 >60s 零输出窗、wall 回到常规口径（~200s 级） | 出现任何 >6 min 零输出且 `sample` 栈落在 `langintern.Intern/FindInternId`/`strings.CloneStr` ⇒ **触发 S1b-N**（§4.2）。**rev.3 注：correctness 死点未修前本判据的 after 面不可判**——抬门跑会先死在 `authority invalid`，须先按 TRIAGE 修判重 key（独立于本刀） |
| **B2 峰值** | `[实测]` B 轮 `max_rss = 2,107,262,968 B`（2,009.6 MiB） | **phys/rss 峰 < `2,107,262,968 B`**，且**降到 pass0 量级**（B 轮 pass0 末 `781,288,480 B`）⇒ 降幅 ≈ 1.26 GiB | 峰仍 ≥ 1.5GiB 或仍见「pass1 预留后 OOM/卡死」⇒ 并林未被真正移除。**注意：本刀不承诺过 `805,306,368 B`**（§0.5），phys 降幅达标 ≠ 过门 |
| **B2c pass0 活块曲线** | `[实测]` Δlive=`1,618,833` 单调，pass0 末占门线 96.9% | 曲线**平台化**（Δlive 不再单调升）；pass0 末 rss 回到 `609,387,432 B` 量级 | **Δlive ≥ 1M 且 owner 不明 ⇒ 触发 S1b-M**（§4.2）；不得以「碎片/压力」结案 |
| **B3 单源瞬态** | `[实测推算]` pass A `src=61`：入口 651,068,400 → 守卫 836,388,064，Δ=185,319,664 B ≈1.34×arena | pass B ≤ 单源 arena + 64 KiB（精确 reserve 生效）；**pass A 如实上报** | pass B 仍见 ≈1.5×arena ⇒ 前缀和没用于 reserve |
| **B4 语义等价（硬门）** | S1a 基线（VERIFY §十九）：四夹具 `d3cca8c1/4f9af51f/0b89d8dd/6eca55c6`、2 源对 `793afdce…`/`d285f4be…`、多源对 `9779b97d` | S1a 驱动 vs S1 驱动产物 sha256 **全等** + `decl_index verified=1` + 逐源对拍门（0f）全绿；产物名一致（exe 内嵌自身路径） | 任一不等 ⇒ 语义不等价，**直接否决，不接受「差一点」** |
| **B5 TypeArena 对拍 + 口径** | **锚点已移且两轮实测 0 命中**：`[实测]` A/B 双轮 `type_arena_lines=0`；**现址 `compiler_csg.cheng:38912`（guard）/`:38914`（emit）**，在 `:38921` arena bind **之前**（`43e12c322` 位移 9 行入库；rev.1 引的 `:38877` 是位移前的死码址） | ① 改在 `:38912` 前发射或读 `work.typedIr.exactArena`，`types/tokens/used` 与 S1a 驱动相等；② 首次拿到 TypeArena 本体字节；③ **口径：该 `used` 与 1,230.73 MiB 不得相加**（两个独立 arena，`typed_expr_type_arena.cheng:5777-5778`；共驻点只在 `compiler_csg.cheng:35545` 并林窗，该窗本刀已删） | 不等 ⇒ 索引相或 AppendSource 丢字段。**注：`pa_s1b_edit_plan` §6.5-2 写「现 `:38924`」，与当前 HEAD 实读 `:38914` 差 10 行（见附录 C）** |
| **B6 索引相独立性** | S1a 已过（VERIFY §十九：B1/B3 对拍通过、`decl_index verified=1`） | 本刀只做**回归复验**（同门跑一次 + 0f 逐源门） | 复验不等 ⇒ 本刀破坏了索引相 |
| **I1/I2 插桩** | — | B1/B2 两跑内必须出数 | 无数据仍宣称达标 = 自证假绿 |

**证伪路径（rev.2 改写，取代 rev.1 的「phys 降幅 < 1,230.7 MiB×80%」）**
- **第一层（时间）**：若 S1-1 落地后抬门跑仍出现 >6min 零输出 + `sample` 栈同族 ⇒ 「删并林即解决时间墙」**被证伪**，并**同时触发 S1b-N**（消同族站点的冗余整段 clone+intern）；此时时间轴与内存轴解耦，S1b-M 不得抢先启动。**rev.3 前置**：该层只有在 `authority invalid`（TRIAGE，独立于本刀）修掉后才读得到——否则抬门跑先死在 correctness，时间面数据取不到。
- **第二层（内存）**：若 B2b 通过但 B2 的 phys 峰 **未降**（或降幅 < 1,230.73 MiB 的 80%）⇒ 「合并森林是 2,009.6 MiB 峰的主项」**被证伪**，必须回到 I2（frontier store 累积）与 S1b-M（pass0 活块）重新定向。
- **第三层（口径）**：rev.1 的「离门线还差多少」已作废——**本刀不以 `805,306,368 B` 为达标线**；达标线是 B2b（跑完）+ B2（峰降）+ B2c（曲线平台化）三者，过门由 S1b-M 单列。

**烤机成本**：每轮 = C 链烤机 166~200s + 自烤/夹具 ≈200s ⇒ **≈7 分钟 wall/轮**；抬门跑在并林未删时是 **1271s**（`[实测]` B 轮，缓存前树）；`[实测]` rev.3 现状（两处缓存已入库、并林未删）抬门跑 **583s**，删并林后 `[估计]` 应回到常规量级。S1-0/S1-1/S1-2 各至少 1 轮，B2b+B2c+B2+B4 再加 2~3 轮 ⇒ **6~8 轮 ≈50~60 分钟纯 wall**，不含判词定位。**`--out` 必须落仓库内或 `$HOME`，不得落 `/private/tmp`**（VERIFY §三）。**独占槽是硬前提**：`mkdir .rebuild/COMPILE_SLOT.lock` 原子 test-and-set，`lease_hits=0` 是任何数据入账的前置条件（并发污染轮同点守卫读数 919,094,424 B vs 干净 836,388,064 B）。

---

## 4. 假绿清单与风险占位

### 4.1 假绿清单（11 条；1~9 条 rev.1，第 10 条 rev.2 新增，第 11 条 rev.3 新增）

1. **调低守卫值**：改 `CHENG_PROCESS_MAX_RSS_BYTES` 或 `--rss-limit` 让 rc 变 0。门线是验收口径不是旋钮；VERIFY §一/§六 已用双抬门证明真实需求 >1.5GiB。判据必须**双门同跑**且 phys 降幅入账。
2. **arena 改不落页映射但不改消费**：换 mmap/`MAP_NORESERVE`/文件后备，消费者照旧全遍历（`typed_expr_type_arena.cheng:4693/:4799`、`typed_expr.cheng:66383`）⇒ 页照样 touch 回常驻。**B 轮实测已独立证伪该路径**（卡死与后备介质无关）。
3. **靠 malloc 压力释放掩盖活块**：加大 `ProcessMemoryPressureRelief()`（`compiler_csg.cheng:33089/33160/33165`）频次来「降 RSS」——归还的是死页/churn，活块不动。**B 轮把这条钉死**：pass0 的 live 从 1,470,764 单调升到 3,089,597，Δlive=1,618,833 是**真活块**，relief 完全压不住。并林半段删除后 `:33089`/`:33165` 的 relief 随之消失；`:33160`（pass0 每源）与材料化循环内的每源 relief **只算常规归还，不得作为达标证据**。
4. **把 `totalArenaBytes` 预留改小/改成分段 reserve**（`33091-33092`）：arena 会走 doubling 重新长回来，峰值形态不变，只是把 OOM/卡死点挪到 append 中段。**本刀要求该变量与其一次性预留整体删除**（`:33076-33168`），不是改小。
5. **pass0 跳过或降采样**（只量前 N 个源、按平均外推）：`forestSourceArenaBytes` 不准 ⇒ pass1 预留失效，且大源必然击穿。预留值仍须来自 pass A 的**逐源逐值实测** `ArenaUsed`（`33136-33137`）。
6. **用源字节长度×系数估 arena**（不做实测标定的常数）：同 5，属启发式，禁止。
7. **只改埋点让 pass1 的 trace 不再出现**：B1 若被埋点改名满足 = 自证。B1 要求 `grep` 真零命中 **且**代码路径删除。
8. **把 `work.typeArenaParserForest` 改名/换字段藏起来**而不是删消费：同 7，零命中是硬门（当前实读 24 处，全在 `compiler_csg.cheng`）。
9. **只做 R1、不做 R2**：R2 是唯一需要整林在场的消费者，只拆 R1 峰值一点不降（B2 会证伪）。
10. **（rev.2 新增）只删并林就宣称过 768MiB**：`[实测]` pass0 末已占门线 **96.9%**（781,288,480 / 805,306,368），删并林只买到「全量的必要条件」，**不买到门线**。由 B2c 与 S1b-M 挡住。
11. **（rev.3 新增）只删并林就宣称「全量跑完」**：`[实测]` 抬门 4GiB 下全量 234 源 `rc=1 @583s`，止步于 `authority invalid … producer=40`（correctness，**独立于 S1b**，TRIAGE 定性 pre-existing）⇒ 删并林后仍跑不完，不得把 correctness 死点记到内存/时间轴上（§0.4(ii)/§1.6）。

### 4.2 风险占位（rev.2 新增，**内容不预编，只写触发条件与判据**）

| 占位 | 轴 | 触发条件 | 判据 | 状态 |
|---|---|---|---|---|
| **S1b-M** | 内存（pass0 活块累积） | S1-1 落地后，任一轮 768MiB 门在材料化相之前/之中死亡，且 `forest_parse_*` 的 `live` 曲线复现单调累积（**Δlive ≥ 1M**） | 该曲线 owner 必须是**单一可命名结构**（不得以「内存压力/碎片」结案）；修后 pass0 末 rss 必须回到 `609,387,432 B + Δ`（Δ 为可解释的小量），且 B4 语义等价不破 | 占位；等 0e 的 `live` 逐源曲线。**红线**：不得用 relief 频次、降采样、或「释放不属于本刀的结构」冒充 |
| **S1b-N** | 时间（**append 同族站点的冗余整段 clone+intern**；rev.3 口径，取代 rev.2 的「intern/CloneStr 二次代价」） | ① `.rebuild/run_b5/single/` 单源/10 源闭包（含 `cleanup_cfg.cheng`）在 6min 时间盒内未跑完；② S1-1 落地后全量 234 源在 `ta_stream` 相（**已无并林**）仍 >6min 零输出 + 100% CPU 且 `sample` 栈热点仍在 `langintern.Intern/FindInternId` 或 `strings.CloneStr`（B2b 判词）；③ 全量跑完但材料化相 wall 比并林前同相高一个量级 | 全量 234 源在 1GiB 门内 wall ≤ ~200s 级且无 >60s 零输出窗；B4 硬门不破；**不得**以减少 intern 调用次数但改变 intern 顺序/identity 的方式换时间（`typed_expr.cheng:36946`、`parser.cheng:10304` 的精确身份链条不得松动） | **部分已做（rev.3）**：token 循环（`parser.cheng:10552-10569`）与 typeSyntax 循环（`10977-10995`）已补 per-source 缓存（`c5f6c6736`，字节等价已过）；**残余主项 = region 循环 `11699-11710` 未缓存**——`[实测]` 它正是 553.9s 森林窗的主要残余（§1.6）。触发条件②③仍开；**且当前全量被 correctness 死点挡住，时间面判据须待 TRIAGE 修复后才可读**。与 S1-1/1-2 **互不阻塞** |

### 4.3 红线（不得降级）

1. 不得保留任何「整林同时在场」的新形态（含 mmap/文件后备/分段 reserve）；
2. 不得用 relief 频次、埋点改名、守卫调参换判词；
3. 不得对 Seal 做「再 parse 一遍全林」的偷跑（那就是把森林换个名字搬回来）；
4. B4 不等价即否决，不许「先落地后修」；
5. 不得把 pass0 的 1.62M 活块累积用「内存压力/碎片」结案。

---

## 5. 估工（单线串行 agent 小时，rev.2 对齐施工图）

| 步骤 | 内容 | 估工 | 验证成本 |
|---|---|---|---|
| S1-0 | 预埋：Seal 列 + 索引辅助 + 逐源对拍门(0f) + R1 append/seal + 埋点（含 `live` / `append_begin-end` / `frontier_store`） | 5~6h | 1 轮（行为不变，回绿） |
| S1-1 | **原子切换**：删并林半段 + Init/AppendSource/Seal 重构 + 权威相索引化 + 逐源驱动 + R1 逐源 + Seal 接线（含 reuse 分支同期改「整林按源行区间喂」） | 12~16h | 1 轮 |
| S1-2 | 删林（字段/死码/abort/断言/旧实参 + `grep` 零命中） | 2~3h | 1 轮 |
| 验收 | B1/B2/B2b/B2c/B3/B4/B5/B6 + I1/I2 插桩 | 7~9h | 6~8 轮 ≈50~60min wall |
| **核心小计** | | **26~34h** | |
| 缓冲 | I3 残留 / reuse 属性 / 在途 WIP 冲突（`typed_expr.cheng` +35/−11 与本刀强重叠 ⇒ 开工前必须先落或冻结） | +8~12h | |
| **合计（不含 S1b-N/M）** | | **34~46h** | |
| S1b-M | 消 pass0 活块累积（1.62M 活块 / +172 MB） | **未定** | 触发见 §4.2 |
| S1b-N | 消同族站点的冗余整段 clone+intern（三站点：两处已入库、第三处未补） | **未定** | 触发见 §4.2；现状见 §1.6 |

**与 rev.1 的差异如实声明**：rev.1 估 19.5h + 缓冲 = 28~36h，**偏低**。两项漏计：① **施工图 §2.2 的 Seal 段 7 处树读替换**（rev.1 只写「拆 Init/AppendSource/Seal」，未计 Seal 里必须先把树事实搬进 arena 列的工作）；② 并林的时间墙属性带来的步序重排（rev.1 的「整林驱动桥接态」拿不到任何全量数据，被迫压成原子步 S1-1，风险集中度上升）。

**里程碑判词**：S1-0 结束 ⇒ B6 回归（索引相未被破坏）；S1-1 结束 ⇒ **B2b 时间墙 + B2c live 曲线**（本刀第一判据，决定 S1b-N/S1b-M 谁先启动；**rev.3 注：须先修掉 TRIAGE 的 `authority invalid` 才读得到这两条**）；S1-2 结束 ⇒ B1（森林真消失）；验收 ⇒ B4 硬门。

**前置状态（rev.2 更正）**：VERIFY §九/§十 的 `context_sequence_shared` 回归**已由 `f92f573f2`（HEAD seal 回归修复 v4 + 跨源类型声明索引相 S1a）关闭**，四夹具 sha256 基线已建立（VERIFY §十九）⇒ **B4 的 before 基线现在可得**。rev.1 关于「B4 before 不可得、E5 依赖 `patches/head_seal_regression_fix.patch`」的表述**作废**：该补丁文件在本仓 `patches/` 下**不存在**；S1a 的回退基准是 commit **`f92f573f2`**。

---

## 附录 A：本设计锚点（全部按 HEAD `9c368085c` 重锚；`parser.cheng` 行号已随 `c5f6c6736` 位移）

```
compiler_csg.cheng
  1471  typeArenaParserForest 字段（24 处引用全在本文件，零外部命中）
  33027-33032 parserForestReleasePending（已死码，全仓零调用）
  33034 CompilerCsgBuildParserForestAuthorityInto（定义）
  33055 reuse 分支全林 clone
  33076-33168 并林半段（33076-33081 计量+前缀和游标；33091-33092 一次预留；33104-33106 forest trace；
              33115-33119 pass1 精确 reserve；33134/33158 pass0 释放；33139 forest_parsed；33147-33157 前缀和累加；
              33163/33167 pass1 append+释放+forest_appended）※ 施工图 §1.1-3 要求整体删除
  33186 R0 形参；33339-33342 形状校验；33354/33362-33365 R0 exact
  35512-35567 Finalize（35521-35525 森林形状；35528-35535 import 权威；35537-35544 权威相；35545-35552 物化相；
              35553 释放森林；35554-35565 receipt 校验）※ 35545 = TypeArena 与森林的共驻点
  36002 abort 路径释放；36033 payload-move 断言
  36670 metadataContexts 构建（森林窗之前）
  37146/37150 R0 reuse 调用点；37308 R0 exact 调用点
  37690 Prepare；37774-37780 每轮 exprLayer 重建（读 frontierParsedSources）
  37953 Commit；37989 round0 build；38015 round0 seal；38072 round>0 append
  38209 typed_ir_done；38223 可达扩张；38277 Round；38290 Reach；38299 ConsumeWithOverridesCore
  38544 reuseLinkPlanExprLayer
  38644/38764/38825/38899/38930/38964/39003 相位埋点
  38835 并林写入调用；38848-38861 S1a 硬门（索引构建点 38834/38843）；38866-38868 R1；38881 profile-sources；38910 R2；39069 轮循环入口
  38912/38914 type_arena 埋点（43e12c322 后新址）；38917 typed_ir 埋点；38921 arena bind
  39106 frontier_parse_cache 统计；39107-39108 frontier store 整批释放
  frontier store: 30719-30774 Ensure（30743-30774 命中返回）· 30825 move 进 fullSourceLayers · 30912 CapacityBytes
typed_expr_type_arena.cheng
  73-78 authority 结构 · 90-115 S1a 索引结构 · 253-265 buildState
  2469-2490 Less · 2492 KeyEqual · 2574 FindDeclaration · 2711 ExportedInto · 2742 FindGenericSymbol
  2791-2842 ResolveUnqualified · 2844-2919 ResolveQualified · 2921-3110 BuildPackageForestInto
  3123-3416 S1a 索引构建/对拍（3240-3247 行序；3309-3416 VerifyAgainstForest）
  3419-3469 IndexFields · 3472-3550 BuildSyntaxOwnership · 3553-3573 DependencyIndirect
  4693-4797 FillTypeSyntax · 4799-4904 FillFunctions · 4906-4930 FillBracketArgs
  5763-5941 BuildFromParserTreeInto（5776-5779 Init/arena/internPool；5811-5822 bucket；5826 SeedSemanticScalarRows；
              5850 Seal 起点；5934-5935 complete/hash；5936 validate）※ Seal 段 7 处树读清单见施工图 §2.2
  6556 StrictValidateInto
typed_expr.cheng（本文件行号未位移）
  2090 BuildStructuredTypeArenaFromParserTreeInto（wrapper）
  30830 AddScopeCallDeclaration · 30873 TreeFunctionRowExact（producerSourceIndex 过滤，过滤点 30888）
  30959 AddManualScopeCallDeclarationsRec · 31003 AddContextCallDeclarationsWithManualAuthority · 31077 SealCallDeclarations
  36935-36964 FinishCallDeclarationsManualRec（36942 Seal；36946 ctxIndex 即 producerSourceIndex）
  36997 BuildIndexForContextsWithManualAuthority · 37021-37080 ManualConsumeParameterTypeId · 37327 typed 侧自建 index
  66337/66383 coreExactIndex · 66533 R1 入口
parser.cheng（**rev.3 已重锚**：`c5f6c6736` +43/−8 ⇒ >10546 行号 +35、10570~10971 段 +18；工作树另有他线 WIP，一律不以工作树为准）
  562 Tree 结构（198×ArenaArrayInt32 列 + 59 行族）· 10218 AppendFrom · 10222 AppendFromImpl · 10270-10291 offset 集合
  10303-10330 node 循环（既有 per-source 缓存，同族参照）· 10304 逐节点重映射
  10546-10569 token 循环（**已补缓存** `c5f6c6736`；改前行号 10546-10551）· 10722 typeSyntaxOffset
  10977-10995 typeSyntax 循环（**已补缓存**；改前行号 10954-10960）· 11319-11320 functionOffset + functionRow · 11387 functionCount 累加
  **11699-11710 region 循环（三站点中唯一未缓存 = rev.3 残余主项）** · 14037 ParserValueExprSourceText
  26639-26652 精确容量提示（268MB+134MB 自述；reserve 点 26651）· 26810 ReadTreeFromTextReserved
docs/campaigns/2026-08-31-kernel-userpath/
  verify_append/VERIFY_fullgo_0910_append.md（§一~§十 + §二十一 A/B 双轮 + §二十二 remap 缓存实验）
  design/authority_invalid_triage.md（correctness 死点定性：判重 key 缺 producer/源维度、pre-existing）
  design/pa_s1b_edit_plan.md（rev.2 施工图，本设计的施工面权威；rev.3 由平行线在改）
```

## 附录 B：rev.2 新证据锚点（原始件 `.rebuild/run_b5/`）

```
A 轮（默认门，干净槽位 lease_hits=0）：rc=125 @176s；forest_parsed src=60 arena=246432 rss=651346928 live=1770670；
  forest src=61 bytes=4490367 rss=651068400 live=1770656；守卫 rss_bytes=836388064 > limit_bytes=805306368；
  trace 采样峰 716,883,000 B（forest_parsed src=47）；pass0 前 61 源 Σ=255,983,072 B；type_arena_lines=0
B 轮（抬门 4GiB，CHENG_PARENT_RSS_GUARD=1）：rc=143（22:41:43 SIGTERM）wall=1271s；pass0 234/234 Σ=1,290,508,960 B；
  forest_parsed src=233 arena=117280 rss=781288480 live=3089597；src=0 起点 live=1470764；
  after_profile_source_payload_release rss=609387432；pass1 src=0 rss=2072512456 → appended src=1 rss=2107262968 →
  forest src=2 bytes=817253 后 16+min 零输出；两次 sample identical，59% Intern/FindInternId + 41% CloneStr→cheng_malloc；
  peak max_rss=2,107,262,968 B；type_arena_lines=0 / typed_ir_done_lines=0 / facts_lines=0 / forest_appended_lines=2
  src=2 = core/analysis/cleanup_cfg.cheng（817,253 B / 16,458 行 / 811 声明）
  驱动 .rebuild/run_b5/kd，kd_sha256=b2228aa29cb0d198d1d3d6b6a711e8873e65e20278c468940a63c2a7779b46f0（bake rc=0/197s）
```

## 附录 C：rev.2 回改落点（对施工图 `pa_s1b_edit_plan` rev.2 §6.5 六条的逐条对应）

| §6.5 | 本设计落点 |
|---|---|
| 1 `5440→5763`、Seal 边界 | §0-P5、§2.0 方案 A 收尾段 + 改文件表、§1.3-P5、附录 A |
| 2 B5 埋点死码 → 重挂 | §3 的 B5 行（含 38912/38914 与「不得相加」口径）、§2.0 表 TypeArena 本体行、附录 A |
| 3 `patches/s1a_step1.patch` 不存在 / S1a 基准 `f92f573f2` | §5 前置状态段（本设计正文该处 rev.1 引的是 `patches/head_seal_regression_fix.patch`，同样不存在，一并更正） |
| 4 §2.0 算术补两项 | §2.0 表：**pass0 活块累积**行 + **TypeArena 本体**行 |
| 5 `ConsumeWithOverridesCore` `38271→38299` | §1.1 首句、附录 A |
| 6 证伪路径改写 | §3「证伪路径」三层 + B2/B2b 两行 + §0.4(ii) |

**rev.3 增量与出处对应**（不改上表六条）：§0.4(ii) 前提改判 ← VERIFY §21.9/§22.7/§22.8 + TRIAGE ①；§1.6 新增 ← VERIFY §21.9④/§22.1/§22.3/§22.4/§22.7/§22.8/§22.9 + `c5f6c6736`；§4.1 第 11 条、§4.2 与 §5 的 S1b-N 口径 ← 与施工图 rev.3 对齐（「消同族站点的冗余整段 clone+intern」）。

## 附录 D：rev.3 新证据锚点（原始件 `.rebuild/remap_exp/`；数字全部取自 VERIFY §二十二）

```
c5f6c6736  perf(parser): 森林 append 同族站点补两处 per-source remap 缓存（+43/−8，唯一文件 src/core/lang/parser.cheng）
  HEAD:src/core/lang/parser.cheng sha256 = 2902d2e18b45605c3e1096a3cdbe52634c3a095f942411d22ee7eb94ecbb9198
    （== 缓存后实测所用驱动树，字节同一）
  patch1 .rebuild/remap_exp/parse_remap.patch  sha256 357d31f8f01d04b39c1aaf8387d3db0e94c462e7e06d5c692553d217d62d5f65（22 4）
  patch2 .rebuild/remap_exp/parse_remap2.patch sha256 c1dc89c610c8dd80b54e8859be77cee3145dc0fe17ebfd062c4c66802c854c02
  驱动：kd_pristine 68dad79a…（bake rc=0/194s）· kd_remap 600d2d3c…（194s）· kd_remap2 e604caef…（194s）· 全量用 kd_remap2
  字节等价（同 --in/同 --out 的 A/B cmp）：ordinary exe/primary.o = IDENTICAL；call_fixture exe/primary.o = IDENTICAL；v6 两侧 rc=2 无产物
  29 源 smoke（typed_expr_type_arena_smoke，默认门，盒 1200s）：缓存前 rc=143 wall=1213s 卡 src=2 → patch1 rc=1 wall=793s → patch1+2 rc=1 wall=577s
    森林窗 after_profile_lookup since_ms 774,266 → 553,914（−28.5%）；最长零输出窗 1173 → 598 → 397s；src=2 首见 el 633 → 437s
  全量 234 源（kd_remap2，BACKEND_JOBS=2，CHENG_CSG_MEM_TRACE=1）：
    默认门 rc=125 @176s / guard_hits=1 / forest_parsed=61 / forest_appended=0 / max_rss=700,630,072 B
      守卫原文 rss_bytes=836453576 limit_bytes=805306368；末行 csg_mem tag=forest src=61 bytes=4490588 rss=634831856 live=1770838
    抬门 4GiB（diagnostic）rc=1 @583s / guard_hits=0 / forest_parsed=234 / forest_appended=40 / max_rss=2,146,535,464 B（2.00 GiB）
      pass0 el≤281s；并林 0→39 约 297s；最长零输出窗 90s（el=397→487）
      死点：authority invalid row=91185 kind=5 arm=0 auth_kind=7 auth_row=7838 expected_auth=0 owner=91184 span=26254:26272 source_local=1085 producer=40
  §22.9 第三站点 sample（全量 raised el≈400s）：PC 偏移 +90536/+90504 → ArenaArrayInt32Get（src/core/runtime/arena.cheng:400，模块名 arenamod）
    → ParserValueExprSourceText（parser.cheng:14037；VERIFY 记的 :14020 是 patch1 树行号）→ CloneStr（src/std/strings.cheng:468）→ Intern（src/core/lang/intern.cheng:728）
  探针 v2 直方图（VERIFY §21.9②）：worst=51 恒定；20min 内 steps 最大 263,489 < 524,288、lookups 最大 131,072 < 262,144、cloneCalls 最大 42,340
```
