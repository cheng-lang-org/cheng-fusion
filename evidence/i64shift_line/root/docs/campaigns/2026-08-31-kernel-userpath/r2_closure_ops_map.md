# R2 严格闭包归零作战图（R2-CLOSURE-MAP）

日期：2026-09-06。纯只读实测，零改动零烤机。工具口径：`tools/kernel_plugin_closure_check.py`
（Step0/严格门）、`tools/kernel_plugin_manifest_gate.py`（组合清单门）。蓝图
kernel-split-blueprint-20260824 BLUEPRINT.md 本体不在仓内，仅
docs/cheng-minimal-kernel-plan.md:337 引用；本文 2.x 施工面以 plan 文本 + B8/B9 在树先例为准。

---

## 1. 现值复测（2026-09-06 实测，取代 08-29/09-02 基线）

### 1.1 Step0（`python3 tools/kernel_plugin_closure_check.py`，rc=0 PASS）

| 指标 | 08-29 基线 | 09-02 复测 | 本轮 09-06 |
|---|---|---|---|
| backend 文件/归属覆盖 | 96/96 | 96/96 | **96/96**，uncovered=0 |
| 桶分布 | k62/s18/x5/a64=4/rv32=1/rv64=5/wasm=1 | 同 | **同（unresolved=0）** |
| direct_violations | 0 | 0 | **0** |
| indirect（源数/边数） | 18/130 | 18/130 | **18/130（稳定）** |
| divergence_hits | 242 | 243 | **246**（triple=156, arm64=56, aarch64=9, x86_64=8, wasm=8, riscv=6, mach-o=2, macho=1） |

divergence 扫描只覆盖 `primary_object_plan.cheng`+`lowering_plan.cheng` 两文件
（checker :46 DIVERGE_DEFAULTS），+4 漂移来自这两文件源码生长，不代表全 token 面；
全闭包 token 面见 §1.2 严格门。

### 1.2 严格门（`--require-strict-closure`，rc=1 FAIL_STRICT，violations=236）

| 指标 | 任务书口径 | 本轮实测 |
|---|---|---|
| manifest 声明源集 | 37 | **37**（与 min_driver_manifest 逐源相同，diff 实测 SOURCES-IDENTICAL） |
| 真实 core 可达闭包 | 201 | **201**（入口 `src/core/tooling/compiler_composition_kernel_main.cheng`，manifest :8） |
| STRICT_MANIFEST_UNREACHABLE | — | **7** |
| STRICT_CLOSURE_UNMANIFESTED | — | **171** |
| STRICT_ARCH_REACH | 13 | **13** |
| STRICT_ARCH_TOKEN | — | **45 文件 / 671 行** |
| 违规合计 | ≈242（口径混用） | **236 = 7+171+13+45** |

组合面门现值：`kernel_plugin_manifest_gate.py` rc=0（x86_64=5, aarch64=4, riscv64=5；
coverage=exact；cross_manifest_unique=true）；`--require-closure` Step1 rc=0。

---

## 2. 可达性分解与归因

### 2.1 闭包构成：201 = 30 声明可达 + 171 超出

**死声明 7**（manifest 声明但入口不可达）：`backend/native_link_exec.cheng`、
`backend/primary_object_emit.cheng`（kernel 桶，仍在盘、TSV 仍覆盖）、
`ir/{body_ir_loop,body_ir_opt,low_uir,type_abi}.cheng`、`tooling/gate_main.cheng`。
方向判读：真实编译链已改走 direct_object_emit/system_link_exec 链，manifest 沿抄
min_driver 旧链（含内核中端 low_uir/type_abi 一段——内核驱动现路径不进该中端段，
body_ir_access/exact_def/lifecycle 等 9 个 ir 文件反而经 backend/analysis 可达）。

**171 超出的感染归因**（BFS 首条证据链回溯到首个声明祖先）：

| 感染枢纽（声明集内） | 后代数 | 首跳（×次数） |
|---|---|---|
| backend/system_link_exec | **66** | merkle_store(21), compiler_snapshot_lowering_bridge(12), backend2_pipeline(10), merkle_dag(4), primary_object_csgc_emit(3), 其余 13 跳各 1 |
| tooling/compiler_main | **50** | line_map(14), compiler_csg(10), production_launcher(8), seven_stage_receipt(2), 其余 16 跳各 1 |
| backend/primary_object_plan | **23** | csg_plugin_pickup(3), exact_def_call_authority(2), ownership_body_ir_production(2), 其余 16 跳各 1 |
| backend/system_link_exec_runtime | 8 | native_link_exec_darwin(3), coff_object_linker(2), codegen_darwin_provider_units(2), body_ir_lifecycle(1) |
| backend/codegen_contract | 7 | regalloc_single_pass(6), target_matrix(1) |
| backend/direct_object_emit | 6 | coff_object_writer, elf_object_writer, linker_shared_core, direct_object_debug_sections, macho_debug_section_evidence, regalloc_production_artifacts |
| 其余 7 枢纽 | 11 | codegen_writer_units(4), codegen_a64_body_units(2), lowering_plan(1), codegen_encoder_event_units(1), codegen_x64_body_units(1), lang/parser(1), system_link_plan(1) |

声明集→超出集直连切边共 **163 条**；拓扑上 171 个超出文件由 13 个感染枢纽单跳带入。
族清单见 §3 族 B。

### 2.2 13 个 arch 可达文件路径归因（历史嫌疑重证）

| arch 文件（桶） | BFS 最短证据链（entry 起） | 全通道数 |
|---|---|---|
| aarch64_encode [aarch64] | system_link_exec > primary_object_plan > **codegen_a64_body_units** | ≥8 条有界路径：B6 门面、codegen_a64_fill_units、**codegen_a64_link_units**（经 coff/elf_object_linker）、regalloc_aarch64_adapter、backend2_lower* |
| codegen_a64_fill_units [aarch64] | … > primary_object_plan > codegen_a64_body_units | 全部经 B6 门面 |
| darwin_syscall_provider [aarch64] | system_link_exec_runtime > **codegen_darwin_provider_units**（B9） | **唯一单通道** |
| elf_riscv32_writer [riscv32] | system_link_exec > direct_object_emit > **codegen_writer_units**（B2） | 8 条：direct_object_emit / native_object_emission_plan 两汇入 |
| elf_riscv64_linker [riscv64] | 同上 | 同上 |
| elf_riscv64_writer [riscv64] | 同上 | 同上 |
| elf_x86_64_writer [x86_64] | 同上 | 同上 |
| regalloc_aarch64_adapter [aarch64] | compiler_main > line_map > debug_emission_receipt > **regalloc_production_emitter** > **codegen_regalloc_adapter_units**（B8） | 8 条：line_map 链 / primary_object_plan / backend2_assemble / backend2_assembler_lifecycle 四汇入 |
| regalloc_riscv_adapter [riscv64] | 同上 | 同上 |
| regalloc_x86_64_adapter [x86_64] | 同上 | 同上 |
| regalloc_production_encoder_events [riscv64] | system_link_exec > direct_object_emit > regalloc_production_artifacts > **codegen_encoder_event_units**（B3） | 8 条 |
| riscv64_encode [riscv64] | 多通道 | **≥8 条**：regalloc_riscv_adapter、elf_riscv32_writer、elf_riscv64_linker、**backend2_assemble 直连**（backend2_assemble.cheng:16 `import …riscv64_encode as rvenc`）等 |
| x86_64_body_emit [x86_64] | system_link_exec > primary_object_plan > **codegen_x64_body_units**（B4） | 8 条，全部经 B4 门面 |

**历史口径重证**：
1. 「primary_object_plan 内嵌 arch 分叉」——直连已清（08-29 B 系收编后
   direct_violations=0），残余形态变为 **B4/B6 门面中介**。
2. 「direct_object_emit / regalloc_production_emitter 两个派发枢纽」——成立，
   均为门面中介形态（writer 4 文件 / adapter 3 文件）。
3. 「system_link_exec_runtime→coff_object_linker→aarch64_encode 格式层暗道」——
   **形态已变**：coff_object_linker 现只 import `codegen_a64_link_units`
   （coff_object_linker.cheng:15），由 `codegen_a64_link_units.cheng:12` 直import
   `aarch64_encode`；同类通道还有 native_link_exec_darwin→elf_object_linker/
   macho_provider_linker→codegen_a64_link_units。
4. **新增暗道（本轮实锚）**：`system_link_exec.cheng:39 → backend2_pipeline`【更正 2026-09-10 审计：点名 import `backend2_pipeline` 在 HEAD 该文件 0 命中（:6052 注释「本文件不再 import backend2_pipeline」），该锚点不可用、正确落点未定位；原文保留为历史证据】；
   `backend2_lower{,_slots,_stmt,_util}.cheng` 四文件各自裸 import
   `aarch64_encode`+`x86_64_body_emit`（backend2_lower.cheng:25-26【更正 2026-09-10 审计：点名 import `aarch64_encode`/`x86_64_body_emit` 在 HEAD 全 `src/core/backend2/*.cheng` 0 命中，该锚点不可用、正确落点未定位；原文保留为历史证据】、
   backend2_lower_slots.cheng:39-40【更正 2026-09-10 审计：点名 import `aarch64_encode`/`x86_64_body_emit` 在 HEAD 该文件 0 命中，该锚点不可用、正确落点未定位；原文保留为历史证据】、backend2_lower_stmt.cheng:24-25【更正 2026-09-10 审计：点名 import `aarch64_encode`/`x86_64_body_emit` 在 HEAD 该文件 0 命中，该锚点不可用、正确落点未定位；原文保留为历史证据】、
   backend2_lower_util.cheng:21-22【更正 2026-09-10 审计：点名 import `aarch64_encode`/`x86_64_body_emit` 在 HEAD 该文件 0 命中，该锚点不可用、正确落点未定位；原文保留为历史证据】）；`backend2_assemble.cheng:16` 裸 import
   `riscv64_encode`。backend2 不在归属表门范围（TSV 只收 src/core/backend），
   是绕过 Step1 门的无门面裸直连。

### 2.3 130 条间接边坍缩 = 13 条切边 × 7 个门面（单一收口点）

Step0 间接面（18 kernel 源 → arch，经非 arch 中间层）逐边回溯末跳非 arch 节点，
**全部 130 条收敛到 7 个 shared-format 门面发出的 13 条 非arch→arch import**：

| 门面（桶 shared-format） | →arch 切边 | kernel 源覆盖数 |
|---|---|---|
| codegen_regalloc_adapter_units（B8） | 3（a64/rv/x64 adapter） | 42 |
| codegen_writer_units（B2） | 4（elf_rv32/rv64 linker/rv64/x64） | 36 |
| codegen_a64_body_units（B6） | 2（aarch64_encode, a64_fill） | 21 |
| codegen_encoder_event_units（B3） | 1（encoder_events） | 15 |
| codegen_x64_body_units（B4） | 1（x86_64_body_emit） | 11 |
| codegen_a64_link_units | 1（aarch64_encode） | 3 |
| codegen_darwin_provider_units（B9） | 1（darwin_syscall_provider） | 2 |

门面汇入边（kernel 闭包内实测全集）：primary_object_plan→B4/B6；
direct_object_emit→B2；native_object_emission_plan→B2；
regalloc_production_emitter→B8；regalloc_production_artifacts→B3；
system_link_exec_runtime→B9、→coff_object_linker；
native_link_exec_darwin→elf_object_linker、→macho_provider_linker；
system_link_exec→backend2_pipeline（backend2 裸直连不设门面）。

---

## 3. 逐族施工图（范式 / 门联动 / 风险 / 档位）

定谳原则：**内核必需 → 声明集扩容型**；**真越界（arch）→ 派发外移型**（B8/B9 门面
是过渡形态，严格终态下 kernel 闭包不得含 arch，门面调用点外移到 per-triple 组合根
`tooling/compiler_composition_{arch}_main.cheng`，插件侧已有了 x86_64 先例：该根
15 行 import 5 个 arch 单元 + codegen_contract + compiler_main）。

### 族 A —— 死声明修剪（7 文件）
- (a) §2.1 所列 7 个 STRICT_MANIFEST_UNREACHABLE。
- (b) 范式：声明集修剪型。`bootstrap/kernel_manifest.cheng` 删 7 行，同步改尾
  「对账」注释段。文件本体不动（TSV/其他 composition 继续覆盖）。
- (c) 门联动：checker 严格门 −7；manifest gate 不校验 kernel 条目数，rc 不变；
  plugin manifest 以路径引用 kernel manifest（plugin_manifest_x86_64.cheng:12），
  无内容拷贝，不需改。
- (d) 风险：manifest 是 system-link-exec 真实输入 + 声明源哈希输入
  （build_kernel_driver.sh:13,:196-205），删行改变
  composition_declared_sources_sha256 → 驱动字节漂移，需按假绿红线重跑配对
  exec_diff（wall40/wall42 口径）。
- (e) 档位 **S**（单文件 + 门重跑）。

### 族 B —— 中立扩容（155 文件进 manifest）
- (a) 171 超出 − 13 arch − 3 过渡门面（codegen_a64_link_units、
  codegen_darwin_provider_units、codegen_regalloc_adapter_units，其命运随族 C）
  = **155**：
  - backend kernel 桶 26：build_plan, canonical_type_chain, compiler_facts,
    csg_plugin_pickup, data_payload_codec, debug_emission_plan_evidence,
    debug_emission_receipt, debug_facts, debug_relocatable_object_evidence,
    debug_section_plan_consumer, debug_section_plan_receipt,
    direct_object_debug_sections, host_pool_runtime, line_map,
    lowering_payload_lifecycle, metadata_text_authority, native_link_exec_darwin,
    native_object_emission_plan, primary_object_csgc_cargo,
    primary_object_csgc_emit, regalloc_production_artifacts,
    regalloc_production_emitter, regalloc_single_pass, semantic_facts,
    semantic_snapshot_debug_binding_receipt, target_matrix
  - backend shared-format 7（格式层，留内核）：coff_object_linker, coff_object_writer,
    elf_object_linker, elf_object_writer, linker_shared_core,
    macho_debug_section_evidence, macho_provider_linker
  - tooling 35 / csg_core 35 / runtime 16 / backend2 12 / ir 9 / analysis 9 / lang 6
    （全量名单由 checker STRICT_CLOSURE_UNMANIFESTED 输出，本轮已逐一名单复核）
- (b) 范式：声明集扩容型。这 155 个是内核驱动真实闭包（wall40/wall42 实证可编），
  manifest 漂移是声明债不是结构债。
- (c) 门联动：checker 严格门 −155（closure_unmanifested→16）；manifest gate
  kernel/plugin 重叠检查不变（155 个无一是 backend arch 桶）；build 脚本哈希漂移
  同族 A，需 exec_diff 复核。
- (d) 风险：低——纯声明。注意 backend2 12 文件中 6 个带 arch token（41 行），扩容
  后 token 面仍在（归族 D）；且 backend2 施工归 GEN2-LADDER 领地，扩容不改动其源码。
- (e) 档位 **S** 施工 / **M** 验证（一次 exec_diff 全套）。

### 族 C —— arch 间接面归零（13 文件出闭包；严格门 arch_reachable→0）
排序按「边数×风险」升刀序：

| 序 | 子族 | 切断边（kernel 闭包内） | 出闭包 arch | 间接边削减 | 范式 | 风险/字节门 | 档位 |
|---|---|---|---|---|---|---|---|
| C4 | darwin | system_link_exec_runtime→B9 门面（1 条） | darwin_syscall_provider | 2/130 | 派发外移：B9 门面消费点 system_link_exec_runtime:2391（held-exec darwin capability）外移到 arm64 组合根；B9 门面转插件侧 | 最小单通道，`@borrows` 消费语义先例在 plan:614-620 | **S-M** |
| C5 | link 格式暗道 | coff_object_linker→a64_link 门面、elf_object_linker→同、macho_provider_linker→同（3 条） | aarch64_encode 的 2 通道封死（另一通道在 B6/C3） | 3/130 | 门面转插件侧：codegen_a64_link_units 移出 kernel 闭包（其 arch import codegen_a64_link_units.cheng:12）；coff/elf/macho linker 本体留 kernel shared-format | COFF/Mach-O 链接路径 exec_diff；coff_object_linker 16 token 行留族 D | **M** |
| C1 | regalloc | regalloc_production_emitter→B8、regalloc_production_artifacts→B3（2 条） | 3 adapter + encoder_events（riscv64_encode 通道之一） | **57/130** | 派发外移：emitter 四臂 unitId 直调改到组合根；kernel 内 canonical allocator 唯一仍是 regalloc_single_pass（kernel 桶，已在声明集候选） | emitter 是 canonical allocator 消费点（工程规范 7）：plan/action/fragment 冻结消费与对象字节回执必须保；B8 A/B 实测先例 frontier diff rc=0（plan:605-612） | **M-L** |
| C2 | writer | direct_object_emit→B2、native_object_emission_plan→B2（2 条） | elf_rv32/rv64 linker/rv64/x64 writer 4 文件 | 36/130 | 派发外移：direct_object_emit 三处 writer 臂 + native_object_emission_plan 汇入改组合根直装 | direct_object_emit 83 token 行 + 6 后代，对象字节逐字节对拍 | **M-L** |
| C3 | body | primary_object_plan→B4、→B6（2 条） | x86_64_body_emit, aarch64_encode, a64_fill | 32/130 | 派发外移：primary_object_plan（76k 行 / 234 token 行）body 布局/sizing 调用改组合根；B6c 裁定「32 函数/847 处 a64 引用留内核经门面消费」（plan:334-337）需按终态重新落刀 | 最大单点；风险 6（frozen stage3 能力缺口）+ 风险 7（B6c 迁移不可行）双向约束 | **L** |
| C6 | backend2 | system_link_exec→backend2_pipeline（1 条）+ backend2 内 5 处裸 arch import | riscv64_encode, aarch64_encode, x86_64_body_emit 的 backend2 通道 | 0（不在 130 口径内） | 领地在 GEN2-LADDER：要么 backend2_lower* 改经契约/门面（严格形），要么 system_link_exec 断开 pipeline 直调 | backend2 不在 TSV 门内，Step1 门对其盲；需先给 backend2 定桶再动刀 | **L**（跨线） |

- (c) 门联动（全 C 族通用）：每收口一子族，重跑严格门 arch_reachable 应减该子族
  文件数；plugin manifest 桶覆盖=exact 门（gate :146-156）要求移出单元同步入对应
  plugin_manifest_{arch}；riscv32（elf_riscv32_writer）/wasm32 无首版清单，收口前
  需按 plan 风险 4 口径补清单或明示豁免。
- (d) 共同字节门：每子族收口 = 组合驱动组成变化 → 全量 exec_diff + 对象字节回执，
  严禁「编过就算」。
- (e) 档位见表。

### 族 D —— arch token 收权（45 文件 / 671 行 → 只剩 2 个合同权威）
- (a) 分布：backend 24 文件/495 行（大户：system_link_plan 1 行/4913 行文件、
  regalloc_production_artifacts 79、direct_object_emit 83、elf_object_linker 47、
  held 类 runtime 文件 53、primary_object_plan 35、regalloc_production_emitter 34、
  build_plan 38、regalloc_single_pass 14、coff_object_linker 16、
  coff_object_writer 18、debug_relocatable_object_evidence 15）；tooling 8/72
  （bootstrap_contracts 31、compiler_main 19）；backend2 6/41；runtime 5/53
  （held_exec_identity 46）；lang intern 8；csg_core production_launcher 2。
- (b) 范式：数据合同化——token 只许存于 `codegen_contract.cheng`+
  `target_matrix.cheng`（checker :49-52 ARCH_TOKEN_CONTRACT_FILES 白名单），
  其余文件改经模块限定符引用权威值；字符串字面量（triple 名/诊断文本）同样走权威
  常量。逐文件 triage，禁启发式改名绕扫描。
- (c) 门联动：STRICT_ARCH_TOKEN（checker :600-607）应随族 C 先降（门面/linker/writer
  的 4+16+47+18+14+26 等 token 行随文件出闭包）再做本族终扫，目标
  arch_token_files=0。
- (d) 风险：wide-mechanical；扫描剥注释不剥字符串（checker :289-291），字符串内
  token 会如实命中，不得以拼串绕过。
- (e) 档位 **M-L**（45 文件，但多为一行改引用）；排在族 C 后。

---

## 4. 排序清单（边数削减 × 风险，首刀在后）

| # | 族 | 严格门违规削减 | 间接边削减 | 风险 | 档位 |
|---|---|---|---|---|---|
| 1 | A 死声明修剪 | 7 | 0 | 低 | S |
| 2 | B 中立扩容 | 155 | 0 | 低（字节回执需 exec_diff 复核） | S/M |
| 3 | C4 darwin 外移 | 1（arch） | 2 | 低（单通道+B9 先例） | S-M |
| 4 | C5 link 暗道 | 1-2 | 3 | 中 | M |
| 5 | C1 regalloc 外移 | 5 | **57** | 中高（canonical allocator 消费点） | M-L |
| 6 | C2 writer 外移 | 4 | 36 | 中高 | M-L |
| 7 | C3 body 外移 | 3 | 32 | 高（76k 枢纽+B6c 约束） | L |
| 8 | C6 backend2 | 通道级 | —（盲区） | 高（跨 GEN2-LADDER） | L |
| 9 | D token 收权 | 45（文件） | — | 中（wide-mechanical） | M-L |

A+B 两刀（单 manifest 文件施工）即削减 162/236 违规，把严格门残余压到
74 = 16 未声明（13 arch + 3 过渡门面）+ 13 arch 可达 + 45 token；其余按
C4→C5→C1→C2→C3→C6→D 逐族归零。C6 需先与 GEN2-LADDER 划界；本线全程只读。

---

## 5. 组合面验收联动现况（图尾核对）

- **每组合恰一插件**：kernel_manifest（kernel-only）+ 3 份 plugin manifest
  （composition_kind=plugin、plugin_canonical_triple 恰一、互相跨清单唯一），
  `kernel_plugin_manifest_gate.py` rc=0（5/4/5，coverage=exact）。plugin manifest
  以 `kernel_manifest = bootstrap/kernel_manifest.cheng` 路径引用内核
  （plugin_manifest_x86_64.cheng:12），族 A/B 的 manifest 手术不破组合面门。
  插件组合根真实存在：compiler_composition_{x86_64,aarch64,riscv64}_main 各自
  import 本 arch 单元 + codegen_contract + compiler_main。
- **codegen_plugin_missing fail-closed**：脚本级 = build_kernel_driver.sh 请求未装
  triple 输出 `codegen_plugin_missing=<triple>` exit 9（plan:276-281 回执）；
  contract 级 = ci_gate backend2-plugin-cache-gate S4-D 与契约
  CodegenPluginMissingError 逐字对拍；组合级 = primary_object_plan panic 前取件臂
  案 A 接线（plan:622-629），Ok 仍 fail-closed 抛 missing（D1 进程内不装载）。
- **riscv32/wasm32 缺口**：归属表 riscv32=1/wasm32=1，无首版 plugin manifest（gate
  明示不要求）；C2 收口 elf_riscv32_writer 前需补 riscv32 清单或按 plan 风险 4
  口径明示后续桶。
- **待实测（本轮未执行，零烤机）**：`composition_manifest.cheng:263`
  compositionManifestExactSourceSet 是组合绑定期的 declared==actual 硬门
  （HARD_RED:closure_count_mismatch/declared_unreachable/source_undeclared，
  :456/:550 为漂移臂）。当前声明 37 vs 实际闭包 201，若现役 kernel 组合走绑定路径
  应触发 HARD_RED；09-02 wall 配对回执未记录该冲突，需一次在树 kernel 驱动构建
  实测确认门是否已被绕过形态（未绑报告不算数）。族 A/B 落地后此门与严格门同时归零。

## 6. 待实测清单

1. §5 组合绑定硬门在现树的实测行为（需 live kernel driver build，非本线权限）。
2. backend2 12 文件归属定桶（TSV 现不覆盖 backend2，Step1/严格门对其只有 token
   扫描可见性）——建议与 GEN2-LADDER 划界后补表。
3. 蓝图 BLUEPRINT.md §7 本体不在仓（plan:337 独引），C3 施工前需取回或以 plan
   风险 7 文本为唯一口径。
