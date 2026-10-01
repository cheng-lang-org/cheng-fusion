# slab 役刀 1 — lex 续行诊断轮留证（零烤部分）

日期：2026-09-19。锚 HEAD `e2ff96144`。线：`.rebuild/slabk1_line/`。
工具：`static_replay.py`（逐算法移植 parser.cheng e2ff96144：LexSpan 主环
:15300 / LogicalLineEnd :22373 / ExtendIndentedValueRange :27291 /
TypeDeclarationHeaderEnd :22460 / IndentedSuiteEnd :22477 /
ExtendRoutineHeaderReturnType :27410 / ExtendRoutineSuiteRange :27534 /
ExtendBindingEntryFormB :25213 / produce 环迭代结构 :28019-28515 /
多行字符串源文重写 :2268-2477）+ `closure_list.py`（静态 import 闭包）。

## 判据

SLAB_DESIGN §3.1 段界 = produce 环静息点（块闭包判定后、分派前的观察位；
无开启 type/routine/binding 块；注解组闭合——`@` 行 pendingAnnotationCount
== 0 开新组，携带注解的目标行不入新段界）。普查问题：段界是否切在 lex
续行组/多行构造中间；段切片回放的静息结构与整源是否逐段一致。

## 结果

- 全语料（src/**，5802 文件，剔除 .orig/.tmp-exec）：可回放 5786，
  construct_hits=0，same_line_boundaries=0，ann_line_with_decl=0。
- 编译器闭包（静态 import 传递闭包 = 恰 234 文件，与门轮 234 源一致，
  `closure_files.txt`）：**234/234 回放零错**，段界总数 20805，
  max_seg_bytes=466261，med_seg_bytes=402。
- **lex 续行构造命中 = 0**：无任何段界落在字符串/字符/Fmt 字面量或块注释
  字节域内。本 lexer 无多行 token（LexQuoted 拒换行；多行字符串经
  ParserRewriteMultilineStringSourceText 塌缩为单行转义串后 lex，行数保持），
  段界 = token 起点恒在构造外——结构性结论 + 全语料实证双保险。
- **段切片回放恒等 = 234/234**：每段独立重放的静息点结构 == 整源回放
  在该段的子集；每段首语句消费终点一致（replay_file 内机械核对）。
- 同物理行段界 = 0（每段起点均在新鲜物理行，行/列基计算路径单一）。
- 注解行带同线声明关键字 = 0（注解携带规则无需退化分支）。

## 不可回放的 16 文件（与闭包交集 = 空）

41→16 报错全部收敛于两类：① 现行源码严格校验会拒的形（多行字符串体
缩进浅于闭标——mobile_shell_codegen.cheng 用 tab 体，现行 :2392-2394 检查
会拒；`"""` 行中闭标——parser_ffi_handle_contract_smoke 等 6 测试件），
冻结 stage3 是旧宽版所以单件编译能过，不代表现行语义；② 负例/坏件
（error_recovery_stress、compiler_diagnostic_failure_malformed_fixture、
test_debug_*、_oob_neg_fmt 等）。`comm -12` 交集输出为空
（`closure_files.txt` × 16 清单）。

## 结论

**无命中 → 留证，设计不回炉**（SLAB_DESIGN 置信度节预置的两条路走
「留证」支）。段界规则（produce 静息点 + 注解携带）在全闭包上不切任何
lex 续行组/多行构造；刀 1 in-compiler 对拍轮（diag_gate.sh）为机械终证。
