# STAGE0-W9 Leader 裁定（2026-09-15T10:18Z，绑 HEAD 60e37f0e）

## 复核（逐项对原始件）
- patch `stage0_W9_20260915T101456Z.patch` sha16 `ed932273ab27c595`；`git apply --numstat` = `6 0 src/core/tooling/compiler_csg.cheng`；对**活树** `--check` **rc=1**（=同 hunk 已被他线未提交 WIP 占用）；`patch_preflight.py` PASS rc=0；夹具 `stage0_W9_share_arg_fixture.cheng` 在位。
- **HEAD vs 活树**（`compiler_csg.cheng:8608-8616`）：HEAD 无 share 豁免臂；**活树有** `if TypedExprStripVarType(fact.callCallee) == "share": ... return true`（mtime 09:55，未提交）⇒ **P1 修复只在工作树**。
- `git merge-base --is-ancestor dbf58b184 HEAD` rc=0 ⇒ P2 的 `memRefCount` 补登（B18）已在 HEAD。
- P3（`name=Result`）：`63f994180` 已裁定同族=源侧缺 `import std/result`；HEAD 的 234 源闭包内裸 `Result` 无 import 命中 = 0 ⇒ **HEAD 上不可复现**。

## 裁定
1. **P1 候选 patch 接受**（6/0，仅 `compiler_csg.cheng`，HEAD-basis apply rc=0、预检 PASS）；内容 = 在 range 豁免臂后加同构 share 臂，**0 放宽**。
2. **段 1 必须用「活树/含 share 臂」，不得用 HEAD 或旧快照烤 234 源**——否则 P1 必复发。
3. **W9 三判词所挂失败快照 `f45f5eda`/`a93f2df31`（09-14）均 HEAD 祖先**，落后于 B17–B21+R5+AR2 ⇒ §3.2 L6「五试五败、四类判词」**不是 HEAD 现状**，段 1 重烤后须整表刷新。
4. **零编译未验**：P1 运行时效果、P2/P3「HEAD 不成立」均为静态推断。
