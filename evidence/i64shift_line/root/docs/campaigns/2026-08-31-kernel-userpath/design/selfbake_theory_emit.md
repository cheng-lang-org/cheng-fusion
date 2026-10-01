# 真实自烤发射理论/实测对照字段（接线报告）

对象：234 源全量自烤（`kd system-link-exec --in:src/core/tooling/backend_driver_dispatch_min.cheng`）
来源问题：`design/deterministic_model_derivation.md` §3.6 / §⑦-8（"接线缺失，优先级最高"）

---

## ① 结论先行

**接线点**：`src/core/tooling/backend_driver_dispatch_min.cheng`
- 新函数 `BackendDriverDispatchMinAppendSelfbakeTheoryLedgerReport`：插在 HEAD `:2809`（`BackendDriverDispatchMinAppendFullTheoryReport` 的 `return true`）之后；落地后占工作树 `:2814-:3096`（含行解析小函数 `BackendDriverDispatchMinTheoryLedgerLineInt64` `:2814`）。
- 调用点：`BackendDriverDispatchMinSystemLinkExecWorker`，HEAD `:7002`（`if len(work.preExecutionReport) <= 0:` 那段报告兜底）之后、`work.err = ""` 之前（落地后 `:7302-:7325`）；守卫 `work.reportKind == "" && !work.heldObjectMode`（即真实编译路径，不含 debug-report / print-symbols / held-object）。
- 墙钟起点：同一个 worker 入口（HEAD `:6866` 之后）新增 `let theoryEmitStartNs = BackendDriverDispatchMinMonoTimeNsBridge()`（落地后 `:7165`）。
- CPU 取样：`BackendDriverDispatchMinCurrentCpuUs`（HEAD `:3371`）拆出 `BackendDriverDispatchMinRusageCpuUsWith(who)`，新增 `BackendDriverDispatchMinRusageChildren = -1`。

**是否已落地**：是。改动留在工作树；patch 双份：

| 位置 | 说明 |
|---|---|
| `.rebuild/theory_emit/selfbake_theory_emit.patch` | 原始件（`.rebuild` 被 gitignore） |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/selfbake_theory_emit.patch` | 防丢副本（git 可追踪） |

`git diff --numstat` = **323 加 / 2 删**，只动这一个文件；`git apply --check --cached`（对 HEAD 索引）与 `git apply --check -R`（对工作树）均通过。改动前该文件 `git diff --numstat` 为空（pristine）。

**是否已验证**：见 §④/§⑥（`验证状态` 段逐项写"已实测 / 未做及原因"）。**未通过编译前，本报告不宣称任何"发射成功"。**

### ⚠️ 前提更正（回源核对结果，与任务描述不同）

任务书说："`.rebuild/run_b5/full/{A_default,B_raised4g,selfbake}.stdout.txt` grep `compile_theory` 0 命中 ⇒ 真实自烤不发射任何理论字段"。

三个 stdout 文件确实是 0 字节（sha256 全 = `e3b0c442…b855`，空文件）。但**"stdout 空"≠"不发射"**：Cheng 驱动的诊断全部走 `--report-out` 档案，stdout 按设计是空的。回源后事实是三分的：

| 路径 | 理论字段 | 实读证据 |
|---|---|---|
| C 链 bake（`cheng_cold*` 当车头） | **有**（`compile_theory_*`，stdout + report 都写） | `.rebuild/run_m73x/kernel_driver.bake.report.txt`：`compile_input_source_file_count=234`、`compile_real_cpu_ms=227474.528`、`compile_theory_parallel_limit_ms=16248.181`、`compile_real_over_theory_x=13.240`；产生处 `bootstrap/cheng_cold.c:75968-75970`、stdout 打印 `:76045-76064` |
| Cheng 链真实 `system-link-exec`（`kd`，`scope=selfhost_direct`，`full_backend_codegen=1`） | **0 个**（stdout 与 report 都 0） | `.rebuild/pool68/call_fixture.j1.A.exe.report.txt`（1184 行，sha256 `a2a95a3f…3ac9`）：`^(compile_theory\|compile_real\|compile_input\|full_compile_theory)` = **0 命中**，而 `system_link_exec_scope=selfhost_direct`、`real_backend_codegen=1`、`:980` 为 `full_backend_codegen=1` |
| Cheng 链 dry-compile | 有（`full_compile_theory_*`） | 调用链唯一：`dispatch_min.cheng:6158 → :6246 → :2857 → :3021 → :2477` |

⇒ 文档 §3.6 的**结论**（234 源真实自烤不产理论字段）成立，但**证据要换**：不是"stdout 0 命中"，而是"Cheng 驱动自带 report 文件里 0 命中"。这条更正影响 §⑦-8 的表述，不影响其待修定性。

另：`compile_theory_*` 是**C 链口径**（由 `cheng_cold.c` 那个进程产生）。Cheng 驱动走 `selfhost_direct` 时主编译不经过 `cheng_cold`，所以它在结构上不可能出现在 Cheng 驱动的报告里——这正是需要接 Cheng 链自己的模型（`full_compile_theory_*`）的原因。

---

## ② 为什么不发射：实读依据（HEAD 行号，已重新 grep 点名符号）

1. **理论块只有一个调用点，而且在 dry-compile 分支里。**
   `grep -n "BackendDriverDispatchMinAppendFullTheoryReport(out,"` → 全文件仅 `:3021` 一处，位于 `BackendDriverDispatchMinAppendDryCompileReport`（`:2857`）内部；后者只被 `BackendDriverDispatchMinRunDryCompileConcretePlan`（`:6158`）调用，而 `:6158` 只由 `dry-compile` 命令码（`BackendDriverDispatchMinCommandCode` 返回 14）进入。

2. **真实路径的报告装配在别处，且不调用它。**
   `BackendDriverDispatchMinSystemLinkExecWorker`（`:6866`）在 `:6949-:7004` 装配 `work.preExecutionReport`（debug-report / print-symbols 分支，或末段 `Fmt"{work.runtimeResult.planReport}{sexecrt.SystemLinkExecRuntimeResultReport(work.runtimeResult)}"`）；`BackendDriverDispatchMinRunSystemLinkExecFromCmdline`（`:7409`）在 `:7505-:7513` 把它落盘。两条路径都没有理论块调用。

3. **不是编译期开关、不是入口不同。** 没有 `#ifdef`/env 门；`dry-compile` 与 `system-link-exec` 用的是同一个 `BackendDriverDispatchMinAppendFullTheoryReport`，只是后者从未被接上。

4. **产物字节安全性（读码结论）。** 产物 `--out` 的字节在该 worker 内部由 `SystemLinkExecRuntimeFinalizeCompileReceiptInto` 完成后立刻哈希入 compile receipt（`system_link_exec_runtime.cheng:4124` 调用、`:4141` 才装配 `planReport`），`preExecutionReport` 之后才装配；报告文本不参与 receipt/产物哈希。⇒ 往报告追加诊断行在结构上不动产物字节（仍需实测确认，见 §⑥-3）。

---

## ③ 改动前后代码原文

### 3.1 改动前（HEAD）

```c
// :3371
fn BackendDriverDispatchMinCurrentCpuUs(): int64 =
    var usage: BackendDriverDispatchMinRusage
    if BackendDriverDispatchMinGetrusageBridge(0, usage) != 0:
        return int64(-1)
    ... (user+sys 累加)
    return userUs + sysUs

// :7002（真实路径报告装配末端，其后直接 work.err="" / work.ok=true）
    if len(work.preExecutionReport) <= 0:
        work.preExecutionReport =
            Fmt"{work.runtimeResult.planReport}{sexecrt.SystemLinkExecRuntimeResultReport(work.runtimeResult)}"
    work.err = ""
    work.ok = true
```

### 3.2 改动后（工作树）

```c
// 常量块（:344 之后）
    BackendDriverDispatchMinRusageSelf = 0
    # getrusage(RUSAGE_CHILDREN): Darwin 与 Linux 同为 -1，汇聚已 wait 的子进程
    # CPU（provider 嵌套编译）。
    BackendDriverDispatchMinRusageChildren = -1

// :3371
fn BackendDriverDispatchMinRusageCpuUsWith(who: int32): int64 = ...   // 原体，0 换成 who
fn BackendDriverDispatchMinCurrentCpuUs(): int64 =
    return BackendDriverDispatchMinRusageCpuUsWith(
        BackendDriverDispatchMinRusageSelf)

// :2809 之后新增（全文见 patch）
fn BackendDriverDispatchMinTheoryLedgerLineInt64(text: str, key: str, value: var int64): bool
fn BackendDriverDispatchMinRatioOrUnavailableText(numerator: int64, denominator: int64): str
fn BackendDriverDispatchMinAppendSelfbakeTheoryLedgerReport(
        out: var str, rootDir: str, plan: var sexec.SystemLinkExecPlan,
        wallNsRaw: int64, reason: var str): bool

// :6866 worker 入口
    let theoryEmitStartNs = BackendDriverDispatchMinMonoTimeNsBridge()

// :7002 之后（新增 28 行，落地后 :7298-:7325）
    if work.reportKind == "" && !work.heldObjectMode:
        let theoryWallNs = BackendDriverDispatchMinNowNs() - theoryEmitStartNs
        var theoryPlan = work.plan
        var theoryBlock: str
        var theoryReason: str
        let theoryOk = BackendDriverDispatchMinAppendSelfbakeTheoryLedgerReport(
            theoryBlock, work.workspaceRoot, theoryPlan, theoryWallNs, theoryReason)
        work.plan = theoryPlan
        var theoryOut: str
        if theoryOk:
            BackendDriverDispatchMinAppendLine(theoryOut, "theory_emit_status=ok")
        else:
            BackendDriverDispatchMinAppendLine(theoryOut,
                Fmt"theory_emit_status=error reason={theoryReason}")
        BackendDriverDispatchMinAppendLine(theoryOut, theoryBlock)
        var theoryReport = work.preExecutionReport
        BackendDriverDispatchMinAppendLine(theoryReport, theoryOut)
        work.preExecutionReport = theoryReport
        BackendDriverDispatchMinPrintLine(theoryOut)
```

**设计要点（为什么这么写）**
- **一处模型，不抄第二份**：理论侧直接调既有 `BackendDriverDispatchMinAppendFullTheoryReport`（Cheng 链系数模型），比值行所需的 `lower_bound`/`budget_upper`/`rss_lower_bound` 从**同一份刚生成的文本**里按整数键精确取出（`full_compile_theory_time_lower_bound_ns=` 等），不重算、不另立公式。上游改模型，比值自动跟随。
- **失败不静默**：模型构建失败 / 扫描失败 / 取键失败 → 报告里写 `theory_emit_status=error reason=<具体>`，不写假数字，也不改变编译 rc（诊断块失败不该让已哈希完成的产物作废）。
- **分母非正不写 0.000**：比值分母非正时输出 `unavailable`，不冒充测量。
- **实测取样点在编译执行完成瞬间**（本块自身的 234 文件闭包扫描在其后），故块里的 wall/cpu 是编译本身的量，不含诊断开销；这一点写进块内自述字段。
- 输出双通道：报告文本（`--report-out`）+ stdout（`BackendDriverDispatchMinPrintLine`，只打印新块本身，不整份报告回灌 stdout）。stdout 是"只写诊断"通道，当前真实编译路径 stdout 为空，追加不会改任何产物。

---

## ④ 发射块样例

`验证状态`：**本轮没有真实发射输出可贴**（未取得编译槽位，见 §⑥）。下面是**代码形状**（字段名/顺序/单位声明，逐行取自 patch 落地后的源码），不是实测样例；带 `←实测` 的字段留空，未跑前不填任何数字。已完成的最近一层证据是 §⑥-0 的改动形状静态验证（有效轮）。

```
theory_emit_status=ok
theory_emit_scope=selfbake_real_system_link_exec
theory_emit_chain=cheng_chain
theory_emit_model_family=full_compile_theory_deterministic_framework
theory_emit_caliber=posterior_folded_lower_bound_not_prior_upper_bound
theory_emit_measure_at=compile_execution_complete_before_theory_source_scan
theory_emit_units_time=ms_decimal_3dp_and_ns_integer
theory_emit_units_bytes=bytes_integer_mib_binary_mb_decimal
theory_emit_wall_ns=…            theory_emit_wall_ms=…              ←实测
theory_emit_cpu_self_us=…        theory_emit_cpu_children_us=…      ←实测
theory_emit_cpu_tree_us=…        theory_emit_cpu_tree_ms=…          ←实测
theory_emit_hw_logical_cpu=…                                        ←实测
theory_emit_effective_parallelism_cpu_over_wall_x=…                 ←实测（有效并行度）
theory_emit_theory_source_closure_files=234                         ←实测（本闭包）
theory_emit_theory_source_closure_lines=…  …_bytes=…
theory_emit_theory_source_closure_ns_input=0_coefficient_only_real_path_has_no_separate_closure_phase_sample
theory_emit_theory_time_lower_bound_ns=…  …_ms=…                    ←Cheng 链模型
theory_emit_theory_time_budget_upper_bound_ns=…  …_ms=…             ←Cheng 链模型（3×+20ms）
theory_emit_real_wall_over_theory_x=…                               ←判据比值
theory_emit_real_cpu_tree_over_theory_x=…
theory_emit_converged_wall_within_budget_upper=0|1                  ←判据
theory_emit_converged_rule=wall_ns_le_budget_upper_ns_k3_plus_20ms_source_derived
theory_emit_rss_peak_scope=process_self_peak_ru_maxrss
theory_emit_rss_peak_bytes=…  …_mib=…  …_mb=…
theory_emit_theory_rss_lower_bound_bytes=…  …_mib=…
theory_emit_real_rss_over_theory_rss_lower_x=…
theory_emit_hard_gate_bytes=…   theory_emit_real_rss_over_hard_gate_x=…
cheng_cold_chain_compare_formula=compile_theory_parallel_limit_us=ceil(compile_real_cpu_us/hw.logicalcpu)
cheng_cold_chain_compare_formula_source=bootstrap/cheng_cold.c:75968-75970
cheng_cold_chain_compare_caliber=posterior_this_run_cpu_div_logical_cpu_not_a_lower_bound
cheng_cold_chain_compare_not_comparable_to=full_compile_theory_time_lower_bound_ms
cheng_cold_chain_compare_parallel_limit_ms_from_cpu_self=…          ←对照行（异口径）
cheng_cold_chain_compare_parallel_limit_ms_from_cpu_tree=…          ←对照行（与 C 链同输入口径）
<随后整段 full_compile_theory_* 模型文本（约 100 行，与 dry-compile 同格式同键名）>
```

**量级预告（外推，非实测，仅用于判断判据是否荒谬）**：拿 `artifacts/bootstrap/compiler_main.direct.dry-smoke.report.txt` 的 29 源输入（25154 行 / 956981 B）线性外推到 234 源（641976 行 / 30551383 B，来自 `.rebuild/run_m73x/...report.txt:78-80`）：`serial_phase≈44 s`、`parallelizable≈31 s`、`effectiveJobs=2` ⇒ `lower_bound≈60 s`、`budget_upper≈180 s`。对照 Cheng 链真实自烤的分钟级墙钟（run_b5 B 轮 1271 s 仍未收尾），`converged=0` 是**预期结果**——这正是"可判定"要暴露的东西，不是缺陷。

---

## ⑤ 口径声明

1. **单位显式**。`*_ms` = 十进制毫秒 3 位小数（`RatioMilliText(ns,1e6)`）；`*_ns`/`*_us` = 整数；`*_bytes` = 字节整数；`*_mib` = 二进制 MiB（÷1048576）、`*_mb` = 十进制 MB（÷1000000），两者都在块内单独成行，禁止互推。
2. **先验 / 后验**：
   - `theory_emit_wall_*`、`cpu_*`、`rss_peak_*` = **本轮实测**（`cheng_monotime_ns` / `getrusage(SELF+CHILDREN)` / `ru_maxrss`）。
   - `theory_emit_theory_*` = Cheng 链**系数模型**结果。其时间下界在 dry-compile 口径里含一项实测闭包耗时（`sourceClosureNs`），所以文档 §③-4 已定性为"后验折算的下界"。**本接线不搬运那个实测项**：真实路径没有单独采样的闭包相，直接传 `0`，于是 `source_phase = max(0, files×200000 + bytes×50)` 是**纯系数项**，并在块内用 `theory_source_closure_ns_input=0_coefficient_only_…` 明示。这个选择让下界更小、比值更大（保守，不美化），且不比 dry-compile 更"乐观"。
   - `theory_emit_converged_*` 是判据位，不是测量。
3. **与 C 链对照，禁止互代**：
   - Cheng 链用 `full_compile_theory_*`（相划分 + 系数表，`backend_driver_main.cheng:4416-4451`（`lowerBoundNs` :4449、`×3` :4450、`+20ms` :4451），孪生本文件 HEAD `:2657-2692`（`:2690/:2691/:2692`））。
   - C 链只有 `compile_theory_parallel_limit_us = ceil(compile_real_cpu_us / hw.logicalcpu)`（`bootstrap/cheng_cold.c:75968-75970`；`compile_real_cpu_us` 就是 `cold_process_tree_cpu_us()` = SELF+CHILDREN，`:75861-75872`）。本块把它**另列**成 `cheng_cold_chain_compare_*` 两行：`..._from_cpu_tree` 与 C 链输入口径一致（可直接对照），`..._from_cpu_self` 仅供单进程对照；字段名带 `compare` 前缀，**不叫** `compile_theory_parallel_limit_ms`，避免被当成本轮 C 链回执。
   - 块内显式写 `cheng_cold_chain_compare_not_comparable_to=full_compile_theory_time_lower_bound_ms`：两条"理论下限"相差量级（C 链 13.7× 是并行效率倒数；Cheng 链那条是相模型下界），**不得相除**。
   - 未搬运 dry-compile 的 `compile_parallel_theory_*`（precheck 口径，且 `real_over_theory_x` 在 `effectiveJobs=1` 时是恒等式，文档 §3.7/§⑦-15）。本块不含该口径的任何字段。
4. **`hw_logical_cpu` 来源差异**：Cheng 侧取 `thread.Parallelism()`（`BackendDriverDispatchMinHardwareJobs`，与 dry-compile 的 `hardware_logical_cpus` 同源），C 链侧取 `sysctl hw.logicalcpu`。本机实测两者同为 **14**（`artifacts/bootstrap/compiler_main.direct.dry-smoke.report.txt:1688` vs `.rebuild/run_m73x/kernel_driver.bake.report.txt:81`），但**来源不同**，跨机若不等，块里的 `theory_emit_hw_logical_cpu` 与报告里 C 链那一行会分叉——按来源各表，不做等价断言。
5. **闭包口径**：块里的 `theory_emit_theory_source_closure_files/lines/bytes` 来自**本轮真实 plan 的 `systemLinkPlan.sourceClosurePaths`**，即真实编译用的那份闭包；不是 dry-compile 的扫描闭包。两者相等与否由这两个字段直接读出（234 对 29 之类）。
6. **`real_rss_peak` 口径**：`os.ProcessRssBytes()` = 本进程 `ru_maxrss` 峰值，**不含子进程**；与"进程树 resident/phys footprint"（守卫口径）不同源，块内用 `theory_emit_rss_peak_scope` 写明。
7. **报告文本的消费方审计（"不改产物字节"的读码依据）**：
   - 产物 receipt：`SystemLinkExecRuntimeFinalizeCompileReceiptInto`（`system_link_exec_runtime.cheng:4124`）在 `planReport` 装配（`:4141`）之前完成，报告文本不入 receipt。
   - provider 缓存：`BackendDriverDispatchMinProviderCachePublish`（本文件）把**子进程写完的** provider report 连同对象一起入库，并在 binding 里记 `provider_cache_report_sha256`；命中校验比的是"缓存 report vs binding 里记的 sha"，两侧同源 ⇒ 追加块不会造成"报告与自身不一致"。
   - provider stage manifest：`provider_stage_compiler_sha256` 是 manifest 的必需期望字段（`BackendDriverDispatchMinValidateProviderStageManifest`），**任何驱动重编译都会让旧 manifest 失效**，与报告内容无关 ⇒ 本改动不新增失效面（且该路径失配是硬报错，不静默降级）。
   - held-object 路径（`--report-fd`：报告本身要过 `HeldOutputFdPublishBytes` 哈希）由守卫 `!work.heldObjectMode` 排除，块不进入该路径。

### 判收敛（一句话）
`theory_emit_converged_wall_within_budget_upper=1` 即"本轮墙钟 ≤ 模型预算上界"，判据式 `wall_ns ≤ lower_bound_ns×3 + 20 ms` 取**源码既有取值**（`backend_driver_main.cheng:4450-4451`，孪生本文件 HEAD `:2691-2692`），K=3 不是本文自定；松界另可沿用仓库既有 `compile_real_over_theory_x < 30`（`tools/ci_gate.sh:269 MAX_RATIO=30`，C 链口径），两者不可互相替代。

---

## ⑥ 待槽位验证清单

> 槽位纪律：他线活跃（本报告写作期间 `COMPILE_SLOT.lock` owner 存活、`kd_fix`/`kernel_driver` 在跑）。
> 抢锁前置三条件（锁缺失或 owner 已死 **且** 无 `cheng_cold*`/`system-link-exec`/`rebake*`/`kd_*` **且** 连续 ≥3 次静默采样，间隔 ≥15 s）已写成脚本。
> 撞 `os atomic tree: parent lease unavailable` ⇒ 该轮作废重跑（本会话已实际撞到一次，见 §⑦）。

执行件：`.rebuild/theory_emit/verify_theory_emit.sh`（抢锁等待窗口 `WAIT_MAX_SECONDS`，默认 1800 s；`RUN234=1` 追加第 5 步；234 源单独件 `.rebuild/theory_emit/run234_selfbake.sh`）。
本轮已把第 1-4 步挂成后台排队件（PID 11107）按三条件等待约 20 min；owner pid 在 2121 → 15990 → 17709 → 19989 之间反复更替、`kd_fix`/`kd_pristine`/`kd_probe10`/`kernel_driver` 一直在跑 ⇒ **未取得槽位**，排队件已撤下。⇒ 第 1（parse 路线阻塞）、2-7 项**本轮未做**；第 0 项（形状静态验证）已完成且为有效轮。

| # | 项 | 判据（分母=本轮新生成产物 + 生成侧 rc 前置门） | 状态 |
|---|---|---|---|
| 0 | **改动形状静态验证**（可做且已做，不产物、不抢锁） | 镜像 patch 全部形状的独立小程序（`.rebuild/theory_emit/borrow_repro.cheng`）用**当前代 C 前端** `cheng_cold_v3` 编译 rc=0 且 lease_hits=0，产物可运行 | **已做（有效轮）**：`rc=0`、`parent lease unavailable`=0、产物 `borrow_repro_cold.exe`（7,070,928 B）、运行输出 `repro_wall_ns=1000 files=2 lines=14 lower=42 ratio=1000/42`。反向对照：去掉 callee 的 `@borrows` 后同一程序被拒（`borrowed actual cannot bind non-var non-@borrows formal caller=ReproLineInt64 callee=ReproLineValue`）⇒ 检查有区分度；本 patch 的两个投影实参 callee（`CloneStrSeq`/`DryCompileFormatFloorBytes`/`ProfileLineValue`）经 grep 确认都带 `@borrows` |
| 1 | 语法/前端（`parse-receipt` 路线） | `parse-receipt` rc=0 | **阻塞且非本 patch 原因**：Sep-10 的 `kd` 与本会话的 `kd_fix` 都在**HEAD 原有行**上挂（`Value(emitRes)`，HEAD `:7264` / 本 patch 后 `:7585`，在 `RunHeldObjectFromCmdline` 内）报 `dedicated call fact unavailable callee=Value`。工作树 `src/core/lang/parser.cheng` 有 192 行未提交 WIP（他线），两个二进制都早于该 WIP ⇒ 现成二进制都不含 `Value` 支持。同一份 HEAD 内容用 C 前端（`cheng_cold_v3`）编译是 rc=0（他线 02:46 的 194 s bake），故该路线对本 patch 不构成证据，改用第 2 项 |
| 2 | 编译通过 | patched 源 bake rc=0（`cheng_cold_v3`，参照他线同型 bake ≈194 s） | **未做**（槽位忙） |
| 3 | **产物字节不变** | 同一 fixture 由 pristine 轮内驱动与本轮 patched 驱动各编一次，`cmp` exe 与 `.primary.o` 逐字节相同；两侧 rc=0 | **未做** |
| 4 | **真实路径发射** | patched 驱动真实 `system-link-exec` 的 stdout 出现 `theory_emit_status=ok` 且 `^theory_emit_` ≥ 30 行；pristine 驱动同轮同 fixture 为 0 行 | **未做** |
| 5 | **234 源发射（头号目标）** | patched 驱动跑 `--in:…/backend_driver_dispatch_min.cheng` 收尾后，`theory_emit_theory_source_closure_files=234` 且 `theory_emit_wall_ms`/`cpu_tree_ms`/`hw_logical_cpu`/`effective_parallelism_cpu_over_wall_x`/`real_wall_over_theory_x` 全部有值 | **未做**（分钟级，需抬门 `CHENG_PARENT_RSS_GUARD=1 CHENG_PROCESS_MAX_RSS_BYTES=4294967296`；参照 run_b5 B 轮 1271 s 未收尾，可能需更长窗口） |
| 6 | 234 源产物字节不变 | 同 5 的产物 sha256 与 pristine 驱动同轮同参数产物逐字节相同 | **未做**（依赖 5；两侧各一次分钟级跑） |
| 7 | 嵌套编译行为 | provider 嵌套编译（`SystemLinkExecRuntimeResolveProviderCompiler` 兜底到当前可执行体，`system_link_exec_runtime.cheng:643-645`）也会各自发射一块；确认不污染产物、`--report-out` 里块数 = 1 + provider 编译数 | **未做** |
| 8 | 门禁回归 | `grep` 型门禁（`tools/user_path_gate.sh:612` 只过滤 `compile_theory/compile_real/compile_input` 前缀 + 只作用于 stderr 判词）不受新前缀影响；本块只写 stdout + report | **读码结论**（非实测） |

**不在本次改动范围（明确不做的）**
- `backend_driver_main.cheng`（`compiler_main` 那份孪生）**未改**。`kd` 的 234 源自烤只走 `dispatch_min.cheng`；动第二份共享热文件没有本轮需求支撑。若 `compiler_main` 也要发同款块，是另一次接线（同一函数体可直接搬）。
- 未搬运 dry-compile 的 `compile_parallel_theory_*`、未改 `sourceClosureNs` 传递、未加任何 env 开关或 fallback。

---

## ⑦ 纪律回执

1. **共享热文件**：`src/core/tooling/backend_driver_dispatch_min.cheng` 改动前 `git diff --numstat` = 空；改后仅 `323/2` 自己的 delta。全程未 `cp` 整文件、未 `git checkout --`/`restore`/`stash`；patch 走 `git diff` → `git apply --check --cached` → 落两份。未 commit / 未 push / 未建分支 / 未建 worktree。
2. **槽位**：写作期间**未抢锁**（owner pid 持续存活并反复更替：2121 → 15990 → 17709 → 19989，`kd_fix`/`kd_pristine`/`kd_probe10`/`kernel_driver` 一直在跑）。后台排队件（三条件 + 连续 ≥3 次静默采样）等待约 20 min 未得窗口，已撤下。除排队件外只跑**不产物的静态自检**：`parse-receipt`（只写自己的 `--out`，不进产物、不抢锁）与 3 次秒级 fixture 探针；其中 sanity 探针**实际撞到 `os atomic tree: parent lease unavailable`**，按纪律整轮作废。全部探针 stderr 留在 `.rebuild/theory_emit/*.stderr`，作废轮标 VOID，不作为任何结论依据。另有一轮**有效**的改形静态验证（镜像 patch 形状的独立小程序经 `cheng_cold_v3` 编译，`rc=0`、lease_hits=0、产物可运行，原始件 `.rebuild/theory_emit/borrow_repro*` 与 `borrow_repro_cold.*`）。分钟级 bake 一律留给 §⑥ 的持锁轮。
3. **假绿**：本报告不含任何"通过/相等"判词；§⑥ 全部标"未做"，每条判据都写成"本轮新生成产物 + rc 前置门"。未把 dry-compile 字段抄进真实路径，未为比值好看改口径，未加 fallback（失败写 `theory_emit_status=error reason=…`，不写替代数字）。
4. **行号锚点**：本文所有 `文件:行` 都是在当前 HEAD 上重新 `grep` 点名符号确认的（`dispatch_min.cheng` HEAD `:2477/:2857/:3021/:3371/:6158/:6866/:7002/:7409`；`cheng_cold.c:75861-75872/:75968-75970/:76016/:76045-76064`）。改动后工作树内行号整体后移（新函数 `:2814-:3096`，worker 钩子 `:7298-:7325`，墙钟起点 `:7165`）。

---

## 附：原始件

| 路径 | 内容 |
|---|---|
| `.rebuild/theory_emit/selfbake_theory_emit.patch` | 本次改动 patch（原始件） |
| `docs/campaigns/2026-08-31-kernel-userpath/patches/selfbake_theory_emit.patch` | 同上（防丢副本） |
| `.rebuild/theory_emit/dispatch_min.head.cheng` | HEAD 原文快照（sha256 `5d5538d9…`） |
| `.rebuild/theory_emit/verify_theory_emit.sh` | 槽位内验证脚本（第 1-4 步） |
| `.rebuild/theory_emit/run234_selfbake.sh` | 234 源真自烤发射检查（第 5 步，抬门） |
| `.rebuild/theory_emit/borrow_repro.cheng` + `borrow_repro_cold.{exe,report.txt,stderr}` | 改动形状静态验证（有效轮）原始件 |
| `.rebuild/theory_emit/{parse_receipt,borrow_repro,line_int_repro,sanity}.stderr` | 探针原始 stderr（作废轮标 VOID） |
| `.rebuild/theory_emit/verify_theory_emit.sh` / `run234_selfbake.sh` | 槽位内验证脚本（第 1-4 步 / 第 5 步） |
| `.rebuild/theory_emit/MANIFEST.sha256` | 全部原始件哈希 |
