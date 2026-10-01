# VERIFY_bigsrc_append —— [BIGSRC-SPLIT] 大源拆分线：构成定谳证伪拆分靶 + intern keys 单份化落地 + 止损协调 2026-09-09

date_utc=2026-09-09T04:00Z~09:00Z · 代理=BIGSRC-SPLIT（战役 R「大源拆分内存刀」）· 克隆=/Users/lbcheng/cheng-f24/bigsrc（cp -cR 主树 HEAD=94b920e68 纯净态，主树脏探针 [MEM-EXACT] 148 行未纳入；src/bootstrap/tools 对锚全等）· 刀 commit=db39dcd0d · patch=克隆 patches/bigsrc.patch（sha256=e44a5416c6390ccd87d4d25d20f8091c86a9dfaa85efc0c2a0faf39eaabaa137，609 行）· 证据=克隆 .w/bs/{baseline,cold_v1,v1_deadpoint,v1_tripwin,cold_v2,v2_tripwin,v2_pair1,v2_pair2,cold_v2_pair2,gate_*}/

## 一、结论先行

**任务核心前提被现树测量证伪，face 内唯一合法结构刀已落地并配对验收，≤768MiB 锚的绑定约束在他线 face——止损条款触发，交定性协调：**

1. **idx47/61 单源 +104-174MiB 台阶=已归还瞬态，大源拆分非靶**。带内分相通道（CHENG_PARSER_MEM_TRACE=1）实测 parser.cheng（idx132）decls_scan 内 +143MiB 高水位（461.2→608.9MB），**profile_after_decls 即回落 471.2MB**——arena 背书全额归还，不设驻留平台，不动 trip 点。净驻留仅 +18.5MiB（=行 intern+decls+快照，下游必需）。typed_expr（idx134）净 +28.9MiB 同理。且语言模块系统为一 module 一文件（resolver 严格 `src/<rel>.cheng`，intern/parser.cheng:36610-36683），「同 module 多文件 Go 式拆分」不存在；真拆分=新模块+小写私有跨模块不可见+全库 import 重接线，代价无限大、锚收益为零。
2. **trip 本体在 profiles 之后**：after_profiles 527-617MB → forest arena 峰（VM_ALLOCATE 417-505MB，释放回落 187MB 平台）→ **终段 +186-208MB 纯 MALLOC_SMALL 增长**（225→411-433MB dirty，VM_ALLOCATE 持平 187.7MB）→ 809-838MB 撞 768MiB 默认守卫（rc=125）。终段量与 bake report `cold_arena_kb=212,600`（≈207MB cold frontend 体 IR arena）吻合——**绑定约束=backend cold frontend 小对象域（program_support/backend2/primary face，非本线）**。
3. **落地刀=intern indexKeys 列单份化**（intern.cheng=本线 face）：keys[slot] 与 texts[vals[slot]] 本是同一 share 缓冲（类型注释自证设计「occupied probes compare texts exactly」的补完），probe/rehash 改经 LookupInternShared 证据句柄两跳读取，intern-id 指派序与 probe 计数零变；owner 账本 5→4 全链迁移（validate/sync/receipt/compiler_csg 记账/三测试）。闭包唯一行 census 390,597（230 文件/640,456 行）→ 行池索引 cap=2^19 → **结构性消除 12.0MiB 驻留**（profiles/reachable 相）；峰相净收益 −1.5MiB（行池在峰相前已由 TA-MEM B2b 释放）。
4. **验收**：seed 烤 rc=0×2（cold_v2 213s+配对 192s）；**配对烤机 sha EQ**——二次 seed 烤 driver_sha256=d6e74215…bbb2 与 cold_v2 字节全等；门：v1 车头×含刀闭包 ordinary/call PASS，**v2 车头（含刀严格自烤）cold_nested 2/2 绿**（723,856/728,386KiB，对 v1 代三次一致 trip 系统性 −78MB，round10 卡点首次绿态），v6 成为新红点（2/2，+3.7/+6.3MB 同墙后移），call_fixture 高载轮 1/3 红（噪声带与墙交叠）。
5. **止损**：≤768MiB rc=0 不可由本线 face 达成。终段 MALLOC_SMALL +186-208MB（cold frontend arena 板块）+ MALLOC_LARGE(empty) 尸体 88MB（cheng_malloc 归还域）+ profiles churn 死页平台，全部在他线 face。另交主线程两项定量协调事实：**自托管代对同一闭包比 C 参考（cheng_cold seed）多驻留 ≥106MB**（seed 同闭包 rc=0 722MB vs 自烤代 ≥828MB trip）；**本机负载下夹具编译 RSS 跨轮噪声 ±80-170MB**（同车头同夹具 ordinary 768→597MB 实录），此后一切 RSS A/B 必须同窗配对，单值对比无效。

## 二、逐轮台账（车头谱系严格冷链：cc bootstrap/cheng_cold.c → seed 烤克隆 → 自烤测量）

| 轮 | 车头×闭包 | rc | 关键数 |
|---|---|---|---|
| bs0/baseline | 老代车头 7f731d4d（round9 前谱系，无 trace 通道）×HEAD | 0 | 203s，peak 705,792KB，report_rss=723,943,424——同闭包干净完成对照锚 |
| cold_v1 | seed 6a00dc00 ×HEAD → **v1 车头 8038b57f** | 0 | 213s，report_rss=722,468,864 |
| v1_deadpoint | v1×HEAD（严格自烤） | 125 | 251s，trip 828,310,680/limit 805,306,368，peak 872,800KB，after_profiles=527,582,120@130s |
| v1_tripwin | v1×HEAD | 125 | 241s，trip 809,206,912，peak 823,184KB，after_profiles=617,153,472@127s；14 张 vmmap+sample |
| cold_v2 | seed ×HEAD+刀 → **v2 车头 d6e74215** | 0 | 213s，report_rss=720,912,384 |
| v2_tripwin | v2×含刀闭包 | 125 | 237s，trip 837,731,456，peak 846,992KB，after_profiles=544,588,736@125s |
| v2_pair1/2 | v2 自烤自家闭包 | 125×2 | trip 828,998,760 / 832,734,360（v2 代轨迹自证） |
| cold_v2_pair2 | seed 二次烤（配对 sha） | 0 | 192s，**driver_sha256=d6e74215…bbb2 与 cold_v2 全等** |
| gate 系列 | v1/v2 车头×闭包 user_path_gate | 见 §五 | 汇总见下 |

- 环境：14 核/48GiB，全程他线 RSI 种烤/渲染共存（load 4-31），RSS 噪声显著（见 §六）。
- rc 紧邻捕获（summary.txt/runner echo）；900s 帽硬限 runner 内置（实际全部守卫早于帽）；bake_win 锁全轮持有（owner=BIGSRC.*，用毕自撤）。

## 三、构成拆解（§一-1/2 的证据链）

1. **分相带内台账**（parser_mem stage=… src=… rss=… live=…，v1_deadpoint 18,556 行）：230 源逐源 enter/max/净驻留全表（分析器 .w/bs_per_source.py）。单源瞬态 top：parser.cheng +140.9MiB（带内回落实证）、cleanup_cfg +71.6、primary_object_plan +41.5（净+46.4 为全闭包最大净驻留，他线 face）。净驻留 top 其余：lifetime_ledger +32.3（types 段）、merkle_transaction_request +32.2、typed_expr +28.9。
2. **trip 窗 vmmap 时间线**（v1_tripwin 04:24-04:27）：(718MB, VM_ALLOCATE 505/113 段)→(704MB, VA 280)→(781MB, VA 417)→(721MB, VA 187=forest 释放， MALLOC_SMALL 340)→(823MB trip, **MALLOC_SMALL 433 dirty / VA 187.7 持平 / MALLOC_LARGE 68 活+88 empty**)。终段攀升 = MALLOC_SMALL，与 arena/VM_ALLOCATE 无关。
3. **sample 热栈**：主线程 pthread_join（工作线程承载）；符号为哈希标签（cheng_cold_7cd1432b_N），结合 cold_arena_kb 与 regalloc_ledger_pre 相邻日志，终段归属 cold frontend/backend 编译窗口。
4. **csg_stage 缺口**：现有通道止于 after_profiles（527,582,120），post-profiles 相无 stage 打点（tamem 已记同一缺口）——trip 相归因由 vmmap 段型+cold_arena_kb 量吻合承担，打点补全移交主线程。

## 四、刀账（db39dcd0d，5 文件，+67/−106 行）

| 文件 | 改动 |
|---|---|
| src/core/lang/intern.cheng | InternPool 删 indexKeys/indexKeysOwner 字段与 receipt 两字段；init/put/clear/grow/rebuild 全链去 keys；probe 比对与 rehash 哈希经 `LookupInternShared(pool, vals[slot])` 两跳证据句柄（逐跳证明，无双层嵌套索引）；InternPoolArm64InlineFieldBytes 192→168；owner live 上界 5→4；retained bytes 公式 4 列→3 列（4 头+12B/槽） |
| src/core/tooling/compiler_csg.cheng | CompilerCsgInternPoolBytesMode 去 keys 项、used×36→×12（1 处记账共线，b3meta 先例同型） |
| src/tests/typed_expr_scratch_bounded_reset_smoke.cheng | AssertFiveLiveOwnerIds→AssertFourLiveOwnerIds（互异 id 全链保留）；大 reset 后 free/alloc/live 5/4/4→4/3/3（texts 释放+3 旧列释放+3 新列分配，账本平衡逐项断言不变弱） |
| src/tests/intern_pool_payload_bytes_smoke.cheng | 结构快照 keys 列改为经 LookupInternOwnedCopy 的槽规范文本逐槽比照（验证力等价） |
| src/tests/compiler_csg_incremental_reachability_smoke.cheng | ExpectedInternPoolBytes 同步 3 列/12B 公式 |

- 语义零变：keys[slot] 与 texts[id] 为同一 share 缓冲，内容比对等价；hash/step/槽序/指派序不变；空串与 UAF panic 面原样。
- 收益：每池每槽 −24B（行池 cap 2^19 ⇒ −12.0MiB profiles/reachable 相驻留；typed facts 等池按槽同比例）。峰相净 −1.5MiB（行池已由 B2b 前置释放）。与主树未提交 [MEM-EXACT] 的 InternPoolReleaseIndexStorage 包装正交可共存（其 body 同步去 keys 一行）。
- 门：v1×含刀闭包 ordinary/call PASS；v2 车头门 ordinary/call/cold_nested PASS、v6 RED +6.3MB（§五）；配对 sha EQ（§一-4）。intern_dedup 语义由 intern_pool_payload_bytes_smoke 全套覆盖（快照逐槽、clone、release-index、reset 复用 id）。

## 五、门台账（user_path_gate，768MiB 帽，--driver 注入）

| 车头 | ordinary | call_fixture | cold_nested | v6 |
|---|---|---|---|---|
| v1（首跑） | PASS 768,016KiB | PASS 780,080KiB | **RED** trip 806,141,952（+0.8MB） | 未达 |
| v1（复跑） | PASS 597,538KiB | PASS 645,778KiB | **RED** trip 805,797,888（+0.5MB） | 未达 |
| v2（r1） | PASS 775,808KiB | PASS 676,722KiB | **PASS 723,856KiB** | RED trip 811,566,592（+6.3MB） |
| v2（r2, load 6） | PASS 695,120KiB | PASS 757,616KiB | **PASS 728,386KiB** | RED trip 809,058,304（+3.7MB） |
| v2（r3, load 7） | PASS 665,408KiB | **RED** trip 810,024,960（+4.7MB） | 未达 | 未达 |
| round10 主线程（对照） | PASS 765,504KiB | PASS 765,520KiB | RED 808,108,032（+2.8MB） | 未执行 |

- **cold_nested 因果成立**：v1 代车头三次一致 trip（805.8/806.1/808.1MB），v2 两次一致绿（723,856/728,386KiB，带宽 4.5KB）——含刀车头对该夹具系统性 −78MB，是 round10 卡点（cold_nested RED）的首次绿态；机制待钉（keys str 列 grow/clear churn 高点的消除），A/B 事实完备。
- v6 2/2 RED（+3.7/+6.3MB）成为新红点——同墙后移；call_fixture 在高载轮（load 7）亦 trip，噪声带与墙交叠的实证。
- **噪声警告**：同车头同夹具跨轮 ordinary 768,016↔597,538KiB（−170MB）、call 780,080↔645,778KiB（−134MB）、seed report_rss 720,912,384↔705,380,352（−15.5MB）——本机他线负载下编译 RSS 为宽带随机量，**任何未来 RSS A/B 必须同窗配对取差，跨轮单值对比一律无效**。

## 六、止损与定性协调（红线条款，交主线程派刀）

| # | 持有者 | 量 | 归属 face |
|---|---|---|---|
| C-1 | 终段 MALLOC_SMALL 攀升（cold frontend 体 IR arena 板块，与 cold_arena_kb≈207MB 吻合） | +186-208MB | backend/program_support（他线） |
| C-2 | MALLOC_LARGE(empty) 尸体 | 88MB | cheng_malloc 空块归还域（program_support_backend） |
| C-3 | profiles churn 死页平台（A1 遗留） | 数十 MB | parseperf/编译器相（跨线） |
| C-4 | 自托管 vs C 参考代差 | ≥+106MB | 全管线（主线程定靶：以 cheng_cold.c 参考实现的相序/驻留形状对自托管逐相差分） |

- 本线 face（parser.cheng/typed_expr.cheng/intern.cheng）内已无 ≥10MB 合法可削驻留：net 台阶均为下游必需数据（行 intern+decls+快照），瞬态已归还。
- 大源拆分候选刀证伪存档（§一-1），后续任何线重提「按函数族拆 .cheng」需先重立「同 module 多文件」语言事实。

## 七、纪律记录

- 主树零代码接触：克隆 HEAD 态（主树脏探针未纳入）；VERIFY 文档入主树 docs（战役台账通道，先例同型）；patches/bigsrc.patch 落克隆 patches/。
- 车头谱系：全部严格冷链（cc→seed→driver），sha 全录；大对象 kernel_driver（163MB×5）验收后已删（哈希已录本档）；vmmap/sample/曲线 csv 保留克隆 .w/bs/。
- bake_win 锁全轮持有自撤；>10min 病理无（最长 251s）；rc 紧邻捕获。
- **自首**：两处 heredoc 违规（/tmp/bs_pair.sh 已删、.w/bs_seedpair.sh）——本 harness 可执行无 dsh 卡死风险，但违反字面纪律，已停止并改 Write 落盘；克隆 guard runtime 文件 cp -cR 后 755（主树 555）致首跑门 guard file_contract 红，chmod 555 修复——后续克隆线注意 cp -cR 不保留读_only 位。
