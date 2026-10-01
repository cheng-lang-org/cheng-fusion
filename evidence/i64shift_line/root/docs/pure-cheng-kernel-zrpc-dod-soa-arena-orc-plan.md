# 纯 Cheng 编译器最小内核方案：DoD/SoA/Arena/ORC + ZRPC 无指针 + 无 C 冷链

> 2026-09-08 定稿。本文是「纯 Cheng 最小内核」在**数据布局、内存所有权、指针口径、
> C 冷链退出**四个维度的唯一权威方案；结构维度见 `docs/cheng-minimal-kernel-plan.md`，
> 资源维度见 `docs/selfhost-resource-plan.md`，闭环路线见
> `docs/pure-cheng-kernel-closure-plan.md`，总纲见 `docs/pure-cheng-kernel-master-plan.md`。
> 与分档冲突时：数据/所有权/指针/C 冷链以本文为准，结构/资源/闭环以对应分档为准。
>
> apply authority：`openspec/proposals/pure-cheng-minimal-kernel.md` + `task_plan.md` 战役 R + 本文。
> 执行门禁：`tools/zrpc_kernel_gate.py`（本文 §6）+ `tools/kernel_plugin_closure_check.py`
> + `tools/phase_arena_storage_contract_smoke.sh` + `tools/lifetime_*`/ORC 门 + `tools/ci_gate.sh`。
>
> **当前状态如实声明**：本文是**施工方案**，不是完成声明。2026-09-08 实测：
> kernel 闭包仍有 347 处 kernel_core+shared_format 指针/内存 API 违规（gate
> `--require-zero-kernel-core` RED）、9 处 C 冷链源码引用（gate `--no-cold` RED）、
> stage3 仍含 1,795 个 `_cold_` 符号、GEN2/GEN3 纯固定点尚未达成。任何一项
> 在对应门真实转绿前不得宣称完成。

## 0. 使命与 done 的唯一定义

把 Cheng 编译器收敛为**纯 Cheng 最小内核 + 按架构组合的代码生成单元 + 平台服务单元**：

1. **自举**：内核源集由纯 Cheng 驱动编译，连续两代原始字节固定点 `GEN2 == GEN3`，
   不同 inode、raw `cmp` 与 SHA-256 相等，绑定源码/编译器/工具三方哈希；全程
   768MiB 进程树守卫（Linux cgroup v2 精确 768MiB + Darwin 原生双口径）。
2. **数据**：内核所有 IR/表/索引采用 DoD + SoA 连续列存储，跨节点身份只用
   `int32` 行索引与不可变 CID；不得以对象裸指针或地址作为长期关联键。
3. **内存**：内核自身用 phase Arena 批量分配/整体 reset；语言托管值走 ORC
   （retain/release/move/borrow + canonical Ownership/Init/Drop IR）；
   验收 `alloc == free`、终态 `live = 0`、无 double-release。
4. **指针**：ZRPC（`zero_rawptr_production_closure`）口径下，内核闭包零指针
   类型/操作；FFI/平台边界只允许在**独立平台服务单元**内部按 `@abi_internal`
   收口，最终发布态连平台单元也迁到 `@ffi_handle`/SABI 影子桥接。
5. **C 冷链**：`bootstrap/cheng_cold.c` / `bootstrap/cold_parser.c` 只允许产
   GEN1 种子；GEN2 及之后的内核编译路径不得出现 `cc cheng_cold.c`、不得链接
   cold 对象、内核产物不得含 `_cold_` 符号；回执必须 `full_backend_codegen=1`、
   `cold_system_link_exec=0`。
6. **语言面**：四夹具 4/4（ordinary 0/0、call_fixture 0/1、cold_nested 0/0、
   v6 0/0）+ 正式语法探针棘轮不退化。

以上六条同时成立才叫「最小内核完成」；组合面/资源面/发布面另见总纲 §1。

## 1. 术语与硬口径

### 1.1 DoD（数据导向）

- 数据优先：先定表/列/索引/批次，再写控制流；遍历按列顺序，禁止对象图逐节点追指针。
- 热路径输入是 dense reader（列数组 + 行号），不是散列对象或指针链。
- 每个表有冻结 schema（列名/类型/宽度/行身份来源），schema 变化必须过合同 smoke。

### 1.2 SoA（结构体数组）

- 一个逻辑记录 = 多列数组的同一行号；列是 `int32[]`/`int64[]`/`str[]`/`bool[]` 等。
- 跨记录引用 = `int32` 行索引；跨模块/跨阶段引用 = `int32` 行索引 + 不可变 CID。
- 禁止：`ptr`/`T*` 字段、以地址为 key 的 hash、以对象身份做长期缓存键。
- 现有范式：`src/core/ir/compiler_dense_store.cheng`（1,026 行，函数表 SoA）、
  `src/core/ir/phase_arena.cheng`（1,154 行，Arena 表 + POD handle）。

### 1.3 Arena（阶段竞技场）

- 每个编译 phase 一个 `PhaseArena`；短生命周期 scratch、operand buffer、rewrite
  candidate 批量分配、phase 结束整体 reset；不逐对象 free。
- `PhaseArenaHandle` 是 POD capability：`(arenaId, generation, allocationIndex, offset)`，
  不是指针；跨 phase 不传递 handle，只传 `int32` 行索引或 CID。
- Arena 只负责**字节存储**；对象身份/所有权由 SoA 行身份与 lifetime ledger 证明。
- 报告必须含 `phase_arena_peak_bytes / reset_count / spill_count`；非预期 spill 即失败。

### 1.4 ORC（引用计数所有权）

- 语言默认 `MM=orc`：`str`、`seq`、`Bytes`、object/tuple/ADT/Result/Option、闭包捕获、
  `Arc` 均受管；`memRetain/memRelease` 只改 refcount，归零立即释放。
- 默认 move：赋值/传参/返回移动所有权；同线程共享用 `share`，跨线程用 `share_mt`/`Arc`；
  `var` 是可变借用，不逃逸、不转移所有权。
- 编译器生产 lowering 必须先落 **canonical Ownership/Init/Drop IR**：每个 place 有
  `Owned/Borrowed/Unmanaged` + `未初始化/部分初始化/move-out/escape` + `dropGlueId`；
  在 CFG 上做 fixed point/join；drop glue 类型驱动；cleanup edge 覆盖
  defer/return/break/continue/循环回边；overwrite 固定
  `retain(new) -> store -> release(old)`；`?` Err 路径、expr-stmt 临时、global assign、
  borrowed return retain、sret aggregate、thread/Arc 边界全部进同一 IR 与门禁。
- 编译器自身的大对象（CompilerCSG/TypedIR/BodyIR/PrimaryObjectIr/output buffer）
  走 Arena + 显式 lifetime ledger 事件；`alloc == free`、终态 `live = 0`。
- 禁止：手工 `cheng_seq_free`/`freeSeq` 作为生产释放主路径、启发式“像指针就 release”、
  以 RSS 下降当释放证据、名称白名单兜底。

### 1.5 ZRPC（零裸指针生产闭环）

规范名 `zero_rawptr_production_closure`，`enforce.mode=hard_fail`。禁用：

- 指针类型：`T*`、`void*`、`ref T`（托管 `ref object` 除外）、`ptr[T]`、`ptr`。
- 指针操作：`&x`、`*p`、`p->field`、`dataPtr/getPointer`、`ptr_add/load_ptr/store_ptr`、
  `copyMem/setMem/zeroMem`、`alloc/dealloc`。
- 用户源码与 `@importc/@exportc` 同口径，不提供 ABI 兼容开关；违规诊断携带
  `ZRPC`/`no-pointer policy`。

**唯一合法例外**：平台服务单元/FFI provider 内部按 `@abi_internal` 收口的 ABI 边界；
它必须：① 不在 kernel 闭包内；② 只通过版本化值合同与 kernel 耦合；③ 单独门禁
审计，基线只减不增；④ 发布态迁移到 `@ffi_handle`/`@ffi_map`/SABI 影子桥接。

### 1.6 无 C 冷链

- `bootstrap/cheng_cold.c`（118,114 行 / 5.1MB）与 `bootstrap/cold_parser.c`
  （96,087 行 / 4.3MB）只允许作为 **GEN1 种子**证据。
- GEN2 及之后：内核编译路径不得执行 `cc ... cheng_cold.c`，不得把 cold 对象/符号
  链进内核；产物 `_cold_` 符号数必须为 0；回执 `cold_system_link_exec=0`、
  `full_backend_codegen=1`。
- 内核闭包源码不得出现 `bootstrap/cheng_cold.c`/`cold_parser`/`_cold_` 引用
  （gate `--no-cold`）；cold 文件本身留在 `bootstrap/` 仅作历史种子，或发布后删除。

## 2. 当前状态审计（2026-09-08，仓库实测）

### 2.1 内核闭包

- `bootstrap/kernel_manifest.cheng`：37 个 `*_source` 条目，其中 35 个 `.cheng`
  根（kernel 30 + shared-format 5）。
- 从全部根按真实 `import` 图 BFS：**闭包 260 个 `.cheng` 文件，0 未解 import**。
- 归属表 `tools/kernel_plugin_attribution.tsv`：kernel/backend2 桶文件 → `kernel_core`；
  shared-format 桶 → `shared_format`；arch 桶 → `plugin`；`src/std/**` 与
  `src/core/runtime/**` → `provider`（平台/运行时边界）。

### 2.2 ZRPC 指针面（prescan 口径）

- 驱动入口闭包 230 文件（2026-09-08 复跑；2026-08-27 旧报告为 233），F3 ZRPC 形 407 处；其中 **内核闭包 390 处**：
  - `prefix-&` 117 处；
  - `ptr-in-sig-public` 107 处；
  - `ptr-in-sig-ffi` 166 处（FFI 声明，按 §1.5 属平台边界迁移面）；
  - `type-alias-star`/`prefix-deref-*`/`void*`/`ref-T`：**prescan 当前为 0**
    （2026-08-27 的 18 处高嫌疑星/解引用已清）；`decl-star` 4 处由 gate 另捕（§2.3）。
- 结论：prescan 口径的星/解引用族已收口；剩余是**前缀取址 + 签名 ptr**两族，
  集中在平台/运行时边界与少量内核核心文件；gate 另把 `decl-star`/`raw-memory-api`
  纳入棘轮（§2.3）。

### 2.3 指针/内存 API 棘轮（`tools/zrpc_kernel_gate.py` 口径）

内核闭包 260 文件，gate 共 **977 行**：

| 层 | 行数 | 主要类别 |
|---|---:|---|
| `kernel_core` | **319** | raw-memory-api 269、ptr-in-sig-ffi 14、prefix-& 13、ptr-call 8、cold-chain-symbol 8、ptr-in-sig-public 5、decl-star 2 |
| `shared_format` | **28** | ptr-in-sig-ffi 14、raw-memory-api 10、ptr-in-sig-public 4 |
| `plugin` | 2 | raw-memory-api 2 |
| `provider` | **626** | ptr-in-sig-ffi 138、ptr-call 120、prefix-& 104、ptr-token 100、ptr-in-sig-public 98、raw-memory-api 65、cold-chain-symbol 1 |
| `other` | 2 | decl-star 2 |
| **合计** | **977** | raw-memory-api 346、ptr-in-sig-ffi 166、ptr-call 128、prefix-& 117、ptr-in-sig-public 107、ptr-token 100、cold-chain-symbol 9、decl-star 4 |

- **kernel_core+shared_format = 347 行**（gate `--require-zero-kernel-core` 当前 RED）。
- kernel_core 头部文件：`body_ir_lifecycle.cheng` 242（全部 `cheng_seq_free`）、
  `path.cheng` 41、`host_pool_runtime.cheng` 8、`lifetime_ledger.cheng` 8、
  `gate_main.cheng` 5、`parser.cheng` 3、`typed_expr.cheng` 3、`compiler_main.cheng` 2、
  `compiler_snapshot_lowering_bridge.cheng` 2，其余各 1。
- shared_format 头部：`coff_object_linker.cheng` 12、`elf_object_linker.cheng` 10、
  `macho_provider_linker.cheng` 5、`coff_object_writer.cheng` 1。
- provider 头部：`system.cheng` 137、`held_exec_identity.cheng` 95、`os.cheng` 87、
  `os_host_process.cheng` 52、`hashmaps.cheng` 31、`rawmem_support.cheng` 28、
  `thread.cheng` 27、`arena.cheng` 26、`sha256.cheng` 25、`seqs.cheng` 20、
  `fs.cheng` 18、`strutils.cheng` 18、`atomic.cheng` 11、`rawbytes.cheng` 11、
  `handle_table.cheng` 8。

### 2.4 DoD/SoA/Arena/ORC 资产

| 资产 | 位置 | 状态 |
|---|---|---|
| SoA 函数表 | `src/core/ir/compiler_dense_store.cheng`（1,026 行） | 可用；需扩到全部 IR 表；仍含 `typeText=="ptr"` 类型标签 |
| Phase Arena | `src/core/ir/phase_arena.cheng`（1,154 行） | 可用；`PhaseArenaHandle` 已是 POD；是唯一目标 arena 面 |
| 原始 arena | `src/core/runtime/arena.cheng`（471 行） | **迁移对象**：`arena_rt_*`/`ptr` 签名 26 处 gate 行；注释已声明“无 Cheng 侧 `*` 解引用”，但 `ptr` 类型本身仍违规 |
| lifetime ledger | `src/core/tooling/lifetime_ledger.cheng`（657 行） | M1 独立可观测；**未接生产流水** |
| BodyIR 释放边界 | `src/core/ir/body_ir_lifecycle.cheng`（2,353 行） | 单一释放边界；**242 处 `cheng_seq_free`** 待迁 ORC drop |
| Ownership IR | `src/core/analysis/{ownership,borrow_checker,borrow_ir}.cheng`（138/307/133 行） | ghost/参考实现；**未接生产 lowering/codegen** |
| ORC 运行时 | `src/core/runtime/program_support_backend.cheng`（31,345 行） | retain/release/alloc/free/live 计数器与原子 RC 已在；生产 drop glue/cleanup 未闭合 |
| 释放边界 | `body_ir_lifecycle` + `lowering_plan` + `primary_object_plan` + `system_link_exec` | 多处分散 release/重复 release；见 `openspec/proposals/deterministic-memory-lifecycle.md` M1 审计 |

### 2.5 C 冷链现状

- `bootstrap/cheng_cold.c` 118,114 行 / 5.1MB；`bootstrap/cold_parser.c` 96,087 行 / 4.3MB。
- `artifacts/bootstrap/cheng.stage3`：**1,795 个 `_cold_` 符号**、815 处
  `cheng_cold|cold_parser` 字符串；`tools/bootstrap_from_cheng.sh` 以 stage3 为种子，
  而 stage3 本身是 C 冷链产物；纯 GEN2/GEN3 固定点不存在。
- 内核闭包源码仍有 **9 处 C 冷链引用**（gate `--no-cold` RED）：
  - `src/core/runtime/provider_root.cheng:14`、`src/core/tooling/bootstrap_contracts.cheng:109`
    —— 发现 `bootstrap/cheng_cold.c` 路径；
  - `src/core/tooling/compiler_main.cheng:2624`、`:4164` —— cold 路径与
    `cold_system_link_exec=1` 回执检查；
  - `src/core/tooling/compiler_runtime.cheng:253`、`gate_main.cheng:1825/:2636/:6760`、
    `src/core/tooling/root_discovery.cheng:12`【更正 2026-09-10 审计：点名文字 `cheng_cold`/`coldPath` 在 HEAD 该文件 0 命中（:12 现为 seed 路径），该锚点不可用、正确落点未定位；原文保留为历史证据】 —— cold 路径/`cc cheng_cold.c` 命令。
- 构建脚本（`tools/backend2_current_source_*`、`tools/beat_c_baseline.sh`、
  `tools/bootstrap_from_cheng.sh` 等）仍以 `bootstrap/cheng_cold.c` 为种子/对照；
  `ci_gate.sh` 的 `bootstrap-bridge` 仍走 stage0→3 的 cold 链。

### 2.6 现状结论

- **组合/结构面**：内核 manifest 与 per-triple 组合已成型；直接 arch 违规已清零；
  间接闭包与指针面是剩余主项。
- **数据/所有权面**：SoA/Arena 骨架已有，但生产 IR 仍大量 `cheng_seq_free`/raw copy，
  ORC Ownership/Drop IR 未接生产；这是 kernel RSS/正确性/768MiB 的根因之一。
- **指针面**：星/解引用已清；前缀取址与签名 `ptr` 两族 390 处（内核闭包）+ 平台边界
  626 处待迁；其中 kernel_core+shared_format 347 行是**最小内核阻塞项**。
- **C 冷链面**：源码引用 9 处、stage3 cold 符号 1,795、无纯固定点；C 冷链仍是唯一
  能工作的编译器，退出必须以 GEN2/GEN3 纯自举为前提，不能先删 C 链再补能力。

## 3. 目标架构

### 3.1 组合模型：kernel + platform provider + codegen plugin

```
composition root (per target)
  ├── kernel（arch-neutral：前端/中端/后端骨架/取件客户端/平台合同）
  ├── platform provider（darwin/linux；syscall/fs/thread/crypto/identity 的 ABI 实现）
  └── codegen plugin（aarch64/x86_64/riscv64；现有 codegen_contract 模型）
```

- kernel 只 import `platform_contract.cheng` 与 `codegen_contract.cheng` 两个版本化值合同；
  不 import 任何 `@importc` 平台实现、任何 arch 文件。
- platform provider 与 codegen plugin 是独立 composition root 的输入单元，可各自有
  `@abi_internal` 边界；kernel 闭包门禁不扫描 provider 内部，但 provider 必须过自己的
  指针基线门，且**不得反向 import kernel 私有表**。
- 这样把当前 provider 层 626 行指针/内存 API 移出 kernel 闭包，kernel_core 只需处理
  319+28=347 行中的核心部分；平台边界用值合同 + SABI 迁移，不污染内核。

合同草图（值语义、无指针）：

```text
PlatformBufferHandle = (arenaId:int32, generation:int32, allocationIndex:int32, offset:int32, len:int32)
PlatformCallRequest  = (opcode:int32, arg0:int64, arg1:int64, buffer:PlatformBufferHandle)
PlatformCallReceipt  = (status:int32, outValue:int64, outCid:str, outBuffer:PlatformBufferHandle)
CodegenRequestPlan / CodegenAction / CodegenReceipt 沿用 codegen_contract.cheng
```

kernel 侧只持有上述 POD/值结构；provider 内部把这些字段翻译成 syscall/FFI 参数，
`ptr` 只允许出现在 provider 实现体内。

### 3.2 数据模型：DoD/SoA

- 统一表身份：`<table>Row = int32`；跨表引用 = 行索引；跨阶段引用 = 行索引 + CID。
- 每张表由 `*Store` 结构持有列数组；列只允许标量/`str`/`bool`/`int32[]`/`int64[]`；
  禁止 `ptr`/`T*` 列。
- 迁移顺序（按依赖）：`compiler_dense_store` 扩为统一 dense reader →
  parser/typed_expr 的节点/边表 → `compiler_csg` facts 表 → `lowering_plan`/`primary_object_plan`
  → `backend2` canonical 表 → debug/receipt 表。
- 所有表 schema 落合同 smoke（列名/宽度/行身份/冻结标志），schema 变更必须过
  `compiler_dense_store_phase_arena_contract_smoke` 等现有门。

### 3.3 Arena 模型

- `PhaseArena`（`phase_arena.cheng`）是唯一生产 arena；`PhaseArenaHandle` 是 POD
  `(arenaId, generation, allocationIndex, offset)`。
- `src/core/runtime/arena.cheng` 的 raw `ptr` API 降为 **provider 内部**实现：
  kernel 只调 `ArenaRuntimeLoadU8/StoreU8/LoadU32/StoreU32(handle, offset)` 等
  值接口；runtime provider 内部可用 `@abi_internal` 的指针实现，但不得把 `ptr`
  暴露到 kernel 签名。
- 每个 phase 结束 `PhaseArenaReset`；跨 phase 只传行索引/CID；spill 必须报告并归因。
- `compiler_dense_store` 的列数组由 `PhaseArena` 承载；长生命周期列先计数再
  reserve/setLen，禁止热路径反复 `add` 扩容。

Arena 合同草图（kernel 侧只出现 handle/offset，不出现 `ptr`）：

```text
PhaseArenaHandle = (arenaId:int32, generation:int32, allocationIndex:int32, offset:int32)
ArenaRuntimeLoadU8(handle, offset) -> int32
ArenaRuntimeStoreU8(handle, offset, value)
ArenaRuntimeLoadU32(handle, offset) -> int32
ArenaRuntimeStoreU32(handle, offset, value)
PhaseArenaReset(arenaId) -> PhaseArenaReport
```

### 3.4 ORC 模型

- **语言层**：按 `docs/cheng-formal-spec.md` §0.1-0.3 与
  `openspec/proposals/deterministic-memory-lifecycle.md` M4：
  canonical Ownership/Init/Drop IR → CFG fixed point → 类型 drop glue →
  cleanup edges → 生产 lowering/codegen。未证明的类型/控制流 hard-fail，
  不允许“先不释放”或名称白名单。
- **编译器层**：大对象走 Arena + lifetime ledger；`body_ir_lifecycle.cheng` 从
  “242 处 `cheng_seq_free`”改为唯一 `BodyIrDrop`/consume 边界：
  - `cheng_seq_free` 的每处调用点改为 `drop`/`consume` 语义（move 进 drop helper，
    由 ORC/drop glue 递归释放嵌套 buffer/str）；
  - ledger 记录 `alloc/move/borrow/release` 事件；终态 `alloc==free`、`live=0`；
  - 失败/panic/早退出口统一 cleanup owner，删除重复 release。
- **运行时层**：`program_support_backend.cheng` 已有 `cheng_malloc/retain/release/
  registry/计数器`；补 drop glue 调用点与 `Weak[T]`/环收集按
  `openspec/proposals/orc-cycle-collector-weak.md` 另行推进（本方案只要求内核闭包
  的 ORC 计数闭合，不把环收集列为最小内核前置）。

### 3.5 ZRPC 无指针模型

- kernel 闭包目标：`--require-zero-kernel-core` 绿（kernel_core+shared_format 0 行）；
  最终 `--require-zero-closure` 绿（provider/plugin 也 0 行）。
- 替换原则：
  - 地址 → 句柄：`PhaseArenaHandle`/`@ffi_handle`/`DeviceBufferHandle`/`FileHandle`；
  - 裸 buffer → 值视图：`Bytes`/`BytesView`/`utf8_view`/`str`；
  - `ptr(&x)` syscall 参数 → `@ffi_map`/`@ffi_out_ptrs` + provider 内部物化；
  - 函数指针 → 函数值/`@ffi_handle` 回调句柄；
  - 原子 `&x` → `Atomic[T]`/`AtomicI32` 值 API；
  - `memCopyCompat(&x,...)` → 值赋值/SoA 列复制/`Bytes` copy；
  - `SystemPtrAdd(ptr(&arr), i*4)` → `arr[i]`/SoA 行访问器；
  - `cheng_seq_free(&seq)` → `drop(seq)`/`BodyIrDrop`（§3.4）。
- provider 边界允许 `@abi_internal` 的指针实现，但必须：文件在 provider 桶、
  有 conformance smoke、基线只减不增、发布前迁 SABI；kernel 合同层永不出现 `ptr`。

### 3.6 无 C 冷链自举模型

```
GEN0 = cc cheng_cold.c（仅种子，允许；记录 cold sha）
  → GEN1 = GEN0 编译 stage1_bootstrap.cheng（cold 路径，允许一次）
  → GEN2 = GEN1 编译 kernel 源集（纯 Cheng；full_backend_codegen=1, cold_system_link_exec=0）
  → GEN3 = GEN2 编译同一 kernel 源集（不同 inode；raw cmp + SHA-256 相等）
  → 发布：GEN2/GEN3 回执 + Linux cgroup v2 768MiB + Darwin 原生双口径
```

- 阶段 Z7 之前，cold 链只作为**开发车头/对照基线**；内核编译路径一旦进入 GEN2
  校验，`cc cheng_cold.c` 与 cold 对象必须从该路径移除。
- `bootstrap_from_cheng.sh` 改为消费纯 GEN1 种子（无 `_cold_` 符号）；
  `gate_main.cheng`/`compiler_main.cheng`/`compiler_runtime.cheng`/`root_discovery.cheng`/
  `provider_root.cheng`/`bootstrap_contracts.cheng` 的 9 处 cold 引用全部改为
  `pure_seed`/`stage1_bootstrap.cheng` 发现逻辑；cold 只保留在独立的
  `tools/legacy_cold_seed.sh`（不在 kernel 闭包/CI 主路径）。
- 新增 `kernel-no-cold` 门：源码 `--no-cold` + 二进制 `nm _cold_ == 0` + 回执
  `cold_system_link_exec=0 && full_backend_codegen=1`；任一红即 release RED。

## 4. 迁移替换表（按族）

| 族 | 当前代表 | 目标 | 主要文件 | 验证 |
|---|---|---|---|---|
| 手工 seq 释放 | `cheng_seq_free` ×242 | ORC drop/consume + `BodyIrDrop` | `body_ir_lifecycle.cheng`、`lifetime_ledger.cheng` | ORC alloc==free/live=0；对象字节不变 |
| raw 内存复制 | `memCopyCompat` ×多 | 值赋值/SoA 列复制/`Bytes` copy | `system.cheng`、`seqs.cheng`、`hashmaps.cheng`、`path.cheng` | SoA smoke；字节铁门 |
| 裸地址算术 | `SystemPtrAdd` ×18 | SoA 行访问器/`AtomicI32` 值 API | `system.cheng`、`path.cheng` | 原子/ORC gate |
| syscall buffer | `ptr(&buf)` 前缀取址 117 | `BytesView`/`utf8_view` + `@ffi_map`/`@ffi_out_ptrs` | `held_exec_identity.cheng`、`os.cheng`、`fs.cheng`、`host_pool_runtime.cheng` | provider conformance；四夹具 |
| 公共 `ptr` 签名 | `ParserWriteTextFast(outPtr: ptr)`、`path.cheng`、linker | `BytesBuilder`/`TextSink`/handle/receipt | `parser.cheng`、`path.cheng`、`coff/elf/macho_*` | `--require-zero-kernel-core`；compile-fail 夹具 |
| FFI `ptr` 签名 | `ptr-in-sig-ffi` 166 | `@ffi_handle`/SABI 影子桥接 | provider 单元（移出 kernel） | provider gate 基线只减；ZRPC FFI 夹具 |
| 原子取址 | `atomicLoadI32(&x)` | `Atomic[T]`/`AtomicI32` 值 API | `atomic.cheng`、`handle_table.cheng`、`sha256.cheng` | 原子 ORC gate |
| 线程函数指针 | `thread.StartPtr(&fn)` | 函数值/回调句柄 | `thread.cheng`、`system_link_exec_runtime.cheng` | 线程 smoke |
| 类型别名星 | `decl-star` 4 | 删除别名，改 SoA 列/句柄 | `gate_main.cheng`、other | parser/门禁 |
| C 冷链引用 | 9 处 `cheng_cold` | 纯种子发现 + cold 命令移出 kernel | `provider_root/bootstrap_contracts/compiler_main/compiler_runtime/gate_main/root_discovery` | `--no-cold` + 二进制 `_cold_`=0 |
| Arena raw ptr | `arena_rt_*` 26 | provider 内部实现 + kernel 值接口 | `arena.cheng`、runtime provider | arena contract smoke；no-pointer gate |

## 5. 分阶段执行计划（files / action / verify / done）

> 与 `task_plan.md` 战役 R0-R5 的关系：Z0 并入 R0；Z1-Z3 并入 R2/R3；
> Z4-Z6 并入 R2/R3；Z7 并入 R4；发布并入 R5。每阶段独立验收，不跳阶。

### Z0 审计冻结与门禁落地（本文 + gate）

- **files**：`docs/pure-cheng-kernel-zrpc-dod-soa-arena-orc-plan.md`（本文）、
  `tools/zrpc_kernel_gate.py`、`tools/zrpc_kernel_baseline.tsv`、
  `tools/zrpc_kernel_gate_contract_test.sh`、`tools/ci_gate.sh` 一行接线。
- **action**：闭包 BFS + 指针/内存 API/C 冷链扫描 + 基线棘轮；
  `--require-zero-kernel-core`/`--require-zero-closure`/`--no-cold`/`--binary`/`--receipt` 五模式。
- **verify**：`bash tools/zrpc_kernel_gate_contract_test.sh` PASS；
  `python3 tools/zrpc_kernel_gate.py` PASS（基线棘轮）；`--require-zero-kernel-core` 当前 RED=347、
  `--no-cold` 当前 RED=9，作为施工输入如实记录。
- **done**：基线冻结、负例自检通过、ci_gate 接线；后续所有阶段用同一 gate 判分。

### Z1 DoD/SoA 表收口

- **files**：`src/core/ir/compiler_dense_store.cheng`、`phase_arena.cheng`、
  `src/core/lang/{parser,typed_expr}.cheng`、`src/core/tooling/compiler_csg.cheng`、
  `src/core/backend/{lowering_plan,primary_object_plan}.cheng`、`src/core/backend2/**`。
- **action**：把剩余对象图/指针 key 表迁为列数组；统一 `int32` 行身份；
  删除 `compiler_dense_store` 的 `ptr` 类型标签；每表加 schema smoke。
- **verify**：`compiler_dense_store_phase_arena_contract_smoke`、
  `phase_arena_storage_contract_smoke.sh`、配对字节铁门；新增表 schema 门。
- **done**：kernel_core 内无指针 key/无 `ptr` 类型标签；SoA reader 覆盖全部 IR 表。

### Z2 Arena handle 收口

- **files**：`src/core/runtime/arena.cheng`、`src/core/ir/phase_arena.cheng`、
  runtime provider、全部 `arena_rt_*` 调用方。
- **action**：kernel 侧 `ptr` 签名全部换 `PhaseArenaHandle` + `ArenaRuntime*` 值接口；
  raw 实现移入 provider；phase reset/spill 报告。
- **verify**：`phase_arena_storage_contract_smoke.sh`；`zrpc_kernel_gate.py --require-zero-kernel-core`
  中 arena 相关行归零；768MiB 守卫下 phase peak 报告。
- **done**：kernel 闭包无 `arena_rt_*`/`ptr` arena 面；Arena 报告纳入每轮 summary。

### Z3 kernel_core ZRPC 迁移

- **files**：`body_ir_lifecycle.cheng`（242）、`path.cheng`（41）、
  `host_pool_runtime.cheng`（8）、`lifetime_ledger.cheng`（8）、`gate_main.cheng`（5）、
  `parser.cheng`（3）、`typed_expr.cheng`（3）、`compiler_main.cheng`（2）、
  `compiler_snapshot_lowering_bridge.cheng`（2）、`system_link_exec_runtime.cheng`（1）、
  `compiler_world.cheng`（1）等。
- **action**：按 §4 替换表逐族迁移；先 `cheng_seq_free`→ORC drop，再公共 `ptr` 签名，
  再 `&` 原子/线程；每族独立提交、配对字节门。
- **verify**：`zrpc_kernel_gate.py --require-zero-kernel-core` 绿（0/347）；
  `bash tools/zrpc_kernel_gate_contract_test.sh`；四夹具回归；ORC 计数。
- **done**：kernel_core+shared_format 零指针/内存 API 违规。

### Z4 shared_format/plugin 迁移

- **files**：`coff_object_linker.cheng`、`elf_object_linker.cheng`、
  `macho_provider_linker.cheng`、`coff_object_writer.cheng`、各 arch writer/linker。
- **action**：`ptr` 签名换 `Bytes`/`BytesView`/`object_buffer` 值合同；arch 内部
  ABI 收口到 plugin 单元；kernel 只见 `codegen_contract`。
- **verify**：`kernel_plugin_closure_check.py --require-closure`；
  `zrpc_kernel_gate.py --require-zero-kernel-core`；三 target exec_diff。
- **done**：shared_format 28 行归零；plugin 仅剩 `@abi_internal` 内部实现且单独基线。

### Z5 platform provider 边界

- **files**：新增 `src/core/platform/platform_contract.cheng`（kernel 侧，值合同）、
  `platform_provider_{darwin,linux}.cheng`；迁移 `std/os`、`std/fs`、`std/thread`、
  `std/crypto/sha256`、`std/rawmem_support`、`std/rawbytes`、`std/hashmaps`、
  `core/runtime/held_exec_identity`、`core/runtime/arena` 的 provider 实现。
- **action**：kernel 只调 `PlatformCall(request) -> receipt`（SoA 行 + int32 句柄 + CID）；
  provider 内部用 `@importc`/`@abi_internal`；kernel 闭包不再 import provider 实现。
- **verify**：闭包门证明 provider 文件不在 kernel 闭包；provider conformance smoke；
  四夹具；`--require-zero-closure` 的 provider 行只减不增。
- **done**：kernel 闭包 626 行 provider 指针面移出；平台边界独立审计。

### Z6 ORC 生产接线

- **files**：`src/core/analysis/ownership_drop_ir.cheng`（或扩 `ownership.cheng`）、
  `lowering_plan.cheng`、BodyIR、`lifetime_ledger.cheng`、
  `program_support_backend.cheng`。
- **action**：canonical Ownership/Init/Drop IR + CFG fixed point + drop glue + cleanup
  edges；`cheng_seq_free` 调用点改 drop/consume；失败/panic 统一 cleanup owner。
- **verify**：ORC 夹具 `alloc==free`/`live=0`；`lifetime_ledger` 生产报告；
  double-release 负例 hard-fail；四夹具；字节铁门。
- **done**：kernel 自身 ORC 闭合；`body_ir_lifecycle` 242 处 `cheng_seq_free` 清零。

### Z7 C 冷链退出

- **files**：`tools/bootstrap_from_cheng.sh`、`tools/backend2_current_source_*`、
  `tools/beat_c_baseline.sh`、`tools/ci_gate.sh`、`src/core/tooling/{provider_root,bootstrap_contracts,compiler_main,compiler_runtime,gate_main,root_discovery}.cheng`。
- **action**：9 处 cold 引用改纯种子发现；`cc cheng_cold.c` 从 kernel 构建路径移出；
  cold 仅保留 `tools/legacy_cold_seed.sh`（显式非默认）；GEN1→GEN2→GEN3 纯链。
- **verify**：`zrpc_kernel_gate.py --no-cold` 绿；`nm -a <kernel_driver> | grep -c _cold_ == 0`；
  回执 `full_backend_codegen=1`、`cold_system_link_exec=0`；GEN2/GEN3 不同 inode +
  raw cmp + SHA-256 相等；768MiB 双口径。
- **done**：C 冷链退出内核编译路径；纯固定点回执入库。

### Z8 发布接线（并入 R5）

- **files**：`ci_gate.sh`、release receipts、`docs/**`、OpenSpec archive。
- **action**：Z0-Z7 全绿后接 CI、原子替换正式 artifacts、更新总纲/提案/task_plan。
- **verify**：全门 + 反事实负例 + 双口径；无 baseline 新增。
- **done**：`cheng.kernel.release.v1` 可重算，发布回执与源码/工具哈希绑定。

## 6. 验证门设计

### 6.1 `tools/zrpc_kernel_gate.py`（本文主门）

- 闭包：从 `bootstrap/kernel_manifest.cheng` 全部 `*_source` 根 BFS 真实 import；
  0 未解 import 才继续。
- 分层：kernel_core / shared_format / plugin / provider / other（§2.1）。
- 扫描：type-alias-star、decl-star、void*、ref-T（`ref object` 除外）、prefix-deref-*、
  prefix-&、pointer-member、ptr-in-sig-public/ffi、ptr-call、ptr-token、raw-memory-api、
  cold-chain-symbol。
- 模式：
  - 默认：基线棘轮，新增违规即 FAIL（`--update-baseline` 刷新，刷新需 Review）；
  - `--require-zero-kernel-core`：kernel_core+shared_format 必须 0（Z3/Z4 done 判据）；
  - `--require-zero-closure`：整个闭包 0（Z5+ done 判据）；
  - `--no-cold`：源码 cold 引用 0；`--binary PATH` 追加 `_cold_` 符号=0；
    `--receipt PATH` 追加 `cold_system_link_exec=1`/`cheng_cold.c` 拒收；
  - `--json PATH` 输出机器可读回执；`--list` 输出逐行清单。
- 负例自检：`tools/zrpc_kernel_gate_contract_test.sh`（干净 PASS、裸指针 FAIL、
  棘轮新增 FAIL、cold FAIL）。

### 6.2 既有门必须保持

- `kernel_plugin_closure_check.py --require-closure`：kernel 不触 arch、manifest 精确闭包。
- `kernel_plugin_manifest_gate.py`：x86_64=5/aarch64=4/riscv64=5 双向覆盖。
- `phase_arena_storage_contract_smoke.sh`：Arena/SoA 合同、spill 非预期即失败。
- `lifetime_ledger_smoke` / `memory_report_contract_smoke`：ORC 账本/内存报告。
- `user_path_gate.sh --driver <kernel_driver>`：四夹具基线棘轮。
- `bootstrap_from_cheng.sh` / `bootstrap-bridge`：固定点门（Z7 后切纯种子）。
- `ci_gate.sh`：全部常驻；新增 `kernel-zrpc-ratchet`/`kernel-zrpc-contract`
  （当前必绿）+ `kernel-zrpc-strict`/`kernel-no-cold` 阶段门（Z3/Z7 前如实 RED，见文件尾）。

### 6.3 反事实（必须能红）

1. kernel 闭包新增任何 `T*`/`ptr`/`&`/`cheng_seq_free`/`memCopyCompat`；
2. kernel_core 新增 provider/arch import；
3. 新增 `bootstrap/cheng_cold.c` 引用或 `cc cheng_cold.c` 命令；
4. 内核产物新增 `_cold_` 符号或回执 `cold_system_link_exec=1`；
5. 基线文件被静默删除/覆盖导致“零违规”假绿；
6. ORC 负例（double-release、release 后读、结束仍 owned）未 hard-fail；
7. 用旧 artifact/receipt 或 `SKIP` 冒充当前源码完成。

## 7. 验收标准（同时成立）

| # | 维度 | 判据 |
|---|---|---|
| 1 | ZRPC kernel | `zrpc_kernel_gate.py --require-zero-kernel-core` 绿（0/347） |
| 2 | ZRPC closure | `--require-zero-closure` 绿（0/977；provider/plugin 边界基线归零） |
| 3 | 无 C 冷链 | `--no-cold` 绿 + 内核产物 `_cold_`=0 + `cold_system_link_exec=0` + `full_backend_codegen=1` |
| 4 | DoD/SoA | 全部 kernel IR 表 SoA schema smoke 绿；无指针 key/`ptr` 类型标签 |
| 5 | Arena | phase arena 报告 `spill_count` 非预期为 0；kernel 侧无 `arena_rt_*`/`ptr` |
| 6 | ORC | ORC 夹具 `alloc==free`、`live=0`；无 double-release；`body_ir_lifecycle` 无 `cheng_seq_free` |
| 7 | 自举 | GEN2/GEN3 不同 inode、raw cmp + SHA-256 相等；768MiB 双口径；四夹具 4/4 |
| 8 | 发布 | R0-R5 全门 + 本文 §6 反事实 + `cheng.kernel.release.v1` 可重算 |

## 8. 风险与止损

| 风险 | 概率 | 影响 | 缓解/止损 |
|---|---|---|---|
| provider 边界重构破坏 syscall/线程 | 中 | 四夹具回退 | 先建 `platform_contract` + conformance smoke；provider 内部指针实现保留到 Z5 done；字节/回执配对 |
| ORC 生产接线暴露 double-release/borrow-view 深水 | 高 | Z6 延期 | 按 `deterministic-memory-lifecycle.md` 分片；lifetime ledger + quarantine；未证明类型 hard-fail；不设“先不释放” |
| 768MiB/自烤墙不可预判 | 高 | Z7 延期 | P1 汇点增量化 + T-1 intern 正则化（`selfhost-resource-plan.md`）；边界图 + 止损条款；不抬帽 |
| 指针迁移改变 ABI/性能 | 中 | 产物字节漂移 | 每族配对字节铁门；布局漂移如实记录；不允许启发式豁免 |
| 共享树多 lane 冲突 | 中 | 施工中断 | 文件面互斥 + mtime 静默 + 只 stage 自己 hunk；hot 文件（`bootstrap/cheng_cold.c` 等）不碰 |
| gate 误报/漏报 | 中 | 假绿/假红 | 与 parser 诊断/`closure_gate_prescan.py` 对拍；负例自检；基线 Review；`--update-baseline` 需人工确认 |
| C 冷链先删后补能力 | 中 | 编译器不可用 | Z7 前 cold 只作种子/对照；GEN2 真实 rc=0 前不删 cold 文件；禁止 fallback 冒充 |

## 9. 文档地图与权威关系

| 文档 | 角色 |
|---|---|
| `docs/pure-cheng-kernel-master-plan.md` | 总纲（结构/资源/闭环/现状总账） |
| `docs/cheng-minimal-kernel-plan.md` | 结构维度（Step0-5、归属/组合/自举史） |
| `docs/selfhost-resource-plan.md` | 资源维度（时间/RSS/自宿主相账） |
| `docs/pure-cheng-kernel-closure-plan.md` | Phase A-F 闭环路线 |
| **本文** | **数据/所有权/指针/C 冷链唯一权威方案** |
| `openspec/proposals/pure-cheng-minimal-kernel.md` | apply authority（K0-K5；本文并入 K2/K4 + 新增 K6） |
| `openspec/proposals/deterministic-memory-lifecycle.md` | ORC/账本分片 M1-M6 |
| `openspec/proposals/orc-cycle-collector-weak.md` | 环收集/Weak（非最小内核前置） |
| `docs/cheng-formal-spec.md` §0.2 | ZRPC/no-pointer 规范源 |
| `docs/cheng-skill/references/ownership.md` | ORC/move/borrow 口径 |
| `task_plan.md` 战役 R | R0-R5 执行账（本文 Z0-Z8 映射） |

## 附录 A：当前 gate 清单头部（2026-09-08）

- kernel_core 319：`body_ir_lifecycle.cheng` 242（`cheng_seq_free`）、`path.cheng` 41、
  `host_pool_runtime.cheng` 8、`lifetime_ledger.cheng` 8、`gate_main.cheng` 5、
  `parser.cheng` 3、`typed_expr.cheng` 3、`compiler_main.cheng` 2、
  `compiler_snapshot_lowering_bridge.cheng` 2，其余各 1。
- shared_format 28：`coff_object_linker.cheng` 12、`elf_object_linker.cheng` 10、
  `macho_provider_linker.cheng` 5、`coff_object_writer.cheng` 1。
- provider 626：`system.cheng` 137、`held_exec_identity.cheng` 95、`os.cheng` 87、
  `os_host_process.cheng` 52、`hashmaps.cheng` 31、`rawmem_support.cheng` 28、
  `thread.cheng` 27、`arena.cheng` 26、`sha256.cheng` 25、`seqs.cheng` 20、
  `fs.cheng` 18、`strutils.cheng` 18、`atomic.cheng` 11、`rawbytes.cheng` 11、
  `handle_table.cheng` 8。
- C 冷链 9：`provider_root.cheng:14`【更正 2026-09-10 审计：点名文字 `cheng_cold`/`coldPath` 在 HEAD 该文件 0 命中（:14 现为 seed 路径），该锚点不可用、正确落点未定位；原文保留为历史证据】、`bootstrap_contracts.cheng:109`、
  `compiler_main.cheng:2624/:4164`、`compiler_runtime.cheng:253`、
  `gate_main.cheng:1825/:2636/:6760`、`root_discovery.cheng:12`【更正 2026-09-10 审计：点名文字 `cheng_cold`/`coldPath` 在 HEAD 该文件 0 命中（:12 现为 seed 路径），该锚点不可用、正确落点未定位；原文保留为历史证据】。

## 附录 B：复现命令

```bash
# 主门（基线棘轮）
python3 tools/zrpc_kernel_gate.py
# 当前 RED 施工输入
python3 tools/zrpc_kernel_gate.py --require-zero-kernel-core   # 期望 FAIL 347
python3 tools/zrpc_kernel_gate.py --no-cold                    # 期望 FAIL 9
python3 tools/zrpc_kernel_gate.py --require-zero-closure       # 期望 FAIL 977
# 负例自检
bash tools/zrpc_kernel_gate_contract_test.sh
# 机器回执
python3 tools/zrpc_kernel_gate.py --quiet --json /tmp/zrpc.json
# 既有结构门
python3 tools/kernel_plugin_closure_check.py --require-closure
python3 tools/kernel_plugin_manifest_gate.py
bash tools/phase_arena_storage_contract_smoke.sh
# C 冷链现状
nm -a artifacts/bootstrap/cheng.stage3 | grep -c _cold_        # 1795
wc -l bootstrap/cheng_cold.c bootstrap/cold_parser.c            # 118114 / 96087
# prescan 对照
python3 /Users/lbcheng/cheng-patches/entry-bridge-wall-20260826/closure_gate_prescan.py
```
