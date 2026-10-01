# 确定性内存管理模型 · 全任务约束（binding）

> 本文件是**所有任务**（含所有子代理派单）的内存约束卡。派单时必须引用本文件；任何改动、任何诊断、任何"验收通过"的结论都按本文件判定。
> 门值是一条标量，**模型才是诊断仪器**：只拿 768 MiB 说事 = 放弃定位能力。

## 1. 模型（唯一权威，不要另立）

| 项 | 权威件 |
|---|---|
| 门值常量（唯一） | `tools/memory_model_limits.sh`（`CHENG_MEMORY_MODEL_LIMIT_BYTES=805306368` = 768 MiB） |
| 逐相工作集公式 + 确定性系数 + 实测对账 | `docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_tamem_model_append.md` |
| 包络项与遗留账的分类 | 同上 §六（B1/B2 = 结构遗留；C1/C2 = 二份拷贝与未钉行数） |
| 逐相实测锚与持有者归因 | `docs/campaigns/2026-08-31-kernel-userpath/design/peak_memory_holders.md` |
| 本战役内存/编译时间双极限计划 | `docs/cheng-plan.md` §七（病态判据红线）、§六（验收铁门） |

**逐相管理线锚（MiB，来自 `tools/memory_model_limits.sh`）**：
`enter 190` ｜ `bind 230–250` ｜ `profiles 372–392` ｜ `forest 窗 750–880` ｜ `TypeArena 100–120` ｜
`typed facts / typed ir = 待钉区⑤（原始建模时 ta1 未达该相，模型先行、未钉）`

**当前包络式**（TypeArena 被预钉住之后更正过，`C(k)` 那一项**不得**再按 k 增长记账）：
```
peak_stream(k) = F(前端驻留) + I + B1(pinned TypeArena，一次性) + B2(ctx index，一次性) + T(k) + G(k) + R(k)（reachable 函数集驻留，2026-09-20 补锚，定义见下）
```
**已定位的结构遗留（不得重复发现、也不得当成 0）**：
- **B1** forest arena 倍增拷贝瞬态 + 容量过冲（`arena.cheng` growCap=capacity*2 × 森林合并循环每源 AppendFrom 无预容量）⇒ 修法：合并两阶段化，先逐源累计精确 `ΣArenaUsed`，再一次 `ArenaReserve`。
- **B2** `lineStore` + `lineInternPool` 越窗滞留（持有者/最后读者见 `VERIFY_tamem_model_append.md` §六）。
- **C1** TypeArena token 列对 forest token 列的**二份拷贝**（16 B/tok ≈ 61 MB）。
- **C2** typed facts / typedIr **行数 = 待钉区⑤**，量的公式 `≈ 119 B/行 × 行数[1–3M] + typedIr arena + sidecars`。
- **R(k)** reachable 函数集驻留（2026-09-20 补锚，证据链 `.rebuild/modelanchor_line/MODEL_ANCHOR.md`；m3attrib/m3fix 两线移交的"无锚缺项"归属判词=**新模型项，非既有项漏计**）：`work.reachableSet` 逐函数 18 列 SoA + 闭包/队列/边扫描簿记 + profile 索引缓存（`compiler_csg.cheng:513-542`，行填充 `:26294`）；提交拷贝 `semanticGraph.reachableFunctionTable`（`:41160`）；graphNodeStore/名称邻接索引。**逐函数、全闭包全局（17,079 函数@234 源），构建于 after_profiles→after_reachable_function_set 窗（`:41064-41145`），无中途释放**（`ReleaseIndexes :38335→:21545` 只放索引/证书侧；行随 work 拆除终释放；r92 读面 `:39162-39343` 证明 merge/typed-facts 全程驻留）。锚值：**76.3–76.6 MiB（ORCD11/ORCD12m 两窗实测，窗间差 0.45%）**，斜率 **0.326–0.328 MiB/源 = 4,685–4,704 B/函数**；函数行数可从 `compiler_csg_reachable_live` 日志行直读。窗内 resident/transient 分解未钉 = **待钉区⑥**（未钉项不当 0）；跨闭包外推未验证（仅 k=234 单闭包实测）。TE5 RED 轮第三参照 +85.1 MiB（另一 head a9b2e1a9，不进锚值）。
- **X2** `work.typedMetadataContexts` 模型价修正（2026-09-20）：旧价 **645KB/源**（=645,106 B/源，r11b 窗 metadata_contexts_built 步进 +150,995,040 B ÷ 234 源，登记处 `design/peak_memory_holders.md` §3/§9）**已过时**。现行实测（ORCD12m 窗 kd_orcd12m，ORCD12 typed_expr 刀后）：**段净口径 473,175 B/源**（after_reachable_function_set→after_profile_source_payload_release，Δ110,723,192 B = 105.60 MiB，验收贴线相锚用）；**步进口径 445,729 B/源**（metadata_contexts_built，Δ104,300,640 B）；ORCD11 窗对应 557,336/528,349 B/源，两窗差全部由 typed_expr 刀解释（实削 18.4–18.8 MiB）。`m3fix_line/REPORT.md` §6 的 "≈451KB/源" 为段净 Δ÷240 的口径滑差（实际 234 源），不入卡。

## 2. 硬约束（每个任务逐条适用）

1. **必须给逐相内存影响**：任何源码/结构改动都要说明"影响哪一相、动的是模型里哪一项、增减多少、依据是什么"。**只写"应该更省"不算**。
2. **验收按逐相贴线**，不是只看总峰：每相实测 RSS 对模型值报差值，**差值 > 50 MB 即遗留物，必须解释**（`VERIFY_tamem_model_append.md:149` 的验收口径）。总峰 ≤768 MiB **且** 各相贴线 **且** `rc=0` 三判据同时成立才算绿。
3. **禁止用抬高门/放宽守卫/跳过守卫换 rc=0**。门值只允许改 `tools/memory_model_limits.sh` 一处，且须用户裁定。**排墙可以跑抬门诊断轮，但抬门轮读数一律不得计入达标，且必须与验收轮分开标注。**
4. **读数只可同窗口相对比较**：门口径是驱动自身 `phys_footprint`，受机器内存压力影响（同一未改动驱动在相邻窗口的守卫触发点实测差过 34 MB）。`gate_run.sh` 的 summary 已随轮记录 `loadavg/free_pages/page_size`，比较前先看这三项。
5. **`d_live` 与 `rss` 不可互换**：`d_live`（净留存块数）用来找"**谁留住了**"；`rss`（峰值贡献）用来找"**峰值贡献者**"。诊断结论必须声明用的是哪一个。注意"分配后又释放"的临时块**完全不体现在 `d_live` 里**。
6. **按源/按行累积的结构必须给出全量外推**：任何"逐源追加而不消费"的实现，都要给出 234 源全量的外推值与它落在哪个模型项；**外推超门即视为缺陷**，不得"先跑起来再说"。
7. **诊断探针的形态**：同门控（模块级 `var` + 一次性 `GetEnv`）、**默认路径零输出零副作用**、只读不写、**不得留进产品路径**。探针补丁交付前必须过**语法自检**（括号平衡 + 缩进 + `@borrows` 必须紧跟 `fn`），因为 C 链容忍的写法 Cheng 解析器不容忍（本战役已因此两次烤挂）。
8. **未钉项不得充数**：待钉区①–⑤（nodes/token、typeSyntax 行、statementRoot 对应、行去重系数、facts 行数）不得当 0、不得用估计值当实测；要么钉死并给出读数，要么显式标注"未钉"。

## 3. 当前账（滚动更新，任何结论都要先与这里对齐）

- **门线** 805,306,368 B；**模型预测峰值** ~781 MB（pass 0 末占门 96.9%）⇒ 模型自认"只超 13.1 MiB"。
- **实测（抬门诊断轮 `kd_r35`，并林 158/234）**：RSS **2,550,991,248 B = 3.17× 门**；同段 **TypeArena 全程仅 +651,296 B**（86,201,856 → 86,853,152）⇒ **增长不在被合并的 arena 上**。
- ⇒ **模型缺 `G(k)` 项**（并林逐源净留存，实测 ≈8–12 MB/源且未收敛），该项落在**相 6 / 待钉区⑤**一侧。**在 `G(k)` 钉死并压回门内之前，任何"接近达标"的说法都不成立。**
  - **2026-09-12 23:xx 定位（同窗口 `kd_r88`，234/234，逐相 `d_live`/`d_rss` 划分见 `deterministic_model_derivation.md` §8.46）**：`G(k)` 主项 = **reader 解析相每源 +7,577 块（≈1.4 MB）在树 arena 之外分配且无人释放**（解析相合计 +1,773,092 块 = 全部净留存的 67%；`ParserValueExprTreeRelease` 只还 ~9 块/源）。`state.tree` 摘链是必要但不充分；`d_live` 与 tokens 斜率 0.723 块/token ⇒ 按 token/节点的量，量级 1 块/1.4 token。
  - **2026-09-15 待钉区静态钉死（N2 线，§8.112）**：① nodes/token=**0.4733**、② typeSyntax 行=**158,375**、④ 行去重=**0.6110**（静态精确，lineInternPool 92MB→≈34.8MB）、⑤ 系数 119B/行已钉（行数不可静态钉，**外推 >2.2M 即超门缺陷**）；T(k) 带 445-530MB→**390-430MB**；③ statementRoot 部分钉（缺一行打印轮）。**待钉区状态：①②④与⑤系数已钉，③⑤行数待读数轮（各一行门控探针，排领地+槽空档）。**
- **2026-09-20 补锚轮（模型补锚线，零烤）**：m3attrib/m3fix 移交的 `after_reachable_function_set` 无锚缺项（Δ+76.6/+76.3 MiB 两窗一致）钉为**新模型项 R(k)**（定义与锚值见 §1）；X2 模型价 645KB/源（r11b 窗）修正为 **473,175 B/源（段净，ORCD12m 窗）/ 445,729 B/源（步进）**。**待钉区顺增⑥**：R(k) 窗内 resident/transient 分解（profile 重扫瞬态缓冲 vs 行结构驻留），需相位内字节账探针轮。证据链 `.rebuild/modelanchor_line/MODEL_ANCHOR.md`。
