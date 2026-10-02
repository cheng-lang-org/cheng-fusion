# lsp cold-clean 收刀战线保全（2026-10-02，战略停刀点）

## 这是什么
cheng-fusion 复活战役的 lsp 改形刀：把 TREE lsp_entry 闭包修到 cold-driver（exact-authority 契约，50d1ffeeb 08-22 起）可编，出件 artifacts/cheng-lsp 让 fusion doctor 全绿。七棒推进 R0-R26，破 43 墙，未达全绿，于战略停刀点保全。

## 文件
- `closure-and-census.patch`：TREE 工作区 12 文件全量 diff（+732/−418）。含 zc_enumerate.sh 改绑（本战役 Track 4 交付，已另由 fusion 725b35b 配套）。**注意**：compiler_csg.cheng / compiler_parser_receipt.cheng 两文件混有他会在飞 hunk（csg 双 @borrows 等），非本线产物，还原时注意归属。
- `findings-tail-backup.md`：TREE findings.md 补录节备份（lsp 定谳+两账+覆盖事故注记；TREE 侧已 commit b11aac97e）。

## 战果账（七棒）
1. R0-R10（棒1+2）：:7778-7779 死链主修+str[] CloneStr 22 站+@borrows 31 fn
2. R11-R14（棒3）：+4 墙（@borrows/BytesTake/FixedBytes32Copy/let 提升）
3. R15（棒4）：+4 墙（drop-source/use-of-consumed/绑墙）
4. R16-R24（棒5）：+9 墙（ToJson 族/var 契约软化/add 共享 CFG_MERGE/memory-version 标量索引携带）
5. R25（棒6）：+1 墙（generic-parameter mutation，调用粒度+FixedBytes32Copy）
6. R26（棒7）：+10 墙 125 hunk（csg/receipt/snapshot_builder/typed_expr/parser/type_arena；setLen 族、share 消 move 族、解析族冷雷预修）
7. R26+（棒7 末）：余墙移出 tooling，入 src/core/lang/typed_expr.cheng

## 余墙与第一刀（已勘明）
`TypedExprIrAddAssignStatementFromExpr`（src/core/lang/typed_expr.cheng:65747，mutation-interval 族）：
- :65986-65988 `add(ir.originParserNodeStack, parser.ParserValueExprNodeSourceLocalIndexAt(...))` → 实参前置 let（r8 :26661 同款已验证）
- :66129-66130 `setLen(ir.originParserNodeStack, ir.originParserNodeStack.len - 1)` → len 前置 let（r7/r8 同款已验证）
其后深度未知（闭包=整个编译器+tooling，typed_expr/parser/type_arena 属 S 收口战役 hash 钉定热区）。

## 复现
```
cd ~/cheng-lang && git apply scratch路径/closure-and-census.patch
tools/compile_admission.sh build --budget-gib 1 --owner lspfix_rN --timeout-secs 5400 -- \
  artifacts/backend_driver/cheng system-link-exec --root:$PWD \
  --in:src/core/tooling/lsp_entry.cheng --emit:exe --target:arm64-apple-darwin \
  --out:/tmp/lspfix/out --report-out:/tmp/lspfix/report.txt
```
诊断仪器：CHENG_COLD_DUMP_VAR_FORWARD=1；日志各棒在 /tmp/lspfix_r2..r6/（易失）。

## 为何停刀
1. 墙链进入 src/core/lang/（parse/typed_expr/type_arena）——S 收口战役（二十一刀R 10b6e3a5b 同日改 parser 词法臂、二十二刀R 在滚、gen2_coverage bc7a5ca15 同窗提交）的 hash 钉定施工域；732 行未提交 hunk 悬在其热区有被 add -A 捎带/checkout 覆盖的活体风险。
2. **活体事故已发生**：本战役三条 findings 追加（22 行）未及 commit 即被并发 findings 提交覆盖灭失（git log -S 零命中），已全文补录 commit b11aac97e。
3. 工程量重定性：lsp 闭包=完整编译器闭包，"修 lsp"实为"整个编译器冷驱动干净化"——战役级决策，须与 S 收口线对表后再动。

## 持仓状态
- 10 个纯本线文件已回退 HEAD（本 patch 可一键还原）；compiler_csg/compiler_parser_receipt 两混合文件保留脏态（他线工作为主）。
- fusion 侧全绿项不受影响：重钉 44fcc32、enumerator 配套 725b35b 均已推送；doctor 仅 lsp 三项红。
