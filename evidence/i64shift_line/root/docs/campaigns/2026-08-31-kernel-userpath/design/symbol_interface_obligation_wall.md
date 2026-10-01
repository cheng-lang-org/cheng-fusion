# `canonical admission blocked missingFactBitmap=5` 根因（kd_r9z 四正例）

- 性质：只读回源 + 静态定位 + 补丁。**未运行编译**；补丁只冻 `compiler_snapshot_builder.cheng`（桥文件未动）。
- 补丁：`patches/symbol_obligation_domain_global_local.patch`（+30/−4，1 hunk，`git apply --check` exit 0）
  冻结副本 `.rebuild/s1b_step3/r9/patchgen/symbol_obligation_domain_global_local.patch`，sha256 `914dd5012aa11717e01f3b96af4c577bede6bd19dd53aeefa510eb2e5f1eb045`（与磁盘件 `cmp` 逐字节同）。

---

## ① 一句话答案

**不是入口没走到、不是 join 没配平、也不是被上游 verdict short-circuit。清除路径跑了（`compiler_snapshot_builder.cheng:11436-11482`），但它的被减数按构造就不可能归零**：义务分母 `compilerSnapshotProductionSymbolInterfaceObligations`（`:5811-5835`）统计**每一条非 Module 的 parser 声明行**，其中包含**模块级 `var`/`const` 块条目**；而 Symbol 生产者对这类行**一个 symbol 都不产**（`local_symbol_domain_function_scoped` 的树内注释 `:18455-18462` 自己写明 "no symbol was ever appended for it"），`CsgCompilerSymbol*` 七种 kind（Module/Type/Function/Field/Parameter/Local/GenericParameter）里也没有 globals 的归属。⇒ 相减后恒余 `#(模块级 var/const 条目)`，`missingSymbolInterfaceCount == 0` 的护栏永不成立 ⇒ bit 4 永不清 ⇒ 桥看到 `1|4 = 5`。

## ② 账目（与实测逐位吻合）

`fx_r8_fixed_len_named_const_main.stderr.txt` 实测：`decl_index entries=1 sources=1 type_syntax=7 declarations=6`。

| 项 | 值 | 证据 |
|---|---|---|
| 该夹具声明行 | 6 = module(1) + `const SlotCount`(1) + `type Slots`(1) + 字段 used/values(2) + `fn main`(1) | 声明行由 parser 产出；`declarations=6` |
| 义务分母（修前） | `sourceSnapshotCount`(1) + 非 Module 行(5) = **6** | `:5818`、`:5821-5835` |
| 实产 symbol | module(1, `:13062-13079` 每源一个) + Type(1) + Field(2)（`:17123-17339` 只认 Type/Field）+ Function(1) = **5** | 生产者逐点 |
| 差 | **1** ⇒ `missingSymbolDeclarationInterfaceCount = 1` ⇒ `missingSymbolInterfaceCount = 1` ⇒ bitmap `1|4 = 5` | `:9648-9661`、`:9771-9773` |
| 修后 | 分母 = 1 + (5−1) = **5** = 实产 ⇒ 差 0 ⇒ bit 4 清 | 本补丁 |

四个正例各**恰好一条** `const`（`SlotCount` / `SlotStep` / `LateCount` / `UntypedCount`），故四件同 bitmap；负例死在 parser（`must be int32`）不触达。src=`src/tests/r9_r8_fixed_len_named_const_main.cheng`，sources=1。

## ③ 缺的"精确事实"是什么

Symbol 域内**缺模块级 `var`/`const` 条目的身份**。两条合法出路：

- **(A) 本次采用**：承认它们不属 Symbol 域，把义务分母收窄到与生产者同域。它们的覆盖在**parser-owned global binding 域**：`compiler csg: parser-owned global coverage mismatch`（`compiler_csg.cheng:33830`）。该闸在本轮**已经通过**（跑到 lowering bridge 才死）⇒ 排除它们**不丢覆盖**。
- **(B) 未采用**：给 globals 造 Symbol 域（新增 kind + decl-key/proof 生产者 + 列）。这是 schema 级设计改动、要动 `compiler_snapshot_schema.cheng`（第二个文件面），且 `AppendLocalSymbolsInto` 要求 Local 行必须有函数内 value-definition（`:18295-18400`），globals 按构造没有 ⇒ 会连锁打穿 `expectedLocalCount == bindingDefinitionCount`。**未做，也未伪造任何 CID/键**。

## ④ 补丁为什么不违反红线

- **桥一个字没动**：`:4856-4864` 的"恰好等于 1"原样保留；补丁只改 `compiler_snapshot_builder.cheng`。
- **不是放宽判据**：`if count == 0` 的清除护栏、`produced > missing` 的 overrun 硬失败（`:11438-11447`）、bridge/schema 的严格校验全部原样；只是**义务域与生产域对齐**（同一判据 `declarationFunctionRows < 0`，与树内 `local-symbol-domain` 修法逐字同源）。
- **不合成任何身份**：`symbolInterfaceProofCid` 仍由 `compilerSnapshotProductionSymbolInterfaceProofCid(csg, tables)` 产出（`:11450-11452`），未从文本/名字/行号/夹具值造 CID。
- **不静默降级**：被排除的类在补丁注释里写明了替代覆盖闸；函数内 Local 行的义务**保持不变**（丢定义的局部仍会在 `Local declaration lacks exact value definition` 硬失败）。
- 未触发上游"parser-owned global coverage"假绿：四正例跑到本闸之前已通过该覆盖闸。

## ⑤ 预测与可判别实验

- 预测（修后）：四个正例在 unsealed 边界得到 **bitmap == 1**（`:11537-11560` 无条件重置 source 位并置 1），桥的三条子句（`admissionBlocked`、`bitmap == 1`、`missingSourceInterfaceCount == documentCids.len`）**同时成立** ⇒ 桥放行，进入 `CompilerSnapshotProductionCandidateSealInto`；下一堵墙未知（在 seal / type-projection 域）。
- **判别实验（很便宜，建议与下一炉同跑）**：把 **M-A**（零 const、字面量 `int32[8]` 字段）在打了本补丁的 `kd_r9z+` 上跑一次。按本诊断 M-A 的义务分母 = 实产（无 const 行）⇒ 它**在修前就应当能过桥**（若 M-A 修前也报 `missingFactBitmap=5`，则本诊断错，另有未识别的未配对类）。
- 第二判别：`const` 条目若被删掉一条，`missingSymbolDeclarationInterfaceCount` 应随之减一（bitmap 不变，因为 bit 是布尔）——用钻取坐标（`:11751-11758` 的 drift 文案会打印 `declaration=`）可读。

## ⑥ 下一堵墙（静态推定，另案，供同炉排期）

同一文件里还有一处**符号身份被后置改写**的时序缺口，与本次不同根因但同域：

- 主 Type 表两趟派生在 `:23999-24009`、`:24024-24033`，canonicalize 在 `:24033`，而 `symbols.symbolCids` 的**唯一写点**是 DeclKey finalizer（`:18513-18612`，调用点 `:24197`）⇒ **两趟派生与 canonicalize 看到的都是空 symbolCid**。
- 受影响面 = **非 nominal 但带 declSymbolId 的行（Alias 家族）**：其行身份 preimage 走 `csgCompilerTypeCidAppendOptionalSymbol`（schema `:5692-5693` → `:5389-5395`）读 `symbols.symbolCids[declSymbolId]`；`AppendArenaTypeRow` 对 Alias 强制 `declSymbolId >= 0`（`:14399-14420` 的守卫），symbol join 也明确认领 `aliasDeclaration`（`:17367`）。
- 两个可判定的后果：① 同目标的两条 alias 在修前/修后都算出**相同 CID** ⇒ canonicalize 的 `duplicate structural type identity`（`:16612-16617`）先炸；② 单条 alias 时，portable 投影在 finalizer **之后**重派生（`:6598-6605`）拿到**已封** symbolCid，与最终表冻结的空 cid 值不等 ⇒ `reference result canonical TypeId missing`（`:6610`）。
- 面：闭包里有真实用例（`src/core/analysis/borrow_checker.cheng:4/6/8` 三条 `= int32` 别名；全仓 `src/` 该形态 19 处），但四个夹具是单源、无别名 ⇒ **本炉看不到，234 源闭包会撞**。
- 未验证项：我只做了静态推导，没有运行期坐标；修复方向（finalizer 之后补一趟行身份重派生，或让 alias 行身份改读 declarationPathCids）需要单独的 schema/顺序决策，**本轮未动**。
