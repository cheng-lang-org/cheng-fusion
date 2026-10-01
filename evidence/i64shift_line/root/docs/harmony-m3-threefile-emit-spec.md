# M3 三文件拆分发射实施规格（生成器单体 → gen.c/adapter.c/entry.cpp）

状态：只读侦察综合定稿，未落地。写在 `docs/pending-work-ledger-2026-07-14.md:41` 登记为在飞项 `wmgmipchs`。

## 0. 结论先行

- 目标不是"生成三个文件"，是"生成器 `MobileShellWriteHarmony` 从发射单体 `.cpp` 改为发射 `cheng_gui_host_gen.c`（纯 C，GEN 域）+ `cheng_gui_host_adapter.c`（纯 C，ADAPTER 域）两个物理文件，CMake 切到完整三文件拓扑（`cheng_gui_host_gen.c`/`cheng_gui_host_adapter.c`/`cheng_gui_entry.cpp`）"。
- `cheng_gui_entry.cpp`（ENTRY 域，NAPI/XComponent glue）**不在生成范围**——这是已经写进项目正典的架构决定，不是本规格发明的限缩。证据：`tools/harmony_host_gen_gap_census.sh:33-35` 注释原话"cheng_gui_entry.cpp: 生成器完全不产出这个文件（见蓝图 §1 目标架构图，由 cheng_gui_entry.cpp 驱动骨架本身"手写不变"），其函数固定为 ADAPTER-ONLY"；且生成器源码里搜不到任何 `entry.cpp`/`GuiEntry` 发射函数（`grep -n "GuiEntry\|entry\.cpp" src/core/tooling/mobile_shell_codegen.cheng` 只命中路径字符串引用，无发射函数）。所以"三文件"实际是"两文件生成 + 一文件既有手写文件被 CMake 引用"，标题里的"发射 gen.c/adapter.c/entry.cpp 三文件"要按此口径理解，不要在切片里试图生成 entry.cpp。
- 契约头（`cheng_gui_host_adapter_contract.h`）和共享头（`cheng_gui_host_shared.h`）**已经生成且已经有 byte-identical smoke 门禁**，不是本战役范围。证据：`src/tests/mobile_shell_codegen_smoke.cheng:276-277`（契约头）与 `:297-298`（共享头）两处 `assert(...Text == ...RealText, ...)`；生成函数分别是 `MobileShellHarmonyAdapterContractText`（`src/core/tooling/mobile_shell_codegen.cheng:27503`）与 `MobileShellHarmonyGuiHostSharedHeaderText`（`:27805`），且 `MobileShellWriteHarmony` 已经在调（`:28496-28511`）。本战役只解决"函数体"这一半——现在仍是单体 `.cpp`（`MobileShellHarmonyHostSource`，`:25717`，写到 `MobileShellHarmonyHostFileName(opts)` 命名的单一文件，`:28512-28515`）。
- 契约头当前状态实测：跑 `tools/harmony_adapter_contract_diff.sh` 三段对账，APP-EXPORT/PICKER 段 `OK`，GLUE 段有 1 条 `HEADER_DECLARES_UNKNOWN_OR_STATIC_SYMBOL cheng_host_nodes_snapshot_refresh`——头文件声明了这个符号（`platform/harmony/ChengGuiDemo/entry/src/main/cpp/cheng_gui_host_adapter_contract.h:110`，生成器源在 `src/core/tooling/mobile_shell_codegen.cheng:27614`），但 Harmony 侧 `cheng_gui_host_gen.c`/`cheng_gui_host_adapter.c` 都没有定义它（`grep -rn cheng_host_nodes_snapshot_refresh platform/harmony/ChengGuiDemo/entry/src/main/cpp/*.c` 零命中）。这是"契约头落后待 regen"这条既有立卷在当前 HEAD 上的具体残留实例（历史上是 GLUE28/APP-EXPORT75，现已 regen 到 GLUE31/APP-EXPORT137，但这 1 条符号本身是声明先于实现，非 regen 遗漏）——见下方风险 ④。

## 1. 现状精确诊断（已实测校验的锚点，非转述侦察）

全部锚点已用 `grep -n`/`sed -n`/`Read` 在当前 HEAD 上重新核对，行号与两路侦察给出的基本一致（个别 ±1 行属于侦察时的 off-by-one，已订正为本文档实测行号）。

### 1.1 发射调用点（`MobileShellWriteHarmony`，`src/core/tooling/mobile_shell_codegen.cheng:28413`）
- `:28491-28495` CMake：调用玩具版 `MobileShellHarmonyCmake(opts)`（`:21160`，5 行版，单 `add_library({libraryName} SHARED {hostFileName})`）。
- `:28496-28500` 契约头：调用 `MobileShellHarmonyAdapterContractText()`（`:27503`），**已完成，已有 byte-identical 门禁**。
- `:28501-28511` 共享头：调用 `MobileShellHarmonyGuiHostSharedHeaderText()`（`:27805`，函数体 27805-28321，约 517 行，与实际 `cheng_gui_host_shared.h`513 行体量相当），**已完成，已有 byte-identical 门禁**。注释原话（`:28501-28506`）自陈"purely additive...cheng_gui_host_gen.c/cheng_gui_host_adapter.c do not exist yet"。
- `:28512-28515` Host 源：调用 `MobileShellHarmonyHostSource(opts)`（`:25717`），写到 `MobileShellHarmonyHostFileName(opts)`（`:21157`，固定 `{libraryName}.cpp`）命名的**单一** C++ 文件——**这是本战役唯一要改的发射点**。

### 1.2 `MobileShellHarmonyHostSource` 内部三段拼接（`:25717-27501`）
`return strutil.Join([prologue, core, epilogue], "")`（`:27501`）：
- `prologue`（`:25725-26132`，Fmt 块）：includes + 日志宏 + `CHENG_HOST_WINDOW` typedef + harmony-only compat shim（`:25752`起）+ app 桥函数指针 typedef/`ChengHarmonyRuntime`/`s_runtime` 等 static 全局 + EGL/window 适配函数（`cheng_host_egl_window_surface`/`cheng_host_window_set_geometry` 等，`:25809-25852`附近）+ rawfile/asset 读取器 + NAPI 模块登记（`ChengHarmonyHostNapiInit`/`ChengHarmonyHostRegisterModule`）+ 以 `extern "C" {{` 收口（`:26133`）。**混排 ADAPTER + ENTRY 域文本，无 GEN 域内容。**
- `core`（`:26136`）：`MobileShellNativeGlesCoreSource()`（函数定义 `:21399`）——**纯 GEN 域主体**，与 Android 侧共用同一模板。
- `epilogue`（`:26137-27499`，Fmt 块）：先以 `}} /* extern "C" — end shared GLES core */`（`:26139`）闭合 core 的 C 链接域；紧接 `cheng_resolve_exports`（`:26155` 起，注释 `:26141-26154` 自证"wave9 absorption from hand-written cheng_gui_host_gen.c:1385-1477 into this generator"——**GEN 域个体吸收函数，物理落在 extern "C" 块之外**）；随后大段媒体/CHT 适配代码（`:26150-26856` 区间，image NDK 解码/video/audio surface prepare，**纯 ADAPTER 域**）；`OnSurfaceCreated`/`OnSurfaceChanged`/`OnSurfaceDestroyed`/`OnDispatchTouchEvent` + `s_callback`（`:26972-27059`，**ENTRY 域**，对应生产 `cheng_gui_entry.cpp:91-128`）；`OH_NativeXComponent_OnLoad`（`:27061`，**ENTRY 域真正入口**，对应生产 `cheng_gui_entry.cpp:432`）；own-IP 解析族（`:27066` 起注释"M3 wave2 absorption"，**GEN 域个体吸收**）；文件选择器辅助（**ADAPTER 域**）；`cheng_gui_host_on_back`（`:27483-27498`，注释提到"driver-skeleton single-resolution convention, see harmony-host-codegen-migration-plan.md M3"）；`:27500` 收口。

**关键结论（订正侦察 A 的"extern C=GEN 边界"简化叙事）**：GEN 域文本不是一个连续区间，是 `core`（`:26136` 一行调用，主体）+ epilogue 里散落的若干个体吸收函数（`cheng_resolve_exports`/own-IP 族/vsync 族等，wave9 起陆续吸收，均有"wave9/M3 absorption"注释自证）。真正的三分域切片必须按**函数名**分类，不能按行区间切。

### 1.3 CMake 完整版函数已存在但未接线
`MobileShellHarmonyGuiHostCmakeText`（`:21392`，组合 `MobileShellHarmonyGuiHostMainCmakeText`（`:21235`，主库 `add_library` 引用 `cheng_gui_host_gen.c`/`cheng_gui_host_adapter.c`/`cheng_gui_entry.cpp`，`:21269` 硬编码 `cheng_gui_entry.cpp`）+ `MobileShellHarmonyGuiHostMoqCmakeText`（`:21317`）+ `MobileShellHarmonyGuiHostFeedCmakeText`（`:21360`））。**实测**（本次复核，非转述）：MoQ/Feed 两个隔离 `.so` 分支都已是 `if(EXISTS ...)` 优雅降级（`:21331`/`:21379`），**没有**侦察 A 提到的"无门控 FATAL_ERROR"问题——那是 migration-plan.md 历史行号下的旧状态，已被 `cc730a61e` 修过，当前 HEAD 是最新态。这意味着 CMake 生成函数本身风险已经很低，真正阻塞只在"发射的文件是否存在"。
`MobileShellWriteHarmony` **从未调用** `MobileShellHarmonyGuiHostCmakeText`——唯一调用方是 `src/tests/mobile_shell_codegen_smoke.cheng`（`grep` 已验证：`fn MobileShellHarmonyGuiHostCmakeText` 只在 `mobile_shell_codegen.cheng` 定义、在 smoke 测试断言里间接覆盖不到，真实导出路径走的是玩具版）。

### 1.4 门禁分支现状
`opts.harmonyNativeGuiExperimental`（字段 `:29`，默认 `false` `:229`）唯一读取点 `harmonyBlocked`（`:163`：`opts.emitHarmony && !opts.harmonyNativeGuiExperimental`），只在 `runtimeMode == "r2c_native_gui_v1"` 时挡"导出是否被允许"，**对 `MobileShellWriteHarmony` 内部走单体还是三文件没有任何分支**——目前压根不存在三文件发射代码。唯一把该字段设 `true` 的调用方是 `tools/harmony_host_gen_gap_census_driver.cheng:85`（缺口普查驱动）与 `src/tests/mobile_shell_codegen_smoke.cheng:169`（smoke 测试），均把 `harmonyLibraryName`/`harmonyModName` 设成 `"cheng_gui_host"` 以对齐生产命名。**这条既有分支就是本战役要复用的接线点**：默认 `false` 时行为必须逐字节不变（沿用玩具版单 `.cpp`），只有 `true` 时才走新的两文件发射——这正是任务风险①"harmonyNativeGuiExperimental 分支毒化"要求的收窄方式，且已经是项目既有纪律（migration-plan.md:146 slice-1 action①，已落地）。

### 1.5 Smoke 测试现有断言基线（`src/tests/mobile_shell_codegen_smoke.cheng`）
- `:182` `nativeHarmonyExperimentalHostPath` 期望单一 `cheng_gui_host.cpp`。
- `:189-193` 断言玩具版 CMake 文本（`project(cheng_gui_host)`/`add_library(cheng_gui_host SHARED cheng_gui_host.cpp)`）。
- `:199-263` 一批 `StrContains` 断言（NAPI modname/资源读取器/vsync 三函数/`cheng_resolve_exports`/wave9 phase B 7 个家族代表符号）针对单体 `.cpp` 全文。
- `:270-283` 契约头 byte-identical + 3 条内容断言，**已完成不用动**。
- `:291-302` 共享头 byte-identical + 2 条内容断言，**已完成不用动**。

这批 `:182/:189-193/:199-263` 是本战役切完后必须**替换**（不是新增）的断言——切片 4 会详细列出替换方式。

### 1.6 缺口普查工具现状（`tools/harmony_host_gen_gap_census.sh`）
- 已经适配"手写侧是 gen.c+adapter.c 两文件"（脚本注释 `:12-24` 自陈 2c5c0073c 之后手写侧拆分，`HOST_GENC`/`HOST_ADAPTERC` 两个环境变量入口）。
- **但生成器侧仍是单文件读取**：`gen_cpp_path`（`:151` 解包，`:427` `gen_cpp_text = read(gen_cpp_path)`）指向驱动跑出来的单一 `cheng_gui_host.cpp`。切完两文件之后这里必须跟着改（切片 5）。
- `tools/harmony_adapter_contract_diff.sh`（三变量赋值在 `:43-45`；`:34-38` 是用法/退出码注释）已经是三变量 `HOSTC_GEN`/`HOSTC_ADAPTER`/`HOSTC_SHARED` 拼接对账模式（`94c0b6bbc` 落地），但它只对账契约头/共享头这两个"已完成"的产物，不覆盖函数体，不需要为本战役改动，可作为切片 4/5 的对账脚本范式参考。

## 2. 范围钉死

**改**：
1. `src/core/tooling/mobile_shell_codegen.cheng` —— 新增两个发射函数（`MobileShellHarmonyGuiHostGenSource`/`MobileShellHarmonyGuiHostAdapterSource`，命名待切片 1 定稿，禁止在接线前臆造已存在），`MobileShellWriteHarmony` 内新增 `opts.harmonyNativeGuiExperimental` 分支。
2. `src/tests/mobile_shell_codegen_smoke.cheng` —— 替换 1.5 节列出的旧断言。
3. `tools/harmony_host_gen_gap_census.sh` —— 生成器侧读取从单文件改双文件。
4. （可能）`tools/harmony_host_gen_gap_census_driver.cheng` —— 若双文件输出路径与驱动的读取假设冲突需要同步改。

**不改**：
- `platform/harmony/ChengGuiDemo/entry/src/main/cpp/*` 任何手写文件（这是主树只读边界，验证只在生成产物 vs 手写文件之间做对账，不回写手写侧）。
- `cheng_gui_entry.cpp` 的生成——明确不在范围，见 §0。
- 契约头/共享头发射逻辑——已完成。

## 3. 切片计划

每片 `files/action/verify/done` 独立可回滚，按 migration-plan.md 既有纪律：**先影子树/隔离目录验证，再落主树**；`--require-rebuild` 级别的驱动重建不在本规格执行范围内（后续实施会话自行安排，禁编大闭包铁律对本规格本身不适用，仅对本次侦察-写规格会话适用）。

### 切片 0：函数级三分域清单（纯分析产出，零代码改动）
- **files**：新增 `docs/harmony-host-codegen-m3-function-manifest.tsv`（新文档，不改生成器/不改手写文件）。
- **action**：写一个一次性 Python/awk 脚本（可放 `tools/harmony_host_gen_m3_manifest_extract.py`，风格参照 `tools/harmony_adapter_contract_diff.sh` 内嵌 python 段的花括号自动机，或复用 `tools/harmony_host_gen_gap_census.sh` 的 `extract_funcs`/`mask` 逻辑），对 `MobileShellHarmonyHostSource`（`:25717-27501`）拼出的单体文本做函数级切分，每个函数按下述判据打域标签：
  - 命中 `cheng_gui_host_gen.c` 现有函数名集合（`HOST_GENC` 提取）→ `GEN`
  - 命中 `cheng_gui_host_adapter.c` 现有函数名集合（`HOST_ADAPTERC` 提取）→ `ADAPTER`
  - 命中 `cheng_gui_entry.cpp` 现有函数名集合（`ENTRYCPP` 提取，如 `OnSurfaceCreated`/`OnDispatchTouchEvent`/`OH_NativeXComponent_OnLoad`）→ `ENTRY`（后续切片直接丢弃，不发射）
  - 三边都不命中（真正新函数，理论上不应该出现，因为当前单体是既有产物的超集）→ 标 `UNKNOWN`，人工复核，**不允许静默归类**
  - 判据复用 `tools/harmony_host_gen_gap_census.sh` 已验证过的花括号深度自动机（`:263-356` `_is_ident_char`/`_try_match_signature`/`extract_funcs`），不重新发明解析器。
- **verify**：(a) 清单条数总和 = `MobileShellHarmonyHostSource` 输出里的函数总数（用同一自动机数一遍互相对账）；(b) `UNKNOWN` 数必须为 0——非 0 说明判据有缺陷，回去修判据而不是把 UNKNOWN 硬塞进某个域；(c) 抽样人工核对至少 10 个函数（`cheng_resolve_exports`/`OnSurfaceCreated`/`cheng_host_egl_window_surface`/`ChengVideoVSyncCallback`/`cheng_img_ndk_load` 等，覆盖 §1.2 提到的所有子域）与本规格 §1.2 的域标注一致。
- **done**：`docs/harmony-host-codegen-m3-function-manifest.tsv` 入库，三列 `函数名 | 当前所在段(prologue/core/epilogue) | 目标域(GEN/ADAPTER/ENTRY)`，UNKNOWN=0，人工抽样通过。这是切片 1-3 的唯一权威输入，后续任何"这个函数该进 gen.c 还是 adapter.c"的分歧回这张表找答案，不许现场拍脑袋。

### 切片 1：两个新发射函数骨架（纯重排，不改内容，先不接线）
- **files**：`src/core/tooling/mobile_shell_codegen.cheng`（新增两函数，插入点建议紧邻 `MobileShellHarmonyHostSource`，即 `:27501` 之后、`:27503` 之前）。
- **action**：新增 `MobileShellHarmonyGuiHostGenSource(opts: var MobileShellOptions): str` 与 `MobileShellHarmonyGuiHostAdapterSource(opts: var MobileShellOptions): str`。两函数内部**不重写任何函数体文本**——用切片 0 的清单，把 `prologue`/`core`/`epilogue` 三个 Fmt 字符串里已经写好的函数文本按 `GEN`/`ADAPTER` 标签重新分组拼接（`ENTRY` 标签的函数体整段丢弃，因为 entry.cpp 不生成）。`MobileShellHarmonyHostSource` 本身**保留不删**（作为回归基线，供切片 4 self-check 用，待切片 6 全部验证通过后再决定是否移除——本规格不要求移除，移除是可选的后续清理，不阻塞主线）。
  - `GenSource`：`core`（`:26136` 调用不变）+ epilogue 里标 `GEN` 的个体吸收函数（`cheng_resolve_exports`/own-IP 族/vsync 族等）。纯 C 输出，**去掉** `extern "C" {{ ... }}` C++ 链接包装（`.c` 文件不需要，且这两个文件按 CMake `project(... C CXX ASM)` 会被当 C 编译，`extern "C"` 在纯 C 编译单元里不是合法语法）。
  - `AdapterSource`：prologue 里标 `ADAPTER` 的部分（EGL/window 适配钩子、rawfile/asset 读取器）+ epilogue 里标 `ADAPTER` 的媒体/CHT 适配大段 + 文件选择器辅助。同样纯 C，无 `extern "C"`。
  - includes 按 §1.6 现有 `cheng_gui_host_gen.c`/`cheng_gui_host_adapter.c` 实际 `#include` 清单核对（两文件都 `#include "cheng_gui_host_shared.h"`，`shared.h` 已经把绝大多数系统头收拢进去——`cheng_gui_host_shared.h:14-50` 已确认），每个新函数体内**不要**重复 prologue 里那些已经被 `shared.h` 覆盖的 `#include` 行（用切片 0 清单核对哪些 include 行需要保留在各自文件顶部 vs 已被 shared.h 吸收）。
- **verify**：(a) 自洽检查——`GenSource(opts)` 与 `AdapterSource(opts)` 按函数名去重合并后的函数体全集，与 `MobileShellHarmonyHostSource(opts)` 输出里（剔除 `ENTRY` 域函数体后）的函数体全集逐函数比对，body 文本必须逐字节相同（这一步只是"重新分组"不是"重新实现"，任何 diff 都是切片 1 引入的 bug）；(b) `cheng system-link-exec` 编译 `mobile_shell_codegen.cheng` 本体通过（新函数暂不被任何调用点引用，靠 smoke 测试新增独立断言触发，见下）；(c) N/A（不产出任何 ChengGuiDemo 文件改动，也不改 `MobileShellWriteHarmony`）。
- **done**：两个新函数存在，自洽 diff 为空，编译通过。`MobileShellWriteHarmony` 仍未调用它们（下一切片接线）。

### 切片 2：纯 C 语法与生产文件头部对齐
- **files**：同切片 1 两个函数体（局部收尾）。
- **action**：核对生成的 `GenSource`/`AdapterSource` 文本头部（去掉 `extern "C"` 包装后）与真实 `cheng_gui_host_gen.c`/`cheng_gui_host_adapter.c` 的顶部结构。★事实订正（对抗复核实测, 推翻本节初稿）：两文件自创建首个提交（`2c5c0073c`, 2026-07-11）起**已各带**头部样板——gen.c 第 1 行 `// GENERATED split of cheng_gui_host.c — GEN half (slice-8 physical split, mechanical).`，adapter.c 同款 ADAPTER half 版本，随后紧跟 `#include "cheng_gui_host_shared.h"`；而当前生成器单体输出里这两行 grep 零命中。因此目标不是"新增一行预期漂移"，而是**新发射函数必须逐字节复刻这两行已存在的头部样板**——它们是"新写、非搬运"文本（不来自 prologue/epilogue 任何既有片段），切片 1 的 verify(a) 自洽 diff 口径必须为每文件这 2 行显式开例外并单列进切片 1 done 条件，否则会被误判为切片 1 引入的 bug。
- **verify**：(a) 两文件语法过 `-fsyntax-only`（用 OHOS 交叉编译器或桌面 clang 加 `-std=c11`，不需要链接，纯语法检查，参照 migration-plan.md slice-3 "verify(b) 用 OHOS 交叉编译器 -fsyntax-only -D_GNU_SOURCE" 的既有方法）——目标是抓出遗留的 C++-only 语法（`{{ }}` 转义后如果哪里漏了非 C 的构造，比如漏改的 `extern "C"`、`nullptr` 等）；(b) N/A；(c) N/A。
- **done**：`-fsyntax-only` 通过；每文件两行头部样板（half 注释+`#include "cheng_gui_host_shared.h"`）与生产文件逐字节一致，且已在切片 1 对账口径中作为"新写文本"显式登记。

### 切片 3：接线 `MobileShellWriteHarmony`，门禁分支收窄
- **files**：`src/core/tooling/mobile_shell_codegen.cheng`（`:28491-28515` 区间，改动点）。
- **action**：把 `:28491-28515` 改为：
  ```
  if opts.harmonyNativeGuiExperimental:
      # 三文件拓扑：cmakeText 走 MobileShellHarmonyGuiHostCmakeText(:21392)，
      # 分别写 cheng_gui_host_gen.c / cheng_gui_host_adapter.c，不写 entry.cpp
      # （entry.cpp 手写不变，见本规格 §0）。
      ...
  else:
      # 现状不变：玩具版 MobileShellHarmonyCmake + 单体 MobileShellHarmonyHostSource。
      ...
  ```
  两个分支各自完整走 `MobileShellWriteFile`，`false` 分支**逐字节复制**当前 `:28491-28515` 代码，不做任何精简合并（防止"顺手重构"把两条路径耦合，任何未来对 `true` 分支的改动都不该影响 `false` 分支的字节输出）。
- **verify**：(a) 回归对账——默认 `opts`（`harmonyNativeGuiExperimental` 保持默认 `false`）跑一次 export，产物与切片 3 改动前逐字节相同（这是防"裸换名毒化泛型管线"风险①的硬门槛，diff 工具用 `/usr/bin/diff`，不信 PATH shim，`diff_shim_always_zero_trap` 教训）；(b) `harmonyNativeGuiExperimental=true` 分支跑一次 export，产出目录应有 `cheng_gui_host_gen.c`/`cheng_gui_host_adapter.c` 两个文件（无 `.cpp` 单体），CMake 文本应为 `MobileShellHarmonyGuiHostCmakeText` 全文（含 MoQ/Feed 两个 `if(EXISTS)` 分支）；(c) N/A（尚未到装机验证阶段，先过 hvigor/cmake configure，见切片 6）。
- **done**：两分支都能跑通，`false` 分支零漂移，`true` 分支产出两文件+完整 CMake。

### 切片 4：Smoke 测试断言切换
- **files**：`src/tests/mobile_shell_codegen_smoke.cheng`（`:182/:189-193/:199-263` 区间替换）。
- **action**：
  - `:182` 单一 `cheng_gui_host.cpp` 路径断言 → 拆成两条路径（`cheng_gui_host_gen.c`/`cheng_gui_host_adapter.c`）。
  - `:189-193` 玩具版 CMake 断言 → 换成对 `MobileShellHarmonyGuiHostCmakeText` 全文的断言（`add_library(cheng_gui_host SHARED cheng_gui_host_gen.c cheng_gui_host_adapter.c cheng_gui_entry.cpp ...)` 等，具体字符串从 `:21235-21315` 定义体核对，不许凭记忆编）。
  - `:199-263` 一批 `StrContains` → 按切片 0 清单里每个符号的目标域，分别对 `GenText`/`AdapterText` 断言（例：`cheng_resolve_exports`→GenText，rawfile 读取器→AdapterText，vsync 三函数→GenText，wave9 phase B 7 家族代表符号→按各自域拆到两个变量）。
  - 新增两条 byte-identical 断言，仿照 `:276-277`（契约头）/`:297-298`（共享头）的既有模式：
    ```
    assert(genText == genRealText, "mobile shell smoke: harmony gen.c byte-identical to checked-in cheng_gui_host_gen.c")
    assert(adapterText == adapterRealText, "mobile shell smoke: harmony adapter.c byte-identical to checked-in cheng_gui_host_adapter.c")
    ```
    这是本战役最终验收的核心断言——generated 两文件必须与 `platform/harmony/ChengGuiDemo` checked-in 的两文件逐字节相同（若不同，说明手写侧此后又演进过、生成器没跟上，属于切片 0-3 期间新出现的 drift，需要先跑一遍 §1.6 提到的 gap census 工具把新 drift 摸清楚，不能在 smoke 测试里悄悄放宽断言）。
- **verify**：(a) 该 smoke 测试文件本身对 `MobileShellWriteHarmony` 的新旧两分支各跑一次，断言全绿；(b) `cheng system-link-exec` 跑 `mobile_shell_codegen_smoke.cheng` rc=0；(c) N/A。
- **done**：smoke 测试反映真实两文件拓扑，byte-identical 断言存在且通过（**这一条如果不能通过，说明切片 0-1 的域清单有遗漏或手写侧另有生成器未追平的改动，必须先定位差异，不允许跳过或改成 StrContains 弱化断言**）。

### 切片 5：`tools/harmony_host_gen_gap_census.sh` 生成器侧读取源切换
- **files**：`tools/harmony_host_gen_gap_census.sh`（`:151`/`:427` 附近）、`tools/harmony_host_gen_gap_census_driver.cheng`（若驱动写出的路径需要同步暴露成两个路径变量则一并改；若驱动只是调 `MobileShellExportResolved` 走统一导出流程，两文件路径由 `MobileShellWriteHarmony` 内部决定，驱动本身可能不用改，需先读一遍驱动全文再判断，不预设）。
- **action**：把 `gen_cpp_path`（单变量）拆成 `gen_genc_path`/`gen_adapterc_path` 两个变量，读取切片 3 产出的两文件；分类逻辑（`GEN-EQUAL`/`GEN-DIFF`/`ADAPTER-ONLY`/`UNABSORBED` 四类判据，`:17-24` 注释描述的方法学）本身**不改**——只改"生成产物从哪读"，不改"怎么分类"。
- **verify**：(a) 跑 `tools/harmony_host_gen_gap_census.sh` 出新 `summary.txt`，与切片 3/4 落地前的最近一次 census 基线（当前 HEAD 附近的历史基线是 wave7 定谳的 `264=102/23/72/67`，注意这是切三文件之前的态，切完之后 `GEN-EQUAL`/`GEN-DIFF` 计数预期应该**上升**——因为生成器现在真的能吐出 gen.c/adapter.c 意义上可比对的文本了，具体数字以本切片实跑为准，不要拿旧数字硬套）对比，确认工具本身跑通、无解析错误；(b) N/A（是工具脚本，不是被编译目标）；(c) N/A。
- **done**：census 工具跑通，产出的 `functions.tsv`/`summary.txt` 反映两文件生成态。

### 切片 6：影子树 CMake configure 验证
- **files**：无源码改动，纯验证。工作目录用 `/private/tmp/claude-501/.../scratchpad/m3-shadow-tree`（本规格约定示例路径，实施会话按自己的 scratchpad 实际路径来，不写入主树）。
- **action**：
  1. `harmonyNativeGuiExperimental=true` 跑一次 export 到影子目录，拿到 `harmony/entry/src/main/cpp/{CMakeLists.txt, cheng_gui_host_gen.c, cheng_gui_host_adapter.c, cheng_gui_host_shared.h, cheng_gui_host_adapter_contract.h}`。
  2. **手动补齐**（这是验证脚手架，不是生成器职责，§0 已定scope）：从 `platform/harmony/ChengGuiDemo/entry/src/main/cpp/` 拷贝 `cheng_gui_entry.cpp` 到影子目录同名位置（因为生成器不产出它，但 CMake 硬编码引用它，缺了 `cmake` configure 会报 `Cannot find source file`）；`prebuilt/` 目录下的对象文件（`scene_app_oh.o`/`ps.o`/`cp_local.o`/`hr.o` 等）同样从生产目录 `cp -r` 过去（或用 `set_source_files_properties ... EXTERNAL_OBJECT TRUE` 允许的空占位——**若走空占位，`add_library` 编译目标本身会失败，但 `cmake` configure 阶段应该仍能通过**，因为 `EXISTS` 门控只影响 MoQ/Feed 两个可选 `.so`，主库对象是硬引用不做 EXISTS 检查——这一点需要在切片 6 实跑时确认，若实测 configure 阶段也因主库对象缺失而失败，如实记录，不要靠猜测写 done 条件）。
  3. 跑 `cmake -S <影子树>/harmony/entry/src/main/cpp -B <影子树>/build`（configure only，不 `--build`，不需要 OHOS 交叉工具链的完整 SDK，只需要 `project(... C CXX ASM)` 声明能被本机 cmake 解析——若本机 cmake 因缺 OHOS 专属 toolchain file 直接失败于更早阶段，退化为"文本级语法检查"：用 `cmake --graphviz` 或直接读 configure 报错信息定位是不是"文件缺失"这一类错误，不是工具链缺失这一类错误，二者要分开报告）。
- **verify**：(a) N/A；(b) configure 报错信息里不再出现 `Cannot find source file`/`does not exist`（对 `cheng_gui_host_gen.c`/`cheng_gui_host_adapter.c`/`cheng_gui_host_shared.h` 这三个生成产物）；(c) 需设备窗口——真实 hvigor 全量构建 + 装机，本切片不做，留给拍板后的实施会话。
- **done**：影子树 configure 阶段对生成产物三文件（不含手动补齐的 entry.cpp/prebuilt）零缺失报错，报告实测结果（通过或具体卡在哪一步），不允许写"应该能过"这种未验证结论。

## 4. 验证门禁通用纪律（贯穿所有切片）

1. **对账脚本 byte-identical（内容重排后按段对账）**：切片 1 的"自洽检查"与切片 4 的"生成 vs 手写 byte-identical"是两层不同的对账——前者验证"重新分组没有丢字节"，后者验证"生成器追平了手写侧的真实内容"。两层都要过，缺一层都不能算切片完成。对账脚本统一用 `/usr/bin/diff` 或 Python `difflib`（`diff_shim_always_zero_trap` 教训：本机 PATH 上的 `diff` 是 DevEco shim 恒 `exit 0`），复用 `tools/harmony_host_gen_gap_census.sh` 已验证过的花括号自动机/单遍解析方法学，不要为这次任务重新发明一套正则。
2. **影子树 cmake configure 通过**：见切片 6，不做全量 hvigor 构建（那需要 OHOS SDK + 交叉工具链，超出本机可验证范围），但至少要证明"文件拓扑自洽"——CMakeLists 引用的每个文件在磁盘上都存在。
3. **装机一致性纪律**：host `dlsym` 新导出需新场景 `.o` 同批换装，否则 fail-safe 非全屏（既有立卷 `unimaker_1to1_frontier_2026_07_05.md`/M3 正典原话）。本战役是"物理拆分文件"，不新增/修改任何 `dlsym` 符号名或 `cheng_host_*`/`cheng_app_*` 契约面（契约头/共享头已完成且本战役不碰），理论上不触发这条纪律——但**切片 4 的 byte-identical 断言如果暴露出手写侧在拆分文件之后又新增了生成器没追平的函数**（类似 §0 提到的 `cheng_host_nodes_snapshot_refresh` 缺口），那条新函数如果涉及新 `dlsym` 导出，落账时必须遵守这条纪律，落到实施阶段的对应切片里显式过一遍装机一致性检查单，不能因为"只是文件拆分"就跳过。

## 5. 风险清单

### ① `harmonyNativeGuiExperimental` 分支毒化
**已有护栏**：`:163` 的 `harmonyBlocked` 判定 + 切片 3 要求的"两分支各自独立、`false` 分支逐字节复制不精简"纪律，是任务列表台账里 `~~wuft6pwkn~~`（旧 blocked 项）反复强调的正确修法（`docs/harmony-host-codegen-migration-plan.md:146` slice-1 action①）。**残余风险**：如果切片 3 图省事把两分支代码合并成"共享一段+条件插桩"，未来任何对三文件分支的改动都可能悄悄改变默认路径的字节输出——通用导出目标（非 ChengGuiDemo，没有 `prebuilt/publisher/moq_core.o` 等文件、库名不是 `cheng_gui_host`）会被迫套上 ChengGuiDemo 专属拓扑，CMake `configure` 直接失败。切片 3 的 verify(a) 回归对账就是防这个的硬门槛，必须每次改动都重跑，不能只在切片落地当次跑一遍就永久免检。

### ② 契约头 63 符号落后待 regen（历史立卷）× 本战役交互
**现状澄清**：历史上的 GLUE28/APP-EXPORT75 → 现已 regen 到 GLUE31/APP-EXPORT137（`tools/harmony_adapter_contract_diff.sh` 实测 APP-EXPORT/PICKER 段 `OK`），"63 符号落后"这个具体数字已经过时，不能再引用。但**残余 1 条真实 gap 仍在**：`cheng_host_nodes_snapshot_refresh`——契约头声明了（`cheng_gui_host_adapter_contract.h:110`，生成器源 `mobile_shell_codegen.cheng:27614`），但 Harmony 侧两个 `.c` 文件都没定义它（本次实测 `grep` 零命中）。**与本战役的交互**：切片 4 的 byte-identical 断言会让这类"契约头有、函数体没有"的 drift 第一次被机械化捕获（现在契约头是单独发射+单独对账，函数体是单体 `.cpp` 里手工 `StrContains` 抽查，覆盖不到"声明了但生成器没实现"这类缺口）。**处置**：切片 0 的域清单如果这个符号在生成器现有单体 `.cpp` 文本里根本找不到函数体（预期如此，因为它是 Android 侧函数 `:18159`，Harmony 侧从未实现过），标成 `UNKNOWN`/单独记录，不能强行分类到 GEN 或 ADAPTER——这是一个**真实功能缺口**（Harmony 端 `nodes_snapshot_refresh` 桥没实现），不是拆分战役的产物，需要单独立卷（不在本规格范围内解决），但必须在切片 0 的清单里如实标注"契约头声明存在、生成器/手写两侧函数体均缺失"，避免下一个接手会话把它当成"拆分遗漏"来查却查不出根因。

### ③ 驱动 skeleton 重复 `dlsym` 清理（历史立卷）× 本战役交互
**现状澄清**：`:26188-26194` 注释明确写"driver-skeleton dlsym duplication, cleaned up per harmony-host-codegen-migration-plan.md M3"——这条清理**已经做完**，不是待办。`cheng_gui_host_on_back`（`:27483-27498`）里同款注释同样指向"已清理"状态。**残余风险**：这两处注释锚定的代码（`s_app_scroll_by`/`s_app_media_control` 等 dlsym 赋值行 + `cheng_gui_host_on_back` 函数体）在切片 1 的"函数级重新分组"操作中，如果域清单误判导致这段文本被切分到错误的文件（例如注释被留在 GenSource 但代码本体被切进 AdapterSource，或者反过来），会造成"注释指向的清理状态"和"代码实际所在文件"不一致，未来读者会困惑。**处置**：切片 0 清单生成时，`cheng_resolve_exports`（含 `:26188-26194` 这段 dlsym 赋值，它是 `cheng_resolve_exports` 函数体内部的一部分，不是独立函数）与 `cheng_gui_host_on_back` 两个函数整体打 `GEN` 标签（已在 §1.2 分析里确认），保证这段代码和它的说明性注释作为一个原子单元一起搬，不拆散。

### ④ 三个风险项之外的新发现：主 CMake FATAL_ERROR 已修，但发射从未接线
`MobileShellHarmonyGuiHostCmakeText` 本身（含 MoQ/Feed 的 `if(EXISTS)` 分支）经本次实测复核**已经是安全版本**，不是 migration-plan.md 历史记录的"无门控 FATAL_ERROR"态——这条历史记录已经是 stale 信息，`docs/harmony-host-codegen-migration-plan.md:340-368` 的"二轮定谳"描述的是更早的 HEAD。本规格切片 3/6 基于当前实测状态设计，不要在实施时又去"修复"一个已经不存在的 FATAL_ERROR 问题。

### ⑤ 共享巨文件并发 WIP 险（对抗复核补录）
唯一实施源文件 `src/core/tooling/mobile_shell_codegen.cheng`（~29k 行单体）是多会话高频共享文件；复核实测当前主树工作区就有一段与本战役无关的 ~154 行未提交改动（GLES shader antialiasing fwidth→smoothstep、glTexParameteri 去 mipmap、日志宏互换，集中在 `MobileShellNativeGlesCoreSource` ~22284-25927 行区间，紧邻切片 1/3 计划编辑的 25717-28964 区间）。**每个切片开工前必须** `git status` + `git diff -- src/core/tooling/mobile_shell_codegen.cheng` 确认无并发未提交改动或已明确隔离（mtime 静止 >10min 作旁证）；落账一律 pathspec + 行数对账，严禁整文件 checkout/restore。这是 primary_object_plan.cheng clobber 教训（CLAUDE.md 铁律 5/6）在同类共享巨文件上的直接适用。

## 6. 引用的既有立卷（供实施会话背景对照，不重复其内容）

- `docs/harmony-host-codegen-migration-plan.md`（M1-M3 正典，本规格订正了其部分 stale 行号与"FATAL_ERROR 未修"的过时状态）
- `docs/pending-work-ledger-2026-07-14.md:36`（`~~wuft6pwkn~~` blocked 项，本规格是其"真前置"的可执行化）
- `docs/pending-work-ledger-2026-07-14.md:41`（本规格对应的在飞登记 `wmgmipchs`）
- `tools/harmony_host_gen_gap_census.sh` / `tools/harmony_host_gen_gap_census_driver.cheng`（切片 0/5 复用的解析方法学与驱动骨架）
- `tools/harmony_adapter_contract_diff.sh`（切片 4 byte-identical 断言模式的既有范例，`:43-45`/`:72-82`）
- `src/tests/mobile_shell_codegen_smoke.cheng:159-302`（当前 harmony-experimental 断言全集，切片 4 的直接编辑对象）
