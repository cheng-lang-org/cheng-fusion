# VERIFY_ratchet_diag_append —— [RATCHET-DIAG] 基座 profiles 相 RSS 棘轮持有者账（m1d4 复现定谳）2026-09-08

date_utc=2026-09-07T19:40Z~2026-09-08T04:20Z · 代理=RATCHET-DIAG（战役 R，与 V6-MEM 线平行错峰）· 克隆=/Users/lbcheng/cheng-f24/ratchetdiag（cp -cR 主树工作树全量；src/bootstrap/tools 三面 /usr/bin/diff -rq 全等；主树 HEAD=60f4e5b501+219 脏文件态）· 证据=克隆 .w/rd/{rd1,rd2}/（曲线 csv+vmmap 11 张+heap+sample+trace 时间线）· 零代码改动

## 一、结论先行（top3 持有者+预估可削减量）

**m1d4「含刀态基座 ~200 源即 trip 1GiB」完整复现并定谳：profiles 相棘轮主体是 parseperf_3 合入引入的 annotation 树遗弃——`compilerCsgBuildOrderedSourceProfilesRec` 循环每源把整棵 `ParserValueExprTree`（arena+InternPool+SoA）建进局部变量 `sourceAnnotationTree`，F3 累积关闭时（默认态）既不 move 进累积森林也无任何 Release，而 `CompilerCsgBuildSourceScratchRelease` 释放的 `work.activeAnnotationTree` 在全库恒为 nil（声明后从未赋值）——注释宣称的「树交 scratch 生命周期」接线从未发生。持有者账（trip 时刻，guard 口径 ~1.05GiB）：**

| # | 持有者 | file:line+结构 | 定量（t117 vmmap，ps-rss 903MB 时） | 预估削减 |
|---|---|---|---|---|
| 1 | **遗弃 annotation 树群**（每源一棵，永不释放） | compiler_csg.cheng:36569（局部 `var sourceAnnotationTree`）→36571（KeepTree 构建）→36656（F3 臂 OFF 时无 Release，迭代尾遮蔽）；35884/35974（释放恒 nil 的 `work.activeAnnotationTree`，字段声明 :1479）；结构=parser.ParserValueExprTree{arenamod arena（8KiB 初始，grow 至 MB 级）+ langintern.InternPool（intern.cheng:713 双份文本+16B/槽 index）+ ParserImportOriginSoA} | VM_ALLOCATE 增殖段主体：4.4/7.6-9/12.3/14.4MiB 段群持续增殖 **2.4 段/秒=每源 ~2 段**（t117→t127 十秒 +24 段）；对 m1d 旧基座差分 **~565MB@124 源**（全闭包 239 源估 >1.1GiB） | **−565MB@trip 态**（profiles 相回到 m1d 形态 ~500-560MB 终态）【更正 2026-09-10 实读：本条所述结构**已不适用**——`sourceAnnotationTree` 全仓 `grep` **零命中**（该「遗弃 annotation 树群」已不存在），本行内 `:36569`/`:36571`/`36656`/`35884`/`35974`/`:1479` 各点均已不对应所述代码（如 `:36569` 现为 `stableWorkspaceRoot,`、`:1479` 现为 `work: var CompilerCsgBuildWorkingSet,`）。原行保留为历史证据，结论不作废亦不沿用】 |
| 2 | **InternPool pow2 槽表阶梯**（16B/槽 keys+4B/槽辅列，128MiB+64MiB×3+32MiB 独立 pow2 段） | 阶梯签名=InternPool indexKeys（intern.cheng `internPoolIndexPutOwnedCopy` owned copy 双份持有）；属主=遗弃树携带池（随 #1 释放）与/或活池（lineInternPool compiler_csg.cheng:24525、gNormTypePool typed_expr.cheng:13498、typed facts 池 typed_expr.cheng:7448/8648/8885/10285/39789/62432）——**具体属主需施工线一轮 A/B 钉死** | 大 pow2 段族合计 **~352MiB**（131072+65536×3+32768 KB，全部 dirty 无 swap）；非 pow2 大段 54.1MiB+41.2MiB 疑似大文本拷贝 | 若属树域随 #1 消失；若属活池，池瘦身刀（index 单份化/槽位瘦身）再 **−200~300MiB**（保守估） |
| 3 | **MALLOC zone 底噪**（ORC 小对象活集+libmalloc 碎片） | ORC str/slot 小块（heap 实测 size-class：48B[280,593 个]、32B[564,441]、16B[547,420]、64-112B[24.7 万]，intern 行文本+名字+路径的 header/payload） | zone dirty 217MiB / allocated 148MiB / **frag 28-44%（62-68MiB）**；bind 相即有 87.6MiB allocated 底噪 | 底噪性质，#1/#2 落刀后重估，非 GEN2 前置 |

**总账：仅持有者 #1 一刀即预计把 profiles 相 trip 态从 1.05GiB 拉回 ~500MB（m1d 基座形态），GEN2-BREAK m3 的「GEN2 rc=0 前置=RSS 穿 1GiB 帽」由该刀直接解锁 profiles 相；随后前沿回到 m2d 已知的 metadata/forest 段底噪+上漂（本轮 trip 太早未达该段，m2d 口径 586MB 起步/868s trip 仍待 forest 波次刀合击）。与 V6-MEM 线（+293MB 本底）的共享嫌疑：持有者 #2 的全局池（gNormTypePool 等编译臂共享态，跨编译不释放面）+registry 记账底噪——并案建议由主线程对 v6 夹具单件编译做同款 vmmap 段签名核对。**

## 二、轮次台账（含烤机事故如实记录）

| 轮 | 驱动×树 | rc | wall | 死点与 RSS 账 |
|---|---|---|---|---|
| rd1 | m46=56be3700（/tmp/oob_ab2/run_m46，w126 谱系车头烤的 m46 态闭包）×克隆（=同态） | 125 | 147.5s | guard `rss_limit_exceeded rss_bytes=1093617152`（1.019GiB）；ps-rss 峰 1,062,896KB@146.4s；**死于 profiles 相内**（末 stage=after_sort_sources@60.2s，无 after_profiles）——m1d4 同形复现 |
| rd2 | **kernel_driver_rd=31d1b98d**（冷链自烤：CLT cc -O2 现树 bootstrap/cheng_cold.c→f2b3932e→烤克隆 dispatch_min 闭包 rc=0@~255s）×克隆 =严格自烤 | 125 | 132.2s | guard rss_bytes=1076233704（1.002GiB）；124 源 profile_enter 后 trip；带 CHENG_PARSER_DEBUG=1 逐源通道（观察者开销使 trip 较 rd1 提前 ~15s，棘轮形态不变） |

- 环境事件：rd1 后主线程清理 /tmp/oob_ab2（m46/m47 驱动失灭）；artifacts 生产驱动 0e7ca635（9/2 代）烤当前树 rc=139 ×2 次（大闭包早期崩）且小编译（type_abi.cheng）挂起 6 分钟+——判「老代驱动×当前树」不兼容，弃用；改冷链重建（build_backend_driver_clt.sh --no-raster）自源烤制，谱系正确（当前树 cheng_cold.c 自编）。
- 双轮互证：rd1（m46 等效）与 rd2（严格自烤）profiles 相棘轮形态一致（斜率 8.8-10.0MB/s、同死点、同 128MiB 段群）——结论不绑特定驱动字节。
- 测量窗负载如实标注：全程 load 29-70（他线 python/渲染进程共存，见各轮 lock_window.txt）；RSS 为进程自身行为不受 load 影响，墙钟受影响。烤机/自烤全轮 bake_win 锁内（owner=RATCHET-DIAG-*，用毕自撤）；rd1 采样缺 trip 时刻 vmmap（进程死快于 1s 拍），rd2 以 850MB 阈值 5s burst 补齐。

## 三、棘轮画像（分相斜率+逐源增量+源类别归属）

**分相（rd1 双口径，profiles 相斜率由 bind 相的 5.9MB/s 跃升至 8.8→10.0MB/s 加速）：**

| 相 | t 窗 | RSS | 斜率 |
|---|---|---|---|
| provider/preflight | 0-39s | 128KB→137MB | 3.5MB/s |
| bind/import/sort | 40-60s | 138→255MB | 5.9MB/s |
| **profiles 棘轮** | 60-146s | 255→1038MB | **8.8→10.0MB/s 加速，零回落**（纯棘轮，无波次释放） |

**逐源增量（rd2 带 CHENG_PARSER_DEBUG=1 逐源带内通道，124 源与 1s RSS 曲线对齐）：**

- 单源台阶 top：**idx47 +174MiB（decls_scan 10.5s）、idx61 +104MiB（decls 11.5s+types 2.2s）**、idx14 +50MiB、idx67 +42MiB、idx2 +25MiB；其余 120 源各 0-25MiB，中位 ~0-2MiB。
- **源类别归属定谳：RSS 台阶与单源处理时长强相关，而处理时长 100% 落在 decls_scan 段（parserReadFunctionDeclsLinesMode，声明扫描）**——贡献大户是**声明密集巨型源**（闭包内 primary_object_plan.cheng 4.56MB/typed_expr.cheng 3.53MB/lowering_plan.cheng 1.50MB/parser.cheng 1.73MB 一族，decls 扫描 10-15s），单源净增 104-174MiB；类型密集段（profile_after_types）本身只占 0-2.2s 非大头；普通小源每源 2-6MiB 级增殖段。
- **+0.6MB/s 上漂与底噪 590MB（m2d 口径）归属说明**：当前基座 trip 于 profiles 相内，metadata/forest 段未达；m2d 的「profiles 后 586MB 起步+0.6MB/s 上漂」在本账中的对应部分=profiles 相终态驻留（文本三副本+profile 累积+池，见 #2/#3），其上漂主体属 forest 波次域（GEN2-P1 T1 靶区，本线未重复 m2d 已有账）。

## 四、vmmap 峰窗拆账（§九口径可并表）

| 时刻 | ps-rss | MALLOC dirty | VM_ALLOCATE dirty/段数 | zone 账（dirty/alloc'd/frag） | 关键段 |
|---|---|---|---|---|---|
| rd2 t63（after_sort_sources，棘轮起点） | 248MB | 153.3MB | 110.1MB/92 | 154.3/87.6/44% | 18.2MiB+4.4MiB×4 |
| rd2 t117（棘轮中段） | 903MB | 240.6MB | **642.7MB/181** | 217.2/148.1/32% | **128MiB 满**+64MiB×3+32MiB+54.1MiB+41.2MiB+14.4/14.3/12.3MiB+9MiB×4+4.4MiB 群 |
| rd2 t127（trip 前 4s） | 996MB | 247.2MB | **735.6MB/205** | 223.8/161.5/28% | 同上+新增 17.8MiB 段 |
| （对照 §九 400s 死相） | 837MB | 518MB | 428MB/231 | 含 freed-dirty 尸体 96MB | m2 前 D3 世界 |

- **棘轮 85% 在 VM_ALLOCATE**（cheng_malloc ≥256KiB mmap 臂的活大块，program_support_backend.cheng:6053 域）：t63→t127 +625.6MB，其中增殖段 ~2.4 段/s；MALLOC 区仅 +94MB。
- 128MiB 段 t117-t127 恒满不涨（稳定持有非尸体）；registry 槽表（c_malloc 域）在 MALLOC_LARGE 仅 16MiB+4MiB——**128MiB 段不是 registry 表**（推翻 §九时代 64MB 表的主质量假设在当前树的位置，D3 后表活集驱动）。
- heap@trip 前（footprint 936MB）：zone 活 1,655,934 nodes=160.35MB，non-object；VM_ALLOCATE 面 heap 工具不可见。
- sample 8s（棘轮中段）：cheng_malloc/cheng_mem_release/ptr_slot_load_raw 记账族合计栈出现 ~470 次/8s——分配记账路径为最热栈之一（观察者效应与 churn 双重证据，D3 域）。

## 五、持有者定谳证据链（#1 完整走查）

1. **代码面**：`compilerCsgBuildOrderedSourceProfilesRec`（compiler_csg.cheng:36483 起）【更正 2026-09-10 实读：旧写 `:36510` 已漂移，`fn compilerCsgBuildOrderedSourceProfilesRec(` 现址 `:36483`；同句 `:36569`/`:36571` 与 `parser.cheng:7598` 三个点已不对应所述结构（`sourceAnnotationTree` 全仓零命中；`ParserValueExprTreeEnsureActive` 现址 `parser.cheng:7723`），详见本节 #1 更正】循环体 :36569 `var sourceAnnotationTree` → :36571 `ParserBuildExprCallProfile*KeepTree(..., sourceAnnotationTree, ...)`（每源建树：parser.cheng:7598 `ParserValueExprTreeEnsureActive` = `new(ParserValueExprTree)`+`ArenaInitDefault(8192)`+`InternPoolNew()`）→ F3 OFF（`work.parserForestAccumulate=false` 默认，parseperf_3 交付态）时该树无 move 无 Release，迭代尾直接遮蔽。
2. **释放面空转**：`CompilerCsgBuildSourceScratchRelease`（:35882）与 abort 面（:35974）释放的 `work.activeAnnotationTree`（:1479 声明）在全库仅此两处出现且均为 nil 释放——36598 行注释「树交 scratch 生命周期（见 activeAnnotationTree）」宣称的接线不存在。
3. **RSS 面**：每源 ~2 个新 VM_ALLOCATE 段永不回收（2.4 段/s × 每源 0.56s 均时）；段尺寸谱（4.4→14.4MiB）与「树 arena 按源文本量 grow」匹配；大源台阶（174/104MiB）与其 decls_scan 时长（10.5/13.7s）一一对应。
4. **差分面**：m1d 基座（parseperf_3 前）同相增量 ~264MB（243→507MB 完成 239 源）；rd2 基座（parseperf_3 后）同相 828MB 且 124 源未完成即 trip——**净回归 ~565MB@124 源为 F3 KeepTree 路径引入**，与 parseperf_3「F3 默认关」交付态一致（累积 ON 时树所有权 move 进森林单一持有，不泄漏——m1d3 形态互证）。
5. **为何烤机能过而自烤不能**：m46 烤机车头（w126 谱系）自身不含 KeepTree 代码路径，烤制 rc=0@285s；只有「含刀驱动自编自家闭包」首次执行该路径——与 gen2break §五「parseperf 类刀的验收必须含自烤冒烟」协议教训再次吻合（本例为该教训的第二号实证，且是 RSS 维度）。

## 六、施工建议（刀形预案，l3b2 三要素预核）

**刀 A（必做，解锁 GEN2 profiles 相）：annotation 树生命周期接线**
- 刀形：F3 OFF 臂在树构建消费后显式 `parser.ParserValueExprTreeRelease(sourceAnnotationTree)`；或按 36598 注释原意把树挂 `work.activeAnnotationTree` 交既有 `CompilerCsgBuildSourceScratchRelease` 接管（后者改动面更小且 abort 路径 :35974 自动覆盖）。F3 ON 臂不动（:36492-36506 move 已接管所有权，ReleaseBorrow 语义已核对）。
- 最后读者：F3 OFF 时树在 KeepTree 产 profile 后无任何读者（消费=profile 构建本身），构建返回即终读；F3 ON 时最后读者=accumulator move。
- 证据口径：rd2 同款复测轮（克隆内 A/B）——判据①trip 消失或 profiles 相终态 ≤600MB；②vmmap 增殖段速率 2.4 段/s→0；③四夹具门+自烤冒烟判词零漂移（F3 OFF/ON 双态）。
- 守卫：`ParserValueExprTreeRelease` 既有 panic 面（ownerAttached/borrowLeaseCount/lifecycle，parser.cheng:10126-10150）原样生效，不加放行；树释放后 use-after-free 由 ORC 毒化网兜底验证（D3 五节同款 stage3 A/B）。
- 预估削减：**−565MB@trip 态**；profiles 相预计回到 m1d 形态（~500-560MB@完成），帽内完成 239 源。

**刀 B（A 后按残余段再定）：InternPool 槽表阶梯归属 A/B**
- 刀形：A 落地后复测 vmmap——若 64MiB×3/128MiB 段随树消失则并入 A 收益；若仍在，按段尺寸阶梯（2^21/2^22/2^23 槽）对活池（lineInternPool/gNormTypePool/typed facts 池）逐一核对 `InternPoolRetainedBytes` 报表定属主，再动「index 单份化」（indexKeys owned copy→借用 texts 或槽位 8B 化）。
- 最后读者：intern id 消费者（lineStore i32 列/池内查找）；indexKeys 只服务 probe 查找，非权威数据。
- 证据口径：InternPoolRetainedBytes 报表 vs vmmap 段字节对账；intern dedup 语义回归（intern_dedup_orc_smoke）。
- 守卫：index 形状校验 panic 面（intern.cheng:745-750）不变。
- 预估削减：残余部分 −200~300MiB（保守）。

**刀 C（非前置）：MALLOC 底噪（#3）** —— 160MiB 活小对象+62MiB 碎片在 bind 相即存在（87.6MiB allocated），属文本三副本+ORC 域正常驻留与碎片；A/B 落地后随整体回落重估，暂不动刀。

**与 V6-MEM 并案建议**：v6 夹具（单件编译）本底 +293MB 的共享嫌疑面=全局池（gNormTypePool 等不随单件编译结束释放）+registry/记账底噪（#3 的 bind 相部分）——建议 V6-MEM 线对 v6 编译进程做同款 vmmap 段签名（64MiB/128MiB pow2 阶梯有无），互证后由主线程统一派刀。

## 七、纪律记录

- 零代码改动：主树与克隆 src/bootstrap/tools 无任何修改（克隆仅 .w/rd/ 诊断件）；诊断脚本 4 件（rd_diag.sh/rd_runner.py/vmmap_digest.py/per_source_analysis.py）+文本证据（曲线 csv/11 张 vmmap/heap/sample/trace 时间线/轮次日志）保留于克隆 .w/rd/；大对象（kernel_driver_rd 163MB/cold 驱动/provider .o）验收后已删（hash 已录：seed f2b3932e→kernel_driver_rd 31d1b98d5e9118365786a86922b4f270b2e5e14ac1025182a468d27627c5a71b）。
- 烤机纪律：全轮 bake_win 锁内 owner 持窗（RATCHET-DIAG-bake/rd1/rd2），用毕核 owner 自撤；900s 帽硬限由 runner 内置看门狗（killpg）执行（实际两轮均 guard trip 早于帽，看门狗未触发）；rc 紧邻捕获（runner_result.txt）。
- 无 heredoc；脚本一律 Write 落盘后执行；比对 /usr/bin/diff；采样双口径（ps-rss 1s 子树走查+guard 内账+vmmap dirty 口径）。
- 自首：rd2 首跑因 m46 驱动失灭秒败（FileNotFoundError，锁已释放无残留）；0e7ca635 老驱动两轮 rc=139 烤制失败判不兼容后弃用，期间一次小编译探针挂起 6 分钟+，已 kill 并如实记录。
