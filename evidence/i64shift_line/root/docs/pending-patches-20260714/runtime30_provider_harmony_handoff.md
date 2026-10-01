# core_runtime_provider_harmony 移交包（RUNTIME 30）

状态：handoff-only（本文件只写包，不实施任何源码/工具改动）。
口径来源：`tools/harmony_host_gen_gap_census.sh`（2026-07-14 复跑基线 113/21/77/57=268，UNABSORBED 57）+ `docs/harmony-host-codegen-migration-plan.md` §2.2 RUNTIME 条目 + `src/core/runtime/core_runtime_provider_{darwin,linux}.cheng` 的 `@exportc` 表面 rg 对照。
归属判据：UNABSORBED 57 中落在 `cheng_gui_host_gen.c:920-1273` 的 `__attribute__((weak))` C ABI 运行时桥块，逐函数 rg 对照 darwin/linux provider 的 `@exportc` 表面。

---

## 0. 范围与计数

- **本包迁移函数数：30**（UNABSORBED 57 = RUNTIME 30 + MEDIA_DECODE 11 + 残余 16；另两桶见 `unabsorbed_residual_verdicts.md`）。
- 30 = `cheng_gui_host_gen.c:920-1273` 的 38 个 weak 符号块 **减去 8 个非 core_runtime_provider_harmony 域**：
  - `__wrap_cheng_malloc`/`__wrap_cheng_free`（2，`--wrap` 链接器插桩，仅 `CHENG_LEAK_AUDIT` 下编译，provider 无对应）→ 残余（leak-audit 域）。
  - `c_iometer_call`（1，空仪表钩子，provider 无对应）→ 残余（iometer 域）。
  - `cheng_mobile_protect_*`/`cheng_mobile_udp_*`（5，HY2TUN/VPN 域）→ 残余（H2/H3 VPN 域）。★争议见 §5。
- 30 个全部是纯 POSIX/bionic 薄包装（errno/strerror/time/clock_gettime/fopen/fclose/fwrite/socket/bind/setsockopt/sendto/recvfrom/inet_pton/inet_ntop/poll/open/read/close/calloc/free/sysconf），**不依赖任何 OH_ 专属 API**——与 linux provider 用 glibc、darwin provider 用 libc 同形，OHOS bionic sysroot（`native/sysroot/usr/include`）原样供给。

---

## 1. files（新 provider 文件骨架清单）

| 文件 | 动作 | 说明 |
|---|---|---|
| `src/core/runtime/core_runtime_provider_harmony.cheng` | **新增** | 30 个 `@exportc` 函数实现 + `core_runtime_provider_trace_export`（对齐 darwin/linux 的 `@exportc("core_runtime_provider_trace")`）。结构镜像 `core_runtime_provider_linux.cheng`：顶部 `@importc` POSIX 声明 + `@exportc` 导出 + 内部 helper。 |
| `src/core/runtime/core_runtime.cheng` | **改 1 处** | `CoreRuntimeProviderSourcePath`（:23-26）加 `tmat.TargetIsHarmony(targetTriple)` 分支返回 `CoreRuntimePath(rootDir, "src/core/runtime/core_runtime_provider_harmony.cheng")`。需先确认 `TargetIsHarmony` 是否已在 target 模块定义；未定义则一并加。 |
| `platform/harmony/ChengGuiDemo/entry/src/main/cpp/CMakeLists.txt` | **改 prebuilt 段** | 把 `core_runtime_provider_harmony` 编出的 `.o` 加进 `cheng_gui_host` 的 prebuilt 链接列表（对齐 linux/darwin provider 作为 prebuilt `.o` 链接的现有模式，见迁移蓝图风险登记册 "prebuilt provider .o 过期 ABI 断裂" 条：`nm` 关键符号校验模板必须保留，不得假设 `.o` 永远最新）。 |
| `platform/harmony/ChengGuiDemo/entry/src/main/cpp/cheng_gui_host_gen.c` | **删 30 个 weak 定义**（H1 落地后） | 30 个 `__attribute__((weak))` 定义迁入 provider 后，gen.c 侧删除（provider 的强符号覆盖之）。保留 `__wrap_*`/`c_iometer_call`/`cheng_mobile_*`（残余桶处置）。 |

**不改**：`cheng_gui_host_adapter.c`、`cheng_gui_entry.cpp`、`cheng_gui_host_shared.h`、`cheng_gui_host_adapter_contract.h`、生成器 `mobile_shell_codegen.cheng`（RUNTIME 不是 host-codegen 域，生成器不发射这 30 个）。

---

## 2. action（30 函数迁移顺序，按依赖分批）

每批可独立编译链接验证。批内无相互依赖，批间依赖只往下指。

### 批 0 — 基础叶子（21 个，无内部依赖，纯 libc 直 passthrough）
| # | 函数（gen.c 行段） | 签名 | 依赖 API（OHOS bionic sysroot） | provider 对照 |
|---|---|---|---|---|
| 1 | `cheng_errno` (989-991) | `int32_t cheng_errno(void)` | `errno` (thread-local) | linux `@exportc("cheng_errno")` ✓已有同名骨架 |
| 2 | `cheng_strerror` (993-995) | `char* cheng_strerror(int32_t err)` | `strerror` | linux `@exportc("cheng_strerror")` ✓已有同名骨架 |
| 3 | `cheng_epoch_time` (997-999) | `double cheng_epoch_time(void)` | `time` | 需新增（provider 仅有 `_seconds`/`_ms`） |
| 4 | `cheng_epoch_time_seconds` (1001-1003) | `int64_t cheng_epoch_time_seconds(void)` | `time` | linux `@exportc("cheng_epoch_time_seconds")` ✓已有同名骨架 |
| 5 | `cheng_epoch_time_ms` (1005-1011) | `int64_t cheng_epoch_time_ms(void)` | `clock_gettime(CLOCK_REALTIME)` | linux `@exportc("cheng_epoch_time_ms")` ✓已有同名骨架 |
| 6 | `cheng_monotime_ns` (1013-1019) | `int64_t cheng_monotime_ns(void)` | `clock_gettime(CLOCK_MONOTONIC)` | 需新增 |
| 7 | `cheng_os_fopen_mode_bridge` (1021-1027) | `void* cheng_os_fopen_mode_bridge(const char* path, const char* mode)` | `fopen`/`EINVAL` | 需新增 |
| 8 | `cheng_fclose` (1029-1035) | `int32_t cheng_fclose(void* stream)` | `fclose`/`EINVAL`/`EOF` | 需新增 |
| 9 | `cheng_fflush` (1037-1039) | `int32_t cheng_fflush(void* stream)` | `fflush` | 需新增 |
| 10 | `cheng_fwrite` (1041-1057) | `int32_t cheng_fwrite(void* buf, int64_t size, int64_t n, void* stream)` | `fwrite`/`SIZE_MAX` | 需新增 |
| 11 | `get_stderr` (1063-1065) | `void* get_stderr(void)` | `stderr` | 需新增 |
| 12 | `libc_socket` (1073-1075) | `int32_t libc_socket(int32_t domain, int32_t type, int32_t protocol)` | `socket` | linux `@exportc("libc_socket")` ✓已有同名骨架 |
| 13 | `libc_close` (1077-1079) | `int32_t libc_close(int32_t fd)` | `close` | linux `@exportc("libc_close")` ✓已有同名骨架 |
| 14 | `libc_fcntl` (1081-1083) | `int32_t libc_fcntl(int32_t fd, int32_t cmd, int32_t arg)` | `fcntl` | linux `@exportc("libc_fcntl")` ✓已有同名骨架 |
| 15 | `libc_bind` (1085-1091) | `int32_t libc_bind(int32_t fd, void* addr, int32_t addr_len)` | `bind`/`sockaddr`/`socklen_t`/`EINVAL` | linux `@exportc("libc_bind")` ✓已有同名骨架 |
| 16 | `libc_setsockopt` (1093-1099) | `int32_t libc_setsockopt(int32_t fd, int32_t level, int32_t opt_name, void* opt_value, int32_t opt_len)` | `setsockopt`/`EINVAL` | linux `@exportc("libc_setsockopt")` ✓已有同名骨架 |
| 17 | `libc_sendto` (1101-1119) | `int32_t libc_sendto(int32_t fd, void* payload, int32_t payload_len, int32_t flags, void* addr, int32_t addr_len)` | `sendto`/`EINTR`/`INT32_MAX` | linux `@exportc("libc_sendto")` ✓已有同名骨架 |
| 18 | `libc_inet_pton` (1121-1127) | `int32_t libc_inet_pton(int32_t family, const char* src, void* dst)` | `inet_pton`/`EINVAL` | linux `@exportc("libc_inet_pton")` ✓已有同名骨架 |
| 19 | `libc_inet_ntop` (1129-1135) | `void* libc_inet_ntop(int32_t family, void* src, void* dst, int32_t size)` | `inet_ntop`/`EINVAL` | linux `@exportc("libc_inet_ntop")` ✓已有同名骨架 |
| 20 | `cheng_system_entropy_fill` (1137-1165) | `int32_t cheng_system_entropy_fill(void* dst, int32_t len)` | `open("/dev/urandom", O_RDONLY\|O_CLOEXEC)`/`read`/`close`/`EINTR`/`EIO` | 需新增 |
| 21 | `cheng_udp_platform_use_len_field_bridge` (1191-1193) | `int32_t cheng_udp_platform_use_len_field_bridge(void)` | （常量返回 0，无 API） | linux `@exportc("cheng_udp_platform_use_len_field_bridge")` ✓已有同名骨架 |

### 批 1 — 分配器（2 个，calloc 基，被批 2 依赖）
| # | 函数（gen.c 行段） | 签名 | 依赖 API | provider 对照 |
|---|---|---|---|---|
| 22 | `cheng_malloc` (931-940) | `void* cheng_malloc(int32_t size)` | `calloc`/`INT32_MAX` | 需新增（provider 导出 `cheng_runtime_malloc`，**符号名不一致**——见 §4 决策） |
| 23 | `cheng_free` (942-949) | `void cheng_free(void* p)` | `free`/`malloc_usable_size`(仅 audit) | 需新增（provider 导出 `@exportc("cheng_linux_slab_free") cheng_runtime_free`，**符号名不一致**——见 §4 决策） |

### 批 2 — 字符串/IO 派生（4 个，依赖批 0/1）
| # | 函数（gen.c 行段） | 签名 | 依赖 | provider 对照 |
|---|---|---|---|---|
| 24 | `driver_c_new_string` (951-961) | `char* driver_c_new_string(int32_t size)` | `cheng_malloc`/`abort`/`INT32_MAX` | linux `@exportc("driver_c_new_string")` ✓已有同名骨架 |
| 25 | `cheng_cstrlen` (963-972) | `int32_t cheng_cstrlen(const char* s)` | `strlen`/`abort`/`INT32_MAX` | 需新增（provider 导出 `@exportc("strlen")`，名不一致——见 §4） |
| 26 | `driver_c_new_string_copy_n` (974-987) | `char* driver_c_new_string_copy_n(void* raw, int32_t n)` | `cheng_malloc`/`memcpy`/`abort`/`INT32_MAX` | linux `@exportc("driver_c_new_string_copy_n")` ✓已有同名骨架 |
| 27 | `cheng_fwrite_i32` (1059-1061) | `int32_t cheng_fwrite_i32(void* buf, int32_t size, int32_t n, void* stream)` | `cheng_fwrite`（批 0 #10） | 需新增 |

### 批 3 — fd/udp 桥（3 个，依赖批 0）
| # | 函数（gen.c 行段） | 签名 | 依赖 | provider 对照 |
|---|---|---|---|---|
| 28 | `cheng_fd_wait_readable_bridge` (1167-1189) | `int32_t cheng_fd_wait_readable_bridge(int32_t fd, int32_t timeout_ms)` | `poll`/`POLLIN`/`EINTR`/`EINVAL` | linux `@exportc("cheng_fd_wait_readable_bridge")` ✓已有同名骨架 |
| 29 | `cheng_udp_recvfrom_addr_ptr_bridge` (1195-1231) | `int32_t cheng_udp_recvfrom_addr_ptr_bridge(int32_t fd, void* buf, int32_t len, int32_t flags, void* addr, int32_t addr_cap, void* out_addr_len, void* out_err)` | `recvfrom`/`socklen_t`/`EINTR`/`EINVAL`/`INT32_MAX` | linux `@exportc("cheng_udp_recvfrom_addr_ptr_bridge")` ✓已有同名骨架 |
| 30 | `cheng_udp_recvfrom_addr_bridge` (1233-1242) | `int32_t cheng_udp_recvfrom_addr_bridge(int32_t fd, void* buf, int32_t len, int32_t flags, void* addr, int32_t addr_cap, int32_t* out_addr_len, int32_t* out_err)` | 调 `cheng_udp_recvfrom_addr_ptr_bridge`（#29） | linux `@exportc("cheng_udp_recvfrom_addr_bridge")` ✓已有同名骨架 |

**已有同名骨架：18** | **需新增/名映射：12**。迁移顺序：批 0 → 批 1 → 批 2 → 批 3（每批落地后 `nm` 验证强符号就位再开下一批）。

---

## 3. @exportc 边界

- 全部 30 个用 `@exportc("<原名>")` 导出，**保持符号名与 gen.c 现状逐字一致**（host 侧 `dlsym`/直接调用不改名），这是与 `cheng_gui_host_adapter_contract.h` APP-EXPORT 表对账的前提。
- `core_runtime_provider_trace` 必须导出（darwin/linux 都有 `@exportc("core_runtime_provider_trace")`，`CoreRuntimeContract.traceSymbol` 硬编码读这个名字）。
- provider 编译为独立 `.o`（prebuilt 链接），与 gen.c 同 `.so`；gen.c 侧的 weak 定义在 H1 落地后删除，由 provider 强符号覆盖（迁移期可双定义共存——weak + 强，链接器选强，零行为变化，是安全过渡态）。

## 4. SABI 合规注（rg `docs/cheng-formal-spec.md` no-pointer 条款）

- **no-pointer 生产门禁（ZRPC，§0.2/§6）**：默认公开编译口径（`cheng`/`release-compile`/`chengc`）下用户源码模块禁指针（`T*`/`void*`/`ref T`/`ptr[T]` + 解引用/取址/`ptr_add`/`copyMem` 等），`@importc/@exportc` **不再豁免**。**但** `core_runtime_provider_{darwin,linux}.cheng` 全程使用 `ptr`（如 `fn cheng_runtime_malloc(size: int32): ptr`、`fn libc_bind(fd: int32, addr: ptr, ...)`、`fn cheng_ptr_plus(base: ptr, off: int32): ptr`）——provider 属 **runtime/compiler 内部实现**（非用户公开源码模块），与 `@abi_internal` 同性质的逃生口（spec §7："`@abi_internal` 是唯一允许 compiler/runtime 内部声明使用 Cheng `str` 24 字节布局的逃生口"）。**harmony provider 沿用此内部口径，`ptr` 合规**，不触发 `no-pointer policy` 诊断。
- **SABI 字符串（§7）**：`str` 不得作 C ABI 裸参数/返回值。本 30 个**无 `str` 参数/返回**——`driver_c_new_string`/`driver_c_new_string_copy_n` 返回 `char*`（= `ptr`，NUL 终止），调用方 `cheng_free` 释放，等价 `owned_cstring` 语义但走 `ptr`（与 darwin/linux provider `driver_c_new_string_export(size0): ptr` 同形，provider 内部口径允许）。
- **out 参/句柄**：`cheng_udp_recvfrom_addr_ptr_bridge` 的 `out_addr_len: ptr`/`out_err: ptr`、`libc_bind` 的 `addr: ptr` 等裸 `ptr` 出参/句柄，spec §7 用户表面优先 `@ffi_out_ptrs`/`@ffi_handle`，但 provider 内部口径沿用 darwin/linux 既有的裸 `ptr` 出参（一致性优先于表面合规重写，重写会引入三端分叉）。
- **符号名一致性 > SABI 表面重写**：`cheng_malloc`/`cheng_free`/`cheng_cstrlen` 与 provider 既有的 `cheng_runtime_malloc`/`cheng_linux_slab_free`/`strlen` 名不一致。**决策**：harmony provider 导出 host 期望的原名（`cheng_malloc`/`cheng_free`/`cheng_cstrlen`），**不**让 host 改名去迁就 linux provider 的 slab 命名——host 侧符号名是 `cheng_gui_host_adapter_contract.h` APP-EXPORT 表的权威源，改名会扯断契约对账。linux/darwin provider 的异名是它们自己的历史，harmony 不继承。

---

## 5. 边界争议（必须在 H1 实施前与用户拍板）

**★`cheng_mobile_*` 5 个（protect_callback_ready/protect_fd/udp_debug_event/udp_fd_wait_readable/udp_recvfrom_addr_ptr_bridge）**：
- rg 对照 `core_runtime_provider_linux.cheng`：5 个**全部有 `@exportc` 同名骨架**（linux :2566-2617 区段 `cheng_mobile_protect_callback_ready`/`cheng_mobile_protect_fd`/`cheng_mobile_udp_debug_event`/`cheng_mobile_udp_fd_wait_readable`/`cheng_mobile_udp_recvfrom_addr_ptr_bridge`，darwin provider 同区段亦有）。
- 严格按"与现 provider 对照，标已有同名骨架/需新增"判据，这 5 个**应归 RUNTIME → core_runtime_provider_harmony**（已有同名骨架），RUNTIME 实为 **35** 而非 30。
- 任务书给的 ~30 把它们排除，隐含"harmony VPN/HY2TUN 是独立域（harmony_vpn_provider 或 H2/H3 adapter）"的域切分。但 darwin/linux provider 的先例是 mobile_* ∈ core_runtime_provider（VPN 客户端复用 runtime provider 的 C ABI）。
- **两种合理解**：(A) mobile_* 进 core_runtime_provider_harmony（RUNTIME=35，与 darwin/linux 先例一致）；(B) mobile_* 进独立 harmony VPN/HY2TUN 域（RUNTIME=30，任务书口径）。本包按 (B) 写 30，但 (A) 的 provider 先例证据更强。**需用户拍板**。若选 (A)，本包批 0/3 各加对应函数，RUNTIME 35 / 残余 11 / 计数 35+11+11=57 仍闭合。

---

## 6. verify（验证门）

1. **census 分类迁移对账**：H1 落地后重跑 `tools/harmony_host_gen_gap_census.sh`，确认 30 个从 `UNABSORBED` 消失（gen.c 侧定义删除后 census 不再计入；若迁移期保留 weak 双定义，census 仍计 ADAPTER-ONLY 或 GEN-EQUAL——以 provider 强符号链接为准）。基线 113/21/77/57 → 30 离开 UNABSORBED（57→27），GEN-EQUAL/GEN-DIFF/ADAPTER-ONLY 不应出现非预期新增 diff（directional 表 4 条断言仍 OK）。
2. **smoke**：`cheng.stage3 system-link-exec --in:src/tests/mobile_shell_codegen_smoke.cheng` 编译+运行 rc=0（provider 文件改的是 runtime 域，不触生成器，smoke 应零漂移）。另需新增/扩一个 `core_runtime_provider_harmony` 的桌面 smoke（darwin/linux provider 是否已有对应 smoke 需先查；无则按 linux provider 的导出子集写最小调用断言）。
3. **(未来) assembleHap**：`hvigorw assembleHap` 全绿 + `llvm-nm libcheng_gui_host.so` 确认 30 个符号为强定义（来自 provider `.o`，非 weak undefined）。需设备/DevEco 窗口，本包不执行，列检查项。
4. **ABI 校验**：CMakeLists prebuilt 段保留 `nm` 关键符号存在性校验（迁移蓝图风险登记册要求），不得假设 provider `.o` 永远最新。

## 7. done

- `core_runtime_provider_harmony.cheng` 落地，30 个 `@exportc` 强符号就位；`CoreRuntimeProviderSourcePath` 加 Harmony 分支。
- gen.c 侧 30 个 weak 定义删除（或迁移期保留双定义，终局切单一提交删）。
- census UNABSORBED 计数 57→27（RUNTIME 30 离开），零非预期 diff。
- `cheng_gui_host_adapter_contract.h` APP-EXPORT 表若有这 30 个 dlsym 符号，重新生成后收录关系不变（provider 强符号与原 weak 同名）。
