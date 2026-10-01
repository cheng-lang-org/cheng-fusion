# kernel 严格闭包清零（K2/R2）最小拆分设计

日期：2026-09-10。只读产出，零改源、零编译。所有数字二分来源：
① 门实测输出；② 用门自身函数在内存里做反事实切边（`tools/kernel_plugin_closure_check.py`
的 `build_core_import_graph / reachable_core_closure / arch_reachable_paths / scan_strict_arch_tokens`，
不落盘、不改树）；③ 源文件 `文件:函数:行号` 实读。凡未跑过的都标「未验证」。

复现命令（唯一一次静态门）：

```
python3 tools/kernel_plugin_closure_check.py --require-strict-closure
→ rc=1 FAIL_STRICT violations=42
  strict_manifest_sources=194 strict_core_closure_files=194
  manifest_unreachable=0 closure_unmanifested=0
  arch_reachable=12  arch_token_files=30  arch_token_lines=342
```

---

## 0. 门口径（施工前必须钉死的 6 条）

| 口径 | 位置 | 含义 |
|---|---|---|
| 闭包根 | `bootstrap/kernel_manifest.cheng:12` → `compiler_composition_kernel_main.cheng` | 只此一个严格门根 |
| manifest 计数 | `tools/kernel_plugin_closure_check.py:179-183` | **任意 key**，只要值是 `src/core/*.cheng` 就计入 declared（含 `observed_strict_arch_*`） |
| arch 判定 | 同上 `:33` `ARCH_BUCKETS` | 归属表桶 ∈ {x86_64,aarch64,riscv32,riscv64,wasm32} |
| token 扫描 | 同上 `:298-300` | 大小写不敏感子串；**剥 `#` 注释，不剥字符串** |
| token 豁免 | 同上 `:311` | 只豁免 arch 桶文件 + `:57-60` 两个权威文件 `codegen_contract.cheng`/`target_matrix.cheng` |
| 运行时 declared==actual 硬门 | `src/core/tooling/composition_manifest.cheng:182-185`（只认 `compiler_entry_source` 与 `*_source`）+ `:263-279` `HARD_RED:closure_count_mismatch/declared_unreachable/source_undeclared` | 与严格门**不是同一个 declared 集**：运行时 declared=162，严格门 declared=194（差 32 = 16 个 `closure_src_core_runtime_*` + 12 个 `observed_strict_arch_*` + 4 个 `observed_strict_provider_*`）。这条差异本轮**未验证**运行时行为 |

推论（本设计的全部前提）：门要求的 declared==actual 是**双向精确**的，所以「切一条 import 边」= 「同时删 manifest 对应行」，
两件事必须同一次提交，否则违规从 ARCH_REACH 变成 CLOSURE_UNMANIFESTED / MANIFEST_UNREACHABLE，仍是红。
`bootstrap/kernel_manifest.cheng:220-231` 那 12 行 `observed_strict_arch_*` 就是上一轮为满足等号而**登记违规根**的产物（文件自注释在 `:215-219`）——
它们不是 `*_source`，运行时组合集不含它们。

---

## 1. 断点选择：12 条 arch 可达链 → 只有 6 个门面、12 条入口边

反事实枚举（门自身图，核闭包内「非 arch 源 → arch 目标」的全部边）：

| # | 门面（桶） | 入口边（门面文件:行 → arch 文件） | 汇入该门面的 kernel 侧 | 门面行数 |
|---|---|---|---|---|
| E1 | `codegen_a64_body_units` shared-format | `:22`→aarch64_encode、`:23`→codegen_a64_fill_units | `primary_object_plan.cheng:10` | 254 |
| E2 | `codegen_x64_body_units` shared-format | `:24`→x86_64_body_emit | `primary_object_plan.cheng:11` | 64 |
| E3 | `codegen_writer_units` shared-format | `:22`→elf_x86_64_writer、`:23`→elf_riscv64_writer、`:24`→elf_riscv32_writer、`:25`→elf_riscv64_linker | `direct_object_emit.cheng:23`、`native_object_emission_plan.cheng:8`、`native_link_exec.cheng:9` | 135 |
| E4 | `codegen_regalloc_adapter_units` shared-format | `:26`→regalloc_aarch64_adapter、`:27`→regalloc_x86_64_adapter、`:28`→regalloc_riscv_adapter | `regalloc_production_emitter.cheng:4` | 59 |
| E5 | `codegen_encoder_event_units` shared-format | `:21`→regalloc_production_encoder_events | `regalloc_production_artifacts.cheng:3` | 31 |
| E6 | `codegen_a64_link_units` shared-format | `:12`→aarch64_encode | `coff_object_linker.cheng:16`、`elf_object_linker.cheng:15` | 21 |

12 条入口边共覆盖 12 个 arch 文件；`riscv64_encode` 不是入口边，是 `elf_riscv32_writer` 的 arch→arch 后代
（E3/E4 切完后它在核闭包内的**唯一**存活 importer 是 `regalloc_production_encoder_events`，见 §3.1）。**只要把 E1–E6 六条门面清成零 arch import，arch_reachable 就是 0**，
不存在第 7 个隐蔽通道（`indirect_edges=128` 全部经这 6 个门面坍缩，另有 18 个间接源不在严格门根下，
属 Step0 信息项，不影响严格门）。

逐链锚点与「断在哪」：

### 链 ①-a `pop → E1 → {aarch64_encode, codegen_a64_fill_units}`
- 切点：`primary_object_plan.cheng:10`（import 行本身）。
- 消费者体量：`a64units.` **554 处，散布在 33 个函数**（实测按最近 `fn` 归属）—— 大头是 `PrimaryBodyIRFillBlockOp`(208)、
  `PrimaryBodyIRFillResultProjectOp`(47)、`PrimaryBodyIRCopySlot`(40)、`PrimaryBodyIRFillBinOp`(33)、
  `PrimaryBodyIRFillBlockTermReturn`(31)，其余 28 个函数各 1–23 处；`PrimaryBodyIREmitOpInstruction` 只占 10 处，
  `PrimaryObjectPlanCaptureBodyIrDetails`（`:65687`）3 处。
  形态两类：**纯 ISA 常量**（`CodegenA64X0..X16`/`SP`/`LR`/`FP`/`Cond*`）与**纯函数编码**（`CodegenA64Enc*`、`CodegenA64BodyFill*`），
  后者几乎全部带 `var int32[] words`（少数带 `var coreir.BodyIR`）写回。
- 判读：这是唯一 **L 级** 链，且不是「一个函数改一次」——33 个 `Fill*` 函数全要改签名/回送。
  纯常量可数据合同化（迁 `codegen_contract` 常量表），编码函数必须走插件回送。本设计**不建议**纳入最小切片。

### 链 ①-b `pop → E2 → x86_64_body_emit`
- 切点：`primary_object_plan.cheng:11`。
- 消费者：`x64units.` **15 处，散布在 7 个函数**（`PrimaryBodyIrAppendCallCStringArgRelocsX64` 5 处、`PrimaryBodyIrAppendCStringArgRelocs` 3、
  `PrimaryBodyIrAppendGlobalOpRelocs` 3、`PrimaryBodyIrWordCountForTarget` / `PrimaryBodyIrPrepareTargetMetricsInPlace` /
  `PrimaryObjectPlanEnsureFunctionLowered` / `PrimaryObjectPlanBuildItemsPhase`（`:75912`）各 1），
  接口全是 `int32/bool` 纯查询（`CodegenX64BodyIrWordCount/OpSizeAt/TermSize/PrologueByteCount/...`，见 `codegen_x64_body_units.cheng:27-63`）。
- 判读：**最适合先做数据合同化的一条**（15 个纯标量查询 → 请求行 + 结果列，零 var 写回）。单独切只减 1 个 arch 文件，
  但在 §3.1 里它是把「E3+E4 = 5」压到「4」的那一刀。

### 链 ② `doe/noep/nle → E3 → {elf_x86_64_writer, elf_riscv64_writer, elf_riscv32_writer, elf_riscv64_linker} (+riscv64_encode)`
- 切点（6 处调用，3 个调用方文件）：
  - `direct_object_emit.cheng:224` in `DirectObjectEmitWriteObjectTextOnly`（`:205`，unitKey=X64 文本写盘）
  - `direct_object_emit.cheng:372` in `DirectObjectEmitWriteObjectForFormat`（`:345`）
  - `direct_object_emit.cheng:483` in `DirectObjectEmitWriteObjectPathForFormatInto`（`:458`）
  - `direct_object_emit.cheng:4732` in `DirectObjectEmitPlanObjectBytesInto`（`:4697`，map 分支 `CodegenElfTextDataWriterUnit(triple)==CodegenUnitX64`）
  - `native_object_emission_plan.cheng:389` in `NativeObjectEmissionPlanEmitInto`（`:358`）
  - `native_link_exec.cheng:373` in `NativeLinkExecRunSelfLinker`（`:304`，`elf_riscv64_builtin` 臂）
- 形态：**请求与回送都已经纯数据** —— 入参 `(unitKey:int32, rootDir/outputPath:str, text/data:rawbytes.Bytes, symbols:ObjectSymbolTable, relocs:ObjectRelocTable)`，
  出参 `Result[rawbytes.Bytes]` 或 `contract.CodegenObjectWriterResult`（后者已是 contract 类型，`codegen_contract.cheng` 内）。
- 判读：**切口最干净**（零 var 写回、零 BodyIR 过境），但要新造「内核挂起→组合根执行→回送」这条轨。

### 链 ③ `compiler_main → line_map → debug_emission_receipt → rpe → E4 → 三个 adapter`
- 切点：`regalloc_production_emitter.cheng:1005`，在 `regallocProductionPlanAndRecipesInto`（声明在 `:913`）内，
  派发前已有 `contract.CodegenUnitPrepareRecipesRegistered(unitId)` 硬门（`:979`）与 triple→unitId 枚举。
- 形态：**1 处调用、回送是 contract 数据类型** `RegallocA64FunctionRecipes`，但入参含 `var coreir.BodyIR`、
  `var alloc.RegallocSinglePassValuePlan` 和两个 **var 写回** 的 `str[]`（`slotDataSymbols`/`cstringDataSymbols`，见 `codegen_regalloc_adapter_units.cheng:31-39`）。
- 判读：**减 3 个 arch 文件、只 1 处调用**，是「每处调用减 arch 数」最高的一条；代价是 var 写回要变成请求计划里的 SoA 行。

### 链 ④ `doe → regalloc_production_artifacts → E5 → regalloc_production_encoder_events`
- 切点：`regalloc_production_artifacts.cheng:3`，9 处调用分在 4 个函数：
  `regallocProductionTargetRecipeMatches`（`:97`；调用在 `:102/:106/:109`）、
  `RegallocProductionMachineRecipeProofBuild`（`:2010`；`:2023/:2025`）、
  `RegallocProductionBindMachineRecipe`（`:2078`；`:2087/:2097`）、
  `regallocProductionFrozenPlanValid`（`:2157`；`:2201/:2210`）。
- 关键事实（实测）：被调的两个函数里
  - `RegallocProductionEncoderEventTableCanonicalEmpty`（`regalloc_production_encoder_events.cheng:35-50`）是**纯字段结构校验**（`encoderSourceRow/encoderXlen/kinds/... 各列 len==0&&cap==0`），零 arch 语义，可原样迁进 `codegen_contract.cheng`（类型定义就在那里）；
  - `RegallocProductionEncoderEventStrictValidate`（同文件 `:571-577`）依赖 `RegallocProductionEncoderEventRoot`（`:434-438`），而 Root 内部走 `regallocProductionEncoderEventReplayRow` → `rv.*`（文件头 `:1 import .../riscv64_encode as rv`），**不能**迁进内核。
- 判读：E5 **不能整条免费删**。能免费拿走的是 4 处 CanonicalEmpty（`:109/:2025/:2097/:2210`），
  剩下 5 处 StrictValidate 要么走插件轨，要么保留 arch 边。

### 链 ⑤ `E6 → aarch64_encode`（第二条通道）
- 切点：`codegen_a64_link_units.cheng:12`。8 处调用、3 个单行转发（`CodegenA64LinkEncBlPlaceholder/Adrp/LdrImm`，文件 21 行）：
  `coff_object_linker.cheng:1436,1437,1564,1591`（全在 `coffLinkExeA64`，声明 `:1396`）、
  `elf_object_linker.cheng:806,807,947,948`（全在 `elfLinkExeA64`，声明 `:763`）。
- 判读：**最便宜的一条**（常数/纯函数、8 处、无写回）；但 aarch64_encode 仍被 E1 引着，单切 E6 只减 1 个 token 文件、不减 arch 文件。

---

## 2. 30 个 token 文件的分类与处置

形状统计（门自身判定，剥注释不剥字符串）：**import 行 9 + 标识符/表达式 95 + 纯字符串 238 = 342**。

### 2.1 A 类：随切口消失（5 文件 / 20 行）——施工=§3，零估工

| 文件 | 行 | 性质 |
|---|---|---|
| `codegen_a64_body_units.cheng` | `:22` | import（E1 切口后文件出闭包） |
| `codegen_x64_body_units.cheng` | `:24` | import（E2） |
| `codegen_writer_units.cheng` | `:22-25` import + `:38,40,42,44,59,80,90,100,110,134` 调用 | E3 |
| `codegen_regalloc_adapter_units.cheng` | `:26,27,45` | E4 |
| `codegen_a64_link_units.cheng` | `:12` | E6 |

（`codegen_encoder_event_units.cheng` 不在此表：它本身**不含 arch token**，只是 arch 边的载体。）

### 2.2 B 类：格式常量 → 迁 `target_matrix.cheng`（6 文件 / 91 行，**12–20 agent h**）

| 文件 | 行数 | 内容 | 处置 |
|---|---|---|---|
| `coff_object_linker.cheng` | 13 | `IMAGE_FILE_MACHINE_ARM64=43620`(`:86`)、`IMAGE_REL_ARM64_*`(`:90-92`)、`:512` 机器校验 | 常量与比较全部改引 `tmat` 的 COFF 表；`:1403` `target=="x86_64-pc-windows-msvc"` 改 `tmat.TargetIsWindowsX64` |
| `coff_object_writer.cheng` | 18 | `:11,12,32-37` 常量、`:99-123` triple→machine/reloc 分派 | 同上；`IMAGE_FILE_MACHINE_X86_64` 同时命中 `x86_64`+`x8664`（改名须同时避两个子串） |
| `elf_object_linker.cheng` | 38 | `:80,124-144` EM/R_ 常量、`:437,657-658,709-717,1070,1172-1192,1261,1503,1939,2075,2165-2198,2266` 分派 | EM/R_ 常量迁 `target_matrix`；`:782` 的 `/lib/ld-linux-aarch64.so.*` 平台串改引权威常量 |
| `elf_object_writer.cheng` | 7 | `:14,34-39` EM_AARCH64/R_AARCH64_* | 迁 `target_matrix` |
| `debug_relocatable_object_evidence.cheng` | 6 | `:11` `DebugRelocatableObjectMachineX86_64=2`、`:198,496,528,841,862` | DWARF machine id 是**格式常量**，迁 `target_matrix`，`:496/:841` 判定改引权威谓词 |
| `macho_provider_linker.cheng` | 9 | `:552`（`machoReadObject` 诊断）、`:1409-1413`（`machoProviderRelocationValueContract(kind)` 返回的**重定位值合同名**）、`:2542,2559,3165,3181,3697` | `:1409-1413` 改名=改值合同字符串，须与消费门同步；其余走 `tmat.TargetIsDarwinA64` + contract 标签 |

风险：这些是 shared-format 桶且**要留在内核闭包**，只能用「引权威」方式；常量名里带 arch token 的新名字（如 `EM_AARCH64`）**只允许出现在 `target_matrix.cheng`**，调用侧名字必须无 token（先例：`TargetIsLinuxX64`、`CodegenUnitX64`）。

### 2.3 C 类：真实 triple 分派 → 数据合同化（15 文件 / 219 行，**30–55 agent h**）

按「是分派还是文案」再分两档：

| 档 | 文件 | 行 | 处置 |
|---|---|---|---|
| C1 triple 串面 → 引权威 | `direct_object_emit.cheng` | **78** = 33 行诊断文案（`" direct object emit: x86_64 canonical target mismatch"` 一类）+ 45 行 triple 比较/守卫（`:94-119`、`:248-252`、`:385-389`、`:490-494`、`:2124`、`:2564`、`:2620`、`:2793-2802`、`:3277`、`:3931`、`:4058-4123`、`:4735-4739`、`:5013`）。全部 78 行 token 都在字符串内，无标识符/import 命中 | 比较改 `tmat.TargetIs*`/`contract.CodegenBodyEmitUnit`；诊断文本改引 `contract.CodegenUnitLabel(unitId)`（标签常量落 contract，调用侧无 token）。**前置**：先 grep `tools/` 确认无 gate 对这些文案逐字对拍，有则同步改 gate |
| C1 | `native_link_exec_darwin.cheng`(9)、`native_object_emission_plan.cheng`(9)、`system_link_exec.cheng`(7)、`system_link_exec_runtime.cheng`(13)、`lowering_plan.cheng`(3)、`regalloc_single_pass.cheng`(3)、`compiler_main.cheng`(19，含 `:2419,2495,2636-2691` 的 `--target:x86_64-...` argv 字面量)、`build_plan.cheng`(19)、`support_matrix.cheng`(7)、`composition_manifest.cheng`(6)、`compiler_snapshot_lowering_bridge.cheng`(1) | 96 | 统一改 `tmat.TargetIs*` 谓词 / `contract.CodegenUnit*` / `CodegenBodyEmitUnit`(`codegen_contract.cheng:734`)、`CodegenElfTextDataWriterUnit`(`:705`)；support_matrix 的 `SupportTargetRow(targetTriple: "...")` 是**支持矩阵数据表**，整表迁 `target_matrix` |
| C2 结构性数据表 | `bootstrap_contracts.cheng`(30)、`regalloc_production_artifacts.cheng`(10：`:40-47` 7 条 triple 常量 + `:1582` 局部名)、`primary_object_plan.cheng`(5：`:3051,64531,75889` wasm32 单元键 + `:70152,70343` 硬编码 triple) | 45 | `bootstrap_contracts` 的 host→triple 映射（`:55-101`）整表迁 `target_matrix`，`:196` 的 `"src/core/backend/aarch64_encode.cheng"` 属插件源路径、去向同 `build_plan`；架构常量表迁 `target_matrix`；`primary_object_plan:70152/70343` 的 `let targetTriple = "arm64-apple-darwin"` 是**默认/测试臂硬编码**，须先判定归属再改 |

`build_plan.cheng`(19) 特殊：`:145,190` 是 `BackendSourceUnit(role: BackendA64EncodeSource, path: BackendRootPath(rootDir,"src/core/backend/aarch64_encode.cheng"))` —— **源码路径枚举**，
属「插件源清单」，正确归宿是 plugin manifest / `target_matrix` 的单元→源路径表（先例：`compiler_snapshot_lowering_bridge.cheng:55` 的同类路径串）。

### 2.4 D 类：宿主平台身份串（4 文件 / 12 行，**4–8 agent h**）

`production_launcher.cheng:33-34`、`held_exec_identity.cheng:119-121,484,488,490`、`production_held_exec_provider.cheng:22-23`、`production_held_exec_spawn.cheng:13,56`。
这些是 `"darwin-arm64"/"linux-x86_64"` 与 `uname` 输出比对，**不是代码生成 target**，但门不区分运行时层。
处置：字面量集中到 `target_matrix.cheng` 的宿主平台表（该模块零 import，运行时反向 import 不构成环，**未验证**是否会引入
`src/core/runtime → src/core/backend` 的新 import 边并触发其他门）。

**§2 合计：46–83 agent 小时**（A 类 0，B 12–20，C 30–55，D 4–8）。

---

## 3. 最小可交付切片 S1：arch 12 → 4（**40–80 agent h**）

### 3.1 为什么是这 3 个门面

要求「≤4」→ 至少移除 8 个 arch 文件。逐门面的「减 arch 数 / 改调用点」比价（**减 arch 数为切边实测值，非估算**）：

| 门面 | 单独切减 arch | 调用点 | 写回 | 结论 |
|---|---|---|---|---|
| E3 writer_units | 4（4 个 elf writer/linker） | 6（3 文件） | 无 | 入切片 |
| E4 regalloc_adapter_units | 3（3 个 adapter） | 1 | var `str[]` | 入切片 |
| E2 x64_body_units | 1（x86_64_body_emit） | 15，全纯标量 | 无 | 入切片（补足 ≤4 的最后 1 个） |
| E5 encoder_event_units | 1（encoder_events，**并带走 riscv64_encode**） | 9 | 无 | 备选：效果等价但 5/9 处依赖「内核重算根哈希」语义，留到 K2 正戏 |
| E6 a64_link_units | 0（与 E1 共享 aarch64_encode） | 8 | 无 | 单独切不减 arch，只减 1 token 文件 |
| E1 a64_body_units | 2 | **554** | var `int32[]`/`BodyIR` | L 级，排除 |

实测切边组合（门自身图反事实）：

| 切法 | closure | arch | token 文件/行 | 出闭包文件数 |
|---|---|---|---|---|
| 现值 | 194 | 12 | 30 / 342 | — |
| E3 | 189 | 8 | 29 / 328 | 5 |
| E3+E4 | 185 | **5** | 28 / 325 | 9 |
| **E3+E4+E2（推荐切片）** | **183** | **4** | **27 / 324** | **11** |
| E3+E4+E5 | 182 | 3 | 28 / 325 | 12 |

注意两处非直觉：① 单切 E3+E4 只到 5 —— `riscv64_encode` 在 E3/E4 之后**唯一**存活通道是
`regalloc_production_encoder_events`（实测该文件是它唯一可达 importer），所以它随 E5 而非 E3 走；
② E5 与 E2 都能把 5 压到 ≤4，选 E2 是因为 E2 的 15 个调用点全是 `int32/bool` 纯查询、零写回，
而 E5 的 5 处是内核侧重算插件根哈希、属安全语义，不宜为凑数先动。

**切口文件（3 门面 + 5 个调用方：`native_object_emission_plan`/`native_link_exec`/`regalloc_production_emitter` 各 1 处、`direct_object_emit` 4 处、`primary_object_plan` 15 处）**：

1. `src/core/backend/codegen_writer_units.cheng` —— 删 4 条 arch import，4 个函数体的直调消失（文件随之出闭包）
2. `src/core/backend/direct_object_emit.cheng` —— `:224/:372/:483/:4732` 四处改写请求+回送（E3）
3. `src/core/backend/native_object_emission_plan.cheng` —— `:389` 一处（E3）
4. `src/core/backend/native_link_exec.cheng` —— `:373` 一处（E3）
5. `src/core/backend/codegen_regalloc_adapter_units.cheng` + `src/core/backend/regalloc_production_emitter.cheng:1005` —— E4 唯一调用点
6. `src/core/backend/codegen_x64_body_units.cheng`（删 1 条 arch import）+ `src/core/backend/primary_object_plan.cheng:11` 的 15 处 `x64units.*` —— E2

支撑件（不可省，否则切口变 stub）：

- `src/core/backend/codegen_contract.cheng` —— 新增版本化请求/回送轨（见 3.2）
- `src/core/tooling/compiler_composition_{aarch64,x86_64,riscv64}_main.cheng` —— 组合根服务循环
- `bootstrap/kernel_manifest.cheng` —— 删 11 行（见 3.3）

### 3.2 轨的最小形态（设计草案，`codegen_contract.cheng` 内）

```
const CodegenPluginRailSchema: str = "cheng.codegen.plugin.rail.v1"
const CodegenPluginOpWriterTextDataObjectBytes = 1   # 对应 E3 现有 4 个入口
const CodegenPluginOpWriterTextObjectWrite     = 2
const CodegenPluginOpWriterTextDataObjectWrite = 3
const CodegenPluginOpLinkExeBuiltin            = 4
const CodegenPluginOpRegallocPrepareRecipes    = 5   # 对应 E4

type CodegenPluginRequestRow =      # 内核侧追加，纯 int32/CID/行号
    opId: int32
    unitId: int32
    frozenPlanRow: int32            # 指向内核已冻结的 text/data/symbols/relocs 行范围
    scalar0: int32
    scalar1: int32
    payloadCid: layout.FixedBytes32

type CodegenPluginResultRow =       # 组合根回填
    valid: bool
    errorCode: int32
    bytesCid: layout.FixedBytes32
    resultRow: int32
    count0: int32
    count1: int32

fn CodegenPluginRequestAppend(...): int32          # 返回 ordinal
fn CodegenPluginResultReady(ordinal: int32): bool
fn CodegenPluginResultAt(ordinal: int32): CodegenPluginResultRow
```

内核调用点形态（以 `direct_object_emit.cheng:4732` 为例）：

```
let ordinal = contract.CodegenPluginRequestAppend(
        contract.CodegenPluginOpWriterTextDataObjectBytes, writerUnit, planRow, 0, 0, cid)
if !contract.CodegenPluginResultReady(ordinal):
    return contract.CodegenPluginPendingBytes()     # 显式 pending，不是 Err 兜底
let res = contract.CodegenPluginObjectBytes(ordinal)
```

组合根形态（`compiler_composition_aarch64_main.cheng` 现有 `:9-14` 之后）：

```
if !adapter.RegallocA64CodegenUnitRegister(): return 70
if !contract.CodegenCompositionActivateUnit(contract.CodegenUnitA64): return 71
while true:
    let rc = compiler.CompilerMainCompositionProcessEntry()
    if !contract.CodegenPluginPending(): return rc
    <arch 单元>.CodegenPluginServeOnce()            # 读请求行 → 直调本 arch 实现 → 填结果行
```

**未验证的核心前提**：`compiler_main.CompilerMainCompositionProcessEntry()` 是否可重入/可续跑（需要内核持有游标）。
两个候选形态：(a) 游标续跑（内核把 phase+ordinal 存自身全局，重入时跳过已完成）；(b) 两趟（先冻结全量请求 SoA，再消费结果）。
选哪个必须在动手前用一次最小 repro 实测，本设计不预设。

### 3.3 与 manifest 的强耦合（必须同刀）

反事实切边（推荐切片 E3+E4+E2）实测：

```
closure 194 → 183   arch 12 → 4   token 文件 30 → 27   token 行 342 → 324
出闭包 11 个文件（全部为 arch 或 arch 门面）
```

11 个出闭包文件 = 必须删的 11 行 manifest：

```
bootstrap/kernel_manifest.cheng:28   codegen_writer_units            (*_source)
                          :30   codegen_x64_body_units          (*_source)
                          :59   codegen_regalloc_adapter_units  (*_source)
                          :222  elf_riscv32_writer       :223  elf_riscv64_linker
                          :224  elf_riscv64_writer       :225  elf_x86_64_writer
                          :226  regalloc_aarch64_adapter :228  regalloc_riscv_adapter
                          :229  regalloc_x86_64_adapter  :231  x86_64_body_emit
                          （以上 8 行均为 observed_strict_arch_*）
```

删完后 `observed_strict_arch_*` 剩 4 行：`:220` aarch64_encode、`:221` codegen_a64_fill_units、
`:227` regalloc_production_encoder_events、`:230` riscv64_encode —— 正好等于剩余 arch 数。
**这个「余量恒等于违规数」是切片是否真落地的第一判据。**
若不删而只改代码：`STRICT_CLOSURE_UNMANIFESTED` 涨到 11，门仍红。
若改选 E3+E4+E5：删 12 行（多删 `:29` codegen_encoder_event_units 与 `:227`），余 3 行。

### 3.4 验证流水（每轮 ≈4 分钟烤机 + 门）

1. 静态门：`python3 tools/kernel_plugin_closure_check.py --require-strict-closure`
   → 期望 `arch_reachable=4`、`manifest_unreachable=0 closure_unmanifested=0`、`arch_token_files=27`、violations=4+27=31。
2. 重烤 kernel 驱动：`tools/build_kernel_driver.sh --manifest bootstrap/kernel_manifest.cheng --out <scratch>/cheng-kernel`
   → 必须过 `:196-200` 那组 report 断言（`composition_kind=kernel-only` 等），且 `declared==actual` 不报 HARD_RED。
3. **kernel-only 负例（K3 契约）**：用 2 的驱动跑任一夹具，必须**非零退出且 stderr 含** `codegen_plugin_missing=arm64-apple-darwin`
   （提案 `openspec/proposals/pure-cheng-minimal-kernel.md:62-63`）。若仍能编出可执行文件，说明切口没落到运行路径上。
4. 正例改挂 aarch64 组合根：`tools/build_plugin_driver.sh --arch aarch64`（产物 `artifacts/kernel_drivers/aarch64/cheng-aarch64`，脚本 `:254-255`），
   再 `tools/user_path_gate.sh --driver <该产物> --baseline docs/campaigns/2026-08-31-kernel-userpath/user_path_baseline.tsv`
   → 判词要求 `pass=4 known_red=0 stale=0`（`tools/user_path_gate.sh:660-666`）；探针区当前 7 红，不带 `--require-probes-green`。
5. 字节回执：插件驱动与原 kernel 驱动对同一夹具的对象字节必须逐字节对拍（exec_diff），**编过不算数**。

---

## 4. 禁止项（会变成假绿的具体改法）

1. **把 token 挪进 `#` 注释**：门 `:134-151` 剥注释，挪进注释立刻「消失」——这是真能骗过门的头号漏洞，明令禁止。
2. **拼串绕过**：`"x86" + "_64"`、`Fmt"{a}{b}"` —— 门只剥注释不剥字符串，拆开后不命中 token 子串。禁止。
3. **放宽 allowlist**：往 `:57-60 ARCH_TOKEN_CONTRACT_FILES` 加文件、或把 `:61 ARCH_TOKENS` 减项（如去掉 `arm64`）。禁止。
4. **改桶豁免**：在 `tools/kernel_plugin_attribution.tsv` 把 arch 文件标成 `shared-format`，门按桶豁免即绿。禁止。
5. **只删 manifest 行不改代码**：`closure_unmanifested` 立刻转红，不是绿；反向「只改代码不删行」同样红。二者必须同刀。
6. **拿 `codegen_contract.cheng:494-497 / 910-1740` 的 fn 值槽当耦合面**：那是现成的「插件注册函数指针」机制
   （`CodegenUnitRegisterPrepareRecipes`、`CodegenUnitRegisterWriter*`、`CodegenUnitRegisterA64Body*`），
   `:1685-1740` 的 writer 槽版本与 `:627` 的 recipes 槽版本当前**都是死代码**（实测无外部调用者，活路径走的是门面 `wunits.`/`radapter.`）。
   直接启用它最省事，但违反提案「不公开函数裸指针」；且 `tools/zrpc_kernel_gate.py` 只扫 `ptr` 词元（`:62 PTR_TOKEN`），
   `fn(...)` 值槽**无门可查**——用它等于把红线藏进无门区。禁止，除非用户明确改判 K6 口径。
7. **把 arch 实现搬进内核**（在 contract 里复刻编码器/写对象逻辑）凑「零 import」。禁止。
8. **以门绿/编过代替字节对拍**，或用 kernel-only 驱动跑 4 夹具冒充 K3 验收。禁止。
9. **顺手 `git checkout -- <file>` 撤回共享文件**：`primary_object_plan.cheng`/`direct_object_emit.cheng`/`compiler_main.cheng`
   工作树 mtime = 2026-09-10 11:42（本设计读时 17:36，静默），但按仓库教训这类文件是多线共享，撤回只能逐行还原。

---

## 5. 诚实可行性

按「单线串行、每轮验证 = 1 次烤机（≈4 min）+ 门/对拍分析」计，agent 有效工时：

| 范围 | 内容 | agent 小时 |
|---|---|---|
| S1 最小切片 | contract 轨骨架 + E3 六点 + E4 一点 + E2 十五点 + 3 组合根服务循环 + kernel-only 负例 + manifest 11 行 + 复验 | **40–80 h** |
| 其中：轨骨架与内核续跑（未验证前提） | 最不确定项，可能独立吃掉 | 12–24 h |
| §2 token 清零 | B 12–20 / C 30–55 / D 4–8 | **46–83 h** |
| arch 4 → 0 | E1（33 个 `PrimaryBodyIRFill*` 函数、554 点、var 写回）+ E5（StrictValidate 插件轨，并带走 riscv64_encode）+ E6 | **60–140 h**（E1 单独 40–90 h） |
| 组合面收口 | 四根闭包互异、每根恰一插件、缺/多插件 hard-fail、回执绑定 manifest 原始字节 | 10–20 h |
| **K2/K3 全绿合计** | arch=0 且 token=0 且四根闭合 | **160–320 h** |

判词：
- **S1 是唯一能在一到两个工作日内看到「arch 12→4、门判词从 12 条 ARCH_REACH 降到 4 条」的路径**，且不需要碰 554 点的 body 主包。
- S1 之后剩的 4 个 arch 文件分属两条最贵的链：E1 的 2 个（33 函数 554 点带 var 写回）+ E5 链上的 2 个（`regalloc_production_encoder_events` 及其唯一 import 关系带出的 `riscv64_encode`）。E6 单独切只减 token 不减 arch。
  **S1 不是 K2 的 1/3，而是 K2 里唯一便宜的那 1/3。**
- token 面（§2）与 arch 面（§3）相对独立：即使 arch 归零，仍有 238 行纯字符串 token 与 95 行标识符 token 要收，且其中 `direct_object_emit` 的 78 行要先确认没有 gate 对文案逐字对拍。
- 上述小时数不含等待烤机的墙钟；单轮迭代 4 min 烤机意味着 160–320 h 的 K2 全量对应约 **200–400 次烤机轮**（含失败重试），按串行排期至少 3–6 周。

### 未验证清单（动手前必须实测）

1. `CompilerMainCompositionProcessEntry()` 可重入/可续跑 —— S1 轨的成立前提（本设计未编、未跑）。
2. 运行时 `compositionManifestExactSourceSet` 在现树 kernel-only 构建里的实际判词：declared=162 vs actual=194，**本轮只做了静态计数，未跑构建**。
3. `tools/build_plugin_driver.sh --arch aarch64` 在现树是否已跑通（脚本存在、manifest 齐备，但本轮禁编译，未执行）。
4. 改 `target_matrix.cheng` 常量名后，是否存在 `tools/` 下 gate 对这些名字/文案逐字对拍（`direct_object_emit` 78 行诊断文本尤其）。
5. `src/core/runtime/*` 反向 import `src/core/backend/target_matrix` 是否引入新 import 边并触发其他门。
6. 旧 `r2_closure_ops_map.md:97-103` 记录的 `system_link_exec→backend2_pipeline` 与 `backend2_lower*/assemble` 裸 arch import：本轮实测 E3+E4 后 `riscv64_encode` 在核闭包内的唯一 importer 是 `regalloc_production_encoder_events`，**未复现**该通道，按未验证处理。
