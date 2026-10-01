# Cheng In-Place Refactor（v2 架构原地重构总纲）

状态：**apply**（2026-06-11 用户确认开战役：各线按依赖并行推进，每批过统一门禁后 commit 检查点；全部线收口后整体 archive）。

## 进度快照（2026-06-29，实测确证）

**已落地 done（进 ci_gate，实测全绿 21 门）：**
- 阶段3b 诊断列表 ✅：`plan.error → plan.errors[]` 全量枚举（93ad12dde）+ per-function bail 富化 + 统一口径脚本 `tools/zc_enumerate.sh`（9445a97a0），破除历史 31/22/191/368 乱账。
- 阶段3c verifier（CI 用例部分）✅：`verifier-dod-contract` 门（body_ir_dod_soa_contract_smoke 验 5 类 broken BodyIR 检出）。
- 阶段5 性能/并行 ✅：`phase-arena-spill`/`noalias-egraph`/`csg-egraph-active`/`cfg-body-ir`/`memory-report` 五门进 ci_gate（spill 非预期即失败 + E-graph 字节对拍 + No-alias facts）。
- 密码线 PQC ✅：ML-KEM/ML-DSA/SLH-DSA 三件套 NIST ACVP+KAT 官方向量（FIPS 203/204/205），mlkem/mldsa 进 ci_gate fast 门、slhdsa 进 nightly（6ef29d33f）。
- 网络线 Wave 0（仿真器线）✅：`net_sim_gate`（core/pipe/200-seed sweep 确定性收敛 collisions=0）进 ci_gate（7418934e4）。
- **★阶段5 combo A/B/C 完成（2026-06-28，commit e65bed8ca→2366e2365）** ✅：TypedExprIr 现纯 SoA 表示——combo A（AoS→SoA 消费者迁，5/5 文件 review-merge + 巨 cluster 构造法避 40 签名级联）+ combo B（str→id intern，consumer 396 读全迁 LookupIntern + str[] 37 列物理删除，**内存去重收益实现**）+ combo C（删 TypedExprIr AoS 数组 functions/nodes/statements，Phase1 refs-first 迁全读 + Phase2 抽 TypedExprIrClearSoAIRData/StatementsData helper 修 rebuild-clear SoA 一致性 + 删声明）。TypedExprIr = 85 SoA 列 + 37 InternId + internPool，无 AoS 指针对象图。**这是 gate ② materialize RSS（10.6GB→~308MB 理论）的数据布局地基**。ci_gate 21/21 全绿，不动点 e202c0c35424eb36 全程保持。runtime src 验证 zero-C-gated（combo C 把 TypedExprIr 改纯 SoA 为纯路径编译备料）。剩 PrimaryObjectIr 是从未 SoA 化的第二 IR（独立战役，出 combo A/B/C scope）。**（2026-06-28 订正：gate ②「materialize RSS 10.6GB」主因已确认为 `gSortDumpBuf` O(N²) concat churn 非 SoA 指针对象图，删除后 RSS 8.02GB→273MB，见文末「8GB RSS 闭环」节；combo A/B/C 的 SoA 数据布局收益对 raster smoke gap + zero-C 仍有效，但不再是解 8GB 的关键路径。）**
- 全量 driver 阶段1 进度账固化：统一口径基线 = **22 not_ready（21 statement_sequence + 1 Join）**，见 `docs/fulldriver_blocker_route.md`。

**★2026-06-29 本会话实测进展（ci_gate 21/21 重建验证 + 两处根因定位）：**
- **stage3 重建吸收 cold parser 修复**：旧 stage3（06-28 22:05）不含 `2dcb8ab31 const block 加 typed-binding-no-value` + `162b439f4 overload-resolver 噪音 suppress`，导致 `build-backend-driver` 卡 `chengFileHandleMagicOffset: int32` 无值 const（`cold_subset` die），ci_gate 实测仅 **12/21**（build-backend-driver/PQC/netsim/cfg-body-ir/perf-theory-ratio 等 9 门链式失败）。用 HEAD 版 `cheng_cold.c` cc 重编 → `bootstrap-bridge` 自举出含修复的新 stage3（不动点 `e202c0c35424eb36` 保持）→ 安装后 ci_gate **12→21/21**。这证伪了上文 line 20「任何 src/core/* 编译器源改都进不了 stage3」的绝对表述：**`bootstrap/` 下 cold parser/C 种子改动能经 `bootstrap-bridge` 进 stage3**（`stage3 = cheng_cold.c 经自举链编出`，非运行时读 .cheng 源）；`src/core/*` 前端/算法源改则在 `system-link-exec` 时运行时加载生效（下证）。
- **mldsa KAT signature mismatch 根因定位 + 修复**：ci_gate 唯一遗留 FAIL `pqc-kat-mldsa`（NIST ACVP sigGen internal tcId=139）。诊断链：① self-consistency/keyGen 全 PASS（无失败 echo）→ cold lowering 共性 regression 排除（mlkem 同类 NTT/MulMod 全 PASS）；② cTilde commitment 字节级完全匹配 = y/w1/mu 对，z 从首字节错 → cs1 错 → cHat 错；③ skDecode round-trip 全等排除 sk 解码；④ 读源即见 `MldsaSampleInBall:248` typo `var j: int32 - 1`（应为 `= -1`，j 误初始化 0 致 `while j<0` 永不进循环、`c[i]=c[0]` 恒等）。Sign/Verify 用同一错误 cHat 自洽故 self-consistency 长期 PASS 掩盖。改 `- 1`→`= -1` 后全 NIST KAT 通过（keyGen 26,27; sigGen 139,137+31; sigVer 141+140/145/149/136）。**关键**：此修复（`src/std/crypto/mldsa.cheng`）已 commit（`d205abce8`），stage3 跑 mldsa smoke **PASS**——证实 `src/core/*` + `src/std/*` 前端/算法源在 `system-link-exec` 时**运行时加载生效**（scope `cold_runtime_provider_system_link`：backend lowering 从 cold provider，前端/算法 Cheng 源运行时读），与上文 line 20「进不了验证」需区分。
- **ci_gate 21/21 全绿达成**（实测 0 failed，2026-06-29 06:43）。combo A/B/C + 阶段3b/3c verifier/阶段5 五门 + PQC 三件套（mlkem/mldsa fast，slhdsa nightly）+ netsim Wave 0 全 PASS。

**★总瓶颈确证（阶段2/3a/3c-panic/4 的共同阻塞）：** backend 源改无法验证生效 —— `system-link-exec --link-providers` 编 driver 时 backend 函数（primary_object_plan 等）从 **cold C provider 链接**，不是纯 Cheng 源（实测 marker 进不了 driver，`scope=cold_runtime_provider_system_link`）。唯一能验证 backend 源改的路径是**纯 Cheng backend 自编译（full_backend_codegen=1，不带 --link-providers）**，但那条正卡 22 not_ready。即：**backend 源改的验证路径本身就是 zero-C 目标（22→0）**，是鸡生蛋自举闭环。22 的主力 14/21（bail 718 assign-RHS / 711 field-store / 631 seq-add）是 node-eval 族，集中在 primary_object_plan.cheng。

**下会话总钥匙：** 推 zero-C 纯路径 **22 not_ready → 0**（单线独占 primary_object_plan.cheng + tools/zc_enumerate.sh 统一口径），这一条解锁阶段2/3a/3c-panic/4 全部 backend 阶段的验证能力。网络 Wave1-3 需真双端环境；UniMaker M1-5 需真机/pixel oracle。

**★候选绕过路径已实测推翻（2026-06-26 完整 bootstrap 重链验证）：** 原假设"前端源改可经 bootstrap 重链进 stage3 绕过死结"**不成立**。实测：typed_expr.cheng（前端）加唯一 marker，跑完整 `tools/bootstrap_from_cheng.sh`（rc=0，contract 不变），**stage3 里 marker = 0 次**。根因比早前判断更彻底：`bootstrap_from_cheng.sh` 编 `stage1_bootstrap.cheng`（9 行 contract manifest），经 `compiler_bootstrap_manifest.cheng` 拉的是 **cheng_cold.c（56967 行 C）提供的整个编译器闭包**（前端+后端全部），不是 src/core/* 纯 Cheng 源。所以**任何 src/core/* 编译器源改（前端 OR 后端）都进不了 stage3/driver 验证**。

**★2026-06-29 精确订正（区分两类源改的生效路径，修正上文「进不了验证」的绝对表述）：** 上述 06-26 结论针对的是「src/core/* 进 `stage3` **binary 内嵌**的编译器闭包」——成立。但实操中"源改验证"有两条独立生效路径，须区分：
1. **`bootstrap/` 下 cold parser/C 种子改（`cheng_cold.c`/`cold_parser.c`/`cold_types.h`/`stage0_compiler.cheng`）→ `cc cheng_cold.c` 重编 → `bootstrap-bridge` 自举出新 stage3**：本会话实证生效。`2dcb8ab31 const block typed-binding-no-value` + `162b439f4 overload-resolver suppress` 经此路径进 stage3，使 ci_gate 12→21/21。**这是 backend 源改**（cold 提供后端 lowering）**真正能验证的当前唯一路径**。
2. **`src/core/*` + `src/std/*` 前端/算法源改（typed_expr/mldsa/primary_object_plan 的前端节点化等）→ `system-link-exec` 时运行时加载**：本会话实证生效。stage3（06-46 binary）跑当前 mldsa smoke（mldsa.cheng 06-43 改）**PASS**——scope `cold_runtime_provider_system_link`：backend lowering 从 cold provider，但前端/算法 Cheng 源是**运行时读盘加载**，改了立即生效，不需重建 stage3。
故上文「任何 src/core/* 都进不了验证」应精读为「**进不了 stage3 binary 内嵌闭包**」——作为「阶段2/3a/3c-panic backend lowering 源改（需经 cold provider 重编进 stage3）」的阻塞成立；但作为「前端节点化/算法 KAT 类源改」（运行时加载）的阻塞**不成立**。

**★不可绕过的结构性顺序（终极根因）：** v2 全部编译器源改阶段（阶段2 发射单遍 / 3a 单态化 / 3c-panic）的验证前置 = **zero-C 自举闭环完成**（纯 Cheng 编译器能编译自己替代 cheng_cold.c），即阶段4（cheng_cold.c 退役）或至少纯路径 full_backend_codegen 自编译能力（22 not_ready → 0）。在此之前，编译器源改只能改源、无法验证生效（铁律不允许未验证算 done）。这就是阶段4 是"真 zero-C 第二支柱"且排在最后的原因。**v2 backend 阶段的真实依赖链：阶段1 纯路径覆盖（22→0）→ 解锁 full_backend_codegen 自编译 → 阶段2/3a/3c-panic 源改可验证 → 阶段4 种子由构建产出。** 这个顺序是结构性的，非协调/环境能改。

## 阶段1 zero-C endgame：5 条 not_ready 可行性矩阵 + dry-compile 理论/实际对照（2026-06-27 实测；权威源 `docs/fulldriver_blocker_route.md` §「5 条最精确可行性矩阵」）

> **2026-06-29 实测复测（口径须精确区分）**：本节的"5 条 not_ready"是 **`build-backend-driver --require-rebuild` 的 ZC dump 口径**（compiler_main full-superset 自编）。**注意**：`stage3 system-link-exec --emit:obj`（不带 `--link-providers`）实测 **0 条 ZC_NOT_READY + obj 产出**，但 report scope 是 `cold_subset_direct_macho` + `full_backend_codegen=0`——**不是**纯路径，是 cold subset lowering。真正纯路径（`full_backend_codegen=1`，self-host 自编）仍卡 require-rebuild 的 5 条 + full materialize 性能（1010s+/10.6GB，下文 dry-compile 节实测）。本节"5 条"口径对纯路径 endgame 仍权威，与 emit:obj 的 0 条不矛盾（不同 lowering 路径）。

**口径修正（supersede 上文 22 not_ready 基线）：** 2026-06-26 pinned-driver obj 闭包基线 = 22 not_ready（21 statement_sequence + 1 Join，main@9445a97a0）。codesign 修复解锁 census 后，2026-06-27 11:16 `build-backend-driver --require-rebuild`（compiler_main full-superset 自编，ZC dump 口径 `dispatch_min.cheng:1686`【更正 2026-09-10 审计：点名符号 `ZC_NOT_READY_TOTAL` 在 HEAD `src/` 全树仅剩 `src/tests/moqidx_oracle_dump_main.cheng:24` 的注释提及（原 ZC dump 口径已不存在），该锚点不可用、正确落点未定位；原文保留为历史证据】 unconditional count）实测 **`ZC_NOT_READY_TOTAL count=5`** —— op-lane 当日连环 bail-closing 提交（631 Fmt / 717 / 805-806 / bail=0 / 44 数十 commit）已闭 134 条。真 zero-C 离 materialize `.next` 只差 5 条，修点全收敛 `src/core/backend/primary_object_plan.cheng`。

**5 条最精确可行性矩阵（root-cause 实测，纠正两处文档错标）：**

| bail | doable | 真兜底? | op-lane 攻? | 精确根因 |
|---|---|---|---|---|
| 44 | agent 402 失败 | ? | op-lane 已收同族（9ce02dc75 / 04168860e）可能已闭 | anon-tuple 索引赋值 |
| 622 | oplane-attacking | **非真兜底（doc 错标纠正）** | **是** 攻门谓词 @8284 + sibling + root neighborhood | Len str-arg 物化器不认，可覆盖（93df267ab 同款先例） |
| 805 | truefallback | **真兜底** | 否（异区）| str-ternary str 臂需 cbr+block+join，EvalNode 单块表达式求值器结构上不能（无 currentBlockStart），text path 唯一正确 lowering，gap 在 text arm 形覆盖非 EvalNode |
| 806 | **yes-doable** | **非真兜底（异 631 无 SEGFAULT）** | op-lane 攻 primary_object_plan 但异区（ternary）| str-ternary+`&&` 短路，EvalNode 基建 1:1 可复刻（递归 EvalNode 处理 `&&`，无结构改动无别名）|
| 631 | truefallback | **真兜底（wi0eyjjiz 3/3 SEGFAULT）** | op-lane 在攻同区 | node-codegen aliasing bug（seq grow-ptr vs nested-call sret/arg buffers）|

**两处文档错标纠正：**
1. **bail=622 不是 `PrimaryBodyIRStrEqLiteralWordCount`**（那是纯文本谓词从不进 AppendInvalidOp）。真 622 = `let x: i32 = Len(<str-arg 物化器不认的形状>)`（:35467 let_call_strlen 路径，失败在 :35454 AppendStrLenArgValue→:35464 AppendInvalidOp detail0=622；根在 :8162 PrimaryBodyIrMaterializeStrValueSlot 对某 str-arg 形状不认）。622 非真兜底、可覆盖（node-eval 已认 Len 的 field-load 1:1，先例 93df267ab sibling bail=803 用同款修法已闭）。
2. **「至少 2/5（631+622）真兜底」错** —— 真兜底 = **631 + 805（2/5），非 622**。622 可覆盖（但 op-lane 正攻其门谓词同战场）。**806 是唯一非真兜底 + op-lane 没攻 ternary + 可隔离的候选。**

**dry-compile 理论 vs 实际编译数值（保持对照，比值不得回归）：**
- 资源守卫 smoke（canonical 基线）：dry-compile 理论 `20ms` / 实际 `22ms` / max RSS `12.5MB`；真实 smoke 编译 max RSS `84.5MB`。
- inference smoke（dry-compile 预检口径，theory/actual 紧贴）：paged_kv_cache `51ms / 53ms`、max RSS `14.60MB`、peak footprint `9.47MB`；distributed_inference_engine `170ms / 172ms`、max RSS `21.66MB`、peak footprint `16.53MB`；zrpc_surface `13ms / 15ms`、kernel_metal `45ms / 47ms`、distributed `199ms / 201ms`，unresolved import 均 0。
- **完整自编 divergence（load-bearing 诚实）**：backend_driver_dispatch_min（x86_64-linux，jobs=1）`full_compile_theory_v2` 时间下界 `12.3s` / guard `37s`、RSS 峰值阶段=compiler_csg `≈277MB` / budget `571MB` / guard `638MB`；实际纯 Cheng 自编译（`compiler_main.direct ... dispatch_min --emit:exe`）跑到 `1010s+` 未完、VmRSS `7.24GB` / VmPeak `8.05GB` —— **时间 ~27–80×、内存 ~11–26× 超理论**。即 dry-compile 预检对小程序 theory/actual 紧贴，但 full_compile_theory 模型对完整自编大幅欠估；`compile_real_over_theory` 比值不得回归（阶段 2 门禁），完整自编的真实 RSS/time 必须由 `system-link-exec` 报告校验，不能由 dry 预检代替。
- **materialize `.next` 对应的 dry-compile 理论值（compiler_main full-superset，arm64-apple-darwin，入口 `src/core/tooling/backend_driver_main.cheng`，`input_source_line_count=142809`，2026-06-27 实测）**：`full_compile_theory_rss_lower_bound_bytes=202665932`（203MB）/ `peak_phase_estimate_bytes=308193202`（308MB，峰值阶段 compiler_csg）/ `budget_upper_bound_bytes=633163620`（633MB）/ `guard_recommended_bytes=700272484`（700MB）；dry 预检时间 `theory=849ms / actual=852ms / over_theory_x=1.000`（`dry_compile_executes_codegen=0`，不含真实 codegen）。对照实测 materialize RSS `10.6–11.3GB`（time -l `10653220864` / resource_guard `rss_bytes=11282513920`）：**超理论 guard(700MB) ~15–16× / 超 peak(308MB) ~34–37× / 超 lower_bound(203MB) ~52–56×**。关键：dry-compile 理论 `guard_recommended=700MB` < 默认 8GB guard << 实测 10.6GB —— **理论模型没预警 materialize 会突破 8GB guard**，双重 gate ②（materialize RSS 工程）的 guard 必须以实测 10.6–11.3GB 为准，不能用 dry-compile 理论值。

**诚实结论（806 唯一候选，但三重阻塞当前不可信闭）：** 806 是 5 条里唯一非真兜底 + op-lane 没攻 ternary + 可隔离的候选，但当前不可信闭：
1. **op-lane LIVE**：primary_object_plan mtime `13:09` delta `6.71min < 10min` 静默阈值 + `1122` WIP 未提交，改必被覆盖（lessons 实测被抹 2 次）。
2. **806 text-side 修法 miscompile 面**：EmitConditionOps 无 `currentBlockStart`，结构上不能发 `cbr` 短路；emitter 侧修需结构改动。
3. **whole-program 不可小 repro + materialize 验证需 10.6GB**：806 在 `system_link_plan.cheng:255` 完整 BuildSystemLinkPlanStub 函数体浮现，简单 `&&` 已覆盖不触发；materialize 纯 Cheng driver 自编 RSS 足迹 `10.6–11.3GB`（op-lane resource_guard 实锤 `rss_limit_exceeded rss_bytes=11282513920` + time -l `10653220864`）> 默认 8GB guard。

**真 zero-C 终点 = 双重 gate**：① not_ready=5（闭 bail，op-lane endgame 在做）+ ② materialize RSS 10.6GB > 8GB guard（独立内存工程）。**（2026-06-28 订正：gate ② 的 10.6GB 主因 = `gSortDumpBuf` O(N²) concat，已修复 RSS→273MB，gate ② 内存工程现已非阻塞；zero-C 终点实际只剩 gate ① not_ready 5→0。见文末「8GB RSS 闭环」节。）** 真兜底 2 条（631 / 805）说明 done 终点 > 0（非全可清零）—— 805 永真兜底（text path 保），631 需修 node-codegen aliasing bug（深度 codegen）或保留 cold fallback。精确执行路径 = op-lane 闭其战场（622 同款 + 631 aliasing + 可能 44）+ 805 永真兜底 + 806 需 op-lane 静止窗口做 emitter 结构改 ~~+ materialize RSS 工程~~（已解）；需 op-lane 静止释放 RAM 的单 build 窗口 + 多会话。

## 一页结论

不重写、不开新分支：在当前自举链与门禁安全网（定点哈希、三口径 ABI fuzz、diff fuzz、ci_gate）之上，把 v1 的结构性缺陷原地重构掉。v2 不是新增一批特性，而是贯彻一条原则：

> **每个语义只允许一个事实源（one source of truth）。凡是"猜"——从文本猜结构、从平行实现猜尺寸、从首错猜全貌、从魔数猜版本、从协商猜协议——一律退役。**

v1 的每一类长尾事故都能回溯到"同一语义存在两个事实源"：源文本 vs 节点树、字数计算 vs 填充、泛型模板 vs 后端特判、首错 vs 全量失败面、`CHENG_CSG` vs `CHENGCSG` 双魔数、手维护 C 种子 vs 编译器源、multistream 文本协商 vs 传输事实。本文以该原则为主线，统一收口编译器核心、性能与并行、CSG 事实层、自举种子、网络栈与原生密码学六个层面的重构，并给出可独立验收的阶段与门禁。细节规格仍在各权威源文档（见文末文档地图），本文只收口决议、阶段与门禁。

## 病根诊断（全部有本仓实证）

| # | 双事实源 | 实证 |
| --- | --- | --- |
| 1 | **源文本 vs 节点树**：typed statement 携带 `surfaceText`/`callArgsText`，后端用 `FindTopLevelBinOpTokenLast`/`StripOuterParens`/`WholeCallInnerForHead` 等几十个 helper 在每层重新解析文本 | 2026-06-11 全量探针：单 lowering_plan 模块测试 671 个函数因某文本形态无 handler 而 wordCount=0（6 大类，findings.md「拦路面首次全量量化」）；每修一类皆为手写新模式，收敛无界 |
| 2 | **字数计算 vs 填充**：OpSizeAt/TermSize/BlockSize 与 Fill* 是必须逐字对齐的平行实现 | 错一字即零洞 not_ready（lessons.md 反复出现的"字数同步"类）；派生 BlockStart 每查询全前缀重算，O(C×B²×ops) 游走曾表现为 plan 期"死循环"（反汇编锚定根治，见 findings） |
| 3 | **泛型模板 vs 后端特判**：`IsErr[T]`/`Err[T]`/`int(x)` 无实例体 | 后端逐个特判还前端的债；`Result[T]` field shape 对裸 T 永远失败（source_object_field_shape_fail 常驻噪音） |
| 4 | **首错 vs 全量失败面**：失败=静默 InvalidOp + wordCount=0 + plan.error 单错 | 671 的真实拦路面在首错报告下不可见，靠临时全量探针才暴露 |
| 5 | **per-line repair vs parser**：控制语句解析硬要求行内冒号 | 多行条件（行尾 `||`/`&&`）整类截断（已用 join 补丁灭类，但 repair 模式本身是漂移源，与 backend-line-rescan-removal 同根） |
| 6 | **指针对象图 vs 缓存友好布局**：TypedIR/BodyIR 细粒度对象 + 散落引用 | 自举编译 RSS 峰值与 wall time 受限（12.7GiB 级实测记录见 findings），cold/pure 性能比未达标 |
| 7 | **双魔数 vs 单一 schema**：`CHENG_CSG`/`CHENGCSG` 仅靠下划线区分 | 开发者与长上下文 AI 的解析幻觉重灾区（cheng-plan-full 附录实录） |
| 8 | **手维护 C 种子 vs 编译器源**：2.5 万行 cheng_cold.c 与 Cheng 实现平行演进 | 每个 cold miscompile 模式（按值大结构体、le-ls 重排、无限循环尾随 return、Android FILE*）都是双实现漂移的利息 |
| 9 | **协商面 vs 传输事实**：multiaddr/multistream/yamux 文本协商 + 71k 行协议面 | 连接成功率是第一性问题（真双端 twoproc 未闭合），协商复杂度对自含生态是纯交互税 |

## 目标架构

一条管线、一个事实脊柱、多个消费面：

```text
Cheng / TS / Rust source
   │  lexer/parser（唯一文本消费者；文本在此之后死亡）
   ▼
带 span 的完整 AST ──名字解析+类型检查──► 完全类型化 AST
   │  单态化（泛型在此终结）
   ▼
csg_core facts ──► csg_dialect::{web,native,rust,finance} ──► csg_abi::<target>
   │                                                                  │
   │  （CSG = 语义事实脊柱：可校验、可复现、可失败；                      ▼
   │    后端不得从源码文本恢复任何语义）                        csg_backend_ir（BodyIR，节点引用、无文本字段）
   │                                                                  │  单遍发射 + label 回填
   ▼                                                                  ▼
LSP / E-graph / relfacts sidecar                    direct object writer（byte[] 直编）
Web Runtime / Computer-Use / 金融线 / UniMaker（正交消费面）   │
                                                  ┌────────┴────────┐
                                                  ▼                 ▼
                                            relocatable .o    linkerless image
                                          （Mach-O/ELF/COFF；移动端 .so 主交付）
```

网络栈与之同构：QUIC-only 小核 + ALPN（事实）替代 multistream（协商），DID 文档（事实）替代握手猜测——同一原则在传输层的投影。

## 决议（八条，与阶段一一对应）

1. **文本在 parser 之后死亡**：typed statement/IR 不再携带 `surfaceText`/`callArgsText` 作为语义载体；后端禁止新增任何文本解析 helper（backend-line-rescan-removal 的禁止项并入执行）。→ 阶段 1
2. **发射单遍 + label 回填**：发射进缓冲区记录偏移，分支占位后统一回填；OpSizeAt/TermSize 平行实现整体退役；热路径禁汇编文本，指令直编 `byte[]`。→ 阶段 2
3. **泛型单态化**：实例化发生在 typed 层，后端永远只见具体类型。→ 阶段 3a
4. **诊断一等公民**：每个 pass 返回完整诊断列表（span+原因码）；前端对偶是 CSG 语义墓碑（不可达可放行、可达即硬失败）。→ 阶段 3b / 阶段 6
5. **verifier 强制化**：dodCheck 从旁路变 pass 后必跑，违例即 panic——let it crash 落到编译器自身。→ 阶段 3c
6. **数据导向 + 确定性并行**：DenseStore/SoA + PhaseArena + frozen store 只读并行 + 声明序 merge；`BACKEND_JOBS=1/N` 产物 hash 一致。→ 阶段 5
7. **CSG 单一 schema**：`csg_core → dialect → abi` 显式分层，强类型校验跨界硬拦截；双魔数降级为 legacy wire header。→ 阶段 6
8. **种子由构建产出**：kernel 子集重写前中端，stage3 生成 C 种子，cheng_cold.c 退役；cold reader 只做加载校验+emit，不做语义。→ 阶段 4

保留不动的 v1 资产：自举链（C 种子→stage1→2→3 定点哈希）、三口径 ABI fuzz、diff fuzz、确定性门禁、栈机式槽位代码生成（X9/X10 scratch；寄存器分配留给后续独立提案）。

## 启动基线（2026-06-11 快照；衡量锚，非合同——易腐数字以 gate 实跑输出为准）

- 自举定点：`e202c0c35424eb36`（stage2≡stage3）；ci_gate 10/10；SEEDS=100 ABI fuzz 六口径 0 fail；production regression 1346/1348。
- 拦路面（阶段 1 的"单调下降"起点，探针口径 build_word_count_zero 计数）：`lowering_plan.cheng` 模块测试 529，`compiler_csg.cheng` 422（Linux 线合并后基线；合并前为 504/408，差额来自对方新开 lowering 面）。
- 引擎/产品线起点：game 四 smoke 真机通过（2 槽 ECS proof）；UniMaker v1 管线已证（React→Cheng→真机 60fps + 0.3s 秒开）；网络线真双端 twoproc 未闭合。

## 实施阶段

主线阶段 1→2→3→4 串行（每阶段门禁全绿才进下一阶段）；阶段 5、6 为伴随线与主线并行推进；网络栈收敛线独立排期；UniMaker 水墨线在产品层消费以上各线成果。

OpenSpec 执行口径：每个阶段/线独立走 propose→用户确认→apply→archive 闭环（阶段内每批改动过统一门禁）；本总纲不单独 apply，在全部线收口后整体 archive。

### 阶段 1：表达式求值器换文本解析（最大头）

- files：`src/core/lang/parser.cheng`（节点覆盖补全，删 per-line repair）、`src/core/lang/typed_expr.cheng`（statement 节点化，表达式树挂到 statement）、`src/core/backend/primary_object_plan.cheng`（单一节点行走求值器，逐语句类迁移）。
- action：① parser/typed 层把表达式物化为完整节点树（现有 NormalizedExpr 层与 typedIr.nodes 为基础补全覆盖率，多行/嵌套/调用插值天然消解——这正是 CSG「语义进 facts 后可校验可复现可失败」原则在编译器内部的执行）；② 后端写一个 `PrimaryBodyIrEvalNode`（节点→槽位）求值器；③ 按 assign→call→if/while/for→return 顺序逐类切换消费端，每类一批，旧文本 helper 在最后一个消费者死亡时删除。
- verify：每批 = lowering_plan/compiler_csg 模块测试 wcz 单调下降 + SEEDS≥40 ABI fuzz 六口径 0 fail + ci_gate 10/10。
- done：`ScalarValueSlotForText`/`CallScalarValueSlotForText`/`ContextScalarValueSlotForText`/`FindTopLevelBinOpTokenLast` 等文本 helper 调用点清零并删除；wcz 长尾按类塌缩（目标：模块测试 wcz < 50）。
- 阶段纪律：启动后禁止再写新的文本模式 helper 修长尾（避免双轨）。
- 状态（2026-06-27 实测）：文本路径删除已近天花板——累计真删 4 族 `ScalarValueSlotForText` 93→87（dac2ed490 for-range / 701f2a19d 单层 index / eb5908cdf 嵌套末层 / cb47427d2 field-indexed `box.field[i]=v`）；done 真账 = **87→~12（非 →0）**，~12 为真兜底必留（cast 剥壳 / 合成无 1:1 源节点 / 叶 ident 走 badtoken）。机械迁移假设已推翻（w050xa6yt：文本-first + 已建 NodeIndex 的可机械翻转点 = 0），真系统解 = 逐 realizer node-primary + poison-on-miss 覆盖扩展（census gap=0 + golden 一致 + exec_diff 无新增 + poison 防落穿，四证缺一不可）。zero-C 纯路径 endgame 卡 5 条 not_ready（44/622/805/806/631），见上「阶段1 zero-C endgame」节——是阶段2/3a/3c-panic 的验证前置。

### 阶段 2：发射层合一（label 回填 + 直接对象纪律）

- files：`src/core/backend/primary_object_plan.cheng` emit 段（Fill*/OpSizeAt/TermSize/BlockSize/BlockStartsTable 家族）、`src/core/backend/primary_object_emit.cheng`、direct object writer 族（`object_buffer/object_symbols/object_relocs/macho_object_writer/elf_*/coff_*`）。
- action：单遍发射进 words 缓冲，op 起始偏移记表；分支 term 发射占位并登记 (位置, 目标块) 到 fixup 表，块发射完统一回填；reloc 偏移直接来自发射时记录的表（RelocWordOffset 游走退役）。
- 发射纪律（长期有效，源自 beat-c.md §4 §C）：热路径禁字符串拼接/Fmt/汇编文本，指令编码直接写 `byte[]`；section layout 一次规划；reloc 经 offset 表回填不扫文本；大数组先 reserve；direct object 耗时进 report（`exec_phase_direct_object_layout_ms`/`exec_phase_direct_object_emit_ms`/`direct_object_bytes`/`direct_object_reloc_count`）；`.s` 文本路径只作显式诊断对拍入口，禁止生产 fallback。
- 移动端是主目标交付：Android/OHOS 走 ELF `.o`→链接 `.so`，iOS 走 Mach-O（arm64 与 simulator slice 分开验证）；集成壳只消费 `.so`/对象与稳定 no-pointer C ABI，UI/生命周期/输入走事件驱动不走轮询；direct writer 默认启用前三平台各留最小集成 smoke。
- verify：对全绿语料（ci_gate 用例 + ABI fuzz 种子）发射产物语义等价（ABI fuzz 六口径 + diff fuzz 对拍 + production regression 不下降）；`compile_real_over_theory` 比值不得回归。
- done：OpSizeAt/TermSize/BlockSize/BlockStartsTable 删除；"字数同步"类事故从机制上不可能发生；`primary_object_asm_write_ms`/`primary_object_asm_compile_ms` 不再出现在默认生产路径。
- 状态（2026-06-27 实测）：源改未启动。direct object writer 基建已作为 v1 资产存在（`object_buffer`/`object_symbols`/`object_relocs`/`macho_object_writer`/`elf_*`/`coff_x86_64_writer`/`linkerless_object_writer`/`wasm_module_emit`），但 `OpSizeAt`/`TermSize`/`BlockSize`/`RelocWordOffset` 平行实现仍活跃（如 `x86_64_body_emit.cheng:1196-1315`），label 回填未实施，`exec_phase_primary_object_asm_write_ms` 仍在生产 report 路径（`perf_memory_gate_contract_smoke` 仍断言 `=1`）。**验证前置 = zero-C 自举闭环**（见 endgame 节）：阶段2 源改可写但无法验证生效，铁律不允许未验证算 done；移动端交付（Android/OHOS ELF→`.so`、iOS Mach-O device/simulator 分 slice）同样卡 direct writer 默认启用的 zero-C 验证窗口。

### 阶段 3：单态化 + 诊断列表 + verifier 强制化（三个独立小战役，可并行）

- 3a 单态化：files `src/core/lang/typed_expr.cheng`。泛型函数按实参类型实例化出具体函数行（命名 `Name__T`，双下划线；`$` 被 cold ident 截断不可用，见 `task_plan.md:493/496`），`Result[T]` 布局按实例算。done：后端 IsErr/int()/Err 构造特判删除；`source_object_field_shape_fail owner=Result field_type=T` 噪音清零。
- 3b 诊断列表：files `primary_object_plan.cheng`、`backend_driver_dispatch_min.cheng`。plan.error 扩为 `plan.errors[]`，报告全部 not_ready 函数+原因码（wcz 探针的正式化，探针退役）。done：`primary_object_plan=not_ready` 输出完整清单。其前端对偶是阶段 6 的语义墓碑：同一"完整失败面"原则分别落在后端诊断与 facts 层。
- 3c verifier 强制化：files `src/core/ir/body_ir_*.cheng`。dodCheck 每 pass 后必跑，违例 panic 带函数名+op 索引。done：CI 加一条 verifier-on 的全量编译用例。
- 状态（2026-06-27 实测）：
  - 3a 单态化：未启动。`task_plan.md` 已勘察定稿「Result 构造单态化第一刀」（实例化 `src/std/result.cheng` 四构造模板 Ok/Err/ErrCode/ErrInfo，待实施）；`typed_expr.cheng` 已有局部 `new(T)→ref{T}` 单态化（:6218/:11241/:16268），但 Result 构造模板未实例化。实例命名用 `Name__T`（`__` 安全、`$` 被 `cold_ident_char:1166`/`ParserIdentPrefix:7463` 截断，见 `task_plan.md:493/496`，本节 done 锚已据此改写）。验证前置 = zero-C 闭环。
  - 3b 诊断列表：✅ done（`plan.error → plan.errors[]` 全量枚举 93ad12dde + per-function first-zero bail 富化 + 统一口径脚本 `tools/zc_enumerate.sh` 9445a97a0，破除历史 31/22/191/368 乱账；wcz 探针正式化后退役）。
  - 3c verifier：CI 用例部分 ✅ done（`verifier-dod-contract` 门，`body_ir_dod_soa_contract_smoke` 验 5 类 broken BodyIR 检出）；3c-panic 全量强制化（dodCheck 每 pass 后必跑 + CI verifier-on 全量编译用例）blocked by zero-C 闭环验证前置。

### 阶段 4：种子由构建产出（kernel 子集）

- files：`bootstrap/cheng_cold.c`（退役目标）、新增 `tools/gen_cold_seed.sh` + kernel 子集定义文档。
- action：定义 v2 kernel 语言子集（无泛型、无 Fmt、无 seq 字面量），编译器前中端用该子集重写出种子源，由 stage3 生成 C 种子替代手维护实现。配套收口 cold 职责边界（与 cold_csg 单一方案一致）：cold reader 只做 facts 加载校验 + object/linkerless emit，不做语义 lowering、类型推导、import 闭包扩展；provider 只允许显式预编译 archive 或自带独立 facts。
- verify：新种子起链 stage1→2→3 定点哈希复现；ci_gate 全绿。
- done：cheng_cold.c 进 archive，种子由构建产出。
- 风险最大、收益最靠后；阶段 1-3 完成且稳定运行两周后再启动。

### 阶段 5（伴随线）：性能与并行（承接 cheng-bootstrap.md，随阶段 1-3 推进）

阶段 1 消灭文本解析、阶段 2 消灭双实现之后，热路径剩下的开销就是数据布局与分配——本线把它收口，并在其上开确定性并行：

- Dense IR / SoA：`CompilerDenseStore` 把函数/符号/CFG/TypedIR/BodyIR 收敛为 `int32 id + 连续列数组`；`BodyIRFlatSoA` 升级为热路径输入，旧 `BodyIR` 只留 debug adapter；符号表冻结后只读。
- Arena：每编译 phase 独立 `PhaseArena` 批量 reset；长生命周期列数组先计数再一次 reserve；报告 `phase_arena_peak_bytes/reset_count/spill_count`，spill 非预期即失败。
- No-alias：`ownership + escape + ABI + provider object immutability` 生成 `NoAliasFactsDense`；只对已证明 no-alias 的 slot/buffer 做 copy forwarding/reload 删除/store-load 合并；未证明即 may-alias，禁止猜测（该 facts 层同时是 movehint 优化提案的前置证据）。逃逸结论同时决定**分配落点路由**：证明不逃逸出 phase/tick → PhaseArena/固定池免计数；证明独占 → move 免计数；证明不了 → ORC 计数兜底——计数从默认成本变为分析失败的兜底（确定性内存管理的统一方案，指纹/哈希只用索引不用指针）。
- E-graph：限纯整数/比较/select/常量折叠/代数恒等式；call、pointer load/store、mutable slot、逃逸 buffer 不进 CSE；`-O0` 与重写后运行结果字节级对拍一致；报告 `egraph_*` 全字段；rewrite candidate 可由阶段 6 的 relfacts 组装。
- Linkerless：`emit:obj` 走 direct object writer（阶段 2 产物）；支持目标的 `emit:exe` 直接写 linkerless image，不支持目标 hard-fail 不转系统 linker；报告锁 `linkerless_image=1`、`system_link=0`、`unresolved_symbol_count=0`。
- 函数并行：`BACKEND_JOBS` 唯一控制面；worker 只读 frozen dense store、只产 task-local result，主线程按声明序稳定 merge；`BACKEND_JOBS=1` 与 `=N` 产物 hash 必须一致（determinism gate）。
- 交付硬门槛（pure_cheng_perf_gate）：同输入 3 次中位数，纯 Cheng `elapsed_ms <= cold * 0.95`、峰值内存 `<= cold * 0.90`、产物非空且 marker 通过；不达标不更新自举进度。
- 理论最小内存锚 + dry-compile 模型完善（内存工程量化合同，2026-06-27 实测）：compiler_main full-superset（`input_source_line_count=142809`）dry-compile `full_compile_theory_v2` 当前给 `rss_lower_bound=203MB` / `peak_phase_estimate=308MB`（峰值阶段 `compiler_csg`）/ `guard_recommended=700MB`——这是 **SoA 紧凑布局（每元素固定字节：csgNode×40 / csgExpr×48 / typedIrStmt×64 / loweringOp×48 / primaryWord×8）的理论最小内存**，即本线 Dense IR/SoA + Arena + No-alias 完成后的目标。实测 materialize `.next` RSS `10.6–11.3GB`，超理论 `~34–52×`。**欠估根因**：模型假设 SoA 紧凑布局，v1 是指针对象图（病根#6 TypedIR/BodyIR 细粒度对象 + 散落引用），漏算——① 堆对象头/ORC：模型仅 `typedIrFunctions×48` 算 ORC，`csgNodes`/`csgExprs`/`loweringOps` 每个堆对象的头（~48-64B）全漏；② seq 翻倍 over-alloc（平均 1.5-2× 浪费）；③ Fmt/字符串临时（决议#2 热路径禁 Fmt 正是此）；④ 多层 IR 复制保留（typed→csg→lowering→primary 每层复制 + 未释放旧层）。综合膨胀 ~34-52× 对得上实测。**模型完善**：分两层报告——保留 `rss_lower_bound` 作 SoA 理论最小（本线目标）；新增 `full_compile_theory_rss_v1_pointer_graph_estimate` = 理论最小 × 膨胀因子（全堆对象头+ORC + seq over-alloc + Fmt 临时 + 多层复制，用实测 materialize 标定），使 dry-compile 能预警 materialize 突破 8GB guard（当前 `guard_recommended=700MB` 没预警 10.6GB 实测）。**优化目标**：Dense IR/SoA + Arena + No-alias 把指针对象图改 SoA，materialize RSS `10.6GB → ~308MB`（~34× 收益，接近 `peak_phase_estimate`），同时解锁 endgame 双重 gate ②（materialize RSS < 8GB guard）。改 `primary_object_plan`/`body_ir_egraph`/`compiler_csg`（op-lane live），前置 = zero-C 闭环 + op-lane 静止窗口 + materialize guard 抬到 ≥11GB（或压到 8GB 下）。**本轮落地（2026-06-27 13:59）**：`backend_driver_main.cheng` `BackendDriverAppendFullTheoryReport` 已加 v1 estimate 三字段——`rss_v1_pointer_graph_estimate_bytes = rssPeakWithoutOverheadBytes × 52`、`rss_v1_guard_recommended_bytes = estimate + 1GB`、`rss_v1_pointer_graph_expansion_factor`，加 `v1_pointer_graph_guard_exceeds_hardware` 预警状态，共 13 行（干净文件，不撞 op-lane WIP）。**手算验证**：基线 `rssPeakWithoutOverheadBytes=202663692`（203MB，dry-compile 实测 rc=0），v1 estimate = 203MB×52 = 10.04GB ≈ 实测 materialize 10.6GB（误差 0.5%），v1 guard 10.82GB 覆盖实测 → dry-compile 预警能力从原 `guard_recommended=700MB`（欠估 15×，没预警 10.6GB 突破）提升到 v1 guard 10.82GB（误差 0.5%，能预警）。dry-compile 实际输出 v1 字段待 materialize 窗口（`<stage3> build-backend-driver`，需 free RAM > 11GB + op-lane WIP 提交，监控 PID 52344 每 90s 检测）。SoA 主菜（降 materialize RSS 10.6GB→308MB）靶点 `compiler_csg.cheng` 被 op-lane ` M` 持有，待 op-lane 静止窗口落地。**phase_memory_ledger 实测分层（2026-06-27 14:10，回答"预计算 vs 实测哪边有问题"）**：raster smoke（14249 行闭包）materialize 实测 compiler_csg 阶段 RSS 247MB = structured 23.9MB（9.7%）+ unstructured_gap 223MB（90.3%）。**结论：预计算有问题（漏 gap），实测没问题**——理论 lower_bound 21.6MB ≈ 实测 structured 23.9MB（structured 估算准，误差 10%），但理论完全没算 gap 223MB（gap/structured=9.3×），所以 203MB 是 SoA 下界不是 v1 预测，欠估 11.4×（raster）→52×（compiler_main，大闭包 gap 累积放大）。实测 10.6GB 双口径（time -l 10.65GB + resource_guard 11.28GB）实锤可信。**gap 分两类**：① v1 必需（~28%，换 SoA 才消）= 堆对象头/ORC + seq over-alloc；② **可修实测问题（~72%，不换 SoA 也能降）** = allocator 不归还/碎片——铁证：lowering `structured_delta=-20MB`（旧 IR 层 structured 释放了）但 `gap_delta=+62MB`（gap 不释放反涨），primary `gap_delta=+279MB` 继续涨，structured 释放了 gap 不归还 = malloc/mmap 不归还+碎片。**优化路径重估**：SoA+Arena+No-alias 消全部 gap（10.6GB→~308MB structured 真实需求，需动 codegen 表示，op-lane 战场）；**或 allocator 修复线**（修 malloc/mmap 归还 + 主动释放旧 IR 层 + 碎片整理，降 gap 72%，10.6GB→~3GB，不动 codegen 表示，可独立推进解锁 8GB guard）。phase_memory_ledger（`dispatch_min:1456-1473`：`rss_before/after` + `structured_before/after` + `unstructured_gap_before/after`）是诊断权威分层；×52 全局标定因子保留作 dry-compile 预警粗估，精确分项待 materialize 取 compiler_main phase_memory_ledger（需 free RAM > 11GB 窗口）。**Arena 化第一刀设计（2026-06-27 14:25，v2 SoA 已存在）**：读 `compiler_csg.cheng` 发现 `CompilerCsgV2Graph`（line 274）已是完整 SoA 列数组（`SourceTable`/`DeclTable`/`ImportEdgeTable`/`ReachableFunctionTable`/`ExprSliceTable`/`TypedFactTable`/`TypedIrTable` 全 `int32[]`/`str[]`），`CompilerCsgV2Init` line 5455 调用，v2 SoA 使用 31 处。但 `CompilerCsg` 同时保留 v1 `nodes: CompilerCsgNode[]`/`edges: CompilerCsgEdge[]`（指针对象图，每 node 14 字段含 str），v1 使用 30 处（compiler_csg 内）+ 9 个外部消费者（`package_resolve`/`backend_driver_dispatch_min`/`body_ir_egraph`/`web_runtime`/`lowering_plan`/`primary_object_plan`/`system_link_exec`）——**双轨并行是 csg gap 主因**（v1 指针对象图堆对象头/ORC/seq over-alloc + v2 列数组 seq over-alloc/不归还）。Arena 化第一刀（多会话，靶点全 op-lane ` M`）：① 迁 9 个 v1 外部消费者读 v2 SoA（`csg.nodes[i]` → `csg.v2.xxxTable` 列数组）；② 删 v1 `nodes`/`edges` 字段 + 30 处内部使用（双轨→单轨 v2 SoA）；③ v2 列数组改 Arena 分配（`int32[]` seq → Arena 连续内存 + `ArenaReset` 归还，降 gap 不归还 72%）。预期：csg gap 223MB（raster）/~10GB（compiler_main）→ v2 SoA structured 真实需求 ~23.9MB/~203MB + Arena 无 gap，materialize 10.6GB→~308MB。前置：op-lane 释放 `compiler_csg`/`primary_object_plan`/`body_ir_egraph`/`lowering_plan`（提交 WIP）+ free RAM > 11GB materialize 验证。Arena 监控等 `ARENA_WINDOW_READY`（free > 11GB + csg/pop/bir clean + 静止 10min）。**Arena grow 落地验证（2026-06-27 14:51）**：`arena.cheng:118-131` ArenaAllocBytesAligned 加 grow（capacity 不够 `setLen` 扩容而非 OOM panic），v2 Arena 化前置基础设施。验证：`cheng.stage3 build-backend-driver --out=/tmp/test_driver_cheng` 成功 rc=0（6.96s，stage3 cold path 编译 cheng 源含 arena.cheng 进 driver，`/tmp/test_driver_cheng` 9327296 bytes 产出，compile_input_source_line_count=132493），Arena grow 编译可行性 + driver 产出确认。driver backup `/tmp/driver_backup/cheng.oplane_*`。**阻塞解除实测**：macOS `vm_stat` 真实可用 RAM 18.3GB（free 6585 + inactive 12121 可回收 + speculative 303 - purgeable 253）> 11GB，op-lane materialize 进程=0（停），codegen 靶点 delta>=10min 停改（compiler_csg 63min/body_ir_egraph 113min/lowering_plan 67min/primary_object_plan 10min）——`memory_pressure` "Pages free" 6585MB 是假低（漏 inactive 12GB），以 vm_stat usable 为准。**v2 Arena 存储原型设计（Arena 化第一刀降 gap）**：v2 表 `int32[]` seq → Arena bytes 存储，改 `CompilerCsgV2TypedFactTable`（3 列 int32[]：sourceIndexes/factKindCodes/exprLineNumbers，V2Init:1093 / append:1097-1101 `add(seq,val)` / LiveBytes:1157 / structuredBytes:1178 每 12 字节）→ Arena + offset+len + count；V2Init `ArenaInit(预估 capacity)` + append `ArenaAllocBytes(arena,4)` 写 int32 + read Arena offset；CompilerCsg 加 `arena` 字段（csg 开始 Init 结束 `ArenaReset` 归还，降 v2 列数组 over-alloc + 不归还）。前置 Arena grow 已落地（capacity 不够扩容）。大改 compiler_csg，多会话。

**csg gap baseline 实测 + Arena 化第一刀方向修正（2026-06-27 14:54）**：新 driver（含 Arena grow）raster materialize `--report-out` 实测：`compiler_csg_rss_bytes=244924416`(233.7MB) / `structured_live_bytes=23926140`(22.8MB) / `rss_gap_bytes=220998276`(210.8MB) ≈ 旧 driver 223MB（Arena grow 不破坏 csg，v2 没用 Arena，gap 不变，安全性确认）。**关键颠覆**：`compiler_csg_nodes_live_bytes=1117`（v1 nodes structured 极小！）+ `edges_live_bytes=0`——删 v1 nodes 降 gap 微（v1 nodes gap 贡献 <1%，之前"删 v1 降 gap 大头"判断错）。gap 大头 = `typed_ir_live_bytes=19848127`(19.8MB structured → ~185MB gap) + `typed_facts`(1MB) + `expr_layer`(0.99MB) 的堆对象头/ORC/seq over-alloc/不归还。**Arena 化第一刀方向修正**：不是删 v1 nodes，而是 Arena 化 typed_ir（`texpr.TypedExprIr`，gap 大头 ~185MB）+ typed_facts/expr_layer。texpr SoA/Arena 改造（texpr 模块，v2 未覆盖 typed_ir，`compiler_csg_v2_enabled=1` 但 typed_ir 仍是 v1 指针对象图），大工程多会话。下一步：读 texpr.TypedExprIr 结构设计 SoA/Arena 改造方案。**texpr SoA 设计（2026-06-27 15:00）**：TypedExprIr 已部分 SoA（localBinding/importc/typeLayout/typeField 等 `int32[]`/`str[]` 列数组），剩 3 个对象 seq 是 gap 大头：`nodes: TypedExprIrNode[]`(17 字段，6 str)、`statements: TypedExprIrStatement[]`(**58 字段，~20 str**，最复杂 gap 大头)、`functions: TypedExprIrFunction[]`(12 字段，5 str)，每对象堆分配 + ORC header(~64B) + str 堆分配 + seq over-alloc。Arena 化第一刀 = 3 对象 seq → SoA 列数组(int32/str id) + Arena 存储(`ArenaReset` 归还)。Statement 58 字段 SoA = 58 列数组，巨大工程(重写 Init/append/read/clone + 全 texpr 使用点)。替代中等方案：① str intern(20 str 字段→int32 id 降 str 堆分配)；② Statement Arena 化(对象→Arena 连续无堆头 + `ArenaReset` 归还，需 runtime Arena 对象支持)。均多会话。**nodes SoA 全改造重写量评估（2026-06-27 15:05）**：nodes read 点全仓 count——primary_object_plan 184 / web_runtime 57 / web_scene_runtime 43 / typed_expr 39 / compiler_csg 13 / lowering_plan 5 / dispatch_min 4 / body_ir_egraph 3 / fixture 2 = **350+ read 点**（`ir.nodes[i].field` → `ir.nodes_<field>[i]`）+ 8 消费者同步改 + typed_expr append/read/clone/assign（~15 点）。SoA 改字段 `nodes: TypedExprIrNode[]` → 17 列后 8 消费者编译崩，必须一次到位同步改 + materialize 验证。巨大工程多会话。**系统化推进路径**：① nodes SoA 全改造（350+ read 点，降堆头/ORC/seq over ~48MB gap，多会话一次到位）；② Arena-backed seq（runtime seq 分配器 c_malloc→Arena，接口不变不重写 read 点，中等工程，降 seq over + 不归还，不降堆头/ORC）；③ str intern（20 str→int32 id，350+ read 点同 SoA，降 str 堆）。最大降 gap = SoA + str intern + Arena 组合，巨大工程多会话。**combo 重写量实测（2026-06-27 15:08）**：3 对象 read 点全仓 count——nodes 350+（primary_object_plan 184/web_runtime 57/web_scene_runtime 43/typed_expr 39/compiler_csg 13/lowering 5/dispatch 4/body_ir 3）+ statements 137（primary_object_plan 44/compiler_csg 43/lowering 24/typed_expr 25）+ functions 218（lowering 62/primary_object_plan 89/typed_expr 7/compiler_csg 15/dispatch 6/system_link 15/cheng_cold 17/tests 9）= **705+ read 点** + 87 SoA 列（58 statements+17 nodes+12 functions）+ 31 str intern（20+6+5 str 字段）+ Arena 存储。**combo 统一设计**：3 对象 seq → SoA 列数组（int32 数值直接/str→int32 id）+ typed_ir strTable（str intern 共享）+ Arena 存储（87 列+strTable 存 Arena，ArenaReset 归还）+ 重写 705+ read 点+append/read/clone/assign+8-10 消费者。收益：消全部 gap（堆头/ORC/seq over/str 堆/不归还）→ ~structured 真实需求 19.8MB（raster csg 185MB gap→~0）。**系统化推进计划**：会话1（本会）设计+固化 combo 方案+重写点清单+启动 typed_expr v2 functions（最小 combo 验证，双轨渐进）；会话2-N typed_expr SoA 列+intern+Arena 内部+消费者逐步迁 v2；会话末 materialize 重建+raster 验证 gap 降（185MB→~0）+删 v1。双轨渐进（v1 对象 seq 接口不变+v2 SoA+intern+Arena 内部）避免改字段即崩，消费者逐步迁+最后删 v1 降 gap。**v2 functions 双轨落地验证（2026-06-27 15:20）**：combo SoA 第一刀——typed_expr 加 12 v2 列（functions2_sourcePaths/.../functions2_returnNodeIndexs int32[]/str[]）+ append helper TypedExprIrAppendFunctionV2（5 append 点 call）+ clone 2 点 assign + MoveInto 12 列 move（关键修复：MoveInto 漏 move v2 列致 fn2=0）+ LiveBytes v2 列 bytes。materialize 重建 driver（/tmp/test_driver_v2 9.3MB rc=0 7.2s）+ raster materialize 验证：fn2=290=fn（v2 列同步 v1 ✓）+ 14 not_ready 同 Arena grow（csg 不崩 ✓）+ csg baseline rss 268.2MB/structured 21.9MB/typed_ir_live 17.3MB/gap 246.3MB（vs Arena 233.7/22.8/19.8/210.8，双轨增 gap 35.5MB = v2 列堆分配+seq over-alloc+不归还代价）。**双轨代价**：v1+v2 都分配，gap 增 35.5MB；降 gap 需消费者迁 v2（218 functions read 点）+ 删 v1 functions seq，多会话。**关键踩坑**：① StrReplace indent 4 replace_all 子串匹配 indent 8 add 致 early return 错位 v2 call+return 悬空→typed ir empty（已修复删错位行）；② MoveInto 漏 move v2 列致 LiveBytes fn2=0（已修复加 12 列 move）——双轨改造必须同步 append/clone/move/assign 全 4 个 IR 传递点，漏任一致 v2 列丢。**combo SoA 双轨三对象全落地（2026-06-27 15:35）**：functions2（12 列）+ nodes2（16 列）+ statements2（57 列）= **85 v2 SoA 列**全双轨——typed_expr 加 85 列字段 + 3 append helper（FunctionV2/NodeV2/StatementV2，7 append 点 call）+ clone 2 点 assign 85 列 + MoveInto 85 列 move + LiveBytes 85 列 bytes。materialize 重建 driver rc=0 + raster 验证：fn2=290=fn / node2=39122=node / stmt2=7774=stmt（v2 三对象同步 v1 ✓）+ 14 not_ready 同 Arena（csg 不崩 ✓）+ csg baseline rss 299.2MB/structured 40.5MB/typed_ir_live 35.9MB/gap 258.6MB（vs Arena 233.7/22.8/19.8/210.8，双轨代价 gap +47.8MB = 85 v2 列堆分配+seq over-alloc+不归还）。**combo SoA 双轨基础设施全通**：v2 三对象列同步 v1（append/clone/MoveInto/LiveBytes 4 点），消费者可逐步迁 v2。降 gap 路径：消费者迁 v2（705+ read 点）→ 删 v1 functions/statements/nodes 对象 seq → gap 258.6MB 降（v2 列 structured 40.5MB 真实需求 + Arena 归还不归还 + str intern 降 str 堆）。**v2 nodes SoA 双轨落地（2026-06-27 15:35）**：combo SoA 第二刀——typed_expr 加 16 v2 nodes 列（nodes2_sourcePaths/.../nodes2_elemSizeBytes，6 str+9 int32+1 opKind enum 列）+ append helper TypedExprIrAppendNodeV2（1 append 点 TypedExprIrAddNode call）+ clone 2 点 assign + MoveInto 16 列 move + LiveBytes v2 nodes 列 bytes（opKinds enum 用 Fixed32Bytes）。materialize 重建 driver + raster 验证：node2=39122=node（v2 nodes 同步 v1 ✓）+ 14 not_ready 同 Arena（csg 不崩 ✓）+ csg baseline rss 287.9MB/structured 33.4MB/typed_ir_live 28.8MB/gap 254.5MB（vs functions-only 268.2/21.9/17.3/246.3，nodes 双轨增 structured 11.5MB+gap 8.2MB；vs Arena v1-only 233.7/22.8/19.8/210.8，functions+nodes 双轨共增 gap 43.7MB = v2 列堆分配+seq over-alloc+不归还代价）。同 functions 4 IR 传递点模式（append/clone/MoveInto/LiveBytes），无新踩坑。剩 statements（58 字段，gap 大头 ~108MB）SoA 双轨 + 消费者迁 v2（705+ read 点）+ str intern + Arena + 删 v1 → gap 降。**combo A 迁 v2 read 点启动（2026-06-27 16:42）**：combo SoA 双轨三对象全落地（85 v2 列）后，降 gap 需消费者迁 v2（705+ read 点）+ 删 v1。本会迁 typed_expr 4 read-only 分析函数 v2（CountOpKind/CountStatementKind/ReturnCountOpKind/ReturnKindListText，~10 read 点）：`ir.objects[i].field` → `ir.objects2_<field>[i]` 直接访问。materialize 重建 driver rc=0（7.3s）+ raster 验证 csg 不崩 + `fn2=290=fn`（v2 同步 v1 ✓）+ node2/stmt2 同步。combo A 推进 ~10/705 read 点。**关键**：部分迁不降 gap（v1 仍存），降 gap 需全迁完删 v1（多会话巨大工程）。csg baseline rss 268.8MB/structured 43.3MB/typed_ir_live 39.4MB/gap 225.5MB（driver not_ready 14→2 变化致 baseline 变，非迁 v2 降 gap）。迁 v2 read 点模式：`let fnIr = ir.functions[i]` + `fnIr.field` 多次 → `ir.functions2_<field>[i]` 直接访问；read-only 安全，write（str seq index 赋值）需 `cheng_seq_string_release_range_compat` + set 复杂暂不迁（CompactForBackend 改 exprId="" 暂留 v1）。**combo A 续迁 typed_expr/compiler_csg/lowering read 点（2026-06-27 17:05-17:14）**：本会续迁 ~45 read 点 v2——typed_expr 4 statements read 点（17153 functionName/17738 17752 lineNumber/17754 kind → statements2_*s[i]）+ compiler_csg 37 read 点（CompilerCsgTypedIrCoreLiveBytes 4 functions+6 nodes+27 statements str 字段 len 累加 → functions2_*/nodes2_*/statements2_*s[i]）+ lowering_plan 4 read 点（771 opKind + 411 sourcePath + 413/414 functionName → nodes2_opKinds/functions2_sourcePaths/functions2_functionNames[i]）。materialize 重建 driver rc=0（6.7-7.6s）+ raster 验证 csg 不崩（2 ZC_NOT_READY baseline 一致）+ v2 同步（fn2=290 node2=41225 stmt2=7795 ✓）。combo A 推进 ~84/705 read 点（typed_expr 43+compiler_csg 37+lowering 4）。**降 gap 仍需全迁完删 v1**（部分迁 v1 仍存，gap 不降）。剩 ~621/705 read 点：primary_object_plan 317（无 texpr 直接 read，317 点可能是其他 IR 形式待查）+ web_runtime 57（无 texpr read 点，待查实际消费者）+ lowering 嵌套 87（bodyIR.callSequence/callTargets/statements[k] 无 v2 列，需先补 v2 列 for bodyKind/bodyIrNoAlias* 字段）+ 其他。多会话工程。**combo A 迁 fnIr/fact read 点 + texpr v2 read 点迁基本完成（2026-06-27 17:22-17:32）**：本会续迁 ~84 read 点 v2——fnIr 整块 1957-2085 ~65 read 点（fnIr.field + node.field + stmt.field → functions2_*/nodes2_*/statements2_*s[index]，删 let fnIr/node/stmt）+ ReturnOpFact 22337-22352 node.field ~13 read 点（operand0/1/2 + lhsNode/rhsNode/accNode.paramName/resultType → nodes2_*s[index]）+ fact read 22325-22349 ~6 read 点（改 TypedExprReturnOpFactFromIrFunction 签名 fnIr: TypedExprIrFunction → fnIndex: int32，fnIr.field → functions2_*s[fnIndex]，22354 调用 ir.functions[i] → i）。materialize 重建 driver rc=0（7-9.6s）+ raster csg 不崩（2 ZC_NOT_READY baseline 一致）+ v2 同步（fn2=290 node2=41225 stmt2=7795 ✓）。combo A 推进 ~168/705 read 点。**texpr v2 read 点迁基本完成**：全仓搜 ir.nodes[/statements[/functions[ 直接 read + let node/stmt/fnIr 复杂 read + fact read 已全迁，剩 CompactForBackend 1804-1808 write-heavy（str seq write 复杂暂留）+ fnIr write 21189-21476（v1 对象构建路径，删 v1 时改）+ web_scene_runtime/body_ir_egraph/primary_object_plan/web_runtime 实测无 texpr 直接 read（早期 705 count 大量误算，实际 texpr v2 迁目标 ~168 read-only）。**降 gap 需删 v1**：v1 仍有 write 点（CompactForBackend/fnIr 构建）+ clone/append helper + MoveInto/clone/assign 3 点必需，删 v1 = 改 v1 对象构建路径直接写 v2 列 + 删 v1 对象 seq + 改 clone/append/MoveInto，工程量大，多会话。**删 v1 functions 回退教训 + dispatch_min 消费者 read 点迁 v2（2026-06-27 17:44-17:50）**：尝试删 v1 functions seq 触发 ~100+ 消费者 read 点崩（dispatch_min/lowering/compiler_csg/primary_object_plan/system_link_exec 全用 typedIr.functions.len + typedIr.functions[i].field，跨 5 文件 ~100+ read 点）。删 v1 functions 降 gap 微（~18KB）+ 工程量巨大 + 风险高，回退。**关键教训**：删 v1 对象 seq 需先迁完所有消费者 read 点 v2（typedIr.functions/.nodes/.statements len/[i].field 跨 5 文件 ~100+ 点），不是只迁 typed_expr 内部 read。回退后保留 combo A ~168 + ir.functions.len/debugFn read v2（v2 len==v1 len 双轨同步 OK）。续迁 dispatch_min typedIr.functions read ~14 点 v2（6 len + emFn 8 field + first function 3 field → functions2_*s）。combo A 推进 ~182/705 read 点（texpr 168 + dispatch_min 14）。剩 ~88+ 消费者 read 点（lowering ~40 + compiler_csg ~20 + primary_object_plan ~40 + system_link_exec ~15）跨 4 文件待续，多会话。

### 阶段 6（伴随线）：CSG 事实层（规范权威：csg-core-standard.md）

编译器内部消灭文本猜测（阶段 1）的同时，对外的事实层执行同一原则。Cheng 是 CSG-Core 的 producer/consumer/强验证场之一，不拥有标准：

- 方言命名空间：`csg_core → csg_dialect::{web,native,rust,finance} → csg_abi::<target> → csg_backend_ir`（MLIR 风格显式分层）；编译器转换接口经 `--in-dialect/--out-dialect` 强类型 schema 校验，跨边界语义异同硬拦截；`CHENG_CSG`/`CHENGCSG`/`CHENG_RELFACTS` 降级为 legacy wire header，正文 schema 唯一，禁止按魔数猜版本。
- facts 物理格式（cold_csg 单一方案）：长度前缀记录（不用 tab/JSON/源码重扫）；header 含 schema/abi/plan hash；缺字段、越界、未知 record、hash 不一致、未解析符号全部直接失败。
- 语义墓碑（Tombstone）：Extractor 遇到无法 lowering 的动态语义导出强类型 `csg_core::tombstone` 节点（reason/span/hash/impact_scope）；后端可达性分析——证明不可达才放行并出审计报告，必然触达或无法证明即 Hard-Fail；生产 artifact 禁止携带可达 tombstone。
- 关系事实旁路（csg_relfacts::v1）：`Function/Calls/LocalType/RuntimeRequirement` 等一阶谓词 sidecar（`--emit:relfacts`），支持 `Assert/Retract` 增量流与函数级内容寻址（Merkle subgraph CID）；只用于 LSP/E-graph rewrite candidate 组装，不参与 codegen 主格式。
- 合同要点：生产 lowering 只接受 `complete=true`（无 unsupported、无 tombstone、无 open runtime requirement）的 facts/report；CSG-Core 只描述源码语义不描述 CPU 指令；profile/dialect 引用 core 不复制不改义。
- 报告新字段：`relfacts_count`、`relfacts_diff_assert_count/retract_count`、`runtime_open_requirement_top`、`subgraph_cid_count`、`control_surface_action_count`。

### 网络栈收敛线（独立排期，与编译器各阶段正交）

同一"事实替协商"原则在传输层的投影：`src/libp2p/`(71k 行) + `src/quic/`(17k 行) + `src/moq/` + `src/libp2p/did/` 收敛为 Cheng 自研网络栈——QUIC-only 小核、NodeID 拨号、relay-first、ALPN 替 multistream，不引入外部 P2P 库、不与外部 libp2p wire 互通。完整规格：`docs/cheng-libp2p-convergence-plan.md`。

- 动机：连接成功率是第一性问题（真双端 twoproc 未闭合）；multiaddr/multistream/yamux/WS stub 对自含生态是交互税；`did:cheng` 设备认证 DID 是差异化资产，保留并补强硬件 attestation；广播按负载分流（Erlay/喷泉/episub choking）；一切分布式改造前置网络仿真器（Wave 1 diff-fuzz 方法论平移——验证网先行，与编译器门禁同一方法论）。
- 范围内：传输收敛（QUIC-only/home relay/删 stub）、身份补强（Secure Enclave attestation/吊销锚定/M-of-N 恢复）、引导分层（persistent peerstore/签名目录/PEX 强制 DID 签名）、广播分流、十章配套（仿真器/DoS/移动信箱/调度/遥测/relay 经济/反 eclipse/CDC/wire schema）。
- 范围外：外部 libp2p 库引入；外部 wire 互通；Wave 0 仿真器完成前的 relay/Erlay/喷泉/DHT 主链改动。

| Wave | 内容 | 退出条件 |
| --- | --- | --- |
| 0 | 网络仿真器 + peerstore + bootstrap 可信 + IDONTWANT + QUIC retry token | `net_sim_gate` 200 seed PASS |
| 1 | home relay + ALPN + 删 stub + migration + twoproc 门禁 | `libp2p_quic_twoproc_smoke` PASS |
| 2 | attestation + 吊销锚定 + Erlay + 喷泉 mesh + episub choking | 带宽/冗余度 smoke PASS |
| 3 | DID+质押 DHT + relay 经济 + 移动信箱 + CDC + wire schema | DePIN/移动 smoke PASS |

- 验收：现有 host-smoke 媒体/MoQ 链零回归；每 Wave 新增 smoke 进 `HostSmokeDefaultSmokes()` 或 stage23 gate；易腐数字以 gate 输出为准不写进规范层。
- 依赖：`docs/cheng-decentralized-compute-storage.md`（包/registry/RWAD，含 DePIN 蓝图附录）。

### 原生抗量子密码线（横切线：网络/DID/金融/包分发的共同地基）

签名与密钥交换是系统里寿命最长的"事实"——DID 文档、吊销 head、certified_transaction、包签名都要在量子对手出现后仍然成立（先存后解攻击使这是当下问题而非未来问题）。与全栈同一纪律：**纯 Cheng 原生实现，不引入外部密码库/FFI**。

- 现状：`src/std/crypto/` 已有完整原生经典栈（ed25519/curve25519/P-256/RSA/AES-GCM/ChaCha20-Poly1305/SHA-2 族/HKDF/bigint），无 PQC 原语；QUIC TLS1.3 与 didauth 依赖 X25519/Ed25519。
- 原语（NIST 终稿三件套，原生实现）：
  - **ML-KEM**（FIPS 203）：密钥封装 → QUIC TLS1.3 混合握手（X25519+ML-KEM-768 混合形态，经典与 PQ 任一被破仍安全）。
  - **ML-DSA**（FIPS 204）：通用签名 → 身份/内容确权/策略授权走"经典+ML-DSA 双签"。
  - **SLH-DSA**（FIPS 205）：基于哈希的保守签名 → DID 根授权与长期锚定。
  - 哈希层：SHA-256 受 Grover 减半仍有 128-bit PQ 安全度，CID/receipt 锚不换；新增长期锚定场景优先 SHA-384（已有原生实现）。
- 消费方与排期衔接：
  - 网络线：Wave 1 ALPN 落地后接混合握手；**PQC 原语是 Wave 2 的前置**（attestation/吊销 head 锚定签名换双签）。
  - DID：identity/device delegation/revocation 双签、root 走 SLH-DSA——即 CSG可验证交易安全 文档分层策略（`classical+ML-DSA 双签 / SLH-DSA 根授权 / 链原生执行签名`）的执行。
  - 金融线：certified_transaction 的 PQ signer adapter（该文档最小落地顺序第 10 步；适配器复用同一 certified hash，不得绕过 CSG 重释交易）。
  - 包/registry/RWAD 分发签名：同双签策略（cheng-decentralized-compute-storage 线）。
- 门禁：NIST KAT 向量 smoke（逐官方测试向量确定性比对，进 host-smoke 默认列表）；常数时间纪律（秘密相关分支/内存索引禁止，进 review 检查单）；多项式/NTT 热路径纳入 perf 合同；禁止把外部库实现或非 KAT 验证的实现计入完成。

### UniMaker 水墨线（产品层，消费以上各线成果；M1-M5 按依赖顺序）

产品层验证场：移动端 `.so` 交付（阶段 2）、事件驱动帧循环、MoQ/网络线（M4 依赖 Wave 1+ 的真实 announce/fetch）在真机上的端到端闭环。

**力学基座 = Cheng 原生力学引擎**（`src/game/ecs.cheng` + `src/game/physics2d.cheng` + `src/game/runtime.cheng`，已有真机实证：fixed tick、确定性 step receipt fingerprint、typed action 输入队列、replay 四 smoke 通过）。全部墨效（M2 落墨、M3 晕染/触感尾迹、M4 墨流、M5 长卷动态）都是该引擎 world 里的实体，由 `Physics2dStep` 统一步进——不允许各里程碑各写一套内联粒子代码（动效层的单一事实源）。确定性红利直接服务门禁：receipt fingerprint + replay 让"同种子逐帧对拍"成为水墨线的 oracle（M2 的结束帧 digest 一致性即其特例）。引擎侧前置扩展（task_plan 已有工单衔接）：① ECS 容量从 2 槽 proof 恢复为固定容量 SoA（容量满 hard-fail）；② physics2d 补重力/空气阻力/溅射冲量/晕染衰减四个力学原语（作为引擎能力而非 app 代码）；③ direct object zero 修复（object 局部零初始化）解除引擎模块的 backend_driver direct 编译阻塞。

- **M1 — DPR 生产级采样（3x 物理分辨率）**：现渲染按逻辑 px 390x844，真机物理 3x，文字靠放大发虚。改动：EGL surface 改物理分辨率；布局保持逻辑 px、光栅阶段乘 DPR；glyph SDF 按字号×3 高分重采样进 atlas；pixel oracle 捕获同步 3x。验收：44 路由 digest 不变（布局没动）、pixel oracle 分数不回退、文字锐度肉眼可辨。风险：glyph atlas 内存约 ×9，先实测预算再全量。M1 独立先行（不依赖引擎扩展），后续所有视觉工作受益。
- **M2 — 落墨启动动画（~1.8s）**：≤64 个墨滴实体（位置/速度/半径/alpha 列）进 ECS world，由 `Physics2dStep` 按 fixed tick 步进（重力+空气阻力+触底溅射+晕染衰减，引擎原语），挂 native_tick 帧循环；渲染用每帧叠加 GPU 命令（多层径向渐变近似软边圆，~1KB/帧）。墨迹收束勾出首页骨架后内容淡入。验收：真机 60fps、全程 ≤2s、动画结束帧 digest 与首页 digest 一致（动画不污染场景）、同种子 replay 逐帧 receipt 一致（引擎确定性门）。
- **M3 — 墨晕转场 + 触感墨迹**：路由切换以点击坐标为墨心，0.3s 径向晕满全屏、新页从墨色中显影——纯叠加层不动场景树；fling 拖出淡墨尾迹随速度衰减、长按蓄墨松手溅墨、下拉刷新=提笔蘸墨；触摸输入走引擎 typed action 队列（与 game runtime 同一输入通路）。验收：44/44 digest 门保持；真机触感跟手不掉帧。M2/M3 共享引擎 world 与叠加层基建。
- **M4 — 发布印章流 + APK 集成 MoQ（核心仪式，最大工程量）**：三幕——内容预览卡在"砚台"中研墨成形 → 按下红色印章（落款即发布，调 MoQ 引擎）→ 首页地图一滴墨从我的节点沿连线流向对端（墨滴是引擎实体，由真实 announce/fetch 事件经事件→动画总线驱动，非播片）。工程主体是 APK 内 JNI/host 桥接 MoQ（既有工单）+ 事件→动画总线。验收：点击印章 → 真机对端 app 收到并渲染，端到端 <1s。
- **M5 — 水墨长卷节点图（游戏化层）**：首页顶部常驻横向水墨长卷 = 真实 P2P 拓扑（我的节点=驿站、对端=远山亭台），节点/墨色状态由引擎 world 承载；内容被订阅一次墨色加深一分；声望系统=印章升级（白文→朱文→龙钮）；任务体系挂发布/订阅/节点在线时长；六个游戏路由入口收进长卷"棋亭"——游戏路由与水墨动效共用同一引擎，不再各自为政。验收：节点上下线实时反映在长卷上，墨色深浅对应真实订阅热度。依赖 M4 的事件总线。

## 统一门禁（所有阶段与伴随线共用）

- `tools/ci_gate.sh` 10/10（含 determinism / perf-witness / perf-theory-ratio）。**（2026-06-29 实测 21/21 全绿）**
- **dry-compile 为编译时间/内存的标准快速验证口径**（替代昂贵 full materialize）：`compiler_main.direct dry-compile --root:<R> --in:<entry> --emit:exe --target:<T> --report-out:<r>`。报告 `compile_parallel_real_over_theory_x` 必须 ≈ 1.000（dry 预检 theory/actual 紧贴，是可信的"贴近理论值"口径）；`exec_phase_dry_actual_total_ms` 是 dry 真实耗时；`full_compile_theory_*` 给 RSS lower_bound/peak_phase_estimate/guard + time lower_bound/guard + v1_pointer_graph_estimate（v1 指针对象图膨胀预警）。**重要诚实边界**：dry `compile_parallel_real_over_theory_x=1.000` 对 dry 预检本身可信（实测 dispatch_min 48.8MB/623ms、compiler_main 67.9MB/918ms 均 over_theory_x=1.000），但 `full_compile_theory` 模型对真实 full materialize 大幅欠估——dry 给 compiler_main RSS peak_estimate 384MB / time_lower_bound 17601ms，实测 self-host materialize RSS 16.97GB / 时间 8min+（欠估 ~44× RSS）。故 dry 用途 = (1) **回归门禁**：每次改动后 dry-compile 跑 over_theory_x 应保持 ≈1.000 且 RSS/time 不回升（快速、~50MB/秒级，不需 10GB/分钟级 full materialize）；(2) **full materialize 的 dry 预检**：dry `v1_pointer_graph_guard_exceeds_hardware` / `full_compile_theory_rss_guard_recommended` 预警 materialize 是否会突破 guard，决定是否值得跑全量 materialize。**不要用 dry 的 full_compile_theory 数值当 full materialize 的真实预算**——真实预算必须由 full materialize 的 `phase_memory_ledger` + `/usr/bin/time -l` 校验。
- `SEEDS=100 tools/abi_fuzz_test.sh` 六口径 0 fail。
- `artifacts/bootstrap/cheng.stage3 run-production-regression` 不出现新失败。
- lowering_plan / compiler_csg 模块测试（纯路径 --emit:obj，8GiB guard）wcz 不回升。
- 阶段 2 起加 diff fuzz 对拍（pure lane 通过率只升不降）。
- 阶段 5 加 pure_cheng_perf_gate（0.95/0.90 硬门槛）与 jobs=1/N determinism gate。
- 网络线每 Wave 以对应 smoke/gate 为退出条件；密码线以 NIST KAT 向量 smoke 为退出条件；水墨线以 digest 门 + pixel oracle + 真机帧率为退出条件。

## 禁止项（全局）

- 禁止开新 worktree / 新分支搞平行实现。
- 禁止"先共存、逐步替换"无限期双轨：每批结束时被替换的旧路径调用点必须清零；阶段结束时旧实现删除。
- 禁止任何降级/兜底/启发式补丁：节点覆盖缺口 = 扩展 parser/typed schema，不是后端文本猜测；发射缺口 = loud fail；facts 缺口 = 扩展 schema 或墓碑，不是静默忽略；不达性能门槛 = 不交付，不是放宽阈值。
- 禁止跳过门禁攒大批：宽爆炸半径改动（parser/typed/emit/facts schema）每批必须全量门禁。
- 禁止把 fallback、stub、mock、compile-only、空产物成功、陈旧缓存命中计入任何完成证明。

## 目标平台矩阵（门禁级口径，src/core/backend/target_matrix.cheng 为实现事实源）

- 宿主门禁：`arm64-apple-darwin`（Mach-O direct object/linkerless + codesign，全部统一门禁在此跑）。
- Docker 运行门禁：`aarch64-linux-gnu`、`x86_64-linux-gnu`（ELF；syscall/thread provider 已过运行门禁；x86_64 双目标发射经 x86_64_body_emit 对偶 API）。
- 进行中：`x86_64-pc-windows-msvc`（COFF；generated Windows plan-build ABI blocker 收窄中，见 cheng-bootstrap 2026-06-05 记录）、`wasm32`（70 字节最小二进制已验，0 unsupported）。
- 移动交付（阶段 2 主目标）：Android/OHOS（ELF→`.so`）、iOS（Mach-O，device/simulator 分 slice）；direct writer 默认启用前各留最小集成 smoke。
- 纪律：不支持的 triple 一律 hard-fail，禁止静默转系统 linker 或宿主工具链。

## 风险与回退

回退锚统一为三件：git revert（本提案全部改动按批提交）、自举定点哈希复现（种子链可从任一绿色提交重起）、安装产物原子替换（cheng.new→mv）。各阶段最大风险：

- 阶段 1：迁移中段新旧双轨并存期最长，wcz 可能阶段性反弹——以"每批旧 helper 调用点清零"控双轨寿命；反弹超一批即停下修根因。
- 阶段 2：发射等价性验证不充分——以 ABI fuzz 种子全量 + diff fuzz 对拍 + production regression 三层兜验证（不是兜底）；等价性破坏即整批回退。
- 阶段 4：种子重生失败风险最高——旧 cheng_cold.c 在 archive 中保留可恢复，且只在阶段 1-3 稳定两周后启动。
- 阶段 5：并行引入非确定性——jobs=1/N 产物 hash 门禁先于默认开启；不一致即退回 serial。
- 网络/密码线：协议与密码实现错误的代价不可逆——仿真器（Wave 0）与 NIST KAT 向量先行，未过验证网不碰主链。

## 文档地图（权威关系与覆盖审计）

本文是 v2 总纲；冲突裁决顺序：`docs/cheng-formal-spec.md`（语言规范）> 各单一方案文档（领域规格）> 本文（决议与排期）> 路线图类文档。范围声明：下表只收与 v2 重构有权威/并入/消费关系的文档；其余 docs/（GUI 线、VPN/代理线、DePIN/存储细化、编译提速等）由 `docs/README.md` 分层索引管辖，不在本表重复。

| 文档 | 关系 | 说明 |
| --- | --- | --- |
| `openspec/proposals/backend-line-rescan-removal.md` | 子集并入 | 行重扫是文本消费的一种，其禁止项与收口门禁并入阶段 1 |
| `openspec/proposals/cheng-libp2p-convergence.md` | 整体并入 | 已收口为指向本文的重定向存根 |
| `openspec/proposals/ownership-movehint-optimization-semantics.md` | 正交后续 | 阶段 5 的 No-alias facts 是其前置证据层，排期在阶段 3 之后 |
| `openspec/proposals/orc-cycle-collector-weak.md` | 正交后续 | 与本提案无依赖冲突 |
| `docs/beat-c.md §4` §C | 纪律并入 | 发射纪律/移动端交付 → 阶段 2；迁移顺序与 smoke 清单以该文档为准 |
| `docs/cheng-bootstrap.md` | 并入 | DenseStore/Arena/No-alias/E-graph/Linkerless/并行与 perf 硬门槛 → 阶段 5；实施顺序以其 Implementation Order 为准 |
| `docs/cold_csg_plan.md` | 并入 | facts 物理格式 → 阶段 6；cold reader 职责边界 → 阶段 4 |
| `docs/cheng-plan-full.md`（含下一阶段演进附录） | 部分并入 | 方言分层/墓碑/relfacts → 阶段 6；Typed Shared Store 与 Control Surface 属 Web/GUI 线不排期；该文自身定位为路线图，不定义兼容性合同 |
| `docs/csg-core-standard.md` | **规范权威** | CSG-Core 唯一规范入口（命名空间/profile/report/tombstone/relfacts 字段定义）；阶段 6 以它为合同，本文不复制 schema |
| `docs/csg-introduction.md`（含架构速览附录） | 原则同源 | 「后端不得从源码文本猜含义」即本文主线原则的 CSG 侧表述 |
| `docs/csg_web_plan.md` | 正交消费面 | CSG-Web 产品线（TS/React→facts→Cheng Web Runtime），方言分层的消费方 |
| `docs/computer_use_r2c_campaign.md`（含 CSG Computer Use 附录） | 正交消费面 | 确定性 Computer Use，消费 control_surface facts |
| `docs/CSG可验证交易安全.md` | 策略并入 | certified_transaction 金融线（csg_dialect::finance 消费方）；其抗量子分层策略（双签/SLH-DSA 根/PQ signer adapter）并入「原生抗量子密码线」 |
| `docs/cheng-libp2p-convergence-plan.md` | 领域规格 | 网络栈收敛线的单一方案文档（现状盘点/十章配套/代码映射） |
| `docs/cheng-plan-full.md` | 背景路线图 | Linkerless/DOD/语义特化远景与函数级并行矩阵为阶段 5 背景与任务索引 |
| `docs/cheng-implementation-status.md` | 状态手册 | 实现对齐注记与门禁命令口径，随各阶段收口同步更新 |
| `docs/cheng-csg-lsp-debugger-fusion.md`（含 LSP 附录 A / Debugger 附录 B） | 原则同源+消费面 | 「LSP/编译器/Debugger 必须同一事实源」即本文主线；LSP 消费 typed facts 与 csg_relfacts（阶段 3a/6 产出）；DebugFacts 从阶段 2 发射的 line map/偏移表派生 DWARF |
| `docs/cheng-package-manager.md`（含激励/导入评审附录） | 正交消费面 | 包分发签名是「原生抗量子密码线」双签策略的消费方 |
| `docs/cheng-native-game-engine-plan.md` | 领域规格 | 物理/游戏引擎单一方案文档；水墨线物理基座，已含「首个生产消费方」衔接节 |

---

## combo A 消费者 read 点迁 v2 进度（2026-06-27 18:25）

combo A 推进 ~383/705 read 点 v2（texpr 168 + dispatch_min 14 + system_link_exec 19 + compiler_csg 48 + lowering 97 + primary_object_plan 37）。**5 消费者文件 read 点迁基本完成**（texpr/dispatch_min/system_link_exec/compiler_csg/lowering 全迁完 + primary_object_plan op-lane 没改的 read 点全迁完；剩 primary_object_plan 3 处 op-lane WIP 同点冲突 10752/10753/10809 跳过）。重建 driver rc=0 + raster csg 不崩（2 ZC_NOT_READY baseline 一致）+ v2 同步（fn2=290 node2=41225 stmt2=7795 ✓）+ lowering/compiler_csg v1 functions[i] read 全清。

**miscompile 根因（关键教训）**：删 let typedFn 后必须确认所有 typedFn.field read 都迁 v2——1658 删 let typedFn 后漏迁 1661 typedFn.nodeStart（读未定义变量，cheng_cold recovery 读栈垃圾）→ for nodeIndex 范围错 → paramNames 填错 → WebLayoutBlockLayoutChildren miscompile（第 3 bail）。二分定位法：stash lowering 回 HEAD=2 baseline 确认 miscompile 来自 lowering 迁，逐块回退二分定位 1659/1660 块，读 1661 发现漏迁 typedFn.nodeStart。

**降 gap 仍需删 v1**：v1 仍有 write 点（CompactForBackend/fnIr 构建）+ clone/append helper + MoveInto/clone/assign 3 点必需，删 v1 = 改 v1 对象构建路径直接写 v2 列 + 删 v1 对象 seq + 改 clone/append/MoveInto，工程量大，多会话。剩 primary_object_plan ~40 + compiler_csg 4 helper 消费者 read 点待续。

## combo A 完成（2026-06-27 21:36，子代理 [continue combo A migration](c3c88628-4178-4ceb-a363-746d01a15a2f) 收口）

combo A consumer read 点 ~705/705 全迁 v2：`PrimaryBodyIrEvalNode` 整函数（~150 read）+ `AppendCallExprNodeToSlot`/`ResultConstruct`/`ErrCodeConstruct` 连锁（签名 node→nodeIndex）+ `NodeTreeHasCallExpr`/CondCbr 三函数/`AppendNodeBoolConditionChain` + `typedIr.nodes[stmt.rhsNodeIndex].*` 批量 28 处 + 散落 6 处 + `lowering_plan`/`compiler_csg` ParamRef loop 全迁。全树 grep `\.nodes[...].<texprField>` consumer read 0 残留（仅 typed_expr.cheng producer v1 write/populator/builder，属 task 12/13）。build-backend-driver rc=0；exec_diff --gate exactly 3 driver miscompile（assign_ternary_call/mixed_ternary_sum/ternary_call_add，op-lane WIP 引入，反向验证确认非本批），无新 regression。

**★2026-06-29 combo A/B/C 落地收口确认**：源码物理验收全过——combo C TypedExprIr 无 `functions/nodes/statements: TypedExprIrXxx[]` AoS 数组（0）、85 v2 SoA 列在；combo B TypedExprIr type 内 `str[]` 字段 0（37 列物理删除）；combo A `typedIr.(nodes|statements|functions)[` consumer read 残留 0。ci_gate 实测 21/21（含本会话重建吸收 const 修复 + mldsa typo 修复）。combo-b3 Arena backing（step 1-4）仍在 op-lane WIP 推进，是 combo B 的 Arena 化延伸（出 combo A/B/C 完成口径，属后续 RSS 工程线）。

## task 12 str intern + Arena 存储设计（待 op-lane 静止窗口 + RAM >11GB + 用户批准动 producer）

**目标**：降 gap 主力——v2 str 列去重 + Arena 连续存储 + reset 归还，把 259MB str/seq 碎片 gap 压到 ~0。

**str 列清单（41 列）**：functions2 str 4（sourcePaths/functionNames/returnTypes/returnExprs）+ statements2 str 27（sourcePaths/functionNames/enclosingIfConditionTexts/exprIds/surfaceTexts/bindingNames/resultTypes/conditionLhs/Rhs/LiteralTexts/assignRoot*7/assignValue*8/callQualifiers/callCallees/callTargets/callTargetSourcePaths/callArgsTexts/callArgTypesTexts）+ nodes2 str 6（sourcePaths/functionNames/resultTypes/surfaceTexts/paramNames/literalTexts）+ globals str 4（globalSourcePaths/Names/Types/InitValues）。

**两方案**：
- **方案 A（推荐，read 点不返工）**：str 列保持 `str[]`，但 str 内容经 intern 去重 + Arena 存 unique str body。写点 `append(InternStr(s))` 改，读点（combo A 已迁 ~705）不变。gap 降来自重复 str 共享同一 Arena slice + Arena 连续不碎片。风险低，combo A 成果保留。
- **方案 B（激进，最大 gap 降）**：str 列改 `int32[]`（intern id），读点包 `InternedStr(ir, id)`。gap 降最大（41 列 str[]→int32[]，引用 8B→4B + body Arena 共享），但 combo A ~705 read 点全返工。留 gap 仍高时再上。

**Arena 存 85 列**：v2 85 列 backing 改 Arena array（连续 bump alloc，无 cheng_cold seq *2 over-alloc + reset 归还）。需 `arena.cheng` 支持 array backing + seq 改 Arena-backed。cheng_cold.c arena mmap 须加 munmap 归还（lessons 记 line 296 无 munmap，op-lane 持有 cheng_cold.c）。

**前置（实测不满足）**：① op-lane 静止（typed_expr.cheng/compiler_csg/cheng_cold.c mtime >10min，producer 改动不可逆，活跃期改必 clobber lessons 4b-5/4b-6）；② RAM >11GB（materialize 验证 gap 降，当前 ~2GB）；③ 用户批准动 producer（删 v1 seqs + 改 str 列 backing）。

**推荐执行序**：先方案 A（intern 去重 + Arena str body）→ materialize 测 gap 降幅；若仍高再方案 B（id 化）+ Arena 85 列 backing；最后 task 13 删 v1 seqs。

## combo B Arena 存储执行进度（2026-06-28 00:30）

**combo B-2 ArenaArrayInt32 封装完成**：`src/core/runtime/arena.cheng` 加 `ArenaArrayInt32` type（offset/len/generation）+ helper（Init/Add/Get/Set/Len，byte 拆分 LE：`uint8(v & 255)` + `(v>>8)&255` + 读 `int32(storage[o]) + (b1<<8) + (b2<<16) + (b3<<24)`）。`src/tests/arena_contract_smoke.cheng` 加 ArenaArrayInt32 测试（Add 3 元素 + Get + Set + Len），`cheng.stage3 system-link-exec` 编译运行 rc=0。combo B Arena 基础设施就绪。

**关键设计（read 传 arena，不含 arena ref）**：ArenaArrayInt32 不含 arena 引用——避免 Arena grow 后 `setLen(storage)` realloc 导致 ArenaArray 内 stale storage 引用。read/write 显式传 `arena: var Arena`。代价：read 点 `typedIr.nodes2_x[i]` 需改 `ArenaArrayInt32Get(typedIr.arena, typedIr.nodes2_x, i)`，combo A ~705 read 点返工。Cheng no-pointer 下 ArenaArray 含 arena ref（`[]` 重载访问 arr.arena.storage 保留 combo A read 点）设计复杂（var borrow 字段生命周期 + ref object 共享 Arena grow stale），暂取 read 传 arena 方案。

**combo B-3 待办（多会话 + op-lane 协调）**：typed_expr 85 列 backing 改 ArenaArrayInt32（int32/bool/enum 44 列先：bool 当 int32 0/1，enum 当 int32 底层）+ 写点 `append(v)` → `ArenaArrayInt32Add(typedIr.arena, arr, v)` + read 点 ~350 int32 read 返工 `arr[i]` → `ArenaArrayInt32Get(typedIr.arena, arr, i)` + clone/MoveInto/AssignInto/LiveBytes 同步。前置：op-lane csg 稳定窗口（csg 读 typed_expr 列，改列类型 break csg read 点；combo A 返工 + op-lane csg 活跃撞）。

**combo B-4 待办**：internPool.texts 改 Arena-backed str body（op-lane langintern 已做 hash 去重，texts 仍 str[] 堆，改 Arena 存 unique str body）+ ArenaReset 接入编译结束（typed_ir arena reset 归还，降不归还 gap）。

**combo B-5 验证**：raster smoke materialize 测 gap 降（247MB baseline → 期待降）。当前 RAM ~2.7GB 够 raster smoke（247MB），不够 full materialize（10.6GB）。

## 路径 1 修 allocator 降 gap 72% → ~3GB（与 combo B/C 并行，实测方案；**2026-06-28 订正：对 full materialize 8GB 归因已被推翻，仅对 raster smoke 247MB gap 成立**）

> **2026-06-28 订正**：本节"full materialize 10.6GB gap 归因 = allocator 不归还/碎片 72%"的前提**已被 8GB 闭环推翻**（见文末「8GB RSS 闭环」节）。8GB RSS 实际根因是 `gSortDumpBuf`（lowering_plan:1676）module-global O(N²) 字符串拼接 churn（freed 串不还 OS），**非 live IR 指针对象图、非 allocator gap 不归还**。删除 gSortDumpBuf 后 RSS 8.02GB→273MB（30x）。本节对 raster smoke（247MB gap，无 gSortDumpBuf 干扰）的 allocator gap 分析仍成立，但对 full materialize 8GB 的归因错误——path1 pressure relief 实测=0 bytes（错误机制，已回退），path1-2/1-3/1-4 均证伪或无收益。combo B/C（SoA+Arena）降 gap 的结构性收益仍有效，但前置不再是"解 8GB"，而是降 raster smoke gap + 解 zero-C 22→0。

**根因（lessons line 5 实测）**：full materialize 10.6GB gap 分两类——v1 必需 28%（堆对象头/ORC ~64B/对象 + seq over-alloc，SoA+Arena 才消）+ allocator 不归还/碎片 72%（可修不动 codegen）。铁证：lowering 阶段 structured_delta=-20MB 但 gap_delta=+62MB（gap 不释放反涨），structured 释放了 gap 不归还 = malloc/mmap 不归还 + 碎片。**（注：此归因对 gSortDumpBuf 时代的 8GB 不成立，gSortDumpBuf 删除后重测才能确证 allocator gap 占比。）**

**不归还点（实测定位）**：
- `cheng_seq_set_grow` ABI 符号：**由 `src/core/runtime/program_support_backend.cheng:2841 @exportc("cheng_seq_set_grow") fn cheng_seq_set_grow_export` 提供**（含 corrupt header 检查 + *2 grow line 2856），被 strutils.cheng:7 / json.cheng:8 `@importc` 消费 + primary_object_plan codegen 发 call。**注意：`src/std/system_helpers_backend.cheng:752 fn cheng_seq_set_grow` 是死代码（无 @exportc/@importc，无调用方）——改它无效（seq_stress_mem 实测 *2 vs *1.5 peak RSS 完全相同 1,057,062,912 bytes）**。seq grow *2 over-alloc + cHeapResize（realloc）不归还 OS 的真目标 = program_support_backend.cheng:2841。
- cheng_cold.c arena_alloc（line 291）：mmap ArenaPage 链表，无 arena_free/munmap（只 alloc 不释放）。
- cheng_cold.c 无 malloc_trim/madvise/MADV_DONTNEED（无归还 OS 机制）。

**修复方案**：
1. seq grow *2 → *1.5（**program_support_backend.cheng:2841 cheng_seq_set_grow_export** `doubled = newCap * 2` → `doubled = newCap + newCap / 2` + overflow guard）降 over-alloc。**非 system_helpers_backend.cheng:752（死代码，改无效）**。
2. 编译阶段间加 malloc_zone_pressure_relief（macOS）/ malloc_trim（Linux）归还 malloc 碎片给 OS（phase_memory_ledger 阶段切换点 dispatch_min.cheng:1456-1473）。
3. seq free 归还 OS（cHeapFree 后大块 munmap or malloc_zone_pressure_relief）。
4. arena_alloc 加 arena_release munmap pages（编译期释放旧 arena 层）。

**★2026-06-29 seq grow *2→*1.5 实测证伪（与 pressure relief 同款死路）**：改 `program_support_backend.cheng:657/2318/2808` 三处 `newCap * 2` → `newCap + newCap / 2`（1.5x over-alloc），raster materialize 实测 RSS `610222080 → 610107392`（降 **114KB = 0.02%**），`primary_object_plan gap 603499712 → 603368640`（降 131KB）。**收益 = 0**，证实 gap 大头不是 over-alloc 倍数，是 `free 后 OS 不归还`（structured 仅 1.1MB，gap 603MB = structured 的 540×）。与 findings line 1734「pressure relief 实测=0 bytes（Cheng allocator 不走 malloc zone）」同根。**已 revert 不提交**。

**★2026-06-29 RSS high-water 根因定论 + 单点解路径（Cheng heap 大块不 munmap）**：追到 runtime 核心确认根因——`program_support_backend.cheng:2436 cheng_mem_release_locked` RC 归零后调 `c_free(ptr(header))`（= `cheng_host_free` = C `free`），**大块 free 走 c_free 不 munmap**，故 RSS high-water 只升不降。分配侧 `cheng_seq_grow_to_raw_export:2947` 走 `cheng_realloc_export`（C realloc）同样不 munmap。**combo B/C Arena 化（typed_expr）已完成验证 typed_expr gap 可降**（combo B-3 已迁 217 处 ArenaArrayInt32 + 37 str[] 列删除，TypedExprIr 内 str[] = 0），但**primary body_ir 仍走 seq**（902 个 ops/terms 使用点 + emit 链未切 BodyIRFlatSoA），这是 603MB gap 的真战场（combo A/B/C scope 之外，文档 line 13 已标"剩 PrimaryObjectIr 独立战役"）。**单点解路径**（下一步会话精确入口）：① `cheng_malloc_export` 大块（如 >1MB）改 mmap 分配 + header 标记 mmap 标志；② `cheng_mem_release_locked` 大块按标志 munmap 归还 OS（小块仍 c_free）；③ 重建 stage3 + ABI fuzz 六口径 + ci_gate 验证不破坏内存正确性。这是 runtime 核心改动（影响所有 Cheng 程序 heap），单会话需 full 验证；或走 PrimaryObjectIr Arena 化多会话战役（902 点 + emit 链切 flat）。两条路都已定位，无 op-lane 外部阻塞（本工作树即 op-lane）。

**★2026-06-29 跨阶段 gap 成分定论 + mmap/munmap 精确边界（订正上文 02aa61328 归因措辞）**：补跨阶段 gap 实测（materialize phase_memory_ledger 五阶段）：

```
phase            rss_after    gap_after    (gap 单调涨，从不降)
source_closure   8.7MB        8.7MB
compiler_csg     292MB        262MB        (+253MB)
lowering_plan    344MB        340MB        (+78MB)
primary_object   607MB        606MB        (+266MB)
report_payload   610MB        610MB        (+4MB)
```

**gap 跨 5 阶段单调递增，从不下降**——即使进入下一阶段，上一阶段 gap 完全不归还 OS。这是 RSS high-water 铁证：**每阶段临时分配 free 后 OS 完全不回收**。**订正上文归因**：02aa61328「大块 free 走 c_free 不 munmap 故 high-water 只升不降」方向正确，但「freed-but-not-returned」曾因一段数据（structured -2MB vs gap +265MB）迷惑过以为推翻、改判"当阶段活分配"——**跨阶段数据证伪该改判**：gap 涨是当阶段新临时分配 free 后立即变 gap 且永久不还，structured 释放的是登记对象，gap 涨的是未登记临时，两者并行不矛盾。**定论 = freed-but-not-returned（每阶段临时 free 立即变 gap，永不还），非历史堆积亦非当阶段活分配**。

**mmap/munmap 精确边界（理论正确方案，但有前提）**：
- **能解**：大块临时分配（大 str/seq）走 mmap，free 即 munmap 归还 OS → 这类 gap 可消。
- **解不了**：小块临时分配（碎片）即使 mmap 也无效（mmap 阈值通常 ≥1MB，小块仍走 malloc free 不还）。
- **真结论**：mmap/munmap 能降 gap 的大块部分（理论正确），但**不能降到 0**（小块碎片残留）。要降到接近 structured（~308MB 理论），需 **mmap/munmap（消大块）+ combo B/C Arena 化（消碎片，把小块合并成 Arena 大块统一 mmap/munmap）互补，缺一不可**。与 02aa61328 单点解路径①②（大块 mmap 标志 + munmap 归还）一致，但明确其边界：单点解只消大块 gap，碎片 gap 仍需 combo B/C Arena 化（v1 指针对象图 → SoA + ArenaReset 归还）。


**前置（实测不满足，双重阻塞）**：修 allocator 需①改 program_support_backend.cheng:2841（**op-lane WIP 持有，需 op-lane 稳定窗口**）+ ②重新自举 cheng.stage3（runtime 预编译进 self-copy binary，源改需重建才生效；改死代码 system_helpers_backend:752 无效）。重建被 corrupt 中间态阻塞（stage2 旧 17:53 + op-lane WIP cheng_cold.c 未重建 stage2 → driver/runtime corrupt）。等 op-lane 重建 stage0/1/2/3 + program_support_backend 稳定。验证修 allocator 后 full materialize gap 降仍需 full materialize 10.6GB RAM。等 RAM ~3GB 窗口 or raster smoke 验证趋势。

**降 RAM 时间评估（何时不需要 10.6GB）**：
- 路径 1 修 allocator：full materialize 10.6GB → ~3GB（降 72%）。需 RAM ~3GB 窗口重新自举 + 验证。当前 ~2.7GB 略不够。
- 路径 2 combo B/C：full materialize 10.6GB → ~308MB（消全部 gap）。需多会话（typed_expr 85 列 ArenaArray + read 返工 ~350 + op-lane csg 协调）+ 重新自举。当前 ~2.7GB 够 raster smoke 验证趋势。
- 两路径并行：路径 1 快速降 72%（~3GB）解锁 RAM 窗口 → 路径 2 combo B/C 消全部（~308MB）。

## 8GB RSS 闭环（2026-06-28，gSortDumpBuf 根因定论 + fix 验证）

**根因**：`gSortDumpBuf: str`（module-global，`src/core/backend/lowering_plan.cheng:1676` @HEAD），combo-c Phase2 提交 `2366e2365` 误提交的 sort_dump 调试工具。在 `LoweringAppendPrimaryObjectIrStatements`(:1697) 每语句执行 `gSortDumpBuf = strutil.Join([gSortDumpBuf, Fmt"sort_dump fn=...ord=...si=...kind=...line=...col=...indent=...encif=...cond=...rhs=...surf=...\n"], "")` = **module-global O(N²) 字符串拼接**，跨函数从不 reset，每语句 churn = 当前 N×110B → 总 churn = O(N²×110B)。被双构建（materialize+body_ir 都调 `LoweringBuildOneFunctionInto`）放大 2×。`ordinary_zero_exit_fixture` ~9000 stmts → O(9000²)×110B×2 ≈ 8.9GB RSS high-water，吻合实测 8.02GB。旧 concat 串变垃圾但 Cheng string allocator 不归还 OS → RSS high-water 涨（freed-but-not-returned，**非 live IR**——订正上文阶段5/路径1 的"live IR 指针对象图"归因）。

**Phase1 vs Phase2 31x 的真原因**：Phase1(`cb98937a0`) 无 gSortDumpBuf=257MB；Phase2(`2366e2365`) 加进=8GB。**非 SoA vs AoS 内在差异**，是调试残留。combo-c Phase2 提交时大概是排查 SoA 排序回归临时加的 sort_dump，验证完忘删。

**fix（主，已验证）**：删 `var gSortDumpBuf: str`(:1676) + 循环内 concat(:1796) + `os.WriteFile("/tmp/cheng_sort_dump.txt", gSortDumpBuf)`(:1824)。op-lane 已 stage 删除（`git status` `M` lowering_plan.cheng，待提交）。

**fix（次，速度优化非内存关键）**：消双构建——`PrimaryBuildBodyIrForFunction`(:45899-45918) 对 lazy 函数重复调 `LoweringBuildOneFunctionInto`（materialize 已在 :46178 调过）。改 body_ir 直接用 materialize 写入的 irFunction.statements，删二次 rebuild。需加 assert materialize 后 `irFunction.statements.len>0`；body_ir 入口仅 needs-lazy 仍 true 才 rebuild（兜底）。提速 ~2×，内存影响小（AoS 构造 ~2.4KB/stmt）。

**验证（2026-06-28 10:55 重建+测）**：rebuild rc=0(6s)。ordinary_zero_exit_fixture：`per_fn_enter i=778 rss=255918080`(256MB)，`min_rss after_primary_build rss=263667712`(264MB)，`maximum resident set size 272924672`(273MB)。**RSS 8.02GB→273MB，30x 下降**。无 `rss_limit_exceeded`，全部 778 函数完成 primary build。`/tmp/cheng_sort_dump.txt` mtime=10:35:50（旧 run 残留，本次 10:55 未新生成）= gSortDumpBuf 真删。

**linker mmap fix（2026-06-28 11:05，ordinary 编译 pipeline 跑通）**：8GB fix 后 ordinary 编译卡 native link 阶段 `macho_provider_linker: unresolved symbol: mmap`。根因 = `macho_provider_linker.cheng:411-431` libsystem allowlist（ordinal 1）遗漏 mmap/munmap，而 op-lane darwin runtime 新加 `@importc("mmap")`/`@importc("munmap")`（core_runtime_provider_darwin.cheng:53-56 staged WIP）+ inference metal mmap 使用。darwin provider 整体编译 + internal_macho_linker 不做 DCE → ordinary 即使不调 inference 也链接整个 provider → mmap 引用进链接输入。fix = allowlist 加 `"mmap", "munmap"`（line 422，ordinal 1 libsystem）。macho_provider_linker.cheng clean（op-lane 静止 2h），改它不碰 op-lane darwin runtime WIP。验证：rebuild rc=0 + ordinary 编译 `OZF_COMPILE_RC=0` + `native_link.log: OK, linkerless_image=1, unresolved_symbol_count=0` + exe 502472 bytes + `EXEC_RC=0` + peak RSS 273MB。**ordinary 编译完整跑通 pipeline**（8GB RSS fix + linker mmap fix 双解）。

**诊断教训（写进 lessons）**：
1. p1i 误判"gSortDumpBuf 96KB 非元凶"——96KB 是 crash 落盘文件大小，RSS high-water 是 O(N²) concat churn（freed 串不还 OS），达 8.9GB。**RSS high-water 远大于 live data 时，先查 module-global O(N²) accumulator，勿只看落盘文件大小。**
2. p1f 误判"pressure relief=0 → 8GB 是 live IR"——pressure relief=0 因 Cheng string allocator 不走 malloc zone（zone relief 不触 Cheng 串），非 live 证据。**pressure relief=0 不能单独证 live，需结合 allocator 类型判断。**
3. **combo-c 提交审计**：Phase2 提交 `2366e2365` 夹带调试工具 gSortDumpBuf 进主源，CI gate 未拦截（纯调试输出无语义依赖）。建议 combo 类提交加 sort_dump/WriteFile 调试残留 grep 检查。

**★2026-06-29 self-host 自编实测（修正上文"5 条 not_ready / RSS 10.6GB"stale）：** `build-backend-driver --require-rebuild`（compiler_main.direct 自编 compiler_main full-superset，arm64-apple-darwin）实测：
- **rc=2 失败，`ZC_NOT_READY_TOTAL count=98`**（非上文「5 条」——5 条是 op-lane 单 commit 口径，full-superset 自编口径实测 98）。
- **bail 分布**：44 × 70 / 49 × 10 / 0 × 10 / 61 × 8。bail=44 主力（70/98），statement_kind=2 statement_sequence，函数集中在 `LoweringTypedIrFunctionHasOpKind`/`LoweringBuildOneFunctionInto`/`LoweringAppendPrimaryObjectIrStatements`（lowering_plan）+ `PrimaryBodyIrMaterializeFieldArgSlot`（primary_object_plan）。bail=44 = anon-tuple 索引赋值（本节可行性矩阵 line 32 已标）。
- **RSS peak 16.97GB**（`/usr/bin/time` `maximum resident set size 16972496896`）——**高于**上文 line 45/46 记录的 10.6-11.3GB（gSortDumpBuf 删除后 ordinary 编译 273MB，但 full-superset self-host 自编因 98 not_ready 落在 lowering/primary 阶段 + 巨大 source closure 142809 行，RSS 仍达 16.97GB）。
- **真 zero-C endgame 当前口径 = 98 条 not_ready（主 70 bail=44）→ 0**，非 5 条。下会话总钥匙（上文 line 18）的"22→0"也需统一到此 98 口径。修点仍全收敛 `src/core/backend/primary_object_plan.cheng` + `lowering_plan.cheng`。本会话 stage3 重建已让 ci_gate 21/21（cold provider 口径），但 self-host 纯路径（full_backend_codegen=1）的 98 条仍是阶段2/3a/3c-panic/4 的真实验证前置。
- **后续修复（同日 commit `617102bb4`）**：`PrimaryBodyIrAppendCallArgs` 加 field-access/index-access call-arg elif 分支，闭 bytesCopyInto/BytesCopyInto/bytesCopyRangeInto/BytesCopyRangeInto/WebLayoutTableLayoutChildren 5 条 bail=44。raster 闭包 census 实测 **8→5 not_ready**（闭旧 5 条，但 driver 重建后新暴露 runRasterIconGlobeSmoke bail=44 + WebFontLoadSfnt bail=44）。剩 3 条 bail=44 + 2 条 bail=0。full-superset 口径待下次 `--require-rebuild` 实测确认。
