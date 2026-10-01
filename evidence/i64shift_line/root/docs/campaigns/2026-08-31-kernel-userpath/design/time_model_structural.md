# 编译时间理论模型（结构化）——车道 L1 交付

> **定位**：把 `docs/cheng-rsi-fusion-plan.md` §1.2 的 `T_floor(相 p) = W_p / B_eff(p) + n_p × c_p` 落成**可复算的逐相模型**，与内存模型 `peak_stream(k)`（结构项 + 逐源斜率）同构；给出对账、一个可证伪预测、以及需要新测量才能钉死的项。
> **口径纪律**（本文件全文强制）：① 任何数字必须指到 `文件:行` 或回执绝对路径；② C 链读数与 Cheng 链读数**分行写、不相除、不混算**；③ 校准系数一律标注"后验标定"；④ 未钉项写"未钉"，不当 0、不用估计值充数。
> **本轮边界**：零编译、零链接、零计时测量、零 `src/**` 写入、未取 `.rebuild/COMPILE_SLOT.lock`、无 commit/分支/worktree。全部结论来自**只读**回执与源码实读。文档内所有行号均在**引用处标注坐标世代**（工作树 / HEAD / 历史 HEAD），因为 `src/core/lang/parser.cheng` 在他线在飞（本轮实读 `git diff --numstat` = **+2275/−43**）。
> **写作时刻**：2026-09-13 08:1x；HEAD = `b083fc3dd8ea0194d3fd1f828967942ec3125449`。

---

## §0 结论先行（8 条）

1. **两套现存"理论下限"都不是算法下限，本文件不再引用其数值作为边界**：C 链 `compile_theory_parallel_limit_ms` = `ceil(本轮实测 CPU / 逻辑核数)`（`bootstrap/cheng_cold.c:75967-75970`，模型标签 `:76016`——两处均在本轮实读复核）；Cheng 链 `full_compile_theory_*` 的系数是后验标定，**源码自己就写了它不是界**：`full_compile_theory_validation_status=unvalidated` / `full_compile_theory_bound_status=not_proven_upper_bound` / `full_compile_theory_scope=non_exhaustive_modeled_compile_estimate_without_codegen_execution`（`src/core/tooling/backend_driver_main.cheng:4467-4469`）。
2. **模型必须分两层，否则无法判收敛**：第一层 `W_p / B_eff(p)` 是**可证的字节流下界**（由算法决定）；第二层 `n_p × c_p` 是**逐项成本**，它是"实现 + 机器"的常量，**没有理论值**，必须逐世代实测。把 `c_p` 当理论值引用 = 把当前实现的低效写进"下界"（这正是 Cheng 链 `bytes×50 ns` = 20 MB/s 的病）。
3. **C 链三相的时间结构**（`kd_b102`，234 源 / 649,715 行 / 30,989,631 B）：parse `136,997,679 µs`（65.75%）、codegen `66,412,770 µs`（31.87%）、direct_object_emit `49,542 µs`（**0.024%**）、**未归类残差 `4,907,538 µs`（2.36%）**——三相之和不闭合到 wall，这是本轮新钉的一处账目缺口（§4.3-4）。逐位复算通过（§4.1）。
4. **只有 emit 相的结构项能吃掉全部实测**：emit 写 `40,641,788 words × 4 B = 162,567,152 B` 用 `49,542 µs` ⇒ **3.28 GB/s**，落在本机页缓存写带宽带内；且该字节量有独立佐证（产物 `.rebuild/s1b_step3/r9/kd_b102` = **171,455,632 B**，与 code words 只差 **5.5%** 的头/符号/重定位/行表）。parse 与 codegen 两相的结构项只占实测的 10⁻⁴/10⁻³ 量级 ⇒ **这两相完全由 `n_p × c_p` 支配**，模型的价值在于把 `c_p` 与项数分开记账。
5. **Cheng 链的"森林窗"必须绑定唯一埋点对，且现树该窗口的内容已换代**：`after_profile_source_payload_release`（`compiler_csg.cheng:40104`）→ `after_profile_lookup`（`:40143`），`since_ms` = 与**上一个** stage 发出的时间差（`:2013/2028`）。现树该窗口 = pass0 逐源"读树 + arena 实测量 + 声明投影"（`CompilerCsgBuildParserForestAuthorityInto`，`:33384`）+ pass1 逐源"重读树 + TypeArena 列追加 + 流式落地"（`CompilerCsgStreamTypeArenaFromDeclarationIndexInto`，`:36069`）；**精确容量并林已被删除**（`:33438-33460` 自述）。
6. **⇒ 三处同族 append 站点（token / typeSyntax / region）在现世代已不在该窗口上**：全仓仅剩 2 个 `ParserValueExprTreeAppendFrom` 调用点——`compiler_csg.cheng:30704`（`CompilerCsgStructuredSourceDomainStageSliceWithBorrow`，被 `compilerCsgExprLayerForFrontierFunctionsImplRec` `:31341/:31530` 调用 = typed/frontier 相）与 `parser.cheng:3698`（`NormalizedExprLayerAdd`，delta 层）。`AppendFromImpl` 定义在 `parser.cheng:10370`。因此**判据"补第三点 ⇒ 森林窗 <120 s"在现树已失去判别力**（§5.3）。
7. **三站点的双线性是"实现流量 ≠ 算法流量"的教科书形态**：算法只需要**每个源文本被触碰 1 次**（`Σ_k L_k = 30,991,157 B`，234 源），实现却按**每 item 一次全源文本 `CloneStr + Intern`** 付费。按同轮 `ta_limits` 的实测总量（tokens `3,634,390`、type_syntax `158,433`）与"token 密度跨源恒定"假设外推，该闭包一次性并林的实现流量 ≈ **6.11×10¹² B**（无假设上界 `1.64×10¹³ B`）⇒ 超出算法底线 **≈ 2.0×10⁵ 倍**。**这个倍数不是"13.7×"**：13.7× 是并行效率倒数（§3.3）。
8. **第三点修复的可证伪预测**（同世代基线 553,914 ms）：`T_new = 553,914 − 220,352 × R` ms，其中 `R = [Σ r_k·L_k] / [Σ y_k·L_k]`（region : typeSyntax 的**加权**流量比）**未钉**——全仓无任何 `regionCount` 实测（grep `regions=` 命中 0）。**可测得的结构依据给出 R 的量级 = O(1)**：region 行按语法粒度创建——种类枚举 14 项（`parser.cheng:279-294`：模块头行 / trait 头 / 注解行 / 注解实参 / 类型声明头 / 类型表达式文本 / 类型参数表 / 形参类型 / 返回类型 / 字段声明类型 / pattern / case arm / lvalue / 字段块），创建点 **24 处**（`parser.cheng` 内 `ParserValueExprAppendRegion(` 除函数定义与合林点外的 24 个调用）；而同世代 `declarations=156,146`、`type_syntax=158,433` 是**同一量级**（`r96_ctx.stderr.txt:974`、`:972`）⇒ 若平均每个声明贡献 ≈1 个 region，则未加权比 `Σr/Σy ≈ 0.99`，`T_new ≈ 553,914 − 220,352 = 333,562 ms`（**假设 = 每声明 ≈1 region，M1 可钉**）。要落到 <120 s 需要 `R ≥ 1.9692`（region 站点承载 ≈2× typeSyntax 的加权流量）。详见 §5。

---

## §1 模型语义分层

### 1.1 三项分解（唯一正形）

```text
T_floor(p) = W_p / B_eff(p)  +  n_p × c_p        (+ 未归类残差，必须显式列)
             └─ 结构项 ─┘        └─ 逐项项 ─┘
W_p  : 该相按算法**必须触碰**的字节流（由算法决定，不由实现决定）
n_p  : 该相处理的项数（行 / token / 节点 / 事实行 / 指令字 / 函数）
c_p  : 单项成本（**实现 + 机器常量，无理论值**；逐世代实测，不得当理论值引用）
```

**两层缺一不可**：只有结构项，无法解释 parse 相 137 s（结构项是 ms 级）；只有逐项项，就退化成后验折算（当前两套"理论"的病）。

### 1.2 与内存模型 `peak_stream(k)` 的同构

| 内存模型（`design/memory_model_constraints.md`） | 时间模型（本文件） |
|---|---|
| `peak_stream(k) = F + I + B1 + B2 + T(k) + G(k)` | `T(相) = Σ_p [ W_p/B_eff(p) + n_p·c_p ] + 残差` |
| 结构项（F/I/B1/B2，一次性或按源） | `W_p`：按算法的字节流（`Σ L`、列字节、指令字） |
| 逐源斜率（`T(k)`、`G(k)`） | `n_p · c_p`：逐项斜率（`c` = 逐世代实测常数） |
| 未钉区①–⑤（不得当 0） | 未钉项 U1–U10（§7，不得当 0、不得估） |
| 诊断仪器 > 门值标量 | `c_p` 分解 > "13.7×" 这个标量 |

### 1.3 三类数字不得互算

| 类别 | 例子 | 允许用法 |
|---|---|---|
| **结构项**（可证下界） | `Σ_k L_k`、`column_bytes`、`code words × 4 B`、`tokens` | 与实测相除得"实现超出倍数" |
| **逐项项**（逐世代实测） | 210.86 µs/行、24.97 µs/op、1.634 µs/word、6,350 µs/函数 | 只可在**同世代同窗口**内比较/外推，标 `[实测]` |
| **后验折算 / 校准系数** | `compile_theory_parallel_limit_ms`、`bytes×50 ns`、`csgNode×3 µs` | **只可作诊断**；不得作边界、不得进收敛判据 |

---

## §2 逐相 `W_p`（算法级定义 + 最小遍历次数）

### 2.1 C 链（`kd_b102`；234 源 / 649,715 行 / 30,989,631 B）

相边界（实读，`bootstrap/cheng_cold.c`）：`compile_start_us` `:103147` → `parse_end_us` `:104040` → `codegen_end_us` `:105582` → `emit_end_us` `:105925`；统计写回 `:105937-105939`。

| 相 | `W_p`：算法必须触碰的字节 | 最小遍历次数 | `n_p`（可实测项） | 实测 |
|---|---|---|---|---|
| **P1 parse**（前端：签名/import 闭包 → 入口 parse → 可达物化 → freeze；子相名实读于 `:103196/103354/103855/103885`） | ① 源文本 30,989,631 B（`source_storage=mmap_span` ⇒ 首触即 page-in）；② 每个 token 写 1 次 + 语法判定读 1 次；③ 每个 AST/BodyIR 节点/op/block **写 1 次**；④ 每条 import 边遍历 ≥1 次；⑤ 每个声明登记 ≥1 次 | 源文本 **1**（词法）、token 流 **1**（语法）、body **1**（物化）、import 图 **1**（可达性）、声明表 **1** | lines 649,715；frontend functions 21,574；op 2,659,819；block 768,375；param 37,829；declaration 18,783；**token 数 未钉**（回执无字段） | **136,997,679 µs**（65.75%） |
| **P2 codegen**（lowering/regalloc/指令选择/重定位/debug 信息；子相名 `:104046` "codegen"） | ① 每个 frozen body op **读 1 次**；② 每条指令字 **写 1 次**（40,641,788 words）；③ 每条重定位/标签写 ≥1 次（**计数未钉**）；④ 每函数 debug line/abbrev/info ≥1 次 | op **1**、block **1**、word **1** | total_function_count 13,938（实际编译）；code words 40,641,788；reloc/label **未钉** | **66,412,770 µs**（31.87%） |
| **P3 emit**（Mach-O/ELF 写出 + 行表 + 对象缓存） | 产物体积 = 指令字节 162,567,152 B + 头/符号/重定位/行表（实测差 8,888,480 B = 5.5%） | 每个输出字节 **写 1 次**、每个映射区 **读 1 次** | 产物文件 `.rebuild/s1b_step3/r9/kd_b102` = 171,455,632 B | **49,542 µs**（0.024%） |
| **P4 未归类** | —— | —— | —— | **4,907,538 µs**（2.36%） |

`[实测]` 证据：`.rebuild/s1b_step3/r9/kd_b102.report.txt:76`（`cold_compile_elapsed_ms=208367.529`）、`:79-80`（行/字节）、`:56`（words）、`:60`（total_function_count）、`:44-50`（frontend/op/block/param）、`:33`（declaration_origin_count）、`:115-118`（三相 µs）。

### 2.2 Cheng 链（`kd_r96` 世代；234 源，抬门 3.6 GiB **diagnostic**）

阶段序列与 `since_ms`（回执 `.rebuild/s1b_step3/r9/gate/r96_ctx.stderr.txt`，行号为该文件内行）：

| # | stage | `since_ms` | `rss_bytes` | 该相算法必须触碰 |
|---|---|---|---|---|
| 1 | `after_binding_source_texts` | 631 | 152,945,360 | 每源文本绑定 1 次（`Σ L`） |
| 2 | `after_profiles` | 39,956 | 376,308,552 | 每源 profile 行 ≥1 读（`line_starts` 列见 `:20+` `ctx_probe`） |
| 3 | `after_reachable_function_set` | 5,902 | 408,355,680 | 每函数/调用边 ≥1 次 |
| 4 | `after_profile_source_payload_release` | 33,903 | 575,177,664 | 每行载荷 1 次释放/压缩 |
| **5** | **`after_profile_lookup`（森林窗终点）** | **327,648** | 1,349,502,536 | pass0 逐源读树 + pass1 逐源重读树 + 列追加 |
| 6 | `r92_t1..tb`（typed/frontier） | 9/295/106/0/0/8/0/0/0/0/277/1/…/612 | 1.32–1.35 GB | 每事实行/每声明 ≥1 次 |

**§2.2.1 森林窗内容分解（本轮从回执逐行求和，非文档转述）**

| 量 | 值 | 来源 |
|---|---|---|
| 窗口总长 | **327,648 ms** | `r96_ctx.stderr.txt:1916`（`since_ms` 语义实读于 `compiler_csg.cheng:2013/2028`） |
| pass0 逐源读树合计 | **60,379 ms**（234 行求和；median 43、p90 391、max 9,383、>1 s 的 12 源） | `:…` `tag=forest_parse_end pass=0 src=N arena=A parse_ms=M`（234 行） |
| ⇒ pass1 + 流式落地 | **≈ 267,269 ms**（差） | 上两行相减 |
| `Σ` 源文本 | 30,991,157 B（234 源） | `tag=forest src=N bytes=B` 逐源取值求和 |
| `Σ` 逐源树 arena | 1,296,795,360 B ⇒ **41.84×** 放大 | `tag=forest_parse_end … arena=` 求和 |
| 最大单源 | `src=61` = **`src/core/backend/primary_object_plan.cheng`** 4,513,921 B / parse 9,383 ms / arena 140,260,800 B（31.07×） | 同上 + `wc -c` 对齐（4,513,913 B） |
| 次大单源 | `src=134` = `src/core/lang/typed_expr.cheng`（3,555,425 B / 9,303 ms / 140,603,200 B）；`src=132` = `src/core/lang/parser.cheng`（1,850,758 B / 4,387 ms / 72,458,048 B） | 同上 |
| 全林列（`ta_limits`） | tokens **3,634,390**、type_syntax **158,433**、column_rows 17,870,990、column_bytes 71,483,960、functions 17,468 | `r96_ctx.stderr.txt:972`（发出者 `compiler_csg.cheng:33581/36240`） |
| 声明索引（`decl_index`） | entries 1,315、sources 234、type_syntax 158,433、declarations 156,146 | `r96_ctx.stderr.txt:974` |

派生斜率（同世代同窗口，可复算）：pass0 树读取 = `60,379 ms / 30,991,157 B` = **1.948 µs/B**；列写 = `71,483,960 B / 3,634,390 tok` = **19.67 B/token**。

**§2.2.2 同族三站点模型（`ParserValueExprTreeAppendFromImpl`）**

站点锚点（三处坐标世代并列，因为他线在飞）：

| 站点 | 工作树（本轮实读） | HEAD `b083fc3dd` | 文档历史锚（`9c368085c`） | 缓存状态 |
|---|---|---|---|---|
| node 循环（唯一有缓存者，上游） | `:10451` 声明 | `:10399` | `10303-10330` | 已有 |
| token 循环 | `:10700` 声明 / `:10712` Intern / `:10714` CloneStr | `:10648` | `:10552/10553` | **已补**（`c5f6c6736`） |
| typeSyntax 循环 | `:11125` 声明 / `:11138` Intern / `:11140` CloneStr | `:11073` | `:10977/10978` | **已补**（`c5f6c6736`） |
| **region 循环** | **`:11847` 循环 / `:11854` Intern / `:11856` CloneStr** | **`:11795` / `:11802` / `:11804`** | **`:11699/11706/11708`** | **未补** |

模型（形状三处一致，实读工作树 `:10711-10715` / `:11137-11141` / `:11854-11858`）：

```text
算法必须：  每个源文本在并林时被触碰 1 次（把 sourceTextId 映射进 out.internPool）
            ⇒ W_merge(算法) = Σ_k L_k
实现现状：  每个 item 一次  CloneStr(L_k)  +  Intern(L_k)      ①malloc+memcpy L_k
            ⇒ W_merge(实现) = Σ_k (t_k + y_k + r_k) · L_k · (1 次 memcpy + 1 次 hash + 探测比对)
超出倍数 = W_impl / W_algo = Σ_k (t_k+y_k+r_k)·L_k / Σ_k L_k  = 加权项数
```

**量级外推（`[实测推算]`，假设显式）**：取同世代 `ta_limits` 的 `Σ t_k = 3,634,390`、`Σ y_k = 158,433`；取回执逐源 bytes 算得 `Σ L_k = 30,991,157`、`Σ L_k² = 4.9913×10¹³`。
- 假设 `t_k = ρ·L_k`（ρ = `3,634,390/30,991,157` = 0.117272 token/B，跨源等密度）⇒ `Σ t_k L_k ≈ ρ·Σ L_k²` = **5.853×10¹² B**；`Σ y_k L_k ≈ (158,433/3,634,390)×5.853×10¹²` = **2.552×10¹¹ B**；两项合计 **6.109×10¹² B**。
- **无假设上界**：`Σ t_k L_k ≤ (Σ t_k)·L_max` = 3,634,390 × 4,513,921 = **1.64×10¹³ B**。
- ⇒ 超出算法底线（3.099×10⁷ B）**≈ 2.0×10⁵ 倍**（等密度）/ 上界 5.3×10⁵ 倍。
- `r_k`（region 项数）**全仓无实测** ⇒ 上列数字**不含** region 站点；这正是 §5 预测里 `R` 未钉的原因。

### 2.3 「算法必须」vs「当前实现顺手多做」（总表）

| # | 相 / 站点 | 算法必须（下界） | 现实现顺手多做 | 量级 |
|---|---|---|---|---|
| 1 | Cheng：并林文本流（三站点） | 每源文本 1 次 | **每 item 1 次全源文本 clone+intern** | 超 2.0×10⁵ 倍（§2.2.2） |
| 2 | Cheng：pass0 树读取 | 每源树 1 次独立读（`forest_parse_end` 实测 arena 41.84× 放大） | 逐源 arena 按倍增容量分配、写列时逐页驻留（`设计 §8.24/§8.29` 已定位为 U0/X1b 族） | 41.84× 于源文本（同世代实测） |
| 3 | Cheng：pass0 → pass1 **两遍**读同一批源 | 物化只需 **1 遍**（pass0 的解析结果若保留即可喂 pass1） | **重复解析 2 遍**（`:33466`/`:33519` 与 `:36335`/`:36406` 两个 `forest src=` 循环） | 未钉（需 M4 分段计时） |
| 4 | Cheng：TypeArena 逐源追加 | 每列 row 写 1 次 | 09-12 前：去重表**每次插入全表复制两份**（X1，已修 `ta_dedup_table_arena.patch`，`设计 §8.27/§8.28`） | 修前 2,070.9 MB / 192 源 |
| 5 | C 链 parse | 源文本 1 遍 + 每 token/节点写 1 次 | **未发现同族缺陷**：`bootstrap/cold_parser.c` 无"每 token intern 全源文本"形态（intern 只有 `cold_var_place_intern` 位置身份族），这是它 4.42 µs/B 能站住的原因（**按 grep 实读，未做逐调用核验**） | —— |
| 6 | C 链 codegen | 单线程即可满足正确性 | 实测**就是单线程**：`lowering_parallel_job_count=0`、`lowering_parallel_active_workers=0`、`function_task_schedule=none`（`:39-43`）⇒ 14 核只用 1.02 核。这是**并行度**项，不是算法项 | 有效并行度 1.0214/14 |
| 7 | 全链 | —— | 未归类残差（C 链 4,907,538 µs = 2.36%） | 待钉 M5 |

---

## §3 `n_p × c_p` 项清单（三态来源标注）

三态定义：`[实测]` = 有回执/回执字段可指；`[校准]` = 现存系数，**必须标注它是后验标定**；`未钉` = 无任何实测，不得填数。

| # | 链 / 相 | `n_p` | `c_p` | 三态 | 出处 |
|---|---|---|---|---|---|
| T1 | C parse | 行 649,715 | **210.86 µs/行** | `[实测]`（本轮由回执相除复算） | `kd_b102.report.txt:79,115` |
| T2 | C parse | frontend 函数 21,574 | **6,350.13 µs/函数** | `[实测]` | `:44,115` |
| T3 | C parse | body op 2,659,819 | **51.50 µs/op** | `[实测]`（op 计数的采集时点：`:81853-81856` 注释说明它在 codegen_program 内累加，故该 `c_p` 是**跨相摊派**，不是纯 parse 单项） | `:46,115` |
| T4 | C parse | 源字节 30,989,631 | **4.42 µs/B** | `[实测]` | `:80,115` |
| T5 | C codegen | 编译函数 13,938 | **4,764.87 µs/函数** | `[实测]` | `:60,116` |
| T6 | C codegen | code word 40,641,788 | **1.634 µs/word** | `[实测]` | `:56,116` |
| T7 | C codegen | body op 2,659,819 | **24.97 µs/op** | `[实测]` | `:46,116` |
| T8 | C emit | 输出字节 162,567,152 | **3.28 GB/s**（相除得速率） | `[实测]`；**该值同时被用作本文件的结构项参照带宽 `B_ref`** ⇒ 用它反算 emit 是自洽而非独立验证（已在 §4.1 声明） | `:56`、`:117`、产物 `ls -la` |
| T9 | Cheng 森林窗 pass0 | 源文本 30,991,157 B | **1.948 µs/B** | `[实测]`（本席从 234 行 `forest_parse_end` 求和） | `r96_ctx.stderr.txt` 逐行 |
| T10 | Cheng 森林窗 | —— | **未钉**（pass1 与 pass0 的分段成本） | 未钉 | 需 M4 |
| T11 | Cheng 列总量（`ta_limits`） | token 3,634,390 | 19.67 B/token（列字节/token，**字节量不是时间**） | `[实测]` | `:972` |
| T12 | Cheng 三站点 region | `Σ r_k` | 与 T13 同形（同文本、同 `CloneStr+Intern`） | **未钉**（全仓 `regions=` 0 命中） | 需 M1 |
| T13 | Cheng 三站点 typeSyntax | `Σ y_k = 158,433` | **实测边际：220,352 ms**（774,266→553,914，同窗同闭包） | `[实测]`（**但原始件已清理，见 §7-U6**）：`VERIFY_fullgo_0910_append.md:805`、`pa_s1b_edit_plan.md:276` | 同上 |
| T14 | Cheng 理论块系数 | `sourceBytes` | `50 ns/B`（= 20 MB/s） | **`[校准]` 后验标定** | `backend_driver_main.cheng:4417` |
| T15 | Cheng 理论块系数 | `sourceFiles` | `200 µs/文件` | **`[校准]`** | `:4416` |
| T16 | Cheng 理论块系数 | `csgNodes / csgFacts / csgExprs` | `3 µs / 1.2 µs / 2 µs` | **`[校准]`** | `:4420-4422` |
| T17 | Cheng 理论块系数 | `typedIrFunctions / typedIrStatements` | `70 µs / 1.2 µs` | **`[校准]`** | `:4425-4426` |
| T18 | Cheng 理论块系数 | `loweringBodyIrOps / loweringFunctions` | `2.5 µs / 50 µs` | **`[校准]`** | `:4428-4429` |
| T19 | Cheng 理论块系数 | `primaryInstructionWords / Relocs / DataLabels` | `1 µs / 5 µs / 3 µs` | **`[校准]`** | `:4431-4433` |
| T20 | Cheng 理论块常量 | `providerPhaseNs=0`、`linkPhaseNs=1 ms/5 ms`、`reportPhaseNs = files×50 µs + 250 µs` | 常量，非模型 | **`[校准]`（自述"未建模"）** | `:4436-4441` |
| T21 | C 链理论量 | —— | `ceil(cpu_us/逻辑核)` | **后验折算**（输入含本轮实测 CPU ⇒ 不能预测） | `cheng_cold.c:75967-75970`、`:76016`；`design/deterministic_model_derivation.md` §3.3 |

---

## §4 对账

### 4.1 C 链 `kd_b102`（逐位复算 + 逐相落在模型的哪一项）

**逐位复算（全部由同一回执字段推出，无外部输入）**：

```text
theory = ceil(212,825,907 µs / 14) = ceil(15,201,850.5) = 15,201,851 µs = 15,201.851 ms   ✓ 回执 :88
ratio  = floor(208,367,529 × 1000 / 15,201,851) = 13,706                              ✓ 回执 :91 = 13.706
线速   = ceil(649,715 × 10⁶ / 208,367,529) = 3,119                                    ✓ 回执 :89
       = ceil(649,715 × 10⁶ / 15,201,851)  = 42,740                                    ✓ 回执 :90
有效并行度 = 212,825.907 / 208,367.529 = 1.0214 核（共 14）⇒ 并行效率 7.3%
三相和 = 136,997,679 + 66,412,770 + 49,542 = 203,459,991 µs
残差   = 208,367,529 − 203,459,991 = 4,907,538 µs（2.36%，未归类）
```

**逐相 vs 模型**（`B_ref` = 3.28 GB/s，取自同轮 emit 相，见 T8 的自洽声明）：

| 相 | 结构项估算（按 `B_ref`） | 实测 | 实测/结构项 | 判定 |
|---|---|---|---|---|
| parse | 源文本 30,989,631 B ⇒ ≈ **9.4 ms**（不含写侧） | 136,997,679 µs | **≈ 1.45×10⁴** | **对不上**（结构项只占 1/14500）⇒ 该相 = `n_p×c_p` |
| codegen | 写侧 162,567,152 B ⇒ ≈ **49.5 ms** | 66,412,770 µs | **≈ 1,341** | **对不上** ⇒ 该相 = `n_p×c_p` |
| emit | 写侧 162,567,152 B ⇒ 49.5 ms | 49,542 µs | **1.00**（自洽，非独立验证） | **量级对上**：3.28 GB/s 落在页缓存写带宽带内；字节量有独立佐证（产物 171,455,632 B vs 162,567,152 B，差 5.5%） |
| 残差 | 无定义 | 4,907,538 µs | —— | **模型外**（§4.3-4） |

**能对上的**：① 三相的**量级结构**（结构项在 parse/codegen 可忽略、在 emit 主导）；② 逐项成本的**可复算性**（`c_p` 全部由回执相除得到，误差 0）；③ 并行度事实（1.0214 核）。

**对不上的**：① `c_p` **没有理论值**（210.86 µs/行这类数只能实测）；② token 计数缺失 ⇒ parse 的最细项数**未钉**；③ 重定位/标签计数在 C 链回执里不存在 ⇒ codegen 写侧项数**未钉**；④ 4,907,538 µs 残差无可归项。

**下一步判别方向**：① 在 `cheng_cold.c:103196/103354/103855/103885/104046` 五个既有 `cold_resource_diagnostic_set_phase` 名上各记一次时刻 ⇒ 137 s 立刻切成 5 段（零新结构、零语义变更，仅统计）；② parse 相 token 计数挂到 `cold_stats_attach_compile_input`（`:75930`）同族的 `compile_input_*` 字段组；③ codegen 相用 `sample` 按函数粒度取样定位 lowering / regalloc / 指令选择 / debug 四段。**不给任何"应该 X 秒"的目标值。**

### 4.2 Cheng 链（森林窗 `327,648 ms` vs 文档基线 `553,914 ms`）

**这两个数不可相除**，至少四个口径不同（`docs/.../deterministic_model_derivation.md` §④-16/§⑤-11 已登记其中两条，本轮追加两条）：

| # | 差异 | 553,914 ms | 327,648 ms |
|---|---|---|---|
| 1 | 闭包 | 29 源（`src/tests/typed_expr_type_arena_smoke.cheng`） | 234 源（`backend_driver_dispatch_min.cheng`） |
| 2 | 门 | 默认 768 MiB | 抬门 `rss_guard_env=3865470566`（**diagnostic**） |
| 3 | 世代 | 09-10（`kd_remap2`）：**整块并林尚未删除**，窗口内含 `ParserValueExprTreeAppendFromImpl` 三次逐源合林 | 09-12/13（`kd_r96`）：**并林已删**（`compiler_csg.cheng:33438-33460`），窗口内容为 pass0 测量 + pass1 流式落地 |
| 4 | TypeArena 去重表 | **X1 未修**（每次插入全表复制两份；修于 09-12，`设计 §8.27/§8.28`，192 源 −2,117,043,664 B） | X1 已修 |

**⇒ 553,914 → 327,648 的下降不可归因给任一条**；只能作为"跨世代量级已从 7.7×10² s 降到 3.3×10² s"的记录（且 327,648 一侧是抬门诊断轮）。

**同世代可复算项（本轮新增，全部来自 `r96_ctx.stderr.txt` 逐行求和）**：

```text
窗口 327,648 ms = pass0 逐源读树 60,379 ms  +  pass1+流式 ≈ 267,269 ms
窗口占整轮 = 327,648 / 452,000 = 72.5%   （整轮 wall=452s，r96_ctx.summary.txt:1，rc=1）
Σarena/Σ文本 = 1,296,795,360 / 30,991,157 = 41.84×   （与文档 §⑦-18 的 42.17× 同族、同量级）
```

> **口径不另立（单源）**：森林窗埋点对的裁定由并发车道的 `design/forest_window_caliber.md`（rev.1，与本文件同期出现）给出，结论与本文件一致（`after_profile_source_payload_release → after_profile_lookup`）；该件另给出同世代 234 源抬门读数 `forest_window_ms=290,183`（`r103_attr` 一轮）——与本文件的 `327,648 ms`（`r96_ctx` 一轮）是**不同轮次的不同驱动**，同为 `diagnostic`，二者不可相除、不可互相顶替。

**能对上的**：① 逐源斜率存在且可复算（1.948 µs/B；树 arena 41.84× 放大）；② 大源主导（12 源 >1 s，占 pass0 的相当份额：`src=61+134` 合计 18,686 ms = pass0 的 31.0%）；③ `ta_limits`/`decl_index` 提供了 token/typeSyntax 的**全林总量**，使 §2.2.2 的双线性外推有实测输入。

**对不上的**：① pass1 的 267,269 ms **在回执内无分段**（`forest_appended`/`ta_stream` 只是同一函数内背靠背两行，无时刻）⇒ 无法判定"重读树"占多少；② region 项数全仓无实测 ⇒ 三站点模型缺一项；③ 553,914 一侧的原始件已不存在（`.rebuild/remap_exp/` 已清理，本轮 `ls` 确认不存在）⇒ 只有文档记录，**不得作为发布证据**。

**下一步判别方向**：① M1（在 `compiler_csg.cheng:33519` 的 `forest_parse_end` 行补 `tokens=/type_syntax=/regions=/nodes=`；`sourceTree` 在该行仍持有，`:33523` 之后才 Release）⇒ 一条命令同时钉死 §5 的 `R` 与 §2.2.2 的 `Σ r_k`；② M4（在 `:40143` 与 pass1 循环内加一对时刻）⇒ 把 267,269 ms 切成"重读树 / 列追加 / 流式落地"。

### 4.3 对不上清单（逐条给判别方向）

| # | 对不上的项 | 差多少 | 下一步判别方向 |
|---|---|---|---|
| 1 | C parse 实测 vs 结构项 | ≈ 1.45×10⁴ 倍 | 用既有 5 个 `set_phase` 名切段（M5-a）；补 token 计数 |
| 2 | C codegen 实测 vs 写侧结构项 | ≈ 1,341 倍 | `sample` 按函数粒度定位四段；确认单线程是唯一并行事实（`:39-43` 已实测） |
| 3 | Cheng pass1 `267,269 ms` 无分段 | 不可分解 | 新增 M4 埋点 |
| 4 | C 链三相不闭合 wall | **4,907,538 µs（2.36%）** | 在 `:103147` 前与 `:105925` 后各加一个时刻字段（M5-b），使四项和逐位闭合 |
| 5 | 三站点模型的 region 项 | `Σ r_k` 完全缺失 | M1 |
| 6 | C 链 codegen 的 reloc/label 项数 | 回执无字段 | 从 `stats` 结构（`:75457` 一族）扩展输出 |
| 7 | 553,914 ms 的原始件 | 文件已不存在 | 只可引用文档记录；若需发布证据必须重烤 |

---

## §5 可证伪预测：第三处同族缓存（region）补完后森林窗落点

### 5.1 推导（只用同窗同闭包的边际量，不用跨链数字）

1. **锚定单项代价**：09-10 同窗同闭包（29 源、默认门、`kd_remap2`），仅补 token 缓存 → 森林窗 `774,266 ms`；再补 typeSyntax → `553,914 ms`。
   ⇒ typeSyntax 站点的边际代价 **ΔT(y) = 220,352 ms**（`[实测]`，文档记录；原始件已清理，见 §7-U6）。
2. **同形假设（显式）**：三站点做的是同一件事——对该 item 所属源的**整段源文本** `CloneStr` + `Intern`（工作树 `:10714-10715`、`:11140-11141`、`:11856-11858` 实读；三处文本同源、`Intern` 同一实现）。故单位加权流量的代价相同：
   `ΔT(site) = c · Σ_k count_k · L_k`，`c` 为同一常数。
3. ⇒ **region 站点的边际代价 `ΔT(r) = 220,352 × R` ms**，其中
   ```text
   R = [Σ_k r_k · L_k] / [Σ_k y_k · L_k]     （region : typeSyntax 的 L-加权项数比）
   ```
   `R` **未钉**（全仓无 regionCount 实测）。可复算的分母侧：`Σ y_k = 158,433`（`ta_limits`），`Σ y_k L_k ≈ 2.552×10¹¹ B`（等密度假设，§2.2.2）。
3b. **R 的量级从"按什么粒度建 region"单独可推**（不依赖 §5.1-2）：region 的种类枚举 14 项（`parser.cheng:279-294`），创建点 **24 处**（`ParserValueExprAppendRegion(` 除函数定义 `parser.cheng:15933` 与合林点 `:11850` 外的 24 个调用：`:19590/20881/21995/22874/23264/23400/23423/23952/24036/24088/24448/24463/25000/25408/25676/25763/25891/25898/25963/26008/26069/27202/27368/27631`）——**按"带类型标注的声明 + case arm + pattern"粒度**创建，不是按函数、也不是按源创建。
   同世代可实测的总量：`declarations = 156,146`、`type_syntax = 158,433`、`functions = 17,468`（`r96_ctx.stderr.txt:974`/`:972`）。
   ⇒ **假设 A（可被 M1 直接证伪）：平均每个 declaration 贡献 ≈1 个 region** ⇒ 未加权 `Σr/Σy ≈ 156,146/158,433 = 0.986`；在"region 与 typeSyntax 的 L-分布同形"下 `R ≈ 0.99` ⇒ `T_new ≈ 333,562 ms`。
   ⇒ `R` 的**结构区间**：下界 `R ≥ 0`；假设 A 给中心值 `R ≈ 1`；`R ≥ 1.97` 需 region 行数（按 L 加权）达 typeSyntax 的 2 倍——只有当声明/arm/pattern 的 L 加权个数 ≥ typeSyntax 的 2 倍时才可能。
4. **同世代预测式**：`T_new = 553,914 − 220,352 × R` ms。

### 5.2 区间与反转阈值（推导，不是拍数）

```text
预测区间（由 R 参数化，R 未钉）：
        T_new(R) = 553,914 − 220,352 × R   ms
        假设 A（每声明 ≈1 region）⇒ R ≈ 0.99 ⇒  T_new ≈ 333,562 ms
判据可达条件：T_new < 120,000 ms  ⟺  R ≥ (553,914 − 120,000) / 220,352 = 1.9692
        即 region 站点必须承载 ≈ 2× typeSyntax 的 L-加权项数
```

**预测（可证伪，落点给区间不给拍数）**：
- **主预测：`T_new ∈ [3.3×10², 5.5×10²] s`**——中心值 `≈333,562 ms`（R≈1，假设 A），且 `R` 越小越靠近 `553,914 ms`；**该窗不会落到 <120 s**，除非 `R ≥ 1.97`。
- 换言之一句话：**"补第三点"买到的量级是"再省 ≈2.2×10² s"，不是"降到 10¹ s"**；判据"<120 s"在 553,914 ms 基线上需要 region 的 L-加权行数是 typeSyntax 的 2 倍。

### 5.3 两条必须同时给出的附加判词

**(a) 现世代该预测的落点已不在森林窗**：现树 `CompilerCsgBuildParserForestAuthorityInto`（`:33384`）自述"精确容量并林已删除"（`:33438-33460`），且该函数内已无 `ParserValueExprTreeAppendFrom`；全仓只剩 2 个调用点——`compiler_csg.cheng:30704`（typed/frontier 相，`r92_t5_post_structured` 一族）与 `parser.cheng:3698`（delta 层）。⇒ 在**现世代**，第三点修复对本闭包**森林窗**的预期影响 **≈ 0**；其可观测效果应转移到 typed/frontier 相。
⇒ **判据修正建议（本文件对 L3 的输入）**：把"森林窗 <120 s"改为**双判据**——① 同世代森林窗（`after_profile_source_payload_release → after_profile_lookup`，口径与绑定项照 `design/forest_window_caliber.md` §0 的三件绑定模板整行照抄）相对基线不回归；② 新增 typed/frontier 相埋点对（`after_profile_lookup` → typed 相末），第三点修复的效果只允许在这条埋点对上验收。

**(b) 若预测落空说明什么**（两种落空方向，各自的可判别结论）：
- **落空方向 1：实测 < 120 s（即 R ≥ 1.97）** ⇒ 同形假设 §5.1-2 错（region 每个 item 付的字节多于 typeSyntax），或假设 A 错（region 行数远超声明数），或基线含与 region 同源的第二主项。可判别：查 M1 的 `regions/tokens` 与 `type_syntax/tokens` 比 —— 若 `r/y` 比远小于 2，则"单项代价相同"被证伪（region 每个 item 付的字节多于 typeSyntax），此后禁止再用 `R` 做任何外推，必须逐站点实测 `c`。
- **落空方向 2：实测基本不动（≥ 530 s，即 R ≤ 0.1）** ⇒ "第三处 = 553.9 s 森林窗的主要残余"**被证伪**。判别：`design/pa_s1b_edit_plan.md:267` 与 `incremental-forest-consumption.md:114` 的定权依据只有 `VERIFY §22.9` 的**一次采样**（`el≈400s`，热点偏移 +90536/+90504），单次采样只能证明"那一刻 CPU 在那里"，**不能定权**；此时残余必须重新归因到同窗口内的其它项（X1 型分配 churn / 逐源树读取），并按 §4.2 的 M4 重新分段。

---

## §6 测量清单（命令级；本轮**不执行**）

**全局静窗前提前提（每条命令前都必须先过，任一不满足即放弃本轮）**：
```bash
test ! -e .rebuild/COMPILE_SLOT.lock                      # 槽位必须空闲
pgrep -fl 'cheng|kd_' | grep -v grep || true              # 必须为空（他线在飞则退出）
git diff --numstat -- src/core/lang/parser.cheng          # 必须与 10min 前读数一致（单写者让出）
git rev-parse HEAD                                        # 记入回执，绑定世代
```

| # | 目标 | 埋点位置（`文件:行`，写作时刻工作树） | 建议命令骨架（**不执行**） | 钉死什么 |
|---|---|---|---|---|
| **M1** | region / typeSyntax / token / node 逐源计数 | `src/core/tooling/compiler_csg.cheng:33519` 的 `forest_parse_end` 行，追加 `tokens={sourceTree.tokenCount} type_syntax={sourceTree.typeSyntaxCount} regions={sourceTree.regionCount} nodes={sourceTree.nodeCount}`（`sourceTree` 在该行仍持有，`:33523` 起才 Release） | `CHENG_CSG_MEM_TRACE=1 kd_<epoch> --in src/core/tooling/backend_driver_dispatch_min.cheng`（同 §22.7 口径，默认门，盒 1200s） | §5 的 `R`、§2.2.2 的 `Σ r_k`；同时给出"region 站点是否值得修"的定量前提 |
| **M2** | C 链 parse 的 token 计数 | 词法器出口（函数名未钉）+ 输出挂到 `bootstrap/cheng_cold.c:75930` `cold_stats_attach_compile_input` 同族字段 | `kd_b102` 同一入口重烤后读 `compile_input_token_count=` | §4.1 的 parse 项数缺口 |
| **M3** | C 链 parse 五段切分 | `cheng_cold.c:103196/103354/103855/103885/104046` 各记一次 `cold_now_us()`，输出 5 个 `exec_phase_parse_*_us` | 同上 | 137 s 落在 signature_import_closure / entry_parse / reachable_materialize / freeze 哪一段 |
| **M4** | Cheng 深林窗内部三切 | ① `compiler_csg.cheng:40143` 前后；② pass1 循环内 `forest_parse_begin pass=1` 与 append 之间、append 与 `ta_stream` 之间各加时刻（现树两行背靠背无时刻） | 同 M1 | 现世代的 267,269 ms → 重读树 / 列追加 / 流式落地三份 |
| **M5** | C 链三相闭合与残差 | (a) 上表 M3；(b) `cheng_cold.c:103147` 之前、`:105925` 之后各加一个时刻，输出 `exec_phase_pre_us` / `exec_phase_tail_us` | 同 M3 | 4,907,538 µs 残差归属；四项和 = elapsed 逐位闭合 |
| **M6** | typed/frontier 相 wall（第三点修复的**唯一合法验收面**） | 改用现成埋点对 `after_profile_lookup`→`after_typed_ir_expr_layer_rebuild`，零源码改动 | 同 M1 | §5.3(a) 的双判据第二条 |
| **M7** | region 单项实测代价（替代 `R` 假设） | `src/core/lang/parser.cheng` region 循环内加**只读**计数器（同门控、默认零输出零副作用），输出 `region_intern_calls=` / `region_intern_bytes=` | 同 M1 | 直接给 `c_r`，不再依赖 §5.1-2 的同形假设 |
| **M8** | C 链 codegen reloc/label 计数 | `ColdCompileStats`（`cheng_cold.c:75457` 一族）扩字段并在 `:105937` 块写出 | 同 M3 | §4.1 写侧项数缺口 |

> 【2026-09-15 勘误】M6 原文为「新增 stage `after_frontier_expr_layer`」。据 `docs/cheng-rsi-fusion-plan.md` 附录 A.6（读码实测）：生产路径上 typed/frontier 相调用点 `:39015` 之后 `:39044` 已有现成 `after_typed_ir_expr_layer_rebuild` 且在 stage allow-list 内，新增 stage 不必要；改用现成埋点对，零源码改动。

**建议但未定锚点的两处**：① `ParserValueExprSourceText`（`parser.cheng:14250`）之外的 `Intern` 站点是否还有同族循环（本轮只核了 `AppendFromImpl` 内的三处，实读 `grep CloneStr|Intern` 得 `:10465/10712/11138/11854`，其中 `:10465` 已有缓存）；② C 链词法器出口函数名（`cold_parse_source` 一族）未逐个核，故 M2 的函数锚点写"未钉"。

**探针纪律（照抄本仓红线，不得省略）**：补丁必须先过 `python3 .rebuild/s1b_step3/r9/patch_preflight.py <patch>`；每轮新驱动先跑双金丝雀（`fn main(): int32 = return 0` + `ordinary_zero_exit_fixture`，两条 `run_rc=0`）；撤销只用 `git apply -R <冻结件>`；诊断探针默认路径零输出零副作用、只读不写、不得留进产品路径。

---

## §7 未钉项登记（不得当 0、不得用估计值充数）

| # | 未钉项 | 现状 | 钉法 |
|---|---|---|---|
| U1 | `Σ_k r_k`（region 项数，逐源） | 全仓 `regions=` grep 命中 **0**；唯一既有通路 `compiler_parse_receipt_command.cheng:52-64`（`nodes=/regions=`）与 `compiler_parser_receipt.cheng:12285-12286`（JSON `regionCount`）**均无落盘实例** | M1 |
| U2 | C 链 token 数 | 回执无字段 | M2 |
| U3 | C 链 codegen reloc/label 项数 | 回执无字段 | M8 |
| U4 | C 链 4,907,538 µs 残差归属 | 三相之外 | M5 |
| U5 | Cheng pass1（267,269 ms）内部分段 | 该段无时刻 | M4 |
| U6 | 553,914 / 774,266 ms 的**原始件** | `.rebuild/remap_exp/` 已不存在（本轮 `ls` 确认）；只剩文档记录 `VERIFY_fullgo_0910_append.md:805`、`pa_s1b_edit_plan.md:276` | 只在文档级引用；作发布证据须重烤 |
| U7 | 森林窗另两个候选埋点对（`forest_build_start→末条 forest_appended`、`after_profile_source_payload_release→after_profile_lookup`）在同世代的数值 | 只取到第 3 个（327,648 ms） | 同一轮回执即可读出（零成本） |
| U8 | 现世代 typed/frontier 相 wall 的分段值 | 埋点在码里存在，全部 gate 回执 0 次发射，可达性与 cheng-plan §6.2 验收线同源 | M6 |
| U9 | `B_eff`（各相可选带宽）的独立实测 | 本文件只用同轮 emit 反算的 3.28 GB/s 作**参照**，未做独立带宽测量 | 一条 `dd`/`memcpy` 基准即可（但属新测量，本轮不做） |
| U10 | region 站点的单项代价 `c_r` | 无 | M7 |

> 【2026-09-15 勘误】U8 原文为「无埋点」。据 `docs/cheng-rsi-fusion-plan.md` 附录 A.6：埋点在码里已存在（`after_typed_ir_expr_layer_rebuild`，在 stage allow-list 内），只是全部 gate 回执 0 次发射、可达性未证——与「无埋点」的处置不同。

---

## §8 证据指针（只索引，不复制）

**回执（绝对路径）**
- `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/kd_b102.report.txt`（C 链 234 源三相 + 理论块；`:56` words、`:76` wall、`:88` theory、`:115-118` 三相）
- `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/r96_ctx.stderr.txt`（Cheng 链 234 源逐源树/arena/parse_ms/列总量；`:1916` 森林窗）
- `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/r96_ctx.summary.txt`（整轮 wall 452s、抬门 `rss_guard_env=3865470566`、`forest_appended_lines=234`）
- `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/kd_b102`（产物 171,455,632 B）
- `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/*.stderr.txt`（其余 234 源世代窗口：`since_ms` 273,503–361,267）

**源码（实读锚点）**
- C 链：`bootstrap/cheng_cold.c:75930`（compile input）、`:75958-75977`（理论折算）、`:76016`（标签）、`:103147/104040/105582/105925/105937`（相边界）、`:75457`（stats 结构）
- Cheng 链：`src/core/tooling/compiler_csg.cheng:2013/2028`（`since_ms` 语义）、`:33384`（forest build 入口）、`:33438-33460`（并林已删自述）、`:33519`（逐源 arena/parse_ms 发点）、`:36069`（流式落地）、`:40104/40143`（森林窗两端）、`:30704`（残余 append 调用点 1）
- 三站点：`src/core/lang/parser.cheng:10370`（`AppendFromImpl`）、工作树 `:10451/10700/11125/11847`（四缓存位）、`:11854/11856`（region Intern/CloneStr）；`:3698`（残余 append 调用点 2）
- 理论块：`src/core/tooling/backend_driver_main.cheng:4416-4451`（系数）、`:4461-4470`（自述"未验证/非上界/不含 codegen"）、孪生 `backend_driver_dispatch_min.cheng:2657-2692`

**文档**
- `docs/cheng-rsi-fusion-plan.md` §1.2/§三（L1 行）
- `docs/cheng-plan.md` §5.9.1/§5.9.2/§七（含 2026-09-13 口径收口段）
- `docs/campaigns/2026-08-31-kernel-userpath/design/deterministic_model_derivation.md` §3.1–§3.3、§⑦-6/7/8、§④-16、§⑤-11/12、§8.24–§8.28
- `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_fullgo_0910_append.md` §22.4/§22.7/§22.9
- `docs/campaigns/2026-08-31-kernel-userpath/design/pa_s1b_edit_plan.md` §6.3
- `docs/campaigns/2026-08-31-kernel-userpath/design/incremental-forest-consumption.md`
- `docs/campaigns/2026-08-31-kernel-userpath/design/memory_model_constraints.md`（同构对照）

**本轮红线遵守自述**：未编译、未链接、未计时、未取槽位、未写 `src/**`、未 commit/分支/worktree；本文件是本轮唯一新增交付物。

---

## 附录　2026-09-15 T43 离线翼

> T43（融合计划 §9.4）零编译复核。全文与逐相系数在 `docs/campaigns/2026-09-07-pure-cheng-rsi/receipts/t43_tm1_wing_20260915T093646Z.md`。本附录不改 §0–§8 正文。`compile_theory_parallel_limit_ms` 不进下表。

开工时本文件 `??`，sha256 `2ca19679…` = T01 改后，无他人 M/A/D。

`T_floor` 对账（结构项 = `W_p/B_ref`，`B_ref=3.2814 GB/s` 取自 `kd_b102` emit，`[参照]` 非独立 `B_eff`）。`n×c` 用同回执 `c_p` 则与实测恒等，不重复加进 `T_floor`。

| 链 | 相 | 实测 | `T_floor` 结构项 | 倍数 | 口径 |
|---|---|---|---|---|---|
| C | parse | 136,997,679 µs（`kd_b102.report.txt:115`） | 9.444 ms（`W=:80` 30,989,631 B） | 14,506× | 234 源 `kd_b102` |
| C | codegen | 66,412,770 µs（:116） | 49.542 ms（words×4=:56） | 1,341× | 同上 |
| C | emit | 49,542 µs（:117） | 49.542 ms | 1.00 | 自洽 |
| C | 残差 | 4,907,538 µs | 无定义 | — | 三相不闭合 wall |
| Cheng | 森林窗 | 327,648 ms（`r96_ctx.stderr.txt:1916`） | 9.445 ms（`Σ L=30,991,157`） | 34,690× | 抬门；口径 `payload_release→lookup` |
| Cheng | 森林 pass0 | 60,379 ms（234 行 `parse_ms` 重求和） | 9.445 ms | 6,393× | 与 §2.2.1 逐位相同 |

本翼新钉：① `r96` 的 `Σ L` 与 `kd_r96.report.txt:80` 逐位相同；② 默认门 `r96_default` 无 `after_profile_lookup`（61/234 触帽）；③ `after_typed_ir_expr_layer_rebuild` 在 `gate/*.stderr.txt` 仍 0 次（U8）；④ `.rebuild/tm1_line/` 收割目录已不在，数字从原始回执重算。
