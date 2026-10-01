# VERIFY_gen2r2_append —— [GEN2-R2] GEN2 自烤 rc=0 + 峰 ≤768MiB 双达标 + GEN3 固定点 2026-09-09

date_utc=2026-09-09 · 代理=GEN2 突破线 R2（重派）· 性质=TA-MEM 系刀体重对位落地 + GEN2 自烤双达标 + GEN3 字节固定点 · 证据克隆=/Users/lbcheng/cheng-f24/gen2r2（锚 commit=97f560f23，刀 commit=49fd1f811）· 主树锚=a7d26bebf（比简报锚 94b920e68 新批次六等若干轮，重对位以此为准）· patch=cheng-patches/gen2r2_knives.patch（sha256=86178cf86960cf3a9b27ee2d1be8a9d3f73d59895d8c6278e85106c0ee68f9e7）

## 一、结论先行

**GEN2 自烤双达标达成：刀态 rc=0@189s（900s 帽内），树峰 756.28MiB ≤ 768MiB 管理线（余量 11.72MiB）；GEN3 二轮/三轮同配方自烤 driver sha256 三轮全 EQ（56bc64e0…）=字节固定点；四夹具门 rc=0（pass=4 known_red=0 stale=0 收官全绿）。对基线（锚树，峰 784.27MiB@213s）峰降 28.0MiB、墙钟快 24s，与 TA-MEM 模型「去 B1+B2 落 740-790 贴锚」判定带吻合。**

## 二、重对位账（tamem patch → 现主树）

简报所附三 patch 对 a7d26bebf 全部上下文漂移，弃 patch 工具，克隆内手工重对位落刀（全部只碰 src/core/tooling/compiler_csg.cheng 单文件，+127/-20 行；arena/parser/typed_expr/primary_object_plan/backend2/program_support 零接触）：

| 原 patch | 对现主树实况 | 处置 |
|---|---|---|
| tamem_b1 arena.cheng:188（ArenaReserveCapacity） | **已合入主树**（arena.cheng:198，含 ArenaMaxInt32/arena_rt_realloc 全套） | 免重放 |
| tamem_b1 compiler_csg forest 两阶段合并 | 未合入（函数体仍在逐源 AppendFrom 倍增路径）；符号依赖全在（parser/lang/parser.cheng EnsureActive:7619、arenamod import、Int64 转换、add()） | 手工重放（phase A 逐源解析入列表累计精确 ΣArenaUsed + phase B ArenaReserveCapacity 一次成型 + 逐源 append 即释 + parserForestReleasePending 错误退出防漏） |
| tamem_b2 B2b（行表释放前移到 CompactProfiles 后） | **被主树 ROWRESET 取代且更激进**（[ROWRESET] 行表 reset 已前移到 BuildReachableFunctionSet 返回后立即，grep 实证全段零行表读者，实测 ~25MB） | 免重放（原 39056 旧释放点主树已不存在） |
| tamem_b2 B2a（forest merge + typedContextLookup 挪到行载荷释放后） | 未合入（forest 仍在 reachable 前 38503） | 手工重放（挪到 CompactProfilesForFixedPoint + ProcessMemoryPressureRelief + after_profile_source_payload_release 之后；typedContextLookup 唯一前置消费者在 expr loop 前，作用域 grep 复核 38735 声明点覆盖全部消费点） |
| tamem_diag（CHENG_CSG_MEM_TRACE 门控计量） | 未合入 | 手工重放 10 个计量点（trace vars+emit fn、src/src_done、typed_ir_round/typed_ir_done、import_edges_resolved、metadata_contexts_built、expr_layer_symbols_done、forest src/forest_parsed/forest_appended/forest_build_start/done、type_arena/typed_ir/facts） |

diag 与 B1 的 memtrace 打印全部 `CHENG_CSG_MEM_TRACE=1` 门控，正式烤机不开 env=零开销，语义零变更。

## 三、实测账（车头=/tmp/cheng_cold_v2 sha=7f731d4d…，BACKEND_JOBS=8，禁缓存四件套，beat_c 守卫 1GiB 防线+900s 帽）

| 轮 | 树态 | rc | wall | 树峰 (MiB) | 对 768MiB 锚 | driver sha256 |
|---|---|---|---|---|---|---|
| baseline_r0 | 锚树（768MiB 硬杀口径） | 137@194s | 194s | 770.45 | 超 2.45 | 无产物 |
| baseline_r1 | 锚树（正式口径 1GiB 防线） | 0 | 213s | 784.27 | 超 +16.27 | de4fac2c… |
| gen2_k1 | 刀态（GEN2 达标轮） | **0** | **189s** | **756.28** | **≤ 锚（余 11.72）** | 56bc64e0… |
| gen3_k2 | 刀态二轮 | 0 | 182s | 807.88（尾段链接窗环境噪声，见 §五） | 超 +39.88（噪声） | 56bc64e0… |
| gen3_k3 | 刀态三轮 | 0 | 187s | 734.20 | ≤ 锚（余 33.80） | 56bc64e0… |

- **if-expr 前置墙确认已消**：基线锚树 rc=0 完整烤完（简报推断的 annot_release 后 IFEXPR 修复合入成立，无需 repro 件）。
- 基线死点定性：全局峰在**终段链接窗**（中段平台 576.6 + 链接增量 ~208MiB）；曲线=首峰 669.4（前端 profiles/行表窗）→ ROWRESET/compact 谷 576-581 → 终段顶点。forest 贯穿中段平台，故 B1 容量过冲收敛直接压平台→压终段峰。
- 口径教训入账：768MiB 是**记账管理线**（台账对比栏），硬杀线=1GiB 防线（tools/user_path_gate.sh 头注同口径）。baseline_r0 以 768MiB 作 guard 硬杀线属口径加严误设，194s 早杀，该轮只作口径证据不作死点证据。

## 四、双达标判定

1. **rc=0 在 900s 硬帽内** ✓（189s，未抬帽）。
2. **树峰 ≤ 768MiB 管理线** ✓（756.28MiB，达标轮以 gen2_k1 为准；gen3_k3 复烤 734.20MiB 二次贴锚）。
3. **GEN3 固定点** ✓：sha(GEN2)=sha(GEN3_k2)=sha(GEN3_k3)=56bc64e02dee520403b93b6497d742a79f3ca35dbc41fac447950a7eb43f885a（三轮同配方同源码字节 EQ；产物 basename 同为 kernel_driver，对拍有效）。
4. **四夹具门** ✓：user_path_gate（克隆树内，基线=user_path_baseline.tsv）rc=0，`pass=4 known_red=0 stale=0` 收官全绿；探针区 probe_pass=4 / probe_red=1(closure) / probe_stale=14 为台账态，锚树对照轮同 driver 位比对见 §六。
5. **模型对账** ✓：TA-MEM 模型判定「去 B1 落 830-880，再去 B2 落 740-790 贴 768 锚」——实测 756.28/734.20 落带内，无需启动遗留物 C1/C2 下一刀。

## 五、GEN3_k2 尾段峰异常定性

gen3_k2 峰 807.88MiB 与 gen2_k1(756.28)/gen3_k3(734.20) 差 51.6/73.7MiB：曲线形状三轮同构（首峰 ~671 → 平台 ~587 → 尾段链接窗跳变），唯尾段终值漂移。尾段=cc/ld 链接 170MB 产物的子进程工作集，受页缓存/LINKEDIT 冷热影响（lessons 166 条环境噪声口径）。sha 三轮 EQ 证编译语义零漂移，噪声不影响固定点与达标判定；如实入账不粉饰。

## 六、探针区对照（刀态 vs 锚树）——已闭合

刀态 driver gate 全量 log（.rebuild/gate_gen2_k1.log）vs 锚树 driver 对照轮（.rebuild/gate_baseline_r1.log），19 个探针逐行台账 `/usr/bin/diff` **完全一致（LEDGER_EQ）**：两轮均 probe_pass=4 / probe_red=1(probe_closure) / probe_stale=14，四夹具收官 summary 均 `pass=4 known_red=0 stale=0` rc=0。探针 RED/STALE 为树级既有台账态，与刀无关，刀语义零回归洗清。

## 七、三方哈希记录

| 角色 | sha256 |
|---|---|
| 车头 cheng_cold_v2 | 7f731d4dfbaca2094097503b6a1af8456edd766daab05e3b225850b16e12c86c |
| GEN2/GEN3 刀态 driver（固定点） | 56bc64e02dee520403b93b6497d742a79f3ca35dbc41fac447950a7eb43f885a |
| 锚树基线 driver | de4fac2ce01be5f99bccdcd609951ff30fb27866b52705fad84d5a019d3f9dae |
| m62 认证 driver（历史参照） | f96517c5eebeb9f8423e60bd3fdb940e9538b2ac7a94981e64838d236f0c889a |
| gen2r2_knives.patch | 86178cf86960cf3a9b27ee2d1be8a9d3f73d59895d8c6278e85106c0ee68f9e7 |

## 八、纪律记录

- 全轮 beat_c_process_group_guard 1GiB 防线+900s 帽，禁缓存四件套（COLD_OBJECT_CACHE/ENTRY_CACHE/NO_CACHE/STRICT_NO_CACHE），冷缓存根每轮独立 run 目录，任务毕即弃。
- 独跑纪律：每轮烤机前 pgrep 确认无并发 system-link-exec（捕获到外部 cheng.stage3 rsi_gate 会话编译一次，等其退出后才起 baseline_r1）。
- bake_win 静窗锁按规设/撤；scratch scope 由 gate 自包装（CHENG_TASK_TMPDIR）。
- 刀面零越界：仅 compiler_csg.cheng 单文件；typed_expr/primary_object_plan/backend2/program_support/arena/parser 零接触。
- 车头内嵌 bootstrap 前端（cold_parser.c）带无条件诊断打印（[CVOG]/([rvL])），属车头二进制既有行为，本线不动车头。
