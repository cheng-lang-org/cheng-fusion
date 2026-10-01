# STAGE0 候选集与段 1 叠序（Leader 汇总，2026-09-15T10:18Z，绑 HEAD 60e37f0e）

## 段 1 可用候选（apply 实测）
| 墙 | patch | 文件 | numstat | live-tree 叠 |
|---|---|---|---|---|
| A1 | `stage0_A1_20260915T101349Z.patch` | `bootstrap/cheng_cold.c` | 545/31 | ✓ |
| W3 | `stage0_W3_20260915T101535Z.patch` | `src/core/lang/typed_expr.cheng` | 9/0 | ✓ |
| W8 | `stage0_W8_20260915T101752Z.patch` | `src/core/lang/typed_expr.cheng` | 11/0 | ✓ |
| W9 | `stage0_W9_20260915T101456Z.patch` | `src/core/tooling/compiler_csg.cheng` | 6/0 | **已在活树未提交**（勿重复叠） |

- `git apply --check A1 W3 W8` 与逆序均 **rc=0**（实测）。
- W1(`stage0_W1_…`) **不进叠集**：修复 `2a049ccd3` 已在 HEAD。
- W9 的 share 臂已在活树 `compiler_csg.cheng:8611-8616` ⇒ **若以活树起烤**：只叠 A1+W3+W8；**若以 HEAD/冻结快照起烤**：再叠 W9（否则 P1 复发）。

## 段 1 起跑前的硬前提
- 冻结：锁不在 + `a7_preconditions.sh` FREE + 无他线编译。
- **树的定义必须钉死**：活树（含 W9 share 臂 + 他线 WIP）还是 HEAD 快照。RFC：以活树为基准并先把 W9 share 臂提交/冻结，否则「一棵树」不可复现。
- 内核脚本版本 sha（`canary_r9.sh`/`b19_gate_r9_t3000.sh`）见 `stage1_runbook_20260915T101130Z.md`。
