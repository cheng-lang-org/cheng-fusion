# `ptr` 内建类型的 arena 表示 — 设计与补丁

战役：`2026-08-31-kernel-userpath`（逐源驱动 / TypeArena resolution authority）
补丁：`patches/ptr_builtin_type_arena_representation.patch`（`git apply --check` exit 0，基线=当前工作树）
判词现场：`src/core/lang/typed_expr_type_arena.cheng:4764`（索引版）与 `:3385`（树版孪生，逐字相同）

---

## 0. 结论先行

1. `ptr` 是**语言认可的不透明指针内建标量**（opaque unmanaged pointer-sized scalar）：8 字节 / 8 字节对齐、无内部结构、无托管头、按机器字复制；身份上 **≠ `cstring` ≠ `uint64`**（C 链有独立 tag），但物理槽位与 `cstring` 同类（`SLOT_OPAQUE`）。它是**地址叶**，不是普通标量。
2. 修法：**在 `TypedExprStructuralScalarKind` 末尾追加 `TypedExprStructuralScalarPtr`（序数 18），并让 `"ptr"` 走既有的「标量拼写 → 内联 Scalar 行」通道；不新增种子行**。
3. 首选方向 (a)「语义种子行」在**本文件语境下是错的**：种子行无条件为每个 arena 增加一行，`typeArenaArtifactCid` 与 `typeArenaTypeCount` 会为**全部** arena 位移。改用「按需 intern」（与 `int`/`uint` 完全同一条既有先例），使不出现 `ptr` 的输入 **CID 零位移**。
4. 需要新增 1 个枚举成员 + 1 个可移植 schema 序数（16），两者都**追加在末尾**，既有序数全部不动。
5. no-pointer 门禁与本次修法**正交**：门禁是按模块归属做源码棘轮扫描，不是类型系统判定；本次改动**不新增任何表面拼写**（parser 早已接受 `ptr`），也**不放宽任何守卫**。

---

## 1. `ptr` 的语义结论（全部含 file:line）

### 1.1 规范面

- `docs/cheng-formal-spec.md:57-61`：no-pointer 生产门禁的**作用域是「用户源码模块」**；禁用形列 `T*`、`void*`、`ref T`、`ptr[T]`（**注意：列表里是带参的 `ptr[T]`，不是裸 `ptr`**），并明确「`@importc/@exportc` 等 C ABI 声明不豁免」。
- `docs/cheng-formal-spec.md:569-573`：同一门禁在设计结论段重申。
- `docs/cheng-formal-spec.md:564`：`@abi_internal` 是**唯一**允许 compiler/runtime 内部声明走内部布局的逃生口；`docs/cheng-formal-spec.md:567`：借用桥接优先 `@importc + var T`，在借用校验通过后桥接到 `T*`。
- 规范**没有**把裸 `ptr` 列为「用户可用类型」，也**没有**在任何地方把 `ptr` 定义为用户声明的 nominal —— 它是内建拼写。

### 1.2 Cheng 前端面（`ptr` 已是语言内建拼写，不是普通标识符）

- `src/core/lang/parser.cheng:6500`：`ParserTypeExprIsScalarLike` 把 `"ptr"` 与 `cstring` 同级列为标量类；`:6502` 另列 `ptr[`。
- `src/core/lang/parser.cheng:6430`：内建调用名表含 `callName == "ptr"`。
- `src/core/lang/parser.cheng:18766-18776`：类型位的裸标识符**一律**产 `ParserTypeSyntaxNominal`，`ptr` 无特例 —— 这正是「arena 必须自己认识这个拼写」的原因。
- `src/core/lang/typed_expr.cheng:28841`：`t == "ptr" || t == "VoidPtr" || t == "VoidPtrPtr"` 一律归一为 `"ptr"`。

### 1.3 C 冷链面（它能编过同一批源，是最强的既有语义权威）

| 事实 | 证据 |
|---|---|
| `ptr` 是一等内建类型身份（排在 `bool..str` 之后的第 16 行） | `bootstrap/cold_parser.c:563-581`，`if (span_eq(type, "ptr")) return 16;`（`:580`） |
| `sizeof(ptr) == 8`（与 `int64/uint64/cstring` 同组） | `bootstrap/cold_parser.c:37464-37467` |
| `ptr` → `SLOT_OPAQUE`（一个机器字，无托管头） | `bootstrap/cold_parser.c:5447`；`bootstrap/cheng_cold.c:30476` |
| `SLOT_OPAQUE` 的**规范类型文本就是 `"ptr"`** | `bootstrap/cheng_cold.c:24617` |
| `var ptr` 形参 → `SLOT_OPAQUE_REF`（指向调用者指针单元的借用，callee 可写回） | `bootstrap/cheng_cold.c:30411` |
| `ptr` 在 Semantic TypeIdentity 内建 tag 表中有独立 tag（`cstring`=17、**`ptr`=18**、`str`=19） | `bootstrap/cheng_cold.c:76196-76212` |
| `ptr` 是**地址叶**，与 `cstring/owned_cstring/bytes_view/utf8_view` 同组，恒「含借用地址」 | `bootstrap/cold_parser.c:62369-62384`（`:62378-62384` 为 ptr 分支） |
| `ptr` 载体本身**不承载所有权分类** | `bootstrap/cheng_cold.c:18480-18490`：`SLOT_PTR`/`SLOT_OPAQUE_REF` → `COLD_MANAGED_STORAGE_UNKNOWN` |

### 1.4 结论（一句话）

> `ptr` = **不透明、非托管、指针宽度的内建标量**；身份独立于 `cstring`（各有 tag）与 `uint64`（不可做算术）；物理上是 8/8 的一个机器字，可以按 8 字节字段嵌进聚合（`src/std/rawbytes.cheng:19-22` 的 `Bytes{ data: ptr; len: int32 }` 即实例），没有内部结构可供投影，**不是 Send/Sync**（它是地址，与 `cstring` 同列），**永不参与所有权 drop**。

### 1.5 规模事实（为什么必须修，而不是「让 stdlib 别用 ptr」）

- 以类型位精确口径 `(:\s*ptr\b|\)\s*:\s*ptr\b|\bptr\[)` 统计，`src/std` + `src/core` + `src/chain` + `src/apps` 共 **107 个文件**在用 `ptr`。
- 其中包含 **编译器自己**：`src/core/lang/parser.cheng`、`src/core/lang/typed_expr.cheng`、`src/core/backend/primary_object_plan.cheng`、`src/core/backend2/backend2_lower_slots.cheng`。
- 结论：arena 不认 `ptr` ⇒ 新管线**无法自举**。这是表示缺口，不是策略问题。

---

## 2. 方案评估与选择

### 2.1 方案 (a) 语义种子行 —— **否决**

`typedExprTypeArenaSeedSemanticScalarRows`（`src/core/lang/typed_expr_type_arena.cheng:1561-1592`）在 `AllocateFromLimitsInto`（`:8284-8297`，调用点 `:8292`）中**无条件**为每个 arena 建 15 行（`Void..CString` 区间 `:1566-1567`，跳过 `Int`/`UInt` `:1568-1570`），构成 TypeId 0..14 的固定语义前缀。

把 `ptr` 加进这个集合（无论用不用新枚举成员）会让**每个** arena 多一行：

- `typeCount` 参与 `typeArenaArtifactCid` 的哈希（`:828`），`typeKinds`/`scalarKinds` 两列也参与（`:932`、`:933`）→ **所有 arena 的 artifact CID 全变**；
- `compiler_snapshot_builder.cheng:13856` 把 `typeArenaTypeCount` 直接发布进快照输出字段；
- 该 CID 还被写进快照回执（`compiler_snapshot_builder.cheng:13855`、`:4824`、`:5089`、`:5305`、`:5431`、`:5605`、`:6250`、`:7011`）与 BodyIR/lowering-plan 回执。

也就是说：种子行方案违反「不许位移既有身份」，且位移面是**全量**的，收益为零 —— `ptr` 根本不需要「与源序无关的固定前缀」这一性质（下一节说明它和 `int`/`uint` 是同一类）。

### 2.2 方案 (b) 新增 `TypedExprStructuralTypeKind` 成员（如 `TypeOpaque`）—— **否决**

表面上看它躲开了 `ScalarKind`，但代价更大：

- `TypedExprStructuralType*` 在 15 个文件里出现 **303 处**（`ScalarKind` 相关不足 40 处），外层 TypeKind 是所有 layout / BodyIR / 快照 / 后端的**主分派**；
- 更关键的是**它没有语义依据**：`ptr` 在 C 链就是 `SLOT_OPAQUE`，在 arena 的既有建模里 `SLOT_OPAQUE` 的同类（`cstring`）就是 `TypedExprStructuralTypeScalar`（`src/core/tooling/compiler_csg.cheng:12521-12575` 把 cstring 归入标量 layout；`src/core/backend/canonical_type_chain.cheng:125-127` 把 cstring 归一为 `LocalPtrTag`）。另起 TypeKind 等于给同一物理类造第二种建模，后续每个 backend 都要多一个并集分支。

### 2.3 选定方案：**(a′) 末尾追加 ScalarKind 成员 + 按需 intern（不建种子行）**

机制（全部是既有通道，零新机制）：

1. `typedExprTypeArenaScalarKind("ptr")` 从 `Invalid` 变为 `TypedExprStructuralScalarPtr`。
2. **authority 相**：`TypedExprTypeArenaAppendSourceInto` 的过滤器（索引版 `:4963-4965`，树版孪生 `:3614-3616`）命中 `!= Invalid` ⇒ `continue`，`ptr` 行**不进** resolution 权威表 —— 这正是标量的既定语义（见第 4 点的校验佐证），因此 `:4764` 判词不再触发；树版孪生因调用同一个 `typedExprTypeArenaScalarKind` 而**同修**。
3. **materialization 相**：`typedExprTypeArenaResolveNominal`（`:1779`）在 `:1803-1812` 命中 `ParserTypeSyntaxNominal && scalarKind != Invalid` 快径，`typedExprTypeArenaIntern(state, out, row, TypeScalar, ScalarPtr, ...)` → 拿到**真实 TypeId**，父行（函数签名 `fn f(base: ptr, ...)`、字段 `data: ptr`、`ptr[]` 的元素）都拿到有效子 TypeId，不再有 `child TypeId unavailable`。
4. **按需 intern 有在册先例**：`int`/`uint`（`TypedExprStructuralScalarInt`/`UInt`）就是这样——`typedExprTypeArenaScalarKind` 认识它们（`:1026-1027`），种子循环**刻意跳过**（`:1568-1570`），`TypedExprTypeArenaReservedScalarTypeId` 明确拒绝（`:10424-10425`、`:10446-10447`）。按需 intern 产生的是 `originKind = ParserSyntax` 的 Scalar 行，严格校验 `:9939-9947` **显式允许**（`SemanticBuiltin` 分支才是「必须 `origin == -1`」的那一支）。`ptr` 完全复刻这条路径。
5. **严格校验自动放行**：`:9015-9021` 的 `nominalRequiresResolution` 明确把「TypeId 的 structural kind 是 Scalar」的 nominal 行排除在「必须持有 resolution 回执」之外 —— 即「标量拼写的 nominal 不需要解析回执」是本文件**写死的既有契约**，`ptr` 走这条契约不是绕过。
6. `ptr[]`（`src/std/thread.cheng:262,271`）走 `ParserTypeSyntaxSeq`（`src/core/lang/parser.cheng:399`），其 nominal 元素子行走第 3 点，得到 `Sequence[ptr]`，无需额外改动。

### 2.4 明确否决的第三种做法

- **`ptr` → `ScalarCString` 复用**：C 链给了它们各自的内建身份（`bootstrap/cheng_cold.c:76196-76212` 中 cstring=17、ptr=18），合并是身份谎言。
- **`ptr` → `ScalarUInt64` 复用**：与 `bootstrap/cold_parser.c:580` 的行号 16 ≠ 10 直接矛盾，且会把指针变成可算术整数。
- **在 `src/std/rawbytes.cheng` 里 `type ptr = ...` 声明成 nominal**：会变成**每模块一份**的 nominal（身份不跨模块）、与 `src/core/lang/parser.cheng:6500` 的「标量类」分类冲突，且在公开面新增了一个指针类型名 —— 比现状更坏。
- **在 `src/core/lang/typed_expr.cheng` 的 `typedExprIrReservedScalarKindForRuntimeType`（`:4845`）里加 `"ptr"`**：该映射的出口是 `TypedExprTypeArenaReservedScalarTypeId`（`:10418`），对无种子行的 kind **panic**。`ptr` 不是 reserved，绝不能进这张表。（今天该表没有 `ptr`，调用方 `:4882-4888` 会先返回 `-1`，安全。）

---

## 3. 身份 / CID 影响量化

### 3.1 枚举序数

| 面 | 现状 | 改动后 | 既有成员位移 |
|---|---|---|---|
| `TypedExprStructuralScalarKind` | `Invalid`=0 … `CString`=17 | 追加 `Ptr`=**18** | **0** |
| `CsgCompilerScalar*`（可移植 schema） | 1..15（`Void`=15） | 追加 `Ptr`=**16** | **0** |
| `TypedExprStructuralTypeKind` | 未改 | 未改 | 0 |
| `coreir.Local*Tag` | 未改（`ptr` 复用既有 `LocalPtrTag`） | 未改 | 0 |

Cheng `enum` 首成员为 0（由 `:9922` 的 `kind <= TypedExprStructuralTypeInvalid` 判据与 `:10422` 的 `scalarKind <= ...Invalid` 判据反证）。

### 3.2 行数 / `typeCount`

- 种子行仍为 **15**（`Void..CString` 区间不含末尾追加的 `Ptr`），`typeCount` 对不出现 `ptr` 的输入**逐位不变**。
- 出现 `ptr` 的 arena：`ptr` 行按首次 intern 顺序落在种子前缀之后（行号 ≥ 15，具体值取决于该 arena 的 intern 顺序，**与 `int`/`uint` 的行号不确定性同性质**）。该 arena 的 `typeCount` +1，其 `typeArenaArtifactCid` 相应改变 —— 但这类 arena 今天**根本构建不出来**（在 `:4764` 就 fail），没有需要保住的基线 CID。

### 3.3 CID 面逐条

1. **arena artifact CID**（`typed_expr_type_arena.cheng:805-809` → `:812-1019`）：哈希 `typeCount`（`:828`）与全部列（含 `typeKinds` `:932`、`scalarKinds` `:933`）。因未加种子行、且既有成员的 `Int32(scalarKind)` 值未变 ⇒ **所有不含 `ptr` 的 arena 逐位不变**。
2. **可移植 Type 表**：`csgCompilerTypeStructureAppendInto`（`compiler_snapshot_schema.cheng:5621-5685`）按 u32 追加 `typeKinds[typeId]` 与 `scalarKinds[typeId]`，再进 `CsgCompilerTypeRowCidInto`（`:6037-6080`）。追加常量 16 不改 1..15 的字节 ⇒ **既有 type CID 逐位不变**。
3. **唯一被移动的边界**：`csgCompilerScalarKindValid`（`compiler_snapshot_schema.cheng:5189-5191`）上界 `CsgCompilerScalarVoid(15)` → `CsgCompilerScalarPtr(16)`。它放行的**新增值恰好只有 16 这一个新成员**，1..15 的判定逐字不变 ⇒ 是「为新成员开一扇门」，不是「放宽既有守卫」。这是全仓**唯一**以 `CsgCompilerScalarVoid` 为上界的范围判定（grep 计数：`compiler_snapshot_schema.cheng:138/5191` 两处，前者是常量定义，`compiler_snapshot_builder.cheng:13976/14010` 两处是映射出口）。
4. **规范文本池**：新增 `"ptr"` 条目；既有文本条目与既有 `canonicalTextIds` 不变。且 `compiler_snapshot_schema.cheng:6036` 注释明确「Type identity excludes canonicalTextIds」⇒ 文本不参与类型身份。
5. **Send/Sync 列**：`ptr` 取 `send=0/sync=0`（与 `cstring` 同列），三处必须同时改且已同改：intern 生产 `typed_expr_type_arena.cheng:1182-1183`、重算 `:1628`、可移植镜像 `compiler_snapshot_schema.cheng:5875-5876`。三者不一致会在 `compiler_snapshot_schema.cheng:6019-6023` 报 `type trait conclusion mismatch`、在 `typed_expr_type_arena.cheng:9890` 报 trait 漂移。
6. **CSG 并发回执**：`compiler_csg.cheng:17992-17995` 统计 Send/Sync 类型数并入回执哈希 ⇒ 只有**含 `ptr` 行的 arena** 该回执变化。

### 3.4 「`typeCount` 语义」连带影响

`typeCount` 语义（= 行数 = 所有类型列的公共长度）**未变**。快照侧 `typeArenaTypeCount`（`compiler_snapshot_builder.cheng:13856`）对既有输入不变；`compiler_snapshot_builder.cheng:6435` 的诊断串会打印 `arena_count`，仅对 `ptr` 输入 +1。

---

## 4. no-pointer 门禁与 stdlib 用 `ptr` 的共存论证

**门禁是按模块归属做的源码棘轮扫描，不是类型系统判定；两者在不同层，互不干涉。**

- 门禁实现：`tools/zrpc_kernel_gate.py`。其检查对象是「从 `bootstrap/kernel_manifest.cheng` 的全部 `*_source` 根出发、按真实 import 图展开的 kernel 闭包」，按归属表 `tools/kernel_plugin_attribution.tsv` 分 `kernel_core / shared_format / plugin / provider` 四层，`provider = src/std/** 与 src/core/runtime/**`（docstring `tools/zrpc_kernel_gate.py:10-12`，常量 `:50`）；判定用**源码正则** `PTR_IN_SIG = re.compile(r"(:\s*ptr\b|\)\s*:\s*ptr\b)")`（`:60`，使用点 `:432`）；默认模式是**棘轮**（只拒绝新增行，`:23`）。
- 即：**「哪些模块可以用 `ptr`」由模块归属决定，不由类型系统决定**。本补丁没有、也不可能改变这个归属判定。
- stdlib 一侧：`src/std/rawbytes.cheng:9-14` 用 `@abi_internal` 标注 `ptr` 签名函数；`:19-22` 把 `ptr` 放进公开复合类型 `Bytes`；规范 `docs/cheng-formal-spec.md:564` 把 `@abi_internal` 定为内部逃生口。
- 因此共存关系是：**`ptr` 是一个「有拼写、有物理表示、身份在内建空间」的内建类型；它能否出现在某个源码里，是模块策略问题。** arena/CSG/快照这一层只负责「给它一个忠实的表示」，不做策略判定。
- 为什么这不构成泄漏：
  1. 本次改动**不新增任何表面拼写** —— `ptr` 早就被 parser 接受（`parser.cheng:6500`、`:6430`、`:18766-18776`）。改动只是让 arena **不再对一个既有拼写 fail**。
  2. 没有任何 `ptr` 专属的门禁/检查被删改；第 3.5 节列出的所有既有守卫（整数白名单、区间判定）对 `ptr` 的判定结果都是**拒绝**，与改动前一致。
  3. `ptr` 拿到的能力严格弱于普通标量：非托管、**非 Send/非 Sync**（对齐 `cstring`），不能做算术（后端整数白名单 `src/core/backend/primary_object_plan.cheng:39555-39565` 与 `src/core/backend2/backend2_lower_slots.cheng:23534-23546` 都不含它）。

---

## 5. 守卫逐条核对（约束 2：不许放宽任何守卫）

| 位置 | 现状对 `ptr` 的判定 | 改动后 | 结论 |
|---|---|---|---|
| `primary_object_plan.cheng:39555-39565` 整数索引白名单 | 拒绝 | 拒绝（未改） | 不放宽 |
| `backend2_lower_slots.cheng:23534-23546` 同族白名单 | 拒绝 | 拒绝（未改） | 不放宽 |
| `compiler_snapshot_schema.cheng:5189-5191` 标量合法性上界 | 拒绝（超界） | 接受新成员 16 | 放行的**只有新成员**，旧值判定逐字相同 |
| `canonical_type_chain.cheng:137-141` 兜底 `return LocalI32Tag`（`:141`） | 不可达（无 ptr 行） | 显式走 `LocalPtrTag` | **收紧**：阻止 `ptr` 静默变 I32（若不加这条，`ptr` 会被当成 4 字节 int32 —— 最危险的静默错） |
| `compiler_csg.cheng:12521-12575` 标量 layout | 不可达 | 显式 8/8 | 与 C 链 `cold_parser.c:37464-37467` 一致；不加则 `exact scalar layout unsupported` |
| `exact_def_freeze.cheng:782-787` 定长数组元素「无地址叶」 | 不可达 | `ptr` 明确**不算**独立元素 | **收紧**：与 C 链 `cold_parser.c:62378-62384`（ptr 是借用地址）及本函数既有注释「Borrow/RefObject/CString 即地址」一致 |
| `exact_def_freeze.cheng:2799` `physicalRef = (typeKind == LocalPtrTag)` | 不可达 | `var ptr` 形参判为 physicalRef | 与 C 链 `cheng_cold.c:30411`（`var ptr` → `SLOT_OPAQUE_REF`）一致；非 `var` 的 `ptr` 形参 ownership 为 move/plain，走第一条析取，不受影响 |
| `typed_expr_type_arena.cheng:4963` authority 过滤器 | `ptr` 落到 `:4764` 报错 | `ptr` 跳过解析 | 这不是「放宽」，是**标量的既定语义**（见第 2.3 节第 5 点：`:9015-9021` 写死「Scalar 的 nominal 不需要解析回执」） |
| `typed_expr_type_arena.cheng:10423/10445` reserved 标量查询 | 因 `> CString` 顺带排除 | 显式 `== Ptr` 排除 | 语义未变，从「靠序数」改为「显式」（`int`/`uint` 已是这个写法） |

**未改且经核对无需改**的标量分派点：
`exact_def_derive.cheng:118-125`（`ptr` → `StoragePlainTag`，与既有 `cstring` 同判；C 链 `cheng_cold.c:18480-18490` 在**exact** helper 里对 `SLOT_OPAQUE` 给 `UNKNOWN` —— 这是 **`cstring` 今天就存在的 Cheng/C 口径差**，非本次引入，见第 8 节未测项）；
`managed_lvalue_replace.cheng:668,722,1167,1300`、`ownership_body_ir_production.cheng:390`、`backend2_lower.cheng:539-541`（全部只认 `ScalarStr`）；
`compiler_csg.cheng:34566/34791/35318`、`compiler_snapshot_builder.cheng:14794`（只认 `Void` / `Int32`）；
`compiler_snapshot_builder.cheng:13875-13877`（只认 `Int`/`UInt`）。

---

## 6. 编译级自检（约束 5：本轮已发生多次事故，逐点核对）

### 6.1 插入块内每个标识符在该点已绑定、同一函数作用域内、不是插入点之后才声明的 `let`/`var`

| 编辑点 | 用到的标识符 | 绑定位置 | 结论 |
|---|---|---|---|
| `typed_expr_type_arena.cheng:48` 枚举成员 | — | `type` 块，文件顶部 | 无引用 |
| `:1043` `if text == "ptr": return TypedExprStructuralScalarPtr` | `text` 函数形参（`:1022`）；`TypedExprStructuralScalarPtr` 在 `:48` 同文件 type 块声明 | 同函数作用域，声明在**前** | ✅ |
| `:1182-1184` intern trait 续行 | `scalarKind` 为 `typedExprTypeArenaIntern` 形参（`:1132`） | 同函数 | ✅ |
| `:1629-1630` `computeTraitFlags` 续行 | `scalarKind` 为 `let ... = TypedExprStructuralScalarKind(...)`，`:1622` | 同函数，`:1622 < :1629` | ✅ |
| `:10426` / `:10449`（hunk `@@ -10421,6 +10426,7 @@` 与 `@@ -10443,6 +10449,7 @@`）reserved 守卫新增行 | `scalarKind` 分别为 `TypedExprTypeArenaReservedScalarTypeId` 形参（`:10420`）/ `TypedExprTypeArenaReservedScalarTypeIdForText` 的 `let`（`:10442`） | 同函数，均在**前** | ✅ |
| `compiler_csg.cheng:12565-12568` layout 续行 | `scalarKind` 为 `compilerCsgExactScalarLayoutInto` 形参（`:12522`）；`typearena` 为模块别名 | 同函数 | ✅ |
| `canonical_type_chain.cheng:123-128` | `scalarKind` 为 `let`（`:121`，`lowering.typeArenaScalarKinds[...]`） | 同函数，在前 | ✅ |
| `compiler_snapshot_schema.cheng:139` 常量 | — | `const` 块 | 无引用 |
| `:5191` 上界 | `kind` 为 `csgCompilerScalarKindValid` 形参 | 同函数 | ✅ |
| `:5875-5877` 续行 | `scalarKind` 为 `let`（`:5873`） | 同函数，在前 | ✅ |
| `compiler_snapshot_builder.cheng:14005-14006` 新 `if` | `scalarKind` 为 `compilerSnapshotBuilderSchemaScalarKind` 形参（`:13973-13974`）；`snapshot_schema` 为模块别名 | 同函数 | ✅ |
| `:14025` 新 `if` | `scalarKind` 为 `compilerSnapshotBuilderScalarText` 形参（`:14009`） | 同函数 | ✅ |
| `exact_def_freeze.cheng:786-787` 续行 | `scalar` 为 `let`（`:781`） | 同函数，在前 | ✅ |

**无任何函数内前向引用。** 所有 `TypedExprStructuralScalarPtr` / `CsgCompilerScalarPtr` 引用点都在声明**之后**（枚举/常量块在文件前部）。

### 6.2 插入点缩进层级不得切断 `if/elif/else`/`for` 链或块体

逐条核对（缩进以空格数计）：

1. `typed_expr_type_arena.cheng:1043` —— 4 空格，与相邻 `if text == "cstring": ...` 同级；该函数是**一串互斥 `if...: return` 单行**，插入一条不改变任何块边界。✅
2. `:1182-1185` —— 修改的是 `else:` 块（12 空格）内**同一条赋值语句**的表达式，续行 19 空格；未触碰 `if kind == ... / elif ...` 链的任何分支头。✅
3. `:1629-1630` —— `elif` 条件（12 空格）加续行 17 空格；`:` 仍在原处，块体 `sendOut[typeId] = 1` 仍为 16 空格。✅
4. `:10426` / `:10449` —— `if` 条件续行 7 空格，与相邻 `scalarKind == ...Int ||` 完全同级；两个 `if` 的块体（`panic(...)` / `return -1`）缩进未动。✅
5. `compiler_csg.cheng:12565-12568` —— 在既有 `if scalarKind == ... ||` 条件**末尾**把 `CString:` 改成 `CString ||` + 两条同级续行 + 末行 `Ptr:`；块体 `sizeBytes = 8 / alignBytes = 8 / return true`（8 空格）不动，`:` 唯一。✅
6. `canonical_type_chain.cheng:123-128` —— 同上模式；紧随其后的 `if scalarKind ==`（`:128`）/ `Int32(...Int64) ||`（`:129`）是**新的独立 `if`**（不是 `elif`），故不会被吞进上一分支，`:127` 的 `return coreir.LocalPtrTag` 仍只属 CString/Ptr 分支。✅
7. `compiler_snapshot_schema.cheng:5191` —— 单行表达式替换，无块结构。✅
8. `:5875-5877` —— `sendOut = ...` 赋值续行 18 空格；`syncOut = sendOut`（`:5878`）与 `return true`（`:5879`）缩进未动。✅
9. `compiler_snapshot_builder.cheng:14005-14006` —— 新增 `if ...: return ...` 两行，4/8 空格，插在 `CString` 分支之后、注释块与 `return 0` 之前；该处是**无分支链**（一串独立 `if`），不切断任何 `elif`/`else`。✅
10. `:14025` —— 新增单行 `if ...: return "ptr"`，4 空格，插在 `CString` 行之后、`return ""` 之前；同上。✅
11. `exact_def_freeze.cheng:786-787` —— 在 `return` 表达式的延续处追加一列 `&&`（续行 15 空格，与相邻项同级）；其后 `if kind == ...FixedArray:`（`:787`）是独立 `if`。✅

**无任何 `if/elif/else`/`for` 链被切断。**

### 6.3 补丁机械核对

```
$ git apply --check patches/ptr_builtin_type_arena_representation.patch ; echo $?
0
$ git apply --stat patches/ptr_builtin_type_arena_representation.patch
 6 files changed, 29 insertions(+), 10 deletions(-)
```

- 基线 = **当前工作树**（含 op-lane 未提交 WIP）。补丁由脚本读当前文件、逐条断言锚点唯一（`count == 1`）、内存内替换后用 `difflib` 生成 diff，**未写任何源文件**。
- 空白/风格：续行采用本仓既有 idiom（`compiler_snapshot_schema.cheng:5875-5876` 的对齐续行、`typed_expr_type_arena.cheng:1102-1105` 的 `||` 续行）；无 tab、无行尾空白。

---

## 7. 验证计划

### 7.1 命令与期望读数

先 `git apply patches/ptr_builtin_type_arena_representation.patch`（`--check` 已 exit 0）。

1. **原判词消失（最小面）**
   ```
   <管线驱动> src/chain/binary_types.cheng
   ```
   期望：**不再**出现
   `compiler csg: TypeArena resolution authority failed source_index=3: typed expr type arena: nominal declaration is not visible ... name=ptr`。
   期望读数：authority 相通过（`TypedExprTypeResolutionAuthoritySealInto` `typed_expr_type_arena.cheng:4999` 不再因该行返回 false），下游进入 materialization 相。

2. **arena 相自洽（结构面）**
   期望：不再出现 `typed expr type arena: structural payload invalid`（`:10030`）、`trait derivation rule missing`（`:1279`）、`artifact CID mismatch`（`:10403`）、`reserved scalar authority invalid`（`:10426` panic）、`type row invalid`（`:9948`）。

3. **CSG 相位（layout / 快照）**
   期望：不出现 `compiler csg: exact scalar layout unsupported`（`compiler_csg.cheng:12619`）、`compiler snapshot builder: structural type row authority invalid`（`compiler_snapshot_builder.cheng:14394`）、`csg compiler snapshot: type trait conclusion mismatch`（`compiler_snapshot_schema.cheng:6000`）、`csg compiler snapshot: invalid type CID row`（`:6068`）。

4. **身份零位移（回归面，最重要的一条）**
   取一个**不含 `ptr`** 的既有通过用例，对比改前/改后的 `typeArenaArtifactCid`（`typed_expr_type_arena.cheng:805`）与 `typeArenaTypeCount`（`compiler_snapshot_builder.cheng:13856`）。
   期望读数：**逐位相同**。若任何一个变了，说明改动误动了种子前缀或既有枚举序数 —— 立即回退调查。

5. **负例（策略面）**
   确认用户模块的 no-pointer 门禁读数不变：`python3 tools/zrpc_kernel_gate.py`（默认棘轮模式）应给出与改动前**相同的行集合**（本补丁不碰任何被扫源码）。

### 7.2 「若修法错了会先在哪条判词暴露」

| 错法 | 第一条暴露判词 |
|---|---|
| **只把 `ptr` 从 `:4963` 过滤器跳过、不给它类型**（上游已否决的假修法） | `typed_expr_type_arena.cheng:1891` `typed expr type arena: nominal SymbolId authority missing` —— 因为 `typedExprTypeArenaAuthorityRow`（`:1735-1750`）对没有权威行的 `ptr` 返回 `-1`，在 `ResolveNominal` 走到 `:1888-1892`；或父行在 `:1765`/子 TypeId 取用处报 `child TypeId unavailable`。**不会**再报 `:4764`。 |
| 加了枚举成员但**忘了 `compilerCsgExactScalarLayoutInto`** | `compiler csg: exact scalar layout unsupported`（`compiler_csg.cheng:12619`）—— 在 CSG 精确布局相位，晚于 arena 相。 |
| 加了枚举成员但**忘了 `canonical_type_chain.cheng` 的 `LocalPtrTag` 分支** | **不报错**，静默走 `:141` 的 `return coreir.LocalI32Tag` ⇒ `ptr` 被当 4 字节 int32。会先在下游宽度/ABI 断言暴露（如 `primary_object_plan` 的尺寸校验、参数槽宽度漂移），**这是最危险的一条**：必须靠第 7.1 节的 layout 读数（8/8）与寄存器宽度核对，不能只看「编过了」。 |
| 加了枚举成员但**忘了快照 schema 的 `CsgCompilerScalarPtr`** | `compiler snapshot builder` 的 `missingSchemaKindCount` 非零 ⇒ `admissionBlocked=true`（`compiler_snapshot_builder.cheng:13962`；缺失计入点 `:13956-13960`），报类型投影被阻塞；**表面上 arena 相已全绿**，墙被挪到了快照相位。（`ptr` 走 Scalar 分支不会落到 `:13950` 的 `else`，本补丁因此把该处已过时的注释 `:13954-13955` 一并更新。） |
| 忘了 `:14025` 的文本映射 | 该 type 行的 canonical text 为 `""`，在 `compilerSnapshotBuilderTextFind` 处找不到 ⇒ `reference result portable Type row missing`（`compiler_snapshot_builder.cheng:6570`）。 |
| 忘了 `csgCompilerScalarKindValid` 上界 | `csg compiler snapshot: invalid type structure row`（`compiler_snapshot_schema.cheng:5661`）或 `invalid type CID row`（`:6068`）。 |
| 忘了三处 Send/Sync 任一处 | `csg compiler snapshot: type trait conclusion mismatch`（`compiler_snapshot_schema.cheng:6000`）或 `typed expr type arena` 的 trait 漂移（`typed_expr_type_arena.cheng:9890` 调用的重算比较）。 |
| 误加了种子行 | 第 7.1 节第 4 条回归读数（不含 `ptr` 输入的 `typeArenaArtifactCid`）**逐位变化**。 |

---

## 8. 未测项（诚实清单）

1. **未运行任何编译 / 烤制 / lldb**（本轮硬纪律）。补丁的全部结论来自静态读码；`git apply --check` exit 0 只证明补丁**可落**，不证明**可编**。第 7 节给出的是验证计划与失败签名，不是验证结果。
2. **`ptr` 行的确切 TypeId 行号未定**：按需 intern 的结果取决于该 arena 内首次出现的顺序，本文只断言「≥ 15」与「同 `int`/`uint` 的不确定性同性质」，未给出精确值。
3. **`exact_def_derive.cheng:118-125` 的 `StoragePlainTag`**：`ptr` 与既有 `cstring` 同判为 Plain，而 C 链 `cheng_cold.c:18480-18490` 的 **exact** helper 对 `SLOT_OPAQUE` 给 `UNKNOWN`。这是 `cstring` **今天就有**的 Cheng/C 口径差，本文未改、也未验证该差异在 `ptr` 上是否会造成实际行为分叉。
4. **Send/Sync 取值的语义裁定未做运行时验证**：本文选择「与 `cstring` 同列（false）」，理由是 `ptr` 是地址（`bootstrap/cold_parser.c:62378-62384`）。C 链没有对应的 Send/Sync 门禁可供对表，故这是**设计选择**而非既有语义的转录。若烤炉发现 stdlib 存在「`ptr` 跨线程传递」的合法用法，需要重新裁定。
5. **`ExactDefFreezeAuthorityParamDefinitionEdgeValid`（`exact_def_freeze.cheng:2799`）对 `var ptr` 形参的影响**：本文论证 `physicalRef=true` 与 C 链 `SLOT_OPAQUE_REF` 一致且更正确，但未构造 `var ptr` 形参的用例实测。
6. **`ptr[]`（`src/std/thread.cheng:262,271`）未单独验证**：本文只论证它走 `ParserTypeSyntaxSeq` 的元素子行，未实测该模块在新管线下的输出。
7. **`typeSyntaxTypeIds` 对 `ptr` 行的严格校验通过性未实测**：`typed_expr_type_arena.cheng:9015-9021` 的 `nominalRequiresResolution` 判据是从代码读出的契约，未跑 `TypedExprTypeArenaStrictValidateInto` 确认。
8. **其它拼写未处理**：`Ptr`（大写）、`ptr[T]`、`Pointer[...]` 均未纳入本次映射。`src/core/lang/parser.cheng:6501-6503` 把 `ptr[` 与 `Pointer[` 也列为标量类，但规范 `docs/cheng-formal-spec.md:570` 明确禁用 `ptr[T]`，且失败现场只涉及裸 `ptr`。
9. **未评估 artifact CID 变化的对外影响面**：本文只断言「不含 `ptr` 的输入零位移」，未逐一核验所有引用 `typeArenaArtifactCid` 的下游回执/基线文件（`compiler_snapshot_builder.cheng` 中 10+ 处写入点）是否另有外部冻结基线。

---

## 附：补丁改动清单（6 文件 / 29 增 10 删）

| 文件 | 改动 |
|---|---|
| `src/core/lang/typed_expr_type_arena.cheng` | 追加 `TypedExprStructuralScalarPtr` 枚举成员；`typedExprTypeArenaScalarKind` 认 `"ptr"`；intern 与重算两处 trait flags 排除 `Ptr`；两个 reserved 标量查询显式排除 `Ptr` |
| `src/core/tooling/compiler_csg.cheng` | `compilerCsgExactScalarLayoutInto` 把 `Ptr` 归入 8/8 组 |
| `src/core/backend/canonical_type_chain.cheng` | `Ptr` → `coreir.LocalPtrTag` |
| `src/core/csg_core/compiler_snapshot_schema.cheng` | 追加 `CsgCompilerScalarPtr = 16`；`csgCompilerScalarKindValid` 上界随之；可移植 trait 镜像排除 `Ptr` |
| `src/core/tooling/compiler_snapshot_builder.cheng` | arena scalar → 可移植序数映射加 `Ptr`；规范文本加 `"ptr"`；更新已过时的「Raw pointers have no TypeArena kind」注释（`:13954-13955`） |
| `src/core/analysis/exact_def_freeze.cheng` | 定长数组元素独立性谓词把 `Ptr` 列为地址叶（排除） |
