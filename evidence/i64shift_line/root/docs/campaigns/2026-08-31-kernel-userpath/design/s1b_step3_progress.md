# S1b 第③步进度（接手轮 · 2026-09-11）—— arena 侧准备落地；门内并林墙**未动**

> 判词（本轮）：**STEP3 NOT ESTABLISHED**。理由：⑤⑥ 未做，默认 768MiB 门内仍是 `forest_appended=24` / `rss_limit_exceeded 832,308,448`（与 pre-step3 同位置同读数）。
> 本文件取代 `.rebuild/s1b_step3/VERDICT_step3.txt` 里那条 `NOT ESTABLISHED: non-equivalence`（DIFFER 轮旧判词，已被同驱动单侧复现判为**环境作废**）；新判词见 §7 与 `.rebuild/s1b_step3/VERDICT_step3.txt`（已覆盖）。

---

## 0. 一句话

本轮把 ⑦⑧（Seal 段树读 → arena 列）**重放进树**并补齐了「Seal 相彻底无树 + 权威相索引化（④）」所需的 arena 行列与转换，**判等价**（7 夹具 A/B 全 IDENTICAL）；但施工图的 ① ② ③ ⑤ ⑥（`state.*` Init 分配 / `AppendSource` 逐源 / `IndexFields` 游标 / 逐源驱动 / **删并林半段**）**未做**，所以门内的墙一格没动。本轮同时产出两条**决定 ⑥ 期望值的新实测事实**（§5）。

---

## 1. ①~⑧ 逐条完成度

| 步 | 内容 | 本轮状态 | 证据 |
|---|---|---|---|
| ⑦⑧ | Seal 段 7 处树读 → arena 列（含 `BuildObjectDeclaration`/`BuildTupleAliasMembers`/`BuildEnumDeclaration` 三大函数）+ `StrictValidateInto` 对齐 + 两处 0c 缺陷修复 | **已做（上一手），本轮重放进树** | `patches/s1b_1c_seal_arena.patch`（sha `ddf6948a…`, 33KB, 678 行）；本轮 `git apply --check` + `git apply` 成功；bake `rc=0`；A/B 全 IDENTICAL（§3） |
| ④ | 权威相索引化 | **已做** | `TypedExprTypeResolutionAuthority*` 全族（`DeclarationLess`/`KeyEqual`/`SortRoots`/`BeforeKey`/`FindDeclaration`/`DeclarationExportedInto`/`FindGenericSymbol`/`ResolveUnqualifiedInto`/`ResolveQualifiedInto`/`BuildPackageInto`）改读 arena 列；树入口 `…BuildPackageForestInto` 改为「scratch arena → arena 权威」包装，**调用点签名不变**（20+ 测试调用点零改动） |
| ① | `state.*` 按 `index.typeSyntaxCount` 在 Init 期分配 | **未做** | `state.symbolByDeclarationRoot`/`IndexFields` 等仍按 `tree.typeSyntaxCount`（整林驱动下数值相同） |
| ② | `AppendSource` 增 `producerSourceIndex` 形参 + 逐源 `FillTypeSyntax` | **未做**（但前置已备齐） | `FillTypeSyntax` 的四个 view base / `viewTokenBase` 形参、逐源 producer-source 列、`typeSyntaxNameTokenIndexes` 等新列均已就位；**尚无逐源调用者** |
| ③ | `IndexFields` 的 `fieldCount` 游标跨源持久 | **未做** | `IndexFields` 一字未改 |
| ⑤ | 逐源驱动 | **未做** | `compiler_csg.cheng` 仍 `129/29`，一个字节没动 |
| ⑥ | 删并林半段 `:33130`→`:33136`→`:33251` | **未做** | 同上 |

**为什么没做 ⑤⑥**：① ② ③ ⑤ ⑥ 是**同一个原子切换**（施工图 §1.2 / §1.2-S1b-1），⑤ 需要 ①②③，⑥ 又必须与 ⑤ 同步落地（先删并林就没有任何东西填 arena）。本轮预算只够把「arena 侧准备」做成**可独立判等价**的一段，按纪律收在已验证态而不是留半流式。

---

## 2. 改动前后代码原文（arena 侧准备）

完整 patch：`patches/s1b_1c_arena_prep.patch`（sha `aee3dde6…`，+578/−280，46 hunk），**叠加在** `s1b_1c_seal_arena.patch` 之上。组合后 `typed_expr_type_arena.cheng` = `1350/387`（sha `0a9236c7…`）。逐项：

### 2.1 新增 arena 列（纯加，且**一律不进** `typedExprTypeArenaHashMaterialized`）

改前（struct 尾部）：
```
        typeSyntaxOwnerTokenTexts: str[]
        typeSyntaxNameTokenTexts: str[]
        typeSyntaxDeclarationOwnerTokenTexts: str[]
        typeSyntaxEnumVariantNameTokenTexts: str[]
```
改后追加：
```
        typeSyntaxNameTokenIndexes: arenamod.ArenaArrayInt32
        typeSyntaxFixedLengths: arenamod.ArenaArrayInt32
        typeSyntaxBracketConstLengths: arenamod.ArenaArrayInt32
        genericSymbolNameTokenTexts: str[]
        declarationCount: int32
        declarationKinds: arenamod.ArenaArrayInt32
        declarationTypeSyntaxRootIndexes: arenamod.ArenaArrayInt32
        declarationExportedFlags: arenamod.ArenaArrayInt32
```
- **hash 枚举表核对（红线）**：实读 `typedExprTypeArenaHashMaterialized`（`:816-1025`），上述 8 列**全部未出现**（脚本断言输出 `not hashed`）⇒ `artifactRaw32` 不受扰动。
- `typeSyntaxBracketConstLengths` 是**在 append 相就地求值**的：`ParserValueExprTypeConstExprEvaluateInto` 是树遍历，Seal 相不能调；求值条件是原 `typedExprTypeArenaBracketConstLength` 的同一条件（`bracketArgCount==1 && bracketArgTypeNode<0 && eval>0`），不满足记 `-1`，与原实现的 `false` 一一对应。

### 2.2 Seal 相彻底无树

改前（`typedExprTypeArenaInternSyntaxRec`，节选）：
```
fn typedExprTypeArenaInternSyntaxRec(
        value: var TypedExprTypeArena,
        tree: parser.ParserValueExprTree,
        ...):
        if typeSyntaxNodeIndex >= tree.typeSyntaxCount:
        let kind = parser.ParserValueExprTypeSyntaxKindAt(tree, typeSyntaxNodeIndex)
        let childCount = parser.ParserValueExprTypeSyntaxChildCountAt(tree, typeSyntaxNodeIndex)
```
改后：
```
fn typedExprTypeArenaInternSyntaxRec(
        value: var TypedExprTypeArena,          # tree 形参已删除
        ...):
        if typeSyntaxNodeIndex >= value.typeSyntaxCount:
        let kind = typedExprTypeArenaSyntaxKindAt(value, typeSyntaxNodeIndex)
        let childCount = typedExprTypeArenaSyntaxChildCountAt(value, typeSyntaxNodeIndex)
```
同批转换：`ResolveNominal`（名 token 行 + 名文本表 + 泛型符号名文本）、`FunctionParamCount`（token 列扫描）、`TupleChildNameId`（owner token 文本表）、`CompleteGenericArgumentsInto`、`BracketConstLength` 调用点（→ 列读）。转换后 `InternSyntaxRec` 体内 `tree` 命中 **0**（仅剩注释词），故删形参。

### 2.3 权威相（④）：`tree` → `value`

以 `FindGenericSymbol` 为例：
```
改前: parser.ParserValueExprTypeSyntaxGenericSymbolStartAt(tree, root)
      parser.ParserValueExprTokenText(tree, genericNameToken) != name
改后: typedExprTypeArenaSyntaxGenericSymbolStartAt(value, root)
      typedExprTypeArenaGenericSymbolNameTokenTextAt(value, genericRow) != name
```
树入口保留语义：
```
fn TypedExprTypeResolutionAuthorityBuildPackageForestInto(tree, imports, out, err): bool =
    var scratch: TypedExprTypeArena
    if !TypedExprTypeArenaSyntaxColumnsFromTreeInto(tree, scratch, err): return false
    let built = TypedExprTypeResolutionAuthorityBuildPackageInto(scratch, imports, out, buildErr)
    TypedExprTypeArenaRelease(scratch)
```
⇒ `src/tests/*.smoke.cheng` 的 20+ 调用点、`compiler_snapshot_builder_smoke` 等**全部不需要改**。

### 2.4 驱动拆分（为 ⑤ 铺路，本轮不改行为）

`TypedExprTypeArenaBuildFromParserTreeInto` 的 append 半段抽成 `TypedExprTypeArenaSyntaxColumnsFromTreeInto`（Init 计数 + 六个 Fill* + 新增 `FillDeclarations`），Seal 半段原样保留；整林驱动 = 这两段串联，`rc=0` 且产物逐字节不变。

---

## 3. 每轮命令 + 原始输出（rc / lease_hits / 驱动 sha）

全部原始件在 `.rebuild/s1b_step3/`，`MANIFEST.sha256` 列全部 sha。

### 3.1 重放 ⑦⑧
```
git apply --check docs/campaigns/2026-08-31-kernel-userpath/patches/s1b_1c_seal_arena.patch   # rc=0
git apply        docs/campaigns/2026-08-31-kernel-userpath/patches/s1b_1c_seal_arena.patch   # rc=0
python3 .../check_no_inline_comment_after_or.py <三文件>   # OK: no comment follows a `||` line
```

### 3.2 bake（自举编译，`cheng_cold_v3` → `kd_*`）
| 轮 | 命令要点 | rc | wall | lease_hits | kd sha256 |
|---|---|---|---|---|---|
| bake_a1 | `cheng_cold_v3 system-link-exec --in:src/core/tooling/backend_driver_dispatch_min.cheng`（首次，含我自己引入的 arity 错误） | **2** | — | 0 | none |
| bake_a2 | 同上（修 arity 后） | **0** | 222s | 0 | `3071ff75e555ad98dfa5b482b5e4a3883cdb45f1456ecab0a22cbda2d3df00fe` |

- **bake_a1 定性：补丁编译错误**（`rc=2` + `lease_hits=0` + 原文直指本轮新增源码）。末行原文：
```
cheng_cold: ??? unresolved function call 'typearena.typedExprTypeArenaTupleChildNameId'
cheng_cold:   body=typedExprTypeArenaInternSyntaxRec
cheng_cold:   candidate[9620] arity=3 ret=int32 param[0]=kind:9 size=8 type=var typearena.TypedExprTypeArena ...
[cheng_cold] primary object emit failed
```
真因：转换时把 3 参调用写成 2 参（`out` 恒等于 `value`，故直接把 `out` 形参删掉、用 `value.internPool`），一次修掉。原始件 `bake_a1.log`。
- A 侧驱动 `kd_prev` sha `7dda4868c73257e1199067da8bdf73d4a56879714dee8e89036b35aacce19ba2`（= 上一手 A 侧同值，未漂移）。

### 3.3 等价 A/B（同 `--in` 同 `--out`，A=`kd_prev`，B=`kd_a2`）
脚本 `.rebuild/s1b_step3/ab_arena_prep.sh`，原始输出 `ab_arena_prep.txt`、per-side stderr 同名 `.prev.txt`/`.a2.txt`。

| 夹具 | prev rc | a2 rc | lease_hits | 判词 |
|---|---|---|---|---|
| ordinary_zero_exit_fixture | 0 | 0 | 0 / 0 | **CMP=IDENTICAL**（`9e6d8774…`） |
| call_fixture | 0 | 0 | 0 / 0 | **CMP=IDENTICAL**（`cd1329f8…`） |
| cold_nested_fmt_interpolation_smoke | 0 | 0 | 0 / 0 | **CMP=IDENTICAL**（`26eaebd6…`） |
| v6_direct1_repro | 0 | 0 | 0 / 0 | **CMP=IDENTICAL**（`98028d5b…`） |
| pair2（2 源） | 2 | 2 | 0 / 0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |
| arena_shapes（object+payload enum+tuple alias） | 2 | 2 | 0 / 0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |
| closure8（8 源） | 2 | 2 | 0 / 0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |

末行原文逐字相同（各例只列一次）：
```
pair2        :  compiler snapshot builder: portable TypeArena Symbol join duplicate
arena_shapes : parser type syntax: enum variant trailing syntax invalid
closure8     :  compiler parser receipt: normalized expression parser node missing exprIndex=5 kind=1 line=50 surface=if rootNode=-1 originNode=-1 role=0
```
⇒ 7/7 等价（4 例逐字节同物，3 例同为 rc=2 且判词原文相同）。**作废轮 0、租约撞车 0、环境作废 0。**

---

## 4. 门内全量实测

**本轮未产出新的门内读数**：⑤⑥ 未做，默认门内的墙（并林 pass1 src=24）在本轮改动下**逐位不变**（arena 是在并林之后才构建的，本轮全部改动都落在它之后；这一点由 §3.3 的等价判词与 §2 的「不进 hash 表」共同保证）。

pre-step3 同位置基准（`.rebuild/s1b_step3/gate/default768_verified.summary.txt`，driver `kd_prev`，门=默认 768MiB，`lease_hits=0`）：

| 量 | pre-step3 基准 | 本轮 |
|---|---|---|
| `forest_parsed_lines` | 234（pass0 全跑完） | 未重跑 |
| `forest_appended_lines` | **24**（死在并林 pass1 src=24） | 未重跑（不可变） |
| 守卫读数 | `rss_limit_exceeded rss_bytes=832,308,448 > limit=805,306,368` | — |
| `max_rss` | **830,637,280** | — |
| 保底 rss（`after_profile_source_payload_release`） | **490,062,784** | — |
| `max_live` / 墙钟 | 3,958,941 / 396s | — |

**森林窗 `after_profile_lookup since_ms`**：`default768_verified.stderr.txt` 中该 stage 行未出现（该轮在 `after_profile_lookup` 之前就撞门），故此项**无读数**，不是 0。

---

## 5. 本轮两条决定性新事实（③ 期望值的算术）

### 5.1 【实测】pass0 自身的峰值已经顶到门上沿，且此时**零累积**

从 `default768_verified.stderr.txt` 逐源 `forest_parse_end pass=0` 解析：

- **pass0 峰值 rss = 754,222,184 B（719.3 MiB）@ src=170**（该源 arena 59.5 MiB，Δrss +196 MB）。
- pass0 收尾 rss = 665,764,896 B（634.9 MiB）——**parse+release 之后仍比开局高 175 MB**（堆碎片，不是泄漏：`live` 会回落）。
- pass0 纯 parse 时间合计 = 47,342 ms（234 源）。
- **全林总字节 = 1,292,606,112 B（1,232.7 MiB）**（逐源 arena 求和）⇒ 现行两遍并林在 768 MiB 门内**结构上不可能**。
- 门内余量 = 805,306,368 − 754,222,184 = **51,084,184 B（48.7 MiB）**。

⇒ **任何方案的峰值 ≈ pass0 峰值 + 已累积 arena**。src=170 时 arena 已累积约 7 成 ⇒ 流式方案的峰值 ≈ 719 MiB + 0.7×arena_total；`arena_total` 一超过 ~85 MiB 就越门。

### 5.2 【实测代码路径】`ArenaArrayInt32Add` 是 doubling ⇒ arena `used ≈ 2×` 最终数据量

`src/core/runtime/arena.cheng:373-398`：`len >= capacity` 时 `newCap = capacity*2`（起手 8），**在 bump 顶新开块并逐元素拷贝，旧块原地留作垃圾**。六个 `Fill*` 族全部走 `Add` ⇒ 每列垃圾 ≈ 该列最终大小 ⇒ arena `used` ≈ 2× 有效数据，而**垃圾页是写过的、进 `phys_footprint`**。

**消法（本轮实测 API，不是推测）**：`ArenaArrayInt32ReserveEmpty`（`arena.cheng:316`）+ `ArenaArrayInt32AddReserved`（`:336`）已存在；因为 `Add` 只在 `len >= capacity` 时 grow，**先 `ReserveEmpty` 预分配列容量，再照常走 `Add` 就永不 grow** ⇒ 垃圾归零，且**六个 `Fill*` 族零改写**（红线不动）。所需总数（`tokenCount`/`functionCount`/`genericSymbolCount`/`genericSymbolChildCount`/`bracketArgCount`/`enumVariantCount` + 各 CSR 载荷数）目前**不在** `TypedExprTypeDeclarationIndex` 里（它只带 `typeSyntaxCount`/`declarationCount`），需要像 `typeSyntaxBaseBySource` 那样在 pass0 逐源补记——这就是 ①「按索引总数在 Init 期分配」要一起做的事。

### 5.3 【diagnostic】抬门诊断（`CHENG_PARENT_RSS_GUARD=1`，非验收）

见 §5.4（数字由 `diag_raised_gate.sh` 产出，标注 `diagnostic`）。

### 5.4 抬门诊断：**未跑完**（diagnostic），只给出上界与算术判词

脚本 `.rebuild/s1b_step3/diag_raised_gate.sh`（`CHENG_PARENT_RSS_GUARD=1`，**diagnostic，非验收**）：

- 09:47 起跑，**35 分钟只推进到并林 pass1 `src=60`**，此时 `rss=1,151,813,096 B（1.07 GiB）`——**只吃掉 1/4 的源就已越门 43%**；
- 并林成本超线性（逐源拷贝 + doubling），按该速率跑完全林（1,232.7 MiB）需数小时，本轮预算内不可得 ⇒ **主动终止**（`job_kill` + `pkill`），不留半截结论。原始件：`diag/raised_gate_kd_prev.stderr.txt`（rc 由 `timeout` 中断，`lease_hits=0`，末行 `csg_stage=after_profile_source_payload_release since_ms=28410 rss_bytes=484770752 live_allocations=1473084`）。
- 后果：该轮**没有**产出 `tag=type_arena` ⇒ **234 源 TypeArena 的真实 `used`/`tokens` 本轮未测得**（是缺口，不是 0）。

替代测量（同一 diagnostic 口径，正常门下）：`src/tests/typed_expr_type_arena_smoke.cheng`（32,186 B，闭包 29 源）⇒ `decl_index entries=178 sources=29 type_syntax=18649 declarations=20174 verified=1`，但 `rc=1`，末行 `typed expr: frozen module const query before build-index seal source=src/std/bytes_layout.cheng name=FixedBytes32Size`（既有缺陷）⇒ **在 Finalize 之前失败，仍无 `type_arena` 读数**。

⇒ 只能给**结构估算**（明确标为估算，不是实测）：

| 项 | 值 | 来源 |
|---|---|---|
| 每 token | 16 B（4 个 int32 列） | struct 实读 |
| token 总数 | 源字节 / 5.6 ⇒ 234 源 33.3 MB ⇒ ≈ 5.4M | 四例夹具 `tokens` vs `forest src=0 bytes` 实读 |
| token 列合计 | ≈ **86 MiB** | 上式 |
| 每 TypeSyntax 行 | 23 个 int32 列 + 3 张 `str` 文本表 ≈ **148 B** | struct 逐列计数 |
| TypeSyntax 行数 | 未测；外推 20 万~50 万 ⇒ 28~70 MiB | 外推（弱） |
| **arena_total** | **≈ 115~155 MiB** | 估算 |

**算术判词：不能确认"能进"——按现有证据估算越门 20~60 MiB。**

```
流式峰值 ≈ pass0 峰值 754,222,184 B + 0.7 × arena_total
         ≈ 754 MB + 0.7×(115~155 MB) = 834~863 MB   >  门 805,306,368 B（超 29~58 MiB）
乐观口径（碎片被 arena 复用一部分）       ≈ 790~810 MB   —— 余量个位数 MiB，等于贴着门过
```

**风险披露（按父席要求）**：即便乐观口径成立，**余量只有个位数 MiB**，含义是——任何一个源文件长几 KB、任何一处多留一个临时数组，就会从"过"翻成"不过"；这种状态不能当"已达标"用。

⇒ **⑥ 单独不足以达标**。与 ⑥ 同时必须做的两件事（按杠杆排序）：

1. **削保底/尖峰**：`src=170` 那一档 parse 瞬时尖峰 **+196 MB**（arena 59.5 MiB 的源把 rss 顶到 719 MiB）——这是 264 MB「parse 通胀」里最大的一笔；或
2. **降 490 MiB 保底**（`after_profile_source_payload_release`）：它才是墙的主体，任何"只删并林"的方案都只能在这 315 MiB 余量里做文章；
3. Init 期预分配列（§5.2）是**必要不充分条件**：不做必挂（垃圾 ×2 ⇒ 再 +100 MiB），做了也只是把上面那笔账从"超 100+ MiB"压到"超 20~60 MiB"。

---

## 6. 纪律回执

- **patch 通道**：全程 `diff → git apply --check → git apply`，无 `cp` 整文件、无 `git checkout --`/`restore`/`stash`。
- **`git diff --numstat`（本轮各节点，实读）**：
  | 节点 | `typed_expr.cheng` | `typed_expr_type_arena.cheng` | `compiler_csg.cheng` | type_arena sha |
  |---|---|---|---|---|
  | 起点（交接态） | 56/23 | **450/1** | 129/29 | `8b8332ee…` |
  | + ⑦⑧（1c_seal） | 56/23 | 775/110 | 129/29 | `bc9f4864…`（与上一手 `round.log` 记的 `step3 tarena=bc9f4864…` **逐位相同**） |
  | + arena 侧准备 | 56/23 | **1350/387** | 129/29 | `0a9236c7…` |
  | **收尾（本轮交付态）** | 56/23 | **450/1** | 129/29 | **`8b8332ee…`** |
- **patch 链可组合性（`converge.sh` 实跑，原始输出 `converge.log`）**：`-R prep` ⇒ 775/110（`bc9f4864…`）；`-R 1c_seal` ⇒ 450/1（`8b8332ee…`）；正向 `+1c_seal +prep` ⇒ 1350/387（`0a9236c7…`）；再 `-R` 两件 ⇒ 450/1。⇒ 两件互不重叠、可任意独立增删；**交付态 = 已验证基线 + 两件 patch**。
- **锁**：`.rebuild/COMPILE_SLOT.lock` 全程持有（`owner.txt` 写活 pid，非死 pid）；三份编译 stderr 实测 `parent lease unavailable` **0 次**。**收尾已释放**（kill 持有者 + 删锁目录），因为交付态是「已验证基线 + 两件 patch」，不是 reverted 中间态。
- **作废轮三分类（每条留 rc / lease_hits / 末行原文）**：
  | 轮 | rc | lease_hits | 末行原文 | 定性 |
  |---|---|---|---|---|
  | `bake_a1` | 2 | 0 | `cheng_cold: ??? unresolved function call 'typearena.typedExprTypeArenaTupleChildNameId'` … `[cheng_cold] primary object emit failed` | **补丁编译错误**（原文指向本轮新增源码，一次修掉） |
  | `diag_run`（诊断脚本首次启动） | 1 | — | `bash: .rebuild/s1b_step3/diag/diag.log: No such file or directory` | **脚本自身缺陷**（重定向目标目录未建），非编译轮、不计入作废 |
  | `diag/raised_gate_kd_prev`（抬门诊断） | 中断 | 0 | `csg_stage=after_profile_source_payload_release since_ms=28410 rss_bytes=484770752 live_allocations=1473084` | **主动终止的诊断轮**（36 分钟只到 `src=60`、rss 1.07 GiB），**不是**验收轮、**不是**作废三分类中的任何一类 |
  **环境作废 0、租约撞车 0。**
- **语言坑**：改完即跑 `patches/check_no_inline_comment_after_or.py`（三文件）→ `OK: no comment follows a \`||\` line in 3 file(s)`。
- **抬门标注**：本轮唯一一次抬门 = `CHENG_PARENT_RSS_GUARD=1` 的诊断，全部产物在 `.rebuild/s1b_step3/diag/`，文件与本节一律标 `diagnostic`；**未据此宣称任何达标**。
- **未 commit / 未 push / 未建分支或 worktree**；`.rebuild` 全部产物已入 `MANIFEST.sha256`（163 件 + 2 个 kd 二进制）。

---

## 7. 判词

```
STEP3 NOT ESTABLISHED
```
- **直接卡点**：默认 768MiB 门内，`compiler_csg.cheng` 并林 pass1 **src=24**，`resource_guard rss_limit_exceeded rss_bytes=832,308,448 limit=805,306,368`（与 pre-step3 同位置同读数；⑤⑥ 未做）。
- **取代关系**：本判词取代 `.rebuild/s1b_step3/VERDICT_step3.txt` 原内容 `00:45:18 VERDICT: STEP3 NOT ESTABLISHED: non-equivalence`。那条属 DIFFER 轮，已由同驱动单侧复现判为**环境作废**（A 侧死于 `805,569,640`，超门 0.03%；同驱动重跑两侧逐字节 `8b47df81…`）；两代判词**不得并存**，`VERDICT_step3.txt` 已改写为本文判词 + 取代说明。
- **本轮新增的、比判词更要紧的一句**（§5.4 算术）：**⑥ 删掉并林后，"能进门"仍需 §5.4 的账成立；按现有实测与结构估算，流式峰值 ≈ 834~863 MB，超门 29~58 MiB。**

---

## 8. 未完成项与下一步最小动作

**本轮收敛态（交付态，实读）**：树 = **已验证基线**（`typed_expr 56/23`、`type_arena 450/1` sha `8b8332ee…`、`compiler_csg 129/29`）；本轮全部工作以**两件 patch** 固化在 `docs/campaigns/2026-08-31-kernel-userpath/patches/`：
- `s1b_1c_seal_arena.patch`（sha `ddf6948a…`，⑦⑧，上一手产物，本轮重放验证）
- `s1b_1c_arena_prep.patch`（sha `aee3dde6…`，+578/−280，46 hunk，本轮产物：④ 权威相索引化 + Seal 相无树 + 8 个新 arena 列 + 驱动拆分）

两件按序 apply 后 = `type_arena 1350/387`（sha `0a9236c7…`），已判等价（§3.3）。

**未完成**：① ② ③ ⑤ ⑥（同一原子切换）。

**下一步最小动作（按依赖序，全部锚点已按改动后工作树复核）**：

1. **扩 `TypedExprTypeDeclarationIndex`**：pass0 逐源补记 `tokenCountBySource`/`functionCountBySource`/`genericSymbolCountBySource`/`genericSymbolChildCountBySource`/`bracketArgCountBySource`/`enumVariantCountBySource` + 各 CSR 载荷总数（`TypedExprTypeDeclarationIndexBuildSourceInto`，工作树 `:3724` 一带）。
2. **arena Init 预分配列**（消 §5.2 的 2× 垃圾）：在 `TypedExprTypeArenaSyntaxColumnsFromTreeInto`（`:3502`）按上面总数对每列 `ArenaArrayInt32ReserveEmpty`；六个 `Fill*` 不动。
3. **①③**：`state.*` 按 `index.typeSyntaxCount` 全局分配（`:6662` 一带）；`IndexFields` 的 `fieldCount` 分配游标跨源持久（`:3953` 一带）。
4. **②**：`FillTypeSyntax` 逐源调用（`viewProducerSourceIndex` 写 `typeSyntaxProducerSourceIndexes`，**必须写循环下标**）+ 补三处尚未 rebase 的坐标：`typeSyntaxBracketArgStarts`（源内 → 全局 bracket-arg 基）、`FillBracketArgs` 的 `typeSyntaxBracketArgTypeNodeIndexes`（当前**完全没 rebase**，见 `:5800` 一带）、`FillGenericSymbols/Children` 的 typeSyntax/泛型子行坐标、`FillFunctions` 的函数行基址（它按绝对 `functionRow` 索引 `value.functionCount`，与其它 Fill* 不同，**必须加 `viewFunctionBase`**）。
5. **⑤**：`compiler_csg.cheng` 单遍驱动（:33130→:33251 整段：pass0 只测 pass1 换成「parse → 建 decl index → 逐源 append arena → 逐源 call-declaration index → release」），**同一步内删并林半段（⑥）**；`out`（`typeArenaParserForest`）随之消失，三个消费者替换为：decl index 逐源校验（`TypedExprTypeDeclarationIndexVerifySourceAgainstInto` 已存在）、authority 走 `TypedExprTypeResolutionAuthorityBuildPackageInto`（本轮已就绪）、context lookup 逐源（`TypedExprBuildIndexAppendContextCallDeclarationsManual` 已按源签名，S1b-0d 的 `producerFunctionBase` 就位）。
6. **门内判据**：`forest_appended=234` 且无 `rss_limit_exceeded`。**先看 §5.4 的诊断算术**：若 `arena_total` 使峰值越门，则 ⑥ 单独不足以达标，需要同时降保底（490 MiB）或削峰值（parse 侧，`src=170` 的 +196 MB 尖峰）。

---

# S1b 第③步 · 第三手（2026-09-11 12:xx）—— ① ② 落地并判等价；**234 源 TypeArena 缺口已实测闭合**；判词仍 NOT ESTABLISHED

> 判词（本轮）：**STEP3 NOT ESTABLISHED**（理由：③④⑤⑥ 未做，默认门内无 `forest_appended=234`；且本轮实测到**环境漂移**使默认门在当前机器上连未改动的基线编译器都过不去，见 §9.5）。**本轮不是"非等价"**：7/7 夹具 A/B 全部等价（§9.4）。
> 本条**取代** §7 与 `.rebuild/s1b_step3/VERDICT_step3.txt` 的上一代判词；两代不得并存，`VERDICT_step3.txt` 已改写。

## 9.0 一句话

本轮做完 **①（decl-index 逐源列计数）** 与 **②（arena Init 精确预分配，消 doubling 垃圾）**，两者合为一件事**判等价（7/7）**；并**首次拿到 234 源的 TypeArena 列精确总量**——`column_bytes = 70,931,312 B`，把上一手 115~155 MiB 的估算一次性证伪（实测为估算的 **0.44~0.59×**）。③④⑤⑥ 未做。

## 9.1 六项逐条完成度

| 步 | 内容 | 本轮状态 | 证据 |
|---|---|---|---|
| ① | `TypedExprTypeDeclarationIndex` 补记 token/typeSyntaxChild/enumVariant/declarationSymbol/function/bracketArg/genericSymbol/genericSymbolChild **逐源计数** | **已做** | `patches/s1b_step3b_limits.patch`（sha `c83ca984…`, +425/−2, 6 hunk）；`ta_limits` 埋点实测产出（§9.3.3） |
| ② | arena Init 期按精确总数 `ArenaArrayInt32ReserveEmpty` 预分配列（消 doubling 前置） | **已做** | 62 列全部预分配；A/B 判等价；同轮 `type_arena used` 实测下降 19.7%~37.0%（§9.4.2） |
| ③ | `state.*` 全局分配 + `IndexFields` 游标跨源持久 | **未做** | 逐源驱动不存在，游标无第二调用者；做成纯改签名对整林驱动是恒等变换，无可测收益 |
| ④ | 逐源 `FillTypeSyntax` + 四处坐标 rebase | **未做** | 同上 |
| ⑤ | 逐源驱动（compiler_csg 单遍） | **未做** | `compiler_csg` 仍 `129/29`（交付态） |
| ⑥ | 删并林半段 | **未做** | 未做 ⑤ 时删它没有任何东西填 arena |

**为什么停在 ①②**：本轮先做的是"**决定 ③④⑤⑥ 是否值得做**"的那件事。实测（§9.5）给出结论：**② 是最大的一把杠杆（值 65~194 MB），但它把流式峰值压到 `819,036,575 B`，仍超默认门 `13,730,207 B`**。⇒ ⑥ 单独仍不达标这一结论**成立且被量化**，缺口从上一手估算的 29~58 MiB 收窄到 **13.1 MiB**。

## 9.2 改动前后原文

完整 patch：`patches/s1b_step3b_limits.patch`（sha `c83ca9842cefb15be4d646183f9b44b02693fe2df8966a50c0bf84540e97aac0`，+425/−2，6 hunk）。改后 `typed_expr_type_arena.cheng` = `863/3`（sha `f2f43593…`），`compiler_csg.cheng` = `141/29`（sha `99f1837e…`）；`typed_expr.cheng` 零改动（`56/23`）。

### 9.2.1 ①（typed_expr_type_arena.cheng，索引结构）
改前：
```
    TypedExprTypeDeclarationIndex =
        producerSourceIndexes: int32[]
        ...
        typeSyntaxBaseBySource: int32[]
        declarationBaseBySource: int32[]
        producerSourceCount: int32
        typeSyntaxCount: int32
        declarationCount: int32
        sealed: bool
```
改后追加 8 列（逐源，逐源序与 `typeSyntaxBaseBySource` 完全一致）：
```
        tokenCountBySource: int32[]
        typeSyntaxChildCountBySource: int32[]
        enumVariantCountBySource: int32[]
        declarationSymbolCountBySource: int32[]
        functionCountBySource: int32[]
        bracketArgCountBySource: int32[]
        genericSymbolCountBySource: int32[]
        genericSymbolChildCountBySource: int32[]
```
填充点 = `TypedExprTypeDeclarationIndexBuildSourceInto`（单源树仍在手时），读数一律取**该源自己的权威数组**：
```
    add(out.tokenCountBySource, tree.tokenCount)
    add(out.typeSyntaxChildCountBySource, tree.typeSyntaxChildCount)
    add(out.enumVariantCountBySource, tree.typeEnumVariantCount)
    add(out.declarationSymbolCountBySource, declarationSymbolCount)
    add(out.functionCountBySource, tree.declarationFunctionCount)
    add(out.bracketArgCountBySource, tree.typeSyntaxBracketArgCount)
    add(out.genericSymbolCountBySource, tree.typeGenericSymbolCount)
    add(out.genericSymbolChildCountBySource, tree.typeGenericSymbolChildCount)
```
唯一没有标量字段的是 `declarationSymbolCount`，用**同一个纯谓词**再走一遍同样的行区间求得（不是估算）：
```
    var declarationSymbolCount: int32
    for symbolRoot in 0..<tree.typeSyntaxCount:
        if typedExprTypeArenaDeclarationCreatesSymbol(tree, symbolRoot):
            declarationSymbolCount = declarationSymbolCount + 1
```
新增类型 `TypedExprTypeArenaLimits` + 两个**同源**求法 `TypedExprTypeArenaLimitsFromTreeInto`（整林，读 tree 字段与 CSR 载荷列长）与 `TypedExprTypeArenaLimitsFromIndexInto`（逐源，上面 8 列求和），两者的列清单集中在 `TypedExprTypeArenaLimitsColumnRows`：
```
    rows = rows + Int64(limits.tokenCount) * Int64(4)
    rows = rows + Int64(limits.typeSyntaxCount) * Int64(20)
    rows = rows + Int64(limits.typeSyntaxChildCount)
    rows = rows + Int64(limits.enumVariantCount) * Int64(5)
    rows = rows + Int64(limits.declarationSymbolCount) * Int64(6)
    rows = rows + Int64(limits.functionCount) * Int64(5)
    rows = rows + Int64(limits.producerSourceCount) * Int64(2)
    rows = rows + Int64(limits.bracketArgCount) * Int64(3)
    rows = rows + Int64(limits.genericSymbolCount) * Int64(14)
    rows = rows + Int64(limits.genericSymbolChildCount) * Int64(2)
```
（`compiler_csg.cheng` 侧只在 pass0 seal 处加 12 行埋点，见 §9.3.3。）

### 9.2.2 ②（typed_expr_type_arena.cheng，Init 预分配）
改前（`TypedExprTypeArenaBuildFromParserTreeInto`，`value.bracketArgCount = …` 之后直接进 Fill）：
```
    value.bracketArgCount = tree.typeSyntaxBracketArgCount
    typedExprTypeArenaFillTokens(value, tree)
```
改后：
```
    value.bracketArgCount = tree.typeSyntaxBracketArgCount
    # [S1b step-3 (2)] Reserve the appended columns at their exact final
    # length before the first Add, so no Fill* column ever takes the doubling
    # grow branch.  Everything below fills the same values into the same rows.
    var limits: TypedExprTypeArenaLimits
    if !TypedExprTypeArenaLimitsFromTreeInto(tree, limits, err):
        TypedExprTypeArenaRelease(value)
        return false
    typedExprTypeArenaReserveColumns(value, limits)
    typedExprTypeArenaFillTokens(value, tree)
```
`typedExprTypeArenaReserveColumns` 逐列 62 次，形态统一（例）：
```
    value.tokenProducerSourceIndexes = typedExprTypeArenaReserveColumn(
        value.arena, limits.tokenCount, "tokenProducerSourceIndexes")
```
```
@borrows
fn typedExprTypeArenaReserveColumn(
        arena: var arenamod.Arena,
        capacity: int32,
        columnName: str): arenamod.ArenaArrayInt32 =
    var out: arenamod.ArenaArrayInt32
    if capacity < 0:
        panic(Fmt"typed expr type arena: negative column reserve column={columnName} capacity={capacity}")
    if !arenamod.ArenaArrayInt32ReserveEmpty(arena, out, capacity):
        panic(Fmt"typed expr type arena: column reserve failed column={columnName} capacity={capacity}")
    return out
```
**红线核对**：① 62 列清单 = 4 token + 20 逐 TypeSyntax 行 + 1 child 载荷 + 5 enum variant + 6 declaration Symbol + 5 function + 2 function source CSR + 3 bracketArg + 14 genericSymbol + 2 genericSymbolChild，与六个 `Fill*` 族里 148 处 `ArenaArrayInt32Add` 的**被写列集合逐列同名**（脚本 `cols2.py` 枚举，无遗漏无多余）。**六个 `Fill*` 族零改写**——脚本逐函数比对本 patch 前后体文本：`FillTokens` 24 行 / `FillTypeSyntax` 209 行 / `FillFunctions` 106 行 / `FillBracketArgs` 25 行 / `FillGenericSymbols` 83 行 / `FillGenericSymbolChildren` 15 行 / `FillDeclarationSymbols` 61 行，`identical_body=True` × 7、**改动行落在这些函数体内 = 0**；新列**一律不进** `typedExprTypeArenaHashMaterialized`（本 patch 未触碰该函数：基线 `typedExprTypeArenaHashMaterialized` 体 = `:441-649`，本 patch 6 个 hunk 起始行 = 109 / 3170 / 3301 / 3325 / 6164 / 33249，无一落在该区间）；`-1` 保 `-1`（预分配只改 capacity，不写值）；名文本仍只在 Seal 原位 `Intern`；`typeSyntaxProducerSourceIndexes` 仍写循环下标（本 patch 未改 `FillTypeSyntax`）。

## 9.3 每轮命令 + 原始输出（rc / lease_hits / 驱动 sha）

原始件全部在 `.rebuild/s1b_step3/r3/`（+ `gate/`、`diag/`、`envcheck/`）。

### 9.3.1 作废轮
| 轮 | rc | lease_hits | 末行原文 | 定性 |
|---|---|---|---|---|
| `bake r3` attempt1 | **2** | 0 | `cheng_cold: src/core/lang/typed_expr_type_arena.cheng:21 (offset 997) unknown field assignment target base=candidate type=typearena.TypedExprTypeArenaLimits field=columnRows` / `[cheng_cold] primary object emit failed` | **补丁编译错误**（结构体字段名 `columnRowCount` 与赋值 `columnRows` 不一致，一次修掉） |
| `v6r/prev` attempt1 | 125 | 0 | `compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=827802752 limit_bytes=805306368` | **环境作废**（瞬时资源门），单侧重跑后两侧逐字节相同（§9.4.1） |
| `ent.kd_prev.2` / `ent.kd_r3.1` / `ent.kd_r3.2`（3 轮，临时入口探针） | — | **1 / 1 / 1** | `os atomic tree: parent lease unavailable` | **租约撞车**：该探针与 A/B battery 并发抢槽 ⇒ **3 轮全部作废，结论一律不采用**（探针不是证据链环节，已废弃） |

**环境作废 1、补丁编译错误 1、租约撞车 3（全部落在已废弃的临时探针里）。** 证据链上的编译轮（2 bake + 1 gate + 1 envcheck + 1 diag + A/B battery，共 23 份 stderr/err 日志）**`parent lease unavailable` = 0**；3 次撞车全部在 `.rebuild/s1b_step3/r3/ent.*.err` 这 3 份已作废的探针日志里。

### 9.3.2 bake（`bake_r3.sh r3`）
```
tag=r3 rc=0 wall=204s lease_hits=0 kd_sha256=851868dfb0a6e6b127760d4a48c0c70e573d0ed5b35642df44cf23a4409b0693
```
A 侧驱动 = `kd_prev`，sha `7dda4868c73257e1199067da8bdf73d4a56879714dee8e89036b35aacce19ba2`（与上一手同值，未漂移）。

### 9.3.3 234 源 TypeArena 精确列总量（**缺口闭合**）
命令：`diag_limits.sh`（**`CHENG_PROCESS_MAX_RSS_BYTES=2147483648`，标注 `diagnostic`，非验收**），pass0 跑满 234 源拿到读数后立即终止：
```
DIAGNOSTIC (raised ceiling 2147483648) found_ta_limits=1 rc=143 wall=226s
lease_hits=0
tag=ta_limits tokens=3605043 type_syntax=157503 type_syntax_children=58562 enum_variants=969 declaration_symbols=1314 functions=17362 bracket_args=1277 generic_symbols=14 generic_symbol_children=0 column_rows=17732828 column_bytes=70931312 rss=772146208 live=3094356
forest_parsed=234
max_rss=838190184
```
⇒ **234 源 TypeArena 62 个 Fill 列的精确数据量 = `70,931,312 B`（67.6 MiB）**。这不是估算：`ta_limits` 由 pass0 逐源真实计数求和得到，pass0 覆盖 234/234。
**与上一手估算对照**：上一手 `arena_total ≈ 115~155 MiB`（§5.4）⇒ 实测 / 估算 = **0.44 ~ 0.59**。估算偏高约 1.7~2.3 倍，主因是 token 数被高估（估算 5.4M，实测 **3.605M**）且 TypeSyntax 行数被高估（估算 20~50 万，实测 **157,503**）。
**口径声明**：`column_bytes` 是 62 个 Fill 列的精确总量，**不含** (a) 3 张 `str` 文本表 `typeSyntaxOwnerTokenTexts`/`typeSyntaxNameTokenTexts`/`typeSyntaxDeclarationOwnerTokenTexts` + `typeSyntaxEnumVariantNameTokenTexts`（Cheng 堆数组，不在 arena 里）、(b) `typedExprTypeArenaIntern` 的 22 个 TypeId 侧列、(c) `internPool`。后三项需真正建出 arena 才能读 `tag=type_arena used`，而建 arena 在并林之后、默认门内到不了 ⇒ **本轮仍无 234 源 `used` 读数**；`used > column_bytes`，下界是 70,931,312 B，上界用夹具实测的 `used/column_bytes` 比值外推（§9.4.2：小夹具 4.6~8.5×，被固定开销主导；`closure8` 8 源 `column_bytes=690,652` 而 `used` 行未产出）。

## 9.4 A/B 字节等价（同 `--in`/同 `--out`，先 `rm -f`，只认同路径）

A = `kd_prev`（已验证基线驱动），B = `kd_r3`（基线 + 本 patch）。脚本 `.rebuild/s1b_step3/r3/ab_r3.sh`，原始输出 `ab_r3.txt`。

### 9.4.1 判词（7/7 等价）
| 夹具 | A rc | B rc | lease_hits | 判词 |
|---|---|---|---|---|
| `ordinary_zero_exit_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`474450bf…`） |
| `call_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`1feaec0b…`） |
| `cold_nested_fmt_interpolation_smoke` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`e3161b0f…`） |
| `pair2`（2 源） | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |
| `arena_shapes` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |
| `closure8`（8 源） | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |
| `v6_direct1_repro` | 0（复现轮） | 0 | 0/0 | **CMP=IDENTICAL**（`b71f71c4…`） |

末行原文逐字相同（各例一次）：
```
pair2        :  compiler snapshot builder: portable TypeArena Symbol join duplicate
arena_shapes : parser type syntax: enum variant trailing syntax invalid
closure8     :  compiler parser receipt: normalized expression parser node missing exprIndex=5 kind=1 line=50 surface=if rootNode=-1 originNode=-1 role=0
```
**v6 的 `JUDGEMENT=DIFFER` 已按既定口径挤出去（环境作废）**，三条原文：
- A 侧门行原文：`compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=805651584 limit_bytes=805306368`（超门 345,216 B = 0.043%），`lease_hits=0`；
- B 侧：`ab_v6 a2 compile_rc=0 lease_hits=0 exe_sha256=5e606ff50345ac97d29b1eeaeba07d0da7d63fe69f9a6586307a0e25f2309e79`；
- 单侧重跑：`04:41:01 v6r/prev VOID attempt=1 rc=125 hits=0 tail='compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=827802752 limit_bytes=805306368'`；attempt2 `rc=0` → `b71f71c416d2cdc9268bb364dcaafb14c8ea1695169fe57410a7dd09cf3d2014`，**与同 `--out` 的 B 侧逐字节相同**。
⇒ **作废轮 1、租约撞车 0；等价是二值的，本轮 = 等价。**

### 9.4.2 ② 的直接实测收益（同轮、同夹具、输出逐字节相同的前提下比 `type_arena used`）
| 夹具 | ta_limits `column_bytes` | A `used` | B `used` | 降幅 |
|---|---|---|---|---|
| `ordinary_zero_exit_fixture` | 252 | 3,136 | 2,140 | −996 B（−31.8%） |
| `call_fixture` | 528 | 3,648 | 2,416 | −1,232 B（−33.8%） |
| `cold_nested_fmt_interpolation_smoke` | 1,056 | 4,672 | 2,944 | −1,728 B（−37.0%） |
| `pair2` | 1,384 | 8,064 | 6,472 | −1,592 B（−19.7%） |
| `closure8` | 690,652 | 未产出（rc=2 在 Finalize 前） | 同 | — |

⇒ ② 消的是**纯垃圾**：数据一个字节没动（7/7 等价），`used` 直接掉 1/5 ~ 1/3。**注意：这不是达标证据**，只证明 doubling 前置生效。`used` 下降比例在小夹具上被 TypeId 侧列稀释（那 22 列本轮**未**预分配），大数据量下 Fill 列占绝对多数，收益按 §9.5 的 2×~4× 模型放大。

## 9.5 门内全量实测 —— **本轮默认门读数不可用（环境漂移），已用同驱动对照证明**

### 9.5.0 门内全量实测汇总（要求项逐条，原始件见 §9.3 路径）

| 量 | pre-step3 基准 08:50 (`kd_prev`) | 本轮 `kd_r3` 默认门 12:1x | 本轮 `kd_prev` 默认门 12:2x（同驱动对照） | 抬门诊断 12:3x（`diagnostic`） |
|---|---|---|---|---|
| `forest_parsed_lines` | 234 | **134** | **134** | 234 |
| `forest_appended_lines`（目标 234） | 24 | **0** | **0** | 未取（拿到 `ta_limits` 即终止） |
| 森林窗 `after_profile_lookup since_ms` | **无读数**（该轮在它之前就撞门） | **无读数** | **无读数** | **无读数** |
| 墙钟 | 396s | 158s | 160s | 226s（主动终止 `rc=143`） |
| peak rss | **830,637,280** | **751,322,192** | **778,159,184** | 838,190,184（2 GiB 抬门） |
| 保底 `after_profile_source_payload_release` | **490,062,784** | 556,712,920 | **594,707,392** | 604,308,416 |
| `max_live` | 3,958,941 | 2,486,827 | 2,486,771 | 3,095,891 |
| `guard_hits` | 1（`rss_limit_exceeded rss_bytes=832,308,448`） | 1（`… 826,377,344`） | 1（`… 830,686,312`） | 0 |
| `lease_hits` | 0 | 0 | 0 | 0 |
| 死点 | 并林 pass1 src=24 | **pass0 src=134** | **pass0 src=134** | — |

`live` 曲线：三个默认门轮都只有 `forest_parse_begin/end` 的逐源 `live=`（每源一行，见各自 `.stderr.txt`），**没有 `tag=type_arena` / `tag=typed_ir_done` / `tag=facts` 行**（那三段都在并林之后，到不了）⇒ `type_arena_lines=0`、`typed_ir_done_lines=0`、`facts_lines=0`，不是 0 值而是无读数。

### 9.5.1 本轮默认门（`kd_r3`，`gate_run_r3.sh r3_kd_r3`）
```
label=r3_kd_r3 gate=default(768MiB) rc=125 wall=158s
lease_hits=0 type_arena_lines=0 ta_limits_lines=0 guard_hits=1
forest_parsed_lines=134  forest_appended_lines=0
max_rss=751322192  max_live=2486827  after_profile_lookup=（未到）
last: compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=826377344 limit_bytes=805306368
```
**死在 pass0 `src=134`，连 pass0 都没跑完**，所以 `ta_limits`/`forest_appended` 都没有。**这不是本 patch 造成的**：见 9.5.2。

### 9.5.2 同驱动对照（`kd_prev`，**未改动的基线编译器**，同一小时、同一命令）
```
ENVCHECK kd_prev default768 rc=125 wall=160s
csg_stage=enter since_ms=345599380 rss_bytes=136659592
csg_stage=after_profile_source_payload_release since_ms=30768 rss_bytes=594707392
forest_parsed=134  forest_appended=0
max_rss=778159184
last: compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=830686312 limit_bytes=805306368
```
与 pre-step3 同位置基准（`.rebuild/s1b_step3/gate/default768_verified.summary.txt`，08:50 同一 `kd_prev`）对照：

| 量 | pre-step3（08:50） | 本轮同驱动（12:0x） | Δ |
|---|---|---|---|
| `csg_stage=enter rss` | 73,859,720 | **136,659,592** | **+62,799,872** |
| 保底 `after_profile_source_payload_release` | **490,062,784** | **594,707,392** | **+104,644,608** |
| `forest_parsed_lines` | 234（pass0 跑完） | **134**（pass0 未跑完） | −100 |
| `forest_appended_lines` | 24 | 0 | −24 |
| `max_rss` | 830,637,280 | 778,159,184 | — |

⇒ **环境漂移**：机器上有其它重负载（`load averages: 10.05`；`vm_stat` free 仅 5,165 页 ≈ 82 MB；qemu/Chrome/VS Code 等）。`live_allocations` 在每个阶段**逐位相同**（43,625 / 1,472,437）而 rss 高 62~105 MB ⇒ 是**页驻留/物理足迹**层面的漂移，不是堆内容变化。
⇒ **结论：默认 768MiB 门在当前机器条件下，连"什么都没改"的基线编译器都过不去（保底就已 +104.6 MB，远大于门的 51.1 MB 余量）**。本轮的"门内全量实测"因此**不可执行**，不是"跑了没过"。
**抬门轮一律标 `diagnostic`**：本轮唯一抬门 = §9.3.3 的 `CHENG_PROCESS_MAX_RSS_BYTES=2147483648`，仅用于取 234 源列总量，**未据此宣称任何达标**。

### 9.5.3 用本轮实测重算"流式峰值"（口径写死）
模型：`peak(k) = pass0 实测 rss(src=k) + 累积列占比(k) × column_bytes × mult`，其中 `pass0 实测 rss` 取 `.rebuild/s1b_step3/gate/default768_verified.stderr.txt` 的 234 条 `tag=forest_parse_end pass=0`（**08:50 未漂移环境**，唯一一份 pass0 跑满 234 源的读数）；`累积列占比(k)` 用同一份读数的**逐源 parser arena 累计占比**做代理（列数据量与源复杂度同序）。

| 情形 | 峰值 | 位置 | vs 门 805,306,368 |
|---|---|---|---|
| **做了 ②**（列 = 精确 1×） | **819,036,575** | src=170 | **+13,730,207（+13.1 MiB）** |
| 没做 ②，最乐观 2× | 883,850,966 | src=170 | +78,544,598（+74.9 MiB） |
| 没做 ②，均值 3× | 948,665,358 | src=170 | +143,358,990（+136.7 MiB） |
| 没做 ②，最坏 4× | 1,013,479,749 | src=170 | +208,173,381（+198.5 MiB） |

（"2×~4×"不是猜：`arena.cheng:373` 每次 grow 翻倍且旧块留垃圾，长度 L 的列最终占 `2^(k+1)-8`（`2^(k-1) < L ≤ 2^k`），比值落在 2~4。）

**判词**：**② 值 65~194 MB**，是六项里最大的一把杠杆；但它把缺口从"超 75~199 MB"压到"**超 13.1 MiB**"。⇒ **⑥ 单独仍不达标，本条与上一手结论一致，但缺口从估算的 29~58 MiB 收窄到实测口径的 13.1 MiB。**

**13.1 MiB 的下一步去处（按可验证性排序）**：
1. **22 个 TypeId 侧列**（`typedExprTypeArenaIntern` 的 `typeKinds`/`childTypeIds`/`traitPremiseTypeIds`… ）：本轮**未**预分配，仍在 doubling。它们按 `typeCount` 行计，`typeCount` 在 Init 时未知 ⇒ 要么在 Seal 前用**可证上界**（需先给出 `typeCount` 的上界证明，当前没有）预分配，要么改为「首列 append 后立刻 `ArenaReserveCapacity` 到 `used + 上界`」。
2. **4 张 `str` 文本表**（3 × 157,503 + 969 条）：Cheng 堆数组，doubling 垃圾 ≈ 2~4 MB。改它们要动 `FillTypeSyntax` 的 `add(...)` 形态 ⇒ **撞"六个 Fill* 族零改写"红线**，需要先与红线所有者确认是否可用 `setLen` + 下标写。
3. **`src=170` 的 parse 瞬时尖峰**（+196 MB，本模型里它是峰位所在）：这是杠杆 (ii)，与 arena 无关。
4. **保底 490 MiB**（杠杆 (iii)）：即便 1+2+3 全做，模型仍只剩个位数 MiB 余量，仍属"贴着门过"，不足以宣称达标。

## 9.6 未完成项与下一步最小动作

**本轮收敛态（交付态，实读）**：树 = **已验证基线**（`typed_expr 56/23`、`type_arena 450/1` sha `8b8332eeb944aeda…`、`compiler_csg 129/29` sha `42fd9f090f927795…`），本轮工作以 **`patches/s1b_step3b_limits.patch`**（sha `c83ca984…`）固化。`converge_r3.sh` 实跑证明 patch 可正向/反向任意增删且逐位回到基线（`converge_r3.log`）：
```
A forward: 863/3  f2f43593…   141/29 99f1837e…
B revert : 450/1  8b8332ee…   129/29 42fd9f09…
C forward: 863/3  f2f43593…   141/29 99f1837e…
D revert : 450/1  8b8332ee…   129/29 42fd9f09…
```

**未完成**：③ ④ ⑤ ⑥（同一原子切换）。

**下一步最小动作（带本轮实测数）**：
1. **等机器静默再取门内读数**：当前保底 +104.6 MB 是环境的，不是代码的；任何门内结论都必须在 `after_profile_source_payload_release` 回到 ~490 MB 时才有意义（判据：同驱动 `kd_prev` 跑 `forest_parsed=234`）。
2. **补 22 个 TypeId 侧列的预分配**（13.1 MiB 缺口的第一顺位，且不撞任何红线）：需要先给出 `typeCount` 的可证上界，否则改「`SeedSemanticScalarRows` 之后立刻 `ArenaReserveCapacity`」形态并说明它不是启发式。
3. 然后才做 **③④⑤⑥**（施工图 §8 第 3~6 条锚点已在**基线上重新 grep 复核**；注意本轮新增的 `TypedExprTypeArenaLimits` 与 `FromIndexInto` 正是 ⑤ 的 Init 入参，直接复用，不要再造一份总数算法）。

## 9.7 纪律回执

- **patch 通道**：全程 `diff -u`（`mkpatch.py`）→ `git apply --check` → `git apply`；撤回 `git apply -R`。**无 `cp` 整文件、无 `git checkout --`/`git restore`/`git stash`**。
- **槽位**：`.rebuild/COMPILE_SLOT.lock` 全程持有（`owner.txt` 写活 pid），证据链上的编译轮实测 `parent lease unavailable` **0 次**（3 次撞车全在已废弃的 `ent.*.err` 临时探针里，见 §9.3.1）；交付态解锁（交付态 = 已验证基线 + patch 落 `patches/`，不是 reverted 中间态）。
- **收敛**：见 §9.6，脚本 `converge_r3.sh` 实跑四段，`A == C`、`B == D`，全链逐位可逆。**绝未留半流式态**（本轮没有任何流式改动进树）。
- **字节等价前置门**：同 `--in`/同 `--out`；`rm -f` 先清；夹具 `rc=0` 才判 CMP；驱动不存在即非零退出；只认同路径 A/B（v6 原轮的 A/B 因 A 侧未产出而记 NO_ARTIFACT，复现轮改为同 `--out` 后逐字节相同）。
- **作废三分类**：环境作废 1（v6r/prev attempt1，rc=125 + lease_hits=0 + 末行 `resource_guard … 827802752 / 805306368`）；补丁编译错误 1（bake r3 attempt1，rc=2 + lease_hits=0 + 原文直指本轮新增结构体字段 `columnRows`）；租约撞车 3（`ent.kd_prev.2`/`ent.kd_r3.1`/`ent.kd_r3.2`，各 1 次，全部在已废弃的临时探针里，结论不采用）。
- **语言坑**：改完即跑 `patches/check_no_inline_comment_after_or.py`（三文件）→ `OK: no comment follows a \`||\` line in 3 file(s)`。
- **抬门标注**：唯一抬门 = §9.3.3，`diagnostic`，**未据此宣称达标**。
- **未 commit / 未 push / 未建分支或 worktree**；原始件 + `MANIFEST.sha256` 在 `.rebuild/s1b_step3/`。

## 9.8 判词

```
STEP3 NOT ESTABLISHED
```
- **直接卡点**：③④⑤⑥ 未做 ⇒ 默认门内 `forest_appended=0`（本轮 `kd_r3` 在 pass0 `src=134` 撞门，`resource_guard rss_limit_exceeded rss_bytes=826377344 limit_bytes=805306368`）。**同时**：当前机器条件下默认门对**未改动的基线编译器**也不可达（保底 +104,644,608 B），本轮门内读数属**环境作废口径**，不作为代码判据。
- **本轮新增的、比判词更要紧的三句**：
  1. **缺口闭合**：234 源 TypeArena 列精确总量 = **70,931,312 B**（tokens 3,605,043 / type_syntax 157,503），是上一手估算 115~155 MiB 的 **0.44~0.59×**。
  2. **② 实测有效**：值 **65~194 MB**（doubling 垃圾），A/B 7/7 等价且同轮 `used` 降 19.7%~37.0%。
  3. **⑥ 仍不达标，但缺口收窄到 13.1 MiB**：② + ⑥ 的流式峰值 = **819,036,575 B** > 门 **805,306,368 B**。
- **取代关系**：本判词取代 §7 与 `.rebuild/s1b_step3/VERDICT_step3.txt` 的上一代 `STEP3 NOT ESTABLISHED`（理由从"⑥ 单独不足，估算超 29~58 MiB"改写为"③④⑤⑥ 未做 + ② 后仍超 13.1 MiB + 环境漂移"）；两代不得并存，`VERDICT_step3.txt` 已改写为本文判词。

---

# S1b 第③步 · 第四手（2026-09-11 13:xx）—— ③④ 落地并判等价（7/7）；⑤⑥ 未做

> 判词（本轮）：**STEP3 NOT ESTABLISHED**（③④ 已完成并判等价，⑤⑥ 未做 ⇒ 默认门内无 `forest_appended=234`）。
> 本条**取代** §9.8 与 `.rebuild/s1b_step3/VERDICT_step3.txt` 的上一代判词；两代不得并存，`VERDICT_step3.txt` 已改写。

## 10.0 一句话

按 §9.6 的下一步把 **③（`state.*` 按索引总数分配 + `IndexFields` 游标跨源持久）** 与 **④（逐源 `FillTypeSyntax` 的坐标 rebase，含 `FillBracketArgs.typeSyntaxBracketArgTypeNodeIndexes` 此前完全未 rebase）** 做成可独立判等价的一刀，**判等价（7/7，0 租约撞车）**；过程中抓到并定位到**列一级**的真实回归 1 次（已修）与 **harness 缺陷 2 次**（已修，未记在补丁账上）。⑤⑥ 未做。

## 10.1 六项逐条完成度（累计）

| 步 | 内容 | 状态 | 证据 |
|---|---|---|---|
| ① | decl-index 逐源列计数 | **已做**（第三手） | `patches/s1b_step3b_limits.patch` sha `c83ca984…` |
| ② | arena Init 精确预分配（62 列） | **已做**（第三手） | 同上；A/B 7/7；`used` 同轮降 19.7~37.0% |
| ③ | `state.*` 全局分配 + `IndexFields` 游标跨源持久 | **已做**（本手） | `patches/s1b_step3c_streaming_prep.patch` sha `2a9aa35b…`；A/B 7/7 |
| ④ | 逐源 `FillTypeSyntax` + 坐标 rebase | **已做**（本手，见 §10.3 边界） | 同上；A/B 7/7 |
| ⑤ | 逐源驱动（compiler_csg 单遍） | **未做** | `compiler_csg` 交付态仍 `129/29` |
| ⑥ | 删并林半段 | **未做** | 未做 ⑤ 时删它无人填 arena |

## 10.2 ③ 改动前后原文（`typed_expr_type_arena.cheng`）

### 10.2.1 `typedExprTypeArenaBuildState` 增显式行空间
```
改前:  typedExprTypeArenaBuildState = ref object
           tree: parser.ParserValueExprTree
           authority: TypedExprTypeResolutionAuthority
           symbolByDeclarationRoot: int32[]
           ...
改后:  + typeSyntaxCount: int32      # 全局行空间，由调用方给，不读 tree
       + groupCount: int32
       + fieldCount: int32           # field-CSR 分配游标，跨源持久
```
### 10.2.2 单一分配点 `TypedExprTypeArenaBuildStateInitInto`
改前：分配代码**内联在** `TypedExprTypeArenaBuildFromParserTreeInto` 里，尺寸取自 `tree.typeSyntaxCount`：
```
    var state: typedExprTypeArenaBuildState = new(typedExprTypeArenaBuildState)
    state.tree = share(tree)
    state.authority = share(authority)
    var symbolByDeclarationRoot: int32[]
    setLen(symbolByDeclarationRoot, tree.typeSyntaxCount)
    ... (authorityUsed / genericAuthorityUsed / bucketHeads)
```
改后：整段收进一个**不吃 `tree`** 的入口，整林驱动用合并森林自己的计数调用（数值完全相同）：
```
    var state: typedExprTypeArenaBuildState
    if !typedExprTypeArenaBuildStateInitInto(
           authority, tree.typeSyntaxCount, tree.producerSourceCount,
           state, err):
        TypedExprTypeArenaRelease(value)
        return false
    state.tree = share(tree)
```
`fieldStartsByDeclarationRoot` / `fieldCountsByDeclarationRoot` 也一并上移到这个分配点（原先在 `IndexFields` 内按 `state.tree.typeSyntaxCount` 分配）。

### 10.2.3 `IndexFields` → 逐源 + 游标持久
改前（单次整林三段式，游标是函数局部量）：
```
fn typedExprTypeArenaIndexFields(state, err): bool =
    var fieldStartsByDeclarationRoot: int32[]
    var fieldCountsByDeclarationRoot: int32[]
    setLen(..., state.tree.typeSyntaxCount)
    var fieldCount: int32                      # ← 每源重置就会错
    for declarationRoot in 0..<state.tree.typeSyntaxCount: ...
        fieldTypeSyntaxNodeIndexes[destination] = row
```
改后（`state` 持全局槽位与游标，函数只吃**当前源的树**与它的全局基址）：
```
fn typedExprTypeArenaIndexFieldsSourceInto(
        state: var typedExprTypeArenaBuildState,
        tree: parser.ParserValueExprTree,
        viewTypeSyntaxBase: int32,
        err: var str): bool =
    ...
        let globalRoot = viewTypeSyntaxBase + declarationRoot
        state.fieldCountsByDeclarationRoot[globalRoot] =
            state.fieldCountsByDeclarationRoot[globalRoot] + 1
    for row in 0..<tree.typeSyntaxCount:
        let globalRoot = viewTypeSyntaxBase + row
        let count = state.fieldCountsByDeclarationRoot[globalRoot]
        if count > 0:
            state.fieldStartsByDeclarationRoot[globalRoot] = state.fieldCount
            state.fieldCount = state.fieldCount + count            # ← 跨源延续
        fieldTypeSyntaxNodeIndexes[destination] = viewTypeSyntaxBase + row
```
整林驱动调用点：`typedExprTypeArenaIndexFieldsSourceInto(state, tree, 0, err)`（单次、base 0、游标起 0 ⇒ 与改前逐位相同）。

## 10.3 ④ 改动前后原文与边界

### 10.3.1 新增 rebase 原语
```
fn typedExprTypeArenaRebaseRow(base: int32, row: int32): int32 =
    if row < 0:
        return -1
    return base + row
```
**注意：该函数不能加 `@borrows`**（无托管形参）——加了会得到 `borrowed call argument rejected`。见 §10.5。

### 10.3.2 逐列 rebase 清单（整林驱动一律传 base=0 ⇒ 恒等）
| 列 | 改前 | 改后 |
|---|---|---|
| `tokenProducerSourceIndexes`（FillTokens） | `tree` 值 | `viewProducerSourceBase + tree` 值 |
| `typeSyntaxProducerSourceIndexes` | `producerSourceIndex` | `viewProducerSourceBase + producerSourceIndex` |
| `typeSyntaxOwnerTokenIndexes` | 原值 | `rebase(viewTokenRowBase, 原值)` |
| `typeSyntaxQuestionTokenIndexes` | 原值 | `rebase(viewTokenRowBase, 原值)` |
| `typeSyntaxDeclarationOwnerTokenIndexes` | 原值 | `rebase(viewTokenRowBase, 原值)` |
| `typeSyntaxDeclarationOwnerNodeIndexes` | 原值 | `rebase(viewTypeSyntaxBase, 原值)` |
| `typeSyntaxBracketArgStarts` | 原值 | `rebase(viewBracketArgBase, 原值)` |
| `typeSyntaxBracketBaseTypeSyntaxNodeIndexes` | 原值 | `rebase(viewTypeSyntaxBase, 原值)` |
| `typeSyntaxGenericSymbolStarts` | 原值 | `rebase(viewGenericSymbolBase, 原值)` |
| `bracketArgTypeSyntaxNodeIndexes`（**FillBracketArgs，此前完全未 rebase**） | 原值 | `rebase(viewTypeSyntaxBase, 原值)` |
| `genericSymbolProducerSourceIndexes` | `tree` 值 | `viewProducerSourceBase + tree` 值 |
| `genericSymbolDeclarationOwnerTokenIndexes` | 原值 | `rebase(viewTokenBase, 原值)` |
| `genericSymbolNameTokenIndexes` | 原值 | `rebase(viewTokenBase, 原值)` |
| `genericSymbolOwnerTypeSyntaxNodeIndexes` | 原值 | `rebase(viewTypeSyntaxBase, 原值)` |
| `genericSymbolConstraintTypeSyntaxNodeIndexes` | 原值 | `rebase(viewTypeSyntaxBase, 原值)` |
| `genericSymbolDefaultTypeSyntaxNodeIndexes` | 原值 | `rebase(viewTypeSyntaxBase, 原值)` |
| `genericSymbolChildStarts` | 原值 | `rebase(viewGenericSymbolChildBase, 原值)` |
| `genericSymbolChildTypeSyntaxNodeIndexes` | 原值 | `rebase(viewTypeSyntaxBase, 原值)` |
| `functionOwnerTokenIndexes`（FillFunctions） | 原值 | `rebase(viewTokenBase, 原值)` |
| `functionRow`（FillFunctions 行空间） | `tree.declarationFunctionRows` 原值 | `viewFunctionBase + 原值` |
| FillFunctions 源 CSR 循环 | `0..<value.producerSourceCount` | `viewGroupBase + offset, offset in 0..<viewGroupCount` |
| FillFunctions 覆盖判词 | `sourceFunctionCursor != value.functionCount` | `!= viewFunctionBase + tree.declarationFunctionCount` |

**未 rebase 的（有意）**：`typeSyntaxSourceLocalRows`（源内行号，定义如此）、`SpanStarts/Ends`（源内字符偏移）、各 `Counts`、`Ordinals`、`typeSyntaxTypeIds`（intern 结果）、`typeSyntaxEnumVariant*` 六列（S1b-0c 已 rebase，本手不动）。

### 10.3.3 边界（诚实标注）
- `typeSyntaxEnumVariantDeclarationOwnerTokenIndexes` 用的 `viewTokenBase`（=`value.tokenProducerSourceIndexes.len`）**是 0c 遗留的语义**：它等于「本棵树 **append 之后** 的 token 列长度」，整林驱动下 = `tree.tokenCount`，逐源驱动下 = 「基址 + 本源 token 数」，**两种口径下都不是本源 token 基址**。本手**不动它**（改了就会改行为），只在报告里记为**0c 遗留缺陷**，⑤ 落地前必须先修。
- `FillFunctions` 的五个 by-row 临时数组仍按 `value.functionCount`（全局）分配；逐源驱动下是每源一次 17,362 × 5 × 4 B ≈ 347 KB 的分配开销，正确但浪费，留给 ⑤ 优化。

## 10.4 每轮命令 + 原始输出（rc / lease_hits / 驱动 sha）

原始件在 `.rebuild/s1b_step3/r4/`（`manual/`、`ab_r4.txt`、`attempts_ab_r4.txt`、`converge_r4.log`）。

### 10.4.1 作废/回归轮（三分类，逐条留 rc + lease_hits + 末行原文）
| 轮 | rc | lease_hits | 末行原文 | 定性 |
|---|---|---|---|---|
| `bake r4` #1 | 2 | 0 | `cheng_cold: borrowed actual cannot bind non-var non-@borrows formal caller_function_row=9659 callee_function_row=9645 formal_ordinal=1 caller=typearena.TypedExprTypeArenaBuildFromParserTreeInto callee=typearena.typedExprTypeArenaFillFunctions` | **补丁编译错误**：注释块被插在 `@borrows` 与 `fn typedExprTypeArenaFillFunctions` 之间，属性被静默脱钩（一次修掉） |
| `bake r4` #2 | 2 | 0 | `cheng_cold: borrowed call argument rejected` / `reachable function body missing: typearena.TypedExprTypeArenaBuildFromParserTreeInto` | 同上，第一版修得不全（`typedExprTypeArenaRebaseRow` 误加 `@borrows`），一次修掉 |
| battery #0（r4） | 127（B 侧全部） | 0 | `timeout: failed to run command '/Users/lbcheng/cheng-lang/.rebuild/s1b_step3/r4/kd_r4': No such file or directory` | **harness 缺陷**：脚本把 B 驱动路径写成 `r4/kd_r4`，实际在 `r3/kd_r4` ⇒ 7×`NO_ARTIFACT`+6×`JUDGEMENT=DIFFER`，**全部作废，不记补丁账** |
| battery #1（r4，路径已修） | A 0 / B 2 | 0 | B 侧：`compiler csg: TypeArena production failed:  typed expr type arena: function return TypeId authority invalid` | **真实回归**（见 §10.5），定位到列，修后重烤 |
| manual probe #0 | 0/0/0 | 0 | 三侧产物 `differ: char 7393801` | **harness 缺陷**：手工探针给每侧不同 `--out`，而产物**内嵌自己的输出文件名** ⇒ 构造上必然不同。改成同 `--out` 后三侧逐位相同。**这是"判据/测量必须与被测对象执行路径对齐"的又一实例** |

### 10.4.2 bake
```
bake r4 #3  rc=0 wall=203s lease_hits=0 kd_sha256=114ca210f2a8503b8e7a89f7860a4d4050fe0d19ac817fc27b9e0d638bac593d
bake r3     rc=0 wall=204s lease_hits=0 kd_sha256=851868dfb0a6e6b127760d4a48c0c70e573d0ed5b35642df44cf23a4409b0693
kd_prev（A 侧，未改动基线） sha 7dda4868c73257e1199067da8bdf73d4a56879714dee8e89036b35aacce19ba2
```

### 10.4.3 手工单夹具三驱动对照（`manual_single.sh`，同 `--in` 同 `--out`）
夹具 `ordinary_zero_exit_fixture`（复制为 `src/tests/ug_r4_manual_probe.cheng`），输出路径三侧统一 `--out:.rebuild/s1b_step3/r4/manual/manual.exe`：
```
side=prev rc=0 lease_hits=0 --out EXISTS sha256=1c3d238dda8b3c6efe6e562c2954be636add3fcf2aceb4e567641dfdaff47734 bytes=7451752
side=r3   rc=0 lease_hits=0 --out EXISTS sha256=1c3d238dda8b3c6efe6e562c2954be636add3fcf2aceb4e567641dfdaff47734 bytes=7451752
side=r4   rc=0 lease_hits=0 --out EXISTS sha256=1c3d238dda8b3c6efe6e562c2954be636add3fcf2aceb4e567641dfdaff47734 bytes=7451752
cmp r3 vs r4: IDENTICAL        cmp prev vs r4: IDENTICAL
stderr 末行三侧逐字相同: lifecycle_before_after_primary buf=18 bytes=1049770 ... arena=1048576
```
⇒ 三侧（未改动基线 / +①② / +①②③④）**逐字节同物**。

### 10.4.4 A/B battery（A=`kd_r3`=基线+①②，B=`kd_r4`=基线+①②③④）
| 夹具 | A rc | B rc | lease_hits | 判词 |
|---|---|---|---|---|
| `ordinary_zero_exit_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`e88c8198…`） |
| `call_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`71c2d93e…`） |
| `cold_nested_fmt_interpolation_smoke` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`2b93d1ea…`） |
| `pair2` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |
| `arena_shapes` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |
| `closure8` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |
| `v6_direct1_repro` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`af3dc804…`） |
⇒ **7/7 等价；`parent lease unavailable` = 0**（r4 全部 stderr 实测）。`type_arena used` 两侧逐位相同（2140/2416/2944/6472/12060），即 ③④ 不改任何 arena 数据。

## 10.5 真实回归的列级定位（父席要求）

**症状**：`kd_r4`(v1) 在 `ordinary_zero_exit_fixture` / `call_fixture` / `cold_nested_fmt_interpolation_smoke` / `pair2` / `v6` 上 `rc=2`，末行
`compiler csg: TypeArena production failed:  typed expr type arena: function return TypeId authority invalid`；A 侧同夹具 `rc=0` 且有产物。

**定位过程（列一级）**：
1. 报错点 `typed_expr_type_arena.cheng:6670-6678`（`typedExprTypeArenaBindFunctionReturnsRec`）：
   ```
   let ownerToken = ...value.typeSyntaxDeclarationOwnerTokenIndexes...
   let functionRow = ownerToken < 0 || ownerToken >= functionByOwnerToken.len
       ? -1 : functionByOwnerToken[ownerToken]
   if functionRow < 0 || ...:
       err = " typed expr type arena: function return TypeId authority invalid"
   ```
   `functionByOwnerToken` 由 `value.functionOwnerTokenIndexes` 建；两个键都是 **token 行号**。
2. 我在 ④ 里把 `typeSyntaxDeclarationOwnerTokenIndexes` 的 rebase 基址取成了 `FillTypeSyntax` 内的局部
   `let viewTokenBase = value.tokenProducerSourceIndexes.len`——**这个量在整林驱动下等于 `tree.tokenCount`**（`FillTokens` 已经把全林的 token 全部 append 完），不是 0、也不是本源 token 基址。于是每个 token 坐标被写成 `tokenCount + row`，查表必落空。
3. **修法**：给 `FillTypeSyntax` 增一个显式形参 `viewTokenRowBase`，整林驱动传 0；0c 遗留的 `viewTokenBase` **原样保留**只给 variant 列用 ⇒ 新 rebase 全部恒等、旧行为一字不改。
4. 复烤 `rc=0`；三驱动手工对照与 A/B battery 全绿（§10.4.3/§10.4.4）。

**结论**：**是可能 A（真实回归），不是 harness**；已修，且修复点收敛到一个形参。同时暴露 **0c 遗留缺陷 1 处**（`typeSyntaxEnumVariantDeclarationOwnerTokenIndexes` 的 `viewTokenBase` 口径错），本手不动，记入 §10.3.3 待 ⑤ 前修。

## 10.6 未完成项与下一步最小动作

**本轮收敛态（交付态，实读）**：树 = **已验证基线**（`typed_expr 56/23`、`type_arena 450/1` sha `8b8332eeb944aeda…`、`compiler_csg 129/29` sha `42fd9f090f927795…`），工作以**两件 patch** 固化：
- `patches/s1b_step3b_limits.patch`（sha `c83ca984…`，+425/−2，6 hunk）= ① + ②
- `patches/s1b_step3c_streaming_prep.patch`（sha `2a9aa35b…`，+279/−124，20 hunk）= ③ + ④（叠加在 3b 之上）

`converge_r4.sh` 实跑五段证明两件可任意独立增删且逐位可逆（`converge_r4.log`）：
```
A forward(3b+3c): 1140/125 8788a155…   141/29 99f1837e…
B -3c           :  863/3   f2f43593…   141/29 99f1837e…
C -3b           :  450/1   8b8332ee…   129/29 42fd9f09…
D +3b +3c       : 1140/125 8788a155…   141/29 99f1837e…
E -3c -3b       :  450/1   8b8332ee…   129/29 42fd9f09…
```

**未完成**：⑤（逐源驱动）⑥（删并林半段）。

**下一步最小动作**：
1. **先修 0c 遗留**：`typeSyntaxEnumVariantDeclarationOwnerTokenIndexes` 的 rebase 基址换成显式形参（与 ④ 同法），否则 ⑤ 一落地 enum variant 的 owner token 就会错位。
2. **⑤**：`compiler_csg.cheng` 单遍驱动——pass0 里 `parse → BuildSourceInto（既有）→ typedExprTypeArenaFillTokens/TypeSyntax/Functions/BracketArgs/GenericSymbols/GenericSymbolChildren（**现在全部已具备 view 形参**）→ IndexFieldsSourceInto(state, srcTree, syntaxBase) → R1 逐源 → TreeRelease`；Init 用本手已就位的 `TypedExprTypeArenaLimitsFromIndexInto` + `TypedExprTypeArenaBuildStateInitInto(index.typeSyntaxCount, index.producerSourceCount, …)`，**不要再造第三份总数/分配算法**。
3. **⑥**：与 ⑤ 同一步删 `:33076-33168` 并林半段与 `typeArenaParserForest` 全部引用。
4. **门内判据**不变：`forest_appended=234` 且无 `rss_limit_exceeded`。实测缺口见 §9.5.3：**② + ⑥ 后仍超 13.1 MiB**，故 ⑤⑥ 落地后仍须补 §9.5.3 列的 1~4 号杠杆。

## 10.7 纪律回执

- **patch 通道**：`diff -u`（`mkpatch_r4.py`）→ `git apply --check` → `git apply`；撤回 `git apply -R`。**无 `cp` 整文件、无 `git checkout --`/`git restore`/`git stash`**。
- **槽位**：`.rebuild/COMPILE_SLOT.lock` 全程持有（`owner.txt` 活 pid）；r4 全部编译轮（3 bake 尝试 + 手工三驱动 + battery 14 侧）实测 `parent lease unavailable` **0 次**。
- **收敛**：见 §10.6，五段实跑，`A == D`、`C == E`；**绝未留半流式态**。
- **字节等价前置门**：同 `--in`/同 `--out`；`rm -f` 先清；只认同路径 A/B。本手**实测到"不同 `--out` 会让产物必然不同"**（产物内嵌输出名，`char 7393801` 起 differ），手工探针已改为同路径。
- **作废三分类**：补丁编译错误 2（`@borrows` 脱钩、`@borrows` 误加，各一次修掉）；harness 缺陷 2（`kd_r4` 路径写错、手工探针 `--out` 不一致）；**真实回归 1**（`viewTokenBase` 基址取错，列级定位并修复）；环境作废 0；租约撞车 0。
- **判据/测量与执行路径对齐**（父席今晚教训）：本报告把「③④ 是否等价」与「harness 是否可用」**分栏**写——§10.4.1 逐条给出 harness 轮与回归轮的原文，§10.4.4 只以同路径 A/B 判等价；"未测得"与"无效"不混写。
- **六项完成度**：① ② ③ ④ 已做并判等价；⑤ ⑥ 未做。
- **未 commit / 未 push / 未建分支或 worktree**；原始件 + `MANIFEST.sha256` 在 `.rebuild/s1b_step3/`。

## 10.8 判词

```
STEP3 NOT ESTABLISHED
```
- **直接卡点**：⑤⑥ 未做 ⇒ 默认门内 `forest_appended` 仍是 24（并林 pass1 `src=24`），不是 234。
- **本轮实质进展**：③④ 落地并判等价（7/7，三驱动手工对照逐字节同物），⑤⑥ 的**全部前置形参已就位**（Init 入参、六个 `Fill*` 的 view 形参、`IndexFieldsSourceInto`、`ReserveEmpty` 预分配、逐源列总量），并抓到/修掉 1 处真实回归 + 记录 1 处 0c 遗留缺陷。
- **取代关系**：本判词取代 §9.8 与 `.rebuild/s1b_step3/VERDICT_step3.txt` 的上一代；两代不得并存。


---

# S1b 第③步 · 第五手（2026-09-11 14:xx）—— 0 已做（并带 Seal 相无树落地）；⑤ 的 arena 三相 API 已落地；**⑤ 的驱动与 ⑥ 未做**

> 判词（本轮）：**STEP3 NOT ESTABLISHED**（默认门内 `forest_appended` 仍是两位数、死在并林 pass1，不是 234）。
> 本条**取代** §10.8 与 `.rebuild/s1b_step3/VERDICT_step3.txt` 的上一代判词；两代不得并存，`VERDICT_step3.txt` 已改写。

## 11.0 一句话

本轮把用户点名的 **0（0c 遗留缺陷）修掉**，并把它与 **Seal 相彻底无树（`s1b_1c_seal_arena` 的 22 个 hunk，此前不在树上）** 合成一件**判等价**的改动；在其上再落 **甲：arena 三相 API（`AllocateFromLimitsInto` / `AppendSourceFromTreeInto` / `SealInto`，整林驱动收缩为一个恒等包装）**，同样判等价。**⑤ 的驱动与 ⑥（删并林半段）未做**——不是因为时间不够，而是因为施工图 §1.2 对 ⑤ 的"前置已齐"判断**与代码实况不符**：逐源驱动还需要三个面（逐源权威、R1 逐源、以及五个 append 相树读函数的全局行改造），逐个列在 §11.5，是本轮最要紧的产出。**门内全量实测两轮（同窗口基线对照）都死在并林 pass1**，`forest_appended` 10 / 16，判词不变。

## 11.1 逐条完成度

| 项 | 内容 | 本轮状态 | 证据 |
|---|---|---|---|
| **0** | `typeSyntaxEnumVariantDeclarationOwnerTokenIndexes` 的 rebase 基址（0c 用 `viewTokenBase` = append 之后的 token 列长，整林下 = `tree.tokenCount`、逐源下 = 基址+本源数，两种口径都不是本源 token 基址） | **已做** | `patches/s1b_step3d_seal_treefree.patch`；新增列 `typeSyntaxEnumVariantNameTokenIndexes` 同法；整林驱动传 `viewTokenRowBase=0` ⇒ 恒等 |
| **⑤-a** | Seal 相彻底无树（施工图 §2.2 的 7 处树读 → arena 列）——**⑤ 的硬前置，此前不在树上** | **已做** | 同上；`RealizeDeclarationsRec` / `SpecializePendingRec` 的 `tree` 形参已删 |
| **⑤-b** | arena 三相 API（Init 吃 `TypedExprTypeArenaLimits`，AppendSource 吃单源树 + 全局 view base，Seal 无树） | **已做** | 同上；整林驱动 = 三相的顺序包装，A/B 7/7 等价 |
| **⑤-c** | compiler_csg 逐源驱动（pass1 由"并林"改为"逐源 权威+arena+R1"） | **未做** | 见 §11.5；`compiler_csg.cheng` 交付态仍 `141/29`（含 3b 的 12 行埋点） |
| **⑤-d** | 逐源权威 `TypedExprTypeResolutionAuthorityBuildSourceInto`（索引驱动） | **未做** | 同上；现存只有整林 `…BuildPackageForestInto`（:3183） |
| **⑤-e** | R1 逐源（`TypedExprBuildIndexAppendContextCallDeclarationsManual` 已有，缺驱动与 seal 拆分） | **未做** | 同上 |
| **⑥** | 删并林半段 + `typeArenaParserForest` 全部引用 | **未做** | 未做 ⑤-c 时删它没有任何东西填 arena（与上一手同判） |

**红线核对（本轮全部改动）**：新列 `typeSyntaxEnumVariantNameTokenIndexes` **不进** `typedExprTypeArenaHashMaterialized`；名文本仍只在 Seal 原位 `Intern`（`BuildObjectDeclaration`/`BuildTupleAliasMembers`/`BuildEnumDeclaration` 的 `langintern.Intern` 调用点一字未动）；六个 `Fill*` 族**除 view 形参穿参外零改写**；`-1` 保 `-1`（`typedExprTypeArenaRebaseRow` 与原三元式同义）；`typeSyntaxProducerSourceIndexes` 仍写循环下标。

## 11.2 改动前后原文

完整 patch：`patches/s1b_step3d_seal_treefree.patch`（sha `b308e6bf5b74774ede34aa3dc3f8933e7ea3bc1bc72c7b18188f7b403e980539`，+473/−196，29 hunk，单文件 = `typed_expr_type_arena.cheng`），**叠加在** `s1b_step3b_limits.patch` + `s1b_step3c_streaming_prep.patch` 之上。

### 11.2.1 项 0：variant 列的 rebase 基址换成显式形参

改前（`typedExprTypeArenaFillTypeSyntax` 内）：
```
    let viewTokenBase = value.tokenProducerSourceIndexes.len
    ...
            arenamod.ArenaArrayInt32Add(
                value.arena,
                value.typeSyntaxEnumVariantDeclarationOwnerTokenIndexes,
                variantOwnerToken < 0 ? -1 : viewTokenBase + variantOwnerToken)
    ...
            arenamod.ArenaArrayInt32Add(
                value.arena,
                value.typeSyntaxEnumVariantNameTokenIndexes,
                variantNameToken < 0 ? -1 : viewTokenBase + variantNameToken)
```
改后：删掉派生基址（该量在 `FillTokens` **之后**取值，两种驱动下都不是本源 token 基址——整林 = `tree.tokenCount`，逐源 = 基址+本源数），两处改用 ④ 已引入的显式形参：
```
            arenamod.ArenaArrayInt32Add(
                value.arena,
                value.typeSyntaxEnumVariantDeclarationOwnerTokenIndexes,
                typedExprTypeArenaRebaseRow(
                    viewTokenRowBase, variantOwnerToken))
    ...
            arenamod.ArenaArrayInt32Add(
                value.arena,
                value.typeSyntaxEnumVariantNameTokenIndexes,
                typedExprTypeArenaRebaseRow(
                    viewTokenRowBase, variantNameToken))
```
整林驱动 `FillTypeSyntax(value, tree, 0, 0, 0, 0, 0, err)` 的 `viewTokenRowBase = 0` ⇒ 两处都是恒等，**整林行为一字不改**（A/B 7/7，§11.3.4）。该列此前全仓**零读**（只有长度校验与 Clone），因此这条修复是"消除潜伏错位"而不是"改行为"。

### 11.2.2 Seal 相彻底无树

新增 arena 常驻读取层（23 个 `typedExprTypeArena*At` 读取器）+ 把 Seal 相 7 处树读改成 arena 列读，全部为坐标替换（append 相已按同一全局行号物化）：

| # | 位置 | 改前 | 改后 |
|---|---|---|---|
| 1 | `RealizeDeclarationsRec` | `ParserValueExprTypeSyntaxKindAt(tree, root)` | `typedExprTypeArenaSyntaxKindAt(value, root)` |
| 2 | `ObjectBaseTargetInto` | 同上 | 同上 |
| 3 | `SpecializePendingRec` | `…TypeSyntaxGenericSymbolStartAt/CountAt(tree, root)` | `…SyntaxGenericSymbolStartAt/CountAt(value, root)` |
| 4 | `DependencyIndirect` | `…KindAt(tree, targetRoot/cursor)` | `…SyntaxKindAt(localOut, …)` |
| 5 | `BuildObjectDeclaration` | 子 CSR / owner token / owner 文本 | `…SyntaxChildAt/…SyntaxOwnerTokenAt/…SyntaxOwnerTokenTextAt` |
| 6 | `BuildTupleAliasMembers` | 同上 | 同上 |
| 7 | `BuildEnumDeclaration` | variant CSR + 变体名 token | `…SyntaxEnumVariantRowAt/…EnumVariantNameTokenAt`（新列 `typeSyntaxEnumVariantNameTokenIndexes`） |

`Intern` 仍在**原位**（Seal 内）调用，池序不变。`RealizeDeclarationsRec` / `SpecializePendingRec` 的 `tree` 形参本轮**删除**（体内已零树读）。

### 11.2.3 arena 三相 API

改前：单个 `TypedExprTypeArenaBuildFromParserTreeInto(tree, authority, out, err)` 把三件事交织在一个函数体里（约 330 行）。

改后：三件事各自成入口，整林入口收缩为顺序包装：
```
fn TypedExprTypeArenaAllocateFromLimitsInto(limits, authority, out, state, err): bool
    # 建 value（计数全部取自 limits，不读 tree）+ ReserveColumns + BuildStateInitInto + SeedSemanticScalarRows
fn TypedExprTypeArenaAppendSourceFromTreeInto(value, tree, authority, state,
        producerSourceIndex, producerSourceBase, tokenRowBase, bracketArgBase,
        genericSymbolBase, functionBase, groupBase, groupCount,
        typeSyntaxBase, pending, err): bool
    # 六个 Fill* + IndexFieldsSourceInto + FillDeclarationSymbols + BuildSyntaxOwnership
    # + ReserveAggregatesRec + PreflightBracketAuthority + InternSyntaxRec
fn TypedExprTypeArenaSealInto(value, state, pending, out, err): bool
    # FillGenericSymbolTypesRec → … → StrictValidateInto，全程无 tree

fn TypedExprTypeArenaBuildFromParserTreeInto(tree, authority, out, err): bool =
    # 整林包装：全部 view base = 0、groupCount = value.producerSourceCount
```
`pending`（泛型 apply 行）从原函数的局部量改为**调用方持有**并逐次穿参——逐源驱动下它必须跨 AppendSource 调用存活，而 Seal 才消费它。

**唯一的行为等价性风险点**（已实测排除）：`SeedSemanticScalarRows` 由"Fill* 之后"上移到 Init（Fill* 之前）。它的每一次 `Intern` 都传 `originTypeSyntaxNodeIndex = -1`，`Intern` 内唯一一处 `state.tree` 读是 `origin >= 0 ? … : …` 的**假分支**，因此不依赖任何已 Fill 的列。

## 11.3 每轮命令 + 原始输出（rc / lease_hits / 驱动 sha）

原始件全部在 `.rebuild/s1b_step3/r5/`。槽位 `.rebuild/COMPILE_SLOT.lock` 全程持有（`owner.txt` 写活 pid）。

### 11.3.1 本轮"当窗口基线"（**判据前置**：对照侧必须是本轮现烤的驱动）
```
$ .rebuild/s1b_step3/r5/bake_r5.sh base          # 未改动的已验证基线树
tag=base rc=0 wall=204s lease_hits=0 kd_sha256=240d83e9174f883347d6a58689f35d5084bf2efc90d12503c5d11e89121f1f1c
```

### 11.3.2 补丁应用
```
$ git apply --check  patches/s1b_step3b_limits.patch && git apply  …   # rc=0
$ git apply --check  patches/s1b_step3c_streaming_prep.patch && git apply …  # rc=0
  → typed_expr_type_arena.cheng  1140/125  sha 8788a1551a1b4e362257cbb43058b1b7d786d20577195929c18efcb317b496f5
  → compiler_csg.cheng            141/29  sha 99f1837e8e9750c5f0b00a625fb092d642aa85c3fd5c5535eaba91e974b1e58b
$ python3 split_patch.py patches/s1b_1c_seal_arena.patch seal_ok.patch seal_bad.patch
  OK 22 / FAIL 2   （失败的正是 3c 已经做过的那两处 viewTokenBase hunk，被 3c 取代，不入账）
$ git apply --check seal_ok.patch && git apply seal_ok.patch            # rc=0
$ <手工把项 0 的两处 variant 基址换成 viewTokenRowBase + 删派生基址>
$ python3 patches/check_no_inline_comment_after_or.py <三文件>
OK: no comment follows a `||` line in 3 file(s)
```

### 11.3.3 bake
```
$ .rebuild/s1b_step3/r5/bake_r5.sh d     # 基线 + 3b + 3c + seal_arena(22) + 项 0
tag=d  rc=0 wall=205s lease_hits=0 kd_sha256=319d33d31634a67a575ecd80df1a8757db1dc72ffb3df4851ecb8119da4476f8
$ <python3 stage2_edit.py; git apply stage2_only.patch>   # 三相 API，+141/−76，5 hunk
  → typed_expr_type_arena.cheng sha 2775a55a96867fe14b67132fa9ce990375773c114d6030ebc8d868a0b48516e2
$ .rebuild/s1b_step3/r5/bake_r5.sh s2
tag=s2 rc=0 wall=203s lease_hits=0 kd_sha256=13a4d289988ca4d86d86515506ff34f03e13cf8f5a19ca2868cfae6491908578
```
两次 bake **首轮即 rc=0**，`parent lease unavailable = 0`。

### 11.3.4 A/B 字节等价（同 `--in` / 同 `--out`，先 `rm -f`，只认同路径 A/B）

**电池一：A=`kd_base`（未改动基线）vs B=`kd_d`（+Seal 无树 +项 0）**
| 夹具 | A rc | B rc | lease_hits | 判词 |
|---|---|---|---|---|
| `ordinary_zero_exit_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`3cadb0ca…`） |
| `call_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL** |
| `cold_nested_fmt_interpolation_smoke` | 0 | 0 | 0/0 | **CMP=IDENTICAL** |
| `pair2` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL**（`compiler snapshot builder: portable TypeArena Symbol join duplicate`） |
| `arena_shapes` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL**（`parser type syntax: enum variant trailing syntax invalid`） |
| `closure8` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL**（`compiler parser receipt: … exprIndex=5 kind=1 line=50 surface=if`） |
| `v6_direct1_repro` | **125（环境作废）** | 0 | 0/0 | 见下 |

`v6` 的 A 侧原文：`compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=821068976 limit_bytes=805306368`（`lease_hits=0`）⇒ **环境作废**；单侧重跑（`v6_retry.sh`，同 `--in` 同 `--out`）`attempt=1 rc=0 lease_hits=0`，产物 `b78bca2950b70eac743967551fe02e3b2833fca02ac271fd13d661dc9dddec64`，与 B 侧逐字节相同 ⇒ **`RETRY_CMP=IDENTICAL`**。
⇒ **电池一 = 7/7 等价。**

**电池二：A=`kd_d`（+Seal 无树 +项 0）vs B=`kd_s2`（再 +三相 API）** —— 结果见 §11.3.5。

### 11.3.5 电池二原始输出（A=`kd_d` vs B=`kd_s2`）

| 夹具 | A rc | B rc | lease_hits | 判词 |
|---|---|---|---|---|
| `ordinary_zero_exit_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`3cadb0ca…`） |
| `call_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`8820bf39…`） |
| `cold_nested_fmt_interpolation_smoke` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`f1622e36…`） |
| `pair2` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |
| `arena_shapes` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |
| `closure8` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL** |
| `v6_direct1_repro` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`b78bca29…`） |

⇒ **电池二 = 7/7 等价，0 作废，0 租约撞车**（`ab_s2.txt` 逐侧 `lease_hits=0`）。`type_arena used` 两侧逐位相同（2140 / 2416 / 2944 / 6472 / 12060），与第四手同夹具同值 ⇒ **三相 API 不改任何 arena 数据**。
由电池一（`kd_base` ≡ `kd_d`）与电池二（`kd_d` ≡ `kd_s2`）传递 ⇒ **`kd_base` ≡ `kd_s2`**。

## 11.4 门内全量实测（默认 768MiB 门；两轮，同窗口对照）

| 量 | 基线 `kd_base`（14:09） | 本轮 `kd_s2`（14:44） |
|---|---|---|
| 驱动 sha（本窗口现烤） | `240d83e9…` | `13a4d289…` |
| `forest_parsed_lines`（pass0） | **234** | **234** |
| `forest_appended_lines`（**目标 234**） | **10** | **16** |
| 森林窗 `after_profile_lookup since_ms` | **无读数**（死在它之前） | **无读数** |
| 墙钟 | 295s | 380s |
| peak rss | 843,023,512 | 849,183,968 |
| 保底 `after_profile_source_payload_release` | 600,146,880 | 563,905,472 |
| `max_live` | 3,350,846 | 3,626,777 |
| `guard_hits` | 1（`rss_limit_exceeded rss_bytes=853,197,976`） | 1（`… 849,183,968`） |
| `lease_hits` | 0 | 0 |
| 死点 | **并林 pass1 `src=10`** | **并林 pass1 `src=16`** |
| 负载（run 前 / run 后 load avg） | 5.88,6.07,6.89 / 7.17,6.68,6.94 | 5.18,5.81,6.14 / 6.53,6.01,6.12 |
| `vm_stat` free（run 前） | 40,118 页 ≈ 627 MB | 62,542 页 ≈ 977 MB |
| `tag=ta_limits` | 无（已过 pass0 但未取该埋点轮） | `tokens=3,606,225 type_syntax=157,652 … column_bytes=70,962,784` |
| `type_arena` / `typed_ir_done` / `facts` | 0 行（无读数） | 0 行（无读数） |

**`live` 曲线（两轮都只到并林 pass1，`type_arena`/`typed_ir_done`/`facts` 三段在并林之后 ⇒ 0 行 = 无读数，不是 0 值）**

| 采样点（`tag=forest_parsed` / `tag=append_end`） | 基线 `kd_base` | 本轮 `kd_s2` |
|---|---|---|
| `src=0`（pass0 起） | `arena=266,976 rss=600,622,016 live=1,472,228` | `arena=266,976 rss=564,396,992 live=1,473,828` |
| `src=233`（pass0 末） | `arena=117,280 rss=690,652,192 live=3,092,779` | `arena=117,280 rss=734,839,888 live=3,096,015` |
| 死点前最后一源 | `append_end src=9 append_ms=2343 forest_arena=64,271,904 rss=842,679,448 live=3,350,822` | `append_end src=15 append_ms=1317 forest_arena=125,657,504 rss=849,183,968 live=3,626,777` |
| pass0 逐源 `arena` 分段和 | 1,292,606,112 B（max 单源 140,599,840 B） | 同左（逐源 parse 与计量代码未改） |

逐源 `forest_parse_begin` / `forest_parse_end` / `forest_parsed` 三条 `live=` 序列各 250 / 234 / 234 行，本窗口两轮都在 `src=233` 处正常收尾 ⇒ **pass0 的活块曲线两轮重合**（起 1.47M、末 3.09M），差异全部出现在并林 pass1。`append_end` 的 `forest_arena` 显示并林**已用**量随源线性增长（9 源 64 MB / 15 源 126 MB，占全林 1.29 GB 的 5~10%），**撞门发生在"一次预留全林总量 + 前几个源"这一段**，而不是数据搬完之时。

**读法**：
1. **同窗口基线自己就跑不完**（死在并林 `src=10`，守卫 853 MB）⇒ 按纪律，本窗口的门内读数**不能判代码**；两轮都只能记为**"墙仍在并林 pass1"**这一事实。
2. `kd_s2` 的 `forest_appended=16` 与基线的 `10` **不是代码差异**：并林半段本轮一字未动（`compiler_csg.cheng` 只带 3b 的 12 行埋点），两次的差别来自保底（600 MB vs 564 MB）与本机负载。
3. **`column_bytes = 70,962,784 B`**（tokens 3,606,225 / type_syntax 157,652）：与第三手实测 `70,931,312`（tokens 3,605,043 / type_syntax 157,503）差 **+31,472 B（+0.044%）**，原因是本轮的驱动多 36 个可达函数（`reachable_live function_count=16885` vs 基线 16849，本轮新增的三相入口把它们的被调函数拉进可达集）⇒ 逐源列总量随之微增。**缺口结论不变**：② + ⑥ 后仍超默认门约 13.1 MiB。

### 11.4.1 `forest_appended` 的计数语义（**归因前置，先读这条**）

**结论：本轮两次门内读数的 `forest_appended` 是同一个计数器、数的是同一件事，但两次的差不是本轮改动的效果——因为本轮改动根本不在并林半段的执行路径上。**

代码证据（本轮交付态实读）：
1. `forest_appended` 的唯一发射点 = `compiler_csg.cheng:33246`，位于 `CompilerCsgBuildParserForestAuthorityInto` 的 `mergePass == 1` 分支内、紧跟 `parser.ParserValueExprTreeAppendFrom(out, sourceTree)`（`:33235`）之后 ⇒ 语义 = **"第 pass1 个已完成整林 append 的源序号 + 1"**，即"并林推进到第几个源"。
2. **⑥ 本轮未做**，并林半段一字未动 ⇒ 两次读数里这个计数器的语义**完全相同**，可比。
3. 本轮 patch 链对 `compiler_csg.cheng` 的**唯一**改动是 3b 在 **pass 0 seal 处**加的 `ta_limits` 埋点块（`git diff` 该文件的 6 个 hunk 里，落在 `CompilerCsgBuildParserForestAuthorityInto` 的那几个：`:33073/33128/33165/33196/33227`，全部在 pass0 计量与 `ta_limits`；`ParserValueExprTreeAppendFrom` 与 `forest_appended` 两行在 diff 里是 **context（未改）**）。`typed_expr_type_arena.cheng` 的改动不在并林路径上。
4. ⇒ 基线 10 vs 本轮 16 的差**不可归因于本轮代码**：两者都在**同一位置**（并林 pass1）被守卫杀掉，差别来自保底水位（600,146,880 vs 563,905,472 B）与负载漂移。
5. **对将来的 ⑤⑥ 手**：⑥ 一旦落地，`forest_appended` 的发射点连同整个 `mergePass` 循环一起被删，这个计数器**将不再存在**。届时"目标 234"必须二者其一：(a) 由逐源驱动在 arena append 之后**重新发射** `tag=forest_appended`（保持与用户判据同名）；(b) 判据改到门禁脚本已预留的 `tag=ta_stream`（当前树 0 行）。**必须在 ⑥ 的同一 patch 里写死选哪一个，否则"234"会变成一个没有发射点的数字。**

### 11.4.2 父席三点判断的逐条回应（**其中一条需要更正**）

- **①「方向是对的：⑤⑥ 把并林推进得更深（16 vs 10）⇒ 每源内存代价下降」——不成立，需更正。** 本轮**没有做 ⑤⑥**：并林半段与 `forest_appended` 发射点一字未动（证据见 §11.4.1 第 2、3 条）。16 vs 10 是**同一段代码在两个水位下的两次读数**，不是"改进后的推进深度"。**本轮拿不到任何"并林推进更深"的门内信号**；能拿到的门内事实只有一条：**同窗口下未改动的基线自己也死在并林 pass1（10/234）**，因此该窗口的门内读数只能作同窗口相对参考。
- **②「离达标毫无接近，不要写成内存下降 N%」——同意，且本轮报告全文没有出现任何内存下降百分比。** 需补充的是：本轮**根本没有可归因的内存变化**——`max_rss` 843,023,512（基线）vs 849,183,968（本轮）= **+6,160,456 B**，方向与"降内存"相反，且落在保底漂移量级内，同样不可归因。
- **③「必须确认计数语义」——已按上面 §11.4.1 写死并附代码证据。**

### 11.4.3 窗口可比性（**写死**）

> **本轮门内读数仅用于同窗口相对比较，不用于达标判定。**

依据（三条，全部本窗口实测）：① 同窗口未改动的基线驱动 `kd_base` **自己就跑不完**（`forest_appended=10`，守卫 `rss_limit_exceeded rss_bytes=853,197,976`）；② 基线保底从上一窗口的 490,062,784 B 涨到本窗口的 600,146,880 B（**+110,084,096 B**），死点从"并林 pass1 `src=24`"退化到"`src=10`"；③ 本窗口机器负载 load avg 5.18~7.67、`vm_stat` free 约 0.6~1.0 GB，属上一手记录的"环境漂移"未消退。⇒ 任何"通过/未通过"的门内判词在本窗口都**无效**；本轮的 `STEP3 NOT ESTABLISHED` 依据的是**代码缺口（⑤-c/d/e 与 ⑥ 未做）**，不是门内读数。

## 11.5 ⑤⑥ 未做的原因（**本轮最要紧的产出**）与下一步最小动作

施工图 §1.2 判定 ⑤ 的前置"已齐"（Init 入参 / 六个 `Fill*` view 形参 / `IndexFieldsSourceInto` / 预分配）。**实读代码后不成立**：这三样只是 **fill 相**的形参，逐源驱动还要穿三个面，逐条给出锚点与现状（锚点按本轮交付态重新 grep）：

**(A) append 相还有 5 个函数读 parser 树，且按**全局行**寻址——必须改造成全局行正确**
| 函数 | 现状 | 逐源需要 |
|---|---|---|
| `typedExprTypeArenaFillDeclarationSymbols` (:6186) | 吃 `tree`，写 `value.symbolDeclarationRootTypeSyntaxNodeIndexes` 等 | 写入的行必须 `viewTypeSyntaxBase + 源内行` |
| `typedExprTypeArenaBuildSyntaxOwnership` (:4405) | 17 处 `state.tree`，按 `state.tree.typeSyntaxCount` 建**局部**数组，再整段 append | `state.typeSyntaxParentNodeIndexes` / `…EnclosingSymbolIds` 必须**全局长度、Init 期分配、逐源填本源的切片**（父节点恒同源，判词 `TypeSyntax parent crosses source` 保证） |
| `typedExprTypeArenaReserveAggregatesRec` (:6248) | 吃 `tree`，`symbolId` 从 0 扫到 `value.symbolCount` | 改为**本源 symbol 区间**；`declarationRoot` 解出后要 `−viewTypeSyntaxBase` 才能喂树，`state.fieldCountsByDeclarationRoot[...]` 仍用全局根 |
| `typedExprTypeArenaPreflightBracketAuthority` (:1743) | 14 处 `state.tree`，含 `typedExprTypeArenaBracketConstLength` (:1722) 的树遍历 | 同上；`BracketConstLength` 需要在 append 相就地求值成列（施工图 §2.1 的 `typeSyntaxBracketConstLengths`，本树**没有**该列） |
| `typedExprTypeArenaInternSyntaxRec` (:6286) | 19 处 `tree`，并经 `ResolveNominal` (:1585，12 处 `state.tree`)、`CompleteGenericArgumentsInto` (:5430)、`FunctionParamCount` (:2321)、`TupleChildNameId` (:2391)、`Intern` (:~1200) 读树 | 行域是"树内局部行 vs `value.*`/`state.authority.*` 全局行"两个坐标系，每个边界都要显式换算；`ResolveNominal` 的 `typeSyntaxTypeIds[declarationRoot]` 跨源读要求"跨源边恒指向更小全局行"这一既有不变量继续成立 |

**(B) 权威相没有逐源入口。** 现存只有 `TypedExprTypeResolutionAuthorityBuildPackageForestInto` (:3183)，它吃**整林**树；跨源解析（`FindDeclaration` :2836 / `DeclarationExportedInto` :2973 / `ResolveUnqualified/Qualified` :3053/:3106 / `FindGenericSymbol` :3004）全部读树。逐源版必须改成**读 S1a 索引**（`typeSyntaxBaseBySource` + 排序条目 + 0b 的 `…IndexEntryLess/ForRoot/Exported` 已在库），同源部分仍可读本源树。**这是本轮最大的未做面**（约 250 行新代码）。

**(C) R1（`typed_expr.cheng`）没有逐源入口。** `TypedExprBuildSourceContextExactIndexWithManualAuthority` (:66566) 一次性用整林建 build-index；0d 已经把单 ctx 体抽成 `TypedExprBuildIndexAppendContextCallDeclarationsManual` (:36953)，`TypedExprBuildIndexSealCallDeclarations` (:31089) 也在，**缺的是**：① 一个"只建 core + lookup、不 seal"的入口；② 在流式循环内按 `ctxIndex = producerSourceIndex` 逐源 append；③ 循环后 seal。

**(D) `compiler_csg.cheng` 的驱动器重构与删除点**（本轮未动，交付态 `141/29`）
- 删除点：`CompilerCsgBuildParserForestAuthorityInto`（`:33067`）的 `mergePass` 二遍结构（`:33130`（`var totalArenaBytes`）～ `:33269`，其中 `:33235` 是 `ParserValueExprTreeAppendFrom(out, sourceTree)`、`:33246` 是 `forest_appended` 埋点）、`out` 形参、以及函数尾部的覆盖校验（`:33265` 起）；
- 替换点：`CompilerCsgTypeArenaFinalizeParserForestInto`（`:35612`）整函数 → 逐源版本；
- 逐源对拍门现成：`TypedExprTypeDeclarationIndexVerifySourceAgainstInto`（0f，`:3584`）替代 `…VerifyAgainstForestInto`（`:3342`，整林）；
- `work.typeArenaParserForest` 的全部引用（`:1471` 字段、`:35621/35622/35634/35638/35643/35646/35651/35653`（Finalize 内）、`:36102`、`:36133`、`:38953`、`:38966`、`:38980`；本轮交付态实 grep，共 14 处）；
- `ta_stream` 埋点（门禁脚本已留计数器，本树 0 行）。

**下一步最小动作（严格按序，每步可独立判等价）**
1. **（A）**给上述 5 个函数加 `viewTypeSyntaxBase` 并做全局行改造，整林驱动一律传 0 ⇒ 与 §11.2.3 同法**判等价**（本轮的 `AppendSourceFromTreeInto` 形参已经把位置留好）。
2. **（B）**新增 `TypedExprTypeResolutionAuthorityBuildSourceInto(tree, producerSourceIndex, typeSyntaxBase, index, sortedEntryRows, imports, out, err)`，用 S1a 索引做跨源解析；判据 = 与整林权威**逐位同**（可在小夹具上直接把两个 authority 的四个列逐元素 cmp）。
3. **（C）**R1 拆 core/lookup（不 seal）→ 逐源 append → seal。
4. **（D）**`compiler_csg.cheng` 换成 `CompilerCsgStreamTypeArenaFromDeclarationIndexInto`：pass0 原样（parse → 计量 → `…DeclarationIndexBuildSourceInto` → `…VerifySourceAgainstInto` → `TreeRelease`）→ 逐源 `parse → 权威 BuildSourceInto → arena AppendSource → R1 append → TreeRelease` → `SealCallDeclarations → arena Seal → typed_context_lookup_built` → 删并林半段与 `typeArenaParserForest` 全部引用。
5. 门内判据不变（`forest_appended=234` 且无 `rss_limit_exceeded`）。**注意**：按实测列总量重算，②+⑥ 后仍超门 **13.1 MiB**（§11.4 第 3 点），⑤⑥ 落地后仍须补 §9.5.3 的 1~4 号杠杆。

## 11.6 纪律回执

- **patch 通道**：全程 `diff -u`（`mkpatch_r5.py` / `split_patch.py`）→ `git apply --check` → `git apply`；撤回 `git apply -R`。**无 `cp` 整文件进树、无 `git checkout --`/`git restore`/`git stash`**。（`.rebuild/s1b_step3/r5/preview/`、`stage2_base/` 等 scratch 副本只用于生成 diff 与只读比对，不参与交付。）
- **槽位**：`.rebuild/COMPILE_SLOT.lock` 全程持有（`owner.txt` 写 pid + 时间 + 用途）。本轮**全部编译轮**（3 bake + 2 gate + 2 battery 全部侧 28 次 + 1 重试，共 34 份 stderr）实测 `parent lease unavailable` = **0 次**。
- **收敛**：`converge_r5.sh` 实跑七段（forward → −3d → −3c → −3b → +3b+3c+3d → −3b−3c−3d），`A == E`、`D == F` 逐位可逆；**绝未留半流式态**。
- **判据/测量与被执行路径对齐**：A/B 全部同 `--in` 同 `--out`、先 `rm -f`、只认同路径产物；电池驱动路径在 `driver_for()` 里用**本轮现烤**的 `kd_<label>`，不存在跨轮串用；`v6` A 侧的环境作废**用同 `--out` 单侧重跑**判掉，不记在代码账上。
- **作废三分类（本轮全部）**：
  - **环境作废 1**：`ab_v6.A` attempt1，`rc=125` + `lease_hits=0` + 末行 `compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=821068976 limit_bytes=805306368`；重跑 `rc=0` 且与 B 逐字节同 ⇒ 结论不采用该轮，采用重跑轮。
  - **补丁编译错误 0**：两次 bake 首轮 rc=0。
  - **租约撞车 0**。
  - **harness 缺陷 0**：本轮电池脚本的 A/B 路径与 `--out` 一次到位；`seal_arena` 的 2 个 hunk 被 3c 取代，属**补丁组合**问题，在应用前由 `split_patch.py` 逐 hunk 检出，未产生作废轮。
- **语言坑**：每次改完即跑 `patches/check_no_inline_comment_after_or.py`（三文件 / 交付文件）→ 全绿。
- **抬门标注**：本轮**没有任何抬门轮**（两次门内全量都用默认 768MiB 门）。
- **未 commit / 未 push / 未建分支或 worktree**；原始件 + `MANIFEST.sha256` 在 `.rebuild/s1b_step3/r5/`。

## 11.7 判词

```
STEP3 NOT ESTABLISHED
```
- **本轮的 16 vs 10 不是本轮改动的效果**：并林半段与 `forest_appended` 发射点未改（§11.4.1），两次读数同一段代码、同一死点，差来自保底漂移 ⇒ **本轮没有任何可归因的门内推进**。
- **卡点**：⑤-c/d/e 与 ⑥ 未做 ⇒ 默认门内 `forest_appended` 仍是两位数（本窗口 `kd_s2` = 16，目标 234），死在**并林 pass1**；**且**同窗口未改动的基线驱动自己也在同一位置撞门（`kd_base` = 10，守卫 853,197,976 B）⇒ 本窗口门内读数属**环境受限口径**，不作为代码判据。
- **本轮实质进展**：① 项 **0 已修**（0c 遗留缺陷，与新增的 `typeSyntaxEnumVariantNameTokenIndexes` 列同法换成显式形参）；② **Seal 相彻底无树**落地（⑤ 的硬前置，此前不在树上），③ **arena 三相 API** 落地（`AllocateFromLimitsInto` / `AppendSourceFromTreeInto` / `SealInto`，整林驱动收缩为恒等包装）。以上**两轮 A/B 全绿**（电池一 7/7；电池二见 §11.3.5）。
- **取代关系**：本判词取代 §10.8 与 `.rebuild/s1b_step3/VERDICT_step3.txt` 的上一代；两代不得并存。


---

# S1b 第③步 · 第六手（2026-09-11 16:xx）—— ⑤ 的 append 相全局行改造落地并判等价；**⑤-c/d/e 与 ⑥ 全量写出但不编译**，树已收敛回已验证基线

> 判词（本轮）：**STEP3 NOT ESTABLISHED**（默认门内 `forest_appended` 仍是两位数；本轮**没有可交付的逐源驱动**）。
> 本条**取代** §11.7 与 `.rebuild/s1b_step3/VERDICT_step3.txt` 的上一代判词；两代不得并存，`VERDICT_step3.txt` 已改写。

## 12.0 一句话

本轮把 **⑤ 的最后一个硬前置——append 相的全局行改造（含 `BuildSyntaxOwnership`/`Preflight`/`InternSyntaxRec`/`ResolveNominal` 的局部↔全局坐标换算与 bracket 常量长度列）** 做完、烤出驱动、**A/B 7/7 判等价**；**⑤-d 逐源权威、⑤-e R1 逐源、⑤-c/⑥ compiler_csg 逐源驱动与删并林半段** 三件**全部写出**（3f patch，+1432 行级）但**未通过 cold 编译器的 `FunctionContractAdmission [body-store-freeze]` / exact-ownership 门**，止步于 `CompilerCsgStreamTypeArenaFromDeclarationIndexInto` 的 `BodyIR exact identity schema is invalid`。树已**完全回退到已验证基线**（`typed_expr 56/23`、`type_arena 450/1 sha 8b8332ee…`、`compiler_csg 129/29 sha 42fd9f09…`）。**本轮最重要的单点产出**：发现并定位 **3d 的潜伏回归** `typeSyntaxEnumVariantProducerSourceIndexes` 写的是 `viewProducerSourceIndex`（整林驱动恒 0）而不是 `viewProducerSourceBase + 行内值` ⇒ 多源构建中**任何不在源 0 的 enum** 都会在 Seal 被 `BuildEnumDeclaration` 的 `variantProducerSource != producerSourceIndex` 拒掉；单源夹具看不到（这正是 3d 的 A/B 全绿却仍带病的原因）。

## 12.1 ⑤⑥ 逐条完成度（累计）

| 项 | 内容 | 状态 | 证据 |
|---|---|---|---|
| **0** | variant 列 rebase 基址 | 已做（第五手） | `s1b_step3d_seal_treefree.patch` |
| **⑤-a** | Seal 相彻底无树 | 已做（第五手） | 同上 |
| **⑤-b** | arena 三相 API | 已做（第五手） | 同上 |
| **⑤-b2** | **append 相全局行改造**（本轮） | **已做并判等价** | `patches/s1b_step3e_global_rows.patch`（sha `c49d594d801659c7ac5bc3266ff5ae3d68192d9aadf78f34482e24e6854b16fc`，855 行，单文件 `typed_expr_type_arena.cheng`）；A/B `preA` vs `a1` = **7/7** |
| **⑤-c** | compiler_csg 逐源驱动 | **写出但未编译** | `patches/s1b_step3f_streaming_wip.patch`（sha `07379802a72dcf0781f7b5585f4d5e4566c5497c997ad01b3a39bb3fb296135f`，1432 行，三文件） |
| **⑤-d** | 逐源权威 `…ResolutionAuthorityAppendSourceInto` | **写出但未编译** | 同上：索引驱动的 `…IndexFindDeclaration` / `…IndexDeclarationExportedInto` / `…IndexResolveUnqualifiedInto` / `…IndexResolveQualifiedInto` / `…FindGenericSymbolSourceInto` + `…StreamingBegin` / `…SealInto`（原地封口） |
| **⑤-e** | R1 逐源 | **写出但未编译** | 同上：`TypedExprBuildIndexAppendSourceCallDeclarationsManual` + `typedExprBuildIndexAddManualScopeCallDeclarationsRec` 增 `treeProducerSourceIndex` 形参（单源树自编号 0，记录值仍全局）+ 原入口增 `sealCallDeclarations` 开关 |
| **⑥** | 删并林半段 + `typeArenaParserForest` 全部引用 | **写出但未编译** | 同上：`grep -rn typeArenaParserForest src/` = **0 命中**（交付态实测），`mergePass` 双遍结构、一次预留、`ParserValueExprTreeAppendFrom` 调用点全删；`forest_appended` 由逐源驱动**重新发射**（语义写死为"已消费源数"，同 patch 内同时发 `ta_stream`） |

## 12.2 ⑤-b2 改动前后原文（`typed_expr_type_arena.cheng`）

1. **`typedExprTypeArenaBuildState`** 增 `bracketConstLengths: int32[]`；`BuildStateInitInto` 在 Init 期一次性分配 `typeSyntaxParentNodeIndexes` / `typeSyntaxEnclosingSymbolIds` / `bracketConstLengths`（全局长度 = 索引 TypeSyntax 总数，初值 `-1`）。改前这三者里前两个是 `BuildSyntaxOwnership` 每次调用**新建局部数组再整段 append**。
2. **`BuildSyntaxOwnership(state, localOut, viewTypeSyntaxBase, err)`**：局部扫描不变（父节点恒同源，判词 `TypeSyntax parent crosses source` 保留），结果写进 `state.*` 的**全局切片** `[base+row]` 并顺序 append；`symbolByDeclarationRoot` 的下标改 `base + declarationOwner`。
3. **`FillDeclarationSymbols(value, tree, state, viewTypeSyntaxBase, viewProducerSourceBase, viewTokenRowBase, err)`**：`symbolDeclarationRootTypeSyntaxNodeIndexes` 写全局行；`symbolProducerSourceIndexes` 写 `base + 树值`；`symbolDeclarationOwnerTokenIndexes` 写 `rebase(tokenRowBase, 树值)`；上界校验改 `value.producerSourceCount`（整林下与 `tree.producerSourceCount` 同值）。
4. **`ReserveAggregatesRec(value, state, symbolBase, err)`**：删 `tree` 形参；`AggregateStructuralKind`/enum variant count 改读 arena 列（`typeSyntaxParserKinds` / `typeSyntaxEnumVariantCounts` / `…VariantRowAt` + `…PayloadTypeNodeAt`）；遍历从本源首 symbol 起。
5. **`PreflightBracketAuthority(state, value, err)`**：14 处 `state.tree` 全部改 arena 列（kind / child CSR / bracket arg CSR / generic symbol count+start / generic default 节点）。`declarationRoot` 可能是**更早源**的行（跨源边恒指向更小全局行），树上已无该源 ⇒ 必须走列，这是本条不能只做坐标换算的原因。
6. **`typedExprTypeArenaMaterializeBracketConstLengths(tree, state, viewTypeSyntaxBase, err)`（新）**：append 相就地跑 `typedExprTypeArenaBracketConstLength`（parser 常量求值器，只能在树在场时跑），把结论写进 `bracketConstLengths[base+row]`，`-1` = 原布尔 false。Seal 相 Preflight 只读列。
7. **`InternSyntaxRec(value, tree, authority, state, pending, typeSyntaxNodeIndex, viewTypeSyntaxBase, viewTokenRowBase, err)`**：循环变量保持**全局**；每步 `let treeRow = typeSyntaxNodeIndex - viewTypeSyntaxBase`，树读一律走 `treeRow`；凡**必须全局**的 parser 事实（子行、kind、question token、bracket arg、generic count/start）改走 arena 列。`typeSyntaxNodeIndex` 每步 +1 仍写全局 `typeSyntaxTypeIds`。
8. **`ResolveNominal(state, localOut, typeSyntaxNodeIndex, viewTypeSyntaxBase, viewTokenRowBase, typeIdOut, err)`**：本行读数走 `treeRow`；`genericSymbolNameTokenIndexes` 的全局 token 行减 `viewTokenRowBase` 回树；**声明根**（可能跨源）的 owner-token 与文本改读 `typedExprTypeArenaSyntaxDeclarationOwnerTokenAt` / `…DeclarationOwnerTokenTextAt`。整林驱动 base=0 ⇒ 全部恒等。
9. **`CompleteGenericArgumentsInto` / `FunctionParamCount` / `TupleChildNameId`**：同法；前三者的 declarationRoot 事实全部改列。
10. **`AppendSourceFromTreeInto`**：新增 `genericSymbolChildBase` 形参（原第五手把 `genericSymbolBase` 塞进了 `FillGenericSymbols` 的 `viewGenericSymbolChildBase` 槽位——整林下两者都是 0 所以看不出来），`state.authority = share(authority)` + `authorityUsed`/`genericAuthorityUsed` **按需增长**（流式驱动逐源追加权威行；整林驱动长度已足 ⇒ 恒等），`symbolBase` 捕获后传给 `ReserveAggregatesRec`，`InternSyntaxRec` 从 `typeSyntaxBase` 起走。

## 12.3 【本轮最重要的发现】3d 的潜伏回归：variant producer source 列

`FillTypeSyntax` 里 0c/3d 写的是：
```
            arenamod.ArenaArrayInt32Add(
                value.arena,
                value.typeSyntaxEnumVariantProducerSourceIndexes,
                viewProducerSourceIndex)
```
整林驱动 `viewProducerSourceIndex = 0`（`TypedExprTypeArenaBuildFromParserTreeInto` 的第一实参），于是**每个 variant 行的 producer source 都被写成 0**。而 Seal 相 `BuildEnumDeclaration` 有一条真判据：
```
        let producerSourceIndex =
            typedExprTypeArenaSyntaxProducerSourceIndexAt(localOut, declarationRoot)   # 全局真值
        ...
        if variantProducerSource != producerSourceIndex || ...
            err = " typed expr type arena: enum variant authority invalid"
```
⇒ **任何不在源 0 的 enum 都会在 Seal 被拒**。3d 的 A/B 全绿是因为六个夹具的 enum 全在源 0（单文件夹具）＋全量构建根本走不到 Seal（死在并林 pass1），**两个条件同时掩盖了它**。正确形态是与其它坐标列一致的 0c rebase 形式：
```
                viewProducerSourceBase +
                    arenamod.ArenaArrayInt32Get(
                        tree.arena,
                        tree.typeEnumVariantProducerSourceIndexes,
                        variantRow)
```
（整林 base=0 ⇒ 恒等旧行为；逐源 base=i ⇒ 真值。）**该修复在本轮 3f 里，未单独烤验**；下一手必须补一个"enum 在被 import 的第二个源里"的夹具来证明它，否则这条回归会一直躺在 3d 里。

## 12.4 每轮命令 + 原始输出（rc / lease_hits / 驱动 sha）

原始件全部在 `.rebuild/s1b_step3/r6/`。槽位 `.rebuild/COMPILE_SLOT.lock` 全程持有（`owner.txt` = pid + UTC 时间 + 用途）。

### 12.4.1 同窗口对照驱动（**判据前置**：对照侧必须是本轮现烤）
```
$ .rebuild/s1b_step3/r6/bake_ctl_r6.sh
tag=preA rc=0 wall=203s lease_hits=0 kd_sha256=33181030ce6a37e5bd1d7b0ff018a449ff81a0318d61cf22766efa1affc85fc3
tag=base rc=0 wall=204s lease_hits=0 kd_sha256=240d83e9174f883347d6a58689f35d5084bf2efc90d12503c5d11e89121f1f1c
RESTORE=IDENTICAL      # stage-A patch 反打后逐位可逆
```
其中 `kd_base` 的 sha 与第五手 14:09 窗口的 `kd_base` **逐位相同**（`240d83e9…`）⇒ 该驱动的自举是确定性的，跨窗口差异来自负载/内存而不是驱动。
```
$ .rebuild/s1b_step3/r6/bake_r6.sh a1     # 基线 + 3b + 3c + 3d + ⑤-b2(全局行改造)
tag=a1 rc=0 wall=201s lease_hits=0 kd_sha256=3cb82c7b08ec74e715d56f3a65e212cf93c45fc55ddbd016abff7826ced9a017
```

### 12.4.2 A/B 字节等价（`ab_r6.sh preA a1`，同 `--in` / 同 `--out`，先 `rm -f`，只认同路径）
| 夹具 | A rc | B rc | lease_hits | 判词 |
|---|---|---|---|---|
| `ordinary_zero_exit_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`3f4d8e8e…`） |
| `call_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL** |
| `cold_nested_fmt_interpolation_smoke` | 0 | 0 | 0/0 | **CMP=IDENTICAL** |
| `pair2` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL**（`compiler snapshot builder: portable TypeArena Symbol join duplicate`） |
| `arena_shapes` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL**（`parser type syntax: enum variant trailing syntax invalid`） |
| `closure8` | 2 | 2 | 0/0 | NO_ARTIFACT / **JUDGEMENT=IDENTICAL**（`compiler parser receipt: … exprIndex=5 kind=1 line=50 surface=if`） |
| `v6_direct1_repro` | **125（环境作废）** | 0 | 0/0 | 见下 |

`v6` A 侧原文：`compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=811582592 limit_bytes=805306368`（`lease_hits=0`）⇒ **环境作废**。同 `--out` 单侧重跑（`v6_retry.sh`）：`A attempt=1 rc=0 lease_hits=0 sha256=174f5ba0dd860fac92a76f7af28d9fa193381be0bcdb3d2c7304e29389c023a8`，与 B 侧产物**逐字节相同** ⇒ **RETRY_CMP=IDENTICAL**。
⇒ **电池 = 7/7 等价**（3 CMP + 3 JUDGEMENT + 1 重跑 CMP）。

### 12.4.3 3f（⑤-c/d/e + ⑥）的编译轮与作废
| 轮 | 命令 | rc | lease_hits | 末行原文 | 三分类 |
|---|---|---|---|---|---|
| b#1 | `bake_r6.sh b`（3f 初版） | 2 | 0 | `borrowed call argument rejected` / `reachable function body missing: texpr.typedExprBuildIndexAddContextCallDeclarationsWithManualAuthority` | **补丁编译错误** |
| b#2 | 同上（`@borrows` 归位后） | 2 | 0 | `managed bind move lacks exact source value definition` / `…TypedExprBuildSourceContextExactIndexStreamingBegin` | **补丁编译错误** |
| probe#1..6 | `cheng_cold_v3 system-link-exec …`（同一驱动命令，快速探针） | 2 | 0 | 依次为 `overlapping places cannot bind multiple var formals in one call` → `borrowed actual cannot bind … formal_ordinal=0 … caller=…AllocateFromLimitsInto callee=…BuildStateInitInto` → `unknown identifier … CompilerCsgBuildParserForestAuthorityInto` → `BodyIR exact identity schema is invalid … TypedExprBuildSourceContextExactIndexStreamingBegin` → `managed replace tuple is broken … TypedExprResolutionAuthoritySealInto` → **`FunctionContractAdmission [body-store-freeze] row=12390 fn=ccsg.CompilerCsgStreamTypeArenaFromDeclarationIndexInto reject: BodyIR exact identity schema is invalid`（最终卡点）** | **补丁编译错误** |

**没有一次是租约撞车**（`parent lease unavailable` 全程 0），**没有一次是环境作废**（都是 `rc=2` 且原文指向新源码）。

## 12.5 门内全量实测（默认 768MiB 门）

**交付态 = 已验证基线**，所以本轮门内读数就是**同窗口基线对照本身**：

| 量 | 本窗口 `kd_base`（16:15） | 第五手窗口 `kd_base`（14:09） |
|---|---|---|
| 驱动 sha（同窗口现烤） | `240d83e9…` | `240d83e9…`（逐位相同） |
| `forest_parsed_lines`（pass0） | **234** | **234** |
| `forest_appended_lines`（**目标 234**） | **24** | **10** |
| 森林窗 `after_profile_lookup since_ms` | **无读数**（死在它之前） | 无读数 |
| 墙钟 | 494s | 295s |
| peak rss | 842,171,568 | 843,023,512 |
| 保底 `after_profile_source_payload_release` | `rss_bytes=571,343,808 live_allocations=1,471,835`（`since_ms=33763`） | 600,146,880 |
| `max_live` | 3,958,941 | 3,350,846 |
| `guard_hits` | 1（`rss_limit_exceeded rss_bytes=821,953,736`） | 1（`…853,197,976`） |
| `lease_hits` | 0 | 0 |
| 死点 | **并林 pass1 `src=24`** | 并林 pass1 `src=10` |
| 负载（run 后 load avg） | 见 `gate/base_kd_base.env.txt` | 5.18,5.81,6.14 |
| `type_arena` / `ta_limits` / `typed_ir_done` / `facts` | 全 0 行（无读数） | 全 0 行 |

**读法**：① 保底比第五手窗口低 **28.8 MB**（571 MB vs 600 MB）、死点从 `src=10` 回到 `src=24` ⇒ **本窗口比第五手窗口"宽"**，但**离 234 仍然差一个数量级**；② `kd_base` 与第五手窗口的 `kd_base` **驱动 sha 逐位相同**，所以这两个读数**不是代码差异**，纯粹是机器状态；③ **本轮没有任何"改动后"的门内读数**——3f 不编译，`kd_a1` 是恒等改造（7/7 等价），再花一次门测只会重复基线。

> **本轮门内读数仅用于同窗口相对比较，不用于达标判定。**

## 12.6 未完成项与"下一步最小动作"

**为什么没做完（一句话）**：⑤-c/d/e/⑥ 的**逻辑**全部写出来了（`grep typeArenaParserForest src/` 已真零命中、并林段已删、逐源权威/逐源 R1/逐源驱动三件齐备），但 cold 编译器的 **exact-ownership / body-store-freeze 准入**在这条新代码路径上连续拒绝了 6 次；前 5 次都是**可机械归一的形态问题**（已全部修掉，见 §12.7），第 6 次卡在一个**没有明细输出的** `BodyIR exact identity schema is invalid`，需要二分定位而不是再猜。

**下一步最小动作（严格按序）**
1. **对 `CompilerCsgStreamTypeArenaFromDeclarationIndexInto` 做二分**：该函数 ~250 行、单函数。把它按 `os.ProcessResourceGuardCheck` 的循环切成 `…StreamingLoopInto(work, index, …, sourceIndex, …) bool` 递归（与全仓"Rec + 一个帧"的既有写法一致），先从候选体里移出**最大的一块**（建议：把 `importAuthority`/`sortedEntryRows`/`sortedImportRows`/`columnLimits`/`allocate` 的**前段**抽成 `…PrepareInto`），每抽一块跑一次 `cheng_cold_v3 system-link-exec`（**不必整烤**，30s 内即出准入判词）。目标是拿到**带明细的**拒绝行，而不是继续猜。
2. **把 3d 的 variant-producer-source 回归单独烤验**：新增夹具"第二个源里有一个 enum"，`kd_preA` 与"preA+单点修复"两侧跑，期望**修复侧 rc=0 / 未修复侧在 Seal 报 `enum variant authority invalid`**——这是本轮发现的最重要缺陷，必须先钉死再往上叠流式。
3. 回到 3f 的编译门；过门后再按 §12.4.2 的同一套 A/B（`preA` vs `b`）判等价。
4. 只有 3f 等价后，才做默认门全量实测（目标 `forest_appended=234`、森林窗消失）。**注意**：按 §11.4 第 3 点，②+⑥ 后流式峰值仍超门 **13.1 MiB**（`819,036,575 B` vs `805,306,368 B`），⑤⑥ 落地后仍须补 §9.5.3 的 1~4 号杠杆。

## 12.7 纪律回执

- **patch 通道**：全程 `/usr/bin/diff -u` → `git apply --check` → `git apply`；撤回 `git apply -R`。**无 `cp` 整文件进树、无 `git checkout --` / `git restore` / `git stash`**（`.rebuild/s1b_step3/r6/*.cheng` 的 scratch 副本只用于生成 diff 与只读比对，不参与交付）。
- **槽位**：`.rebuild/COMPILE_SLOT.lock` 全程持有（`owner.txt` 写 pid + 时间 + 用途）。本轮**全部编译轮**（3 bake + 1 控制 bake + 7 次快速探针 + 电池 14 侧 + 1 重试 + 1 门测）实测 `parent lease unavailable` = **0 次**。
- **收敛**：`land_r6.sh` 实跑（3f 反打 → 3e 反打 → 3d/3c/3b 反打 → 再正向 3b/3c/3d/3e `--check`）证明 **3e 在 3b+3c+3d 之上可干净应用与反打**；交付态 = `typed_expr 56/23 sha 32a99253…`、`type_arena 450/1 sha 8b8332ee…`、`compiler_csg 129/29 sha 42fd9f09…`，**绝无半流式态**。
- **判据与被测对象执行路径对齐**：A/B 全部同 `--in` 同 `--out`、先 `rm -f`、只认同路径产物；驱动一律取**本轮现烤**的 `kd_<label>`；`v6` A 侧的环境作废**用同 `--out` 单侧重跑**判掉，不记在代码账上。
- **作废三分类（本轮全部）**：
  - **环境作废 1**：`ab_v6.A` attempt1，`rc=125` + `lease_hits=0` + 末行 `resource_guard rss_limit_exceeded rss_bytes=811582592 limit_bytes=805306368`；同 `--out` 重跑 `rc=0` 且与 B 逐字节同 ⇒ 该轮不采用。
  - **补丁编译错误 8**：b#1 / b#2 / probe#1..#6，全部 `rc=2` 且 `lease_hits=0` 且原文指向本轮新源码（明细见 §12.4.3）。
  - **租约撞车 0**。
  - **harness 缺陷 1（已修，未记补丁账）**：`bake_ctl_r6.sh` 的 `diff -u` 被 DevEco 工具链的 `diff`（`/Applications/DevEco-Studio.app/.../toolchains/diff`）抢先，该实现不支持 `-u`；脚本在**任何写操作之前**退出（树未动，sha 校验一致），改 `/usr/bin/diff` 后重跑。
- **语言坑**：① `patches/check_no_inline_comment_after_or.py` 每次改完即跑 → 全绿；② **新发现**：`@borrows` 与 `fn` 之间**夹注释行会让属性失效**（本仓 HEAD 基线只有 1 处这种写法且恰好无害），症状是"borrowed actual cannot bind non-var non-@borrows formal"；本轮把自己引入的 8 处全部归位（脚本化审计 `@borrows` 下一行是否为注释）；③ `let x = <managed 调用结果>` 与 `var c = out; out = c` 这类**托管 bind/replace** 会被 `body-store-freeze` 拒（`managed bind move lacks exact source value definition` / `managed replace tuple is broken`），必须改 `var` + 赋值或**原地**改字段。
- **抬门标注**：本轮**没有任何抬门轮**（唯一门内全量用默认 768MiB 门）。
- **未 commit / 未 push / 未建分支或 worktree**；原始件 + `MANIFEST.sha256` 在 `.rebuild/s1b_step3/r6/`。

## 12.8 判词

```
STEP3 NOT ESTABLISHED
```
- **卡点**：默认门内 `forest_appended` 仍是两位数（本窗口基线 **24** / 目标 234），死在**并林 pass1 `src=24`**；**逐源驱动（⑤-c/d/e + ⑥）在本轮结束时不可编译**（`FunctionContractAdmission [body-store-freeze]`，见 §12.4.3），因此本轮**没有可交付的行为改变**。
- **本窗口门内读数属环境受限口径**：同窗口基线的**驱动 sha 与第五手窗口逐位相同**，但保底从 600,146,880 降到 571,343,808、死点从 `src=10` 回到 `src=24` ⇒ 同一份代码在两个窗口给出两个读数，**不作为代码判据**。
- **本轮实质进展**：① **⑤-b2 append 相全局行改造**落地并 **A/B 7/7 判等价**（`patches/s1b_step3e_global_rows.patch`）；② **发现并定位 3d 的潜伏回归**（variant producer source 列，§12.3）——多源 enum 必被 Seal 拒，单源夹具看不见；③ ⑤-c/d/e 与 ⑥ 的**全部代码写出**并留下 8 条精确的准入拒绝原文与修复路径（§12.4.3 / §12.6）。
- **取代关系**：本判词取代 §11.7 与 `.rebuild/s1b_step3/VERDICT_step3.txt` 的上一代；两代不得并存。

---

# S1b 第③步 · 第七手（2026-09-11 17:xx）—— ⑤-c/d/e+⑥ **已过编译与准入关**（新驱动现烤成功、三夹具字节等价）；enum 在非 0 源的负例钉死；门内 `forest_appended` 仍为 0

> 判词（本轮）：**STEP3 NOT ESTABLISHED**。
> 本条**取代** §12.8 与 `.rebuild/s1b_step3/VERDICT_step3.txt` 的上一代判词；两代不得并存，`VERDICT_step3.txt` 已改写。

## 13.0 一句话

两件优先任务都做完：**①**「enum 在非 0 源」的夹具补上并单独烤验——未修复侧在 Seal 精确报 `enum variant authority invalid`（负例判据原文在手），修复侧过该判据、且单源侧两侧产物**逐字节相同**；**②** 二分根本不必做——**拒绝行本来就带明细**，第六手只看了 `tail -1`。明细把卡点钉死在一条语句上：流式驱动把 `nil` 字面量传给 `TypedExprBuildSourceContextExactIndexWithManualAuthority` 的 **borrowing-managed 形参**，`body-store-freeze` 判 `cannot satisfy managed formal effect`。把它改成**同类型的声明位**（构造即 nil、永不被读）后，**3f 过编译与过准入**，驱动 `kd_b` 现场烤成（`rc=0`，`lease_hits=0`）。门内则**未达标**：全量 234 源在流式循环**第一次 guard 检查**就被拦下（`forest_appended=0`），同窗口基线对照为 24。

## 13.1 两件优先任务逐条

| 任务 | 要求 | 状态 | 关键证据 |
|---|---|---|---|
| **①** enum 在第二个源的夹具 + 单独烤验 3d 的 variant producer source 修复 | 未修复侧应在 Seal 报该判词；修复侧"正确接受"或"仍按判据拒绝"；**等价** | **已完成**（负例原文 + 等价原文 + "修复侧过判据后止步于预存在门"的原文） | `patches/s1b_step3h_enum_variant_producer_source.patch`；夹具 `docs/.../fixtures/r7_enum_*`；驱动 `kd_preA`(cc25373a…) vs `kd_fix`(ab3e607a…)，两侧 `rc=0 lease_hits=0`；§13.3 |
| **②** 二分 `CompilerCsgStreamTypeArenaFromDeclarationIndexInto` 拿带明细的拒绝行 | 让拒绝行**带明细**而不是继续猜 | **已完成，且不必二分** | 明细行原文见 §13.2；修复补丁 `patches/s1b_step3g_streaming_admission.patch`；探针 `probe_wip1`(rc=2) → `probe_e1`(**rc=0**)；驱动 `kd_b` 现烤 `rc=0 wall=201s lease_hits=0 sha 72b5966f…` |

## 13.2 任务②：拒绝行本来就带明细（本轮最值钱的单点）

**第六手看到的（`grep -v csg_mem | tail -1`）：**
```
cheng_cold: FunctionContractAdmission [body-store-freeze] row=12390 fn=ccsg.CompilerCsgStreamTypeArenaFromDeclarationIndexInto reject: BodyIR exact identity schema is invalid
```

**同一份 stderr 里、就在它上面一行（`grep 'exact identity schema'`）：**
```
cheng_cold: exact identity schema [body-store-freeze] fn=CompilerCsgStreamTypeArenaFromDeclarationIndexInto producer=12390 sentinel call_arg row=67 owner_call=354 callee=texpr.TypedExprBuildSourceContextExactIndexWithManualAuthority callee_row=9498 formal=1 formal_kind=4 formal_type=parser.ParserValueExprTree slot=319 offset=0 slot_kind=4 slot_size=8 slot_type=ptr slot_exact=-1 slot_place=0 slot_origin=-1 slot_storage=0 caller_generic_count=0 caller_template=-1 caller_decl_origin=12855 marker=-1 marker_count=0 marker_kind=-1 marker_a=-1 marker_b=-1 marker_c=-1 cannot satisfy managed formal effect
```
（`.rebuild/s1b_step3/r7/probe_wip1.log`，`probe=wip1 rc=2 wall=116s lease_hits=0`）

**为什么以前拿到的是"无明细"**：`cold_bodyir_exact_identity_schema_valid()`（`bootstrap/cheng_cold.c:69301`）的 78 条失败路径**全部**先 `fprintf` 明细再返回 false，外层 `cold_function_contract_reject` 打印 `reject:` 行在后 ⇒ 明细在拒绝行**之前**。用 `tail -1` 只能看到后者。**教训（已入 §13.10）**：准入拒绝一律 `grep 'exact identity schema\|reject:'` 取全文，禁止 `tail -1` 定性。

**判据解读**（对照 `bootstrap/cheng_cold.c:67683 cold_exact_formal_borrows_managed`）：形参要同时满足 `function->borrows_args`（即被 `@borrows` 标注）、`param_exact_type_id >= 0`、非 `var`、且类型需要 managed drop ⇒ 该形参是 **borrowing managed**，实参必须有精确值定义（检查要求实参槽上存在 `op_c < 0` 的 `COPY_I64/COPY_COMPOSITE` marker）。`slot_exact=-1 / slot_place=0 / marker=-1` 正是"`nil` 字面量"的指纹。

**改动（`patches/s1b_step3g_streaming_admission.patch`，1 hunk +9/-1）原文：**
```cheng
    var pending: typearena.typedExprTypeArenaPendingGenericApply
    pending = typearena.TypedExprTypeArenaPendingGenericApplyNew()
    # [S1b step-3 (7)] `manualTree` is consulted only on the sealing path, and
    # this driver never takes it: it appends one source's call declarations at
    # a time and seals once at the end.  The "no tree" value cannot be the
    # `nil` literal -- a borrowing managed formal needs an actual with an exact
    # value definition (body-store-freeze: "cannot satisfy managed formal
    # effect") -- so it is a declared place of the tree type, nil by
    # construction and never read.
    var streamingManualTree: parser.ParserValueExprTree
    if !texpr.TypedExprBuildSourceContextExactIndexWithManualAuthority(
           work.typedMetadataContexts,
           streamingManualTree,
           false,
           outLookup,
           buildErr):
```
改前是同一个调用点传 `nil`。**语义未变**：`sealCallDeclarations=false` ⇒ `typedExprBuildIndexForContextsManualAuthority` 直接走 `typedExprBuildIndexForContextsCore(sourceContexts, minCap)`，`manualTree` 在源码里根本不参与（`src/core/lang/typed_expr.cheng:37086`）。这不是绕过门禁：没有 env 旁路（`CHENG_HOTSWAP_SOURCE` 那条**未使用**）、没有裸指针、没有改判据，只是把"空树"表达成语言允许的**声明位**。

**结论：已过准入。** 过在哪一处改动上：就是上面这一处（`compiler_csg.cheng` 的 `CompilerCsgStreamTypeArenaFromDeclarationIndexInto` 内、`TypedExprBuildSourceContextExactIndexWithManualAuthority` 的实参）。全链（3b+3c+3d+3e+3f+3g vs HEAD）`compiler_csg.cheng` = **+448 / −186**。过门后 `kd_b` 现烤成功（`rc=0`），并跑出 3 个夹具的**逐字节相同产物**（§13.5）。

## 13.3 任务①：enum 在第二个源

**夹具与源序**：`import` 进来的源排在前面、入口文件在最后（本轮实测：`pair2` 的 `forest src=0 bytes=90` 是 90 字节的被导入 lib，`src=1 bytes=156` 是入口 main；case1 里 enum 声明在入口 ⇒ 未被拒的 case2 说明被导入 lib 才是源 0）。所以"enum 在非 0 源"的构造是**入口文件里声明 enum**。

**夹具**（`docs/campaigns/2026-08-31-kernel-userpath/fixtures/`）：`r7_enum_first_source_{main,v1,v2,v4,v6}`、`r7_enum_second_source_{main,lib}`、`r7_enum_first_source_lib`。

**两侧驱动**（**本轮现烤**、同窗口、树只差这一个 hunk）：`kd_preA` = 基线+3b+3c+3d（未修复），`kd_fix` = 同树 + `s1b_step3h_enum_variant_producer_source.patch`（即 3f 里那一处 FillTypeSyntax 修复单独拆出）。两驱动 `rc=0 wall=205s/203s lease_hits=0`。

| 夹具 | A = kd_preA（未修复） | B = kd_fix（修复） | 判词 |
|---|---|---|---|
| `r7_enum_first_source_main`（**入口源里 enum + 引用它的 object + import**） | rc=2 末行 **`compiler csg: TypeArena production failed:  typed expr type arena: enum variant authority invalid`** | rc=2 末行 `compiler snapshot builder: exact TypeSyntax remap mismatch` | **负例判据原文成立**；修复侧**过该判据** |
| `r7_enum_second_source_main`（enum 在**被导入源 = 源 0**，object 在入口） | rc=2 `exact TypeSyntax remap mismatch` | rc=2 同一句 | **两侧 stderr 非 `csg_mem` 部分逐字节相同**（`/usr/bin/diff` rc=0）⇒ 源 0 时修复是恒等 |
| `r7_enum_first_source_v1`（入口源里 enum 未被引用） | rc=2 `csg compiler snapshot: parser source reverse identity invalid` | 同 | 该形状在**更早的**预存在门就死，到不了 Seal |
| `r7_enum_first_source_v2`（enum 值流过函数签名） | rc=1 `typed expr: call declaration static argument type unavailable …` | 同 | 预存在限制 |
| `r7_enum_first_source_v6`（**单源** enum + object，无 import） | **rc=0 sha c87dce6a60b828f800358f54ecad923a889fd6469c6c30faa966101c1b19e651** | **rc=0 同一 sha** | **CMP=IDENTICAL（字节等价）** |

**三条结论，都有原文**：
1. **负例判据**：未修复侧（preA，含 3d 的 Seal-无树形态）在 `BuildEnumDeclaration` 精确报 `enum variant authority invalid`——与第六手预测的判词**逐字相同**；修复侧**不再报**这一句（判据原文见上表 A 列）。
2. **等价**：单源侧（源 0）两侧**产物逐字节相同**；多源且 enum 在源 0 侧两侧**整段 stderr 逐字节相同**。修复只在"variant 的 producer source ≠ 0"时才有行为差异，符合设计。
3. **为什么修复侧到不了 rc=0**：本例的 enum **确实合法**（v6 证明"enum + object 持有它"这一形状单源可编译），但修复侧过判据后撞上**与本修复无关的预存在门** `compiler snapshot builder: exact TypeSyntax remap mismatch`（`src/core/tooling/compiler_snapshot_builder.cheng:1702`，比对的是 parser sidecar 的全局面与逐源面，**与 TypeArena 的 variant producer source 列不是同一份数据**）。该门不是本修复引入：**同一族的 `r7_enum_second_source_main` 在"bug 不生效"（enum 在源 0、未修复驱动写入的就是真值）时同样撞它**，两侧 stderr 完全一致。所以**不能**声称"修复让多源 enum 可编译"；能声称的是"**该判词不再出现**"。

## 13.4 改动前后原文（任务①的那一刀）

`s1b_step3h_enum_variant_producer_source.patch`（1 hunk，`preA` 树上 +14/−1；**内容与 3f 内同一处逐字相同**，单独落盘只为单独烤验；**不可与 3f 叠加应用**）：

改前（`typed_expr_type_arena.cheng`，`FillTypeSyntax` 内）：
```cheng
            arenamod.ArenaArrayInt32Add(
                value.arena,
                value.typeSyntaxEnumVariantProducerSourceIndexes,
                viewProducerSourceIndex)
```
改后：
```cheng
            # [S1b step-3 (7)] The variant's producer source is a per-ROW
            # parser fact, not the view's source: ...
            arenamod.ArenaArrayInt32Add(
                value.arena,
                value.typeSyntaxEnumVariantProducerSourceIndexes,
                viewProducerSourceBase +
                    arenamod.ArenaArrayInt32Get(
                        tree.arena,
                        tree.typeEnumVariantProducerSourceIndexes,
                        variantRow))
```
（判据侧 `BuildEnumDeclaration` 读的是 `typedExprTypeArenaEnumVariantProducerSourceIndexAt(localOut, variantRow)` 与 `…SyntaxProducerSourceIndexAt(localOut, declarationRoot)`，正是这条列。）

## 13.5 每轮命令 + 原始输出（rc / lease_hits / 驱动 sha）

全部原始件在 `.rebuild/s1b_step3/r7/`；槽位 `.rebuild/COMPILE_SLOT.lock` 全程持有（`owner.txt` = pid + UTC + 用途）。

| 轮 | 命令 | rc | wall | lease_hits | 驱动/产物 sha | 末行原文 |
|---|---|---|---|---|---|---|
| 状态复原 | `git apply --check/apply 3b→3c→3d` | 0 | — | — | arena `2775a55a…` = r6 `preA_arena.cheng` 逐位相同；csg `99f1837e…` = r6 `csg_preD.cheng` | — |
| 对照烤 | `bake_r7.sh preA` | 0 | 205s | 0 | `kd_preA` `cc25373a…` | `output=…/kd_preA` |
| 修复烤 | `bake_r7.sh fix`（preA+3h） | 0 | 203s | 0 | `kd_fix` `ab3e607a…` | `output=…/kd_fix` |
| 任务①电池 | `ab_r7_enum.sh preA fix` | — | — | 0/0 | 见 §13.3 | — |
| 变体扫描 | `ab_r7_var.sh preA fix …v1 v2` / `…v4 v6` | — | — | 0/0 | v6 两侧 `c87dce6a…` | — |
| 3e | `git apply 3e` | 0 | — | — | arena `6ddabc0e…` = r6 `postA_arena.cheng` 逐位相同 | — |
| 交付校验 | 重建 preA 后 `git apply --check 3h` / `--check 3f` | 0 / 2 | — | — | — | **3h 在 preA 上 rc=0**；**3f 在 preA 上不适用（rc=2）——3f 的基是 post-A（必须先 3e）** |
| 3f | `git apply 3f` | 0 | — | — | arena `f6c96ce9…` / texpr `68dc3e05…` / csg `bbcd016e…` | — |
| 探针 wip1（未修） | `probe_r7.sh wip1` | 2 | 116s | 0 | — | §13.2 明细行 + `reject: BodyIR exact identity schema is invalid` |
| 探针 e1（传声明位） | `probe_r7.sh e1` | **0** | 195s | 0 | — | 无 `exact identity schema`、无 `reject:` |
| **过门烤** | `bake_r7.sh b`（3f+3g） | **0** | **201s** | **0** | **`kd_b` `72b5966f…`** | `output=…/kd_b` |
| A/B 电池（干净） | `ab_r7.sh preA b` | — | — | 全 0 | 见 §13.5.1 | — |
| 判别单跑 | `single_r7.sh ordinary_zero_exit_fixture preA b` | 0/0 | — | 0/0 | 两侧 `a400baac…` | `CMP=IDENTICAL` |
| 门内 b | `gate_r7.sh b kd_b` | 125 | 357s | 0 | — | `guard rss_limit_exceeded rss_bytes=5726720776 limit=805306368` |
| 插桩烤 | `bake_r7.sh b2`（6 个 stage 标记） | 0 | 201s | 0 | `kd_b2` `3e707c54…` | — |
| 定位 pair2 | `pair2_r7.sh b2` | 2 | — | 0 | — | stage=`loop_entry`→`parse_ok`，**无 `verify_ok`** |
| 回退 | `git apply -R 3g/3f/3e/3d/3c/3b` | 0 | — | — | 三个文件回到 `32a99253… / 8b8332ee… / 42fd9f09…`（= 本轮起始态） | — |
| 对照烤 | `bake_r7.sh base` | 0 | 204s | 0 | `kd_base` `a02d69ef…` | — |
| 门内 base | `gate_r7.sh base kd_base` | 125 | 405s | 0 | — | `forest_appended src=23` → 死于 src=24 |

### 13.5.1 A/B 电池（`preA` vs `b`，同 `--in`/同 `--out`，先 `rm -f`，只认同路径）

| 夹具 | A rc | B rc | lease_hits | 判词 |
|---|---|---|---|---|
| `ordinary_zero_exit_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`25dcf30a…`） |
| `call_fixture` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`3ccdc3cf…`） |
| `cold_nested_fmt_interpolation_smoke` | 0 | 0 | 0/0 | **CMP=IDENTICAL**（`c0f75411…`） |
| `arena_shapes` | 2 | 2 | 0/0 | **JUDGEMENT=IDENTICAL**（`parser type syntax: enum variant trailing syntax invalid`） |
| `pair2`（双源） | 2 `compiler snapshot builder: portable TypeArena Symbol join duplicate` | 1 **`arena array: read out of bounds`** | 0/0 | **DIFFER**（B 走得更远后越界） |
| `closure8`（双源） | 2 `compiler parser receipt: normalized expression parser node missing exprIndex=5 …` | 1 **`arena array: read out of bounds`** | 0/0 | **DIFFER**（同上） |
| `v6_direct1_repro` | **125（环境/限额作废）** `resource_guard rss_limit_exceeded rss_bytes=860734640` | **0** `lifecycle_before_after_primary …` | 0/0 | A 侧作废，**未计** |

⇒ 干净口径 **5/7**（3 逐字节 + 1 判词相同 + 1 判词相同），**2 条 DIFFER 是本轮新发现的多源缺陷**（不是"路径/驱动"问题：判别单跑 `ordinary_zero_exit_fixture` 两侧 `rc=0`、产物逐字节相同、`lease_hits=0`，见 §13.5 表）。

## 13.6 门内全量实测（默认 768MiB 门，**同窗口对照**）

| 量 | 改动侧 `kd_b`（17:1x，本轮现烤） | 同窗口基线 `kd_base`（18:1x，本轮现烤） | 第六手窗口 `kd_base`（16:15） |
|---|---|---|---|
| 驱动 sha | `72b5966f…` | `a02d69ef…` | `240d83e9…` |
| rc / wall | 125 / 357s | 125 / 405s | 125 / 494s |
| `forest_parsed` | **234** | **234** | 234 |
| `forest_appended`（目标 234） | **0** | **24** | 24 |
| `ta_stream` | 0 | 0（无此发射点） | — |
| 死点 | **流式循环第一次 `ProcessResourceGuardCheck()`**（`pass=1` 计数 = 0，一个源都没消费） | 并林 pass1 `src=24` | 并林 pass1 `src=24` |
| guard 读数 | `rss_bytes=5,726,720,776` / limit 805,306,368 | `rss_bytes=827,376,864` | `rss_bytes=821,953,736` |
| 单进程 `max_rss` | 770,999,400 | 830,211,248 | 842,171,568 |
| 最后一条 `csg_mem` | `ta_limits … column_rows=17756775 column_bytes=71027100 rss=664585272` | `forest_parse_begin pass=1 src=24 reserve=1604800` | — |
| `lease_hits` | 0 | 0 | 0 |
| 负载/机器态 | `.rebuild/s1b_step3/r7/gate/env_before.txt`、`env_after.txt` | 同左（同小时、同窗口） | — |

**读法（写死口径）**：
1. **本轮门内读数仅用于同窗口相对比较，不用于达标判定。** 同窗口基线 `kd_base` 复现了第六手的 24（死点同为 `src=24`），说明本窗口与第六手窗口可比；但驱动 sha 与第六手不同（`a02d69ef…` vs `240d83e9…`），期间其它 lane 改过共享文件，**跨窗口读数不可比**。
2. **未达标**：目标 `forest_appended=234` 且不触 `rss_limit_exceeded`；本轮为 **0** 且触门。
3. **改动侧死得更早但机制不同**：`kd_b` 不是死在并林，而是**循环前就把进程树 RSS 顶到 5.7 GB**，循环第一次 guard 检查即退出（`pass=1` 计数为 0）。注意单进程 `rss=` 读数是 664 MB、`max_rss` 771 MB——**5.7 GB 出现在 `ta_limits` 之后、循环之前**，落在 `StreamingBegin` / `TypedExprTypeArenaAllocateFromLimitsInto`（预留 `column_bytes=71,027,100`）/ `PendingGenericApplyNew` / **`TypedExprBuildSourceContextExactIndexWithManualAuthority`（234 个 context 的索引核）** 这四步里，且**不在** `csg_mem` 的 `rss=` 采样点上。
4. 同窗口对照：基线 24 / 改动 0 —— 就"已消费源数"这一量，流式驱动**目前更差**；这是**相对读数**，不作代码优劣判据。

## 13.7 未完成项与"下一步最小动作"

**① 门内未达标（目标 `forest_appended=234`）。** 两条独立缺陷，均在流式路径上，都已有精确坐标：

**(a) 循环前进程树 RSS 爆到 5.7 GB（本轮门内 `forest_appended=0` 的直接原因）**
- 证据：`gate/b.stderr.txt` 最后一条 `csg_mem` 是 `ta_limits …`（单进程 rss=664,585,272），下一条就是 guard 的 `rss_bytes=5726720776`；`grep -c 'pass=1'` = **0**。
- 最小动作（一次烤 + 一次门跑即可定位）：在这四步之间各加一个 `compilerCsgMemTraceEmit`（`StreamingBegin` 后 / `AllocateFromLimitsInto` 后 / `PendingGenericApplyNew` 后 / 上下文索引核后），重烤一版驱动，跑 234 源门测，命中的那一步就是 5 GB 的来源；重点怀疑**上下文索引核**（234×`TypedExprBuildIndex`）。**注意**：加插桩必须放在**完整语句之后**——本轮我第一次插桩把标记插进了多行调用的实参表里，得到 `initializer continuation missing`（见 §13.9 的补丁编译错误分类）。

**(b) 多源夹具在 `TypedExprTypeDeclarationIndexVerifySourceAgainstInto` 内越界**
- 证据（stage 标记，`pair2_r7.sh b2`）：`r7probe stage=loop_entry src=0` → `stage=parse_ok src=0` → **没有 `stage=verify_ok`**；未插桩的 `kd_b` 在同一处表现为 `arena array: read out of bounds`（rc=1），插桩版表现为 `system link exec: compiler csg build failed`（rc=2，明细被上层吞掉）。
- 该函数（`src/core/lang/typed_expr_type_arena.cheng:4276`）内可越界的 arena 读点只有三处：`typedExprTypeDeclarationRowByRootInto`（内部自带上下界）、`ArenaArrayInt32Get(tree.arena, tree.declarationKinds, declarationRow)`、`ArenaArrayInt32Get(tree.arena, tree.declarationExportedFlags, declarationRow)`；`declarationRow` 有 `>= tree.declarationCount` 的前置断言，所以**下一步先量 `tree.declarationKinds.len` 与 `tree.declarationCount` 是否一致**（在该函数入口加一个 `err` 分支打印这两个数即可，一次烤一次跑 pair2）。
- 这一条**必须先修**：它是"逐源消费"能不能成立的前提，且 234 源门测走到循环后必然撞它。

**(c) 达标的其余杠杆**（⑥ 落地后仍在）：② + ⑥ 的流式峰值模型是 `819,036,575 B` > 门 `805,306,368 B`（超 13.1 MiB）；过 (a)(b) 后按 §9.5.3 四条杠杆逐项补并报实测收益（22 个 TypeId 侧列预分配 / 4 张 `str` 表 / `src=170` 的 +196 MB parse 尖峰 / 降 490 MB 保底）。

**② 判等价**：`preA` vs `b` 目前是 **5/7**（3 逐字节 + 2 判词相同）；剩下 2 条 DIFFER 与 1 条 A 侧环境作废，必须等 (b) 修好后重跑同一套电池才能判 3f 等价。**本轮不判 3f 等价。**

**③ 数值无关但要知道**：`kd_b` 的 `v6_direct1_repro` 侧 `rc=0`（同夹具 A 侧 `rc=125` 撞门）——这是**单窗口、单侧**读数，且 A 侧属环境/限额作废，**不作为流式优于并林的证据**。

## 13.8 纪律回执

- **patch 通道**：全程 `/usr/bin/diff -u` → `git apply --check` → `git apply`，撤回一律 `git apply -R`；**无 `cp` 整文件进树、无 `git checkout --` / `git restore` / `git stash`**。本轮落盘：`patches/s1b_step3g_streaming_admission.patch`（sha `7fbee82cb992137f57e56f40247f74beac3d6f8845ba6eb8eda1d2ca6b2dad26`）、`patches/s1b_step3h_enum_variant_producer_source.patch`。scratch 副本只用于生成 diff 与只读比对。
- **槽位**：`.rebuild/COMPILE_SLOT.lock` 全程持有。
- **收敛**：本轮结束**完全回退到起始的已验证态**：`typed_expr.cheng 32a99253…` / `typed_expr_type_arena.cheng 8b8332ee…` / `compiler_csg.cheng 42fd9f09…`（与 `git diff --numstat` 的 56/23、450/1、129/29 一致），`git apply -R` 逐条 `rc=0` 可逆。
- **源码状态说明（重要，写给下一手）**：**本轮开始时的工作树并不含 3b/3c/3d/3e**——第六手 `land_r6.sh` 的收尾把 3f→3e→3d→3c→3b 全部反打、只做了正向 `--check`，所以"已验证基线"= `32a99253…/8b8332ee…/42fd9f09…`。本轮先把 3b/3c/3d 正向应用并**逐位复现**第六手的 scratch 副本（arena `2775a55a…`、csg `99f1837e…`），继续 3e 又逐位复现 `postA_arena.cheng`（`6ddabc0e…`），因此任务①/②的起点是**可复现的确定态**，不是猜的。
- **判据与被测对象对齐**：A/B 全部同 `--in` 同 `--out`、先 `rm -f`、只认同路径产物；对照驱动 `kd_preA` 与 `kd_b` **均为本轮现烤**；且核对了两次烤之间**没有任何驱动闭包内的文件被其它 lane 改动**（`find src -newermt` 命中的 `src/apps/*`、`src/game/csg/execution.cheng`、`src/tests/*probe.cheng` 均不被 `backend_driver_dispatch_min.cheng`/`compiler_csg.cheng` import）⇒ `kd_preA` vs `kd_b` 的差就是 3e+3f+3g。
- **作废三分类（本轮全部）**：
  - **租约撞车 1（harness 侧，未记补丁账）**：`ab_r7.sh preA b` 第一次运行被工具 600s 超时打断后**进程未死透**，我又起了一次电池 ⇒ 两个实例互相 `rm` 对方的夹具、并抢编译租约。原文：`attempts_ab_b.VOID_lease_collision.txt` 的 `os atomic tree: parent lease unavailable`（`hits=1`，`rc=2`），以及失败侧 `parser: missing source` / `arena array: read out of bounds`。该轮 `ab_b.txt` 已另存 `ab_b.VOID_lease_collision.txt`，**整轮作废**；判别单跑（`ordinary_zero_exit_fixture`，`rc=0/0`、产物逐字节相同、`lease_hits=0`）证明**不是补丁回归**。重跑一次后得到 §13.5.1 的干净结果。
  - **补丁编译错误 2**：插桩版 `bake_r7.sh b2` 前两次 `rc=2`、`lease_hits=0`，末行分别为 `cheng_cold: initializer continuation missing … context: AppendSourceInto( if compilerCsgMemTrace:` 与 `cheng_cold: unknown identifier`（`sourceIndex` 被插到 `for` 之外）。两次都是我**插桩位置**的问题（把语句插进了多行调用实参表 / 插到循环外），修好第三版才 `rc=0`。**这两轮是探针脚本自身的错，不计入补丁账**。
  - **环境/限额作废 1**：`ab_v6.A` `rc=125` + `lease_hits=0` + 末行 `compile_progress phase=resource_guard status=rss_limit_exceeded rss_bytes=860734640 limit_bytes=805306368`；**未按第六手"同 `--out` 单侧重跑"补做**（时间用在了门测与定位上），因此该条**不计入等价分子**。
  - **租约撞车（编译轮）0**：所有 bake/探针/门测的 `lease_hits` 均为 0。
- **语言坑**：① 每次改完跑 `patches/check_no_inline_comment_after_or.py` → 全绿；② **新发现**：`nil` 字面量不能绑定 borrowing-managed 形参（§13.2），替代形态是**同类型声明位**而不是新建入口；③ **新发现**：把语句插入多行调用的实参表会得到 `initializer continuation missing`（插桩时踩到两次）。
- **抬门标注**：本轮**没有任何抬门轮**，两次门测都用默认 768MiB 门。
- **未 commit / 未 push / 未建分支或 worktree**。

## 13.9 判词

```
STEP3 NOT ESTABLISHED
```
- **实质进展（本轮）**：① **⑤-c/d/e + ⑥ 过编译与过准入**——`patches/s1b_step3g_streaming_admission.patch` 一处改动后，`kd_b` 现场烤成（`rc=0 wall=201s lease_hits=0 sha 72b5966f…`），这是第六手留下的"不编译"卡点的**终结**；② **3d 的 variant producer source 潜伏回归已单独烤验并钉死**（未修复侧 `enum variant authority invalid` 原文 + 源 0 侧字节等价原文）；③ **⑥ 的硬要求已核**：`grep -rn typeArenaParserForest src/` = 0、`mergePass` = 0、`forest_appended` 在流式循环内**逐源重发射**（`compiler_csg.cheng:35796`，同处并发 `ta_stream`）——不存在"没有发射点的 234"；④ 卡点从"无明细"变成**逐语句定位**（§13.2 明细行 + §13.7 的 (a)(b) 坐标）。
- **卡点**：默认 768MiB 门内 `forest_appended` = **0**（目标 234），同窗口基线对照 = **24**；流式路径两个缺陷（循环前 5.7 GB 进程树 RSS / `VerifySourceAgainstInto` 越界）未修。
- **等价性**：`preA` vs `b` = **5/7**（3 逐字节 + 2 判词相同），**不判 3f 等价**。
- **取代关系**：本判词取代 §12.8 与 `.rebuild/s1b_step3/VERDICT_step3.txt` 的上一代；两代不得并存。
