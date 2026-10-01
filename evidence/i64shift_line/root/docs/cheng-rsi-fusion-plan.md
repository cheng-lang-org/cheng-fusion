# Cheng 双线融合计划（内核战役 × 纯 Cheng RSI；内存/时间双理论极限约束）

> **定位**：本文是 `docs/cheng-plan.md` 与 `openspec/proposals/pure-cheng-rsi.md` 的**融合层**，只回答两件事：
> ① 两条线为什么不是"一条等另一条清墙"，而是同一个优化问题的两条约束轴；② 谁在哪个文件面、按什么判据、依赖谁。
> 两份文档各自的状态段仍是各自唯一状态源（`cheng-plan.md` §二 / RSI 提案 §8）；本文只维护**融合层车道与原子任务**的状态，且只在 **§3.2 一处**，不另立数字口径。
> 冲突时：内存/时间判据以 `docs/campaigns/2026-08-31-kernel-userpath/design/memory_model_constraints.md` + `cheng-plan.md` §六/§七为准；RSI 合同语义以提案 §3/§4 为准。
> **一页状态视图**：`docs/cheng-rsi-acceptance-status.md`（三目标"已交付/证据/未证" + 待用户裁定清单；本文件是推导与裁决处，那份是收口视图）。
> 数字口径：`[实测]` / `[估计]` / `diagnostic`；未实测处不填数。**首版读取起点 HEAD `b083fc3dd`（2026-09-13 08:0x）；2026-09-15 整理时 HEAD `47f53967f`（其间 314 commits）。** 正文与附录中的 `file:line` 锚除另注外均为 `b083fc3dd` 时刻的值，现树已漂，以函数名 / stage 名 / 判词串为准。
> **路径基准**：所有路径自仓根起写全（两个战役根 = `docs/campaigns/2026-08-31-kernel-userpath/`、`docs/campaigns/2026-09-07-pure-cheng-rsi/`；仅 §九 表内为省幅用 `K/`、`R/` 缩写）；`.rebuild/`、`artifacts/` 下是可清理的临时面，引用时默认「原始件可能已清理」。
> **结构**：§一–§八 = 计划与裁决（状态只在 §3.2，墙只在 §3.3，口径陷阱只在 §四.6）；§九 = 由 §3.2 机械汇总的正交原子任务矩阵与完成比例；附录 A = 2026-09-13/14 施工日志按时间序归档，只读。

## 一、双极限模型

### 1.1 内存（已有结构模型，缺的是收口不是模型）

- **权威件**：`tools/memory_model_limits.sh`（门值 805,306,368 B + 逐相锚）、`docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_tamem_model_append.md`（逐相公式/系数/对账）、`docs/campaigns/2026-08-31-kernel-userpath/design/peak_memory_holders.md`（持有者归因）、`docs/campaigns/2026-08-31-kernel-userpath/design/memory_model_constraints.md`（binding 约束卡）。
- **当前账 `[实测]`**（`r104_recov`，默认门）：`rss=839,353,592`（**超门 34.05 MB**）、`forest_appended_lines=136/234`、`guard_hits=1`；并林入口 **604.9 MiB**、并林增长 **0.90 MiB/源**、满量外推 ≈**816 MiB** ⇒ 距门 **≈48 MiB**。
  **原始件已定位**（2026-09-13 复核）：`.rebuild/s1b_step3/r9/gate/r104_recov.summary.txt`——`rss_guard_env=unset`（真默认门，非抬门）、`guard_line=… status=rss_limit_exceeded rss_bytes=839353592 limit_bytes=805306368`、`rc=125`、`wall=261s`。
- **模型项**：B1/B2（结构遗留，已定位）、C1（TypeArena 二份拷贝 ≈61 MB）、C2（typed facts/Ir 行数 = 待钉区⑤）、**G(k)**（并林逐源净留存；主项已点名到 `ParserValueExprProcessStatementRangeWithTypeOwner` **一条调用内占 96.3%**，机制 = 循环体内被 `add` 增长的局部 `seq` 缓冲在作用域出口不释放，根因闭合在 `bootstrap/cold_parser.c:81195-81212` 的掉落收集器判据域）。

### 1.2 时间（**尚无结构模型 —— 这是本融合的头号缺口**）

现存两套"理论"数字，性质**都不是算法下限**：

| 口径 | 产生处 | 公式/系数 | 实测 | 性质 |
|---|---|---|---|---|
| C 链 `compile_theory_parallel_limit_ms` | `bootstrap/cheng_cold.c:75967-75970`（标签 `:76016`） | `ceil(compile_real_cpu_us / hw.logicalcpu)` | `kd_b102`：15,201.851 ms，比值 **13.706×** | **本轮实测 CPU ÷ 核数的后验折算** = 并行效率倒数；公式不含行数/字节/串行占比（证据总账 §3.3、§⑦-6/7） |
| Cheng 链 `full_compile_theory_*` | `backend_driver_main.cheng:4416-4451`，孪生 `backend_driver_dispatch_min.cheng:2657-2692` | 相划分 + **校准系数**（`bytes×50 ns`、`files×200 µs`、`csgNode×3 µs`…），`budget_upper = lower×3 + 20 ms` | **真实自烤不发射**（唯一调用点 `dispatch_min.cheng:3021` 在 dry-compile 分支内） | 系数是后验标定：50 ns/B = **20 MB/s**，把当前实现的低效写进了"下界" ⇒ 用它判"收敛"是自证 |

⇒ **理论时间极限的正确形态**（与内存模型同构：结构项 + 逐源斜率）：

```text
T_floor(相 p) = W_p / B_eff(p)  +  n_p × c_p
   W_p = 该相按算法必须触碰的字节流量（由算法决定，不由实现决定）
   n_p = 该相的项数（行/节点/fact/指令），c_p = 单项成本
```

以此为准，`[实测]` 已有一个**量级级**缺陷：三处同族 append 站点的代价 = `源字节 × 节点数` **双线性**（`parser.cheng` `L=1,729,036 B` ⇒ 10¹²–10¹³ B 流量 ⇒ 16–20 min 停摆，§5.9.1），线性底线是 `Σ_s 源字节 × 每相遍历次数`。**超出倍数 = 该项的节点/项数**（该源实测推算 ≈6×10⁵–6×10⁶），不是"13.7×" —— 13.7× 是并行效率，不是算法差距。

两条链的实测（**口径不可互代，故分行写**）：

- **C 链参照烤**：`kd_b102`（`scope=cold_runtime_provider_system_link` / `full_backend_codegen=0`；234 源 / 649,715 行 / 30,989,631 B）wall **208,367.529 ms**，其中 **parse 136,997,679 µs（65.7%）**、codegen 66,412,770 µs（31.9%）、direct_object_emit 49,542 µs。
- **Cheng 链自烤**：时间墙一度 = `ParserValueExprTreeAppendFromImpl` 内三处同族站点，森林窗 `after_profile_lookup since_ms` **553,914 ms**（两点已补缓存后；token/typeSyntax 已修，region 未修）。
  **该基线的两个限定（2026-09-13，A1 交付件 + 本席复核）**：(a) 原始件 `.rebuild/remap_exp/` **已被清理**，只剩文档引文 ⇒ 历史参照，**不得作发布证据**；
  (b) **该判据的验收面已迁移**：工作树（未提交）已删除"精确容量并林"，`CompilerCsgBuildParserForestAuthorityInto` 自述 the merged forest "is gone"（`:33438-33460`）、`grep typeArenaParserForest` = **0**；
  `ParserValueExprTreeAppendFrom` 全仓只剩 **2 个调用点** = `compiler_csg.cheng:30704`（typed/frontier 相）与 `parser.cheng:3698`（`NormalizedExprLayerAdd`）——而 `git show HEAD:` 仍在 `:33162` 有并林调用 ⇒ 未提交。【2026-09-15 复核】并林删除**已入 HEAD**（`47f53967f`：HEAD 与工作树 `typeArenaParserForest` 均 0 命中）；`src/core/tooling/compiler_csg.cheng` 现另有 355/0 未提交他线 WIP，与此无关。
  ⇒ **"补 region ⇒ 森林窗 <120 s"已失去判别力**，第三点修复的可观测面转移到 **typed/frontier 相**（新增埋点对），森林窗只剩"不回归"判据。

⇒ 两条链共同指向**同一族代码**：Cheng 链的时间墙与内存 `G(k)` 主项同属 `src/core/lang/parser.cheng` 的 `ParserValueExpr*` 族。

### 1.3 结论：双极限约束的是同一个对象

Cheng 链上，`ParserValueExpr*` produce/append 族同时持有**时间墙**（`ParserValueExprTreeAppendFromImpl`，森林窗 553.9 s）与**内存 `G(k)` 主项**（`ParserValueExprProcessStatementRangeWithTypeOwner`，单调用 **96.3%**、**671 MB**）；C 链参照烤的 parse 相（wall 的 **65.7%**）与之呼应。
⇒ 两条线不是"并行协调"，是**一个优化问题、两条约束轴**；只动一轴会把成本从内存搬到时间（或反之），不消除缺陷。

## 二、融合判据（cheng-plan 剩余项 ↔ RSI 编译器域维）

| cheng-plan 项 | RSI 编译器域维 | 共享判据（唯一） | 现势 |
|---|---|---|---|
| G(k) 收口（A2 热位点 / A1 平行表） | **C2** 编译内存峰值 | 硬门 805,306,368 **∧** 逐相贴线 **∧** rc=0（`cheng-plan.md` §6.2 + §6.2.1） | A2 单点 ≈2.5 MB 已证；缺口 ≈50 MB |
| ⑥ region 同族缓存（`ParserValueExprTreeAppendFromImpl` 内三站点；行号锚 `b083fc3dd`：工作树 `:11847/11854/11856`、HEAD `:11795/11802/11804`，现树已漂） | **C1** 编译时间 | **判据已改**：①森林窗不回归（口径 = `forest_window_caliber.md` §0 绑定三件）；②**新增 typed/frontier 相埋点对**，第三点只在该埋点对上验收 | 两点已补；**原"森林窗 <120 s"判据作废**（工作树已删精确容量并林 ⇒ 三处同族站点不再落在森林窗内） |
| ⑨ S1b（pass0 流式化 + 删并林） | **C1+C2 联合** | B1–B6 + I1/I2（`docs/campaigns/2026-08-31-kernel-userpath/design/pa_s1b_edit_plan.md` §5） | 施工梯已定，占槽是硬前提 |
| ⑤ v6 后端相（`cheng-plan.md` §5.7.5；标题读数 847 MB 为早期轮） | **C2** | 同内存判据 | 2026-09-10 轮 `821,691,976 > 805,306,368` ⇒ 超门 16.4 MB（`cheng-plan.md:290`；与 847 MB 非同轮读数） |
| ⑫ 严格闭包 S1 / 内核 manifest | **C3** 最小编译内核 | 组合面：内核 manifest 无 arch 项且可独立自举 | arch 12→4、closure 183 阶梯 |
| 判词墙源侧清理（`redundant explicit default init` 60 处已清、import 可见性族） | **C5** 语法直觉/规范收敛 | 规范迁移探针 + 正反例；禁业务层绕行 | 批量清扫已落地（§8.69） |
| B4 语义等价（4 夹具 + 2 源对 + 8 源闭包） | **语义指纹**（rc + stdout sha，best-of-5） | **合并为唯一语义锚** | 两侧各自实现，未合并 |
| ⑬ held-exec / DarwinAuthority | 纯载具 A/B 解锁（C1/C2 去 C 链依赖） | 五原语判决 + M3 安装面 | M1/M2/M4 待接线；M3 本机已在位（判词 58） |
| GEN2/GEN3 原始字节固定点 | C1/C2 **发布准入**前置（非试验准入） | 仓规 6 条：源码冻结 + 三方哈希 | 未冻结 |

**融合命题**：**kernel 出候选、RSI 出准入；判据、仪器、账本三者只允许一份。**

## 三、车道矩阵（files / action / verify / done）

### 3.1 车道定义

| 道 | 内容 | 文件面 | 判据 | 依赖 | 并行性 | 工时 |
|---|---|---|---|---|---|---|
| **L1** | **时间模型结构化**：把 §1.2 的 `T_floor` 落成逐相模型（W_p/B_eff + n_p×c_p），并给每个在途刀预登记"影响哪一项、增减多少" | 新设计件 `docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md`；只读 `kd_b102.report.txt` 等回执 | 用 234 源实测逐相反算系数并与模型对账；对 region 第三点给出**可证伪**的 Δ 时间区间 | 无 | 与全部道并行（零热文件写入） | 3–5h `[估计]` |
| **L2** | **内存 G(k) 收口**：A2 热位点（61 函数 78 处，分批 ≤5 处/轮）或 A1 结构刀（平行表 `exact_loop_mutated_local_*` + 校验器 + staging 枚举） | `src/core/lang/parser.cheng`（produce 段）、`bootstrap/cold_parser.c`（A1 掉落收集器） | A1 最小判据 **15/64/240 → 0**；A2 抬门 s6 对账（diagnostic）；收口 = `cheng-plan.md` §6.2 四判据 + §6.2.1 逐相贴线 | 无（**在跑**，owner `c2line_round2`） | 与 L3 **同文件 ⇒ 必须串行（单写者）**；与 L1/L4/L5/L6 并行 | 在跑 |
| **L3** | **时间第三点（判据已改）**：region 循环 per-source remap 缓存；S1b 记忆刀**已在工作树落地（09-13 未提交；09-15 复核：并林删除已入 HEAD `47f53967f`）** | `src/core/lang/parser.cheng`（region 三站点在 `ParserValueExprTreeAppendFromImpl` 内；`b083fc3dd` 工作树锚 `:11847/11854/11856`，现树已漂；= L2 同文件）+ `src/core/tooling/compiler_csg.cheng`（并林已删，**已入 HEAD**；现树另有 355/0 他线 WIP） | ①**森林窗不回归**（口径 = `forest_window_caliber.md` §0）；②**typed/frontier 相埋点对 = `after_profile_lookup` → `after_typed_ir_expr_layer_rebuild`（现成埋点，**无需新增 stage**，见附录 A.6）**；③产物字节铁门（配对轮禁缓存） | L2 让出文件面；口径由 A2 给 | 与 L2 串行；与 L1/L4/L5 并行 | region 单项 2–4h `[估计]`（沿用 §5.7.6） |
| **L4** | **RSI 语义 oracle**：把任务域 31 格 + 金标做成"给定编译器二进制 → 语义等价判决"的门 | `src/tools/rsi_semantic_regression.cheng`（新）、复用 `src/tests/` 语料 | 已知等价对判 PASS；已知误编译（`BACKEND_JOBS=2`）判 FAIL；31 格 `incumbent==best_correct` | 无（不依赖载具解锁） | 与 L1/L2/L3/L5/L6 并行 | 8–12h `[估计]` |
| **L5** | **RSI C1/C2 口径对齐 + 新增语料档 3**：① 帽语义改双判据（硬门 + 回归帽）；② C2 报**逐相**；③ 常量单点派生；④ 负例；⑤ 语料档 3 = **234 源自烤**（kernel 验收线本体） | `src/rsi/compiler_domain.cheng`、`src/rsi/types.cheng`、`src/tools/rsi_gate.cheng`、`docs/campaigns/2026-09-07-pure-cheng-rsi/compiler_domain_c1c2_contract.md` | 四条负例真实编译运行：越门候选必拒 / 病态基线必拒 / 抬门轮不得进入判定 / 逐相缺失不得折算 | 基线读数来自 L2/L3 | 与 L1/L2/L3/L4 并行（**文件面互斥**） | 6–10h `[估计]` |
| **L6** | **自烤理论发射接线验证**：patch 已就绪（+323/−2，`dispatch_min.cheng`），验证清单 §⑥ 1–7 于 09-13 A7b 窗口部分完成、234 源项未完成（见 §3.2 L6） | `docs/campaigns/2026-08-31-kernel-userpath/patches/selfbake_theory_emit.patch` | 编译通过 / 产物字节不变（`cmp` exe + `.primary.o`）/ 真实路径发射 ≥30 行 / **234 源** `theory_emit_theory_source_closure_files=234` 且 wall/cpu/比值全部有值 | **编译槽位窗口** | 抢槽，与其他道交替 | 2 轮 ×1200 s + 1 轮抬门诊断 `[估计]` |
| **L7** | **语料墙解冻 + 纯载具**：档 1/2 重冻结（CID + 开放门 + gate 两腿）；M1/M2/M4 接线后纯载具 A/B | `src/rsi/types.cheng`（`RsiCompilerCorpusRel/Open`）、`docs/campaigns/2026-09-07-pure-cheng-rsi/probes/darwin_authority/` | 档 1/2 在清墙后编过且语义指纹自洽；纯载具 A/B 双向可跑 | L2+L3 清墙；M3 安装面（已在位） | 收口道 | 未定 |


### 3.2 状态表（**唯一状态源**；2026-09-13 下午刷新 + 2026-09-15 复核；判据与证据一律指向验收账本）

| 道 / 任务 | 状态（2026-09-15 复核） | 证据 / 卡点 |
|---|---|---|
| L1 时间模型结构化（A1） | **已交付** | `docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md`；内核 TM1 线（总账 §8.75）另做实测翼收割；其 M6 / U8 两条已被附录 A.6 更正（埋点在码里存在、只是从未发射） |
| L2 内存 G(k) 收口 | **内核线在攻，本席不碰** | 总账 §8.66/§8.67（落点 `ParserValueExprProcessStatementRangeWithTypeOwner`，A1/A2 二选一待施工）；`parser.cheng` 属单写者面；【2026-09-15 复核】该文件现有 64/28 他线未提交 WIP |
| L3 时间第三点（A2 前置） | **施工未动（同文件单写者）；判据已定稿（附录 A.6）；A2 `forest_window_caliber.md` 已交付** | 与 L2 同文件必须串行；并林删除已入 HEAD（`47f53967f`）；【2026-09-15 复核】埋点 `after_typed_ir_expr_layer_rebuild` 在 `.rebuild/s1b_step3/r9/gate/*.stderr.txt` 命中仍为 0 ⇒ typed-IR reach 相至今未被观测 |
| L4 语义 oracle | **本席线；已交付用户裁定**：工具源 `2c855f8aff34e19f…`（1131 行）；V0/V1/V2/V2B/V3/**V3F**/V4a/V7/V8/V9 实测通过（**无缓存全量 judge 单步 v3f ≈132 s**；6 步批次总墙钟 388 s —— 旧记「单轮 293 秒」作废）；重录基线 `7995091fa119bb54…`（38 条）与冻结副本**逐字节相同**；judge `checks_pass=45 checks_fail=0 covered=31/31`；`audit_claims.py` **32/32**。未取得：V4b（候选 38/38 `baseline=equal` ⇒ 非误编译器）/V5（前提已变）/V6 私账本无；工具残余 F4/F5/F6 与残余②/`anchor=rc_only` **披露未修** | `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/semantic_steps/**`、`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/evidence/semantic_run45.log`、`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/ruling_numbers_check.md`；裁定入口 `docs/cheng-rsi-acceptance-ruling.md` |
| L5 C1/C2 口径 + 档 3 | **口径主链可审，但现役判定为 `INCONCLUSIVE_DEP`（无 PASS）**：cdomain 档 0/1、A9b p 腿皆 `missing_phase_readings`（C 链成功编译 0 逐相行），n/n0 腿 PASS；**判词顺序偏差**（实现 `RsiCdMeasurementVerdict:184-198` 先判 `over_hard_gate`、`RsiCdC2Verdict:205-220` 后判基线，合同 `:41-43` 相反且实现注释与代码不符）⇒ 裁定项 2(a)；**50MB 逐相贴线未接线 RSI 运行期**（工具 `phase_line_check.py:78`）⇒ 裁定项 2(b)。档 3：`Open(3)` 在 `types.cheng:131-132` **机械恒 false**；默认门 44 份/0 份 rc=0/最好 136/234，达 234 的 81 份**全抬门**；**P-a 已修并验证**（tier3 envList 补 `CHENG_COMPILER_CSG_STDERR=1`，`compiler_domain.cheng:296`；CLI 重建 rc=0 + cdomain 判词不变）；P-b 与三缺口（forest 四判据/50MB/P5）按 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/tier3_gap_plan.md` 待裁定后施工 | 账本 §6.1w/§6.1x/§6.1y/§6.1cm/§6.1cq；`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/{tier3_prereq_recheck,tier3_gap_plan,c1c2_contract_delta}.md`；【2026-09-15 复核·账本 §6.1dg/§6.1dj】裁定项 2(a)/2(b) 的施工补丁**已预置未应用**：`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/patches/c1c2_order_contract.patch`（7/1）、`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/patches/tier3_50mb_wiring.patch`（15/0），`git apply --check` 均通过，落点同为 `src/rsi/compiler_domain.cheng`（B1 单写者面） |
| L6 自烤理论发射接线验证（A7） | **A7b 窗口已过：补丁真编译暴露 4 处硬缺陷（D1–D5）并修复，`dispatch_min` 烤制 rc=0 / 金丝雀 rc=0 / 44 键断言 PASS / 树逐字节还原（附录 A.1）；234 源发射验证未完成。判据仪器已实测就绪（44 键三态 fail-closed，§6.1co），载具三次重烤皆卡在内核前沿**：live src 607 s 撞 `executable call unresolved callee=share`@`cleanup_cfg.cheng:836`；HEAD 快照不可编（缺约 600 文件）；b2 快照 2030 s 撞 `typed expr: resolved call missing concrete type … target=memRefCount`@`:14387`。S6 与烤机已链式（`docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/chain_bake_s6.sh`，产物镜像 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/evidence/a7s6/`）；抬门 4 GiB 为**诊断轮**并落 `MARKER.txt`；【2026-09-15 复核·账本 §6.1di】第四/五试（`kd_b19probe` + f4line 烤根）`bake_rc=2 wall=263s` 同停 `compiler csg: TypeArena resolution authority failed source_index=13: typed expr type arena: nominal declaration is not visible producer_source=13 name=Result` ⇒ **五试五败、四类判词**（`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/evidence/a7_bake/bake_run9_{compiler,wrapper}.log`） | `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/evidence/a7_bake/**`、`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/a7_snapshot_plan.md`、`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/a7s6_runbook.md` |
| L7 语料墙解冻 + 纯载具 | **墙经四枚驱动复测仍在、无位移**：`kd_d7`/`kd_b1701`/`kd_b18probe`(`d38ac2dd…`)/`kd_b1801`(`290fe708…`) 上 c1/c3 恒 `bin=no`，`PROBE_RESULT` 两行源 sha 逐字相同；他线最新前沿已推进到 `typed expr: node origin proof is missing or contradictory`（B18 线），本席语料墙未随之越过。档 1 门已开、档 2/3 恒 false | `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/evidence/wall_{probe_latest,b18probe,b1801}/`、`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/a9_cheng_chain_wall_repros.md`；【2026-09-15 复核】HEAD `50d0d7428`（09-14 09:13，B19）提交信息称已根修 kind=1 裸 if 关键字行墙（§3.3 W2），09-14 20:04Z 复测只覆盖 c1/c3，c6 未在 ≥B19 驱动上复测；W1 在 `ecef7d13c`（09-15 11:04）提交信息中仍列「待 PE1 族清偿」；账本 §6.1dk：第 7 枚驱动 `kd_b1901`（B19 线全量，sha `10fb01a1…`，2026-09-14T00:28Z）c1/c3 仍 `bin=no`（`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/evidence/wall_b1901/run.log`）⇒ 累计 7 枚驱动 W1/W3 无位移 |
| A5 / A8 C2 口径 patch | ✅ **已落树（未编译）** | A5 patch `7733be10…`、A8 三方同 sha `ac6a23e7…`（裁定保留 12/3/9 + `peakBytes<=0` 收口）；【2026-09-15 复核】`src/tools/rsi_gate.cheng` 237/53、`src/rsi/compiler_domain.cheng` 855/33（与 B1 并集）未提交；`805306368` 字面量 0 处、"1GiB" 注释 0 处（§四.1）；运行期判词 V0–V8 待槽 |
| A6 语料档 3 合同 | ✅ **已交付** | `docs/campaigns/2026-09-07-pure-cheng-rsi/corpus_tier3_contract.md`（B1 与附录 A.8 P4 均引用之） |
| A9a 协议行转发 + env 透传 | ✅ **已落树（未编译）** | `src/rsi/compiler.cheng` 42/2（源 sha `bd15bddd…`；HEAD 基 patch `3cade468…`、活树快照 `066a8f68…`）；编译期风险见附录 A.9 第 2 条 |
| A9b 三腿 | **已跑到判词（非 PASS）** | n / n0 PASS，p `INCONCLUSIVE_DEP`（`phase_rows=0`，载具 C 链）；单窗口 62 s；账本 §6.1w/§6.1x；解锁条件见 §3.3 |
| B1 语料档 3 实现 | ✅ **已交付（未编译）** | 09-13 交付：四文件 835/33、5/3、24/5、164/0；A5 保全审计 `A5_ADDED_MISSING_FROM_LIVE=0`、`MY_DELETIONS_THAT_ARE_A5_ADDED_LINES=0`；V0–V6 待槽。【2026-09-15 复核】`src/rsi/types.cheng` 已随 `4d46eba6d`（09-13 13:54）入 HEAD，`src/tests/rsi_contract.cheng` 相对 HEAD 无差异；`compiler_domain.cheng` 855/33、`proposal.cheng` 5/3 仍未提交 |
| A3 / A3′ 逐相贴线检查器 | ✅ **已交付** | `tools/phase_line_check.py`（sha256 `f4ab22bc…`，673 行；`--audit-dir` 普查 `MISMATCH` 71/114）；接线进 `gate_run.sh` / `check_acceptance.py` 属内核在飞件，未做（附录 A.2） |
| B2 判据机械件托管 | ✅ **已交付（未 commit）** | `docs/campaigns/2026-08-31-kernel-userpath/design/judgement_machinery_custody.md` + `docs/campaigns/2026-08-31-kernel-userpath/frozen/`（435 件；`verify_frozen.sh` 433/433，`CUSTODY_INTACT_SOURCE_DRIFTED`）；`.gitignore` 反忽略已加、未提交；【2026-09-15 复核】`docs/campaigns/2026-08-31-kernel-userpath/frozen/` 仍未跟踪；本文三份文档（fusion-plan / acceptance-status / acceptance-ruling）16:11 stage 后被他线 commit `3f959dba5`（16:36）顺带带入 HEAD（附录 A.5、§九 T05） |
| B3 驱动身份复算 | ✅ **已交付** | `tools/driver_freshness.py`（sha `7ac9fe34…`，797 行；4 世代冻结根逐字节复现），见附录 A.8 |

**总卡点（一句话）**：L4 已交付裁定；**L5/L6/L7 的剩余项全部收敛到同一处内核前沿** —— 逐相仪器只在 Cheng 链存在，而 Cheng 链编不动语料与 A7 载具（附录 A.14）；解锁权在内核线，已列为账本 §7-8 与裁定书「跨项唯一阻塞（三条出路请择一）」。
**同一文件单写者（硬）**：`src/core/lang/parser.cheng`（L2↔L3）、`bootstrap/cold_parser.c`（L2↔L6 的槽位）、三份共享热文件（`cheng_cold.c` / `primary_object_plan.cheng` / `typed_expr.cheng`）改动前必查 mtime 静默窗口。

### 3.3 内核墙清单（唯一登记处；附录 A 各条里"两道 / 三道 / 两族墙"的措辞一律以本表为准）

来源两种，逐行标明：`实测` = 本文/本席在具名驱动上跑出的判词；`HEAD 提交信息` = 只读自 `git log`，**未在新驱动上复测**。

| # | 判词串（逐字） | 最小复现 / 触发面 | 领地 | 最新观测 | 状态（2026-09-15） |
|---|---|---|---|---|---|
| W1 | `compiler parser receipt: manual consume function identity drift` | c1 = `import std/strings` + `return 0`；c5 = `import std/strutils` 同判；c0（无 import）通过 ⇒ 触发面 = std 导入闭包内的**声明本身**（无需调用泛型） | receipt（B7 只清了 W6，未清本条） | 实测 `kd_b1701` 09-14 20:04Z `bin=no`（附录 A.18）；实测 `kd_b1901`（第 7 枚，2026-09-14T00:28Z）`bin=no`（账本 §6.1dk）；HEAD 提交信息 `ecef7d13c`（09-15 11:04）仍列「P9 最小实证 import std/system→manual consume identity drift，待 PE1 族清偿」 | **在**（7 枚驱动无位移） |
| W2 | `compiler parser receipt: normalized expression parser node missing exprIndex=5 … surface=if`（kind=1 `IfKeyword`） | c6 = `import std/os`；表达式位单行 `let x = if … else …` 两条认领路都不中，候选带入源 `src/std/buffer.cheng:50`（附录 A.14 位点图） | receipt / parser 归一化层（B16→B19 线） | HEAD 提交信息 `50d0d7428`（09-14 09:13 本地 = 01:13Z，B19）「receipt kind=1 裸 if 关键字行墙根修」；7 枚驱动的探针**只跑 c1/c3**，c6 从未复测；`kd_b1901`（00:28Z）烤成早于该提交，是否含修复未钉 | **待在含 B19 修复的驱动上复测 c6** |
| W3 | `typed expr value definition: producer lacks exact type or ownership proof` | c3 = 无 import 的 `range` / `int64()` ⇒ **与 import 无关** | typed_expr | 实测 `kd_b1701` 09-14 20:04Z `bin=no`；实测 `kd_b1901` 00:28Z stderr 末行逐字同（账本 §6.1dk） | **在**（7 枚驱动无位移） |
| W4 | `typed expr: call declaration static argument type unavailable name=Sha256 line=4 …` | c4（附录 A.14） | typed_expr | 仅 09-13 登记，未随 09-14 复测 | 未复测 |
| W5 | `compiler parser receipt: normalized expression parser node missing exprIndex=8 kind=21 line=585 surface=continue …` | 生成器修复后的候选在 `kd_a7v9` 上（附录 A.13）；`kd_a7v9` 烤成早于 B6 根修 | receipt（证据总账 §8.73） | 实测 `kd_a7v9`（09-13） | 需在 ≥B6 驱动上复测 |
| W6 | `compiler parser receipt: generic declaration header invalid`（`compiler_parser_receipt.cheng:6914`） | 09-13 时的现役前沿（附录 A.12） | receipt（B7） | 内核总账 §8.76：B7 已清 | **已清** |
| W7 | `typed expr: frozen module const query before build-index seal` | B7 之后的新前沿（内核总账 §8.76） | typed_expr | 内核线记录 | 按内核总账 |
| W8 | `typed expr: node origin proof is missing or contradictory`（非 call 根，`parser_node=-1`） | 单行 `let … = if … else …` 补认领臂之后的下一道（附录 A.14 位点图告警）；原始件 `.rebuild/b_line/b16_b16_repro_let_if_ternary_b1701.stderr.txt` | typed_expr（B18 线） | B18 线 09-14 05:59 实测（附录 A.19） | **在** |
| W9 | A7 载具：`executable call unresolved callee=share`@`cleanup_cfg.cheng:836`（live src，607 s）；`typed expr: resolved call missing concrete type … target=memRefCount`@`:14387`（b2 快照，2030 s）；`compiler csg: TypeArena resolution authority failed source_index=13: typed expr type arena: nominal declaration is not visible producer_source=13 name=Result`（第四/五试，`kd_b19probe` + f4line 烤根，263 s） | 234 源载具重烤（L6） | 内核 typed-expr / CSG 前沿 | 实测五试五败、四类判词（§3.2 L6；账本 §6.1di） | **在** |

**解锁条件（唯一）**：W1 与 W2/W3 族清掉后，`A9_LEG_COMPILER=<新 kd_*>` 一行复跑 A9b 三腿，cdomain 随之可达 PASS；在此之前 A9b-p / cdomain / 档 3 的判词一律 `INCONCLUSIVE_DEP`（不得写成 PASS 或 FAIL）。

## 四、共享仪器（单一权威，禁第二份）

1. **门值与逐相锚**：只允许 `tools/memory_model_limits.sh` 一处定义；RSI 侧 `--rss-limit` 与 C2 判据必须从同一常量派生（09-13 现状：`rsi_gate.cheng:272/315`、`compiler_domain.cheng:123` 写 `805306368` 字面量、`:471` 注释写 "1GiB"；**【2026-09-15 复核】A5 已落树**：`src/rsi/**` 与 `src/tools/rsi_gate.cheng` 字面量 0 处、"1GiB" 0 处，派生点 `rsi_gate.cheng:325-338`、`compiler_domain.cheng:120-127` 读 `CHENG_MEMORY_MODEL_LIMIT_BYTES=`，读不到 = 硬失败）。
2. **语义锚**：产物字节 sha 因 Mach-O 每进程随机 uuid 不可用、map sha 受 jobs 布局影响 ⇒ **唯一可用锚 = (运行 rc, stdout sha256)**（已实证）。B4 与 RSI 语义指纹必须合并成同一实现，不允许两套。
3. **账本**：kernel 每把刀 = RSI 编译器域一次试验（候选 = patch 集，试验 = 门禁跑，判词 = 逐相 + 语义），落同一套哈希链事实；不新造日志格式。
4. **读数纪律**：只可同窗口相对比较；`d_live` 找持有者、`rss` 找峰值贡献者，不可互换；生命周期类读数**跨宿主作用域**取；抬门轮一律 `diagnostic`。
5. **仪器一致性普查（2026-09-13，对全部 9 件新工具实跑）**：逐件 grep `memory_model_limits` 与字面量 `805306368` ⇒
   - **合规**：`phase_line_check.py`（3 处引用/0 字面量）、`a9_run_slot_probe.sh`（3/0，其唯一字面量在 usage 文本里、实际值 `:103` 从权威件 `source` 取）、`a7_assert_emit.py`/`a7_preconditions.sh`/`a7_apply_revert.sh`/`driver_freshness.py`/`tier3_patch_audit.py`/`a9_assert_phase_rows.py`（均与本口径无关）。
   - **当场修掉一处（本席自己的工具）**：`cited_round_audit.py` 原内嵌 `GATE = 805306368` ——**这正是我一直在禁的第二份权威**。已改为 `authority_gate()` 从 `tools/memory_model_limits.sh` 解析 `CHENG_MEMORY_MODEL_LIMIT_BYTES`，**读不到/不唯一 = `INPUT_ERROR` 硬失败**；字面量 `grep -c` 由 2 → **0**，重整后复跑判词不变（49 token / 20 有回执 / default 9 / diagnostic 11 / 无误引）。
   - **当场补齐（原"待补"项）**：`a7_assert_emit.py` 现已断言 `theory_emit_hard_gate_bytes` **等于**权威常量（`authority_gate()` 从 `tools/memory_model_limits.sh` 解析，读不到/不唯一 = `INPUT_ERROR` 硬失败），不再只查"非零"。**已实测**：gate==权威 ⇒ PASS；gate=999 ⇒ FAIL 并打印 `theory_emit_hard_gate_bytes=999 != authority(…)=805306368`。新 sha256 `99440cca…`（`REPO` 深度同时修正：本工具比 `cited_round_audit.py` 深一层，首版少算一级目录——该 bug 被自测当场抓出，属"工具自己的口径错"第 N 例）。
6. **口径陷阱登记（本文内点名者的唯一登记处；原「第 8 / 第 9 个」序号作废——1–7 未在任何文档登记）**：
   - 门标签写死 `gate=default(768MiB)`，与 `rss_guard_env` 无关 ⇒ 抬门轮自称默认门（附录 A.2 F1）。
   - 同一"编译内存峰值"三口径 `resident` / `footprint` / `enforced = max(两者)`，guard 按 `enforced` 杀（附录 A.4）。
   - ④ 本进程 `rss=` 与 ③ 进程树峰不同作用域，不得直接比门线（附录 A.4）。
   - `max_csg_rss` 是"全 stderr 上包络"，不是 `^csg_mem` 族上包络（附录 A.4）。
   - `theory_emit_rss_peak_bytes` 标签写 `ru_maxrss`，Darwin 上实为 `phys_footprint` 瞬时采样（附录 A.4 ⑤）。
   - 路径 ≠ 内容：同代/可复现判词只能绑 CID（附录 A.8）。
   - `git diff` 输出的 `index <old>..<new>` 缩写长度不同会造成假 DIFFERS，对账须剔除 `index ` 行（附录 A.7）。
   - `checks_pass` 系统性少 2，旧引用一律 +2 读（附录 A.18 F3）。
   - `SEMANTIC_DIVERGENT` 一词同时覆盖"真回归"与"载具编不动"，只能看逐条 `compile_rc`（附录 A.15）。
   - `compile_theory_parallel_limit_ms` 是并行效率倒数，不是算法下限（§1.2）。
   - 「森林窗 <120 s」判据随并林删除失去判别力（§1.2、§二 ⑥）。
   - 「exe sha 相等」在本产物族恒不可满足（承诺块两摘要 + 末 32 B 每次不同），只能用两半判据（附录 A.12）。

## 五、对两份文档的最小接线（propose → 用户确认 → apply）

| # | 文档 | 改动 | 状态 |
|---|---|---|---|
| 1 | `docs/cheng-plan.md` §5.7.15 | 由"0.5–1h 协调"升级为指向本文的车道矩阵；⑮ 由"RSI 等门面"改为"kernel 出候选、RSI 出准入" | 本轮落（见该节新增段） |
| 2 | `docs/cheng-plan.md` §七-1 | `compile_theory_parallel_limit_ms` 的"口径待修"补上定性结论：**后验并行效率折算，不得作理论边界**；理论边界改用 §1.2 的 `T_floor` | 本轮落（见该节新增行） |
| 3 | `openspec/proposals/pure-cheng-rsi.md` §2.1 / §8.2 | ① C2 帽语义改双判据（硬门 ∧ 回归帽），越界基线判病态基线；② C2 必报逐相；③ 新增语料档 3 = 234 源自烤；④ 语义锚与 kernel B4 合并 | 本轮落（见 §2.1 新增段） |
| 4 | `docs/campaigns/2026-09-07-pure-cheng-rsi/task_plan.md` | 解锁面拆成 L1/L4/L5 三条可并行项（不再整条挂在 kernel 墙上） | 本轮落；【2026-09-15 复核】该文件 `:29` L1 仍为 `[ ]`（L4/L5 已 `[x]`），与 §3.2 不一致，待回填（本文不改它） |

**待同步到兄弟文档（本文只登记，不改它们）**：
- `docs/cheng-rsi-acceptance-status.md` §0 / §6.1bb 仍写「V3F 单轮 293 秒」，本文 §3.2 L4 已作废该数（无缓存单步 judge ≈132 s、6 步批次 388 s）；同文档写「两道墙 / 五枚驱动」，与 §3.3 墙清单口径不一。
- `docs/campaigns/2026-09-07-pure-cheng-rsi/task_plan.md:29` L1 仍为 `[ ]`，本文 §3.2 已记「已交付」。

## 六、排期（依赖序）

```text
并行组 A（立即可开，互不阻塞）   L1 时间模型 ∥ L4 语义 oracle ∥ L5 口径与档 3 ∥ L6 抢槽验证
串行组 B（同文件单写者）         L2 G(k) 收口 ──▶ L3 region 第三点 + S1b
收口组 C（受 B 解锁）            L7 档 1/2 解冻 ──▶ 纯载具 A/B（M1/M2/M4 接线）
发布组 D（受 B+C）               `cheng-plan.md` §6.2+§6.2.1 真门达标 ──▶ GEN2/GEN3 固定点 ──▶ cgroup 双口径回执
```

**判据成立条件（可机械判定）**：`rc=0` ∧ 树峰 ≤805,306,368 B ∧ **各相贴线（差 ≤50 MB，未钉项显式标注）** 三判据同时成立；缺任一读数一律 REJECT。

### 6.1 原子任务分解与派单（2026-09-13；文件面互斥，可同时开工）

拆解原则：**每个原子任务的交付文件集合两两不相交，且不碰内核线在飞文件**（`src/core/lang/parser.cheng` / `bootstrap/cold_parser.c` / `bootstrap/cheng_cold.c` / `primary_object_plan.cheng` / `typed_expr.cheng` / `tools/memory_model_limits.sh`）⇒ 九条（A1–A9）可并行，无需互相等待。

| 任务 | 车道 | 交付文件（独占） | 动作 | 判据 |
|---|---|---|---|---|
| **A1** | L1 | 新建 `docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md` | 把 `T_floor(相 p)=W_p/B_eff(p)+n_p×c_p` 落成可复算逐相模型；对 234 源现有实测对账；给 region 第三点**可证伪预测** | 每项数字绑原始件；对不上写"对不上+判别方向"；未钉项列测量清单 |
| **A2** | L3 前置 | 新建 `docs/campaigns/2026-08-31-kernel-userpath/design/forest_window_caliber.md` | 用现有日志把三个候选埋点对口径全部算出，裁定唯一口径 | 数值绑"轮次+驱动+文件:行"；不可算的如实写"缺什么读数" |
| **A3** | 判据机械臂 | 新建 `tools/phase_line_check.py`（+ 可选同目录 SELFTEST.md） | 逐相贴线机械检查器；锚从 `memory_model_limits.sh` 解析；未钉相输出 `UNPINNED`；缺相硬失败 | 3 负例 + 1 正例自测，正例两次逐字节相同 |
| **A4** | L4 | 新建 `src/tools/rsi_semantic_regression.cheng` + `docs/campaigns/2026-09-07-pure-cheng-rsi/design_semantic_regression.md` | 31 格任务域做成"编译器二进制 → 语义等价判决"门；与 kernel B4 合并为唯一语义锚 | 纯 Cheng/零 `@importc`/argv 直发；**本轮不编译**，交付待槽位验证清单 |
| **A5** | L5 | 改 `src/rsi/compiler_domain.cheng` + `src/tools/rsi_gate.cheng` + `docs/campaigns/2026-09-07-pure-cheng-rsi/compiler_domain_c1c2_contract.md`；patch 双份 | C2 三合一判定（硬门 ∧ 回归帽 ∧ rc=0）、病态基线拒收、抬门轮隔离、常量单点派生、修 `:471` 注释背离；r2 = C2 峰值改 **成功轮 max**（回执留 min-us 轮峰值与 max 双值）+ 合同 C1 配对文案对齐实现（12/3/9） | `patch_preflight.py` PASS + `git apply --check` 正反双向 + 树内 diff 与 patch 双份**三方同 sha**；**本轮不编译** |
| **A6** | L5 前置 | 新建 `docs/campaigns/2026-09-07-pure-cheng-rsi/corpus_tier3_contract.md` | 语料档 3（234 源自烤）冻结测量合同 | 规模数字回原始件核对；判据直接引 `cheng-plan` §6.2/§6.2.1 不另立 |
| **A7** | L6 | `docs/campaigns/2026-08-31-kernel-userpath/patches/selfbake_theory_emit.patch`（17,549 B，2026-09-11 冻结；**当前未应用**） | 自烤理论发射接线验证（§⑥ 1–7） | 三条前提见附录 A.1；**须静窗 + 编译槽位**，当前 C2 线在飞 ⇒ 不排队、不抢槽 |
| **A8** | L5 收尾 | 改 `src/rsi/compiler_domain.cheng`（A5 已产 patch，同一文件面） | C2 峰值取值口径：`bestPk` 现绑 C1 最优轮 ⇒ 改判据取值 = **成功轮峰值 max**，回执同时留 min-us 轮峰值与 max；合同 C1 配对文案（"best-of-5 容 1 败" vs 实现"12 尝试/≥3 成/failCount>9 拒"）同步为实现现势 | 与本轮一致：`patch_preflight` PASS + 双向 `git apply --check`；**不编译** |
| **A9** | L5 运行时 | **范围已更正**（见附录 A.3）：`src/rsi/compiler.cheng` 转发子编译器逐相行到自身 stderr（代号 A9a，可先出 patch），再于槽位内实测（A9b） | 逐相行可得性 + 嵌套编译 env 传播 | C2 在接线前恒 `missing_phase_readings`（fail-closed 正确后果）；**禁止**放宽"逐相行≥1" |

### 6.2 第二波（2026-09-13，同为不占槽原子任务）

| 任务 | 交付（独占） | 动作 | 判据 |
|---|---|---|---|
| **B1** | 改 `src/rsi/types.cheng`、`src/rsi/compiler_domain.cheng`（**双写后 = 唯一写者**，见附录 A.7；须保留 A5 的 `RsiCdC2Verdict`/`enforced` 链）、`src/rsi/proposal.cheng`、`src/tests/rsi_contract.cheng`；patch 双份 + **活树快照 patch** | 语料档 3 实现：索引空间 2→3、档 3 清墙前 `Open=false`、CID 按 A/B 腿成对冻结、`RsiCdBakePairedInto` 补"CID 全等 + 逐相账齐全"收尾检查点 | 逐条对齐 `docs/campaigns/2026-09-07-pure-cheng-rsi/corpus_tier3_contract.md`；`patch_preflight` PASS + 双向 apply；**不编译**；清单脚本落 git 可追踪路径 |
| **B2** | `docs/campaigns/2026-08-31-kernel-userpath/design/judgement_machinery_custody.md` + `docs/campaigns/2026-08-31-kernel-userpath/frozen/`（含 `verify_frozen.sh`） | 清点 `.rebuild/s1b_step3/` 全部判据机械件，按 G（git 可追踪）/D（可再生）/U（不可再生）三态分级，抢救 U 并留 sha256 清单 | `verify_frozen.sh` 当场跑通；**只读 `.rebuild/`，禁删禁移** |
| **B3** | `tools/driver_freshness.py` + SELFTEST | 驱动**运行期冻结源快照**身份复算与"当前树同代否"判定（SAME_AS_WORKTREE / DIFFERS / UNAVAILABLE） | 身份字段逐个点名出处；缺字段硬失败；5 例自测 PASS + 独立进程逐字节确定性 |
| **A3′** | 追补进 `tools/phase_line_check.py` | 新增 `--audit-dir` 整目录门口径普查（共用同一套解析，**禁第二份口径实现**） | 真目录跑出 MISMATCH（**背离 71/114**）+ 全 unset 小目录跑出 OK + 两次运行逐字节相同 |


**未派单（有主）**：L2 `G(k)` 收口 → L3 region 第三点 + S1b = 内核 B/C 线在飞（`parser.cheng` 单写者）；L7 档 1/2 解冻与纯载具 A/B 受 L2/L3 解锁；A9b 待槽。【2026-09-15 勘误】A9b 已跑到判词（n/n0 PASS、p `INCONCLUSIVE_DEP`），见 §3.2。

**验收纪律**：A1–A6、A8、A9a 全部是"不编译、不占槽、不碰内核热文件"的任务；任何"通过/更优"判词都必须能指到本轮新生成的产物，拿不到就标未验证。

### 6.3 施工日志归档

原 §6.2、§6.4–§6.20 与 §6.1 的 A7 附文已按时间序迁入**附录 A**（编号对照见附录开头）；其中一切状态措辞以 **§3.2** 为准，2026-09-15 的更正以【2026-09-15 勘误】/【2026-09-15 复核】标出。

## 七、红线（继承 §七 + 约束卡，违者判词无效）

1. 抬门（`CHENG_PARENT_RSS_GUARD=1` / `--rss-cap-mib` 覆写）**只许用于发现缺陷**，全部标 `diagnostic`，其运行状态本身即病态证据，**不得计入任何达标结论**。
2. **禁止**用"冻结基线 × 3/2"把越界状态判为可接受；基线自身越门 = 病态基线，先消解再谈改进。
3. **禁止**为凑绿放开守卫、跳过守卫、抬高门；门值只允许改 `tools/memory_model_limits.sh` 一处且须用户裁定。
4. **禁止**用未钉模型项（待钉区①–⑤）当 0 或用估计值充数；按源/按行累积的结构必须给 234 源全量外推，**外推超门即缺陷**。
5. **禁止**在 RSI 侧用第二个语义锚、第二套内存判据、第二种日志格式。
6. 探针/补丁纪律沿用 `AGENTS.md` 工程规范 10（补丁预检 + 每轮金丝雀 + 只用 `git apply -R` 撤销）。

## 八、证据指针（不复制，只索引）

- 内存：`docs/campaigns/2026-08-31-kernel-userpath/design/memory_model_constraints.md`、`docs/campaigns/2026-08-31-kernel-userpath/design/deterministic_model_derivation.md` §8.46/§8.63/§8.66/§8.67/§8.69、`docs/campaigns/2026-08-31-kernel-userpath/design/peak_memory_holders.md`。
- 时间：`docs/campaigns/2026-08-31-kernel-userpath/design/deterministic_model_derivation.md` §3.1/§3.3/§⑦-6/§⑦-7/§⑦-8、`docs/campaigns/2026-08-31-kernel-userpath/design/selfbake_theory_emit.md`、`.rebuild/s1b_step3/r9/kd_b102.report.txt`。
- RSI：`openspec/proposals/pure-cheng-rsi.md` §2.1/§5/§8、`docs/campaigns/2026-09-07-pure-cheng-rsi/compiler_domain_c1c2_contract.md`、`docs/campaigns/2026-09-07-pure-cheng-rsi/probes/darwin_authority/DESIGN.md`。
- 门禁与常量：`tools/memory_model_limits.sh`、`tools/user_path_gate.sh`、`tools/beat_c_process_group_guard.sh`、`tools/linux_cgroup_guard.sh`、`.rebuild/s1b_step3/check_acceptance.py`。

## 九、正交原子任务矩阵与完成比例（2026-09-15 机械汇总；状态源仍是 §3.2，改状态先改 §3.2 再同步本节）

**规则**
- **原子** = 一个独占交付文件集 + 一组可机械判定的判据；**正交** = 任意两任务的交付文件集不相交（相交者要么合并成一个任务，要么在"依赖/冲突"列标"同文件串行"）。
- **完成比例** = 已满足判据数 / 判据总数。判据只取本文与账本已登记、可机械判定的项；未验证一律记 ✗。车道 / 波次 / 总体 = Σ分子 / Σ分母，每条判据等权，不按工时加权。
- **波次（并行组）**：**W0** 立即可开（不占编译槽、不碰内核热文件）；**W1** 需一次编译槽位（C 链载具即可，无内核依赖）；**K** 内核线（`parser.cheng` 单写者串行，其余按文件分道并行）；**U** 受 K 解锁；**R** 待用户裁定。
- 路径缩写（仅本节表内）：`K/` = `docs/campaigns/2026-08-31-kernel-userpath/`，`R/` = `docs/campaigns/2026-09-07-pure-cheng-rsi/`。

### 9.1 已完成（54/54，只计分母）

| ID | 任务 | 交付文件 | 判据（全 ✓） | 证据 |
|---|---|---|---|---|
| D01 | A2 森林窗口径件 | `K/design/forest_window_caliber.md` | 三候选埋点对口径算出 / §0 裁定唯一口径 | §二 ⑥、附录 A.2 |
| D02 | A6 语料档 3 合同 | `R/corpus_tier3_contract.md` | 合同冻结 | §3.2 |
| D03 | A5/A8 C2 口径 patch 落树 | `src/tools/rsi_gate.cheng`、`R/compiler_domain_c1c2_contract.md`（`compiler_domain.cheng` 段已并入 B1） | 预检 PASS / 双向 apply / 落树 | §3.2、附录 A.7 |
| D04 | B1 语料档 3 实现 + P-a | `src/rsi/types.cheng`（已入 HEAD）、`src/rsi/compiler_domain.cheng`、`src/rsi/proposal.cheng`、`src/tests/rsi_contract.cheng` | 对齐合同 / 预检+双向 apply / 清单脚本入 git / P-a 修并验证 | §3.2 |
| D05 | A9a 协议行转发 + env 透传 | `src/rsi/compiler.cheng` | r1 转发 / r2 透传（42/2 落树） | 附录 A.9 |
| D06 | 生成器 41 处冗余默认初始化清扫 | `src/rsi/generator.cheng` | 落树+预检 PASS+残留 0 / C 链重建 rc=0 + stage3 rc=0 | 附录 A.13 |
| D07 | `--target-env` 注入改父环境 | `src/tools/rsi_gate.cheng`、`src/rsi/compiler_domain.cheng:298-300` | 两处 `--target-env:` 清零 / 注释写明 EINVAL 根因 | 附录 A.11 + 09-15 复核 |
| D08 | A3/A3′ 逐相贴线检查器 | `tools/phase_line_check.py` | 3 负例+1 正例 / `--audit-dir` 普查 | 附录 A.2 |
| D09 | B2 判据机械件托管 | `K/design/judgement_machinery_custody.md`、`K/frozen/**` | 清点分级 / 抢救 U / `verify_frozen.sh` 433/433 | 附录 A.5 |
| D10 | B3 驱动身份复算 | `tools/driver_freshness.py` | 4 世代冻结根逐字节复现 | 附录 A.8 |
| D11 | exe sha 两半判据仪器 | `tools/exe_sha_pair.py` | 自测 7/7 / 负对照判红 | 附录 A.12 |
| D12 | 门口径校验进审计工具 | `K/tools/cited_round_audit.py`、`K/tools/a7_theory_emit/a7_assert_emit.py` | 字面量 0 / gate==权威断言 | §四.5 |
| D13 | custody 规程可执行化 | `K/tools/custody_rescue.py` | dry-run 复现 449/433/10/6 | 附录 A.5 |
| D14 | A7 验证包 + 补丁审计 | `K/tools/a7_theory_emit/{a7_preconditions.sh,a7_assert_emit.py,a7_apply_revert.sh,README.md}` | 前提检测 / 44 键断言 / 应用-撤销 roundtrip / 重烤口径钉死 / 补丁 323/2 六 hunk 审计 | 附录 A.1 |
| D15 | A7b 补丁真编译 | `src/core/tooling/backend_driver_dispatch_min.cheng`（窗口内应用后已逐字节还原） | D1–D5 修复 / `dispatch_min` 烤制 rc=0 / 金丝雀 rc=0 / 44 键 PASS / 树还原 | `K/design/a7b_window_receipt.md` |
| D16 | L4 语义 oracle 工具 + 验证 | `src/tools/rsi_semantic_regression.cheng`、`R/design_semantic_regression.md`、`R/tools/a4/semantic_gate.sh` | 工具+自检 / V0–V3F / V4a+V7–V9 / 基线逐字节+接口 / F1–F3 修 | §3.2 L4、附录 A.15/A.18 |
| D17 | 排队件四处自伤面 | `R/tools/a9/a9b_wait_and_run.sh`、`K/tools/a7_theory_emit/a7_preconditions.sh`、`R/tools/a4/post_wall_verify.sh` 等 9 处取锁件 | A1 v2 显式声明 / A2 只认 rc=1 / A3 `mine &&` 守卫 / A4 两源 `PROBE_RESULT` | 附录 A.18 |
| D18 | A9b 负腿 n / n0 | `R/receipts/evidence/**`（只读判词） | n PASS / n0 PASS | 附录 A.14 |
| D19 | 解锁复验与墙探针套件 | `R/tools/a4/{wall_probe.sh,post_wall_verify.sh,unlock_decisive.sh,chain_bake_s6.sh}` | 四件交付（各 1） | 附录 A.16/A.19 |
| D20 | 协作槽位协议 | `R/tools/a4/semantic_wait_and_run.sh`、`R/tools/a4/wall_probe.sh` | `SLOT_MODE=acquire` 取锁/释放 / 看门狗 `--on-busy pause` 自测 3/3 | 附录 A.17 |

### 9.2 W0 立即可并行，不占槽、不碰内核热文件（5/21 = 24%）

| ID | 任务 | 交付文件（独占） | 判据 | 依赖 / 冲突 | 完成 |
|---|---|---|---|---|---|
| T01 | 时间模型件回填 M6/U8 更正 | `K/design/time_model_structural.md` | ✓T_floor 逐相模型 ✓234 源对账 ✓region 可证伪预测 ✗M6/U8 按附录 A.6 回填（现 `:307/:328` 仍写"新增 stage / 无埋点"） | 无 | 3/4 = 75% |
| T02 | 兄弟文档同步 | `docs/cheng-rsi-acceptance-status.md`、`R/task_plan.md` | ✗293 s → 132/388 ✗两道墙/五枚驱动 → §3.3 口径 ✗task_plan L1 `[x]` | 账本文件属 RSI 线单写者 | 0/3 |
| T03 | `post_wall_verify.sh` 缺省驱动去 mtime | `R/tools/a4/post_wall_verify.sh` | ✗缺省改显式驱动必填（或 CID 校验） ✗自测 | 无 | 0/2 |
| T04 | L4 工具残余修复 | `src/tools/rsi_semantic_regression.cheng` | ✗F4 ledger 归因 ✗F5 空选项目志 ✗F6 int32 回绕/`ParseInt` 静默 0 ✗残余②（按 `sem_` 前缀删共享 workDir） ✗`anchor=rc_only` | 无 | 0/5 |
| T05 | Git 入库 | `.gitignore`、`K/frozen/**`、`docs/cheng-rsi-{fusion-plan,acceptance-status,acceptance-ruling}.md` | ✗反忽略块提交 ✗frozen/ 435 件 add+commit ✓三文档入 HEAD（09-15 16:11 stage 后被他线 commit `3f959dba5` 16:36 顺带带入，非本线提交；§九 增量仍在 index 未提交） | 主线 commit（子代理禁） | 1/3 = 33% |
| T06 | RSI 面 596 处冗余默认初始化清扫 | `src/rsi/**`（14 文件）、`src/apps/rsi/main.cheng`、`src/tools/rsi_gate.cheng`、`src/tests/rsi_*.cheng` | ✓patch 预检 PASS 且 `git apply --check`=0 ✗落树 ✗C 链重建 rc=0 ✗Cheng 链夹具编过（受 W1） | **文件面与 A5/B1/A9a 未提交改动重叠** ⇒ 先归档活树快照 patch 或先提交它们 | 1/4 = 25% |

### 9.3 W1 需一次编译槽位，C 链载具即可，无内核依赖（1/8 = 13%）

| ID | 任务 | 交付文件（独占） | 判据 | 依赖 / 冲突 | 完成 |
|---|---|---|---|---|---|
| T30 | RSI CLI 重建 + 运行期核验 | 只读验证；回执落 `R/receipts/` | ✓CLI 由 C 链重建 rc=0（09-13 P-a 轮） ✗A9a `add()` live=0 矛盾在回执中点名消解 ✗A5 V0–V8 非逐相项 ✗B1 V0–V6 | 编译槽（`a7_preconditions.sh` FREE） | 1/4 = 25% |
| T31 | W2 复测 c6 | `R/receipts/evidence/wall_*/` | ✗含 B19 修复的驱动上 c6 `PROBE_RESULT` | 需内核出一枚含 `50d0d7428` 的驱动（只读取用） | 0/1 |
| T32 | W4/W5 复测 | 同上 | ✗c4 on 新驱动 ✗生成器候选 on ≥B6 驱动 | 同上 | 0/2 |
| T33 | 语义 gate 冷跑重建观测缓存 | `.rebuild/semantic/obs_cache/`（scratch）+ 镜像到 `R/receipts/` | ✗一次 `--no-cache` 全量并镜像 | 编译槽（单步实测 132 s） | 0/1 |

### 9.4 K 内核线，`parser.cheng` 单写者串行、其余分道并行（2/23 = 9%）

| ID | 任务 | 交付文件（独占） | 判据 | 依赖 / 冲突 | 完成 |
|---|---|---|---|---|---|
| T40 | L2.1 G(k) 收口 | `src/core/lang/parser.cheng`、`bootstrap/cold_parser.c` | ✗A1 最小判据 15/64/240→0 ✗默认门 rc=0 ✗树峰 ≤805,306,368 ✗逐相贴线 | 无（在跑，owner `c2line`）；量化：单点 2.5 MB 已证 / 缺口 ≈50 MB | 0/4 |
| T41 | L3.2 S1b 收尾 | 同上 + `src/core/tooling/compiler_csg.cheng` | ✓删并林入 HEAD ✓记忆刀落地 ✗`pa_s1b_edit_plan.md` §5 B1–B6+I1/I2 验收 | 与 T40 同文件 ⇒ 串行 | 2/3 = 67% |
| T42 | L3.3 region 三站点缓存 | `src/core/lang/parser.cheng` | ✗per-source remap 缓存落地 ✗森林窗不回归 ✗`after_profile_lookup→after_typed_ir_expr_layer_rebuild` 读数取得 ✗产物字节铁门 | T40 让出文件面 | 0/4 |
| T43 | L1.2 TM1 实测翼 | 回执（总账 §8.75） | ✗234 源逐相系数反算 ✗与 T_floor 对账 | 无 | 0/2 |
| T44 | gate 体检接线 | `.rebuild/s1b_step3/gate_run.sh`、`check_acceptance.py`（先按 B2 托管进 git） | ✗`phase_line_check` 接线 ✗`:46` 标签改读 `rss_guard_env` ✗gate 回执身份字段 14 项 | 内核在飞件 | 0/3 |
| T45 | W1 清墙 | `src/core/tooling/compiler_parser_receipt.cheng`（receipt 线） | ✗c1/c5 `bin=yes` | 无 | 0/1 |
| T46 | W3/W7/W8 清墙 | `typed_expr.cheng` 族（共享热文件） | ✗W3 ✗W7 ✗W8 | 热文件 mtime 静窗 | 0/3 |
| T47 | W9 A7 载具前沿 | `cleanup_cfg.cheng` / CSG TypeArena | ✗`callee=share` ✗`target=memRefCount` ✗`Result` 可见性 | 同上 | 0/3 |

### 9.5 U 受 K 解锁（1/22 = 5%）

| ID | 任务 | 交付文件（独占） | 判据 | 依赖 / 冲突 | 完成 |
|---|---|---|---|---|---|
| T50 | A9b p 腿 | `R/tools/a9/a9b_wait_and_run.sh`（只读运行） | ✗`phase_rows>0` on Cheng 链载具 | T45 + T46 | 0/1 |
| T51 | cdomain 档 0/1 PASS | 只读运行（`unlock_decisive.sh`） | ✗档 0 ✗档 1 | T45 + T46 | 0/2 |
| T52 | 语料档开门与冻结 | `src/rsi/types.cheng`（`RsiCompilerCorpusRel/Open`） | ✗档 1 重冻结 ✗档 2 开门（GEN2 覆盖墙 `identity.cheng parser=7`） ✗档 3 开门 ✗档 3 轮内 CID 全等 ✗档 3 逐相账齐全 | T45 + T46（档 1/2）；T40 + T42 + T51（档 3） | 0/5 |
| T54 | A7 234 源发射验证 | 只读运行（`chain_bake_s6.sh`） | ✗`theory_emit_theory_source_closure_files=234` ✗wall/cpu/比值有值 ✗产物字节不变（`cmp` exe + `.primary.o`） | T47 + 槽位 | 0/3 |
| T55 | A7 补丁正式入 HEAD + S2.1 标签补丁叠加 | `src/core/tooling/backend_driver_dispatch_min.cheng`、`K/patches/theory_emit_rss_metric_label.patch` | ✗源码冻结窗口内应用 + 回执绑定 ✗S2.1 标签补丁叠加（独立 `--check` 正反皆失，须叠在主补丁上） | T54 | 0/2 |
| T56 | exe sha 两臂真实对拍 | 只读运行（`tools/exe_sha_pair.py`） | ✗diag vs hardcut 发射点产物 `GATE_RC=0` | 发射点可达（W6 已清，待复测） | 0/1 |
| T57 | 纯载具 A/B | `R/probes/darwin_authority/` | ✗M1 ✗M2 ✗M4 ✓M3 安装面 | T45 + T46 + 五原语判决 | 1/4 = 25% |
| T58 | GEN2/GEN3 发布准入 | 发布仓 `cheng-fusion` + 三方哈希 | ✗源码冻结 ✗GEN2/GEN3 原始字节固定点 ✗三方哈希绑定 ✗cgroup 双口径回执 | T40 + T42 + T52 | 0/4 |

### 9.6 R 待用户裁定（2/13 = 15%）

| ID | 任务 | 交付文件（独占） | 判据 | 依赖 / 冲突 | 完成 |
|---|---|---|---|---|---|
| T60 | 裁定 L4 验收 | `docs/cheng-rsi-acceptance-ruling.md` | ✗用户裁定 | — | 0/1 |
| T61 | 2(a) 判词顺序 | `src/rsi/compiler_domain.cheng`（`R/receipts/patches/c1c2_order_contract.patch` 7/1） | ✓补丁预置且 `--check` 通过 ✗用户裁定 ✗应用 + C 链重建 | 与 T62/T65 同文件 ⇒ 同一窗口顺序应用（账本：2(a)/2(b) 可任意顺序） | 1/3 = 33% |
| T62 | 2(b) 50MB 逐相贴线接线 RSI 运行期 | 同文件（`R/receipts/patches/tier3_50mb_wiring.patch` 15/0） | ✓补丁预置且 `--check` 通过 ✗用户裁定 ✗应用 + 重建 | 同上 | 1/3 = 33% |
| T63 | 跨项阻塞三条出路择一 | `docs/cheng-rsi-acceptance-ruling.md` | ✗择一 | — | 0/1 |
| T64 | 措辞收口 | `docs/cheng-plan.md` §6.2、`R/compiler_domain_c1c2_contract.md` | ✗外门=`enforced`/内门=`footprint` 写入 ✗配对口径 12/3/9 定稿 | — | 0/2 |
| T65 | 档 3 P-b + 三缺口 | `src/rsi/compiler_domain.cheng`（B1 面）、`R/receipts/tier3_gap_plan.md` | ✗P-b ✗forest 四判据 ✗P5 | 裁定后；与 T61/T62 同文件串行 | 0/3 |

### 9.7 汇总

| 波次 | 分子 / 分母 | 完成 |
|---|---|---|
| 已完成 D01–D20 | 54 / 54 | 100% |
| W0 立即可并行 | 5 / 21 | 24% |
| W1 需编译槽 | 1 / 8 | 13% |
| K 内核线 | 2 / 23 | 9% |
| U 受 K 解锁 | 1 / 22 | 5% |
| R 待裁定 | 2 / 13 | 15% |
| **总体** | **65 / 141** | **46%** |

| 车道 | 分子 / 分母 | 完成 | 任务 |
|---|---|---|---|
| L1 时间模型 | 3 / 6 | 50% | T01、T43 |
| L2 内存 G(k) | 0 / 7 | 0% | T40、T44 |
| L3 时间第三点 + S1b | 4 / 9 | 44% | D01、T41、T42 |
| L4 语义 oracle | 15 / 24 | 63% | D16、D17、D19、D20、T03、T04、T33、T60 |
| L5 C1/C2 口径 + 档 3 | 20 / 36 | 56% | D02–D07、D18、T06、T30、T50、T51、T61、T62、T65 |
| L6 A7 自烤理论发射 | 10 / 18 | 56% | D14、D15、T47、T54、T55 |
| L7 语料墙解冻 + 纯载具 | 1 / 20 | 5% | T31、T32、T45、T46、T52、T57、T58 |
| 仪器 / 托管 | 12 / 18 | 67% | D08–D13、T02、T05、T56 |
| 裁定 | 0 / 3 | 0% | T63、T64 |

**读法**：
- 现在无需等任何人就能动的 = W0 + W1 的 23 条未满足判据（T01–T06、T30–T33），其中只有 T06 有文件面冲突（须先归档 A5/B1/A9a 的活树快照 patch）。
- **关键路径** = T45/T46（W1 + W3/W7/W8 两族墙）→ T50/T51/T52 → T58；平行关键路径 = T40 → T42 → T52/T58（`parser.cheng` 单写者）。U 组 22 条 + R 组 13 条 = 35 条（25%）在这两条链清障或用户裁定前不可动。
- T61/T62/T65 三件补丁全落 `src/rsi/compiler_domain.cheng`（B1 单写者面），裁定后应在**同一窗口**顺序应用并一次 C 链重建，避免再出附录 A.7 那种双写。

---

## 附录 A　施工日志（2026-09-13 → 09-14，按时间序归档；只读）

> 条目正文保留原文（含当时的行号锚与状态措辞）；**状态一律以 §3.2 为准**，2026-09-15 更正以【2026-09-15 勘误】/【2026-09-15 复核】标出。`file:line` 锚为 `b083fc3dd` 时刻的值。

| 附录条目 | 原编号 | 标题 |
|---|---|---|
| A.1 | §6.1 附文 | A7 前提复核 · 补丁内容审计 · 验证包重建 · A7b 首次窗口实测（2026-09-13） |
| A.2 | §6.2 | 判据仪器必须自带门口径校验（2026-09-13 复核发现，缺陷 F1） |
| A.3 | §6.4 | A9 范围更正：缺口不在 guard 标志，而在 RSI 侧丢弃了子编译器的 stderr（2026-09-13 本席只读实测） |
| A.4 | §6.5 | 【本轮新发现】同一个"编译内存峰值"在树里有**三个口径**，C2 现在判的不是 guard 真正执行的那个（2026-09-13 本席在真实 guard 回执上实测） |
| A.5 | §6.6 | 证据脚本入库要求（2026-09-13 自纠：我们自己的脚本此前**全部被 .gitignore 吞掉**） |
| A.6 | §6.7 | L3 的 typed/frontier 埋点对**不需要新增 stage**（2026-09-13 本席读码实测；更正 A1 的 M6） |
| A.7 | §6.8 | 同文件双写事故与单一写者裁决（2026-09-13，**派单失误的复盘**） |
| A.8 | §6.9 | 驱动身份口径勘误 + "路径 ≠ 内容"陷阱（2026-09-13，B3 交付件实测） |
| A.9 | §6.10 | A9b 的第二个隐藏前提：子编译器**未必看得见** `CHENG_PROGRESS`（2026-09-13 本席读码，未钉死但已用"两可皆正确"的修法消解） |
| A.10 | §6.11 | 编译类脚本的两道硬纪律（2026-09-13 事故后固化） |
| A.11 | §6.12 | 【新缺陷】`--target-env` 在 guard 默认模式下**一律被拒**——A5 已落补丁的注入方式不成立（2026-09-13 A9b 实测） |
| A.12 | §6.13 | 【本轮交付】exe sha 对拍判据订正：铁门不可满足，换成两半判据（2026-09-13，S5 原始件实测 + 负对照） |
| A.13 | §6.14 | 【本轮定谳】RSI 生成器发射的候选源码过不了 Cheng 链 `cheng_seed` 门禁（A9b 卡点的真根因） |
| A.14 | §6.15 | 【本轮定论·单一缺口】逐相仪器只在 Cheng 链存在，而 Cheng 链编不动语料 —— A9b 与 C1/C2 被同一处卡住 |
| A.15 | §6.16 | 【本轮交付·L4 对外接口】语义 gate：候选编译器 → 语义等价判词（给内核线的接线说明） |
| A.16 | §6.17 | 【本轮交付】解锁后一键复验套件（面向"内核清墙那一刻"） |
| A.17 | §6.18 | 【2026-09-14 排程口径变更】从"被动等窗"改为"参与协作槽位协议"（可一票否决） |
| A.18 | §6.19 | 【2026-09-14 自身缺陷清算】L4 工具两处真洞 + 本席排队件四处自伤面（均已修，绑原始件） |
| A.19 | §6.20 | 【2026-09-14 收口指针】三验收项的裁定入口 + 事后通路 |

### A.1（原 §6.1 附文）A7 前提复核 · 补丁内容审计 · 验证包重建 · A7b 首次窗口实测（2026-09-13）

**A7b 首次窗口实测（2026-09-13）：原补丁"从未编译过"——真编译当场暴露 4 处硬缺陷**（D1/D2 缺 `@borrows`、D3 借用值传自有形参、D5 `var plan` 回写重绑定破坏 ORC 身份），外加本席 S2.1 的一处跨行字面量错（D4）。逐处修复后：**烤制 rc=0、金丝雀 rc=0、发射块 44 键断言 PASS、树逐字节还原**。全过程与补丁 sha 见 `docs/campaigns/2026-08-31-kernel-userpath/design/a7b_window_receipt.md`。
**这条改写了本文件此前"前置已全部就绪"的判断**：`patch_preflight` + `git apply --check` + 静态 grep **拦不住这一类缺陷**，"未编译即就绪"不成立。**A7 前提复核（2026-09-13，本席实跑）**：
- `git apply --check docs/campaigns/2026-08-31-kernel-userpath/patches/selfbake_theory_emit.patch` → **exit 0**（在当前工作树上仍可干净应用）；`git apply --check -R` → exit 1 ⇒ **该改动当前不在工作树**。
- `docs/campaigns/2026-08-31-kernel-userpath/design/selfbake_theory_emit.md` §①"改动留在工作树、+323/−2"**已过期**：现树该文件 delta = **39/3**，属他线 WIP；`grep -c BackendDriverDispatchMinAppendSelfbakeTheoryLedgerReport` = **0**。
- `.rebuild/theory_emit/`（原始件目录）**已被清理** ⇒ 设计件 §⑥ 引用的 `verify_theory_emit.sh` / `run234_selfbake.sh` / `borrow_repro*` / `MANIFEST.sha256` **全部不存在**（`find . -name 'verify_theory_emit*'` 零命中），抢救件只剩 git 可追踪的 patch 副本。
⇒ **A7 执行前提三条**：① 静窗 + 编译槽位；② 在**源码冻结窗口**内应用 patch（当前树带他线 WIP，贸然应用会改内核线的烤机产物与回执绑定）；③ **先按 §⑥ 清单重建验证脚本**（放进 git 可追踪处，不得再只留 `.rebuild/`）再跑。
⇒ **由此得一条通用纪律**：`.rebuild/` 下的一切都是可清理的；任何"待槽位验证清单"必须把**可执行脚本本身**落在 git 可追踪路径，否则清单会退化成不可执行的引文（本条即为实例）。

**A7 补丁内容审计（2026-09-13 本席实跑，只读）**：
- `git apply --numstat` = **323/2**，只动 `src/core/tooling/backend_driver_dispatch_min.cheng` 一个文件、6 个 hunk；与设计件 §① 记数**一致**（此前的 319/2 是 awk 口径漏计以 `+` 开头的新增内容行，非内容差异）。
- 文档声明的元素**逐个在位**：`AppendSelfbakeTheoryLedgerReport`、`RusageCpuUsWith`、`RusageChildren`、`theoryEmitStartNs`、守卫 `work.reportKind == "" && !work.heldObjectMode`（插在 `preExecutionReport` 装配之后、`work.err = ""` 之前）。
- 失败路径**不静默不兜底**：分母非正写 `unavailable`（不写 `0.000` 冒充测量）；模型构建失败写 `theory_emit_status=error reason=<具体>` 且不改编译 rc。
- **与当前树 WIP 无重叠**：现树该文件 39/3 的改动落在新行 `:401`、`:3227-3261`、`:7538`，与本补丁 6 个 hunk 的锚区（344/2808/3368/3380/6870/7002）不相交；`git apply --check` 复查仍为 **0**。

**A7 验证包已重建到 git 可追踪路径**（`docs/campaigns/2026-08-31-kernel-userpath/tools/a7_theory_emit/`，落实上面那条纪律）：
- `a7_preconditions.sh`（sha256 `054110b2…`）—— 抢槽三条件检测，**已实测**：当前报 `A7_PRECONDITIONS=BUSY reason=lock held by live owner pid=96980`，exit 3。
- `a7_assert_emit.py`（sha256 `9a34d370…`）—— 发射块断言，字段清单**逐字取自冻结 patch 的 Fmt 语句**（37 个 `theory_emit_*` + 6 个 `cheng_cold_chain_compare_*`），非零约束字段 `<=0` 视为缺失（与 RSI C2 的 `peak<=0` 同纪律）。**已实测**：真回执 `--expect absent`→PASS；`--expect emitted`→FAIL（列出 43 个缺失键）；合成全键 fixture→PASS；`closure_files=233`→FAIL；零值→FAIL；重复键→FAIL。
- `a7_apply_revert.sh`（sha256 `51f7d03e…`）—— **应用/撤销安全带**（2026-09-13 新增）：`--apply` 记录应用前 `sha256` 并按 base→fix 应用；`--revert` 按 fix→base 反序撤销并**断言逐字节还原**（不等即 FATAL，缺 state 文件直接拒跑）；`--roundtrip` 在 scratch 自证。**已实测**：roundtrip `before=880d4632… applied=fae6ac97… after=880d4632…` **逐字节还原**——即**该补丁对可以安全地打在带他线 WIP 的共享热文件上并完整撤回**，A7b 最大的操作风险（撤不干净 = 抹掉他线工作）由此变成机械判据。
- `README.md`（sha256 `5bf39237…`）—— S0–S7 执行序 + 未钉项。**重烤口径已钉**（原为未钉项，2026-09-13 读内核线在用的 `.rebuild/s1b_step3/run_step3_round.sh:54-74` 得到，非臆造）：`BAKE_BIN` 默认 `$HOME/.cheng-complete-0910/cheng_cold_v3`，env 四件套 + `BACKEND_JOBS=2`，argv `system-link-exec --root:… --in:src/core/tooling/backend_driver_dispatch_min.cheng --emit:exe --target=arm64-apple-darwin --out:… --report-out:…`；**有效性纪律** = `lease_hits(grep -c 'parent lease unavailable')==0` ∧ rc=0，否则整轮作废。载具实测 sha256 `0c765779…`（3,328,176 B），与 `kd_b102.report.txt` 的 `compiler_executable_sha256` 逐字相同（等式已登记，**机制归 B3 钉**，本文件不替它断言）。
  剩余未钉：单轮 bake wall 未由本包实测；43 键严格性收窄须附真实回执；嵌套编译断言未实现。
- **未执行**：S1–S7 全部（非静窗 + 槽位被他线持有）；本包不声称补丁已生效或发射已成功。

【2026-09-15 勘误】上面「**未执行**：S1–S7 全部」是 A7b 窗口**之前**的状态。A7b 已在窗口内完成：烤制 rc=0、金丝雀 rc=0、发射块 44 键断言 PASS、树逐字节还原（见本条开头与 `docs/campaigns/2026-08-31-kernel-userpath/design/a7b_window_receipt.md`）；**234 源**项（`theory_emit_theory_source_closure_files=234` 且 wall/cpu/比值全部有值）仍未取得——载具卡在内核前沿（§3.2 L6、§3.3 W9）。

### A.2（原 §6.2）判据仪器必须自带门口径校验（2026-09-13 复核发现，缺陷 F1）

- **F1（provenance 缺陷，未修）**：`.rebuild/s1b_step3/gate_run.sh:46` 把摘要首行**写死**为 `gate=default(768MiB)`，与实际 env 无关。全量复核 `r9/gate/*.summary.txt`：`*_raised_*`、`*_ctx`、`*_pool`、`*_ledger` 等**抬门轮全部带 default 标签**（例：`r108_base` 首行 `gate=default(768MiB)`，同文件 `rss_guard_env=3865470566`、`max_csg_rss=1,038,337,464` = 990.2 MiB ⇒ 只可能在抬门下成立）。默认门与抬门的**唯一机器可读判别 = `rss_guard_env=unset` vs 数字**。
- **全量普查（2026-09-13，A3 `--audit-dir` 一条命令实测；本席复核复跑）**：`r9/gate/*.summary.txt` 快照 **114** 份（活目录，随他线写入变化）⇒ 实际口径 **default 42 / diagnostic 71 / unverifiable 1**（`r9g.summary.txt` 缺 `rss_guard_env`），而**标签全部自称 `gate=default(768MiB)`** ⇒ **背离 71 份**，`CALIBER_AUDIT_VERDICT=MISMATCH`（exit 5）。
  > **读数修正**：本文件早先记的"30/30"只是 `*_raised_*` **子集**；全目录口径背离是 **71**（71 个 diagnostic 轮全被标 default）。早期记的"113 份 / 数字 70"同上：113 是旧快照，114 份时数字档增至 71。**同一快照内确定性成立**，跨快照计数不可直接比。
- **强制口径**：任何会输出"通过/达标"判词的仪器（逐相检查器、门禁 checker、RSI C2 记账）都必须先校验 `rss_guard_env` 与 `tools/memory_model_limits.sh` 的 `CHENG_MEMORY_MODEL_LIMIT_BYTES` 一致：不一致 ⇒ 判词只能是 `DIAGNOSTIC`（不得出现 PASS），字段缺失**或重复** ⇒ fail-closed。依据：约束卡第 3 条 + §七.1/§七.2。
- **已落地**：`tools/phase_line_check.py`（sha256 `f4ab22bc…`，673 行）把门口径做成**第一判据**——抬门轮 `exit 4 / PHASE_LINE_VERDICT=DIAGNOSTIC / verdict=PASS 计数 0`，真默认门轮正常判（`r93_default` 实跑 exit 3 = 逐相贴线但待钉区⑤未钉）；新增 `--audit-dir` 整目录普查（**与逐相判定共用同一份 `resolve_gate_summary` 解析，无第二份口径实现**），一条命令即出上表。**该工具可直接用于后续所有轮的门口径体检**；接线进 `gate_run.sh`/`check_acceptance.py` 仍是独立任务（属内核线在飞件，只登记不改）。
- **禁改**：`gate_run.sh`（:46 写死标签）属内核线在飞件，本席与本轮所有子任务一律不动；该缺陷以其原始件与复现命令记档，交内核线修复。
- **被引轮次口径审计（2026-09-13，工具已入库：`docs/campaigns/2026-08-31-kernel-userpath/tools/cited_round_audit.py`，可重跑）**：从 `cheng-plan.md`、本文、`time_model_structural.md`、`forest_window_caliber.md` 四份计划文档抽出 37 个 `r<N>…` token，其中 **20 个能定位回执** ⇒ **default 9 / diagnostic 11**；其余 17 个经人工判读为**非轮次标签**（夹具名 `r8_fixed_len_non_int32_main`、文档名 `r2_closure_ops_map`、驱动名 `kd_r96/kd_r103`、路径段 `r9/` 等），不是缺回执。
  **结论：未发现"把抬门轮当验收证据引用"**——11 个抬门轮全部出自 A1/A2 的**诊断性**表格，且逐条显式标注（`forest_window_caliber.md:91-93` 标"抬门 3.6GiB"`rss_guard_env=3865470566`；`:101-106` 明写"共 23 个带 summary 的轮有 C 读数，全部 `rss_guard_env=3865470566` ⇒ **全部 diagnostic**，不得计入任何达标结论"）。
  ⇒ **F1 的风险定性是"标签不可信、体检缺位"，不是"已经误引"**；但文档每次更新后该审计必须重跑（工具已在库）。

### A.3（原 §6.4）A9 范围更正：缺口不在 guard 标志，而在 RSI 侧丢弃了子编译器的 stderr（2026-09-13 本席只读实测）

**已接好的部分（读码确认，非猜测）**：`guard --phase-trace` 早已接上 —— `src/tools/rsi_gate.cheng:379-380` 与 `src/rsi/compiler_domain.cheng:268-269` 都传了 `--phase-trace:<path>` + `--target-env:CHENG_PROGRESS=1`；guard 侧 `tools/beat_c_process_group_guard.sh:52/3122-3123` 认这个旗标，运行时 `beat_c_process_group_guard_runtime.py:5175-5201` 把**直接子进程 stderr** 的整行写成 `<t>\t<kib>\t<行>`；RSI 侧按第三列含 `phase=` 计数（`rsi_gate.cheng:116-123`、`compiler_domain.cheng:92-99`）。
编译器侧也确实会打印：`backend_driver_dispatch_min.cheng:3530-3536`（`CHENG_PROGRESS`/`CHENG_DISPATCH_MIN_PROGRESS`/`PROGRESS` 任一为真）与 `system_link_exec_pure_main.cheng:180-186,255-268`（`CHENG_PROGRESS` 真值）。

**真正的缺口 = 两条腿的"直接子进程"不同**：

| 腿 | guard 的直接子进程 | 子编译器 stderr 的去向 | 逐相行 |
|---|---|---|---|
| `compiler_domain.cheng`（C1/C2 编译器域） | **编译器本体**（`-- {compilerPath} system-link-exec …`） | 就是 guard 的捕捉面 | **可得**（前提只剩"载具在 `CHENG_PROGRESS=1` 下真打印"这一条待实测） |
| `rsi_gate.cheng` A/M 腿（`:371-388`） | **`rsi` CLI**（`-- {cliBin} run …`） | CLI 内 `RsiCompileCheng` 用 `hostos.ExecFileCapture(…, mergeStderr=true, …)`（`src/rsi/compiler.cheng:13-19`）**把子进程 stdout+stderr 捕获进内存后整个丢弃**（只返回 exit code） | **恒 0** ⇒ 该腿恒判 `missing_phase_readings` |

⇒ **A9a（可先出 patch，不需槽位）**：让 `RsiCompileCheng` 把捕获到的、符合 **`compile_progress ` 协议前缀**的行**转发到自身 stderr**（该前缀是既有协议：guard 逐相面、`host_ops.cheng:730` 消费者都用它；**不是启发式过滤，是协议行转发**）；`CHENG_PROGRESS` 未设时子进程本就不打印 ⇒ 行为零变化。**不改函数签名、不新增第二入口**。
⇒ **同一根因**（"子编译器输出被丢弃"）也是 A4 报的 API 缺口：B4 的"末行判词逐字相同"拿不到。二者应共用同一修法方向，但**本轮只做 A9a 的协议行转发**，A4 的返回面扩展另立任务、不得顺手改签名。
⇒ A5 原先预期的"现役 C 冷链载具预期 0 行"**部分不成立**：编译器域腿的子进程就是编译器本体，逐相行是否可得只取决于载具是否打印，属待槽实测项；而 gate 的 A/M 腿的 0 行是**RSI 侧确定性缺陷**，与载具无关。

### A.4（原 §6.5）【本轮新发现】同一个"编译内存峰值"在树里有**三个口径**，C2 现在判的不是 guard 真正执行的那个（2026-09-13 本席在真实 guard 回执上实测）

**guard 的执行口径（读码，`tools/beat_c_process_group_guard_runtime.py`）**：
```python
:5426  enforced = max(resident_total, footprint_total) if footprint_reader is not None else resident_total
:6232  ... and (rss_limit_bytes == 0 or max_enforced_bytes <= rss_limit_bytes)   # 判定是否越限
:6978-6981 报告同时写 process_tree_resident_peak_bytes / _phys_footprint_peak_bytes / _enforced_peak_bytes
```
⇒ **guard 是按 `max(resident, footprint)` 杀进程的（`enforced`），不是按其中任一个。**

**而三处判断各用各的**：
| 位置 | 用的口径 |
|---|---|
| 外部 guard 执行/判定 | `process_tree_enforced_peak_bytes` = max(resident, footprint) |
| **RSI C2**（`compiler_domain.cheng:59` 取键、`rsi_gate.cheng:392` 取键、`RsiCdC2Verdict` 判定） | `process_tree_resident_peak_bytes` |
| kernel `cheng-plan` §6.1 措辞"内门…Darwin 侧读本进程当下 `phys_footprint`" | 那是**内门**（驱动自建）；外门才是 `enforced` |

**实测四个真实 guard 回执的同轮三值（resident / footprint / enforced）**：

> **原始件在位性（2026-09-13 复核，如实登记）**：表中前两行的 `artifacts/rsi_gate/guard_{a,meta}.report.txt` **当前不在盘上**（`artifacts/rsi_gate/` 现为空目录）；本席的清理清单 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/disk_cleanup_20260913.tsv` **不含**这两个文件 ⇒ 非本席所删（他线清理所致）。**表中读数来自当时的落账，原始件已不可回查**；后两行 `.rebuild/b_line/b3_root/.../cd_g*.greport.txt` 亦为历史路径。**教训**：`artifacts/` 下的 guard 回执也是证据，清理前须先对照引用；本席此后的判词一律把原始件转存到 `.rebuild/semantic/` 或 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/` 并写进审计脚本（`docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/audit_claims.py` 现查 31 项）。

| 回执 | resident | footprint | enforced |
|---|---|---|---|
| `artifacts/rsi_gate/guard_a.report.txt` | 192,856,064 | 101,811,352 | 192,856,064 |
| `artifacts/rsi_gate/guard_meta.report.txt` | 206,241,792 | 115,918,000 | 206,241,792 |
| `.rebuild/b_line/b3_root/src/rsi_work/cd_g00.greport.txt` | 176,963,584 | 86,688,560 | 176,963,584 |
| `…/cd_cand0.greport.txt` | 171,343,872 | 13,287,784 | 171,343,872 |

⇒ 同轮 `resident` 比 `footprint` 大 **1.8×–12.9×**（最小 206,241,792 / 115,918,000 = 1.78）（样本内 4/4 都是 `resident > footprint`，故 `enforced == resident`；**但这是样本巧合，不是恒等式**——一旦某轮 footprint 更大，C2 判的数就不是 guard 杀的数）。

**处置（实现"判据只允许一份"的纪律，非目标变更）**：RSI C2 改判 **`process_tree_enforced_peak_bytes`**（= guard 真正执行的那个上界，且已是报告现成字段，无需新插桩）；`resident`/`footprint` 作为**归因副字段**记入回执（便于分辨"真增长"与"resident/footprint 相对关系翻转"）。**不设 fallback**：该键缺失 ⇒ `missing_peak_reading`（fail-closed，与既有纪律一致）。
**顺带收口 A5 的未验证项 #3**：guard 键名已**在真实回执上核验**——`process_tree_resident_peak_bytes`/`memory_limit_bytes`/`phase_trace_size`/`phase_trace_status` 四个键在四份真实报告里均各命中 1 次，`memory_limit_bytes=805306368` 与权威件一致。
**仍待用户/内核线裁定的一条**：kernel `cheng-plan.md` §6.2 的验收线要不要在文档里同步写明"外门 = `enforced`、内门 = `footprint`，**外门为准**"——这是措辞收口，不改判据。

**口径点名表（全战役唯一登记处；跨口径相除/相比一律无效）**：

| # | 数字 | 产生处 | 作用域 | 语义 |
|---|---|---|---|---|
| ① | `process_tree_resident_peak_bytes` | guard report（`…_runtime.py:6978`） | **进程树** | RSS 峰值 |
| ② | `process_tree_phys_footprint_peak_bytes` | 同上 `:6979` | **进程树** | footprint 峰值 |
| ③ | `process_tree_enforced_peak_bytes` = max(①②) | 同上 `:5426`/`:6980`；判定 `:6232` | **进程树** | **guard 真正执行的门** ⇒ C2 与 `cheng-plan.md` §6.2 只准用这个 |
| ④ | `csg_mem … rss=` / `csg_stage … rss_bytes=` | `compiler_csg.cheng:1677-1681` → `os.ProcessRssBytes()` | **本进程** | Darwin = `ri_phys_footprint` **瞬时采样**；Linux = `ru_maxrss` 高水位（`src/std/os.cheng:1709-1726` **平台分叉**，Darwin 侧注释明写 ru_maxrss 对压缩内存失明、禁用） |
| ⑤ | 理论模型相 `theory_emit_rss_peak_bytes` | A7 补丁 `:61`/`:262`（**未应用**） | 本进程 | 同上④，但标签写成 `process_self_peak_ru_maxrss` ⇒ **Darwin 上名实不符**，已在 A7 包 `README.md` 列为 **S2.1 必改项** |

⇒ **逐相锚（enter 190 / bind 230–250 / profiles 372–392 / forest 750–880 / TypeArena 100–120 MiB）出自 ④**；`phase_line_check.py` 也读 ④ ⇒ **两者同口径、内部自洽**。
⇒ 但 **④ 与 ③ 不同作用域**（本进程 vs 进程树）⇒ **逐相贴线判不出总峰门**：自进程 700 MiB 仍可能因嵌套 provider 子进程把树峰推到 850 MiB。`cheng-plan.md` §6.2.1 的"三判据同时成立"因此必须理解为**两条互补判据**，不得把 ④ 的数与门线直接比大小。
⇒ ~~未钉：④ 的上包络从未单独取过~~ → **2026-09-13 已测**（本席离线对现有 stderr 取 max，零编译）：

**④ 的自进程上包络 vs ③ 的树峰（默认门两轮）**：
| 轮 | ④ 上包络（全 stderr 的 max `rss=`） | ③ 树峰（guard 触发值） | 差值 |
|---|---|---|---|
| `r104_recov` | **830,457,080**（792.0 MiB，`stderr:1732`） | **839,353,592**（800.5 MiB，`guard_line`） | **8,896,512 B（8.5 MiB）** |
| `r93_default` | **824,149,168**（785.9 MiB，`stderr:2480` 的 `merge_release` 行） | 该轮 `guard_hits=1`（rc=125） | — |

⇒ **结论（重要）**：在验收线上，**驱动本进程自己就已经 786–792 MiB、超 768 门 19–25 MiB**，嵌套子进程只再加 ~8.5 MiB。
⇒ 即本条开头的"④ 与 ③ 作用域不同"是**真实但二阶**的问题——**门超线不是子进程造成的，是本进程常驻**；「按模型锚（forest 750–880）贴线合格、按门 RED」的冲突因此**不是口径错觉**，而是目标定义层面必须裁定的那一件事（cheng-plan §二 已记为待裁定）。
⇒ **顺带一条"同名不同扫"的坑**：`gate_r9.sh:74` 的 `max_csg_rss` 用 `grep -o 'rss=[0-9]*'` 扫**全 stderr**，因此会把 `merge_release` 等非 `csg_mem` 族的 `rss=` 一起纳入；只扫 `^csg_mem` 会得到更小的值（r93_default：805,684,400 vs 824,149,168）。**引用 `max_csg_rss` 时必须写明它是"全 stderr 上包络"口径**，不是 `csg_mem` 族上包络。

### A.5（原 §6.6）证据脚本入库要求（2026-09-13 自纠：我们自己的脚本此前**全部被 .gitignore 吞掉**）

**自纠事实**：本会话产出的判据/验证脚本虽然放在 git 可追踪**目录**下，但 `.gitignore:77 (*.py)` 与 `:327 (*.sh)` 是**按扩展名全局忽略**的 ⇒ 下列交付物在 `git status` 里根本不出现，`git add` 会静默跳过，**清理一次就重演 A7 的 `.rebuild/theory_emit/` 蒸发事故**：
`tools/phase_line_check.py`（A3）、`docs/campaigns/2026-08-31-kernel-userpath/tools/cited_round_audit.py`、`…/tools/a7_theory_emit/{a7_assert_emit.py,a7_preconditions.sh}`、`docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a9/{a9_run_slot_probe.sh,a9_assert_phase_rows.py}`（A9a）；B2 的 `docs/campaigns/2026-08-31-kernel-userpath/frozen/verify_frozen.sh` 与 B3 的 `tools/driver_freshness.py` 也会同样中招。

**已修（沿用仓库既有先例）**：`.gitignore` 末尾追加按**包目录**的反忽略块（与 `:353-354` 那条"S1b 证据补丁必须入库（wall154 蒸发事故教训）"同一体例、同一理由）：
```
!docs/campaigns/2026-08-31-kernel-userpath/tools/**
!docs/campaigns/2026-08-31-kernel-userpath/frozen/**
!docs/campaigns/2026-09-07-pure-cheng-rsi/tools/**
!tools/phase_line_check.py
```
**实测**：7 个文件 `git check-ignore` 由 `IGNORED` 全部转为 **trackable**（`.gitignore` 现为唯一新增改动，**未动 index**、未 commit）。
⇒ **通用纪律（补充 A7 那条）**：只把脚本"放进 docs/"不够，**必须验证 `git check-ignore` 返回非零**；否则等于没入库。

**B2 终验（2026-09-13，本席实跑）**：三件 sha 与自报一致（custody 文档 `cf0ac346…` 711 行 / manifest `678495b1…` / `verify_frozen.sh` `1760ec74…`）；我复跑 `verify_frozen.sh` 得 `FROZEN_FILES=433 / SHA256_OK=433 / MISMATCH=0 / ORIGINALS_IDENTICAL=432 / DRIFTED=1`（漂移件 = 在飞被 c2 lane 原地改写的 `b404_w7xfix.ps.tsv`）⇒ `CUSTODY_INTACT_SOURCE_DRIFTED`。
**B2 的两条新发现（采纳）**：① **引文蒸发是系统性的**——树内文档引用的 319 个 `.rebuild/` 路径中 **102 个（32.0%）已不存在**，`theory_emit` 只是首例；② **单点故障**：`check_acceptance.py`（`d88f3463…`，3,897 B，18 处引用）是全仓唯一机械验收判词计算器，无 tracked 孪生、无文档内嵌，而"禁第二份"的纪律意味着**丢失后不允许旁路再造** ⇒ 它是全战役最不可失的一件。
**本席据此补做**：`docs/campaigns/2026-08-31-kernel-userpath/tools/custody_rescue.py`（把 custody 文档 §11 步骤 1–6 从规程变成可执行件；默认 `--dry-run` 零写入）。dry-run 复现 B2 独立普查 **449/433/10/6**，与 `--coverage` 的 `449/433/2U+4G+10Z` 逐项吻合。
**仍需用户动作**：`docs/campaigns/2026-08-31-kernel-userpath/frozen/` 目前是**未跟踪目录**，必须由主线 commit 才真正进 git（子代理与本席均禁 commit）。

**2026-09-13 复查补录（该纪律抓到第二例）**：B2 的判据机械件抢救区 `docs/campaigns/2026-08-31-kernel-userpath/frozen/` 共 **435** 件，其中 **63 件仍被忽略**——**全部是 `.patch`**（`.gitignore:229 *.patch`），因为我先前把 `!…/frozen/**` 那条换成了更宽的 `!docs/campaigns/**/*.{py,sh}` 时**把 frozen 整树那条删掉了**，而 `*.patch` 不在那两个后缀里。
⇒ 追加 `!docs/campaigns/**/frozen/**` 后复查：**ignored 0 / 435**。**教训**：抢救区的反忽略必须覆盖**全后缀**，不能只按"脚本后缀"想当然——本例 15% 的抢救件（含大量修复补丁）差点白救；而 `.patch` 恰好是第 14 轮 A7 base 补丁那一次的同一类。

### A.6（原 §6.7）L3 的 typed/frontier 埋点对**不需要新增 stage**（2026-09-13 本席读码实测；更正 A1 的 M6）

A1 的 `docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md` §6 提议 **M6 新增 stage `after_frontier_expr_layer`**（在 stage allow-list `compiler_csg.cheng:1955-2011` 注册）。读码后**这条不必要**：

- **生产路径上的 frontier 相调用点是 `compiler_csg.cheng:39015`**（`compilerCsgExprLayerForFrontierFunctionsImpl`），位于 `fn compilerCsgBuildTypedIrReachRoundPrepare`（`:38927`，被 `:39530` 调用）。注意 `:31864` 的 `CompilerCsgExprLayerForFrontierFunctions` **只被测试调用**（全仓 grep：除定义外仅 `src/tests/*` 五处）⇒ 若把新埋点加在那里，会得到一个**生产中永不发射的死 stage**。
- **紧随其后 `:39044` 已经有 `CompilerCsgTraceStage("after_typed_ir_expr_layer_rebuild")`**，且该名字**已在 allow-list 内**（`:1955-2011`）。
⇒ **L3 的第二判据直接用现成埋点对**：`after_profile_lookup`（`:40143`，紧接流式 TypeArena 相 `:40137`）→ `after_typed_ir_expr_layer_rebuild`（`:39044`），读数取后者的 `since_ms`。**零源码改动**，也避免新增一个可能永不被触达的 stage。
**但有一条必须先证的前置**：该 stage 在**全部现存回执里 0 次出现**（`grep -rl 'csg_stage=after_typed_ir_expr_layer_rebuild' .rebuild/` = 0 文件；`r9/gate/*.stderr.txt` 命中 0 份）⇒ 它的**可达性未证**。第一步不是写断言，而是**先拿到一次真正跑到该 stage 的轮**；证明它确实不可达之后，才谈新增埋点。
⇒ 连带更正 A1 的 U8（"现世代 typed/frontier 相 wall 无埋点"）：**埋点在码里存在，只是从未发射过**——这两件事的处置不同（前者要加码，后者要先证明可达性）。

**进一步实测（同轮补录，回答"到底哪些 frontier 锚真的发射"）**：
- 发射门槛已读清：`CompilerCsgTraceStage`（`:2036-2040`）写 stderr 的条件 = `compilerCsgTraceStderr`（env，`gate_r9.sh` 已导出）**∧** 该 stage 在 allow-list 内（`:1955-2011`）。**两族锚都在 allow-list 内 ⇒ 门槛不是差异来源，执行路径才是。**
- 在 `.rebuild/s1b_step3/r9/gate/*.stderr.txt` 全量计数（**25 轮**有 frontier 族锚）：
  `r92_tb_post_observe_verify`/`r92_ta_post_structured_slice`/`r92_t9_post_layer_borrow`/`r92_t8_post_markdomain` 各 **608**；`r92_te_post_accumulate`/`r92_td_post_buildfacts`/`r92_tc_post_consume` 各 **590**；`r92_t1_pre_view_begin` **57**；`r92_t6/t5/t4/t3/t2` 各 **50**；`r92_t7_post_slices` **32**；**`after_typed_ir_expr_layer_rebuild` = 0**。
  ⇒ **typed/frontier 相确实被跑到过（25 轮）**，但"reach 轮 rebuild 完成"这个锚一次都没发射。
- ⇒ **L3 判据的两条可选路径（须二选一，不得含糊）**：**(甲)** 用真正发射的 `r92_t*` 探针（先钉其计量语义：它们是**逐 source 的探针点**、非相位墙，取"首点→末点"需重新定义）；**(乙)** 先让 rebuild 路径可达（查清 `compilerCsgBuildTypedIrReachRoundPrepare` `:38927` 在哪些条件下才被 `:39530` 调用），再用 `after_typed_ir_expr_layer_rebuild`。

**裁决：走 (乙)，且不需要任何源码改动**（2026-09-13 同轮补测，读码 + 全量回执计数）：
- **调用时序已钉**：`compilerCsgBuildTypedIrReach`（`:39538` 的 `while !st.reachStable` 循环）由 **`:40339`** 调用，而 `after_profile_lookup` 在 **`:40143`** ⇒ **reach 相在流式相之后**，埋点对的先后顺序成立。
- **"0 次发射"的原因已定**：流式相自己的锚 `typed_context_lookup_built`（`:36765`）**确实发射过**（r104_recov 等），说明跑到过 `:36765`；但 `:40339` **之后**的所有 stage 在全部 25+ 轮里**命中数全为 0**——`before_typed_ir` / `after_typed_ir` / `before_typed_facts` / `after_typed_facts` / `before_typed_ir_expr_layer_rebuild` / `after_typed_ir_expr_layer_rebuild` **各 0 轮**。
  ⇒ **没有任何一轮进入过 typed-IR reach 相**——不是锚不可达，是**记录在案的所有轮次都死在它之前**。
- ⇒ **判据定稿**：`after_profile_lookup`（`:40143`）→ `after_typed_ir_expr_layer_rebuild`（`:39044`，读后者 `since_ms`），**零源码改动**；其可得性与 `cheng-plan.md` §6.2 验收线**同源**——能满足 `appended=234 ∧ rc=0` 的轮必然进入 reach 相，锚必然发射。**这正是它作为 L3 验收面的合法性来源**：判据与达标线同生共死，不会出现"门内跑完却量不到"。
- **顺带一条对本战役的定性**：**下游 typed-IR 相至今从未被观测过**——所有轮次都止步于流式相或其之前（`appended` 最多 158/234）。任何关于"typed 相耗时/内存"的说法此前都无实测支撑。

### A.7（原 §6.8）同文件双写事故与单一写者裁决（2026-09-13，**派单失误的复盘**）

**事故**：A5 lane（L5 C2 口径）与 B1 lane（档 3 实现）**同时在写 `src/rsi/compiler_domain.cheng`**。根因是**本席派单失误**：A5 已被要求做过 r1/r2/r3 三轮，我在派 B1 时仍把该文件放进 B1 的交付面（当时 A5 处于"收口"态，但随后又被我追加了 A5d 一轮 enforced 口径）⇒ 计划里写明的"文件面互斥"在**时间维**上没有守住（我只检查了空间互斥，没检查**同一 lane 的追加轮**与**新 lane** 的重叠）。

**检出方式（值得复制的信号）**：A5 侧 `edit` 被拒 `file changed since it was read`；同文件 mtime `08:45:39→08:47:45` 连跳；`git diff --numstat` = **835+/33−** ≫ A5 纯补丁的 247+/25−。

**树内实况（本席核实）**：文件是**并集**而非半覆盖——A5d 标记（`process_tree_enforced_peak_bytes`×2、`outResidentPeak`×3、`peak_resident=`×3、`peak_footprint=`×3）与 B1 的档 3 标记（`RsiCompilerCorpusTier3`×2、`Tier3`×8、`RsiCompilerCorpusRel/Open` 各 1）**同时在场**，`RsiCdC2Verdict` 仍在（×3）。
**代价**：A5 的 canonical patch `de142073…` 与 B1 的 `fc16e63e…` 在 `compiler_domain.cheng` 重叠 ⇒ **"树内 diff 与 patch 三方同 sha"这一交付形态在双写期间不可达**；A5 的活树 `patch_preflight` 与 `-R` 必然 FAIL（HEAD 基补丁无法对含他线内容的文件评估）。

**双写后的 canonical patch 集对账（2026-09-13，本席逐文件机械对账；结论：无缺口）**：

| 文件 | 能字节复现活树的补丁 | 依据 |
|---|---|---|
| `src/rsi/types.cheng` / `proposal.cheng` / `tests/rsi_contract.cheng` | **B1 `tier3.patch`**（`fc16e63e…`） | 逐文件段落与 `git diff -- <file>` **hunks 全等** |
| `src/rsi/compiler_domain.cheng` | **B1 `tier3.patch`**（1013 行段落） | 同上；A5 的 403 行段落是 **A5-only**、已被并集取代 |
| `src/tools/rsi_gate.cheng` | **A5 `c2_caliber.patch`**（`de142073…`） | hunks 全等（477 行） |
| `src/rsi/compiler.cheng` | **A9a `compiler_forward.patch`**（`d3662e5a…`） | hunks 全等 |

⇒ **每个被改文件都有且只有一份能复现活树的补丁**；A5 补丁的 `compiler_domain` 段是唯一"过期"段（被并集取代），已在表里点明，**不构成缺口**。
**方法学副产物（口径陷阱「`index` 行缩写」，登记见 §四.6；本席当场踩到）**：直接对 `git diff` 输出做 sha 比对会因 **`index <old>..<new>` 行的缩写长度**不同而误判 DIFFERS（本例 `0287c07..77c74d9` vs `0287c0772..77c74d988`，hunks 完全相同）。**对账必须剔除 `index ` 行**（或比对"剥 index 后的 hunks"）；只看整段 sha 会产出假的不一致结论。

**裁决（已下达）**：
1. **A5 自 A5d 起永久停止写该文件**；**B1 为该文件唯一写者**，改前必须重读最新内容（禁用早前缓存视图）。
2. **A5 的改动是依赖不是噪声**：`RsiCdC2Verdict` 与 `enforced` 口径链不得 revert；冲突时**停下报告**，不得自行删一边。
3. **双写后的 patch 交付口径**：每个 lane 除 HEAD 基补丁外，**必须再产一份"活树快照 patch"**（`git diff -- <file>` 原样落盘），并显式标注"HEAD 基 = 仅供审阅，不能直接 apply 到活树；活树快照 = 当前唯一可复现态"。**不得为凑"三方同 sha"而伪造 clean 基**。
4. **通用纪律（写入派单模板）**：文件面互斥必须按**时间维**检查——不仅要看"哪些 lane 现在写着这个文件"，还要看"**我接下来还会不会给已在飞的 lane 追加轮**"。追加轮 = 对该文件面的重新占用。

### A.8（原 §6.9）驱动身份口径勘误 + "路径 ≠ 内容"陷阱（2026-09-13，B3 交付件实测）

**勘误（把"内嵌冻结源快照"说精确）**：驱动**不是**在编译期把源嵌进二进制。实测 + C 原始件：驱动在**运行期**按 import 闭包**从磁盘读源**，冻结成只读 mmap 快照（`bootstrap/cheng_cold.c:3040-3162`、`:3093-3094`、`:3128-3140`），身份 = `source_snapshot_root_cid`。
⇒ 精确表述应分两句：**(a) 编译器自身源**在烤制时固化进 `kd_*` 二进制 ⇒ 改 `parser.cheng` 一类**必须重烤驱动**才可验证（`cheng-plan.md:83` 与证据总账 `:1456` 的原话在这个意义上是**对的**，只是没点明是哪一份源）；**(b) 被测树的源**是运行期现读现冻结 ⇒ 树在两次运行之间变化**不需要重烤**，反而会改变快照 CID——这正是档 3 的 **P4「轮内 CID 全等」守卫**要防的东西（`docs/campaigns/2026-09-07-pure-cheng-rsi/corpus_tier3_contract.md` §1.4 P4；B1 落点 `compiler_domain.cheng:929/935` `REJECT(corpus_mutated_mid_trial)`）。

**可机械判定"读数与树同代"**：`tools/driver_freshness.py`（sha `7ac9fe34…`，797 行，只读）在 Python 里**完整复算**该根 CID（闭包遍历 `cheng_cold.c:79639-79777` + `cold_parser.c:8015-8154`；文档 CID `:2878-2937`；规范化序 `:3220-3288`；根 CID `:3290-3368`），判词 `SAME_AS_WORKTREE`(0)/`DIFFERS`(1)/`UNAVAILABLE`(2, fail-closed)。**独立验证**：4 个不同世代、4 个不同源根的冻结根被**逐字节复现**（`kd_b102/scratch_root=54c2ca9b…`、`kd_b301/b3_root=6a7f46fa…`、`kd_b404/b2_root=42d12049…`、`kd_b501/b5_root=25f0cbed…`，count/lines/bytes 三项全同）。
**实测判词**：`kd_b102` ⇒ DIFFERS（源根是 `.rebuild/b_line/scratch_root`，非仓根）；`kd_r104` ⇒ DIFFERS（**根相同、内容已变**：同为 234 源，行 650,199→651,035、字节 31,015,101→31,060,179、CID `a67be2ea…`→`1460d088…`）⇒ **05:47 那份回执描述的不是当前树**。

**新陷阱（口径陷阱「路径 ≠ 内容」，登记见 §四.6）**：**路径 ≠ 内容**。`b2_root` 这一路径现在装的是 b404 世代（`42d12049…`），而另有 **7 份**自称 `root=b2_root` 的回执（b202/b203/b204/b302/b401/b402/b403）CID **全不相等** ⇒ 只比路径会把这 7 份误判为同代；互证：`kd_b201`（根=仓根）与 `kd_b202`（根=b2_root）CID **同为 `24a6ab1c…`** ⇒ **CID 是内容键，不是路径键**。**纪律**：一切"同代/可复现"判词必须绑 CID，不得绑路径。

**gate 回执的身份面缺口（登记，不修）**：`r104_recov`/`r96_ctx`/`r108_base` 三份 gate 样本的身份字段 **0/14**，`out_sha256=` 为空 ⇒ 只能 `UNAVAILABLE`。补它要改 `gate_run.sh`（在飞件，本席与全部子任务一律不动）。**后果**：**现役 gate 轮次无法自证其源快照身份**，引用时必须附"身份未钉"。

### A.9（原 §6.10）A9b 的第二个隐藏前提：子编译器**未必看得见** `CHENG_PROGRESS`（2026-09-13 本席读码，未钉死但已用"两可皆正确"的修法消解）

**问题**：A9a 的转发补丁让 `RsiCompileCheng` 把捕获文本里 `compile_progress ` 前缀行转发到自身 stderr（供 guard `--phase-trace` 采集）。但**前提是子编译器真的会打印这些行**——而它只在 `CHENG_PROGRESS` 为真时才打印（`backend_driver_dispatch_min.cheng:3530-3536`、`system_link_exec_pure_main.cheng:180-186`）。链路是：guard `--target-env:CHENG_PROGRESS=1` → **rsi CLI**（有）→ `RsiCompileCheng` 的 `envOverrides`（`rsi_gate.cheng:351-355`、`engine.cheng:57-60` 只传 `CHENG_ENTRY_CACHE/NO_CACHE/STRICT_NO_CACHE`，**不含 `CHENG_PROGRESS`**）→ 子编译器。

**读码未钉死的地方**：子进程环境是"**继承 + 覆盖**"还是"**被 envWire 重建/清空**"，取决于底层 spawn 实现。已看到两条相反迹象：
- `bootstrap/cheng_cold.c:12377`（`cold_bootstrap_bridge_run_step`，`:12254`）里 `char *child_env[] = { "LANG=C", "LC_ALL=C", "PATH=", 0 }` + `:12403 execve(..., child_env)` ⇒ 该路径**清空环境**；`:12200-12400` 区间 `getenv/environ` 命中 **0**。
- 但 `cheng_exec_program_capture_with_timeout`（`program_support_backend.cheng:3737` 调用）的定义**不在** `cheng_cold.c`，另有 `:108883` 的第二处 `child_env[]`，未能在一轮内定位其 env 合成点。

**处置（不赌语义，直接消解）**：让 `RsiCompileCheng` 在调用前**读父进程的 `CHENG_PROGRESS`，非空则显式追加进 `envOverrides`**。这样**无论底层是继承还是清空**，子编译器都能看见该变量；父进程未设时逐字节 no-op。**不新增开关、不改签名**——与 A9a 同一文件、同一条纪律。
⇒ 这条把"A9b 可能因第二个原因失败"变成一个不需要在槽位窗口里现场排查的问题——**这正是前置读码的价值**。

**A9a-r2 已落树（2026-09-13，本席复核 diff）**：`src/rsi/compiler.cheng` `git diff --numstat` = **42/2**（r1 为 21/0）。实现与本席要求逐条对齐：
- **env 透传**：读 `os.GetEnv("CHENG_PROGRESS")`；`envList` 逐项复制入参（`add(envList, Fmt"{…}")`，与仓库"add 传自有源"先例一致），用 `strutil.StartsWith(…, "CHENG_PROGRESS=")` 判重 ⇒ **父进程未设时逐项同序同字节（no-op）**；已显式传则**以调用方为准、不重复**；`envList` 传回 `ExecFileCapture`。
- **r1 转发块原样保留**（前缀 `compile_progress ` 精确匹配 + 末行无换行符分支）。
- **未改签名、无新开关、无第二入口**；仅使用**已存在**的 API（`os.ExecCmdResultOutput` 定义在 `src/std/os.cheng:3841`，先例 `rsi_gate.cheng:211`、`compiler_domain.cheng:113/312`、`execution.cheng:15`）。
- 仍未编译；"父变量未设时 envWire 逐字节不变"是该实现的自述论证，属**待编译/待槽位核验项**。

**A9a-r2 终验（交付件已复核，2026-09-13）**：源 sha `bd15bddd…`（42/2）；**HEAD 基 patch `3cade468…` 两份副本同 sha**、**活树快照 patch `066a8f68…` 两份同 sha**（基 = r1 快照 `602c2f38…`）；`git apply --check --cached` = 0、活树 `-R` = 0、`git diff | cmp - HEAD patch` = 逐字节相同。

**两条必须随改动作废的旧口径（A9a 报，本席采纳）**：
1. **A/M 腿的 `CHENG_PROGRESS` 从"名义"变"实际"**：改前 `--target-env:CHENG_PROGRESS=1` 很可能根本没到孙编译器，改后真生效并**带逐相打印开销**。⇒ **任何跨此改动的 A/M 腿耗时对比都会看到系统性差异——那是"开关从名义变实际"，不是编译器变慢。** C1/C2 的编译器域腿不经过 `RsiCompileCheng`，不受影响。
2. **一条未消解的实现矛盾（编译期风险，未钉）**：`src/rsi/compiler.cheng:13` 旧注释称"add() 构造的数组传参 live=0 被拒"（针对 argv），而本轮新增代码与活树先例 `compiler_domain.cheng:275-283`（`var envList + add(...)` 后传 `ExecFileCapture`）都走 `add()` 局部表。**先例本身也未曾编译**，故该矛盾只能在槽位窗口内由编译消解；已列为 A9b 的第一顺位核验点。

### A.10（原 §6.11）编译类脚本的两道硬纪律（2026-09-13 事故后固化）

**事故**：本席在窗口已被 `b3line_b602` 取走的情况下仍发起 S6 编译；`job_kill` 只停 job 外壳，`timeout 1800 $DRV system-link-exec` 的编译**继续存活**，与他线并发烤机约 1–2 分钟（他线金丝雀未被误杀，但其轮次读数应视为被污染）。

**固化两条（已落到脚本里，不再依赖调用方自觉）**：
1. **窗口判据在脚本内**：编译类脚本必须**自己**跑 `a7_preconditions.sh`，非 `FREE` 即 `exit 3` 且**不产生任何副作用**（含不生成探针文件）。已落 `docs/campaigns/2026-08-31-kernel-userpath/tools/a7_theory_emit/a7s6_run.sh` 与 `docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a9/a9_run_slot_probe.sh`；后者实测负例：窗口 BUSY ⇒ `exit 3` + `REFUSING` + `out_dir_entries=0`。
2. **编译必须可整组终止**：**macOS 没有 `setsid(1)`**（实测 `command not found`，我第一版加固就是这么坏的）⇒ 用可移植件 `docs/campaigns/2026-08-31-kernel-userpath/tools/exec_new_pgroup.sh`（首行 `exec` 掉 bash 保持 PID，python `os.setsid()` 使该 PID 成为 PGID，再 `execvp` 目标），调用方拿到 `$!` 即 PGID，取消用 `kill -TERM -$PGID`。**实测**：`alive_before=1 → kill -TERM -PGID → alive_after=0`。

### A.11（原 §6.12）【新缺陷】`--target-env` 在 guard 默认模式下**一律被拒**——A5 已落补丁的注入方式不成立（2026-09-13 A9b 实测）

**事实（读码 + 实跑双证）**：`tools/beat_c_process_group_guard_runtime.py:5569-5590` 的 `scrubbed_target_env()`：
```python
if target_env_mode == "exact":   # 由 --target-env-clear 置位
    ... 逐条校验并返回 {仅列出的键} ...
if target_env_mode != "inherit_scrubbed" or target_env_pair_args:
    raise OSError(errno.EINVAL, "target environment mode/entries mismatch")   # :5585-5586
```
⇒ **默认 `inherit_scrubbed` 模式下，只要出现任何 `--target-env:` 条目就 EINVAL**；要传条目必须**同时**加 `--target-env-clear`（切 `exact`，此时子进程**只拿到列出的键**，PATH 等都得自己列）。
**实跑后果**：A9b 腿 p 用 `rsi_gate.cheng` 的同款写法 ⇒ `guard_error=command_identity_unavailable detail=OSError: [Errno 22] target environment mode/entries mismatch`、`guard_rc=3`、**腿根本起不来**（不是 `missing_phase_readings`）。

**受影响面**：`src/tools/rsi_gate.cheng:380`（A/M 两腿）、`src/rsi/compiler_domain.cheng:269`（C1/C2 编译器域腿）**都只传了 `--target-env:CHENG_PROGRESS=1`** ⇒ 按现写法这两条腿都会以 guard EINVAL 失败，**逐相读数永远取不到**。这是 A5 补丁里未被发现的第三类缺陷（前两类：口径与 fail-closed 语义）。

**正解（已落 A9b 脚本并实测）**：走**父进程环境**——默认模式会继承父环境（仅剔除 `BEAT_C_GUARD_*`/`PWD`/`SHLVL`/`_`），故只需在 guard 调用前注入 `CHENG_PROGRESS=1`，其余环境原样保留。**A5 侧需一份后续补丁**把两处 `--target-env:CHENG_PROGRESS=1` 改成父环境注入（或补 `--target-env-clear` 并显式列全所需键）。

### A.12（原 §6.13）【本轮交付】exe sha 对拍判据订正：铁门不可满足，换成两半判据（2026-09-13，S5 原始件实测 + 负对照）

**问题**：`cheng-plan.md` §6.4 与证据总账 §8.69/§8.71 把「exe sha 对拍」当作确定性铁门（C2 欠账：待墙通后补）。S5 轮实测显示**这条判据在这条产物族上恒不可满足**——同一驱动、同源、同命令行的两次独立烤制 exe sha 就不同。

**实测（`.rebuild/a7s5/`，只读，零编译）**：

- 四件 `.primary.o`（pristine / patched / det_r1 / det_r2）**逐字节相同**：`7b594c89a24f01f3b7478a103e126f9a9300ac444ed1d4b160fb3556df98b771`，612 B。
- 四件 exe 同为 7,451,752 B，sha 全不同（`fe294004…`/`ca8a18ec…`/`10d7246c…`/`c98e2bb1…`）。
- 六对臂的差异字节**全量归因**（非抽样）：**100%** 落在两处——① CHENGPVC 承诺块的 `evidence_digest`+`proof_digest`（[7393800,7393864)，63–64 B）；② 文件末 32 B。**落在具名 section（__text/__stubs/__data/__got）内的差异 = 0 字节**；首差偏移恒为 7393800 = 承诺块 +56。
- 承诺块四臂实测：`version=3`/`sha256_alg=1`/`size=120`/`provider_count=7` 与 **`content_set_digest` 全同**（`b23920d0ef544532…`）；只有 `evidence_digest`/`proof_digest` **每一对都不同——包括 det_r1 vs det_r2（同驱动两次烤）**。

**⇒ 判据订正**：把『exe sha 相等』拆成**两半**，两半都成立才绿——① 对象 `.primary.o` 逐字节相同；② exe 的全部差异字节 ⊆ 已点名的非确定摘要面（承诺块两摘要 + 末 32 B）。【2026-09-15 勘误】相对『exe sha 相等』，两半判据在逻辑上是**放宽**（原判据成立 ⇒ 两半成立，反之不然），原文「更严、不是放宽」不成立；放宽有据——原判据在该产物族上恒不可满足（同驱动两次烤 sha 必不同）。放宽后仍是硬约束的部分：`content_set_digest`、承诺块其余字段与全部具名 section 逐字节相同，差异只允许落在两处已点名摘要面。另注：`.primary.o` 在 `cold_runtime_provider_system_link` 口径下仅 612 B，半①几乎无判别力，实际约束全在半②。

**交付**：`tools/exe_sha_pair.py`（自带 Mach-O64/32 段表解析；门口只在显式声明时打开：`--allow-commitment-digests` 只放行承诺块 [+56,+120)，`--allow-eof-digest` 只放行末 32 B 且**与任何具名 section 重叠即拒跑**）。
**验证**：`--self-test` **7/7 PASS**（4 通用 + 3 摘要面负对照：摘要差异未声明必红、承诺块 `version` 字段翻字节在允许摘要面下仍必红）；真实原始件 **GATE_RC=0**；**负对照**（`__TEXT,__text` 翻 1 字节）**判红**。

**未竟（不得含糊）**：真正要补的两臂对拍（C2 的 diag vs hardcut 在**发射点**的产物）仍被**现役前沿墙 `compiler parser receipt: generic declaration header invalid`（compiler_parser_receipt.cheng:6914，B7 在攻）**前置阻塞——两臂当前都到不了发射点。本件交付的是『墙通后一条命令出判词』的仪器与口径，**不等于欠账已清**。回执：`docs/campaigns/2026-08-31-kernel-userpath/design/dual_arm_sha_gate_receipt.md`。

**与主链的关系**（用户给定）：`B7 通墙 → 补 sha 对拍 → 档 1/2 语料解锁 → C1/C2 对 234 源冻结测量合同 → RSI 自动筛选内核收敛`。本件 = 第二环的仪器半；第三环的就绪度见 `docs/campaigns/2026-09-07-pure-cheng-rsi/tier1_unlock_readiness.md`（档 1 的 T1 依赖今日已满足、档 2 仍待内核）。

### A.13（原 §6.14）【本轮定谳】RSI 生成器发射的候选源码过不了 Cheng 链 `cheng_seed` 门禁（A9b 卡点的真根因）

**现象**：A9b 三腿全部 `guard_rc=3`。逐层定谳（本轮实测，非推断）：`guard_rc=3` = `abort_reason=exit_code_contract_mismatch`（子进程非零）→ 腿账本逐字 `event=genesis_failed phase=1 rc=2`（`engine.cheng:304-311`，`phase=` 记的是**返回码**：1 = 编译失败）→ 现场遗留 `src/rsi_work/cand_d0_g0_seed.cheng:35` = `var compares: int64 = 0`。

**根因**：Cheng 链 `cheng_seed` 门禁判词族（实读 `src/core/**`）里第一条就是 `redundant explicit default init; omit initializer type=` ⇒ 冗余显式默认初始化 **gate rc=2**。RSI 生成器把这种写法**发射进候选程序源码**，于是候选在 Cheng 链驱动下必然编不过。

**为什么此前从未暴露**：RSI 的候选历史上一直由 **C 链载具**（stage3 / kd_*）编译，C 链不执行该门禁。只有 A9b 为了让子编译器真发 `compile_progress` 而换用 Cheng 链驱动才撞上。**⇒ 这是『RSI 生成器与 Cheng 链载具不兼容』的独立缺陷，与 A9/A7 仪器无关。**

**已修（源侧、纯删、已落树）**：`docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/generator_no_redundant_default_init.patch`，`src/rsi/generator.cheng` **41 处**（3 处自身代码 + 38 处发射串）`var x: T = <默认值>` → `var x: T`。预检 PASS（`ann=0 displaced=0 wedged=0`）；落树后复扫残留 **0**；修复后 CLI 由 C 链重建成功（5s）⇒ 改动已过一次真实编译。语义等价的先例 = 内核线 B5 同款纯删（17 文件 60 处，kd_b501/kd_b302 A/B **逐项全等**，证据总账 §8.69）。

**派生发现（更大面，已 stage 未应用）**：同一写法在 RSI 领地共 **596 处 / 14 文件**（`src/rsi/**` 332、`src/apps/rsi/main.cheng` 50、`src/tools/rsi_gate.cheng` 49、`src/tests/rsi_*.cheng` 165）⇒ **整条 RSI 线目前只能由 C 链构建**。补丁 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/rsi_no_redundant_default_init.patch`（纯删，110 KB）已生成且**预检 PASS（14/14 文件 ann=0 displaced=0 wedged=0）**；`git apply` 可整件落树。**本轮不应用的理由**：A9b 正在等窗口，窗口一开就要从活树重建 CLI，此刻落 596 行改动会把『生成器修复是否奏效』这一次验证搭进去——先验证，再落大扫。

**判据链（本轮已取得）**：`guard_rc=3` ⟺ 子进程非零（实测 guard 报告 `abort_reason=exit_code_contract_mismatch`）；`genesis_failed phase=1 rc=2` ⟺ 种子候选编译失败；`cand_d0_g0_seed.cheng:35` ⟺ 门禁拒绝的确切写法。三段可独立复核。

**分层更正（同日，秒级 A/B 探针 `.rebuild/a9b/seed_probe1/`）**：生成器修复后，**同一候选在冻结 stage3（C 链）上 rc=0 并产出可执行件**，但在 Cheng 链驱动 `kd_a7v9` 上仍 rc≠0，stderr 逐字 = `compiler parser receipt: normalized expression parser node missing exprIndex=8 kind=21 line=585 surface=continue …` —— 那正是证据总账 §8.73 记的**内核 receipt 墙**。⇒ 该卡点分两层：**第一层（RSI 生成器）已修且已验**；**第二层属内核领地**，`kd_a7v9` 因烤成早于 B6 根修而结构上必然带旧 parser。⇒ A9b 的腿编译器缺省改为 stage3（`A9_LEG_COMPILER` 可覆盖），因为 A9 验的是仪器链而非被测驱动，且 stage3 与 `kd_*` 同源。【2026-09-15 勘误】原文此处「照样发逐相行」是错的：stage3 是 C 链载具，`bootstrap/cheng_cold.c` 全文仅 1 处 `compile_progress` 且只在越限路径（附录 A.14 表），p 腿在 stage3 上恒 `phase_rows=0` ⇒ `INCONCLUSIVE_DEP`（与 §3.2 A9b 一致）；换 stage3 只换来「编得动候选」，换不来逐相行。

### A.14（原 §6.15）【本轮定论·单一缺口】逐相仪器只在 Cheng 链存在，而 Cheng 链编不动语料 —— A9b 与 C1/C2 被同一处卡住

**结论**：`A9b 的 phase_rows>0` 与 `cdomain 的 missing_phase_readings` **不是两处故障，是同一处**。今天没有任何载具同时具备「能编 RSI 语料」与「成功编译时发 `compile_progress phase=`」：

| 载具 | 能编 RSI 语料 | 成功编译时发逐相行 | 证据 |
|---|---|---|---|
| C 链 `cheng.stage3` | ✓ rc=0（峰值 180 MB < 768 MiB 门） | ✗ | `bootstrap/cheng_cold.c` 全文仅 **1** 处 `compile_progress`，且只在 `phase=resource_guard status=rss_limit_exceeded` 越限路径 |
| Cheng 链 `kd_b701`（post-B6） | ✗ | ✓ **18 行**（连裸 `echo` 夹具都发） | `.rebuild/a9b/{kd_probe2,bisect2/c2_echo}/` |

**B9 里程碑后复测（2026-09-13，账本 §6.1u / §6.1v；驱动来源已核验：`diff -rq src/core .rebuild/b_line/b2_root/src/core` = 0 处差异）**：最新 Cheng 链驱动 `kd_b905b`（`4d1a60aa…`）上 —— c1 仍判 `compiler parser receipt: manual consume function identity drift`、c3 仍判 `typed expr value definition: producer lacks exact type or ownership proof`（均 rc=3、无产物、**0 相行**）；且 Cheng 链单次编译 **≈220 s**（C 链同源 3 s），3 行程序峰值 **770–806 MB** —— `kd_b905b` 在 `echo("hi")` 上 **805,750,272 B > 门 805,306,368 B**（SIGKILL）。⇒ 缺口**仍然开着**，并新增一条成本约束：即使墙清了，一条 A9b 腿（多候选 × 220 s）也需要**几十分钟连续窗口**。

**Cheng 链编不动语料的三道墙（各带 3–5 行最小复现，复现件 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/a9_cheng_chain_wall_repros.md`）**：
1. `compiler parser receipt: manual consume function identity drift` —— c1 = `import std/strings` + `return 0`；
2. `typed expr value definition: producer lacks exact type or ownership proof` —— c3 = 无 import 的 `range`/`int64()`；
3. `typed expr: call declaration static argument type unavailable name=Sha256 line=4 …` —— c4。
对照 c2（裸 `echo`）**rc=0 通过** ⇒ 不是驱动坏了、也不是路径问题（同源放 `src/tests/` 与 `src/rsi_work/` 同墙逐字相同）。

**内核线已独立定性其中一条（交叉印证，非本席推断）**：`deterministic_model_derivation.md:1780`（§8.76，B7 线）逐字写 —— receipt `manual consume function identity drift` **仅当源内含对泛型函数的调用时触发**，并把它列入「未竟」。⇒ **该墙 B7 未修**，B7 只清了 `generic declaration header invalid`；B7 后的新前沿是 `typed expr: frozen module const query before build-index seal`（typed_expr 领地，与本席第 2/3 条复现同族）。

**为什么 RSI 侧不绕**：生成器不可能不用 `add`/`join` 这类泛型调用（那是候选程序的真实工作），且按 `AGENTS.md` 工程规范 3『符合直觉的合法语法**只修不绕**』——这是内核侧待修项，绕行（改写生成器去避开泛型调用）属于把编译器缺陷转嫁成候选能力缺失，**不做**。

**触发面已收窄（2026-09-13 实测，账本 §6.1u）**：墙不是被 RSI 源码触发的，而是被 **`import std/<任一模块>`** 触发的 —— `c0`（无 import，3 行）**通过**（rc=0、18 相行）；`c1`（`import std/strings`）与 `c5`（`import std/strutils`）判 `manual consume function identity drift`；`c6`（`import std/os`）判 `normalized expression parser node missing exprIndex=5 … surface=if`。**连续四枚驱动（kd_b701 / kd_b905b / kd_b1002 / kd_f102）判词逐字相同**。⇒ 修法必须落在 **std 导入闭包的声明面**（不是调用点、不是 RSI 生成器），这也解释了内核 §8.76『仅当源内含对泛型函数的调用时触发』为何与本复现不符：**闭包里的声明本身就够**。【2026-09-15 勘误】此结论只覆盖 W1（c1/c5）与 W2（c6）；W3（c3：无 import 撞 `producer lacks exact type or ownership proof`）不在 import 触发面内。本条「三道墙」与下文「两族墙」的措辞一律以 **§3.3 墙清单**为准。

**解锁条件（唯一）**：内核清掉 receipt `manual consume` + typed_expr 两族墙后，`A9_LEG_COMPILER=<新 kd_*>` 一行即可复跑 A9b 三腿（脚本已参数化，无需改代码），cdomain 也随之可达 PASS。**在此之前 A9b / cdomain / 档 3 的判词一律是 INCONCLUSIVE（依赖未满足）**，不得写成 PASS 或 FAIL。

**2026-09-13 现状（已跑到判词，不再是"没跑"）**：A9b 三腿已在**单窗口 62 秒**内跑完 —— **n / n0 两条负腿 PASS**（证明"无条件乱喷不成立"与子环境零 `CHENG_PROGRESS`），**p 正腿 `INCONCLUSIVE_DEP`**（`phase_rows=0`，载具为 C 链）；cdomain **档 0 与档 1 同判 `INCONCLUSIVE_DEP`**（C 链载具 rc=0、峰值 176–180 MB ≪ 门，唯一拒收理由 `missing_phase_readings`）。⇒ 缺口现在有**逐腿原始判词**，且判据未被放宽（账本 §6.1w / §6.1x）。

**不受该缺口影响的一条线（本轮已交付）**：语义 oracle（L4）只判 `rc + stdout sha`，用 C 链载具即可跑 —— V0/V1/V2/V2B/V3/V7/V8 **已全部实测通过**（冻结基线 `7995091f…` 绑定载体 `05af823e…`），对外接口见附录 A.15；**只剩 V3F（无缓存全量）被调度饥荒挡住**（账本 §6.1s 与 §7-9）。


**2026-09-14 墙二（typed_expr 族）位点图（独立子代理只读产出；回执 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/wall2_typedexpr_pointer.md`，本席未复跑它的探针）**：
- 墙二被判的是 parser 归一化层的**裸 `if` 关键字行**（`kind=1=NormalizedExprIf` / `detail=IfKeyword`）；判点 `src/core/tooling/compiler_parser_receipt.cheng:9026-9031`（判词 `:9030`），身份式 `origin>=0 ? origin : root`（`:8924-8932`）⇒ 判死 = 两者同时 -1（不是越界）。
- 该行只有两条认领路：`StampConditionFact`（只认领**语句位** if 的 Condition 事件，`parser.cheng:35420-35451`）与 B16 的「同位随绑」（只挂在**有结构化种子**的跨行形，`:34929-35003`）；**表达式位单行 `let x = if … else …` 两条都不中**（行首是 `let` ⇒ 结构化种子产线 `:6071-6114` 直接 `return false`，不产种子）。
- ⇒ **墙二与 import 闭包机制无关**：`import std/<m>` 只是把 `src/std/buffer.cheng:50`（`let take: int32 = if n < avail: n else: avail`）这个表达式位 if 带进编译单元。该文件绑定标**候选**（逐行事实计数推算 6–8 行 vs 判词 `exprIndex=5` 差 1–3 行，未验证）。内核线自己的 `.rebuild/b_line/b16_ledger_append.py:12` 已登记「单行形无结构化种子…留后续线」，其 post-B16 单行夹具 A/B 判词与基线逐字节一致。
- 回执 §5 给出一条判死探针（`receipt:9030` 的 Fmt 末尾加 `source=/col=/detail=`）、零改树复现命令与现有开关 `CHENG_IFSTMT_BIND_PROBE=1`（**本席未执行**）；§6 给的方向是「在 `ParserValueExprBindStatementRoots` 收尾加终扫：凡 `kind=If ∧ detail=IfKeyword ∧ root<0` 的裸行复用包含绑定（零/多命中维持 -1 fail-closed）」。**告警**：只补认领臂到不了 rc=0 —— 下道墙是「非 call 根的 origin 证明缺失」（`typed expr: node origin proof is missing … parser_node=-1`，原始件 `.rebuild/b_line/b16_b16_repro_let_if_ternary_b1701.stderr.txt`）。

### A.15（原 §6.16）【本轮交付·L4 对外接口】语义 gate：候选编译器 → 语义等价判词（给内核线的接线说明）

**一条命令**：

```
docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/semantic_gate.sh <候选编译器二进制> \
    [基线路径] [--no-cache]
```

**退出码即判词**（上游脚本可直接判）：`0 = SEMANTIC_EQUIVALENT`（逐条 `src_sha / compile_rc / fp` 与冻结基线相同）· `1 = SEMANTIC_DIVERGENT`（点名失败条目，含 `drift`/`missing`/`differ` 三类 fail-closed）· `2 = PRECONDITION`（工具/基线/候选缺件）· `3 = INCONCLUSIVE`（守卫超时或异常中断，**结果无效，不得当通过**）。

**调用时机（关键）**：本 gate **不自己等窗口、不抢槽** —— 由**持槽方**在烤完候选之后、**槽位还在自己手里时**调用。这样语义筛选与候选烤制共享同一个窗口，不需要额外等一个静窗。

**成本（实测口径）**：
- **热**（该载体此前已跑过，观测缓存命中）：**几秒**。自证回执 `checks_pass=43 checks_fail=0`（按附录 A.18 F3 勘误 +2 读 = 45）、`cache_hits=38`、`guard_rc=0`（账本 §6.1t，原始件 `.rebuild/patchwork/gate_test.log`）。
- **冷**（新候选）：缓存键含候选 sha ⇒ **必然全 miss**，需**连续 3–5 分钟**（31 格 + 三条语料腿）。【2026-09-15 勘误】09-13 实测：无缓存单步 judge v3f ≈132 s、6 步批次总墙钟 388 s，「3–5 分钟」是早期估计，旧记「单轮 293 秒」作废（§3.2 L4）。要么在同一个窗口里跑完，要么用 `--no-cache` 明确标注「本轮回退到全量重编译」。

**观测缓存的语义（决定了它为什么可信）**：只落**全绿观测**（`crc=0 && rrc=0 && judge=pass && 格子 golden=match`），键 =（候选 sha）:（工具 sha）+ 条目名 + 条目源 sha。⇒ 换候选/换工具/换语料**必然 miss**；任何非绿一律不落缓存，**缓存只能确认绿，不能掩盖红**。命中重放与首轮全量跑出的基线**逐字节相同**（账本 §6.1s 的 V2B）。

**边界（不要误用）**：本 gate 只判**语义**（`rc + stdout sha`）——它**不**测内存、**不**测时间、**不**产出逐相读数。

**第二条边界（2026-09-13 补，实测口径）**：`SEMANTIC_DIVERGENT` 这一个词**同时覆盖两种完全不同的情形**——① 载具能编译但产物语义变了（真回归）；② 载具**根本编不动**这些程序（`compile_rc != 0` ⇒ 逐条 `verdict=differ`，如 Cheng 链驱动撞 std 导入墙时）。两者在**逐条判词**里分得清（`compile_rc=` 与 `fp=-` 一眼可辨），但一行结论分不清。⇒ **拿 Cheng 链驱动当候选时不要把 DIVERGENT 读成"语义回归"**；给内核线的用法是：候选必须先是"编得动"的载具（C 链/冻结 stage3 路线），gate 才有筛选意义。内存/时间的收敛筛选仍归附录 A.14 的逐相仪器那条线。

### A.16（原 §6.17）【本轮交付】解锁后一键复验套件（面向"内核清墙那一刻"）

`bash docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh [驱动]`（缺省 = `.rebuild/s1b_step3/r9/` 下 mtime 最新的 `kd_*`；【2026-09-15 勘误】按 mtime 选驱动违反 AGENTS 规范 10「归因不用 mtime」与附录 A.8「绑 CID 不绑路径」，脚本 `:23` 现仍为 `ls -t` ⇒ **调用时必须显式传驱动路径**，缺省行为待改为显式 sha/CID——脚本属 L4 工具面，本轮未改）按序做四件事：**① 同源核验**（`diff -rq src/core .rebuild/b_line/b2_root/src/core`，非 0 即警告判词只能按旧树口径读）；**② c1/c3 墙探针**（两个 RSI 形状最小复现）；**③ 早退纪律**——墙未清则原样退出（`WALL_STILL_UP`），**不改动任何既有判词**；**④ 墙清了才**归档旧判词（`.rebuild/reverify/<utc>_<drvsha>/`）并依次跑 **A9b 三腿**（腿编译器 = 新驱动）与 **cdomain 档 0/1**。

**为什么需要它**：缺口未闭期间内核线仍在持续出驱动（`kd_b701 → b801 → b905b → b1001 → b1002 → b1003…`），每次"墙清了吗"都要同一套流程；固化成一条命令后，解锁那一刻的复验是**分钟级**的，而不是重新搭一遍。判词口径：`rc=0` 全绿 / `rc=4` `INCONCLUSIVE_DEP`（依赖未满足，**不得**写成 PASS 或 FAIL）/ 其他 = FAIL。

---

**产物**：`.rebuild/semantic/gate/{guard.out.txt,guard.report.txt,leg.log}`（每轮覆盖，判词行含 `cached=obs_v1` 标记，可 `grep -c` 数命中数）。观测缓存本体落 `.rebuild/semantic/obs_cache/<条目>.obs`（scratch 面）——**清理 `.rebuild` 会让下一次 gate 退化成冷跑**（3–5 分钟），清理前请先确认是否还要复核该载体。【2026-09-15 复核】`.rebuild/semantic/obs_cache/` 当前已不存在 ⇒ 下一次 gate 必为冷跑。

### A.17（原 §6.18）【2026-09-14 排程口径变更】从"被动等窗"改为"参与协作槽位协议"（可一票否决）

本席原先坚持"不建锁、只在真窗口里跑"，实测后果是**累计 41 次尝试全部被抢槽杀掉**（腿不持锁 ⇒ 他线看不见它 ⇒ 几秒后起编译 ⇒ 本席看门狗按纪律杀腿）。现改为参与本仓**既有**的协作 `mkdir` 锁协议：
- 排队件新增 `SLOT_MODE=acquire`：拿锁才跑，`owner.txt` 写 `pid/purpose`，EXIT/INT/TERM 一律释放，起锁后复核有无外来编译（有则立刻释放）。
- 看门狗新增 `--on-busy pause`（缺省仍 `kill`）：持锁轮次遇到**不守锁的 noslot 编译**时，本腿 **SIGSTOP** 而非被杀，窗口干净后 SIGCONT —— 不产生 CPU 竞争，兼顾他线测量与本席长腿。自测 3/3 PASS。
- **这与内核线的脚本同构**（`while ! mkdir "$SLOT"` + 死主清理 + 60 分钟上限），故不会造成他线失败，只会让他线**延后开始**；理由是它**消除并发**而不是制造并发。
- **覆盖面**：语义排队件 `semantic_wait_and_run.sh` 与墙探针 `wall_probe.sh` 都支持 `SLOT_MODE=acquire`（同一套 `mine/acquire_slot` + `--on-busy pause`）。
- **用户可一票否决**：回退只需不设 `SLOT_MODE`（缺省 `wait` = 旧行为）。【2026-09-15 勘误】「缺省 `wait`」只对 `semantic_wait_and_run.sh` / `wall_probe.sh` 成立（`${SLOT_MODE:-wait}`）；`post_wall_verify.sh:15` 缺省 `acquire`（`${SLOT_MODE:-acquire}`），`unlock_decisive.sh` / `chain_bake_s6.sh` **硬写** `SLOT_MODE=acquire`、环境变量否决不了 ⇒ 一票否决 = 前两件不设、`post_wall_verify.sh` 显式 `SLOT_MODE=wait`、后两件须改脚本。

### A.18（原 §6.19）【2026-09-14 自身缺陷清算】L4 工具两处真洞 + 本席排队件四处自伤面（均已修，绑原始件）

- **L4 工具**（`src/tools/rsi_semantic_regression.cheng`）独立审查回执 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/l4_tool_review.md`（受审源 `e252520f…`）：**F1** `--record` 无语义门禁 —— 编译失败/超时（rc=124）会以 `compile_rc 124 fp -` 判 PASS 入基线，与设计 §四:89-90「基线不得含坏读数」冲突；**F2** 设计 §十三:241「只缓存全绿」在代码里**不存在** —— `obsCacheStore` 把 `obs 0 0` 写成常量、lookup 拿常量比对（空操作守卫），物证 `.rebuild/semantic/obs_cache/fixture_call_fixture.obs:4` = `fp 1:e3b0…`（run rc=1 被标全绿并重放）。
  - **两处已修**：record 准入硬拒 `compileRc!=0`/fp 缺失（并加自检回归护栏 `record_mode_reject_timeout` / `record_mode_reject_compile_fail`）；`obsCacheStore` 收 `crc/rrc` 真值且**非全绿不落盘**；新增 `fpRcPrefixOf` 并在 lookup 做**一致性硬校验**（fp 自证 rc 前缀必须为 0）⇒ 既有坏条目**永久 miss、不再被重放**（**勘误**：对恒非绿条目不会"冷跑重写覆盖"，旧文件只能人工移存 —— 物证已移 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/obs_cache_bad_entry_fixture_call_fixture.obs`，活缓存删除）。源 sha `e252520f…` → `8ca9d02d…`（1117 行）→ `2c855f8aff34e19f…`（1131 行，二轮复审残余①：record 侧补拦运行超时 `124:`，自检 9→11 例）。
  - **F3 同时修**：`checks_pass` 系统性少 2（judge 模式漏计 `compiler_sha256`/`baseline_present`，record 模式漏计 `compiler_sha256`/`baseline_mode`）⇒ **本文件与账本此前引用的 checks_pass 一律按 +2 读**（判词不受影响，出口只看 failCount）。F4/F5/F6（ledger 归因、空选项目志、int32 回绕、`ParseInt` 静默 0、按 `sem_` 前缀删共享 workDir）**记录未改**。
  - 审查已核实**无问题**的四问：判据不依赖候选自报（fp 锚死整条 stdout）；缓存键整行逐字比较、无错键复用面；`--self-test` 非恒真；27 处 FAIL 分支无「打印 FAIL 但 rc=0」路径。
- **本席排队件四处自伤面**（独立审查回执 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/unlock_scripts_review.md`；全部过 `bash -n`）：
  1. **A2**：`a9b_wait_and_run.sh` 的 DEP 分支条件是「rc!=0 且 0 行且载具=C 链」⇒ 把 rc=2（用法错）与 rc=3（窗口丢失）都吞成 `INCONCLUSIVE_DEP` —— 一个**根本没编译**的轮次也能产出一份看上去合理的依赖判词。修：只认 `rc=1`。
  2. **A1（两版才对，第一版是阻断级缺陷）**：`a7_preconditions.sh` 把**本进程自己的锁**与**本进程自己的编译子进程**也当「别人在编译」⇒「先取锁再发腿」的调用方腿前复检恒 BUSY、腿一次都起不来（静默零产出）。
     - **v1（错，已被二轮复核抓出）**：用「祖先进程链」推断自链 —— ① 建链把 **pid 1(launchd)** 收进链 ⇒ 任何活进程上溯都命中 1 ⇒ 判据对**所有**进程恒真（现场：他线 `a7_bake_carrier --run` 正在持锁烤机，却被读成 `lock=self` + FREE）⇒ 从「自伤」翻成**纵容并发**；② 修剪 pid 1 后仍不可用：本机所有子进程共享同一常驻 shell 祖先，**兄弟进程**照样命中。
     - **v2（现行，显式声明制）**：取锁脚本 `export CHENG_SLOT_OWNER_PID=$$` 声明自己为槽主；本件**只认这个值**（及其后代）为自链，锁 `owner_pid == SELF_OWNER_PID` 记 `lock=self`；他线不声明 ⇒ 锁活着即 BUSY。声明已铺到 9 处取锁件。
     - 单测（隔离进程面）：未声明 ⇒ BUSY rc=3；声明为槽主 ⇒ FREE rc=0；错声明 ⇒ BUSY rc=3。
  3. **A3**：七处无条件 `trap 'rm -rf $LOCK'` ⇒ 取锁失败/被接管后超时会**删掉别人的活锁**、把两条线送进并发烤机。修：全部加 `mine &&` 守卫（`a7_bake_carrier.sh` 用 `$SLOT`，另补 `mine()`）。
  4. **A4**：`post_wall_verify.sh` 把「探针没跑完」（watchdog_rc=4/超时/日志缺失）读成 `WALL_STILL_UP` 并 exit 2。修：要求两源都留下 `PROBE_RESULT` 才允许出判词，且 `watchdog_rc=[34]`/`PROBE_TIMEOUT` 一律 INCONCLUSIVE。
- **新增复审纪律（红线候选，可一票否决）**：凡「先取锁、再在锁内做前置复检」的腿，前置判据必须能识别**自链**，且识别方式只允许**显式声明**（`CHENG_SLOT_OWNER_PID`）—— **禁止**用「祖先进程链」或任何共享祖先推断：本机所有子进程共享同一常驻 shell 祖先，推断必然把兄弟 lane 认成自己（A1 v1 的阻断级缺陷），或把 pid 1 收进链导致判据恒真、纵容并发烤机。
- **b1701 墙复测（2026-09-14 20:04Z，锁内单窗口，绑原始件两行 `PROBE_RESULT`）**：c1 `f8bd6e8cd2cec634` / c3 `8fc16a8101e001d1` 两源 `bin=no`，判词同形（`manual consume function identity drift` / `typed expr value definition: producer lacks exact type or ownership proof`）⇒ **墙仍在、无位移**。原始件 `.rebuild/patchwork/b1701_walls.log`。
- 修补器/预检件：`.rebuild/patchwork/fix_review_a1a4.py`（A1–A4 一次落刀）、`.rebuild/patchwork/cheng_src_preflight.py`（就地改 Cheng 源的「注解紧贴 + 去注释括号平衡」预检）。

### A.19（原 §6.20）【2026-09-14 收口指针】三验收项的裁定入口 + 事后通路

- **给用户的一页裁定书**：`docs/cheng-rsi-acceptance-ruling.md`（经两路独立只读复核后修订；跨项阻塞给出三条出路请择一；含 C1/C2 判词顺序偏差与 50MB 接线两问）。
- **事后通路（墙清后一条命令序）**：`docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/post_wall_verify.sh`（缺省 `SLOT_MODE=acquire`，收尾镜像 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/evidence/post_wall_latest/`）与 `docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/unlock_decisive.sh`（退出码 = 最严重判词 0/4/5/1）；A7 侧 `docs/campaigns/2026-09-07-pure-cheng-rsi/tools/a4/chain_bake_s6.sh`（等 `kd_a7` → 跑 S6 → 镜像 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/evidence/a7s6/`）。
- **rc 口径统一**（2026-09-14 第 97 轮）：`0=全绿 / 3=INCONCLUSIVE(可重跑) / 4=INCONCLUSIVE_DEP(判词) / 5=超时或尝试耗尽(非判词)`。
- **唯一跨项阻塞**：逐相仪器只在 Cheng 链、Cheng 链编不动语料/载具（附录 A.14）；最新前沿 `typed expr: node origin proof is missing or contradictory`（B18 线 05:59 实测）。
