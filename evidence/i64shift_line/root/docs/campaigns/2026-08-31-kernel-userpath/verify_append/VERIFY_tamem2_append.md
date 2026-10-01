# VERIFY_tamem2_append —— [TA-MEM2] 墙穿收尾：刀态链验证+GEN2 新峰定谳（metadata contexts 相）+B3 移交 2026-09-08

date_utc=2026-09-08 · 代理=TA-MEM2（战役 R「TA-MEM 内存刀」接续线）· 克隆=/Users/lbcheng/cheng-f24/tamem2（cp -cR 主树 19:50 态，HEAD=40265748a）· 车头=/tmp/cheng_cold_v2（sha 7f731d4d…，与 IFEXPR-FIX d2pair 同源）· bake_win 锁全程生效

## 一、结论先行

**四件交付、一件移交：①if-expr 墙已穿——修复已由主线程快照入库存档（13b515911，18:55），本线零重复劳动，repro 探针 0-2s 过（verdict=`reachable entry missing: main`，晚相位，与 m60 行为一致）；②刀态链 b1+b2+diag+diag2 落克隆全过，终态配对烤机 t5=t6=8e83cd1b…（rc=0×2），四夹具门 4/4 PASS（rc=0，树峰 1,022,410,752 < 帽 1,073,741,824）；③GEN2 刀态自烤 ×4 轮确定性 rc=125@1074-1090MB（phys_footprint 口径，驱动内建守卫）——**新统治峰=metadata contexts 相：import_edges 624MB 起步，~3.9MB/源线性爬升，src=128 已 1013MB，外推全量 ~1.4GB；模型相 3（无实测锚盲区）实为最大遗留物**；④B1/B2 合并/释放逻辑在自烤路径上位于新峰下游、未及执行（forest 标签零输出），刀功能面由四夹具门背书（小闭包全管线走通）；⑤**B3=typedMetadataContexts 相内驻留重构（compiler_csg+typed_expr 语义权威域）→ 按止损条款移交主线程裁决。主线程已在主树合入全链并追加 working-set census+各相 ProcessMemoryPressureRelief（本线 diag2 的超集），正在主攻该墙。**

## 二、判词零漂移的精确口径（探针 12 STALE=树级漂移，刀零嫌疑）

四夹具门双轮对照（同一克隆源，t5 刀态驱动 vs 主树 run_m60c 无刀驱动 sha b76aa3c9…）：

| 轮 | 四夹具 | probe_pass/red/stale | 树峰 |
|---|---|---|---|
| t5（刀态 8e83cd1b…） | 4/4 PASS rc=0 | 4/3/12 | 1,022,410,752 |
| m60c（无刀控制） | 4/4 PASS rc=0 | 4/3/12 | 1,008,173,056 |

**19 行探针逐行判词完全一致**（probe_tuple/probe_objctor=`lowering plan: call target exact TypedExpr identity missing`、probe_match=PARSER_BRANCH_WITHOUT_IF、probe_when/block/assert=`ownership body ir production: ingress…` 等）。12 STALE 为基线 TSV（18:54 刷新）与当前树的树级漂移（他线在途墙），对任何驱动不可达绿——**刀相对零漂移成立；「12 绿」绝对目标属他线墙域，不在本线清偿面**。

## 三、GEN2 新峰定位（分相铁证，gen2diag 轮 CHENG_CSG_MEM_TRACE=1）

| 点位 | footprint | live_alloc |
|---|---|---|
| after_sort_sources | 168MB | 100,206 |
| after_profiles（240s） | 620MB | 3,858,114 |
| import_edges_resolved | 624MB | 3,864,191 |
| profile_lookup_built / metadata_start（230 profiles） | 624MB | 3,864,666 |
| metadata src=16 | 699MB | — |
| metadata src=48 | 812MB | — |
| metadata src=96 | 890MB | 4,493,506 |
| metadata src=128 | **1,013MB** | 4,695,735 |
| 守卫 trip（~src=131） | 1,089,848,664 | — |

- 斜率 ~3.9MB/源（大源跳涨），线性无回吐=contexts 全量驻留（TypedExprSourceContextAppendMove 只增不减）。**模型相 3 无实测锚的盲区即此**：ta1 时代「after_profiles→死」窗被计入 forest 相账，实际首峰在 metadata。
- 四轮 trip 值：1,076,774,256 / 1,074,038,032 / 1,074,087,256 / 1,089,848,664（末轮含加重插桩）——确定性撞线。
- B2 释放侧证：v1 轮 import_edges 713MB→after_profiles 620MB（−93MB ≈ 模型 lineStore ~95MB，量级吻合；含 OS 压缩噪声，弱证据）。B1 forest 标签零输出=新峰下游未执行。
- 度量口径：驱动内建守卫=自进程 phys_footprint（host_ops HostOpsCurrentRssBytes→os.ProcessRssBytes，非树和）；ps RSS 在内存压缩下会低估 footprint（采样假象已识别）。
- 参照：主树无刀自烤 run_selfg2（19:47，m60c 车头）rc=137@476s 被 beat_c 树和守卫杀——刀链必要性不受本结果影响。

## 四、交付物与证据链

- `patches/tamem_diag2.patch`（主树 patches/，新增）：diag 通道两处修复+窗口插桩——①compilerCsgMemTraceEmit 幂等前置 CompilerCsgTraceInit（原惰性初始化晚于 profiles/forest 循环，窗口标签静默丢失）；②metadata 相入口/逐16源/出口+profile_lookup 标签。**注意：仅适用于 b1→b2→diag 链后；主树现已超集化（compilerCsgWorkingSetMemTraceEmit+各相 relief），本 patch 留作证据溯源用。**
- 配对/驱动 sha：t1=t2=28bdb487…（diag 前）、t3=e9142bf2…（diag init 修复）、**t4=t5=t6=8e83cd1b…（终态，交付代表=t5）**；repro 探针终态复测 rc=2 reachable entry missing ✓。
- 克隆证据：/Users/lbcheng/cheng-f24/tamem2/.w/t2/（run_t5、self_gen2、self_gen2trace、self_gen2diag 的 bake.log/csg_stages/csg_mem/vmmap_snap/rss_samples）。
- 配方复现：`.w/t2_bake.sh <tag> [vehicle]`（900s 帽+锁）；`.w/t2_selfbake2.sh <tag> <driver> [trace]`（自烤+1s 采样+vmmap 峰窗快照）；`.w/t2_probe.sh <driver>`（5 行件探针）。

## 五、未竟项（同墙阻塞，如实记红）

- **GEN2 rc=0 / GEN3 / Step2 复跑（组合装配同守卫）/A+B 施打（手册前置=GEN2 守卫穿）**：全部被 metadata 相新峰阻塞。B3 修形建议（供主线程裁决参考，未施工）：metadata contexts 构建即取即用（typedContextLookup 一次成型后释放 contexts 本体，或 contexts 分片驻留按需物化）+逐源 relief 兜 churn——主线程在树 relief 已就位，等其下一轮自烤实测。
- v6 夹具编译峰 998,448KiB（975MiB）贴管理线 768MiB 的超线侧——同 metadata 相成分，随 B3 一并回落，届时按验收台账「树峰 vs 锚」栏归因。

## 六、纪律记录

- 主树足迹=纯新增两件：patches/tamem_diag2.patch + 本文档。源码零接触（主树 compiler_csg/arena 的 M 态=主线程合链动作，非本线）。
- 大产物清理：克隆 .w/t2 仅留 run_t5 驱动（sha 代表）+全轮日志/梯子/vmmap；t1-t4/t6 驱动二进制已删（sha 已录）。/tmp/tamem2_diagbase 已删。
- 违章零记录：全程默认 1GiB 帽、900s 烤帽、无抬帽无绕门；探针 STALE 未粉饰（双轮对照入档）。
- 同判词连败计数：GEN2 trip ×4 属同墙不同轮定位（每轮带来新增分相证据），非盲目重试。
