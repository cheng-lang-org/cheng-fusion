# wall117e.VERIFY

## wall117e 报告：cold_nested `csg compiler snapshot: value-definition producer authority drift` 墙死亡（compiler_snapshot_schema.cheng 单文件两臂：判词富化取数 + ownershipKinds 相等臂对齐 producer 契约 Parameter 豁免）——cold_nested 判词推进至 `primary: managed BodyOp non-parameter borrow owner requires immutable semantic index site=c`（primary_object_plan.cheng 域=契约边界，停手完整移交）；ordinary 0/0、call_fixture 0/1 零回归；冷链车头 v6 0/0；v6 驱动只记录（lowering_plan 域判词，与 w117d 同点，并行线在先）；烤机 2/3 轮两轮全过；零租约冲突

日期 2026-09-03。授权面=src/core/csg_core/compiler_snapshot_schema.cheng（唯一）。进入时该文件工作树零 diff（w41 hunks 已在 HEAD=e64a45629）。本臂净变更=该文件 +37/−3。

### 判定与机理
1. **①判词富化（r1，+25/−1）**：drift 判词从零列扩为全列（wall98/9289 layout-CID 先例同款 var-ForErr+守卫读）：definition_row/function_id/defining_typed_node_id/typed_node_count/produced_rows_len/node_function_id/node_produced_row/definition_ownership_kind/node_ownership_kind/definition_ownership_kind_valid/proof_kind/proof_kind_none/proof_kind_aggregate。definingTypedNodeId 越界时 node 侧列条件化取 -1；守卫判定零改动，fail-closed 判据原样。秒级门 rc=0。
2. **②定性（烤机轮1 实锤，判词全列）**：`drift definition_row=0 function_id=0 defining_typed_node_id=0 typed_node_count=32 produced_rows_len=32 node_function_id=0 node_produced_row=0 definition_ownership_kind=1 node_ownership_kind=2 definition_ownership_kind_valid=1 proof_kind=2 proof_kind_none=0 proof_kind_aggregate=5`。七条件中唯 ownershipKinds 相等臂命中：def 侧 Owned(1) vs typedNode 侧 Borrowed(2)，其余六条件全过（界/归属/反向指针/proof 值域均好）。def_row=0=function_id=0（nestedFmt）首行=`name: str` 不可变托管形参。
3. **契约权威（producer 端三处联立，均在授权面外取证）**：①typed_expr.cheng:5960-5975 `typedExprIrValueDefinitionOwnershipMatchesNode`：非 Parameter 源要求 ownership==exprClass[node]；**Parameter 源走 `typedExprIrParameterDefinitionOwnershipExact`**——ParamRef 节点恒为借视（非 Borrowed 即 panic），但定义所有权=不可变非 @borrows 形参为 **Owned**（:5958-5961 注释自证「ParamRef is always a borrowed read view. The immutable binding itself owns the incoming managed value unless the declaration says @borrows」）→ 不可变托管形参契约保证 def=Owned/node=Borrowed 不等。②typed_expr.cheng:6081-6083 注册端 panic 门同款豁免（`!parameterOrigin && ownership != exprClass[node]` 才拒）。③snapshot_builder.cheng:12636/12849 两列各自从 typed_ir 独立盖章（typedNodes.ownershipKinds←exprClasses[node]、valueDefinitions.ownershipKinds←ValueDefinitionOwnershipAt[row]），builder 自校验只对各自 typed_ir 源、从无两列互等要求。schema 相等臂对 Parameter 源无条件要求相等=比 producer 契约严，ordinary/call_fixture（零形参夹具）不可达，cold_nested nestedFmt 是首个带托管形参的验收形。
4. **③修法（r2，+37/−3 累积）**：相等臂加 `originKind != CsgCompilerValueDefinitionOriginParameter &&` 前置，逐条件镜像 producer 谓词结构；其余六条件、Parameter 源、下游 param 身份臂（schema :11645 区）零触碰=零弱化（Parameter 正向臂需 paramMutableFlags/borrowsArguments 列，快照表无此二列不可投影，producer 注册端 panic 级守卫在场）。契约对齐非放松：本臂此前只拒 producer 契约合法形。
5. **④验收（烤机轮2 kernel_driver_w117e2）**：本墙死亡——cold_nested compile rc=2→1，`producer authority drift` 判词 0 命中，推进至新墙（见移交）。ordinary 0/0、call_fixture 0/1 不回归；车头 v6 0/0、冷链门过。
6. **下一墙（契约边界，停手完整移交）**：cold_nested 新判词=`primary: managed BodyOp non-parameter borrow owner requires immutable semantic index site=c node=4 def_row=0 def_origin=1 def_own=1 owner_row=-1 owner_node=0`（compile rc=1）。发射点=src/core/backend/primary_object_plan.cheng:17902-17911（site=c 臂）：BodyOp Shared 借视 op 语义行=def_row=0（nestedFmt `name: str` 形参定义行），借主列缺席（owner_row=-1）且 origin==Parameter → panic。机理：发布侧 typed_expr.cheng:6102-6112 借主列**只在 ownership==Borrowed 时盖章**（参数 Borrowed→自根；不可变 Owned 形参→列恒 -1），而 primary :17808 注释主张「参数定义行按发布契约必带自根借主」只对 Borrowed 参数成立，w65 镜像臂（:17819-17861）也只恢复 Borrowed var 视图参数指纹——**不可变 Owned 托管形参的 Shared 借视形状在 primary 无臂**。修面候选二选一（primary/typed_expr 领地，均在本臂授权面外）：(a) site=c 容忍 Parameter+Owned 行自根流入参数借主权威臂，需同步放宽 site=a（:17871 `owner_own != Borrowed` 拒臂）对 Owned 参数权威的拒绝（entry-slot 身份链同构）；(b) 发布侧为不可变托管形参补盖自根借主列（typed_expr 领地=v6 线在途）。C 参照（cheng_w117e 同输入 compile=0/run=0 pass）证明形状语义合法。**按「撞契约边界即停」停手**；烤机余 1/3 轮留给下一臂。
7. **v6 驱动只记录**：v6 × w117e2 compile rc=2，判词=`lowering plan: compiler csg semantic parameter type drift function=addCol line=30 index=0 expected=@borrow:Box actual=Box`（lowering_plan.cheng 域，与 w117d 记录同点，v6 线并行领地在先，零触碰）。

### 门禁与验收实况（cwd=仓库根；RSS 零抬帽）
| 门 | 结果 |
|---|---|
| 车头重建 cheng_w117e（工作树 C 派发命令） | 秒死 fexecve（composition 线在途 cheng_cold.c:108660，与 w117d 归因一致）→ 降级 HEAD 提取件 clang -std=c11 -O2 -I bootstrap，rc=0，sha256=2404e769…71017d2d0，size 3310456（=cheng_w117d 同源） |
| 秒级门 compiler_snapshot_schema.cheng --emit:obj（r1/r2 两态） | 双 rc=0 |
| 烤机轮1（HEAD 脚本 ROOT 修正+HEAD manifest+CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w117e/cold_cache） | rc=0，kernel_driver_w117e sha256=b4b6eb33…219c87938，size 186005872 |
| 烤机轮2（同配方） | rc=0，kernel_driver_w117e2 sha256=20b24e5d…f9e7cd，size 186005872 |
| 车头 × v6（冷链门） | compile=0 / run=0 |
| 车头 × cold_nested（语义参照） | compile=0 / run=0 |
| 车头 × ordinary / call_fixture（基线） | 0/0、0/1 与 w117d 一致 |
| cold_nested × w117e2 | compile rc=1 `primary: … site=c`（本墙死亡判词推进；`producer authority drift` grep=0） |
| ordinary × w117e2 | compile=0 / run=0 不回归 |
| call_fixture（zz_call_fixture_w7）× w117e2 | compile=0 / run=1 契约预期不回归 |
| v6 × w117e2（并行线在先只记录） | compile rc=2 `lowering plan: compiler csg semantic parameter type drift`（lowering_plan 域） |

### 交付与统计
- /tmp/oob_ab/schema_wall117e.patch（==schema_wall117e_r2.patch，单文件累积 +37/−3 两 hunk 区，vs HEAD 以当前树态生成，`git apply --check -R` 过；sha256=3829987e…d6da217）。轮次件：schema_wall117e_r1.patch（判词富化 +25/−1，sha256=345b6b29…f4e9b）。
- apply 前 git diff --stat（compiler_snapshot_schema.cheng）=0（文件进场上无 diff）→ apply 后 37 insertions(+), 3 deletions(-)。
- 车头 cheng_w117e sha256=2404e76982ba4379edb99e6e9848747624e02502ed16951ae5b2eed71017d2d0；烤机 kernel_driver_w117e b4b6eb334ce313e056f81c16eaeb6a2afff7c6556e1726d599046ac219c87938；kernel_driver_w117e2 20b24e5d6077d56a9d91b8a17f624a775eb82189ffc518fdbf00a8ad96f9e7cd。
- 零探针夹具（zz_probe_w117e.cheng 未建：富化判词一轮即取数）；主树仅 compiler_snapshot_schema.cheng 一文件在改；他人资产零触碰（zz_v6_w7.cheng、composition 系在途文件、primary_object_plan/typed_expr 等他线 M 态、user_path_gate.* 均未动）；未 git commit；烤机 2/3 轮。
