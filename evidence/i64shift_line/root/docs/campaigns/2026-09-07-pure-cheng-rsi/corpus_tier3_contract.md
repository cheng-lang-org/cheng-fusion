# 语料档 3（234 源全量自烤）冻结测量合同 v1.0

> **定位**：本件是融合计划 §二/§四「**新增语料档 3 = 234 源全量自烤**」的唯一冻结测量合同，只回答一件事：
> 档 3 的**语料是什么（含 CID 冻结程序）/ 怎么计分（C1）/ 怎么记账（C2 总峰 + 逐相）/ 什么算准入 / 怎么落账**。
> **效力链**：判据 = `docs/cheng-plan.md` §6.2（234 源并林四判据）+ §6.2.1（逐相贴线）+ §6.3，**本件不复写、不另立**；
> 仪器 = `tools/memory_model_limits.sh`（门值与逐相锚唯一权威）+ `tools/beat_c_process_group_guard.sh`（外门唯一）；
> 账本 = `artifacts/rsi_compiler`（复用 `compiler_domain_c1c2_contract.md` 已冻结的 events/facts/budgets 三件，**不新造日志格式**）。
> **数字口径**：`[实测]` = 能指到 `文件:行` 或回执绝对路径；`[估计]` = 仅用于工时；`diagnostic` = 抬门/不正常状态轮。
> 未实测处一律写**"未钉"**，不得当 0、不得用估计值充数。
> **状态：BLOCKED（设计冻结；语料门未开）**。本轮只新建本设计件，**未改任何 `src/**`、未跑任何编译/链接/计时/内存测量**（树忙：内核 B 线在飞）。
> 冻结批次：2026-09-13（融合计划 L5 项；读取起点 `b083fc3dd`）。

---

## 0. 判词：为什么现在必须是 BLOCKED

档 3 的准入线 = 档 0/1/2 从未采用的 **kernel 验收线本体**（§6.2 四判据 + §6.2.1 逐相贴线）。四判据现势逐条不成立：

| §6.2 判据 | 要求 | 现势 `[实测]` | 原始件 |
|---|---|---|---|
| `rc=0` | 进程正常退出 | **未达**：默认门轮 rc=1；抬门轮 rc=2 | `.rebuild/s1b_step3/gate/r45_recheck.summary.txt:1`、`r52_raised.summary.txt:1` |
| `forest_parsed_lines=234` | 234 源全部解析 | 达（仅此一条） | `r45_recheck.summary.txt`（`forest_parsed_lines=234`）、`r52_raised.summary.txt` 同 |
| `forest_appended_lines=234` | 234 源全部并入林 | **未达**：1/234（默认门）、158/234（抬门） | `r45_recheck.summary.txt`、`r52_raised.summary.txt` |
| `guard_hits=0` ∧ 树峰 ≤805,306,368 B | 门内跑完 | **未达**：默认门轮树峰 776,815,744 B 但 rc≠0；抬门轮 2,622,982,568 B（= 3.26× 门，**diagnostic**） | `r45_recheck.summary.txt`（`max_rss=776815744`）、`r52_raised.summary.txt`（`max_rss=2622982568`） |
| §6.2.1 逐相贴线 | 相 4/5/6 对模型值报差值 | **不可判**：默认门轮止步在 append 相（`after_profile_lookup=` 空、`type_arena_lines=0`、`typed_ir_done_lines=0`） | `r45_recheck.summary.txt`、`r52_raised.summary.txt` |

⇒ 档 3 **未开放**；本节表格即"不得把'某轮曾经跑过 234 源'当作该档已开放"的机械依据（解析满量 ≠ 并林 ≠ 门内 rc=0）。
⇒ 抬门轮（`r50_raised`/`r51_raised`/`r52_raised`，树峰 2.4–2.6 GB）**一律 diagnostic**，不得计入任何达标结论（融合计划 §七.1）。

---

## 1. 语料定义与 CID 冻结程序

### 1.1 语料 = `dispatch_min` 的**真实 plan 闭包**（不是 dry-compile 扫描闭包）

- **入口源**：`src/core/tooling/backend_driver_dispatch_min.cheng`。
- **档 3 语料 = 该入口在真实编译（`system-link-exec`）下实际打开并解析的源文件全集**，即"真实 plan 闭包"。
- **两套闭包口径的机械区分（禁止混用）**：

| 口径 | 产生路径 | 计数发射点 | 性质（原文判词） |
|---|---|---|---|
| **dry-compile 扫描闭包**（**不得**作档 3 语料） | `BackendDriverDispatchMinDryCompileCollectSourceClosureWithStats`（`backend_driver_dispatch_min.cheng:1466`） | `dry_compile_input_source_file_count/line_count/byte_count`（`:2932-2934`） | `dry_compile_source_closure_mode=parser_dependency_bfs`（`:2928`）、`dry_compile_executes_codegen=0`（`:2927`）、`dry_compile_predicts_full_compile_rss=0`（`:3021`）、`dry_compile_decision_scope=source_closure_triage_only`（`:3022`） |
| **真实 plan 闭包**（**档 3 唯一语料**） | 载具真实编译路径：Cheng 链 `linkPlan.sourceClosurePaths` → `receipt.sourceClosureCount`（`system_link_exec.cheng:1597`）；C 链冻结源快照 `cold_source_snapshot_capture`（`bootstrap/cheng_cold.c:3040`） | C 链：`compile_input_source_file_count/line_count/byte_count`（`cheng_cold.c:76017-76021`）+ `source_snapshot_count`/`source_snapshot_root_cid`（`:82179-82185`）；Cheng 链：`source_identity_receipt_source_snapshot_count`（`system_link_exec.cheng:2101`） | 真实编译所用不可变快照；`source_snapshot_count`（`cheng_cold.c:75587`）与 `compile_input_source_file_count`（`:75590-75591`）是同一次发射的两个字段（同取 `source_snapshot->count`），行/字节由同一快照逐行求和（`:75592-75607`） |

- **判据性约束**：档 3 的任何"语料规模/语料身份"数字**只能**取自真实 plan 闭包的报告字段；dry-compile 报告的数字若被引用作旁证，必须显式标 `precheck` 且不入判据。

### 1.2 规模三元组：**234 是计数，不是内容常量**（回原始件核对）

两个同驱动（`compiler_executable_sha256=0c765779…`）实例，闭包**计数相同、内容不同**：

| 实例（回执绝对路径） | 源根 | file_count | line_count | byte_count | `source_snapshot_root_cid` |
|---|---|---|---|---|---|
| `.rebuild/s1b_step3/r9/kd_b102.report.txt`（:78 / :79 / :80；:31 / :32；:11 / :28；:95） | `.rebuild/b_line/scratch_root` | **234** | **649,715** | **30,989,631** | `54c2ca9b4c1a8e9ba9d4bb364ac127cae53e811407449b69ae7a7d236acd674e` |
| `.rebuild/s1b_step3/r9/kd_r104.report.txt`（:78 / :79 / :80；:31 / :32；:11 / :28；:95） | 仓根 `/Users/lbcheng/cheng-lang` | **234** | **650,199** | **31,015,101** | `a67be2ea76c1d82984dbecc1f33db923b03c0c38b430200bee8f32f3a4384cf2` |

历史旁证（口径不同、只作漂移证据）：`VERIFY_tamem_model_append.md:13-15` 记 m60 闭包 = 230 源 / 643,601 行 / 30,637,438 B。
⇒ **结论**：`234` 是"当前树的闭包计数"；行数/字节/根 CID 随树漂移。**任何引用 234 的记录必须同时给 root CID + source root 绝对路径**，否则不可复现。

### 1.3 CID 算法（唯一权威实现，禁第二份）

CID = 载具报告的 `source_snapshot_root_cid`（64 位小写 hex）。算法**只在 C 冷编译器一处实现**，RSI 侧与脚本侧**只读、禁复刻**：

1. **document CID**（域 `cheng.compiler.document_identity`，`bootstrap/cheng_cold.c:2881`）：
   `sha256( BE32(|D1|) ‖ D1 ‖ BE32(|pkg|) ‖ pkg ‖ BE32(|module|) ‖ module )`（`:2905-2934`）。
   `module` 拼法：`<pkg>/<去掉 .cheng 的 src 相对路径>`；`cheng` 包下 `std/` 与 `runtime/` 前缀不加包名（`:2977-3021`）。
2. **content CID** = `sha256(文件原始字节)`（`:3093-3094`）。
3. **canonical order** = 按 document CID 字节升序排序（平局用内部行号，`:3226-3238`、`:3241-3288`）。
4. **root CID**（域 `cheng.cold.source_snapshot`，`:3297`）：
   `sha256( BE32(|D2|) ‖ D2 ‖ BE32(n) ‖ Σ_row [ BE32(row) ‖ document_cid(32) ‖ BE32(byte_len) ‖ content_cid(32) ] )`（`:3308-3364`）。
5. **发射/绑定**：快照 seal 时算 (`:3402-3409`)，写 FIFO 通知行 `source_snapshot_root_cid=`（`:3440`），进 stats（`:75584-75587`），出报告 `:82183`。

**红线**：若将来需要独立复算器（Python/Cheng），必须先经用户裁定并**作废旧 CID 重标**；同语料两个 CID = 双仪器（融合计划 §四.1/§四.5 禁止）。

### 1.4 CID 冻结程序（每次 trial 可机械执行）

- **P0 静窗判据**（不是时间戳归因）：`.rebuild/COMPILE_SLOT.lock` 不存在 **∧** 无在飞 driver 进程 **∧** `git status --porcelain -- src/` 在 trial 开始与结束两次取样**内容相等**。任一不成立 ⇒ 本 trial 作废（`diagnostic`）。
- **P1 记录腿身份**：`git rev-parse HEAD`、`git status --porcelain` 全量、候选 patch 文件的 sha256、driver 二进制 sha256。
- **P2 跑门禁**：`.rebuild/s1b_step3/gate_run.sh <label> <driver>`（默认 768 MiB 门，timeout 1800，禁缓存四件套 + `BACKEND_JOBS=2` + `CHENG_CSG_MEM_TRACE=1`，`gate_run.sh:13-26`）。
- **P3 取数与自洽校验**：取 `source_snapshot_root_cid`（须为 64 位小写 hex）与 `source_snapshot_count`；校验 `source_snapshot_count == compile_input_source_file_count`（同一快照两次发射自洽，`cheng_cold.c:75587,75590-75591`；行/字节同源 `:75592-75607`）。不等 ⇒ 发射点被改坏 ⇒ REJECT。
- **P4 轮内 CID 全等（硬前置）**：best-of-5 的每个**成功轮**各自记录 `cid_k`；判据 `∀k: cid_k == cid_0`。不等 ⇒ `REJECT(corpus_mutated_mid_trial)`——这是"树不许在烤制过程中被并发 lane 改动"的机械守卫。
- **P5 A/B 腿配对**（tier 3 的候选 = 内核刀）：
  - 硬判据：`count_A == count_B`（闭包成员数不变）。计数变 ⇒ 候选 patch 增删了源 ⇒ **不得**当本 trial 有效，须重冻结语料档。
  - 归因判据：`cid_A` 与 `cid_B` **允许不同**——内核刀就落在闭包成员（编译器源）上，已有索引旁证：`src=134`=`typed_expr.cheng`、`src=61`=`primary_object_plan.cheng`（`docs/cheng-plan.md:1000`），L2/L3 的目标是 `src/core/lang/parser.cheng`——但差异必须由候选 patch 自身解释：`P ≠ ∅ ∧ P ∩ corpus ≠ ∅`。
  - **未钉**：更细的"哪些成员变了"需要逐源 (module_path, document_cid, content_cid) 清单，**当前载具不发射**（只有根 CID + 计数，`cheng_cold.c:82179-82185`；Cheng 链只有计数 `system_link_exec.cheng:2101`）⇒ 见 §10-①。
- **P6 落库**：把 `(cid, count, source_root, driver_sha, patch_sha)` 写入 `artifacts/rsi_compiler` 的 events 身份行（§7），**不写进本件正文**（避免正文冻结值过期）。"档 3 的冻结 CID"以 receipts 为准。

### 1.5 索引与入口（与档 2 的差异在判据，不在入口）

- 档 2（现 BLOCKED）与档 3 的入口源**同一路径** `src/core/tooling/backend_driver_dispatch_min.cheng`（`src/rsi/types.cheng:106`）；差异是**判据集**：档 2 = 旧 C1/C2 单口径；档 3 = §6.2 四判据 + §6.2.1 逐相 + §4 身份四元组。
- 档 3 的计数常量 `234` **硬编码在 checker** 里（`.rebuild/s1b_step3/check_acceptance.py:18` `EXPECT_SOURCES = 234`）。闭包计数变化（例如新增一个 `.cheng`）会使四判据全线 FAIL。
  ⇒ **跨线依赖**：checker 常量与档 3 语料计数必须由 kernel 主线**同一次裁定**同步；RSI 侧无权私改（`check_acceptance.py` 属冻结件）。

---

## 2. C1 计分（沿用档 0 口径）

- **计分 = 编译器自报 `exec_phase_total_us`**（微秒确定性相位）。提取实现锚：`src/rsi/compiler_domain.cheng:28-54`（`cdExtractTotalUsInto`）。
  实例 `[实测]`：`kd_b102.report.txt:118 = 208,367,529`（与 `:76` `cold_compile_elapsed_ms=208367.529` 自洽）；`kd_r104.report.txt:118 = 201,109,843`。
- **best-of-5**：容 1 败、至少 3 成、**min 只在成功轮取**；成功轮**语义指纹必须全等**（`types.cheng:69-71`、`compiler_domain.cheng:6-8`、`:172-226`）。
- **语义指纹 = (产物真实运行 rc, stdout sha256)**（`compiler_domain.cheng:150-154`）。Mach-O 产物 sha 因每进程随机 uuid 不可用、map sha 受 jobs 布局影响仅记账不作锚（`:177-181`）。档 3 的产物 = 内核 driver 本体（234 源自烤 exe），**不得**改用语义词以外的锚。
- **禁 wall-clock 单次计时作改进证据**（`compiler_domain.cheng:6-8`；`compiler_domain_c1c2_contract.md` §C1）。
- **同窗口纪律**：读数只可同窗口相对比较；每轮必须随记 `loadavg/free_pages/page_size`（`gate_run.sh:64-66`）。

### 2.0 两项实现偏差登记（档 3 翻转前必须收口；不静默沿用）

1. ~~**容错被放宽**~~ → **2026-09-13 父席裁定：改为「按档位隔离」，且不算实现偏差**（原写"沿用 12 尝试属实现偏差"作废）。
   **实现现势（B1 落树，单点 `compiler_domain.cheng:869-871`）**：**档 3 = 5 轮 / 容 1 败 / ≥3 成**；**档 0/1/2 = 12 尝试 / 成功下限 3 / 失败上限 9**。两者出自**同一处派生点**的参数化，不是两套实现。
   **裁定理由（成本 vs 收益，逐条）**：① 档 3 单烤 `[实测]` 208–278 s 级（`kd_b102.report.txt:76` = 208,367.529 ms；`r52_raised.summary.txt:1` = wall 278 s）⇒ 12 尝试 = 单臂数十分钟且**独占编译槽位**，容错机制的代价超过它要防的瞬态损失；② 12/9/3 的引入动因是**负载下红绿交替**（每次尝试秒级的小语料才吃得消）（`compiler_domain_c1c2_contract.md:19-20`）；③ C1 取成功轮 **min**，多试不会拉低下界（同 A5c 裁定理由）。
   **配套硬要求**：回执必须**逐轮记录所用档位口径**（attempts/successes/fail_cap），使跨档读数不可互比；档 3 的 `failCount <= 1` 是**硬前置**（S4 检查点复核）。
2. **C2 峰值绑错轮**：实现把 `bestPk` 绑在 **C1 最优轮**（`compiler_domain.cheng:211-213`），而 C2 要的是**峰值**最坏轮。**档 3 冻结口径**：C1 = 成功轮 min；**C2 总峰 = 成功轮 `process_tree_resident_peak_bytes` 的 max**；两者来源轮次分别记录，不得共用一值。

---

## 3. C2 记账：进程树总峰 **+ 逐相账**

### 3.1 判定式（三判据同时成立）

```text
硬门   : process_tree_resident_peak_bytes <= 805,306,368 B      (tools/memory_model_limits.sh:19-20)
回归帽 : process_tree_resident_peak_bytes <= 冻结基线(per-corpus) x 3/2   (compiler_domain.cheng:244-248)
rc     : = 0
逐相   : 每相实测 RSS 对模型值报差值；|Δ| > 50 MB 即遗留物，必须解释  (VERIFY_tamem_model_append.md:149)
```
缺任一读数一律 REJECT（fail-closed）。**禁止**用"基线 × 3/2"把越门状态判为可接受；**基线自身越门 = 病态基线**，先消解（融合计划 §七.2）。

### 3.2 逐相账（档 3 新增要求；档 0 只有总峰）

仪器：`CHENG_CSG_MEM_TRACE=1`（`compiler_csg.cheng:1660`）→ stderr 行 `csg_mem tag=<t> rss=<B> live=<n>`（`:1677-1680`）与 `csg_stage=<name> since_ms=.. rss_bytes=.. live_allocations=..`。**candidate 映射**（相名 → trace 锚，待 L1 结构化时钉死）：

| 相 | 模型锚 (MiB) | 模型权威 | trace 锚（candidate） | 现状 |
|---|---|---|---|---|
| 相 0 enter | 190 | `tools/memory_model_limits.sh:21` | `csg_stage=enter` | 有 |
| 相 1 bind/source_texts | 230–250 | `:22-23` | `csg_stage=after_binding_source_texts` | 有 |
| 相 2 profiles | 372–392 | `:24-25` | `csg_stage=after_profiles` | 有 |
| 相 3 metadata | **无锚**（原文：无实测锚，与相 4 合并核账） | `VERIFY_tamem_model_append.md:73` | `after_profile_lookup` 前最后一条 | **未钉** |
| 相 4 forest | 750–880（目标 ≤768） | `memory_model_limits.sh:26-27` | `csg_mem tag=forest_parsed` / `forest_appended` / `ta_stream`；`after_profile_lookup since_ms` | 有（仅抬门轮） |
| 相 5 TypeArena 生产 | 100–120（增量口径见 `VERIFY_tamem_model_append.md:104-116`） | `memory_model_limits.sh:28-29` | `csg_stage=after_type_arena_production`、`csg_mem tag=type_arena` | 有（仅抬门轮；默认门轮 `type_arena_lines=0`） |
| 相 6 expr/typed facts + typed ir | **待钉区⑤** | `memory_model_constraints.md:18,39` | `after_typed_facts` / `after_typed_ir` / `tag=typed_ir_done` | **未钉** |

**未钉相（相 3、相 6）显式记 `unpinned`，不得当 0、不得用估计值充数。** 相 5/6 在本轮**没有**可引用的默认门原始件（默认门轮止步在 append 相，见 §0）。

### 3.3 记账纪律

- 逐相账必须取自**同一轮** trace，**不得跨轮拼接**。
- `d_live`（找"谁留住了"）与 `rss`（找"峰值贡献者"）**不可互换**（`memory_model_constraints.md:36`）。
- 抬门轮（`CHENG_PARENT_RSS_GUARD=1` / `--rss-cap-mib` / 手工放守卫）**只许用于发现缺陷**，全部 `diagnostic`，运行状态本身即病态证据，**不得计入任何达标结论**（`cheng-plan.md:986`、`memory_model_constraints.md:34`、融合计划 §七.1）。
- 按源/按行累积的结构必须给 234 源全量外推与所属模型项；**外推超门即缺陷**（`memory_model_constraints.md:37`）。

---

## 4. 载体身份（每次 trial 必须绑定的四元组）

| # | 身份 | 报告/回执字段 | 现状锚 |
|---|---|---|---|
| ① | **driver 二进制** | `compiler_executable_identity_status=verified` + `compiler_executable_sha256` | `kd_b102.report.txt:94-95`（`0c765779…`）、`kd_r104.report.txt:94-95`（同值） |
| ② | **源码集（语料）** | `source_snapshot_root_cid` + `source_snapshot_count` + source root 绝对路径 | `kd_b102.report.txt:11,28,31,32`；`kd_r104.report.txt` 同 |
| ③ | **编译器（构建 driver 的载具）** | `composition_source_closure_sha256` + `composition_declared_sources_sha256` + `composition_source_identity_receipt_cid` + `compiler_executable_cid=sha256:<driver sha>`；provenance `real_backend_codegen` / `full_backend_codegen` / `system_link_exec_scope` | 门禁位置 `tools/build_kernel_driver.sh:203-206,220`；实例 `kd_b102.report.txt:1-6` |
| ④ | **工具** | 守卫运行时 sha（`BEAT_C_GUARD_EXPECTED_MONITOR_RUNTIME_SHA256`，`compiler_domain.cheng:117,142`）+ 链接工具 sha（`darwin_system_link_tool_sha256`，`kd_b102.report.txt:24`）+ 链接 argv sha（`:26`） | 同上 |

**绑定规则**：
1. 四元组缺一 ⇒ 该轮降级 `diagnostic`，不入 trial（仓规 6 / `cheng-plan.md:1019-1022`：源码/编译器/工具哈希必须绑定）。
2. **只有载具（driver 二进制 sha）变化才允许重标 C2 基线**（`compiler_domain.cheng:244-248`；另有 `rss_baseline.txt` 载具绑定先例 `rsi_gate.cheng:471-478`）。同载具下重标基线 = 违规。
3. `full_backend_codegen` 是**管线 provenance，不是覆盖率**：C 直发的完整面 `=0` 合格，不得当红修（`cheng-plan.md:1023`）。
4. 载具变化 ⇒ `cid`、`best_us`、`peak` 三个读数**同时**失效，必须整对（A/B 两腿）重烤。

---

## 5. 准入判据（直接引用，**不得自行另立**）

1. **唯一验收线**（`docs/cheng-plan.md:973-977`）：
   `rc=0` **∧** `forest_parsed_lines=234` **∧** `forest_appended_lines=234` **∧** `guard_hits=0`；
   另：`ta_stream_lines` 出现时必须等于 `forest_appended_lines`（否则说明发射点被改坏）。
2. **机械 checker**：`.rebuild/s1b_step3/check_acceptance.py <label>.summary.txt`（`:18` `EXPECT_SOURCES=234`；`:33-66` fail-closed：缺读数不算通过）。
3. **逐相贴线**（`cheng-plan.md:979-986`）：每相实测 RSS 对模型值报差值，`|Δ| > 50 MB` 即遗留物必须解释；未钉模型项不得当 0。
4. **判据成立条件**（融合计划 §六末）：`rc=0` ∧ 树峰 ≤805,306,368 B ∧ 各相贴线（差 ≤50 MB，未钉项显式标注）**三判据同时成立**；缺任一读数一律 REJECT。

RSI 侧**禁止**新增第五判据、**禁止**用语义指纹替代四判据（语义指纹是**附加**正确性锚，§2）；**禁止**第二种内存判据或第二种日志格式（融合计划 §四.5）。

---

## 6. 开放门：现状与清墙后翻转步骤

### 6.1 现状（实现锚）

- `src/rsi/types.cheng:77` `RsiCompilerCorpusMax = 2`（索引空间只到 2）。
- `src/rsi/types.cheng:101-109` `RsiCompilerCorpusRel` / `RsiCompilerCorpusOpen`（`Open` 仅档 0 为 true）。
- `src/rsi/proposal.cheng:40-44` 白名单（`param > Max` 拒 + `CorpusOpen` 拒）。
- `src/apps/rsi/main.cheng:215-216` CLI 入口即拒：`corpus tier N BLOCKED (only tier 0 open)`。
- `src/tests/rsi_contract.cheng:308-319` 合同冒烟断言（档 0 开、档 1/2 闭；越界拒 `:320-321`）。
- 账本 `artifacts/rsi_compiler` **当前不存在**（`ls` 无该目录 `[实测]`）⇒ 档 3 尚无任何历史 trial，不存在"历史绿"可继承。

### 6.2 翻转步骤（清墙后按序执行；每步可机械判定）

- **S1 前置（kernel 侧，硬）**：默认门下 §6.2 四判据 + §6.2.1 三判据同时成立；该轮 `(driver_sha, cid, count, source_root, 逐相账)` 已入 receipts；源树已冻结（P0 静窗成立）。
- **S2 索引空间扩展**（`src/rsi/types.cheng`）：`RsiCompilerCorpusMax` 2→3；`RsiCompilerCorpusRel(3)` = `"src/core/tooling/backend_driver_dispatch_min.cheng"`（与档 2 同入口，§1.5）；`RsiCompilerCorpusOpen(3)` **仅在 S1 成立且本件被批准后**置 true；档 1/2 保持 false。
- **S3 白名单/CLI 跟随**：`proposal.cheng:40-44` 与 `main.cheng:215` 自动跟随 Max/Open，**不新增分支**。
- **S4 收尾检查点（`RsiCdBakePairedInto` 成功出口）**：~~现有成功出口两处（`compiler_domain.cheng:215-220`、`:221-226`）~~【**2026-09-13 行号勘误**：该两处现为 `RsiCdReasonIsDiagnostic`/`RsiCdBakeOnceInto`，**真正的成功出口在 `:924-994`**（B1 实现：`:954` cid_rounds≠3 拒 / `:957` failCount>1 拒 / `:966` 逐相账不齐拒 / `:992` 冻结未落盘拒 / `:994` ok 回执）】。原成功出口只检 `goodCount/failCount`；档 3 必须在**真正的成功出口（`:924-994`）** 追加三项：`∀k: cid_k 全等` ∧ `failCount <= 1` ∧ 逐相账齐全（未钉相标 `unpinned`）。缺任一 ⇒ 不产出回执（返回 `outOk=0`）。**这是本档翻转的硬前置**：否则"配对"名义成立、实际没有输入同一性锚（§1.4 P4）。
- **S5 合同冒烟扩展**（`src/tests/rsi_contract.cheng`）：新增档 3 open 断言、档 1/2 仍 closed、越界（4）拒。
- **S6 账本原子性**：档 3 的 baseline/版本事实写入前先过链校验（`src/rsi/store.cheng:40-60` `RsiStoreVerifyChainInto`），失败即拒；沿用现有写锁，不新造。
- **S7 翻转轮回执**：(a) `rsi cdomain --corpus:3` 的真实 A/B 回执；(b) 该轮 `<label>.summary.txt` + `check_acceptance.py` 判词；(c) 逐相账 TSV；(d) 身份四元组。
- **S8 反向（回退）**：任一腿 `count ≠ 234` 或 `rc ≠ 0` ⇒ 档 3 回 BLOCKED，`RsiCompilerCorpusOpen(3)` 置 false，events 记 `event=cdomain_tier3_blocked reason=<...>`。

### 6.3 抬门规则

抬门轮（4 GiB / 抬门诊断）**只允许** `diagnostic` 且**不得计入达标**（§3.3）；档 3 的任何 accepted 记录不得来自抬门轮。

---

## 7. 落账格式：「一次内核刀 = 一次 trial」字段映射

**复用现有三件**（`artifacts/rsi_compiler`，schema `cheng.rsi.compiler.v1`；`compiler_domain.cheng:10-11`、`compiler_domain_c1c2_contract.md` §账本），**不新造日志格式、不新造 fact kind**：

- **events 哈希链**：行 `chain <digest> <payload>`，`digest = Sha256(prevDigest + "|" + payload)`，链首 = `types.RsiGenesisDigest()`（`store.cheng:14-36,43-48`；`types.cheng:202-205`）。
- **facts 图**：canonical JSONL（键字母序手工保证），DAG 根 = `facts_root`（`csg_layer.cheng:1-11`）。
- **budgets.tsv**：`corpus <idx> peak <bytes>`，tmp+rename 原子写（`compiler_domain.cheng:249-303`）。
- **current.txt**：7 行 `schema/generation/jobs_tier/corpus/best_us/product_sha/facts_root`，`seen != 7` 即拒（`:306-368`）。

| 融合层概念 | 落点（唯一） | 键/形态 | 档 3 取值来源 | 现状 |
|---|---|---|---|---|
| **候选 = patch 集与产物 sha** | ① facts `csg.rsi.candidate`（`csg_layer.cheng:39-47`：`id=cand:<tag>,kind,param,strategy,task_domain`；编译器域 `task_domain=2`、`param=corpus=3`、`strategy=jobs 档`）② **身份行** events payload `event=cdomain_tier3_identity` + `driver_sha=` + `corpus_cid=` + `corpus_count=` + `source_root=` + `patch_sha=` + `link_tool_sha=` + `guard_runtime_sha=` | 既有 kind 不改键序（canonical 校验会拒新键，`csg_layer.cheng:2-6`）⇒ 身份只进 events payload（payload 为自由 `k=v`，先例 `receipts/cdomain_events.log:1` `event=cdomain_genesis gen=0 jobs_tier=0 corpus=0 total_us=… peak_bytes=…`） | §4 四元组 + §1.4 P1/P6 | ① 已实现；② **未实现**（D3） |
| **试验 = 门禁跑** | facts `csg.rsi.trial`（`csg_layer.cheng:51-60`：`id=trial:<tag>,score,strategy,task_domain,verdict`；`score=best_us`）+ events `event=cdomain_genesis` / `cdomain_accepted` / `cdomain_rejected` / `cdomain_budget_breach`（`main.cheng:275-395` 既有形态） | 同上 | §2 C1 + §5 四判据 | 已实现（档 0 通道已验证：`receipts/cdomain_events.log`） |
| **判词 = 逐相 + 语义** | events payload 逐相行（每 trial 7 行）：`event=cdomain_tier3_phase phase=<p> rss_bytes=<B> model_mib=<M> delta_mib=<D>`（相 3/相 6 记 `unpinned`）+ `current.txt` 的 `product_sha`（语义指纹 `rc:stdout-sha`）+ `<label>.summary.txt`（§6.2 四判据） | 同上 | §3.2 逐相账 + §2 语义指纹 | **未实现**（D2/D3） |
| **版本推进** | facts `csg.rsi.cversion`（`compiler_domain.cheng:230-242`：`best_us,change,corpus,id,jobs_tier,kind,parent_facts_root,score`）+ budgets.tsv 刷新 + current.txt（`:353-368`） | 既有 | 接受后的新 `best_us`/peak | 已实现 |
| **基线/帽** | budgets.tsv `corpus 3 peak <bytes>`；帽 = ×3/2；硬门 = 805,306,368（`tools/memory_model_limits.sh:19-20`） | 既有 | §3.1 | 机制已实现；档 3 的值待首轮 |

**红线**：`csg.rsi.*` 事实键集**不得**为档 3 扩容（会改 DAG 根语义与既有 replay 判据）；`kind` 不得新增自定义型（`csg_layer.cheng:8-10`：自定义 kind 走 DAG 层身份、不进 validator 闭合注册表——档 3 不需要也不允许走这条路）。

---

## 8. 与档 0 / 档 1 / 档 2 的关系

- **档 0**（快线，继续）：`src/tests/rsi_minimal_smoke.cheng`，唯一开放档，记录 CID `ef548daa…`（`types.cheng:86-89`）、路径锚 `types.cheng:101-103`；现态 = 秒级、承担框架合同回归与 gate 腿。
- **档 3**（慢线，本件）：234 源全量自烤，分钟级 —— 单烤 `[实测]` `kd_b102.report.txt:76` `208,367.529 ms`；`r52_raised.summary.txt:1` `wall=278s`（抬门 `diagnostic`）。
- **C1 数值不可互比**：档 0 = 18 行源（`wc -l` `[实测]`），档 3 = 649,715–650,199 行（§1.2），规模差约 4 个数量级；两档各自独立基线、独立帽。**禁止**跨档比较 `best_us`、比率或"提速百分比"。
- **档 1**（`physics2d_determinism_smoke`，BLOCKED：撞 stage3 现役 `@borrows cloneReceipt` 墙）、**档 2**（dispatch_min，BLOCKED：GEN2 覆盖墙 `identity.cheng parser=7`）——判词见 `compiler_domain_c1c2_contract.md` §BLOCKED；档 3 不豁免档 1/2 的墙，且档 1/2 的开放门**不因档 3 开张而自动翻转**。

---

## 9. 依赖与工时

| # | 依赖/前置 | 面 | 工时 |
|---|---|---|---|
| D1 | `src/rsi/types.cheng` 索引空间扩展（`Max` 2→3、`Rel(3)`、`Open(3)`） | RSI 索引面（独占写者） | 0.5h `[估计]` |
| D2 | `RsiCdBakePairedInto` 收尾检查点（§6.2 S4）+ tier 3 逐相账采集与落账 + C2 峰值取下标（§2.0-2） | `src/rsi/compiler_domain.cheng` | 2–3h `[估计]` |
| D3 | CID 冻结接线（报告字段抽取 + events 身份行 + 轮内 CID 全等守卫 + P5 配对判据） | `src/rsi/compiler_domain.cheng` | 1–2h `[估计]` |
| D4 | **逐源清单发射**（module_path + document_cid + content_cid + byte_count），解 P5 细粒度归因 | 载具/后端面（跨线，非 RSI 独占） | 2–4h `[估计]`，未定归属 |
| D5 | 合同冒烟扩展（档 3 open/闭/越界） | `src/tests/rsi_contract.cheng` | 0.5h `[估计]` |
| D6 | gate 腿 + 四条负例（越门候选必拒 / 病态基线必拒 / 抬门轮不得进入判定 / 逐相缺失不得折算） | `src/tools/rsi_gate.cheng` | 1–2h `[估计]` |
| — | 合计（不含 D4） | | **5–9h** `[估计]` |

**不可由本档自行解除的前置**：kernel 清墙（§6.2 四判据，owner = L2/L3 线）；编译槽位窗口（`.rebuild/COMPILE_SLOT.lock`，禁抢）；树静窗（§1.4 P0）。
**时间成本**：一次真门 trial（合同口径 ≤5 轮）= 5 × 单烤 208–278 s ≈ **18–25 min** `[估计]`；若沿用实现侧 12 次尝试容错（§2.0-1），上限约 **40–55 min**。均不含抬门诊断轮与 A/B 双腿。

---

## 10. 未钉项（逐条，不得省略）与红线

1. **逐源清单未发射**：报告只有根 CID + 计数（`cheng_cold.c:82179-82185`；Cheng 链 `system_link_exec.cheng:2101` 只有计数）⇒ §1.4 P5 的"哪些成员变了"不可判，只能是"计数 + 补丁命中面"级弱判据。
2. **Cheng 链真实路径缺规模三元组**：`compile_input_source_file_count/line_count/byte_count` 只在 C 链发射（`cheng_cold.c:76017-76021`）；`src/**` 中同名键仅存在于 dry-compile 报告（`dispatch_min.cheng:2932-2934`）⇒ 若档 3 换纯 Cheng 载具，规模三元组必须新增发射点。
3. **Cheng 链真实路径缺根 CID**：`source_snapshot_root_cid` 只在 C 链发射；Cheng 链只有 `source_bundle_cid` / `source_identity_receipt_cid`（`system_link_exec.cheng:1190,1196,2141`），二者与根 CID 是否同构**未验证** ⇒ 纯载具下档 3 的 CID 身份未钉。
4. **相 3 无实测锚**（`VERIFY_tamem_model_append.md:73`，明示与相 4 合并核账）；**相 6 行数 = 待钉区⑤**（`memory_model_constraints.md:18,39`）⇒ 两相只能标 `unpinned`。
5. **逐相 trace 锚 ↔ 模型相的映射是候选映射**（§3.2 表）：需 L1 结构化时对账钉死；且本轮**没有**默认门轮跑出相 4/5/6 的原始件（默认门轮止步 append 相，抬门轮 `type_arena_lines=0`/`typed_ir_done_lines=0`）⇒ 相 4/5/6 实测锚**未钉**。
6. **【2026-09-13 复核更正·本条原判有误】** 原写"`r104_recov` 原始回执未定位"是**检索路径错误**：前次只扫了 `.rebuild/s1b_step3/gate/*.summary.txt`，而原始件在 `.rebuild/s1b_step3/r9/gate/r104_recov.summary.txt`（2,327 B，Sep 13 06:07）。**现证在位且逐项吻合**：`rss_guard_env=unset`（真默认门）/ `gate_hits`→`guard_hits=1` / `forest_parsed_lines=234` / `forest_appended_lines=136` / `ta_stream_lines=136` / `guard_line=compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=839353592 limit_bytes=805306368` / `rc=125` / `wall=261s`[实测]。
   ⇒ 该行数字**可作判据引用**，绑定路径 = `.rebuild/s1b_step3/r9/gate/r104_recov.summary.txt`；本件与融合计划 §1.1 的引用成立。**遗留教训**：本仓 summary 存在 `.rebuild/s1b_step3/gate/` 与 `.rebuild/s1b_step3/r9/gate/` 两处同名族，检索"未命中"不得直接判"回执不存在"。
7. **档 0 CID 记录值与文件当前内容的关系未钉**：`ef548daa…`（`types.cheng:88-89`）为**记录值**；当前 `src/tests/rsi_minimal_smoke.cheng` 的 `sha256=50bbc9d178b35eb030213251bdd0546609e91f62c950b6fbd4e2e31320f40b18`[实测]（HEAD 版同值），且按 `cheng.compiler.document_identity` 域在 4 种 module_path 拼法下复算均不等于 `ef548daa…`[实测] —— 差异原因（CID 记录后文件改过 / 用了别的域或拼法）**未钉**，不得据此判"CID 错"。
8. **patch 集 sha 与 driver sha 在既有 fact 中无落点**：candidate/cversion fact 无相应键（`csg_layer.cheng:39-47`、`compiler_domain.cheng:230-242`）⇒ 本件选择落 events 身份行（§7），但该行**尚未实现**（D3）。
9. **`234` 硬编码在冻结 checker**（`check_acceptance.py:18`）：闭包计数变化时须由 kernel 主线裁定同步（§1.5），本档无权私改。
10. **闭包成员 ↔ trace `src=N` 索引映射未钉**：`csg_mem tag=forest src=<N>` 只给索引不给路径（实例 `.rebuild/s1b_step3/gate/r45_recheck.summary.txt` 尾行、`.rebuild/s1b_step3/gate/r52_raised.stderr.txt`），已知映射只有 `docs/cheng-plan.md:1000` 给出的两条 ⇒ §1.4 P5 的判据只用『路径 ∈ 闭包』的集合语义，**不得**用 `src=N` 代替路径做归因。

**红线（继承，违者判词无效）**：① 抬门/放宽守卫换 `rc=0`；② 用"基线×3/2"把越门判可接受、或拿病态基线当基线；③ 用未钉项当 0 或用估计值充数；④ 在 RSI 侧复刻第二份 CID 实现 / 第二套内存判据 / 第二种日志格式；⑤ 把"某轮跑过 234 源"当作档 3 已开放；⑥ 档 3 结论未绑 §4 身份四元组。

---

## 附录 A：证据指针（只索引，不复制）

- 判据/门禁：`docs/cheng-plan.md:963-1036`；`.rebuild/s1b_step3/check_acceptance.py:18,33-66`；`.rebuild/s1b_step3/gate_run.sh:13-26,45-71`。
- 内存模型：`tools/memory_model_limits.sh:12-29`；`docs/campaigns/2026-08-31-kernel-userpath/design/memory_model_constraints.md:6-46`；`docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_tamem_model_append.md:9-26,43-131,149`。
- 逐相仪器：`src/core/tooling/compiler_csg.cheng:1607-1680,39913,40042,40127,40143,40170`。
- RSI 侧实现：`src/rsi/types.cheng:64-109,202-205`；`src/rsi/compiler_domain.cheng:28-54,57-83,95-226,230-303,306-368`；`src/rsi/store.cheng:14-60`；`src/rsi/csg_layer.cheng:1-11,39-106`；`src/rsi/proposal.cheng:34-53`；`src/apps/rsi/main.cheng:203-395`；`src/tools/rsi_gate.cheng:266-320,465-480`；`src/tests/rsi_contract.cheng:308-321`。
- CID/闭包算法与发射：`bootstrap/cheng_cold.c:2878-2948,2950-3022,3040-3163,3225-3288,3290-3367,3370-3457,75508-75595,76017-76021,82179-82185`；`src/core/backend/system_link_exec.cheng:1597,2090-2145,7415-7452`；`src/core/tooling/backend_driver_dispatch_min.cheng:1466,2706-2707,2921-2934,3021-3022`。
- 实测回执：`.rebuild/s1b_step3/r9/kd_b102.report.txt`；`.rebuild/s1b_step3/r9/kd_r104.report.txt`；`.rebuild/s1b_step3/gate/r45_recheck.summary.txt`；`.rebuild/s1b_step3/gate/r52_raised.summary.txt`；`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/cdomain_events.log`；`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/cdomain_current.txt`。
- 融合层：`docs/cheng-rsi-fusion-plan.md:14,48-83,105-112`；`docs/campaigns/2026-09-07-pure-cheng-rsi/compiler_domain_c1c2_contract.md`；`openspec/proposals/pure-cheng-rsi.md:31-53`。
