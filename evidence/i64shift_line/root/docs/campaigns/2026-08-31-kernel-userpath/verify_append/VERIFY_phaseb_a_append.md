# VERIFY_phaseb_a_append.md —— PhaseB-A 组线（enum + tuple）2026-09-05

锚点 commit=69817b8b2（四夹具 4/4 全绿）。车头=cheng_w126（head 三件套），烤机 5 轮预算全部用满（r0 基线 + r1/r2/r3/r4）。全程无 git commit、无分支。

## 一、特征实现判定

### enum（A1）：管线臂三墙实装，推进至 production snapshot 契约边界后停手移交

垂直切片逐墙定性（kernel driver 链，非 C 冷链）：

| 墙 | 挂点判词 | 修复 |
|---|---|---|
| 1. parser 成员行被 Result intrinsic 吞 | `compiler csg: exact parser expression lacks declaration node row=0 line=2` | [phaseB-enum] parser.cheng：`ParserReadNormalizedExprLayerFromText...` 主扫描前从 value-expr 树 enum 变体 CSR 取精确成员行号集合，成员行关闭 `ParserAppendSimpleSurfaceExprsLine` 的 ResultIntrinsic 识别（`Ok`/`Err` 裸名此前被追加成无声明节点的表达式行） |
| 2. value-definition TypeId 身份分裂 | `compiler csg: value-definition annotation TypeId mismatch row=0` | [phaseB-enum] compiler_csg.cheng：replay 核对加 `compilerCsgEnumMemberConstEquivalence` 等价臂——注解=enum 结构行 ∧ 定义值=int32 保留标量行 ∧ 定义节点=I32Const ∧ surface 恰为 `<EnumName>.<Member>` 两段且分别与 enum 声明名/成员名表 intern 精确匹配，缺一即拒。type_arena 加三个只读精确查询 API（EnumDeclaresMemberName/EnumDeclarationName/ScalarKindAt） |
| 3. snapshot denominator 不认 enum | `compiler snapshot builder: diagnostic Layout denominator missing typeKind=9` | [phaseB-enum] compiler_snapshot_builder.cheng：非 nominal-composite（Object/RefObject）非 Alias 的声明 kind（Enum 物理是标量 ordinal，无复合布局证据域）跳过 required-layout 证据，不再掉进 alias 分支误挂 |
| 4. production snapshot schema 无 enum 表示 | `compiler snapshot builder: production Type authority missing stage=3 typeId=15`（stage=SchemaKind） | **未修，停手移交**。`compilerSnapshotBuilderTypeProjectionAssessInto` 对 `TypedExprStructuralTypeEnum` 显式计数 missingSchemaKindCount（源码注释明言 "Variant payload rows are not yet represented by the snapshot schema, so accepting an enum would lose exact declaration data"——有意 fail-closed 设计）。放宽 = production schema 契约扩展（需 enum 变体行表示），超出 A 组授权面 |

推进实证：probe_enum1~5 + t_enum 在 r1→r2 间从墙 1/2 推进到墙 3（r2 修复）再到墙 4（r4 最终态判词全部一致为墙 4）。即 enum 的 parse→typed→csg→value-definition→lowering→plan 主链已全通，编译失败点是 production snapshot 证据层的显式契约拒收，且对所有含 enum 声明的程序生效（四夹具不含 enum 故不受影响）。

C 冷链对照（cheng_w126 直编）：t_match/t_defer 全绿、probe_enum2（ordinal 消费）绿、`let s: Status = Status.Ok` 挂 cold C 的 kind mismatch（SLOT_I32 vs SLOT_VARIANT）——C 冷链缺口独立，未动（bootstrap/ 非授权面）。

### tuple（A2）：预存架构边界定性，半成品臂按纪律撤除

- formal-spec 权威核对：`tupleType ::= "tuple" "[" ... "]"`（缩进字段表非法，t_tuple 原件非法，已修型为 `tuple[x: int32, y: int32]`）；enum 缩进成员表合法（t_enum 形合规）。
- `tuple[...]` 类型语法/别名解析/内联布局全通（r0 实证 `LookupTypeLayout(Pair)` 成功，挂点在其后）。
- 决定性对照实验：**object 版同形构造 `P(x: 1, y: 2)`（缩进字段表声明）在 r3 挂同一判词** `unknown object constructor field`。定性：kernel driver 链上"入口源文件命名构造通道"预存缺口——构造核对（typed_expr `TypedExprNamedAggregateFieldExistsInOwner`）与 IR 字段行发布都要求字段带精确 parser 声明行坐标（`producerSourceIndex>=0 && ordinal>=0`），object 缩进字段有 `ParserDeclarationField` 声明行可绑定，而 tuple inline 元素在 parser 声明流中**没有声明行**（`tuple[...]` 整体是一个 ParserTypeSyntaxTuple 节点），无坐标可绑。跨模块命名构造（frozen projection 通道）不受此影响（kernel 内部既有实证）。
- 曾实现 ctx.typeFields inline 元素登记臂（r3 已含），因无坐标绑定伙伴属于半成品（且可能引入 parser/context coverage split 新墙），按"禁临时方案"纪律完整撤销；typed_expr.cheng 已 checkout 恢复。
- 根修方向（移交）：parser 给 `type N = tuple[a: T, ...]` 的具名元素产出 FieldDeclaration 声明行 + FieldDeclaration TypeSyntax owner 边（同 object 缩进字段机制），或裁定的替代坐标通道。这是 parser 类型语法身份图结构改造，超出本轮预算。

t_tuple 修型后最终判词（r4）：`unknown object constructor field`（与 object 同形同墙，非 tuple 特有回归）。probe_tuple2 的 `(x: 1, y: 2)` tupleLiteral 形挂 `typed expr: unsupported structural value case=3`——structured value 通道无 tuple literal 臂，同为移交项。

## 二、验收件结果

| 件 | 合同 | 实测（r4 驱动终态取证） | 判定 |
|---|---|---|---|
| t_enum | compile=0 run=0 + `t_enum=pass` | compile=2，判词 `compiler snapshot builder: production Type authority missing stage=3 typeId=15` | 红（预存 snapshot schema 契约缺口，移交） |
| t_tuple | compile=0 run=0 + `t_tuple=pass` | compile=1，判词 `unknown object constructor field` | 红（预存入口构造坐标链缺口，移交；夹具已修型为 spec 合法形） |

两件均未入 user_path_baseline.tsv 探针区（未绿不登记，防假绿）。

## 三、回归门（r4 终态驱动，全部实测）

| 夹具 | 合同 | 实测 | 判定 |
|---|---|---|---|
| ordinary | 0/0 | compile=0 run=0 | PASS |
| call_fixture | 0/1 | compile=0 run=1 | PASS |
| cold_nested | 0/0 + pass 判词 | compile=0 run=0，stdout `cold_nested_fmt_interpolation=pass` | PASS |
| v6 | 0/0 | compile=0 run=0 | PASS |

四夹具 4/4 零回归。官方 gate（user_path_gate.sh）在并行线重烤租约期多次 `parent lease unavailable`/RSS 挤压（peak 贴近 1GiB cap），改以 gate 同款调用形态（system-link-exec + 同环境变量 + 1GiB 守卫语义一致）逐件退避直跑取证，ordinary/call_fixture 曾在 gate attempt3 全窗跑通（PASS/PASS），四件终态全部实测绿。

## 四、烤机台账

| 轮 | 内容 | size | sha256 |
|---|---|---|---|
| r0 | 锚点基线（无特征修改） | 186516464 | 881dc72f11d5c3e181560460be06de6895691ae1031aa44fff7f9aaf666d2367 |
| r1 | + enum 墙 1（parser 成员行） | 186550560 | dea685c6c27985f0fb630c452d76ac8ad5d5c23e15b50656baa4ad4cb61d1fcc |
| r2 | + enum 墙 2 等价臂 + 墙 3 denominator + tuple 登记臂 | 186550576 | 3c7ebfcab930c06d9434159f360352db3197fee6f0fbf6ba17bcdefa10c725b8 |
| r3 | + tuple 臂接线验证（实证 object 同挂后定性预存缺口） | 186567072 | a757c0da3b1b757ac7493dd506dd1b6af75066e6835926e2c1b0b1011b2df6bf |
| r4 | 收官（tuple 臂撤除，enum 三臂终态） | 186550560 | d55277a777f56834f0818793386d6e9ac45059a67b6ec0e91f78a8e2ada4d0a1 |

源文件（终态）sha256 前 16：parser e66736b716d7e384、typed_expr_type_arena c44d4bd30f1a11f4、compiler_csg 31064f7d45514c65、compiler_snapshot_builder 72be5bdf09b393b2、t_tuple 8d09cf73e0a48b59。

秒级门：parser/typed_expr_type_arena/compiler_csg/compiler_snapshot_builder 单文件 `--emit:obj` 全 rc=0；typed_expr.cheng 单文件入口形态 HEAD 即挂 C 车头 `managed element field read lacks exact array root`（预存，stash 对照实证，非我引入），改用烤机同款入口闭包 `backend_driver_dispatch_min --emit:obj` 作秒级门（rc=0，231s）。烤机遇一次借用形参拒绝（等价函数补 @borrows，与同文件收 `TypedExprIr` 形参的先例对齐），秒级门后即修。

## 五、交付与移交

交付：/tmp/oob_ab/phaseb_a.patch（253 行，5 文件，reverse-check PASS）。改动全部带 [phaseB-enum]/[phaseB-tuple] 标记；并行线在途 hunks（gpuros_bare/merkle/program_support/system_link_exec/cheng_cold.c/findings.md）零触碰。src/tests/gpuros_probe26/27.cheng 为并行线未跟踪文件，未动。

移交事项（按优先序）：
1. [契约] production snapshot schema 的 enum 表示：`compilerSnapshotBuilderTypeProjectionAssessInto` 的 `TypedExprStructuralTypeEnum` 分支（compiler_snapshot_builder.cheng:13919 起，r4 树行号约 13934）。需要 schema 层 enum 变体行表示（TypeArena Enum 行已有完整变体 CSR：memberNameIds/Ordinals/PayloadTypeIds），或裁定"TypeArena artifact cid 完整承载 enum 数据"作为可证明口径。此墙挡住**一切含 enum 声明的用户程序**的 production snapshot，是 enum 特征收官唯一剩余墙。
2. [架构] 入口源文件命名构造坐标链：`unknown object constructor field` 对入口 object/tuple 命名构造同挂（r3 实证）。根因=构造核对与 IR 字段行发布要求字段精确 parser 声明行坐标，tuple inline 元素无声明行。根修=parser 为 `tuple[a: T,...]` 具名元素产出 FieldDeclaration 行 + TypeSyntax owner 边（同 object 缩进字段机制）；object 侧需先归因为何 BindMetadataExactLayout 对入口文件的绑定未让构造判定通过。
3. [特征] tupleLiteral `(x: 1, y: 2)`：structured value 通道无 tuple literal 臂（`unsupported structural value case=3`），spec 475 行合法形。
4. [C 冷链] `Status.Ok`→let 的 kind mismatch（bootstrap/cold_parser.c SLOT_I32/SLOT_VARIANT 身份分裂）与缩进 tuple 表判词——bootstrap 非本轮授权面。
5. [组线] t_match 的 `case...else:` 在 kernel driver 链 parse 层挂 `PARSER_BRANCH_WITHOUT_IF`（r0 驱动已挂，预存，非我回归；C 冷链全绿）——C1 组 match/case 领地需补 case-else parse 臂。

经验教训（供 lessons.md 权衡）：(a) "t_match 全绿"的预研定性是在 C 冷链上测的，kernel driver 链另有 parse 层墙——特征探针重测必须声明用哪条链的驱动；(b) 秒级门对 typed_expr.cheng 单文件入口形态不可用（C 车头预存限制），闭包级秒级门（backend_driver_dispatch_min --emit:obj，约 4 分钟）是可靠替代。
