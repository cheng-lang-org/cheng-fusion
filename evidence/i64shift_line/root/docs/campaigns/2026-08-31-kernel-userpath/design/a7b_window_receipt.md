# A7b 窗口执行回执（2026-09-13，槽位首次空闲；已打绿·小夹具范围）

**结论先行**：A7 补丁此前从未被真正编译过——**首次真编译暴露 4 处硬缺陷**（3 处在原补丁、1 处在本席的修正补丁），逐处修复后：

- **烤制 rc=0**（3m35s，无 lease 冲突），driver sha256 `ba9c8880e58148121131…`
- **金丝雀 rc=0**（`canary_compile_rc=0`、`canary_orc=0`）
- **发射块断言 PASS**（38 行 `theory_emit_*`、44 键齐全，`A7_EMIT_VERDICT=PASS`）
- **树逐字节还原**（`REVERT_OK sha=880d4632…`，`git diff --numstat` 回到他线 WIP 基线 **39/3**）

**S6（2026-09-13 03:02–03:10，排队件等到窗口）：判 INCONCLUSIVE，且原因不在本补丁**——
- 窗口 FREE（等 321s）⇒ patched 驱动 `ba9c8880…` 编 234 源闭包，`rc=2`、wall **414s**、`theory_lines_stdout=0`、`guard_hit=0`、无 report。
- 失败判词：**`parser normalized structure: frozen anchor missing`**（`src/core/lang/parser.cheng:34779`）。
- **这是内核战役自己的"现役前沿墙"**（`docs/cheng-plan.md:82`「现役前沿墙 = parser normalized structure: frozen anchor missing（parser.cheng:34779，src=2 pre_view 后；与单夹具路径收敛，B6 在攻）」；证据总账 `deterministic_model_derivation.md:1693` 同载），且 **`:1705` 记录未打补丁的 `kd_c2d` 两臂"同止于 frozen anchor missing"** ⇒ **与本补丁无关**：编译根本没跑到发射点。
- ⇒ S6 判据已从三态扩为**四态**（`a7s6_run.sh` sha `62b6a13e…`）：PASS / **INCONCLUSIVE(known_wall)** / INCONCLUSIVE(empty_closure) / FAIL；对本次真实回执复判 = `INCONCLUSIVE known_wall`（正确）。
- ⇒ **A7b 的 234 源发射验收被内核战役的前沿墙前置阻塞**（依赖 B6 清墙），不是本补丁或本席工具的问题。小夹具路径的发射已 44 键全绿。

## 0. S5 产物字节对拍（已完成，结论与预期不同）

- pristine 驱动 `faca4714…`（无补丁烤制，rc=0，3m22s）vs patched 驱动 `ba9c8880…`，同一夹具同参数、配对轮禁缓存：
  - **`.primary.o`：`BYTE_IDENTICAL`** ⇒ **A7 补丁不改变代码生成** ✅
  - **exe：`DIFFERS`**（94 字节，落在偏移 7,393,801 起与文件尾）
- **决定性对照（同驱动跑两次）**：**同一个 patched 驱动**编同一夹具两次 ⇒ **exe 仍 `DIFFERS`（95 字节）**，而 `.primary.o` 仍 `BYTE_IDENTICAL`。
  ⇒ **exe 的差异与 A7 补丁无关**，是产物**自带非确定性**。
- **差异位置已定位**：`CHENGPVC` 段（`src/core/backend/macho_provider_linker.cheng:2228` `machoBuildProviderCommitment`）= provider 承诺块（magic + 版本 + sha256 kind + size + providerCount + contentSet/evidence/proof 三个 digest，共 120 B）。**LC_UUID 两次相同**（`D0D1D2D3-…`），故非 uuid 所致。
- **对本仓判据的影响（重要）**：`docs/cheng-plan.md` §6.4「字节铁门：driverA/B 同名 `--out` **sha256 相等**」对**带 provider 承诺的 Mach-O 产物不可满足**；可靠的口径是 **`.primary.o` 对拍**（或对 `CHENGPVC` 段做豁免后比对）。这与 C1/C2 合同早已记录的"产物字节不可作锚、语义指纹 (rc, stdout sha) 才是锚"同向，且把不可用的**具体位置**钉到了段级。
- **未钉（不得当已知）**：三个 digest 中**哪一个**逐轮变化、以及**编译器自身二进制**是否也带可变承诺（战役历次 GEN2/GEN3 原始字节固定点若成立，则固定点对象上应不可变——但这是**待验证**，不是结论）。

## 0.6 `theory_source_closure_files=0` 的成因已查清（**不是缺陷**）

同一轮的 report 自己写着 **`source_closure_count=0`** 而 `source_bundle_closure_count=1`；补丁取的是 `plan.systemLinkPlan.sourceClosurePaths`（patch `:82-83`）——该字段在"单夹具 `--in` 探针"里本就是**空表**。⇒ **0 是忠实读数，不是 bug**；`source_bundle_closure_count` 是另一个字段。
**对 S6 的直接意义**：S6（234 源自烤）预期 `theory_emit_theory_source_closure_files=234`，前提是那次调用的 `sourceClosurePaths` 被填充。**便宜的预检量**：同轮 report 的 `source_closure_count` 必须也是 **234**；若它是 0，则 A7 那个字段为 0 属**忠实**而非失败，S6 应判 **inconclusive** 而不是 FAIL。此判据已加入 S6 脚本。

## 0.5 事故与工具修正：孤儿编译（本席自己的错，2026-09-13 10:22）

**事故**：S6（抬门 234 源）发起时窗口其实**已被 `b3line_b602`（pid 14708）取走**；我在同一次调用里先打印了 `A7_PRECONDITIONS=BUSY` 却仍然把后台任务发了出去；`job_kill` **只停掉了 job 外壳**，脚本里 `timeout 1800 "$DRV" system-link-exec` 起的编译（pid 16603）继续存活，与他线并发烤机约 1–2 分钟，直到我 `pkill -f 'kd_a7v9 system-link-exec'` 才终止。他线的 `kd_b602` 金丝雀未被我杀死（已核实），但其轮次的时间/内存读数**可能被我这段并发污染**——按纪律应视为该轮不可用于任何基准比较。

**根因两条**：① 窗口判定在外层、编译在内层，两层之间没有强制；② 编译未放独立进程组，取消不能整树终止（正是 `tools/beat_c_process_group_guard.sh` 存在的理由，我自己的脚本没遵守）。

**修正（已落 `tools/a7_theory_emit/a7s6_run.sh`，sha 见下）**：脚本**自己**在编译前跑 `a7_preconditions.sh --samples 3 --interval 15`，非 `FREE` 即 `exit 3` 且**不发起任何编译**；编译改用 `setsid … &` 独立进程组并记录 `compile_pgid`，取消按组杀。**这条纪律适用于本会话此后所有编译类脚本。**

## 1. 窗口与纪律

- 窗口 `a7_preconditions.sh --samples 3 --interval 15` ⇒ `FREE`（锁缺失 + 三样本全静默）——目标登记 blocked 25 轮以来首次。
- 全程"应用前记 sha → trap 反序 `git apply -R` → 结束断言逐字节还原"。**实测抓到并修掉一个真实安全漏洞**：`a7_apply_revert.sh` 原先在 apply 成功后才记 state，若 base 成功而 fix 失败就无据可撤（本席实测把树留在 366/5）。已改为**先落 state（`status=pending`）再动手**，并让 `--revert` **逐份探测、允许"只应用了一半"**；改后 roundtrip 仍 PASS。

## 2. A7 补丁的真实缺陷（全部只能由真编译暴露）

| # | 编译器原文（节选） | 根因 | 修法 | 补齐补丁 sha |
|---|---|---|---|---|
| **D1** | `call argument transfer authority caller=…AppendSelfbakeTheoryLedgerReport callee=…TheoryLedgerLineInt64 formal=0 … live=0` | 新 helper `TheoryLedgerLineInt64(text,key,value)` 漏 `@borrows` | 补 `@borrows` | `theory_emit_borrows_fix` `8f21c073…` |
| **D2** | `borrowed actual cannot bind non-var non-@borrows formal … formal_ordinal=1 caller=…SystemLinkExecWorker callee=…AppendSelfbakeTheoryLedgerReport` | 新函数自身漏 `@borrows` | 补 `@borrows` | `theory_emit_borrows_fix2` `c80d741d…` |
| **D3** | `… callee=…DryCompileSourceStats formal_ordinal=0` | 借用形参 `rootDir` 传给需要自有值的既有 helper | 新函数内**单点物化** `let rootDirOwned: str = Fmt"{rootDir}"`（不动既有 helper 注解面） | `theory_emit_rootdir_owned` `e3976a02…` |
| **D4** | 块里**没有** `theory_emit_rss_metric`（旧键也没了） | **本席 S2.1 的错**：把标签写成跨行相邻字符串字面量，Cheng 不做隐式拼接 ⇒ 该行未发射 | 改单行字面量 | `theory_emit_rss_metric_label` `bf45ff07…`（重建版） |
| **D5** | 驱动 **rc=1**：`cheng_orc_release_failure code=registry_miss operation=normal_release detail=wrong_object_or_owner`（金丝雀与探针**均**出现） | worker 里 `var theoryPlan = work.plan … work.plan = theoryPlan` 的**回写式重绑定**破坏对象身份 | `plan` 形参去 `var`（该函数只读）+ 调用点直接传 `work.plan`、删掉两行重绑定 | `theory_emit_plan_borrow` `e03d5a74…` |

**教训（应入 lessons）**：D1–D3 是同一族"只读 helper 缺 `@borrows`"，**`patch_preflight`、`git apply --check`、静态 grep 全部拦不住**，只有真编译会暴露；D5 是**托管对象回写式重绑定破坏 ORC 身份**，与工程规范第 5 条（"不得直接覆盖全局/所有权必须由不可变字段贯穿"）同族。**"补丁已就绪"在真编译之前一律不成立。**

## 3. 最终补丁序列（按序 apply，逐份已验）

| 序 | 补丁 | sha256(前 20) |
|---|---|---|
| 1 | `selfbake_theory_emit.patch`（base，2026-09-11 冻结） | `3f152300698faa5146ae` |
| 2 | `theory_emit_rss_metric_label.patch` | `bf45ff07db50cae5043c` |
| 3 | `theory_emit_borrows_fix.patch` | `8f21c07363e8b7f2f92f` |
| 4 | `theory_emit_borrows_fix2.patch` | `c80d741dc05f84b89d2d` |
| 5 | `theory_emit_rootdir_owned.patch` | `e3976a0241350aa11b1b` |
| 6 | `theory_emit_plan_borrow.patch` | `e03d5a743b9f2bd5fb31` |

应用后 numstat = **367/5**（他线 WIP 39/3 + 本序列 328/2）。

## 4. 发射块实测（`.rebuild/a7b9/probe.stdout.txt`）

`theory_emit_status=ok` / `theory_emit_scope=selfbake_real_system_link_exec` / `theory_emit_chain=cheng_chain` /
`theory_emit_hard_gate_bytes=805306368`（**与权威件逐字一致**）/ `theory_emit_rss_sample_count=1` / `theory_emit_rss_metric=darwin_ri_phys_footprint_sample_at_report|linux_ru_maxrss_highwater`；
共 **38 行**，44 键断言 **PASS**。
**异常（未查）**：`theory_emit_theory_source_closure_files/lines/bytes = 0`；`real_wall_over_theory_x=95926.716`（小夹具下模型下界极小，该比值无判别意义 = 口径伪影，不得引用）。

## 5. 原始件

| 件 | 说明 |
|---|---|
| `.rebuild/a7b9/kd_a7v9` | **最终 patched 驱动**，sha256 `ba9c8880e58148121131…` |
| `.rebuild/a7b9/probe.stdout.txt` | 38 行发射块原文（断言 PASS 的对象） |
| `.rebuild/a7b{,3,4,6,7,9}/run.log` | 各次尝试 apply/bake/canary/probe/revert 全量日志 |
| `.rebuild/a7b6/kd_a7v6` `9e37f8cf…` / `.rebuild/a7b7/kd_a7v7` `6cd42550…` | 中间代（D5 修复前，带 ORC 缺陷） |
