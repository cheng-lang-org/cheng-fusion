# `object trait premise out of range` 判词定位（kd_r9y 四正例）

- 性质：只读回源 + 静态定位。**未运行任何编译/烤制/lldb**；只写本文件与 `patches/object_trait_premise_portable_row_order.patch`，未改任何源文件本体。
- 锚定：工作树（未提交改动的行号已逐条核过），HEAD = `d8e06046a`。
- 结论先行：**判词点既有（HEAD 就在），缺陷代码既有（与 HEAD 逐字相同），是"既有潜伏缺口首次可达"；根因不在 arena、不在最终 Type 表，而在两个 `portable` Type 投影函数"边追加边校验"，此时行空间只建到一半。** 修法已出补丁，`git apply --check` exit 0。

---

## ① 判词点与完整判据链（file:line）

判词：`src/core/csg_core/compiler_snapshot_schema.cheng:5934`（HEAD 版 `:5932`，工作树因 `ptr` 标量补丁 +2 行）。

| 环节 | 锚点 | 内容 |
|---|---|---|
| 判词函数 | `compiler_snapshot_schema.cheng:5857` | `csgCompilerTypeTraitsDerivedInto` |
| 判词臂 | `:5924-5942` | `kind == CsgCompilerTypeObject \|\| kind == CsgCompilerTypeEnum` 共用臂 |
| 判词点 | `:5932-5935` | `if !csgCompilerIndexValid(premiseTypeId, snapshot.types.typeCids.len): err = "...object trait premise out of range"` |
| 索引语义 | `:2641-2642` | `csgCompilerIndexValid(i, n) = i >= 0 && i < n` |
| 被比较的两个量 | 同上 | 左 = `snapshot.types.traitPremiseTypeIds[traitPremiseStarts[typeId] + offset]`；右 = **本 snapshot 的 Type 行总数 `typeCids.len`**。下界固定 0 |
| 存在性前置 | `:5762-5854`，object 分支 `:5807-5816` | `csgCompilerTypeTraitPremisesExact`：要求 `argCounts[typeId] == traitPremiseCounts[typeId]` **且** `premise[i] == argTypeIds[argStart+i]`。**⇒ 判词点的 premise 与 arg 两列必然同值** |
| 首个调用者 | `:5966-6034`（`:5995` 调 traits，`:6025-6028` 又对 premise 查一次 `typeCids.len`） | `CsgCompilerTypeTraitProofCidInto`；`traits` 在**前**，所以先出 object 味判词 |

**"premise" 是什么**：该类型行的 trait 前提；对 object 行就是**它的字段类型行**（`managedOut/sendOut/syncOut` 由字段类型递推）。arena 里 `traitPremiseTypeIds` 对 object 行与 `childTypeIds` 同源同值。

**两个数组/下标/上界**：数组 `traitPremiseTypeIds`（CSR 扁平列），下标 `traitPremiseStarts[typeId] + offset`（`offset < traitPremiseCounts[typeId]`），上界 `typeCids.len`。"out of range" = **premise 值 对 该 snapshot 的 Type 行总数**比出来的（`<0` 或 `>=len`），**不是**对 arena 行数比的。

**生产端（值怎么来的）**：`compiler_snapshot_builder.cheng:14288` `compilerSnapshotBuilderAppendArenaTypeRow`
- args：`:14413-14418` 直接抄 arena `childTypeIds`；
- premises：`:14462-14478` 直接抄 arena `traitPremiseTypeIds`（原值，不重映射）。

**arena 行序（为什么字段行 id 更大）**：`typed_expr_type_arena.cheng:8335` `TypedExprTypeArenaAppendSourceFromTreeInto`
```
:8405  typedExprTypeArenaReserveAggregatesRec(...)   ← 先给本源的 object/enum 分配行（占位 -1，:1425-1432）
:8414  typedExprTypeArenaInternSyntaxRec(...)        ← 后才现造字段类型行（定长数组/seq/apply…）
```
13 个种子标量行在 `AllocateFromLimitsInto` 里最先建（`typed_expr_type_arena.cheng:8322` + `:1566`，范围 `Void..CString` 跳过 `Int/UInt`，含 `Int32`）。⇒ **种子标量 id 最小；非种子字段类型 id 必大于其宿主 object 行**。

**判词为什么只能出在"建到一半的表"上（把候选锁死的判据）**：
走到判词点前，`CompilerSnapshotProductionCandidateBuildUnsealedInto` 已在 `:11288` 调用过 `compilerSnapshotBuilderTypeFunctionProjectValidatedInto`（`:23558`），其中 `:24037` 调用 `compilerSnapshotBuilderTypeArenaBridgeStrictValidateInto`（`:16336`），逐行验证：
- arena 侧：`childTypeIds` 与 `traitPremiseTypeIds` 均 `>= 0` 且 `< arenaTypeCount`（`:16483-16505`、`:16568-16580`）；
- 表侧：最终表的 `argTypeIds/traitPremiseTypeIds` **等于** `typeIdByArenaTypeId[arena 值]`（同上）。

⇒ **出判词时，arena 与"最终表"都已被证明在界内**，且 premise == arg（`:5807-5816`）。能让同一个值越界的唯一剩余可能，就是**行空间比最终表小**的表。

**kd_r9y 的实跑序（静态管线序，全部可核）**：
`compiler_snapshot_lowering_bridge.cheng:4839` → builder `:11161` `CompilerSnapshotProductionCandidateBuildUnsealedInto`
→ `:11288` `...TypeFunctionProjectValidatedInto`（追加 arena 行 `:23908-23966` → 两趟派生 `:23974`/`:23999` → `:24011` canonicalize → `:24033` 顺序守卫 → **`:24037` bridge 严格校验（此处通过）** → `:24139` DeclKey finalizer → `:24208` `DeclarationAuthorityCommitInto`（**旧墙点**））
→ `:11341` `compilerSnapshotProductionTypedNodeProofRowsReplayInto`（`:6594`）→ `:6695` **`compilerSnapshotBuilderFinalTypeIdsByArenaTypeBuildInto`（`:6522`）**
→ 追加循环 `:6556`：**追加一行 + 立刻派生该行身份** → `:6574` `CsgCompilerTypeTraitProofCidInto(portable, arenaTypeId)`
→ schema `:5995` → `:5924` → `:5932` → **`:5934` 判词**。

**越界算术**：`:6554` 把空表赋给 `portable`，之后每轮只追加 1 行（`:14400-14409`）。第 i 轮时 `portable.types.typeCids.len == i + 1`；而 object 行的 premise 是字段行 TypeId（> i）⇒ `premise >= i+1` ⇒ 越界。**纯标量字段不触发**（种子 id 最小），**字段类型不是那 13 个种子标量的结构体必然触发**（定长数组、seq、对象、元组、泛型应用）。

---

## ② 既有还是新引入：**既有潜伏，首次可达**

- **判词点既有**：`git show HEAD:src/core/csg_core/compiler_snapshot_schema.cheng | grep -n "object trait premise out of range"` → `5932`；`git log -S` 唯一命中 `a7ee2da19`（2026-07-26）。13 件补丁里只有 `ptr_builtin_type_arena_representation` 动过该文件，且只动标量枚举与 `sendFlags`（`git diff` 见 +4/−2），与本判词点无关。
- **缺陷代码既有**：`git show HEAD:src/core/tooling/compiler_snapshot_builder.cheng` 的 `6554-6590`（site A）与 `25000-25036`（site B）与工作树**逐字相同**；`git diff -U0 src/core/tooling/compiler_snapshot_builder.cheng | grep '^@@'` 的 hunk 清单**不含** `6556-6590` 与 `25149-25171` 任一区间。arena 侧"先 reserve 后 intern"在 HEAD 的整林驱动里同样是 `:5838` → `:5846`。
- **为什么直到现在才可达**：该判词在管线里位于 `:24208` 的声明权威审计**之后**。kd_r9o–kd_r9w 四件全部死在 `:24208` 那条 `provisional Type DeclKey drift`，根本走不到 `:11341`。`declkey_finalizer_after_typeid_remap_fix` 把 finalizer 搬到 TypeId 重映射之后，清掉 `:24208`，第一次走到 `:11341` —— 与实测墙序（… → `provisional Type DeclKey drift` → 本判词）完全吻合。
- **回退哪一件会让判词消失（静态判定）**：**只有回退 `declkey_finalizer_after_typeid_remap_fix`**（退回 `provisional Type DeclKey drift`，即把墙盖回去，不是修好）。回退其余任何一件都不会让它消失，只会盖回更早的墙：`w40_textpath_module_const_fold` / `object_field_typearena_text_fixpoint` / `aggregate_zero_*` / `closure8_symbolid_from_index` / `pair2_typearena_symbol_ownership` / `ptr_builtin_type_arena_representation` / `s1b_step3l|3o|3p` / `forward_typeid_deferred_replay`(r3) / `typearena_pinned_capacity` / `tree_arena_column_census` / `local_symbol_domain_function_scoped` / `forward_decl_generic_window_index`。
- **需要的对照实验（若上游要动态确证）**：树上对 `declkey_finalizer_after_typeid_remap_fix` 做一次 `-R` 重烤四件，预期回到 `provisional Type DeclKey drift`（与 kd_r9w/r9o 记录逐字一致）。这是本报告唯一建议的对照；不改源文件也可用冻结副本方式做。

---

## ③ 前三候选 + 判别预测

### C1（本报告结论，已出补丁）portable 投影"行空间未建完就校验"
- file:line：`compiler_snapshot_builder.cheng:6556-6590`（site A，`compilerSnapshotBuilderFinalTypeIdsByArenaTypeBuildInto`，`:6522`）；孪生 `:25149-25171`（site B，全仓 grep 仅 `src/tests/compiler_snapshot_builder_smoke.cheng` / `zztmp_claude_bsmoke_probe.cheng` 可达，**不在 kd_r9y 路径上**）。
- 机理一句话：追加一行就立刻对该行做 trait/row 身份派生，`typeCids.len` 还只有 `i+1`，而 object 行的字段 TypeId 必 > `i`。
- 触发输入形态：任何 object/enum 的字段（或 enum payload）类型**不是 13 个种子标量**（定长数组 / seq / 对象 / 元组 / 泛型应用）；与 const、与 `int32[8]` 字面量长度无关（M-A 已证）。
- 改成什么才推进：先建满 `portable` 行空间，再按最终表同样的**两趟**升序派生（补丁即此）。
- 判错会先在哪条判词暴露：若两趟镜像不对，会先撞 `reference result canonical TypeId missing`（`:6588`）或 `portable TypeCid missing from final table`（`:25179`）；若一趟就够（我判错），症状是这两条之一，而不是本判词。

### C2（已被 ① 的 bridge 判据排除）arena 里 reserved 但未 fill 的聚合行（-1 占位逃逸）
- file:line：`typed_expr_type_arena.cheng:1425-1432`（占位 −1）、`:2166`（fill 的 fail-closed 守卫要求字段 TypeId ≥ 0）、`:9983-9993`（strict validate 要求 premise == child 且子行 ≥ 0）。
- 机理一句话：某 object 行的字段类型行被 deferred 且 replay 未补，`childTypeIds/premise` 停在 −1。
- 触发形态：字段类型声明在**更后面的源**（真前向跨源边），且重放没覆盖。
- 判错会先在哪条判词暴露：会在 site A 之前先报 `TypeArena trait premise bridge drift`（`:16579`）或 arena 的 `object field authority invalid`（`:2177`）。**本轮没有 ⇒ 排除**（但若将来出现这两条，C2 复活）。

### C3（同样已被排除）canonicalize 用负值索引重映射
- file:line：`:16651-16653`（`newTypeIdByOld[oldTypes.traitPremiseTypeIds[...]]`）。
- 机理一句话：主表 premise 若为负，这里越界读 `newTypeIdByOld[-1]` 得到垃圾大值，随后在 canonicalize 内部的再派生（`:16669-16682`）报本判词。
- 为何排除：主表派生循环 `:23974` 自己会先在**同一函数内**报同一条判词；且 `:24037` 的 bridge 校验已证明 arena 无负值、最终表 premise 全部落在 `[0, typeCids.len)`。

### 能区分候选的最小夹具（可直接落盘；槽位持有者照跑）
```cheng
# F1 = M-A：字段类型非种子标量（定长数组），零 const、字面量长度
type
    Slots =
        used: int32
        values: int32[8]

fn main(): int32 =
    var s: Slots
    s.values[0] = 7
    s.used = s.values[0]
    return s.used
```
```cheng
# F2 = 控制组：字段全是种子标量 ⇒ C1 预测「不报本句」
type
    Pair =
        x: int32
        y: int32

fn main(): int32 =
    var p: Pair
    p.x = 1
    p.y = 2
    return p.x + p.y
```
```cheng
# F3 = C2 判别：字段类型在「另一个源」里（真前向跨源边）。
#   lib.cheng:  type Slot = x: int32
#   main.cheng: import Slot + type Holder = h: Slot
# C1 预测：判词不变（仍是 object trait premise out of range）；
# 若改报 nominal declaration is not materialised / object field authority invalid ⇒ C2 复活。
```
```cheng
# F4 = 另一处同源缺口的派生预测（未验证）：三层嵌套 object 链，声明序 A、B、C
type
    A = b: B
    B = c: C
    C = n: int32

fn main(): int32 =
    var a: A
    a.b.c.n = 5
    return a.b.c.n
# 预测：两趟派生到不了不动点 ⇒ compiler snapshot builder: TypeId remap changed type identity（:16681）
# 这是「行序非依赖序」的第二个受害者，本次未修。
```

---

## ④ 补丁：`patches/object_trait_premise_portable_row_order.patch`（+44/−4，2 hunks）

- `git apply --check patches/object_trait_premise_portable_row_order.patch` → **exit 0**。
- 只动 `src/core/tooling/compiler_snapshot_builder.cheng`（**未碰 `parser.cheng`**，不与隐式泛型那一手冲突）；不改任何源文件本体。
- 内容：两个 portable 投影函数里把"追加一行 + 立刻派生"拆成「追加全部行」→「派生第 1 趟」→「派生第 2 趟（site A 附带规范化 TypeId 查表）」。
- **为什么这不是放宽守卫**：
  1. 派生函数（含 `csgCompilerIndexValid(premise, typeCids.len)` 这条判据）的调用**次数只增不减**（每行 2 次，原先 1 次），一条判据没删、没加容差、没加白名单；
  2. 变的只是判据右端 `typeCids.len` 从"建到一半"变成"整表" —— 这正是主表路径的语义（`:23974`/`:23999` 在 `:23908-23966` 全部追加之后才跑），也是 `:24037` bridge 刚证明过的语义；
  3. 行空间完整性另有既有判据兜底：`portable Type projection final coverage mismatch`（`:25400`）。
- **为什么必须两趟而不是一趟**：行身份 CID 的 preimage 含**子行 CID**（schema `:5738`、`:6030-6031`），主表就是"两趟升序"；一趟会给聚合行算出与主表不同的 CID，落地成 `... canonical TypeId missing`。两趟是**逐位镜像主表**，不是启发式。

---

## ⑤ 编译级自检（本轮已多次栽跟头，逐条做并留证）

① **标识符绑定**：机械核对两个插入块（共 4 个插入区间）用到的每个标识符，全部在同函数**插入点之前**已绑定/已是形参，且同函数作用域内；排除字段访问（`.` 后）与模块名后，脚本输出 4 处均为 `identifiers not declared earlier in the same fn: []`（涉及 `csg/portable/out/tables/typeSymbolIdByArenaTypeId/parserGenericRowByArenaTypeId/typeCids/traitProofCids` 等全部在 `:6522-6554` / `:25124-25148` 已声明）。**无"插入点之后才声明的 let/var"**。

② **缩进层级不切链**：插入块 = 4 空格 `#` 注释 + 两条 4 空格 `for`，紧跟 12 空格 `return false`（append 循环内 `if` 体的末尾）之后 —— 这是**收束** append 循环体、回到函数体层，与原文 `:6591` 的 `err = ""` 同一层级。两处插入点前后行分别是 `return false` / `var proofCid…` 与 `return false` / `setLen(finalTypeIdByArenaTypeId, ...)`，插入区间内**不存在** `if/elif/else` 归属行 ⇒ 不切断任何 `if/elif/else`/`for` 链或块体。15 空格的续行是既有对齐风格（原 `:6575` 同形），非块结构。

③ **不引用别的函数的局部**：两处 hunk 各自函数内自足，无跨函数标识符。

④ **自检抓到过一处真错并已修**：第一版生成器切片 `old[25172:]` 应为 `old[25171:]`，把 site B 的 `var finalTypeIdByArenaTypeId: int32[]` 连带删掉（undeclared variable）。现生成器带"被删行必须 ⊆ 两个循环内的派生行"的多重集判据 + 该声明必须仍在的断言，已通过。补丁应用后的文本已落到 `/tmp/_patched_builder.cheng` 供复核（**未写入仓库**）。

---

## ⑥ 未测项（诚实清单）

1. **未运行任何编译**（纪律）。"判词出在 site A（`:6556-6590`）而非 site B"是**静态管线序推定**（`:11288` 在 `:11341` 之前；site B 生产不可达），没有运行期坐标回执。
2. **两趟派生与最终表逐位一致**是推导（preimage 只读 immutable 结构 + 子行 CID；主表两趟同为升序且聚合子行在两趟间不变），未做运行期字节比对。
3. **清掉本墙后的下一道墙未知**。F4 的 `TypeId remap changed type identity` 是**派生预测**，未验证。
4. **M-B（纯标量 object）在 kd_r9y 上的实际读数未知**（它死在更早的墙），"纯标量不撞本句"来自机理（种子标量 id 最小 + `:5807-5816` 的 premise==arg 前置），**不是本炉实测**。
5. 判词在 `typeCids.len` 上的"上界"语义只在**同一 snapshot 内**成立；本报告不主张该判据本身有缺陷 —— 缺陷在"什么时候拿它去比"。
