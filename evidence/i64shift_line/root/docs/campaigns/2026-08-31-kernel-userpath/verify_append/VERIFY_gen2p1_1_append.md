# VERIFY_gen2p1_1_append —— [GEN2-P1] 汇点清单实体化（checkpoint 1，设计段零代码）：森林汇字节反证+边界图，typedIr 汇锁定 frontier 缓存逐波释放为首个可证切面

date_utc=2026-09-06 · 代理=GEN2-P1 线（接棒 GEN2-WAVE2）· 克隆=/Users/lbcheng/cheng-f24/anchor_clones/gen2p1（进场态=主树工作树全量副本 `cp -cR`，/usr/bin/diff -rq src 与主树全等）· 克隆基线：git HEAD=73debaef，含 gen2wave2_1 type 工作集刀合入态 · 主树零代码改动（本文件=唯一写入）

## 结论先行

**P1 结构线 checkpoint 1 定谳：①parser forest 汇点（knife1 516s 相）经逐结构核账给出字节恒等反证——合并森林的行空间+intern 首见序是 TypeArena/projection 的行号承重墙，逐源流式消费在现 realizer/parser 语义下字节不安全或内存中性，按止损条款交边界图+演进需求清单，不硬改；②typedIr 逐源循环汇点（knife2 3398s 死点相）经全汇点排查，锁定 `work.frontierParsedSources`（逐源全量 exprLayer+解析树+行索引列缓存，单调累积、跨全 fixed point 驻留）为首个可证增量切面：它是纯 memo（命中/未命中逐字节同值），逐波边界整体释放把活集从「全闭包已扫描源」降为「单波 frontier 工作集」，不需要 wall102 三件套（无行重映射、无预铸造、snapshot 已是确定性重建权威），墙102 重型机械仅森林汇需要。**

## 一、克隆基线与进场态

- 主树 HEAD=73debaef；工作树含在途 hunks（其他线在途态全量副本）；`cp -cR` 克隆（fsmonitor socket 报错为预期噪声），`/usr/bin/diff -rq` 主树 vs 克隆 src 全等（rc=0）。
- 现役认证驱动链：gen2wave_1 配对产物 0be3b00b → wave2 刀后配对产物 **2dc66c2c**（gate 4/4 rc=0，VERIFY_gen2wave2_1）。本线配对烤机车头沿用 `/tmp/oob_ab/cheng_w126`（sha 0f198c5e，wave2 同配方），交付时以实际配对轮记录为准。

## 二、死点相 A：parser forest 汇点实体化（反证+边界）

### 2.1 持有/消费/terminal 清单

| 结构 | 谁持有 | 谁消费 | terminal |
|---|---|---|---|
| `work.typeArenaParserForest: ParserValueExprTree`（arena+internPool+全部行列） | compiler_csg working set，38507 `CompilerCsgBuildParserForestAuthorityInto` 逐源 parse+`ParserValueExprTreeAppendFrom` 合并 | ①38518 `TypedExprBuildSourceContextExactIndexWithManualAuthority`（结构消费）；②38530 reachable 初始扫描期间存续；③38650 逐源循环 `CompilerCsgParserReceiptObserveSourceTree/Exact`（仅 `producerSourceCount` 覆盖校验，33161/33168 实证，非结构读）；④38677 `CompilerCsgTypeArenaFinalizeParserForestInto` → import authority（全 profiles）→ 分辨 authority（`TypedExprTypeResolutionAuthorityBuildPackageForestInto` 全森林走 typeSyntax 行序）→ `TypedExprTypeArenaBuildFromParserTreeInto`（arena 行空间=森林行空间 1:1 镜像）→ 35459 整树释放 | TypeArena 产出（typedIr bind/seal 下游） |
| 合并森林 intern 池 | 森林本体 | AppendFrom 逐节点 `langintern.Intern(CloneStrRange)`（knife1 516s 热链）；arena Fill 系首见序 intern | TypeArena 产出 |

### 2.2 字节恒等反证（为何逐源流式不可为首刀）

1. **行空间镜像**：`TypedExprTypeArenaBuildFromParserTreeInto` 的 arena 行数=森林行数（`tokenCount/typeSyntaxCount/functionCount/genericSymbolCount/bracketArgCount` 直拷树计数），arena 行号承重于合并森林的「逐源 concat 行序」（AppendFrom 偏移堆叠即 concat）。逐源消费必须保证「全局 walk 序=concat 序」，此点可行；但——
2. **intern/TypeId 首见序**：arena Fill 系是**分相全森林**遍历（FillTokens→FillTypeSyntax→FillFunctions→…），intern 首见序=「相×源」交织序；逐源全相流式的 intern 首见序=「源×相」交织序，二者不同。arena 行内容含 intern 派生 id 列（scopes.nameIds 等），projection/compact canonical index/digest 消费这些 id（typed_expr.cheng 44016-44040 系）——交织序改变 ⇒ id 漂移 ⇒ 字节漂移，除非证明「所有序敏感 id 在 canonical projection 处按行序重正化」。该证明面=typed_expr_type_arena+typed_expr 千行级语义审计，非本线可证。
3. **退路同样是反证**：保 intern 序的唯一字节安全流式=「分相×逐源」外内循环，则每棵树必须活到最后一个相 ⇒ 峰值=合并森林本体 ⇒ 零内存收益；唯一真实收益（消 AppendFrom 双份物化+re-intern）需要 parser **parse-into-forest**（解析直写合并行空间），而 parser.cheng=PHASEB-PARSER 零接触。

### 2.3 边界图（移交材料）

- **可增量**：无（现语义下森林汇无可证增量切面）。
- **必须演进**（独立立项，非本线）：①parser parse-into-forest 流式解析（parser.cheng，消双份物化，CPU+内存双收益，knife1 516s 相的主解）；②序敏感 id 内容化/行序重正化证明（typearena+projection，解锁逐源流式 TypeArena 产出）。前置验证=先落 ② 的重正化证明或改造，再动 ①。
- 墙102 三件套与森林汇的对应：确定性预铸造+row 空间显式重映射在 AppendFromImpl 内**已存在**（nodeOffset/declarationOffset 偏移重排+sourceId re-intern 即 append 期行重映射），缺的不是重映射层而是 intern 序自由度。

## 三、死点相 B：typedIr 逐源循环汇点实体化（F1 切面立项）

### 3.1 fixed point 全汇点清单（38782-39205 区域逐结构核账）

| 结构 | 谁持有 | 谁消费 | terminal | per-entry 可行性 |
|---|---|---|---|---|
| `typedIr` 行+sealed metadata session（compact canonical index+projection+derived index） | typedIr | 每轮 facts/append；后端 lowering | 是（产物） | 否（terminal 即墙） |
| `exprCallProfiles`（compact 后 decls/边/调用名） | working set | 每轮 frontier 重建 `compilerCsgExprLayerForFrontierFunctionsImpl`(37617) | fixed point 末（39059 释放） | **否**——可达闭包数据因果：任意源可入后续 frontier（wave1 §1.2 封墙论据逐字适用） |
| `lineStore`+`lineInternPool`+行号列 | working set（PhaseArena，七条②） | 元数据相(36544)+初始/增量 reachable 行扫描(25334，`reachScan*` 簿记跨轮复用，38526-38528 注释明证) | 39063 | **否**——新达函数再扫描数据因果需行表 |
| `sourceSnapshots`/`typedSourceTexts` | working set | 每轮 `CompilerCsgRestoreTypedSourceTextBody`(37802)+frontier 文本校验 | 39042-39047 | **否**——同上数据因果 |
| `parserNormalizedExprReceiptAccumulator.sourceSidecars` | accumulator | 39101 finalize+39084 adjacency | finalize | 契约级（observe/verify/finalize 全集语义），列边界项非首刀 |
| **`work.frontierParsedSources`** | working set（38865 才释放） | `Ensure`/`FunctionLayerBorrow`（30836）：每轮 frontier 逐源全量解析层+解析树+行/行号索引列+structuredFacts；37613 前被 activeFunctionSourceSlices/exprLayer 借树 | **非 terminal——纯 memo** | **是（F1）**：命中/未命中逐字节同值（未命中=从 immutable snapshot 确定性重解析） |

### 3.2 F1 切面设计：frontier 缓存逐波（per-round）整体释放

- **机制**：新增 `CompilerCsgFrontierParsedSourceStoreEvictAll`（prepared 域内逐源 TerminalRelease+structuredFactsReset+present=false+行计数清零，平铺索引列 `exactExprLineStarts/exactExprRowIndexes` 整列重绑空；出借树租未平即 panic=Let it crash）；调用点唯一：`compilerCsgBuildTypedIrReachRoundPrepare` 内 `CompilerCsgBuildWorkingSetReleaseActiveFunctionSourceSlices(work)`(37613) 之后、`compilerCsgExprLayerForFrontierFunctionsImpl`(37614) 之前。该点是全轮次唯一咽喉：exprLayer 已 Reset(37545，租约已平，2916-2946 实证)、上轮 slices 已释放（树借主）→ 无未平租约。
- **粒度论证**：entry=波（round）而非单源——单源缓存树被本波 functionSlices 借用（31303 注释+30867 borrow lease）直至波末 slices 释放，单源中途释放违反租约语义；波界整体释放即语义允许的最细粒度。
- **活集位移**：缓存从「全闭包已扫描源」（239 源全量 exprLayer+树+索引列，随可达闭包增长单调上升=knife2 包络主因子之一）降为「单波 frontier 工作集」（batch 上限内源数），波间不再累积。

### 3.3 字节恒等论证（F1）

1. **同值性**：未命中路径从 `sourceSnapshots`（immutable 唯一文本权威）经 `CompilerCsgParseExactFullSourceLayer` 确定性解析（配对烤机已实证 parser 全局确定性）；产出层与缓存命中路径的层**逐字节同值**（同一输入文本+同一 compactView 查找表→同一行序同内容）。
2. **纯 memo**：Ensure 的 hit/miss 仅影响 `buildCount/hitCount/acquireCount` 计数（消费点=38863 `CompilerCsgDebugLine`，`compilerCsgTraceStderr` 门控 stderr，不进烤机报告键集合）与 staging ledger `parserCacheScratchBytes`（3874-3928 实证 ledger 仅做非负/自洽校验与峰值记录，无绝对值门、不进 report 序列化区 40300-40800、不驱动输出分叉）。
3. **行/分配序**：波内重建序=原命中序（同一 frontier 函数序、同一逐源序），facts/typedIr 行序不变；分配地址身份不进产物字节（既有配对确定性先例）。
4. **平铺索引列**：evict 后整列重绑空，Ensure miss 路径(30814-30826)重算偏移并追加，偏移自洽校验(30732-30758)覆盖。
5. **租约安全**：evict 点前 exprLayer Reset(37545→parser 2940-2946 平租)与 slices Release(37613)已闭合全部树租；若有遗漏，TerminalRelease 内租计数 panic 暴露（不静默）。
⇒ 字节铁门=配对烤机 ×2 sha EQ + 与刀前基线同配方的第 3 轮对照（三方 sha 同判）。

### 3.4 wall102 三件套对照（本切面不需要）

- 确定性预铸造：无行铸造序变化（memo 不改分配序进字节的部分）。
- row 空间显式重映射：无行号重排（森林汇才需要，见 §2.3）。
- isolated snapshot+确定性发布：**已具备**——immutable snapshot 即重建权威，重解析即确定性发布；本切面是既有机制的消费侧增量化，不是新快照切面。

## 四、验收链（F1 交付门）

| 门 | 判据 |
|---|---|
| 配对烤机 ×2 | 同名 --out sha256 相等（全冷禁缓存，bake_win 串行锁） |
| 字节铁门对照 | 刀前克隆基线轮与刀后轮同配方三方 sha 同判（刀不改变产物字节） |
| gen2 探针长烤 3600s | 死点 wall/ps-rss/footprint 三口径位移记录，双口径+环境因子标注 |
| 四夹具门 | `tools/user_path_gate.sh` 4/4 rc=0 判词逐字一致 |
| 报告契约 | bake report 键集合零漂移（计时类字段允许漂移并标注） |
|GEN2 rc=0|如达即接 GEN3 固定点；不达如实记录活集位移量并交下一汇点|

## 五、纪律记录

- 本段零代码：克隆 src 未动（收工前复验 diff 全等）；主树唯一写入=本文件。
- parser.cheng/backend 门面/PHASEB-PARSER 与 R2-C-FAMILIES 领地零接触；compiler_csg.cheng 本段仅读未改。
- 无 heredoc；比对一律 /usr/bin/diff 或 cmp；结论基于逐函数读码（行号均为克隆时点实测）。
