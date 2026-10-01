# VERIFY_bootparse_census_append —— 自举解析覆盖普查线（纯只读）2026-09-05

锚点=当前树（含 wall152 在途 parser.cheng 编辑 valueIsConditional×4，13:34 版）。零编辑零烤机；唯一驱动调用=fp_D1 对 7 文件的单文件 --emit:obj 探测（输出/缓存全在 /tmp/oob_ab/bootparse/，未触碰 w152 缓存与主树）。

## 一、解析域（D1 管线真实解析面）

35 内核条目（/tmp/oob_ab/w139/kernel_manifest_head_git.cheng）经传递 import 展开 = **277 文件**（清单 /tmp/oob_ab/bootparse_closure_files.txt）：
src/core 212（backend 72 / tooling 48 / csg_core 33 / backend2 12 / ir 18 / runtime 12 / lang 8 / analysis 9）、src/std 40、src/tests 10、src/r2c 5、src/oracle 3、src/chain 2、src/libp2p 4、src/apps 1。
进 analysis/ 的通道实证=primary_object_plan.cheng:37 `import cheng/core/analysis/ownership_body_ir_production`；gate_main→r2c 链拉入 src/r2c、src/apps。总行数 733,200。D1（C 链）全绿=本清单全部 C 链可解析；普查问题=「C 链接受 ∧ .cheng parser 拒」。

## 二、形态对照表（扫描器 /tmp/oob_ab/bootparse_scan.py + scan2/3/4/5/6/7，计数 JSON=bootparse_scan_counts.json）

| 组 | 形态 | 解析域频次/文件 | .cheng 侧产线（parser.cheng） | C 链侧（cold_parser.c@HEAD） | 判定 |
|---|---|---|---|---|---|
| A | 基础语句头 fn/if/let/var/for/type/elif/else/const/while/defer/break/import/return/continue | 全域 | :5323 StatementHeadKeywordCodeRange 15 词全 | 同+case/of/discard 额外臂 | [双侧一致] |
| A′ | **value 位置跨行 if/elif/else**（`=` 行尾+同列 if 行） | **25 处/8 文件**：cleanup_cfg 10、ownership_body_ir_production 9、ownership_drop_ir 1、regalloc_riscv_adapter 1、merkle_admission 1、merkle_builder 1、core_types 1、compiler_csg 1 | fp_D1 实测 rc=2 `parser value expr: if expression else missing`（判词复现）；树内 wall152 valueIsConditional 修补待烤 | :80550 cold_parse_multiline_value_if_expr + :80607 parse_multiline_if_let_binding 显式支持全链 | **[.cheng 缺臂=第一墙（wall152 修中）]** |
| B | 语句级 if/elif/else 嵌套链 | elif 4099/138、else 2300/155、if 50050 | ownsBranchChainFollowers+ParseIfLike | :80462/:92648 elif 链 | [双侧一致] |
| C | for-range `..<` / 闭区间 `..` | `..<` 10126/218 + `bits..maxBits` 形数处（zlib_inflate） | :6169 ParserAppendRangeExprsLine（NormalizedExprRange 产线，`..<`/`..` 双形）+:4754 ParserParseRangeExpr | range 事实/节点同构 | [双侧一致]（PhaseB W3「range 无节点产线」已被后续轮次补齐；receipt 锚定闭环列为 D2 首烤观察点，见 W2） |
| D | while/break/continue/defer 套件 | while 1748/133、break/continue 4055/126、defer 158/32 | 语句头+:29567 deferStart 结构语句 | :93372/:93777 defer 臂 | [双侧一致] |
| E | 三元 `? :`（单行 587+/跨行 334 候选） | 72 文件 | :20810 Question 续行 + :20842 多行三元续支（spec 1.3.4，typed_expr:39517 实证形） | :45538 parser_question_matching_colon + cold_lower_question_expression | [双侧一致] |
| F | case/of/match、when、discard、block/try、of-继承 | **语句级 0**（case 词仅字符串 `"case"`/注释；when 词仅注释英文） | 语句头表无（:5323） | :93789 case 臂、:11317 implicit_inheritance | [仅 C 链内部形态，内核解析域不用→非墙]。PhaseB 移交的 case-else/when 缺口是 spec 完备性项，**不在 GEN2 阶梯关键路径** |
| G | 字符串：普通/转义 1693/Fmt 插值 6272/多行 Fmt\"\"\" 2/char 2975 | 62-79 文件 | :4919 ParserParseFmtExprAt（单行）+ :2124 MultilineString 重写通道 | cold_fmt_decode_interpolation + triple_quote 状态机 | [双侧一致]；多行 Fmt\"\"\" 仅 primary_object_emit:227、r2c_controller:5734 两处→W3 候选 |
| H | 字面值 hex/bin/float | 1667+302 | 词法层 | 词法层 | [双侧一致] |
| I | 类型：record 块 1167/ref object 48/object 7/alias 210/enum 139/tuple[ 25/ptr 484/array[N,T] 19/字段行 16468 | 206 文件有 type 块 | TypeSyntax 族+FieldDeclaration（phaseb_parser 线已修声明流） | :10776 parse_grouped_type_block | [双侧一致]（t_enum 已端到端全绿=enum-cold r10；obj_ctor/t_tuple 剩余墙在 CSG typed-node/typed_expr fact 层，不属 parser 阶梯） |
| J | 泛型：fn[T] 声明 12/引用 1795/Ok[T]/Err[T] 构造 3719 | 63 文件 | :6213 DedicatedNormalization（Ok/Err/Value/Error）+:6235 BuiltinPrimitiveConversion（int32() 等 11148 处）+SetNodeGenericRange | cold_bind_generic_type 族 | [双侧一致] |
| K | 跨行结构：悬挂逗号调用 46605/189、普通跨行值 6469/124、括号续行 3025/123 | 高频 | :20799 TokenContinuesLine（`=` `,` `.` `->` `(` `[` `{` `enum` `?` 续行）+ownsMultilineValue+ExtendIndentedValueRange | 冷链 token 流原生跨行 | [双侧一致]（第一墙即该机制漏掉 value-if 特化的缺臂，wall152 正补） |
| L | @importc 605/49 + `importc fn` 形 + @borrows 12167 | 广 | :35670 `importc fn ` 臂 + :24488 @importc 臂 | :10263 `importc fn ` 臂 | [双侧一致] |
| M | 裸 return 1536/sizeof 1415/命名实参 | 广 | 产线在 | 产线在 | [双侧一致] |

零使用形态（解析域全程未出现，无墙风险）：元组解构/并行赋值、lambda/`=>`、discard、`+=` 复合赋值、export、template/macro、{.pragma.}、`r"` 原始串（全部 `r"` 命中为 `\r`/`#r` 误报）、`1_000` 数字下划线、case-expr。

## 三、候选尾墙清单（频次×难度加权排序）

| # | 墙 | 内核解析域暴露面 | 确信度 | 状态 |
|---|---|---|---|---|
| W1 | value 位置跨行 if/elif/else 链吞并（ExtendIndentedValueRange 缺 valueIsConditional 臂） | 25 处/8 文件（analysis 3 文件、csg_core 2、backend/ir/tooling 各 1）——**机制单点修复全类消** | 高（实测 rc=2 复现） | wall152 已落树待烤 |
| W2 | receipt 对 range 节点的 identity 锚定（compiler_parser_receipt.cheng:8883 门；parserReceiptNormalizedExprIdentityNode 对 `..<` 行回填） | 10126 处/218 文件——若未闭环则是频次之王 | 低（ParserAppendRangeExprsLine 产线+AnnotateExprDelta 通道已在，判据=PhaseB W3 时无产线、现已有） | D2 首烤观察点 |
| W3 | 多行 Fmt\"\"\" 字符串与 fmt 单行扫描臂的交互 | 2 处/2 文件 | 低（multiline 重写通道在，未实证组合形） | D2 烤机观察点 |
| W4 | value 位置跨行 when | 0 处 | — | 无墙 |
| — | case-else/when 语句产线（PhaseB 移交） | 语句级 0 处 | — | 不挡 GEN2（spec 完备性项） |

## 四、阶梯长度估计

- 静态对照：277 文件/73 万行的语法形态全扫描未发现 W1 之外的高确信「.cheng 缺臂」——高频形态（K 组跨行结构、C 组 range、I 组 type 块、J 组泛型、E 组三元、L 组 FFI）双侧产线齐备。
- **估计 total 墙数=1–3，阶梯长度=1–3 墙**：W1 一墙为基准（wall152 修补烤绿即阶梯主墙破）；W2/W3 为两个低确信候选，若 D2 首烤判词落在 range 行或 primary_object_emit:227 附近则各加一墙（每墙≈1 次机制臂修复+1 轮 D2 烤机，参照 w153 实测单轮 ≈280s jobs=8）。
- 保留项：D2 逐文件首个失败即停，静态对照不能覆盖「未预见的组合形」；但形态空间已按 parser 语法类穷举（扫描器 7 轮、60+ 形态组），第三类缺臂形态存在概率低。

## 五、实测记录（唯一驱动调用，/tmp/oob_ab/bootparse/）

- fp_D1（11:56 烤，不含 wall152 修补）单文件 --emit:obj（timeout 120s）：ownership_body_ir_production.cheng **rc=2** 判词 `compiler csg: normalized decl read failed: …: parser value expr: if expression else missing statement`（第一墙复现，与 w152 卷宗一致）；其余 6 文件 rc=124=超时（单文件实为闭包编译，秒级假设不成立，无判词信息，不作绿/红依据）。
- 当前树 parser.cheng 已含 valueIsConditional（4 处，13:34 编辑）→ 修补未丢，待 w152 烤机验证。

## 六、交付物

- 本文件；扫描器 /tmp/oob_ab/bootparse_scan{,2,3,4,5,6,7}.py；计数 bootparse_scan_counts.json；闭包清单 bootparse_closure_files.txt / bootparse_closure_core.txt；实测日志 /tmp/oob_ab/bootparse/log_*.txt。
- 双侧 parser 副本：/tmp/oob_ab/cold_parser_head.c（HEAD 版 cold_parser.c，96,087 行）；.cheng 侧行号均指当前树 src/core/lang/parser.cheng（38,428 行）。
