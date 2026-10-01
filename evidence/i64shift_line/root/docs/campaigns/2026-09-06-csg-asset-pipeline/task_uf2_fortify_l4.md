# task_uf2_fortify_l4.md — 场景壳真机 FORTIFY 根因定谳与 L4 判词（UF2 线）

日期：2026-09-13。设备 DCO-AL00（GBJ0222B24021692，与其他会话共用，存在安装队列竞态）。
工具沉淀：`/Users/lbcheng/cheng-f24/uf2_gate_lane/`（scenfix 克隆在本线中途被并行会话整体重建，
本线产物已迁移至该目录）。主仓 `src/bootstrap` 零改动；UniMaker 仓零改动；全程零 git 写操作。

---

## 0. 结论速览

| 项 | 判词 |
|---|---|
| FORTIFY 根因 | **不是** loader/重定位/内存映射问题。真因：cheng runtime 在 `ChengRenderThre` 线程上触发 **ORC refcount underflow**（double release / wrong owner，`cheng_mem_release_underflow_fail`）→ `cheng_panic_cstring_and_exit` → `exit(1)` → libc `__cxa_finalize(NULL)` ** walks 并析构进程内全部已注册静态对象**——包括 zygote 继承的 `libhwui.so` 静态 `recursive_mutex`（+0x1047ed0）与 `libgrallocutils.so` `CameraInfo` 静态 mutex（rw+0x470）→ 之后任一系统线程加锁即 `FORTIFY: pthread_mutex_lock called on a destroyed mutex` SIGABRT |
| 关键证据 | gate v3 附加窗口内 Z2 硬件写观察点当场抓获毁写者：线程 `ChengRenderThre`，PC=libc+0xa6828(`pthread_mutex_destroy`)，LR=libc++.so+0x4c850（`__cxa_finalize` handler 析构 walk），x9=0xffff（写入值）；调用链经 `cheng_mem_release_underflow_fail`→`cheng_panic_cstring_and_exit`→exit 全栈符号化核实 |
| U2 遗留定性修正 | P0-P7 二分矩阵的「真 scene 库 dlopen（映射+重定位）与首帧并发」归因**不成立**：本线实测 dlopen 本身仅 ~4ms 且干净（重定位/RELRO 后 mutex 完好，POST-DLOPEN-CHECK 零延迟核实），毁写发生在 **dlopen 返回后宿主桥的 runtime create 期间**（P0 未加窗时为 +2.8~3ms，与 FORTIFY ~80ms 现象的时序完全吻合）；E2「延迟 1500ms 仍崩」同样由此解释（延迟只是把 panic 推后） |
| 修复路径 | 两层：①**本体**：ORC underflow 本体缺陷（json/scene-state 解析路径释放语义，r51b-a4fix 生成链）需场景链重建修复——归编译器/生成器 lane；②**Android 语义**：`cheng_panic_cstring_and_exit` 在 Android 内嵌 GUI 宿主里 `exit()` 等于摧毁宿主进程图形栈，Android panic 语义必须改 `abort()`（真 Let-it-crash，tombstone 可查）——一行级 runtime 改动，坐标已给（§3），属 runtime lane |
| L4 | **BLOCKED**（根因已定谳，修复需场景链重建 + runtime panic 语义改动；非 APK 配置/重打包可修）。烟测未 PASS，无伪造 |

## 1. 证据链（全部真机实测，2026-09-13）

### 1.1 gate .so 注入法（本轮新工法）

`libuf_gate.so`（NDK aarch64 编译）经 `patchelf --add-needed` 挂到 `libcheng_generated_android_host.so`
DT_NEEDED 首位（Kotlin `<clinit>` 只 loadLibrary host，host 再 dlopen scene——见 classes4.dex
`ChengMainActivity.<clinit>` 字节码）。gate 功能：300µs 轮询 watchdog（直接读 hwui/gralloc 两个
已知 mutex 地址的字节值，任何翻转打 logcat）、dlopen 拦截时间线、dlopen 返回瞬间零延迟复核、
20s×100ms 附加窗口。安装走 `adb push + pm install`（流式安装 `adb install` 在多会话并发下会
把 EMUI 安装器队列整体卡死，必须单发）。

### 1.2 时序定谳（日志原文，`ufgate` tag）

```
17:02:06.055 gate ctor t0
17:02:06.059 watch armed hw_mut=7d1e447ed0 gr_mut=7c5993d470 hw0=0 gr0=0
17:02:06.136 dlopen('libcheng_unimaker_scene.so') START t=80.659
17:02:06.139 dlopen END   t=84.307            ← dlopen 仅 3.8ms
17:02:06.139 POST-DLOPEN-CHECK t=84.365 hw=0 gr=0   ← 返回瞬间两个 mutex 完好
17:02:06.142 GRALLOC MUT CHANGE t=87.182 val=000000000000ffff   ← +2.8ms 被写 0xffff
（对照：P0 无窗轮 FORTIFY 出现在 +40~90ms；本例 gralloc 先毁，后续轮 hwui 先毁，与「哪条
系统线程先摸到被毁 mutex」的竞态一致——跨轮不同库不同地址的现象由此解释）
```

带 20s 附加窗的轮（窗口把 runtime create 推迟 21s）：窗口内 mutex 全程健康（gralloc 出现
`0x1`=正常加锁、hwui 出现 `0x4000`=recursive_mutex 正常态，**无任何 0xffff**）；
窗口关闭 → 44ms 内 gralloc 同样被写 0xffff。证明毁写与 dlopen 窗口无关、与 runtime create 强耦合。

### 1.3 毁写者抓获（gdb-remote Z2 写观察点，窗口内附加）

```
STOP: T05 thread:33e8; name:ChengRenderThre; reason:watchpoint;
      description:343833313938373935343732...  ← 十进制 483198795472 = 0x7080e47ed0（hwui mutex）
x0=0x7080e47ed0（目标 mutex）  x9=0xffff（写入值）  x21=0x7080e47ed0
PC = libc.so +0xa6828  = pthread_mutex_destroy
LR = libc++.so +0x4c850（__cxa_finalize 析构 walk 中的 handler 帧）
```

栈扫描（sp 起 0x400 字节）归属：

```
pthread_mutex_destroy (libc)
 ← libc++.so +0x4c850                      __cxa_finalize handler 析构
 ← libc +0xa86a4                           __cxa_finalize 内部
 ← provider +0x2bcf8                       cheng_allocation_ledger_record_recycle_locked +0x580（帧窗）
 ← libc +0x99e24                           pthread_start 线程引导
 ← libcheng_unimaker_scene.so +0xa379d4    ≈ json.jsonParseValue +0x2cf0
 ← provider +0x25250                       cheng_panic_cstring_and_exit +0x1d0
 ← provider +0x21a94/+0x21b30              cheng_mem_release_underflow_fail +0x104/+0x1a0
 ← provider +0x2343c/+0x2354c              cheng_mem_release_checked / cheng_mem_release
（原始扫描帧，个别名址为栈面残留值可能，供下游复核；underflow_fail→panic→exit 主链由多帧互证）
```

与源码逐一对上（`src/core/runtime/program_support_backend.cheng`）：

- `:6358 cheng_mem_release_underflow_fail` → panic 文案
  `"cheng_orc_release_failure code=refcount_underflow ... detail=double_release_or_wrong_owner"`
- `:9298 cheng_panic_cstring_and_exit_export` → `cheng_stderr_write_line_cstr(text)` + `c_exit_runtime(1)`
- `:46 c_exit_runtime` = `@importc("exit")` → libc `exit(1)` → `__cxa_finalize(NULL)`

### 1.4 真机烟测输出（如实）

- P0 口径（UF gate 轮，无任何实验补丁的 scene/provider）：启动 ~80-300ms 主线程 FORTIFY SIGABRT，
  崩点 `0x…47ed0`（hwui）或 gralloc rw+0x470 轮替——与 U2/T2 记录逐型一致，稳定复现。
- gate v3 附加窗轮：**runtime create 起点即 panic exit**（`Process org.cheng.unimaker.scene (pid …)
  has died: fg TOP`，正常退出态、无 signal）或 FORTIFY（取决于系统线程竞态谁先摸到被毁 mutex）。
- 结论：**场景壳在 runtime create 阶段必死（ORC underflow），L4 烟测不可达**；即使把 panic
  语义改 abort 也只是换成干净崩溃。修复必须落在本体①（underflow）。

## 2. 对既有实验矩阵的收束解释

- U2 P1/P2（桩 scene）不崩：runtime create 没跑 → 无 underflow 无 exit。
- U2 P3（真 scene 重定位期干净失败）不崩：同上。
- U2 P7（`cheng_app_init` 补 ret）仍崩：exit 的发起者是 render 线程的 release 路径，不是
  `cheng_app_init` 单点；P7 只跳过了一个函数。
- E2 延迟 1500ms 仍崩：延迟只是把 create 推后；释放后 ~27ms FORTIFY（DetectViewRect 线程）。
- E3 align4k / E6 fatscene / E7 norelro-lazy 等 loader 假设：全被 1.2 的「dlopen 干净 + POST-CHECK
  完好」直接否定，无须再试。

## 3. 修复坐标（待入库，未改动——归位到 owner lane）

1. **本体（编译器/生成器 lane，L4 真解阻条件）**：`ChengRenderThre` 在 runtime create 的
   json/scene-state 解析路径存在 ORC double-release / wrong-owner release。定位输入：
   ①§1.3 栈帧（jsonParseValue +0x2cf0 一带、`__csg_scene_state_snapshot_ref_at` 邻域）；
   ②panic 文案 `code=refcount_underflow`；③复现方法=本线 gate 轮（任意一次启动）。
   修复后需 r51b（或后续代）场景源双目标重编 + 重建 provider/scene .so + 重装配 APK。
2. **Android panic 语义（runtime lane，一行级）**：
   `src/core/runtime/program_support_backend.cheng:9298` `cheng_panic_cstring_and_exit_export`
   （及 `:46 c_exit_runtime` 消费面）在 Android 目标不得走 libc `exit`（会 `__cxa_finalize(NULL)`
   摧毁宿主全部静态量——本 FORTIFY 的直接机制）；应改 `abort()` 语义（真 Let-it-crash，产生
   tombstone）。该改动影响所有 Android 内嵌宿主，需 runtime lane owner 拍板，本线未改。
3. **非修复项澄清**：.so 瘦身（scene .so 已 stripped，24.7MB 为 18.6MB 真实 text+5.5MB 数据段）、
   4K 对齐、去 RELRO/lazy、分拆 .so、dlopen 延迟——全部与根因无关，已由证据链排除。

## 4. 待主仓入库清单

1. 本任务文档。
2. （无 bootstrap patch——本线对主仓源码零改动。上述 §3-2 一行级语义修复属 src/core/runtime，
   建议由 runtime lane 以正式 patch 落地后进回归。）
3. 工具沉淀（已在 `/Users/lbcheng/cheng-f24/uf2_gate_lane/`，克隆外持久）：
   `uf_gate.c`（v3：300µs mutex watchdog + dlopen 时间线 + 零延迟 POST-CHECK + 20s 附加窗）、
   `watch_catch.py`（裸 gdb-remote：Z1 断点 + Z2 写观察点 + 寄存器/栈捕获 + panic 文本读取）、
   `run_catch_round.sh`（原子轮：安装校验→启动→附加→抓捕）、`catch_out/`（毁写现场寄存器/栈）、
   `gate_round1.logcat`/`maps_round.logcat`/`catch_round.logcat`（全部原始日志）。

## 5. BLOCKED 项

1. **L4 烟测 PASS**：blocked 于 §3-1 ORC underflow 本体修复（场景链重建级）。在修复前，
   壳在 runtime create 必 panic，任何 APK 层操作都无法达成 10s 存活，不做假绿。
2. panic 文本精确到对象的捕获（Z1 断点被 lldb-server 以 E09 拒绝，未取到 x0 字符串）：
   现有分类已足够（underflow 家族唯一），对象级定位留给 runtime lane 复核时用同类坡道补。
3. 本线期间 scenfix 克隆被并行会话（m17b 装配链 lane）整体删除重建，其一键链重建进度不在
   本线可见范围；本线根因结论即该 lane 重建后修 underflow 的直接输入。

## 6. 纪律

- 主仓零源码改动、UniMaker 仓零改动、两仓零 git 写操作；设备操作全程与其他会话竞态重试
  （含一次 EMUI 安装器多会话死锁的清理：kill 队列内 `cmd package install` 后单发恢复）。
- 所有结论均有真机日志/寄存器/栈原始输出对应；无推测当结论、无假绿。
