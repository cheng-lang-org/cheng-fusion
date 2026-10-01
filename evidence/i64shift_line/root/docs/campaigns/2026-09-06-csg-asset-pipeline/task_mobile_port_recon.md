# SSM1 场景流栈移动端（Android/HarmonyOS）移植侦察

日期：2026-09-11。性质：只读侦察 + 受控探针。探针产物与日志全部在
`/Users/lbcheng/cheng-f24/anchor_clones/streamdev/artifacts/mobile_recon/`，主仓零源码改动。
车头：`/private/tmp/cheng_w126_re`（2026-09-07 冻结 C 车头）。克隆根：streamdev（SSM1 栈已内）。

---

## 1. 目标支持矩阵（src/core/backend 静态盘点）

| 层 | 文件:行 | android (`aarch64-linux-android`) | ohos (`aarch64-linux-ohos`) | 说明 |
|---|---|---|---|---|
| object emit | direct_object_emit.cheng:107-115 `DirectObjectEmitTargetObjectSupported` | elf=true | elf=true | 同函数还支持 darwin macho、a64/x64-linux-gnu elf、windows coff、全部 riscv elf |
| object format | target_matrix.cheng `TargetPrimaryObjectFormat` | "elf" | "elf" | |
| linker flavor | target_matrix.cheng `TargetLinkerFlavor` | **"system_linker"（无内部链接器）** | 同左 | 内部链接器只覆盖 darwin/a64-linux-gnu/x64-linux/riscv/windows |
| linker program | target_matrix.cheng `TargetLinkerProgram` | "android_aarch64_clang" | "ohos_aarch64_clang" | 外部 clang |
| provider 要求 | target_matrix.cheng `TargetRequiresNativeProviderModules` | true | true | darwin/a64-linux-gnu/wasm/bare 为 false |
| canonical regalloc 约束 | codegen_contract.cheng:804-817 `CodegenUnitConstraintSet` | **无分支 → panic** | 同左 | 仅 darwin/a64-linux-gnu/x64-linux/riscv；主仓源码层 canonical regalloc 未覆盖 mobile |
| 链接执行（新 driver 源码） | native_link_exec.cheng:251-266 `NativeLinkExecArgv` | **仅 `--emit:shared`**（`-shared -fPIC -Wl,--no-undefined -ldl -lm`） | 同左 | exe → Err "unsupported mobile output mode: executable" |
| 链接执行 clang 发现 | native_link_exec.cheng:147-200 | `ANDROID_AARCH64_CLANG` / `ANDROID_NDK_HOME` / `NDK_HOME` / `ANDROID_HOME` 下探 ndk/29.0.13599879(api35)、ndk/26.3.11579264(api21)；**27.0.12077973 不在探测列表** | 仅 `OHOS_AARCH64_CLANG` 且文件必须存在 | 本机只装 NDK 27.0.12077973 |
| nolibc CRT/startup | system_link_exec.cheng:6358-6372 | **无**（仅 aarch64/arm64-unknown-linux-gnu 注入 nolibc runtime+entry.S） | 无 | mobile exe 无内部 CRT 路径 |
| build plan 目标枚举 | build_plan.cheng:106-117 `BackendTargetFromTriple` | 不在枚举（落到默认 darwin） | 同左 | BackendTarget 枚举只有 wasm/darwin/a64-linux-gnu/x64-linux/msvc |
| 车头实测（w126_re） | `cold_elf_system_link` 字符串模板 | exe 支持：`<clang> -static -Wl,--allow-multiple-definition -Wl,--no-keep-memory ...`，clang 候选链 `aarch64-linux-android21-clang`（ANDROID_NDK_HOME/NDK_HOME 下 prebuilt/darwin-{arm64,x86_64}、linux-x86_64）→ 交叉 gcc 候选 | **exe/shared 显式拒绝**：`OHOS AArch64 executable emit unsupported; use --emit:obj`；`unsupported emit: shared` | 车头（旧）与新 driver 源码（新，仅 shared）方向相反，接线时以主仓源码为准 |

**--target 合法值全集**（direct_object_emit + target_matrix 汇总）：
`arm64-apple-darwin`、`aarch64-apple-ios`、`arm64-apple-ios`、`x86_64-apple-darwin`、
`aarch64-unknown-linux-gnu`、`arm64-unknown-linux-gnu`、`aarch64-linux-android`、
`aarch64-linux-ohos`、`aarch64-unknown-linux-ohos`、`x86_64-unknown-linux-gnu`、
`riscv64-unknown-linux-gnu`、`riscv64-unknown-none-elf`、`riscv32-unknown-linux-gnu`、
`riscv32-unknown-none-elf`、`riscv32-esp32s31-none-elf`、`esp32s31`、
`aarch64-pc-windows-msvc`、`arm64-pc-windows-msvc`、`x86_64-pc-windows-msvc`、
`wasm32-unknown-unknown`。

**非法 triple 实测**（hello.cheng 最小夹具）：

```
$ cheng_w126_re system-link-exec --in:artifacts/mobile_recon/hello.cheng \
    --emit:exe --target:aarch64-fake-bogus ...
[cheng_cold] unsupported target: aarch64-fake-bogus
```

---

## 2. Android 探针（全部真实输出）

环境事实：
- NDK：`/Users/lbcheng/Library/Android/sdk/ndk/` 只有 `27.0.12077973`（prebuilt 仅 darwin-x86_64，含 `aarch64-linux-android21-clang`）。
- 用户 shell `ANDROID_NDK_HOME=/Users/lbcheng/Library/Android/sdk/ndk/26.3.11579264` 指向不存在的目录。
- qemu-user（qemu-aarch64）不存在；有 qemu-system-aarch64、Android emulator + AVD `cheng_a34`（android-34 arm64-v8a）；另有一台 adb 真机在线。

### 2.1 第一次 exe 编译（默认环境）：链接器落空回退主机 clang

```
RC=2
[cheng_cold] ELF system link failed
# smoke_android.exe.link.log:
ld: unknown options: --allow-multiple-definition --no-keep-memory
clang: error: linker command failed with exit code 1 (use -v to see invocation)
```

根因：`ANDROID_NDK_HOME` 悬空 → 车头候选链全落空 → 回退主机（Apple）clang，其 `ld` 拒绝 Linux 风格 ld 选项。**缺的不是 syscall 桩也不是 CRT，是交叉链接器发现失败后的回退把错误藏到了主机工具链。**

### 2.2 第二次 exe 编译（`ANDROID_NDK_HOME` 指向 NDK 27）：成功

```
$ ANDROID_NDK_HOME=.../ndk/27.0.12077973 cheng_w126_re system-link-exec \
    --in:src/tests/csg_scene_stream_smoke.cheng --emit:exe \
    --target:aarch64-linux-android --out:.../smoke_android.exe
RC=0
system_link_exec=1
real_backend_codegen=1
system_link_exec_scope=cold_elf_system_link
cold_compile_elapsed_ms=1298.904        # 11417 行源码
output=.../smoke_android.exe

$ file smoke_android.exe
ELF 64-bit LSB executable, ARM aarch64, version 1 (SYSV), statically linked, with debug_info, not stripped
```

编译+静态链接全通（1.3s）。`cheng_host_*` provider 钩子在产物内全部有定义（llvm-nm：`cheng_host_fopen/fread/fwrite/fflush/malloc/free/mmap_anon/...` 均 T），编译闭包自洽。

### 2.3 真机试跑（HUAWEI DCO-AL00，Android 12/HarmonyOS，arm64-v8a，API 31）：bionic 加载器拒绝

```
$ adb push smoke_android.exe /data/local/tmp/cheng_smoke_android && adb shell chmod 755 + 运行
error: "/data/local/tmp/cheng_smoke_android": executable's TLS segment is underaligned: \
       alignment is 8 (skew 0), needs to be at least 64 for ARM64 Bionic
Aborted
DEVICE_RC=134   # SIGABRT
```

readelf 证据：

```
TLS  0x0a84c0 0x2aa4c0 0x2aa4c0 0x000008 0x000008 R  0x8      # PT_TLS p_align=8, memsz=8
.tdata  PROGBITS 00000000002aa4c0 ... 000008 WAT 0 0 8
唯一 TLS 符号: _ZZN8gwp_asan15getThreadLocalsEvE6Locals (8字节, WEAK, TLS)  ← 来自 NDK libc.a 的 GWP-ASan
```

定性：
- **Cheng 代码本身零 TLS**（.tdata 唯一符号来自 bionic 静态库 gwp_asan，语言栈无 thread_local）。
- 缺口是「bionic 静态 exe 的 PT_TLS p_align 必须 >= 64（Android 12+ 加载器门禁）」与「NDK libc.a gwp_asan 对象 .tdata 对齐 8」+「lld 静态链接取输入最大对齐」的组合。
- 修复方向（任选其一，均为链接/后端层）：代码生成对 TLS 段固定 sh_addralign=64；链接前对 libc.a 内 gwp_asan.o 的 .tdata 提升对齐（objcopy --set-section-alignment）；或车头 android 链接 argv 追加等效强制。
- 另发现：`llvm-nm -u` 有一个未解析引用 `U libc_accept`（provider 网络桩引用；本栈未调用网络，静态 exe 加载不做符号解析，TLS 修复后需复测确认无运行期影响）。

**结论：android「最小可跑」缺口 = 1 个：bionic TLS 对齐门禁（8 → 64）。编译、代码生成、静态链接、provider 闭合全部已通。**

### 2.4 对照：`--emit:shared`

```
[cheng_cold] unsupported emit: shared
```

车头不支持 shared emit；主仓 native_link_exec 源码相反（mobile 仅支持 shared）。新 driver 与车头能力集不一致，接线时按主仓源码实现。

---

## 3. OHOS 探针

工具链事实：
- `/Users/lbcheng/Library/Huawei/Sdk`：仅 `licenses` + `system-image/HarmonyOS-6.0.31/phone_all_arm`（模拟器镜像），**无 native 编译工具链**。
- `/Users/lbcheng/Library/ArkUI-X/Sdk/17/arkui-x/toolchains`：仅 ace_tools 模板/bin，find 无 clang/ld.lld。
- `OHOS_AARCH64_CLANG` 未设置且无候选文件。

实测：

```
# --emit:exe
[cheng_cold] OHOS AArch64 executable emit unsupported; use --emit:obj

# --emit:shared
[cheng_cold] unsupported emit: shared

# --emit:obj → 成功
RC=0
$ file smoke_ohos.o
ELF 64-bit LSB relocatable, ARM aarch64, version 1 (SYSV), not stripped
```

**结论：ohos 当前可达上限 = 合法 aarch64 ELF 可重定位对象。exe/so 都被车头显式封死，且本机无 OHOS native clang，`NativeLinkExecOhosClang` 只认 `OHOS_AARCH64_CLANG` 一个入口。ohos 最小可跑缺口 = (1) 拿到 DevEco native SDK 的 llvm 工具链并用 `OHOS_AARCH64_CLANG` 接线；(2) 车头/新 driver 放开 ohos exe 或 so 链接路径；(3) musl-based OHOS 的 CRT/启动路径（无 nolibc 注入）。**

---

## 4. SSM1 栈依赖审计（manifest / player / daemon / reader 传递闭包）

直接 import 面：
- `manifest.cheng`：std/rawbytes、cheng/game/assets/import/reader
- `reader.cheng`：std/strings、std/os、std/result、std/rawbytes、std/crypto/sha256
- `player.cheng`：仅 manifest
- `ssm1_tick_daemon.cheng`：std/os、std/parseutils、std/strings、std/strutils、std/system、manifest、player

实际调用到的平台原语（grep 实证，四文件零命中 mmap/socket/fork/GetEnv/路径分隔符）：

| 档 | 项 | 依据 |
|---|---|---|
| **可直接用** | rawbytes / strings / strutils / parseutils / system 纯内存逻辑 | 无平台依赖 |
| | sha256（std/crypto/sha256） | 纯计算 |
| | stdin/stdout 行协议（`os.C_fgetc(os.Get_stdin())`、`os.Write(os.Get_stdout(),...)`、`C_fflush`） | libc fgetc/fwrite/fflush，bionic/musl 全有；android 产物内 `cheng_host_*` 已闭合（探针 2.2） |
| | 整文件读（reader → `os.ReadFileBytesResult` → `cheng_host_fopen/fread`，配额冻结 256MiB/1GiB） | 同上；无 mmap 依赖 |
| **需桥接** | daemon 进程模型：由 Swift 宿主壳 spawn + stdin/stdout 管道 | Android 上宿主壳变成 APK/NDK 侧：可保留管道协议（in-process 线程对或 local socket），spawn 语义归壳层 |
| | 文件路径来源：`init <ssm1路径>` 由宿主传入 | 四文件无分隔符硬编码，str 透传；Android 需换成 app 沙箱/storage 路径，OHOS 需沙箱映射 |
| | 进程退出/panic 路径（`panic("daemon_stdout_flush_failed")`、exit） | bionic 下行为待真机复测（当前被 TLS 门禁挡住） |
| **不可用/未用（闭包外）** | os.cheng 的 socketpair/fd 传递/GetEnv/usleep/socket、mmap | SSM1 四文件零调用，不构成移植阻塞；os 模块整体在 android 编译闭包内已链接通过 |

---

## 5. 结论与移植顺序建议

**Android（最近路径）**
1. 修 bionic TLS 门禁：Cheng 对象发射层对 TLS 段固定 64 对齐，或 android 链接 argv/预处理强制（一次性后端工作，见 2.3）。
2. 把 NDK 27.x 加入 `NativeLinkExecAndroidClang` 自动探测列表（或文档化必须 `ANDROID_AARCH64_CLANG`/`ANDROID_NDK_HOME`），并处理悬空 `ANDROID_NDK_HOME` 的静默回退（应 hard-fail 而不是退回主机 clang——本次 2.1 的假错误正是这么来的）。
3. 复测真机：smoke → daemon → 宿主壳管道协议。
4. 集成形态二选一：静态 exe（已通，适合 Termux/模拟器/CI）或 `.so` + JNI（主仓 native_link_exec 已生成 `-shared -fPIC -Wl,--no-undefined` argv，走新 driver 接 NDK clang 即可，同时把 TLS 对齐修复合用于 so）。

**OHOS（次之）**
1. 取 DevEco/OHOS native SDK 的 llvm 工具链，设 `OHOS_AARCH64_CLANG`（唯一接线点）。
2. 放开 ohos exe/so 链接（车头封死、新 driver 仅有 shared argv），补 musl CRT/启动路径；obj 层已证明代码生成可用。
3. 本机华为 SDK 只有模拟器镜像，OHOS 运行验证依赖模拟器或真机，先按 obj/file + 模拟器冒烟排期。

**顺序**：TLS 对齐修复 → NDK 探测/回退治理 → android 真机 smoke 复测（exe）→ 新 driver 的 android shared → OHOS 工具链获取 → OHOS so/exe 放开 → 双平台 daemon 壳接线。

**风险登记**
- codegen_contract `CodegenUnitConstraintSet` 对 android/ohos panic：canonical regalloc 主线未声明 mobile 目标；车头能编说明旧路径绕开，但按 AGENTS 规则 7，「mobile 编译通过」不等于 canonical regalloc 已接线，后续接入 canonical allocator 时必须补 mobile 约束集。
- `U libc_accept` 未解析引用（2.3）需在 TLS 修复后真机复测排除。
- 本报告所有车头行为绑定 `/private/tmp/cheng_w126_re`（2026-09-07）；主仓源码（native_link_exec 等）能力集与之不同，正式移植以前者产物+后者源码双基准复核。
