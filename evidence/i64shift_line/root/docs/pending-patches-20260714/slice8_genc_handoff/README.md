# slice-8 gen.c 物理拆分 — 第一波之后的精确剩余工作 (2026-07-14)

本波(见同目录上级 `slice8_regen_emitter.patch`)只落地了共享头
(`MobileShellHarmonyGuiHostSharedHeaderText`)，`cheng_gui_host_gen.c` 发射 +
CMake 三文件接线 **未做**。以下是把剩余工作做实测过、可直接复用的精确数据，
不是重新侦察的起点。

## 核心结论

1. **census 工具口径**(`tools/harmony_host_gen_gap_census.sh`)已确认: gen.c
   的 193 个函数中 134 个(110 GEN-EQUAL + 24 GEN-DIFF)已经能在生成器当前的
   单体 `cheng_gui_host.cpp` 输出里找到同名同(近)体的函数——**不需要新写
   任何函数逻辑**，只需要把这 134 个函数的文本从 `.cheng` 源里正确地搬到一个
   新的物理输出（`cheng_gui_host_gen.c`），丢弃另外一批。
2. 134 个里 **100 个**全部来自 `MobileShellNativeGlesCoreSource()`
   (mobile_shell_codegen.cheng:21269起，约4337行) ——这部分本身就是单独一个
   函数、零歧义、零判断，直接调用即可复用。见 `core_functions_line_ranges.tsv`。
3. 剩下 **34 个**散落在 `MobileShellHarmonyHostSource()` 的 `prologue`
   (25621-26031) 和 `epilogue`(26033-27390) 两段 Fmt 模板里，和另外
   **27 个**要丢弃的函数(见下)交错在一起，不是连续区间，必须逐函数抽取。
4. 已经用花括号深度自动机(`split_functions.py`，已验证识别 core 的 105/105
   和 prologue+epilogue 的 50/57，另 7 个因为多行签名/单行函数体被脚本漏检，
   NOT 因为内容不存在——`cheng_mobile_host_prepare_media_surface_texture`
   实测就是这 7 个之一，多行参数列表导致签名不在同一行)。
5. **27 个丢弃名单**(`gen_c_discard_27_names.txt`)已经交叉验证过——25 个在
   gen.c/adapter.c/entry.cpp 三个手写文件里**任何一个都没有同名函数**(纯生成器
   遗留的 OHOS NAPI/XComponent 驱动重复实现，如 `OnDispatchTouchEvent`
   `ChengHarmonyHostNapiInit` `OnVSync`)，另外 2 个(`OnSurfaceCreated`
   `OnSurfaceDestroyed`)和 `cheng_gui_entry.cpp` 的同名函数**语义等价但已被
   entry.cpp 取代**——这 27 个整体丢弃是安全的，census 也不会因为这带来倒退
   (它们本来就不属于 gen.c 域，丢了不影响 GEN-EQUAL/DIFF 计数)。
6. **cmake configure 会真的检查 add_library() 引用的源文件是否存在**(本机
   cmake 4.3.0 实测: `Cannot find source file: does_not_exist.c` 是硬错误，
   不是警告)。所以三文件版 CMakeLists.txt 接线后，如果导出目录里没有
   `cheng_gui_host_adapter.c`/`cheng_gui_entry.cpp`(手写域，生成器不发射)，
   configure 会失败。**正确验证方法**: 对着一个已经带手写 adapter.c/entry.cpp
   /prebuilt/ 的目录跑 configure(例如复制 `platform/harmony/ChengGuiDemo`
   本身，或用生成器输出覆盖那份拷贝里的 gen.c/shared.h 再 configure)，不是
   对着一个裸的 `--out-dir` 跑。
7. **census 工具的 `*.cpp` glob 会因为物理拆分而失效**
   (`tools/harmony_host_gen_gap_census.sh` 第 111 行左右
   `GEN_CPP="$(ls "$GEN_CPP_DIR"/*.cpp ...)"`)。一旦生成器改成写
   `cheng_gui_host_gen.c`(`.c` 不是 `.cpp`)，这个 glob 找不到文件，工具会
   FATAL。**这个工具本身也需要跟着改**(不在原任务清单里，是真实发现的
   连带修改点，不能漏)。

## 文件清单

- `gen_c_keep_134_names.txt` — gen.c 域必须出现的 134 个函数名(GEN-EQUAL+GEN-DIFF)。
- `gen_c_discard_27_names.txt` — 安全丢弃的 27 个(生成器现有输出里存在、但
  gen.c/adapter.c/entry.cpp 都没有对应，属于该淘汰的 OHOS 驱动重复实现)。
- `core_functions_line_ranges.tsv` — `MobileShellNativeGlesCoreSource()` 内
  105 个函数在 `.cheng` 源里的起止行(全部安全、零判断)。
- `prologue_epilogue_functions_line_ranges_PARTIAL.tsv` — prologue+epilogue
  内用花括号自动机抽到的 50 个函数起止行(**不完整**，另 7 个因多行签名/
  单行函数体漏检，需要修下面的脚本补全)。
- `split_functions.py` / `find_gaps.py` — 抽取用的花括号深度自动机(单遍扫描
  `{{`/`}}` 转义规则，和 census 工具用的是同一方法学移植)。`split_functions.py`
  的签名正则要求整个函数签名在同一行以 `{{` 结尾——下一波要先把这个放宽到
  支持多行参数列表和单行函数体，否则会继续漏掉这 7 个。

## 下一波的具体步骤(按顺序)

1. 修 `split_functions.py` 的签名识别，补全 prologue+epilogue 的 34 个 KEEP
   函数(7 个当前漏检的)精确起止行。
2. 按 gen.c 里的原始出现顺序(`functions.tsv` 的 `start_line` 列，不是
   `.cheng` 源里的顺序)拼出这 34 个函数体 + 它们各自需要的 typedef/宏/
   静态全局(逐个检查，例如 `ChengDecCtx`/`ChengNv12Band` 这类只在
   epilogue 出现过的类型)。
3. 新写 `MobileShellHarmonyGuiHostGenCText(opts)`:
   `core := MobileShellNativeGlesCoreSource()` + 上一步的 34 函数文本，套
   `// GENERATED split...` 注释头 + `#include "cheng_gui_host_shared.h"` +
   `#define s_resource_manager s_gui_resource_manager` shim(照抄生产
   `cheng_gui_host_gen.c` 开头 10 行)。**不要**保留 27 个丢弃函数、也不要
   保留 `extern "C"` 包装(纯 C 编译单元)。
4. `MobileShellWriteHarmony` 里加一段: 写 `cheng_gui_host_gen.c`(新文件，
   additive 不影响现状)。**先不要**急着把 CMake 换成三文件版、也不要删掉
   现有单体 hostText 写入——保持两条腿都在，等 census 验证 gen.c 域
   GEN-EQUAL/DIFF 计数和 baseline(110/24)完全一致、零意外新增 diff 之后，
   再单独一个提交切 CMake + 停写单体文件。
5. 同步改 `tools/harmony_host_gen_gap_census.sh` 的 `GEN_CPP` 探测逻辑，
   让它认 `cheng_gui_host_gen.c`(而不是死认 `*.cpp`)。
6. cmake configure 门禁: 拿一份 `platform/harmony/ChengGuiDemo` 的拷贝，
   用生成器新输出覆盖它的 `cheng_gui_host_gen.c`/`cheng_gui_host_shared.h`/
   `CMakeLists.txt`，在那份拷贝里跑 `cmake -S entry/src/main/cpp -B build`，
   而不是对着裸 `--out-dir` 跑（后者会在 publisher 分支的
   `prebuilt/publisher/moq_core.o` EXISTS 检查上必炸，那是生产设计的硬校验，
   不是要绕过的 bug）。

## 本波已验证、可直接信任的事实(不需要重新确认)

- `MobileShellNativeGlesCoreSource()` 全文零 opts 相关的单花括号插值token
  (`{opts.xxx}` 之类)，`prologue`/`epilogue` 里仅有的动态 token
  (`{harmonyModName}` 在 26011、`{dot}` 在 26949-26952)都落在**要丢弃**的
  27 个函数范围内——134 个 KEEP 函数的内容对 opts 完全静态，可以放心整体
  文本嵌入(和 `MobileShellHarmonyGuiHostMainCmakeText` 现有写法同一模式)，
  不存在"静默冻结参数化"的风险。
- 共享头(`cheng_gui_host_shared.h`)全文同样零 opts 依赖，本波已经把它做成
  `MobileShellHarmonyGuiHostSharedHeaderText()`(纯文本转义 Fmt 内嵌
  `{`→`{{` `}`→`}}`，缩进补 4 空格匹配收尾 `"""` 的公共缩进)，往返验证
  字节级一致，smoke 测试(`src/tests/mobile_shell_codegen_smoke.cheng`)
  新增断言 rc=0 通过，census baseline(110/24/77/57 = 268)零漂移。
