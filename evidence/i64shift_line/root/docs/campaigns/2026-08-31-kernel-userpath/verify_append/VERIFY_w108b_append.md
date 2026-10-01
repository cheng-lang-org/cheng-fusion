# wall108b.VERIFY

## wall108b 报告：v6 `ingress BodyIR ownership invalid code=15 site=2 index=11 detail=1` 墙死亡定性（真凶=VerifyManagedValueDefinitions 托管 def 枚举门，非 decodeCallOrdinal else 臂）——墙由姊妹线 wall108r3/r5 同点位臂落地死亡；本线独立定性+全门验收零回归；判词推进至 exact_def_identity [freeze] 绑定门（授权面外完整移交）

日期 2026-09-02。授权面=src/core/ir/body_ir_access.cheng（任务书误标 backend/，该文件即 wall82/wall108 历线作业的同一文件）。

### 判定
1. **本墙已死（判定时点树态）**：r4 态驱动（kernel_driver_w108 ee239ab6…，21:02 烤）v6 判词=(15,2,11,1) 带 vd/槽全列富化；姊妹线 wall108 于 21:28 落 [wall108r3] 臂（/tmp/oob_ab/wall108_r5.patch，sha256=188b9210cf99f9ae2c8693c321792edc84584fb9456dcb3a4826f7f1763c4d3b）+21:32 重烤（65021aa4b1f7c47da9212f70ebed7c97aff816df3a82a013c82424a8f84baeee）后，v6 判词推进为 `cheng_cold: exact identity schema [freeze] op row=11 managed bind definition is broken` + `primary exact def freeze validate rejected fn=2 ops=12 slots=13 …`。
2. **真凶定性（本线静态定性在先，r5 落地点位即证）**：(15,2,11,1) 的产生点=`bodyIrAccessVerifyManagedValueDefinitions` 托管 def 枚举门（body_ir_access.cheng :4939 区 `!=OwnMove && !=OwnBorrowShared` 即 `fail(detail=int32(valueDefOwnership)=1)`），**非** decodeCallOrdinal else 臂 :1693（detail 同=int32(vd_own)，两出口判词四元组全同构，文本不可分辨）。证据链三条：①r5 diff 仅在 :4939 门前插 OwnPlain 纯值定义 admit 臂（全哨兵联立+槽 Unmanaged+tid>=0 → continue），decode 侧对 r4 零改动而判词推进 ⇒ r4 时代 decode admit 已放行 op11、真门在 verify 段；②本线 lldb 实证（ASLR off，map offset 0x3321d0 断点 bodyIrAccessFail）：r5 驱动编 v6 全程断点**零命中** ⇒ 整个 BodyIrAccessDecode 无任何 fail 出口；③静态：call 行九哨兵列=BodyIRApplyCallOpDefaultProof 默认（core_types.cheng:8377）+ 发射器 PrimaryBodyIrExactStatementCallResultOwnership 对非托管形恒 -1/OwnInvalid 零覆盖 + semanticCallExprNodeIndex 是独立列（LoweringBodyIrBindCanonicalCallIdentity:23723 只写该列）⇒ decode admit 联立条件对 op11 形全真。推论：r1/r2 时代「helper 提取致 admit 翻 false=编译器缺陷」的 [wall108r2] 警示注记存在更优解释——decode 侧任何变体都改不动 verify 段的门，r2/r4 判词本就必然收敛同文；该注记的两站点禁止共享 helper 约束维持原样，缺陷嫌疑按本线证据降权存档。
3. **后继墙定性（freeze，授权面外）**：verdict 出口=exact_def_identity.cheng:1590 `exactDefIdentityStackLocalDefinitionValid` 绑定门（:1585 `(!copyKind && !literalRoot) || op.target != slot || origin != slot …`）：o11 k=2(Call)/vdo=1(OwnPlain)/opk=2(TypedExpr)/oid=7/src=-1，非 CopyLocal 非 LoadConst literal root → BindBroken(op=11)。修面=exact_def_identity.cheng STACK_LOCAL 臂补 OwnPlain+TypedExpr+CallOp 纯值绑定 admit（wall106 小节「批 3 def-tuple 审对 Plain+TypedExpr+CallOp 形覆盖核查」预告命中）；下游还需核 partial definition tuple/freeze 批 3 元组审同形覆盖与 v6 outer/main 未至领域。

### 验收（本线电池，cwd=仓库根，零抬帽；驱动=65021aa4 r5 态起止 sha 一致=窗口静置；车头=cheng_w108b db6e7657d396af55513de4134a33b9f6e48315cd7d7b3b1a510246d37f2ab579，clang rc=0，13 警告全既有 format 类）

| 门 | 结果 |
|---|---|
| v6 × 65021aa4 | compile rc=1，**本墙死亡确认**：判词含 `ingress BodyIR ownership invalid` **0 次**，推进为 freeze 绑定门判词（判定 3） |
| ordinary × 65021aa4 | compile 0 / run 0 不回归 |
| call_fixture × 65021aa4 | compile 0 / run 1 契约预期不回归 |
| 车头 cheng_w108b × v6 | compile 0 / run 0（run 空 stdout，与 w106/w108 基线逐位同形） |
| 秒级门（cheng_w108b --emit:obj src/core/ir/body_ir_access.cheng） | rc=0 |
| 租约 | w107b（call_fixture/ordinary）与 w108（验收循环）同窗，25s 退避串行全消 |

### 交付与边界说明
- **本线主树零变更**：授权文件在本线定性期间被姊妹线 wall108 活跃作业（21:28 落臂、21:32 重烤、21:4x 验收循环），为守同文件单写者纪律本线不动该文件。本墙修法载体=/tmp/oob_ab/wall108_r5.patch（[wall108r3] 臂），非本线产物，如实归属。
- /tmp/oob_ab/wall108b.patch=0 字节（零 hunks，sha256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855）；git diff --stat 本文件 apply 前后不变=+161/−17（全为 wall108 历线归属，本线 +0/−0）。
- 本线证据 /tmp/oob_ab/w108b/：v6_now6_compile.log（墙复现，20:43 态）、lldb_probe.log（断点零命中+freeze 判词首发）、accept_w108b.sh+五步电池日志、秒级门日志。
- 探针未建（v6 夹具即单变量验证物；zz_probe_w108b.cheng 未创建）；未 git commit；编排者资产（zz_v6_w7.cheng、user_path_gate.* 工作目录）零触碰。
- **遗留移交**：freeze 绑定门墙（判定 3 全文，修面=exact_def_identity.cheng，授权面外；v6 全绿仅剩此域及后续 outer/main 未至领域）。
