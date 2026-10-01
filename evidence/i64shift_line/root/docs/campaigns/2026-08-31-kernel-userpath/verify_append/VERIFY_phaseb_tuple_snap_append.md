# VERIFY_phaseb_tuple_snap_append.md —— PhaseB-tuple-snap 线（t_tuple snapshot builder remap 墙收官）2026-09-05

锚点 commit=69817b8b2（树上 [phaseB-enum]/[phaseB-tuple]/[phaseB-csg]/[phaseB-parser]/[phaseC-w5]/[wall150] 系在途 hunks 原样保留，零 revert，无 git commit）。车头=cheng_w126 + /tmp/oob_ab/w139 锚点版 manifest（6752 字节/entries=35+注释头/compiler_entry=backend_driver_dispatch_min.cheng，复用 csg 续线重建版），CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/phaseb_tuple_snap/cold_cache CHENG_ENTRY_CACHE=0。gate 串行直跑 + 45s 租约退避。进场对照驱动=/tmp/oob_ab/phaseb_csg/kernel_driver_pbcsg_r4。

## 一、根修判定（snapshot v8 同一 remap 体系的 tuple 命名构造缺臂，共 3 墙 4 处修，全部 [phaseB-tuple-snap] 标记）

进场复现（pbcsg_r4 驱动）：t_tuple compile=2 `compiler snapshot builder: TypeId remap changed type identity`（compiler_snapshot_builder.cheng canonical 重排对账）。本轮逐墙根修：

1. **墙 1 = canonical 重排对账漂移**（compiler_snapshot_builder.cheng 23809 区后，r1 破）：非 nominal 声明行族（kind Alias 是唯一既非 nominal（Object/RefObject/Enum 走 declarationPathCids）又非无符号（结构族 declSymbolId=-1）的行）的 row identity preimage 经 `csgCompilerTypeCidAppendOptionalSymbol` 消费 `symbols.symbolCids[declSymbolId]`；而 w53 provisional DeclKey finalizer 在首算 CID 之后改写 Type Symbol symbolCids（18494），Alias 行 CID 未按定稿符号身份重导出 → canonicalize 重算必漂移。修=finalize 循环与 canonicalize 之间插入第二轮全表 CID derive（与 w53 首算同构）：其余行族派生输入全部不变（幂等），alias 声明的 Type Symbol typeIds 按 parser 契约指向 alias target 结构行（signatureArenaTypeId，17114-17126）故与 symbolCids 无循环；arena 升序=声明序=alias 拓扑序，一轮到不动点。
2. **墙 2 = schema TypeSyntax 字段立即宿主缺 tuple 臂**（compiler_snapshot_schema.cheng 3947 区，r2 破）：[phaseB-parser] 起 `type Pair = tuple[x:...]` 的字段行以 FieldDeclaration root 进表，schema 宿主 join 的 topOwner 只认 Object/RefObject/ImplicitObject。修=同构 parser `ParserValueExprTypeSyntaxAliasDeclarationRootWrapsTuple` 契约加精确臂：候选根 kind==TypeDeclarationRhs 且（kind==Alias 且唯一 child kind==Tuple）→ 可为立即宿主；普通别名（alias 到标量/序列）仍不得拥有字段声明。
3. **墙 3 = layouts 投影缺 tuple 布局臂**（compiler_snapshot_builder.cheng `compilerSnapshotBuilderLayoutsProjectInto`，r3/r3b 破）：diagnostic Layout 域对 alias 声明经 aliasTarget 解析布局，但 layouts 投影只收 Object/RefObject → Tuple 结构行无布局行（resultId=-1）。修两处：(a) exact row 映射循环加 alias-wraps-tuple 臂——alias 声明的 exact layout 权威（exactLayoutTypeArenaIds 键在 alias arena 行）投影到 alias target 的 Tuple 结构行；(b) 投影主循环加 CsgCompilerTypeTuple 臂——非 nominal 声明符号对账改走 alias 行 declSymbol（字段 owner=Pair Type Symbol），member 区/argCounts/exactField 对账与 nominal 同构（Tuple 行 argCount=字段数、member 行挂 alias arena symbol）。r3 曾挂 `tuple layout declaring Symbol drift`：本线初版把声明符号对账写成 `typeIds[aliasSymbolId]==aliasFinalTypeId`，与生产契约（symbol.typeIds=signature=alias target 结构行）相悖，r3b 修正为 `==finalTypeId`（即本 Tuple 行）后通过。schema 侧 `csgCompilerLayoutsValidateInto`/`CsgCompilerLayoutRowCidInto` 结构上本就允许非 nominal 布局行（nominal 专属校验全部 kind 门控、9617 存在性只单向要求 Object/RefObject），零 schema 改动。

obj_ctor 判词全程未变（`lowering plan: call target exact TypedExpr identity missing`，lowering_plan.cheng 域，PhaseB-BC 在飞线领地，本线零触碰）。

## 二、验收门禁表（r3b 驱动终态，全部实测）

| 件 | 合同 | 实测 | 判定 |
|---|---|---|---|
| t_tuple | compile=0 run=0 + `t_tuple=pass` | compile=1，判词 `lowering plan: call target exact TypedExpr identity missing function=main call_index=0`（lowering_plan 域）。较进场推进 snapshot 全链 3 墙：remap 对账✓→TypeSyntax 宿主✓→diagnostic Layout✓→lowering plan✗（与 obj_ctor 同墙同判词，PhaseB-BC 领地） | snapshot 簇授权面内全绿；剩余墙在授权面外（移交 1） |
| ordinary | 0/0 | compile=0 run=0 | PASS |
| call_fixture | 0/1 | compile=0 run=1 | PASS |
| cold_nested | 0/0 + pass 判词 | compile=0 run=0，stdout `cold_nested_fmt_interpolation=pass` | PASS |
| v6 | 0/0 | compile=0 run=0 | PASS |
| obj_ctor | 记录不触碰 | compile=1，判词同进场（lowering plan call identity） | 红维持（PhaseB-BC 领地，未变） |
| t_enum | 维持绿 | compile=0 run=0，stdout `t_enum=pass` | PASS（r1 起即绿：PhaseB-enum-schema/enum-cold 并行线 primary freeze 侧修复已落树，非本线改动） |

验收合同 1 未在本线完整达成：t_tuple 的 snapshot 簇授权面（src/core/tooling snapshot 系 + 相邻 schema）内已无任何剩余墙，compile 从 2（snapshot 域）推进到 1（lowering plan 域）；唯一剩余墙=PhaseB-BC 在飞线领地的 `LoweringSealPrimaryObjectIrCallIdentities` 占位构造调用识别臂（csg 续线移交 2 同一项），本线按授权纪律停手。

## 三、烤机台账（r1–r3b，预算 3 轮，r3b 为 r3 单行对账修正返工超支一轮——原因见一、3，非新墙）

| 轮 | 内容 | size | sha256 |
|---|---|---|---|
| r1 | builder 第二轮 CID derive（墙 1） | 186830032 | 4f78e496f8606eb5e02442daad1e266153ba456f2a8edc277aad813c930b88e6 |
| r2 | schema TypeSyntax 字段宿主 tuple 臂（墙 2） | 186830032 | a844d91226c603f24528b785590058413425eceebc00c9c09c73bb99d04d86d6 |
| r3 | layouts 投影 tuple 布局臂（墙 3，初版对账条件有误） | 186846496 | de644dfe1cbb2bf1d29f37fd06b4f24a8b016273136a53ffa2e65d6c36d109ee |
| r3b | 声明符号对账修正（typeIds 对 finalTypeId，收官驱动） | 186846496 | cf23e7cf39731be2bf39377f2c322e0ce68f27ce6d871ca3634749d7c32512ab |

秒级门：每轮修改后 dispatch_min 入口单文件 `--emit:obj`（全闭包含修改文件）rc=0。**通道备注**：compiler_snapshot_builder.cheng / typed_expr.cheng 单文件直入口在本通道挂 HEAD 固有/并行线在途代码判词（前者 `expected indexed assignment value`@13344 区 HEAD 原生、后者 `managed element field read lacks exact array root`@并行线在途 hunk，均与本线改动无关），秒级门统一改用 dispatch_min 闭包入口（181MB+ 闭包对象含全部修改），门力等价。

## 四、移交事项

1. [PhaseB-BC 领地] t_tuple 与 obj_ctor 共同剩余唯一墙：`lowering plan: call target exact TypedExpr identity missing`（lowering_plan.cheng `LoweringSealPrimaryObjectIrCallIdentities`）。修法方向沿用 csg 续线移交 2：seal 循环为占位聚合构造调用加识别臂（签名行 0 + 非 importc + callDeclarationIndex==-1 且过 `TypedExprIrCallNodeMinusOneDeclarationStateValidAt` 占位态）跳过函数 identity 解析。t_tuple 侧 snapshot 全链（TypeTable 五列 remap/宿主 join/布局投影/CID 对账）已全部打通，backend 侧放行即收官。
2. [组线] r2 起 t_enum 已绿（primary freeze 修复由并行线落树），PhaseB-enum-schema 线可收口复核。
3. [工具链] /tmp/oob_ab/w139 manifest 仍为锚点版（dispatch_min 入口），已加拷贝至 /tmp/oob_ab/phaseb_tuple_snap/ 备份防再丢失。单文件秒级门通道限制见三、备注。

## 五、交付

- /tmp/oob_ab/phaseb_tuple_snap.patch：2 文件（compiler_snapshot_builder.cheng 3 处 / compiler_snapshot_schema.cheng 1 处），全部 [phaseB-tuple-snap] 标记，10541 字节，sha256=58974447e34dc0b1a37b8656387922a4aecf77c8e2cdadef93c891148c56cac9。双向验证 PASS：baseline+patch → 与当前树逐字节一致（RE-APPLY BYTE-IDENTICAL PASS）；当前树 reverse-apply → 与 baseline 逐字节一致（REVERSE-RESTORE PASS）。基线=本线进场时树状态（r15/pbcsg_r4 时刻源 + 各线在途 hunks 原样）。
- 驱动与台账：/tmp/oob_ab/phaseb_tuple_snap/kernel_driver_ptsnap_r1/r2/r3/r3b + bake_r*.log + gates_*.sh + final_gates*/（逐件日志）。
- 门禁终态：四夹具 functional 4/4 全绿；t_enum 绿；t_tuple snapshot 域收官、与 obj_ctor 同悬 lowering plan 墙（PhaseB-BC 领地）。
