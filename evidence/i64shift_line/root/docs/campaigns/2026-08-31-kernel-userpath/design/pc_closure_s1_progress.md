# pc_closure_s1_progress —— S1（E3+E4+E2 + 11 行 manifest）静态实施进度与阻塞报告

日期：2026-09-11。基线 HEAD：`8c5a2df76`。施工图：`pc_closure_s1_edit_plan.md`（627 行）。
执行线：S1 静态线。**本轮零编译、零 `src/**` 写入、零 manifest 写入。**

---

## 0. 结论先行

**本轮没有对 `src/**` 与 `bootstrap/kernel_manifest.cheng` 落下任何编辑。** 不是时间不够，是两条硬约束同时成立：

1. **已批准的施工图自己禁止**：`pc_closure_s1_edit_plan.md:568` 明文 ——
   > 在 S0.5 有结论前，S1 的所有调用点改写都**不该动手**（写了也没有能承载它的轨）。

   S0.5（`CompilerMainProcessEntry` 可重入性实测）在 `:104-111` 被定义为**需要 1 次烤机**的动作，
   而本轮的编译槽正被另一线独占。⇒ **E3/E4/E2 的调用点改写与 11 行 manifest 删除，是被施工图自身阻塞，
   不是"改完了等验证"。**（manifest 行不能先删：施工图 `:34` 与禁止项 ⑤ 要求同刀。）

2. **"轨"的规格有 4 处未闭合**（详见 §5.G1–G4），硬写 = 猜着改。

**本轮实际交付**（全部静态、可复现、零风险）：

| 交付物 | 结果 |
|---|---|
| 门是否纯静态的判定 | ✅ 纯静态（只读源码 + `git ls-files`），可反复跑 |
| HEAD 基线复现 | ✅ 与施工图 `:10-14` 逐字相同 |
| 反事实 oracle 在 HEAD 重验 | ✅ 五组数字全部命中，11 行 manifest 由门自己反推出来 |
| 逐条 `文件:行` 重锚 | ✅ E3/E4/11 行 manifest **零漂移**；E2 的 15 处**整体漂移**（见 §2.4） |
| 同刀律（施工图 §0.2）复验 | ✅ 186/4/30/342 vs 183/4/27/324 精确复现 |
| 调用方全集完备性证明 | ✅ 三个门面的内核侧 importer 恰好等于施工图列的调用方 |
| 新增发现 | ⚠️ 2 处施工图未列的 `src/tests/` 消费方（§5.G5） |

---

## 1. 进度总览

### 1.1 E3 / E4 / E2 完成状态

| 步 | 项 | 状态 | 说明 |
|---|---|---|---|
| **S0** | 契约轨骨架（`codegen_contract.cheng` 追加） | ⛔ **未开工** | 规格未闭合 G1/G2（§5），且施工图 `:110` 要求 S0.5 先判定形态 |
| **S0.5** | 内核可续跑性实测 | ⛔ **阻塞** | 需 1 次烤机；编译槽被占 |
| **S1 / E3** | 门面删 4 arch import（`codegen_writer_units.cheng:22-25`） | ⛔ 未实施 | 单独删编不过（函数体仍直调 `elf_*`）；体去向未定义 G3 |
| | 调用方改写 2a–2d（`direct_object_emit` 4 处） | ⛔ 未实施 | 施工图 `:568` 禁止；pending 第三态无表示 G1 |
| | 调用方改写 3（`native_object_emission_plan:389`） | ⛔ 未实施 | 同上 |
| | 调用方改写 4（`native_link_exec:373`） | ⛔ 未实施 | 同上；且施工图 `:130` 自己标了第三态风险 |
| | 删调用方 import（`doe:23` / `noep:8` / `nle:9`） | ⛔ 未实施 | 必须与改写同刀 |
| **S2 / E4** | 门面删 3 arch import（`codegen_regalloc_adapter_units.cheng:26-28`） | ⛔ 未实施 | 同 G3 |
| | 调用方改写（`regalloc_production_emitter:1005`） | ⛔ 未实施 | 施工图 `:142` 自标"全切片最难一处"；var `str[]` 写回 SOA 化未定 G4 |
| | `regalloc_production_emitter:979-982` 硬门保留 | ✅ **已核实存在，不动** | 与施工图 `:143` 一致 |
| **S3 / E2** | 门面删 arch import（`codegen_x64_body_units.cheng:24`） | ⛔ 未实施 | 同 G3 |
| | 调用方改写 15 处（`primary_object_plan.cheng`） | ⛔ 未实施 | 施工图 `:568` 禁止；行号已漂（§2.4） |
| | 删调用方 import（`primary_object_plan.cheng:11`） | ⛔ 未实施 | 必须与改写同刀 |

### 1.2 11 行 manifest 完成状态

**全 11 行均未删除**（同上：必须与边切同刀，先删即破 `strict_manifest_unreachable`/`strict_closure_unmanifested` 不变量）。
下表"反事实复推"列 = 本轮用门自身的函数在内存切边后，门反推出的删除清单与施工图的比对结果。

| # | 行号 | key | 反事实复推 | 状态 |
|---|---|---|---|---|
| 1 | `:28` | `backend_codegen_writer_units_source` | ✅ 命中 | 未删 |
| 2 | `:30` | `backend_codegen_x64_body_units_source` | ✅ 命中 | 未删 |
| 3 | `:59` | `closure_src_core_backend_codegen_regalloc_adapter_units_source` | ✅ 命中 | 未删 |
| 4 | `:222` | `observed_strict_arch_elf_riscv32_writer` | ✅ 命中 | 未删 |
| 5 | `:223` | `observed_strict_arch_elf_riscv64_linker` | ✅ 命中 | 未删 |
| 6 | `:224` | `observed_strict_arch_elf_riscv64_writer` | ✅ 命中 | 未删 |
| 7 | `:225` | `observed_strict_arch_elf_x86_64_writer` | ✅ 命中 | 未删 |
| 8 | `:226` | `observed_strict_arch_regalloc_aarch64_adapter` | ✅ 命中 | 未删 |
| 9 | `:228` | `observed_strict_arch_regalloc_riscv_adapter` | ✅ 命中 | 未删 |
| 10 | `:229` | `observed_strict_arch_regalloc_x86_64_adapter` | ✅ 命中 | 未删 |
| 11 | `:231` | `observed_strict_arch_x86_64_body_emit` | ✅ 命中 | 未删 |

**未删的余 4 行**（`= 剩余 arch 数 4`，切片落地第一判据）：`:220` `aarch64_encode`、`:221` `codegen_a64_fill_units`、
`:227` `regalloc_production_encoder_events`、`:230` `riscv64_encode` —— 与本轮反事实实测的剩余 arch 逐名一致（§3.V3）。

**完成度：0 / 14 项（E3 6 项 + E4 3 项 + E2 3 项 + manifest 11 行 = 23 个可独立核对单元中的 0 个落地；全部前置核查完成）。**

---

## 2. 每项改前/改后原文对照

> 约定：**改前** = 当前 HEAD 逐字原文（本轮已 `grep`/`awk` 逐条点名核实）。
> **改后** 只有在规格闭合时才给出；未闭合的写「未定 + 阻塞编号」，不编造。

### 2.1 S1 / E3

#### 项 1 —— 门面删 4 条 arch import

文件：`src/core/backend/codegen_writer_units.cheng`（施工图 `:122` 记 `:22-25`）
**锚点核实：零漂移，命中 `:22-25`。**

改前（`:22-25` 逐字）：
```
import cheng/core/backend/elf_x86_64_writer
import cheng/core/backend/elf_riscv64_writer
import cheng/core/backend/elf_riscv32_writer
import cheng/core/backend/elf_riscv64_linker
```
改后：4 行删除。**但仅删这 4 行不可编译** —— 同文件 4 个函数体仍直调这些模块（改前原文）：
```
 38:        return elf_x86_64_writer.ElfX64TextDataObjectBytes(text, data, symbols, relocs)
 40:        return elf_riscv64_writer.ElfRv64TextDataObjectBytes(text, data, symbols, relocs)
 42:        return elf_riscv32_writer.ElfRv32TextDataObjectBytes(text, data, symbols, relocs)
 44:        return elf_riscv32_writer.ElfRv32IntegerTextDataObjectBytes(text, data, symbols, relocs)
 59:        let elfRes = elf_x86_64_writer.ElfX64TextObjectWrite(rootDir, outputPath, text, symbols, relocs)
 80:        let elfRes = elf_x86_64_writer.ElfX64TextDataObjectWrite(rootDir, outputPath, text, data, symbols, relocs)
 90:        let elfRes = elf_riscv64_writer.ElfRv64TextDataObjectWrite(rootDir, outputPath, text, data, symbols, relocs)
100:        let elfRes = elf_riscv32_writer.ElfRv32TextDataObjectWrite(rootDir, outputPath, text, data, symbols, relocs)
110:        let elfRes = elf_riscv32_writer.ElfRv32IntegerTextDataObjectWrite(rootDir, outputPath, text, data, symbols, relocs)
134:        return elf_riscv64_linker.ElfRv64LinkExe(objPaths, outputPath, target)
```
「这 14 行 token 随之消失」的**去处未定义** ⇒ 见 **§5.G3**。**本项改后文本：未定，未实施。**

涉及函数（改前声明行，已核实）：`CodegenWriterUnitTextDataObjectBytes`、`CodegenWriterUnitTextObjectWrite`（`:48`）、
`CodegenWriterUnitTextDataObjectWrite`（`:71`）、`CodegenWriterUnitLinkExeBuiltin`（`:121`）。

#### 项 2a —— `direct_object_emit.cheng:224`

文件：`src/core/backend/direct_object_emit.cheng`，函数 `DirectObjectEmitWriteObjectTextOnly`（声明 `:205`，施工图 `:123` 记 `:205`）
**锚点核实：零漂移。**

改前（`:221-230`）：
```
    if plan.objectFormat == "elf":
        if contract.CodegenElfTextDataWriterUnit(plan.targetTriple) ==
           contract.CodegenUnitX64:
            let elfRes = wunits.CodegenWriterUnitTextObjectWrite(
                    contract.CodegenUnitX64,
                    rootDir,
                    plan.outputPath,
                    text,
                    symbols,
                    relocs)
```
改后（施工图 `:123` 要求：`append(op=WriterTextObjectWrite) → ready? → at()`）：**未定，未实施**。
注：`:222-223` 的 gate 是 **contract** 调用（非门面），本刀不动它 —— 与设计 §3.2 示例一致。
该处返回型为 `Result[DirectObjectEmitResult]`，pending 第三态落法见 **§5.G1**。

#### 项 2b —— `direct_object_emit.cheng:372`

函数 `DirectObjectEmitWriteObjectForFormat`（声明 `:345`，施工图 `:124` 记 `:345`）。**锚点核实：零漂移。**

改前（`:368-373`）：
```
    if objectFormat == "elf":
        let tripleOwned = strings.CloneStr(plan.targetTriple)
        let writerUnit = contract.CodegenElfTextDataWriterUnit(tripleOwned)
        if writerUnit != contract.CodegenUnitInvalid:
            let elfRes = wunits.CodegenWriterUnitTextDataObjectWrite(
                    writerUnit, ownedRoot, ownedPath, text, data, symbols, relocs)
```
改后：**未定，未实施。** 返回型 `bool` + `err` 出参，pending 第三态落法见 **§5.G1**。

#### 项 2c —— `direct_object_emit.cheng:483`

函数 `DirectObjectEmitWriteObjectPathForFormatInto`（声明 `:458`，施工图 `:125` 记 `:458`）。**锚点核实：零漂移。**

改前（`:479-484`）：
```
    if objectFormat == "elf":
        let tripleOwned = strings.CloneStr(plan.targetTriple)
        let writerUnit = contract.CodegenElfTextDataWriterUnit(tripleOwned)
        if writerUnit != contract.CodegenUnitInvalid:
            let elfRes = wunits.CodegenWriterUnitTextDataObjectWrite(
                    writerUnit, ownedRoot, ownedPath, text, data, symbols, relocs)
```
改后：**未定，未实施。**

#### 项 2d —— `direct_object_emit.cheng:4732`

函数 `DirectObjectEmitPlanObjectBytesInto`（声明 `:4697`，施工图 `:126` 记 `:4697`）。**锚点核实：零漂移。**

改前（`:4729-4741`）：
```
    elif plan.objectFormat == "elf" &&
         contract.CodegenElfTextDataWriterUnit(plan.targetTriple) ==
             contract.CodegenUnitX64:
        bytesRes = wunits.CodegenWriterUnitTextDataObjectBytes(
            contract.CodegenUnitX64, text, data, symbols, relocs)
    elif plan.objectFormat == "elf" &&
         (plan.targetTriple == "aarch64-unknown-linux-gnu" ||
          plan.targetTriple == "arm64-unknown-linux-gnu" ||
          plan.targetTriple == "aarch64-linux-android" ||
          plan.targetTriple == "aarch64-linux-ohos" ||
          plan.targetTriple == "aarch64-unknown-linux-ohos"):
        bytesRes = elf_object_writer.ElfTextDataObjectBytes(
            text, data, symbols, relocs)
```
改后：**未定，未实施。** 已按施工图 `:126` 核实：`:4734-4741` 的 aarch64 臂直调 `elf_object_writer`（shared-format，不经门面），**本刀不动它 ✅**。

#### 项 2e —— 删调用方 import

| 文件 | 行 | 改前逐字 | 锚点 |
|---|---|---|---|
| `direct_object_emit.cheng` | `:23` | `import cheng/core/backend/codegen_writer_units as wunits` | ✅ 零漂移 |
| `native_object_emission_plan.cheng` | `:8` | `import cheng/core/backend/codegen_writer_units as wunits` | ✅ 零漂移 |
| `native_link_exec.cheng` | `:9` | `import cheng/core/backend/codegen_writer_units as wunits` | ✅ 零漂移 |

改后：3 行删除（必须与 2a–2d、项 3、项 4 同刀）。**未实施。**

#### 项 2f —— S4-D 缺件臂保留

已核实 `direct_object_emit.cheng:275 / :407 / :506` 的 `contract.CodegenPluginMissingError` 臂在位，
**本刀不动**（施工图 `:128`）。状态：✅ 已核实，无需改动。

#### 项 3 —— `native_object_emission_plan.cheng:389`

函数 `NativeObjectEmissionPlanEmitInto`（声明 `:358`，施工图 `:129` 记 `:358`）。**锚点核实：零漂移。**

改前（`:384-394`）：
```
    elif plan.objectFormat == "elf":
        let tripleOwned = strings.CloneStr(plan.targetTriple)
        let writerUnit = contract.CodegenElfTextDataWriterUnit(tripleOwned)
        if writerUnit != contract.CodegenUnitInvalid:
            bytesResult =
                wunits.CodegenWriterUnitTextDataObjectBytes(
                    writerUnit,
                    plan.text,
                    plan.data,
                    plan.symbols,
                    plan.relocs)
```
施工图 `:129` 说「此处已有 `writerUnit` 局部（`:386`），直接当 `unitId` 用」—— **已核实 `:386` 确实存在 `let writerUnit = ...` ✅。**
改后：**未定，未实施。**

#### 项 4 —— `native_link_exec.cheng:373`

函数 `NativeLinkExecRunSelfLinker`（声明 `:304`，施工图 `:130` 记 `:304`）。**锚点核实：零漂移。**

改前（`:372-382`）：
```
    elif linkerFlavor == "elf_riscv64_builtin":
        let linkRes = wunits.CodegenWriterUnitLinkExeBuiltin(
            contract.CodegenUnitRv64, linkInputPaths, outputPath, targetTriple)
        if !linkRes.ok:
            let errMsg = linkRes.err.msg
            let outputText = strutil.Join([share(errMsg), "\n"], "")
            let _logged = chengpath.WriteTextFile(rootDir, logPath, outputText)
            return hostops.LoggedRunZero(label, linkerProgram, chengpath.PathAbsolute(rootDir, logPath), 1, outputText)
        let outputText = strutil.Join([share(outputPath), " OK\n"], "")
        let _logged = chengpath.WriteTextFile(rootDir, logPath, outputText)
        return hostops.LoggedRunZero(label, linkerProgram, chengpath.PathAbsolute(rootDir, logPath), 0, outputText)
```
**已核实施工图 `:130` 的风险描述属实**：`:375-379` 把 `!linkRes.ok` 写进 log 并以 rc=1 返回；
轨的 pending 若塞进 `Err` 会被当**链接失败写盘**。pending 第三态落法见 **§5.G1**。改后：**未定，未实施。**

### 2.2 S2 / E4

#### 项 1 —— 门面删 3 条 arch import

文件：`src/core/backend/codegen_regalloc_adapter_units.cheng`（施工图 `:141` 记 `:26-28`）。**锚点核实：零漂移。**

改前（`:26-28`）：
```
import cheng/core/backend/regalloc_aarch64_adapter as a64adapter
import cheng/core/backend/regalloc_x86_64_adapter as x8664adapter
import cheng/core/backend/regalloc_riscv_adapter as riscvadapter
```
改后：3 行删除。**但仅删不可编译**：函数体 `:41/:45/:49/:53` 仍直调三个 adapter。
施工图 `:141` 记本文件 token = `:26,27,45` 3 行 —— **已核实**：`:28`（`regalloc_riscv_adapter`）不含任何 `ARCH_TOKENS`
子串（`riscv_adapter` ≠ `riscv64`/`riscv32`），`:45` 的 `x8664adapter.` 命中 `x8664` ✅ 计数自洽。
**本项改后文本：未定（同 G3），未实施。**

#### 项 2a —— `regalloc_production_emitter.cheng:1005`

文件：`src/core/backend/regalloc_production_emitter.cheng`。**锚点核实：零漂移，命中 `:1005`。**

改前（`:997-1009`）：
```
    let symbolNameOwned = strings.CloneStr(symbolName)
    # B2 同形（codegen_writer_units 门面裁定）：frozen stage3 下托管对象过 fn
    # 值槽间接调用在返回/释放期 registry_miss（实锤：本分发旧走契约 fn 槽返回
    # RegallocA64FunctionRecipes 时 ORC abort）。按 unitId 直调 adapter
    # 模块入口，零间接调用；上方 triple 枚举与注册硬门不变，unitId 必中一臂。
    # 值传 str 过参即消费（stage3 方言），门面内按臂各持一份 CloneStr。
    # B8（2026-08-29）：四臂直调经 shared-format 门面 codegen_regalloc_adapter_units
    # 收编（同 B2/B7 门面形态，零间接调用），本文件零 arch import。
    out.recipes = radapter.CodegenRegallocAdapterUnitPrepareFunctionRecipes(
        unitId, bodyIR, out.plan, strings.CloneStr(symbolNameOwned),
        out.encoderSourceRow, out.encoderSourceCid,
        dataSymbolProjection.slotDataSymbols,
        dataSymbolProjection.cstringDataSymbols)
```
改后：**未定，未实施。** 施工图 `:142` 自标"全切片最难一处"：入参含 `var coreir.BodyIR`、
`var alloc.RegallocSinglePassValuePlan`、两个 **var 写回** `str[]`（`:1008-1009`）。见 **§5.G4**。

#### 项 2b —— `:979-982` 注册硬门保留

改前（逐字，**保留不动**）：
```
    if !contract.CodegenUnitPrepareRecipesRegistered(unitId):
        regallocProductionEmitFail(
            out, RegallocProductionEmitTargetUnsupported, unitId)
        return false
```
**锚点核实：零漂移，命中 `:979-982`**，与施工图 `:143` 一致。状态：✅ 已核实，无需改动。

#### 项 2c —— 删调用方 import

| 文件 | 行 | 改前逐字 | 锚点 |
|---|---|---|---|
| `regalloc_production_emitter.cheng` | `:4` | `import cheng/core/backend/codegen_regalloc_adapter_units as radapter` | ✅ 零漂移 |

改后：删除（必须与 2a 同刀）。**未实施。**

### 2.3 S3 / E2

#### 项 1 —— 门面删 arch import

文件：`src/core/backend/codegen_x64_body_units.cheng`（施工图 `:154` 记 `:24`）。**锚点核实：零漂移。**

改前（`:24`）：
```
import cheng/core/backend/x86_64_body_emit as x64body
```
改后：1 行删除；同文件 `:28,32,36,40,44,48,52,56,60,64` 十处 `x64body.*` 直调随之需处置 —— **未定（同 G3），未实施。**

#### 项 3 —— 删调用方 import

| 文件 | 行 | 改前逐字 | 锚点 |
|---|---|---|---|
| `primary_object_plan.cheng` | `:11` | `import cheng/core/backend/codegen_x64_body_units as x64units` | ✅ 内容命中（行号未漂） |

改后：删除（必须与 15 处改写同刀）。**未实施。**

### 2.4 ⚠️ 施工图与 HEAD 不符点：`primary_object_plan.cheng` 的 15 处**整体漂移**

**这是本轮唯一一处「施工图与 HEAD 不符」。** 不符点、判断、打算怎么改如下。

**不符点**：施工图 `:163-169` 的 15 个行号在当前 HEAD **全部失效**（函数归属与符号名完全一致，仅行号漂）：

| 函数（施工图声明行 → **HEAD 实测**） | 处数 | 施工图行号 → **HEAD 实测行号** |
|---|---|---|
| `PrimaryBodyIrAppendCallCStringArgRelocsX64`（`:62804` → **`:62816`**） | 5 | `:62822,62824,62851,62854,62882` → **`:62834,62836,62863,62866,62894`** |
| `PrimaryBodyIrAppendCStringArgRelocs`（`:62887` → **`:62899`**） | 3 | `:62916,63000,63007` → **`:62928,63012,63019`** |
| `PrimaryBodyIrAppendGlobalOpRelocs`（`:63012` → **`:63024`**） | 3 | `:63038,63102,63109` → **`:63050,63114,63121`** |
| `PrimaryBodyIrWordCountForTarget`（`:3046` → **`:3046`**） | 1 | `:3064` → **`:3064`**（未漂） |
| `PrimaryBodyIrPrepareTargetMetricsInPlace`（`:64526` → **`:64538`**） | 1 | `:64535` → **`:64547`** |
| `PrimaryObjectPlanEnsureFunctionLowered`（`:67171` → **`:67183`**） | 1 | `:67331` → **`:67343`** |
| `PrimaryObjectPlanBuildItemsPhase`（`:74811` → **`:74773`**） | 1 | `:75980` → **`:75942`** |
| **合计** | **15 ✅** | 15 处全部内容命中 |

漂移形状：前 6 组统一 **+12**，最后 1 组 **−38**（`PrimaryObjectPlanBuildItemsPhase` 声明行从 `:74811` 退到 `:74773`）。
即：文件在 `:62816` 之前被插入 12 行，在 `:67343`–`75942` 之间被净删 50 行。

**我的判断**：**施工图自身的警告是对的，且这不算施工图错误，只是必须按内容定位。**
施工图 `:171-173` 已写明「设计读树后 `primary_object_plan.cheng` 又被改过（见 §4），
**所有锚点必须按内容而非行号定位**」；施工图 §4.1 `:407-413` 也记了同一现象。
本轮实测进一步确认：**结构、函数归属、15 处计数、符号名 100% 完好**，
只有行号漂；且施工图 §4.1 记录的 76+/8− WIP 已落地（该文件当前 `git status` 干净，mtime `2026-09-10 23:41:57`）。

**我打算怎么改**：不改施工图（它是只读分析产出，且多线在写文档）。
在实施时**一律用 `grep -n 'x64units\.'` 的实测行号**（= 上表 HEAD 实测列），不用施工图行号。
施工图 §4.1 `:415-428` 要求的「动 E2 前先确认静默 + 只读留底」在本轮**无法满足**：
该文件 mtime 距本轮已 3.5 h（>10 min 门槛 ✅），但它属于热文件，需在真正开路前再查一次。

**不确定项（标注，不猜）**：−38 行漂移发生在 `:67343`–`75942` 之间，本轮**未逐 hunk 归因**是谁改的
（可能是 §4.1 记的那条 WIP 落地 + 后续 commit）。这不影响内容定位，故未深挖；若主线程需要归因，可 `git log -p` 追。

### 2.5 11 行 manifest 改前原文（改后 = 整行删除）

文件：`bootstrap/kernel_manifest.cheng`。**全部 11 行锚点核实：零漂移，逐字命中。**

```
 28|backend_codegen_writer_units_source = src/core/backend/codegen_writer_units.cheng  # keep/shared-format B2 writer/linker unit 直连门面（tsv: shared-format；doe/nle/noep 经此直抵各 arch writer，cf coff_object_linker arch 钩子先例）
 30|backend_codegen_x64_body_units_source = src/core/backend/codegen_x64_body_units.cheng  # keep/shared-format B4 x86_64 body 布局/sizing unit 直连门面（tsv: shared-format；pop 经此直抵 x86_64_body_emit 布局入口）
 59|closure_src_core_backend_codegen_regalloc_adapter_units_source = src/core/backend/codegen_regalloc_adapter_units.cheng
222|observed_strict_arch_elf_riscv32_writer = src/core/backend/elf_riscv32_writer.cheng
223|observed_strict_arch_elf_riscv64_linker = src/core/backend/elf_riscv64_linker.cheng
224|observed_strict_arch_elf_riscv64_writer = src/core/backend/elf_riscv64_writer.cheng
225|observed_strict_arch_elf_x86_64_writer = src/core/backend/elf_x86_64_writer.cheng
226|observed_strict_arch_regalloc_aarch64_adapter = src/core/backend/regalloc_aarch64_adapter.cheng
228|observed_strict_arch_regalloc_riscv_adapter = src/core/backend/regalloc_riscv_adapter.cheng
229|observed_strict_arch_regalloc_x86_64_adapter = src/core/backend/regalloc_x86_64_adapter.cheng
231|observed_strict_arch_x86_64_body_emit = src/core/backend/x86_64_body_emit.cheng
```
改后：以上 11 行整行删除（含 `:28`/`:30` 的行尾 `#` 注释一并删）。

**必须保留的 4 行**（逐字，**不得删**）：
```
220|observed_strict_arch_aarch64_encode = src/core/backend/aarch64_encode.cheng
221|observed_strict_arch_codegen_a64_fill_units = src/core/backend/codegen_a64_fill_units.cheng
227|observed_strict_arch_regalloc_production_encoder_events = src/core/backend/regalloc_production_encoder_events.cheng
230|observed_strict_arch_riscv64_encode = src/core/backend/riscv64_encode.cheng
```

---

## 3. 验证记录（命令 + 原始输出 + rc）

### V1 —— 判定门是否纯静态（本任务纪律前提）

命令：
```
grep -n 'subprocess\|os\.system\|popen\|execv\|fork\|cc1\|clang\|gcc' tools/kernel_plugin_closure_check.py
```
原始输出：
```
364:    import subprocess
366:        out = subprocess.run(["git", "-C", str(root), "ls-files", "--", "*.cheng"],
368:    except subprocess.CalledProcessError as exc:
392:    import subprocess
394:        out = subprocess.run(["git", "-C", str(root), "ls-files", "--", "*.cheng"],
396:    except subprocess.CalledProcessError as exc:
```
rc=0。

**结论：纯静态。** 全文件仅 2 处 `subprocess`，均为 `git ls-files -- '*.cheng'`（只读索引，不编译、不起驱动）。
其余全部是 `Path.read_text` + 正则 + BFS。⇒ **可反复跑。** 与施工图 §1/§5 的用法一致。

### V2 —— 基线复现（施工图 `:10-14` 的 oracle）

命令：
```
python3 tools/kernel_plugin_closure_check.py --require-strict-closure
```
原始输出（尾部汇总，逐字）：
```
==== strict kernel closure summary ====
strict_manifest=bootstrap/kernel_manifest.cheng
strict_entry_roots=src/core/tooling/compiler_composition_kernel_main.cheng
strict_manifest_sources=194 strict_core_closure_files=194
strict_manifest_unreachable=0 strict_closure_unmanifested=0
strict_arch_reachable_files=12
strict_arch_token_files=30 strict_arch_token_lines=342
result: FAIL_STRICT (violations=42 manifest_unreachable=0 closure_unmanifested=0 arch_reachable=12 arch_token_files=30)
```
**rc=1。**

**与施工图 `:10-14` 逐字相同 ✅**（194/194、0/0、12、30/342、42、rc=1）。

### V3 —— 反事实 oracle 在 HEAD 重验（施工图 §2 脚本）

命令：（把施工图 §2 的脚本当模块导入门自身函数、只在内存切边，不落盘 —— 见本轮脚本；
`print` 增加剩余 arch 逐名与反推的 manifest 删除清单）

原始输出：
```
NONE           closure=194 arch=12 token_files=30 token_lines=342 unreachable=0 unmanifested=0 violations=42
E3             closure=189 arch=8 token_files=29 token_lines=328 unreachable=5 unmanifested=0 violations=37
   manifest lines to delete: backend_codegen_writer_units_source, observed_strict_arch_elf_riscv32_writer, observed_strict_arch_elf_riscv64_linker, observed_strict_arch_elf_riscv64_writer, observed_strict_arch_elf_x86_64_writer
E3+E4          closure=185 arch=5 token_files=28 token_lines=325 unreachable=9 unmanifested=0 violations=33
   manifest lines to delete: backend_codegen_writer_units_source, closure_src_core_backend_codegen_regalloc_adapter_units_source, observed_strict_arch_elf_riscv32_writer, observed_strict_arch_elf_riscv64_linker, observed_strict_arch_elf_riscv64_writer, observed_strict_arch_elf_x86_64_writer, observed_strict_arch_regalloc_aarch64_adapter, observed_strict_arch_regalloc_riscv_adapter, observed_strict_arch_regalloc_x86_64_adapter
   arch names: aarch64_encode.cheng, codegen_a64_fill_units.cheng, regalloc_production_encoder_events.cheng, riscv64_encode.cheng, x86_64_body_emit.cheng
E3+E4+E2       closure=183 arch=4 token_files=27 token_lines=324 unreachable=11 unmanifested=0 violations=31
   manifest lines to delete: backend_codegen_writer_units_source, backend_codegen_x64_body_units_source, closure_src_core_backend_codegen_regalloc_adapter_units_source, observed_strict_arch_elf_riscv32_writer, observed_strict_arch_elf_riscv64_linker, observed_strict_arch_elf_riscv64_writer, observed_strict_arch_elf_x86_64_writer, observed_strict_arch_regalloc_aarch64_adapter, observed_strict_arch_regalloc_riscv_adapter, observed_strict_arch_regalloc_x86_64_adapter, observed_strict_arch_x86_64_body_emit
   arch names: aarch64_encode.cheng, codegen_a64_fill_units.cheng, regalloc_production_encoder_events.cheng, riscv64_encode.cheng
E3+E4+E5       closure=183 arch=3 token_files=28 token_lines=325 unreachable=11 unmanifested=0 violations=31
```
**rc=0。**

**判定**：
- 施工图 §5.1 逐步期望表（`189/8/29/328/37` → `185/5/28/325/33` → **`183/4/27/324/31`**）**在 HEAD 上全部精确命中 ✅**。
- 反推的 11 行 manifest 与施工图 `:181-184` **逐字一致 ✅**；剩余 arch 逐名 = `aarch64_encode`/`codegen_a64_fill_units`/
  `regalloc_production_encoder_events`/`riscv64_encode`，与保留的 `:220 :221 :227 :230` **逐名一致 ✅**。
- ⇒ 施工图 §5.1 表可**直接当 oracle 用**（施工图 `:276-278` 的"替代对拍法"成立），无需再跑反事实。
- 附注：`E3+E4+E5` 本轮实测 `closure=183`，施工图 §6.2/设计 §3.1 记 `182`。**本轮的 E5 切法不完整**
  （未切 `codegen_encoder_event_units` 的调用方，施工图 §7 未验证项 3 亦记该组"未复现"），
  故**不作为对设计的分歧**，仅记录。

### V4 —— 同刀律（施工图 §0.2 的核心修正）复验

命令：同上脚本，`CALLER_CUTS` 开/关两跑。

原始输出：
```
CALLER_CUTS=False closure=186 arch=4 token_files=30 token_lines=342 facades_still_in_closure=['E3', 'E4', 'E2']
CALLER_CUTS=True  closure=183 arch=4 token_files=27 token_lines=324 facades_still_in_closure=[]
```
**rc=0。**

**判定：施工图 §0.2 完全成立 ✅** —— 只切门面自身 arch import（不切调用方）时，三个门面**仍留在闭包内**
（186/4/**30/342**）；把调用方 → 门面的 import 一并切掉后才是 183/4/**27/324**。
⇒ 施工图 `:50-52` 的「施工推论：每刀必须是『调用方改写 + 删调用方 import + 删门面自身 arch import + 删 manifest 对应行』的同一步」**实证成立**，
本轮据此**拒绝**任何分批落地的做法。

### V5 —— 调用方全集完备性（证明切口清单是闭集）

命令：
```
grep -rn 'import cheng/core/backend/codegen_writer_units' src/
grep -rn 'import cheng/core/backend/codegen_regalloc_adapter_units' src/
grep -rn 'import cheng/core/backend/codegen_x64_body_units' src/
```
原始输出（内核侧）：
```
src/core/backend/native_object_emission_plan.cheng:8:import cheng/core/backend/codegen_writer_units as wunits
src/core/backend/direct_object_emit.cheng:23:import cheng/core/backend/codegen_writer_units as wunits
src/core/backend/native_link_exec.cheng:9:import cheng/core/backend/codegen_writer_units as wunits
src/core/backend/regalloc_production_emitter.cheng:4:import cheng/core/backend/codegen_regalloc_adapter_units as radapter
src/core/backend/primary_object_plan.cheng:11:import cheng/core/backend/codegen_x64_body_units as x64units
```
rc=0。

**判定 ✅**：`src/core` 内三个门面的 importer **恰好**是施工图列的 3+1+1 个调用方，无遗漏。
这与 V3 的 `closure=183`（三个门面全部出闭包）互为独立佐证。

**但同一条命令暴露了施工图未列的 2 个消费方**（在 `src/core` 之外，门看不见）：
```
src/tests/b2_writer_units_dispatch_smoke.cheng:13:import cheng/core/backend/codegen_writer_units as wunits
src/tests/b4_x64_body_units_dispatch_smoke.cheng:9:import cheng/core/backend/x86_64_body_emit as x64
src/tests/b4_x64_body_units_dispatch_smoke.cheng:10:import cheng/core/backend/codegen_x64_body_units as units
```
⇒ 见 **§5.G5**。

### V6 —— 收口自检：确认本轮零漂移

命令：
```
python3 tools/kernel_plugin_closure_check.py --require-strict-closure   # 第二次跑
diff -q <baseline> <after>
git diff --numstat
```
原始输出：
```
rc=1
IDENTICAL to baseline (zero drift)
```
**判定 ✅**：两次运行逐字节相同；本轮**未改任何被门消费的文件**。

---

## 4. 待槽位验证清单（本轮**无法**执行，编译槽空闲后按序做）

> 全部属于「需要编译器/驱动」的动作。本轮**一次都没跑**（§6 纪律回执）。

| # | 动作 | 命令 | 期望 | 阻塞原因 |
|---|---|---|---|---|
| W1 | **S0.5 内核可续跑性实测**（施工图 `:104-111`，本切片成立前提） | 构造只调两次 `CompilerMainCompositionProcessEntry()` 的最小驱动，或临时探针后还原 | 判定 `(a)` 是否 abort/HARD_RED/重复解析 argv；`(b)` 若存活，第二轮是否从零重跑 | **必须先做**；决定 S1 是形态 A / B / "先做 B" |
| W2 | kernel 驱动构建 | `tools/build_kernel_driver.sh --manifest bootstrap/kernel_manifest.cheng --out <scratch>/cheng-kernel` | rc=0；`composition_kind=kernel-only`；`composition_plugin_canonical_triple=-`；`composition_source_closure_count` 非零 | 每步都必须过（施工图 §5.2） |
| W3 | 插件驱动构建 | `tools/build_plugin_driver.sh --arch aarch64` | rc=0；产物 `artifacts/kernel_drivers/aarch64/cheng-aarch64` | 同上；**本轮未验证其在现树是否已跑通**（施工图 §7 未验证项 5） |
| W4 | 四夹具门 | `tools/user_path_gate.sh --driver <plugin-driver> --baseline docs/campaigns/2026-08-31-kernel-userpath/user_path_baseline.tsv` | `pass=4 known_red=0 stale=0`；**不带** `--require-probes-green`（探针区 7 红非本切片的红） | 需 W3 产物 |
| W5 | **字节回执 / exec_diff** | 插件驱动与原 kernel 驱动对同一夹具的对象字节逐字节对拍 | 逐字节相等 | **S1 唯一能证明"切口落在运行路径且语义等价"的证据**（施工图 §5.3） |
| W6 | kernel-only 负例回归 | 用 W2 驱动跑夹具 | rc≠0 且 stderr 恰 1 行 = `codegen_plugin_missing=<BUILD_TARGET>` | **⚠️ 见 §5.G6：这条今天已绿，不得当落地证据** |
| W7 | 门面 arch import 删除后的自证 | `grep -c 'elf_\(x86_64\|riscv64\|riscv32\)_writer\|elf_riscv64_linker' src/core/backend/codegen_writer_units.cheng` → 应为 0 | 0 | 门对此**无覆盖**（施工图 §0.3），只能 grep + 构建自证 |
| W8 | 判词门复核（若 C 类文案被改） | `bash tools/direct_object_symbol_identity_fail_closed_gate.sh`、`bash tools/backend_dispatch_readonly_borrow_static_gate.sh` | 均 rc=0 | 本轮未改文案，故未跑；施工图 §3.3 C1-a 要求改完必跑 |
| W9 | S0 落地后的编译自证 | 同 W2/W3 | rc=0 | `codegen_contract.cheng` 在 `ARCH_TOKEN_CONTRACT_FILES` 豁免区，**门对新代码零覆盖**（施工图 `:77`） |

---

## 5. 阻塞项与不确定项

### G1 —— pending「第三态」在四个调用点各是什么，全切片未定义【阻塞】

施工图 `:130` 自己指出：`native_link_exec:375-379` 把 `!linkRes.ok` 当**链接失败写盘并以 rc=1 返回**，
所以「轨的 pending **必须是第三态**，不能塞进 `Err`」。**但施工图与设计都没给出第三态的表示。**

四个调用点的**返回型各不相同**，一个 `CodegenPluginPendingBytes()` 覆盖不了：

| 调用点 | 返回型/出参 | 设计 §3.2 示例是否适用 |
|---|---|---|
| `direct_object_emit:224` | `Result[DirectObjectEmitResult]` | ❌ 示例给的是 `CodegenPluginPendingBytes()`（Bytes 形） |
| `direct_object_emit:372` | `bool` + `var str err` | ❌ |
| `direct_object_emit:483` | `bool` + `var str outErr` | ❌ |
| `direct_object_emit:4732` | `var Result[Bytes] bytesRes` | ✅ 唯一命中示例 |
| `native_object_emission_plan:389` | `var Result[Bytes]`（聚合） | ✅ 近似 |
| `native_link_exec:373` | `Result[bool]` → `hostops.LoggedRun`（rc 语义） | ❌ 且有"pending 不得当失败写盘"的硬约束 |

**判断**：这不是实现细节，是**轨的控制面语义**，且与 S0.5 的形态选择（A/B）强耦合。
**必须先定，不能猜。** 需要的决策：每一类返回型上 pending 的编码方式
（新增 `Result` 第三态？还是每类各一个 `CodegenPluginPendingX()` 哨兵？还是像设计示例那样只对 Bytes 形成立、其余调用点改形态？）

### G2 —— `CodegenPluginRequestAppend` 签名与行存储未闭合【阻塞】

设计 §3.2 小节标题逐字为「### 3.2 轨的最小形态（**设计草案**，`codegen_contract.cheng` 内）」，且：

- 函数签名写作 `fn CodegenPluginRequestAppend(...): int32` —— **参数表是省略号**。
  可推的部分：`CodegenPluginRequestRow` 有 6 个字段，示例调用传 6 个实参且顺序一致（可推）。
  **不可推的部分：行存储**（arena？SoA 数组？容量？编译轮之间如何重置？与 `CodegenComposition*` 状态机的关系？）
  —— 全篇未提。
- **符号表不一致**：施工图 `:73` 的 S0 符号集是 `…RequestAppend` / `…ResultReady` / `…ResultAt`；
  但设计 `:253` 的调用点示例用的是 `contract.CodegenPluginObjectBytes(ordinal)`（**不在 S0 符号集内**）。
  同时示例还用了 `contract.CodegenPluginPendingBytes()` —— **同样不在 S0 符号集内**（且见 G1）。

**判断**：`codegen_contract.cheng` 是全仓**唯一耦合面**（施工图 `:77`、禁止项 ⑥⑪ 都点了它的盲区），
在没有确定行存储语义前写进去，等于把不确定塞进无门区。**停下来报告，不猜。**
需要的决策：行存储形态 + 三个函数的最终签名（含 pending/bytes 访问器是否进 S0）。

### G3 —— 门面 4 个（E3）/ 3 个（E4）/ 1 个（E2）函数体的**去处**未定义【阻塞】

- 施工图 `:122` 项 1 只写「删 4 条 arch import」，并说「此文件其余 14 行 token **随之消失**」。
- 设计 `:202` 写「删 4 条 arch import，**4 个函数体的直调消失**（文件随之出闭包）」。

**两边都说了直调要消失，都没说消失之后是什么。** 而删掉 import 后函数体（§2.1 项 1 已列 10 处）会引用
未定义模块 ⇒ **不可编译**。三种可能的读法，本轮**无法从文档判定**：

| 读法 | 内容 | 后果 |
|---|---|---|
| (i) 门面变插件侧 | 门面整体搬到组合根侧，kernel 不再 import；arch import **保留** | 与施工图"删 4 条 arch import"矛盾 |
| (ii) 门面留内核但体改成轨请求 | 门面自己也 append/ready/at | 那它仍在内核，为何会"出闭包"？与 V3 的 183（门面真出闭包）矛盾 |
| (iii) 门面留树但内核侧不再引用，体保持原样**不删 import** | 只切调用方 import | 与施工图 §0.3「删除门面 arch import 这半步没有门禁」的表述矛盾 |

**判断**：**(iii) 与 V3/V4 的实测最自洽**（切调用方即出闭包，无需动门面体），
但施工图与设计**都明文写了要删门面的 arch import**，两者不能同时为真。**这是文档级矛盾，不是我能裁的。**
需要决策：E3/E4/E2 三门面**是 (iii) 只切调用方，还是必须连体一起改**；若必须改，改成什么。

### G4 —— E4 的 `var str[]` 写回过轨是否支持【阻塞，施工图已自标】

施工图 `:142` 自标「这是全切片最难一处」；§6.4 风险 6（`:607`）自标
「若 A/B 都不支持 var 写回过轨，E4 单独降级/延后，E2 补 ≤4」。
`regalloc_production_emitter:1008-1009` 的 `dataSymbolProjection.slotDataSymbols` / `cstringDataSymbols`
是两个 **var `str[]` 写回**，施工图要求「按设计 §3.1 把两个 `str[]` 化成请求计划里的 SoA 行」——
**但设计 §3.1 里没有这条 SoA 化的规格**（§3.1 只有切口文件清单）。
**判断**：E4 的可行性本身是**未决项**，取决于 S0.5 的形态结论。**未实施，未猜。**

### G5 —— 施工图未列的 2 个消费方（**本轮新增发现**）【需决策】

`src/core` 之外还有两个直接消费门面的测试，**门看不见**（严格门只遍历 `src/core/**`）：

| 文件 | 行 | 内容 |
|---|---|---|
| `src/tests/b2_writer_units_dispatch_smoke.cheng` | `:13` | `import cheng/core/backend/codegen_writer_units as wunits` |
| `src/tests/b4_x64_body_units_dispatch_smoke.cheng` | `:9` | `import cheng/core/backend/x86_64_body_emit as x64` |
| `src/tests/b4_x64_body_units_dispatch_smoke.cheng` | `:10` | `import cheng/core/backend/codegen_x64_body_units as units` |

- 施工图 §3.3 的「切口文件」清单（`:200-207`）与设计 §3.1 **都未列这两个文件**。
- 现状：它们**未被任何门/工具构建**（`grep` 全仓 `.sh/.py/.cheng`，除自身外只命中 `progress.md:1295,1315`，
  即它们当初的落地回执）。⇒ **本轮判定：不阻塞静态门。**
- **但**：`b2` 那个是**派发语义专项**（`progress.md:1295` 记它运行级实证 5 arch 组合派发正确 +
  5 共享格式 Invalid 面 + 3 缺组合 Err 路径），`b4` 那个是**门面十槽 A/B 一致性**专项（`progress.md:1315`）。
  E3/E2 切口一落，这两个断言的对象（门面的 arch 派发臂）就不复存在，**两个 smoke 会失去意义或跑不通**。
- **需决策**：(a) 随刀改写成轨形态的 smoke；(b) 显式废弃并删；(c) 保留不管。
  **本轮不擅自动**（用户纪律：改动面严格限定施工图列的项）。

### G6 —— kernel-only 负例不具判据力（施工图已校正，本轮复核确认）

施工图 §5.4（`:503-525`）判定该负例"今天就绿、对 E3 做没做完全无差别"。
本轮**只做静态复核**：`codegen_contract.cheng:561-566` 的 `CodegenCompositionTargetAdmitted` 在 state≠2 时直接
`return false`，故 kernel-only 对任何 triple 都在准入阶段（远早于 codegen）返回 rc=9 + `codegen_plugin_missing=`。
**判定：施工图的校正成立 ✅**，落地证据只能用 W5 的字节对拍，**不得**用 W6。

### U1 —— 不确定项（标注，未验证）

| # | 项 | 状态 |
|---|---|---|
| U1 | `primary_object_plan.cheng` 的 −38 行漂移归因（`:67343`–`75942` 之间） | **未追**（不影响内容定位） |
| U2 | `E3+E4+E5` 实测 183 vs 设计 182 | **本轮的 E5 切法不完整**，不作为分歧 |
| U3 | `src/core/runtime/*` 反向 import `target_matrix` 是否触发别的门 | 未验证（D 类不在本切片） |
| U4 | `tools/` 下**正则型**判词门对 342 行 token 的依赖 | 未验证（施工图 §7 未验证项 4 同） |
| U5 | `build_plugin_driver.sh --arch aarch64` 在现树是否已跑通 | 未验证（需编译槽） |
| U6 | 两个 `src/tests` dispatch smoke 在轨落地后的处置 | 见 G5，需决策 |

---

## 6. 纪律回执

| 项 | 结果 |
|---|---|
| **改动了哪些文件** | **无。** 本轮零 `src/**` 写入、零 `bootstrap/**` 写入、零 `tools/**` 写入。唯一新增文件 = 本报告 |
| **新增文件** | `docs/campaigns/2026-08-31-kernel-userpath/design/pc_closure_s1_progress.md`（本文件，唯一新增） |
| **`git diff --numstat`** | 见下方原始输出 —— **不含任何本轮产生的行**；列出的 16 个文件全部是**其它线**的既有未提交改动 |
| **是否跑过编译** | **否。** 未跑任何编译器/驱动/构建脚本。仅跑静态 Python 门（2 次）与只读 `grep`/`awk`/`git status`/`git diff`/`git ls-files` |
| **是否跑过门** | **是，2 次**（V2 基线、V6 收口），均 rc=1，两次输出**逐字节相同** |
| **是否 commit / push / 建分支 / 建 worktree** | **均无** |
| **是否 `cp` 整文件 / `git checkout --` / `git restore` / `git stash`** | **均无** |
| **是否改 manifest** | **否**（11 行均未动） |
| **锁状态** | **未持有任何锁**；未创建、未获取、未释放任何锁文件 |
| **临时产物** | **已清理，无残留。** 两次门的 stdout 曾落盘用于逐字节对比，比对完即 `rm -f`；反事实脚本经 `printf \| python3 -` 直喂，**从未落盘**。无任务级临时目录、无构建产物 |
| **工作树状态** | `src/core/backend/primary_object_plan.cheng` **已干净**（施工图 §4.1 记的 76+/8− WIP 已由他线落地）；本轮未碰它 |

`git diff --numstat` 原始输出（**全部为他线改动，与本轮无关**）：
```
63	10	bootstrap/cheng_cold.c
9	9	docs/campaigns/2026-08-31-kernel-userpath/user_path_baseline.tsv
5	0	findings.md
2	0	lessons.md
4	0	progress.md
9	2	src/apps/vpn_proxy/mobile/vpn_proxy_mobile_gui.cheng
37	2	src/apps/vpn_proxy/vpn_proxy_json.cheng
9	0	src/apps/vpn_proxy/vpn_proxy_socks.cheng
192	96	src/core/lang/parser.cheng
90	18	src/core/runtime/program_support_backend.cheng
31	0	src/core/tooling/compiler_csg.cheng
0	12	src/tests/ug_gate_probe_enum.54787.cheng
7	0	task_plan.md
1	1	tools/beat_c_process_group_guard.sh
18	2	tools/beat_c_process_group_guard_runtime.py
```

---

## 7. 下一步最小动作（第一轮，**已由 §8 裁决取代**）

1. **（不占编译槽，立即可做）主线程裁决 §5.G3**：三个门面到底是"只切调用方 import"（读法 iii，与实测自洽）
   还是"必须连函数体一起改"。这一条不定，E3/E4/E2 **一行都动不了**。
2. **（不占编译槽，立即可做）主线程裁决 §5.G5**：两个 `src/tests` dispatch smoke 的处置。
3. **（不占编译槽，立即可做）补齐 §5.G2 的轨规格**：`CodegenPluginRequestAppend` 正式签名 + 行存储语义 +
   统一 S0 符号集（`ResultAt` vs `ObjectBytes`）。
4. **（占 1 次烤机）做 §5.G1 + W1**：pending 第三态 + `CompilerMainCompositionProcessEntry` 二次调用实测。
   这两件事**同一次烤机可一并出结论**，建议合并。
5. 上述 1–4 闭合后，S1 的每一步都已是**机械操作**：本报告 §2 已给出全部调用点的 HEAD 逐字改前原文与零漂移锚点，
   E2 的 15 处按 §2.4 的 HEAD 实测行号走。届时再落刀，然后跑 §3.V2/V3 与 §4 的 W1–W9。

---

## 8. G1–G5 裁决与候选判别（第二轮，2026-09-11）

本轮收到的裁决：**G3 取 import-only 读法；G5 不许删测试、登记为非内核消费者；
G1/G2/G4 不许猜但也不许停在"规格未闭合"，须给出候选读法 + 判别实验，用最便宜手段压到 1 个。**

### 8.0 槽位状态（只读观察，**未抢**）

```
.rebuild/COMPILE_SLOT.lock/owner      →  39482 1789067608 03:13:28 pool68-probe10-fixA
.rebuild/COMPILE_SLOT.lock/owner.txt  →  owner_pid=39482
                                        started=2026-09-11 03:13:28
                                        purpose=pool68: probe10 stage68 verdict + fix A (A/B byte-equality)
ps -p 39482  →  39482 01:26 bash .rebuild/pool68/phase1.sh      # owner 存活
```
**owner 存活 ⇒ 本线让位，未 `mkdir` 抢锁，未做任何锁写。** 与裁决一致：先做三步不依赖槽位的工作。

### 8.1 G3 裁决落地 —— 工作假设 + S0.5 判据

**工作假设（本轮采信并据此推进）**：E3/E4/E2 三处切口 = **只切调用方 → 门面的 import，门面本体保持原状**。
依据 = 本报告 §3.V3/V4 的门自身反事实：闭包成员判定是**可达性驱动**的，切掉调用方后三个门面即出闭包、
arch 计数落到预测的 4，**无需触碰门面本体**。

**S0.5 判据（写死，烤机后照此判）**：
1. 只切调用方后 `strict_manifest_unreachable = 0` 且 `strict_closure_unmanifested = 0` 仍成立；
2. `strict_arch_reachable_files` 落到本报告 §3.V3 预测的 **4**；
3. 三行 manifest（`:28 :30 :59`）删除后 `declared == actual` 仍成立。
**若 1/2/3 任一不成立**（即"门面已不可达却仍被计数"）→ 判定为**门禁口径缺陷**，
改门禁侧（"不可达即不计入"）而**不是**掏空模块 —— 与裁决逐字一致。

**据此正式作废的错误读法**：§5.G3 表里的读法 (i)/(ii) 不再考虑；门面函数体的去向问题**消失**。

### 8.2 G2 判别实验 —— 两个变体都写了、都跑了门；**结论：门无法判别（已实证）**

#### 8.2.1 变体 A（施工图 `:73` 符号集：行面自足）

落盘位置：`src/core/backend/codegen_contract.cheng` 末尾（原 `:1742` 之后），追加 85 行：

```cheng
# ---- S1 rail [VARIANT-A]: plugin request/result data plane ----
const CodegenPluginRailSchema: str = "cheng.codegen.plugin.rail.v1"
const CodegenPluginOpWriterTextDataObjectBytes = 1
const CodegenPluginOpWriterTextObjectWrite = 2
const CodegenPluginOpWriterTextDataObjectWrite = 3
const CodegenPluginOpLinkExeBuiltin = 4
const CodegenPluginOpRegallocPrepareRecipes = 5

type
    CodegenPluginRequestRow =
        opId: int32
        unitId: int32
        frozenPlanRow: int32
        scalar0: int32
        scalar1: int32
        payloadCid: layout.FixedBytes32

    CodegenPluginResultRow =
        valid: bool
        errorCode: int32
        bytesCid: layout.FixedBytes32
        resultRow: int32
        count0: int32
        count1: int32

var codegenPluginRequests: CodegenPluginRequestRow[]
var codegenPluginResults: CodegenPluginResultRow[]

fn CodegenPluginRequestAppend(opId: int32, unitId: int32, frozenPlanRow: int32, scalar0: int32, scalar1: int32, payloadCid: layout.FixedBytes32): int32 =
    var row: CodegenPluginRequestRow
    row.opId = opId
    row.unitId = unitId
    row.frozenPlanRow = frozenPlanRow
    row.scalar0 = scalar0
    row.scalar1 = scalar1
    row.payloadCid = payloadCid
    add(codegenPluginRequests, row)
    return codegenPluginRequests.len - 1

fn CodegenPluginRequestCount(): int32 =
    return codegenPluginRequests.len

fn CodegenPluginRequestAt(ordinal: int32): CodegenPluginRequestRow =
    var empty: CodegenPluginRequestRow
    if ordinal < 0 || ordinal >= codegenPluginRequests.len:
        return empty
    return codegenPluginRequests[ordinal]

fn CodegenPluginResultAppend(valid: bool, errorCode: int32, bytesCid: layout.FixedBytes32, resultRow: int32, count0: int32, count1: int32): int32 =
    var row: CodegenPluginResultRow
    row.valid = valid
    row.errorCode = errorCode
    row.bytesCid = bytesCid
    row.resultRow = resultRow
    row.count0 = count0
    row.count1 = count1
    add(codegenPluginResults, row)
    return codegenPluginResults.len - 1

fn CodegenPluginResultReady(ordinal: int32): bool =
    if ordinal < 0 || ordinal >= codegenPluginResults.len:
        return false
    return codegenPluginResults[ordinal].valid

fn CodegenPluginResultAt(ordinal: int32): CodegenPluginResultRow =
    var empty: CodegenPluginResultRow
    if ordinal < 0 || ordinal >= codegenPluginResults.len:
        return empty
    return codegenPluginResults[ordinal]
```
⇒ 门输出：`194/194、0/0、arch 12、token 30/342、violations 42、rc=1` —— **与基线逐字节相同**。

#### 8.2.2 变体 B（设计 `:253` 符号集：契约面自足，补 typed 取回面）

在 A 之上追加 delta（**本块为门响应探针，非落地实现**）：
```cheng
@borrows
fn CodegenPluginResultBytesInto(ordinal: int32, outBytes: var rawbytes.Bytes): bool =
    return false

@borrows
fn CodegenPluginResultObjectWriteInto(ordinal: int32, out: var CodegenObjectWriterResult): bool =
    return false
```
⇒ 门输出：`194/194、0/0、arch 12、token 30/342、violations 42、rc=1` —— **与变体 A 逐字节相同**。

命令与 rc：
```
python3 tools/kernel_plugin_closure_check.py --require-strict-closure   # VARIANT-A rc=1
python3 tools/kernel_plugin_closure_check.py --require-strict-closure   # VARIANT-B rc=1
diff <A> <B>  →  YES - byte-identical
```

#### 8.2.3 ⚠️ 关键判定：**裁决给的 G2 判据不成立（已实测）**

裁决原文要求「取『declared == actual 与 token 计数自洽』的那个」。**实测证明该判据对 A/B 是恒等的、不可判别的**，原因有二，都不是猜测：

1. `codegen_contract.cheng` 在 `ARCH_TOKEN_CONTRACT_FILES`（门 `:57-60`）内，`scan_strict_arch_tokens` 在 `:311`
   直接 `continue` —— **门对该文件的一切 token 零覆盖**（施工图 §0.3 `:54-59` 已预言）。
2. A/B 都不新增任何 `import cheng/core/...` 行 ⇒ 闭包成员集一字不变。

⇒ **两变体门输出逐字节相同，这是实测结果，不是我推的。** 若据此宣布"取 A"或"取 B"，
就是把门禁盲区当成判据 = **假绿**。**故本轮不按该判据选，改用下面这条可判别的静态判据。**

#### 8.2.4 真正的判别判据（静态、可判定）：**调用方新增 import 面**

已实测的事实：**5 个调用方今天全部已经 `import cheng/core/backend/codegen_contract as contract`**
（`direct_object_emit.cheng:22`、`native_object_emission_plan.cheng:7`、`native_link_exec.cheng:8`、
`regalloc_production_emitter.cheng:3`、`primary_object_plan.cheng:17`）。
⇒ 只要轨的**取回语义完全落在契约内**，调用方**零新增 import**。

| 变体 | 结果行携带 | 负载从哪取回 | 调用方新增 import | 判定 |
|---|---|---|---|---|
| **A** | `bytesCid + resultRow`（纯索引） | 契约**没有**负载存储（其 import 集 = `coreir/alloc/layout/rawbytes/strings/osym/orel/tmat`，无 arena） ⇒ 要么契约新增负载存储（新 import + 新耦合），要么**每个取 bytes 的调用方各自新增** | **≥2**（`direct_object_emit`、`native_object_emission_plan` 今天均未 import 任何 arena/payload 模块） | ❌ |
| **B** | 索引 + **契约自有 typed out-param 取回**（`...BytesInto` / `...ObjectWriteInto`） | 契约内部，用 `rawbytes.Bytes`（已有 `:42`）与 `CodegenObjectWriterResult`（已有 `:698`） | **0** | ✅ |

**⇒ 取变体 B。** 这同时**消解**了"`ResultAt` vs `ObjectBytes` 矛盾"而**没有**去改设计文档的示例：
两者不是二选一，而是**同一轨的两个面** —— `ResultAt/RequestAt` 是**原始行面**（服务循环读请求用），
`...BytesInto/...ObjectWriteInto` 是**typed 取回面**（调用点用，保证零新增 import）。
施工图的符号集与设计的示例**都保留**，各归其位。

#### 8.2.5 本轮**未落盘** B（理由，非拖延）

B 的**函数体**依赖两件未决事：① G1 的 pending 第三态语义；② S0.5 的轨形态（A/B）。
现在落盘只能落一个 `return false` 的空体 —— 那是 **stub（禁止项）**，且落入**门零覆盖**的契约区。
⇒ **B 的完整文本已在上方备好，一行 `edit` 即可落盘**；落盘时机 = G1 与 S0.5 闭合后同刀。

**实验痕迹已完全还原**：`codegen_contract.cheng` sha256 前后同为
`41b7d155e133eb5e2a2b75e44cfa7f0ee245c1edfd61949617c89ea2fe035115`，
`git status` 对该文件为空。还原走**批准通道** `git diff → git apply --check -R → git apply -R`（非 checkout/restore）。

### 8.3 G4 规格 —— **并发现施工图一处事实性错误：那两个 `var str[]` 是只读的**

#### 8.3.1 施工图原文 vs 实测

施工图 `:142` 逐字写：
> 入参含 `var coreir.BodyIR`、`var alloc.RegallocSinglePassValuePlan`、两个 **var 写回** `str[]`
>（`dataSymbolProjection.slotDataSymbols` / `cstringDataSymbols`，`:1008-1009`）。
> 必须按设计 §3.1 把两个 `str[]` 化成请求计划里的 SoA 行

**实测结论：`slotDataSymbols` / `cstringDataSymbols` 在全仓是 `var` 形参但语义上只读，无任何写回。**

证据（全 `src/` 扫描，共 6 个文件提及这两个名字）：
```
$ grep -rn 'slotDataSymbols\|cstringDataSymbols' src/ | grep -E '\[[^]]*\]\s*=|add\(|push\(|append\(|set\(|DataSymbols\s*='
src/core/backend/regalloc_production_emitter.cheng:729:            add(projection.slotDataSymbols, strings.CloneStr(target))
src/core/backend/regalloc_production_emitter.cheng:735:            add(projection.slotDataSymbols, "")
src/core/backend/regalloc_production_emitter.cheng:749:        add(projection.cstringDataSymbols, projectedSymbol)
```
**只有 3 处写，全部在 `regallocProductionBuildDataSymbolProjection`（内核侧，`:719-749`），
且全部发生在轨调用 `:1005` 之前。**
三个 arch adapter（`regalloc_aarch64_adapter` / `regalloc_x86_64_adapter` / `regalloc_riscv_adapter`）
的写模式扫描**全部 exit=1（零命中）**；它们的用法只有两类：
- 形状校验（只读）：`regallocA64DataSymbolProjectionShapeValid`，`regalloc_aarch64_adapter.cheng:1244-1264`
  （`slotDataSymbols.len != bodyIR.localSlots.len`、`len(slotDataSymbols[slotIndex]) > 0` …）
- 取值（只读）：`regallocA64AppendProjectedSlotDataAddress`，`:1267-1280`（`slotDataSymbols[slotIndex]`）

#### 8.3.2 规格（照裁决要求：谁写 / 写回哪一行 / 失败语义）

| 项 | 规格 |
|---|---|
| **谁写** | 唯一写者 = 内核侧 `regallocProductionBuildDataSymbolProjection`（`regalloc_production_emitter.cheng:680-770`），用 `seqs.reserve` + `add` 预填两列 |
| **写回哪一行** | **写回 0 行 —— 轨调用上不存在写回。** 两列在 `:1005-1009` 作为**只读输入**传入；arch 侧只校验形状 + 按下标取值 |
| **失败语义** | ① 构建期形状不合法 → builder `return false`（`:750-757`，并 `freeSeqStrRelease` 两列）；② adapter 侧形状校验不过 → `RegallocA64FunctionRecipes.valid = false`；③ 调用后 `:1010-1015` 复核 BodyIR ingress cid 前后一致 |
| **轨只需承载** | 两列当**只读冻结输入行**（或直接把 `resolvedDataTargetSymbols` 冻结为 SoA 行）⇒ **不需要"写回 SoA 化"** |

**⇒ 影响：施工图 `:142` 把 E4 定为「全切片最难一处」、§6.4 风险 6 把「var `str[]` 写回 SOA 化」
列为 E4 可能降级的理由，其前提不成立。E4 的难度应重估（真实难点收缩为 `var coreir.BodyIR` +
`var alloc.RegallocSinglePassValuePlan` 两个**真正的** `var` 载体如何过轨）。**

#### 8.3.3 残留不确定（标"不确定"，不猜）

本线实测的是**语义只读**（无写语句）。**未验证**的是：Cheng `var str[]` 形参在 stage3 方言下
是否**物理上**要求调用方交出可写副本（`:1002` 注释「值传 str 过参即消费（stage3 方言），
门面内按臂各持一份 CloneStr」暗示传参本身有所有权动作）。
**⇒ 这是 §4.W1 烤机时必须一并判定的项**（记为 **W1b**）：只读传递是否需要 kernel 侧持有可写副本；
若需要，轨的请求行必须承载**可写副本**而非只读视图。**未定，不猜。**

### 8.4 G1 候选 —— pending 第三态的两种具体表示 + 判别实验

约束（裁决）：**统一用一个显式带标签的结果覆盖四类返回型**；不许每类各造一套；不许 0/-1 哨兵与真实值混用。

四类真实返回型（§5.G1 表已列）：`Result[DirectObjectEmitResult]`（doe:224）、`bool + var str err`（doe:372）、
`bool + var str outErr`（doe:483）、`var Result[Bytes]`（doe:4732 / noep:389）、`Result[bool]`→`LoggedRun`（nle:373）。

#### 候选甲 —— 契约级 tagged outcome **值**，随调用链向上透传（改签名）

```cheng
const CodegenPluginOutcomeReady   = 0
const CodegenPluginOutcomePending = 1
const CodegenPluginOutcomeError   = 2

type
    CodegenPluginOutcome =
        tag: int32
        ordinal: int32
        errorCode: int32

fn CodegenPluginOutcomeAt(ordinal: int32): CodegenPluginOutcome = ...
```
每个调用点新增一个 `var CodegenPluginOutcome outcome` 出参并原样向上传；四类返回型各自的
"未就绪"值**不再承担语义**，外层只认 `outcome.tag`。
**优点**：标签唯一、类型安全、外层可判别（正中裁决判据）。**代价**：签名面大（doe×3 + noep×1 + nle×1 及其调用链）。

#### 候选乙 —— 契约级 **suspend 通道**，不改签名

```cheng
fn CodegenPluginSuspend(ordinal: int32) = ...      # 记 codegenPluginSuspendOrdinal 进契约全局
fn CodegenPluginSuspendTag(): int32 = ...          # 非 0 即本次编译已挂起
```
调用点命中 pending 时先 `CodegenPluginSuspend(ordinal)`，再返回该点原有的空/假值；
调用链**每个返回点之后**都必须查 `CodegenPluginSuspendTag()`，非 0 即整体 unwind。
**优点**：不改任何签名，面最小。**代价**：判别性**完全靠调用链纪律** —— 漏查一处即返回零值继续跑，
正是 `lessons.md` 里"落穿读栈垃圾 / 静默 miscompile"的形态。

#### 判别实验（S0.5 同一次烤机一并出结论；判据按裁决）

构造**强制 pending 探针**（服务端故意不填结果行），观察内核落在：
```
(a) 明确以 pending 第三态 unwind 到 main 且外层可判别   → 候选通过
(b) 静默返回零值、继续跑出错误产物（无 panic）          → 候选淘汰
```
| 候选 | 预期 `(a)` 概率 | 若落 `(b)` 的后果 |
|---|---|---|
| 甲 | 高（类型层面强制消费出参） | 仍可能"拿到 outcome 但不查"，需再加一条 hard-fail |
| 乙 | **低** | 直接淘汰（无类型护栏） |

**⇒ 建议：默认取甲；乙仅在"甲编译不过/panic"时作为退路，且必须补一条"漏查即 hard-fail"的护栏才可接受。**
**本轮不落码**（G1 与 S0.5 形态耦合，且甲的签名面改动必须与实际切点同刀）。

### 8.5 manifest 11 行"同刀"落地脚本（**写好待用，未落盘、未执行**）

执行时机 = 与该步的代码边切**同一步**。单独跑本脚本 = 半成品态（门会 `STRICT_CLOSURE_UNMANIFESTED=11`）。
走批准通道 `diff → git apply --check → git apply`，不用 `cp`/`mv`/`checkout`。

```bash
#!/bin/bash
# pc_closure_s1_manifest_knife.sh —— 删 S1 的 11 行；必须与代码边切同刀
set -euo pipefail
REPO=/Users/lbcheng/cheng-lang
M="$REPO/bootstrap/kernel_manifest.cheng"
TMP="$(mktemp)"; PATCH="$(mktemp)"; trap 'rm -f "$TMP" "$PATCH"' EXIT

GO='backend_codegen_writer_units_source|backend_codegen_x64_body_units_source|closure_src_core_backend_codegen_regalloc_adapter_units_source|observed_strict_arch_elf_riscv32_writer|observed_strict_arch_elf_riscv64_linker|observed_strict_arch_elf_riscv64_writer|observed_strict_arch_elf_x86_64_writer|observed_strict_arch_regalloc_aarch64_adapter|observed_strict_arch_regalloc_riscv_adapter|observed_strict_arch_regalloc_x86_64_adapter|observed_strict_arch_x86_64_body_emit'
STAY='observed_strict_arch_aarch64_encode|observed_strict_arch_codegen_a64_fill_units|observed_strict_arch_regalloc_production_encoder_events|observed_strict_arch_riscv64_encode'

n_go=$(grep -cE "^($GO)[[:space:]]*=" "$M");   [ "$n_go"   -eq 11 ] || { echo "PRECOND_FAIL go=$n_go want=11"; exit 2; }
n_stay=$(grep -cE "^($STAY)[[:space:]]*=" "$M"); [ "$n_stay" -eq  4 ] || { echo "PRECOND_FAIL stay=$n_stay want=4"; exit 2; }

grep -vE "^($GO)[[:space:]]*=" "$M" > "$TMP"
diff -u "$M" "$TMP" > "$PATCH" || true
git -C "$REPO" apply --check "$PATCH"          # 只删不增，必须通过
git -C "$REPO" apply "$PATCH"
echo "deleted=$n_go kept=$n_stay"
# 收口：python3 tools/kernel_plugin_closure_check.py --require-strict-closure
#   → 期望 unreachable=0 unmanifested=0，且 stricter 计数命中 §3.V3 的该步三元组
```
**含义说明**：11 行的**逐字改前原文**见 §2.5；**改后 = 整行删除**（含 `:28`/`:30` 行尾 `#` 注释）。
`STAY` 四项断言保证 `:220 :221 :227 :230` 不被误删（它们必须与剩余 arch 数 4 恒等）。

### 8.6 G5 登记 —— 两个派发 smoke 是**非内核消费者**

**裁决：不许删测试。** 在 §8.1 的 import-only 读法下三个门面仍在树里，两个 smoke 照常可用、**本轮零改动**。
现按裁决**登记**如下（将来 `declared == actual` 校验不该对它们惊讶）：

| 文件 | 行 | 内容 | 归属 | 对内核对账的含义 |
|---|---|---|---|---|
| `src/tests/b2_writer_units_dispatch_smoke.cheng` | `:13` | `import cheng/core/backend/codegen_writer_units as wunits` | **非内核消费者**（`src/tests/**`，严格门只遍历 `src/core/**`） | E3 后门面出内核闭包，但**该文件仍合法引用门面**；不得据此判定"闭包不干净" |
| `src/tests/b4_x64_body_units_dispatch_smoke.cheng` | `:9` | `import cheng/core/backend/x86_64_body_emit as x64` | 非内核消费者 | 同上；且它直调 arch 模块，**本就不在严格门覆盖面** |
| `src/tests/b4_x64_body_units_dispatch_smoke.cheng` | `:10` | `import cheng/core/backend/codegen_x64_body_units as units` | 非内核消费者 | E2 后门面出内核闭包，同上 |

**另**：这两个文件今天**未被任何门/工具构建**（全仓 `.sh`/`.py`/`.cheng` grep，除自身外只命中
`progress.md:1295,1315` 两处落地回执）。**⇒ 它们不阻塞静态门，也不进 W1–W9 任何一条的判据。**
**若 S0.5 实测迫使改门面本体**（§8.1 判据 1/2/3 失败且改门禁侧仍不足），则按裁决：
两个 smoke **必须同刀更新断言对象**（改指替代路径），**绝不允许靠删测试或 skip 让门禁变绿**。

### 8.7 纪律回执（第二轮）

| 项 | 结果 |
|---|---|
| **改动了哪些文件** | 探针期改过 `src/core/backend/codegen_contract.cheng`（追加 85 行做门响应实验），**已完全还原**：sha256 前后同为 `41b7d155e133eb5e2a2b75e44cfa7f0ee245c1edfd61949617c89ea2fe035115`，`git status --porcelain` 对该文件为空 |
| **还原方式** | `git diff > patch` → `git apply --check -R` → `git apply -R`（**批准通道**；**未**用 `git checkout --` / `git restore` / `git stash` / `cp`） |
| **新增文件** | 仍只有本报告 1 个 |
| **是否跑过编译** | **否。** 仅 2 次静态 Python 门（A/B 各 1） + 只读 `grep`/`awk`/`ps`/`git status`/`git diff` |
| **是否抢锁 / 持锁** | **否。** 只读 `cat owner.txt` + `ps -p 39482` 做 owner 活性检查，结论 owner 存活 ⇒ 让位 |
| **临时产物** | **已清理**（`mktemp` 级 patch/log 全部 `rm -f`），无残留 |
| **9 个 S1 目标文件** | `codegen_contract` / `codegen_writer_units` / `direct_object_emit` / `native_object_emission_plan` / `native_link_exec` / `codegen_regalloc_adapter_units` / `regalloc_production_emitter` / `codegen_x64_body_units` / `kernel_manifest` —— **全部 `git status` 为空（pristine）** |
| **工作树其它改动** | 19 个 tracked 改动全部属其它线（含本轮期间新增的 `src/rsi/engine.cheng`、`src/rsi/promotion.cheng`、`src/tests/rsi_contract.cheng`、`src/tests/rsi_recursive_e2e.cheng`），**与本轮无关** |

### 8.8 更新后的下一步（取代 §7）

1. **（不占槽）** B 的完整文本已在 §8.2.2 备好；等 G1 + S0.5 闭合后与切点同刀落盘（一行 `edit`）。
2. **（占 1 次烤机，合并做）W1 + W1b + G1 判别 + S0.5**：四件事共用同一次烤机 ——
   ① `CompilerMainCompositionProcessEntry()` 二次调用行为；② `var str[]` 只读传递是否需可写副本（§8.3.3）；
   ③ 强制 pending 探针下候选甲/乙的 (a)/(b) 判定（§8.4）；④ 轨形态 A/B 定案。
3. **（不占槽）** 槽位空闲后按 §8.1 判据跑 `--require-strict-closure`，确认门面出闭包后 arch 落到 4。
4. 之后 S1 每步均为机械操作：§2 已给全部调用点 HEAD 逐字改前原文 + 零漂移锚点；E2 的 15 处按 §2.4 实测行号走。

### 8.9 HEAD 位移说明与基线复验（诚实回执）

本报告 §0–§7（第一轮）写成时 HEAD = `8c5a2df76`。第二轮期间 **HEAD 前进到 `9f4d1c88b`**
（主线程把第一轮报告收割成 commit `9f4d1c88b`，含本文件 694 行版本）。
⇒ 现状：**本文件在 HEAD 中已存在 694 行版本；§8（第 695–1032 行）是工作树里未提交的增量。**

**本线全程未执行 `git add` / `git commit` / `git push`**（纪律要求）；上述 commit 由主线程做出。

**HEAD 位移后基线复验**（确认 S1 判定未被位移影响）：
```
python3 tools/kernel_plugin_closure_check.py --require-strict-closure
strict_manifest_sources=194 strict_core_closure_files=194
strict_manifest_unreachable=0 strict_closure_unmanifested=0
strict_arch_reachable_files=12
strict_arch_token_files=30 strict_arch_token_lines=342
result: FAIL_STRICT (violations=42 ...)   rc=1
```
**⇒ 与 §3.V2 的基线逐字相同，§1–§5 的全部判定在新 HEAD 下依然成立。**
