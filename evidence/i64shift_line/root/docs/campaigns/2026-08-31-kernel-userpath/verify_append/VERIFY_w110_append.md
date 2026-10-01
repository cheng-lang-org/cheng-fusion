# wall110.VERIFY

## wall110 报告：v6 `exact identity schema [freeze] op row=11 managed bind definition is broken` 墙死亡（exactDefIdentityStackLocalDefinitionValid 绑定门新增 CallOp 载体第三形精确 admit）——v6 判词从 exact_def_identity.cheng:193 推进至 `cleanup_cfg: managed definition ownership invalid`（cleanup_cfg.cheng:5276，授权面外）→ 撞契约边界停手完整移交

日期 2026-09-02。承接 wall108 小节移交（identity/freeze 批 3 绑定门第三形 admit）。授权面=src/core/analysis/exact_def_identity.cheng（唯一改动文件，烤机 1/3 轮）。

### 判定（本墙死亡，同域后续臂裁定完毕）
1. **病根与修法（按 w108 移交配方逐列落地）**：`exactDefIdentityStackLocalDefinitionValid`（:1552 起）绑定门载体白名单原只有 CopyLocal 绑定戳与 literalRoot（LoadConst+OwnPlain，str 槽过静态串校验）两形；非托管 call-result 的 OwnPlain+TypedExpr CallOp 载体（op11）撞 `!copyKind && !literalRoot` → `exactDefIdentityBindBrokenLine`（:193）。修法=[wall110] 绑定门新增第三形精确 admit（let `plainUnmanagedCallRoot`）：op.kind==CallTag ∧ operands.len==1（operands[0] 是 callSequence ordinal 非 slot 域，与 literalRoot 同族豁免 operand 槽域检查与 root 门）∧ op.target==slot ∧ origin==slot ∧ OwnPlain+TypedExpr+originId==semanticRow>=0 ∧ exprNode>=0 ∧ 借主三列/源对（DefinitionDomainInvalidTag+row==-1，与 bodyIrAccessDefinitionPairIsInvalid 同形）/consumeActionRow 全 sentinel ∧ 槽 Unmanaged+tid>=0——与 body_ir_access [wall108] 三 admit op 段同形联立自证。绑定门 fail 条件仅改 `(!copyKind && !literalRoot && !plainUnmanagedCallRoot)` 与 `(!(literalRoot || plainUnmanagedCallRoot) && operand 域检)`；source==-1 分支 root 门豁免同步 `!(literalRoot || plainUnmanagedCallRoot)`。非该形走原门原判词逐字节不变；无 sentinel 豁免、无计数门放宽、derive 零写；helper 提取禁区（[wall108r2] 警示同款）已锚注记。op.target/origin==slot 在 admit 联立与原门 fail 条件双覆盖（联立自证+原门复查）。
2. **墙死亡实证**：烤机驱动 kernel_driver_w110 编 v6 `managed bind definition is broken` 零出现（grep=0），exact_def_identity 域全绿——判词推进至 `cleanup_cfg: managed definition ownership invalid`（cleanup_cfg.cheng:5276）。identity 域内后续段（freeze 消费面 ExactDefFreezeIdentityConsumeEdgeAudit、槽循环倒排计数/partial authority/计数门、merge def-tuple 审）实测全部放行 op11，与 w108 移交预期一致（partial authority 计数门 w105 已实证 defs 0→1）。
3. **多臂裁定（同域后续臂：授权边界停手）**：新墙 `cleanupCfgValidateManagedDefinitionRow`（:5269）硬要求托管 def `valueDefOwnership ∈ {OwnMove, OwnBorrowShared}`，OwnPlain 即 fail——与 wall108 hunk3（body_ir_access VerifyManagedValueDefinitions 枚举门，已清）完全同构的 cleanup_cfg 侧镜像门（managed authority 终审 CleanupBodyIrManagedAuthorityFinalStrictValidate :5382 对一切非 OwnInvalid def 调用）。归因双证：该门 HEAD :5213 既有（非并行线中间态；git diff 无该判词相关行）；触发集=同一「非托管 call-result OwnPlain 纯值定义」形。**病根文件 cleanup_cfg.cheng 在本臂授权面外（cold_nested 并行线领地 w86r 系），按纪律停手移交**。移交修法方向（同 w108 hunk3 家族）：OwnPlain+TypedExpr 纯值定义全哨兵联立 admit（op 段 13 列与 body_ir_access [wall108r3] :4949-4966 逐列同形）后 continue/跳过该审，非该形走原判词 fail-closed。
4. **车头勘误**：任务书配方 `/tmp/oob_ab/cheng_final` 不存在（已被清理，ls 实证）；按重建配方仓库根 `clang -std=c11 -O2 -o /tmp/oob_ab/cheng_w110 bootstrap/cheng_cold.c` 重建（rc=0，warning 均冷链既有噪音），该车头含当前树态（wall108 已在树），v6 compile=0/run=0 语义参照达成（r=7/col.offset=8/arena.n=108 路径 rc=0）。

### 门禁与验收实况（cwd=仓库根，零抬帽，烤机 1 轮一次过）
| 门 | 结果 |
|---|---|
| 秒级门（cheng_w110 --emit:obj exact_def_identity.cheng） | rc=0 一次过 |
| 烤机 kernel_driver_w110（--driver cheng_w110） | rc=0，sha256=0319bda849c3ddf01a4da90ffc287ef000a495dcd12ad2db58cf5604497339d3 |
| **v6（zz_v6_w7.cheng）× 烤机驱动** | **compile rc=1，判词推进**：`cleanup_cfg: managed definition ownership invalid`（bind broken 判词零出现；RSS 未触帽） |
| ordinary（ordinary_zero_exit_fixture.cheng）× 烤机驱动 | compile=0 / run=0 不回归 |
| call_fixture（zz_call_fixture_w7.cheng）× 烤机驱动 | compile=0 / run=1 契约预期不回归 |
| 车头 cheng_w110 × v6 | compile=0 / run=0 语义参照保持（车头 sha256=40906659e9c2deaff80b4706ab9109af17f7b11b112f56ee58c9efc17a495a2c） |
| cold_nested | 未触碰（并行线领地，零涉入） |

### 移交（授权面外，撞契约边界停手）
- **病根位**：src/core/analysis/cleanup_cfg.cheng `cleanupCfgValidateManagedDefinitionRow`（:5269，HEAD :5213 即有）OwnMove/BorrowShared 硬门；调用面六处（:5414/:5759/:6012/:9750/:12513，含 CleanupBodyIrManagedAuthorityFinalStrictValidate :5382 终审循环）。v6 触发行=op11（非托管 call-result let 绑定，slot7，OwnPlain+TypedExpr 纯值定义）。
- **修法方向**：与 body_ir_access [wall108r3]（:4939-4967）同构 admit：`valueDefOwnership==OwnPlain ∧ OriginKind==TypedExpr ∧ OriginId==SemanticRow>=0 ∧ ExprNodeIndex>=0 ∧ BorrowOwner 三列 sentinel ∧ 源对 Invalid ∧ consumeActionRow==-1 ∧ 槽 Unmanaged+tid>=0` → 放行；两站点禁提取 helper（[wall108r2] 警示对 cleanup_cfg 按值形参调用点同样适用）。判词无富化列（单串），归因可复用 wall95 富化基建。
- **连锁预判**：该 admit 后 v6 下一门不可预判（cleanupCfgRequireExactManagedSlot :5415 与 TypedExpr authority 臂 :5281-5289 对 op11 形预期自洽——OriginKind=TypedExpr 时 ExprNodeIndex/OriginId==SemanticRow/源对 Invalid 均满足）。

### 交付与统计
- /tmp/oob_ab/identity_wall110.patch（== identity_wall110_r1.patch，vs HEAD 累积式含在树 w27/85/87b/91/104 hunks，495 行；sha256=890c687df82d1ebf6b92133c76785265287baa61110cd9424b298ea2ea104a32）。分文件（仅 exact_def_identity.cheng）：apply 前 +296/−48 前态=+296/−44，apply 后 +336/−48——本臂净归属 ≈ +40/−4（admit 块 + 两行 fail 条件 + 一行 root 门豁免）。
- 探针 zz_probe_w110.cheng 未创建（v6 夹具即单变量验证物，墙判词即实况）；编排者资产（zz_v6_w7.cheng、user_path_gate.* 工作目录）零触碰；未 git commit；主树仅动 src/core/analysis/exact_def_identity.cheng。
- /tmp/oob_ab/w110/：secsgate_w110.log、bake_w110.log、v6_head_compile.log、v6_compile_w110.log（终判词）、ordinary_compile_w110.log、call_compile_w110.log、tc.o、v6_head.exe、ordinary_w110.exe、call_w110.exe。
