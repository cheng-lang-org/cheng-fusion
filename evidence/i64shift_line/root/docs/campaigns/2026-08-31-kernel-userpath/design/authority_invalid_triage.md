# authority invalid（invalid appended forest）根因定性

- 锚定时刻 HEAD：`91c300697c0dad51f8438a63c8ae721455a6f23c`（下文所有 `文件:行` 均以该 sha 为准，逐条用 `grep -F 点名符号` 复核过）
- 报错入口：`src/tests/did_subscribe_smoke.cheng`（37 源，M3）
- 判定范围：只做定位与判词，未改任何 `src/**`；本节所有"实测"均标注生成侧 rc 与产物来源

---

## ① 结论先行

**判词：消费者/索引侧缺陷——判重 map 的 key 只有 `(spanStart, spanEnd)` 字节偏移，缺 producer（源）维度；森林合并后跨源同 span 被误判为"同源重复声明"，fail-closed panic。生产者填的 authority 合法，不是漏填。置信度：高。**

一句话机理：`span` 是**源内字节偏移**，append 时原样拷贝（不加 offset，设计如此）；合并树上"该 span 的唯一性"被当作"该 authority 合法"的证明，于是两个不同文件里字节偏移恰好相同的声明互相冒充，`count==2≠1` → panic。报错行属于**行序在前**的那个源，与"第几次 append 触发"无关，这也是 M3 报 `producer=8` 却在第 19 次 append（src=18）才炸的原因。

补充硬事实：**同一缺陷本仓 2026-09-05 的 wall154 线已定性并写出补丁（`VERIFY_w154_append.md`，2026-09-08 由 `765080522` 随文档入库），但该补丁从未进入任何 commit，HEAD 树中不存在**（见 ④）。

---

## ② 检查点代码与判据原文

### 判词落点

| 内容 | 锚点（HEAD=91c300697） |
|---|---|
| 报错文本 `parser forwarding production: authority invalid row=…` | `src/core/lang/parser.cheng:9180`（Fmt 行） |
| 外层包装 `parser forwarding production: invalid appended forest: {structuralErr}` | `src/core/lang/parser.cheng:11908-11910`（`ParserValueExprTreeAppendFromImpl` 内，对合并树 `out` 调用校验器） |
| 校验器 | `ParserValueExprTreeForwardingProductionsStrictValidateInto` @ `src/core/lang/parser.cheng:8897` |
| 判据函数 | `parserForwardingProductionAuthorityTargetValid` @ `src/core/lang/parser.cheng:8271-8533` |
| 行号/边界前置门 | `parserForwardingProductionAuthorityRowValid` @ `src/core/lang/parser.cheng:7958` |
| `expected_auth` 计算 | `parserForwardingProductionExpectedAuthorityKind` @ `src/core/lang/parser.cheng:8238-8255` |

调用链：`compiler_csg.cheng:33162 ParserValueExprTreeAppendFrom(out, sourceTree)` → `parser.cheng:10222 ParserValueExprTreeAppendFromImpl` → 每 append 一次全树重校验（`parser.cheng:11890-11913`）→ `8897` 校验器 → `9160` 调 `AuthorityTargetValid` → `9180` 落判词。

### 各字段来源（`parser.cheng:9059-9094` 的逐行循环）

- `row`：合并树 forwardingProduction 行号（`0..<tree.forwardingProductionCount`）
- `kind`=`forwardingProductionKinds[row]`；`arm`=`forwardingProductionArmIndexes[row]`
- `owner`=`forwardingProductionOwnerRows[row]`
- `span`=`forwardingProductionSpanStarts/Ends[row]`（**源内字节偏移，append 时原样拷贝**，见 ③）
- `source_local`=`forwardingProductionSourceLocalRows[row]`（源内行号）
- `producer`=`forwardingProductionProducerSourceIndexes[row]`（append 顺序 = `sourcePaths` 下标，见 ③）
- `auth_kind`=`ParserForwardingProductionChildKind(forwardingProductionAuthorityKinds[row])`（`9151-9155`）
- `auth_row`=`forwardingProductionAuthorityRows[row]`（append 时按 kind 做 row rebase，`11816-11831`）
- `expected_auth`=`parserForwardingProductionExpectedAuthorityKind(kind, armIndex)`（诊断专用，见下）

枚举定义：`ParserForwardingProductionKind`（`517-526`，`5=StatementCore`）、`ParserForwardingProductionChildKind`（`527-538`，`0=Invalid,3=StatementRoot,5=Token,6=Declaration,7=Pattern,9=LexicalScope`）。

### 本实例命中的判据原文（`parser.cheng:8292-8293` + `8505-8524`）

```
let bindingDeclaration =
    kind == ParserForwardingProductionStatementCore && armIndex == 0
...
        if bindingDeclaration:
            if regionKind != ParserValueExprRegionPattern ||
               regionSpanStart < spanStart || regionSpanEnd > spanEnd ||
               ParserValueExprFindTopLevelKind(
                   tree,
                   spanStartToken,
                   spanEndToken + 1,
                   ParserValueTokenAssign) >= 0:
                return false
            let declarationCount = hashmaps.HashMapPtrIntGetEx(
                declarationLocalCounts,
                parserForwardingProductionAuthoritySpanKey(
                    spanStart, spanEnd),
                found)
            let exactPatternCount = hashmaps.HashMapPtrIntGetEx(
                patternOwnerRegionCounts,
                parserForwardingProductionAuthoritySpanKey(
                    regionSpanStart, regionSpanEnd),
                found)
            return declarationCount > 0 && exactPatternCount == 1
```

判重 map 的构建（**key 只有 span，无 producer**）：

- `patternOwnerRegionCounts` @ `parser.cheng:8965-8966` 初始化，`9034-9057` 填充，key = `parserForwardingProductionAuthoritySpanKey(spanStart, spanEnd)` = `(Int64(start)<<32)|Int64(end)`（`8258-8261`）
- 同族同样只有 span 维度的还有：`declarationLocalCounts/declarationTypeCounts/declarationFunctionCounts/declarationConceptCounts/declarationTraitCounts`（`8976-9002`）、`lexicalScopeBlockCounts`（`9014-9033`）
- 唯一不受影响的是 `statementRootRoleCounts`（key=(role, anchorToken)，anchorToken 在 append 时已 rebase 进合并空间，天然全树唯一）

## ③ 字段来源与生产侧代码

### 生产侧（谁填 authority 行）

| 环节 | 锚点 |
|---|---|
| StatementCore 生产 + authority 选择 | `parserValueExprProcessStatementCoreRangeWithTypeOwner` @ `src/core/lang/parser.cheng:24561`，选择段 `25421-25529` |
| arm0 先找 StatementRoot | `25455-25474`（`expectedRoleA=BindingInitializer`、`expectedRoleB=AssignmentRhs`、`anchorRequired=true`，锚点=`FindTopLevelKind(coreStart,tokenLimit,Assign)`） |
| arm0 回落 Pattern authority | `25475-25501`（注释原文：`Binding without a binding-initializer statement root: fall back to the pattern authority (validator accepts either form).`） |
| authority 落列 | `parserForwardingProductionFinish` @ `7917-7955` |
| Pattern region 的生产 | `ParserValueExprProcessBindingEntryRange` @ `23653`，region 追加在 `23674-23681`：`start=TokenStartAt(tokenStart)`、`end=TokenEndAt(patternLimit-1)`，`patternLimit=顶层=`=`号 token，否则=tokenLimit` |
| `let/var` 语句派发（注意 `tokenStart=first+1`，即跳过关键字） | `25043-25050` |
| append/合并（span 不加 offset，authority row 做 rebase） | `10222-10293`（`sourceOffset = out.producerSourceCount` @ `10270`）、`11722-11831`、`11890-11913` |
| 逐源 loop + 每源断言 `producerSourceCount==1` | `src/core/tooling/compiler_csg.cheng:33093-33168`（append @ `33162`，`forest_appended src=` 埋点 @ `33167`；两趟 merge：pass0 只测量不 append，pass1 才 append） |

### 判定

- **不是生产者漏填**：`var writeErr: str`（无初始化器）在源内确实有 Local 声明行（`declarationLocalCounts[(19695,19712)]>0` 成立）且 Pattern region 唯一；生产者在无法找到 BindingInitializer/AssignmentRhs 语句根时按 `25477-25479` 注释明文的契约回落 Pattern，是设计内路径。
- **是索引/映射失效（key 域错误）**：`(start,end)` 只在**单个源内**是身份；合并后不同源的同 span 行落进同一个桶。校验器把"全树唯一"当作合法性证明，而正确的不变式是"**同源**唯一"。

### 本实例的撞车对（两处，均由"源大小唯一"定位，见 ⑦）

| 实例 | 失败行所属源（producer） | 撞车源 | 同一 span 的声明 |
|---|---|---|---|
| M3（37 源） | `src/core/tooling/path.cheng`（48,950B，producer 8），row=5279，span=19695:19712 | `src/std/crypto/ed25519/ref10.cheng`（52,566B，producer 18） | A: `    var writeErr: str`（path.cheng:635，无 `=`）<br>B: `    var carry1: int64 = ashr64(...)`（ref10.cheng:703）<br>→ 两者 Pattern region span 同为 **(19699,19712)**（`writeErr`/`carry1` 起点 19699；`str`/`int64` 终点均 19712） |
| 全量 234 源 | `src/core/backend/elf_riscv64_linker.cheng`（42,339B，producer 40），row=91185，span=26254:26272 | `src/core/analysis/exact_def_call_authority.cheng` | A: `                var foundDef: bool`（elf_riscv64_linker.cheng:694，无 `=`）<br>B: `        let projectionKind = op.kind == ...`（exact_def_call_authority.cheng:482）<br>→ 两者 Pattern region span 同为 **(26258,26272)** |

**为什么 M3 报 `producer=8` 而炸在第 19 次 append**：校验器按 `row` 升序遍历全树。ref10（producer 18）append 进来后把 `patternOwnerRegionCounts[(…)]` 从 1 抬到 2，而**行序更靠前**的 path.cheng 那一行（row=5279）先被检查到 → 报的是它。全量那条则相反：撞车源（exact_def_call_authority）早就在树里，新 append 的 40 号源自己的行当场撞死。

**排除项**：`span` 的拷贝、authority row 的 rebase、`producer` 索引映射本身都正确（`11744-11831` 逐列核对；`sourceOffset=out.producerSourceCount` 且每源 `producerSourceCount==1`，故 producer 序号 ≡ append 序）；不存在"某轮次后偏移算错"的问题。

## ④ 与近期提交的关系（判词：pre-existing）

git 证据（均在 HEAD=91c300697 上执行）：

| 证据 | 命令 / 结果 |
|---|---|
| 判据分支与 `expected_auth` helper 的引入提交 | `git log -S "parserForwardingProductionExpectedAuthorityKind" -- src/core/lang/parser.cheng` → 唯一命中 **`50d1ffeeb`（2026-08-22 16:10:37）**；`git rev-list --count 50d1ffeeb..HEAD` = **329** |
| 判据行 blame | `git blame -L 8488,8533` → `87f2f2e57d`(2026-08-09, 分支骨架) + `50d1ffeeb`(2026-08-22, `bindingDeclaration` 子分支/`declarationCount>0 && exactPatternCount==1`/三个 span-keyed map) |
| 判重 map 构建 blame | `git blame -L 9034,9057`（pattern 域）、`8944,8966`（map 初始化）→ 全部 `50d1ffeeb` |
| 生产侧 blame | `git blame -L 25455,25501`（arm0 回落 Pattern）→ 全部 `50d1ffeeb`；`git blame -L 9151,9182`（检查点与判词）→ `87f2f2e57d` / `50d1ffeeb` |
| 报错文本更早存在 | `git log -S "invalid appended forest" -- src/core/lang/parser.cheng` → `f681cad2b`(2026-07-24 初版) / `a7ee2da19`(2026-07-26)；`git log -S "authority invalid row=3" -- findings.md` → `50d1ffeeb`(2026-08-22，即同一判词当日已入库)；`progress.md` wall37 同族记录由 `f955a3e2a`(2026-08-29) 入库 |
| 三个被点名提交的落点 | `f92f573f2`(2026-09-10 19:47:36) 只碰 `typed_expr_type_arena.cheng`/`compiler_csg.cheng`/rsi/docs；`43e12c322`(21:59:25) 只碰 `compiler_csg.cheng`（埋点位移 9 行）；`f8f4ab66c`(2026-09-11 00:02:47) 只碰 `primary_object_plan.cheng` + 一个 tsv。**三者均未触碰 `src/core/lang/parser.cheng`** |
| 反证实测 | 用**烤制于 2026-09-10 18:27 的驱动 `.rebuild/run_health/kd`**（早于 `f92f573f2` 提交时刻 19:47:36）跑同一入口：判词与 `producer=8` 驱动**逐字节同**（见 ⑤） |

**判词：pre-existing。** 该检查与生产侧代码早于上述三个提交 16–19 天，且被点名提交没有任何一行落在 parser.cheng 上；跨驱动实测也复现同一判词。唯一保留项：`.rebuild/run_health/kd` 的报告只有 `source_snapshot_root_cid=07fd3d42…`，无法用哈希钉到 commit，若 18:27 时工作树已含 S1a WIP 则不能 100% 排除，但 blame 证据独立成立。

**同族已知案例（重要）**：`docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_w154_append.md`（2026-09-08 由 `765080522` 入库）§任务2 已把 arm=19（`auth_kind=6=Declaration`）的同一现象定性为 **"缺口机制（span 判重 key 无源维度）"**，并给出"同源唯一 + 同源硬臂"的补丁设计；该文件同时记录补丁已在一台自烤驱动（`31a3dc23…`）上通过 4 夹具。但：

- `grep -c "declarationNextInSpan\|patternNextInSpan\|lexicalScopeNextInSpan" src/core/lang/parser.cheng` = **0**
- `grep -n "producerSourcePaths" src/core/lang/parser.cheng` = **0 命中**
- `git log --all -S "declarationNextInSpan" -- src/core/lang/parser.cheng` = **空**（从未进入任何 commit）
- 原始补丁 `/tmp/oob_ab/wall154.patch` 已不存在

即：**修复曾在工作树存在并烤机验证过，但从未提交，现已从 HEAD 树消失**。本实例（arm=0 + Pattern）与 wall154（arm=19 + Declaration）是同一根因的两个臂；wall154 的修复方案覆盖 `patternOwnerRegion`/`lexicalScopeBlock`/`declaration×5` 三个域，可直接复用。

## ⑤ 确定性与 producer 相关性实测

协议遵守：每轮 `mkdir .rebuild/COMPILE_SLOT.lock` 原子抢锁，锁内写 `owner.txt`（pid/时间/用途），退出前核对 owner pid 后才释放（`release_slot.sh`）；每轮记录 `lease_hits`（`parent lease unavailable` 计数）与跑后 `pgrep` 残留。三轮 `lease_hits=0`、`guard_hits=0`、跑后无残留进程、锁已释放（`SLOT-FREE`）。

复现命令（与既有 `run_b5/single_run2.sh` 同形，env 一致）：
`kd system-link-exec --root:… --in:…/src/tests/did_subscribe_smoke.cheng --emit:exe --target:arm64-apple-darwin --out:…`
env：`CHENG_CSG_MEM_TRACE=1 CHENG_COMPILER_CSG_STDERR=1 CHENG_NO_CACHE=1 CHENG_ENTRY_CACHE=0 CHENG_DISABLE_COLD_OBJECT_CACHE=1 BACKEND_JOBS=1`，默认门（不设 `CHENG_PARENT_RSS_GUARD`）。

| 轮次 | 驱动 | rc | 墙钟 | forest_parsed / appended | lease_hits | 判词 |
|---|---|---|---|---|---|---|
| run1 | `.rebuild/run_b5/kd`（09-10 21:53） | 1 | 85s | 37 / 18 | 0 | `row=5279 kind=5 arm=0 auth_kind=7 auth_row=506 expected_auth=0 owner=5278 span=19695:19712 source_local=1073 producer=8` |
| run2 | 同上 | 1 | 86s | 37 / 18 | 0 | **逐字节同** |
| run3 | `.rebuild/run_health/kd`（09-10 18:27，pre-S1a） | 1 | 85s | 37 / 18 | 0 | **逐字节同** |

**判词：完全确定性。** `row/owner/producer/auth_row/span/source_local` 一个字段都不漂（三轮全等）；不存在顺序/竞态特征。这也与"数据性错误"相符——是 key 域问题 + 数据里恰好存在同 span 对，不是调度问题。

### producer 数量相关性（Q6）：**证伪"阈值"假设**

- M3：前 **18 次 append 全过**（`forest_appended src=0..17` 均有），panic 发生在第 19 次（`forest src=18` 之后无 appended）——失败行却属于 **producer 8**。若存在"第 N 个生产者"阈值，不可能在第 19 次才炸且报 8。
- 全量：前 **40 次 append 全过**，panic 在第 41 次（`src=40`），失败行属于 **producer 40**。
- 两例 producer 值（8 / 40）等于"**行序上第一个撞车行所属源**"，与门槛无关：M3 是后来的源（18）撞死了先到的行（8），全量是先到的源撞死了当次新行（40）。
- 可证伪的最小结构证据：两例的撞车对都是"两个不同文件在**同一字节偏移**上各有一条声明，且 Pattern region 的 `(start,end)` 逐字节相同"（见 ③ 表）。删掉闭包里任一侧，该实例即不触发（本次未做删源实验，属越权改树，未执行）。

## ⑥ 最小修复建议（只写方案，不落盘）

**方案 A（推荐，等同 wall154 已验证设计）**

1. 三个 span-keyed 判重域（`declaration×5 kind` @ `8976-9002`、`lexicalScopeBlock` @ `9014-9033`、`patternOwnerRegion` @ `9034-9057`）的 key 从"纯 span"改为"**producer + span**"；producer 逐行可得：`ParserValueExprForwardingProductionChildProducerSourceIndexAt(tree, kind, row)` @ `parser.cheng:8024-8064`（已存在，无需新 API）。
2. **同源硬臂**：`AuthorityTargetValid` 的三个分支（Declaration/Pattern/LexicalScope）追加"authority 行的 producer == 该 forwarding production 的 producer"。现实现对"跨源冒充"没有任何检查（fail-open 方向），收窄到同源后必须补上这条，否则修复等于放宽。
3. 唯一性判定从"全树 count==1"改为"**同源 count==1**"；`bindingDeclaration` 里 `declarationCount > 0` 的存在性判定同步收窄（原实现跨源同 span 会误真，属 fail-open，一并修）。
4. `statementRootRoleCounts` 无需改（key 含已 rebase 的 anchorToken，天然全局唯一）。

**key 位宽**：`HashMapPtrInt` 是 int64，`spanStart(32)+spanEnd(32)+producer(16)` 塞不下。可选：① 按 producer 分桶（每个 producer 一张 map，或 `map[producerKey]`→链首）；② 把 span 换成 `(producer 内 arena 行号)` 之类的紧凑身份；③ 沿用 wall154 的"链化 row 链 + 链上按 producer 计数"（`xxxNextInSpan` 平行链）。**不要**用哈希压缩 key——这是完整性判据，哈希碰撞会变成静默 fail-open。

**风险与影响面**

- `parser.cheng` 是自举链前端关键路径，改后必须重烤驱动（C 冷启动 + stage1/2/3 链），并回归四夹具 + M3/M4 + wall152/w154 台账用例。
- 单源语义等价：单源树 producer 恒同，"同源唯一" ≡ "全树唯一"，C 链单编路径与既有夹具行为应零变化（wall154 已在 `31a3dc23…` 驱动上验证过这一点，但那台驱动的源码改动已丢，需重做）。
- 必须回归的已知用例：wall154 的 `elf_riscv64_writer.cheng: fn elfWriteSym` vs `debug_relocatable_object_evidence.cheng: fn debugObjectCStringValid`（跨源同 span 3351:3879）——修复后该处应**不再** panic。
- 影响面：修复会消除一类 fail-closed 误报（森林合并面），不降低对"同源真重复"的拦截；同时补上的同源硬臂是**新增拦截**，理论上有让此前"侥幸通过"的跨源 authority 现形的风险——如果现形，那是真 bug，应单独定位而不是放宽。

**不采用**：删除/放宽该检查（丢 fail-closed）、撞车时 fallback 跳过（仓库纪律禁止）、把 span 改成全树 offset（会破坏 "sourceLocalDeclarationRow is stable across forest append" 的设计）。

## ⑦ 原始证据清单

本轮新生成（全部在 `.rebuild/auth_triage/`，未改任何生产文件）：

| 文件 | 说明 | sha256（stderr 三件） |
|---|---|---|
| `M3_run1_kd.stderr.txt` / `.summary.txt` / `.timeline.txt` | 第 1 轮（HEAD 期驱动 `run_b5/kd`），rc=1/85s | `7c4310e9aceb5b6ec5649782d0e94e9b4b4e6c461ed9d7b20c16a6c1b54f8299` |
| `M3_run2_kd.stderr.txt` / `.summary.txt` / `.timeline.txt` | 第 2 轮（同驱动，确定性）rc=1/86s | `0feb55883addadeb3a8e58525fe423523fbab0db6df862dd1e0f1d4382ce2721` |
| `M3_run3_preS1a.stderr.txt` / `.summary.txt` / `.timeline.txt` | 第 3 轮（pre-S1a 驱动 `run_health/kd`，09-10 18:27）rc=1/85s | `757923078a307ac87806490be31960b06fc5b0c8eb7d242c5dbb54542cdd2d71` |
| `run_case.sh` / `release_slot.sh` / `run_all.sh` | 复跑与槽位协议脚本（抢锁/owner 核对/释放/残留检查） | — |
| `identify_m3_sources.py` / `identify_full_sources.py` | 用日志 `tag=forest src=N bytes=B` 的唯一字节数把 producer 序号映射到文件（37/37 与 234/234 全中，无歧义） | — |
| `verify_closure_multiset.py` | 交叉验证：日志 pass0 的 source 大小多重集 == 本仓 import 闭包大小多重集（37==37、234==234，且闭包内无重复大小） | — |
| `scan_region_collision.py` / `dump_span_windows.py` / `span_windows.txt` | 撞车对静态定位（同偏移、同 region 终点的声明窗口全量转储） | — |
| `inspect_span.py` / `check_order.py` | 失败 span 的逐字节复核、闭包序与编译器序的差异说明（序差异不影响结论：文件身份由唯一字节数定） | — |

外部既有证据：`.rebuild/run_b5/medium/M3_did_subscribe.*`（原始 M3 台账）、`.rebuild/remap_exp/full234/FULL234_raised.*` + `MANIFEST.sha256`（全量 234 源）、`docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_fullgo_0910_append.md:570`（M3 原文）与 `:823`（全量原文）、`verify_append/VERIFY_w154_append.md`（同族既有定性）。

## ⑧ 未解问题

1. **未直接插桩观测 `patternOwnerRegionCounts` 的值**（只读授权，不改 `src/**`）。"失败子判据 = `exactPatternCount==1`"是推断，证据链为：① 该行在第 8 次 append 后仍通过（`forest_appended src=8` 在案），第 19 次 append 时失败；② 该分支内其余判据（regionKind、region⊆span、顶层 `=` 存在性、`declarationCount>0`）都只依赖该行自身源内数据或单调递增；③ 唯一能被"别的源新增行"翻转的是 span-keyed 唯一性计数；④ 静态扫描证明两根源确实存在 region span 完全同构的声明。若后续要闭合，最小探针是在 `9048-9057` 处按 `(spanStart,spanEnd)` 打印 count 分布（属改源码，未做）。
2. `.rebuild/run_health/kd` 无法用哈希绑定到 commit（报告仅有 `source_snapshot_root_cid=07fd3d42…`，与 `run_b5/kd` 的 `b97365e3…` 不同）。"pre-S1a"以烤制时刻 18:27 < `f92f573f2` 提交时刻 19:47:36 为据；若当时工作树已含 S1a 未提交改动则不能排除该驱动已含 S1a。
3. **wall154 补丁为何从工作树消失**（是人为还原、被 `git checkout --` 覆盖，还是共享树 clobber）未追；本仓 `CLAUDE.md` 记录过同类不可逆事故。建议主线程单独确认，因为该补丁正是本缺陷的现成修复。
4. 全量 234 那条的撞车源（`exact_def_call_authority.cheng`）是**静态扫描唯一命中**，但该实例不能用 append 时序像 M3 那样证明"撞车源先已在树中"（失败行与当次 append 同源）。未重跑全量（583s / 抬门 4GiB）验证。
5. 未核实 M4（40 源，rc=2/5s）与本次是否同族；亦未核实 wall37/wall152/wall153 台账里的其他 `authority invalid` 实例是否全部收敛到同一根因。
6. 修复合入后需要重烤驱动才能验证（本轮未做任何编译，仅复用既有驱动）。

## 修复实施与验证

- 执行时刻 HEAD：`9c368085c0f0bb201ec5d5b4420ba6e254035d12`；工作树**不 commit**（修复留树待收割）
- 修复前 `src/core/lang/parser.cheng` sha256：`2902d2e18b45605c3e1096a3cdbe52634c3a095f942411d22ee7eb94ecbb9198`（baseline：该文件工作树 clean）
- 修复后 `src/core/lang/parser.cheng` sha256：`5227482a34192249c0f4b4e762c19d430989452a0991f9882da99646a2321e2a`（收尾复核仍在位）
- patch：`.rebuild/auth_fix/parser_authority_producer_key.patch`，sha256 `f38f4c560c5186dec36ca241d2693f319c75f480ed4ec504bc9e29edea94a98b`；落盘方式 `diff -u` → `git apply --check` → `git apply`（未 `cp` 整文件、未 `checkout/restore/stash`）
- 本文所有 `文件:行` 均在本 HEAD 下重新 `grep` 点名符号核对；改动使 `parser.cheng` 中文档行号整体 +100

### ① 有效证据（默认门内、未越界）

**①-1 烤驱动（C 冷启动重烤）**：`cheng_cold_v3` sha256 `0c765779c8f6abac565be2949a40e6c185678e31dbde247212bc266a231d02cb` → `kd_fix` sha256 `5b21cb1f98fc9cfdc4496eaaf990042723955ebeec8d9e5d73978f76bbdfea55`，rc=0 / 194s / lease_hits=0。对照驱动 `kd_pristine` sha256 `68dad79a983adbf0886a411b29a25cbccc8c4d83accab4b13e3a42a1d8542b13`。

**①-2 不回归 A/B（同 `--in` / 同 `--out`，两侧均本轮新生成，产物先 `rm -f`，rc=0 为前置门）**

| 夹具 | A(kd_pristine) | B(kd_fix) | exe `cmp` | `primary.o` `cmp` |
|---|---|---|---|---|
| `src/tests/ordinary_zero_exit_fixture.cheng` | rc=0 / 144s | rc=0 / 91s | **IDENTICAL** | **IDENTICAL** |
| `src/tests/call_fixture.cheng` | rc=0 / 141s | rc=0 / 94s | **IDENTICAL** | **IDENTICAL** |

B 侧 sha256：ordinary exe `e51224a9cf8165994a706394620cba4a25d5b3ca9c3158aff9599d9b798914f2` / primary.o `7b594c89a24f01f3b7478a103e126f9a9300ac444ed1d4b160fb3556df98b771`；call exe `75eeefa48c9ae7589c6db7fb250cb032d3ecbbff846892778ae804859c46fae4` / primary.o `abaa15ba45982e52505e9559b31c2cd8bf82df4acb261041a1a78344631c83c5`。判词：**默认门内单源编译字节等价，无回归**。

**①-3 小复现（`src/tests/did_subscribe_smoke.cheng`，37 源，默认门、无越界）**

| 轮次 | rc | 墙钟 | forest_parsed / appended | authority invalid 行 | guard_hits |
|---|---|---|---|---|---|
| run1 | 1 | 63s | **37 / 37** | **0** | 0 |
| run2 | 1 | 63s | **37 / 37** | **0** | 0 |
| run3 | 1 | 64s | **37 / 37** | **0** | 0 |
| 对照：修复前 `kd_pristine`（§⑤ 台账，同驱动 sha） | 1 | 85s | 37 / 18 | 1（`row=5279 … producer=8 span=19695:19712`） | 0 |

判词：**authority invalid 误判已消除、并林走完全部 37 源、3/3 轮确定性、默认门内未越界**（guard_hits=0）。rc 仍为 1，死点在**下游、修复前不可达**的阶段：`typed expr: frozen module const query before build-index seal source=/Users/lbcheng/cheng-lang/src/chain/binary_types.cheng name=LsmrDigitMin` —— 与 authority 判据无关，属本任务范围外、只记录不追。

### ② 缺陷发现（诊断/越界，运行状态属病态；不作达标）

**全量 234 源抬门轮（`CHENG_PARENT_RSS_GUARD=1` + `CHENG_PROCESS_MAX_RSS_BYTES=4294967296`，diagnostic）**：`verdict=政策中止（未跑完）`。

| 项 | 实测 |
|---|---|
| 时间盒 | 1800s（30 分钟，按任务口径） |
| 中止时刻 | el=1793s（盒到期后按 pid 中止；非自然结束） |
| `forest_parsed` | **234 / 234**（pass 0 全解析完） |
| `forest_appended` | **61**（旧死点 `producer=40` 已越过：修复前同入口抬门轮 583s 即 `authority invalid` 死在 src=40） |
| `authority_invalid_lines` | **0** |
| peak RSS | **2,302,593,280 B ≈ 2.29 GiB = 理论门 805,306,368 B 的 2.86×（越界、病态）** |
| 零输出窗 | >60s 者 4 段：70s(el302→372)、96s(el412→508)、**236s(el633→869)**、**773s(el1015→1788)**；最后一段进程 99% CPU（非死锁，属病态运行态） |
| 最后一行 | `csg_mem tag=forest src=61 bytes=4490588 rss=2302593280 live=6573627` |
| lease_hits | 0 |

判词：**该轮只用于发现缺陷**——它证明修复让并林越过 `producer=40`（authority 误判确已消除），并暴露合并后段的下一堵墙；**其运行状态超理论门 2.86×，按用户裁定 `65ac999a4` 属病态，不得写成"能跑完/有进展"之类的可用或达标判词**。按指挥方指令中止（非跑完），后续不再追加抬门轮次。

（同轮默认 768MiB 门：脚本在我收到中止指令前已自动起跑，96s 时一并按 pid 中止；`rc=143 / forest 0 行 / 停在 csg_stage=after_sort_sources rss≈161MB`，**已作废不算结果**；默认门内全量并林达标归 S1b 线。）

### ③ 未验证

- **fail-closed 保持（真·同源重复仍被拒）：未取得（pristine 对照侧超时未出；fixed 单侧结果不构成 fail-closed 证据）。**

  判定口径（写死防误读）：**单看 fixed 一侧既不能判"保持"也不能判"过宽"**——只有 "pristine 拒绝 ∧ fixed 拒绝" 才等于"fail-closed 保持（实测）"，"pristine 拒绝 ∧ fixed 接受" 才等于"修复过宽"。

  共五次构造，全部未能把两侧判据同时跑出来：

  | # | 构造 | pristine 侧实测 | fixed 侧实测 | 是否触达判据 |
  |---|---|---|---|---|
  | 1 | `of Red, Green:`（同源两 pattern root 共享同一 CaseArm region） | rc=2 / 0s，`PARSER_BRANCH_WITHOUT_IF` 准入诊断，forest_parsed=0 | 同左（逐字节同） | 否；该族在更早的生产期硬臂 `parser.cheng:25477 panic("parser forwarding production: duplicate match arm pattern root")` 即被拒 |
  | 2 | `for (a, b) in xs:`（同源两 pattern root 共享同一 Pattern region） | rc=2，forest_parsed=1/appended=1（append 校验确实跑了、未触该判据） | 同左 | 否；rc=2 来自 seed 前端 `redundant explicit default init` 准入规则，且该 region 无 forwarding production 查询 |
  | 3 | `var (left, right) = xs`（同源两条 Local 声明同 span） | rc=1，forest_parsed=1/appended=1，`typed expr value definition: compound Pattern exact per-binding TypedExpr projection unavailable` | 同左（同一下游错误） | 否；该域只被 `declarationCount > 0` 存在性判据消费，pre/post 皆不触发 |
  | 4 | 同模块双拼写 import / `--in:` 传两次（"同一份源喂两次"） | rc=2 `import target exact identity unavailable`（import 拼写错：模块身份是 `cheng/tests/…`）；`--in` 两次 rc=2 | 同左 | 否。**结构性证据**：`CompilerCsgAddUniqueSourceModulePair`（`compiler_csg.cheng:26905`）按规范化源路径去重 ⇒ "同一份源被 append 两次"在闭包层不可达（`compiler_csg.cheng:33201` 断言 `producerSourceCount == sourcePaths.len`，producer ≡ 唯一源路径） |
  | 5 | **合成树态** `ug_neg_same_producer_dup.cheng`（同文本 parse 两次 append → 把第二份全部 producer 列改写回 0 并接续 source-local row 序列 → 直接调 `ParserValueExprTreeForwardingProductionsStrictValidateInto`） | **超时未出**：编译 15 分钟仍停在 `csg_mem tag=forest src=2`，按有界等待（≤5min）到点按 pid 9303 杀掉 | rc=1 / 542s，forest_parsed=28/appended=28，`authority_invalid=0`，**测试程序从未运行**——被下游缺陷挡在编译期：`typed expr: frozen module const query before build-index seal source=…/src/std/bytes_layout.cheng name=FixedBytes32Size`（与 ①-3 小复现新死点同族） | **否** |

  过程记录（如实）：本轮首次运行时脚本在 `set -u` 下崩于 `line 57: tag: unbound variable`（`local d="$1" s="$2" tag="$3" out="$NEG/$tag.exe"` 单条多赋值，`$tag` 展开早于赋值）——已拆成独立 `local` 并加 `bash -n` + 变量自检后重跑；第二次运行 fixed 侧 542s 后撞下游墙，pristine 侧超时被有界中止。**固定点：`fail-closed 保持 = 未验证`。**

  支撑性论证（可复核，非实测）：新计数语义是"**同 producer 内、同 span 的行数**"。`producerSourceCount == 1`（一切单源编译）时它与旧全树计数**逐值相同** ⇒ 单源行为不变（①-2 字节等价实测佐证）；同一 producer 内出现两行同 span 时 `count ≥ 2`，判据 `exactPatternCount == 1` / `exactDeclarationCount == 1` 仍拒 ⇒ 同源重复不可能因本修复漏过。**该论证未经端到端实测，按纪律记为"未验证"，不作达标判词。**

  原始件：`.rebuild/auth_fix/negative/`（五次构造两侧 stderr/stdout 全留，含脚本失败与超时记录）。
- **合同冒烟 / 全量 `tools/ci_gate.sh` / GEN2-GEN3 原始字节固定点复验**：**未跑**（需长时槽位，且本轮槽位被 S1b/pool68 竞争；不在本任务判据内）。
- **默认门（768MiB）内全量 234 源并林跑完**：**未达成 / 未验证**（该轮已按指令让位 S1b 线）。

### ④ 读码确认（判重 key 构造 / 消费点 / producer 可得性）

| 内容 | 修复前锚点 | 修复后锚点 |
|---|---|---|
| span-only 判重 key | `parser.cheng:8258 parserForwardingProductionAuthoritySpanKey` | 未改（仍是无损 64 位打包，只当链桶索引） |
| 判据函数 | `parser.cheng:8271 parserForwardingProductionAuthorityTargetValid` | `parser.cheng:8371` |
| arm0 bindingDeclaration 判据 | `parser.cheng:8505-8524` | `parser.cheng:8605-8624` |
| 判重表初始化（8 张 span-keyed 计数表） | `parser.cheng:8951-8966` | `parser.cheng:9070-9082`（3 条链 + 1 张 statementRoot 表） |
| declaration 域填充 | `parser.cheng:8968-9002` | `parser.cheng:9083-9095` |
| lexicalScope(Block) 域填充 | `parser.cheng:9014-9033` | `parser.cheng:9105-9125` |
| patternOwnerRegion 域填充 | `parser.cheng:9034-9057` | `parser.cheng:9126-9152` |
| 校验器 / 每 append 重校验 | `parser.cheng:8897` / `11890-11913` | `parser.cheng:9016` / `11990+` |

**producer/源身份在该作用域内可得（修复形状无需更大）**：校验器行循环内已有 `producerSourceIndex = forwardingProductionProducerSourceIndexes[row]`（修复前 `9059-9063`），只是没传进 `AuthorityTargetValid`；三个判重域的行级 producer 列已存在且 append 时按 `sourceOffset + producerSourceIndex` 正确 rebase（`declarationProducerSourceIndexes` 定义 544 / 单源写 9530 / append rebase 11247-11295；`patternProducerSourceIndexes` 837；`declarationLexicalScopeProducerSourceIndexes` 812 / rebase 11190-11214）；现成 API `ParserValueExprForwardingProductionChildProducerSourceIndexAt`（`8024`）对 Declaration/Pattern/LexicalScope 均为 O(1) 列读。未新 API、未改 intern 顺序/id 取值、未改 append 语义。

### ⑤ 改动原文（before → after，完整 diff 见 patch）

判重 key 构造（**未改**，作为精确链桶索引；链冲突由字段比对消解，**无哈希压缩**）：

```cheng
@borrows
fn parserForwardingProductionAuthoritySpanKey(
        spanStart: int32,
        spanEnd: int32): int64 =
    return (Int64(spanStart) << 32) | Int64(spanEnd)
```

**改动 A（新增 3 个链计数函数，`parser.cheng:8269-8368`）**：

```cheng
@borrows
fn parserForwardingProductionDeclarationSpanProducerCount(
        tree: ParserValueExprTree,
        declarationKind: ParserDeclarationKind,
        producerSourceIndex: int32,
        spanStart: int32,
        spanEnd: int32,
        headBySpan: hashmaps.HashMapPtrInt,
        nextInSpan: int32[]): int32 =
    var found: bool
    let head = hashmaps.HashMapPtrIntGetEx(
        headBySpan,
        parserForwardingProductionAuthoritySpanKey(spanStart, spanEnd),
        found)
    var count: int32
    var cursor: int32 = head - 1
    while cursor >= 0:
        if arenamod.ArenaArrayInt32Get(
               tree.arena, tree.declarationSpanStarts, cursor) == spanStart &&
           arenamod.ArenaArrayInt32Get(
               tree.arena, tree.declarationSpanEnds, cursor) == spanEnd &&
           arenamod.ArenaArrayInt32Get(
               tree.arena,
               tree.declarationProducerSourceIndexes,
               cursor) == producerSourceIndex &&
           ParserDeclarationKind(arenamod.ArenaArrayInt32Get(
               tree.arena, tree.declarationKinds, cursor)) ==
               declarationKind:
            count = count + 1
        cursor = nextInSpan[cursor] - 1
    return count
```

（`parserForwardingProductionLexicalScopeSpanProducerCount` / `parserForwardingProductionPatternSpanProducerCount` 同形，后者先 `patternOwnerRows[row]` 取 region 行再比 region span + `patternProducerSourceIndexes`。）

**改动 B（判据消费点加 producer 维；arm0 bindingDeclaration 原文）**：

```cheng
# ---- before ----
            let declarationCount = hashmaps.HashMapPtrIntGetEx(
                declarationLocalCounts,
                parserForwardingProductionAuthoritySpanKey(
                    spanStart, spanEnd),
                found)
            let exactPatternCount = hashmaps.HashMapPtrIntGetEx(
                patternOwnerRegionCounts,
                parserForwardingProductionAuthoritySpanKey(
                    regionSpanStart, regionSpanEnd),
                found)
            return declarationCount > 0 && exactPatternCount == 1
# ---- after ----
            let declarationCount =
                parserForwardingProductionDeclarationSpanProducerCount(
                    tree,
                    ParserDeclarationLocal,
                    producerSourceIndex,
                    spanStart,
                    spanEnd,
                    declarationHeadBySpan,
                    declarationNextInSpan)
            let exactPatternCount =
                parserForwardingProductionPatternSpanProducerCount(
                    tree,
                    producerSourceIndex,
                    regionSpanStart,
                    regionSpanEnd,
                    patternHeadBySpan,
                    patternNextInSpan)
            return declarationCount > 0 && exactPatternCount == 1
```

同一函数内 Declaration / LexicalScope / Pattern(CaseArm) 三个分支同样换成 producer-aware 链计数，并补上**同源硬臂**（原实现对跨源冒充零检查，属 fail-open 方向，收窄计数域后必须补，否则等于放宽）：

```cheng
# ---- after（Declaration 分支；Pattern/LexicalScope 同形）----
        if ParserValueExprForwardingProductionChildProducerSourceIndexAt(
               tree,
               ParserForwardingProductionChildDeclaration,
               authorityRow) != producerSourceIndex:
            return false
        let exactDeclarationCount =
            parserForwardingProductionDeclarationSpanProducerCount(...)
        return exactDeclarationCount == 1
```

**改动 C（校验器建表侧 `9070-9152`；三域各一条 `span→链首` + 平行 row 链）**：

```cheng
# ---- before ----
    var declarationLocalCounts = hashmaps.HashMapPtrIntInit(
        parserInt64SeenCapacityFor(tree.declarationCount))
    ...（declarationType/Function/Concept/Trait 共 5 张）+ lexicalScopeBlockCounts + patternOwnerRegionCounts...
    for declarationRow in 0..<tree.declarationCount:
        ...
        let key = parserForwardingProductionAuthoritySpanKey(spanStart, spanEnd)
        if declarationKind == ParserDeclarationLocal:
            let oldCount = hashmaps.HashMapPtrIntGetEx(
                declarationLocalCounts, key, authorityCountFound)
            hashmaps.HashMapPtrIntPut(declarationLocalCounts, key, oldCount + 1)
        elif ...（其余 kind 同形各自 +1）...
# ---- after ----
    var declarationHeadBySpan = hashmaps.HashMapPtrIntInit(
        parserInt64SeenCapacityFor(tree.declarationCount))
    var declarationNextInSpan: int32[]
    setLen(declarationNextInSpan, tree.declarationCount)
    var statementRootRoleCounts = hashmaps.HashMapPtrIntInit(
        parserInt64SeenCapacityFor(tree.statementRootCount))   # 未改
    var lexicalScopeHeadBySpan = ... ; var lexicalScopeNextInSpan: int32[] ; setLen(...)
    var patternHeadBySpan = ... ; var patternNextInSpan: int32[] ; setLen(...)
    for declarationRow in 0..<tree.declarationCount:
        ...
        let key = parserForwardingProductionAuthoritySpanKey(spanStart, spanEnd)
        let head = hashmaps.HashMapPtrIntGetEx(
            declarationHeadBySpan, key, authorityCountFound)
        declarationNextInSpan[declarationRow] = head
        hashmaps.HashMapPtrIntPut(
            declarationHeadBySpan, key, declarationRow + 1)
```

**未改（逐条 grep 复核）**：`statementRootRoleCounts`（key=(role, anchorToken)，anchorToken 在 append 时已 rebase，天然全树唯一）、intern 顺序/id 取值、任何 panic 文本、append 的 span 原样拷贝与 authority row rebase、`spanStart/spanEnd` 语义（仍是源内偏移）。改动只落 `src/core/lang/parser.cheng` 一处。

### ⑥ 纪律与残留

- 编译槽协议：每轮 `mkdir .rebuild/COMPILE_SLOT.lock` 原子抢锁 + `owner.txt`(pid/时间/用途)，退出前核对 owner pid 才 `rm -rf`；等待者按 owner_pid 做 `ps -p` 活性检查，死锁单次 `rm` 回收；每轮 `lease_hits` 记录（本轮全部 0）。
- `git diff --numstat`：本修复 delta 仅 `192	96	src/core/lang/parser.cheng`（baseline 该文件 clean）。期间其他会话在同一工作树写入自己的 WIP（`typed_expr*.cheng` / `compiler_csg.cheng` / `bootstrap/cheng_cold.c` / `tools/beat_c*` 等），**与本修复无关且未触碰**；`parser.cheng` 收尾 sha 与落 patch 时一致 = 未被 clobber。
- 临时夹具（`src/tests/ug_neg_*.cheng`，为负例控制临时建；**唯一一次对 `src/tests/` 的例外授权**）：9 个文件已全部删除，`ls src/tests/ug_neg_*` 无匹配，`git status --porcelain -- src/tests` 仅剩**他人既有 WIP**（`rsi_contract.cheng` / `rsi_recursive_e2e.cheng` 修改、`ug_gate_probe_enum.54787.cheng` 删除——三者均在 baseline `git status` 中已在），无本任务残留。
- 原始件：`.rebuild/auth_fix/`（`MANIFEST.sha256`）
