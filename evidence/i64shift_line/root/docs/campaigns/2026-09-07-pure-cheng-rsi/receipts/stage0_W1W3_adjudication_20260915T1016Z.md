# STAGE0-W1 / STAGE0-W3 Leader 裁定（2026-09-15T10:16Z，绑 HEAD 60e37f0e）

## W1「manual consume function identity drift」——裁决：已根修，段 1 只做端到端验证
- 复核：patch `stage0_W1_20260915T101528Z.patch` sha24 `a9fb4128d4ea577b511d72df`，与 `.rebuild/r5_line/r5_receipt_backtick_namespan.patch` 逐字节同；`git apply --check` 对现树 **rc=1**、对 `2a049ccd3^` 副本 rc=0；`git merge-base --is-ancestor 2a049ccd3 HEAD` rc=0；预检 `ann=0 displaced=0 wedged=0` PASS rc=0；numstat 73/2 仅 `compiler_parser_receipt.cheng`；两件 fixtures 在位。
- 结论：**W1 根因已由 HEAD `2a049ccd3` 根修**（`parserReceiptDeclarationNameSpanResolveInto` 反引号内层投影 + `BuildMappedInto:3289` + strict-validate:6238 双接线）。ledger 仍记「在」仅因 7 枚驱动全部烤成于该提交之前。
- **该 patch 不进段 1 叠补丁集**（已落地）；段 1 只需在含 `2a049ccd3` 的新驱动上跑 c1/c5 端到端。
- 未打补丁的**潜在缺陷**（新墙候选）：`receipt:3692/3695` 把 producer-local 行与 out sidecar 行直接比，稳妥应比 `out.declarationSourceLocalRows[exactFunctionDeclarationRow]`。
- 新墙：`receipt:7377 pattern TypeSyntax owner/span invalid`；`compiler_snapshot_builder.cheng:15803-15821` owner-token；`compiler_csg` structured-scope/FieldGet。

## W3「producer lacks exact type or ownership proof」——候选 patch 接受
- 复核：patch sha16 `5335941eec9b935b`，`git apply --check` fwd=0 / `-R`=1，numstat 9/0 **仅** `typed_expr.cheng`，预检 `ann=0 displaced=0 wedged=0` PASS rc=0；`typed_expr.cheng` 现树 sha `a6fee828…` = 基线（零树改）。
- 判点复核：`typed_expr.cheng:6097` panic，死因子句 `:6085 exactTypeId < 0`；producer `TypedExprIrAddDesugaredLeafNode` 写 `resultStructuralTypeId=-1` 后从不 bind；触发 = **无初值标量局部**且类型≠int32（c3 `var total: int64`），与 range/int64() 无关（locals 相位 :62400 先于 :62402）。
- 接受为段 1 候选；**零编译未验**。残余：`EmptySeqInit` :30066 仍不绑；`int64()/range` 补后是否位移未验；守卫 :6083-6096 未放宽。
