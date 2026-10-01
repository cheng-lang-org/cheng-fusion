# 鸿蒙 Host 代码生成迁移蓝图

状态：M1-M3 全谱收官（2026-07-25 订正）——slice-0/1/2/3/5/6/7 全部落地，slice-8 装配管线终局切换已收官（文件级 GEN-DIFF 336→0，台账「收割批次」在案）；唯一未闭合项=slice-4 帧驱动 vsync 的真机 stall_n/p50/p95 三指标实测（代码已落，等鸿蒙真机设备窗+可装 HAP）。**2026-07-25 晚设备窗补充**：生成 host 经模拟器全链实证无缺陷（同 07-24 HAP：渲染/路由/QUIC 远端拉流 dial 510ms/zero-copy 解码/首帧 630ms 全绿，prewarm 命中后首帧 160ms）；slice-4 真机指标被真机特有「场景 init resources 段偶发静默失败(id=0 黑屏)+详情路由黑屏(glyphFail=779)」阻断——非迁移回归，独立立案追根因。endurance 仪表三触发在短素材(186 帧)下全灭已根修（5s 墙钟周期触发 + init 失败 build_step 响亮探针，双端已镜像模板，台账 07-25 晚鸿蒙窗节）。
**2026-07-26 凌晨真机解锁窗定谳（slice-4 done 判据满足——根因已排查出并写入代码注释）**：F5 的「~10fps 退化/冻帧」根因**不是 vsync 调度**（真机实测 OH_NativeVSync 回调正常到达：hilog `recv vsync timestamp from:cheng_video_vsync`），而是 **zero-copy decode-to-surface 的 producer→consumer 链路双端断裂**：真机与模拟器上 `OH_NativeImage_UpdateSurfaceImage` 恒败 rc=40601000（have_frame=0, out_n=0），解码器侧 decode started/186 帧计满/stream loop rc=5 全绿、音频回退在放——帧从未真正投递到 NativeImage 消费面（SetSurface OK 但输出未落 s_surf_window）。定谳注释在 cheng_gui_host_adapter.c cheng_surface_consume。真机全链其余环节已实证：门前置修复后点卡即 spawn→dial 64ms→es open=1→open_to_first_frame **347ms**。同窗顺带根修两案：①click-to-play 起流门被贴图 cache-hit 早退饿死（全屏恢复态+abort 重试双族, 门已前置到 cache 判定前, gen.c+模板双拷贝镜像逐字节验证）②场景 init 竞态四形态定谳（成功/快败@build_step=1000/败@resources/挂死@resources, 嫌疑=own-serve 发布线程并发碰单线程 Cheng runtime, S5-B 红线, 待独立战役）。**slice-4 剩余收尾=decode-to-surface producer 断链根修后补采 stall_n/p50/p95**（endurance 5s 墙钟仪表已在位, 帧一通即出数）。单体导出路径已显式废弃（#140 门禁）。下文 §0-§5 保留为立项时的诊断与蓝图原文，供追溯；当前状态以本行+台账为准。
战役背景与两份底稿（host 总账 `hhm1-host-census.md`、生成器勘察 `hhm1-gen-recon.md`）见 scratchpad，本文档所有引用已用 `Read`/`grep` 复核，file:line 均可现场重放验证。

---

## 0. 结论先行

鸿蒙 host（`platform/harmony/ChengGuiDemo/entry/src/main/cpp/cheng_gui_host.c`，7505 行）不是"待生成"，是**装配管线已经断裂的产物**：`build_gui_host.sh` 从一份早已被清理的 Android host 快照切片 + 拼接 `ohos_host_entry.inc`，而 `.inc` 已和 `.c` 实际尾部漂移 99 行（`diff` 实测 rc=1）。今天任何人重跑这个脚本都会**静默吃掉手写成果**。这是比"生成器覆盖率不够"更紧急的问题，蓝图第一件事是止血，不是扩产能。

生成器（`mobile_shell_codegen.cheng`）确实有一条 Harmony 发射链（`MobileShellHarmonyHostSource` :24403-24893），但：
- 在 `runtimeMode == "r2c_native_gui_v1"` 时被硬门禁直接拒绝（:159 `native scene renderer is implemented only for android`），从未在生产路径跑过。
- 它调用的"共享" GLES 核心模板（`MobileShellNativeGlesCoreSource` :20435-24403）本身落后于 Android 内联版本（`core_diff_real.txt` 实测 13761 行差异），且已被 v3b/v3c 两次独立移植证实：**同一个函数族（glyph SDF atlas）此刻存在三个独立版本**（手写旧 `_common`、手写新 sibling、生成器自己更新过的 `_common`），互不同步。
- 它产出的 CMakeLists 模板（`MobileShellHarmonyCmake` :20425-20433）是单文件玩具版，没有链接任何 `prebuilt/*.o`（场景 App 核心），配合 `dlopen(NULL)` 自查逻辑，**三条独立证据**互证这份生成器代码从未真正编译验证通过。

因此迁移不是"改一次生成"，是一条 **strangler 打击序**：先建对账地基（slice-0）→ 开门禁 + 补 ABI 参数化（slice-1）→ 逐段回灌已验证正确的 GEN-EXISTS 差异（slice-2/3）→ 处理需要设备验证的行为分叉（slice-4）→ 路由语义根修（slice-5，跨模块协调点）→ CMake 拓扑生成器化（slice-6，工作量最大）→ ABI 契约显式建模（slice-7）→ 装配管线终局切换（slice-8）。每片独立可落地可回滚，媒体解码三级缓冲（1897 行，25.3%）**全程不生成**，只做接口契约显式化。

---

## 1. 目标架构图（文字版）

```
                    ┌─────────────────────────────────────────────┐
                    │  src/core/tooling/mobile_shell_codegen.cheng │
                    │                                               │
                    │  MobileShellHarmonyGuiHostSource(opts)       │  ← 新发射单元(本蓝图产出)
                    │    ├─ prologue: NAPI module + XComponent      │     opts: {modname, libraryname,
                    │    │   双路径绑定(OBJ属性优先+OnLoad兜底)      │            emitPrebuiltObjLink,
                    │    ├─ MobileShellNativeGlesCoreSource()       │            routeSemanticExportName}
                    │    │   (先由 slice-0/2/3 刷新到与 Android    │
                    │    │    内联版本一致, 之后成为唯一权威源)      │
                    │    └─ epilogue: cheng_host_* 钩子声明表       │
                    │        (媒体/MoQ/命令桥 —— 只声明契约签名,    │
                    │         函数体留空/留 weak stub, 由适配层实现) │
                    │                                               │
                    │  MobileShellHarmonyCmakeSource(opts)         │  ← 扩展后覆盖三 .so 拓扑
                    │    ├─ cheng_gui_host: host.c + entry.cpp      │     (prebuilt scene_app_oh.o
                    │    │   + prebuilt scene objs + adapter/*.c    │      链接 + nm ABI 校验模板化)
                    │    ├─ cheng_moq_harmony (dlopen, 条件化)      │
                    │    └─ cheng_feed_harmony (dlopen, 条件化)     │
                    └───────────────────┬───────────────────────────┘
                                         │ 生成/重新生成
                                         ▼
        platform/harmony/ChengGuiDemo/entry/src/main/cpp/
        ┌───────────────────────────────┬───────────────────────────┐
        │  cheng_gui_host_gen.c (生成)   │  cheng_gui_host_adapter.c  │  ← 薄适配层(手写, 接口面
        │  = GEN-EXISTS 全量 GLES 核心   │  (手写, ADAPTER 全量)      │     = host 总账 ADAPTER 类清单)
        │  + XComponent/NAPI/vsync 骨架  │  ├─ 媒体解码三级缓冲(1897行)│
        │  + cheng_host_* 钩子签名声明   │  ├─ CHT 命令桥胶水(641行)   │
        │                                 │  ├─ C ABI 运行时桥(340行)  │
        │  重新生成 = 直接覆盖此文件      │  ├─ rawfile/asset 替换(258)│
        │  (不再有"切片+拼接"两段装配)   │  └─ 仪表/GLUE-DIM(198+157) │
        └───────────────────────────────┴───────────────────────────┘
                        │                              │
                        └──────────────┬───────────────┘
                                        ▼
                    cheng_gui_entry.cpp (手写不变, 已验证正确:
                    OBJ属性绑定/pthread轮询/NapiInit 4方法)
                                        │
                                        ▼
                    CMakeLists.txt (由 MobileShellHarmonyCmakeSource
                    生成, 覆盖当前 154 行手写拓扑; nm ABI 校验/
                    条件化 feed .so 逻辑模板化保留)
```

**"重新生成即同步"的机制性保证点**（不是口号，是四个具体机制）：
1. **单一装配步骤**：生成器直接产出完整 `cheng_gui_host_gen.c`，不再有 `build_gui_host.sh` 的"从外部快照切片 + cat 拼接 `.inc`"两段式装配（消灭 F1 的双源头漂移风险——.inc 这个"第二权威源"被淘汰，生成器源码是唯一权威源）。
2. **生成文件与手写文件物理分离**：`cheng_gui_host_gen.c`（生成，只读，重新生成直接覆盖）与 `cheng_gui_host_adapter.c`（手写，接口面=ADAPTER 清单，生成器不碰）分成两个编译单元，CMakeLists 里都编译进同一个 `.so`。任何人误改生成文件，下次重新生成会直接覆盖冲掉——这本身就是"检测手改"的机制（配合 slice-0 建立的对账脚本在 CI 里跑，能在合并前发现"生成产物 diff 非空"）。
3. **钩子签名是契约，不是实现**：`cheng_host_*` 系列函数在生成文件里只有 `extern` 声明（或弱符号占位），实现全部在适配层——签名变化（新增参数、返回类型变化）会在适配层编译时直接报错（缺函数/签名不匹配），不会静默过期。
4. **opts 参数化消灭硬编码字符串**：modname/libraryname/prebuilt 对象路径列表全部走 `opts` 字段（而非当前 :24724 那样硬编码 `"cheng_generated_harmony_host"`），生成器一次改动，两处（.cpp NAPI 注册 + CMakeLists target 名）自动保持一致，不会像现在这样"库名对不上"。

**`cheng_gui_host.c` → `cheng_gui_host_gen.c`/`cheng_gui_host_adapter.c` 的静态状态变量(`s_*`)物理拆分依据**：全文件 326 个文件作用域 `static ... s_*` 声明（306 条带初始化器 + 19 条纯数组声明 + 1 条同行双声明，函数内局部 `static` 不计入）逐条归类落盘于 `/private/tmp/claude-501/-Users-lbcheng-cheng-lang/ceaefe81-c059-4fd9-b767-3a3e460f26ea/docs/harmony-host-codegen-svars.tsv`（列：line/name/category/family/core_decl/core_hits/android_hits/note/decl_text）。归类口径不是名字猜测，是逐条实测该变量是否在生成器 `MobileShellNativeGlesCoreSource`（core 共享模板）里也有同名声明（`core_decl` 列）——有则 `GEN`（进 `cheng_gui_host_gen.c`），没有则 `ADAPTER`（进 `cheng_gui_host_adapter.c`）。实测结果 238 GEN / 88 ADAPTER：GEN 侧远超 hhm1 host census §3 六族速算表初估的 ~40（该速算表只是抽样举例，非穷举），因为窗口/EGL/GL 上下文、图集/图层缓存、`s_app_*` dlsym 到 App 核心的函数指针族、replay/ink-overlay、present/upload 计数器等都会被生成器的共享 GLES 核心引用，实际占比达 73%；ADAPTER 侧（媒体解码管线、CHT 命令桥、耐久诊断环、驱动/资源管理器句柄、3 个 Android 遗留死变量等）与 census 定性描述一致。

---

## 2. 函数级迁移账本

直接引用 `hhm1-host-census.md` 处置表（229 函数，7505 行）。四类处置原则：

| 分类 | 函数数/行数 | 迁移账本处置 |
|---|---|---|
| **GEN-EXISTS**（87 函数/3491 行，46.5%） | 已在 `MobileShellNativeGlesCoreSource` 有模板，但模板落后（F2） | **先刷新模板再切换消费**（slice-0/2/3），逐族对齐后进 `cheng_gui_host_gen.c`。不允许"适配层豁免"——豁免会让生成器模板和手写代码永久分叉，违背"重新生成即同步"的目标。 |
| **GEN-NEW**（5 函数/125 行，1.7%） | Android 侧有实现，Harmony 共享核心没有 | 模板来源明确，直接照抄，见下表逐条对照。 |
| **ADAPTER**（137 函数/3491 行，46.5%） | Harmony 专属，无 Android 对应文本，架构不同 | 给接口契约（签名/所有权/线程语境），进 `cheng_gui_host_adapter.c`，生成器**不生成实现**，只声明契约。 |
| DEAD 候选（4 条，嵌在字段/未接线导出里） | 见 census §2 | 蓝图不处理删除决策（不在"迁移"范围内），随对应 slice 顺手标注，交用户在该 slice 的 apply 阶段决定删/留。 |

### 2.1 GEN-NEW：5 个函数，Android 蓝本 file:line 逐条对照

| Harmony 函数（cheng_gui_host.c） | 行区间 | Android 蓝本（mobile_shell_codegen.cheng, `MobileShellAndroidHostSource` 区间内） | 鸿蒙差异点 |
|---|---|---|---|
| `cheng_android_set_media_surface_prepare` | 754-~790 | 同名函数体，`MobileShellAndroidHostSource` :6901-19071 区间内（按 crossref.tsv android_hits 命中） | 参数里 Android 版携带 `jobject surfaceTexture`（JNI 句柄），Harmony 版应替换为 `OHNativeWindow*`（对应 `s_surf_nimg`/OES 纹理句柄），这是**类型级差异非逻辑差异**，移植时把 JNI 句柄形参换成 OHOS 原生窗口指针形参。 |
| `cheng_android_record_media_surface_prepare` | ~800-830 | 同上区间 | 同上，surface 句柄类型替换。 |
| `cheng_android_image_texture_receipt_ready` | ~832-860 | 同上区间 | 逻辑对称，态位机（ready/pending/failed 三态）可逐字复用，仅涉及的纹理句柄类型替换。 |
| `cheng_android_video_texture_receipt_ready` | ~862-885 | 同上区间 | 同上。 |
| `cheng_android_record_audio_playback_receipt` | ~887-900 | 同上区间 | 音频态位回执，与 surface 无关，逻辑应可逐字复用（不涉及句柄类型差异）。 |
| `cheng_resolve_required_app_export` | 独立小函数 | 同上区间，`dlsym` 封装 helper | 平台无关的 dlsym 封装，逐字复用，`RTLD_NOW`/`dlopen(NULL,...)` 语义两端一致。 |

**执行方式**：这 5 个函数不逐字节 diff（Android 版本身已知比 Harmony 现状新），迁移时先用 `MobileShellAndroidHostSource` 里的实际实现文本做基底，替换 JNI 类型为 OHOS 原生窗口类型后，作为新增函数并入 `MobileShellNativeGlesCoreSource`（因为逻辑与纹理/图集缓存共享状态，天然属于 GEN-EXISTS territory 的自然延伸，见 §1 目标架构图 `cheng_host_*` 钩子模式）。

### 2.2 ADAPTER：接口契约（签名/所有权/线程语境）

按 census 六个子族给契约面，生成器 `epilogue` 只声明签名（`extern` 或 `__attribute__((weak))` 占位），适配层实现：

| 子族 | 函数数/行数 | 接口契约 |
|---|---|---|
| **MEDIA**（媒体解码三级缓冲） | 39/1897 | 契约边界 = `cheng_harmony_register_media_surfaces`/`cheng_scene_media_es_sink_frame` 等生成器 epilogue 已声明的钩子名（:24739-24744 现状为空实现占位）。所有权：解码线程（`cheng_stream_fetch_worker`/`_local_file_worker`/`_prewarm_worker`）独立 pthread，FIFO/ring/纹理池三级缓冲跨线程传递，主线程只读 `s_stream_tex` 等状态标志（`volatile` 语义已在现状代码体现）。线程语境：解码 worker 线程 → GL 上传必须切回渲染线程（现状通过 `s_stream_ready` 标志 + tick 内轮询消费，非跨线程直接 GL 调用——这条约束必须在契约注释里显式写出，否则未来改动容易误加跨线程 GL 调用崩溃）。 |
| **GLUE**（CHT 命令桥胶水） | 36/641 | 契约边界 = `ohos_host_entry.inc` 现有 36 个 `cheng_host_*` 函数签名（`int32_t(const char*, ...)` 形状为主）。所有权：入参字符串按值传入不持有跨调用生命周期（现状用局部 `char buf[]` 拷贝）。诚实失败原则（Let-it-crash）：`abort()`/`return "err:unavailable:..."` 是既定契约的一部分，**生成器契约声明必须保留这条语义**，不能被"生成器补全实现"误当作缺口去伪造功能。 |
| **RUNTIME**（C ABI 运行时桥，weak 符号） | 36/340 | 契约边界 = `build_gui_host.sh` 末尾 perl 动态加 `__attribute__((weak))` 前缀的符号表（`cheng_malloc`/`driver_c_new_string*`/`cheng_errno` 等）。**这批的真正生成侧对应物应是 `core_runtime_provider_harmony.cheng`（目前不存在）**，不是 host codegen 范畴——蓝图标注为独立缺口，不在本战役 slice 序列内处理（见风险登记册）。 |
| **REPLACED**（rawfile/asset 读取替换） | 13/258 | 生成器**已有**对应实现（`cheng_harmony_read_raw_text`/`cheng_host_read_asset` :24544-24611，用 `OH_ResourceManager_*`），契约 = 输入 rel path（`const char*`），输出 `(uint8_t* bytes, size_t len)` 或失败返回 NULL。这一族不是"新写契约"，是**直接消费生成器现货**（见 slice-2）。 |
| **GLUE-DIM**（导出但未接线的 7 符号 + 驱动接口 6 个） | 9/198 | `cheng_gui_host_begin/tick/pause/on_back/touch/set_resource_manager` 6 个是与 `cheng_gui_entry.cpp` 的内部 C 调用契约（同 .so 内直接调用，非 dlsym），必须保留在生成文件里（是驱动骨架的一部分，非适配层）。其余 7 个真孤儿（`cheng_mobile_host_android_width` 等）见 DEAD 候选，本 slice 不处理，随对应 slice 顺手标注。 |
| **OTHER** | 4/157 | 逐函数在对应 slice 现场判断，不预先归类（样本太少，强行建契约模板反而过度设计）。 |

---

## 3. 路由门去硬编码方案

**Android 侧现状核实**：`mobile_shell_codegen.cheng` 内 `MobileShellAndroidHostSource` 区间（:6901-19071）搜索路由号字面量匹配为 0——Android **没有路由门硬编码**，而是向 App 核心查询语义状态：
```
s_app_debug_state_is_video_playing = dlsym(s_app_handle, "cheng_app_debug_state_is_video_playing")
```
Host 只读"当前是否在播视频"这个已算好的布尔结果，不猜路由号；配合 Android Activity 窗口本身天然全屏（无需"哪个路由该全屏"这层判断）。

**鸿蒙侧现状**（`cheng_gui_host.c:339` `#define CHENG_ROUTE_MAITIAN_LOCAL 15`；`:3281`/`:4481` `cur_route == 14 || cur_route == 1 || cur_route == CHENG_ROUTE_MAITIAN_LOCAL`）：`CHENG_ROUTE_MAITIAN_LOCAL` 已从错误值 44 修到 15（v3e 修复，设备验证过，注释 :328-338 记录了排查过程），但 `14`/`1` 两个字面量**没有命名常量、没有来源注释**，是尚未消除的同类风险——场景路由表下次重排一定会再漂移一次，而且没有排查线索。

**方案**：不是"移植 Android 现成方案"（Android 根本没有这层判断），是**新设计**——因为 Android 全屏语境下不需要"是否该全屏播放"这个判断，而鸿蒙非全屏窗口下需要，这是鸿蒙独有的产品需求，必须由 App 核心（场景数据的唯一权威）新增一个语义导出：

```
cheng_app_debug_route_is_fullscreen_video(route_index: int32): bool
```

由场景编译器/App 核心在编译期从路由表（`unimaker-react.route-reachability.json` 或其运行时等价结构）算好，Harmony host 侧只 `dlsym` 读结果，彻底删除 `cur_route == 14/1/CHENG_ROUTE_MAITIAN_LOCAL` 整条判断链。这与 `s_app_debug_state_is_video_playing` 是同一套契约模式（App 核心算语义、host 只读），架构上一致，不是特例。

**范围标注**：新增 App 核心侧语义导出属于场景编译器/App 核心改动，**不在纯 host-codegen 迁移范围内**（跨越 `src/core/lang`/场景数据编译链，不是 `mobile_shell_codegen.cheng` 一个文件能做完的），标注为 slice-5 的**协调点**——需要用户另行确认是否与当前活跃战役（task#5 像素 1:1 / task#9 发布按钮桥）共享同一批场景编译器改动窗口，避免并发 WIP 冲突。

---

## 4. 分片打击序（strangler 模式）

每片 files/action/verify/done 独立可回滚。verify 统一含三项：**(a) 生成产物 vs 手写现状 diff 对账、(b) hvigor 编译、(c) 装机门**（装机门标注"需设备窗口"，本战役当前会话禁碰 adb/hdc，只列检查项不执行）。不touch ChengGuiDemo 文件的 slice，(b)(c) 标注 N/A 并给出理由。

### slice-0（见 §5 独立完整展开，供下一波直接开工）

### slice-1：开门禁 + opts 参数化（不改变生产行为）
- **files**：`src/core/tooling/mobile_shell_codegen.cheng`（`MobileShellValidatePlatformRenderContract` :153-167、`MobileShellHarmonyHostSource` 签名、`MobileShellHarmonyCmake` :20425-20433）；新增/扩测试 `src/tests/mobile_shell_codegen_smoke.cheng`。
- **action**：① 把 `MobileShellValidatePlatformRenderContract` 的 Harmony 拒绝路径改为可由 `opts.harmonyNativeGuiExperimental` 打开的分支（默认仍拒绝，不改变现有生产门禁行为——`unimaker-apk-build.mjs`/正式 CLI 调用不传这个 flag 就还是现状）。② 给 `MobileShellHarmonyHostSource`/`MobileShellHarmonyCmake` 加 `opts: {modname: str, libraryName: str}` 参数，替换 :24724 等处硬编码 `"cheng_generated_harmony_host"` 字符串。
- **verify**：(a) 生成产物 diff：新参数化后默认调用（不传 opts 覆盖）生成文本应与改动前逐字节相同（回归对账，防止 opts 化引入意外行为变化）；(b) `cheng system-link-exec` 编译 `mobile_shell_codegen.cheng` 本体通过、`mobile_shell_codegen_smoke.cheng` 测试绿；(c) N/A（不产出任何 ChengGuiDemo 文件改动）。
- **done**：门禁可控开关存在且默认关闭；`opts.modname="cheng_gui_host"` 时生成文本里模块名/库名与 ChengGuiDemo 实际 CMakeLists.txt 期望值（`cheng_gui_host`）逐字匹配。

### slice-2：REPLACED 族消费生成器现货（rawfile/asset 读取）
- **files**：`cheng_gui_host.c`（:1242-1416，`cheng_ohos_read_rawfile_checked`/`cheng_mobile_host_read_glyph_sdf_pixel_asset`/`cheng_mobile_host_read_scene_data_asset`）对照生成器 `cheng_harmony_read_raw_text`/`cheng_host_read_asset`（:24544-24611）。
- **action**：把生成器现货文本抽取为独立小文件（如 `cheng_gui_host_adapter_assets.c`，本 slice 手工抽取，slice-8 收编进自动生成），逐字节比对手写版与生成器版的 `OH_ResourceManager_*` 调用序列，若语义一致则手写版直接替换为生成器文本（消灭一份重复实现）；若手写版有生成器没有的错误处理（如现状可能有的边界检查），保留差异并记录到本 slice 的 apply 说明里，不擅自删。
- **verify**：(a) 用两份文本各自读同一批 rawfile（`glyph_sdf_pixels.bin`/`scene_data.bin`）对比返回字节流 + 长度是否一致（本地 clang 编译两个独立小程序跑，不需要 OHOS 设备，`OH_ResourceManager_*` 在桌面不可用需要 stub——若无法桌面验证，退化为纯文本逐行 diff + 人工审阅，标注"未做运行时验证仅静态审阅"）；(b) hvigor 编译 ChengGuiDemo（替换后的 `cheng_gui_host.c` 必须能通过原有 hvigor 原生构建，无新增头文件依赖）；(c) 需设备窗口——装机后验证首帧仍能正确读到 glyph SDF 图集与 scene_data（现有像素 1:1 战役的验证口径可复用）。
- **done**：13 个 REPLACED 函数中 rawfile 读取相关的收敛为对生成器文本的直接消费（不是独立平行实现），窗口注册/尺寸查询等非资源读取部分维持现状（本 slice 范围仅资源读取）。

### slice-3：GEN-EXISTS 三向分叉回灌（glyph SDF atlas 族为代表）
- **files**：`cheng_gui_host.c`（:5215 `cheng_android_drop_all_layer_caches`、:5443 起 `cheng_mobile_host_upload_glyph_sdf_atlas_common`、v3c 新增的 sibling 函数）对照生成器两处版本（`MobileShellAndroidHostSource` :15984/:15742，`MobileShellNativeGlesCoreSource` :23228/:22988）。
- **action**：以生成器 :23228 的 `metadataOnly` 参数化版本为终局目标，把手写侧的 `_common` + v3c sibling 两个函数合并为生成器风格的单一参数化实现（`pixels == NULL` 分支即 sibling 语义），消灭"三个独立版本"分叉。这是唯一一处要求**先把生成器模板刷新对齐 Android 内联版本**（`core_diff_real.txt` 范围）、再把手写侧收敛到刷新后模板的 slice——顺序不可颠倒（先刷新模板，后收敛消费；否则会把手写侧收敛到一个即将被替换的旧模板上，白做一次）。
- **verify**：(a) diff 对账：合并后的实现与 v3c 证据文件里记录的三组测试用例（`v3c-hostcb5-test.c` 的 metadata-without-pixel-upload / legitimate-call / mismatched-cache 三个场景）逐一重跑，行为不变；(b) hvigor 编译；(c) 需设备窗口——装机后验证 glyph 渲染无回归（复用像素 1:1 战役 oracle）。
- **done**：`s_glyph_sdf_*` 系列缓存只有一套读写实现，`drop_all_layer_caches` 触发点与生成器一致，三方分叉清零。

#### slice-3 执行结果（2026-07-10，如实记录）

行号复核（当前 HEAD）：android=:15984/:15742，core=:23228/:22988，host `_common`=:5443、`_metadata`（v3c sibling）=:5682、`drop_all_layer_caches`=:5215——与 M1 复核清单第 2 条一致，未再漂移。`drop_all_layer_caches` 逐行核对与生成器一致（唯一差异是 Android 独有的 `cheng_android_invalidate_cached_compositor_frame()` 调用，host 侧用 replay-list 重置替代，已有注释说明，属于蓝图允许的 Harmony 适配，未改动）。

真实三向分叉只发生在 `_common`/`_metadata`：手写旧 `_common`（无 `metadataOnly` 参数，只管像素上传）+ 手写新 sibling `_metadata`（v3c/5b30e26929，独立 180 行实现，metadataOnly 安全校验只查 `pixel_count` 一个字段，**静默允许** `width/height/font_atlas_id/spread_px/px_range` 在没有像素重传的情况下改变）+ 生成器已演进版（`ee9f211a3`，早 v3c 近 2 天，单一 `_common` + `metadataOnly` 参数化，六字段全部要求与缓存一致，不一致直接 abort）。已回灌：采纳生成器版本，`_common` 合并为单函数，`_metadata` 退化为 3 行 wrapper。用独立 C harness（非设备，结构体/常量/辅助函数逐字节摘自 host 源）实测 v3c 三场景：legitimate-call 与 metadata-without-pixel-upload 两版本行为一致（无回归）；mismatched-cache 场景实测坐实回灌前 host 存在真实缺陷——旧实现会静默接受一次 4×4→8×2（像素总数不变但布局改变）的"图集 reflow"声明而不 abort，新实现正确 abort。生成器（`mobile_shell_codegen.cheng`）未改动，Android 生成产物字节恒等（无代码路径触碰）。

发现一条超出蓝图原定义范围的第 4 条分叉，未静默合并：生成器另有 `d12df89c6`（早 v3c 约 2 小时）把 `cheng_android_find_glyph_sdf_glyph`/`_run` 从线性扫描改成 O(1) 数组下标（`glyph_id == index+1` 强约束 + `run` 按 `glyph_run_id-1` 槽位存储），与 metadataOnly 无关，是独立性能重构；host 的 find 函数仍是线性扫描，未移植（移植需同时改 find 函数，扩大变更半径且不在本 slice files 清单内），标记为独立 follow-up。

补丁与证据：`/private/tmp/claude-501/-Users-lbcheng-cheng-lang/ceaefe81-c059-4fd9-b767-3a3e460f26ea/scratchpad/m2-slice3.patch`（增量，需先 apply m2-slice1.patch/m2-slice2.patch，仅改 `cheng_gui_host.c`）+ `m2-slice3-evidence.md`（双向 diff 表 + harness 三场景 pass/fail 对照）。verify(b) 用 OHOS 交叉编译器 `-fsyntax-only -D_GNU_SOURCE` 语法检查通过（0 error，patch 前后表现一致）+ `mobile_shell_codegen_smoke.cheng`（未改动）rc=0 绿；verify(c) 装机门本会话禁 adb/hdc，未执行，清单已列入证据文件。

### slice-4：帧驱动模型决策（F5，行为敏感，需设备窗口）
- **files**：`cheng_gui_entry.cpp`（:43-68 `RenderLoop`）对照生成器 `OnVSync`/`cheng_harmony_request_frame`（:24753-24785）。
- **action**：排查 pthread 轮询回退的历史退化根因（现状代码注释承认"未查明就退回轮询"）——先在隔离分支上换回事件驱动 vsync 实现，用同一批端到端指标（endurance report 的 `p50_ms`/`p95_ms`/`stall_n`）跟当前轮询版本对比，而不是凭猜测判定"vsync 有问题"。
- **verify**：(a) diff 对账：vsync 版本生成产物与手写轮询版本的接口契约（`cheng_gui_host_tick(dt)` 调用形状）一致，只替换调度机制不改驱动 API；(b) hvigor 编译；(c) **必须设备窗口**——这是本战役里唯一一个此前已经在真机上观测到过退化（~10fps）的分支，不允许仅凭桌面/静态验证判定过。
- **done**：要么排查出根因并换成事件驱动（符合 CLAUDE.md 移动端异步事件驱动原则），要么排查后确认是真机 vsync 时序限制导致必须保留轮询，两种结论都要把根因写进代码注释（当前注释只说"退化过"没写为什么），不允许维持"未查明就回退"的现状进入生成器模板。

### slice-5：路由语义去硬编码（跨模块协调点，见 §3）
- **files**：App 核心侧新增导出（场景编译器/`src/core/lang` 范畴，具体文件由该次协调另行确定，不在本文档权限范围内指定）+ `cheng_gui_host.c` 消费端（:3280-3281/:4479-4481）。
- **action**：新增 `cheng_app_debug_route_is_fullscreen_video(route_index)` 语义导出（§3 方案），host 侧替换字面量判断为该导出的 dlsym 调用。
- **verify**：(a) diff 对账：新语义导出的返回值与当前 `14||1||CHENG_ROUTE_MAITIAN_LOCAL` 判断在现有 46-route 场景下逐路由核对一致（用 `unimaker-react.route-reachability.json` 全量路由跑一遍）；(b) hvigor 编译；(c) 需设备窗口——装机后验证麦田/胡广生两卡全屏播放判断不回归（复用 `p2p_twocard_home_verified` 已有验证口径）。
- **done**：`cheng_gui_host.c` 里不再有任何裸路由号字面量参与全屏判断逻辑；**执行前需与当前活跃场景编译改动（task#5/task#9）确认窗口不冲突**（本 slice 标注为"需用户另行拍板启动时机"，不在本蓝图自动授权范围）。

#### slice-5 执行记录（2026-07-10，如实记录）

**用户拍板**：own-IP 真发现（原本独立于 §3 路由方案的第三处硬编码，recon 时发现 `cheng_gui_host.c` 自己的注释把它记进了 slice-5 follow-up）**并入本 slice**，不拆 5a/5b。

**真实落点勘正**：§3 原文把新增语义导出的落点留白为"场景编译器/`src/core/lang` 范畴，具体文件由该次协调另行确定"——实测确认真实落点是 `ts-csg/scripts/scene-runtime-smoke-source.mjs` 的 `emitSceneMobileRuntimeSource`（**不是** `ts-csg/src/csg-web-materializer.ts` 的 `emitChengSource`，后者是 `--retained-scene-only` 关闭时才走的旧 dump 路径，生产构建始终传 `--retained-scene-only`，两个文件各有一份同名 `cheng_app_debug_route_index` 独立实现，只有 `scene-runtime-smoke-source.mjs` 那份是真正编进 App `.so` 的）。落地时复用该文件里已有的 `routeIndexById`（`Map<routeId, routeIndex>`，生成期真实路由表）+ 与 prewarm 热列表相同的 canonical 匹配惯用法（`routeId === "home_content_detail_open" || routeId.startsWith("home_content_detail_open_")`），新增 `content_detail`（legacy 单路由，恒为全屏视频）一并纳入，`home_image_detail_open`(_*) 保持排除。

**三处硬编码处置**（v5 fan-out 落地后，`cur_route==1` 与 `CHENG_ROUTE_CONTENT_DETAIL_FIRST/LAST` 已合并成范围检查，`CHENG_ROUTE_MAITIAN_LOCAL` 已是历史）：
1. `cur_route == 1` + `CHENG_ROUTE_CONTENT_DETAIL_FIRST/LAST`（`cheng_gui_host.c` 两处判断点）→ 改 dlsym `cheng_app_debug_route_is_fullscreen_video(routeIndex)`；符号缺失（旧 `.o`）在 App 加载时响亮 log 一次并把函数指针留 `NULL`，调用点 `cheng_gui_host_route_is_fullscreen_video` 统一 fail-safe 到"非全屏视频"，不静默。
2. `CHENG_GUI_HOST_OWN_IP "192.168.1.4"` → `getifaddrs()`（OHOS sysroot `native/sysroot/usr/include/ifaddrs.h` 已确认，标准 bionic 派生形状，`<arpa/inet.h>` 已引入 `<netinet/in.h>`，只需新增 `#include <ifaddrs.h>`）枚举非 loopback IPv4；懒加载解析一次（首次调用即缓存，等价"启动时解析一次"，本 slice 不做热更新）；多接口用真实 netmask 按位与判同子网，优先选与被比对 peer 同子网的接口，否则首个非 loopback；`getifaddrs()` 失败或零个非 loopback 接口都响亮 log（`ANDROID_LOG_ERROR`）+ `own_ip_count` 留 0，比对函数 fail-safe 返回"不是本机"（保守走 QUIC 网络 dial，不静默本地化）。

**Android 侧对照**（grep `mobile_shell_codegen.cheng` 全量核实，非猜测）：`getifaddrs\|ownIp\|selfIp\|deviceIp` 类模式 0 命中，路由号硬编码模式（`== 14/15/16` 一类）0 命中——Android 侧**没有同款 peerHost-vs-own-IP 判定**，本地/网络流的区分走完全不同的机制（`cheng_android_is_local_file_media_uri`，靠内容自身 asset URI scheme 识别是否本机打包资源，不比对 IP）。§3 原文已核实过 Android 也没有路由全屏门（走 `cheng_app_debug_state_is_video_playing` 语义查询）。两处均确认**无需生成器补丁保持双端一致**——不是遗漏，是架构本就不同。

**verify 结果**（隔离树 `git archive HEAD | tar -x`，未碰主树；HEAD 在执行期间被并发 op-lane 会话两次推进 `404ad4251→7d49dfad8→d7dccc56a`，`git apply --check`/`patch --dry-run` 在每次漂移后重验仍 rc=0，两个补丁文件与最终主树 `d7dccc56a` 保持干净可应用）：
- **(a) 结构门**：`unimaker-one-click.mjs --stop-after materialize --retained-scene-only`（pinned 双视频 fixture `scripts/unimaker-fixtures/unimaker-pwa-content-snapshot.json`）编辑前后各跑一次，`routes=47/routeEdges=295/mediaPlaybackSlots=27/mediaControlActions=180` 完全一致，且 `unimaker-react.scene.csgc`/`unimaker-react.route-reachability.json` 逐字节相同（`/usr/bin/cmp`）——本 slice 只新增一个调试导出函数，不触碰任何结构化材料生成路径，符合预期。
- **oracle 基线重生成**（③）：用当前 fixture 跑出的 `unimaker-react.route-reachability.json` 确认 `home_content_detail_open_vid_hgs`=15、`home_content_detail_open_vid1`=16、`home_image_detail_open_img1`=17，`reachable=47/47`；生成的 `cheng_app_debug_route_is_fullscreen_video` 函数体精确覆盖 `{1, 15, 16}`，不含 17——与 host.c 原硬编码语义（`==1 || [15,16]`）逐路由核对一致。
- **mutation①**（路由表增删一个 content-detail 路由）：从 pinned fixture 移除 `vid1` 内容后重跑材料化，路由总数 47→46，`home_content_detail_open_vid1`（原 16）消失，`home_image_detail_open_img1` 索引从 17 前移到 16；生成函数体自动变为 `{1, 15}`（16 不再是视频，正确排除新占据该索引的图片路由）——导出值随路由表联动，无需碰任何硬编码。
- **mutation②**（getifaddrs 无地址场景）：`getifaddrs`/`freeifaddrs` 用同名重定义方式在独立宿主编译单元里逐行复刻 `cheng_gui_host.c` 的三个函数（`/usr/bin/diff` 确认除注释外零逻辑差异），三场景全绿——① `getifaddrs()` 硬失败→响亮 log + `own_ip_count=0` + 比对结果=非本机（网络 dial）；② 只发现 loopback 接口→同样响亮 log + fail-safe；③ 双非-loopback 接口（`10.0.0.5/24` 先发现、`192.168.1.4/24` 后发现）+ 与 `192.168.1.0/24` 子网的 peer 比对→正确选中同子网的 `192.168.1.4`（非"先发现优先"），无子网匹配的 peer 正确回退到首个发现接口。
- **(b) hvigor**：`DEVECO_SDK_HOME=/Applications/DevEco-Studio.app/Contents/sdk` + `hvigorw --mode module -p product=default -p module=entry@default assembleHap --no-daemon`，隔离树对齐主树 `d7dccc56a`（含 slice-7 新落地的 `cheng_gui_host_adapter_contract.h` 契约头，本 slice 的改动与其无命名冲突——新函数走独立 `cheng_gui_host_route_is_fullscreen_video`/own-ip 系列命名，未使用契约头里任何 typedef）**BUILD SUCCESSFUL**（7s 量级），产出签名 HAP + `libcheng_gui_host.so`；`llvm-nm` 确认新增的四个 static 函数与五个 static 变量都在产物里，`getifaddrs`/`freeifaddrs` 正确表现为待动态解析的 `U` 符号。
- **(d) OHOS clang**：`aarch64-unknown-linux-ohos-clang --sysroot=.../native/sysroot -target aarch64-linux-ohos -D_GNU_SOURCE -fsyntax-only -Wall -Wextra` 对 `cheng_gui_host.c` 本体，编辑前后均 `rc=0`；`-Wall -Wextra` 下与本次改动相关的符号（`own_ip`/`fullscreen_video`/`ifaddrs`）零警告。
- **(c) 装机门**：本会话未碰 `adb`/`hdc`，两卡播放 + own-IP 真机判定验证留设备窗口，如实标注未执行。

**已知非阻塞跟进项**：`cheng_gui_host_adapter_contract.h`（slice-7 新契约头，`MobileShellHarmonyAdapterContractText` 生成，"APP-EXPORT" 表当前 75 条）尚未收录本 slice 新增的 `cheng_app_debug_route_is_fullscreen_video` dlsym 符号——该表以 `cheng_gui_host.c` 当前 dlsym 调用为权威源自动生成，下次 slice-7 侧重新生成会自然收录第 76 条，不需要本 slice 手动改生成的头文件（本身标注"GENERATED, Do not edit by hand"，且改动权属于 slice-7 的活跃工作）。

**产出**：补丁 `m1-slice5-scene-runtime-source.patch`（`ts-csg/scripts/scene-runtime-smoke-source.mjs`，新增语义导出）+ `m1-slice5-cheng-gui-host.patch`（`cheng_gui_host.c`，三处硬编码消费端改造）+ 证据 `m1-slice5-evidence.md`，均落 `/private/tmp/claude-501/-Users-lbcheng-cheng-lang/ceaefe81-c059-4fd9-b767-3a3e460f26ea/scratchpad/`。

### slice-6：CMake 拓扑生成器化（F3，工作量最大）
- **files**：`src/core/tooling/mobile_shell_codegen.cheng`（`MobileShellHarmonyCmake` 扩展）；对照 `platform/harmony/ChengGuiDemo/entry/src/main/cpp/CMakeLists.txt`（153 行，三 `.so` 拓扑）。
- **action**：把 CMakeLists.txt 里的三个结构性模式模板化为生成器可参数化输出：① `cheng_gui_host` 主库的 `prebuilt/*.o` 链接列表（opts 传入对象文件名数组）；② `cheng_moq_harmony`/`cheng_feed_harmony` 的 dlopen 隔离 `.so` 模式（含 `nm` ABI 校验 `execute_process` 块、`EXISTS` 条件化优雅降级）抽成可复用的生成器函数（一个函数生成一个"隔离 .so 目标"的 CMake 片段，被两处调用）；③ link flags（`-Wl,-Bsymbolic-functions -Wl,--export-dynamic`）作为 opts 字段而非硬编码。
- **verify**：(a) diff 对账：生成的 CMakeLists.txt 与当前手写 153 行逐段比对（允许注释文本差异，结构性 target/link/条件判断必须一致）；(b) hvigor 编译——**这是第一个直接替换 CMakeLists.txt 文件本体的 slice，编译验证权重最高**；(c) 需设备窗口——装机验证三 `.so` 全部正确打包进 HAP、`cheng_moq_harmony`/`cheng_feed_harmony` 的 dlopen 运行时挂载不受影响。
- **done**：CMakeLists.txt 由生成器产出（可重新生成覆盖），三 `.so` 拓扑（含 ABI 校验、条件化 feed 库）与当前生产行为零回归。

### slice-7：ADAPTER ABI 契约显式建模（GLUE 641 行族）
- **files**：`src/core/tooling/mobile_shell_codegen.cheng`（新增 `MobileShellHarmonyAdapterContractText`，只声明签名不生成实现）；对照 `ohos_host_entry.inc`（728 行）现有 36 个 `cheng_host_*` 函数。
- **action**：把 §2.2 GLUE 族的函数签名（不含函数体）搬进生成器，生成一份 `.h` 头文件（`cheng_gui_host_adapter_contract.h`）声明所有 `cheng_host_*` 命令桥函数原型，适配层 `.c` 实现必须 `#include` 该头文件（签名不匹配直接编译报错，充当自动化契约校验）。
- **verify**：(a) diff 对账：生成头文件里的签名与 `ohos_host_entry.inc` 现有 36 个函数逐一比对一致；(b) hvigor 编译（适配层实现文件 include 新头文件后必须无警告编译通过）；(c) N/A（本 slice 只加编译期契约校验，不改变运行时行为，不需要装机验证，但建议随下一个有装机验证的 slice 顺带确认无回归）。
- **done**：命令桥函数签名变更（未来场景 ABI 演进）会在适配层编译期直接报错，不再可能出现"生成器契约名单与实际实现偏差"（census §4 已发现的两个不存在符号 `cheng_mobile_host_present`/`cheng_mobile_host_end_offscreen_capture` 契约漂移问题，本 slice 顺手勘正）。

#### slice-7 执行勘误（2026-07-10，如实记录）

`ohos_host_entry.inc` 是冻结死文件，不是权威源：重 grep 实测 990 行（非 728）、25 个 `cheng_host_*` 定义（非 36）；当前 `cheng_gui_host.c`（7739 行）有 **29** 个 `cheng_host_*` 定义，比 `.inc` 多 4 个（`cheng_host_open_content_location`/`cheng_host_profile_asset_action_submit`/`cheng_host_profile_bio_did_import`/`cheng_host_social_groups_create`）。契约以 `cheng_gui_host.c` 为唯一权威源生成，`.inc` 的 25/36 两个数字均已作废，不再作为对账基线。29 个定义中 1 个（`cheng_host_extract_rawfile_to_cache`）是 `static` 内部 helper（仅被同文件 `cheng_host_publish` 调用），不是适配层对外 ABI 面——非 static 的 28 个进 GLUE 表，这 1 个在头文件里留注释说明为何不声明（声明会与其 `static` 定义冲突，直接打断编译）。

`MobileShellHarmonyAdapterContractText()` 落地在生成器，输出两张独立表（不是原方案设想的单一 GLUE 表）：
- **GLUE**（28 条）：`extern` 声明 host.c 定义、适配层/生成 App 代码调用的函数——这条方向的契约有真正的编译期牙齿：host.c `#include` 本头文件后，任何一处签名漂移都是硬编译错误（`conflicting types`），不是运行时才发现。
- **APP-EXPORT**（75 条，原方案未覆盖，本次补齐）：反方向——App 核心导出、host.c 用 `dlsym(s_app_handle/RTLD_DEFAULT, "name")` 软链接解析的符号（含 `cheng_scene_media_es_content_matches`/`es_invalidate`/`es_rotation`、`cheng_app_debug_*` 51 个诊断计数器、`cheng_mobile_host_runtime_*` 引导族等），host.c 全量 `dlsym(` 调用点逐一 grep 收口。这条方向**天生不能靠编译器抓 mutation**——`(TYPE)dlsym(...)` 里的显式类型转换在 C 语义上本就会压制任何指针类型不匹配诊断，不是本次实现的局限，是 dlsym 软链接这个设计选择本身的代价（host.c 需要继续兼容未带某个导出的旧 scene 构建，换成硬 `extern` 会破坏这个前向兼容性）。头文件把这 75 个符号各自的函数指针类型收敛成生成器里的单一具名 `typedef`（`cheng_gui_host_contract_<name>_fn`），价值是消灭"host.c 里散落的本地 typedef 互相静默漂移"这一类 bug，不是提供编译期签名报错。

两个符号从 done 条件移除：`cheng_mobile_host_present`/`cheng_mobile_host_end_offscreen_capture` 在当前 `cheng_gui_host.c` 里 grep 零命中，是生成器 GEN 侧独有、host.c 未消费的符号，性质是 slice-3/slice-6 的 GEN 收敛项，不是本 slice 的 ADAPTER 签名漂移，本次勘误移除，归其余 slice 跟进。

picker `result_mode` 值域重新逐端 grep（原方案沿用 recon 笔记的"7 值"，undercounts by one）：Android 侧值域不能只看 `chengFilePickerPayload` 的 7 分支 switch——`"qr-text"` 在到达该 switch **之前**被外层 `onActivityResult` 特判拦截（`mobile_shell_codegen.cheng` ~6560），不会出现在 switch 里；Harmony 侧 `cheng_gui_host_file_picker_deliver`（`cheng_gui_host.c` ~7238-7344）同样在自己的 7 分支之外单独特判 `"qr-text"`。真实闭集是 **9 个状态**（`""` 空载荷 + 8 个具名值：`uri`/`name`/`text`/`product-csv`/`data-url`/`data-url-array-append`/`media-selection`/`qr-text`），两端完全一致（无漂移，只是原方案的值域清单本身少数了一个）。C 字符串参数编译期查不出值域，头文件只固定签名；值域对账落到 `tools/harmony_adapter_contract_diff.sh` 第三段（动态解析两侧源码里的字面量集合，逐条列 `ONLY_ANDROID`/`ONLY_HARMONY`/`BOTH`）。

`publish_trace` 三点 hilog 埋点（`t_pub0`/`t_pub1`/`t_pub2`）确认不进本 slice 的自动化范围：这是运行时日志字段名字符串契约（§7 验收定义人工核对项），不是编译期 ABI 签名，头文件注释里已注明分工边界，避免和 GLUE/APP-EXPORT 两张表混在一起。

**verify 结果**（隔离树 `git archive HEAD | tar -x`，未碰 `platform/harmony/` 任何文件）：(a) `tools/harmony_adapter_contract_diff.sh` 三段对账全绿——GLUE 28/28、APP-EXPORT 75/75（含 `int`/`int32_t` 等价类型归一化）、PICKER 9/9 两端一致（脚本从生成器/`.c` 源码动态静态抽取，不依赖硬编码行号，也不需要跑 cheng 编译器）；(b) 编译期报错验证：用 OHOS 原生工具链（`$DEVECO_SDK_HOME/default/openharmony/native/llvm/bin/aarch64-unknown-linux-ohos-clang --sysroot=.../native/sysroot -target aarch64-linux-ohos -c cheng_gui_host.c`）在隔离树对 `cheng_gui_host.c` 做 `-c` 编译（不改本体，只用 deferred 1 行 `#include` patch 临时接线）：基线（未 mutate）`rc=0` 产出真实 `.o`；故意把 `cheng_host_video_paused` 的返回类型从 `int32_t` 改成 `void` 后重编，`rc=1` 且报 `conflicting types for 'cheng_host_video_paused'`（GCC/Clang 标准冲突声明诊断）——契约确认有真牙齿；(c) 生成器 smoke：`cheng.stage3 system-link-exec --in:src/tests/mobile_shell_codegen_smoke.cheng --target:arm64-apple-darwin` 编译+运行 `mobile_shell_codegen_smoke ok`（`rc=0`），且 harmony-experimental 导出路径实际写出的 `cheng_gui_host_adapter_contract.h` 与生成器源码静态抽取预期逐字节相同（`/usr/bin/diff` 确认）。★对抗复核勘误：实施期间并发 vsync v2 落地（d677fd530 给手写 CMakeLists 加 `native_vsync`）曾使该 smoke 在主树短暂变红（slice-6 生成器未同步逐字节断言挂，复核员三处独立重跑锁定），已由 481f3c136 补 1 行同步修复；本 verify(c) 的绿是修复后在含 slice-7 补丁的主树上重跑实测。遗留 follow-up：smoke 对 `cheng_gui_host_adapter_contract.h` 本体零断言覆盖，契约生成逻辑暂无自动化回归门禁。

补丁与证据：`/private/tmp/claude-501/-Users-lbcheng-cheng-lang/ceaefe81-c059-4fd9-b767-3a3e460f26ea/scratchpad/slice7-main.patch`（生成器新函数 + 写文件接线 + 文件数计数 +1 修正 + 新对账脚本，均不含 `platform/harmony/` 任何文件）+ `slice7-deferred-include.patch`（1 行，仅供隔离树临时验证用，主补丁不含，未申请落地授权）+ `slice7-evidence.md`（三段对账原始输出 + mutation 编译日志 + smoke 编译日志）。

### slice-8（终局）：装配管线切换，消灭 build_gui_host.sh 两段式装配
- **files**：`platform/harmony/ChengGuiDemo/build_gui_host.sh`（2098 行，废弃）、`ohos_host_entry.inc`（728 行，废弃，内容已在 slice-1~7 期间逐步搬进生成器/适配层）、新增 `cheng_gui_host_gen.c`/`cheng_gui_host_adapter.c` 物理分离产物（见 §1 目标架构图）。
- **action**：确认 slice-1~7 已覆盖 `ohos_host_entry.inc` 全部 728 行内容（GEN 部分进生成器，ADAPTER 部分进适配层文件）后，把 `mobile-shell export --emit-harmony` 接入 ChengGuiDemo 的 hvigor 前置构建步骤（`hvigorfile.ts` 或等价前置脚本，§ generator 勘察第 5 节选项 2），生成产物直接落地 `cheng_gui_host_gen.c`，废弃 `build_gui_host.sh`/`ohos_host_entry.inc`。
- **verify**：(a) 生成产物与 slice-7 结束时的 `cheng_gui_host.c` 逐函数 diff 应为空（除物理文件拆分外零行为变化）；(b) hvigor 全绿；(c) 需设备窗口——完整装机+两卡+播放+发布+oracle 双端标记验证（即 §6 验收定义）。
- **done**：`cheng_gui_host.c` 单文件不复存在，替换为生成文件+适配层文件两个物理独立的产物；重新生成即覆盖生成文件不影响适配层；`build_gui_host.sh`/`ohos_host_entry.inc` 从仓库移除（或标记废弃保留作历史参考，由用户决定）。

---

## 5. slice-0 完整展开（供下一波直接开工）

**目标**：零风险建立"生成器产物 vs 手写现状"可重复对账地基 + 刷新 GLES 共享核心模板到与 Android 内联版本一致，为 slice-3 的三向分叉回灌打好前提。**不改动 ChengGuiDemo 任何文件，不触发门禁开关，不需要设备窗口。**

- **files**：
  - 读/改：`src/core/tooling/mobile_shell_codegen.cheng`（`MobileShellNativeGlesCoreSource` :20435-24403）
  - 新增：`tools/harmony_gles_core_diff.sh`（对账脚本，固化 census 用过的 `crossref.tsv` 方法学：提取 `MobileShellAndroidHostSource` 与 `MobileShellNativeGlesCoreSource` 两段生成器源文本，按函数名/宏名做集合对比，输出「仅 Android 有」「仅 core 有」「两边都有但文本不同」三类清单）
  - 只读参考：`src/tests/mobile_shell_codegen_smoke.cheng`（确认现有测试覆盖面，不新增用例，除非刷新后发现测试断言的字面量需要同步更新）

- **action**：
  1. 跑 `tools/harmony_gles_core_diff.sh`（新写），产出当前基线三类清单（预期复现 census 已发现的 `core_diff_real.txt` 13761 行差异，但按函数级归类，可读性优于原始 diff）。
  2. 对「仅 Android 有」清单逐条判断：属于 GLES 绘制/图集/缓存核心逻辑的（不涉及 JNI/Android 专属类型），原文本搬进 `MobileShellNativeGlesCoreSource`；涉及 JNI 类型的（如 §2.1 表格的 5 个 GEN-NEW 函数）本 slice **不处理**，留给 §2.1 单独处理（因为需要类型替换判断，不是机械搬运）。
  3. 对「两边都有但文本不同」清单（如 glyph SDF atlas 族，:23228 vs :22988 两处版本已知不同）逐条判断是否为纯粹的独立演进增量（如 `metadataOnly` 参数化）——若是，采用 Android 内联版本（更新）覆盖 core 版本；若发现语义冲突（同一函数两边逻辑真的分叉，不是简单的"一边没更新"），本 slice **不处理**，标记进 slice-3 处理清单（这类冲突需要结合 v3b/v3c 证据人工判断，不是机械覆盖）。
  4. 刷新后重跑对账脚本，确认「两边都有但文本不同」清单里机械可覆盖的部分清零，只剩需要人工判断的冲突项（预期数量远小于 13761 行，多数差异是纯增量）。

- **verify**：
  - (a) **生成产物 vs 手写现状 diff 对账**：这是本 slice 的核心产出本身——对账脚本跑通、输出的三类清单文件落盘（如 `/tmp/harmony_gles_core_diff_report.txt`），人工审阅确认归类合理（机械覆盖 vs 留待 slice-3 判断的边界划分正确）。
  - (b) **hvigor 编译**：N/A——本 slice 不改动 `platform/harmony/` 任何文件，不触发 hvigor。改动仅限 `mobile_shell_codegen.cheng` 一个编译器域文件，验证方式是该文件自身能通过 `cheng system-link-exec` 编译（编译器域构建，非 op-lane/移动端构建）+ `mobile_shell_codegen_smoke.cheng` 现有测试跑绿（若刷新后某条断言因文本变化而失败，需要判断是断言该更新还是刷新引入了非预期变化）。
  - (c) **装机门**：N/A——不产出任何鸿蒙侧产物，无需设备窗口。

- **done**：
  - `tools/harmony_gles_core_diff.sh` 落盘且可重复运行（后续每个涉及 GEN-EXISTS 的 slice 都复用它做 (a) 对账）。
  - `MobileShellNativeGlesCoreSource` 与 `MobileShellAndroidHostSource` 内联版本的机械性差异（纯增量、无类型/语义冲突的部分）清零，`core_diff_real.txt` 量级的 13761 行差异应大幅收窄（具体收窄到多少行取决于实际执行结果，本蓝图不预先捏造数字，执行后如实报告）。
  - 剩余差异清单（GEN-NEW 5 函数 + 语义冲突项）明确移交 §2.1 / slice-3，不遗留在本 slice。
  - `mobile_shell_codegen_smoke.cheng` 保持绿色（或明确记录哪些断言因刷新而更新、为什么更新是对的）。

### 5.1 slice-0 执行结果（2026-07-10, 如实记录，未预先设定数字）

跑 `tools/harmony_gles_core_diff.sh`（函数/宏名精确到花括号平衡定位，非行级 diff）在当前 HEAD（`8d3e7ed8a`）上的结果：android 侧 438 个定义（365 函数+73 宏）、core 侧 164 个定义（97 函数+67 宏）。三类清单：仅 Android 有 282、仅 core 有 8、两边都有但文本不同 25、两边一致 131。**结论与 §5 action 2/3 预设的"机械覆盖"方向不同，逐条人工核验后如实报告：本轮 0 处机械覆盖**，原因分两条，均已逐条验证（过程见 `both_diff.tsv`/`only_android.tsv`，可重放）：

1. **action 3(「两边都有但文本不同」25 项)**：逐条读取实际 diff 内容（不是只看差异行数），25 项里 23 项的唯一差异是 `CHENG_HOST_LOG_ERROR`/`CHENG_HOST_LOG_INFO`（core 侧，平台无关钩子宏）vs `__android_log_print(...)`（android 侧，Android 直调）——这不是"core 落后"，是**架构上正确的分叉**：core 走 `cheng_host_*` 钩子抽象（Harmony 消费方式），Android 内联版本本来就不走这套钩子（gen-recon 已确认 `cheng_host_egl_window_surface` 在 android 区间命中 0 次）。若机械覆盖会把 core 已经做好的平台抽象**倒退**回硬编码 Android 调用，Harmony 侧编不过（`__android_log_print`/`ANativeWindow`/`JNIEnv` 在 OHOS 构建里不存在）。另外 2 项（`cheng_android_gpu_ensure` 的 `CHENG_HOST_WINDOW`/`cheng_host_egl_window_surface` vs `ANativeWindow*`/`eglCreateWindowSurface`，`cheng_android_gpu_draw_media_surface_texture` 的 `cheng_host_media_texture_pump` 钩子 vs JNI 直调 `cheng_android_media_texture_pump_decoder`）同属此类，且验证了 `cheng_mobile_host_upload_glyph_sdf_atlas_common`（blueprint 原认定"需要先刷新"的重点函数）在 core 侧**已经**带 `metadataOnly` 参数化（`int metadataOnly = pixels == NULL;` 逐字节确认在场，:23228 起），与 hhm1 census 的 F2 结论（"core 落后于 Android 内联版本"）在**函数级**不成立——F2 的 13761 行原始 diff 是未按函数对齐的整段文本 diff，被「仅 Android 有」的 282 项大量插入内容主导，不代表共享函数本身过期。剩余 2 项纯粹是 android 侧多出的制表符缩进（无实质差异）。
2. **action 2(「仅 Android 有」282 项)**：逐类过筛（JNI 原生方法族 `native_*` ~90 项 JNIEnv/jobject 签名、`cheng_android_aes_*`/`cheng_android_es_*`/`cheng_android_*decode*` 媒体解码管线 ~60 项、`libc_*`/`cheng_*` C ABI 运行时桥 ~40 项、`cheng_host_*` 命令桥 ~15 项、computer-use/storage/social/text-input/distributed-contents 等 App 状态导出访问器 ~60 项），全部落在 host census 已有的 ADAPTER/GEN-NEW 域，架构上不属于共享 GLES 核心。对信号干净（无 JNI/NDK 类型签名）的少数候选做了逐个函数体核验：`cheng_android_decode_png_asset_file_to_gl_texture` 签名干净但函数体调用 `AImageDecoder_*`/`__android_log_print`（Android NDK 专属，不可移植）；`cheng_android_fill_rect_surface`/`cheng_android_store_rgba_from_argb`/`cheng_android_state_image_texture_id`/`cheng_android_present_allowed_or_skip`/`cheng_android_present_enabled`/`cheng_android_headless_asset_path` 函数体确认平台无关，但在 core 文本里 grep 零调用点（core 当前不依赖它们，移植不会补上任何真实缺口，只是新增无消费者的死代码）——因此保留 0 处迁移，不为凑数字伪造搬运。

**验证**：(a) 见上，三类清单 + 25 项逐条 diff 落盘于 `/tmp/harmony_gles_core_diff_report/`（`both_diff.tsv`/`only_android.tsv`/`only_core.tsv`/`both_same.tsv`），且用隔离树（`git archive HEAD | tar -x -C /tmp/m2-slice0`）重跑对账脚本得到逐字节相同结果（`/usr/bin/diff -q` 确认），证明结果与工作树状态无关、可重放；(b) `mobile_shell_codegen.cheng` 未改动（0 处机械覆盖决定的直接结果），经抢救区 driver（`system-link-exec --target:arm64-apple-darwin`）编译 `mobile_shell_codegen_smoke.cheng` 通过（`compile_real_elapsed_ms≈751`，`RC=0`）且可执行输出 `mobile_shell_codegen_smoke ok`（`RC=0`）——基线健康，"0 处覆盖"不是因为工具跑不动而回避，是逐条核验后的真实结论；(c) N/A（未产出任何 `platform/harmony/` 文件改动）。

**对 §4 slice-3 的影响（已消化进 §4 slice-3 行号勘正，未改动其 action 描述）**：`cheng_mobile_host_upload_glyph_sdf_atlas_common` 在生成器 core 侧的 `metadataOnly` 刷新前提**已经满足**（无需再刷新模板），slice-3 可以直接进入"手写侧 `_common` + v3c sibling 两函数收敛到生成器风格单一实现"这一半工作，不必等待一次不存在的模板刷新。

---

## 6. 风险登记册

| 风险 | 处理原则 |
|---|---|
| **F1 装配管线双重断裂**（Android 快照路径已不存在 + `.inc` 漂移 99 行） | 最高优先级止血：在 slice-8 之前的任何时间点，**禁止任何人重跑 `build_gui_host.sh`**（会静默吃掉 99 行手写成果）。蓝图执行期间此约束应写入该脚本头部注释或加一个显式的 `exit 1` 守卫（本身是一个可以立即做、独立于 slice 序列的极小止血动作，建议在 slice-0 之前单独确认执行，但不在本文档自动授权范围——需用户单独拍板，因为这属于修改现有脚本行为）。 |
| **手写侧超前生成器的分叉处理原则**（v3b 4 个 host 回调 + v3c glyph metadata sibling + `drop_all_layer_caches`） | 已用证据核实：`drop_all_layer_caches`（:5215）在生成器两处版本（Android :15742、core :22988）**都已存在**，属于 GEN-EXISTS territory——按 §2 原则**必须回灌**，不豁免（slice-3 范围）。v3c 的 glyph metadata sibling 函数同属 GEN-EXISTS territory 且已实测三向分叉（手写旧版/手写新 sibling/生成器已演进版），同样**必须回灌**（slice-3 已覆盖）。v3b 的 4 个 host 回调（profile bio did import 等）经核实是纯 ADAPTER/命令桥族（社交/资料相关命令桥，`abort()` 诚实拒绝语义），**天然豁免**——适配层本来就不由生成器产出，这 4 个回调留在适配层文件里即可，不需要"回灌"这个动作。**判断准则**：函数是否落在 `MobileShellNativeGlesCoreSource` 覆盖范围内（可用 slice-0 的对账脚本机械判定）决定回灌 vs 豁免，不凭直觉。 |
| **prebuilt provider .o 过期 ABI 断裂**（14 内在化符号缺口，已用 `/tmp/v3b-providers-out` 重编修复） | 这是 RUNTIME 族（§2.2）的缺口，根因是**没有 `core_runtime_provider_harmony.cheng`**（对应 Linux/Darwin 已有的 provider 声明文件模式）。本战役 slice 序列不新增这个文件（超出 host-codegen 范畴），但 slice-6/slice-8 的 CMakeLists 生成/装配切换涉及 prebuilt `.o` 的 regen 纳管——**regen 纳管原则**：CMakeLists 生成模板必须像现状一样对 prebuilt 对象做存在性/ABI 校验（`nm` 检查关键符号存在，:78-100 现有模式），而不是假设 `.o` 永远最新；`.o` 本身的重新编译（何时触发、谁触发）保持现状人工触发不变，本战役不改变这条流程，只保证生成的 CMakeLists 不会比现状的校验更弱。 |
| **与 v3e 短线修复的合流点**（路由号 44→15 修复、step=83000 黑屏排查） | v3e 已完成的 `CHENG_ROUTE_MAITIAN_LOCAL` 修复（15，设备验证过）是 slice-5 的**既定前提**——slice-5 不重新排查这个值，直接在其基础上做去硬编码（语义导出替代字面量，语义导出的计算结果理应等于 15，用 §4 slice-5 verify (a) 项做回归对账）。若 v3e 仍在进行中的 step=83000 排查发现新的路由相关根因，slice-5 启动前需要重新核对该发现是否影响 §3 方案设计（比如发现问题根本不在路由号而在别处，则 §3 方案依然成立但优先级可能下调）。 |
| **F2 共享核心模板长期滞后 Android 内联版本** | 结构性风险：只要 Android host 生成器（`MobileShellAndroidHostSource`）继续独立内联演进而不调用共享核心，slice-0 刷新后的一致性会随时间再次腐化。**长期解法**（超出本战役范围，标注给后续战役）：让 Android 生成器也改为调用 `MobileShellNativeGlesCoreSource`（消灭两份物理独立文本），而不是本战役这种"定期刷新对齐"的权宜对账。本战役的 slice-0 对账脚本至少能让下一次腐化被及时发现（可接入 CI 定期跑）。 |
| **F4/F5 已被真机验证推翻/存疑的生成器假设** | F4（XComponent OBJ 属性路径）已经是确定结论，slice-3 范围内回灌进生成器（本文档 §4 slice-3 隐含此项，若审阅后发现遗漏需要补一条 slice-3 action）。F5（vsync vs 轮询）**未有定论**，slice-4 明确标注需要设备窗口重新排查，不允许在没有真机对比数据的情况下就切换调度机制。 |
| **slice-5 跨模块协调窗口冲突** | App 核心新增语义导出的改动窗口需要与 task#5（像素 1:1）、task#9（发布按钮桥）确认不冲突（均可能涉及场景编译器/App 核心改动面）。本蓝图不自动假设窗口可用，slice-5 的 done 条件里已注明"需用户另行拍板启动时机"。 |
| **测量口径**（复用项目既有教训） | 所有 hvigor 编译验证结果如实报告通过/失败，不因为"逻辑上应该没问题"就跳过实际编译；所有 diff 对账使用 `/usr/bin/diff` 而非 PATH 上可能被 shim 覆盖的 `diff`（`diff_shim_always_zero_trap` 教训）。 |

---

## 7. 验收定义

战役完成 = 以下全部成立：

1. 鸿蒙 host 从生成器（`mobile-shell export --emit-harmony` 或其 slice-8 后的等价前置构建步骤）**重新生成后**，`cheng_gui_host_gen.c`/CMakeLists.txt 直接覆盖旧产物，无需任何手工补丁。
2. hvigor 全绿（原生 CMake 构建通过，三 `.so` 正确产出）。
3. 装机成功（HAP 正确打包三 `.so` + prebuilt 场景对象）。
4. 两卡（胡广生/麦田）首页并排渲染验证通过（复用 `p2p_twocard_home_verified` 已有口径）。
5. 播放验证通过（本地文件+网络拉流两条路径，媒体解码三级缓冲适配层无回归）。
6. 发布验证通过（MoQ publish serve 线程 dlopen 挂载正常，`publish_trace t_pub0/1/2` 埋点触发）。
7. oracle 双端标记同义：`publish_trace`/`open_to_first_frame`/`playback_endurance` 三组 hilog 埋点字段名与 Android JNI 桥对应实现逐字一致（现状 `cheng_gui_host.c:7376` 注释已声明这条契约，验收时需重新确认生成后的产物仍满足）。
8. `cheng_gui_host.c`（原单体文件）不复存在，手写残留**仅剩**适配层清单内文件（`cheng_gui_host_adapter*.c` 系列，接口面 = 本文档 §2.2 ADAPTER 契约表）+ `cheng_gui_entry.cpp`（已验证正确，不在生成范围）。任何超出这个清单的手写 `.c`/`.cpp` 文件存在即视为验收未通过。

---

## 附：未验证项清单（继承自 gen-recon，本蓝图未新增验证，如实标注）

- Android host 生成器区间是否已有 MoQ/feed dlopen 挂载点对应代码（未覆盖搜索）。
- Harmony host 生成器代码从未实测编译通过，本蓝图基于静态证据链推断（三条独立证据互证），未做现场编译验证（本工作流禁止写操作）。
- slice-2/3/4/5/6/8 的 verify (c) 装机门项均需设备窗口，本文档只列检查项，不代表已执行。
- slice-0 刷新后差异收窄的具体行数未预先估计，需执行后如实报告。

---

## 附: M1 对抗复核修正清单（2026-07-10, verdict=pass-with-notes, 落地前必须消化）

1. **★v3e/v4 合流点已漂移（最高优先）**: 蓝图引用的 cheng_gui_host.c :339/:3281/:4481/:7376 与 HEAD 吻合, 但 v4 互测车道工作树改动（未提交, 36+/10-）已实证 `cur_route==14` 是死代码并删除; 更深发现: **新 46-route 场景两张卡收敛到同一 route=15、同一份本地 maitian.mp4——one-click 逐路由烘焙单视频, 卡片无法区分**（6/21 的 per-card fan-out 在新 materialize 中未生效）。slice-5 的 verify(a) oracle 基线作废, dispatch 前必须重 diff 当前文件态并把"单路由单视频"缺口列为 slice-5 前置阻塞项。
2. **slice-3 行号一半是假引用**: upload_glyph_sdf_atlas_common 真实定义 android=:15984 / core=:23228（蓝图写的 :16215/:23459 落在无关代码）; 宿主侧真实 :5189/:5417。dispatch 前 grep -n 重核落盘。
3. **s_* 静态变量处置只覆盖 ~33%（100/306 声明）**: 函数级账本可信（nm 36 消费符号 exact match）, 但 §1 的物理拆分需要全部 306 个静态变量的归属——"s_* 全量家族标注"补进 slice-0 产出项。
4. **§3 路由语义查询的"Android 先例"论据降级**: s_app_debug_state_is_video_playing 仅有的 2 处消费全是诊断打印, 从未做过行为门控; dlsym 语义导出模式本身成立（touch_hit_index 有真实逻辑先例）, 但论证口径应改为"新设计"而非"已有行为先例"。

---

## 附: slice-8 前置缺口普查定谳（2026-07-11, wf_420ac574 对抗复核 pass）

工具已入库: `tools/harmony_host_gen_gap_census.sh` + `tools/harmony_host_gen_gap_census_driver.cheng`（c459e1cf0, 零硬编码清单, 隔离树两次运行逐字节确定性）。

**HEAD 63c5e13b3 基线**: 手写 256 函数（host.c 240 + entry.cpp 16）= GEN-EQUAL 56 / GEN-DIFF 40 / ADAPTER-ONLY 66 / UNABSORBED 94。行数账: 896/2375/1246/2269（复核注: 报告原文的"行占比"列百分比计算有误, 以此原始行数为准）。UNABSORBED 94 内: vsync 族 3（d677fd530/cc5e1c626 新语义, 归 slice-4 吸收）、sourcePeer 族 3（定义首见 07c76d01f, 63c5e13b3 仅接线; 已是生产代码非缺口）、其余按 RUNTIME 36/301 行、MEDIA 13/596、DRIVER_SKELETON 6/249、asset 5/174、window 4/56、DEAD 3/9、misc 6/170 分族。

**★头号发现 — CMakeLists 生成路径接错函数（已独立证实, 但修复不是一行）**: `mobile_shell_codegen.cheng:25652` 的 MobileShellWriteHarmony 调的是 5 行玩具版 `MobileShellHarmonyCmake`(:20499)；三 .so 拓扑完整版 `MobileShellHarmonyGuiHostCmakeText`(:20717, slice-6 已带 byte-for-byte smoke 断言) 唯一调用点只在 smoke 测试, 从未接入真实导出（生成 5 行 vs 手写 154 行）。**直接换名会破坏两处一致性, 属 slice-8 终局主体工作**: ①smoke :191-194 断言的是玩具版单 .so 行（`add_library(cheng_gui_host SHARED cheng_gui_host.cpp)`), 需随切换更新为完整拓扑断言; ②完整版 CMakeLists 引用手写拓扑源文件名（cheng_gui_host.c/entry.cpp/场景 .o）, 而 experimental 导出树发射的是 libraryname 派生的 `.cpp` 宿主——导出树文件拓扑必须与其携带的 CMakeLists 自洽后才能接线, 否则产出内部不一致的工程。slice-8 dispatch 时以此为第一工作项。

**slice-8 接线二轮定谳（2026-07-11, wf_1b3c4b21 复核 pass, blocked 如实）**: 上节"第一工作项"再精化——把 :25652 换成完整版**必然失败**而非仅"不自洽": 完整版 CMake 的 publisher 分支(:20643-20683)对 prebuilt/publisher/moq_core.o 做无 EXISTS 门控的 message(FATAL_ERROR) 硬校验, 导出树必缺该文件, cmake configure 确定性红(复核员用真 cmake 4.3.0 复现, 错误文本逐字吻合); 且 MobileShellWriteHarmony 仍只发射单一 .cpp, 换后 CMake 引用 8+ 个不存在文件。真前置=路线B: cheng_gui_host.c(416KB/240 函数)物理拆分 _gen.c+_adapter.c + prebuilt 资产拷贝 + 306 个 s_* 全量归属(M1 复核清单已记只覆盖~33%)——即 slice-8 终局本体, 需专门多会话战役, 无更廉价接线捷径(路线A 门禁分叉不能绕开拆分)。census 基线在 3e3bb535a 复核零漂移(56/40/66/94)。

**slice-8 路线B 第一波完成（2026-07-11, wf_bb027459+wf_f821cf33 复核 pass, 补丁待落）**: cheng_gui_host.c 物理拆分 _gen.c(6434 行/192 函数)+_adapter.c(1254 行/48 函数)+共享头(352 行预区+typedef)。①s_* 归属账口径对齐并补全: M1 的 306/33% 是完成度、slice-0 的 326/73% 是构成比, 本波实测当前全集=339(326+HEAD 增长 13 条), 全量归侧含 39+14(p_* dlsym 缓存) SHARED extern 提升; ②等价三验(两轮独立): 240 函数零丢失零重复(215 字节全同+25 仅剥 static), llvm-nm 符号 universe 764=764/defined 548=464∪84 零 ODR, 真实 OHOS clang15+cmake+ninja 9/9 严格门禁(-Wl,--no-undefined --fatal-warnings)+幂等; mutation 阳性对照(删函数→真实 ld.lld undefined 报错)。③补丁=scratchpad/slice8b/split-v2.patch(基线 6e42e2a93, 已吸收 dial 响亮化 +36 行), **落账时序: v16 设备窗验证视频修复后再落**(避免行为 A/B 混入结构重组); 落时若 HEAD 再漂移, 重跑 build_split.py 重生成(脚本化, ~20min 周期)。④正则枚举法漏"函数指针取值传递"7 例由编译器 oracle 抓出的教训: 跨侧符号可见性以编译器为唯一 oracle。

**slice-8 拆分已落账（2026-07-11 09:21, 2c5c0073c）**: v16 设备窗验证视频修复后按纪律落账; hvigor 全量构建绿(native 真重编: gen.c.o+adapter.c.o 新链 .so 24.67MB)。单体 cheng_gui_host.c 不复存在。剩余=slice-4(vsync 语义吸收进生成器)+终局切换(生成器发射 _gen.c 半+导出树自洽+完整版 CMake 接线)。

**slice-4 vsync 族吸收已落账（2026-07-11, 44fd7c289+2b475a890, 复核 pass）**: census 工具适配拆分布局（gen.c+adapter.c 双文件合并对账, 新基线 256=54/42/66/94→吸收后 57/42/66/91）; ChengVideoVSyncCallback/engage/disengage 三函数吸收进 mobile_shell_codegen.cheng（渲染回抽与手写 gen.c 逐字符==, mutation 反证）; prewarm 族实测零缺口（cheng_stream_prewarm_worker 正确归 ADAPTER 侧, 非吸收对象）。vsync 桶清零。★注: F5 帧驱动语义本体已由 v8 战役真机验证落地（d677fd530）, 本片只做生成器归一, 无行为分叉。CMake 模板已跟进拆分复绿（1cac548f9）。吸收第二波已落（wave2: 25 函数, GEN-EQUAL 57→82/UNABSORBED 94→69, picker/sourcePeer/window/GEN-NEW/own-ip/diagnostics 族清零; 顺修生成 cpp 8 个既有 undeclared; 真 OHOS clang++ 语法 0 error）。UNABSORBED 剩 69: RUNTIME 26 族=未来 core_runtime_provider_harmony.cheng 域非 host-codegen 范围, MEDIA 13 按纪律不生成, DEAD 5 候选待定谳。M3 剩余=终局切换（生成器发射 gen 半+导出树自洽+完整版 CMake 接线, GEN-DIFF 42 对账是前置）。

**wave4 三连回灌已落账（2026-07-11 深夜, a63459efb, 三 patch 独立影子树对抗复核全 pass）**: census 基线（wave3 后含黑屏排查系列提交, 263 函数）84/40/68/71 → **93/32/68/70**。①日志宏归一化: gen.c 8 函数 `__android_log_print`→`CHENG_HOST_LOG_ERROR/INFO`（shared.h 补双宏与生成器 :25234-25235 逐字节一致）, GEN-DIFF→GEN-EQUAL +8; `cheng_android_gpu_draw_ink_field` 实测 diff_lines=19 是真功能缺口（生成器多 texture sub-update 优化路径 s_ink_field_tex_w/h+glTexSubImage2D）非宏差异, 列入后续回灌对象。②abort 诊断回灌: 真缺口精确锁定 5 函数/6 处 abort 分支（host 侧补齐生成器 fcc35e318 诊断）; ~15 个疑似缺口实测早已用 host 既有 `__android_log_print` 风格落地, 非缺口; `cheng_android_gpu_draw_rect` 的 GEN-DIFF=2 是 `void` vs `static void` 链接属性差异（拆分布局的跨文件调用需要）, 非诊断缺口。③`cheng_android_gpu_draw_texture_object_fit_rot` 反向回灌: host 领先函数移植进 `MobileShellNativeGlesCoreSource`（rotated_uv 之后, 满足调用顺序）, UNABSORBED −1; base 函数与 :23064/:23075 调用点不动, Android 模板段零触碰。★口径考据: 函数级三种分母并存——GEN-EQUAL/总数=93/263=35%; 排除天然手写 ADAPTER-ONLY 后 93/195=48%; 窄口径 93/(93+32)=74%。与 slice-0 的 s_* 静态变量级 326/73% 是两套完全不同的分母, 引用时必须注明。★slice-8 考据定谳: split-v2.patch 描述的物理拆分已被 2c5c0073c（2026-07-11 09:21）落账进主线并经 4 轮吸收提交演进, 该 patch 是已被取代的历史文档, 无需重造; slice-8 终局剩余=生成器发射 gen 半+导出树自洽+完整版 CMake 接线（GEN-DIFF 32 对账是前置）。

**wave5 双回灌已落账（2026-07-12 凌晨, 7c3ca36a8, 双 patch 独立影子树对抗复核 pass）**: census 93/32/68/70 → **102/23/68/70**。①日志宏归一第二轮（8 函数: cheng_log/draw_layer_cache/svg 绘制族×5/rotate_point_90, 同 wave4① 模式不同目标函数）。②`cheng_android_gpu_draw_ink_field` 真功能缺口回灌: 生成器 texture sub-update 优化（s_ink_field_tex_w/h 维度缓存, 维度不变走 glTexSubImage2D 原地更新, 变时走全量 glTexImage2D+回写）逐字节对齐 :19100-19124 及镜像 :25089-25113, diff 19→0。★glyph SDF 族 8 函数的"图集寻址简化"前提被实施 agent 实证推翻（真 diff 内容非勘察假设）, 如实零改动留账——GEN-DIFF 剩 23 的二轮归类见 wave6。

**wave6 死码清账+GEN-DIFF 二轮定谳（2026-07-12 凌晨, 双 patch 复核 pass）**: ①8 条零消费者真死码删除（JNI/AssetManager 遗留族 5 + width/height/density_scale 族 3, 三重验证）, census 总数 263→258, UNABSORBED 70→**65**。②★GEN-DIFF 23 二轮全量真 diff 定谳: **0 条属 host 侧回灌方向**——wave4/5 已把"生成器领先"族吸收清零, 剩 23 条全部是 host 领先或架构级正确分叉（gpu_ensure/present 族等 ~18 条为两大横切模式）, gen.c 侧对账就此收敛; 后续 GEN-DIFF 收窄只能在生成器发射域做（M3 终局切换的一部分）。③DEAD 候选计数漂移考据: 历史 4/3/9/5 各处不一致=两个不同小族的口径混叠（3 函数 9 行 vs 5 条 JNI 族）, 本轮重新逐条 grep 定谳不信旧账。census 现况: **258=102/23/68/65**。

**wave7 slice-8 主体三轮复核（2026-07-12, 影子树 /tmp/slice8lane, HEAD=5cc21ca26）**: 任务书要求"让 GEN-DIFF 23 逐函数零行为差"并要求"生成器吸收 host 版本文本"。本轮给 `tools/harmony_host_gen_gap_census.sh` 加 `DUMP_GENDIFF_DIR` 环境变量（复用既有花括号自动机+`extern "C"`透明化引擎, 对每条 GEN-DIFF 落盘完整 unified diff, 非新写平行工具), 对 HEAD 上真实存在的 23 条逐条读全文（非只看行数), 结果与 wave6 的定性**相反**: **0 条需要"生成器吸收 host 文本"**, 22/23 是**生成器已领先、host 尚未回灌**（regen 覆盖会是升级不是丢失), 归为 6 类均已逐条读源码验证:
  - 日志宏归一未扫尾（14 条: present_compositor_frame/present_gpu_commands/present_overlay_refresh/present_media_surface_commands/upload_image_atlas/upload_svg_display_list_atlas/register_media_surface_texture/render_gpu_commands_to_layer_cache/upload_glyph_sdf_atlas_common 等）——host 仍是 `__android_log_print`, 生成器已是 `CHENG_HOST_LOG_*`, 与 wave4/5 已修的 16 条同一模式, 只是当时扫描口径漏网的剩件。
  - window/EGL 钩子抽象（5 条: present 族 4 个 + `gpu_ensure`）——host 用 `ANativeWindow*`+`ANativeWindow_setBuffersGeometry`（靠 `ohos_android_compat.h` 兼容层活）, 生成器已切到自带的 `CHENG_HOST_WINDOW`+`cheng_host_window_set_geometry`/`cheng_host_egl_window_surface`（自包含, 直调 `OH_NativeWindow_*`/`eglCreateWindowSurface`, 不靠兼容层), 且 present_gpu_commands/present_overlay_refresh 生成器版本额外带 headless-capture 分支（`s_headless_capture ? width : ...`) host 没有。
  - glyph SDF 图集分片化+O(1)寻址重构（6 条: upload_glyph_sdf_atlas/gpu_draw_text_sdf/find_glyph_sdf_run/find_glyph_sdf_glyph/upload_glyph_sdf_atlas_common/gpu_destroy 尾段）——生成器已改成多贴图分片(`gl_textures[]`/`gl_texture_count`/`gl_tile_height`)+数组下标 O(1) 命中(`glyph_id==index+1`不变式), host 仍是单大贴图+线性扫描; **host 自身在 `upload_glyph_sdf_atlas_common` 顶部留了署名注释**明确写着此重构"intentionally NOT ported here...flagged for a follow-up slice, not silently dropped"（2026-07-10 09:31 d12df89c6 之后), 与本轮读到的差异逐字吻合, 是 host 侧已知未完成项而非生成器缺口。
  - 局部功能增量 3 条: `gpu_upload_image_texture`(生成器多 mipmap: `GL_LINEAR_MIPMAP_LINEAR`+`glGenerateMipmap`)、`upload_image_atlas`(生成器多 dynamic_texture 保留合并逻辑, host 无此字段/无此分支)、`gpu_init_programs`(生成器抗锯齿改 `fwidth`-based 而非 `smoothstep`)。
  - 纯结构差 2 条: `gpu_draw_rect`/`normalize_video_rotation_degrees` 的 `void` vs `static void`——2c5c0073c 物理拆分要求跨文件调用去 static, 生成器仍是单文件语境用 static, 与 wave4 结论一致, 非缺陷。
  - 命名不同但同构 2 条: `read_scene_data_asset`/`read_glyph_sdf_pixel_asset` 内部调用的 helper 在 host 叫 `cheng_ohos_read_rawfile_checked`、生成器叫 `cheng_host_read_asset`——两者逻辑独立平行实现、生成器版本自包含（在同一输出文件内定义), 纯改名不改行为, regen 整体替换即自然统一。

  唯一真缺口（1/23, 未处理，与生成器自身 TODO 一致）: `cheng_android_gpu_draw_registered_media_surfaces`（226 行 diff）——生成器当前吐出的是显式 TODO 占位签名（`mobile_shell_codegen.cheng` 侧原文承认"requires the MoQ zero-copy stream subsystem...that lives only in the hand-written cheng_gui_host_adapter.c ADAPTER territory and is not yet absorbed...needs a dedicated MoQ-adapter-absorption slice"), host 的真实实现是 MoQ 流式解码+双路径(zero-copy surface / CPU ring)+EOS 锁存+秒开埋点等完整逻辑。本轮未吸收——真吸收需要先把 `ChengStreamCtx`/`cheng_surface_consume`/`cheng_stream_teardown_active` 等一整套流式子系统的归属（目前在 adapter.c, 是否要下放进生成器域）想清楚, 不是复制粘贴文本能完成的, 留给专门的 MoQ-adapter-absorption slice（生成器作者自己的原话）。

  **结论**: 生成器侧**无安全可落的"缺口"可补**（22/23 补了等于原地退化, 1/23 补了等于未经设计验证地强推一段游离逻辑）, 本轮 mobile_shell_codegen.cheng **0 处改动**, 与 slice-0 的"0 处机械覆盖"同一诚实口径。真正能让 22/23 收敛为 GEN-EQUAL 的机制是 regen 整体覆盖（非逐条手改 gen.c）, 但 regen 本身被更上游的问题挡住——见下条。

  **一键 regen 真正阻塞点（比"二轮定谳"更精确的独立复核）**: 导出树目前只吐一个单体 `cheng_gui_host.cpp`（C++ 语法, `extern "C" { ... }` 包裹共享 GLES 核心段做 C 链接), 而 `cheng_gui_host_gen.c` 是纯 C 文件（CMakeLists `project(... C CXX ASM)`, 不接受 `extern "C"` 语法, 编译期语法错误）, 且此单体 .cpp 内容边界并不等于 gen.c/adapter.c 的物理拆分边界（拆分后同名函数在两个 target file 里各有 91/52/21 三路分野, 单体 .cpp 目前只对应 161 个 GEN 域函数, 不含 ADAPTER 域）。`MobileShellWriteHarmony` 需要重写为直接吐三份文件（gen.c 纯 C 语法+对应 CMakeLists), 这与"二轮定谳"记录的 CMake FATAL_ERROR 阻塞（`MobileShellHarmonyGuiHostCmakeText` 引用不存在的 prebuilt/entry 文件）是同一终局工作的两个独立缺口, 都要在生成器发射域动刀, 规模超出本轮 medium-effort 会话安全边界, 如实报 blocked, 不强推。

  **产出**: `tools/harmony_host_gen_gap_census.sh` 新增 `DUMP_GENDIFF_DIR`（复用工具, 非新写平行脚本), 后续任何"生成器 vs host 谁该赢"的判断都可以一条命令拿到全 23 条真 diff 而不必每次重新手工读源码。census 本轮复跑基线: 264=102/23/72/67（GEN-EQUAL/GEN-DIFF 与 wave6 持平, ADAPTER-ONLY/UNABSORBED 因 HEAD 增长漂移, 非本轮改动所致）。
