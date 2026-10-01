# wall117f.VERIFY

## wall117f 报告：cold_nested `primary: managed BodyOp non-parameter borrow owner requires immutable semantic index site=c` 墙死亡（primary_object_plan.cheng 单文件单臂：①site=c 判据富化 def 行+定义节点全列 + ③[w117f] 不可变 Owned 托管形参自根镜像臂（参数原点 ∧ Owned ∧ ParamRef ∧ parser=-1 ∧ synthetic=Parameter ∧ span=NoSource ∧ managed=1 ∧ paramMutable=0 全联立）恢复发布契约自根拼写流入 entry-slot 权威臂 + site=a 参数借主权威对 Owned 形参双形放行）——cold_nested 判词推进至 `ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=12 detail=14`（body_ir_access.cheng 域=授权面外，停手完整移交）；ordinary 0/0、call_fixture 0/1 零回归；车头四门全过（v6 0/0、cold_nested 0/0 pass、ordinary 0/0、call_fixture 0/1）；v6 驱动只记录（lowering_plan 域判词，与 w117d/w117e 同点，并行线在先）；烤机 2 轮（轮1 死于在途脚本旗标失配如实入账+轮2 过）

日期 2026-09-03。授权面=src/core/backend/primary_object_plan.cheng（唯一）。进场时该文件工作树零 diff（w17/23/33/35/60/65/70/74/80/92 hunks 均已提交在 HEAD，实测 `git diff` HEAD 态 rc=0 逐字节一致）。本臂净变更=该文件 +111/−9。

### 判定与机理
1. **①判词富化（site=c，永久在树）**：原判词六列（node/def_row/def_origin/def_own/owner_row/owner_node）扩为全列（wall65 三站点富化先例同款）：新增 def_owncol、def_node_op（OpKindText）、def_node_class、def_node_managed、def_node_proof、def_node_parser、def_node_synthetic、def_node_span、def_node_param_slot；def 节点越界时节点侧列取 -2 哨兵。守卫判定零改动，原文本作前缀 grep 仍命中。本臂烤机一轮即过，富化列未触发（下臂可复用）。
2. **②定性（typed_expr 发布契约三处联立，源证据链）**：①typed_expr.cheng:6102-6112 借主列只在 `managedFlag && ownership==Borrowed` 时盖章 → 不可变 Owned 行列恒 -1；②typed_expr.cheng:5935-5962 `typedExprIrParameterDefinitionOwnershipExact`：ParamRef 节点恒借视（非 Borrowed 即 panic），可变/@borrows 形参定义=Borrowed，**不可变托管形参定义=Owned**（不可变且非托管直接发布端 panic → Parameter∧Owned 行契约保证 managed=1、paramMutable=0、定义节点=ParamRef、parser=-1、synthetic=Parameter、span=NoSource，TypedExprIrAddParamNode 唯一拼写）；③typed_expr.cheng:5841-5876 `typedExprIrCanonicalBorrowOwnerForDefinitionRow`：**Owned 行返回行自身为 canonical 借主权威**。实测 w117e2 判词 `site=c node=4 def_row=0 def_origin=1 def_own=1 owner_row=-1 owner_node=0`：def_row=0=nestedFmt `name: str` 首形参行，Shared 借视 BodyOp 的借主列缺席=发布契约形，primary 无臂 → 本墙。w65 镜像臂只救 Borrowed var 视图参数（managed=0 族），不可变 Owned 托管形参（managed=1 族）无臂。
3. **③修法（方案①，primary 领地内，契约对齐零弱化）**：单文件三 hunk。（a）[w117f] 自根镜像臂：列缺席 ∧ 参数原点 ∧ Owned ∧ 定义节点指纹全联立（ParamRef ∧ parser=-1 ∧ synthetic=Parameter ∧ span=NoSource ∧ managed=1 ∧ paramMutable=0；proof 不约束=发布契约只要求 managed 行 proof≠None，随结构类别取 Scalar/ManagedValue/Reference/Sequence/Aggregate，硬编 Reference 会漏 `str` 类）时恢复发布契约自根拼写，流入既有参数借主权威臂（entry-slot 身份链原样：ParamRef+序数+entryParameterSlotIds+stackOffset 互证）；任一列不符仍走富化 site=c，fail-closed。（b）site=a 放行：参数借主权威对 Owned（不可变托管形参）与 Borrowed（var/@borrows 自根）双形放行，Unmanaged 等仍拒；身份链零触碰。（c）w65 镜像臂、site=b、BodyOp 权威扫描臂、OwnMove 臂逐字节未动，原放行集零扩大（本臂只放行发布 canonical 裁定合法形）。
4. **④验收（kernel_driver_w117f）**：本墙死亡——cold_nested compile 判词 `site=c` grep=0、`producer authority drift` grep=0，推进至新墙（见移交）；ordinary 0/0、call_fixture 0/1 不回归；车头四门全过；v6 驱动同旧判词（并行线在先只记录）。
5. **下一墙（授权面外，停手完整移交）**：cold_nested 新判词=`ownership body ir production: ingress BodyIR ownership invalid code=15 site=2 index=12 detail=14 fn=0 op_kind=14 op_target=14 … vd_slot=14 vd_own=3 vd_row=0 vd_node=4 vd_origin=1 vd_origin_id=0 bo_row=0 bo_domain=1 bo_def_row=0 …`。发射链=src/core/analysis/ownership_body_ir_production.cheng:1344（[wall82] 富化包装）← src/core/ir/body_ir_access.cheng `BodyIrAccessDecode` → `bodyIrAccessVerifyManagedValueDefinitions`（:5116 起）。**精确死点**：EntrySlot 借主臂（:5247 区，[wall82] 注释块）：`typedBorrowOwnerValid = ownerOwnership == OwnBorrowShared(3) || ownerOwnership == OwnBorrowUnique(4)`；而不可变 Owned 托管形参的入口槽盖章 **OwnMove(2)**（入口自持来值；ownership_body_ir_production manualConsume 臂同以 entryDefinitionOwnershipKinds==OwnMove 为 owned 入口形）→ 本臂产出的合法形（FieldLoad Shared 借视 def_row=0 `name: str`，bo_domain=1 EntrySlot，bo_def_row=0）被拒 → 联合 fail（detail=valueDefSlot=14，index=defOpIndex=12，逐列与实测吻合）。契约权威=typed_expr canonical 裁定 Owned 行自身即借主权威。修面候选=body_ir_access.cheng EntrySlot 臂对 `ownerOwnership==OwnMove` 补 admit（ownerSemanticRow==bo_row 恒等校验与 return 边逃逸守卫保留）+ 必要时 production 盖章端联立定性。**body_ir_access.cheng 不在 w117f 授权面（主树只许改 primary_object_plan.cheng）→ 停手**。另：树内现存 `src/core/ir/body_ir_access.cheng.rej`（未跟踪，他线历史补丁 apply 残留），下臂进场前宜先与编排者确认。
6. **v6 驱动只记录**：v6 × w117f compile rc=2，判词=`lowering plan: compiler csg semantic parameter type drift function=addCol line=30 index=0 expected=@borrow:Box actual=Box`（lowering_plan.cheng 域，与 w117d/w117e 记录同点，v6 线并行领地在先，零触碰，非本臂回归）。

### 门禁与验收实况（cwd=仓库根；RSS 零抬帽）
| 门 | 结果 |
|---|---|
| 车头重建（在途 bootstrap/cheng_cold.c:108660 fexecve 未声明，与 w117e 同点归因） | 降级 HEAD 提取件 clang -std=c11 -O2 -I bootstrap rc=0，cheng_w117f sha256=43aecbfc…9049f21bbf7，size 3310456 |
| 秒级门 primary_object_plan.cheng --emit:obj | rc=2 死于 src/core/backend/codegen_a64_fill_units.cheng:9 既有缩进缺口（w60 归档、w65 战报同款归档；该文件 HEAD 原态 git status 零 diff；本文件改前态与 HEAD 逐字节一致已证；死因仅指该文件 a64fill.PrimaryBodyIrFillInlineSha256x3Block 缺体，零新增死因；主文件直门被该既有缺口所阻系 HEAD 既有事实） |
| 车头 × v6（冷链门） | compile=0 / run=0 |
| 车头 × cold_nested（语义参照） | compile=0 / run=0 输出 cold_nested_fmt_interpolation=pass |
| 车头 × ordinary / call_fixture | 0/0、0/1 契约预期 |
| 烤机轮1（工作树脚本+工作树 manifest） | rc=2 死：在途脚本新增 `--composition-manifest:` 旗标，HEAD 冷编译器不认（composition 线两头在途）；按 w117e 配方降级 HEAD 脚本（ROOT 修正）+HEAD manifest |
| 烤机轮2（HEAD 脚本+HEAD manifest+CHENG_COLD_OBJECT_CACHE_ROOT=/tmp/oob_ab/w117f/cold_cache） | rc=0，kernel_driver_w117f sha256=83018c7f…cfffcd7a，size 186022288 |
| cold_nested × w117f | compile rc=1 `site=c` grep=0 ∧ `producer authority drift` grep=0 → 推进 `ownership body ir production: ingress … code=15 detail=14`（本墙死亡判词推进） |
| ordinary × w117f | compile=0 / run=0 不回归 |
| call_fixture（zz_call_fixture_w7）× w117f | compile=0 / run=1 契约预期不回归 |
| v6 × w117f（并行线在先只记录） | compile rc=2 `lowering plan: … parameter type drift`（与 w117e2 同点） |

### 交付与统计
- /tmp/oob_ab/pop_wall117f.patch（==pop_wall117f_r1.patch，单轮收敛，152 行，单文件累积 vs HEAD 以当前树态生成，`git apply --check -R` 过；sha256=a48afdb791cd10ee5ef7fe0a935ace115214cc7f13145d0051d48993a089d89f 两件同值）。
- apply 前 git diff --stat（primary_object_plan.cheng）=0（文件进场上零 diff）→ apply 后 111 insertions(+), 9 deletions(-)。
- 车头 cheng_w117f sha256=43aecbfc09962cf2ce861c9faf838118cc0dba8e65a8312d200259049f21bbf7；烤机 kernel_driver_w117f sha256=83018c7f95eb04b50b20e2e3ff5aad3397d5e9081a9c64e0dce37ecfcfffcd7a。
- 零探针夹具（zz_probe_w117f.cheng 未建：源证据链+富化判词一轮即收敛）；主树仅 primary_object_plan.cheng 一文件在改；他人资产零触碰（zz_v6_w7.cheng、在途 cheng_cold.c/build_kernel_driver.sh/kernel_manifest.cheng、body_ir_access.cheng(.rej)、typed_expr 等均未动）；未 git commit；烤机 2 轮（预算≤3）。
