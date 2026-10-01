# DarwinAuthority 载体设计：held-exec 生产入口五原语的 darwin 等价性定谳

日期：2026-09-09。载具 stage3 sha256_16=05af823e7db0c8ea（未动）。
前身：判词 53/54（probes/wall2_fix、probes/wall3_fix/FIX.md）。本文把
「幽灵终验最后一个阻塞」——生产入口声明点
`held_exec_parent_linux_x86_64_required`（psb begin_claim 首门）——
从「Linux 专属」变成「可评审的 darwin 生产臂设计+实测可行性+骨架实现」。
探针证据：本目录 `probes/p1..p5*.c` + `logs/probes_run.log`
（darwin 25.5.0 arm64 真机，五探针全 rc=0）。

## 一、合同重述：五原语各保护什么不变量（在案代码读出，非 Linux 常识）

### 1. fs-verity（psb `cheng_held_exec_retained_verity_digest_into`:26101、
launcher identity:26076，消费点 begin_claim:28991/28995）

- I-FS1 内容钉扎：`FS_IOC_MEASURE_VERITY` 仅当 inode 已启用 fs-verity
  时返回内核记录的 digest——retained fd 所指镜像的字节被内核认证，
  此后任何用户态（含编译进程自身、含 root）改一个字节都会被 measure
  排除。executableDigest 绑入 claim wire（psb:29113-29121），子进程侧
  再证。
- I-FS2 镜像同一：measure 前先 `cheng_held_exec_named_path_matches`
  （retained fd 必须正是固定安装路径 `/usr/libexec/cheng/csg-core-native`
  的 vnode）+ launcher 侧 `/proc/self/exe` 与固定 launcher path 同 vnode
  后才 measure——「跑着的 launcher 就是固定路径上那些被测量的字节」。
- 威胁模型（判词 54 定谳口径沿用）：防编译进程自身的并发换写/部分读/
  意外重写；父子互信由进程镜像摘要认证承担。

### 2. /proc（psb `cheng_held_exec_proc_exe_path`:26140、
`cheng_held_exec_child_image_matches`:26196、
`cheng_held_exec_process_image_digest_into`:26167）

- I-PR1 子进程镜像同一：fork+exec 后打开 `/proc/<childPid>/exe`
  （O_PATH），fstat 的 size/mode/dev/ino 四元组 == retained fd 的
  fstat——「子进程实际执行的 vnode 就是父进程持有的那个 vnode」，
  内核事实，非子进程声明。反证：子进程被 exec 到别的二进制、或 exec
  窗口内 retained 镜像被换。
- I-PR2 自镜像同一：`/proc/self/exe` vnode == 固定 launcher path vnode
  （`cheng_held_exec_fd_identity_equal`）。
- I-PR3 进程身份面：`/proc/<pid>/exe` 只对存活进程可开——打开即证明
  「那个 pid 当前存在且 exe 可绑定」。

### 3. execveat(AT_EMPTY_PATH)（host_runtime `cheng_host_exec_retained_runtime`:2092，
psb 子进程分支 :29071 调用）

- I-EX1 fd 寻址执行：exec 目标 = retained fd 所指的字节本身
  （`""` + AT_EMPTY_PATH），零路径解析、零 TOCTOU；host_runtime 注释
  自证设计意图：「no Cheng production API can acquire an OS address or
  substitute a pathname」+ psb:24461「no pathname or process-local
  fallback」。
- I-EX2 面收缩：子进程只带继承的 channel fd 198 与 retained fd 进新
  镜像（CLOEXEC 语义），无 argv[0] 路径面。

### 4. pidfd（host_runtime `cheng_host_pidfd_open_runtime`:2120、
`waitid(P_PIDFD, WNOWAIT)`:2249、reap:2220；psb poll:26252、birth
capture :29129）

- I-PD1 不可混淆句柄：pidfd 引用特定进程实例；`waitid(P_PIDFD)` 精确
  等待该实例，pid 数字重用不会让父进程观察/等待错对象。
- I-PD2 事件权威：poll(pidfd) 与 waitid(P_PIDFD, WNOWAIT) 直接阻塞在
  内核事件上（在案注释：「no poll/sleep/retry loop participates in
  terminal authority」）；reap 同样 pidfd 寻址。
- I-PD3 实例锁定证据：`cheng_native_terminal_child_birth_capture_bridge`
  （childPid+pidfd）在实例存活期抓 birth 证据入 receipt。

### 5. SOCK_SEQPACKET + SO_PASSCRED（host_runtime
`cheng_host_socketpair_passcred_runtime`:1959；psb channel :29032、
`cheng_held_exec_channel_is_seqpacket`:26233、协议注释 :24453-24461）

- I-SQ1 消息边界：768B 定长 wire 帧，SEQPACKET 保帧；「a short
  packet ... is terminal failure」（psb:24460）。
- I-SQ2 每消息发送者凭据：SO_PASSCRED 两端开启并回读后，每条消息附
  SCM_CREDENTIALS(pid/uid/gid)；父侧 `credentials_match` 对照 childPid
  ——claim 消息确实来自那个子进程，非第三方伪造。
- I-SQ3 通道私有：socketpair 无名、无路径；唯一传播 = fork 继承。

## 二、逐原语 darwin 等价定谳（探针实测绑定）

### P1 fs-verity → 判词 54「写-冻-匿-证」冻结点复用 — 可行

探针 `p1_freeze_point.c`：冻结点（关写句柄→unlink→rmdir）后实测
`nlink=0`、全量内容可读、按名重开 ENOENT、O_RDONLY 句柄 write/ftruncate
→ EBADF、F_SETFL 升级后 ACCMODE 钉在 O_RDONLY。五项全为内核强制事实，
与 I-FS1（内容/尺寸钉扎+不可再改）逐条对上，正是 wall3 seal 的同款。
retained 侧的 darwin 全臂（判词 54 已落）：envelope 走冻结点 seal，
attest = `F_GETFL O_RDONLY + st_nlink==0` 再证。
差异如实声明：Linux seals 追溯 seal 时已存在的可写句柄；darwin 靠构造
保证冻结点后无可写句柄——对「恶意父进程私藏写句柄」（模型外对手）
Linux 强；合同口径（防进程自身）等价。
另一腿（固定安装 vnode 的内容钉扎）：darwin 无 fs-verity，等价 =
`held_exec_identity.cheng` 已落地的 issuance bar：Mach-O 代码签名解析
（cdhash/DR/team）+ 非 ad-hoc + hardened runtime + **SF_IMMUTABLE**
inode flag（`st_flags`）——SF_IMMUTABLE 由内核拒写（写/截断 EPERM），
构成「固定路径上不可变且签名认证的字节」。注意其启用前提是安装面
（root 安装+chflags），开发机不满足=如实 HARD_RED，不是降级。

### P2 pidfd → 部分：无 pidfd；kqueue 注册+birth tuple 等价 — 可行（等价面已够）

探针 `p2_pid_identity.c`（全部实测）：
- PROC_PIDTBSDINFO 返回 (pbi_pid, pbi_status, pbi_start_tvsec/tvusec)
  ——birth tuple 可得（与在案 darwin birth 桥 core_runtime_provider_
  darwin.cheng:579 同款偏移）。
- kqueue EVFILT_PROC + NOTE_EXIT + EV_ONESHOT：注册窗口内（管道握手
  保证子进程存活时注册）精确投递 `ident==child`；随后
  waitid(P_PID, WNOWAIT) 取到完整 siginfo（status=7）——
  I-PD2 的「观察先于 reap」等价成立。darwin 的 terminal wait/reap 桥
  （`cheng_host_terminal_darwin_kqueue_event_wait_runtime` /
  `waitpid_reap_exact`）已在库。
- **zombie 身份面消失（实测 copied=0）**：子进程 exit 后 PROC_PIDTBSDINFO
  即读不到——与 Linux pidfd「句柄在 reap 前持续有效」不同，darwin 的
  birth 证据必须在 spawn 后立即抓取（在案桥正是在 claim 阶段调用）。
- PID 重用窗口：400 个短命子进程，pid 集合 400 全互异、窗口内零重现
  （pid 空间未翻圈，如实记录）；重用窗口在本机未实测到非零，但
  pid 数可被 OS 任意重用是接口事实，唯一性论证不依赖窗口：等价句柄 =
  「spawn 时刻建立的 kqueue 注册」（内核把事件绑到注册时的进程实例）
  + (pid, birthtime) 再证，两者合成后 pid 重用不再可混淆。
结论：I-PD1/2/3 可等价兑现。硬差异如实声明：kqueue 注册句柄与
(дарwin) birth tuple 都不能像 pidfd 那样被 dup/跨调用传递为「裸句柄」，
须绑定在 provider 私有 Arena 行上（与在案 SoA 纪律一致）。

### P3 /proc → libproc 信息面对照 — 可行（一处窗口差异如实声明）

探针 `p3_proc_equiv.c`：
- `proc_pidpath(self)` → 字面路径，stat(path) 的 dev/ino/mode/size 与
  fstat(self fd) 全等——I-PR2 等价（launcher 自镜像同一可用
  proc_pidpath+stat/或 proc_pidfdinfo PROC_PIDFDVNODEPATHINFO 精确
  vnode 绑定，后者已在库 held_exec_identity 使用）。
- 不存在 pid → proc_pidpath 拒（errno 3=ESRCH）；reap 后 → 拒——
  I-PR3 等价（身份面只对存活进程存在）。
- 存活子进程 pbi_status/pbi_pid 可观测。
**窗口差异如实声明**：`/proc/<pid>/exe` 的 O_PATH 打开是「内核当前
exe vnode」的直接句柄；darwin 的 proc_pidpath+stat 走路径名，存在
「路径被替换」的理论窗口。闭合方式（不绕）：子镜像再证必须组合
(a) proc_pidpath 路径 == 固定安装路径（含 nofollow 前提），(b) 该路径
处于 SF_IMMUTABLE+签名 issuance bar 下（替换即破坏签名/immutable
fence），(c) claim wire 的 executableDigest 与 P1 冻结点/measure 再证。
三者合成后窗口被合同闭合，弱于 /proc/exe 单点但如实。

### P4 execveat(AT_EMPTY_PATH) → 不可行（公开接口面）；生产臂=固定路径 suspended spawn — 定谳

探针 `p4_exec_no_fd.c`：
- `fexecve` 符号在 libsystem_kernel 中 ABSENT（dlsym 实测）。
- 对 O_RDONLY 句柄 execve("/dev/fd/N")：rc=9（EBADF，darwin execve
  要求真实可执行文件路径）——fd 寻址执行不可达。
- unlink 后按原路径 execve：rc=2（ENOENT）——名是唯一句柄，印证
  darwin 无 AT_EMPTY_PATH 通道。
- posix_spawn + POSIX_SPAWN_START_SUSPENDED 按固定路径：实测 spawn
  成功、held（kill 存活）、可控终止——I-EX1 的 darwin 等价是
  「**结构性换权威**」：fd 寻址换为「固定路径 + 安装面完整性 +
  suspended guest」。
生产臂设计（与在案 launcher 设计文件一致）：
`production_held_exec_provider.cheng` 已定名
`CsgCoreProductionHeldExecDarwinMethod = "posix_spawn_suspended_dynamic_guest"`；
`production_held_exec_darwin_capability.cheng` 已定 issuance bar
（非 ad-hoc 签名 + hardened runtime + library validation + DR +
SF_IMMUTABLE 固定路径 `/usr/local/libexec/cheng/csg-core-native`）并
显式 HARD_RED：「fixed-path spawn, sandbox receipt and post-spawn
audit-token join are not yet wired」。即 darwin 上「执行的字节 ==
retained 字节」由四层合成：固定路径安装面完整性（SF_IMMUTABLE 内核
拒写）→ spawn 前后 named fence（在案 namedBefore/namedAfter）→
suspend 期 claim/bundle/audit-token join（START_SUSPENDED 实测 held）
→ resume 后子镜像再证（P2 birth tuple + P3 再证）。任何一层缺失=
HARD_RED（在案），无 fallback。

### P5 SOCK_SEQPACKET → 原样不可建（实测反证）；SOCK_STREAM/分帧+getpeereid 等价 — 部分

探针 `p5_seqpacket.c`（真机 darwin 25.5.0）：
- **`socketpair(AF_UNIX, SOCK_SEQPACKET)` 实测 errno=43（EAFNOSUPPORT）
  ——darwin 不可建**。任务预期「本机能建=可行级证据」反转为定谳不可
  建原样。
- SOCK_DGRAM：真建+两帧两包（边界保持实测）+ SO_TYPE 回读 + SCM_RIGHTS
  sendmsg/recvmsg 换 fd 成功。
- **SO_PASSCRED 假阳性澄清**：Linux 值 16 在 darwin SOL_SOCKET 上
  getsockopt rc=0，但撞名 darwin SO_DONTROUTE(0x10)；darwin SDK 无
  SO_PASSCRED 符号、无 SCM_CREDENTIALS cmsg 类型——每消息凭据缺席是
  定谳，不得以数值探针 rc=0 充当存在。
- 凭据面：dgram 对 getpeereid 失败；**stream 对 getpeereid rc=0
  （euid/egid 实测取得）**——连接级对端凭据在 SOCK_STREAM 上可得。
等价设计（I-SQ1/2/3 对上）：通道 = `socketpair(AF_UNIX, SOCK_STREAM)`
+ 定长 768B wire 帧的分帧收发（I-SQ1 由分帧器+帧长校验兑现，短帧/
超帧=terminal failure 与原合同同语）+ 连接级 `getpeereid` 再证对端
euid（I-SQ2 的弱化等价：每消息 pid/uid/gid → 连接级 euid/egid——
fork+socketpair 拓扑下对端唯一且固定，claim 的 nonce 挑战-响应在
应用层补足消息级来源）+ SCM_RIGHTS（P5 实测 stream/nullable；SCM_RIGHTS
在 stream 对上同样可用）+ 无名私有（I-SQ3 同构）。
威胁模型差异如实声明：Linux 每消息 SCM_CREDENTIALS 能证明「这条消息
来自该 pid」；darwin 连接级只能证明「这条连接对端是某 euid」。在
fork-socketpair 拓扑中两者可归约（连接唯一、对端唯一、nonce 响应绑定
会话），但对「编译进程自身 bug 双写 channel」这类模型内对手，帧校验+
nonce 响应承担原 SO_PASSCRED 的职责，等价性成立、逐消息粒度弱一档。

## 三、全链 darwin 生产臂：模块分解与实施排序

在案底座（已落库，无需重做）：darwin seal 冻结点+attest（判词 54）、
kqueue terminal wait/reap 桥、birth capture 桥、held_exec_identity
（codesign/SF_IMMUTABLE issuance bar + PROC_PIDFDVNODEPATHINFO）、
darwin capability 模块（issuance/audit-token row，HARD_RED 声明）、
provider 模块（posix_spawn_suspended_dynamic_guest 定名+receipt schema）。

| # | 模块 | 内容 | 阻塞性 |
|---|---|---|---|
| M0 | psb 三臂拆分 | begin_claim 平台门翻转：Linux 主体原字节入 linux 臂；darwin 臂骨架+逐原语 hard-fail errcode；未知平台维持 fail-closed | 本批（骨架已落） |
| M1 | channel 分帧属主 | psb/host_runtime 新 darwin socketpair 桥：SOCK_STREAM+CLOEXEC+getpeereid 回读绑定+768B 定长分帧收发（替代 passcred 桥的 darwin 臂） | 硬阻塞 #1（claim/bundle 全部 wire 阶段依赖） |
| M2 | spawn 属主 | darwin spawn 桥：posix_spawn START_SUSPENDED 按固定路径+file actions 只带 channel fd；audit-token join（sysctl kern.proc 信息与 row 绑定） | 硬阻塞 #2（I-EX1 等价的执行面） |
| M3 | retained/launcher identity 接线 | psb darwin 臂接入 held_identity issuance bar（固定路径安装面+SF_IMMUTABLE+codesign fence），替换 /proc/self/exe 与 fs-verity measure 两腿 | 硬阻塞 #3（无安装面=开发机如实 HARD_RED，须安装流程） |
| M4 | child 镜像再证 | /proc/<pid>/exe 等价：proc_pidpath+fence+issuance bar+digest 合成再证（P3 窗口闭合合同） | 渐进（依赖 M2/M3） |
| M5 | 终验补跑 | 幽灵终验（verify_ghost）darwin 臂全链+Linux lane 对照 | 收口（依赖 M1-M4） |

排序依据：M1 是 wire 协议全阶段的前置（claim/admission/plan/terminal
全部走 channel）；M2 决定「子进程存在」这一后续一切证据的前提；M3 是
唯一需要系统安装面（root+chflags+签名）的模块，决定 darwin 生产臂
能否在本机真实达到生产态（开发机可 M1/M2/M4 完成，M3 缺安装面=显式
HARD_RED 不算绿）。

## 四、替代路线对比：「生产入口继续 Linux 专属 + 幽灵终验走 linux lane」

- 路线 A（本设计）：darwin 生产臂逐模块接线。代价=M1-M4（其中 M3 需
  安装流程）；收益=held-exec 协议在本机全链可跑、幽灵终验本机可补、
  `cheng_host_exec_retained_runtime` 的「Darwin deliberately returns
  unavailable」自证缺口关闭、后续所有 production launcher 批次不再
  每 54s 撞墙。风险=五原语等价面已逐一实测，无未知 OS 面。
- 路线 B：维持 Linux 专属声明，幽灵终验在 Linux 环境跑。代价=本机
  （darwin arm64）终验永久 BLOCKED@54s 声明点，判词 54 阶梯③④持续
  不可达；每轮全链验证需外部 Linux 机器+跨机证据绑定（源码/编译器/
  工具哈希跨机一致性负担）；launcher 已落库的 darwin 设计资产
  （capability/provider/identity 三模块）闲置。收益=零代码风险。
- 结论：**主线走 A**；B 作为 M3 安装面就绪前的过渡验证面保留（判词
  54 已声明幽灵终验可 Linux lane 补跑）。A 的硬阻塞只剩 M3 的安装面
  依赖，其余为纯代码接线。当前 darwin 臂骨架把这一状态显式化：
  darwin 不再返回 `LinuxX64Required`（「Linux 专属」声明消除），改为
  逐原语 darwin 专属 hard-fail errcode——阻塞点从「平台不存在」变成
  「模块未接线」，与 launcher 在案 HARD_RED 纪律同构。

## 五、骨架实现状态（本批落地）

改动面：仅 `src/core/runtime/program_support_backend.cheng`：
1. `cheng_held_exec_parent_begin_claim_export` 变纯派发器：Linux 双平台
   → `cheng_held_exec_parent_begin_claim_linux_export`（原主体原字节
   搬移，wall3 seal 拆分同款纪律）；darwin →
   `cheng_held_exec_parent_begin_claim_darwin_export`；未知平台维持
   fail-closed。
2. darwin 臂：平台无关输入校验（retained fd、输出路径绝对性）后按
   依赖序声明未接线等价原语，首个硬阻塞点显式返回 darwin 专属
   errcode，无兜底无假绿。
3. 新 errcode 常量（31-34）：DarwinChannelFramingUnwired（M1）、
   DarwinSpawnAuthorityUnwired（M2）、DarwinRetainedIdentityUnwired
   （M3）、DarwinLauncherIdentityUnwired（M3）。
回归：stage3 链 rsi_contract 冒烟编译+运行 rc=0（见 logs/）。
