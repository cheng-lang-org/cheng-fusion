# `cheng_orc_release_failure registry_miss / normal_release`（r45）定位与归因

**结论先行**，全部读数来自只读手段（`git show` / `read` / `grep` / `kd_*.map` + 驱动二进制只读比对 /
`closure_census.py` 复算）。本轮**未编译、未烤机、未改任何共享源文件**；判别脚本落在 `.rebuild/s1b_step3/r9/orc_triage_*.py`。

---

## 0. 结论（六条，按证据强度排序）

1. **判词抛出点唯一**：`src/core/runtime/program_support_backend.cheng:6350-6356`（`cheng_mem_release_registry_miss_fail`），
   由 `:6397` 在 `cheng_mem_release_registered_header` 内触发；调用链 `cheng_mem_release_export`(`:6505-6507`)
   → `cheng_mem_release_checked(p,false)`(`:6472` → `:6480`)。判据 = **该 payload 指针此刻不在 ORC 存活登记表里**
   （`cheng_mem_header`→`cheng_mem_registry_contains`，`:1752` / `:1621`），且释放后立即落墓碑（`:1679-1750`）
   ⇒ 语义上就是「同一地址第二次被释放」或「从未登记的指针被推进释放路径」。

2. **直接根因（本轮新结论，二进制+补丁原文双证）**：**E1f 探针补丁的插入点正好劈开了
   `TypedExprBuildIndexAppendSourceCallDeclarationsManual` 的 `@borrows` 与它的 `fn` 行**，
   使该函数从 **kd_r36 起**变成「拥有并释放 `manualTree`」的语义；
   而它的唯一调用者仍在 `compiler_csg.cheng:36042` 释放同一棵树 ⇒ **同一棵 `ParserValueExprTree` 一圈内被释放两次**。
   这不是「摘探针的残余」，而是**探针「应用」那一步的破坏**；摘除步骤没能把它还原（见 §5）。

3. **时间线与驱动二分严丝合缝**：`kd_r35`（烤于 07:34）二进制里该函数 **244 B / 1 个 BL**；
   `kd_r36`（E1f 补丁 07:42 落盘后烤，≈07:50）起 **268 B / 2 个 BL**，多出的
   `BL <cold-drop-object:176>+44` 的 x0 正是参数 `manualTree`。此后 r37…r46 **11 个炉恒定不变**。
   调用者侧同轮同步变化：r35 把 `sourceTree` **拷贝到一个临时槽再传**，r36 起**直接把局部槽传进去**。
   两处一起改，恰好是「被调者失去 `@borrows`」的编译产物签名。

4. **现场坐标**：并林相 pass=1 每源循环体 —— `compiler_csg.cheng:35957-35959`（打 `forest_parse_begin`）
   到 `:36058-36063`（打下一条标签）之间；失败必然发生在 `:36032`（调用包装者）与 `:36042`（调用者释放）附近。
   11 源小复现（`fixtures_r9.sh` 的 `r8_btypes_const_bracket_main.cheng`）与 234 源自举**坐标完全相同**，
   两轮 src=0 都是 `src/chain/binary_types.cheng`（7371 B），src=1 一个 65 B 一个 9952 B
   ⇒ **与内容无关，与「这是第二圈 / 上一圈留下的状态」强相关**。
   更极端：两行源 `fn main(): int32 = return 0` 在 `kd_r45` 上同样报本判词，且其最后一条埋点是
   `typed_context_lookup_built`（**seal 相**，不是并林相）⇒ 超释放的受害者是共享 payload，
   **报错点为"第一个再次释放它的持有者"，随输入走到哪一相而变**（详见 §8）。

5. **候选 (a) `[S1b step-3 (8)]` 原地 append 被二进制否证**：该函数在 `kd_r35` 与 `kd_r45` 中
   **代码尺寸同为 6344 B、仅 8 个字节不同且全部 +4（重定位位移）**，同文件对照组噪声下限相同。
   r35（好）与 r45（坏）里它是同一份代码 ⇒ 不可能是差异源。09:06 的 `vis_swap` 受控实验（kd_r46）
   把整函数换成 HEAD 的 clone-回写版，`kd_r45→kd_r46` 的**唯一**尺寸变化就是它（6344→9496）；
   而 kd_r46 的包装者仍是 268 B / 2 BL ⇒ 该实验即使跑出「仍崩」也不意外，可作二次否证。

6. **归属 = (i) 探针事故（应用阶段）**，不是 (ii) 另一条 lane 的在飞改动，也不是 (iii) 叠加。
   闭包 3 行 / 19 字节的差（§4）**已定位且语义无害**（2 个空行 + 1 个重复注解清理），
   与该 ORC 误释放**无因果关系**，但确实是同一场事故的账目残差。

---

## 1. 判词抛出点与判据（逐条 `文件:行号`）

| 位置 | 内容 | 作用 |
|---|---|---|
| `src/core/runtime/program_support_backend.cheng:6350-6356` | `fn cheng_mem_release_registry_miss_fail(atomicRelease)`；`:6355-6356` 打 `code=registry_miss operation=normal_release detail=wrong_object_or_owner` | 本次判词**唯一**吐出点 |
| `...:6397` | `cheng_mem_release_registry_miss_fail(atomicRelease)` | **唯一**调用点 |
| `...:6382-6398` | `fn cheng_mem_release_registered_header(p, atomicRelease)`：`:6384` 快径、`:6388 header = cheng_mem_header(p)`，皆 nil ⇒ 判词 | 判据本体 |
| `...:1752-1773` | `cheng_mem_header(p)`：`if !cheng_mem_registry_contains(p): return nil` | 判据 = 登记表命中 |
| `...:1621-1641` | `cheng_mem_registry_contains(value)` | 开放寻址查存活登记 |
| `...:1679-1716` / `:1717-1750` | `cheng_mem_registry_remove` / `_remove_checked`（落墓碑） | 释放后该地址**立刻**不在册 |
| `...:6472-6482` | `cheng_mem_release_checked(p, atomicRelease)`；`:6480` 调上面 | 非 ledger 普通释放路径 |
| `...:6505-6507` | `cheng_mem_release_export(p) = cheng_mem_release_checked(p, false)` | **编译器生成的 drop 调用入口**（`normal_release` 的来源） |
| `...:6544-6546` | `cheng_mem_release_atomic_export(p) = cheng_mem_release_checked(p, true)` | 原子路径（本次不是它） |

兄弟判词（区分「哪种错」）：

- `refcount_underflow`（`:6358-6364`，`:6463` / `:6497` 由 `rcBefore <= 0` 触发）：header 还找得到但对活对象递减过头。
- `finalize_registry_miss`（`:6366-6372`，`:6422`）：rc 减到 0 要摘牌时找不到。
- **本次 `registry_miss`**：连 header 都找不到 ⇒ 该地址此刻不是任何存活 payload（= 已被释放过）。

---

## 2. 现场坐标

`compiler_csg.cheng` pass-1 每源循环体（`for sourceIndex in 0..<work.orderedSources.len`，`:35910`）：

| 行 | 动作 | stderr 标签 |
|---|---|---|
| `:35914-35925` | 取快照文本 `sourceText` | `forest src=N bytes=…` |
| `:35957-35959` | 打 `forest_parse_begin pass=1 src=N reserve=…` | 最后一条 csg_mem |
| `:35968-35970` | `parser.ParserValueExprReadTreeFromTextReserved(...)` | — |
| `:35985-36010` | 声明索引核对 + 解析权威追加 | — |
| `:36011-36031` | `TypedExprTypeArenaAppendSourceFromTreeInto(...)` | — |
| **`:36032-36037`** | **`texpr.TypedExprBuildIndexAppendSourceCallDeclarationsManual(buildIndex, work.typedMetadataContexts, sourceIndex, sourceTree, functionBase)`** | — |
| **`:36042`** | **`parser.ParserValueExprTreeRelease(sourceTree)`** | — |
| `:36044` | `os.ProcessMemoryPressureRelief()` | — |
| `:36058-36063` | 打 `forest_appended` / `ta_stream` | src=1 时**从未**打出 |

现场（`gate/r45_recheck.stderr.txt` / `r45_raised.stderr.txt` 末三行）：

```
csg_mem tag=ta_stream src=0 arena=86204744 ...
csg_mem tag=forest src=1 bytes=9952 ...
csg_mem tag=forest_parse_begin pass=1 src=1 reserve=590400 ...
cheng_orc_release_failure code=registry_miss operation=normal_release detail=wrong_object_or_owner
```

`forest_parsed_lines=234`（pass 0 冷森林全过）、`forest_appended_lines=1`（pass 1 只成功追加 src=0）、`guard_hits=0`。

---

## 3. 根因链（本轮核心）

### 3.1 源级机制：E1f 补丁的插入点劈开了 `@borrows` 与 `fn`

`docs/campaigns/2026-08-31-kernel-userpath/patches/e1f_buildindex_lens_probe.patch` 第一个 hunk 的**上下文行**逐字为：

```
@@ -37371,6 +37371,34 @@
 # the same body in the same per-context order, so the sealed index is the one
 # the whole-forest loop produced.
 @borrows                       ← 上下文行：这是包装者的 @borrows
+var typedExprBuildIndexTraceInitialized: bool     ← 插入从这里开始
+…
+@borrows                                          ← 插入块的最后一个注解
+fn TypedExprBuildIndexColumnLensTrace(…)
+… (28 行) …
+
 fn TypedExprBuildIndexAppendSourceCallDeclarationsManual(   ← 上下文行：包装者
```

即：**补丁块被插在包装者的 `@borrows` 与 `fn` 之间**。插入后那段文本变成
「`@borrows` / `var …` / … / `@borrows` / `fn Trace` / … / 空行 / `fn wrapper`」——
包装者的注解被"吃"掉了，它的 `fn` 上方只剩一个（属于探针的）空行。
树内现状与此一致：`src/core/lang/typed_expr.cheng:37368-37371` =
两行注释 + **空行** + `fn TypedExprBuildIndexAppendSourceCallDeclarationsManual(`，**没有 `@borrows`**。

### 3.2 编译产物级证据（不是源码推测）

`kd_*.map` 给出每个函数的 `offset/size`，可直接读驱动二进制里的机器码。

| 炉 | 烤制时刻 | 包装者尺寸 | 直接调用 |
|---|---|---|---|
| kd_r30 / r34 / **r35** | ≤07:34 | **244 B** | 只有 `AppendContextCallDeclarationsManual` @+176 |
| **kd_r36** | ≈07:50（E1f 落盘 07:42 之后） | **268 B** | 上述 + **`BL <cold-drop-object:176>+44` @+236** |
| kd_r37 / r38 / r39 / r41 / r42 / r43 / r44 / **r45** / r46 | 07:55–09:10 | 268 B | 同上，**恒定** |

kd_r45 反汇编尾部（`orc_triage_hexdump.py kd_r45:texpr.TypedExprBuildIndexAppendSourceCallDeclarationsManual`）：

```
+176  BL  texpr.TypedExprBuildIndexAppendContextCallDeclarationsManual
+220  ldr x0, [sp,#0x28]   ; 序言 +88/+92 把第三形参 manualTree 存在 sp+0x28
+232  add x0, x9, #0
+236  BL  <cold-drop-object:176>+44     ; 以 manualTree 为对象执行释放
```

kd_r35 同函数到 +216 与此**逐字节相同**，随后直接返回，**没有这一跳**（`.map` offset 0x18b00fc 两者相同）。
`<cold-drop-object:176>` 被 18 个 parser 树处理函数共用，入口先调 `cheng_mem_refcount` 再分派 ⇒ 引用计数语义的对象释放。

### 3.3 调用者侧同步变化（同一轮）

对 `ccsg.CompilerCsgStreamTypeArenaFromDeclarationIndexInto` 做指令级 diff（`kd_r35` 20476 words vs `kd_r45` 20474 words），
**唯一的结构性差异就在包装者调用点**（word 14402 ≈ 字节 57608）：

```
r35 : f949f3e0 (ldr x0,[sp,#0x13E0])  f9109be0 (str x0,[sp,#0x1370])
      … 之后 arg3 从 0x1370 取
r45 : 这两条被删除，arg3 直接从 0x13E0（sourceTree 局部槽）取
```

即 **r35 = 把 `sourceTree` 拷进临时槽再传（借用形态）；r36 起 = 直接把局部槽传进去（移交形态）**。
调用者与包装者两侧同时翻转，正是「被调者失去 `@borrows`」的签名；
而被调者 `TypedExprBuildIndexAppendContextCallDeclarationsManual`（`typed_expr.cheng:37269 @borrows`，1452 B）
在 r35/r45 逐字节不变，`compiler_csg.cheng:36042` 的显式释放也一直保留 ⇒ **同圈两次释放**。

### 3.4 「为什么死在 src=1」

- `src=0` 圈内：包装者的 drop 与调用者的守卫式释放（`parser.cheng:10249-10273`）同时发生，
  树对象本身并未当场被二次释放（否则会先撞 `:10264` / `:10267` 的
  `owner release outside active lifecycle` / `duplicate or borrowed owner release`，判词会完全不同）。
  被多吃掉一次引用计数的是**树持有的存储**（`:10270-10271` 的 `arenamod.ArenaRelease` /
  `langintern.InternPoolRelease`；池在 `:7791 InternPoolNew` 建立），
  或由**延迟持有者**在下一圈释放（parser 的 `NormalizedExprLayer` 持有 `layer.valueExprTree`，
  在下一次 Reset 才释放 —— `parser.cheng:3059-3080`，`:3076-3078` 的注释自己就点明了这个二次释放风险）。
- 这两条二级机制都把「已释放 payload 的第二次释放」推到 **src=1 的窗口**内，
  与观测死点（`forest_parse_begin src=1` 之后、下一条标签之前）完全一致。
  ⚠️ 本条为**推断**（归属不受影响），钉死它需要 §6 的 P1–P3 读数。

---

## 4. 闭包 3 行 / 19 字节差：定位

仪器：`closure_census.py`（父级提供，已对齐）——本轮复跑得 **`files=234 lines=649213 bytes=30955279`**，
与 `kd_r45.report.txt` 的三个 `compile_input_source_*` 字段逐字相等 ⇒ 当前树 ≡ r45 树（`vis_swap` 已逐字节还原）。
r35 = 649216 / 30955298 ⇒ 当前比 r35 **少 3 行 / 19 字节**。

用 `kd_r35` 与 `kd_r45` 的 line-map 逐函数比源码起始行（`orc_triage_line_fp.py`）：

- **闭包内只有 `src/core/lang/typed_expr.cheng` 行数变了（−3）**，其余 206 个有函数的模块行号全等；
  `compiler_csg.cheng` = 43127 → 43127（±0）。
- 转捩点只有两个：**（i）第 174 行之前 delta 已经是 −2**；**（ii）到 `TypedExprAddTypeFieldDeclInPlace`（r35:17211 → 今:17208）再 −1**。
  逐轮追踪：`r36` = 0/0；`r38` 起 (ii) 变 −1；`r41` 起 (i) 变 −2；`r43..r46` 稳定在 −3。

定位结果：

| # | 位置 | 内容 | 何时消失 | 性质 |
|---|---|---|---|---|
| 1–2 | `HEAD:16`、`HEAD:27`（导入块与 `type` 块中的两个**空行**） | 两行各 1 字节 | kd_r39→kd_r41（08:15 摘除脚本） | 摘除脚本「按内容取首个匹配」误删；`corrupt_entry_chain_triage.md` §5 记录的"2 处空行仍缺" |
| 3 | `HEAD:17171`（`TypedExprAddTypeFieldDeclInPlace` 前的**重复 `@borrows`**） | 1 行 / 9 字节 | kd_r36→kd_r38（07:55–08:00） | r36/r37 `duplicate @borrows on this declaration` 的修复动作，删掉重复注解；HEAD 至今仍带这个重复 |

**字节账**：1+1+9 = 11，观测 19 ⇒ 另有 **8 字节是"行数不变"的差异**（要么某行内容被改写，
要么剩余的空行在 r35 时带尾随空白）。**这三行与 ORC 误释放无因果关系**（两个空行 + 一个重复注解清理，
都不改变任何函数的所有权），列此仅为把账目闭合。补一条可判别的收尾读数见 §6 的 P4。

---

## 5. 归属判定

**(i) 探针事故 —— 具体是「应用」那一步，不是「摘除」的残余，也不是别的 lane 的在飞改动。**

可判别证据：

1. **补丁上下文行**证明插入点在 `@borrows` 与 `fn` 之间（§3.1），而补丁落盘时刻（07:42）
   恰在 `kd_r35`（07:34 烤）与 `kd_r36`（≈07:50 烤）之间。
2. **二进制**证明语义翻转就发生在这一刻：r35 = 借用（无 drop + 调用者传拷贝），r36 起 = 移交（drop + 调用者传局部槽），
   此后 11 个炉恒定（§3.2/§3.3）。
3. **驱动二分吻合**：父级用 `ordinary_zero_exit_fixture` 测出 `kd_r33/r34/r35` 全绿、`kd_r36` 起全红 —— 与本轮的代码证据同一分界。
4. **排除另一条 lane**：`(8)` 原地 append 的函数在 r35/r45 同尺寸、仅 8 字节重定位差异；
   窗口内**全部** 13885 个登记函数里只有 2 个尺寸变化 ——
   包装者（+24，= 本次根因）与 CSG 循环（r36 +316 后 r45 净 −8，且 +316 全额是 E1f 的探针调用点，
   kd_r45/r46 已无探针代码却仍崩 ⇒ 后者无辜）。
5. **排除「潜伏被新内容暴露」**：森林两轮 0 字节差异（父级已证），11 源最小复现同样触发 ⇒ 触发源在编译器自身。
6. **不是「摘除残余」的旁证**：摘除脚本按"首个内容匹配"删行，实际删掉的是文件里**第一个** `@borrows`
   （≈`:2008`，即 `typedExprManualConsumeAppendText` 的那条，已被还原）与**前两个**空行，
   而探针自己插入的 `@borrows`/空行留在了原地 —— 所以包装者的注解从未被摘除步骤还原；
   现状 `typed_expr.cheng:37368-37371` 只剩注释 + 空行 + `fn`。

---

## 6. 最小判别读数（**不要跑**，照此打点即可定案）

### 6.1 零语义改动的读数探针（首选）

沿用本仓既有形态（`compiler_csg.cheng` 的 `csg_mem`、`parser.cheng` 的 `ParserDebugStage`：
模块级 `var` + 一次性 `GetEnv` + 默认零输出）。

| 打点 | 位置 | 打印 | 判读 |
|---|---|---|---|
| P1 | `program_support_backend.cheng:6396`（`if header == nil:` 与 `:6397` 之间） | `Fmt"orc_miss ptr={p}"` | 崩溃地址 |
| P2 | `program_support_backend.cheng:6494`（`rcBefore` 算出后、`if rcBefore <= 0` 前） | `Fmt"orc_rel ptr={p} rc_before={rcBefore} size={cheng_mem_header_size_get(header)}"` | 找同址的**第一次**释放及其 rc |
| P3 | `compiler_csg.cheng:36032` 前一行 与 `:36042` 前一行 | `Fmt"p1_tree src={sourceIndex} tree={sourceTree}"` | 校验 miss 地址是否 = 该圈 `sourceTree`（或其池/arena） |

判读：同址出现两次且第一次 `rc_before=1` ⇒ 双释放成立；两条记录的**窗口归属**决定是谁：
两条都在 src=0 窗口 ⇒ 立即双释放（与现场矛盾，说明假设错）；第一条在 src=0、miss 在 src=1 ⇒ 延迟超释放，
再按 `size=` 区分树对象 / intern 池 / arena / str 列。建议只跑 11 源小复现（分钟级）。

### 6.2 归属判别实验（与 09:06 那次 `vis_swap` 同形；是否采纳为修复由调度方裁决）

- **E1**：在 `src/core/lang/typed_expr.cheng:37370`（现为空行）位置补回 `@borrows`，重烤。
  静态指纹预测：`orc_triage_callgraph.py <新kd> TypedExprBuildIndexAppendSourceCallDeclarationsManual`
  ⇒ **244 B / 1 个 BL**，且调用点回到"传拷贝"形态；运行期预期本判词消失、`forest_appended_lines > 1`。
  若指纹回 244 而判词仍在 ⇒ 另有同族伤口，转 P1–P3。
- **P4（闭合 §4 的 8 字节）**：用 `closure_census.py` 做假设检验（只改 `.rebuild/` 下副本）：
  把两个空行与 `@borrows` 视作已恢复，预测 649216 / **30955290**；
  与 r35 实测 30955298 差 8 字节 ⇒ 说明还有一处"行数不变"的内容差，可再定位（本轮未做）。

---

## 7. 未测项表

| # | 未测项 | 为什么没测 | 影响 / 风险 |
|---|---|---|---|
| 1 | 第二次释放的**发出者**（树对象 / intern pool / arena / 延迟 layer） | 需运行期读数；本轮禁编译禁烤机 | §3.4 是推断；归属不受影响，但"树 vs 池"决定修法边界 |
| 2 | `kd_r36` 那 +24 是否**只**等于「注解丢失」（而非同时改了形参表） | r35 源码快照不可得；但序言/主体逐字节相同、`@borrows` 上下文行在补丁里，指向注解 | 若 E1 指纹不是 244 B，需重判 |
| 3 | §4 那 8 字节的性质 | 需要 r35 逐文件字节 | 纯账目，与判词无关 |
| 4 | r46（HEAD visibility 形态）是否仍崩 | kd_r46 于 09:10 烤完，未跑门 | 预测：仍崩（包装者仍是 268 B/2 BL）；若反而变绿，(a) 的否证需重审 |
| 5 | 同族「按值接管 `parser.ParserValueExprTree` 却无 `@borrows`」的全量普查 | 只逐条核了 pass-1 窗口内的 S1b-0d 新函数 | 可能有第二处同类伤口 |
| 6 | 234 源大轮与 11 源小轮首次释放窗口是否同源 | 无运行期读数 | 影响 §3.4 的普适性 |

---

## 8. 输入无关 + seal 块逐项判定（第二轮补充：回答"是不是在飞 seal 改动"）

补充坐标（父级实测）：两行源 `fn main(): int32 = return 0` 在 `kd_r45` 上 `rc=1` 并打同一判词、在 `kd_r35` 上 `run_rc=0`；
带 `CHENG_CSG_MEM_TRACE=1` 时最后一条埋点是 `typed_context_lookup_built`
（取证件 `.rebuild/s1b_step3/r9/triv_trace.stderr.txt`；注意该 trace 里 `forest_appended src=0`、`ta_stream src=0` 均已打印
⇒ **这次崩溃在 seal 相，不在并林相**）。

### 8.1 `TypedExprTypeArenaSealInto` 的所有权语义（Q1）

`src/core/lang/typed_expr_type_arena.cheng:8882-8984`：

```
fn TypedExprTypeArenaSealInto(
        value: var TypedExprTypeArena,          # var 形参（按引用）
        state: var typedExprTypeArenaBuildState,
        pending: typedExprTypeArenaPendingGenericApply,   # 按值
        out: var TypedExprTypeArena,            # var out 形参
        err: var str): bool =
    …
    value.complete = true
    value.artifactRaw32 = typedExprTypeArenaHash(value)
    TypedExprTypeArenaStrictValidateInto(value, err) …
    typedExprTypeArenaRequirePinnedCapacity(value, state, "seal")
    out = value          # ← 唯一的"移交"语句：把句柄写进 out
    err = ""
    return true
```

- **不 consume / 不 release `value`**：全函数没有 `Release(value)`、没有 `value = nil`，只原地改 `value` 的字段。
- **`out = value` 是带 retain 的 share-store，不是位拷贝**：机器码层面 `SealInto`（12060 B）**全函数只有 1 次 `_cheng_mem_retain`**
  （偏移 +11500，位于尾部），另有 35 次 `_cheng_mem_release`（都是各局部临时量的作用域清理）。
  ⇒ 成功之后 `arenaValue` 与 `work.typeArena` 是**两个各自计数**的句柄，`work.typeArena` 不是白拿的别名。
- ⇒ 成功路径上"seal 已接管 + 调用方又释放同一份"**不成立**（Q2）：
  调用者 `compilerCsgBuildConsumeWithOverridesCoreInto` 在 `compiler_csg.cheng:39491-39496` 调用后
  只使用 `work.typeArena`（`:39533`、`:39538`、`:39545`），**从头到尾看不见 `arenaValue`**；
  `arenaValue` 是流式函数的局部量，其作用域清理只释放它自己那一次引用。

### 8.2 `ForwardNominalRequireDrainedInto`（Q3）

`typed_expr_type_arena.cheng:5436-5462`：第一形参 `forward: typedExprTypeArenaPendingForwardNominal` **按值（借用）**，
函数体只做形状校验 + `blockedFlags` 扫描 + 往 `err` 里写 Fmt，**不 consume、不 release**。
调用者失败路径（`compiler_csg.cheng:36166-36170`）只 `TypedExprTypeArenaRelease(arenaValue)` 一次然后 `return false`，
没有第二处释放。

### 8.3 与 r35（好驱动）的对照：seal 块**不是**新的（Q4）

用 line-map + BL 解码逐条比对 `ccsg.CompilerCsgStreamTypeArenaFromDeclarationIndexInto` 的全部直接调用：

| 目标 | kd_r35 | kd_r45 |
|---|---|---|
| `TypedExprTypeArenaSealInto` | ×1 | ×1 |
| `TypedExprTypeArenaForwardNominalRequireDrainedInto` | ×1 | ×1 |
| `TypedExprTypeArenaStrictValidateInto` | ×1 | ×1 |
| `TypedExprTypeArenaReleaseOwned` | ×2 | ×2 |
| `TypedExprTypeArenaRelease` | ×17 | ×17 |
| 全部 50 个不同目标 | — | **仅在编译盐符号名（alloc shim）上不同** |

且这些函数的**尺寸与机器码在 r35/r45 逐字节相同（只差重定位）**：
`SealInto` 12060/12060、`Release` 512/512、`ReleaseOwned` 156/156、`RequireDrained` 8944/8944、
`AppendSourceFromTreeInto` 6808/6808、`StrictValidateInto` 327460/327460。
⇒ seal 块相对 HEAD 确实是**未提交的在飞改动**，但它**在 kd_r35 烤制前就已落盘**
（否则 r35 的调用点里不会有它），因此**不可能解释 r35→r36 的回归**。

### 8.4 判定（Q5）：(i) 探针事故（应用阶段），不是 (ii) seal 改动

- 唯一语义差仍是 §3：包装者在 kd_r35 = 借用（244 B，无 drop；调用者传拷贝），
  kd_r36 起 = 移交（268 B，末尾 drop `manualTree`；调用者传局部槽）。它与父级的驱动二分（r35 ✅ / r36 ❌）同点。
- seal 块在 r35（好）与 r45（坏）**逐字节同码** ⇒ 单靠它不构成回归；
  它只是"**案发现场**"：多吃的这一次引用让某个 payload 提前归零，
  于是**下一次释放该 payload 的地方**（两行源 = seal 相；234 源 = 并林相 src=1）就报 `registry_miss`。
- 可直接解释"为什么相位会变"：`langintern.InternPoolRelease`（`src/core/lang/intern.cheng:676-690`）
  会 `seqs.freeSeqStrRelease(pool.texts)` **逐个释放 intern 池里的每个 `str`**，而这些 `str` 是 `share()` 进来的共享 payload
  （`:706-726 internPoolAppendUnique`）⇒ 任一处超释放都会让共享文本提前归零，
  之后第一个再释放它的持有者就报本判词，**持有者是谁取决于输入走到哪一相**。

---

## 附：本轮只读脚本

`orc_triage_map_pair.py`（尺寸变化函数） / `orc_triage_fn_bytes.py`（逐函数字节 + 噪声下限） /
`orc_triage_callgraph.py`（BL 调用图） / `orc_triage_hexdump.py`（指令字 + BL 目标） /
`orc_triage_callers.py`（谁调用了它） / `orc_triage_line_fp.py`（源码行指纹/转捩点） /
`orc_triage_map_diff*.py` / `orc_triage_bin_diff.py`，均在 `.rebuild/s1b_step3/r9/`。
