# `compiler snapshot builder: provisional Type DeclKey drift` 定位报告

只读源码 + 定位；**全程未运行任何编译/烤制/lldb**（`cd /Users/lbcheng/cheng-lang`，2026-09-11 深夜）。
锚定哈希（`git hash-object`，本席读文件时的工作树）：

- `src/core/tooling/compiler_snapshot_builder.cheng` = `928d2cc98edf2eaa9bb6ed181f3021e6e703092e`（26,146 行）
- `src/core/lang/typed_expr_type_arena.cheng` = `07413a836ce93f6faee60801de12b78ca3e56496`
- `src/core/csg_core/compiler_snapshot_schema.cheng` = `c0e500bad23af7904202ae41ba44368112af8157`
- `src/core/tooling/semantic_snapshot_declaration_identity.cheng` = `b7f7f595766ab1f14af68bd266f94bcf89710dd6`

本战役多手并发改前两个文件 ⇒ 下文行号仅对该哈希成立，复核请用 `grep -n` 点名符号。

---

## 0. 结论先行

1. **判词点**：`src/core/tooling/compiler_snapshot_builder.cheng:19941`，判据在 `:19936-19940`，位于函数
   `compilerSnapshotBuilderDeclarationAuthorityCommitInto`（`:19033` 起）的 **symbol 重排/canonical 审计循环**（`:19925-19945`）。
2. **判定的两个量**（都在同一循环里，见 §1.1）：
   - 左：`tables.symbols.symbolCids[oldSymbolId]` —— 该 Type 符号**当前**的 symbol cid；
   - 右：`newKeyByOld[oldSymbolId] = declarationTable.declKeyCids[declId]` —— **刚 seal 的权威声明表**里，
     该符号的 parser 声明候选（`candidateByOldSymbol[oldSymbolId]`）对应的 sealed `declKeyCid`。
   两者任一不逐字节相等 ⇒ 本判词。
3. **"provisional Type DeclKey" 是什么**：Type 符号的 symbol cid 不是"算出来的权威值"，而是**临时值**——
   由 `compilerSnapshotBuilderFinalizeTypeSymbolDeclKeyInto`（`:18487`）**为这一个符号单独建一张小声明表**
   （per-source 模块候选 + 该 Type 候选，`:18511-18565`）、seal 后取其 `declKeyCids[declId]` 写回
   `tables.symbols.symbolCids[symbolId]`（`:18580-18581`）。它之所以是 "provisional"，是因为那张小表
   **不是**权威表；本审计就是在核对"临时推导 == 权威 seal"。
4. **判定：既有潜伏缺口首次可达，不是近期改动引入**（静态判据见 §4）。被推到这条墙前面的是最近这批补丁，
   但它们**没有**改动本判词的两侧任何一侧：w53 守卫（`:17334-17341`、`:23957-23963`）自 `ce469ed71` 起在树，
   `AppendTypeSymbolsInto` 与 HEAD **逐字节相同**（本席用脚本抽取函数体后 `/usr/bin/diff`，见 §4.3），
   13 件近期补丁里只有 `pair2_typearena_symbol_ownership` 碰过 `typeSymbolIdByArenaTypeId`，且只碰 **portable 副本**
   （`patches/pair2_typearena_symbol_ownership.patch:39-49`，判词文本不同）。
5. **回退哪一件能让判词消失：静态上判定为"没有任何一件"**——所有候选回退都只会把**更早的墙**盖回来（§4.4），
   因为本墙两侧的代码一件都没被这批补丁碰过。要证伪此结论只需一次对照实验（§4.5）。
6. **前三名候选**见 §5。**本席未能静态钉死"是哪一个符号、为什么"**：本席用 §3 的逆向追踪把候选域收窄到
   "某个 `CsgCompilerSymbolType` 符号的 `symbolCids` 在审计时为空 / 或与其临时 key 不一致"，但**对四件夹具的具体形态
   （`Slots` + `values: int32[SlotCount]`）逐条推演后，静态上未能找出该符号**——这一步需要一条动态证据（§6），
   这是本报告最大的诚实缺口。
   **〔2026-09-12 00:xx 更新：此缺口已由 r9q 坐标补齐，真死因与修法见文末「附录 A」；
   §0.6 / §5 的 C1/C2/C3 结论按 A.0 改写，§6 的探针 v1 已作废（其 `arena_type` 列读错列下标，见 A.2）。〕**
7. **补丁**：修法**未能确信**，故**不落修复补丁**（纪律要求确信才落）。只落了一件**纯诊断探针**
   `patches/declkey_audit_keydiff_probe_v4.patch`（判词追加符号坐标 + **key 逐字节差异定位**，**不动任何判据、不改控制流**；
   探针 v1/v2/v3 均已作废或存档，见 A.2/B.4/C.3），
   已验 `git apply --check` **exit 0**、`--reverse` exit 1（未落树）。

---

## 1. 判词链（完整判据 + 参与量）

### 1.1 落点原文（`compiler_snapshot_builder.cheng:19925-19945`）

```
    for oldSymbolId in 0..<symbolCount:
        let candidateIndex = candidateByOldSymbol[oldSymbolId]
        if candidateIndex < 0 ||
           candidateIndex >= mapping.producerCandidateToDeclIds.len:
            err = " compiler snapshot builder: declaration mapping missing"
            ...
        let declId = mapping.producerCandidateToDeclIds[candidateIndex]
        declIdByOld[oldSymbolId] = declId
        newKeyByOld[oldSymbolId] = declarationTable.declKeyCids[declId]
        if tables.symbols.symbolKinds[oldSymbolId] ==
               snapshot_schema.CsgCompilerSymbolType &&
           !layout.FixedBytes32Equal(
               tables.symbols.symbolCids[oldSymbolId],
               newKeyByOld[oldSymbolId]):
            err = " compiler snapshot builder: provisional Type DeclKey drift"
            declaration.SemanticSnapshotDeclarationTableReleaseInto(
                declarationTable)
            return false
        order[oldSymbolId] = oldSymbolId
```

| 坐标 | 出处 | 语义 |
|---|---|---|
| `symbolCount` | `:19042` `let symbolCount = tables.symbols.symbolCids.len` | 审计域：**全部**符号 |
| `symbolKinds[oldSymbolId] == CsgCompilerSymbolType` | `:19936-19937` | 只有 Type 符号参与本判词 |
| `symbolCids[oldSymbolId]` | `:19939` | 符号当前 cid（写点只有两处，见 §2.2） |
| `candidateByOldSymbol[oldSymbolId]` | `:19308`（Type 候选）、`:19581`（Function）、`:19671`（Extern）、`:19817`（Local）、`:19892`（GenericParameter）等 | 该符号在候选 store 里的行 |
| `declarationTable` / `mapping` | `:19914-19918` `SemanticSnapshotDeclarationTableSealInto` | **权威**声明表（由本函数自己刚 seal） |
| `declId` → `declKeyCids[declId]` | `:19933-19935` | 权威 key |

**判据等价改写**：`∀ 符号 s, kind(s)=Type ⇒ symbolCids[s] == declKeyCids[declId(s)]`。这是一条 fail-closed 身份审计，
不是性能/启发式判据。

### 1.2 调用链（谁先可达）

`CompilerSnapshotProductionCandidateBuildUnsealedInto`（`:11161`）
→ `:11334` `compilerSnapshotBuilderTypeFunctionProjectValidatedInto`（`:23548`）
→ `:24173` `compilerSnapshotBuilderDeclarationAuthorityCommitInto`（`:19033`）
→ `:19916` seal → `:19936-19944` **本判词**。

同函数内更早的次序（重要，决定"先撞哪面墙"）：`:23615` `AppendTypeSymbolsInto` → `:23620` 泛型 → `:23625` 参数
→ `:23642` `ArenaTypeTextsInto`(文本面) → `:23964` 一趟 row cid → `:23986` **provisional finalizer** →
`:24004` 二趟 row cid → `:24016` canonicalize → `:24045` `TypeSyntaxTypesProjectInto` → `:24050` `TypedNodesProjectInto`
→ `:24145`（`unsealedProductionBase` 时）`AppendLocalSymbolsInto` → `:24173` commit。

### 1.3 判词为什么带 "provisional"

`:23957-23963` 的 w53 注释写明：commit 审计把**每个** Type 符号的 cid 与 sealed 声明表比对，所以**nominal Type 符号
也需要 provisional key**（与 Alias 一视同仁），并且 finalizer 的 observed-typeCid 权威要求 Type 行先派生好。
⇒ "provisional" 指的是 §0.3 那张**一次性小表**导出的 key。

---

## 2. provisional key 的推导与覆盖面（本墙的"比什么"）

### 2.1 finalizer 的 key 怎么算（`:18487-18585`）

1. 输入守卫 `:18494-18508`：`declarationRow` 合法、`symbolId` 的 kind 是 Type、`sourceId` 合法、
   `typeId = symbols.typeIds[symbolId]` 合法且 `typeCids[typeId]` **observed**（否则报
   `Type signature TypeCid unavailable`，不是本判词）。
2. 建小表：`:18511-18532` 为**每个** source 追加一条模块候选（kind=Module、surface=ModulePath、
   `canonicalName=modulePath`、nameProof=`documentCid`、signature=`documentCid`、lexicalScope=零、span=0..0、
   owner=-1）；`:18553-18565` 追加**该 Type 自己的**候选（kind=Type、surface=Identifier、
   `canonicalName=tables.texts[nameTextId]`、nameProof=`DeclarationNameProofCid`、
   **observed typeCid=`tables.types.typeCids[typeId]`**、lexicalScope=零、span=该声明 span、
   **owner = 本 source 的模块候选**）。
3. seal 后 `symbolCids[symbolId] = declKeyCids[declId]`（`:18580-18581`）。

key 本体：`semanticSnapshotDeclarationKeyCid`（`semantic_snapshot_declaration_identity.cheng:421-442`）=
`H(domain, portableDocumentIdentityCid, ownerDeclKeyCid, declarationKind, nameSurfaceKind, canonicalName,
portableSignatureTypeExpressionCid, lexicalScopeCid)`。
⇒ **比对的是"同一 declarationKind/surface/name/owner 链"下、以 `typeCids[typeId]` 为 observed 身份的那条 key**。

### 2.2 Type 符号的 `symbolCids` 只有两个写点（这是全案的收窄器）

本席用脚本把 `add(tables.symbols.symbolCids` / `tables.symbols.symbolCids[...] =` 全部写点连同**所属函数名**列出，
工作树全文件**只有 11 处**，其中能落在 `kind == CsgCompilerSymbolType` 的只有两处：

| 写点 | 函数 | 写什么 | 是否覆盖 Type 符号 |
|---|---|---|---|
| `:13043` `add(symbolCids, moduleKeys[sourceId])` | `AppendModuleSymbolsInto` | 模块 key | 否（该符号 kind=Module，`:13057`） |
| `:18580` `symbolCids[symbolId] = provisionalDeclarations.declKeyCids[declId]` | **FinalizeTypeSymbolDeclKeyInto** | 临时 key | **是（唯一写点）** |

其余写点（`:10339/:10428/:10627/:10761/:11280/:13476/:17301/:17734/:17944/:18383`）分别属于
extern/function/module/generic/parameter/local 符号，**全部 `add(..., FixedBytes32())` 或 prebuild facts**
（`:13476` 用 `prebuildFacts.symbolCids[symbolId]`，只覆盖函数符号）。**Type 符号在 `:17301` 是空 cid 落表。**

⇒ **逆向结论（强，纯静态）**：审计里被判词击中的那个 Type 符号，其 `symbolCids` 要么
**(i) finalizer 从未对它运行**（保持空 cid），要么 **(ii) finalizer 运行了但写进去的临时 key ≠ 权威 key**。
没有第三种。

### 2.3 finalizer 的"谁来跑"（`:23975-23989`）——本墙最可疑的一环

```
    for typeId in 0..<tables.types.typeCids.len:
        if typeId >= typeSymbolIdByArenaTypeId.len:
            continue
        let typeSymbolId = typeSymbolIdByArenaTypeId[typeId]
        if typeSymbolId < 0 ||
           tables.symbols.symbolKinds[typeSymbolId] != CsgCompilerSymbolType:
            continue
        let declarationRow = declarationRowByOldSymbol[typeSymbolId]
        if !compilerSnapshotBuilderFinalizeTypeSymbolDeclKeyInto(
               tables, csg, declarationRow, typeSymbolId, err):
            return false
```

该循环与审计**同域同谓词**（都是"kind==Type 的符号"），但有两个真实裂缝：

- **裂缝 1（反向表覆盖）**：`typeSymbolIdByArenaTypeId` 只在 `AppendTypeSymbolsInto` 里填充（`:17090-17092` 全 -1，
  `:17339-17341` 单点赋值）：
  ```
        if (aliasDeclaration || aggregateDeclaration) &&
           arenaSymbolDeclarationRoot == arenaTypeSyntaxRow:
            typeSymbolIdByArenaTypeId[arenaTypeId] = symbolId
  ```
  **w53 守卫**：只有"声明自己拥有该 arena 行的 Symbol 根"才认领。一个 foreign-root 的 Field 行**不认领** ⇒
  对应 arena 行留 -1 ⇒ 若某个 Type 符号的 `symbols.typeIds[symbolId]` 正好指向**未被认领**的 arena 行，
  finalizer 就**永久跳过它** ⇒ 审计必然报本判词。注意：`symbolIds` 列在 arena 里是**按行传播**的
  （`typed_expr_type_arena.cheng:1259` `Intern`、`:1375` `ReserveAggregate`：Struct 的定长数组字段行
  **继承外层声明的 symbolId**），而 `typeSymbolIdByArenaTypeId` 是**按"谁创建了 Symbol"**认领的 —— 两者不是同一个语义。
- **裂缝 2（两趟派生）**：`:23964` 先派生一趟 row cid，finalizer 用**第一趟**的 `typeCids[typeId]` 算 key，
  `:24004` 又派生第二趟，`declarationTable` 在 `:19303` 用的是**第二趟**的 `typeCids[typeId]`。
  本席逐条核过这条**在 `Slots` 形态下不成立**：object/refobject/enum 的 row 前像走
  `compiler_snapshot_schema.cheng:5678-5689` 的 nominal 分支，读的是
  `symbols.declarationPathCids[declSymbolId]`（`:17307` 写入，finalizer **不碰**），
  且 `CsgCompilerTypeTraitProofCidInto`（`:5964`）不读 `symbolCids`；fixed-array 等结构行 `declSymbolId = -1`
  （`:17380-17382` `Intern(..., -1, ...)`）。⇒ 二趟不会改 nominal 行的 cid。此裂缝**保留为候选但已显著降权**。

---

## 3. 本席对"那一个符号是谁"的推演与其失败点（诚实记录）

**推演（静态）**：对四件夹具，`ta_limits`/`csg_mem` 实测为
`tokens=77 type_syntax=7 declaration_symbols=1 functions=1 bracket_args=1`、`types=17`（seed 15 + object + fixedarray，
与 `object_field_authority_wall.md:90-105` 的行数算术一致）。符号域里只有一个 Type 符号（`Slots`），
其 `typeIds` 应指向 object 行（15）；`arenaSymbolDeclarationRoot` 应等于该 Type 声明的 TypeSyntax 根
（`FillDeclarationSymbols :7040-7054` 用 `viewTypeSyntaxBase + typeSyntaxNodeIndex` 记录根，
且 `:7045-7048` 有"索引派生 == 顺序计数"的等式守卫）；`:17222-17244` 的 join 守卫要求
"own root ⇒ producer 相同"。**按这条链，`typeSymbolIdByArenaTypeId[15] = symSlots`，finalizer 会跑，key 应相等。**

**失败点**：本席据此预期"不该有 drift"，但实测有。本席随后把
`compilerSnapshotBuilderAppendTypeSymbolsInto` 的**函数体**从工作树与 HEAD 各抽一份
（`/tmp/cur_appendsym.cheng` vs `/tmp/head_appendsym.cheng`，各 313 行）做 `/usr/bin/diff` ⇒ **IDENTICAL**，
即这条链**未被本战役任何补丁改动**。因此要么本席对某个坐标的读法有误（例如
`arenaSymbolDeclarationRoot`/`arenaTypeSyntaxRow` 对 object 行不等，理由：`:17227` 的
`arenaSymbolDeclarationRoot == arenaTypeSyntaxRow` 在 `Slots` 上**不成立**），要么存在本席未覆盖的
第三方写入路径。**这一步无法靠只读继续收窄，需要 §6 的动态证据。**

---

## 4. 既有潜伏 vs 新引入

### 4.1 判词本身的历史

`grep -c "provisional Type DeclKey drift" docs/campaigns/2026-08-31-kernel-userpath/patches/wall101.patch`
= 1（`wall111c.patch` 同）：本判词与 w53 守卫、w53 注释是**同一次改动**落地的，落点是
`docs/campaigns/.../patches/wall101.patch:520-560`（其上下文正是 w53 的 own-root 认领 + 把 finalizer 从
"仅 Alias" 扩到 "EVERY Type Symbol"）。`git log -S "only a declaration that owns its own arena Symbol"` 只有
`ce469ed71`（全量工作树快照）⇒ 该守卫与判词**早于本战役全部 13 件近期补丁**。

### 4.2 本战役 13 件补丁的实际落树态（`git apply --check --reverse` 实测）

```
APPLIED(in tree): local_symbol_domain_function_scoped, forward_decl_generic_window_index,
                  object_field_typearena_text_fixpoint, typearena_pinned_capacity,
                  w40_textpath_module_const_fold, s1b_step3o_module_const_expr_read,
                  aggregate_zero_definition_group_v2_incremental, pair2_typearena_symbol_ownership,
                  s1b_step3l_global_const_block_bindings
NOT applied:      forward_typeid_deferred_replay(正在烤), s1b_step3p_forward_declaration_failclosed,
                  tree_arena_column_census, aggregate_zero_declaration_local_definition_group
```
（`--reverse` 对多件报 conflict 的原因是补丁命中行被后续补丁与 WIP 重叠改写，不代表未落树；
`forward_typeid_deferred_replay` 另有独立证据：`grep -n "forward-typeid" src/core/lang/typed_expr_type_arena.cheng` **无匹配**。）

### 4.3 这批补丁有没有碰本墙的两侧

| 补丁 | 是否碰本墙两侧 | 证据 |
|---|---|---|
| `object_field_typearena_text_fixpoint` | 否（只改文本推导的**顺序**，不动 cid/符号） | 工作树 diff hunk 全在 `14026-14296` 的 `ArenaTypeTextsInto`/`ArenaTypeTextsSweepInto`，判据从 `childTypeId >= typeId` 换成 `>= typeCount` + `textReady`，**未触碰 key 推导** |
| `pair2_typearena_symbol_ownership` | 部分（只碰 **portable 副本** `typeSymbolIdByArenaTypeId`） | 补丁 `:39-49`：`arenaSymbolRoot == projection.arenaTypeSyntaxRows[projectionRow]` 才认领，否则 Type 符号报 `portable Type declaration SymbolId not owned`——**判词文本不同**，且该函数不在 §1.2 的链路里（链路走 `:23620` 的 `AppendTypeSymbolsInto`） |
| `local_symbol_domain_function_scoped` | 否（改 Local 符号域，Local 不是 Type） | 3 hunk，落在 `AppendLocalSymbolsInto` 一带（`~18383-18440`） |
| 其余 10 件 | 否 | 均不含 `FinalizeTypeSymbolDeclKeyInto` / `typeSymbolIdByArenaTypeId` / `symbolCids` 锚点（`grep -ln` 全 `patches/` 只有 `pair2` 命中） |
| w53 守卫与判词本体 | **未改动** | §4.1 + §3 的函数体 `diff` = IDENTICAL |

### 4.4 回退哪一件会让判词消失

**静态判定：没有一件。** 理由：本墙两侧（`symbolCids` 的写点、审计谓词、`typeSymbolIdByArenaTypeId` 的填充）
在 HEAD 与工作树**逐字节相同**，13 件补丁没有一件触碰；因此回退任一件都只会把**更早的墙**盖回来
（这正是本战役前几次的实测形态：`object field TypeArena authority invalid` → `Local declaration lacks exact
value definition` → `typed-node exact producer TypeId missing` → … → 本墙）。**这一条是"新可达"判定的判据核心：
墙被"推"而不是被"造"**——被推的机制是前面几层守卫陆续放行，编译器第一次真正跑到 `:19941`。

**该结论的可证伪点**：若存在一件补丁**间接**改变了落到 `:19941` 时的输入（例如 `s1b_step3l` 收编模块 const 后
符号域多/少了一个 Type 符号），则"没有一件"就错。区分办法见 §4.5 与 §6。

### 4.5 唯一低成本对照（若槽位允许）

- **最好的一件**：把 `src/tests/r9_r8_fixed_len_named_const_main.cheng` 放回**未打本战役补丁**的基线驱动
  （如 `kd_fixed`/`kd_pre8` 一类）。预期：死在更早的墙（不是本判词）⇒ "本墙是新可达"成立；
  若基线**也**报本判词 ⇒ 升级为"早就在，只是此前没有夹具走到这里"（结论方向不变，但可删掉"被推"这一环）。
- **单件排除法（若只想排一件）**：因四件正例只在**同时具备**这批补丁时才走到 commit，单件回退多半会先撞回早墙，
  该实验信息量低；本席不推荐。

---

## 5. 前三名候选 + 可判别预测（含最小夹具源码）

> 所有夹具都可直接放进 `src/tests/`（注意：夹具里常量必须**已按 `s1b_step3m/n` 形态**能过 parser；
> 下列 M-C 完全不含常量，规避该面）。

### C1（主判，置信度中）：`typeSymbolIdByArenaTypeId` 覆盖裂缝 ⇒ 某个 Type 符号的 finalizer 从未运行（§2.3 裂缝 1）

- 机制：该表只在 `:17339-17341` 单点认领，且认领条件是
  `(aliasDeclaration || aggregateDeclaration) && arenaSymbolDeclarationRoot == arenaTypeSyntaxRow`。
  只要 `Slots` 的 object 行在这条比较里**不成立**（或该 Type 符号的 `symbols.typeIds` 指向的是**继承**了 symbolId
  的**结构行**而不是声明根行），`typeSymbolIdByArenaTypeId[objectRow]` 就是 -1 ⇒ `:23980` 的 `continue` 生效
  ⇒ `symbolCids[symSlots]` 保持 `:17301` 的**空 cid** ⇒ `:19938` 不相等 ⇒ 本判词。
  这条假说**唯一需要解释的就是那个比较为什么在 `Slots` 上不成立**——本席未能静态定位（§3），
  但它与"只有含定长数组字段的聚合裸声明中招、纯标量控制组不见本判词"的形态差异**方向一致**。
- **判别夹具 M-A（定长数组字段，对照形态；即 M1 的常量无关版）**：
  ```
  type
      Slots =
          used: int32
          values: int32[8]
  fn main(): int32 =
      var s: Slots
      s.values[0] = 7
      s.values[3] = 9
      s.used = s.values[0] + s.values[3]
      if s.used != 16:
          return 2
      return 0
  ```
  **预测（C1 成立时）**：在**同驱动**上本判词逐字出现（这正是上游已实测的 M1 在旧驱动上的形态；
  新驱动上应同样出现）。**若判错**：M1 走到别的墙（尤其若它报 `object field TypeArena authority invalid` 或
  `structural type row authority invalid`）⇒ C1 的"数组字段 ⇒ 反向表漏认领"这一因果被推翻。
- **判别夹具 M-B（关键：① 定长数组字段 ② 无数组字段 的 A/B，用于把"数组"从"聚合裸声明"里剥出来）**：
  ```
  type
      Pair =
          left: int32
          right: int32
  fn main(): int32 =
      var p: Pair
      p.left = 3
      p.right = 4
      if p.left + p.right != 7:
          return 2
      return 0
  ```
  **预测（C1 成立时）**：M-B **不报**本判词（无结构行继承 symbolId 的形态），死在更晚的墙或 rc=0；
  若 M-B **也**报本判词 ⇒ "数组字段"不是触发条件，候选域应移向"聚合裸声明 + Type 符号"本身（C1 变体）。
- **若判错会先在哪条判词暴露**：M-B 若报 `structural type row authority invalid`（`:14394`，意味着
  object 行的 `declSymbolId < 0`）⇒ 反向表是**空认领**而不是漏认领，C1 的修法方向（补认领）就要换成
  "先修 `:17339-17341` 的比较语义"。这是本候选最可能的翻车点。

### C2（次判，置信度中低）：finalizer 跑了，但 key 用了**错的 observed typeCid**（§2.3 裂缝 2 / 认领到邻行）

- 机制：`typeSymbolIdByArenaTypeId[typeId]` 指向**同一个 arena symbolId 的另一行**（`symbolIds` 列按行传播，
  定长数组行与 object 行共享 symbolId），若认领落在**数组行**而非 object 行，finalizer 仍会对 `symSlots` 跑，
  但它取的 `typeCids[typeId]` 是**数组行的 cid**，而权威表里 `symSlots` 的候选 observed 是 **object 行的 cid**
  ⇒ key 不等 ⇒ 本判词（且 `symbolCids` **非空**）。
- **判别夹具**：无需新夹具，**用探针看 `type=` 值即可**：§6 的探针若打出
  `symbolCids` 非空且 `type=` 指向 fixed-array 行 ⇒ C2 成立；若指向 object 行 ⇒ C1。
- **若判错会先在哪条判词暴露**：若探针显示 `symbolCids` 为空，C2 直接出局（不需要新夹具）。

### C3（弱判，已大幅降权）：Alias/Tuple 家族的"二趟未到不动点"

- 机制：`:23990-24003` 的 `[phaseB-tuple-snap]` 注释承认 alias(Tuple) 家族第一趟 cid 是 provisional、必须二趟重算；
  若某形态下二趟仍非不动点，权威表 observed 与 finalizer observed 不同。
- **为何降权**：四件夹具的 `Slots` 是 object（nominal），nominal 分支读 `declarationPathCids` 而非 `symbolCids`
  （`compiler_snapshot_schema.cheng:5678-5689`），本席逐条核过 §2.3 裂缝 2 的输入不变性。
- **判别夹具 M-C（零常量、纯 alias 家族）**：
  ```
  type
      Vec = int32
  fn main(): int32 =
      var v: Vec
      v = 5
      if v != 5:
          return 2
      return 0
  ```
  **预测（C3 成立时）**：本判词出现且**与数组无关**；若 M-C 干净通过而 M-A 撞墙 ⇒ C3 出局（本席预期此结果）。

---

## 6. 我需要哪条动态证据才能确证（最重要的一节）

**一条足矣：让判词自己报出"是哪个符号、哪一行"**。已落探针
`patches/declkey_audit_keydiff_probe_v4.patch`（`git apply --check` **exit 0**、
`--reverse` exit 1），把 `:19941` 的判词改成：

```
 compiler snapshot builder: provisional Type DeclKey drift symbol={oldSymbolId} type={tables.symbols.typeIds[oldSymbolId]} arena_type={tables.types.producerTypeArenaIds[declId]} decl={declId}
```

（`Fmt"..."` 内插裸 `int32` 的写法在同文件有大量先例，如 `:2293`、`:3931`、`:6295`。
**风险：本席未编译，只做了 apply 校验；`tables.types.producerTypeArenaIds[declId]` 的下标语义
（`declId` 是声明表行号而不是 TypeId）是本席的**未验证**用法——若烤不过，把该字段删掉即可，其余三个字段足够判别。）

**判读表（烤一次即定案）**：

| 探针输出 | 结论 | 下一步修法方向 |
|---|---|---|
| 打进判词时 `symbolCids[symbol]` 为**空 cid** | **C1 成立**：finalizer 从未对该 Type 符号运行 ⇒ `typeSymbolIdByArenaTypeId` 覆盖裂缝 | 修 `:17339-17341` 的认领语义（不是放宽守卫：应让"声明根行"与"继承行"分离认领），或让 `:23975-23989` 改用符号域遍历而不是 arena 反向表 |
| `symbolCids` **非空**，且 `type=` 指向**定长数组行** | **C2 成立**：认领落在邻行，observed typeCid 取错 | 让反向表的认领只接受"该 Type 符号自己的 `symbols.typeIds`"那一行 |
| `symbolCids` **非空**，`type=` 指向 object 行 | 两条都排除 ⇒ **C3**（两趟不动点）或本席未覆盖的第三条路径 | 需要在 `:23986` 前后打印 finalizer seal 出的 key 与 `:19935` 的权威 key，二分定位 |

**第二顺位（独立、可同时做）**：M-A/M-B 在**同驱动**上各跑一次（约 2 次 compile），
用于把"定长数组字段"这一形态因子单独剥出来（C1 的 A/B 判别）。

---

## 7. 未测项（诚实清单）

1. **未运行任何编译/烤制/lldb**（硬纪律）：本报告全部为 `read`/`grep`/`git show` + 上游遗留
   `.rebuild/s1b_step3/r9/*.stderr.txt` 的复核，**没有本席自己的动态证据**。
2. **本席未能静态定位"那一个漂移符号"**（§3）：M-A 形态（`Slots` + `values: int32[8]`）下按链推演
   `typeSymbolIdByArenaTypeId[objectRow]` 应为 `symSlots`、key 应相等。这个推演与实测冲突，
   冲突原因**未查清**——这是本报告最大的缺口，也是 §6 探针存在的理由。
3. **`arenaSymbolDeclarationRoot == arenaTypeSyntaxRow` 在 `Slots` 上的真假未验证**：
   `symbolDeclarationRootTypeSyntaxNodeIndexes` 的填充由 `FillDeclarationSymbols`（arena `:7040-7054`）
   负责，`ReserveAggregate`（`:1283-1409`）在**更早**的 `:8019` 就跑了；两处的顺序/根坐标本席只读到了
   "先 Reserve 后 Fill" 这一层，**没有**逐条核对 `viewTypeSyntaxBase` 在两个 walker 里是同一个基数。
4. **`typeSyntax=7` 的 7 行分解是推理**（const/type/object/两个字段/bracket apply/函数签名），未逐行验证。
5. **`types=17` 的 17 行分解**沿用 `object_field_authority_wall.md:99-107` 的算术，未重算 seed 集合。
6. **探针未编译**：`Fmt` 内插与 `producerTypeArenaIds[declId]` 下标语义未验证（§6 已标注退路）。
7. **`forward_typeid_deferred_replay` 是否已落树**：间接证据（`grep "forward-typeid"` 无匹配）判"未落树"，
   但该补丁正在烤，落树后本报告的行号与 §4.3 的表需重跑一次。
8. **`prebuildFacts.symbolCids` 的覆盖域**只从 `:13476` 的用法 + `:19124-19143` 的 unsealed 基础域断言推出
   （"只有 function/extern/module 三类基础符号"），未逐条读 `SemanticSnapshotIncrementalPrebuildFacts` 的构造。
9. **失败发生在哪一趟**未测：`csg_mem` 停在 `frontier_store round=0`，说明死在 CSG 阶段而非 typed IR 阶段，
   但"是 `:11334` 链还是 `:25400` 链"**未区分**（两处都会调 `TypeFunctionProjectValidatedInto`）。

---

# 附录 A（r9q 坐标判读 → **定位完成，修法已出**）

上游回执：驱动 `kd_r9q` = r9o + 探针 v1，四件正例 + M-A/M-B 各一次的坐标，见下。**本节改写了 §0.6 / §5 / §6 的结论。**

## A.0 结论先行

1. **真死因（确信；判据全静态且可复算）：`:23975-23989` 的 provisional finalizer 循环把"arena 行号"与"表位置"
   当成了同一个数。** `typeSymbolIdByArenaTypeId` 由 `csg.typeArena.symbolIds` 逐行填（`:17341`），
   **它的下标是 arena 行号**；而 `symbols.typeIds[typeSymbol]` 在 `:24059-24066` 已被重映射成
   **`tables.types` 的最终行号**。Type 表在 `:23924`/`:23950` 追加了合成的函数签名行、并在 `:24016` 按 row cid
   全表规范排序之后，**arena 行不再占据 `0..<arenaTypeCount` 这一段位置**（`:24022-24032` 的位置↔arenaId 约束
   比的是**旧位置**，被保序搬走的行照样满足）⇒ `typeIds[symbol]` 可以 ≥ `typeSymbolIdByArenaTypeId.len`（=17）
   或落在被搬走的行上，于是 `:23976` 的 `continue` 或 `typeSymbolIdByArenaTypeId[typeId] == -1`
   **把该 Type 符号永久跳过** ⇒ `symbolCids` 停在 `:17301` 的**空 provisional cid** ⇒ `:19938` 不相等 ⇒ 本判词。
2. **不是 §5 的 C1 原始形态、不是 C2、不是 C3，而是"C1 同一子系统里的第二种缺陷"：反向表的**下标语义**错，
   不是"某个字段行抢认领"。** §5 的 C1 说对了子系统（finalizer 覆盖），说错了机制；C2/C3 均被坐标排除（判据见 A.3）。
3. **`symbol=2` 恒定的含义**：本审计只对 `symbolKinds[s] == CsgCompilerSymbolType` 的符号开火（`:19936`），
   五件夹具都只有**一个** Type 声明（`Slots`，与 `ta_limits declaration_symbols=1` 一致）⇒ 这个 2 是同一个逻辑符号。
4. **"`type`/`arena_type` 全不相等"不能用来判 C1/C2/C3**——`arena_type` 列在 v1 里**读错了列下标**（见 A.2），
   该列整体作废。**`type` 列才是决定性的**，判据见 A.3。
5. **修法**：`patches/type_symbol_finalizer_arena_position_fix.patch`（`git apply --check` **exit 0**、`--reverse` exit 1）。
   **不放宽任何守卫**：原有三条（`< 0` 跳过、kind != Type 跳过、finalizer 自身全部守卫）
   逐字保留，只是把被跳过的符号补进覆盖域，并新增一条与 `:24022-24032` 同义的位置越界 fail-closed 判词
   （在 `:24059-24066` 与 `:16365-16368` 的全覆盖/双射契约下恒不触发）。
   **〔量级与载体已按 r9o 基线重出：`+28 / −4`，改用符号自己的 `symbols.typeIds` 取最终位置（不引入新局部、
   不再依赖 `Fmt`）。第一版 `+22 / −5` 的写法在目标函数里**前向引用** `finalTypeIdByArenaTypeId` 而编译不过，
   根因、逐标识符可见性证明与自验回执见文末**附录 B**。〕**
6. **探针**：`patches/declkey_finalizer_arena_position_probe_v3.patch`（`apply --check` exit 0，与修法同基线）。
   与修法**不叠加**（同一段循环的两种改法，各自独立 apply）。**v1 探针已删除**（`arena_type` 列读错下标，见 A.2）；
   **v2 探针已存档**（它建立在编译不过的第一版修法之上，sha256 `8b3ea7a3…`）。

## A.1 r9q 原始坐标（上游回执，逐字）

```
r8_fixed_len_named_const_main    rc=2  symbol=2 type=17 arena_type=13 decl=4
r8_fixed_len_inline_arith_main   rc=2  symbol=2 type=11 arena_type=-1 decl=1
r9_fixed_len_forward_const_main  rc=2  symbol=2 type=14 arena_type=4  decl=4
r9_fixed_len_untyped_const_main  rc=2  symbol=2 type=8  arena_type=4  decl=3
M-A（零 const + int32[8]）        rc=2  symbol=2 type=6  arena_type=16 decl=3
M-B（纯标量 object 控制组）        rc=2  typed-node unmanaged ownership premise drift node=0（不报本句）
```

配套事实（本席复核 `.rebuild/s1b_step3/r9/fx_*.stderr.txt`）：四件 `csg_mem tag=type_arena … types=17`，
即 **arena 行 0..16**。

## A.2 v1 探针自身的缺陷（先改正，再判读）

`producerTypeArenaIds` 是按 **TypeId** 索引的列表（schema `compiler_snapshot_schema.cheng:424`；
唯一写入点 `compiler_snapshot_builder.cheng:14397` = `add(tables.types.producerTypeArenaIds, arenaTypeId)`），
而 v1 的 Fmt 用了 `arena_type={tables.types.producerTypeArenaIds[declId]}`——**`declId` 是声明表行号，不是 TypeId**。
⇒ v1 的 `arena_type` 列（13/-1/4/4/16）**整体作废**，它只是"第 declId 行类型"的 arena 行号。
因此上游两条线索里，"type/arena_type 全不相等"与"`inline_arith` 的 `arena_type=-1`"**都不成立**。
`type=` 列是干净的，且它单独就够了。

## A.3 `type=` 列为什么是决定性的

`type=17` 出现在 arena `types=17`（行 0..16）的那一件上 ⇒ **17 不可能是 arena 行号**。
Type 符号的 `symbols.typeIds` 只有两个来源：`:17317` 落表写 `signatureArenaTypeId`（arena 行号，`:17181-17188`），
`:24066` 重映射为**表行号**。⇒ `type=17` 只能是**表行号**。`type=11 / 14 / 8 / 6`（都 < 17，看似"像 arena 行"）
是**同一类 arena 行在不同夹具里的不同最终位置**，随各夹具的签名行数漂移。

| 解释 | 预测的 `type=` | 实测 | 结论 |
|---|---|---|---|
| finalizer 根本没跑（符号不在反向表里，C1 原始形态） | 稳定的 arena 行号 | 17/11/14/8/6，跨形态漂移且出现 ≥ arena 行数 | **排除** |
| 跑了但 observed typeCid 取错（C2） | 认领到邻行 ⇒ 同为稳定小值 | 同上 | **排除** |
| alias/tuple 两趟不动点（C3） | 与定长数组字段无关（M-B 也会炸） | M-B 不报本句 | **排除** |
| `type=` 是**最终表位置**、反向表按 arena 行号索引 | 位置随签名行数漂移、可 ≥ arena 行数 | **完全吻合** | **采用** |

## A.4 `symbol=2` 恒定意味着什么

无歧义：审计谓词只放行 `kind == CsgCompilerSymbolType`（`:19936-19937`），五件夹具各只有**一个** Type 声明。
M-B（纯标量 object）在同一驱动上**不报本句**，说明该符号与"是否含定长数组字段"无关地存在，
**只是含数组字段时它的最终位置才会被搬出 arena 前缀**。⇒ `symbol=2` 是同一个符号 `Slots`。

## A.5 M-A/M-B 与 §5 的对照

- M-A（零 const + `int32[8]`）**报本判词** ⇒ 与常量面无关（§4 已证），形态因子是**定长数组字段**。
- M-B（纯标量 object）**不报本判词**（改报 `typed-node unmanaged ownership premise drift node=0`）
  ⇒ **C1 原始形态（"`:14394` 空认领翻转"）不成立**——本席在 §5 留的那个翻车点没有出现，翻车点在别处（见 A.0.1）。
  纯标量对象里只有 seed 行与 object 行，没有"被搬走的行"，最终位置仍落在 arena 前缀内。
- ⇒ 触发条件 = "**存在被规范排序搬出 arena 前缀的 arena 行**"；定长数组字段正好制造这种行
  （object 预留在前、数组行 intern 在后，行 cid 顺序 ≠ 预留顺序）。

## A.6 修法与"不放宽守卫"的逐条论证

**补丁**：`patches/type_symbol_finalizer_arena_position_fix.patch`（`git apply --check` **exit 0**；`--reverse` exit 1 = 未落树）。

```
-    for typeId in 0..<tables.types.typeCids.len:
-        if typeId >= typeSymbolIdByArenaTypeId.len:
-            continue
-        let typeSymbolId = typeSymbolIdByArenaTypeId[typeId]
+    for arenaTypeId in 0..<typeSymbolIdByArenaTypeId.len:
+        let typeSymbolId = typeSymbolIdByArenaTypeId[arenaTypeId]
         if typeSymbolId < 0 || kind != Type: continue          # 原样保留
+        let typeId = finalTypeIdByArenaTypeId[arenaTypeId]      # arena 行 → 最终位置
+        if typeId < 0 || typeId >= tables.types.typeCids.len:
+            err = " ...: Type Symbol finalizer TypeId remap drift"   # 新增 fail-closed
+            return false
         ... 原样：declarationRow → FinalizeTypeSymbolDeclKeyInto
```

1. **原有判据逐字保留**：`typeSymbolIdByArenaTypeId[...] < 0 ⇒ skip`、`kind != Type ⇒ skip`、
   finalizer 内部 `:18494-18508` / `:18537-18547` 全部守卫、`:19284` 的 `declarationTypeBindingCount == 1`
   ——**一条未动**。
2. **覆盖域只增不减**：旧式能跑到的符号新式仍跑到（`finalTypeIdByArenaTypeId` 是双射，每个 arena 行恰一个位置）；
   旧式**漏掉**的（位置 ≥ `typeSymbolIdByArenaTypeId.len`，或位置落在被搬走的行上）现在被补上。
3. **新增判据恆不触发**：`:24033-24041` 要求 `newTypeIdByOld.len ≥ csg.typeArena.typeCount`、
   `:24022-24032` 要求每个 arena 行的位置都在 `0..<len`、`:16365-16368` 要求 arena 行全覆盖
   ⇒ `finalTypeIdByArenaTypeId[arenaTypeId]` 恒落在 `0..<tables.types.typeCids.len`。
   **它是"若该等价关系被破坏就硬失败"的兜底，不是放行条件。**
4. **不动哈希面**：finalizer 的计算输入（`typeCids[typeId]`、`declarationPathCids`、事件坐标）一字未改，
   只是**跑到的符号集合变大**；新覆盖到的符号写进去的是同一张 mini 表按同一规则算出的 key
   （即 `:19303` 权威表用的 observed typeCid 所对应的那个）。
5. **对已通过者零影响**：已 finalize 的符号会被再 finalize 一次（旧式在位置 < len 时同样会跑到），
   mini 表是纯函数、幂等 ⇒ 值不变。**注意：函数类型符号不在本循环域内**（反向表只覆盖 arena 行），
   `prebuildFacts.symbolCids` 不被本补丁触碰。

**最可能的翻车点（诚实）**：若 `symbols.typeIds[typeSymbol]` 在 `:24059` 重映射之前**不是** arena 行号
（即 `:17317` 的 `signatureArenaTypeId` 语义与 A.3 的读法不符），则 `arenaTypeId → typeId` 的方向会反，
修法会把 finalizer 指到错行。判别：跑 M-A 看是否 rc=0；若出现新判词
`portable Type declaration CID join invalid`（`:24832`）即为反证。

## A.7 还需要哪条动态证据（最小）

| 优先 | 动作 | 判读 |
|---|---|---|
| 1 | 烤 `type_symbol_finalizer_arena_position_fix`，跑四件正例 + M-A + M-B | 四件与 M-A **rc=0 或推进到更晚的墙**、负例 `must be int32` 逐字不变、M-B 判词不变 ⇒ 死因确证 |
| 2 | 若四件仍报**同一判词** | 用探针 v2 打一次：预期 `type=17 … arena_type=0..16 resolved=1 finalized=2 observed=0`。若 `observed=1` ⇒ 是 C2 面；若 `arena_type=-1` 且 `resolved=1` ⇒ A.3 的读法被推翻 |
| 3 | 字节中性回归（同 `--out` 串行两跑） | `ordinary_zero_exit_fixture`/`call_fixture`/`cold_nested_fmt_interpolation_smoke` 与 `kd_r9q` 侧 sha 逐字相同 |

## A.8 本附录的未测项

1. **仍未运行任何编译**：A.0-A.6 全部是 `read`/`grep` + r9q 坐标的静态判读；修法补丁**只做了 apply 校验，未编译**。
2. **`finalTypeIdByArenaTypeId` 的取值未实测**：A.3 的关键断言"`symbols.typeIds[Slots]` 是最终表位置"由
   探针 v1 的 `type=17`（对照 `types=17`）反推，**没有**打印 `finalTypeIdByArenaTypeId[15]` 本身；
   探针 v2 的 `resolved=`/`arena_type=` 两列正是为此设计的交叉验证。
3. **`type=11/14/8/6` 各自对应哪个 arena 行未实测**（A.3 的解释性推断）。
4. **"规范排序必然把 arena 行搬出前缀"未证**：只证了 `:24022-24032` 的约束**允许**这种搬动（比的是旧位置），
   实证是 `type=17 ≥ 17`。
5. **M-B 的墙 `typed-node unmanaged ownership premise drift node=0` 与本链的关系未查**（未读该判词判据）。
6. **未做跨夹具 `--out` 字节比对**（纪律禁止本席编译，需槽位持有者执行 A.7 第 3 项）。

---

# 附录 B（v1 修法编译翻车 → r9o 基线重出，含作用域自检）

## B.0 翻车事实与根因（第九手核，本席采信）

`patches/type_symbol_finalizer_arena_position_fix.patch` **第一版编译不过**：

```
cheng_cold:   |         let typeId = finalTypeIdByArenaTypeId[arenaTypeId]
cheng_cold:   |                     ^^^^^^^^^^^^^^^^^^^^^^^^
cheng_cold: unknown identifier (recovery=1 depth=2)
cheng_cold: reachable function body missing: builder.compilerSnapshotBuilderTypeFunctionProjectValidatedInto
```

**根因：不是"名字不存在"，是"名字在该函数作用域内不存在"**。`finalTypeIdByArenaTypeId` 在本文件里有 **5 个各自独立的
函数内局部**（`:6694`、`:7313`、`:24037`、`:25137`，外加若干 `var` 形参），本席原稿把它用在了
`compilerSnapshotBuilderTypeFunctionProjectValidatedInto`（`:23548`）里——**该函数作用域中确实没有这个名字**
（本席当时是拿 `:24076` 同函数内的用法当依据的，那处位于插入点**之后**，属于前向引用）。第九手判定准确。
**照抄改名修不好**：该函数里没有等价载体（(A) 路不通）⇒ 必须换成"该函数自己的载体"。

## B.1 选定载体：**符号自己的 `symbols.typeIds`**（不引入任何新局部）

`compilerSnapshotBuilderTypeFunctionProjectValidatedInto` 里同域、同物、且**在插入点之前**已经存在载体的写法有两条：

| 候选载体 | 定义处 | 插入点可见性 | 采用 |
|---|---|---|---|
| `finalTypeIdByArenaTypeId`（`var` 局部） | `:24037`（**同函数**，但在插入点 `:23975` **之后**） | ✗ 前向引用 ⇒ 编译报 unknown identifier | ✗ |
| `newTypeIdByOld`（`var` 局部） | `:24015`（同函数，仍**在插入点之后**） | ✗ 同样前向 | ✗ |
| **`tables.symbols.typeIds[typeSymbolId]`** | `:17317` 落表（`signatureArenaTypeId`，即 **arena 行号**）、`:24066` 重映射（**最终表位置**） | ✓ 列本身在 `tables` 里；且在插入点处**已经是最终表位置** | **✓** |

关键事实（本席逐条核过、可复算）：**`:24059-24071` 的既有 remap 循环与本 finalizer 循环索引同一张
`typeSymbolIdByArenaTypeId`、同一批符号**，它在 `:24066` 用的就是"该符号自己的 `typeIds`"——
也就是说"符号 → 最终表位置"这个数在插入点**已经被算好并写回列里**了，不需要 `finalTypeIdByArenaTypeId`。
这与最终版补丁 A.0 的机制判断完全一致，且**不新增任何局部、不动任何既有语句的语义**。

## B.2 每一处新增/改动行的逐标识符可见性证明（本次翻车的直接教训）

目标函数 `compilerSnapshotBuilderTypeFunctionProjectValidatedInto` 起于 **`:23548`**（下一个顶层 `fn` 之前结束）。

| 新行用到的标识符 | 定义处 file:line | 在插入点（`:23975` 前）可见的理由 |
|---|---|---|
| `tables`、`csg`、`err` | `:23548-23552` 形参 | 本函数形参，作用域覆盖全函数体 |
| `typeSymbolIdByArenaTypeId` | `:23614` `var typeSymbolIdByArenaTypeId: int32[]`（**本函数内声明**） | 声明在 `:23614` < 插入点 `:23975`，**同函数、词法在前**；由 `:23617-23624` `AppendTypeSymbolsInto` 填满 |
| `declarationRowByOldSymbol` | `:23613` `var declarationRowByOldSymbol: int32[]`（**本函数内声明**） | 同上，`:23613` < `:23975` |
| `tables.symbols.typeIds` | `compiler_snapshot_schema.cheng` 列；本函数写点在 `:24066` | 列属于 `tables`（形参）；插入点处其值已是最终表位置（由 `:24059-24071` 的语义保证，与该循环同源） |
| `tables.symbols.symbolKinds` | 同上，写点 `:17313` | 列属于 `tables` 形参 |
| `snapshot_schema.CsgCompilerSymbolType` | `compiler_snapshot_schema.cheng:17` `CsgCompilerSymbolType: int32 = 2`（**模块 const**） | 模块级常量，`:23980-23982` 原代码已在同一函数同一位置使用 ⇒ 可见性已被现网证明 |
| `compilerSnapshotBuilderFinalizeTypeSymbolDeclKeyInto` | `compiler_snapshot_builder.cheng:18487`（**模块级 fn**，885 行之前） | 模块级函数，定义在本文件、早于调用点；`:18487` < `:23986` |
| `tables.types.typeCids` | `tables.types` 列，`add` 于 `:14396`/`:16242` | 列属于 `tables` 形参；`:23971`/`:24012` 是本函数内的写点 |
| （探针 v3 额外）`compilerSnapshotBuilderCidObserved` | `:427`（模块级 `@borrows fn`） | 模块级，`:427` ≪ 插入点；且 `:19870` 等本文件多处已调用 |
| （探针 v3 额外）`Fmt"…"` | 宏，本文件 27 处使用（如 `:2293`、`:18078`） | 宏全文件可用；**但最终版补丁已把唯一新增判词改成纯字符串，不再依赖宏**（第一版 v1 探针里 `Fmt` 在同一函数内烤过，故可用性本身已实证） |

**自检脚本（写进生成器，任一断言失败即 exit 2）**：① 两个 `var` 声明在目标函数内、且在锚点之前各出现 **1** 次；
② 被调函数定义在锚点之前；③ 常量在 schema 模块内；④ 新行**不**引用任何 `finalTypeIdByArenaTypeId`/`newTypeIdByOld`。
⑤（额外）插入后的循环**仍是索引 `typeSymbolIdByArenaTypeId`**，与 `:24059` 的既有循环同域同索引。

## B.3 与 A.6 的差异（最终版的改动面）

- **基线**：r9o 纯态。对照哈希：`compiler_snapshot_builder.cheng` = `928d2cc98edf2eaa9bb6ed181f3021e6e703092e`（本席申请时上游给的是
  `e6d16ece…`，为**撤回后**的哈希口径；两者均指同一 r9o 内容，以本席 `git hash-object` 实测值为准）。
- **量级**：`+28 / −4`（旧版 `+22 / −5`）。4 条 `−` 行 = 4 条被替换的循环头/索引/缩进行，见下。
- **不再引入** `finalTypeIdByArenaTypeId` / `newTypeIdByOld`（前向引用源已消除）。
- **不再依赖 `Fmt`**：新增的位置越界判词改为纯字符串 `"...: Type Symbol finalizer TypeId map drift"`
  （该判据在 `:24059-24066` 与 `:16365-16368` 契约下恒不触发，只做 fail-closed 兜底，不值得冒宏风险）。
- **语义等价性论证不变**：finalizer 仍在**第一趟 row cid 之后、第二趟之前**（原位置），
  只把"用表位置查 arena 反向表"换成"用 arena 行查反向表 + 用符号自己的 `typeIds` 取最终位置"。

## B.4 自验回执（本席执行，全部通过）

| 项 | 命令 | 结果 |
|---|---|---|
| apply 校验 | `git apply --check patches/type_symbol_finalizer_arena_position_fix.patch` | **exit 0** |
| 正向应用 == 生成目标 | `git apply` 后 `cmp` `/tmp/pdkey/fix_final.cheng` | **逐字节相同** |
| 反向复原 | `git apply -R` 后 `git hash-object` | **`928d2cc98edf2eaa9bb6ed181f3021e6e703092e`**，`git diff --stat` 回到原 WIP 面（135+/22−） |
| 多重集相等 | 补丁 ± 行 vs `difflib` 重生成 | `minus=4 plus=28`，**逐行多重集相等** |
| 探针 v3 | `git apply --check patches/declkey_finalizer_arena_position_probe_v3.patch` | **exit 0**（与修法同基线、**不叠加**） |
| 存档 | `patches/_archive/type_symbol_finalizer_arena_position_fix.broken_forward_ref.patch` | sha256 `3defa1fe…`（旧坏版）；v2 探针 sha256 `8b3ea7a3…`；清单见 `patches/_archive/SHA256SUMS.txt` |

当前版本 sha256：修法 `5be8c0ba11d8f1175136b492b9b8708b76ce3838791787a78ec93ce7acc415ce`；
探针 v3 `693af338aaa39b322a77dca03c701c772e96013cc41d76c4895a08e10387b7e8`。

## B.5 翻车表征（不变）与新增的次生表征

- **机制判错** ⇒ 四件仍报同一判词，或出现 **`portable Type declaration CID join invalid`（`:24832`）**
  （说明"`typeIds[sym]` 在插入点已是最终表位置"这一读法有误）。
- **作用域/语法再翻车** ⇒ 会是 `cheng_cold: unknown identifier` 或 `reachable function body missing`，
  **不是**上述任何判词。B.2 的自检脚本就是为这一类准备的。

## B.6 附录 B 的未测项

1. **仍未编译**：B.4 全部是 apply/字节/多重集级自检，**没有**本席自己的编译证据；
   "所有标识符在该点可见"是**静态证明 + 现网同类用法**，不是编译器背书。
2. **`tables.symbols.typeIds[sym]` 在插入点确为最终表位置**这一条，仍是从 `:24059-24066` 的既有循环**同源推出**的，
   未用探针实测；探针 v3 的 `type=`/`arena_type=` 两列（`producerTypeArenaIds[typeIds[sym]]`）正是为该验证而设：
   若修法生效后仍报判词，`arena_type` 应落在 `0..<arenaTypeCount`，否则本读法被推翻。
3. **`decl=1/3/4` 的语义**仍未用（见 A.8.7）。
7. **`decl=1/3/4` 的语义未用**：v1 的 `declId` 只是候选→声明表行号，本附录未依赖它。

---

# 附录 C（v2 落树无效 → 机制回退重推；交出 key-diff 探针 v4）

## C.0 已知与结论先行

**已知（上游 kd_r9u 实测）**：v2 在树内（`git apply -R --check` 通过），四件正例**仍报同一判词、逐字相同**；
M-A 仍报本判词，M-B 仍报 `typed-node unmanaged ownership premise drift node=0`；负例 `must be int32` 逐字未变。
⇒ **A.0/A.6 的机制判断被实践否定**（本席在 A.6 写下的翻车判据触发）。

1. **"v2 无效"本身就是强证据**：v2 把 finalizer 循环的覆盖域从"表位置 < arena 行数"扩到**全部 arena 行**
   （`for arenaTypeId in 0..<typeSymbolIdByArenaTypeId.len`），`kind == Type` 过滤不变。
   **A 类（某 Type 符号永远不被 finalize）只要该符号在反向表里，就必然被 v2 修掉**。实测纹丝不动
   ⇒ **要么该符号根本不在反向表里，要么漂移不是"没跑 finalizer"**。
2. **本轮写点普查（当前树重做，含全部已落树补丁）**：`symbolCids` 的**唯一真写点仍是 `:18580`**（finalizer）；
   其余 15 处全是 `add(..., FixedBytes32())` 空占位或 `:13476` 的 `prebuildFacts.symbolCids`（只覆盖函数符号）。
   **"第三条写路径"不存在**（证据见 C.1）。
3. **两条调用链已合并为一条（关键新事实，v1 时代不存在）**：当前树里
   `compilerSnapshotBuilderFinalizeTypeSymbolDeclKeyInto` **只有一个调用点**（`:24010`），
   `compilerSnapshotBuilderDeclarationAuthorityCommitInto` **也只有一个调用点**（`:24197`），
   **两者都在 `compilerSnapshotBuilderTypeFunctionProjectValidatedInto`（`:23548`）内**
   ⇒ A.8.9 未测项"失败在 `:11334` 链还是 `:25400` 链"**已消解**：只有一条链（`:11334` 入口）。
4. **A/B 二分的可判据形式**（用户要求"一条读数直接判定"）：**A 类** ⇒ `observed=0`（空 cid）；
   **B 类** ⇒ `observed=1` 且 `first_diff` 给出首个不同字节。**同一行输出同时给出两者**，不需要第二次烘焙。
5. **交付**：`patches/declkey_audit_keydiff_probe_v4.patch`（`apply --check` **exit 0**）= v2 修正 + 判词坐标 +
   key 逐字节差异定位，**一个补丁一步到位、不叠加**。**本席本轮不出第二版修法**（用户第 5 条：无坐标不猜）。

## C.1 当前树 `symbolCids` 写点普查（重做）

```
$ grep -rn "symbolCids\[[^]]*\] *=" src/ --include=*.cheng | grep -v ^src/tests/
compiler_snapshot_builder.cheng:18580:    tables.symbols.symbolCids[symbolId] =      ← 唯一真写点（finalizer）

$ grep -rn "add([a-zA-Z.]*symbolCids" src/ --include=*.cheng | grep -v ^src/tests/
:10339 :10428 :10627 :10761 :11280   ← unsealed 基础域（extern/module），全空
:13044  moduleKeys[sourceId]          ← 模块符号 key（kind=Module，不参与本审计）
:13125  canonical.symbolCids          ← 规范表重建（读 newKeyByOld）
:13476  prebuildFacts.symbolCids[symbolId]  ← 只覆盖函数符号
:17301 :17734 :17944 :18383           ← Type/Generic/Parameter/Local 落表，全空
:20091  canonical.symbolCids          ← 规范表重建（读 newKeyByOld）
```

`compiler_snapshot_builder.cheng` 之外**没有**任何模块写 `tables.symbols.symbolCids`
（`typed_expr_type_arena.cheng` / `compiler_csg.cheng` / `semantic_snapshot_declaration_identity.cheng` 均无写点）。
⇒ Type 符号的非空 cid **只能**来自 `:18580`。**A 类 ⇔ finalizer 没跑到它；B 类 ⇔ 跑到了但 mini 表 key ≠ 权威 key。**

## C.2 B 类的六个 key 分量逐项表（用户第 3 条要求）

key = `semanticSnapshotDeclarationKeyCid`（`semantic_snapshot_declaration_identity.cheng:421-442`）
= `H(domain, portableDocumentIdentityCid, ownerDeclKeyCid, declarationKind, nameSurfaceKind, canonicalName,
portableSignatureTypeExpressionCid, lexicalScopeCid)`。

| # | 分量 | finalizer 侧（`:18511-18565`） | 权威表侧（`:19147-19308`） | 同源? |
|---|---|---|---|---|
| 1 | `portableDocumentIdentityCid` | `sources.documentCids[sourceId]`（`:18556`），`sourceId = symbols.sourceIds[symbolId]` | `sources.documentCids[sourceId]`（`:19298`），同一 `sourceId` | **同** |
| 2 | `ownerDeclKeyCid` | 模块候选（`:18511-18532`）：packageId/modulePath/documentCid/kind=Module/surface=ModulePath/name=modulePath/proof=documentCid/sig=documentCid/scope=零/span=0..0/owner=-1 | 模块候选（`:19150-19167`）：**逐字同一公式**（并与 `ModuleDeclKeysInto :12894-12918` 三方一致） | **同** |
| 3 | `declarationKind` | `KindType`（`:18558`） | `KindType`（`:19300`） | **同** |
| 4 | `nameSurfaceKind` | `NameSurfaceIdentifier`（`:18559`） | `NameSurfaceIdentifier`（`:19301`） | **同** |
| 5 | `canonicalName` | `texts[nameTextId]`，`nameTextId = tokens.valueTextIds[declarationNameTokenIds[declarationRow]]`（`:18533/18544`） | `texts[tokens.valueTextIds[nameTokenId]]`，同一 `declarationNameTokenIds[declarationRow]`（`:19293-19294`） | **同**（前提：两侧 `declarationRow` 相同） |
| 6 | `portableSignatureTypeExpressionCid` | `types.typeCids[typeId]`，`typeId = symbols.typeIds[symbolId]`（`:18502/18561`） | `types.typeCids[typeId]`，同式（`:19244/19303`） | **同**（前提同上） |
| 7 | `lexicalScopeCid` | 零 `FixedBytes32()`（`:18561`） | 零（`:19303`） | **同** |

**⇒ 静态上六项全同。** B 类若成立，只剩两个"前提"可破：
**(i)** 两侧 `declarationRow` 不同（finalizer 由 `:23986-23987` 传入，权威表由 `:19216`/`:19308` 使用，
两者都取自 `declarationRowByOldSymbol[symbolId]`）——**唯一可疑处**；
**(ii)** `types.typeCids[typeId]` 在 finalizer 之后被改写（`:24012` 二趟派生、`:24017` 规范排序都会重写该列）。
**(ii) 本席已静态排除**：nominal 行前像读 `symbols.declarationPathCids[declSymbolId]`
（`compiler_snapshot_schema.cheng:5678-5689`），finalizer 只写 `symbolCids`，`traitProofCid`（`:5964`）不读 `symbolCids`
⇒ 两趟派生同值。
**⇒ B 类的唯一存活形态是 (i)：`declarationRowByOldSymbol[该符号]` 指向的声明行 ≠ 权威表里该符号候选所用的行。**

## C.3 探针 v4：一把尺子直接判 A/B 并定位

基树 r9u（`git hash-object compiler_snapshot_builder.cheng` = `83a2f3fd49ce955dfb82bac1f3ffed4d5368bbc0`）。
在判词点 `:19941` 把判词替换为：

```
            var firstDiff: int32 = -1
            for diffIndex in 0..<layout.FixedBytes32Size:
                if firstDiff < 0 &&
                   tables.symbols.symbolCids[oldSymbolId].data[diffIndex] !=
                       newKeyByOld[oldSymbolId].data[diffIndex]:
                    firstDiff = diffIndex
            err = Fmt" ...: provisional Type DeclKey drift symbol={…} kind={…} type={…} arena_type={…} observed={…} first_diff={firstDiff} name_token={…} decl_name_token={…}"
```

**一条读数即判**：

| 读数 | 结论 | 下一步 |
|---|---|---|
| `observed=0` | **A 类**：该 Type 符号 cid 为空 ⇒ finalizer 没覆盖到它 | 看 `type`/`arena_type`：`arena_type=-1` ⇒ 符号 `typeIds` 不指向 arena 行；否则 ⇒ 反向表里没有它 |
| `observed=1`、`first_diff=-1` | 两值相同却进判词 ⇒ 判词点读法有误 | 回读 `:19936-19940` |
| `observed=1`、`first_diff=0..7` | **B 类**：key 头段（domain/文档身份）不同 | 查 C.2 第 1 项 |
| `observed=1`、`first_diff=8..71` | **B 类**：owner 链分歧 | 查 C.2 第 2 项（该 source 的模块候选取值） |
| `observed=1`、`first_diff=72..135` | **B 类**：kind/surface/name/observedTypeCid 段分歧 | 比对 `name_token` vs `decl_name_token`：不等 ⇒ 正是 (i) |

`name_token` 与 `decl_name_token` 这一对**专为 (i) 设计**：若两者不等，则 `declarationRowByOldSymbol[该符号]`
指向的声明行不是该符号自己的声明行 ⇒ B 类坐实，且修法位置随之确定在
**产出 `declarationRowByOldSymbol` 的那一步**（`:23613` 的 `AppendTypeSymbolsInto` 调用或其内部 `:17332`），
**而不是 finalizer 循环**（v2 已证该处非死因）。

**自验回执**：`git apply --check` **exit 0**；正向 apply 后与生成目标 `cmp` 逐字节相同；
`git apply -R` 后 `git hash-object` 回到 `83a2f3fd49ce955dfb82bac1f3ffed4d5368bbc0`；
补丁 ± 行多重集相等（minus=1 plus=7）；sha256 `3ecb67f3c7f865db000f91bb00ec8104f3e26af35457211d7a26cf5ce8f0049a`。

**逐标识符可见性证明（脚本断言：全部在 `compilerSnapshotBuilderDeclarationAuthorityCommitInto` 内、且声明在判词点之前）**：

| 标识符 | 定义处 | 可见性理由 |
|---|---|---|
| `oldSymbolId` | `:19925` `for oldSymbolId in 0..<symbolCount:` | 同一 `for` 绑定 |
| `newKeyByOld` | `:19919-19922` `var newKeyByOld: layout.FixedBytes32[]` | 同函数、`:19919` < `:19941` |
| `tables` / `csg` | `:19034-19036` 形参 | 形参 |
| `declarationRowByOldSymbol` | `:19037` **形参** | 形参（不跨函数、非前向） |
| `symbolCount` | `:19043` `let symbolCount = …` | 同函数、在判词点之前 |
| `compilerSnapshotBuilderCidObserved` | `:427` 模块级 `@borrows fn` | 模块级、早于本函数 |
| `layout.FixedBytes32Size` | `layout` 模块常量 | 仓内既有用法：`semantic_snapshot_incremental_plan.cheng:362/434`、`compiler_execution_stage_receipt.cheng:157` |
| `Fmt"…"` | 宏（本文件 27 处） | v1 探针**已在同一函数内烤过**，只报机制判词、无语法错 ⇒ 可用性有实证 |
| `.data[…]` | `layout.FixedBytes32` | 本文件既有同形：`:433-436` `left.data[index] != right.data[index]` |

**缩进层级核对（不切链）**：新块与被替换行**同一 if-body 缩进（12 空格）**；`for` 体 16、`if` 体 16（续行 19/23）、
赋值 20 —— 逐行核过；`var firstDiff` 在**同一 if 块内、使用之前**声明（无前向引用、无跨函数）。

## C.4 为什么本轮不出修法（明确"等坐标"）

用户第 5 条：**无坐标不猜修法**。A.0/A.6 的机制已被 kd_r9u 否定，本席目前**没有**被证据支持的替代机制；
C.2 把 B 类收窄到唯一存活形态 (i)，但 (i) 是否成立必须由 `name_token` vs `decl_name_token` 这对读数决定。
故本轮交付 = **v4 探针 + 判读表 + 六分量表**；坐标到手后修法应落在产出 `declarationRowByOldSymbol` 的那一步。

## C.5 附录 C 的未测项

1. **仍未编译**：v4 只做 apply/字节/多重集/可见性校验；`layout.FixedBytes32Size` 与 `.data[…]` 在该函数内的
   可编译性由仓内同形用法旁证，非编译器背书。
2. **`observed` / `first_diff` 取值未实测**：A/B 判据已写好，读数未到。
3. **C.2"六项全同"是静态比对**：若 `first_diff` 落在头段（0..7），说明第 1 项（文档身份）实际取值有分歧，
   本表在该处被推翻——**这是本表最可能的翻车点**。
4. **`symbols.typeIds[symbolId]` 的重映射时序是本席最薄弱环节**：finalizer 在 `:24099-24134` 的重映射**之前**读它，
   权威表在**之后**读它；若该列在重映射中改变，两侧 observed typeCid 必然不同（即 C.2 的 (ii) 复活）。
   本席以"nominal 行前像不读 symbolCids"从侧面排除，**未用读数验证**；v4 的 `type=`/`observed`/`first_diff` 组合可判定。

---

# 附录 D（v4 坐标 → **真死因 = 时序**；修法已出：把 finalizer 搬到 TypeId 重映射之后）

## D.0 两处对上游判读的更正（先更正，再修）

上游据 `first_diff=0` 判"差异落在 0..7 文档身份段"。**这个推断不成立**，两处更正：

1. **`first_diff` 是 hash 输出的字节差，不是 preimage 的段差**。`semanticSnapshotDeclarationKeyCid` 最后一步是
   `hash256.Sha256Fixed(...)`（`semantic_snapshot_declaration_identity.cheng:440`）。SHA-256 雪崩 ⇒ 任一输入分量
   只差 1 bit，输出 32 字节**全部重排**，所以 `first_diff=0` 只说明"两个 key 不同"，**不能定位到任何输入分量**。
   C.3 判读表里"0..7=文档身份 / 8..71=owner 链 / 72..135=kind-surface-name"那张对照**对 hash 输出无效**
   （它只对 preimage 布局有效）⇒ **该表作废**。
2. **v4 的 `arena_type` 列也读错了下标**（与 v1 同一个 bug）：v4 Fmt 用
   `tables.types.producerTypeArenaIds[oldSymbolId]`，而该列按 **TypeId** 索引 ⇒ 四件上的 `arena_type=11/11/16/11`
   **整列作废**，"`type`/`arena_type` 是否相等"这条**又一次**不能作判据。

⇒ v4 的有效读数只有三列：`observed=1`（**B 类**：cid 非空）、`name_token == decl_name_token`（两侧声明行相同）、
`type=`（**重映射之后**的最终表位置）。

## D.1 真死因（确信；判据 = v4 三列 + 纯静态时序）

**`:24005-24022` 的 provisional finalizer 在 `:24093-24110` 的 TypeId 重映射之前运行。**

- 权威表（`:19147-19308`，在 `:24197` 的 commit 内）读的 observed typeCid 是
  `tables.types.typeCids[tables.symbols.typeIds[symbolId]]`，此时 `symbols.typeIds` **已是最终表位置**
  （`:24110` 已写成 `finalTypeIdByArenaTypeId[signatureArenaTypeId]`）。
- 同一表达式在 finalizer 里（`:24009-24010`）求值时，`symbols.typeIds[symbolId]` **仍是 arena 行号**
  （重映射未发生）⇒ finalizer 用**另一个行**的 TypeCid 算 key ⇒ 两个 mini 表算出的 key 不同 ⇒
  finalizer 把**错的** key 写进 `symbolCids[symbolId]` ⇒ `observed=1` 但 `!= declKeyCids[declId]` ⇒ 判词。
- **`type=` 就是那个"最终位置"**：四件为 11/17/14/8，与"arena 行"不是同一个数 ⇒ 重映射**非恒等** ⇒
  两处读到的**不是同一行**。这也解释了 v2 为何无效：**v2 改的是"用哪个索引查反向表"，而两处读的是同一个列
  `symbols.typeIds`，它在 finalizer 处尚未被重映射** ⇒ v2 对 observed typeCid 一个 bit 都没改。
- C.2 的 (ii) 方向对、形态错：真正的 (ii) 不是"`typeCids` 变了"，而是"**索引列 `symbols.typeIds`
  在两侧求值于不同时刻**"。

## D.2 修法：把 finalizer 整段搬到 TypeId 重映射之后（纯搬迁）

**补丁**：`patches/declkey_finalizer_after_typeid_remap_fix.patch`
（基树 = 上游现树 `999e82debb22fe92f0bfc3f5401cd2ab1b920d1e`；`git apply --check` **exit 0**；`-R` exit 1 = 未落树。）

改动 = **删除 `:23985-24022` 整段（v2 注释块 + finalizer 循环），原样插到 TypeId 重映射之后、
`AppendLocalSymbolsInto` 之前**（新调用行 `:24175`，重映射 `:24071`，append `:24180`）。
**循环体逐字节相同**（提取脚本核对 `== True`）——**只改运行时刻，不改所做的事**：

```
    for arenaTypeId in 0..<typeSymbolIdByArenaTypeId.len:      # :24005 → :24160
        let typeSymbolId = typeSymbolIdByArenaTypeId[arenaTypeId]
        if typeSymbolId < 0 || kind != Type: continue          # 原样
        let finalTypeId = tables.symbols.typeIds[typeSymbolId] # ← 现在是最终表位置
        if finalTypeId < 0 || finalTypeId >= tables.types.typeCids.len:
            err = " ...: Type Symbol finalizer TypeId map drift"   # 新增 fail-closed
            return false
        ... 原样：declarationRow → FinalizeTypeSymbolDeclKeyInto
    if unsealedProductionBase && !AppendLocalSymbolsInto(...)   # 紧随其后
```

**为什么是修而不是放宽**：

1. **判据一条未改**：`< 0` 跳过、`kind != Type` 跳过、finalizer 内部 `:18494-18508`/`:18537-18547` 全部守卫、
   `:19284` 的 `declarationTypeBindingCount == 1` —— 全部原样。
2. **覆盖域不变**：仍是"反向表里每个认领了 arena 行的 Type 符号"（循环体逐字节相同可证）。
3. **新增判据恒不触发**：`:24022-24041` 的位置↔arenaId 契约 ⇒ `finalTypeId` 恒在 `0..<tables.types.typeCids.len`。
4. **不改行身份**：finalizer 只写 `symbolCids`，而**没有任何 Type 行前像读 `symbolCids`**
   （nominal 行读 `declarationPathCids`，结构行 `declSymbolId = -1`）⇒ 搬移前后 finalizer 读到的
   `typeCids[finalTypeId]` 同值。
5. **搬走后无消费者受损**：原位置与新位置之间（`ProjectTypedNodesInto`、`TypedNodeTypesProjectInto`、
   三处 TypeId 重映射循环）没有任何代码读 `symbolCids`。

**次生风险（诚实）**：若这段区间里有代码依赖"`symbolCids` 已被 finalize"，本补丁会把它暴露成**别的判词**
（而不是静默错）——本席核过的范围内没有这种消费者。

## D.3 叠加关系

- `patches/declkey_finalizer_after_typeid_remap_fix.patch` **前置态就是上游现树**（含 v2 与 v4 探针）⇒ 直接 apply，
  **不需要**先回退 v2/v4；它的语义**包含** v2（按 arena 行驱动 + 用 `symbols.typeIds` 取位置），但把运行时刻修正了。
- `patches/declkey_after_remap_fix_probe_v5.patch` = 同一修法 + **修正后**的坐标列
  （`arena_type=producerTypeArenaIds[tables.symbols.typeIds[oldSymbolId]]`，按 TypeId 索引；另有 `first_diff`）。
  与修法**不叠加**（修法已含其语义，只是不带 Fmt）。若修法无效，v5 的读数是下一轮唯一入口。

## D.4 逐标识符可见性证明（同函数/声明在前/不跨函数）

新插入点在 `compilerSnapshotBuilderTypeFunctionProjectValidatedInto`（`:23548`）内；生成器内置断言：

| 标识符 | 定义处 | 可见性理由 |
|---|---|---|
| `typeSymbolIdByArenaTypeId` | 本函数 `var`（`:23614`） | 声明在插入点前（断言计数 == 1） |
| `declarationRowByOldSymbol` | 本函数 `var`（`:23613`） | 同上 |
| `finalTypeIdByArenaTypeId` | 本函数 `var`（`:24037` 区） | 断言"TypeId 重映射在本循环之前" == 1 |
| `tables` / `csg` / `err` | `:23548` 形参 | 形参 |
| `snapshot_schema.CsgCompilerSymbolType` | `compiler_snapshot_schema.cheng:17` | 模块 const |
| `FinalizeTypeSymbolDeclKeyInto` | `:18491` | 模块级 fn，早于本函数 |

**顺序断言**：`finalizer 调用行 > 重映射行` 且 `< AppendLocalSymbolsInto 行` —— 实测 `24071 < 24175 < 24180` ✓。
**缩进**：整段按原缩进搬移（`for` 4、体 8、`if` 8/11、调用 8），未重排层级 ⇒ 不切链。

## D.5 自验回执

| 项 | 结果 |
|---|---|
| `git apply --check` | **exit 0** |
| 正向 apply 后 `cmp` 生成目标 | **逐字节相同** |
| `git apply -R` 后 `git hash-object` | **`999e82debb22fe92f0bfc3f5401cd2ab1b920d1e`** |
| `diff -u` 回生成 ± 多重集 | **相等**（minus=39 plus=40） |
| 循环体等价 | 搬移前后 finalizer 循环体**逐字节相同** |
| sha256 | 修法 `1296fbe391e448e51d31848f5c224951da446e333009fcde4ad373b0cae58819` |
| 存档 | v4 探针 → `patches/_archive/declkey_audit_keydiff_probe_v4.patch`；sha 清单 `patches/_archive/SHA256SUMS.txt` |

## D.6 验收判据（一条 grep 可判）

1. 四件正例 + M-A：`provisional Type DeclKey drift` **消失**（rc=0 必须再跑产物）；
2. 负例 `must be int32` **逐字不变**；M-B 判词**不变**；
3. **翻车表征**：`portable Type declaration CID join invalid`（`:24832`）⇒ "两侧读同一行"判断有误；
4. 三件对照与 `kd_r9v` 同 `--out` 逐字节相同；
5. 若仍报同一判词 ⇒ 上 v5 读 `observed`/`type`/`arena_type`/`first_diff`。

## D.7 附录 D 的未测项

1. **仍未编译**：D.5 全是 apply/字节/多重集/顺序/可见性级自检。
2. **"搬移后 finalizer 读到的 `typeCids[finalTypeId]` 与权威表同值"是静态论证**，未用读数验证。
3. **`type=11` 与 arena 行的对应未实测**（未打印 `finalTypeIdByArenaTypeId[<arena 行>]`）；v5 的 `arena_type` 为此而设。
4. **`ProjectTypedNodesInto`/`TypedNodeTypesProjectInto` 是否间接依赖 `symbolCids`** 未逐行读完（只确认它们不写该列）。
5. `first_diff` 在修好后不再出现 ⇒ 它只在"修法无效"时有读数价值。
