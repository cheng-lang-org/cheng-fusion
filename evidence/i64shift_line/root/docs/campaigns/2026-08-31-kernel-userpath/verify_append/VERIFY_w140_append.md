# VERIFY_w140_append.md —— kernel_driver_w2 战役 wall140 线

日期：2026-09-04。工作目录=仓库根。目标：修 cold_nested_fmt_interpolation_smoke.cheng 的运行时字符串语义墙（收官最后一层）。

## 判定

**cold_nested 收官。** 接手态 compile=0 / run=0 判词 `=fail`（wall138 移交）；本线结束态（r2）compile=0 / **run=0 且 stdout=`cold_nested_fmt_interpolation=pass`**。烤机预算 3 轮，用 2 轮（r1 修法验证·半，r2 收官）。

## 根因（一层，证据闭环）

**结构化 Fmt 构建器（typed_expr.cheng typedExprIrBuildValueExprNodeCallFmtActive）对嵌套 Fmt 的转义定界符 `\"` 不感知。** 嵌套 Fmt 位于外层插值洞内时，其定界符是转义形 `Fmt\"…\"`；该构建器一律按 `+4/-1` 剥壳，把开引号 `"` 收进首段、闭 `\` 留在尾段：

- 字面量池取证（wall138 r4 exe，`0x100098000`）：`outer= | "inner= | - | \ | asset | outer=inner=asset-7`。inner 首段 `"inner=`（7B）、尾段 `\`（1B）→ actual=`outer="inner=asset-7\`（20B）≠ 期望 19B → main 内联双槽字节比较（len+bytes，反汇编核对为正确形）判假 → `=fail`。
- 修面对齐 parser 词法权威 `ParserValueExprParseFmtInterpolations`（parser.cheng:19521「洞解码流嵌套 `Fmt\"...\"`」同族同判：开侧 `Fmt\"` 起游标 +5，闭侧剥 `\"` 两字节）。修后 r2 字面量池：`outer= | inner= | - | asset | outer=inner=asset-7`，字节级干净。
- 车头对拍：w126 编同夹具 `=pass`；w126 探针（echo(actual)）actual=`outer=inner=asset-7`，与 r2 语义一致。

### r1 中间态（烤机发现第二处缺陷并即修）

首修只动了开侧可见、尾段 `\` 仍在：原函数尾部遗留 `let contentEnd = fmtEnd - 1` **遮蔽**了顶部转义感知的 `var contentEnd`（Cheng 接受 shadow，编译烤机照过）。r2 删遮蔽行后收官。教训：同函数同名变量剥壳值必须单点定义。

## 修面（src/core/lang/typed_expr.cheng，[wall140] 标记）

- 授权面说明：运行时 fmt/str 桥（program_support_backend.cheng join/seq_add/store_slot 全链逐行核对无错）。定性证明修面在编译侧 Fmt 插值切分（非装箱/参数序，属同族最小触碰），加 [wall140] 标记；并行 wall139（cleanup_cfg 域）零交集，同文件他人 hunks 原样保留。
- 开侧：`source[fmtStart+3]` 精确判 `"`/`\"` 两种合法形，其余 panic（fail-closed）。
- 闭侧：`ParserQuoteIsEscaped(source, fmtEnd-1)` 反斜杠 run 奇偶判转义形，剥 1 或 2 字节；plain 尾带 `\\` 双写不受误伤（run=2 偶数）。
- 无启发式、无兜底、守卫零弱化。

## 门禁表（cwd=仓库根；r=wall140_r2，基线=wall138 r4 进场复测）

| 门 | 基线（r4_enter） | r2 | 车头 cheng_w126 |
|---|---|---|---|
| cold_nested_fmt_interpolation_smoke | c0/r0 `=fail` | **c0/r0 `=pass`（收官）** | c0/r0 `=pass` ✓ |
| ordinary_zero_exit_fixture | c0/r0 | c0/r0 ✓ | c0/r0 ✓ |
| call_fixture | c0/r1 | c0/r1 ✓ | c0/r1 ✓ |
| zz_v6_w7（wall139 领地，只记录） | c1（cleanup_cfg，重试租约未完格） | c1 `cleanup_cfg: captured-old release authority mismatch` | c0/r0 |

- w126 车头四夹具全绿；r2 与车头在 cold_nested 判词一致。

## 烤机记录（head 三件套，w138 重建配方原样移植，车头 cheng_w126）

| 轮 | sha256 | size | 结果 |
|---|---|---|---|
| r1 | c27f08be318329c98b260ba147759175f2ed777b47054487b2dc890d412a2b64 | 186302448 | 开侧生效（池首段 `"inner=`→`inner=`），尾段 `\` 因遮蔽仍在，判词仍 fail |
| r2 | 40a6fafceadee1c77cf6b33879bc1dd00b2537509761456ff51bbd2960e3c569 | 186302448 | **池干净，判词 =pass，门禁全绿** |

## diff 统计（/tmp/oob_ab/wall140.patch，仅本线两段 hunk，reverse-check PASS）

- src/core/lang/typed_expr.cheng：+21/-2（转义定界剥壳 + 尾段遮蔽删除，均在 typedExprIrBuildValueExprNodeCallFmtActive 内）
- `git apply --reverse --check` PASS；文件内他人 hunks（borrowsArguments 系等）未触碰、不在 patch 内。

## 移交事项

1. **休眠缺陷（本线定性发现，未修）**：regalloc_aarch64_adapter.cheng:1549-1554 `regallocA64AppendStrEqLiteral` 字节循环两条 load 基址均为 X17（字面量数据）：`ldrb X16,[X17]` 应为 `ldrb X16,[X8]`（X8=str 数据，已随循环步进）。现形=字面量自比，长度相等即虚真（字节永不比较）。x86_64 同族（x64BodyFillStrEqLiteralOp，RCX=str/RSI=literal）正确。cold_nested 不走此臂（其比较经 fill 直发臂，反汇编核对正确）；但 action-recipe 形态的 `str == "字面量"` 夹具在此臂下会虚真/虚假。建议下一墙线带失败夹具修 + 门禁。
2. 探针域雷：`echo(nestedFmt(...))` 形探针在 r2 下 compile=1 `typed expr: statement/call-node intrinsic identity drift`（与 wall138 移交的 cold_fmt_var_scalar_ref_smoke compile=1 同族既有域雷，非本线引入）。探针产物全在 /tmp/oob_ab/w140/；src/tests 临时夹具已用后即删（零残留复核）。
3. zz_v6_w7 在 r2 下 c1 `cleanup_cfg: captured-old release authority mismatch`——wall139 领地现状记录，供其线自取。
4. 本线未 commit、未开分支；树上多线累积资产原样保留。
