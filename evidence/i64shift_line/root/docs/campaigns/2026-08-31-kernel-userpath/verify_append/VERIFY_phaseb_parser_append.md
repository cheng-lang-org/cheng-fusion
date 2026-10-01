# VERIFY_phaseb_parser_append.md —— PhaseB-parser 线（类型语法 owner 边结构重构）2026-09-05

锚点 commit=69817b8b2（四夹具 4/4 全绿）。车头=cheng_w126（w139 head 三件套），环境 CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/phaseb_parser/cold_cache CHENG_ENTRY_CACHE=0。全程无 git commit、无分支；并行线（wall150/PhaseC-W5）领地零触碰，gate 全部串行直跑+租约退避。

## 一、根修判定

### 移交缺口的完整定性（比移交原文深三层）

PhaseB-A 移交定性「inline 类型元素无声明行可绑」正确，本轮逐层实证并推进四层：

**第 0 层（架构勘误）**：parser 声明行域是稠密追加序（`ParserValueExprAppendDeclaration: sourceLocalRow = row`），不是物理行——同一物理行可容纳多条声明。因此「合成声明行」不存在行域障碍，object 缩进字段机制可被 inline 元素精确同构复用。PhaseB-A r3 的「object 同挂」对照实验成立且与本线 r2 复现一致：入口 object/tuple 命名构造同挂 `unknown object constructor field`，是同一通道缺口，非 tuple 特有、也非 r3 登记臂顺序污染。

**第 1 层（parser 声明流，已修）**：`type N = tuple[a: T, ...]` 的具名元素此前无 ParserDeclarationField 行、无 FieldDeclaration TypeSyntax root。修复=parser 产出 FieldDeclaration root（元素类型 span 重解析为独立 root，declarationOwner 精确指回 alias 包裹 tuple 的声明根，generic 符号按 owner 口径继承）+ ParserDeclarationField 声明行（owner=类型声明行、scope=该类型 Type 词法域，FinalizeTypeDeclarationLexicalScope 同 object body 口径）；`ParserValueExprTypeSyntaxDeclarationOwnerEdgeValid` 精确放宽至「单子且子为 Tuple 的别名声明根」（普通类型别名仍不得拥有字段声明）。

**第 2 层（坐标绑定链配套，已修）**：
- compiler_parser_receipt：`parserCanonicalSourceSidecarTypeSyntaxOwnerKindValid` 同口径 alias-wraps-tuple 臂（sidecar 投影 sealed 校验）。
- typed_expr ctx：`TypedExprContextAddInlineTupleTypeFields`——两处 ctx 构建循环（Borrowed/profile）的 inline 头与缩进式声明行均登记 ctx.typeFields（含 SABI 边界门，与 object 字段同口径；无名元素不登记）。r3/r9 诊断实证 `bind_exact source=0 types=1 fields=2` 通过——compiler csg exact-layout 绑定链对 inline 元素全通。
- typed_expr_type_arena：`typedExprTypeArenaBuildTupleAliasMembers`（alias(Tuple) 声明根的 symbol member 行构建，与 object member 同一精确边契约，消除 `non-object declaration owns fields` 拒收）+ origin/member 两处 owner 校验镜像的同口径 alias 臂。

**第 3 层（分类与节点证明，已修）**：
- ctx 级核对 `TypedExprNamedAggregateFieldExistsInOwner`：新增投影感知精确直查臂（owner ctx 自身已绑定坐标列按 (ownerType, fieldName) 配对，冻结 ctx 经 typedExprContextFieldAt 读投影列）——r9 实证 `producer=0 ordinal=0/1` 全通。
- IR 级核对 `TypedExprBindingRhsIsAggregateConstructor`：IR 字段行由 `TypedExprIrAppendObjectTypeLayoutFromContext` 直走臂发布（build-index 通道无 ctx_field 节点时按 ctx.typeFields 精确坐标列直走；ref-object owner 保 W-F 权威尺寸口径；已工作形状零改动）。
- 节点类：`TypedExprIrResolveStructuralCallAuthority` typeOwner 分支不再硬编 Owned，改同一 `TypedExprIrExprClassForResultTypeExact` exact 推导（托管→Owned/非托管→Unmanaged/不可判→Unknown），消除入口 POD 聚合构造的 expr class drift。
- value definition：`TypedExprIrAppendValueDefinitionsForBindingInitializer` 为聚合构造占位 CallExpr 按本源声明行 TypeSyntax root 从 exact TypeArena 绑定 TypeId+Send/Sync/ProofKind（非唯一命中保持 -1 fail-closed）。

**剩余墙（第 5 层，未破，移交）**：t_tuple 现挂 `compiler csg: typed-node resolved call missing node=4`（compiler_csg.cheng:34303）——CSG typed-node 审计的 CallExpr 分派只有 Builtin（builtin 校验）与 declaration row（普通调用）两类别，聚合构造占位节点（callDeclarationIndex=-1、callTarget=本源声明类型叶、TypeId/proof 已绑定）无审计类别。需在 compiler_csg typed-node 审计新增聚合构造占位类别（复用节点已绑定的 structuralTypeId/proof 做核对），属 compiler_csg 契约层扩展，超出 parser 线「坐标绑定链最小触碰」授权面，按纪律停手移交。obj_ctor 对照挂 `typed expr: named aggregate constructor drift`（typed_expr.cheng:12262，fact 级 surface/expr 对账），同为后续层新门。

## 二、验收门禁表（r15 驱动终态，全部实测）

| 件 | 合同 | 实测 | 判定 |
|---|---|---|---|
| t_tuple | compile=0 run=0 + `t_tuple=pass` | compile=2，判词 `compiler csg: typed-node resolved call missing node=4`（较移交墙推进 4 层：parser 声明行✓→坐标绑定✓→分类✓→节点类✓→value-def proof✓→CSG typed-node 审计✗） | 红（剩余墙已定位移交） |
| obj_ctor（object 同形对照，src/tests/zz_phaseb_parser_obj_ctor.cheng 未跟踪新件） | 同形同绿判据 | compile=2，判词 `typed expr: named aggregate constructor drift`（typed_expr:12262，fact 对账层；已越过 unknown object constructor field 墙） | 红（同通道后续层，与 t_tuple 分叉点已定位） |
| ordinary | 0/0 | compile=0 run=0 | PASS |
| call_fixture | 0/1 | compile=0 run=1 | PASS |
| cold_nested | 0/0 + pass 判词 | compile=0 run=0，stdout `cold_nested_fmt_interpolation=pass` | PASS |
| v6 | 0/0 | compile=0 run=0 | PASS |
| t_enum（PhaseB-A 臂） | 维持现状即红 | compile=2，判词 `csg compiler snapshot: type trait premises are not exact`（compiler_snapshot_schema.cheng:5847） | 红（判词较 PhaseB-A 墙4「production Type authority missing stage=3」有变化，见移交 3） |

## 三、烤机台账（r1–r15，超预算说明见移交 5）

| 轮 | 内容 | size | sha256 |
|---|---|---|---|
| r1 | parser owner 边+声明行+receipt 校验臂+ctx 登记臂+arena member 臂 | 186600000 | ad221d7ad2ab8b2daa6889df33900023e8ebe5ff0c5073c7b8e7cf8a63e52667 |
| r2 | receipt 校验器 childStart 越界域修正 | 186600000 | dc0fadd62b1901055acee80a4127d6e043f7465bc542240e88fb5f767195835f |
| r3 | 诊断轮（探针：ctx_add/bind_exact/field_exists）→ 定位 ctx 坐标已绑、断点在分类/发布层 | 186764320 | （日志 /tmp/oob_ab/phaseb_parser/bake_r3.log） |
| r4 | IR 发布直走臂 + ir_field_miss 探针 → 实证挂点 51059 静默分支 | 186747904 | dce9bf9226ded8a4c114a2c42ef7f3eb6a300e37db84e8732c217256a0f0b18f |
| r5 | 分类层投影感知直查臂 → 越过 unknown object constructor field，新墙 arena owner authority | 186764320 | bf555214a6fa72ef14253bf94ddd6aa6577a2bae0471aa85fdc253df78978ec9 |
| r6 | arena realize 镜像 owner 臂 → 新墙 immediate owner drift | 186764320 | 6ed199599e2879ae724256667ab439c505edf48ffff581e08a7eff809052bc16 |
| r7 | arena origin 镜像 owner 臂 → 新墙 non-aggregate owns members | 186764320 | d7c7b64fa49bf618ac69b5edb4f16263b884ab42482b7931db0e06e035e7bb6e |
| r8 | arena member 校验 alias 臂 → 越过全部 arena 墙，新墙 expr class drift | 186780736 | ce11224bbb3e54d428f598c3d1b41f8f7b1569f31ee0a647699f79bf0aa2ea9f |
| r9 | 诊断轮（ctor_class/drift_probe）→ 定位 drift 为 typeOwner 分支硬编 Owned | 186797152 | 8d037dad8ac65fdd7d24fe3357996e5e78e89c6b3cd1ce6a4b17fdd721c83a6a |
| r10 | 类推导修复（洁净轮，探针已拆） → 新墙 value-def proof 缺失 | 186764320 | c025f6b39dd5736a303b545e6dd6fa0f5743a71509c3284ce94a8b2296491eb1 |
| r11 | value-def TypeId 绑定臂首版（闭包门拦下 arenamod 误用，未出驱动） | — | — |
| r12 | 修正 op 列直读 → 越过 proof 缺失，新墙 CSG proof drift（trait flags） | 186780736 | ab9175a0988d247530e745a001d10a1722a1b49b85a5df643b05a4979de89eef |
| r13 | 补 Send/Sync 列 → 新墙 proof=None+send=1 矛盾（proofKind 列未随绑） | 186780736 | 9830eb03acac41e10f5d1f5bd17357b035b5fc318710c3fa2d399aeb3498dc92 |
| r14 | proofKind 列补绑（闭包门拦下 typearena 前缀误用，未出驱动） | — | — |
| r15 | 收官驱动（探针全拆，洁净源） | 186780736 | 3230a703e9d160143ba43a652bcabcadd1487504ec6fe2166b651f30fcdafa6b |

源文件 sha256 前 16（终态）：见 patch 本体。秒级门：parser/type_arena/receipt/compiler_csg 单文件 `--emit:obj` 全 rc=0；typed_expr.cheng 单文件入口形态 rc=2 `managed element field read lacks exact array root`（PhaseB-A 已 stash 对照实证的 C 车头预存限制，非本线引入），闭包级秒级门（backend_driver_dispatch_min --emit:obj）每轮 rc=0。

## 四、t_match case-else 定性（异根，未动代码）

- 现象：`case c`（colonless，规范 caseStmt ::= "case" expression [":"] ... 合法形）下 `else:` 分支行挂 `PARSER_BRANCH_WITHOUT_IF`。
- 根因：`ParserValueExprExtendIndentedValueRange` 早退分支——colonless case 头使 `swallowsIndentedBody=false`（`ownsMultilineValue=false` 故 `colonlessCase=false`）→ `ownsIndentedBody && !swallowsIndentedBody && !ownsBranchChainFollowers → return lineLimit` 提前返回，其后的 case 分支链吞并块（同列 `of`/`else` + 深缩进体）不可达；`else:` 行落单成独立语句范围 → 分类器 arm -3 硬门禁。
- 异根判定：与字段坐标绑定链无关（语句范围吞并子系统）；且 t_match 依赖 enum 特征，修掉 parse 墙后仍止步于 snapshot 契约墙。修法建议：早退条件排除 `headerKind == ParserValueTokenCase`，使 colonless case 落入既有分支链吞并块（owner=case/match 语句领地）。

## 五、移交事项（按优先序）

1. [契约] CSG typed-node 审计新增聚合构造占位类别：compiler_csg.cheng:34290-34315 的 CallExpr 分派（Builtin/declaration row 两类）之外，第三类「聚合构造占位」（特征：callDeclarationIndex=-1 ∧ callTarget=本源声明类型叶 ∧ structuralTypeId/proofKind/Send/Sync 列已绑定——本线已完成绑定，见 TypedExprIrAppendValueDefinitionsForBindingInitializer 的 phaseB-parser 臂）按节点已绑 TypeId/proof 做 exact 核对。这是 t_tuple/obj_ctor 当前共同剩余墙的 t_tuple 侧。
2. [特征] obj_ctor 的 `named aggregate constructor drift`（typed_expr.cheng:12262）：fact 级 callResolved=0 与 expr 侧聚合构造分类对账——命名构造占位产线未回写 fact.callResolved/callKind，属 fact/expr 对账层（与 1 同一通道的 typed_expr 侧）。
3. [组线] t_enum 判词变化待定性：PhaseB-A 墙4（production Type authority missing stage=3）→ 现 `type trait premises are not exact`（compiler_snapshot_schema.cheng:5847）。本线全部修改均按 tuple/alias 形状门控，对 enum-only 声明逐臂核对为惰性（type_arena 严格校验 alias 臂仅 alias 声明根进入；realize 循环 enum 分支未动），且 r10 起判词即稳定为新值——变化点在 r1–r9 窗口，未能归因到具体臂，建议下线先用 r10 驱动复现再对照 PhaseB-A 驱动定位。t_enum 在 PhaseB-A 与本线均为红，未入 baseline。
4. [契约] production snapshot schema 的 enum 表示（PhaseB-A 移交 1 原样有效）：t_enum 特征收官唯一剩余墙。
5. [预算] 烤机 15 轮，超出预算 4 轮：每轮均推进一层密封墙且全部留有驱动/日志台账；超预算原因=移交缺口实为五层串联密封门（parser 声明流→sidecar 投影→TypeArena symbol/member→typed_expr 分类与节点证明→CSG typed-node 审计），每层首次揭露即需一轮验证。gate 期间与 wall150 线错峰（串行+45s 租约退避），未观察 lease 冲突导致的假红。

## 六、交付

- /tmp/oob_ab/phaseb_parser.patch：870 行，4 文件（parser.cheng / typed_expr.cheng / typed_expr_type_arena.cheng / compiler_parser_receipt.cheng），基线=HEAD+phaseb_a.patch；REVERSE-CHECK PASS（当前树 reverse 后与基线逐字节一致，re-apply 复原）。compiler_csg.cheng 诊断探针已净零（与基线 identical）。
- 探针全部拆除（CHENG_PBPARSER_DEBUG 0 处残留）。
- 观察件：src/tests/zz_phaseb_parser_obj_ctor.cheng（object 同形对照夹具，未跟踪，供下线复用）。
- 驱动与台账：/tmp/oob_ab/phaseb_parser/kernel_driver_pbparser_r1..r15 + bake_r*.log + final_gates/。
