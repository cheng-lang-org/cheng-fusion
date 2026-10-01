# wall111.VERIFY

## wall111 报告：cold_nested `ingress BodyIR ownership invalid code=15 site=2 index=4 detail=4 fn=1 op_kind=9(CopyLocal) vd_own=3(BorrowShared) bo_domain=2 bo_def_row=3` 墙死亡——定性=decode 入口 managed CopyLocal 门只认 OwnMove，而 `PrimaryBodyIrMaterializeManagedBorrowedNodeValueExact`（`#nev{n}#borrowed` 借视物化）合法盖 TypedExpr+OwnBorrowShared+借主三列权威戳且 verifier 侧本就有该形完整权威路径（唯 decode 缺 admit 臂）；修法=fail 条件收窄 + 十一列 borrow 形联立 admit（fail-closed 零弱化）；一烤穿墙；判词推进至 primary 发射器既有 poison bail（`bail_63` 裸 void call 语句，primary_object_plan.cheng 授权面外，停手完整移交）；ordinary 0/0、call_fixture 0/1 不回归，v6 只记录（判词变化归因并行线动树，本臂零触发已证）；烤机 1/3 轮

日期 2026-09-02。授权面=body_ir_access.cheng（任务书标 backend/ 系 wall108b 已记录的历史误标，实际路径 src/core/ir/body_ir_access.cheng，即 wall82/wall108 历线同一文件）。主树实际只动该文件。

### 判定（定性唯一收敛 + 修法）

1. **病根门与判词逐列钉死**：`bodyIrAccessDecodeLocalCopy`（body_ir_access.cheng :2035 区）managed CopyLocal 门原形 `op.kind==CopyLocal ∧ (sourceManaged∨targetManaged) ∧ (!sourceManaged ∨ !targetManaged ∨ valueDefSlot!=target ∨ valueDefOwnership!=OwnMove)` 即 fail(detail=op.target)。判词 `detail=4=op_target=4` 吻合该门（CopyCompatible 门同为 detail=op.target 但对 slot0→slot4 双 str 已放行；arity 门 detail=1 排除）。dump 实况：op4 CopyLocal target=4←slot0，双端 mg=2（托管 str，tid 同 13），vd_slot=4==target，vd_own=3(BorrowShared)≠OwnMove → 第 5 析取命中。
2. **发射点（树内既有 def）**：`PrimaryBodyIrMaterializeManagedBorrowedNodeValueExact`（primary_object_plan.cheng :17915 区）对非参数非全局源的托管借视物化发 CopyLocal（`#nev{node}#borrowed` 槽），经 `PrimaryBodyIrPrepareManagedBodyOpValueDefinitionExact`（:17740 区）逐列盖戳：valueDefOwnership=BorrowShared、originKind=TypedExpr(1)、originId==semanticRow(8)、exprNode=22、借主语义行=8、借主定义对=(BodyOp,3)（借主权威行的唯一 OwnMove 定义 op，发射前扫描+重复即 panic）。wall107b 新戳（CallTag/OwnMove/借主全-1）非此形，系树内既有发射在 derive 放行后首抵 ingress。
3. **verifier 侧既有权威路径（admit 不越权的关键）**：`bodyIrAccessVerifyManagedValueDefinitions` 对 typedOrigin+OwnBorrowShared def 本就有全套审：typedBorrowOwnerValid（借主序可解析+域双域分支：EntrySlot 借主所有权∈{BorrowShared,BorrowUnique}、BodyOp 借主所有权==OwnMove 或非消费 indexed-address+ownerSemanticRow==借主语义行+拒自身）、BorrowShared 尾=记借主序+consume_plus1 必须为 0 后 `continue`（无转移义务）。即 decode 门是全链唯一拦点。
4. **修法（联立扩广，零弱化）**：[wall111] 单 hunk（净 +38/−1）：门 fail 条件第 5 析取改 `op.valueDefOwnership != coreir.OwnMove && !borrowViewCopyAdmit`；`borrowViewCopyAdmit`=十一列联立（CopyLocal ∧ OwnBorrowShared ∧ originKind==TypedExpr ∧ originId==semanticRow>=0 ∧ exprNode>=0 ∧ 借主语义行>=0 ∧ 借主域∈{BodyOp,EntrySlot} ∧ `bodyIrAccessDefinitionPairShapeValid(借主对)` ∧ BodyOp 域拒自身（row!=opIndex） ∧ 源定义对 Invalid 哨兵 ∧ consumeActionRow==-1 ∧ consume_plus1==0）。借主对双域覆盖发射器两戳形（参数借主→EntrySlot / 非参数 Owned 借主→BodyOp，同域后续臂一并处理）。任一列不符走原判词原 detail 逐字节不变；借主权威序/语义行/所有权种类语义审仍归 verifier 独家，本臂只认戳形。无 helper 提取（[wall108r2] 警示同款）。
5. **门禁实况**：秒级门 `cheng_w111 system-link-exec --in:src/core/ir/body_ir_access.cheng --emit:obj` rc=0；车头（clang rc=0，13 warnings 全既有 format 类）× v6 复现件 compile=0、× cold_nested compile=0/run=0 输出 `cold_nested_fmt_interpolation=pass`（语义参照保持）。

### 门禁与验收矩阵（cwd=仓库根，租约零冲突，零抬帽，烤机 1/3 轮）

| 门 | 结果 |
|---|---|
| 烤机 kernel_driver_w111 | rc=0，sha256=bf6022495afa6ac69a2e35d845473fd3284bfdcc9d6799ea34fa3a99fff282fb，size 185364128 |
| **cold_nested × w111** | compile=1，**授权墙死亡**：`code=15 site=2 index=4 detail=4 op_kind=9(CopyLocal) vd_own=3` 全文零命中；regalloc ledger 期全绿（actions=155 emissions valid=1 words=104）；判词推进至 `ownership body ir production: ingress BodyIR ownership invalid code=1 site=2 index=6 detail=0 fn=1 op_kind=0 op_target=7 op_operands=3 a0=4 a1=63 a2=0 vd_*全哨兵`（=PrimaryBodyIrAppendInvalidOp poison 行，见移交） |
| ordinary × w111 | compile=0 / run=0 不回归 |
| call_fixture × w111 | compile=0 / run=1 契约预期不回归 |
| v6 × w111（只记录） | compile=1，判词=`cleanup_cfg: managed definition ownership invalid`（w108 期=[freeze] 墙）。归因：**非本臂**——本臂只可能把「原本 decode fail 的 borrow 形」变 pass，而 w108 期 v6 ingress 已全过（判词在 exact_def_identity [freeze]），v6 无该 fail 点 ⇒ 本臂对 v6 零触发；变化来源=并行线活跃动树（exact_def_identity.cheng mtime 22:00、cleanup_cfg.cheng mtime 22:41——后者在烤机 22:29 之后，中间态判词按并行须知静置归属并行线） |

### 移交下一臂（primary_object_plan.cheng 域，授权外停手）

- **cold_nested 新墙=树内既有 poison bail 首次被读**：夹具第 7 行 `echo("cold_nested_fmt_interpolation=pass")`（if-then 块内裸 void call 语句，stmt.kind=4=TypedExprIrStmtCall）在 primary_object_plan.cheng 语句行走器（:54860 区 else 臂）走 `PrimaryBodyIrAppendInvalidOp(bodyIR, stmt.lineNumber=7, stmt.kind=4, 63, 0)` → BodyOpInvalidTag op（op6：kind=0、target=lineNumber=7、operands=[4,63,0]，与判词 `op_target=7 a0=4 a1=63 a2=0` 逐列吻合）。该行在 w107b 期已存在（decode 在 op4 即死未读到 op6）；本臂放行 op4/op5 后 poison 行首抵 ingress code=1(UnknownOp) 引爆——ingress 拒收 InvalidTag 是 poison 的设计内响亮引爆点（:6389 注释自证 bail→BodyOpInvalidTag 族），admit 即降级兜底禁手。修面=为何该裸调用语句未满足 :54860 区节点路径前置条件而坠 else 臂（对照 C 车头同输入 compile=0/run=0：C 版该语句不 bail），属 primary_object_plan.cheng 授权面。
- v6 判词 `cleanup_cfg: managed definition ownership invalid` 归 cleanup_cfg/exact_def 领地并行线（其在树 diff +1292/−205 跨 3 文件），非本线产物。

### 交付与统计

- /tmp/oob_ab/wall111.patch（281 行，sha256=e4b11d7567ee7ad7c8eb48cc1447902cc6f5852ec2dc17c3aec325ec6b89d60b；单文件 src/core/ir/body_ir_access.cheng 7 hunk vs HEAD 累积式，含在树 w82/w108 既有 6 hunks；本臂净归属 1 hunk ≈ +38/−1 全带 [wall111] 标记；`git apply --check -R` 对当前树干净过，r1 往返正向 apply 逐字节 cmp 一致）。
- /tmp/oob_ab/wall111_r1.patch（54 行，sha256=7892519ba443ca4ed49ee212381a39d0a219ca3e29af2c00c5e894e7aed405cb；vs 编辑前树态净增量单 hunk）。
- git diff --stat（body_ir_access.cheng vs HEAD）：apply 前 +161/−17 → apply 后 **+199/−18**；本臂净归属 +38/−1。
- 车头 /tmp/oob_ab/cheng_w111 sha256=a13c6bbd7d8b63f5fd0b1bd646a61e6dfb9c9abee433e565a632aa4cb40f7ab0（cheng_final 现场不存在，按各臂先例自建）；烤机产物 sha256=bf6022495afa6ac69a2e35d845473fd3284bfdcc9d6799ea34fa3a99fff282fb。
- /tmp/oob_ab/w111/：accept_w111.sh、bake_w111.log、tc.log（秒级门）、v6_head_w111.compile.log（车头回归门）、cold_nested_head_w111.{compile.log,stdout,stderr}（车头语义参照 0/0 pass）、cold_nested/ordinary/call_fixture/v6 各 w111 compile.log+stderr+run、bia_pre/bia_post.cheng（r1 往返物证）、wall111_full_vs_head.diff。
- 探针 zz_probe_w111.cheng 未创建（cold_nested 夹具即单变量验证物，src/tests 零残留）；编排者 user_path_gate.* 工作目录未动；zz_v6_w7.cheng 未动未删；未 git commit；主树仅动 src/core/ir/body_ir_access.cheng；烤机 1/3 轮（一次成功）。
