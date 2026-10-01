# pc_closure_s1_edit_plan —— K2/R2 严格闭包最小切片 S1 行级施工图

日期：2026-09-10。基线：`strict-closure-k3-split.md`（360 行）。本文 = 只读分析产出，
零改源、**零编译**（另一执行线独占编译槽）。所有计数由 `tools/kernel_plugin_closure_check.py`
本身函数实测；反事实用内存切边复现（脚本见 §2）。

复现基线（本文写入时实跑）：

```
python3 tools/kernel_plugin_closure_check.py --require-strict-closure
→ rc=1 FAIL_STRICT violations=42
  strict_manifest_sources=194 strict_core_closure_files=194
  strict_manifest_unreachable=0 strict_closure_unmanifested=0
  strict_arch_reachable_files=12  strict_arch_token_files=30  strict_arch_token_lines=342
```

---

## 0. 三条口径修正（施工前必须先钉死，否则每步都会误判「半成品」）

### 0.1 本切片的静态门**全程红**，「rc=0」只对构建成立

门在 K2 全部完成前不可能 `rc=0`：violations = `arch_reachable + arch_token_files`，S1 只把它
从 42 压到 31。所以每步的验收口径固定为：

| 每步必守的不变量 | 值 |
|---|---|
| `strict_manifest_unreachable` | **0** |
| `strict_closure_unmanifested` | **0** |
| `strict_arch_reachable_files` / `token_files` / `token_lines` | **精确命中 §1 预测值** |
| `violations` | **= arch + token_files 精确值** |
| 退出码 | `1`（FAIL_STRICT，预期；出现 `2` 或新失败类即回退） |

出现 `STRICT_MANIFEST_UNREACHABLE` 或 `STRICT_CLOSURE_UNMANIFESTED` 任一非零 = 半成品态，
必须当步回退。「rc=0 可编译」的约束落在 §5 的构建腿，不在静态门。

### 0.2 门面「出闭包」的充要条件是**调用方停止 import 它**，不是「删门面自己的 arch import」

设计 §3.1 表「出闭包文件数」是隐含了调用方切边后的值。实测反证（§2 脚本 `E3 E4 E2` 只切门面
自身 arch import、不切调用方）：

```
closure_files=186  arch_reachable=4  token_files=30 token_lines=342  出闭包 8
```

即：**少出的 3 个正是三个门面本体**（`codegen_writer_units` / `codegen_regalloc_adapter_units` /
`codegen_x64_body_units`），少减的 18 行 token 正是这三门的 `14+3+1`。把调用方 → 门面的
`import` 一并切掉后才是设计表的 183 / 4 / 27 / 324 / 11（§2 已逐组复现三行全中）。

**施工推论**：每刀必须是「调用方改写 + 删调用方 import + 删门面自身 arch import + 删 manifest
对应行」的**同一步**。设计 §3.3 把 manifest 删除写成"强耦合（必须同刀）"是对的，但 §3.1 的
切口文件清单把「删门面自己的 arch import」误当成出闭包的充分条件。

### 0.3 门面出闭包后，它残留的 arch import 在门里**不可见**

`scan_strict_arch_tokens` 只遍历 `reachable`（`:309`），`direct_violations` 只扫
`kernel`/`backend2` 桶（`:37 DIRECT_VIOLATION_SOURCES`），`bfs_indirect` 根只取 kernel 桶（`:523`）。
所以门面一旦不可达，它的 arch import/token **三条口径全不覆盖**。这意味着：
删除门面 arch import 这半步**没有门禁**，只能靠构建 + `grep` 自证。别把"门绿了"当成这半步做完了。

---

## 1. 逐步编辑清单

排序原则：**先加后删**（契约轨 → 调用方改写 → 删门面 import → 删 manifest 行）。
每步的 manifest 行删除与该步的边切**同刀**（否则 0.1 的不变量破）。

### S0 —— 契约轨骨架（纯增量，不改任何调用方）

| 项 | 内容 |
|---|---|
| 文件:行 | `src/core/backend/codegen_contract.cheng`，追加在 `:1742`（文件末）之后 |
| 改法要点 | 落设计 §3.2 的 `CodegenPluginRailSchema` / `CodegenPluginOp*` 5 个常量 / `CodegenPluginRequestRow` / `CodegenPluginResultRow` 两类型 / `CodegenPluginRequestAppend` / `CodegenPluginResultReady` / `CodegenPluginResultAt`。**只放 int32 / CID / arena row 索引**；不得内嵌任何 arch 实现（禁止项 ⑦） |
| 命名避让 | 现有 `CodegenPluginMissingError`（`:859`）与 `CodegenComposition*`（`:512-580`）已占用；新符号勿撞。实测 `CodegenPluginRequestAppend/ResultReady/ResultAt/Pending` **当前均不存在**（`grep -n 'CodegenPlugin' codegen_contract.cheng` 只命中 `:23,75,578,831,859`），§3.2 确为新增 API |
| 静态门期望 | `194 / arch 12 / token 30 / 342 / violations 42`（与基线逐字相同）；`unreachable=0 unmanifested=0` |
| 验证 | `python3 tools/kernel_plugin_closure_check.py --require-strict-closure`（应逐字复现基线输出） |
| 风险 | `codegen_contract.cheng` 在 `ARCH_TOKEN_CONTRACT_FILES`（门 `:57-60`）豁免区内 —— 新代码的 token **无门可查**。这是本切片唯一"门看不见"的写入面，必须靠 review 自证 |

### S0.5 ——【必须先做，决定 S1 能否按设计形态落地】内核可续跑性实测

设计 §3.2 的组合根服务循环要求反复调 `compiler.CompilerMainCompositionProcessEntry()`。
**实测该函数形态与设计前提直接冲突**：

```
src/core/tooling/compiler_main.cheng:9053  fn CompilerMainCompositionProcessEntry(): int32 =
src/core/tooling/compiler_main.cheng:9054      if !codegen_contract.CodegenCompositionActive(): ... return 2
src/core/tooling/compiler_main.cheng:9063      return CompilerMainProcessEntry()
src/core/tooling/compiler_main.cheng:8923  fn CompilerMainProcessEntry(): int32 =   # 整轮编译一次入口，同时是 main() 体
src/core/tooling/compiler_main.cheng:8859-8868
    # ... Doing this in CompilerMainCompositionProcessEntry would parse argv and
    # allocate managed strings before the process-entry allocation-ledger
    # session exists, permanently violating its pristine-heap precondition.
```

`CompilerMainProcessEntry` 是**一次性整轮编译入口**（`main()` 体即 `return CompilerMainProcessEntry()`，
`:9065-9066`），并持有 allocation-ledger session owner。`:8859-8868` 的注释明令：
在它之前解析 argv/分配托管内存会**永久破坏 pristine-heap 前置条件**。`9053-9063` 是它的薄包装，
**没有任何游标/phase 状态**。

结论：设计 §3.2 的 `while true: CompilerMainCompositionProcessEntry()` 循环 = 反复重入一次性入口，
与 `:8859-8868` 记录的不可重入前提**直接矛盾**。设计把它标为"未验证前提"是低估——静态证据已经
指向"按现形态不可行"。

**必须实测的最小 repro（唯一授权动作，1 次烤机）**：构造一个只调两次
`CompilerMainCompositionProcessEntry()` 的最小驱动（或直接在
`compiler_composition_kernel_main.cheng:7` 后加第二次调用做**临时探针并还原**），判定：
(a) 第二次进入是否 abort / HARD_RED / 重复解析 argv；(b) 若存活，第二轮是否从零重跑。
结果决定 S1 的形态：
- 若可重入 → 按设计 §3.2 走，`(a) 游标续跑`（每次重入从零重跑、靠缓存放行；代价 = O(请求数 × 整轮编译)）。
- 若不可重入 → **S1 必须改形态**，见 §6 的两条出路。

| 静态门期望 | 与 S0 相同（探针必须还原，还原后门计数不动） |
|---|---|
| 验证 | 同上 + `git diff` 证明探针已还原 |

### S1 —— E3（writer_units，4 arch 文件 + 1 门面出闭包）

同刀的 5 处编辑 + 5 行 manifest：

| # | 文件:行 | 改法要点 |
|---|---|---|
| 1 | `codegen_writer_units.cheng:22-25` | 删 4 条 arch import（`elf_x86_64_writer`/`elf_riscv64_writer`/`elf_riscv32_writer`/`elf_riscv64_linker`）。此文件其余 14 行 token 随之消失（`:38,40,42,44,59,80,90,100,110,134`）—— 但**本步门看不见**（0.3），须构建自证 |
| 2a | `direct_object_emit.cheng:224`（in `DirectObjectEmitWriteObjectTextOnly`，`:205`） | `wunits.CodegenWriterUnitTextObjectWrite(CodegenUnitX64,…)` → 轨：`append(op=WriterTextObjectWrite) → ready? → at()` |
| 2b | `direct_object_emit.cheng:372`（in `DirectObjectEmitWriteObjectForFormat`，`:345`） | 同上，`CodegenWriterUnitTextDataObjectWrite` 形 |
| 2c | `direct_object_emit.cheng:483`（in `DirectObjectEmitWriteObjectPathForFormatInto`，`:458`） | 同上 |
| 2d | `direct_object_emit.cheng:4732`（in `DirectObjectEmitPlanObjectBytesInto`，`:4697`） | `wunits.CodegenWriterUnitTextDataObjectBytes(CodegenUnitX64, text, data, symbols, relocs)` → 轨。**注意臂形**：`:4729-4731` 的 gate 是 `objectFormat=="elf" && CodegenElfTextDataWriterUnit(triple)==CodegenUnitX64`；`:4734-4741` 的 aarch64 臂**直接调 `elf_object_writer`（shared-format，不经门面）**，本刀不动它 |
| 2e | `direct_object_emit.cheng:23` | 删 `import cheng/core/backend/codegen_writer_units as wunits` |
| 2f | `direct_object_emit.cheng:275 / :407 / :506` | S4-D 缺件臂（`contract.CodegenPluginMissingError`）**保留原样**：契约查表未命中与"插件未服务"是两件事，别合并 |
| 3 | `native_object_emission_plan.cheng:389`（in `NativeObjectEmissionPlanEmitInto`，`:358`）+ `:8` import | 同 2d/2e。此处已有 `writerUnit` 局部（`:386`），直接当 `unitId` 用 |
| 4 | `native_link_exec.cheng:373`（in `NativeLinkExecRunSelfLinker`，`:304`，`elf_riscv64_builtin` 臂）+ `:9` import | `CodegenWriterUnitLinkExeBuiltin` → 轨。**注意** `:375-379` 把 `!linkRes.ok` 的 err 写进 log 并以 rc=1 返回；轨的 pending **必须是第三态**，不能塞进 `Err`（否则 pending 会被当链接失败写盘） |
| 5 | `bootstrap/kernel_manifest.cheng` | 删 **5 行**：`:28`（`backend_codegen_writer_units_source`）、`:222`（elf_riscv32_writer）、`:223`（elf_riscv64_linker）、`:224`（elf_riscv64_writer）、`:225`（elf_x86_64_writer） |

| S1 静态门期望 | `closure 189 / arch 8 / token 29 / 328 / violations 37 / unreachable=0 unmanifested=0 / rc=1` |
|---|---|
| 验证 | `python3 tools/kernel_plugin_closure_check.py --require-strict-closure`；`grep -c 'elf_\(x86_64\|riscv64\|riscv32\)_writer\|elf_riscv64_linker' src/core/backend/codegen_writer_units.cheng` 应为 0（0.3 无门禁，手工自证） |

### S2 —— E4（regalloc_adapter_units，3 arch 文件 + 1 门面出闭包）

| # | 文件:行 | 改法要点 |
|---|---|---|
| 1 | `codegen_regalloc_adapter_units.cheng:26-28` | 删 3 条 arch import（本文件 3 行 token = `:26,27,45`，`:45` 是 `x8664adapter.` 调用文本，随 1 一起消失） |
| 2a | `regalloc_production_emitter.cheng:1005`（in `regallocProductionPlanAndRecipesInto`，`:913`） | `radapter.CodegenRegallocAdapterUnitPrepareFunctionRecipes(...)` → 轨。**这是全切片最难一处**：入参含 `var coreir.BodyIR`、`var alloc.RegallocSinglePassValuePlan`、两个 **var 写回** `str[]`（`dataSymbolProjection.slotDataSymbols` / `cstringDataSymbols`，`:1008-1009`）。必须按设计 §3.1 把两个 `str[]` 化成请求计划里的 SoA 行 |
| 2b | `regalloc_production_emitter.cheng:979-982` | `contract.CodegenUnitPrepareRecipesRegistered(unitId)` 硬门**保留**：它是"插件已在位"的现存证据，不是本刀对象 |
| 2c | `regalloc_production_emitter.cheng:4` | 删 `import ... codegen_regalloc_adapter_units as radapter` |
| 3 | `bootstrap/kernel_manifest.cheng` | 删 **4 行**：`:59`（`closure_src_core_backend_codegen_regalloc_adapter_units_source`）、`:226`（aarch64 adapter）、`:228`（riscv adapter）、`:229`（x86_64 adapter） |

| S2 静态门期望 | `closure 185 / arch 5 / token 28 / 325 / violations 33 / unreachable=0 unmanifested=0 / rc=1` |
|---|---|

### S3 —— E2（x64_body_units，1 arch 文件 + 1 门面出闭包）

| # | 文件:行 | 改法要点 |
|---|---|---|
| 1 | `codegen_x64_body_units.cheng:24` | 删 `import ... x86_64_body_emit as x64body` |
| 2 | `primary_object_plan.cheng` 15 处 | 见 §4 冲突面。接口全是 `int32/bool` 纯查询、零 var 写回（`CodegenX64BodyIrWordCount/OpSizeAt/TermSize/PrologueByteCount/CallArgWordCount/CallRegArgCount/CallStackArgCount/CallStackArgBytes/RelocWordOffset/PrepareStackLayout`）；改 `tmat`/contract 谓词或轨请求 |
| 3 | `primary_object_plan.cheng:11` | 删 `import ... codegen_x64_body_units as x64units` |
| 4 | `bootstrap/kernel_manifest.cheng` | 删 **2 行**：`:30`（`backend_codegen_x64_body_units_source`）、`:231`（`observed_strict_arch_x86_64_body_emit`） |

**15 处调用点实测归属**（本文用门同款解析按最近 `fn` 归属，与设计一致）：

| 函数（声明行） | 处数 | 行号 |
|---|---|---|
| `PrimaryBodyIrAppendCallCStringArgRelocsX64`（`:62804`） | 5 | `:62822,62824,62851,62854,62882` |
| `PrimaryBodyIrAppendCStringArgRelocs`（`:62887`） | 3 | `:62916,63000,63007` |
| `PrimaryBodyIrAppendGlobalOpRelocs`（`:63012`） | 3 | `:63038,63102,63109` |
| `PrimaryBodyIrWordCountForTarget`（`:3046`） | 1 | `:3064` |
| `PrimaryBodyIrPrepareTargetMetricsInPlace`（`:64526`） | 1 | `:64535` |
| `PrimaryObjectPlanEnsureFunctionLowered`（`:67171`） | 1 | `:67331` |
| `PrimaryObjectPlanBuildItemsPhase`（`:74811`） | 1 | `:75980` |

合计 15 ✅。**行号漂移警告**：设计 §1 记的是 `PrimaryObjectPlanBuildItemsPhase`（`:75912`）、
`PrimaryObjectPlanCaptureBodyIrDetails`（`:65687`）；本文实测前者为 `:74811`。设计读树后
`primary_object_plan.cheng` 又被改过（见 §4），**所有锚点必须按内容而非行号定位**。

| S3 静态门期望（切片完成态） | `closure 183 / arch 4 / token 27 / 324 / violations 31 / unreachable=0 unmanifested=0 / rc=1` |
|---|---|
| 落地判据 | `observed_strict_arch_*` 剩 4 行（`:220 aarch64_encode`、`:221 codegen_a64_fill_units`、`:227 regalloc_production_encoder_events`、`:230 riscv64_encode`）**恒等于** arch 数 4 |

### 全切片 manifest 删除汇总 = 11 行

```
:28  :30  :59                                    (3 行 *_source / closure_src_*)
:222 :223 :224 :225 :226 :228 :229 :231          (8 行 observed_strict_arch_*)
```

与设计 §3.3 逐行一致 ✅。**未删**：`:220 :221 :227 :230`（余 4 = arch 4）。

---

## 2. 反事实切边的可复现命令

**门不支持 CLI 切边**（`argparse` 只有 `--tsv/--require-closure/--require-strict-closure/--kernel-manifest/--kernel-entry/--diverge-files`，`:432-443`；没有任何边过滤开关）。所以必须
**把门当模块导入、用门自己的函数**做内存切边（不落盘、不改树）。脚本形状如下（已实测跑通；
`CALLER_CUTS` 是 0.2 那条修正的体现，缺了它复现不出设计表）：

```python
#!/usr/bin/env python3
"""只读反事实切边。usage: python3 pc_closure_cf.py E3 E4 E2"""
import importlib.util, sys
from pathlib import Path

REPO = Path("/Users/lbcheng/cheng-lang")

# 门面 -> 要切的 arch 子模块（设计 §1 的 12 条入口边，按 6 个门面分组）
CUTS = {
    "E1": ("src/core/backend/codegen_a64_body_units.cheng",
           ["aarch64_encode", "codegen_a64_fill_units"]),
    "E2": ("src/core/backend/codegen_x64_body_units.cheng", ["x86_64_body_emit"]),
    "E3": ("src/core/backend/codegen_writer_units.cheng",
           ["elf_x86_64_writer", "elf_riscv64_writer", "elf_riscv32_writer",
            "elf_riscv64_linker"]),
    "E4": ("src/core/backend/codegen_regalloc_adapter_units.cheng",
           ["regalloc_aarch64_adapter", "regalloc_x86_64_adapter",
            "regalloc_riscv_adapter"]),
    "E5": ("src/core/backend/codegen_encoder_event_units.cheng",
           ["regalloc_production_encoder_events"]),
    "E6": ("src/core/backend/codegen_a64_link_units.cheng", ["aarch64_encode"]),
}
# 门面只有在其调用方停止 import 它时才出闭包（§0.2）。实测：缺这半边 → 186/4/30/342。
CALLER_CUTS = {
    "E2": [("src/core/backend/primary_object_plan.cheng", "codegen_x64_body_units")],
    "E3": [("src/core/backend/direct_object_emit.cheng", "codegen_writer_units"),
           ("src/core/backend/native_object_emission_plan.cheng", "codegen_writer_units"),
           ("src/core/backend/native_link_exec.cheng", "codegen_writer_units")],
    "E4": [("src/core/backend/regalloc_production_emitter.cheng",
            "codegen_regalloc_adapter_units")],
}

def load_gate():
    spec = importlib.util.spec_from_file_location(
        "g", REPO / "tools/kernel_plugin_closure_check.py")
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod

def evaluate(g, cuts, root):
    table = g.load_table(root / "tools/kernel_plugin_attribution.tsv",
                         [root / "src/core/backend", root / "src/core/backend2"])
    edges, _errors, _ = g.build_core_import_graph(root)
    manifest, merr = g.parse_manifest_sources(root / "bootstrap/kernel_manifest.cheng", root)
    for k in merr: print("manifest_error:", k)
    edges = {k: list(v) for k, v in edges.items()}          # 只在内存里改
    for name in cuts:
        rel, mods = CUTS[name]
        src = (root / rel).resolve()
        doomed = {(root / "src/core/backend" / (m + ".cheng")).resolve() for m in mods}
        edges[src] = [t for t in edges[src] if t not in doomed]
        for caller_rel, facade in CALLER_CUTS.get(name, ()):
            c = (root / caller_rel).resolve()
            f = {(root / "src/core/backend" / (facade + ".cheng")).resolve()}
            edges[c] = [t for t in edges[c] if t not in f]
    reach, parents = g.reachable_core_closure([manifest["compiler_entry_source"]], edges)
    arch = g.arch_reachable_paths(reach, parents, table)
    toks, tlines = g.scan_strict_arch_tokens(reach, root, table)
    declared = set(manifest.values())
    return reach, arch, toks, tlines, sorted(declared - reach), sorted(reach - declared)

g = load_gate(); root = g.repo_root()
reach, arch, toks, tlines, unrel, unman = evaluate(g, sys.argv[1:], root)
print(f"closure={len(reach)} arch={len(arch)} token_files={len(toks)} "
      f"token_lines={tlines} unreachable={len(unrel)} unmanifested={len(unman)} "
      f"violations={len(arch) + len(toks)}")
```

实测输出（本文实跑，逐组命中设计 §3.1 表**全部四列**）：

| 切法 | closure | arch | token 文件/行 | 出闭包 | violations |
|---|---|---|---|---|---|
| NONE（基线） | 194 | 12 | 30 / 342 | — | 42 |
| E3 | 189 | 8 | 29 / 328 | 5 | 37 |
| E3+E4 | 185 | 5 | 28 / 325 | 9 | 33 |
| **E3+E4+E2** | **183** | **4** | **27 / 324** | **11** | **31** |
| 只切门面（缺 CALLER_CUTS） | 186 | 4 | 30 / 342 | 8 | 34 |

E5+E4+E3（设计备选，`closure 182 / arch 3`）本文**未复现**（未跑该组）。

**替代对拍法（更省事，推荐做正法）**：反事实只是开工前的预算，一旦 §1 的逐步期望表钉死，
**逐步表本身就是 oracle**——每步跑真门、与表中三元组逐字比对即可，不需要再跑反事实。
反事实唯一不可替代的用途是「选别的切法」（例如 E4 被热文件卡住时改选 E5 探价）。

---

## 3. token 面处置清单（30 文件 / 342 行）

形状（门自身判定，剥 `#` 注释、**不剥字符串**）：import 行 9 + 标识符/表达式 95 + 纯字符串 238 = 342。
A 20 + B 91 + C 219 + D 12 = 342 ✅（与设计 §2 合计一致）。

### 3.1 A 类：随切口消失（S1 只吃到其中 3 个）

| 文件 | 行数 | S1 处置 |
|---|---|---|
| `codegen_a64_body_units.cheng:22` | 1 | **不切**（E1，554 点，L 级） |
| `codegen_x64_body_units.cheng:24` | 1 | **S3 出闭包** |
| `codegen_writer_units.cheng:22-25` + `:38,40,42,44,59,80,90,100,110,134` | 14 | **S1 出闭包** |
| `codegen_regalloc_adapter_units.cheng:26,27,45` | 3 | **S2 出闭包** |
| `codegen_a64_link_units.cheng:12` | 1 | **不切**（E6） |

设计 §2.1 表是 5 文件 / 20 行；**S1 只拿走 3 文件 / 18 行**，故 30→27、342→324 ✅（数字自洽，
但设计正文没点明"5 取 3"，施工时别按 20 行核账）。`codegen_encoder_event_units.cheng` 不在表内，
它本身零 token，只是 arch 边载体（实测其首行不在门的 token 命中列表里）。

### 3.2 B 类：格式常量 → 迁 `target_matrix.cheng`（6 文件 / 91 行）

`target_matrix.cheng` 是 `kernel` 桶、**零 import**（tsv:74），且在 `ARCH_TOKEN_CONTRACT_FILES`
豁免区（门 `:57-60`）——所以带 arch token 的**新常量名只能落在这里**，调用侧名必须无 token
（先例 `TargetIsLinuxX64`、`CodegenUnitX64`）。

| 文件 | 行 | 锚点 | 风险 |
|---|---|---|---|
| `coff_object_linker.cheng` | 13 | 首行 `:86`；`IMAGE_FILE_MACHINE_ARM64=43620`、`IMAGE_REL_ARM64_*`（`:90-92`）、机器校验 `:512`、triple 比较 `:1403` | 该文件在 `tools/backend_dispatch_readonly_borrow_static_gate.sh` 的**只读借用**面内，改调用形态可能触发该门；比较改 `tmat.TargetIsWindowsX64` 前先读该门全文 |
| `coff_object_writer.cheng` | 18 | 首行 `:11`；常量 `:11,12,32-37`；triple→machine/reloc 分派 `:99-123` | `IMAGE_FILE_MACHINE_X86_64` **同时命中 `x86_64` 与 `x8664` 两个子串**（门 `ARCH_TOKENS` `:61`）——改名须同时避两个 |
| `elf_object_linker.cheng` | 38 | 首行 `:80`；EM/R_ 常量 `:80,124-144`；分派 `:437,657-658,709-717,1070,1172-1192,1261,1503,1939,2075,2165-2198,2266`；平台串 `:782` `/lib/ld-linux-aarch64.so.*` | 单文件最大 B 项；`:782` 是**运行时动态加载器路径**，不是格式常量——误迁成"权威常量"会把宿主路径绑进 target_matrix |
| `elf_object_writer.cheng` | 7 | 首行 `:14`；EM_AARCH64/R_AARCH64_* `:34-39` | 该文件是**内核现役直调**（`direct_object_emit.cheng:4740`、`native_object_emission_plan.cheng:397` 直接调它），改它会同时动 S1 的邻域 → 排在 S1 之后 |
| `debug_relocatable_object_evidence.cheng` | 6 | 首行 `:11`；`DebugRelocatableObjectMachineX86_64=2`、`:198,496,528,841,862` | DWARF machine id 是格式常量；`:496/:841` 是判定，改引权威谓词 |
| `macho_provider_linker.cheng` | 9 | 首行 `:552`；`:1409-1413` `machoProviderRelocationValueContract(kind)`；`:2542,2559,3165,3181,3697` | `:1409-1413` 是**重定位值合同名字符串**，改名=改值合同，必须与消费门同步；先把 `grep -rn '<旧名>' tools/ src/` 打干净 |

### 3.3 C 类：triple 分派（15 文件 / 219 行）——**最大风险面 = 判词对拍门**

#### C1-a `direct_object_emit.cheng` 78 行 = **33 行诊断文案 + 45 行 triple 比较**

本文实测 78 行逐行分类，与设计 §2.3 的 33/45 切分**完全吻合**：

- **33 行纯诊断文案**（改动候选）：`:2752, 2860, 2871, 2875, 2878, 2886, 2890, 2893, 2896, 2905, 2909, 2912, 2935, 2939, 2977, 2984, 2988, 3148, 3151, 3154, 3163, 3168, 3172, 3174, 3689, 3698, 3705, 3886, 4034, 4288, 4299, 4308, 4319`
- **45 行 triple 比较/守卫**：`:94-96, 105, 107, 109, 111, 113, 115, 117, 119`（11）、`:248-252`（5）、`:385-389`（5）、`:490-494`（5）、`:988`、`:2124`、`:2564`、`:2620`、`:2793, 2795, 2801, 2802`（4）、`:3277`、`:3931`、`:4058, 4078, 4123`（3）、`:4735-4739`（5）、`:5013`

**「改文案会不会破坏判词对拍门」——已实测，答：会，但不是那 33 行。**
本文把 `tools/` 全部 `-F '...'` 字面量抽出（175 条）与 30 个 token 文件对拍，命中 2 处门 + 1 处夹具：

| 门/夹具 | 位置 | 逐字文案 | 是否落在 78 行内 |
|---|---|---|---|
| `tools/direct_object_symbol_identity_fail_closed_gate.sh` | `:8` | `direct object emit: exact symbol identity row out of range` | **否** |
| `tools/backend_dispatch_readonly_borrow_static_gate.sh` | `:64` | 同上 | **否** |
| `tools/zc_fixtures/wave3/repro44_call_nestedargs.cheng` | `:18` | `"direct object emit: add branch reloc"` | **否** |

**处理建议**：
1. **只改 token 子串，不改报文骨架**。两个门的字面量都锚在 `direct object emit: ` 前缀 + 具体判词上；
   把 `x86_64 canonical target mismatch` 改成引 `contract.CodegenUnitLabel(unitId)` 拼出的等价文本时，
   **前缀与后半句必须逐字保留**，且**不得全局替换 `" direct object emit: "` 前缀**。
2. **禁整文件 sed**。同文件还有 `:4299 "direct object emit: add x86_64 canonical call relocation"`
   与夹具 `repro44` 的 `"direct object emit: add branch reloc"` 同族——`:4299` 在 33 行内、夹具文案
   不在，sed 同族替换会漏掉夹具。
3. 改完**必跑**：`bash tools/direct_object_symbol_identity_fail_closed_gate.sh`、
   `bash tools/backend_dispatch_readonly_borrow_static_gate.sh`，外加 `rg -n 'direct object emit' tools/*.sh` 复核。
4. 本文只扫了 `-F` 字面量；**正则/`grep -E` 型门未穷尽**（标「未验证」）。

#### C1-b 其余 11 文件 / 96 行

`native_link_exec_darwin.cheng`(9，首行 `:15`)、`native_object_emission_plan.cheng`(9，首行 `:42`)、
`system_link_exec.cheng`(7，首行 `:1981`)、`system_link_exec_runtime.cheng`(13，首行 `:670`)、
`lowering_plan.cheng`(3，首行 `:1137`)、`regalloc_single_pass.cheng`(3，首行 `:1313`)、
`compiler_main.cheng`(19，首行 `:2419`)、`build_plan.cheng`(19，首行 `:12`)、
`support_matrix.cheng`(7，首行 `:61`)、`composition_manifest.cheng`(6，首行 `:292`)、
`compiler_snapshot_lowering_bridge.cheng`(1，首行 `:55`)。

统一改引 `tmat.TargetIs*` / `contract.CodegenBodyEmitUnit`（`codegen_contract.cheng:734`）/
`CodegenElfTextDataWriterUnit`（`:705`）；`support_matrix.SupportTargetRow(targetTriple:"…")` 是**数据表**，整表迁 `target_matrix`。

**此处有 8 个 token 文件的标识符被门 `-F` 字面量钉住**（实测命中）：
`composition_manifest.cheng`（`compositionDeclaredSourcePaths`×7、`req.compositionDeclaredSourcesSha256`×4、
`HARD_RED:composition_manifest_entry_unit_mismatch`×3 等）、`compiler_main.cheng`
（`BuildSystemLinkPlanStubWithExternalPackageRoots(`×4、`CompilerRequestFromRuntimeFlagsInto(`×3 等）、
`system_link_exec.cheng` / `system_link_exec_runtime.cheng`（`req.compositionSourceClosureSha256`、
`missing provider`、`duplicate provider`、`"windows-primary-object-cache"` 等）、
`primary_object_plan.cheng`、`lowering_plan.cheng`（`LoweringPlanFunctionInterfaceCidAt(`×4）、
`direct_object_emit.cheng`、`production_held_exec_provider.cheng`。
→ **铁律：C 类只改字符串字面量的"值"，绝不动标识符/函数名/`HARD_RED:` 判词常量。**

#### C2 结构性数据表（3 文件 / 45 行）

| 文件 | 行 | 锚点 | 处置 |
|---|---|---|---|
| `bootstrap_contracts.cheng` | 30 | 首行 `:55`（host→triple 映射整表 `:55-101`）；`:196` `"src/core/backend/aarch64_encode.cheng"` | 整表迁 `target_matrix`。`:196` 是**插件源路径**，去向同 `build_plan`（插件源清单），不是 target 表 |
| `regalloc_production_artifacts.cheng` | 10 | 首行 `:40`；`:40-47` 7 条 triple 常量；`:1582` 局部名 | 迁 `target_matrix`。注意该文件是 E4 的邻域（`:2157` 起的 `regallocProductionFrozenPlanValid` 在 E5 链上） |
| `primary_object_plan.cheng` | 5 | 首行 `:3051`；`:3051, 64531, 75889` wasm32 单元键；`:70152, 70343` 硬编码 triple | `:70152/70343` 的 `let targetTriple = "arm64-apple-darwin"` 是**默认/测试臂硬编码**，须先判归属。**本文实测行号已漂移**（见 §4）——按内容 grep，勿按行号 |

`build_plan.cheng`(19) 特殊：`:145,190` 是 `BackendSourceUnit(role: BackendA64EncodeSource, path: BackendRootPath(rootDir,"src/core/backend/aarch64_encode.cheng"))`
—— **源码路径枚举**，归宿是 plugin manifest / 单元→源路径表（先例 `compiler_snapshot_lowering_bridge.cheng:55`）。

### 3.4 D 类：宿主平台身份串（4 文件 / 12 行）

`csg_core/production_launcher.cheng:33-34`(2)、`runtime/held_exec_identity.cheng:119-121,484,488,490`(6)、
`runtime/production_held_exec_provider.cheng:22-23`(2)、`runtime/production_held_exec_spawn.cheng:13,56`(2)。
内容 = `"darwin-arm64"` / `"linux-x86_64"` 与 `uname` 输出比对，**不是代码生成 target**，门不区分运行时层。

处置：字面量集中到 `target_matrix.cheng` 宿主平台表。**风险（设计标"未验证"，本文同样未验证）**：
`src/core/runtime/*` 反向 import `src/core/backend/target_matrix` 会新增
`runtime → backend` import 边，可能触发别的门（`target_matrix` 零 import 故不成环，但反向边本身是新的）。
`production_held_exec_provider.cheng` 的标识符 `compilerRequestCid` 已被门 `-F` 钉住 → 只改值、不改名。

---

## 4. 冲突面与顺序

### 4.1 `primary_object_plan.cheng`（热文件，另一线正在改）

**实测状态（本文 2026-09-10 读时）**：

```
mtime = 2026-09-10 21:04:18          # 设计 §4.9 记的是 11:42（设计读时 17:36「静默」）
git status = M src/core/backend/primary_object_plan.cheng    # 未提交 WIP
diff stat  = 76 insertions(+), 8 deletions(-)
WIP hunk 行段 = 68858-69090 与 69941-70089
```

**关键结论：WIP 与 E2 的 15 处调用点空间上完全不重叠。** 15 处在 `:3064 / 62822-63109 / 64535 /
67331 / 75980`，WIP 全在 `:68858-70089`。所以**同刀不会 clobber**。

但设计 §1 给的两个行号（`PrimaryObjectPlanBuildItemsPhase`(`:75912`)、
`PrimaryObjectPlanCaptureBodyIrDetails`(`:65687`)）与本文实测（`:74811`、`x64units` 无关）**不一致**
→ 该文件在设计读树之后被改过（缩短约 1100 行）。**所有锚点必须内容定位**：

```
grep -n 'x64units\.' src/core/backend/primary_object_plan.cheng   # 15 调用 + 1 import
```

**顺序建议**：
1. **E2 独立成步（已是 S3），不与 E3/E4 同刀。** 理由不是文本冲突，而是**验证隔离**：
   E2 的失败模式（15 个纯查询语义漂移 → body 尺寸错 → 字节错）与 E3/E4（写盘/回送）不同，
   混在一刀里 exec_diff 红了分不清是谁。
2. **动 E2 前必须确认文件静默**。门槛照 `lessons.md`/`CLAUDE.md` 的既有纪律：
   `primary_object_plan.cheng` mtime 静止 >10min 且 `git status` 无该文件未提交改动才动手；
   有 WIP 时**先 `git diff -- src/core/backend/primary_object_plan.cheng > <任务级临时目录>/po.patch` 留底**
   （只读留底，不写仓）。
3. **绝不 `git checkout -- primary_object_plan.cheng` / `git restore`**（设计 §4.9 已列；仓库血泪教训，
   会连带抹掉另一线未提交 WIP，不可逆）。撤回自己在共享文件的改：Edit 工具逐行还原，
   或 `git stash push -- <pathspec>` 后立即恢复别人部分。
4. 若该文件持续活跃 → **E2 换 E5**：E5 能把 arch 5→3（比 E2 的 5→4 更狠，`closure 182 / arch 3`），
   代价是 9 处调用里 5 处 `StrictValidate` 依赖内核侧重算插件根哈希（安全语义）。
   E5 的免费部分已于 `codegen_contract.cheng:880-889` 有 fn 槽基建（**禁止启用**，禁止项 ⑥）。

### 4.2 `compiler_csg.cheng` / `typed_expr_type_arena.cheng`（内存线占用期）

```
mtime: compiler_csg.cheng 21:15:54   diff 8+/3-   hunk @38911-38930
mtime: typed_expr_type_arena.cheng 21:16:32   diff 442+/2-   hunk @112-8443（13 段）
```

两者都在严格闭包内（`compiler_csg.cheng` 经 `closure_src_core_tooling_compiler_csg_source`，
`typed_expr_type_arena.cheng` 经 `closure_src_core_lang_typed_expr_type_arena_source`）。

**排队建议**：
1. **S1 不需要碰这两个文件** —— E3/E4/E2 的切口全在 backend 侧，`compiler_csg`/`typed_expr_type_arena`
   只出现在闭包成员名单里，不在任何切点或 token 名单里（两者都不在 30 个 token 文件内）。
2. 但**它们是活动树的一部分**：每步改完都要重跑门并**重读行锚点**（0.2/§4.1 已强调内容定位）。
   若某步的门计数与 §1 预测不符，**第一嫌疑是这两文件在步间被改**（例如新增/删除 import 会
   改变闭包成员数，直接偏移 closure 计数）。
3. **不要为了"顺手清理 token"碰它们**：`typed_expr_type_arena.cheng` 的 442 行未提交改动是内存线的
   活体，任何写入都可能在对方下次落盘时被覆盖或覆盖对方。S1 全程保持对这两个文件的**零写**。
4. 该纪律同样适用于 `?? design/`（仓根未跟踪目录，非本任务产物）——不动、不删、不提交。

---

## 5. 验收

### 5.1 每步静态门命令与期望值

```bash
python3 tools/kernel_plugin_closure_check.py --require-strict-closure
```

| 步 | closure | arch | token 文件 | token 行 | violations | unreach | unman | rc |
|---|---|---|---|---|---|---|---|---|
| 基线 | 194 | 12 | 30 | 342 | 42 | 0 | 0 | 1 |
| S0（轨骨架） | 194 | 12 | 30 | 342 | 42 | 0 | 0 | 1 |
| S0.5（探针，还原后） | 194 | 12 | 30 | 342 | 42 | 0 | 0 | 1 |
| S1（E3） | 189 | 8 | 29 | 328 | 37 | 0 | 0 | 1 |
| S2（E4） | 185 | 5 | 28 | 325 | 33 | 0 | 0 | 1 |
| S3（E2） | **183** | **4** | **27** | **324** | **31** | 0 | 0 | 1 |

任一步 `unreach`/`unman` ≠ 0，或 `rc=2`，或计数不命中 → 当步回退（逐行还原，勿整文件 checkout）。

### 5.2 构建腿（**编译须独占槽**）

```bash
# kernel 驱动：必须过 report 断言（build_kernel_driver.sh:196-205 那组）
tools/build_kernel_driver.sh --manifest bootstrap/kernel_manifest.cheng --out <scratch>/cheng-kernel
# 期望：composition_kind=kernel-only / composition_plugin_canonical_triple=- /
#       composition_source_closure_count 非零 / declared count 非零，rc=0

# 正例挂 aarch64 组合根（产物 artifacts/kernel_drivers/aarch64/cheng-aarch64，脚本 :254-255）
tools/build_plugin_driver.sh --arch aarch64
```

**每步都必须两个驱动都编过**（`rc=0`），这是「禁止半成品态」的构建侧含义：只改 kernel 侧不编插件，
或只改插件侧不编 kernel，都会在经过 1–2 步后变成不可编译态。

### 5.3 四夹具 + contract 冒烟

```bash
tools/user_path_gate.sh --driver <plugin-driver> \
    --baseline docs/campaigns/2026-08-31-kernel-userpath/user_path_baseline.tsv
```

判词要求（`tools/user_path_gate.sh:660-666`）：`pass=4 known_red=0 stale=0`。
基线 4 行正例 = `ordinary` / `call_fixture`（run rc=1）/ `cold_nested` / `v6`；
探针区 14 行中 **7 行红**（`probe_generic` 因 `node value/share authority is incomplete`、`probe_closure`
`unsupported structural value case=12`、`probe_objctor` / `probe_tuple` 因 call target exact identity missing、
`probe_assert` ownership BodyIR、`probe_try` parser type syntax、`probe_array` csg FieldGet layout）
→ **不带 `--require-probes-green`**（带了必红，那不是本切片的红）。

**字节回执（编过不算数）**：插件驱动与原 kernel 驱动对**同一夹具**的对象字节必须逐字节对拍（exec_diff）。
这是 S1 唯一能证明"切口落在运行路径且语义等价"的证据。

### 5.4 现场校正：kernel-only 负例**不能**当本切片的验收

设计 §3.4 步 3 要求 kernel-only 驱动跑夹具"必须非零退出且 stderr 含
`codegen_plugin_missing=arm64-apple-darwin`"，并断言"若仍能编出可执行文件，说明切口没落到运行路径上"。
**实测该探针不具备判据力**：

```
src/core/backend/codegen_contract.cheng:561-566
  fn CodegenCompositionTargetAdmitted(targetTriple: str): bool =
      if codegenCompositionState != 2: return false        # kernel-only = state 1
      return CodegenUnitCoversTriple(codegenCompositionUnitId, CloneStr(targetTriple))
src/core/tooling/compiler_main.cheng:8869-8876
  if codegen_contract.CodegenCompositionActive():
      if !codegen_contract.CodegenCompositionTargetAdmitted(targetTriple):
          CompilerPrintErr(codegen_contract.CodegenCompositionMissingError(targetTriple))
          return 9
```

kernel-only（state 1）对**任何** triple 都在**准入阶段**（远早于任何 codegen）返回 false → rc=9 + 该报文。
`tools/build_kernel_driver.sh:227-235` 已把它固化成**构建期断言**（rc=9、stdout 空、
stderr 恰好 1 行且逐字等于 `codegen_plugin_missing=$BUILD_TARGET`）。也就是说这条负例**今天就绿**，
且对它而言 E3 做没做完全无差别。
→ **保留它在构建腿当回归**，但**不得**用它证明切口落地；落地证据 = §5.3 的插件驱动 + 字节对拍。

### 5.5 禁止项（会变成假绿的具体改法）

设计 §4 九条全部保留，逐条要点：
① 禁把 token 挪进 `#` 注释（门 `:134-151` 剥注释）；② 禁 `"x86" + "_64"` / `Fmt"{a}{b}"` 拼串
（门剥注释**不剥字符串**）；③ 禁动 `:57-60 ARCH_TOKEN_CONTRACT_FILES` allowlist 或 `:61 ARCH_TOKENS`；
④ 禁改 `tools/kernel_plugin_attribution.tsv` 桶豁免；⑤ 禁只删 manifest 行不改代码 / 反之；
⑥ **禁启用 `codegen_contract.cheng:494-497 / 880-935 / 1685-1737` 的 fn 值槽当耦合面**
（`tools/zrpc_kernel_gate.py:62 PTR_TOKEN` 只扫 `ptr` 词元，`fn(...)` 值槽**无门可查** = 把红线藏进无门区；
且实测这些槽**当前已是活体**：`compiler_composition_aarch64_main.cheng:9` 调
`adapter.RegallocA64CodegenUnitRegister()` 装槽、`regalloc_production_emitter.cheng:979` 的
`CodegenUnitPrepareRecipesRegistered` 硬门在查槽 —— 只差"不发起调用"。最省事的做法就是让它发起调用，
这正是禁止项要挡的）；⑦ 禁把 arch 实现搬进 contract 凑零 import；⑧ 禁以门绿/编过代替字节对拍、
禁用 kernel-only 驱动冒充 K3 验收；⑨ 禁 `git checkout --` 撤回共享文件。

**本文新增两条**：
⑩ **禁把 `CompilerMainCompositionProcessEntry()` 重入当轨的"重入"实现**——`compiler_main.cheng:8859-8868`
已记录 pristine-heap 前置条件，重入 = 绕过该不变量（S0.5 必须先判定）。
⑪ **禁在 contract 豁免区（`codegen_contract.cheng` / `target_matrix.cheng`）用注释或字符串携带 arch
实现细节来"消 token"**——那两个文件里 token 本就无门可查，等于自建盲区（禁止项 ①⑦ 的豁免区版本）。

---

## 6. 估工与风险（单线，每轮烤机 ~200s）

### 6.1 与设计 §5 的分歧：S1 的 40–80 h **大概率低估**，瓶颈不在调用点

设计的 §5 把「轨骨架与内核续跑（未验证前提）」记 12–24 h。本文实测证据指向该前提
**与已记录不变量冲突**（§1 S0.5 引 `compiler_main.cheng:8859-8868`）：`CompilerMainProcessEntry`
是一次性整轮入口 + allocation-ledger session owner + pristine-heap 前置。要让它可续跑，
等于把它重构成显式 phase machine（并处理 session owner 只能签发一次的问题）。
这不是"骨架"，是 K2 正戏的一部分。**诚实区间：轨 + 续跑 30–60 h，S1 合计 60–120 h。**

三条出路，按代价排序：

| 出路 | 内容 | 代价 | 备注 |
|---|---|---|---|
| **A. 延迟尾协议（最小）** | 只在**编译尾段**需要插件时挂起：内核序列化冻结输入（bytes+symbols+relocs SoA）为数据行，返回第三态「pending: opId」一路 unwind 到 `main`；组合根（同进程）直接调本 arch 实现写盘、以同 rc 退出。**不重入** | 最小 | **只对"尾部 op"成立**。E3 的 `:224/:372/:483`（写盘）与 `native_link_exec:373`（链接）在多条路径上不是终态（写完还要 seal / 继续 link / 回填 result），故 A 只能覆盖其中一部分；E2/E4 属中段，A 不适用 |
| **B. 游标续跑（设计 §3.2(a)）** | 把 `CompilerMainProcessEntry` 改成 phase 机，全局存 phase+ordinal，重入跳过已完成 | 大 | 需先解决 session owner 单次签发；每次重入若不跳过则退化成 O(请求数 × 整轮编译) |
| **C. 两趟冻结（设计 §3.2(b)）** | 先冻结全量请求 SoA，再消费结果 | 中–大 | 对 E2/E4 **不成立**：请求内容依赖内核中途算出的 BodyIR/plan，无法前置冻结 |

→ **S0.5 的实测结果直接决定 S1 是 A、B 还是"必须先做 B 才能开工"。**
在 S0.5 有结论前，S1 的所有调用点改写都**不该动手**（写了也没有能承载它的轨）。

### 6.2 可先行交付的诚实子切片

若 S0.5 判定不可重入且 B 的工期不可接受，**E3-only + A 的可行子集**仍是真实增量：

| 子切片 | arch | closure | token | manifest 删 | 出闭包 |
|---|---|---|---|---|---|
| E3 全量 | 12→8 | 194→189 | 30/342→29/328 | 5 行 | 5 文件 |
| E3 尾段可覆盖部分 | 12→? | — | — | — | 未验证 |

E3 全量后 `riscv64_encode` 仍由 `codegen_writer_units → elf_riscv32_writer → riscv64_encode` 链可达；
E3 切完该链断（本文实测：E3 后 arch=8，`riscv64_encode` 的最低链改走 E5 侧）。
**剩余 arch 逐名实测**（按 §2 脚本加打印 `arch` 元素）：

| 切法 | 剩余 arch 文件（逐名） |
|---|---|
| E3+E4（arch=5） | `aarch64_encode`、`codegen_a64_fill_units`、`regalloc_production_encoder_events`、`riscv64_encode`、`x86_64_body_emit` |
| E3+E4+E2（arch=4） | `aarch64_encode`、`codegen_a64_fill_units`、`regalloc_production_encoder_events`、`riscv64_encode` |

即 **E2 这一刀恰好且仅仅摘掉 `x86_64_body_emit`**，与 manifest 余量 4 行（`:220 :221 :227 :230`）
逐名对应 ✅。

### 6.3 每步墙钟

单轮 = 1 次烤机（~200s）+ 1 次静态门（<5s）+ 对拍分析。S1 六步（S0/S0.5/S1/S2/S3 + 收口）
至少 **12–20 次烤机轮**（含失败重试），墙钟 1–2 工作日，**前提是 S0.5 一次过**。
§3 的 token 面（B 12–20 h / C 30–55 h / D 4–8 h = 46–83 h）与 arch 面（E1 40–90 h + E5 + E6 = 60–140 h）
**不计入 S1**，与设计一致。

### 6.4 风险排序

| # | 风险 | 证据 | 处置 |
|---|---|---|---|
| 1 | 内核不可续跑 → S1 形态不成立 | `compiler_main.cheng:8859-8868` 明令 pristine-heap 单次性；`:9053-9063` 无游标 | **S0.5 先实测**；不可行则改 A 或先做 B |
| 2 | `primary_object_plan.cheng` 活动树漂移 | mtime 21:04（设计记 11:42）；设计行号已漂 ~1100 行 | E2 独立步 + 动前查静默 + 内容定位 + 只读留底 |
| 3 | 改 33 行诊断文案误伤判词门 | 2 门 + 1 夹具逐字钉 `direct object emit: ` 族文案 | 只改 token 子串、保前缀、禁 sed、改完跑两个 gate |
| 4 | 门面残留 arch import 无门可查 | `scan_strict_arch_tokens` 只扫 reachable；`DIRECT_VIOLATION_SOURCES` 不含 shared-format | 删除后 `grep` 自证 + 构建自证 |
| 5 | contract 豁免区写入无门 | `ARCH_TOKEN_CONTRACT_FILES` 与 token 扫的 `continue`（`:311`） | review 自证；禁止项 ⑪ |
| 6 | E4 的 var `str[]` 写回 SOA 化 | `codegen_regalloc_adapter_units.cheng:38-39`；`regalloc_production_emitter.cheng:1008-1009` | 若 A/B 都不支持 var 写回过轨，E4 单独降级/延后，E2 补 ≤4 |
| 7 | `target_matrix` 反向 import 新边 | 设计未验证项 5；本文同样未验证 | 动 D 类前先小样编一次 |

---

## 7. 未验证清单（动手前必须实测）

1. `CompilerMainProcessEntry` 二次调用行为（S0.5）——本切片成立前提，本文**静态否定、未动态实测**。
2. ~~E3+E4 后剩余 5 个 arch 文件的逐名清单~~ —— **已在 §6.2 表内补齐**（实测：E3+E4 余
   `aarch64_encode`/`codegen_a64_fill_units`/`regalloc_production_encoder_events`/`riscv64_encode`/
   `x86_64_body_emit`；E3+E4+E2 余前 4 个，与 manifest `:220 :221 :227 :230` 逐名一致）。
3. E5+E4+E3 组合（`closure 182 / arch 3`）——本文未跑该反事实。
4. `tools/` 下**正则型**（非 `-F`）判词门对 342 行 token 的逐字依赖——本文只穷尽了 175 条 `-F` 字面量。
5. `tools/build_plugin_driver.sh --arch aarch64` 在现树是否已跑通（设计未验证项 3；本文禁编译，未跑）。
6. `src/core/runtime/*` 反向 import `target_matrix` 是否引入新边并触发其他门（设计未验证项 5）。
7. 旧 `r2_closure_ops_map.md:97-103` 的 `system_link_exec→backend2_pipeline` /
   `backend2_lower*/assemble` 裸 arch 通道——本文 E3+E4+E2 反事实后 `riscv64_encode` 的唯一存活
   importer 为 `regalloc_production_encoder_events`，**未复现**该通道。
8. 运行时 `compositionManifestExactSourceSet` 在 kernel-only 构建里的实际判词
   （declared=162 vs actual=194 的 32 差）——设计未验证项 2，本文只做静态计数。
9. 四夹具在插件驱动下的**运行时**行为（本文禁编译，未跑 user_path_gate）。
