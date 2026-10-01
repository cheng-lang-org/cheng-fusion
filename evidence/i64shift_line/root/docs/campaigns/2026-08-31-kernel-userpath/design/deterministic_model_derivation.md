# 确定性模型推导（内存门 / 编译理论下限）——回源复算版

- 锚定 HEAD：`e9688f530ac109bb6e434d6b8e03eac1faa08e17`（本文所有 `文件:行` 均锚定此 sha 的**工作树**）
- 性质：只读回源 + 复算。本文件是唯一写入物。
- 工作树污染声明（影响可达性，不影响下述锚点）：
  - `bootstrap/cheng_cold.c` 为 modified；`git diff -U0 HEAD` 显示改动全部落在 **≥86044 行**，本文引用的理论区 `75440–76070` **与 HEAD 逐字节一致**，故该区锚点对 HEAD 与工作树同时成立。
  - `tools/user_path_gate.sh` 为 modified，且**改动正好落在本文核心锚点 `:45`**（HEAD=`768`，工作树=`1024`）——见 §⑦-9。
  - `tools/beat_c_process_group_guard.sh` 为 modified，但差异只在 `MONITOR_RUNTIME_BUILTIN_SHA256`（`:27`），与门值无关。
- 单位约定：本文一律显式写 `B` / `MiB`(=1,048,576 B) / `MB`(=1,000,000 B)。**当前仓库文档混用 MiB 与 MB 且不标注，已造成一处流传性数字错误（§⑦-1）。**

---

## ① 结论先行

理论侧共清点出 **6 条**可识别的理论量。逐条"是否已定位到产生处"与"是否可复算"：

| # | 理论量 | 产生处（文件:行 @HEAD） | 可复算 | 备注 |
|---|---|---|---|---|
| T1 | 内存门常量 `805,306,368 B` = 768 MiB | `tools/memory_model_limits.sh:19-20` | **换算可复算；推导链不可复算** | 768×1,048,576 = 805,306,368 ✓；但上游"+3% 余量"对 717–748 带内任何基值都算不出 768（§②-3） |
| T2 | 逐相管理线锚表（enter/bind/profiles/forest/TypeArena） | `tools/memory_model_limits.sh:12-18`，公式上游 `VERIFY_tamem_model_append.md:43-121` | **4/6 可复算，2 项区间端点不自洽** | profiles "372-392" 与 forest "750-880" 有问题（§②-4、§⑦-4/5/11） |
| T3 | 编译理论下限 `compile_theory_parallel_limit_ms`（C 链） | 公式 `bootstrap/cheng_cold.c:75967-75970`，输出 `:76031`（文件）/`:76055`（stdout） | **逐位可复算** | 用 13.641× 那轮回执全链条复现，5 个派生字段全部命中（§③-1） |
| T4 | 编译理论下限 `full_compile_theory_time_lower_bound_ms`（Cheng 链，dry-compile） | 公式 `src/core/tooling/backend_driver_main.cheng:4447-4451`，孪生副本 `src/core/tooling/backend_driver_dispatch_min.cheng:3003` | **可复算** | 输入是**实测**串行/并行纳秒 ⇒ 后验，非先验（§③-4） |
| T5 | 内存理论下限 `full_compile_theory_rss_lower_bound_bytes`（Cheng 链，dry-compile） | `src/core/tooling/backend_driver_main.cheng:3817-3818` | **逐位可复算** | 用 dry-smoke 回执验证到字节（§③-5） |
| T6 | 门内拟合判据 `full_compile_theory_rss_lower_bound_fits_hard_gate` | `src/core/tooling/backend_driver_main.cheng:4211-4214`，孪生 `backend_driver_dispatch_min.cheng:2451-2456` | **可复算** | 只比**下界**，不能证明装得下（§⑤-4） |

**一句话结论**：门值**已定位到产生处**（`tools/memory_model_limits.sh:19-20`）但**推导链不可复算**；编译理论下限**已定位到产生处**（`bootstrap/cheng_cold.c:75967-75970`）且**逐位可复算**，但它不是先验理论而是"本轮实测 CPU÷核数"的后验折算（§③-3）；运行时侧目前**根本没有与这两条理论量同口径的字段**（§⑤-8），所以"运行时是否收敛到理论"当前**不可判定**，不是"没测准"。

---

## ② 内存门推导链

### 2.1 常量产生处（唯一权威常量）

`tools/memory_model_limits.sh`（HEAD 内新增于 `22aef12b3`，2026-09-08 "1GiB 最后防线全局改为内存模型理论极限 768MiB"）：

- `:2` 自述："确定性内存管理模型理论极限（唯一权威常量，2026-09-08 用户令）"
- `:9-10` 口径："1GiB 最后防线已废弃；所有内存守卫/文档统一使用 768MiB 理论极限。768MiB = 805,306,368 bytes"
- `:19-20` 常量本体：`CHENG_MEMORY_MODEL_LIMIT_MIB=768` / `CHENG_MEMORY_MODEL_LIMIT_BYTES=805306368`
- `:4-7` 自述权威来源两条：`docs/selfhost-resource-plan.md` §二点五（管理线锚表）；`docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_tamem_model_append.md`（逐相理论工作集公式 + 实测对账）

### 2.2 上游推导链（唯一的"因为所以"）

`docs/selfhost-resource-plan.md:16` §二点五「确定性内存管理锚表」，其中车头烤一行（`:24`）是**唯一给出依据的一行**，原文：

> | 车头烤（35 条目全闭包） | **768MiB** | C 链同闭包实测 717-748MiB+3% 余量（单遍工作集+全局符号表+流缓冲） | 条目化后 200-300MiB |

同链其余四处**只承接、不推导**：
- `docs/selfhost-resource-plan.md:26`（GEN2/自烤 768MiB）：依据写"同载具同闭包同工作集——自烤与车头烤是同一逻辑工作"（这是**断言**，不是推导）。
- `docs/selfhost-resource-plan.md:27-28`（门禁进程树、Linux cgroup v2）：依据写"门=编译臂串行复用"、"与 Darwin 进程树守卫同口径"。
- `tools/user_path_gate.sh:40-44`（HEAD 版）复述同一条依据："C 链同闭包实测 717-748MiB + 3% 余量"。
- `VERIFY_tamem_model_append.md` **通篇不含 `805,306,368` 或 `768MiB` 的推导**；它是把 768MiB 当**待命中的锚**做模型对账（`:147` 原文："去掉 B1 即回落 ≈830-880MB，再去 B2 落 ≈740-790MB，贴 768MiB 锚"）。⇒ 该文件是**验证方**，不是**来源方**。

**"717-748"带内两个端点的出处**（回源）：
- 717 MiB / 726 MiB：`verify_append/VERIFY_w153_append.md:7`（原文"当前树真实烤机峰值 = 717MiB（jobs=8）/ 726MiB（jobs=1）"），`:44`、`:48` 复述。
- 747.7 MiB / 724.7 MiB：`verify_append/VERIFY_phasec_l3b2_append.md:11`（`ru_maxrss` 两轮），`:52`、`:74`。
- 748 MiB：`verify_append/VERIFY_gen2p1_2_append.md:90`（原文"静窗 210-227s rc=0 峰 748MiB vs 负载窗 3319s 穿帽 1.134GiB"）。
- "717-748"作为**锚带**被成建制引用：`verify_append/VERIFY_gen2r3_append.md:7`、`:37`。

### 2.3 复算：+3% 余量算不出 768（**不可复算项**）

```
768 MiB = 768 × 1,048,576 = 805,306,368 B                  ✓ 与常量逐字节相等
717 MiB × 1.03 = 738.510 MiB =  774,383,862 B              ≠ 805,306,368
726 MiB × 1.03 = 747.780 MiB =  784,104,161 B              ≠ 805,306,368
747.7 MiB × 1.03 = 770.131 MiB = 807,540,883 B             ≠ 805,306,368
748 MiB × 1.03 = 770.440 MiB =  807,864,893 B              ≠ 805,306,368
带中点 (717+748)/2 = 732.5 MiB × 1.03 = 754.475 MiB        ≠ 805,306,368
反解：805,306,368 / 1.03 = 781,851,814 B = 745.6311 MiB
```

⇒ 若要"×1.03 = 768MiB"成立，**基值必须恰为 745.63 MiB**；该值落在 717–748 带内，但**不是任何一个被记录的实测锚**（最接近的实测是 747.7 MiB，它 ×1.03 = 770.13 > 768）。
⇒ 768 MiB 同时是 0.75 GiB（整数字节对齐），形态上更像**在实测带内取的整数锚**，而不是"某基值 +3%"的计算结果。
⇒ 判断：**推导链在文档层可追溯到 `selfhost-resource-plan.md:24`，但该行的算术不可复现**。标为待修（§⑦-2），不替它圆。

### 2.4 逐相锚表复算

上游公式在 `VERIFY_tamem_model_append.md:43-121`（相 0–相 6）。仓库把结果抄进 `tools/memory_model_limits.sh:12-18`。逐相复算：

| 相 | 公式（文件:行） | 复算 | 与写出值 | 判定 |
|---|---|---|---|---|
| enter | `VERIFY_tamem_model_append.md:47`：`WS_0 = 二进制底 190 + 记账底 ≈190` | 190 | 190 | ✓（`:25` 给出分解 155+12+23=190 ✓） |
| bind | `:52-55`：`WS_1 = 190 + 30.6 + (10~30)` | 230.6 ~ 250.6 | 230-250 | ✓ 可复算 |
| profiles | `:60-70`：`WS_2 = WS_1 + 92 + 2.6 + (47~67)` | 下沿 230+92+2.6+47 = **371.6**；**按输入极值的上沿** 250+92+2.6+67 = **411.6** | 372-392 | **端点上沿不自洽**：392 = 250+92+2.6+**47**（高 WS_1 配**低** exprCall），不是极值组合。差额 19.6 MB（§⑦-4） |
| metadata | `:76-78`：`WS_3 = WS_2 - masks + (12~46) + ~5` | 随 WS_2 端点浮动 | 390-440 | 依赖 WS_2，无法独立判定 |
| forest | `:83-93`：`T = tokens + nodes + typeSyntax + statementRoots + declarations + (15~30)` | 输入极值组合：**430.2 ~ 590.2**（123+243+27+21+1.2+15 ↔ 151+360+27+21+1.2+30） | T ≈ 445-530（中位 488） | **写出的带比输入极值带窄**：下沿 445 > 430.2、上沿 530 < 590.2，端点组合未写明（§⑦-5） |
| TypeArena | `:106-115`：`A = 61 + 17 + (20~40)` | 98 ~ 118 | 100-120 | ✓ 可复算 |
| 相 6 | `:119-121`：待钉区⑤，无系数 | — | "待钉区⑤" | 未定位（作者自认） |

逐项分量复算（全部命中）：
- tokens `:84-86`：3.80M × 9 列 × 4 B = 136.8 MB（写 137 MB ✓）；census ±10% → 123–151 MB ✓
- nodes `:87`：2.6M × 29 × 4 B = 301.6 MB（写 302 MB ✓）；2.1M×116 = 243.6、3.1M×116 = 359.6（写 243–360 ✓）
- typeSyntax `:88`：172k × 40 × 4 B = 27.5 MB（写 27 MB ✓）
- statementRoots `:89`：764,465 × 7 × 4 B = 21.4 MB（写 21 MB ✓）
- declarations `:90`：18,515 × 16 × 4 B = 1.18 MB（写 1.2 MB ✓）
- lineInternPool `:61-65`：24 + 9.3 + (16+4×3)×2²¹ B = 24 + 9.3 + 58.72 = 92.0 ✓（**但三处单位是 MB，见 §2.5**）
- typed facts 行宽（源码侧）：`src/core/tooling/backend_driver_main.cheng:3607-3611` 断言 `physicalRowBytes == int32Cols×4 + u8Cols×1`，与 `VERIFY_tamem_model_append.md:119-120` 的 "26×4+15×1 = 119 B/行" 是同一口径 ✓

### 2.5 单位口径警告（**可复算的文档缺陷**）

- `VERIFY_tamem_model_append.md` 全篇写 **MB**（`:7` "实测 478-560MB"、`:25` "≈190MB"、`:70` "≈372-392MB"、`:130` "830-880MB"）。
- `tools/memory_model_limits.sh:12` 却把**同一批数字原样**标成 **"单位 MiB"**（`:13` enter 190、`:16` forest 窗 750-880）。
- 二者相差 1 MiB / 1 MB = **4.86%**。在 372–392 这个量级上是 **±18 MB 的歧义**；在 750–880 上是 **±36～43 MB**。
- 没有任何文件写明过这个换算。⇒ 逐相锚表当前**不能与 MiB 口径的门线（768 MiB）直接相减**。标为待修（§⑦-3）。

### 2.6 门值的强制点（运行时侧，全部回源）

| 强制点 | 文件:行 | 值 | 作用 |
|---|---|---|---|
| Darwin 进程树守卫 | `tools/beat_c_process_group_guard.sh:4` | `BEAT_C_GUARD_RSS_LIMIT_BYTES:-805306368` | 外门默认 |
| 同上（合并输出上限） | `tools/beat_c_process_group_guard.sh:35` | `:-805306368` | 输出上限，非 RSS |
| 用户路径门 | `tools/user_path_gate.sh:45` | **HEAD=`RSS_CAP_MIB=768`；工作树=`1024`** | 见 §⑦-9 |
| Linux cgroup v2 硬门 | `tools/lifetime_orc_linux_cgroup_v2_hard_memory_gate.py:956` | `memory.max=805306368`（`:957` swap.max=0） | Linux 侧同口径 |
| ZC 枚举门 | `tools/zc_enumerate.sh:50`、`:780-781`、`:793-796` | `805306368` | 生产 RSS 限与守卫读数校验 |
| 进程内建自守卫默认（**不是** 768） | `src/core/tooling/backend_driver_main.cheng:4593` | `return int64(8589934592)` | `CHENG_PROCESS_MAX_RSS_BYTES` 缺省 = 8 GiB |
| 同上（另一路径） | `src/core/tooling/backend_driver_main.cheng:1849-1851` | 缺省 `"8589934592"` | 缓存预热路径 |
| Cheng 源码内的门常量 | `src/core/tooling/backend_driver_main.cheng:4210` | 硬编码串 `805306368` | 随 `22aef12b3` 由 `1073741824` 改来（`git log -S` 单条命中） |
| 同上（孪生副本） | `src/core/tooling/backend_driver_dispatch_min.cheng:2451`、`:2455` | 同上 | 两份拷贝，需同步改 |

⇒ 门值有 **8 个以上强制点，其中 2 个是源码内硬编码字面量（各一份拷贝）**。它不是一个从模型算出来的量，是一个被复制的常量。

### 2.7 源码内的内存理论模型（闭式，非"待钉区"）

`src/core/tooling/backend_driver_main.cheng:3721-3863` 是一个**完整的闭式 RSS 模型**（`backend_driver_dispatch_min.cheng` 有孪生副本）。全部公式抄录（行号为 `backend_driver_main.cheng`）：

```
结构化相（:3753-3765）
  csgIncremental      = csgGraph + exprLayer + typedFacts + typedIr
  primaryIncremental  = primary + lowering/2
  csgPhase            = sourceText + csgIncremental
  loweringPhase       = sourceText + typedIr + lowering
  primaryPhase        = sourceText + typedIr + primaryIncremental
  providerPhase       = sourceText + primary + provider
  linkPhase           = providerPhase + link
  reportPhase         = sourceText + primary + report
结构化峰（:3766-3787）
  structuredPeak      = max(csgPhase, loweringPhase, primaryPhase, providerPhase, linkPhase, reportPhase)
  peakPhaseName       = argmax 的相名
分配器项（:3792-3805）
  capacityBytes       = structuredPeak / 4
  orcBytes            = typedIrFunctions × 48 + sourceFiles × 64
  arenaBytes          = (csgGraph + typedIr + lowering + primary) / 5
  allocatorHeuristic  = structuredPeak / 2 + 4,194,304
  allocatorClassified = capacityBytes + orcBytes + arenaBytes
  allocatorModeled    = max(allocatorHeuristic, allocatorClassified)
  allocatorGap        = allocatorModeled - allocatorClassified
  modeledPeak         = structuredPeak + allocatorModeled
  modeledBudget       = modeledPeak × 2 + 16,777,216
  modeledGuard        = modeledBudget + 67,108,864                     (:3807-3809)
理论下界（:3817-3818）
  consumeWindowLowerBound = structuredPeak
  modeledLowerBound       = consumeWindowLowerBound + orcBytes         ← 这是 official 的 lower bound
```

模型自述边界（`:4179-4185`，逐字）：
- `full_compile_theory_rss_estimate_status=non_exhaustive_modeled_estimate_not_proven_upper_bound`
- `full_compile_theory_rss_component_coverage=non_exhaustive`
- `full_compile_theory_rss_unmodeled_owner_count=8`
- `full_compile_theory_rss_unmodeled_components=typed_fact_intern_payload,other_string_and_intern_pools,allocator_runtime_metadata,process_runtime_baseline,thread_stacks,device_allocations,linker_allocations,codegen_provider_allocations`
- `full_compile_theory_rss_proven_upper_bound_status=not_proven`

**对该模型的判定**：它是**下界**模型且自认**非穷尽、未证明上界**；把它和 768 MiB 门比较只能得到"下界已超门 ⇒ 必然不可达"这一种有效结论，**不能**得到"下界低于门 ⇒ 能装下"。

**输入项的原子来源**（`:4284-4385`，这才是"从哪些原子量得出"）：
- 派生量：`declEstimate=max(declCount,functionCount)`；`functionEstimate=functionCount`（缺则 `ceil(sourceLines/24)+sourceFiles`）；`exportEstimate=max(exportCount,importcCount)`；`callEdgeEstimate=max(callEdgeCount,functionEstimate)`；`typeRefEstimate=max(typeRefCount,declEstimate)`
- `typedIrFunctions = functionEstimate + sourceFiles`（`:4292`）
- `typedIrStatements = max(ceil(sourceLines/2)+callEdgeEstimate+ceil(typeRefEstimate/2), typedIrFunctions)`（`:4295-4299`）
- `csgExprs / csgNodes / csgEdges / csgFacts`：由 sourceLines/sourceFiles/importEdges/declEstimate/functionEstimate/typeRefEstimate/exportEstimate 的**固定系数**线性组合（`:4300-4330`）
- `loweringBodyIrOps = typedIrStatements×3 + csgExprs`（`:4335-4336`）
- `primaryInstructionWords = loweringBodyIrOps×2 + typedIrFunctions×16`（`:4340-4342`）
- RSS 相字节：`rssSourceText = sourceBytes×2 + sourceFiles×128`（`:4356-4358`）；`rssCsgGraph = csgNodes×40 + csgEdges×16`（`:4359-4361`）；`rssExprLayer = csgExprs×48`（`:4362`）；`rssTypedIr = typedIrFunctions×192 + typedIrStatements×64`（`:4371-4373`）；`rssLowering = loweringBodyIrOps×48 + loweringFunctions×256`（`:4374-4376`）；`rssPrimary = primaryInstructionWords×8 + primaryRelocs×32 + primaryDataLabels×64`（`:4377-4381`）；`rssProvider = 0`、`rssLink = 0`（`:4382-4383`，**未建模**）；`rssReport = sourceFiles×64 + 4096`（`:4384-4385`）
- **没有一项用到页大小、arena 上限、并发数、保留区**。并发只进 `BackendDriverFullRssParallelMemoryModelTryBuild`（`:3903-4141`），且只用于把 `loweringIncremental`/`primaryIncremental` 乘 `guardScaleNumerator/Denominator = 3/1`（`:3937-3938`）后算"每 worker 字节"，再反解 `memoryLimitedMaxJobs`（`:4085-4103`）——**不参与 `modeledLowerBoundBytes`**。

---

## ③ 编译理论下限推导链

### 3.1 `compile_theory_parallel_limit_ms`（C 链）——产生处与逐位复算

**产生处（HEAD 锚点，全部在 `bootstrap/cheng_cold.c`）**：

| 行 | 内容 |
|---|---|
| `:75457` | 结构体字段 `uint64_t compile_theory_parallel_limit_us;` |
| `:75861-75872` | `cold_process_tree_cpu_us()` = `getrusage(RUSAGE_SELF)` + `getrusage(RUSAGE_CHILDREN)` 的 `utime+stime` 之和（微秒） |
| `:75907-75910` | `cold_div_ceil_u64(a,b) = a/b + (a%b != 0)` |
| `:75958-75977` | `cold_stats_finalize_compile_theory()` |
| **`:75966`** | `stats->compile_real_cpu_us = cold_process_tree_cpu_us();` |
| **`:75967-75970`** | **`stats->compile_theory_parallel_limit_us = cold_div_ceil_u64(stats->compile_real_cpu_us, (uint64_t)stats->hardware_logical_cpus);`** ← **要定位的公式** |
| `:75972-75976` | `compile_real_lines_per_second = ceil(lines×1e6 / elapsed_us)`；`compile_theory_lines_per_second = ceil(lines×1e6 / theory_us)` |
| `:75961-75965` | `hardware_logical_cpus = cold_hw_cpu_count("hw.logicalcpu", _SC_NPROCESSORS_ONLN)`（另取 `hw.physicalcpu` / `hw.perflevel0.logicalcpu` / `hw.perflevel1.logicalcpu` / `hw.memsize`） |
| `:76016` | **模型标签**：`compile_theory_model=measured_cpu_work_per_line_div_logical_cpu` |
| `:76029-76042` | 文件回执输出（`compile_real_elapsed_ms` / `compile_real_cpu_ms` / `compile_theory_parallel_limit_ms` / `compile_real_over_theory_x` = `(elapsed×1000)/theory` 整毫） |
| `:76055-76062` | stdout 版（同上，字段顺序不同） |
| `:82278` | 回执调用点 `cold_print_compile_theory_report(file, stats)` |
| `:113922`、`:113967`、`:115571`、`:115729`、`:115920` | stdout 调用点（system-link-exec / bake 路径） |

**模型公式（唯一一条）**：

```
compile_theory_parallel_limit_us = ceil( compile_real_cpu_us / hardware_logical_cpus )
```

即：**把本轮进程树实测消耗的总 CPU 时间，按逻辑核数摊平**。

**输入项（全部）**：① `compile_real_cpu_us`（本轮 RUSAGE_SELF + RUSAGE_CHILDREN 实测）；② `hardware_logical_cpus`（`hw.logicalcpu`，失败回退 `_SC_NPROCESSORS_ONLN`，再回退 1）。
**没有第三个输入**：公式里**不含**行数、字节数、worker 数、串行占比。

**逐位复算（原始件 `.rebuild/auth_fix/kd_fix.report.txt:76-92`、`.rebuild/auth_fix/bake.log:4114-4121`）**：

```
输入：compile_real_cpu_ms = 199214.816  → compile_real_cpu_us = 199,214,816
      compile_hardware_logical_cpus = 14
理论：ceil(199,214,816 / 14) = ceil(14,229,629.714…) = 14,229,630 us
      → 14,229.630 ms                                    ✓ 与回执 compile_theory_parallel_limit_ms=14229.630 逐位相等
比值：compile_real_elapsed_ms = 194117.692 → elapsed_us = 194,117,692
      (194,117,692 × 1000) / 14,229,630 = 13641.66… → 整除 13641
      → 13.641                                           ✓ 与回执 compile_real_over_theory_x=13.641 逐位相等
线速：ceil(641,945 × 1e6 / 194,117,692) = 3307            ✓ 等于 compile_real_lines_per_second=3307
      ceil(641,945 × 1e6 / 14,229,630)  = 45114           ✓ 等于 compile_theory_lines_per_second=45114
百分：1364.179                                            ✓ 等于 compile_real_over_theory_percent
```

其余输入项（同回执 `:78-85`）：`compile_input_source_file_count=234`、`line_count=641945`、`byte_count=30549584`、`logical=14`、`physical=14`、`perflevel0=10`、`perflevel1=4`、`hw.memsize=51539607552`(48 GiB)。

### 3.2 模型标签与公式矛盾（**待修**）

`:76016` 的标签是 `measured_cpu_work_per_line_div_logical_cpu`，**含 "per_line"**；但 `:75967-75970` 的公式**没有任何行数项**。行数只出现在两个 `lines_per_second` 派生量里（`:75972-75976`）。
⇒ 标签描述的不是公式。标为待修（§⑦-6）。

### 3.3 这条量的真实含义：**有效并行度，不是算法下限**

由 `ratio = elapsed / (cpu/N) = N / speedup`：

```
speedup = cpu / elapsed = 199,214.816 / 194,117.692 = 1.02626
14 / 1.02626 = 13.641   ✓ 与 compile_real_over_theory_x 相等
```

⇒ `compile_real_over_theory_x = 13.641` 的物理含义是 **"该轮有效并行度只有 1.026 个逻辑核（共 14 核）"**，等价于并行效率 7.3%。
⇒ 它**不是**"理论最少需要 14.2 秒"——因为 199,214,816 µs 这个 CPU 时间本身就是这一轮跑出来的。**序列时间由算法决定，这条量不能预测优化后的墙钟。** 用它做收敛判据只能测"并行用没用起来"，不能测"算法复杂度是否收敛"。
⇒ `docs/cheng-plan.md（原 memory 计划 :381）` 把它称为"模型给出的边界"、§七-1 称"理论量是硬边界"，与源码事实（后验折算）不符。标为待修（§⑦-7）。

### 3.4 Cheng 链确定性编译模型（`full_compile_theory_time_*`）——仅 dry-compile

**产生处**：`src/core/tooling/backend_driver_main.cheng:4437-4451`；孪生副本 `src/core/tooling/backend_driver_dispatch_min.cheng:2994-3010`；输出 `:4522-4559`。

**公式（逐行抄录，`backend_driver_main.cheng`）**：

```
串行相（:4416-4446）
  sourcePhaseNs    = max(sourceClosureNs, sourceFiles×200000 + sourceBytes×50)
  csgPhaseNs       = csgNodes×3000 + csgFacts×1200 + csgExprs×2000
  typedIrPhaseNs   = typedIrFunctions×70000 + typedIrStatements×1200
  providerPhaseNs  = 0                                            ← 未建模
  linkPhaseNs      = 1,000,000（formatFloor ≥4096 时 5,000,000）   ← 常量
  reportPhaseNs    = sourceFiles×50000 + 250000
  serialPhaseNs    = sourcePhaseNs + csgPhaseNs + typedIrPhaseNs + providerPhaseNs + linkPhaseNs + reportPhaseNs
可并行相（:4447-4449）
  parallelizablePhaseNs = loweringPhaseNs + primaryPhaseNs
      loweringPhaseNs = loweringBodyIrOps×2500 + loweringFunctions×50000
      primaryPhaseNs  = primaryInstructionWords×1000 + primaryRelocs×5000 + primaryDataLabels×3000
  parallelShareNs = ceil(parallelizablePhaseNs / effectiveJobs)
理论下限（:4449）
  lowerBoundNs = serialPhaseNs + parallelShareNs
预算上界（:4450-4451）
  budgetUpperNs = lowerBoundNs×3 + 20,000,000 ns
```

**模型假设（从公式反读，源码未写文字说明）**：
- 可并行的只有 **lowering_plan** 与 **primary_object_plan** 两相；其余（source closure / compiler_csg / typed_ir / provider / link / report）**全额串行**。
- 并行粒度 = **整相**（不是函数、不是文件）：一相之内按 `effectiveJobs` 整除，**没有考虑负载不均**。
- 串行瓶颈 = `serialPhaseNs`，其中 `sourcePhaseNs` 用 max(实测闭包时间, 系数估计) 兜底；`linkPhaseNs` 是两个常数（1 ms / 5 ms），**不是模型**。
- `legacyRetainedCumulativeEstimateBytes`（`：3788-3791`）另有一条"旧累计式"估计，仅供对比，不进 lower bound。

**复算（`artifacts/bootstrap/compiler_main.direct.dry-smoke.report.txt`，29 源 dry-smoke，`effective_jobs=1`）**：

```
:1893 serial_phase_ms        = 5761
:1895 parallelizable_phase_ms = 1221
:1897 lower_bound_ms         = 6982
复算：5761 + ceil(1221/1) = 6982                            ✓ 逐位相等
```

### 3.5 Cheng 链内存下界复算（同上回执）

```
:1809 modeled_structured_peak_bytes = 91,403,182
:1742 typed_ir_funcs                = 2,209
:1728 source_closure_files          = 29
:1822 orc_bytes = 2209×48 + 29×64 = 106,032 + 1,856 = 107,888     ✓ 逐位相等
:1813 lower_bound_bytes = 91,403,182 + 107,888 = 91,511,070        ✓ 逐位相等
:1814 official_hard_gate_bytes = 1,073,741,824                     ← 该回执早于 22aef12b3，现源码为 805,306,368
:1815 lower_bound_fits_hard_gate = 1
```

⇒ T5 模型**逐位可复算**，且复算所需的全部输入都在同一回执里。

### 3.6 输出路径与接线现状（**决定性**）

| 路径 | 是否输出理论字段 | 证据 |
|---|---|---|
| C 链 bake / `system-link-exec` 回执 | **是**（`compile_theory_*`） | `.rebuild/auth_fix/kd_fix.report.txt:76-92`；`tools/formal_lowering_lifetime_receipt_gate.sh:6806-6810`、`:6969-6973` 把 12 个键设为**必需 schema** |
| Cheng 链 `system-link-exec` stdout | **是**（同上，走 `cheng.stage3`） | `tools/ci_gate.sh:266` 从 `$PERF_REPORT` 读 `^compile_real_over_theory_x=` |
| Cheng 链 **真实自烤**（`dispatch_min` 实跑） | **否，0 个理论字段** | `.rebuild/run_b5/full/{A_default,B_raised4g,selfbake}.stdout.txt` grep `full_compile_theory\|compile_theory` = **0 命中**（三文件全 0） |
| Cheng 链 **dry-compile** | 是（`full_compile_theory_*` + `compile_parallel_theory_*`） | 调用链唯一：`BackendDriverDispatchMinRunDryCompileConcretePlan`（`backend_driver_dispatch_min.cheng:6158`）→ `:6246` → `BackendDriverDispatchMinAppendDryCompileReport`（`:2857`）→ `:3021` → `BackendDriverDispatchMinAppendFullTheoryReport`（`:2477`） |

⇒ **234 源自烤（唯一的内存/时间实测载体）不产任何理论字段**；理论块只走 dry-compile。这就是"运行时是否收敛到理论不可判定"的机械原因。

### 3.7 dry-compile 的两条"理论下限"互相冲突，且其比值恒为 1.000

同一份 dry-smoke 回执里**同时存在两条都被叫"理论下限"的量，相差 27%**：

```
:1701 compile_parallel_theory_lower_bound_ms      = 5479     ← dry-compile precheck 口径
:1897 full_compile_theory_time_lower_bound_ms     = 6982     ← 系数模型口径
:1706 compile_parallel_real_over_theory_x         = 1.000
:1708 compile_parallel_theory_efficiency_percent  = 100.000
```

`:1706` 的 1.000 **不是测量结果，是恒等式**：dry-compile 路径里
`totalNs = systemLinkPlanNs + sourceClosureNs`（`backend_driver_dispatch_min.cheng:6242`），而
`lowerBoundNs = systemLinkPlanNs + ceil(sourceClosureNs / effectiveJobs)`（`:2898-2900`）。
`effectiveJobs = 1` 时两式**恒等** ⇒ 比值必为 1.000、效率必为 100.000，**零信息量**。
⇒ 这条 `real_over_theory_x` 在 dry-compile 口径下**不能用作收敛判据**；只有 C 链 bake 口径的那条（§3.1）是真实测量。标为待修（§⑦-14、§⑦-15）。

---

## ④ 运行时实测对照表（逐项、标口径）

口径列标注：**同口径**（可直接相除）/ **异口径**（不可相除，只列）/ **缺失**。

| # | 理论侧 | 理论值 | 运行时实测 | 比值 | 口径判定 |
|---|---|---|---|---|---|
| 1 | 内存门 T1 | `805,306,368 B` = 768 MiB | pass0 逐源 arena 求和 Σ = `1,290,508,960 B`（B 轮抬门，`VERIFY_fullgo_0910_append.md:496`；原始件 `.rebuild/run_b5/full/B_raised4g.stderr.txt`） | **1,290,508,960 / 805,306,368 = 1.6025×**（同 B/B 口径；**文档现写 1.53×，是混算，见 §⑦-1**） | 名义同口径（都是字节），但**语义不同**：Σ 是 arena 请求字节，门是进程驻留字节 → 见 §⑤-7 |
| 2 | 内存门 T1 | 同上 | 默认门 A 轮守卫读数 `rss_bytes=836,388,064` > `limit_bytes=805,306,368`，rc=125@176s，死在 `forest src=61`（`VERIFY_fullgo_0910_append.md:483,486-487`；原始件 `.rebuild/run_b5/full/A_default.summary.txt`） | 超线 `31,081,696 B` = **29.64 MiB（+3.86%）**；同口径比值 **1.0386×** | **同口径**（守卫读数 vs 守卫限值） |
| 3 | 内存门 T1 | 同上 | 抬门 4GiB B 轮 peak phys `2,107,262,968 B`（`VERIFY_fullgo_0910_append.md:500`） | **2.6167×**（同口径；文档写 2.62× ✓ 正确） | **同口径** |
| 4 | 内存门 T1 | 同上 | pass0 起点 `csg_stage=after_profile_source_payload_release rss_bytes=609,387,432`（`:497`） | **0.7567×**（低于门） | 同口径；说明"保底驻留"单项不穿门 |
| 5 | 内存门 T1 | 同上 | pass0 末 `rss=781,288,480 live=3,089,597`（`:496`；原始件已核对：`forest_parsed src=233 arena=117280 rss=781288480 live=3089597`） | **0.97017×**（占门 **97.02%**；文档写 96.9%，见 §⑦-12） | 同口径 |
| 6 | 逐相锚·enter | 190（MB 或 MiB，**未定**，§2.5） | 未在同轮采集 | — | **缺失** |
| 7 | 逐相锚·profiles | 372-392 | B 轮 `after_profiles rss_bytes=395,625,264`（`:497`） | 395.6 MB / 377.3 MiB——落在 372-392 的**哪一种单位下结论相反** | **单位未定 ⇒ 不可比** |
| 8 | 逐相锚·forest 窗 | 750-880（来源未定位，§⑦-11） | B 轮 `forest_build_start mode=reparse rss=609,387,432`（`:497`）→ pass0 末 `rss=781,288,480`（`:496`） | 781.3 MB / 745.1 MiB | **单位未定 + 来源未定位 ⇒ 不可比** |
| 9 | 逐相锚·TypeArena | 100-120 | **无实测**（`type_arena_lines=0`，A/B 两轮；`:483`、`:500`） | — | **缺失**（埋点在门内不可达，见 §⑦-12） |
| 10 | 编译下限 T3 | `14,229.630 ms` | `194,117.692 ms`（同轮） | **13.641×**；⇒ **有效并行度 1.026 / 14 核** | **同轮同口径**，但理论量是后验折算（§3.3），比值语义 = 并行效率倒数，**不是算法收敛度** |
| 11 | 编译下限 T3 | — | 234 源自烤（Cheng 链，`dispatch_min` 实跑） | **无该字段** | **缺失（未接线）**（§3.6） |
| 12 | 编译下限 T4 | dry-smoke（29 源、jobs=1）`lower_bound_ms=6982`；同报另有 precheck 口径 `5479` | 同回执 `compile_parallel_real_over_theory_x=1.000`（**恒等式，非测量**，§3.7） | 1.000 无意义 | **异口径 + 自证**（29 源 dry-scan vs 234 源真编；比值恒 1） |
| 13 | 内存下界 T5 | dry-smoke `91,511,070 B` | 同回执无 RSS 实测 | — | **异口径**（模型下界 vs 无实测） |
| 14 | 内存下界 T5 | **234 源闭包的理论下界：未定位/未计算** | 234 源闭包真实峰 `2,107,262,968 B` | — | **缺失**：无任何回执含 `full_compile_theory_source_closure_files=234`（全仓 grep 0 命中） |
| 15 | 内存/时间轴·时间墙 | — | 并林窗：`src=2` 起 16+ 分钟零输出（`:498`） | `docs/cheng-plan.md（原 memory 计划 :154）` 判"编效率 13.641×"与本条**不是同一量** | **异口径，不得互代** |
| 16 | 森林窗时长 | 判据"<120s"（`docs/cheng-plan.md（原 memory 计划 :389）`） | ① 抬门 4GiB 轮 pass0 234 源 el≤281s；② 补两缓存后 29 源口径森林窗 `553,914 ms`（`docs/cheng-plan.md（原 memory 计划 :175）`） | — | **异口径**：两个数来自不同闭包（29 vs 234） |

**关键否定性事实（照录，不改写）**：Σ = 1,290,508,960 B **单项就大于门**（`VERIFY_fullgo_0910_append.md:146`"结论①：增量消费是不可选项"、`:516`）。这条不依赖任何单位换算，是 B/B 比较，**成立**。

---

## ⑤ 不可比项与不确定项（共 12 条）

1. **理论门说的闭包 ≠ 实测的闭包。** 门值依据写的是"C 链同闭包实测 717-748MiB"（35 条目车头烤，`docs/selfhost-resource-plan.md:24`）；实测撞门的是 **234 源自烤闭包**（`compile_input_source_file_count=234`）。`docs/selfhost-resource-plan.md:26` 用"同一逻辑工作"把它们并起来，但**该断言无证据**。两者不可直接相减。
2. **理论门是"编译臂单遍工作集"，实测门是"进程树 resident/phys footprint"。** `VERIFY_gen2r3_append.md:7` 自己已记："编译臂（锚定义口径）686-703MiB vs guard 全树驻留峰 806.38-808.28MiB，超锚 38-40MiB"。**同一轮同一个跑，两个口径差 100+ MiB。** 任何"vs 768 门"的比值必须先声明用哪个口径。
3. **T3 不是先验理论。** 输入含本轮实测 CPU 时间，无法用于预测；比值语义是并行效率（§3.3）。
4. **T5 是下界，且自认非穷尽。** `full_compile_theory_rss_lower_bound_bytes` 只加 `structuredPeak + orcBytes`，排除 8 类 owner（`backend_driver_main.cheng:4183-4184`）。`lower_bound_fits_hard_gate=1` 不蕴含"能装下"。
5. **T4 的输入也是实测。** `serialPhaseNs` 里 `sourcePhaseNs = max(sourceClosureNs, …)`，`sourceClosureNs` 是实测闭包耗时（`backend_driver_main.cheng:4642`）。⇒ 与 T3 同病，只是拆得更细。**并且 dry-compile 的 `compile_parallel_real_over_theory_x` 恒为 1.000**（§3.7 恒等式），同一份回执里还有两条相差 27% 的"理论下限"（5479 ms vs 6982 ms）——该口径下的"收敛比"**零信息量**。
6. **Cheng 链与 C 链的模型不是同一个。** C 链只有 `cpu/N`；Cheng 链有相划分 + 系数表。**两套数字不可互代**（`docs/cheng-plan.md（原 memory 计划 :69）` 自述"两套数字不可互代"）。
7. **Σ（arena 请求字节）与 RSS（驻留页）不是同一口径。** Σ 是 `ParserValueExprTree.arena.used` 类量逐源求和；RSS 含 malloc 元数据、未归还脏页、二进制段、LINKEDIT。二者**不可相加、不可相除**。`VERIFY_fullgo_0910_append.md:511-517` 已明确"时序上不可加"，但 §④-1 那条 1.60× 仍常被当"内存占用是门的 1.6 倍"读——那是误读。
8. **`live` 是块数不是字节。** `live=1,470,764 → 3,089,597` 是活块计数；"+171.9 MB" 实际来自 RSS 差（`781,288,480 − 609,387,432 = 171,901,048 B = 171.90 MB = 163.94 MiB`，**可复算**），不是 live 换算。二者**不得互相推导**。
9. **234 源闭包的理论内存下界从未被算过、也没被记录。** 全仓 grep `full_compile_theory_source_closure_files=234` = 0 命中。⇒ "模型说该闭包至少需要 X" 目前**不存在**。
10. **单位 MB/MiB 在链条内混用且不标注**（§2.5）。4.86% 的系统性歧义。
11. **"森林窗"无统一定义。** `docs/cheng-plan.md（原 memory 计划 :389）` 判据写"森林窗 <120s"，但 `VERIFY_fullgo` 里的"森林窗"至少有三个候选埋点对：`forest_build_start → after_profile_lookup`、`forest_build_start → 末条 forest_appended`、`after_profile_source_payload_release → after_profile_lookup`。三者数值差数倍。**判据在定义前不可判定。**
12. **抬门轮（4GiB/1.5GiB）的状态本身即病态证据**（`docs/cheng-plan.md（原 memory 计划 :382）`）。⇒ 用抬门轮的 `forest_parsed=234` / `forest_appended=40` 做"进度基线"在纪律上不允许，只能做诊断。本文 §④ 引用时已逐条标 `diagnostic`。

---

## ⑥ 收敛判据清单（每条配可判定判据）

| # | 理论量 | 达标判据（可判定） | 判定工具 / 观测点 | 当前值 | K 的取值理由 |
|---|---|---|---|---|---|
| C1 | 内存门 768 MiB | **默认 768MiB 门（内门 + 外门同时 =`805,306,368`）下，234 源全量自烤 `rc=0` 且 `forest_appended_lines=234`（并林跑完）** | 内门 `CHENG_PROCESS_MAX_RSS_BYTES=805306368`；外门 `tools/beat_c_process_group_guard.sh --rss-limit:805306368`；进度读 `forest_*_lines` | **未达标**：rc=125@176s、`forest_parsed=61`、`forest_appended=0` | 无 K（硬边界，来自 `docs/cheng-plan.md（原 memory 计划 :389）` 判据①，与门值同源） |
| C2 | 逐相内存锚 | 每相实测 RSS 对锚值差值 **≤ 50 MB 且 ≤ 20%** | `csg_stage=…rss_bytes=` 埋点对锚表逐行 | 未达标（profiles 相已超） | **两个阈值并存需裁决**：绝对阈值出自 `VERIFY_tamem_model_append.md:149`（">50MB 即遗留物待解释"），相对阈值出自 `docs/selfhost-resource-plan.md:20,30`（">20% 开持有者核账"）。建议：小相（<500 MB）用 50 MB，大相用 20%，**必须二选一写进判据**（§⑦-13） |
| C3 | 编译下限 T3（C 链） | `compile_real_over_theory_x ≤ K` | `grep '^compile_real_over_theory_x=' <report>`；已有实现 `tools/ci_gate.sh:266-272` | 实测 **13.641** | **仓库既有取值 K=30**（`tools/ci_gate.sh:269 MAX_RATIO=30`）——直接沿用，理由=既有门禁基线。**新增更严目标：K=4**，理由：`K = N/speedup`，本机 N=14 ⇒ K=4 等价于**有效并行度 ≥3.5 核 / 并行效率 ≥25%**；当前 1.026 核（效率 7.3%），是**提升 3.4 倍**的中间站。K=2（效率 ≥50%）留作终态，理由：并行计算通行的"可用"门槛 |
| C4 | 编译下限 T4（Cheng 链） | 实际墙钟 ≤ `full_compile_theory_time_budget_upper_bound_ms` | 该字段已在 `backend_driver_main.cheng:4557-4559` 输出 | **无值**（dry-smoke 才有） | **K=3 + 20 ms 是源码既有取值**（`backend_driver_main.cheng:4450-4451`，`budgetUpperNs = lowerBoundNs×3 + 20000000`），非本文杜撰 |
| C5 | 内存下界 T5 | `full_compile_theory_rss_lower_bound_bytes ≤ 805,306,368`（即 `…_fits_hard_gate=1`） | `backend_driver_main.cheng:4209-4214` | **无值**（234 源闭包未产） | 无 K（硬边界）。**注意这是必要条件不是充分条件**（§⑤-4） |
| C6 | 森林窗时长 | `after_profile_lookup` 埋点的 `since_ms ≤ 120,000`，且**必须绑定单一闭包口径**（建议固定为 234 源默认门） | `csg_stage=after_profile_lookup since_ms=` | 234 源口径**无值**（门内死在 pass0）；29 源口径 `553,914 ms` | 阈值 120 s 来自 `docs/cheng-plan.md（原 memory 计划 :389）` 判据②。理由：当前 234 源 pass0 全量在 el≤281s 内完成（抬门轮），森林窗若占其中 <120 s 则不再是主项 |
| C7 | 并行接线 | `full_compile_theory_rss_lower_bound_fits_hard_gate` 与 `compile_parallel_theory_efficiency_percent` 出现在**真实自烤**回执里 | 当前只在 dry-compile（§3.6） | **未接线** | 无 K（前置接线项，§⑦-8） |
| C8 | 逐相贴线（结构） | `full_compile_theory_rss_peak_phase_name` 与实际最慢相一致 | 该字段已在 `:4228` 输出 | 无值 | 无 K |

**判据的判定前提（必须同时成立才叫"可判定"）**：
- 必须写明**闭包**（234 源 / 29 源 / 35 条目）与**守卫口径**（内门 / 外门 / 编译臂 / 进程树 resident / phys footprint）——缺一不可判。
- 抬门轮一律标 `diagnostic`，**不得作为 C1–C6 的任何一条的达标证据**。

---

## ⑦ 待修清单（共 18 条）

1. **【数字错·影响面最大】"1.53×" 是 MiB ÷ MB 混算，同口径应为 1.60×。**
   复算：Σ = 1,290,508,960 B = **1,230.7253 MiB**；门 = 805,306,368 B = 768 MiB。
   同口径比值 = 1,230.7253 / 768 = **1.60251 → 1.60×**。
   文档现写的 1.53 = 1,230.73 / **805.306**（把字节数当十进制 MB 用）。误差 4.7%。
   出现处（≥6 处）：`VERIFY_fullgo_0910_append.md:516`、`docs/cheng-plan.md（原 memory 计划 :154）`、`:317`、`:384`、`docs/cheng-plan.md（原 kernel 计划 :70）`、`design/incremental-forest-consumption.md:23`、`:152`、`:165`、`design/pa_s1b_edit_plan.md:16`、`:18`。
   **结论不受影响**（1.60× 与 1.53× 都 >1，Σ 单项穿门这个否定性事实成立），但数字必须改。

2. **【推导不可复算】768 MiB 的 "+3% 余量" 算不出 768。** 见 §2.3。二选一修：① 写明基值是 745.63 MiB（并给出该值来源）；② 改写为"在 C 链实测带 717–748 MiB 内取的整锚（=0.75 GiB）"，并撤掉 "+3%" 表述。涉及 `docs/selfhost-resource-plan.md:24`、`tools/user_path_gate.sh:42`（HEAD 版）。

3. **【单位不一致】逐相锚表单位错标。** `VERIFY_tamem_model_append.md` 用 MB，`tools/memory_model_limits.sh:12-18` 原样标成 MiB，差 4.86%。需要在某一侧统一并重算全部 6 个锚。

4. **【区间不自洽·profiles】** `WS_2` 写 372-392，按输入极值应为 **371.6–411.6**（392 用了"高 WS_1 + 低 exprCall"的混搭）。涉及 `VERIFY_tamem_model_append.md:70`、`tools/memory_model_limits.sh:15`。

5. **【区间不自洽·forest T】** `T` 写 445-530，按输入极值应为 **430.2–590.2**，写出带更窄且组合规则未写明。涉及 `VERIFY_tamem_model_append.md:92`。

6. **【标签与公式不符】** `bootstrap/cheng_cold.c:76016` 的 `compile_theory_model=measured_cpu_work_per_line_div_logical_cpu` 含 `per_line`，公式 `:75967-75970` 不含行数项。

7. **【定性错误】** `compile_theory_parallel_limit_ms` 被文档称为"理论下限/硬边界"（`docs/cheng-plan.md（原 memory 计划 :381）` "模型给出的边界"、`:382` "理论量是硬边界"），源码事实是**本轮实测 CPU / 核数**的后验折算（§3.3）。应改称"理想并行墙钟折算"或"并行效率基准"。

8. **【接线缺失】** 234 源真实自烤不输出任何理论字段（§3.6，三个 stdout 文件 0 命中）。理论块唯一入口在 dry-compile（`backend_driver_dispatch_min.cheng:6158 → :6246 → :2857 → :3021 → :2477`）。**在接线之前，"运行时收敛到理论"不可判定。** 这是本清单里优先级最高的一条。

9. **【门值回退·工作树】** `tools/user_path_gate.sh:45` 在 HEAD 是 `RSS_CAP_MIB=768`，**工作树被改成 `1024`**（未提交），且 `:40-44` 注释仍写 "768MiB 管理线"，`:45` 行内注释改成了 "1GiB 最后防线"——**同一文件内自相矛盾**。需裁决：768 是硬门还是台账锚。

10. **【文档引用悬空】** `docs/cheng-plan.md（原 memory 计划 :381）` 已把 `design/deterministic_model_derivation.md`（本文件）列为 768 MiB 的推导出处；本文件此前不存在。现已补齐，但 §⑦-2 表明该"推导"仍需改写。

11. **【来源未定位】逐相锚表的 "forest 窗 750-880" 下沿 750 在其引用源里不存在。** `VERIFY_tamem_model_append.md` 全文 grep `750` = **0 命中**；同文件 §七-1 给的是 "830-880MB"（去 B1 后）与 "740-790MB"（再去 B2 后）。三者互不相等。涉及 `tools/memory_model_limits.sh:16`。

12. **【锚不可验证 + 计数微偏】**
    (a) TypeArena 锚 100-120 在 768 MiB 门内**埋点不可达**（A/B 两轮 `type_arena_lines=0`），该锚在当前形态下**无法被证伪**。
    (b) `docs/cheng-plan.md（原 memory 计划 :385）` 写 "pass0 末已占门线 96.9%"，复算 `781,288,480 / 805,306,368 = 97.02%`（差 0.12 pp）。

13. **【判据阈值二选一未裁决】** 逐相贴线同时存在"差值 >50 MB"（`VERIFY_tamem_model_append.md:149`）与"差值 >20%"（`docs/selfhost-resource-plan.md:20,30`）两条口径，未写明各自适用面（§⑥-C2）。

14. **【同名两条理论下限互相冲突】** 同一份 dry-smoke 回执里 `compile_parallel_theory_lower_bound_ms=5479`（`:1701`，precheck 口径）与 `full_compile_theory_time_lower_bound_ms=6982`（`:1897`，系数模型口径），相差 **27.4%**，两者都自称"theory lower bound"。需在字段名或文档里区分二者语义（前者=实测折算，后者=系数模型）。

15. **【恒等式冒充测量】** dry-compile 的 `compile_parallel_real_over_theory_x` 在 `effectiveJobs=1` 时**恒为 1.000**（`backend_driver_dispatch_min.cheng:2900` 与 `:6242` 同式），`compile_parallel_theory_efficiency_percent` 恒为 100.000。这是自证，不是测量。任何引用该字段作为"已达 100% 效率"的证据都是误读。

16. **【门读数身份被普遍写错】** Darwin 侧门读数是**本进程当前 `phys_footprint`**，不是"进程树 RSS"、也不是 `ru_maxrss` 高水位（回源 + C 探针双证，见 §8.1）。`docs/cheng-plan.md` 抬门段与 S1b 第七手判词里的"进程树 RSS 5.7GB"按笔误处理。连带：§⑤-2 记的"guard 全树驻留峰比编译臂锚高 100+ MiB"**不是口径差**（两者本就不是同一个量），该条需要重新解释后才可以继续引用。

17. **【流式峰值模型 819,036,575 B 漏了两项】** 该模型 = `pass0 实测峰 + 0.914×column_bytes`，漏掉 ① **S1a 声明索引驻留 `+125,665,376 B`**（实测：流式 pass0 结束 `664,568,888` − 前端 `538,903,512`，该索引在消费循环全程持有），② **逐源 parse 瞬时**（同窗口实测最大 `+106,430,512 B` @ `src=134`）。⇒ 真实余量只剩 `69,710,380 B`（66.5 MiB），不是 13.1 MiB。完整包络见 §8.3。

18. **【parse arena 的 42× 放大系数未进任何模型】** 234 源闭包 Σ 源文本 = `30,674,756 B`，同轮 Σ 逐源 parse arena = `1,293,564,576 B` ⇒ **42.17×**；单源最坏 `src=61`（`4,498,706 B` 文本 / `140,260,128 B` arena / `parse_ms=16,228`）= 31.2×。源码内的闭式 RSS 模型（§2.7）**没有任何一项**建模这个逐源放大器，而它单项就是门宽的 17%。

---

## ⑧ 流式路径内存包络模型（2026-09-11 夜 · r7 同窗口实测回算）

### 8.1 门读数的精确身份（回源 + 探针实测，取代一切"进程树"措辞）

| 环节 | 回源 | 事实 |
|---|---|---|
| Cheng 侧入口 | `src/std/os.cheng:1798` `ProcessRssBytes()` → `:1712` `processResourceGuardCurrentRssBytes()` | Darwin 分支**不用** `getrusage` |
| Darwin 实现 | `src/std/os.cheng:1722` | `proc_pid_rusage(getpid(), 0 /*RUSAGE_INFO_V0*/, var OsRusageInfoV0)` → 取 `ri_phys_footprint`（`:1726`） |
| 结构镜像 | `src/std/os.cheng:70-85` | 平坦 int64 镜像，`sizeof=96`，`ri_phys_footprint` 在偏移 72 |
| 语义 | 探针实测（`.rebuild/s1b_step3/r8/phys_footprint_probe.c`，本机 arm64/macOS 26.5） | `sizeof=96` 一致；`resident` 与 `ps rss` 同步（`2,112,716,80` vs `206,352 KiB`）；`phys_footprint` 随 200 MiB 触碰同步上涨 ⇒ 字段/flavor 正确，不是垃圾值 |
| 是否含子进程 | `rusage_probe.c` | 子进程持 300 MB 时父进程 `ru_maxrss` **不动**，`wait` 后才进 `RUSAGE_CHILDREN`；`RUSAGE_SELF` 与 `proc_pid_rusage(getpid())` 两条路径**都不含子进程** |
| 本机内存 | `sysctl hw.memsize` | `51,539,607,552 B`（48 GiB）⇒ 数 GB 的**分配**不是内存不足导致的假象；但**读数里确实含压缩页**，判词必须分开写：r8/probe1 同轮 `phys_footprint = 5,653,271,256` 而采样器 `ps -o rss` 峰值 `1,568 MiB` ⇒ **驻留 1.57 GiB + 压缩 ~4.0 GB**。**⇒ 不得写成"进程驻留 5.65 GB"** |

**⇒ 门读数的定义 = 被守护进程自身、当下这一刻的物理足迹（非高水位、非进程树、非 session 并集）。**
`tools/beat_c_process_group_guard.sh`（外门）另有一套 `max(resident_peak, phys_footprint_peak)` 的进程组读数，两者**必须分开引用**：内门（驱动自检）是前者，外门报告是后者。

### 8.2 逐相分解（同窗口 A/B：`kd_base` 全林并林 vs `kd_b` 流式，r7 窗口）

| 相 | `kd_base`（全林） | `kd_b`（流式） | 说明 |
|---|---|---|---|
| `csg_stage=enter` | `91,882,120` | `147,128,992` | 启动基线（受机器态影响） |
| `after_binding_source_texts` | `227,279,568` | `230,277,816` | 源文本绑定 |
| `after_sort_sources` | `220,086,992` | `240,599,760` | |
| `after_profiles` | `331,989,808` | `326,468,424` | 前端主项 |
| `after_reachable_function_set` | `367,313,760` | `385,205,088` | |
| **`after_profile_source_payload_release`** | **`516,506,560`** | **`538,903,512`** | **前端驻留终值 F（两驱动共有）** |
| pass0 结束（含 S1a 声明索引） | —— | `664,568,888` | **索引驻留 I = `125,665,376`** |
| pass0 内峰值 | —— | `770,999,400` @ `src=134` | 逐源 parse 瞬时 `T = +106,430,512` |
| 森林相峰值 | `830,211,248`（死于 pass1 `src=24`） | —— | 全林并林的代价 |
| 列总量 | —— | `column_bytes = 71,027,100`（精确，4 B/行 × 17,756,775 行） | S1a 索引回算 |

口径声明：**本轮门内读数仅用于同窗口相对比较，不用于达标判定**（环境漂移见 §⑤-12 与 S1b 判词）。

**第二个窗口（r8/probe1，含 `r8s1..r8s5` 插桩）同点位对照**：pass0 末 `ta_limits rss=705,725,472`（r7 同点位 `664,585,272`，**同窗口内高 41,140,200 B**）、`column_bytes=71,032,364`（r7 `71,027,100`，差 5,264 B 系源集内 token 数微变）。⇒ §8.4-0 与 §8.6 的"修前贴门"结论用 **r8 自身同轮数**，§8.2/§8.3 的包络用 **r7 自身同轮数**；两窗口的数不得相加或相减。

### 8.3 包络公式（逐源上界，取代"pass0 峰 + 列"）

```
peak_stream(k) = F  +  I  +  C(k)  +  T(k)
  F   前端驻留（与本工作无关，两驱动共有）        实测 516,506,560 ~ 538,903,512，静默窗口保底 490 MiB = 513,802,240
  I   S1a 声明索引驻留（消费循环全程持有）        实测 125,665,376
  C(k) 列累积（② 消了"每列死区"，但**未消 arena 缓冲区翻倍**）  实测 r8：+95,535,200 一次性（见 §8.4-0），不是 71,032,364
  T(k) 第 k 源 parse 瞬时（arena + 解析中间态）    实测最大 106,430,512 @ src=134；src=170 为 93,814,832
```

**可判定算术**（同窗口实测代入）：

```
F + I + C(终) = 538,903,512 + 125,665,376 + 71,027,100 = 735,595,988 B
门 805,306,368 − 735,595,988 = 69,710,380 B（66.5 MiB）= 留给 T(k) 的全部余量
实测 T  : +106,430,512（src=134）⇒ 超 36,720,132 B
          + 93,814,832（src=170）⇒ 超 24,104,452 B
```

### 8.4 结论（四条，均可复算）

0. **【r8 新实测，最要紧】消费第一个源之前就已经贴到门上。** r8/probe1 同一轮连续读数：`ta_limits … column_bytes=71,032,364 rss=705,725,472` → `r8s2_alloc_from_limits rss=801,260,672`（Δ = `95,535,200` = **1.345 × column_bytes**）→ `r8s3_pending_new` 不变 ⇒ **距门只剩 `4,045,696 B`**，而循环第一个源就要 `U0(k)+64 KiB`（`compiler_csg.cheng:35705`）⇒ **不削这一项，⑤⑥ 全绿也必然撞门，不存在可达路径**。
   **〔2026-09-11 夜 fix2 实测：arena 容量假设已证实、量级落定〕** `r8s2_alloc_from_limits used=71,035,484 **capacity=115,507,584** type_count=15 column_bytes=71,033,660` ⇒ **容量/用量 = 1.626×，容量里躺着 `44,472,100 B`（42.4 MiB）余量**；`r8s1→r8s2` 实测 `94,666,824 B`（> column_bytes 71.0 MB、< capacity，证实"未触碰页不计入 footprint"）。⇒ arena 紧容量的**可达收益按 `94.7 − 71.0 ≈ 23.6 MB` 估**（非先前上限口径的 42~57 MB）；两条安全形态不变（裸钉 `columnBytes` 会因后续 intern 溢出使 `growCap` 跳到 2×=更差）。**修法未落树。**
〔2026-09-11 深夜 · **撤回下条的“上界可证”，并换成拷贝链口径**（以本条为准；下条原文保留作历史）〕** ① **上界不可证**：`typed_expr_type_arena.cheng:5576` 的 `typedExprTypeArenaSpecializeTypeInto` 在 **Seal 相**按 `pending` 行内插新的 `TypedExprStructuralTypeApply` 类型，且其 memo（`specializationMemo/specializationVisiting`，`:7387-7392`）**每次调用新建** ⇒ 特化路径不受 `typeCount ≤ typeSyntaxCount + 种子` 约束（本人已 read 核实）。因此“精确预留 = 19 列 × typeSyntaxCount ⇒ 省 32 MB”的推导**不成立**，预留必须把特化行归入残差预算。
  ② **收益口径改为“拷贝链”（已逐字节复算）**：容量 `115,507,584` 不是常量（全仓无容量常量，`typed_expr_type_arena.cheng:7542` 起点 `ArenaInitDefault(1048576)`），而是 doubling 产物：`1,048,576 → 14,438,448 → 28,876,896 → 57,753,792 → 115,507,584`（4 次 realloc 共拷 **102,117,712 B**；过冲来源 `arena.cheng:230-231`，代价在 `program_support_backend.cheng:6254-6258` 的 mmap 档 `cheng_realloc = malloc + memcpy(整块) + release`）。pin 成 1 次 `1,048,576 B` 后，同窗口该点位实测 Δ **94,666,824 B → ≈ 1 MB**，**期望省 ≈ 93.6 MB（上限 101.07 MB）**；**此数不与旧的“32 MB”相加**。
  ③ **容量不足 = 静默增长，不是 panic 也不是越界写**（本人已 read 核实）：`ArenaArrayInt32Add`（`arena.cheng:373-397`）无边界检查、无失败返回，唯一硬失败路径 `ArenaArrayInt32AddReserved`（`:336-351`，`panic("arena array: reserved capacity exhausted")`）在 `typed_expr_type_arena.cheng`/`parser.cheng` **零命中** ⇒ 若不配断言，“容量不足”会伪装成它本要修的症状（footprint 翻倍 + `rss_limit_exceeded`，零新判词）。⇒ 容量 pin 必须配 fail-closed 断言（`patches/typearena_pinned_capacity.patch` 带 `typedExprTypeArenaRequirePinnedCapacity`，判词 `pinned capacity overrun phase=… capacity=… pinned=…`）。
  ④ **逐源 `U0` 的可削性已经机器核实，不再依赖 §8.6-6 那条判决性测量**：`parser.cheng` 里 `ArenaAllocBytes/ArenaAllocZero/ArenaArrayU8Add` 调用点 **0 个**，`tree.arena` 只被 `ArenaArrayInt32Add` 写且恰好覆盖 **201 列**（逐列机器核对）⇒ 弃块 = `U0/2 − 16·C`，**与活数据长度分布无关** ⇒ `src=134` 处省 **≥ 70,296,704 B（67.0 MiB）**，循环入口下界 `845,867,256 → 775,570,552 B`（门内余量 28.4 MiB）。改法：`patches/tree_arena_column_census.patch`（pass0 记 201 列实测终长→ pass1 在 `parser.cheng:27126` 前逐列 `ArenaArrayInt32ReserveEmpty`）。**只削 pass1，不动 pass0 逐源瞬时**（pass0 解析前无列终长，是鸡蛋问题）—— 不得记成“pass0 也削了”。
   **〔2026-09-11 深夜：上界已可证 ⇒ 紧容量从"要不要冒险"变成"可证的省 32 MB"〕** 计划原说 `typeCount` 的**可证上界不存在**（§9.5.3 第 1 条），现证如下：① 全仓 `typedExprTypeArenaIntern(` 只有 **15 处**，**全在 `typed_expr_type_arena.cheng` 内**（无对外包装、无外部调用点，`grep` 验证）；② 逐处看驱动源——1 处在固定标量种子（`SeedSemanticScalarRows`，常数轮），1 处在 `Nominal` 行解析，1 处在另一行驱动解析，1 处在定点循环（重复调用），1 处在函数签名行驱动路径，其余约 10 处全在 `InternSyntaxRec` 的**每轮一行、至多一次**的循环体内；③ `typedExprTypeArenaIntern`（`:1025` 起）在桶链上按 `typedExprTypeArenaTypeEqual` **去重后提前返回** ⇒ 重复调用不产生新类型。⇒ **`typeCount ≤ typeSyntaxCount + 种子数`成立**（种子数固定且极小）。**据此可全部精确预留**：约 19 个"每类型一行的列"（`typeKinds/scalarKinds/symbolIds/genericSymbolIds/fixedLengths/functionParamCounts/baseTypeSyntaxNodeIndexes/baseTypeIds/childStarts/childCounts/traitRuleKinds/traitPremiseStarts/traitPremiseCounts/managedFlags/sendFlags/syncFlags/typeOriginKinds/originTypeSyntaxNodeIndexes/originProducerSourceIndexes`）预留到 `typeSyntaxCount + 种子`，载荷列（`childTypeIds`/`childNameIds` ≤ `limits.typeSyntaxChildCount`、`traitPremiseTypeIds` 同理）按既有 limits 字段预留，再把 arena 缓冲区钉到**精确总和** ⇒ 全程无 doubling、无溢出风险。量级：`19×157,859×4 ≈ 12.0 MB` + 载荷 ≈ **12.5 MB** ⇒ 容量 `≈ 83.5 MB`（现 115.5 MB）⇒ **可证省约 32 MB**。**待做**：落地时须逐列核对"每类型一行 vs 载荷列"的分类（上表按结构体字段名归并，落地前逐列复核）。
1. **⑤⑥ 落地后仍超门，缺口不是 13.1 MiB。** 用最保守的"在环三项下界"（§8.6 第 3~4 条，全部是逐源实测值相加）算：`src=134` 处 `845,867,256 B`，**超门 `40,560,888 B`（38.7 MiB）**；极端假设（最大 arena 的源第一个被消费、`C=0`）也只剩 `137,640 B`（134 KiB）余量。**"贴着门过"这个判断本身也不成立**——除非先把 `U0` 降下来。**该下界以第 0 条修好为前提**；不修则连这个余量都没有。
2. **决定项是 `T(k)`（逐源 parse 瞬时），不是 22 个 TypeId 侧列。** 后者即使全消也只有几 MiB 量级；前者单项 93.8~106.4 MB，是余量的 1.35~1.53 倍。
3. **第二决定项是 `F`（490~514 MiB 前端驻留），占门宽 61~64%，且与流式工作完全无关**——它同时压在基线与流式两条路径上，是唯一能把两条路径一起拉回门内的杠杆。

### 8.5 5.65 GB 开门缺陷（已定位到具体调用，根因未定）

同一轮 `kd_b`（**r7 窗口**）：`ta_limits`（`rss=664,585,272`）之后、消费循环首次守卫检查之前，进程自身 `phys_footprint` 变成 **`5,726,720,776`（Δ = `5,062,135,504`）**，rc=125。（**r8 窗口**同点位为 `5,653,271,256`；两窗口数不得互减，见 §8.2 口径声明。）
- 该区间只有四步：`TypedExprTypeResolutionAuthorityStreamingBegin()` / `TypedExprTypeArenaAllocateFromLimitsInto()`（应只花 71 MB 预分配）/ `TypedExprTypeArenaPendingGenericApplyNew()` / `TypedExprBuildSourceContextExactIndexWithManualAuthority()`。
- 已确认读数身份（§8.1）⇒ 不是别 lane 的进程；机器 48 GiB ⇒ **分配是真的**（同轮 `ps rss` 峰值 `1,568 MiB`、`phys_footprint` `5,653,271,256`，差额 ~4.0 GB 为**压缩页**）⇒ 缺陷成立、必须修，但措辞不得写成"进程驻留 5.65 GB"。
- **r8 已定位到四步中的第 4 步（逐字节证据）**：`r8s1_streaming_begin 705,725,472` → `r8s2_alloc_from_limits 801,260,672` → `r8s3_pending_new 801,260,672` → **`r8s4_context_index 5,653,271,256`（Δ = `4,852,010,584` 全在这一步内，`live` 块数 `3,099,187 → 3,949,121` = +849,934）** → `r8s5_pre_loop 5,653,271,256` → `compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=5653271256 limit_bytes=805306368`。即 `TypedExprBuildSourceContextExactIndexWithManualAuthority(work.typedMetadataContexts, streamingManualTree, false, outLookup, buildErr)`（`compiler_csg.cheng:35656`）。同轮 `ps -o rss=` 在该步内亦实测单边上涨（`784,384 KiB → 1,523,168 / 1,660,496 KiB`）。
- **归属（关键，不得记到 3f 头上）**：这一步在 HEAD 里同样存在，但 **HEAD 版要求 `manualTree != nil`**（`git show HEAD:src/core/lang/typed_expr.cheng:66533-66542`），且 HEAD 的调用点在 `compiler_csg.cheng:38866`、**位于并林之后**。⇒ 所有"并林未跑完就撞门"的世代（r7 base 死于 pass1 `src=24`、抬门 4 GiB 轮死于 `forest_appended=40`）**从未执行过这一步，仓库中不存在它在 234 源下的同窗口基线读数**。正确表述：**⑤⑥ 把它从"并林之后"提前到"消费循环之前"，首次使其可执行；5 GB 是既有缺陷，不是 3f 的回归。**
- **对达标路径的次序影响**：该步不修，则消费循环的逐源 `U0` 与被测对象都不可达（进程在消费第一个源之前已被推过门）⇒ §8.4-0 的 arena 紧容量、§8.6 的 `U0` 削减都排在它之后。
- **根因（代码级，HEAD 既有）**：`typed_expr.cheng:35344-35404` `TypedExprBuildIndexRegisterVisibilityDeclaration` 在**每注册一条**时做 **9 次全序列深拷贝**再整体回写（`TypedExprCloneI32Seq/CloneStrSeq` `:16422-16433` 是逐元素 `add` 的真拷贝）⇒ O(N) 时间 + O(N) 分配 churn **每条**，累计 **O(N²)**。三条硬证：① `git show HEAD:…:35319-35345` 逐字相同，`git log -S` 追到 `f681cad2b`（initial commit）⇒ **自始既有，非任何本轮补丁引入**；② 同族 `TypedExprBuildIndexRegister`（`:35699-35715`）在**同类型 `ref object` 字段上直接 `add(index.entryNext, …)`**，无克隆 ⇒ 克隆是多余的；③ 算术自洽：churn ≈ `46·N² B`，代入实测 Δ=`4,852,010,584` 反解 **N ≈ 10,270**，与 `2×declaredTypes+refTypes+aliases+3×enums+2×fields` 的求和量级吻合；同时长 ~60~90 s ↔ `4.5N² ≈ 4.7×10⁸` 次元素拷贝。macOS malloc 不即时归还 churn ⇒ 正好解释"footprint 涨 4.85 GB 而同轮 `ps rss` 只到 1.57 GiB"。
- **修法（合法形态已被同文件生产代码证明，不必试探语言限制）**：`add(index.entryKinds, storedText)`（`:29722`，`str[]` 字段就地 add）、`add(index.entryNext, entryBucketHead)`（`:35699`，`int32[]` 字段就地 add，且桶头先 `let` 成局部量以避开"一次调用绑两个重叠 place"）、`index.entryBucketHeads[bucket] = entryIndex`（`:35719`，字段元素直接写）⇒ 9 次克隆整体替换为"就地追加 + 单点写桶头"，注册语义/顺序/去重一字不变。**同型第二处**：`:35482-35512` visibility **查询缓存**路径也是"每条新查询全量克隆 7~8 条序列"。**已核其可达性**：`TypedExprBuildIndexVisibleLookup` 只在 `typed_expr.cheng` 内被调用（`:31887`/`:35747`/`:35787`），而 `typed_expr_type_arena.cheng` 对它**零引用**（逐源解析走 `state.authority` + `symbolByDeclarationRoot` + `langintern.LookupIntern`）⇒ **消费循环不碰它**；但 `frozenReadOnlyQueries` 只在 `:43632` 的 sealed+compact 投影里置 true（构造时 `:33531` 置 false），故**循环之后的下游相（facts/typed-IR）仍可能以同形态 O(M²) 再爆**，判定量是 `visibilityQueryKinds.len`（10³ 量级无事、10⁵ 必须修）。**未测得前不改它、也不得写成"已证明无害"。**
- **【2026-09-11 夜 · 修后实测判词】** 修法已落树（`typed_expr.cheng:35368-35400`，克隆点 15 → 6），`gate/fix2` 同轮读数：`r8s3 728,089,680 → r8s4 756,335,744`，**Δ = `28,246,064 B`，原 `4,852,010,584` ⇒ 塌 171.8×**（`live` +312,903 块）。**预测成立（≥两个数量级），但量级高于我给的 1~3 MB ⇒ 残值是索引自身的存活数据**（我按 92 B/条估的 0.9 MB 少算了每列一份 `ParserOwnedText`、桶数组与每字段一个 `AddContextFieldNode`）；判词按"根因成立、量级 28 MB"记，不得照抄 1~3 MB。**同轮内存状态**：`rc=2 wall=259s`、**`guard_line=` 空（一次 `rss_limit_exceeded` 都没有）**、`max_csg_rss=759,481,448`（724.4 MiB **< 门 805,306,368**）⇒ **修掉本条后，234 源跑到消费循环入口的峰值已在门内**；当前唯一直接卡点是语义错误（`rc=2`）`TypeArena resolution authority failed source_index=0: nominal declaration is not visible producer_source=0 name=LsmrMaxDepth`（产生处 `typed_expr_type_arena.cheng:4527` `typedExprTypeAuthorityIndexResolveUnqualifiedInto`）。
- **【新卡点的归属（**已自我更正**，写判词用更正后的）】** 初判"④ ⑤新代码缺陷"**不成立**：`git show HEAD` 计数只能证明*函数*是新的，逐行对完*语义*后，两个实现是**等价**的——① 声明根集合：全林版 `:3289-3294` 只收 `ParserTypeSyntaxRootTypeDeclarationRhs`，索引版谓词 `typedExprTypeArenaDeclarationCreatesSymbol`（`:1383-1397`）收 `TypeDeclarationRhs` ∪ 对象/ref-object 字段 ⇒ **索引是超集**；② 主循环跳过条件逐字相同（Qualified 走 qualified；否则 `if kind != Nominal || qualifiedSegment[row]: continue`），**两边都没有跳过 bracket 参数行**；③ 导入回退循环（`:3161-3190` vs `:4494-4526`）逐字相同，仅 finder 不同。⇒ **同一输入两条路径同样失败 ⇒ 本缺陷判为 HEAD 既有、从未被执行过（与 5.65 GB 同类）**。**机制候选**：`LsmrMaxDepth` 是 `src/chain/binary_types.cheng:10` 的**模块常量**，出现在 `:27 digits: int32[LsmrMaxDepth]` 的**数组长度**位；常量括号参数由 `typedExprTypeArenaBracketConstLength`（`:1777-1791`）以 `BracketArgTypeNodeAt(tree,row,0) >= 0` 与类型参数区分（`-1` 才是常量表达式），**若 parser 为该常量也产出 `ParserTypeSyntaxNominal` 行，两个 builder 都会把它当类型名解析并失败**。**修法必须同时改全林版与索引版**（否则两条路径语义分叉）。
  **【再收窄（2026-09-11 夜）】** 234 源那轮 `src=0` 的形状（`types=189 tokens=1005`）与 `src/chain/binary_types.cheng`（221 行 / 6,917 B / 空白切 526 词 / 145 含冒号行）**量级吻合（未证）**；若成立，失败的是一条**离声明只隔 17 行的同文件常量引用** ⇒ **直接排除三个"导入侧"嫌疑**（`sortedImportRows` 排序、导入权威为空、名字文本未写入）——同文件常量不可能靠 imports 找到。
- **【根因（2026-09-11 夜 · 纯静态推出，**随后被反证撤回，见下一条**）】** 逐环有行号：① `binary_types.cheng:27` `digits: int32[LsmrMaxDepth]`，`LsmrMaxDepth` 是 `:10` 的**具名编译期常量**；② parser 处理 `T[...]`（`parser.cheng:18675-18721`）**只在该参数是单个整数字面量**、`parserTypeSyntaxFixedLengthInto` 成功时走 `FixedArray` 分支，否则逐参数走 `parserTypeSyntaxTryArgumentInto` 产出**类型参数**；③ `parserTypeSyntaxFixedLengthInto`（`parser.cheng:17909-17929`）**首句即 `TokenKindAt != ParserValueTokenInteger → return false`**，**具名常量一律不认** ⇒ 落进"泛型应用"分支，产出一条名为该常量的 `ParserTypeSyntaxNominal`（**把值标识符当成类型名**）；④ authority 解析它必然失败——`const` 行在 module 循环走**绑定块**分支（`parser.cheng:26321-26341` ⇒ `bindingBlockColumn` ⇒ `ParserValueExprProcessBindingEntryRange`），**从不经过** `ParserValueExprProcessTypeDeclarationRangeInto`（全仓仅 `:23353`/`:23371` 两处赋 `TypeDeclarationRhs`，都在类型声明路径），故 `const` 永远不在索引登记面（谓词 = 纯 `RootKind == TypeDeclarationRhs`）。**归属**：`parserTypeSyntaxFixedLengthInto` 与 HEAD **逐字相同**且工作树 `git diff -- parser.cheng` 为空 ⇒ **HEAD 既有、从未被执行过**。
- **【撤回 + 反证（2026-09-11 夜，同日）】** 上一条"具名常量数组长度不被支持 ⇒ 两条路径同败"**被证伪，已撤回**（撤回理由见下一条的更正版）。
- **【对上面这条撤回的再更正（同日，`strings` 实证）】** 我用来撤回的**第一条反证前提是错的**：`kd_preA` **不是 HEAD 全林驱动，而是流式驱动**。证据（对 `kd_preA`/`kd_fixed` 两个二进制做 `strings` 计数）：全林专有串 `TypeArena parser forest source coverage invalid` 两者都是 **0**；流式专有串 `streaming source tree authority invalid`、`TypeArena declaration index coverage invalid` 两者都是 **1**；`reason=reused_forest` 两者都是 0 ⇒ **A/B 是"流式·旧 vs 流式·新"**。
- **【第三次更正（同日，决定性）：烘焙 ≠ 程管线，前两次更正的前提全塌】** 关键事实：**`bake_*` 是 C 链（`BAKE_BIN=$HOME/.cheng-complete-0910/cheng_cold_v3 system-link-exec`）在做**（报告 `scope=cold_runtime_provider_system_link` / `real_backend_codegen=1` / `full_backend_codegen=0`）⇒ 闭包里的 **Cheng 流式代码在烘焙时只是被编译的数据、从不被执行**，所以"烘焙 234 源成功"**不构成"程管线能编过该闭包"的任何证据**。⇒ 我上一轮"preA 同为流式且烘焙成功 ⇒ 流式路径能编过含 `int32[具名常量]` 的闭包"**作废**；据此得出的"流式路径内部回归"也**降级为未验假设**。**⇒ 原始根因（具名常量数组长度不被支持）回到"未证实"而非"已证伪"。**
  **现行事实面（只有三条）**：① 程管线（`kd_*` 驱动，夹具跑出 `ta_stream`/`decl_index`/`typed_context_lookup_built` 即其执行证据）在 234 源闭包上卡在 **source 0 = `src/chain/binary_types.cheng`**（`forest src=0 bytes=6917` 与该文件字节数逐字相同）的 `nominal declaration is not visible … LsmrMaxDepth`；② 该根因**未证实也未证伪**；③ `kd_preA`/`kd_fixed` 经 `strings` 核查**都不含任何 r8 插桩串**（`r8s2_alloc_from_limits`/`r8diag`/`r8_verify_pre`/`r8auth` 全 0）⇒ 二者都是干净构建，而 `fix2` 是带插桩的构建 ⇒ "带插桩才失败"**仍只是假设**。
  **唯一能推进的动作**：**用干净驱动在默认门内跑一次 234 源闭包**——仍撞 ⇒ 卡点为真且与插桩无关（回到"该 nominal 为何在索引里找不到"，此时线性扫描探针才有意义）；不撞/编过 ⇒ 先前失败属**插桩态特有**，须记"插桩导致的假失败"，不得记成补丁不等价。**在此之前，任何"具名常量长度/插桩副作用/i-j-k 回归"的结论都不得落判词。**
- **【根因第四版（同日，决定性更正后重证；四条全部只依赖 Cheng 侧源码）】** ① `parser.cheng:17909-17929` `parserTypeSyntaxFixedLengthInto` 首句 `TokenKindAt != ParserValueTokenInteger → return false` ⇒ `int32[LsmrMaxDepth]` 拿不到 `FixedArray` 分支（分支条件 `:18695-18703`）；② 于是走括号应用分支 `:18704-18716`，`parserTypeSyntaxTryArgumentInto` 为该参数产出 `argTypeNode` 并写入 `typeSyntaxBracketArgTypeNodeIndexes` ⇒ 该名字成为一条 **`ParserTypeSyntaxNominal`**（**运行判词本身即此步证据**）；③ 索引登记面 = 纯 `RootKind == TypeDeclarationRhs`（`typed_expr_type_arena.cheng:3666-3678`），而**全仓仅两处**赋该 kind（`parser.cheng:23353`/`:23371`），**都在** `ParserValueExprProcessTypeDeclarationRangeInto` 内；④ `const` 行在 module 循环走**绑定块**分支（`parser.cheng:26321-26331` ⇒ `ParserValueExprProcessBindingEntryRange`），其中**只创建 `ParserTypeSyntaxRootBindingAnnotation` 根**（`:23800`）⇒ **const 名在任何源序、任何补丁组合下都不可能进入登记面 ⇒ 该 nominal 不可能解析成功**。
  ⇒ **同时排除备选**（名字文本写错 / `sortedEntryRows` 排序错）：二者前提都是"条目存在"，而第 ④ 条证明它**根本不存在**；`declaration_symbols=1314` 的量级（只含类型声明）与之一致。**归属：HEAD 既有的 parser 能力缺口，首次可达**（第八手补充：`kd_b`/`probe1` 门内 `forest_appended=0`，程管线从未跑进 `IndexResolveUnqualifiedInto` ⇒ 与"i/j/k 回归"无关，也不是"既有无害"）。
  **对方可证伪预测（第八手的 `r8_btypes_const_bracket` A/B）**：两侧**都失败且判词逐字同** ⇒ 非 i/j/k 引入、缺口既有（本条成立）；两侧都过 ⇒ 第 ② 条与运行时不符，需按该夹具的 `r8_verify_index` 数据重推；一侧过一侧败 ⇒ 才轮到 i/j/k 二分。
  **【A/B 实测结果（2026-09-11 深夜，判词逐字命中）】** `ab_repro_btypes.txt`：`repro preA rc=2 lease_hits=0 exe=none appended=0` 与 `repro fixed rc=2 lease_hits=0 exe=none appended=0`，**两侧末行逐字相同**：`compiler csg: TypeArena resolution authority failed source_index=0: typed expr type arena: nominal declaration is not visible producer_source=0 name=LsmrMaxDepth`（夹具 `fixtures/r8_btypes_const_bracket_main.cheng`，串行、同 `--in`/同 `--out` 父目录、`lease_gate_waits=0`；两驱动均为**干净构建**，不含任何 r8 插桩串）⇒ **① 不是 i/j/k 回归；② 不是插桩副作用；③ 是"两版都过不去、修完 5.65 GB 后首次可达"的既有缺口。**
  **【本条静态链的确切地位（第八手口径，采纳）】** 该实验**只分裂了"是不是回归"，既未证实也未证伪**上面第 ①~④ 条的静态链（两侧都没有这个能力）。⇒ 落判词时写 **"既有能力缺口；机制 = 本静态链（候选）"**，**不得写成"已证实的根因"**；要把静态链升为已证，需要**一侧具备该能力**的对照（即先实现移植，再判）。
  **【机制侧的证据已闭合（同日补证）；但"修法充分性"仍未验，两者要分开写】** 三条独立事实把机制锁死：**(i) 该行必是 `Nominal`**——判词产生于 `typedExprTypeAuthorityIndexResolveUnqualifiedInto`，而它**只被主循环里 `kind == ParserTypeSyntaxNominal` 那一支调用**（`:4700-4743`）⇒ 这是**调用路径的反推，不是推测**；**(ii) 该名字必是 `const`**——`binary_types.cheng:10` 在 `const` 块内（块形态：`:6` 单独一行 `const` ⇒ 走 `parser.cheng:26321-26331` 的绑定块分支）；**(iii) `const` 永不可能获得 `TypeDeclarationRhs` 根**——把 `ParserValueExprAppendTypeSyntaxRoot*` 的**全部 9 个调用点**逐个看完，kind 实参分别是 `RootGenericConstraint`(`:17834`)、`RootGenericDefault`(`:17863`)、`RootFunctionParameter`(`:22430`)、`RootFieldDeclaration`(`:23207`/`:23283`/`:25250`/`:25356`)、`RootTypeDeclarationRhs`(`:23371`，在 `ProcessTypeDeclarationRangeInto` 内)与 `:23353` 的同函数内赋值 ⇒ **全仓仅两处产生 `TypeDeclarationRhs`，都在类型声明路径**；再加上**该名字在类型语法树里唯一的出现场合是数组长度括号**（`:27`/`:70`；`:90` 是语句、不进类型语法树）⇒ **"nominal 存在 + 名字是 const + const 无 TypeDeclarationRhs 根 + 索引只登记 TypeDeclarationRhs" 四件事都经核查 ⇒ 该查找在任何补丁组合下都不可能成功**。**仍需运行验证的只剩"移植 C 链能力后它能过"这一条（修法充分性）**，与机制本身是两件事，不要混写。
  **【② 的静态闭环（同日补证；至此无需探针烤即可定机制）】** 第 ② 步"该括号参数被降级成泛型应用"可**纯静态**证完：括号分支（`:18704-18716`）对非字面量的单参数调 `parserTypeSyntaxTryArgumentInto`（`:17980-18004`），而它内部就是 `parserTypeSyntaxParseRange`——**后者对裸名字 token 会成功并产出 `ParserTypeSyntaxNominal`**（`parserTypeSyntaxParsePrimary` 的命名路径 `:18541-18556`：对每个 `parserTypeSyntaxTokenCanName` 的 token 直接 `AppendTypeSyntaxNode(tree, ParserTypeSyntaxNominal, …)`）⇒ `argTypeNode >= 0` ⇒ `BracketArgTypeNodeAt(tree,row,0) >= 0` ⇒ **是"类型参数"而不是常量表达式** ✓。**⇒ 机制链条 (i)~(v) 全部闭合：(i) 该行是 Nominal（判词调用路径反推）、(ii) 名字是 const、(iii) `const` 永无 `TypeDeclarationRhs` 根（9 个调用点穷举）、(iv) `parserTypeSyntaxFixedLengthInto` 只认整数字面量 ⇒ 走不进 `FixedArray`、(v) `TryArgumentInto` 对裸标识符成功 ⇒ 判成类型参数。⇒ 第八手列的第 ① 步"一次烤一次跑定性 `LsmrMaxDepth`"对**机制**而言**已无必要**（可省一次烤机）；剩下的未知只有修法充分性。**
  **【顺带发现：`T[N*K]` 这类内联算术同样是坏的，但坏法不同】** 因为 `TryArgumentInto` 对**名字**成功、对**算术**失败，`T[N*16]` 会走 `argTypeNode = -1` + 常量根那条路，而求值器（`:14335-14396`）**没有名字节点** ⇒ `BracketConstLength` 返回 false ⇒ 长度留 `-1`、**在更后面以另一种方式失败**。⇒ 移植时必须**同时覆盖 `T[名]` 与 `T[名*K]` 两种形态**（C 链两者都支持：`symbols_find_const` + `cold_eval_i32_const_expr`），否则会从"一种坏法"变成"另一种坏法"。
- **【参考实现（同日，C 链已支持 ⇒ 修法从"要设计"变为"照移"）】** `bootstrap/cheng_cold.c:30171-30183`（`cold_parse_any_fixed_array_type`）：`span_is_i32(count)` 取字面量；否则 `symbols_find_const(symbols, count)` **查模块常量**，非 int32 则 `die("cold fixed array length const must be int32")`；再否则 `cold_eval_i32_const_expr(symbols, count, &v)` 求**内联算术常量表达式**（注释点名 `Slot[N*16]`）；最后 `len <= 0 → return false`。⇒ **C 链三条语义齐全，Cheng 链（`parserTypeSyntaxFixedLengthInto`）只实现了字面量那一条** ⇒ 这是 **Cheng 侧移植缺口**（也与 `bake_*` 走 C 链前端、故能编过 234 源相自洽）。**修法据此收紧两点**：① 不能只接"单标识符"，须接**常量表达式**（对齐 `cold_eval_i32_const_expr` 的作用域），否则同一缺口换个形状再犯；② **非 int32 / 非正值必须硬失败**（镜像 `die` 与 `len<=0`），**不得静默退化成泛型应用**——静默退化正是本症状的来源。`parser.cheng:18695-18703` 应改为三级分支：字面量 → 常量表达式求值成功（走既有 `FixedArray` + `BracketConstLength`/`MaterializeBracketConstLengths` 通道）→ 都不是才落泛型应用；const 求值器（`:14335-14396`，现七种节点、无名字节点）需能查模块常量表（可复用既有 `TypedExprModuleConstLiteral*` 家族）。改分类时须同时填对 const 根（`SetBracketArgs` 要求 `(typeNode>=0)==(constRoot>=0)` 恰一成立）。
  **（附带更正）** `program_support_backend.cheng` **不在闭包内**（`kd_preA.map` 0 条；`scope=cold_runtime_provider_system_link` ⇒ 其运行时代码由 C 冷运行时提供）。**另一条仍在的证据**：闭包内 `compiler_toolchain_encoder_authority_import.cheng:21` 是 `const` 块中的 `…FieldCount: int32 = 34`、`:50/:51` 用 `int32[该常量]`，该文件在 `kd_preA.map` 有 **22 条**符号（即确在闭包内）；`kd_preA` 又是流式且烘焙成功 ⇒ **流式路径（旧树）确实能编过该写法**。
  **【被约束到的事实（现行）】** 同一段源文本、同一 parser、同一登记谓词（HEAD 与工作树逐字相同：`git show HEAD:…:2934-2939` 与工作树 `:3289-3294` 都是 `RootKind == TypeDeclarationRhs`）⇒ **全林过、流式败 ⇒ 差异只能在两个 builder 的构造/记账里**，不在 parser、也不在登记面。首要嫌疑：① **两套 producer 编号**（循环下标 `sourceIndex` vs 单源树内 parser 盖的行号 `ParserValueExprTypeSyntaxProducerSourceIndexAt`）；② **`qualifiedSegment`/`localParents` 的推导口径**（全林按全局行 `:3345-3392`、流式按源内行 `:4634-4679`）——若流式把本该 `continue` 的行判成非 qualified，症状与"同文一过一败"完全吻合。**判决性打印**：在两版调 unqualified 解析前各打 `local/global/kind/qual/tree_producer/loop_source/name` 一行对照（已交第八手）。**在拿到该对照前，不得据前述"根因"写任何 parser 改动。**
- **【对 A/B 策略的影响】** 在此修复前，**全林基线在本闭包上没有可比性**：它要么死在更早（第八手的 11 源最小夹具上 `kd_base`/`kd_preA` 均死于 `parser-owned global coverage mismatch source=…/binary_types.cheng parser=11 metadata=0` ⇒ **该最小夹具本身不可作 A/B 对照**），要么撞同一堵墙。⇒ ⑤⑥ 等价判定**不得预设"基线能过"**；必须先证明基线在该夹具上真的走通（`rc=0` 且对应埋点有命中），否则记"无有效对照"，**不得记 DIFFER**。
- **可否证预测（修后必须同时成立，否则本条作废）**：① `r8s4` 相对 `r8s3` 的 Δ 从 `4,852,010,584` **塌到 1~3 MB 量级**；② 该步耗时 **<1 s**；③ 同轮 `ps rss` 不再出现 801 MB → 1.5 GB+ 的抬升。**唯一自由参数 N 可直接打印 `index.visibilityKinds.len` 验证。**

### 8.6 决定性杠杆的定量定位：逐源 parse arena `U0`（唯一可判定的达标路径）

**前提（两条，缺一条本节都不可达）**：① §8.5 的 `r8s4` 5.65 GB 必须先修（否则进程在消费第一个源之前已被推过门）；② §8.4-0 的 arena 紧容量必须先修（否则 `C` 是 95.5 MB 而不是 71.0 MB，门内连 `U0` 的位置都没有）。本节所有"余量"数字都是这两条修好后的余量。

1. **在环瞬时与 pass0 瞬时不是同一个量。** 消费循环（pass1）已按 pass0 实测逐源预留：`compiler_csg.cheng:35705-35706` `let sourceArenaReserve: int32 = work.typeArenaForestSourceArenaBytes[sourceIndex] + 65536`，落到 `parser.cheng:26747-26748` 的 `ArenaReserveCapacity(tree.arena, reserve)` ⇒ 循环内每个源只做**一次定容分配**，没有 arena 缓冲翻倍 spike。而 pass0（`compiler_csg.cheng:33157` `sourceArenaReserve = 0`）**没有预留** ⇒ §8.2 里 `src=134` 的 `+106,430,512` 是**带 spike 的 pass0 读数**，不能直接当在环瞬时用。
2. **在环每个 k 的下界（三项同时在册，可相加）**：`RSS(k) ≥ F + I + C(k) + U0(k) + 64 KiB`，其中 `U0(k) = work.typeArenaForestSourceArenaBytes[k]`（= pass0 的 `arena=` 读数，逐源实测）。
3. **代入 r7 同窗口实测**：`F + I = 664,568,888`，`U0_max = 140,599,840`（`src=134`）⇒ **即使 `C(k)=0`（假设最大源第一个被消费）也只差 `137,640 B`（134 KiB）撞门**：`805,168,728` vs 门 `805,306,368`。静默窗口 `F = 513,802,240` 同法算剩 `25,238,912 B`（24.1 MiB）。
4. **最大 arena 的源不在首位 ⇒ 必然超门。** 按累计列占比 ≈ 0.573（`src=134`）代入，下界 = `845,867,256 B` ⇒ **超门 `40,560,888 B`（38.7 MiB）**。
5. **⇒ 唯一决定性杠杆 = 把 `U0` 降下来。** `U0` 目前 ≈ 2× 活数据：`ArenaArrayInt32Add`（`src/core/runtime/arena.cheng:373-392`）每次 grow 都在 bump 顶 `ArenaAllocBytesAligned` 新开一块、旧块成死区 ⇒ `used` 是几何级数求和。这与 ② 对 TypeArena 列做的修正是**同一个根因**。若逐源 tree arena 也做到"每列按精确终值 `ArenaArrayInt32ReserveEmpty`（`:316`）预留"，`U0_max` 近似减半 ⇒ 同法下界 `775,567,336 B`，**留 `29,739,032 B`（28.4 MiB）余量**。
6. **判决性测量（下一编译窗口第一件事）**：单源 parse 结束时同时打印 `ArenaUsed(tree.arena)` 与 tree 各列 `len` 之和；二者之比决定第 5 条的收益是 2× 还是更小。**未测前不得声称该杠杆的收益**——它现在只是"有代码路径 + doubling 语义支持"的假设，不是实测。

### 8.7 ① 号卡点的修法设计（照 C 链移植"具名常量作 `T[N]` 长度"）

**目标语义（对齐 C 链 `bootstrap/cheng_cold.c:30171-30183`）**：`T[EXPR]` 的长度按三级判定——① 整数字面量；② `EXPR` 能在**模块常量表**上求值成**正 int32** ⇒ 固定长度数组；③ 否则才是泛型应用。**非 int32 / 非正值必须硬失败**（镜像 `die("cold fixed array length const must be int32")` 与 `len <= 0 return false`），**不得静默降级**为泛型应用——静默降级正是本卡点的来源。

**关键设计判断：求值必须放在"树已完整"之后，不能放在 parse 的括号分支里。** 理由：Cheng 的 parser 是单遍，`T[N]` 出现在 `const N` 之前时单遍表里还没有 N（前向引用）；而既有 `typedExprTypeArenaBracketConstLength`（`:1777-1791`）/`MaterializeBracketConstLengths` 的设计注释已经写明"在源树仍驻留时求值一次"⇒ **天然就是"树完整后"的时机**，复用它即可，不必新造时机。

**四处改动（全部在 parser/type_arena 侧，不碰 authority ⇒ 全林/流式不分叉）**：
1. **括号分类**（`parser.cheng:18695-18703`）：单参数分支除"整数字面量"外，再接受"**可作常量表达式的 token 区间**"（标识符、`N*16` 这类内联算术），产出 `ParserTypeSyntaxFixedArray` 并令节点 `fixedLength = -1`（= 延迟判定，与该字段既有的 `-1` 表"缺失"约定一致），同时**填好该参数的 const 根**——注意 `SetBracketArgs` 要求 `(typeNode >= 0) == (constRoot >= 0)` **恰一成立**（`:11113` 起会 panic）。
2. **const 求值器加"名字"节点**（`:14335-14396` 现仅 `Integer/Unary±/Add/Sub/Mul/Div/Mod` 七种）：新增 name kind，并在求值时查**同源树**的模块常量。
3. **名字→值解析器**（新增，输入=树+名字 token）：在 `tree.declarationKinds` 上扫**绑定声明**，按名字 token 文本匹配，再对其**初始化器 token 区间**求值（字面量或常量表达式，递归，带环检测）；非 int32 / 非正值 ⇒ 硬失败。注意 `const` 条目的名字/类型/初始化器都在同一棵树里（`declarationSourceLocalRows` 等列 + token 文本），**不需要外部常量表**——这一点与 C 链的 `cold_const_i32_value` 等价。
4. **materialize**（`typedExprTypeArenaMaterializeBracketConstLengths`）：对 `fixedLength == -1` 的 `FixedArray` 节点，用 2/3 的求值结果回填长度；求值失败或被引用名字不存在 ⇒ 硬失败（不回落泛型应用——因为 parse 阶段已经判过"这不是泛型应用"）。

**验收（必须三条同时给）**：① `src/chain/binary_types.cheng` 单文件在程管线下 `rc=0`；② 新夹具 `T[具名常量]`、`T[内联算术]`、`T[非 int32 常量]`（应硬失败，判词含 "must be int32" 语义）三条全绿；③ 234 源闭包门内 `forest_appended=234`。
**〔同日侦察结论：必须用"parse 前预扫描"建表，增量建表不够〕** 只认**类型位置**的扫描（`.rebuild/s1b_step3/r9/scan_typepos_fixed_len.py`）：全仓 `files_with_uses=734 total_uses=7,680`，其中名字在**同一文件里声明为 `const` 的仅 50 处**（声明为 `type` 的 939 处属合法泛型应用，不在本任务内）⇒ 真正要新支持的形态量很小。**〔同日二次侦察（更准）：形态只有"裸标识符"一种，且闭包内至少两处需要〕** 按"类型位置 `name: Elem[EXPR]`"全仓分类（排除索引表达式）：**整数字面量 677 处**（已支持）、**简单标识符 7,680 处**（其中名字在同文件声明为 `const` 的 **352 处**＝要新支持的；其余为**类型名**，属合法泛型应用，**不得被新逻辑吞掉**）、**限定名 1,513 处**（`a.b.C`，类型参数）＋ 2 处怪异形。**⇒ 表达式形态分布 = `{裸标识符: 352}`；`T[名*K]` 等内联算术全仓 0 处**（"它也是坏的"仍成立，但**无真实用例**）。落地分层：**第 1 层（必须）** = `T[裸常量名]`（预扫描建表 + 括号分支在 `TryArgumentInto` 之前判定）；**第 2 层（可选，C 链对齐）** = 内联算术，若不做须在报告写明"与 C 链差集 = 内联算术形态、仓库零用例"，**不得写成"已对齐 C 链"**。
- **〔2026-09-11 深夜 · 移植实现复核（在飞，第九手 `parser.cheng` 351+/9−）〕** 本席逐 hunk 复核了括号分支的**成败点**，实现正确：判定放在 `TryArgumentInto` **之前**且只在"单参数 + 单 token + 可命名"时才查表（`bracketArgStarts.len == 1 && bracketArgCounts[0] == 1 && TokenCanName(...)`）；**查表未命中 ⇒ 原样回落到 `TryArgumentInto` 泛型应用路径**（`if !constLengthArg:` 包住原调用）⇒ **7,328 处类型名括号参数不受影响**；查表命中但**非 int32** ⇒ 硬失败（判词 `fixed array length const must be int32`）、**非正值** ⇒ 硬失败（`must be positive`，对齐 C 链 `len <= 0` 语义）；命中时**跳过类型参数解析**、`argTypeNode` 留 `-1`，交给既有常量长度通道（与 `SetBracketArgs` 的"typeNode/constRoot 恰一成立"一致）。其余已复核点：常量表**对刚 lex 完的 token 做一次预扫描**（前向后向同解）✓；`ModuleConstRegister` 对同名不同值 **panic**（不做 last-writer-wins，与 `TypedExprModuleConstLocalIsFresh` 同纪律）✓；常量初始化器求值**跑在 scratch AST 上并截断**，不给树留无主节点 ✓；枚举新成员 `ParserTypeConstExprName` 的值**寄存在既有 `typeConstExprIntegerValues` 列**，后续只消费值 ✓。**判定：设计与我给的 C 链对齐口径一致；运行期（烤 + 门测）尚未验。**
- **〔2026-09-11 深夜 · 移植首轮夹具实测（第九手 `fixtures_r9b.txt`）〕** 六件结果与判读：**负例成功**——`r8_fixed_len_non_int32_main` ⇒ `rc=2`、判词 `parser type syntax: fixed array length const must be int32 name=SlotName statement_offset=752` ✓（新分类逻辑确实生效且硬失败到位）。**四个正例全部挂在同一条与移植无关的检查上**：`compiler csg: parser-owned global coverage mismatch … parser=1 metadata=0`（`compiler_csg.cheng:33796-33797` 的 `candidate.len != ctx.bindings.len`）——**该错误在未打移植的驱动上就出现过**（上一手 `repro_btypes` 对 `binary_types.cheng` 报 `parser=11 metadata=0`）⇒ 属既有/夹具形态面，**不得记成"移植失败"，也不得记成"移植通过"**（未触达移植面）。**唯一触达真实面的是 `binary_types_via_import` ⇒ `rc=1`、末行 `arena array: read out of bounds`（panic 类）** ⇒ 这是当前实测卡点，且以 panic 形式掩盖根因（`patches/s1b_step3i` 修的只是 preflight 那一处，同类越界在别处还有）。最小二分法已交：把正例夹具逐层剥（纯 `fn main` → 加 `type` → 加 `const` → 加数组字段），确定"形态触发点"。
- **〔2026-09-11 深夜 · ~~字节级定位：本轮移植有全局身份副作用~~ **已撤回**：是 harness 的 `--out` 不一致〕** 第九手 A/B 在 `ordinary_zero_exit_fixture` 上 `verdict=DIFFER`，本席先判为"移植有全局身份副作用"，**经复核脚本后撤回**：`ab_r9.sh` 第 4 行注释写 "same --in / same --out"，**第 40 行实际是 `out="$OUT/ab_${name}.$side.exe"`（两侧 `--out` 不同）**；而本战役已知"产物把自身输出文件名嵌进 `proofDigest` ⇒ 两侧 `--out` 不同即差 96 字节"，与逐字节实测（size 同 `7,451,752`、**仅 96 B 不同、落在两段连续区间** `[7,393,800,7,393,863]` 与 `[7,451,720,7,451,751]`）**逐字吻合**。⇒ **该 DIFFER 记作 harness 作废，不构成"移植有身份副作用"**；移植现有设计（新枚举成员把值寄存既有 `value` 列、预扫描建表、括号分支先查表后回落）**保留**。
  **要改的是 harness**：两侧必须同一 `--out` 串行两跑（照 `ab_r8.sh`：`rm -f` → 编译 A → 存 sha/副本 → `rm -f` → 编译 B → 存 sha）；**凡两侧 `--out` 不同的 A/B 一律作废**，并须改掉脚本里与实现不符的注释。
  重跑后 `ordinary_zero_exit_fixture` 应回到 `CMP=IDENTICAL`；**若同 `--out` 下仍 DIFFER**，才轮到查身份面。
  **〔机制独立验证（同日，纯读产物）〕** 对上述两个产物再核三件事：① **两侧均不含任何字面路径**（`.A.exe`/`.B.exe`/`ab_ordinary`/`s1b_step3/r9` 的字节出现次数全为 0）⇒ 输出路径**不是被逐字写进去的**；② 两段差异区**熵很高**（64 B 段有 59 个不同字节值、32 B 段有 28 个）⇒ 是**摘要**而非结构化字段；③ 紧邻其前后的字节两侧**逐字节相同** ⇒ 差异是**若干内嵌摘要中的一段**。⇒ "产物把自身输出路径**哈希进摘要**、路径不同即产物不同"这条**由实测证实**（不是凭记忆）：**两侧 `--out` 不同的 A/B 必然 DIFFER，且特征签名 = "96 字节、两段连续区间"** ⇒ 可据此机械识别并作废此类 A/B。
- **〔2026-09-11 深夜 · 该 DIFFER 的历史判词（**已被上条作废，保留以备追溯**）〕** 第九手 A/B 在 `ordinary_zero_exit_fixture` 上 `A_rc=0 B_rc=0 verdict=DIFFER`（`A_sha=7120a588…` / `B_sha=b60b4371…`）。本席逐字节比对该夹具的两个产物：**size 完全相同 `7,451,752`，仅 96 字节不同，且只落在两段连续区间**——`[7,393,800, 7,393,863]`（64 B）与 `[7,451,720, 7,451,751]`（32 B，文件尾）⇒ **除这两段摘要外逐字节相同**，即"内嵌身份/摘要变了，不是代码生成变了"。该夹具是 `fn main(): int32 = return 0`，**不使用定长数组** ⇒ **改动有全局副作用**。对照：上一手 `preA` vs `fixed`（只动 `typed_expr.cheng`/`type_arena`）在同一夹具上是 **CMP=IDENTICAL**（`0dd3b8e5…`）⇒ "改编译器不必改产物身份"，本次是真改了。**两个最可能来源**：① 新增 const-expr 枚举成员 `ParserTypeConstExprName`（若 schema/CID/规范哈希覆盖 const-expr 的 kind 集合或序数，加成员即全局位移）；② 给 `ParserValueExprTree` 新增 3 列 `typeConstModule*`（列集合若进身份哈希同样位移；"不随 `AppendFrom` 传递"只说明传递面，不排除身份面）。**最小修法（语义不变、恢复字节中性）**：`ParseConstPrimary` 从表里已得 `constValue` ⇒ **直接产既有 `ParserTypeConstExprInteger`** 并写值（求值器无需新分支，语义等价）；常量表放 **parse 期模块级状态**（每次 parse 起点重置）而非新列。改完**重跑同一套 A/B，`ordinary_zero_exit_fixture` 必须回到 `CMP=IDENTICAL`**；未恢复字节中性前**不得落库**。口径：该 DIFFER 既非"移植失败"也不可忽略，记为 **"改动含全局身份副作用 ⇒ 需按最小修法复原"**。**〔同名歧义：不存在〕** 全仓 5,640 个 `.cheng` 逐文件收集顶层 `const` 块名与 `type` 块名，**交集非空的文件数 = 0** ⇒ 括号分支可做干净两分（"单参数+单 token+标识符+命中常量表 ⇒ 定长；否则 ⇒ 泛型应用"），**无需歧义消解**；唯一约束是**表内只放 `const`、不得混入 `type` 名**（7,680 处简单标识符里 7,328 处是类型名，混入即静默吞掉合法泛型应用）。**表还须支持无类型标注的条目**（`maxPipes = 128`、`connectionQueueCapacity = 64`）。**与验收直接相关**：`src/core/tooling/compiler_toolchain_encoder_authority_import.cheng:50/51` 用的正是 `int32[CompilerToolchainEncoderOfficialReceiptV2FieldCount]`（`:21` 的 const），而该文件**在 234 源闭包内**（`kd_preA.map` 22 条符号）⇒ **验收要求闭包内至少两处（该文件 + `binary_types.cheng`）都能过**。**但存在被规范允许的前向引用**：`src/std/net/stream/connection.cheng:36` 用 `Connection[connectionQueueCapacity]`、该常量在 `:44` 的 const 块里（在 use 之后）；`src/quic/connection.cheng:52` 同理（声明在 `:60`）。两文件**不在编译器 234 源闭包内**（`kd_preA.map` 零命中）⇒ 对本次验收非必需，但按 `docs/cheng-formal-spec.md:555`（N 是**编译期常量**）它们是**合法形**，按仓规必须支持。⇒ **建表时机必须是"parse 前对整个源文本预扫描"**（C 链正是如此：`symbols` 表在解析前就绪，`symbols_find_const` 对前向引用天然有效）；增量建表 + materialize 兜底**无法区分"前向引用"与"类型参数"**（运行期不可判）。预扫描要点：顶层 `const` 块条目、**允许无类型标注**（如 `maxPipes = 128`、`connectionQueueCapacity = 64`）、支持字面量与简单算术；形状可参照 `typed_expr.cheng` 既有的 `TypedExprModuleConstLiteralFromLines/ForContext`（**但方向相反，parser 不得 import typed_expr**）。
**〔2026-09-11 深夜 · 夹具已落盘 + 移植已派单〕** 三件验收夹具已写入 `docs/campaigns/2026-08-31-kernel-userpath/fixtures/`：`r8_fixed_len_named_const_main.cheng`（const 名作长度）、`r8_fixed_len_inline_arith_main.cheng`（`SlotStep * 2`，走的是另一条坏路）、`r8_fixed_len_non_int32_main.cheng`（`str` 常量作长度 ⇒ **必须编译失败**，静默通过即假绿）。三件**刻意不用 `.len`**，以免与"定长数组 `.len` 是否可用"这个无关问题混淆信号——用"写 index 0 与 index `N-1`"来证明长度确为常量值。移植已派给新一手（施工单含：五环机制、C 链三语义、parse 期常量表路线、第八手四条实现要点、三条验收、"烘焙≠程管线"口径、patch 通道与槽位/防脱管纪律）。
- **〔2026-09-11 深夜 · 新发现的**头号阻塞**（比移植更上游）：`const` 块条目被 parser 侧计数、被 metadata 侧漏掉 ⇒ 覆盖闸拒绝任何含 `const` 块的源〕** 第九手夹具实测与我方复现共同指向 `compiler csg: parser-owned global coverage mismatch … parser=N metadata=0`，本席把它在代码级钉死：
  **① parser 侧计数**：`compilerCsgParserGlobalDeclaration`（`compiler_csg.cheng:33457-33471`）判据是 `declarationKinds==ParserDeclarationLocal` + `declarationFunctionRows==-1` + 模块级词法作用域，**`const` 块条目正落在此集合里** ⇒ `TypedExprParserOwnedGlobalBindingFromSpans`（`typed_expr.cheng:17671`）为它们产出全局绑定；**无类型标注**的条目由 `compilerCsgParserGlobalInitializerSpan`（`compiler_csg.cheng:33476-33506`）配到初始化式根、再用字面量推出类型 ⇒ 同样计数（证据：`r9_fixed_len_untyped_const_main` 的 `UntypedCount = 6` 实测 `parser=1`）。
  **② metadata 侧不产**：三个绑定生产点（`TypedExprBuildSourceContextBorrowed` / `typedExprBuildSealedGlobalBindings` / `typedExprBuildFactsContextFromSelectedMetadata`）的块判定**只认 `var`**（`inGlobalVarBlock`），`const` 块条目因“缩进 + 无前缀”既不进 `inGlobalVarBlock` 也不匹配 `bindingCandidate` ⇒ 一条不产。对照：**单行** `const X: int32 = 1`（列 0）**本来就产绑定**（`TypedExprParseBindingLine` 认 `const ` 前缀，全仓 796 处）⇒ 缺的是**块形态**，不是“const 不该是绑定”。
  **③ 计数证据（实测，非推理）**：`src/chain/binary_types.cheng` 的 const 块第 7-17 行**恰好 11 条**，实测 `parser=11 metadata=0`（同文件 type 声明 15、fn 13，都不是 11）；`fn main(): int32 = return 0`（无 const）实测 `rc=0` 通过。
  **④ 影响面**：全仓 **818 文件含 const 块、共 9041 条目**（其中 4813 条无类型标注）。`docs/campaigns/2026-09-06-csg-asset-pipeline/findings.md:33` 早在 09-06 就把它记成“全仓头号阻塞，归属编译器线”，此后一直未修 ⇒ **本战役 `forest_appended=0` 的直接成因**（逐源追加时，任何含 const 块的源都被这条闸拒掉）。
  **⑤ 一致性论据（为什么这不是“新引入一类交互”，而是把两种写法对齐）**：单行 `const X: int32 = 1`（列 0）**同时**产两份东西——模块常量表条目（`TypedExprModuleConstEntryForLine`，`typed_expr.cheng:21389-21405`：列 0 的 `const ` 前缀与块内缩进行**走同一条接受路径**）**与**全局绑定（`TypedExprParseBindingLine` 认 `const ` 前缀，`typed_expr.cheng:27729`）；全仓 796 处单行 const 在生产里已这么跑（编译器自举）。⇒ 本修复只是让**块形态**产出与单行形态**完全相同**的两份产物：常量表条目（已有，块形态本来就被 `inConstBlock` 扫到）+ 全局绑定（本修复补上），不引入任何新的常量/绑定共存类型。
  **⑥ 一个待判别的口径（已造夹具，未验）**：全仓有 547 条“有类型标注 + 续行 RHS”与约 40 条“有标注 + `uint64(...)`/`uint32(...)`”的 const 条目。若 parser 为带标注的 const 条目**没有**记类型语法根，则 parser 侧只计“可按初始化式推出类型”的条目，而 ⑤ 的修复会对这两类**过绑**（反向不等）。判别夹具：`fixtures/r9b_const_parser_count_typed_nonliteral.cheng`（三条：无标注字面量 / 有标注字面量 / 有标注 + `uint64(1)`），在**未含修复**的 `kd_r9b` 上跑出的 `parser=N` 直接定论：**N=3 ⇒ 类型根存在**，修复可保留；**N=2 ⇒ 不存在**，必须把“有标注即绑”收紧为“仅初始化式可推类型才绑”。**在 N 出来前不得重烤定稿**。
  **〔判别结果（2026-09-11 深夜，实测：第一个未知量已关闭）〕** 在未含修复的 `kd_r9b` 上：`probe=r9b_const_parser_count_typed_nonliteral rc=2 parser=3 metadata=0` ⇒ **N=3，类型根存在**（带标注的 const 条目确实被计数） ⇒ 修复里“有标注即按标注类型绑定”与 parser 口径**逐条一致**，该修复可以保留、可以烤。第二个未知量（单行别名）当时**未触达判定面**：判别夹具 B 先死在 `compiler csg: TypeArena production failed source_index=1: declaration SymbolId is not materialized`（即 closure8 那条）—— 原因是它的别名 RHS 是**跨源**限定类型名（`import std/buffer as buf` + `buf.GrowByteBuffer`）。已改成**单源 bare 内建类型名**版（`const CountAlias = int32`，无 import），可在 closure8 之前直接跑到覆盖闸；限定名版本待 closure8 补丁落树后补测（两者问的是同一个分类问题）。
  **〔同日新增：下一层候选墙（形态二分已做完）〕** 第九手的最小二分得到：`fn main(): int32 = return 0` ⇒ rc=0；`var n: int32 = 4` + if ⇒ rc=0；**加 `type Slots = used: int32; values: int32[8]`（字面量长度，无需移植）+ `var s: Slots` ⇒ rc=1、判词 `typed expr binding: exact local value-definition group unavailable`**，且 `kd_fixed` 与 `kd_r9b` 两侧**逐字相同** ⇒ 该形态触发点与 const/移植**无关**，是既有闸。
  **〔同日定位：这道墙的机制（代码级，静态推定）〕** 它**不是新墙**，而是 `VERIFY.md:2024` 记载的 **wall24** 在**另一个类型类别**上的同一机制：① wall24 的修法**仍在树里**（`typedExprIrAddNilZeroDeclarationLocalTemplate` `typed_expr.cheng:29361`，消费点 `:29567-29578` 已改用 `declLocalDefiningNodeIndex` + 模板兜底）；② 但该模板的前提是 **nil-able**（`:29371` 的 `TypedExprIrTypeTextIsNilPtrInContext`），而 `var s: Slots`（结构体 + 定长数组字段）**不是 nil-able** ⇒ 模板返回 -1；③ 零值臂（`:29500-29563`）只有 `EmptySeqInit`(序列) 与 int32/uint32/int64/uint64/bool/str，**没有任何聚合零值分支**（op 枚举里也没有聚合零值类）；⇒ `var s: Slots` 的 decl-local 组 **registered 却永不 consumed**，该局部首个精确读（`s.values[0] = 7` 的 LHS 基座）必炸 `:22146` 的 `exact local value-definition group unavailable`——与 wall24 当时的 `var n: Node` 逐步同机理，只是类型类别从“nil-able 引用”扩到“聚合（结构体/定长数组字段）”。修法方向因此是 wall24 修法的**同构扩展**：把 detached 零值模板的前提从“nil-able”扩到“后端已有 bare-default 零值发射的类型”（wall24 已证后端对裸声明槽有完备零值发射：`LocalPtrTag LoadConst 0` / `Aggregate setMem`，`:52122-52156`），并保持 wall24 的契约：语句 rhs 仍为 no_node（后端发射逐字节不变），节点只作 value definition 的 defining 载体与后续 LocalRef 读的类型/证明模板，并通过 value/share 审计（wall24 当时就是靠把 `TypedExprIrOpNilPtr` 补进 fresh-Owned 生产者清单才过的）。已派专门一手做这个同构扩展（只读+出补丁，不占槽）。

- **【kd_r9d 实测（2026-09-11 20:46）
- **【本战役首批**有效的字节级 A/B 判决（kd_r9d vs kd_r9f，2026-09-11 21:0x）】** 驱动对：`kd_r9d`（移植 + ⓪ + closure8 + pair2）vs `kd_r9f`（+k 聚合 v1）—— 即**聚合补丁的 no-op 对照**。结果三件均 **`verdict=IDENTICAL` 且两侧 sha 逐字相同**：`ordinary_zero_exit_fixture` `10bdeb1433…` / `call_fixture` `1b51b87c0e…` / `cold_nested_fmt_interpolation_smoke` `fa69623c93…`。两重意义：① **harness 的 `--out` 口径修好了**（此前所有 A/B 的字节列因两侧 `--out` 不同而作废，现在终于能做真的字节比对）；② **聚合 v1 对非聚合形态是字节中性的**（这三件均不含裸聚合声明）⇒ no-op 判据成立。同时它也反向支持了 kd_r9f 那三条 `rc=1` 确实是裸聚合声明引起的（同一对驱动在不含该形态的夹具上逐字节相同）。
- **【kd_r9j（2026-09-11 22:0x）：w40 墙清除 + 前向跨源边**实测确证****】** 四件正例上 `typed-node exact producer TypeId missing node=8` **消失**（w40 文本路径折叠生效），改报 `compiler snapshot builder: object field TypeArena authority invalid`；负例 `must be int32` 逐字不变；`binary_types_via_import` 的 panic **变成带坐标判词**：
  `compiler csg: TypeArena production failed source_index=0: typed expr type arena: bracket base declaration is not materialised bracket_row=102 base_row=100 authority_row=21 declaration_root=923 view_base=0 view_rows=187 materialised=187 total=3299`
  ⇒ **`declaration_root=923 ≥ view_base(0) + view_rows(187)`，声明确实在后面的源** —— 这是架构设计"前向跨源边 / 载体选错"前提的**实测确证**（此前只有静态推导与 lldb 帧）。
- **【撤回：下条记录的两条"线索"作废（同日，作者自我更正）】** v1 探针把 `arena_type` 列**读错了下标**：`producerTypeArenaIds` 按 **TypeId** 索引（schema `:424`），探针写成了 `[declId]`（声明表行号） ⇒ **13/-1/4/4/16 整列作废**，所以"两列全不相等"与"`inline_arith` 的 `arena_type=-1`"两条线索**均不成立**。**但 `type=` 列干净且单独定罪**：`types=17` 那件报 `type=17`，**17 不可能是 arena 行号**（arena 行只有 0..16） ⇒ `type` 是**最终表位置**，同时排除"没跑 finalizer"（那会给稳定 arena 行号）与"observed 取错"。
- **【DeclKey drift 探针坐标（kd_r9q，2026-09-11 23:3x）】** 四件正例带坐标判词：`named_const symbol=2 type=17 arena_type=13 decl=4`、`inline_arith symbol=2 type=11 arena_type=-1 decl=1`、`forward_const symbol=2 type=14 arena_type=4 decl=4`、`untyped_const symbol=2 type=8 arena_type=4 decl=3`。两条线索：① `type` 与 `arena_type` **四件上全不相等**；② `inline_arith` 那件 `arena_type=-1`（该 decl 在 types 表里**无任何 arena 类型认领**）。**两个最小夹具定死形态因子**：M-A（零 const + 字面量 `int32[8]` 字段）同判词（`symbol=2 type=6 arena_type=16 decl=3`），M-B（纯标量 object 控制组）**不报本句**（报 `typed-node unmanaged ownership premise drift node=0`）⇒ 因子 = **定长数组字段**，与 const/移植无关；也**没有**出现设计手预判的"M-B 报 `structural type row authority invalid`（`:14394`）"那种空认领翻转。已把坐标送回原作者判读（要求归到 C1/C2/C3 或指出第四种，必要时给探针 v2 再加一条坐标；**确信才出修法补丁**）。
- **【树态事故闭环 + 回退工具的六步对拍（同日）】** 第九手用冻结副本流程（apply 前 `cp` 到 `patchgen/` 并记 sha）对当前树 `-R`，**硬判据通过**：arena `e6d16ece817072b4…`、csg `c2a6550d2bd98f2b…` = r9o 纯态。作者另用**六步 sha256 对拍**证明工具是 r2 逐字节原文（移动结果 `-R --check r3` rc=0 ⇒ 移动精确；`-R r3` 得基线；两 sha 与记录值一致；`diff -u` 得 `09381e93…` = r2 逐字节；该文本对当时活树 `-R` rc=0 且结果与基线逐字节相同；从基线前向 `--check` rc=0）。另：作者**如实标注 r1 不可复原**，并落地了"台账逐版给 sha256 + 可复原位置 + 是否可复原"与 `_archive/` + `SHA256SUMS.txt`。
- **【用户裁定：走"根因合并"（同日）】** 剩余墙当**一个共享根**设计与验证（一次烤、可能一次清多道），而非逐道墙逐炉。本席已按此安排：隐式泛型（`parser.cheng`）与 trait premise 墙（`compiler_snapshot_schema.cheng`）**分属不同文件 ⇒ 合炉、判词可区分**。
- **【kd_r9y：DeclKey 修法生效，四正例换墙（同日 01:33）】** `provisional Type DeclKey drift` **消失** ✓，四件改报**新墙** `csg compiler snapshot: object trait premise out of range`（判词点 `compiler_snapshot_schema.cheng:5934`，**全仓无记载、新鲜墙**）；负例 `must be int32` 逐字不变 ✓；`binary_types_via_import` 仍为 `name=T … source_generic_symbols=0`（与本修法无关，因为隐式泛型尚未实现）。⇒ **DeclKey 链正式清掉**（时序修法：把 finalizer 搬到 TypeId 重映射之后）。
- **【(a)/(b) 裁决：选 (b) 普通数组字段（同日）】** 理由：① 同结构体已有先例（`typeSyntaxNameTokenTexts` 族）⇒ 再加一个**同类型**字段不引入新类别；② (a) 要动 `ParserValueExprTreeArenaColumnCount: 201` 这个 stride，还要同步 census 生产者与**跨文件** `compiler_csg.cheng:33268`/`:35742`，影响面是**全源**，与"只影响含隐式泛型的源"相悳。**(b) 带一条强制证明**：必须找出至少一个既有同族字段并证明它**不被任何"树结构体形状/字段清单"哈希或 schema 覆盖**；**证不出来就退回 (a)**（并同步三处 stride）—— 不许拿弱证据凑合。
- **【新墙 `object trait premise out of range` 已派手定位】** 要求：判词点判据链、**既有潜伏 vs 近期引入**（逐件回退判定）、前三候选 + 可区别的最小夹具、以及**不许动 `parser.cheng`**（那是隐式泛型那手的面，两件要合炉）。已知形态因子：**M-A**（零 const、字面量 `int32[8]`）同族命中，**M-B**（纯标量 object）不命中 ⇒ 触发形态是"结构体含定长数组字段"。
- **【泛型探针读数⇒ (B) 确认；实现计划已完整（同日 01:2x）】** `kd_r9w`（两探针合炉）上：
  `btypes … name=T name_not_visible type_syntax_row=31 root_row=32 root_generic_count=0 source_generic_symbols=0 name_is_source_generic=0`（`closure8` 同句，`source_index=5`）
  按作者预置的读法：**`name_is_source_generic=0` 且 `source_generic_symbols=0` ⇒ parser 对该源一个泛型符号都没记 ⇒ (B) 确认**（修法 = parser 侧实现隐式类型参数）。
  **实现计划三节已齐**：§10.26.5（镜像 C 链四步）+ §10.27（挂点：查询在计划落点**不可及** —— 因前向引用合法且三条写路径 write-once，必须推到整源声明齐全后）+ §10.28（**插入点 = `parserForwardingProductionsSeal(tree)`（`parser.cheng:28530`）之后、最终校验链（`:28531`）之前**；四条理由：声明面齐全 / 在两条 StrictValidate **之前**（要求②自动覆盖）/ 早于 `:28558` 封印（满足 `:9629-9630` panic 守卫）/ `ReadTreeFromText`（`:28564`）与 `…Reserved`、migration 变体**都经这个函数** ⇒ 一个点覆盖全部单源读路径）。
  顺序规则已写死：全局追加在该源**所有显式符号之后**、声明间按 `declarationCount` 行序、段内 **params 左→右 → ret**（与 C 链同一*序*规则）、同签名同名只取首次、每条声明连续成段且 `ordinals == 0..<n`；**不依赖任何哈希遍历序**。重复计数的排除靠**触发条件**（规范 `:522`"省略 `typeParamList`"才触发 ⇒ `fn f[T](x: T)` 根本不进推断；判据有现成来源：声明行 `declarationGenericSymbolStarts == -1 && Counts == 0`）+ 三段排除序（无 `typeParamList` → 不在既存泛型绑定 → 不在同名声明）。**作者自标一处读法而非条文**：规范 `:529` 未枚举 kind，保守取 `{Type, Concept, Trait}`（依据 `SetDeclarationGenericSymbols:9704` 将 `Type|Function|Concept|Trait` 并列为合法 owner），`Function` 不纳入。
- **【本席一处程序性错误：转发未核的基线哈希（同日）】** 我把作者自报的基线 `999e82de…` 当成前置条件转给第九手，实测**六文件无一命中**（大概率取自作者 scratch 的另一状态），导致它正确地**停手**。裁决：**以当前树为准、判据用 `apply-check` 通过 + 冻结副本**，不再用转发的哈希做前置门（实测该修法对当前树 `apply --check` **通过**）。
- **【泛型参数 `T`：规范明文承认"隐式类型参数"⇒ (B) 是修法、(A) 方向错（同日）】** `docs/cheng-formal-spec.md:518-529` 有「隐式类型参数」整节，例子 `fn len(xs: T[]): int32 = xs.len` 等价于 `fn len[T](xs: T[]): int32`，与 `src/std/seqs.cheng:138` **逐字同形** ⇒ **`seqs.cheng` 是合法源，不需要门禁/规范迁移**，"给源码补 `[T]`"是改合法源码绕开（`system.cheng:2723` 同形 ⇒ 会变成大面积改写）。**C 链参照实现**：`cheng_cold.c:5033 cold_add_implicit_generic_name` → `:5055 cold_infer_implicit_generic_names`（扫文本 span）→ **`:5260 params` 先、`:5261 ret` 后**；`cold_parser.c:6425` 注释自述该 heuristic 必须先跑。**Cheng 侧缺口**：`parser.cheng:15824 ParserValueExprAppendGenericSpan` 只吃**显式 `typeParamList`**（`:17830` 空列表即报 `empty generic declaration`）—— **没有对应物**。
  **量化（列级，且修正了一个会被误信的说法）**：按 `typeGenericSymbolCount` 走的有两个**进哈希头**的计数器（`arena:826-827`）+ **15 个按 `limits.genericSymbolCount` 预留的 arena 列**（`:4232-4269`，全部在哈希内 `:897-932`）+ 逐行 `typeSyntaxGenericSymbolStarts/Counts`（值被 `viewGenericSymbolBase` 重基，也在哈希内）。**"只影响含该形态的源"是错的**：`genericSymbolBase` 是逐源前缀和 ⇒ **k 之后且自身有泛型的源**，其 `typeSyntaxGenericSymbolStarts` 值也会变；反例：**2 源输入、源 0 含隐式泛型、源 1 含显式泛型** ⇒ 源 1 无辜却位移。而**"不含该形态 ⇒ 逐位不变"成立**，前提是**不得对已显式声明的形参重复计数**（规范 `:529` + `fn f[T](x: T)` 极普遍；重复计数不会静默 —— `duplicate generic declaration`/`generic owner identity forged` 两条硬失败会报，但那是**运行期判词不是编译期门禁**）。**枚举/schema 形状不动**，`compiler_snapshot_builder.cheng` 不需改 ⇒ 与 DeclKey v4 无叠加。
- **【DeclKey v4 坐标：**B 类、分歧在文档身份段**（同日 01:05）】** 四件正例原文：
  `named_const symbol=2 kind=2 type=11 arena_type=11 observed=1 first_diff=0 name_token=7 decl_name_token=7`；`inline_arith … type=17 arena_type=11 … name_token=7 decl_name_token=7`；`forward_const … type=14 arena_type=16 … name_token=1 decl_name_token=1`；`untyped_const … type=8 arena_type=11 … name_token=5 decl_name_token=5`。
  判读（本席做）：**`observed=1` ⇒ 不是 A 类**（`symbolCids` 非空）⇒ **B 类**；**`first_diff=0` ⇒ 差异落在 0..7 段 = 文档身份段**（作者 C.2 自标的最可能翻车处）；**`name_token == decl_name_token` 四件全等 ⇒ 候选 (i)"两侧 `declarationRow` 不同"被排除**。已要求作者专注 `docIdentity = sources.documentCids[sourceId]`：把 finalizer 侧小表与权威表侧各自的 `sourceId`/`documentCid` 追到产出点，判"取错源" / "取到未 seal 的 cid" / "两侧用了不同的表"；定不了就给探针 v5。
- **【kd_r9v：`ptr` 真修生效，同族判词换名为泛型参数 `T`（同日 00:4x）】** 修法 = `patches/ptr_builtin_type_arena_representation.patch`（6 文件 / +29 −10）：给 `ptr` 加 arena 表示。**作者否决了本席建议的"语义种子行"方向并给了硬理由**：种子行在 `AllocateFromLimitsInto` 里**无条件**为每个 arena 建行，而 `typeCount`/`typeKinds`/`scalarKinds` 全进 `typeArenaArtifactCid` ⇒ **会位移全部 arena 的 CID**；改用**末尾追加 `TypedExprStructuralScalarPtr`（序数 18）+ 按需 intern**，与既有 `int`/`uint` 同一条先例（`:1026-1027` 认它、种子循环 `:1568-1570` 刻意跳过、`:9939-9947` 显式允许 ParserSyntax 起源的 Scalar 行）。`ptr` 语义定清：**8 字节/8 对齐的不透明指针内建标量**、`SLOT_OPAQUE` 一个机器字、身份独立于 `cstring`（tag 17 vs 18）与 `uint64`、是地址叶。**身份量化**：枚举/schema 常量均追加末尾 ⇒ 既有序数零位移；未加种子行 ⇒ 不含 `ptr` 的输入 `typeCount`、全部列、arena CID、既有 type CID **逐位不变**；唯一移动的边界是 `csgCompilerScalarKindValid` 上界 15→16。它点名的**最危险静默翻车点**：忘改 `canonical_type_chain` 的 `LocalPtrTag` ⇒ **不报错**，静默把 `ptr` 当 4 字节 int32（只能靠 8 字节/8 对齐的 layout 读数拓）。**实测**：`binary_types_via_import` 的 `name=ptr` **消失** ✓，改报 `… source_index=6 … nominal declaration is not visible producer_source=6 name=T`（`source_index` 3→6）；四件正例与负例判词未变 ⇒ `ptr` 补丁对它们中性。**`T` 看是泛型类型参数**（链中 `:4978` 泛型参数查找先于 `:4993`），已派回架构手：先定性 `T` 属哪个源/哪个泛型容器，并**正面回答"是既有缺口还是 step-3 重放丢了泛型绑定上下文"**。
- **【「两条链汇合」后的两句判词，各自已定性】**
  **(1) `nominal declaration is not visible … name=ptr` —— 内建拼写缺 arena 表示，既有墙、与 Step 3 无关。** 判词点 `typed_expr_type_arena.cheng:4764`（索引版），**树版孪生 `:3385` 判词逐字相同** ⇒ 全林路径同样有洞，非逐源引入。链：`AppendSourceInto`(`:4862`) nominal 分支 → `:4950` 跳 qualified → **:4963 唯一的"内建名"过滤器 `typedExprTypeArenaScalarKind`** → `:4993` 解析 → `:4728` 查本源 → `:4733` 遍历同 owner + `allowsUnqualified` 的 import 边 → `matchedRoot < 0` ⇒ `:4764`。**`ptr` 是语言认可的内建类型拼写、全仓无声明**（五条独立静态证据）：无 `type ptr`；`parser.cheng:6500` 把它列入 `ParserTypeExprIsScalarLike`（与 `cstring` 同级）、`:6430` 列进内建调用名、`typed_expr.cheng:28841-28842` 归一到 `"ptr"`；`parser.cheng:18766-18776` 裸标识符在类型位**一律**产 `ParserTypeSyntaxNominal`、`ptr` 无特例；arena 侧 17 个标量名**不含 `ptr`**、两个枚举都无 Ptr 成员；闭包内真实出现：`std/rawbytes.cheng` 9 次、`std/strutils.cheng` 15 次，而 `binary_types.cheng:2-5` 恰好 import 这两个 —— 与实测 `producer_source=3` 吻合。⇒ **不是前向边入队过宽**（失败在 **authority 相**，驱动里它**先于** `AppendSourceFromTreeInto`；step-3 那套队列/重放完全不在 authority 路径上），**也不是可见性域问题**（该名字全仓无声明行）。**上游明确拒绝的假修法（后续也不许走）**：只把 `ptr` 从 `:4963` 过滤器里跳过 —— 该行 `typeSyntaxTypeIds[ptrRow]` 会保持 `-1`，引用它的父行会在 arena 相报 `child TypeId unavailable`，**只是把墙挪个位置**。已另派专手做"给 `ptr` 一个 arena 表示"的设计（首选方向 = 语义种子行，可能完全不新增枚举成员）。
  **(2) `provisional Type DeclKey drift` —— DeclKey v2 已落树但判词持续：该修法无效。** 本席实测：`kd_r9u` 下四件正例仍为 `provisional Type DeclKey drift`（逐字同 r9t），而 DeclKey v2 补丁**确已在树内**（`git apply -R --check` 通过、正向 `--check` 失败）。⇒ 按作者自己写下的翻车判据，"`tables.symbols.typeIds[sym]` 在插入点已是最终表位置"这个读法**不成立**。已让第九手：① 确认烉口径（冻结 sha / check / bake 前两文件哈希，排除"烤完才落树"）；② 在 `kd_r9u` 上跑 v3 探针（`693af338…`）取坐标，与 `kd_r9q` 那组（`symbol=2 type=17/11/14/8`）逐个对比 ⇒ 判"完全未生效"还是"部分生效"。
- **【kd_r9t 完整判据（同日 00:2x）：L1 全过，两条链**汇合**】** **L1**（三件对照，同 `--out`，`kd_r9o` vs `kd_r9t`）：`ordinary` / `call` / `cold_nested_fmt` 全部 **`A_rc=0 B_rc=0 verdict=IDENTICAL` 且两侧 sha 逐字节相同**（`10bdeb14…` / `1b51b87c…` / `fa69623c…`）⇒ **r3 对不含前向边的输入字节中性**；`TypeSyntax authority incomplete` 全炉零出现。四正例判词与 r9o 逐字同、负例逐字不变。
  **L2/L3**：`closure8` rc=2 `nominal declaration is not visible producer_source=2 name=ptr`；`pair2_ord1` **rc=0**；`pair2_ord2` rc=2 **`provisional Type DeclKey drift`**；`binary_types_via_import` rc=2 `… not visible producer_source=3 name=ptr`。⇒ 三件的 `nominal declaration is not materialised` **全部消失**（行空间问题 → 名字解析问题；`source_index` 由 0 推进到 3/2），而 `pair2_ord2` 则换到 DeclKey 那句 ⇒ **两条链正式汇合到两句判词上**：`nominal declaration is not visible … name=ptr`（binary_types/closure8）与 `provisional Type DeclKey drift`（四正例/pair2_ord2）。
  回退/API 纪律：本炉落树照新纪律先 `cp` 到 `patchgen/forward_typeid_r3.frozen.patch` 并记 sha `b507878a…`（与磁盘件逐字同源）再 `apply`。
- **【kd_r9t（Step 3 r3）：回归已消，前吐链换类推进（同日 00:16）】** 四件正例仍为 `provisional Type DeclKey drift`（**与 r9o 逐字同 ⇒ r2 的切链回归已修掉**）、负例 `must be int32` 逐字不变。`binary_types_via_import` **换类**：从 `nominal declaration is not materialised nominal_row=22…`（行空间问题）变为
  `compiler csg: TypeArena resolution authority failed source_index=3: typed expr type arena: nominal declaration is not visible producer_source=3 name=ptr`（**名字解析问题**）
  且 `source_index` 由 0 变 3 ⇒ 说明**延迟重放确实推进到了解析那一步**，方向符合设计预期（**但 L1 的三件对照字节比尚未跑，未定论**）。
- **【DeclKey 修法 v2（同日，r9o 基线，sha `5be8c0ba…`）】** 上一版编译错的根因以作者复核为准：**同一函数内的前向引用**（`var finalTypeIdByArenaTypeId` 声明在 `:24037`，而被用在 `:23975`），而非第九手当时推断的"跨函数作用域错位"—— **这正是本席反复提醒的"插入块不要引用后面才声明的 `let`/`var`"这一类**（本轮第四次）。v2 改用**符号自己的 `tables.symbols.typeIds[typeSymbolId]`**作为载体（依据：同函数 `:24059-24071` 的既有 remap 循环与本 finalizer 索引**同一张 `typeSymbolIdByArenaTypeId`、同一批符号**，它在 `:24066` 用的就是这个数）⇒ **不引入任何新局部**。另附逐标识符可见性证明（含生成器断言：新行**不出现** `finalTypeIdByArenaTypeId`/`newTypeIdByOld`）。
- **【r2 回归的根因（同日，作者定死 + 本席复核）：缩进层级切断了派发链】** `TypeSyntax authority incomplete` = `InternSyntaxRec` 种类派发链的**兜底 `else`**（`arena:7627`）。r2 把入队块（8 空格）插进了 `elif kind == Qualified:` 的 **12 空格体中间** —— Cheng 的 `elif` 体是缩进块，一条与 `if` 同缩进的普通语句出现在体中间**就地终止了链**：Qualified 的 `for childOffset` 变死代码，其后每个 `elif kind == …`（VarBorrow/Seq/Grouped/Optional/FixedArray/BracketApply/Tuple/Function/Alias）全部改挂到新 `if` 上 ⇒ **12 个 arm 只剩 2 个归原链**，其余种类一律落 `else` ⇒ 完全吻合"无条件、source 0、所有输入"的签名。可复跑的机器判据（作者提供）：`CHAIN-CHECK r9o-baseline ok=True arms=12` / `r9o+r2 ok=False arms=2` / `r9o+r3 ok=True arms=12`。r3 把该块整体移到**整条 `if/elif/else` 链闭合之后**（兜底 `else` 与 `ArenaArrayInt32Set` 之间），并在插入块头部写明了这段历史（`KEEP IT HERE`）。**新增处置纪律：插入块除核"标识符在该点是否已绑定"，还必须核"插入点的缩进层级是否会切断表/块体"。**作者自己指出：调用点审计表**不构成充分条件**（r2 正是签名全对却仍回归）。
- **【树态事故与裁决（同日）】** 架构手在 23:47:46 **就地覆盖**了 `patches/forward_typeid_deferred_replay.patch`（`09381e93…` → r3 `b507878a…`），而第九手此前已用旧版 r2 落树并烤了 `kd_r9r` ⇒ 用新版回退旧态得到**无法自愈的中间态**（arena `775e11cc…`、csg `5d2679fc…`）。第九手**停手等裁决**（未手工编辑、未 checkout），裁决 = 作者产出**专用回退工具** `forward_typeid_deferred_replay_r2_revert_tool.patch`（内容 = r2 原文，专用名避免再被覆盖），第九手对当前树 `-R` 它，**硬判据** = 回退后两文件 sha 必须等于 r9o 记录值（`e6d16ece…` / `c2a6550d…`），**不等即停手上报**。**新纪律（已采纳）：apply 前先把补丁副本存 `.rebuild/s1b_step3/r9/patchgen/` 并记 sha，撤回一律用该副本。**
  **本席复核三条**：① 当前树确系 **r9o+r2**（结构判据：`typed_expr_type_arena.cheng:7396` 的 `if state.forwardNominalRoot >= 0:` 是 8 空格、紧跟在 Qualified arm 体（末条 16 空格 `return false`）之后 ⇒ 正是切链形状）⇒ 回退方向正确；② 磁盘上 `b507878a…` **确是 r3**（末个 hunk `@@ -7426,9 +7613,33 @@` 插在兜底 `else:` 之后，并自带 `KEEP IT HERE` 注释）—— 第九手用"补丁里 grep 不到 `CHAIN-CHECK`"推翻它是**误判**（`CHAIN-CHECK` 是作者跑的校验脚本输出，不是补丁内容）；③ `type_symbol_finalizer_arena_position_fix.patch` 对当前树 **`apply --check` 通过**（本席实测，`compiler_snapshot_builder.cheng` +26/−4）—— 第九手上一轮报的 `patch failed: typed_expr_type_arena.cheng:7613` 是**把两件补丁的检查串了行**。
- **【Step 3 r2 落树实测：**引入回归**（2026-09-11 23:4x，kd_r9r）】** 六件全部变成
  `compiler csg: TypeArena production failed source_index=0: typed expr type arena: TypeSyntax authority incomplete`
  而上一炉（r9o）四件正例是死在**更晚**的 `compiler snapshot builder: provisional Type DeclKey drift`、`binary_types_via_import` 死在 `nominal declaration is not materialised nominal_row=22…` ⇒ **r2 把失败点提前了，是回归不是墙前移**。**关键观察**：`TypeArena production failed source_index=0` 现在在**所有**输入上都出现（含上一炉能走到 nominal 判词的 `binary_types_via_import`）⇒ 触发条件**与"是否有前向边"无关**，更像**无条件路径**（append 相 `replayForward` 传错 / 行过滤器把正常行也跳过 / 空队列时就触发的断言）。已下达：**不往下跑 L2/L3**、先补 L1 直接读数、撤 r2 回 r9o 纯态、出 r3。
- **【DeclKey 墙的修法（同日，作者确信）】** 真死因：`compiler_snapshot_builder.cheng:23975-23989` 的 finalizer 循环**把 arena 行号与表位置当成同一个数**：`typeSymbolIdByArenaTypeId` 由 `csg.typeArena.symbolIds` 逐行填（`:17341`）⇒ 下标是 **arena 行号**；而 `symbols.typeIds[sym]` 在 `:24059-24066` 已重映射成 **最终表行号**；Type 表在 `:23924/:23950` 追加合成签名行、`:24016` 全表按 row cid 规范排序后，arena 行不再占 `0..<arenaTypeCount` ⇒ `:23976` 的 continue/查表得 -1 **永久跳过该 Type 符号** ⇒ `symbolCids` 停在空 cid。修法 `patches/type_symbol_finalizer_arena_position_fix.patch`（+22/−5）：循环改为 `for arenaTypeId in 0..<typeSymbolIdByArenaTypeId.len` → 再取 `finalTypeIdByArenaTypeId[arenaTypeId]` 作为最终位置，并加一条位置越界 fail-closed 判词；原有 `<0`/`kind!=Type`/finalizer 内部/`:19284` binding==1 守卫**一条未动**、覆盖域只增不减。另有不叠加的 v2 探针 `patches/declkey_finalizer_arena_position_probe_v2.patch`（同一修法 + 判词坐标）。翻车表征：`portable Type declaration CID join invalid`（`:24832`）。
- **【Step 3 r2：把"调用点未同步"这一整类失效从设计里删掉（同日）】** 作者诚实承认**复现不了** r1 报错里 `actual[0]` 非 var（三种解释无法区分），于是改设计而非改那一处：`AppendSourceFromTreeInto`（仍 16 参）与 `ResolveNominal`（仍 7 参）**签名不变**，队列挂 `state.forwardNominal`、判决挂 `state.forwardNominalRoot`（dispatch 前显式重置），`InternSyntaxRec` 只加 1 个 bool ⇒ **`compiler_csg.cheng` 的 2 个 hunk 现在 100% 纯插入、不再触碰任何既有调用点**。并交了**机械化调用点审计表**（`grep -rn "<函数名>"` 枚举：12 个调用点、0 个 arity 不符、0 个 var 形参绑到非简单标识符），新 sha `09381e93…`（r1 `1a23cf83…` 作废）。它同时标出 r2 唯一比 out 形参弱一档的地方（`state.forwardNominalRoot` 的显式重置：qualified 分支在 `childCount < 2` 时短路不调用 `ResolveNominal`，不重置会读到上一行判决），已排进排查表第 4 位。
- **【四正例链：`Local declaration lacks exact value definition` 已清（kd_r9o），新墙 `provisional Type DeclKey drift` 已定位为**既有潜伏缺口首次可达**】** 判词点 `compiler_snapshot_builder.cheng:19941`（判据 `:19936-19940`，函数 `compilerSnapshotBuilderDeclarationAuthorityCommitInto:19033` 的 canonical 审计循环）：左 = `tables.symbols.symbolCids[oldSymbolId]`，右 = 权威表 `declKeyCids[declId]`。"provisional" 指 Type 符号的 cid 由 `FinalizeTypeSymbolDeclKeyInto:18487` **为该符号单建一张小表**后写回（`:18580`）；全文件写点普查证明 Type 符号的 `symbolCids` **只有这一个写点**（落表时是空 cid，`:17301`）⇒ 只可能"没跑 finalizer"或"临时 key ≠ 权威 key"。**既有判据**：判词与 w53 守卫同源（`patches/wall101.patch:520-560`，2026-09-04，**早于本战役全部 13 件补丁**）；`AppendTypeSymbolsInto` 函数体工作树 vs HEAD `/usr/bin/diff` = **IDENTICAL**（层不可能是我们改的）；13 件里只有 `pair2` 碰过 `typeSymbolIdByArenaTypeId`，且只碰 portable 副本、判词文本不同。⇒ **回退任何一件都不会让它消失**，只会盖回更早的墙。
  **三候选 + 一条判别探针**：C1 `typeSymbolIdByArenaTypeId` 覆盖裂缝（`:17339-17341` 单点认领）⇒ 某 Type 符号被 `:23980` 永久跳过、`symbolCids` 为空；C2 认领落到"继承了 symbolId 的定长数组行"（symbolIds 列按行传播）⇒ observed typeCid 取错；C3 alias/tuple 两趟未到不动点（已降权）。探针 `patches/provisional_declkey_drift_symbol_probe.patch`（+/**−1 行**，纯诊断、不动判据与流程）把判词换成带 `symbol=/type=/arena_type=/decl=` 坐标 ⇒ `symbolCids` 空 = C1；非空且 `type=` 指向定长数组行 = C2；指向 object 行 = C3。另配 M-A（零 const + 字面量 `int32[8]`）/M-B（纯标量 object）两小夹具剥"定长数组字段"这个形态因子。作者诚实标了一处未解冲突（按链推演 M-A 应相等、与实测矛盾），故**只交诊断探针、不交修法补丁** —— 这个分寸拿得对。
- **【Step 3（前向边 TypeId 延迟绑定）设计完成（同日，只读）】** 三条决定性事实：**G1** `ReserveAggregate`（`:1333`）按 `typeCount` 追加列并写 `typeSyntaxTypeIds[声明根]`，但只 `add(bucketNext,-1)`、**从不挂进 `bucketHeads`** ⇒ 预留行不是去重目标 ⇒ **"先占位后 patch"必造重复行、`typeCount` 漂移、哈希变**（占位法判死）；**G2** 声明根 TypeId 在属主源 append 时定型、seal 不改（`BuildObjectDeclaration:2186 typeIdOut = reservedTypeId`）；**G3** TypeId 槽初始化 -1（`:6494-6496`）+ postorder（`:7186-7188`）⇒ **"child TypeId < 0" ⇔ "子行被阻塞"**，阻塞传播可做成一次升序游走的**局部规则（无不动点）**。执行序可证：`Intern` 去重键含 `children`/`baseTypeId`（`:1129-1132`）⇒ TypeId ≡ 键首次出现序号 ⇒ "先绑定后 intern"是**键的完整性要求**；三类副作用里**只有类型铸造能推迟**（池插入绝不能推迟——池 id 按插入序分配且进 `artifactRaw32`；resolution 记账绝不能重复）。方案：`PendingForwardNominal`（全 int32、行号即下标的稠密位图、**普通堆数组、不进 arena** ⇒ 不碰 pin 预算、不进哈希面；约 +154 KB）+ **驱动侧重解析重放**（避开"去树"）；队列顺序可证为**严格按全局行号升序**（源内行升序 + 源按 orderedSources，而全局行 = 前缀和基址）⇒ 一次通过。**守卫取舍**：`nominal declaration is not materialised` **改判据、保留硬错**（变成重放相兜底网，非死代码）；`bracket base…` 已删不恢复；入队前必须先过 `declaration SymbolId is not materialized`（否则会把"非法引用"当"前向引用"无限入队）。**Step 3 不可拆的原子改动**（入队+标记+传播而不落重放 = stub，禁止），所以拆的是**验收层**：L1 空队列字节中性 → L2 同源前向 → L3 跨源前向 → L4 **元组内前向的池序保护**（最大未测面） → L5 门内。
- **【方法论纠正（同日，影响面广）：“全林驱动 vs 逐源驱动”不是多源输入的等价 oracle】** 全林驱动只调一次 `AppendSourceFromTreeInto`（`symbolBase=0`）⇒ **把所有聚合预留提到所有 intern 之前**，而逐源是 `agg(s_k)→intern(s_k)` 交错 ⇒ **两者 TypeId 编号对任何多源输入本来就不同**（静态推论，未实测）。这与已确立的"产物嵌输出路径 ⇒ A/B 必须同 `--out`"并列，作为**第二条方法论约束**。
- **【kd_r9n（2026-09-11 22:5x）：前向补一层——泛型窗口修好，下一跳**正是预言的 TypeId**】** `binary_types_via_import` 从
  `bracket base declaration is not materialised … declaration_root=923 view_base=0 view_rows=187 materialised=187 total=3299`
  推进到
  `typed expr type arena: nominal declaration is not materialised nominal_row=22 declaration_root=200 materialised=187 total=3299`
  ⇒ **泛型窗口类读点已解决**（bracket 判词消失），卡点换到 **nominal 声明的 TypeId**；`200 ≥ 187` 仍是前向边 —— 与架构手预言逐字一致："下一跳是声明根 TypeId 是未来的值，属 step 3 延迟绑定"。四件正例与负例判词逐字不变，三小件产物**逐字节相同**。
- **【四件正例的 `Local declaration lacks exact value definition`：假设证实，且是三处咬合计数器（同日）】** 判词点 `compiler_snapshot_builder.cheng:18422-18429`：要求每条 `ParserDeclarationLocal` 行都被 BindingInitializer value definition 见证，而**模块级 const/var 也是 Local 行**（`declarationFunctionRows == -1`）却结构性地拿不到 definition（`typed_expr.cheng:29831` 只遍历函数作用域行；`:18293` 的 owner 检查会拒绝它）⇒ 必中。**关键增量**：同假设还有**两处咬合计数器**必须同改（`:19045 localDeclarationCount` 喂符号守恒式 `:19073-19078`；`:24392 expectedLocalDeclarationCount` 对比符号域）—— 只改 `:18422` 会立刻换成 `declaration authority destination invalid`（`:19087`）。修法 `patches/local_symbol_domain_function_scoped.patch`（+31/−8，3 hunk，apply-check 复验 exit 0）：判据收窄为 `kind != Local || declarationFunctionRows[row] < 0 → continue`（**与 `compiler_csg.cheng:33484-33497` 判全局声明同一把尺**），而**被计数的每一行仍照旧硬判**（本席已 read 核实）；只改期望计数、不动任何 `add(tables.symbols.*)` ⇒ 符号集合/顺序与产物身份零变化。
- **【M1/控制组判别（同日，kd_r9j）：**C1 定賚**】** **M1**（整文件零 const，字面量 `int32[8]` 字段 + `var s: Slots` + 字面量下标）：`rc=2`、末行 **逐字同** `compiler snapshot builder: object field TypeArena authority invalid`；**控制组**（纯标量对象 `P{x,y}`）：`rc=2`、末行 **不报本句**，而是 `compiler csg: typed-node unmanaged ownership premise drift node=0`。⇒ **死因 = 消费者单趟行序前提对聚合行不可满足**（聚合行先占号、字段类型行后 append ⇒ `childTypeId >= typeId`），不是"对象预留未回填"那一支；M1 **全文件零 const 仍逐字同句** ⇒ 与常量折叠面无关（与 `disc_literal_r9g.stderr.txt` 的反证一致）。修法补丁 `patches/object_field_typearena_text_fixpoint.patch`（+73/−6，apply-check 复验 exit 0）。
  **控制组另暴露一道墙**：`compiler csg: typed-node unmanaged ownership premise drift node=0`（判词点 `compiler_csg.cheng:34832`）。**已查证它是既有潜伏墙**：`VERIFY.md:2887/2915` 记载 w38 时代 v6 已撞过同句（当时判定"csg 权威 walk 潜伏墙，非本轮引入"），不在本轮修面内。
- **【前向声明链的下一步：架构最小第一步已就绪但需重基（同日）】** `forward_decl_generic_window_index.patch` 在现树上 `git apply --check` 失败（`compiler_csg.cheng:33130`）—— 因为期间主树又落了 `s1b_step3p` + `w40` + pin-v2 + census。已退回架构手以现树重出（语义与断言集一字不改）；第九手已按纪律未手工解冲突。重基版到位后与定点化补丁**合一炉 `kd_r9m`**（两者预期判词不同，可归因）。
- **【容量 pin + 列普查中性**已证明**（kd_r9k，2026-09-11 22:2x）】** v2 落树后三件夹具全部 **`A_rc=0 B_rc=0 verdict=IDENTICAL` 且两侧 sha 逐字相同**：`ordinary_zero_exit_fixture` `10bdeb14…` / `call_fixture` `1b51b87c…` / `cold_nested_fmt_interpolation_smoke` `fa69623c…`。⇒ 判据①（无 `pinned capacity overrun` / `not installed`）与判据②（与基线逐字节相同）**同时成立** —— **容量 pin（拷贝链约 93.6 MB）与逐列普查 U0 削法（循环峥值 ≥ 67 MiB）对产物语义中性**。这是本战役内存线首次在"同 `--out` 字节级"口径下拿到完整中性证据（此前只有 kd_r9d↔kd_r9f 的 no-op 对照）。
- **【容量 pin v2：作者推翻本席的 (a)、证明 (b)（同日）】** 证据三条：① `pinned=6020 > 0` 证明 pin 代码跑过（否则会报**另一条** `pinned capacity missing`，该分支未触发）；② `capacity=1048576` 恰是 `ArenaInitDefault(1048576)` 的**出生地板**（作者并更正了自己旧措辞：该补丁**从未**做 `ArenaInitDefault` 容量替换，只是在其后追加 `ArenaReserveCapacity`）；③ `arena.cheng:202-203` `if minCapacity <= arena.capacityBytes: return` ⇒ 6020 ≤ 1 MiB 是**合法 no-op** ⇒ `capacity != pinned` 对所有预算 < 1 MiB 的源**恒真**（恒假阳性）。v2（`acc9df83…`，7 hunk，前两版作废）：地板具名化 + `PinnedCapacity = max(预算, 地板)` + 施加点**独立安装校验**（新判词 `pinned capacity not installed`）+ 谓词 `capacity > pinned`（`overrun` 判词不变）。**不削弱论证可接受**：容量单调不减、唯一增长路径 `ArenaAllocBytesAligned` 置 `max(2·capacity, nextUsed) ≥ 2·pinned` ⇒ 可达状态恒有 `capacity ≥ pinned`，`>` 与 `!=` 在**真越界**上完全等价，只在"预算低于地板"这个良性局面分道；"pin 没装上"改由 T-1 在**唯一施加点**负责（比末端 `!=` 反推更强，本次假阳性正是两种情形混在一起）；已知盲区（预算 < 1 MiB）已写进判词且**验收输入不在盲区**（预算 ≈ 94.4 MB）；紧断言 `ArenaUsed > 预算` **本轮不加**（残差用量未实测，会引入同类新假阳性）—— 这个判断本席认可。
- **【容量 pin + 列普查首轮中性验证：判据①违反、判据②满足（2026-09-11 22:0x，kd_r9h vs kd_r9i）】** ① **违反**：`typed expr type arena: pinned capacity overrun phase=append_source capacity=1048576 pinned=6020`（三件均如此，pin 分别 6020 / 6432 / 7096 B），**稳定复现 4/4、仅在 kd_r9i 上出现** ⇒ 不是抖动，是这对补丁的真实缺陷；② **满足**：三件产物在 A/B 两侧 sha 逐字相同（`10bdeb14…` / `1b51b87c…` / `fa69623c…`）⇒ 容量 pin 在**未触发断言**的路径上确实中性。
  **本席定位（从补丁文本读出）**：断言谓词是 **`capacity != pinned`**，而它自己的注释说的不变量是"an overrun makes the arena capacity jump to **at least twice the pin**" ⇒ 真正的越界信号应是 `capacity > pinned`（或 `>= 2×pinned`），`!=` 会被**良性地板**打穿：恒等夹具的 pin 只有 6020 B，而 arena 初始容量是 `ArenaInitDefault(1048576)`（1 MiB）。已退回作者，要求判定并证明是哪一种：(a) **pin 没被装上**（它说过要做 `ArenaInitDefault` 容量替换，但该路径上容量仍是 1 MiB），还是 (b) **谓词过严**（容量不可能低于初始地板）；修法必须同时满足：真越界仍响亮失败、小源不被误杀、不得把断言改成什么都不查。**值得记一笔：这次是 fail-closed 断言本身把一个会被掩盖的缺陷变成了带坐标的硬失败**（否则它会静默地让每个最平凡的源 rc=1，而零判词）—— 该断言的设计目的达到了，只是谓词取错。
- **【新墙 `typed-node exact producer TypeId missing node=8` 已定位：**它是我的 ⓪ 修复带来的下游要求，不是潜伏墙**（同日，静态手结论 + 本席 read 核实）】** node=8 是**模块级 const 标识符在文本路径**被 `TypedExprIrAddRhsLocalRefNode`（`:20899`/`opKind:20911`）发成的 `LocalRef`（位置 = `s.values[<const> - 1] = …` 的 LHS 下标表达式），不是 `s` 的 LHS 根（若是，必先报 node=1）。链条：⓪ 让 const 进了 `ctx.bindings` 的 globalFlag 行（`inGlobalConstBlock` 在 HEAD 零命中，确系本修复引入）⇒ `TypedExprBindingRhsLocalRefType` 返回非空 ⇒ 文本路径**既有**的常量折叠被 `if refType == ""`（`:22507`）挡在门外 ⇒ 落到 `:22556` 发 `LocalRef`；而 wall43 模板（`:20743-20819`）要求 `declarationFunctionRows == 当前函数行`，模块声明恒 -1 ⇒ 结构 TypeId 列保持 -1 ⇒ `compiler_csg.cheng:34397` 报警。**此前被 `declaration producer identity split` 掩盖；`s1b_step3o`只补了精确路径（`:22215-22258`），文本路径漏补 ⇒ r9h 揭盖。** 修法：把"本行胜出绑定是模块级"也纳入折叠条件（`patches/w40_textpath_module_const_fold.patch`，+28/−1，`git apply --check` 复验 exit 0）；**不采用**"给这个 LocalRef 绑 TypeId"：该臂在 `primary_object_plan.cheng:18055-18062` 要求 `bindingValueDefinitionRow >= 0`，模块 const 没有函数局部 value-definition ⇒ 即便过门也不可下降，只是把墙后移。
  另记一条本席自身错误：派单里引的 `typed_expr.cheng:47485 TypedExprIrLookupTypeLayout` **行号是错的**，该函数实际在 `:47700`，`:47485` 落在 `TypedExprIrTypeIsEnum` 内。
- **【前向跨源边是这道墙的真面目（同日，静态设计手结论）】** `value.typeSyntaxGenericSymbolCounts` 是**逐源前缀物化**的列（预留全长 `:3979-3980`、逐源追加 `:6409-6411`），而 preflight 读的是**全局** `declarationRoot`；preflight 自己的拍板（`:1888-1893`）把"`len` == 本源全局区间末端"钉死 ⇒ **`declaration_root >= len` 等价于"声明在后面的源（前向跨源边）"**。而 `genericCount` 的用途（判 `Base[...]` 是定长数组还是泛型应用，并给 arity/尾部默认/childCount 三条断言上界）**在三处复用**（`:1918-1920` / `:7154-7156` / `:6094-6098`）⇒ 只修 preflight 只是把 panic 往后挪一跳。
- **【三选一裁决（本席同日）】** 采纳 **(c) 作为诊断步、明确不是解**（门内 source 0 仍失败，只是 panic→带坐标判词，`forest_appended` 仍为 0，**不得记成达标**）；**(a) 不充分已彩纳为判词**：索引里没有"声明根→泛型窗口"的列（逐列核过 `:101-142`），而下一跳要的是**声明根的 TypeId**，它由声明源被 append 时的 `ReserveAggregate :1382-1384` 才产生 ⇒ 前向边下"还不存在"，任何索引读都补不上；**(b) 不可能**：物化顺序 = `orderedSources`，由 `CompilerCsgSortSourcePathModulePairs`（`compiler_csg.cheng:26881`）按**路径/模块对排序**（非依赖序），改它 = 改所有全局行基址 = 索引行序/收据/artifact 哈希全变。
  补丁 `patches/s1b_step3p_forward_declaration_failclosed.patch`（+22/−2，4 hunk，`git apply --check` 本席复验 exit 0）：其中 **1 处是真修**（`ReserveAggregate` 用**单源树**配**全局行**读 producer source，改读 arena 同名列；源 k≥1 只要 `Σ_{j<k}count_j + localRow >= count_k` 就必越界，整林 base=0 下取值逐字相同）+ 3 处 fail-closed 守卫（用被读列自己的 `len` 当界，判词带全部坐标，整林恒不触发）。
- **【当前最大的架构缺口：前向跨源引用无法解析（同日定性）】** 物化顺序按路径排序，而语言允许后面的源被前面引用 ⇒ 逐源生产时"引用了尚未物化的声明"是**结构性必然**，不是边界 bug。这是 `forest_appended=234` 的核心障碍，已派专手做架构设计（两条候选：**全局声明面预物化** vs **延后解析**），硬约束：不得改 `orderedSources`、不得动全局行基址/收据/artifact 哈希、不得放宽任何守卫。
- **【`arena array: read out of bounds` 已定位到指令级（lldb，2026-09-11 21:5x）】** 断点 `cheng_panic_cstring_and_exit` + `bt 18`，符号用 `kd_r9h.map` 反查：
  `#2 ArenaArrayInt32Get`（`arena.cheng:400`）← `#3 typedExprTypeArenaSyntaxGenericSymbolCountAt`（`typed_expr_type_arena.cheng:480`）← `#4 typedExprTypeArenaPreflightBracketAuthority`（`:1868`）← `#5 TypedExprTypeArenaAppendSourceFromTreeInto`（`:7692`）。
  **落点 = `typedExprTypeArenaPreflightBracketAuthority`（不是 `MaterializeBracketConstLengths`、也不是 `InternSyntaxRec`）**；越界的那一次读是 `typedExprTypeArenaSyntaxGenericSymbolCountAt(value, declarationRoot)`（`:1913-1914`），读的是**目标 arena 列** `value.typeSyntaxGenericSymbolCounts`，行号 = `state.authority.declarationRootTypeSyntaxNodeIndexes[authorityRow]`（**全局行**），而该读点**只有 `authorityRow >= 0` 一层守卫、没有对"已物化前缀" `value.typeSyntaxGenericSymbolCounts.len` 做边界** ⇒ **与刀 i 同类：逐源视图 × 全局行**；近邻已有守卫 `:2848-2853` 用的是**全局** `typeSyntaxCount`，流式路径下保护不到这次读。它同时阻断验收①与门内达标（门内 `pass=1 src=0` 死在同一句）。
  **不需要先烤诊断守卫**：断点已经把读点钉到单一命中（`SyntaxGenericSymbolCountAt` 内只读 `typeSyntaxGenericSymbolCounts[declarationRoot]` 一处），既然它炸了，`declarationRoot` 就必在已物化前缀之外（或为负），不存在"在前缀内也炸"的第三种情形 ⇒ 再花一炉只为确认数字，不值得。已派专手做修法（读全局侧 vs 先物化 vs 边界+硬失败，三选一并说明另两条为何错）。
- **【第九手最终定论（2026-09-11 21:3x）：`CONST-LENGTH PORT ESTABLISHED` / `ACCEPTANCE NOT ESTABLISHED`】** 三条验收逐条：① 单文件 `binary_types.cheng` rc=0 **未达标**（`r8_btypes_const_bracket_main` 在 r9b/c/f/g 上一律 rc=1、末行 `arena array: read out of bounds`；**对照第八手 `kd_fixed` 是 rc=2 `nominal declaration is not visible … LsmrMaxDepth` ⇒ 原卡点确已被移植消掉**）；② 三夹具：**负例达标**（`must be int32 name=SlotName statement_offset=752` 在 r9b/c/f/g 上逐字不变）、四件正例全部 rc=1；③ 234 源门内 **REJECT**：`gate_run.sh r9g r9/kd_r9g` 226s ⇒ `rc=1 / forest_parsed=234 / forest_appended=0 / ta_stream=0 / guard_hits=0 / max_rss=767,542,376 < 805,306,368`，死在 `pass=1 src=0` 的 `arena array: read out of bounds`。
  **本轮最重要的一个读数：门内已不再撞门**（`guard_hits=0`、峰值 767.5 MB < 768 MiB；同窗口基线（第八手）是 `rss_limit_exceeded 5,759,095,536`）⇒ **当前唯一直接卡点是 source 0 的 panic**，它同时阻断验收①与门内达标。
- **【本席修正了 `s1b_step3o` 的一个编译级缺陷（未烤前拦下）】** 设计手交付的 `patches/s1b_step3o_module_const_expr_read.patch` 把新块插在 **`let parserFunctionRow = …` 绑定之前**，而该块的条件直接读 `parserFunctionRow < 0` ⇒ **用前声明，根本编不过**（这是本轮第三次同类：第九手已在 r9a、r9e 两次撞过"插错位置/漏接调用点"）。本席已将该块整体移到绑定**之后**、`if parserProducerSourceIndex < 0 ||` **之前**（原文件 22215 行前），并逐条核过块内引用（`resolutionKind`/`parserFunctionRow`/`declarationRow`/`tree`/`ctx`/`ir`/`scope`/`lineNumber`/`surfaceText`）在该点全部已绑定；修正后 `git apply --check` = exit 0。
- **【kd_r9g 实测（2026-09-11 21:28）：v2 清掉 `:6098`，推进到第三道墙】** `fixtures_r9g.txt`：四件正例上 `typed expr value definition: producer lacks exact type or ownership proof` **已消失**（v2 达到目的），但改报 **`typed expr binding: declaration producer identity split`**（rc=1，判词点 `typed_expr.cheng:22218`，函数 `typedExprIrBuildRhsIdentifierFromParserActive:22157`）；负例 `must be int32` 逐字不变；`binary_types_via_import` 仍是既有 arena panic。
  **待验假设（本席静态推得，尚未证实）**：该守卫的四个条件里有 **`parserFunctionRow < 0` ⇒ panic**（即要求声明必须是**函数局部**）；而四件正例的 `fn main` 里**都在表达式位置读了模块级 `const`**（`SlotCount - 1` / `LateCount - 1` / `UntypedCount - 1` / `SlotStep * 2 - 1`），而模块级 const 的声明行正是 `ParserDeclarationLocal` + **`functionRow == -1`**（这正是 ⓪ 修复利用的那个事实）⇒ 命中该条。反向支持：四件正例是**同一个形态**（都有 `var s: Slots` + 定长数组字段 + const 参与下标算术），而上一轮 no-op 对照里三件**不含该形态**的夹具逐字节相同。若成立，修法方向是"表达式位置的模块级 const 应先经常量折叠（`TypedExprModuleConstLiteralForContext`）而不是走本地读取路径"，与 C 链的编译期常量语义一致。判别用例：把一件正例的 const 下标改成**字面量**（`s.values[3]`）—— 通过则假设成立；仍报同一句则假设被推翻，得去查另三个条件。
- **【kd_r9f 实测（2026-09-11 20:52）：聚合零值模板**部分成功**】** 四件正例上 `typed expr binding: exact local value-definition group unavailable` **已全部消失**（该补丁达到了它的目的），但立刻改报 `typed expr value definition: producer lacks exact type or ownership proof`（rc=1，判词点 `typed_expr.cheng:6098`）；负例 `parser type syntax: fixed array length const must be int32 name=SlotName statement_offset=752` **逐字不变**；`binary_types_via_import` 仍是既有 `arena array: read out of bounds`。
- **【新 panic 的定位（同日，代码级）：载体 exprClass 与定义所有权不等】** `:6098` 守卫里有一条 `(!parameterOrigin && ownership != Int32(ir.nodes2_exprClasses[definingTypedNodeIndex]))`。修复复用的 detached **NilPtr** 叶在 fresh-Owned 生产者清单里（`:2996`）⇒ exprClass = **Owned**；而 `var s: Slots`（`Slots = used: int32 + values: int32[8]`，**纯标量聚合，非托管**）的价值定义所有权应为 **Unmanaged** ⇒ 不等 ⇒ 正中该条。对照说明为何 wall24 当年复用 NilPtr 没事：那时目标类型 `Node` 是**托管引用** ⇒ Owned = Owned 成立。已退回原作者：先静态定位 `definitionOwnership` 出处，再让载体与所有权逐字匹配（并一并满足 `:6098` 其余条件：`exactTypeId` 有效、`proofKind ∈ [None, Aggregate]`、托管节点不得 `proofKind=None`），**严禁放宽守卫或改夹具形态**。
- **【内存线解锁（同日）：容量 pin 补丁 rebase 完成 + 列普查叠加风险排除】** `patches/typearena_pinned_capacity.patch` 已以"”closure8 已落树后"”为基重出（新 sha256 `fc0c3f1364721f5ac704e6b230557fd38562b450873c5fbd20c60d819f07fe4c`，12,533 B / 6 hunk，旧版作废）—— 两者都改 `typed_expr_type_arena.cheng:7548` 一带（**本席先前"文件面不重叠"的判断是错的**，由第九手撞 `git apply --check` 失败后停手报回而暴露）；另：`patches/tree_arena_column_census.patch` 在 closure8 落树后由本席复验 `git apply --check` = **rc=0** ⇒ 原作者担心的叠加冲突**未发生**。新基线规则：**此后任何"中性/字节不变"判据一律以 `kd_r9f` 为参照**（树里已含聚合补丁，拿 `kd_r9d` 当基线会把它的合法行为变化算成非中性）。
：closure8 与 pair2 两件补丁双双**已验证**】** `closure8_pair2_r9d.txt`：`probe=closure8 rc=1`、**四条目标判词计数全为 0**（`materialized_missing=0` / `join_duplicate=0` / `symbolid_not_owned=0` / `cid_projection_drift=0`）、末行改为 `arena array: read out of bounds` ⇒ closure8 那句 `declaration SymbolId is not materialized` **已消失**；`probe=pair2_ord1 **rc=0**`、`probe=pair2_ord2 rc=1` 且**两向 `join_duplicate` 均为 0** ⇒ pair2 那句 `portable TypeArena Symbol join duplicate` **已消失**（方向 A 直接编过，方向 B 改撞另一道墙，但**不再是 join 问题**）。同时核过两件补丁在树里**完整落地**（closure8 六条断言字符串各 1 次、pair2 新判词与所有权机制 6 处、`declarationSymbolGlobalRoots` 种子化调用点 1 处）。
- **【当前最多命中的墙：`arena array: read out of bounds`（panic 类，非结构化判词）】** 它同时出现在 `binary_types_via_import`、`closure8`、`pair2_ord2` 三个不同对象上 ⇒ 它现在是夹具/闭包层面的**首要阻塞**。已知背景：`patches/s1b_step3i_preflight_source_slice.patch` 修的只是 preflight 那一处，**同类越界在别处还有**（早前手已记）；它以 panic 形式掩盖根因（无行号、无坐标），故定位方式是"最小化对象 + 逐层剥"而非读判词。
- **【驱动身份探针结果（同日，`driver_identity_probe.sh r9b r9c`）：`verdict=SAME`】** 两个**不同**驱动、**同一 `--out`**、同一最不敏感夹具，两侧 sha 逐字相同 `7f071c49b32adc29acc8076e34b7813a655f13e65739aaaef5626368d5fe7765` ⇒ **产物不嵌驱动身份**，前两轮已验的"只嵌输出路径" 得到补充与封闭 ⇒ **跨驱动逐字节比对有效**（`kd_r9d` vs `kd_r9e` 的中性判据成立）。一条异常已登记为“未复现”：该探针**首次**跑时 r9c 侧 rc=1、判词 `lowering plan: compiler csg transfer receipt underflow`、`NO_ARTIFACT`，**立即重跑同命令即 SAME**，另用 `try_r9.sh` 直连复跑两次均 rc=0 ⇒ 判为**不可复现的单次拖动**，不计入回归；但该判词在 `kd_fixed` 上对 `cold_nested_fmt_interpolation_smoke` 是**真实**的（被移植修好），故日后见到它**必须先复跑一次再采信**。
  **〔实测判词（kd_r9c，2026-09-11 20:19：修复**已验证**）〕** `fixtures_r9c.txt` 全部六件里，**`parser-owned global coverage mismatch` 出现次数 = 0**（逐文件 `grep -c` 确认）⇒ ⚪ 的成立判据满足：**const 块条目的 metadata 绑定接线已生效**。四件正例全部从 `rc=2 + 覆盖不等` 推进到 `rc=1 + typed expr binding: exact local value-definition group unavailable`（即上一条定位的 **wall24 聚合类型复发墙**）；负例仍精确硬失败 `path` `parser type syntax: fixed array length const must be int32 name=SlotName statement_offset=752`（移植行为不变）。⇒ **两件事同时被证实**：① 本修复修好了它要修的东西（覆盖闸不再拒绝任何含 const 块的源）；② 它**没有**引入回归（负例判词逐字不变）。四件正例未达标的原因**不是**本修复，而是下一道独立墙。
  **〔同日定量：这道墙的语料曝露面（全仓纯静态扫描）〕** 按 "裸 `var 名: 类型`（无初值）" 扫 `src/**/*.cheng`，共 **241,911** 处、分布在 **3,491** 个文件，按零值臂是否覆盖分四类：**序列 `T[]` 69,810 处**（`EmptySeqInit` 臂覆盖 ✓）、**内建标量 60,322 处**（int32/uint32/int64/uint64/bool/str 在臂内 ✓）、**定长数组 `T[N]` 609 处**（如 `var tmp: uint8[frame.FrameCap]`，**必撞墙**）、**其余命名类型 111,100 处**（如 `var t: raster.RasterTarget`；结构体即聚合 ⇒ 撞墙，若只是标量别名则在臂内，需逐个看 TypeArena kind）。⇒ **这不是夹具专属形态**：仅定长数组一类就有 609 处真实语料，加上命名类型中的聚合部分，它很可能是 `forest_appended=234` 的主要墙之一（当然，**是否真炸还取决于该局部是否走精确读路径**，静态扫描给不出这一层，需实测）。本事实已随同派单交给同构扩展那一手。
**直接后果：四件正例验收夹具（`r8_fixed_len_named_const_main` 等）都是 `var s: Slots` + 定长数组字段的形态** ⇒ 它们在覆盖闸被清除后，**很可能改报这条**。若 `kd_r9c` 的夹具跑证实这一点，则它是 `forest_appended=234` 的下一道墙，必须单独定位（不得当成“移植失败”）。

  **〔同日追加：第二个互相独立的未知量——列 0 单行 `const 名 = <限定类型名>` 是否被计数〕** 语料证据：`src/core/tooling/compiler_csg.cheng:149` 起有 **63 条**这种别名（`const TypedExprAbiScalar = texpr.TypedExprAbiScalar`，import 在 `:21`），而该文件**必在 234 源闭包内**（它就是 CSG 编译器本体）。而 metadata 侧的**单行**路径绑不了它：无类型标注，RHS 既不是字面量（`TypedExprLiteralBindingType` 返回空）也不是 bool 表达式，也不是 `new` 调用 ⇒ **不产绑定**。若 parser 把这种别名记成模块级 `ParserDeclarationLocal`（`declarationFunctionRows == -1`），则覆盖闸依然会拒绝 `compiler_csg.cheng` —— **这与"类型根是否存在"是两件事，不能由判别夹具 A 的 N 推出来**。判别夹具 B：`fixtures/r9b_const_parser_count_singleline_alias.cheng`（列 0 单行别名 + 一条无标注字面量基线），`parser=1 ⇒ 别名不被计数（无此问题）`；`parser=2 ⇒ 别名被计数 ⇒ metadata 单行路径必须补绑这种形态`（否则 compiler_csg.cheng 过不了覆盖闸）。两个夹具由 `discriminate_const_count.sh <tag>` 一次跑完并各自给出判读。

  **⑤ 修复（已落树，判据未验）**：`patches/s1b_step3l_global_const_block_bindings.patch` —— 新增 `TypedExprConstBlockEntryBinding`（无标注条目 `Name = literal`，推断阶梯与 parser 侧逐字一致：bool 表达式 → 字面量；推不出类型就不绑，parser 侧同样不产），三个生产点的块判定扩到 `var`+`const`（`const` 条目 `mutable=false`、带 init 文本），`var` 块行为逐字不变。**成立判据**：用含此修复新烤的驱动跑含 const 夹具，`parser-owned global coverage mismatch` 必须消失；**在它消失前，任何“移植失败/通过”的判词都不成立**（夹具根本走不到移植面），`forest_appended=234` 也无从谈起。
**风险**：新增 const-expr 节点种类会进入枚举身份面（历史上有 `enum variant authority invalid` 一类判词），改完必须跑 `patches/check_no_inline_comment_after_or.py` 与全量等价电池；若不想动枚举，退路是**只支持"单个标识符 + 纯字面量算术"并复用现有 `Integer/Add/Sub/Mul/Div/Mod` 节点拼树**（但 C 链注释点名的 `Slot[N*16]` 需要乘，仍要能拼出来）。

**〔2026-09-11 深夜 · 设计改进：可用"parse 期模块常量表"根本绕开新枚举（推荐）〕** 上面那套"延迟求值 + 新 name 节点"是**通用**方案，但代价（新枚举种类进身份面）不必要：C 链的做法本来就是在**类型解析时**查符号表（`symbols_find_const`），而 Cheng parser **自己就是树的持有者**，完全可以在 parse 期维护一张**模块常量表（名 → int32 值）**——与 C 链同构、无需新枚举：
1. **建表**：parser 解析顶层绑定块（`const` 块）条目时，把「名字 → 初始化器求值结果」记进一张表（初始化器求值可复用既有的 `parserTypeSyntaxParseConstMul` 一族，`:26204` 附近已有）。**表的更新点就在绑定块分支**（`parser.cheng:26333-26345` 调 `ParserValueExprProcessBindingEntryRange` 处）。
2. **查表**：在括号分支（`:18695-18703`）里，除整数字面量外，对"单个参数"再做一次**常量表达式求值**（标识符查表 + 字面量算术）——成功且为正 int32 ⇒ 直接产出既有 `FixedArray`（**同步判定，无 `-1`、无延迟机制**）；失败 ⇒ 落泛型应用（与今天相同）。
3. **堵静默退化**：单遍 parser 对**前向引用**（`T[N]` 写在 `const N` 之前）会查不到而落泛型应用——为不重演"静默降级"，在**materialize 阶段补一道校验**：若某 `BracketApply` 的单参数是标识符且**该名字在本源里确是绑定常量**，则**硬失败**（判词建议含 `"fixed array length const must be int32"` 语义，与 C 链 `die` 对齐）；若该名字是类型 ⇒ 放行（泛型应用，合法）。
4. **非 int32 / 非正值**：只要名字命中常量表就必须硬失败（镜像 C 链 `die(...)`），不得回落。
⇒ 这条路线**不动枚举、不动 const-expr 求值器的节点集合**，只在 parser 里加一张表 + 括号分支的一次求值 + materialize 的一次校验，**风险与验证面都显著小于"新 name 节点"方案**；建议优先按它实现。§8.7 上面的通用方案作为"若将来需要跨源/复杂常量表达式"的备选保留。


### 8.8 `ab_fixed` 电池读数（2026-09-11 深夜，preA vs fixed，六夹具）

**【同窗口 A/B（默认门、234 源、串行）——本次会话最干净的一组对照】**
| | **preA**（无 `s1b_step3k`） | **fixed**（有） |
|---|---|---|
| rc | **125（guard 杀）** | **2（语义错）** |
| wall | 357 s | 226 s |
| `forest_parsed_lines` | **234** | **234** |
| `forest_appended_lines` | 0 | 0 |
| `guard_line` | **`rss_limit_exceeded rss_bytes=5,759,095,536`** | **空** |
| `max_csg_rss` | 741,442,664 | 770,999,400 |
**三条结论**：① 两侧门内 pass0 都跑满（234/234）⇒ pass0 内存与 k 无关；② preA 在流式设置段涨到 `5,759,095,536 B`（5.36 GiB）被内门杀，与 `probe1` 的 `5,653,271,256` 同缺陷类（可见性注册 O(N²) churn）⇒ **5.65 GB 这条被同窗口 A/B 确认修掉**；③ fixed 全程零 guard 命中（735.3 MiB < 805,306,368），死在更后面的既有语义缺口 ⇒ **墙从内存移到 ①**，与"① 先修"的排序互证。（fixed 的 max 反高不矛盾：它走得更远、进了循环入口。）


**【同夜最强调度结果：干净驱动在默认门内把 234 源 pass0 跑满，且零 guard 命中】** `gate/fixed.summary.txt`：```
label=fixed driver=kd_fixed gate=default(768MiB) rc=2 wall=226s
lease_hits=0
forest_parsed_lines=234      ← 门内 pass0 全 234 源跑完（流式路径首次）
forest_appended_lines=0
pass1_lines=1
guard_line=                  ← 空：全程无一次 rss_limit_exceeded
max_csg_rss=770999400        ← 735.3 MiB < 门 805,306,368
ps_mine_max_kb=544960
```
**三条结论（与"达标"严格区分）**：① **内存侧在本阶段已不在关键路径上**——门内峰值 `770,999,400 B`（735.3 MiB）< 门 `805,306,368 B` 且 `guard_line=` 为空 ⇒ "5.65 GB 修好 + 插桩撤净"后，**门内 234 源的 pass0 + 列分配 + 进入循环**这一段是通的；这是**流式路径第一次在默认门内把 pass0 跑满**（此前几代死在 pass0 的 src=24/61）。② **当前唯一卡点是 §8.5 的 ①**（`rc=2`、`source_index=0`、`nominal declaration is not visible … LsmrMaxDepth`）⇒ 计划中"① 先修它"的排序**被本次实测确认**，arena 紧容量与削 `U0` 是**后移而非取消**。③ **不等于达标、也不等于整轮装得下**：`forest_appended_lines=0`（循环一个源未消费），而循环内还要叠逐源 parse 瞬时 `U0`（最大 `140,599,840 B`）⇒ 按 §8.6 下界 `src=134` 处 `845,867,256 B`，**修完 ① 后仍很可能在循环里撞门**。**口径**：本条记"门内 pass0 全 234 + 零 guard 命中（同窗口读数，仅同窗口可比）"，不得记为达标。

| 夹具 | A(preA) | B(fixed) | CMP / JUDGEMENT |
|---|---|---|---|
| ordinary_zero_exit_fixture | rc=0 | rc=0 | **IDENTICAL**（sha `0dd3b8e5…`） |
| call_fixture | rc=0 | rc=0 | **IDENTICAL**（sha `63126b4a…`） |
| cold_nested_fmt_interpolation_smoke | rc=2 | rc=2 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL**（同句 `compiler snapshot lowering bridge: immutable Cargo HEAD mismatch`） |
| arena_shapes | rc=2 | rc=2 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL**（同句 `parser type syntax: enum variant trailing syntax invalid`） |
| pair2 | **rc=1** | **rc=2** | NO_ARTIFACT / **DIFFER** |
| closure8 | **rc=1** | **rc=2** | NO_ARTIFACT / **DIFFER** |

- **两条 DIFFER 的成因（不是"补丁不等价"）**：A 侧两条都死在 **`arena array: read out of bounds`（panic, rc=1）**，B 侧均**越过该 panic** 进到结构化错误（`pair2` → `portable TypeArena Symbol join duplicate`；`closure8` → `TypeArena production failed source_index=0: declaration SymbolId is not materialized`）。A 的那个 panic 正是 **`patches/s1b_step3i` 注释里记录的 bug**（preflight 以 `state.typeSyntaxCount` 走到 `value.typeSyntaxParserKinds.len` 之外；注释原话 "capacity=7, len=3, row=3"）⇒ **这两条 DIFFER 是 patch i 消除 OOB 的直接证据**，判词须写"B 越过 A 的 panic、暴露下一层"，**不得写成"补丁不等价"**。
- **等价口径**：`rc` 不同 ⇒ 不等价 ⇒ 本轮等价分子 = **2 条逐字节同 + 2 条 JUDGEMENT=IDENTICAL**；**`NO_ARTIFACT` 不计入分子**（脚本行为正确）。
- **B 侧新暴露的两个下一层卡点**（与 ① 号卡点不是同一条）：`declaration SymbolId is not materialized`（closure8，`source_index=0`，**production 相** ⇒ 该夹具 authority 已过）、`portable TypeArena Symbol join duplicate`（pair2）。
- **【下一层卡点之一：`declaration SymbolId is not materialized` 的机制（2026-09-11 深夜，代码级预诊断）】** `typed_expr_type_arena.cheng:1734-1747`（`ResolveNominal` 目标物化）取的是**全局**声明根（`state.authority.declarationRootTypeSyntaxNodeIndexes[authorityRow]`）再查**全局**数组 `state.symbolByDeclarationRoot[]` 并要求 ≥ 0；而填充它的 `typedExprTypeArenaFillDeclarationSymbols`（`:6748` 起）**只填当前这一源的全局行**（遍历 `0..<tree.typeSyntaxCount`，写 `viewTypeSyntaxBase + row`）。⇒ **只要 authority 把某个 nominal 解析到"别的源"的声明根**（导入回退按 `imports.targetSourceIndexes[importRow]` 取对方源全局根；限定名解析的叶子同理），该根必然是 `-1` ⇒ 逐字得到该判词。**全林路径不会撞**（一次性物化全部源）。**触发面极大**：任何引用别的源里类型的文件都会撞 ⇒ 它大概率是 ① 号卡点之后的下一道墙。**修法按契合度**：(a) **从索引算全局 SymbolId**（索引已有逐源 `declarationSymbolCountBySource`，条目即符号集合；`decl_index entries=1314` 与 `ta_limits declaration_symbols=1314` 同值可佐证）⇒ 无需对方源驻留，最契合逐源设计；(b) 两相 pending 回填（须证封印前全部回填）；(c) 预先物化全部源符号 —— **与 ⑤ 的设计前提冲突，不选**。该修法只改符号取值来源、不动 authority 语义 ⇒ **与 ① 的 parser 侧改动互不冲突，可并行**；`closure8`（8 源）可作最小复现夹具。
- **【下一层卡点之二：`portable TypeArena Symbol join duplicate`（pair2）机制（同日预诊断）】** `compiler_snapshot_builder.cheng:24840-24852`：逐行取 `projection.arenaTypeIds[row]` 对应的 `arenaSymbolId`，若该 `arenaTypeId` 已被别的声明认领（`typeSymbolIdByArenaTypeId[arenaTypeId] >= 0`）**且本行 `expectedSymbolKind != CsgCompilerSymbolField`** ⇒ 报此错。即**该 join 假定 arena TypeId 与声明一一对应，只对 Field 开了共享豁免**（w53 注释）。⇒ 出现该错意味着**两个非 Field 声明映射到了同一个 arena TypeId**——在逐源路径上最可能的成因与上一条同源：跨源解析/物化把不同源的声明错并到同一 TypeId（或符号归属错位）。**两处 B 侧新失败因此很可能是同一结构性缺口（跨源处理）的两个症状**——该合流是**假设**，未证；判别式 = 在 pair2 上打印冲突行的 `declarationRow`、其源、`arenaTypeId` 与两个认领者，看是否跨源。
  **〔再往下走一层（同夜，读代码）：该错误等价于"两个非 Field 声明行共用同一个 arena TypeId"〕** 该 join 的外层是 `compilerSnapshotBuilderPortableTypeSymbolsJoinInto`（`compiler_snapshot_builder.cheng:24696` 起），它遍历 `projectionRow in 0..<projection.declarationRows.len` 并取 `projection.arenaTypeIds[projectionRow]`。而**类型 arena 的 interning 本身是结构性去重的**（`typedExprTypeArenaIntern` 在桶链上按 `typedExprTypeArenaTypeEqual` 命中即返回同一 TypeId）⇒ "两个声明行共用同一 TypeId"有两种可能：(a) **两条同名/重复的投影行**（投影侧 bug）；(b) **两个形状相同但语义不同的具名声明被结构去重塌成同一 TypeId**（interning 键缺声明身份）。w53 注释只给 Field 开了共享豁免，说明设计意图是**具名声明应当各有独立 TypeId** ⇒ (b) 属真缺陷。**判别式（一次打印即可二选一）**：在报错处把两个认领者的**名字**打出来——**名字不同 ⇒ (b) 查 `typedExprTypeArenaIntern` 对具名类型的键是否含声明身份**；**名字相同 ⇒ (a) 查投影为何产生重复行**。
  **〔同日补：v6 那 851 MB 在哪个相上爆的（纯读记录日志，未新烤）〕** 取证于 `.rebuild/s1b_step3/r8/ab_v6.B.stderr.txt`（该轮带 `csg_mem`，`rss=` 就是进程 RSS：首行 `import_edges_resolved rss=5,997,048`）：**CSG 全程的进程 RSS 峰值只有 ≈ 17.5 MB**（最后一个 CSG 埋点 `frontier_store rss=17,515,024`，全表无任何 >700 MB 点）；而 r9 轮 v6 两侧的末尾行都是**后端相**的 `phase=regalloc_ledger_pre`​/`replay_lazy_enter|leave`​（`primary_object_plan.cheng` 的 decl-order-stream 段）才报 `resource_guard` ⇒ **超线发生在后端相，不在解析/消费循环**。直接后果：待落树的 `patches/tree_arena_column_census.patch`（削 pass1 逐源 tree arena，≥ 67 MiB）**不能单独把 v6 压回门内**，不得把它算作 v6 的解。注意区分：**“backend 相报警”不等于“内存是 backend 分配的”**—— 守卫只在特定点检查，此处只能说“峰值不会早于 CSG 结束后的后端阶段被发现”；要定量归因，需在 v6 上带 `CHENG_CSG_MEM_TRACE=1` 跑一次并把后端相也接入同一埋点（后者尚未接线）。
- **【v6 对照已取得（同日更新，同窗口 A/B，取证于 `.rebuild/s1b_step3/r9/ab_r9.txt:14-17`）】** 前条"无有效对照"的状态已结束：`fixture=v6_direct1_repro A_rc=125 B_rc=125`，**两侧都真正跑到守卫并撞线**：A（`kd_fixed`）`rss_bytes=827,704,496`、B（`kd_r9b`，含移植）`rss_bytes=851,510,472`，门 `805,306,368` ⇒ **A 超 22,398,128 B（21.4 MiB）、B 超 46,204,104 B（44.1 MiB）**，判词两侧逐字同（`compile_progress phase=resource_guard status=rss_limit_exceeded`）。三条读法：① 按本战役"判词级等价"口径，这一对是**等价**（同失败类、同判词）而非“缺陷差异”；② **但它同时证明移植对 v6 的内存症状没有任何改善**（B 反而高 23.8 MB，待定级：是移植本身的常驻增量还是同窗口漂移，需同源 A/B 复测）；③ **它取代了目标文本里的模型缺口口径**：“模型缺口 819,036,575 vs 门 805,306,368 = 超 13.1 MiB”是**模型预测**，而这里是**同窗口实测**，且 v6 这一件已经是实测超线 21.4/44.1 MiB ⇒ 达标前必须先把 v6 压回门内（它是四夹具里唯一还没进门的一件）。
- **【v6 这一对记"无有效对照"（2026-09-11 深夜，按第八手实测更正）】** 两驱动**在 CSG 侧走到同一点**：`ab_v6.A` 也到达 `tag=frontier_store round=0 cap_bytes=155274 rss=17,515,024`，**之后**才报 ` compiler snapshot lowering bridge: immutable Cargo HEAD mismatch`（rc=2）；`ab_v6.B` 到达 `frontier_store rss=17,138,192`，随后在**后端相**涨到 `847,070,384` 撞内门（rc=125）。（本席先前写"A 侧未触达被测面"**过头**，按实测更正：A 已走到 `frontier_store`，两侧在 CSG 侧的 rss 基本一致（17.5 vs 17.1 MB），**分歧发生在 A 死掉之后的后端相 ⇒ 该相无 A 侧对照**。）该判词性质是**来源/清单一致性检查**（`compiler_snapshot_lowering_bridge.cheng:2386-2407` 逐字段比 `current.manifest` 与 `cargo` 的 standard/profiles/`profileSetCid`/`schemaCid`/`factsRoot`/`dagRootCid`/`factCount`/`csgcObjectCid`/`partitions.len`），**不是行为差异** ⇒ 按第八手口径记 **"A 侧 provenance 前置未过、无有效对照"，不计入等价分子、也不记成补丁差异**。**另需查**：两驱动烘焙时点不同（`kd_preA` 18:34 / `kd_fixed` 18:38），若内嵌 manifest 源自不同树态，则该差异**与 i/j/k 无关、属 harness 侧烘焙时点差**。**v6 后端相的内存超门（单源 259 token 却到 847 MB，超门 39.8 MiB）是独立的一条病态观测**，最后一个埋点 `primary_object_plan.cheng:71934` `replay_lazy_leave`，**与 CSG/type-arena 那段不是同一段代码**；因 A 侧在同一相之前已死，**该相无对照，归属（既有 vs 新引入）未定**。
  **〔定位精度更正（同夜，逐行核过）〕** 此前"最后一个埋点是 `primary_object_plan.cheng:71934` `replay_lazy_leave`"**过强**——它只是**最后一条 trace**，不等于增长点。逐行核过：① CSG 侧 `frontier_store rss=17,138,192`（`compiler_csg.cheng:38484`）；② 后端**自带完整缓冲区记账 trace**（`lowering_plan.cheng:27702` `lifecycle_*`），v6 B 报 `lifecycle_begin buf=186 bytes=1,076,560 shapeBuf=10 shapeBytes=21,408 callBuf=16 callBytes=896 deferBuf=80 ownBuf=60 denseBuf=13 projBuf=6 arena=1,048,576` ⇒ **被追踪部分仅 ~1.03 MB**；③ `replay_lazy_enter n=4 shapeBuf=0` / `replay_lazy_leave shapeBuf=0`（`primary_object_plan.cheng:71910/71934`）⇒ 该函数退出时 tracked 仍近 0；④ 其后到 guard 触发之间**没有别的 trace**。⇒ 正确表述：**增长在后端、`frontier_store` 之后，≈830 MB 全属未被 lifecycle 记账覆盖的 untracked 内存**，具体分配点**未定位**。**下一步最小探针**：在 `PrimaryObjectPlanReplayLazyIrReleases` 进出、其后各相边界、emit/link 入口各打一条 `os.ProcessRssBytes()`，即可把区间缩到相邻两相之间。
  **〔再收窄（同夜）：增长区间已钉到具体代码段〕** 关键读数是"**哪些 trace 没打出来**"：v6 B 的非 csg 行只有 33 行，`replay_lazy_leave shapeBuf=0`（`primary_object_plan.cheng:71934`）之后**再也没有任何 trace**——而紧随其后的调用方下一个 trace 是 `fill_check_enter`（`:76426`，在 `PrimaryObjectPlanReplayLazyIrReleases` 返回之后）⇒ **guard 是在"`replay_lazy_leave` 打印之后、`fill_check_enter` 之前"触发的**。而 `:71934` **不是该函数的结尾**：其后还有 `if state.emitObjectRootsAllFunctions:`（`:71941`）、`for frontierIndex in 0..<state.frontier.len:`、以及 `while pendingIndex < pendingFunctions.len:` 的 **decl-order-stream** 循环（`:71946` 起，同一函数内还会 `panic(Fmt"primary_object_decl_order_stream invalid_reachability_index=…")`）。⇒ **增长区间 = `PrimaryObjectPlanReplayLazyIrReleases` 内 `replay_lazy_leave` 之后的 decl-order-stream / emit-object-roots 段**（或其返回后到 `fill_check_enter` 之间的极短发语句），**不是"后端一大段"**。**下一步最小探针（一次烤一次跑）**：在 `:71934` 之后立刻打一条 `os.ProcessRssBytes()`，并在 decl-order `while` 循环内每 N 轮打一条，即可二选一定位到具体分配点。
- **【修法 (a) 的可实现形态（同日定稿草案）】** 全局 SymbolId 可由**索引**直接算出，无需对方源驻留：`globalSymbolId = Σ_{s<src} declarationSymbolCountBySource[s] + 该条目在其源内的符号序号`。依据两条**顺序一致**：① 索引条目按行升序登记（`typed_expr_type_arena.cheng:3666-3678` 的 `for typeSyntaxRow in 0..<tree.typeSyntaxCount` + `RootKind == TypeDeclarationRhs` 过滤）；② `FillDeclarationSymbols` 也按行升序发号（`:6756-6759` 的 `for typeSyntaxNodeIndex in 0..<...` + `DeclarationCreatesSymbol` 过滤），且两者都从 `value.symbolCount` 连续累加（`AppendSourceFromTreeInto` 里的 `symbolBase = value.symbolCount`）。⇒ 只要"索引条目集合 == 符号集合"，序号即可由**每源条目基址**得到；建议**纯加一列 `entryBaseBySource`**（与 S1b-0 那 8 列同型、纯加不删）以便 O(1) 取序号。
  **必须同时验一条前提**：`declarationSymbolCount` 用 `DeclarationCreatesSymbol`（= `TypeDeclarationRhs` ∪ 对象/ref-object 字段），而索引只登记 `TypeDeclarationRhs` ⇒ **两者只有在"字段根不产生符号"时才相等**。实测该闭包 `decl_index entries=1314` 与 `ta_limits declaration_symbols=1314` **相等**，与该前提相容；但落地前必须**逐源打印 `declarationSymbolCountBySource[s]` 与索引该源条目数对照**，不相等就不能用这条映射（那说明字段根确实产生符号，序号要另算）。
  **〔前提判定（同夜，静态+实测两路）〕** 上段担心的"字段根是否产生符号"已可判定：`typedExprTypeArenaDeclarationCreatesSymbol`（`:1383-1397`）对字段根用的是**该根自身的节点 kind**——`typedExprTypeArenaAggregateStructuralKind`（`:1366-1380`）读的是 `ParserValueExprTypeSyntaxKindAt(tree, declarationRoot)`，即**字段自己声明的类型**是不是内联 object/ref-object（不是"宿主是不是 object"）⇒ 普通标量/数组字段（如 `depth: int32`、`digits: int32[N]`，其根节点是 FixedArray/BracketApply ⇒ Invalid）都**不**产生符号。实测侧亦吻合：该闭包 `decl_index entries=1314` 与 `ta_limits declaration_symbols=1314` **相等** ⇒ **索引条目集合 == 符号集合**，修法 (a) 的序数映射成立。**但必须加一道 fail-closed 断言**：在 seal 处校验 `Σ declarationSymbolCountBySource == 索引条目总数`，一旦不等（将来有源声明了内联对象字段）就**停下报错而不是错配**；届时再改成"在索引里按条目存 symbol ordinal"这条更强的形态（对每个类型条目记其符号序号，纯加一列）。

### 8.9 未测项（不得当 0 用）
| # | 量 | 状态 |
| 1 | 消费期的逐源瞬时 `T_loop(k)` | **未实测**。按代码路径它 = `U0(k) + 64 KiB`（§8.6 第 1 条，单次定容分配，无 spike），但**没有同窗口读到的在环峰值**；§8.6 用的是"三项下界"而不是实测峰值 |
| 2 | `F` 里 `after_profile_source_payload_release` 段 +149 MB 的持有者 | **未定位**（该段名字含 release，实测却上涨 367,313,760 → 516,506,560） |
| 3 | 234 源闭包的理论内存下界 | **仍不存在**（§⑤-9 不变） |
| 4 | `ArenaUsed(tree.arena)` / tree 各列 `len` 之和 | **未测**（§8.6 第 6 条，决定 parser 侧预留杠杆的收益倍数） |

### 8.10 S1b step-3 r9z：trait premise 墙倒，新墙定位到 bit 级（2026-09-12 01:51）

**取证件**：`.rebuild/s1b_step3/r9/bake_r9z.log`（bake rc=0，driver `kd_r9z` 171,091,648 B，`compile_real_over_theory_percent=1377.910`）、`.rebuild/s1b_step3/r9/fixtures_r9z.txt`。
**补丁**：`patches/object_trait_premise_portable_row_order.patch`，sha256 `f2521edd92993afa212eac6d77377ac69156bcdc817a8dd8364bd08d8bc597ca`，冻结副本 `.rebuild/s1b_step3/r9/patchgen/trait_premise_roworder.frozen.patch`（字节相同；流程为**先冻结带 sha → `git apply` → bake**）。bake lease gate `waits=0`，无并发争用。

**结果一：旧墙消失。** `csg compiler snapshot: object trait premise out of range` 在四个正例上全部不再出现（该墙此前同时挡住 4 个正例 + M-A + `pair2_ord2`）。

**结果二：四个正例统一推进到同一堵新墙。** 逐例（`fixtures_r9z.txt`）：`r8_fixed_len_named_const_main` / `r8_fixed_len_inline_arith_main` / `r9_fixed_len_forward_const_main` / `r9_fixed_len_untyped_const_main` 全部 `compile_rc=2`，末行判词**逐字相同**：
`compiler snapshot lowering bridge: canonical admission blocked missingFactBitmap=5`

**结果三：新墙定位到 bit 级（本轮新增静态结论）**
| 项 | 事实 | 坐标 |
|---|---|---|
| bitmap 语义 | `5 = 1 \| 4` = `CompilerSnapshotAdmissionMissingSourceInterface` \| `…MissingSymbolInterface` | `compiler_snapshot_builder.cheng:26-34` |
| 报错点与判定 | `:4864`；判定在 `:4856-4862`，要求 `missingFactBitmap` **恰等于** `MissingSourceInterface`，且 `missingSourceInterfaceCount == tables.sources.documentCids.len` | `compiler_snapshot_lowering_bridge.cheng` |
| 多余的那一位来源 | `missingSymbolInterfaceCount` 在 `compilerSnapshotProductionAdmissionBuildValidated`（`:9577`）的 `:9658-9661` **无条件**设成 `declarationInterfaceCount + genericInterfaceCount + annotationTargetBindingCount` | `compiler_snapshot_builder.cheng` |
| 推论 | 存在**后置清除路径**本该将其清零（`:11445-11482`、`:11724-11779`、`:12052` 均在动这几个计数器），实测**未生效** ⇒ 墙 = canonical DeclId/SymbolCid 投影未配平，**不是门禁口径问题** | 同上 |

**读法**：桥要求"恰好只缺 source 那一位"是**设计意图**（source CID 由桥自己补），bit 4 属真缺口 ⇒ 只能让符号接口投影真正配平；**不得**放宽桥的等值判定（放宽即假绿），**不得**从文本/名字/行号合成 CID（`:9648-9650` 即此禁令）。

**结果四：阴性对照仍正确。** `r8_fixed_len_non_int32_main expect=FAIL_COMPILE` ⇒ 实测 `parser type syntax: fixed array length const must be int32 name=SlotName`，与预期一致（该夹具本就要求失败）。

**结果五：另一条链未动。** `binary_types_via_import` 仍停在 `typed expr type arena: nominal declaration is not visible … name=T … root_generic_count=0 source_generic_symbols=0`。⇒ 隐式泛型修法落 `parser.cheng`，符号接口修法落 `compiler_snapshot_builder.cheng`，**文件面不重叠，可合炉同一轮烤**。

### 8.11 全森林门禁 r9z：append 首次推进到 2 源，guard_hits=0，**唯一在途阻塞 = 隐式泛型**（2026-09-12 01:56）

**取证件**：`.rebuild/s1b_step3/gate/r9z.summary.txt`、`.rebuild/s1b_step3/gate/r9z.stderr.txt`、`.rebuild/s1b_step3/gate/r9z.progression.tsv`。
**跑法**：`bash .rebuild/s1b_step3/gate_run.sh r9z r9/kd_r9z`（默认 768 MiB 门，驱动 = 含 trait premise 修复的 `kd_r9z`）。wall=220s。

| 读数 | r9g（2026-09-11 21:33，旧驱动） | **r9z（本轮）** |
|---|---|---|
| rc | 1 | 2 |
| `forest_parsed_lines` | 234 | 234 |
| `forest_appended_lines` | **0** | **2** |
| `guard_hits` | 0 | 0 |
| `max_rss` | 767,542,376 | 782,222,464（门 805,306,368，**在门内**） |
| 首崩点 | `forest_parse_begin pass=1 src=0` 后 `arena array: read out of bounds` | `pass=1` append 到 `src=1` 成功后，`src=2` 报判词 |

**本轮首崩判词（逐字）**：
` compiler csg: TypeArena resolution authority failed source_index=2:  typed expr type arena: nominal declaration is not visible producer_source=2 name=T name_not_visible type_syntax_row=1151 root_row=1153 root_generic_count=0 source_generic_symbols=0 name_is_source_generic=0`

**三条读法**：
1. **内存已不是阻塞**：`guard_hits=0` 且 `max_rss` 在门内 ⇒ 当前挡验收线的是**判词**，不是 768 MiB 门。这也是"超过理论内存与编译时间的都按病态处理"里"内存那一半"暂时不需要再动的直接证据（注意：本轮在 `src=2` 就中止，全部 234 源 append 完成后的峰值**仍未被观测**，不得据此宣布内存已达标）。
2. **`forest_appended` 从 0 → 2**：append 相第一次真正跑起来（`src=0` `forest_arena=86,074,184`；`src=1` `forest_arena=86,078,792`），此前历代在 append 之前或第一源就崩。
3. **全森林首墙 == 夹具侧首墙**：与 `binary_types_via_import` 逐字同类（只有 `producer_source` 与 `type_syntax_row/root_row` 坐标不同）⇒ 隐式泛型这一件**同时**是夹具链与验收线的阻塞点。

**失败源已定位（本轮新增）**：`forest src=2 bytes=817253` 与 `src/core/analysis/cleanup_cfg.cheng`（817,253 B）字节数唯一匹配。该源里 `T` 出现四处，形态比规格书举例更全：
| 位置 | 形态 |
|---|---|
| `:1189` | `fn cleanupCfgReserveRows(rows: var T[], capacity: int32) =` —— 参数里 **`var T[]`**（隐式泛型位于**序列/括号应用**内） |
| `:14380-14382` | `@borrows fn cleanupCfgRecordSequenceRelease(values: T[], receipt: var CleanupPlanReleaseReceipt) =` |
| `:14403` | `int64(sizeof(T)),` —— **表达式位**引用 |
| `:14408-14410` | `@borrows fn cleanupCfgReleaseRows(values: T[], receipt: …) =` |

⇒ 对隐式泛型实现新增两条硬要求：① `sizeof(T)` 表达式位是否走同一张 declaration generic symbol 表（同表则签名段补写自动覆盖，**须给出查询函数坐标**；不同表则本补丁不完整）；② `var T[]` 的 `T` 位于**方括号 schema 应用**内、仍在签名表层，**不得被"嵌套括号一律 hard-fail（深度>0）"误杀** —— 该条写错会把正例直接判失败，比现状更糟。

**这是"一次根因合并"的量化依据（本轮新增）**：隐式泛型不是孤例，扫描全树（`grep -rhoE` 于 `src/**/*.cheng`）：
| 形态 | 计数 |
|---|---|
| 签名位含 `T[]` 的**文件数** | **24** |
| 含 `sizeof(T)` 的文件数 | 12 |
| `: T)` / `: T[]` / `var T[]` / `: T,` 出现次数 | 96 / 46 / 43 / 25 |
| 其它单字母隐式泛型 | `V[]` 14、`V)` 6、`N,` 6、`var V)` 5、`var T,` 4、`var T)` 4、`P)` 4、`B)` 4 |

其中 `src/core/lang/parser.cheng`、`src/core/tooling/compiler_snapshot_lowering_bridge.cheng` **自身**就在使用该写法 ⇒ 这不是夹具特例，而是编译器自举源码的普遍依赖。**一个修法同时解锁"夹具链 + 全森林 append 相 + 24 个源文件"**，符合 owner 要求的"按共享根归并、不逐症状补"路径。

### 8.12 M-A 判别实验：`missingFactBitmap=5` 的诊断获**独立验证**，并暴露下一堵墙（2026-09-12 02:05）

**背景**：定位手给出的根因是「义务分母统计**每一条非 Module 的 parser 声明行**（含模块级 `var`/`const` 块条目），而 Symbol 生产者对这类行**一个 symbol 都不产** ⇒ 相减恒余 #(模块级 var/const) ⇒ `==0` 护栏永不成立 ⇒ bit 4（`MissingSymbolInterface`）永不清 ⇒ 桥看到 `1|4=5`」。它同时给出**判别实验**：M-A（零 `const` + 字面量 `int32[8]`）按该诊断**未修复前就应通过桥**；若 M-A 也报 5，则诊断错。

**实测（本轮，`kd_r9z` = 未含该修复的驱动）**：M-A 单源编译 `rc=1`，**未出现** `missingFactBitmap=5`，直接推进到下游另一堵墙：
`ownership body ir production: ingress BodyIR ownership invalid code=11 site=1 index=4 detail=0 fn=0`
取证件 `.rebuild/s1b_step3/r9/disc_ma_prerix_r9z.stderr.txt`（非 csg 行倒数第二条为 `lifecycle_begin buf=54 bytes=1056702 shapeBuf=1 …`）。夹具源按任务生命周期创建并已删除（`src/tests/r9_ma_zero_const_probe.cheng`，跑完即 `rm`）。

**判读**：
1. 判别实验**支持**上述根因（无模块级 const ⇒ 义务与生产者相等 ⇒ 桥放行），bit 4 的成因不再只是推断。
2. 新墙判词点 = `src/core/analysis/ownership_body_ir_production.cheng:1377`（`ingress BodyIR ownership invalid`），**文件面与两个在途补丁都不同**，已另派手静态定位。
3. **注意归因**：M-A 是"零 const"控制组却撞上此墙 ⇒ 它与"模块级 const"无关，属**定长数组字段 / 结构化值**这条线上的下游缺口；四个正例在 bit 4 修好后**预期**也会走到这里（未证，待 r10 实测）。

**已在树**：补丁 `patches/symbol_obligation_domain_global_local.patch`（+30/−4，1 hunk，只动 `compiler_snapshot_builder.cheng`，桥文件零命中），冻结副本 sha256 `914dd5012aa11717e01f3b96af4c577bede6bd19dd53aeefa510eb2e5f1eb045`（与磁盘件逐字节同），`git apply --check` exit 0 后 apply。烤轮 `r10` 进行中。该补丁**未放宽桥的"恰好等于 1"判定**，也未为 globals 伪造任何 CID —— 走的是"把分母收窄到与生产者同域"，模块级 `var`/`const` 的覆盖仍留在 parser-owned global binding 域（该闸本轮已通过才走到桥）。

### 8.13 r11 烤挂 → v2：隐式泛型补丁缺 `@borrows`（2026-09-12 02:2x）

**取证件**：`.rebuild/s1b_step3/r9/bake_r11.log:449-451`、`.rebuild/s1b_step3/r9/fixtures_r11.txt`（全 `rc=127`，因驱动未生成）、`.rebuild/s1b_step3/gate/r11.summary.txt`（`rc=127 wall=0s`，全部计数为 0）。

**失败判词（C 链 `cheng_cold`，逐字）**：
```
cheng_cold: borrowed actual cannot bind non-var non-@borrows formal caller_function_row=4102 callee_function_row=4101 formal_ordinal=0 source_value_def=1 source_type_id=9437362
cheng_cold: borrowed call argument rejected (recovery=1 depth=2)
cheng_cold: reachable function body missing: parser.ParserValueExprInferRoutineImplicitGenericSymbols
cheng_cold: reachable cold function body missing (recovery=0 depth=1)
[cheng_cold] primary object emit failed
```
**读法**：真正根因只有第一条；第二条 `reachable function body missing` 是 recovery 把该函数体整个丢掉的**后果**，不是两个独立缺陷。

**根因**：v1 新增的两个**只读** helper 形参取非 `var` 的 `tree` 却**漏了 `@borrows`** —— `ParserValueExprImplicitGenericCollectTypeRangeInto`、`ParserValueExprImplicitGenericCollectParameterTypesInto`。调用链是 `CollectParameterTypesInto`（其 `tree` 自身是**借用**）把 `tree` 传给 `CollectTypeRangeInto` 的非 var 形参 ⇒ C 链按"borrow 实参不得绑 byval 托管形参"拒绝。同批的 `NameDeclared` 带了 `@borrows`、`AppendImplicitGenericSymbols` 取 `var tree`，二者均正确 ⇒ **唯一缺陷就是这两处漏标注**。

**本仓硬约定（非风格）**：只读访问器一律 `@borrows` + 非 var `tree`（`ParserValueExprTokenKindAt:14199`、`ParserValueExprTokenText:14270`、`ParserValueExprTypeSyntaxKindAt:16030`；`parser.cheng` 内 `@borrows` 共 **636** 处）。总则已在 `lessons.md` §32 与 §243-248（"borrow 实参绑 byval 托管形参一律编译拒绝，修复模式 = `@borrows`(只读) / `var`(可变)"），本条是它在 parser 新增 helper 上的复现。

**修法与产物（未覆盖 v1，保留失败记录）**：
| 项 | 值 |
|---|---|
| v1（失败记录，原样保留） | `patches/implicit_generic_signature_window.patch`，sha256 `aec59e4adee765eb5b88d58d99b5559d4737b3a1e505bd85cbab03d173a3218a` |
| v2（本次） | `patches/implicit_generic_signature_window_v2.patch`，sha256 `4ddaa961f7397b10e5f62d52832ac4c50b2600fa35d06c4c86490c48d8438e45`，+336/−14 |
| v2 冻结副本 | `.rebuild/s1b_step3/r9/patchgen/implicit_generic_v2.frozen.patch`（`cmp` 逐字节同） |
| 改动内容 | 仅在两个 helper 前各加一行 `@borrows`（相对 v1） |

**往返无损验证（关键，防止出"不可自愈的混合树"）**：用**冻结副本**反向 `git apply -R`（先 `--check`）→ 快照 pre 态 `parser.cheng` sha256 = `e86c68642ca10e41d16f4ea8a33382e7befa14a47cbd6f8990c1e6b1ad5e2b52`，**与实现者报告的改前值逐字节一致** → 重新 apply → 加两行 → `git diff --no-index` 生成 v2（`sed` 重写 `a/`、`b/` 路径并删 `index` 行）→ 对当前树 `git apply --check -R` = OK，`-R` 回 pre 后正向 `--check` = OK，再 apply 回后 sha `1481a2d5f162519631b337d028b74e570a5e04492a8de3d0052df33f9c3c3d93`。临时目录 `patchgen_tmp/` 已删。
**注**：本机 `diff` 被 PATH 上的 OpenHarmony 工具链 `diff` 遮蔽、不支持 `-u`（`diff: illegal option -- u`），生成补丁须用 `git diff --no-index`。

**未测**：`r11b`（v2 烤轮）结果 —— fixtures 与全森林门禁均待读数。

### 8.14 r11b 门禁 + 同窗口归因：隐式泛型 v2 清掉森林首墙；守卫触发是**环境漂移**、不归因于补丁（2026-09-12 02:38）

**取证件**：`.rebuild/s1b_step3/gate/r11b.summary.txt`、`r11b.stderr.txt`、`r9z.summary.txt`、`r9z2.summary.txt`、`r9z2.stderr.txt`；`.rebuild/s1b_step3/r9/fixtures_r11b.txt`。

| 轮次 | 驱动 | 时刻 | rc | guard_hits | forest_parsed | forest_appended | max_rss | 守卫读数 | 首崩 |
|---|---|---|---|---|---|---|---|---|---|
| r9z | `kd_r9z`（无隐式泛型） | 01:56 | 2 | **0** | 234 | 2 | 782,222,464 | 未触发 | **判词** `nominal declaration is not visible … name=T` @ src=2 |
| **r11b** | `kd_r11b`（+隐式泛型 v2） | 02:26 | 125 | **1** | 234 | 2 | 794,576,048 | **807,634,120 > 805,306,368** | 内存守卫 |
| r9z2 | `kd_r9z`（**同一驱动重跑**） | 02:38 | 125 | **1** | **134** | **0** | 782,648,424 | **841,745,560 > 805,306,368** | 内存守卫，且更早 |

**结果一：隐式泛型 v2 确实清掉了森林首墙。** r11b 全程**没有**再出现 `nominal declaration is not visible … name=T`（r9z 在 `src=2` 报的那条），森林在 pass=0 解析满 234 源、pass=1 成功 append 2 源后，才在 `src=2` 的解析中撞上内存守卫 ⇒ 判词墙让位于内存。

**结果二：守卫触发不是补丁造成的 —— 同窗口对照直接推翻该归因。** 把**未改动的** `kd_r9z` 在 02:35–02:38 重跑（r9z2）：守卫在 **841,745,560 B** 触发，比 r11b 的 807,634,120 B **更高**，而且更早（只解析了 134/234 源、append 0 源就死了）。⇒ 同一驱动在两个窗口里 `guard_hits` 从 0 变 1、触发点从"未触发"变 841.7 MB，**说明漂移量远大于补丁引入的差异**；按本战役"仅可同窗口相对比较"的口径，**r11b 的守卫触发不得记作隐式泛型补丁的回归**。

**结果三：机器状态取证（本轮新增）**：`uptime` load average **13.91**；`vm_stat` `Pages free=10,637`（×16 KB ≈ **166 MB 空闲**）；RSS 前几名 = ZCodeB 2,450 MB、Chrome 1,003 MB + 313 MB、java 757 MB。⇒ 门口径是驱动自身 `phys_footprint`，而该值在内存压力下会被 OS 抬高（压缩页计入进程），因此**绝对门读数在本机当前状态下不可跨窗口比较**。

**已落工具改进**：`gate_run.sh` 的 summary 块新增三行 `loadavg=` / `free_pages=` / `page_size=`（机器状态随每轮门读数一起入档，避免今后再拿不同窗口的数字互比）。

**未测**：安静环境（低 load、充足空闲页）下的门读数 —— 现有一切"是否进/出门"的绝对判断都受此限制；`r11b` 在 pass=1 只 append 了 2 源，**234 源全部 append 后的峰值仍未被观测**。

### 8.15 r13：隐式泛型**局部注解**补丁生效，`name=T` 墙清掉，链推进到 `name=typedesc`；正对照通过（2026-09-12 03:0x）

**取证件**：`patches/implicit_generic_local_annotation_window_v2.patch`（sha256 `9505fc59c1547c9444cad125f0550ab68c1f07d6c06ab18d289c0c36bc87e385`，+117/−10，只动 `parser.cheng`；冻结副本同 sha）、`.rebuild/s1b_step3/r9/fixtures_r13.txt`、`ctl_ordinary_r13.*`、`disc_ma_trace_r13.stderr.txt`。烤轮 `kd_r13`（driver 171,141,152 B）。

**结果一：`name=T` 清掉，链前进。** `binary_types_via_import` 从 `… producer_source=6 name=T … root_generic_count=0 source_generic_symbols=0` 推进到 `… source_index=10: … name=typedesc name_not_visible producer_source=10 …`。
**失败源已定位**：`source_index=6` 的 2,730 B 源 = **`src/std/result.cheng`**（字节数唯一匹配），其 `fn Ok[T](value: T): Result[T] =` + `var out: Result[T]` 正是"**显式 `[T]` 例程体内的局部注解引用例程泛型**"形态 —— 与补丁触发条件逐字对应。⇒ 隐式泛型**两个写入点（签名 + 局部注解）现已都覆盖**，此形态不再是阻塞。
（更正：本战役早期把该夹具失败源记为 `src/chain/binary_types.cheng`，**错**；`src/chain/*.cheng` 现在无任何独立 `T`，且该夹具森林 src=0/1 是 `binary_types.cheng`/`lsmr_types.cheng` 且 append 成功。）

**结果二：新墙 `typedesc` 与已修的 `ptr` 同族。** 链上上一堵同族墙是 `name=ptr`（已由 `patches/ptr_builtin_type_arena_representation.patch` 修掉并验证）⇒ `typedesc` 属**同一类内建类型表示缺口**，已按"镜像 `ptr` 修法"派手。

**结果三：当前驱动代正对照通过**（补上定位手指出的"代际空格"）：`ctl_ordinary_r13 rc=0`、`exe_sha256=fa77e81617e4aa42741a0d18b382f3834a6d9b41133b61326fca679ec2573348`、`run_rc=0`；末行 `lifecycle_before_after_primary buf=18 bytes=1,049,768 … arena=1,048,576`。⇒ **多槽普通 body 在本代仍正常编译运行**，"驱动整体误编译"与"世代回归"两项均被否证。
（本席上一轮报的 `ctl_ordinary_r12 rc=2 … entry module identity unavailable` 系**我自己的操作错误**：夹具放在 `docs/.../fixtures/` 下、不在源树内，模块身份无法求得；控制件必须从 `src/tests/` 编译。该失败记录作废。）

**结果四：四正例仍停在 BodyIR ingress 墙**（`code=11 site=1 index=4 detail=0`），未变。

### 8.16 BodyIR ingress 墙：全零行指纹 + 追加点 guard（2026-09-12 03:0x）

**读数 A（零代码，`CHENG_PRIMARY_OBJECT_FAIL_TRACE=1`，M-A，取证件 `disc_ma_trace_r13.stderr.txt`）**：
```
phase=node_eval_hit function=main line=8
phase=node_eval_hit function=main line=9
phase=assign_field_fast_entry fn=main line=10
phase=node_eval_miss op=index_get function=main line=10 detail=s4_v-1
phase=node_eval_hit op=if_cond function=main line=11
```
M-A 行号 8/9 是两处 store（`s.values[0] = 7` / `s.values[3] = 9`），10 是读表达式。⇒ **store 全是 hit，miss 在读侧 `index_get`，detail 直指全零行 `s4`**。

**富化 dump 指纹（`kd_r12`，`disc_ma_r12.stderr.txt`）**：`slots=33 ids_ok=31 sealed=1` ⇒ **恰好 2 个坏槽**（`s4`、`s10`），且**整行全零**（`id=0 tk=0 pk=0 mg=0 aux=0 off=0 tid=0 name=""`）——不是"只漏写 id"，而是"**从未被赋值的默认行**"。位置规律：每个 `#nev{N}` 之后、对应 `#fidx{line}#{ops}#esz/#addr` 之前各一个 ⇒ 与每处 `s.values[k] = v` **店的操作数槽**一一对应（取值 `primary_object_plan.cheng:35723`、索引 `:35781`）。四正例同型（slots/ids_ok = 34/32、35/33、34/32、34/32），恒定 2 个空洞。
**已排除**：倍增容量边界（重分配在行 4/8/16，行 10 非任何边界）；孤儿槽族（会带 `name` + `tid=-1`）；census/记账数组（`s5 id=5`、`s11 id=11` 证明 `slotNames` **把空洞算进去了** ⇒ 配对记账与 `LocalSlotNew` 都执行了，唯独元素字节没落进活缓冲）。

**归因口径（本轮修正）**：原立项"定长数组字段路径专有"**收窄为**「**槽数组追加／托管元素落地**，定长数组字段只是**触发面**」；(a) 生产者侧判定不变（`id==index` 在树内 9 处独立确立，放宽即用错身份索引槽表）。

**下一步（已批准的读数 B）**：在 `primary_object_plan.cheng:4447` 的 `add(bodyIR.localSlots, ls)` 之后加**只读回读 guard**，不符即 panic。预登记两支：**在店操作数槽处 abort** ⇒ 丢失发生在追加点；**不 abort 而 ingress 仍见空洞** ⇒ 行是追加**之后**被清零 ⇒ 转 `:44709-44729` 写回处，且与本仓已归档的「全零行／幽灵零槽」族（`cleanup_cfg.cheng:3181-3186` wall69 的"缓冲提前释放、后续分配复用清零"）吻合 —— 该支概率不低，因为**整行全零**正是"内存被清零复用"的指纹，而非"字段没填"（后者通常留残留或 `tid=-1`）。

### 8.17 r14：门内阶梯逐段定量（E2 一次判死 B 段）；BodyIR guard 未 abort ⇒ 转"追加后被清零"支（2026-09-12 03:32）

**取证件**：`.rebuild/s1b_step3/gate/r14.summary.txt`、`r14.stderr.txt`；`.rebuild/s1b_step3/r9/fixtures_r14.txt`、`disc_ma_r14.stderr.txt`。烤轮 `kd_r14`（含 `e2_stage_boundary_probe.patch` sha `c5d49009…` 与 `bodyir_slot_element_store_guard.patch` sha `a3e7b3e7…`）。机器状态：load 6.16、free 26,713 页（比 02:38 那轮的 load 13.9 / 10,637 页安静得多）——**守卫仍触发 ⇒ 内存缺口是真的，不是纯环境噪声**。

**同一次运行内的阶梯（只取相邻差，跨窗口不可比）**：
| 锚点 | rss | 相对上一锚 |
|---|---|---|
| `csg_stage=after_profile_source_payload_release` | 618,922,968 | — |
| `tag=forest_build_done` | 728,056,888 | **+109,133,920**（A 段 = pass0 逐源 parse 残留）|
| `tag=p1_arena_reserved` | 767,231,104 | **+39,174,216**（B1 = 全林 TypeArena 预留）|
| `tag=p1_ctx_index_built` | 795,002,008 | **+27,770,904**（B2 = `TypedExprBuildIndex`）|
| 守卫触发 | **837,141,704** | 门 805,306,368 ⇒ **超 31,835,336 B** |

**结论一（E2 判死 B 段）**：`+66 MB` 不是二选一，**B1 与 B2 两块都在**（39.2 + 27.8 MB）。原"B1 或 B2"的假设作废。
**结论二（守卫触发点）**：触发时正在 pass=1 解析 `src/std/times.cheng`（`parser_mem stage=split_*` 尾行即该源）⇒ pass=1 已推进到 `src/std/` 下的源，远超早期"卡在 src=2"的状态。
**结论三（E1 第一段作废，本席判断失误）**：`CHENG_PARSER_MEM_TRACE=1` 实际只覆盖 `source_exists_*` / `split_*` / `slice_copy_*` 三类 stage（29,445 行），**没有任何 release 相关 stage** ⇒ 它测的是"源文本切分相"，**覆盖不到 `ParserValueExprTreeRelease` 前后**，不能用来判 A 段是否可回收。已批准 E1 第二段（在逐源 release 调用点前后加读数），并预登记三支判读：回吐有效 / arena 归还逻辑占用但未返还 OS / 释放路径未走到 —— **三支修法完全不同**。

**结论四（BodyIR guard 结果）**：`kd_r14` 上 M-A 与四正例**均未打出** `primary slot element store lost`（取证件 `disc_ma_r14.stderr.txt`、`fixtures_r14.txt`：仍是 `slots=33 ids_ok=31` / `34/32` / `35/33`，`s4`/`s10` 整行全零）⇒ 追加点四谓词**全等**，按预登记表**走 B 支**：行是**追加之后**被清零/复用覆盖。已批准第二条回读，但**要求先重新推演**"被零覆盖"与"存在不经过 `:4447` 的预长路径（`setLen` 先长后补 / 整表搬移）"两支的判别式，再选落点 —— 避免盲目按次选支埋点。

**结论五（typedesc 定性与方向纠正）**：定位手证明"纯镜像 `ptr`"**可证伪**（`typedesc[T]` 的父行是 `BracketApply`，标量头无权威行 ⇒ 必死在 `typed_expr_type_arena.cheng:7592`，与 children 个数无关），并给出 C 链权威：`typedesc` 在 C 链被建成 **APPLY 节点**（`cheng_cold.c:78304-78310` → `:78567-78574`，tag 23）。**本席裁定**：真正的根因不是 `typedesc` 一个名字，而是 **Cheng 管线缺了 C 链早已成体系的「内建类型身份域」**（`bootstrap/cold_type_identity_contract.h` 全量枚举，如 `COLD_TYPE_IDENTITY_SET=14`），而 `compiler_snapshot_builder.cheng:13799-13819` 硬要求 `symbolIds[typeId] >= 0`（声明符号域）—— 两套模型的落差才是墙，`typedesc` 只是第一个撞上来的名字（`set[T]` 已被预警紧跟其后）。**逐个名字补 = 逐症状补，已明令禁止**；已改派"整表对表 + 三态覆盖表 + 统一表示选型"。

### 8.18 r17–r19：内建类型构造器（`typedesc` / `set`）两堵墙连续清掉，链推进到 `object field authority invalid`（2026-09-12 04:0x）

**背景**：`binary_types_via_import` 的 `name=T` 墙（§8.15）清掉后链推进到 `name=typedesc`（`source_index=10` = `src/std/system.cheng`，103,363 B，**是该链最后一源**）。

**裁定（本席）**：`typedesc` 与已被预警的 `set[T]` 不是两个孤立缺口，而是 **Cheng 管线缺了 C 链早已成体系的「内建类型身份域」**（`bootstrap/cold_type_identity_contract.h` 全量枚举，如 `COLD_TYPE_IDENTITY_SET=14`）。**逐个名字补 = 逐症状补，明令禁止**；改派"整表对表 + 三态覆盖表 + 统一表示选型"。

**三条链上判词与对应的两个补丁**：
| 判词 | 补丁 | 关键结论 |
|---|---|---|
| `nominal declaration is not visible … name=typedesc` | `patches/builtin_type_constructor_arity.patch`（sha `a96410958432ea1250129a27c9ce03593189b66bab3403dd7776f044ffef1ee7`，5 文件 +226−10） | `typedesc`/`set` 走**内建构造器闭表**（arity 各 1，不符即 hard-fail）；`set` 的 8/8 + `LocalI64Tag` 依据是**仓内** `std/system.cheng:2821` 的 `uint64(s)`；C 链落到 `'i'`（`cold_parser.c:5453`）是**默认值泄漏**，不得当语义；拆掉 `canonical_type_chain.cheng:143` 的"未知 scalarKind 静默返回 `LocalI32Tag`"地雷，改成显式白名单 + panic |
| `bracket apply authority incomplete; exact generic SymbolId or bounded const AST required` | `patches/builtin_type_constructor_bracket_preflight.patch`（sha `87e7efb4693ff911a993520cae7c4a4c5b140ed5259f08828f4d506609d27bd5`，1 文件 +86−1） | 同一错误串有 **preflight（`:2138`，seal 相）与物化（`:7694`）两个孪生**；调用序 `8510 MaterializeBracketConstLengths → 8513 PreflightBracketAuthority → 8516 InternSyntaxRec` 证明 **preflight 严格在前** ⇒ 上一版的物化侧臂根本轮不到。修法沿用文件自己的 `bracketConstLengths` 先例：**append 相（树还在）算一次写进 state 新列 → preflight 读列并照样硬校验**（arity + 实参 CSR 两道），原判词一字未改 |
| **`object field authority invalid`**（新，`kd_r19`） | 待定位（已派手，接 `design/object_field_authority_wall.md` 前次记录） | 判词**不带 `source_index`**；`tag=forest src=` 最后一条是 `src=10` ⇒ 失败在其后的 production 相 |

**方法学收获（值得留痕）**：这一轮两次推进都不是"再猜一个名字"，而是**把 C 链的权威契约整表抄出来与 Cheng 管线对表**（三态表：13 覆盖 / 1 部分=APPLY 的 builtin 头 / 1 缺失=SET / 1 设计性 N/A=RAW_POINTER），再按"只放行集合扩张、不动 `typeCount`/种子行/`symbolCount`/wire 布局"的约束选型 ⇒ **逐位不变是构造性成立**的，而不是事后论证。两次修法都**只增硬失败、不放宽判据**（`typedesc[A,B]`、裸 `typedesc` 一律响亮失败）。

**未测**：`layoutPresent=false` 的运行时后果；builtin 头 Apply 两侧 trait 一致性；闭表仅 2 项；`bytes_view`/`utf8_view`/`f32`/`f64` 4 个缺名**未同轮补**（各需 layout/tag/Send·Sync 裁定，`f32` 无 `LocalF32Tag`，已按"分开报"处理）；234 源森林里的确切序位未测。

### 8.19 r18：BodyIR 空洞归因纠偏 —— 语句 3 是"破坏者"不是"制造者"（2026-09-12 04:0x）

**读数（`kd_r18`，含 `patches/bodyir_slot_element_write_readbacks.patch` sha `c7c6006d493d0cbfcf64568ba8a03689535dcd2ece2c950eda5f9fb9a7ab78d8`）**：M-A 判词 `primary slot identity lost stage=stmt_begin_4 index=4 id=0 tk=0 name= len=28 cap=32` ⇒ **W5（日志恢复）与 W1–W4（元素写）全部未命中**，回退探针在**语句级**命中。

**槽→语句映射（r12 全量 dump + `len=28` 双重锚定）**：stmt0 `var s`→s0–s2｜stmt1 `s.values[0]=7`→**s3–s8（空洞 s4）**｜stmt2 `s.values[3]=9`→**s9–s14（空洞 s10）**｜**stmt3 `s.used=…`→s15–s27（13 个，全部 `id==index`）** ⇒ len 28 ✓｜stmt4/5→s28–s32。
⇒ **两个空洞都在语句 1/2 的槽块里**；而 `stmt_begin_3`（len=15）探针**扫全表未命中** ⇒ s4/s10 当时都是好的。**结论：语句 3 把两条既存行写成了整行零（corruption），不是语句 3 造了自己的洞。** 搜捕方向由此从"语句 3 读路径的制造者"改为"语句 3 期间整批触碰既存行的事件"。

**主怀疑 = 扩容（有算式）**：语句 3 把表 15→28，必然在**索引 16 那次追加触顶**，观测 `stmt_begin_4 cap=32` ⇒ 就是 **16→32**；语句 4/5 加到 33 触发 32→64 ⇒ 最终 `cap=64` ✓。扩容点 = 索引 **4/8/16/32**，**16 落在语句 3**。
**guard 盲区（必须留痕的收窄）**：guard 只回读**刚追加的那一行**，对"**老行**在扩容拷贝里被打坏"完全不可见 ⇒ 原"扩容路径干净"的表述**收窄为**"**新追加行**在扩容后是对的；老行是否在拷贝中受损，本轮未证"。

**已批准的下一读数**：R4a（扩容完整性检查：`add` 前记 `len == cap`，触顶扩容后全表扫 `id != index`，判词带 `appended`/`grown_from`/首个坏行）+ R4b（tripwire 改打印**全部**坏行 `bad=[…]`，回答"两个洞是否同一次触发"）；R4c 留作不命中时的二分。

### 8.20 r20–r28：夹具链连清 7 堵墙；**抬高门后森林首次"全解析 + 并林 13 源"**；森林新阻塞 = 缺 import（2026-09-12 06:0x）

**方法学突破（本轮新增，值得留痕）**：在**默认门**下，全森林长期被 768 MiB 守卫先杀（`guard_hits=1`），**后面的判词墙从未被看到**。用 `CHENG_PROCESS_MAX_RSS_BYTES=1288490188` 跑**诊断轮**（明确不是验收轮）后，森林的判词墙第一次暴露出来 —— 见下表 `*_raised` 行。这条应当成为常规手段：**验收用默认门，排墙用抬高门，两者读数绝不混用**。

| 轮次 | 驱动 | 门 | rc | guard | forest_parsed | forest_appended | 首崩 |
|---|---|---|---|---|---|---|---|
| r25_raised | `kd_r25` | 抬高 | 2 | 0 | **158** | 0 | `parser type syntax: module const scan made no progress` |
| r27_raised | `kd_r27` | 抬高 | 2 | 0 | **234** | **13** | `… nominal declaration is not visible source_index=13 name=Result` |
| r28_raised | `kd_r28` | 抬高 | 2 | 0 | 234 | 13 | 同上（未变，待缺 import 普查落地） |

**r25_raised 那堵墙的根因（本轮定位并已修）**：`forest src=158 bytes=2175393` = `src/core/tooling/compiler_csg.cheng`（字节数唯一）。判词点是 `parser.cheng:26800-26802`（`parserTypeSyntaxModuleConstCollectInto`）的 `if lineEnd <= cursor:` —— 成立链是 `LogicalLineEnd`（`:21588`）以区间首 token 为深度基准、**深度转负即 `return cursor`**（`:21634-21635`）⇒ 游标指向闭括号。实查该文件 `:33266` 写成 `sourceTree.nodeCount))`（**多一个 `)`**），深度 1→0→−1。
**关键归因**：该行在 **worktree 未提交 diff 的新增行**内（`git diff -U0` 第 364 行 `+            sourceTree.nodeCount))`），来自本席 apply 的**内存探针补丁**（`e1_p0_release_probe.patch` 的 `p0_release_before` 调用；兄弟调用 `p0_release_after` 8 实参单 `)` 收尾，函数 `parser.cheng:89-96` 正好 8 形参）。**C 链容忍了这个多余括号（r16–r26 烤机全 rc=0），Cheng 解析器不容忍** ⇒ 该缺陷只在"驱动去解析全森林"时暴露。修法：去掉一个 `)`（`patches/module_const_scan_progress_csg_paren.patch`，sha `ff10fb6d45170ccb7124a0e4a45cb8c1fcfdc613f54c359e316b418e6513c29a`），守卫一字未改（fail-closed 正确）。
**教训（已入常驻规则）**：① 探针补丁也要过"括号/语法"自检，不能只靠 C 链烤过；② `forest_parsed` 从 158 → **234** 就是这一行换来的。

**森林新阻塞（已裁定，普查在飞）**：`source_index=13` = `src/core/backend/codegen_a64_body_units.cheng`（`bytes=11234` 唯一）；`Result` 声明在 `src/std/result.cheng:11`（`bytes=2730` ⇒ **forest src=225，在 13 之后**）。但**根因不是"前向"**：该文件只有 3 条 `import`（全是 `as` 限定名），**没有 `import std/result`**，却在 `:44` 起大量 unqualified 使用 `Result[int32]`；导入边回退**只认 owner==本源且 `allowsUnqualified` 的边、不做传递** ⇒ **名字从 src=13 根本不可达**。
**裁定 (A)：修源，不动管道。** 依据：① 读数①——`src/core/backend/primary_object_plan.cheng:10` 有 `import … codegen_a64_body_units as a64units` ⇒ 该文件在编译器自身的 import 闭包里，**C 链几十轮烤机全 rc=0** ⇒ C 链编它且不报错；② 读数②——C 链是**扁平/按名全局解析**，但**规范 `docs/cheng-formal-spec.md:714-719`（§1.4）逐字**：「首字母大写导出」「**`import` 仅导入导出符号；未导出符号在模块外不可见**」⇒ **`import` 是跨模块名字进入作用域的唯一机制**，C 链的宽松实现不是契约。③ 约定旁证：`src/core`/`src/std`/`src/chain`/`src/runtime` 中代码位用 `Result[` 的 **216 个文件有 200 个显式 import**，未导入的 16 个里多数是**近期 B2/B4/B6 迁移新建的门面**（`codegen_a64_body_units`/`codegen_a64_link_units`/`codegen_contract`/`thunk_synthesis_driver`/`x86_64_body_emit`）⇒ "新文件漏写 import、此前从未被全森林编译抓过"。
**已派手做全量普查**（不只 `Result`）：对 234 源逐个求"代码位跨模块大写名字集合 − 显式 import 的导出集合"，排除注释/字符串/`Fmt` 文本/注解参数/本源自声明名，逐源逐名给出 `文件:行号 名字 → 应导入模块`；**同名多源导出即歧义，停下来报裁**，不许猜。

**夹具链（11 源，与森林并行）本轮连清 7 堵**（全部由分工手逐堵定位+修法+冻结补丁）：名字域×2 → 收据次序 → 泛型应用起源 → Send/Sync 第四份副本 → alias 零成员 → （当前）`typed expr: call surface kind drift at src/chain/binary_types.cheng:92`。
其中两条有普遍价值：① **"同一规则的多份内联副本、域扩大时漏改其一"**（Send/Sync 那条：生产/重算/可移植镜像三处都改了，第四处 `StrictValidateInto` 自己的 `expectedSend/expectedSync` 投影只排除了 `CString` ⇒ `ptr` 与 `typedesc` 各漂一个 bit；修法是收敛成**具名谓词**并用生成器强制残留唯一）；② **判据的存在性要求强于合法域**（`alias member shape drift`：普通别名**合法地**零成员，生产者显式设计如此；修法是删掉那个为假的析取项，并在注释里留下反向纪律"不得加逆命题"）。

### 8.21 BodyIR 槽空洞：trail 把窗口夹进 `Impl`，候选收敛为"缓冲层清零"（2026-09-12 06:0x）

`kd_r24` 的 `trail=` 输出（判词 `stage=find_or_create_enter … bad=1 [4:id=0,tk=0,name=] len=20 cap=32`）：
```
trail=>stmt_begin_0>find_or_create_sized_enter@5704>find_or_create_enter@5651>×2>
      stmt_begin_1>field_assign_enter@35161>eval_node_enter@42005>find_or_create_enter@5651>scalar_text_enter@15560>scalar_text_impl_enter@15607>find_or_create_enter@5651>×4>
      stmt_begin_2>…同构…>
      stmt_begin_3>field_assign_enter@35161>eval_node_enter@42005>eval_node_enter@42005>scalar_text_enter@15560>scalar_text_impl_enter@15607
```
**两条严格结论**：① trail 末尾 = `scalar_text_impl_enter@15607`（**该探针扫全表、此处干净**），而 panic 在**下一个** `find_or_create_enter@5651` ⇒ **坏点窗口 = `ScalarValueSlotForTextImpl`（`:15607-16659`）内、入口到该次调用之间的窄缝**；② 语句 3 是**嵌套 `eval_node_enter@42005` ×2** 后才进文本路径（语句 1/2 是单层 + 中间一次 `find_or_create`），且 `len=20` 是**求值中途**，与"嵌套求值返回/合并"形态相容 —— 但**嵌套支已被 trail 按序排除**（它排在一次干净观测之前）。
**候选重排（有据）**：**⑤ 堆分配复用清零（wall69 族）升为唯一首位** —— 窗口在 `Impl` 内，而 `Impl` **无整行写、无追加**，只有 1 处字段级写（`:16648` `.placeKind`），**字段级写只能改单字段、无法产出整行全零** ⇒ "全行零必来自缓冲层"。③ `setMem(CallArgSlotAddress…)` 降权（调用点全在聚合/ctor/seq 零初始化路径，语句 3 是标量店）、④ 低位；①扩容/②realloc 已由 R4a **实测排除**。
**穷举表缺口（手自曝并更正）**：此前"全文件 `localSlots` 写点穷举"只扫了 `localSlots[i] = …`，**漏了字段级写** `localSlots[i].<field> = …`；更正后为**整行写 5 + 字段级写 33 + 追加 2 + `setLen` 1 + 整表赋值 1（窗口外）**。对判定无影响（字段级写产不出整行零），但"`Impl` 不写槽表"须收窄为"无整行写、无追加，仅 1 处字段级写"。

---

### 8.22 官方树链接被另一条 lane 的未完成探针阻断；改用「副本根」做隔离验证（2026-09-12 10:4x）

**现象**：自 ~10:19 起所有默认烤在链接段死掉，`[cheng_cold] Darwin provider direct ld failed rc=1` → `[cheng_cold] Darwin provider system link failed`（`bake_r56.log` 尾部；`kd_r53`–`kd_r56` 全废）。
**根因**：`src/core/runtime/program_support_backend.cheng:146-155` 新增 `@importc("cheng_debug_retaddr1..5")`，而 C 定义只在 `platform/mobile/ChengHy2TunCore/cheng_mobile_protect_bridge.c:582-604` 且被 `#if defined(__ANDROID__)` 包住 —— darwin 自举链接里没有这个符号。
**为什么默认链接无法补上（已逐层查证，非推测）**：darwin 的 host provider **不是** `bootstrap/host_runtime.c`，而是编译器内嵌的生成源码 —— `bootstrap/cheng_cold.c:109960-110005` 的 `c_source[]`，其上方注释原文即 “Whole-file host_runtime.c is NOT used because it also defines cheng_epoch_time_ms/…”；该生成对象的可导出符号白名单只有 5 个（`bootstrap/cheng_cold.c:91965-91971`）。`cold_find_host_runtime_c_source`（`:109846`）在本版本无调用者。⇒ **不重烤 `cheng_cold_v3` 或不撤销探针，官方树无法链接**；这不是可绕的构建参数问题。
**隔离手段（不改对方 WIP、不改官方树）**：`.rebuild/s1b_step3/r9/scratch_probe_revert/build_scratch_root.py` 建 `.scratch/r57root` —— `src/` 为 APFS clone 副本、其余顶层项符号链接；再用 `patch -p1 -R` 只反向应用**含 `cheng_debug_retaddr` 的 3 个纯新增 hunk**（`@@ -141 …` 12 行、`@@ -6322 …` 74 行、`@@ -6349 …` 38 行，合计 124 行、**删除数为 0**，脚本内硬门校验）。实测结果：探针残留 0 处、该 lane 的 `[d3ledger]` 注册表重构 9 处**原样保留**、与工作树差异恰为 `0 added / 124 removed`。
**口径纪律（防假绿）**：副本根产出的烤件与门读数一律 `class=diagnostic` —— `bake_scratch_r9.sh` 写 `kd_<tag>.SCRATCH_ROOT.txt`（含 root 与反向补丁 sha256），`gate_r9.sh` 新增 `ROOT_OVERRIDE` 并在 summary 打 `class=` / `root=` / `rss_guard_env=` 三行。**副本根的任何读数都不得计入达标**；达标仍必须在官方树默认烤上取。
**副本根自伤的排除（同一小时内的第二段，必记）**：副本根建好后，驱动在**每个**输入上都死在 `os atomic tree: destination open failed`（rc=2），形态像"新驱动坏了"。用 `DYLD_INTERPOSE` 版 `openat` 拦截器（`.rebuild/s1b_step3/r9/openat_trace.c`，普通 `DYLD_INSERT_LIBRARIES` 导出拦不住两级命名空间里绑定到 libSystem 的符号）抓到现场：`openat(dirfd=6, path=".cheng-csg-envelope-5564e1c1…", flags=0x1100100 = O_RDONLY|O_CLOEXEC|O_DIRECTORY|O_NOFOLLOW) → ENOTDIR`，而 `fstatat`（跟随）看到 `st_mode=040700`。即该项在副本根里是**符号链接**（我造的），`O_NOFOLLOW` 只看最后一段 ⇒ ENOTDIR；驱动的该错误不打印路径，所以肉眼不可判。**修法**：副本根构造器改为把 `.cheng-csg-*`（39 项，含 37 个 cargo 目录 + envelope + core）**克隆成真目录**，其余仍符号链接；`src` 仍是克隆。改后金丝雀立即越过该点进入真编译。同类教训已入 `lessons.md`。

**归属待办**：该 lane 二选一 —— 撤销探针（其追查目标即本文已定根的 ORC 双释放），或重烤工具链把符号补进生成 provider 白名单。两条都不由本 lane 代做。

---

### 8.23 r59 真树窗口：并林释放点读数 + detach A/B（2026-09-12 12:0x）

**窗口方法**：真树因对方未完成探针无法链接，故用 `.rebuild/s1b_step3/r9/probe_window_r9.sh` 临时反向该探针（逐字备份 + 还原前哈希守卫），窗口内烤/门，收尾自动还原。本次还原成功：`window_closed probe_restored sha=cdefc13d06fd8328580898227ff970c39b0d4957378b3c72681e3906d2581b11`。
**判活**：真树默认烤 `kd_r59` rc=0（260s），**金丝雀两个程序 compile_rc=0 / run_rc=0** ⇒ rename#2 + E1f v2 透镜 + merge-release 修复在真实内容上成立。
**释放点读数**（`merge_release`，逐源 10 条，`gate/r59_default.stderr.txt`）：`stage=pre` 一律 `lease=0 owner=1 life=1 state_same=1`，`cap` 0.33–33.7 MB、`retained≈cap`；`stage=post` 一律 `state_cap=-1 state_retained=0` ⇒ **逐源解析树 arena 确实被归还**（10/10 源），且共用槽已摘。
**A/B（同一驱动、同一窗口，仅切 `CHENG_MERGE_DETACH_STATE_TREE`）**：
- detach **ON**（默认路径）：`forest_appended=192`、峰值 3.31 GB、rc=2，死于**语义墙** `compiler csg: TypeArena production failed source_index=192: typed expr type arena: declaration TypeId is unavailable`（抬门 3.86 GB 未触发守卫，`guard_hits=0`）。
- detach **OFF**（旧行为）：`forest_appended=0`，src=0 释放后立即 panic `arena: uninitialized`。
- ⇒ 旧代码里 `state.tree` 在 driver 释放 arena 之后仍是**悬垂引用**（`ParserValueExprTreeRelease` 是语义释放，不理会 share 计数），因此这条修复**同时是正确性修复**，不只是省内存。旧轮（r52 等）能跑到 158 只是没在那个窗口踩到该读者。
**X1（G(k)）真身不在树 arena**：同一窗口逐源拆账 —— append 只花 0.0–0.5 MB（E1f 透镜 rss 差），`forest_arena`（TypeArena UsedBytes）全程恒为 90,943,112 B；而**解析相**每源新增 1.5k–62k 个 live 块（中位 ~10k），释放只归还 ~9 块，RSS 每源 +12.66 MB。审计侧的 `Σnodes=1,718,503/234≈7.3k/源` 与 `d_live/node≈1.03` 与此吻合 ⇒ **每解析节点约 1 个未归还块，且不在树的 arena/intern 池里**。r60 已加 `pre_parse/post_rewrite/post_parse` 三级读数以钉死归属（见 §8.24）。
**本窗口逐相**（同窗口相对可比）：`import_edges_resolved` 372.9 MB/886,846 块 → `metadata_contexts_built` 568.8/1,498,764 → `forest_build_done` 641.5/3,284,413 → `p1_arena_reserved` 681.0 → `p1_ctx_index_built` 713.2/3,598,274；`ta_limits tokens=3,632,716 type_syntax=158,375 column_rows=17,863,098 column_bytes=71,452,392`。默认门在本窗口 src=10 即撞守卫（837,256,416 B > 805,306,368）⇒ **基线 713 MB 只给并林留 <92 MB**，达标必须同时压解析期留存与基线。
**另**：`--provider-objects` 补符号被烤炉拒收（`Darwin provider object symbol scan failed`，`cc` 产物多 `LC_BUILD_VERSION/LC_DYSYMTAB`）；镜像根五种组合全部不可行（详见 `lessons.md`）。

---

### 8.24 r60 解析相三点分账 + X1 的定量形式（2026-09-12 12:2x）

**解析相再切三刀**（`merge_stage pre_parse / post_rewrite / post_parse`，真树窗口 r60，同驱动同窗口）：
| 阶段 | 每源 live 块增量（src 0–9） | 判读 |
|---|---|---|
| 快照+改写 | 19–33 | 可忽略 |
| 列 census 拷贝 | 恒定 7 | 可忽略 |
| **树读取** | **495–43,839** | 主项 |
| **三处 append** | **678–18,383** | 次项 |
| 释放 | **恒 −9** | 只归还 arena 那 1 块 + 8 |
**192 源抬门曲线（r60_raised_detach）**：留存与"该源自身的 arena 容量"强相关 —— src=2 `cap=33,687,488 B` ⇒ Δrss 87.0 MB；src=144 `cap=88,800 B` ⇒ Δrss 0.7 MB；src=96 `cap=262,016 B` ⇒ 0.6 MB。**Σcap(192 源)=1,262.4 MB，而 RSS 从 0.71 GB 涨到 3.32 GB = +2,610 MB ≈ 2×Σcap**。
**机制**（已读码）：`parserValueExprReadTreeFromTextMode`（parser.cheng:28838+）每源 `ParserValueExprTreeEnsureActive`（`ArenaInitDefault(8192)`）后按**该源自己的** `arenaReserveBytes` 调 `ArenaReserveCapacity`；逐源尺寸跨三个数量级（88 KB–134 MB）⇒ 分配器无法复用刚归还的块，且上升过程按块翻倍 ⇒ 观测 ≈ 2×Σcap。
**X1 的定量形式（替代"11.65 MB/源"这个黑箱斜率）**：
`G(k) = Σ_{j≤k} [ arena_cap_j × overshoot_j + smallblock_j ]`，其中 `overshoot≈2`、`smallblock` ≈ 每源 1.3 万块 × ~112 B ≈ 1.5 MB（由 `forest_build_done live=3,284,414` 与 `import_edges_resolved live=886,846` 之差 2.4M 块 / Δrss 268.6 MB 反算）。**与 k 无关**（非二次累积）——r60 逐源块数中位数：`d_parse=2,225`、`d_append=1,412`，尾部小源更低。
**在测修复**：整轮统一 reserve 尺寸（取全源最大值，故不可能触发循环内翻倍），令分配器复用同一块；`CHENG_MERGE_FIXED_ARENA_RESERVE=1` 开关 + 同窗口 A/B（r61）。**预测**：Σcap 项消失 ⇒ 192 源 RSS 应从 3.32 GB 降到 ~0.85 GB 量级（基线 0.71 GB + 单块 134 MB + smallblock ~0.3 GB）。
**残留项**：smallblock 泄漏（~1.5 MB/源，234 源 ≈ 350 MB）仍需单独定位：它既不在树 arena（已归还）也不在 intern 池（实测 `retained−cap` 仅 ~99 KB/源），产生于树读取与三处 append 之内。

**实测修复尝试与证伪（r61，同窗口 A/B）**：整轮统一 reserve 尺寸（`CHENG_MERGE_FIXED_ARENA_RESERVE=1`，取全源最大 140,668,736）**无效** —— 峰值 3,443,231,720 B vs 逐源 reserve 3,433,941,992 B（差 0.3%），两臂同在 src=192 撞同一堵墙。⇒ **"分配器尺寸类无法复用导致 churn"这一机制被证伪**（该假设写在本文上一版 §8.24 里，此处更正，勿再据此修）。
**pass0 与 pass1 的直接对照（同一轮日志，零成本）**：pass0 逐源 `forest_parsed` 的 RSS 增量**中位 0.00 MB**（234 源共 +72 MB，live 却 +1.78M 块 ⇒ ~30 B/块，属按设计的索引/普查留存）；pass1 逐源 +13 MB。**同一份解析代码、同一个 `ParserValueExprTreeRelease`，只差 append** ⇒ 异常增量在 **append 相**：r60 分账里 `post_parse→rel_pre` 的 RSS 增量可达 +17.8 MB（src=1，而该源树仅 0.59 MB），释放只吐回 ~0.2 MB ⇒ **append 相"分配后释放但不归还 OS"**（`cheng_memory_pressure_relief` 已确认为真实现 `malloc_zone_pressure_relief`，故不是空桩）。r62 已把 append 相再切 `post_authority / post_ta / pre_append` 三点定位。

### 8.25 r62：X1 指名 —— TypeArena append 独占 87%，系数 641 B/token（2026-09-12 12:5x）

r62 把 append 相再切三点（`post_authority` / `post_ta` / 既有 `pre_append` 透镜），192 源同窗口逐源读数：
| 相 | d_live 中位 | d_rss 中位 | **d_rss 合计（192 源）** |
|---|---|---|---|
| 快照+改写 | 23 | 0.03 MB | ~6 MB |
| 列 census | 7 | 0.00 MB | ~0 MB |
| 树读取 | 2,225 | 0.79 MB | **531 MB** |
| authority append | **0** | 0.00 MB | **1.3 MB** |
| **TypeArena append** | 724 | **4.54 MB** | **2,241 MB（≈87%）** |
| buildIndex append | 697 | 0.16 MB | 127.7 MB |
| 释放 | −9 | −0.59 MB | — |
**系数（r62 抬门轮，n=192）**：`Σ tokens=3,496,076`、`Σ nodes=1,669,036`、`Σ d_rss(TypeArena append)=2,241 MB` ⇒ **641 B/token 或 1,343 B/node**；而 TypeArena 本体是 pin 死的（`ta_stream arena=90,946,332 B` 全程不变，`column_bytes=71,452,392`）。⇒ 这 2.2 GB **不是目标 arena 的常驻**，而是 append 内部的**逐源瞬态分配**：`live` 只涨 724 块/源（≈0.3 MB），RSS 却 +4.54 MB/源 ⇒ **分配后释放但未归还 OS**（`cheng_memory_pressure_relief` 已是真实现，故只能靠"少分配/复用缓冲"来消）。
**旁证**：`merge_release` 里 `intern_count=1`、`intern_payload` 极小 ⇒ 树池里只有**源文本一条**，token 文本按 span 投影（与 `ParserValueExprTree` 头注释一致），因此这 641 B/token 与 intern 无关。
**pass0 对照（同轮日志）**：pass0 逐源 RSS 增量中位 **0.00 MB**（234 源共 +72 MB），pass1 为 +13 MB；两遍用同一个 `ParserValueExprTreeRelease`，差别只在 append ⇒ 与本表独立互证。
**下一步**：在 `typedExprTypeArenaFillFunctions / ReserveAggregatesRec / InternSyntaxRec / MaterializeBracketConstLengths / PreflightBracketAuthority` 一族里找"按 token/行 `add` 增长"的逐源临时表（对照已治好的 U0-cut census 手法：按 pass0 计数 `setLen` 预尺寸，而非逐条 `add`），这是 X1 的落点。

### 8.26 r63：append 内部二分 —— X1 落在 `InternSyntaxRec`（2,071 MB / 93%），且为尖峰式（2026-09-12 13:1x）

在 `TypedExprTypeArenaAppendSourceFromTreeInto` 内插 6 个读数点（`parser.ParserDebugStage`，复用 `CHENG_PARSER_MEM_TRACE=1`，无需给 arena 模块加 import），192 源同窗口逐段：
| 段 | 覆盖的调用 | d_rss 合计（192 源） | d_live 合计 |
|---|---|---|---|
| entry→after_fill | FillTokens/FillTypeSyntax/Functions/BracketArgs/GenericSymbols(+Children) + `state.tree = share(tree)` | 135.4 MB | 373,809 |
| after_fill→after_decl_symbols | IndexFieldsSourceInto + FillDeclarationSymbols | 10.9 MB | 3,228 |
| after_decl_symbols→after_ownership | BuildSyntaxOwnership | 3.6 MB | 0 |
| after_ownership→after_materialize | ReserveAggregatesRec + MaterializeBracketConstLengths/BuiltinConstructorArities + PreflightBracketAuthority | 8.0 MB | 9,434 |
| **after_materialize→after_intern** | **`typedExprTypeArenaInternSyntaxRec`** | **2,070.9 MB（93%）** | 24,197 |
| 合计 | | 2,228.7 MB | — |
**关键形态：不是均匀按 token**。`Σ=2,071 MB`、`Σtokens=3,496,112` 给 592 B/token，但逐源看是**尖峰**：src=4（5,362 token）**0.00 MB**、src=190（987 token）0.00 MB，而 src=1（1,758 token）**17.51 MB**、src=2（87,716 token）63.67 MB；>50 MB 的 7 个源合计 762 MB（37%）。⇒ 触发量与"该源的 token 数"弱相关，更像**按结构/行的事件**：`typedExprTypeArenaIntern` 的去重表增长时整表重建 `bucketHeads`/`bucketNext`（`typed_expr_type_arena.cheng:1290+`，`add` 逐条）、或元组分支的 `completeChildren/completeChildNames` 与 `TupleChildNameId` 池插入（`:7721-7727`）；另有逐行循环体内声明的 `children`/`childNames`（`:7687-7688`，每行重新 `setLen`）。
**下一步（已定坐标）**：在这两条分支上再插读数（去重表增长点 vs 元组/结构分支），把 2,071 MB 归到"表 rehash"还是"逐行临时"；若是 rehash，则按 U0-cut 手法一次性预尺寸（表容量由 pass0 的 `typeSyntax` 总量已知），若是逐行临时，则把 `children`/`childNames` 提到循环外复用。

### 8.27 X1 的代码级落点：类型去重表**每次插入都全量复制两张表**（2026-09-12 13:2x）

`src/core/lang/typed_expr_type_arena.cheng:1482-1491`（`typedExprTypeArenaIntern` 的铸造收尾路径）：
```c
    var bucketNext: int32[]
    for i in 0..<state.bucketNext.len:
        add(bucketNext, state.bucketNext[i])      # 全表复制（add = 倍增增长）
    var bucketHeads: int32[]
    for i in 0..<state.bucketHeads.len:
        add(bucketHeads, state.bucketHeads[i])    # 再全表复制
    add(bucketNext, bucketHeads[bucket])
    bucketHeads[bucket] = typeId
    state.bucketNext = bucketNext
    state.bucketHeads = bucketHeads
```
**每铸造一个新类型**都把整张去重哈希表复制两份再用 `add`（倍增）重建并赋回 ⇒ 单次插入 O(表长) 分配 + 拷贝，全轮 O(铸造数 × 表长)，而表长随全局 `typeCount` 增长。
**与全部观测吻合**：① r63 二分把 2,071 MB（append 的 93%）落在此路径所在的 `InternSyntaxRec`；② 尖峰形态（512 节：src=1 花 17.51 MB、src=4 花 0.00 MB、src=2 花 63.67 MB）—— 代价随**当时表长**而非该源 token 数；③ `d_live` 只 +126 块/源（副本随即被释放，是"分配后释放不归还 OS"）；④ **pass0 完全平坦**（0.00 MB/源）—— pass0 只解析不铸造类型，根本不走这段；⑤ 固定 reserve 无效（与 arena 尺寸无关）✓。
**修法（下一轮，二选一，按仓库 DOD+Arena 纪律优先 A）**：
A. 把去重表搬进 TypeArena：`bucketHeads`/`bucketNext` 改为 `ArenaArrayInt32` 列，容量由 pass0 的 `ta_limits type_syntax/…` 界一次 reserve，插入原地 O(1)，零堆 churn（与 `[U0-cut]` census、pin 后 fail-closed 同族）。
B. 最小改动：只在装载因子越界时几何扩容重建，其余插入原地写 `state.bucketHeads[bucket]`（需先确认语言允许对 state 字段数组做元素写而不触发整表值语义拷贝——现有代码的"先复制后赋回"写法很可能正是绕开该语义，故 B 需实测）。
两条都要过 §10 三道预检 + 金丝雀 + 同窗口 A/B（预期 192 源 RSS 从 3.34 GB 掉到 ~1.2 GB 量级：基线 0.71 GB + 树读取 0.53 GB）。

### 8.28 X1 主项修复落地并同窗口 A/B 定案：192 源 3.33 GB → 1.21 GB（2026-09-12 13:5x）

**修复**（`patches/ta_dedup_table_arena.patch`，+70/−32，预检 PASS）：把类型去重表搬进 pinned arena —— `state.bucketHeads`/`bucketNext` 由堆 `int32[]` 改为 `arenamod.ArenaArrayInt32`，在 `TypedExprTypeArenaAllocateFromLimitsInto` 里按 `TypeRowReserve` 上界一次 `ArenaArrayInt32ReserveEmpty`（桶数 = ≥2×rows 的 2 的幂，链列 = rows+1），插入改为 `ArenaArrayInt32AddReserved` + `ArenaArrayInt32Set` 原地写，两处"每铸造型全表复制"（`typedExprTypeArenaIntern` 铸造路径 + `typedExprTypeArenaReserveAggregate`）全部删除。选 arena 而非"原地改堆数组"的原因：本仓 seq 字段是值语义（既有代码处处"取出→改→赋回"），堆数组无法 O(1) 原地插；arena 列天然引用语义且与 `[U0-cut]`/pin 后 fail-closed 同族。
**同窗口双驱动 A/B**（同一份树、同一个窗口、同一个墙 `declaration TypeId is unavailable @src=192`）：
| 驱动 | 代码 | forest_appended | 峰值 RSS | 默认门(768MiB) 推进到 |
|---|---|---|---|---|
| `kd_r63` | 修前 | 192 | **3,331,509,200 B (3.33 GB)** | src=10 |
| `kd_r64` | 含修复 | 192 | **1,214,465,536 B (1.21 GB)** | **src=61** |
⇒ **−2,117,043,664 B（−63.6%）**，与 r63 二分预测的"去掉 2,070.9 MB"逐字吻合；`live` 块数几乎不变（6.10M vs 6.14M）⇒ 全部是分配 churn 而非留存。
**修复后 X1 的剩余分解（192 源）**：基线 `p1_ctx_index_built` ≈ 0.71 GB + **树读取 0.53 GB（2.77 MB/源）** + buildIndex 0.13 GB + 其余 Fill* 0.16 GB ≈ 1.21 GB ✓ 与实测一致。按 234 源外推 ≈ 0.71 + 234×0.0027 ≈ **1.33 GB**，仍是门（805 MB）的 1.65×⇒ **下一个目标就是树读取那 2.77 MB/源**（与 pass0 平坦形成对照，仍是"分配后释放不归还"族），以及把 0.71 GB 基线压下来。
**产物**：`kd_r64` sha256 `81bbf540d9f19e9bbd2ceced8c64c9a038dbc1ddea94d061021f114ba4b48d59`；金丝雀双 `run_rc=0` 通过；窗口收尾 `window_closed probe_restored sha=cdefc13d…`（对方文件逐字还原）。

**X1b 归属（r64 修复后同轮日志，193 源）**：逐源"解析相 RSS 增量"（`post_rewrite→post_parse`）与该源 arena reserve 对比 —— `Σreserve=1,263.2 MB`、`Σtree_read=712.6 MB`、中位比值 **0.38**（中位 tree_read 0.66 MB、reserve 2.5 MB）⇒ **树读取那 2.77 MB/源就是逐源 arena 的驻留代价**（`ArenaReserveCapacity` 先把块要来，写列时逐页驻留，实际驻留 ≈0.38×容量）。⇒ 下一步修法已明确：**整轮复用一个 arena**（按全源最大 reserve 一次分配，逐源 `ArenaReset`），使驻留集停在"最大单源足迹"（≈0.38×140 MB≈53 MB）而不是逐源累加（712 MB）；这需要给读取器加一个"外部传入 arena"的入口（`ArenaReset` 已在 `arena.cheng:165` 存在，本仓 `typed_expr.cheng:11074` 已有同类复用先例）。

### 8.29 X1b 第一次尝试撞所有权墙（arena 捐赠），已撤销并验证复位（2026-09-12 14:2x）

**做法**：给 `ParserValueExprTree` 加 `arenaBorrowed: bool`，新增 `parserValueExprTreeEnsureActiveOnArena`（与 `EnsureActive` 建树块同字段，但 `tree.arena = donated` 且标 borrowed），三处释放路径按 borrowed 跳过 `ArenaRelease`，并给读取器加两个 OnArena 入口；驱动侧按 `CHENG_MERGE_DONATED_ARENA=1` 捐出一个按全源最大 reserve 分配的 arena、逐源 `ArenaReset` 复用。
**结果：烤不过，且是所有权规则拦下的**。三次迭代：① 先漏 5 个 `parserValueExprReadTreeFromTextMode` 调用点（新签名 8 参，旧调用 6 参）⇒ `unresolved function call`，补齐；② 再撞
`exact identity schema [body-store-freeze] fn=CompilerCsgStreamTypeArenaFromDeclarationIndexInto … managed borrow projection is broken slot=1246 origin=1371 ownership=4 kind=159 copy_kind=1 dst_match=1 source=-1 ownership_valid=0`
⇒ **把"借来的 arena"存进托管字段 `tree.arena` 被规则拒绝**（与 `AGENTS.md` §5"托管值禁止只做位拷贝冒充完成"同源）。
**处置**：用冻结件 `patch -p1 -R -N -i patches/donated_arena_reuse.patch` 整体撤销（残留检查 `X1b-arena=0 / donatedArena|noDonatedArena|arenaBorrowed=0`），并**烤 r66 复位验证**：rc=0（199 s）、金丝雀双 `run_rc=0`、默认门同窗口读数 `guard_hits=1 @src=48 / 822,346,928 B`（与 r64 的 src=61/833.8 MB 同族）。去重表修复未受影响（`X1-dedup` 5 处仍在）。
**下一轮的合法路线（已定）**：不搬 arena，而是**让树自己活着被复用** —— 树终生持有自己的 arena（所有权自洽，无借用入库问题）：驱动在循环外建**一棵**树，逐源调用新增的 `ParserValueExprTreeRewindForReuse(tree)`（`ArenaReset` 保块 + 重建 intern 池 + 归零全部逐源计数 + `active*` 复位为 -1），再走一个**跳过入口处 `if tree != nil: ParserValueExprTreeRelease(tree)`** 的读取入口（现有入口第一句就是释放，故复用必须走新入口；正文与现入口共用同一实现）。这样驻留集上限 = 最大单源足迹（≈0.38×140 MB≈53 MB），而不是逐源累加的 712 MB。

### 8.30 X1b 第二测：pass0 式"不 reserve/不 census"只省 42 MB（−3.4%）（2026-09-12 15:0x）

驱动侧实验臂（`CHENG_MERGE_NO_ARENA_RESERVE=1`：`sourceArenaReserve=0` 且跳过列 census 拷贝，即完全复刻 pass0 的解析方式），同驱动同窗口 A/B（192 源，同一堵墙）：
| 臂 | 峰值 RSS |
|---|---|
| 不 reserve / 不 census | **1,199,474,152 B (1.199 GB)** |
| reserve + census（默认） | **1,241,499,136 B (1.241 GB)** |
⇒ **只省 42 MB（−3.4%）**。结论：`ArenaReserveCapacity` + 201 列 census **不是**树读取那 ~0.53 GB 的主因；那部分是该源解析自身"分配→释放→页面不归还"的 churn（`live` 块数在两臂几乎相同：6,102,332 vs 6,103,490）。因此默认路径保留 reserve+census（它还消掉过 268MB+134MB 的 doubling 瞬态，并有时间收益），实验臂已撤销（`X1b-nocensus=0`）。
**X1b 的定位结论（三条合起来）**：① reserve 精确（与 pass0 实用量比 1.01）；② 尺寸统一无效（§8.28 A/B 差 0.3%）；③ 干脆不要 reserve/census 也只省 3.4% ⇒ **唯一结构性解是"同一块内存跨源复用"**，而它需要一次合法的所有权表达（已知两次否决：把借来的 arena 存进 `tree.arena` = `managed borrow projection is broken`；条件释放托管树 = `conditional managed drop predecessor state is invalid`）。下一手的合法形态：让读取器以**owned 形参接收 arena、并以 `var` 出参交还**（进=move、出=move，全程不出现借用入库），树内存储因此是合法 move；或改为"释放时把 arena 搬出到调用方"（`arenaOut = tree.arena; tree.arena = <zero>` 后再走正常释放）。

**X1b 的下一手（两条，按性价比排序）**：
1. **先打基线（0.71 GB）**：pass0 与 pass1 的解析代码、释放函数完全相同，唯一区别是 pass1 运行时堆上还压着 pinned TypeArena（≈91 MB 在用）+ 声明索引 + metadata contexts 等活对象 ⇒ 释放的 arena 页在碎片化堆里收不回来。基线降下去，同一套分配器的复用率会跟着上来，**可能同时消掉树读取那 0.5 GB**（一次改动、两处收益）。基线的逐相读数已在手（`import_edges_resolved` 372.9 MB / `metadata_contexts_built` 568.8 MB / `forest_build_done` 641.5 MB / `p1_arena_reserved` 681.0 MB / `p1_ctx_index_built` 713.2 MB），X2=`typedMetadataContexts` 151 MB 已指名。
2. 结构化 arena 复用：需要一次"owned 进 / `var` 出"的合法表达（见 §8.30 末），预计还要 1–2 次烤来试所有权形态；在基线未降之前收益会被碎片化吃掉一部分。

### 8.31 基线 0.71 GB 的逐相归因（r68 同窗口，零成本）（2026-09-12 15:1x）

| 相 | RSS (MB) | Δ (MB) | live |
|---|---|---|---|
| `enter` | 143.7 | +143.7 | 43,723 |
| `after_external_package_roots` | 191.5 | +47.9 | 50,787 |
| `after_binding_source_texts` | 239.0 | +46.3 | 54,193 |
| （绑定/排序/模块节点一串小步） | 247.3 | +8.3 | 101,306 |
| **`after_profiles`** | 402.4 | **+155.1** | 880,772 |
| `after_reachable_function_set` | 450.3 | +49.4 | 961,294 |
| **`after_profile_source_payload_release`** | 604.3 | **+154.0** | 1,507,917 |
两个各 ~155 MB 的跳变是基线的全部大头：`enter` 143.7 MB 在模型锚（190 MB）带内；`profiles` 相与模型锚（372–392 MB）一致 ✓。**异常项**：名字写着"释放 profile 源载荷"的相位反而 **+154.0 MB / +627k live 块** ⇒ 该相位要么在释放的同时构造了等量大对象，要么"释放"没生效（与 X1 同族的"释放但未归还/未真正释放"嫌疑）。**下一手**：查 `after_reachable_function_set → after_profile_source_payload_release` 之间那段代码（reachable 集合构建后的载荷释放路径）逐条对账它分配了什么、释放了什么——这是把基线从 0.71 GB 压下来的第一刀，且如 §8.30 所述，基线降下去还可能同时改善 pass1 的 arena 复用率。

**更正（同日复核）**：上表最后一行**不是"释放失效"**。查码后该相位（`compiler_csg.cheng:39485-39546`）依次做：语义声明/导入表 → reachable 表 → 行文本引用计数台账 → **`compilerCsgBuildMetadataContextsRec`（逐 profile 构建并 append `TypedExprSourceContext`）** → 台账清零 + relief → `CompilerCsgPhaseArenaLineStoreReset` → `TypedExprBuildSourceIdentityIndex` → receipt accumulator → `CompilerCsgCompactProfilesForFixedPoint`。所以 +154.0 MB 的主体就是 **X2（metadata contexts，实测 ~151 MB / 645 KB 每源）**，相位名只描述它最后一步动作，不是"释放却在涨"。
**X2 的性质（再更正）**：它**不是泄漏**。`TypedExprSourceContext.lines`（每源行文本）在 typed 层被真实读取（`typed_expr.cheng:14176 / 15511 / 15638 / 15763 / 16019 / 17468 / 17471 / 17541 …`），因此 `CompilerCsgReleaseMetadataContexts` 只能在构建收尾（`compiler_csg.cheng:40140`）调用——这是对的时机，提前释放会打断 typed 层。⇒ **压 X2 只能改行的存储表示**（例如把每行独立 `str` 换成"共享源文本 blob + 偏移"，与 §8.27 去重表同族的"表示层"改法），不是提前释放。

### 8.32 并林首次跑满 234 源（r69/r70）+ 新墙定位到回放顺序（2026-09-12 15:4x）

**修复**（`patches/blocked_row_deferral.patch`，+18/−0，预检 PASS）：`typedExprTypeArenaResolveNominal` 原来只在"声明根超出已追加行范围"时把边延迟；但**已追加却在阻塞集里的行**同样没有 TypeId（它的铸造因自身子行是前向边而被推迟，`state.forwardNominal.blockedFlags` 就是那张行空间位图），那种情形直接判死 = 五轮（r59–r64、r68）稳定停在 src=192 的 `declaration TypeId is unavailable`。改为：**合并期**（`!replayForward`）对这类目标同样走既有前向队列；回放期保持 fail-closed（入队契约是"一行只能入队一次"，回放的清标记发生在成功铸造之后，故回放期不能再入队）。
**结果**：
- `kd_r69`（首版修复）：抬门轮 **`forest_appended=234` / `ta_stream=234` / `pass1_lines=234`** ✓ 首次跑满全量并林；峰值 1,241,744,896 B。新墙：`TypeArena forward replay failed source_index=132: forward nominal enqueue duplicate nominal_row=86861 declaration_root=147799`。
- `kd_r70`（加回放守卫）：**同样 234 源** ✓（可复现）；峰值 **1,224,656,360 B（1.22 GB，比 r64 的 1.21 GB 只差窗口噪声）**；新墙：`forward replay failed source_index=132: declaration TypeId is unavailable`。
**新墙的机制（已读码定位）**：被延迟的依赖指向了**行号更大**的目标（依赖行 86,861 → 目标行 147,799），而回放是**升序单遍**（`compiler_csg.cheng:36159` 的 `while replayCursor < len`）⇒ 目标还没铸造就先轮到依赖 ⇒ 判死。清标记函数 `typedExprTypeArenaForwardNominalClearRow` 确实存在且被调用（`typed_expr_type_arena.cheng:8079`，成功铸造之后），所以**"回放期重新入队"会被 duplicate 判死**（r69 的现象），而 fail-closed（r70）则在排序不满足时判死。
**下一手的合法形态**：把回放做成**有界不动点**——回放遇到"目标仍阻塞"时**跳过该行并保留标记**继续（不改队列、不重复入队），整遍走完后若仍有标记行就再跑一遍；轮次上限（如 8）后仍不解则交给既有的 `TypedExprTypeArenaForwardNominalRequireDrainedInto` fail-closed。这需要 arena 侧给调用方一个"本次被跳过/延迟"的明确信号（而不是 err 字符串），driver 侧把 `replayCursor` 循环包成多遍。
**当前达标线差距（同窗口口径）**：`forest_parsed=234 ✓`、`forest_appended=234 ✓`、`guard_hits=0`（抬门轮）✓，但**默认门峰值 1.22 GB > 805 MB**（默认门实际在 src=48 就撞门），且构建在回放相仍未走完 ⇒ 三判据还差"默认门内 + rc=0"。

### 8.33 X1b 第三测：合法 arena 复用实现成功但**实测更差**；留存被钉为"每 token/node 一块"（2026-09-12 16:1x）

**arena 复用的第三种形态（所有权合法，烤通）**：驱动持有一个 owned arena → 每源 `ParserValueExprTreeEnsureActiveOnArena(tree, arena)` **move 入树** → 用后经新入口 `ParserValueExprTreeReleaseReturningArena(tree, arenaOut, retain)` **move 回驱动**（先把 `tree.arena` 置零再走正常释放 ⇒ 释放不碰存储）。全程无借用入库、无条件释放，唯一需注意的坑：把模块 `var` 当实参直接传会被 `body-store-freeze` 判 `target/formal/value definition mismatch formal=2`，必须经局部变量转一手。补丁 `patches/arena_reuse_moved.patch`（+186/−4，预检 PASS），金丝雀双 `run_rc=0` ✓。
**同驱动同窗口 A/B（234 源）**：
| 臂 | 峰值 RSS |
|---|---|
| arena 复用 ON（整轮一块，容量取全源最大 140,668,736 B） | **1,279,329,768 B (1.28 GB)** |
| 逐源 arena（默认） | **1,228,080,568 B (1.23 GB)** |
⇒ 复用**反而 +51 MB**。至此对 arena 的三条假设全部被实测证伪：① 尺寸统一（差 0.3%）；② 干脆不 reserve/census（−3.4%）；③ 整轮复用一块（+4%）。**arena 页不是那 0.5 GB 的来源**，补丁已撤销（`X1b-reuse=0`）。
**留存的正身（起点到起点口径，r72 默认臂 233 个区间）**：`forest src=k+1` 与 `forest src=k` 的 live 差 **恒为正**，合计 **+2,628,420 块 / 233 源 = 11,281 块/源**；同期 RSS 736.5 → 1,226.6 MB（+490 MB）⇒ **~186 B/块**。与逐源计数拟合：`corr(d_live, tokens)=0.987`、`corr(d_live, nodes)=0.987`，斜率 **0.723 块/token、1.528 块/node**（Σtokens=3,633,507、Σnodes=1,719,875）⇒ 该 490 MB **按 token/node 线性累积**，与源大小无关的固定开销无关。
**已排除的解释**：树内 `str` 列（全仓无 `ArenaArrayStr`）、intern 池（`intern_count=1`/源、payload 仅源文本）、去重表（§8.27 已修）、authority/TypeArena append（§8.25 合计 ~1 MB/源）、buildIndex（697 块/源中位）。**下一手**：在 `parserValueExprReadTreeFromTextMode` 内部插 `live` 采样（沿用 `parser.ParserDebugStage` 免 import 的手法），把"每 token 约 0.72 块"钉到具体列/分支；候选面是逐 token 的 `str` 复制（`ParserOwnedTextRange` 一处调用即 2–3 块）与其持有者。

### 8.34 留存对半分账：读取器 46% / 驱动侧 54%；词法器干净、produce 相是读取器内的主项（2026-09-12 16:4x）

r73 在 `parserValueExprReadTreeFromTextMode` 主体插了 4 个 `live` 采样点（`read_pre_lex / read_post_lex / read_post_consts / read_post_produce`，经同模块的 `ParserDebugStage`，`CHENG_PARSER_MEM_TRACE=1` 开启），620 次解析（234 pass0 + 234 pass1 + 回放）逐段：
| 段 | d_live 合计 | d_rss 合计 | 中位块数 |
|---|---|---|---|
| 词法器 `ParserValueExprLexSource` | 1,240 | 815.7 MB | 2 |
| 模块常量收集 | 298,913 | 12.5 MB | 10 |
| **`ParserValueExprProduceStatementEvents`** | **3,056,336** | 1,910.9 MB | **1,222** |
**只取 pass1 的 234 次**与**起点到起点留存**对比：
- 读取器内新增块：合计 **1,214,095**（中位 1,160/源）
- 起点到起点真留存：合计 **2,627,735**（中位 2,958/源）
⇒ **读取器占 46%，驱动侧（快照/改写/census + 三处 append + 释放路径）占 54%**。词法器逐源仅 ~2 块 ⇒ 它只克隆+内插一次源文本（`intern_count=1` 的由来），逐 token 分配不在词法器。
**已排除（本轮新增）**：arena 增长路径不泄漏 —— `ArenaAllocBytesAligned` 是纯 arena 内 bump，增长走 `arenaRuntimeReallocPhysical` → `cheng_realloc`（真 libc `realloc`，且搬运后正确 `cheng_mem_registry_remove/insert` 重登记）；树内无 `ArenaArrayStr`；`ParsePrimary/ParseExpression` 只有逐节点局部 `int32[]`（作用域末释放）。
**下一手**：读取器内的 produce 相（~1,160 块/源）与驱动侧 appends（~1,800 块/源）分别继续二分；produce 相内已确认分配点稀疏，需在其调用子树（`ParseExpression/ParsePrimary` 及更深层）再插采样。

### 8.35 pass-1 增长的 RSS 分账（闭合）与两条修正（2026-09-12 17:0x）

同一窗口（r73 抬门轮）逐源 8 个采样点的 RSS 增量，234 源求和：
| 相 | d_rss 合计 (MB) | 中位 (MB) |
|---|---|---|
| `forest`→`post_rewrite`（快照+改写） | 45.7 | 0.03 |
| `post_rewrite`→`pre_parse`（列 census） | 0.2 | 0.00 |
| **`pre_parse`→`post_parse`（解析）** | **732.2** | 0.51 |
| `post_parse`→`post_authority`（authority append） | 1.1 | 0.00 |
| **`post_authority`→`post_ta`（TypeArena append）** | **136.5** | 0.24 |
| **`post_ta`→`pre`（buildIndex append）** | **64.4** | 0.16 |
| **`pre`→`post`（释放）** | **−482.1** | −0.44 |
| 各相之和 | **498.2** | |
| 起点到起点（`forest src=0` → `forest src=233`） | **493.4** | |
两处修正：
1. **释放是有效的**：解析相分配 732 MB，同一迭代的释放**吐回 482 MB**（RSS 实测下降，不只是块计数）⇒ 并林增长**不是**"分配后一个都不还"。净留存 493 MB = 解析残差 ~250 + TypeArena append 137 + buildIndex append 64 + 快照改写 46。
2. **块数与字节不可互换**：同一批数据按块数看，解析相占 67%（1,772,627 块）、两个 append 占 32%；按字节看，解析相 732 MB 里 482 MB 被还回，两个 append 反而占 201 MB ⇒ 判读一律以 **RSS 为准**，块数只用于"释放路径有没有走到"。
**下一手（按 RSS 排序）**：① 解析残差 ~250 MB（每源 ~7.6k 块未被释放路径覆盖，且不在树 arena/intern 池/去重表内）；② TypeArena append 137 MB（`typedExprTypeArenaFillFunctions` 一族按**全局** `value.functionCount` sizing 的逐源临时数组，6 个/源、每个 ~70–380 KB，索引按全局行 ⇒ 不能简单改小，需 arena 常驻复用）；③ buildIndex append 64 MB（索引列按设计留存）；④ 快照+改写 46 MB。

**② 的落点已定坐标（下一轮实施）**：`typedExprTypeArenaFillFunctions`（`typed_expr_type_arena.cheng:7221`）每次 append 分配 7 个逐源 scratch 数组，尺寸取**全局** `value.functionCount`（17,460）与 `value.producerSourceCount`（234）：`functionProducerByRow` / `functionSourceLocalByRow` / `functionDeclarationLocalByRow` / `functionOwnerTokenByRow` / `functionSeen`(bool) / `sourceFunctionStarts` / `sourceFunctionCounts` ⇒ 6 次分配/源、单次 ~70–380 KB ⇒ 与实测的 `post_authority→post_ta` 137 MB 同量级。**关键**：目标 TypeArena **已有**同义列 `functionProducerSourceIndexes` / `functionOwnerTokenIndexes`（`:275/:278`，在 `:4476/:4485` 按 `limits.functionCount` 预留 ✓），因此两条修法都可行：① 用目标列 + 逐行 claim 检查替代 scratch（最干净，但要把"同一 function row 只能被一个源认领"的跨源不变量改写成基于目标列的表达）；② 照去重表同法把 7 个 scratch 改为 arena 常驻、逐源复用，并处理 `functionSeen` 的跨源脏值（逐源清理或用 generation 戳）。

### 8.36 ② 落地：`FillFunctions` 逐源 scratch 改 arena 常驻，同窗口 A/B −50.5 MB（2026-09-12 17:4x）

**改动**（`patches/ta_functions_scratch_arena.patch`，+121/−42，预检 PASS）：`typedExprTypeArenaFillFunctions` 每次 append 新建 7 个 scratch 数组（4×`int32[value.functionCount]`、1×`bool[value.functionCount]`、2×`int32[value.producerSourceCount]`，单次 70–380 KB）改为 **TypeArena 常驻列**：`AllocateFromLimitsInto` 经新助手 `typedExprTypeArenaReserveFilledColumn` 按全局界预留并 `AddReserved` 填满（避免 `Add` 的倍增弃块），此后逐行 `ArenaArrayInt32Set/Get`；唯一跨源状态 `functionScratchSeenByRow` 在发射循环里逐行清零。签名 `value: TypedExprTypeArena` → `var`（写回 arena 需要）。
**同窗口双驱动 A/B**（`.rebuild/s1b_step3/r9/ab_two_gates.sh r73 r74`，不重烤，探针窗口自动开合）：
| 臂 | forest_appended | 峰值 RSS |
|---|---|---|
| `kd_r73`（修前） | 234 | **1,435,518,512 B** |
| `kd_r74`（修后） | 234 | **1,385,039,504 B** |
⇒ **−50,479,008 B（−3.5%）**；修复所在相 `post_authority→post_ta` 同窗口 138.1 → 118.9 MB（−19.2），其余差额来自相位边界漂移。两臂均 `guard_hits=0`、`forest_appended=234` ✓。
**累计已验证的内存/并林收益**：① 去重表全表复制 → **−2.12 GB**（192 源 3.33→1.21 GB，§8.28）；② blocked-row 延迟 → 并林 **192→234 源**（§8.32）；③ FillFunctions scratch → **−50 MB**（本节）。**当前**：234/234 并林 ✓、峰值 ~1.36–1.39 GB、门 805 MB ⇒ 仍差 ~0.55 GB（解析残差、buildIndex、基线三块，见 §8.35）。

### 8.37 负结果：field-CSR 搬入 arena 只值 3 MB；相位 RSS 法已到噪声地板（2026-09-12 18:1x）

**改动**（`patches/ta_field_csr_arena.patch`，+27/−16，预检 PASS）：`state.fieldTypeSyntaxNodeIndexes` 的逐源"全表复制 + setLen"（审计 R6 估 ~74 MB）改为 TypeArena 常驻列 `fieldDeclarationRows`（一次填满、逐行 `Set/Get`、append-only 无需复制），读者两处（`BuildObjectDeclaration`/`BuildTupleAliasMembers` 均已持 `localOut`）同步改造。金丝雀 ✓、并林 234/234 ✓、行为等价。
**同窗口 A/B（`ab_two_gates.sh r74 r75`）**：峰值 r74 **1,342,588,512** → r75 **1,417,037,408**（+74 MB）；而修复所在相 `post_authority→post_ta` 只 119.6 → 116.5（**−3.1 MB**）。⇒ 审计的 74 MB 估计**不成立**（那笔复制很小），改动**已撤销**（补丁留档）。
**方法学结论（重要，影响后续所有内存工作的验法）**：234 源抬门峰值在近 11 轮同内容窗口的实测为 **1.199 / 1.224 / 1.228 / 1.238 / 1.239 / 1.279 / 1.342 / 1.356 / 1.385 / 1.417 / 1.435 GB**，跨度 **~240 MB（±10%）**；同窗口 A/B 的**相位和**也会因分配落点漂移而相差 ±150 MB（r74 vs r75 的解析相 +223.7 而 buildIndex 相 −62.8，属同一批分配的相位搬家）。⇒ **低于 ~100 MB 的改动无法用峰值或相位差验证**，只有两种可靠验法：① 同驱动内 **env kill-switch 的 A/B**（如去重表那次 3.33→1.21 GB，≫噪声）；② 换用**按字节归因**的仪器（分配台账 participant / 堆剖析），相位 RSS 法到此为噪声地板。

### 8.38 实验：并林期丢弃 contexts 的 lines —— 语义通过、内存不可测（环境摆动 > 效应），已撤销（2026-09-12 18:4x）

**动机**：`typedMetadataContexts`（234 个 `TypedExprSourceContext`，~645 KB/源、合计 151 MB）在 `metadata_contexts_built` 建好后就一直挂到构建结束；并林 append 不读 `context.lines`，且代码注释自述"后续 function slice 从不可变快照重建 lines，只留 compact 元数据"⇒ 若属实，并林窗口可少 151 MB（≫ §8.37 的噪声地板）。
**实现**（`patches/exp_drop_context_lines.patch`，+12/−0，预检 PASS，`CHENG_MERGE_DROP_CONTEXT_LINES=1` 门控）：`CompactProfilesForFixedPoint` 之后、并林之前，逐 context `lines = []` + relief。
**同驱动同窗口 A/B（r76，234/234 两臂皆达、同一堵墙）**：
| 臂 | 并林末 RSS | 全程峰值 `max_csg_rss` |
|---|---|---|
| A 丢 lines（先跑） | 1,042,056,560 | 1,241,171,432 |
| B 保留（后跑） | **950,306,184** | **1,044,972,936** |
⇒ **方向与预期相反**，且同窗口两臂相差 ~200 MB、第二轮普遍更低 ⇒ **环境摆动（±200 MB）大于待测效应**；峰值反升提示被丢弃的 lines 在后续相（回放/typed）被重建。**处置：撤销实验**（按"禁止假绿"，不可验证的"优化"不留），补丁留档。
**方法学结论（承接 §8.37，本轮加严）**：本机（load ~40、磁盘 95% 占用）上 234 源窗口的**峰值与相位差波动 ±200 MB**，已大于剩余所有单项修复的量级 ⇒ **在本机继续做 <200 MB 的内存修复无法自证**。可行出路：① 只在"同驱动、同窗口、紧邻两跑且先做一轮预热"的条件下取 A/B；② 换按字节归因的仪器（给运行时加 live-bytes 导出或走分配台账 participant）；③ 把验收测量挪到安静环境（届时 §8.37 的 ±10% 会显著收窄）。在拿到这类仪器前，本 lane 不再接受 <200 MB 的内存改动作为"已验证收益"。

### 8.39 安静环境复核（r77）：一致；达标线的算术与下一件仪器（2026-09-12 19:0x）

环境转安静（load 40→6、磁盘 95%→35%）后重烤复核（`kd_r77`，sha `bd43666a…`，金丝雀双过）：
- 抬门：`forest_appended=234` ✓、峰值 **1,241,138,688 B**（与负载期 1.199–1.24 GB 同区间）⇒ 此前的散布不是负载造成的。
- 默认门：`guard_hits=1` @ src=61，守卫行 `rss_bytes=877,708,536 limit_bytes=805,306,368`。
**达标线的算术（把目标写成可执行的不等式）**：并林起点基线（`p1_ctx_index_built`）≈ **713 MB**，并林增长 ≈ **493 MB** ⇒ 峰值 1.24 GB。要在 805,306,368 B 门内跑完 234 源，需 `基线 + 增长 ≤ 805 MB`，即**增长必须从 493 MB 压到 ≤ ~92 MB**（或等量削基线）。⇒ 剩余工作不是"再省几十 MB"，而是**再砍约 400 MB 的并林增量**；按 §8.35 的结构，落点是解析残差（~250 MB，仍未归因）+ 两个 append 的 churn（~200 MB）。
**下一件仪器（下轮首要）**：现有探针在采样前**先调 `os.ProcessMemoryPressureRelief()` 再读 `ProcessRssBytes`**（1 行改动，加在 `compilerCsgMergeReleaseEmit`/`merge_stage` 发射器里）——把"已 free 但未归还"的页先还给 OS，使 RSS 读数接近**活数据**，从而把 §8.37/§8.38 的 ±200 MB 摆动压下去；这是在不碰对方 runtime 文件的前提下能拿到的最接近"按字节归因"的手段。若该项仍不足，则需给运行时加 live-bytes 导出（要动 `program_support_backend.cheng`，须与对方 lane 协调）。

### 8.40 仪器尝试失败：采样前 `ProcessMemoryPressureRelief()` 收不回页（2026-09-12 19:2x）

在三个探针发射器（`merge_stage`、`merge_release` pre/post）读 RSS **之前**加一次 `os.ProcessMemoryPressureRelief()`（`kd_r78`，sha `034abac8…`，金丝雀双过、并林 234/234 ✓），预期把"已 free 未归还"的页先还给 OS、使读数贴近活数据。**结果**：抬门峰值 r78 **1,284,900,376** ≥ r77 **1,241,138,688**（同内容、同为安静窗口）⇒ **没有收回来**。结论：本工作负载的 RSS 里主要就是**活数据**（外加该 API 触及不到的 zone），§8.37 的 ±200 MB 摆动是分配地址/碎片差异的固有属性，不是"未归还页"；`csg_mem` 峰值口径更是完全未受影响（该发射器未加 relief）。⇒ 仪器这条路到此为止：**要么接受"只有 ≥200 MB 的改动可自证"，要么动 `program_support_backend.cheng` 加 live-bytes 导出（需与对方 lane 协调）**。三处 relief 已撤销（补丁重生成、预检 PASS），树回到 §8.39 状态。

### 8.41 回放有界不动点落地：墙从"TypeId 缺失"推进到"队列未排空"，并量出 4 环 + 4,768 未访问（2026-09-12 19:4x）

**实现**（`patches/replay_fixpoint_bound.patch`，+56/−2，预检 PASS）：arena 侧加 `forwardReplaySkipped`/`forwardReplayDeferredCount`；`ResolveNominal` 在回放期遇到"目标行仍被阻塞"不再判死，而是置跳过标志并返回（`typeIdOut=-1`，不重复入队）；`InternSyntaxRec` 消费该标志（留标记、计数、continue）；驱动侧把回放做成**有界不动点**——循环首按源跳过"已全部绑定"的组，循环尾若本轮有跳过则回卷重走（上限 8 轮），超出后由既有的 `RequireDrainedInto` fail-closed。
**结果（kd_r79/r80 一致）**：并林 234/234 ✓；**原墙消失**（不再报 `declaration TypeId is unavailable`）；构建**继续推进**到 `typed_context_lookup_built` ✓。新停在既有排空检查：
`forward nominal queue not drained rows=16129 cleared=11357 first_nominal_row=86861 first_declaration_root=147825 first_producer_source=132`（4,772 行未绑定）。
**逐轮诊断（r80，`replay_pass`）**：`pass=0..7 deferred_this_pass` **恒为 4** ⇒ 同一组 **4 行在每轮都跳过 = 真环**（不是链深不足）；而 4,772 − 4 = **4,768 行虽带标记却从未被回放访问**（既不绑定也不跳过）⇒ 两个独立问题：
1. **4 行成环**：目标行永不铸造 ⇒ 需要判定这 4 行的 kind 与其 declaration root 的性质（很可能是"目标行是聚合/保留行而非被 intern 的行"，即压根不该被延迟）。
2. **4,768 行未被访问**：回放的 `InternSyntaxRec` 走树时对某些 kind 直接 `continue`，不触碰其标记 ⇒ 需要按 kind 分类统计这些行，或让回放显式按队列行驱动（而不是按树走）。
**测得的旁证**：默认门 `max_csg_rss=797,803,672`（迄今最低），但守卫按 footprint 在 `rss_bytes=818,267,408` 处打穿（src=61）⇒ 内存仍差一截，与 §8.39 的算术一致。

### 8.42 排空读数纠正：未绑定的只有 **4 行**（不是 4,768），全是 `Qualified`，构成真环（2026-09-12 20:0x）

给排空检查加了 kind 回读（`patches/replay_fixpoint_bound.patch` 扩到 +78/−5，预检 PASS；`kd_r81` 金丝雀双过、并林 234/234 ✓）：
`forward nominal queue not drained rows=16129 cleared=11357 flagged=4 first_nominal_row=86861 first_declaration_root=147828 first_producer_source=132 samples= [86861:kind=2:root=147828:src=132] [86865:kind=2:root=147836:src=132] [86872:kind=2:root=147828:src=132] [86875:kind=2:root=147836:src=132]`
**纠正 §8.41 的误读**：`cleared=11357` 是"第一个仍未清行在队列中的**位次**"，不是已清计数 ✗ ⇒ **真正未绑定的只有 4 行**（我上一轮据 `rows−cleared` 推断的"4,768 行从未访问"**不成立**，此处更正）。
**这 4 行的性质**：`kind=2` = `ParserTypeSyntaxQualified`（枚举序 `Invalid,Nominal,Qualified,…`，`parser.cheng:426-436`），全部来自源 132，反复延迟于两个声明根 **147828 / 147836** ⇒ **两条目标行永不铸造 = 真环**（每轮恰好这 4 行跳过，与 §8.41 的 `deferred_this_pass=4` 完全一致）。
**现有证据支持的解释**：目标行 147828/147836 在合并期因**子行被延迟**而入队（`ForwardNominalEnqueueInto(..., -1, ...)` 的 blocked-child 路径）；回放期该传播检查已关闭（`!replayForward`），它们本应被铸造并清标记——除非**它们所在的源从未被回放**（而我按"该源是否还有带标记的队列行"决定是否回放 ⇒ 若目标行的标记在、却在队列里对应的是另一源 ✗ 就会漏）。**下一手**：在排空失败时**追加回读目标行本身**（147828/147836 的 kind、flag、是否在队列、其 producer 源），一行探针即可定性。
**旁证（本轮）**：抬门峰值 `max_csg_rss=1,153,009,008`（迄今最低，噪声内）；默认门 `max_csg_rss=777,733,248`、守卫按 footprint 在 `818,693,344` 打穿（src=61）。

### 8.43 目标行回读：不是环，是"源 192 的回放没清掉 Alias 行"（2026-09-12 20:2x）

在排空失败里追加目标行回读（`patches/replay_fixpoint_bound.patch` 扩到 +105/−5，预检 PASS；`kd_r82` 金丝雀双过、并林 234/234 ✓）：
`… flagged=4 … samples= [86861:kind=2:root=147833:src=132] [86865:kind=2:root=147841:src=132] [86872:kind=2:root=147833:src=132] [86875:kind=2:root=147841:src=132] target_row=147833 target_kind=9 target_flagged=0 target_queued=15406 target_queued_source=192 target_queued_root=-1`
**读法**：`kind=9` = `ParserTypeSyntaxAlias`（枚举 `Invalid,Nominal,Qualified,BracketApply,Seq,FixedArray,Tuple,Function,VarBorrow,Alias`）；**目标行自身 `target_flagged=0`（它没被延迟）**，却仍出现在队列里（位次 15406），来自**源 192**、`root=-1`（合并期 blocked-child 路径入队）。
⇒ **推翻"真环"假设**（§8.42 的措辞随之收窄）：依赖方（源 132 的 4 个 `Qualified`）之所以每轮跳过，是因为 `blockedFlags[147833]` **一直没被清**；而清标记发生在"回放成功铸造该行"之后 ⇒ **源 192 的回放没有清掉这个 Alias 行**（既没绑定也没报错）。三个待查点：① 该源是否真的被回放（`replayAnyFlagged` 的分组扫描是否把它纳入）；② Alias 行在 `InternSyntaxRec` 的别名分支里是否走到"写 TypeId + 清标记"；③ 该行是否因 dedup 命中而在清标记之前提前返回。
**当前状态**：默认门 `guard_hits=1` @src=61（footprint `846,267,664`）；抬门 234/234 ✓、峰值 `1,140,245,944`（迄今最低，噪声内）。

### 8.44 按源回放回读：源 220 能清零、源 192 从未被回放；"清/设"时序矛盾待最后一行探针（2026-09-12 20:5x）

在 `TypedExprTypeArenaReplayForwardRowsInto` 里加按源前后计数（`replay_src src=N before=X after=Y`，`patches/replay_fixpoint_bound.patch` 扩到 +123/−5，预检 PASS；`kd_r83` 金丝雀双过、并林 234/234 ✓）：
- 观测到 **`replay_src src=220 before=1 after=0`** ⇒ **回放确实能绑定并清标记**（机制本身有效）。
- 但 **源 192 的 `replay_src` 行从未出现**（emit 条件是 `before > 0`）⇒ 源 192 的分组扫描判定"无带标记行"，**它的源从未被回放**。
- 同轮排空检查却报 `target_row=147836 target_kind=9(Alias) target_flagged=0 target_queued=15406 target_queued_source=192 target_queued_root=-1` ⇒ **目标行在结束时是"已清"**，但四个依赖方（源 132 的 `Qualified`）**每轮仍跳过**（`deferred_this_pass=4` ×8）⇒ 每次跳过时 `blockedFlags[147836]` 读到的却是"已设"。
**⇒ 精确悬案（下轮一行探针即可判）**：在 `ResolveNominal` 的跳过分支里把**当时的目标行号与其 flag** 打出来（连同该轮已处理的源），判定是 ①目标标记在"清后又设"，还是 ②依赖方读的是另一个行号（例如 roots 每次解析漂移），还是 ③分组扫描的行号域与实际被访问的行号域不一致。
**旁证**：本轮抬门峰值 `1,259,144,704`（噪声带内）；默认门 `guard_hits=1` @src=61（footprint `843,744,480`）。

### 8.45 并林→回放→封印三段全通；新墙前移到 typed facts 实参定型（2026-09-12 22:xx）

三刀，全部预检 PASS + 双金丝雀 `run_rc=0`，读数同窗口：

1. **回放推进式重卷**（`patches/replay_progress_fixpoint.patch` + `patches/replay_full_walk.patch`）。r84 探针实测：源 132 的 4 个 `Qualified` 行（`CasSourceFetcher`/`CasLockEnsurer`）目标是源 192 的 `Alias` 行 147838/147846，而这两行**到第 8 轮才绑定**（`replay_bind pass=8`），原硬编码 `replayPass < 8` 恰好差一轮 ⇒ 排空检查永久失败。改为「本轮绑定了 ≥1 个带标记行才重卷」（进展即上界，删魔数）；r85 又暴露第二层：重卷判定写在**按源循环体尾部**，于是每轮只回放一个源（`bound_this_pass` 依次 37/46/444…＝各源自己的标记数，187 轮 ≈ 有标记源数），每次重卷都重解析 ⇒ RSS 1.79 GB。改为**整轮走完队尾才重卷**（`replayCursor >= queue.len`）后：**一轮走完绑定 16125 行**，第二轮到排空，`typed_context_lookup_built` 到达 ✓，末端 RSS 1.12 GB（−670 MB）。
2. **封印 pin 预算**（`patches/seal_pin_budget.patch`）。首轮真正跑到封印（r87 探针，`used` 逐相）：入封 `used=94,066,456 / pinned=94,919,628`（并林预算 99.1% 准确 ✓）；`FillGenericSymbolTypesRec` 0、`FinalizeObjectBases` 0、**泛型特化 0**（113 个新类型复用预留列 ✓）、`BindFunctionReturns` 0；**`RealizeDeclarationsRec` +1,834,784 B**（成员行，三个 builder 各 7 列/行）与 **`BuildDependencyProof` +261,760 B**（4 列/解析行）是唯二超预留的追加 ⇒ 超 pin 1,243,372 B ⇒ arena 翻倍到 189.8 MB（**为装 1.2 MB 花 95 MB RSS**）。按可证上界补进 `TypedExprTypeArenaResidualColumnBytes`：成员行 ≤ `typeSyntaxCount`×7 词（成员行必是某声明的 TypeSyntax 行），依赖行 ≤ `typeSyntaxCount`×(4+2) 词 + `declarationSymbolCount`×2 词。封印通过 ✓。
3. **新墙（非内存项）**：抬门 234/234 跑到 typed facts/typed-IR/observe-verify 段（`r92_ta_post_structured_slice`/`r92_tb_post_observe_verify`，RSS 1.41 GB）后死于
   `typed expr: call declaration static argument type unavailable source=src/chain/lsmr_types.cheng name=Join line=192 scope=PrefixRefText args=[out, IntToStr(prefix.prefixDigits[i])], ""`
   ⇒ `Join([out, IntToStr(prefix.prefixDigits[i])], "")` 的**序列字面量实参**逐元素定型时，`IntToStr(prefix.prefixDigits[i])` 的静态类型取不到（`typed_expr.cheng:29081` 的 `[…]` 臂要求元素同型且全部可定型）。这是实参定型覆盖缺口，与内存无关。

**当前两轴**：正确性轴 = 上述 typed-facts 缺口；内存轴 = 并林净留存（同窗口 `Σd_live=2,628,364 块 / 233 源 = 11,280 块/源`，`Σd_rss=361 MB`；`p1_ctx_index_built` 已 775 MB，默认门 805 MB ⇒ 并林必须近乎零增长）。

### 8.46 G(k) 归因落到 reader：解析相 +1,773,092 块，而树释放只还 2,106 块（2026-09-12 23:xx）

同一窗口（`kd_r88`，`CHENG_MERGE_RELEASE_TRACE=1`，234/234）逐相 `d_live`/`d_rss` 划分（`merge_stage`/`merge_release` 读数，脚本 `.rebuild/s1b_step3/r9/merge_stage_delta.py`）：

| 段 | d_live（块） | d_rss（字节） |
|---|---|---|
| `pre_parse→post_parse`（**reader 解析**） | **+1,773,092** | **+737,510,168** |
| `post_parse→post_authority`（authority） | +899 | +1,474,560 |
| `post_authority→post_ta`（TypeArena append） | +406,873 | +118,947,912 |
| `post_ta→release_pre`（buildIndex append + census） | +444,511 | +36,634,696 |
| `release_pre→release_post`（**释放**） | **−2,106** | −482,460,224 |
| `tail→post_rewrite`（下一源快照/重写） | +3,879 | +39,583,768 |
| 合计（每源净 +11,280 块） | +2,628,364 | +361,398,440 |

- **结论 1（新）**：reader 一段占全部净留存的 **67%**，而 `ParserValueExprTreeRelease`（`parser.cheng:10249`，只 `ArenaRelease(tree.arena)` + `InternPoolRelease(tree.internPool)`）实测**每源只归还 ~9 块** ⇒ reader 每源在**树 arena 之外**新分配 ~7,577 个小块（≈1.4 MB/源，186 B/块）且无人释放。树 arena 是 1 块（72 MB 级别也是 1 块），所以这些块不是 arena 本体。
- **结论 2**：因此 `state.tree = share(tree)` 摘链（`merge_release_readback.patch` 的 `TypedExprTypeArenaBuildStateDetachSourceTree`，默认开）是**必要但远不充分**：摘链后释放段仍只还 2,106 块。G(k) 主项在 reader 内部。
- **结论 3**：`d_live` 与 tokens 强相关（前轮 `corr=0.987`，斜率 0.723 块/token）⇒ 该泄漏是**按 token/节点**的小块，量级 ≈1 块/1.4 token，形态指向逐 token 文本副本一类的小对象列。
- **旁证**：`release_pre→release_post` 的 −482.5 MB 是 `os.ProcessMemoryPressureRelief()` 与释放叠加的 RSS 归还（块数只 −2,106），即"归还的是页不是块"，与 §六③ 的定性一致。
- **门线现状**：`p1_ctx_index_built` = 775,013,528 B（并林起点，默认门 805,306,368 B）⇒ 并林必须≈零增长才能过默认门；当前并林净增 361 MB。

### 8.47 reader 泄漏排除项与下一步探针（2026-09-13 00:xx）

- `ParserValueExprTree`（`parser.cheng:600`）是 `ref object`，存储只有 `arena` + `internPool` 两个 owner 加标量计数 ⇒ **解析相那 7,577 块/源不在树列上**（列全在 arena 内），也不是 arena 本体（arena 只 1 块）。
- 模块级缓存 `parserPackageManifestCacheRoots/Texts`（`parser.cheng:44-45`，写入点 4126-4138）**按 root 去重**（命中即返回）⇒ 每包一条，量级与 234 源无关，**排除**。
- 下一步（数据已备）：`CHENG_PARSER_MEM_TRACE=1` 已对 `kd_r88` 跑抬门轮，日志在 `.rebuild/s1b_step3/r9/gate/r88_parsertrace.stderr.txt`。parser 自带内部分段检查点（lexer / module-const collect / `ParserValueExprProduceStatementEvents` 等，前轮曾在 620 次解析上量到 `ParserValueExprProduceStatementEvents` 3,056,336 块 ≈4,930 块/解析），按 `parser_mem stage=… live=` 逐段求差即可把那 7,577 块/源钉到具体分配点。

### 8.48 固定 arena 预留 A/B：只省 13.4 MB 页，块数一模一样 ⇒ 必须结构性释放（2026-09-13 01:xx）

同一驱动 `kd_r88`、同窗口、背靠背两臂（抬门 234/234，读点相同）：

| 指标 | A 固定预留 ON | B 逐源精确（默认） | B−A |
|---|---|---|---|
| `p1_ctx_index_built` | 735,609,936 | 735,151,232 | −458,704 |
| `ctx_lookup_built` | 1,275,659,776 | 1,276,839,448 | **+1,179,672** |
| `replay_end` | 1,267,271,168 | 1,268,450,840 | +1,179,672 |
| **`merge_d_live`（块）** | **2,628,363** | **2,628,363** | **0** |
| `merge_d_rss` | 454,607,208 | 468,058,472 | **+13,451,264** |

- 固定预留只把并林的 RSS 降 **13.4 MB（2.9%）**，而 **`d_live` 逐块完全相同** ⇒ 逐源 arena 预留策略只影响页行为，**不改变任何留存**；读者那 7,577 块/源是真活块，必须靠"释放"解决，不是分配器调参。（该臂的 13.4 MB 来自 233 个逐源增量的求和，不是单次峰值读数，故方向可信；但量级远不足以解决 361 MB 的缺口。）
- 另：并林段的 `arenaColumnCensus` 构列器（`parser.cheng` 约 27613 起，逐列 `add(out, ArenaArrayInt32Len(...))`）每次调用构建 ~90 项，形态上是逐源小数组；是否留存需用 reader 分段探针判定。
- **下一步（已定性、待执行）**：对 reader 施加分段 `live=` 探针（`.rebuild/s1b_step3/r9/add_reader_step_probe.py` 在位）→ 烤 → 抬门，按段差把那 7,577 块/源钉到具体分配点，然后让该分配随 `ParserValueExprTreeRelease` 释放（或移进 arena）。

### 8.49 reader 分段实测：留存集中在 `ParserValueExprProduceStatementEvents` 且**线性于 token**（2026-09-13 02:xx）

同一抬门轮 `kd_r89`（`CHENG_PARSER_MEM_TRACE=1`，234/234），两种探针同时在场：

**(a) reader 三段（690 次解析，`reader_step_delta.py`）**

| 段 | Σd_live | d_live/次解析 | Σd_rss |
|---|---|---|---|
| `ParserValueExprProduceStatementEvents` | **+3,523,629** | **5,106.7** | +2,106,050,048 |
| `parserTypeSyntaxModuleConstCollectInto` | +336,852 | 488.2 | +12,812,360 |
| `ParserValueExprLexSource` | +1,380 | 2.0 | +966,574,872 |
| tail（封印+释放+下一源） | +4,341,266 | 6,300.8 | −1,855,800,688 |

⇒ 词汇相**只 churn 不留存**（+966 MB RSS / +1,380 块）；留存压在**语句事件产出**这一段。

**(b) 产出内部按 512 token 的成长曲线（13,245 个读数，`produce_bisect_delta.py`）**：合并后的有效区间合计 **+3,432,168 块 / 11,114,288 token = 0.309 块/token**，中位数 **189 块/512 token**、p90 432 ⇒ **线性于 token，不是某个构造成分的突跳**。

**(c) 已排除**：树 arena（`tree.arena` 一个 owner，释放时 `state_retained=0`，且释放只 −9 块）；树结构体（`parser.cheng:600` 起，字段只有 arena/internPool/标量，无任何 `[]` 数组）；模块级 parser 状态（仅 18 个，其中清单缓存按 root 去重；`intern.cheng` 的 `InternPool` 自持四组堆数组，无全局池）；固定 arena 预留（A/B 块数完全相同，§8.48）。
⇒ **待定**：产出段那 ~0.31 块/token 的分配点（分配后无人释放的 owner 既不是树也不是模块全局）。下一步 = 给产出段的主要 helper 调用加边界 marker 逐段求差，或用运行时分配登记（`system.MemLiveAllocations`）的按点分解直接点名分配点。

### 8.50 产出段一分为二：arena 每解析长 3.4 MB（census 欠覆盖）+ arena 外漏 ~1.1 MB 小块（2026-09-13 03:xx）

`patches/reader_arena_probe.patch` 给四个 reader 标记加上 `arena_used=`（`kd_r91`，`CHENG_PARSER_MEM_TRACE=1`，234/234，690 次解析）：

- 产出段合计 **Σd_live = 3,523,654 块**、**Σd_arena_used = 1,970,981,504 B（1.97 GB）**；有量段（579 个）平均 **d_live = 6,072 块 / d_arena = 3,395,303 B**。
- 关键对照：6,072 块 × ~186 B ≈ **1.1 MB ≪ 3.4 MB** ⇒ 那 6,072 块**不是 arena 字节**（arena 是单块 bump，只体现在字节上）⇒ **两个独立缺陷**：
  1. **arena 每解析在产出段涨 3.4 MB** ⇒ `ParserValueExprTreeArenaColumnCensus` **没有覆盖产出段追加的列**，`ArenaArrayInt32Add` 走几何增长分支 ⇒ 每源反复 realloc + 拷贝（B1 同型的拷贝链，只是逐源发生；3.4 MB × 234 ≈ 800 MB 级 churn）⇒ **可修且边界清晰：把产出段列补进 census，令 arena 一次成型**。
  2. **arena 外漏 ~6,072 小块/解析（≈1.1 MB）**，随代码规模线性（两行夹具实测产出段 **+0**，见 §8.51），owner 既非 tree（结构体无数组字段）也非 parser 模块级状态。
- 下一步优先级：先修 (1)（census 覆盖，预检+金丝雀+同窗口 A/B 可直接验 RSS），(2) 改用运行时按分配点归因的手段定位。

### 8.51 回放漏 census ⇒ arena 每解析涨 5.9 MB；补上后降到 0.024 MB（2026-09-13 04:xx）

按 pass 拆开 arena 增长（`kd_r91`，每解析均值）：pass0（**建** census）lex 1,750,212 / produce 4,312,241；pass1（**用** census）lex 49,686 / produce 132,293 ⇒ **census 生效**（lex 35×、produce 33×）。异常在**回放相**：lex 1,706,527 / produce 4,193,515，等于完全没用 census。定位到调用点：并林循环用 `work.typeArenaForestSourceColumnCensus` 填 `sourceColumnCensus`，而回放相只声明了 `var replayColumnCensus: int32[]` **从未填充**，reader 收到空 census ⇒ 每列几何增长。222 次回放解析 × 5.9 MB ≈ **1.3 GB 的 realloc/拷贝 churn**。

修复 `patches/replay_column_census.patch`（+21/−0，预检 PASS，金丝雀双 `run_rc=0`）——回放相按同一 slice 填 census。同一结构指标复核（`kd_r92`）：

| 相 | 指标 | 修前 r91 | 修后 r92 |
|---|---|---|---|
| 回放 | lex arena/解析 | 1,706,527 | **994** |
| 回放 | produce arena/解析 | 4,193,515 | **22,894** |
| 回放 | produce live/解析 | 5,312 | 5,312（**未变**，缺陷 2 仍在） |

峰值（不同窗口，仅指示）：默认门 `max_csg_rss` 822,445,256 → **787,825,744（−34.6 MB）**；抬门 1,411,548,816 → **1,392,117,320（−19.4 MB）**；抬门仍到同一正确性墙（`lsmr_types.cheng:192`），无回归。
**未解决**：arena 外那 5,312 块/解析（≈1 MB/源）的分配点仍待归因。

### 8.52 泄漏 owner 的排除面已覆盖到全编译器模块级状态（2026-09-13 05:xx）

- 全 `src/core/**` 的模块级数组状态只有三处，**均不在解析路径**：`csg_core/merkle_store.cheng:5923-5944`（claim slot 账）、`runtime/web_scene_media_block_cache.cheng:184-187`、`runtime/web_worker_runtime.cheng:18`。加上 §8.49 的 parser 18 个与 `intern.cheng` 无全局池 ⇒ **模块级缓存全部排除**。
- `live` 口径确认为**真实堆块**，不是 arena 子分配：并林一次完整 append（~1,449 节点 / 3,063 token，写 ~200 列）实测只 +418 块（`forest_parse_begin → forest_appended`），与列追加数不成比例 ⇒ `live` 不计数 arena 内部 bump。
- ⇒ 产出段 4,720–5,312 块/解析（≈0.9 MB/源）是真实现存；468 次解析合计 ≈412 MB，与并林 RSS 净增 ~361 MB 同量级 ⇒ **这就是 G(k) 剩下的主项**。owner 既非 tree/parser/跨模块全局/arena/intern 池，下一步只能按 helper 边界在产出段内部逐步夹逼，或对运行时分配登记做按点归因。

### 8.53 产出段 live 增长与 arena 增长**互相独立**；下一定点：直接读源树 intern 池计数（2026-09-13 06:xx）

- 逐语句的两个 loop-head helper（`ParserValueExprLogicalLineEnd`、`ParserValueExprExtendIndentedValueRange`）**零分配**（无 `add/new/setLen/Fmt`）⇒ 不是它们。
- 关键对照（§8.51 同表）：pass0（**无** census，arena 大长）produce_live = 5,298；pass1（**有** census，arena 几乎不长）produce_live = 4,719；回放 = 5,312 ⇒ **live 增长与 arena 增长无关**（census 生效后 arena 增长降到 1/33，live 几乎不变）⇒ 也排除"ArenaArray Add 逐次登记块"这一族解释。
- ⇒ 产出段 ~4,700 块/解析是**独立的逐节点/逐 token 堆分配**；已排除 tree（无数组字段）、parser 与全编译器模块级状态、arena、跨模块缓存。
- **下一定点（单行探针即可判）**：在 `read_post_produce` 处同时打印 **源树自己的** `langintern.InternPoolCount(tree.internPool)` 与 `InternPoolLogicalPayloadBytes`。`merge_release stage=pre` 的 `intern_count=1 intern_payload=21133` 是**状态树**读数，而产出段很可能向**源树**池里塞入逐 token 文本（每 token 一个 `str` 块 ≈ 0.9 MB/源、线性于 token，与本段实测形态一致）。

### 8.54 源树 intern 池排除；下一嫌疑锁定 Cas/网络侧模块级状态（2026-09-13 07:xx）

`patches/produce_pool_probe.patch`（+1/−1，预检 PASS，金丝雀双 `run_rc=0`）在 `read_post_produce` 直接读**源树自己**的池：690 次解析全部 `intern=1`，`payload` 等于该源文本字节（817,253 / 263,042 / 373,101 …）⇒ **源树池只有源文本一条，interning 彻底排除**（§8.53 的假设被证伪）。

⇒ 剩余 ~4,700 块/解析的排除面：tree（无数组字段）／tree.arena／tree.internPool／parser 模块级 18 个／全 `src/core/**` 模块级数组（三处，均不在解析路径）／逐语句 loop-head helper（零分配）／census（生效后 arena 增长降 33× 而 live 不变）。
**下一嫌疑（未验证）**：解析路径经 `parserCasFetcherImpl` / `parserCasLockEnsurerImpl`（parser 模块级对象，逐解析安装）触达 **Cas/网络侧模块**——`compiler_world_libp2p_network.cheng`、`cas_fetch_subprocess.cheng` 都引用 `CasSourceFetcher`，其中前者的模块级状态尚未点数；且并林期失败样本正是 `CasSourceFetcher`/`CasLockEnsurer` 两个名字。下一步：点数这些模块的模块级状态并给它们的调用点加 `live=` 边界。

### 8.55 泄漏形态定量：~100 块/解析固定 + ~1.5 块/token；Cas 侧静态排除（2026-09-13 08:xx）

- 两行夹具实测每解析固定 **+100 块**；真实源（~3,063 token）产出段 **+4,700 块** ⇒ 扣掉固定项后 **≈1.5 块/token**，形态是"每 token 2–3 个小对象"（`str` 级）。
- 真实性复核：并林 pass1 解析段 d_live **+7,577 块（≈0.9 MB）** vs d_rss **+3.2 MB/源** ⇒ RSS 增量为块增量的 3.5 倍，符合"真实现存 + 已释放未归还页"，不是纯计数伪影。
- Cas 侧静态检查：`compiler_world_libp2p_network.cheng` 模块级 var = **0**；`CasSourceFetcher` 只是注释里引用的 `cas_store` 别名（`src/core` 下无 `cas_store.cheng`）⇒ 该嫌疑暂搁置。
- 下一步（唯一还能量化的手段）：在产出段按 helper 调用边界夹逼（`parserForwardingStatementCoreArm` / `ParserValueExprAppendRegion` / `parserForwardingTopLevelBegin|Finish` 等），一次烤即可看出增长落在哪个括号内；若所有括号均摊，则结论指向运行时分配登记层而非业务代码。

### 8.56 归因工具换成运行时分配账本；并识别出"减少解析次数"这条 ~200 MB 结构杠杆（2026-09-13 09:xx）

- 运行时**有分配账本**：`std/system.cheng:990 RuntimeAllocationLedgerSupported()`、`:1306 RuntimeAllocationLedgerBegin`、`:1327 SessionOwnerBegin`、`runtimeAllocationLedgerSnapshotBridge` 等，且已在 `compiler_main.cheng` / `csg_core/cli.cheng` / `production_launcher.cheng` 等处接线 ⇒ 这是**按 owner/按次**归因留存的现成仪器，优于继续用 marker 夹逼。
- 但驱动 `compiler_csg.cheng` **没有**账本开关（现有 `CompilerCsgStagingCapacityLedger` 是另一回事；全仓无 `CHENG_*LEDGER` 环境门）⇒ 下一步在诊断路径里接一次账本会话（begin → 跑到并林 → snapshot → 报 owner），即可直接点名那 ~0.9 MB/源 的持有者。
- **结构杠杆**：本轮解析次数 = 234（pass0 建 census）+ 234（pass1 并林）+ **222（回放重解析）** = 690；回放每源仍付 ~0.9 MB 泄漏 + arena churn。把回放改成"pass1 期间把延期行所需的 parser 事实落进 arena 列"（或按声明区间局部解析），可直接省掉 222 次解析 ≈ **200 MB 级**，且与是否找到 owner 无关。

### 8.57 驱动内已有"相位内存账"骨架但未接线（2026-09-13 10:xx）

`backend_driver_dispatch_min.cheng`：
- `:3197 BackendDriverDispatchMinAppendPhaseMemoryLedgerReport(out)` 会输出 `phase_memory_ledger_schema=phase_delta_ledger`、`phase_count=5`、每相 `rss/structured/unstructured_gap` 的 before/after/delta，以及 **`phase_memory_ledger_compiler_csg_top_contributor_{0,1,2}_{kind,count,bytes}`**。
- 但 `:3224-3230` 的 `kind=` **硬编码为空串**（kind 未跟踪），且**全文件无调用点**（grep 只命中定义体内部）⇒ 报告从未产出（`kd_r93.report.txt` 里 ledger 行数 = 0）。
- 数值来源是 `backendDriverDispatchMinCsgTop{0,1,2}{Count,Bytes}` 全局，由 csg 内存跟踪器填。
⇒ **下一步最省事**：把该报告接到 `system-link-exec` 的报告路径（或按需在诊断轮调用），先拿到 top contributor 的 count/bytes 归属；kind 若要显示则补一处记录点。这比新增账本会话便宜，且与运行时分配账本（§8.56）互为补充。

### 8.58 并林入口基线 737 MB 的逐段分解：两笔 156 MB 都在 profile/行载荷一侧（2026-09-13 12:xx）

同窗口同轮顺序相邻读数（`kd_r94` 抬门日志的 `csg_stage`/`csg_mem`，`d_live` 为块数）：

| 阶段 | RSS | ΔRSS | Δlive 块 |
|---|---|---|---|
| `enter` | 135,348,896 | — | 43,722 |
| `after_binding_source_texts` | 235,995,856 | +100.6 MB | +10,470 |
| `after_sort_sources` | 244,269,776 | +8.3 MB | |
| **`after_profiles`** | **400,491,312** | **+156.2 MB** | **+779,717** |
| `after_reachable_function_set` | 448,938,872 | +48.4 MB | +80,530 |
| **`after_profile_source_payload_release`** | **605,160,408** | **+156.2 MB** | **+546,695** |
| `forest_build_done`（并林本体 T(k)，`mode=reparse`） | 702,448,672 | +97.3 MB | +1,776,692 |
| `p1_arena_reserved`（pin 安装，只提交容量、几乎不触页） | 710,804,560 | +8.4 MB | +68 |
| **`p1_ctx_index_built`（并林入口）** | **736,789,608** | **+26.0 MB** | **+313,638** |
| `replay_pass pass=0`（并林 + 回放） | 1,254,835,688 | +518.0 MB | +4,367,263 |

- **结论 1**：基线 737 MB 里最大且**可减**的两笔各 **+156 MB**，都落在 profile/行载荷一侧：`after_profiles`（profiles 构建）与 `after_profile_source_payload_release`（该段实际执行 `CompilerCsgPhaseArenaLineStoreReset` → `parser_receipt.ParserNormalizedExprReceiptAccumulatorInit` → `CompilerCsgCompactProfilesForFixedPoint`，**名字叫 release 却净增 156 MB / +546,695 块 ≈2,336 块/源**）⇒ 首要怀疑 `ParserNormalizedExprReceiptAccumulatorInit` 的逐源回执结构。
- **结论 2**：森林本体只有 **+97 MB**（= `T(k)`，与 `ta_limits column_bytes=71.5 MB` + 列余量相符），TypeArena pin 只 +8.4 MB（容量提交不触页），ctx index +26 MB ⇒ **"并林入口基线高"不是森林或 TypeArena 的账，是前端 profile/回执载荷的账。**
- **结论 3**：与 §8.45–§8.57 的 `G(k)` 泄漏**同族**（逐源小对象、按源线性、释放段几乎不归还），可合并为一条主线：**payload/receipt 族的逐源小块既抬高基线（2×156 MB）又造成并林增长（+361 MB）**。

### 8.59 基线那 150 MB 已钉到 X2：`typedMetadataContexts` 逐源常驻（2026-09-13 13:xx）

用现成 trace 切开（`kd_r94`，同窗口相邻读数，**无需再烤**）：
`after_reachable_function_set` 448,938,872 B / live 961,552 → **`metadata_contexts_built` 599,376,856 B / live 1,499,215（+150.4 MB / +537,663 块）** → `after_profile_source_payload_release` 605,160,408 / 1,508,247（仅 +5.8 MB）。
⇒ 那 156 MB **整笔在 `CompilerCsgLineTextRefCountsBuild` + `compilerCsgBuildMetadataContextsRec`（`compiler_csg.cheng:39572-39573`）**，`LineStoreReset`/回执累加器/`CompactProfiles` 合计只 +5.8 MB。

**= 模型卡已记的 X2**（`typedMetadataContexts 低记，实测 645 KB/源`）：234 × 645 KB ≈ 151 MB，与实测 +150.4 MB 吻合到 1 MB。性质是**模型没预算的结构**，不是越窗滞留（它在 typed facts 相确实被消费）。

结构（`typed_expr.cheng:1767`）：`TypedExprSourceContext` **157 个字段、48 个数组列**，逐源常驻；其中体量候选：`lines: str[]`（稠密行文本）、`scopes`/`signatureScopes`/`bindings`/`importcFunctions`/`importedModules`、`declaredTypes`/`refTypes`/`typeDefAlias*`、`typeFields`、`coldCsgTypeRows`/`coldCsgStatementRows`、`enumValue*`、`stagedSourceTexts`、`roundContexts`、`functionHeader*`。
**下一步探针**：在 `metadata_contexts_built` 处按列打印若干源的字节数（Top-N），把 645 KB/源 分摊到具体列，再对"`typed_context_lookup_built` 之后已无读者"的列定释放点。基线其余部分：前端 bind/sort 244 MB、profiles+行载荷 +156 MB、reachable +48 MB、森林本体 T(k) +97 MB、pin +8 MB、ctx index +26 MB —— **除 X2 与行载荷外都不是可减项**。

### 8.62 192 墙根因定谳：源侧缺 `import std/strings`（与 `name=Result` 同族）；kd_b102 实测墙推进（2026-09-13 凌晨，B 线；原编号 8.60，与并发条目撞号就地改）

- **三个"管线缺口"候选假设全部证伪**：call 实参定型路径就是 `TypedExprCallStaticArgTypesInto`（typed_expr.cheng:29235）→ `TypedExprStaticExprTypeAtLevel`（:28902）→ seq 字面量逐元素臂（:29069-91），臂本身工作正常——`Join([out, "/"], "")`（:191，`out` 为 var 局部）先行通过；不含 lsmr_types 的同构嵌套-call-元素夹具静态定型通过。
- **根因**：`src/chain/lsmr_types.cheng` 只有 `import std/strutils as strutil`，而 `IntToStr` 定义在 `src/std/strings.cheng:286`；Cheng 可见性 = 直接导入（规范 §1.4），别名导入不传递导出 ⇒ 裸调 `IntToStr` 不可解析。裸调夹具实测判词 `compiler csg: executable call unresolved callee=IntToStr`。与 §二 `name=Result` 裁定同族：**源侧缺陷，修源不动管道**。
- **仓库先例钉死修法**：`src/chain/binary_types.cheng:114-122` 逐字符同构的 `Join([out, IntToStr(...)])`（src=0 完整通过）且其 :5-10 注释逐字记录同一判词与修法。
- **修复（均落活树）**：`.rebuild/b_line/bline_lsmr_types_import_fix.patch`（+8 = 7 行 `[import-visibility]` 注释 + `import std/strings`，预检 PASS）+ 同族 `src/chain/pubsub.cheng:153` 同修（`.rebuild/b_line/bline_pubsub_import_fix.patch`，+5，预检 PASS）。
- **验证（kd_b102，全 diagnostic）**：克隆根（含修复 + 探针中性化）烤驱动 rc=0/209s（sha `dcd0610c…`）→ 金丝雀 4/4 绿 → 抬门轮 rc=2、wall=496s、guard_hits=0、234/234 解析：**192 判词 0 次**，binary_types(src=0) 完成，src=1（lsmr_types）typed facts 相推进。
- **方法学新事实**：b101 用 kd_r94 旧驱动对修复后克隆根跑门仍炸 192 且 `source=` 活树路径 ⇒ **森林自烤驱动内嵌冻结源快照，不吃磁盘源** ⇒ 一切源侧修复必须重烤驱动才能验证。
- **新墙（下一工作项，B2 线）**：`typed expr: call declaration identity drift at …/src/chain/lsmr_types.cheng:211 fact_signature_line=0 expected_signature_line=409`（b102 stderr:5820；:211 = `AppendU32BE` 的 `layout.ByteBufAppendByte` qualified 调用；409 = `fn ByteBufAppendByte`@bytes_layout.cheng）。记录端写 0 vs `:12453` 重解 409、`:12517` 判 drift 的不对称已定位，根因未定性（纪律：拿到证据前不下结论）。
- 附带：单夹具路径另有 parser W7X 墙（`parser.cheng:34492`），森林路径不触达，界外未查。

### 8.60 并林入口基线的 150 MB 定性收口：逐源 context 的"元素级小分配"（2026-09-13 14:xx）

`after_reachable_function_set` 448,938,872 B → **`metadata_contexts_built` 599,376,856 B（+150.4 MB / +537,663 块）** → `after_profile_source_payload_release` 605,160,408（仅 +5.8 MB）⇒ 该段 = `CompilerCsgLineTextRefCountsBuild` + `compilerCsgBuildMetadataContextsRec`（`compiler_csg.cheng:39572-39573`）。四个候选假设全部被实测否定（`kd_r96`/`kd_r97`/`kd_r98`，抬门均 234/234；探针 `patches/ctx_column_probe.patch`）：

| 假设 | 实测 | 判定 |
|---|---|---|
| 稠密 `lines: str[]` | 12 个采样源全 `lines=0 / line_bytes=0` | 否 |
| 稀疏行索引列 | `line_lens=0 line_numbers=0 override_idx=0 override_texts=0` | 否 |
| 逐源自带 buildIndex/冻结投影 | 全 `build_rows=-1`（`nil`）、`owned=0`、`proj_ctx=-1` | 否 |
| 共享行 intern 池滞留 | `pool_probe line_intern=0 line_payload=0`（此刻为空） | 否 |
| 大数组体量 | 计数全小（`scopes` 3–78、`bindings` 0–41、`fields` 0–159、`imported_mods` 1–15、`declared_types` 0–10、`line_starts` 41–2936） | 否 |

而 `d_live` 该段 **+537,663 块 ÷ 234 源 = 2,298 块/源**，与模型卡 X2 的"645 KB/源"（≈280 B/块）逐项吻合 ⇒ **X2 = 结构体数组的元素级堆分配**：`scopes`/`bindings`/`typeFields`/`declaredTypes`/`typeDefAlias*` 的**每个元素自带若干堆字符串**，元素个数不多、字节在元素内部。**探针规格（下一轮，一次烤）**：把 `ctx_probe` 从"计数"改为"逐列**元素内字节和**"（遍历元素、对元素内 `str` 字段求长度和，输出 Top 列），再对 `typed_context_lookup_built` 之后无读者的列定 `= []` 释放点。

**运维**：他线 `@importc("cheng_debug_retaddr1..5")` 探针已撤（树内 0 引用，`program_support_backend.cheng` 31,744 行），`kd_r97`/`kd_r98` 均**不走哈希窗口直接烤成**（rc=0，202–213s，抬门 234/234）⇒ 窗口脚本自本轮起停用；金丝雀仍报 `unresolved cheng_debug_retaddr1` 属其**陈旧链接输入**（primary 612 B / provider 1,304 B 占位对象，`nm` 无该符号），验收路径不受影响。


### 8.63 相位内存账接线完成 + G(k) owner 点名到段：merge_parse 671MB 主项（2026-09-13 凌晨，C 线）

- **§8.57 调用点矛盾定谳（就地更正）**：「全文件无调用点」已过时——`backend_driver_dispatch_min.cheng` 有两处调用（`:6254` dry-compile 报告路径、`:7511` system-link-exec 报告路径）。真缺口 = `RecordCsgTopContributor`/`RecordPrimaryTopContributor` **零调用者** ⇒ 全局 `backendDriverDispatchMinCsgTop*` 恒 0、kind 无存储（`:3224-3230` 硬编码空串）⇒ 报告即使写出也只有 0/空。
- **施工（`.rebuild/c_line/retain_ledger_c101.patch`，+374/−3，预检 PASS，已应用在树，env `CHENG_CSG_MEM_TRACE` 门控常驻诊断）**：compiler_csg.cheng 合并循环逐段 (Δlive 块, Δrss) 累计账 + 回放逐源括号 + 每 16 源与 `typed_context_lookup_built` 处按账本原键输出 top-3 + 导出 getter/kindName（1=merge_parse 2=merge_authority 3=merge_ta_append 4=merge_build_index 5=merge_replay 6=merge_rewrite）；backend_driver_dispatch_min.cheng 增 `…CsgTop{0,1,2}Kind: str` 并先拉实数再打印。env 关 = 零读零写零输出。途中 kd_c101 烤挂（`str[]` 字面量借位元素墙，全仓 3187 行同形）⇒ `CloneStr` 进 Join 数组/Fmt 前 let 局部后 kd_c102 rc=0。
- **Top contributor 实数（c102_raised @typed_context_lookup_built，234 源，diagnostic）**：`top0 merge_parse 1,774,359 块/671,073,720 B`（7,583 块/源、2.87 MB/源，与 §8.46 的 7,577 块/源吻合）；`top1 merge_build_index 444,775/62,472,240`；`top2 merge_ta_append 407,260/52,166,680`；`release −2,106 块/−483,018,024`（还页不还块，§8.46 签名再现）；**回放段价签 = 187 次重解析留存 1,836,087 块/47.6 MB（9,819 块/次，高于合并解析）**。parser_mem 配对：produce 段 5,599 块/解析 ⇒ parse 桶 = produce 主体 + consts/lex 残余（固定层 71–313 块/小源；大源 ≈0.7–1.3 块/token）。
- **点名结论**：owner = reader 产出段（`ParserValueExprProduceStatementEvents` 一带）**树 arena 之外的逐 token 小块**；「释放它」不可行（owner 不在任何可释放实体上，树释放实测只还 9 块/源）⇒ 唯一路径 = **不分配它**，两级：① 免重解析（47.6MB 直接不发生，判据仪器 `retain_ledger_replay` 已在补丁内）；② parser 产出段停止单独逐 token 分配（671MB 主项）——**默认门达标必须叠加②**。
- **默认门 A/B（同窗口背靠背）**：c100_default→c102_default 峰 798,819,456→**782,664,808（−16.2 MB）**；c100_base_default→c102_default(parser trace 臂) 846,005,496→850,986,232（+5.0 MB）；d_live@击中点 +2,016 块（+0.05%，= 补丁给被编译输入加 374 行的自身解析留存）⇒ 探针未挪动任何留存，无回归信号；±差值按同窗口纪律归因页行为 + 输入树漂移（两窗之间他线 r97 改了树）。金丝雀双绿、判词零回归。
- **§2 免重解析定性：compiler_csg 单边不可落地**——回放树消费在 `typed_expr_type_arena.cheng:9091`（`InternSyntaxRec`，`state.tree=share(tree)`），物化点/消费点都在该文件；单边做 = 伪造 parser 树，违反身份硬规则。已否决「带延期行源不释放树」（等量永久居留）。**设计（交 typearena owner）**：沿用 seal 相已验证的「事实物化进 arena 列」模式——① 枚举 InternSyntaxRec 树读集合，对 blocked 行在 AppendSource 物化（字节入 pin，同 seal_pin_budget 形）；② 新增 `ReplayForwardRowsFromState` 读列不读树，先做树读/列读逐行相等诊断轮再硬切；③ compiler_csg 回放循环退化纯队列 walk。判据基线冻结：187 次/1,836,087 块/47.6MB，A/B 要求归零且 d_live 真变小。
- 正确性轴联动：c102_raised 止于 §8.62 的 `identity drift lsmr_types.cheng:211` 新墙（B2 线在攻），与本线读数无涉。

### 8.64 【已撤回】`G(k)` 根因"局部 seq 不释放"是**测量伪影**；真值 = 托管局部全部正常释放（2026-09-13 15:xx 立，16:xx 撤回）

> **撤回声明（先读这段，下面整节保留只作反面教材）**：本节原标题为"G(k) 根因定谳：函数内 `seq` 局部离开作用域时不释放"。**该结论错误，已作废。** 错因是探针设计缺陷：两个 repro 都把第二次 `MemLiveAllocations()` 读数取在**被测函数内部、局部变量出作用域之前**，因此 "+1 块" 只证明"缓冲区当时还活着"，**根本不构成泄漏证据**（同理 d3/d4 的 0 也不是"干净"，只是当时读数点的巧合）。

**改正后的实验（差值跨调用取，在 caller 里读）**：`src/tests/_chk_repro_seq_local_scope_drop.cheng` 与 `_chk_repro_seq_local_scope_drop_cases.cheng` 已重写为该形式，用 `stage3` 编译后实测 **两者均 exit=0**：
- 跨调用差值：局部 `var a: int32[]` + `add` → **0**（缓冲在宿主返回时释放）；
- 五例打包（8 进制）**全 0**：seq+add / seq+显式 `= []` / 数组字面量局部 / 局部 `str` / 局部 `new` 对象，**无一存活**。

**同一结论的独立静态旁证（本轮同批核到，与实测互证）**：C 编译器**本来就**支持 seq 的 owned drop——
- `cold_parser.c:1802` `cold_exact_managed_storage_for_slot()` 经 `cold_exact_managed_storage_kind_for_slot_kind()` 把 `SLOT_SEQ_I32/SLOT_SEQ_STR/SLOT_SEQ_OPAQUE` 及 `_REF` 变体映射为 `COLD_MANAGED_STORAGE_SEQUENCE`（`cheng_cold.c:18471-18500`），⇒ `cold_exact_scope_tracks_local():74232` 对 seq 局部**返回 true**（我此前只看了 `:1917` 的 kind 白名单兜底分支，漏了 `:1920` 的提前返回，属读码不完整）；
- `cold_parser.c:73040-73044` `cold_emit_exact_owned_drop_materialized()` 里**已有 seq 臂**：`SLOT_SEQ_I32/STR/OPAQUE → cold_emit_sequence_buffer_release(...)`；
- ⇒ "runtime 缺 seq drop-glue / 链上缺权威"的判断也是错的（虽然 `cheng_seq_free` 确实存在，见下方保留条目）。

**净结果**：`G(k)` 的 owner **仍未定**，退回 §8.63 的结论（"产出段树 arena 之外的逐 token 小块"，671 MB 主项）；但**排除了两个方向**：① 托管局部（含 seq）的作用域释放；② 由此派生的"补 seq drop-glue 权威"整条修法。**§8.63 的"免重解析 = 47.6 MB"这条独立杠杆不受影响。**

**方法学教训（已入 `lessons.md`）**：生命周期/作用域类读数**必须跨宿主作用域取**；在被测对象仍存活时取的第二读数只证明存活，不证明泄漏。此坑与 §9 的"`d_live` 与 `rss` 不可互换"同级，属"读数语义没定死就下结论"。

<details><summary>以下为被撤回的原分析（反面教材，勿引用）</summary>

§8.63 把 owner 定在"产出段树 arena 之外的逐 token 小块"并判定"释放它不可行 ⇒ 只能不分配"。本轮不再夹逼，改**最小复现直证分配点**，直接给出"不分配"的落点。

**复现件（已落 `src/tests/`，是缺陷的永久证伪器）**
- `src/tests/_chk_repro_seq_local_scope_drop.cheng`：一个函数内 `var a: int32[]` + 两次 `add`，退出码 = 跨调用 `MemLiveAllocations` 差。**实测 exit=1**。
- `src/tests/_chk_repro_seq_local_scope_drop_cases.cheng`：六例按 8 进制打包进退出码，**实测 exit=65 = 八进制 101**：

| 位 | 例 | 读数 | 判定 |
|---|---|---|---|
| d0 | `var a: int32[]` + `add`，隐式离开作用域 | **1** | **漏** |
| d1 | 同上 + 显式 `a = []` | 0 | 语言有释放手段，缺的是**出口自动释放** |
| d2 | `let d: int32[] = [7,8,9]` 字面量局部 | **1** | **同样漏**（与 `add` 无关） |
| d3 | 局部 `str`（`Fmt` 产物） | 0 | 干净 |
| d4 | 局部 `new(RefObject)` | 0 | 干净 |
| d5 | 局部 seq 交给被调方持有（逃逸） | 0 | 干净 |

⇒ 缺陷**只限** `seq`/数组值，与元素是否托管无关（`int32[]` 也漏）；`str`/`ref object`/逃逸路径的 ORC 语义都正确。
首个探针（四函数各含一个局部 seq，实测 **exit=4**）给出定量形态：**每个局部 seq 声明恰好漏 1 块**，与大小/增长次数无关——40 次 `add` 也只漏 1 块 ⇒ 增长路径的老缓冲**有**释放，**漏的是最终缓冲**。该件已并入上表后删除。

**机制（静态链已核到谓词）**
1. `bootstrap/cold_parser.c:74718` `cold_drop_exact_scope_locals()` 遍历作用域局部，取 `op_value_def_ownership`，**仅 `COLD_EXPR_OWN_PLAIN` / `COLD_EXPR_OWN_MOVE` 才继续**；随后 `:74729` `if (body->op_value_def_consume_op_index_plus_one[definition] == 0) continue;` —— **无 consume 边即整条跳过**。
2. `:74232` `cold_exact_scope_tracks_local()` 判据是 `cold_exact_storage_authority_for_slot()`：`UNKNOWN` 直接 false；`PLAIN` 要求 `include_plain_exact && slot_kind==SLOT_OBJECT && place∈{STACK_LOCAL,CFG_MERGE,MEMORY_VERSION}`。`int32[]` 局部是**非托管元素 + 非 OBJECT 载体槽** ⇒ 两条都不满足 ⇒ **永不进 drop 名单**，缓冲无人 free。
3. Cheng 侧同一缺口的镜像：`src/core/analysis/ownership_body_ir_production.cheng:399-421` 对 `TypedExprStructuralTypeSequence` 的 **OwnMove 直接 fail-closed**，判词 `managed sequence cleanup drop-glue authority missing`，理由逐字写明"runtime 无 var-ptr ABI glue、双 backend 符号白名单无条目"；`:1844-1846` glue 选择只有两支——`RefObject → cheng_ref_drop_owned`，**其余一律 `cheng_str_drop_owned`** ⇒ **seq 根本没有 drop-glue 权威**。

**⇒ 与 §8.63 合并后的完整结论**：§8.63 的 671 MB `merge_parse` 主项、produce 段 5,599 块/解析、以及 §8.46 的 7,577 块/源，**分配点就是 parser 表达式路径的逐节点局部 seq 临时表**（`ParserValueExprParsePrimary` 9 个局部 seq、`ParsePostfix` 8 个、`ParseExpression` 4 个，用于 `children`/`argumentRoots`/`genericStarts`/`bracketArg*` 一类纯临时列表）。三条旁证同时闭合：① 词法器干净（`ParserValueExprLexSource` **0 个局部 seq**，实测 +2 块/解析）；② `ParserValueExprTreeRelease` 只还 ~9 块（局部 seq 从未进 tree/ownership 表）；③ 两行夹具 +100 块/解析固定（夹具里的少量 seq 构造）。全量外推：690 次解析 × ~1 块/seq 声明 ≈ **600 MB 级**，与 `G(k)`+基线的量级吻合。

**"不分配它"的两条落点（按代价序）**
1. **parser 侧去临时表（治 671 MB 主项，不动编译器）**：`ParserValueExprAppendNode`（`parser.cheng:15837`）用 `children` 只做三件事——相邻兄弟链、`parentNodeIndexes`、`firstChilds`/`childCounts`，**不落任何列表**。故可给 tree 加一组 arena 常驻暂存列（`scratchChildValues` + 计数器）+ `ParserValueExprChildPush` / `AppendNodeFromScratch`，把 ~40 处 `var children: int32[]` 换成 arena 追加，堆 seq 整体消失。符合 DOD+Arena+SoA 硬规则，且与"arena 列而非堆对象"的既有形态一致。
2. **编译器侧补权威（治全仓，含下游 emit）**：runtime 增 `seq` 缓冲 drop-glue（托管元素逐个 drop 后释放缓冲；非托管元素仅释放缓冲）→ 双 backend 符号白名单 → `ownership_body_ir_production.cheng:1844` glue 改三支并把 `:419` 换成真释放义务 → `cold_parser.c` 让 seq 载体槽进 drop 名单（**不是**放宽 `include_plain_exact`，而是给 seq 一类独立 storage authority）。

**判据**：两个 repro 退出码必须归 0（当前 1 / 65）；并林抬门轮 produce 段 d_live/解析须从 5,599 掉到 ≈0，且 `retain_ledger top0 merge_parse` 同步塌陷；默认门峰值按同窗口 A/B 记。

**纪律**：落点 2 改共享源码 + C 冷编译器 ⇒ 过 `patch_preflight.py`、每轮金丝雀，且 `cheng_cold.c`/`cold_parser.c` 改动需**重建 `cheng_cold_v3` 再重烤驱动**，旧驱动读数不得当证据（§8.62 方法学）。落点 1 只动 `parser.cheng`，可先做先验。

**运维更正**：`cheng_debug_retaddr1..5` **仍在活树被引用**（`program_support_backend.cheng:146-155` 声明 + `:6426-6544` quarantine 路径使用），Darwin provider 不导出这五个符号 ⇒ 任何**小程序** `system-link-exec` 直链必炸 `Darwin provider system link failed`（`unresolved_symbol_count=5 first=_cheng_debug_retaddr1`）。诊断绕法（非验收路径）：加 `--provider-objects:.rebuild/s1b_step3/r9/retaddr_provider/retaddr_provider.o`。烤驱动路径不受影响。

**落点 2 的可行性复核（同日追加，把"补权威"缩到两处判据）**：
- **runtime 权威不缺**：`program_support_backend.cheng:7500 @exportc("cheng_seq_free")` 已存在，语义正是"释放 seq 缓冲"——读 `ChengSeqHeader{buffer,len,cap}`（16 B 头，与 `SLOT_SEQ_*` 的 16 B 载体槽逐字对齐），走 `cheng_managed_payload_provenance` 精确证明来源后 `cheng_mem_release_export(buffer)`，无证明则 `panic("cheng seq_free: foreign buffer (allocator pairing violation)")`（**不是兜底，是 fail-closed**）。且 `cheng_cold.c:91193` 的 provider 导出表**已含** `cheng_seq_free` ⇒ 无需新增白名单条目。
- **C 侧唯一卡点是一处 kind 白名单**：`cold_parser.c:1917 cold_exact_storage_authority_for_slot()` 的兜底分支只放行 `kind ∈ {SLOT_OBJECT, SLOT_OBJECT_REF, SLOT_OPAQUE_REF, SLOT_PTR}`，`SLOT_SEQ_I32(7)/SLOT_SEQ_I32_REF(8)/SLOT_SEQ_STR(10)/SLOT_SEQ_STR_REF(12)/SLOT_SEQ_OPAQUE(15)/SLOT_SEQ_OPAQUE_REF(21)` 全部落 `COLD_MANAGED_STORAGE_UNKNOWN` ⇒ `:74232 cold_exact_scope_tracks_local()` 直接 false ⇒ `:74672 cold_drop_exact_scope_locals()` 根本不考虑它。槽布局：`SLOT_SEQ_I32/SLOT_SEQ_STR = 16 B`（`cheng_cold.c:18396-18397`）。
- **C 冷编译器可单文件重编**：`cheng_cold.c:117733 #include "cold_parser.c"` ⇒ `cc -std=c11 -O2 bootstrap/cheng_cold.c -o <scratch>/cheng_cold_fix` 即携带改动（文档记 166–200s）。**故落点 2 的实测闭环是**：改 kind 白名单 + 在 drop 发射处按 `SLOT_SEQ_*` 选 `cheng_seq_free`（**不得**落进 `cheng_str_drop_owned` 兜底臂，那是 16 B 头 vs 24/32 B str 头的类型混淆）→ 重编 C 编译器 → 用新编译器重编两个 repro，退出码必须从 1/65 归 0 → 再重烤驱动看 produce 段 d_live/解析。
- 注意 `cold_parser.c` 里 `cold_drop_exact_scope_locals` **有两处定义（:57057 与 :74672）**，动手前必须先判定哪一份在活路径（`nm`/`#if` 面），否则改了死代码白烤一轮。
- **已判定（同日）**：`:57057` 是**前向声明**（`static void cold_drop_exact_scope_locals(...);`，与 :57049-57058 一串同类声明并列），**真定义只有 :74672 一份** ⇒ 无死代码风险。发射链三段已核：`cold_drop_exact_scope_locals`(:74672，"谁进 drop 名单") → `cold_end_exact_local_scope`(:73244，按 storage 分派：`PLAIN`→`cold_emit_exact_plain_scope_end`；`UNKNOWN`→`return false`；其余→`cold_drop_exact_local_if_owned`(:73155)) → `cold_emit_exact_owned_drop`（文件头有前向声明，定义待定位）= 真正选运行时符号处。
- **风险裁定（动手前必须遵守）**：**不得**把 `SLOT_SEQ_*` 简单塞进 `cold_exact_storage_authority_for_slot` 的 kind 白名单。该返回值同时被 `cold_exact_conditional_requires_identity_merge`、`cold_publish_exact_managed_definition`、`cold_exact_plain_scope_end` 等多处消费 ⇒ 改它等于改动 seq 值的整条**精确身份/CFG 合并**语义，爆炸半径远超 scope drop。正确形态 = 在 `cold_drop_exact_scope_locals` 的名单判定旁加**独立 seq 臂**（`local->kind ∈ SLOT_SEQ_*` + value-def owned），发射处按 kind 选 `cheng_seq_free`；**严禁**落进 `cheng_str_drop_owned` 兜底（16 B seq 头 vs 24/32 B str 头 = 类型混淆）。
- **下一轮三步（不必再探索）**：① 定位 `cold_emit_exact_owned_drop` 定义，看它按什么选符号；② 用 `cold_dump_bodyir_if_requested`（或 `CHENG_COLD_SCOPE_PREFLIGHT_DETAIL=1`）采一个含 `var a: int32[]` 的 BodyIR，确认该局部的 `slot_kind`/storage 类/`op_value_def_consume_op_index_plus_one`（那道 `== 0` 的 `continue` 是第二道门，未确认前不要写补丁）；③ 再改 `cold_parser.c` + `cc -std=c11 -O2 bootstrap/cheng_cold.c`（含 `#include "cold_parser.c"`）重编，用新编译器重编两个 repro 验 1/65 → 0。

（撤回注：上面三步已在同日做完，结论是**不需要动编译器**——① 见 `:73073`/`:72999`，② 见 `:1802`/`:73040`，③ 改正后的 repro 本来就 exit=0。三条保留仅因为其中"`cheng_cold.c:117733 #include "cold_parser.c"` ⇒ 单文件 `cc` 可重编"与"`:57057` 是前向声明、真定义只有 `:74672`"这两条**事实**仍然有效且以后还会用到。）

</details>

---

### 8.65 §8.64 撤回后的补扫：三条新排除（树/并发/out-参数），owner 仍缺（2026-09-13 17:xx）

撤回 §8.64 后重开搜索。本轮不再猜"哪类语法"，改为**先证伪候选类**，三条新排除全部有实测或静态硬证：

1. **树不是持有者（静态双证）**：`ParserValueExprTree` 类型块 600 行起共 **258 个字段、`[]` 字段数 = 0**（`tree.tokenKinds.len` 一类写法是 `ArenaArrayInt32` 值结构句柄，非堆 seq）；`ParserValueExprTreeRelease`（`parser.cheng:10249`）释放的**只有** `arena` + `internPool`（+ 失败件），与"释放只还 9 块/源"逐字吻合 ⇒ 树侧已无未清账号。
2. **排除"时间驱动的后台分配"（零成本推理，关键）**：假说 = 若有一个按**时间**分配的心跳/租约/线程在跑，由于解析耗时 ∝ token，就会呈现出"每 token 线性增长"且**在 parser 调用图里找不到任何分配点**——正是实测形态。**证伪**：同一次解析、同一线程、同一时间量级里，**词法器段处理同样多的 token 却只漏 +2 块/解析**（§8.49 表）。⇒ 若是时间驱动，词法器不可能干净；**这是 produce 段特有的、与处理量成正比的工作**，不是并发副作用。
3. **排除 `var` out-参数的 seq 生命期（实测）**：parser 热路径不是"函数内自生自灭"，而是 `fn F(out: var int32[])` 里 `out = []` 再填、caller 只声明 `var a: int32[]` 就传进去（深度 4–5 的 `ParserValueExprGenericSuffix` / `parserTypeSyntaxBracketArgRangesInto` / `ParserValueExprTypeSyntaxSetBracketArgs` 全是这个形状）。**新增证伪件 `src/tests/_chk_repro_seq_outparam_drop.cheng`**（跨 worker 调用取差，四例：callee `out=[]` 后填 / callee 赋字面量 / caller 自长后 callee 追加 / callee 二次覆写），**实测 exit=0** ⇒ 该形状也正确释放。

**顺带**：`ParserValueExprTreeArenaColumnCensus` 的读取面（逐列 `.len`）已确认与"按 token 线性"无关（census 是 201 列定长）。

**当前排除面（累计，勿重走）**：tree 结构体（258 字段 0 个 `[]`）/ `tree.arena` / `tree.internPool` / `ParserValueExprTreeRelease` 的释放面 / parser 与全 `src/core` 模块级状态 / 逐语句 loop-head helper / census 相关 / 固定 arena 预留 A/B（`d_live` 逐块相同）/ 托管局部作用域释放（seq、字面量、`str`、`new` 对象）/ **`var` out-参数 seq** / **时间驱动的后台分配**。

**剩余唯一未做的定量手段**（NEXT_ACTIONS rev.3 §2）：在 `ParserValueExprProduceStatementEvents` 内装**逐 callee 的 live-delta 累加器**（模块级 `var` + 一次性 `GetEnv` 门控、默认零输出；插入点必须是函数与函数之间的块边界且插入块自带完整注解），对 ~6–10 个 `Process*`/`Append*`/`Extend*`/`Parse*` 调用点各记 `(调用次数, ΣΔlive)`，在 `read_post_produce` dump，并留一个"残差桶 = 窗口 Δlive − Σ各桶"。**判据**：若某桶吃掉大头 ⇒ 该 callee 即 owner；若各桶皆 ≈0 而残差 ≈ 窗口 Δlive ⇒ 增长发生在**括号之间**（循环头/其它分支/marker 自身），再据此改括号位置。**仪器自身上界已算过 ≈1%**（见 NEXT_ACTIONS），不是主项。

---

### 8.66 逐区归因：owner 收细到**单一调用** `ParserValueExprProcessStatementRangeWithTypeOwner`（97.6%→96.3%）（2026-09-13 18:xx 立，06:5x 定稿）

> **状态更正**：本节曾于 06:4x 被我自己"撤回"，理由是 stage-1/stage-2 读数"差 45 倍"。**那次撤回是错的**——错在把探针打印的**槽号**按手写顺序贴标签（stage-2 的 note 在源码里的真实出现顺序是 `0,1,2,5,6,3,4`，不是 `0..8`）。按正确映射重算后两阶段一致（见下表交叉验证），**原结论成立且已收细到单一调用**。`PrevSlot` 复位仍保留（它让跨解析 Δ 不记入任何桶；实测该 Δ ≈ 0，故读数与未复位时逐块相同——这本身是一个有用的对照）。

**探针与运行**：`patches/produce_attr_probe.patch`（+62/−0，preflight PASS，`git apply -R --check` OK；生成器 `probe_produce_attr.py` + `probe_produce_attr2.py`，`CHENG_PRODUCE_ATTR=1` 一次性 latch，默认零输出）。stage-2 驱动 `kd_r106`（sha `fb85e7d9…`，烤 rc=0/201s，**金丝雀 4/4 绿**，首次因烤制进程占 lease 报 `parent lease unavailable`，重跑即过）；抬门轮 `r106_attr`：`guard_hits=0 / forest_parsed=234 / forest_appended=234`，**501 次解析全部有 dump**。

**归因表（按 note 在源码中的真实顺序；每桶 = "自上一个 note 以来的 Δlive"记到上一个 note 的槽）**：

| note 区间 | 区域 | 槽 | Σ块 | 块/解析 | 占比 |
|---|---|---|---|---|---|
| 0→1 | 循环头 `LogicalLineEnd`+`ExtendIndentedValueRange` | 0 | 0 | 0.00 | 0% |
| 1→2 | 分支链（type/routine/binding 各分支） | 1 | 31,620 | 63.11 | 1.3% |
| 2→5 | `parserForwardingStatementCoreArm` | 2 | 33,696 | 67.26 | 1.4% |
| 5→6 | `parserForwardingTopLevelBegin` | 5 | **0** | 0.00 | **0%** |
| **6→3** | **`ParserValueExprProcessStatementRangeWithTypeOwner`** | **6** | **2,291,104** | **4,573.06** | **96.3%** |
| 3→4 | 注解/区域尾 | 3 | 23,998 | 47.90 | 1.0% |
| 4→(下次解析，被 Reset 丢弃) | 循环底 | 4 | 0 | 0.00 | 0% |
| | **Σ** | | **2,380,418** | **4,751.33** | 100% |

**交叉验证（stage-1 `kd_r103`，690 dump，note 顺序 0,1,2,3,4）**：stage-1 的 s2 桶 = `arm`+`topLevelBegin`+`processRange` 合并 = **4,990/解析**，stage-2 对应三桶 **67.26+0+4,573.06 = 4,640.3/解析**（跨轮差 7%）；s1 71.6 vs 63.1、s3 50.4 vs 47.9；s0/s4 两轮皆 0；Σ 5,112 vs 4,751。**⇒ 两阶段一致，归因稳定。**

**结论（可执行）**：produce 段那 4,751 块/解析里 **96.3% 产生在 `ParserValueExprProcessStatementRangeWithTypeOwner`（`parser.cheng:26116`）这一条调用内**，而同一区域的 `parserForwardingStatementCoreArm`（67/解析）与 `parserForwardingTopLevelBegin`（**0**/解析）都不是。⇒ 下一轮进入该函数内部按同样方法继续拆分（它是每条语句的处理器，内部再分"取语句区间 / 建 event / 追加 region / 递归子语句"几段），直到把 4,573 块/解析落到具体赋值点。**该函数的调用图更深**（`parserForwardingStatementCoreRangeWithTypeOwner` 等同族），拆分前先用同一 note 法定位到子函数，不要跳步猜。

<details><summary>以下为被撤回的原 §8.66（反面教材，勿引用）</summary>

§8.65 之后不再猜类别，改**在循环内打五个 note 点、四桶归因**（探针 `patches/produce_attr_probe.patch`，`.rebuild/s1b_step3/r9/probe_produce_attr.py` 生成；`CHENG_PRODUCE_ATTR=1` 一次性 latch 门控，默认路径只多五次计数器读、零输出）。归因规则：每个 note 把"自上一个 note 以来的 Δlive"记到**上一个 note 所属的桶**，因此 `continue` 跳过后续 note 时仍能把每一块精确记入唯一桶。

驱动 `kd_r103`（sha `2cc42b51…`，烤 206s rc=0，金丝雀 4/4 绿），抬门轮 `r103_attr`（`CHENG_PROCESS_MAX_RSS_BYTES=3865470566 CHENG_PRODUCE_ATTR=1`，234/234 并林，止于已知 `lsmr_types.cheng:211` 判词 ⇒ 探针零回归），**690 次解析全部有 dump**：

| 桶 | 区域（`ParserValueExprProduceStatementEvents` 循环内） | Σ块 | 块/解析 | 占比 |
|---|---|---|---|---|
| s0 | 循环顶 → 行尾计算（`LogicalLineEnd`+`ExtendIndentedValueRange`） | **0** | 0.0 | 0% |
| s1 | 行尾 → 分支链起点 | 49,407 | 71.6 | 1.4% |
| **s2** | **分支链起点 → 语句核结束** | **3,443,066** | **4,990.0** | **97.6%** |
| s3 | 语句核结束 → 注解/区域尾 | 34,744 | 50.4 | 1.0% |
| s4 | 注解尾 → 循环底 | **0** | 0.0 | 0% |
| | **Σ桶** | **3,527,217** | **5,111.9** | 100% |

- **配平闭合**：Σ桶/解析 = 5,111.9，与 §8.49-§8.57 独立测得的窗口值 5,106–5,599 吻合到 1% ⇒ 归因**无漏项、无重复记账**，四桶就是窗口的全部。
- **分布极偏**：per-parse 合计 mean 5,111.9 而 **median 仅 1,219**（min 3 / max 129,975）⇒ 留存被**少数大源**主导（长尾），与小源"每解析固定 ~100 块"的旧读数一致。
- **⇒ owner 精确锁定到 s2 区域内的三个调用**（该区域在 `parser.cheng` 内是连续的 13 行）：
  1. `parserForwardingStatementCoreArm(tree, cursor, lineEnd, activeTypeDeclarationRoot)`
  2. `parserForwardingTopLevelBegin(tree, cursor, lineEnd, statementCoreArm, boundAnnotationStart, boundAnnotationCount, topDeclRow, topCoreRow)`
  3. `ParserValueExprProcessStatementRangeWithTypeOwner(tree, cursor, lineEnd, importcAnnotationPending, activeTypeDeclarationRoot, err)`
- **下一轮（一步，同型探针）**：在 s2 内再插三个 note 点把 s2 拆成四个子桶（arm / topLevelBegin / ProcessStatementRange / 之间空隙），判定三者哪个吃掉 4,990 块/解析；`parserForwardingStatementCoreArm`（`:25078`）此前静态扫过"零 `setLen`/`add`/`new`/`Clone`/`Fmt`"，但它**调用图更深**，且 `parserForwardingTopLevelBegin`（`:7865`）此前实测过 **+418 块/次 append** 量级的读数——两者都是候选。
- **方法论价值**：这次不是"排除法继续推进"，而是**第一次让归属账严格配平**（Σ桶 = 窗口值），从此再谈 owner 都不必依赖"某个类别被排除了"的推理链。


### 8.61 identity drift 墙根因定谳与修复：记录端全限定名 vs 叶子名键控不对称；b204 两判词归零（2026-09-13 凌晨，B2 线；原编号 8.64，与并发条目撞号就地改占空号 8.61）

- **根因（探针轮 b202/b203 实测定性）**：记录端 `TypedExprBuildFactInto` 在 fact 目标名规范化**之前**，用 parser 全限定表面名 `"layout.ByteBufAppendByte"` 做精确名索引查找，而 call-declaration 索引行按叶子名 `"ByteBufAppendByte"` 键控 ⇒ 三条记录臂全灭、fact 行 sig 留 0；复核端拿到 post-canonicalization 叶子名命中 row=86（sig=409）⇒ `:12517` 判 drift。B 线怀疑的 void 返回 / var ByteBuf 形参 / int64 收窄只是让 qualified 文本臂恰好也失败的伴生项（`TypedExprCallDeclarationBindTypes` 对 `["layout.ByteBuf","int64"]` vs `["@borrow:ByteBuf","int32"]` 返 false——跨源别名拼写+借记前缀+字面收窄三重叠加，本轮不修，唯一行身份恢复不依赖它）。
- **修复**：`.rebuild/b_line/b2_fix_leafname.patch`（typed_expr.cheng +23/−2，预检 PASS，已落活树）——两处 `(source, name)` 身份查找前做 `TypedExprQualifiedCallLeaf` 叶子规范化（:52220-52222 共享兜底、:53247-53253 恢复臂）；非限定名恒等、零行为变化；仍要求 (source, leaf) Unique，**不放宽判据、不合成身份**。
- **验证（b204，全 diagnostic，kd_b204 sha `34122c72…`，金丝雀 4/4 绿）**：抬门轮（3.5GiB env，guard_hits=0，234/234）：**192 判词 0、identity-drift 0、`typed expr:` 判词总计 0**；lsmr_types 完整通过（stderr:6478-6479 `compiler_csg_source_expr_slices_done … slice_count=21 expr_count=179 facts_added=41`、`src_done=1`）。
- **新墙（前方墙，b102 从未触达 src=2）**：`src=2 decls=310 …/cleanup_cfg.cheng` 处理后 `[cheng_seed] redundant explicit default init; omit initializer type=bool expr=false`（gate rc=2 止于此，界外未查）——下一工作项 B3。
- 附带：①pubsub.cheng 不在 kd_b204 闭包内（stderr 0 次提及），import 修复留活树待覆盖；②b201 活树直烤失败 = 他线 retaddr 探针迭代使窗口脚本旧备份哈希失效（烤制中途被翻回，`kd_b201.link.log` 实证）⇒ 改走克隆根 `.rebuild/b_line/b2_root`（disk guard 登记，可删可重建）；③单夹具路径两判词同为 0 后撞 parser W7X 墙（界外，森林路径不触达）。


### 8.68 src=2 redundant-default-init 墙根修（源侧 13 处纯删）+ 全闭包普查 21 文件 105 处；新墙 = parser W7X（2026-09-13 凌晨，B3 线）

- **根因与修法**：`cleanup_cfg.cheng` 源内 13 处显式默认初始化（9+2 处 `bool = false`、2 处 `int32 = 0`）触发 parser 严格性合同（`ParserRedundantExplicitDefaultError` parser.cheng:6829-6837；规则本体 `ParserFindRedundantExplicitDefaultLine` :7281 三臂 = let/var 带注解顶层 `=`、type 块字段、type 块 tuple 元素；冗余判定 `ParserExprMatchesImplicitDefault` :7093：bool=false / int 族=0 / float 族=0|0.0 / str|cstring="" / char='\0' / seq|定长数组=[] / 紧凑构造 T()）。修法 = 源侧删除初始化器（判词自身语义 = 显式值恒等于默认值），**纯删改零行为变化**：numstat 13/13，word-diff 仅 `- false`×11、`- 0`×2。补丁 `.rebuild/b_line/b3_cleanup_cfg_redundant_init.patch`（预检 PASS）。
- **验证（kd_b302，全 diagnostic，sha `82ee9830…`，金丝雀 4/4，guard_hits=0，234/234，max_csg_rss=1,453,901,456）**：`redundant explicit default init` 判词 **0 次**（前轮 1 次 @ src=2）；192/drift/`typed expr:` 系仍全 0（无回归）；binary_types src_done=0、lsmr_types src_done=1 回执照旧；src=2 进入 cleanup_cfg 处理并推进到 pre-view。**严格性未放宽反证（同驱动 A/B 夹具）**：`var b: bool = false` 仍 rc=2 判词逐字复现，`var b: bool` 判词 0。
- **全闭包普查（扫描器 b3_survey.py，234 文件与驱动 source_snapshot_count 精确一致）：21 文件 105 处命中**，已修 cleanup_cfg 后余 **20 文件 92 处**：compiler_csg 15 / exact_def_identity 13 / parser 9 / typed_expr 8（int=0×7+bool=false×1@:19621）/ typed_expr_type_arena 8 / regalloc_production_emitter 6 / exact_def_freeze 5 / regalloc_aarch64_adapter 4 / compiler_snapshot_schema 4 / regalloc_riscv_adapter 3（type 块字段）/ merkle_store 3 / production_held_exec_provider 3 / primary_object_plan·backend2_frag_codec·compiler_snapshot_builder 各 2 / 其余 5 文件各 1。按授权只修 cleanup_cfg，其余待后续批量清（B5 线）。
- **新墙（parser 领地，首次森林路径可达）**：`parser value expr: W7X zero slot after writeback target=640 zeroIdx=639 total=10122 cap=16384`（b302 stderr:6482，全场仅 1 次；src=2 cleanup_cfg typed-facts 相 pre-view；发射点 parser.cheng:34553 活树行号）——W7X 是 B 线报告已记录的 parser 开放缺陷，此前被更早的墙挡住；与 13 处删除的因果关系未证（判别需动 parser）。
- **运营事实**：活树在 C2 半成品探针期是移动靶（b301 两轮烤挂：typed_expr_type_arena 探针语法半成品、compiler_csg body-store-freeze reject）⇒ 烤制改走「B2 已验证 b2_root + 本轮补丁」的单变量受控路线（kd_b302 与 kd_b204 唯一差 = 13 处删除），克隆内中性化仅限克隆副本。

---

### 8.67 `G(k)` 机制收口：**循环内被写回的托管局部不进"借用重绑定 op 表" ⇒ 无 loop-edge 掉落**（2026-09-13 08:xx）

> 承接 §8.66（produce 段 96.3% 落在 `ParserValueExprProcessStatementRangeWithTypeOwner`）与 §8.64（已撤回）之后的完整闭环。**本节结论已有三项独立实测支撑**，修法落点已定到行，判据前置到 ~4 分钟。

**(1) 机制（放大复现，高于噪声地板）**
微复现的单次差值在 1–2 块量级时不可判读（同形状换 run/换位次即翻转）。把每形状各跑 **1000 次**、桶值封顶打包进退出码后信号清晰：

| 件 | 形状 | exit | 读法 |
|---|---|---|---|
| `src/tests/_chk_repro_loopseq_amplified.cheng` | 循环内 `add` / 直线 `add`，各 1000 次 | **240** | 循环桶 15（≥15 块）／直线桶 **0** |
| `src/tests/_chk_repro_loopseq_fix_probe.cheng` | `setLen` 预置+下标赋值 / 循环内 `add`，各 1000 次（漏者放**第二槽**） | **15** | 预置桶 **0**／add 桶 15 ⇒ 候选修法干净且排除位次伪影 |
| `src/tests/_chk_repro_strseq_scope_drop.cheng` | `str[]` 字面量/直线/循环/显式 `=[]` | **64** | 仅"循环内 add"漏 |

⇒ **函数内局部 `seq` 若在循环体内被 `add` 增长，其最终缓冲在作用域出口不被释放（≈1 块/调用）；直线路径正常释放，显式 `= []` 亦干净。**

**(2) 根因（数据结构层面闭合）**
循环掉落的收集器**不是按需判定，而是枚举预计算表** `body->exact_borrowed_rebind_op_ids[row]`（表在 `cold_parser.c:69977-70085` 填充；消费点 `:81168-81203`）。两条 staging 入口分别是 **`rebind_op`**（`COLD_EXACT_LOOP_DROP_DIRECT_REBIND`，~:91356）与**借用提升的 input copy**（`COLD_EXACT_LOOP_DROP_BORROWED_LIFT`，~:91490）。"**局部 `seq` 在循环体内被 `add` 调用反复写回**"既非 borrowed 也非 rebind ⇒ **不在表里 ⇒ 不进 staged ⇒ 无 loop-edge drop**。与全部旁证一致：真链无 `die()`；直线不漏；显式 `= []` 不漏；§8.66 父桶按调用次数线性下降；末端物化链 `:91510/:91543/:91555 → cold_drop_exact_local_after_loop_edge_collection(:73282) → cold_emit_exact_owned_drop_after_loop_edge_collection(:73125) → cold_emit_exact_owned_drop_materialized` **在 `:73040` 已有 seq 臂**（`SLOT_SEQ_I32/STR/OPAQUE → cold_emit_sequence_buffer_release`）。

**(3) 真链归因（试点，单点）**
`ParserValueExprParseCallSuffix` 的 `children`（原 `var children: int32[]` + `add(calleeRoot)` + `for … add(argRoots[i])`）改为 `setLen(children, argRoots.len + 1)` + 下标赋值。补丁 `.rebuild/s1b_step3/r9/parse_call_suffix_presize.patch`（+9/−2，预检 PASS，`git apply -R` 可撤）。`kd_r107`（sha `f3d590a7…`，烤 rc=0/208s，**金丝雀 4/4 绿**），抬门 + `CHENG_PRODUCE_ATTR=1`（`guard_hits=0 / forest_parsed=234 / forest_appended=234`，501 dump）：

| 桶（produce 循环内） | 试点前 | 试点后 | Δ |
|---|---|---|---|
| **s6 `TOPLB→PROCESSRANGE`** | 2,291,104 | **2,248,756** | **−42,348** |
| s1 `head→branch` / s2 `→ARM` / s3 `→aftercore` | 31,620 / 33,696 / 23,998 | 同左 | **0 / 0 / 0** |
| 每解析合计 | 4,751.33 | **4,666.81** | **−84.53（−1.78%）** |

⇒ 改一处"循环内 `add` 的局部 seq"，父桶按 ~1 块/调用下降（−84.53 块/解析 ⇒ 该函数每解析约被调用 84 次），其余三桶**逐块不变** ⇒ 归因干净。**单点收益 ≈2.5 MB，而缺口 ≈48 MiB ⇒ 需 ~100 倍同类位点**（`parser.cheng` 全书 254 处局部 seq 声明）⇒ **修法必须结构性一刀，不得逐点手改**。

**(4) 修法落点与判据（交接，未执行）**
落点 = **扩展 `cold_parser.c:69977-70085` 的表填充**，为"循环体内被自有（非借用）写回覆盖的托管局部"新增**一类** op id / staging 形状（如 `COLD_EXACT_LOOP_DROP_OWNED_MUTATED_LOCAL`），使其进入既有物化链（末端 seq 臂已就绪）。**约束**：只新增一类，**不动** `DIRECT_REBIND`/`BORROWED_LIFT` 两条既有路径；不得放宽 `include_plain_exact`；**严禁**落到 `cheng_str_drop_owned` 兜底（16 B seq 头 vs 24/32 B str 头 = 类型混淆）。**最小判据（~4 分钟，不必先重烤驱动）**：`cc -std=c11 -O2 bootstrap/cheng_cold.c -o <scratch>/cheng_cold_seqfix`（含 `#include "cold_parser.c"`）→ 用它重编三个 repro，要求 `add` 桶 15→0、exit 64→0、exit 240→0；通过后先跑 `src/tests/` 既有托管冒烟（`cold_managed_exact_ref_sequence_smoke`、`cold_bootstrap_slice_seq_local` 等）再重烤驱动读 s6（基线 2,248,756，判 ≥50% 数量级下降）。

**(5) 方法学（已入 `lessons.md`）**：本条线索经历**立 → 撤 → 立**三次反转，每次都由同一动作决定——**是否把信号放大到噪声地板之上**。规则：微复现差值在 1–2 块量级时**先放大 1000×**；对照组同 run 内**互换位次**；探针必须覆盖**形态谱**（直线/循环/分支/逃逸/多次增长）；**编号槽的"槽号→区域"映射必须由生成器随补丁落档**，分析脚本不得手写贴名；**枚举调用面不得假设"大写=函数"**（本仓小写内部 helper `parserValueExprProcess*`/`parserForwarding*` 会整族漏掉）。

**缺口账（§2f，默认门，`r104_recov`）**：并林入口 **604.9 MiB**、并林增长 **0.90 MiB/源**、满量外推 ≈**816 MiB** ⇒ 距 768 门 **≈48 MiB**。**另注**：模型卡给森林相的锚是 **750–880 MiB**，其中 40% 高于门 ⇒ 实测 800.5 MiB **按模型判据"贴线合格"、按门是 RED**，属目标定义层面的冲突，需用户裁定（与"MB vs MiB 未裁定"同类）。


### 8.69 闭包冗余默认初始化批量清零（B5 线：领地 17 文件 60 处纯删，kd_b501 与 kd_b302 A/B 全等）；前沿仍 = W7X（2026-09-13 上午）

- **清扫**：按 §8.68 钉死规则（判词 parser.cheng:6829-6837，本体 :7281 三臂，`ParserExprMatchesImplicitDefault` :7093）批量清除 B3 普查剩余领地 17 文件 60 处（`var x: T = <默认值>` → `var x: T`，含 type 块字段臂 regalloc_riscv_adapter :109-111、body_ir_access :141）：exact_def_identity 13 / typed_expr 8（int=0×7+bool=false×1@:19621）/ regalloc_production_emitter 6 / exact_def_freeze 5 / regalloc_aarch64 4 / snapshot_schema 4 / regalloc_riscv 3 / merkle_store 3 / production_held_exec_provider 3 / primary_object_plan·backend2_frag_codec·snapshot_builder 各 2 / derive·merge·body_ir_access·parser_receipt·chacha20poly1305 各 1。**纯删证明**：17 补丁 `.rebuild/b5_line/patches/`（preflight 17/17 PASS）逐 hunk -/+ 配对机验 60/60 对、`+` 行 = `-` 行去 ` = <默认值>` 尾零其他增删，`git apply --numstat` 全 N/N；活树 `patch -N --dry-run` 17/17 "previously applied"。扫描器复跑（b5_survey.py = b3_survey 规则引擎 root 参数化）：**领地 0**；余量全在界外禁碰区（活树 36 = parser 9 + type_arena 11 + compiler_csg 16；C2 在飞较 B3 普查 +4，b2_root 基线复扫 92 与 B3 表逐文件一致）。
- **验证（kd_b501，烤自 b5_root = b2_root APFS 克隆 + 17 补丁；sha `c8c1c1b7…cb425`，金丝雀 4/4，guard_hits=0，森林 234/234，wall=200s；抬门轮 3.5GiB diagnostic wall=486s，max_csg_rss=1,471,006,352）**：与 kd_b302（唯一差 = 60 处删除）**逐项全等**——redundant=0 / 192=0 / drift=0 / `typed expr:`=0；:6480 `tag=src=2 decls=310` → :6481 pre_view → :6482 W7X 同位同文；binary_types src_done=0、lsmr_types src_done=1 + slice_count=21 expr_count=179 facts_added=41 回执照旧。⇒ 60 处删除零行为变化、零新回归。
- **前沿不变**：`parser value expr: W7X zero slot after writeback target=640 zeroIdx=639 total=10122 cap=16384`（b501 stderr:6482，全场 1 次；src=2 cleanup_cfg typed-facts 相 pre-view）——parser 领地开放缺陷，W7X 后 src≥3 的 per-src typed-facts 相仍不可达，故残余人界外文件（b5_root 内 parser 9 / type_arena 8 / compiler_csg 15）的判词清除须待 parser 修 W7X 后逐源验证。
- **运营事实**：全程编译槽单锁持有，r/C2/B4 五轮持槽期间 sleep 30 让行（wait 0-71）；烤制延续「已验证基线 + 单变量补丁」受控路线，未从活树直烤。工具坑：PATH 首位 `diff` 为 DevEco OpenHarmony 坏二进制（静默 rc=0 空输出），diff 类操作必须用 `/usr/bin/diff` 或 `git diff`。

---


### 8.70 W7X 根因定谳：**托管 struct seq 元素读拷贝被后端下沉成破坏性 move**（判词 45 同族，全仓辐射）；parser 写回缓解已验证（2026-09-13 上午，B4 线）

- **判词**：`parser value expr: W7X zero slot after writeback target=640 zeroIdx=639 total=10122 cap=16384`（§8.68 留下的 src=2 前沿）。
- **根因（探针 r1-r3 三轮定谳，kd_b401-b403，env 门控默认零输出）**：`ParserValueExprStampStrFormatFacts` W7 循环里 `var expr = layer.exprs[exprIndex]` 的元素读拷贝被自宿主后端下成**破坏性 move**——拷贝后源槽整格清零；命中路径靠随后无条件整体写回自愈（r1：227 stamp 0 rogue，写回落点正确）；`if nodeIndex < 0: continue`（匹配失败路径）是全循环唯一读后不写回路径，零槽泄漏给下一次 stamp 后的 W7X 全量扫描（r3 定谳指纹：**226/226 stamp 的 store 前快照 firstZero=target**，store 后恒零槽 0；唯一异常 = target=640 扫描时 {639,640} 两零槽——639 在自己迭代被读拷贝清零后走 continue）。二进制层读写缺陷非源码逻辑缺陷（r2：同一数组同一判据前后扫描读数矛盾）。
- **归属**：真根因 = kernel 战役 emitter 的托管 struct seq 元素读下沉缺陷，**判词 45 同族**（parser.cheng:34417 注释在案）。**全仓辐射**：`var x = seq[i]` 形态「读后无条件写回」处自愈、「读后 continue/return」处泄漏——emitter 修复前新代码应避免读后不写回。
- **parser 侧缓解（已落活树 + b2_root，preflight PASS）**：`.rebuild/b_line/b4_fix_w7x.patch`（+10/−0：9 行注释 + continue 前 `layer.exprs[exprIndex] = expr` 同值写回，与命中路径同款）；不触碰任何判词文本/严格性合同；kd_b404 与 kd_b302 单变量。
- **验证（kd_b404 `ae19c12f`，金丝雀 4/4；森林门轮 b404_w7xfix，wall=594s，guard_hits=0，234/234，max_csg_rss=1,676,379,936）**：**W7X=0、redundant=0、192=0、drift=0、`typed expr:` 系=0**（五族判词全零）；binary_types src_done=0、lsmr_types src_done=1 回执照旧。夹具路径 W7X 亦 0（cleanup_cfg 与 min_import 两夹具）。
- **新前沿墙（全场 1 次，src=2 pre_view 后；parser 领地，下一工作项 B6）**：`parser normalized structure: frozen anchor missing`（parser.cheng:34779 `ParserValueExprBindNormalizedStructureAnchors`；与 cleanup_cfg 单夹具路径同判词，两路径收敛）。夹具路径另见 receipt 墙候选：`compiler parser receipt: normalized expression parser node missing exprIndex=8 kind=21 line=585 surface=continue rootNode=-1 originNode=-1 role=0`（compiler_parser_receipt.cheng:8934）。
- 运营：探针 r1-r3 已全部 `patch -R` 撤离（grep=0）；C2 持槽期间全程让行。

---

---

### 8.71 回放免重解析三步全部落地：硬切后回放解析 187→0（结构性），同窗回放段 d_live −1,722,334 块 ≈47.5MB（2026-09-13 上午，C2 线）

- **§8.63 三步设计全部兑现**：① 物化读集合 = InternSyntaxRec replay 分支树读 7 点枚举；新列 3（`typeSyntaxChildNameIdsByRow`/`typeSyntaxFixedLengthsByRow`/`typeSyntaxFunctionParamCountsByRow`，append 两原 intern 位点顺手写、池序逐次不变）+ 复用已有列 3；generic 臂**不可达已证明**（generic-parameter 行永不被 enqueue），列版 fail-closed。可证上界 `2×typeSyntaxCount + typeSyntaxChildCount` 词进 `ResidualColumnBytes`；新列不进 hash 面（artifactRaw32 不受扰）；Seal 加三条 len 校验。② 列读 walk = **独立函数** `typedExprTypeArenaInternSyntaxRowsFromState`（nil 不能喂 @borrows 形参——伪造树违反身份硬规则，勿在共享 walk 加模式位）；`ResolveNominal` 加 `readColumns` 形参（原调用点传 false，append 字节不变）。③ compiler_csg 默认臂 = 纯队列 walk；诊断臂 = 原树路径逐字提取为独立函数。
- **逐行相等诊断轮 PASS**：`replay_col_diag_total checked=627,107 mismatch=0`（c2b/c2c/c2d 三轮烤每轮全 0；逐行不抽样）。
- **硬切后回放解析 187 → 0**：列路径不调任何 parser reader（结构性删除，非参数开关）。
- **终局 A/B（kd_c2d `91a99908`，raised 门同窗背靠背）**：回放段 d_live diag +1,722,343 vs hardcut **+10 块** ⇒ **−1,722,334 块 ≈47.5MB**（与 §8.63 冻结基线同量级）；绑定行 16,128=16,128；drained/Seal 同过；两臂同止于 `frozen anchor missing`（判词一致）。max_csg_rss 1,388,217,976 vs 1,325,073,992（−63.1MB）；wall 468s vs 413s。默认门对：两臂同在 src=61 触发 guard（判词一致），峰差 +21.9MB = 物化列 pin 已触发部分。
- **基线归属诚实修正**：retain 括号（修复后）测得树路径回放净留存仅 **1 块**——seq scope-drop 修复已先兑现 47.6MB 份额的大部分；本补丁同窗 A/B 的 −1,722,334 块可能含诊断仪器自身临时（默认路径不存在）；「不重解析」是结构性保证。默认门两臂超门 = 树基线整体漂移（X2 探针、他线源修），非臂间差异。**本补丁真实代价 = append 相净 +39MB 物化 pin 字节**。
- **途中抓到并修掉一个硬切真缺陷**：首版列读 walk 漏抄 generic-apply 的 pending 收据三行与整个 builtin-constructor 臂 ⇒ Seal `generic specialization binding receipt drift`；fact 级对拍抓不住（证明的是输入事实相等不是代码路径完备），`cmp_walk.py` 归一化 diff（列读表达式映射回树读表达式再 diff）一轮定位。**维护契约**：列读 walk 是转写体，与原 walk 必须同步改；lessons.md 已记 cheng_cold 四类硬拒绝与「复制 walk 必须机械对照」。
- **确定性证据链（过渡形态）**：exe sha 对拍待 B6 通墙后补（两臂当前墙前止）；现链 = fact 对拍 627,107/0 + replay_tid 序列 cmp 一致 + drained/Seal 同过 + 判词一致 + 同一驱动二进制。
- 交付：活树两补丁（`.rebuild/c2_line/c2_diag.patch` +774/−14、`c2_hardcut.patch` +159/−101，预检 PASS，`patch -R` 可精确撤销）；四轮驱动 c2a-d 金丝雀全双绿。

---

### 8.72 emitter 破坏性 move 真根修（D1 线）：C 链 body 构建规则默认 TAKE 改 retain copy；行为级双复现 BEFORE/AFTER + kd_d102 全闭包验证（2026-09-13 上午）

- **根因（§8.70 的真根因层）**：`bootstrap/cold_parser.c` `cold_try_emit_exact_owned_managed_sequence_element_take`（原 :68500）——`var x = seq[i]`（托管元素）的读拷贝被默认下沉成破坏性 TAKE（`cold_emit_seq_opaque_take` 发 OWN_MOVE 行；物理原语 `cheng_cold.c:38679 codegen_seq_opaque_take` = copy_bytes 后 `codegen_zero_bytes`）——规则只凭「绑定目标是 var + seq 是精确可变局部 owner」判 take，而这正是**所有普通读**的形状，绑定本身不是「源被消费」的证据。双消费臂：局部绑定臂（:81064，缺陷）与索引 store RHS 臂（:84508，`seq[j] = seq[i]` 真消费，保留 take）。self-host 对照：`primary_object_plan.cheng:19364 PrimaryBodyIrSeqIndexValueSlot` 本身纯拷贝、BodyOp 集无 TAKE op ⇒ 破坏性语义只存在于 C 链 builder（今日唯一完备编译车辆），修复据此落位 cold_parser.c。
- **修复（`.rebuild/d1_line/d1_fix_take.patch`，cold_parser.c 净 +53/−3 纯叠加，preflight PASS——ann=5 经基线复跑对照证为既有 C 注释折行误报、本补丁新增 0）**：原函数改 `_impl` 加 `destructive` 形参；`false` 臂改发 `cold_emit_exact_shared_local_copy`（canonical retain copy：COPY_COMPOSITE + 逐类托管 retain，发布为独立 OWN_MOVE 定义）并硬校验产物违者 die；两个薄包装 `…_take`（store RHS 用）与 `…_read_copy`（局部绑定用）；绑定调用点换 read_copy。语义：源此后仍存活的读保持拷贝；真消费证据唯一存在的索引 store RHS 保留破坏性 take。
- **行为级复现（分母 = 本轮产物）**：struct 夹具 `d1_repro.cheng`（托管 struct Item{id,tag} 32B，读后不写回）：冻结 stage3 **rc=3**（源槽清零）→ 修补链 `cheng_cold_d1` **rc=0**（六项检查全过）；str 家族 `d1_repro_str.cheng`：rc=2 → rc=0。**机器级指纹**：修复前 `brk #0xaa`（SEQ_OPAQUE_TAKE_DYNAMIC 哨兵）→ 0x20 拷贝 → `strb wzr,[x8]` 整格清零；修复后 `brk #0x78`（INDEX_DYNAMIC）→ 拷贝 → `bl _cheng_mem_retain`，无清零；kd_b302 的 `ParserValueExprStampStrFormatFacts`（B4 受害函数）内同形状 0x130 字节版 ⇒ §8.70 W7X 即本规则产物。
- **验证矩阵**：两行金丝雀 + ordinary 全 0/0；**kd_d102 全闭包烤制**（650,999 行，wall=206s，sha `8fc6036c…`）rc=0 + 金丝雀 4/4；W7X 回归 = **ABSENT**（推进到 `frozen anchor missing`，B6 领地）；user_path_gate ordinary PASS；四夹具直跑 ordinary 0/0、call_fixture 0/1（合同 run=1）、cold_nested 0/0、v6 0/0 全过。已知例外：kd 驱动编本夹具族撞 self-host `typed_expr value definition: producer lacks exact type or ownership proof`（typed_expr.cheng:6097 fail-closed，kd_b404 同判词，非本线引入）。
- **call_fixture RSS 归因（不抬门）**：gate 中 808,583,168 > 门 0.4%，rc=137——修补/未修补 C 链同根同夹具各两轮 RSS **持平（±0.8MB 噪声）** ⇒ 本修复零 RSS 影响；kd_b404 686MB vs kd_d102 771MB 差值 = 他线 WIP 闭包增长（驱动 +460KB、ordinary +66MiB 同向），门绿待闭包体积线收敛后复核。
- **未竟项**：① `cold_try_emit_exact_owned_managed_field_take`（`var f = obj.field`）同规则同病，单变量纪律未动（D2 线）；② self-host typed_expr :6097 fail-closed 墙；③ call_fixture 门 RSS 0.4% 闭包收敛（内存管理线）；④ B4 的 parser 写回缓解在 emitter 修复后已非必需，可评估移除（未动）。

---

### 8.73 frozen-anchor 墙根修：**break/continue/defer 终止语句无树节点**（anchor-only 行族 vs receipt node 契约断裂）；B6 三件套修复已验证（2026-09-13 下午，B6 线）

- **判词**：`parser normalized structure: frozen anchor missing`（§8.70 留下的 src=2 前沿，parser.cheng freeze 遍历 `ParserValueExprBindNormalizedStructureAnchors`）。
- **根因（探针轮 kd_b601 `0534485d`，env=CHENG_B6_PROBE=1 默认零输出，cleanup_cfg 夹具全层普查）**：freeze 遍历只校验 sidecar 结构族+Return/Assign 共 39 条 root<0 行，分三类——① **7 条 kind=11 Assign 伪行/漏绑行（anchor=-1，freeze 墙直接触发者）**：6 条 = 紧凑元组类型字段行（cleanup_cfg:73 `resultExprNodeIndex: int32 = -1` 等，`=-1` 非默认值合法保留）被 legacy 行扫描器 `ParserAppendAssignStmtExprsLine` 合成赋值行，树中无对应 AssignmentRhs 根事件（类型声明走 TypeSyntax，无语句根）；1 条 = :7699 多行下标赋值 `plan.deferOwnershipGuardProjectionCounts[\n i] = v`，其根事件锚（`=` token）在逻辑续行 join 被消耗的行上，行扫描行 (7699,9) 与事件锚 (7700,col) 永不匹配；② 10 条 kind=12 三元 if 表达式续行被结构化 seed 误分类为 IfStmt；③ 22 条 kind=20/21 break/continue（结构化 seed，带 frozen anchor，freeze 放行）。②③与 defer 行（min_import 夹具实测 kind=19 surface=defer: @system:679）共同构成 **anchor-only 行族**：行扫描/结构化 seed 产线给行只配 frozen anchor token（parser.cheng:985-987 设计注释「Receipt consumers validate this row」），而 receipt 事实管线要求每行必有 parser node id（`parserReceiptNormalizedExprIdentityNode` = origin else root，W7 绑定段只为 if/elif/while/for 绑根、else 继承先行 if 节点，break/continue/defer 无规则可走）→ 两套 WIP 子系统契约断裂。
- **修复（b6_fix2.patch，b2_root +159/−3；活树 b6_fix_live.patch 同内容 +159/−3，双双 preflight PASS）**，全部树/span 推导、零文本匹配零启发式：① 类型声明行旗标扩为全 span 行（`ParserValueExprTypeDeclarationHeaderLineFlagsInto` 内按 declarationSpanStarts/Ends 标记 span 内全部 token 行），行扫描赋值兜底对类型声明整块静默（原守卫只挡声明头行）；② join 组扩展事件：组界 = 头行槽至下一非空槽，主事件块条件不变（单行语句零行为变化），组扩展事件在行尾追加块处理（行号=事件锚行，保住 freeze「行 (line,col)=锚 token」身份契约与层内源序），行扫描赋值兜底由组内预扫压掉（`lineHasAssignmentRoot` 预扫不消费游标）；③ **终止语句 node 身份补全**：`ParserValueExprKind` 末尾追加 BreakNode/ContinueNode/DeferNode（线协议码向后兼容），break/continue/defer 三条产线为每条语句追加叶子节点（span=关键字 token）并 `ParserValueExprAppendStatementRoot` 注册根事件，`ParserValueExprNormalizedStatementRole` 映射三 kind→复用 `Expression` 角色（else 行记 Condition 同款先例；schema:4427 角色 >12 硬上限不可逾越，领地外），行绑定与其它语句同走 (line,col,role) 径，receipt 身份列 (producer,function,node,kind,role) 天然唯一。
- **验证（kd_b604 `c3d3d6e0`，金丝雀 4/4；森林门轮 b604_b6fix，wall=496s，guard_hits=0，234/234，max_csg_rss=1,466,484,368，默认 768MiB 门内）**：**frozen anchor missing=0、W7X=0、redundant=0、192=0、drift=0、`typed expr:` 系=0**（判据全零）；binary_types src_done=0、lsmr_types src_done=1（slice_count=21 expr_count=179 facts_added=41 回执照旧）。**夹具 A/B 定界链（同门控 env）**：kd_b404 自含 continue 夹具 rc=2 `receipt: node missing exprIndex=4 kind=21 line=7 rootNode=-1`（基线逐字）→ kd_b604 同夹具 parser+receipt 全过（前进至 compiler_csg `expr summary invalid`，C2 领地在飞）；min_import 夹具 kd_b404 `kind=21 line=585` → kd_b603 越过 continue 撞 `kind=19 line=679 surface=defer:`（defer 同族实证，驱动 v3 扩展）→ kd_b604 越过 defer 撞 `manual consume function identity drift`。
- **新前沿墙（src=2 cleanup_cfg r92_t1_pre_view_begin→r92_t2_pre_observe 之后，全场 1 次；receipt 领地）**：`compiler parser receipt: generic declaration header invalid`（compiler_parser_receipt.cheng:6914，泛型 `[T]` 声明窗口 token 序校验，b602/b603/b604 三轮同一位置复现；与 parser 侧改动无因果——校验对象为 sidecar token/generic 符号行，本轮未触碰）。夹具路径另见 receipt 下游墙候选：`compiler parser receipt: manual consume function identity drift`（min_import 路径）。
- 运营：探针 b6_probe_r1.patch 已 `patch -R` 撤离 b2_root；b2_root 现存 = B2 基线 + B3 cleanup + B4 W7X 修复 + 本线 b6_fix2（159/−3），交割下一线；活树 parser.cheng 2275/43 → 2434/46；烤炉槽全程抢占用、C2/A7 线在烤时让行；kd_b601（探针）/kd_b602（v1 证伪轮）/kd_b603（v2 drift 证伪轮）/kd_b604（终版）四轮全金丝雀 4/4。

---

### 8.74 field-take 兄弟缺陷真根修（D2 线）：`var f = obj.field` 同规则同病；真消费审计仅 return-by-value 位点保留 take；kd_d201/d200 双车单变量验证（2026-09-13 上午）

- **根因**：`bootstrap/cold_parser.c` `cold_try_emit_exact_owned_managed_field_take`（原 :64521）——`var f = obj.field`（托管字段读拷贝）在局部绑定臂默认把 PAYLOAD_LOAD 重分类为 OWN_MOVE 并**向源字段回填整格零值**；门控（投影形状/精确 storage authority/父 owner 三态/liveness/root_local/唯一 var 形参载体链）只证明「父是精确可变局部 owner」——正是普通读的形状，绑定不是「源被消费」的证据。与 D1（§8.72）同规则同病。
- **修复（`.rebuild/d2_line/d2_fix_field_take.patch`，+61/−3 纯叠加，preflight displaced=0 wedged=0；ann=5 经基线 no-op 对照证为既有 C 注释折行误报）**：D1 同款配方——`_impl` 加 `destructive` 形参、全部门控逐字保留；`false` 臂发 `cold_emit_exact_shared_local_copy`（COPY_COMPOSITE + 逐类托管 retain）+ 硬校验违者 die；薄包装 `…_field_take`/`…_field_read_copy`；局部绑定调用点（:81106 一带）换 read_copy。
- **字段级真消费位点审计**：全仓仅两调用点——① 局部绑定臂（缺陷，已换 read_copy）；② `cold_finish_exact_function_return`（:76443）`return obj.field` 按值返回搬出字段所有权，**零回填是 ORC 必需**（否则父局部 scope-end drop 与 caller release 双重释放），**保留 take**。字段 store（`obj.f = other.f`）走自有机制（`cold_try_emit_exact_borrow_result_composite_field_store` :75500 等），不经本 take ⇒ 破坏面未扩大、真消费未误伤。
- **行为复现（分母 = 本轮产物）**：字段读夹具 `var t = obj.tag` 纯读无写回：冻结 stage3 **rc=3**（源 tag 清零）→ `cheng_cold_d2` **rc=0**；seq 字段夹具 `var n = b.nums` 重读：rc=133（SIGTRAP，重读掏空 seq 头撞守卫）→ rc=0。**机器指纹（otool -tv）**：BEFORE `bl _cheng_mem_retain` 0 次 + 源字段零回填；AFTER 1 次 canonical str retain、191 行函数体清零 store 0 次。
- **单变量与共存**：`cheng_cold.c` mtime 早于 D1 烤车 ⇒ cheng_cold_d1/d2 源差 = 恰本补丁；两补丁在 `cheng_cold_d2`/kd_d201 共存烤制（绑定臂现为 field_read_copy → sequence_element_read_copy 串联）。
- **验证矩阵**：kd_d201 全闭包烤（d2 克隆根，wall=209s，sha `55bc7996…`）rc=0 + 金丝雀 4/4；kd_d200 对照（D1 车，wall=205s，sha `8971b3c3…`）对 kd_d201 单变量 + 金丝雀 4/4；双车 W7X_ABSENT（同止 `frozen anchor missing` 现势前沿）；四夹具直跑 **4/4 PASS**（ordinary 0/0、call_fixture 0/1 合同、cold_nested 0/0、v6_direct1 0/0）；14 件日志判词族回归 grep：zero slot/redundant/drift/panic 全 0，无新墙。kd 层字段读夹具双车同撞 typed_expr.cheng:6097 fail-closed 既有墙（逐字同，非本线引入）。
- **移交余项**：① typed_expr :6097 fail-closed 墙；② call_fixture RSS 门 0.4%（内存线）；③ B4 的 parser 写回缓解在 seq/field 双根修后已非必需，可评估移除（未动）。

---

### 8.75 编译时间模型实测翼收割：相时分解现势、13.641× 倍数复算与 9/6 旧账漂移（2026-09-13，TM1 线；零烤炉，全部收割现成产物）

- **数据源与窗口纪律**：① 142 份烤炉日志 `.rebuild/s1b_step3/r9/bake_*.log`，123 份含完整时间回执（`cold_compile_elapsed_ms`/`compile_real_*`/`compile_theory_*`/`exec_phase_*`）；② 121 份门轮 summary（`gate/*.summary.txt` 带 `wall=` 与 `max_csg_rss`），29 份 stderr 含全相级 `csg_stage` 链（b101-b604、c102_raised、c2a-c2d 两臂、r88-r98 等）；③ `env_before/after.txt` 负载窗标记：本轮**全部读数取自负载窗**（load 1m 6.7-19.1），只有同窗背靠背可互比，与 9/6 静窗旧账（cheng-plan §3.3）**方向性对照、不得逐位互代**。
- **C 链三相现势（自烤 234 源，回执 `exec_phase_*`）[实测]**：kd_c2d（现树）parse 153,325,723 µs（67.9%）/ codegen 66,171,950 µs（29.3%）/ emit 138,302 µs（0.06%）/ total 225,650,968 µs，未归类残差 6.0s（2.7%）；kd_b102（同日早）137.00 / 66.41 / 0.05 / 208.37s。codegen 相跨 6 轮稳定 66.2-66.4s；parse 相 137→153s 与源增长（649,715→651,035 行）及负载窗同向。C 链全冷 09-13 当日 32 轮 wall 中位 **202.0s**[实测]（范围 197.6-246.4s；09-11/12 全窗 123 轮中位 202.8s）——与 9/6 静窗账 205-225s 同档（负载窗下不涨即实际略优），对终态 ≤40s 缺口仍 ~5×。
- **病态倍数复算（13.641× 口径反推）**：旧倍数 = `compile_real_elapsed_ms=194,117.692 ÷ compile_theory_parallel_limit_ms=14,229.630`（原始件 `.rebuild/auth_fix/kd_fix.report.txt` 已随任务清理，数值由本总账 T3 行与 cheng-plan.md:1068 存续）。机械复算证实该口径 = **theory ≡ cpu/14 的后验折算**（b401: 15,255.032×14=213,570.447=cpu_ms 逐位命中；c2d 同）⇒ `x = 14 ÷ 有效并行度`。现势 123 轮 x∈**[13.636, 14.431]、中位 13.73**；09-13 当日 32 轮中位 **13.707**；kd_c2d=13.894（重载窗）。**倍数对速度改进不敏感**（编译单线程，cpu≈elapsed）：13.641→13.71 是"不变"，不是改进也不是退化；结构性判据仍按 2026-09-13 口径收口（append 双线性量级判据），本标量仅作并行度仪表。
- **自宿主相时分解现势（抬门 3.5-3.6GiB 诊断轮，`csg_stage since_ms` 逐段和）[实测]**，代表轮（wall = summary 读数）：

  | 相 | c2d_raised_hardcut(413s) | b501(486s) | b604(496s) | c102_raised(472s) |
  |---|---|---|---|---|
  | 计划/绑定/排序（enter→after_sort_sources） | 9.0s | 11.4s | 11.5s | 11.7s |
  | profiles 逐源 parse（after_profiles） | 41.1s | 32.4s | 32.4s | 44.3s |
  | reachable set | 5.9s | 9.3s | 7.8s | 8.1s |
  | profile 载荷释放（after_profile_source_payload_release） | 28.0s | 43.4s | 37.4s | 45.0s |
  | **并林窗（after_profile_lookup：parse+authority+ta+rewrite+回放+封印）** | **260.7s** | 321.6s | 320.3s | 323.2s |
  | ——内含 pass0 forest parse Σ（csg_mem parse_ms） | 49.7s | 54.0s | 48.7s | 58.5s |
  | typed facts（r92_* 和；**中断于 34/234 源**，c102 为 21） | 9.4s | 12.0s | 55.2s（含 t2_pre_observe 单段 34.3s） | 6.2s |
  | 未归段（启动/拆除/未埋点） | 58.8s | 55.8s | 31.4s | 33.5s |

  收割脚本与 14 轮全表：`.rebuild/tm1_line/harvest_gate_phases.py` 及 REPORT。r92_td 单源成本 0.22-0.26s，×234 源线性外推全相 ≈52-60s **[估计]**（墙面前不可实测）。
- **同窗 A/B 复算（C2 杠杆兑现）[实测]**：c2d diag（树路径回放）vs hardcut（列路径）同窗背靠背（09-13 01:05-01:19Z）：wall 468s vs 413s，并林窗 316.0s vs 260.7s ⇒ **回放免重解析 = −55.3s**，与 C2 线 REPORT §五（−55s）独立口径吻合；窗内回放解析 187→0 结构性。
- **对 9/6 旧账漂移（方向性，窗口不可比）**：① profiles 逐源 parse 249.4s → **32.1-51.7s**（14 轮域；−200s 级，归因未逐刀拆账，PARSE-PERF/S1b 等多线在飞）；② metadata+forest ≥630s 未触界 → **260.7-397.2s 走完且 Seal 通过**；③ 抵墙时间 ≥2500-3300s → **413-594s**，且墙面前移定义已变：现进度 = typed facts 相 src≈21-34 撞 frozen-anchor 族墙（B2/B6 线在修，§8.72/8.73/8.74 已拔三墙），非 9/6 的中段触帽。全墙（跑完全程）**仍无读数**。
- **Top 时间杠杆（证据绑定）**：① **并林窗 260.7-397.2s**＝自宿主最大相（证据：上表；收敛方向＝T-2 汇点增量化「每源 parse→typed→即释」，与内存主项 merge_parse 671MB 同域同刀，§8.63）；② **typed facts 全相 ≈52-60s [估计]**＋首遍固定段（b604 t2_pre_observe 单段 34.3s 待定性）——墙不动则永远测不全，B2/B6 通墙是该相建模前置；③ **profiles 邻段 60-89s**（parse 32-44s + 载荷释放 28-46s）——释放段为纯开销、随工作集涨（b404 46.4s），增量消费/惰性释放方向待设计。**〔§8.77 证伪更正〕该段 84.6% 实为 metadata context 构建（X2 时间面），真释放仅 0.53s；收敛刀=typed_expr 侧刀 A/B 设计交割。**C 链侧唯一主导项 = parse 相 153.3s（结构项占 10⁻⁴ 量级，n_p·c_p 支配，`time_model_structural.md` §2 口径）。
- 运营：本轮零烤炉零源改动；收割工具 `.rebuild/tm1_line/harvest_bake_receipts.py`、`harvest_gate_phases.py`（只读）；`selfhost-resource-plan.md` §二/§五已就地更正标注（原文保留）。

---

### 8.76 generic-declaration-header 墙根修：receipt 泛型校验只认显式 `[T]` 窗，隐式（无头）泛型窗无合同；B7 修复后 src=2 推进至 t5_post_structured（2026-09-13 下午，B7 线；编号顺延，D2/TM1 已占 8.74/8.75）

- **判词**：`compiler parser receipt: generic declaration header invalid`（§8.73 留下的 src=2 前沿，compiler_parser_receipt.cheng:6914，b602/b603/b604 三轮同位复现）。
- **根因（静态合同对照 + 单夹具最小复现实证）**：解析侧泛型符号行有**两种合法形**——显式 `[T]` 窗（`ParserValueExprAppendDeclarationGenericSymbols`，parser.cheng:17839）与**隐式环境类型参数**（spec cheng-formal-spec.md:518-529；`ParserValueExprInferRoutineImplicitGenericSymbols`:23216 → `ParserValueExprAppendImplicitGenericSymbols`:18109，唯一调用方）：例程头无 typeParamList 时，参数类型区+返回类型窗内的自由单大写名按首现序成行，**span=名字 token 本体、无 constraint/default/children、名前无 `[`**。receipt 严格校验循环的 ordinal==0 头检查只实现了显式形合同（`tokenKinds[nameToken-1] == LeftBracket` + owner 紧邻），同一状态机还有三处显式形假设：前窗 `]` 收口检查、续行 CSR 分隔符检查、循环尾全局 `]` 收口检查。cleanup_cfg:1189 `fn cleanupCfgReserveRows(rows: var T[], capacity: int32)` 的 `T` 前是 `var` → 直接判词（该文件唯一隐式泛型例程；同形遍布 std/seqs、std/system `[]=`、backend2、typed_expr、ownership_drop_ir）。**最小复现**：`fn B7ReserveRows(rows: var T[], capacity: int32)` 单夹具 kd_b604 逐字复现；显式 `[T]` 对照夹具 kd_b604 即过该墙（A/B 定界成立）。
- **修复（`.rebuild/b_line/b7_fix_receipt.patch`，receipt 侧 +126/−30，4 hunks，preflight PASS ann=0 displaced=0 wedged=0，双落活树+b2_root；生成器 `b7_make_fix.py` 6 处精确替换 count!=1 即失败）**：①窗口形判定镜像解析侧决策（owner token 后是否 `[`；反引号名先跳闭引号——`ParserValueExprSkipBacktickName` 镜像）；②隐式 ordinal==0 臂 = owner 声明 kind 必须 Function（推断唯一调用方是例程处理）+ span 两端==名字 token span + 无 constraint/default/children + 新 helper `parserReceiptImplicitGenericNameAdmitted`（单大写名 [A-Z]、非 `mod.` 限定、非「先于本声明的 type/concept/trait 声明名」——逐条镜像收集器，含声明序 `< ownerDeclaration` 的时序语义）；③隐式续行 = 同窗 owner + ordinal 连续 + 名 token 严格递增（首现序）+ 同形状；④前窗/末窗 `]` 收口检查加 `!previousWindowImplicit` 门。**显式窗全部既有检查逐字保留（仅缩进 +4）**；判词文本零改动。
- **验证（kd_b701 `4f6b6f0d`，b2_root 烤 rc=0/209s 金丝雀 4/4；森林门轮 b701_b7fix wall=502s guard_hits=0 234/234 max_csg_rss=1,476,396,712）**：`generic declaration header invalid`=**0**（b604 为 1）；frozen anchor missing/W7X/redundant/anchor identity drift/normalized expression parser node missing/static argument type unavailable(192)/call declaration identity drift/manual consume function identity drift 全 0（历史判词族零回归）；binary_types src_done=0、lsmr_types src_done=1（slice_count=21 expr_count=179 facts_added=41 回执照旧）。**src=2 cleanup_cfg 逐相推进 r92_t1→t2_pre_observe(34.1s)→t3_post_observe_meta(9.1s)→t4_post_rowindex→t5_post_structured**（B6 止于 t2_pre_observe）→ 新前沿。
- **新前沿墙（b701_b7fix stderr:6486，全场 1 次；typed_expr 领地，src=2 自身 typed-expr 消费相）**：`typed expr: frozen module const query before build-index seal source=<root>/src/core/ir/core_types.cheng name=ManagedStoreNoneTag`。`typed expr:` 前缀全场恰此 1 次（即新前沿本身），历史 `typed expr:` 具名判词（call declaration identity drift 等）0 次。
- **夹具定界链（同驱动 A/B，kd_b604 vs kd_b701）**：①隐式形最小夹具：kd_b604 `generic declaration header invalid` → kd_b701 过墙前进 receipt 下游；②cleanup_cfg 整源 import 夹具（B6 遗留）：kd_b604 本线判词 → kd_b701 `typed expr: frozen module const query ...`（与森林新前沿同判词，两路径收敛）；③**下游候选墙定性**：receipt `manual consume function identity drift` 仅当源内含**对泛型函数的调用**时触发（显式特化调用 `F[int32](...)` 与隐式窗+调用两形实测触发；泛型声明无调用则全过 receipt、撞 `typed expr: statement/call-node intrinsic identity drift`——typed_expr 领地）。drift 墙不在森林路径（cleanup_cfg 早已通过 receipt build 相）。
- **未竟**：src_done=2 未达成（src=2 死于自身 typed-expr 消费相，typed_expr.cheng 界外）；C2 §8.71 的 exe/primary.o sha 对拍欠账保留（两回放臂仍止步墙前，无法产物化）。
- 运营：b2_root 交割基线 = B2+B3+B4+B6+B7（b7_fix_receipt），b7 夹具已清零、探针零、活树 parser.cheng 2434/46 未动（本轮零 parser 改动，B6 判定「与 parser 侧无因果」成立）；receipt 活树 numstat 63/12 → 179/32（S1b WIP 63/12 + 本线 116/20）。

---


### 8.77 「载荷释放段 28-46s」证伪更正：84.6% 是 metadata context 构建（X2 的时间面），真释放仅 0.53s；compiler_csg 单边无刀，刀 A/B 设计交割（2026-09-13 上午，T4 线）

- **分段计时（kd_t401 `f9013cdf`，b2_root，抬门 3.6GiB，wall=487s，探针 `CHENG_CSG_T4_TIME=1` 门控默认零输出）**：段=after_reachable_function_set→after_profile_source_payload_release，segment_total 39,562ms 与 `csg_stage since_ms` 逐位吻合：semantic_tables 4,496 / line_refcounts_build 4 / **metadata_ctx_build 34,896（88.2%，内含 TypedExprBuildMetadataContextFromProfile 33,483ms = 84.6%，143ms/源 × 234）** / lines 物化 460 / line_release 499 / line_store_reset 27 / 其余 ~139。旁证轮 build=29.7s（127ms/源）⇒ build 占比 85±3% 双轮互证。
- **§8.75 杠杆③证伪更正（就地标注见该节）**：「释放段为纯释放开销」不成立——真释放路径合计 0.53s（1.3%）；该段随工作集涨是因为 X2（§8.59 typedMetadataContexts 645KB/源）的构建随源内容涨。**时/存同源**：X2 内存主项与该段时间主项是同一构建调用。
- **候选刀逐一实测排除**：逐块归还（reset 27ms）、per-source 全堆 relief（malloc_zone_pressure_relief ×234 合计 0ms）、compact 拷贝（2ms）、O(n²)（receipt_init 137ms，E 千级无感；source 查找走哈希非线性）⇒ **compiler_csg 单边无可收**（壳开销 lines 460ms+scratch 4ms+append 26ms+line_release 499ms）；构建本体 ≥2 遍全行扫描在 typed_expr.cheng（禁碰），生产调用点全仓唯一无重复构建。
- **设计交割（typed_expr owner；接线点 compiler_csg:40032 已备）**：刀 A（主刀）=行索引与 declaredTypes 收集融合为单遍零分配行扫描，预期 −40~50%（≈−13~17s，全局 5-8%）；刀 B=per-source `TypedExprBuildSourceIdentityOwnerRoots` 上提为全 build 一次共享（先两点计时证占比）；刀 C（wall 中性不单独落地）=构建循环移 r92 逐源 typed-facts 入口前，仅与刀 A/B 或 §8.60「无读者列释放」联动压 X2 峰时才有净值。判据基线冻结：build 33,483ms/234 源；t4 探针即判据仪器。
- **零回归证据**：探针 +101/−0 预检 PASS、活树+b2_root 双应用、patch -N/-R 双向验；kd_t401 vs kd_b701：minmain/ordinary primary.o 逐字节 IDENTICAL、exe 仅文件尾链接元数据 96 字节差（UUID/签名，与并发漂移同向）；判词族 0:0（frozen module const query 1:1 同位=现势前沿）；内存侧段内 d_live +643,351 块 vs 基线 +546,695 差值归因并发源内容增大，探针常驻仅 9 标量零留存。

---

### 8.78 frozen-module-const-query 墙根修：跨模块限定 const 只读查询被错绑 `frozenReadOnlyQueries` 封印门，而行早在索引构建时已全量登记；B8 修复后 src=2 越过 t5 死于 192 族新位点 cleanup_cfg:4486（2026-09-13 下午，B8 线；编号顺延，T4 已占 8.77）

- **判词**：`typed expr: frozen module const query before build-index seal source=<root>/src/core/ir/core_types.cheng name=ManagedStoreNoneTag`（§8.76 留下的 src=2 前沿；发射点全树唯一：typed_expr.cheng:21753 `TypedExprModuleConstLiteralForFrozenContext`，b801 前所有门轮同位复现）。
- **根因（静态合同对照 + 双形态夹具实证）**：只读 const 查询合同把「有索引可读」错等价成「索引已冻结」。查询链=跨模块限定 const（`alias.Name`）解析：`TypedExprQualifiedConstLiteral`(:21791)/`TypedExprIrBuildRhsQualifiedEnumConstNode`(:23170) 无封印门直调 frozen 变体（第三点 :29160 自带 frozen 门只护裸名臂）；命中链=cleanup_cfg:755 `var expectedManagedStoreKind = coreir.ManagedStoreNoneTag`（函数内局部绑定，全文件 8 处同形）→ src=2 facts-context 构建绑定类型推断（t5→t6 间）→ `TypedExprStaticExprTypeAtLevel`:29165 → frozen 门失败 panic。而封印象 `frozenReadOnlyQueries` 只在冻结固定点投影(:43969)置 true，流式 r92 相共享索引 sealed 但未冻结=合法查询相；只读所需行在 `typedExprBuildIndexForContextsCore`:37128-37137（注释自证「Freeze consumes one authority only」）已对每 context 经 `TypedExprModuleConstRegisterContextRows` 双命名空间（`module_const`+`ctx_module_const_source`）+scanned 标记登记进共享索引（管线次序实测：全部 234 metadata context 先建、索引一次覆盖全 context）；`TypedExprBuildIndexLookupFingerprint`:36085 本身两相通用。同函数枚举臂(:23163)用共享句柄、const 臂读目标 context 指针+frozen 门——同函数双标准。
- **修复（`.rebuild/b_line/b8_fix_const.patch`，typed_expr.cheng +14/−3，preflight PASS ann=0 displaced=0 wedged=0，双落活树+b2_root 两树逐字节一致；生成器 `b8_make_fix.py` 单替换 count!=1 即败）**：:21751 门换合同 `nil||released`（无索引权威才 fail-stop，新实文 `module const readonly query without build index authority`；旧判词文本随唯一发射点消亡）+函数头 11 行合同注释；三调用点/ambiguous 双臂/冻结相行为零改动。首轮改名版被 patch_preflight 按注解→声明名位移拦截——不改门，撤回改名（函数名保留历史名，注释言明两相合同）。
- **最小复现（provider 任意化，与 core_types 无特殊耦合）**：自足 tests 对 `b8_const_provider.cheng`（const 块）+消费夹具，kd_b701 两形态逐字复现（`…before build-index seal source=…/b8_const_provider.cheng name=B8AnswerTag`，rc=1）：绑定 RHS 形 `var expected = prov.B8AnswerTag`、实参形 `b8UseTag(prov.B8AnswerTag)`；对照臂本模块 const（receipt drift 等值）与直拉 core_types 变体（`phase.PhaseArenaReport` 转换既有界外墙 typed_expr.cheng:28750，core_types 自身 src=0 先撞）判词全等值。
- **验证（kd_b801 `d5cf4a66`，b2_root 烤 rc=0/236s 金丝雀 4/4；森林门轮 b801_b8fix rc=1 wall=634s guard_hits=0 234/234 max_csg_rss=1,676,281,632）**：本线判词 1→**0**；frozen anchor/W7X/redundant/anchor drift/normalized node/call-declaration drift/manual-consume drift/generic 三族全 0；夹具 A/B：两形态过墙分别前进 `value definition: source transaction invalid`(:7404) 与 192 族；192 族 0→1=新前沿本身（b701 为 0 仅因死于更早的 frozen 门、未到该代码点，非回归）。
- **新前沿墙（b801_b8fix stderr:6486，全场 1 次=末行；typed_expr 领地，src=2 函数切片定型相）**：`typed expr: call declaration static argument type unavailable source=<root>/src/core/analysis/cleanup_cfg.cheng name=cleanupCfgPreflightExitBound line=4486 scope=cleanupCfgStageQueueUnmanagedReturnExit args=plan, fromBlockId, 0, fromScopeId, -1, odir.OwnershipDropEdgeReturn, -1, snapshot …`——发射点 :29432 `TypedExprCallStaticArgTypesInto` fail-closed；触发实参 `odir.OwnershipDropEdgeReturn` 又是跨模块限定名作实参，与本轮同域的下一刀。
- **逐相**：src=2 r92_t1(0.85s)→t2(43.7s)→t3(11.5s)→t4(3ms)→t5(5ms)→新前沿（B7 止于 t5 后即撞本线墙）；同窗 T4 门轮在飞，跨窗读数不可逐位互比。
- **未竟**：src_done=2 未达成；C2 §8.71 exe/primary.o sha 对拍欠账保留（kd_c2c/c2d 内嵌前端早于 B6/B7/B8，复跑止于 src=2 receipt 墙；复刻需 C2 领地补丁在 B8 基线重烤双驱动）。
- 运营：b2_root 交割基线 = B2+B3+B4+B6+B7+**B8**；b8 夹具已清零（证据件归档 `.rebuild/b_line/b8_fixture_*.cheng`）；活树 typed_expr.cheng 646/100 → 660/103，parser/receipt/core_types 未动；探针零；烤炉槽全程 owner+trap，T2/T4/r1 持槽期间排队让行。

---

### 8.79 region 循环 per-source remap 缓存落地（第三处同族）：profiles parse −4.8%、发射字节零改变；**附带发现 exe receipt 运行期非确定**（2026-09-13 上午，R1 线）

- **落地**：`parser.cheng` +26/−5（预检 PASS），region 循环（现位 :11856-11884，条款 :11699 漂移已按符号定位）加函数内 per-source remap 缓存（−1 哨兵；非负 id 才读/回填；负值路径逐字不变；intern 顺序/id/equal 不变，重 intern 同文本幂等）。代价形态 = 每 region 行对整源 `CloneStr+Intern`（regionCount×源字节双线性）。调用域：NormalizedExprLayerAdd 逐源 delta 合并 + typed/frontier 相 append。
- **验证**：kd_r101（`dac2d026…`）对 kd_b701（`4f6b6f0d…`）单变量，bake 209s 金丝雀 4/4；三夹具 **primary.o 全 IDENTICAL**（确定性红线守住）；同窗有效 A/B 对（14:24-14:40 背靠背，窗口洁净判据：pass0 parse +1.2%、payload_release ±4s 窗噪）：**profiles parse 35.2→33.5s（−4.8%）**、整轮 wall 493s 持平（段占整轮 ~7% 分辨不出）、终点 live_allocations 两臂逐位相同、max_csg_rss −0.15% ⇒ 无任何相回归。首对轮因负载污染判废存档。判读：region 循环是 token/typeSyntax 缓存（c5f6c6736，森林窗 −28.5%）的同族长尾，绝对权重小。
- **附带发现（重要，馈归属线立卡）**：**exe 的 receipt evidence/proof digest 运行期非确定**——同驱动连跑两次即差 95B（`@7393800` 64B provider commitment digest + 尾部 32B 链 digest；32B contentSet digest 跨轮稳定），晚于 c5f6c6736 时代（当日 exe A/B 曾 IDENTICAL）⇒ 根因在 `macho_provider_linker.cheng` `machoBuildProviderCommitment` 上游输入侧。**影响：全仓「同路径 A/B exe 逐字节相同」判据不再可复用**，A/B 判等应下探到 primary.o 层（本次已用）或归属线修复 receipt 非确定。
- 边界：只改 parser.cheng；b2_root 滚动共享根观察（多线叠交割，用前核对同步时点）；loader 污染轮判废纪律执行。

---

### 8.80 托管 str 赋值替换「泄漏」根因反转与根修（D3 线）：ConcatStr 产出 flags=0+非托管分配 ⇒ 全系统 release 门恒不命中；修复后 repro 18.9GiB→76.3MB（254×）（2026-09-13 上午）

- **09-04 定谳反转**：「赋值 lowering 生成裸字段写、缺 `cheng_str_store_managed` 路由」**不成立**——赋值替换路径（cold_parser.c :82232 托管 owned 臂）本来就发射 flags 门控的旧值 release（load flags → cmp #1 → `bl _cheng_mem_release`）+ 搬入记录。**release 永不生效是因为产出侧把新串 flags 写成 0**：`cheng_cold.c:38099 codegen_str_concat`（C 链内建；cheng 源码版 `strOwnedAlloc` 根本不被调用）`movz R0,0` 零写 store_id 与 flags，分配走 calloc shim/bump/裸 mmap（未注册无引用计数，即使 flags=1 也不能安全 release），且无 NUL 边界（违反 :34389 string_abi_contract）。全系统所有 release（赋值替换/scope 退出/store 原语）都以 `flags == chengStrFlagOwned(1)` 为运行时门 ⇒ 每个 ConcatStr 中间串永不可释放。parser 侧 :46383 早已判 concat 结果 OWN_MOVE（diag rhs_own=2）——parser 产权与 codegen flags 位自相矛盾即本墙。09-04「nm 见 store_managed 引用 0 ⇒ 缺路由」观察成立但归因错层（C 链 flags 门控 release 形状不经过该原语）。
- **连带更正**：对照组 227MB（1M 次独立 ConcatStr）**同样是泄漏本身**（1M × ~227B）——「scope 释放正常」系误读；正确对照基线为修复后的 61MB。
- **修复（cheng_cold.c 净 +21/−4，两件补丁预检 PASS）**：① `d3_fix_str_concat_owned.patch`（+19/−3）非空分支改走 `codegen_managed_len_reg`（cheng_malloc，rc=1）+1 字节预留 NUL+拷贝后补 NUL+**owned 旗标发布**（`heap_runtime_calls ? 1 : 0` 门，与 canonical `codegen_store_owned_str_pair`/`a64_codegen_store_owned_bytes` 逐形一致；空串分支保持 nil/0/flags=0）；② `d3_fix_str_concat_seal.patch`（+2/−1）预 seal 扫描器 `cold_body_emits_managed_alloc_call` op 清单补 `BODY_OP_STR_CONCAT`（否则纯 concat 闭包 seal 报 cheng_malloc 未注册）。自赋值 `a = a` 由托管臂 defs-相等早退（:82287）既有短路；借用 RHS 先 retain 拷贝再覆盖由既有框架保证。
- **验证矩阵（/usr/bin/time -l 实测）**：repro BEFORE 冻结 stage3 **20,268,139,392 B（18.9GiB）** → AFTER cheng_cold_d3 **79,987,168 B（76.3MB），降 254 倍**，输出 2000000 正确；对照组 227MB → **61MB**；自赋值（字面量+ConcatStr 双形）/二次覆盖/循环重赋值 100k（footprint 6.77MB 有界）全 0；kd_d301/d302 全闭包烤制（BAKE_BIN=d3，sha `f066d028…`/`c2e7c7e5…`）金丝雀 4/4；四夹具 vehicle 与 kd 层双 4/4；W7X_ABSENT、判词族 grep 零回归。机器指纹：BEFORE calloc-shim/无 NUL/flags=0 → AFTER `bl _cheng_malloc`+NUL 写+`[dst+16]=1`（owned）。
- **同族审计（单变量只修 a64 concat，其余记录待办）**：x64 concat 同病未修（Linux/Windows 镜像 leak）；a64 I32/I64_TO_STR flags=0+非托管分配（有界小项，配方同款建议下轮）；rv64 concat 直接 die 无 leak 面；seq 走 managed 分配+精确保 release 无同病（D1/D2 已修读面）；托管 struct 替换释放正确性**依赖本补丁的 owned 旗标**（修后一并受益）；@exportc ABI 体内赋值已随补丁同修、ABI 边界产权未另测；self-host backend2 :5669 生产者若同样发布 flags=0 则同族（待该线自证）。

---

### 8.81 present 臂覆盖 smoke 落地 + 反证自证（fix3 反极性精确复现 pv_fail stage=69）；顺带定谳 F1/F2 两个非本门既有真红（2026-09-13 上午，SM1 线）

- **覆盖落地**：`src/tests/pool_present_arm_smoke.cheng`（已入库 `2cef51402`）——嵌套 Fmt 插值 2 函数形态（presentWrap helper + 校验 main）使**双 body 都走 present 臂**（kd_sm1g 探针：体A sealed=1 origLocal=20/origCall=14 与 cold 体A 逐字段同形；体B sealed=1 owner=4 unit=8——main 仅 let+比较+echo+return 也带非空 intent）。触发条件逆向：cleanup intent 非空（托管 str 临时/所有权动作）才走 Begin→…→Seal ⇒ 非空已封 schedule = present 臂；`BACKEND_JOBS>1` 且 body 数 ≥2 才进池化批。验证：五夹具 j1/j2 exe+primary.o 全 IDENTICAL（探针行 0/26/26/52 与 P1 kd_p102 跨根同形）、smoke run rc=0 输出 pass、12/12 子项全 1 零 fail。
- **反证自证（验收核心）**：kd_sm1r = probe10 + fix3 反极性（requirePositive false→true）——smoke j2 **精确复现** `POOLPROBE pv_fail stage=69 arm=schedule_present`（C1..C7 全过、C8=0、R1=0/R3=0，正是 fix3 极性抄反签名）×2 body + `primary_lower_pool_batch_receive_failed`；同一 smoke 串行 j1 全绿且 exe sha 与 green 轮逐字节相同（反极性只动接收判据、发射字节零变化）⇒ **覆盖真实存在，非永真测试**。croot 反证后还原 pristine sha `707f085c…`。
- **顺带定谳三个非本门既有门行为**（repro `.rebuild/sm1_line/iso_w1/w2/w3.cheng`，易失——源形态已录下）：
  - F0：let 绑定的托管 str 调用结果传非 var 无 @borrows 的 str 形参 ⇒ rc=2 `borrowed value passed to non-var parameter without @borrows`（疑似 by-design，记录备查）。
  - **F1（CSGC cargo 发射，新真红）**：cold 族 + int-only Fmt helper 被第二个托管 let 消费 ⇒ 预校验 3 body 12/12×3 全绿**之后**死 `primary object CSGC replay: admission failed`（primary_object_csgc_cargo.cheng:1290，production admission 拒 fact lines）；串行池化同红。
  - **F2（body-ir 所有权生产）**：cold 族 helper 在 int main 被调用两次 ⇒ `ownership body ir production: materialized BodyIR ownership invalid code=15 site=1 index=-1 detail=0 fn=1`；串行同红。归属 [bodyir-ownership-wall] 车道（活树 WIP 正是该面）。
  - 三者均非 present 臂预校验缺陷（全程零误杀 pv_fail）、非探针所致。
- 纪律：槽位协作让位（r1→t3→b3→d3→r1→t5→b3→d3 序列实测，零死锁）；反证轮真红后 croot 还原 sha 复核；一处 heredoc 误用当即纠正（无卡死）；完整形状：嵌套 Fmt 插值 helper 产托管 str 临时 + return-snapshot/所有权动作 = present 臂最小族。

---

### 8.82 192 族（call declaration static argument type unavailable）根修：枚举成员静态定型双臂 + 流式索引 enum 域补登 + importedModules alias 回退；森林门轮 192→0、历史判词族全零、src=2 越过 cleanup_cfg:4486 推进至转换臂新前沿（2026-09-13 下午，B9 线；编号顺延，R1/D3/SM1 已占 8.79/8.80/8.81）

- **判词**：`typed expr: call declaration static argument type unavailable source=<root>/src/core/analysis/cleanup_cfg.cheng name=cleanupCfgPreflightExitBound line=4486 … args=plan, fromBlockId, 0, fromScopeId, -1, odir.OwnershipDropEdgeReturn, -1, snapshot scopes=309 signatures=309 bindings=1286 lines=15311`（b801 门轮 stderr:6486 全场 1 次=末行；发射点 typed_expr.cheng:29549 static-argument typing fail-closed）。
- **定性裁决**：源侧可见性缺口排除（cleanup_cfg:1 已有 `import …ownership_drop_ir as odir`；成员为公开 enum 值）。实为 typed_expr 侧**三层同域缺口**：①**限定枚举成员无定型臂**——既有两臂 `TypedExprQualifiedConstLiteral`（只查 const 块命名空间）与 `TypedExprLookupEnumConstType`（裸名合同，入口 `ParserIdentPrefix` 把 `alias.Member` 截成 `alias` 永远 miss）；探针 kd_b901 实证共享句柄按 (targetPath,member) 查 `ctx_enum_name_type_source`=**Unique+typeName 无人查**（IR 侧同域合同 bail=44 根修先例）。②**流式索引 enum 域缺席**——流式 exact-index=空 Core+每源只 append call-declaration 域，enum metadata 行只在 Core 全量遍历登记；kd_b903/904 probe3：9 次定型调用前 8 相 arm-hit、末相（ctxCount=0 流式索引相）alias 解析断→判词。③**裸名同模块成员无读者**——重建 context 的 enumValue 列被 AttachStable 克隆但既有臂只查 index、列无人读（ctrl_local 夹具 kd_b801 逐字判 192）。
- **修复（typed_expr.cheng 净 +120/−0，两份冻结件 preflight PASS ann=0 displaced=0 wedged=0，双落活树+b2_root 逐字节一致）**：①`b9_fix_enum.patch`（+47/−0）`TypedExprStaticExprTypeAtLevel` 既有枚举臂后补双臂——裸名臂直读 `ctx.enumValueNames/Types`；限定臂解析 alias（既有 LookupQualifiedModuleSourcePath）→ 共享句柄（nil 回退 ctx.buildIndex）查 `ctx_enum_name_type_source`→ 返回 `qualifier.typeName`（与形参声明书写形逐字一致）。②`b9_fix2_stream.patch`（+73/−0）新函数 `TypedExprBuildIndexAppendContextEnumMetadataRows` **照抄** Core enum 登记段全部 8 行（含 RequireFresh 与 visibility 声明），挂载于**流式专属包装** `TypedExprBuildIndexAppendSourceCallDeclarationsManual`（唯一调用者 compiler_csg:36559；whole-forest 走 Core 全量不经此包装，RequireFresh 不受扰），附幂等守卫（已有行跳过，防同源多轮消费重复 append）；限定臂 alias 解析加本源 `ctx.importedModules` 表回退。**C 链借用合同两次硬拒修正**（数组元素须 var 形参、var 实参不可传按值形参 formal_ordinal=0）如实记录，preflight 无法预防、落地即改。首版 append 缺幂等致 `duplicate structured metadata` panic，守卫后消除。
- **验证（kd_b901→b905b 五轮烤制单变量演进链，金丝雀全 4/4）**：b901 `19c063c0`（probe：共享索引行 Unique 无人查）；b902 `910cb2de`（fix1：裸名臂生效 ctrl_local 192 消失前进 `parameter read view is not borrowed`）；b903 `fff310a7`/b904 `3c42fb32`（probe2/3：相态分解与 arm 级打点，arm-hit×8+末相 target= 定谳）；**b905b `4d1a60aa` 终版**（wall=311s）。
- **森林门轮（label=b905_b9fix，raised env 同 b801 口径）**：rc=1 wall=629s guard_hits=0 forest 234/234 pass1 235 max_csg_rss=1,679,804,168（默认 768MiB 门内）ps_mine_max=1,065,808KB。**判据**：192 族 1→**0**；frozen module const query/frozen anchor/zero slot/redundant/anchor drift/normalized node/call-declaration drift/manual-consume drift/generic 三族/panic **全 0**；`typed expr:` 全场恰 1 次=新前沿本身。
- **新前沿墙（b905_b9fix stderr:6486 末行；typed_expr 领地，src=2 cleanup_cfg 消费中、r92_t5_post_structured 后）**：`typed expr: explicit type conversion requires exact or alias-equivalent source type target=phase.PhaseArenaReport source=phase.PhaseArena`（显式转换臂 typed_expr.cheng:28750 一带 fail-closed；B8 夹具变体曾预告该面）。**cleanup_cfg:4486 已越过**（csg_mem src=2 decls=310 全部声明处理完毕）；逐相 t1 579ms→t2 42.2s→t3 12.9s→t4 3ms→t5 5ms→新前沿。**src_done=2 未打标**（墙在 src=2 消费尾段、打点前）；src_done=0/1 照旧。
- **已知限界**：①单源驱动 metadata 相（ctxCount=0、buildIndex=nil、importedModules 未及收集）无进程内权威可读 provider 枚举行——夹具 repro 在该相仍判 192，森林 234 源判据路径已覆盖；通墙需 compiler_csg work 结构（非本线领地）。②ctrl_local 前进墙 `parameter read view is not borrowed`（非 192 族）未定性。③**B8 域 const 链遗留**：跨模块限定 **const** 实参仍判 192 同文（流式索引缺 `ctx_module_const_source` 行），同构刀可解、属 B8/C2 交割域未动。④C2 §8.71 exe/primary.o sha 对拍欠账保留。
- 运营：活树 typed_expr.cheng 660/103→**780/103**；parser/receipt/core_types/cleanup_cfg/compiler_csg 未动；探针三件 `patch -R` 撤离（冻结件 b9_probe_r1/r2/r3.patch）；夹具 5 件撤离 b2_root（归档 `b9_fixture_tree_*.cheng`）；烤炉槽全程 owner+trap 多线让行（R1/T5/T4/sm1）；一处 heredoc 误用当即自纠；preflight 一次注解位移拦截（`@borrows` 被插入块夺走）按纪律修正锚后重上。

---

### 8.83 显式转换墙根修：转换分类器「同名函数优先」双刀（classify 顶部臂 + 结构化 call 权威门）；src=2 连过 t6→tb 六子相；新前沿=enum→int32 跨模块转换（2026-09-13 上午，B10 线）

- **定性裁决：转换分类器缺口，源侧合法**。`PhaseArenaReport` 在 phase_arena.cheng 既是结构体类型（:16）又是同名函数（:246 `fn PhaseArenaReport(arena): PhaseArenaReport`）——同名构造惯例全树 8 处（`fn T(..): T`）；spec :639 类型/值命名空间分离 + :577 显式转换仅紧邻小括号 ⇒ callee 同时解析为可见类型与已登记函数声明时，值命名空间函数调用是唯一类型检查合读；转换读法 `PhaseArena→PhaseArenaReport` 结构上必被拒（即判词本身）。分类器断裂 = 只认「类型命名空间命中→转换」，缺「值命名空间函数优先」臂。
- **两层同域缺口**：A=classify 顶部无同名函数优先臂（六调用点只查类型可见即进转换分类）；B=结构化 value-expr call builder（:25938）的权威解析 `TypedExprIrResolveStructuralCallAuthority` **typeOwner 臂**按类型构造读法提前 return（signature line 恒 0）先于声明权威 ⇒ fact/TypedIR payload drift（fix1 落地后暴露，kd_b1002 探针定谳：9×resolve Unique + 0×wholecall）。
- **修复（typed_expr.cheng 净 +100/−1，两件预检 PASS）**：① `b10_fix_ctor_call.patch`（+85/−0）新 helper `TypedExprExplicitTypeTargetResolvesToFunction`（裸标识符/纯限定形门 + **builtin 标量转换豁免**——`int32(x)` 惯用语不劫持 + alias 解析含 B9 同款 importedModules 回退 + 共享句柄查 `ctx_function_decl_name_source` Unique/Ambiguous 均算存在 + index nil/released 保持原 fail-closed）+ classify 内 range 臂后插臂命中返 None 交回调用返回类型臂；② `b10_fix2_structural.patch`（+15/−1）typeOwner 臂加同款优先门：typeOwner 命中但 helper 为真 → 不提前 return 落声明权威全套盖章；纯类型构造（`LsmrAddress()` 族）行为逐位不变。
- **验证**：kd_b1001（fix1）/kd_b1002（fix1+probe）/kd_b1003（终版 `ab59a9ed`）烤全 0 金丝雀 4/4；同源构造夹具 `B10Plan(4096)` b905b rc=1 转换判词 → b1003 **rc=0/run=0**（输出 replay_lazy_enter n=2 正确）；森林门轮 b1003_b8fix 口径：**PhaseArenaReport 面 0**、十一个历史判词族全 0、`typed expr:` 前缀总数 1（=新前沿本身）；**src=2 连过 t6/t7/t8/t9/ta/tb（post_observe_verify）六子相**（B9 止于 t5）。
- **新前沿墙（stderr:6526 末行；typed_expr 领地，B11 攻）**：`typed expr: explicit type conversion requires exact or alias-equivalent source type target=int32 source=OwnershipKind`——enum→int32 转换（cleanup_cfg:2734/2764 `int32(op.valueDefOwnership)`，OwnershipKind 为 core_types 公开 enum，跨模块 coreir）。静态证据：ABI 解析器本有枚举臂（Enum check precedes alias chasing→Scalar）仍发射 ⇒ 该相/该 context 下 `TypedExprTypeIsEnumInContexts` 对**跨模块枚举行**不可见——与 B9 限界①（流式相跨模块枚举 metadata 可见性）同族，同构刀可解。
- **边界如实**：①str 标量转换单源墙为 B9 基线既有（判别夹具实证非本线引入）；②依赖源 phase_arena 的 receipt 面墙在转换墙拆除后露出（此前被遮蔽）；③B9 三限界原样保留（回归三夹具逐字复现=零回归对照）；④src_done=2 未打标（墙仍在 src=2 消费尾段打点前）；C2 sha 对拍欠账保留。另有线正以 kd_b905b 对活树跑对比轮，其轮如复用需属主重跑（本线烤制/门轮全走 b2_root）。

---

### 8.84 ORC 同族配方移植（T6 线）：a64 IntToStr/I64ToStr + x64 concat managed/owned 化；**两配方陷阱**（记录基址键 + 零值臂发布）+ 全家族清点（2026-09-13 上午）

- **修复（cheng_cold.c 净 +72/−13，三件补丁预检 PASS，对 f5d9db72a 单变量纯叠加）**：① a64 `codegen_i32_to_str`/`codegen_i64_to_str`（:38155/:38222 区）managed 化（cheng_malloc，尺寸 +1 预留 NUL）+ 零值/非零双臂 NUL 写 + **owned 旗标发布**；② x64 `BODY_OP_STR_CONCAT`（:43950 区）raw→managed + owned 发布（windows_abi 保持 raw lane 原状不越界）；③ seal 扫描器 op 清单补 `BODY_OP_I32_TO_STR`/`BODY_OP_I64_TO_STR`（op 核对：IntToStr 路由 parser:41951/:42774，无其它新 op）。
- **两配方陷阱（后续同族移植必读）**：**fix2 = 记录 data ptr 必须是 cheng_malloc 精确注册键**——IntToStr 数字从缓冲区尾倒写，存游标起点（base+16−len）则首次 owned 替换 release 报 `cheng_orc_release_failure code=registry_miss`；修法 = 尾部 NUL 后 `codegen_copy_bytes` 把数字串搬回基址。**fix3 = 零值分支也必须流过 owned 发布**——发布放 zero_done patch 点之前则零值臂 `b` 越过（反汇编实证 `b 0x…df4` 跳过 0x…dec），`IntToStr(0)` 每次滞留一条。⇒ **「非零分支 managed+owned、零值分支保持」的直译配方对 to_str 族不成立**：零值分支产物也是新鲜堆值。D3 concat 无此两陷（拷贝本落基址、无双臂分叉）。
- **验证矩阵（BEFORE = pristine HEAD 自建 `cheng_cold_pre_t6` `ed5c7a91…`，单变量 A/B）**：a64 IntToStr 1M 循环行为不变（输出/边值逐字节同：0、-42、-987654321098、近满 i64）；**滞留判别（N 无关性）**：BEFORE 2M 次 33,718,656 B（线性 ≈16B/轮滞留=病）→ AFTER 17,531,264 B（与 1M 持平 ⇒ 零滞留，平台为分配器高水）；机器指纹 BEFORE `bl _cheng_cold_alloc_shim`+仅 flags=0 → AFTER `bl _cheng_malloc`+基址存+NUL+FLAGS=owned（零臂直落发布）；x64 编译级 ELF rc=0 + 反汇编指纹（`callq calloc`→`callq cheng_malloc`(len+1)+NUL+`movq $0x1,0x38(%rsp)`，空串分支 jmp 越过保持 flags=0）；**x64 运行行为本机不可跑如实移交 Linux lane**；kd_t6 全闭包烤（`e875d907…`）+ 金丝雀 4/4 + 四夹具 vehicle/kd 双层 4/4；**D3 零回归**（concat repro 75.5MB ≈ D3 AFTER 量级）；判词族 grep 全 0。
- **家族清点（同病未修候选，单变量纪律只修任务书两点）**：a64 raw 族 BYTES_TO_HEX(:36370)/SHELL_QUOTE(:37176)/READ_FLAG(:37437)/TEXT_SET_INSERT(:37929)/PATH_JOIN(:38026)/owned_cstring_result_to_str(:40093)/**PATH_READ_TEXT(:40766，每调用滞留整份文件内容，量级最大建议优先)**；x64 raw 族 SHELL_QUOTE(:44416)/path_join(:46895)/**I32/I64_TO_STR(:44087/:44016，移植必带 fix2/fix3)**；rv64 I64_TO_STR(:48612) 小项（其余 die 无 leak 面）；wasm 独立封闭内存模型不构成本家族。疑点记录：x64 STR_JOIN 发布门 `(heap_runtime_calls || windows_abi)` 在 windows raw 分配下发 owned=1 疑不一致（windows lane 自证）；a64 i32 digit loop 静态反汇编与逐字节运行时校验矛盾判为反汇编映射伪影（以行为测试为准，codegen lane 复核）。

---

### 8.85 CSGC cargo admission 墙根修（F1 线）：plan/replay 双边 canonical 合同不对称 + 整十值 scientific 改写值域地雷；Raw 字段发射/读取双补；int-checked 同族地雷移交 csg_core 车道（2026-09-13 上午）

- **根因**：plan 侧 admission `CsgCoreProductionAdmitFactLinesWithDag` 走 `canonicalLinesProven=true`（信输入字节）；replay 侧 `CsgCoreProductionAdmitFactLines` 走 `CsgCoreMerkleBuildBoundFromLines`（validator.cheng:708）——**逐行 canonicalize 且要求 canonical == 原行**，否则 `root_binding_line N noncanonical` → dag.ok=false → :1290 `primary object CSGC replay: admission failed`。发射侧 Fmt 直写十进制裸整数违反自己签下的合同。**值域地雷**：`csgJsonCanonicalNumber`（json_canonical.cheng:537）取 plain/scientific 更短者 ⇒ **≥1000、有效数字 ≤2 的整十值（1000/2000/…/100000…）被改写 scientific（1000→1e3）**。iso_w2 命中 = 其 relocation（ordinal 54，kind 4=PageOff12）落 text offset 0x3E8=1000；四夹具无数值落该值域故不触。**replay 每次编译必经，串行池化同红与池化无关**。
- **被拒行实证（kd_f101 探针 `CHENG_F1_CARGO_TRACE`）**：`root_binding_line 41 noncanonical`；行原文 relocation `..."offset":1000,...,"relocationKind":4,...`。
- **修复（primary_object_csgc_cargo.cheng +129/−10，预检 PASS；F1 于 croot 全矩阵验证后由主席落活树）**：①发射侧新 `primaryObjectCsgcCanonicalJsonIntText` 按 `CsgCoreJsonCanonicalize` 同一规则写 canonical 整数（房内先例 csgCompilerCargoAppendCanonicalNat 同口径），`SymbolFactFields.offset/size` + `RelocationFactFields.addend/offset` 改用——非翻转值逐字节不变；②重放侧新 `@borrows fn primaryObjectCsgcJsonCanonicalInt64Text`（RawField 取原始文本、纯文本精确解析 canonical 整形、溢出门/非整型即拒、不走 float64），`ParseSymbol.offset/size` + `DecodeRelocationCanonical.addend/offset` 改用；既有「重发射逐字等值」检查不动 ⇒ 读取器接受的文本被钉死 canonical 形，**零放宽**。
- **验证（kd_f102 `4dfd9d61…` 对 kd_b905b A 侧单变量）**：iso_w2 判词 **0 次**、compile/run 双 0 输出 pass；exe/primary.o 真文件 cmp IDENTICAL；四夹具合同全绿且 primary.o sha 与 SM1 kd_sm1g 跨根记录逐一相同（`7b594c89`/`abaa15ba`/`1967b4cd`/`53ea6d9d`）——对象字节零扰动；pool_present_arm_smoke 全绿且 present 臂性质按字节携带；金丝雀 4/4；历史判词族全零。iso_w2 推进至编译完成无新墙。F2（body-ir iso_w3）归 [bodyir-ownership-wall] 车道仍红。
- **残留地雷（移交 csg_core admission 车道，非发射层可解）**：**int-checked 字段同族**——manifest 计数、section chunk 数值、relocation ordinal/kind/index、debug relocation 全部数值被 validator `CsgCoreMerkleStoreParseInt32` 钉死 plain，而 merkle canonical 会把该值域整十值改写 scientific ⇒ 发射层两难（写 scientific 被 plan 拒、写 plain 被重放拒）。今日 234 源森林未命中（命中的 Raw 字段已修）；**当某源产生 int-checked 字段值落 ≥1000 整十值域时森林将撞**——需 csg_core 车道动 validator/merkle_store_codec 合同（读侧接受 canonical 整形文本，同 F1 读取器刀法）。

---

### 8.86 enum→int32 跨模块转换墙根修（B11 线）：**canonical 化洗掉枚举身份为主因** + 流式可见性矩阵三跳全断；fix2 v1 UAF 被 0xdd 印迹单变量归因（2026-09-13 上午）

- **可见性矩阵（TypedExprTypeIsEnumInContexts :52173 三跳 × 相位实证）**：跳1 `ctx_enum_type_source`(本源 leaf)——流式相 key=消费方 Missing（行在提供方路径下）；跳2 `ctx_import_enum_type` visibility——**流式相恒 Missing**（Core 登记要求目标 context 在索引内，流式相不可能；且 B9 补登 8 行缺此第 9 行 visibility）；跳3 `ctx_enum_type_global` 共享句柄——被 `sourcePath != ""` 门挡 + 句柄 nil。三跳流式相全断。
- **根因主体（缺口 B，kd_b1102 探针定谳）**：`TypedExprContextProcessTypeDeclLine` 对 `Name = enum` 声明头**无条件**走 `TypedExprMaybeAddTypeDefAlias`（aliasTarget="enum" 形状关键字）⇒ 枚举类型名登记为退化别名 ⇒ classify 内 canonical 化把 "LocalKind" 洗成 **"enum"**、限定名洗成 **"prov.enum"** ⇒ ABI 枚举臂查 "enum"（非任何枚举行类型名）必落 Polymorphic。探针实证枚举行数据俱在（ctx 列 2 行、索引在）——**洗名即全部落空**。判词文本 `source=` 打的是洗名前原值（故 B10 现场显示裸名 OwnershipKind）。
- **修复（typed_expr.cheng 净 +58/−1，两件预检 PASS）**：① `b11_fix_enum_stream.patch`（+44/−0）`TypedExprTypeIsEnumInContexts` 两臂——本源 ctx 列臂（`enumValueTypes` 类型名精确匹配，B9 缺口 C 同域：该列此前只有成员名读者）+ importedModules 表回退跳（只查消费方声明导入的目标源精确登记行；唯一命中→true、多目标→false fail-closed、零命中落回原门；句柄共享句柄 nil 回退 ctx.buildIndex）。② `b11_fix2_enum_canonical.patch`（+14/−1，v2）classify 枚举名守恒——operand 为精确枚举类型名时 `operandCanonical` 保留原名进入 ABI（枚举是 int32 类标量，同 StaticRuntimeScalarType 合同）；非枚举名 canonical 化照旧，零放宽。**实参必须 share()**：v1 直传 operandType 使 C 链借用活源区间收缩，末行判词 Fmt 读到释放缓冲（kd_b1103 `source=` 后 5 字节 0xdd 印迹，kd_b1101 同夹具完好 → 单变量归因），v2 修复 kd_b1104 逐字复原。
- **验证**：kd_b1104（`2cb759e2`）对 kd_b1003（`ab59a9ed`）单变量：森林门轮（raised 诊断门）**OwnershipKind 面 b1003=1 → b1104=0**、十一个历史判词族全 0、`typed expr:` 总数 1（=新前沿本身）；wall=500s guard_hits=0 forest 234/234；夹具 A/B：同源枚举转换 rc=1→**rc=0/run=0**；B9 回归三件逐字相同零回归；b10_ctrl 系列 UAF 未复发双证。
- **新前沿墙（b1104 stderr:6533 末行；typed_expr 领地，src=2 消费尾段）**：`typed expr: call declaration static argument type unavailable … name=add line=836 args=bodyIR.callSequence, share(call) …`——192 族**新实例**：`share(call)` 惯用调用实参的 static argument typing 断（B9 修复不覆盖 share() 泛型调用实参面），B12 攻。src_done=2 未打标；C2 sha 对拍欠账保留。
- 边界：cleanup_cfg/core_types 零改动（源侧合法未触发交报告分支）；界外九文件零改动；probe v1/fix2 v1 均 patch -R 撤离；C 链借用合同两次运行时暴露如实记录（probe v1 panic 分支借用硬拒烤制拦下；fix2 v1 静默 UAF）。

---

### 8.87 share(call) 实参 static argument typing 墙根修（B12 线）：share() 惯用面静态定型臂缺席（非洗名）；森林门轮 192 新实例 1→0、`typed expr:` 前缀 1→0、历史族全零；src=2 decls=310 全部处理完毕越 r92_tb→r92_td，新前沿=compiler_csg executable-call share 面（2026-09-13，B12 线；B→…→B11 续攻轮）

- **判词（B11 交割前沿）**：`typed expr: call declaration static argument type unavailable … cleanup_cfg.cheng name=add line=836 scope=cleanupCfgAppendCallWithTarget args=bodyIR.callSequence, share(call) …`（b1104_b11fix stderr:6533 全场 1 次=末行；发射点 typed_expr.cheng :29604 static-argument typing fail-closed）。
- **根因（探针 kd_b1201 定谳，非洗名）**：`TypedExprStaticExprTypeAtLevel` 对 `share(<expr>)` 实参形态**无定型臂**——探针同 call A/B：`body.calls`→`B12Op[]` 正常定型、`share(call)`→空；该形态 convHit=1（转换面把它读成 target=share）但 share 非可见类型落空，随后 `builtin=`（TypedExprBuiltinCalleeReturnType 无 share 映射）、`rhsRet=`（BindingRhsCallReturnType 递归查 share 声明 Missing）、`uniqueRet=`（StaticUniqueCalleeReturnType Missing）三权威全空 → fail-closed。**洗名排查（B11 教训继承）**：实参文本原样到达（head=share 未被 canonical 化洗改），缺口=臂缺席而非身份被洗——B11 的 TypedExprMaybeAddTypeDefAlias 退化别名模式不作用于此面。全树无用户态 `fn share` 声明（std 仅 share_mt）。
- **修复（typed_expr.cheng 净 +26/−0，一件冻结件 preflight PASS ann=0 displaced=0 wedged=0，双树逐字节一致）**：`b12_fix_share_static_arg.patch`——`TypedExprStaticExprTypeAtLevel` 声明权威臂（callHead 臂）之后补 share 惯用面臂：`TypedExprBindingRhsCallHead(text)=="share"` 且全臂落空时，取顶层单操作数**递归走同一静态定型函数**（share(x) 增引用计数返回同型可共享引用，spec 所有权），操作数不可定型仍返空 fail-closed。声明权威先行（未来同名声明不被劫持）、零启发式、零放宽。
- **验证（kd_b1201 探针→kd_b1202 终版，金丝雀全 4/4）**：kd_b1201 `06bcbcae`（wall=216s）；**kd_b1202 `299c15d0`（wall=202s）对 kd_b1104 `2cb759e2` 单变量**（探针已 patch -R 撤离，delta=纯修复件）。
- **森林门轮（label=b1202_b12fix，raised 诊断门 env 同 b801/b905/b1003/b1104 口径）**：驱动 rc=2 wall=497s guard_hits=0 forest parsed/appended 234/234 ta_stream 234 pass1 235 max_csg_rss=1,475,511,976 ps_mine_max=1,251,600KB。判据（stderr 全量 6534 行）：**static argument type unavailable（cleanup_cfg:836 share(call) 实例）1→0**；explicit conversion/frozen const query/frozen anchor/zero slot/redundant/各 drift/generic 三族/receipt/panic **全 0**；**`typed expr:` 前缀总数 1→0**（typed_expr 领地在森林路径上零判词）。
- **新前沿墙（b1202_b12fix stderr:6534 末行；compiler_csg 领地，B13 攻）**：` compiler csg: executable call unresolved callee=share source=<root>/b2_root/src/core/analysis/cleanup_cfg.cheng:836`——typed facts 流全部建成后（r92_td_post_buildfacts 之后）executable-target 合同拒未解析 share 调用事实（compiler_csg.cheng:8594 `CompilerCsgValidateTypedFactExecutableTarget` :8606 `!fact.callResolved` → :8611；`range` 内建 :8607 有豁免臂、share 无）。单源夹具同文复现（rc=2）。**src=2 decls=310 全部声明处理完毕**（B11 墙在 decl 中段 :836），src_done=2 未打标（executable-call 相在打点前）；src_done=0/1 照旧；C2 §8.71 sha 对拍欠账保留（src=2 未通、对拍基线未冻结）。
- **夹具 A/B（kd_b1104 vs kd_b1202 同窗）**：b12_repro_share_callarg/b12_repro_share_struct（最小复现+cleanup_cfg:836 结构镜像）192 判词均消失→前进 `unresolved callee=share`（界外域）；b12_ctrl_plain_callarg value-definition 墙逐字节相同；B9 回归三件/B10 两件/B11 两件 stderr **逐字节一致零回归**（const 变体一件首跑 import 墙系我方回归清单漏装 b9_const_provider，补装后逐字节一致——非回归）。
- 边界：界外九文件+parser/receipt/core_types/cleanup_cfg 零改动；探针一件 `patch -R` 撤离（本次烤制无借用合同硬拒）；夹具 12 件撤离 b2_root/src/tests（grep=0）；烤炉槽全程 owner+trap（让行 m1line_m102/f3line_f103p/t7line），每轮 ps 只读检查无 pkill；活树 typed_expr.cheng 对 HEAD 158/2→**184/2**。

---

### 8.88 运行时分配账本接线完成但 **provider 三层硬约束阻断武装**（纯 Cheng 数学上不可能）；token 斜率新量 **0.488 块/token 纯线性**；C main 武装设计交割（2026-09-13 上午，M1 线）

- **接线完成（全链验证）**：compiler_csg.cheng 诊断路径 env `CHENG_CSG_ALLOC_LEDGER=1` 门控（默认零读零写零输出实跑证明）——TraceInit latch（:1676）、7 helper（Begin domain=`cheng.compiler_csg.alloc_ledger.m1` limit=1GiB/ReadInto/Mark/Collect/Top3/TopEmit/TotalsEmit）、六段差分+replay 段（与 retain_ledger 同位）、每源 stderr 行（panic 前落盘）、typed_context_lookup_built 出口 Top-N；dispatch_min main 首语句授权钩子一行。补丁三件预检 PASS 双向可撤。
- **provider 三层硬约束（实锤+源码钉死，§2 表）**：①`backingLimit ∈ (0,1GiB)`（program_support_backend.cheng:20745，8GiB 初版 `begin_failed=backing_limit_invalid`）；②Begin 要求**进程堆全空**（:20760-20774，`begin_failed=nonempty_process_heap_baseline` ×2）；③Cheng 层任何 env 读取必走 `cheng_string_copy→cheng_malloc_locked`（**计数分配器**，std/os.cheng:483-490 等）——**「读取武装开关」本身破坏②**。Begin 本身 noalloc 设计（sha256_noalloc）——smoke 过恰证「空堆+Begin」可行，不可行的只是「从 Cheng 读开关」。**⇒ 纯 Cheng 代码（含授权钩子）数学上不可能武装账本**；钩子已打通命令链并如实报 `begin_failed`。
- **唯一剩余武装点 = cheng_cold.c 的 C main**（Cheng 运行时初始化前：`getenv("CHENG_CSG_ALLOC_LEDGER")` 命中即调 provider C begin——两者都不触 `cheng_mm_live_total`）；之后 compiler_csg 侧**现有接线零改动**即产出 per-owner Top-N。需重建 cheng_cold 工具再重烤（§8.62 方法学）。归 [bootstrap 引导层] 车道裁定，交割设计在 `.rebuild/m1_line/REPORT.md` §5，未动。
- **§8.63 全量交叉核对（234 源现势）**：retain parse 桶 **1,775,876 块**（冻结值 1,774,359，+0.086%）；replay 1,837,991（+0.10%）；release −2,106 逐块相同 ⇒ b2 现势与 c102 形态一致，D3/T6 未挪动 merge_parse 块级形态。
- **token 斜率新量（本轮新量，最小二乘）**：**0.488 块/token、截距 ≈ 0（−2.5）** ⇒ **留存是纯 token 线性，固定项在森林尺度不可见**（比 §8.55「~100 固定 + ~1.5 块/token」更精确）；RSS 口径 131.6-150.3 B/token ≈ 269-308 B/块（X2 模型 ~280 B/块同量级）。函数级摊分沿用 §8.66/8.67 冻结归因（post-D3/T6 时代）。
- **顺带定谳**：HEAD 基座烤车 src=13 撞 `name=Result` 可见性墙（default 轮 env 关同位同判词）⇒ HEAD 落后 b2_root 缺可见性修复族，弃用基座——反向证明今日可见性修复族的真实效力。
- **零回归铁证**：四夹具 primary.o sha 与 P1/SM1/F1 跨根记录逐一相同；金丝雀两轮 4/4；env 关零输出；历史判词族全 0（唯一判词 = B12 现势前沿，env 开/关逐字相同）。账本真字节 Top-N 未取得（§2 阻断），接线就绪即出数。

---

### 8.89 int-checked 字段读侧地雷拆除（F3 线）：validator int 读合同扩为「plain ∪ canonical（round-trip 精确比对）」——接受集 = 恰为 canonicalizer 的像；发射翻转半步移交 cargo 车道（2026-09-13 上午）

- **修复（validator.cheng +138/−10，预检 PASS；F3 于 croot 全矩阵验证后由主席落活树）**：新 `csgCanonicalIntegerFieldText`——纯文本精确解析 JSON 整数（不走 float64、int64 溢出门、非整数值拒、int32 出域拒）+ `CsgCoreJsonCanonicalize(Int64ToStr(v))` 权威回写逐字节比对；`csgTryInt32Field` plain 快路行为逐字节不变、失败才走 round-trip（11 字符门保留）；`csgCompilerWireDecodeIntArray` 元素与 `csgCompilerWireIntField` 同刀。**接受集 = 恰为 canonicalizer 的像**（复用权威本体做回写比对，零规则重写、零放宽）。
- **家族普查（CsgCoreMerkleStoreParseInt32 定义 merkle_store_codec.cheng:240，plain/禁前导零/溢出门）**：A 类（行 canonicality 管辖 = 地雷面，本轮修复）= validator:1116 csgTryInt32Field ← 5 处直接调用（native emission_plan 13 counts、section_chunk、symbol ordinal、relocation ordinal/kind/sectionIndex/symbolIndex、debug_relocation 全数值、c/python/finance/web/oracle 等全数）+ :1400 wire 数组 + :1556 wire int 字段；B 类（JSON string 承载，canonicalizer 不入字符串 = 非地雷，零改动）= merkle_store_codec:279 等 6 处。
- **验证（kd_f103p `c758f611…` 修前 / kd_f103p2 `99e08849…` 修后，探针 `CHENG_F3_FIELD_PROBE` 骑 admission 首跳）**：plain 54/1000/120000 两侧 ok=1 同值；**canonical 1e3→1000、2e3→2000、1e5→100000、-1e3→-1000 修前全拒 → 修后全 ok=1 值精确**；7 非法形（1E3/+1000/0x3E8/01000/1.0e3/10e2/1.21e5）两侧全拒；wire `[1,1e3]` 修前拒→修后 ok=1 tail=1000。kd_f103b（纯修无探针 `ae9caf53…`）金丝雀 4/4、四夹具合同全绿且 primary.o sha 与 SM1 跨根记录逐一相同、j1/j2 全 IDENTICAL、森林闭包烤 234 源 rc=0、历史判词族全零。
- **偏离披露**：`1e5` 被接受（100000 的 canonical 形 6>3 字符取 scientific，属 canonicalizer 的像；拒绝即重建两难、违反「接受集=像」不变量）——偏离任务书示例清单，如实披露。非法形以真非 canonical 文本为准。
- **发射翻转半步（移交 cargo 车道）**：int-checked 字段发射仍 Fmt 裸十进制直写 ⇒ mine 值域 plain 写法仍被**行 canonicality**拒（replay 合同本体，读侧不可放宽）——需把发射翻到 canonical 整形（F1 helper `primaryObjectCsgcCanonicalJsonIntText` 已在树，逐字段一行替换；`compiler_snapshot_cargo.cheng` AppendInt32 同样待翻）。**翻转前森林风险与 F1 交割时一致**（今日森林未命中属数值运气）。`csgRequireInt32RangeField`（:1186）既有 JFloat 接受面是否收窄留用户级裁定。

---

### 8.90 raw 族产权移植（T7 线）：五位点 managed/owned 化；**quarantine 掩蔽效应定谳**（sub-256KiB churn 的 footprint A/B 必须走 noq 窗口）（2026-09-13 上午）

- **修复（cheng_cold.c 净 +80/−27，两件补丁预检 PASS，对 5d6cfb374 单变量纯叠加）**：① `BODY_OP_PATH_READ_TEXT`（:40728 区）managed 化 + `codegen_store_owned_str_pair`；**read 错误臂改为发布零长 owned 新鲜值**（raw 车此臂泄漏整个映射；open 失败/空文件臂无分配保持 nil/0）；② `codegen_bytes_to_hex`（:36356）managed 2*len+1 + 基址键 + 循环出口补 NUL（新出口 epilogue，null/empty 臂直落 done 保持 nil/0）；③ `codegen_shell_quote`（:37168）双臂 managed + owned；④ `codegen_read_flag`（:37374）**仅两新鲜拷贝臂** owned，not-found 臂保持 flags=0（发布 default 参数借用视图，owned 会错释放 default 存储——borrow 语义不适用如实分类）；⑤ `codegen_path_join_slots`（:38020，双入口）managed L+R+2（原无 NUL）+ owned + 尾部 NUL；⑥ seal 扫描器 op 清单补 5 条。TEXT_SET_INSERT 定谳死 op（cold_parser.c 零路由无生产者）不硬修；READ_FLAG not-found 臂借用语义不适用。
- **quarantine 掩蔽效应（重要测量方法学）**：runtime quarantine 环（默认预算 50,331,648B）按设计持有已 free 小块（<256KiB 入环毒化；≥256KiB mmap 块绕环直还 OS）⇒ **sub-256KiB churn 的 footprint A/B 在默认环境被预算掩蔽**（AFTER 5000×4KB 28.3MB ≈ BEFORE 28.1MB 非修复失败）。判定链：50×1MB 默认环境即有界 → N 斜率不齐 → 读 runtime 源定位常数 → `CHENG_QUARANTINE=0`（官方诊断旋钮非抬门）重跑得干净判别。**T6 报告「17.5MB 分配器高水」实为同一形状，已澄清**。规则：sub-256KiB churn 判读必须 noq 窗口或 ≥256KiB 块。
- **验证矩阵（BEFORE = 冻结 stage3 / AFTER = cheng_cold_t7 `07d53498…`，行为输出逐字节同窗 A/B）**：readtext_loop 5000×4KB BEFORE 28.1MB 线性 → AFTER noq **1.77MB 平台**；大文件判别 50×1MB 默认环境 55.1MB → **3.7MB 有界**；N 无关性 N=20000 → 2.24MB（4× 迭代持平）；hex_loop 11.8MB → noq 1.54MB；sq_loop 27.9MB → 1.52MB；rf_loop 命中臂 6.7MB → 1.56MB（未命中臂双车本就有界分开取证）；pj_loop 8.4MB → 1.52MB；边值/行为输出全部逐字节相同。机器指纹：shim 调用 0 残留、`bl _cheng_malloc` + 基址存 + FLAGS=owned store + NUL 写 + 赋值 release 门实射（`cmp flags,1; b.eq → bl _cheng_mem_release`）。
- **全链**：kd_d7 全闭包烤制（`a266b12f…`）金丝雀 4/4；四夹具 vehicle 与 kd 层双 4/4；**D3 零回归**（concat repro 70.9MB）+ **T6 零回归**（IntToStr N 无关判别不劣化）；10 判词族 grep 全 0 文件。
- **移交**：x64 raw 族（SHELL_QUOTE/path_join/I32/I64_TO_STR）+ Linux 行为级验证；owned_cstring_result_to_str（:40093）未核；PATH_ABSOLUTE raw_empty 臂与 `codegen_current_dir_to_regs` 仅记录；TEXT_SET_INSERT 待生产者 lane；rv64 I64_TO_STR、x64 STR_JOIN windows 门（沿 T6）。

---

### 8.91 executable-call share 墙根修（B13 线）：compiler_csg executable-target 合同缺 share 内建豁免登记（同 range 先例，非解析链——share 无用户函数目标、fact 级固定类型内建链结构上装不下操作数型返回）；森林门轮本线判词 1→0、历史族全零、`typed expr:` 前缀保持 0；相位越过 B12 死点 r92_td_post_buildfacts 新达 r92_te/r92_tc 多周期，新前沿=receipt 域 normalized expression parser node missing（cleanup_cfg:5595 surface=Fmt）（2026-09-13，B13 线；B→…→B12 续攻轮）

- **判词（B12 交割前沿）**：` compiler csg: executable call unresolved callee=share source=…/cleanup_cfg.cheng:836`（b1202_b12fix stderr:6534 全场 1 次=末行；单源夹具 kd_b1202 同文复现 rc=2）。发射点 `CompilerCsgValidateTypedFactExecutableTarget`（compiler_csg.cheng:8594）:8606 `!fact.callResolved`，`range` 内建有豁免臂（:8607-8610）、`share` 无 → :8611 发射。
- **定性（豁免登记，解析链证伪）**：①全树无 `fn share`（std 仅 share_mt），share=规范内建所有权惯用面（spec :55 增引用计数返回可共享引用/:67 禁接借用），合同在 callResolved 后要求 callTarget/targetSourcePath/signatureLine 真实声明三元组——无处可解析，硬造=捏造身份；②fact 级内建解析臂（typed_expr :53579）依赖 `TypedExprBuiltinTypeCallResult` 按 callee 返回**固定类型文本**（miss 兜底 "str"），share 返回类型=操作数类型（B12 已按此在静态定型层递归），非常量、结构上不可登记，parser 级名单（memRetain 先例）在 parser.cheng 禁territory 且同走固定类型路径；③range 先例=同形态既定登记位（39d06f10f），share 语义同构（非函数调用、不进可达集）。**零劫持**：臂仅 `!callResolved` 可达，未来用户态 fn share 正常解析不进臂；**修复=补合同登记非跳过校验**。
- **修复（compiler_csg.cheng 净 +6/−0 纯插入，冻结件 preflight PASS ann=0 displaced=0 wedged=0，双树落定 patch -N --fuzz=0 双 rc=0、patched 区逐字节一致）**：`b13_fix_share_exec_contract.patch`——range 臂后补 `TypedExprStripVarType(fact.callCallee) == "share"` 臂（同款注释+return true）。
- **验证（kd_b1301 `7d0659b0` 对 kd_b1202 `299c15d0` 单变量：b2_root 唯一 delta=补丁 6 行；b2_root 自 b1202 烤后零漂移实测，活树多出 634 行 compiler_csg 差异全数归属 C2 已提交 285+未提交 349 且不在合同区）**：烤 rc=0 wall=205s 金丝雀 4/4。**夹具 A/B（kd_b1202 vs kd_b1301 同窗同树）**：b12_repro_share_callarg/share_struct 两件 rc=2 share 墙均消失（分别前进 value-definition 既有墙 / `unresolved structural Call callee=share` 单源 IR 墙）；b12_ctrl_plain_callarg+回归七件（b9 三/b10 两/b11 两）**stderr 逐字节一致零回归**（回归件零 share 引用 grep 实证，树补丁对其无效应）。
- **森林门轮（label=b1301_b13fix，raised 诊断门 env 同 b801/b905/b1003/b1104/b1202 口径）**：驱动 rc=2 wall=556s guard_hits=0 forest parsed/appended 234/234 ta_stream 234 pass1 235 max_csg_rss=1,376,618,128 ps_mine_max=1,623,952KB。判据（stderr 全量 7518 行）：**executable call unresolved（全族）1→0**；`typed expr:` 前缀/static argument/explicit conversion/frozen*/zero slot/redundant/各 drift/generic header/specialization receipt/source transaction/panic **全 0**；compiler parser receipt 0→1（=新前沿本身）。**相位推进**：b1202 止于首个 r92_td_post_buildfacts（:6533）即死、r92 stage 线 305 条；b1301 越 td（:6232）连过 r92_te_post_accumulate/r92_tc_post_consume 并多周期重入（r92 stage 线 **1283** 条），src=2 decls=310 照旧全处理、src_done=0/1 照旧。
- **新前沿墙（b1301_b13fix stderr:7518 末行；receipt 领地，B14 攻）**：`compiler parser receipt: normalized expression parser node missing exprIndex=62 kind=4 line=5595 surface=Fmt rootNode=-1 originNode=-1 role=0`——cleanup_cfg:5595 `cleanupCfgFail(` 多行调用语句。定性（静态）：receipt 节点身份族——多行调用行 normalized expr 行缺 parser node 绑定（rootNode/originNode=-1、role=0），与 B6 修的 break/continue/defer（kind=20/21）同族不同 kind（本例 kind=4），属 compiler_parser_receipt/parser 产线契约面，非本轮补丁产物（该相位 b1202 未达；B12 表内该族=0 系相位未达而非已清偿）。**src_done=2 未达成**（receipt 新墙在 src=2 打标前）；C2 §8.71 sha 对拍欠账保留（src=2 仍未通、两臂对拍基线未冻结）。
- 边界：活树唯一改动=compiler_csg.cheng +6（对 HEAD 349/0→355/0，M1/C2 区 1673-2156/36356+ 零接触）；typed_expr/parser/receipt/typed_expr_type_arena/backend_driver_dispatch_min/program_support_backend/bootstrap/cleanup_cfg 零改动；夹具 13 件撤离 b2_root/src/tests（grep=0）；烤炉槽 owner+trap（让行 l4_decl_trace pid 86604），每轮 ps 只读无 pkill；无探针轮（合同面单一，夹具 A/B 直接定谳）。**瑕疵如实记录**：复用 b12_run_fixture_noslot.sh（b12_ 输出名）覆盖了 B12 的 b9/b10/b11/b12 夹具 stderr 存档——回归件与树补丁无交互故本窗重跑件即有效基线；两 repro 补丁前 stderr 可由冻结件 patch -R 精确复现（判词原文以 b1202_b12fix stderr:6534 为准）。

---

### 8.92 join 坐标 StrFormat 播种墙根修（B14 线）：parser 行扫描对 join 组内 Fmt 事实以（头行，joined 列）播种、StampStrFormatFacts 按 FmtLiteral 节点真实 token (line,col) 盖章——两坐标系对 join 续行永不相等 → 事实恒无 node 身份；修复=join 组按 part 拆开、真实行号+列基播种（B6 事件锚先例：事实 (line,col) 必须等于锚 token 行列）；森林门轮 kind=4 Fmt 判词 1→0、历史族全零、`typed expr:` 保持 0；相位 r92 stage 1283→1374 条深达 cleanup_cfg function_index=192，新前沿=同族 kind=2 `..<`（cleanup_cfg:7028，静态定性非 join 形）（2026-09-13，B14 线；B→…→B13 续攻轮）

- **判词（B13 交割前沿）**：` compiler parser receipt: normalized expression parser node missing exprIndex=62 kind=4 line=5595 surface=Fmt rootNode=-1 originNode=-1 role=0`（b1301_b13fix stderr:7518 全场 1 次=末行）。发射点：`parserReceiptNormalizedExprIdentityNode`（compiler_parser_receipt.cheng:8924，origin else root）两值皆 -1 时 :9028-9031 发射。kind=4=`NormalizedExprStrFormat`（parser.cheng `NormalizedExprKindCode`）。
- **定性（产线缺口，零 receipt 放宽）**：①Fmt 事实唯一播种器 `ParserAppendFmtExprsLine`（parser.cheng:6276 区）在行扫描主循环对 `codeLines[i]`（`ParserJoinContinuationLines` 输出=头行原文+续行 trim 文本空格连接、被消耗槽置空串）扫描——join 续行上的 Fmt 以（头行，joined 列）播种（cleanup_cfg:5595 `cleanupCfgFail(` 头行 + :5596 Fmt 续行 → 事实 line=5595，与判词逐字）；②唯一盖章器 `ParserValueExprStampStrFormatFacts`（:34552）对每个 FmtLiteral 节点按 span-start token 真实 (line,col)（=5596）找事实，函数头注释即契约「the row's (line, column) IS the Fmt token's start, unique per position」——join 形两坐标系永不相等 → 永不盖章 → origin/root 恒 -1；③`ParserValueExprBindDedicatedNormalizedCall` 只认 call 节点（FmtLiteral 非调用节点）、`BindRootCallIdentity` 只认语句根——嵌套 Fmt 事实无第三条绑定路。最小复现（kd_b1301 四夹具，`.rebuild/b_line/b14_fixture_tree_*.cheng`）：v1 两件 rc=2 判词逐字（line=4/9 均=join 头行）；v2 两件（定义 callee）receipt 过后分别撞 `executable call unresolved callee=failNow` / `FieldGet layout is not in exact authority` 既有单源墙。
- **修复（parser.cheng 净 +67/−7，冻结件 `b14_fix_fmt_join_coords.patch` preflight PASS ann=0 displaced=0 wedged=0，双树 `patch -N --fuzz=0` 双 rc=0、修复区逐字节一致；活树对 HEAD 67/7，compiler_parser_receipt.cheng 零改动）**：①`ParserAppendFmtExprsLine` 重构为零基包装 + 列基核 `ParserAppendFmtExprsLineColumnBase`（columnBase 同时进列与 endColumn，单行行为逐位不变）；②新 `ParserAppendFmtExprsJoinGroupLine`：头行 part（未 trim 整行，列恒等）+ 各 join 续行槽按真实行号播种；续行 contribution 与 `ParserJoinContinuationLineAt` 的 part 抽取同一函数（`ParserTrimmedLineWithoutCommentQuoteAwareSlashAware`），列基=剥离的前导空白宽；纯注释/空白续行 trim 后为空零播种（与 join part 跳过规则一致）；追加时点在头行行扫描内、层内行号组序不变量保持（B6 组扩展事件同形）。**瑕疵如实记录：v1 漏列基核 `@borrows`，首次烤制被 borrow-check 当场拦截（`borrowed actual cannot bind non-var non-@borrows formal caller=ParserAppendFmtExprsJoinGroupLine callee=ParserAppendFmtExprsLineColumnBase`），`patch -R` 撤离 v1 重落 v2（冻结件覆盖同名，v1 判词文本存本条与轮次记录）**。
- **验证（kd_b1401 `55be84ff` 对 kd_b1301 `7d0659b0` 单变量；b2_root src 自 b1301 烤后唯一 mtime 变动=本线 parser.cheng（find 实测计 1），主仓 HEAD 窗内被他线推进 3989361a8→2fc2c965d（physics/r2c，b2_root=纯文件快照与此无关））**：烤 rc=0 wall=205s 金丝雀 4/4。**夹具 A/B（kd_b1301 vs kd_b1401，同窗同 env noslot）**：b14_repro_multiline_fmt / b14_repro2_multiline_fmt 两件 rc=2 判词消失、分别前进=同款 ctrl 墙（`unresolved callee=failNow …:4` / `FieldGet layout … node=2`），路径归一后 repro==ctrl 逐字节（多行 Fmt 行为与单行完全一致）；b14_ctrl_singleline_fmt / b14_ctrl2_singleline_fmt 两件 **stderr 逐字节一致零回归**。
- **森林门轮（label=b1401_b14fix，raised 诊断门 env 同 b801…b1301 口径）**：驱动 rc=2 wall=596s guard_hits=0 forest parsed/appended 234/234 ta_stream 234 pass1 235 max_csg_rss=1,542,555,400 ps_mine_max=1,674,608KB。判据（stderr 全量 7612 行）：**normalized expression parser node missing 之 kind=4 Fmt 面 1→0**；executable call unresolved（全族）/`typed expr:` 前缀/static argument type unavailable/explicit type conversion/frozen*/zero slot/redundant/各 identity drift/generic declaration header invalid/specialization binding receipt drift/source transaction/panic **全 0**；compiler parser receipt 1→1（=新前沿本身，kind=2 换防）。**相位推进**：r92 stage 线 1283→**1374** 条、slice_memory 函数标记 9→12（深达 cleanup_cfg function_index=192）；src=2 decls=310 照旧全处理、src_done=0/1 照旧。
- **新前沿墙（b1401_b14fix stderr:7612 末行；receipt 领地，B15 攻）**：` compiler parser receipt: normalized expression parser node missing exprIndex=25 kind=2 line=7028 surface=..< rootNode=-1 originNode=-1 role=0`——cleanup_cfg:7027-7028 双物理行 for 头 `for slotOffset in` + `0..<plan.ownershipOpSiteSnapshotCounts[siteIndex]:`。**定性（静态，非 join 形）**：事实 line=7028=真实 `..<` token 行；`for slotOffset in` 行尾 `n` 不在 `ParserLineNeedsContinuation` 触发集（括号深度/`!=` `==` `<=` `>=` 行尾/`| & + * / , < >`），join 未消耗 :7028——与本线 join 形不同产线路径；Range 事实绑定兜底=donor 继承（parser.cheng 34838-34875：无主 Range 从同语句 donor 拷 root/origin/role），donor 自身未绑或扫描条件不含此形时 -1 原样泄漏。**B15 需探针轮定性 range 绑定产线缺口位**。**src_done=2 未达成**（新墙仍在 src=2 打标前，如实记录）；C2 §8.71 sha 对拍欠账保留（src=2 仍未通、两臂对拍基线未冻结）。
- 边界：夹具四件撤离 b2_root/src/tests（grep=0）；烤炉槽 owner+trap 全程（b1401 烤制与门轮 owner=b14line_*，槽死检让行协议同 B13）；每轮 `ps aux | grep "[k]d_"` 只读、无 pkill -f；bash 无 heredoc；无探针轮（种子/盖章两坐标契约面单一，四夹具 A/B 直接定谳）。

---

### 8.93 跨行语句头 Range 事实结构化绑定墙根修（B15 线）：parser donor 继承扫描窗为「同行」限定，双物理行 for 头（`for x in` + 换行 `0..<n:`）的 LoopSource 语句根事件与 ForStmt 锚事实都在 for 关键字行、Range 事实所在续行零其他事实 → donor 窗空 → root/origin 恒 -1 泄漏成 receipt 判词；修复=新增结构化包含绑定臂（语句根事件的根表达式节点 byte-span 覆盖事实 (line,col) 即所属语句，经 BindStatementRootEvent 取得与同行 donor 路完全一致的 root/span/role/origin 身份）；森林门轮 kind=2 `..<` 判词 1→0、历史判词族全零、`typed expr:` 保持 0；r92 stage 1374→1521 条、源内事实行深 7028→8402，新前沿=同族 kind=12 IfStmt（cleanup_cfg:8402 let 绑定内跨行 if-ternary 条件事实，B16 攻）（2026-09-14，B15 线；B→…→B14 续攻轮）

- **判词（B14 交割前沿）**：` compiler parser receipt: normalized expression parser node missing exprIndex=25 kind=2 line=7028 surface=..< rootNode=-1 originNode=-1 role=0`（b1401_b14fix stderr:7612 全场 1 次=末行）。kind=2=`NormalizedExprRange`（`NormalizedExprKindCode`）；发射点 `parserReceiptNormalizedExprIdentityNode`（origin else root）两值皆 -1。
- **定性（探针轮实证，kd_b15probe v3 `531478bd`，env=CHENG_RANGE_BIND_PROBE 门控默认零输出）**：①Range 事实播种侧坐标正确（`ParserAppendRangeExprsLine` 按真实 token 行列播种，判词 line=7028 即 `..<` token 行）；②绑定侧仅两路：语句锚 hash 循环（Range role=Invalid 被门）+ donor 继承（`ParserValueExprStampStrFormatFacts` 尾段 34826-34876），donor 扫描条件 `donorLine != rangeLine → continue` = **同行限定**；③探针读数（最小复现 b15_repro2line_for_range，双物理行 for 头）：`range_idx=1 line=5 col=14 donor_count=0 donor_index=-1 root=-1 origin=-1`（B14 建议的 donor 窗读数，窗空坐实）；事件表 6 条中 **event=1 role=8（LoopSource）span=(5,13)-(5,17) 恰为 `0..<4`，contains=yes 全场唯一**——所属语句的身份就挂在 for 关键字行的事件上，同行 donor 路只是它的单行特例。**瑕疵如实记录：探针 v1/v2 把节点 span byte offset 误当 token index 反查行号，`token index out of bounds` 被当场打脸——节点 span 与 TokenStartAt/TokenEndAt 同为 byte 偏移坐标系（StampStrFormatFacts 的 token 锚定先例），v3 改 token walk 反查端点 (line,col)（起点 TokenStartAt==spanStart、终点 TokenEndAt==spanEnd，同 sourceId）。**
- **修复（parser.cheng 净 +75/−0，冻结件 `b15_fix_range_containment_bind.patch` preflight PASS ann=0 displaced=0 wedged=0，生成器锚点 count!=1 即失败；v1 曾把新函数插在 BindNormalizedStructureAnchors 文档注释与声明之间（规则 10① 位移形，仅注释非 @注解），排队中的烤制被主动停止、v2 改块边界插入重落）**：新 `ParserValueExprBindRangeToContainingStatementEvent(layer, rangeIndex)`——遍历语句根事件，token walk 反查根节点 span 端点 (line,col)，span 覆盖 Range 事实 (line,col) 且唯一命中即 `ParserValueExprBindStatementRootEvent`（与同行 donor 路同一函数、同一身份）；端点未反查到/零命中/多重命中（表达式根 span 两两不相交，多重=产线不变量破坏）三种情形都维持 -1 原样交 receipt 定谳（绑定兜底不夺判定权，不 panic）。接线点在 donor 扫描两臂全失败之后（`if donorIndex < 0:` 内），现役已绑定事实零触碰。零 receipt 放宽，compiler_parser_receipt.cheng 零改动。
- **验证（kd_b1501 `b24df640` 对 kd_b1401 `55be84ff` 单变量；b2_root src 自 kd_b1401 烤后零 mtime 变动（find 实测计 0），主仓 HEAD 已被 B14 提交 15b678d4a 收编、活树 parser 对 HEAD 开工 0/0）**：烤 rc=0 wall≈266s 金丝雀 4/4。**夹具 A/B（kd_b1401 vs kd_b1501，同窗同树同 env noslot）**：b15_repro2line_for_range（双行 for 头 `..<`）基线 rc=2 判词逐字 `…exprIndex=1 kind=2 line=5 surface=..< rootNode=-1 originNode=-1 role=0` → 修复后 rc=2 判词消失、前进 `typed expr binding: exact local value-definition group unavailable`；b15_ctrl1line_for_range（单行同文）基线与修复后均 rc=1 同款 typed expr 墙且 **stderr 逐字节一致（零回归）**；修复后 **repro 与 ctrl stderr 逐字节一致**（双物理行 for 头与单行行为完全同影，路径归一）。夹具两件已撤离 b2_root/src/tests（grep=0），源树版归档 `.rebuild/b_line/b15_fixture_tree_*.cheng`。
- **森林门轮（label=b1501_b15fix，raised 诊断门 env 同 b801…b1401 口径，门轮金丝雀先过 canary_rc=0）**：驱动 rc=2 wall=987s guard_hits=0 forest parsed/appended 234/234 ta_stream 234 pass1 235 max_csg_rss=1,494,320,856 ps_mine_max=1,578,640KB。判据（stderr 全量 7759 行）：**normalized expression parser node missing 之 kind=2 `..<` 面（本线族）1→0**；executable call unresolved（全族）/`typed expr:` 前缀/static argument type unavailable/explicit type conversion/frozen*/zero slot/redundant/各 identity drift/generic declaration header invalid/specialization binding receipt drift/source transaction/panic **全 0**；compiler parser receipt 1→1（=新前沿本身，kind=12 换防）。
- **相位推进实证**：r92 stage 线 1374→**1521** 条；slice_memory 函数标记 12（function_index 最深 192，与 B14 持平）；**cleanup_cfg 源内 receipt 事实行深 7028→8402（+1374 行）**；src=2 decls=310 照旧全处理、src_done=0（binary_types）/1（lsmr_types）照旧打标。
- **新前沿墙（b1501_b15fix stderr:7759 全场 1 次=末行；receipt 领地，B16 攻）**：` compiler parser receipt: normalized expression parser node missing exprIndex=12 kind=12 line=8402 surface=localSlot >= 0 && localSlot < plan.localTypeKinds.len rootNode=-1 originNode=-1 role=0`——cleanup_cfg:8402-8406 `let auditSlotKind =` + 8403 `if localSlot >= 0 && localSlot < plan.localTypeKinds.len:`（let 绑定初始化式内的跨行 if-ternary）。kind=12=`NormalizedExprIfStmt` 结构化种子事实锚在 `let` 行（8402），而条件根事件锚在 `if` 关键字行（8403）——与 B15 同族（事实锚行≠事件锚行）、不同形（结构化条件种子，StampStrFormatFacts 的 sidecar-structured 段按 (line,col) 找事件不中）。B16 需定性：结构化种子行的取行产线（为何锚在 let 行而非 if 行）与绑定的行容差缺口位。
- **额外目标读数**：src_done=2 **未达成**（新墙仍在 src=2 打标前，如实记录）；逐源推进读数=r92 stage 1374→1521、源内行深 7028→8402；**C2 §8.71 sha 对拍欠账保留**（src=2 仍未通、diag/hardcut 两臂对拍基线未冻结，本线无可产物化对象）。
- 边界：typed_expr/compiler_csg/typed_expr_type_arena/backend_driver_dispatch_min/program_support_backend/bootstrap/cleanup_cfg 零改动；禁 commit/push、未建分支/worktree；探针三版与修复件全冻结在 `.rebuild/b_line/`（b15_ 前缀）；烤炉槽 owner+trap 全程（purpose=b14line_b1501/b15line_*，t8 线骑乘窗口让行协议生效一次）；每轮 `ps aux | grep "[k]d_"` 只读、无 pkill -f（排队中的本线烤制进程按具体 pid 停止一次）；bash 无 heredoc；补丁走冻结件 + `patch_preflight.py`（PASS）+ `patch -N/-R --fuzz=0`。

---

### 8.94 X2 刀A 落地（T8 线）：单遍零分配融合逐字段等价 234/234、内存面 −34K 块/−21.8MB；**T4 时间归因证伪——实测 −5.8% 非 −40~50%**，剩余 ~29s 在 decl 循环（2026-09-14 凌晨）

- **实现（typed_expr.cheng +223/−2，预检 PASS，纯新增两函数 + build 体两遍调用序列换融合调用）**：`typedExprBuildSealedSourceLineIndexAndDeclaredTypes`——行索引臂与既有逐语句同码（override 回填/cardinality 不变量/4096 守卫全保留），declaredTypes 状态机逐行边界同构挂载；等值行（常态）在 source.text raw 切片 view 上跑（零分配），override 行退回原行；配套 `typedExprInlineTypeDeclTailView`（@borrows view 等价，省 2 次 CloneStr/非缩进行）。`CHENG_T8_EQUIV_DUMP` 门控对拍 rig。
- **逐字段等价自证**：234/234 源 `t8_equiv_ok`、0 mismatch（对拍字段：sourceByteLength/行长列/行数/traversalCount/三个 override 列/declaredTypes 全列逐元素）。rig 自身 v1 缺 scratch 身份字段被 identity 检查首源硬拦（**let-it-crash 生效，探针缺陷当场暴露而非静默假绿**）。
- **同窗 A/B（t4 探针，抬门诊断轮背靠背）**：**build 31,232→29,408ms（−5.8%）**、metadata_ctx_build −5.6%、semantic_tables 控制段 ≈0（窗等价）；meta_totals **−34,450 活块/−21.8MB**；前沿点 max_csg_rss −217MB 同向改善。产物 primary.o 逐字节 IDENTICAL；四夹具门轮 stderr 归一 md5 全同；判词族零回归（唯一判词 = B15 在攻的 kind=2 前沿，双臂同位）。
- **T4 时间归因证伪（诚实更正）**：预测 −40~50% 基于「双遍行扫描+逐行临时 str 占 build 33.5s」——实测双遍合计仅 ~6%。**剩余 ~29s 在 decl 循环**（`TypedExprFunctionScopeEndLine` 逐 decl 全 body 逐行双重分配扫描、逐 decl header 解析、generic 解析）、type 块行走查、module-const/global bindings 扫描。**后续刀必须先用 t4 探针细分 decl 循环计时再定刀位**（交回 T4/TM1）。
- **刀A 保留理由**：等价已证、零回归、内存面同向改善、消除每非缩进行 2 次 CloneStr 稳态分配、为后续刀清除一遍扫描。刀 B（owner-roots 上提）未动（先两点计时）。
- 现场纪律：发现 B15 正在 b2_root 烤制时，已落补丁 5 分钟内识别冲突当场 `git apply -R` 还原（69682 行），并经 source_snapshot_root_cid 对照 + 烤制时序证明 kd_b15probe 未被污染；改用独立 `t8_root`（= b2_root 的 kd_b1401 烤制态 + 唯一 delta 刀A），常驻复用。单变量链 kd_b1401 `55be84ff` → kd_t8b `0bd34b65`。

---

### 8.95 跨行 if-ternary 绑定初式结构化种子墙根修（B16 线；原编号 8.94 与 T8 条目撞号就地顺延）：IfStmt 种子取行产线本就正确（锚=if token 真实物理行列），缺口在绑定侧——裸 `=` 行尾在树层把下一物理行的 `if cond:` 收进同一绑定初式语句（事件=BindingInitializer 锚在 let 行声明 token），而行结构化层按物理行独立把 `if` 行播成 IfStmt 种子（role 期望 Condition）→ W7 精确 (line,col)+role 查找必不中 → root/origin -1 泄漏；修复=把 B15 包含绑定臂接入 W7 不中路径 + 命中后同位随绑裸 if 关键字行；森林门轮 `compiler parser receipt` 全族 1→**0**、其余历史判词族全零；r92 stage 1521→1641 条、cleanup_cfg 源内事实行深 8402→**10291**，新前沿=`typed expr: call declaration static argument type unavailable`（cleanup_cfg:10291，B17 攻，typed_expr 领地）（2026-09-14，B16 线；B→…→B15 续攻轮）

- **判词（B15 交割前沿）**：` compiler parser receipt: normalized expression parser node missing exprIndex=12 kind=12 line=8402 surface=localSlot >= 0 && localSlot < plan.localTypeKinds.len rootNode=-1 originNode=-1 role=0`（b1501_b15fix stderr 全场 1 次）。kind=12=`NormalizedExprIfStmt`，role=0=Invalid（未绑）。
- **定性修正 + 缺口位（探针轮实证，kd_b16probe `d455f99f`，env=CHENG_IFSTMT_BIND_PROBE 门控默认零输出）**：①B15 报告「种子锚在 let 行 8402、事件锚在 if 行 8403」为行号错位读——实测 cleanup_cfg 几何为 8401=`let auditSlotKind =`、**8402=`if ...:`**，判词 line=8402 就是 `if` token 物理行；种子取行产线（`parserReadControlStmtSeedRangeMode(i+1,…)`）按真实 token 行列播种并经 FreezeAnchor 冻结锚 token，**产线无缺口**。②真缺口在绑定侧：树层把 `let x =` + 跨行 if-ternary 解析成**一条** BindingInitializer 语句（裸 `=` 行尾树层续行），事件锚在 let 行声明侧 `=` token、根节点=if-ternary 表达式（span 覆盖 8402-8405 全文）；行结构化层却按物理行把 8402 独立播成 IfStmt 种子（role 期望 Condition）——事件锚≠事实锚，W7 精确 (line,col)+role 线性查找必不中。③探针读数（最小复现 b16_repro_let_if_ternary）：`fact_idx=2 kind=11 line=5 col=9 role_want=7 root=-1 origin=-1`；事件表 5 条中 **event=1 role=1（BindingInitializer）anchor=(4,23) root=11 span=(5,9)-(8,14) contains=yes 全场唯一**；同位另有 kind=1（NormalizedExprIf/DetailIfKeyword）裸 if 关键字行被 kind=12 遮掩（健康形由 StampConditionFact 按 Condition 事件认领，病形无条件事件可认领）。
- **修复（parser.cheng 净 +45/−0，冻结件 `b16_fix_ifstmt_containment_bind.patch` preflight PASS ann=0 displaced=0 wedged=0，生成器锚点 count!=1 即失败；四版过程如实记录）**：①v1（+17/−1）W7 不中路径直调 B15 包含臂——**烤过金丝雀但 A/B 判词逐字节未变=假绿**，根因=W7 循环顶部托管 struct 元素读拷贝被自宿主后端下成破坏性 move（W7X/B4 同族缺陷）源槽清零，包含臂函数内按索引重读拿到 (0,0) 包含全不中；②v2（+21/−0）调用前补写回——**被烤制当场拦**（exact-owner 验证：`expr` 双 store，第二次非 exact live owner，primary object emit failed），无静默问题；③v3（+22/−0）单一 store：写回修复源槽→调用→两路 continue（不绑定路径函数 false 路仅标量读不动槽，槽保持修复后未修改值）——A/B 证 kind=12 墙消失、前进到被遮掩的 kind=1 同位行墙；④v4（+45/−0，终版）=v3+包含臂命中后**同位随绑**：同 (line,col) 的裸 IfKeyword 行（root>=0 已认领者跳过）绑同一语句根事件（Range 事实同位不可能有 if 关键字行，对 B15 接线自然零作用）。零 receipt 放宽，compiler_parser_receipt.cheng 零改动；不绑定路径维持 -1 原样交 receipt 定谳（fail-closed 不夺判定权）。
- **验证（kd_b1601 `e6f52a07` 对 kd_b1501 `b24df640` 单变量：b2_root 对 b1501 态 delta=补丁 +45/−0 唯一；receipt/typed_expr/cleanup_cfg git 零改动）**：烤 rc=0 wall≈202s 金丝雀 4/4。**夹具 A/B（kd_b1501 vs kd_b1601，同窗同树同 env noslot）**：b16_repro_let_if_ternary（跨行 if-ternary 绑定初式）基线 rc=2 判词逐字 `…exprIndex=2 kind=12 line=5 surface=plan >= 0 && plan < 9 …role=0` → v4 后 rc=1 **compiler parser receipt 全消**、前进 `typed expr: node origin proof is missing or contradictory fn=main line=5 op=38 parser_node=-1 … surface=plan`（该形夹具级下游边界）；b16_ctrl1line_let_if_ternary（单行同文，兄弟形：无结构化种子，kind=1 行即首墙）基线与 v4 **stderr 逐字节一致（零回归）**，其 kind=1 单行形森林零出现、留后续线。夹具两件已撤离 b2_root/src/tests（grep=0），源树版归档 `.rebuild/b_line/b16_fixture_tree_*.cheng`。
- **森林门轮（label=b1601_b16fix，raised 诊断门 env 同 b801…b1501 口径，门轮金丝雀先过 CANARY_PASS）**：驱动 rc=1 wall=1619s guard_hits=0 lease_hits=0 forest parsed/appended 234/234 ta_stream 234 pass1 235 max_csg_rss=1,534,445,320 ps_mine_max=1,297,376KB。判据（stderr 全量 7887 行）：**`compiler parser receipt` 全族 1→0**（含本线 kind=12 面与全部被遮掩面）；executable call unresolved/kind=4/kind=2/frozen*/W7X/redundant/各 identity drift/generic declaration header invalid/specialization binding receipt drift/source transaction/panic **全 0**；`typed expr:` =1=**新前沿本身**（下条）。
- **相位推进实证**：r92 stage 线 1521→**1641** 条（+120）；slice_memory 函数标记 12（function_index 最深 192，与 B14/B15 持平）；**cleanup_cfg 源内事实行深 8402→10291（+1889 行）**；src=0（binary_types）/1（lsmr_types）src_done 照旧打标、src=2 decls=310 全处理。
- **新前沿墙（b1601_b16fix 末判定行；typed_expr 领地，B17 攻）**：`typed expr: call declaration static argument type unavailable source=…/cleanup_cfg.cheng name=cleanupCfgRelocateDefinitionCoordinate line=10291 scope=cleanupCfgInsertFlagInitializers scope_start=10236 args=bodyIR,`。
- **额外目标读数**：src_done=2 **未达成**（新墙仍在 src=2 处理中，如实记录）；逐源推进读数=r92 stage 1521→1641、源内行深 8402→10291；**C2 §8.71 sha 对拍欠账保留**（src=2 仍未通，本线无可产物化对象）。
- 边界：本轮对 src/** 唯一改动=parser.cheng（活树对 HEAD +45/−0 纯叠加，B15 75 行已被 HEAD 收编）；typed_expr/compiler_csg/typed_expr_type_arena/backend_driver_dispatch_min/program_support_backend/bootstrap/cleanup_cfg 零改动；禁 commit/push、未建分支/worktree；探针/修复四版全冻结 `.rebuild/b_line/`（b16_ 前缀，v1 假绿件与 v2 烤拒件分名保全）；烤炉槽 owner+trap（purpose=b16line_*；开工窗 t8 线持槽跑门轮，本线按 owner-pid 协议排队，至烤制窗槽已释放无争用）；每轮 `ps aux | grep "[k]d_"` 只读、无 pkill -f；bash 无 heredoc；补丁走冻结件 + `patch_preflight.py`（全 PASS）+ `patch -N/-R --fuzz=0`。瑕疵如实记录：夹具脚本 `--in` 用无前缀 `$FIX` 致 4 次 `parser: missing source` 空跑（bash -x 对拍定位，命名错位非环境瞬态）。

---

### 8.96 流式/全量注册 parity 矩阵定谳（PE1 线，纯只读零源改动）：**流式索引在主森林拓扑已带 Core 全量行**（36564 以全 context 集跑 Core，domain-slots 写入结构上强制 Core 先行）；真缺口=B9 手抄副本 8/9 行 + 单源/夹具拓扑全域缺席；收口=共享登记函数（ctx_source 哨兵 + RequireFresh/SkipExisting 双策略），终止「每撞一墙补一行」（2026-09-14，PE1 分析线）

- **Core 全量注册集**（`typedExprBuildIndexForContextsCore`，typed_expr.cheng:37307-37470）：Pass1 逐 context——`ctx_source`(:37330)+contextSourcePaths、module-const 三行（`module_const`/`ctx_module_const_source`/`module_const_scanned`，:21563-21604）、content-cache（`function_header_return`/`function_header_scanned`，:36855）、contextMetadataDomainCounts 8 slots(:37353-37360)；Pass2 逐域——import 2 行（`ctx_import_alias`/`ctx_import_target`+import 边 :37372-37382）、declared 4 行、ref 3 行、alias 3 行、**enum 9 行**（:37429-37445）、field 9 动作（field-node layout 列+5 行+count Increment+2 vis，:37451-37469）。freeze 校验区（:37133-37305）对每行 ExactEntryValue 重验=另一消费证据。
- **拓扑定谳（结构证明）**：compiler_csg 唯一管线 = :40463 全源 metadata context → :36564 exact-index 构建（sealCallDeclarations=false → :37697 Core 跑在**完整** `work.typedMetadataContexts` 上）→ :36864 逐源 append → :37140 seal。`TypedExprBuildIndexAppendContextCallDeclarationsManual` 无条件写 `contextMetadataDomainCounts[ctxIndex*8+6/7]`（:37497-37508）而 `TypedExprBuildIndexNew`(:31053) 不预置该数组 ⇒ **空 Core 下首个 append 必越界 panic**——B9 注释（:37610-3717）/总账部分「空 Core」措辞对应单源/夹具拓扑（§8.82 限界① metadata 相 ctxCount=0），非 compiler_csg 主路径。运行时佐证：kd_b901「共享索引行 Unique+typeName 无人查」（行已在 B9 之前）；r92 重建 context 经 AttachStable 借同一索引（:49584-49587）。
- **append 现势**（`TypedExprBuildIndexAppendSourceCallDeclarationsManual` :37665）：B9 enum 8 行幂等 append（:37618-37662，守卫 :37640）**在主拓扑恒空转**（Core 已登记，守卫全跳），真实效力在夹具拓扑；call-declarations 全列+`ctx_function_decl_name_source`(:31251)+slots 6/7=Core 不可知增量域，流式独有。
- **差集矩阵（13 条目，详见 `.rebuild/pe1_line/REPORT.md` §3）**：D1 `ctx_source`+slots0-5、D2 `module_const`、D3 `ctx_module_const_source`（§8.82 限界③）、D4 function-header cache、D5 `ctx_import_alias`、D6 `ctx_import_target`+边、D7 `ctx_declared_*`、D8 vis declared/composite、D9 `ctx_ref_*`+vis ref、D10 `ctx_alias_*`+vis alias_def、D11 enum 9 行（**B9 只补 8，缺第 9 行 vis `ctx_import_enum_type`——半登记态实例，读侧 B11 已绕、登记侧仍缺**）、D12 `ctx_field_*` 全列（:17637/:44942/:45418 消费链真实）、D13 `ctx_function_decl_name_source`（append 自带非缺口）。每条目含键形状/消费查询函数名/流式相真消费判定（调用链可达 r92/facts 相即「真消费」）。**预测未撞墙**：D3/D5-D12 在单源/夹具拓扑下与 B9/B11 同构，夹具消费面扩展即复现同族缺席判词——这就是「每撞一墙补一行」的剩余风险清单；森林主相无缺口。
- **收口施工图（parity-by-construction）**：抽 `typedExprBuildIndexRegisterContextMetadataRows(index, contexts, ctxIndex, duplicatePolicy)`——Core 传 RequireFresh（现语义逐位不变）、流式/夹具传 SkipExisting（B9 守卫泛化）；**幂等哨兵=`ctx_source` 行存在即整 context 跳过**（该 context 首个 Register，天然原子），消除「成员 N-1 行」半登记态；call-declarations 域与 slots 6/7 仍归 append/finish。改动面：typed_expr.cheng :37307-37470/:37618-37662/:37665-37677，compiler_csg 零改动。风险：R1 行序等价（global 行 hardConflict=false 聚合顺序无关）、R2 visibility query-cache seal 后禁突变（哨兵先行天然满足）、R3 `ctx_import_target` 目标依赖（SkipExisting 路径全 context 已在，无依赖）、R4 哨兵原子性。验证：V1 重构前后索引行集指纹哈希对拍（参照 T8 逐字段等价 rig）；V2 **现成钩子定谳拓扑**——`CHENG_BUILDINDEX_TRACE=1`（:37591 census，:36863/:36874 已埋）src_index=0 pre_append 行计数即证 Core 是否全量先行，零新代码；V3 kd 烤+金丝雀 4/4+森林门轮判词族全零+B9/B11 回归三夹具逐字复现；V4 mini context 双路径指纹相等+半登记态哨兵拦截。
- 边界：纯只读分析，src/** 零改动零烤炉；矩阵证据全部为源码行号+既有轮次产物（kd_b901-b905b、§8.82/§8.86）；「流式相恒 Missing」类总账措辞按本定谳重新归属为查询键/相态问题而非行缺席，不改既有判词结论。

---

### 8.97 192 族新实例（cleanup_cfg:10291 args=bodyIR 跨行字段链）定型墙根修（B17 线；原编号 8.96 与 PE1 条目撞号就地顺延）：`TypedExprPostfixValueTypeFromRoot` 点号臂不跳行尾点号续行空白——`TypedExprTextIsSimpleFieldPath` 因含空格拒绝跨行文本、postfixRoot 臂成员名提取在 `.` 后遇 `\n` 即返空 fail-closed；修复=点号/箭头臂成员名提取前跳续行空白（cursor 推进同步计入，不扩大接受集零放宽）；森林门轮（t3000 完整窗）本线 192 族 1→**0**、历史判词族全零；r92 stage 1641→**2194**、cleanup_cfg 源内行深 10291→**14387**，新前沿=`typed expr: resolved call missing concrete type`（cleanup_cfg:14387 importc memRefCount 面，B18 攻）（2026-09-14，B17 线；B→…→B16 续攻轮）

- **判词（B16 交割前沿）**：`typed expr: call declaration static argument type unavailable source=…/cleanup_cfg.cheng name=cleanupCfgRelocateDefinitionCoordinate line=10291 scope=cleanupCfgInsertFlagInitializers scope_start=10236 args=bodyIR, …`（b1601_b16fix stderr:7879 全场 1 次）。**B16 交班书「首个实参即断」为 stderr 折行误读**：args 文本本身跨行（含 `\n`），判词打印折成多行，定型失败的是跨行字段链实参 `bodyIR.callSequence[callIndex].` + 续行 `resultBorrowOwnerDefinitionDomain`。
- **缺口位（typed_expr.cheng 静态定位 + 探针铁证）**：①`TypedExprTextIsSimpleFieldPath`（:60036）对含空格文本即拒 → 跨行字段链必不中；②postfixRoot 臂 `TypedExprPostfixValueTypeFromRoot`（:19188）点号臂 `ParserIdentPrefix(TextSlice(rhs, cursor+1, …))` 从 `.` 后一字节取成员名——续行残留 `\n`+缩进使 IdentPrefix 返空 → 实参定型空 → :29549 fail-closed。同函数前三个同 callee 调用字段链全部单行书写定型成功，:10291 为全函数首个跨行形——首断于此。树层收语句正确（argsText 为跨行全文本），缺口纯在静态定型扫描臂。
- **探针（kd_b17probe `651301f4`，+20/−0，CHENG_B17_PROBE 门控默认零输出；未设 env grep=0 且判词行为不变）**：最小复现（跨行实参 45 字节=22+1\n+16sp+6 吻合）`dot_field_empty cursor=21 prefix_len=1 next_byte=10`——cursor=21 恰 `.` 位、next_byte=10=`\n` 断点铁证；同调用单行实参（25 字节）走同一臂成功无探针命中——单变量差异=续行空白。
- **修复（typed_expr.cheng 净 +14/−3，冻结件 preflight PASS ann=0 displaced=0 wedged=0，双落 b2_root+live 修复区域逐字一致，单版一次烤成）**：`b17_fix_postfix_continuation_ws.patch` 点号/箭头臂成员名提取前跳续行空白（空格/tab/\n/\r，fieldTextStart 游标），提取起点与 cursor 推进同步计入；非空白字符仍由既有 ident 判定 fail-closed（不扩大接受集）；消费方仅静态定型 postfixRoot 臂与 TypedExprBindingRhsPostfixType 两处（绑定 rhs 同族收益），零 receipt 放宽。
- **验证（kd_b1701 `e9cf16ac` 对 kd_b1601 `e6f52a07` 单变量：b2_root 对 b1601 态 delta=修复 +14/−3 唯一；探针 -R 撤离 grep=0；烤 rc=0 wall=203s 金丝雀 4/4）**：夹具 A/B——b17_repro_multiline_field_chain 基线 rc=1 192 判词逐字复现 → 修复后 **192 消失**前进 `typed expr: node origin proof is missing or contradictory`（B16 已记录的夹具级下游边界）；b17_ctrl_1line_field_chain（单行兄弟形）**stderr 逐字节一致零回归**；B16 两件+B12 ctrl 一件回归 stderr 全部 IDENTICAL。夹具两件撤离 b2_root（grep=0）归档 `b17_fixture_tree_*.cheng`。
- **森林门轮（label=b1701_b17fix_t3000，raised 诊断门 env 同 b801…b1601 口径，门轮金丝雀 CANARY_PASS）**：驱动 rc=2 wall=2195s（完整窗）guard_hits=0 lease_hits=0 forest 234/234 ta_stream 234 pass1 235 max_csg_rss=1,511,163,584 ps_mine_max=1,215,408KB。判据（stderr 8436 行）：**static argument type unavailable 1→0**；explicit conversion/receipt 全族/executable call/kind=4/kind=2/frozen*/W7X/redundant/各 drift/generic 判词/source transaction/panic **全 0**；`typed expr:` =1=新前沿本身。**首轮 t1800 瑕疵**：rc=124 wall=1802s 为 gate_r9.sh timeout 1800s 截断 2s（截断前判词族已全 0，与 t3000 交叉一致）——B16 rc=1/wall=1619s 是判词 panic 短路时长，修复后无 panic 驱动跑完整下游管线自然超窗，属推进非回归，重跑仅改实验时窗 1800→3000（私有副本，判据 env 未动）。
- **相位推进实证**：r92 stage 线 1641→**2194** 条（+553）；r92 相越 r92_td_post_buildfacts/r92_te_post_accumulate/r92_tc_post_consume 多周期；slice_memory function_index 最深 192→**256**；**cleanup_cfg 源内事实行深 10291→14387（+4096 行）**；src=0/1 src_done 照旧、src=2 decls=310 照旧全处理。
- **新前沿墙（b1701_b17fix_t3000 stderr:8435 末判定行；typed_expr 领地，B18 攻）**：`typed expr: resolved call missing concrete type at …/cleanup_cfg.cheng:14387 target=memRefCount target_source=…/src/std/system.cheng importc=1 type=call_expr qualifier=system callee=memRefCount`（跨模块 importc 声明面 resolved-call 返回型缺 concrete type，全场恰 1 次）。
- **额外目标读数**：src_done=2 **未达成**（新墙仍在 src=2 处理中）；逐源推进读数=r92 stage 1641→2194、源内行深 10291→14387；**C2 §8.71 sha 对拍欠账保留**（src=2 仍未通）。
- 边界：本轮对 src/** 唯一改动=typed_expr.cheng（活树对 HEAD 0/0→**14/3** 纯叠加）；parser/receipt/core_types/cleanup_cfg/compiler_csg 等界外文件零改动；禁 commit/push、未建分支/worktree；探针/修复全冻结 `.rebuild/b_line/`（b17_ 前缀）；烤炉槽 owner+trap（门轮窗外排队让行 t8/l4/wall_probe 线，无争用无 pkill）；瑕疵如实记录：报告生成器 difflib generator 首版被计数耗尽产出空补丁（落盘自检发现即改，未进烤制）。

---

### 8.98 resolved-call-missing-concrete-type 墙根修（B18 线）：`TypedExprSymbolExportedByCase` 小写公开符号登记表漏登 `memRefCount`——qualified 跨模块 importc 解析在可见性门被 visible=0 拦截（五兄弟 memRetainAtomic/memReleaseAtomic/memRefCountAtomic/memRetainCount/memReleaseCount 在表唯缺本尊），resolution Missing → fact 保留 parser 预析身份而返回型恒占位 call_expr；修复=登记表补一行（+1/−0，补登记零放宽）；森林门轮（t3000 完整窗）本线判词 1→**0**、`typed expr:` 前缀 **1→0**（typed_expr 领地森林路径首次全零）、历史判词族全零；r92 stage 2194→**2340**、function_index 256→**320**、行深 14387→**15735**，新前沿=`compiler parser receipt: normalized expression parser node missing`（line=15735 surface=if，receipt 领地，B19 攻）（2026-09-14，B18 线；B→…→B17 续攻轮）

- **判词（B17 交割前沿）**：`typed expr: resolved call missing concrete type at …/cleanup_cfg.cheng:14387 target=memRefCount target_source=…/src/std/system.cheng importc=1 type=call_expr qualifier=system callee=memRefCount`（b1701_b17fix_t3000 stderr:8435 全场 1 次=末行；发射点 typed_expr.cheng:12559-12563 resolved-call 校验，typeText 为占位 call_expr 即判）。现场=cleanup_cfg:14387 `system.memRefCount(values.buffer) != 1`（泛型 `T[]` 形参函数内）；声明面 system.cheng:566 `@importc("cheng_mem_refcount") @borrows fn memRefCount(p: ptr): int32`。
- **根因（探针 kd_b18probe `d38ac2dd` 定谳）**：qualified 解析 `TypedExprResolveCallDeclarationKind`（:33286）先过 `TypedExprCallDeclarationVisibleFromImport`=`TypedExprSymbolExportedByCase`（:12025 大写即公开 + 小写公开 std/system 运行时符号手工登记表）——登记表列五兄弟（:12037-12041）唯缺 memRefCount → visible=0 → Function/Importc 两 kind 均 Missing；fact 带 parser 预析身份（resolved=1/importc=1/target_source 在）但返回型恒空 → :53658 `fact.typeText="call_expr"` → 判词。探针三连：`static_args … types=,ptr`（实参定型成功且精确可比，B17 修复面无嫌疑）、`qual_gate_blocked … visible=0`、`qual_arm ret= src=`；ctrl（白名单兄弟 memRefCountAtomic 同形）`qual_lookup kind=1 state=1`+`ret=int32` 解析成功——单变量=登记表一行。preresolved 臂1 `ctx_function_decl_name_source` 对 importc 恒 miss（:31265 登记 Function-kind 才写）为同域已知边界（本线未动）。
- **修复（typed_expr.cheng 净 +1/−0，冻结件 preflight PASS ann=0 displaced=0 wedged=0，双树修复区域逐字一致）**：`b18_fix_importc_refcount_visible.patch` 登记表补 `if name == "memRefCount": return true`——补登记而非放宽：放行后走正常精确 (source,name,kind)+arg-rank 声明查证与全量定型，判据零改动。
- **验证（kd_b1801 `290fe708` 对 kd_b1701 `e9cf16ac` 单变量：b2_root 对 b1701 态 delta=+1/−0 唯一；探针 -R 撤离 grep=0；烤 rc=0 wall=275s 金丝雀 4/4）**：夹具 A/B——repro（cleanup_cfg:14387 结构镜像）基线判词逐字复现 → 修复后 typed expr 判词消失且 stderr 与 ctrl(b1701) 基线**逐字节一致**（65 字节 receipt 夹具级边界，单变量闭环）；回归五件（b16 两件/b12 ctrl/b17 两件）stderr **全部 IDENTICAL** 零回归。佐证：现役 cold_managed_exact_ref_sequence_smoke 在 kd_b1701 同族墙（:7 memAllocCount 同表漏登，森林闭包外，已知家族欠账如实记录）。
- **森林门轮（label=b1801_b18fix，raised 诊断门 env 同 b801…b1701 口径，门轮金丝雀 CANARY_PASS）**：驱动 rc=2 wall=1864s（t3000 完整窗内收尾）guard_hits=0 lease_hits=0 forest 234/234 ta_stream 234 pass1 235 max_csg_rss=1,678,624,568 ps_mine_max=1,415,568KB。判据（stderr 8584 行）：**resolved call missing concrete type 1→0；`typed expr:` 前缀 1→0**（typed_expr 领地森林路径首次全零）；192 族/explicit conversion/executable call/frozen*/W7X/redundant/各 drift/generic 判词/specialization/source transaction/panic **全 0**；compiler parser receipt 0→1=新前沿本身。
- **相位推进实证**：r92 stage 线 2194→**2340** 条（+146）；slice_memory function_index 最深 256→**320**；事实行深 14387→**15735**；r92 t8…te 相 331-332 周期（深于 B17 的 310-311）；src=0/1 src_done 照旧、src=2 decls=310 照旧全处理、src_done=2 未达。
- **新前沿墙（b1801_b18fix stderr:8584 末判定行；receipt 领地=compiler_parser_receipt.cheng/parser.cheng，非 typed_expr，B19 攻）**：`compiler parser receipt: normalized expression parser node missing exprIndex=5 kind=1 line=15735 surface=if rootNode=-1 originNode=-1 role=0`（15735 现场=`let diagSealed = if …: 1 else: 0` 跨行 if 绑定初式族新实例——B15/B16 同族在更深行号的再现，越过 14387 死点后自然暴露）。
- **额外目标读数**：src_done=2 未达成（新墙仍在 src=2 处理中）；逐源推进读数=r92 stage 2194→2340、function_index 256→320、行深 14387→15735；**C2 §8.71 sha 对拍欠账保留**（src=2 仍未通）。
- 边界：本轮对 src/** 唯一改动=typed_expr.cheng（活树对 HEAD **1/0** 纯叠加；开工起点 0/0——B17 修复已入库 31ae43a62，交班书 14/3 记载为入库前态）；界外文件零改动；禁 commit/push、未建分支/worktree；探针/修复全冻结 `.rebuild/b_line/`（b18_ 前缀）；烤炉槽 owner+trap（门轮排队让行 l4_a7_bake 线，首跑 wrapper 排队上限 240×5s 被打穿报 SLOT_WAIT_TIMEOUT——非判词红，上限 2400 重跑完整窗）；瑕疵如实记录：夹具 runner 首版一次 heredoc 违纪当轮自纠改 Write 落盘。

---


### 8.99 int-checked 字段读侧地雷拆除（F3 线）：validator int 读合同扩为「plain ∪ canonical（round-trip 精确比对）」——接受集 = 恰为 canonicalizer 的像；发射翻转半步由 F4 完成（2026-09-13/14）

- **修复（validator.cheng +138/−10，预检 PASS；已入库 a56916e27）**：新 `csgCanonicalIntegerFieldText`——纯文本精确解析 JSON 整数（不走 float64、int64 溢出门、非整数值拒、int32 出域拒）+ `CsgCoreJsonCanonicalize(Int64ToStr(v))` 权威回写逐字节比对；`csgTryInt32Field` plain 快路行为逐字节不变、失败才走 round-trip（11 字符门保留）；`csgCompilerWireDecodeIntArray` 元素与 `csgCompilerWireIntField` 同刀。**接受集 = 恰为 canonicalizer 的像**（复用权威本体回写比对，零规则重写、零放宽）。
- **家族普查**：A 类（行 canonicality 管辖 = 地雷面）= validator:1116 csgTryInt32Field ← 5 处直接调用（native emission_plan 13 counts、section_chunk、symbol ordinal、relocation ordinal/kind/sectionIndex/symbolIndex、debug_relocation 全数值、c/python/finance/web/oracle 等全数）+ :1400 wire 数组 + :1556 wire int 字段；B 类（JSON string 承载）非地雷零改动。
- **验证（kd_f103p 修前 / kd_f103p2 修后，探针 `CHENG_F3_FIELD_PROBE`）**：plain 54/1000/120000 两侧 ok=1 同值；canonical 1e3→1000、2e3→2000、1e5→100000、-1e3→-1000 修前全拒→修后全 ok=1 值精确；7 非法形两侧全拒；wire `[1,1e3]` 修前拒→修后 ok=1。kd_f103b 纯修轮金丝雀 4/4、四夹具合同全绿且 primary.o sha 与 SM1 跨根记录逐一相同、森林闭包 234 源 rc=0。
- **偏离披露**：`1e5` 被接受（100000 的 canonical 形 6>3 字符取 scientific，属 canonicalizer 的像；拒绝即重建两难）——偏离任务书示例清单，如实披露。非法形以真非 canonical 文本为准。
- **发射翻转半步**：int-checked 发射仍 Fmt 裸十进制 ⇒ mine 值域仍被行 canonicality 拒——由 F4 完成（§8.100）。`csgRequireInt32RangeField`（:1186）既有 JFloat 接受面是否收窄留用户级裁定。


### 8.100 int-checked 字段发射翻转完成（F4 线）：cargo 28 发射字段 + 31 读点 + snapshot AppendInt32 全部 canonical 化；mine 值域端到端打通（修前真红→修后全绿）；非 mine 值零扰动（2026-09-14）

- **翻转面**：`primary_object_csgc_cargo.cheng` 28 发射字段（manifest 13 counts / section_chunk 3 / symbol 2 / relocation 4 / debug_relocation 6）统一 `primaryObjectCsgcCanonicalJsonIntText(int64(expr))`（F1 helper，规则与 `csgJsonCanonicalNumber` 逐字对齐平局取 plain）；读侧 31 处 JInt 门 → canonical 原文读（新增 int32 量程包装 reader，验收被既有「重发射逐字等值」钉死 = 恰为发射形，零放宽）。`compiler_snapshot_cargo.cheng` `csgCompilerCargoAppendInt32` 体改 canonical 直写（覆盖全部 wire int 数组）+ maxOwnerDepth 同步；值域闭枚举/版本常量字段（plain==canonical 恒成立）不翻并记录。
- **端到端验证（合成地雷探针 `CHENG_F4_CARGO_PROBE`，六行 fact 携 1000/2000 mine 值，kd_f104a 修前 / kd_f104b 修后单变量）**：修前五行 mine 行 canonical=false、`root_binding_line 2 noncanonical`、admission valid=false；修后六行 canonical=true、MERKLE ok=true、admission valid=true complete=true errors=0、科学形行本地 decode 精确回读（ordinal=1000 offset=1000 kind=4）。
- **四夹具零扰动 + 森林门单变量**：kd_f104base（pristine `f5c2911b…`）vs kd_f104c（fix `29ea3b88…`）双双 234 源闭包烤 rc=0、金丝雀 4/4、判词族双零；ordinary/call/cold 三夹具 primary.o 逐字节与 SM1 kd_sm1g 跨根记录逐一相同（`7b594c89`/`abaa15ba`/`1967b4cd`）、exe sha 逐一相同。v6 夹具源已随他线目录清删丢失（任务级非 git 跟随物，不凭记忆重造留用户裁定）——判据②按 3/4 交割。
- **census A 类领地外残留**：translation_unit.functionCount、python module.symbolCount、finance 全数、web nodeId 全家、oracle/unimaker/vexa pixelFormat 等发射点散布 compiler_snapshot_builder/mobile_shell_codegen/csg_web_facts 等文件（F3 读侧已收，发射侧仍 plain）——后续车道按同款刀法逐文件翻转。

---

### 8.101 receipt kind=1 裸 if 关键字行墙根修（B19 线；原编号 8.99 与 F3 条目撞号就地顺延）：单行 `let x = if c: a else: b` 绑定初式零绑定路——播种同一（appendIfExprs 对任意位置 if 标识符播 kind=1 DetailIfKeyword）但绑定三路全断（W7 sidecar-structured 段不收 kind=1；role 映射 Invalid 使最终锚查找不运行；无 Condition 语句根事件使 StampConditionFact 缺位+无 kind=12 种子使 B16 同位随绑无触发）；修复=最终循环 role==Invalid 臂接 B15 包含绑定臂（+19/−0，kind+detailKind 门控，零/多命中 fail-closed）；森林门轮（t3000 完整窗）本线判词族 **1→0**、历史判词族全零、**src_done=2 首次达成**（cleanup_cfg src=2 decls=310 全处理完成）推进新源 **src=3 decls=50 exact_def_call_authority**、r92 stage 2340→**2439**，新前沿=`typed expr: resolved call missing concrete type @ exact_def_call_authority.cheng:162 target=os_exit_bridge`（B18 登记表同族漏登，typed_expr 领地，下条线攻）（2026-09-14，B19 线；B→…→B18 续攻轮）

- **判词（B18 交割前沿）**：`compiler parser receipt: normalized expression parser node missing exprIndex=5 kind=1 line=15735 surface=if rootNode=-1 originNode=-1 role=0`（b1801_b18fix stderr:8584 全场 1 次=末行）。现场=cleanup_cfg:15735 `let diagSealed = if bodyIR.controlFlowSealed: 1 else: 0` **单行形**——B16 ctrl 同形（B16 明示森林零出现留后续线），越过后首次现身；同函数 15736-15760 跨行形队列由 B16 臂覆盖。
- **根因（探针 kd_b19probe `2522966b` 定谳，b19_probe_ifkeyword.patch +70/−0 env=CHENG_B19_PROBE；未设 env grep=0 且与基线逐字节一致）**：repro 夹具读数 fact (4,25)=if token 真实行列、事件表 5 条中 **event=1 role=1(BindingInitializer) 锚 (4,23)=声明侧 `=` token、根 11=ternary、span (4,25)-(4,63) 恰覆盖事实——contains=yes 全场唯一**；全场无 Condition 事件挂该锚。三条断路：①`ParserNormalizedExprKindIsSidecarStructured` 不含 kind=1 → W7 段与 B16 接线点够不到；②`ParserValueExprNormalizedStatementRole(kind=1)`=Invalid → 最终循环 `continue` 零绑定机会；③if 在表达式位无 Condition 根注册（StampConditionFact 只在 Condition 根注册时触发）+ 行首 let 无 kind=12 种子（B16 同位随绑无触发种子）。
- **修复（parser.cheng 净 +19/−0，冻结件 preflight PASS ann=0 displaced=0 wedged=0，双树修复块逐字一致 1069 字节）**：`b19_fix_ifkeyword_containment_bind.patch` 最终语句锚循环 role==Invalid 臂接 `ParserValueExprBindRangeToContainingStatementEvent`（kind==If && detailKind==IfKeyword 门控）：span 覆盖事实 (line,col) 的唯一语句根事件即所属语句，经 ParserValueExprBindStatementRootEvent 取与 B15/B16 臂一致身份；零/多命中维持 -1 fail-closed；健康形行 root>=0 循环顶部已跳过。零 receipt 放宽，compiler_parser_receipt.cheng 零改动。
- **验证（kd_b1901 `10fb01a1` 对 kd_b1801 `290fe708` 单变量：b2_root 对 b1801 态 delta=+19/−0 唯一；探针 -R 撤离 RESTORED_TO_PRE_PROBE+grep=0；烤 rc=0 wall=268s 金丝雀 4/4）**：夹具 A/B 七件——b19_repro_1line（单行形）rc2 判词逐字 → rc1 前进 `typed expr: structural binary operand types do not match`（夹具级 typed_expr 边界）；b16_ctrl1line（B16 留后续线同形）同步治愈；五件回归（b19_ctrl_2line/b16_repro/b17 两件/b12 ctrl）stderr **逐字节 IDENTICAL** 零回归。
- **森林门轮（label=b1901_b19fix，raised 诊断门 env 同 b801…b1801 口径，门轮金丝雀 CANARY_PASS）**：驱动 rc=2 wall=1814s guard_hits=0 lease_hits=0 forest 234/234 ta_stream 234 pass1 235 max_csg_rss=2,023,540,872 ps_mine_max=1,419,040KB。判据（stderr 8686 行）：**compiler parser receipt 1→0**（含任意 kind normalized…missing 全 0）；executable call/frozen*/W7X/redundant/各 drift/generic 判词/specialization/source transaction/panic/explicit conversion/static argument **全 0**；`typed expr:` 前缀 0；resolved call missing concrete type 0→1=新前沿本身。
- **相位推进实证**：**src_done=2 首次达成**（b1801 门 stderr 计 0，b1901 stderr:8667 出现）——cleanup_cfg（src=2 decls=310）全处理完成，推进到**新源 src=3 decls=50 exact_def_call_authority.cheng**；r92 stage 线 2340→**2439**（+99）；function_index 320 持平；src=0/1 src_done 照旧。
- **新前沿墙（b1901_b19fix stderr:8686 末判定行；typed_expr 领地，下条线攻）**：`typed expr: resolved call missing concrete type at …/exact_def_call_authority.cheng:162 target=os_exit_bridge target_source=…/src/std/os.cheng importc=1 type=call_expr qualifier=os callee=os_exit_bridge`——B18 `TypedExprSymbolExportedByCase` 小写公开 importc 登记表又缺 **os_exit_bridge**（与 memRefCount 完全同族、B18 已记录家族欠账在新源现身）。
- **额外目标读数**：src_done=2 **达成**（首次）；**C2 §8.71 sha 对拍欠账保留**（src=2 已通但本线无冻结对拍基线产物，如实保留）。
- 边界：本轮对 src/** 唯一改动=parser.cheng（活树对 HEAD **19/0** 纯叠加；开工起点 0/0——B16 已入库 0c11b718d、B18 已入库 dbf58b184，交班书 45/0 为入库前态）；界外文件零改动；禁 commit/push、未建分支/worktree；探针/修复全冻结 `.rebuild/b_line/`（b19_ 前缀）；烤炉槽 owner+trap 全程（首跑排队 240×5s 被 f4 线批量打穿报 SLOT_WAIT_TIMEOUT——非判词红，上限 2400 重跑）；瑕疵如实记录：整文件包含断言误用（.new 为整文件快照对 live 既有 perf 块假阴性）当场改块级检查补验；runner 产物名 b19_ 前缀叠加成 b19_b19_；烤炉 owner 串沿用 b16 模板未改前缀（装饰性）。

---

### 8.102 登记表家族一次性清扫（B20 线）：`TypedExprSymbolExportedByCase` 小写公开 importc 手工登记表按消费面一次补全 8 符号（os_exit_bridge/memFreeCount/c_strlen/system_ptr_add/cmpMem/memCopyCompat/memRetain/free）——枚举 system+os 223 个小写 `@importc` fn，234 源闭包（=backend_driver_dispatch_min import 传递闭包，恰 234，源序=字母序与 src 读数吻合）逐符号验真（12 候选中 5 个注释假阳性/他模块自声明，209 个纯无消费面记录不扩）；修复=登记表补 8 行（+8/−0，补登记零放宽——走正常精确 (source,name,kind)+arg-rank 查证与全量定型）；森林门轮（t3000 完整窗）B19 前沿判词族 **1→0**（os_exit_bridge 全场提及 1→0）、历史判词族全零、src=3 深入（exact_def_call_authority 死亡点 **:162→:1462**）、r92 stage 2439→**2712**（+273），新前沿=`typed expr: call declaration static argument type unavailable @ exact_def_call_authority.cheng:1462`（typed_expr:29650 build-index 静态实参定型相，B17 同发射器族新实例，非登记表家族）（2026-09-14，B20 线；B→…→B19 续攻轮）

- **枚举与消费面（b20_consumption_scan.py/.json + b20_collision_check.py/.json）**：缺登 217；12 个有闭包内调用痕迹 → 验真后 8 登记：os_exit_bridge（qualified×4：exact_def_call_authority:162=src3 前沿、exact_def_freeze:133=src5、exact_def_identity:81=src6、exact_def_merge:166=src7）、memFreeCount（qualified×10：driver_safe_contract/regalloc_production_emitter/compiler_snapshot_cargo/diagnostic_failure/parser_diagnostic_authority，src=36/64/83/130/133）、c_strlen（bytes:31 qualified）、system_ptr_add（hashmaps:253,263 bare）、cmpMem（hashmaps:298）、memCopyCompat（hashmaps:690-721）、memRetain（seqs:215 bare）、free（bytes:53,226,227 bare）；5 排除=atomic 三胞胎（消费全为注释或 std/atomic.cheng 自有同名声明模块内调用）+cheng_seq_set（注释假阳性）；碰撞核对：8 名闭包内均唯一声明点→裸名 import 扫描臂 Unique 无歧义。**elf_object_linker:1348,1382,1399 裸名 system_ptr_add 无 import std/system 边——登记表不可达，另族缺陷留后续线**。
- **修复（typed_expr.cheng 净 +8/−0，冻结件 preflight PASS ann=0 displaced=0 wedged=0，生成器锚点 memReleaseCount 行 count=1 硬校验，双树登记表区逐字一致；b2_root 对 b1901 态 delta 实测 8 行纯插入）**：登记表 memReleaseCount 行与 return false 之间补 8 行。**中间态如实记录**：首版 7 行漏 free（合并消费清单遗漏 bytes 3 处真实消费）——kd_b2001 `00d9a14b`（烤 rc=0 wall=260s 金丝雀 4/4，门轮 rc=1 wall=2115s 判词与终版逐字一致）烤出后自纠：patch -R 撤离、双树复原实测、8 行重落重烤；7 行补丁留档 b20_fix_symbol_table_sweep_7row_intermediate.patch。
- **验证（kd_b2002 `e3be0f6b` 对 kd_b1901 `10fb01a1` 单变量 +8/−0 唯一；烤 rc=0 wall=206s 金丝雀 4/4）**：夹具 A/B 同窗——b20_repro_qual_os_exit_bridge rc2 前沿判词逐字 → rc1 前沿消失前进夹具拓扑 static-arg 墙，判词行与注册兄弟（b20_ctrl_reg_memrefcount 双臂逐字节同）逐字节同=单变量闭环；b20_ctrl_unregistered_getpid（未登记对照）两臂 rc2 stderr **逐字节 IDENTICAL fail-closed**；b20_repro_bare_os_exit_bridge 两臂逐字节一致（夹具拓扑墙先于解析，裸名臂判据归门轮）；七件回归（b19×2/b16×2/b17×2/b12×1）stderr+stdout **全逐字节 IDENTICAL**。
- **森林门轮（label=b2002_b20fix，raised 诊断门 env 同 b801…b1901 口径，金丝雀 CANARY_PASS）**：驱动 rc=1 wall=1875s guard_hits=0 lease_hits=0 forest 234/234 ta_stream 234 pass1 235 max_csg_rss=2,024,114,240 ps_mine_max=962,912KB。判据（stderr 8959 行 vs b1901 8686）：**resolved call missing concrete type 1→0、os_exit_bridge 提及 1→0**；static argument type unavailable 0→1=新前沿本身；receipt 全族/executable call/frozen*/W7X/redundant/各 drift/generic/specialization/source transaction/panic/explicit conversion/kind=4/kind=2 全 0；`typed expr:` 前缀 1→1（各=自身前沿，b2002 行顶格 :29650 发射器无前导空格）。
- **相位推进实证**：src_done=0/1/2 照旧；**src=3（decls=50 exact_def_call_authority）深入 :162→:1462**（ExactDefCallAuthorityContractSealInto，lines=1435）；r92 stage 2439→**2712**（+273）；function_index 320 持平；8 登记符号零判词提及（memFreeCount 消费点 src≥36、c_strlen/free/seqs/hashmaps src≥196 本轮未及，如实记录）。
- **新前沿墙（b2002_b20fix stderr:8959 末判定行；exact_def_call_authority 领地/B17 族发射器，后续线攻）**：`typed expr: call declaration static argument type unavailable source=…/exact_def_call_authority.cheng name=exactDefCallAuthorityCidAppendText line=1462 scope=ExactDefCallAuthorityContractSealInto scope_start=1442 args=buf, exactdef.BodyIrExactDefContractCidDomainTag scopes=50 signatures=50 bindings=403 lines=1435`——typed_expr:29650 静态实参定型相（B17 cleanup_cfg:10291 同发射器族新实例），exactdef 域 qualified tag 实参定型不可达；非登记表家族（:162 解析墙消失后才暴露）。
- 边界：本轮对 src/** 唯一改动=typed_expr.cheng（活树对 HEAD **8/0** 纯叠加；开工起点 0/0——B16/B18/B19 均已入库）；src/std 只读零改动；禁 commit/push、未建分支/worktree；夹具 11 件撤离双树 grep=0；烤炉槽 owner+trap 全程（收尾正常移交 f5 线）；瑕疵如实记录：①7 行漏 free 自纠闭环；②b2002 门轮首跑被外部 SIGTERM 打断 exit 143（非判词红，槽残留由死主检测自清，中断态 stderr 被重跑覆盖无判词无证据损失）；③夹具级 repro 修复臂/裸名臂均落夹具拓扑 static-arg 墙（cmdline RawmemSet，森林该族 0）——B18 ctrl 同类先例，前沿判据以门轮为准；④6 个裸名登记符号 vivo 判据（src 196-216）留后续门轮。

---

### 8.103 C main 武装机制落地（M2 线）：trampoline + 链接期存根绕开计数分配器；armed 全森林轮被「未跟踪线程禁令」阻断定谳（2026-09-14）

- **M1 §5 字面设计证伪**：①载具 cc 构建不链接 provider，`cheng_allocation_ledger_begin` 在载具中未定义（nm 0 命中）——字面补丁连构建都过不了；②即便 arm 成功，M1 hook 的 Begin 必撞 `process_owner_already_active`（provider begin_core:20762-20769 owner 进程独占）→ Top-N 全零。**真实现 = trampoline 级 C begin + 直写 M1 模块全局**（M1 hook 的 Start 变 no-op、ReadInto 直读 armed owner——M1 接线零改动成立）。
- **武装机制（cheng_cold.c 净 +318/−0 纯叠加，预检 PASS，已入库；concurrent_assembly.cheng +7/−0 授权件）**：闭包含 `cheng_allocation_ledger_begin` ⇒ 注册精确运行时依赖（external link 同名）+ 按裸尾名定位模块全局（Owner/Active）+ compile-stage 与 object-emitter 双 a64 trampoline（GLOBAL_ADDR 补丁对 ×2 + `bl arm` + 恢复）+ 存根源文本（静态确定性 C：env=="1" ⇒ `cheng_allocation_ledger_begin({domain,32,0},1GiB,&owner,&active,nil)==1 ⇒ *(u8*)active=1`，domain=`cheng.compiler_csg.alloc_ledger.m1`）+ 存根 .o 文件握手进 combined provider objects（绕开 undefined 扫描 256 截断）+ 真烤制分支 stat 追加。env 门控默认零读零写零输出。
- **载具验证**：cheng_cold_t8 base/t8 双 rc=0 同源重跑 sha 相同；env 门控 A/B 两金丝雀 exe/map 全 IDENTICAL、arm 符号零泄漏、env=on 金丝雀 compile=0/run=0；kd_t81 全闭包烤 rc=0 金丝雀 4/4；四夹具 primary.o 4/4 成对一致（ordinary `7b594c89…`/call `abaa15ba…`/cold `1967b4cd…` 与 M1/SM1/F1 冻结跨根记录逐一相同）。
- **armed 全森林轮阻断定谳**：owner active ⇒ provider 对 `cheng_thread_start` 系硬禁（`cheng_allocation_ledger_forbid_untracked_provider` → exit 70）；驱动编译期 SpawnPtr ≥1 工作线程（BACKEND_JOBS=1 亦然）⇒ armed 金丝雀单源编译 2s rc=70；关 env 全程正常。已排除：BACKEND_JOBS=1 串行、RSS 守卫线程、concurrent_assembly（retired 死代码——前后烤制 sha 逐字节同）；**真凶 SpawnPtr 宿主在驱动运行时领地未定位**（静态 grep 穷尽三个已知 spawn 位点），需运行时车道一次插桩定位。两解法：(a) spawn 点串行内联化（同 M2 concurrent_assembly 授权先例）；(b) program_support forbid 对 owner domain 诊断豁免。
- **env 关零输出判定成立（全森林 234/234）**：`^alloc_ledger`/`produce_attr` 行数 0；armed 与否仅差 t=0 的 C getenv+条件 begin。
- 根修落点维持 §8.66/8.67（96.3% ParserValueExprProcessStatementRangeWithTypeOwner 单调用；loop-written-back 托管局部不进 rebind 表）；账本 per-owner 字节摊分待 §3 阻断解除后一轮即出，作为 671MB 主项根修设计的最终定量输入。

---

### 8.104 §8.67 载荷条款证伪 + add 写回形=纯累加器族 + **671MB 真身=seq 扩容被顶替缓冲漏**（D4 线停修定谳，2026-09-14）

- **§8.67 载荷条款证伪（机器码实证）**：`ShapeLoop`（_chk_repro_loopseq_amplified，offset=0xfc size=524）作用域出口存在 `bl _cheng_mem_release`（实参=槽内 seq 头 data ptr）——HEAD 载具（cheng_cold_d4base `f0daf727…`）与 B 线基线载具（cheng_cold_v3，Sep 10）同位同形 ⇒ **「最终缓冲在作用域出口不被释放」对现树为假**；kd_b2002 的 merge_parse 基线 1,775,876 块不含「出口不掉最终缓冲」份额。
- **真泄漏机制**：内联 `SEQ_I32_ADD`/`SEQ_STR_ADD`/`SEQ_OPAQUE_ADD` **增长路径的「被顶替缓冲」永不释放**（每扩容漏 1 块）。HEAD 反汇编全流程：malloc 新缓冲 → 逐元素拷贝 → 存新 ptr → 旧 ptr 落地无 release（cheng_cold.c:38602-38681）。**墓碑互证（cheng_cold.c:38666-38677）**：codegen 层试过在此释放，因浅拷贝 seq 头共用旧缓冲（COPY_COMPOSITE 24B 浅拷）导致兄弟 grow 二次释放（libmalloc POINTER_BEING_FREED，dispatch_min census 469s/9.8GB 复现）被判 unsound、「dead end, do not retry」；**该泄漏当时记账到 arena/mmap 车道——即本战役 671MB 主项的真身**。
- **add 写回形=纯累加器族（登记修复不可达且被禁）**：被顶替缓冲**从来不是 value def**（单 op 机器展开的内部临时），`exact_borrowed_rebind_op_ids` staging 掉落只能掉「def 持有的当前值」；把 add 写回局部登入表 ⇒ loop-edge 掉的是**当前活缓冲** ⇒ 下一迭代写已释放内存+作用域出口双释放——正是「累加器形严禁登记」的语义破坏。**add 写回形=纯累加器族，无一例外**（反汇编+墓碑+240/15 复现）。
- **修复空间为空（枚举闭合）**：「整体重绑·owned prior」bind 点即时释放（负控 `_d4_rebind_loop` 400 轮 run=0）；「borrow/static prior」**已在表**（填表三调用方 :81893/:82181/:82460）。不存在「可登而未登」形态。**M2 试点定性更正**：试点=源侧 presize（`ParserValueExprParseCallSuffix`，−84.53 块/解析），机制=**消灭扩容**（setLen 预置+下标赋值），非「单点登记」；已落 HEAD（f5d9db72a）⇒ kd_b2002 基线已含。
- **真根修双路（均待裁定/立项）**：**Fix A（C 链正确性修，需用户授权）**：`codegen_seq_{i32,str,opaque}_add` 增长路径在「seq 槽=精确无别名 owned 本地」证明下释放被顶替缓冲——墓碑的二次释放场景恰被该证明排除；需 parser 侧维护「头无浅拷逃逸」别名位（cold_parser.c 可供）+ 释放发射在 cheng_cold.c（禁触文件+墓碑撤销需用户授权）。验收建议：六件 `_d4_*` + `_chk_` 三件全零 + kd 单变量 merge_parse 对照 + 四夹具 primary.o sha + 金丝雀 4/4 + 墓碑复现件仍 rc=0。**Fix B（自宿主性能修）**：parser.cheng 循环内 add 局部结构性 presize 清扫（试点配方 −84.53/位点量级；全书 `add(` 430 处，循环增长子集逐位点容量可证性）——D5 线在飞。
- kd 级验证不适用（无修复可验）；b2_root 午间已变（d80db2cf3→2b8fcac4b），kd_b2002 单变量对照当轮不成立（如实记录）。语义安全电池：累加器排除=域级证明；自赋值=:82287 早退在案；二次覆盖=straight 夹具正常；跨函数返回寿命=MakeThree move-in run=0；ORC 平衡=零源码改动未触。
- **账面更正请求（交 D5/后续线）**：§8.67「作用域出口不释放」条款应更正为「**扩容被顶替缓冲漏**」，防后续线按失效机制排雷。

---

### 8.105 Fix A 落地（D6 线）：seq 扩容被顶替缓冲释放（精确 owned 位证明 + 逃逸分析 + 内存熔断）——泄漏探针 240→0、四夹具 4/4、ORC 平衡；**T6×现闭包烤驱腐烂阻塞定谳（P0 移交）**（2026-09-14）

- **Fix A 落地（cheng_cold.c 12-hunk 冻结件 `d6_fix_head.patch`，对 f53f64e14；活树零触碰——T6 腐烂见下）**：内联 `SEQ_I32_ADD`/`SEQ_STR_ADD`/`SEQ_OPAQUE_ADD` 增长路径的被顶替缓冲，在「精确 owned」位证明下于新指针写入后发射 `cheng_mem_release`（NULL 守卫+寄存器状态重建）；位=0 路径与墓碑时代逐字节同码不发射。判定载体=对最终 post-opt BodyIR 的逐 op 逃逸分析（must-created + may-escaped 前向不动点 + 版本拷贝传递 [COPY_COMPOSITE∧consume==op+1 → 值版本移交] + 内存熔断 [域×blocks×dcount>16MiB 即全零保守回退]），14 类 op 形态判定表全录（CREATE/决策点/POISON/VERSION_COPY/SAFE）。
- **语义安全（红线全过）**：墓碑复现件（两 struct{int32[]} 各 add 过 cap）双臂 rc=0（硬门）；重启墓碑变体（无条件释放）在现树复现当年不 sound 场景：`cheng_orc_release_failure registry_miss wrong_object_or_owner`（现代 POINTER_BEING_FREED）——**位=0 门是必需而非仅保守**（`var b: Holder = a` 结构体浅拷不 retain seq 字段缓冲；借出视图/迭代器/参数传递/全局按发布毒化 fail-closed）。
- **泄漏探针转绿**：`_chk_repro_loopseq_amplified` **240→0**；fix_probe 15→0；predicate 1→0；`_d4_discriminate` 156→0；str 元素 seq 被顶替份额实测移除（−1 块/call 精确点火）；str 重赋值/元素-char 通道不在本修领地（如实记录）。
- **四夹具对合同 4/4**：kd 层双臂 exe 与 primary.o 双双逐字节 IDENTICAL，primary.o sha 与 M1/M2 冻结跨根记录逐一相同、run 合同 0/1/0/0。
- **kd 门轮双臂**（同根同闭包 d6base+D5 rootfix5 对称件，唯一变量=C 修复，两臂同止 src=192 已知腐烂墙）：merge_parse tot_parse **1,720,904 → 1,709,211（−11,693，−0.68%）**，尾读 live **−52,021**，max_csg_rss −27.7MB，16 判词族双臂全零。ORC 平衡：registry_miss/orc_release_failure/POINTER_BEING_FREED 全零；amplified probe 出口 MemLiveAllocations delta=0。
- **P0 阻塞定谳（T6×现闭包交互，二分件齐）**：同根同闭包唯一变量=C 状态：cheng_cold_v3（09-10 二进制）**GREEN** / f5d9db72a（D1/D2/D3+T3）**GREEN** / **b762bcaa3（T6）RED** / 40805f660（T7）RED / f53f64e14 HEAD（含 M2）RED / live 在飞 C RED（与 HEAD-C 烤出逐字节同 sha）。RED 形态=驱动一编译即 `primary object CSGC plan: admission failed … object_emission_plan must be a JSON object`。交互面=T6 a64 IntToStr/concat 托管化 × M2 带入的 primary_object_csgc_cargo/validator/concurrent_assembly 新闭包。**HEAD/live 的一切 kd 级验证当前不可行**；移交 T10/T6 车道根修（先 bisect T6 三件子变更定触发，再定修层）。
- 纪律：m3line 活锁误清自纠（改 owner-pid 死亡才清）；heredoc 违纪 3 次自首（后续零再犯）；首版分析向量 568MB 打穿 1GiB 冷守卫两次烤 rc=2——域压缩+熔断后 0 命中；电池 primary_o 空比空作废、kd 层重做。

---

### 8.106 P0 机制定谳（T10 线）：T6 owned 旗标发布武装了 C 链所有权机器的「drop-before-sret」潜伏缺陷——双 return str 局部的作用域 drop 未被 return 物化杀死；触发 bisect 精确到 flags publish 唯一武装点；closure 全部免责；修复层=C 链所有权机器 move-kill（2026-09-14）

- **RED 直接机制（逐字节铁证）**：T6 起 a64 `I32_TO_STR`/`I64_TO_STR` 结果发布 owned 旗标（flags=1）。C 链对「双 return 的 str 局部」存在**潜伏既有缺陷**：函数尾臂 `return plain` 已把 `plain` 移交出去，`cold_finish_exact_function_return`（cold_parser.c:76783）仍在该臂上**先发射 `plain` 的作用域 drop、后发射 sret 拷贝**（反汇编 :0x1eb0 `bl cheng_mem_release` 紧接 :0x1eb8-0x1ed0 sret 三字拷贝再 ret）——drop 的 flags 门控释放命中 flags=1 → 把刚移交的缓冲 free（0xdd 填充）→ 调用方读 dd 垃圾 → 其 temp drop 二次释放 → `cheng_orc_release_failure code=registry_miss operation=normal_release detail=wrong_object_or_owner`。
- **P0 病灶链条**：F4 翻转件 `primaryObjectCsgcCanonicalJsonIntText`（primary_object_csgc_cargo.cheng:378）正是「双 return str 局部」形——`Fmt"{value}"`（I64_TO_STR）结果在尾臂 `return plain` 被死 drop 提前释放；`primaryObjectCsgcManifestFact` 的 Fmt 拼接读到 dd → emission plan fact 行多位整数字段全垃圾 → `json.ParseJsonSafe` 解析失败 → `csgRequireExactJsonObjectFields`（validator.cheng:5997）报 `line 2 csg_dialect::native::object_emission_plan must be a JSON object` → admission failed 烤驱即 rc=2。
- **第一假设证伪**：plan 侧读点拒 canonical 科学整数——不成立。读侧 `json.ParseJsonSafe` 对 `1e3` success、完整 canonical fact parse success（okeys=28）；F3 读侧 plain∪canonical 合同完好。**备选假设证实**：T6 的 IntToStr 托管化（精确到子变更=flags=1 publish）改变了 emission_plan 内容——非数值形态问题，是写入内容被 use-after-free 毒化。
- **触发子变更 bisect（C 侧 scratch 冻结副本）**：仅归零 `codegen_i32_to_str`/`codegen_i64_to_str` 两处 flags publish（t6v1 变体）→ probe2 输出与 GREEN d3c **逐字节 IDENTICAL**；`kd_t10v1` 金丝雀 **4/4 PASS**。flags publish 是唯一武装点。
- **修复层裁定**：根修在 **C 链所有权机器**——返回物化的 consume 必须杀死该局部的臂内作用域 drop（落点 cold_parser.c `parse_return`→`cold_finish_exact_function_return:76783`→`cold_drop_exact_scope_locals:74775` 消费数据流，或 cheng_cold.c codegen 侧臂死 drop 抑制；**flags publish 必须保留**，否则 IntToStr 滞留病回归）。`bootstrap/cheng_cold.c` 为 T10 硬边界（T6 修复同文件排队），本轮交付=定谳证据链+最小复现+触发 bisect+无回归证明的**移交件**；t6v1 归零臂仅为诊断对照（会重新打开 33.7MB 线性滞留），不是修复。
- **closure 全部免责**：F4 写侧合同正确、F3/F1 读侧正确、`primary_object_csgc_cargo.cheng`/`validator.cheng`/`merkle_store_codec.cheng` 零改动即痊愈（t10v1 臂实证）。

## 移交件（T6 车道，文件已排队）

必修点：返回臂上已移交局部的死 drop 须被 move-kill（parser 侧记致死 consume 或 codegen 侧抑制发射，修一即可）；managed alloc + NUL + flags=1 publish 必须保留；回归红线=probe2 全对 + 金丝雀 4/4 + 四夹具逐字节对 M1/M2 冻结记录 + 16 判词族门轮双零 + T6 滞留判别（33.7MB→17.5MB 平台）不回归。

## 新前沿

1. **T6 车道**：按 §2 修 move-kill 缺口即解除 P0；复现=本目录 probe2 + `c_t6c.c`；验收=§3 a–f 全绿+滞留判别不回归+判词族双零。
2. **家族预警**：凡「let x = <Ixx_TO_STR 结果>…尾臂 return x」的双 return str 形状（closure 内不止 canonical 成形器一处）修复落地前都是 dd 毒化候选；修 move-kill 语义一次清偿，不做逐点绕改。
3. D6 移交的「live 在飞 C 与 HEAD-C 同病」与本轮机制定谳一致（活树 cheng_cold.c 的 WIP 未触碰，同源病灶）。

---

### 8.107 产出段瞬态分配 per-source arena 路由架构设计交割（AD1 线，纯设计零源码改动；四决策点闭合，2026-09-14）

- **量级前提更正（施工前必读）**：§8.63 的 671MB 主项按三笔后续实测修正——§8.104（真身=扩容被顶替缓冲漏）、§8.105 Fix A（−0.68%）、D5 census（96 位点中 ~60 是 ≤4 元素 cap-4 不扩容不漏；11 位点 presize 仅再 −434 块/−0.025%；「~100 倍试点量级」预期证伪）⇒ AD1 价值重述为 churn 消除（d_live 不可见、占 RSS/quarantine 预算）+ M2 Top-N 点名后的结构性收容接口 + 「堆 seq 累加器」缺陷族的类型级防线；残余 ~1.70M 块主体 owner 未逐块定谳，裁决仪器 = M2 Top-N（§8.103 armed 已落库、被未跟踪线程禁令阻断）。
- **决策点一（路由层级）= 混合相位化**：第一阶段逐点位——`ParserScratchSeqInt32` facade 薄封装 arena.cheng 既有原语（ReserveEmpty/AddReserved/Get/Len，类型=16B 值句柄不含 arena 引用）；字面 `cheng_malloc` 重路由证伪（provenance release 配对 fail-closed、逃逸不可静态判定、cheng_cold.c 禁触）；保留窄形态分配器级为「接口 B」，三选一证据门触发（Top-N 单族 ≥5% 且全过逃逸判定 / noq churn ≥50MB 归因到枚举 helper / 同形改写 >20 处）。
- **决策点二（生存期绑定）**：scratch arena 挂 `ParserValueExprTree` 新字段（惰性 ArenaInitDefault(8192)，`ParserValueExprTreeRelease` 双臂释放）——merge 循环四类树释放点（pass0/pending/pass1/replay/sweep/流式，compiler_csg.cheng:33676-36784）零额外接线自动获得；否决复用 tree.arena（污染 census/`sourceArenaUsed` 记账 + lessons.md:194 膨胀形态 + C2 seal 对账面）；ArenaReset 语句级复用否决（generation 使跨子调用句柄失效）。逃逸排除六类（E1 树列/E2 C2 事实列/E3 账本/E4 模块级+internPool/E5 出参返回值/E6 X2 形）；逃逸判定=静态类型隔离主判（`ParserScratchSeqInt32` 与 `int32[]` 互不赋值，逃逸必须显式 CopyOut）+ 动态 generation/越界/release 后 panic 兜底（arena.cheng:86/344/400 既有原语）+ `CHENG_PARSER_SCRATCH_AUDIT` 毒化器官（0xA5 填充，默认零输出）。
- **决策点三（覆盖矩阵）**：presize（容量可证堆 seq，已落）/ Fix A（C 链正确性网，互补非竞争）/ rebind 表（D4 证伪 add-累加器登记，与路由无交集）/ C2 列物化（跨相事实，禁路由）/ AD1 路由（补集 ∩ produce 窗）；互斥裁决算法 R1→R4 四问（活过 TreeRelease→E 类；循环写回堆 seq→presize 优先；容量可证纯标量→路由；其余→M2 观察名单）。
- **决策点四（验证）**：retain_ledger 目标值设计期不捏造（公式：Before − Σ位点实测 × 解析次数 ± 噪声）；produce_attr s6 子桶塌缩；**noq footprint 强制协议**（sub-256KiB churn 判读必须 `CHENG_QUARANTINE=0` 窗，默认环境假阴性先例=§8.90 BEFORE 28.1≈AFTER 28.3MB；判方向 3/3+量级带不判单值）；fail-closed 负控三件必须真能炸（超容量/release 后/毒化逃逸）+ 正控 rc=0；行为等价阶梯=四夹具 primary.o 逐字节同 + **forest_arena 逐源字节零分叉**（scratch 不进 tree.arena 的直接证据，比 D5 常数偏移更严）+ 16 判词族双臂全零。
- **决策点五（切分）**：批次 1 基础设施（parser.cheng facade+字段+器官+负控，**领地冲突=D5 活树未提交 +127/−36**，须 rebase 或以其冻结件为基座）→ 批次 2a（罕见增长 5 位点 + ParseCallSuffix argRoots :21271 精确可证位）→ 2b（跨调用累加器 2 位点，预判禁路由只出判定）→ 2c（~60 cap-4 churn 位点，noq 证据门）→ 3（接口 B，M2 解阻断后）；parser.cheng 批次间串行，与 B21/M3/T10 零文件交集可并行。
- **风险清单**：托管值入 scratch 禁入（lessons.md:1011）；grep 门禁守「句柄不入持久结构」；审计轮与判读轮分轮；X2/r97 面不接刀移交 T 线（刀A 已落 −34K 块/−21.8MB §8.94）；M2 阻断则接口 B 冻结；**T6×现闭包烤驱腐烂 P0（§8.105）期间 kd 级判据不可执行，过程证据走克隆根对称轮**；W7X 辐射面在 D1 根修前 CopyOut 下游避免读后不写回形。
- **设计文档**：`.rebuild/ad1_line/ARENA_ROUTING_DESIGN.md`（含 facade API 草案、逐相内存影响声明、证据索引全行号）。派单所指 `.rebuild/m2_line/REPORT.md`/`.rebuild/f3_line/REPORT.md` 不在本工作树，已按 §8.103/§8.71+源码实读采信替身并如实记录。

---

### 8.108 exe receipt 路径依赖根修（L1 线）：输入路径文本移出 provider commitment digest 覆盖面（v3→v4 代际）；同源异路径三跑全同+96B 病灶精确复现归因闭环；R1 定性精化为「路径依赖」（2026-09-14）

- **根因机制定谳（精确化 R1 定性）**：`machoBuildProviderCommitment` 上游 evidence/proof digest 的 canonical 序列化把**输入对象文件的文件系统路径文本**纳入 sha256 覆盖面——evidence 逐项写 `pathLen+inputCanonicalPath`（原 :1662-1665），proof 写 `_canonical_path_hex`（原 :1929/:2075），路径全部派生自 `--out` 经 `fs.Realpath` ⇒ out 路径变 → evidence digest 变 → proof 首段含 evidence digest 文本传导 → commitment 64B 变 → CodeDirectory 页 hash 变 32B——合计 96B（T7 `@7393800` 同位；T7 记 95B 为 1 字节碰巧相同）。**同路径连跑恒定 ⇒ R1「运行期非确定」精确定性为「路径依赖」**（A/A2 实为不同 out 路径）。
- **修复（macho_provider_linker.cheng +12/−10，预检 PASS，未 commit）**：`MachoProviderCommitmentVersion` 3→4；evidence item size 去 `4+len(path)`；digest 删 path 写入（:1662-1665）；proof 删 `_canonical_path_hex` 两行（:1929/:2075）。**零语义放宽**：digest 仍绑 size+content sha256+definedRoots+relocationResolvedRoots+text/data 段+offset+size+post-reloc sha256+动态 import 全套+relocation patched bytes；verify 侧同 canonical 函数重算对比 fail-closed；contentSet digest 跨轮稳定保持。
- **验证矩阵（分母 = 本轮产物）**：修复臂同路径双跑+异路径+交叉三跑 exe sha 全同（`16d58d96…`）；对照臂异路径 **DIFFER 96B first_off=7393800**（病灶精确复现归因闭环）；四夹具 4/4 对冻结 sha；金丝雀 4/4×2；门轮双臂同止 src=192 逐字同墙；16 判词族双臂全零。
- **交接**：HEAD 缺 import 腐烂链（src=13 Result→src=192 Bytes）仍归 import 线；rootfix5 仅入本轮克隆根。

---

### 8.110 续行 const（双行 const 初式）扫描墙根修（B21 线）：模块 const 行定界扫描器把「行尾 `=`（初式在续行）」的合法声明形整体漏表——qualified/裸名 const 字面量查询全域 Missing → 静态实参定型 fail-closed 判 192 族（exact_def_call_authority:1462 `args=buf, exactdef.BodyIrExactDefContractCidDomainTag`，声明本体=body_ir_exact_def.cheng:382-383 双行 str const，**非枚举成员、非 alias/可见性问题**）；修复=扫描器 pending 项+双循环续行载具（typed_expr +73/−11）：行尾 `=` 产出 pending（accepted 且 literal 空，b2002 语义 accepted 恒非空故组合无歧义），两个扫描循环（ScanContext 过 profile/file 行=metadata 构建路 + ScanStoredContextLines 过存储行=Core 登记路）续行载具吸收首条非空非注释缩进行为初式文本，块结束/新 entry 头先行=弃 pending fail-closed（该 const 维持未登记与 b2002 一致）；全部 b2002 拒绝谓词逐字保留（prev-char 守卫无条件、next-char `==` 守卫保留）——补登记产线合法声明形覆盖，判定合同零改动；森林门轮（t3000 完整窗）**`typed expr:` 前缀全场 1→0**（:1462 前沿消失后森林路径零残余）、历史判词族全零、**src_done=3 首次达成**（src=3 decls=50 整源通过）推进 src=4、r92 stage 2712→2800（+88）、function_index 320→384，新前沿=`cheng_orc_release_failure code=registry_miss detail=wrong_object_or_owner`（src=4 exact_def_derive 首达 r92_t1，运行时 ORC 记账族，非 typed_expr 领地）（2026-09-15 凌晨收尾、开工跨午夜，B21 线；B→…→B20 续攻轮；前次 B21 重派尝试静默死亡遗留 198 件中间件先归档 `b21_preattempt_archive/`，本轮从普查独立重启）

- **静态定位（任务书三候选裁决）**：①「成员非枚举而是 const tag」**坐实**——`BodyIrExactDefContractCidDomainTag: str =`（:382）+ 续行值（:383），const 块内缩进双行 str const；②「B9 alias 解析缺 exactdef 回退」**排除**——探针 b21_qual 读数 qualifier/target/ctx_index 全通（alias 解析+目标 context 在场）；③「流式索引该域行未登记」**坐实为根因**——探针 b21_row `state=missing literal_len=0` + b21_scan `count=2 names=,B21ShortStrTag,B21AnswerIntTag`（provider 四 const 只登记两条单行形，两条双行形全漏）。B9 枚举双臂不接住=命名空间错位（`ctx_enum_name_type_source` 只收枚举行；const 行住 `module_const`/`ctx_module_const_source`，本尊连扫描都未进，注册无从谈起）。
- **家族普查（b21_census_multiline_const.py/.json，按 b2002 扫描器语义镜像实现）**：234 源闭包（b20_forest_closure_234.txt 全集）内「初式在续行」const 声明 **218 处、29 文件**（core 28 + std/os 1）——整个合法声明形对 const 登记产线系统性不可见，非孤立个例。
- **最小复现+探针（kd_b21p1 `91ae652c` = b2002+探针件 `b21_probe_const_scan.patch` +42/−0，env=CHENG_B21_PROBE 门控默认零输出：未设 env 与设 env 夹具 stderr 除探针行逐字节一致、compile_rc 同值）**：provider+consumer 夹具（`repro_xmod_str.cheng` 消费 `cm.B21DomainTagStr` 镜像 :1462 形）kd_b2002 基线判词逐字复现；探针三读数闭合因果链（scan 漏→row missing→qual 臂空→:29650 fail-closed）；单行 ctrl（`cm.B21ShortStrTag`）基线同轮前进=单变量=声明布局。
- **修复（typed_expr.cheng 净 +73/−11，冻结件 `b21_fix_const_continuation_v2.patch`，preflight PASS ann=0 displaced=0 wedged=0，b2_root+live 双树修复区逐字节一致）**：见标题行。**中间态如实记录（均未进烤制即纠）**：探针生成器插入偏移错位（FrozenContext 实参表中间，首烤被 `expected : in if` 当场拦截）修正重落；修复生成器 v1 曾误以 baseline+probe 态为基座（preflight 拒）且循环头 `for`/var 声明一度丢失，重生成纠。
- **验证（kd_b2101 `174412ce` 对 kd_b2002 `e3be0f6b` 单变量：b2_root 对 b2002 态 delta=修复件唯一——b2002 态 typed_expr 先从死账自存基线件恢复（实测其与 HEAD 差仅 T8 刀A 区、B20 八登记行全在、即 kd_b2002 烤制态），再叠修复件；烤 rc=0 金丝雀 4/4，wall 数被日志管道 tail 截断未捕获（mtime 跨度约 5 分钟，如实记录））**：夹具 A/B 同窗——repro@b2002 前沿判词逐字（rc=1）→ repro@b2101 append 相过墙、残墙换防为重建相形（signatures=2→0、lines=10→21，B9 限界①同域：夹具拓扑重建 context 无进程内权威行，**森林借同一索引不受此限**，夹具判据以门轮为准——门轮实证 :1462 全零）；ctrl（单行 const）两驱动 stderr **逐字节 IDENTICAL**（单行形零扰动）；回归 7 件（b19×2/b16×2/b17×2/b12×1）两驱动 stderr+stdout **全 IDENTICAL**（b21_reg_* 14 件）。
- **森林门轮（label=b2101_b21fix，raised 诊断门 env 同 b801…b2002 口径，门轮金丝雀 CANARY_PASS）**：驱动 rc=1 wall=1900s guard_hits=0 lease_hits=0 forest 234/234 ta_stream 234 pass1 235 max_csg_rss=2,089,928,792 ps_mine_max=1,611,424KB。判据（stderr 9034 行 vs b2002 8959）：**`typed expr:` 前缀 1→0**（:1462 前沿消失且森林路径零残余）；exactDefCallAuthorityCidAppendText/BodyIrExactDefContractCidDomainTag 全场提及 1→0；receipt 全族/executable call/frozen*/W7X/redundant/各 drift/generic 三族/specialization/source transaction/panic/explicit conversion/kind=4/kind=2/resolved call missing/static argument type unavailable **全 0**。
- **相位推进实证**：**src_done=3 首次打标**（src=3 exact_def_call_authority decls=50 整源通过：expr_slices_done slice_count=50 expr_count=1074 facts_added=236）；推进 **src=4 decls=13 exact_def_derive**（首达）；r92 stage 2712→**2800**（+88）；function_index 320→**384**。
- **新前沿墙（b2101_b21fix stderr:9033-9034 末判定行；运行时 ORC 记账族，非 typed_expr 领地，后续线攻）**：`ORCM p=0x0000000c3b867ae8 q=0x0000000000040000 r1=0 r2=0 r3=0 t= ctx=0006000<…>` + `cheng_orc_release_failure code=registry_miss operation=normal_release detail=wrong_object_or_owner`——src=4 首源 r92_t1_pre_view_begin 相触发（b2002 全程 ORCM=0，属首达领域暴露）。归属辨析（如实记录）：修复面（const 扫描/登记）与 ORC 记账无结构交联（登记路径与单行形逐字同构、b2002 零 ORCM、新执行域=src=3 整源 CID seal 链首次跑通后的 src=4 消费），倾向首达暴露的 §8.106 P0 同族（registry_miss/dd 毒化族）潜伏缺陷；但本轮无 b2002 可达同相位的对照臂，(a) 修复扰动/(b) 首达暴露**不可完全定谳**——ORC 机器在 cheng_cold.c/runtime 领地，B21 领地（typed_expr.cheng）judgement 已清零，移交运行时车道定谳。
- 边界：本轮对 src/** 唯一改动=typed_expr.cheng（活树对 HEAD **73/11** 纯叠加；开工起点 0/0——B20 已入库 1f61e696e；b2_root typed_expr 开工前被死账中间件污染单文件，按其自存基线件恢复至 kd_b2002 烤制态后开工）；src/std 只读零改动；禁 commit/push、未建分支/worktree；夹具 3 件撤离 b2_root grep=0（回归件由 runner 自撤 EVICT_CLEAN）；烤炉槽 owner+trap 全程（门轮排队让行 d5line l101fix 门轮）；**C2 sha 对拍欠账保留**（src=3 通过后 selfbake 产物仍未完整成型——驱动 rc=1 终于 src=4，out_sha256 空，对拍基线仍未冻结）；瑕疵如实记录：①bash 纪律违一次（python3 heredoc 占位校验，当轮自纠改 Edit 工具）；②探针名过滤初版漏 ctrl 的 B21ShortStrTag 致 ctrl 探针静默（A/B 判读不受影响，ctrl 判据=双驱动 stderr 逐字节一致）；③烤 wall 数未捕获（见验证条）。

---

### 8.116 ORCM 真根因反转（ORCD1 设计线）：B23 三候选全排除（share 内建不漏发/store 胶水不吞计数/ScanContext 纪律正确——kd_b2201 实测反汇编+源码双证）；真根因=**执行过的 retain 未落账**——stage3 `cheng_mem_retain` 带 untracked 静默 no-op 通道（旧合同 system_helpers_backend:1104 find_block_any==nil→return）而 release 侧同等情形 fail-closed——跨层契约不对称；根修补丁冻结件 `orcd1_share_str_independent_copy.patch`（+83/−1：share(str) counted-alias→独立 owned 拷贝）+ORC 硬断言两件（retain strict/quarantine double-push, env 门控 O(1) 零开销）；施工不阻塞 M3（异文件 clone root 路径）（2026-09-15）

- **决定性证据**：B23 运行时事实（首放成功进检疫 ⇒ teardown 入口 rc==1）+ 两份头 flags 均=1（release 胶水 flags 门控反推）⇒ retain 已执行未落账，非漏发非吞计数。
- **待验前提**：`cheng_string_copy` 在冻结 stage3 的存在性未验证——ORCD2 首烤链接期 fail-loud 即知。

### 8.115 ORCM 首释放者定谳（B23 线）：TypedExprClearSourceContextAllFields:49953 `ctx.moduleConstLookup=ParserSourcePathIndexLookup()` 覆盖赋值冷丢弃胶水首放 + :49954 `ctx.moduleConstNames=[]` range-release 再放同块；根因=share/move→嵌套容器字段 store 路径丢一次 retain（TypedExprModuleConstStoreLocalEntryOwned 语义两份独立引用 share 进 names+move 进 InsertExact，机器只保留一份）——B22 二选一收窄为 (b) C 链所有权机器；硬件看门点三级扳机近裸速 479s 到崩溃（仪器 .rebuild/b23_line/b23_lldb_ring2.*，B22 条件断点方案证不可行 35h 外推）（2026-09-15）

- **决定性证据**：捕获轮 SLOT_FIRE#347 payload `0xa70b71b08` 与崩溃现场 `ORCMISS p` 逐位相同、槽号 `q=0x33205` 相同；12 层 worker 线程帧链符号化全命中（证据 `r9/b23_ring2.stdout.txt` 348 命中+ORCMISS 全序列、`b23_ring2.symbolicated.txt`）。
- **判读=同域双重释放**：排除跨源 teardown 顺序与槽身份混淆（0x33205 槽 116 次复用为 4~384B 混合 FIFO，非同 size 链）。丢 retain 精确指令位置=高置信推断，交 C 链车道定位。
- **修复面（移交 C 链车道，bootstrap 领地卡 M3 线在飞）**：share 内建与 str 入嵌套容器字段的 rc 发射审计 + 逐跳 Owned 证明；同载荷相邻双进 quarantine 设 ORC 硬断言；禁症状补丁。点名与双释判读=决定性置信。

### 8.112 待钉区①-⑤静态钉死（N2 线）：①②④已钉+⑤系数已钉行数不可静态钉+③部分钉；T(k) 带 445-530MB→390-430MB、B2 池账 92MB→34.8MB；超门判定式入账（2026-09-15）

- **方法**：零编译（编译槽在飞线占用），静态清点+已有 §读数复核+只读统计脚本（`.rebuild/n2_line/`，报告同目录——易失区，参数以本节为准）。静态闭包复现：dispatch_min import 闭包实测恰 234 文件（31.18MB/653,305 行）独立验证 §8.102；ParserValueExprTree 201 列机器核对与在案一致。
- **① nodes/token = 0.4733 已钉**（双窗口直读 0.47331/0.47339，§8.33 + peak_memory_holders E1c r28；Σnodes=1,719,875；VERIFY 0.55-0.82 反推口径作废）。
- **② typeSyntax 行 = 158,375 行已钉**（§8.23 ta_limits 运行时直读，234 源林；第二窗 157,859 Δ0.33%；676.8 行/源）。TypeArena 侧 column_bytes=71,452,392 已实测，②项不再依赖。
- **③ statementRoot 部分钉**：行数 ∈ [261,641 下界, ≤1,719,875 结构上界]，列宽 9×4B=36B/行钉死（VERIFY「≈body_block_count=764,465」**撤销**——parser 语句 vs BodyIR 块跨人口且超代码行上界 609,240）。钉死需 `statement_root=` 一行打印（ParserDebugStage 加行，E1c 先例零抬帽）。
- **④ 行去重系数 = 0.6110 已钉（静态精确）**：399,311 唯一/653,539 行，唯一载荷 22.1MB；VERIFY 假设 0.9/580k 作废；**lineInternPool 92MB→≈34.8MB（B2 同步下修 57MB）**。
- **⑤ facts 行数**：**119B/行系数已钉** = 源码一等常量（typed_expr.cheng:10212-10223，41B=26 i32+15 u8+运行时 assert+§2.4 同口径）；行数=normalized-expr 行，下界 ≥261,641（C2≥31.1MB），**[1-3M] 依据不在案**，需 typed-facts 相边界逐源 `facts_rows` 打印轮（§8.63 门控模式，部分源即可外推）。
- **T(k) 带下修**：445-530MB → **≈390-430MB**（①②④ 实测/静态值代入）；相 2 池账 92MB→34.8MB（B2 项）。
- **超门判定式（约束卡第 6 条外推口径）**：⑤ 行数外推 **>2.2M ⇒ C2>262MB，叠加基线 737MB 必超门即缺陷**；①②③④ 实测/静态值代入均未触发超门。
- **待办移交**：③⑤ 两个一行读数轮（探针各一行，门控模式）排 compiler_csg/typed_expr 领地+编译槽空档；参数 8 条建议清单见 n2 报告。

### 8.111 P0 根修落地（T14 线）：bind/return 准入门 rep-exits epoch 例外推翻 currentness 的 live=0 判定；修复=例外后补 classifier 消费数据流否决（drop 合成器同款权威）；probe2 形「误编译 dd」→「干净硬错指向真实消费点 op 21」，未迁移 cargo 位点被雷达当场拦截（2026-09-15）

- **分叉点精确定位（修正 §8.106 的表述再精化一层）**：currentness 查询本身在尾臂给出了正确答案（非活），是门内 rep-exits epoch 例外（cold_parser.c:78127-78167）只查代表消费列（rep=op 18，其块 RET 出口 rexit=1）+ 独占 epoch 两个条件、**完全无视 op 21 这个在到达路径上的 classifier-true 真消费者**，把 live 翻回 true → op 149 尾臂再物化获准。同一时刻 drop 合成器经 classifier 数据流判定 CONSUMED（state=4）——**同一机器两个权威对同一事实相反答案**，实锤。
- **修复（cold_parser.c +46/−2，preflight PASS，已入库）**：准入门例外块 `live = oxa_other < 0;` 后补数据流否决（`cold_exact_definition_consumption_dataflow` cheng_cold.c:56797，drop 合成器同款权威）：查询点该 def 已在所有到达路径上被消费（无 LIVE 半）→ live=false，use-after-move 干净硬错，判词带 `flow_valid=1 flow_state=4 last_consumer=21` 指向真实消费点。合法 epoch 数据流保持 LIVE 位 → 否决不可触达合法形（零语义放宽）。
- **验证矩阵（分母 = 本轮产物）**：probe2 形 A/B（载具同根同窗）：base compile rc=0/run rc=1 dd+`ORCMISS deref16=0xdd×13`；fix **compile rc=2 干净硬错**：`exact owner rejected context=bind-source function=t10Canon … consume=19 live=0 flow_valid=1 flow_state=4 last_consumer=21` + `managed bind move lacks exact source value definition`。probe3 最小形判词零回归（剔新增字段逐字节同）；probe4 share 迁移形双臂 GREEN；T6 滞留判别双臂同平台（21.9/22.2MB）无 33.7MB 线性滞留；16 判词族门轮 kd 双臂 stderr 经 `d5_gate_judge.py` **16 族 × 2 臂全零**；四夹具 exe+primary_o 4/4 逐字节 IDENTICAL、sha `7b594c89…`/`abaa15ba…`/`1967b4cd…`/`39213361…` 与 M1/M2 冻结记录逐一相同。
- **T13 雷达实弹验证**：fix 载具对未迁移树烤 dispatch_min 驱动，37s 在 `cargo.primaryObjectCsgcCanonicalJsonIntText`（T13 已知位点 `primary_object_csgc_cargo.cheng:388`）干净硬错，判词同款（flow_state=4）；base 载具同闭包静默误编译烤成。**剩余未迁移位点从「烤出 dd 毒化驱动」变成「编译期指名硬错」**。对诊断克隆根 d6base 的 cargo 位点做一行 T13 迁移（`var magnitude = plain` → `share(plain)`）后 fix 臂烤成——迁移形清偿雷达。
- **T6 flags publish 角色不变**（复核成立）：本轮零触碰释放/flags 路径；T6 滞留判别双臂同平台（21.9/22.2MB）无 33.7MB 级线性滞留。
- **新前沿（越领地，证据在案待裁）**：`strings.SliceBytes` 结果疑为**借用视图**——`let cut = strings.SliceBytes(plain, 1, len(plain) - 1); return cut` 的调用方打印 `0xdd 0xdd`（双臂逐字节同，rc=0 不崩）；视图只在函数内部消费则全对（probe5 v3，132/7/-132/-1234567 全对）。属「视图→owned 绑定」另一缺口，非 T14 门禁，移交协调席。

## 2. 修复形态与 numstat

补丁 `.rebuild/t14_line/t14_gate_flowveto.patch`（生成器 `t14_make_patch.py`，锚点全 1 命中）：(1) 准入门例外块 `live = oxa_other < 0;` 后补数据流否决（valid 且无 LIVE 位 → live=false，约 18 行）；(2) 判词报告器新增 `flow_valid/flow_state/last_consumer` 三字段（错误信息指向真实消费点）。**numstat**：`bootstrap/cold_parser.c 46+/2-`；`bootstrap/cheng_cold.c` 零触碰。撤销路径 `git apply -R`。**preflight**：displaced=0 wedged=0；ann=5 与未打补丁基线同集同位（C 文件注释 `@borrow_result` 文本既有误报，行号全在 hunk 区外）——按 C 文件 ann 基线对照法判 PASS。

## 3. 验证矩阵（数字全部来自本轮产物）

| # | 阶梯 | 结果 |
|---|---|---|
| a | probe2 形 A/B（载具同根同窗） | base：compile rc=0 / run rc=1，dd + `ORCMISS deref16=0xdd×13`；fix：**compile rc=2**，判词 `…consume=19 live=0 flow_valid=1 flow_state=4 last_consumer=21` |
| b | probe3 最小形判词零回归 | base/fix 判词逐字节同（剔新增字段），compile rc=2 双臂 |
| c | probe4 share 迁移形 | compile rc=0 / run rc=0 双臂 GREEN |
| d | probe5 v3 cargo 同构迁移形 | 双臂 compile/run rc=0，`132/7/-132/-1234567` 全对——**T13 迁移位点照常编译且值正确** |
| e | T6 滞留判别 | base 21.9MB / fix 22.2MB max RSS，rc=0 双臂，同平台无 33.7MB 级线性滞留 |
| f | 16 判词族门轮 | kd 双臂 stderr 经 `d5_gate_judge.py`：**16 族 × 2 臂全零** |
| g | 金丝雀 | kd 双臂各 **4/4 PASS**（minmain 两行源 + ordinary 夹具，compile/run rc=0） |
| h | kd 四夹具对基线合同 | ordinary/call/cold/v6：exe **IDENTICAL** + primary_o **IDENTICAL** 4/4；sha `7b594c89…`/`abaa15ba…`/`1967b4cd…`/`39213361…` 与 **M1/M2 冻结记录逐一相同**；run 合同 0/1/0/0 |
| i | 载具级四夹具 A/B | 4/4 exe IDENTICAL + 合同 OK（kd 臂 h 行补齐 primary.o 合同） |
| j | 雷达实弹 | fix 载具 × 未迁移树：37s 硬错于 `cargo.primaryObjectCsgcCanonicalJsonIntText`（flow_state=4）；base 载具同闭包静默烤成 |
| k | kd 单变量门轮（迁移后 d6base，唯一变量=C 臂） | kd_t14mbase rc=0 208s sha `dbf1e69f…` / kd_t14mfix2 rc=0 206s sha `1e572d8c…` |

## 4. 烤制与纪律记录

烤炉槽 owner pid+purpose+trap 全程，多次让行他线占用（只读未 kill）；**d6base 改动已全部还原**（cargo 从备份恢复、8 个探针源删除）；bash 零 heredoc；补丁走锚点计数生成器 + preflight；分叉定位用树内既有 env 门控诊断（`CHENG_OXA_DIAG`），零新探针补丁、零活树额外改动。无违纪自首项。

## 5. 产物清单

补丁/生成器（`t14_gate_flowveto.patch`、`t14_make_patch.py`、`start_numstat.txt`）；载具（`cheng_cold_t14base/fix/fix2`）；脚本（`t14_cc_build.sh`、`t14_probe_run.sh`、`t14_kd_bake.sh`、`t14_canary.sh`、`t14_fixtures_ab.sh`、`t14_kd_fixtures_ab.sh`、`t14_t6_retention.sh`）；探针（`t14_probe5.cheng` v3、`t14_probe6a/6b.cheng`）；证据（`t10_probe2_oxa.compile.log` 分叉铁证、双臂 probe 全套日志、`bake_t14*.log`、`kd_t14*`、`canary_t14m*.txt`、`t14_fixtures_ab.log`、`t14_kd_fixtures_ab.log`、`t14_t6_retention.log`、`cargo.cheng.d6base.orig`）；报告 `REPORT.md`。

## 6. 新前沿与移交

1. **SliceBytes 借用视图逃逸（P1 候选，越 T14 领地）**：`let cut = strings.SliceBytes(plain, 1, len(plain) - 1); return cut` → 调用方打印 `0xdd 0xdd`（双臂逐字节同，rc=0 不崩）；视图仅内部消费则全对。建议独立车道做 SliceBytes 返回所有权判定审计。
2. **T13 情报**：cargo 迁移形 = probe5 v3 形已双臂实证 GREEN 且清偿雷达；cargo 不返回 SliceBytes 视图，无需顾虑前沿 1。家族扫尾 grep 形：`var <名> = <str 局部>`（非 share）且该局部后续仍被读/返回。
3. **判词族增量**：新增字段附属于既有 `exact owner rejected` 判词，非新判词族，16 族门轮不受影响（实测双零）。
4. probe2 家族在门禁件下未迁移即 rc=2——设计行为（雷达），T13 迁移落地一行即清偿（克隆根已演练）。

---


### 8.114 use-after-move 迁移端到端全绿（T13 线，原编号 8.110 重编清偿——与 B21 条目冲突）：cargo/plan/lowering 三处非法形 share 迁移 + 自宿主路径首通 + 闭包家族清扫定谳（2026-09-14/15）

- **已知位点迁移**：`primary_object_csgc_cargo.cheng:388` `var magnitude = plain` → `var magnitude = share(plain)`（T11 §1.2 op21 铁证：MOVE 偷走 plain 唯一 rc；391/418 仍读 plain；尾臂 magnitude drop free "132" → sret 陈旧三元组 → 调用方 dd+双释放。share 后 plain 保持 owning，全部读合法，rc 平衡）。
- **家族清扫定谳**（闭包=driver 234 源传递闭包，closure_files.txt 与门轮 forest_parsed_lines=234 吻合）：闭包内「var Y = X（X 托管）后 X 无重赋值直读」静态非法形共 3 处全部迁移（cargo:388、primary_object_plan.cheng:13246、lowering_plan.cheng:14125）；其余候选逐点审计全合法（零扩）。
- **验证全绿**：kd_t13x1（stage3 × 迁移闭包）烤制 rc=0（876s）；金丝雀 minmain+ordinary 双零；四夹具 primary.o sha 与 M1/M2 冻结跨根记录逐一相同（`7b594c89…`/`abaa15ba…`/`1967b4cd…`/`39213361…`）、run 合同 0/1/0/0；probe2 形 RED→probe4 形 GREEN；16 判词族在烤制日志/门轮 stderr/无 trace 门轮 stderr 三日志全零；`admission failed` 全部产物零出现。
- **admission RED 机制定谳（本轮新发现，移交 bake 车道）**：cc 载具（cheng_cold）内嵌的 cargo 是烤进 C 链的闭包转译副本——同一 HEAD 快照的 t13base/t13x1 两根 bootstrap 逐字节相同，故 cc 路径的 A/B 对迁移天然盲。T10 的 `admission failed` RED（t6c C）在 HEAD C 链不再复现（函数级缺陷仍活：probe2 RED 签名完整复现；C 链 T7+ 演化掩蔽了 emission 路径表现，CHENG_QUARANTINE=0 窗口亦不复现）。**迁移代码进入驱动的唯一路径=自宿烤制（stage3 × 根闭包）**——该路径 kd_t13x1 已全绿；C 链从迁移后闭包再生成属自烤链车道（非冻结期不烤正式固定点）。
- **门轮读数如实记录**：kd_t13x1 self-bake 门轮在 src=61（pass=0 解析相）撞驱动自守卫（rss 894MB > 768MiB，rc=125）——判为驱动代际内存属性，非本线迁移所致：3 行 share 语义无操作不可能贡献 90MB；带/不带 trace 两轮同点位命中。判词族不受影响（16/16 零）。

---


## 附：本文用到的原始件清单（只读，未修改）

| 用途 | 路径 |
|---|---|
| 门值常量与逐相锚 | `tools/memory_model_limits.sh` |
| 门值推导链 | `docs/selfhost-resource-plan.md:16-30` |
| 逐相公式 | `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_tamem_model_append.md` |
| 717 / 726 MiB | `verify_append/VERIFY_w153_append.md:7,44,48` |
| 747.7 / 724.7 MiB | `verify_append/VERIFY_phasec_l3b2_append.md:11,52,74` |
| 748 MiB | `verify_append/VERIFY_gen2p1_2_append.md:90` |
| 编译理论公式 | `bootstrap/cheng_cold.c:75457,75861,75907,75958-75977,76016,76029-76042,76055-76062` |
| 13.641× 原始件 | `.rebuild/auth_fix/kd_fix.report.txt:76-92`；`.rebuild/auth_fix/bake.log:4114-4121` |
| Cheng 链内存/时间模型 | `src/core/tooling/backend_driver_main.cheng:3721-3863,3903-4141,4176-4234,4284-4385,4416-4459,4589-4594` |
| Cheng 链孪生副本 | `src/core/tooling/backend_driver_dispatch_min.cheng:2451-2456,2477,2857,2994-3010,3021,6158,6246` |
| 模型复算样例 | `artifacts/bootstrap/compiler_main.direct.dry-smoke.report.txt:1701,1706,1708,1728-1730,1742,1800,1809,1813-1815,1822,1865,1893,1895,1897,1899` |
| 运行时 1.60×/97.02% 原始件 | `.rebuild/run_b5/full/B_raised4g.stderr.txt`、`A_default.summary.txt` |
| 运行时对照叙述 | `verify_append/VERIFY_fullgo_0910_append.md:86-151,476-560,634-760,800-840` |
| 病态判据与轴判定 | `docs/cheng-plan.md（原 memory 计划 :148-200,377-396）` |
| 门读数身份探针（本轮新增，只读源 + 可重跑） | `.rebuild/s1b_step3/r8/phys_footprint_probe.c`、`.rebuild/s1b_step3/r8/rusage_probe.c` |
| §⑧ 逐相分解原始件 | `.rebuild/s1b_step3/r7/gate/b.stderr.txt`、`b.summary.txt`、`base.stderr.txt`、`base.summary.txt` |
| §8.22 链接阻断现场 | `.rebuild/s1b_step3/r9/bake_r56.log`（`darwin_host_c` provider 链接失败尾部） |
| §8.22 副本根构建器（只反向剥探针） | `.rebuild/s1b_step3/r9/scratch_probe_revert/build_scratch_root.py`、`probe_only_revert.patch` |
| §8.22 副本根烤（带 SCRATCH 标记） | `.rebuild/s1b_step3/r9/bake_scratch_r9.sh` |
| 每轮金丝雀（AGENTS §10②） | `.rebuild/s1b_step3/r9/canary_r9.sh` |

### 8.109 census A 类领地外残留发射翻转终版普查定谳（F7 线）：csg_asset 四族 JSON fact 发射器整行 canonical 包裹（双重缺陷=mine 值域 plain 文本+key 序非字典序；held-cli 真实二进制三方判定 修前真红→修后真绿+非 mine 零扰动）；c/py statement 族与 envelope JInt 面记录移交（2026-09-14）

- **普查方法**：A 类读侧 = `CsgCoreMerkleStoreParseInt32` 家族（`csgTryInt32Field`/`csgRequireNonnegativeInt32Field`/`csgRequirePositiveInt32Field` + wire int 字段/数组）全仓 grep → 逐读点反查发射器 → 发射/读取/消费三态定谳；canonical 规则按 json_canonical.cheng:537/934 实读（数字取 plain/scientific 更短者；**canonical JSON 同时要求 object key 字典序**，csgJsonObjectOrder 归并排序实证）。
- **终版普查表**：①cargo native object_* 27 int 字段=primary_object_csgc_cargo（F4 已翻✓，只读）；②cheng_compiler::snapshot wire int=compiler_snapshot_cargo AppendInt32（F4 已翻✓；余 plain 位点=闭枚举/版本常量 plain==canonical 恒真，F4 已记录）；③c::translation_unit.functionCount=c_csg_ast_emit（F5 已翻✓）；④python::module.symbolCount=py_csg_ast_emit（F5 已翻✓）；⑤unimaker innovation 八 kind=innovation_csg.cheng 整行 innovationCanonical 权威收口✓；⑥web scene.*/media_frame_receipt（pixelFormat/nodeId/parentNodeId 等）=**validator 读侧为 int-checked（非 RawField，修正 F4 清单措辞）但无生产发射器**（csg_web_facts.cheng 纯类型定义仅 1 fn；仅 src/tests 夹具构造）非雷面✓；⑦B 类 JSON string 承载（merkle_manifest partition/header/shard 计数、artifacts、operation、request nat32）=canonicalizer 不入字符串非雷面✓；⑧finance 全数=RawField+无生产发射器（certified_transaction 仅 hash preimage 文本）✓。
- **新发现真雷面（F4 §七移交清单三处猜测之外的漏判）**：`src/core/csg_asset/oracle_asset.cheng` 六发射器（OracleAssetObservation/UnimakerProductCertificate/VexaAssetCandidate/VexaDeterministicPlan/VexaExecutionReceipt/VexaRecoverableCell FactJson）+ `hyperliquid_source.cheng` HyperliquidMidSourceFactJson——读侧 RawField（csgRequireRawField 无格式约束），但消费链 `CsgAssetAdmitAndEncodeCsgc`/`CsgAssetProductionAdmitFactLines`（src/apps/unimaker/unimaker_product_publish.cheng 生产 app）走 `CsgCoreProductionAdmitFactLines` replay 侧逐行 canonicality——**RawField 数值同样被行 canonicality 管辖**（§8.85 rejected 行 offset:1000 同理），且 observedAtMs/validUntilMs 类 epoch-ms 尾零值（canonical 1.7578308e12 短于 plain 13 位）必触雷。**双重缺陷**：(a) int 文本 plain；(b) key 序非字典序（kind 在首）——后者与数值无关同样必拒，F4/F5 的逐字段翻转刀法不足以收口本族。
- **修复（本线冻结件 `f7_flip_census_oracle_vexa.patch`，oracle +21/−6、hyperliquid +12/−1，预检 PASS，未 commit）**：两文件各 +1 `*CanonicalFactLine` helper（镜像 unimaker innovationCanonical 权威收口刀法：发射器出口整行过 `CsgCoreJsonCanonicalize`，panic fail-closed），7 个 FactJson 出口 `return out` → `return *CanonicalFactLine(out)`；hash preimage（assetAddLine 系 key=value 文本）零接触。非 mine 值 plain==canonical 逐字节不变。
- **验证（真实二进制 held-cli `~/.cheng-held/csg-cli`；该二进制 era 的 json_canonical/canonicality 门/RawField 读与 HEAD 逐字节同源——git 实证 json_canonical 自 08-22 未改、root_binding_line 门与 csgRequireRawField 自 initial commit 未改，F1/F3 只动 cargo 读侧与 int-checked 读侧）**：七行 closed-loop 探针（schema+observation+certificate+candidate+plan+receipt+cell，值含 mine 域 900000000000/1000/1990000000）三变体——**修前发射字节（emitter key 序+plain int）**：`validate --mode sandbox` rc=1 `Merkle admission failed: root_binding_line 2 noncanonical`（真红）；**修后发射字节（同值整行 canonical 形）**：rc=0 valid=1 complete=1 fact_count=7（真绿）；**非 mine 值变体**（1757830800123/1500/123456789 等）：rc=0 全绿且与 plain 期望逐字节同（零扰动）。`pack` 独立复核同三角（canonical sorted rc=0 / plain-mine rc=1 `pack_source_line_2_non_canonical` / plainsafe rc=0）。
- **如实披露（验证欠账）**：csg_asset 族 standalone 编译当前被**与本补丁无关的在飞编译墙**阻断——`f7_probe_min/smoke` 在 HEAD 与 kd_l100base/kd_b1001 双驱动下同一 `typed expr type arena: qualified imported nominal missing`（typed_expr 领地，B21 在飞），stage3 下为 `call argument transfer authority` 墙（sha256/ecnist 闭包）——修前修后同位同文（补丁不新增编译错误，取证据链在档）；族内三个 smoke（csg_asset_production_gate 所列）同被阻断且 gate 脚本本身 `--jobs:1` 对 Aug-31 stage3 非法（预存）。补丁运行时级闭环待该闭包编译恢复后以三 smoke+探针收口。
- **记录移交（非本轮领地）**：①c/py migration statement facts（`csg_dialect::native::param_i32/stdout_line/local_i32/store_global_i32/global_i32`，c_csg_ast_emit/py_csg_ast_emit plain 发射）——主 validator native 臂只收 object_* 五 kind，这些 kind 在现 HEAD 直接 `unsupported native fact kind` 拒收，migration smoke 与主 validator 的兼容性断裂在 csg_migration+validator 双禁区，交主线裁定；②merkle_manifest envelope `cargoByteCount/originKind/semanticEpoch/snapshotSchemaVersion`（compiler_snapshot_cargo plain 发射）读侧为 json.JInt 结构检查（merkle_manifest.cheng:1240-1248），envelope 批走 WithDag（plan 侧不查行 canonicality）现一致；若未来进 replay 路径则成「plain 被拒/scientific 被 JInt 拒」两难，须同步翻 JInt 读侧——记录；③`native_object_profile_validation.cheng` 重发射逐字等值钉 plain 形且无生产接线（仅测试 smoke），接线前必须先翻；④oracle/vexa/unimaker 家族 RangeField JFloat 接受面收窄继续留用户级裁定（F3 遗留）。
- **瑕疵自纠**：补丁生成器首版锚点转义歧义致重复插入（import/helper ×3），检出后 checkout 回 HEAD 单次重放冻结件修复，最终态 grep 计数 1/1/1 + numstat 复核在档。

---

### 8.113 src=4 首达 ORCM 现役基座复现定谳（B22 线，原编号 8.112 重编清偿——与 N2 冲突）：判据前提「b2101 含全部已入库修复」证伪（B 线烤制载具 cheng_cold_v3=09-10，缺 D1/D2/D3/T3/T6/T7/M2/T14 全部 C 链修复+T13 迁移）；当前并集基座 kd_b2201（HEAD adebd9c48 快照 × T14 载体 b22c）ORCM 仍现 ⇒ 新表位/新形态坐实；面孔=TypedExprSourceContext seq[str] 域 32B str 载荷 dd 填充双释放，kd_b2101/kd_b2201 逐位同链同释放位（ClearSourceContextAllFields+9144，teardown 报告者）；16+ 历史判词族全零、金丝雀 4/4×2；修复层证据指向禁区（typed_expr/compiler_csg 或 C 链）→ 交报告+检疫环定向捕获仪器移交（2026-09-15，B22 线重派）

- **前提证伪（首要新事实）**：B 线载具 `cheng_cold_v3`=09-10 二进制；D1/D2 read_copy（f5d9db72a 09-13）、D3/T3、T6/T7、M2（d80db2cf3 09-14）、T14 move-kill 门（50f27eef8 09-15 06:42）、T13 三处 share 迁移（d5d9ab020 09-15 07:37）全部不在 kd_b2101 内。B21 §8.110「倾向首达暴露的 §8.106 同族潜伏缺陷」再精化：T14 已修 bind/return 门面，registry_miss 族另有**独立未修面**（T14 雷达对它无感——kd_b2201 烤制 rc=0 即 HEAD 闭包在雷达下无非法 use-after-move 形）。
- **EXP1 载具单变量（kd_b22v1 = v1cur `79e0ce59…` × b2_root，sha `32e55321…`，烤 rc=0 212s 金丝雀 4/4）**：门轮 t3000 rc=124 超时+5400s 长窗轮被 harness 回收杀于 ~85min；两轮合计 **pass1 234/234 全清零 ORCM**、r92 流至 src=2 深部（r92_tb_post_observe_verify）零 ORCM；src=4 未达（wall 预算，如实记录）。判读：pass1 段 v1cur×b2_root 干净。
- **EXP2 当前并集基座（kd_b2201 = b22c `5aa2dbf7…` × b22r1 HEAD `adebd9c48` 快照，烤 rc=0 744s 金丝雀 4/4，sha `0c52c44b…`）**：门轮 rc=1 wall=1078s，**ORCM 重现于 pass1 src=13**（codegen_a64_body_units.cheng@HEAD，两根唯一差 1 行死 import=内容排除）`merge_stage post_parse src=13`→`post_authority` 窗口（authority 窗）；ORCMISS deref16=0xdd×13 + 检疫环命中（32B、偏移 0）⇒ **双释放定性**（首释放早夭+dd 检疫填充，teardown 端再释放=报告者）。判词原文 gate/b2201_b22fix.stderr.txt:1919-1923 在档。
- **同链铁证**：lldb 回溯（b22_lldb_trace2）kd_b2201 = `_494(registry_miss_fail) ← _499(registered_header) ← _502(checked) ← cheng_mem_release ← _269/_267(str_release) ← cheng_seq_string_release_range_compat ← TypedExprClearSourceContextAllFields+9144(typed_expr.cheng:49897，释放域 ctx+0x320) ← BuildWorkingSetReleaseWithOutcome+6796 ← compilerCsgBuildConsumeWithOverridesCoreInto`——与 kd_b2101 两函数 size 同 10528/释放调用点同 +9144 逐位同链。相位漂移（b2101@r92-src4 ↔ b2201@pass1-src13）合 orc_release_miss_triage §3.4「报错点=第一个再释放持有者」。
- **归因排除**：B21 续行载具所有权与单行形同构（PathTrim 恒 CloneStr/NewStringCopy 新 owned；StoreLocalEntryOwned/lookup 引用各自独立源级平衡）——B21 修复面排除；T13 迁移完整在场。
- **验证矩阵**：16+ 历史判词族（typed expr:/receipt 全族/executable call/frozen*/W7X/redundant/drift/generic/source transaction/panic/explicit conversion/admission failed 等）kd_b2201 门轮 **全零**（唯 ORCM 族）——B21 typed_expr 修复成果在并集基座保持；T14 雷达指纹 A/B 四臂（t10_probe2：b22c 双根 rc=2 flow_state=4 / v1cur 双根 rc=0+run rc=1 旧 dd 形）；src_done 未推进（kd_b2201 死于相位流之前，记录仍=b2101 src_done=3）。
- **验证补**：kd_b2201×b22r1 四夹具 3/4——ordinary/cold/v6 primary_o 与 M1/M2 冻结记录逐字节相同（7b594c89…/1967b4cd…/39213361…，run 合同 0/0/0）；call 夹具 compile rc=2 `merkle_store_before_snapshot_head_absent`（merkle_store_identity.cheng:3287 before-snapshot head 链走 atomic-tree verified root，新鲜快照根无积累状态；拷入 cargo 目录 190 个未愈）=环境状态前置条件非 codegen 回归。**未定谳与欠账**：①首释放者未点名——单发 watchpoint 法无效（ASLR-off 下 miss 载荷地址逐跑漂移 0x749f09778/0xaef0abfc8，检疫槽 JOBS=1 稳定 0x33205）；**检疫环定向捕获仪器已交付**（b22_lldb_ring.sh/.py：bp `cheng_quarantine_ring_push_locked` native 条件 `(head+len)%cap==0x33205 && size==32`，命中打印载荷+32B 内容+fp 链，管道已验证 PUSH#1 帧链可解码），共享机 contention 未跑完，运行时车道直接续跑即得；②kd_b2201 四夹具对 M1/M2 冻结合同——ordinary 已过（primary_o `7b594c89…` frozen_match=YES）call 起被 harness 杀已重排队；③kd_b22v1 四夹具未跑；④EXP1 src=4 判读未达。
- **裁定**：修复层证据指向编译后 Cheng 语境生命周期（typed_expr/compiler_csg=禁区）或 C 链所有权机器（cold_parser/cheng_cold=禁区且 cheng_cold.c 有他线 WIP +146/−35）——越 B22 领地，交协调席裁线（建议：运行时车道用 §移交仪器点名首释放者后定修层；B 线基座自本轮起按 V1 README 切 v1cur+T14 载体，勿再引 cheng_cold_v3）。
- **纪律**：零 src/** 改动零补丁入库；禁 commit/push 未建分支/worktree；bake 轮槽 owner+trap 全程（两处 lldb 诊断跑未持槽=缺口如实记录）；bash 零 heredoc；harness 三次回收后台长任务（证据以落盘 log 为准）。
