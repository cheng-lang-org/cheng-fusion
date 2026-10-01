# task_m1_mobile_smoke.md — SSM1 栈 M1 移动端真机冒烟（Android 完成 / OHOS 阻塞点定位）

日期：2026-09-11。车头 `/private/tmp/cheng_w126_re`（sha256 `3ad3bc97…543777`，2026-09-07 冻结 C 车头）。
克隆根 `/Users/lbcheng/cheng-f24/anchor_clones/streamdev`。主仓零源码/编译器改动；新增工具仅
`tools/elf_tls_align_patch.py`。真机：HUAWEI DCO-AL00，serial `GBJ0222B24021692`（HarmonyOS/Android 12，arm64-v8a）。
实验工作区：`streamdev/artifacts/mobile_m1/`（wrapper fakeNDK、补丁 libc.a、stdio 桥、全部产物）。

---

## 1. M1 判词

- **Android = 完成**：`csg_scene_stream_smoke` 真机 **ALL PASS rc=0**（两条 TLS 修复路线各验一次）；
  `ssm1_tick_daemon` 真机协议序列 fetch `0→1→2→3→snap 20` 全中、rc=0、stderr 空。
- **OHOS = BLOCKED（编译器层，非 TLS）**：已到「manifest+runtime provider obj 全出（4/5）+ DevEco clang 链 .so 成功（16KB 段对齐过）」；
  挡在 `core_runtime_provider_linux` 无法被任何现役 driver 编出 obj（车头冷编崩、主仓 selfhost driver plan 缺语义，**UniMaker 生产脚本现状同挂**）。

## 2. TLS underalign 修复（实验序 + 每步 PT_TLS p_align）

门禁：Android 12+ bionic 拒绝 ARM64 静态 exe `PT_TLS p_align < 64`（rc=134 SIGABRT）。TLS 唯一来源
`_ZZN8gwp_asan15getThreadLocalsEvE6Locals`（NDK 27 libc.a 内 gwp_asan，8 字节 weak，`.tdata._ZZN…` sh_addralign=8）。

| # | 尝试 | readelf PT_TLS | 结论 |
|---|---|---|---|
| 1 | baseline 重链 | `… R 0x8` | 复现 p_align=8 |
| 2 | `-Wl,-z,tlsalign=64` | `… R 0x8` | lld：`warning: unknown -z value: tlsalign=64`，静默忽略；`ld.lld --help` 无任何 TLS 选项 → **链接参数无解** |
| 3 | **libc.a 成员对齐替换（成功，首选）** | `… R 0x40` | 见 2.1 |
| 4 | ELF patcher 兜底（成功） | `#5 p_align 8 -> 64`，全文件仅 1 字节差异 | 见 2.2 |

### 2.1 首选修法：补丁 libc.a + `-L` 前置（链接层，真机验证过）

车头 argv（wrapper 实录）：`-static -Wl,--allow-multiple-definition -Wl,--no-keep-memory <4 个 .o> -o <out>`；
用户 `-L` 排在 sysroot `-L` 之前（clang -### 实证），故补丁库可整体换掉 libc.a：

```
NDKBIN=<ndk>/toolchains/llvm/prebuilt/darwin-x86_64/bin
llvm-ar x libc.a guarded_pool_allocator.o guarded_pool_allocator_posix.o gwp_asan_wrappers.o
SEC=.tdata._ZZN8gwp_asan15getThreadLocalsEvE6Locals
for f in 三个 .o; do llvm-objcopy --set-section-alignment "$SEC=64" $f; done
cp -c libc.a patched_lib/libc.a && llvm-ar r patched_lib/libc.a 三个.o
# 车头经 fakeNDK wrapper 注入 -L<patched_lib>（wrapper 见 artifacts/mobile_m1/fakendk/...）
```

### 2.2 兜底工具：`tools/elf_tls_align_patch.py`

只读产物 → 改 PT_TLS `p_align` 8→64 → 写回；前置校验 `(p_vaddr-p_offset)%64==0`（本产物 skew=0x202000%64=0）；
写回后逐字节复核「除 p_align 外零差异 + 其他段头不变」。真机复跑同样 ALL PASS。

## 3. 真机 smoke（M1 安卓证据，真实输出）

`adb push smoke_tls_libcpatch.exe → /data/local/tmp/cheng_smoke_m1`，46 项 PASS 全过，末三行：

```
PASS embedded broken tiling rejected
PASS embedded truncated payload rejected
csg_scene_stream_smoke ALL PASS
DEVICE_RC=0
```

ELF patch 兜底版（`smoke_tls_elfpatch.exe`）真机同样 `csg_scene_stream_smoke ALL PASS / DEVICE_RC=0`。
修复产物 `llvm-nm -u` 仅剩 weak scudo/loader 4 项 + 5 个 darwin 系未解析引用（见 §6.5），smoke/daemon 未触该路径。

## 4. daemon 真机冒烟（真实输出）

前置补丁（与 TLS 无关的第二处真机缺口，**stdout 供给**）：
- 现象：daemon 首条应答即 `os write failed: nil file`（rc=1）。探针实证本机 SELinux 拒绝 `fopen("/dev/stdout","w")` 与 `fopen("/proc/self/fd/1","w")`（双双返回 0x0），而 bionic `stdout` 全局 FILE* 正常。
- 第二层：换上 bionic FILE* 后 `panic("write")`——`program_support_backend.cheng:2616` 的 `cheng_stream_looks_safe` 启发式要求 FILE* 地址 ≥4GiB，静态 bionic stdio（~0x2b0000）被误判 → 回退被拒的 /dev 重开 → fwrite 返回 0。
- 修法（链接层 provider 桥，同仓先例 `src/tests/moq_droid_support/host_bridge.c`）：`android_stdio_bridge.c` 定义 `get_stdin/get_stdout/get_stderr`（bionic stdin/stdout/stderr）+ `cheng_fgetc/fwrite/fread/fflush` 直通版；经 wrapper `PREPEND_OBJ` 前置于全部输入，`--allow-multiple-definition` 首定义生效。

真机管道（daemon+`huguangsheng.ssm1` 推至 `/data/local/tmp/`，bufWindow=2000）：

```
$ printf 'init /data/local/tmp/huguangsheng.ssm1 2000\nplay\ntick 0\ntick 500\ntick 500\ntick 500\nseek 12000\ntick 0\nquit\n' | /data/local/tmp/cheng_ssm1_daemon
OK init chunks=45 durationMs=22500 bufWindowMs=2000
OK play
STATE posMs=0 playing=1 rate=10 eof=0 fetch=0 bufferedTo=2000 pre=0,1,2,3
STATE posMs=500 playing=1 rate=10 eof=0 fetch=1 bufferedTo=2500 pre=1,2,3,4
STATE posMs=1000 playing=1 rate=10 eof=0 fetch=2 bufferedTo=3000 pre=2,3,4,5
STATE posMs=1500 playing=1 rate=10 eof=0 fetch=3 bufferedTo=3500 pre=3,4,5,6
OK seek posMs=12000
STATE posMs=12000 playing=1 rate=10 eof=0 fetch=20 bufferedTo=14000 pre=24,25,26,27
DEVICE_RC=0   （stderr 空）
```

断言成立：fetch `0→1→2→3→snap 20`（12000ms 吸附 chunk 20），与 macOS 参考输出（task_shell_core_wire.md §4.1）逐行一致。

产物（sha256）：
- `smoke_tls_libcpatch.exe` `946c230a…8ab838a`（首选路线）
- `smoke_tls_elfpatch.exe` `605648c5…8728e25`（兜底路线）
- `ssm1_tick_daemon_android.exe` `406e0079…fee582`（PT_TLS=0x40 + stdio 桥）

## 5. OHOS 推进（如实停点：obj + 链 so 成功，运行验证 BLOCKED）

工具链：DevEco `…/sdk/default/openharmony/native/llvm/bin/aarch64-unknown-linux-ohos-clang`（clang-15）；
链接 flags 取自 UniMaker `hongmeng/scripts/build_cheng_libp2p_harmony.sh`（`-shared -fPIC -Wl,-z,defs -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384`）；hdc 在 `…/openharmony/toolchains/hdc`，`hdc list targets` = `[Empty]`（无设备）。

| 步骤 | 结果 |
|---|---|
| 车头 obj：`src/game/assets/stream/manifest.cheng` `--emit:obj --target:aarch64-linux-ohos` | ✅ ELF aarch64 relocatable |
| 车头 obj：`program_support_backend` / `program_support_host_runtime` / `debug_runtime_provider` | ✅ 3/3 |
| 车头 obj：`core_runtime_provider_linux` | ❌ `cheng_cold: expected pointer store value (recovery=0 depth=2)` |
| 主仓 selfhost driver（含 UniMaker `compile_cheng_shim.sh` 原样调用）编同一条目 | ❌ `plan has missing reasons: primary_object_body_semantics_missing`（**UniMaker 生产 ohos 流现状同挂**） |
| DevEco clang 链 `libssm1_manifest_ohos.so`（manifest+psb+dbg+psh） | ✅ 34.5MB AArch64 DYN，LOAD 全部 0x4000（过 UniMaker 16KB 门）；需 `-Wl,-Bsymbolic`（车头公开符号不可抢占重定位）+ `--allow-multiple-definition`（psb/psh 重复定义 `cheng_host_fd_at`/`cheng_host_close_fd_if_valid`） |
| `-Wl,-z,defs` 全闭合 | ❌ 未定义面 = 原子四件套、`cheng_native_runtime_event_lock/unlock/assert_owner`、socket 常量/errno/terminal/系统信息等 `cheng_native_*` 桥——恰为编译失败的 `core_runtime_provider_linux` 职责，不手写 C 补丁冒充 |

OHOS 复跑门：`core_runtime_provider_linux` 可编 + `OHOS_AARCH64_CLANG` 接线 + hdc 设备。

## 6. 待入库清单（主仓/编译器层，本次未动）

1. **TLS（android 链接层）**：把 §2.1 成员对齐替换流程（或后端对 TLS 段固定 sh_addralign=64）落进 `system-link-exec` android 链接路径；NDK 27.x 加入 clang 探测列表 + 悬空 `ANDROID_NDK_HOME` 静默回退改 hard-fail（承 task_mobile_port_recon §5）。
2. **stdio 供给（android 静态）**：`program_support_backend.cheng` 的 `get_std*` 用 `fopen("/dev/stdout")` 在 SELinux 真机上不可用，应改平台 stdio provider（bionic stdin/stdout/stderr）；`cheng_stream_looks_safe` 的 ≥4GiB 启发式对静态 bionic FILE* 系统性误判（本次 `panic("write")` 根因）。
3. **`core_runtime_provider_linux` 双重不可编**：车头冷编崩（expected pointer store value）+ 主仓 driver ohos obj emit plan 缺语义（primary_object_body_semantics_missing，连 UniMaker 生产脚本一起挡死）。
4. **ohos obj emit PIC 卫生**：公开符号需 `-Bsymbolic` 才能链 .so（后端应 hidden visibility + 显式导出面）；psb/psh 重复定义 `cheng_host_fd_at`/`cheng_host_close_fd_if_valid`。
5. **静态 exe 残留未解析引用**：`libc_accept/proc_listpids/proc_pidinfo/spawnvp/sysctlbyname`（darwin provider 未做平台门禁）；真机 smoke/daemon 未触这些路径、无运行期影响，但应平台裁剪。
6. `tools/elf_tls_align_patch.py` 定位为兜底/存量产物修复工具，首选仍是 §2.1 链接层修法。

## 7. 证据文件

`streamdev/artifacts/mobile_m1/`：`clang_argv.log`（车头实录 argv）、`fakendk/`（wrapper）、`patched_lib/libc.a`、`gwp_patch/`、`android_stdio_bridge.c/.o`、`stdio_probe.c`、上列 3 个 sha256 产物、`ohos/`（4 个 obj + `libssm1_manifest_ohos.so`）。真机侧 `/data/local/tmp/{cheng_smoke_m1,cheng_smoke_m1_elfpatch,cheng_ssm1_daemon,huguangsheng.ssm1,stdio_probe}`。
