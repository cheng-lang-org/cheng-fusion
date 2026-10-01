# `corrupt structured entry chain` — 定位与归因

**结论先行**

1. **直接成因**：`typedExprBuildIndexEntryCount` 的判据函数被摘探针脚本误删了一行
   `    if index == nil:`，使函数体第一句 `return 0` 变成**无条件执行**，该函数**恒返回 0**。
   `TypedExprBuildIndexFindEntry` 的越界判据第三项 `entryIndex >= typedExprBuildIndexEntryCount(index)`
   于是退化成 `entryIndex >= 0`，只要链头非负即崩。**这是假警报：entry 链本身从未损坏。**
2. **归因 = (a) 本席摘除 E1f 探针时的误删**，且**不是**父级以为的"第三处 `os.WriteLine`"。
   被漏补的那一行是 `    if index == nil:`，HEAD 位置 **`src/core/lang/typed_expr.cheng:30273`**
   （函数 `typedExprBuildIndexEntryCount`，HEAD 原文见 §4）。
3. **(b) 被排除**：另一条 lane 的重构只写 `visibility*` 列，对 `entry*` 链列**零写入**；
   且 entry 链全部 8 个函数与 HEAD **逐字节相同**。它不可能产生这条判词。
4. **现场已变**：该行已于 **2026-09-12 08:46:46** 被补回（非本席所为，本席只写 `.rebuild/`）。
   补回后 `typedExprBuildIndexEntryCount` 与 HEAD 逐字节相同，r42/r43 现象应不再复现（未烤机验证）。

---

## 1. 直接成因

判词点（当前树行号，测量于 2026-09-12 08:47；补回前整体 −1）：

| 位置 | 内容 |
|---|---|
| `src/core/lang/typed_expr.cheng:35412` | `fn TypedExprBuildIndexFindEntry(...)` |
| `src/core/lang/typed_expr.cheng:35424` | `if entryIndex >= index.entryNext.len \|\|` |
| `src/core/lang/typed_expr.cheng:35425` | `   entryIndex >= index.entryHashes.len \|\|` |
| `src/core/lang/typed_expr.cheng:35426` | `   entryIndex >= typedExprBuildIndexEntryCount(index):` |
| `src/core/lang/typed_expr.cheng:35427` | `    panic("typed expr: corrupt structured entry chain")` |
| `src/core/lang/typed_expr.cheng:30587` | `fn typedExprBuildIndexEntryCount(index: TypedExprBuildIndex): int32 =` |
| `src/core/lang/typed_expr.cheng:30588` | `    if index == nil:` ← **被删的就是这一行**（补回前该行不存在） |
| `src/core/lang/typed_expr.cheng:30589` | `        return 0` ← 补回前它直接跟在 `fn` 行之后，成为无条件返回 |
| `src/core/lang/typed_expr.cheng:30590` | `    return index.compactCanonical ? index.entryKindIds.len : index.entryKinds.len`（死代码） |

调用链与观测现象逐项吻合：

- `TypedExprBuildIndexRegister`（`:35975`）先 `EnsureEntryCapacity`（`:35990`，首调分配 64 桶）
  再 `FindEntry`（`:35991`）。桶全空时链头为 `-1`，`while entryIndex >= 0` 不成立，
  **判据不求值**，所以前若干次注册不崩；一旦某次查询落进**已占用**的桶，链头 `>= 0`，
  第三项 `entryIndex >= 0` 立即成立 → 崩。64 桶、负载 ≤3/8，期望约 30 次查询内首撞。
- 因此崩溃点落在并林（234 源全 parse 完）之后、**第一次源 append 之前** —— 与
  `forest_appended_lines=0`、`forest_parsed_lines=234`、`rc=1` 完全一致
  （`.rebuild/s1b_step3/gate/r43_raised.summary.txt`、`r43_raised.stderr.txt` 末行）。
- r35（探针前，entry 链与 HEAD 相同）`forest_appended=158` 正常 ⇒ entry 链在探针前是好的。

**行号钉死二进制来源**：判词记录为 `src/core/lang/typed_expr.cheng:35426`。
HEAD 的 `FindEntry` 在 `30271`–`30301`（同判词语句在 HEAD 约 `35086`），而"补回前的工作树"
该 `panic` 语句恰在 **35426**。⇒ 烤轮二进制**确实由当时的工作树源码烤出**，且当时该判据函数是坏的。
（补回后同一语句移到 `35427`，可作为下一轮"修复确已进二进制"的指纹。）

---

## 2. `entryBucketHeads` / `entryNext` / `entryHashes` / `entryValueIndexes` 全部写点

**能写链头的只有 3 处**（`col[bucket] = row`），逐点判定：

| 行 | 函数 | 写入值 | 能否写出 ≥ len？ |
|---|---|---|---|
| `:36022` | `TypedExprBuildIndexRegister`（`:35975`） | `entryIndex`，取自 `:36000 let entryIndex = index.entryKinds.len` | **不能**。值在同块内先经 `:36003 add(index.entryNext,…)`、`:36004 add(index.entryHashes,…)`、`:30037 add(index.entryKinds,…)`（compact 时 `:30036 add(index.entryKindIds,…)`）等 7 个 append 之后写入；写入时 `entryIndex = 旧 len < 新 len`，且 `entryCount` 同步 +1。三列恒等长 |
| `:44204` | `typedExprBuildIndexAppendPlainEntry`（`:44161`） | `entryIndex`，取自 `:44186` | **不能**。同上形状，append 在 `:44187/:44188/:44197/:44198/:44203` 等 |
| `:43648` | `typedExprBuildCompactCanonicalIndex`（`:43581`） | `rowIndex`，取自 `:43627 let rowIndex = out.entryKindIds.len` | **不能**。append 在 `:43629/:43630/:43631/:43639/:43640/:43647`；compact 模式下 `entryCount` 用 `entryKindIds.len`，与 `entryNext/entryHashes` 同步增长 |

**整体替换链头的写点**（不产生越界值）：

| 行 | 函数 | 说明 |
|---|---|---|
| `:30852` | `TypedExprBuildIndexNew` | `EmptyBuckets(entryCap)`，全 `-1`，无链头 |
| `:33559`–`:33560` | `TypedExprBuildIndexClone`（`:33414`） | `= []` 后逐列 clone（`:33560` heads、`:33561` next、`:33562` hashes、`:33563` kinds、`:33573` kindIds、`:33568` valueIndexes），源合法则目标合法；**与 HEAD 逐字节相同** |
| `:33736`–`:33744` | `TypedExprBuildIndexRelease`（`:33700`） | 全部 `= []`；此时 `FindEntry` 因 `:35418 if index.entryBucketHeads.len <= 0: return -1` 提前返回，判据不求值 |
| `:35395`/`:35396` | `TypedExprBuildIndexRehashEntries`（`:35384`） | 同一循环内同时重建 heads 与 next；`entryIndex` 界于 `index.entryKinds.len`（`:35388`），并有 `:35389`–`:35390 if entryIndex >= index.entryHashes.len: panic("…corrupt entry hash columns during rehash")` 独立守卫 ⇒ 不可能产出越界链头（若真损坏，报的是**另一条**判词） |
| `:35401` | `TypedExprBuildIndexEnsureEntryCapacity`（`:35399`） | `EmptyBuckets(16)` 重建，全 `-1` |

**`entryValueIndexes` 写点**（全部为原地元素写，不改长度）：`:36038`（置 `-1`）、
`:36143`（自增）、`:44279`、`:44297`（置 `-1`）；整体克隆 `:33568`。

**"entries 数与 hashes 数不等"是否可能**：不可能由上述任何写点产生——
`entryNext`/`entryHashes`/`entryKinds`(与 `entryKindIds`)/`entryStates`/`entryValueIndexes`/`entryValidationMarks`
在每个 append 块内成组追加，三个 append 站点（`:36003`、`:43629`、`:44187` / `:44188`）均无单边追加。
另有两处 `entryValidationMarks` 的非 append 写：`:36734 index.entryValidationMarks = marks`
（`marks` 是同一列的自别名，长度不变）、`:37678`（原地元素写）。若真出现列数与 `entryKinds` 不等，
打的是 `:33470`–`:33480` 的 `corrupt build index entry columns …`，**不是**本判词。

**另有一条能触发同一判词的路径已被封死**：`typedExprBuildIndexMaterializeBorrowedTextColumn`
在 `:30511 index.entryKindIds = []`。若在 `compactCanonical == true` 时执行，`entryCount` 会变 0 ⇒ 同样触发本判词。
但其唯一调用者 `typedExprBuildIndexDetachCanonicalText`（`:30545`）在 `:30547` 明确
`if index == nil || index.released || index.compactCanonical || index.canonicalProjection == nil: panic(...)`，
且 `compactCanonical` 全文件只有 `:33706`(=false) 与 `:43613`(=true) 两个写点。⇒ 该路径不可达。

⇒ **在 `typedExprBuildIndexEntryCount` 正确的前提下，本判词不可达。** 它只可能因为该函数恒返回 0 而触发。

---

## 3. 归因：`(a)` —— 摘除脚本的误删，漏补的那一行

`.rebuild/s1b_step3/r9/remove_e1f.py` 的算法是：对补丁里**每一条新增行**，删除目标文件中
**该文本的前 N 次出现**（N = 该行在补丁新增集合中的重数）。任何"通用行"（HEAD 里本来就有的行）
就会命中**前置的既有位置**，而非探针自身。

对 `e1f_buildindex_lens_probe.patch` 中 `src/core/lang/typed_expr.cheng` 的 25 条不同新增行
（合计 28 行）做解析重建（`.rebuild/s1b_step3/r9/reconstruct_e1f_deletions.py`，只读），
误删集合**恰好 7 行**，全部可解析定位：

| # | 新增行文本（探针里的样子） | 重数 | HEAD 里的既有行数 | 误删落点 | 现状 |
|---|---|---|---|---|---|
| 1 | `        os.WriteLine(os.Get_stderr(),` | 3 | 2 | `HEAD:7173`、`HEAD:27562` | 已补回 ✓ |
| 2 | `        os.WriteLine(os.Get_stderr(),` | — | — | 第 3 次落在探针自身 | 探针整体已移除 ✓ |
| 3 | `@borrows` | 1 | 1137 | `HEAD:2009`（`fn typedExprManualConsumeAppendText`） | 已补回 ✓ |
| 4 | `        return` | 1 | 254 | `HEAD:4897`（`fn typedExprIrBindNodeStructuralType` 的 `if structuralTypeId < 0:` 体） | 已补回 ✓ |
| 5 | **`    if index == nil:`** | **1** | **41** | **`HEAD:30273`（`fn typedExprBuildIndexEntryCount`）** | **08:46:46 已被他人补回** |
| 6 | `` （空行） | 2 | 1871 | `HEAD:16`、`HEAD:27` | 仍缺（纯空行，无语义） |

**父级的三处修复 ①②③ 与上表 #1/#3/#4 精确对应**，说明该重建模型正确；
**遗漏的是 #5**，不是第四处 `os.WriteLine`。

> **订正父级的表述**：脚本按文本删的 3 处 `        os.WriteLine(os.Get_stderr(),` 中，
> **只有 2 处是既有位置**（`HEAD:7173`、`HEAD:27562`，父级已全部补回），
> 第 3 处落在探针函数体内部（随探针一起移除，非损失）。
> 因此"只找回 2 处、还差 1 处"的差额不在 `os.WriteLine` 上，而在同一新增集合里的另一条通用行
> `    if index == nil:`。**这才是 `corrupt structured entry chain` 的唯一成因。**

### 第三处误删的精确位置与 HEAD 原文

**位置**：`src/core/lang/typed_expr.cheng:30273`（HEAD 修订），函数 `typedExprBuildIndexEntryCount`。

HEAD 原文（`git show HEAD:src/core/lang/typed_expr.cheng`，行 30270–30276）：

```
30270| 
30271| @borrows
30272| fn typedExprBuildIndexEntryCount(index: TypedExprBuildIndex): int32 =
30273|     if index == nil:
30274|         return 0
30275|     return index.compactCanonical ? index.entryKindIds.len : index.entryKinds.len
30276| 
```

补回前的工作树（本席 08:45 实读，`grep -n "fn typedExprBuildIndexEntryCount" -A 20`）：

```
30587| fn typedExprBuildIndexEntryCount(index: TypedExprBuildIndex): int32 =
30588|         return 0
30589|     return index.compactCanonical ? index.entryKindIds.len : index.entryKinds.len
```

独立计数旁证：`grep -c -F '    if index == nil:'` 在 HEAD = **41**、当时工作树 = **40**；

**现在**（08:47:32 复测）工作树已 = 41，且函数体与 HEAD 逐字节相同
（`.rebuild/s1b_step3/r9/fn_level_diff.py` 判定 `typedExprBuildIndexEntryCount … IDENTICAL`）。

---

## 4. 排除 `(b)`：另一条 lane 的重构碰不到 entry 链

父级观察属实：`TypedExprBuildIndexRegisterVisibilityDeclaration` 从
`TypedExprCloneI32Seq(...) + add(...) + 回写` 改写成了原地 `add(...)` 形态
（`.rebuild/s1b_step3/r9/whole_file_fn_compare.py`：HEAD:35318 → TREE:35658，28 行 HEAD 语句不再逐字存在），
树内新注释自述动机为 `[S1b step-3 (8)]` 的 O(N²) churn 治理（实测 r8s3→r8s4 +4.85 GB）。**但它是无辜的**：

1. **列不相交（决定性）**：该函数（树 `:35659`–`:35710`）只引用
   `visibilityBucketHeads / visibilityNext / visibilityHashes / visibilityKinds / visibilitySourcePaths /
   visibilityNames / visibilityDetails / visibilityValueIndexes / visibilityFingerprints / visibilityQueryKinds`，
   **对 `entry*` 链列写入数为 0**。`FindEntry` 读的是 `entry*` 列。列不相交 ⇒ 不可能产生本判词
   （若坏，应报 `corrupt visibility …`）。
2. **实现自成一体、不缺语句**：HEAD 与树的该函数引用**同一组 10 个 visibility 列**，
   追加**同一组 8 个 payload 列**（`next/hashes/kinds/sourcePaths/names/details/valueIndexes/fingerprints`）；
   树 52 行 vs HEAD 63 行，差额来自 `Clone…Seq + add + 回写` 三行塌缩为一行 `add`。
   新写法 `:35699 add(…Next, bucketHead)` … `:35706 add(…Fingerprints, ownedFingerprint)`
   后 `:35707 index.visibilityBucketHeads[bucket] = nextIndex`，`nextIndex` 取自
   `:35686 let nextIndex = index.visibilityKinds.len`（追加前的行号，与 entry 路径同一正确惯例），
   `:35679 if existing >= 0:` 早返回。**逐行闭合，无缺语句。**
3. **entry 链全部函数与 HEAD 逐字节相同**（`fn_level_diff.py`）：

   | 函数 | HEAD | TREE | 判定 |
   |---|---|---|---|
   | `TypedExprBuildIndexClone` | 33073–33358 | 33413–33698 | IDENTICAL |
   | `TypedExprBuildIndexRegister` | 35645–35714 | 35974–36043 | IDENTICAL |
   | `typedExprBuildIndexAppendPlainEntry` | 43767–43813 | 44160–44206 | IDENTICAL |
   | `TypedExprBuildIndexFindEntry` | 35071–35101 | 35411–35441 | IDENTICAL |
   | `typedExprBuildIndexEntryCount` | 30271–30276 | 30586–30591 | IDENTICAL |
   | `TypedExprBuildIndexRehashEntries` | 35043–35057 | 35383–35397 | IDENTICAL |
   | `TypedExprBuildIndexEnsureEntryCapacity` | 35058–35070 | 35398–35410 | IDENTICAL |
   | `TypedExprBuildIndexEmptyBuckets` | 30517–30523 | 30832–30838 | IDENTICAL |

   且 `RehashEntries` / `RehashVisibility` 在 HEAD 与树中亦逐字相同——
   重哈希子系统**根本没被那条 lane 动过**。

⇒ **归因 = (a)，单一成因，非叠加。**

---

## 5. 交付前状态与全量函数级比对

`whole_file_fn_compare.py`（只读，按顶层声明切块比对 HEAD ↔ 工作树）：

```
declarations: HEAD=1745 TREE=1752
SAME=1719  DIFF=26  NEW=7  GONE=0
```

- `GONE=0`：没有任何函数被整段删除。
- 26 个 DIFF / 7 个 NEW 属其他 lane 的在建 WIP（call-declaration 手工权威路径、
  compact canonical、const block、SFR 相关等），其中 11 个 DIFF 存在"HEAD 语句行不再逐字出现"，
  已逐条核对**均不在 E1f 新增行集合内**，与本次误删无关。
- 摘除脚本的全部 7 处连带误删已闭合：5 处语义行已补回，2 处空行仍缺（`HEAD:16`、`HEAD:27`，纯排版）。

---

## 6. 未测项表

| # | 未测项 | 为什么没测 | 影响 / 风险 |
|---|---|---|---|
| 1 | 补回后 r42/r43 是否不再复现 | 本轮禁跑编译/烤机 | 静态证据已闭合；需下一轮烤机确认 |
| 2 | 08:46:46 补回动作的施动者 | 非本席所为，无写入日志 | 本席只写 `.rebuild/s1b_step3/r9/`；需父级确认是否为自己/另一 lane |
| 3 | `TypedExprBuildIndexClone` 的入口审计 `:33470 let entryCount = index.entryKinds.len` 在 compactCanonical 索引上是否会误报 | 未跑编译；`compactCanonical==true` 时 `entryKinds` 为空（`:43613`–`:43648` 只追加 `entryKindIds`），该审计会打 `corrupt build index entry columns rows=0` | **与 (b) lane 的 compact canonical 设计存在潜在冲突**；`TypedExprBuildIndexClone` 调用点 `:8603`、`:33988` 是否可能见到 compactCanonical 索引未验证。判词不同，非本 panic |
| 4 | `TypedExprBuildIndexRehashEntries:35386` / `EnsureEntryCapacity:35402` 仍以 `entryKinds.len` 计量，而 `entryCount` 已改成 `compactCanonical ? entryKindIds.len : entryKinds.len` | 同上 | 两者在 compact 索引上不可达（`EnsureEntryCapacity` 只在 `Register` 内、需 mutable），但属同一族不一致，建议 (b) lane 一并核对 |
| 5 | `HEAD:16`、`HEAD:27` 两处空行未补回 | 纯排版，无语义 | 无 |
| 6 | 其他 lane 的 26 个 DIFF 函数是否各自引入新缺陷 | 超出本轮归因范围 | 未评估 |

---

## 7. 下一步最小动作（不在本轮执行）

1. **不需要再加读数就能判定 (a)** —— 归因已由"写点全量枚举 + 判据函数 HEAD 比对 + 行号 35426 钉死二进制来源"闭合。
2. 下次烤机时用**同一命令**复烤，读两个指纹即可确认：
   - 若 `corrupt structured entry chain` **消失** ⇒ 归因确认，回到 r35 的进度前沿继续排墙；
   - 若**仍在**，判词行号应为 **`35427`**（补回后行号 +1）。若报 `35426`，说明烤的是**旧制品**，
     不是源码问题；若报 `35427`，才需要重新开案（届时优先查未测项 #3/#4 的 compact canonical 路径）。
3. 未测项 #3/#4 属 (b) lane 的 compact canonical 一致性，建议转给该 lane，不并入本次修复。

---

## 复现脚本（全部只读，落在 `.rebuild/s1b_step3/r9/`）

| 脚本 | 作用 |
|---|---|
| `reconstruct_e1f_deletions.py` | 解析补丁新增行多重集，解析重建摘除脚本的全部连带误删落点 |
| `verify_collateral_sites.py` | 逐站点打印 HEAD 原文与工作树镜像位置，判定是否已补回 |
| `fn_level_diff.py` | 8 个 entry 链函数 + 判据函数的 HEAD ↔ 树逐字节/逐行比对 |
| `whole_file_fn_compare.py` | 全文件 1745/1752 个顶层声明的结构比对，检出"语法合法但缺一行"签名 |
| `entry_chain_write_points.py` | `entryBucketHeads/entryNext/entryHashes/entryValueIndexes` 等列的全部写点普查 |
