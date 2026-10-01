# 子代理并行工作流协调清单（2026-08-22）

## F3 机制完全解码（2026-08-22 07:45）

**触发链**：system-link/parse 读取缓存 csgc 对象 → `csgc_mapped_reader.CsgCoreCsgcMappedSessionOwnerBegin`（csgc_mapped_reader.cheng:1379，设计要求「先于一切托管分配」且 close 时全排空）→ 会话内分配全部打 ledger 标记（`cheng_malloc_locked`:5244-5253，owner 活跃即走 ledger 分配）→ **会话关闭后**下游 seq/str 增长 realloc 残留缓冲 → `allocation_ledger_realloc_without_active_owner`（:5368）。

**本质**：会话生命周期 vs 缓冲生命周期耦合——session close 要求全部排空，但 close 后仍有代码持有并增长会话期分配的缓冲。修复方向（CSG 域所有者裁决）：① 会话存活期延长至覆盖全部使用点 ② close 前迁移缓冲出会话 ③ 下游改持非会话分配。

**最小复现**：`type\n    P =\n` 4 行文件（任何触发该解析路径的文件）。
**受影响面**：所有含此解析形态的文件在 driver/checker 中的 parse。

## 隔离基础设施（消除共享 store 竞争）

每个子代理 lane 用独立工作区副本，编译/烤制/探针全部 `--root:<副本>`：

```bash
tools/lane_workspace.sh create <lane-name>   # APFS clone，16 秒
LW=$(tools/lane_workspace.sh path <lane-name>)
cd "$LW"
# 全部命令 --root:"$LW"，副本内 driver/artifacts/store 完全独立
tools/lane_workspace.sh drop <lane-name>     # 结束后回收
```

已验证：副本内 fresh genesis 编译可用，主仓 store 零共享（2026-08-22 verify1 实测）。

## 战线包（按阻塞面排序）

### F0 当前墙图快照（2026-08-22 07:10，driver e64c01ba + 源 06:59）
- sha256.cheng：字段行无主 Statement（stmt_begin_diag span_start=14566=`block: Bytes` 行）——F1 正面
- path.cheng：✅ 已绿（derefs→load 迁移 + 通配符契约化生效）
- rvenc/integer program：✅ admission 绿；obj 路径卡 F2 lifecycle 记账
- backend2/esp32s31：snapshot builder retained-facts drift——lane 正在编辑 compiler_snapshot_builder.cheng

### F1 parser 多行 type 块字段行生产上下文
- **阻塞面**：encode smoke 闭包（sha256/elf_riscv32/path 全部含多行 type 块）
- **最小复现**：`type\n    P =\n` → ArenaArrayInt32Add 无界增长至 768MiB → ledger/mmap abort；带字段体 → 后续字段行 owner=-1 Statement
- **热栈**：ReadTreeFromTextMode(25596) → ProcessTypeDeclarationRangeInto(22421) → AppendTypeSyntaxNode(16827) → ArenaArrayInt32Add
- **切入点**：ReadTreeFromTextMode 对空 RHS 入口行的进度守卫 + 后续字段行与首字段相同的 owner 建立路由
- **文件**：src/core/lang/parser.cheng（25596 起的 ReadTreeFromTextMode 主循环）
- **完成判据**：admission_check 对 sha256/elf_riscv32_writer/path.cheng 全绿

### F2 obj 路径 lowering 墙链
- **阻塞面**：四路探针的 integer program（解析过后的第一堵）
- **当前墙**：`compiler csg transfer receipt underflow`（lane 副本 fresh store 下）与 `terminal storage release incomplete lifecycleClosed=0 releasedBuf=20≠initBuf=22`（主仓累计 store 下）交替出现
- **已证结论**：物理释放完成（retained=0），纯记账/转账凭证问题；Begin 捕获 init 后流程继续分配新 buffer，完整 Record 必 overflow
- **文件**：src/core/backend/lowering_plan.cheng（25655 起 AfterPrimary/terminal）、compiler_csg transfer 凭证链
- **完成判据**：primary+riscv64 obj rc=0 且 report 无 error

### F3 wildcard 下游 ledger owner
- **阻塞面**：含 `let _ = ...` 丢弃绑定的文件（path.cheng 等）在 production 布局后
- **最小复现**：path.cheng 全文 parse → `allocation_ledger_realloc_without_active_owner`（program_support_backend.cheng:5368）
- **机制**：ledger-tagged buffer 在无活跃 owner 线程被 realloc；RuntimeAllocationLedgerBegin 仅 csg CLI 调用，system-link 流程无 owner 包裹
- **文件**：src/core/runtime/program_support_backend.cheng（5344 起 realloc 检查）+ 调用侧 owner 包裹点
- **完成判据**：path.cheng parse 无 ledger abort

### F4 准入违规分类收敛（654 清单）
- **前置**：F1 完成后重跑 sweep（当前清单受 parser WIP 影响有误报成分）
- **已知真违规类**：ZRPC 裸指针 122 处、invalid @borrows 31 处等
- **工具**：/private/tmp/admission_check_stable（6.5MB 静态）+ tools/admission_sweep.sh

## 串行约束

- parser.cheng / lowering_plan.cheng / compiler_csg.cheng 为多 lane 热文件：编辑前确认 mtime 静默 ≥30 分钟
- 主仓 artifacts/backend_driver/cheng 为公共烤件：重烤前确认无进程且 mtime 静默
- 各 lane 的源码修改通过统一 diff 落回主仓（lane 副本内 commit 不可用——.git 未复制）