# 编译器域 C1/C2 测量合同（v1.2，2026-09-13 口径对齐 + 同日 T2 档 1 开放与首轮测量；在 v1.1 冻结面上修订）

> **本版修订依据**：2026-09-11 用户裁定（768MiB 升格为硬门）+ `docs/cheng-rsi-fusion-plan.md` §二/§四/§七 + `openspec/proposals/pure-cheng-rsi.md` §2.1（2026-09-13 融合口径条，车道 L5）。
> **A5 交付状态（首行如实）**：**未编译、未运行，任何通过判词均未取得**——本轮只落 patch 与合同口径同步，判据实测待编译槽位静窗（见文末「待槽位验证清单」）。
> 实现锚：`src/rsi/compiler_domain.cheng`（判词单点/烘焙拒收/基线拒写/门值派生）、`src/tools/rsi_gate.cheng`（门禁落点/抬门隔离/基线 caliber）。

## 变更空间
- 三元 (compilerDomain=2, jobs 档 0..2 → BACKEND_JOBS 1/2/4, 语料档索引 0..2；索引空间三档，开放门仅档 0)
- 白名单：types.RsiCompilerJobsOf/RsiCompilerCorpusRel/RsiCompilerCorpusOpen + proposal.RsiProposalCellValid
- 语料档开放门（2026-09-13 T2 后现势，以 types.RsiCompilerCorpusRel/RsiCompilerCorpusOpen 注释为准）：档 0 = src/tests/rsi_minimal_smoke.cheng（开放；注释 CID ef548daa… 为未钉历史记录，运行期不校验，见文末 T2 注）；档 1 = src/tests/physics2d_determinism_smoke.cheng（**开放**，2026-09-13 T1 根修解锁，commit 601c79e70）；档 2 = src/core/tooling/backend_driver_dispatch_min.cheng（BLOCKED：GEN2 覆盖墙 identity.cheng parser=7）——待 kernel 战役清墙重新冻结。实现锚：types.RsiCompilerCorpusRel / RsiCompilerCorpusOpen（档 0/1 为 true）。**档 3 = 234 源全量自烤属 L5 的独立后续任务（types 档 3 常量已由 tier3 车道在树，开放门仍 false）。**

## 正确性锚（语义级）
- 指纹 = 产物真实运行的 (rc, stdout sha256)
- 依据（实测否定链）：Mach-O 产物含每进程随机 uuid 字段（跨进程字节漂移）→ 产物 sha 不可用；链接 map 受 jobs 布局影响（合法变化）→ map sha 仅记账不作锚；**语义输出变 = miscompile**。
- 实证：BACKEND_JOBS=2 在 C 冷链载具上产出不可运行产物（无输出 rc=1），语义锚正确拒收（events: cdomain_rejected reason=sha_mismatch）。

## C1 计分与配对口径（实测演化定稿）
- 计分 = 编译器自报 exec_phase_total_us
- 实测 total_us 为双峰分布（慢路径 parse 实跑 ~4.2M vs 快路径 parse=0 ~1.6M，与 jobs 无关）+ 偶发整烤缺失 → **配对口径（实现现势，2026-09-09 引入）：尝试上限 12 / 成功下限 3 / 失败上限 9**；min 只在成功轮取（= 真实可达性能下界）；成功轮语义指纹必须全等，指纹不一致立即整体拒收（非瞬态）。引入原因：kernel 会话重载下 guard/编译偶发瞬态失败（实测 2/5 败致配对假失败），12 次尝试内集满 3 次成功即回执，消除负载导致的红绿交替。**旧文案「best-of-5 容 1 败、失败上限=1」与实现背离，已按实现改写（行为不变）。**
- **已裁定保留（2026-09-13，可被用户覆盖）**：配对口径维持 12/3/9，**不回到 best-of-5**。理由：① C1 在成功轮取 **min**，增加尝试次数**不会**把 min 拉低（min 只会因找到更干净窗口而下移，不因多试失真），只提高"取到未受载下界"的概率，方向正确；② 配对未被破坏——两臂在**同一次尝试内**成对跑，成功/失败以对为单位判定；③ 观测到的问题是"负载下红绿交替"，一个随机器负载翻转的判据不是判据，12/3/9 正是为消除它而引入（2026-09-09 实测 2/5 败致配对假失败）；④ 代价有界（≤12 次编译），回执已带 `successes=` 与 `min_us=`，数据强度可审。用户日后若要求回到 best-of-5 属目标层裁定，届时再改。
- 禁 wall-clock 单次计时作改进证据。

## C2 判定（v1.2：三合一 + 逐相在位；旧「理论极限帽 × 3/2」口径作废）
- **PASS 三条同时成立**：
  1. `process_tree_enforced_peak_bytes` ≤ **硬门** = `CHENG_MEMORY_MODEL_LIMIT_BYTES`（= 805,306,368 B，单点派生自 `tools/memory_model_limits.sh`，见下节）——**判据口径 = guard 真正执行（杀进程）的那个数**：`enforced = max(resident_total, footprint_total)`（`tools/beat_c_process_group_guard_runtime.py:5426`，杀进程判定 `:6232`，报告三字段 `:6978-6981`）；`resident`/`footprint` 仅作归因，不得混用；
  2. ≤ **回归帽** = 冻结基线 × 3/2 —— **工作集回归检测，不是理论边界**；文案一律写「回归帽 / regression_cap」，旧称「理论极限帽 / theory_cap」作废；
  3. `rc=0`。
- **峰值取值口径（2026-09-13 A5b + A5d 补丁，fail-closed）**：判据与基线用的峰值 = **成功轮 `process_tree_enforced_peak_bytes` 的 max**（`RsiCdBakePairedInto` 的 `maxPk`），**不跟 C1 最优轮（min total_us）走**——把"最快那一轮"的峰值当本配置峰值是拿另一个目标的自变量抽内存样本，方向上是**低报**风险。回执**同时**留两个值供归因：`echo cd_peak_receipt ok=1 jobs_tier=… corpus=… peak_of_min_us_round=… peak_max_over_successes=… peak_resident=… peak_footprint=… min_us=… successes=…`；判词只比 `peak_max_over_successes`（enforced 口径）；`peak_resident`/`peak_footprint`（峰值轮同轮值）**只记账、不参与判定**。**不设 fallback**：`enforced` 键缺失 ⇒ `missing_peak_reading`（不得回退去读 resident）。基线标定（`budgets.tsv` 写入值 = 向 `RsiCdBudgetStore` 传的 peak）用同一 max 口径，否则回归帽的相对语义会漂。`RsiCdC2Verdict` 签名与判词优先级不变。
- **口径核验（2026-09-13 A5d，四份真实 guard 回执同轮三值）**：判据取 `enforced` 的依据 = guard 执行口径 `max(resident_total, footprint_total)`（`tools/beat_c_process_group_guard_runtime.py:5426`；杀进程判定 `:6232`；报告字段 `:6978-6981`）。实测（本席逐文件读取）：`artifacts/rsi_gate/guard_a.report.txt` resident 192,856,064 / footprint 101,811,352 / **enforced 192,856,064**；`artifacts/rsi_gate/guard_meta.report.txt` 206,241,792 / 115,918,000 / **206,241,792**；`src/rsi_work/cd_g00.greport.txt` 176,963,584 / 86,688,560 / **176,963,584**；`src/rsi_work/cd_cand0.greport.txt` 171,343,872 / 13,287,784 / **171,343,872**（四者 `memory_limit_bytes=805306368`）。⇒ resident/footprint 比 **1.89× / 1.78× / 2.04× / 12.89×**；样本内 4/4 `enforced == resident` 是巧合、**不是恒等式**（故 A5d 显式取 `enforced` 而非 resident）。翻转方向（footprint > resident）样本内未出现 ⇒ 由 V11 fixture 覆盖。
- **序统计量 caveat（只记不改，2026-09-13 父席裁定附注）**：`maxPk` 是**序统计量**，成功轮越多 max 单调不降 ⇒ 跨轮比较时"轮次多"本身会把峰值抬高一点。当前 ×1.5 回归帽余量远大于实测波动（同载具历史 `peak_a=193626112 / peak_m=195837952`，≈1%；来源 `openspec/proposals/pure-cheng-rsi.md:163` 与 `docs/campaigns/2026-09-07-pure-cheng-rsi/progress.md:68`），故不构成假绿；**若日后出现帽压力，先用回执里的 `peak_of_min_us_round` 区分"真实增长"与"样本数漂移"，不得直接判回归**。
- **逐相读数在位是 PASS 的必要条件**（2026-09-13 裁定 ②）：C2 必须报逐相。仪器 = guard `--phase-trace:PATH` + 目标 env `CHENG_PROGRESS=1`（子进程 stderr 的 `phase=` 行按当时进程树 RSS 落 `<epoch秒> TAB <KiB> TAB <stderr行>`）。**逐相行 0 行 ⇒ 判 `missing_phase_readings` FAIL，不得折算为通过**；未钉模型项（待钉区①–⑤）显式标注「未钉」，不得当 0 或用估计值充数（约束卡 `design/memory_model_constraints.md`）。
- **判词单点** = `src/rsi/compiler_domain.cheng` 的 `RsiCdC2Verdict`（= `RsiCdMeasurementVerdict` + 基线/回归帽/rc 三段）。门禁（`rsi_gate`）与烘焙（`RsiCdBakeOnceInto`）共用，**调用方不得改写、不得另立常数**。判词优先级固定：

| reason | 含义 | 判词 |
|---|---|---|
| `pass` | 三合一 ∧ 逐相在位 ∧ 基线非病态 | PASS |
| `missing_limit_reading` | guard report 无实测内存限 | FAIL（判据缺失） |
| `diagnostic_cap_override` | 守卫实测内存限 ≠ 权威门（抬门或更紧） | **DIAGNOSTIC**（见抬门节） |
| `missing_peak_reading` | 无 `enforced` 读数（**不得回退 resident**）、**或读数 ≤ 0**（`peakOk=1` 只证键存在不证值可信；2026-09-13 裁定② + A5d 收口） | FAIL（判据缺失） |
| `missing_phase_readings` | 逐相行 0 行 | FAIL（不得折算） |
| `missing_baseline` | 冻结基线未标/caliber 不符 | FAIL（判据缺失） |
| `pathological_baseline` | 冻结基线（或待冻结基线本身）> 硬门 | FAIL（病态基线：拒收并先消解，**不得就地重标**） |
| `over_hard_gate` | 本轮 peak > 硬门 | FAIL（越门候选必拒） |
| `over_regression_cap` | peak > 基线 × 3/2 | FAIL |
| `bad_rc` | rc ≠ 0 | FAIL |

- **基线记法（门禁侧）**：`<storeDir>/rss_baseline.txt` = `caliber enforced_peak_bytes_v1` / `carrier <64hex>` / `peak_a <int>` / `peak_m <int>`（A5d 换 caliber：旧 `resident_peak_bytes_v1` 基线一律不复用、走重标且越门即拒）。caliber 不符或缺 `peak_m` 的旧基线**不得按本 metric 复用**（走重标路径，且既有值越门即拒）。编译域预算表 `budgets.tsv` 行式 `corpus N peak <bytes>` 格式不变，但写入值口径 = 成功轮 enforced peak 的 max（与判据同口径，见上「峰值取值口径」条）。
- **三道拒收（全部硬失败，禁止把越界状态合法化）**：
  1. 烘焙 `RsiCdBakeOnceInto`：非 pass **不出回执**（`echo cd_c2_reject reason=… tag=… peak=… limit=… gate=… phase_rows=… rc=…` 入 stdout 取证）；越门候选、抬门轮、缺逐相皆不可入账；结构性 C2 拒收（`outC2Reject=1`）**不重试**（`RsiCdBakePairedInto` 立即返回，不空耗编译槽位），只有瞬态 guard/编译失败计入失败上限（12 尝试集满 3 成）；
  2. 账本基线写口 `RsiCdBudgetStore`：新基线越门 ⇒ `cd_baseline_reject reason=over_hard_gate`；既有基线自身越门 ⇒ `reason=pathological_baseline`（**拒绝就地重标**）；权威件定位失败 ⇒ `reason=authority_unresolved`；三者均返回 false（CLI 侧 rc=3）；
  3. 门禁 `rsi_gate`：越门/缺读数/病态基线 FAIL 且不写基线；标定轮（carrier 变化或 caliber 未标）以「本轮实测 = 待冻结基线自身」判病态。

## 抬门轮隔离（diagnostic；2026-09-11 红线 + 融合计划 §七-1）
- **抬门信号**（两条独立取证）：① env 覆写 —— `CHENG_PARENT_RSS_GUARD` 非空非 0，或 `BEAT_C_GUARD_RSS_LIMIT_BYTES` ≠ 权威门；② 守卫实测内存限 ≠ 权威门 —— 取 guard report 的 `memory_limit_bytes`（**不看 argv 自报**，故 env/flag/launcher 任一抬门路径都会被实测值抓到）。
- **处置**：该轮 C2 check 判 `DIAGNOSTIC`（detail 带 `raised_cap state=pathological_evidence`），整轮 `rsi_gate: DIAGNOSTIC` ⇒ **rc=3**，**不写基线**，不得进入任何「通过/更优」判词；其运行状态本身即病态证据。
- **`--quick` 轮**缺 meta 腿读数 ⇒ 同判 DIAGNOSTIC（rc=3），不再给「免检点」（旧实现 quick 轮白送一分属折算，已删）。
- 门禁退出码：0 = PASS（全判据在位）；1 = FAIL；2 = 用法错；3 = DIAGNOSTIC 轮（非验收结论）。

## 常量单点派生（2026-09-11 裁定 ③）
- 唯一权威：`tools/memory_model_limits.sh` 的 `CHENG_MEMORY_MODEL_LIMIT_BYTES=805306368`（该文件第 20 行；本文件只读、未改）。
- 实现：`RsiCdAuthorityLimitInto(root, …)` 运行时读权威件严格解析（唯一赋值行 + 纯数字 + > 0）；**Cheng 侧两文件已无门值字面量**（原 `compiler_domain.cheng:123`、`rsi_gate.cheng:272/315` 的 `805306368` 与 :471 的 `1GiB` 注释均删）。读不到/不唯一/非数字 ⇒ 硬失败（烘焙 `reason=authority_unreadable`；门禁 `rsi_c2_authority FAIL` + rc=1），不回落默认值。
- ledger 侧（`RsiCdBudgetStore`，其签名被 `src/apps/rsi/main.cheng` 冻结、本轮不得改）用 `RsiCdAuthorityLimitFromLedgerInto`：从 storeDir 上溯 ≤6 级找首个含 `tools/memory_model_limits.sh` 的宿主根，命中即严格解析；**找不到 ⇒ 拒写**。⇒ 推论：**编译域 ledger 必须落在宿主根内**（默认 `artifacts/rsi_compiler`、门禁 `artifacts/rsi_gate_store_compiler` 均满足）。
- 未接线（不在本车道文件面）：`tools/beat_c_process_group_guard.sh:4` 的默认值仍是字面量；门禁/烘焙总是显式传 `--rss-limit:<派生值>`，该默认不参与判定。

## 账本
- 独立 store artifacts/rsi_compiler：events 哈希链（digest 滚动）+ facts 图（csg.rsi.candidate/trial/cversion）+ budgets.tsv（per-corpus peak 基线）+ current.txt（best_us / product_sha=语义指纹 rc:stdout-sha / facts_root 持久，基线不重烤）
- CLI：rsi cdomain（run；--corpus 档，档 0/1 开放（2026-09-13 起，档 1 见文末 T2 注），其余入口即拒）；**C2 不完整轮不再能产出回执**（烘焙拒收），故 cdomain 的 accept 路径实际上只在 C2 三合一 + 逐相在位时可达。store = 单语料谱系（current.txt 单 corpus 字段；新语料档创世 = 新 store，账本互不覆盖）。

## 待槽位验证清单（A5；本轮未编译、未运行）
> **首行：未编译、未运行，任何通过判词均未取得。** 以下每条给「命令 / 期望判词 / 未做原因」。前置：编译槽位静窗（`.rebuild/COMPILE_SLOT.lock` 空闲 + 内核 B 线 driver 退场）；裸 /tmp 一律先 `tools/cheng_scratch_scope.sh` 建任务级目录。

| # | 项 | 命令（要点） | 期望判词 | 未做原因 |
|---|---|---|---|---|
| V0 | 正例：工具链编译 | `<candidate-compiler> system-link-exec --root:<root> --in:src/tools/rsi_gate.cheng --emit:exe --out:<scratch>/rsi_gate.bin`（同法编 `src/apps/rsi/main.cheng`、`src/tests/rsi_contract.cheng`） | 三者 rc=0（编译期即抓语法/签名错；main.cheng 编译同时证明 `compiler_domain` 导出签名未破） | 槽位被内核 B 线 kd_b404 占用；本轮禁编 |
| V1 | 正例：门值单点派生 | `grep -n 805306368 src/rsi/compiler_domain.cheng src/tools/rsi_gate.cheng`；再跑 `rsi_gate --quick` 首段 | grep **0 命中**；`check=rsi_c2_authority status=PASS detail=hard_gate_bytes=805306368 source=tools/memory_model_limits.sh` | 同上（grep 属静态，可随时跑；运行时 check 需编译） |
| V2 | **负例①：越门候选必拒** | 在 scratch 树副本里把 `tools/memory_model_limits.sh` 的 `CHENG_MEMORY_MODEL_LIMIT_BYTES` 改成极小值（如 1048576，**仅副本；权威件不动**），跑 `rsi cdomain` 与 `rsi_gate` | `cd_c2_reject reason=over_hard_gate …`（烘焙无回执）；门禁 `rsi_rss_guard status=FAIL detail=… reason=over_hard_gate`；`cd_baseline_reject reason=over_hard_gate`；**不得出现任何 PASS/更优** | 需编译 + 真实烤制 |
| V3 | **负例②：病态基线必拒** | 在 scratch 副本的 `<store>/rss_baseline.txt` 写入 `caliber enforced_peak_bytes_v1` + 当前 carrier sha + `peak_a 900000000` + `peak_m 900000000`（> 硬门），跑 `rsi_gate` | `rsi_rss_guard status=FAIL detail=leg=a … reason=pathological_baseline`（或标定分支 `rsi_rss_baseline FAIL pathological_baseline prior_over_gate … state=not_rewritten`）；跑后 **基线文件 sha 不变**（拒绝就地重标） | 需编译 + 真实烤制 + carrier sha |
| V4 | **负例③：抬门轮不入判词** | `CHENG_PARENT_RSS_GUARD=1 rsi_gate <root> <compiler>`（或 `BEAT_C_GUARD_RSS_LIMIT_BYTES=4294967296`），以及在 scratch 副本里覆写 guard 的 `--rss-limit:` 使 report `memory_limit_bytes` ≠ 权威门 | `check=rsi_c2_diagnostic status=DIAGNOSTIC detail=raised_cap…state=pathological_evidence` 且 `rsi_gate: DIAGNOSTIC` + **rc=3**；**无 `rsi_rss_guard status=PASS` 行**、无基线写入 | 需编译 + 真实烤制 |
| V5 | **负例④：逐相读数缺失不得折算** | 用不打印 `compile_progress phase=` 的载具（现役 C 冷链 stage3 即属此列）跑 `rsi_gate`；并对照纯载具（`--target-env:CHENG_PROGRESS=1` 生效时应有 phase 行） | 前者 `reason=missing_phase_readings` FAIL（**绝不 PASS**）；后者 phase 行 > 0 才继续判三合一；两腿 detail 均带 `phase_rows=` 实测数 | **前半腿已实测（2026-09-13，cdomain 主路径自然兑现、非专跑）**：`rsi cdomain --corpus:0/1 --compiler:stage3` ⇒ `cd_c2_reject reason=missing_phase_readings tag=g00 peak=180076544 peak_ok=1 peak_resident=180076544 peak_footprint=90260272 limit=805306368 limit_ok=1 gate=805306368 phase_rows=0 rc=0`（档 1 同族 `peak=179896320`）⇒ **缺失即 FAIL、未折算**，判据成立。后半腿（Cheng 链 phase 行 > 0）已单独证过（`kd_b701` 编裸夹具发 18 行，`.rebuild/a9b/bisect2/c2_echo/`），但它**编不动语料**（三道内核墙，见 `receipts/a9_cheng_chain_wall_repros.md`）⇒ 两半无法在同一主路径腿内同时成立，已记为**单一缺口**（账本 §6.1i）。 |
| V6 | 正例：三合一全成立 | 纯载具 + 权威门 + 门内 peak + 语义指纹一致 + phase 行 > 0 | `rsi_rss_guard status=PASS detail=leg=a reason=pass peak=… gate=805306368 base=… regression_cap=x1.5 rc=0 phase_rows=N effective_limit=805306368` | 依赖 V5 的 phase 行可得性（当前**未钉**） |
| V7 | 金丝雀（AGENTS 规范 10-②） | 新驱动烤完立刻跑 `src/tests/` 两行源 + `ordinary_zero_exit_fixture` | 两个 `run_rc=0` | 需新驱动 |
| V8 | 正例：C2 峰值双口径回执（A5b） | 跑 `rsi cdomain`（或 `rsi_gate`）后 grep stdout 的 `cd_peak_receipt`，并与 `events.log` 的 `peak_bytes=` 对拍 | 回执同时含 `peak_of_min_us_round=` 与 `peak_max_over_successes=`，且 `peak_max_over_successes >= peak_of_min_us_round`；`events`/`budgets.tsv` 落账值 == `peak_max_over_successes`（判据/基线同口径）；两值不等时判据必须用 max | 需编译 + 真实烤制 |
| V10 | **负例⑥：enforced 键缺失不得回落**（A5d） | 在 scratch 副本里删掉某腿 guard 报告的 `process_tree_enforced_peak_bytes=` 行（保留 resident/footprint），跑 `rsi_gate` / `rsi cdomain` | `reason=missing_peak_reading` FAIL（**绝不 PASS、绝不回落 resident**）；回执/判词行仍如实打印 `peak_resident=`/`peak_footprint=` 归因值 | 需编译 + 真实烤制 |
| V11 | **负例⑦：关系翻转取 max**（A5d） | 造 `footprint > resident` 的 fixture（如共享库/大字面量载具），跑 `rsi_gate` | 判据峰值 == `max(resident, footprint) == footprint`（不是 resident）；同轮回执 `peak_resident < peak_footprint == peak_max_over_successes` | 需编译 + 真实烤制 + 能造翻转负载 |
| V9 | **负例⑤：0 值峰值不得折算**（A5c） | 在 scratch 副本里把某腿 guard 报告的 `process_tree_enforced_peak_bytes` 置 0（或注入 0 值报告），跑 `rsi_gate` / `rsi cdomain` | `reason=missing_peak_reading` FAIL（**绝不 PASS**）；不得出现任何 PASS/更优判词 | 需编译 + 真实烤制 |

## BLOCKED 判词（移交 kernel 战役，2026-09-08；二修追加）
- **ld 准入回退串失同步（已修）**：COLD_DARWIN_DIRECT_FRAMEWORK_FLAGS 宏含 AudioToolbox 而
  cold_darwin_framework_flags 回退串不含 → strcmp 恒不等 → 烤机链接准入恒拒。
  修 = 回退串补 AudioToolbox（bootstrap/cheng_cold.c，本席修复）。
- **csg build 空判词（新，未修）**：修复后 pure_driver 烤成（seed_rc=0），但编
  rsi_minimal_smoke（纯 std 闭包）在 compiler csg build 相位以空 compilerCsgErr 失败
  （system_link_exec.cheng:5670 回退判词路径）；CHENG_SYSTEM_LINK_PROGRESS 无相位行。
  属 kernel csg build 内部静默 false，需 kernel 战役插桩定位。
1. pure_driver（C 冷链 GEN1 烤出的 kernel 驱动）自烤 dispatch_min：`compiler csg: parser-owned global coverage mismatch source=src/core/csg_core/identity.cheng parser=7 metadata=0`
2. pure_driver 编 physics2d 闭包：同族 `source=src/game/ecs.cheng parser=5 metadata=0`
- 定谳（判词针对禁 C 链载具与上述候选语料）：该载具可编语料=空集（kernel 自烤墙 + 非 kernel 闭包覆盖墙），纯 Cheng 完整驱动无存货（artifacts/backend_driver/cheng 已清）。
- 语料门与载具门分离：档 0 已按 types.RsiCompilerCorpusRel/Open 重定义为 physics2d_determinism_smoke（唯一开放档），档 1/2 保持 BLOCKED；开放档不等于试验线解锁——C1 试验线 A/B 仍 BLOCKED@kernel 载具覆盖墙，待 kernel 战役清墙后重冻结档 1/2 并解锁 A/B。
- 工具壳（gate/CLI/contract 二进制）构建在载具死锁解除前暂用 C 链 stage3，作为阻塞项如实标注。

## 工程发现（馈 kernel 战役）
- BACKEND_JOBS>1 在 C 冷链载具上产生不可运行产物（miscompile 实证）
- entry cache 假绿：同 in/out 缓存命中 rc=0 不重写产物（已在全部编译入口禁缓存）
- 嵌套取反调用作 assert 实参：编译过但值坏（调用点形状可修：先 let 再断言；codegen 根因移交）
- cold object cache store lock 并发失败（多进程烤机需 CHENG_DISABLE_COLD_OBJECT_CACHE=1+独立 cache root）

## 同步注（2026-09-08）
- 语料档统一按「索引 0..2、仅档 0 开放」表述；实现锚=types.RsiCompilerCorpusRel / RsiCompilerCorpusOpen。
- 本次审计发现的实现侧偏差与修正（best-of-5 末检、CLI --corpus 开放门、rsi_minimal_smoke 头注释）记录见 findings.md 第 29 条。

## 同步注（2026-09-13，A5/车道 L5 口径对齐 + A5b 补丁）
- 落地五条：① C2 三合一（硬门 ∧ 回归帽 ∧ rc=0）+ 逐相必需；② 病态基线拒收/拒绝就地重标（含 store 写口）；③ 抬门轮 isolation（env/实测限 ≠ 权威门 ⇒ DIAGNOSTIC、rc=3、不写基线、不入通过判词）；④ 门值单点派生（两 src 文件 0 处门值字面量）；⑤ 修 `rsi_gate.cheng` 注释「--rss-limit:1GiB」（改写为权威派生）。
- **本轮未编译未运行**：patch 双份 = `.rebuild/rsi_c2_caliber/c2_caliber.patch`（原始件）+ `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/c2_caliber.patch`（防丢副本）；`patch_preflight` PASS、`git apply --check --cached` / `git apply --check -R` 双向通过；回执 = `.rebuild/rsi_c2_caliber/c2_caliber_checks.txt`（含 patch sha256、preflight 输出、双向 apply 退出码、门值字面量 0 命中、逐文件 numstat）。patch 内含**自指 sha** 会造成哈希自振荡，故本文只登记回执路径，sha 以回执为准。
- **A5b 补丁（同日；A6 独立复核 + 父席裁定后落）**：① **C2 峰值口径改成功轮 max（fail-closed）**——原实现把 `bestPk`（C1 最优轮 = min total_us 那一轮的峰值）当配置峰值，属用另一目标的自变量抽内存样本、方向可低报；现判据与基线同取 `maxPk`，并回执 `cd_peak_receipt … peak_of_min_us_round=… peak_max_over_successes=…` 双口径供归因；`RsiCdC2Verdict` 签名与判词优先级**未动**。② **C1 配对文案按实现同步**（尝试 12 / 成功 3 / 失败 9，2026-09-09 引入的瞬态容错），**行为未动**（A5c 已裁定保留 12/3/9，可被用户覆盖）；同类背离的 `RsiCdBakePairedInto` 头注释一并改按实现。③ 逐相仪器接线前的 fail-closed 后果（C2 不可能 PASS、连带 `rsi_compiler_ab` 腿红）已被父席接受并登记为 A8/待槽；**禁止**为让门变绿放宽「逐相行 ≥1」。④ **A5c 收口（同日父席两项裁定）**：配对口径**裁定保留 12/3/9**（不回到 best-of-5，理由见 C1 节，可被用户覆盖）；`missing_peak_reading` 分支加 `peakBytes <= 0` 收口（签名与判词优先级未动）；`maxPk` 序统计量 caveat 记入 C2 节（帽压力时先用 `peak_of_min_us_round` 分辨真实增长 vs 样本数漂移）。本 lane 至此收口，无待办。⑤ **A5d（同日父席实测裁定）**：C2 判据口径由 `resident` 改为 **`enforced`（guard 执行口径 = max(resident, footprint)）**——硬门判据、回归帽比值分子、基线标定值一条链同口径；缺 `enforced` 键 ⇒ `missing_peak_reading`（不回落 resident）；回执增记 `peak_resident=`/`peak_footprint=`（只记账）；门禁基线 caliber 换 `enforced_peak_bytes_v1`（旧 resident 基线不复用、越门即拒）；四份真实回执已核验（见 C2 节「口径核验」），新增 V10/V11。**注**: 本轮 `src/rsi/compiler_domain.cheng` 同时被档 3（tier-3）lane 编辑（其补丁 `.rebuild/rsi_tier3/tier3.patch` 从树内切出），A5d 各落点与该 lane 内容共存；本 lane 不再写该文件，A5d 另以纯 A5 系补丁交付（见回执）。
- **未接线项（如实）**：a) `src/apps/rsi/main.cheng` 的 cdomain 路径 C2 三合一**不直接调用**判词函数（该文件不属本车道文件面），其 C2 约束经三道拒收间接落地：烘焙非 pass 无回执 ⇒ 越门/抬门/缺逐相候选无法进入 accept 分支；store 拒写 ⇒ 越门/病态基线无法落账；b) 门禁两 run 腿的逐相行可得性**未钉**（依赖子进程 stderr 有无 `phase=` 行，随载具而异）；c) `tools/beat_c_process_group_guard.sh:4` 默认值字面量未收口（非本文件面）；d) 档 3（234 源）与 `src/rsi/types.cheng` 不在本 patch 面内。

## 同步注（2026-09-13，T2：档 1 开放 + 首轮测量）
- **开放记录**：档 1（`src/tests/physics2d_determinism_smoke.cheng`）由 T1 线根修解锁（commit `601c79e70`，判词原文见 `.rebuild/t1_line/REPORT.md`）：定谳 = 源侧 use-after-move（`Physics2dReceiptValid` byval 消费后再借 `cloneReceipt`），修复全源侧零编译器改动——`src/game/ecs.cheng` 14 个只读查询 + `src/game/physics2d.cheng` 5 处标 `@borrows`，preimage 5 处改 Fmt 共享（字节等价 ⇒ receiptCid 不变 ⇒ 确定性合同无损）；负控 Q2 仍拒 = 判据未放宽。types.RsiCompilerCorpusOpen 增档 1（`corpusIdx == 0 || corpusIdx == 1`），纯增量，补丁 `.rebuild/t2_line/t2_open_t1.patch`，patch_preflight PASS（ann=0 displaced=0 wedged=0）。已知化妆性遗留：`main.cheng:216` 的 BLOCKED 文案串仍写「only tier 0 open」（该文件不属本车道文件面，逻辑以 RsiCompilerCorpusOpen 为准，文案不改行为）。
- **CID 绑定口径结论（本轮 git 考古定谳）**：① 档梯的开放/封锁编码 = 代码常量（`RsiCompilerCorpusOpen` 硬编码索引判定）+ 注释记录（BLOCKED 原因与 CID 数值）；开放门运行期**不校验任何 CID**。② 档 0 注释 CID `ef548daa…` ≠ 入口文件 sha256 于任何 git 时点（记录时点 6b2abd531 = `9ca19d02…`，批次六重冻结后至今 = `50bbc9d1…`）——派生口径未钉，属 corpus_tier3_contract §10-7 已登记教训的实例；批次六「CID 重冻结」指语义锚强化（echo 计算哈希），未同步 types 注释数值。③ 运行期真实语料身份锚 = 语义指纹（产物 rc+stdout sha，配对轮内全等）；闭包级 CID 只有档 3 有（载具 `source_snapshot_root_cid`，轮内全等判据）。⇒ **结论：档 0/1 的 CID 是注释级时点快照、绑入口文件的某历史态，不随树重算、运行期不用；T1 闭包变更不需要也不触发任何 CID 重算动作。**
- **档 1 闭包变更说明**：入口文件本体 T1 未动（现 sha256 `c8455525…`，末次改动 84d5fe397，早于 T1）；闭包因 T1 根修变更（ecs `83abad38…` / physics2d `5d59a000…`）。按上条口径，入口绑定不受影响；行为等价由 T1 实测背书（receiptCid 逐字节不变 + smoke 九断言全过），测量时配对轮指纹全等门再兜一道。
- **账本（本轮）**：档 1 测量走独立新 store `artifacts/rsi_compiler_c1`——理由：store = 单语料谱系（current.txt 单 corpus 字段，cdomain 创世只在 `RsiCdLoadInto != 1` 时发生）；既有 `artifacts/rsi_gate_store_compiler` 已锁档 0 谱系且系 rsi_gate cd 腿每轮清建的 scratch（`rsi_gate.cheng:565-581` 四文件删除），不动它 = 档 0 状态零破坏。生产任务域账本 `artifacts/rsi` 全程未触。
- **首轮测量记录（2026-09-13，T2 线，实测原文见 `.rebuild/t2_line/REPORT.md`）**：
  - **合同判词（唯一权威结论）**：`rsi cdomain --corpus:1` genesis **FAIL：`rsi_cdomain: FAIL genesis paired bake failed`**（10 轮守卫全瞬态失败撞 maxFail=9；账本零写入，fail-closed 正确）。根因 = 下述 W1；即使 W1 修复仍有 W2 挡逐相判据。**档 1 尚无任何入账判词；从现工作树烤出的 CLI 在 W1 修复前烤不出任何档位的回执。**
  - **W1（本轮新发现，馈 cdomain/工具链车道，一行修复）**：A5 面在 `RsiCdBakeOnceInto` 的 guard argv 新增 `--target-env:CHENG_PROGRESS=1`（HEAD 无此 argv，属本轮编译的未提交 WIP），但未配 `--target-env-clear`；2026-09-11 冻结守卫要求 exact 模式显式声明（帮助与示例 :220 均成对），`beat_c_process_group_guard_runtime.py:5586` `scrubbed_target_env()` 对「inherit_scrubbed + 非空条目」raise EINVAL。实测复现：bake 同款 argv → `guard_error=command_identity_unavailable detail=OSError: [Errno 22] target environment mode/entries mismatch`、guard rc=3、编译器从未被拉起；补 `--target-env-clear` 后同载荷 rc=0 且 env 注入生效。**本轮是 A5 面的首次真实编译+运行（T2 载具烤 CLI），当场暴露 W1**：从现工作树烤出的任何 CLI，其 cdomain 烘焙与 gate `rsi_compiler_ab` 腿均无法出回执；今晨 05:37 corpus 0 创世成功事件出自 A5 面编译前的旧 CLI 二进制（无 --target-env、无逐相判据）。修复归属 `src/rsi/compiler_domain.cheng`（不属 T2 文件面，未代改）。
  - **W2（A8 未接线项在档 1 实证）**：现役载具无一发射逐相行——stage3 与 `cheng_cold_v3`（sha `0c765779…`）× `CHENG_PROGRESS=1` / `CHENG_SYSTEM_LINK_PROGRESS=1` 四组合实测 phase 行全 0 → 逐相判据 fail-closed FAIL 不可折算。与既有登记一致：逐相仪器待纯载具/载具侧接线。
  - **判据外参考读数（非判词、不入账；guard 包裹 + W1 修复形态 argv 手工烤，档 1 语料，n=3/格，指纹全等门按合同口径自校）**：载具 = 冻结 stage3 `05af823e…`；6/6 轮 guard_rc=0、产物 run_rc=0、语义指纹全等 `0:e3b0c442…`（jobs1 vs jobs2 对拍无误编译信号）。jobs1（BACKEND_JOBS=1）total_us = 2784924 / 1435647 / **1266901(min)**，enforced peak = 181043200 / 174784512 / 171950080；jobs2（BACKEND_JOBS=2）total_us = **1183140(min)** / 1222485 / 2897737，enforced peak = 171474944 / 171016192 / 177356800。total_us 双峰形态复现（快 ~1.2-1.4M / 慢 ~2.8-2.9M，与 jobs 无关，同 C1 节已知分布）。enforced 全 6 轮 = resident（同 A5d 样本内巧合，非恒等式）；峰全集 max = 181,043,200 B ≪ 硬门 805,306,368；与档 0 冻结基线（171,196,416）同量级（+0~6%，ecs/physics2d 闭包增量）。jobs2 min 较 jobs1 min 低 ~7% 属 n=3 参考观察，**不构成严格增益判词**（该判词只能出自修复后的 cdomain 配对流程）。
  - **账本 verify 行（如实）**：genesis 拒收后半成品 store 仅含 schema fact，`rsi verify` → `rsi_verify: FAIL csg replay rejected facts`（无 committed version，FAIL 正确）；该半成品 store 已随本轮清理删除，档 1 账本待 W1 修复后由创世重建。`artifacts/rsi_gate_store_compiler`（档 0）与生产账本 `artifacts/rsi` 全程未触。
  - 清理：src/tests 探针源 `t2_canary_two_line.cheng` 已撤；`src/rsi_work/cd_g*`（本轮拒收轮守卫残留）已清（他线 `cand_d0_g0_seed.*` 未动）；二进制已清，日志/报告/补丁/脚本存 `.rebuild/t2_line/`。
