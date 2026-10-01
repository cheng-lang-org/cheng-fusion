# STAGE0-B22 Leader 裁定（2026-09-15T10:19Z，绑 HEAD 60e37f0e）

## 复核
- patch `stage0_B22_20260915T101925Z.patch` sha16 `5d72f5af51c9c347`；numstat `1 1 src/core/lang/parser.cheng`；fwd=0 / `-R`=1；`patch_preflight.py` PASS (`ann=0 displaced=0 wedged=0`)。判点处 `:37432 entry.sourcePath = sourcePath`（`ParserSourcePathIndexBuild`）改为 `strings.CloneStr(sourcePath)`。
- 夹具 `b22_index_key_alias_shape.cheng`、`b22_orc_borrow_passthrough_minimal8.cheng` 在位。
- `parser.cheng` 活树 sha `e6444375…` = 基线；`git status` = ` M`（他线 WIP）。

## 裁定
1. **条件接受，且不进「活树叠集」**。两条硬理由：
   - 落点 `parser.cheng` 是 **单写者热文件**（§3.2 L2↔L3），当前 ` M` 他线 WIP ⇒ 叠它必须先完成**领地移交**，否则重演 A.7 双写。
   - worker 自标 **点名机制未实证**：share/by-value move 是否真失 retain 取决于 C 链 codegen，源码侧 `CloneStr` **可能只是绕过**，不是 ORC 双释放的根修。在未定谳前叠进段 1 会把一个未证机制混进「一次烤」的因果里。
2. **依赖 B23 首释放者定谳**（`.rebuild/b23_line/` 在飞）：指向 share/move 未 retain 才采用本 patch 边界；否则本墙保持 open。
3. 本墙判点（供内核线）：唯一吐出 `program_support_backend.cheng:6291`（`:6285` 定义、`:6391` 唯一调用；判据 `:1712`；释放位 `:7245`）；报告者第二释放 = `typed_expr.cheng:49897 TypedExprClearSourceContextAllFields` 的 `moduleConstLookup:49953`/`moduleConstNames:49954` drop。

## 状态
- **零编译未验**（4 条 UNVERIFIED 见回执）。不纳入段 1 叠集，直到领地移交 + B23 定谳。
