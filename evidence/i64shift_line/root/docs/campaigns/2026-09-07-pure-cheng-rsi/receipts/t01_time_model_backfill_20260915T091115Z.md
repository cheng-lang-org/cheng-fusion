# T01 时间模型件回填 M6/U8 更正 — 回执

- TASK=T01 时间模型件回填 M6/U8 更正
- STATUS=done
- UTC=20260915T091115Z
- 只写文件：`docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md`（`??` 未跟踪，本任务交付件，开工前记 sha256 基线）
- 依据：`docs/cheng-rsi-fusion-plan.md` §九 9.2 T01 行、§七 红线、附录 A.6（更正 A1 的 M6）；AGENTS.md 工程规范 10（本任务零源码改动，不涉补丁预检/金丝雀）。

## 0 前置自检（git status --porcelain -- 目标文件）

**判定：`??`（未跟踪）= 本任务自己的交付件，可写；无 M/A/D/MM/UU。**

```
$ git status --porcelain -- docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md
?? docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md
```

## 1 改前/改后 sha256

### 改前基线

```
$ shasum -a 256 docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md
85afce962612a47da30c20c4c351b3950b1cec4f445f5c6ae97de3b0655b3ad5  docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md
```

### 改后

```
$ shasum -a 256 docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md
2ca19679b69bdf859d741639fe4e01b278abccf81ba7377afab77d0c0dde52ab  docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md
```

### 改前副本校验（判据③ 的对照件）

改前副本由当前件按四处改动逐字反向还原得到，其 sha256 与改前基线**逐字节一致**（`85afce96…`），故等价于改前副本：

```
$ shasum -a 256 "$TMPD/before.md" docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md
85afce962612a47da30c20c4c351b3950b1cec4f445f5c6ae97de3b0655b3ad5  /var/folders/vc/ptdhhtns47xf27rf1j78t62w0000gn/T//t01_backfill.isP87E/before.md
2ca19679b69bdf859d741639fe4e01b278abccf81ba7377afab77d0c0dde52ab  docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md
```

（副本落在 `mktemp -d` 的任务级临时目录，随命令 `rm -rf` 立即删除；`[ -e "$TMPD" ]` 复核 = `removed`。）

## 2 判据原始输出（逐字粘贴）

### 判据① `rg -n 'after_frontier_expr_layer'`

```
$ rg -n 'after_frontier_expr_layer' docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md
311:> 【2026-09-15 勘误】M6 原文为「新增 stage \`after_frontier_expr_layer\`」。据 \`docs/cheng-rsi-fusion-plan.md\` 附录 A.6（读码实测）：生产路径上 typed/frontier 相调用点 \`:39015\` 之后 \`:39044\` 已有现成 \`after_typed_ir_expr_layer_rebuild\` 且在 stage allow-list 内，新增 stage 不必要；改用现成埋点对，零源码改动。
[rg rc=0]
```

只剩勘误说明行（1 行，且该行以 `> 【2026-09-15 勘误】` 开头）。

### 判据② `rg -c '2026-09-15 勘误'`

```
$ rg -c '2026-09-15 勘误' docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md
2
[rg rc=0]
```

`2 ≥ 2`。

### 判据③ `diff -u 改前副本 改后`

```
$ /usr/bin/diff -u "$TMPD/before.md" docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md
--- /var/folders/vc/ptdhhtns47xf27rf1j78t62w0000gn/T//t01_backfill.isP87E/before.md	2026-09-15 17:11:50
+++ docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md	2026-09-15 17:11:21
@@ -304,9 +304,11 @@
 | **M3** | C 链 parse 五段切分 | \`cheng_cold.c:103196/103354/103855/103885/104046\` 各记一次 \`cold_now_us()\`，输出 5 个 \`exec_phase_parse_*_us\` | 同上 | 137 s 落在 signature_import_closure / entry_parse / reachable_materialize / freeze 哪一段 |
 | **M4** | Cheng 深林窗内部三切 | ① \`compiler_csg.cheng:40143\` 前后；② pass1 循环内 \`forest_parse_begin pass=1\` 与 append 之间、append 与 \`ta_stream\` 之间各加时刻（现树两行背靠背无时刻） | 同 M1 | 现世代的 267,269 ms → 重读树 / 列追加 / 流式落地三份 |
 | **M5** | C 链三相闭合与残差 | (a) 上表 M3；(b) \`cheng_cold.c:103147\` 之前、\`:105925\` 之后各加一个时刻，输出 \`exec_phase_pre_us\` / \`exec_phase_tail_us\` | 同 M3 | 4,907,538 µs 残差归属；四项和 = elapsed 逐位闭合 |
-| **M6** | typed/frontier 相 wall（第三点修复的**唯一合法验收面**） | 新增 stage \`after_frontier_expr_layer\`（\`compiler_csg.cheng\` 的 stage allow-list \`:1960-2011\` 内注册） | 同 M1 | §5.3(a) 的双判据第二条 |
+| **M6** | typed/frontier 相 wall（第三点修复的**唯一合法验收面**） | 改用现成埋点对 \`after_profile_lookup\`→\`after_typed_ir_expr_layer_rebuild\`，零源码改动 | 同 M1 | §5.3(a) 的双判据第二条 |
 | **M7** | region 单项实测代价（替代 \`R\` 假设） | \`src/core/lang/parser.cheng\` region 循环内加**只读**计数器（同门控、默认零输出零副作用），输出 \`region_intern_calls=\` / \`region_intern_bytes=\` | 同 M1 | 直接给 \`c_r\`，不再依赖 §5.1-2 的同形假设 |
 | **M8** | C 链 codegen reloc/label 计数 | \`ColdCompileStats\`（\`cheng_cold.c:75457\` 一族）扩字段并在 \`:105937\` 块写出 | 同 M3 | §4.1 写侧项数缺口 |
+
+> 【2026-09-15 勘误】M6 原文为「新增 stage \`after_frontier_expr_layer\`」。据 \`docs/cheng-rsi-fusion-plan.md\` 附录 A.6（读码实测）：生产路径上 typed/frontier 相调用点 \`:39015\` 之后 \`:39044\` 已有现成 \`after_typed_ir_expr_layer_rebuild\` 且在 stage allow-list 内，新增 stage 不必要；改用现成埋点对，零源码改动。
 
 **建议但未定锚点的两处**：① \`ParserValueExprSourceText\`（\`parser.cheng:14250\`）之外的 \`Intern\` 站点是否还有同族循环（本轮只核了 \`AppendFromImpl\` 内的三处，实读 \`grep CloneStr|Intern\` 得 \`:10465/10712/11138/11854\`，其中 \`:10465\` 已有缓存）；② C 链词法器出口函数名（\`cold_parse_source\` 一族）未逐个核，故 M2 的函数锚点写"未钉"。
 
@@ -325,10 +327,12 @@
 | U5 | Cheng pass1（267,269 ms）内部分段 | 该段无时刻 | M4 |
 | U6 | 553,914 / 774,266 ms 的**原始件** | \`.rebuild/remap_exp/\` 已不存在（本轮 \`ls\` 确认）；只剩文档记录 \`VERIFY_fullgo_0910_append.md:805\`、\`pa_s1b_edit_plan.md:276\` | 只在文档级引用；作发布证据须重烤 |
 | U7 | 森林窗另两个候选埋点对（\`forest_build_start→末条 forest_appended\`、\`after_profile_source_payload_release→after_profile_lookup\`）在同世代的数值 | 只取到第 3 个（327,648 ms） | 同一轮回执即可读出（零成本） |
-| U8 | 现世代 typed/frontier 相 wall 的分段值 | 无埋点 | M6 |
+| U8 | 现世代 typed/frontier 相 wall 的分段值 | 埋点在码里存在，全部 gate 回执 0 次发射，可达性与 cheng-plan §6.2 验收线同源 | M6 |
 | U9 | \`B_eff\`（各相可选带宽）的独立实测 | 本文件只用同轮 emit 反算的 3.28 GB/s 作**参照**，未做独立带宽测量 | 一条 \`dd\`/\`memcpy\` 基准即可（但属新测量，本轮不做） |
 | U10 | region 站点的单项代价 \`c_r\` | 无 | M7 |
 
+> 【2026-09-15 勘误】U8 原文为「无埋点」。据 \`docs/cheng-rsi-fusion-plan.md\` 附录 A.6：埋点在码里已存在（\`after_typed_ir_expr_layer_rebuild\`，在 stage allow-list 内），只是全部 gate 回执 0 次发射、可达性未证——与「无埋点」的处置不同。
+
 ---
 
 ## §8 证据指针（只索引，不复制）
[diff rc=1]
```

（`diff rc=1` = 存在差异，非错误；差异恰为：M6 行更正 1 行、M6 勘误新增 1 行、U8 行更正 1 行、U8 勘误新增 1 行，另各 1 空行由 Markdown 段落分隔所需。）

## 3 动作对照（按命令级判据）

| # | 动作 | 结果 |
|---|---|---|
| 1 | `:307` M6「新增 stage after_frontier_expr_layer」→「改用现成埋点对 after_profile_lookup→after_typed_ir_expr_layer_rebuild，零源码改动」 | 已改（改后 :307） |
| 2 | `:328` U8「无埋点」→「埋点在码里存在，全部 gate 回执 0 次发射，可达性与 cheng-plan §6.2 验收线同源」 | 已改（改后 :328） |
| 3 | 两处加【2026-09-15 勘误】 | 已加，两条勘误行分别紧随 §6 表（:311）与 §7 表（:332） |
| 4 | 其余行一字不动 | diff 仅含上列四处，无其他改动 |

## 4 红线遵守

- 未 commit；未 `git checkout/restore`；未 heredoc；未 nohup；未编译；未联网；未占编译槽。
- 只改 `docs/campaigns/2026-08-31-kernel-userpath/design/time_model_structural.md`；新建本回执一件；临时对照件落在 `mktemp -d` 任务级目录并当场 `rm -rf`。
- 未动 `src/core/**`、`bootstrap/**`、`tools/memory_model_limits.sh`、`docs/cheng-rsi-fusion-plan.md`。本任务零源码改动，故不触发 AGENTS 规范 10 的补丁预检/金丝雀。

## 5 判据自评

- ① `rg -n 'after_frontier_expr_layer'` → 只剩勘误说明行 ✅
- ② `rg -c '2026-09-15 勘误'` = 2 ≥ 2 ✅
- ③ `diff -u 改前副本 改后` → 只含两处更正 + 两条勘误行 ✅
- MET=3/3
