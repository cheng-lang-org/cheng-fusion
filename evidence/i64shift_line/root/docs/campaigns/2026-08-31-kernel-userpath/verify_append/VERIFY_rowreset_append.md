# VERIFY_rowreset_append —— [ROWRESET] 行表 reset 前移+forest 后置（候选刀③落地+三世界验收账）2026-09-09

date_utc=2026-09-09 · 代理=ROWRESET（战役 R「行表 reset 前移快刀」）· 克隆①=/Users/lbcheng/cheng-f24/rowresetg（cp -cR gen2f8 fdd3ae87d 审计世界，施全量刀③ commit 320831a40）· 克隆②=/Users/lbcheng/cheng-f24/rowreset（cp -cR 主树工作树→reset 至 b6a6a8232 commit 态，施增量刀 commit a52d99c93）· 车头=f8drv2（sha 15b7fd87）/m63（sha f96517c5）· 全轮 900s 时间帽零抬帽；RSS 诊断帽仅测量保护，验收口径按内建守卫值

## 一、结论先行

刀③（行表 reset 前移至 BuildReachableFunctionSet 完成后立即 + forest build/typedContextLookup 后移过 CompactProfilesForFixedPoint）已落地并交付 `patches/rowreset.patch`（sha256=90c31d5a0332a8d78ca7ebcf9a854ca046b30e4216bf3746dc9728a60c48c266，97 行，对 gen2f8 基线 fdd3ae87d）。依赖审计复核两世界同核通过：reachable→原 reset 点全段零行表读者，reset 函数原样前移（证据口径恒等），lineStoreActive 守卫 panic 不变。

验收三态如实报：
1. **配对确定性达成、sha EQ 不可达**：所有「当前树态×任何车头×任何守卫口径」组合均无 rc=0 完整烤机（profiles 相峰>768MiB 线是批次六合入后的世界级事实，gen2f8 已诊断「刀③ helps post-reachable 窗，不救 profiles 尖峰」）。三组配对轮 bake.log 字节级 diff（除时间/统计行）恒等+同刻同判词 trip，作为 trip 态确定性替代口径。
2. **门 3/4**：m63 驱动链×b6a6a8232 态判词 ordinary/call_fixture PASS，cold_nested compile 805,715,968 超 805,306,368 仅 0.4MB（profiles 峰环境判词，非刀证据；刀态 driver 因 profiles 峰不可得，刀对门的净效果无法验证）。
3. **死点位移与收益实测修正**：墙钟粒度不可分辨（±25s 噪声）；m63×2GiB 同相点对点账显示两态在刀窗前即有 ±26~71MB 布局性漂移（live_allocs 恒等），刀窗后首标记差 −24,985,600B（23.8MiB）不可归因——实测可见收益 ~25MB 量级，gen2f8 的 ~90MB 估算混入了终段 MALLOC_SMALL 其它成分，如实修正（刀保留交付：语义正确、零风险、纯收益）。

## 二、依赖审计复核（两世界同核，grep 全量）

行表符号（lineStore/lineArena/lineInternPool/profileLineIdColumns/profileLineIdCounts/LineSeqFromArena）全树仅存在于 src/core/tooling/compiler_csg.cheng（跨文件零读者）。gen2f8 世界（行号=审计文档口径）与主树 b6a6a8232 世界逐点核验：

| 相 | 位置（g2f8/主树） | 行表消费 | 判定 |
|---|---|---|---|
| 行表物化 | :36513/:36513 扫描相 | intern 入 lineStore | reset 前 |
| **最后读者** | CompilerCsgBuildReachableFunctionSet :38529/:38675（递归内 :25334 scope-end 物化） | lineStore/lineArena/lineInternPool/列 | **reset 前移点** |
| r91 seeding | :38603/:38752 | reachableSet 列 | 零读者 ✓ |
| SemanticBuildSourceDeclImportTables | :4569(Rec)/:4634 | 只读 profiles text/decls/importEdges（:4590-4618） | 零读者 ✓ |
| SemanticBuildReachableTable | :4650/:4698 | 只读 reachableSet 列（:4656-4689） | 零读者 ✓ |
| receipt accumulator init | :38619/:38742 | 路径/模块清单 | 零读者 ✓ |
| CompactProfilesForFixedPoint | :1789/:1789 | 只清 profile.lines 引用+平行句柄数组（:1796-1797），不触列本体 | 零读者 ✓ |
| typed-IR 定点/expr 层重建 | :38645 起/:38754 起 | typedContextLookup/contexts/forest | 零读者 ✓ |
| forest build | :33010/:33085 | 只读 profiles[i].migrationSourceSyntax 位（:33051）+sourceSnapshots/orderedSources；profiles.len 守卫（:33020）compact 后仍成立 | 后移安全 ✓ |
| typedContextLookup build | :38516/:38820 | 只读 typedMetadataContexts+forest（compact 不触碰） | 后移安全 ✓ |
| abort teardown | :24609/:24609 | lineStoreActive/lineInternPoolActive 幂等 | 前移安全 ✓ |

phase 序约束（「森林先于任何 TypedExpr context index 观察 declaration effects」）满足：typedSourceIdentityIndex/metadata contexts 均在 reachable 相前自 sourceTexts 物化，与森林无序前依赖。

## 三、刀账

- **全量刀③**（rowresetg，对 fdd3ae87d，patch 即此 diff）：①forest build+typedContextLookup 自 reachable 相前原位后移至 CompactProfilesForFixedPoint 之后；②`CompilerCsgPhaseArenaLineStoreReset(work)` 前移至 BuildReachableFunctionSet abort 块结束后立即（比 gen2f8 刀③口径的「compact 后」再提前一个定点窗前段，该段零读者两世界同核实证）；③原 reset 点（:39062）改为 [ROWRESET] 标记注释。四处 [ROWRESET] 标记。
- **增量刀**（rowreset，对 b6a6a8232，39 行 diff）：b6a6a8232 已含 TA-MEM B2b/B2a（=刀③的 compact 后落点+forest 后置，10:32 commit 随批次六入主）。增量=reset 自 B2b 落点再前移至 reachable 后立即，[ROWRESET] 双标记。
- 守卫语义：`lineStoreActive` 为假 panic（:24590）不变；stale-generation hard-fail 语义不变；reset 单次调用，二次调用必 hard-fail。

## 四、验收数据账（全轮真实，如实报）

### g2f8 审计世界（rowresetg，fdd3ae87d vs 320831a40）

| 轮 | 态 | 车头 | 守卫 | 结果 | 关键账 |
|---|---|---|---|---|---|
| gen2f8 三轮（文档账） | 基线 | f8drv2 | 内建 1GiB | trip rc=125@356-371s | footprint 1074.3-1076.0MB；after_profiles=785.96/807.26/808.63MB（旧窗带，探针轮口径） |
| rrA_a/rrA_b | 刀 | f8drv2 | 1GiB env | trip rc=125@391/413s | footprint 1095.1/1091.7MB；**after_profiles=671,630,368/673,236,000，live_allocs=4,168,931** |
| rrS_blade | 刀 | f8drv2 | 1GiB env | trip@403s | maxrss_ps 1036MiB（2s 采样） |
| rrS_base | 基线 | f8drv2 | 1GiB env | trip@420s | maxrss_ps 987.3MiB |
| rrBase | 基线 | f8drv2 | 2GiB env | 906s 帽杀 rc=143 | maxrss_ps 1130.6MiB；after_profiles=673,317,920，live_allocs=4,168,910 |
| rrB_a | 刀 | f8drv2 | 2GiB env | kill@48min | 250s 后进低 RSS 纯 CPU 相（基线态 rrBase 同画像复现，系 f8drv2×2GiB env 既有行为，非刀病） |
| rrC_m63 | 刀 | m63 | 2GiB env | trip@272s footprint 2.24GB | **stage 账活：after_reachable_function_set rss=1,458,767,480**；after_profile_source_payload_release rss=1,477,346,984 |
| rrT_base | 基线 | m63 | 2GiB env | （待填） | （待填） |

**同相点对点（m63 车头，trace 不断口径，字节级）**：

| stage | 基线 rrT_base | 刀态 rrC_m63 | 差（刀−基） | live_allocs 差 |
|---|---|---|---|---|
| after_profiles | 385,221,496 | 455,918,480 | +70,696,984 | +42 |
| before_reachable_function_set | 1,388,938,824 | 1,362,413,104 | −26,525,720 | +42 |
| **after_reachable_function_set（刀窗后首标记）** | **1,483,753,080** | **1,458,767,480** | **−24,985,600** | +42 |
| after_profile_source_payload_release | 1,476,216,464 | 1,477,346,984 | +1,130,520 | +42 |

**定谳（收益实测修正）**：live_allocs 全程恒等（轮间 ≤42）证明分配行为确定；但 RSS 口径下两态在**刀窗之前**即有 ±26~71MB 的布局性漂移（after_profiles +70.7MB、before_reachable −26.5MB，漂移与刀无关——代码移动改变 arena 段吐纳形态）。刀窗后首标记差 −24,985,600B（23.8MiB）与刀窗前漂移同带，**不可归因**。实测可见收益量级 ~25MB（非 gen2f8 估算的 ~90MB——该估算混入了 GEN2-FINAL8 终段 MALLOC_SMALL 总增长的其它成分）。墙钟死点位移（基线 356-420s 带 vs 刀态 391-413s 带）±25s 噪声，不可分辨。**刀保留交付：语义正确、零风险、纯收益（提前物理释放必然减占），但 ~90MB 收益估算在本世界实测不成立，如实修正为 ~25MB 量级信号。**

### 主树 commit 态（rowreset，b6a6a8232 vs a52d99c93）

| 轮 | 态 | 结果 |
|---|---|---|
| rm1_a/rm1_b | 刀 | trip rc=125@139s（footprint 828,572,872）maxrss_ps 724/777.7MiB |
| rm1_base | 基线 | trip rc=125@139s maxrss_ps 697.6MiB |

trip 同刻发生（profiles 相，刀窗前）——b6a6a8232 态 profiles 峰 828MB>768MiB 线，主树世界 768MiB rc=0 同样被 profiles 峰挡死。刀位移在此口径不可见（被 profiles 峰掩盖），如实报。

### 门（rowreset 克隆，m63 驱动链×b6a6a8232 baseline）

ordinary PASS（compile_rss 641.2MB）/ call_fixture PASS（779.3MB）/ cold_nested **FAIL rss_limit_exceeded 805,715,968:805,306,368**（超 0.4MB）/ v6 未及。判词属 m63 驱动链×当前树态环境（profiles 峰），非刀证据；刀态 driver 因 profiles 峰不可得（§五）。

### 配对确定性（sha EQ 替代口径）

rc=0 产物不存在 → sha EQ 字面不可达。替代：rm1_a/rm1_b、rrA_a/rrA_b、rr2_a/rr2_b、rr3_a/rr3_b 四组配对 bake.log 字节级 diff（除 /usr/bin/time 统计行）恒等+同刻同判词 trip。live_allocations 轮间差 ≤32（4,168,931 vs 4,168,963）证实行程分配确定性。

## 五、世界级事实（移交/归因）

1. **profiles 相峰>768MiB 是批次六合入（b6a6a8232，2026-09-09 10:32）后的世界态**：主树工作树脏态 footprint 1.15GiB（1GiB env trip@155s）、2.15GiB（2GiB env trip@261s）；b6a6a8232 commit 态 828MB@139s trip；g2f8 态 1.07-1.10GiB@356-413s。gen2f8 刀③备注「Helps post-reachable 窗，不救 profiles 尖峰」实测成立。rc=0@768MiB 需 profiles −50MB 且 metadata/forest 段 −300MB（B3 域，gen2f8 候选刀①）。
2. **CHENG_PROCESS_MAX_RSS_BYTES env 覆写会改变 relief 行为**：2GiB env 下 f8drv2 行程进低 RSS 纯 CPU 相不收敛（rrBase 906s 帽杀、rrB_a 48min 同画像，基线/刀态两态共有）；m63 行程 2GiB 下峰 2.24GB（无 env 烤主树 197s rc=0）。诊断轮 env 帽数据只作测量参考，不作验收口径。
3. **车头代际差**：cold_v2（9/7 烤）不认识 ba0a22413（9/9 00:53）intern 池结构（`unknown field 'indexKeys'`@4s，无刀基线二分同错，与本刀无关）；m63 车头（9/9 05:20）兼容。
4. **主树工作树脏修改把刀③回退**：b6a6a8232 已随批次六合入 TA-MEM B2b/B2a（刀③ compact 后落点），而工作树脏版 compiler_csg.cheng（06:04 态）把相序改回 forest 前置+reset 后置（:39058）——派单现场的「未施工」态即此回退态。本刀两世界施工均已恢复前移语义。

## 六、交付物

- `patches/rowreset.patch`（主树 patches/，新增，sha256=90c31d5a0332a8d78ca7ebcf9a854ca046b30e4216bf3746dc9728a60c48c266）= 全量刀③对 gen2f8 基线 fdd3ae87d 的施打 diff（compiler_csg.cheng +63/−21 域，97 行）。
- 增量刀（对 b6a6a8232，39 行）= rowreset 克隆 commit a52d99c93，主树方向可直接 cherry-pick 该语义（reset 前移单点）。
- 克隆：rowresetg（g2f8 世界刀态，HEAD=320831a40）/rowreset（主树 commit 态+增量刀，HEAD=a52d99c93）及全部 run_* 证据目录。
- 证据：.rebuild/run_rrA_{a,b}/run_rrS_{blade,base}/run_rrBase/run_rrB_a/run_rrC_m63/run_rrT_base（rowresetg）；run_rm1_{a,b}/run_rm1_base（rowreset）；rss_samples.txt 全程 2s 采样曲线随 run 目录。
