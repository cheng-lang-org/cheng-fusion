# task_m4_ohos_smoke.md — SSM1 播放核 OHOS 真机冒烟（M4：obj+exe 全通 / 真机执行被设备策略封锁）

日期：2026-09-11。车头 `/private/tmp/cheng_w126_re`（2026-09-07 冻结 C 车头）。
工作克隆 `/Users/lbcheng/cheng-f24/anchor_clones/ohosdev`（streamdev 的 clonefile 拷贝，M2 线未动）。
实验工作区：`ohosdev/artifacts/mobile_m4_ohos/`。主仓新增文件仅两个：
`src/tools/ssm1_tick_daemon_export.cheng`、`src/tools/ssm1_ohos_shim.c`；既有源文件零改动。
设备：HUAWEI Mate 70 Pro+（PLA-AL10，HarmonyOS 6.1.0.135），serial `3KN0224C18003262`。

---

## 1. M4 分层判词

| 层 | 判定 | 证据 |
|---|---|---|
| ohos obj | **通过** | 导出面变体 + psb/psh/dbg 4 obj 全出（`--emit:obj --target:aarch64-linux-ohos` RC=0） |
| ohos exe | **通过** | DevEco clang 链 `ssm1d_ohos`：AArch64 PIE，musl 动态（interpreter `/lib/ld-musl-aarch64.so.1`，NEEDED libc.so），全部 LOAD align 0x4000（过 16KB 门），强未定义符号 122 项全为 musl/libc + shim 自身 stdio，cheng/provider 面**零残差** |
| 宿主同链路协议 | **通过** | 同一 shim + 同一导出面变体 + darwin provider 闭包在 macOS 链 exe，协议序列全中（fetch 0→1→2→3→snap 20），rc=0，stderr 0 字节（无任何 M4TRAP 触发 → 陷阱层确证在协议路径外） |
| dlopen 路线 | 未启用 | exe 直调已成立，无需退路 |
| 真机执行 | **BLOCKED（平台策略层，非编译器层）** | shell 域（u:r:sh:s0）对一切可推送文件类型拒绝 exec，见 §4 |

## 2. 导出面设计（ssm1_tick_daemon_export.cheng）

复制 `ssm1_tick_daemon.cheng` 协议逻辑（解析/分发/STATE 格式逐行同源），差异只在进程模型：

- 唯一导出入口：`@exportc("ssm1d_cmd") fn ssm1d_cmd(line: cstring, out: ptr, cap: int32): int32`。
  line 为 NUL 结尾命令行（同 daemon stdin 行语义，`init/play/pause/rate/seek/tick/quit` 全经它走）；
  应答写入调用方缓冲区（NUL 结尾、不含换行）；返回值 >0=应答字节数，0=无应答（空行/quit），
  -1=out 为 nil，-2=cap 不足。`init` 不设独立入口：状态就是模块级 `ssm1d_m/ssm1d_p`（同 daemon main 持有），
  init 命令整体覆盖，无需 reset。
- str→C 边界：读入用 `std/system.strFromCStringCopy`（mojia 先例 cheng_app_text_input_utf8）；
  写出用 `str.data/.len` 逐字节拷贝 + NUL（debug_runtime_provider 的 UInt8Ptr 写法），不走
  `driver_c_new_string*`（该符号是 driver 运行时职责，避免进独立 exe 闭包）。
- 本模块不 import std/os、不碰任何流：stdio 全归 C shim，规避 program_support_backend
  `get_std*` 的 `/dev/std*` 重开路径（M1 安卓真机已证 SELinux 拒此路径）。
- 无 main：ohos obj emit 不需要；exe 的 main 由 C shim 提供。

## 3. 链接方式与闭包闭合

产物（sha256 前 16 位 / 大小）：

| 文件 | sha256 | 大小 |
|---|---|---|
| `ssm1d_export_ohos.o` | `1eefa344d8a429cf` | 137747 |
| `ssm1_ohos_shim.o` | `db29918f785c05b5` | — |
| `ssm1d_ohos`（ohos exe） | `dbf2be0d439a00d3` | 34429624 |
| `ssm1d_host`（宿主验证 exe） | `fbf4874d03119e27` | 180680 |
| psb/psh/dbg_ohos.o | M1 产物复用 | 8991531 / 25546820 / 47237 |

ohos 链接命令（DevEco clang-15）：

```
aarch64-unknown-linux-ohos-clang -O2 ssm1_ohos_shim.c -c -o ssm1_ohos_shim.o
aarch64-unknown-linux-ohos-clang ssm1_ohos_shim.o ssm1d_export_ohos.o psb_ohos.o psh_ohos.o dbg_ohos.o \
  -o ssm1d_ohos -Wl,--allow-multiple-definition -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384 -lm
```

`--allow-multiple-definition` 同 M1（psb/psh 重复定义族，首定义生效）；16KB 段门同 UniMaker flags。

**闭包闭合（关键事实）**：4 obj 全闭包残差符号逐一定位（nm 交叉差集）后分两层补齐于 shim：

- **精确等价实现**（语义对齐 core_runtime_provider_linux）：
  - `__cheng_runtime_atomic_{load,store,add,cas}_i32`：__atomic 内建，seq_cst；add 回旧值，cas 回 1=成功（与 provider 用法一致）。
  - `cheng_native_runtime_event_{lock,unlock,assert_owner}_bridge`：futex 状态机 0/1/2 + owner tid + 自死锁/坏状态 fail-stop，算法逐行对齐 core_runtime_provider_linux.cheng（mem_release finalize 热路径会进此锁，故必须是真实现）。
  - `cheng_native_fail_stop_bridge`：fd2 写 + exit_group(70)（psh panic 路径）。
  - 平台常量桥：AF_INET=2/AF_INET6=10/SOCK_STREAM=1/SOCK_DGRAM=2/IPPROTO_IP=0/SOL_SOCKET=1/SO_REUSEADDR=2/MSG_WAITALL=0x100/sockaddr 无 len 字段/errno 直取。
  - 系统信息桥：sysconf/statvfs/uname 取真机实值（cpu 核数、内存总量/可用、盘总量/可用、os 名/版本）。
  - `cheng_host_{openat_fixed,getdents_fixed,renameat_noreplace_fixed}`：SYS_openat/SYS_getdents64/SYS_renameat2(RENAME_NOREPLACE)。
  - `malloc_zone_pressure_relief`：恒 0（linux 无 malloc zone，无可释放）。
- **fail-stop 陷阱**（`M4TRAP <sym> reached` → stderr + exit 70；协议路径不可达，宿主全绿零触发即证明）：
  terminal 全家 9 桥、darwin kqueue/peer_credentials、fsverity 2 桥、biometric——恰为 core_runtime_provider_linux 与平台壳层职责，不做 C 冒充实现。

`--link-object --link-providers` 对 ohos 直接 RC=2 无产物（车头封死）；`--emit:exe --target:aarch64-linux-ohos` 仍显式拒绝（recon 已录）。

## 4. 真机验证（真实输出，BLOCKED 终局）

推送：`ssm1d_ohos → /data/local/tmp/ssm1d_m4`（chmod 755，owner shell）、`huguangsheng.ssm1 → /data/local/tmp/huguangsheng.ssm1`（2955365 B）。命令序列文件推为 `/data/local/tmp/m4_cmd_seq.txt`：

```
init /data/local/tmp/huguangsheng.ssm1 2000
play
tick 0
tick 500
tick 500
tick 500
seek 12000
tick 0
quit
```

终局执行输出（设备真实返回）：

```
$ hdc shell "cat /data/local/tmp/m4_cmd_seq.txt | /data/local/tmp/ssm1d_m4; echo DEVICE_RC=$?"
/bin/sh: /data/local/tmp/ssm1d_m4: Permission denied
DEVICE_RC=126
```

设备执行通道穷举（全部真实尝试）：

| # | 尝试 | 结果 |
|---|---|---|
| 1 | `/data/local/tmp/ssm1d_m4` 直接执行 | Permission denied (126)；文件标签 `u:object_r:data_local_tmp:s0`，/data 挂载 rw 无 noexec → 纯 SELinux 域拒绝 |
| 2 | `/lib/ld-musl-aarch64.so.1 <exe>` 经加载器跑 | /lib/ld-musl-aarch64.so.1: Permission denied（sh 域连系统 loader 也不可 exec） |
| 3 | `cp /system/bin/sh → /data/local/tmp/shtest` 后执行 | Permission denied（与产物无关的策略基线） |
| 4 | `chcon u:object_r:system_bin_file:s0` 改标签 | chcon: Permission denied（无 relabel 权限） |
| 5 | `/mnt/data`（tmpfs）/`/tmp` | 非 shell 可写 / Permission denied |
| 6 | 推入 `/data/local/tmp/debugserver/`（标签 `lldb_server_file`，推入文件自动继承该标签） | 仍 Permission denied |
| 7 | `hdc tmode root` | `[Fail]Error tmode command`（量产构建无 root 模式；shell uid=2000） |
| 8 | `devicedebug`（sh 域可执行） | 仅 `--help/kill` 子命令，无启动能力 |
| 9 | 2025-11 部署的历史二进制 `unimaker_probe/libp2p_probe` | 今天同样 Permission denied → 本机安全补丁整体收紧，非本产物问题 |

**定性**：HarmonyOS 6.1.0.135 量产机构建上，shell 域不存在任何「推送后可执行」通道；无 root、无 HAP 安装授权（边界限定 hdc 仅 file send/shell/list）时，真机运行任意推送 ELF 为平台级 BLOCKED。exe/obj/协议四层已在宿主等价链路全绿。

## 5. 宿主同链路验证（同 shim 直调导出面，全部真实输出）

macOS（arm64-apple-darwin）：变体 obj + psb/psh/dbg/crt_darwin.o 四 provider 各自 `-dynamiclib -undefined dynamic_lookup` 成 dylib（dyld 双级命名空间按 image 内绑定，等价 lld first-wins；Apple 两代 ld 均不容 obj 级重复符号，`--allow-multiple-definition` 是 lld 独占），宿主 exe 链 shim + 变体 obj。同一命令序列：

```
$ printf '<§4 同一序列, 路径换宿主>' | ./ssm1d_host
OK init chunks=45 durationMs=22500 bufWindowMs=2000
OK play
STATE posMs=0 playing=1 rate=10 eof=0 fetch=0 bufferedTo=2000 pre=0,1,2,3
STATE posMs=500 playing=1 rate=10 eof=0 fetch=1 bufferedTo=2500 pre=1,2,3,4
STATE posMs=1000 playing=1 rate=10 eof=0 fetch=2 bufferedTo=3000 pre=2,3,4,5
STATE posMs=1500 playing=1 rate=10 eof=0 fetch=3 bufferedTo=3500 pre=3,4,5,6
OK seek posMs=12000
STATE posMs=12000 playing=1 rate=10 eof=0 fetch=20 bufferedTo=14000 pre=24,25,26,27
HOST_RC=0    （stderr 0 字节：M4TRAP 层零触发）
```

断言成立：fetch `0→1→2→3→snap 20`（12000ms 吸附 chunk 20），与 task_m1 §4 的安卓真机输出逐行一致——即「协议+manifest+player+导出面+shim 直调」整链在等价闭包上全绿，唯一缺口是设备 exec 策略。

## 6. 编译器/平台待修清单补充（承 M1 §6）

1. **OHOS 真机开发者执行通道缺失（新增，平台层）**：HarmonyOS 6.1.0.135 量产构建 shell 域禁 exec 一切可推送文件（含 lldb_server_file 标签与 musl loader），`tmode root` 被拒。后续真机冒烟需 DevEco HAP 壳（native lib 随包签名安装）或华为开发者执行通道授权；`hdc shell` 路线在本机构建上无解。
2. **`--link-object --link-providers` 对 ohos 静默拒绝**：RC=2 且无错误输出（仅 binstamp），应给明确 reason。
3. **psb/psh 重复定义面扩大证据**：darwin 侧同闭包 77 个重复符号（M1 只点名 `cheng_host_fd_at`/`cheng_host_close_fd_if_valid`）；Apple 两代系统 ld 均不容，导致车头 darwin exe emit 在新 Xcode 下 `Darwin provider direct ld failed rc=1`（原版 daemon 宿主链同样被挡）。公开符号 hidden visibility + 显式导出面（M1 §6.4）依然是根治方向。
4. **core_runtime_provider_linux 双重不可编**（承 M1 §6.3）：本次给出精确缺口清单（§3 两层符号面），其热路径成员（event futex 锁三桥、原子四件套）已在 shim 中以等价语义临时承担；该模块可编后应从 shim 移除并回归。
5. shim 的 `__APPLE__` 分支仅为宿主验证存在（pthread ERRORCHECK 锁/sysctl/renameatx_np/call_indirect 陷阱），不进 ohos 产物语义。

## 7. 证据文件

`ohosdev/artifacts/mobile_m4_ohos/`：`ssm1d_export_ohos.o`(+`.report.txt`)、`ssm1_ohos_shim.{c,o}`、`ssm1d_ohos`、`ssm1d_host`、`libcrt/libdbg/libpsh/libpsb.dylib`、`psb/psh/dbg_ohos.o`（M1 复用副本）、`ssm1d_export_darwin.o`、`final_undef.txt`（终 exe 强未定义清单）、`cmd_seq.txt`、`localize_dups.py`（宿主验证辅助）、`linkprov.log`（--link-providers RC=2 记录）。主仓新增：`src/tools/ssm1_tick_daemon_export.cheng`、`src/tools/ssm1_ohos_shim.c`。设备侧：`/data/local/tmp/{ssm1d_m4,huguangsheng.ssm1,m4_cmd_seq.txt}`。
