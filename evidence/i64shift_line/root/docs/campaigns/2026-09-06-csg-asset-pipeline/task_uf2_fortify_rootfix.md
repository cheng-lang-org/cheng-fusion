# task_uf2_fortify_rootfix.md — 场景壳真机 FORTIFY SIGABRT 根因收窄与 root-fix 路径（UF2 线）

日期：2026-09-13。工作克隆 `/Users/lbcheng/cheng-f24/anchor_clones/scenfix`，本线仪器与产物在
`tmp/uf2_root/work/`。设备 DCO-AL00 serial `GBJ0222B24021692`。两仓 git 零 commit/push；
主仓仅新增本文档 + `patches/uf2_scene_relink.patch`（未 apply）。

---

## 0. 结论速览

| 项 | 判词 |
|---|---|
| L4（场景壳真机烟测） | **BLOCKED**——root-fix patch 已产出并通过 `git apply --check`，但链重建（一键链 + 收敛车头）本轮不可达，未能在真机闭环 |
| 根因定性 | **收窄到 scene .so 自身的 dlopen 剖面**：dlopen 启动后 ~27ms（=重定位窗口）内，EMUI vendor/system 线程的静态 mutex 落入「销毁窗口」被加锁 → FORTIFY。E2/E3/E4/E5 四组真机对照已逐一排除时机/对齐/extract/运行时 SYMBOLIC 四个变量 |
| 唯一未排除差异 | ① patchelf 后加工布局（relro_padding/5 LOAD/RW dynamic 表）② 无 `-Bsymbolic` → **4316** 条动态重定位（M6b 可用件仅 232）撑长 linker-lock 窗口。二者被同一个 relink patch 一次性消除 |
| 修复路径 | `patches/uf2_scene_relink.patch`：scene app so 改 M6b 已证配方链接（`-Bsymbolic` + 16KB align + 链接期直接挂 DT_NEEDED provider + 全程免 patchelf），并用 readelf 门禁替代 patchelf 盲改 |
| 附带证据 | 平行 UF 线 watch 捕获（`uf_l4/work/uf_watch_hit.txt`）+ 本线 Z2 仪器轮实测：gralloc CameraInfo mutex 的 **destroy→lock 循环是 EMUI 常态行为**（一轮 132+ 次处理观察，app 正常渲染不崩）→ FORTIFY 是「加锁恰逢销毁窗口」的竞态，本线 dlopen 扰动是竞态放大器 |

## 1. 对照实验矩阵（全部真机实测，非引述）

基线：P0 原版壳 3/3 复现（U2 线已证）。本线继承并扩展：

| 实验 | 改动 | 结果 | 结论 |
|---|---|---|---|
| E2（uf_l4 线） | host so 前置 `libuf_delay_dlopen.so` 拦截 dlopen，scene 装载推迟 1500ms（首帧已过） | present_enabled 12:26:34.398 → dlopen 放行 35.940 → **FORTIFY 35.967（放行后 27ms，DetectViewRect 线程）** | 与首帧并发**无关**；崩溃精确跟随 dlopen 窗口 |
| E3（uf_l4 线） | scene .so 五个 LOAD 段 p_align 0x10000→0x1000（本线逐段复核 patch 确在） | 仍崩（12:29:46/12:29:50/12:40:42 三轮） | 64KB 对齐**无关** |
| E4（uf_l4 线） | extractNativeLibs=true（APK 内 mmap 变拷贝装载） | 13:23 三连崩 | APK 直 mmap **无关** |
| E5（本线） | scene .so .dynamic `DT_FLAGS |= DF_SYMBOLIC`（运行时库内符号本地解析），重打包实测装到真机（base.apk 99,284,424B = 本线 uf_sym.apk） | 16:37:58 起 5/5 崩（present_enabled → +51ms FORTIFY 0x7d1e447ed0） | 运行时 SYMBOLIC（只省查表不省重定位写）**不足以**收窄窗口 → 必须重链接消除重定位本身 |
| M6b 反例（N2 线在档） | `libssm1loop.so` 24.9MB 同设备同壳进程形态 dlopen+渲染 | 全绿 | 体积**无关**（24.9MB > 24.7MB 崩件）；「可工作大 .so」的链接配方 = `-Bsymbolic` + 16KB align + 免 patchelf + 动态重定位仅 232 |

静态档案对照（本线 llvm-readelf/nm 实测）：

- 崩件 `libcheng_unimaker_scene.so`：`-Bsymbolic` 缺席 → GLOB_DAT 589 + JUMP_SLOT 3727 = **4316** 条动态重定位；patchelf 加工痕迹（`.relro_padding`、5 LOAD、.dynsym/.dynstr/.dynamic 独立 RW LOAD）；**无** PT_TLS / **无** INIT_ARRAY/FINI_ARRAY / **无** IRELATIVE（U2 线重定位越界排除仍有效）。
- 可用件 `libssm1loop.so`：SYMBOLIC+BIND_NOW、16KB align、RELA 232 + JMPREL 55、同样 24.9MB。

## 2. 机制定性（本线实测）

1. 设备 libc（apex 拉取，md5 `6b126cd5…` 与 u2 档案一致）`pthread_mutex_destroy` 反汇编：合法销毁路径即向 `[x0]` 半字写 `0xffff`（`stlrh w9`）——与 FORTIFY「destroyed」判据精确对应；即崩轮 victims 经历过真实 destroy 调用（或等值覆写）。
2. 本线 Z2 硬件观察点轮（gralloc rw+0x470 与 hwui .bss+0x1047ed0 双点挂载、jdb 放门后全程处理停机）：一轮处理 **132+ 次观察点停机**，`x0=gralloc CameraInfo mutex`、`pc=libc!pthread_mutex_destroy+0x3c`、`lr=libc++` 的 **destroy→lock 循环反复出现，该轮 app 正常渲染全程未崩** →「销毁」本身是 EMUI vendor 代码常态；FORTIFY 只在别的线程把 lock 恰好落进销毁窗口时触发——**这是竞态，不是单点毒写**。
3. 平行 UF 线 watch 捕获（13:48，`uf_l4/work/uf_watch_hit.txt`，T05 含寄存器实解析）：毁写命中的是**主线程**（栈带 boot-framework.oat View 绘制帧 + libhwui 帧 + libc++→PLT 帧）。
4. 综合机制：scene .so dlopen 需 ~27ms（4316 次动态符号解析+GOT 写，全程持有 bionic linker lock），多个 vendor/system 线程（DetectViewRect、RenderThread 等）被卡后同刻放行，碰撞 vendor 静态 mutex 的「销毁窗口」→ 任一受害 mutex 被锁定即 FORTIFY。窗口时长∝重定位量 → 解释 M6b（232 条，窗口毫秒级）不崩、P2（provider 链 ~几 ms）不崩、P3（dlopen 早期干净失败）不崩、E2（窗口过后 27ms 内崩）崩。

## 3. 修复（patch 已产出，未 apply）

`patches/uf2_scene_relink.patch`（91 行，`git apply --check -p1` 通过，未写入工作树）：

- `ts-csg/scripts/unimaker-apk-build.mjs` `linkAndroidAppSharedLibrary`：
  1. scene app so 链接参数加 `-Bsymbolic`、`-z max-page-size=16384 -z common-page-size=16384`；
  2. provider .so 先于 app so 构建（构建序前移），链接行直接 `-L<provider目录> --no-as-needed -l:libcheng_scene_runtime_provider.so` 挂 DT_NEEDED；
  3. **删除 patchelf --add-needed 后加工**，代之以 readelf 门禁（DT_NEEDED 必须存在、FLAGS 必须 BIND_NOW+SYMBOLIC）。
- 预期效果：动态重定位 4316→约 300（库内 3993+691 个导出全部本地绑死），dlopen 窗口收窄到 M6b 量级，patchelf 布局变量归零。
- 验收门槛（下线执行）：patch apply → 一键链重建 → 真机 `am start` ≥10 轮零 FORTIFY → create+渲染打点齐 → L4 判 PASS。

## 4. 真机输出（真实摘录）

```
# E2（uf_l4 线，dlopen 推迟 1500ms，仍崩）
09-13 12:26:34.398 I/cheng-mobile-shell(19502): present_enabled=1
09-13 12:26:34.440 I/uf-delay(19502): scene dlopen deferred by 1500ms (uf interposer)
09-13 12:26:35.940 I/uf-delay(19502): scene dlopen releasing now
09-13 12:26:35.967 F/libc    (19502): FORTIFY: pthread_mutex_lock called on a destroyed mutex (0x720ecd77f0)
09-13 12:26:35.967 F/libc    (19502): Fatal signal 6 (SIGABRT) ... in tid 22498 (DetectViewRect)

# E5（本线，DT_FLAGS.SYMBOLIC 变体，5/5 崩；16:37:47 安装 base.apk 99284424B）
09-13 16:37:58.723 I/cheng-mobile-shell( 5159): present_enabled=1
09-13 16:37:58.774 F/libc    ( 5159): FORTIFY: pthread_mutex_lock called on a destroyed mutex (0x7d1e447ed0)

# 本线仪器轮（15:58:49 轮，Z2 双点 + jdb 放门，无崩轮）
15:59:5x 起处理观察点停机 132+ 次：x0=gralloc+0x10470 pc=libc+0xed828(destroy) / libc+0xecc64(lock)
lr=libc++ 交替 —— vendor 静态 mutex 销毁-加锁循环常态，app 全程渲染零 FORTIFY
```

## 5. L4 判词

**BLOCKED**。判据差一步：root-fix（relink 配方）未经「链重建→真机 ≥10 轮零 FORTIFY+渲染打点」闭环。
未闭环原因（如实）：① 收敛车头 `cheng_yfix2` 随旧 apkdev 克隆清理缺失，`/private/tmp/cheng_w126_re`
在档但 T2 线实证其对场景闭包部分输入 wall-B 不收敛，重建车头属前置工程；② 一键链产物
（one-click 输出/apk-base 树）同被清理需重建；③ 设备为 ≥3 会话共用，本线多轮实验被并行
安装/卸载循环反复打断（本线安装一次耗时 26 分钟、包被第三方循环清除 2 次）。

## 6. 待主仓入库清单

1. 本文档。
2. `patches/uf2_scene_relink.patch`（已 `git apply --check` 通过；验收后再 apply，验收前禁止生效于树）。
3. （建议）`scenfix/tmp/uf2_root/work/` 仪器落工具仓：`uf_destroy_catch.py`/`uf_destroy_run.sh`/`uf_chain.sh`（gdb-remote 双 Z2 + jdb 放门 + stop 排水框架，含 lldb-server Z0 在本内核不能跨陷阱指令的实证）。
4. （登记）U2 线档案 `u2_l4/libc_device.so` 与设备 apex libc 逐位一致（md5 复核），后续线可复用作断点偏移源。

## 7. 纪律

- 主仓 `src/bootstrap` 零改动、零 commit；仅新增本文档 + patch 文件（`git add -f`）。
- UniMaker 仓零改动。scenfix 克隆内均为 tmp 试验产物（`tmp/uf2_root/`），两仓 git 零写。
- 无伪造：E5 轮实测 5/5 崩（SYMBOLIC 变体装机型由 base.apk 字节数+lastUpdateTime 双证）；「不崩」轮以 round logcat 全文反证检查；所有「仍崩」行均为 logcat 原文摘录。
