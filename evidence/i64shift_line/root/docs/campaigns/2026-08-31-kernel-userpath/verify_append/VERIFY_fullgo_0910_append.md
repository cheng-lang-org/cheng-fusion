# VERIFY_fullgo_0910_append —— 收官轮独立实测：768MiB 真实量级 / 死相归因 / C 链烤机路径边界 / 探针现状

date_utc=2026-09-10 · 执行=收官轮独立席（非 ledgerwalk 线）· 主树=HEAD `17d6fb8d1` **+ 在途工作树改动**
（`src/core/lang/typed_expr.cheng` +35/−11，属 cheng-f24/ledgerwalk 线在飞 WIP，本席零写入）
· 车头=`cheng_cold_v3` `sha256=0c765779c8f6abac565be2949a40e6c185678e31dbde247212bc266a231d02cb`
（`cc -std=c11 -O2 bootstrap/cheng_cold.c`，25s）· 驱动=`sha256=7d60c38d60f87f4cc7a0e84e1de3ab61939d221f0eb3f92a30f133b5e4ab09bd`
（C 链烤，166s，BACKEND_JOBS=2，禁缓存四件套）

## 一、768MiB 守卫三跑（当前绑定，独立复现）

| 跑 | 外门 | 内门（驱动自带 `CHENG_PROCESS_MAX_RSS_BYTES`） | rc | wall | resident 峰 | phys 峰 | 判词 |
|---|---|---|---|---|---|---|---|
| A | 805,306,368 | 768MiB（默认） | **137** | 187s | 642,187,264 | **809,206,960** | `abort_reason=rss_limit_exceeded`（外门，超线 3.9MB） |
| B | 1,073,741,824 | 768MiB（默认） | **125** | 187s | **822,214,656** | 967,689,488 | 内门先开枪（resident 越 768MiB） |
| C | 1,073,741,824 | 768MiB（默认）+ `CHENG_CSG_MEM_TRACE=1` | **125** | 188s | 701,071,360 | 974,636,304 | 见 §二 census |

结论：**768MiB 不是 ~4MB 的调参缺口**——外门测到的 809,206,960B 只是内门（768MiB resident）与外门夹逼
出的「台地」，抬门后 resident 继续涨到 822MB、phys 到 967MB 仍死；与 `VERIFY_true_mem_1g_append.md`
（1GiB 双抬后 phys 顶到 1,074,496,832 且 `metadata_contexts_built` 未达）同向。真实需求 >1GiB。

## 二、死相归因（本轮 census，修正旧判词）

C 跑 stderr（`CHENG_CSG_MEM_TRACE=1`）最后阶段：

```
csg_mem tag=forest_parsed src=60 arena=246432  rss=554255320 live=1743538
csg_mem tag=forest        src=61 bytes=4488986 rss=553976792 live=1743524
compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=840910000 limit_bytes=805306368
```

- 死点在 **forest 解析相 src=61/230**，live 活块 **1,743,524**，不是「metadata contexts 相」单点
  （旧判词 30-55 的 metadata 相归因在更后段才成立；当前在途刀把前沿前移到 forest）。
- 与 `docs/selfhost-resource-plan.md` §三-1/§六 的 **T-1 intern 正则化（parse-into-forest 串行 append 主墙）**
  同一相；`contexts` 权威仅 ~52-61KB/源（B3 census），不构成量级。
- 该数据与 ledgerwalk 线在途的两把刀（`[ledgerwalk-1]` 145,802 活块 + `[ledgerwalk-3]` 667,349 活块）
  同域，方向一致。

## 三、C 链烤机路径边界（新发现，工具面）

同车头、同源集、同 env，仅变 `--out` 落点：

| `--out` 落点 | rc | 判词 |
|---|---|---|
| 仓库内 `.rebuild/run_complete_current/kernel_driver` | **0** | 驱动 `7d60c38d…`（166s） |
| `$HOME/ccomplete-D/kernel_driver`（mode 700，root 外） | **0** | — |
| `/private/tmp/ccomplete-C/kernel_driver`（mode 700） | 2 | `Darwin host provider preprocessing identity failed` |
| `/private/tmp/ccomplete-A/kernel_driver`（mode 755，无 cache root） | 2 | `primary object emit failed` |
| `/tmp/ccomplete-B/kernel_driver`（符号链接前缀，显式 cache root） | 2 | `primary object emit failed` |

- 与 cache root、符号链接前缀、目录权限**均不相关**（三组对照已排除）；只与 `/private/tmp` 落点相关。
- 同一驱动把小夹具输出到 `/private/tmp/ccomplete-E/` **正常**（按语义判词 rc=2：`context_sequence_shared`），
  故这不是「输出必须仓库内」的通则，而是 **C 链 Darwin host provider 预处理段对 `/private/tmp` 落点敏感**。
- 影响：`tools/cheng_scratch_scope.sh` 的任务目录在 `/private/tmp` 下 ⇒ **C 链烤驱动不能落在 scratch**，
  历史 `.rebuild/` 落点是硬约束而非习惯。两条判词（`primary object emit failed` /
  `preprocessing identity failed`）都**不指向真实根因**，属诊断面缺陷。
- 移交：冷链线（`bootstrap/cheng_cold.c`，本席零写入）。C 链只产 GEN1，不改退役路线。

## 四、Phase B 探针现状（当前绑定，driver `7d60c38d…`）

| 探针 | compile | 判词 |
|---|---|---|
| probe_array / probe_assert / probe_objctor / probe_tuple | 2 | `typed expr: frozen metadata seal code=context_sequence_shared detail=context sequence is not uniquely owned ref_count=2`（**四件同一根因**） |
| probe_closure | 1 | `typed expr: unsupported structural value case=12 parser_kind=26 surface=fn (a: int32, b: int32): int32 = a + b` |
| probe_generic | 1 | `typed expr: node value/share authority is incomplete` |
| probe_try | 2 | `parser type syntax: field declaration type missing statement_offset=82` |

- `context_sequence_shared` 的判词点在 **HEAD 提交代码内**（`src/core/lang/typed_expr.cheng:43931`，`git show HEAD` 同址），
  非在途 WIP 引入；`ref_count=2` = 冻结 seal 时 contexts 序列缓冲被二次持有。
- 追踪面（只读）：seal 入口 `TypedExprSealBuildSourceContextIndex(ir, sourceContexts: var TypedExprSourceContext[], err)`
  在 `compiler_csg.cheng:37988` / `:39131` 两处调用，第二处 seal 后显式断言
  `work.typedMetadataContexts.len == 0`（**seal 语义 = 所有权转移进 IR**）；唯一性判定 =
  `typedExprSequenceBufferUnique` = `memRefCount(buffer) == 1`（`:37403`）。排查靶 =
  `work.typedMetadataContexts` 的 16 处 `var` 传参点（`:35585/:35801/:35831/:36733/:36901/:37361/:37823/:37965/:38849/:38899/:38971/:39118`）
  中哪一处在四件探针的形状下产生二次持有；四夹具同路径 refcount==1，故非通用别名的假阳性。
- 与工作树基线（`user_path_baseline.tsv` probe 区，kernel 线更新态）相比，四件判词**前移**到 seal 相——
  需在源码冻结窗口按「先钉 HEAD、再钉刀态」两段复测后入基线；本席不动基线。

## 五、边界与移交

- 本席对 `src/**` **零写入**（ledgerwalk 线持有 `typed_expr.cheng`）；本回执全部结论绑定上表两哈希与命令行。
- 未做：源码冻结窗口复烤（不可得，见在途 WIP）、组合装配 exec_diff（需同一内存墙先过）、
  held-exec 平台门（Darwin 生产臂未立项）。
- 资产：`.rebuild/run_complete_{current,selfbake768,selfbake1g,trace1g,probes}/`（summary + guard report + census stderr）；
  临时件 `/private/tmp/ccomplete-{A,B,C,D,E}` 与 `$HOME/ccomplete-D`（对照实验，结论已固化后即清）。

## 六、1.5GiB 双抬 + 森林相定位（同日续，决定性）

命令同 §一，仅把内外门同时抬到 `1,610,612,736`（`CHENG_PROCESS_MAX_RSS_BYTES=1610612736` + `--rss-limit:1610612736`）：

| 跑 | rc | wall | resident 峰 | phys 峰 | 树上进程数峰 | 结果 |
|---|---|---|---|---|---|---|
| 1.5GiB 双抬（无埋点） | **137** | 314s | `1,197,834,240` | `1,613,825,752`（≈门线） | **1** | 仍死，未产出驱动 |
| 1.5GiB 双抬（`CHENG_CSG_MEM_TRACE=1`） | **137** | 302s | `1,045,839,872` | `1,612,302,040` | 1 | 仍死；埋点见下 |

**结论：当前源码自烤的真实需求 >1.5GiB（单进程，无子进程并驻），768MiB 目标需要消掉约 800MB。**

埋点账（`csg_mem`/`csg_stage`，`run_complete_trace15g/stderr.txt`）：

- `csg_stage=after_profiles since_ms=58272 rss=317,866,800 live=853,848`
- `csg_stage=after_reachable_function_set since_ms=10021 rss=424,919,928`
- `csg_stage=after_profile_source_payload_release since_ms=29617 rss=551,797,672 live=1,443,532`
- 森林 pass 0（逐源 parse→量 arena→**立即释放**）走完 234 源：
  `forest_parsed src=233 arena=117280 rss=702,940,216 live=3,060,689`
- 之后（pass 1 预留合并 arena + 追加）无任何 `forest_appended` 埋点 → 死在 pass 1 的整块并林窗口，
  phys 由 ~620MB 连续爬到 1.57GB。

**预算拆解（本轮实测口径，含精确森林账）**：保底驻留 ≈700MB（profiles + 快照 + intern/行池 + 3.06M 活块）
＋ **合并森林 arena 实测 `1,290,508,960` B = 1,230.7 MiB**（234 源 pass 0 arena 逐源求和，
最大单源 `140,599,840` B=134.1 MiB，Top10 源占 53%）⇒ 峰 ≈1.6GB，对照 768MiB=805MB 管理线需 −800MB。
**关键否定性事实：合并森林 arena 本身就 1,230.7 MiB > 805MB 线——只要「整块并林」这个形态存在，
768MiB 在数学上不可达。** 正解 = 森林/画像的增量消费（P1 汇点增量化 / T-2）：每源 parse→typed
生产→立即释放，永不物化全量森林；同时压保底驻留（大源单棵 arena 134 MiB 级 + doubling 瞬态）。
与 `docs/selfhost-resource-plan.md` §三-1（波次判死=全局汇点所限）、§六 T-1/T-2 同指向。

森林 arena Top6（源索引→MiB）：134→134.1、61→131.8、158→70.0、132→67.0、47→60.1、170→59.5。
注：768MiB 门下的死点正是 `src=61`（第二大源），即「保底驻留 + 单棵 131.8 MiB 大源树」先穿线。

## 七、Step2 遗留项「组合驱动 exec_diff 复核」复测（同日续）

- **默认内门（768MiB）**：`tools/build_plugin_driver.sh --arch aarch64 --driver <kernel_driver 7d60c38d…>`
  → `build_rc=125` @172.6s，`compile_progress phase=resource_guard status=rss_limit_exceeded
  rss_bytes=873,579,672 limit_bytes=805,306,368`（`/usr/bin/time -l` maxrss=746,438,656）。
- **抬内门到 1.5GiB（诊断口径，非验收口径）**：同命令 → 仍 `rc=125` @303s，
  `rss_bytes=1,989,478,344 limit_bytes=1,612,736`（≈1.85GiB 需求，比 kernel 自烤更大，
  因组合闭包 > kernel 闭包）。
- 判定：**Step2 exec_diff 复核维持 BLOCKED@同一内存墙**，且本轮给出精确需求（≥1.85GiB）
  与判词；未产出组合驱动，四夹具队列无法执行，不产生任何完成信用。
  解 = `docs/selfhost-resource-plan.md` §六 T-1/T-2 的增量消费批次。

## 八、森林账下钻到文件级（同日续，增量改造定靶）

闭包复算（入口 `backend_driver_dispatch_min.cheng`，`cheng/*`→`src/*` 解析）得 **234 源**，
与埋点 `pass0_sources=234` 精确一致 ⇒ 索引→文件映射可信。逐源 arena 与行数对拍：

| 源索引 | arena | 文件 | 行数 |
|---|---|---|---|
| 134 | 134.1 MiB | `src/core/lang/typed_expr.cheng` | 68,823 |
| 61 | 131.8 MiB | `src/core/backend/primary_object_plan.cheng` | 78,504 |
| 158 | 70.0 MiB | `src/core/tooling/compiler_csg.cheng` | 42,506 |
| 132 | 67.0 MiB | `src/core/lang/parser.cheng` | 39,054 |
| 47 | 60.1 MiB | `src/core/backend/lowering_plan.cheng` | 31,137 |
| 170 | 59.5 MiB | `src/core/tooling/compiler_snapshot_builder.cheng` | 26,033 |

- 闭包总行数 `641,443`（C 链烤机报告）⇒ 森林成本 **≈ 2,012 B/源行**（`1,290,508,960 / 641,443`）；
  Top6 文件合计 522.5 MiB = 全森林的 42%。
- 结论①：**增量消费是不可选项**——全森林 1,230.7 MiB 本身 > 805MB 线，任何「先全量 parse 再消费」
  的形态都不可达；必须每源 parse→typed 生产→立即释放。
- 结论②：**大源单棵瞬态是 768MiB 门下的直接死因**（死点 `src=61` = 131.8 MiB 单棵树 +
  保底驻留），所以即便做了增量消费，仍需压「单源峰值」（最大单源 134 MiB）。
- 结构事实：`ParserValueExprTree` 已是 DOD+Arena+SoA（profile 级单 owner + 多列 int32 SoA，
  字符串走唯一 intern 池），并非裸对象树；~2KB/行是宽 SoA 的固有成本，缩小只能靠列裁剪/分相释放。

## 九、【红】HEAD 编译回归：e7e38d76a 起四夹具全红（同日续，独立定位）

**现象**：HEAD 源码驱动编最简夹具 `ordinary_zero_exit_fixture.cheng`（`fn main(): int32 = return 0`）
即 `compile_rc=2`，判词逐字：

```
typed expr: frozen metadata seal code=context_sequence_shared detail=context sequence is not uniquely owned ref_count=2
```

**证据链**：

1. `tools/user_path_gate.sh --driver <主树驱动 7d60c38d…>`（默认 768MiB 帽）：
   `summary: pass=0 known_red=0 stale=4`，四夹具全 `COMPILE=2 / BASELINE-STALE`（probe 区 17 STALE + 2 RED）。
2. 排除门禁/缓存/路径因素：直接命令行编译同夹具同判词（非 gate 产物）。
3. 排除在途 WIP：`git archive HEAD`（`b6b4816e4`）干净克隆 → 烤驱动 `b55dba22b0768c61…`
   → 同夹具仍同判词 ⇒ **已提交回归**。
4. 提交二分（各提交克隆 + 烤机 + 编最简夹具；早期点因克隆缺 provider 在链接期另报
   `system link exec runtime: missing provider compiler/current stage3`，但**前端无 seal 判词**，足以区分）：

| 提交 | 结论 |
|---|---|
| `9dd7a2bcd`（批次七收口） | 前端通过（无 seal 判词） |
| `bd149df96`（goal2 closure） | 前端通过 |
| `04d39d084`（前端内存刀） | 前端通过 |
| **`e7e38d76a`（forest 窗释放刀）** | **seal 判词复现** |
| `b6b4816e4`/`17d6fb8d1`（当前 HEAD） | seal 判词复现 |

**结论**：回归由 `e7e38d76a`（"release derived call-name tables/cache and receipt accumulator across
forest window"）引入——该提交在 `CompilerCsgCompactProfilesForFixedPoint` 之后新增
「profile 派生表释放循环 + `profileCallLookupCache` 整体重置」，并把 receipt accumulator 初始化
挪到 forest 窗后。**HEAD 当前无法编译任何程序**；此前未被发现的原因是自烤/内存测量都在
更早的 forest pass 1 就死，走不到 seal 相。

**影响**：四夹具 4/4（`user_path_baseline.tsv` 现存基线）在 HEAD 不成立；一切以 HEAD 为载具的
编译/门禁/RSI 编译器域结论当前都不可复现。**在途修复靶见 §十**。

## 十、seal 回归定点定位与最小修复（同日续）

**定点回退实验**（各实验 = 干净克隆 → 反向补丁/定点改写 → 烤机 `~165-283s` → 编最简夹具；
主树零写入）：

| 实验 | 回退内容 | 前端 seal 判词 |
|---|---|---|
| A | `e7e38d76a` 的 profile 派生表释放循环 | 仍复现 |
| B | `e7e38d76a` 的 `profileCallLookupCache` 整体重置 | 仍复现 |
| C | `e7e38d76a` 的 `parser.cheng` 全部 hunk（record-reset→逐字段 detach） | 仍复现 |
| D | `e7e38d76a` 的 `program_support_backend.cheng` hunk | 仍复现 |
| **E** | **`e7e38d76a` 的 `src/` 全部** | **消失**（前进到链接期，仅报克隆缺 provider） |
| **G** | **仅回退「receipt accumulator 初始化移位」（保留 A、B 两块）** | **消失**（同上） |

**定谳**：元凶是该提交把

```text
parser_receipt.ParserNormalizedExprReceiptAccumulatorInit(sourceBundleCid,
    work.orderedSources, work.orderedSourceModules,
    canonicalImportEdges, work.reachableSet.functionNames.len)
```

从 `CompilerCsgCompactProfilesForFixedPoint(work)` **之前**挪到 forest 窗**之后**（并在原位删除）。
该移位使 `work.typedMetadataContexts` 的序列缓冲在冻结 seal 时 `ref_count=2`
（判词 50/52 同族的「字段/记录赋值形状导致共享」面）；释放循环与缓存重置本身无责。

**最小修复补丁（已验证形状）**：`docs/campaigns/2026-08-31-kernel-userpath/patches/head_seal_regression_fix.patch`
——把 accumulator 初始化放回 `CompactProfilesForFixedPoint` 之前、删除 forest 窗后的重初始化，
**保留**派生表释放与缓存重置（即保住该提交三块内存刀中的两块）。
代价如实：该提交「accumulator 不骑 forest 峰」的那一份内存收益被让回，待所有权形状查清后再图。
（验证回执见 §十一。）

## 十一、seal 回归修复的端到端验证（同日续，v4 定稿）

补丁迭代（每轮 = 主树应用 → 冷编译器重烤 ~165-210s → 四夹具编译）：

| 版本 | 形态 | 结果 |
|---|---|---|
| v1(初稿) | 挪 accumulator + 去重建循环（保留释放） | ordinary `0/0` 过；另三夹具 lowering `rc=1`（`primary_lower_pool_batch_receive_failed`）——拓扑有误 |
| v2 | 挪 accumulator（保留释放+重建） | 四夹具全 `rc=2`（seal 判词回归）⇒ **重建循环 `field = <返回数组>` 赋值形状才是元凶** |
| v3 | 去「释放+重建」对（保留 cache 重置） | ordinary `0/0` 过；另三夹具仍 `rc=1`（池） |
| **v4（定稿）** | **把 `e7e38d76a` 的 `compiler_csg.cheng` 改动整段还原**（保留其 `parser.cheng` detach 与 psb 修复） | 见下 |

**v4 端到端（主树、真实 768MiB 正式门、门内口径 `BACKEND_JOBS=1`）**：

```
FIXTURE        COMPILE  RUN   COMPILE_RSS_KiB  VERDICT  RESULT
ordinary       0        0     639474           -        PASS
call_fixture   0        1     643282           -        PASS
cold_nested    0        0     723090           -        PASS
v6             -        -     (821691976 B)    -        GATE-FAIL rss_limit_exceeded:821691976:805306368
gate_rc=3
```

- **seal 回归消除**：HEAD 由「连 `fn main(): return 0` 都编不过」恢复为 3/4 PASS。
- **v6 是内存墙**（超线 16.4MB），非正确性回归；补丁文件：`patches/head_seal_regression_fix_v4.patch`
  （77 行；v1/v2/v3 为探测产物，留在同目录备查，**不要**误用）。

## 十二、并行 lower 池回归（新发现，独立于 seal）

- `BACKEND_JOBS=2` 编 `call_fixture`/`cold_nested`/`v6` → `compile_rc=1`，
  判词 `primary_lower_pool_batch_receive_failed`（`primary_object_plan.cheng:70339`，
  并行池 = `hpool.HostPoolPipe/Fork/ExitImmediate`，`70294-70330`）；
  `BACKEND_JOBS=1` 同三夹具全部 `compile_rc=0`；`ordinary`（单函数走串行臂）不受影响。
- **正式门 `tools/user_path_gate.sh` 内固定 `BACKEND_JOBS=1`（:480）**，故 §十一 的 3/4 PASS 是门口径；
  但仓库自烤/烤机脚本用 `BACKEND_JOBS=2`，此缺陷会命中它们。
- 嫌疑路径 = 并行池 fork 经 held-exec/DarwinAuthority 派发器（`17d6fb8d1`/`b6b4816e4` 改了 psb）；
  已派只读诊断线（结论待回）。

## 十三、并行子代理交付（同日，文件面互斥）

- **内存增量消费设计**（只读）：`design/incremental-forest-consumption.md`（267 行）。核心修正：
  768MiB 死因是 **pass 0 单源 parse doubling 瞬态**（`parser.cheng:26612-26615` 自述 268MB+134MB），
  合并森林（1,230.7 MiB）是 1.5GiB 的死因；只删森林后残留峰 ≈660-804 MiB，**压在线上、余量 <1MiB**，
  必须同时买第二轴。最小首刀 S1 = R2 两相拆分（索引相/物化相+删森林），判定 B1-B6 全可证伪；
  隐藏天花板 I2 = `frontierParsedSources` 跨轮持久、只在 `compiler_csg.cheng:39107-39108` 整批释放。
  估工 28-36 agent h。
- **严格闭包 K3 拆分设计**（只读）：`design/strict-closure-k3-split.md`（360 行）。12 条 arch 链坍缩为
  6 门面 / 12 条入口边；反事实切边实测 **E3+E4+E2 → arch 4 / closure 183 / token 27·324 / 出闭包 11 文件**
  为推荐最小切片；token 面 342 行中 238 行是纯字符串（`direct_object_emit` 78 行最大）。
  估工：S1 40-80h、token 清零 46-83h、arch 4→0 60-140h，**K2/K3 全绿 160-320 agent h**。
- **RSI §5 负例补齐**（改 `src/rsi/store.cheng`、`src/rsi/promotion.cheng`、
  `src/tests/rsi_contract.cheng`，新增 `src/tests/rsi_recursive_e2e.cheng`）：提交边界中断负例
  （陈旧 tmp/半行/缺字段/丢文件/重提交）、**双写者拒绝**（独占 `rsi.write.lock.d` 目录锁 + owner pid/start
  + 死锁接管 + 活锁硬拒 + 受锁提交零落盘）、前瞻预算配对账本（engine 未接线，如实标注）、
  递归 e2e（真 3 轮：gen0 22963→gen1 13450→meta 收 M1→gen3 3937）。
  **本席独立复验**：`rsi_contract`/`rsi_recursive_e2e` 用冻结载具 stage3 均 `compile=0 / run=0`（静默全过）。
  边界如实：目录锁接管临界区有极窄 TOCTOU；前瞻账本尚未接入引擎（`RsiMetaPromotionDecide` 旧入口仍在用）。

## 十四、待用户决策：held-exec DarwinAuthority M3 安装面（阻塞项，须授权）

**事实（判词 56 / `b6b4816e4` + `probes/darwin_authority/DESIGN.md` §三）**：
darwin 生产臂已拆 M0-M5；**M1（channel 定长分帧属主）、M2（`posix_spawn START_SUSPENDED` spawn 属主）、
M4（child 镜像再证）都是纯代码接线**，开发机可完成；**只有 M3（retained/launcher identity 接线）需要
系统安装面**：固定路径安装面 + `SF_IMMUTABLE`（`chflags`）+ codesign fence，用来替换 `/proc/self/exe`
与 fs-verity measure 两腿。无安装面时按纪律显式 HARD_RED（**不算绿、不得降级**）。

**需要决策（二选一，或指定第三条）**：

- **A｜提供安装面**：授权在本机（或指定目标机）以 root 执行一次安装流程（固定路径 + `SF_IMMUTABLE`
  + 签名）。收益=held-exec 全链本机可跑、幽灵终验本机可补、后续 launcher 批次不再每轮 54s 撞声明点；
  代价=需要管理员权限 + 安装脚本落库 + 签名密钥/身份管理。
- **B｜维持 Linux 专属**：幽灵终验与纯载具终验全部在 Linux lane 跑（外部 Linux 机器 + 跨机证据哈希绑定，
  源码/编译器/工具三方一致）。代价=本机（darwin arm64）终验永久 BLOCKED@声明点；收益=零代码/权限风险。

本席未动任何权限面（属不可逆/外发动作），等授权后再推进。

## 十五、跨线交叉确认（TA-MEM3，同日，克隆内独立作业）

`VERIFY_tamem3_append.md`（另一线，克隆 `cheng-f24/tamem3`，锚 `b6b4816e4`+在途 WT）与本文独立收敛：

- **死点同点同量级**：forest pass0 `src=61`（`primary_object_plan.cheng`，131.8MiB 单源树），
  enforced phys `808,715,416` B（门 805,306,368，差 3,409,048 B）——与本席 §一（`809,206,960`，差 3.9MB）互证。
- **「再挖 3.4MB」无意义**：门后还有 pass1 整块并林（Σarena=1,230.7MiB，本席 §六 1.5GiB 双抬绑定），
  唯一路径 = T-1/T-2 增量消费 + 压 metadata 棘轮（该线实测 metadata 相 +150MB/+527k 活块）。
- **F1 刀（pass0 测量解析 presize）A/B 三轮零净**（808.7/809.1/809.0MB，±0.5MB）⇒「倍增共存在 enforced
  口径主导峰」父假设被证伪，已按纪律回退、不交付 no-op patch——与本席「块倍增瞬态」分析互补：
  瞬态存在但**不主导** enforced phys 峰，收口仍靠增量消费。
- **v4 修复获独立确认**：该线自家驱动（base1 `e6af3cd1`）四夹具门 3/4 PASS + 最小夹具 rc=0，机制判定
  「主树工作树未提交改动把 `e7e38d76a` 的 receipt-init 重排回退到 compact 前」= 本席 v4 补丁；
  该线明确建议**主线程尽快收割提交**（HEAD 已提交态仍带回归）。⇒ 主树 `compiler_csg.cheng` 未提交改动
  是全仓解 Block 的关键资产，落盘优先级最高。
- **v6 差 3.1MB 的归属移交**：全在发射/链接臂（v6 前端梯子峰仅 20.3MB、闭包 1 源 54 行，而树峰 713-771MiB；
  对照 ordinary 同臂 458MiB，Δ=+267MiB）——按 gen2r3 裁决属「发射/链接编排=模型外新刀」禁触域，边界图已移交。

## 十六、并行 lower 池回归：诊断结案与修复方案（只读线交付，未改码）

**链路（实测，与 DarwinAuthority 无关）**：`primary_object_plan.cheng:70296/70301/70320`（建 pipe→fork→子进程 worker→`_exit`）
→ `host_pool_runtime.cheng:8/18/49` → `host_pool_provider.cheng:11/14/32`（`@importc`）
→ `program_support_host_runtime.cheng:1945/2026/2048`（`@exportc`）→ 同文件 `:104/112/118` `@importc("pipe"/"fork"/"_exit")`；
二进制实证 `.rebuild/run_complete_current/kernel_driver.provider.host.o.map:56,57,61`。**fork 臂=裸 libc fork**，
不经 `begin_claim`/held-exec（后者在 `program_support_backend.cheng:28985-29042`）。

**排除**：`git diff bd149df96^ bd149df96 -- host_pool_runtime.cheng` 是纯搬家（旧 102 行内联逐行入新 provider，
rc/fd/status 语义一致）；`17d6fb8d1`/`b6b4816e4` 未碰此链 ⇒ 本席先前的「派发器/该提交」两条线索**均被排除**。

**失败步骤**：jobs=2 stderr 仅 2 行 lifecycle + 判词，**无子进程 panic**（panic 走 `src/std/system.cheng:479`，
stderr 继承必现），DiagnosticReports 无新崩溃 ⇒ 子进程未 panic 未被打信号 ⇒ 失败在**父侧校验/提交**。
已排除 `irIndexes` preflight 分支（jobs=1 + `CHENG_PRIMARY_OBJECT_TRACE` 实测 call_fixture 两 slot `ir_index≥0`）。

**最强嫌疑（未验证）**：`PrimaryLowerPoolCommitBatch`（`primary_object_plan.cheng:69497-69553`）在 69547
以「该 slot 父侧已有 BodyIR 物理存储」拒提交；串行分支（`70287-70291`）无此校验。【更正 2026-09-10 实读：区间与点号已漂移——`fn PrimaryLowerPoolCommitBatch(` 由 `:69470` 移至 `:69497`（下一 fn `PrimaryLowerPoolReleaseStagedPayloads` 起 `:69591`），拒提交点 `if bodylifecycle.BodyIrPayloadHasPhysicalStorage(` 由 `:69520` 移至 `:69547`；`70287-70291` 复核实读未变】
**可证伪判据**：在 69547 前打印/放行 → jobs=2 应立即 rc=0 且产物 sha256 与 jobs=1 逐字节相同；
若仍红，根因转 `69912/69985` 帧拒（届时核对 worker `Backend2BodyIrEncode` 与父侧
`Backend2BodyIrEncodedTypeArenaArtifactMatches` 的 CID 一致性，且必须在 worker 侧 hard fail）。

**归因（诚实）**：非某提交引入，而是 **jobs>1 的 wave-fork 池从未与 streamed-emit 路径端到端验收**——
`tools/user_path_gate.sh:480` 硬钉 `BACKEND_JOBS=1`；`tools/parallel_codegen_ab_gate.sh:16-22` 走另一驱动+另一夹具；
池自身合同只用 `workerCount=1`（`src/tests/primary_lower_pool_lifecycle_smoke.cheng:4-6` → `:70218/70227`）。
**修复负例（必须同时满足）**：① jobs=1 与 jobs=2 产物 sha256 相等；② 两个 pool 合同冒烟仍绿（坏帧整体回滚）；
③ **禁止** workerCount>1 失败回落串行——`70339` hard panic 必须保留（降级=掩盖）。

## 十七、开放疑点：kernel manifest 的 `observed_strict_arch_*` 键 vs 运行时 manifest 解析器（**已实测证伪，关闭**）

- 代码事实：`src/core/tooling/composition_manifest.cheng:182-186` 对非 `compiler_entry_source` / 非 `*_source`
  的键写有 `HARD_RED:composition_manifest_unknown_key`；而 `bootstrap/kernel_manifest.cheng:221-231` 有 12 行
  `observed_strict_arch_*`，且 `tools/build_kernel_driver.sh:162-163` 把该 manifest 作为 `--composition-manifest:` 传参。
- **判定实验（合成 manifest 探针，编译槽空闲时单跑）**：`/private/tmp/kmanifest_probe.cheng` =
  `composition_schema` + `composition_kind=kernel-only` + `compiler_entry_source=src/core/backend/codegen_contract.cheng`
  + **`bogus_probe_key = src/core/backend/codegen_contract.cheng`**，直连驱动
  `kernel_driver system-link-exec --root:$PWD --in:…/codegen_contract.cheng --composition-manifest:/private/tmp/kmanifest_probe.cheng`。
  结果：**无 `HARD_RED`、无 `unknown_key`**，直接进入编译并如期报 `compiler csg: reachable entry missing: main`（rc=2）。
- **结论**：`system-link-exec --composition-manifest:` 这条路径**不执行** unknown-key 规则（该规则属另一入口，
  未定位）。⇒ 12 行 `observed_strict_arch_*` 在 kernel-only 装配路径上**不会**触发红门；
  §十七 原疑点**证伪并关闭**，闭包切片「删 11 行 manifest」的副作用面回到设计文档口径（只需与严格门 declared 集同步）。
- 另：`tools/build_kernel_driver.sh` 在本席两次 75-100s 窗口内**零输出**（无 FAILED summary、无 HARD_RED），
  与其内部 driver 日志落 scratch 后被清理有关；kernel-only 装配的完整 rc 仍未取得（需 ~10 分钟独占槽），
  列为待办而非结论。

## 十八、kernel-only 组合驱动装配实测：同样撞 768MiB 内门（Step 2 遗留项现状）

直连驱动（禁缓存四件套、`BACKEND_JOBS=1`、v4 驱动 `016ba841…`）跑 Step 2 的 kernel-only 组合装配：

```
kernel_driver system-link-exec --root:$PWD \
  --in:$PWD/src/core/tooling/compiler_composition_kernel_main.cheng \
  --composition-manifest:$PWD/bootstrap/kernel_manifest.cheng \
  --emit:exe --target:arm64-apple-darwin --out:…/run_kernel_only/kd --report-out:…/kd.report.txt
```

结果：**rc=125 @177s，`compile_progress phase=resource_guard status=rss_limit_exceeded
rss_bytes=838,976,712 limit_bytes=805,306,368`**（驱动内建 768MiB 门，超 33.7MB），未产出驱动、
无 report。⇒ Step 2 的「kernel-only 驱动组装 rc=0」在当前源码下**同样被内存墙阻塞**（与 §十二 的
aarch64 组合装配 rc=125/873MB、§六 自烤同源）；口径与前次记录（2026-09-06 记 1GiB 守卫拦截）
一致，本轮给出 768MiB 线的精确数值。

## 十九、S1a 任务线终止善后 + 树健康独立判定 + 租约污染定谳

- **S1a 子代理已不可寻址**（终止，未交回报告），但其 step-1 产物在树且**有补丁留痕**：
  `patches/s1a_step1.patch`（22,574B，覆盖 `typed_expr_type_arena.cheng` + `compiler_csg.cheng`，
  含 `TypedExprTypeDeclarationIndexBuildSourceInto` / `...VerifyAgainstForestInto` 等新函数）。
- **孤儿进程清理**：其 `run_matrix.sh` + `kernel_driver_before` 编译进程在代理终止后仍占着
  workspace-root 租约（pid 97274/97301），已 TERM 清理。
- **树健康独立判定（本席跑，独占槽）**：当前源码（= 本席 v4 补丁 + S1a step-1 + 他人 typed_expr WIP）
  重烤驱动 **rc=0 @204s，驱动 `0354ca74…`**；四夹具（`BACKEND_JOBS=1`、禁缓存）：
  **ordinary `0/0`、call_fixture `0/1`、cold_nested `0/0`、v6 `0/0`** ⇒ 无回归、可留。
  **如实边界**：S1a 自身的 B1/B3 判据（索引与旧权威相逐字节一致、类型/令牌/used 字节相等）**未验证**——
  其 `fixtures_before.summary.txt` 四夹具 `rc=2` 系租约碰撞产物（见下），before 基线无效，after 侧未跑完。
- **租约污染定谳（重要运维教训）**：同仓并发重编译撞 workspace-root 租约时，失败形态是**静默 rc=2**
  + stderr 一行 `os atomic tree: parent lease unavailable`，**无其他判词、无产物**；本席单跑其 before 驱动
  复现该判词。⇒ 一切基准/对拍必须在**独占槽**（`ps aux | grep system-link-exec` 为空）内跑，
  且任何 rc=2 先查该判词，命中即判「环境碰撞，重跑」，禁止记成编译器判词。
- 结论：S1a step-1 保留（可 `git apply -R patches/s1a_step1.patch` 干净回退），但**不计入完成信用**，
  下一步要么在独占槽补 B1/B3 对拍，要么按设计文档续 S1b。
- **B1/B3 对拍（S1a 线终报，已补投）＝通过**：驱动烤 rc=0（206.8/202.0s，before `793afdce…` / s1a `d285f4be…`）；
  四夹具全 `compile=0`，run `0/1/0/0`，`decl_index verified=1`，`entries/ts/decls` = `0/1/1, 0/2/2, 0/3/5, 3/26/25`；
  另测 2 源对与 8 源闭包（entries=35）`verified=1`（后者随后死于既有 receipt 判词）。
  **B1**=森林侧按权威相原逻辑重导、按行序比全字段+条目数并全行校验前缀和；
  **B3**=设计口径的 `type_arena` 计数行经查是**死码**（arena 已 move 进 typedIr，`typed_expr.cheng:4808`），
  改比「同输入同输出路径下两驱动产物 sha256」，**全等**（四夹具 `d3cca8c1/4f9af51f/0b89d8dd/6eca55c6`，
  多源对 `9779b97d`；换输出名会变，因 exe 内嵌自身路径——这是口径而非差异）。
  `rsi_contract` 两驱动同 `rc=2`（既有；report sha 同为 `0ef9d912…`），stage3 侧 `compile=0/run=0`。
  边界如实：`reuse` 路径未覆盖（实测所有编译 `mode=reparse`）、**无降峰**（S1a 是索引相，不动物理峰值）、
  索引仅跨源。**S1a 从「健康面已验证」升级为「B1/B3 已验证」**，但仍不含 S1b，故不计入内存墙完成信用。
- **B1/B3 对拍尝试（第 11 轮）＝作废，非结果**：`s1a_ab.sh` 在 before/after 双驱动 × 四夹具上跑，
  八次编译**全部 rc=2**，两份 stderr 各含 1 次 `os atomic tree: parent lease unavailable`；
  且启动时 `ps` 已显示仓内另有 2 个 `system-link-exec` 在跑（他线）⇒ **仓位无独占窗口**，
  该轮数据不得作为等价/不等价证据。独占窗口是本仓一切基准的硬前提，当前不具备。

## 二十、B5 埋点死码实证 + TypeArena 门内不可达（2026-09-10 夜，已入库 43e12c322）

### 20.1 埋点位移：原址是死码，此前"TypeArena 未测到"是埋点不可达而非缺数据

- 原 `src/core/tooling/compiler_csg.cheng:38922` 的 `compilerCsgMemTrace` 三段（`type_arena`/`typed_ir`/`facts`）
  位于 `TypedExprIrBindExactTypeArena` **之后**，即 typeArena 已被 move 走。
  实证：**before 驱动 + `CHENG_CSG_MEM_TRACE=1`，三夹具 `tag=type_arena` 命中 0 次 = 死码**。
- 位移后新址 38912-38920：merged forest 之后、精确类型绑定之前，arena 仍在本体上。
  纯 9 行位移，自证：删除该块后新旧全文逐字节相同。已入库 `43e12c322`（9+/9−）。
- byte 等价（同一 `--out` 路径，before==after 逐字节）：ordinary `0feb7970ceee652a…` /
  call_fixture `3c47674d1196a348…` / v6 `a72e067376664a87…`。
  驱动 sha：before `7e7c252b…`（rc=0，196s）/ after `b2228aa2…`（rc=0，197s）。
- 档存 `docs/campaigns/2026-08-31-kernel-userpath/patches/s1b0_b5marker.patch`（sha256 `865adf2a…`，
  `git apply --check -R` 干净）。
- **该埋点每次 build 只发射一次（merged 之后）**，per-source 曲线当前不存在；要曲线须改源码加新埋点，
  暂不批（见 20.3 判词：门内生产阶段不可达，曲线无决策用途）。

### 20.2 夹具相 TypeArena 数字（如实照录，量级极小，不得外推）

| 夹具 | cap | used | types | tokens |
|---|---|---|---|---|
| ordinary_zero_exit_fixture | 1048576 | 3008 | 15 | 9 |
| call_fixture | 1048576 | 3520 | 15 | 20 |
| v6_direct1_repro | 1048576 | 25920 | 21 | 259 |

判词：夹具相 TypeArena 恒 1MiB cap、峰值 25.9KB used ⇒ **夹具相 TypeArena 不是内存项**，
这些数字不得用于任何 768MiB 结论（夹具规模与 234 源全量无可比性）。

### 20.3 全量自烤首轮：门内死在 forest 累积侧，TypeArena 生产不可达

- 单进程 rc=125（175s，`lease_hits=0`），stderr 末两行原文：
  ```
  csg_mem tag=forest src=61 bytes=4490368 rss=632931288 live=1770656
  compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=919094424 limit_bytes=805306368
  ```
- trace 全序列只到 `forest_parsed src=60`（62 条 `forest` / 61 条 `forest_parsed`）
  ⇒ **merged forest 与 TypeArena 生产均未跑到**。
- 死点 `src=61`（`primary_object_plan.cheng`）与本文件 §六 / tamem3 记载**逐字一致 = 独立复现**。
  该轮与 P-B 自烤并发，但单进程 rss 不受他进程影响，且死点复现 ⇒ 该轮 rc=125 **仍为有效证据**。
- **结论（本轮最硬）：现树在 768MiB 门内，"TypeArena 本体"不可达，内存墙完全在 forest 累积侧。**
  因此"TypeArena 撑爆 768MiB"既不可证实也不可证伪，须靠抬门诊断取数（该数**只能标 diagnostic**，
  禁止被引用为"门内可达"的证据）。

### 20.4 槽位协议缺陷：同秒双起（22:00:00）

- B5 与 P-B 在 22:00:00 同秒各自起顶层 kd 自烤：`.PAUSE.flag` 是 check-then-act，**无互斥语义**。
- `lease_hits=0` ⇒ **原子树租约不覆盖顶层 kd 自烤**，不能指望它挡并发。
- 新协议：`mkdir .rebuild/COMPILE_SLOT.lock` 原子 test-and-set（成功即持有，失败即退让）；
  锁目录内写 owner pid + 起始时间；退出 trap 删锁；清陈旧锁前必须确认 owner pid 已死。

### 20.5 「84 行脏 → 27 行」定谳：安装者自己的探针版被自己的无探针终版替换，**无第三方内容被抹**

- 采样：21:5x（P-B 22:00 安装之前）该文件 `git diff --numstat` = **84 行**；安装后 27 行（现 32+/5−，8 hunk）。
- 决定性对账：`pristine`（`/private/tmp/pb_probe/primary_object_plan.cheng.pristine`，sha256
  `87ecef8d24ef693daef711bab6096ef01e381d6cee8ad320bc41fe25b29332d2`，mtime 19:51）与
  `git show HEAD:src/core/backend/primary_object_plan.cheng` **逐字节相同**（`diff -q` = IDENTICAL）
  ⇒ 该文件的整文件安装通道在结构上只可能产出「HEAD + 安装者自己的 hunk」，**不可能吞掉第三方内容**。
- 版本序列（中间版均留存于 `/private/tmp/pb_probe/`，可复算）：probe5(20:43)=57+/4−；probe6(20:50)=29+/9−；
  probe7(20:56)=34+/1−；**probe8(21:04)=76 insertions + 8 deletions = 84 行** = 我方 21:5x 采样值；
  21:59 以 probe-free 终版（+27）替换。⇒ 「余 57 行」是 84−27 的算术差，**不是被抹掉的第三方 WIP**。
  两个 MoveInto 审计/门禁代理均书面否认写入该文件且无副本，旁证齐全（其中一条旁证：审计期间
  `src/tests/ug_s1b0_v6.cheng` 在它 `os.walk` 之后消失——那是 B5 自删的临时夹具，即当时活跃他线就是 B5）。
- 真实失误在流程：19:51 验过一次干净，其后至 22:00 装了约 10 版（每轮探针一版）**均未复验**。
  **纪律升级（已入 `lessons.md`，提交 `8f6a9284f`）：共享热文件只许 patch 通道
  （`diff -u` → `git apply --check` → `git apply`），上下文冲突即停并上报；`cp` 整文件安装全面禁止。**
- 槽位交接实录：P-B owner 63561 于 22:16:57 死亡；B5 于 22:17:36 用 `mkdir` 合法取得（owner_pid=93579）并起 A 轮
  ⇒ 「22:45 kill 63561」口令作废（发给已不存在进程的期限）。

## 二十一、A/B 双轮定谳：768MiB 门内墙在 pass0 forest 累积 + pass1 并林是时间墙

**运行口径**：驱动 = `.rebuild/run_b5/kd`（§二十 位移入库 43e12c322 后 C 链烤制，`kd_sha256=b2228aa29cb0d198d1d3d6b6a711e8873e65e20278c468940a63c2a7779b46f0`，bake rc=0/197s，`lease_hits=0`）；env = 禁缓存四件套 + `BACKEND_JOBS=2` + `CHENG_CSG_MEM_TRACE=1` + `CHENG_COMPILER_CSG_STDERR=1`；入口 `src/core/tooling/backend_driver_dispatch_min.cheng`，`--emit:exe --target:arm64-apple-darwin`，原始 stderr 全留。
**槽位**：改用 `mkdir .rebuild/COMPILE_SLOT.lock` 原子 test-and-set（22:00:00 出现过 `ps`+协作旗标的同秒双起，check-then-act 不是互斥原语）；B5 于 22:17:36 取得（owner_pid=93579），A/B 全程 `lease_hits=0`，**22:41:43 释放**（`trap` 按 owner 校验后 `rm -rf`，见 `.rebuild/run_b5/release_lock.sh`）。

### 21.1 A 轮（默认 768MiB 内门，干净槽位，独立复证）

- `label=A_default gate=default rc=125 wall=176s`，`lease_hits=0`，`guard_hits=1`，`forest_parsed_lines=61`，`forest_appended_lines=0`，**`type_arena_lines=0`、`typed_ir_done_lines=0`、`facts_lines=0`**。
- stderr 末两行（原文）：
  `csg_mem tag=forest_parsed src=60 arena=246432 rss=651346928 live=1770670`
  `csg_mem tag=forest src=61 bytes=4490367 rss=651068400 live=1770656`
  `compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=836388064 limit_bytes=805306368`
- 峰值行 = 守卫自身读数 `836,388,064 B`（797.6 MiB）> `limit=805,306,368`；trace 采样峰 `716,883,000 B`（683.7 MiB，`forest_parsed src=47 arena=63019296`）；死前最后 stage `csg_stage=after_profile_source_payload_release since_ms=38320 rss_bytes=627901400 live_allocations=1470371`。
- 前 61 源 pass0 Σ=`255,983,072 B`=244.1 MiB（`A_default.progression.tsv` 62 行）。
- 对照（并发污染轮，22:00–22:03，被 P-B `pkill -9 -f system-link-exec` 波及前）：同点死在 `forest src=61`，守卫读数 `919,094,424 B`；该轮留 `.rebuild/run_b5/full/polluted.*`。单进程 RSS 与并发无因果，权威值取干净槽位的 `836,388,064 B`。
- 判词：**768MiB 门内的墙在 pass0 forest 累积侧**（`src=61` 单源 131.76 MiB 树 + 保底 609-627MB 撑穿 805MB 线）；merged forest 与 TypeArena 生产**都没跑到** ⇒ 位移后的 `type_arena` 埋点在门内不可达。

### 21.2 B 轮（诊断/抬门 4GiB，env-only）

- 抬门方式：`CHENG_PARENT_RSS_GUARD=1` + `CHENG_PROCESS_MAX_RSS_BYTES=4294967296`（`BackendDriverDispatchMinConfiguredMaxRssBytes` 对非空 `CHENG_PARENT_RSS_GUARD` 返回 0 = 关自守卫），**未开外层守卫**；`label=B_raised4g gate=raised rc=143 wall=1271s`，其中 **rc=143 是 B5 于 22:41:43 主动 SIGTERM 停止**，非外部所杀；`guard_hits=0`、`lease_hits=0`。
- pass0 完整：`forest_parsed_lines=234`，**Σ=`1,290,508,960 B`=1,230.73 MiB，与 §六 记载逐字节一致**；Top5 单源 arena：`src134=140,599,840 B(134.09 MiB)`、`src61=138,162,976 B(131.76 MiB)`、`src158=73,405,440 B(70.00 MiB)`、`src132=70,228,960 B(66.98 MiB)`、`src47=63,019,296 B(60.10 MiB)`（与 §八 同序）；pass0 末行 `forest_parsed src=233 arena=117280 rss=781288480`。
- 关键 stage：`after_profiles rss_bytes=395625264` → `after_reachable_function_set rss_bytes=448316256` → `after_profile_source_payload_release rss_bytes=609387432` → `forest_build_start mode=reparse rss=609387432`。
- pass1（并林）：`forest src=0 bytes=6917 rss=2072512456`（精确预留 1.23GiB 触页，RSS 745→1,985.7 MiB）→ `forest_appended src=0 forest_arena=266976 rss=2082195424` → `forest_appended src=1 forest_arena=883072 rss=2107262968` → `forest src=2 bytes=817253 rss=2107262968`，此后 **16+ 分钟零输出、100% CPU、RSS 回落 453MB**（`ProcessMemoryPressureRelief` 把预留未触页归还）。
- 两次 `sample`（22:39 / 22:41）栈**完全相同**：`parser.ParserValueExprTreeAppendFromImpl`（`cheng_cold_1872a785_3872`）← `ccsg.CompilerCsgBuildParserForestAuthorityInto`；热点 2223/3769 采样在 `langintern.Intern`/`FindInternId`（59%）、1543/3769 在 `strings.CloneStr`→`cheng_malloc`（41%）。
- 峰值 `max_rss=2,107,262,968 B`=2,009.6 MiB；**`type_arena_lines=0`、`typed_ir_done_lines=0`、`facts_lines=0`、`forest_appended_lines=2`、`src_done_lines=0`**。
- 判词：**pass1 并林在 Cheng 链上是时间墙**（不只是内存墙）；`type_arena` 本体字节在本口径下**仍无实测值**。

### 21.3 卡死源定位：`src/core/analysis/cleanup_cfg.cheng`

- 自研闭包解析器（`.rebuild/run_b5/closure_estimate.py`）对 driver 入口复算 **234 源 / 30,544,352 B**，与 bake report `compile_input_source_file_count=234` / `compile_input_source_byte_count=30,547,003` 对拍通过。
- 234 源按 `src/` 相对模块路径字典序（`.rebuild/run_b5/identify_src2.py`）：
  `index2 = core/analysis/cleanup_cfg`（**817,253 B**）——与 B 轮 trace `forest src=2 bytes=817253` **逐字节相等**；
  同法交叉验证 `index61 = core/backend/primary_object_plan`(4,490,367 B = A 轮 `forest src=61 bytes=4490367`)、`index134 = core/lang/typed_expr`、`index132 = core/lang/parser`、`index158 = core/tooling/compiler_csg`、`index47 = core/backend/lowering_plan`、`index170 = core/tooling/compiler_snapshot_builder` —— 与 §八 的索引→文件映射**全对**。
- `cleanup_cfg.cheng` 规模：16,458 行 / 811 声明 / 最长行 1,070 B。**风险外推**：S1b-2/3 删的是「合并森林」分支，不删 intern 本身；若该 append 的代价是「大源 append 固有」，删并林后全量构建仍可能跑不完 ⇒ 已另开单源 append 计时（`.rebuild/run_b5/single/`，默认门 + 6min 时间盒，入口 `src/core/analysis/ownership_drop_ir.cheng`，10 源闭包含 `cleanup_cfg`），判「是否挂死」二元事实。

### 21.4 TypeArena 与 forest arena 的口径关系（明确判定）

- **不是同一 buffer 重复计数**：`TypedExprTypeArenaBuildFromParserTreeInto`（`typed_expr_type_arena.cheng:5776-5778`）`value.arena = arenamod.ArenaInitDefault(1048576)` + 独立 `internPool`，与 `ParserValueExprTree.arena` 为两个独立分配；TypeArena 只是把森林的**部分列重新物化**（token 4 列 `tokenProducerSourceIndexes/tokenKinds/tokenSpanStarts/tokenSpanEnds`，加 typeSyntax/function/genericSymbol/type/symbol 若干 `ArenaArrayInt32` 列）。
- **时序上不可加**：`CompilerCsgTypeArenaFinalizeParserForestInto` 在 `:35545 TypedExprBuildStructuredTypeArenaFromParserTreeInto` 之后立刻 `:35553 parser.ParserValueExprTreeRelease(work.typeArenaParserForest)`（`ArenaRelease`+`InternPoolRelease`+`tree=nil`）⇒ 位移后的 B5 埋点（`:38912-38920`）看到的 TypeArena 是森林内存的**后继**，其 `used` **不得**与 1,230.73 MiB 相加。
- **真正的相加点在并林生产窗**：`:35545` 那一刻整块森林仍活、TypeArena 正在生长 ⇒ 该窗峰 = 森林(1,230.73 MiB) + TypeArena(部分→全量) + 保底驻留(`after_profile_source_payload_release` = 609,387,432 B)。「重复计数」的真实位置是这份**同窗共驻**，不是同一批内存被数两次。
- 结论：本形态下「TypeArena 占 768MiB 多少」不可判定（两轮 0 行）；可判定的是**它不可能是门内决定项**——门在它之前已被森林单独穿透（Σ=1,230.73 MiB = 805,306,368 B 的 **1.60×**）。

### 21.5 证据清单（原始件，未截断）

- `.rebuild/run_b5/full/A_default.stderr.txt`（148 行）、`A_default.progression.tsv`（62 行）、`A_default.summary.txt`
- `.rebuild/run_b5/full/B_raised4g.stderr.txt`（497 行）、`B_raised4g.progression.tsv`（235 行）、`B_raised4g.summary.txt`
- `.rebuild/run_b5/full/B_sample.txt`、`B_sample2.txt`（两次栈，identical）
- `.rebuild/run_b5/full/polluted.{stderr.txt,summary.txt}`（22:00 并发污染轮）
- `.rebuild/run_b5/full/module_paths.txt`、`identify_src2.py`、`.rebuild/run_b5/closure_estimate.py`
- 会话/槽位：`.rebuild/run_b5/locked_runs2.log`（22:17:36 取得锁 → 22:41:43 释放）、`acquire_lock.sh`、`release_lock.sh`

### 21.6 S1 纠错与规律收敛（2026-09-10 深夜续）

**① 入口选错的自纠（方法论）**：为做「单源 append 计时」先选 `src/core/analysis/ownership_drop_ir.cheng` 作入口，理由是 `grep -rln "import cheng/core/analysis/cleanup_cfg" src/` 命中该文件。**错了**——该命中在第 2525 行，是注释不是 import。判据必须换成**编译真跑出来的闭包**：S1 的 trace 只有 10 条 `forest_parsed`（`ownership_drop_ir` + 9 个 std），`cleanup_cfg` 根本不在内。此后入口一律用 `.rebuild/run_b5/closure_estimate.py` 复算 + 编译 trace 对拍。

**② S1 实测（默认门、`--emit:obj`、无时间盒截断）**
- `rc=1 wall=221s`，`lease_hits=0`，`guard_hits=0`（**不是门杀**）。
- `forest_parsed=10`、**`forest_appended=10`（10/10 append 全部完成，没挂）**、`type_arena=0`（未到埋点）。
- 死在 forest 窗**之后**的 profile 相：`csg_stage=r92_t1_pre_view_begin since_ms=558` 之后进程以 rc=1 结束。
- 阶段计时：`csg_stage=after_profile_lookup since_ms=207026` = 自上一 stage（`after_profile_source_payload_release`）起 **207s**，覆盖整段 forest 两遍 merge + `decl_index` + `typed_context_lookup_built` + lookup ⇒ **10 源 / 0.4 MiB 的闭包，光森林相就吃 207s**。
- 原始件：`.rebuild/run_b5/single/S1.{stderr.txt,timeline.txt,summary.txt}`。

**③ 规律收敛：不是 cleanup_cfg 专属，而是「闭包内首个大源 append 的固有代价」**

| 轮 | 闭包 | append 序列 | 停摆点 |
|---|---|---|---|
| B（抬门 4GiB） | 234 源 | src=0(6,917B)、src=1(9,952B) 正常 | **src=2 = cleanup_cfg 817,253 B（首个大源）→ 16+min 未完成，栈在 `ParserValueExprTreeAppendFromImpl`** |
| M1（默认门） | 29 源 | src=0、src=1 小源正常 | **src=2 = parser 1,729,036 B（首个大源）→ 停摆 20min 后由我方 SIGTERM 停止（时间盒判词）** |
| S1（默认门） | 10 源 | 最大源（263,042B）排第一 | 10/10 完成，但 forest 窗 **207s**（大头在此） |

- 可断言：**停摆落在 `ParserValueExprTreeAppendFromImpl`（S1b 要删的那条并林 append 分支）上，不在共享的 parse 相**（B 轮 pass0 的 234 源 parse-only 约 290s；S1 的 parse 相秒级）。
- **不可断言**：删掉并林分支后全量构建是否就能跑完——**仍未定**。若 S1b 的流式方案仍跨源共用同一 intern pool，同一代价可能被继承；需 S1b-2 的消费侧埋点或专门探针来判，不在本轮证据范围内。

**④ intern 路径代码事实（只读实读，未改任何字节）**
- `src/core/lang/intern.cheng:252-260` `internPoolTextHash` 逐字：
  `var hashValue = (uint64(1469598103) * uint64(1000000000)) + uint64(934665603)`
  实测字面量 = **1,469,598,103,934,665,603（19 位，0x14650FB0739D0383）**；正确 FNV-1a 64 位 offset basis `0xCBF29CE484222325` = **14,695,981,039,346,656,037（20 位）**；关系 `correct == measured*10 + 7`，即 measured 正好是正确值**去掉末位数字 7**（少一位十进制位）。prime 侧 `1099511628*1000+211 = 1,099,511,628,211` 与标准 FNV-1a 64 prime **相等**（无错）。
- `FindInternId`（`:751-780`）：`slot = hashValue & indexMask`；`step = int32(hashValue >> 32) | 1`（`:765`）；探测循环上界 **`for scanIndex in 0..<mask`（最坏 = 全表 cap-1 次探测）**，每步 `LookupInternShared`（`:831-835`，`share(texts[id])`，O(1) 但带一次 refcount）+ `internPoolTextExact`（整串逐字节比对）。
- 增长触发（`:312`）：`if (used + 1) * 8 >= cap * 7:`（负载 ≥ 87.5%）→ `HashMapNextPow2(cap*2, 8)` 全量重哈希（重插循环 `:335`，步长同式 `:354`）。
- 判读边界：「常量少一位」是**事实**（偏离标准 FNV-1a 初值），但它是**均匀**改变初值（仍是奇数大常量），仅凭读码**不能**证明它就是停摆根因；`87.5% 上限负载 + miss 最坏全表扫描 + 高位派生探测步长 + 每探测一次整串比对` 是同等或更大的结构嫌疑。根因要做实需探测计数直方图（需埋点，未批准），本轮不下断言。

**⑤ 证据**：`.rebuild/run_b5/single/`（S1 全套）、`.rebuild/run_b5/medium/`（M1 原始 stderr/summary）、`.rebuild/run_b5/scan_entries.py`、`entry_list_all.txt`（无大源档筛选：`did_subscribe_smoke` 37 源/最大 139KB、`vpn_proxy_tcp_tls_handshake_smoke` 40 源/最大 178KB）。

### 21.7 TypeArena 取数三路尽墨 + M3/M4 双档实测（2026-09-11 凌晨续）

**裁决：停止追 TypeArena 本体数字。** 依据：它早已判定不可能是 768MiB 门内的决定项（独立 `arena`+`internPool`、尺寸上界 ≤ 森林，而森林单项 `1,290,508,960 B`=1,230.73 MiB 已是门的 1.60×）。三条取数路线全部失败：

| 路线 | 入口/口径 | 结果 |
|---|---|---|
| ① 234 源全量 | `backend_driver_dispatch_min.cheng`，默认门/抬门 4GiB | 默认门死在 `forest src=61`（rc=125，`836,388,064>805,306,368`）；抬门后 pass1 并林在首个大源 append 停摆（§21.2/§21.6）⇒ `type_arena` 0 行 |
| ② M3 无大源档 | `src/tests/did_subscribe_smoke.cheng`（37 源/总计 706KB/最大 139KB） | `rc=1 wall=86s`、`lease_hits=0`、`guard_hits=0`；**`forest_parsed=37`、`forest_appended=18`（18/18 全过、零停摆）**；`type_arena=0`、`typed_ir_done=0`、`max_rss=279,184,080 B` |
| ③ M4 无大源档 | `src/tests/vpn_proxy_tcp_tls_handshake_smoke.cheng`（40 源/最大 178KB） | `rc=2 wall=5s`、`lease_hits=0`（**非租约碰撞**）、`forest_parsed=0`；`type_arena=0` |

**M3 死点原文**（`.rebuild/run_b5/medium/M3_did_subscribe.stderr.txt` 末行）：
`parser forwarding production: invalid appended forest: parser forwarding production: authority invalid row=5279 kind=5 arm=0 auth_kind=7 auth_row=506 expected_auth=0 owner=5278 span=19695:19712 source_local=1073 producer=8`

**M4 死点原文**（`.rebuild/run_b5/medium/M4_tls_handshake.stderr.txt` 末行）：
` compiler csg: normalized decl read failed: /Users/lbcheng/cheng-lang/src/quic/tls/handshake13.cheng: parser value expr: expression event trailing token offset=143708 statement_offset=143707`

**正面副产品（比 TypeArena 数字值钱）**：M3 用**无大源闭包**跑出 18/18 append 全过、零停摆（86s wall）⇒ 与 B（首个大源 817KB 停摆 16+min）、M1（首个大源 1.73MB 停摆 20min 被杀）、S1（最大源排第一吃掉 207s 森林窗大头）构成**双向对照**：有首个大源则停、无则过。§21.6 的「停摆与闭包内首个大源强相关」由单向观察升级为双向证据。

**健康度声明（不许当没看见）**：M3/M4 两条内部错原文全留（见上），二者**不是本工作流（B5 埋点位移 + intern 探针）的产物嫌疑**——同一驱动下三夹具 sha256 逐字节相等且 rc=0 ⇒ 通用路径未被破坏；此二入口健康度属**测试面问题，非本工作流结论，另案**。

### 21.8 intern 探针实验 v1：byte 等价**真绿** + 停摆盒到期探针零行（读法二义，判词**未定**）

**① 假绿事故记录（原文保留，已入 `lessons.md`，提交 `f0758f7da`）**：23:41 首跑第 [3] 步打印了 `BYTE-EQUALITY-OK (three fixtures identical to recorded before/after shas)`，**该判词无效**。机理：`kd_probe` 根本不存在（bake `rc=2 wall=4s`），`run_fixtures.sh` 三夹具编译 `rc=127`，`fixtures/*.exe` 保留的是 **21:56 的旧产物**，于是把旧 sha 又算了一遍 ⇒ 测的是上一次的自己。**加固三条门（缺一不可）**：(i) 判等价前 `rm -f fixtures/*.exe`，分母必须是本轮新生成产物；(ii) 三夹具必须全 `rc=0` 否则 abort 不判等价；(iii) 驱动不存在即非零退出（`exit 8`）不跑探针。

**② 首跑 bake 失败真因（不是环境，是自己的 patch）**：`lease_hits=0` 排除租约；`bake_probe.log` 原文
`cheng_cold: borrowed actual cannot bind non-var non-@borrows formal ... caller=langintern.FindInternId callee=langintern.InternProbeStatsStep` → `borrowed call argument rejected` → `reachable function body missing: langintern.FindInternId` → `[cheng_cold] primary object emit failed`。修法：`InternProbeStatsStep` 加 `@borrows`；修后 patch **+48/−0**、`git apply --check` OK、sha256 `5a25eb0123456f285cd3713ac91965eee1b8e9ea3c2276b3a11435aef9727a85`。

**③ v1 真绿（本轮新生成产物，含 rc 前置门）**：探针驱动 `kd_probe` sha256 `8b2756548710710fb80f4f9f58cb30fbe4e98fc2c3738217bff5a4611a914956`；三夹具**全 rc=0** 且 sha256 与记录值逐字节相等：
`ordinary 0feb7970…(92s)` / `call_fixture 3c47674d…(97s)` / `v6 a72e0673…(114s)` ⇒ **计数器对发射字节中性**（该轮未开 `CHENG_INTERN_PROBE_STATS`）。

**④ v1 探针跑（`CHENG_INTERN_PROBE_STATS=1`，入口 `typed_expr_type_arena_smoke`，20min 盒）**：
`verdict=timebox_expired rc=143 wall=1213s`、`lease_hits=0`、`guard_hits=0`、`forest_parsed=29`、`forest_appended=2`、`type_arena=0`、`max_rss=369,443,608 B`；末行 `csg_mem tag=forest src=2 bytes=1729036 rss=369443608`（与 M1 同点停摆）。
**`intern_probe` 发射行 = 0**（20 分钟内一行未发）。**判词：未定**——v1 设计无法区分两种读法：(a) 20 分钟内累计探测步数 < 4,194,304（发射阈值）⇒ 非"探测爆炸"；(b) 行已写入但滞留 stderr 缓冲，盒到期 SIGTERM 时丢失（v1 未加 flush，且 4M 阈值可能全程未跨过）。**不外推、不裁任何一种**。

**⑤ 树与槽位状态**：`intern.cheng` 已 `git apply -R` 还原，working sha `fe5573b8…` == `git show HEAD:…`，`git diff --stat` 为空（零残留）；探针 patch 暴露窗 00:01:18→00:29:50 为 B5 自持锁时段（P-B 在等锁、无编译进程），锁 00:29:50 释放。原始件 `.rebuild/run_b5/probe/{P1_ta_smoke_probe.*,bake_probe.*,fixtures_probe.summary.txt,s1b0_intern_probe.patch}`。

**⑥ v2 提案（未执行，待批）**：几何阈值（65536 步起、逐次翻倍；另加 lookup 计数门）+ 每次发射后 `os.C_fflush(os.Get_stderr())`（`std/os.cheng:3978` 已公开）⇒ 彻底消除缓冲二义；代价 = 重烤 ~200s + 夹具对拍（含 rc 门）+ 20min 盒 ≈ 30min。

### 21.9 intern 探针 v2：时间墙根因锁定 = append 每 token 克隆并重 intern 整段源文本（O(tokens×源字节)）

**① v2 合法性（真绿，本轮新产物 + rc 门 + `rm -f` 分母）**：patch v2 sha256 `53f590eff9f38db2809bf505a9ebbca44dfb10cd6fbaae11b214b61c1abd78d5`（+66/−0，4 个发射点）；驱动 `kd_probe2` sha256 `2887316685cc3b1cd69e7c73bc3ab7e061393a66d3334047f6f35c9bf27d121d`（bake rc=0 wall=194s，`.rebuild/run_b5/probe/bake_probe_v2.summary.txt`）；三夹具**全 rc=0** 且 sha256 = 记录值（`0feb7970…`/`3c47674d…`/`a72e0673…`）⇒ **计数器（含 fflush/几何阈值）对发射字节中性**。

**② v2 探针跑（`CHENG_INTERN_PROBE_STATS=1`，入口 `typed_expr_type_arena_smoke`，20min 盒）**：`verdict=timebox_expired rc=143 wall=1213s`、`lease_hits=0`、`guard_hits=0`、`forest_parsed=29`、`forest_appended=2`、`type_arena=0`、`max_rss=369,509,168 B`；末行 `csg_mem tag=forest src=2 bytes=1729036`（与 M1 同点）。
**直方图（全部 5 行，原始）**：
```
intern_probe reason=steps   lookups=21519  steps=65536   worst=51 hits=7253  misses=14265 cloneCalls=14266 cloneBytes=2443465 texts=14265 idxCap=16384 idxUsed=14264
intern_probe reason=steps   lookups=44052  steps=131072  worst=51 hits=15576 misses=28475 cloneCalls=28476 cloneBytes=3183954 texts=28475 idxCap=32768 idxUsed=28474
intern_probe reason=lookups lookups=65536  steps=175404  worst=51 hits=23691 misses=41844 cloneCalls=41806 cloneBytes=4257415 texts=41    idxCap=128   idxUsed=40
intern_probe reason=steps   lookups=129961 steps=262144  worst=51 hits=87070 misses=42890 cloneCalls=42329 cloneBytes=4267463 texts=564   idxCap=1024  idxUsed=563
intern_probe reason=lookups lookups=131072 steps=263489  worst=51 hits=88159 misses=42912 cloneCalls=42340 cloneBytes=4267696 texts=575   idxCap=1024  idxUsed=574
```
5 行全部产生于开跑后 ~5s 内（stderr mtime 00:40），此后 20 分钟**零新行** ⇒ 未跨任何下一几何阈值（steps 524,288 / lookups 262,144 / cloneCalls 262,144）。

**③ 停摆栈（`sample` 实测，`.rebuild/run_b5/probe/P2_sample_now.txt`，符号经 `kd_probe2.map` 解析）**：
`BackendDriverDispatchMinSystemLinkExecWorker → ccsg.CompilerCsgBuildParserForestAuthorityInto → parser.ParserValueExprTreeAppendFrom(+164) → parser.ParserValueExprTreeAppendFromImpl(+20288)`，其中
`2228/3775` 采样落在 **`langintern.Intern(+128) → langintern.FindInternId`**（`+508`→`internPoolTextHash` 1396、`+2908`→`internPoolTextExact` 831），`1544/3775` 落在 `strings.CloneStr`→`cheng_malloc`(737)/`cheng_memset`(723)。

**④ 根因（代码级，`src/core/lang/parser.cheng:10546-10552`，原文）**：
```
    for tokenIndex in 0..<sourceTree.tokenCount:
        let sourceId = ParserValueExprTokenSourceIdAt(sourceTree, tokenIndex)
        let remappedSourceId = langintern.Intern(
            out.internPool,
            strings.CloneStr(
                ParserValueExprSourceText(sourceTree, sourceId)))
```
**每个 token 都对「该 token 所属源的整段源文本」做一次 `CloneStr`（malloc+memcpy L 字节）+ `Intern`（hash O(L) + 探测×逐字节比对 O(L)）**，此处**没有**同族站点 `:10315` 那样的 per-source 缓存（那里有 `remappedSourceIds[sourceId]` 判空复用）。⇒ 单源成本 = `tokenCount × L × (1 + 探测数)` 字节级内存流量。
量级对拍：parser.cheng `L=1,729,036 B`、tokenCount 数十万 ⇒ 10¹²–10¹³ 字节流量 ⇒ 内存带宽下 **16–20 分钟**，与 B（16+min 未完成）、M1/P2（20min 盒到期仍在同点）**量级吻合**。

**⑤ 判词（按批准二分口径）**：**不是探测爆炸**（`worst=51` 恒定，远低于当时 idxCap 16384/32768；20min 内 steps 未跨 524,288 ⇒ 平均 < 217 步/s）；**不是 hash 常量**（§21.6④ 已判、此处再证）；**是调用侧**——append 的 token 循环对整段源文本做冗余克隆+重 intern，代价随「源字节 × token 数」双线性爆炸。v1 的 P1 与 v2 的 P2 在同一入口、同一源、同一行停摆，**两轮互证**。

**⑥ 对 S1b 的直接含义**：该代价位于 `ParserValueExprTreeAppendFrom/Impl` 内，调用点是合并森林的 pass1 `compiler_csg.cheng:33162`（S1b-2/3 要删的并林分支）⇒ **删并林分支确实会移除这条时间墙**；但 `ParserValueExprTreeAppendFrom` 另有调用点 `compiler_csg.cheng:30382` 与 `parser.cheng:3646`（delta append），S1b 必须确认残余路径不会再对"大源"整体 AppendFrom，否则时间墙以别的名字复现。

**⑦ 树/槽位**：`intern.cheng` 还原后 working sha `fe5573b8…` == HEAD，零残留；v2 patch 暴露窗 00:31:46→01:00:08（自持锁、无第三方编译）；锁 01:00:08 释放。原始件全留 `.rebuild/run_b5/probe/`（`P2_*`、`bake_probe_v2.*`、`fixtures_probe2.summary.txt`、`P2_sample_now.txt`、`s1b0_intern_probe_v2.patch`）。

## 二十二、per-source remap 缓存实验：时间墙是否消除

**判词：部分缓解（数字如下）。** 被点名的 token 循环墙**已消除**（同一源 append 从"1173s 未完"变为"≤633s 完成"，29/29 append 全过，整轮 793s 自行结束、不再撞 20min 盒）；但**同一函数内同族的另一个未缓存站点**（`parser.cheng:10954-10960` typeSyntax 循环）构成等量残余墙，src=2 单源 append 仍约 590s。按二分口径问"20 分钟盒内 append 是否做完"答案是**是**；但整轮仍需 13 分钟，故不判"时间墙消除"。

### 22.1 改动前后代码原文（`read` 实读，非转述）

**改前（`src/core/lang/parser.cheng:10546-10551`，逐字，唯一缺缓存处）**
```
    for tokenIndex in 0..<sourceTree.tokenCount:
        let sourceId = ParserValueExprTokenSourceIdAt(sourceTree, tokenIndex)
        let remappedSourceId = langintern.Intern(
            out.internPool,
            strings.CloneStr(
                ParserValueExprSourceText(sourceTree, sourceId)))
```

**改后（同位置，逐字）**
```
    # Per-source remap cache, same shape as the node loop above.  This loop
    # used to CloneStr + Intern the whole source text of every token
    # (O(tokenCount x source bytes) of malloc/memcpy plus a full-text hash
    # and probe compares).  langintern.Intern looks the text up first and
    # returns the pooled id, so interning each sourceId once at its first
    # sighting keeps both the pool append order and every id value.
    var remappedTokenSourceIds: int32[]
    for tokenIndex in 0..<sourceTree.tokenCount:
        let sourceId = ParserValueExprTokenSourceIdAt(sourceTree, tokenIndex)
        var remappedSourceId: int32 = -1
        if sourceId >= 0:
            if sourceId >= remappedTokenSourceIds.len:
                let tokenRemapOldLen = remappedTokenSourceIds.len
                setLen(remappedTokenSourceIds, sourceId + 1)
                for tokenRemapFill in tokenRemapOldLen..<remappedTokenSourceIds.len:
                    remappedTokenSourceIds[tokenRemapFill] = -1
            remappedSourceId = remappedTokenSourceIds[sourceId]
        if remappedSourceId < 0:
            remappedSourceId = langintern.Intern(
                out.internPool,
                strings.CloneStr(
                    ParserValueExprSourceText(sourceTree, sourceId)))
            if sourceId >= 0:
                remappedTokenSourceIds[sourceId] = remappedSourceId
```

**同族参照（`:10303-10330` node 循环已有缓存，原文摘录）**：`var remappedSourceIds: int32[]` → `if sourceId >= remappedSourceIds.len:` 增长并填 -1 → `var remappedSourceId = remappedSourceIds[sourceId]` → `if remappedSourceId < 0:` 才 `langintern.Intern(out.internPool, strings.CloneStrRange(ParserValueExprSourceText(sourceTree, sourceId), 0, sourceLength))` → `remappedSourceIds[sourceId] = remappedSourceId`。

**为何缓存不改变 id 取值（源码核验，非引用转述）**：`langintern.Intern`（`intern.cheng:728-748`）先 `FindInternId`，命中即 `return existing`；`internPoolAppendUnique`（`:710-725`）返回 `pool.texts.len - 1`；`InvalidInternId()==-1`（`:116-117`）。⇒ 每个 `sourceId` 的首次出现仍在循环同一位置触发一次 Intern，后续 token 复用 `FindInternId` 本会返回的同一 id ⇒ **入池顺序与所有 id 取值不变**。前提**未被证伪**。

**为何用独立缓存数组而不复用 node 循环那份**：node 循环 intern 的是 `CloneStrRange(text,0,sourceLen)`、token 循环是 `CloneStr(text)`；两者内容若在任何输入上不等，共用会改 id。非负 `sourceId` 才走缓存，负值路径与旧代码逐字一致；未新增 panic、未引入新的 equal 判据。

### 22.2 patch / 驱动 / 落盘

| 项 | 值 |
|---|---|
| patch 路径 | `.rebuild/remap_exp/parse_remap.patch` |
| patch sha256 | `357d31f8f01d04b39c1aaf8387d3db0e94c462e7e06d5c692553d217d62d5f65` |
| 改动量 | `git diff --numstat` = `22 4 src/core/lang/parser.cheng`（唯一新增文件；其余条目为本仓既有第三方 WIP，见 22.6） |
| 改后 parser.cheng sha | `78eb35ac6add3253529b425e484245f19dc87f6953ace964a0fcfc6ab34a568b` |
| 原状 parser.cheng sha | `599b59c7d0bca0264a8e23e7221090e4ee175dab773c280a0de7aa441e331718`（== `git show HEAD:…`） |
| `kd_pristine`（原状树烤） | sha `68dad79a983adbf0886a411b29a25cbccc8c4d83accab4b13e3a42a1d8542b13`，bake rc=0 wall=194s，lease_hits=0 |
| `kd_remap`（带 patch 树烤） | sha `600d2d3c312d149cbe6fed74d698b9e91f6ebff69708b80abf1ab493702b0186`，bake rc=0 wall=194s，lease_hits=0 |
| 参照 `kd`（仓内旧驱动，仅用于 control） | sha `b2228aa29cb0d198d1d3d6b6a711e8873e65e20278c468940a63c2a7779b46f0` |
| 槽位 | 全程 `.rebuild/COMPILE_SLOT.lock` 自持；三段会话 owner pid 82591 / 87016 / 94523，`ps` 每次确认 `ps_others=0`，`lease_hits` 全 0 |

落盘用 `diff -u`（`/usr/bin/diff`）→ `git apply --check`（OK）→ `git apply`；撤回用 `git apply -R`，撤回后 sha 回到 `599b59c7…`（`PRISTINE-SHA-OK`）。

### 22.3 字节等价门：**同一输入路径下 pristine vs patched 逐字节相同**

三夹具的**记录值口径**（`run_fixtures.sh`，输入路径 `src/tests/ug_s1b0_<name>.cheng`）在本轮**无法照抄执行**——原因见 22.3b，先给直接证明"修复不改发射字节"的 A/B（同一 `--in` 路径、同一 `--out` 路径，两侧仅驱动不同）：

| 夹具 | 输入（两侧相同） | A=kd_pristine rc/wall/sha | B=kd_remap rc/wall/sha | primary.o |
|---|---|---|---|---|
| ordinary_zero_exit_fixture | `src/tests/ordinary_zero_exit_fixture.cheng` | rc=0 91s `0feb7970ceee652a1012542b21eb0d30750d213f29227bed3c74974074948517` | rc=0 92s `0feb7970…8517`（同） | `7b594c89a24f01f3b7478a103e126f9a9300ac444ed1d4b160fb3556df98b771` **相同** |
| call_fixture | `src/tests/call_fixture.cheng` | rc=0 93s `78b9aa5ad1065cc5ad9e41d8bf45c3afe1c73b95e1473f669fba7edac29579fc` | rc=0 98s `78b9aa5a…79fc`（同） | `abaa15ba45982e52505e9559b31c2cd8bf82df4acb261041a1a78344631c83c5` **相同** |
| v6_direct1_repro | `docs/…/fixtures/v6_direct1_repro.cheng` | rc=2 0s 无产物 | rc=2 0s 无产物 | — |

⇒ **exe 与 primary.o 两侧逐字节相同**（`[3b] compare.txt`：`exe=IDENTICAL primary_o=IDENTICAL`）。`ordinary` 一侧同时命中记录值 `0feb7970…`（control 用旧 `kd` 亦命中），说明该口径可复现历史基线。

**22.3a 记录值口径的偏差（如实记，不粉饰）**
- `ordinary_zero_exit_fixture`：**rc=0 且 sha 等于记录值 `0feb7970…8517`** ✅
- `call_fixture`：rc=0，但 sha=`78b9aa5a…79fc` ≠ 记录值 `3c47674d…a9db`；**未改动的 `kd_pristine` 在同一路径同样给 `78b9aa5a…`** ⇒ 与修复无关。机理已实测：两侧 exe 大小同为 7,451,752 B 且**仅 64 字节不同**，落在 LC_NOTE `cheng.provider`（120 B = 头 24 + 3×32）的第 3 个字段 `proofDigest`（note 偏移 88）与被签页 1805 的最后一个 code slot（文件末 32 B）；归一化 stderr 对比显示差异源是**输入路径长度**：基线（`ug_s1b0_` 前缀）`lifecycle_begin buf=85 bytes=1057532`、`first_reloc_sym=89`，本轮 `bytes=1057516`、`first_reloc_sym=73`，差值恰为 16 B = 2×`ug_s1b0_`（对象串表内嵌源路径）⇒ 链接后镜像逐字节相同，只有 proofDigest 变。
- `v6_direct1_repro`：**两侧均 rc=2、0s、无产物**，stderr 单行 `system link plan: entry module identity unavailable source=/Users/lbcheng/cheng-lang/docs/campaigns/2026-08-31-kernel-userpath/fixtures/v6_direct1_repro.cheng`。规则实读 `compiler_world.cheng:1129` → `parser.cheng:37475`：模块身份要求源路径落在 `<packageRoot>/src/` 前缀下，`docs/` 路径必然被拒；与 patch 无关（两侧同码同因）。

**22.3b 与硬规矩的冲突（需主线程裁决）**：要照抄记录值必须把夹具复制到 `src/tests/ug_s1b0_<name>.cheng`（`run_fixtures.sh` 的既有做法）。本次任务同时硬性禁止改 `src/**` 除该循环外的任何位置，二者不可兼得；**本轮选择不改 `src/**`，改用同一路径 A/B 作为字节中性证明**（证据强度不低于记录值比对：记录值比对本身会掺入路径效应，A/B 不会）。若必须照抄记录值，请授权临时创建/删除 `src/tests/ug_s1b0_{call_fixture,v6_direct1_repro}.cheng` 后再跑一轮。

### 22.4 时间墙入口实测（`src/tests/typed_expr_type_arena_smoke.cheng`，默认门 + `CHENG_CSG_MEM_TRACE=1`，盒 1200s）

| 口径 | 修复前（§21.9 P2 原始件） | 修复后（本轮 `kd_remap`） |
|---|---|---|
| 盒结果 | `verdict=timebox_expired rc=143 wall=1213s` | **`verdict=finished rc=1 wall=793s`（未到期，自行结束）** |
| append | **`forest_appended=2`（2/29，卡在 src=2）** | **`forest_appended=29`（29/29）**，`forest_parsed=29` |
| 后续相 | `type_arena=0`、`typed_ir_done=0` | `type_arena=0`、`typed_ir_done=0`；已推进到 `r92_t4_post_rowindex` / `r92_t5_post_structured` |
| 内部阶段 | 未发出 `after_profile_lookup` | `csg_stage=after_profile_lookup since_ms=774266` ⇒ 森林窗 **774.3s** |
| lease/guard | lease_hits=0、guard_hits=0 | lease_hits=0、**guard_hits=0**（未撞 768MiB 门） |
| max_rss | 369,443,608 B（P2 369,509,168 B） | 772,605,104 B（`rss_bytes` 峰值 782,042,288 B < 805,306,368 B） |
| 末尾 | 卡在 `csg_mem tag=forest src=2 bytes=1729036` | `typed expr: frozen module const query before build-index seal source=/Users/lbcheng/cheng-lang/src/std/bytes_layout.cheng name=FixedBytes32Size` |

**逐源完成时刻**（stderr 按 5s 采样 + 每次刷盘边界换算，原始件 `timebox/REMAP_ta_smoke.timeline.txt`）：src=2 的行在 **el=633s** 首次可见，src=3 el=668、src=4 el=668、src=5/6 el=673，此后约每 5s 一源，src=28 el=788。⇒ **src=2（parser.cheng，1,729,036 B）单源 append 由"1173s 未完"变为"约 590s 完成"**（起点 el≈40）。

**>60s 零输出窗（口径：stderr 字节数不变）**：修复后仍有 **598s**（el=35→633）；修复前同口径为 **1173s**（el=40 后直到被杀零字节）。**读法必须声明**：该驱动的 stderr 是块缓冲（刷盘呈跳跃：6367→6513→6801→…），字节静默**不能**当停摆证据；修复前那 1173s 另有 `sample` 栈证据（§21.9④）+ `forest_appended=2` 双重坐实停摆，本轮 598s 内进程确有进展（期间完成 src=2 的 append 并继续）。**"是否有 >60s 零输出窗"= 是（598s）；"是否停摆"= 否（有栈与计数反证）。**

**残余 590s 的归因（本轮新测，`sample` + `lldb` 符号解析，非推断）**：el≈132 采样的 3741 个样本 **全部**落在 `ParserValueExprTreeAppendFromImpl`：2203 个在代码偏移 **+49068**（调用 `langintern.Intern`），1534 个在 **+49036**（调用 `strings.CloneStr`）。对这两个 PC 做 `lldb image lookup` + 反汇编，紧邻的前序调用为 `cheng_cold_af2143cb_3987 = parser.ParserValueExprTypeSyntaxSourceIdAt`（`parser.cheng:15922`）与 `cheng_cold_af2143cb_3895 = parser.ParserValueExprSourceText`（`:14020`）⇒ **热点是 `:10954-10960` 的 typeSyntax 循环**，不是被修的 token 循环（该处无缓存判分支；`remappedTokenSourceIds` 生效后 token 循环每源只 clone 一次）。佐证：同入口 300s 盒（`timebox/REMAP_short.summary.txt`）仍停在 src=2（`verdict=timebox_expired rc=143 wall=310s`、`forest_appended=2`、`max_rss=308,396,800`），说明 src=2 的代价 >300s 且并非 token 循环所致。

### 22.5 同族调用点核查（只读，未改）

- **`src/core/tooling/compiler_csg.cheng:30382`** 与 **`src/core/lang/parser.cheng:3646`** 都调 `parser.ParserValueExprTreeAppendFrom`（`parser.cheng:10218`）→ `ParserValueExprTreeAppendFromImpl`（`:10222`）——**即含该 token 循环的同一个函数**。两处**都不各自持有缓存**（缓存只可能在 impl 内），因此本次单点修复**同时覆盖两者**，无需（也不应在）调用点加缓存。`compiler_csg:30382` 传的是 `functionLayer.valueExprTree`（`producerSourceCount==1`，见 `:30359`），`parser.cheng:3646` 传的是 delta 层树，二者都走同一 impl。
- **额外发现（同族、同样缺缓存，本次未改）**：同一 impl 内还有两处逐项 `CloneStr(整段源文本) + Intern`：
  - `:10954-10960`：`for typeNodeIndex in 0..<sourceTree.typeSyntaxCount:` → `Intern(out.internPool, CloneStr(ParserValueExprSourceText(sourceTree, sourceTypeSourceId)))` —— **本轮实测即为残余时间墙**（22.4）。
  - `:11664-11675`：`for regionIndex in 0..<sourceTree.regionCount:` → 同一形状，未测出热度，**是否成墙未定**。
  - （`:14533` 的 `langintern.Intern` 是词法期每源一次，非循环站点，不在同族。）

### 22.6 树状态与原始件

- 结束时 `git diff --numstat`：本工作流只新增 **`22 4 src/core/lang/parser.cheng`**（修复**保留在工作树**，未 commit）；其余 9 条为本轮开始前既有的第三方 WIP（`git diff` 与 `numstat.baseline.txt` 逐行对拍，delta 仅上述一行）。
- 原始件全在 `.rebuild/remap_exp/`：`parse_remap.patch`、`patch.sha256`、`parser.patched.sha256`、`post_revert.sha256`、`kd.sha256`、`bake_remap.{log,summary.txt}`、`bake_pristine.{log,summary.txt}`、`fixtures_{control,remap}.summary.txt`、`ab/{A,B}.summary.txt`、`ab/compare.txt`、`ab/{A,B}_*.{exe,exe.primary.o}`、`remap.*.{stdout,stderr}.txt`、`timebox/REMAP_ta_smoke.*`（stderr/timeline/summary/sample/windows）、`timebox/REMAP_short.*`（含 `sample1.txt`）、`kd_{remap,pristine}.map`（符号解析用）、`session{,_ab,_short_probe}.log`、`numstat.{baseline,final}.txt`、`ps.*.txt`、`analyze_timebox.py`、`make_patch.py`、`run_fixtures_remap.sh`、`session_remap.sh`、`session_ab.sh`、`session_short_probe.sh`、`timebox_remap.sh`。
- 槽位：三段会话均自持 `.rebuild/COMPILE_SLOT.lock` 并按 owner pid 释放（`LOCK-RELEASED owner=82591/87016/94523`），无第三方编译（`ps_others=0`），无租约碰撞（`lease_hits=0`）。

### 22.7 续做 1：typeSyntax 循环同样加 per-source 缓存（patch 2）

**改动前（`parser.cheng:10972-10978`，patch1 落盘后的行号；`read` 逐字）**
```
    for typeNodeIndex in 0..<sourceTree.typeSyntaxCount:
        let sourceTypeSourceId = ParserValueExprTypeSyntaxSourceIdAt(
            sourceTree, typeNodeIndex)
        let remappedTypeSourceId = langintern.Intern(
            out.internPool,
            strings.CloneStr(
                ParserValueExprSourceText(sourceTree, sourceTypeSourceId)))
```

**改动后（同位置，逐字）**
```
    # Per-source remap cache for the type-syntax loop, same shape as the
    # token loop above.  Every type-syntax row re-cloned and re-interned
    # the whole source text of its source; langintern.Intern looks the text
    # up first and returns the pooled id, so interning each sourceId once at
    # its first sighting keeps the pool append order and every id value.
    var remappedTypeSourceIds: int32[]
    for typeNodeIndex in 0..<sourceTree.typeSyntaxCount:
        let sourceTypeSourceId = ParserValueExprTypeSyntaxSourceIdAt(
            sourceTree, typeNodeIndex)
        var remappedTypeSourceId: int32 = -1
        if sourceTypeSourceId >= 0:
            if sourceTypeSourceId >= remappedTypeSourceIds.len:
                let typeRemapOldLen = remappedTypeSourceIds.len
                setLen(remappedTypeSourceIds, sourceTypeSourceId + 1)
                for typeRemapFill in typeRemapOldLen..<remappedTypeSourceIds.len:
                    remappedTypeSourceIds[typeRemapFill] = -1
            remappedTypeSourceId = remappedTypeSourceIds[sourceTypeSourceId]
        if remappedTypeSourceId < 0:
            remappedTypeSourceId = langintern.Intern(
                out.internPool,
                strings.CloneStr(
                    ParserValueExprSourceText(sourceTree, sourceTypeSourceId)))
            if sourceTypeSourceId >= 0:
                remappedTypeSourceIds[sourceTypeSourceId] = remappedTypeSourceId
```
**独立缓存数组**（`remappedTypeSourceIds`，不与 token/node 循环共用）：未实读证明三处 intern 文本逐字节同形，故不复用。非负 id 才走缓存、负值路径与旧代码逐字一致；不改 intern 顺序/id 取值/equal 判据；未新增 panic。

| 项 | 值 |
|---|---|
| patch 2 | `.rebuild/remap_exp/parse_remap2.patch`，sha256 `c1dc89c610c8dd80b54e8859be77cee3145dc0fe17ebfd062c4c66802c854c02` |
| 两处修复合计 numstat | `43 8 src/core/lang/parser.cheng`（**仅此一行**） |
| 两处修复后 parser.cheng | `2902d2e18b45605c3e1096a3cdbe52634c3a095f942411d22ee7eb94ecbb9198` |
| `kd_remap2` | sha `e604caef6c1d72bc05b309ad0bbcf751642e41f242f163b6837f58be79d71e65`，bake rc=0 wall=194s，lease_hits=0 |
| 字节等价门（同路径 A/B，`cmp` 对已存 `kd_pristine` 产物） | `ordinary` rc=0 92s exe `cmp_IDENTICAL` / primary.o `cmp_IDENTICAL`；`call_fixture` rc=0 97s exe `cmp_IDENTICAL` / primary.o `cmp_IDENTICAL`；`v6` 两侧 rc=2（无产物）。**通过，patch 2 留在工作树** |

**时间盒（`typed_expr_type_arena_smoke`，默认门，盒 1200s，`kd_remap2`）**：`verdict=finished rc=1 wall=577s`、`forest_appended=29`/`forest_parsed=29`、`guard_hits=0`、`lease_hits=0`、`max_rss=720,225,432 B`；末尾仍为 `typed expr: frozen module const query before build-index seal source=src/std/bytes_layout.cheng name=FixedBytes32Size`。

| 指标 | 修复前（§21.9） | 仅 token 缓存（patch1） | token+typeSyntax（patch1+2） |
|---|---|---|---|
| 森林窗 `after_profile_lookup since_ms` | 未到达 | 774,266 | **553,914** |
| 整轮 | 盒到期 rc=143 @1213s | 793s 自结束 | **577s 自结束** |
| `forest_appended` | 2/29 | 29/29 | 29/29 |
| src=2 行首次可见 | 从未 | el=633s | **el=437s** |
| 最长零输出窗（字节口径） | 1173s | 598s | **397s** |

**判词（按主线程给的判据）**：森林窗 774.3s → 553.9s（**−28.5%**），src=2 单源 append ~590s → ~400s；**未降到"量级不同"（<120s）**，故仍判**部分缓解**，不判"时间墙消除"。残余墙已第三次定位（22.9）。

### 22.8 续做 2：全量 234 源口径（决定 S1b 性质的那一问）

入口 `src/core/tooling/backend_driver_dispatch_min.cheng`（自烤），`kd_remap2`，`CHENG_CSG_MEM_TRACE=1`、`BACKEND_JOBS=2`。

| 档 | 结果 |
|---|---|
| **默认 768MiB 门** | `verdict=finished rc=125 wall=176s`、`guard_hits=1`、`forest_parsed=61`、`forest_appended=0`、`max_rss=700,630,072 B`；守卫原文 `compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=836453576 limit_bytes=805306368`；末行 `csg_mem tag=forest src=61 bytes=4490588 rss=634831856 live=1770838` ⇒ **死在 pass0 取第 62 个源（src=61），并林尚未开始** |
| **抬门 4GiB（diagnostic）** | `verdict=finished rc=1 wall=583s`、`guard_hits=0`、`lease_hits=0`、**`forest_parsed=234`**、**`forest_appended=40`**、`max_rss=2,146,535,464 B`（2.00 GiB）；pass0 全 234 源在 **el≤281s** 完成，pass1 并林 0→39 用 **~297s**；最长零输出窗 **90s**（el=397→487） |

**死点原文（末行）**：
`parser forwarding production: invalid appended forest: parser forwarding production: authority invalid row=91185 kind=5 arm=0 auth_kind=7 auth_row=7838 expected_auth=0 owner=91184 span=26254:26272 source_local=1085 producer=40`

**判词**：**全量 234 源跑不完 —— 但不是时间墙、也不是内存墙。** pass0 234/234 parse 完成、pass1 并林推进到 **40/234**、峰值 2.00 GiB 未撞 4 GiB 门，止于**真实校验错误**（`producer=40` 的 appended-forest authority 校验）。该错误文本与 §21.6 M3（`did_subscribe_smoke`，37 源、当时卡在 `producer=8`）**同类同文**，属**修复前就存在、被时间墙遮住的 correctness bug**。
⇒ "删并林之前，全量构建在 Cheng 链上能否跑完" = **不能**；因此 **S1b 不能据此降级为"只剩内存轴"**。可断言的部分是：intern 二次代价已从两端大幅削减（森林窗 774.3s→553.9s；全量并林在 583s 内推进 40 源且零输出窗降到 90s），当前决定全量成败的是 correctness，不是资源。**（本节结论不外推：未跑到的 src=41..233 是否还有别的错，未定。）**

### 22.9 第三处同族站点实测（顺手测热度，未改、未获授权加 patch 3）

全量 raised 运行 el≈400s（并林进行中）`sample`：热点仍在 `ParserValueExprTreeAppendFromImpl`，代码偏移 **+90536 / +90504**（与 token 循环的 +49036/+49068、typeSyntax 循环的对应偏移均不同）。`lldb` 反汇编该 PC 的紧邻前序调用：
`cheng_cold_57f4bd51_4586 = arenamod.ArenaArrayInt32Get`（arenamod.cheng:400）→ `_3895 = parser.ParserValueExprSourceText`（parser.cheng:14020）→ `_574 = strings.CloneStr`（strings.cheng:468）→ `_4528 = langintern.Intern`（intern.cheng:728）—— 序列中的 `ArenaArrayInt32Get(sourceTree.arena, sourceTree.regionSourceTextIds, …)` 是该循环的独有特征 ⇒ **热点为 `parser.cheng:11664-11675` 的 region 循环**，即同族三处站点中唯一仍未加缓存者，且它正是 553.9s 森林窗的主要残余。
**未加第三处缓存**（超出本轮授权范围）；补上同一形状的缓存即可按 22.7 的同级风险处理，但**它不改变 22.8 的 correctness 死点**。

---

## 二十三、测量期间的树状态与 provenance 边界（2026-09-11 补记）

本文件 §二十~§二十二 的全部数字（`type_arena`/`intern_probe`/森林窗/夹具 sha/全量 234 源各档）都取自带未提交 WIP 的工作树。为免后人误用，此处如实登记**测量当时树内并存的第三方未提交改动**（与本次测量无关，但会改变驱动的构建输入）：

| 文件 | numstat | 归属 | 与本文件结论的关系 |
|---|---|---|---|
| `bootstrap/cheng_cold.c` | `63 10` | 他线（Darwin 目标缓存 group 谓词一类） | **会改变 C 冷启动种子**；本文件所有 bake 的 `kd*` 均由该态构建 |
| `src/core/lang/parser.cheng` | `192 96` | 本线（authority 判重修复，采集/验证中） | §二十~§二十二 的数字取的是 `c5f6c6736` 态 |
| `src/core/tooling/compiler_csg.cheng` | `31 0` | 他线（frontier store 上界，即施工图 §3.1-I2） | 使工作树行号相对 HEAD 漂移（并林调用点工作树 `:33189` vs HEAD `:33162`） |
| `src/core/runtime/program_support_backend.cheng` | `90 18` | 他线 | 未参与本文件任何口径 |
| `tools/beat_c_process_group_guard*.{sh,py}` | `1 1` 等 | 他线 | 守卫工具本体改动 |
| `src/apps/vpn_proxy/*.cheng`、`findings.md`、`progress.md`、`task_plan.md`、`lessons.md`、`user_path_baseline.tsv` | — | 他线 | 与本文件无关 |

**口径声明（重要）**：

1. 本文件每个结论都**绑定其自记的驱动 sha256**（如 `kd_probe2 28873166…`、`kd_remap2 e604caef…`、`kd_pristine 68dad79a…`）与原始 stderr/timeline 文件；**没有一条结论依赖"当前 HEAD 构建"这一隐含前提**，故上述 WIP 不推翻已记录的数字。
2. 但**这些数字一律不得作为"正式固定点/发布证据"引用**——按本仓发布纪律，正式结论必须在**源码冻结 + 干净树 + 精确门**下取得；本会话全部测量属**诊断/定位**性质，其中抬门 4GiB 各轮已逐条标 `diagnostic`。
3. `bootstrap/cheng_cold.c` 带 WIP 这一条尤其要记：任何以"GEN2/GEN3 原始字节固定点"为名的结论，**必须在该文件干净且冻结后重跑**，不得沿用本次任何 bake 产物。
4. 本文件内所有 `文件:行` 锚点均为**该节写作时刻 HEAD**（各节已就近标注 HEAD sha）；跨节引用前须按 `design/anchor_drift_audit.md` 的使用方式重新定位。

---

## 二十四、门内墙世代更替：现树 pass0 已跑完，墙移到并林 pass1（2026-09-11 上午）

**世代声明（重要，勿与旧世代混读）**：本节数字取自**现树（HEAD + S1b-0 + 0c + 1a，即已验证态）**、驱动 `kd_prev`（由该态源码现烤）、`label=default768_verified`、**默认 768MiB 门**、同一输入 `backend_driver_dispatch_min.cheng`、`lease_hits=0`。原始件：`.rebuild/s1b_step3/gate/default768_verified.summary.txt`。

**读数（实测原文）**：

```
label=default768_verified driver=kd_prev gate=default(768MiB) rc=125 wall=396s lease_hits=0
csg_stage=after_profile_source_payload_release since_ms=29364 rss_bytes=490062784 live_allocations=1471835
forest_parsed_lines=234          ← pass0 全 234 源跑完
forest_appended_lines=24         ← 死在 pass1 并林的 src=24
forest_parse_begin pass=1 src=24 reserve=1604800 rss=830637280 live=3958941
compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=832308448 limit_bytes=805306368
max_rss=830637280  max_live=3958941
```

**判读**：

1. **本世代门内墙已从 pass0 移到并林 pass1**：`forest_parsed_lines=234`（pass0 全部 234 源在门内跑完）而 `forest_appended_lines=24`（死于并林第 25 个源的 reserve 之后）。这与 §二十一/§二十二 世代（`forest_parsed=61`、`rc=125 @176s`、pass0 保底 609–781 MB）**是不同世代的两个结论**。
2. 因此 **§二十一 §0.4(iii)/§3.2 的 pass0 算术对本世代作废**（该世代保底 609 MB / 781 MB 的读数不再代表现树；现树保底约 341→490 MB）。**作废不等于旧世代记错**——旧读数在其驱动与树态下仍然成立，只是不再是当前墙的位置。
3. **对 S1b 的含义**：删并林半段（第 ③ 步的 ①~⑥）的**期望值上升**——墙就压在并林本身上，而不是压在它之前。这与 §二十二"删并林只买到能跑完"的判断方向一致，但把"能跑完"从"远期的必要条件"变成"当前门内唯一挡路的东西"。

**S1b 第 ③ 步现状（交接，代理中途失败）**：

- 已落地并入库的 patch = `patches/s1b_1c_seal_arena.patch`（33 KB，sha `ddf6948a…`），**只含 ⑦⑧**：Seal 段 7 处树读 → arena 列（含三大函数共 51 个读点）+ `StrictValidateInto` 对齐新列 + 两处 0c 潜在缺陷修复。
- **①~⑥（真正的行为切换：`state.*` Init 期按索引总数分配、`AppendSource` 增 `producerSourceIndex` 并逐源调 `FillTypeSyntax`、`IndexFields` 游标跨源持久、权威相索引化、逐源驱动、同步删并林段 `:33130→:33136→:33251`）未做**——故"删并林后门内能否跑完并林"**本轮未回答，也不得被当成已回答**。
- 1c 的等价证据（battery）：`ordinary` / `call_fixture` / `cold_nested` `CMP=IDENTICAL`；`v6` 首轮 `JUDGEMENT=DIFFER` 经**同驱动单侧复现**（`kd_prev` 重跑 `rc=0`、与 step3 侧逐字节同为 `8b47df81…`）**定级为环境作废（瞬时资源门：A 侧死于 `805,569,640 / 805,306,368`，超门 0.03%）**；`pair2` / `closure8` / 新增形状夹具 `arena_shapes` 均 `CMP=NO_ARTIFACT` + `JUDGEMENT=IDENTICAL`（两侧 rc=2、末行判词逐字相同）。
- **树已回退到已验证态**：`typed_expr.cheng 56/23`、`typed_expr_type_arena.cheng 450/1`（sha `8b8332eeb944aeda…`）、`compiler_csg.cheng 129/29`；1c **未应用**，可一条命令重放。陈旧锁（owner 6934 已死）已按 owner 活性检查清理。
- **判词文件世代警告**：`.rebuild/s1b_step3/VERDICT_step3.txt` 里的 `VERDICT: STEP3 NOT ESTABLISHED: non-equivalence` 是 **DIFFER 轮的旧判词**，已被上述复现实验取代；新一轮必须产出**新判词覆盖它**（或就地标注取代关系），**不允许两代判词并存而无人知道哪份有效**。

### 24.1 ①~⑤ 落地、⑥ 未落地时的对照（成本已付、收益待 ⑥）

同一输入、同默认 768MiB 门、`lease_hits=0`，两轮直接可比（原始件 `.rebuild/s1b_step3/gate/default768_{verified,step3}.summary.txt`）：

| 指标 | pre-step3（`kd_prev`） | step3（`kd_step3`：①~⑤ 已做、⑥ 未做） |
|---|---|---|
| `forest_parsed_lines` | 234 | 234 |
| `forest_appended_lines` | **24** | **24**（同一堵墙） |
| `max_rss` | 830,637,280 | **848,168,160**（+17.5 MB） |
| 保底 rss（`after_profile_source_payload_release`） | 490,062,784 | **579,650,496**（+89.6 MB） |
| `wall` | 396s | 406s |

判读：`compiler_csg.cheng` 仍为 `129/29` ⇒ **⑥（删并林半段）未落地**，并林照旧存在、墙自然仍压在 `src=24`（`status=rss_limit_exceeded`）。**①~⑤ 新增的 per-source 列与机制本身要多花约 90 MB 保底内存**（纯增量的必然代价）⇒ **收益必须由 ⑥ 独力提供，且须先覆盖这 ~90 MB 增量**：⑥ 要让并林那一整块消失（pre-step3 世代 pass1 峰值曾达 2.0–2.3 GB），才可能既补上增量又把 `forest_appended` 推到 234。**这条对照的作用是防止误读**：只看"step3 也死在 24"会以为改动无效；把两边的 `max_rss`/保底 rss 并列，才知道账记在 ⑥ 头上。

### 24.2 更正：16 vs 10 **不可归因于改动**（父席归因错误，第五手以代码证据推翻）

第五手同窗口门内读数：基线 `kd_base` `forest_appended_lines=10`、`max_rss=843,023,512`；本轮 `kd_s2` `forest_appended_lines=16`、`max_rss=849,183,968`。父席曾据此称"**同等水量下推进更深 ⇒ 每源内存代价下降（方向对）**"——**该归因错误，现予更正**：

- **并林半段与 `forest_appended` 发射点在 diff 里是 context、一字未改**（发射点 `compiler_csg.cheng:33246`，紧跟 `ParserValueExprTreeAppendFrom` @ `:33235`）；本轮对 `compiler_csg.cheng` 的唯一改动是 3b 在 **pass0 seal** 处加的 `ta_limits` 埋点块。⇒ 两次读数是**同一段代码在两个水位下的读数**（基线保底 `600,146,880` vs 本轮 `563,905,472`），死点同为并林 pass1，`max_rss` 反而 **+6.16 MB**（与"降内存"反向，且在漂移量级内）。**本轮没有任何可归因的门内推进。**
- **计数语义已核**：`forest_appended` = "pass1 第几个源完成整林 append"，唯一发射点 `:33246` 在 `mergePass==1` 分支内；⑥ 未做 ⇒ 语义未变、两次**可比**，但差非代码所致。
- **对 ⑥ 的硬要求（否则"目标 234"会变成没有发射点的数字）**：该发射点随 `mergePass` 循环一起被删 ⇒ 必须在**同一 patch 内二选一写死**：(a) 逐源驱动重新发射 `tag=forest_appended`；(b) 改用门禁脚本已预留的 `tag=ta_stream`（现 0 行）。
- **教训**：把"两个读数不同"当成"改动有效"，与把"没变化"当成"无效"是同一个错误的两面——**先确认差异是否落在改动的执行路径上**（本例：改动在 pass0 seal 埋点，读数差在 pass1 并林，路径不同）。ded`）。**①~⑤ 新增的 per-source 列与机制本身要多花约 90 MB 保底内存**（纯增量的必然代价）⇒ **收益必须由 ⑥ 独力提供，且须先覆盖这 ~90 MB 增量**：⑥ 要让并林那一整块消失（pre-step3 世代 pass1 峰值曾达 2.0–2.3 GB），才可能既补上增量又把 `forest_appended` 推到 234。**这条对照的作用是防止误读**：只看"step3 也死在 24"会以为改动无效；把两边的 `max_rss`/保底 rss 并列，才知道账记在 ⑥ 头上。
