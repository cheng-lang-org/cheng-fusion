# `compiler snapshot builder: object field TypeArena authority invalid` 定位报告

只读源码 + 定位；**全程未运行任何编译/烤制/lldb**（cd /Users/lbcheng/cheng-lang，2026-09-11 22:1x）。
锚定哈希（`git hash-object`，本席读文件时的工作树）：
`typed_expr_type_arena.cheng=5a340979b683f82473e8ed888a680604453f3f00`（10,438 行）/
`compiler_snapshot_builder.cheng=e6b3c7e57a0a9ef9c2c273e928c9ec0e2c0ee45b`（26,056 行）。
**注意**：本战役多手并发改这两个文件（本席会话期间 type_arena 从 10,199 行涨到 10,438 行）⇒ 下文行号仅对该哈希成立，复核请用 `grep -n` 点名符号。

---

## 0. 结论先行

1. **判词点**：`src/core/tooling/compiler_snapshot_builder.cheng:14130`（判据 `:14128-14129`），函数 `compilerSnapshotBuilderArenaTypeTextsInto`（`:14028-14214`）的 **object / ref object 分支**（`:14110-14142`）。
2. **判定：既有潜伏缺口首次可达，不是近期改动引入。** 守卫自 `a7ee2da19`（2026-07-26）起逐字未变，WIP 里也没动；让它成立的是**生产者侧的 arena 行序**（见 §2），该行序在 HEAD 与 WIP 完全一致（`git diff` 只改了调用参数，没改调用顺序）。
3. **机理一句话**：TypeArena 的**聚合行（object/ref object/enum）在预留阶段先占行号**（`ReserveAggregate`），**字段类型行在其后的 interning 阶段才追加**（`InternSyntaxRec`）；于是「对象的字段类型行号 ≥ 对象自己的行号」。而文本构造器 `ArenaTypeTextsInto` 是**单趟按行号递增**填 `out[typeId]`，要求子类型文本"先算好"，把 `childTypeId >= typeId` 当非法 ⇒ 凡是**带非标量字段**（定长数组/序列/借用/可选/元组/泛型应用/前向声明的聚合）的对象都必炸。
   **本判词与"模块级 const 定长数组"移植无关**：算术证据见 §3（`types=17` = 15 seed + 1 object + 1 fixedarray，一个字节都不给 const 留位置）。
4. **回退任何一件近期补丁都不会"修好"它**，只会把更早的墙（更早的判词）重新盖回来（§5 表）。**唯一一次已实测的例外**：`disc_literal_r9g`（下标换成字面量、常量只留在类型位置、驱动 kd_r9g **不含** step3o/w40）在 21:33 就已经撞到本判词 ⇒ 本墙**不是** step3o/w40 引入的。
5. **修法方向**（本报告不落补丁，理由见 §7）：把文本构造器从"单趟行序"改成**依赖定点迭代**（同文件既有先例 `typedExprTypeArenaComputeTraitFlags` 就是定点），保留 `childTypeId<0 / >=typeCount / childNameId<0` 全部硬判，把"子文本未就绪"从**硬错**变成**本轮跳过**，并新增"整轮零进展 ⇒ 硬失败（真环）"的**更强**守卫。

---

## 1. 判词点与完整判据链

### 1.1 落点原文（`compiler_snapshot_builder.cheng:14117-14142`）

```
            for offset in 0..<childCount:
                if offset > 0:
                    add(parts, ",")
                let childTypeId = arenamod.ArenaArrayInt32Get(
                    csg.typeArena.arena,
                    csg.typeArena.childTypeIds,
                    childStart + offset)
                let childNameId = arenamod.ArenaArrayInt32Get(
                    csg.typeArena.arena,
                    csg.typeArena.childNameIds,
                    childStart + offset)
                if childTypeId < 0 || childTypeId >= typeId ||
                   childNameId < 0:
                    err = " compiler snapshot builder: object field TypeArena authority invalid"
                    return false
```

**参与判定的坐标**（逐项）：

| 坐标 | 出处 | 语义 |
|---|---|---|
| `typeId` | 外层 `for typeId in 0..<csg.typeArena.typeCount`（`:14033`） | 当前正在算文本的 TypeArena 行号 |
| `kind` | `typeKinds[typeId]`（`:14034-14035`），分支条件 `Object` / `RefObject`（`:14110-14111`） | 只对聚合行生效 |
| `childStart` | `childStarts[typeId]`（`:14036-14037`） | 该聚合行的字段 CSR 起点 |
| `childCount` | `childCounts[typeId]`（`:14038-14039`） | 字段数 |
| `childTypeId` | `childTypeIds[childStart+offset]` | 字段类型行号：要求 `0 <= childTypeId < typeId`（**必须严格在对象行之前**） |
| `childNameId` | `childNameIds[childStart+offset]` | 字段名 intern id：要求 `>= 0` |
| 后继判据 | `:14132-14137` `LookupIntern` 非空 | 名字必须在 intern pool 里（**不是**本句，是下一句 `object field name authority missing`） |
| 文本消费 | `:14140` `strings.CloneStr(out[childTypeId])` | **这就是"prior"要求存在的唯一理由**：单趟填 `out`，子行文本必须已算好 |

⇒ 本判词由**两个**子条件之一触发：`childTypeId < 0` / `childTypeId >= typeId` / `childNameId < 0`。**下节的算术把落点钉到 `childTypeId >= typeId` 上。**

### 1.2 调用链（谁是第一个可达站点）

`ArenaTypeTextsInto` 全仓 3 个调用点：`:6545`、`:23554`、`:25014`。生产入口 `CompilerSnapshotProductionCandidateBuildUnsealedInto`（`:11161`）在 `:11334` 调 `compilerSnapshotBuilderTypeFunctionProjectValidatedInto`（`:23460`），后者在 `:23554` 调本函数，**先于** `:11341`（→ `:6522` → `:6545`）与 `:25014`（`...StrictReplayInto`，`:24999`）。
⇒ 按源码顺序，**第一处可达站点是 `:23554`**（三处判词文本逐字相同，未做动态区分——见 §6 未测项）。

### 1.3 触发点不是"整个对象非法"，而是"第 2 个字段"

四件夹具的对象是 `Slots = used: int32; values: int32[N]`（`docs/campaigns/2026-08-31-kernel-userpath/fixtures/r8_*`）。
- `used` → `int32` = **seed 行**（id 7，见 §3），`7 < 15` ✓ 过；
- `values` → `int32[N]` = **定长数组行**（id 16），`16 >= 15` ✗ **在此 offset 触发**。
（该 offset 结论是**推理**，判词本身不带坐标；但见 §3 的行数算术。）

---

## 2. 生产者侧：为什么子行号必然 ≥ 父行号

`typedExprTypeArena.cheng`：

| 步骤 | 位置 | 行为 |
|---|---|---|
| ① 标量 seed | `:1458`（调用点 `:7936`），`Void..CString` 去掉 `Int`/`UInt` = **15 行**（id 0..14） | 固定语义前缀 |
| ② 聚合预留 | `ReserveAggregatesRec :6956` → `ReserveAggregate :1283`；`let typeId = localOut.typeCount :1300`、`typeCount+1 :1381`；子列占位 `childTypeIds/childNameIds = -1`（`:1346-1347`） | object/ref object/enum 行**先占号**，字段类型**还是 -1** |
| ③ 字段类型行 | `InternSyntaxRec :7005`（`:7028-7032` 跳过聚合自身，`:7141` 起 `FixedArray` 等分支才 `Intern`；`Intern` 在 `:1202` 取 `typeId = out.typeCount`、`:1278` 自增） | 非聚合行**在其后**追加 ⇒ **行号更大** |
| ④ 回填字段 | `BuildObjectDeclaration :1972`：字段类型 id 取自 `typeSyntaxTypeIds[fieldTypeSyntaxNode]`（`:2039-2040`），写进 `childTypeIds :2098` / `childNameIds :2101` | 回填的值就是 ③ 的行号 |

调用顺序在 `TypedExprTypeArenaAppendSourceFromTreeInto :7949` 内写死：`FillDeclarationSymbols :8012` → **`ReserveAggregatesRec :8019`** → `MaterializeBracketConstLengths :8022` → `PreflightBracketAuthority :8025` → **`InternSyntaxRec :8028`**。HEAD↔WIP 该顺序**未变**（`git diff -U12 -- src/core/lang/typed_expr_type_arena.cheng` 显示这几行只有实参变化）。

**交叉验证（这是"前行号不是 arena 的不变量"的独立证据）**：同文件 `typedExprTypeArenaComputeTraitFlags :1505` 对**同一张 child 图**用**定点迭代**（`:1548-1551` `while changed` + `iterationLimit = typeCount*3+1`，注释明说 "Recursive managed is the least fixed point; Send/Sync are the greatest fixed point. These polarities make cycles unique."），且读子行只用 `child < 0 || child >= value.typeCount`（`:1580-1582`、`:1614-1616`）——**没有任何 "prior" 要求**。若 arena 的子行恒小于父行，这个定点循环与极性论证全是多余的 ⇒ **"子行可大于父行"是这张 arena 的既有事实**，`ArenaTypeTextsInto` 的 prior 前提才是异类。

---

## 3. 行数算术：把落点钉死在 `childTypeId >= typeId`

上游实测 stderr（`.rebuild/s1b_step3/r9/fx_r8_fixed_len_named_const_main.stderr.txt`，同目录另三件同值）：

```
csg_mem tag=ta_limits tokens=77 type_syntax=7 type_syntax_children=1 enum_variants=0 declaration_symbols=1 functions=1 bracket_args=1 generic_symbols=0 generic_symbol_children=0 column_rows=465 column_bytes=1860 ...
csg_mem tag=type_arena cap=1048576 used=6756 types=17 tokens=77 ...
```

推演（每步可复算）：
- seed = `Void..CString` 17 个枚举值去掉 `Int`/`UInt` = **15 行**（枚举定义 `typed_expr_type_arena.cheng:29-47`）；
- `declaration_symbols=1` ⇒ 只有 `Slots` 一个声明符号 ⇒ 聚合预留 **1 行**；
- 字段 `values: int32[N]` 需要一个 **FixedArray 行**；
- `15 + 1 + 1 = 17` = 实测 `types=17` ✓（四件**全部** 17，含 inline-arith / forward / untyped 三种常量形态 ⇒ 常量形态**不改变行数**）。
- 于是 `Slots=15`、`int32[N]=16`，字段 `used` 落在 seed 行 7 ⇒ **`16 >= 15` 命中 `:14128` 的第三个析取项**。
- **同一算术反证"const 生成额外类型行"**：若常量在类型位置产过任何 TypeArena 行，`types` 必 ≥18；实测 17 ⇒ 该假设被排除（候选 C3 见 §4）。

`childNameId < 0` 分支同样被排除：`BuildObjectDeclaration` 已成功执行（否则会先报它自己的 `object field authority invalid :2050` / `object reservation drift :2077`），它把 `children.len == fieldCount` 个名字全部 intern 并写入 `:2101`；且 `RealizeDeclarationsRec :7410` 对 `0..<symbolCount` 全体符号执行，`Slots` 不会被跳过（childTypeId 也就不是 -1）。

---

## 4. 前三名候选与判别预测

### C1（主判，置信度高）：消费者侧"单趟行序"前提对聚合行不可满足

- 机制：见 §2/§3。**凡是字段类型行在对象行之后的对象**都中招：定长数组、序列 `T[]`、借用、可选、元组、泛型应用、别名，以及**同源内符号序在后的聚合**（`type A = b: B` 且 `B` 在后）。只吃 seed（`int32`/`str`/…）或吃**更早**聚合/更早源已 intern 过的行的对象才安全。
- **最小判别夹具 M1（决定性：整个文件不含任何 `const`、不含任何 const 读）**：
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
  **预测**：与四件正例**逐字同判词**、`compile_rc=2`；开 `csg_mem` 时 `declaration_symbols=1`、`types=17`。
  **若判错**：M1 变 `rc=0`、或改报别的墙（尤其若它不再出现本判词）⇒ C1 被推翻，转 C2/C3。
- **M3（前向聚合，用来区分"行号前向"与"名字为负"）**：
  ```
  type
      Outer =
          inner: Inner
      Inner =
          x: int32
  ```
  **预测**：同判词（`Inner` 符号序在后 ⇒ 行号在后）；把两块声明**对调**（`Inner` 在前）后**不再出现本判词**。若对调后**仍**报同一句 ⇒ 触发源不是行号前向，转 C2。

### C2（次判，置信度中低）：对象行"预留了但没回填"（`childTypeId = -1`）

- 机制：`ReserveAggregate` 占位 -1（`:1346-1347`），若 `RealizeDeclarationsRec`/`BuildObjectDeclaration` 因符号/kind 视图错位没跑到该行，则 `childTypeId = -1 < 0` 同样命中原句。
- **判别夹具（标量对象控制组）**：`type P = x: int32; y: int32` + `var p: P` + 两次赋值。
  **预测**：若 C2 成立，该控制组**也**报同一句（标量字段必是 seed 行、不可能前向）；若 C1 成立，控制组**不报**本句（可能死在下一条更晚的墙）。
- 该候选与 C1 的分辨**只需一个 run**，是本报告最省钱的判别。

### C3（弱判，基本已被排除）：移植/const 面引入的畸形行

- 机制：常量在类型位置产出畸形 TypeArena 行（负名或前向 id）。
- **已被 §3 的 `types=17` 算术排除**（无多余行）；另：四件在三种常量形态下 `types` 恒为 17，且 `disc_literal_r9g` 表明常量只留在类型位置时本判词照样出现。
- 保留为候选只因"未直接读到 const 端口是否触碰 `childNameIds`"——静态上未发现任何 `bracket const` 代码路径写这两个列。

---

## 5. 回退实验的静态判定

| 回退哪一件 | 本判词会消失吗 | 会被换成什么（上游实测判词） | 依据 |
|---|---|---|---|
| `s1b_step3l_global_const_block_bindings.patch`（⓪） | 会（被更早的墙盖回） | `compiler csg: parser-owned global coverage mismatch … parser=1 metadata=0` | 战役文档 + `deterministic_model_derivation.md` 侦察段 |
| `closure8_symbolid_from_index.patch` | 会（同上） | `declaration SymbolId is not materialized` | `closure8_pair2_r9d.txt` 记录 |
| `pair2_typearena_symbol_ownership.patch` | **不会** | 该补丁只在 portable symbol join（`:24841` 一带）产判词，文本构造器不依赖它；四件在 r9d 上从未报 `portable TypeArena Symbol join duplicate` | 判词文本不同 + `closure8_pair2_r9d.txt` |
| `aggregate_zero_declaration_local_definition_group.patch`(±v2) | 会（同上） | `typed expr value definition: producer lacks exact type or ownership proof`（v1）/`typed expr binding: exact local value-definition group unavailable`（未打） | `fixtures_r9f.txt` / r9b 记录 |
| `s1b_step3o_module_const_expr_read.patch` / `w40_textpath_module_const_fold.patch` | 会（同上） | `compiler csg: typed-node exact producer TypeId missing node=8 op=38 o0=-1 o1=-1` | `fixtures_r9h.txt` vs `fixtures_r9j.txt` |

**判定的要害**：上表全部是**"重新掩盖"**，没有一条是修复；而且 **21:33 的 `disc_literal_r9g`（kd_r9g，无 step3o/w40；`SlotCount` 只出现在类型位置）已经撞到本判词**（`.rebuild/s1b_step3/r9/disc_literal_r9g.stderr.txt` 全文一行 = 本判词）⇒ 本墙**不依赖** step3o/w40 的"表达式位置常量折叠"面。
**逆向确认（未做、需一次对照）**：把 M1 放到**未打任何本战役补丁**的基线上跑（例如 `kd_fixed`/`kd_pre8` 一类）——若基线也报本判词，则"新可达"升级为"早就在、只是此前从未有夹具走到这里"；若基线死在更早的墙，结论仍是"既有守卫首次可达"。

---

## 6. 未测项（诚实清单）

1. **未运行任何编译**（硬纪律）：上述全部为 `read`/`grep` + 上游遗留 stderr 的复核，**没有**本席自己的动态证据。
2. **触发 offset 是推理**：判词不带坐标，"第 2 个字段 `values` 命中"由 §3 行数算术得出，未逐字段验证。
3. **三处调用站点未区分**：`:23554` / `:6545` / `:25014` 判词逐字相同；"第一处是 `:23554`"只是源码顺序推断。
4. **`disc_literal_r9g` 的夹具源已删**：只有 stderr 一行，本席**未见**其源文本；"常量只改了下标、类型位置仍留 `int32[SlotCount]`"来自 `s1b_step3_progress.md:1820` 的措辞，未亲眼核对。
5. **字面量长度（`int32[8]`，无 const）是否同样中招**：**未测**。机制上长度来源不参与行序（`MaterializeBracketConstLengths` 在预留之后跑），故预测"中招"；这是 C1 的决定性判别（M1）。
6. **标量对象控制组**（C1/C2 分辨）未测。
7. **修复后下一道墙是什么**未测：预期落在 portable Type 面（pair2 的 owner 断言或 portable replay CID），无证据。
8. `types=17` 的解读基于"seed=15、无其它行"；若 seed 集合近期被改（本席未见改动）该算术需重算——已给 `grep -n "for scalarValue in"` 复现路径。

---

## 7. 修法（**补丁已落**：`patches/object_field_typearena_text_fixpoint.patch`）

**补丁基**：工作树 `src/core/tooling/compiler_snapshot_builder.cheng`，`git hash-object` = `e6b3c7e57a0a9ef9c2c273e928c9ec0e2c0ee45b`，`sha256=6522951b82432cd85f56b48640871340480db14f5e775753088df0188d1bb117`（26,056 行）。包内 `*.patch` 被 `.gitignore:229` 忽略（本战役既有惯例），**未 commit**。
**改动量**：6 hunk，`+73 / −6`（**不是纯插入**：6 条 `−` 里 4 条是行序前提 `>= typeId`、1 条是 `var text: str`、1 条是 `add(out, text)`；其余 67 行全是插入），全部落在 `14040..14212`（函数区间 `14028..14217`）。

**结构**（把原单趟函数拆成"驱动 + 单趟"，**保留原函数名与全部调用点**）：
- `compilerSnapshotBuilderArenaTypeTextsInto`（同名，签名不变，3 个调用点零改动）= 驱动：`textReady: bool[typeCount]` 全 false、`out` 逐行 `add(out, "")` 预置（**不用 `setLen` 增长 `str[]`**——本仓 `str[]` 的 `setLen` 只出现过缩减用法，增长初始化未被证实）、`remaining`/`sweeps` 计数、`while remaining > 0:` 反复调单趟；整趟零进展 ⇒ 新判词并硬失败。
- `compilerSnapshotBuilderArenaTypeTextsSweepInto`（新增，`@borrows`）= 原 `for typeId in 0..<csg.typeArena.typeCount:` 循环，**body 逐字保留**（含原缩进），只在头部加 `if textReady[typeId]: continue` 与 `var deferred = false`，在 4 处子行读取点加就绪判定，尾部改为按行号写入。

1. 预置 `textReady: bool[typeCount]`，`out` 按 `typeId` 直接写入（不再靠 `add` 顺序隐含行号）；
2. 每趟只处理"子文本已就绪"的行；子文本未就绪 ⇒ **本轮跳过**（不是错）；
3. 保留**全部**硬判据：`childTypeId < 0`、`childTypeId >= typeCount`、`childNameId < 0`、`LookupIntern` 非空 —— 一个都不放宽；
4. **新增**更强守卫：整趟零进展且仍有未算行 ⇒ 硬失败（真环：值语义自包含），判词带 `typeId` 与未算行数。
   `childTypeId >= typeId` 这条**不是合法性判据**（§2 已证它是单趟实现的产物），删它**不是放宽**：等价性逐条核过——`childTypeId < 0`、`childTypeId >= typeCount`、`childNameId < 0` 三条硬判**原样保留**；自环/互环（旧判据靠 `childTypeId >= typeId` 拦下的那部分）改由"整趟零进展"拦下，仍然硬失败（只是判词换成带坐标的环判词）；唯一改变行为的是"前向但无环"——从**误拒**改为**正确计算文本**。
5. **文本字节必须逐字不变**：这段文本进 portable type 表（`:6545` 处 `canonicalTextId = TextFind(portable.texts, arenaTypeTexts[arenaTypeId])`）⇒ 改的只能是**计算顺序**，不是内容；验收必须是"四件 rc=0 或推进"＋"既有 rc=0 夹具（`ordinary_zero_exit_fixture`/`call_fixture`/`cold_nested_fmt_interpolation_smoke`）产物逐字节不变"。

**落补丁的方法（可复现，未碰仓库源文件本体）**：生成器 `.rebuild/s1b_step3/r9/patchgen/object_field_fixpoint_gen.py` 读真实源文件、做 **7 处精确字符串替换**（每处断言 `occurrences == 1`，否则 exit 2），把结果写到 `/tmp/cheng_objfield_fixpoint/target.cheng`；补丁由 `/usr/bin/diff -u --label a/… --label b/…` 重新生成。两个自检脚本：`object_field_fixpoint_verify.py`（解析 hunk **独立重放**到 `orig.cheng`，与 `target.cheng` 逐字节比对 + 改动普查）、`object_field_fixpoint_idcheck.py`（逐标识符绑定核对）。运行结果见 §10。仓库源文件 `git hash-object` 前后均为 `e6b3c7e57…`（**未被写入**）。

**反向纪律提醒**：任何"直接把 `childTypeId >= typeId` 从判据里删掉"的改法都是**放宽守卫**，且后果不是干净的下一道判词，而是**静默错文本**（子行文本尚未写入 ⇒ `out[childTypeId]` 为空串或上一轮残留），下游应表现为 `canonical graph CID mismatch` / portable replay 不一致一类**身份漂移**，而不是一条清晰的墙。这正是"若我判错/若有人放宽"时最先暴露的位置。

---

## 8. 判据等价性：定点化没有放宽任何守卫

| 旧判据 | 新判据 | 结论 |
|---|---|---|
| `childTypeId < 0` | 原样（3 处：unary/tuple/object） | 未动 |
| `childNameId < 0` | 原样（object；tuple 的 `childNameId >= 0` 可选名语义未动） | 未动 |
| `memberNameId < 0`、`payloadTypeId < -1` | 原样 | 未动 |
| `LookupIntern` 非空、`TextRepresentable`、各 kind 形态断言 | 原样 | 未动 |
| `childTypeId >= typeId`（行序前提） | 删除，换成 `childTypeId >= csg.typeArena.typeCount`（越界）+ `!textReady[childTypeId]`（就绪）+ 新增"整趟零进展"环判词 | **不是放宽** |
| — | 新增：`while remaining > 0` 的零进展 ⇒ `TypeArena structural dependency cycle unresolved={remaining} typeCount={…} sweeps={…}` | 新增守卫 |

**逐类论证**（旧 `>= typeId` 实际拦下三类输入）：
1. **越界**（`childTypeId >= typeCount`）：因 `typeId < typeCount` 恒成立，旧式一并拦下；新式用 `typeCount` 拦，**覆盖同一集合** ✓。
2. **自环/互环**（行号前向且首尾相接）：旧式靠"任何前向边即拒"顺带拦下；新式由"整趟零进展"拦下，**仍然硬失败**（判词更具体：带剩余行数/总行数/趟数）✓。
3. **前向但无环**（对象行先占号、字段行后 intern；或字段指向同源内符号序在后的聚合）：旧式**误拒**，新式正确计算文本。这类输入被 §2/§3 证明是**合法 arena**（`ComputeTraitFlags` 的定点求解正是为它准备），因此唯一的行为变化就是修掉这个误拒 ✓。

⇒ 新判据集合 ⊇ 旧判据集合（对畸形输入），且判词文本对"越界"类**逐字未变**（历史证据链不失效）。

## 9. 文本字节不变：论证

1. **表达式未动**：每个 kind 分支里生成 `text` 的语句逐字保留（补丁的 6 条 `−` 行里没有一条是文本构造语句；`+73` 行中 67 行是新增/换行的骨架）。
2. **归纳**：行 `r` 被写入时，其每个子行 `c` 都已 `textReady` ⇒ `out[c]` 是"单趟版本中该行被算出时的同一字符串"；行的文本是子文本的纯函数 ⇒ 逐行相同。
3. **写入恰一次、不再改写**：`textReady[r]` 置位后该行被 `continue` 跳过；`out[r]` 无第二写点。
4. **顺序/长度不变**：`out = []` 后按 `0..<typeCount` 逐个 `add(out, "")` 预置 ⇒ `len == typeCount`，元素顺序 = 行号顺序（旧版 `add(out, text)` 的顺序也是行号顺序）✓。
5. **差异只在旧版会 `return false` 的行上**（以及环 ⇒ 新版硬失败，同样不产出文本）。

## 10. 编译级自检结果

- **生成**：7 处锚点各 `occurrences == 1`；改动落在 `14040..14212`（函数区间 `14028..14217`），**不越界**。
- **重放对拍**（`object_field_fixpoint_verify.py`）：解析 hunk 独立重放到 `orig.cheng`，与 `target.cheng` **逐字节相同**（`c4b09f68825bdff7b51fea7287902d18c78b5bcef2149a41612f38533c3a2ae0`）；`hunks=6 added=73 removed=6`；6 条 `−` 行 = 4 条行序前提 + `var text: str` + `add(out, text)`，**无其它删除**。
- **标识符绑定点**（`object_field_fixpoint_idcheck.py`）：73 条新增行（17 条注释）中 56 条代码行，**每个标识符在使用点已绑定**（参数/更早的 `let|var`/`for` 绑定/模块级名字）；**无引用后面才声明的 `let`**。
- **语法构造的仓内实证**：`continue` 在 `for` 体内 2,337 处；`var bool` 形参（同文件 `:5244`）、`var bool[]` 形参（`compiler_parser_receipt.cheng:4469`）；`str[]` 下标写 445 处；`setLen` 用于 `str[]`（`typed_expr.cheng:49596`）/`bool[]`（`specializationVisiting`）；`&&` 短路带下标守卫（`lsp_server.cheng:962`）；`!arr[i]`；`add(arr, "字面量")`。
- **Cheng 陷阱**：说明注释放在 `@borrows` **之前**（不夹在 `@borrows` 与 `fn` 之间）；多行 `||` 续行后无注释；`out` 用 `add(out, "")` 逐行初始化（**不用**未被实证的 `setLen` 增长 `str[]`）；`var text: str = ""` 显式初始化（规避"延迟路径未赋值"的可编译性风险）。

## 11. 收敛上界与震荡（设计问题答复）

- **无震荡**：`textReady` 单调（false→true），行文本写一次不再改写，文本是子文本的纯函数 ⇒ 有限格上的最小不动点迭代，不会来回摆。
- **上界（普适，与图形态无关）**：每趟要么写入 ≥1 行（`remaining` 至少 −1），要么整趟零写入 ⇒ 立即判环失败。故 **`sweeps ≤ typeCount`**，最坏工作量 `O(typeCount²)` 次行检查。
- **上界（更紧，实际值）**：令 `d(row)` = 该行依赖链最大边数，归纳可证"第 k 趟结束时所有 `d < k` 的行均已写入" ⇒ **趟数 = 依赖深度 + 1**；本墙形态的深度 = 聚合嵌套层数 + 1。
- **四件夹具的具体预测**：`typeCount=17` ⇒ **2 趟**（第 1 趟写 15 个 seed + 定长数组行，第 2 趟写 `Slots` 行）；`typeCount=0` 直接跳过。
- **无法给上界的情形 = 真环**：不设硬编码趟上限，兜底判词即新增的 `... structural dependency cycle unresolved=… sweeps=…`（自环与互环同判）。

## 12. 验证计划（烤炉）

1. `git apply --check` = 0（**已验**）；烤驱动后四件正例**末行不得再是本判词**（rc=0 或推进），负例 `must be int32 name=SlotName statement_offset=752` 逐字不变。
2. **字节中性回归**（同 `--out` 串行两跑）：`ordinary_zero_exit_fixture`/`call_fixture`/`cold_nested_fmt_interpolation_smoke` 与 `kd_r9j` 侧 sha 逐字相同（`10bdeb14…`/`1b51b87c0e…`/`fa69623c93…`）。
3. §4 的 M1（零 const、`int32[8]`）与纯标量对象控制组用于复核 C1。
4. **判错信号**：若四件仍报**同一句** ⇒ C1 被推翻（行序前提不是触发点）；若出现 `canonical graph CID mismatch`/`exact Type … remap mismatch`/portable 文本漂移 ⇒ §9 的字节不变论证被实践推翻，立即回退。

## 13. 未测项（补丁相关）

1. **未编译**：可编译性与 `var text: str = ""` 等写法由烤炉验证。
2. `add(out, "")`（空串字面量进 `add`）无逐字先例，语义上等价于插入空 str。
3. `setLen(bool[], n)` 的初始化语义未被依赖（逐元素显式写 false）。
4. TypeArena 里"真环"是否可达未验证；新判词可能永不触发（fail-closed 兜底）。
5. 234 源闭包上的实测趟数未测（预测 = 聚合嵌套深度 + 1）；`sweeps` 只在失败判词里出现。
6. 性能影响未测（正常形态 `O(趟数 × typeCount)`）。

---

**后续墙（已另案）**：本补丁生效后（`kd_r9m`）四件正例改报 `compiler snapshot builder: Local declaration lacks exact value definition`（`:18428`）——模块级 `const` 行不属于 Local 符号域，三处计数器需同步收窄；定位、补丁与"不放宽"论证见 `design/local_decl_value_definition_wall.md`（补丁 `patches/local_symbol_domain_function_scoped.patch`）。**M1 判别已由槽位持有者跑出**：`disc_m1_r9j.stderr.txt` = 本判词（零 const、字面量长度同样撞墙）⇒ C1 成立。

---
---

# §14 第二堵同族判词：`typed expr type arena: object field authority invalid`（`kd_r19`）

只读源码 + 定位 + 落补丁；**全程未运行任何编译/烤制/lldb**（2026-09-12 04:3x 起）。
取证：`.rebuild/s1b_step3/r9/repro_btypes_r9.stderr.txt`、`.rebuild/s1b_step3/r9/fixtures_r19.txt`（烤轮 `kd_r19`，夹具 `binary_types_via_import`，`rc=2`）。
锚定哈希（本席读文件时的工作树）：`src/core/lang/typed_expr_type_arena.cheng = c767c58ec119e9c7c13334028f2e5ea93eb10d3c`（11,134 行）/ `src/core/lang/parser.cheng`（41,312 行）/ `src/core/tooling/compiler_csg.cheng`（42,987 行）。

## 14.0 结论先行

1. **判词点**：`src/core/lang/typed_expr_type_arena.cheng:2304`（全仓唯一出现），函数 `typedExprTypeArenaBuildObjectDeclaration`（`:2221`），守卫 `:2293-2303`。
2. **判定的子条件**：**第 7 项**——field 名 token 的 kind 必须等于 `ParserValueTokenIdentifier`。
3. **失败形态**：`src/std/crypto/sha256.cheng:361` 的字段 `block: Bytes`（`type Sha256TwoPartState`，`:359-365`）。`block` 在词法器里是 `ParserValueTokenBlock`（`parser.cheng:14623-14624`），而 parser 自始至终把 `block` 当**合法字段名**（`ParserValueExprTokenCanName :14655-14658`；字段名准入 `parser.cheng:26044-26046` 与 `:25935-25937` 用的就是这个谓词）。
4. **判定：(b) 生产相自身的守卫过严**（局部关键字猜测 vs parser 的唯一名字域），**(c) 是它的触发时序**（既有潜伏，seal 相首次可达）。**不是** (a) 生产者真缺口。
5. **与前次的关系**：**同族判词、不同判据点、不同根因**。前次补丁（只改 `compiler_snapshot_builder.cheng`）**结构上不可能**覆盖本墙——本墙不在它改的文件里，且本墙判据里**没有**它删掉的行序项。详见 §14.2。
6. **修法已落**：`patches/object_field_authority_name_domain.patch`（1 文件 / 6 hunk / `+24 −11`），把该文件里**全部四处**名字域硬编码判据一次换成 parser 的唯一名字权威。冻结副本 `.rebuild/s1b_step3/r9/patchgen/object_field_authority_name_domain.frozen.patch`，二者 `cmp` 逐字节相同，`sha256=1c0f20da1690db6cb70da7bfa2d63cc5b6017ded6da19437b573bbfb20fab880`。`git apply --check` = 0（基线 = **当前工作树**）。**未 apply、未编译**。

## 14.1 判据点的完整判据链（逐项 + 依赖列/表）

判词经 `compiler_csg.cheng:36012`（`Fmt" compiler csg: TypeArena production failed: {buildErr}"`，**不带 `source_index=`**）加前缀输出；同文件 `:35867` 的另一个变体**带** `source_index={N}`——本墙是**前者**，这一条就把相定死了：

| 相 | 入口 | 判词前缀 |
|---|---|---|
| 逐源 append（`ta_stream`） | `compiler_csg.cheng:35850 TypedExprTypeArenaAppendSourceFromTreeInto` | `… production failed source_index={N}: …`（r17 的 `bracket apply authority incomplete` 走这条） |
| **全森林 seal** | `compiler_csg.cheng:36010 TypedExprTypeArenaSealInto` | `… production failed: …`（**本墙**） |

调用链：`compiler_csg.cheng:36010` → `typed_expr_type_arena.cheng:8691 TypedExprTypeArenaSealInto` → `:8715 typedExprTypeArenaRealizeDeclarationsRec` → **`:7996` `typedExprTypeArenaBuildObjectDeclaration`（全仓唯一调用点）** → `:2304`。

守卫 `:2293-2303` 的 **7 个析取项**（任一项为真即报本判词）：

| # | 子条件 | 读取的列 / 表 | 写入/填充点 |
|---|---|---|---|
| 1 | `fieldTypeId >= 0` | `typeSyntaxTypeIds[fieldTypeSyntaxNode]`（soa） | `ReserveAggregate:1505-1507`（聚合行）、`InternSyntaxRec:7851-7853`（非聚合行） |
| 2 | `fieldTypeId < localOut.typeCount` | `typeCount` | 同上 |
| 3 | `SyntaxDeclarationOwnerAt(fieldNode) == declarationRoot` | `typeSyntaxDeclarationOwnerNodeIndexes`（访问器 `:502`） | append 相 `:6815-6821`（`RebaseRow(viewTypeSyntaxBase, parser…DeclarationOwnerAt)`） |
| 4 | `ProducerSourceIndexAt(fieldNode) == ProducerSourceIndexAt(declarationRoot)` | `typeSyntaxProducerSourceIndexes`（访问器 `:476`） | append 相 `:6776-6779` |
| 5 | `fieldNameToken >= 0` | `typeSyntaxOwnerTokenIndexes[fieldNode]`（访问器 `:516`） | append 相 `:6794-6800` |
| 6 | `fieldNameToken < localOut.tokenCount` | `tokenCount` | — |
| 7 | **`TokenKindAt(fieldNameToken) == ParserValueTokenIdentifier`** | `tokenKinds`（访问器 `:690`） | append 相 token 表 |

上游夹持（先于本判词、任一不满足会先换判词）：`:2262-2270` field CSR 合法性（`state.fieldStartsByDeclarationRoot` / `fieldCountsByDeclarationRoot` / `state.fieldTypeSyntaxNodeIndexes`，填充点 `IndexFieldsSourceInto:5387-5439`）、`:2283-2286` field TypeSyntax 行号范围、`:2314-2316` 重名、`:2331` 预留漂移。
**与本墙的关键结构差异**：本判据里**没有任何行序项**（不存在 `childTypeId >= typeId` 之类）。前次那堵墙的全部机理（聚合行先占号、字段行后 intern）在本判词上**不适用**。

## 14.2 与前次记录的逐点对照

| 维度 | §1-13（前次） | §14（本次） |
|---|---|---|
| 判词原文 | `compiler snapshot builder: object field TypeArena authority invalid` | ` typed expr type arena: object field authority invalid` |
| 落点文件:行 | `compiler_snapshot_builder.cheng:14130` | `typed_expr_type_arena.cheng:2304` |
| 相 | 文本投影（`ArenaTypeTextsInto`，消费 arena 产文本） | **生产/seal**（`BuildObjectDeclaration` 往 arena 写 member 行） |
| 判据里的行序项 | **有**：`childTypeId < 0 \|\| childTypeId >= typeId \|\| childNameId < 0` | **无** |
| 根因 | 聚合行预留先于字段行 intern ⇒ 单趟文本器误拒合法 arena | **名字域**：把 field 名 token 硬编码成 `Identifier`，与 parser 的 `TokenCanName` 域（`Identifier\|Block\|Object`）冲突 |
| 前次补丁覆盖范围 | `compiler_snapshot_builder.cheng` 6 hunk（定点化 + 环判词） | 前次补丁**不碰** `typed_expr_type_arena.cheng` |
| 覆盖判定 | — | **不可能覆盖**：既不在同文件，也不含同一子条件；反过来本补丁也不碰 `compiler_snapshot_builder.cheng` ⇒ 两补丁**互不重叠、无先后依赖** |

⇒ **本墙既不是"前次修法没覆盖到的第二种形态"，也不是"同一形态在新输入上复现"**：它是同一个**判词族**（"object field authority"这个措辞被两处独立守卫共用）下的**第二个独立缺陷**。前次文档 §7/§9 的"文本字节不变"论证对本补丁无约束关系（不同文件、不同相）。

## 14.3 失败形态定位（钉到具体声明/字段）

### 14.3.1 先更正一条前提：`src=10` 不是失败点

`repro_btypes_r9.stderr.txt` 在 `csg_mem tag=forest src=10 bytes=103363` 之后**还有**：`forest_parse_end src=10` / `forest_parsed src=10 arena=5081696` / `forest_build_done` / `decl_index entries=50 sources=11` / `ta_limits`（两次）/ `p1_arena_reserved` / `p1_ctx_index_built`，随后 pass 1（`forest_parse_begin pass=1 src=0..10` + `forest_appended` + `ta_stream`）**全 11 源跑完**，再 `typed_context_lookup_built`，**然后**才失败。
⇒ 11 源 = `src` 0..10 **全部建完**，"`src=11` 未出现"是正常的（不存在第 12 个源）。失败发生在**其后的全森林 seal 相**，不是 `src/std/system.cheng` 一个源。判词不带坐标是全森林 11 源、50 个声明符号的**共同**结果。

### 14.3.2 11 源身份（按 `bytes=` 唯一钉死）

工作树里字节数唯一的对应关系（`os.path.getsize` 全 `src/` 扫描）：

| src | bytes | 文件 |
|---|---|---|
| 0 | 6917 | `src/chain/binary_types.cheng` |
| 1 | 65 | 夹具入口 `src/tests/r9_btypes_const_bracket_main.cheng`（内容 = `import cheng/chain/binary_types` + `fn main(): int32 = return 0`，见 `fixtures/r8_btypes_const_bracket_main.cheng`） |
| 2 | 14020 | `src/std/bytes_layout.cheng` |
| 3 | 33495 | **`src/std/crypto/sha256.cheng`** |
| 4 | 10874 | `src/std/rawbytes.cheng` |
| 5 | 2184 | `src/std/rawmem_support.cheng` |
| 6 | 2730 | `src/std/result.cheng` |
| 7 | 13214 | `src/std/seqs.cheng` |
| 8 | 13660 | `src/std/strings.cheng` |
| 9 | 13065 | `src/std/strutils.cheng` |
| 10 | 103363 | `src/std/system.cheng` |

`decl_index entries=50` 与这 11 源 `type` 块里的声明根总数（binary_types 10 + bytes_layout 5 + sha256 2 + rawbytes 3 + result 2 + seqs 2 + strutils 1 + system ~25）**正好 50** ⇒ `RealizeDeclarationsRec:7973-8043` 对**全部 50 个 symbol** 逐个跑，**包含无人引用的对象类型**（`Sha256TwoPartState` 即属此类）。

### 14.3.3 判词无坐标 ⇒ 用"结构性排除 + 全域枚举"钉死

**第一步：排除子条件 1–6。**

- **3 / 4 恒真（构造性）**：`state.fieldTypeSyntaxNodeIndexes` 由 `IndexFieldsSourceInto:5398-5437` **按 `ParserValueExprTypeSyntaxDeclarationOwnerAt(tree,row)` 分桶**；而 arena 列 `:6815-6821` 写的是**同一个 parser 表达式**经**同一个 `viewTypeSyntaxBase`** rebase（`:5407` 与 `:6819` 两处同源）。同一棵树、同一基址 ⇒ 两项逐行必然相等。子条件 4 同理（`:6776-6779` 与 `:5425-5437` 同期同 base）。
- **5 / 6 恒真**：field root 的 ownerToken 由 parser 在**通过 `TokenCanName` 准入之后**写入（`parser.cheng:26044-26047` / `:25935-25938` / `:26056-26066`），且 `AppendTypeSyntaxRootInto:19191-19194` 拒绝 `tokenStart >= tokenLimit` ⇒ 必是合法 token 行号。
- **1 / 2 恒真**：`InternSyntaxRec` 对每一行**只有三条出口**——`:7851-7853` 写 TypeId、`:7567-7571`（qualified 段）写 TypeId、`:7844-7850` 入 forward 队列（**不写** TypeId，留 -1）。聚合行（Object/RefObject/ImplicitObject/Enum）在 `:7458-7463` 被整行跳过，其 TypeId 由 `ReserveAggregate:1505-1507` 在 `ReserveAggregatesRec` 里写（顺序在 `InternSyntaxRec` 之前）。`compiler_csg.cheng:36005 TypedExprTypeArenaForwardNominalRequireDrainedInto` 已在 seal 前**通过** ⇒ 没有"留在 -1 且未入队"的非聚合行。

**第二步：唯一可失败项 = 子条件 7。全域枚举找形态。**

在 11 源里扫描"名字位置是 `block` 或 `object`（唯二 `TokenCanName` 但不 `Identifier` 的拼写）"的字段：

```
src/std/crypto/sha256.cheng:361        '        block: Bytes'          ← 唯一一处 object 字段
src/std/crypto/sha256.cheng:293/410    '… block: Bytes,'              ← 函数形参（RootFunctionParameter，不走本判据）
object 命名的字段：0 处
```

`parser.cheng` 自己的注释**逐字点名校验对象**（`:25123-25127`）：
> `# 类型体字段名可命中上下文关键字 `block`(如 sha256 `block: Bytes`):`

⇒ **触发点 = `type Sha256TwoPartState`（`src/std/crypto/sha256.cheng:359-365`）的字段 `block`（`:361`）**，其名字 token 的 kind 是 `ParserValueTokenBlock`。

## 14.4 判定：(b) 守卫过严（+ (c) 既有潜伏首次可达）

**为什么是 (b) 而不是 (a)：判据与"parser 的名字域"及"本文件自己的严格校验器"两处都不自洽。**

| 证据 | 位置 | 说了什么 |
|---|---|---|
| parser 的名字权威 | `parser.cheng:14649-14658` | `ParserValueExprTokenCanName(k) ≡ k∈{Identifier, Block, Object}`；注释明写 *"Keep these exceptions in the lexer authority so every declaration/expression consumer agrees on the same name domain instead of carrying local keyword guesses."* |
| 字段名准入 | `parser.cheng:26044-26046`、`:25935-25937` | 判据是 `!ParserValueExprTokenCanName(...)`（报错文本虽写 "field name must be an identifier"） |
| tuple 元素名准入 | `parser.cheng:23839-23849` | `ParserValueExprTokenCanName` |
| enum 变体名准入 | `parser.cheng:23709-23713` | `ParserValueExprTokenCanName` |
| parser 的变体严格校验 | `parser.cheng:16460-16462`、`:16619-16622` | `!ParserValueExprTokenCanName(...)` |
| **arena 的严格校验器** | `typed_expr_type_arena.cheng:10471-10472`（object member）、`:10521-10522`（enum member） | **只查 token 行号范围，不查 kind** ⇒ 冻结校验器**接受**生产相会拒绝的行 |
| 本守卫的年龄 | `git log -S "typed expr type arena: object field authority invalid"` | 自 `f681cad2b`（2026-07-24 初始提交）起逐字未变，**不是近期改动引入** |

**为什么"现在才出现"（(c) 的一面）**：这是**既有潜伏**，此前每一炉都死在更早的相，seal 从未跑到：
- `fixtures_r13.txt` / `r14`：`TypeArena resolution authority failed source_index=10: … name=typedesc`（append 相 authority）
- `fixtures_r17.txt`：`TypeArena production failed source_index=10: bracket apply authority incomplete`（append 相 preflight）
- 本轮 `typedesc`/`set` 两墙清掉（`patches/builtin_type_constructor_arity.patch` + `patches/builtin_type_constructor_bracket_preflight.patch`）后，11 源 append 全过、drain 检查过，seal 相**首次**对全森林执行 ⇒ 潜伏守卫首次可达。

**排除 (a) 的直接论据**：`block` 是 parser 明确承认的字段名（三条准入路径 + 一条点名注释），不是畸形输入；生产者侧对它无缺口——需要的信息（`block` 这个 token 的 kind）在 `tokenKinds` 列里**完整存在**，缺的只是判据的取值域。

## 14.5 修法（**补丁已落**：`patches/object_field_authority_name_domain.patch`）

**补丁基**：工作树 `src/core/lang/typed_expr_type_arena.cheng`，`sha256=2dbe40c17e05bc3b2fc9d0dc81020652b1335831ec4b188bcf1c3a41c2100e80`（11,134 行，`git hash-object = c767c58e…`）。包内 `*.patch` 被 `.gitignore:229` 忽略（本战役惯例），**未 commit**。
**改动量**：1 文件 / 6 hunk / `+24 −11`。**11 条 `−` 全部是四处名字域谓词行本身**（`grep '^-'` 逐条核对，无其它删除）；24 条 `+` = 4 处注释（11 行）+ 4 处替换式（13 行）。
**落点坐标**（左=当前工作树旧行，右=补丁后新行）：

| # | 函数 | 判词 / 语义 | 旧行 | 新行 |
|---|---|---|---|---|
| 1 | `typedExprTypeArenaBuildObjectDeclaration` | `object field authority invalid`（**本墙**） | 2300-2303 | 2306-2308 |
| 2 | `typedExprTypeArenaBuildTupleAliasMembers` | `tuple alias field authority invalid` | 2482-2485 | 2489-2491 |
| 3 | `typedExprTypeArenaBuildEnumDeclaration` | `enum variant authority invalid` | 2601-2603 | 2611-2613 |
| 4 | `typedExprTypeArenaTupleChildNameId` | **静默形态**：返回 -1 ⇒ tuple 元素丢名 | 2814-2816 | 2828-2829 |

**替换形态**（逐字）：

```
-           typedExprTypeArenaTokenKindAt(
-               localOut, fieldNameToken) !=
-               parser.ParserValueTokenIdentifier:
+           !parser.ParserValueExprTokenCanName(
+               typedExprTypeArenaTokenKindAt(
+                   localOut, fieldNameToken)):
```

第 3 处尾随 `||`（在 `if` 长析取链中间）与第 4 处（读 parser 树的 `ParserValueExprTokenKindAt(tree, ownerToken)`，非 arena 列）形态相应调整；语义同一。
**为什么一次改四处**：这四处是**同一个谓词**（"名字 token 的 kind 是不是 `Identifier`"）在同一个文件里的全部实例；本战役明令禁止逐个症状补，故一次收全。第 4 处是同一谓词的**静默形态**（不报判词、直接返回 -1），留着它会让 `tuple[block: T]` 出现"parser 建了具名 field root、arena 却说无名"的不一致。

**为什么不会让无关输入变化（byte-neutrality 论证）**
1. 新判据 `!TokenCanName(kind)` 与旧判据 `kind != Identifier` 都是**同一个已读 token kind 上的纯谓词**，`TokenCanName :14655-14658` 逐字给出 `k∈{Identifier, Block, Object}` ⇒ 两者**只可能在 `k∈{Block,Object}` 上取不同真值**。
2. 因此对任何"名字位置不含 `block`/`object` 拼写"的输入：四处谓词真值不变、`||` 短路顺序不变、被求值的读点集合不变、`intern` 调用次数与顺序不变、所有列写入顺序不变 ⇒ `typeArenaArtifactCid` 与由它派生的 CID **逐位不变**。
3. 对含该形态的输入：旧行为是前三处**硬失败**（无产物）、第四处**静默丢名**；新行为按 parser 已确认的名字域正常产出。**这不是放宽守卫**——判据集合从"局部关键字猜测"换成"parser 的唯一名字权威"，`TokenCanName` 之外的 token（保留字、字面量、运算符…）仍**逐字硬失败**。
4. 语法侧：不成对增删 `(`/`)`（`2639→2644`，开闭同增 5）、不增删 `[`/`]`（`1148→1152`）、`{`/`}` 不变（232）、`if|elif|else` 行数不变（963→963，**未切断任何 if/elif/else 链**）；新增代码只用已在同一表达式里出现过的标识符（`parser.ParserValueExprTokenCanName` 为 `@borrows` 且形参非 var，`typed_expr_type_arena.cheng:1-7` 已 `import cheng/core/lang/parser`），**不引入任何新 `let`/`var`** ⇒ 无"引用后面才声明的 let"风险。

**落补丁的方法（可复现，未碰仓库源文件本体）**：生成器 `.rebuild/s1b_step3/r9/patchgen/object_field_name_domain_gen.py` 读真实源文件、做 4 处精确字符串替换（每处断言 `occurrences == 1`，否则 exit 2），`difflib.unified_diff` 生成补丁，并**独立重放** hunk 到原文与内存目标逐字节比对（`orig=2dbe40c1… → target=302b87a8…`，`hunks=6 added=24 removed=11`）。仓库源文件前后 `git hash-object` 均为 `c767c58e…`（**未被写入**）。
**冻结**：`.rebuild/s1b_step3/r9/patchgen/object_field_authority_name_domain.frozen.patch`，与 `patches/object_field_authority_name_domain.patch` `cmp` 逐字节相同，`sha256=1c0f20da1690db6cb70da7bfa2d63cc5b6017ded6da19437b573bbfb20fab880`（4,563 B）。
**`git apply --check` = 0**（基线 = 当前工作树）。**未 apply、未编译**（编译槽由槽位持有者统一调度）。

## 14.6 未测项（诚实清单）

| # | 未测项 | 判别方式 |
|---|---|---|
| 1 | **未运行任何编译**（硬纪律）；全部为 `read`/`grep`/`python3` 静态读数 | 烤炉 |
| 2 | **触发身份是静态排除法推出来的**，不是实测：判词不带坐标，无法从日志证明是 `Sha256TwoPartState.block` 而不是 50 个声明里的其它 | 最小夹具 `type T =` + `block: int32` 字段 ⇒ 预测 `rc` 从 2 变 0；**对照**：把该字段改名 `blk`，在**未打本补丁的 kd_r19** 上应**同样** `rc=2` 且判词不变（若改成 `blk` 就 rc=0，则本判定的触发点判断被推翻） |
| 3 | 子条件 1 的排除依赖"drain 检查通过 ⇒ 无留在 -1 的非聚合行"，未逐行核对 `typeSyntaxTypeIds` | 需要一次 `typeSyntaxTypeIds` 列的 dump 读数 |
| 4 | **同族但不同模块**的实例**未修**（见 §14.7），因而未测它们是否可达 | 见 §14.7 |
| 5 | byte-neutrality 是**静态论证**（谓词只在 `Block`/`Object` 上分叉），未用 `artifactRaw32` 字节对拍实测 | 三件 rc=0 夹具 + `kd_r19` 侧 sha 逐字相同 |
| 6 | 第 4 处（tuple 子名）的行为变化在本输入上**不可达**（`tuple[block: T]` 会先在第 2 处硬失败），故其"由 -1 改成具名"无实测 | `type P = tuple[block: int32]` 夹具 |
| 7 | 修复后下一道墙未测 | 预测见 §14.7 第 2 条 |

## 14.7 同族实例清单（本补丁**未**包含，需裁决）

同一个缺陷类（"消费方自带局部关键字猜测，不用 parser 的唯一名字域"）在本仓还有 **5 处**，逐字坐标：

| 文件:行 | 位置语义 | 现状 |
|---|---|---|
| `compiler_parser_receipt.cheng:5470` | enum variant 名 | `tokenKinds[...] != Int32(ParserValueTokenIdentifier)` |
| `compiler_parser_receipt.cheng:5520` | tuple/function/variant 具名子 owner | 同上 |
| `compiler_parser_receipt.cheng:5907` | import 别名 / 声明别名 token | 同上 |
| `compiler_parser_receipt.cheng:6822` | 泛型符号名 token | 同上 |
| `semantic_snapshot_declaration_identity.cheng:139-148` | `semanticSnapshotDeclarationIdentifierNameValid`：`ParserValueExprKeywordKind(...) == Identifier` | **下游风险最高**：`compiler_snapshot_builder.cheng:19515` 把**字段声明**登记为 `NameSurfaceIdentifier` ⇒ seal 通过后**可能**下一堵是 `semantic snapshot declaration: invalid kind or canonical name` |

同文件里另有 4 处**已经**用 `TokenCanName`（`compiler_parser_receipt.cheng:5901/:5929/:6502/:6726`）⇒ receipt 内部自相矛盾。
**未纳入本补丁的理由**（唯一一条）：`semantic_snapshot_declaration_identity.cheng` 吃的不是 token kind 而是名字**字符串**，替换式不是机械同行替换；且该层挂着 `parserValidatedNameProofCid` 的证明耦合（proof 由 parser receipt 产出），改判据而不改 proof 产出方需要单独的一致性证明。receipt 四处则**不在本墙的失败路径上**（本闭包里无 `block` 命名的 enum 变体/泛型符号，且 receipt 不校验 object 字段名）。**是否同炉带上，请槽位持有者裁决。**

---

# §15 receipt 侧同根 4 处一并收口（裁决执行）+ 名字域总表

裁决：`compiler_parser_receipt.cheng` 四处**同炉纳入**；`semantic_snapshot_declaration_identity.cheng:139-148` **不纳入**（单独一轮，见 §15.5）。
补丁：`patches/parser_receipt_name_domain.patch`（1 文件 / 4 hunk / `+28 −8`），基线 = **当前工作树**（§14 的 arena 补丁已 apply），`git apply --check = 0`。冻结副本 `.rebuild/s1b_step3/r9/patchgen/parser_receipt_name_domain.frozen.patch`，`cmp` 逐字节相同，`sha256=7e0e2af3b0ee715a637da8b7d5925576f63f380e81a5f3869661454db237a811`（5,017 B）。**未 apply、未编译。**
**命名**：§14 的 `patches/object_field_authority_name_domain.patch` **原样保留、未被覆盖**（`sha256` 仍 `1c0f20da…`）。两补丁文件不同、hunk 不重叠，依次 apply 即 r21 树态。

## 15.1 四处改前/改后判据逐条对照（含"点名 4 处"与实际 4 处的差异）

裁决点名的四处是 `:5470 / :5520 / :5907 / :6822`。逐条核对后，**实际面是同数量的另外一组**：`:5907` **不是**名字域判据，而点名的四处之外 **`:6886/:6892` 是**。净额仍为 4 处。

| # | 行（改前→改后） | 位置语义 | 改前判据 | 改后判据 |
|---|---|---|---|---|
| R1 | `:5469-5470 → :5473-5475` | enum 变体名 token | `sidecar.tokenKinds[variantNameToken] != Int32(ParserValueTokenIdentifier)` | `!parser.ParserValueExprTokenCanName(parser.ParserValueTokenKind(sidecar.tokenKinds[variantNameToken]))` |
| R2 | `:5519-5520 → :5527-5529` | tuple/function/variant 具名子 owner 名 | `sidecar.tokenKinds[childOwner] != Int32(ParserValueTokenIdentifier)` | `!parser.ParserValueExprTokenCanName(parser.ParserValueTokenKind(sidecar.tokenKinds[childOwner]))` |
| R3 | `:6821-6822 → :6833-6835` | 泛型符号（类型参数）名 token | `sidecar.tokenKinds[nameToken] != Int32(ParserValueTokenIdentifier)` | `!parser.ParserValueExprTokenCanName(parser.ParserValueTokenKind(sidecar.tokenKinds[nameToken]))` |
| R4 | `:6882-6893 → :6894-6913` | 泛型窗口 owner = **声明名** token（多一个 backtick 运算符类） | `(ownerKind == Identifier && …) \|\| (ownerKind == Backtick && …) \|\| (ownerKind != Identifier && ownerKind != Backtick)` | 新增 `let ownerKindIsName = TokenCanName(ParserValueTokenKind(ownerKind))`（`:6900-6902`），三支改为 `(ownerKindIsName && …) \|\| (Backtick 支不变) \|\| (!ownerKindIsName && ownerKind != Backtick)` |

**为什么 `:5907` 不动**（这是本次与裁决点名的一处分歧，证据在词法器）：
```
5906              sidecar.tokenKinds[aliasToken - 1] !=
5907                  Int32(parser.ParserValueTokenIdentifier) ||
5908              sidecar.tokenValues[aliasToken - 1] != "as" ||
```
它判的是 import 别名的分隔词 **`as`**，判据是 `kind == Identifier && text == "as"`。`as` **不在** `ParserValueExprKeywordKind` 的封闭关键字表里（§15.3：全表 40 词，无 `as`），词法器把它发射成 `ParserValueTokenIdentifier`（`:14647` 兜底）。所以这里的 `Identifier` 是**字面关键字匹配的一半**，不是名字域判据；改成 `TokenCanName` 会让 `import x as block` 这类输入绕过 `"as"` 文本校验。**保持不变。**

**为什么 `:6886/:6892` 要收**：`declarationOwnerToken` 是**声明自身的名字 token**（`fn`/`type` 名），而 parser 对声明名的准入就是 `TokenCanName`（函数名 `:12769`/`:12803`、显式泛型参数名 `:17875`、隐式泛型名 `:18076`；`type` 声明的 owner 计算在 `:23963-23969` 不做 kind 限制）。⇒ `type object[T] = …` / `fn block[T](…)` 在 parser 侧合法，receipt 侧却被 `ownerKind != Identifier && ownerKind != Backtick` 判死，与 R1-R3 同根。

**改后残留**：该文件 `Int32(parser.ParserValueTokenIdentifier)` 由 6 处降为 **1 处**（即 `:5907` 的 `as` 字面）。生成器的目标态自检逐字报告 `residual narrow Identifier predicates target=1`。

## 15.2 逐位不变自证（两次生成器自检 + 静态论证）

生成器 `.rebuild/s1b_step3/r9/patchgen/parser_receipt_name_domain_gen.py` 三项自检全过：

| 自检 | 结果 |
|---|---|
| 锚点唯一性（4 处，每处 `occurrences == 1`，否则 exit 2） | OK |
| **删除集精确匹配**（`sorted(removed) == sorted(expected_8)`，漂移即 exit 2） | 恰好 8 条：三条 `sidecar.tokenKinds[...] !=` + 三条 `Int32(parser.ParserValueTokenIdentifier) \|\|` + 两条 `ownerKind` 子句；**无注释行、无控制流行、无结构行** |
| **独立 hunk 重放**（解析 hunk 重放到原文，与内存目标逐字节比对） | `orig=3e0b1999… → target=96de8531…`，**逐字节相同** |
| 计数指纹 | `(` `5395→5399`、`)` `5395→5399`、`[` `2345→2349`、`]` `2345→2349`、`{`/`}` `97→97` 不变；`if\|elif\|else` **794→794**（未切链） |
| 新绑定 | 全补丁只新增 **1 个** `let`（`let ownerKindIsName =`，位于 `:6882` 的 `let ownerKind` **之后**、使用它的 `if` **之前**）⇒ 不引用后面才声明的 `let`/`var` |
| `@borrows` 自查 | 被调方 `parser.ParserValueExprTokenCanName` 在 `parser.cheng:14655` **带 `@borrows`** 且形参 `kind: ParserValueTokenKind` 非 var ⇒ 非 var 实参合法；本文件已有 6 处同样写法（`:1277`、`:4523`、`:5901`、`:5929`、`:6502`、`:6726`），调用形 `parser.ParserValueTokenKind(sidecar.tokenKinds[...])` 亦有逐字先例（`:5902-5903`、`:4524-4526`）⇒ 不会触发 `borrowed actual cannot bind non-var non-@borrows formal` |

**逐位不变论证**（与 §14.5 同构）：新旧判据都是**同一个已读 `int32` kind 上的纯谓词**；`TokenCanName(k) ≡ (k == Identifier || k == Block || k == Object)`（`parser.cheng:14655-14658` 逐字），故二者只在 `k ∈ {Block, Object}` 上分叉。不含该形态的输入：真值、`||` 短路顺序、被求值读点、无新增 `intern`、列写入顺序**全不变** ⇒ receipt/`artifactRaw32`/CID 逐位不变。R4 新增的 `let` 只把同一个纯表达式从"算两次"变成"算一次"，对 `k ∉ {Block,Object}` 结果不变。

## 15.3 名字域总表（答复"可命名 token 集逐条对表"）

**第一性来源 = 词法器的封闭关键字表**（`ParserValueExprKeywordKind`，`parser.cheng:14564-14647`）：40 个词被发射为专用 token kind（其余一律兜底 `ParserValueTokenIdentifier`，`:14647`）：

```
async await block break case concept const continue defer elif else enum
false fn for if import in iterator let macro match module nil notin object
of ref return set template trait true tuple type var when where while yield
```

**实现里的名字域只有两个（+一个独立面）**：

| 域 | 判据 | 定义处 | 成员 |
|---|---|---|---|
| 声明名 / 字段名 / 参数名 / 表达式标识符 | `ParserValueExprTokenCanName` | `parser.cheng:14655-14658` | `Identifier` + 上下文关键字 **`block`、`object`** |
| **类型语法**内的名字 | `parserTypeSyntaxTokenCanName` | `parser.cheng:18143-18145`（文件私有） | 上面的 **+ `set`** |
| backtick 运算符名 | 独立两类面 | `compiler_parser_receipt.cheng:1277-1302` | 与本谓词无关 |

**规范对表（`docs/cheng-formal-spec.md:117-122`）**：

| 词 | 规范 keyword 表 | 规范 :122 上下文说明 | 词法器实际 | 名字位合法？ |
|---|---|---|---|---|
| `block` | 在表内 | **明写**上下文关键字，声明名/字段名/参数名/表达式标识符位置按 `ident` | `ParserValueTokenBlock` | ✅ 合法（`TokenCanName`） |
| `object` | **不在表内** | **完全没有提及** | `ParserValueTokenObject` | ✅ 合法（`TokenCanName`）—— **规范缺口** |
| `set` | 在表内 | 未提 | `ParserValueTokenSet` | ⚠️ **仅类型位置**合法（`parserTypeSyntaxTokenCanName`）；字段/声明位置不合法 |
| `as` | 在表内 | 未提 | **`Identifier`**（`as` 不在 40 词表内） | ✅ 合法（等同普通标识符）—— **规范↔词法漂移，且承重**：`compiler_parser_receipt.cheng:5906-5908` 靠 `kind==Identifier && text=="as"` 识别它 |
| `str` | 在表内 | 未提 | **`Identifier`**（不在 40 词表内） | ✅ 合法 —— 同上漂移 |
| `mut` / `is` | 在表内 | 明写"保留字，当前语义未启用" | **`Identifier`** | ✅ 合法 |
| 其余 35 个关键字 | 在表内 | — | 各自专用 kind | ❌ 不可命名 |

**结论（直接回答"还会不会撞第三个名字类"）**：
1. **可命名 token 类只有两个：`block`、`object`**，都由 `ParserValueExprTokenCanName` 收口；不存在第三个隐藏类。
2. **`set` 是唯一的"域外例外"**，但它只活在类型语法域（`parserTypeSyntaxTokenCanName`），且**只被 parser.cheng 自己消费**——全仓 `grep parserTypeSyntaxTokenCanName` 无跨模块调用者，故不会在别的模块变成"第三个名字类"。
3. 全仓名字域判据已穷举：`grep -rn "ParserValueTokenIdentifier" src/` 除 parser.cheng（词法器/语法自身的分派）外只有 `typed_expr_type_arena.cheng`（§14，已修）与 `compiler_parser_receipt.cheng`（本节，已修）+ `semantic_snapshot_declaration_identity.cheng`（§15.5，另轮）。**没有第三个更宽的名字判据**：`ParserValueExprTokenCanStartSpaceAtom`（`parser.cheng:19342-19352`）不是名字判据而是"空格敏感表达式原子起始集"；`ParserAnnotationArgScalarTokenKindMatches`（`:1492-1495`）用的就是 `TokenCanName`。
4. **建议（规范迁移，非本补丁）**：把 `object` 补进 `docs/cheng-formal-spec.md:122` 的上下文关键字说明，并把 `as`/`str`/`mut`/`is` 与 40 词表的漂移在建档时一并注记——**只加说明，不改词法器**（`as` 的 Identifier 身份承重）。

## 15.4 未测项（§15 补丁相关）

| # | 未测项 | 判别方式 |
|---|---|---|
| 1 | 未编译（硬纪律）；四项自检为静态 | 烤炉 |
| 2 | R1/R2/R3/R4 的**触发形态在本闭包内不存在**（无 `block`/`object` 命名的变体/类型参数/具名 tuple 元素/泛型声明 owner）⇒ 本补丁对 `binary_types_via_import` 预期**零影响**；它的价值是防下一堵 | 与 `kd_r21` 的 `artifactRaw32`/CID 对拍 |
| 3 | R2 的 `childOwner` **无下界检查**（只查 `childOwner + 2 >= len`，未查 `< 0`）是既有形态，本补丁未改、也未引入新风险（索引表达式逐字未变） | 需要一次 receipt 越界读数 |
| 4 | R4 的 `let ownerKindIsName` 在 Cheng 里"`let` + 跨行调用"的可编译性由烤炉验证 | 烤炉 |
| 5 | §15.2 的逐位不变是**静态论证 + 计数指纹**，未做字节对拍 | 三件 rc=0 夹具 + `kd_r21` 侧 sha 逐字相同 |

## 15.5 未纳入：`semantic_snapshot_declaration_identity.cheng:139-148`（下一轮，先证明再修）

裁决要求"先给一致性证明，给不出就不修、记为已知缺口"。需要回答的三问（本席**未做**，留作下一轮的入口）：
1. **谁产出 `parserValidatedNameProofCid`**：`compiler_snapshot_builder.cheng` 的 `compilerSnapshotBuilderDeclarationNameProofCidInto`（字段声明登记点 `:19509-19522`，`NameSurfaceIdentifier`）；
2. **谁消费**：`semantic_snapshot_declaration_identity.cheng:287` / `:646` 的 `semanticSnapshotDeclarationNameValid`；
3. **放宽后是否闭合**：现判据 `ParserValueExprKeywordKind(name,0,len) == Identifier` 与宽的 `TokenCanName(ParserValueExprKeywordKind(...))` 只在 `block`/`object` 上分叉；若 proof CID 的**产出方**（receipt 的 `ParserRenameIdentifierStrictValidateInto`，`compiler_parser_receipt.cheng:1277` 一带）本身已按 `TokenCanName` 放行，则放宽判据是**追平产出方**、闭合；若产出方也按 `Identifier` 收窄，则须两侧同改，否则就是"判据放行、证明仍按旧域"的假绿。
**在做完这三问之前不动该文件**，并记为已知缺口。

---
---

# §16 第三堵：`typed expr type arena: resolution receipt row invalid`（`kd_r21`）

只读源码 + 定位 + 落补丁；**全程未运行任何编译/烤制/lldb**（2026-09-12 04:4x 起）。
取证：`.rebuild/s1b_step3/r9/fixtures_r21.txt`、`.rebuild/s1b_step3/r9/repro_btypes_r9.stderr.txt`（04:39 被 r21 那一炉覆盖，内容即 r21）。
锚定哈希（本席读文件时的工作树）：`src/core/lang/typed_expr_type_arena.cheng`（11,147 行，`git hash-object = 55f13b9b…` = §14 补丁已 apply 态）/ `src/core/tooling/compiler_csg.cheng`（42,987 行）。

## 16.0 结论先行

1. **判词点**：`src/core/lang/typed_expr_type_arena.cheng:9837`，函数 `TypedExprTypeArenaStrictValidateInto`（`:9483`）。它是**seal 相**的自我校验：`compiler_csg.cheng:36014 TypedExprTypeArenaSealInto` → `typed_expr_type_arena.cheng:8797 TypedExprTypeArenaStrictValidateInto` → `:9837`。判词前缀 ` compiler csg: TypeArena production failed: `（**无 `source_index`**，即 `compiler_csg.cheng:36012` 变体）与日志逐字一致 ⇒ 与 §14 判相口径相同。
2. **失败子条件**：四个析取项里的**第 4 项**——`resolutionTypeSyntaxNodeIndexes` 必须**严格升序**。
3. **根因（新根因，与名字域无关）**：该列全仓**只有一个写入者** `typedExprTypeArenaResolveNominal`（`:1995-2000`）。append 相按行号升序走、每解析一行就追加一条收据；**forward-typeid 重放相在整段 append 循环之后才跑**（`compiler_csg.cheng:35906-35990`），把被推迟的行补在末尾。于是列 = `[append 段升序] ++ [replay 段升序]`，**不升序**。本夹具里被推迟的行属于**源 0**（`binary_types.cheng` 的 nominal 指向源 2/4/6/9），而源 1..10 在 append 相照常解析 ⇒ 必然违反。
4. **判定：(a) 生产者真缺口**（forward-typeid 重放机制引入），**(c) 是它的可达时序**（此前每炉死在更早的墙，seal 相从未跑到）。**不是 (b)**：见 §16.2 的三条排除。**与 §14/§15 的名字域同根？不是** —— 名字域那两堵是"判据取值域太窄"，本堵是"生产者把有序列写成乱序"，根因不同，不硬套。
5. **修法已落**：`patches/resolution_receipt_row_order.patch`（1 文件 / 6 hunk / `+43 −8`）。冻结副本 `.rebuild/s1b_step3/r9/patchgen/resolution_receipt_row_order.frozen.patch`，`cmp` 逐字节相同，`sha256=be1ce4bfed11883f1c6728e87eb5509aaf2299d1839a56f9f84a08e9ec95d492`。`git apply --check` = 0（基线 = **当前工作树**，§14/§15 两补丁均已 apply）。**未 apply、未编译。**

## 16.1 判据链（逐项 + 依赖列）

判词点原文（`typed_expr_type_arena.cheng:9830-9838`）：

```
        let typeSyntaxNodeIndex = …ArenaArrayInt32Get(… resolutionTypeSyntaxNodeIndexes …, resolutionRow)
        let symbolId = …ArenaArrayInt32Get(… resolutionTargetSymbolIds …, resolutionRow)
        if typeSyntaxNodeIndex < 0 ||
           typeSyntaxNodeIndex >= value.typeSyntaxCount ||
           symbolId < 0 || symbolId >= value.symbolCount ||
           (resolutionRow > 0 &&
            …ArenaArrayInt32Get(… resolutionTypeSyntaxNodeIndexes …, resolutionRow - 1) >= typeSyntaxNodeIndex):
            err = " typed expr type arena: resolution receipt row invalid"
```

| # | 子条件 | 依赖列 / 表 |
|---|---|---|
| 1 | `typeSyntaxNodeIndex >= 0` | `resolutionTypeSyntaxNodeIndexes[resolutionRow]` |
| 2 | `typeSyntaxNodeIndex < value.typeSyntaxCount` | 同上 + `typeSyntaxCount` |
| 3 | `symbolId >= 0 && symbolId < value.symbolCount` | `resolutionTargetSymbolIds[resolutionRow]` + `symbolCount` |
| 4 | **`resolutionRow > 0` ⇒ 前一行的行号严格小于本行** | 同列前一行 —— **严格升序** |

循环上界 `value.resolutionCount`（`:9829`），列长自洽由 `:9612-9616` 另判。
**为什么这列必须是规范序**：
- `typedExprTypeArenaAppendColumn(:1002-1004)` 把它**按序**写进 artifact 字节 ⇒ 顺序进哈希；
- `typedExprTypeArenaBuildDependencyProof:5771-5816` **按同一顺序**逐行镜像出 `nominalDependencyTypeSyntaxNodeIndexes / SourceSymbolIds / TargetSymbolIds / IndirectFlags`，而 `StrictValidateInto:9867-9877` 用 `dependencyCursor` 要求两列**逐位对齐**；
- `:9839` 的 `resolutionSymbolByTypeSyntax[typeSyntaxNodeIndex] = symbolId` 依赖"一行一收据"，即升序同时也是**去重**。

## 16.2 定位：结构性排除 + 单写入者论证（把落点钉到第 4 子条件）

**第一步：子条件 1/2/3 构造性恒真。**
- 该列**唯一写入点**是 `:1995`（`grep -n "resolutionTypeSyntaxNodeIndexes"`：`:1942`/`:1002` 是**另一个列** `genericResolutionTypeSyntaxNodeIndexes` 的写入与 artifact 序列化，`:5774`/`:9830`/`:10631` 是只读）。写入的值是 `ResolveNominal` 的形参 `typeSyntaxNodeIndex`，由 `InternSyntaxRec` 的全局行游标传入，恒在 `[0, typeSyntaxCount)` ⇒ **1、2 恒真**。
- 写入的 `symbolId` 是 `state.symbolByDeclarationRoot[declarationRoot]`，写入前刚过 `if symbolId < 0 → hard fail`（`:1962-1964`）；`symbolByDeclarationRoot` 由 `BuildStateInitInto` 从 `declarationSymbolGlobalRoots` 播种（`:5316-5327`），是 `[0, len)` 上的双射，而 `SealInto` 开头强制 `value.symbolCount == state.declarationSymbolTotal`（`:8715-8717`）⇒ **3 恒真**。
- ⇒ **唯一可失败项 = 第 4 项（顺序）**。

**第二步：顺序为何必然被破坏（单写入者 + 两相时机）。**
- 该列的**全部**追加来自 `ResolveNominal`，而它全仓**只有两个调用点**，都在 `InternSyntaxRec` 内：`:7558`（`Nominal` 臂）与 `:7564`（`Qualified` 臂）。
- `InternSyntaxRec` 两个入口：`AppendSourceFromTreeInto:8614` 传 `replayForward = false`（逐源 append 相），`ReplayForwardRowsInto:8661` 传 `true`（重放相）。重放由驱动在**整段逐源 append 循环结束之后**调用（`compiler_csg.cheng:35906` 注释 "Replay pass"，位置在最后一条 `ta_stream` 之后、`typed_context_lookup_built:36001` 之前）。
- append 相内行游标**严格升序**（源按 `orderedSources` 升序、源内按行升序、全局行 = 前缀和基址）⇒ append 段升序；重放相内部也升序（队列按全局行升序，见 `forward_cross_source_resolution.md` §10.4.2 的证明）。
- **但两段串接**：`列 = [append 段] ++ [replay 段]`。只要存在一个被推迟的行 r，且存在一个在 append 相解析、行号 > r 的行，就违反。
- 本夹具两者都成立：`binary_types.cheng` 是**源 0**（`forest src=0 bytes=6917`，字节数全仓唯一），它 `import std/result / std/rawbytes / bytes_layout / strutils`（源 6/4/2/9，全在它之后），正文里 `layout.FixedBytes32`、`Bytes`、`Result[...]` 处处可见 ⇒ 源 0 的 nominal 行在 append 时目标源尚未 append（`ResolveNominal:1973` 的 `declarationRoot >= typeSyntaxDeclarationOwnerTokenIndexes.len` 成立）⇒ 被推迟；而源 1..10 里恒有在 append 相就解析成功的 nominal ⇒ 反序**必然**发生。
- **反证同一结论**：若队列为空，该列纯由 append 段构成、必然升序，本判词**不可能**触发。既然实测触发且 1/2/3 恒真，就**反推出重放相确实追加过收据** —— 失败本身就是"队列非空"的证明。

**第三步：设计档的口径差（新机制漏了一条不变量，不是老守卫太严）。**
`forward_cross_source_resolution.md` §10.3「三个必须同时保住的顺序」把 `resolution 行追加` 的约束写成 **"绝不能重复"**（理由是 `resolutionCount` 翻倍 ⇒ 哈希变），§10.4.2 只证明了**队列**升序（"这是一个可证的序"）。**设计从未把"队列升序"提升为"收据列升序"** —— 重放机制保住了**条数**、丢了**次序**。

## 16.3 判定：(a) 生产者真缺口

| 候选 | 判定 | 证据 |
|---|---|---|
| **(a) 生产者真缺口** | **成立（主判）** | §16.2：唯一可失败项是顺序；顺序被"append 段 ++ replay 段"这一**新的**两相结构破坏；设计档 §10.3 只禁重复、未涉顺序 |
| (b) 判据过严 | **排除** | ① 该列按序进 artifact（`:1002-1004`），放宽顺序 = 让哈希依赖"某行由哪一相解析"这一**实现细节**，与确定性字节直接冲突；② 放宽顺序同时丢掉去重语义，`:9839` 会静默后写覆盖；③ 非前向输入下生产者**本来就产升序**，升序是既成规范形，不是新要求 |
| (c) 既有潜伏被上游修复暴露 | **部分成立（触发时序，不是根因）** | 守卫一直在；此前每炉死在更早的相（r13/r14 `resolution authority failed source_index=10`、r17 `bracket apply authority incomplete`、r19 `object field authority invalid`），seal 相从未跑到。但守卫不是被动暴露的受害者 —— 是重放机制主动违反了它 |

**与 §14/§15 名字域是否同根**：**不同根**。名字域两堵的根是"判据取了**更窄的取值域**"（`Identifier` ⊊ `TokenCanName`），修法是换谓词；本堵的根是"生产者把**有序列的写入时机**拆到了两相"，修法是改记账位置。硬套会把修法带偏，故明确记为**新根因**。

## 16.4 修法（**补丁已落**：`patches/resolution_receipt_row_order.patch`）

**补丁基**：工作树 `src/core/lang/typed_expr_type_arena.cheng`（§14 补丁已 apply，`git hash-object = 55f13b9b…`，11,147 行）。包内 `*.patch` 被 `.gitignore:229` 忽略，**未 commit**。
**改动量**：1 文件 / 6 hunk / `+43 −8`。**8 条删除逐条列出**（全部是收据写点搬家留下的空位，无注释/控制流/结构行）：

```
-    arenamod.ArenaArrayInt32Add(            # 旧收据写点（尾部）
-        localOut.arena, localOut.resolutionTypeSyntaxNodeIndexes,
-        typeSyntaxNodeIndex)
-    arenamod.ArenaArrayInt32Add(
-        localOut.arena, localOut.resolutionTargetSymbolIds, symbolId)
-    localOut.resolutionCount = localOut.resolutionCount + 1
-                   viewTokenRowBase, typeId, err):   # Nominal 调用点
-                   viewTokenRowBase, typeId, err):   # Qualified 调用点
```

**修法一句话**：收据记账从"解析成功之后"搬到"**该行被访问时**"，只记一次；重放相不再记账，只把 TypeId 绑上。

| # | 落点（旧锚 → 补丁后行） | 内容 |
|---|---|---|
| 1 | 结构体 `builtinConstructorArities` 之后（`@@ -414`）→ 新 `:426` | 新增 `resolutionReceiptRecorded: bool[]`（行即下标；纯堆数组，在 pinned arena 预算之外、`HashMaterialized` 之外，同 `blockedFlags` 规则） |
| 2 | `typedExprTypeArenaBuildStateInitInto`（`@@ -5372`）→ 新 `:5403-5425` | `var` + `setLen(…, typeSyntaxCount)` + 逐元素 `false` + `state.… = …`（与 `bracketConstLengths`/`builtinConstructorArities` 同段同写法） |
| 3 | `typedExprTypeArenaResolveNominal` 签名（`@@ -1828`）→ 新 `:1841` | 形参加 `replayForward: bool`（与 `InternSyntaxRec` 同名同序位） |
| 4 | `ResolveNominal` 中 `symbolId` 校验之后（`@@ -1962`）→ 新 `:1988-2001` | **收据记账块**：`if !replayForward:` 追加 `(行, symbolId)` + `resolutionCount++` + 置位；`elif !state.resolutionReceiptRecorded[行]:` ⇒ **hard-fail**（带 `row=` / `declaration_root=` 坐标）。位置在 `# [forward-typeid]` 推迟判据**之前** |
| 5 | `ResolveNominal` 尾部（`@@ -1992`）→ 新 `:2029-2033` | 删掉搬走的 6 行，只留 `authorityUsed` 打标 + `typeIdOut = targetTypeId` |
| 6/7 | `InternSyntaxRec` 两个调用点（`@@ -7557`）→ 新 `:7595` / `:7601` | 传 `replayForward` |

**为什么这样是对的（不是把责任推给消费者）**
1. **收据只需要 `(行, 目标 SymbolId)`，两者在访问时就已精确**：`symbolId` 来自播种好的 `symbolByDeclarationRoot`；推迟判据本身就建立在"`SymbolId` 已定、只有 `TypeId` 未定"之上（`:1965-1972` 既有注释）。推迟的**唯一**理由是 TypeId 未定型，而 TypeId **不进收据** ⇒ 记账前移**没有削弱任何 fail-closed 语义**，推迟机制原样保留。
2. **"恰记一次"可证**：能进 `ResolveNominal` 的行 = 非 `qualifiedSegment` 的 `Nominal` 行 + `Qualified` 行。`Nominal` 行由 parser 以**空子表**创建（`parser.cheng:18951-18964`，`children` 实参为 `[]`）⇒ `childCount == 0` ⇒ **永远不可能被"子行被阻塞"传播标记**；`Qualified` 行的子就是那些 `Nominal` 段（`parser.cheng:18969-18984`），段行被 `InternSyntaxRec:7466-7474` 的 `qualifiedSegment` 过滤器跳过且自身无子 ⇒ 也永不置位 ⇒ **`Qualified` 行同样不会被传播标记**。⇒ 重放相处理的行集 ⊆ append 相调用过 `ResolveNominal` 的行集 ⇒ 迁移后**条数不变、行集不变**。
3. **顺序由构造保证**：记账发生在**访问位置**，访问游标全局升序 ⇒ 列**天然严格升序**，不再依赖"哪一相解析的"。
4. **新增 fail-closed 网**：第 4 块的 `elif` 把"重放行没有 append 相收据"变成**硬失败**（而不是静默少一条依赖边）。若将来 parser 让 `Nominal` 带上子行，这行会**先炸**。

**逐位不变自证（生成器三项自检 + 静态论证）**

| 自检 | 结果 |
|---|---|
| 锚点唯一性（7 处，每处 `occurrences == 1`，否则 exit 2） | OK |
| **删除集精确匹配**（`sorted(removed) == sorted(expected_8)`） | 恰好 8 条（见上），无其它删除 |
| **独立 hunk 重放**（解析 hunk 重放到原文，与内存目标逐字节比对） | `orig=302b87a8… → target=5d728232…`，**逐字节相同** |
| 新增绑定 | 全补丁只新增 **1 个**：`var resolutionReceiptRecorded: bool[]`（`BuildStateInitInto` 内，`setLen` → 逐元素 `false` → 赋给 `state`，先声明后使用；无"引用后面才声明的 let/var"） |
| **`if|elif|else` 未切链** | 逐关键字计数 `if 878→879 (+1)`、`elif 62→63 (+1)`、`else 23→23 (+0)` —— 增量**恰为新增的那条自足 `if/elif`**（收据守卫）；删除集里**没有任何** `if/elif/else` 行；插入点前后都是 4 空格语句（`return false` 之后、`# [forward-typeid]` 之前），未落进任何既有分支体 |
| 括号平衡 | `(`/`)` `2644→2649` 同增 5、`[`/`]` `1152→1159` 同增 7、`{`/`}` `232→234` 同增 2（后者是新增 `Fmt" … row={…} declaration_root={…}"` 的两个花括号） |
| **`@borrows` 自查** | 新代码**没有引入任何新的只读访问器调用**：`arenamod.ArenaArrayInt32Add`（本函数原写点就在用）与 `Fmt"`（本文件 75 处先例）都是既有调用形；`ResolveNominal` 自身仍是 `@borrows`，形参 var 性未变 ⇒ 不会触发 `borrowed actual cannot bind non-var non-@borrows formal` |
| 列名/引用计数 | `resolutionReceiptRecorded` 六处 probe 各恰 1 次；`ResolveNominal` 全仓引用数 3（定义 1 + 调用 2）不变；`viewTokenRowBase, replayForward, typeId, err):` 恰 2 处 |

**为什么不会让无关输入变化（byte-neutrality）**
1. `replayForward = true` 只有 `ReplayForwardRowsInto` 一个来源，驱动只在**队列非空**时调用它（`compiler_csg.cheng:35907` 的 `while replayCursor < …typeSyntaxNodeIndexes.len`）。⇒ **不含跨源前向 nominal 的输入**：每次调用都是 `replayForward = false`，新守卫恒真 ⇒ 与改前**逐语句等价**。
2. 对在 append 相就解析成功的行：收据仍在**同一行游标位置**追加，append 序列的**内容与顺序都不变**（只是它在函数体内的位置前移；`authorityUsed` 打标仍在解析成功之后）。
3. `resolutionReceiptRecorded` 是**纯堆数组**，不进 arena、不进 `typedExprTypeArenaHashMaterialized`、不进任何 `AppendColumn` ⇒ 不参与 `artifactRaw32`/CID。
4. ⇒ **不含该形态的输入：`typeArenaArtifactCid` 及由其派生的 CID 逐位不变。**
5. 含该形态的输入：收据列由"两段串接"变成**全局行升序**（`StrictValidateInto` 要求的规范形）；这些输入改前**直接硬失败、不产 artifact**，不存在需要保住的旧字节。`nominalDependency*` 与 `symbolDependency*` 随之按规范序重建（`BuildDependencyProof` 永远镜像当前收据列），`StrictValidateInto:9867-9877` 的逐位对齐成立。

**落补丁的方法（可复现，未碰仓库源文件本体）**：生成器 `.rebuild/s1b_step3/r9/patchgen/resolution_receipt_row_order_gen.py` 读真实源文件、做 **7 处精确字符串替换**（每处断言 `occurrences == 1`，否则 exit 2），`difflib.unified_diff` 生成补丁，并**独立重放** hunk 到原文与内存目标逐字节比对。仓库源文件 `git hash-object` 前后均为 `55f13b9b…`（**未被写入**）。
**冻结**：`.rebuild/s1b_step3/r9/patchgen/resolution_receipt_row_order.frozen.patch`，与 `patches/resolution_receipt_row_order.patch` `cmp` 逐字节相同，`sha256=be1ce4bfed11883f1c6728e87eb5509aaf2299d1839a56f9f84a08e9ec95d492`（5,955 B）。
**不覆盖**：`patches/object_field_authority_name_domain.patch`（`1c0f20da…`）与 `patches/parser_receipt_name_domain.patch`（`7e0e2af3…`）均**原样保留**。**`git apply --check` = 0**（基线 = 当前工作树）。**未 apply、未编译。**

## 16.5 未测项（诚实清单）

| # | 未测项 | 判别方式 |
|---|---|---|
| 1 | **未运行任何编译**（硬纪律）；全部为 `read`/`grep`/`python3` 静态读数 | 烤炉 |
| 2 | **判词不带坐标**：落点是"唯一可失败项 = 第 4 子条件"推出来的；"被推迟的行属于源 0"由字节数身份 + 源码 import 关系推出，未逐行 dump | 需要一次 `resolutionTypeSyntaxNodeIndexes` 列 dump（或给 `:9837` 判词补 `row=/prev=` 坐标） |
| 3 | **"重放确实追加过收据"是反证推出的**（若队列空则本判词不可能触发）；本席**没有**直接的队列长度读数 | 加一条 `csg_mem tag=forward_queue rows=N` 即可一锤定音 |
| 4 | 修复后 `resolutionCount` 与改前是否**逐值相同**：给的是集合论论证（行集不变 ⇒ 条数不变），未实测计数 | 烤炉 + 计数对数 |
| 5 | 第 4 块新增的 `elif` 硬失败路径在本输入上**不应触发**；未验证它在"将来 parser 让 Nominal 带子行"时真的会炸 | 造一个 `Nominal` 带子行的畸形夹具（当前不可造） |
| 6 | `bool[]` 的 `setLen` 初始化语义未依赖（逐元素显式 `false`，与 §14 同写法）；`state.resolutionReceiptRecorded` 在所有驱动里都由唯一构造器 `BuildStateInitInto` 分配（全仓 `new(typedExprTypeArenaBuildState)` 恰 1 处）这一点是 grep 证据 | 烤炉 |
| 7 | 修复后下一道墙未测 | 见 §16.6 |

## 16.6 预登记（下一堵的候选）

按源码顺序，seal 相在 `:9837` 之后继续走 `:9844-9865`（**泛型**收据，同款升序判据 `:9851-9852`）⇒ `:9867-9877` 的 nominal 依赖逐位对齐 ⇒ `:10630` 的 exact resolution receipt ⇒ `:10639` 的 `artifact CID mismatch`。**泛型收据列（`genericResolutionTypeSyntaxNodeIndexes`）不受本补丁影响、也不受重放影响**：它只在 `ResolveNominal` 的**泛型臂**（`:1937-1950`）追加，而该臂在推迟判据**之前**返回，泛型行又无子行（同样不可能被传播标记）⇒ 泛型收据**只在 append 相产生、天然升序**。故若 `:9853` 那句 `generic resolution receipt row invalid` 出现在下一炉，说明本席"泛型行不进重放"的推论被推翻，届时按同一手法重查。

**§15.5 的挂起未动**：`semantic_snapshot_declaration_identity.cheng:139-148` 本轮**未改**（三问未答）。`kd_r21` 实测显示 seal 已过而 `NameSurfaceIdentifier` 那条路**没有**成为下一堵，与 §15.5 的判断一致。

---
---

# §17 第四堵：`typed expr type arena: generic application origin invalid`（`kd_r23`）

只读源码 + 定位 + 落补丁；**全程未运行任何编译/烤制/lldb**（2026-09-12 05:0x 起）。
取证：`.rebuild/s1b_step3/r9/fixtures_r23.txt`。锚定哈希（本席读文件时的工作树）：`src/core/lang/typed_expr_type_arena.cheng`（11,182 行，`git hash-object = e081dcc1…` = §14/§15/§16 三补丁均已 apply 态）。

## 17.0 结论先行

1. **判词点**：`src/core/lang/typed_expr_type_arena.cheng:9338`，函数 `typedExprTypeArenaValidateTypeSyntaxRec`（`:9098`，bracket 臂）。
2. **判相核实（不照搬上一轮）**：判词前缀 ` compiler csg: TypeArena production failed: `**不带 `source_index`** ⇒ `compiler_csg.cheng:36012` 变体 ⇒ **seal 相**。链：`compiler_csg.cheng:36014 TypedExprTypeArenaSealInto` → `typed_expr_type_arena.cheng:8832 TypedExprTypeArenaStrictValidateInto` → `:10024 typedExprTypeArenaValidateTypeSyntaxRec` → `:9338`。**注意与上一轮不同**：§16 的判词点在 `StrictValidateInto` 本体，本堵在它**调用的子校验器**里，但两者同属 seal 相、共用同一个前缀变体。
3. **失败子条件**：`:9335-9337` 的**第二项** `symbolId < 0`。
4. **形态**：**内建类型构造器应用** `typedesc[T]` / `set[T]`。生产者在 `InternSyntaxRec` 的 `[builtin-ctor]` 臂（`:7769-7820`）**故意**以 `symbolId = -1`、`children[0] = 构造器行` 铸造 Apply 行（注释逐字写明 "symbolId = -1 and children[0] = the builtin head"）；而本判据要求每个 Apply 行都必须带声明 SymbolId。
5. **判定：(b) 判据取值域窄于合法域**（同一文件内部自相矛盾），**(c) 是它的可达时序**。**不是 (a)**：内建 Apply 是文档化、与冷链 APPLY 同形的合法表示，另**两处**消费者已经逐字编码了这个豁免。
6. **与前几堵的关系**：**与 §16（收据次序）不同根**（那是"有序列的写入时机被拆到两相"）；**与 §14/§15（名字域）是同一抽象族**（"判据的取值域比合法域窄"），但**是独立谓词** —— 名字域那条修法（`TokenCanName`）对本堵**完全无效**，反之亦然。故按新根因处理，不硬套。
7. **修法已落**：`patches/generic_application_origin_builtin_head.patch`（1 文件 / 4 hunk / `+80 −11`）。冻结副本 `.rebuild/s1b_step3/r9/patchgen/generic_application_origin_builtin_head.frozen.patch`，`cmp` 逐字节相同，`sha256=bfa3f1000819f15e90bf6744c59c36b0e23f03db6c93d5e3009958d1976b9645`（8,039 B）。`git apply --check` = 0（基线 = **当前工作树**）。**未 apply、未编译。**

## 17.1 判据链（逐项 + 依赖列）

判词点在 bracket 臂内（`typed_expr_type_arena.cheng:9330-9339`）：

```
        if parserKind == Int32(parser.ParserTypeSyntaxFixedArray) ||
           parserKind == Int32(parser.ParserTypeSyntaxBracketApply):
            let semanticKind = … typeKinds[typeId] …
            if semanticKind == Int32(TypedExprStructuralTypeApply):
                let symbolId = … symbolIds[typeId] …
                if parserKind !=
                       Int32(parser.ParserTypeSyntaxBracketApply) ||
                   symbolId < 0 || symbolId >= value.symbolCount:
                    err = " typed expr type arena: generic application origin invalid"
                    return false
```

| # | 子条件 | 依赖列 / 表 |
|---|---|---|
| 前置 | 本行 `parserKind ∈ {FixedArray, BracketApply}` | `typeSyntaxParserKinds[row]` |
| 前置 | 本行语义 `semanticKind == TypedExprStructuralTypeApply` | `typeSyntaxTypeIds[row]` → `typeKinds[typeId]` |
| 1 | `parserKind == ParserTypeSyntaxBracketApply` | `typeSyntaxParserKinds[row]` |
| 2 | **`symbolId ∈ [0, value.symbolCount)`** | `symbolIds[typeId]` + `symbolCount` |

**为什么必然是第 2 项（排除第 1 项）**：`InternSyntaxRec` 里 `ParserTypeSyntaxFixedArray` 与 `ParserTypeSyntaxBracketApply` 是**两个不同的 kind 分派臂**（`:7620` 与 `:7633`）。FixedArray 臂只会 `Intern(..., TypedExprStructuralTypeFixedArray, ...)`（`:7828`）；BracketApply 臂的三种出口是 ① 声明权威 Apply（`:7751`）② **内建构造器 Apply（`:7815`）** ③ 定长数组回退（`:7828`）。`typeSyntaxTypeIds[row]` 只由该行自己的分派写入，且 `Intern` 的结构键含 `kind` ⇒ **FixedArray 行不可能得到 Apply 行** ⇒ 第 1 项恒真。

**为什么第 2 项会失败**：`:7813-7818` 的内建臂传的是
```
typedExprTypeArenaIntern(state, value, typeSyntaxNodeIndex,
    TypedExprStructuralTypeApply, TypedExprStructuralScalarInvalid,
    -1, -1, -1, -1, -1, -1,          # ← 第 6 个位置参数就是 symbolId
    builtinChildren, childNames, typeId, err)
```
`Intern` 的形参序为 `(state, out, originTypeSyntaxNodeIndex, kind, scalarKind, symbolId, genericSymbolId, fixedLength, functionParamCount, baseTypeSyntaxNodeIndex, baseTypeId, children, childNameIds, typeIdOut, err)`（`:1171-1187`）⇒ 该 Apply 行 `symbolIds[typeId] = -1` ⇒ `symbolId < 0` 成立 ⇒ **判词**。

## 17.2 定位：全域枚举把形态钉到 `src/std/system.cheng` 的两处

判词不带坐标。用上一轮同款手法：

**第一步：全仓 Apply 消费者普查**（`grep -rn "TypedExprStructuralTypeApply" src/`，共 40 处）。逐个核过，**只有三处**涉及"Apply 的权威是谁"：
| 站点 | 现状 |
|---|---|
| `typed_expr_type_arena.cheng:10261-10272` `builtinHeadApply`（payload 段） | **已豁免**内建头：`(symbolic && !builtinHeadApply && (symbolId < 0 \|\| …))`（`:10294-10295`） |
| `compiler_snapshot_builder.cheng:13952` `builtinApplyHead` | **已豁免**内建头（"It is admitted by KIND"） |
| **`typed_expr_type_arena.cheng:9335-9337`** | **未豁免** ← **本墙** |
其余 37 处（`compiler_csg` 12659/12923/12943/13148/34569/35101、`canonical_type_chain:61`、`exact_def_freeze:753`、`exact_def_derive:95`、`managed_lvalue_replace:851`、`typed_expr` 7714/21037/25226 …）**一律只走 `children[0]`**，正是内建 Apply 形状选 `children[0]` 当头的原因，**没有一个**假设 `symbolId ≥ 0`。
另核 `typed_expr_type_arena.cheng:6296`（`ObjectBaseTargetInto`：object 基必须解析到具体 object）——那是**另一条**谓词（object 基不可能内建构造器应用），且本闭包 11 源里 `grep "ref object\|object of"` **零命中** ⇒ 不可达，**不动**。

**第二步：全域枚举"哪些行会得到 `symbolId == -1` 的 Apply"**。生产者只在 `builtinArity > 0` 时走内建臂（`:7787`），而封闭表（`:1082-1086`）只有两项：

| 词 | arity | 定义处 |
|---|---|---|
| `typedesc` | 1 | `TypedExprStructuralScalarTypedesc` |
| `set` | 1 | `TypedExprStructuralScalarSet` |

于是"内建应用"的唯一来源就是 `typedesc[` / `set[`。**11 源全域扫描**（`grep -n "typedesc\[\|set\["`）：

```
src/std/system.cheng:2723   fn newException(t: typedesc[T], message: str): T =
src/std/system.cheng:2817   fn setHas(s: set[T], value: T): bool =
```

**恰两处，都在 `src/std/system.cheng`（`forest src=10 bytes=103363`，字节数全仓唯一，见 §14.3.2 的 11 源身份表）**。其余 10 源零命中。
**交叉印证**：`fixtures_r13.txt` / `fixtures_r14.txt` 上同一夹具的前序判词逐字带着坐标 `producer_source=10 name=typedesc type_syntax_row=1352 root_row=1354 root_generic_count=1` 与 `producer_source=10 name=set …` —— 与本枚举的两处位置、源号完全一致（行号 2723 / 2817 与 TypeSyntax 行 1352/1354 是不同坐标空间，前者源码行、后者 TypeSyntax 行）。
**其余泛型应用（声明权威，不走内建臂）**：`Result[...]` / `Err[...]` / `Ok[...]` / `Option[...]` 等，散见 `binary_types.cheng:89/91/96/98/183/185/187/197`、`bytes_layout.cheng:207/209/213/216/218/222/225/227/231/289/291/298/301/304/306/313/…` 等 —— 它们的 `symbolId` 来自 `state.symbolByDeclarationRoot[declarationRoot]`（`:7749-7751`），**全部 ≥ 0** ⇒ 不进本判据的失败分支。
（`int32[N]` / `uint8[448]` 这类定长数组走的是 FixedArray 语义，`bracketConstLengths > 0` ⇒ 不进 Apply 分支。）

## 17.3 判定：(b) 判据取值域窄于合法域（同一文件内部自相矛盾）

| 候选 | 判定 | 证据 |
|---|---|---|
| **(b) 判据过严** | **成立（主判）** | ① 同一文件 `:10261-10272` 对**同一形状**已经写下豁免，且其后 `:10294-10295` 明文用 `!builtinHeadApply`；② `compiler_snapshot_builder.cheng:13952` 第三处同样豁免；③ 生产者注释 `:7774` 逐字写着 "symbolId = -1"，并在 `:7775-7778` 给出冷链同形证据（`bootstrap/cheng_cold.c:78304-78310`、`compiler_csg.cheng:12637-12659`、`canonical_type_chain.cheng:55-67` 都前向到 `children[0]`）⇒ 该形状是**设计**，不是畸形 |
| (a) 生产者真缺口 | **排除** | 内建构造器**没有**声明可言（`typedesc`/`set` 不是声明符号），给它编一个 SymbolId 才是造假；`-1` 是唯一诚实的表示。需要补的是**判据**,不是数据 |
| (c) 既有潜伏被上游修复暴露 | **成立（可达时序，不是根因）** | `[builtin-ctor]` 是 `patches/builtin_type_constructor_arity.patch`（前手）引入的新表示；`StrictValidateInto`/`ValidateTypeSyntaxRec` 这条 seal 自校验链此前每炉都死在更早的墙（§14/§15/§16 三堵），本判词点是**第一次**被走到。守卫不是被动受害：是它**漏改**了 |

**与 §14/§15（名字域）的关系**：**同一抽象族，独立谓词**。
- 同族之处：两者都是"判据枚举的取值域**窄于**合法域"（`Identifier` ⊊ `TokenCanName`；`声明 SymbolId` ⊊ `{声明 SymbolId, 内建头}`）。
- **不同谓词**：名字域吃的是 token kind，本堵吃的是"类型行的权威形状"；`TokenCanName` 那套修法对本堵**零作用**，本补丁也不碰任何名字域。
**与 §16（收据次序）的关系**：**不同根**。§16 是"有序列的写入时机被拆到两相"（生产者记账位置），本堵是"消费者判据的取值域"。

## 17.4 修法（**补丁已落**：`patches/generic_application_origin_builtin_head.patch`）

**补丁基**：工作树 `src/core/lang/typed_expr_type_arena.cheng`（§14/§15/§16 三补丁均已 apply，`git hash-object = e081dcc1…`，11,182 行）。包内 `*.patch` 被 `.gitignore:229` 忽略，**未 commit**。
**改动量**：1 文件 / 4 hunk / `+80 −11`。**11 条删除逐条列出**（全部来自被改写的两个块，无 `elif`/`else` 行）：

```
-        # not demand one for exactly this shape.  The opening is as narrow as
-        # the shape: TypeApply + symbolId == -1 + child[0] is a Scalar row.
-        var builtinHeadApply = false
-        if kind == TypedExprStructuralTypeApply && symbolId == -1 &&
-           childCount >= 1:
-            let builtinHeadTypeId = …
-            if builtinHeadTypeId >= 0 && builtinHeadTypeId < value.typeCount &&
-               …typeKinds… ==
-                   Int32(TypedExprStructuralScalar):
-                builtinHeadApply = true
-            if semanticKind == Int32(TypedExprStructuralTypeApply):   # 改为 && !builtinHeadApply
```

**修法一句话**：把"这行是不是内建头应用"从**两处各自内联的形状测试**收敛成**一个具名谓词**，让本文件的两个消费者共用它；并给内建情形一条**自己的、正向验证的臂**，而不是放行。

| # | 落点（旧行 → 补丁后行） | 内容 |
|---|---|---|
| 1 | `typedExprTypeArenaBuiltinConstructorArity` 之后（`@@ -1084`）→ 新 `:1088-1117` | 新增 `@borrows fn typedExprTypeArenaBuiltinHeadApply(value: TypedExprTypeArena, typeId: int32): bool`：**唯一**形状判据 `TypeApply + symbolIds == -1 + childCount ≥ 1 + child[0] 是 Scalar 行`（逐字等于原 payload 段的内联测试） |
| 2 | bracket 臂头部（`@@ -9330`）→ 新 `:9363-9379` | 先算一次 `let builtinHeadApply = typedExprTypeArenaBuiltinHeadApply(value, typeId)`；声明臂条件改为 `semanticKind == Apply && !builtinHeadApply` |
| 3 | **声明体之后、FixedArray 臂之前**（`@@ -9490`）→ 新 `:9533-9568` | 新增 `elif semanticKind == Int32(TypedExprStructuralTypeApply):` —— **内建臂**：要求 `parserKind == BracketApply`；`builtinArity = 封闭表(headScalarKind)` 必须 `> 0`；`applyChildCount == builtinArity + 1`；`bracketArgCount == builtinArity`；每个 bracket 参数的 TypeSyntax 节点必须是本行的第 `offset+1` 个子节点、且其 TypeId 必须等于 `children[offset+1]`。判词带坐标 `row= builtin_arity= bracket_args= apply_children=` |
| 4 | payload 段（`@@ -10260`）→ 新 `:10333-10344` | 内联的 12 行形状测试换成同一个谓词调用（`var builtinHeadApply` → `let builtinHeadApply`），`(symbolic && !builtinHeadApply && …)` 一行未动 |

**为什么第 3 步的插入点是要害（本席自己踩过一次，必须留痕）**：新臂**不能**插在"声明臂头部与声明体之间"。第一版生成器就是那么插的 —— 应用后 153 行的声明体（`let semanticChildStart` 起）**被重新挂到新的 `elif` 下**，声明臂只剩 4 行。本席在 scratch 树上 `sed` 复核时抓到，遂把新臂移到声明体**结束之后**、`elif …FixedArray` **之前**。生成器现在带**结构性断言**：目标文本里必须按序出现 `if semanticKind == Apply && !builtinHeadApply` → `let declarationRoot` → `specialization receipt drift` → `elif semanticKind == Apply:` → `let builtinHeadChildStart` → `elif semanticKind == FixedArray:`，且内建臂切片内不得出现 `let declarationRoot` / `let semanticChildStart`。

**为什么这样不是"放宽"（三条硬判据一条没丢）**
- 声明应用：条件、判词、后续 153 行权威校验**逐字未动**；`symbolId < 0 || symbolId >= symbolCount` 仍在。
- 内建应用：**新增**正向验证（封闭表 arity + 括号实参 CSR + 子节点身份），比原来的"只要 `symbolId ≥ 0`"更具体；`builtinArity <= 0` 会硬失败 ⇒ 非构造器标量头**依然被拒**。
- 两者的分派依据是**唯一的**那个形状谓词（TypeApply + symbolId == -1 + child[0] 是 Scalar 行），不是"看着像就放过"。

**逐位不变自证（生成器自检 + 静态论证）**

| 自检 | 结果 |
|---|---|
| 锚点唯一性（4 处，每处 `occurrences == 1`，否则 exit 2） | OK |
| **删除集精确匹配**（11 条，逐条列出） | 无 `elif`/`else` 行被删；无注释以外的结构行 |
| **独立 hunk 重放**（重放到原文，与内存目标逐字节比对） | `orig=5d728232… → target=425bc82f…`，**逐字节相同** |
| **链结构性断言** | 见上（`if/elif` 顺序 + 内建臂切片纯净性 + 声明体尾行计数不变） |
| `if|elif|else` 计数 | `if 879→882 (+3)`、`elif 63→64 (+1)`、`else 23→23 (+0)`。+3 = 新谓词体内两个 `if` + 内建臂的 `parserKind` 守卫；+1 = 新 `elif`。**没有任何既有分支头被删或被重挂**（顺序断言已证） |
| 新增绑定 | 恰 8 个，全为 `let`：`headChildCount`、`headTypeId`（谓词体内）；`builtinHeadApply`（**两处**，bracket 臂与 payload 段各一）；`builtinHeadChildStart`、`builtinHeadTypeId`、`builtinArity`、`builtinApplyChildCount`、`builtinArgTypeSyntaxNode`（内建臂）。全部**先声明后使用**；`var builtinHeadApply` 由 1 个降为 **0**（改为 `let`） ⇒ 无"引用后面才声明的 let/var" |
| 括号平衡 | `(`/`)` `2649→2669` 同增 20、`[`/`]` `1159→1164` 同增 5、`{`/`}` `234→241` 同增 7（后者 = 两条新 `Fmt"` 里的 `{row}`/`{builtinArity}`/`{bracketArgCount}`/`{builtinApplyChildCount}`/`{builtinArgOffset}` 共 7 对花括号） |
| **`@borrows` 自查** | 新谓词 `typedExprTypeArenaBuiltinHeadApply` 形参 `value` 非 var ⇒ **已加 `@borrows`**；它的两个调用点 `typedExprTypeArenaValidateTypeSyntaxRec`（`:9097-9098 @borrows`）与 `TypedExprTypeArenaStrictValidateInto`（`:9517-9518 @borrows`）都是 `@borrows`，借用在场；新调用的 `typedExprTypeArenaBuiltinConstructorArity`（无 `@borrows`、形参是枚举值非借用）与 `typedExprTypeArenaSyntaxChildAt`（`@borrows`）、`typedExprTypeArenaInt32At`（`:1648-1649 @borrows`）都有既有同形先例 ⇒ 不会触发 `borrowed actual cannot bind non-var non-@borrows formal` |
| 引用计数 | `fn typedExprTypeArenaBuiltinHeadApply(` 恰 1（定义）；`typedExprTypeArenaBuiltinHeadApply(value, typeId)` 恰 2（bracket 臂 + payload 段）；`builtinHeadApply` 恰 4（2 定义 + 谓词条件 + payload 的 `symbolic` 子句）；`elif semanticKind == …FixedArray:` 恰 1（未被打扰） |

**为什么不会让无关输入变化（byte-neutrality）**
1. **谓词是纯读**：`typedExprTypeArenaBuiltinHeadApply` 只读 `typeCount / typeKinds / symbolIds / childCounts / childTypeIds / childStarts`，不写任何列、不做 `intern`、不改变遍历顺序 ⇒ 对**所有**输入，派发结果只取决于 arena 内容。
2. **第 2 处改动是逐字等价提取**：payload 段的旧内联测试与新谓词体读的是同一个 `typeId` 的同样五列；旧测试的短路条件 `kind == Apply && symbolId == -1 && childCount >= 1` 与新谓词的次序一致，且新谓词多加的 `value == nil` / `typeId ∈ [0, typeCount)` 两个前置在该调用点**恒真**（`StrictValidateInto` 开头已硬判 `value == nil`；`typeId` 是该循环的界内变量）⇒ 同一 `builtinHeadApply` 取值。
3. **第 3 处新增的臂只在"该行语义是 Apply 且被判为内建头"时进入**，而生产者只在 `typedesc`/`set` 上产生这种行；对这些行旧代码**直接硬失败**，不存在需要保住的旧产物。
4. **对不含该形态的输入**（即所有 `Apply` 都是声明权威的输入，含四件定长数组正例与既有 rc=0 夹具）：`builtinHeadApply` 恒为 false ⇒ 声明臂条件等价于原条件、条件体逐字未动、内建臂**永不进入** ⇒ **逐语句等价**，`artifactRaw32`/CID 逐位不变。

**落补丁的方法（可复现，未碰仓库源文件本体）**：生成器 `.rebuild/s1b_step3/r9/patchgen/generic_application_origin_gen.py` 读真实源文件、做 **4 处精确字符串替换**（每处断言 `occurrences == 1`，否则 exit 2），`difflib.unified_diff` 生成补丁，并**独立重放** hunk 到原文与内存目标逐字节比对。仓库源文件 `git hash-object` 前后均为 `e081dcc1…`（**未被写入**）。
**冻结**：`.rebuild/s1b_step3/r9/patchgen/generic_application_origin_builtin_head.frozen.patch`，与 `patches/generic_application_origin_builtin_head.patch` `cmp` 逐字节相同，`sha256=bfa3f1000819f15e90bf6744c59c36b0e23f03db6c93d5e3009958d1976b9645`（8,039 B）。
**不覆盖**：前三枚 `1c0f20da…` / `7e0e2af3…` / `be1ce4bf…` 均**原样保留**。**`git apply --check` = 0**（基线 = 当前工作树）。**未 apply、未编译。**

## 17.5 未测项（诚实清单）

| # | 未测项 | 判别方式 |
|---|---|---|
| 1 | **未运行任何编译**（硬纪律）；全部为 `read`/`grep`/`python3` 静态读数 | 烤炉 |
| 2 | **判词不带坐标**：钉到 `system.cheng:2723 / :2817` 靠"全仓 Apply 消费者普查 + `typedesc[`/`set[` 全域枚举 + r13/r14 前序判词的 `producer_source=10 name=typedesc/set` 坐标交叉印证"，**没有**逐行 dump | 给 `:9338` 判词补 `row=`/`type_id=` 坐标；或加一条 `csg_mem tag=builtin_apply_origin row=N` |
| 3 | **上轮 §16.6 的预登记未被证实也未被推翻**：本炉报的是**另一条**判据（`generic application origin invalid`），不是 `generic resolution receipt row invalid` ⇒ §16.6 关于"泛型收据列天然升序、不进重放"的推论**仍未测**。如实记档 | 需要一炉真正走到 `:9851-9852` |
| 4 | **`compiler_snapshot_builder.cheng:13952` 的第三份副本未收敛**：它的开口比本文件宽（只查 `child[0]` 是 Scalar，**不查 `symbolId == -1`**）。三份副本开口各不相同，正是本堵的成因；但它在另一文件、当前可用，且收窄它属于**加严**（会拒掉它今天接受的形状），本轮**不动** | 见 §17.6 |
| 5 | `typed_expr_type_arena.cheng:6296`（object 基 `symbolIds ≥ 0`）**不可达性**只由"11 源零 `ref object`/`object of`"支持；若闭包变化需复查 | 换含 `ref object of X` 的夹具 |
| 6 | 内建臂新增的正向验证（`builtinArity <= 0` 拒绝非构造器标量头）**比 payload 段更严**：对 `Apply(-1, head=Scalar(非构造器))` 这类**生产者造不出**的畸形，两处会给出不同判词（本处拒绝、payload 段接受）。本轮选择"本处更严"而非"两处齐平"，因为它只影响畸形输入 | 造畸形夹具（当前不可造） |
| 7 | 修复后下一道墙未测 | 见 §17.6 |

## 17.6 建议（下一轮的口子）

1. **收敛三份副本**：把 `compiler_snapshot_builder.cheng:13952` 的 `builtinApplyHead` 也换成 `typearena.TypedExprTypeArenaBuiltinHeadApply(...)`（跨模块调用合法）——但那是**加严**，要先证明该投影里不存在 `Apply(-1, 非构造器标量头)` 的合法输入。本席**未做**，留作独立一轮。
2. **判词补坐标**：`:9338` 与 `:9360`、`:9328` 等同族判词都不带 row/type_id，本轮定位全靠排除法。加坐标是纯收益。

**§15.5 的挂起未动**：`semantic_snapshot_declaration_identity.cheng:139-148` 本轮**依然未改**（三问未答）。

---
---

# §18 第五堵：`typed expr type arena: trait rule or premise drift`（`kd_r25`）

只读源码 + 定位 + 落补丁；**全程未运行任何编译/烤制/lldb**（2026-09-12 05:2x 起）。
取证：`.rebuild/s1b_step3/r9/fixtures_r25.txt`。锚定哈希（本席读文件时的工作树）：`src/core/lang/typed_expr_type_arena.cheng`（11,251 行，`git hash-object = a330ccda…` = §14–§17 四补丁均已 apply 态）/ `src/core/csg_core/compiler_snapshot_schema.cheng`。

## 18.0 结论先行（含对"第一优先假设"的核实结果）

1. **判词点**：`src/core/lang/typed_expr_type_arena.cheng:10485`，函数 `TypedExprTypeArenaStrictValidateInto`（`:9591`）的 trait 段。**判相核实**：前缀 ` compiler csg: TypeArena production failed: `**不带 `source_index`** ⇒ `compiler_csg.cheng:36012` 变体 ⇒ **seal 相**（链 `:36014 SealInto → typed_expr_type_arena:8832 StrictValidateInto → :10485`）。与 §16/§17 同相、同变体。
2. **假设核实结果（重要更正）**：**"三处镜像里有一处没改全" 被证伪 —— 那三处全都改了、且当前互相一致**。真正的漏改是**第四份副本**：`StrictValidateInto` 自己的 `expectedSend/expectedSync` 投影（`:10391-10399`）。它只把 `cstring` 列为例外（`if scalarKind != TypedExprStructuralScalarCString:`），而合法例外集是 `{str(托管), cstring, ptr, typedesc}` ⇒ 每个 **`ptr`** 行与每个 **`typedesc`** 行都比其余三处**差一个 bit**。
3. **范围比预想大**：这一处**漏了两次改** —— `patches/ptr_builtin_type_arena_representation.patch` 那轮（`grep` 证据：该补丁**没有**碰 `expectedSend/expectedSync`）与 `patches/builtin_type_constructor_arity.patch` 那轮，都没更新它。所以 `ptr` 从那轮起就一直在漂。
4. **先炸的是 `ptr` 不是 `typedesc`**：校验器按 `typeId` 升序走。`ptr` 首次出现在**源 3**（`src/std/crypto/sha256.cheng`，`grep -c '\bptr\b'` = 7；源 3 的 `fn cheng_crypto_sha256_compress_block(state: ptr, block: ptr, k256: ptr)` 是类型位），`typedesc`/`set` 在**源 10**（`system.cheng`）⇒ `ptr` 行的 typeId 更小、**先命中**。**只修 `typedesc` 不够，必须两个一起修**。
5. **判定：(b) 判据（期望值投影）取值域窄于合法域**，**(c)** 是可达时序。**不是 (a)**：生产者是对的 —— 规范 `docs/cheng-formal-spec.md` §0.3 逐字写着 "`T*`/`void*` 与 FFI 句柄默认 `!Send/!Sync`"，且**另三处**（生产者、定点重算、可移植镜像）在此规则上**三方一致**。
6. **与前几堵的关系**：与 §16（收据次序）**不同根**；与 §14/§15/§17 **同一抽象族**（"判据/期望值的取值域窄于合法域"），其中**与 §17 同机制**（同一条规则的多份副本，漏改其一），但是**不同谓词、不同文件、不同规则**。名字域修法、内建头修法对本堵都**无效**。
7. **修法已落**：`patches/scalar_send_sync_single_source.patch`（1 文件 / 4 hunk / `+40 −16`）。冻结副本 `.rebuild/s1b_step3/r9/patchgen/scalar_send_sync_single_source.frozen.patch`，`cmp` 逐字节相同，`sha256=00337316cf09f113cce07ea81be27eb2dcce72dbf825d69f715bc327927f5c98`（5,143 B）。`git apply --check` = 0（基线 = **当前工作树**，已含前四枚）。**未 apply、未编译。**

## 18.1 判据链（逐项 + 依赖列）

判词点（`typed_expr_type_arena.cheng:10481-10486`，trait 段末尾）：

```
        if rule != expectedRule || managed != expectedManaged ||
           send != expectedSend || sync != expectedSync ||
           managed != derivedManaged[typeId] ||
           send != derivedSend[typeId] || sync != derivedSync[typeId]:
            err = " typed expr type arena: trait rule or premise drift"
            return false
```

| # | 子条件 | 左值来源 | 右值来源 |
|---|---|---|---|
| 1 | `rule != expectedRule` | `traitRuleKinds[typeId]`（生产相写） | 本函数 `:10387-10480` 的 `expectedRule` 投影 |
| 2 | `managed != expectedManaged` | `managedFlags[typeId]` | 同上 `expectedManaged` |
| 3 | **`send != expectedSend`** | `sendFlags[typeId]` | 同上 `expectedSend` |
| 4 | **`sync != expectedSync`** | `syncFlags[typeId]` | 同上 `expectedSync` |
| 5 | `managed != derivedManaged[typeId]` | `managedFlags[typeId]` | `typedExprTypeArenaComputeTraitFlags` 定点重算 |
| 6 | `send != derivedSend[typeId]` | `sendFlags[typeId]` | 同上 |
| 7 | `sync != derivedSync[typeId]` | `syncFlags[typeId]` | 同上 |

循环上界 `value.typeCount`（`for typeId in 0..<value.typeCount`）。

**哪一个成立了**：对 Scalar 行，
- 生产相（`Intern:1265-1270`）：`send = sync = k ∉ {CString, Ptr, Typedesc}`（`str` 走上一个分支，`send/sync` 保持 false）。
- 定点重算（`ComputeTraitFlags:1715-1719`）：`k ∉ {CString, Ptr, Typedesc} ⇒ send=sync=1`。
- 可移植镜像（`compiler_snapshot_schema.cheng:5880-5884`）：`sendOut = syncOut = k ∉ {Str, CString, Ptr, Typedesc}`。
- **本处投影（`:10391-10399`）**：
```
            if scalarKind == TypedExprStructuralScalarStr:
                expectedRule = TypedExprTypeTraitRuleManagedString
                expectedManaged = 1
            else:
                expectedRule = TypedExprTypeTraitRulePlainScalar
                if scalarKind != TypedExprStructuralScalarCString:   # ← 只排除了 cstring
                    expectedSend = 1
                    expectedSync = 1
```
逐 kind 对表（`expected*` 声明为 `var ...: int32`，默认 0）：

| scalarKind | 生产 `send/sync` | 重算 | 可移植 | **本处 `expected`** | 结论 |
|---|---|---|---|---|---|
| `str` | 0 / 0（managed=1） | 0 / 0 | 0 / 0 | 0 / 0 | ✓ |
| `cstring` | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | ✓ |
| **`ptr`** | **0 / 0** | **0 / 0** | **0 / 0** | **1 / 1** | ✗ **子条件 3/4 命中** |
| **`typedesc`** | **0 / 0** | **0 / 0** | **0 / 0** | **1 / 1** | ✗ 子条件 3/4 命中 |
| `set` | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | ✓ |
| 其余标量 | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | ✓ |

⇒ **恰两类漂移：`Ptr` 与 `Typedesc`**；子条件 5/6/7（`derived*`）**不命中**（生产与重算一致 ⇒ `send == derivedSend`），命中的是 **3/4（`expected*`）**。

## 18.2 定位：结构性排除 + 全域枚举

**第一步：判相与函数**（§18.0 第 1 条）——前缀无 `source_index` ⇒ seal；`:10485` 在 `StrictValidateInto` 内；它是唯一带此判词文本的位置（全仓 `grep "trait rule or premise drift"` 只有 `:10485` 与两处注释引用 `:1263/:1264`；另一条检测器 `type trait conclusion mismatch` 在 `compiler_snapshot_schema.cheng:6007`，本炉**未**报）。

**第二步：trait 规则的"份数"普查**（`grep -rn "sendFlags\|sendOut\|syncFlags\|syncOut" src/`）——除本文件外，`compiler_snapshot_builder.cheng` / `compiler_csg.cheng` 的 20 余处**全是列的搬运与相等性核对**（`:14529-14537` 从 arena 拷进表、`:16615-16623`/`:25923-25924`/`:35515-35521` 逐行比对、`:16350-16351` 是**函数签名合成行**的 false/false/false，与可移植镜像的 `CsgCompilerTypeFunction` 分支一致）⇒ **没有第五份"规则"**。规则的副本恰为四处：生产 / 重算 / 本处投影 / 可移植镜像。

**第三步：钉到具体标量种类**——由 §18.1 的表直接得出 `{Ptr, Typedesc}`，**不需要**猜测源或声明。

**第四步：谁先炸**。校验器按 `typeId` 升序走；typeId 按 append 序单调递增（源 `orderedSources` 升序、源内行序）。`ptr` 的 11 源分布（`grep -c "\bptr\b"`）：

```
0 binary_types  0 bytes_layout  7 sha256(源3)  9 rawbytes(源4) 28 rawmem_support(源5)
0 result  15 seqs(源7)  7 strings(源8)  15 strutils(源9)  93 system(源10)
```
`sha256.cheng` 的 `fn cheng_crypto_sha256_compress_block(state: ptr, block: ptr, k256: ptr)`（`:209`）就是类型位 ⇒ **首个 `Ptr` 标量行来自源 3**，而 `typedesc`/`set` 只在**源 10**（`system.cheng:2723` / `:2817`，§17.2 已枚举）⇒ **`ptr` 先命中**。故本堵的"触发形态"是 **`ptr` 类型行**；`typedesc` 紧随其后。

## 18.3 判定：(b) 期望值投影取值域窄于合法域

| 候选 | 判定 | 证据 |
|---|---|---|
| **(b) 判据过严** | **成立（主判）** | 规则的四份副本里**三份一致、一份更窄**；更窄的那份是**校验器自己重算的期望值**，而它比对的左值来自生产相 ⇒ 一旦更窄就以 `trait rule or premise drift` 形式炸 |
| (a) 生产者真缺口 | **排除** | ① 规范 `docs/cheng-formal-spec.md` §0.3 逐字："`T*`/`void*` 与 FFI 句柄默认 `!Send/!Sync`" ⇒ `ptr`/`cstring` = !Send/!Sync 是**规范事实**；② `typedesc` 是**被擦除的类型见证**，`managed/send/sync` 三值全 false 是设计；③ 三份独立副本一致 ⇒ 生产相无缺口 |
| (c) 既有潜伏被上游修复暴露 | **成立（可达时序，不是根因）** | 该投影自 `ptr` 那轮起就窄（`patches/ptr_builtin_type_arena_representation.patch` **未**触碰 `expectedSend/expectedSync`，`grep` 证据），但这条 seal 自校验链此前每炉死在更早的墙（§14–§17 四堵）⇒ 第一次被走到 |

**与已修四堵的关系**
- vs **§16（收据次序）**：**不同根**（那是"有序列的写入时机被拆到两相"）。
- vs **§14/§15（名字域）、§17（泛型应用起源）**：**同一抽象族**（"判据/期望值的取值域窄于合法域"）；其中**与 §17 同机制** —— 都是"同一条规则存在多份副本，域扩大时漏改其一"。但**不同谓词、不同规则、不同文件**：名字域的 `TokenCanName` 修法、§17 的 `BuiltinHeadApply` 修法对本堵**均无效**，本补丁也不碰它们。

## 18.4 修法（**补丁已落**：`patches/scalar_send_sync_single_source.patch`）

**补丁基**：工作树 `src/core/lang/typed_expr_type_arena.cheng`（§14–§17 四补丁均已 apply，`git hash-object = a330ccda…`，11,251 行）。包内 `*.patch` 被 `.gitignore:229` 忽略，**未 commit**。
**改动量**：1 文件 / 4 hunk / `+40 −16`。**16 条删除逐条列出**（8 条旧注释 + 生产者两条 `send`/`sync` 表达式各 3 行 + 重算的 `elif` 3 行 + 本处投影的 `if` 1 行；**无 `else` 行、无控制流结构行**）：

```
-            # [builtin-ctor] `typedesc` is a type witness whose value is      (旧注释 8 行)
-            …  `trait rule or premise drift`.
-            send = scalarKind != TypedExprStructuralScalarCString &&          (生产者)
-                   scalarKind != TypedExprStructuralScalarPtr &&
-                   scalarKind != TypedExprStructuralScalarTypedesc
-            sync = …（同上 3 行）
-            elif scalarKind != TypedExprStructuralScalarCString &&            (重算)
-                 scalarKind != TypedExprStructuralScalarPtr &&
-                 scalarKind != TypedExprStructuralScalarTypedesc:
-                if scalarKind != TypedExprStructuralScalarCString:            (本处投影 ← 墙)
```

**修法一句话**：把标量 Send/Sync 规则收敛成**一个具名谓词**，本模块的三处消费者全部改读它（可移植镜像在另一模块、另一套 kind 枚举，其表达式本来就与谓词逐字等价，不改）。

| # | 落点（旧行 → 补丁后行） | 内容 |
|---|---|---|
| 1 | `typedExprTypeArenaBuiltinHeadApply` 之后（`@@ -1118`）→ 新 `:1121-1145` | 新增 `@borrows fn typedExprTypeArenaScalarSendable(scalarKind): bool`：`k != Str && k != CString && k != Ptr && k != Typedesc`。注释**明确列出四处站点**（生产 `Intern` / 重算 `ComputeTraitFlags` / 本处 `expected*` 投影 / 可移植 `csgCompilerTypeTraitsDerivedInto`），并**逐字保留两条检测器判词** `type trait conclusion mismatch` / `trait rule or premise drift` 作为"某处不再一致"的报警口径 |
| 2 | 生产相 `Intern`（`@@ -1254`）→ 新 `:1275-1288` | `send`/`sync` 两条内联合取换成谓词调用；注释同步更新为"**四处**" |
| 3 | 定点重算 `ComputeTraitFlags`（`@@ -1712`）→ 新 `:1731-1734` | `elif scalarKind != CString && != Ptr && != Typedesc:` → `elif typedExprTypeArenaScalarSendable(scalarKind):` |
| 4 | **本处投影（墙）**（`@@ -10394`）→ 新 `:10411-10423` | `if scalarKind != TypedExprStructuralScalarCString:` → `if typedExprTypeArenaScalarSendable(scalarKind):`，并加注释说明"这是**第四份**副本，过去只列 `cstring` ⇒ `ptr`/`typedesc` 各差一 bit" |

**为什么不是"放宽"**
- 三处替换都是**逐字等价**：谓词 = `k ∉ {Str, CString, Ptr, Typedesc}`；三处旧表达式所在分支都已在更外层排除了 `Str`（生产相 `if k == Str:` / 重算 `if k == Str:` / 本处 `if k == Str:` 的 `else`）⇒ 加不加 `!= Str` 结果相同。**对既有通过输入，四个 kind 的取值一字不变。**
- 本处投影的取值集合从 `{CString}`（旧，错的）修正为 `{Str, CString, Ptr, Typedesc}`（与另三处一致）⇒ 是**把更窄的域拓宽到规范域**，不是放宽守卫：四条判据一条未删，判词文本一字未改。
- 谓词的残留在文件里被生成器**强制唯一**：`scalarKind != …Scalar{CString,Ptr,Typedesc}` 三个探针在目标文件里**各恰出现 1 次**，且必须落在谓词体内 ⇒ **不可能再出现第五份内联合取**。

**逐位不变自证（生成器自检 + 静态论证）**

| 自检 | 结果 |
|---|---|
| 锚点唯一性（4 处，每处 `occurrences == 1`，否则 exit 2） | OK |
| **删除集精确匹配** | 恰 16 条，逐条列出；无 `else` 行；仅有的两条 `if/elif` 删除行**就是被替换的两行判断头本身** |
| **独立 hunk 重放**（重放到原文，与内存目标逐字节比对） | `orig=425bc82f… → target=0cf16ae1…`，**逐字节相同** |
| **`if|elif|else` 计数** | `if 882→882 (+0)`、`elif 64→64 (+0)`、`else 23→23 (+0)` —— **分支结构零变化**（只换判断表达式，不增删分支） |
| 新增绑定 | **零个**（无新 `let`/`var`）；谓词无局部量 |
| 括号平衡 | `(`/`)` `2669→2679` 同增 10、`[`/`]` `1164→1166` 同增 2、`{`/`}` `241→241` 不变（新增文本里唯一的花括号在 `` `uint64(s)` `` 注释行内——计数未变，说明该行被 difflib 判为上下文） |
| **`@borrows` 自查** | 谓词形参是**枚举报值**（非借用），仍显式加 `@borrows`（与同族纯判据 `ParserValueExprTokenCanName`、`typedExprTypeArenaBuiltinHeadApply` 同例）；三个调用点 `Intern`（`:1201-1202 @borrows`）、`ComputeTraitFlags`（`:1695-1696 @borrows`）、`StrictValidateInto`（`:9590-9591 @borrows`）**全部是 `@borrows`**，借用在场 ⇒ 不会触发 `borrowed actual cannot bind non-var non-@borrows formal` |
| 残留规则副本 | 三个合取探针各恰 1 次，且都在谓词体内 |

**为什么不会让无关输入变化（byte-neutrality）**
1. 三处替换是**纯等价提取**：谓词是 `scalarKind` 上的纯函数，不读写 arena、不改遍历顺序、不改分支结构（`if/elif/else` 计数零变化）⇒ 对**所有**输入，`sendFlags`/`syncFlags` 的每一个写入值与写点位置都不变。
2. 本处投影**只改接受/拒绝判断**，不写任何列 ⇒ 不参与 `artifactRaw32`/CID。
3. ⇒ **对既有通过输入（含四件定长数组正例与全部 rc=0 夹具）：`sendFlags`/`syncFlags` 列逐位不变，`typeArenaArtifactCid` 及派生 CID 逐位不变。**
4. 对含 `ptr`/`typedesc` 的输入：改前**直接硬失败、不产 artifact**，不存在需要保住的旧字节。改后三处取值一致 ⇒ 判据 3/4 不再误报。

**落补丁的方法（可复现，未碰仓库源文件本体）**：生成器 `.rebuild/s1b_step3/r9/patchgen/scalar_send_sync_gen.py` 读真实源文件、做 **4 处精确字符串替换**（每处断言 `occurrences == 1`，否则 exit 2），`difflib.unified_diff` 生成补丁，并**独立重放** hunk 到原文与内存目标逐字节比对。仓库源文件 `git hash-object` 前后均为 `a330ccda…`（**未被写入**）。
**冻结**：`.rebuild/s1b_step3/r9/patchgen/scalar_send_sync_single_source.frozen.patch`，与 `patches/scalar_send_sync_single_source.patch` `cmp` 逐字节相同，`sha256=00337316cf09f113cce07ea81be27eb2dcce72dbf825d69f715bc327927f5c98`（5,143 B）。
**不覆盖**：前四枚 `1c0f20da…` / `7e0e2af3…` / `be1ce4bf…` / `bfa3f100…` 均**原样保留**。**`git apply --check` = 0**（基线 = 当前工作树）。**未 apply、未编译。**

## 18.5 未测项（诚实清单）

| # | 未测项 | 判别方式 |
|---|---|---|
| 1 | **未运行任何编译**（硬纪律）；全部为 `read`/`grep`/`python3` 静态读数 | 烤炉 |
| 2 | 判词**不带坐标**：`typeId`/`scalarKind` 未落进判词。"先炸的是 `ptr`"由"源 3 有 `ptr` 类型位、源 10 才有 `typedesc`、校验器按 typeId 升序"推出，**未逐行 dump** | 给 `:10485` 判词补 `type_id= kind= scalar= rule= managed= send= sync= expected…=`；或加 `csg_mem tag=trait_drift_first` |
| 3 | **可移植镜像未在本炉被验证**：`type trait conclusion mismatch`（`compiler_snapshot_schema.cheng:6007`）本轮**没有**出现，只说明它没在 seal 之前被走到，**不代表**它已与本改动一致 | 需要一炉走到 portable 校验 |
| 4 | 三处"逐字等价"是**静态核对**（外层 `if k == Str` 已排除 Str），未做字节对拍 | 三件 rc=0 夹具 + 既有 `kd_*` 侧 sha 逐字相同 |
| 5 | `compiler_snapshot_builder.cheng:16350-16351` 的合成函数签名行 `send/sync = false` 未逐一核对"是否也该由谓词派生"——本轮判定它是签名行而非标量行（与可移植镜像的 `CsgCompilerTypeFunction` 分支一致） | 需要一次该行的来源读数 |
| 6 | 修复后下一道墙未测 | 见 §18.6 |

## 18.6 预登记（下一堵的候选）

按源码顺序，seal 相的 `StrictValidateInto` 在 `:10485` 之后继续走 member/CSR/继承/依赖/SCC 各段，之后是 `:10630` 一带的 exact resolution receipt 与 `:10639` 的 `artifact CID mismatch`。**§16.6 的泛型收据升序（`:9851-9852`）仍未测**（§17 已记一次，本炉又直接跳到别的判据 —— 那条推论**既未证实也未推翻**，第三次记档）。**§17.6 的两条建议（收敛 `compiler_snapshot_builder.cheng:13952` 的第三份内建头副本、给判词补坐标）依然有效**，其中"补坐标"在本轮又一次成为定位成本的来源。

**§15.5 的挂起未动**：`semantic_snapshot_declaration_identity.cheng:139-148` 本轮**未改**（三问未答）。

---
---

# §19 第六堵：`typed expr type arena: alias member shape drift`（`kd_r26`）

只读源码 + 定位 + 落补丁；**全程未运行任何编译/烤制/lldb**（2026-09-12 05:4x 起）。
取证：`.rebuild/s1b_step3/r9/fixtures_r26.txt`。锚定哈希（本席读文件时的工作树）：`src/core/lang/typed_expr_type_arena.cheng`（11,320 行，`git hash-object = f9022223…` = §14–§18 五补丁均已 apply 态）。

## 19.0 结论先行

1. **判词点**：`src/core/lang/typed_expr_type_arena.cheng:10707`，函数 `TypedExprTypeArenaStrictValidateInto`（`:9609`）的 member 段。**判相核实**：前缀 ` compiler csg: TypeArena production failed: `**不带 `source_index`** ⇒ `compiler_csg.cheng:36012` 变体 ⇒ **seal 相**；链 `compiler_csg.cheng:36014 SealInto → typed_expr_type_arena:8790 SealInto → :8883 StrictValidateInto → :10707`。与 §16–§18 同相、同变体。
2. **判据**：该臂（`:10700`）的**两个析取项** `structuralKind != TypedExprStructuralTypeAlias || memberCount <= 0`。**失败的是第二项** —— 它要求**每个** alias 符号至少拥有一条 member 行。
3. **形态**：**普通别名（plain alias）** —— `type FrameKind = int32`、`type cstring = ptr`、`type seq_string = str[]`。这类声明根被 parser 包成 `ParserTypeSyntaxAlias`，符号的 `memberCount` **合法地为 0**。本夹具里首个 alias 符号是**源 0 `src/chain/binary_types.cheng:20 FrameKind = int32`**（按 (源序, 声明行序) 推定为 symbol 0）⇒ **判据在第一个符号上就炸**。（你的提示方向对：就是 `type X = <非 object>` 那一类。）
4. **多处独立证据说"普通别名零成员是合法的"**（见 §19.2），只有这一处判据说"必须 > 0" ⇒ **判定 (b) 判据过严**，**(c)** 是可达时序。
5. **与前几堵的关系**：与 §16（收据次序）**不同根**；与 §14/§15/§17/§18 **同一抽象族**（判据的取值域/存在性要求强于合法域）。**注意与 §18 的机制不同**：§18 是"同一规则多份副本、漏改其一"（多副本问题），本轮**不是**多副本问题 —— `grep` 证明 `alias member shape drift` 全仓**只有这一处**，是**单点判据写错**。故本轮没有"收敛为谓词"的余地，做的是**删掉那个为假的析取项**。
6. **修法已落**：`patches/alias_zero_member_shape.patch`（1 文件 / **1 hunk** / `+17 −2`）。冻结副本 `.rebuild/s1b_step3/r9/patchgen/alias_zero_member_shape.frozen.patch`，`cmp` 逐字节相同，`sha256=b15e9807d8b88cf901d9183075c44ca64231dddfb14577c576be5b84df596c39`（1,913 B）。`git apply --check` = 0（基线 = **当前工作树**，已含前五枚）。**未 apply、未编译。** 生成器全程**只读**工作树，只写 `patches/` 新文件与冻结副本 ⇒ **共享文件零接触**。

## 19.1 判据链（逐项 + 依赖列）

判词点（`typed_expr_type_arena.cheng:10700-10708`）：

```
        elif aliasDeclaration:
            # [phaseB-parser] alias 包裹 tuple 的具名元素 member 行校验：…
            if structuralKind != Int32(TypedExprStructuralTypeAlias) ||
               memberCount <= 0:
                err = " typed expr type arena: alias member shape drift"
                return false
```

| 项 | 子条件 | 依赖列 / 表 | 取值来源 |
|---|---|---|---|
| 前置 | `aliasDeclaration` | `typeSyntaxParserKinds[root]`（`:10574-10575`） | `aliasDeclaration = parserKind == parser.ParserTypeSyntaxAlias` |
| 1 | `structuralKind != TypedExprStructuralTypeAlias` | `typeKinds[typeSyntaxTypeIds[root]]`（`rootTypeId`） | `InternSyntaxRec` 的 `ParserTypeSyntaxAlias` 臂 `:7915-7924` |
| 2 | **`memberCount <= 0`** | `symbolMemberCounts[symbolId]`（`:10523`） | `RealizeDeclarationsRec` 在跑声明体**之前**置 0，随后只有 `BuildObjectDeclaration` / `BuildEnumDeclaration` / `BuildTupleAliasMembers` 会把它写大 |
| 循环 | `for symbolId in 0..<value.symbolCount`（`:10518`） | `symbolCount` | 按 (源序, 声明行序) |

上游夹持：`:10559` `memberStart != memberCursor || memberCount < 0 || memberStart + memberCount > value.memberCount`（CSR 合法性；`memberCount == 0` 合法通过）。

**为什么失败的是第 2 项（排除第 1 项）**：对任何 `type X = <非 object/enum>`，`AppendTypeSyntaxRootInto`（`aliasDeclaration = true`）会把解析出的根**包成 `ParserTypeSyntaxAlias` 节点**（`parser.cheng:19205-19220`：`parsedKind` 不是 Object/RefObject/Enum/Algebraic 时套一层 Alias），而 `InternSyntaxRec` 的 Alias 臂按 `TypedExprStructuralTypeAlias` 铸造该行的 TypeId ⇒ `structuralKind == Alias` **恒真**。⇒ 只剩第 2 项。

**为什么第 2 项会成立**：普通别名**没有字段声明 root** ⇒ `IndexFieldsSourceInto` 不给它分配 field 行 ⇒ `fieldCountsByDeclarationRoot[root] == 0` ⇒ `BuildTupleAliasMembers` 在 `:2508-2511` **直接成功返回、零成员**；`symbolMemberCounts[symbolId]` 保持预置的 `0` ⇒ `memberCount <= 0` 为真 ⇒ **判词**。

## 19.2 定位：独立证据 + 全域枚举（钉到 `type X = <标量/序列>`）

判词不带坐标。这一堵的证据链**几乎全是源码内的逐字表述**：

| # | 站点 | 逐字证据 | 含义 |
|---|---|---|---|
| E1 | `typed_expr_type_arena.cheng:2508-2511`（`BuildTupleAliasMembers`） | `if fieldCount <= 0:` / `err = ""` / `return true` | 零成员**直接成功**（生产者的合法出口） |
| E2 | `typed_expr_type_arena.cheng:8126-8130`（`RealizeDeclarationsRec` alias 臂注释） | "**普通别名（无字段声明 root）在本臂零成员直通**" | 明说普通别名零成员是设计 |
| E3 | `compiler_parser_receipt.cheng:4672-4678` | "`type N = tuple[a: T, ...]` 具名元素的字段声明 root 的 owner 是别名包裹 tuple 的声明根；**普通类型别名仍不得拥有字段声明**"，判据要求 alias 根**单子且子为 Tuple** | 普通别名**不得**有字段声明 ⇒ 即零成员 |
| E4 | `compiler_snapshot_schema.cheng:3920-3924` | "…alias-wrapping-tuple declaration root; **a plain alias to scalar/sequence still owns no field declaration**" | 同 E3，另一模块 |
| E5（旁证） | `typed_expr_type_arena.cheng:9253-9265`（`ValidateTypeSyntaxRec` 的 `topLevelTupleAliasOwner`） | 精确到「`originChildCounts == 1` 且 `firstOriginChild` 的 parserKind 是 `Tuple`」才认作 member owner | 普通别名（子为 `int32`/`str[]`/`ptr`）**被显式排除在 member owner 之外** |

**全域枚举（11 源里所有普通别名，逐字）**：

```
src/chain/binary_types.cheng:20   FrameKind   = int32
src/std/rawbytes.cheng:17         byte        = int32
src/std/seqs.cheng:224            seq_string  = str[]
src/std/system.cheng:4            cstring     = ptr
（strutils.cheng:25 FloatFormatMode = enum 与 system.cheng:25/38 的两个 = enum 是 enum，不走本臂）
```
**四个，全部零成员**。首个按 (源序, 声明行序) 是**源 0 的 `FrameKind`**（源 0 的 import/const 不产 TypeSyntax 声明根）⇒ 推定为 **symbol 0**，判据在第一个符号上即触发。
**反证**：11 源里 `grep "= tuple\[\|: tuple\["` **零命中** ⇒ 本闭包**根本不走 alias 的 member 校验路径**，只走零成员路径；这也解释了四件 `r8/r9_fixed_len_*` 正例为何能过这道守卫 —— 它们的夹具源里**没有任何别名**（`Slots =` 是 object，`UntypedCount = 6` 是 const）。

## 19.3 判定：(b) 判据过严（单点判据写错，**不是**多副本漏改）

| 候选 | 判定 | 证据 |
|---|---|---|
| **(b) 判据过严** | **成立（主判）** | §19.2 的 E1–E5：五处（含两处别模块）独立说明"普通别名零成员合法"，只有本判据说"必须 > 0" |
| (a) 生产者真缺口 | **排除** | 生产者的零成员出口是**显式设计**（E1 的 `err = ""` + `return true`，E2 的逐字注释）；给它硬造一条 member 行才是造假 |
| (c) 既有潜伏被上游修复暴露 | **成立（可达时序，不是根因）** | 守卫自 `[phaseB-parser]` 那轮就在；此前每炉死在更早的墙（§14–§18 五堵）⇒ 第一次被走到。且夹具从无别名 ⇒ 即使走到也未必触发 |

**与已修五堵的关系**
- vs **§16（收据次序）**：**不同根**（那是"有序列的写入时机被拆到两相"）。
- vs **§14/§15/§17/§18**：**同一抽象族** —— "判据的取值域/存在性要求**强于**合法域"。但**机制与 §18 不同**：§18 是*同一规则的第四份副本漏改*（多副本问题，修法是收敛为谓词），本轮是**单点判据**（`grep "alias member shape drift"` 全仓仅 `:10707` 一处；`grep "memberCount <= 0"` 仅两处，另一处是 enum 臂且**正确**）⇒ **没有可以收敛的多副本**，修法只能是**删掉那个为假的析取项**。不硬套"收敛为谓词"。
- 所有既有修法（`TokenCanName`、`BuiltinHeadApply`、`ScalarSendable`）对本堵**零作用**。

## 19.4 修法（**补丁已落**：`patches/alias_zero_member_shape.patch`）

**补丁基**：工作树 `src/core/lang/typed_expr_type_arena.cheng`（§14–§18 五补丁均已 apply，`git hash-object = f9022223…`，11,320 行）。包内 `*.patch` 被 `.gitignore:229` 忽略，**未 commit**。
**改动量**：1 文件 / **1 hunk** / `+17 −2`。**2 条删除逐条列出**（无注释行、无控制流结构行）：

```
-            if structuralKind != Int32(TypedExprStructuralTypeAlias) ||   # 去掉续行的 ||
-               memberCount <= 0:                                           # 为假的析取项
```

**修法一句话**：alias 臂的形状判据只保留**结构种类**一项；member 行的校验仍然**只对存在的 member 行**执行（`for memberOffset in 0..<memberCount:` 在 0 时是空循环）。

| 落点 | 旧行 → 补丁后行 | 内容 |
|---|---|---|
| alias 臂（`@@ -10702`） | `:10705-10706` → `:10721` | `if structuralKind != Alias \|\| memberCount <= 0:` → `if structuralKind != Alias:`；新增 16 行 `[alias-zero-member]` 注释，逐条引用 E1–E5 与四个普通别名，并**显式警告不得加"逆命题"**（见下） |

**为什么不是"放宽守卫"（三条论证）**
1. **被删的那一项是"假"的**，不是"严"的：它把生产者**显式设计**的合法出口（E1/E2）判成畸形。删它是纠错，不是放行。
2. **剩下的守卫性质未变**：`structuralKind != Alias` 仍在；`memberStart/memberCount` 的 CSR 合法性（`:10559`）仍在；**每一条 member 行**的九项 authority 校验（`:10722-10738`）逐字未动，且对存在的行照样执行。
3. **零成员时"没有东西可校验"是事实**，不是跳过：`memberCount == 0` 时 `for memberOffset in 0..<0` 空转，`memberCursor = memberCursor + 0` 不推进（`:10751`），下游 `memberCursor != value.memberCount` 的覆盖率校验（`:10752-10754`）仍成立。

**必须留痕的反向纪律（写进注释）**：**不得**把逆命题（"alias 包裹 tuple ⇒ 必须有成员"）加进来。`type T = tuple[int32, str]` **包裹 tuple 却是零成员** —— parser 只为**具名**元素铸字段声明 root（`AppendInlineTupleFieldDeclarations`："无名元素（tuple[int32, str]）不产字段声明行"）。本席第一版设计曾考虑加这条逆命题，核对后被自己否掉；注释里写明以免下一手再加。

**逐位不变自证（生成器自检 + 静态论证）**

| 自检 | 结果 |
|---|---|
| 锚点唯一性（1 处，`occurrences == 1`，否则 exit 2） | OK |
| **删除集精确匹配** | 恰 2 条，逐条列出；**无注释行、无 `elif`/`else` 行** |
| **独立 hunk 重放**（重放到原文，与内存目标逐字节比对） | `orig=0cf16ae1… → target=7c0d2fea…`，**逐字节相同** |
| **`if|elif|else` 计数** | `if 882→882 (+0)`、`elif 64→64 (+0)`、`else 23→23 (+0)` —— **分支结构零变化**（只缩短一个既有条件，不增删分支） |
| **结构性顺序断言** | 目标里必须按序出现 `if objectDeclaration:` → `elif enumDeclaration:` → `elif aliasDeclaration:` → `if structuralKind != …Alias:` → `var nameSlots: int32[]` → `elif memberCount != 0:`；且 **alias 臂守卫区（`elif aliasDeclaration:` 到 `var nameSlots`）内不得再出现 `memberCount`** |
| **enum 臂未被波及** | 目标里 `memberCount <= 0:` 仍**恰 1 处**（enum 臂的，正确：enum 必须有变体）；alias 臂已无 |
| 新增绑定 | **零个**（无新 `let`/`var`） |
| 括号平衡 | `(`/`)` `2679→2683` 同增 4、`[`/`]` `1166→1168` 同增 2、`{`/`}` `241→241` 不变 |
| **`@borrows` 自查** | 本补丁**不新增任何调用**（只删一个析取项 + 加注释）⇒ 无借用面变化，不可能触发 `borrowed actual cannot bind non-var non-@borrows formal` |

**为什么不会让无关输入变化（byte-neutrality）**
1. 改动**只在 seal 校验器内部**：不写任何列、不改遍历顺序、不改 `memberCursor` 推进、不改任何 `intern` 调用 ⇒ 对**所有**输入，arena 的每一列字节不变。
2. 对**有** member 行的 alias（`type N = tuple[a: T]`）：`memberCount > 0`，旧条件 `memberCount <= 0` 为假、新条件无此项 ⇒ **判定完全相同**，per-member 校验逐字执行。
3. 对**零** member 行的 alias：旧行为是**硬失败**（不产 artifact），新行为通过 ⇒ **不存在需要保住的旧字节**；这正是本墙要修的。
4. ⇒ 对既有通过输入（含四件定长数组正例与全部 rc=0 夹具）：`typeArenaArtifactCid` 及派生 CID **逐位不变**。

**落补丁的方法（可复现，共享文件零接触）**：生成器 `.rebuild/s1b_step3/r9/patchgen/alias_zero_member_gen.py` **只读**工作树（Python 以只读方式打开源文件），做 1 处精确字符串替换（断言 `occurrences == 1`，否则 exit 2），`difflib.unified_diff` 生成补丁，并**独立重放** hunk 到原文与内存目标逐字节比对。**不 `cp` 备份、不 apply、不写任何共享文件**；源文件 `git hash-object` 前后均为 `f9022223…`。
**冻结**：`.rebuild/s1b_step3/r9/patchgen/alias_zero_member_shape.frozen.patch`，与 `patches/alias_zero_member_shape.patch` `cmp` 逐字节相同，`sha256=b15e9807d8b88cf901d9183075c44ca64231dddfb14577c576be5b84df596c39`（1,913 B）。
**不覆盖**：前五枚 `1c0f20da…` / `7e0e2af3…` / `be1ce4bf…` / `bfa3f100…` / `00337316…` 均**原样保留**。**`git apply --check` = 0**（基线 = 当前工作树）。**未 apply、未编译。**

## 19.5 未测项（诚实清单）

| # | 未测项 | 判别方式 |
|---|---|---|
| 1 | **未运行任何编译**（硬纪律）；全部为 `read`/`grep`/`python3` 静态读数 | 烤炉 |
| 2 | 判词**不带坐标**：`symbolId`/`root`/`parserKind` 未落进判词。"首个 alias 是 symbol 0（`FrameKind`）"由 (源序, 声明行序) **推定**，未逐行 dump `declarationSymbolGlobalRoots` | 给 `:10707` 判词补 `symbol= root= parser_kind= member_count=`；或 dump 一次 `symbolMemberCounts` |
| 3 | **alias 的 member 路径在本闭包完全未被执行**（11 源零 `tuple[`）—— 本补丁对它只是"逐字未动"，**没有实测证据**说它仍然工作 | 需要 `type N = tuple[a: int32, b: str]` 夹具 |
| 4 | **"逆命题不得加"只有源码论证**（`parser.cheng` 的无名 tuple 元素不产字段声明行），未用 `type T = tuple[int32, str]` 实测 | 同一夹具的对照件 |
| 5 | 逐位不变是**静态论证**（校验器不写列），未做字节对拍 | 三件 rc=0 夹具 + `kd_r26` 侧 sha 逐字相同 |
| 6 | 修复后下一道墙未测 | 见 §19.6 |

## 19.6 预登记（下一堵的候选）

按源码顺序，member 段在 `:10707` 之后继续走 alias per-member 校验（`:10722-10747`）、`:10748` `elif memberCount != 0`（non-aggregate owns members）、`:10752` member 覆盖率、`:10755-10757` `InheritanceAcyclic` / `InheritedFieldsValidateInto`、`:10758` 起的 exact resolution receipt，随后是 `artifact CID mismatch`。**§16.6 的泛型收据升序（`:9851-9852`）第四次记档：仍既未证实也未推翻**（本炉又跳到别的判据）。**§17.6/§18.6 的建议依然有效**，尤其**"给判词补坐标"** —— 它已经连续三轮成为定位成本的主要来源。

**§15.5 的挂起未动**：`semantic_snapshot_declaration_identity.cheng:139-148` 本轮**未改**（三问未答）。

---
---

# §20 第七堵：`typed expr: call surface kind drift at …/binary_types.cheng:92`（`kd_r28`）

只读源码 + 定位 + 落补丁；**全程未运行任何编译/烤制/lldb**（2026-09-12 06:0x 起）。
取证：`.rebuild/s1b_step3/r9/fixtures_r28.txt`。锚定哈希（本席读文件时的工作树）：`src/core/lang/typed_expr.cheng`（`git hash-object = 63630e63…`）/ `src/chain/binary_types.cheng`（`1ca5e18c…`），= §14–§19 六补丁均已 apply 态。

## 20.0 结论先行

1. **这是本战役第一条带坐标的判词**，也是**第一条离开 TypeArena、进入 typed-expr facts 相**的墙。
2. **判相核实**：判词原文 ` typed expr: call surface kind drift at {sourcePath}:{lineNumber}`，**没有** `compiler csg: TypeArena production failed:` 前缀、**没有** `source_index` ⇒ 不在 seal 相。产生点 `typed_expr.cheng:12468`，函数 `TypedExprFactsValidateCallResolutionRangeWithPreparedContext`（`:12144`）—— **typed-expr facts 的重校验相**（对 fact 表逐行重推导并硬比对）。链：`TypedExprFactsValidateCallResolutionRange`（`:12571`）→ `…WithPreparedContext`；调用点 `:68095` / `:68179` / `:68255` / `:69006`。
3. **判据**：`fact.surfaceCallKind != surfaceKind`（`:12467`）。左侧是 **fact 表**里的 `surfaceCallKinds` 列（`:248`，写入点 `:10860`）；右侧是**本函数从 parser 归一层重推**的 `TypedExprSurfaceCallKindFromParser(expr.callSurfaceKind)`（`:12286`）。两者是同一属性的**两次独立推导**。
4. **`:92` 的形态**：`var out = LsmrAddress()` —— **同一源内、零实参、callee 是被声明类型**的"构造调用"。
5. **判定：(b) 重推导侧不完备**，**机制同 §18**（同一规则多份副本、其中一份更窄），但是**新的一处谓词**："哪些调用形状算类型构造"。
6. **修法已落**：`patches/zero_arg_type_constructor_surface.patch`（1 文件 / 3 hunk / `+71 −16`）。冻结副本 `.rebuild/s1b_step3/r9/patchgen/zero_arg_type_constructor_surface.frozen.patch`，`cmp` 逐字节相同，`sha256=4fe3a04fd2d98d9e5c32004d9b71422d776545147a7ce56ded865004e33ed441`（6,806 B）。`git apply --check` = 0（基线 = **当前工作树**，已含前六枚）。**未 apply、未编译。** 生成器只读打开源文件、只写 `patches/` 与冻结副本。

## 20.1 判据链（比的是哪两侧）

判词点（`typed_expr.cheng:12467-12469`）：

```
        if fact.surfaceCallKind != surfaceKind:
            err = Fmt" typed expr: call surface kind drift at {expr.sourcePath}:{expr.lineNumber}"
            return false
```

| 侧 | 取值 | 出处 |
|---|---|---|
| 左：`fact.surfaceCallKind` | fact 表的 `surfaceCallKinds` 列（`ArenaArrayU8`） | 结构体字段 `:186` / 列 `:248` / 批量写入 `:10860` / 逐行读 `:10949`；**赋值只有两处**：`:52792`（初始化 `None`）与 `:53125`（`= FromParser(expr.callSurfaceKind)`） |
| 右：`surfaceKind` | `TypedExprSurfaceCallKindFromParser(expr.callSurfaceKind)`（`:12286`） | parser 归一层 `NormalizedExpr.callSurfaceKind` |
| 枚举 | `TypedExprSurfaceCallKind = {None, Local, External, Importc, Member}`（`:149`） | — |

**关键**：`surfaceKind` 在这条链上有**若干"特例形状"分支**，命中即 `continue`（不做一般比较）：
| 分支 | 位置 | 覆盖的形状 |
|---|---|---|
| V1 具名聚合构造 | `:12257-12285` | `NamedAggregateConstructorTypeInContext != ""`（**具名实参面**，如 `P(x: 1)`）|
| V2 限定类型构造 | `:12295-12325` | `surfaceKind == External && qualifier != "" && callArgCount <= 0 && reason == UnknownQualifiedTarget && SymbolExportedByCase(callee)` 且限定模块**声明了该类型** |
| V3 内建调用 | `:12383-12419` | `TypedExprExprIsBuiltinCall(expr) && fact.callKind == Builtin` |
| V4 一般比较 | `:12467` | 其余全部 |

## 20.2 定位：把 `:92` 的形态钉进"生产者有、重推导没有"的那一格

**第一步：读源。** `src/chain/binary_types.cheng:89-92`：
```
fn LsmrAddressFromDigits(digits: int32[]): Result[LsmrAddress] =
    if digits.len > LsmrMaxDepth:
        return Err[LsmrAddress](" chain: address depth overflow")
    var out = LsmrAddress()          ← :92，判词坐标
```
`LsmrAddress` 是同源对象类型（`:25-27`：`depth: int32` / `digits: int32[LsmrMaxDepth]`）。⇒ 该调用的特征：**同源、零实参、callee 是已声明类型**。

**第二步：查生产者**（`TypedExprBuildFactInto`）对 `NormalizedExprCall` 的两条"构造"路径：

| 生产者路径 | 条件 | 对 fact 的影响 |
|---|---|---|
| **P1** `:53092-53108` | `namedAggregateConstructorType != ""`（同一函数 `NamedAggregateConstructorTypeInContext`，`:52842-52846` 计算）| `callKind = None`（`:53096`）；`surfaceCallKind` **保持 `None`**；`ApplyResolvedType(该类型)` |
| **P2** `:53109-53124` | `callArgCount <= 0 && SymbolExportedByCase(callee)` 且（限定模块声明该类型 **或** 本源声明该类型）| `surfaceCallKind` **保持 `None`**；`ApplyResolvedType(typeName)` |
| P3 兜底 `:53125` | 其余 | `surfaceCallKind = FromParser(expr.callSurfaceKind)` |

**第三步：`LsmrAddress()` 走哪条。**
- P1 不成立：`NamedAggregateConstructorTypeInContext`（`:51748-51762`）先调 `TypedExprConstructorNamedFieldsInto`，后者**对空实参串直接 `return false`**（`:28054-28056`，`invalidReason` 保持 `""`）⇒ 该函数 `if !validNamedSurface && invalidReason == "": return ""` ⇒ **零实参构造不算"具名面"**。
- **P2 成立**：`callArgCount == 0` ✓、`LsmrAddress` 首字母大写（`SymbolExportedByCase`）✓、`expr.callQualifier == ""` ⇒ 走 `elif TypedExprSourceHasDeclaredType(ctx, "LsmrAddress")` ✓ ⇒ `typeName = "LsmrAddress"` ⇒ `ApplyResolvedType` 后 **`return`**，`surfaceCallKind` **停在 `None`**。
- 于是 fact：`surfaceCallKind = None`、`callKind = None`（`:52816` 的 `TypedExprCallKindForExpr` 对普通 `NormalizedExprCall` 给 `None`，见 `:9994-10003`）、`typeText = NormalizeTypeText("LsmrAddress")`、`callResolved = false`、`callQualifier/callee/target` 全空。

**第四步：重推导侧对不上。**
- V1 不成立（同一个 `NamedAggregateConstructorTypeInContext`，同样返回 `""`）。
- V2 不成立：要求 `qualifier != ""`（本处为空）且 `surfaceKind == External`。
- ⇒ 落到 **V4** `:12467`：左边 `None`，右边 `FromParser(expr.callSurfaceKind)`（裸 callee ⇒ parser 记为 `Local`）⇒ **`None != Local` ⇒ 判词** ✓。

⇒ **根因一句话**：**"哪些调用形状算类型构造"这条规则有两份**——生产者的 P2（限定 **+ 同源**两个子形），重推导侧的 V2（只有**限定**那一半，而且更窄）；**同源那一半没有对应分支**，于是每个同源 `T()` 都掉进一般比较。

## 20.3 判定：(b) 重推导侧不完备（机制同 §18，谓词是新的）

| 候选 | 判定 | 证据 |
|---|---|---|
| **(b) 判据/重推导不完备** | **成立（主判）** | 生产者 P2 的两个子形（限定 / 同源）里，重推导只覆盖限定的**一部分**（V2 还额外要求 `External` 与 `UnknownQualifiedTarget`）；同源子形**零覆盖** |
| (a) 生产者真缺口 | **排除** | `T()` 是语言的零值构造形态（`var out = LsmrAddress()` 之后逐字段赋值，是 `binary_types.cheng` 的正常写法）；生产者把 fact 归成"已解析的类型、无运行时调用"是**正确**的，P2 的注释也写明"the validated aggregate type below carries the constructor semantics without leaking a runtime call target" |
| (c) 既有潜伏被上游修复暴露 | **成立（可达时序）** | `LsmrAddress()` 从第一炉起就在源里；此前每炉死在 TypeArena 的六堵墙上、**根本没走到 typed-expr facts 重校验相** ⇒ 这是第一次 |

**与已修六堵的关系**
- vs **§16（收据次序）**：**不同根**（有序列的写入时机）。
- vs **§14/§15/§17/§18/§19**：**同一抽象族**（判据/推导的域窄于合法域）。**机制与 §18 相同、与 §19 不同**：§18 = 同一规则多份内联副本、漏改其一；**本轮同样** —— "哪些调用形状是类型构造"存在**两份**（生产者 P2 vs 重推导 V2），且两份**互相不一致**（V2 ⊊ P2）。§19 是单点判据写错，本轮不是。
- **谓词是新的**：名字域（`TokenCanName`）、内建头（`BuiltinHeadApply`）、标量 Send/Sync（`ScalarSendable`）三套修法对本堵**零作用**。

## 20.4 修法（**补丁已落**：`patches/zero_arg_type_constructor_surface.patch`）

**补丁基**：工作树 `src/core/lang/typed_expr.cheng`（§14–§19 六补丁均已 apply，`git hash-object = 63630e63…`）。包内 `*.patch` 被 `.gitignore:229` 忽略，**未 commit**。
**改动量**：1 文件 / 3 hunk / `+71 −16`。**16 条删除逐条列出**（= 生产者 P2 的整段内联块；其中**唯一一条 `elif` 就是该块自己的**，无 `else` 行、无外层链头）：

```
-        if expr.callArgCount <= 0 &&                                  ┐
-           TypedExprSymbolExportedByCase(expr.callCallee):            │ 生产者 P2
-            var typeName = ""                                         │ 内联块，
-            if expr.callQualifier != "":                              │ 整段提取为
-                let typeSourcePath = …                                │ 具名谓词
-                let typeSourceIndex = …                               │
-                if typeSourceIndex >= 0 &&                            │
-                   TypedExprSourceHasDeclaredType(…) :                │
-                    typeName = Fmt"{expr.callQualifier}.{expr.callCallee}" │
-            elif TypedExprSourceHasDeclaredType(ctx, expr.callCallee): │
-                typeName = expr.callCallee                            │
-            if typeName != "":                                        │
-                TypedExprApplyResolvedType(fact, ctx, sourceContexts, typeName, sink, false) │
-                return                                                ┘
```

**修法一句话**：把"零实参类型构造"抽成**一个具名谓词** `TypedExprZeroArgTypeConstructorTypeName(ctx, sourceContexts, expr) → str`，**生产者改读它**（逐字等价），**重推导侧新增一条同谓词分支**——两侧从此不可能对"哪些调用是构造"有分歧。

| # | 落点（旧行 → 补丁后行） | 内容 |
|---|---|---|
| 1 | `TypedExprApplyResolvedType` 之后（`@@ -52742`）→ 新 `:52777-52806` | 新增 `@borrows fn TypedExprZeroArgTypeConstructorTypeName(...) → str`：`callArgCount > 0` 或 callee 非大写开头 ⇒ `""`；限定子形 → 查限定模块声明类型 ⇒ `"qual.callee"`；否则同源 `SourceHasDeclaredType(ctx, callee)` ⇒ `share(callee)`；都不是 ⇒ `""`（**逐字等于原内联块**） |
| 2 | 生产者 P2（`@@ -53106`）→ 新 `:53170-53176` | 15 行内联块 → `let zeroArgConstructorType = TypedExprZeroArgTypeConstructorTypeName(ctx, sourceContexts, expr)` + 非空则 `ApplyResolvedType(...)` + `return` |
| 3 | 重推导侧 V2 之后、V4 之前（`@@ -12323`）→ 新 `:12326-12356` | 新增分支：同一谓词（用 `exprContext`）⇒ 非空则先查 `exprContextPath` 是否即本源，再**逐项断言** fact 与"构造"一致（`surfaceCallKind == None`、`callResolved == false`、`callReason == None`、`qualifier/callee/target/target_source` 全空、`callTargetImportc == false`、`callKind == None`、`typeText == NormalizeTypeText(该类型)`、abi/lowering/return 非 deferred），任一项不符 ⇒ 新判词 `zero-arg type constructor drift`（**带完整诊断尾**，与 V2 的 `qualified type constructor drift` 同款）；全部相符 ⇒ `continue` |

**为什么不是"放宽守卫"**
1. **V2 一字未动**（`typed expr: qualified type constructor drift at` 仍恰 1 处）：限定+External 那一支行为完全不变。
2. **新分支是"补上缺失的识别 + 正向断言"**，不是放过：它把 fact 的 13 项与"构造"语义逐条比对，任一项不符就硬失败（新判词）。相比之下，改动前这条路径**根本不校验**——它只是掉进一般比较然后误报。
3. **对不匹配该形状的调用，新分支是纯 no-op**：谓词返回 `""` ⇒ 直接落到 V4，与改动前逐语句相同。
4. **生产者的改动是逐字等价提取**：谓词返回的 type 文本与旧内联 `typeName` 完全相同（同序、同判定、同 `Fmt` 与 `share`），调用点仅把变量改名。

**逐位不变自证（生成器自检 + 静态论证）**

| 自检 | 结果 |
|---|---|
| 锚点唯一性（3 处，每处 `occurrences == 1`，否则 exit 2） | OK |
| **删除集精确匹配** | 恰 16 条（生产者 P2 整段）；**无 `else` 行**；唯一被删的 `elif` 就是该块自己的（生成器显式白名单） |
| **独立 hunk 重放**（重放到原文，与内存目标逐字节比对） | `orig=75e4a77c… → target=02ec468b…`，**逐字节相同** |
| **分支指纹** | `if 8015→8019 (+4)`、`elif 451→450 (−1)`、`else 244→244 (**+0**)`。+4/−1 的来源已逐条对上：新增谓词体内 4 个 `if`（`callArgCount>0` / `qualifier!=""` / `typeSourceIndex>=0` / `SourceHasDeclaredType`）+ 新分支 3 个 `if`（谓词非空 / context 检查 / 13 项断言）− 生产者被删的 4 个 `if`（`callArgCount<=0` / `qualifier!=""` / `typeSourceIndex>=0` / `typeName!=""`）− 被删的 1 个 `elif` = +4/−1 ✓；**`else` 零变化** |
| **结构性顺序断言** | 目标里必须按序出现 V2 头（`if surfaceKind == …External &&`）→ 新分支 `let zeroArgConstructorType =` → V4 前的 `if qualifier != "" &&` → V3 的 `if TypedExprExprIsBuiltinCall…`；且"V2 头 → `if qualifier != \"\" &&`"这段切片内必须含 `continue` 与新判词 ⇒ **没有任何既有分支被重挂** |
| 新增绑定 | 恰 5 个 `let`：`typeSourcePath`、`typeSourceIndex`（谓词内）；`zeroArgConstructorType`（生产者）、`zeroArgConstructorType` + `zeroArgType`（重推导）——全部先声明后使用 |
| 引用计数 | 谓词定义恰 1；`TypedExprZeroArgTypeConstructorTypeName(\n` 恰 **3**（定义 + 2 调用点）；`zeroArgConstructorType` 恰 **6**；生产者内联 `var typeName = ""` 由 3 降为 2（另两处在别的函数，未动） |
| 判词计数 | `typed expr: call surface kind drift at` 恰 1；`typed expr: builtin call surface kind drift at` 恰 1；**新增** `typed expr: zero-arg type constructor drift at` 恰 1 |
| 括号平衡 | `(`/`)` 同增 17、`[`/`]` 同增 3、`{`/`}` 同增 17 |
| **`@borrows` 自查** | 新谓词形参含非 var 的 `ctx: TypedExprSourceContext` / `sourceContexts: …[]` / `expr: parser.NormalizedExpr` ⇒ **已加 `@borrows`**；它调用的 `TypedExprLookupQualifiedModuleSourcePath`（`:51494-51495 @borrows`）、`TypedExprSourceContextLookup`（`:44574-44575 @borrows`）、`TypedExprSourceHasDeclaredType`（`:51570-51571 @borrows`）、`TypedExprSymbolExportedByCase`（`:12025-12026 @borrows`）**全部 `@borrows` 且形参非 var**，借用由本函数持有 ⇒ 不会触发 `borrowed actual cannot bind non-var non-@borrows formal` |

**为什么不会让无关输入变化（byte-neutrality）**
1. **生产者**：P2 段是**逐字等价提取**（同一判定、同一 `typeName`、同一 `ApplyResolvedType` 调用、同一 `return`）⇒ 对**所有**输入，fact 的每一个字段写入值与写点不变。
2. **重推导侧**：新分支只在谓词非空时进入；不匹配的调用直接落到 V4，**逐语句等价**。
3. 新分支**不写任何列**（只读 fact + 断言）⇒ 不参与任何 artifact/CID。
4. ⇒ **对既有通过输入（含四件定长数组正例与全部 rc=0 夹具）：fact 表逐位不变、下游 artifact 逐位不变。** 含该形态的输入（同源 `T()`）改前是**硬失败、不产 artifact**，不存在需要保住的旧字节。

**落补丁的方法（可复现，共享文件零接触）**：生成器 `.rebuild/s1b_step3/r9/patchgen/zero_arg_type_constructor_gen.py` **只读**工作树，做 3 处精确字符串替换（每处断言 `occurrences == 1`，否则 exit 2），`difflib.unified_diff` 生成补丁，并**独立重放** hunk 到原文与内存目标逐字节比对。**不 `cp`、不 apply、不写任何共享文件**；`src/core/lang/typed_expr.cheng` 的 `git hash-object` 前后均为 `63630e63…`。
**冻结**：`.rebuild/s1b_step3/r9/patchgen/zero_arg_type_constructor_surface.frozen.patch`，与 `patches/zero_arg_type_constructor_surface.patch` `cmp` 逐字节相同，`sha256=4fe3a04fd2d98d9e5c32004d9b71422d776545147a7ce56ded865004e33ed441`（6,806 B）。
**不覆盖**：前六枚 `1c0f20da…` / `7e0e2af3…` / `be1ce4bf…` / `bfa3f100…` / `00337316…` / `b15e9807…` 均**原样保留**。**`git apply --check` = 0**（基线 = 当前工作树）。**未 apply、未编译。**

## 20.5 观察（按要求只记不改）：坐标机制的覆盖面

带坐标的判词都来自 **typed-expr facts 相**：坐标是 `expr.sourcePath` / `expr.lineNumber`，载体是**归一表达式层**（`parser.NormalizedExpr`），所以这一相里每条判词天然带 `文件:行号`（`call surface kind drift`、`named aggregate constructor drift`、`qualified type constructor drift`、`call resolved drift` … 全部同款）。
**§14–§19 那六堵无坐标判词全部来自 TypeArena**（`typed expr type arena: …`）：它们索引用的是 **arena 行号 / TypeId / SymbolId**，`expr` 不在手上，所以没有坐标。**但坐标是可推导的**：arena 有 `typeSyntaxProducerSourceIndexes`（`:206`）、`typeSyntaxSourceLocalRows`（`:210`）、`typeSyntaxSpanStarts/Ends`（`:211`/`:212`）三列 —— 「源号 + 源内行号 + 字节 span」足够换回 `文件:行号`，只差一张 producer-source → sourcePath 的表。**本轮不改判词**（按指令），仅记录。

## 20.6 未测项（诚实清单）

| # | 未测项 | 判别方式 |
|---|---|---|
| 1 | **未运行任何编译**（硬纪律）；全部为 `read`/`grep`/`python3` 静态读数 | 烤炉 |
| 2 | **本轮第一次离开 TypeArena 相** ⇒ 这条链下游（facts 重校验之后）此前从未跑过；**下一堵很可能仍在 typed-expr 相**，但本席**无证据** | 烤炉 |
| 3 | `expr.callSurfaceKind` 对 `LsmrAddress()` 的具体取值（`Local`？）**未逐字核实** —— 本席只用到"`fact` 为 `None` 且 parser 值非 `None` ⇒ 必然 drift"，而判词本身证明了 `fact.surfaceCallKind != surfaceKind` | 需要一次 fact dump（`surface=`/`expr=`） |
| 4 | **V2（限定支）比生产者 P2a 窄**（多要求 `surfaceKind == External` 与 `UnknownQualifiedTarget`）—— 本补丁的**新分支覆盖了这部分差额**（新分支不限 `surfaceKind`），但**未实测**差额是否真的可达 | 需要一个"限定 T() 但 parser 未标 External"的夹具 |
| 5 | `share(expr.callCallee)` 的返回值所有权写法只有一处先例（`:52757` `return share(expr.exprId)`），未由编译器验证 | 烤炉 |
| 6 | 逐位不变是**静态论证**（生产者等价提取 + 新分支 no-op），未字节对拍 | 三件 rc=0 夹具 + `kd_r28` 侧 sha 逐字相同 |
| 7 | 修复后下一道墙未测 | — |

## 20.7 预登记与挂起

**§16.6 的泛型收据升序（`:9851-9852`）第五次记档：仍既未证实也未推翻**（本轮直接跳出了 TypeArena 相 —— 那条推论的可达性反而更低了，因为 seal 相已经整段通过）。**§17.6/§18.6 的建议依然有效**。**§15.5 的挂起未动**：`semantic_snapshot_declaration_identity.cheng:139-148` 本轮**未改**（三问未答）。

**待办（槽位持有者已裁决：链推完再做）**：TypeArena 六堵无坐标判词的**坐标补齐**（用 `typeSyntaxProducerSourceIndexes` / `typeSyntaxSourceLocalRows` / `typeSyntaxSpanStarts-Ends` + 一张 producer-source→sourcePath 表换回 `文件:行号`）。**触发条件：本链走到 `artifact CID mismatch` 或 rc=0**，届时一次覆盖六条既有判词 + 后续同类。

---
---

# §21 第八堵：`typed expr: call declaration static argument type unavailable`（`kd_r30`，`binary_types.cheng:114`）

只读源码 + 定位 + 落补丁；**全程未运行任何编译/烤制/lldb**（2026-09-12 06:3x 起）。
取证：`.rebuild/s1b_step3/r9/fixtures_r30.txt`。锚定哈希：`src/core/lang/typed_expr.cheng = fb830fd2…` / `src/chain/binary_types.cheng = 1ca5e18c…`（= §14–§20 七补丁均已 apply 态）。

## 21.0 结论先行（**这是一堵"源侧"墙，不是编译器缺口**）

1. **判相**：判词由 **`panic(Fmt…)`** 抛出（`typed_expr.cheng:29423`），函数 `TypedExprResolveCallDeclarationFromText`（`:29335`）；上游 `TypedExprBindingRhsCallReturnType:18488` → 本函数。**没有** `TypeArena production failed` 前缀、**没有** `source_index` ⇒ 仍在 **typed-expr facts 相**（§20 同一相、更下游一点）。**rc 从 2 变 1** 是因为它是 panic 而非 `err` 返回 —— 不是"换了编译期/运行期"，而是错误路径不同。
2. **判据（哪一项不满足）**：`:29416-29423`
   ```
   if argsText != "":
       if !TypedExprCallStaticArgTypesInto(currentCtx, sourceContexts, scope,
                                           lineNumber, argsText, argTypes):
           panic(Fmt" typed expr: call declaration static argument type unavailable …")
   ```
   即"**该调用的实参文本必须能逐个静态定型**"。失败的实参是 `[out, IntToStr(addr.digits[i])]`：seq 字面量臂（`:29083-29105`）逐元素递归定型，元素 `IntToStr(addr.digits[i])` 定型失败 ⇒ 整个字面量取不到 `seqLitElemType` ⇒ 实参类型为空 ⇒ panic。
3. **`:114` 的形态**：`out = strutil.Join([out, IntToStr(addr.digits[i])], "")`。`Join` 本身是 `strutil.Join`（**限定调用，解析正常**）；坏的是**实参里的 `IntToStr`**。
4. **`IntToStr` 是什么**：**不是内建**（`TypedExprBuiltinCalleeReturnType:9792-9915` 无此名；`typed_expr.cheng:9896-9898` 只在 `qualifier == "strings"` 下认它）——它是 **`src/std/strings.cheng:286` 的普通 Cheng 函数**（`fn IntToStr(i: int32): str`），全仓**唯一**声明处。
5. **根因**：**`binary_types.cheng` 从未 import `std/strings`**（它的四条 import 是 `std/result` / `std/rawbytes` / `cheng/std/bytes_layout as layout` / `std/strutils as strutil`）。而 Cheng 的名字可见性是**直接导入制**：
   - `TypedExprResolveCallDeclarationKind:33087-33095` 只在 `for importIndex in 0..<TypedExprContextImportCount(currentCtx)` 里找（**不传递**）；
   - 调用方把这条规则写在注释里（`:33208-33209`）：**"Only a complete local miss opens direct-import visibility."**；
   - 规范 `docs/cheng-formal-spec.md:714-719`（§1.4）用首字母大写定义导出、并**没有 re-export 构造** ⇒ `import std/strutils as strutil` **不会**把 strutils 自己 import 进来的 `IntToStr` 带出来。
   ⇒ **输入程序用了一个它没导入的名字**。
6. **判定：(a) 但责任方是"源"不是"编译器"** —— 生产者（源侧）真缺口，编译器行为符合其**成文的设计规则**。这与槽位持有者已裁定的森林阻塞点（"跨源名字不可达（缺 import）"⇒ 源侧缺陷）是**同一类**。
7. **修法已落**：`patches/chain_binary_types_inttostr_import.patch`（1 文件 / 1 hunk / `+8 −0`，**纯插入**）。冻结副本 `.rebuild/s1b_step3/r9/patchgen/chain_binary_types_inttostr_import.frozen.patch`，`cmp` 逐字节相同，`sha256=9f610a7a2b95da01c62b533e3651c26289c8b3d1a30b9b4dd1767927b3d44c69`（686 B）。`git apply --check` = 0（基线 = **当前工作树**）。**未 apply、未编译。** 生成器只读打开源文件、只写 `patches/` 与冻结副本。

## 21.1 判据链（逐项）

| 层 | 站点 | 判据 |
|---|---|---|
| 触发 | `typed_expr.cheng:29416-29423` | `argsText != ""` ⇒ `TypedExprCallStaticArgTypesInto(...)` 必须为真；假 ⇒ **panic 判词** |
| 下一层 | `:29237-29261` | 按顶层逗号切实参，**每个**实参 `TypedExprStaticExprTypeAtLevel(...)` 必须非空（`complete`） |
| seq 字面量 | `:29083-29105` | `[e0, e1, …]` ⇒ 逐元素递归定型；**全同型且非空** ⇒ `"{elemType}[]"`；否则不返回（交后续兜底） |
| 元素 | `:29172-29178` / `:29216-29222` | 调用文本 `IntToStr(…)` ⇒ `TypedExprBindingRhsCallReturnType`（`:18448`）→ `:18468` 先查**非限定内建表**，未命中 → `:18488 TypedExprResolveCallDeclarationFromText` |
| 名字解析 | `:33174-33207` | 先在**本源**找；本源 miss 后由 `:33210-33222 TypedExprResolveCallDeclarationKind` 只在本源的**直接导入**里找（`:33092`） |
| 结论 | — | `IntToStr` 既不在本源声明、也不在四条直接导入的任何一条里 ⇒ miss ⇒ 返回类型 `""` ⇒ 元素定型失败 ⇒ 字面量定型失败 ⇒ 实参定型失败 ⇒ **panic** |

**旁证（`IntToStr` 只能是"导入才能用"的普通函数）**：`typed_expr.cheng:9889-9898` 的 `TypedExprKnownQualifiedCallReturnType` 只把 `strutil` 映射到 `Strip/Join/Contains/StartsWith/ParseInt`，把 `IntToStr` 映射到 **`qualifier == "strings"`** ⇒ 编译器自己就把 `IntToStr` 归给 `strings` 模块。
**反证（不是"元素 `out` 的锅"）**：同一函数 `:113` 的 `strutil.Join([out, "."], "")` 实参元素是 `out` 与 `"."` —— 若 `out` 定不了型，`[out, "."]` 会先炸，判词会停在 **`:113`**；实测坐标是 **`:114`** ⇒ `out` 定型正常，坏的是 `IntToStr(...)`。

## 21.2 判定：(a) 源侧真缺口（**不是** §18/§20 那两类）

| 候选 | 判定 | 证据 |
|---|---|---|
| **(a) 生产者真缺口 —— 但生产者是"输入源"** | **成立** | `binary_types.cheng` 用了 `std/strings` 的名字却没导入它；编译器按**成文规则**（`:33208-33209` 注释 + `:33092` 直接导入遍历 + 规范 §1.4 无 re-export）判 miss |
| (b) 判据过严 | **排除** | 要把这条判成 (b)，就必须论证"名字可见性应当传递"。但：① 编译器把"直接导入制"写成了设计注释；② 规范 §1.4 只定义导出、无 re-export；③ **实测反证在规模上**：全仓 **297** 个文件用裸 `IntToStr`，其中 **168 个没有导入 `std/strings`**（见 §21.3）—— 若可见性应当传递，这 168 个都合法，等于说"仓库里 168 处跨模块名字不需要 import"，与 §1.4 的导出语义推理不符 |
| (c) 既有潜伏被上游修复暴露 | **成立（可达时序）** | 该调用自文件存在起就在；此前每炉死在 TypeArena 六堵 + §20 一堵，**facts 相的实参定型从未跑到** |

**与已修七堵的关系**：与 §14/§15/§17/§18/§19/§20（全是**编译器判据/推导**问题）**不同根**；与 §16（收据次序）也不同根。**它是本链第一堵"源侧"墙**，与槽位持有者已裁定的森林阻塞点同类。

## 21.3 全域普查（供源侧缺陷那位手直接用）

**本夹具闭包（11 源）内**：裸 `IntToStr` 仅 1 处 —— `src/chain/binary_types.cheng:114` ✓；`std/strings.cheng` 自己 6 处（同源，合法）；`std/strutils.cheng` 1 处（它**import 了** `std/strings`，合法）。
**同包（`src/chain/`）同款缺陷**：`src/chain/lsmr_types.cheng:192`（`strutil.Join([out, IntToStr(prefix.prefixDigits[i])], "")`）、`src/chain/pubsub.cheng:153`（`strutil.Join(["bagua|", IntToStr(nodeId)], "")`）—— 都只 import 了 `std/strutils as strutil`。**这两个文件不在本夹具闭包内**，不影响本链，但属同一缺陷类。
**全仓规模**（脚本口径：正则 `(^|[^.A-Za-z0-9_])IntToStr\(` 计裸调用；"已导入"= 存在 `import std/strings` / `import std/strings as X` / 分组形式 `import std/[... , strings, ...]`）：

| 指标 | 数 |
|---|---|
| 使用裸 `IntToStr` 的文件 | **297** |
| 其中**没有** `std/strings` 直接导入的 | **168** |

⇒ 若槽位持有者维持"直接导入制"裁定（本席建议维持，理由见 §21.2），这 168 个文件是一次**可枚举的源侧普查清单**，本席可随时按同一脚本出全表（含行号）。**本补丁只修本链那一处**，其余交普查。

## 21.4 修法（**补丁已落**：`patches/chain_binary_types_inttostr_import.patch`）

**补丁基**：工作树 `src/chain/binary_types.cheng`（`git hash-object = 1ca5e18c…`）。**改动量**：1 文件 / 1 hunk / **`+8 −0`（纯插入，零删除）**。

| 落点 | 内容 |
|---|---|
| `:1-5`（import 头之后）| 新增 7 行 `[import-visibility]` 注释 + **`import std/strings`**；调用点 `:114` **一字未动** |

**为什么这是"只修不绕"**：缺陷是"少了一条 import"，修法就是补上那一条。调用点保持 `IntToStr(addr.digits[i])` 原样（`strutils.cheng:370` 也是导入 `std/strings` 后用裸名），**没有**改写成语义等价但绕开依赖的 `Fmt"{…}"`，也**没有**把调用改成别的模块的函数。无循环风险：`strings.cheng` 只 import `rawbytes/sha256/system/rawmem_support`，不回指 `binary_types`。

**逐位不变自证（生成器自检 + 静态论证）**

| 自检 | 结果 |
|---|---|
| 锚点唯一性（1 处，`occurrences == 1`，否则 exit 2） | OK |
| **删除集为空**（纯插入） | `removed == []` ✓ |
| **独立 hunk 重放** | `orig=af3c5756… → target=fc09450b…`，**逐字节相同** |
| 声明数不变 | `if 14→14`、`elif 0→0`、`else 0→0`、`fn 13→13`、`type 1→1` —— **全 0 变化** |
| 新增内容 | 8 行全是注释 + 1 条 import；**无 `let`/`var`/`fn` 新增**；`IntToStr(addr.digits[i])` 仍恰 1 处；`import std/strings` 由 **0 变 1**；新 import 落在 import 头内（前 14 行） |
| 行数 | `t` 比 `orig` 恰多 `len(added)` 行 |
| **`@borrows` 自查** | 本补丁**不新增任何函数、不新增任何调用** ⇒ 借用面零变化 |

**byte-neutrality（这次的形态与以往不同，必须说清）**
1. **编译器零改动** ⇒ 对**任何**不经过 `binary_types.cheng` 的输入，`artifactRaw32`/CID **逐位不变**（这一点比前七枚更强：那些动的是编译器）。
2. 对**包含** `binary_types.cheng` 的输入，**源文本变了，产物必然变** —— 这是源修复的固有代价，也正是"改前是非法输入、根本没有可保住的旧字节"。
3. **额外提醒（需槽位持有者预期）**：新增一条**直接 import 边** `binary_types → strings` 会进入导入图，**很可能改变 `orderedSources` 的发现顺序**（`strings` 目前是 src=8、经 `strutils` 被发现）⇒ 全局行基址与整个 fixture 的 CID 会整体位移。这是**预期行为**，不是回归信号；判据仍是"判词消失 + 四件正例/rc=0 夹具逐字节不变"。

**落补丁的方法（可复现，共享文件零接触）**：生成器 `.rebuild/s1b_step3/r9/patchgen/binary_types_import_gen.py` **只读**工作树，做 1 处精确字符串替换（断言 `occurrences == 1`），`difflib.unified_diff` 生成补丁，并**独立重放** hunk 与内存目标逐字节比对。**不 `cp`、不 apply、不写任何共享文件**；`src/chain/binary_types.cheng` 的 `git hash-object` 前后均为 `1ca5e18c…`。
**冻结**：`.rebuild/s1b_step3/r9/patchgen/chain_binary_types_inttostr_import.frozen.patch`，与 `patches/chain_binary_types_inttostr_import.patch` `cmp` 逐字节相同，`sha256=9f610a7a2b95da01c62b533e3651c26289c8b3d1a30b9b4dd1767927b3d44c69`（686 B）。
**不覆盖**：前七枚 `1c0f20da…` / `7e0e2af3…` / `be1ce4bf…` / `bfa3f100…` / `00337316…` / `b15e9807…` / `4fe3a04f…` 均**原样保留**。**`git apply --check` = 0**（基线 = 当前工作树）。**未 apply、未编译。**

## 21.5 未测项（诚实清单）

| # | 未测项 | 判别方式 |
|---|---|---|
| 1 | **未运行任何编译**（硬纪律） | 烤炉 |
| 2 | **"直接导入制"是编译器设计注释 + 规范推理，不是实测**：本席**没有**跑过"未导入却能用"或"导入后能用"的对照 | 最小对照夹具：`a.cheng` 用裸 `f()`（f 在 `b.cheng`），分别 import/不 import |
| 3 | **修掉 `IntToStr` 之后本文件是否还有别的不可达名字**：本席只做了**名称可解析性静态扫描**（21 个 callee 名里，除 7 个**本源声明的对象类型构造器**（`LsmrAddress`/`Frame`/`FrameHeader`/`HelloPayload`/`AdvertisePayload`/`WantStatePayload`→实为 7 个 + `StateRootSummary`/`StateChunkPayload`）外，**只有 `IntToStr` 一个真不可达**）—— 该扫描是**启发式**（内建表靠手工列出），不是真解析 | 烤炉；若下一炉仍报同一判词，首查 `Join` 之外的实参 |
| 4 | 168 文件普查的**口径**：脚本只认 `IntToStr`；同类缺陷若出现在**其他跨模块名字**上，本表**不覆盖** | 需要按"每个文件的裸调用名 × 其直接导入的导出名"做全量对账 |
| 5 | 新增 import 边对 `orderedSources` 的**具体影响**未测（预测是整体位移） | 烤炉 + 对比 `forest src=` 序列 |
| 6 | 修复后下一道墙未测 | — |

## 21.6 需要裁决

**本堵的责任方是"源"不是"编译器"**，因此补丁落在 `src/chain/binary_types.cheng`（输入源）而不是编译器。槽位持有者对森林同类已裁定为**源侧缺陷并另派手普查**。请裁决：**(i)** 直接采用本补丁（1 行 import，最小、无语义变化），还是 **(ii)** 归并到那位普查手的清单里统一处理（本席已给出同包两处 + 全仓 168 处口径）。本席**建议 (i)**：本链需要它才能继续，且它与普查不冲突（普查可把这一处标记为已修）。

**后续**：槽位持有者裁决 **(i)** 并已 apply；`kd_r32/r33` 中本夹具判词已前进。

---
---

# §22 第九堵（森林）：`bytes_view` 未登记 —— 内建 SABI 视图类型补进标量表

只读源码 + 定位 + 落补丁；**全程未运行任何编译/烤制/lldb**（2026-09-12 07:1x 起）。
取证：槽位持有者转来的枚举结论 `nominal_sweep source=220 path=…/src/std/os_host_process.cheng name=bytes_view type_syntax_row=62 root_row=62`（全 234 源，初始 6 条，前 5 条已由槽位持有者按"补 import / 去别名"修掉，**本条不能靠 import 修** —— 全仓没有任何源声明过它）。
锚定哈希（本席读文件时的工作树）：`typed_expr_type_arena.cheng = 6fd3a64f…` / `compiler_csg.cheng` / `canonical_type_chain.cheng = d7426d23…` / `compiler_snapshot_schema.cheng = cf3692c5…` / `compiler_snapshot_builder.cheng` / `exact_def_freeze.cheng`。

## 22.0 结论先行

1. **`utf8_view` / `bytes_view` 是内建 SABI 边界类型，不是缺失的 import**。规范逐字（`docs/cheng-formal-spec.md:559-561`、`:598`、`:613`）："C ABI 必须显式选择 `utf8_view`、`bytes_view`、`cstring` 或 `owned_cstring`"；"`utf8_view`：只读 UTF-8 `(ptr,len)`，仅 C ABI 参数可用，调用期有效，C 侧不得保存"；"`bytes_view`：只读 bytes `(ptr,len)`，仅 C ABI 参数可用"；`string_abi_contract.abi.bytes_view=borrowed_bytes_call_scope`。
2. **"把它当成标量表缺项"成立**（已按源码复核）：编译器**已经在四处**把它们当内建**名字**认（`parser.cheng:6464-6465` 内建类型调用名、`typed_expr.cheng:9849-9850` 内建 callee 表、`:44813-44816` **layout 16/8**、`lowering_plan.cheng:17288-17290` 内建 call head），C 链也当内建（`bootstrap/cold_parser.c:728-729` 内建类型行、`:5412` `SLOT_STR_REF`、`:5435-5437` `SLOT_STR`、`:6077-6078`）。**唯一缺的是 TypeArena 的标量表示** —— 于是 `bytes_view` 的 Nominal 解析不到声明 ⇒ 枚举报缺名。这与 `ptr` 当初的缺口**同族**（`patches/ptr_builtin_type_arena_representation.patch` 是那次的修法，本补丁按它的六文件形态对齐）。
3. **`utf8_view` 一并补，且当前确有源使用**：**非测试源里两者都在用** —— `src/std/os_host_process.cheng:76`（`bytes_view`）、`src/inference/device.cheng`（10 处 `bytes_view`）；`utf8_view` 在非测试源里只见注释（`vpn_proxy_mobile_core.cheng:33`），但**测试源多处使用**（`call_hir_closure_visible_leaf.cheng:1`、`parser_normalized_expr_fixture.cheng:2`、`typed_expr_fact_fixture.cheng:9-10`、`call_hir_qualified_closure_visible_leaf.cheng:1`、`typed_expr_fact_importc_helper.cheng:1`、`sabi_string_bridge_smoke.cheng`）。⇒ **按"同一机制、同一张表"一次补全**。
4. **判定：(a) 生产者真缺口（编译器侧）** —— 与 §21 的"源侧缺陷"不同：这里没有任何源可以修，名字本来就是内建。**(c)** 是可达时序：`bytes_view` 一直不在表里，只是此前没有任何源走到"把它当类型用并且需要 arena 表示"。
5. **修法已落**：`patches/builtin_sabi_view_scalar_kinds.patch`（**6 文件 / 13 hunk / `+62 −1`**）。冻结副本 `.rebuild/s1b_step3/r9/patchgen/builtin_sabi_view_scalar_kinds.frozen.patch`，`cmp` 逐字节相同，`sha256=49721b8d18f89939e3f0992403d77cacd48824ea37ff76cdbf5038ad98cf3959`（8,264 B）。`git apply --check` = 0（基线 = **当前工作树**）。**未 apply、未编译。** 生成器只读源、只写 `patches/`。

## 22.1 判相与判据核实（走的是哪条通路）

| 问题 | 结论 | 证据 |
|---|---|---|
| `bytes_view` 走的是 `typedExprTypeArenaScalarKind` 标量名映射吗？ | **是** | arena 的名字映射表 `:1052-1073` 是**唯一**的"类型文本 → 标量 kind"入口；`ResolveNominal` 的 scalar 臂（`parserKind == Nominal && ScalarKind != Invalid`）据此为 Nominal 行铸造 Scalar 行。表里没有 `bytes_view` ⇒ 落到 `ScalarInvalid` ⇒ 继续走声明权威查找 ⇒ 找不到 ⇒ 枚举报"nominal 不可达" |
| 有没有别的通路？ | **没有** | 全仓 `grep "utf8_view\|bytes_view"`（非测试）**没有**任何 `type … =` 或 `fn` 声明；四处命中全是**内建名字判定**（parser 内建类型调用名 / typed_expr 内建 callee / typed_expr layout / lowering 内建 call head），而它们**都只在"已经被认成类型"之后才起作用** —— 它们不负责把名字变成 arena 里的类型行 |
| 是否该用 import 修？ | **不可以** | 名字没有声明处（不是跨源可见性问题） |

## 22.2 五处对齐（按 `ptr` 那次的教训逐处核）

| # | 维度 | 落点 | 取值 | 依据 |
|---|---|---|---|---|
| ① | **枚举形参追加** | `typed_expr_type_arena.cheng:54` 之后 | `TypedExprStructuralScalarUtf8View` / `TypedExprStructuralScalarBytesView` | **末尾追加**（`Set` 之后）⇒ 既有标量序数一个不动 |
| ② | **名字映射** | `typed_expr_type_arena.cheng:1072` 之后 | `"utf8_view"` / `"bytes_view"` | 与四处既有内建名判定同名同序（`typed_expr.cheng:9849-9850`、`parser.cheng:6464-6465`、spec `:560-561` 都是 utf8 在前） |
| ③ | **layout/size/align** | `compiler_csg.cheng` 标量 layout 函数 | **16 / 8** | `typed_expr.cheng:44813-44816` 逐字给 16/8（**不是** `str` 的 24/8）；规范 `:630` 明说 `str` 的 24 字节布局**不是**桥接布局，故 C 链的 `SLOT_STR`（`cold_parser.c:5435-5437`）是宽松近似、**不得当布局读**。新加**独立臂**，不并入 8 字节组 |
| ④ | **Send/Sync** | `typed_expr_type_arena.cheng` 的 `typedExprTypeArenaScalarSendable`（§18 收敛出的**唯一**谓词）+ `compiler_snapshot_schema.cheng:5883` 的可移植镜像 | **两个都是 `!Send/!Sync`**（managed 保持 false） | 规范 `:560-561`"仅 C ABI 参数可用，调用期有效"、`:613` `borrowed_bytes_call_scope`；它们是**借用的裸地址**，与 `cstring`/`ptr` 同类（§0.3 "FFI 句柄默认 `!Send/!Sync`"）。trait rule 仍是 `PlainScalar`（不是 `ManagedString`） |
| ⑤ | **coreir tag** | `canonical_type_chain.cheng` 终端 local kind | **`LocalPtrTag`**（并入 `cstring`/`ptr`/`typedesc` 那一支） | 同处既有 `typedesc` 裁决逐字："classify with the address-like scalars (`cstring`/`ptr`) rather than with the 32-bit family, because claiming the latter would be exactly the silent int32 degradation this campaign already paid for once." 注释**特意放在 `\|\|` 链之外**（见 §22.4 的陷阱） |

**另加两处**（`ptr` 那次的同族清单里也有，缺一即下一堵）：
- `typed_expr_type_arena.cheng` 的 `ReservedScalarTypeId` / `ReservedScalarTypeIdForText` **排除表**（两处）—— 这两个是"语义种子行"权威，`ptr`/`typedesc`/`set`/`int`/`uint` 都在排除之列；views 是**按需 intern**（非种子）⇒ 必须排除。
- `exact_def_freeze.cheng` 的"独立标量"排除表 —— view 是**借用的地址对**、不是独立值，与 `ptr`/`cstring` 同列。

**⑤ 的宽度说明**：`LocalPtrTag` 不表达宽度；16 字节由 layout 权威（`compiler_csg` 16/8）表达。这与 `str`（24 字节 → `LocalStrTag`）同构：tag 是**语义族**，宽度归 layout 表。

## 22.3 一次性 grep 全部内联副本（要求 4）

因为上一轮已经把 `TypedExprStructuralScalarPtr`（arena 侧）与 `CsgCompilerScalarPtr`（可移植侧）撒进了所有"枚举标量"的表，**用这两个名字 + `…ScalarSet` 做并集就是完整的表清单**。实测并集：

| 站点 | 本轮处置 |
|---|---|
| `typed_expr_type_arena.cheng` 枚举 / 名字映射 / `ScalarSendable` / 保留标量排除 ×2 | **已对齐**（5 处） |
| `compiler_csg.cheng` 标量 layout | **已对齐**（新增 16/8 臂） |
| `canonical_type_chain.cheng` coreir tag | **已对齐** |
| `compiler_snapshot_schema.cheng` 枚举 / `csgCompilerScalarKindValid` / trait 镜像 | **已对齐**（3 处） |
| `compiler_snapshot_builder.cheng` arena→portable / portable→text | **已对齐**（2 处） |
| `exact_def_freeze.cheng` 独立标量排除 | **已对齐** |
| `typed_expr.cheng:9849-9850` / `:44813-44816` / `:52392-52404` | **无需改**（已是文本级内建名判定，且已含两个 view 名） |
| `parser.cheng:6464-6465` / `lowering_plan.cheng:17288-17290` | **无需改**（同上） |
| **`typed_expr.cheng` 是否另有 arena 标量 kind 的枚举？** | **没有**：全仓 `grep TypedExprStructuralScalarPtr` 在 `typed_expr.cheng` **零命中** ⇒ 它不枚举 arena 标量 kind |

⇒ 并集内**没有第五份未被处置的副本**。生成器把这个断言固化成探针计数检查（见 §22.4）。

## 22.4 逐位不变自证（生成器自检）

| 自检 | 结果 |
|---|---|
| 锚点唯一性（13 处，每处 `occurrences == 1`，否则 exit 2） | OK |
| **删除集精确匹配** | **恰 1 条**：`           kind <= CsgCompilerScalarSet` → `…BytesView`（schema 的合法上界；**无 `if`/`elif`/`else` 行被删**） |
| **逐文件独立 hunk 重放**（把多文件补丁按 `--- a/` 切分，逐文件重放到原文与内存目标比对） | 6 文件**全部逐字节相同** |
| **序数不变** | arena 两个新 kind **追加在 `Set` 之后**、schema 两个新序数 **19/20 追加在 `Set=18` 之后** ⇒ 既有标量序数与既有 type CID 字节不动 |
| **分支指纹** | `if 7417→7424 (+7)`（= arena 名字映射 2 + csg layout 1 + builder 映射 2 + builder 文本 2）、`elif 321→321 (+0)`、`else 226→226 (+0)`、`fn 1678→1678 (+0)`、`type 10→10 (+0)` |
| 行数 | 6 文件各 **只增不减**（+17/+14/+12/+6/+8/+4） |
| 新绑定 | 无新 `let`/`var`/`fn`；新增内容全是枚举成员、名字表项、谓词合取、layout/映射分支与注释 |
| **副本完整性探针** | `TypedExprStructuralScalar{Utf8View,BytesView}` 各 **9** 次；`CsgCompilerScalar{BytesView}` **5**、`{Utf8View}` **4**（差 1 是因为合法上界只写最后一个序数）；两个名字在 arena 名字表里**各恰 1 处**；且**都不进**内建构造器表（`BuiltinConstructorArity` 仍只认 `typedesc`/`set`） |
| **`@borrows` 自查** | 不新增任何函数、不新增任何调用 ⇒ 借用面零变化 |
| **`\|\|` 链内注释陷阱** | 生成器带**输出侧守卫**：扫描补丁里所有 `+` 行，若某行以 `\|\|`/`&&` 结尾且**下一 `+` 行是注释** ⇒ 报 violation 并失败。实测 **violations=0**；且仓库实测**没有任何**真实先例（先用脚本扫出 13 处"疑似"，逐条打开后**全是注释正文里以 `&&` 结尾的散文**，非续行）⇒ 本席把 coreir tag 的说明注释**移到 `if` 之前**（与仓库主流写法一致） |

**为什么不会让无关输入变化（byte-neutrality）**
1. 两个新 kind **末尾追加**，两个新 portable 序数 **19/20 末尾追加** ⇒ 既有标量 kind 的序数、既有 portable 序数**一个不变**；
2. 名字映射、`ScalarSendable`、保留标量排除、layout 臂、coreir tag 分支、schema 合法上界、trait 镜像、builder 双向映射 —— **每一处都只对两个新名字/新 kind 生效**，对所有既有 kind 的判定**逐字相同**；
3. 新宽度只加**新臂**（16/8），既有 `str`(24/8) 与 8 字节组**一字未动**；
4. ⇒ **不含 `utf8_view`/`bytes_view` 的输入：所有表逐位不变 ⇒ `artifactRaw32`/CID 逐位不变。**

**落补丁的方法（可复现，共享文件零接触）**：生成器 `.rebuild/s1b_step3/r9/patchgen/sabi_view_scalar_gen.py` **只读**打开 6 个源文件，做 13 处精确字符串替换（每处断言 `occurrences == 1`，否则 exit 2），`difflib.unified_diff` 逐文件生成后拼接，并**逐文件独立重放**与内存目标比对。**不 `cp`、不 apply、不写任何共享文件**；6 个源文件 `git hash-object` 前后一致。
**冻结**：`.rebuild/s1b_step3/r9/patchgen/builtin_sabi_view_scalar_kinds.frozen.patch`，与 `patches/builtin_sabi_view_scalar_kinds.patch` `cmp` 逐字节相同，`sha256=49721b8d18f89939e3f0992403d77cacd48824ea37ff76cdbf5038ad98cf3959`（8,264 B）。
**不覆盖**：前八枚（`1c0f20da…` / `7e0e2af3…` / `be1ce4bf…` / `bfa3f100…` / `00337316…` / `b15e9807…` / `4fe3a04f…` / `9f610a7a…`）均**原样保留**。**`git apply --check` = 0**（基线 = 当前工作树）。**未 apply、未编译。**

## 22.5 未测项（诚实清单）

| # | 未测项 | 判别方式 |
|---|---|---|
| 1 | **未运行任何编译**（硬纪律） | 烤炉 + `CHENG_NOMINAL_SWEEP=1` ⇒ `total=0` |
| 2 | **SABI 边界规则是否真的接管**：views 现在能被当普通类型用了，而规范要求它们**只在 C ABI 参数位**出现。`TypedExprTypeContainsSabiBoundary`（`typed_expr.cheng:52391`）/`...ContainsSabiView`（`:52401`）是既有的边界校验器，但**此前 views 根本解析不到，那套规则从未被执行过** ⇒ 本轮之后才第一次真正生效，**未测** | 烤炉；若 views 出现在 object 字段/全局/普通函数，应看到 SABI 判词而非静默通过 |
| 3 | **`os_host_process.cheng:76` / `inference/device.cheng` 的 10 处调用点**是否真能走完（布局、ABI 实参传递、`@ffi_map`）**未测** | 烤炉 + 森林并林推进到第几源 |
| 4 | **`LocalPtrTag` 是否够用**：view 是 16 字节，本补丁用"tag 表语义族、宽度归 layout 表"的既有分工把它归入地址族。**若某个消费者按 tag 推断宽度**（而不是查 layout 表），就会把 16 字节当 8 字节 —— 本席**未**逐个消费者核过 | 需要一个"把 view 当局部变量并取地址/按值传"的夹具 |
| 5 | `utf8_view` **当前无非测试源使用**（只有测试源用），所以它的端到端路径只有测试夹具覆盖 | 烤炉 |
| 6 | 新增枚举成员后，**是否还有别的"穷举标量"的 `else: panic`** 未在本席的并集口径内（口径=以 `ScalarPtr`/`CsgCompilerScalarPtr`/`ScalarSet` 三名并集为准） | 若下一炉出现 `unknown scalar kind` 类 panic，首查该口径之外的站点 |
| 7 | 森林 `total=0` 之后**并林能推进到第几源**未测 | 槽位持有者的后续烤轮 |

## 22.6 预登记与挂起

**§16.6 的泛型收据升序（`:9851-9852`）第六次记档：仍既未证实也未推翻**（本堵不在那条链上）。**"判词补坐标"待办仍在**（触发条件：夹具链走到 `artifact CID mismatch` 或 rc=0）。**§15.5 的挂起未动**：`semantic_snapshot_declaration_identity.cheng:139-148` 本轮**未改**（三问未答）。
