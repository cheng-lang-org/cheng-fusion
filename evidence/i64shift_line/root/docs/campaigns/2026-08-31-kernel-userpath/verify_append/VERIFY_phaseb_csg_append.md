# VERIFY_phaseb_csg_append.md —— PhaseB-parser 续线（tuple/object 命名构造 CSG 层收官）2026-09-05

锚点 commit=69817b8b2（树上 [phaseB-enum]/[phaseB-tuple]/[phaseC-w5]/[wall150]/[phaseB-parser] 系在途 hunks 原样保留，零 revert，无 git commit）。车头=cheng_w126 + 重建 head 三件套（见「五、烤机台账」头注），CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/phaseb_csg/cold_cache CHENG_ENTRY_CACHE=0。gate 串行直跑 + 60-120s 租约退避。

## 一、根修判定（两面同根：命名聚合构造占位 CallExpr 的下游权威链断层，共修 5 处）

进场复现（parser 线 r15 驱动终态）：t_tuple compile=2 `compiler csg: typed-node resolved call missing node=4`；obj_ctor compile=2 `typed expr: named aggregate constructor drift ...:6 abi=polymorphic lower=deferred return=deferred`。本轮逐层推进并根修 5 处（[phaseB-csg] 标记）：

1. **CSG typed-node 审计第三类别**（compiler_csg.cheng，r1 验证 node=4 过）：CallExpr 分派（Builtin / declaration row 两类）之外新增「命名聚合构造占位」臂 + `compilerCsgTypedNodeValidateNamedAggregateConstructorCall`——同构 w45 builtin `new` 权威链：节点 resultType/callTarget 文本在 owner sidecar **唯一**命中 ParserDeclarationType 声明行，经 TypeSyntax root（TypeDeclarationRhs）→ `typeSyntaxTypeIds` 冻结列取 TypeId，与节点 exactTypeId 对账；Send/Sync/ProofKinds 三列与 TypeArena 权威值对账；唯一性破坏/坐标 miss 一律 fail-closed。
2. **FieldGet exact TypeId 的 chase 链 symbol 携带**（typed_expr.cheng `typedExprIrFieldGetExactStructuralTypeId`，r2 验证 node=6 绑定成功）：alias(Tuple) 声明根的 member 行挂在 alias symbol（`typedExprTypeArenaBuildTupleAliasMembers` 的 `memberDeclarationSymbolIds` 同源），而 chase 落点 tuple 子类型 symbolId 恒 -1——member 查询改用 chase 链上最近有效 symbolId；落点自带 symbol（object/enum 实例）时覆盖语义与旧一致，链上无 symbol 保持 fail-closed -1。
3. **CSG FieldGet TypeArena 身份双精确表示对账**（compiler_csg.cheng:17292 区，r3 验证 t_tuple 过该墙）：exact 权威表按声明行 TypeSyntax root 绑定，alias 包装声明存声明 TypeId 原样；typed-ir 节点侧 owner 可能是包装链节点经 physical 归一。原核对只认 physical → alias 直表示误判 mismatch。改为两种精确表示任一相等即过（types/表行均为精确 TypeId，无近似键）。
4. **abi 分类的本源值聚合直查**（typed_expr.cheng `TypedExprAbiClassForTypeInContext`，r2 验证 obj_ctor fact abi=composite）：r1 探针（pbcsg_fact/pbcsg_ctor_state）实锤 `TypedExprLookupTypeAliasTargetInContext("PObj")="object"`——object 声明头登记的伪别名（形状关键字），abi 通道 chase-first 被劫持到 "object" 文本 → Polymorphic。与 `TypedExprIrCanonicalFieldMetaState` 字段行直查调序修复（typed_expr.cheng:46201/47760 注释）**同一病灶族第三处**。修法：enum 判定后、alias chase 前，非 ref 且 ctx.typeFields 有 (ownerType leaf, producer>=0, ordinal>=0) 精确坐标字段行 → Composite（布局存在的直接证明）。ref object 前置排除；普通别名无字段行零改动（`type A = int32` 仍走 chase → Scalar）。
5. **-1 声明态谓词的聚合构造占位臂**（typed_expr.cheng `TypedExprIrCallNodeMinusOneDeclarationStateValidAt`——lowering transport 唯一权威谓词，本体在授权面内；r4 验证 obj_ctor 过 transport 层）：非空 target 的 -1 声明态唯一是命名聚合构造占位——非 importc、签名行 0、无 callee 节点、structuralTypeId>=0（value-def 绑定臂的绑定即证明）。**不查 exactTypeArena**：lowering 消费时该指针已被 compiler csg seal 出 typed IR（r3 首版查 arena 恒 false 的根因，r4 修正）。

## 二、验收门禁表（r4 驱动终态，全部实测）

| 件 | 合同 | 实测 | 判定 |
|---|---|---|---|
| t_tuple | compile=0 run=0 + `t_tuple=pass` | compile=2，判词 `compiler snapshot builder: TypeId remap changed type identity`（compiler_snapshot_builder.cheng:16610，[phaseB-enum-schema] 在途 hunks 区）。较 r15 推进 4 层：CSG typed-node 审计✓→FieldGet TypeId✓→lowering transport✓→CSG FieldGet 对账✓→snapshot remap✗ | 红（剩余墙已推出本线授权面，见移交 1） |
| obj_ctor | 同形同绿判据 | compile=1，判词 `lowering plan: call target exact TypedExpr identity missing function=main call_index=0`（lowering_plan.cheng:15298）。较 r15 推进 3 层：fact abi✓→lowering transport 谓词✓→lowering plan call identity✗ | 红（剩余墙在 backend 领地，见移交 2；与 t_tuple 同根——同一占位产线的下游断层链） |
| ordinary | 0/0 | compile=0 run=0 | PASS |
| call_fixture | 0/1 | compile=0 run=1 | PASS |
| cold_nested | 0/0 + pass 判词 | compile=0 run=0，stdout `cold_nested_fmt_interpolation=pass` | PASS |
| v6 | 0/0 | compile=0 run=0 | PASS |
| t_enum（PhaseB-A 臂） | 维持现状即红 | compile=1，判词 `primary exact def freeze validate rejected`（primary_object_plan.cheng:66473） | 红（判词较 r15 移交时 `type trait premises are not exact` 有前移，归因见移交 3，非本线引起） |

## 三、烤机台账（r1–r4，预算 4 轮内收官）

head 三件套事故与重建：/tmp/oob_ab/w139 整目录被并行线清理。重建=build 脚本原样复刻 + manifest 恢复。**注意**：git HEAD（含锚点 commit 自身）的 bootstrap/kernel_manifest.cheng 已前移为 composition 入口（entries=37/38，w126b 记录该通道被 HEAD 车头拒收，首烤产物挂 `codegen_plugin_missing=arm64-apple-darwin` 已弃）——按 VERIFY_w139 记录的 w139 语义恢复为 `69817b8b2^`（锚点父）版 manifest（6752 字节、entries=36、entry=backend_driver_dispatch_min.cheng），与 parser 线 r15 完全同通道。

| 轮 | 内容 | size | sha256 |
|---|---|---|---|
| r1 | CSG 聚合构造占位审计臂 + typed_expr 诊断探针（pbcsg_ctor_state/pbcsg_fact） | 186830016 | d7f514d55bcfd8b2682e4a605fbe8985e78b5fa897e8535f150e46b83da1a2eb |
| r2 | FieldGet chase symbol 携带 + abi 字段行直查臂（探针事实定案后落地）+ 探针拆净 | 186813600 | e31eea72b9bb75dd8b909141d0e802289bd30b6fa5d906507108dcf435834b6a |
| r3 | CSG FieldGet 双表示对账 + 谓词占位臂 v1（查 arena，被 r4 判词证伪） | 186813600 | 2d38ce622f98dd44718ea15e54e966578d969287e5c08254707c69f28abee34e |
| r4 | 谓词占位臂 v2（去 arena 依赖，structuralTypeId 绑定即证明）——收官驱动 | 186813600 | fa775e6861087da666771824c6aa3ab914e525c385d151cbdedcfddbcb89b6a1 |

秒级门：每轮 typed_expr.cheng / compiler_csg.cheng / backend_driver_dispatch_min.cheng 单文件 `--emit:obj` 全 rc=0。探针 CHENG_PBCSG_DEBUG 已净零（0 处残留）。

## 四、t_enum 判词前移归因（非本线引起，附二分证据）

r15 移交时 t_enum 判词=`csg compiler snapshot: type trait premises are not exact`（compile=2，snapshot schema 层）。r4 实测=`primary exact def freeze validate rejected`（compile=1，primary 层，更早失败）。归因实验（同当前树、不同驱动）：

- r15 驱动（parser 线终态源码）跑当前树 t_enum → **旧判词**（snapshot 层）；
- r1 驱动跑 t_enum → **已挂新判词**（primary 层），而 r1 时刻本线对 typed_expr 仅净零探针、compiler_csg 仅 CSG 审计层新增类别（primary 判词在 CSG 审计之前，CSG 臂不可能影响 primary 输入）；
- 结论：判词前移由并行线在 r15 收官（08:33）之后、r1 烤机之前落在树上的在途修改（编译进 r1+ 驱动的非本线文件）引起。本线全部修改按形状门控对 enum-only 声明逐臂惰性（enum 判定先于 abi 直查臂；enum 声明无字段行、无 member 行、无命名构造占位）。t_enum 在移交时与本轮均为红、未入 baseline，维持现状。

## 五、移交事项（按优先序）

1. [契约/enum-schema 领地] t_tuple 剩余唯一墙：`compiler snapshot builder: TypeId remap changed type identity`（compiler_snapshot_builder.cheng:16610，[phaseB-enum-schema] 在途 hunks 内的 canonical 行重排 trait/row CID 重验）。t_tuple 类型域至此全通：alias(Tuple) 声明的 Pair/字段 member 行在 canonical 重排后 traitProofCids/typeCids 重算不一致。与 PhaseB-A 移交 4「production snapshot schema 的类型表示」同层，是 enum/tuple/任意非平凡类型收官的共同最后墙，本线零触碰。
2. [契约/backend 领地] obj_ctor 剩余唯一墙：`lowering plan: call target exact TypedExpr identity missing`（lowering_plan.cheng:15298 `LoweringSealPrimaryObjectIrCallIdentities`）。占位聚合构造调用（callTargets 条目 target=声明类型叶、签名行 0、非 importc、非函数）被当真调用做 TypedExpr function identity 解析必 miss。修法方向：该 seal 循环为占位构造调用加识别臂（签名行 0 + 非 importc + typedIr 对应 semanticCallExprNodeIndex 的 callDeclarationIndex==-1 且过 `TypedExprIrCallNodeMinusOneDeclarationStateValidAt` 占位态）跳过函数 identity 解析（其真物化在 PrimaryBodyIrAppendAggregateConstructorToSlot 按 raw text 逐字段 FieldStore，不消费 function identity）。backend 文件超出本线授权面，按纪律停手移交。
3. [组线] t_enum 判词前移（移交/第四节）建议 PhaseB-enum-schema 线自查：其 primary freeze 侧在途修改使 enum-only 编译在 ExactDefCallAuthorityValidateInto 提前拒绝；r15 驱动可复现旧判词作对照基线。
4. [工具链] /tmp/oob_ab/w139 三件套已被重建（build 脚本原样 + manifest=69817b8b2^ 版）。**后续任何线烤机必须用该 dispatch_min 版 manifest**——当前 git HEAD 的 bootstrap/kernel_manifest.cheng 已是 composition 入口，直用会烤出缺 codegen 插件的废驱动。建议下线把该 manifest 拷贝另存到烤机目录防再丢失。

## 六、交付

- /tmp/oob_ab/phaseb_csg.patch：2 文件（compiler_csg.cheng 3 块 / typed_expr.cheng 3 块），9 hunks 14680 字节，全部 [phaseB-csg] 标记。双向验证 PASS：baseline+patch → 与当前树逐字节一致（RE-APPLY BYTE-IDENTICAL PASS）；当前树 reverse-apply → 与 baseline 逐字节一致（REVERSE-RESTORE PASS）。基线=本线进场时树状态（r15 时刻源 + 各线在途 hunks 原样）。诊断探针全部拆除（CHENG_PBCSG_DEBUG 0 处残留）。
- 驱动与台账：/tmp/oob_ab/phaseb_csg/kernel_driver_pbcsg_r1..r4 + bake_r*.log + gates_final.sh + final_gates/ + t_enum_r1..r4.log（归因二分证据）。
- 门禁终态：四夹具 functional 4/4 全绿（ordinary 0/0、call 0/1、cold_nested 0/0 =pass、v6 0/0）；t_tuple/obj_ctor 判词均已推出本线授权面；t_enum 维持红（归因并行线）。
