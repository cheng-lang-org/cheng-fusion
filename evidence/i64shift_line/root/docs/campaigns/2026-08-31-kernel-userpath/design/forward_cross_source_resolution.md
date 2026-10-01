# 前向跨源引用解析 · 架构设计

> 状态：**设计定稿（静态证据闭合）**；补丁 `patches/forward_decl_generic_window_index.patch` 已 `git apply --check` exit 0，**未编译**。
> 纪律：本轮全程只读源码 / grep，未运行任何编译、烤制、lldb。

## 补丁版本台账（**先读这条**）

| 版本 | sha256 | 基线树 | 状态 |
|---|---|---|---|
| r1 | `8f44b634aa3a8d5e94603bfa11588fb18d9fac9d664876ed70caa5495ea8d205` | `s1b_step3p` 落树后（22:03） | **作废**：主树随后又落了 `w40_textpath_module_const_fold` / `typearena_pinned_capacity` v2 / `tree_arena_column_census`，`git apply --check` 报 `patch failed: src/core/tooling/compiler_csg.cheng:33130` |
| **r2（当前）** | **`b02f8ce9338c77d6491e01de3fed6a03646b538654413df4379cc13cf62b9545`** | 现树（22:09，对应驱动 `kd_r9k` sha `0efa7629…`） | **有效且已在树上**（另一手落树，`kd_r9n` 实测确认泛型窗口类判词消失），`git apply --check` exit 0 |

**Step 3 补丁（独立文件；基线 = r9o，即 pre-step-3 纯态）**

**r9o 基线（落树验收的靶值，全 sha256）**
```
src/core/lang/typed_expr_type_arena.cheng  e6d16ece817072b4c18ec52da6d99ddaf5fb275469e4b10dabbbbdf5c5d5faba
src/core/tooling/compiler_csg.cheng        c2a6550d2bd98f2b2f4c13e68bd604138eaeca98c6ac73963fc950ca0b76d008
```

**可复原性台账（本轮新增纪律：每次覆盖同名补丁，必须留下上一版）**

| 版本 | sha256 | 可复原？ | 在哪 |
|---|---|---|---|
| r1 | `1a23cf8354b7bb4a46c6d6fb8b5f4221938ad2d77f7b91d9b13368af3e754909` | **否** —— 其编辑集已不在我侧，**无法重建**；且它从未编译通过，已作废 | 无 |
| r2 | `09381e9367ffa7aced416a96d4b791cb963738e490bbcf1dc621bae1707bd10f` | **是** | `patches/forward_typeid_deferred_replay_r2_revert_tool.patch`（同 sha，字节等价） |
| **r3（当前，已落树 = r9t）** | **`b507878aacef677df9e69e75d53b5c581fb43bb909dd1c56060fb9875cc94b7d`** | **是** | 规范路径 `patches/forward_typeid_deferred_replay.patch` **+ 存档副本** `patches/forward_typeid_deferred_replay_r3_archive.patch`（同 sha）。**L1 已过（三件对照逐字节 IDENTICAL）** |
| 探针 not-visible | `0d3d620b14e6e2f55516eb9e52872df3a1523cee8ce0358f52faa02243478ae6` | 是（3,922 B） | `patches/forward_typeid_not_visible_probe.patch`（纯诊断；`ptr` 已被他修真修清掉，本探针**已被取代、可不落**） |
| **探针 generic-owner（新，未落树）** | **`32f1f9353033813745efb09780ca3af69d9626e97266f1a07085f2f1b270b244`** | 是（2,189 B，+25/−0） | `patches/forward_typeid_generic_owner_probe.patch`（纯诊断，无行为变更、**无签名变更**，见 §10.25.6） |

**落 r3 之前必须先到 r9o**：若树上是 r2，用 `git apply -R patches/forward_typeid_deferred_replay_r2_revert_tool.patch` 退回 r9o（见 §10.23），再 `git apply patches/forward_typeid_deferred_replay.patch`。
**`_r2_revert_tool` 只用于回退，绝不可前向施加去当 r2 用**（它的用途只有一个：把 r2 态退回 r9o）。**`_r3_archive` 只是存档，不要施加**（与规范路径那份逐字节相同）。

| 版本 | sha256 | 状态 |
|---|---|---|
| r1 | `1a23cf8354b7bb4a46c6d6fb8b5f4221938ad2d77f7b91d9b13368af3e754909` | **作废**：编译不过（跨文件调用点未同步）。根因见 §10.22 |
| r2 | `09381e9367ffa7aced416a96d4b791cb963738e490bbcf1dc621bae1707bd10f` | **作废**：编译过了但**引入回归** —— L1 未过，四件正例 + `binary_types_via_import` 全部提前死在 `TypeArena production failed source_index=0: TypeSyntax authority incomplete`。根因是**缩进块切断裂表**，见 §10.22 |
| **r3（当前）** | **`b507878aacef677df9e69e75d53b5c581fb43bb909dd1c56060fb9875cc94b7d`** | **有效**，对 r9o 基线 `git apply --check` exit 0。15 hunk，csg 100% 纯插入 |

详见 §10.14（记录）、§10.15（逐块自检）、§10.16/§10.21（调用点审计）、§10.22（本轮根因与设计变更）。

**r1→r2 是纯文本 rebase：语义与断言集一字未改。** 差异只在 `compiler_csg.cheng` pass-0 的锚点上下文——`var forestDeclarationBase: int32` 与 `for sourceIndex in …` 之间重新出现了一段 `# [U0-cut]` 注释（7 行），使 r1 的 hunk 上下文失配；arena 文件的 20 个 hunk 逐字节未变（r1 时 arena 文件的 `git apply --check` 本就是通过的）。

**并发改动提示（保留）**：写作期间另一手于 `22:02` 把 `patches/s1b_step3p_forward_declaration_failclosed.patch`（三处 forward-decl 守卫）落进了共享主树，§6.2 / §7 已按该状态重写。**主树仍在被他人改动**：落补丁前必须重跑 `git apply --check`。

---

## 0. 结论（先行）

**选第三条：候选 1 与候选 2 是同一件事的两半，缺一不可；必须同时做，但可以分两步独立落树。**

- **第 1 半（= 候选 1 的可实现内核）**：把「声明面」中**纯 parser 事实**的那部分（声明根的泛型符号窗口）从**逐源前缀列**提升为**已 seal 索引里的全局表**。它不是「只加索引列」——原方案被否是因为索引里没有这列且加列补不上 TypeId；这里**补的正是索引里缺的那列**，且它必须补。
- **第 2 半（= 候选 2）**：TypeId 只存在于顺序生产的未来，任何**保字节**方案都必须**延迟绑定**。这不是权衡，是定理（§2.2）。

**一句话理由**：`typeCount` 是跨源共享单调计数器，`ResolveNominal` 把声明根的 TypeId 当作 nominal 的 TypeId 返回（`typed_expr_type_arena.cheng:1802-1816`），所以前向边的目标 TypeId 是**未来的值**；而「`Base[...]` 是定长数组还是泛型应用」的判据只需要**解析器事实**，它在 pass 0 就齐全。把前者做成延迟绑定、把后者做成全局表，既不改物化顺序、也不改一个字节的 `artifactRaw32`。

**最小第一步**：`patches/forward_decl_generic_window_index.patch`（25 hunk，2 文件）——索引新增 `declarationGenericSymbolStarts/Counts` 两列 + build state 播种 + 三处窗口读点切到全局表 + 剩余前向读点 fail-closed。**不改 arena 任何列、不改哈希面、不重排 `orderedSources`、不动 `pinnedArenaBytes`。**

---

## 1. 事实面（逐条可复现）

| # | 事实 | 坐标 |
|---|---|---|
| F1 | 物化顺序 = `orderedSources`，按路径/模块对排序，非依赖序 | `src/core/tooling/compiler_csg.cheng:26881`；驱动循环 `:35701-35848` |
| F2 | 逐源驱动 pass 0 已把**每个源**解析过一遍并释放，产出 sealed `TypedExprTypeDeclarationIndex` | `compiler_csg.cheng:33147-33238`（parse + `TypedExprTypeDeclarationIndexBuildSourceInto` + `Release`） |
| F3 | 权威相解析 **已跨源**：`ResolveUnqualified/Qualified` 查的就是 sealed 索引，返回的 `declarationRoot` 是**全局行**，可能是后面源 | `typed_expr_type_arena.cheng:4699-4831`（`add(out.declarationRootTypeSyntaxNodeIndexes, declarationRoot)` 在 `:4789`/`:4831`） |
| F4 | 消费相读 `typeSyntaxGenericSymbolStarts/Counts`，该列**预留全长、逐源追加**（`len` = 已物化前缀） | 预留 `:3979-3980`；追加 `:6402-6413` |
| F5 | `ArenaArrayInt32Get` 在 `i >= arr.len` 时 `panic`（**有界检查，不是静默**） | `src/core/runtime/arena.cheng:399-404` |
| F6 | ⇒ `declarationRoot >= len` ⟺ "声明在后面的源" ⇒ **panic 无坐标** | 撞墙点 `typed_expr_type_arena.cheng:1873-1955`（preflight），同类读点在 `:7151-7156`、`:6094-6098`、`:1945-1950` |
| F7 | TypeId = `typeCount` 运行计数器；声明根的 TypeId 在**该源被 append 时**由 `ReserveAggregate` 产生 | `:1300`（`let typeId = localOut.typeCount`）、`:1381-1384`（`typeCount+1` 后 `ArenaArrayInt32Set(typeSyntaxTypeIds, declarationRoot, typeId)`） |
| F8 | `ResolveNominal` 把声明根 TypeId 原样返回，前向边下该行**不存在** | `:1675-1817`，读点 `:1802-1806` |
| F9 | **已有延迟绑定先例**：`PendingGenericApply` 队列 = append 期入队、seal 期出队、`ArenaArrayInt32Set` 回填 `childTypeIds`/`traitPremiseTypeIds` 的 `-1` 槽 | 结构 `:397-401`；出队 `typedExprTypeArenaSpecializePendingRec` `:7621`、回填 `typedExprTypeArenaPatchPendingApplyRec` `:7683` |
| F10 | `typeSyntaxGenericSymbolStarts/Counts` **在哈希面内**（`artifactRaw32` 覆盖它们） | `typedExprTypeArenaHashMaterialized` `:733-941`，两列在 `:783`/`:785` |
| F11 | `TypedExprTypeDeclarationIndex` **不在哈希面内**、无外部消费者（只被 `compiler_csg.cheng` 与本模块读） | 哈希函数全列已枚举（`:746-941`），索引未出现；消费者 `compiler_csg.cheng:33085/35618/39162` |
| F12 | arena 容量 = 「按全林 limits 精确预留」，并在 append/seal 末尾断言容量未越 pin。**`typearena_pinned_capacity` v2（`acc9df83…`，现树）**：pin 值 = `max(预算, 地板)`（地板具名化），谓词 = `capacity > pinned`（原为 `!=`，会误报 `capacity=1048576 pinned=6020`），并加了安装校验 | `TypedExprTypeArenaPinnedArenaBytes` `:7760-7770`（= Limits + TypeSide + Residual）；`TypedExprTypeArenaPinnedCapacity` `:7780-7788`；断言 `typedExprTypeArenaRequirePinnedCapacity` `:7862-7872`；安装校验 `:7916-7921` |
| F13 | 全林驱动 `TypedExprTypeArenaBuildFromParserTreeInto` **是活的**（生产调用方 `src/core/lang/typed_expr.cheng:2097`），其整林一次 append ⇒ 前缀列在 preflight 前已满，故今天不撞 F6 | `:8070-8112`；`typed_expr.cheng:2097` |
| F14 | 234 源闭包的精确读数：`type_syntax=157503`、`declaration_symbols=1314`、`generic_symbols=14`、`column_bytes=70,931,312` | `docs/campaigns/2026-08-31-kernel-userpath/design/s1b_step3_progress.md:440` |
| F15 | `patches/s1b_step3p_forward_declaration_failclosed.patch` 的**三处 fail-closed 守卫已在树上**（写稿期间由另一手于 `22:02` 落地）：把 F6 的 panic 换成**具名判词**，但**不解决**前向引用 | 现树行号：`ResolveNominal:1793`、preflight`:1925`、`InternSyntaxRec:7168`；复现：`grep -n "forward-declaration OOB" src/core/lang/typed_expr_type_arena.cheng` |

---

## 2. 为什么必须是「两半」

### 2.1 声明面为什么必须全局预物化

判据只有一处：`Base[Args]` 里 `Base` 的声明根**有没有泛型窗口**：
- 有 ⇒ 泛型应用，要校验 `argCount ∈ (0, genericCount]`，缺省参数走 `genericSymbolStart + offset`；
- 无 ⇒ 定长数组，长度必须来自 `bracketConstLengths[row] > 0`。

这**三个读点全部只用 parser 事实**：
- `genericSymbolStart/Count` = `ParserValueExprTypeSyntaxGenericSymbolStartAt/CountAt(tree, root)`（`parser` 侧，pass 0 的树里就有，追加点 `:6402-6413` 用的就是它）；
- 唯一需要**arena 生产结果**的是 TypeSyntax→TypeId 的映射（`typeSyntaxTypeIds`），那属于第 2 半。

所以「窗口」这一半**可以而且必须**提前到任何源常驻之前。当前实现把它写进逐源前缀列，纯属**载体选错**，不是数据不可得。closure8 已经证明这条路的形状是对的：`declarationSymbolGlobalRoots` 就是「森林序、下标即 SymbolId」的平铺表先例（`:123-134`、播种点 `:4881-4918`）。

### 2.2 TypeId 为什么必须延迟绑定（定理）

设生产顺序 `[scalars=15 rows] , agg(s0) , intern(s0) , agg(s1) , intern(s1) , …`。`ReserveAggregatesRec`（`:6942-6986`，按 SymbolId 序）在每个源 append 的**开头**跑，`InternSyntaxRec` 在**其后**跑。于是 `agg(s_j)` 的 TypeId = `15 + Σ_{i<j}(|agg(s_i)| + |intern(s_i)|) + …`——**依赖所有前驱源的完整生产**，无法在任何源常驻之前算出。

推论（三条，互斥且穷尽）：
1. **保字节** ⇒ 编号不能动 ⇒ 前向 TypeId 只能**推迟绑定**（= 候选 2，不可回避）；
2. **不保字节** ⇒ 把全部 aggregate 提前到所有 intern 之前（`[scalars, agg(all), intern(s0), …]`）⇒ 全 TypeId 面重编号 ⇒ `artifactRaw32`、收据、CID 换代。**本设计明确否决**，但它确实是"唯一结构上更简单"的完整解，代价是新一代身份；
3. 改 `orderedSources` 为依赖序 ⇒ 全局行基址 + TypeId 序双变 ⇒ **本轮明令禁止**（且注意：即使重排，`tokenBase/genericSymbolBase/functionBase` 这些**基址**可以换成索引里的前缀和而保持行基址不变，唯一变的是 TypeId 序——所以「重排」并不比方案 2 更省，反而同时踩两条线）。

### 2.3 为什么「只加索引列」被否、而本设计仍然要加索引列

原否决理由成立：**只加列补不上 TypeId**。本设计不否认，而是把它降格为第 1 半：
- 第 1 半（加列）**单独就能消掉当前 panic**，且字节中性、可独立验证；
- 第 2 半（延迟绑定）才是让 234 源真正走完的那一半。

---

## 3. 方案

### 3.1 第 1 半：声明面全局预物化（本次补丁）

**数据面**：`TypedExprTypeDeclarationIndex` 新增两列，行空间**与 `declarationSymbolGlobalRoots` 完全一致**（森林序、每行 = 一个 `typedExprTypeArenaDeclarationCreatesSymbol` 接受的声明根、下标即 SymbolId）：

```
declarationGenericSymbolStarts: int32[]   # 该根的 GLOBAL 泛型符号起点（无泛型 = -1，与 arena 列同一 rebase 规则）
declarationGenericSymbolCounts: int32[]   # 该根的泛型符号个数
```

- **取值点**：pass 0 的**同一次谓词遍历**（`typed_expr_type_arena.cheng:3745-3747` 那个 `for symbolRoot`）里多两行 `add`，用与 arena 列**同一个** `typedExprTypeArenaRebaseRow` 规则；
- **基址来源**：pass 0 新增 `forestGenericSymbolBase` 累加器（`compiler_csg.cheng:33139-33141` 旁边），推进量 = `sourceTree.typeGenericSymbolCount`，与生产相 `genericSymbolBase`（`:35841-35843`）**同一个被加数** ⇒ 两个前缀和逐项相等（这是可证明相等，不是巧合）；
- **播种点**：`typedExprTypeArenaBuildStateInitInto`（`:4881-4918`）——与 closure8 对 `symbolByDeclarationRoot` 的做法**逐字同构**；
- **读点**：新 accessor `typedExprTypeArenaDeclarationGenericWindowAt(state, declarationRoot, startOut, countOut, err)`，先在 `symbolByDeclarationRoot` 里把全局 root 折成 SymbolId，再查两列。切 3 处：preflight `:1909-1929`、`InternSyntaxRec` `:7151-7156`、`CompleteGenericArgumentsInto` `:6094-6098`。

**全林驱动一致性**：`TypedExprTypeArenaBuildFromParserTreeInto`（`:8070-8112`）没有索引，新增一个孪生遍历 `typedExprTypeArenaAppendDeclarationGenericWindowsFromTreeInto`（同一谓词、同一行序；整林树的泛型行已是全局，base=0）。两个驱动喂给 build state 的是**同一批整数**。

### 3.2 第 2 半：TypeId 延迟绑定（第 3 步，本设计给出形状与判词，未出补丁）

**照抄 F9 的既有 pending 形状**，不新造机制：

```
typedExprTypeArenaPendingForwardNominal = ref object
    nominalTypeSyntaxNodeIndexes: int32[]   # 消费源 k 里的 nominal 行（全局行）
    declarationRoots: int32[]               # 目标声明根（全局行，来自 authority）
    authorityRows: int32[]                  # 产生它的权威行（精确生产者事实）
    consumerSourceIndexes: int32[]          # 判词与"树是否常驻"用
```

- **入队时机**：`ResolveNominal` 发现 `declarationRoot >= typeSyntaxTypeIds.len` 时（今天 panic 的点，`:1802`），入队并**不写** `typeSyntaxTypeIds[nominalRow]`，把"基未绑定"作为显式状态传给调用者；
- **连锁阻塞**：postorder 下父行晚于子行（`:7186-7188` 已证 `childNode < typeSyntaxNodeIndex`），所以名义行阻塞 ⇒ 其祖先（`BracketApply`/`Borrow`/`Seq`/`Optional`/字段声明）**全部阻塞**，原序入队；
- **出队时机**：源 j append 完成之后（`AppendSourceFromTreeInto` 末尾）。此时代理行、`typeSyntaxTypeIds[declarationRoot]` 均已存在；
- **出队动作**：按**入队序**（= postorder = 确定性）重放被阻塞子树的 interning，并**回填**留作 `-1` 的槽：`typeSyntaxTypeIds[nominalRow]`、父 Apply 的 `childTypeIds[childStart + 0]`、`traitPremiseTypeIds[...]`；
- **去重风险（必须正视）**：`typedExprTypeArenaIntern` 会做结构去重，用占位子 TypeId 去 intern 会造出**重复的 type 行** ⇒ `typeCount` 变 ⇒ 哈希变。所以第 2 半的硬约束是：**父行必须在子 TypeId 绑定之后才 intern**，不允许"先占位后 patch"。这也意味着出队必须**重放 interning**，而 `InternSyntaxRec` 目前仍吃 `tree` 参数（`:6991-7013` 用 `parser.ParserValueExprTypeSyntaxKindAt(tree, treeRow)`）——源 k 的树在出队时已经释放。
  ⇒ **第 2 半的前置条件是 `InternSyntaxRec` 彻底去树**（把仅剩的 kind 读改成 `typedExprTypeArenaSyntaxKindAt(value, row)` 列读，preflight `:1898` 与 BracketApply 分支 `:7147` 已经是这么读的）。这条**未验证**，列在 §7。

---

## 4. 身份与确定性

| 维度 | 回答 |
|---|---|
| 跨节点身份 | **精确 int32**：`declarationRoot`（全局 TypeSyntax 行）→ `state.symbolByDeclarationRoot[root]` = **SymbolId** → 表行。SymbolId 是「森林序、下标即身份」的稠密行（closure8 已定；`typed_expr_type_arena.cheng:123-134`）。**不引入** name+arity、文本、源码行、裸指针任何近似键 |
| 容器纪律 | 两列是 `int32[]`，与 `declarationSymbolGlobalRoots` 同类；DAG 由「一个 root 恰一个 SymbolId」保证（`:4911-4917` 的 `!= -1` 断言已经在树上）。只在 build state / 索引上加**平铺 SoA 列**，不碰 arena 布局 |
| 是否引入新哈希面 | **否**。F10/F11 两条互补：索引不被 `typedExprTypeArenaHashMaterialized` 枚举；本补丁**不增不删不改** arena 任何列，三处读点切到全局表后返回**同一整数**（由 §6 的 seal 等式证明强制） |
| 是否引入新 CID 面 | **否**。`artifactRaw32` 输入集不变（值不变、列长不变） |
| 第 2 半的哈希风险 | **有且只有一个**：interning 去重若被占位值扰动 ⇒ `typeCount` 变。§3.2 的硬约束（先绑定后 intern）就是为消掉它；这也是第 2 半必须配"seal 期 typeCount/列长等式"验证的原因 |

---

## 5. 与既有预算的关系

- **新增内存（第 1 半，234 源闭包，按 F14 实测 `declaration_symbols=1314`）**：
  - 索引 2 列：`2 × 1314 × 4 B = 10,512 B`（常驻于 pass0→生产相之间，索引本来就在）；
  - build state 2 列：同 `10,512 B`；
  - **合计 ≈ 21 KB**，相对 `column_bytes = 70,931,312 B` 是 **0.03%**，相对 pass0 实测 `rss = 772,146,208 B` 是 **0.003%**。全林驱动按同一谓词遍历，量级相同。
- **`pinned capacity` 断言（F12，**已按 `typearena_pinned_capacity` v2 重核**）**：**不受影响，且原理上不可能触发**。
  - v2 后的判词谓词是 `capacity > state.pinnedArenaBytes`（**不再是 `!=`**；`typed_expr_type_arena.cheng:7862-7872`），pin 值来自新函数 `TypedExprTypeArenaPinnedCapacity(limits, err) = max(TypedExprTypeArenaPinnedArenaBytes(limits), TypedExprTypeArenaInitialArenaBytes)`（`:7780-7788`，**地板具名化**），并且在 `AllocateFromLimitsInto` 里多了一条**安装校验** `installedCapacity != pinnedArenaBytes`（`:7899`、`:7916-7921`）。
  - 这三项都只约束**arena 容量**，而 `pinnedArenaBytes` 的预算项是 `LimitsColumnBytes + TypeSideColumnBytes + ResidualColumnBytes`（`:7760-7770`）对 **arena 列**的枚举。本补丁的新列全部是**索引对象 / build state 上的普通 Cheng 堆数组，不在 arena 内**，一个字节也不进 arena ⇒ 预算不变、地板不变、安装校验不变、`capacity > pinned` 恒不成立。
  - 第 2 半的队列同理（`PendingGenericApply` 就是 `int32[]`，`:397-401`）。
- **若将来要加 arena 列**（例如把泛型缺省节点也搬进 arena），则必须同时改 `TypedExprTypeArenaResidualColumnBytes`（`:7725-7731`，按 limit 的"每行多少字"计价）或 `TypeSideColumnBytes`，否则 v2 的谓词会以命名判词 `pinned capacity overrun phase=… capacity=… pinned=…` 硬失败。**本设计不需要付这笔账。**

---

## 6. fail-closed 判词（禁止 fallback / 静默降级）

本设计**不引入任何 fallback**：查不到就是缺陷，直接 `return false` 并带坐标。

### 6.1 本次补丁新增/改写的判词

| 判词（`err` 字符串前缀统一 ` typed expr type arena: `） | 位置 | 携带坐标 |
|---|---|---|
| `declaration generic window shape invalid symbols={} starts={} counts={}` | 索引 seal 后（`LimitsFromIndexInto`） | 三个长度 |
| `declaration generic window row invalid symbol={} start={} count={} generic_symbols={}` | 同上，逐行 | SymbolId、窗口、泛型总数 |
| `declaration generic window seed invalid symbols={} starts={} counts={}` | `BuildStateInitInto` | 三个长度 |
| `declaration generic window root out of range declaration_root={} type_syntax={}` | 新 accessor | 全局 root、typeSyntax 总数 |
| `declaration generic window symbol unmaterialised declaration_root={} symbol={} symbols={}` | 新 accessor | root、SymbolId、表长 |
| `bracket preflight declaration window failed bracket_row={} base_row={} authority_row={} view_base={} view_rows={}: {内层}` | preflight | 5 个坐标 + 内层判词 |
| `generic apply declaration window failed bracket_row={} base_row={} authority_row={}: {内层}` | `InternSyntaxRec` | 3 个坐标 |
| `generic argument declaration window failed declaration_root={} bracket_row={}: {内层}` | `CompleteGenericArgumentsInto` | 2 个坐标 |
| `nominal declaration is not materialised nominal_row={} declaration_root={} materialised={} total={}` | `ResolveNominal`（**树上已有，本补丁保留不动**，见 §6.2） | 4 个坐标 |
| `generic default is not materialised bracket_row={} base_row={} authority_row={} generic_symbol_row={} materialised={} total={}` | preflight 缺省循环 | 6 个坐标 |
| `generic default is not materialised declaration_root={} bracket_row={} generic_symbol_row={} materialised={} total={}` | `CompleteGenericArgumentsInto` | 5 个坐标 |
| `declaration generic window drift symbol={} root={} index_start={} arena_start={} index_count={} arena_count={}` | **seal 期等式证明**（新增） | 两张表的两次读数 |

最后一条是本设计的**字节中性证明**：seal 时所有源都已 append，索引表与 arena 列都是完整的，逐 SymbolId 比 `index_start/count == arena_start/count`。全 1314 行相等 ⇒ 三处切换后的读点返回 arena 自己会返回的数 ⇒ `artifactRaw32` 逐位不变。**它不是自检，是可执行的等价断言。**

### 6.2 与树上既有 fail-closed 守卫（`s1b_step3p`）的关系

该补丁的三处守卫**已经在树上**（F15），本补丁按"读点整体替换"处理，取舍如下：

| s1b_step3p 守卫 | 本补丁的处置 | 理由 |
|---|---|---|
| `ResolveNominal` `:1793`（判词 `nominal declaration is not materialised nominal_row=… declaration_root=… materialised=… total=…`，条件 `declarationRoot >= localOut.typeSyntaxDeclarationOwnerTokenIndexes.len`） | **保留不动** | 该列与 `typeSyntaxTypeIds` 都由同一个 `FillTypeSyntax` 逐源 `Add`（`:6350` 与 `:6388-6394`），两者 `len` 恒等 ⇒ 这是**同一条件的等价且更早**的守卫。本补丁**不再重复加**自己的 TypeId 守卫（避免同一条件两个判词） |
| preflight `:1925`（`bracket base declaration is not materialised …`） | **删除**（本补丁把该读点换成索引查表，守卫变死代码） | 换掉的是**数据源**，不是绕过检查：查不到会走 `declaration generic window root out of range` / `symbol unmaterialised` 两条新判词 |
| `InternSyntaxRec` `:7168`（`generic declaration is not materialised …`） | **删除**（同上） | 同上 |

⇒ **本补丁落地后，"前向 ⇒ panic" 与 "前向 ⇒ 具名判词" 两件事都只剩一个归宿**：窗口类前向由索引查表**正确回答**；TypeId 类前向由 `ResolveNominal` 的既有守卫给出具名判词。树上不会同时存在两条对同一条件的判词。

### 6.3 第 2 半的判词（未出补丁，先定名）

| 场景 | 判词 |
|---|---|
| 队列未清空即 seal | ` typed expr type arena: forward nominal queue not drained rows={} first_nominal_row={} first_declaration_root={}`（`SealInto` 入口，硬失败） |
| 出队时目标 TypeId 仍不可用 | ` typed expr type arena: forward nominal drain target unavailable nominal_row={} declaration_root={} consumer_source={} target_source={} materialised={} total={}` |
| 出队后 typeCount 与列长漂移 | ` typed expr type arena: forward nominal drain type count drift before={} after={} columns={}` |

**"绝不静默降级"的落地**：队列只允许"出队并绑定"或"seal 前报错"两种归宿；不存在"用 -1 / 用 SymbolId 近似代替 TypeId / 跳过该行"的分支。第 2 半落地时必须能 grep 到"3 个判词 + 0 个默认值"。

---

## 7. 最小落地步（每步可独立落树、独立验证）

### Step 1（本补丁，`patches/forward_decl_generic_window_index.patch`，24 hunk / 2 文件）

改：`src/core/lang/typed_expr_type_arena.cheng`（索引 2 列 + seal 期两处校验 + build state 2 列 + 新 accessor + 新全林孪生遍历 + 3 处读点切换 + preflight/缺省 2 处 fail-closed 守卫 + seal 等式证明），`src/core/tooling/compiler_csg.cheng`（pass 0 `forestGenericSymbolBase` 累加器 + 2 个调用点参数）。**相对 s1b_step3p 净删 2 处守卫、新增 3 条判词**（见 §6.2）。

**期望判词变化**：preflight 的 `bracket base declaration is not materialised …` **不再出现**（窗口已被正确回答，不再是"查不到"）；`InternSyntaxRec` 的同名判词同理。若该夹具仍有前向 nominal，下一堵墙应是 `ResolveNominal` 那条**已在树上**的具名判词 `nominal declaration is not materialised nominal_row=… declaration_root=… materialised=… total=…`。

**怎么证"没坏别的"**：
1. `seal` 期等式证明全绿（1314/1314 行相等）——这是"索引表 == arena 列"的可执行证据；
2. A/B 逐字节：同一输入跑**全林驱动**（`typed_expr.cheng:2097` 路径）与**逐源驱动**，产物 `CMP=IDENTICAL`。全林驱动今天不撞墙，是天然对照；
3. 回归门：`.rebuild/s1b_step3/gate_run.sh <tag> <driver>`（`forest_appended` 读数）+ `docs/campaigns/2026-08-31-kernel-userpath/fixtures/` 四夹具；
4. **若设计错了，最先在哪条判词暴露**：`declaration generic window row invalid …`（前缀和算错 ⇒ 窗口越界）或 `declaration generic window drift …`（索引与 arena 不一致 ⇒ rebase 规则抄错）。这两条**优先于**任何下游判词，一出现即说明第 1 半的算术假设被推翻。

**编译级陷阱自查（本轮已发生 3 次）**——插入块的标识符在该点是否已绑定，逐块核过：

| 插入块 | 用到的标识符 | 该点已绑定？ |
|---|---|---|
| 新 accessor 体 | `state`/`declarationRoot`/`startOut`/`countOut`/`err`（形参）、`symbolId`（上一行 `let`） | ✓ |
| 索引遍历（limits） | `index`/`candidate`（形参/上文 `var`）、`windowSymbolId`/`windowStart`/`windowCount`（本块 `let`） | ✓ |
| `BuildSourceInto` 两个 `add` | `genericSymbolBase`（**新形参**，入口即绑定） | ✓ |
| `BuildStateInitInto` 播种 | 4 个形参 + `state`（`:4904` 已 `new`）+ `err` | ✓ |
| 全林孪生遍历 | 4 个形参 + `row`（循环变量） | ✓ |
| 全林调用点 | `declarationGenericSymbolStarts/Counts`（紧邻上一块 `var`） | ✓ |
| preflight `genericStart` | 与 `genericCount` 同层声明、**先于** `let argCount` 与下游缺省循环 | ✓ |
| `InternSyntaxRec` | `declarationGenericStart`（`var` 在其使用点之前）、`state`/`declarationRoot`/`authorityRow`/`baseTypeSyntaxNode`/`typeSyntaxNodeIndex` 上文已绑 | ✓ |
| `CompleteGenericArgumentsInto` | `genericSymbolStart/Count`（`var` 在使用点之前）、`state`/`declarationRoot`/`typeSyntaxNodeIndex`/`localOut`/`err` | ✓ |
| seal 等式函数 + 调用 | `value`/`state`/`err`；调用点在 `symbolCount == declarationSymbolTotal` 断言**之后**（`declarationSymbolTotal` 才能安全当上界） | ✓ |
| `compiler_csg` 累加器 | `forestGenericSymbolBase`（`var` 声明在 `forestDeclarationBase` 之后）、`sourceTree`（上文已绑） | ✓ |

**本补丁不碰**：`ResolveNominal` 的既有 s1b_step3p 守卫、`originProducerSourceIndexes`（s1b_step3p 里另有一段改动，与本设计无关）。

### Step 1 · r2 rebase 逆向验证记录（本轮实测，未编译）

命令：`tools/cheng_scratch_scope.sh fwdverify… python3 <生成器/校验器>`（仓库源文件**只读**；正向/反向施加全部发生在 scratch 目录，退出即删）。

| 检查 | 结果 |
|---|---|
| `git apply --check`（现树） | **exit 0** |
| 正向施加到现树副本 → `git apply -R` 回退 → 与仓库现文件逐字节比对 | **两文件均 IDENTICAL**（arena 534,603 B / csg 2,168,088 B） |
| `/usr/bin/diff -u <现树> <正向施加后>` 回生成 → 用 `/usr/bin/patch` 施加回基线 → 与 `git apply` 结果比对 | **两文件均 identical=True**（rc=0） |
| 回生成 diff 与补丁自身的 +/- 行序列 | **多重集完全相等**（`only-in-regen=0 only-in-patch=0`）；仅 **1 行对齐位移**（GNU diff 把 R10 插入块里重复的 `@borrows` 当成上下文对齐，difflib 当成插入）⇒ 纯排版差异，文件内容一致 |
| 越界改动 | **无**。34 行删除**逐条可归属**：R14 preflight 守卫+旧读点（15）、R15 `InternSyntaxRec` 守卫+旧读点（9）、R16 `CompleteGenericArgumentsInto` 旧窗口读点（9）、R5 单行条件替换（1）；全部在声明的替换集内 |

行数账（`HUNKS` 读数）：

```
typed_expr_type_arena.cheng  total=20  pure-insertion=16  with-deletions=4  -34  +217  ctx=139
compiler_csg.cheng           total=4   pure-insertion=4   with-deletions=0  -0   +6    ctx=24
TOTAL: 24 hunk, 20 纯插入 / 4 含删除, 删除 34 行, 新增 223 行
```

⇒ **"纯插入/零替换"结论：不在字面上成立，且不应成立。** 24 个 hunk 中 20 个是纯插入；4 个含删除，删的正是"旧读点 + 已成死代码的 s1b_step3p 守卫"（§6.2 的声明取舍）。**除这 34 行外没有任何上下文改动。**

### Step 1 · 与 `s1b_step3p` 守卫的语义冲突复核（要求 #4，结论：**不冲突，未停下**）

| 守卫（现树行号） | 与"整体替换读点"是否冲突 | 判据 |
|---|---|---|
| `ResolveNominal:1793` `declarationRoot >= localOut.typeSyntaxDeclarationOwnerTokenIndexes.len` | **不冲突，保留** | 它拦的是 **TypeId 类**前向边（`typeSyntaxTypeOwnedToken indexes` 与 `typeSyntaxTypeIds` 由同一个 `FillTypeSyntax` 逐源 `Add`，`len` 恒等）。我的新列回答的是**泛型窗口**，不是 TypeId，覆盖不到它，也没有把它的路径提前拦掉 |
| preflight`:1925` `declarationRoot < 0 \|\| >= value.typeSyntaxGenericSymbolCounts.len` | **不冲突，删除** | 它是"前缀列还没物化"的判据。新 accessor 的拒绝集是**超集**：`declarationRoot < 0`、`>= state.symbolByDeclarationRoot.len`（= `typeSyntaxCount`）、`symbolId < 0`、`symbolId >= 表长` 全部报错；而对"前缀短但声明真实存在"的行，从"报错"变成"正确回答"。**没有任何路径从"有检查"退化为"无检查"** |
| `InternSyntaxRec:7168` 同上 | **不冲突，删除** | 同上一行；且该分支内 `symbolId < 0` 的原有检查**一字未动**，断言集不减 |

⇒ **不需要停下报你**：没有"守卫提前拦掉导致新列在某路径上不再被需要"的情形；两处删除都是"守卫的触发条件被新列彻底消灭"，而不是"守卫把新列短路了"。

### Step 2：泛型缺省/约束节点的全局行（小步，字节中性）

索引再加 1~2 列，键 = **泛型符号行**（不是 SymbolId；闭包内总数 = 14，见 F14），值 = 该泛型符号的 `defaultTypeSyntaxNode` / `constraintTypeSyntaxNode` 的**全局行**（pass 0 纯 parser 事实，`genericSymbolCountBySource` 前缀和 rebase）。切 `CompleteGenericArgumentsInto:6116-6120` 与 preflight `:1945-1950`。
**期望判词变化**：`generic default is not materialised …` 消失，墙推进到 `nominal declaration is not materialised …`。
**验证**：同 Step 1 的 seal 等式（再加一组 drift 判词）+ A/B 逐字节。

### Step 3：TypeId 延迟绑定（第 2 半，前置未验，见 §8）

前置：`InternSyntaxRec` 去树（把 `:7010` 的 `tree.typeSyntaxCount` 与 `:7013` 的 `parser.ParserValueExprTypeSyntaxKindAt(tree, treeRow)` 改成 arena 列读）。然后入队/出队/回填三件套 + §6.3 三条判词 + "seal 前队列必须为空"硬断言。
**期望判词变化**：`nominal declaration is not materialised …` 消失；234 源门内 `forest_appended` 从当前读数推进（目标 234）。`binary_types.cheng` 经 import 夹具应能过 preflight 与 nominal 解析这两段。
**验证**：A/B 逐字节（全林 vs 逐源）+ 门内 `forest_appended=234` + `declaration generic window drift` 仍全绿 + **`typeCount` 等式**（出队前后列长不变）。

---

## 8. 验证计划

| 目的 | 手段 | 期望读数 | 设计错了会先死在哪 |
|---|---|---|---|
| 字节中性（最重要） | 同输入 A/B：全林驱动（`typed_expr.cheng:2097`）vs 逐源驱动，同 `--out` | 产物 `CMP=IDENTICAL` | `declaration generic window drift symbol=… arena_start=…` |
| 索引算术 | Step 1 的 seal 等式证明 | 1314/1314 行相等 | `declaration generic window row invalid symbol=… start=… count=…` |
| panic 消除 | `binary_types_via_import` 夹具（campaign fixtures） | 末行不再是 `arena array: read out of bounds`，也不再是 `bracket base declaration is not materialised` | 若仍是 panic ⇒ 还有未列出的前缀列读点（见 §9） |
| 单文件验收 | `src/chain/binary_types.cheng` 经 import 夹具，`rc=0` | 见 `deterministic_model_derivation.md:561` 的三条验收 | `nominal declaration is not materialised …`（Step 1 后的预期墙，Step 3 才消） |
| 门内 | `.rebuild/s1b_step3/gate_run.sh <tag> <driver>`（默认 768 MiB 门） | `forest_appended=234` 且无 `rss_limit_exceeded` | 注意 F14 的 `rss=772 MB` 是**抬门诊断**读数，门内预算须按 §5 的 21 KB 重算，本改动不构成压力 |
| 回归 | `tools/user_path_gate.sh --driver <kernel_driver>` 四夹具 vs `user_path_baseline.tsv` | 逐项一致 | 任一 `BASELINE-STALE` |

**注意口径**：`s1b_step3_progress.md` 记录过环境漂移使默认门对**未改动基线**都不可达；任何门内结论必须先确认基线在同窗口能跑到 `forest_parsed=234`，否则记"无有效对照"，不得记 DIFFER。

---

## 9. 未测项（诚实清单）

0. **共享主树在写作与被要求 rebase 期间被另一手改动两次，补丁已重基两次**。`22:02` 落了 `s1b_step3p`；`22:09` 前又落了 `w40_textpath_module_const_fold` / `typearena_pinned_capacity` v2（`acc9df83…`）/ `tree_arena_column_census`（`655c6856…`），当前树对应驱动 `kd_r9k`（sha `0efa7629…`）。现在的补丁（r2，sha256 `b02f8ce9…`）是对**22:09 现树**做的 `git apply --check` exit 0。**这个 sha 只在那一瞬间有效**——落补丁前必须重跑 `git apply --check`，不要假定它仍然适用。台账见文首。
1. **未编译**。补丁只做了 `git apply --check`（exit 0）与逐块标识符绑定审查（§7 表）。任何语法/类型错误（例如 `@borrows` 对新 accessor 的借用证明、`Fmt` 插值里 `state.symbolByDeclarationRoot.len` 的求值）**没有被编译器验过**。
2. **`InternSyntaxRec` 去树的工作量未验证**。Step 3 的前置条件（把 `:7010`/`:7013` 的树读换成列读）我只读到「`s1b_step3_progress.md` 声称 `s1b_1c_seal_arena.patch` 删过 tree 形参」，但**当前树里 `tree` 形参还在**（`:6991`，去树后行号会漂）。两者矛盾，我按当前树的实况记录，未去追该补丁历史。
3. **Step 3 的去重风险未量化**。我没有验证"重放 interning"是否真的能复现 `typedExprTypeArenaIntern` 的原去重结果；如果被阻塞子树重放时上下文不同（例如 `state.fieldCount` 游标、`bucketNext/bucketHeads` 链），`typeCount` 仍可能漂移。这是本设计**最大的未验证风险**。
4. **尚未穷举所有前向读点**。我按 grep 覆盖了三处复用点与两处缺省读点，并用「postorder ⇒ 子先于父」论证 `ResolveNominal` 是 preflight 之后的第一堵墙；但**没有静态穷举**所有读前缀 arena 列的位置（例如 `:5920`、`:7319`、`:7493`、`:8179`、`:8342`、`:8553`、`:9277` 等处的 `typeSyntaxGenericSymbolCounts`/`typeSyntaxTypeIds` 读点，它们多在 seal 相，理论上安全，但未逐条证明；行号为重基前读数）。Step 1 落地后若仍在别处 panic，这里就是第一嫌疑。
5. **`genericSymbolStart + offset` 的 `-1` 语义**：我按 `typedExprTypeArenaRebaseRow`（`row < 0 ⇒ -1`）与 `FillTypeSyntax:6404-6413` 推断"无泛型的根，索引里存的也是 `-1`"，并据此写了 `(windowCount > 0 && windowStart < 0)` 的宽松检查。**该等号未运行验证**；若 parser 对无泛型根返回的不是 `-1` 而是 0，第 1 半的 seal 等式会立刻报 `declaration generic window drift`，不会静默。
6. **未验证 `binary_types.cheng` 的前向边到底指向哪个源**。任务给定"前向跨源引用"，我确认了机制（F3+F4+F5+F6）与撞墙点，但没有定位具体是哪个声明根、哪个源。这影响的是**验收读数**，不影响设计选择。
7. **`declaration_symbols=1314` 是全林合计**（F14）。若某个 `declarationGenericSymbol*` 列在极端输入上扩张（例如大量泛型声明），内存仍按 `4 B × declarationSymbols × 2` 线性增长，未做上界证明；但 `LimitsFromIndexInto` 的逐行越界检查会把任何越界变成命名的硬失败。

---
---

# 第二部分 · Step 3 设计：前向边的 TypeId 延迟绑定

> 触发：`kd_r9n`（r2 落树后）实测把卡点从泛型窗口推进到 TypeId：
> - r1 前：`bracket base declaration is not materialised bracket_row=102 base_row=100 authority_row=21 declaration_root=923 view_base=0 view_rows=187 materialised=187 total=3299`
> - r2 后：`nominal declaration is not materialised nominal_row=22 declaration_root=200 materialised=187 total=3299`
>
> 泛型窗口类读点已解决；剩下的是**声明根的 TypeId 是"未来的值"**这一条。
> 本轮同样**只读 + 出设计，未编译**。

## 10.0 结论

**Step 3 = 一个不可再分的原子改动（队列 + 重放 + 驱动侧重解析），配三层可独立验证的验收。** 理由是硬的：把"入队 + 标记 + 传播"单独落树而不落"重放"，等于让判词从 `nominal declaration is not materialised` 换成另一条同样失败的判词——**那是 stub，仓规禁止**。所以我不把 Step 3 切成"半截可落树"的两片，而是把它切成**一次落地 + 三个独立验收层**（§10.11）。

**补丁已产出**：`patches/forward_typeid_deferred_replay.patch` — **r3**，sha256 `b507878aacef677df9e69e75d53b5c581fb43bb909dd1c56060fb9875cc94b7d`，15 hunk / 2 文件，对 **r9o 基线** `git apply --check` **exit 0**，**未编译**。（r1 `1a23cf83…` 编译不过、r2 `09381e93…` 编译过但引入回归，均已作废；两轮根因见 §10.22。）我原本不出的理由与保留意见留在 §10.20。§10.14 = 补丁与逆向验证记录；§10.15 = 逐块自检表；§10.16 = 三个签名变更的全部调用点；§10.17 = L1 失败定位图；§10.18 = L4 夹具；§10.19 = 落树与验收顺序。

## 10.1 本轮新查明的三条决定性事实（全部静态可复现）

| # | 事实 | 坐标 | 为什么决定性 |
|---|---|---|---|
| G1 | **聚合 TypeId 是"预留槽"，不进去重链。** `typedExprTypeArenaReserveAggregate` 直接按 `typeId = localOut.typeCount` 追加列、`typeCount+1`、把该 TypeId 写进 `typeSyntaxTypeIds[declarationRoot]`；它 `add(bucketNext, -1)` 但**从不挂进 `bucketHeads[bucket]`** | `:1333`；`typeId = localOut.typeCount` `:1350`；`ArenaArrayInt32Set(typeSyntaxTypeIds, declarationRoot, typeId)` `:1431-1434`；`add(bucketNext, -1)` `:1429` | 预留的聚合行**不是 `Intern` 的去重目标**。所以"用占位值先把父行 intern 出来、之后再 patch"**一定会**在去重链里造出一条键不同、内容重复的行 ⇒ `typeCount` 漂移 ⇒ 哈希变。**占位法被这条事实彻底判死。** |
| G2 | **seal 相的 `RealizeDeclarationsRec` 不会改这个值。** 它把 `typeSyntaxTypeIds[declarationRoot]` 再写一次，但写的是 `BuildObjectDeclaration` 的返回值，而后者末尾是 `typeIdOut = reservedTypeId` | `:8230` 调用；写点在 `RealizeDeclarationsRec` 内 `:7579-7583`（object）与 `:7597-7601`（enum）；`BuildObjectDeclaration` `:2186` `typeIdOut = reservedTypeId` | ⇒ **声明根的 TypeId 在它所属源 append 时定型，此后不再变**。重放时读到的值与 seal 后一致，不存在"重放读到旧值、seal 又改掉"的陷阱。 |
| G3 | **每个 TypeSyntax 行的 TypeId 槽初始化成 `-1`** | `FillTypeSyntax` `:6494-6496` `ArenaArrayInt32Add(value.arena, value.typeSyntaxTypeIds, -1)` | ⇒ 在 postorder（子行 < 父行，`:7186-7188` 已证）下，**"child TypeId < 0" ⟺ "该子行尚未绑定 TypeId" ⟺ "该子行被阻塞"**。这条等价是"阻塞向上传播"能做成局部规则的唯一依据（§10.4）。 |

## 10.2 为什么"延迟绑定"是唯一解（定理，再次收口）

`typedExprTypeArenaIntern` 的去重是**按键的引用透明**：键 = `(kind, scalarKind, symbolId, genericSymbolId, fixedLength, functionParamCount, baseTypeId, children, childNameIds)`（`:1129-1132`），命中即返回已有 TypeId（`:1135-1141`），否则 `typeCount` 自增。于是：

- **TypeId ≡ 该键首次出现的序号**。任何"提前 intern"都要求键里的每个分量（尤其是 `children` 与 `baseTypeId`）**已经真实存在**。
- 前向边下 `children[0] = typeSyntaxTypeIds[声明根]` 是**未来的值**（G1+G2：它在目标源 append 时才定型）。
- ⇒ **父行只能在目标源 append 之后才 intern**；占位/patch 被 G1 判死。**"先绑定后 intern"不是偏好，是键的完整性要求。**

唯一能免掉它的替代仍是把全部聚合预留提到所有 intern 之前（`[scalars, agg(all), intern(s0), …]`），代价是全 TypeId 面重编号 ⇒ CID 换代。**已在 §2.2 否决，此处不重开。**

## 10.3 三个必须同时保住的顺序（否则字节中性失效）

延迟重放会**推迟三类副作用**，其中两类**不允许被推迟**：

| 副作用 | 能否推迟 | 依据 |
|---|---|---|
| **类型铸造**（`Intern` 新增行 / `ReserveAggregate`） | **必须推迟** | G1：键不完整就不能铸造 |
| **internPool 的文本插入** | **绝不能推迟** | 池内 id 按插入序分配，`symbolNameIds`/`childNameIds`/`memberNameIds` 都吃它，而它们进 `artifactRaw32`（代码内明确警告见 `:225-227`）。`typedExprTypeArenaTupleChildNameId` 末尾就是 `langintern.Intern(out.internPool, …)`（`:2634` 定义，`:2650-2653` 调用 `langintern.Intern`） |
| **resolution 行追加**（`resolutionTypeSyntaxNodeIndexes` / `resolutionTargetSymbolIds` / `resolutionCount`） | **绝不能重复** | 重放若再走一遍 `ResolveNominal` 的记账，`resolutionCount` 翻倍 ⇒ 哈希变（`:1893` 追加、`:1897` 计数自增） |

⇒ **两条硬规则**：
1. **被阻塞的 Tuple 行，仍要在 append 相照原位置执行 `TupleChildNameId`（即照常发生池插入），只把 `Intern` 那一步推迟。** 重放时再算一次 `TupleChildNameId` 是**池内幂等查表**（同文本返回同 id、不改插入序），因此安全。
2. **重放必须按"行过滤器"只走被阻塞的行**，不能整段重跑 `InternSyntaxRec`。整段重跑会重复 resolution 记账。

## 10.4 执行序：可证的"先绑定后 intern"

### 10.4.1 阻塞的局部规则（用 G3）

在 `InternSyntaxRec` 的升序游走里，对每个待处理行 r：
1. r 是 nominal 且 `ResolveNominal` 判定"声明根未物化" ⇒ **标记 r 为阻塞，跳过**；
2. 否则构造 `children` 时，若某个子行的 TypeId `< 0`：**若该子行已被标记阻塞 ⇒ 标记 r 并跳过；否则维持原判词 `child TypeId unavailable`（fail-closed 不放松）**。

因为子行恒小于父行（`:7186-7188`），标记在父行被访问前一定已经写好 ⇒ **阻塞集在该源内是向上封闭的，且一次升序游走即可完全求出，无需不动点迭代。**

### 10.4.2 队列顺序（确定性，不依赖哈希/指针）

- 单源内按**行号升序**入队（就是游走序）；
- 源按 `orderedSources` 下标升序处理；
- 全局行号 = 前缀和基址（`index.typeSyntaxBaseBySource`）⇒ **`(sourceIndex, localRow)` 的升序与全局行号的升序是同一个序**。

⇒ **队列天然按全局行号严格升序。这是一个可证的序，不是"看起来是"。** 没有任何哈希表遍历、没有指针、没有文本键。

### 10.4.3 重放的边界与正确性

- **重放时机**：所有源 append 完之后、`SealInto` 之前。此时 `typeSyntaxTypeIds.len == typeSyntaxCount`，**每个声明根的 TypeId 都已定型**（G1+G2），被阻塞行**不可能**再遇到"目标未物化"。
- **重放按队列序**：队列升序 ⇒ 被阻塞行的子行（同样被阻塞的）**一定排在自己前面**，且已在本次重放中被绑定 ⇒ **postorder 在队列内保持**。子行未被阻塞的，其在 append 相就已绑定。⇒ **处理到 r 时，r 的每个子 TypeId 必定可用。**
- **一次通过、无不动点**：由 10.4.2 的升序 + 10.4.3 的 postorder 保持直接得到。

## 10.5 队列结构（身份与纪律）

```
typedExprTypeArenaPendingForwardNominal = ref object     # 与 `PendingGenericApply` 同形（`:397-401` 先例）
    typeSyntaxNodeIndexes: int32[]    # 被阻塞行（全局行号）—— 队列序即此列的序
    declarationRoots:      int32[]    # 触发阻塞的声明根（全局行号，来自 authority）
    producerSourceIndexes: int32[]    # 被阻塞行所属源（判词与分组重放用）
    blockedFlags:          bool[]     # 长度 = typeSyntaxCount，行号即下标（G3 的标记数组）
```

- **跨节点身份**：全部是**精确 int32 行号**（TypeSyntax 全局行）与源下标；`blockedFlags` 是**行号即下标**的稠密位图，不是哈希。**不引入任何 name+arity / 文本 / 源码行 / 裸指针键。**
- **DAG/Arena/SoA 纪律**：队列是**普通 Cheng 堆数组**（与 `PendingGenericApply` 完全同类），**不进 arena** ⇒ 不参与 `pinnedArenaBytes` 预算、不参与 `typedExprTypeArenaHashMaterialized`。**不引入新哈希面 / 新 CID 面。**
- **新增内存量级**（234 源闭包，`typeSyntax=157,503`）：`blockedFlags` = 157,503 B ≈ **154 KB**；队列三列按**实际前向边数**增长（下界 0，上界 = 行数）；`PendingGenericApply` 同量级先例。相对 `column_bytes=70,931,312 B` 是 **≈0.2%**。**pin 断言不受影响**（零 arena 列）。

## 10.6 落地方案：驱动侧"重解析重放"

**关键取舍**：重放需要被阻塞行的**解析器事实**（`InternSyntaxRec` 的 kind/fixedLength/TupleChildNameId/FunctionParamCount，以及 `ResolveNominal` 的名字 token 文本）。消费源 k 的树在 append 后已释放。

> ⚠️ **更正我上一轮的判断**：去树（把 `InternSyntaxRec` + `ResolveNominal` 全部改成 arena 列读）**不是 2 行改动**。`typedExprTypeArenaFunctionParamCount`（`:2560`）要做**整棵树的 token 扫描**，`TupleChildNameId` 要读 token 文本；arena 里**没有逐 token 的文本列**。低成本去树这条路比我在 §9.2 里估的重。

**选定的替代**：**重放时由驱动侧重解析消费源**，复用现有树路径原封不动：

1. 源循环结束后，driver 遍历队列（升序、按源分组），对**每个有阻塞行的源 k**：
   - `CompilerCsgImmutableSourceSnapshotText` + `ParserRewriteMultiline…` + `ParserValueExprReadTreeFromTextReserved`（与 pass 1 同一套，含逐源列 census 预留）；
   - 调用新入口 `TypedExprTypeArenaReplayForwardRowsInto(arenaValue, sourceTree, authority, arenaState, forward, producerSourceIndex, tokenBase_k, typeSyntaxBase_k, err)`；
   - 释放树。
2. `SealInto`。

**代价（必须记账）**：每个"有前向边的源"多解析一次。pass 0 实测 234 源 parse ≈ 47,342 ms ⇒ 约 **200 ms/源**；最坏（234 源全有前向边）**+47 s**，且**逐源一次、内存峰值 = pass 1 的同量级**（逐源 census 预留仍在）。这是本方案唯一的新增运行期成本，未实测。

**重放入口内部**：与 `AppendSourceFromTreeInto` 同构，但**只做** `state.tree = share(tree)` + 设 `viewTokenRowBase/viewTypeSyntaxBase` + 调 `InternSyntaxRec(..., replayForward = true, forward, ...)`。**不重跑** `FillTypeSyntax`/`IndexFields`/`FillDeclarationSymbols`/`ReserveAggregatesRec`（那些是 append 相的一次性副作用，重跑会重复记账）。

**行过滤器**：`InternSyntaxRec` 新增 `replayForward: bool`：
- `false`（append 相）：**未标记**的行才处理；遇到前向 nominal 或"子行已标记"⇒ 标记本行并跳过（10.4.1）。
- `true`（重放相）：**已标记**的行才处理；处理完清标记（保证幂等；也顺带把"是否全部出队"变成可断言的读数）。

`forward.blockedFlags.len == 0` 时两种模式都退化为"无过滤"，**与今天逐字节相同**。

## 10.7 fail-closed 判词（禁止 fallback / 禁止静默降级）

| 场景 | 判词（前缀统一 ` typed expr type arena: `） | 坐标 |
|---|---|---|
| seal 时队列未清空 | `forward nominal queue not drained rows={} cleared={} first_nominal_row={} first_declaration_root={} first_producer_source={}` | 5 个 |
| 重放时目标仍未物化（理论不可达，作硬网） | `forward nominal replay target unavailable nominal_row={} declaration_root={} producer_source={} materialised={} total={}` | 5 个 |
| 重放时子 TypeId 仍为 -1 且子行**未被**标记 | 沿用现有 `child TypeId unavailable`（**不放松**） | 现有 |
| 重放后 `typeCount` 与列长不自洽 | `forward nominal replay type count drift before={} after={} rows={}` | 3 个 |
| 队列三列长度不一致 | `forward nominal queue shape invalid rows={} roots={} sources={}` | 3 个 |

**"绝不静默降级"的落地**：队列只有两个归宿——**出队并绑定**，或**seal 前硬失败**。不存在"用 -1 / 用 SymbolId 近似代 TypeId / 跳过该行"的分支。落地后必须能 grep 到"5 条判词 + 0 个默认值"。

## 10.8 与 `s1b_step3p` 两条守卫的取舍（**明确回答**）

| 守卫 | 取舍 | 理由 |
|---|---|---|
| `nominal declaration is not materialised`（`ResolveNominal:1793`） | **改判据、保留硬错**。触发条件从"`declarationRoot >= typeSyntaxTypeIds.len`"改为"**该行被判为前向但重放相仍未物化**" | 这条判据在 append 相**不再是错误**（它就是前向边的定义，要入队）。但**不能删**：它必须继续兜住"重放相还查不到"这条理论上不可达的路径——**保留 = 多一道网，且触发条件真的被改写成了新语义**，不是死代码 |
| `bracket base declaration is not materialised` | **r2 已删，不再恢复** | 它的触发条件（泛型窗口读不到）已被索引全局表彻底消灭，不存在残余路径 |

**另一条必须保留的**：`ResolveNominal:1787-1789` 的 `declaration SymbolId is not materialized`（`symbolByDeclarationRoot[root] < 0`）。它与前向无关——它判的是"这个根根本不是声明"（closure8 的稠密 SymbolId 空间里没有它）。**入队前必须先过这一关**，否则会把"非法引用"当成"前向引用"无限入队。**这是本设计里最重要的 fail-closed 分界线。**

## 10.9 不变面（逐条对照要求）

| 约束 | 本设计 |
|---|---|
| 不改 `orderedSources` | **不动**。源顺序、行基址、`typeSyntaxBaseBySource` 全部原样 |
| 不动全局行基址 / 收据 / artifact 哈希 | **队列空时逐字节相同**（两种模式都退化为无过滤，且新代码只在 `forward.blockedFlags.len != 0` 时才可能改变任何写入）。队列非空时该输入**今天本来就是 abort**，不存在"被改坏的既有读数" |
| 不放宽任何守卫 | 只**改写** `nominal declaration is not materialised` 的触发条件（改为重放相兜底），`child TypeId unavailable`、SymbolId 存在性、arity、CSR 完整性等**一律不放松** |
| 新增内存 | ≈154 KB（闭包）+ 队列三列（∝ 前向边数）；**零 arena 列** ⇒ `pinnedArenaBytes` 预算/地板/安装校验三者不动 |
| 新增哈希面/CID 面 | **无** |

**必须写进判词的诚实边界**：队列非空时，产物**不可能**与"全林驱动"逐字节相同——因为全林驱动把**所有聚合**在**所有 intern 之前**预留（一次 `AppendSourceFromTreeInto`，`symbolBase = 0`），而逐源驱动是 `agg(s_k) → intern(s_k)` 交错。**两者的 TypeId 编号对任何多源输入本来就不同。** 所以：
- Step 3 的正确性基准是 **"逐源驱动自身的语义闭合"**（不再 abort、结果确定、可复现），
- **不是** "与全林驱动字节相同"。**§8 里我把全林驱动当 oracle 的写法，仅对单源输入成立**，多源输入上必须换基准。← **这是本轮对上一轮设计的一处更正。**

## 10.10 最小步拆解

**结论：Step 3 是一个原子改动，不可拆成两个"各自可落树"的半片**（入队半片 = stub，禁止）。可拆的是**验收层**：

| 层 | 覆盖面 | 判据 | 证"没坏别的" |
|---|---|---|---|
| **L1 空队列字节中性** | 所有**今天能过**的输入（队列恒空） | 两种模式都走无过滤路径 | A/B 逐字节 IDENTICAL；三小件产物逐字节不变；四正例 + 负例判词**逐字未变** |
| **L2 单源 / 同源前向** | `r7_enum_first_source_*`（2 源，声明在前/在后各一） | 前向 nominal 无泛型窗口 → 队列非空、重放成功、`rc=0` | 同输入两轮产物 + 判词逐字相同（确定性） |
| **L3 跨源前向 + 泛型窗口** | `binary_types_via_import` | `nominal declaration is not materialised` **消失**；`rc=0` | `declaration generic window drift` 仍全绿（r2 的等式证明不回归） |
| **L4 元组内前向（池序保护）** | 新夹具：`type P = [T, int32]`，`T` 在后面的源 | 池序不变 ⇒ 与"把 T 的定义挪到前面源"的对照件**产物逐字节相同** | ← 这是 §10.3 硬规则的唯一直接验证 |
| **L5 234 源门内** | `kd_r9k/kd_r9n` 门内 | `forest_appended=234`、无 `rss_limit_exceeded` | 门内预算须并入 §5 的 154 KB + 重解析峰值 |

**第一步 = L1 能过的那个原子改动本身**；如果一定要一个"先落树"的切片，唯一诚实的选择是 **Step 3 全量**，而不是它的前一半。

## 10.11 编译级自检（插入块标识符绑定 + **缩进块闭合**，逐块核）

> **本轮新增的第二条自检规则（血的教训，见 §10.22）**：插入块除了要核"块内标识符在该点是否已绑定"，还必须核
> **"该插入点的缩进层级是否会切断裂表（`if/elif/else`）或块体"**。
> Cheng 的 `elif` 体是**缩进块**：在该体内部插一条与 `if` **同缩进**的语句，会把 `elif` 链**就地终止**，其后的 `elif` 全部改挂到新 `if` 上。
> 机器判据（§10.22 的 `chain_check`）：从 `if kind == parser.ParserTypeSyntaxNominal:` 起，链内**只允许**出现 `elif `/`else:`（同缩进）与更深缩进的体行；
> 出现一条同缩进的普通语句即判定链断。r9o 基线 `arms=12`，r2 `arms=2`（断），r3 `arms=12`（复）。
>
> **插入前必须做的两条机械检查**：① 该行左侧空白数 vs 上下一行的空白数；② 若上一行属于某个 `if/elif/else`/`for`/`while` 体且本行缩进更浅，则本行会闭合该体。

> 本轮**未出补丁**，下表是给落地者的施工前检查表（本轮已发生 3 次"引用后面才声明的 `let`"事故）。

| 计划改动 | 块内使用的标识符 | 该点必须已绑定 |
|---|---|---|
| 新结构体 `PendingForwardNominal` | — | 放在 `PendingGenericApply`（`:397-401`）之后 |
| `PendingForwardNominalNew()` | — | 与 `PendingGenericApplyNew`（`:4997`）同处 |
| `InternSyntaxRec` 增参 `replayForward: bool` + `forward: …PendingForwardNominal` | — | 两个形参**在函数入口即绑定**；调用点共 3 处（append 相 1、重放相 1、全林相 1）必须同步 |
| 循环顶部的过滤/标记块 | `replayForward`、`forward`、`typeSyntaxNodeIndex`、`viewTypeSyntaxBase` | 全部是形参或入口 `let`（`viewTypeSyntaxBase` 是形参） |
| 10.4.1 的"子行已标记"块 | `forward.blockedFlags`、`childNode`、`childTypeId` | `childNode`/`childTypeId` 在 `:7183-7192` 已绑；**必须把它插在现有 `childTypeId < 0` 判词之前**，且 `forward.blockedFlags.len` 要先查非零 |
| `ResolveNominal` 增 `forwardOut: var bool` | `declarationRoot`（`:1786` 之后才绑） | 增参后**前向判定必须放在 `:1793` 守卫处**，那里 `declarationRoot`/`symbolId` 都已绑 |
| 重放入口 | `value`/`tree`/`authority`/`state`/`forward`/`producerSourceIndex`/`tokenBase`/`typeSyntaxBase`/`err` | 全为形参；`state.tree = share(tree)` 必须在 `InternSyntaxRec` 之前 |
| `SealInto` 的队列清空断言 | `forward`、`state.declarationSymbolTotal`、`value.symbolCount` | 必须放在 `symbolCount != declarationSymbolTotal` 断言**之后**（`declarationSymbolTotal` 才可当上界） |
| driver 重解析循环 | `work.sourceSnapshots`、`sourceIndex`、`typearena` 前缀和 | `GenericSymbolBase` 等基址**必须取自索引前缀和，不能复用循环里被推进过的累加器**（循环结束后它们已是总量） |

## 10.12 验证计划

| 目标 | 命令/夹具 | 期望读数 | 设计错了先死在哪 |
|---|---|---|---|
| L1 | A/B 双驱动同 `--out`（**只对单源夹具**；多源见 §10.9 的更正） | 产物 CMP=IDENTICAL | 池序被判据改变 ⇒ `artifactRaw32` 变 |
| L1 | `docs/.../fixtures/` 四正例 + 负例 | 判词**逐字未变** | 任何一条判词变了 ⇒ 空队列路径被污染 |
| L2 | `r7_enum_first_source_v{1,2,4,6}_main` / `r7_enum_second_source_main` | 前向 / 非前向两向都 `rc=0` | `forward nominal replay target unavailable` |
| L3 | `binary_types_via_import` | `nominal declaration is not materialised` 消失；`rc=0` | `forward nominal queue not drained rows=…` |
| L3 | 同上 | `declaration generic window drift` 仍全绿 | 重放写坏了窗口列（不应发生） |
| L4 | 新夹具 `tuple_forward_*`（含"定义在前"对照件） | 两件产物逐字节相同 | **池序被推迟 ⇒ 产物 DIFFER**（这是 §10.3 的唯一直接探针） |
| L5 | `.rebuild/s1b_step3/gate_run.sh <tag> <driver>` | `forest_appended=234`、无 `rss_limit_exceeded` | 重解析峰值 + 154 KB 预算 |
| 确定性 | 同输入连跑两轮 | 判词与产物逐字节相同 | 队列序不唯一 ⇒ 两轮不等 |

## 10.13 未测项（Step 3 专列）

1. **本轮未出补丁、未编译**。§10.11 是施工检查表，不是已验证的补丁。
2. **重解析成本未实测**（最坏 +47 s，按 pass 0 的 47,342 ms / 234 源外推；外推本身未验证）。
3. **L4 的池序风险未实测**。我按 §10.3 的规则（"被阻塞的 Tuple 行仍照原位置做池插入"）设计，但**没有实测**一个"前向 nominal 出现在元组里"的夹具来确认池序真的不变。这是 Step 3 最可能出问题的地方。
4. **"全林 vs 逐源 TypeId 编号对多源输入本来就不同"是我的静态推论，未实测确认**。依据是 `TypedExprTypeArenaAppendSourceFromTreeInto` 在整林路径只被调用一次（`symbolBase = 0` ⇒ 预留全部聚合），而逐源路径每源一次。**这条推论若成立，会推翻我在第一部分 §8 里把全林驱动当多源 oracle 的写法**（文档内已就地更正）。建议用 2 源夹具直接跑一次 A/B 定谳。
5. **`FunctionParamCount` 的 token 扫描**在重放相要重跑一次；它只读树、不写 arena。我**没有逐行确认**它不产生副作用。
6. **同源前向**（同一源内 nominal 引用本源后面的声明）是否真的存在、以及是否落在 L2 覆盖内，未验证。
7. 队列三列在极端输入上的上界未证明（理论上界 = TypeSyntax 行数）；但 `queue shape invalid` 与 seal 清空断言会把越界变成命名硬失败。

## 10.14 补丁（已产出）

`patches/forward_typeid_deferred_replay.patch` — **r3**，sha256 **`b507878aacef677df9e69e75d53b5c581fb43bb909dd1c56060fb9875cc94b7d`**（28,276 B / 15 hunk / 2 文件），基线 = **r9o**（pre-step-3）态，`git apply --check` **exit 0**。
r1（`1a23cf83…`）编译不过、r2（`09381e93…`）编译过但引入回归，**均已作废**；两轮根因与修法见 §10.22。

> **落树前必须先撤 r2**（主树当前带 r2）：`git apply -R patches/forward_typeid_deferred_replay.patch` 已不适用（同名文件已是 r3），请按台账用 r2 的 sha 从备份/收据取回其文本，或直接以 r9o 收据态为基线。r3 的 `apply --check` 是在 **r9o 基线**上验的（§10.14 验证记录），不是在大树上。

> 我原本不打算出这一版（理由见下），**是应要求出**：补丁躺在 `patches/` 里不花编译槽，槽一空就能烤；且"未审就落树"与"审过再落树"是两件事，前者才是期望值为负的那个。

**行数账（与本文件其余部分同一口径）**

```
typed_expr_type_arena.cheng  total=13  pure-insertion=11  with-deletions=2  -6  +293
compiler_csg.cheng           total=2   pure-insertion=2   with-deletions=0  -0  +102
TOTAL 15 hunk：13 纯插入 / 2 含删除；删除 6 行，新增 395 行
```

**全部 6 行删除逐条列出**（复现：`grep -n "^-[^-]" patches/forward_typeid_deferred_replay.patch`）：

| # | 删除行 | 位置 | 处置 |
|---|---|---|---|
| 1-3 | `# [forward-declaration OOB] …`（3 行注释） | hunk `arena @@ -1865,13` | 被 `[forward-typeid]` 分类注释替换 |
| 4 | `err = Fmt" … nominal declaration is not materialised …"` | 同上 | 该判词**不再是 append 相的错误**（前向边的定义），改由 §10.8 的重放相兜底 |
| 5 | `return false` | 同上 | 改为 `state.forwardNominalRoot = declarationRoot` + `return true` |
| 6 | `value, tree, authority, state, pending, typeSyntaxBase,` | hunk `arena @@ -8163,10` | `InternSyntaxRec` 增 `replayForward` 形参，同文件唯一调用点 |

**`compiler_csg.cheng` 的 2 个 hunk 全部是纯插入**（`grep -c "^-[^-]"` 在 csg 段为 **0**）。第 6 行删除是**同文件内部**调用，不是跨文件调用点。

**逆向验证（scratch 内做，仓库文件只读，退出即删）**

| 检查 | 结果 |
|---|---|
| 正向施加 → `git apply -R` 回退 → 与仓库现文件逐字节比对 | arena 545,619 B / csg 2,168,393 B **均 IDENTICAL** |
| 调用点审计（§10.21） | **10 个调用点全部 ARITY-OK**，`var` 形参全部绑到简单标识符 |
| **结构检查（本轮新增，§10.22）** | `InternSyntaxRec` 的 `if/elif/else` 链：r9o 基线 **ok=True arms=12**；**r9o+r2 ok=False arms=2**（复现回归）；**r9o+r3 ok=True arms=12** |
| `state.forwardNominalRoot >= 0` 出现次数（r9o+r3） | **1**（r2 也是 1，但其位置在链内；r3 在链后） |
| r2 反向还原 | 把 r2 从现树逆转后**重放 r2 可逐字节复现现树** ⇒ 还原出的 r9o 基线可信 |
| `/usr/bin/diff -u` 回生成 → `/usr/bin/patch` 施加回基线 → 与 git apply 结果比对 | **两文件 identical=True（rc=0）** |
| 回生成 diff 与补丁 +/- 行序列 | arena 282 vs 282、csg 96 vs 96，**完全相等**（r1 为 271/102；计数随 hunk 结构变化，判据是相等而非数值）⇒ 无越界改动 |

## 10.15 §10.11 自检表 · 逐块填好版（每块 = 一个 hunk，r2 行号）

> 判据：**块内标识符在该点是否已绑定**。16 个 hunk 全部逐块核过。"hunk" 列 = 补丁里的 `@@` 头。

| # | hunk | 块内容 | 块内标识符 | 核对结论 |
|---|---|---|---|---|
| 1 | `arena @@ -373,6`（纯插入） | build state 加 `forwardNominal` / `forwardNominalRoot` | 仅字段声明 | ✓ 插在 `declarationSymbolTotal` 之后，`type` 块内 |
| 2 | `arena @@ -399,6`（纯插入） | 新结构体 `PendingForwardNominal` | 仅字段声明 | ✓ 插在 `PendingGenericApply` 之后 |
| 3 | `arena @@ -1755,6`（纯插入） | `ResolveNominal` 入口把 `state.forwardNominalRoot` 置 `-1` | `state`（形参） | ✓ 置于函数体**第一条语句**，先于任何 `return` |
| 4 | `arena @@ -1865,13`（**含 5 行删除**） | 前向分类（替换旧守卫） | `declarationRoot`（本函数上文 `let`）、`localOut`/`typeSyntaxNodeIndex`（形参）、`state`（形参）、`typeIdOut`（out 形参） | ✓ 替换点在 `let symbolId = state.symbolByDeclarationRoot[declarationRoot]` **之后**。**SymbolId 判空在其之前，未被绕过** |
| 5 | `arena @@ -4996,6`（纯插入） | 构造器 + `EnqueueInto` / `ClearRow` / `RequireDrainedInto` | 构造器：`typeSyntaxCount`（形参）。三个 helper：`forward`/`typeSyntaxNodeIndex`/`declarationRoot`/`producerSourceIndex`/`err`（**全是形参**）+ `queueIndex`/`nominalRow`（本块 `for` 变量与 `let`，均在使用点之前） | ✓ 无一块引用外部 `let` |
| 6 | `arena @@ -7139,10`（纯插入） | `InternSyntaxRec` 增 `replayForward: bool` + 从 `state.forwardNominal` 取队列 + 判空 | `state`/`replayForward`（形参）、`forward`（本块 `let`） | ✓ `let forward = state.forwardNominal` 在函数体开头，先于循环与判空 |
| 7 | `arena @@ -7154,6`（纯插入） | 循环顶行过滤器 | `forward`（hunk 6 的 `let`）、`replayForward`/`state`/`typeSyntaxNodeIndex`（形参） | ✓ 插在判界**之后**、`let treeRow` **之前** |
| 8 | `arena @@ -7177,6`（纯插入） | 阻塞传播 + **L4 池序块** | `forward`（hunk 6）、`replayForward`/`state`/`value`/`typeSyntaxNodeIndex`/`err`（形参）、`childCount`（**上一行 `let`，已绑定**）、`blockedChild`（本块 `var`）、`childOffset`/`childNode`（本块 `for`/`let`） | ✓ 插在 `let childCount` **之后**（它是传播扫描的上界）、`if kind != ParserTypeSyntaxQualified:` **之前**。**最易踩"引用后面才声明的 `let`"的一块，已单独核过** |
| 9 | `arena @@ -7193,6`（纯插入） | dispatch 前重置 `state.forwardNominalRoot` | `state`（形参） | ✓ 置于 `if kind == …Nominal:` **之前**——qualified 分支在 `childCount < 2` 时会短路而**不调用** `ResolveNominal`，不重置就会读到上一行的判决。**这是一个 8 空格语句夹在两个 8 空格语句之间，不切任何块** ✓ |
| 10 | `arena @@ -7426,9`（纯插入） | 入队分支 | `state.forwardNominalRoot`（hunk 3/9 维护）、`forward`（hunk 6）、`typeSyntaxNodeIndex`/`value`/`err`（形参） | ✓ **r3 的修复点**：插在 `else: …TypeSyntax authority incomplete…return false` 与 `arenamod.ArenaArrayInt32Set(` **之间**，即**整条 if/elif/else 链闭合之后**。r2 把它插在 Qualified 分支体内（12 空格块中间，8 空格语句），**切断了链**——见 §10.22 |
| 11 | `arena @@ -7429,6`（纯插入） | 绑定后清标记 | `replayForward`/`forward`/`state`/`typeSyntaxNodeIndex` | ✓ 插在 `ArenaArrayInt32Set(...typeSyntaxNodeIndex, typeId)` **之后**（`typeId` 已绑）、游标自增**之前** |
| 12 | `arena @@ -8066,6`（纯插入） | `AllocateFromLimitsInto` 建队 | `built`（上文 `var`）、`limits`（形参） | ✓ 紧接 `built.pinnedArenaBytes = pinnedArenaBytes` |
| 13 | `arena @@ -8163,10`（**含 1 行删除**） | ① `InternSyntaxRec` 调用加 `false` ② 重放入口 `ReplayForwardRowsInto`（两者相距 <6 行，被 difflib 并成同一 hunk） | ① `value`/`tree`/`authority`/`state`/`pending`（形参）+ 字面量 `false`；② 9 个形参 + 本块内 `state.forwardNominal` 读 | ✓ ①**字面量 `false` 是 L1 的第二风险点**，见 §10.17；②无外部依赖，`state.authority`/`state.tree` 的重新指向都在 `InternSyntaxRec` 调用**之前** |
| 14 | `arena @@ -8350,6`（纯插入） | 全林驱动 drained 断言 | `state`（上文 `var`）、`value` | ✓ 紧跟 `AppendSourceFromTreeInto` 返回之后 |
| 15 | `csg @@ -35858,6`（纯插入） | 流式驱动重放循环 | `arenaState`/`arenaValue`/`pending`/`authority`/`work.*`/`declarationIndex.*`（上文已绑）、`replayCursor`/`replaySourceIndex`/`replaySourceText`/`replayParserText`/`replayCoordinateMap`/`replayTokenBase`/`replayBaseCursor`/`replayColumnCensus`/`replayTree`/`replayTreeRead`（**全部在本块内按序 `var`/`let`**） | ✓ `replayCursor` 在循环前声明；`replaySourceIndex` 是每个循环体的**第一条** `let`；`replayTokenBase` 在重放调用**之前**算完。**基址一律取自 `declarationIndex.*BySource`，未复用循环里已被推进成总量的累加器** |
| 16 | `csg @@ -35869,6`（纯插入） | seal 前 drained 断言 | `arenaState`/`arenaValue`/`buildErr` | ✓ 置于 `TypedExprTypeArenaSealInto` **之前**（seal 消费 TypeId 列，必须先证队列已清） |

## 10.16 签名变更与调用点（**r2：只剩 1 处，且在同文件内**）

**r2 的设计目标就是让这张表尽量短。** r1 有 3 个签名变更、其中 1 个是跨文件的，正是那一处把编译打挂（§10.22）；r2 只剩 `InternSyntaxRec` 一个 `bool` 形参。

| 被改签名的函数 | 定义处 | 全部调用点 | 是否都已同步 |
|---|---|---|---|
| `typedExprTypeArenaInternSyntaxRec`（+`replayForward: bool`） | `arena:7250` | `arena:8376`（`AppendSourceFromTreeInto` 内，唯一一处） | ✓ 同一 hunk 内更新；另在 `arena:8423` 新增重放相调用（新函数） |
| `TypedExprTypeArenaAppendSourceFromTreeInto` | `arena:8297` | `arena:8609`（全林驱动）、`csg:35808`（流式驱动） | **签名未变（仍是 16 参），调用点未变** ⇒ 上一轮编译失败的那一处**整条路径不再被本补丁触碰** |
| `typedExprTypeArenaResolveNominal` | `arena:1779` | `arena:7384`、`arena:7390`（都在 `InternSyntaxRec` 内） | **签名未变（仍是 7 参）**，判决改走 `state.forwardNominalRoot` |
| `TypedExprTypeArenaAllocateFromLimitsInto` / `typedExprTypeArenaBuildStateInitInto` | `arena:8209` / `arena:5118` | 各 2 处 / 1 处 | **签名均未变**；队列由 `AllocateFromLimitsInto` 按 `limits.typeSyntaxCount` 自建 |
| `TypedExprTypeArenaReplayForwardRowsInto` | `arena:8398` | `csg:35930` | **新函数**，调用点也是新的，不存在"旧调用点漏改" |

**枚举命令（可复现，判据不是"我以为"）**：
```
grep -rn "<函数名>" src/ --include=*.cheng        # 定义 + 全部调用点
```
§10.21 给出了把这条 grep 机械化后的逐调用点审计（arity + `var` 形参绑定）。

## 10.17 若 L1（空队列字节中性）不成立，按此顺序定位

L1 的机制前提：**队列恒空 ⇒ 每个 flag 都是 false ⇒ 行过滤器是恒等 ⇒ 产物逐字节不变**。按"最可能先坏"排序：

| 序 | 位置（hunk） | 失效形态 | 症状 |
|---|---|---|---|
| **0** | **hunk 10（r3 修复点）** | **缩进层级切断裂表/块体**：入队块若退回 Qualified 分支体内（8 空格语句插进 12 空格块），`if/elif/else` 链在该处终止，其后所有 `elif kind == …` 重新挂到新 `if` 上 | **无条件**、**所有输入**、**source 0** 死在 `TypeSyntax authority incomplete`。r2 实测就是这个症状。判据：§10.22 的链检查（arms 从 12 掉到 2） |
| 1 | **hunk 4 `ResolveNominal` 前向分类** | `state.forwardNominalRoot` 在某条**非前向**路径上被留成非 `-1`（入口初始化漏了某条 `return`），或判据写反（`>=` 写成 `>`），导致正常 nominal 被入队 | 正常输入大面积 `typeId = -1` ⇒ 大量 `child TypeId unavailable`，或 `forward nominal queue not drained rows=…` |
| 2 | **hunk 13 的 `replayForward` 字面量** | append 相若误传 `true` | append 相只处理"已标记"行 = 一行都不处理 ⇒ **整个 arena 的 TypeId 全空** ⇒ `child TypeId unavailable` 雪崩；确定性全红 |
| 3 | **hunk 7 循环顶行过滤器** | 两个分支写反（append 相应跳过**已标记**行） | 与 #2 同症状 |
| 4 | **hunk 9 dispatch 前重置** | 漏掉这次重置，且该行走了 qualified 且 `childCount < 2` 的短路路径 | 读到上一行的判决 ⇒ 个别行被误入队；`queue not drained` |
| 5 | **hunk 10 入队分支** | 插入位置早于 hunk 9 的重置 | 与 #4 同症状 |
| 6 | **hunk 8 阻塞传播** | 用了后面才声明的 `let childCount`（**编译期**错），或漏掉 `childNode < value.typeSyntaxCount` 越界守卫 | 编译错 / 越界 panic |
| 7 | **hunk 6 `let forward = state.forwardNominal`** | 判空放进循环体内侧，或漏判空 | 空队列 panic |
| 8 | **hunk 14/16 drained 断言** | 断言读 `blockedFlags[row]` 而非队列，或放到 `SealInto` 之后 | 断言恒真（无网）/ seal 已消费才报 |

**回退定位法**：把 hunk 7/8/10 三块整体摘掉（留结构体、hunk 9 的重置与断言），L1 必过——这三块是"空队列恒等"的唯一承载者。

## 10.18 L4 夹具（可直接交给槽位持有者）

**动力**：`typedExprTypeArenaTupleChildNameId` 的池插入若被推迟，`childNameIds` 会重编号 ⇒ `artifactRaw32` 变。**L4 是这条硬规则的唯一直接探针**：两件输入**语义等价、仅声明所在源不同**，产物必须逐字节相同。

```
# ---- l4_tuple_forward_lib.cheng（后一个源；被 main import）----
type FwdTuple = (left: int32, right: int32)

# ---- l4_tuple_forward_main.cheng（前一个源）----
@import "./l4_tuple_forward_lib.cheng"
type Holder = (inner: FwdTuple, tag: int32)
fn main(): int32 = return 0

# ---- l4_tuple_backward_lib.cheng（前一个源）----
type FwdTuple = (left: int32, right: int32)

# ---- l4_tuple_backward_main.cheng（后一个源）----
@import "./l4_tuple_backward_lib.cheng"
type Holder = (inner: FwdTuple, tag: int32)
fn main(): int32 = return 0
```

判据：`l4_tuple_forward_main` 与 `l4_tuple_backward_main` 的产物 **逐字节相同**（同 `--out` 基名口径；若产物嵌输出路径，两件必须用同名输出目录，见战役既有的"产物嵌路径 ⇒ A/B 必须同 `--out`"纪律）。

> ⚠️ **`@import` 的具体拼写与"哪个源排在前"由 `CompilerCsgSortSourcePathModulePairs` 的命名决定，上例的 forward/backward 文件名需按实际排序结果对调**——即：真正要保证的是"声明方在物化序里排在引用方**之后**"，文件名只是手段。落地时先跑一次 `compiler_csg.cheng:26881` 的排序口径确认。

hunk 7 里的 `[forward-typeid][L4 pool-order] DO NOT DELETE THIS BLOCK` 段落就是被这组夹具保护的代码。

## 10.19 落树与验收顺序（按此排；**L1 不过就别往下走**）

| 序 | 层 | 判据 | 不过怎么办 |
|---|---|---|---|
| 1 | **L1 空队列字节中性** | 四正例 + 负例判词**逐字未变**；三小件产物**逐字节不变**；A/B（单源夹具）`CMP=IDENTICAL` | **停**。L1 同时验证"空队列 ⇒ 两种模式退化为无过滤"这个**字节中性前提**；它不过，后面全部无意义。按 §10.17 定位 |
| 2 | L2 同源前向 | `r7_enum_first_source_v{1,2,4,6}_main` / `r7_enum_second_source_main` 双向 `rc=0` | 查 hunk 6/8；判词 `forward nominal queue not drained` |
| 3 | L3 跨源前向 | `binary_types_via_import`：`nominal declaration is not materialised` **消失**、`rc=0`；`declaration generic window drift` 仍全绿 | 查 hunk 15 重放循环与 `csg` 基址取址 |
| 4 | **L4 元组内前向池序** | §10.18 两件产物**逐字节相同** | 查 hunk 7 的 L4 段；这是最可能出问题的一块 |
| 5 | L5 门内 | `.rebuild/s1b_step3/gate_run.sh <tag> <driver>`：`forest_appended=234`、无 `rss_limit_exceeded` | 预算并入 §5 的 154 KB + 重解析峰值 |

## 10.20 为什么我原本不出补丁（保留以记录判断依据）

Step 3 的最小**完整**形态含：新结构体 + 4 个辅助函数 + `InternSyntaxRec` 双模式过滤 + `ResolveNominal` 增参改判据 + 重放入口 + driver 重解析循环 + **3 个签名变更共 5 个调用点**。r2 能被盲审通过，是因为它的 4 个含删除 hunk 全是 1:1 读点替换；**Step 3 不是这类改动**。

**我保留的保留意见**：本补丁**未经编译**，12 行删除 + 361 行新增里，风险集中在 §10.17 的 1/2/5 三条（`forwardOut` 的初始化完备性、append 相的 `false` 字面量、`childCount` 的声明序）。这三条都是**编译期或确定性全红**级别的失效，不会静默产假绿——这是我认为它可以被盲审通过、而不是必须编译后才敢给人的唯一理由。**落树前请按 §10.15 的表独立复核一遍。**


## 10.21 机械化调用点审计表（r3 实测）

**方法**（判据可 grep 复现）：
```
grep -rn "<函数名>" src/ --include=*.cheng
```
再对每个调用点做括号配平取实参表，与定义处形参表逐位对齐。下表是**在 r3 施加后的文件上**跑出来的读数。

| 函数 | 定义处 | 形参数（var） | 调用点（file:line） | 实参数 | 判定 | var 形参的实际实参 |
|---|---|---|---|---|---|---|
| `typedExprTypeArenaResolveNominal` | `arena:1779` | 7（4）**未变** | `arena:7384`、`arena:7390` | 7 / 7 | **ARITY-OK** | `state`/`value`/`typeId`/`err` 均简单标识符 |
| `typedExprTypeArenaInternSyntaxRec` | `arena:7250` | 10（3） | `arena:8384`、`arena:8431` | 10 / 10 | **ARITY-OK** | `value`/`state`/`err` |
| `TypedExprTypeArenaAppendSourceFromTreeInto` | `arena:8305` | **16（3）未变** | `arena:8617`、**`csg:35808`** | 16 / 16 | **ARITY-OK** | `value`/`state`/`err`；**`arenaValue`/`arenaState`/`buildErr`** ← r1 失败那一处，r3 下签名与实参**都未变** |
| `TypedExprTypeArenaReplayForwardRowsInto`（新） | `arena:8406` | 9（3） | `csg:35930` | 9 | **ARITY-OK** | `arenaValue`/`arenaState`/`buildErr` |
| `TypedExprTypeArenaAllocateFromLimitsInto` | `arena:8217` | 8（3）**未变** | `arena:8609`、`csg:35670` | 8 / 8 | **ARITY-OK** | `value`/`state`/`err`；`arenaValue`/`arenaState`/`buildErr` |
| `typedExprTypeArenaBuildStateInitInto` | `arena:5118` | 8（2）**未变** | `arena:8271` | 8 | **ARITY-OK** | `built`/`err` |

**TOTAL：10 个调用点，0 个 arity 不符，0 个 `var` 形参绑到非简单标识符。**

> r2→r3 只改了**一个块的插入位置**（hunk 10），签名集与调用点集**完全不变**，故本表 r2 版与 r3 版同值；上面是 r3 的实测读数。
> 注意这只是"签名对齐"这一维；**r2 正是签名全对却仍然回归**——所以本表**不构成**充分条件，必须与 §10.22 的结构检查合用。

## 10.22 两轮失败的根因（r1 编译失败 / r2 运行回归）与 r3 的修法

**报错**（第九手，r1 落树后）：
```
cheng_cold: ??? unresolved function call 'typearena.TypedExprTypeArenaAppendSourceFromTreeInto'
cheng_cold:   body=CompilerCsgStreamTypeArenaFromDeclarationIndexInto
cheng_cold:   candidate[9724] arity=17 ret=bool
               param[15]=…PendingForwardNominal   param[16]=var str
cheng_cold:   actual[0] kind=4 size=8 type=typearena.TypedExprTypeArena   ← 非 var，候选要求 kind:9(var)
```

**我的静态复核结论（诚实记录，不粉饰）**：r1 的补丁里 **csg 那一处 hunk 确实存在且位置正确**（`@@ -35821,6` 在 `pending,` 与 `buildErr` 之间插入 `forwardNominal,`），施加后两侧 arity 都是 17。**我无法从补丁文本复现 `actual[0]` 非 var 这一条**（`arenaValue` 在 `var arenaValue: typearena.TypedExprTypeArena`（`csg:35665`）声明，是合法 var 实参）。可能的解释有三，我无法区分：
1. 第九手落树时 `compiler_csg.cheng` 的 hunk 未随之生效（例如树已漂移、或只落了 arena 文件）；
2. 该轮树中 `arenaValue` 的 var 性被另一手改动影响；
3. 编译器对"17 参候选"的匹配诊断把 `actual[0]` 作为首个不匹配项报出，而其真实原因在别处。

**我没有停在"无法复现"上——我把这一整类失效从设计里删掉了。** r2 的变更：

| r1 | r2 |
|---|---|
| `AppendSourceFromTreeInto` **加** `forward` 形参（16→17）⇒ 逼着 `csg:35808` 跨文件同步 | **签名不变（仍 16 参）**；队列挂在 `state.forwardNominal`，由 `AllocateFromLimitsInto` 按 `limits.typeSyntaxCount` 自建 |
| `ResolveNominal` **加** `forwardOut` out 形参（7→8）⇒ 2 处同步 | **签名不变（仍 7 参）**；判决挂在 `state.forwardNominalRoot`，并在 dispatch 前显式重置以防短路路径读脏 |
| `InternSyntaxRec` 加 2 形参（`forward` + `replayForward`） | 只加 1 个 `replayForward: bool`；队列从 state 取 |
| `csg` 2 个 hunk 里有 1 个**修改既有调用** | `csg` 2 个 hunk **全是纯插入**（`grep -c "^-[^-]"` = 0），**不动任何既有调用** |

**这就是本轮第 4 次"调用点未随签名同步"的制度性回应**：与其把表做全，不如**把签名变更减到零跨文件**。§10.21 的审计表仍然交，因为它是"下一个签名变更"的验收工具；但 r2 之后，这张表上跨文件的行只剩**新函数的新调用**。

**残留风险（诚实列出）**：`state.forwardNominalRoot` 是"调用期判决存放点"，比 out 形参弱一档——它依赖 hunk 9 的显式重置。§10.17 把它排在第 4 位；若 L1 出现"个别行被误入队"，第一个要查的就是这里。


### 10.22.1 r2 的回归：根因与机器判据

**症状**（`kd_r9r` = r9o + r2，bake 成功）：
```
四件正例 / binary_types_via_import → compiler csg: TypeArena production failed source_index=0:  typed expr type arena: TypeSyntax authority incomplete
负例 → parser type syntax: fixed array length must be int32 … （逐字不变）
```
**关键观察（你给出的，正确）**：`TypeSyntax authority incomplete` 是 `InternSyntaxRec` 的种类派发链的**兜底 `else`**（`typed_expr_type_arena.cheng:7627`）。它在**所有输入**、**source 0** 上触发 ⇒ 与"是否有前向边"无关 ⇒ **无条件路径**。

**根因（已用机器判据证实）**：r2 把入队块插在了
```
        elif kind == parser.ParserTypeSyntaxQualified:
            if childCount < 2 || !ResolveNominal(...):
                ...
                return false
        if state.forwardNominalRoot >= 0:      ← 8 空格：在此终止 elif 链
            ...
            continue
            for childOffset in 0..<childCount:  ← 12 空格：成了 continue 之后的死代码
                ...
        elif kind == parser.ParserTypeSyntaxVarBorrow:   ← 8 空格：改挂到上面那个 if
```
Cheng 的 `elif` 体是**缩进块**。一条与 `if` 同缩进（8 空格）的普通语句出现在 12 空格的 `elif` 体**中间**，就把链**就地切断**：Qualified 分支的 `for` 循环变死代码，其后每个 `elif kind == …`（VarBorrow / Seq / Grouped / Optional / FixedArray / BracketApply / Tuple / Function / Alias）全部改挂到新 `if` 上 ⇒ **只有 Nominal/Qualified 两个 arm 还归原链**，其余种类一律落到 `else` ⇒ `TypeSyntax authority incomplete`。**完全吻合"无条件、source 0、所有输入"。**

**机器判据（已作为回归探测器写进验证脚本）**：
```
CHAIN-CHECK r9o-baseline ok=True  arms=12 varBorrow=True else=True
CHAIN-CHECK r9o+r2       ok=False arms=2  varBorrow=False else=False first-8space-stmt='if state.forwardNominalRoot >= 0:'
CHAIN-CHECK r9o+r3       ok=True  arms=12 varBorrow=True else=True
```
判据本身：从 `if kind == parser.ParserTypeSyntaxNominal:` 起，链内只允许 `elif `/`else:`（同缩进）与更深缩进的体行（注释与空行忽略）；出现一条同缩进的普通语句即判链断。

### 10.22.2 r3 的修法（一处）

**入队块整体移到整条 `if/elif/else` 链闭合之后**——插在兜底 `else: … return false` 与 `arenamod.ArenaArrayInt32Set(value.arena, value.typeSyntaxTypeIds, …)` 之间，仍是 8 空格，但那里链已闭合，**不切任何体**。单副本（不是两处各插一份），`state.forwardNominalRoot >= 0` 在文件中仍只出现 **1** 次。

**为什么不去掉 `state.forwardNominalRoot` 改回 out 形参**（你问的第 4 点）：**根因与判决存哪儿无关**——r2 的错是缩进位置，out 形参版本若同样插在那个位置会犯同样的错。改回 out 形参只会**增加** 2 个调用点（`ResolveNominal` 7→8 参，2 处同步），与"减少跨文件签名变更"的方向相反。**判决继续挂 state，不改。**

### 10.22.3 r3 的自检（逐块 + 新规则）

**新增/改动块的标识符绑定点**：

| 块 | 用到的标识符 | 绑定结论 |
|---|---|---|
| hunk 9（dispatch 前重置） | `state`（形参） | ✓ 夹在两个 8 空格语句之间，不切块 |
| **hunk 10（入队，r3 新位置）** | `state.forwardNominalRoot`（hunk 3 入口置 `-1`、hunk 4 写入、hunk 9 dispatch 前再置 `-1`）、`forward`（hunk 6 的 `let`）、`typeSyntaxNodeIndex`/`value`/`err`（形参） | ✓ 全部在该点之前绑定；**且位于链闭合之后，不切任何体**（`CHAIN-CHECK` ok=True arms=12） |

**结构自检（本轮新增，已写进 §10.11）**：插入前核 ① 本行左侧空白数 vs 上下一行；② 若上一行属于某个 `if/elif/else`/`for`/`while` 体而本行缩进更浅，本行会**闭合**该体。**r3 的全部 15 个 hunk 已按此规则复查**：只有 hunk 10 落在链结构附近，且落在链**外**。

### 10.22.4 若 r3 再错，会先在哪条判词暴露

| 若… | 先暴露在 |
|---|---|
| 入队块位置又错（切链） | `TypeSyntax authority incomplete`，**无条件、source 0** —— 与 r2 同签名。先跑 §10.22.1 的 `CHAIN-CHECK`，`arms` 应恒为 12 |
| `forwardNominalRoot` 分类或重置错 | `child TypeId unavailable`（大范围）或 `forward nominal queue not drained rows=…` |
| append 相误传 `replayForward = true` | `child TypeId unavailable` **雪崩**（一行都不处理），确定性全红 |
| 阻塞传播漏判 | 同 `child TypeId unavailable` |
| 重放相基址取错 | `forward nominal replay view invalid source_index=… base=… rows=… total=…` |
| 重放循环没跑 | `forward nominal queue not drained rows=… cleared=0 first_nominal_row=…` |
| **L1（空队列字节中性）过、L2/L3 不过** | 说明地基对了，问题在重放路径本身 —— 查 §10.19 的分层判据 |


## 10.23 r2 回退工具：重建过程与对拍（本轮新增）

### 10.23.1 事件

我**就地覆盖**了 `patches/forward_typeid_deferred_replay.patch`（`09381e93…` → `b507878a…`，23:47），而第九手在此之前已用**旧版 r2** 落树并烤了 `kd_r9r`。他用**新版**去 `-R` 一个由**旧版**造出的状态，得到 arena `775e11cc…` / csg `5d2679fc…`，无法自愈。
**这是我的流程缺陷：覆盖同名补丁前没有留下上一版。** 处置见 §10.23.4。

### 10.23.2 关键事实：`775e11cc… / 5d2679fc…` **就是 r2 的结果态**，不是"来源不明的中间态"

取证：树在该态时，`typed_expr_type_arena.cheng` 里
`state.forwardNominalRoot = -1` 出现在 `:7382`（dispatch 之前），入队块出现在 `:7396`（**dispatch 之内**，Qualified 分支守卫之后），其后紧跟已成为死代码的 `for childOffset in 0..<childCount:`。
⇒ 两条独立特征都指向 **r2 的插入位置**。第九手那次 `-R`（用新版 r3）实际是**原子失败、树未变**。

### 10.23.3 重建路线（每步都被 sha256 钉住，可直接复跑）

r3 相对 r2 **只动了一个块的插入位置**。该移动的机械描述：

- **位置 A（r2）**：`state.forwardNominalRoot >= 0` 的入队块（12 行）紧跟在
  `elif kind == parser.ParserTypeSyntaxQualified:` 分支守卫的 `return false` **之后**，**在** `for childOffset in 0..<childCount:` **之前**，缩进 8 空格。
- **位置 B（r3）**：同一个 12 行块（前面加 9 行 `# [forward-typeid] The forward verdict is consumed HERE…KEEP IT HERE.` 注释）插在
  `else: / err = " typed expr type arena: TypeSyntax authority incomplete" / return false` **之后**、`arenamod.ArenaArrayInt32Set(` **之前**，仍是 8 空格，但**已在整条 if/elif/else 链之外**。

于是：

| 步 | 操作 | 读数 |
|---|---|---|
| 0 | 读树 | arena `775e11cc…`、csg `5d2679fc…` |
| 1 | 把入队块从 A 移到 B（加 B 注释） | — |
| 2 | 对移动结果 `git apply -R --check` **r3** | **rc=0** ⇒ 移动结果就是 **r3 的期望结果**（这一条独立证明移动是精确的） |
| 3 | 对移动结果施加 `-R r3` | 得基线 |
| 4 | 基线 sha256 | arena **`e6d16ece…`** ✓（与记录值一致）、csg **`c2a6550d…`** ✓ |
| 5 | `difflib.unified_diff(基线, 树)` → 补丁文本 | sha256 = **`09381e9367ffa7aced416a96d4b791cb963738e490bbcf1dc621bae1707bd10f`** = **r2 逐字节** ✓ |
| 6 | 把该文本 `-R --check` 施加到**当时的活树**（r2 态） | **rc=0**；施加后两文件与基线**逐字节相同** ✓ |
| 7 | 从基线**前向** `--check` 该文本 | **rc=0** ✓ |

**结论**：`patches/forward_typeid_deferred_replay_r2_revert_tool.patch`（27,938 B，sha256 与 r2 相同）**就是 r2 的原文**，不是近似重建。交付时活树已被恢复到 r9o（两文件 sha 与记录值一致），故两种工具现在都能从 r9o 前向施加：`r3 --check rc=0`、`r2tool --check rc=0`。

### 10.23.4 纪律修正（已采纳）

1. **覆盖同名补丁前先存档**：r3 已同时存于 `patches/forward_typeid_deferred_replay_r3_archive.patch`（与规范路径逐字节相同）。今后每次覆盖前先 `cp <name> <name>_rN_archive.patch` 并把 sha 记进台账。
2. **回退一律用当时那一版的副本**，不用"现在磁盘上那一版"（第九手已把这条记入 `.rebuild/s1b_step3/r9/patchgen/` 的纪律）。
3. 台账（文首）现在同时给出**每个版本的 sha256 + 可复原位置 + 是否可复原**；r1 明确标注**不可复原**。


## 10.24 新一层墙：`nominal declaration is not visible … name=ptr`（本轮定性）

### 10.24.1 判词点与完整判据链

**两个站点**（互为孪生，本次触发的是索引版）：

| 站点 | 函数 | 使用者 |
|---|---|---|
| `typed_expr_type_arena.cheng:3385` | `typedExprTypeAuthorityResolveUnqualifiedInto`（树版） | 全林驱动 |
| **`typed_expr_type_arena.cheng:4764`** | **`typedExprTypeAuthorityIndexResolveUnqualifiedInto`（索引版）** | **逐源驱动 ← 本次实测命中** |

**链（从驱动到判词）**：
`CompilerCsgStreamTypeArenaFromDeclarationIndexInto`（`compiler_csg.cheng`）
→ `TypedExprTypeResolutionAuthorityAppendSourceInto`（`arena:4862`）的 nominal 分支
→ `:4950` 跳 qualified 段 → `:4963` **唯一的"内建名"过滤器**：
```
        if typedExprTypeArenaScalarKind(name) !=
               TypedExprStructuralScalarInvalid:
            continue
```
→ `:4978` `typedExprTypeAuthorityFindGenericSymbolSourceInto`（泛型参数则跳过）
→ `:4993` `typedExprTypeAuthorityIndexResolveUnqualifiedInto`
→ `:4728` 先查**本源**声明 → `:4733` 再遍历**同 owner 且 allowsUnqualified 的 import 边**
→ `matchedRoot < 0` ⇒ **`:4764` 判词**。

### 10.24.2 `name=ptr` 是什么：**内建类型拼写，全仓无声明**

| 证据 | 命令 / 坐标 | 读数 |
|---|---|---|
| `ptr` **从未被声明**为类型 | `grep -rnE "^[[:space:]]*(type\|const\|let\|var\|fn)[[:space:]]+ptr([[:space:]]\|\(\|=\|:)" --include=*.cheng .` | 仅 2 条**变量名叫 ptr** 的行（`let ptr: ptr = &data[0]` 等），**没有任何 `type ptr`** |
| `ptr` 是**语言认可的内建拼写** | `parser.cheng:6500` `if typeText == "ptr": return true`（`ParserTypeExprIsScalarLike`）；`parser.cheng:6430` 把它列进内建调用名；`typed_expr.cheng:28841-28842` 归一到 `"ptr"` | 与 `cstring` 同级 |
| 裸标识符在类型位**一律产出 Nominal** | `parser.cheng:18766-18776`：`parserTypeSyntaxTokenCanName(firstKind)` 成立即 `AppendTypeSyntaxNode(tree, ParserTypeSyntaxNominal, nameToken, …)` | **`ptr` 没有特例** |
| arena 侧**没有指针表示** | `:4950` 的过滤器是 `typedExprTypeArenaScalarKind`，它列了 17 个标量名（`void/bool/char/int/uint/int8…float64/str/cstring`），**不含 `ptr`**；`TypedExprStructuralTypeKind` 与 `TypedExprStructuralScalarKind` 两个枚举**都没有 Ptr 成员** | ⇒ `ptr` 落穿到 nominal 解析 |
| `ptr` 在**本次闭包内真实出现** | `src/std/rawbytes.cheng` 用 9 次、`src/std/strutils.cheng` 用 15 次；而 `src/chain/binary_types.cheng:2-5` 恰好 `import std/rawbytes` / `import std/strutils` | 与实测 `producer_source=3` 吻合 |

⇒ **结论：`ptr` 是内建类型拼写，本就没有声明行，不该被当作名义类型去解析。** 不是"某源里的真实名义类型"，也不是"可见性域不对"。

### 10.24.3 它有没有越过我的 `SymbolId` 分界线？——**没有，而且它根本没走到我的代码**

我的分界线在 `ResolveNominal`（**arena intern 相**）；本次失败在 **authority 相**，而 authority 相在驱动里**先于** `AppendSourceFromTreeInto` 执行：
```
CompilerCsgStream… :  AppendSourceInto(…authority…)   ← 本次死在这里
                      AppendSourceFromTreeInto(…arena…) ← 我的队列/入队/重放全在这一侧
```
r3 触碰的函数只有：build state 的两个新字段、队列结构体与 4 个 helper、`ResolveNominal` 的前向分类、`InternSyntaxRec` 的过滤/传播/入队/清标记、`ReplayForwardRowsInto`、驱动的重放循环。**其中没有任何一个在 authority 路径上**，authority 也**从不读我的队列**。
⇒ `ptr` 这一行**没有入队**，也不是"重放分类过宽"；它在我的分类之前就已经失败了。

### 10.24.4 定性：既有的、**与 step 3 无关**的下一层墙

- 树版孪生（`:3385`）有**逐字相同**的判词 ⇒ **全林路径同样有这个洞**，不是逐源驱动引入的。
- r3 之前它不可达，只是因为 r9o 在 `source_index=0` 就死了；r3 让 0..2 通过后它才露出来。**这符合"推进是真的"**。
- C 链（bake）能编过同一批源 ⇒ 这是**程管线相对 C 链的能力缺口**，与战役里已记录的同类缺口同族。

### 10.24.5 修法方向（**两条，我不写**——都会动身份/哈希面，不属于 step 3）

| 方向 | 内容 | 代价 / 风险 |
|---|---|---|
| **(a) 给 arena 加 `ptr` 表示** | 新增 `TypedExprStructuralTypeRawPtr`（或 `ScalarKind` 增 `Ptr` 槽），并在 `:4963` 的过滤器里认它 | 动 `TypedExprStructuralTypeKind`/`ScalarKind` 枚举 ⇒ **可能位移 schema/CID**；且要定义 `ptr` 的 trait 语义。**必须由语言/身份面 owner 定** |
| **(b) parser 不为内建拼写产出 Nominal** | 在 `:18766` 前加内建名分支 | 改的是**全语言的类型语法面**；且下游 `InternSyntaxRec` 仍需认识新 kind ⇒ 实际仍要 (a) |

**只是"跳过 `ptr`"不是修法**：`:4963` 若 `continue`，该行 `typeSyntaxTypeIds[ptrRow]` 会保持 `FillTypeSyntax` 播种的 `-1`，任何引用它的父行会在 arena 相报 `child TypeId unavailable`——**把墙从 authority 相挪到 arena 相，不解决问题**。所以我不写这条"看着最省"的改法。

### 10.24.6 探针（本补丁，纯诊断）

`patches/forward_typeid_not_visible_probe.patch`，sha256 **`0d3d620b14e6e2f55516eb9e52872df3a1523cee8ce0358f52faa02243478ae6`**，+24 / −2，**6 hunk / 1 文件 / 2 个站点各 3 hunk**。

**改了什么**：在两个 `ResolveUnqualifiedInto` 里加两个计数器（`candidateImportEdges` / `unqualifiedImportEdges`），并把判词改成
```
… nominal declaration is not visible producer_source={} name={} owner_import_edges={} unqualified_import_edges={} import_rows={}
```
**行为零变更**（仍然 `err = …; return false`）。新坐标的读法：
- `unqualified_import_edges=0` ⇒ 本源根本没有可用的非限定 import 边 ⇒ **名字不可导入**（内建拼写/未声明），(a) 方向；
- `>0` 但无匹配 ⇒ 边在、但目标源不声明该名 ⇒ 导入/导出面问题；
- `import_rows` 给的是排序后的边总数（判断排序视图是否为空）。

**为什么只给探针、不给修法**：定性**已经由 §10.24.2 的五条静态证据钉死**（`ptr` 全仓无声明 + 是内建拼写 + arena 无表示 + 闭包内真实出现），不需要坐标才能判；而两条修法都会动枚举/CID 面，**不是我该替 owner 拍板的**。探针是给接手 (a)/(b) 的人一次跑出全貌用的。

**自验（scratch 内，仓库只读）**：

| 检查 | 读数 |
|---|---|
| `git apply --check` | **rc=0** |
| 正向施加 → `-R` | **rc=0**，与源文件**逐字节相同** |
| `/usr/bin/diff -u` 回生成 → `patch` 施加 | **identical=True**；+/- 多重集 **相等（26/26）** |
| **`CHAIN-CHECK`** | **施加前 ok=True arms=12；施加后 ok=True arms=12**（未切链） |
| 行数 | +24 / −2 |

**逐标识符可见性证明（不只是"已绑定"，是"在该函数作用域内、且声明在用处之前"）**：

| 新标识符 | 声明处（新行号） | 使用处（新行号） | 所在函数 | 结论 |
|---|---|---|---|---|
| `candidateImportEdges` | `arena:3350`（hunk 1） | `:3360`（hunk 2）、`:3387`（hunk 3） | `typedExprTypeAuthorityResolveUnqualifiedInto`（`:3338` 起） | ✓ 同函数、声明在前；**无函数内前向引用、无跨函数引用** |
| `unqualifiedImportEdges` | `arena:3350` | `:3360`、`:3387` | 同上 | ✓ |
| `candidateImportEdges` | `arena:4741`（hunk 4） | `:4751`（hunk 5）、`:4777`（hunk 6） | `typedExprTypeAuthorityIndexResolveUnqualifiedInto`（`:4719` 起） | ✓ 同上（两个函数各有自己的一对，**无跨函数共享、无遮蔽**） |
| `unqualifiedImportEdges` | `arena:4741` | `:4751`、`:4777` | 同上 | ✓ |

每个函数的 3 个 hunk 全部落在该函数体内（`:3350/3360/3387` ∈ `3338→~3395`；`:4741/4751/4777` ∈ `4719→~4775`），**没有一处落在函数外的顶层**，因此不存在上一轮 DeclKey 那类"函数内前向引用"问题。

### 10.24.7 判据对照

| 判据 | 本探针的预期 |
|---|---|
| `binary_types_via_import` / `closure8` / `pair2_ord2` 的 `not visible` | **改坐标**（判词尾部多出 `owner_import_edges=… unqualified_import_edges=… import_rows=…`），**不消失**——因为根因是内建拼写缺表示，探针不修它 |
| `pair2_ord1` | 保持 `rc=0` |
| 四正例 / 负例 | **逐字不变**（探针不在它们的路径上；且只加字段不改控制流） |
| 三件对照 / `kd_r9t` | **逐字节相同**（探针只改两处判词字符串，不产生 TypeId、不进哈希面） |
| 若再错先暴露在哪 | 若 `unqualified_import_edges` 字段没打印出来 ⇒ `Fmt` 里标识符未绑定（编译期）；若 `arms` 不是 12 ⇒ 切链 |


## 10.25 新一层墙：`… not visible producer_source=6 name=T`（本轮定性）

### 10.25.1 `T` 是什么：`src/std/seqs.cheng` 的**环境泛型参数**，全文件无声明

`kd_r9v` 实测：`binary_types_via_import` 死在 `source_index=6`，缺的名字从内建 `ptr` 换成 `T`。

**闭包候选与排序旁证**：`binary_types.cheng` 的传递闭包 = {main 夹具, `cheng/chain/binary_types`, `cheng/std/bytes_layout`, `std/rawbytes`, `std/rawmem_support`, `std/result`, `std/seqs`, `std/strings`, `std/strutils`, `std/system`}。按模块路径排序，`ptr` 那轮 `producer_source=3` 落在**唯一两个用 `ptr` 的 std 源**之一（`rawbytes` ptr=9 / `strutils` ptr=15 / `system` ptr=93）——与本假设一致；同一排序下 **index 6 = `src/std/seqs.cheng`**。
> 这是**旁证不是定论**：`orderedSources` 的确切序由 `CompilerCsgSortSourcePathModulePairs`（`compiler_csg.cheng:26881`）决定，我**没有**把排序键逐位复原。**§10.25.6 的探针会直接印出坐标**，以它为准。

**`seqs.cheng` 的关键事实**（可复现）：
```
grep -nE "^(fn|type|const|let|var).*\[T\]" src/std/seqs.cheng      → 空
grep -nE "\[T\]|\[T," src/std/seqs.cheng | head                   → 10 处，全部是调用点（chengSeqHeader[T](…) / elemSize[T]() …）
grep -nw T src/std/seqs.cheng | head                                 → :50 fn chengSeqHeader(seqInst: var T[], header: …)
                                                                       :55 fn chengSeqCommitHeader(seqInst: var T[], …)
                                                                       :60 fn chengSeqFreeTyped(seqInst: var T[])
                                                                       :132 fn resize(seqInst: var T[], …)
                                                                       :138 fn len(seqInst: T[]): int32
                                                                       :147 fn get(seqInst: T[], at: int32): T
```
⇒ **`T` 在 `seqs.cheng` 的类型位大量出现，而全文件没有任何 `[T]` 声明**；文件内注释 `:76` 也自述"the sole generic freeSeq(T[]) below"，即这些函数被当作**对任意 T 成立**来写。**同一个 `T` 在文件里有约 10 个使用点、0 个声明点**，所以"哪一个 `T`"这个问法在这个源上**不成立**——它不是某个容器的形参，而是**环境（ambient）泛型参数**。

**反例对照（说明这不是"泛型全都解析不了"）**：`src/std/result.cheng:11` `Result[T] =` 在 `type` 块内**显式声明**了 `T`，`Ok[T](value: T)` / `Err[T](…)` 也带 `[T]` ⇒ result 的 `T` 有容器行，**root walk 找得到**。这正是同闭包内 index 较小的源能过、而 `seqs` 过不去的原因。

### 10.25.2 机制：泛型查找要求"**走到的那一行自己带泛型窗口**"

`TypedExprTypeResolutionAuthorityAppendSourceInto`（`arena:4867`）的 nominal 分支：
```
        var rootTypeSyntaxNodeIndex = localRow
        while localParents[rootTypeSyntaxNodeIndex] >= 0:
            rootTypeSyntaxNodeIndex = localParents[rootTypeSyntaxNodeIndex]
        let genericSymbolRow = typedExprTypeAuthorityFindGenericSymbolSourceInto(
                tree, rootTypeSyntaxNodeIndex, viewGenericSymbolBase, name, err)
        if genericSymbolRow >= 0: … 记为泛型参数引用，continue
        … 否则 typedExprTypeAuthorityIndexResolveUnqualifiedInto(…) → :4764 "not visible"
```
而 `typedExprTypeAuthorityFindGenericSymbol`（`:3348` 附近）**只读 `rootTypeSyntaxNodeIndex` 这一行的** `ParserValueExprTypeSyntaxGenericSymbolStartAt/CountAt`，并要求 `genericCount > 0`、且每个候选的 `DeclarationOwnerToken` 与该行的 owner token 相等；`genericCount == 0` 直接 `return -1`。
⇒ **`T` 只有在"它所属的那棵 TypeSyntax 子树的最顶行**恰好就是泛型容器行"时才被认出来。`seqs.cheng` 的 `fn len(seqInst: T[])` 里，`T` 走到顶只会落到参数类型/函数行，而**没有任何一行是 `T` 的容器** ⇒ `genericCount == 0` ⇒ 落到名义解析 ⇒ `:4764` "not visible"。

### 10.25.3 是不是我们这串改动引入的？——**不是**（正面回答重放那一路）

**正面回答"重放是否丢了泛型绑定上下文"：不可能，因为重放根本不重建 authority。**
`TypedExprTypeArenaReplayForwardRowsInto`（r3 新增）做的第一件事之一就是 `state.authority = share(authority)` —— 它**复用**驱动里已经建好的那个 authority 对象，**不重新计算任何 authority 行**。所以：
- 若某个源有解析不了的 `T`，它在 **`AppendSourceInto`（authority 相）** 就会失败，**与该源有没有前向边、要不要重放完全无关**；
- 实测的失败点也**正是** `TypeArena resolution authority failed source_index=6`（驱动对 `AppendSourceInto` 的包装），**不是** `TypeArena forward replay failed`。

**两条独立结构证据**：
1. r3 触碰的函数（build state 两字段、队列+4 helper、`ResolveNominal` 前向分类、`InternSyntaxRec` 过滤/传播/入队/清标记、`ReplayForwardRowsInto`、驱动重放循环）**没有一个**在 authority 路径上；authority **从不读** `state.forwardNominal`。
2. **树版孪生用同一个泛型查找器**：`:3385`（树版 `ResolveUnqualifiedInto`）与索引版共享同一个 `typedExprTypeAuthorityFindGenericSymbolSourceInto` ⇒ **全林路径对同一份 `seqs.cheng` 会报同一句**（同样的 `name=T`）。既有洞，非逐源引入。

⇒ 与 `ptr` 那轮**同一个模式**：既有能力缺口，被前一层修好后才露出。

### 10.25.4 修法设计（**设计，不写补丁**）

| 方向 | 内容 | 影响面 / 风险 |
|---|---|---|
| **(A) 源侧显式化** | 给 `seqs.cheng` 那批函数补上 `[T]`（`:50/:55/:60/:132/:138/:147/…`） | **零身份/CID 变动**、零管道改动；但**改的是 std 源码语义面**，且要先确认"环境泛型"是不是规范允许的写法——`system.cheng:2723 fn newException(t: typedesc[T], message: str): T` 也是同样写法，说明**不是孤例**，逐个补 `[T]` 可能是错的方向 |
| **(B) parser 记一行"文件/模块级泛型容器"** | 让环境 `T` 有一个 owner 行（模块根行）带 `genericSymbolCount > 0`，root walk 自然命中 | 改 parser 的 generic symbol 归属 ⇒ **不动枚举、不动 CID**（genericSymbol 行本来就是 parser 侧事实，且 `typeGenericSymbolCount` 已进 `genericSymbolCountBySource` 与 arena 列）——**但会改 `typeGenericSymbolCount` ⇒ 改 `genericSymbolCount` ⇒ 可能位移 arena 列长与 `artifactRaw32`**，须先量化 |
| **(C) authority 侧放宽** | 让 `FindGenericSymbol` 在根行窗口为空时再向上/向文件级回落 | **这是放宽守卫**，按纪律**不可取** |

**为什么我不写补丁**：(A) 是"改别人的源码来绕"、方向未定；(B) 动 `typeGenericSymbolCount`，**必须先量化对 `genericSymbolCount` / `artifactRaw32` 的位移**，而这一步只能在有编译槽时做；(C) 违反"不许放宽守卫"。**三条都不该由我在只读条件下拍板。**

### 10.25.5 与 DeclKey v4 探针的叠加关系

**互斥（不同文件）**：本探针只改 `src/core/lang/typed_expr_type_arena.cheng`（`grep "^diff --git"` 只有一行）；DeclKey v4 在 `compiler_snapshot_builder.cheng`。⇒ **两者可同炉烤，也可分炉，无叠加冲突、无同文件 hunk 交叠**。

### 10.25.6 探针（本补丁，纯诊断）

`patches/forward_typeid_generic_owner_probe.patch`，sha256 **`32f1f9353033813745efb09780ca3af69d9626e97266f1a07085f2f1b270b244`**，**1 hunk / 1 文件 / +25 / −0（纯插入）**，落在 `TypedExprTypeResolutionAuthorityAppendSourceInto`（`:4867`）的 resolve 失败分支内。

**它把判词从**
```
typed expr type arena: nominal declaration is not visible producer_source=6 name=T
```
**变成**
```
… name=T name_not_visible type_syntax_row=… root_row=… root_generic_count=… source_generic_symbols=… name_is_source_generic=…
```
读法（**这就是定性的判据**）：

| 读数 | 含义 | 对应修法 |
|---|---|---|
| `name_is_source_generic=0` **且** `source_generic_symbols=0` | parser 对该源**一个泛型符号都没记** ⇒ 环境 `T` 在 parser 侧无表示 | **(B)** |
| `name_is_source_generic=0` 但 `source_generic_symbols>0` | 该源有别的泛型容器，唯独没有 `T` | 确认 `T` 的确切来源后再定 |
| `name_is_source_generic>0` 而 `root_generic_count=0` | `T` **是**该源某容器的形参，但 **root walk 没走到那个容器** | 修 **root walk / owner 归属**（既不是 A 也不是 B） |

**自验（scratch 内，仓库只读）**：`apply --check` **rc=0**；正向 → `-R` **rc=0 且与源文件逐字节相同**；`diff -u` 回生成 → `patch` 施加 **identical=True**，+/- 多重集 **相等（25/25）**；**`CHAIN-CHECK` 施加前 ok=True arms=12、施加后 ok=True arms=12**（未切链，本补丁离那条链很远，属额外保险）。

**逐标识符可见性证明（同函数、声明在前、不跨函数）**：

| 标识符 | 声明处（新行号） | 使用处 | 结论 |
|---|---|---|---|
| `sourceGenericSymbols` | `arena:5008` | `:5011`（自增）、`:5024`（Fmt） | ✓ 同函数 `AppendSourceInto`（`:4867` 起），声明在使用之前 |
| `nameIsSourceGeneric` | `arena:5009` | `:5021`（自增）、`:5024`（Fmt） | ✓ 同上 |
| `probeGenericRow` | `arena:5010`（`for` 变量） | `:5012/:5015/:5017` | ✓ 仅在循环体内，作用域正确 |
| `probeNameToken` | `arena:5017`（`let`） | `:5018`（越界守卫）、`:5019`（文本比较） | ✓ 声明紧邻其使用之前 |

**用到的既有标识符**（全部在该点之前已绑定，且都在同一函数内）：`tree`/`producerSourceIndex`/`name`/`err`（形参）、`localRow`（FileTypeSyntax 循环变量）、`rootTypeSyntaxNodeIndex`（本分支上文 `var`）、`arenamod.ArenaArrayInt32Get`、`parser.ParserValueExprTokenText`、`parser.ParserValueExprTypeSyntaxGenericSymbolCountAt`、`tree.arena`/`tree.tokenCount`/`tree.typeGenericSymbolCount`。**无函数内前向引用、无跨函数引用、无签名变更、无新依赖。**

**结构性核对**：插入点在一个 `if !…():` 的**体**内、该 `if` **没有 `elif/else`**，新增语句与该体原有的 `return false` **同缩进（12 空格）** ⇒ 不切任何链、不闭合任何体。

### 10.25.7 若本判断错了，会先在哪条判词暴露

| 若我判断错在… | 先暴露在 |
|---|---|
| `seqs.cheng` 的 `T` 其实有容器（我把 root walk 读窄了） | 探针会印出 `name_is_source_generic>0` 且 `root_generic_count=0` ⇒ 转为"修 root walk"，我上面的 (A)/(B) 判断作废 |
| index 6 不是 `seqs.cheng`（排序键复原有误） | 探针印出的 `type_syntax_row`/`source_generic_symbols` 与我对 seqs 的预测不符 ⇒ 以探针为准 |
| 泛型绑定确实在重放路径上丢了 | 现象会是 `TypeArena forward replay failed …`（**而不是** `resolution authority failed`）+ `child TypeId unavailable`。**实测不是这个**，故此分支已被实测排除 |
| 探针本身写坏 | 编译期（标识符/Fmt 字段）；或 `CHAIN-CHECK` arms≠12（本补丁不该影响它） |


## 10.26 隐式类型参数：(A)/(B) 裁决、C 链参照实现、以及 (B) 的量化（本轮）

### 10.26.1 裁决：**规范明文承认隐式类型参数 ⇒ (B) 是修法，(A) 是改合法源码绕开**

`docs/cheng-formal-spec.md:518-529`，逐字：

```
#### 隐式类型参数（语法糖，编译期）

除显式 `typeParamList`（如 `fn f[T](x: T): T = ...`）外，Cheng 还支持**隐式类型参数**的简写形式：

- 适用范围：`fn` / `iterator` / `template` / `macro` 的例程声明（不含 lambda 字面量）。
- 触发条件：例程头部省略 `typeParamList`，但在**参数类型**或**返回类型**里出现了自由的单字母大写标识符（`T`/`U`/`K`/`V`/...）。
- 语义：编译器按签名从左到右的首次出现顺序补全类型参数列表；例如
  - `fn len(xs: T[]): int32 = xs.len` 等价于 `fn len[T](xs: T[]): int32 = xs.len`
  - `template mapIt(xs: T[], body: untyped): U[] = ...` 等价于 `template mapIt[T, U](...) = ...`
- 限制：只识别 ASCII 单字母大写；限定名（如 `mod.T`）不引入隐式类型参数；若同名类型已在作用域内定义，则按该类型解析（不当作隐式类型参数）。
```

**规范给出的例子 `fn len(xs: T[]): int32` 与 `src/std/seqs.cheng:138 fn len(seqInst: T[]): int32` 逐字同形。**
⇒ **`seqs.cheng` 是合法源；(A)「给源码补 `[T]`」是把合法语法糖改写成显式形式来绕开管线缺口，方向错**（且 `system.cheng:2723 fn newException(t: typedesc[T], …): T` 同形，逐个补 `[T]` 会变成大面积源码改写）。
⇒ **走 (B)：在 parser 侧为隐式类型参数建立 `genericSymbol` 绑定。** 非"非法源"，**不需要门禁/规范迁移**。

### 10.26.2 C 链的既有处理（它就是这么编过 `seqs.cheng` 的）

| 步 | file:line | 内容 |
|---|---|---|
| 1 | `bootstrap/cheng_cold.c:5033` | `cold_add_implicit_generic_name(ColdFunctionSymbol *symbol, Span token, …)` —— 把单个名字补进函数的泛型名表 |
| 2 | `bootstrap/cheng_cold.c:5055` | `cold_infer_implicit_generic_names(ColdFunctionSymbol *symbol, Span text, …)` —— 扫一段**文本 span**，按出现顺序挑出单字母大写标识符（`:5063` 调 `cold_add_implicit_generic_name`） |
| 3 | `bootstrap/cheng_cold.c:5260` | `cold_infer_implicit_generic_names(symbol, params, symbols);` —— **先参数表** |
| 4 | `bootstrap/cheng_cold.c:5261` | `cold_infer_implicit_generic_names(symbol, ret, symbols);` —— **再返回类型** |
| 5 | `bootstrap/cold_parser.c:6425` | 注释自述这是 `heuristic (e.g. "single uppercase letter")`，并强调 **必须在其它推断之前跑** |

⇒ C 链**逐字实现了规范的规则**：无 `typeParamList` 的例程，扫 **params → ret** 两个文本 span，按**首次出现顺序**建 `T`/`U`/… 的绑定。

**Cheng 侧的缺口（这就是要补的地方）**：`src/core/lang/parser.cheng:15824 ParserValueExprAppendGenericSpan` 会往 `typeGenericSymbol*` 各列追加行（追加点见 `:17836-17860`），但它吃的是**显式 `typeParamList` 的 `nameTokenIndexes`**（`:17830` 空列表直接报 `empty generic declaration`）。**parser 里没有 `cold_infer_implicit_generic_names` 的对应物** ⇒ 隐式参数从不产生 `genericSymbol` 行 ⇒ authority 的 `FindGenericSymbol(根行, name)` 必然 `genericCount == 0` ⇒ 落到名义解析 ⇒ `:4764` "not visible"。

### 10.26.3 (B) 的量化：改了什么、影响面多大

**(a) 哪些列/序列按 `typeGenericSymbolCount` 走**（全部已实读核对）：

| 类别 | 具体 | 坐标 |
|---|---|---|
| **两个计数器** | `value.genericSymbolCount`、`value.genericSymbolChildCount` | 两者都**进哈希头**：`typed_expr_type_arena.cheng:826-827` |
| **15 个按 `limits.genericSymbolCount` 预留的 arena 列** | `genericSymbolProducerSourceIndexes` / `DeclarationOwnerTokenIndexes` / `NameTokenIndexes` / `NameIds` / `Ordinals` / `SpanStarts` / `SpanEnds` / `OwnerTypeSyntaxNodeIndexes` / `ConstraintTypeSyntaxNodeIndexes` / `DefaultTypeSyntaxNodeIndexes` / `ConstraintTypeIds` / `DefaultTypeIds` / `ChildStarts` / `ChildCounts` / `ChildTypeSyntaxNodeIndexes`（+ `ChildTypeIds`） | 预留点 `:4232-4269` |
| **15 个列全部进哈希** | 逐列 `typedExprTypeArenaAppendColumn` | `:897-932`；另有 `genericSymbolIds` `:936` |
| **逐 TypeSyntax 行的泛型窗口** | `typeSyntaxGenericSymbolStarts` / `typeSyntaxGenericSymbolCounts` —— 行数不变，但**值被 `viewGenericSymbolBase` 重基** | 写入 `FillTypeSyntax`；两者**也在哈希内** |
| **索引/limits** | `index.genericSymbolCountBySource` ← `tree.typeGenericSymbolCount`；`limits.genericSymbolCount` = 逐源求和 | `LimitsFromIndexInto` |

**(b) 位移的范围：不是"只影响含该形态的源"**

`genericSymbolBase` 是**逐源前缀和**。在源 k 多出 N 个泛型符号 ⇒

| 源的相对位置 | 是否受影响 | 依据 |
|---|---|---|
| 排在 k **之前**的源 | **不受影响** | 前缀和未变 |
| **源 k 本身** | 受影响（多出 N 行） | 直接 |
| 排在 k **之后、且自身 `typeGenericSymbolCount > 0`** 的源 | **受影响**：它们的**全局泛型行基址整体后移 N** ⇒ 其 `typeSyntaxGenericSymbolStarts` 的**值**改变（该列在哈希内） | 前缀和位移 |
| 排在 k **之后、且自身 `typeGenericSymbolCount == 0`** 的源 | **不受影响**：其每一行的 start 都是 `rebase(base, -1) = -1`，与 base 无关 | `typedExprTypeArenaRebaseRow` 的 `-1` 规则 |

**⇒ 反例（连带影响的具体形态）**：一个 **2 源输入，源 0 含隐式泛型例程、源 1 含显式泛型** ⇒ 源 1 自己完全"无辜"，但它的泛型行基址后移 ⇒ 源 1 的 `typeSyntaxGenericSymbolStarts` 值变 ⇒ `artifactRaw32` 变。**"只影响含该形态的源"是错的**，正确说法是上面那张表。

**(c) "不含该形态的输入逐位不变"是否成立？——成立，但有一个必须守住的前提**

- **成立**：若输入中**没有任何源**含隐式泛型例程，则一个新 `genericSymbol` 行都不会产生 ⇒ 所有 `*BySource` 计数、前缀和、列长、计数器全部不变 ⇒ `artifactRaw32`、`typeArenaArtifactCid`、快照 schema **逐位不变**。这正是 (B) 可以安全落地的依据。
- **前提（必须由实现守住）**：**不得对已显式声明的形参重复计数**。规范的限制条款（`规范:529`）要求"同名类型已在作用域内定义 ⇒ 按该类型解析"，且 `fn f[T](x: T)` 这种**既有显式 `[T]` 又有 `T` 用法**的例程极普遍——朴素实现（无条件扫单字母大写）会把它们**重复计数**，把影响面从"含隐式泛型的源"扩大到"含任何泛型的源"。
  **好消息**：重复计数不会静默——`FindGenericSymbol` 已有 `duplicate generic declaration` 与 `generic owner identity forged` 两条硬失败（`:3401` 附近、`:3417` 附近）。**坏消息**：那是运行期判词，不是编译期门禁；所以实现里必须显式写"已声明参数集合"这一关。

**(d) 会不会动身份/CID/快照**

| 面 | 结论 | 依据 |
|---|---|---|
| `artifactRaw32` / `typeArenaArtifactCid` | **对 (b) 表中"受影响"的输入会变**；对不含该形态的输入**逐位不变** | §10.26.3(a) 的哈希列清单 |
| **枚举 / schema 形状** | **不动**。`TypedExprStructuralTypeKind` / `ScalarKind` 不变；`ParserValueExprTree` 的**列集合不变**（只是某些列**行数变多**） | 本方案不新增任何列/成员 |
| **收据/回执** | 绑定 arena 产物 CID 的下游收据会随之变化——**具体到哪几层我没有逐点核**（见 §10.26.6 未测项） | 未验证 |
| `compiler_snapshot_builder.cheng` | **不需要改**（本方案完全不碰它） | — |

### 10.26.4 明确不许走的第三条

**(C) 放宽 authority 回落**（根行窗口为空时向上/向文件级回落）——**保持否决**。理由不变：那是**放宽守卫**。
附带论证：**(B) 落地不需要放宽任何守卫** —— 它让 `genericSymbol` 行**真实存在**，于是 `FindGenericSymbol` 的现有判据（`genericCount > 0` + owner token 相等 + 唯一匹配）**原样成立**；`duplicate generic declaration` / `generic owner identity forged` 两条硬失败**一条都不用改、也不该改**（它们正是重复计数的探测器）。

### 10.26.5 实现计划（给 owner，镜像 C 链）

1. 在 `parser.cheng` 的**例程声明**路径（`typeParamList` 省略时）新增一个 `ParserValueExprInferImplicitGenericNames`，镜像 `cheng_cold.c:5055`：对 **params 文本 span → ret 文本 span** 依次扫描，按首次出现顺序收集。
2. 只认 **ASCII 单字母大写**；**跳过限定名**（`mod.T`）；**跳过已在作用域内定义的同名类型**（规范 `:529`）——第三点是 C 链里由符号表承担的那一半，**需要据 `parser` 的声明面实现，具体挂点我没有定位**（见未测项）。
3. ~~用现有 `ParserValueExprAppendGenericSpan`（`parser.cheng:15824`）追加~~ **【已更正，见 §10.27.0】** 真正写 `typeGenericSymbol*` 列的是 `ParserValueExprAppendDeclarationGenericSymbols`（`parser.cheng:17707`）；`AppendGenericSpan` 写的是另一族 `explicitGenericSpan*`。落点应是把名字追加到**该例程的 TypeSyntax 行**的泛型窗口上（与显式 `[T]` 同落点），这样 `FindGenericSymbol(rootRow, name)` 无需改动即可命中 —— 但**它能不能在原地做，取决于 §10.27 的作用域排他挂点**。
4. 排他性：显式 `typeParamList` 存在时**不跑**推断（规范：`省略 typeParamList` 才触发）。

**为什么我不出这个补丁（结论性）**：这是**在自举链最上游的 `parser.cheng` 里新增一个语言特性实现**，而
- 第 2 点的"同名类型已在作用域内定义"需要**声明面/作用域**知识，我**没有定位到挂点**（未测项）；
- parser 是自举的：写错会打断 bootstrap，**爆炸半径全仓最大**；
- 我不能编译。
按既定纪律（"别写没把握的修法"），**本轮只交裁决 + 量化 + 实现计划，不交修法补丁**。上一轮已交付并自验过的 `forward_typeid_generic_owner_probe.patch`（§10.25.6）就是本轮的补丁交付物——它先确认读数，再让 owner 落地。

### 10.26.6 未测项（本节）

1. `cfg` 第三点"同名类型已在作用域内定义"在 Cheng parser 里的**精确挂点未定位**；C 链是由符号表承担的，我只核到 `cheng_cold.c:5055` 的文本扫描与 `cold_parser.c:6425` 的注释，**没有**逐行读 `cold_add_implicit_generic_name` 的排他逻辑。
2. **受影响输入的连带范围未实测**：§10.26.3(b) 的表是**从 `typedExprTypeArenaRebaseRow` 的 `-1` 规则与前缀和结构推出**的静态结论，**没有**跑过"2 源、源 0 隐式 + 源 1 显式"的对照件。
3. **收据/快照的哪几层绑定 arena CID 未逐点核**。
4. 隐式参数**是否也产生 `genericSymbolChildCount` 行**（约束/缺省）未核——规范说隐式参数**不带**约束与缺省，故预期为 0，但未验证。
5. **`seqs.cheng` 里是否还有别的形态**（例如隐式 `U`/`K`/`V`）未穷举；只核了 `T`。


## 10.27 聚焦回答：Cheng 侧"作用域排他"的挂点在哪

### 10.27.0 先更正我上一节的一处函数指认

§10.26.5 第 3 步写的 `ParserValueExprAppendGenericSpan`（`parser.cheng:15824`）**是错的**：它追加的是 `explicitGenericSpanStarts/Ends` 与 `tree.genericCount`，属于**另一族列**（显式泛型 span）。
**真正把行写进 `typeGenericSymbol*` 各列的是 `ParserValueExprAppendDeclarationGenericSymbols`（`parser.cheng:17707`）**，它调用 `ParserValueExprSetDeclarationGenericSymbols`（`:9704`）与 `ParserValueExprTypeSyntaxSetGenericSymbols`（`:17675`）完成绑定。§10.26.5 其余各步不受影响。

### 10.27.1 查询函数（C 链"符号表那一半"的对应物）

Cheng parser 里**没有一个**现成的"按名字在当前作用域找类型声明"函数（`grep -nE "^fn ParserValueExpr.*(DeclarationName|FindDeclaration|TypeNameInScope|ResolveTypeName)"` → **空**）。表是**两张、彼此独立**的：

| 表 | 内容 | 入口 |
|---|---|---|
| **词法绑定表**（值/模式绑定） | `lexicalBinding*` 列 | `ParserValueExprLexicalBindingFindVisible`（`:9891`），输入 `(tree, lexicalScopeRow, name, nodeIndex)`；沿 `declarationLexicalScopeParentRows` 上溯，按 `ParserValueExprLexicalBindingHash` 分桶，并用 `ParserValueExprLexicalBindingVisibleAtNode`（`:9850`）做可见性门控 |
| **声明表**（`type`/`fn`/`const`…，**"同名类型"住在这里**） | `declarationKinds`（写点 `:9650`）、`declarationNameTokenIndexes`（写点 `:9652`）、`declarationLexicalScopeRows`、`declarationOwnerRows`、`declarationSpanStarts/Ends` | 写入口是 `ParserValueExprAppendDeclaration`（`:9618`）。**查询要自己拼**：扫 `declarationNameTokenIndexes` 比名字文本 → 按 `declarationKinds == ParserDeclarationType` 过滤 → 沿 `declarationLexicalScopeRows`/`declarationOwnerRows` 走作用域链 |

⇒ **C 链由符号表承担的那一半，在 Cheng 侧等于"`declarationNameTokenIndexes` + `declarationKinds` + 作用域链"的一次手写扫描**，没有单函数可调。

### 10.27.2 在计划落点，这个查询**不可及**（两条独立理由）

**(a) 声明表是"边解析边填"，而本语言允许前向引用 ⇒ 原地扫描会漏掉后文声明。**
`ParserValueExprAppendDeclaration`（`:9618`）是**顺序追加**（`row = tree.declarationCount`），即在解析推进过程中逐条长出来。而本语言**允许前向引用类型声明**——战役自己已定性的合法形：`src/std/net/stream/connection.cheng:36` 用 `Connection[connectionQueueCapacity]`，而该 const 声明在 `:44`（**在 use 之后**），`design/deterministic_model_derivation.md` 明确记其为**合法形**。
⇒ 例程头部那一刻，**后文的 `type T = …` 还没进表**；原地扫描会把它判成"作用域内没有同名类型"，从而**把 `T` 误判为隐式类型参数**。**这是原地实现会静默出错的地方。**

**(b) 三条写路径都是 write-once，写下去就不能改。**
- `ParserValueExprTypeSyntaxSetGenericSymbols`（`:17675`）在 `typeSyntaxGenericSymbolStartAt/CountAt != (-1, 0)` 时 **panic**；
- `ParserValueExprSetDeclarationGenericSymbols`（`:9704`）在 `declarationGenericSymbolStarts != -1` 时 **panic**；
- `typeSyntaxGenericSymbolStarts/Counts` 是**存储列**（结构 `:707-708`，初值 `-1/0` 写于 `:17487-17489`，真正写值在 `:17689-17691`），**不是读时派生**。

⇒ 窗口一旦落定就**无法在后续阶段修正**，所以"先猜着填、后面再纠正"这条路不存在。

**(c) 附带一条结构性事实**：`ParserValueExprAppendDeclarationGenericSymbols`（`:17707`）的入参是**字面 `[` … `]` 的 token 区间**（它校验 `openIndex` 是 `LeftBracket`、`closeIndex` 是 `RightBracket`，还要求二者匹配）⇒ **隐式参数根本没有这个区间，该函数原样不可用**，需要一个"无括号区间"的兄弟函数。

### 10.27.3 应当推到哪个阶段：**整源解析完成之后、lexical/declarations 封印之前**的一次定点补写

**结论**：隐式参数推断**不能**在例程头部的原地做，必须推迟到**该源的全部声明都已进表之后**的一次补写 pass；该 pass 内一次性完成三件事（因为都是 write-once）：追加 `typeGenericSymbol*` 行 → `ParserValueExprTypeSyntaxSetGenericSymbols` 绑到例程的 TypeSyntax 行 → `ParserValueExprSetDeclarationGenericSymbols` 绑到 declaration 行。

**由此产生的顺序约束（四条，按硬度排序）**：

| # | 约束 | 依据 |
|---|---|---|
| 1 | 必须在 **`tree.lexicalBindingAuthoritySealed` 置位之前**跑 | `ParserValueExprAppendDeclaration`（`:9629-9630`）在封印后 **panic**；封印入口见 `ParserValueExprTreeLexicalBindingAuthoritySealed`（`:10151`） |
| 2 | **每条声明的隐式符号必须是一段连续行**，且 `ordinals` 在段内为 `0..<count`（按签名从左到右：**params 先、ret 后**） | `SetDeclarationGenericSymbols`（`:9704`）断言 `ordinals[symbolRow] == symbolOffset`；`SetGenericSymbols`（`:17675`）断言 `symbolStart + symbolCount <= typeGenericSymbolCount` |
| 3 | 补写必须发生在**该 tree 交给 arena 之前**（`typedExprTypeArenaFillTypeSyntax` 读的就是这两列） | 补写在 parser 内完成，只要在 tree 交出去之前跑即满足 |
| 4 | **全局泛型符号行序会与"原地即时追加"不同** | 见下 |

**约束 4 的展开（必须如实报备的副作用）**：推迟到补写 pass，意味着该源的隐式参数行被追加在**所有显式声明符号之后**；而 C 链是在**声明被解析到的位置**就建立绑定的。两者**都是确定的**，但**行序不同** ⇒ 由于 arena 的 `genericSymbol*` 各列与 `typeGenericSymbolStarts/Counts` 都在 `artifactRaw32` 内（§10.26.3），**C 链的行序与补写 pass 的行序会给出不同的哈希**。
**是否有"保持原地行序"的替代？** 试过一条：原地**试探性**追加、补写 pass 再把"其实是作用域内类型"的符号删掉——**不可行**：行是 `ArenaArrayInt32Add` 顺序追加且 CSR 要求连续，`Set*` 又是 write-once，删中间行会破坏 `ordinals`/`symbolStart+count` 两条断言。⇒ **补写 pass 是唯一可行形态，行序差异是它的必然代价**，需要在落地前与 owner 明确取舍（要么接受该差异，要么改 `AppendDeclarationGenericSymbols` 支持"预留空位后回填"——那是更大的改动）。

**验证面**：补写 pass 之后，既有的两个校验器必须仍全绿 —— `ParserValueExprTreeGenericSymbolsStrictValidateInto`（`:16573`）与 `ParserValueExprTreeDeclarationsStrictValidateInto`（`:12944`）。它们是这条 pass 的现成回归网。

### 10.27.4 本节未测项

1. **封印点的确切 setter 调用位置**我只核到 `ParserValueExprTreeLexicalBindingAuthoritySealed`（`:10151`）与 `AppendDeclaration` 的 panic 守卫（`:9629-9630`），**没有**逐条追出"谁在何时置位"，因此"补写 pass 具体插在哪个调用点"仍未定位。
2. **约束 4 的行序差异未实测**（需要一份"同一源、C 链 vs 补写 pass"的 `typeGenericSymbol*` 行序对照）。
3. **`declarationKinds == ParserDeclarationType` 是否就是规范 `:529` 所说的"同名类型"全集**未验证——规范还提到 `const`（本设计 §10.26 的 (A)/(B) 裁决里我按"类型"理解）；`concept`/`trait` 是否也参与排他未核。
4. 本条**只定位挂点，不含实现**；按你的要求，**本轮仍不写 `parser.cheng` 的修法补丁**（自举最上游、爆炸半径最大、我不能编译）。


## 10.28 实现计划补完：补写 pass 的确切插入点、行序落点、排他范围、重复计数

> owner 已裁决：**接受"补写 pass"的行序，不追求与 C 链一致**（C 链是另一个编译器；验收要的是程管线自身的确定性/自洽/可复现）。以下按此裁决补齐。

### 10.28.1 封印 setter 的调用点 → 补写 pass 的**确切插入点**

追出的三个写入点：

| file:line | 内容 |
|---|---|
| `parser.cheng:10382` | `out.lexicalBindingAuthoritySealed = false` —— 新树**初始化** |
| `parser.cheng:12046` | `out.lexicalBindingAuthoritySealed = true` —— **合并/拷贝**路径（`out` 是目标树） |
| **`parser.cheng:28558`** | `tree.lexicalBindingAuthoritySealed = true` —— **单源解析的封印点**，在 `parserValueExprReadTreeFromTextMode`（`:28377`）末尾 |

`parserValueExprReadTreeFromTextMode` 的尾部结构（实读）：
```
    parserForwardingProductionsSeal(tree)                             # :28530
    if !ParserValueExprTreeTokensStrictValidateInto(tree, err) ||      # :28531
       !ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto(…) ||
       !ParserValueExprTreeGenericSymbolsStrictValidateInto(tree, err) ||   # :28532  ← 必须在本 pass 之后
       !ParserValueExprTreeEnumVariantsStrictValidateInto(…) ||
       !ParserValueExprTreeNodeOriginsStrictValidateInto(…) ||
       !ParserValueExprTreeImportOriginsStrictValidateInto(…) ||
       !ParserValueExprTreeDeclarationsStrictValidateInto(tree, err) ||     # :28536
       !ParserValueExprTreeStatementRootsStrictValidateInto(…) ||
       … ||
       !ParserValueExprTreeLexicalBindingsStrictValidateInto(tree, err):    # :28544
        … 封印失败 …
    tree.lexicalBindingAuthoritySealed = true                          # :28558
    tree.structuralValidationPassed = true                             # :28559
```

**⇒ 插入点 = `parserForwardingProductionsSeal(tree)`（`:28530`）之后、最终校验链（`:28531`）之前。**

选它的四条理由（逐条对应约束）：
1. **声明面齐全**：这时该源**全部**声明已进表 ⇒ 规范 `:529` 的前向引用排他**可判**（§10.27.2(a) 的静默错点被消除）。
2. **在校验链之前**：`ParserValueExprTreeGenericSymbolsStrictValidateInto`（`:16573`，调用点 `:28532`）与 `ParserValueExprTreeDeclarationsStrictValidateInto`（`:12944`，调用点 `:28536`）**都会看到补写后的完整状态** ⇒ owner 要求②（两条验证器全绿）是**自动**被覆盖的，不是额外工作。
3. **在封印之前**：早于 `:28558`，满足 `ParserValueExprAppendDeclaration` 的 `lexicalBindingAuthoritySealed` panic 守卫（`:9629-9630`）。
4. **一个点覆盖所有单源读路径**：`ParserValueExprReadTreeFromText`（`:28564`）、`…Reserved`、`…Reserved` 的 migration 变体都经 `parserValueExprReadTreeFromTextMode` ⇒ 逐源驱动的读入口与整林读入口**同时**被覆盖，不存在"另一条路漏了"。

> 未定：`:12046` 那条**合并/拷贝**路径是否也需要同一条 pass。若合并树是"已 parse 的单源树拼起来"的，则单源侧做完即可；若它接受**未封印**的树，则要在 `:12046` 之前再跑一次。**未验证**（见 §10.28.5）。

### 10.28.2 owner 要求①：顺序规则（写死进文档）

隐式参数行的落位规则，**确定且不依赖任何哈希遍历序**：

1. **全局落点**：统一追加在**该源所有显式 `typeGenericSymbol` 行之后**（`parserValueExprReadTreeFromTextMode` 内、`:28530` 之后一次性追加）。
2. **声明间顺序**：按声明在该源 `declarationCount` 中的**行序**（即解析出现序）。
3. **段内顺序**：**params 从左到右 → 然后 ret**（与 C 链同一**序**规则：`cheng_cold.c:5260` 先 `params`、`:5261` 后 `ret`；规范 `:524` "按签名从左到右的首次出现顺序"）。
4. **去重**：同一签名内同名只取**首次出现**（规范 `:524`）；这由规则 3 的"首次出现"语义给出，与遍历序无关。
5. **段连续性**：每条声明的隐式符号必须是一段**连续行**，段内 `ordinals == 0..<count` —— 这是 `SetDeclarationGenericSymbols`（`:9704`）与 `SetGenericSymbols`（`:17675`）两条 panic 断言的要求。

### 10.28.3 未测项②：行序差异**会**落到 `artifactRaw32` / `typeArenaArtifactCid`

按 §10.26.3 的实读列清单直接给结论（不需实测）：

| 面 | 是否受行序影响 | 依据 |
|---|---|---|
| `value.genericSymbolCount` | **是**（总数变） | 哈希头 `arena:826` |
| `value.genericSymbolChildCount` | 否（隐式参数不带约束/缺省 ⇒ 0） | 哈希头 `:827`；规范 `:522-527` |
| 15 个 `genericSymbol*` arena 列 | **是**（**行的内容与行序都变**） | 哈希 `arena:897-932`；预留 `:4232-4269` |
| `genericSymbolIds` | **是** | 哈希 `:936` |
| `typeSyntaxGenericSymbolStarts` / `Counts`（逐 TypeSyntax 行） | **是**（**值是全局 start**，行序变了值就变） | 哈希（r2 时已核对在哈希内）；写点 `parser.cheng:17689-17691` |
| 该源**之后**且自身 `typeGenericSymbolCount > 0` 的源 | **是**（前缀和位移，§10.26.3(b)） | `typedExprTypeArenaRebaseRow` + `genericSymbolBase` 前缀和 |
| 该源**之后**且 `typeGenericSymbolCount == 0` 的源 | 否（每行 start 恒 `-1`） | 同上 |
| **枚举 / schema 形状** | 否（不新增列/成员） | §10.26.3(d) |

⇒ **`artifactRaw32` 与 `typeArenaArtifactCid` 对含隐式泛型的输入会变；对不含该形态的输入逐位不变。** 这与"接受补写行序"的裁决相容——变的是**含该形态的输入**的新基线，不是既有输入的回归。

### 10.28.4 owner 要求③ + 未测项③：重复计数与"同名类型"的范围

**(a) 已显式声明的形参 —— 由"触发条件"排除，不靠作用域扫描。**
规范 `:522`：触发条件是"例程头部**省略 `typeParamList`**"。⇒ **`fn f[T](x: T)` 根本不进入推断**（它有 `typeParamList`）。这是最省、最稳的排除方式，且**与规范逐字一致**。补写 pass 的第一条判据就是"该例程的 `typeParamList` 不存在"——它有现成的事实来源：例程声明行上 `declarationGenericSymbolStarts == -1 && declarationGenericSymbolCounts == 0`（`ParserValueExprAppendDeclaration:9666-9671` 的初值），**不需要额外扫描**。

**(b) 残余的重复计数风险（三条，必须在 pass 内显式处理）**：
1. **同一签名内重复出现**（`fn f(x: T, y: T)`）：必须只建**一个** `T`（规范 `:524` "首次出现顺序"）。
2. **外层声明的泛型形参**（嵌套 `fn`/对象字段里用到外层 `[T]`）：这类 `T` **已在外层绑定**，内层不得再补。判据是作用域链上的既存 `genericSymbol`（`declarationGenericSymbolStarts/Counts` + `ParserValueExprSetDeclarationGenericSymbols` 写的 owner CSR）。
3. **同名类型已在作用域内定义**（规范 `:529`）：这正是 §10.27.2(a) 的静默错点，**必须在补写 pass 里做**（整源声明齐全后）。

**排除逻辑落在 pass 内**（owner 要求③原文），三条判据按此序：① `typeParamList` 不存在 → ② 名字不在**作用域链**上既存的泛型绑定里 → ③ 名字不在**作用域链**上的同名**声明**里。**任一条命中即不补该名。**
**探测器仍在**：若 ①②③ 有漏，`FindGenericSymbol` 的 `duplicate generic declaration` 与 `generic owner identity forged` 两条硬失败会在运行期炸出来（`arena:3401` 附近、`:3417` 附近）—— 那是**网**，不是**门禁**，所以 ①②③ 必须显式写。

**(c) 规范 `:529` 的"同名类型"是否只指 `ParserDeclarationType`？——规范没有枚举，我给保守读法并标注未验证。**
- 规范 `:529` 原文只说"若同名**类型**已在作用域内定义"，**没有列举 declaration kind**。
- 语法上 `conceptDecl`（`:250`）与 `traitDecl`（`:251`）都是**声明形式**并各自带一个 `ident` + 可选 `typeParamList`；`ParserDeclarationKind` 里确有 `ParserDeclarationConcept` / `ParserDeclarationTrait` —— 证据是 **`ParserValueExprSetDeclarationGenericSymbols`（`parser.cheng:9704`）把 `ParserDeclarationType | ParserDeclarationFunction | ParserDeclarationConcept | ParserDeclarationTrait` 并列为合法泛型 owner**。
- ⇒ **保守读法：排除集合应为 `{Type, Concept, Trait}`**（三者都占用类型层的名字空间）。`ParserDeclarationFunction` 是否参与排他（`fn T()` 是否让 `T` 不再是隐式类型参数）**没有依据**，本轮**不纳入**。
- **标注：这一条是读法不是条文**，已列入未测项；落地前应由 owner 按 `docs/cheng-formal-spec.md` 的意图定谳。

### 10.28.5 本节未测项

1. `:12046` 那条**合并/拷贝**路径是否需要同一条 pass，**未验证**（取决于它接不接受未封印的树）。
2. §10.28.4(c) 的排除集合 `{Type, Concept, Trait}` 是**保守读法**，无规范条文直接支持。
3. `declarationGenericSymbolStarts/Counts` 初值（`-1`/`0`）能否**唯一**判定"该例程没有 `typeParamList`"（相对"有 `[T]`"）**未逐例核对**——若某条路径先追加符号再报错回滚，初值可能被写过。
4. **补写 pass 本身仍未实现**（owner 明确要求本轮不写 `parser.cheng` 补丁）。


## 10.29 出补丁前的最后一步核查：**定位到的插入点太晚**，三条约束互斥

被要求出 `parser.cheng` 补丁，我按计划去核"窗口到底绑在哪一行"，结果**推翻了我自己 §10.28.1 的插入点**。**因此本轮仍不出补丁**，理由不是"挂点没找到"，而是"找到了，且证明它太晚"。

### 10.29.1 新事实：泛型窗口是**逐 TypeSyntax 根下拷**的，不是"一行一声明"

`ParserValueExprTypeSyntaxSetGenericSymbols`（`parser.cheng:17675`）的全部 8 个调用点（实读）：

| 调用点 | 绑到哪个根 | 说明 |
|---|---|---|
| `:17905` | `RootGenericConstraint` 根 | 约束表达式 |
| `:17934` | `RootGenericDefault` 根 | 缺省表达式 |
| `:23632` | `RootTypeDeclarationRhs` 根 | `type Box[T] = …` |
| `:23477`、`:23553`、`:25519`、`:25625` | 各 **字段根**（`RootFieldDeclaration`） | **把属主的窗口向下拷到每个字段根**——这正是"字段里用 `T` 能被 root walk 找到"的原因 |
| **`:19119`（在 `ParserValueExprAppendTypeSyntaxRootWithGenericSymbols`，`:19095` 内）** | **刚创建的那个根** | 通用包装 |

而 `:19095` 这个包装的调用点恰好就是**函数签名**：
- `:22683`、`:22710` → **`ParserTypeSyntaxRootFunctionParameter`**（参数类型）
- `:22975`、`:23006` → **`ParserTypeSyntaxRootFunctionReturn`**（返回类型）

⇒ **函数泛型与字段泛型同构：窗口被逐根拷到每个参数/返回的 TypeSyntax 根上**；`T` 的 root walk 落到**参数自己的根行**，靠的是那份**拷贝**。
⇒ **`genericSymbolStart`/`genericSymbolCount` 必须在 `:22683`/`:22975` 被调用之前就已经算好**（`:22683` 的实参就是这两个值）。**这就是窗口的最终绑定时刻。**

### 10.29.2 三条约束互斥 ⇒ 单趟不可实现

| # | 约束 | 坐标 |
|---|---|---|
| i | 窗口必须在**签名 TypeSyntax 根创建时**绑定，**write-once、事后不可改** | `SetGenericSymbols` 在窗口非 `(-1,0)` 时 panic（`:17675`）；调用点 `:22683`/`:22975` 就在签名解析途中 |
| ii | 规范 `:529` 的排他需要**整源声明表齐全**（前向引用合法 ⇒ 后文 `type T` 也要看得见） | §10.27.2(a)，`connection.cheng:36` vs `:44` |
| iii | 行是顺序 `Add` + CSR 连续 + `Set*` write-once ⇒ **事后无法删行/改段** | §10.27.3 已论证 |

**三者不能同时满足**：
- 想在 **(i) 的时刻**做 ⇒ 声明表不齐 ⇒ 违反 **(ii)**（会把前向声明的 `type T` 误判为隐式参数，**静默错**）；
- 想在 **(ii) 齐全之后**做（即我 §10.28.1 的 `:28530` 插入点）⇒ 窗口早已绑定 ⇒ 违反 **(i)**，且 **(iii)** 又堵死了"先绑后删"。

**⇒ 我 §10.28.1 的插入点（`parserForwardingProductionsSeal` 之后、校验链之前）是错的：它保住了 (ii)(iii)，却丢掉了 (i)。**
**⇒ 在单趟解析器里，这条 pass 没有正确插入点。**

### 10.29.3 剩下的三条出路（都需要 owner 决策，都不是我能拍板的）

| 出路 | 内容 | 代价 |
|---|---|---|
| **(A) 前置声明预扫** | 在主体解析之前先扫一遍该源，建"该源声明的全部名字"的最小表，使 (i) 的时刻就能做 (ii) 的排他 | 多一趟扫描；需要与 `AppendDeclaration` 的名字语义（`declarationNameTokenIndexes` + kind）严格对齐；**这是三条里唯一能同时满足 (i)(ii)(iii) 的** |
| **(B) 放开 write-once** | 让 `SetGenericSymbols`/CSR 支持事后纠正 | 动的是 `:17675`/`:9704` 的 panic 契约与"CSR 连续 + ordinals"不变量 ⇒ **改守卫**，需先论证不是放宽 |
| **(C) 明确不实现排他的前向那半** | 承认"同名类型在后文声明时，`T` 会被当成隐式参数" | **规范违反**；必须是**显式记录**的决定，**绝不能是静默行为**。且它是**可观测的**：真出现时 `FindGenericSymbol` 会命中泛型参数、其后 arena 会把该 `T` 当泛型参数类型，而源码意图是那个类型 ⇒ 语义漂移 |

**C 链为何没有这个问题**：`cold_infer_implicit_generic_names` 在 `cheng_cold.c:5260` 被调用时，`symbols` 符号表**已经在手**（`:5260-5261` 的第三个实参就是 `symbols`）⇒ 它走的是 **(A)** 的形态。

### 10.29.4 结论

**本轮仍不出补丁。** 与上一轮拒绝的理由不同：上一轮是"挂点未定位"，这一轮是**挂点已定位、并证明单趟解析器里不存在同时满足三条约束的插入点**。在此前提下写 `parser.cheng` 补丁，最可能的结局是"墙不动"或"参数位能过、返回位不能过"的半通，且发生在自举最上游 —— 这已经不是"没把握"，是"**已知有一处必然错**"。
**建议**：由 owner 在 (A)/(B)/(C) 里裁决。若选 **(A)**，我需要的是"该源声明名字预扫"的落点（`parserValueExprReadTreeFromTextMode` 进入主体解析之前的那一段）——**这条我可以下一轮补完并出补丁**；若选 (B) 或 (C)，请先给契约裁决。

### 10.29.5 本节未测项

1. **(A) 的落点未定位**：`parserValueExprReadTreeFromTextMode`（`:28377`）在主体解析之前的结构我没有读；"预扫"能不能复用既有的一次 token 遍历（例如 `:28531` 校验链里已有的 token 级校验）未核。
2. `:22683`/`:22710`/`:22975`/`:23006` 这四处**是否覆盖全部函数签名路径**（例如 `iterator`/`template`/`macro` 是否共用同一条）**未核** —— 规范 `:522` 的适用范围是 `fn`/`iterator`/`template`/`macro` 四类，若另有路径则 (A) 也要覆盖它。
3. 出路 (C) 的**可观测后果**（语义漂移到什么程度、会不会被下游判词抓住）**未实测**。
4. 上一轮 §10.28.5 的 4 条未测项**仍然有效**（`:12046` 合并路径是否需同一 pass、排除集合 `{Type,Concept,Trait}` 是否取对、`starts/counts` 初值能否唯一判定、pass 未实现）。


## 10.30 (A) 预扫落点：**已定位且干净**；但补丁卡在"结果存哪"这一条上

### 10.30.1 落点：`ParserValueExprLexSource` 之后、主体解析之前 —— 且**复用既有 tokenizer**

`parserValueExprReadTreeFromTextMode`（`parser.cheng:28377`）进入主体解析前的实读结构：
```
    ParserValueExprTreeEnsureActive(tree)                                    # :28383
    … arenaReserveBytes / arenaColumnCensus 预留 …
    tree.producerSourceCount = 1                                             # :28401
    tree.activeDeclarationLexicalScopeRow =
        ParserValueExprAppendDeclarationLexicalScope(…)                      # :28405-28409
    var sourceTextId: int32
    var tokenStart: int32
    var tokenCount: int32
    if !ParserValueExprLexSource(tree, text, sourceTextId, tokenStart, tokenCount, err):   # :28413 ← 分词
        … 失败封印 …
    ParserValueExprSetDeclarationLexicalScopeSpanBytes(…)                    # :28440
    … 主体解析 …
```
⇒ **预扫落点 = `ParserValueExprLexSource`（`:28413`）成功之后、`SetDeclarationLexicalScopeSpanBytes`（`:28440`）与主体解析之前。**
**`ParserValueExprLexSource` 返回时全量 token 已在树里**（`ParserValueExprTokenKindAt/TokenText(tree, i)`，`i ∈ [0, tree.tokenCount)`）⇒ **可直接复用既有分词器，不需要新造扫描器**，满足你的要求。
**⇒ 你担心的"预扫期拿不到 token 区间"这条硬约束不存在。**

### 10.30.2 真正的硬约束：预扫结果**必须能在 `:22683` 被读到** ⇒ 必须挂到 `ParserValueExprTree` 上

预扫在 `:28413` 之后，而排他判据要在**签名解析途中**（`:22683`/`:22710`/`:22975`/`:23006`）被读。两点之间隔着整个主体解析 ⇒ 结果**只能挂在 `ParserValueExprTree` 上**（既有先例：`activeDeclarationLexicalScopeRow`、`activeFunctionDeclarationRow` 等解析期状态就挂在树上）。

于是二选一，**且两条都有未量化的影响面**：

| 存法 | 好处 | 代价 | 我核到的事实 |
|---|---|---|---|
| **(a) 新的 arena 列**（`ArenaArrayInt32`） | 与既有列同构 | **必须动 `ParserValueExprTreeArenaColumnCount: int32 = 201`（`parser.cheng:27140`）⇒ 201→202**，并同步 census 生产者（`:27352`/`:27365`）**与跨文件的 `compiler_csg.cheng:33268`、`:35742`**（census stride） | 三处跨文件耦合已实读确认 |
| **(b) 普通 Cheng 数组字段**（如 `int32[]`/`str[]`，与 `typeSyntaxNameTokenTexts` 同类） | **完全绕开 census**（`ParserValueExprTreeArenaColumnCount` 不动、`compiler_csg.cheng` 不动） | 仍是**结构体形状变化**；它是否进任何 schema/身份面**我没有核到** | `grep -nE "ParserValueExprTreeHash\|TreeArtifactCid\|tree.*SchemaCid\|ParserValueExprTreeSchema" src/core/lang/parser.cheng` → **空**（弱证据：parser 侧没有树形状的哈希/CID 函数；**不等于**下游没有） |

⇒ **(b) 明显更省**（不碰 201 这个 stride、不碰跨文件），但"树结构体形状是否被下游哈希/schema 覆盖"这一条**我只有弱证据（parser 内 grep 为空），没有定论**。

### 10.30.3 为什么本轮**停下不出补丁**（按你的指示）

你说"若在读落点时发现预扫同样撞上某条硬约束（例如预扫期拿不到 token 区间），停下报我，不要硬写"。
- **token 区间那条不存在**（§10.30.1 已证）；
- 但**撞上了另一条同级的**："结果存哪"这一步会决定要不要动 `ParserValueExprTreeArenaColumnCount = 201`（`parser.cheng:27140`）这个**跨文件 census stride**，以及是否触碰树的形状身份面。**这不是我能替 owner 拍板的取舍**（它直接关系到"不许位移身份/CID"这条纪律），且 (b) 那条路的 schema 影响面我**未能定论**。
⇒ 按你的指示**停下报你**，请裁决 (a)/(b)。

### 10.30.4 本轮**未完成**的事项（如实列，不含糊）

1. **未测项②未核**：`:22683`/`:22710`/`:22975`/`:23006` 四处**是否覆盖规范 `:522` 的全部四类例程（`fn`/`iterator`/`template`/`macro`）我没有验证**。若另有签名路径，预扫与补写都要覆盖；**在没有核清之前我不会写"只覆盖 X"这种含糊表述**。
2. **补写 pass 的完整实现仍未写**（本轮的结论是它必须与预扫同批落地，否则预扫是死代码）。
3. §10.28.5 与 §10.29.5 的未测项**全部仍然有效**（`:12046` 合并路径、排除集合 `{Type,Concept,Trait}`、`starts/counts` 初值唯一性、(C) 的可观测后果、`:28377` 主体解析前结构之外的部分）。
4. **(a)/(b) 的取舍未做**（见 §10.30.2）。

### 10.30.5 下一轮的条件

拿到 (a)/(b) 裁决后，我需要的只剩**未测项②**（四类例程的签名路径覆盖）——那一项我可以在下一轮读出并**一次性交付**：预扫（建声明名最小表）+ 排他 + 补写（在四处签名点把窗口按 `params→ret`、首次出现去重、连续成段地绑好），并附你要求的**三项编译级自检**、`apply --check`、正反向逐字节、`diff -u` 多重集、以及"若判断错先在哪条判词暴露"。


## 10.31 (b) 的证明：**成立**（不退回 (a)）；以及未测项②的部分结论

### 10.31.1 证明：普通数组字段**不在任何树形状哈希/schema 覆盖面内**

**命题**：在 `ParserValueExprTree` 上加一个**普通 Cheng 数组字段**（`int32[]`/`str[]`），不会改变 `ParserValueExprTreeArenaColumnCount`（`parser.cheng:27140`，=201）、不会改变 census stride、也不会进任何树形状身份面。

**证明（三条，全部可 grep 复现）**：

1. **parser 模块内不存在树级 hash/CID/serializer**：
```
grep -nE "^fn .*(Hash|Cid|Encode|Serialize|Snapshot).*ParserValueExprTree|^fn ParserValueExprTree.*(Hash|Cid|Encode|Serialize|Snapshot)" src/core/lang/parser.cheng   → 空
grep -rnE "ParserValueExprTree\)" src/core/lang/parser.cheng | grep -iE "hash|field|schema|cid|encode"                                                              → 空
```
⇒ **不存在对整结构体做逐字段遍历的哈希**（第二条 grep 正是针对"整结构体遍历"这一形态）。

2. **唯一的全树枚举是 arena 列普查，且它只枚举 arena 列**：`ParserValueExprTreeArenaColumnCensusInto` 的**每一行都是** `arenamod.ArenaArrayInt32Len(tree.arena, tree.<column>)`（实读 `:27260` 起的大段），形状断言是 `out.len - censusStart == ParserValueExprTreeArenaColumnCount`（`:27352`）。它**是长度普查（供 pass-1 reserve 用），不是哈希**；消费侧是 `ParserValueExprTreeArenaColumnCensusApply`（`:27358` 起，同样逐列 `ArenaArrayInt32ReserveEmpty`）。
⇒ **普通数组字段不是 arena 列 ⇒ 不被 `ArenaArrayInt32Len(tree.arena, …)` 枚举 ⇒ 201 与三处 stride（`compiler_csg.cheng:33268`/`:35742`）全都不动。**

3. **"普通数组字段挂在树上"是既有类别，不是新类别**：同结构体内已有一大批，例如
   `parser.cheng:1012 slots: int32[]`、`:1018 exprNext: int32[]`、`:1077-1084 lineScopeIds / lineInlineSuiteBodyColumns / lineInlineSuiteScopeIds / lineDeferOwnerOrdinals / lineInlineDeferBodyColumns / lineInlineDeferSuiteScopeIds / lineSeedStarts / lineSeedCounts`、`:1095-1096 sourceScopeIds / sourceStatementOrdinals`。
   它们既在树上、又都不在普查里。
   > 更正一处口径：`typeSyntaxNameTokenTexts` 的同名命中在 `typed_expr_type_arena.cheng:252/517/6848/9325/10813`，那是**TypeArena 自己的** `str[]` 字段，**不是** parser 树上的字段；所以它**不能**当作"树上先例"。**结论不变**——先例由上面第 3 条的 11 个字段给出，是实读的。

**⇒ (b) 成立，不退回 (a)。** 你设的门槛（"证不出来就退回 (a)"）已过，且证据不是弱证据：三条都是 grep 可复现的结构性事实。

### 10.31.2 未测项②：**部分结论 + 明确未核清的部分**

**已核清的**：
```
sed -n '438,447p' src/core/lang/parser.cheng
    ParserDeclarationKind = enum
        ParserDeclarationInvalid / Module / Type / Function / Field /
        Parameter / Local / Concept / Trait          ← 共 9 个成员
```
**⇒ 枚举里没有 `Iterator` / `Template` / `Macro`。** 规范 `:522` 的适用范围是 `fn`/`iterator`/`template`/`macro` 四类，而 parser 的声明种类只有 `Function` 一个"例程"槽位。

三个关键字**在别处被识别到**（`:14544` `macro`、`:14562` `template`、`:14564` `iterator`；另 `:31562` 对 `iterator` 做了行级判定），但**我未能确定它们是否汇入同一条例程签名路径**（即是否落到 `:22683`/`:22710`/`:22975`/`:23006`），因此**无法判定**"四处签名路径是否覆盖四类例程"。

**⇒ 按你的规则，我不会在交付里写"全覆盖"，也不会写"只覆盖 X"——因为这两句我现在都写不真。**

### 10.31.3 本轮的实际交付与未交付

| 项 | 状态 |
|---|---|
| (b) 的证明 | ✅ **完成**（§10.31.1，三条 grep 可复现） |
| 未测项②（四类例程覆盖） | ⚠️ **部分**：`ParserDeclarationKind` 无三类成员已证；**是否汇入同一签名路径未核清** |
| 预扫（`:28413` 之后落点） | 📄 落点已定位（§10.30.1），**代码未写** |
| `spec:529` 排他、补写（签名点绑窗口） | ❌ **代码未写** |
| 一次性补丁 | ❌ **未交付** |

**未交付的理由（直说）**：你这一轮的交付要求里，"覆盖范围"是**强制项**且给了二选一的表述义务（全覆盖，或逐字写明哪一类不覆盖）。这一项**现在无法写实**；而在一个**自举最上游**的文件里，同时新加树字段 + 预扫 + 三段排他 + 四处签名点窗口绑定，是**六个以上写入点**的改动，我必须先把覆盖那一条核清，否则补丁里必然要写一句我不确定的话——那正是本战役红线（不许含糊、不许静默）。
**⇒ 我没有硬写。**

### 10.31.4 下一轮的最小充分条件

只剩**一件**：核清 `iterator`/`template`/`macro` 是否汇入例程签名路径（`:14544-14564` 这三个识别点是入口，往下追到签名解析即可）。核清后，上一轮列的 2/3/4 项我按你要求**同批一次性交付**，含三项编译级自检、`apply --check`（基线=当前树）、正反向逐字节、`diff -u` 多重集、两条 StrictValidate 全绿、"若判断错先在哪条判词暴露"、未测项。

### 10.31.5 未测项

1. **`iterator`/`template`/`macro` 的签名路径未追**（本轮唯一挡在补丁前面的未测项）。
2. §10.30.4 / §10.29.5 / §10.28.5 的未测项**全部仍然有效**。
3. `:12046` 合并/拷贝路径是否需要同一条 pass —— 仍有效。


## 10.32 你点的两个必核项：一项已答，一项**未建立**（因此本轮仍未出补丁）

### 10.32.1 必核项 1：`var x: int32` 是否规范保证零初始化 —— **是（由 `:594` 蕴含），显式清零作为加固写进方案**

- 规范里**没有**一条独立成文的"标量 `var x: int32` 零初始化"条款。逐字核到的相关条文是：
  - `:589`「复合类型（`tuple/object/T[]/T[N]/Table/...` 等）-> 先按该类型的零值（zero-init）递归初始化；其中 `T[]/T[N]` 的零值为"空序列"」
  - `:264`「初始化顺序固定为 base 零值/默认字段、派生本地字段默认值、显式构造实参覆盖」
  - **`:594`「与隐式默认值一致的显式初始化是编译期硬错误：带类型标注的 `let/var` 禁止写 `= false` / `= 0` / `= ""` / `= []` / `= T()`」** ← **这一条蕴含标量的隐式默认就是零值**（否则禁止 `= 0` 没有意义）
- ⇒ **`parser.cheng:22914 var genericSymbolCount: int32` 依赖零初始化是符合规范的**，不是既存 bug。
- **但**：既然这一处本来就要动，补丁里**显式写 `var genericSymbolCount: int32 = 0`**（你已同意"顺手显式清零"）。理由是零成本地消除一处"依赖隐式默认"的脆弱点，**不是**因为规范不保证；补丁注释里会写明这一点。

### 10.32.2 必核项 2：`:12060` 的 arena 容量预留是不是"parse 前的静态上界" —— **不是；且它相对 parse 的时机我没有建立**

实读 `parser.cheng:12055-12066`：
```
    let scalarBytes = Int64(tree.nodeCount) * Int64(31 * 4) +
                      Int64(tree.genericCount) * Int64(2 * 4) +
                      Int64(tree.rootCount + tree.callEventCount) * Int64(4) +
                      Int64(tree.statementRootCount) * Int64(9 * 4) +
                      Int64(tree.regionCount) * Int64(5 * 4) +
                      Int64(tree.typeSyntaxCount) * Int64(20 * 4) +
                      …
                      Int64(tree.typeGenericSymbolCount) * Int64(12 * 4) +     ← 我们这一项
                      …
                      Int64(tree.declarationCount) * Int64(18 * 4) + …
```
**事实**：这个和式的**每一项都是"已解析计数"**（`nodeCount`/`typeSyntaxCount`/`typeGenericSymbolCount`/`declarationCount`…），**不是**由源文本长度之类推出的**静态上界**。
**⇒ 它不是"全部源码 parse 之前按静态上界算"的那种承诺**；它是一个**在某一时刻按当时计数**算出来的 sizes。
**⇒ 你的警告成立一半**：如果这段 sizing 在 **prescan 让 `typeGenericSymbolCount` 增长之前**跑，它就会**少算**该源隐式泛型符号的那部分（每符号 `12*4 = 48 B`），正是 `pinned capacity overrun` 同族。
**我没有建立的部分**：这段代码**相对 parse 的时机**（它在 `:12046`（`out.lexicalBindingAuthoritySealed = true`，合并/拷贝路径）附近，看起来是**拷贝/合并目标树**的尺寸估算，而不是单源 parse 期的预留），因此**无法判定它会不会被 prescan 的增长打破**。**这一条我没有替你猜。**

### 10.32.3 本轮结论

- 你给的架构结论（四关键字共用 `ParserValueExprProcessRoutineRange`（`:22839`），`:22936` 一次 Set 前插入即可一处覆盖参数根与两个返回根，文件面只有 `parser.cheng`）**我采信**，与我的读码一致。
- 两个真障碍（`:17707` 无括号例程没有 primitive；`:9704` write-once + 一次 Set 一段连续区）**我采信**；你把顺序约束（先显式括号段追加 → 隐式紧接追加 → 只调一次 Set，count = 显式 + 隐式）说清了，与我 §10.28.2 的五条一致。
- **但必核项 2 未建立** ⇒ 按你"先确认…否则就是 `pinned capacity overrun` 同类"的要求，**本轮仍不出补丁**。

### 10.32.4 下一轮的最小充分条件（只剩一项）

核清 `parser.cheng:12055-12066` 这段 sizing **相对 parse 的调用时机**：
- 若它在**所有源 parse 完成之后**（例如只为合并/拷贝目标树定尺寸）⇒ 它看到的是含隐式符号的最终计数，**不冲突**，可以直接写补丁；
- 若它在**parse 期间/之前**跑 ⇒ 必须让 prescan 的增长**先于**它，或把它改成"预留 + 增长时按既有 pinned 校验"，**不许静默超发**。

两项必核里第 1 项已答；补丁的其余部分（无括号 primitive、prescan 落点 `:22936`、排除序、硬失败形）**方案已完整**，只等这一项。

### 10.32.5 未测项

1. **`:12055-12066` sizing 的调用时机未建立**（本轮唯一挡在补丁前面的）。
2. 你要求的"prescan 覆盖不到的形（返回类型区间 token 越界、嵌套括号里的 `T`）必须 hard-fail 而非静默跳过"——**已记入方案**，但**具体判词与坐标未设计**（要等落点定稿）。
3. §10.31.5 / §10.30.4 / §10.29.5 / §10.28.5 的未测项**全部仍然有效**。


## 10.33 必核项 2 定谳（owner 查证）：**不是同族风险**；以及补丁的两条新增约束 + 三条 hard-fail 判词

### 10.33.1 owner 的定谳（采信，我无法反驳）

| # | 事实 | 结论 |
|---|---|---|
| 1 | `:12049 ParserValueExprTreeLogicalBytes(tree: ParserValueExprTree)` 是**只读计量函数**（`@borrows`，形参**不是 `var`**），**唯一调用点** `compiler_csg.cheng:9648`，在 `CompilerCsgExprLayerSequenceBytes`（`:9616`）内，对**已建好**的 `layer.valueExprTree` 做物理释放回执计量（`:9644-9648` 还有 `valueExprTreeBorrowLease` 分支，租约层根本不计量） | 它**既不在 parse 前也不在 parse 中**，永远看到最终计数 ⇒ **不存在"少算隐式符号导致超发"的路径** |
| 2 | 它算的是**逻辑字节回执，不是容量承诺**；`typeGenericSymbolCount * 12*4` = 48 B/符号正是这些列的真实宽度 | 加隐式符号后回执**只是变准确** ⇒ **任何地方都不要去补偿它**（尤其不许改系数或加偏移 —— 那是造假回执） |
| 3 | 这些列全走 `arenamod.ArenaArrayInt32Add`（`arena.cheng:373`，capacity 0→8 后翻倍**动态增长**），**不是** `ArenaArrayInt32AddReserved`（`:336-351`，只有它会 panic `reserved capacity exhausted`）。`grep -c ArenaArrayInt32AddReserved src/core/lang/parser.cheng` = **0**（`:17840-17890` 的十几个 generic 列全是 grow 版） | parser 树 arena 对这些列**没有 parse 前的静态预留** ⇒ **prescan 中途增长安全** |

**⇒ §10.32.2 我提的那半风险不成立；最小充分条件已满足。** 我在 §10.32.2 只建立了"它是已解析计数派生、不是静态上界"，**没有**继续去查它的唯一调用点与它是否读-only —— 这一步是 owner 补上的，结论我采信。

### 10.33.2 补丁的两条新增约束（写进方案）

1. **新 primitive 必须走 grow 版 `ArenaArrayInt32Add`**（`arena.cheng:373`）；**任何 `ArenaArrayInt32AddReserved` 都不许出现** —— `parser.cheng` 现在是 **0 处**，保持 **0**。这既是与 `:17840-17890` 既有泛型列同构，也是"不做 parse 前静态预留"这一事实的直接后果。
2. **不许为隐式符号去补偿 `ParserValueExprTreeLogicalBytes`**（不改系数、不加偏移）：它是**回执**不是**预算**，补偿即造假回执。

### 10.33.3 三条 hard-fail 判词（本轮给出，不推迟）

按你要求"覆盖不到的形一律 hard-fail 而非静默跳过"，逐条给判词。坐标口径沿用本仓既有判词风格（坐标内联在 `Fmt` 里），`{...}` 为变量位：

| # | 覆盖不到的形 | 判词（前缀统一 ` parser value expr: `） | 坐标 |
|---|---|---|---|
| 1 | **返回类型区间 token 越界**（`closeIndex+1 .. tokenLimit` 越出 `tree.tokenCount`，或 `tokenLimit <= closeIndex+1`） | ` implicit generic: routine return type range invalid name_token={routineNameToken} open={openIndex} close={closeIndex} limit={tokenLimit} tokens={tree.tokenCount}` | 5 |
| 2 | **嵌套括号里的 `T`**（参数/返回类型区间内出现括号深度 >0 的单字母大写标识符 —— 隐式推断只承认**签名表层**的形参位，不递归进 `[...]`/`(...)` 内层） | ` implicit generic: nested generic parameter is not admitted name_token={nameToken} routine_name_token={routineNameToken} depth={parenDepth} offset={nameToken}` | 4 |
| 3 | **被约束/默认值引用的未声明名字**（`[T: C]`/`[T = D]` 里 `C`/`D` 既非显式形参、也不在作用域声明名表内） | ` implicit generic: unnamed constraint or default reference name_token={referenceToken} routine_name_token={routineNameToken} generic_name_token={genericNameToken}` | 3 |

**三条的共同点**（也是它们的正确性依据）：都是**在 prescan 期就能判定的静态事实**，所以它们**不需要新的运行期状态**，也不会与 `:9704` 的 write-once 或 `:17675` 的 `(-1,0)` 前置条件冲突 —— **在追加任何符号行之前先判、先 fail**，失败路径上 `typeGenericSymbolCount` 与所有 CSR 保持未动。

### 10.33.4 本轮状态（如实）

| 项 | 状态 |
|---|---|
| 必核项 1 / 必核项 2 | ✅ 均已定谳（`:594` 蕴含零初始化；逻辑字节函数与 prescan 不冲突） |
| 三条 hard-fail 判词 | ✅ **已给出**（§10.33.3） |
| 补丁的两条新增约束 | ✅ **已记录**（§10.33.2） |
| **`parser.cheng` 补丁本体** | ❌ **本轮未交付** |

**未交付的理由（直说，不绕）**：这版补丁是**六个以上写入点**的自举最上游改动 —— 新 primitive（`:17707` 同族，无括号入口）+ `ParserValueExprTree` 新字段 + `:28413` 之后的声明名预扫 + `:22936` 之前的三段排除 + 四处签名点窗口绑定 + 三条 hard-fail —— 而我已无余量把它写到本战役要求的自检标准（三项编译级自检、`apply --check`、正反向逐字节、`diff -u` 多重集、两条 StrictValidate 全绿）。
**在这种状态下硬写，等于交一个我自己都没走完自检流程的补丁进自举最上游** —— 那比不交更贵。**所以我把状态、判词、约束、落点全部固化进本设计文档，让下一轮能一次落地。**

### 10.34 落地结果与对 §10.33.3 的**源码修正**（2026-09-12 02:1x，owner 裁定）

**补丁已交付**：`patches/implicit_generic_signature_window.patch`（冻结副本 `.rebuild/s1b_step3/r9/patchgen/implicit_generic.frozen.patch`，两件逐字节同），sha256 `aec59e4adee765eb5b88d58d99b5559d4737b3a1e505bd85cbab03d173a3218a`，`git apply --check` exit 0（基线=当前工作树）。实现者为**新一手**，落点与原方案一致：新增无括号 primitive（按 token 列表追加一段连续 `typeGenericSymbol*` 行，12 列全走 grow 版 `ArenaArrayInt32Add`）、`assignIndex/whereIndex/returnTypeLimit` 上移到窗口之前、`var genericSymbolCount: int32 = 0` 加固、**唯一一次** `SetDeclarationGenericSymbols`；`ArenaArrayInt32AddReserved` 与 `ParserValueExprTreeLogicalBytes` 均零改动。

**对 §10.33.3 的修正（按"源码为准"裁定，不按文档字面实现）**：

| # | 文档原文 | 裁定 | 依据 |
|---|---|---|---|
| 1 | token 越界判 `tokenLimit <= closeIndex+1` | **改为 `< start`** | `:22998` 才建返回根 ⇒ `tokenLimit == closeIndex+1` 是"无返回类型"的**合法形**（`fn f(x: int32) = x`），照字面会把合法源全判死 |
| 2 | **嵌套括号里的 `T` 一律 hard-fail（depth>0）** | **不实现** | 全仓**51 处 / 20 种形状**的合法隐式泛型就写在括号里：`std/sequninit.cheng:15 SeqUninit[T]`、`:30 Result[T]`、`std/sync.cheng:38 Arc[T]`、`:66 Mutex[T]`、`:152 Atomic[T]`、`std/tables.cheng:113 Table[V]`、`std/system.cheng:2723 typedesc[T]→T`、`:2817 set[T]`、`core/option.cheng:6 Option[T]` 等。C 链参照本身是**纯文本扫描、无深度规则**（`bootstrap/cheng_cold.c:5055`、`:5260-5261`）。⇒ 正确规则是 **depth 取"标识符所在处"**：`T[]` / `var T[]` / `T[4]` 的 `T` 在括号**之前**(depth 0)，`Box[T]` 的 `T` 在括号**之内**(≥1)，**两者都收** |
| 3 | 被约束/默认值引用的未声明名字 hard-fail | **不实现，建议落权威层** | 签名期**没有**"作用域声明名表"（本源后文声明的类型、以及 **import 进来的类型**都不在表内；import 由 arena 合并后才解析），照字面会误杀 `[T: ImportedThing]`；`[T: int32]` 还需内建标量名表（仓内实有 `type Box[T: int32 = int32]`，`src/tests/typed_expr_type_arena_smoke.cheng:689`）。同语义判词权威层已给且信息更全（`typed_expr_type_arena.cheng:3446 nominal declaration is not visible`） |

**第二条的实证价值**：这条修正本身说明 §10.33.3 是在**未扫全仓合法用例**的前提下写的 —— 一条 hard-fail 若照字面实现，会把 `src/std` 直接判死，**比不修更糟**。凡"未覆盖形一律 hard-fail"的规则，落地前必须先扫全仓正例计数，计数非零就是规则错、不是源码错。

**本轮暴露的第二个未覆盖写入点（本补丁修不到，已另裁）**：局部绑定注解根在 `parser.cheng:24053` 用**无泛型窗口**的 `ParserValueExprAppendTypeSyntaxRoot` 创建，且把**局部变量名**同时传作 `declarationOwnerToken`。而 `typed_expr_type_arena.cheng:3310-3335` 的 `FindGenericSymbol` 先读根自己的窗口（`genericCount == 0` ⇒ 直接 `return -1`），再要求窗口内每行的 owner token **等于该根的 owner token**，不等即 `generic owner identity forged`。⇒ 只补签名段会让这类根从"not visible"变成 **"identity forged"（更糟）**。全仓 **61 处 / 15 文件**：`src/std/seqs.cheng:320`、`:330`、`:343`、`src/std/result.cheng:52`、`src/std/sync.cheng:39`、`src/std/tables.cheng:94`、`src/std/system.cheng:2725`、`src/core/option.cheng:9`、`src/std/sequninit.cheng:16`、`src/std/hashmaps.cheng:196`、`src/std/driver_safe.cheng:94` 等；`src/std/seqs.cheng` **确认在森林内**（r9z 列表 `bytes=13214`）。修法走"先用例程窗口 + 例程名 token"的 parser 侧路线，但**前置条件是穷举该身份列的消费者**（parser 侧 13 处 + typed 侧 10 处）确认无人依赖"该 token = 局部变量名"，见 owner 裁决。


# 第三部分 · 234 源门内 `name=Result` 定性（`kd_r27`）

> 结论先行：**这不是我设计的那套前向解析机制的未覆盖形态，也不是回归；它是「另一个域」——不是"声明未物化"，而是"名字从 src=13 根本不可达"。** 与已修的隐式泛型两件（签名窗口 / 局部注解窗口）**也不同根**。

## 11.1 判词点与完整判据链

**产生点**：`src/core/lang/typed_expr_type_arena.cheng:4991`
```
        err = Fmt" typed expr type arena: nominal declaration is not visible producer_source={producerSourceIndex} name={name}"
```
（孪生站点在 `:3612`，树版，供全林路径；逐源驱动走的是 **`:4991` 索引版**。）

**完整判据链**（从驱动到判词）：
1. `compiler_csg.cheng` 逐源驱动 → `TypedExprTypeResolutionAuthorityAppendSourceInto`（`typed_expr_type_arena.cheng:4867`）的 nominal 分支；
2. `:4950` 附近跳过 qualified 段；`:4963` 用 `typedExprTypeArenaScalarKind(name)` 过滤内建标量（含 `ptr`）；
3. `:4978` `typedExprTypeAuthorityFindGenericSymbolSourceInto(tree, rootRow, …)` —— **泛型参数**查找（`genericCount == 0` 直接 `-1`）；
4. `:4991` 之前的调用：`typedExprTypeAuthorityIndexResolveUnqualifiedInto`，其判据是**两段析取**：
   - `:4728` **本源**查找：`typedExprTypeAuthorityIndexFindDeclaration(index, sortedEntryRows, producerSourceIndex, name)`；
   - `:4733-4762` **导入边回退**：只遍历 `imports.ownerSourceIndexes[importRow] == producerSourceIndex` **且** `imports.allowsUnqualified[importRow]` 的边，对每条边的 `targetSourceIndexes[importRow]` 再查索引；命中后还要过 `DeclarationExportedInto` 与"多命中即歧义"两条；
5. 两段都 `matchedRoot < 0` ⇒ `:4991` 判词。

**与我当年那套机制的关系**：
- 我设计并落地的 r3 覆盖的是 **arena intern 相**：`ResolveNominal`（`typeSyntaxTypeIds[声明根]` 未物化）与泛型窗口读点。它**不碰 authority 相**。
- 本案死在 **authority 相**，而 authority 相用的是 **pass-0 就已 seal 的全局声明索引**（`index`）——**那份索引本来就是完整的**，所以"前向引用"在这里**本来就能查到**（只要有一条可达的 import 边）。
- ⇒ 本案失败的原因**不是"声明在后面的源"**，而是**没有任何 import 边把 `Result` 带进 src=13**。这是**可见性/导入域**，不是**物化域**。

## 11.2 两个源的身份与前后关系

**src=13 的钉死**（用本战役"字节数全仓唯一"手段）：
```
grep -o "forest src=13 bytes=[0-9]*" .rebuild/s1b_step3/gate/r27_raised.stderr.txt
  → forest src=13 bytes=11234
find src -name '*.cheng' -size 11234c
  → src/core/backend/codegen_a64_body_units.cheng          （唯一命中，wc -c 复核 = 11234）
```

**`Result` 的声明**：`src/std/result.cheng:11` → `    Result[T] =`（在 `type` 块内，object 形态：`ok: bool / value: T / err: ErrorInfo`）。

**声明源在森林里的位置**：
```
wc -c src/std/result.cheng  → 2730
grep -o "forest src=[0-9]* bytes=2730" …/r27_raised.stderr.txt
  → forest src=225 bytes=2730
```
⇒ **`Result` 的声明源是 index 225，排在 src=13 之后**（顺序不是按模块路径字典序，`std/result` 排在很后面；这与我此前基于模块路径的推测**不符**，以本读数为准）。

**但真正致命的是这一条**：
```
grep -n "^import" src/core/backend/codegen_a64_body_units.cheng
  21: import cheng/core/ir/core_types as coreir
  22: import cheng/core/backend/aarch64_encode as a64
  23: import cheng/core/backend/codegen_a64_fill_units as a64fill
```
**src=13 只有 3 条 import，全部是 `as` 限定名，没有 `std/result`**；而它自 `:44` 起大量使用 **unqualified** `Result[int32]`（`:44 :59 :62 :68 :71 :74 :80 :107 …`）。
被 import 的三个模块里，`aarch64_encode.cheng` 与 `codegen_a64_fill_units.cheng` **各自 `import std/result`**，但那是**它们的**边（`ownerSourceIndex` 指向它们自己），**不是 src=13 的边**；而 `:4733-4742` 的回退**只认 owner 等于本源且 `allowsUnqualified` 的边**，**不做传递**，`as` 别名边 `allowsUnqualified == false`。
⇒ **`Result` 从 src=13 不可达**，与"声明在 225"这件事**叠加**，才共同构成这次失败。

## 11.3 `root_generic_count=0` 的解释：**正常读数，与本案无关**

探针打印的 `root_generic_count` 是：把失败的 nominal 沿 `localParents` **走到顶行**（`root_row=6`）后，**该行自己的** `ParserValueExprTypeSyntaxGenericSymbolCountAt`。
- `root_row=6` 是**使用点所在那个类型表达式的根**（`Result[int32]` 的根），**不是** `result.cheng:11` 的声明根；
- 使用点本身**不是泛型容器**，它的根自然**不携带泛型窗口** ⇒ `genericCount == 0` **完全正常**；
- `source_generic_symbols=0` 同理：**src=13 本身不声明任何泛型**（它只是*使用*别人的泛型）。

⇒ **这两个读数不能用来推断 `Result[T]` 的泛型性**，也不能说明"窗口机制坏了"。我当初加这两个字段是为了**隐式泛型**场景（判断"名字是不是本源某容器的形参、而 root walk 没走到"），**本案的 `Result` 是跨源名义 + 无导入边**，与该探针的设计用途不同域。**两个写入点（签名窗口 / 局部注解窗口）在本案里都没有参与**。

## 11.4 判定：**(b) 另一个域**；且与隐式泛型两件**不同根**

| 判据 | 本案 |
|---|---|
| 是我的机制的**未覆盖形态**吗 | **否**。我的机制只管 arena intern 相；authority 相从来是"索引直查 + 导入边回退"，不缺物化能力 |
| 是**回归**吗 | **否**。失败点在 `AppendSourceInto`，r3 与两个窗口补丁都没有触碰 authority 相 |
| 是**另一个域**吗 | **是**。**可见性/导入域**：名字没有可达路径，而不是"声明未建/未物化" |
| 与**隐式泛型两件**同根吗 | **不同根**。那两件是"隐式参数没有 `genericSymbol` 行"；本案是"跨源名义没有 import 边" |

**逻辑上，"前向"在本案里是**伴随**条件而非**根因**：`Result` 的声明在 225（13 之后）**且** src=13 无导入边。若 src=13 有一条 unqualified 的 `import std/result`，pass-0 的完整索引**当场就能查到 225**，不会报这句 —— 这也正是"authority 相不惧前向"的证据。

## 11.5 修法：方向取决于**一条未测读数**（静态不可判）

两条候选，**分界读数只差一条**：

| 候选 | 内容 | 前提 |
|---|---|---|
| **(A) 源侧** | 给 `src/core/backend/codegen_a64_body_units.cheng` 补 `import std/result`（零管道改动、零身份位移） | 成立当且仅当"该文件本就该显式导入" |
| **(B) 管道侧** | 若本仓约定"类型名跨模块全局可见"，则 `:4733-4742` 的导入边回退需扩到按名字全局查索引 | 成立当且仅当 C 链就是扁平命名空间 |

**需要的那条读数（打什么、打在哪、怎么判读）**：
1. **C 链是否编译 `src/core/backend/codegen_a64_body_units.cheng`** —— 该文件头部自述是"B6 aarch64 body 单元直调门面"，属**本战役迁移期新建的门面件**；若 C 链的编译集里**没有**它，则"缺 import"从未被抓过 ⇒ 判 **(A)**，且这是**新文件的漏写**，不是管道缺口。
2. **C 链的类型名解析是否扁平**（不分模块可见性）——`bootstrap/cheng_cold.c` 用的是扁平 `symbols` 符号表（本次已多次引用）。若它按名字全局解析类型 ⇒ 判 **(B)**，即程管线的**导入可见性**比 C 链**更严**，是**能力缺口**。
- **判读方法**：对同一份源，C 链与程管线各跑一次；若 C 链过而程管线报本案判词 ⇒ 查该文件是否在 C 链编译集内。**在此之前我不写补丁** —— 两条修法方向相反（改源 vs 改管道），选错就是"用改源绕开管道缺口"或"放宽可见性守卫"，两条都触纪律。

## 11.6 未测项

1. **C 链是否编译 `codegen_a64_body_units.cheng`** —— 未验证（决定 (A)/(B)）。
2. **C 链类型解析是否扁平命名空间** —— 未验证（决定 (A)/(B)）。
3. 该文件的 3 条 `as` 限定 import 是否**本应重导出** `Result`（语言是否支持 re-export 未核）。
4. **该文件是否还有别的未导入名**（只核了 `Result` 一处；若普遍如此，更偏向 (B)）。
5. 我此前"`orderedSources` 近似按模块路径排序"的推测被本读数**证伪**（`std/result` = 225，远在 `core/backend/*` = 13 之后）—— **以 `forest src=N bytes=` 实测映射为准**，此前基于路径序的旁证请勿再引用。


### 11.6.1 未测项 4 的快速旁证（原始读数，含口径警告）

命令：
```
for f in $(grep -rlw Result src/core --include=*.cheng | head -60); do
    grep -q "^import std/result" $f || echo $f; done | head -12
```
命中（用到 `Result` 但没有 `import std/result`）：
`src/core/tooling/mobile_shell_codegen.cheng`、`src/core/ir/core_types.cheng`、`src/core/ir/low_uir.cheng`、
`src/core/ir/alias_licm_gvn.cheng`、`src/core/csg_core/compiler_snapshot_schema.cheng`、
`src/core/runtime/core_runtime_provider_darwin.cheng`、`src/core/runtime/core_runtime_provider_linux.cheng`、
`src/core/runtime/web_scene_runtime.cheng` …

**口径警告（务必先收窄再采信）**：`grep -rlw Result` 匹配的是**词边界上的 `Result`**，会把**注释、字符串、以及别的命名**一起算进来；上表**不能**直接当作"用到 `Result` 类型却没有导入"的证据。**要收窄成"代码位的 `Result[` 或 `: Result` 且未导入"再统计**（这才是未测项 4 的正确做法）。
**但它给出的方向有意义**：若收窄后仍有多个文件成立，则 **(B)（C 链扁平命名空间 / 程管线可见性更严）** 的可能性显著上升，而 (A)（补 import）就退化成"逐个文件补"，方向性存疑。


## 11.7 「用了但没导入」系统性普查：**做了两版，两版都不能用**（如实报，未出补丁）

按裁定 (A)（修源、不动管道）执行普查。**结论：普查跑通了，但它在唯一一个已知真阳性上出现假阴性 ⇒ 不可信 ⇒ 我没有据此生成任何补丁。**

### 11.7.1 第一版：全 `src/` 无收窄 —— 噪声压倒信号

```
FILES_SCANNED 5651
FINDINGS 649   AMBIGUOUS 1016
```
抽样即见假阳性：`src/apps/rsi/main.cheng` 报 `Fmt`（内建，无提供者）。**口径太宽**（未限定森林、未排除内建、`NAME[` 模式吃进表达式与注解）。**废弃。**

### 11.7.2 第二版：限定 234 源森林 + 内建排除 —— 列表很短，但**漏掉已知真阳性**

```
CLOSURE_RESOLVED 214 / 234   (ambiguous-size slots: 20)
SINGLE_PROVIDER 3   NO_PROVIDER 6   AMBIGUOUS 3
```
可执行清单（3 条）：
```
src/core/backend/codegen_contract.cheng   Err     [935, 1688, 1692]  -> src/std/result.cheng
src/core/lang/typed_expr.cheng            Value   [20185, 22750, 23626] -> src/std/result.cheng
src/std/cmdline.cheng                     Int64   [316]              -> src/std/system.cheng
```
**但 §11.2 的已知真阳性 —— `src/core/backend/codegen_a64_body_units.cheng` 用 `Result[int32]` 却无 `import std/result` —— 一条都没报出来。**

### 11.7.3 我自查出的两个过程性错误（都已定位，第二个未修完）

1. **我在第二版里把 `Result`/`Ok`/`Err`/`Some`/`None` 放进了 `BUILTINS` 排除集** —— 这等于**先把已知问题排除掉再统计**。已用 `sed` 修掉（现存 `"Fmt", "True", "False", "T", "U", "K", "V"`），重跑后清单从 2 条变 3 条，但**目标文件仍未出现** ⇒ 还有第二个原因。
2. **第二个原因未定位**：已证实 `codegen_a64_body_units.cheng`（11234 B）**确实在 214 个已解析闭包文件里**（`slot for that size: [13]`、`target in resolved: True`），所以不是"没扫到"。剩下三个嫌疑（**均未验证**）：
   - `collect_declared` 的**缩进块条目**正则 `^\s+([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s*[:=]` 过宽，把 `Result` 误收进"本源已声明"；
   - **泛型形参扫描** `\[([^\]]*)\]` 把 `Result[int32]` 的括号内容当声明（本身应无害，但与其他规则叠加可能误伤）；
   - 该文件在森林里的实际解析文本与磁盘文本不同（例如迁移源语法改写），导致行级扫描落空。
   **我没有时间把这三条逐一排掉，所以我不宣称清单是完备的。**

### 11.7.4 一条可复用的副产物：**字节数只能解析 214/234**

```
unresolved slots: 20
  src=15  bytes=1152    -> ['src/tests/exec_diff_corpus/leafcov_param10_stack_widths.cheng', 'src/core/backend/codegen_a64_link_units.cheng']
  src=18  bytes=1854    -> ['src/tests/runtime_event_lock_non_owner_unlock_trap.cheng', 'src/core/backend/codegen_encoder_event_units.cheng']
  src=51  bytes=714     -> ['src/tests/strutils_split_buffer_many_probe.cheng', 'src/core/backend/metadata_text_authority.cheng']
  src=107 bytes=274     -> 三个 src/tests 文件
  src=136 bytes=586578  -> []          ← 该尺寸在 src/ 下 0 命中
  …
```
⇒ **"字节数全仓唯一"这个手段对 234 源闭包只有 214/234 的解析率**；撞车方几乎总是 `src/tests/**`（测试件与闭包件同尺寸），且 **slot 136 的尺寸在 `src/` 下根本没有文件**（586578 B）—— 说明**闭包的字节数口径与磁盘文件不一致**（可能是迁移改写后的文本长度）。
**这条对以后任何"按字节数认源"的工作都适用**：先做解析率自检，别默认唯一。

### 11.7.5 本轮为何**不出补丁**（直说）

你要的是"逐源逐名的差集清单"+"按目录分批的补丁"。而现在这份清单**在唯一一个已知真阳性上失败** —— 用一份连已知答案都答不出的普查去批量改 200+ 个源文件，风险是**在自举链上撒一把未经校验的 import**。按本战役红线（不许静默、不许半成品），**我停在这里**：交出**普查脚本 + 两版读数 + 已定位的过程性错误 + 未定位的那一个**，而不是一份看着整齐、实则漏项的清单。

### 11.7.6 未测项

1. **假阴性的第二个原因未定位**（三个嫌疑见 §11.7.3，均未验证）。
2. **20 个未解析 slot 未补**（§11.7.4），因此"234 源全覆盖"**不成立**（实覆盖 214）。
3. **`NO_PROVIDER 6` 与 `AMBIGUOUS 3` 未逐条判读**。
4. **只扫了名字域，没有验证任何一条编译**（这是你点名要列明的）。
5. 反例件的代码位用名（`Result[` / `: Result` / `-> Result`）**未在 `codegen_a64_body_units.cheng` 上逐行复核**，因此"它确实构成一条 finding"仍是从 §11.2 的判词反推的。
6. 脚本只处理行级形态，**跨行类型表达式**（`Result[` 与 `int32]` 分行）、**`typeof(...)`**、以及**注解里的类型位**（`@borrows` 等，除 `@name()` 空参形式外）**未处理**。


## 11.8 第一步：最小修复补丁（`import std/result` 一行）

**补丁**：`patches/fix_a64_body_units_import_result.patch`
**冻结副本**：`.rebuild/s1b_step3/r9/patchgen/fix_a64_body_units_import_result.patch`
**sha256**：`98ad8a242b9af0eca67e79280be7b7ef0f9828aee23454052c6d5c6d0981f2c9`（两件 `cmp` 逐字节相同，rc=0）
**`git apply --check`（基线 = 当前树）**：**rc=0**
**内容**：在 `src/core/backend/codegen_a64_body_units.cheng` 的 `import cheng/core/ir/core_types as coreir` **之前**插入一行 `import std/result`。**只此一行、只此一个文件。**

**落点依据（同族先例，实读）**：
- `src/core/backend/codegen_a64_fill_units.cheng:21`（**最近的同族 B6 姊妹件，同目录**）的 import 段是 `import std/result` → 然后才是 `import cheng/...`；
- `src/core/backend/codegen_writer_units.cheng:18` 同样是 `std/*` 在前、`cheng/*` 在后。
⇒ 约定是 **`import std/*` 置于 import 段首位**，补丁照此插入。

**生成方式（纪律）**：`cp` 到 `.rebuild/s1b_step3/r9/patchgen/.scratch/` → **只编辑副本** → `git diff --no-index` 出 diff → 把 `diff --git`/`---`/`+++` 三行头部改写回 `a/<rel>` / `b/<rel>` → 写 `patches/` → `git apply --check`（**只读**）→ 冻结 + sha256 + `cmp` → **删 scratch**。
**校验读数**：`SCRATCH removed=True ; TARGET untouched=True`（原文件逐字节未变）。**未 apply、未编译、共享文件零接触。**

**预登记的验证方式（由你执行）**：烤一轮 + 抬高门跑全森林 ⇒
- 若 `forest src=13` 那堵 `name=Result` **消失、森林推进过去** ⇒ 这一行**由构造验证为正确**；
- 若判词不变、或变成别的名字 ⇒ 说明该文件还有别的缺名 ⇒ **把那时的判词带回来**，用它决定下一个修谁。

## 11.9 第二步：普查假阴性查到底（**已定位**）

### 11.9.1 嫌疑①（`collect_declared` 缩进正则）**排除**

直接把两个收集函数跑在该文件上，打印"本源已声明集合"：
```
---- STEP2: is 'Result' in collect_declared ? ----
NO  -> 'Result' is NOT in declared; the miss is elsewhere
declared-set size=89 ; sample=['CodegenA64BodyCondA64TrueCode', 'CodegenA64BodyEmitPrologueWord', …]
```
⇒ **`collect_declared` 是清白的**，`Result` 没有被误收进"已声明"。**嫌疑①排除。**

### 11.9.2 嫌疑②（泛型形参扫描）：**不是本次原因**（但确认存在）

§11.7.3 列的"泛型形参扫描把 `[...]` 内容当声明"确实存在，但它只往 `declared` 里加**括号内的**名字（`Result[int32]` → 加 `int32`），**加不进 `Result` 本身** ⇒ 它不可能造成这次的漏报。

### 11.9.3 **真因（高置信）：`Result` 落进了 `AMBIGUOUS` 桶，而我在报告里没有把它列出来**

实测（对全 `src/` 做"谁导出 `Result`"的粗扫）：
```
---- providers of the name 'Result' (whole src/) ----
count=16
  src/core/backend2/backend2_pipeline.cheng
  src/core/csg_core/csgc_authority.cheng
  src/core/csg_core/csgc_mapped_reader.cheng
  src/core/csg_core/merkle_manifest_verifier.cheng
  src/core/tooling/compiler_execution_stage_receipt.cheng
  src/core/tooling/compiler_execution_stage_receipt_wire.cheng
  src/core/tooling/compiler_parse_receipt_command.cheng
  src/core/tooling/compiler_toolchain_encoder_authority_import.cheng
  src/std/result.cheng
  src/tests/cold_bootstrap_kernel_aarch64_encode.cheng
  …（共 16）
```
⇒ **`Result` 这个名字有多个提供者**，普查的 `export_index["Result"]` 必然 `> 1` ⇒ 该条 finding 走 **`AMBIGUOUS` 分支**，**不进 `SINGLE_PROVIDER`**。
而 §11.7.2 里我只展示了 `SINGLE_PROVIDER` 的 3 条，**`AMBIGUOUS` 那 3 条我在自查时被自己的 `head -3` 截断，从未展开显示** —— 所以"已知真阳性不见了"的现象**由这个报告失误解释**，不是扫描器漏扫。

**⇒ 这是**报告/分类**失误，不是**扫描**失误。** 而且它恰好踩中你定的规则："同名多源导出 ⇒ 不许猜，**列出来报我裁**" —— 我既没猜（没生成补丁，正确），也**没列出来**（失误）。

**留一个可复核的一句检查**（我没有余量执行，交给下一手）：
```
# 打印那次闭包普查的 AMBIGUOUS 桶全文，确认 codegen_a64_body_units.cheng / Result 在不在里面
sed -n '/AMBIGUOUS (must not guess)/,$p' <census output>
```
若在 ⇒ §11.9.3 定谳；若不在 ⇒ 回到嫌疑③。

### 11.9.4 嫌疑③（解析文本 ≠ 磁盘文本）——**认真对待，且我给出的是"未验证"**

本仓确实有 `migrationSourceSyntax` 两条路（`compiler_csg.cheng` 的 `ParserValueExprReadMigrationSourceTreeFromReserved` vs `…FromTextReserved`）。我在 §11.9 里**没有验证**森林解析用的是磁盘原文还是迁移改写文本。
**但有一条反向证据**：§11.9.1 与 §11.9.2 已经在**磁盘文本**上正确取到了 `Result[...]` 的 17 处代码位（`:44 :59 :62 …`），并且**其他 214 个闭包件的普查也没出现系统性错位**（3 条 SINGLE_PROVIDER 都指向合理的 std 模块）。
⇒ **现阶段判"磁盘文本口径基本成立"，但这是弱结论**：若 `migrationSourceSyntax` 对该文件为真，行号会有偏移。**列为未测项，不建议在它被证伪前做批量改动。**

## 11.10 独立结论：字节数认源的解析率只有 **214/234**（任何按字节数认源的工作都要先自检）

```
CLOSURE_RESOLVED 214 / 234   (ambiguous-size slots: 20)
  src=15  bytes=1152   -> src/tests/exec_diff_corpus/leafcov_param10_stack_widths.cheng | src/core/backend/codegen_a64_link_units.cheng
  src=18  bytes=1854   -> src/tests/runtime_event_lock_non_owner_unlock_trap.cheng      | src/core/backend/codegen_encoder_event_units.cheng
  src=51  bytes=714    -> src/tests/strutils_split_buffer_many_probe.cheng              | src/core/backend/metadata_text_authority.cheng
  src=107 bytes=274    -> 三个 src/tests 文件
  src=136 bytes=586578 -> []      ← 该尺寸在 src/ 下 0 命中
```
- **撞车方几乎总是 `src/tests/**`**（测试件与闭包件同尺寸）；
- **slot 136 的尺寸在 `src/` 下 0 命中** ⇒ **闭包的字节数口径与磁盘文件不一致**（很可能是迁移改写后的文本长度，与 §11.9.4 的嫌疑③同源）。
**⇒ "字节数全仓唯一"这个手段对 234 源闭包只有 214/234 的解析率。以后任何按字节数认源的做法，第一步都要先做解析率自检。**

## 11.11 未测项

1. **只扫名字域、未验证编译**（延续标注）：§11.8 那一行的正确性**由你的构造性验证判定**，不是我。
2. §11.9.3 是**高置信推断**（`Result` 多提供者 ⇒ 落 AMBIGUOUS 桶），**未执行那句复核**即下定论；且 `AMBIGUOUS` 桶全文我从未展开。
3. §11.9.4（解析文本 ≠ 磁盘文本）**未验证**；结论"磁盘文本口径基本成立"是弱结论。
4. **20 个未解析 slot 未补** ⇒ 普查实覆盖 **214/234**。
5. `NO_PROVIDER 6` 与 `AMBIGUOUS 3` 未逐条判读。
6. 脚本只处理行级形态：**跨行类型表达式、`typeof(...)`、注解内类型位（除 `@name()` 空参形式）未处理**。
7. 我用"全 `src/` 粗扫"得到 `Result` 的 16 个提供者，与闭包内（214 件）的提供者数**可能不同**；§11.9.3 的定谳应以闭包内那次普查的输出为准。


## 11.12 第三步：声明检测修正 + 定论清单（**清单已小到可读，但仍不足以驱动批量补丁**）

### 11.12.1 判别式修正与**正反样本验证**（你要求的自证）

**修正**：`collect_declared` 的"缩进块条目"规则原来无条件生效，把 **Form-B 返回类型行**（`):` 之后独立一行的 `Result[str] =`）当成了声明。现改为：
> 一个 `NAME ... =` 行算"本源声明"，**当且仅当**向上找最近的、缩进更小的非空行（块头）的**首 token ∈ {`type`, `const`}**。

**验证读数**（实跑，三个样本）：
```
===== 判别式验证（正反样本）=====
  codegen_a64_body_units.cheng          :44    None     -> detector says use       OK
  result.cheng                          :11    Result   -> detector says declared  OK
  compiler_parse_receipt_command.cheng  :32    Result   -> detector says use       OK
SAMPLES_PASS True
```
⇒ **你给的 Form-B 样本（`compiler_parse_receipt_command.cheng:32`）现在判为"用"**，`src/std/result.cheng:11` 判为"声明"，`codegen_a64_body_units.cheng:44` 判为"用"。**三样本全过。**

**`Result` 的真声明只有一处 —— 我复核并证实你的结论**：在**闭包内**（211 件可解析）对 `Result` 求 `export_index`，唯一的"真声明"来源是 `src/std/result.cheng`；你上一轮看到的另外 15 个是**用**（Form-B 返回类型行等）——**修正后它们不再计入声明**。**你的结论成立，我的"16 个提供者"是旧检测器的产物。**

### 11.12.2 定论清单（修正后，闭包内）

```
CLOSURE_RESOLVED 211 / 234
SINGLE_PROVIDER 2   NO_PROVIDER 3   AMBIGUOUS 1

SINGLE_PROVIDER
  src/core/backend/codegen_contract.cheng   Err     [935, 1688, 1692] -> src/std/result.cheng
  src/std/cmdline.cheng                     Int64   [316]             -> src/std/system.cheng

NO_PROVIDER
  src/core/backend/system_link_plan.cheng   SystemOrdinaryProgram  [4773]
  src/core/tooling/compiler_csg.cheng       NormalizedExpr         [29433, 30469, 30937]
  src/std/os.cheng                          DateTime               [1562, 3813]

AMBIGUOUS
  src/core/backend/codegen_contract.cheng   Result  [908, 908, 919]  src/core/backend/elf_object_writer.cheng
                                                                   | src/core/backend/elf_x86_64_writer.cheng
                                                                   | src/std/result.cheng
```
**强信号**：上一炉的已知真阳性（`codegen_a64_body_units.cheng` / `Result`）**已不在清单里** —— 因为那件已被 §11.8 的补丁修好、`Result` 进了作用域。**这说明修正后的检测器不再漏报已知真阳性。**

### 11.12.3 为什么我**仍然没有出批量补丁**：清单里两条可执行项各有一个硬问题

**(1) `src/std/cmdline.cheng` / `Int64` —— 假阳性，已核实。**
```
src/std/cmdline.cheng:316
    let limit: int64 = neg ? Int64(2147483648) : Int64(2147483647)
```
命中我 `type_uses` 的 `:\s*([A-Z]\w*)` 模式，但那个冒号是 **三元表达式的 `:`**，不是类型标注；`Int64(...)` 是**内建转换调用**，不是类型位。
另核：`grep -nE "^\s*Int64\s*(=|\[)" src/std/system.cheng` → **空**（`system.cheng` 并不声明 `Int64`）。
⇒ **这条是"用检测器"的假阳性**，不是缺 import。**不据此出补丁。**

**(2) `src/core/backend/codegen_contract.cheng` / `Result` —— 真歧义，按你的规则必须报你裁、不许猜。**
`Result` 在闭包内有 **3 个声明来源**（`elf_object_writer.cheng` / `elf_x86_64_writer.cheng` / `std/result.cheng`）。同文件的 `Err`（`:935/:1688/:1692`）**无歧义**（唯一来源 `std/result.cheng`），但它与 `Result` **共用同一条 import 行**（都来自 `std/result`）——**给这条文件名下的任何 import 都会同时改变 `Result` 的解析**，所以在歧义未裁之前，**这一条整件挂起**。

⇒ **两条都不可执行** ⇒ 批量补丁**不出**。这一轮的价值在"检测器修对了 + 清单缩到 7 条 + 两条各有明确处置"。

### 11.12.4 新暴露的、真正的阻塞点（下一轮的头号目标）

**"用检测器"还有一个成体系的假阳性源：三元表达式的 `:` 与类型标注的 `:` 不可区分。**
`cmdline.cheng:316` 就是标本。行级正则 `:\s*([A-Z]\w*)` 无法区分
- 类型标注 `x: T`
- 三元 `cond ? A : B`
- 对象字面量 / `case` 标签 / 块标签里的冒号

**修法方向（下一轮）**：判断 `:` 左侧最近的语法上下文——若左侧同一表达式内存在未配对的 `?` ⇒ 判为三元、不是类型位；或改为"只在签名区（`fn` 头、参数表、返回类型）与 `type` 块内取类型位"。**我没有余量在本轮实现它**，故列为下一轮的头号目标，且**它是本普查从"能看"到"能用"的最后一道关**。

### 11.12.5 独立结论（再次写死）：字节数认源解析率 **211~214 / 234**

- 本轮 `CLOSURE_RESOLVED 211 / 234`，上一轮 `214 / 234` —— **两次不同**，因为**共享主树在两次之间被改动**（§11.8 的补丁进了树、别的 hand 也在改），文件字节数变了 ⇒ 解析率随之变。
- 20 个 slot 撞车，**对手几乎总是 `src/tests/**`**；**slot 136（586578 B）在 `src/` 下 0 命中** ⇒ **闭包的字节数口径与磁盘文件不一致**（很可能是 `migrationSourceSyntax` 改写后的文本长度）。
**⇒ 结论写死：`forest src=N bytes=` 不是稳定的源身份。任何按字节数认源的做法，必须 (i) 先做解析率自检，(ii) 注意它在共享主树变动时会漂。**

## 11.13 未测项

1. **只扫名字域、未验证编译**（延续标注）。
2. **三元 `:` 假阳性未修**（§11.12.4）⇒ 定论清单**仍可能含假阳性**；本轮只逐个核了 2 条可执行项。
3. `NO_PROVIDER 3`（`SystemOrdinaryProgram` / `NormalizedExpr` / `DateTime`）**未逐条判读** —— 它们可能是内建、可能是 cross-module 别名、也可能是真的缺声明。
4. `AMBIGUOUS 1`（`codegen_contract.cheng` / `Result`）**等你裁决**；`Err` 与它共用 import 行，故整件挂起。
5. **闭包解析 211/234**（本轮）⇒ 未覆盖 23 件，清单**不完备**。
6. 跨行类型表达式、`typeof(...)`、注解内类型位（除 `@name()` 空参形式）**未处理**。
7. 上一轮 §11.9.3 的"AMBIGUOUS 桶"复核**已被本轮取代**（本轮直接重跑了修正后的普查），但**旧桶全文仍未展开**，如需要请按 §11.9.3 的一行检查取出。


## 11.14 枚举模式设计：**(a)/(b) 都不是答案，建议 (c)**；本轮未出补丁

### 11.14.1 门控（与本仓既有 trace 逐字同形）

既有先例（`compiler_csg.cheng`，实读）：
```
:1607   var compilerCsgMemTrace: bool
:1616   compilerCsgMemTrace = os.GetEnv("CHENG_CSG_MEM_TRACE") == "1"
:1619   fn compilerCsgMemTraceEmit(tag: str) =
:1620-1623   if !compilerCsgMemTrace: return
             let line = Fmt"csg_mem tag={tag} rss=… live=…"
             os.WriteLine(os.Get_stderr(), line)
```
⇒ 枚举模式照此新增 `var compilerNominalSweep: bool` + `os.GetEnv("CHENG_NOMINAL_SWEEP") == "1"` + 同形 emitter（写 stderr）。**门控是模块级 `var` + 一次性 `GetEnv`，不是每调用点读环境变量** —— 这条是"默认路径逐字节不变"的前提。

### 11.14.2 **(a) 与 (b) 我都不选**，理由是同一个根因

| 方案 | 为什么不行 |
|---|---|
| **(a) 命中即记录 + 跳过该源 + 继续** | ① **基址累加器会错位**：驱动里 `tokenBase`/`bracketArgBase`/`genericSymbolBase`/`genericSymbolChildBase`/`functionBase` 是**在 append **之后**推进的（`compiler_csg.cheng` 源循环尾部）；在 append 之前 `continue` ⇒ 后续每个源的 view base 全部偏移 ⇒ 之后所有源的行坐标错乱，"缺名"清单里会混进**大面积伪缺失**。② `AppendSourceInto` 失败时**可能已经半途 append 了该源的 authority 行**（它是边遍历边 `add` 的）⇒ 累积权威里留下"半个源"，后续源的索引/坐标不再自洽。③ 即使修好①②，**级联伪缺失**仍在（你的顾虑成立）。 |
| **(b) 不跳过、只把已收集的表打出来就停** | **枚举不出任何东西**：abort 发生在**第一个**失败的名字上，(b) 拿到的永远只是那一对 —— 与今天"一轮一个文件"完全等价。**没有意义。** |

**⇒ 级联伪缺失的根因，是"在同一个累积结构上跳源"。** 只要还在那条累积流水线里跳，①②③ 都躲不掉。

### 11.14.3 建议 **(c)：把 authority 相单独跑一遍（独立预扫），而不是在流水线里跳源**

**关键性质**：`AppendSourceInto` 对源 k 的名字解析，输入只有 **sealed 的 `index` + `imports`（+ `sortedEntryRows`/`sortedImportRows`）+ 源 k 自己的树**；它**不读其他源的 authority 行**。
⇒ **每个源的 authority 解析互相独立** ⇒ **"第 k 个源失败"不会改变第 m 个源（m>k）的解析结果** ⇒ **没有级联伪缺失**。这正是 (a) 缺的那条性质。

**形态**：
1. 在驱动进入主源循环**之前**，若 `compilerNominalSweep`：对每个源 i 走一遍与主循环**相同**的"取快照文本 → 重写 → 读树"路径，只调 `TypedExprTypeResolutionAuthorityAppendSourceInto`（**不调** arena append、**不**推进任何基址累加器），把失败的 `(producerSourceIndex, name, type_syntax_row, root_row)` 收进表，然后**丢弃该源的树与部分权威，继续下一个源**；
2. 全部源跑完后，**逐行打印**收集到的对；
3. **照常非零退出**（诊断，不放行）。
**为什么这样就没有①②③**：预扫**不碰**主循环的基址累加器（①消失）、**不把部分权威带进**主循环（②消失）、每源独立所以**没有级联**（③消失）。

**代价（如实）**：多一趟逐源 parse（与 pass 0/1 同量级；234 源 ≈ 47 s 量级的解析 + 权威构建），且**诊断跑必然不产生可用产物**。**这是为"一次拿全清单"付的价钱，比一轮一个文件（8 min × ~220）便宜三个数量级。**

### 11.14.4 记录点的落位（你已经给了）

判词产生点：**`typed_expr_type_arena.cheng:4991`**（索引版，逐源驱动走这条）；孪生 **`:3612`**（树版，全林路径）。
**记录必须插在 `:4991` 的 `err = Fmt…` 之后、`return false` 之前**，且 `root_row`/`type_syntax_row` 两个坐标在该点**都已绑定**（`:4978` 的泛型查找刚用过 `rootTypeSyntaxNodeIndex`；行号用 `localRow`/`globalRow` 中对应 `type_syntax_row` 的那个）。
**默认路径等价性论证**：新逻辑全部在 `if compilerNominalSweep:` 分支内，该分支**只做记录、不改任何控制流**（仍 `err=…; return false`）；`compilerNominalSweep` 是模块级 `var`，默认 `false`（`GetEnv` 未设时为 `""` ≠ `"1"`）⇒ **默认路径执行到的语句序列与今天逐语句相同 ⇒ 逐字节不变。**

### 11.14.5 本轮为何未出补丁

(c) 要新增**一整趟独立的逐源预扫**（取快照/重写/读树/建权威/丢弃），落在 `compiler_csg.cheng` 的驱动里，并与主循环共享同一套快照与索引读法 —— 这是**多写入点、且必须与主循环逐项对齐**的改动。我没有余量把它写到本战役要求的自检标准（三项编译级自检、`apply --check`、正反向逐字节、`diff -u` 多重集、冻结 + sha）。
**在自举最上游硬写一个"看起来对"的预扫，比多等一轮贵得多。** 所以本轮交**设计 + (a)/(b)/(c) 的裁决与理由 + 门控与落位**，下一轮照此落笔即可。

### 11.14.6 未测项

1. **预扫与主循环的"取快照/重写/读树"是否真能逐项对齐未验证**（主循环用 `work.sourceSnapshots`/`sourceSnapshotIndex`/`expressionCallProfiles[i].migrationSourceSyntax` 等；预扫要复用同一套）。
2. **"每源 authority 解析互相独立"是从 `AppendSourceInto` 的输入面推出的静态结论**，未用运行期证明（例如刻意让源 3 失败、看源 5 的解析结果是否变化）。
3. **`root_row` 在 `:4991` 的可取性未逐行复核**（`:3612` 树版是否同样可取得一起核）。
4. **打印格式与 rc 约定**（是否在 stderr、是否也写一份到文件）未与既有 trace 之外的任何消费者对齐 —— 目前只按你给的"一行一对、rc≠0"设计。
5. 延续标注：**只扫名字域、未验证编译**。


## 11.15 (c) 已落笔：补丁 `patches/nominal_sweep_enumerate.patch`；§11.14 逐条核实（**含 3 处与源码冲突，以源码为准**）

**状态**：补丁已出、已冻结，**未 apply、未编译、未运行**。基线 = 当前工作树（脏树，未提交改动 30+ 件）。
`sha256(nominal_sweep_enumerate.patch) = 093fc21a991a50d1fa1b5317849b5920072a1cccc378566009748598b4cf8fe4`
冻结件 `.rebuild/s1b_step3/r9/patchgen/nominal_sweep_enumerate.frozen.patch` 与之 `cmp` 逐字节相同（同名 `.sha256` 在位）；生成器 `nominal_sweep_gen.py`，自检器 `nominal_sweep_addedcheck.py` / `nominal_sweep_syntaxcheck.py` / `nominal_sweep_indentdelta.py` 同目录。
**补丁在 `.scratch/` 的 `a/`(原始) / `b/`(改后) 副本上生成，共享树零接触**（改前改后 `md5` 相同：`typed_expr_type_arena.cheng=f120af02f55143f369ffe6d0903cf5c4`、`compiler_csg.cheng=794245869f288c6e9d246519a1f3aaa2`），scratch 已删。`git apply --check` 正/冻结两件均通过；`patch -p1` 回合到干净副本后与 `b/` **`cmp` 逐字节相同**。

### 11.15.1 与 §11.14 的逐条核实

> 行号口径：本节引的都是**当前工作树（补丁未打）**的行号，与 §11.14 同口径；11.15.2 那张改动表用的是**打完补丁后**的行号。

| §11.14 的说法 | 核实结果 |
|---|---|
| 判词点在 `typed_expr_type_arena.cheng:4991`（索引版） | ✅ 正确（`err = Fmt"… nominal declaration is not visible …"` 后 `return false`） |
| 孪生 `:3612`（树版，全林路径） | ✅ 正确（同一句子在 `typedExprTypeAuthorityResolveUnqualifiedInto` 内）。**但本轮不碰它**：逐源驱动只走索引版 |
| `:4867` 是 `TypedExprTypeResolutionAuthorityAppendSourceInto` | ❌ **错**。该函数定义在 **`:5089`**；`:4867` 落在 `TypedExprTypeDeclarationIndexVerifySourceAgainstInto` 的尾部 |
| 本源查名 `:4728` / 导入边回退 `:4733-4762` | ❌ **错**（行号整体偏移 ≈ +225）。实为 `:4955-4958`（本源二分查名）与 `:4960-4989`（导入边回退 + 未导出/歧义判词） |
| **"记录必须插在 `:4991` 的 `err = Fmt…` 之后、`return false` 之前，且 `root_row`/`type_syntax_row` 在该点都已绑定"** | ❌ **错，且是本设计里唯一的硬伤**。`typedExprTypeAuthorityIndexResolveUnqualifiedInto`（定义 `:4946`）的形参只有 `index/sortedEntryRows/imports/sortedImportRows/producerSourceIndex/name/declarationRootOut/err` —— **没有 `localRow`、也没有 `rootTypeSyntaxNodeIndex`**；`:4978` 也不是"泛型参数查找"，而是 `typedExprTypeAuthorityIndexDeclarationExportedInto` 的调用。两个坐标真正绑定在**调用方** `TypedExprTypeResolutionAuthorityAppendSourceInto`：`:5193` 起 `var rootTypeSyntaxNodeIndex = localRow`，`:5233/:5243` 刚用过它们，且那里**已经有一段既有的 `[probe generic-owner]` 诊断**把 `type_syntax_row=`/`root_row=` 拼进 `err`。⇒ 记录点改落到 caller 的失败分支（新行 **`:5314-5322`**），语义与 §11.14 的意图一致，位置以源码为准 |
| 命中即"跳过该源"的 (a) 会踩基址累加器 / 半源权威 | ✅ 正确。`tokenBase`/`bracketArgBase`/`genericSymbolBase`/`genericSymbolChildBase`/`functionBase` 确在 append **之后**推进；`AppendSourceInto` 确为边遍历边 `add` |
| "每源 authority 解析互相独立"（(c) 的地基） | ✅ **静态确证**。通读函数体：对 `out` 只读 `out.sealed`（`:5100`），其余输入 = sealed `index` + `sortedEntryRows` + `imports` + `sortedImportRows` + 本源的树 + `producerSourceIndex` + `viewGenericSymbolBase`；而 `viewGenericSymbolBase` 只以 `return viewGenericSymbolBase + localRow`（`:5080`）加性出现 ⇒ 它就是索引自己的前缀和，与其它源的 authority 行无关 ⇒ **第 k 源失败不改变第 m 源结果，无级联** |
| 门控照 `:1607/1616/1619-1623` 逐字同形 | ✅ 正确（`:1602-1622` 实读：模块级 `var` + `CompilerCsgTraceInit()` 里一次性 `GetEnv` + 自带 `if !flag: return` 的 emitter） |

### 11.15.2 改动清单（行号为**打完补丁后**的行号；共 +221 行，−0 行）

| 写入点 | 作用 |
|---|---|
| `src/core/lang/typed_expr_type_arena.cheng:4945-5014` | 新增 `[nominal-sweep]` 表：`var typedExprTypeNominalSweepActive` + 5 条并行列（source/type_syntax_row/root_row/name/reason）、`TypedExprTypeNominalSweepBegin()`（唯一布防点）、`typedExprTypeNominalSweepNote(...)`（`@borrows`，克隆入表）、`Count/SourceIndexAt/TypeSyntaxRowAt/RootRowAt/NameAt/ReasonAt` 只读访问器 |
| `src/core/lang/typed_expr_type_arena.cheng:5314-5322` | 在 `AppendSourceInto` 的"名字不可达"失败分支里、既有 probe `Fmt` 之后、`return false` 之前，调一次 `typedExprTypeNominalSweepNote(producerSourceIndex, localRow, rootTypeSyntaxNodeIndex, name, err)`。**只记录，不改控制流**（下面仍是 `return false`） |
| `src/core/tooling/compiler_csg.cheng:1608` | 模块级 `var compilerNominalSweep: bool` |
| `src/core/tooling/compiler_csg.cheng:1618-1621` | 在既有一次性初始化 `CompilerCsgTraceInit()` 里 `compilerNominalSweep = os.GetEnv("CHENG_NOMINAL_SWEEP") == "1"`（**不新增调用点、默认路径不多执行一条语句**） |
| `src/core/tooling/compiler_csg.cheng:1630-1637` | 同形 emitter `compilerNominalSweepEmit(line)`：`if !compilerNominalSweep: return` + `os.WriteLine(os.Get_stderr(), line)` |
| `src/core/tooling/compiler_csg.cheng:35712-35840` | 预扫驱动：`if compilerNominalSweep:` 内逐源"取快照→重写→列统计→读树→（`producerSourceCount`/索引校验）→ 只调 `AppendSourceInto`"，**每源一个一次性 authority，用完即弃**；`sweepGenericSymbolBase` 是预扫**私有**前缀和（不碰主循环累加器）；跑完逐行打印 `nominal_sweep source=… path=… name=… type_syntax_row=… root_row=… reason=…`，再打一行 `nominal_sweep total=<n> sources=<m>`；**`total≠0` 就 `return false`（rc≠0，不放行）**；`total==0` 落回原路径 |

**与 §11.14 的两点如实偏离（都已在上表体现）**：① 记录点从 `:4991` 挪到 caller（理由见 11.15.1）；② 该分支同时覆盖"名字不可达/导入未导出/无歧义失败"三类，故表里连 `reason` 原文一起存、一起打印 —— 清单是"不可达"的超集且**每条自带判词**，不会把目标类淹掉。

### 11.15.3 默认路径逐字节不变的论证（逐层）

1. 新增全局只有 6 个 `var` + 1 个 `bool`，默认值分别是空数组与 `false`；没有任何初始化副作用。
2. 唯一的写入口 `typedExprTypeNominalSweepNote` 第一句就是 `if !typedExprTypeNominalSweepActive: return`；`Active` 只能由 `Begin()` 置真，而 `Begin()` 只在 `if compilerNominalSweep:` 里被调。
3. `compilerNominalSweep` 只在 `CompilerCsgTraceInit()` 里被赋值；`GetEnv` 无该变量时返回 `""`，`"" == "1"` 为假 ⇒ 默认 `false`。
4. 该 init 在驱动之前**必然已执行**：`CompilerCsgStreamTypeArenaFromDeclarationIndexInto` 的唯一调用点在当前树 `compiler_csg.cheng:39334`（打完补丁后为 `:39477`），其前面 `:39301`（补丁后 `:39444`）就是**无条件**的 `CompilerCsgTraceStage(...)` → `CompilerCsgTraceInit()`；同一个函数里 `compilerCsgMemTrace`（同一次 init 赋的）在 `:35703`（补丁后 `:35846`）就被读，而实测日志里 `csg_mem tag=…` 确实出现过 ⇒ 该 init 在驱动前真跑过，不是纸面推理。
5. 于是默认路径上：预扫整块不进入；`Begin/Count/…At` 一次都不调；`Note` 一次都不调（它在"不可达"失败分支里，而该分支一进就 `return false`）。**执行到的语句序列与打补丁前逐语句相同**（唯一新增的求值是一次模块级 `bool` 读取 `if compilerNominalSweep:`，与既有 `if compilerCsgMemTrace:` 同形）。
6. **失败方向的保险**：预扫只在 `total≠0` 时提前退出；`total==0` 一律**落回原路径**。所以万一预扫因为某个非"缺名"的输入校验（`AppendSourceInto` 开头那组 `input invalid` / `base mismatch`）而一条都没记下，结果不是"假报干净"，而是**退回今天的行为**：主循环照跑、照死在第一个真错误上并打原判词。预扫不可能把一个真错误吃掉。

### 11.15.4 括号与缩进自检（补丁交付前，按本战役 `module const scan made no progress` 事故的口径）

- **括号平衡（去字符串/去 `#` 注释后计数）**：两个文件改前改后 `final_balance=0` 且**运行中最小余额 `min_balance=0`**（负数=提前闭合，正是上次事故的形状）。
- **新增行单独平衡**：arena +79 行、csg +142 行，各自 `final_balance=0`、`min_balance=0`（插入块自闭合，不吃掉外层括号）。
- **缩进**：新增行内，处于括号/`||`/`+`/`=` 续行位置的按本仓既有风格对齐（`indent=19` 对齐 `(` 后首参、`indent=15` 对齐 `if ` 后条件），其余语句行缩进一律 4 的倍数；**无 Tab**。
- **与基线的差量**（最硬的一条）：把"缩进非 4 倍数"的行按整文件枚举，`typed_expr_type_arena.cheng` 改前 1951 行 / 改后 1951 行（**delta=0**）；`compiler_csg.cheng` 8139 → 8153（**delta=14**），14 行**全部**是上面那两类续行，逐行已核（见 `nominal_sweep_indentdelta.py` 输出）。
- 复核：`patch -p1` 把补丁打到干净副本后，与生成时的 `b/` 树 `cmp` 逐字节相同。

### 11.15.5 `@borrows` 自查（本仓硬规则）

新增函数 9 个，逐个过：带**非 var 托管形参**的只有两个 —— `typedExprTypeNominalSweepNote(…, name: str, reason: str)` 与 `compilerNominalSweepEmit(line: str)`，**两个都已标 `@borrows`**。其余（`Begin`、`Count`、`SourceIndexAt`、`TypeSyntaxRowAt`、`RootRowAt`）形参全是 `int32`/无参，不需要；`NameAt`/`ReasonAt` 形参也只有 `int32`，但按本文件既有的"返回 `str` 的访问器一律标 `@borrows`"惯例（`:532-542`）一并标上。

**额外发现并已规避的一处所有权风险（原设计没有提）**：`Note` 若把 `name`/`err` 直接 `add` 进表，等于把 caller 的 `name` 与"即将 `return false` 的错误串"**move 走**，caller 之后（含驱动侧 `Fmt"… {buildErr}"`）再用就是 use-after-move。故 `Note` 的两列文本一律 `strings.CloneStr(...)` 入表（`std/strings.CloneStr` 已在两个模块内被大量使用），caller 只借不搬。

### 11.15.6 未测项（**本补丁一行都没编译过、没运行过**）

1. **未编译**：`cheng` 是否接受这些语句**全部未验证**。风险点按大小排：(a) `var sweepAuthority = typearena.TypedExprTypeResolutionAuthorityStreamingBegin()` 这类"**循环体内用调用结果初始化托管聚合**"（同类先例：`compiler_csg.cheng:29732` 的 `var edge = share(...)`，但那不是同型）；(b) `let _ = <bool 调用>`（本文件有 10 处 `let _ = ` 先例，未逐一确认返回类型）；(c) 模块级 `var` 在 `typed_expr_type_arena.cheng` 是**该文件第一次出现**（`parser.cheng:22-45` 有先例，模块级 `var` 本身合法）。
2. **"每源独立"只有静态证明**，没有运行期反例检验（例如刻意让源 3 失败，看源 5 的结果是否变化）。
3. **预扫的"取快照/重写/读树"与主循环逐项对齐是抄写对齐**（同一批调用、同一 `migrationSourceSyntax` 分支、同一 `ArenaColumnCount` 列统计、同一 `+65536` 预留、同一 `ProcessResourceGuardCheck`/`ProcessMemoryPressureRelief`），**未运行验证**。
4. **代价未实测**：预估 234 源多一趟 parse ≈ 47 s 量级（§11.14.3 给的量级），未计时。
5. **不产生可用产物是设计内**：`total≠0` 直接 `return false`，**不跑主循环**（跑也只会再死在第一个失败名上，且要再付一趟解析）。`total==0` 才落回原路径。
6. **重复调用**：`Begin()` 不清表（`setLen` 清托管数组在本仓没有先例），同一进程内第二次进驱动会把两轮记录叠加；`compiler csg` 是单次进程，判为可接受，未处理。
7. **打印格式**只按"一行一对 + 一行总计、写 stderr、rc≠0"实现，未与任何既有消费者对齐。
8. 延续标注：**只扫名字域，未验证编译**；`:3612` 树版孪生**未动**（本轮不需要）。


## 11.16 新墙 `imported type is not exported`（`kd_r35`，`source_index=158`）

### 11.16.1 判词点、判据链、与 `not visible` 的先后关系

**产生点（4 处，两族各 2）**：`typed_expr_type_arena.cheng:3618`、`:3697`（树版孪生）与 **`:5067`**、**`:5139`**（索引版，逐源驱动走这两处）。

**"导出"的判定**（逐层实读）：
1. `:5067` 前的 `typedExprTypeAuthorityIndexDeclarationExportedInto(index, candidateRoot, exported, err)`
   → `let entryRow = typedExprTypeDeclarationIndexEntryForRoot(index, declarationRoot)` → `exportedOut = typedExprTypeDeclarationIndexEntryExported(index, entryRow)`；
2. 该 flag 在 pass 0 由 `ParserValueExprDeclarationIndexAppendEntry` 写入，取的是
   **`ParserValueExprDeclarationExportedAt(tree, nameTokenIndex)`（`parser.cheng:9598-9604`）**：
```
    let exported = name.len > 0 &&
                   name[0] >= 'A' && name[0] <= 'Z'
```
**⇒ 这就是 `docs/cheng-formal-spec.md:714-719`（§1.4）的原话实现**：「首字符为 ASCII 大写字母的符号视为导出」「首字符为小写字母或 `_` 的符号为模块私有」。

**与 `not visible` 的关系**：**同一个 resolver 的两个出口**。`IndexResolveUnqualifiedInto` 在导入边回退循环里，对每条边的 `targetSourceIndexes[importRow]` 查到 `candidateRoot` 后，**先**查 exported，`!exported` ⇒ **`:5067` 立即 abort**；循环走完仍无匹配 ⇒ **`:5071` `not visible`**。
⇒ **"可达但私有"** 早于 **"不可达"** 判定，两者是同一函数的相邻出口。

### 11.16.2 判定：**(a) 源侧真缺陷**（判据正确、源真有跨模块引用私有符号）

**证据是构造性的，不是推断**：判定"是否导出"的谓词**逐字就是规范 §1.4 的规则**（`name[0] >= 'A' && name[0] <= 'Z'`）。
⇒ 走到这个 abort 的**充要条件**是：某个被引用的名字**首字符不是 ASCII 大写**（小写或 `_`）。
⇒ 在规范口径下这就是**模块外不可见的私有符号被跨模块引用** ⇒ **源侧缺陷**，与已裁定的 `Result` 缺 import **同类（都是改源、不动管道）**，而不是导出判定的缺口。

**我没有把它判成 (b) 的理由**：要判 (b) 必须找到"该名字其实首字母大写、却仍被判私有"的路径。`ExportedAt` 只有一个表达式、没有其它分支；`EntryExported` 只是把 pass-0 存的 flag 读回来。**没有可容纳"漏判"的结构。**

### 11.16.3 `source_index=158` **未能按字节数钉死**（第三次独立确认）

```
grep -o "forest src=158 bytes=[0-9]*" …/r35_raised.stderr.txt   → forest src=158 bytes=2184453
find src -name '*.cheng' -size 2184453c                          → 空
```
⇒ **该尺寸在 `src/` 下 0 命中**（与 §11.7.4 的 slot 136、586578 B 同型）。
**⇒ 第三次独立确认：`forest src=N bytes=` 不是稳定的源身份。** 本轮**不按字节数认源**。

**正确的取源方式（你指的路，我确认可用）**：`patches/nominal_sweep_enumerate.patch` 的打印行是
```
nominal_sweep source={} path={} name={} type_syntax_row={} root_row={} reason={}
```
**它印 `path=`** ⇒ **开一次枚举跑就同时拿到 `path`、`name` 与 `reason`**，源身份与名字一并解决。

### 11.16.4 枚举模式能否一次吃下这一类？——**能**（你那条强提示成立）

`sweep` 的记录点在**调用方的失败分支**，而 `:5067` 与 `:5071` 是**同一个 `IndexResolveUnqualifiedInto` 调用的两个出口** ⇒ 两者都会走那个失败分支，`reason` 里带的正是 resolver 的原文（`imported type is not exported` 或 `nominal declaration is not visible`）。
**⇒ 一次 `CHENG_NOMINAL_SWEEP=1` + 抬门跑，就能拿到全部 `imported type is not exported` 的 `(source, path, name, row, reason)` 全表。** 不需要再写一类枚举。

**但这一跑我做不了**：我这边**禁编译、禁烤**（编译槽位不在我手上）。命令交给你：
```
CHENG_NOMINAL_SWEEP=1  <抬门>  <kd_* 驱动>  2> sweep_r36.stderr.txt
grep "nominal_sweep " sweep_r36.stderr.txt | grep "imported type is not exported"
```

### 11.16.5 本轮交付的补丁（诊断坐标，不是修法）

**`patches/imported_type_not_exported_coords.patch`**
- **冻结副本** `.rebuild/s1b_step3/r9/patchgen/imported_type_not_exported_coords.patch`
- **sha256 `1c66632b939fe6c9ed2de62ca3014ce8c7319bb0c85c2d24db03991bd8542b36`**（两件 `cmp` 逐字节同，rc=0）
- **`git apply --check`（基线=当前树）rc=0**；反向 `--check` rc=0
- 内容：给**索引版两处** `imported type is not exported` 判词补坐标 ——
  `:5067` 那条加 `name=/producer_source=/target_source=/declaration_root=`；`:5139` 那条（qualified 路径）加 `name=leafName producer_source=currentSourceIndex declaration_root=declarationRootOut qualified_path=1`。
- **纯诊断**：控制流不变（仍 `err=…; return false`），默认行为一字不改。
- 生成器只读源、只写 `patches/`，`.scratch/` 编辑后即删（`SCRATCH removed=True ; TARGET untouched=True`），**未 apply、未编译**。

**为什么给这个而不是给修法**：修法要**先知道是哪个名字**，而 `source_index=158` 按字节数钉不死、判词又不带坐标。这个补丁让**即便不开枚举**的跑也能报出 `name/producer_source/target_source`；**开了枚举则直接拿全表**。两者互补。

### 11.16.6 未测项

1. **枚举那一跑我没有执行**（禁编译/禁烤）⇒ `imported type is not exported` 的**全表尚未拿到**，§11.15.2 的 (a) 判定是**基于判据构造**的（谓词即规范原文），**不是基于具体那个名字**。
2. **`source_index=158` 的具体文件未确定**（字节数 0 命中）；`path=` 要以枚举输出为准。
3. `:3697` / `:3618`（树版孪生）**未加坐标**：两处文本与索引版**逐字相同**，直接改会同时命中，而树版的可绑定性我**没有逐行核**（它是否有 `imports`/`importRow`/`leafName` 同名局部）⇒ **按"不引用另一函数的局部"纪律，我不动它们**。全林路径若再撞这条，需要单独核。
4. `:5139` 那条用的 `leafName`/`currentSourceIndex` 是否在该点**确实绑定**，我只按 §11.15.1 的上下文读判定，**未逐行复核**（若编译报未绑定，把该处退回只加 `declaration_root=`）。
5. 上一轮 §11.14 的 (c) 方案**已被现实取代**（枚举已由别的手实现并跑通），其未测项作废；但 §11.14.6 的 ①②③（预扫与主循环对齐、每源独立性、`root_row` 可取性）**在已落地的枚举实现里应已被回答**，我未复核。
