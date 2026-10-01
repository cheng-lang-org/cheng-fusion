# held-exec darwin 生产臂（路线 A）M1/M2/M4 接线施工图

日期：2026-09-10（只读分析线产出，未改任何源码）。锚点全部为当前工作树实测 grep/read 结果。
权威依据：`docs/campaigns/2026-09-07-pure-cheng-rsi/probes/darwin_authority/DESIGN.md`（M0-M5、P4 定谳、五原语等价）、
`docs/campaigns/2026-08-31-kernel-userpath/design/m3_install_surface_plan.md`（A 路线、M3 安装面）、
`docs/campaigns/2026-08-31-kernel-userpath/verify_append/VERIFY_fullgo_0910_append.md` §十四（M3 决策）。

---

## 零、先决结论（开工前必须知道的四条硬事实）

**Z1｜errcode 31/32/34 当前不可达，只有 33 会真的返回。**
`chengHeldExecParentErrDarwinChannelFramingUnwired=31 / SpawnAuthorityUnwired=32 / RetainedIdentityUnwired=33 /
LauncherIdentityUnwired=34` 定义在 `program_support_backend.cheng:24766-24769`；darwin 臂
（`program_support_backend.cheng:29023-29033`）在两条出口都返回 33，31/32/34 在全文件**仅出现在定义行**
（实测 `grep -n` 只回 24766/24767/24769）。
⇒ **「errcode 31/32 消失」不能作为 M1/M2 的验收判据**：只要 M3 未装，darwin 臂永远在第一个门（retained identity）
返回 33，M1/M2 即使接线完成也观察不到。M1/M2/M4 必须各自有**模块级可证伪探针**（§四），begin_claim 全链 errcode
漫步（33→31→32→claim ok）只能在 M3 装完后作为**端到端**判据。

**Z2｜darwin child 目前过不了 channel 型别门。**
child 入口（`program_support_backend.cheng:26338` `cheng_held_exec_child_import_export`）在
`:26374-26379` 先做平台门（darwin 在允许集内）后立刻要求
`cheng_held_exec_channel_is_seqpacket(chengHeldExecChannelFd)`（函数在 `:26242-26253`，`SO_TYPE==SOCK_SEQPACKET(5)`）。
darwin 建不出 SEQPACKET（DESIGN P5 探针 errno=43），此门必假 → child `return -1`，
**CLAIM 帧永远发不出**。M1 必须同时改 child 侧这道门。

**Z3｜darwin 通道的三条 I/O 通路已存在但语义对 SOCK_STREAM 是错的。**
- `cheng_host_darwin_recv_optional_fd_runtime`（`program_support_host_runtime.cheng:3421-3506`）在 `:3457`
  要求**一次 recvmsg 收满 768**，否则关 fd 返回 -1；
- `cheng_host_darwin_recv_fd_vector_runtime`（同文件 `:3571-3701`）在 `:3689` 同样要求一次收满 768；
- psb 的 `libc_darwin_recv_optional_fd_runtime`（`:385-391`）签名只有 `(socketFd,payload,payloadBytes,outFd)`，
  **没有 pid/uid/gid 输出**；而 Linux 对应物 `cheng_host_recv_credentialed_optional_fd_runtime`
  （host_runtime `:3058-3171`）输出 pid/uid/gid，且 terminal observe 侧要求 `observation.childUid == expectedUid`
  （psb `:31483`，`expectedUid` 来自 claim 收帧写入的 `ChildUidOffset`，`:29213-29216`）。
SOCK_STREAM 无消息边界 ⇒ 收 768 可能分片，直接调用现成 darwin 函数 = 概率性硬失败（短帧按终结判红）。M1 必须做定长分帧循环。

**Z4｜M0 的回归证据不覆盖本次改动面。**
`probes/darwin_authority/logs/stage3_regression.log` 是用 **stage3（C 窄面载具）** 编译 `rsi_contract`，
只记录了 `psb_sha256_16=2ebe3aaab7faef6d` 作 provenance。psb/host_runtime 是 Cheng 源，**不进 stage3 闭包**
（stage3 走 `cheng_cold.c`；见 CLAUDE.md「src/core/* 编译器源改进不了 stage3」）。
⇒ M1/M2/M4 的每一次验证都必须先重烤内核驱动（`tools/build_kernel_driver.sh --manifest bootstrap/kernel_manifest.cheng`，
实测 ~200s/轮，见 VERIFY §十九 rc=0 @204s），再用该驱动编探针。改完只跑 stage3 冒烟 = 假绿。

---

## 一、M1：channel 定长分帧属主

### 1.1 现 darwin 臂硬 fail 点（文件:行:errcode/返回）

| # | 位置 | 现状 | darwin 后果 |
|---|---|---|---|
| 1 | `program_support_backend.cheng:29032-29033`（`cheng_held_exec_parent_begin_claim_darwin_export`） | `return claim_error(33)` | M3 未装时的首个硬 fail（**非 M1**） |
| 2 | `program_support_backend.cheng:26378` | seqpacket 门 → `return -1` | child 无法发 CLAIM（Z2）。**双重错**：该门用 `chengHeldExecSolSocket=1`（`:24698`）+ `chengHeldExecSoType=3`（`:24699`）——这是 **Linux** ABI；darwin `SOL_SOCKET=0xffff`（`sys/socket.h:354`）、`SO_TYPE=0x1008`（`sys/socket.h:162`）。即 darwin 上 `getsockopt(1,3,..)` 必败，**即使真建出 SEQPACKET 也过不了这道门** |
| 3 | `program_support_backend.cheng:29092-29103` | `libc_socketpair_passcred_runtime(AF_UNIX, SOCK_SEQPACKET=5, ...)` | 走 Linux host 函数，platform_code!=2 直接 -1 → errcode 3（`SocketpairFailed`） |
| 4 | `program_support_backend.cheng:25194-25201`（`cheng_held_exec_send_wire`） | `libc_write_runtime` 单次写 768，短写即 `false` | 不是静默截断（写法本身会判红），但 SOCK_STREAM 下会**概率性假红**；且并发帧序无保护 |
| 5 | `program_support_backend.cheng:25203-25212`（`send_wire_with_fd`） | `libc_send_fd_runtime`（Linux sendmsg） | darwin 无分支；已声明的 `libc_darwin_send_fd_runtime`（`:268-272`）**零调用** |
| 6 | `program_support_backend.cheng:25283-25306`（`receive_wire_with_optional_fd`） | 只调 `libc_recv_credentialed_optional_fd_runtime` | darwin 无分支；已声明的 `libc_darwin_recv_optional_fd_runtime`（`:385-391`）**零调用** |
| 7 | `program_support_backend.cheng:26255-26275` / `:26295-26323` | 入参要求 `pidfd >= 0`（`:26259`/`:26302`）并 `poll(pidfd)` | darwin 无 pidfd（`cheng_host_pidfd_open_runtime` host_runtime `:2120-2136` 返回 -1） |
| 8 | `program_support_backend.cheng:25242-25281`（`receive_wire_with_fd_vector3`） | 已有 darwin 分支（`:25252-25260`） | 分支**存在**，但落到 Z3 的单 recvmsg 语义 → 分片即失败 |

### 1.2 要新增/改写的函数签名与落点（提案名，编辑槽可改；落点为实测行）

**host_runtime（raw FFI 层，只此一处碰 libc）**

| 动作 | 签名（提案） | 落点 | 说明 |
|---|---|---|---|
| 改语义 | `cheng_host_darwin_recv_optional_fd_runtime(socketFd, payload, payloadBytes, outFd, outPid, outUid, outGid) -> int32` | `program_support_host_runtime.cheng:3421-3506` | 加 3 个凭据出参 = 与 Linux `:3058` 一对一对称；内部改为**定长分帧循环**：循环 recvmsg，`iov` 指向 768 缓冲的剩余段，累计到恰好 768；任一 `SCM_RIGHTS` 记录只允许出现在**一个** recvmsg 且总数 ≤1；EOF(0)/短帧/`MSG_TRUNC|MSG_CTRUNC`/超收 = 关掉已收 fd 并返回 -1（= 原合同「short packet is terminal failure」同语）。收满后调 `raw_cheng_terminal_darwin_peer_credentials`（`:247-248` 声明，`:3684` 已在用）填 pid/uid/gid，`peerPid<=0` 或 euid 取不到 = -1 |
| 改语义 | `cheng_host_darwin_recv_fd_vector_runtime(...)` | `:3571-3701` | 同样改分帧循环（fdCount∈{1,2,3}、`SCM_RIGHTS` 恰一次、peer 校验沿用 `:3684-3694`）；**返回值语义与 `:3689` 的 accepted 判据保持不变** |
| 新增 | `cheng_host_darwin_send_wire_framed_runtime(socketFd, payload, payloadBytes) -> int32` | 紧随 `:3386-3420`（`cheng_host_darwin_send_fd_runtime`）之后 | write-all 循环（`EINTR` 重试；`0` 或负 = 失败；写完 = payloadBytes）。单写者对单读者，无并发交织 |
| 维持 | `cheng_host_darwin_send_fd_runtime` / `_send_fd_vector_runtime` | `:3386-3420` / `:3514-3570` | 已是单 sendmsg 全量；分帧方向上单 frame = 单 sendmsg 已足够（内核 stream 缓冲远大于 768），**只需把短写判据从 `== payloadBytes` 改成 write-all 语义**（若实测单 sendmsg 恒全量，可保留原判据并加注释锚定实测；未验证前按 write-all 实现） |
| 新增（可选，单臂即可） | `cheng_host_socketpair_stream_cloexec_runtime(domain, type, proto, fds) -> int32` | 紧随 `:1961-2024` | darwin 臂：`socketpair(AF_UNIX, SOCK_STREAM=1, 0)` + 两端 `F_SETFD FD_CLOEXEC` + `SO_TYPE` 回读 == 1。Linux 主体（`:1961-2024` 的 passcred 版）**逐字节不动** |

**psb（策略层）**

| 动作 | 签名（提案） | 落点 | 说明 |
|---|---|---|---|
| 新增 | `fn cheng_held_exec_channel_kind_valid(fd: int32): bool` | 紧随 `cheng_held_exec_channel_is_seqpacket`（`:26242-26253`）之后 | darwin → `getsockopt(SOL_SOCKET=0xffff, SO_TYPE=0x1008)` 回读 == `SOCK_STREAM(1)` 且 `fcntl(F_GETFD)` 成功（**不得复用 `:24698-24699` 的 Linux level/optname**）；Linux → 原判据。**原 `..._is_seqpacket` 函数体不动** |
| 新增 | `fn cheng_held_exec_channel_peer_credentials_match(fd: int32, expectedPid: int32, expectedUid: uint32, expectedGid: uint32): bool` | 紧邻 `cheng_held_exec_credentials_match`（`:25317-25325`） | darwin：调 `libc_terminal_darwin_peer_credentials`（psb 需新增 `@importc("cheng_native_terminal_darwin_peer_credentials_bridge")`，darwin 实现 `core_runtime_provider_darwin.cheng:992-1027`，Linux stub `core_runtime_provider_linux.cheng:3657-3666` 返回 0）→ 与 spawn 得到的 childPid/euid/egid 比对。连接级绑定在**开通道后、收帧前**一次；之后每帧仍走 `credentials_match`（pid 由 peer 桥给，uid/gid 由 getpeereid 给） |
| 新增 | `fn cheng_held_exec_receive_wire_or_child_exit_darwin(channelFd: int32, wire: var ChengHeldExecWire): ChengHeldExecCredentialedReceiveResult` | 紧随 `:26255-26275` 之后 | 无 pidfd 版：直接调分帧 `cheng_held_exec_receive_wire`（`:25308`）；EOF/短帧返回空结果，由调用方（failure 路径 → `cheng_held_exec_reap_failure` `:26325`）接管。Linux 版 `:26255-26275`、`:26295-26323` **逐字节不动** |
| 改分支 | `cheng_held_exec_child_import_export` 平台门 | `:26374-26379` | 改为 `platformKind ∈ {linux, darwin}` + `cheng_held_exec_channel_kind_valid(chengHeldExecChannelFd)`；darwin 分支继续往下但**必须**在 child 侧用 peer 凭据再证父（见下 M4 的 child 段） |
| 改常量 | `chengHeldExecSockStream: int32 = 1`（darwin `sys/socket.h:111`）、`chengHeldExecDarwinSolSocket: int32 = 65535`（`0xffff`，`sys/socket.h:354`）、`chengHeldExecDarwinSoType: int32 = 4104`（`0x1008`，`sys/socket.h:162`）；darwin 固定路径常量 | `:24695-24730` 常量块 | 现有 `chengHeldExecSolSocket=1`/`chengHeldExecSoType=3`（`:24698-24699`）是 Linux 值，**只能留在 Linux 判据里**，darwin 判据不得复用；darwin 路径**必须引用 `held_exec_identity.cheng:122-125` 的单一来源**，不得在 psb 造第五份字面量（见 F11/§三.3） |
| 改 darwin 臂 | `cheng_held_exec_parent_begin_claim_darwin_export` | `:29023-29033` | 顺序：输入校验（已落）→ M3 retained identity → M3 launcher identity → argv/env digest（用 darwin 路径做 argv[0]）→ session allocate（`:28774`）→ **M1** 通道 → **M2** spawn → CLAIM 收帧（`cheng_held_exec_receive_wire_or_child_exit_darwin`）→ birth capture（`libc_terminal_child_birth_capture_runtime` `:369-373`，darwin 必须传 `pidfd = -1`，见 `core_runtime_provider_darwin.cheng:585-586` 的 `pidfd != -1 → 0`）→ 与 Linux 臂同款 claim 校验（`:29161-29233` 的判据逐条复用，`child_image_matches` 换 M4 darwin 版） |

### 1.3 与 Linux 臂的对称关系（Linux 主体逐字节不动的三条硬约束）

1. **Linux 函数体零改写**：`cheng_held_exec_parent_begin_claim_linux_export`（`:29042-29233`）、
   `cheng_held_exec_socketpair_passcred` 相关的 `cheng_host_socketpair_passcred_runtime`（host_runtime `:1959-2024`）、
   `cheng_host_recv_credentialed_optional_fd_runtime`（`:3058-3171`）、`cheng_host_recv_credentialed_fd_vector_runtime`（`:3239-...`）
   **一个字节都不动**。darwin 侧的每一处改动都是「新增函数 + 平台分派」，分派点写在**平台中立函数**内（`send_wire` / `receive_wire_with_optional_fd` / `receive_wire_with_fd_vector3` / `channel_kind_valid`）。
2. **分派判据统一**：psb/host_runtime 内用 `cheng_host_is_darwin()`（psb `:3399-3400`，判 `AF_INET6==30`）；
   begin_claim 派发器用 `cheng_read_only_mapped_region_platform_kind()`（`:15321`）。**两者都已存在**，M1 不得新增第三套平台判据。
3. **对称清单（Linux 原语 → darwin 等价 → 落点）**：
   `SOCK_SEQPACKET` → `SOCK_STREAM + 768 定长分帧`（M1）；
   `SO_PASSCRED 每消息 SCM_CREDENTIALS` → `连接级 getpeereid + LOCAL_PEERPID/LOCAL_PEEREPID`（M1，darwin 桥 `:992-1027` 已实测可用，host_runtime `:3684` 已在用）；
   `pidfd poll 多路复用` → `EOF 即子进程终止 + kqueue NOTE_EXIT 观察`（M1+M2，kqueue 已落 `:2253-2264` / `:31456`）；
   `execveat(AT_EMPTY_PATH)` → `固定路径 posix_spawn START_SUSPENDED`（M2）；
   `/proc/<pid>/exe` → `proc_pidpath + fence + issuance bar + digest`（M4）；
   `fs-verity measure` → `SF_IMMUTABLE + codesign cdhash + 自读 bytes CID`（M3）。

### 1.4 wire 阶段调用方清单（M1 必须覆盖的全部过通道调用点）

生产 wire 只有 4 帧（协议注释 `:24610-24612`）：CLAIM → ACTIVATE → FINISHED → COMMITTED|ABORTED。

| 阶段 | 帧 | 父侧落点 | 子侧落点 |
|---|---|---|---|
| claim | CLAIM | 收 `cheng_held_exec_receive_wire_or_child_exit` `:29162`（Linux 臂内；darwin 臂将调 `_darwin` 版） | 发 `cheng_held_exec_send_wire` `:26406` |
| admission | ACTIVATE（带 3 个 fd） | 发 `cheng_held_exec_send_wire_with_fd_vector3` `:29371`（在 `cheng_held_exec_parent_activate_capsule_vector3` `:29255`） | 收 `cheng_held_exec_receive_wire_with_fd_vector3` `:26421` |
| plan / finished | FINISHED（带 1 个 fd） | 收 `cheng_held_exec_receive_wire_with_optional_fd_from` `:30920`（在 `cheng_held_exec_parent_finish_capsule_owner_export` `:30852`） | 发 `cheng_held_exec_send_wire_with_fd` `:27464` + `cheng_held_exec_send_wire` `:27468`（在 `cheng_held_exec_child_finish_export` `:27360`） |
| terminal | COMMITTED/ABORTED | 发 `cheng_held_exec_send_wire` `:31360`（在 `cheng_held_exec_terminal_transport_send_decision_export` `:31300`） | 收 `cheng_held_exec_receive_wire` `:27492` |
| terminal（无帧） | — | observe/reap **已 darwin 化**：`:31535-31537`、`:31569-31572`、`:31456-31529` | — |
| 已退役路径 | — | `cheng_held_exec_parent_finish_retired_unreachable` `:29594` 内 `receive_terminal_or_child_exit_from` `:29617`（**无外部调用者**，见 `system.cheng` 无对应 import） | — |

**上游生产调用点（谁的阶段会走到这些帧）**：
`src/core/csg_core/production_launcher.cheng:1661` `CsgCoreProductionHeldExecBeginClaimInto`（claim）→
`:1680` guardian BeginInto → `:1690` guardian ActivateInto（admission，内部到 `merkle_store.cheng:5865`
`RuntimeHeldExecParentActivateCapsuleOwner`）→ `merkle_store.cheng:5765` FinishCapsuleOwner（finished/plan）→
`merkle_store.cheng:8709` SendDecision（terminal）→ `:9121`/`:9194` ObserveExit/Reap（terminal，已 darwin）。
子侧入口：`production_launcher.cheng:1440` / `system_link_exec_pure_main.cheng:1455` / `backend_driver_main.cheng:5055` / `compiler_main.cheng:8986` 的 `RuntimeHeldExecChildImport`。

---

## 二、M2：spawn 属主（posix_spawn START_SUSPENDED + audit-token join）

### 2.1 现状与 SDK 事实（已实测读 SDK 头文件）

- 生产运行时**没有** posix_spawn FFI：全树 `posix_spawn` 只有 `node_rt.cheng:171-172` 的 `posix_spawnp`（JS child_process 用，与本臂无关）。
- SDK 事实（`xcrun --show-sdk-path` = `/Applications/Xcode.app/.../MacOSX.sdk`）：
  - `posix_spawn(pid_t*, const char*, const posix_spawn_file_actions_t*, const posix_spawnattr_t*, char* const argv[], char* const envp[])`
    — **全指针、非变参**（`usr/include/spawn.h:59-64`）⇒ 可被固定 Cheng 声明合法表达（不同于 fcntl 变参问题，见 `held_exec_identity.cheng:669-672` 的注释纪律）。
  - `posix_spawnattr_t` / `posix_spawn_file_actions_t` 均为 `void *` 不透明句柄（`spawn.h:51-52`）⇒ FFI 用 `ptr`，不涉结构体布局。
  - `POSIX_SPAWN_START_SUSPENDED = 0x0080`（`usr/include/sys/spawn.h:60`）；
    `POSIX_SPAWN_CLOEXEC_DEFAULT = 0x4000`（同文件 `:62`）。
  - `posix_spawn_file_actions_adddup2(fa, fd, newfd)` 在 `spawn.h:80`；`init` `:89`、`destroy` `:87`；
    `posix_spawnattr_init` `:105`、`posix_spawnattr_setflags(posix_spawnattr_t*, short)` `:110`（`short` 装得下 `0x4000`）。

### 2.2 落点（文件:函数:行附近）

| 动作 | 内容 | 落点 |
|---|---|---|
| 新增 FFI | `posix_spawn` / `posix_spawnattr_init` / `posix_spawnattr_setflags` / `posix_spawnattr_destroy` / `posix_spawn_file_actions_init` / `_adddup2` / `_destroy`（全部 `@importc`） | `core_runtime_provider_darwin.cheng`（darwin 臂，紧随 `:84-90` 的 kqueue/kevent import 之后）；Linux 侧**必须同时加 stub**（照 `core_runtime_provider_linux.cheng:3650-3666` 的两条 darwin 桥 stub 体例，返回 0/-1） |
| 新增桥 | `@exportc("cheng_native_darwin_spawn_suspended_bridge")` `(pathFdUnused: int32, path: ptr, argv: ptr, envp: ptr, channelFd: int32, outPid: ptr) -> int32` | darwin 实现 `core_runtime_provider_darwin.cheng`（新函数）；语义：`attr.flags = START_SUSPENDED\|CLOEXEC_DEFAULT`；`fileActions.adddup2(channelFd, 198)`；`posix_spawn(&pid, path, &fa, &attr, argv, envp)`；成功回 `1` 且写出 pid；任一步失败 = `0`（**不设 fallback，不回落 fork**） |
| 新增桥 | `@exportc("cheng_native_darwin_resume_suspended_bridge")` `(childPid: int32) -> int32` | 同文件；`kill(childPid, SIGCONT=19)`；失败 = 0 |
| 新增桥 | `@exportc("cheng_native_darwin_child_audit_token_bridge")` `(childPid: int32, outBuf: ptr, outBytes: int32) -> int32` | 同文件；`sysctl({CTL_KERN=1, KERN_PROC=14, KERN_PROC_PID=1, childPid})`（三常量实测 `sys/sysctl.h:188/226/437`）取 `kinfo_proc`（**需新增 `@importc("sysctl")`，当前只有 `sysctlbyname` `:236-237`，只能取标量，取不到 kern.proc**），抽出 `p_pid` / `p_starttime`（pid version）/ `e_ucred.cr_uid` / `e_pcred.p_ruid` / `p_pcred.p_rgid` / `p_pcred.p_svuid` / `p_pcred.p_svgid` 组成 canonical 审计元组。**struct 偏移全部未验证**：必须先写 C 探针实测偏移（照 `probes/p2_pid_identity.c` 的 `pbi` 偏移做法，`core_runtime_provider_darwin.cheng:592-600` 是既有 pbi 偏移实证），偏移未实测前不得落生产代码 |
| 新增 host 桥 | `@exportc("cheng_host_darwin_spawn_suspended_runtime")` / `..._resume_runtime` / `..._child_audit_token_runtime` | `program_support_host_runtime.cheng`（紧随 `:2253-2264` darwin kqueue 段之后，与既有的 darwin 桥封装同体例） |
| 新增 psb 桥 | `fn cheng_held_exec_darwin_spawn_suspended(path: str, argv: ptr, channelFd: int32, outChildPid: var int32): bool` | `program_support_backend.cheng`（紧随 `cheng_held_exec_channel_is_seqpacket` 段之后，约 `:26253`） |
| 改 darwin 臂 | spawn 段插在 M1 通道之后：`spawn suspended` → **kqueue/审计 join** → M4 再证（suspend 窗口内）→ `resume` → 等 CLAIM | `:29023-29033` 臂体内 |

### 2.3 audit-token join 的接线面（能力模块当前是「有状态无列」）

- `production_held_exec_darwin_capability.cheng`：状态常量有 `Issued=1 / AuditBound=2 / Consumed=3`（`:24-26`），
  但私有 SoA 列（`:42-53`）**只有** bytesCid/cdhash/DR/signingId/teamId/device/inode/inodeFlags ——
  **没有 auditTokenCid / auditPidVersion 列**；`CsgCoreProductionHeldExecDarwinRequireAuditedPathSpawnInto`（`:188-206`）
  在 `:204-205` 无条件返回 `HARD_RED:..._audit_token_binding_unwired`。
- 全树**没有**任何 `darwin.auditTokenProven / auditPidVersion / dynamicGuestProven / dynamicGuestIdentityCid /
  systemImmutableProven` 的生产者（实测 `grep -rn` 在 `src/core/**` 除 `production_launcher.cheng` 自校验外零命中）。
  ⇒ M2 必须**从零建生产者**，消费端 schema 已冻结在 `production_launcher.cheng:203-218`
  （`CsgCoreProductionLauncherDarwinAuthority`），校验在 `:975-1010`。
- M2 需要新增（落点：`production_held_exec_darwin_capability.cheng`）：
  1. 两列 `productionHeldExecDarwinCapabilityAuditTokenCids: str[]`、`...AuditPidVersions: uint64[]`（`:46-53` 之后追加）
     + 在 `InitializeBeforeLauncher`（`:58-95`）补初始化；
  2. `fn CsgCoreProductionHeldExecDarwinBindAuditTokenInto(preflightOwner: int32, auditTokenCid: str, auditPidVersion: uint64, childPid: int32, err: var str): bool`
     —— 严格校验 CID（沿用 `productionHeldExecDarwinCapabilityCidValid` `:97-99`）+ `auditPidVersion != 0` + 行状态 `Issued → AuditBound` 的 CAS；
  3. 把 `CsgCoreProductionHeldExecDarwinRequireAuditedPathSpawnInto`（`:188-206`）的 `:204-205` 改为
     **状态=AuditBound 时成功返回该 row**（保留 else 的同一 HARD_RED 串）；这一步是「不得静默跳过」的关键闸门。
- psb session arena 需要一格存 audit owner：arena 是**列主序**（`cheng_held_exec_parent_session_i32_store` `:27599-27605`
  地址 = `columnOffset + slot*4`），当前列最大 `ArenaReapObservationOwnerOffset=1456`（`:24666`），
  结构体 `data: uint8[1472]`（`:24576-24577`）。追加 `chengHeldExecParentArenaAuditOwnerOffset: int32 = 1472` 并把
  `data` 扩到 `1488`（或 1536 对齐），**不需要重排任何既有偏移**；同时 `cheng_held_exec_parent_session_allocate`（`:28774` 起）
  要为每 slot 初始化新列为 `-1`。CID 本体留在 capability 私有列，arena 只放 int32 row（与既有 owner-handle 纪律一致）。

### 2.4 getpeereid / kqueue 等价物的调用位置

- **getpeereid**：桥 `core_runtime_provider_darwin.cheng:992-1027` → host 用法 `program_support_host_runtime.cheng:247-248`（声明）+ `:3684`（vector3 收帧内 peer 校验）→ **M1** 在 `cheng_held_exec_channel_peer_credentials_match` 里调用（新）；M2 在 spawn 后用同一桥把「通道路径对端 pid/uid/gid」与「posix_spawn 返回 pid / 审计元组」做 join。
- **kqueue EVFILT_PROC/NOTE_EXIT**：桥 `core_runtime_provider_darwin.cheng:547-577`；
  host 层 `:2253-2264`（`cheng_host_terminal_darwin_kqueue_event_wait_runtime`）；
  psb 已接线：`:31456-31529`（observe，`observation.signalNumber == 20` 平台判据 `:31484`）与 `:31535-31537` 分派。
  **M2 不重写这三处**；M2 只需保证 spawn 后 `ChildPidOffset`（`:24651`）被写入且 reap 走 `cheng_host_terminal_exit_reap_runtime`（`:2309-2320`，darwin 已按 childPid waitpid）。
- kqueue 注册窗口：START_SUSPENDED 提供**天然窗口**（子进程已 exec、未跑一条指令），DESIGN P2 记录的「死亡后 PROC_PIDTBSDINFO 读不到 / 需在存活期抓 birth」由此闭合：birth capture（`:579` 桥）与 M4 再证都在 resume 之前完成。

---

## 三、M4：child 镜像再证（proc_pidpath + fence + issuance bar + digest）

### 3.1 现状锚点

- `cheng_held_exec_process_image_digest_into(pid, fixedPath, out)`：`program_support_backend.cheng:26175-26203`
  —— 用 `cheng_held_exec_proc_exe_path`（`:26149-26173`，拼 `/proc/<pid>/exe`）+ `O_RDONLY` 打开 + `fd_identity_equal` + `fs-verity measure`。darwin 全不可用。
- `cheng_held_exec_child_image_matches(childPid, retainedFd)`：`:26205-26240` —— 同一路径 + fstat 四元组比对。
- 共享 child 臂的两处**硬编码 Linux 路径**调用：`:26389-26392`（`cheng_held_exec_process_image_digest_into(getpid(), chengHeldExecNativePath, actualExecutable)`）与
  `:26453-26455`（父镜像再证，用 `chengHeldExecLauncherPath`）。常量在 `:24727-24729`（Linux 路径）。
- 可复用资产（`held_exec_identity.cheng`）：
  darwin 固定路径 `:122-125`；vnode 绑定 `heldExecHeldPathMatches` `:678-714`（`proc_pidfdinfo(PROC_PIDFDVNODEPATHINFO)`，
  常量 `:234-241`：flavor=2、fi_type 偏移 16、dev 24、ino 32、path 176、缓冲 1200）；issuance bar `heldExecDarwinIssuanceBarError` `:1191-1212`
  （非 ad-hoc / hardened runtime / library validation / DR / team / **SF_IMMUTABLE** `:1209-1211`，常量 `:241 = 131072`）；
  对外门 `ChengHeldExecIdentityFileIssuanceBarError` `:1231-1242`；字节 CID 用 `system.RuntimeHeldExecFdContentSha256`
  （`system.cheng:1744-1746`；identity 侧封装 `heldExecStreamHeldBytesCid` `:740-...`）。
- **`proc_pidpath` 全树零 import**（实测 `grep -rn "proc_pidpath" src/` = 0 命中）。
  SDK 事实：`int proc_pidpath(int pid, void *buffer, uint32_t buffersize)`（`libproc.h:102`）；
  `int proc_pidpath_audittoken(audit_token_t*, void*, uint32_t)`（`libproc.h:103`，macOS 11+）；
  `PROC_PIDPATHINFO_MAXSIZE = 4*MAXPATHLEN = 4096`（`sys/proc_info.h:749`）；
  注意 `PROC_PIDVNODEPATHINFO = 9` 取的是 **cwd/rdir**（`sys/proc_info.h:741`），**不是 exe**；
  exe 的 vnode 只有两种取法：(a) `proc_pidpath` + `stat`（DESIGN P3 定谳口径，有路径窗口，靠发行面闭合）；
  (b) `PROC_PIDREGIONPATHINFO = 8`（`sys/proc_info.h:737`）遍历区域拿 `__TEXT` 的 `vnode_info_path`（**未验证**，作为可选加固，需先写 C 探针）。不得凭记忆选 (b)。

### 3.2 合成点（落点与签名）

| 动作 | 签名（提案） | 落点 |
|---|---|---|
| 新增 FFI | `@importc("proc_pidpath") fn libc_proc_pidpath(pid: int32, buf: ptr, size: uint32): int32` | `core_runtime_provider_darwin.cheng`（紧随 `:244-245` 的 `proc_pidinfo` import）＋ Linux stub（`core_runtime_provider_linux.cheng`，返回 -1） |
| 新增桥 | `@exportc("cheng_native_darwin_child_image_path_bridge") (childPid: int32, outBuf: ptr, outBytes: int32) -> int32` | 同文件；`proc_pidpath(childPid, buf, 4096)`，要求返回 `>0` 且为 NUL 结尾；失败 = 0 |
| 新增 psb | `fn cheng_held_exec_darwin_process_image_digest_into(pid: int32, fixedPath: str, out: var ChengFixedBytes32): bool` | psb，紧随 `:26203` | 合成序（**顺序不可换**）：① `proc_pidpath(pid)` → 字面路径**逐字节等于** `fixedPath`（不等 = false，不做 realpath、不做前缀匹配）；② `open(fixedPath, O_RDONLY\|O_CLOEXEC\|O_NOFOLLOW)`（darwin `O_NOFOLLOW=0x100`，`sys/fcntl.h:123`；更强可选用 `O_NOFOLLOW_ANY=0x20000000`，`sys/fcntl.h:158`——**行为未验证**）→ `fstat` 四元组；③ **named fence**：`stat(fixedPath)` 前后各一次（before/after）dev/ino/size/mode 全等 且等于 ①的 vnode（`heldExecNamedStat` 体例 `held_exec_identity.cheng:579-597`，fence 段 `:1008-1032`）；④ **issuance bar**：`ChengHeldExecIdentityFileIssuanceBarError("darwin-arm64", evidence)` 必须返回空串（`:1231-1242`）——**M3 未装时这里必须显式失败**，不得跳过；⑤ digest：对 fixed fd 走 `system.RuntimeHeldExecFdContentSha256`（`system.cheng:1744`）得 32B 并 `digest_nonzero`；⑥ 与 retained fd 的 `fstat` 四元组比对（`cheng_held_exec_child_image_matches` 的等价物） |
| 新增 psb | `fn cheng_held_exec_darwin_child_image_matches(childPid: int32, retainedFd: int32): bool` | 紧随 `:26240`（`cheng_held_exec_child_image_matches` 之后）；= ③④⑥ 的合体 |
| 改分派 | `cheng_held_exec_process_image_digest_into` / `cheng_held_exec_child_image_matches` 顶部加 `if cheng_host_is_darwin(): return ...darwin...` | `:26175` / `:26205` 两函数首行；**Linux 主体逐字节不动** |
| 改共享 child 臂 | `:26389-26392` / `:26453-26455` 的两条 `chengHeldExecNativePath` / `chengHeldExecLauncherPath` 改为平台取值助手 | 新增 `fn cheng_held_exec_platform_native_path(): str` / `..._launcher_path(): str`（Linux 返回原常量，darwin 返回 `held_exec_identity` 的两条 darwin 常量）；**Linux 上必须返回与今日完全相同的字符串** |
| 改 darwin 臂 | CLAIM 校验里的 `cheng_held_exec_child_image_matches(childPid, ownedRetainedFd)` 换 darwin 版（`:29182-29183` 是 Linux 臂内，darwin 臂需写等价判据） | `:29023-29033` 臂体 |

### 3.3 与 M3 安装面的依赖（哪些调用点未装时必须显式 HARD_RED）

| 调用点 | M3 未装时的行为（强制） | 依据 |
|---|---|---|
| ③④ 发行面（`SF_IMMUTABLE` + 签名 + 固定路径） | 返回 false → darwin 臂报 **33**（retained identity）/ **34**（launcher identity），错误串取 `held_exec_identity.cheng:183-185` 的 `..._e_darwin_system_immutable_missing` 等 | `:1191-1212`、`:1231-1242` |
| capability 预检 | `CsgCoreProductionHeldExecDarwinSystemImmutablePathPreflightInto`（`:105-182`）在 M3 未装时返回 `HARD_RED:..._system_immutable_signed_vnode_unavailable`（`:29-30`） | 已在案 |
| spawn 闸门 | `RequireAuditedPathSpawnInto`（`:188-206`）M3/M2 未齐时必须仍返回 `HARD_RED:..._audit_token_binding_unwired`（`:31-32`） | 已在案，M2 改的是**成功路径** |
| provider 严格校验 | `production_held_exec_provider.cheng:1870-1873` darwin 分支当前**无条件 HARD_RED**；M4 完成后改为验 `executionMethod == CsgCoreProductionHeldExecDarwinMethod`（`:26-27`）+ 身份字段（`:221-237` 平台中立结构）非空 CID，**不得**用「平台是 darwin 就放行」代替 | 实测 |
| 任何一处 | **不得**「M3 未装 → 跳过该腿继续跑」或「回落 Linux 专属」。缺安装面 = 如实红，不是降级 | DESIGN §四、m3_install_surface_plan §五 |

**F11 附带发现（需 M3 线确认）**：`m3_install_surface_plan.md` §二只安装
`/usr/local/libexec/cheng/csg-core-native`（步骤 2），但 `ChengHeldExecIdentityIssueInto`
（`held_exec_identity.cheng:1244-1273`）要**同时**收 `launcher` 与 `binary` 两个固定路径且做别名互斥
（`:1274-1284`），darwin launcher 路径是 `:122-123` 的 `/usr/local/libexec/cheng/csg-production-launcher`。
⇒ 安装面方案需补这一步，否则 M3 的 issuance bar 永远差一条腿。

---

## 四、逐模块验收（可证伪判据）

统一口径：**每轮先重烤驱动**（约 200s，独占槽）：
`tools/build_kernel_driver.sh --manifest bootstrap/kernel_manifest.cheng --out <scratch>/kd --target arm64-apple-darwin`
（脚本 `tools/build_kernel_driver.sh`，命令面见该文件 `:1-20`；stage3 载具链实测 `rc=0 @204s`，VERIFY §十九）。
探针编译/运行口径：`<kd> system-link-exec --root:$PWD --in:<probe>.cheng --emit:exe --link-providers --out:<probe>.bin && <probe>.bin`。
**禁止**用 stage3 编探针当作本任务的证据（Z4）。探针落 `src/tests/`（临时探针用完删或转正，遵守 scratch 生命周期纪律）。

### M1（channel 定长分帧）

- **前置修复（验收前提）**：`src/std/system.cheng:255-284` 的 errcode 常量块止于 30 →
  `csgCoreProductionHeldExecParentError`（`production_held_exec_spawn.cheng:54-115`）把 31-34 全都落到
  兜底串 `HARD_RED:production_held_exec_linux_spawn_unavailable`（`:14-15`）——**这是误导性红**。
  M1 先补 `RuntimeHeldExecParentErrDarwinChannelFramingUnwired: int32 = 31`
  （+32/33/34）与四条错误串 `held_exec_parent_darwin_channel_framing_unwired` 等。
- **判据 M1-a（不依赖 M3，可证伪）**：探针 `src/tests/held_exec_darwin_channel_framing_smoke.cheng`：
  `fork()` 子进程经 darwin 帧发送桥连发 3 帧（每帧 768B，其中两帧故意分两次短写模拟分片、一帧带 `SCM_RIGHTS`），
  父进程用帧接收桥收 3 帧。
  期望输出：3 帧逐字节等于发送缓冲；fd 恰收到 1 个且 `F_GETFD & FD_CLOEXEC != 0`；peer pid == 子进程 pid；
  **负例**：故意发 767B 后关闭 → 接收侧返回失败（短帧=终结，不得返回部分帧）。
- **判据 M1-b（不依赖 M3）**：`cheng_held_exec_channel_kind_valid` 在 `SOCK_STREAM` 对上返回 true、在 `SOCK_DGRAM` 上返回 false（对照探针）。
- **判据 M1-c（需 M3）**：begin_claim 全链 errcode 不再出现 **31**：
  装 M3 后跑 `CsgCoreProductionHeldExecBeginClaimInto` 探针，`err` 串不得为 `..._darwin_channel_framing_unwired`；
  在 M2 未接线时应停在 32，M2 接线后应继续到 CLAIM 收帧成功（`claim.status == 1`）。
- **必须等 M3 才能端到端的部分**：M1-c（因为 darwin 臂第一门是 33）。M1-a/M1-b 现在就能跑。

### M2（spawn 属主）

- **判据 M2-a（不依赖 M3）**：探针 `src/tests/held_exec_darwin_spawn_suspended_smoke.cheng`：
  用 `proc_pidpath(self)` 取自身路径当 `path`（桥是**路径入参**，固定路径策略属于 darwin 臂），
  `spawn suspended` → 断言：返回 pid>0；子进程在 resume 前**未执行任何指令**（子进程第一件事是写 pipe，父侧 `poll(pipe, 0)` 必须 timeout）；
  `proc_pidpath(childPid)` 立刻可得（suspend 窗口内）；audit join 的 `auditPidVersion != 0` 且 pid 字段 == childPid；
  `resume` 后 pipe 收到数据；kqueue observe 得到 `signalNumber==20`；reap 后 `waitpid` 得同一 pid。
- **判据 M2-b（不依赖 M3）**：capability 行状态机 `Issued(1) → AuditBound(2)` CAS 成功且 `RequireAuditedPathSpawnInto` 从
  `HARD_RED:..._audit_token_binding_unwired` 变为成功；**负例**：伪造 `auditPidVersion == 0` 或非法 CID 必须被拒（保持红）。
- **判据 M2-c（不依赖 M3）**：file actions 面收缩：在父进程多开一个**非 CLOEXEC** fd 后 spawn（`CLOEXEC_DEFAULT` 语义下应被关），
  子进程 resume 后 `fcntl(该 fd)` 必须 `EBADF`；频道 fd 在子侧恰为 198 且非 CLOEXEC。
- **判据 M2-d（需 M3）**：errcode **32 消失**；M3 装完、M1+M2 齐后 begin_claim 走到 claim 成功（`status==1, session>0, childPid>0`）。
- **必须等 M3**：M2-d。M2-a/b/c 现在就能跑。

### M4（child 镜像再证）

- **判据 M4-a（不依赖 M3）**：探针 `src/tests/held_exec_darwin_child_image_smoke.cheng`：
  retained fd = `open(proc_pidpath(self))`，childPid = spawn(self)（复用 M2 桥，suspend 期）→
  `cheng_held_exec_darwin_child_image_matches(childPid, retainedFd)` 必须 true；
  **负例三条**：① 把另一进程（`spawn` 别的二进制）的 pid 传进来 → false；
  ② 把 retained fd 换成同目录另一个文件 → false；③ 拿 `fixedPath` 传一个 symlink 前缀（如 `/tmp/...`）→ false（`held_exec_identity.cheng:663-669` 的「不解析符号链接，如实判 mismatch」纪律）。
- **判据 M4-b（不依赖 M3）**：digest 一致性：同一固定路径上 `..._process_image_digest_into` 的结果 ==
  对 retained fd 直接算的 `RuntimeHeldExecFdContentSha256`；换一个字节 → 两侧都变且不再相等。
- **判据 M4-c（不依赖 M3）**：M3 未装时的**显式红**：把 `fixedPath` 指向一个非 SF_IMMUTABLE/未签名文件（如探针自身）
  → `..._process_image_digest_into` 返回 **false** 且错误串是 `held_exec_identity_e_darwin_system_immutable_missing`
  或 `..._adhoc_signature` / `..._hardened_runtime_missing`（`held_exec_identity.cheng:177-185`），**不得返回 true**、
  不得跳过 issuance bar 段。
- **判据 M4-d（需 M3）**：errcode **33/34 消失**（M3 本体）+ provider 严格校验
  （`production_held_exec_provider.cheng:1870-1873`）darwin 分支不再无条件红；launcher `CsgCoreProductionLauncherAssess`
  （`production_launcher.cheng:975-1010`）对 darwin observation 的 6 个 darwin 字段全部可满足。
- **必须等 M3**：M4-d，以及 M4-a/b 中任何需要真实安装路径（`/usr/local/libexec/cheng/csg-core-native`）的变体。

### 全链（M5 前置）

errcode 漫步（**唯一需要 M3 的端到端判据**）：装 M3 后依次观察
33 →（M4 齐）→ 31 →（M1 齐）→ 32 →（M2 齐）→ `claim.status==1`；
`grep` 命令级复核：`probes/logs` 记录里 errcode 数字序列必须单调前进，出现回退或「跳过某码」= 有静默兜底，判红。

---

## 五、编辑顺序与冲突面

### 5.1 热文件/在途状态（实测 `git status --porcelain` + mtime）

| 文件 | 状态 | 是否本次目标 | 处置 |
|---|---|---|---|
| `src/core/backend/primary_object_plan.cheng` | **M（在途，mtime 09-10 19:52，P-B 线活跃）** | 否 | **禁碰**；任何 hunk 提交前按 lessons 纪律先用 `git apply --cached` 只 stage 自己 |
| `src/core/lang/typed_expr.cheng` | **M（ledgerwalk WIP，mtime 09-10 14:12）** | 否 | **禁碰** |
| `docs/.../user_path_baseline.tsv`、`findings.md`、`lessons.md`、`progress.md`、`task_plan.md`、`src/apps/**`、`src/quic/**`、`src/std/net/ipaddr.cheng`、多个 `src/tests/**` | M | 否 | 禁碰 |
| `src/core/runtime/program_support_backend.cheng` | **干净** | **是（M1/M2/M4 主战场）** | 安全 |
| `src/core/runtime/program_support_host_runtime.cheng` | **干净** | **是（M1）** | 安全 |
| `src/core/runtime/core_runtime_provider_darwin.cheng` / `_linux.cheng` | **干净** | **是（M2/M4）** | 安全 |
| `src/core/runtime/held_exec_identity.cheng` | **干净** | 读为主（M4/M3 引用） | 安全（若加 darwin 常量/助手，注意 `:122-129` 是四处路径的单一来源候选） |
| `src/core/runtime/production_held_exec_darwin_capability.cheng` | **干净** | **是（M2）** | 安全 |
| `src/core/runtime/production_held_exec_provider.cheng` | **干净** | **是（M4 收口）** | 安全 |
| `src/core/runtime/production_held_exec_spawn.cheng` | **干净** | **是（错误串）** | 安全 |
| `src/std/system.cheng` | **干净** | **是（errcode 常量）** | 安全 |
| `src/core/csg_core/production_launcher.cheng` | **干净** | 读为主 | 安全 |
| `compiler_csg.cheng` / `typed_expr_type_arena.cheng` | 已提交（S1a step-1） | 否 | 不动 |

### 5.2 安全顺序（单线串行）

1. **W0 常量/错误串前置**：`src/std/system.cheng:255-284` 加 31-34 +
   `production_held_exec_spawn.cheng:54-115` 加四条映射。→ 重烤 + 一条错误串探针（不依赖 M3）。
2. **M1**（先 host_runtime 分帧，再 psb 分派与 child 门）：`program_support_host_runtime.cheng:3421/3571/3386` →
   `program_support_backend.cheng:26253 邻域（新助手）`、`:26374-26379`、`:25283`、`:25194`。
   → 重烤 + M1-a/M1-b 探针。
3. **M4**（可与 M1 并行，但同文件 psb，串行更稳）：darwin provider 加 `proc_pidpath` FFI + Linux stub → psb
   `:26175`/`:26205`/`:26389-26392`/`:26453-26455` → 重烤 + M4-a/b/c 探针。
4. **M2**：darwin provider 加 posix_spawn/sysctl FFI（**先写 C 探针实测 `kinfo_proc` 偏移**）→ host 桥 →
   capability 两列 + Bind + `RequireAuditedPathSpawnInto` 成功路径 → psb darwin 臂 spawn 段 + arena 新列（`:24576-24577`、
   `:24666` 邻域、`:28774` 初始化）→ 重烤 + M2-a/b/c 探针。
5. **M3 安装面**（用户授权，root）：补齐 `csg-production-launcher` 的安装（F11）+ `csg-core-native` + 签名 + `chflags uchg`。
6. **M5 端到端**：errcode 漫步 + 幽灵终验 darwin 臂 + Linux lane 对照。

**每轮约束**：改任一 `src/core/**` → 必须重烤驱动才算验证（~200s，独占槽；VERIFY §十九 定谳：并发重编译撞
`os atomic tree: parent lease unavailable` 会伪装成静默 rc=2，**不是**编译器判词）。提交纪律：
`git apply --cached` 只 stage 自己 hunk；**严禁** `git checkout -- <file>` / `git restore <file>`（会抹掉他线未提交 WIP，教训在案）。

---

## 六、估工与风险

### 估工（单线，每轮烤机 ~200s；含烤机排队）

| 模块 | 编辑 | 烤机轮次 | 估工 |
|---|---|---|---|
| W0 常量/错误串 | 2 文件 ~20 行 | 1 | 1-2h |
| M1 | host_runtime 3 函数改/加（~150 行）+ psb 4 处（~120 行） | 2-4 | 6-10h |
| M4 | provider FFI+桥（~80 行）+ psb 4 处（~150 行） | 2-3 | 4-8h |
| M2 | provider FFI+3 桥（~200 行，含 sysctl 偏移探针）+ capability（~80 行）+ psb 臂/arena（~120 行） | 3-5 | 10-16h |
| 探针（M1-a/b、M2-a/b/c、M4-a/b/c） | 3 个测试文件（~400 行） | 各 1 | 6-10h |
| 合计（M1+M2+M4，不含 M3 安装与 M5） | — | 12-18 轮 | **27-46h** |

M3（root 安装 + 签名 + `chflags`）与 M5（终验）不计入本席权限内工时，需用户授权后单独排。

### 风险与红线

1. **红线：不得降级/不得静默跳过。** 具体形态（全部禁止）：
   (a) darwin 上某腿未接线时「跳过继续」；(b) 分帧失败时回落「读一次算一帧」；
   (c) M3 未装时把发行面判据短路成 true；(d) spawn 失败回落 `fork+execveat`（darwin 无此路）；
   (e) `cheng_sysctl_read_i64`（psb `:19548-19550`，**当前是返回 0 的桩**）被当现成件复用 —— 用桩做 audit 元组 = 静默伪造证据；
   (f) 把「errcode 31/32 没出现」当成接线完成（Z1：M3 未装时它们本来就不出现）。
2. **协议面风险**：SOCK_STREAM 分帧若不做「短帧=终结」的硬判，将出现**静默错帧**（把两帧粘成一帧或截断一帧后继续），
   属于 miscompile 级风险。M1-a 负例必须真跑。
3. **struct 偏移风险**：darwin `kinfo_proc` / `vnode_info_path` 偏移随 SDK 版本变化（且 32/64 位与
   `PROC_PIDFDVNODEPATHINFO` 不同族）。**未实测偏移前不得落生产代码**；照 `probes/p2_pid_identity.c` 的探针做法先测。
4. **路径常量风险**：darwin 固定路径当前有 3 份字面量（`held_exec_identity.cheng:122-125`、
   `production_held_exec_darwin_capability.cheng:27-28`、`production_launcher.cheng:35-38`），psb 若再加一份 = 4 份；
   任一处漂移都会让「固定路径」合同失效。M1/M2 必须引 `held_exec_identity` 的常量，并（建议）在 M3 线把另外两处收敛过去。
5. **并发风险**：改 `program_support_backend.cheng`（31k 行）期间若他线也在动 runtime 面，会撞租约/覆盖。
   开工前 `git status` + mtime 双查；仓内有另一执行线独占编译租约，**烤机必须独占槽**。
6. **假绿风险**：只跑 stage3 冒烟（Z4）会给出与改动无关的 rc=0。任何验收回执必须绑定：源码 hash + 驱动 hash +
   探针 hash + 独占槽时间窗。

---

## 附：不确定/未验证清单（编辑槽必须先实测再落码）

0. **已由 SDK 头文件核实（可直接落码）**：`SOCK_STREAM=1`、`SOCK_SEQPACKET=5`（`sys/socket.h:111/117`）、
   `SOL_SOCKET=0xffff`（`:354`）、`SO_TYPE=0x1008`（`:162`）、`O_NOFOLLOW=0x100`、`O_NOFOLLOW_ANY=0x20000000`（`sys/fcntl.h:123/158`）、
   `POSIX_SPAWN_START_SUSPENDED=0x0080`、`POSIX_SPAWN_CLOEXEC_DEFAULT=0x4000`（`sys/spawn.h:60/62`）、
   `posix_spawn` 非变参原型（`spawn.h:59-64`）、attr/file_actions 为 `void*`（`spawn.h:51-52`）、
   `PROC_PIDPATHINFO_MAXSIZE=4096`（`sys/proc_info.h:749`）、`PROC_PIDVNODEPATHINFO=9` 是 cwd/rdir 非 exe（`:741`）、
   `PROC_PIDREGIONPATHINFO=8`（`:737`）、`LOCAL_PEERPID=0x002`/`LOCAL_PEEREPID=0x003` at `SOL_LOCAL=0`（`sys/un.h:89-90`）——
   后者交叉印证既有 darwin peer 桥（`core_runtime_provider_darwin.cheng:1004-1010`，level=0/optname=2,3）**ABI 正确**，M1 可直接复用。
1. `O_NOFOLLOW_ANY` 在固定路径 open 上的实际语义（是否对中间目录生效）——未验证，需探针。
2. `POSIX_SPAWN_START_SUSPENDED` 「suspend 期 `proc_pidpath` / birth capture 可读」——本席**未验证**
   （DESIGN P4 探针 p4 只验了 spawn 成功 + held + 可控终止），属 M2-a 探针必须证明的一条。
3. `kinfo_proc` 各字段偏移与 `e_ucred`/`e_pcred` 布局（M2 audit join）——未验证，必须先写 C 探针。
4. `PROC_PIDREGIONPATHINFO` 能否稳定取到主可执行文件 `__TEXT` 的 vnode（可选加固）——未验证。
5. START_SUSPENDED 语义下 kqueue `EVFILT_PROC|NOTE_EXIT` 注册是否在 resume 前即成功（本席倾向 resume 前注册、
   失败则红；具体行为未验证）。
6. darwin 单次 `sendmsg(768)` 是否恒全量（决定 M1 发送侧是否必须 write-all）——未验证，按 write-all 实现即可安全。
