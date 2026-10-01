# task_uf_fortify_l4.md — 场景壳真机 FORTIFY SIGABRT 根因收窄与 L4 攻坚（UF 线）

日期：2026-09-13。工作克隆 `/Users/lbcheng/cheng-f24/anchor_clones/scenfix`（Y/T2/U2 线同法
`cp -cR` 重建）。设备 DCO-AL00 serial GBJ0222B24021692（与其他会话共用，全程安装冲突重试）。
主仓 `src/bootstrap` 零改动（本线无源级修复落地 → 无 `patches/uf_*.patch`）；UniMaker 仓零改动。
两仓 git 零写操作（仅本任务文档 `git add -f`）。

---

## 0. 结论速览

| 项 | 判词 |
|---|---|
| FORTIFY 复现 | P0 原版壳稳定复现（本轮基线 12:14：`present_enabled=1` 后 +49ms 崩，受害址 0x71eda47ed0 = libhwui .bss vaddr 0x1047ed0） |
| 写坏者定性 | **破坏性写发生在 scene 库 dlopen 事务内、应用代码之外**：内存取证显示结构化毒化（mutex state=0xffff 销毁标记、+0xf0 处 4 字节 ff、自 +0x134 起 **36 字节步长槽位表逐项写 8 字节 ff** 共 81+ 处），非野指针算术写 |
| 嫌疑模块 | **EMUI 图形 hook 子系统 `libiGraphicsCore.huawei.so`**：中止时刻捕获到一条 JNI 起源、正处 linker64 dlopen 路径的线程，其 PC 落在该库 +0x25b40（文件 vaddr ≈0x81b40）——一段**递归 C++ 析构器**（沿链式结构逐节点 `operator delete`），且该库 strings 自证为 GL API hook 层（`InitHooksTable`/`HookglShaderSource`/`cloud xml disable hookapi mode`/`IGraphicsGLHookThread`） |
| 修复 | **未落地 → L4 BLOCKED**。任务给出的 4 条路径 + 自研 6 条路径共 **10 项真机实验全部证伪**（§2），缓解手段在应用侧已穷尽；归因=EMUI ROM 输入（对应 U2 §3-3c 预案），需 ROM/厂商反馈或真机 root 级取证 |
| 工具修正 | U2 线「HW 写观察点稳定性不足」结论**部分翻案**：真因是观察脚本从未向 lldb-server 发送 resume `c`（进程被 ptrace 冻结，jdb 的 cont 只解 ART 门），本轮修正流程后观察点可正常布防/命中 |

## 1. 加载序列精确定位（本轮新证据，反汇编实测）

- 壳 `ChengMainActivity.<clinit>` 仅 `System.loadLibrary("cheng_generated_android_host")`；
  JNI_OnLoad 只做 RegisterNatives（121 方法表，逐一解析还原）。
- **scene 库 dlopen 是惰性的**：`nativeCreate`（对应 JNI 函数 0x3e8a4）入口检查句柄全局
  [0x789000+0x818]，为 0 才 `snprintf("lib%s.so","cheng_unimaker_scene") → dlopen(buf,
  RTLD_NOW|RTLD_GLOBAL)`，随后 dlsym cheng_app_init 等。
- Kotlin 侧 `createRuntimeForSurface` 经 `postRender{}` 把 nativeCreate 投到**渲染泵线程**，
  与主线程首帧渲染并发。
- U2 P 矩阵结论复核成立：P1/P2/P3（桩库/桩 provider/早期失败）均不崩，唯真 scene dlopen
  完成 → 崩。本轮补充复核：`libcheng_unimaker_scene.so` 重定位 589×GLOB_DAT +
  3727×JUMP_SLOT **全部界内**、无 IRELATIVE/TLS/RELATIVE，无 DT_INIT/INIT_ARRAY/FINI；
  provider 的 3 个 init_array 构造器反汇编为良性（setvbuf 无缓冲、CPU 特性探测）。

## 2. 实验矩阵（全部真机实测，E2–E11 + 基线）

| # | 变体 | 假设 | 结果 |
|---|---|---|---|
| 基线 | P0 原版 | — | 崩（+49ms，hwui 0x…047ed0），3/3 |
| E1 | llvm-strip scene .so | b.瘦身 | **无效**：库本已 strip（仅省 96B），无 debug/symtab 段 |
| E2 | interposer 拦截 dlopen 延迟 1500ms（DT_NEEDED 前插 + dlopen/dlsym 转发） | a.避开首帧并发 | **崩**（dlopen 释放后 +27ms，受害 0x720ecd77f0，系统线程 DetectViewRect）；「首帧并发」假设证伪 |
| E3 | scene .so p_align 0x10000→0x1000（纯 header） | 64K 对齐 linker bug | **崩**（同址 hwui） |
| E4 | AndroidManifest `extractNativeLibs=true`（AXML 二进制翻转） | zip 容器内 mmap 大偏移 | **崩**（同型 hwui） |
| E5 | 挂起期/中止期受害区内存 diff（hwui .bss ±8KB） | 取证 | **结构化毒化**：mutex=0xffff、+0xf0=ffffffff、36B 步长 8B ff ×81；同窗 hwui 自身合法写照常（列表 push、标志位） |
| E6 | 23MB 假 scene 库（17MB 文件backed R + 5MB RW + .bss，无导出无重定位） | 尺寸/映射画像 | **干净**（dlopen 成功、create 缺导出干净失败、存活 14s）→ **尺寸排除**，路径 d 的「按大小拆分」失去依据 |
| E7 | 真 scene 去 GNU_RELRO + 去 BIND_NOW（lazy） | 重定位 burst/relro mprotect | **崩**（本轮受害 grallocutils rw+0x470 = U2 gralloc 受害址） |
| E8 | provider 提升为 host 库 DT_NEEDED（独立事务预载） | 同事务「加载邻居+对其解析」 | **崩**（另证：后台存活 103s 系 surface 未创建、dlopen 未跑，非修复） |
| E9 | DT_GNU_HASH tag 改写为忽略值 → 迫使 sysv DT_HASH 查找路径 | EMUI gnu_lookup 分支 bug | **崩**（同型 hwui；中止时 create 线程被观测卡在 `soinfo::gnu_lookup`→futex） |
| E10 | `android:debuggable` 翻 false（发行态） | hook 仅挂 debuggable 应用 | **崩**（同型 hwui） |
| E11 | scene 本身提为 host DT_NEEDED（进程极早期装载） | 避开 hook 线程初始化窗口 | **崩**（同型 hwui，+50ms） |

安装验证纪律：每轮以 `pm path`+pull base.apk 字节/哈希（或 ELF tag 复核）确认所装即所测；
共享设备被他线反复覆盖安装/force-stop（含一次 system_server 重启、EMUI 装机风控弹窗与
设备认证弹窗），多轮以循环抢占拿到干净观测窗。

## 3. 写坏者证据链（本轮取证）

1. **内存形态**（E5）：毒化为结构化标记写（0xffff 销毁标记 / 0xff 槽位毒化），不是重定位
   算术写（那会写入 8 字节地址值）；结合界内复核，毒化者不在 scene 库自身的重定位写。
2. **中止时刻全线程栈**（run-as lldb_server_bin(gdbserver) + 裸 gdb-remote，25 线程全栈+maps）：
   - create/dlopen 线程：PC=libc futex 等待，栈上留有 **linker64 `soinfo::gnu_lookup`
     （0x56b10，已 pull 设备 linker64 反汇编核实）** 帧——dlopen 事务在中止时仍未完成；
   - **tid 836：PC=`libiGraphicsCore.huawei.so`+0x25b40（≈文件 vaddr 0x81b40）**，
     同栈留有 linker64 帧 + libc mutex 慢路径帧 + libart JNI 起源帧。0x81b40 反汇编 =
     **递归析构器**（`ldr x1,[x1]` 自递归 + 尾部 `_ZdlPv` operator delete 逐节点删除）。
3. **该库自证为 GL hook 层**：`InitHooksTable`、`g_glHooksIgfxGl(2)`、`HookglShaderSource`、
   `IgfxHookglCreateShader`、`IgfxHookglMapBufferRange`、`IGraphicsGLHookThread bindToCore`、
   `%s is GT Disable by cloud xml`、`cloud xml disable hookapi mode`、内嵌游戏包名表
   （com.tencent.ig / com.miHoYo.* 等）。
4. **受害面与 GL 栈重合**：libhwui 全局 recursive_mutex（GPU 渲染路径）、libgrallocutils
   CameraInfo mutex——均为 iGraphics hook 所寄生的图形栈静态对象。

**根因定性（工作结论，高置信）**：EMUI 图形加速 hook 子系统（libiGraphicsCore.huawei.so，
经 linker/dlopen 路径注入）在 scene 库装载事务内运行其 hook 状态清理/析构代码（递归
delete + 槽位 ff 毒化），该过程毁坏无关库（hwui/grallocutils）的 C++ 静态 mutex（写 bionic
销毁标记 0xffff）；随后任意线程首次加锁即 `FORTIFY: pthread_mutex_lock called on a
destroyed mutex` SIGABRT。触发条件=真 r51b scene 库的 dlopen 事件本身；与首帧时序、库
尺寸、段对齐、加载来源、BIND_NOW/RELRO、哈希算法、debuggable 均无关（§2 十项证伪）。

## 4. 真机烟测输出（真实）

```
# 基线（P0，12:14）
09-13 12:14:31.989 I/cheng-mobile-shell(15454): present_enabled=1
09-13 12:14:32.038 F/libc    (15454): FORTIFY: pthread_mutex_lock called on a destroyed mutex (0x71eda47ed0)
09-13 12:14:32.038 F/libc    (15454): Fatal signal 6 (SIGABRT) in tid 15454 (.unimaker.scene)

# E2（延迟 1500ms，interposer 日志为证）
09-13 12:26:34.440 I/uf-delay(19502): scene dlopen deferred by 1500ms (uf interposer)
09-13 12:26:35.940 I/uf-delay(19502): scene dlopen releasing now
09-13 12:26:35.967 F/libc    (19502): FORTIFY: pthread_mutex_lock called on a destroyed mutex (0x720ecd77f0)
09-13 12:26:35.967 F/libc    (19502): Fatal signal 6 (SIGABRT) in tid 22498 (DetectViewRect)

# E6（23MB 假库，对照：干净）
09-13 14:40:12.820 I/cheng-mobile-shell( 6962): present_enabled=1
09-13 14:40:12.858 E/cheng-mobile-shell( 6962): missing required app export cheng_app_init: undefined symbol
（存活 14s+，pid 6962 无 FORTIFY）

# E9/E10/E11（收尾三轮，同型崩）
09-13 16:08:29.293 I/cheng-mobile-shell(25306): present_enabled=1
09-13 16:08:29.343 F/libc    (25306): FORTIFY: ... (0x7d1e447ed0)   ← E9
09-13 16:17:46.346 I/cheng-mobile-shell( 2043): present_enabled=1
09-13 16:17:46.385 F/libc    ( 2043): FORTIFY: ... (0x7d1e447ed0)   ← E10 非 debuggable
09-13 16:39:09.061 I/cheng-mobile-shell( 9107): present_enabled=1
09-13 16:39:09.111 F/libc    ( 9107): FORTIFY: ... (0x7d1e447ed0)   ← E11 早载
```

**L4 判词：BLOCKED（未达成）。** 场景壳烟测无法在 FORTIFY 消除前通过；应用侧十项缓解
全部证伪后，按 U2 §3-3c 预案归因 EMUI ROM 输入。

## 5. BLOCKED 项与下一步

1. **厂商取证包（建议 ROM 反馈/华为渠道）**，材料已备于 `scenfix/tmp/uf_l4/`：
   - `e{2..11}_*.txt` 全部轮次 logcat、`uf_mem_before.bin`/`uf_mem_after.bin`（受害区 16KB
     前后快照）、`uf_threads_stacks.txt`+`uf_capture_maps.txt`（中止时刻 25 线程全栈+maps）、
     `uf_watch_hit.txt`（观察点命中寄存器/栈）、`igraphics.so`（设备侧取证件）、
     各实验 APK（`uf_e*_*.apk`）与 patch 脚本（`uf_*.py|sh`）。
   - 最简复现：DCO-AL00（EMUI 12）安装 scene_shell_device.apk → `am start -n
     org.cheng.unimaker.scene/.ChengMainActivity` → `present_enabled=1` 后 40–90ms
     `FORTIFY: pthread_mutex_lock called on a destroyed mutex`。
   - 询问厂商：iGraphics hookapi 在非游戏包 org.cheng.unimaker.scene 上为何 engage；
     dlopen 路径上的递归析构/清理（libiGraphicsCore+0x81b40 一带）为何会写 hwui/gralloc
     静态对象；`cloud xml disable hookapi mode` 开关能否按包关闭。
2. **设备级临时绕过（待人工确认）**：EMUI 设置中对该应用关闭「图形增强/GPU Turbo」类
   开关（若 ROM 提供按包开关），或云控下发放该包的 hookapi disable——需要真机 UI/root
   操作，本线 adb 权限内不可达，未验证。
3. **lldb-server 工具链修正**（供后续线直接使用）：raw gdb-remote 下 arm64 HW 观察点
   **不会自动继承 arm 后新建线程**；需「放行后周期性 \x03 中断→对全体线程重发 Z2→再放行」
   轮询（`uf_watch4.py` 已实现）；对同址重复 Z2 会令 lldb-server 断连，避免重臂。
4. 主仓一键链重建（one-click/车头）**本轮未执行**：因 E6 证明尺寸拆分无效、其余修复候选
   均不需源级出件，重建不改变本线结论；若厂商给出内容级触发条件（如特定符号面）再启动。

## 6. 待主仓入库清单

1. 本任务文档（唯一主仓新增；`git add -f`）。
2. 无 `patches/uf_*.patch`：本线未产生主仓源码改动（`src/bootstrap` 零 diff）。
3. 沉淀物（scenfix 克隆 `tmp/uf_l4/`，零 git 操作）：E2–E11 全部实验 APK/脚本/取证件
   （`uf_repack_stage.sh`、`uf_patch_dyn.py`、`uf_memdiff*.py|sh`、`uf_watch*.py|sh`、
   `uf_atomic_test.sh`、`uf_race_install_launch.sh`、`uf_delay_dlopen.c`、`uf_fat_data.c`、
   各轮 logcat/快照/栈捕获、`linker64_device`/`igraphics.so` 取证件）。

## 7. 纪律

- 主仓 `src/bootstrap` 零改动、零 git 写操作（仅本文档 `git add -f`）；UniMaker 仓零改动
  （`ssm1_scene_shell.build.mjs` 未动——全部实验以 APK 重打包实施，无证据支持改装配脚本）。
- 两仓 git 零 commit/push；克隆内全部为 tmp 试验产物。
- 无伪造：所有「崩/不崩」结论均有对应轮次 logcat 原文（grep 行已原样引用）；「安装即所测」
  以 pull base.apk 字节/哈希或 ELF tag 复核为准；E8 的 103s 后台存活已主动翻案为
  「surface 未创建、dlopen 未执行」，不计为修复证据。
