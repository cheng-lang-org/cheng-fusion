# task_u2_fortify_l4.md — 场景壳真机 FORTIFY SIGABRT 定位与 L4 攻坚（U2 线）

日期：2026-09-13。工作克隆 `/Users/lbcheng/cheng-f24/anchor_clones/scenfix`（本日发现已被
清理，按 Y/T2 线同法自主仓 `cp -cR` 重建，主仓零改动零 git 写操作）。设备 DCO-AL00
serial GBJ0222B24021692（adb 在线，与其他会话共用）。两仓 git 零写操作。

---

## 0. 结论速览

| 项 | 判词 |
|---|---|
| FORTIFY SIGABRT 复现 | 原版壳 APK 3/3 稳定复现（主线程，present_enabled 打点后 ~40-90ms） |
| 崩点定性 | 主线程首帧绘制/缓冲路径 `pthread_mutex_lock` 命中**已被写 0xffff（Android 12 bionic destroyed 语义）的静态 mutex**：一轮回合锁在 `/vendor/lib64/libgrallocutils.so` .data（gralloc::CameraInfo::GetInstance 的函数级 static std::mutex），另一轮锁在 `libhwui.so` .bss 全局 `std::recursive_mutex`（vaddr 0x1047ed0）——**多个不同系统/vendor 库的静态 mutex 被毁** |
| 二分定位（APK 重打包法，全部实测） | P1 桩 scene：不崩；P2 桩 scene+真 provider：不崩；P3 真 scene+桩 provider（dlopen 早期干净失败）：不崩；**P7 真 scene（cheng_app_init 字节级补成 `mov w0,#0;ret`）+真 provider：仍崩** ⇒ 破坏性写发生在**真 scene 库 dlopen（映射+重定位）窗口内、与主线程首帧并发**，不依赖 cheng_app_init 执行 |
| 排除项（均已实测/验证） | ① exit()/__cxa_finalize 全局析构清扫：libc `exit` 设 Z0 断点未命中、SIGABRT 先到，排除；② scene 库重定位越界：`.rela.dyn` 4316 项 + `.rela.plt` 3727 项 r_offset **全部**落在可写 LOAD 段界内，排除；③ cheng 侧毒化值：free 毒化为 0xDD 且本库无 0xdead10cc/0xffff 常量写入路径；④ 我方 .so 全部 10 个 **零** pthread_mutex/dlclose 引用，我方代码不可能直接 destroy |
| L4 | **BLOCKED**（未达成）。壳烟测无法在 FORTIFY 修复前通过 |
| 修复 | **未落地**（写坏者未捕获，见 §3 BLOCKED） |

## 1. 真机输出（全部实测，非引述）

```
10:14:30.629 23941 I cheng-mobile-shell: computer_use_native_overlay disabled; ...
10:14:30.634 23941 I cheng-mobile-shell: present_enabled=1
10:14:30.675 23941 F libc    : FORTIFY: pthread_mutex_lock called on a destroyed mutex (0x71eda47ed0)
10:14:30.676 23941 F libc    : Fatal signal 6 (SIGABRT) in tid 23941 (.unimaker.scene), pid 23941
```

- FORTIFY 地址跨轮稳定于 **0x71eda47ed0（= /system/lib64/libhwui.so .bss vaddr 0x1047ed0，
  zygote 继承地址空间所致跨进程同值）**；watchpoint 轮另见 0x712ff23470
  （= /vendor/lib64/libgrallocutils.so rw +0x470）——**不同轮命中不同库的静态 mutex**。
- 崩轮 abort 栈（gdb-remote `g`+栈内存扫描+maps 归属，实测）：
  `abort → __fortify_fatal → HandleUsingDestroyedMutex → pthread_mutex_lock →
  libc++.so std::mutex::lock → libhwui+0xa544（bl recursive_mutex::lock，锁定目标
  0x1047ed0 反汇编核实）← boot-framework.oat（Java View 绘制路径）`。
  另一轮：`libgrallocutils+0x66dc（gralloc::GetSize → CameraInfo::GetInstance）`。
- 设备行为：EMUI 对本 app 的早期崩溃**不落 tombstone、不进 dropbox**（bugreport 内
  /data/tombstones 最新条目仍为 09-12 19:06 的 RenderThread 旧崩），crash 缓冲仅两行无回溯；
  本线自建 lldb-server(gdbserver) run-as 附加坡道 + 裸 gdb-remote 客户端突破此限制拿到
  上述栈与寄存器（工具沉淀见 §4）。
- 回归基线：P7 轮安装包内 lib 经字节比对确认确为补丁版（init= `00008052 c0035fd6`），
  排除"补丁未生效"假象。

## 2. 二分矩阵（决定性证据，全部真机实测）

| 配置 | scene 库 | provider 链 | cheng_app_init | 结果 |
|---|---|---|---|---|
| P0（原版/T2 产物） | 真 r51b | 真（ps+cp+hr+bridge） | 真 | **FORTIFY 3/3** |
| P1 | 桩(空导出) | 不加载 | 桩 | 不崩（create 失败干净退出路径） |
| P2 | 桩+DT_NEEDED | 真（完整加载+重定位） | 桩 | 不崩 |
| P3 | 真 | 桩（场景 dlopen 于重定位期干净失败） | 未执行 | 不崩 |
| P7 | 真（init 补 ret） | 真 | **补丁跳过** | **仍 FORTIFY** |

推论链：真 scene 库 dlopen（映射+重定位+relro）必须发生、且与主线程首帧并发，才触发
供应商/系统库静态 mutex 被写 0xffff；cheg_app_init 的执行不是必要条件（P7）。
P7 同时排除"init 执行中的野写"，而重定位表静态核验全部在界内——**写坏者尚未捕获**，
候选收窄为：scene 库 dlopen 期间 bionic/Huawei linker 对 64KB align 大段（align=0x10000、
24.7MB、patchelf 加工过的 lib）的处理差异，或该 dlopen 触发的内核侧页行为。

## 3. BLOCKED 项（高价值输入清单）

1. **写坏者未捕获**（本线 5 类预算内唯一定性未闭环项）。已有两把现成钥匙，下线直接续用：
   - `tmp/u2_l4/u2_watch*.sh|.py`：run-as lldb_server_bin gdbserver 附加 + 裸 gdb-remote
     Z2 写观察点（判据已改为 bionic12 语义 `(state&0xffff)==0xffff`，上一轮误用
     0xdead10cc 过滤是无效轮的原因）。注意：lldb-server 对 stop 后新线程需补发
     qfThreadInfo 才继承 HW 观察点；server 对未完成 attach 时的早到包会自退（脚本已带重试）。
   - `u2_gdbcatch.py`（`g`+`m`+栈扫描）已可稳定拿 abort 全栈。
2. **scenfix 一键链产物缺失**：scenfix 克隆（含 cheng_yfix2 车头、y-r51b-a4fix 重生成件、
   one-click 输出、tmp/y_l1_out/apk-base 构建树）在本会话开始前已被清理，本线以
   `cp -cR` 重建克隆后仅恢复了源码树；**一键链重跑（47 路由+guard+双 bin）是
   重建完整 L4 验证面（含 Kotlin 壳源码级修复如"create 延后至首帧后"）的前置**。
3. **修复落地路径待定**（依写坏者归因而定）：
   a) 若归因 bionic/linker 大对齐段 → 改链接布局（ld.lld 段对齐参数/去 patchelf 加工）；
   b) 若归因并发窗口 → 壳 Kotlin 将 nativeCreate 推迟到主线程首帧完成之后（需 apk 链重建）；
   c) 若归因 vendor 驱动（grallocutils/adreno_app_profiles 与 Y 线 RenderThread 崩同族）→
      上游 ROM 输入，属编译器战役外。
4. **设备崩溃上报链被 EMUI 抑制**（无 tombstone/无 dropbox），建议后续所有真机 native
   排障直接使用本线 run-as gdbserver 坡道，不再依赖 tombstone。

## 4. 沉淀物（scenfix 克隆内，零 git 写操作）

- `tmp/u2_l4/`：P0-P7 全部试验 APK/桩库/补丁 lib、`u2_repack.sh`（zipalign+apksigner
  重打包器，extractNativeLibs=false 需 stored+对齐）、`u2_scan_stack.py`（栈扫描→模块+偏移）、
  `u2_exitbreak*.py/sh`（libc 符号断点）、`u2_watch*.sh|.py`（HW 写观察点）、
  `u2_maps_crash.txt`、`u2_regs.txt`、`u2_exit_stack.txt`、`hwui_syms.txt`、
  `libgrallocutils.so`/`libhwui.so`/`libc_device.so` 设备侧取证件、
  `dropbox_native_crash.txt`、`u2_bugreport{,2}.zip`。
- 设备已恢复原版壳 APK（P0 态，3/3 复现），供下一会话直接续作。

## 5. 纪律

- 主仓 src/bootstrap 零改动、零 git 写操作；UniMaker 仓零改动（本线未迭代
  ssm1_scene_shell.build.mjs——P2 已证 provider 三件合链装载本身无辜，无证据支持改脚本，
  不做无证据改动）。scenfix 克隆为 cp -cR 重建（非 git 操作），克隆内全部为 tmp 试验产物。
- 无伪造：所有"不崩"结论均有对应轮次的完整 logcat 反证检查；所有"崩"均有 crash 缓冲行。
