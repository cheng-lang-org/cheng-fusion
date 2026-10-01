# task_s_psb_psh_symbols.md — psb/psh provider obj 77 项重复定义根治（导出面卫生）

日期：2026-09-12。车头 `/private/tmp/cheng_w126_re`（2026-09-07 冻结 C 车头）。
修复工作树：`/Users/lbcheng/cheng-f24/anchor_clones/ohosdev/artifacts/s_psb_psh_symbols/base_tree`
（克隆 git HEAD `c39783ee5` 的 `git archive` 覆盖树 + 未跟踪 ssm1 源/素材补齐；
基仓 src/bootstrap 零改动，两仓 git 零写）。patch：
`patches/s_psb_psh_exportc_face.patch`（对克隆 HEAD 的 `bootstrap/cheng_cold.c`，
`git apply --check` 干净、应用后与修复树 `cmp` 逐位一致）。

---

## 1. 77 项清单实证（llvm-nm 全量对比 + Apple ld 实链复核）

基线复现（全部真实输出）：M4 宿主验证链成员
`shim_host.o + ssm1d_export_darwin.o + crt_darwin.o + psb_darwin.o + psh_darwin_host.o + dbg_darwin.o`
用系统 clang 直接链接（不加任何宽容旗标）：

```
$ cc -arch arm64 shim_host.o ssm1d_export_darwin.o crt_darwin.o psb_darwin.o \
    psh_darwin_host.o dbg_darwin.o -framework CoreFoundation ... -o ssm1d_host_before
ld: 77 duplicate symbols
clang: error: linker command failed with exit code 1 (use -v to see invocation)  [rc=1]
```

ld 报告的 77 项与 M4 登记 `dups.txt` 逐项一致（`diff` 为空）。逐项归属（定义处×跨 obj 引用）：

| 类 | 项数 | 符号 | 定义处 | 跨 obj 引用 |
|---|---|---|---|---|
| A 工具/包装双重定义 | 42 | `cheng_bytes_copy/set`、`cheng_cstrlen_raw`、`cheng_epoch_time_ms/seconds`、`cheng_monotime_ns`、`cheng_ptr_plus`、`cheng_sleep_ms`、`cheng_str_copy`、`cheng_str_copy_cstring`、`cheng_str_empty`、`cheng_str_view_owned`、`cheng_string_copy`、`cheng_strerror`、`cheng_errno`、`cheng_fd_set_nonblocking_bridge`、`cheng_fd_wait_readable/writable_bridge`、`cheng_mobile_local_proxy_stop_requested/set`、`cheng_mobile_protect_callback_ready`、`cheng_mobile_protect_fd`、`cheng_mobile_tcp_connect4_protected_addr_bridge`、`cheng_udp_platform_use_len_field_bridge`、`driver_c_new_string`、`driver_c_new_string_copy_n`、`libc_accept/bind/close/connect/fcntl/getsockname/inet_ntop/inet_pton/listen/read/recvfrom/sendto/setsockopt/shutdown/socket/write` | crt+psb 各一份 | 无（纯冗余导出） |
| B 访问器双重定义 | 2 | `cheng_host_fd_at`、`cheng_host_close_fd_if_valid` | psb+psh 各一份（两源各写了一份 3 行小函数，`program_support_backend.cheng:3500/3505`、`program_support_host_runtime.cheng:1324/1329`） | 无 |
| C 桥函数 shim∩crt 双重定义 | 32 | `cheng_native_af_inet(6)_bridge`、`errno_code`、`fail_stop`、`ipproto_ip`、`msg_waitall`、`so_reuseaddr`、`sock_dgram/stream`、`sockaddr_use_len_field`、`sol_socket`、`system_{cpu_logical_cores,disk_available_bytes,disk_total_bytes,memory_available_bytes,memory_total_bytes,os_name,os_release}_value_bridge`、`runtime_event_{lock,unlock,assert_owner}_bridge`、`terminal_{child_birth_capture,darwin_kqueue_note_exit_wait,darwin_peer_credentials,decision_watch_arm,event_close,event_wait,fd_close_once,finished_recovery_watch_arm}_bridge`、`linux_fsverity_{enable,measure}_sha256_bridge`、`mobile_biometric_fingerprint_authorize_bridge_native` | crt（真实现）+ shim（M4 补齐的等价/陷阱实现） | psb/psh 引用 |
| C' 桥 shim∩crt 双重定义（无引用） | 1 | `cheng_native_terminal_finished_watch_arm_bridge` | crt+shim | 无 |

M1 只点名 2 项（即 B 类）；M4 记录的「同闭包 77 项」= A+B+C+C' 全集，本次 ld 实链复核逐项吻合。
ohos 侧（`ssm1_ohos_shim.o + ssm1d_export_ohos.o + psb/psh/dbg_ohos.o`，无 crt）实际重复仅 B 类 2 项，
与 M1 记录一致；C 类在 ohos 由 shim 独家提供不构成重复。

## 2. 生成机制（定位结论）

1. **provider obj 的生成方式**：车头对 `src/core/runtime/*.cheng` 逐文件
   `system-link-exec --emit obj --target <t>`（psb=program_support_backend，psh=program_support_host_runtime，
   dbg=debug_runtime_provider，crt=core_runtime_provider_darwin）。mobile 线手工产物默认
   `--symbol-visibility public`：**编译闭包内所有函数（工具函数/薄 libc 包装/桥函数/兜底导出）全部以真实名
   外部符号发布**。每个 provider 源各自内联了同一套 runtime 工具（A 类 42 项在 crt 与 psb 是两份逐行等价的
   实现），公开发射使同名符号在每个 obj 各占一个外部定义 → 任两 obj 相遇即 duplicate。
2. **共享合同别名**：crt 与 psb 还对同一批工具别名**各自声明 `@exportc`**
   （如两处都有 `@exportc("libc_accept") fn libc_accept_export`、`driver_c_new_string*`），
   即便按 @exportc 合同面收敛，A 类中 32 项仍跨源共享 → 需要链级「唯一归属」收敛（见 §3）。
3. **链接器事实**：Apple ld（新旧两代）对 obj 级外部重复定义零容忍；实测 Mach-O
   `visibility("hidden")`（N_PEXT private external）**不豁免** duplicate
   （两 .o 各定义同一 hidden 符号，ld64 仍报 `duplicate symbol`）——所以「打 hidden 标注」不解决问题，
   必须**唯一化**：真去重或编译盐私有改名。lld（ohos）同理报 `duplicate symbol`。
4. **车头自走链已是干净机制**：driver 自己的 provider 发射（`--link-providers`/`--emit:exe` 内部路径）
   自 a7ee2da19（2026-07-26）起硬编码 `provider_symbol_visibility="internal"` + 由主 obj 未定义面迭代求
   roots——本次实测：冻结车头在覆盖树上 `--in ssm1_tick_daemon.cheng --emit exe` rc=0，
   自产 provider objs（provider.o/provider.host.o/provider.core.o/provider.host_c.o）重复定义 0。
   M4 §6.3 记录的「车头 darwin exe emit rc=1」现场合流有二：其一即本文件的手工 obj 链（77 dup），
   其二是旧 Xcode 下 direct ld 工具链准入失配（`Darwin direct ld toolchain identity changed`），
   后者主仓 bafd0ab66 已修；今天在覆盖树上不复现。

## 3. 修复（emit 层，bootstrap/cheng_cold.c，patch `s_psb_psh_exportc_face.patch`）

**核心改动（+43/-11 行）：`--emit:obj --symbol-visibility internal` 不再强制要求 `--export-roots`。**

1. 去掉 `cold internal object visibility requires export roots` 的无条件 hard-die：
   无 roots 时自动以**本模块源文本的 @exportc 声明集**为合同导出面
   （复用 provider root 推导同款 memo 化扫描器 `cold_source_has_exportc_symbol`，别名文本为准）。
2. 合同面之外的函数体照常编译进 obj，但改用**编译盐私有符号**发射
   （`_cheng_cold_<salt>_<idx>`，盐=源字节+import 闭包+target+可见性+roots）：
   跨 obj 私有名在数学上不可能重名 → duplicate 类 A/B 从机制上消失；
   合同符号保持真实名外部，C 消费者/dlsym 面不变。
3. 修掉 reachable-only 分支「凡 emit 必 export」对 internal 模式的泄漏
   （importc 重的 provider 源走 `reachable_entry_only=true`，会把全部函数标 export——这是 public 策略，
   不得泄入 internal 模式）。
4. 模块无任何本地 @exportc 时仍 loud-fail（internal 无合同面即无意义，不静默）。
5. **默认 public 路径零改动**（不做静默默认翻转，零爆炸半径，见 ④字节证据）。
   跨 provider 共享别名（crt∩psb 的 32 个同 @exportc 别名）用既有
   `--symbol-visibility internal --export-roots <csv>` 按**链序最早定义者拥有**规则逐 obj 收敛
   ——这是 driver 自身 provider 发射同款 emit 层机制的正当使用，不是链接器参数掩盖。

## 4. 四项验证（真实输出）

### ① psb/psh/dbg 重编后重复项 = 0

ohos 链（`ssm1_ohos_shim.o + ssm1d_export_ohos.o + psb/psh/dbg_v5_ohos.o`，llvm-nm 全量 T/D/B/S 对比）：

```
=== 验证① ohos 链重复定义: 0 ===
```

darwin 宿主链（`shim_host.o + ssm1d_export_darwin.o + crt/psb/psh/dbg v5/v6_darwin.o`）：

```
v5 链重复定义: 0    （基线同法测得 77）
```

新 obj（sha256 前 16 / 大小）：`psb_v5_ohos.o 6ea2cdb16614b0b8 / 6134183`、
`psh_v5_ohos.o a7b7dd48b42e24a3 / 25453227`、`dbg_v5_ohos.o 73cb5bdb59b0d044 / 26325`
（旧 psb_ohos.o 8991531 / psh_ohos.o 25546820 / dbg_ohos.o 47237；
体积下降来自 roots 可达性裁剪死体）。darwin 侧：
`crt_v5 95e115a5ae43992a / psb_v5 473a4cbf6e8290e7 / psh_v6 b292345ad7b3c6f1 / dbg_v5 680bf9483151b8d4`。

### ② darwin：无 `--allow-multiple-definition`（Apple ld 亦无此旗标）直接出 exe + 协议金标

基线（修前，归档 objs）：`ld: 77 duplicate symbols`，rc=1（§1）。
修后（v5 objs，同一链接命令，零宽容旗标）：

```
$ cc -arch arm64 shim_host.o ssm1d_export_darwin.o crt_v5_darwin.o psb_v5_darwin.o \
    psh_v6_darwin.o dbg_v5_darwin.o -o ssm1d_host_after   [rc=0，链接日志 0 duplicate 0 undefined]
$ cat cmd_seq.txt | ./ssm1d_host_after
OK init chunks=45 durationMs=22500 bufWindowMs=2000
OK play
STATE posMs=0    playing=1 rate=10 eof=0 fetch=0  bufferedTo=2000  pre=0,1,2,3
STATE posMs=500  playing=1 rate=10 eof=0 fetch=1  bufferedTo=2500  pre=1,2,3,4
STATE posMs=1000 playing=1 rate=10 eof=0 fetch=2  bufferedTo=3000  pre=2,3,4,5
STATE posMs=1500 playing=1 rate=10 eof=0 fetch=3  bufferedTo=3500  pre=3,4,5,6
OK seek posMs=12000
STATE posMs=12000 playing=1 rate=10 eof=0 fetch=20 bufferedTo=14000 pre=24,25,26,27
HOST_RC=0
```

与 M4 §5 宿主金标逐行一致（fetch 0→1→2→3，seek 12000 吸附 fetch=20）。另：冻结车头与修补 driver
对 `ssm1_tick_daemon.cheng --emit exe`（走 driver 自身 provider direct ld）均 rc=0 且产物协议全中。

### ③ ohos：so 链接去掉 `-Bsymbolic`/`--allow-multiple-definition` 仍 `-z defs` 闭合

基线（修前，归档 objs，去掉宽容旗标）：

```
ld.lld: error: duplicate symbol: cheng_host_fd_at
ld.lld: error: duplicate symbol: cheng_host_close_fd_if_valid    [rc=1]
```

修后（v5 objs，`-shared -fPIC` 仅保留 16KB 页旗标与 `-Wl,-z,defs`，无 -Bsymbolic/无
--allow-multiple-definition）：

```
SO_LINK_RC=0   → libssm1_core_clean.so (31769848 B, sha256 前16 4ef53990cc2714fb)
NEEDED: libc.so（仅此一个）
LOAD align: 4×0x4000（16KB 门全过）
强未定义面 98 项全为 musl/libc（accept/bind/stdio/tty/poll 等），cheng/ssm1d/Ssm1d 残差 = 0
导出面含合同符号 ssm1d_cmd (T)；smoke/陷阱类内部符号不再出现
```

### ④ 既有门禁不回归

- **默认 public 路径字节不变（patch 零爆炸半径直接证据）**：未修补 HEAD driver 与修补 driver
  对 M4b §2.2 同一闭包（`ssm1_tick_daemon_export.cheng --emit obj --target aarch64-linux-ohos`，
  默认可见性）各出一只 obj：
  `29d6df697952be40…` ≡ `29d6df697952be40…`（sha256 逐位一致）；修补 driver 双跑亦逐位一致（确定性）。
  闭包回执 `unresolved_symbol_count=0`、rc=0。（与 M4 存档 `1eefa344…` 不同代属预期：现 HEAD 源已含
  M4b §7 `ssm1d_load` 新增，且回执绑定 driver 代际；门禁语义「rc=0+未定义 0+确定性」保持。）
- **冻结车头既有 provider smoke**：覆盖树上 `--in ssm1_tick_daemon.cheng --emit exe` rc=0（§2）。
- **修补 driver 既有 provider 流**：daemon `--emit exe` rc=0，自产 provider objs 重复定义 0，
  产物跑 §4 同协议序列全中 rc=0。
- 探针回归：`--symbol-visibility internal` 无 roots 小模块 → 合同符号外、helper 私有，行为符合设计；
  无 @exportc 模块 internal 发射仍 loud-fail（保兜底 loudly 原则）。

## 5. 判词

**S 门全绿（①②③④四门 + 基线双复现）。** 77 项重复定义根因 =
「provider obj 手工 `--emit:obj` 默认 public 发射（每 provider 内联同一套 runtime 工具并真实名导出）
× Apple ld/lld 对外部重复零容忍（hidden 亦不豁免）」。根治落在 emit 层两件事：
(a) 编译器 internal 模式获得 @exportc 自动合同面（本 patch，可独立入库）；
(b) 跨 provider 共享别名链按「链序最早定义者拥有」用既有 `--export-roots` 收敛（管线使用方式，
无编译器改动）。此后 psb/psh/dbg/crt 全链在 darwin exe、ohos so/exe 上均无需
`--allow-multiple-definition`/`-Bsymbolic` 即闭合，-z defs 干净。

## 6. 待主仓入库清单

1. `patches/s_psb_psh_exportc_face.patch`（已 `git add -f` 落仓）：应用于 `bootstrap/cheng_cold.c`
   （对克隆 HEAD `c39783ee5` 校验 `git apply --check` 干净，应用后与修复树逐位一致）。
   入库后需以主仓当态重烤 driver 并重跑 §4 四门（尤其 ④ 的 public 字节对比要以主仓 HEAD 重做）。
2. mobile 管线改用收敛发射（后续任务建议）：psb/psh/dbg/crt obj 改由
   `--symbol-visibility internal`（+ 链级 `--export-roots`，或等 driver 内链 ohos 支持落地后走
   `--link-providers` 自管）生成；M4/M4b 存档 objs 由新代 objs 替换后，链接命令可删除
   `-Bsymbolic` 与 `--allow-multiple-definition`。
3. 残余暴露（非本 77 项族，记录在案）：internal 模式下**全局数据符号**仍真实名外部发射
   （如 psh 的 `chengHostActivate*` 族）；现链无冲突，若未来出现数据符号跨 obj 同名，同法需在
   数据发射路径补私有化。dbg 面已收缩为自动合同面（其符号无链内引用）。

证据目录：`ohosdev/artifacts/s_psb_psh_symbols/`（base_tree 修复树、fixed_driver、
v2objs/{v2 自动面,v3-v6 收敛面}/{darwin,ohos} objs+emit.log、libssm1_core_clean.so、
ssm1d_host_after、ssm1d_daemon_fixed、基线 dup 日志）。
