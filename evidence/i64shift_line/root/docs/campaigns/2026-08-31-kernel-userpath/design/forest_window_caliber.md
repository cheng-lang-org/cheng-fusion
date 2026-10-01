# forest_window_caliber —— 森林窗（并林窗）单一埋点对口径裁定

**rev.1** · date_utc=2026-09-13 · 只读分析席（本任务：**零编译 / 零 git 写 / `src/**` 与 `.rebuild/**` 零写入**）
· 授权交付件 = 本文件（新建，唯一）
· 上游判据位：`docs/cheng-plan.md` §七-4（"森林窗必须先绑定单一埋点对口径"）、§6.3 **B2b/B2c**；
  `docs/cheng-rsi-fusion-plan.md` §二（⑥ 行）/§三 **L3**/§八 **A2**；`design/deterministic_model_derivation.md` §⑤-11 · §⑥ **C6**
· 标注：`[实测]`=原始件读数 ｜ `[实测推算]`=由原始件读数算术组合（非独立测量）｜ `[代码判据]`=源码行 ｜ **未钉**=树内拿不到读数，不填数

---

## 0. 裁定（先行）

**森林窗（S1b 判定口径）唯一 = `after_profile_source_payload_release → after_profile_lookup`**；
读数值 = 该轮 stderr 里的 **`csg_stage=after_profile_lookup since_ms=<N>`**（`[代码判据]` `src/core/tooling/compiler_csg.cheng:40104` → `:40143`）。

三件绑定，**缺一不可判定**（缺判据一律硬失败，不得用邻轮/别的闭包/别的守卫顶替）：

| 绑定项 | 取值来源 | 本轮实例 |
|---|---|---|
| **闭包** | 入口路径 + 源数（与 `csg_mem tag=decl_index … sources=` 对拍） | 29 源：`arena_scale_probe.err:257`；234 源：`r103_attr.stderr.txt:1242` |
| **守卫** | `rss_guard_env=` + `guard_hits=`；**只有 805,306,368 才叫门内**，其余一律 `diagnostic` | §8 证据清单 |
| **provenance** | 驱动 sha256 + 树修订（工作树 + 并存的未提交 WIP 登记） | `r103_attr.summary.txt:1` + `.rebuild/s1b_step3/r9/kd_r103` sha256 |

口径声明模板（后续报告**整行照抄**，否则该数字判无效）：

```text
forest_window_ms=290183 caliber=after_profile_source_payload_release->after_profile_lookup
closure=backend_driver_dispatch_min.cheng:234 guard=raised:3865470566 guard_hits=0
driver_sha256=2cc42b51b909934281195b1ec11add335c6133b912b4b0f66400c402d3c47ae0 tree=<HEAD|+未提交WIP清单>
```

另两个候选的处置：

1. **`forest_build_start → after_profile_lookup`：不另立。** 与裁定口径**同一区间**：终点相同，起点晚 8 条语句
   （`[代码判据]` `compiler_csg.cheng:40104` → `:40108-40112`；`[实测]` `arena_scale_probe.err:22-23` 与 `r103_attr.stderr.txt:68-69`
   两行 `rss` 逐字节相同 ⇒ 其间无分配、无阻塞调用）。起点只在 `csg_mem` 通道（无时钟）⇒ 选它不增加任何信息量。
2. **`forest_build_start → 末条 forest_appended`：否决。** 三条独立理由见 §4.3（无时钟 / 流式世代无内部计时 / B1 目标态删除该端点）。

---

## 1. 三个候选口径的埋点语义（谁发、走哪个通道、带什么字段）

**两个通道不对称，这是全部问题的根**：`csg_stage` 行带单调时钟（`since_ms` = 距上一条**被发射**的 stage），
`csg_mem` 行**只有 `rss/live`，无任何时钟字段**——三代 emitter 逐字相同：

| 世代 | `compilerCsgMemTraceEmit` 实现 | 行 |
|---|---|---|
| 工作树（流式） | `Fmt"csg_mem tag={tag} rss={os.ProcessRssBytes()} live={system.MemLiveAllocations()}"` | `src/core/tooling/compiler_csg.cheng:1677-1681` |
| `r3/base`（append_end 世代） | 同上逐字 | `.rebuild/s1b_step3/r3/base/src/core/tooling/compiler_csg.cheng:1609-1613` |
| `c2_line/pristine`（流式基座） | 同上逐字 | `.rebuild/c2_line/pristine/compiler_csg.cheng:1664-1668` |

`csg_stage` 侧：`compilerCsgTraceWriteStderr`（`compiler_csg.cheng:2026-2034`）用 `MonoTimeNs` 差分写 `since_ms`，
且**只在允许列表内的 stage 上更新基准**。因此 `after_profile_lookup since_ms` 的语义 = "距上一条被发射 stage 的墙钟毫秒"。

| 埋点 | 通道 | 语义（覆盖哪些相） | 代码址 |
|---|---|---|---|
| `after_profile_source_payload_release` | csg_stage（有 `since_ms`/`rss`/`live`） | profile 相收尾：`CompilerCsgCompactProfilesForFixedPoint` + `ProcessMemoryPressureRelief` 之后，前端行载荷已释放；同时是**保底驻留 rss 锚** | `:40102-40104` |
| `forest_build_start mode=reparse\|clone` | csg_mem（无时钟） | **延迟并林窗入口**（从 reachable-set 之前移到这里）；`reparse` = 无 reuse 计划、必须重 parse | `:40108-40112` |
| `forest_parse_begin/end pass=0` + `forest_parsed`（带 `parse_ms`） | csg_mem | **pass0**：逐源 parse 只为量 arena（`reserve=0`），不 append | `:33483-33484` / `:33520` |
| `forest src=N` / `forest_parse_begin pass=1 reserve=`（带 `reserve`） | csg_mem | **pass1**：按 pass0 的精确前缀和预留，再逐源 parse+append | `:36406-36407` |
| `append_end src=N append_ms=` / `forest_appended src=N` | csg_mem | **pass1 单源 append 完成**（`append_ms` 只在 append_end 世代有） | `.rebuild/s1b_step3/r3/base/…/compiler_csg.cheng:33244` |
| `ta_stream src=N`（流式世代取代 `append_end`） | csg_mem（**无 ms**） | 单源流式 TypeArena 追加（与 `forest_appended` 同一个 if 块内连发） | `:36593-36598` |
| `forest_build_done` | csg_mem | 并林函数返回（pass0+pass1 全部结束） | `:40127` |
| `decl_index entries=… sources=… verified=` | csg_mem | 声明索引封口 | `:40130` |
| `replay_pass pass=0 …` | csg_mem | 延迟行重放 | `:36750` |
| `typed_context_lookup_built` | csg_mem | 源上下文索引建完 | `:36765` |
| `after_profile_lookup` | csg_stage（有 `since_ms`） | **窗口终点**；紧随其后是 `r92_t1_pre_view_begin` | `:40143` |

**窗口纯净性（已逐修订核实）**：`after_profile_source_payload_release` 与 `after_profile_lookup` 之间**没有任何**
`CompilerCsgTraceStage` 调用点，故 `since_ms` 就是整段窗口，不掺别的 stage 分片：

| 修订 | release | lookup | 其中间 stage |
|---|---|---|---|
| 工作树 | `:40104` | `:40143` | 无 |
| `.rebuild/s1b_step3/r3/base/src/core/tooling/compiler_csg.cheng` | `:38924` | `:38974` | 无 |
| `.rebuild/c2_line/pristine/compiler_csg.cheng` | `:39985` | `:40024` | 无 |
| `.rebuild/s1b_step3/r9/mergeprobe_before/compiler_csg.cheng` | `:39461` | `:39500` | 无 |

---

## 2. 三口径数值表（**同轮并列**；绝对路径 + 行号）

口径定义：
- **A** = `forest_build_start` → `after_profile_lookup`
- **B** = `forest_build_start` → **末条** `forest_appended`
- **C** = `after_profile_source_payload_release` → `after_profile_lookup`（**裁定口径**）

| # | 轮次 / 驱动 / 闭包 / 守卫 | A | B | C | 原始件（绝对路径:行） |
|---|---|---|---|---|---|
| 1 | `diag/arena_scale_probe` · 驱动**未钉** · **29 源** · 守卫**未钉**（轮内采样峰 rss=602,178,640 B） | = C（区间同一） | **不可直算**（`csg_mem` 无时钟）；界 **[450,149, 465,494] ms**（下界 = Σpass0 5,810 + Σappend 444,339） | **465,494 ms** | `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/diag/arena_scale_probe.err`：C=`:259`，起点=`:22`，fbs=`:23`，Σpass0=`:26-138`，Σappend=`:142-254`，末条 appended=`:255` |
| 2 | `r103_attr` · `kd_r103` · **234 源** · **抬门 3.6GiB**（`rss_guard_env=3865470566`、`guard_hits=0`、`max_csg_rss=1,543,227,096`） | = C | **不可算**（`append_end` 已被 `ta_stream` 取代、无 ms）；端点在 `:2774`；界 **(50,239, 290,183) ms**（下界仅 Σpass0） | **290,183 ms** | `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/r103_attr.stderr.txt`：C=`:3162`，起点=`:68`，fbs=`:69`，Σpass0=`:73-1238`，末条 appended=`:2774`，`decl_index`=`:1242`，`replay_pass`=`:3148`，`typed_context_lookup_built`=`:3151` |
| 3 | `b101_scratch_importfix` · `kd_r94` · **234 源** · **抬门 3.6GiB** | = C | **不可算**（同上）；端点在 `:5644` | **277,406 ms** | `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/b101_scratch_importfix.stderr.txt`：C=`:5648`，起点=`:22`，fbs=`:23`，Σpass0=`:26-958`，末条 appended=`:5644` |
| 4 | `b102_scratch_importfix` · `kd_b102` · **234 源** · **抬门 3.6GiB** | = C | **不可算**；端点在 `:5644` | **361,267 ms** | `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/b102_scratch_importfix.stderr.txt`:5648（起点 `:22`、fbs `:23`） |
| 5 | `diag/raised_gate_kd_prev` · `kd_prev` · **234 源** · `CHENG_PARENT_RSS_GUARD=1`（**守卫关**）· 61/234 源后被杀 | **无值**（未到 `after_profile_lookup`） | **未闭合**；已做部分内部计时 = 46,869 + 591,392 = **638,261 ms**（下界） | **无值** | `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/diag/raised_gate_kd_prev.stderr.txt`：起点=`:22`，fbs=`:23`，Σpass0(234源)=`:26-958`，Σappend(61源)=`:962-1202`，末条 appended=`:1203` |
| 6 | `r7/gate/base` · `kd_base` · **234 源** · **默认门**（`guard_hits=1`、rc=125、`forest_appended=24`） | **无值** | **未闭合**；24 源 Σappend=188,017 ms（下界）；Σpass0=48,975 ms | **无值** | `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r7/gate/base.stderr.txt`：起点=`:22`，fbs=`:23`，Σpass0=`:26-958`，Σappend=`:962-1054` |
| 6b | `default768_verified`(`kd_prev`) / `default768_step3`(`kd_step3`) · **234 源** · **默认门**（`guard_hits=1`、rc=125） | **无值** | **未闭合**；两轮均 `forest_parsed=234`、`forest_appended=24`（死在 pass1 第 24 源）；守卫原文 `rss_bytes=832,308,448`（verified）/ `849,855,712`（step3）`> limit_bytes=805,306,368` | **无值**（两轮 `after_profile_lookup=` 均为空） | `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/gate/default768_verified.summary.txt:1-13`、`…/gate/default768_step3.summary.txt:1-13` |
| 7 | `kd_remap2` · 29 源 · **默认门**（§22.7） | — | — | **553,914 ms**（**原始件已不在树**） | 仅 `/Users/lbcheng/cheng-lang/docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_fullgo_0910_append.md:805` |
| 8 | `kd_remap` · 29 源 · 默认门（§22.4） | — | — | **774,266 ms**（原始件已不在树） | 同上 `:726`、`:805` |
| 9 | S1 · 10 源 · 默认门（§21.6） | — | — | **207,026 ms**（原始件已不在树） | 同上 `:535`（原文：自上一 stage `after_profile_source_payload_release` 起 207s） |

**234 源族（流式世代，全部抬门）C 值散布**（`[实测]`，共 23 个带 `summary.txt` 的轮有 C 读数，全部 `rss_guard_env=3865470566`）：

- 最小 **272,814 ms** — `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/r93_pool.stderr.txt:55917`
- 最大 **361,267 ms** — `…/r9/gate/b102_scratch_importfix.stderr.txt:5648`
- 中间：`r94_ledger` 273,503（`:1904`）、`r92_census` 274,849（`:55917`）、`r88_mergetrace` 276,858（`:3542`）、`r89_bisect` 277,588、`r91_arena` 278,878、`c2b_raised_diag` 305,285、`b204` 312,045、`r97_ctx` 310,987、`b501` 321,648、`c102_raised` 323,209、`r96_ctx` 327,648、`r98_pool` 340,739、`c2a_raised_diag` 350,210
- ⇒ **全部 `diagnostic`**（融合计划 §七-1）：内门被设为 3.6 GiB 的轮不得计入任何达标结论。

---

## 3. 差异归因：为什么会有"差数倍"的印象，以及真实差异在哪

### 3.1 同一轮内：三口径是**嵌套区间**，不是三种量级

`[代码判据]` + `[实测]`：`B ⊂ A ≡ C`（见 §0 第 1 条、§1 窗口纯净性表）。
可复算的最大落差 = 窗口尾部（`forest_build_done` → `typed_context_lookup_built`：声明索引 + 重放 + 上下文索引）：

| 轮 | C | Σpass0(`parse_ms`) | Σpass1(`append_ms`) | 残差 = C − (pass0+pass1) = 尾部 + 全部源间开销 |
|---|---|---|---|---|
| `arena_scale_probe`（29 源） | 465,494 ms | 5,810 ms（**1.25%**） | 444,339 ms（**95.5%**） | **15,345 ms**（3.3%） |
| `raised_gate_kd_prev`（234 源，61 源后被杀） | 未闭合 | 46,869 ms（234 源全做完） | 591,392 ms（**仅 61/234 源**） | — |

⇒ 在 `append_end` 世代，B 能吃到 C 的 95.5%（`arena_scale_probe`）。**三口径在同轮内不可能"差数倍"。**

### 3.2 "差数倍"的真实来源：跨轮混用（闭包 / 世代 / 机器窗口）

| 轴 | 读数 | 出处 |
|---|---|---|
| 闭包 10 → 29 源 | 207,026 → 465,494 / 553,914 ms | §2 表 #9 / #1 / #7 |
| 世代（同族站点缓存前后，29 源默认门） | 774,266 → 553,914 ms（**−28.5%**） | `VERIFY…:805` |
| 世代（并林世代 → 流式世代，234 源抬门） | 未闭合（61/234 源已花 638,261 ms）→ 272,814~361,267 ms | §2 表 #5 vs §2 末段 |
| **同一闭包同一世代、不同机器窗口** | `b101` 277,406 vs `b102` 361,267 ms（**差 83,861 ms**） | §2 表 #3 vs #4 |

⇒ `design/deterministic_model_derivation.md:367`（§⑤-11）"三者数值差数倍"这半句**在树内找不到同轮支撑**：
可复算的差异全部来自跨轮混用。**更正**：三口径在同轮内是嵌套关系（B ⊂ A ≡ C），跨轮散布真实存在且由闭包/世代/机器窗口解释。

### 3.3 每个起点/终点各自覆盖的相

| 口径 | 起点覆盖 | 终点覆盖 | 漏掉的相 |
|---|---|---|---|
| **C**（裁定） | profile 行载荷释放完成、保底驻留锚 | 源上下文索引建完 | —— |
| **A** | 与 C 同，晚 8 条语句（<1 ms 分辨率不可分） | 与 C 同 | 与 C 同 |
| **B** | 与 C 同（pass0 在 B 之内） | **pass1 末源 append** | `forest_build_done`→`typed_context_lookup_built` 之间的一切：`decl_index`、`replay_pass`、`typed_context_lookup_built`（`arena_scale_probe` 上占 15,345 ms；流式世代该段**无任何计时字段**，只有上界 `C − Σpass0` = 239,944 ms） |

---

## 4. 裁定理由（为什么 C 是 "S1b 判定" 的正确口径）

### 4.1 唯一可直读
C 是三个候选里**唯一**由编译器自己发射成单值（`since_ms`）的口径；A/B 的两端都在 `csg_mem` 通道（无时钟），
要读只能外加采样器，且 `gate_run.sh:29-43` 预留的 `el_ms=` 提取字段**在全部现存产物中恒空**
（42 个 `*.progression.tsv` 首列 0 行有值；`gate_run.sh` 那个正则期待 emitter 从未发射的字段）。

### 4.2 与 A 同值 ⇒ A 是冗余定义
见 §0 第 1 条。把 A 当独立口径只会制造"两个数不一样"的假分歧。

### 4.3 B 的三条否决理由
1. **端点无时钟**：`forest_build_start` 与末条 `forest_appended` 都在 `csg_mem` 通道，三代 emitter 均只发 `rss/live`（§1 表）。
   ⇒ B 的墙钟值在任何现存轮里**都读不出来**，只能给区间。
2. **流式世代内部计时归零**：`append_end … append_ms=` 已被 `ta_stream`（无 ms）取代（`compiler_csg.cheng:36593-36598`；
   `[实测]` `r103_attr` 中 `append_end`=0 行、`ta_stream`=234 行）⇒ B 在流式树上连"内部下界"都没有。
3. **B1 目标态删除该端点（判据自毁）**：§6.3 B1 / 施工图 §5 B1 明文要求 S1b 落地后 trace **无任何 `forest_appended`**
   （`docs/cheng-plan.md:996`、`design/pa_s1b_edit_plan.md:217`）⇒ 用 B 定义的判据会在 S1b 成功的那一刻失去发射点。

### 4.4 相覆盖正好等于 S1b 要拆的对象
C 窗 = pass0（逐源 parse 量尺）+ pass1（并林/流式 append）+ 声明索引 + 上下文索引。
S1b-1/2 删的是 pass1 的整块并林，S1b-N（region 同族站点）打的是 `ParserValueExprTreeAppendFromImpl`——两者**都在 C 窗内**；
B 只覆盖到 pass1 末源，流式世代里 pass1 之后的那一段（`decl_index`+`replay_pass`+`typed_context_lookup_built`）被它整段漏掉。

### 4.5 与 §6.3 **B2b（<120s）** 和 **B2c（pass0 活块曲线）** 的关系

- **B2b 不矛盾、基线数值不变**：B2b 写的基线 `553,914 ms` 本来就是 C 的值（`VERIFY…:805`）⇒ 钉口径不换基线，只让基线可复算。
  但 **B2b 现行文本把两个档写在同一行**（"29 源入口读 `after_profile_lookup since_ms` **且 pass0 234/234 源完成**"，
  `docs/cheng-plan.md:998` / `design/pa_s1b_edit_plan.md:219`）⇒ 必须拆成两档：
  - **29 源档（可判定档）**：入口 `src/tests/typed_expr_type_arena_smoke.cheng` + **默认 768MiB 门** + `guard_hits=0` + 盒 1200s，读 C **< 120,000 ms**。
  - **234 源档（当前不可判定）**：门内**无 C 读数**——默认门轮的撞门点在窗口内**不同半段**：
    `default768_verified`(kd_prev) / `default768_step3`(kd_step3) / `r7/gate/base`(kd_base) 均 `forest_parsed=234`、`forest_appended=24`，
    即死在 **pass1 并林**第 24 源（守卫原文 `rss_bytes=832,308,448` / `849,855,712` / `827,376,864` `> limit_bytes=805,306,368`）；
    `VERIFY` §22.8 的 `kd_remap2` 默认门则死在 **pass0** `src=61`（`forest_parsed=61`、`forest_appended=0`）。
    共同点：都在 `after_profile_lookup` 之前 ⇒ C 无值。所有能闭合 C 的 234 源轮都是抬门 ⇒ **只记 `diagnostic`**。
    "pass0 234/234 源完成"是**另一轴**（流式化/内存落位）的读数，不与 C 混算。
- **B2c 不矛盾、两轴正交**：B2c 读的是 pass0 的**逐源 live 曲线形状**（`forest_parse_begin/end` + `forest_parsed` 的 `live` 列），
  位于 C 窗的**前半段**；实测 pass0 内部计时只占 C 的 **1.25%**（29 源，5,810/465,494）到 **17.3%**（234 源流式，50,239/290,183）。
  一个是"整窗时长"、一个是"前半段的曲线是否平台化"，互不替代，也不冲突。

---

## 5. 可复制提取命令（**已在现存原始件上实测**）

最小形式（不做校验，只抓值）：

```sh
grep -m1 -o 'csg_stage=after_profile_lookup since_ms=[0-9]*' <RUN>.stderr.txt | sed 's/.*since_ms=//'
```

**判据用形式（带硬失败断言；缺判据即非零退出，符合"不得静默跳过"）**：

```sh
python3 -c "import re,sys;f=sys.argv[1];L=open(f,errors='replace').read().split(chr(10));R=[i for i,l in enumerate(L) if l.startswith('csg_stage=after_profile_source_payload_release')];K=[(i,l) for i,l in enumerate(L) if l.startswith('csg_stage=after_profile_lookup')];assert len(R)==1 and len(K)==1,'ABORT stage-count rel=%d look=%d'%(len(R),len(K));r=R[0];i0,l0=K[0];mid=[l for l in L[r+1:i0] if l.startswith('csg_stage=')];assert not mid,'ABORT impure window %r'%mid;ms=int(re.search(r'since_ms=(-?[0-9]+)',l0).group(1));p0=sum(int(re.search(r'parse_ms=([0-9]+)',l).group(1)) for l in L[r:i0] if 'tag=forest_parse_end pass=0 ' in l);ap=[int(re.search(r'append_ms=([0-9]+)',l).group(1)) for l in L[r:i0] if 'tag=append_end ' in l];print('file=%s rel_line=%d look_line=%d'%(f,r+1,i0+1));print('forest_window_ms=%d (=%.1fs)'%(ms,ms/1000.0));print('window_lines=%d pass0_parse_ms_sum=%d append_n=%d append_ms_sum=%s'%(i0-r,p0,len(ap),sum(ap) if ap else 'NA'))" <RUN>.stderr.txt
```

实测输出（逐字）：

```text
$ python3 -c "…" .rebuild/s1b_step3/diag/arena_scale_probe.err
file=.rebuild/s1b_step3/diag/arena_scale_probe.err rel_line=22 look_line=259
forest_window_ms=465494 (=465.5s)
window_lines=237 pass0_parse_ms_sum=5810 append_n=29 append_ms_sum=444339

$ python3 -c "…" .rebuild/s1b_step3/r9/gate/r103_attr.stderr.txt
file=.rebuild/s1b_step3/r9/gate/r103_attr.stderr.txt rel_line=68 look_line=3162
forest_window_ms=290183 (=290.2s)
window_lines=3094 pass0_parse_ms_sum=50239 append_n=0 append_ms_sum=NA

$ python3 -c "…" .rebuild/s1b_step3/diag/raised_gate_kd_prev.stderr.txt    # 无 after_profile_lookup
rc=1   （assert 触发：ABORT stage-count rel=1 look=0）
```

---

## 6. 不可算项 + 补采需求（逐条，不用别的轮次顶替）

| # | 不可算的东西 | 缺什么读数 | 需要哪一轮补采 |
|---|---|---|---|
| 1 | **B 的墙钟值**（任何轮） | `csg_mem` 行上的单调时钟（`gate_run.sh:39` 的 `el_ms=` 提取器已预备，emitter 不发射），或把两个端点改走 `csg_stage` 通道带 `since_ms` | 任意一轮 234/29 源自烤加该字段即可同轮算出 B。**但 B 已被否决 ⇒ 该补采不是达标必需**，只为把历史落差一次证伪 |
| 2 | 历史三读数 `774,266 / 553,914 / 207,026 ms` 的**可复算性** | 原始 stderr/timeline：`.rebuild/remap_exp/timebox/REMAP_ta_smoke.*`、`REMAP_short.*`、`.rebuild/run_b5/single/S1.stderr.txt` —— `ls` 实测这些目录/文件**均已被清理，不在树** | 重跑同入口同门（29 源 `typed_expr_type_arena_smoke` 默认门 + `CHENG_CSG_MEM_TRACE=1` + 盒 1200s；10 源档另跑 `ownership_drop_ir`）落盘 stderr；补采前这三数只能作**文档引文**，不得当基线 |
| 3 | **234 源默认门内的 C 值** | 门内没有窗口：树内默认门轮死在 pass1 第 24 源（`forest_appended=24`、rc=125），§22.8 的另一世代死在 pass0 `src=61`（`forest_appended=0`）——两种撞点都在 `after_profile_lookup` 之前 | S1b-M/内存侧把 pass0 驻留压回门内后的第一轮 **234 源默认门**自烤 |
| 4 | 流式世代 C 窗内的**相划分**（pass1+stream vs `decl_index`+`replay`+ctx） | `ta_stream` 无 ms、`append_end` 已删；`replay_pass` 无计时 | 流式世代加逐相计时（`MonoTimeNs` 直打埋点，勿用 `since_ms` 亚 tick 差分——`findings.md:12471` 已记该坑）后的任意一轮 |
| 5 | `arena_scale_probe` 的入口 / 驱动 / 守卫 | 该轮无 `summary.txt`/`report.txt`/`env_*`；`.rebuild/s1b_step3/diag/` 下只有 `.err/.out` 与 `.o` | 重跑该 29 源 probe 并落 summary（含 `rss_guard_env`/`guard_hits`/`driver_sha256`） |

---

## 7. 未钉项（如实登记，不得当 0）

1. `arena_scale_probe`（§2 表 #1）的**入口、驱动、守卫值未钉**：树内无 runner 脚本、无 summary/report（`rg 'arena_scale' ` 只命中 `MANIFEST.sha256:94-97` 与该日志自身）。按形态（有 `append_end`、无 `ta_stream`）判为 `append_end` 世代（`r3/base`~`r7`），**具体 commit 未钉**。末行 `typed expr: frozen module const query before build-index seal …bytes_layout.cheng name=FixedBytes32Size` 与 §22.4/§22.7 的 29 源档同文，是"同族闭包"的旁证，**不是入口身份证明**。
2. **23 个 234 源轮的 `class=acceptance` 与其抬门事实冲突**：`gate_r9.sh:11-12` 只按 `ROOT` 是否被覆写判 `acceptance/diagnostic`，不看门值；而实际 `rss_guard_env=3865470566`、`guard_hits=0`、`max_csg_rss=1.54 GB` ⇒ **抬门**。按融合计划 §七-1，这些轮的 C 值一律 `diagnostic`。该脚本缺陷**不在本任务授权范围**（`.rebuild/**` 只读），只登记不自作修改。
3. `docs/cheng-plan.md` §6.3 B2b 的"29 源 + pass0 234/234 源"混档写法**未改**（不在本任务授权范围）；本文件只给出拆分后的判定档（§4.5）。
4. `VERIFY_fullgo_0910_append.md` §一~§二十二 的数字取自**带未提交 WIP 的工作树**（该文 §二十三 自述）；本文引用的历史三读数因此只能在"文档引文"强度上使用，**provenance 不能钉到驱动 sha**。

---

## 8. 证据清单（原始件 + sha256）

| 原始件（绝对路径） | sha256 | 本文件引用 |
|---|---|---|
| `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/diag/arena_scale_probe.err` | `9f27aaa8f58b48bd3855c0b1d71ece6c5f7f7d44ee765de2e3cbf1d5784e0b9b` | §2 #1、§3.1、§5 |
| `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/diag/raised_gate_kd_prev.stderr.txt` | `0bc5176d2144c66e1016e634c4536c83699eca35eb802e70b36a69e68d8eaf84` | §2 #5、§3.1 |
| `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/r103_attr.stderr.txt` | `701edf530f84645aeb23798096fea201cacbcfd10078d5765cea889275437470` | §2 #2 |
| `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/b101_scratch_importfix.stderr.txt` | `85dba02cf3719688058351a9f937b05ec5a46d28b4bf6c574a607c97b040cd33` | §2 #3 |
| `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/b102_scratch_importfix.stderr.txt` | `476d74a034934417a89de5cde19bc0f20e842d50cba884e8fd24c133d4f93237` | §2 #4 |
| `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/gate/r93_pool.stderr.txt` | `0cfad8fefb819cc243d7d1687a7f7ede21b2049aaea05f51e1478b068563ef97` | §2 末段（C 最小值，`:55917`） |
| `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r7/gate/base.stderr.txt` | `5fc6b34f0c89e966d076d330ba53888254315ea41b4f7c1d62ca902b4be4aa52` | §2 #6（守卫原文 `:1058`） |
| 驱动 `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/kd_r103` | `2cc42b51b909934281195b1ec11add335c6133b912b4b0f66400c402d3c47ae0` | §2 #2 |
| 驱动 `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/kd_r94` | `284b92b8ce07ef21d44891e44f66eb4237b430215332d38f60746dc7044d7e34` | §2 #3 |
| 驱动 `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r9/kd_b102` | `dcd0610c6d7866c3ba2a361bb61842478fe85d0758f0a529dd0aac9297a81567` | §2 #4 |
| 驱动 `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/kd_prev` | `7dda4868c73257e1199067da8bdf73d4a56879714dee8e89036b35aacce19ba2` | §2 #5 |
| 驱动 `/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r7/kd_base` | `a02d69effc3bc2d235c5177db180fd119fb42fdcef0892eef4cbbf10ddf9d9e8` | §2 #6 |

**只读闸门**：本轮未运行任何编译/链接/烤机/计时；`.rebuild/COMPILE_SLOT.lock/` 当前存在且 `owner.txt` = `pid=96980 purpose=c2line_round2`（`ps` 同时见 `kd_c2c` 编译在飞）⇒ 槽位被他线持有，**本任务未触碰**；
未改 `src/**`、`.rebuild/**`、`docs/cheng-plan.md` 等任何在飞/权威件；本文为唯一新建文件。
