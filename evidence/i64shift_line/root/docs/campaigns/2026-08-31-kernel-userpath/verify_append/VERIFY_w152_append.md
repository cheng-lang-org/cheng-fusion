# VERIFY wall152（kernel_driver_w2 战役 wall152 线 · GEN2 自举固定点阶梯第一墙）

锚点=69817b8b2+检查点 73debaef2。树上多线在途 hunks 原样保留，本墙仅动 src/core/lang/parser.cheng。

## 墙形定性

D2（D1 自举重编同树）rc=2：`compiler csg: normalized decl read failed: src/core/analysis/ownership_body_ir_production.cheng: parser value expr: if expression else missing statement_offset=14919 statement_offset=12418`。

- offset 14919 = `let diagFactKind =`（359 行），offset 12418 = 包裹它的 fn 声明起点（310 行）。同形共 9 处（diagShapeValid/diagFactKind/diagFactScalar/diagFactChild/diagFactFixed/diagFactSize/diagFactAlign/dropGlueSymbol/retainGlueSymbol）。
- 墙形：**let/var/const value 位置跨行 if 表达式，elif/else 行与 value 的 `if` 关键字同缩进**：
  ```
  let diagFactKind =
      if typeFactRow >= 0: bodyIR.typeFactStructuralKinds[typeFactRow]
      else: -1
  ```
- 缺口机制（.cheng parser 语句切分臂）：`=` 是续行 token，let 逻辑行吞入 if 行；if 行尾 `]` 不是续行 token，逻辑行止。`ParserValueExprExtendIndentedValueRange` 中 `ownsMultilineValue=true`（value 头是 if）但行尾非 `:`/`=` 时走 `ownsIndentedBody && !swallowsIndentedBody && !ownsBranchChainFollowers → return lineLimit` 提前返回，与 value 头同列的 `else:` 行没并入语句范围、落单成独立语句，if-like 解析窗口内无 else → `if expression else missing`。**非 ParseIfLike 本身的问题**（单行 `if ...: 1 else: 0` 全绿佐证）。
- C 链对照：cold_parser.c `parse_let_binding` 在 `=` 后经 `parse_multiline_if_let_binding` 跳白跨行找 `if`，`cold_emit_multiline_value_if` 以 if 缩进解析整条 elif/else 链——该形 C 链显式支持，同输入全绿。kind 分裂类缺口（与 enum-cold 线「C 链无条件豁免 vs .cheng 前置谓词」家族同风向，方向相反：C 链收、.cheng 拒）。
- spec 裁决（docs/cheng-formal-spec.md:488）：`ifExpr ::= "if" expression ":" expression { "elif" ... } "else" ":" expression`——else 是 ifExpr 必备分支，跨行属合法形。**裁决：合法形，修 .cheng parser 侧**。

## 修补（src/core/lang/parser.cheng，+23/-3）

`ParserValueExprExtendIndentedValueRange`：
1. 新增 `valueIsConditional`：ownsMultilineValue 且 value 头 token 是 If/When（语句头 if/when 已由 ownsBranchChainFollowers 覆盖，显式互斥）。
2. 提前返回条件加 `&& !valueIsConditional`——value 条件表达式不再漏吞分支链。
3. 分支链吞并循环 header 列泛化：valueIsConditional 取 value 头列（非语句头列），循环体与 ownsBranchChainFollowers 原逻辑同构（同列 elif/else 逐行吞、else 体缩进套件由递归 ExtendIndentedValueRange 原样吞并、else 后 break）。

fail-closed 论证：
- 非法形（双 else 等）落入 value 窗口后由 `ParseExactRoot` 的 `expression event trailing token` 硬错误拒绝，无静默吞并。
- 负例保真：value 非条件表达式（普通表达式/调用）行为零变化；语句头 if/when/elif 路径（branchChainHeader=tokenStart）与原 ownsBranchChainFollowers 完全一致；同列 elif/else 在规范上唯一属于其 if/when 链，无误吞歧义。
- 新代码写法（跨行三元 `? :`）有 spec 1.3.4 + typed_expr.cheng:39517 实证形，D1 旧 parser 可解析（自举蛋鸡安全）。

patch=/tmp/oob_ab/wall152.patch（git apply --reverse --check PASS）。

## 阶梯台账

| 墙 | 改动 | D2 烤机 | 判词 |
|---|---|---|---|
| 1 | parser.cheng ExtendIndentedValueRange value 条件链吞并 | （进行中） | — |

## 烤机配方

head 三件套：`/tmp/oob_ab/w139/build_kernel_driver_w139.sh --manifest /tmp/oob_ab/w139/kernel_manifest_head_git.cheng --out /tmp/oob_ab/w152/fp_D2 --driver /tmp/oob_ab/fp_D1`，env `CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w152/cold_cache CHENG_ENTRY_CACHE=0`。烤前 cheng_tree_quiesce_probe src/core 10 分钟窗 GREEN（quietForSeconds≈1769s，最新改动即本线 parser.cheng 编辑）。

## GEN2 判定

（待烤机）
