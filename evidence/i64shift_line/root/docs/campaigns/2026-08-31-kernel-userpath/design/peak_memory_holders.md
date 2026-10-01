# peak_memory_holders — `after_profile_source_payload_release` → pass=1 首源之间 +161 MB 的持有者归因

**取证件**：`.rebuild/s1b_step3/gate/r11b.stderr.txt`（同窗口对照 `.rebuild/s1b_step3/gate/r9z.stderr.txt`、`r9g.stderr.txt`）。
**本轮纪律**：只读码 + 既有 trace，未跑任何编译/驱动，未改工作树。
**口径**：以下所有 RSS 均取自**同一窗口**（r11b）；跨窗口绝对读数不可比（§4 用实测证明）。`live` = `system.MemLiveAllocations()`（`compiler_csg.cheng:1622`），跨窗口可比。

---

## 1. 结论（先行）

1. **这 +161 MB 里没有任何一个"容器"持有者。** 本窗口唯一新增的持久容器合计 < 0.3 MB（§3 A2–A4）。+161 MB 由两段构成，两段的性质完全不同：
   - **A 段（pass0 逐源 parse 残留）：`live` 上净增 +1,773,943 个块（r16），RSS 上 +86,687,840（r16）/ +109,133,920（r14）。** 机制已由 r16 定死：逐源 `ParserValueExprTreeRelease`（`compiler_csg.cheng:33264`）**恒定只回收 9 个块**，而 parse 新增 N 个块（N ∝ 源大小），N−9 既不释放也不属于 arena（`live` 是块数、arena 只占 1 块）。另有一个独立机制：`split_*`（`src/std/times.cheng` 那一步）造 ~41,875 个字串块、`live` 会回退但 RSS 不还（libc small 块），是一次性高水位。**N 个块的身份仍未点名**，判死读数见 §6 E1b。
   - **B 段 +66,060,360 B（41.0%）＝ 进 pass=1 之前一次性物化的两块结构，E2 已实测判定"两块都在"**（r14：TypeArena 全林预留 **+39,174,216** ＋ 全 234 源 `TypedExprBuildIndex` 冻结投影 **+27,770,904**，`typed_expr.cheng:66772`）。B 段 `live` 净增 **+313,629**。
2. **你怀疑的三项，两项证伪、一项证实：**
   - 逐源 census 数组**证伪**：`234 × ParserValueExprTreeArenaColumnCount(201) × 4 B = 188,136 B`（`compiler_csg.cheng:1487`，`parser.cheng:27462`）。不是 66 MB 的来源。
   - `ta_stream` 86 MB 与 tree arena **重复持有 —— 证伪**：`forest_appended` 与 `ta_stream` 打的是**同一个** `ArenaUsed(arenaValue.arena)`（`compiler_csg.cheng:35857-35861`）；pass=1 的逐源 tree 在 `:35841` 已释放。但语义要纠正：86 MB 不是"2 个源的活跃数据"，而是**全林 62 列按 limits 一次性预留后的 committed 量**。
   - forest arena 的 doubling 死区 **证实，但只在 pass0**：pass1 逐源 tree 用 census 精确预留列长（`compiler_csg.cheng:35740-35755`）⇒ 无 doubling；TypeArena 用 pin+reserve ⇒ 无 doubling；**pass0 没有 census**（`:33145-33149` 明写是鸡蛋问题）⇒ pass0 逐源 tree 仍走 `arena.cheng:373-397` 的 doubling 弃块路径，**死区可达活数据的 1 倍**。
3. **本窗口之外但同属"名字含 release 却上涨"的那一段（`after_reachable_function_set` → `after_profile_source_payload_release`，r11b +156,958,816 B）已定位**：其中 **+150,995,040 B / +536,933 个分配**发生在 `metadata_contexts_built` 一步，持有者 = `work.typedMetadataContexts`（234 个 `texpr.TypedExprSourceContext`，由 `compilerCsgBuildMetadataContextsRec` 在 `compiler_csg.cheng:37181` 逐个 `AppendMove`）。`deterministic_model_derivation.md:732` 记的"未定位"项即此。
4. **最大一块可回收内存 = 95,109,240 B（A 段 pass0 残留）**，依据是同窗口两锚 RSS 差 + `live` 增量 1,773,279，且该量在三个窗口独立复现（§4）。**前提**：需一次探针确认这批对象确为"已释放树的残留"而非被某个我尚未找到的引用持有（§6 T1）。确认前不得按 95 MB 记账。
5. **两项实验状态**：E2 已落地并判读完毕（r14，两块并列）；E1 第一段作废（`parser_mem` 无 release stage），第二段补丁已交付未落地（§6）。当前最大一块可回收（A 段）的判死读数就靠它。

---

## 2. 窗口锚点（r11b，逐字取自取证件）

| 行 | 锚点（发出点 文件:行号） | RSS | live |
|---|---|---|---|
| 20 | `after_reachable_function_set`（`compiler_csg.cheng:39196`） | 447,480,696 | 959,451 |
| 21 | `metadata_contexts_built`（`compiler_csg.cheng:39226`） | 598,475,736 | 1,496,384 |
| 22 | `after_profile_source_payload_release`（`compiler_csg.cheng:39257`） | **604,439,512** | 1,505,393 |
| 961 | `forest_build_done`（`compiler_csg.cheng:39280`） | **699,548,752** | 3,278,672 |
| 962 | `decl_index entries=1315 sources=234…`（`compiler_csg.cheng:39283`） | 699,548,752 | 3,278,672 |
| 963 | `ta_limits`（pass1 侧，`compiler_csg.cheng:35665`） | 699,548,752 | 3,278,723 |
| 964 | `forest src=0 bytes=6917`（`compiler_csg.cheng:35724`） | **765,609,112** | 3,592,301 |
| 967 | `ta_stream src=0 arena=86,108,308`（`compiler_csg.cheng:35861`） | 773,129,392 | 3,593,838 |
| 971 | `ta_stream src=1 arena=86,112,916` | 791,004,336 | 3,596,299 |
| 973 | `forest_parse_begin pass=1 src=2 reserve=33,687,488` | 794,576,048 | 3,596,333 |
| 974 | `resource_guard rss_limit_exceeded` | 807,634,120 | 门 805,306,368 |

**分解**（全部同窗口相减）：

```
窗口   after_profile_source_payload_release → forest src=0(pass1)   = +161,169,600
 A 段  after_profile_source_payload_release → forest_build_done     = + 95,109,240   live +1,773,279
 B 段  forest_build_done                    → forest src=0(pass1)   = + 66,060,360   live +  313,629
```

---

## 3. 逐块内存表

### A 段：pass0 测量相（`CompilerCsgBuildParserForestAuthorityInto`，`compiler_csg.cheng:33080-33278`）

| # | 块 | 大小 | 持有者（文件:行号） | 生命周期 | 可提前释放 | 正确释放时机 |
|---|---|---|---|---|---|---|
| A1 | 234 次 parse/release 的残留 | **95,109,240 B**（同窗 RSS 差）；**1,773,279 个分配**，53.6 B/个 | **无持有者**。唯一候选生产者 `ParserValueExprReadTreeFromTextReserved`（`:33187`），引用释放点 `ParserValueExprTreeRelease`（`:33239`） | 起点：`forest_parse_begin pass=0`（`:33180`）；终点：**未观察到**（`forest_build_done` 时仍在 `live` 内） | 是（若能确认） | 应在 `ParserValueExprTreeRelease`（`:33239`）完成时归还；现状未归还 |
| A2 | `typeDeclarationIndex`（`typed_expr_type_arena.cheng:102-155`） | **< 0.1 MB**：1315 行 × 7 个 int32 列 + 1 个 bool 列 + `declarationNameTexts`(str, 16 B)；另 10 个逐源列 × 234 × 4 B = 9,360 B | `work` 局部量，由 `:33223` 追加、`:33244` seal | `:33223` → pass1 消费完 | 否（pass1 全程需要） | pass1 seal 之后 |
| A3 | `work.typeArenaForestSourceArenaBytes`（`compiler_csg.cheng:1480`） | **936 B**（234×int32） | `:33199` `add` | `:33199` → pass1 逐源 reserve 用完 | 否 | pass1 循环结束 |
| A4 | `work.typeArenaForestSourceColumnCensus`（`compiler_csg.cheng:1487`） | **188,136 B**（234×201×int32；`parser.cheng:27462`） | `:33204` `ParserValueExprTreeArenaColumnCensusInto` | `:33204` → pass1 逐源切片用完（`:35740-35755`） | 否 | pass1 循环结束 |
| A5 | pass0 逐源瞬时 tree（**非持久**） | 峰值 **140,603,200 B** @src=134（trace 行 562），同点 RSS 759,104,616；全场 parse arena 合计 1,296,081,632 B | `sourceTree`（`:33169`），`:33239` 释放 | 单源 | —（瞬时） | 已释放；缩它要治 `arena.cheng:373-397` 的 doubling 弃块 |

**A2–A4 合计 < 0.3 MB，而 RSS +95.1 MB ⇒ A 段没有容器持有者。** 这是"名字含 release 却上涨"的直接机制：这一段根本不产生持久容器，涨的全是 A1。

### B 段：进 pass=1 首源之前（`CompilerCsgStreamTypeArenaFromDeclarationIndexInto`，`compiler_csg.cheng:35622-35870`）

本段 RSS 变化只可能落在 **4 条语句**之间：`:35666`（StreamingBegin，空对象）、`:35672-35679`（TypeArena 物化预留）、`:35690-35695`（context 精确索引 = `TypedExprBuildIndex`）、`:35709-35724`（循环前导 + src0 快照/重写）。

| # | 块 | 大小（同窗可由 trace 复算/实测） | 持有者（文件:行号） | 生命周期 | 可提前释放 | 正确释放时机 |
|---|---|---|---|---|---|---|
| B1 | TypeArena 物化预留（pin + 84 列定长预留） | **pinned capacity = 94,764,948 B**（由 r11b 自己的 `ta_limits` 复算，见下）；**`ArenaUsed` = 86,103,828 B，在 src=0 就已成立**（trace `ta_stream src=0 arena=86,108,308`，Δ=4,480 B） | `arenaValue.arena`（`:35667`），分配于 `typed_expr_type_arena.cheng:8247-8328`，pin 于 `:8281` `ArenaReserveCapacity` | `:35672` → seal | 否（pass1 全林列都写它） | seal 之后 `typearena.TypedExprTypeArenaRelease` |
| B2 | `TypedExprBuildIndex`（`contexts[0].buildIndex`，含 `canonicalProjection`） | 本段 `live` **+313,629**；类型见 `typed_expr.cheng:456-496`（≈30 个 `InternId[]` 列 + `int32[]` 链列 + 冻结投影） | `work.typedMetadataContexts[0].buildIndex`；建于 `typed_expr.cheng:66772-66777`（经 `compiler_csg.cheng:35690`），`SetOwnedBuildIndex` 于 `typed_expr.cheng:66834` | `:35690` → pass1 逐源 `AppendSourceCallDeclarationsManual`（`:35831`）持续增长 | 否 | 随 `work.typedMetadataContexts` 一起清（`compiler_csg.cheng:36449-36450` `TypedExprClearSourceContextAllFields`） |
| B3 | `sortedEntryRows`（`:35649`） | 1315 × 4 = **5,260 B** | 局部 | `:35649` → 函数返回 | 是 | 返回即释放（已经是局部） |
| B4 | `importAuthority` + `sortedImportRows`（`:35641`/`:35654`） | 行数 = 导入边数；4 列 int32/bool + `qualifiers: str[]`（`typed_expr_type_arena.cheng:84-89`） | 局部 | `:35641` → 函数返回 | 是 | 局部，已释放 |
| B5 | buildState（`typed_expr_type_arena.cheng:5148-5199`）+ `PendingForwardNominal`（`:5070-5077`） | `symbolByDeclarationRoot` 158,223×4 = **632,892 B**；`blockedFlags` 158,223×1 = **158,223 B**；`authorityUsed` 按 authority 行数 | `arenaState`（`:35668`）、`pending`（`:35681`） | `:35672` → seal | 否 | seal 之后 |
| B6 | `typedContextLookup`（`:35690` → `outLookup`） | `ParserSourcePathIndexLookup` = `slots: int32[]`（234×2+8 槽）+ ≤234 个 bucket（`parser.cheng:1291-1293`，`typed_expr.cheng:66762`） | `outLookup`，回传 `work` | `:35690` → 函数返回 | 是 | 局部 |
| B7 | pass=1 首源 tree arena 预留 | `reserve = typeArenaForestSourceArenaBytes[0] + 65536 = 332,992 B`（`:35733`，trace `forest_parse_begin pass=1 src=0 reserve=332992`） | `sourceTree`（`:35759`） | 单源，`:35841` 释放 | — | 已是逐源释放 |

**B1 的复算（用 r11b 自己的 `ta_limits`，不引外部数）**：

```
columnRows  = 3,627,354×4 + 158,223×20 + 58,761 + 971×5 + 1,315×6 + 17,439×5
            + 234×2 + 1,277×3 + 111×14 + 0            = 17,838,430   ← 与 trace column_rows 逐字相等
columnBytes = 17,838,430 × 4                          = 71,353,720   （typed_expr_type_arena.cheng:3940-3958）
typeSide    = (158,223+1,315+64)×22 + 58,761×3 词 ×4   = 14,750,108   （:8096-8115，种子常量 :8068）
residual    = (158,223×12 + 58,761×4 + 1,315×24) ×4    =  8,661,120   （:8124-8131）
pinned                                                            = 94,764,948   （:8133-8162）
已 commit（src=0 实测 ta_stream）                                   = 86,108,308
未 commit（= residual 预算）                                        =  8,656,640
```

**A 段的量化指纹**（决定 A1 的判读）：

```
逐源 残留(i) = live(begin i+1) − live(begin i)      与 parse 自身新增分配数 treeLive(i) = live(end i) − live(begin i)
  corr(残留, treeLive) = 1.0000      Σ残留 / ΣtreeLive = 1.0020        （233 个源）
  Σ残留 = 1,773,202 ;  ΣtreeLive = 1,769,713
逐 token：1,773,279 / 3,627,354 = 0.4889 个分配/token ；95,109,240 / 1,773,279 = 53.6 B/个
```

⇒ **parse 造的堆对象几乎 100% 留存**（不是 7%、不是 80%）。
~~按 53.6 B/个 + 0.489 个/token 的形状，最贴合的解释是"逐源 intern 池里每个唯一 token 文本一个堆块"（`intern.cheng:727-748`）~~ —— **此假设已被 r19 的 `intern_count=1` 就地证伪（见 §6 "E1b 判读"①），已删除**；N 块**不在 intern 池里**，也**不在 tree 的任何字段里**，静态不可判，见 §6 E1c。

---

## 4. 跨窗口复现（证明 A/B 两段是结构量，不是噪声）

| 窗口 | 驱动 | tokens | decl_index declarations | A 段 RSS | A 段 live | B 段 RSS | B 段 live |
|---|---|---|---|---|---|---|---|
| `r9g.stderr.txt` | `kd_r9g` | 3,612,610 | 155,657 | 68,599,880 | **1,764,288** | 124,878,992 | **313,331** |
| `r9z.stderr.txt` | `kd_r9z` | 3,626,150 | 155,843 | 59,457,608 | **1,771,144** | 71,204,960 | **313,629** |
| `r11b.stderr.txt` | `kd_r11b` | 3,627,354 | 155,904 | 95,109,240 | **1,773,279** | 66,060,360 | **313,629** |

三条读法：

1. **RSS 抖动巨大、`live` 几乎不动。** B 段 RSS 在 66.1–124.9 MB 之间摆动（差 1.9 倍）而 `live` 只差 298 个；A 段 RSS 59.5–95.1 MB 而 `live` 只差 0.5%。⇒ 本轮必须做**结构归因**，绝对读数只能同窗用。
2. **A 段 live/token 高度稳定**：0.48837 / 0.48844 / 0.48887。⇒ A1 是**按 token 数确定**的量。
3. **B 段 live 呈量化跳变**：tokens +13,540 → live +298；tokens +1,204 → live **+0**。⇒ B 段不是"每行一个对象"，而是**容量增长块**（量化/幂次增长），这也解释了为什么 B 段 RSS 随内容变而条数近似不变。

---

## 5. 对"重点怀疑项"的逐条判定

| 怀疑 | 判定 | 证据 |
|---|---|---|
| profile/source payload 释放后仍被引用的源文本或 CSG 层缓冲 | **不是本窗口的大头**。绑定期源文本早在 `after_binding_source_text_release` 已释放（trace 行 8）；窗口内只有 `CompilerCsgImmutableSourceSnapshotText`（`:35713`）逐源取用 | r11b 行 8/22/24；`:35712-35724` |
| pass=1 之前的逐源 census 数组 | **证伪**（188,136 B） | `compiler_csg.cheng:1487`、`parser.cheng:27462` |
| `ta_stream` 的 86 MB 是否与 tree arena 重复持有 | **证伪（同一对象）**；但语义是 committed 全林预留，不是"2 源活跃" | `:35857-35861`（同一 `ArenaUsed`）；`:35841` tree 已释放 |
| forest arena 的 bump doubling 死区 | **pass0 有、pass1 无**。pass1 用 census 精确预留（`:35740-35755`）；TypeArena 用 pin+reserve；pass0 无 census（`:33145-33149`）⇒ 仍走 `arena.cheng:373-397` 弃块 | trace 行 562：pass0 src=134 `arena=140,603,200` / RSS 759,104,616 |
| `after_profile_source_payload_release` 段 +149 MB 的持有者（`deterministic_model_derivation.md:732`） | **已定位**：r11b 该段 +156,958,816，其中 **+150,995,040 / +536,933 分配在 `metadata_contexts_built` 一步** = `work.typedMetadataContexts`（234 × `TypedExprSourceContext`），由 `compilerCsgBuildMetadataContextsRec`（`compiler_csg.cheng:37091-37186`，追加点 `:37181`）建；`CompilerCsgCompactProfilesForFixedPoint`（`:1815-1823`）只切 profile 载荷可达性，不动它 | r11b 行 20/21/22 |

---

## 6. 未测项表 + 可判定实验（都不改语义，共 5 行 trace）

### 未测项

| # | 量 | 状态 |
|---|---|---|
| T1 | A 段 95,109,240 B / 1,773,279 个分配的**对象类型**（是否 = 逐源 intern 池文本） | **静态不可判**。`ParserValueExprTreeRelease`（`parser.cheng:10217-10241`）显式释放 `arena` + `internPool`，`intern` 的 `freeSeqStrRelease`（`seqs.cheng:77-82`）带 `memRefCount(buf) <= 1` 门 —— 该门是否成立取决于 ORC 引用计数，静态读不出来 |
| T2 | B 段 +66.1 MB 归 TypeArena 预留（B1）还是 `TypedExprBuildIndex`（B2） | **静态不可判**。两者都在同一个 4 语句窗口内，量级同阶；`ArenaReserveCapacity`（`arena.cheng:198-210`）走 ≥256 KiB 的 mmap 档（`program_support_backend.cheng:6086-6089`），未触页不计 footprint，所以"预留是否立即变常驻"不能靠读码定 |
| T3 | TypeArena `used` 与 pinned capacity 的**终点**死区 | **未测**。`ArenaUsed/cap` 埋点在 `compiler_csg.cheng:39337`，r11b 在 pass=1 src=2 就撞门，未到达 |
| T4 | pass0 逐源 tree 的 doubling 死区倍数（`ArenaCapacity` vs `ArenaUsed`） | **未测**。`forest_parse_end`（`:33214`）只打 `ArenaUsed` |
| T5 | `tree.importOrigins`（`parser.cheng:7760`，`new(ParserImportOriginSoA)`）是否随 tree 释放 | **未测**。`ParserValueExprTreeRelease`（`parser.cheng:10217-10241`）只显式释放 `arena`（`:10238`）与 `internPool`（`:10239`），不显式释放该字段，依赖 ORC 递归回收 |

### 实验 E1 第二段（定死 A 段：释放有没有回吐）——**补丁已交付，未落地**

> **状态**：第一段（零改动 + `CHENG_PARSER_MEM_TRACE=1`）由调度方执行，**结论作废**：该 trace 实际只有 `source_exists_*` / `split_*` / `slice_copy_*` 三类 stage（`parser.cheng:72-83` 的 `ParserDebugStage` 只被源文本切分相调用），**没有任何 release 相关 stage**，覆盖不到 `ParserValueExprTreeRelease`。第二段补丁如下。

- **补丁**：`docs/campaigns/2026-08-31-kernel-userpath/patches/e1_p0_release_probe.patch`
  **冻结副本**：`.rebuild/s1b_step3/r9/patchgen/e1_p0_release_probe.frozen.patch`（`cmp` 字节相同）
  **sha256（两件同值）**：`01036af44a1e8e4c74e405a1dd60c72077514f41b5662f186f9ecafea323ae39`
  **`git apply --check`（基线 = 当前树，已含 E2）**：rc=0（两文件均 `Checking patch ...`）。
- **改动面**：`parser.cheng` 新增一个纯 trace 函数 `ParserMemTraceArenaStage`（`ParserDebugStage` 下方，`:84` 后），复用 `parserMemTraceInitialized/parserMemTraceEnabled` 的**同一个一次性 latch**（env 仍为 `CHENG_PARSER_MEM_TRACE`）；`compiler_csg.cheng:33239` 逐源 `ParserValueExprTreeRelease` **前/后各一条**调用。**未改任何既有函数体**、不改语义、开关关闭时零输出零开销。
- **打印字段**：`stage` / `src_index`（= 调用点循环下标，与既有 `forest src=` 同一键）/ `rss` / `live` / `arena_used` / `arena_cap` / `intern_payload`。
  `p0_release_after` 的三个 arena 列打 0：它们**不是未测值**，而是 `ArenaRelease`（`arena.cheng:153-160`）在句柄被置 nil（`parser.cheng:10241`）之前就写死的结构零值 —— 即"释放后 arena 的 used/capacity 必为 0"，所以 2/3 两支只能靠 `live` 与 `rss` 区分。

- **判读表（已被 r16 实测修正，上一版第 2 支作废）**：

| # | 读数（同一次运行内相邻两条） | 判定 | 状态 |
|---|---|---|---|
| 1 | `live` 下降 ≈ parse 期新增 **且** `rss` 下降 ≈ `arena_used` | 释放有效、内存真的还给 OS | ✅ **r16 证实** |
| 2 | ~~`live` 下降但 `rss` 不降 ⇒ 逻辑已释放、OS 未返还 ⇒ 逐源 arena 复用/池化~~ | — | ❌ **r16 证伪，此行删除**：逐源 arena 走 mmap 档（`program_support_backend.cheng:6086-6089`），`ArenaRelease` 后 RSS 确实回吐（src=2：667,665,416 → 633,209,816 = **−34,455,600**，arena_used=33,621,952） |
| 3 | `live_after ≈ live_before` | 释放路径没走到 | ❌ 不成立：`live` 确实降（每条源恒定 **−9**），RSS 也降 |
| 4 | **新**：`live` 只降固定 9，而 parse 期新增 N（N ∝ 源大小） | **释放只回收固定 9 个块；parse 新增的 N−9 个块既不释放、也不属于 arena** | ✅ **r16 实测** |

**r16 实测（`kd_r16`，`CHENG_PARSER_MEM_TRACE=1`；取证件 `.rebuild/s1b_step3/gate/r16.stderr.txt`）**：

```
p0_release_before src_index=2   rss=667665416 live=1552201 arena_used=33621952 arena_cap=67108864  intern_payload=817253
p0_release_after  src_index=2   rss=633209816 live=1552192 arena_used=0        arena_cap=0         intern_payload=0
p0_release_before src_index=158 rss=779338904 live=3026060 arena_used=73411680 arena_cap=134217728 intern_payload=2174130
p0_release_after  src_index=158 rss=704742456 live=3026051 arena_used=0        arena_cap=0         intern_payload=0
```

三条硬结论：

1. **`MemLiveAllocations()` 是"当前存活块数"，不是累计分配数。** 证据：`program_support_backend.cheng:6061-6062` / `:6112` 每次分配 `+1`，`:6145` / `:6159` / `:6411` / `:6426` 每次释放 `−1`；`system.cheng:975-985` 在静默快照处断言 `allocTotal − freeTotal == liveTotal`（不成立即 panic），该恒等式只在 live 是**当前存活数**时成立；C 冷运行时同构（`bootstrap/cheng_cold.c:111905`/`:111938`/`:111960`）。r16 经验上也确实回退（每条源 −9）。
2. **`live` 数的是"块"，不是字节。** 逐源 tree arena 经 `@importc("cheng_malloc")`（`arena.cheng:9-21`）⇒ 一次分配 = **1 个 `live`**，而它在 RSS 上值 33.6 MB。所以 `rss` 掉 34 MB 而 `live` 只掉 1，两者不可互推。
3. **逐源 `ParserValueExprTreeRelease` 恒定只回收 9 个块**（r16 全部 234 源均为 −9），而该源 parse 新增 N 个块（src=2：+43,892；src=158：+124,934；N ∝ 源大小）。⇒ 既不是"释放路径没走到"，也不是"arena 不还 OS"；真正的量是**"parse 新增、release 不回收"的 N−9 个块**，A 段 `live` +1,773,943（r16）就是它们的和。

**A 段 RSS 的逐源分解（r16，Σ 234 源）**：

```
Σ rewrite/split 窗 (forest src → forest_parse_begin) = +  104,284,232
Σ parse 窗         (parse_begin → parse_end)         = +1,270,941,712
Σ release 窗       (parse_end → release_after)       = −1,283,917,816
──────────────────────────────────────────────────────────────────
Σ 整程             (forest src → release_after)      = +   91,308,128   ≈ r16 A 段 +86,687,840
```

⇒ **parse+release 这一对净额 ≈ −13 MB（parse 的瞬时几乎全部回吐），A 段的净增长不在 parse 窗里。** 逐源看，`forest src=158` → `forest_parse_begin pass=0 src=158` 一步就 **+68,960,304**（该源 2,174,130 B = `src/std/times.cheng`），同窗 `live` 从 2,900,997 升到 2,984,749 又**回落到 2,901,032** —— 即 `split_*` 造的 ~41,875 个字串块**已被释放**（`live` 回退），但 **RSS 没还**（libc small 块只回 malloc zone）。这是与上面第 3 条**互相独立的第二个机制**：一次性高水位，之后被后续源复用（r16 里 `after(158)=704,742,456` 之后到 `after(233)=715,113,528` 只再涨 10 MB）。

**尚未点名的一项（下一轮的最小探针）**：上面第 3 条那 N 个块的**身份**。已可排除的：tree 的 arena（1 块）、tree 对象 / `importOrigins` / intern pool 对象及其 4 个索引缓冲（合起来正是那 9 块）、逐源 census（188,136 B）与 `sourceArenaBytes`（936 B）。**`intern_payload` 逐源恰好等于该源字节数**（6,917 / 9,952 / 817,253 / 2,174,130 …与 `forest src=N bytes=` 逐字相等）⇒ intern 池里是**整源 1 条文本**，不是逐 token 文本。故需一条 `intern_count=`（池条目数）读数二选一：`intern_count=1` ⇒ N 块不在池里（往 parse 内部找）；`intern_count≈N` ⇒ 池就是持有者，`logicalPayloadBytes` 少报。补丁见下。

### 实验 E1b（给 N 个块点名；`intern_count` 读数）——**补丁已交付，未落地**

- **补丁**：`docs/campaigns/2026-08-31-kernel-userpath/patches/e1b_intern_count_probe.patch`
  **冻结副本**：`.rebuild/s1b_step3/r9/patchgen/e1b_intern_count_probe.frozen.patch`（`cmp` 字节相同）
  **sha256（两件同值）**：`6c92a197df982c4d5efbc4cca865b2c37b11d77c1c5604f35bc4f398141bedaf`
  **`git apply --check`（基线 = 当前树，已含 E1 + E2）**：rc=0。
- 改动：给 `ParserMemTraceArenaStage`（`parser.cheng:90`）加第 6 个形参 `internCount: int32` 并在同一行尾追加 `intern_count={internCount}`；`compiler_csg.cheng:33258-33263` 的 `p0_release_before` 多传一个 `langintern.InternPoolCount(sourceTree.internPool)`（`intern.cheng:481-483`，`@borrows`，与同处 `InternPoolLogicalPayloadBytes` 同形），`p0_release_after` 补传 `0`（句柄已释放）。门控、语义、开关关闭时的行为都不变。
- **判读**：`intern_count=1` ⇒ intern 池只有整源一条文本，N 个块在 parse 内部，下一步查 `ParserValueExprReadTreeFromTextReserved`（`compiler_csg.cheng:33187`）里按行/按 token 生成而又未挂回 tree 的那些块；`intern_count ≈ N` ⇒ 池就是持有者，`InternPoolLogicalPayloadBytes`（`intern.cheng:486-489`）少报了，修 `Intern`/`internPoolAppendUnique` 的记账与释放。

### E1b 判读 + A 段定性 + N 块点名（r19，`kd_r19`，取证件 `.rebuild/s1b_step3/gate/r19.stderr.txt`）

**① E1b 判读：`intern_count=1`（每源都是 1）。** `src=0 6917/1`、`src=1 9952/1`、`src=2 817253/1`、`src=3 94454/1`，且 `intern_payload` 逐源**恰等于源字节数**。
⇒ **本文件第一轮写的"逐源 intern 池里每个唯一 token 文本一个堆块"假设就地证伪、已删除**：池里恒为**整源 1 条文本**，N 块不在 intern 池里。

**② A 段定性：是「可回收的保留对象」，不是「大源瞬时高水位的残留」。** 同一次运行的 `p0_release_after` 轨迹：

```
src=0   rss=619,840,496  live=1,507,594
src=90  rss=580,109,320  live=2,256,061   ← RSS 比 src=0 还低 39.7 MB，live 却已 +748k
src=62  rss=573,096,968  live=2,036,799   ← 全程最低点
src=233 rss=720,012,368  live=3,282,288   ← 全程最高点
净增:   rss +100,171,872  live +1,774,694  ⇒  56.4 B/块
```

- RSS **非单调**（src=62 比 src=0 低 46.7 MB）说明大源的瞬时高水位**被 OS 回收了**；但包络**下沿随 `live` 单调抬升**，净增与 `live` 净增成 56.4 B/块线性关系 ⇒ **A 段的 +100 MB 主体是保留对象，不是瞬时残留。**
- 峰值出现在**末尾源区间**（src=226..233：719.6–720.0 MB），不是中段。
- 瞬时峰（`forest_parse_end`）**峰 = src=158 rss=783,713,408**（arena 73,411,680），**距门 805,306,368 只剩 21,592,960**。top4 瞬时（`parse_end − release_after`）：src=134 +142,655,608 / src=158 +74,580,040 / src=170 +57,098,312 / src=166 +29,196,336，**每项 ≈ 该源 `arena_used`（140.6 / 73.4 / 62.3 / 31.1 MB），且 release 全部回吐**。
- **修法方向 ⇒「修保留对象」，不是「削逐源瞬时峰值」。** 削瞬时是 §8.6 的 `U0` 杠杆，靠 pass1 逐源 census（`compiler_csg.cheng:35740-35755`）；**pass0 没有 census**（`:33145-33149` 自述鸡蛋问题）⇒ 该杠杆对 pass0 不可用，不得算进 A 段收益。
- 给门的账：pass0 自身瞬时峰 783.7 MB（距门 21.6 MB）、pass0 结束驻留 720.0 MB（距门 85.3 MB）⇒ **把门顶破的仍是 pass1**（r14：`p1_ctx_index_built` 795,002,008，守卫 837,141,704 触发）。

**③ N 块点名（静态枚举，逐个给量级）。** 该窗口内**全部**可静态点到的分配面：

| # | 分配点 | `文件:行号` | 每源条数 | 是否挂回 tree |
|---|---|---|---|---|
| 1 | tree 本体 + arena + internPool 对象 + `importOrigins` | `parser.cheng:7757-7762` | **4** | 是，`ParserValueExprTreeRelease`（`:10217-10241`）释放 |
| 2 | intern pool 内部（pool 对象 + 4 个索引/文本缓冲） | `intern.cheng:470-479` | **5** | 是，`InternPoolRelease`（`intern.cheng:676-690`）释放 |
| 3 | intern 文本条目 | `intern.cheng:710-725` / `:727-748` | **1**（整源，`intern_count=1` 实测） | 是 |
| 4 | forwarding production seal 的两个工作 seq | `parser.cheng:8891-8894` | 2 | 否，局部，函数返回即释放 |
| 5 | tree 的 258 个字段 | `parser.cheng:568-913` | **0** | 201 个 `ArenaArrayInt32` 全在 arena 内；余 43 int32 + 6 bool + 4 int64 + 4 个 ref |
| 6 | 逐源 census / arena bytes | `compiler_csg.cheng:1480` / `:1487` | 0（摊销 ~2） | 是，挂在 `work` 上 |

**1+2+3 = 10；扣掉 #4 的 2 个局部块后与实测恒定 `−9` 逐字吻合 ⇒ 那 9 块的身份已闭合，A1 不是它们。**
**⇒ N 块既不在 tree 的任何字段里，也不在 intern 池里。** 该窗口内剩下的唯一分配面是 `ParserValueExprReadTreeFromTextReserved` 内部——`parser.cheng:28912` `ParserValueExprProduceStatementEvents(...)`（语句/节点生产，parse 核心）及其尾部 seal（`parser.cheng:28975` 起）。**具体分配点静态不可判**：那是 4 万行 parser 的深调用树，这些块不带 arena/seq 归属标注。⇒ 用 E1c 的行计数读数二选一。

### 实验 E1c（给 N 块点名：行计数读数）——**补丁已交付，未落地**

- **补丁**：`docs/campaigns/2026-08-31-kernel-userpath/patches/e1c_rowcount_probe.patch`
  **冻结副本**：`.rebuild/s1b_step3/r9/patchgen/e1c_rowcount_probe.frozen.patch`（`cmp` 字节相同）
  **sha256（两件同值）**：`ea11951571523f0a177a58a19eab9a702294d177d230bc3b20fdf4b7d5a4fcef`
  **`git apply --check`（基线 = 当前树，已含 E1+E1b+E2）**：rc=0。
- 改动：`ParserMemTraceArenaStage`（`parser.cheng:90-95`）再加 `tokenCount: int32, nodeCount: int32` 两个形参并在行尾追加 ` token_count={} node_count={}`；`p0_release_before` 多传 `sourceTree.tokenCount`（`parser.cheng:576`）、`sourceTree.nodeCount`（`:573`），`p0_release_after` 补两个 0。门控/语义不变。
- **判读**（用同一次运行的 `Δlive(parse) = live(parse_end) − live(parse_begin)` 比）：`Δlive ≈ node_count` ⇒ 一个节点一块；`Δlive ≈ 0.49 × token_count` ⇒ 每两 token 一块；两者都不吻合 ⇒ 按行/按 char 的其它人口，此时再把 `tree.declarationCount` / `regionCount` 一并打上筛。

### E1c 判读：**一节点一块**（r28，取证件 `.rebuild/s1b_step3/gate/r28_trace.stderr.txt`，分析 `.rebuild/s1b_step3/r9/nblock_corr.py`）

```
sources=233   Σd_live=1,775,195   Σtokens=3,629,716   Σnodes=1,718,304
d_live/token = 0.4891        d_live/node = 1.0331        [d_live>1000, 144 src] 1.0329
逐源样本: src=2 43883/43452=1.010   src=4 2620/2730=0.960   src=7 6775/6649=1.019
```
⇒ **定论：保留的 ~1.77M 块 ≈ 每个解析节点一块**（三个口径都稳定在 1.03，超出 1.00 的 ~3% 与固定对象同阶）；`d_live/token = 0.49` 只是同一事实的影子（本闭包 nodes ≈ 0.47×tokens），**不作为独立假设**。

### N 块点名的静态结论（r28 后，逐条划掉证伪项）

| 假设 | 判定 | 依据 |
|---|---|---|
| ~~逐 token 文本进 intern 池~~ | ❌ **证伪** | r19 `intern_count=1`，`intern_payload` == 源字节数 |
| ~~每节点携带一个 owned `str`（名字/文本切片）~~ | ❌ **静态证伪** | `ParserValueExprNodeNameText`（`parser.cheng:15244-15249`）是 **`@borrows`**，委托 `ParserValueExprNodeOptionalSpanText` ⇒ 名字是**投影**不是分配 |
| ~~tree 有 per-node 的 `str[]`/`int32[]` 堆列~~ | ❌ **静态证伪** | `parser.cheng:568-913` 的 258 个字段 = **201 个 `ArenaArrayInt32`（全在 `tree.arena` 内，整棵树只占 1 个堆块）** + 43 int32 + 6 bool + 4 int64 + `arena`/`internPool`/`importOrigins`/`failureArtifact` 4 个 ref；`ParserImportOriginSoA`（`:565-…`）的字段**同样全是 `ArenaArrayInt32`** |
| ~~release 侧 `freeSeqStrRelease` 的 `memRefCount<=1` 门（`seqs.cheng:77-82`）对 tree 的 per-node str 列未命中~~ | ❌ **前提不存在** | tree **没有** per-node `str` 列可释放；该门在本路径上只被 intern 池的 `texts`（**1 条**）触发 |
| ~~seal 阶段按节点分配~~ | ❌ | seal 是 11 个 `...StrictValidateInto(tree, err)`（`parser.cheng:28976-28990`，纯校验）；`parserForwardingProductionsSeal`（`:8883-8894`）只分配 **2 个局部 seq** |
| ~~释放路径没走到 / arena 不还 OS~~ | ❌ | r16 已证伪（恒定 −9，RSS 随 arena 回吐） |
| **⇒ 剩下的唯一区间** | **未定** | `ParserValueExprProduceStatementEvents(tree, tokenStart, tokenCount, err)`（`parser.cheng:28912`）= 语句/节点生产核心；1 块/节点的分配点在它**内部**，静态不可判 |

### 实验 E1d（把 N 块的产生区间一分为二）——**补丁已交付，未落地**

- **补丁**：`docs/campaigns/2026-08-31-kernel-userpath/patches/e1d_parse_bisect_probe.patch`
  **冻结副本**：`.rebuild/s1b_step3/r9/patchgen/e1d_parse_bisect_probe.frozen.patch`（`cmp` 字节相同）
  **sha256（两件同值）**：`dccc5ac6fa74578dc5b5c395db1d2ea2c584187565f5667acd0a42e7b575c42b`
  **`git apply --check`（基线 = 当前树）**：rc=0。
- 改动只有 **2 行**：在 `ParserValueExprProduceStatementEvents` 调用**前**（调用点已按内容锚定，新行 28913）插 `ParserDebugStage("p0_parse_pre_produce")`，调用**后**（新行 28932）插 `ParserDebugStage("p0_parse_post_produce")`。两处都在**同级语句边界**：前插点前一条是上一个 `if` 体末的 `return false`，后插点后一条是 `if !migrationSourceSyntax …`，`if/elif/else` 链未被切断。**复用既有 `ParserDebugStage`**（`parser.cheng:72-83`，env `CHENG_PARSER_MEM_TRACE`）= 同门控、零新 API、零新开关。
- **判读（同一次运行内四条读数之差，别跨窗口）**：令 `A = live(forest_parse_begin)`、`B = live(p0_parse_pre_produce)`、`C = live(p0_parse_post_produce)`、`D = live(forest_parse_end)`：
  - `C − B ≈ node_count` ⇒ 分配点在**语句/节点生产核**内；
  - `B − A ≈ node_count` ⇒ 分配点在它**之前**（lex/scan 前置相）；
  - `D − C ≈ node_count` ⇒ 分配点在它**之后**（seal 相）。
  一次运行把区间缩到 1/3，再按同法继续二分。
- **为什么不按建议在 `freeSeqStrRelease` 门上打命中/未命中计数**：见上表第 4 行 —— 该门在本路径只处理 intern 池的 1 条文本，命中与否都无法解释"1 块/节点"，只会得到不可判读数。

### E1d 判读受阻：键不配对（r30）——**配对缺陷已定位，E1e 补丁已交付**

**缺陷**：`ParserDebugStage`（`parser.cheng:72-83`）打的是 `src={parserMemTraceSource}`（**绝对路径**），而 `p0_release_before/after` 打的是 `src_index=N`；两套键对不上，只能按出现次序位置配对，实测 `p0_parse_*` 只有 33 个不同路径而 release 行有 234 条 ⇒ 位置配对完全错位（算出 `Σ(post−pre)/Σnodes = 16.2`，与已知 `1.033` 差一个数量级）⇒ **该轮读数不可用**。
**根因（静态）**：`parserMemTraceSource` 只在 `parserBuildExprCallProfileSyntaxInto`（`parser.cheng:30495`）被赋值——那是**前端 profile 相**；pass-0 解析窗口根本不经过它，所以它打出来的是**陈旧路径**。这不是探针噪声，是一个独立的字段语义缺陷。

**可用的粗结论（同源 pre→post 仍可靠）**：`cleanup_cfg` +28,980、`system_link_exec` +11,797、`ownership_drop_ir` +9,565、`snapshot_lowering_authority` +3,396 —— 量级数千到数万，而全程 `Σd_live ≈ 1.77M` ⇒ **produce 核只占一部分**，前置相（lex/scan）与 seal 相都占相当比重，E1e 到位后才能三分。

### 实验 E1e（补齐配对键）——**补丁已交付，未落地**

- **补丁**：`docs/campaigns/2026-08-31-kernel-userpath/patches/e1e_parse_srcindex_probe.patch`
  **冻结副本**：`.rebuild/s1b_step3/r9/patchgen/e1e_parse_srcindex_probe.frozen.patch`（`cmp` 字节相同）
  **sha256（两件同值）**：`2472188986511757499e010cf460040110bfdbc3046810d7fee28bccade97a58`
  **`git apply --check`（基线 = 当前树）**：rc=0；源文件 `ParserMemTraceSourceIndexSet` 命中 **0** ⇒ 未落树。
- 改动 3 处：① `parser.cheng:28` 后加 `var parserMemTraceSourceIndex: int32 = -1`；② 在 `ParserDebugStage` 之后（`parser.cheng:83` 前）加 setter `ParserMemTraceSourceIndexSet(index: int32)`（**复用同一个一次性 latch**，开关关闭时一个字节都不写）；③ E1d 的两条 `ParserDebugStage("p0_parse_pre_produce")` / `("p0_parse_post_produce")` 改成 `if parserMemTraceEnabled: ParserDebugStage(Fmt"… src_index={parserMemTraceSourceIndex}")` —— **开关关闭时零开销、零输出**；④ `compiler_csg.cheng:33199`（`if compilerCsgMemTrace:` 块之后、`if profiles[sourceIndex].migrationSourceSyntax:` 之前，同为 8 空格同级语句边界）加一行 `parser.ParserMemTraceSourceIndexSet(sourceIndex)`，**逐源无条件设键**。`if/elif/else` 链未被切断。
- **注意**：这些行仍会带一个陈旧的 `src=<路径>` 字段（`ParserDebugStage` 固有）；**配对必须只用 `src_index=`**。
- **判读**（E1d 原判读表不变，现在可用）：同一次运行内 `A = live(forest_parse_begin)`、`B = live(p0_parse_pre_produce src_index=N)`、`C = live(p0_parse_post_produce src_index=N)`、`D = live(forest_parse_end)`，按 `src_index=N` 取四条：`C−B ≈ node_count` ⇒ produce 核内；`B−A ≈ node_count` ⇒ lex/scan 前置相；`D−C ≈ node_count` ⇒ seal 相。

### 口径澄清：`d_live` 是**净留存**，不是**分配总量**

下一层二分找的是「**谁留住了**」，不是「谁分配了」。`d_live` 只反映"跨过该区间后仍然存活的块数变化"，区间内**分配后又释放**的临时块完全不体现在里面（r16 的 `split_*` 就是活例子：一次 `split_into_done` 让 `live` 涨 41,875，到 `forest_parse_begin` 又全部退回，但 RSS 因为 libc small 块不还 OS 而留在了高水位）。因此：

- 判「一节点一块的**留存者**」⇒ 用 `d_live`（本文档 A 段的 1.77M 块）；
- 判「**峰值**贡献者」⇒ 用 `rss`（r19：瞬时峰 src=158 783,713,408，距门 21.6 MB）；
- 两者不可互换：一个区间可以在 `d_live` 上是 0 而在 `rss` 上是 +69 MB（`split` 那一步就是）。

## 9. `work.typedMetadataContexts` 生命周期（r30 轮，部分完成）

**字段**：`compiler_csg.cheng:1505` `typedMetadataContexts: texpr.TypedExprSourceContext[]`；类型定义 `typed_expr.cheng:1768`；构建 `compiler_csg.cheng:37148-37227`（追加点 `:37227` `TypedExprSourceContextAppendMove`）；清理 `compiler_csg.cheng:36494-36495` → `TypedExprClearSourceContextAllFields`（`typed_expr.cheng:49518-…`，第一句是 `TypedExprSourceContextReleaseBuildIndex(ctx)` `:49519`）。

**Q1（release 在成功路径上的时点）—— 已答**：release 函数定义 `compiler_csg.cheng:36441`，**只有三处调用**：`:36520`（在 `CompilerCsgBuildWorkingSetRelease`，`:36518` 内）、`:38810` 与 `:40265`（都在 `compilerCsgBuildConsumeWithOverridesCoreInto`，`:38776` 内）。
并林相函数是 `CompilerCsgStreamTypeArenaFromDeclarationIndexInto`（其体内读点在 `:35734` / `:35878`），它**由 `compilerCsgBuildConsumeWithOverridesCoreInto` 在约 `:39390` 处调用**。因此 `:38810` 是**该函数里并林调用之前的提前退出/错误路径**，`:40265` 是**该函数尾部**。
⇒ **成功路径上，contexts 只在 `:40265` 被清，位置远在并林相之后**；最后一个读点是 `:39457` / `:39590` 一线（更晚还有 `:38463-38496` 的 typed-IR 定点轮）。**⇒ 整块 234 个 context 在 pass-1 全程 + expr 层 + typed-IR 定点期间都驻留，`+150,995,040 B` 不是"过了并林就能放"。**

**Q2（并林相里读了什么）—— 已定位到调用面，逐字段未完成**：
- 并林函数体内只有两处：`:35734`（整个数组交给 `TypedExprBuildSourceContextExactIndexWithManualAuthority`，产出 `contexts[0].buildIndex`）与 `:35748`（读 `[0].buildIndex` 句柄）；循环内 `:35878`（整个数组交给 `TypedExprBuildIndexAppendSourceCallDeclarationsManual`，逐源写入 `[0].buildIndex`）。
- 并林之后的 expr 层读点：`:36057`/`:36081`（`CompilerCsgConsumeExprSliceIntoTypedFacts` → `TypedExprBuildFactsAppendSourceExprLayerWithContext`）、`:36136`/`:36297`/`:36327`（`CompilerCsgSemanticAppendSourceExprSlices` → 同族）、`:37395`、`:37455`、`:37659`/`:37784`、`:38292`/`:38321`、`:38463-38496`、`:39394`、`:39457`。
- **未完成**：对上述每个 callee 逐个判定"读的是 context 的哪个字段、最后一次读在哪儿、该字段多少字节"。这是 Q3 的前提，本轮未做完，**不编**。

**Q3/Q4（能否提前释放 / 逐源构建消费）—— 未完成**，但已确认两条硬事实：① 并林循环本身对 contexts 的依赖只有 `[0].buildIndex`（读+写），而该 index 在循环**之前**（`:35733-35748`）就已建好；② 但 expr 层在并林**之后**仍整体读它，所以"并林一结束就放"不成立。可行的收窄点只能落在 expr 层之后、`compilerCsgBuildExprCallProfileSourcesRec` 返回处（`after_expr_layer_and_symbols` 锚点，`compiler_csg.cheng:39321` 一线）——**前提是先做 Q2 的逐字段最后读点**。

**下一轮最小读数（未出补丁）**：在 `metadata_contexts_built`（`:39270` 一线）、`after_expr_layer_and_symbols`、以及 release 前各打一条"contexts 保留字节"，即可用**实测**给出可回收量，而不必先做完静态逐字段分析。

## 10. 全林峰值重估（r30 自算，未照抄）

- pass-0 `p0_release_after` 全程：min `568,869,872` / max `659,473,464`；src=20 `569,164,784`、src=120 `603,194,376`、src=233 `659,473,464` ⇒ **+90.6 MB / 234 源 ≈ 0.39 MB/源且放缓** ⇒ **pass-0 是平台型，不是逐源线性累积**（与 r19 的 56.4 B/块 × live 增量一致）。
- pass-1 `forest_appended` 逐源：src=0 `734,790,832` → src=2 `+72,613,960` → src=10 `+65,224,776` → src=14 `916,505,920`。两块大源占 `137,838,736 / 181,715,088`。
- **本节最强的一条是纯观测、不依赖外推**：**pass-1 走到第 15 个源（src=14）时 RSS 已是 `916,505,920`，超门 `805,306,368` 达 `111,199,552` B，而后面还有 219 个源没走。** ⇒ 全林峰值 **> 916.5 MB**，目标文本里"模型缺口 13.1 MiB"低估了**至少一个数量级**。
- 我的区间：**下界 ≥ 0.92 GB（已实测达到）；中枢估计 1.0–1.2 GB；超门 111–400 MB**。误差来源已写明：0.92 GB 是实测下界（硬），1.2 GB 上端是把"前 15 源 +181.7 MB"按源数线性外推的产物，而该速率显然不可持续（src=0/1 两个共 17 KB 的源就贡献了 18.0 MB），所以真实值大概率靠近下界一侧。**该区间与"0.9–1.1 GB"相容，但我的下界是实测、不是估计。**

## 11. 并林相 8.3 MB/源点名（r34 轮，**进行中**）

**r34 实测（取证件 `.rebuild/s1b_step3/gate/r34_raised.stderr.txt`，抬门 1.288 GB，并到 61/234 源，1,301,857,864 触发）**：
- **TypeArena 全程只涨 `651,296 B`**（`86,201,856` @src=0 → `86,853,152` @src=60）⇒ **并林增长与 TypeArena 无关**（它是 `TypedExprTypeArenaAllocateFromLimitsInto` 按 limits 预钉住的，`typed_expr_type_arena.cheng:8247-8328`）。
- **RSS 涨 `506,282,344 / 61 源 ≈ 8.3 MB/源`**，且 30→40 为 1.11 MB/源、40→50 为 2.16、50→60 为 4.24 ⇒ **在加速**。
- **纯观测下界**：`722 MB + 61 源 = 1.228 GB` ⇒ 234 源线性外推 ≈ **2.6 GB**，是门的 3 倍以上。

**结构事实（已核）**：
- 并林循环里唯一"逐源往一个不断增长的结构里追加"的点是 `compiler_csg.cheng:35878` → `TypedExprBuildIndexAppendSourceCallDeclarationsManual`（`typed_expr.cheng:37374-37381`）→ 真正干活的是 `TypedExprBuildIndexAppendContextCallDeclarationsManual`。
- 设计注释 `typed_expr.cheng:37383-37387` 明写意图：**"each source appends its own call declarations in the streaming loop, and `TypedExprBuildIndexSealCallDeclarations` seals once"** ⇒ **逐源追加是设计意图**，不是实现跑偏；要判的是**这些行在 seal 之前有没有被消费**、以及**每源到底追加多少行**。
- `TypedExprBuildIndex`（`typed_expr.cheng:456-…`）是宽 SoA：约 30 个 `InternId[]` 列 + 约 25 个 `int32[]` 桶/链列 + **约 14 个 `str[]` 列**（`entry*` 6 个、`visibility*` 5 个、`importOwnerSourcePaths`、`visibilityQuery*` 4 个等）。`str[]` 每行 16 B 头 + 载荷。

**量级判据（我算的，用于筛掉不可能项）**：闭包 `functions=17,439`（`ta_limits`），即全部 234 源一共约 1.74 万函数。若每源追加的是"每函数若干行 × 6 个 `InternId[]` 列 × 4 B ≈ 24 B/行 + `str[]` 头 16 B"，则**全林**总计也只有 MB 量级，**不可能**达到 8.3 MB/源（那需要约 14 万行/源）。⇒ **buildIndex 只有在"每源重扫已有全部条目"（超线性）时才可能解释 8.3 MB/源**；否则它被排除，主嫌疑要转到别处。

**注意 40→60 的加速有两义，必须由读数分开**：该区间恰好含大源（r11b 里 src=47 1.50 MB、src=61 4.50 MB），所以"加速"既可能是**源变大**（线性于源字节），也可能是**每源重扫已有条目**（二次于源序号）。**静态分不开。**

**下一轮最小读数（本轮未出补丁，理由见下）**：在并林循环的 `:35878` 前后各一条，打 `rss`/`live` + `sourceText.len` + `buildIndex` 各追加列的长度。判读：
- `Δrss ≈ k × Δ(列长度)` ⇒ **buildIndex 线性涨** ⇒ 查这些行在 seal 前有无消费者；
- `Δrss ∝ sourceText.len` ⇒ 与 buildIndex 无关，是**逐源按字节的**结构（转查次嫌疑：typed IR/fact 表、`arenaValue`、per-source 小数组的复制放大）；
- `Δrss ∝ 列长度累计值`（即每源成本随源序号上升）⇒ **每源重扫**，二次行为。

**本轮为什么没出补丁**：要打"`buildIndex` 各列长度"必须先在 `typed_expr.cheng` 里加一个只读访问器（或在 `compiler_csg.cheng` 侧直接读字段——`TypedExprBuildIndex` 的字段可见性未核）。我没有读完 `TypedExprBuildIndexAppendContextCallDeclarationsManual`，**不愿交一枚未核实字段名/可见性的补丁去占编译槽**。补齐它需要一个窗口内的 1 次读码 + 1 次生成（沿用同一生成器，只读源只写 `patches/`）。

### 实验 E1f（给 `buildIndex` 各列点名）——**补丁已交付，未落地**

- **补丁**：`docs/campaigns/2026-08-31-kernel-userpath/patches/e1f_buildindex_lens_probe.patch`
  **冻结副本**：`.rebuild/s1b_step3/r9/patchgen/e1f_buildindex_lens_probe.frozen.patch`（`cmp` 字节相同）
  **sha256（两件同值）**：`53da888437312bd41c1727ca7b9e9bfa76b5324ccc495498c419241614b65dd3`
  **`git apply --check`（基线 = 当前树）**：rc=0（4 hunk：1 个在 `typed_expr.cheng`，3 个在 `compiler_csg.cheng`）。
- **`typed_expr.cheng`（新行 37374 起，28 行）**：只读 accessor `TypedExprBuildIndexColumnLensTrace(index: TypedExprBuildIndex, stage: str, sourceIndex: int32, sourceBytes: int32)`，**非 var 形参 ⇒ 带 `@borrows`**；门控 = 模块级 `var typedExprBuildIndexTraceInitialized/Enabled` + 一次性 `os.GetEnv("CHENG_BUILDINDEX_TRACE") == "1"`，**开关关闭时零输出零写入**；只读 `len`，不含 `add`/`setLen`/任何列改写；`index == nil` 直接返回。
  打印 **`TypedExprBuildIndex` 全部 63 个追加类列的 len，逐列列名**（29 个 `InternId[]` 列打一行 `buildindex_ids`，34 个 `str[]` 列打一行 `buildindex_strs`），外加 `stage` / `src_index` / `source_bytes` / `rss`。
  **口径说明**：本行**不打 `live`** —— `typed_expr.cheng` 不 import `std/system`（`typed_expr.cheng:1-16` 的 import 块里没有），为不打乱该文件 import 面，`live` 由同一循环里既有的 `forest_appended/ta_stream` 行提供（同 `src_index` 键可直接对齐）。
- **`compiler_csg.cheng`（3 个调用点）**：循环开始前 `loop_entry`（新行 `35905`，紧跟 `buildIndex = work.typedMetadataContexts[0].buildIndex`）、`pre_append`（新行 `36032`，紧贴 `if !texpr.TypedExprBuildIndexAppendSourceCallDeclarationsManual(` 之前，其前一条是上一处 `if` 体末的 `return false`）、`post_append`（新行 `36042`，在该 `if` 体末 `return false` 之后、`parser.ParserValueExprTreeRelease(sourceTree)` 之前）。三处都是**同级语句边界，`if/elif/else` 链未切断**。

- **判读四支**（同一次运行；`rss` 见新行、`live` 见同源的 `forest_appended` 行）：

| 观测量 | 判定 |
|---|---|
| `Δrss ≈ k × Δ(列长)` | **buildIndex 线性涨** ⇒ 查这些行 seal 前有无消费者 |
| `Δrss ∝ sourceText.len` 而列长几乎不动 | 与 buildIndex 无关 ⇒ 转次嫌疑（每源 typed IR/fact 表、`arenaValue` 释放、per-source 小数组复制放大） |
| `Δrss ∝ 列长累计值`（每源成本随源序号上升） | **每源重扫已有条目**（二次行为） |
| **`Δrss` 大而所有 63 列 len 几乎不变** | 增长在 buildIndex 之外 ⇒ 立刻转次嫌疑面，并同批打 `arenaValue` 的 alloc/release 前后 |

### 文档更正：§8.3 包络公式的 `C(k)` 项（r34 实测后）

§8.3 原写：`peak_stream(k) = F + I + C(k) + T(k)`，其中 `C(k)` 是"列累积"，并附实测 `+95,535,200`（r8，arena 未 pin 时的 doubling 产物）。
**r34 实测更正**：TypeArena 已由 `TypedExprTypeArenaAllocateFromLimitsInto`（`typed_expr_type_arena.cheng:8247-8328`）按 limits **一次性预钉住**，并林全程只涨 `651,296 B`（`86,201,856` @src=0 → `86,853,152` @src=60，61 源）。⇒ **`C(k)` 在 pin 生效后不再是"随 k 增长的项"，它已并入那一次性的 `B1`（`p1_arena_reserved`）**，包络公式应改写成：

```
peak_stream(k) = F + I + B1(pinned TypeArena, 一次性) + B2(ctx index, 一次性) + T(k) + G(k)
其中 G(k) = 并林相逐源净留存（r34: ≈ 8.3 MB/源，未收敛）—— 这才是现在的主导项
```

→ 详见 §11。**`C(k)` 那一项不得再按 k 增长记账。**

## 12. `typedMetadataContexts` 逐字段台账（Q3/Q4）——**静态审计不可靠，改为实测census**

**类型规模（已核，机器抽取，非手抄）**：`TypedExprSourceContext` = `typed_expr.cheng:1767-1865`，**68 个字段** = **39 个 seq 字段**（`int32[]` / `str[]` / 结构体数组）+ **22 个标量**（int32/int64/bool）+ 7 个引用/结构体字段（`buildIndex`、`frozenMetadataProjection`、`moduleConstLookup`、`functionHeaderLookup`、`packageOwnerKey` 等）。表头字节量（不含载荷）：seq 24 B、int64 8 B、int32 4 B、bool 1 B、ref 8 B。

**并林相（pass-1）实际依赖（已核）**：`CompilerCsgStreamTypeArenaFromDeclarationIndexInto`（现 `:35690-36193`）里对 contexts 的接收者限定读点只有 **`[0].buildIndex`** —— `:35748`（循环前读句柄）与 `:35878`（循环内逐源 `TypedExprBuildIndexAppendSourceCallDeclarationsManual`）。**其余 67 个字段在并林循环里零读点。**

**为什么没有交出"逐字段最后读点表"（如实报）**：按字段名 grep 会串类型 —— 例如 `importcFunctions`/`lines`/`scopes` 这些名字在 `NormalizedExprCallProfile` 等**别的类型上同名**，命中行号与实际相位无关（实测 `importcFunctions` 的最大命中在 `:4548`，那根本不是 context 的字段）。加接收者限定（`ctx.` / `contexts[…]` / `work.typedMetadataContexts[…]`）后，绝大多数字段的"循环后读点"为**空**，但这不可信：expr 层与 typed-IR 相是通过**别的函数**（`CompilerCsgConsumeExprSliceIntoTypedFacts`、`CompilerCsgSemanticAppendSourceExprSlices`、`compilerCsgBuildExprCallProfileSourcesRec`、`compilerCsgBuildTypedIrReachRound*`）整体转交数组的，字段级访问发生在被调方，grep 追不到调用图。**⇒ 68 字段的"最后读点"静态做不干净；不做假表。**

**替代方案（E1g，已交付）**：把"哪个字段还活着"改成**实测每个 context 的每个 seq 字段的 `len`**，在三个相边界各打一遍：

| 边界 | 锚点（`compiler_csg.cheng`） | 新行 | 落在哪一相 |
|---|---|---|---|
| `metadata_built` | 紧跟 `compilerCsgMemTraceEmit("metadata_contexts_built")` | 39430 | metadata 相末（+150,995,040 B 刚形成） |
| `after_expr_layer` | 紧跟 `CompilerCsgTraceStage("after_expr_layer_and_symbols")` | 39530 | expr 层相末 |
| `pre_release` | 紧贴 `TypedExprClearSourceContextAllFields(...)` 之前 | 36652 | 收尾相（`:40265` 调用链上） |

**判读**：三条边界上逐字段 len 相减 ⇒ 直接得到"在 expr 层之后仍非零、却在 `pre_release` 仍非零"的字段 = **必须留到最后的字段**；"在 `after_expr_layer` 已归零/未增长"的字段 = **可提前释放的候选**。用实测取代静态推演，且不用碰调用图。

- **补丁**：`docs/campaigns/2026-08-31-kernel-userpath/patches/e1g_ctx_census_probe.patch`
  **冻结副本**：`.rebuild/s1b_step3/r9/patchgen/e1g_ctx_census_probe.frozen.patch`（`cmp` 字节相同）
  **sha256（两件同值）**：`0ed1c49b50f28a4801ff9010f1a90ac633e7f0336a9c51bc1a936f7f6914fac0`
  **`git apply --check`（基线 = 当前树）**：rc=0（4 hunk：1 在 `typed_expr.cheng`，3 在 `compiler_csg.cheng`）。
  accessor `TypedExprSourceContextFieldCensusTrace(ctx: TypedExprSourceContext, stage: str, sourceIndex: int32)`，**`@borrows`**、门控 `CHENG_CTX_CENSUS_TRACE`、只读 `len` 与标量、关开关零输出；**39 个 seq 字段逐列名打全**，另 22 个标量一行。

**释放形态建议（待 E1g 读数确认后才动手，不先落树）**：优先复用 `CompilerCsgCompactProfilesForFixedPoint`（`:1815-1823`）那种**压缩而非直接释放**的形态（切掉后续不再读的载荷、保留按需重建的句柄），而不是逐字段清空 —— 后者会破坏 expr 层/typed-IR 的按需读取。

## 13. `G(k)` 系数（两窗口，**仍未钉死**）

| 窗口 | 并林相起点 | 末读数 | 源数 | `G` 系数 |
|---|---|---|---|---|
| r34（抬门 1.288 GB） | `forest_appended src=0` = 722,093,184 | 1,228,375,528 @src=60 | 60 | **≈ 8.44 MB/源** |
| r35（抬门，约束卡 §3 已录） | 同口径 ≈ 722,093,184 | **2,550,991,248 @158** | 158 | **≈ 11.58 MB/源** |

⇒ `G ≈ 8.4 → 11.6 MB/源`，**在两窗口之间还在上升 ⇒ 未收敛、未钉死**。按约束卡 §2.6 的全量外推：`722 MB + 234 × 11.58 MB ≈ 3.4 GB` ⇒ **外推超门 4.2×，按卡即缺陷**，不是"接近达标"。

**钉死 `G(k)` 需要的读数**（两项，缺一不可）：
1. **E1f**（`e1f_buildindex_lens_probe.patch`，sha `53da8884…`）的逐源 `pre_append`/`post_append` 63 列 len ⇒ 判定 `G(k)` 是否等于 `buildIndex` 的列增长（对应约束卡 §2.6 要求的"238 源全量外推值 + 落在哪个模型项"）；
2. **E1f 的 `loop_entry`** 给循环入口基线，与 r34/r35 的轨迹点对齐，才能把 `G(k)` 与"每源 `T(k)` 瞬时"分开（`d_live` 与 `rss` 不同口径，见 §口径澄清）。

### 实验 E2（二选一定死 B 段归属）——**已落地并判读完毕**

- **补丁**：`docs/campaigns/2026-08-31-kernel-userpath/patches/e2_stage_boundary_probe.patch`
  **冻结副本**：`.rebuild/s1b_step3/r9/patchgen/e2_stage_boundary_probe.frozen.patch`（`cmp` 字节相同，两件 sha256 同值）
  **sha256**：`c5d4900942123b6edf3bac3de63972d2cbefd10619f900d19ead66f4e8dd54da`
  **`git apply --check`（基线 = 当前工作树）**：`Checking patch src/core/tooling/compiler_csg.cheng...` rc=0。
  内容：`compiler_csg.cheng` 第 35679 行后插 `p1_arena_reserved`、第 35698 行后插 `p1_ctx_index_built`，各 2 行；复用既有门控 `if compilerCsgMemTrace:`（变量 `:1607`，env `CHENG_CSG_MEM_TRACE` `:1616`，发射器定义 `:1619-1622`）与既有埋点同形（对照 `:35663-35665`）；不新增开关、不改语义、无额外输出。
- **判读（只看同一次运行内两锚之差）**：跳跃落在 `ta_limits → p1_arena_reserved` ⇒ B 段 = B1（TypeArena 预留）；落在 `p1_arena_reserved → p1_ctx_index_built` ⇒ B 段 = B2（`TypedExprBuildIndex`）。
- **实测判读结果（r14，`kd_r14`，load 6.16 / free 26,713 页，守卫仍触发 ⇒ 缺口是真的）**：**两支都有份，不是二选一**。
  `after_profile_source_payload_release` 618,922,968 → `forest_build_done` 728,056,888（**A 段 +109,133,920**）→ `p1_arena_reserved` 767,231,104（**B1 +39,174,216**）→ `p1_ctx_index_built` 795,002,008（**B2 +27,770,904**）→ 守卫 837,141,704（门 805,306,368，超 31,835,336，触发时正在解析 `src/std/times.cheng`）。
  ⇒ 本文件 §3 B 段表的 B1/B2 两行由"候选"升为"实测并列持有者"，B 段不再有未定位成分。

---

## 7. 可回收量与依据

| 排名 | 块 | 大小 | 依据 | 可回收性 |
|---|---|---|---|---|
| 1 | A 段 pass0 逐源残留 | **95,109,240 B** | 同窗口两锚 RSS 差；`live` +1,773,279；三窗口 live/token 稳定在 0.4884–0.4889；本段持久容器合计 < 0.3 MB | **可回收**（无持有者）；但须先过 E1 确认机制后才可记账 |
| 2 | TypeArena pin 余量（进 pass=1 时刻） | **8,656,640 B** = 94,764,948（算）− 86,108,308（实测 `ta_stream src=0`） | 两边都是本窗口同驱动的读数/复算 | 部分是 `ResidualColumnBytes` 的**预留预算**，seal 相会吃掉 ⇒ 不是净可回收（须等 T3） |
| 3 | pass0 逐源瞬时 tree 的 doubling 死区 | ≤ 140,603,200 B（峰值即上限） | `forest_parse_end pass=0 src=134 arena=140603200`；`arena.cheng:373-397` 弃块语义 | 峰值型、非常驻；治它要在 pass0 也用 census（当前是鸡蛋问题，`:33145-33149`） |

**结论**：**最大一块可回收 = 95,109,240 B（本窗 59%），按 pass0 残留计**。这是一块**没有持有者**的内存 —— 修法不是"找个容器提前释放"，而是修 `ParserValueExprTreeRelease` 路径上不回退的那部分（`parser.cheng:10217-10241` / `seqs.cheng:77-82`），或让 pass0 根本不产生它（pass0 与 pass1 目前把同一份文本解析了两遍，见 `:33187` 与 `:35767`）。

---

## 8. 口径声明

- 本文件所有 RSS 均出自 `.rebuild/s1b_step3/gate/r11b.stderr.txt` 单窗口；§4 已实测证明跨窗口不可比，任何跨窗口相减都是错的。
- `live`（`system.MemLiveAllocations()`，`compiler_csg.cheng:1622`）是分配计数，不是字节数；用它比较**条数**，用 RSS 比较**字节**，两者在本窗口互相印证（53.6 B/个）。
- 本文件不含任何"未测当 0"的结论；T1–T5 标为未测的项一律未参与第 7 节的可回收量计算（第 7 节第 2、3 行已标注其不成立的前提）。
