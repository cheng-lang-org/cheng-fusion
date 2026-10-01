# held-exec M2：darwin `kinfo_proc` 偏移与 `sysctl` 可获取面 实测报告

> 探针：`probes/heldexec_kinfo_probe/main.c`（本次实跑，非文档抄录）
> 原始输出：`probes/heldexec_kinfo_probe/raw_output.txt`（§三整段贴）
> 环境：macOS 26.5 (25F71) / Darwin 25.5.0 `RELEASE_ARM64_T6041` / **arm64** / Apple clang 21.0.0
> 结论绑定本次运行；换 SDK / 换架构 / 换 macOS 版本需重跑。

---

## 一、结论先行

### 1.1 M2 audit 元组七字段偏移（全部**实测**，arm64 macOS 26.5）

| M2 需要的字段 | 施工图写法 | 实测路径（真实字段名） | 偏移 | 宽度 |
|---|---|---|---|---|
| pid | `p_pid` | `kp_proc.p_pid` | **40** | 4 |
| pid version | `p_starttime` | `kp_proc.p_starttime`（= `p_un.__p_starttime`，union 首成员） | **0**（`tv_sec`@0/8B，`tv_usec`@8/4B） | 16 |
| euid | `e_ucred.cr_uid` | `kp_eproc.e_ucred.cr_uid` | **420** | 4 |
| ruid | `p_pcred.p_ruid` ←**名字错** | `kp_eproc.e_pcred.p_ruid` | **392** | 4 |
| rgid | `p_pcred.p_rgid` ←**名字错** | `kp_eproc.e_pcred.p_rgid` | **400** | 4 |
| svuid | `p_pcred.p_svuid` ←**名字错** | `kp_eproc.e_pcred.p_svuid` | **396** | 4 |
| svgid | `p_pcred.p_svgid` ←**名字错** | `kp_eproc.e_pcred.p_svgid` | **404** | 4 |

**关键**：`sizeof(struct kinfo_proc) = 648`，`kp_proc`@0（296B）、`kp_eproc`@296（352B）。
施工图 `:144` 的两处名字要在落代码前改：`e_pgrp` → **`e_pgid`**（偏移 564）、`p_pcred` → **`e_pcred`**。

### 1.2 逐项"实测/未测"

| 项 | 状态 |
|---|---|
| `kinfo_proc` 全部关注字段偏移（offsetof + 运行期指针差 双法） | **实测**，21/21 AGREE |
| `sizeof(struct kinfo_proc)`=648 / `kp_proc`=296 / `kp_eproc`=352 | **实测** |
| `KERN_PROC_PID` 取自身（rc/len/`p_comm` vs `getprogname()`） | **实测**：rc=0 len=648 全等 |
| `p_starttime` 与 `proc_pidinfo(PROC_PIDTBSDINFO).pbi_start_tv{sec,usec}` 对拍 | **实测**：逐值 MATCH（第三方 API 交叉验证） |
| `KERN_PROC_ALL` 非 root 可用性 / 条数量级 | **实测**：rc=0，934 条（260 条 uid≠自己） |
| 非 root 对**不属于自己**的 pid 调 `KERN_PROC_PID` 的 errno | **实测**：rc=0 errno=0 **且字段真值可读**（不是 EPERM） |
| 不存在 pid / 已 reap 子进程 | **实测**：rc=0、errno 不变、**len=0** |
| 缓冲区过小 | **实测**：rc=-1 errno=**ENOMEM(12)** |
| 挂起子进程（`SIGSTOP` 代理 START_SUSPENDED）可获取性 | **实测**：rc=0 len=648 字段齐（M2 join 窗口可行） |
| 子进程 pid 在 `p_starttime` 上与父可区分 / 同进程两次读取稳定 | **实测**：STABLE 且父子不同 |
| `csops` / `csops_audittoken` 返回码 | **实测**（self rc=0；零 token rc=-1/ESRCH）；**常量语义未测**（SDK 无 `sys/codesign.h`） |
| `proc_pidpath`（自身/外来 pid/不存在 pid） | **实测** |
| `PROC_PIDREGIONPATHINFO=8`（M4 备选口径）取 `__TEXT` 路径 | **实测可用**（自身进程 56 region，首个 r-x 区路径 == `proc_pidpath`） |
| **root 调用者视角** | **未测**（无 sudo，未越权） |
| **x86_64 / Rosetta** 下同一批偏移 | **未测**（本机 arm64） |
| **posix_spawn `POSIX_SPAWN_START_SUSPENDED` 真身** | **未测**（用 `SIGSTOP` 子进程代理） |
| 其它 macOS / SDK 版本 ABI 稳定性 | **未测**（仅 26.5/25F71） |
| `csops` 的 `ops=0` 是不是 `CS_OPS_STATUS` | **未测**（SDK 全树无 `CS_OPS_STATUS`，只测到返回码可达） |
| 真实 audit token 的 `csops_audittoken` 成功路径 | **未测**（需真 token，本次只测零 token 错误路径） |

---

## 二、探针源码与编译命令

源码：`docs/campaigns/2026-08-31-kernel-userpath/probes/heldexec_kinfo_probe/main.c`（单文件 545 行，无外部依赖）

```
cc -O0 -Wall -o khprobe main.c && ./khprobe > raw_output.txt 2>&1
```

- `cc` 即 Apple clang 21.0.0（C 层直编，**与 Cheng 编译槽位无关**）；本次 `-Wall` 零告警、exit 0。
- 可执行文件 `khprobe` 跑完已删除；目录只留 `main.c` / `README.md` / `raw_output.txt`。
- 探针只读系统：仅 `sysctl`/`proc_pidinfo`/`proc_pidpath`/`csops` 读接口 + 一次自身 `fork`（子进程 `nanosleep` 后 `_exit`）。

---

## 三、原始输出（本次实跑整段贴）

```
### RAW OUTPUT CAPTURE (commands: uname -a; sw_vers; cc --version; sysctl -n ...; arch; ./khprobe)
$ uname -a
Darwin lbchengdeMacBook-Pro.local 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:15 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T6041 arm64
$ sw_vers
ProductName:		macOS
ProductVersion:		26.5
BuildVersion:		25F71
$ cc --version
Apple clang version 21.0.0 (clang-2100.1.1.101)
Target: arm64-apple-darwin25.5.0
Thread model: posix
InstalledDir: /Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin
$ sysctl -n kern.osproductversion kern.osversion hw.optional.arm64
26.5
25F71
1
$ arch
arm64
### ./khprobe output begins

=== ENV (compile-time / self-reported) ===
arch=arm64
pid=34300 ppid=34294 uid=501 euid=501 gid=20 pgid=34294 progname="khprobe"
sizeof(struct kinfo_proc)=648
sizeof(struct extern_proc)=296 sizeof(struct _pcred)=104 sizeof(struct _ucred)=76
MAXCOMLEN=16 sizeof(struct timeval)=16 sizeof(pid_t)=4 sizeof(uid_t)=4
CTL_KERN=1 KERN_PROC=14 KERN_PROC_PID=1 KERN_PROC_ALL=0
PROC_PIDTBSDINFO=3 PROC_PIDREGIONPATHINFO=8

=== SECTION 1: offsets (offsetof vs runtime pointer-diff, same struct) ===
OFF kp_proc                      offsetof=0     ptrdiff=0     width=296 AGREE
OFF kp_proc.p_pid                offsetof=40    ptrdiff=40    width=4   AGREE
OFF kp_proc.p_comm               offsetof=243   ptrdiff=243   width=17  AGREE
OFF kp_proc.p_flag               offsetof=32    ptrdiff=32    width=4   AGREE
OFF kp_proc.p_starttime          offsetof=0     ptrdiff=0     width=16  AGREE
OFF kp_proc.p_starttime.tv_sec   offsetof=0     ptrdiff=0     width=8   AGREE
OFF kp_proc.p_starttime.tv_usec  offsetof=8     ptrdiff=8     width=4   AGREE
OFF kp_proc.p_stat               offsetof=36    ptrdiff=36    width=1   AGREE
OFF kp_proc.p_pgrp               offsetof=264   ptrdiff=264   width=8   AGREE
OFF kp_eproc                     offsetof=296   ptrdiff=296   width=352 AGREE
OFF kp_eproc.e_ppid              offsetof=560   ptrdiff=560   width=4   AGREE
OFF kp_eproc.e_pgid              offsetof=564   ptrdiff=564   width=4   AGREE
OFF kp_eproc.e_pcred             offsetof=312   ptrdiff=312   width=104 AGREE
OFF kp_eproc.e_pcred.p_ruid      offsetof=392   ptrdiff=392   width=4   AGREE
OFF kp_eproc.e_pcred.p_svuid     offsetof=396   ptrdiff=396   width=4   AGREE
OFF kp_eproc.e_pcred.p_rgid      offsetof=400   ptrdiff=400   width=4   AGREE
OFF kp_eproc.e_pcred.p_svgid     offsetof=404   ptrdiff=404   width=4   AGREE
OFF kp_eproc.e_ucred             offsetof=416   ptrdiff=416   width=76  AGREE
OFF kp_eproc.e_ucred.cr_uid      offsetof=420   ptrdiff=420   width=4   AGREE
OFF kp_eproc.e_ucred.cr_ngroups  offsetof=424   ptrdiff=424   width=2   AGREE
OFF kp_eproc.e_ucred.cr_groups   offsetof=428   ptrdiff=428   width=64  AGREE

=== SECTION 2: live sysctl(KERN_PROC_PID, self) raw decode + independent byte scan ===
sysctl(CTL_KERN,KERN_PROC,KERN_PROC_PID,34300) rc=0 errno=0(Undefined error: 0) len=648 (expect len=648)
     decoded: p_pid=34300 p_comm="khprobe" p_flag=0x00004004 p_starttime={1789067439,34539} e_ppid=34294 e_pgid=34294
              e_ucred.cr_uid=501 e_pcred.p_ruid=501 p_svuid=501 p_rgid=20 p_svgid=20
XVALUE p_pid=34300 vs getpid()=34300                     -> MATCH
XVALUE p_comm="khprobe" vs getprogname()="khprobe"        -> MATCH
XVALUE p_starttime.tv_sec=1789067439 vs time(NULL)=1789067439 (sec, sanity only)
XVALUE p_flag=0x00004004 (P_INMEM? see sys/proc.h)
XVALUE e_ppid=34294 vs getppid()=34294                  -> MATCH
XVALUE e_pgid=34294 vs getpgrp()=34294                   -> MATCH
XVALUE e_ucred.cr_uid=501 vs geteuid()=501           -> MATCH
XVALUE e_pcred.p_ruid=501 vs getuid()=501            -> MATCH
XVALUE e_pcred.p_svuid=501 vs getuid()=501           -> MATCH
XVALUE e_pcred.p_rgid=20 vs getgid()=20            -> MATCH
XVALUE e_pcred.p_svgid=20 vs getgid()=20           -> MATCH
XVALUE e_ucred.cr_ngroups=16 cr_groups[0]=20
SCAN kp_proc.p_pid          i32=34300    hits: 40  | total=1 first=40 expected=40 -> MATCH
SCAN kp_eproc.e_ppid        i32=34294    hits: 560 564  | total=2 first=560 expected=560 -> MATCH
SCAN uid(ruid/uid/euid)     i32=501      hits: 392 396 420  | total=3 first=392 expected=392 -> MATCH
SCAN kp_proc.p_comm         "khprobe\0" hits: 243  | total=1 first=243 expected=243 -> MATCH
proc_pidinfo(self,PROC_PIDTBSDINFO) rc=136 errno=0(Undefined error: 0) sizeof(pbi)=136
XPIDINFO pbi_pid=34300 pbi_comm="khprobe" pbi_uid=501 pbi_ruid=501 pbi_svuid=501 pbi_rgid=20
XPIDINFO pbi_start_tvsec=1789067439 vs kinfo p_starttime.tv_sec=1789067439 -> MATCH
XPIDINFO pbi_start_tvusec=34539 vs kinfo p_starttime.tv_usec=34539 -> MATCH

=== SECTION 3a: KERN_PROC_ALL availability ===
KERN_PROC_ALL size-query rc=0 errno=0(Undefined error: 0) need=608472
KERN_PROC_ALL fetch rc=0 errno=0(Undefined error: 0) got=605232 count=934 rem=0
KERN_PROC_ALL foreign(uid!=501) sample:
  foreign[0] pid=22222 comm="iconservicesagen" cr_uid=0 ruid=0 e_ppid=1
  foreign[1] pid=22217 comm="systemmigrationd" cr_uid=0 ruid=0 e_ppid=1
  foreign[2] pid=22201 comm="backgroundtaskma" cr_uid=0 ruid=0 e_ppid=1
  foreign[3] pid=19477 comm="trustd" cr_uid=262 ruid=262 e_ppid=1
  foreign[4] pid=19478 comm="trustd" cr_uid=24 ruid=24 e_ppid=1
KERN_PROC_ALL total=934 foreign=260

=== SECTION 3b: KERN_PROC_PID on pid NOT owned by us (non-root) ===
caller euid=501 (root=0 -> NON-ROOT)
KERN_PROC_PID(pid=22222 foreign) rc=0 errno=0(Undefined error: 0) len=648
    filled: p_pid=22222 (requested 22222 -> MATCH) p_comm="iconservicesagen" cr_uid=0 p_ruid=0 p_svuid=0
KERN_PROC_PID(pid=22217 foreign) rc=0 errno=0(Undefined error: 0) len=648
    filled: p_pid=22217 (requested 22217 -> MATCH) p_comm="systemmigrationd" cr_uid=0 p_ruid=0 p_svuid=0
KERN_PROC_PID(pid=22201 foreign) rc=0 errno=0(Undefined error: 0) len=648
    filled: p_pid=22201 (requested 22201 -> MATCH) p_comm="backgroundtaskma" cr_uid=0 p_ruid=0 p_svuid=0
KERN_PROC_PID(pid=19477 foreign) rc=0 errno=0(Undefined error: 0) len=648
    filled: p_pid=19477 (requested 19477 -> MATCH) p_comm="trustd" cr_uid=262 p_ruid=262 p_svuid=262
KERN_PROC_PID(pid=19478 foreign) rc=0 errno=0(Undefined error: 0) len=648
    filled: p_pid=19478 (requested 19478 -> MATCH) p_comm="trustd" cr_uid=24 p_ruid=24 p_svuid=24

=== SECTION 3c: error paths / sizing ===
KERN_PROC_PID(self) with 16-byte buffer: rc=-1 errno=12(Cannot allocate memory) len=0
KERN_PROC_PID(999999 nonexistent): rc=0 errno=0(Undefined error: 0) len=0
KERN_PROC_PID(1 launchd): rc=0 errno=0(Undefined error: 0) len=648 p_pid=1 cr_uid=0 p_comm="launchd"

=== SECTION 3d: same-uid child (fork) — child kinfo_proc + pid-version stability ===
KERN_PROC_PID(child=34301) rc=0 errno=0(Undefined error: 0) len=648
    child: p_pid=34301 p_comm="khprobe" cr_uid=501 p_ruid=501 e_ppid=34300 p_starttime={1789067439,515436}
    child e_ppid==getpid()? MATCH ; child start >= parent start? yes
    child 2nd read p_starttime={1789067439,515436} (1st {1789067439,515436}) -> STABLE
    child SIGSTOP'd (suspend window proxy): KERN_PROC_PID rc=0 errno=0(Undefined error: 0) len=648 p_pid=34301 p_starttime={1789067439,515436} cr_uid=501 p_ruid=501 p_flag=0x00000004
    after reap: KERN_PROC_PID(reaped child) rc=0 errno=0(Undefined error: 0) len=0

=== SECTION 3e: csops / proc_pidpath / PROC_PIDREGIONPATHINFO ===
csops(self, ops=0, &flags) rc=0 errno=0(Undefined error: 0) flags=0x22020201 [ops=0 常量含义未经 SDK 头确认]
csops(1 launchd, ops=0, &flags) rc=0 errno=0(Undefined error: 0) flags=0x26015b11
csops_audittoken(zero-token, ops=0) rc=-1 errno=3(No such process)
proc_pidpath(self) rc=103 errno=0(Undefined error: 0) path="/Users/lbcheng/cheng-lang/docs/campaigns/2026-08-31-kernel-userpath/probes/heldexec_kinfo_probe/khprobe"
proc_pidpath(1) rc=13 errno=0(Undefined error: 0) path="/sbin/launchd"
proc_pidpath(999999) rc=0 errno=3(No such process)
  region[1] addr=0x102088000 size=0x8000 prot=5/5 path="/Users/lbcheng/cheng-lang/docs/campaigns/2026-08-31-kernel-userpath/probes/heldexec_kinfo_probe/khprobe"
  region[4] addr=0x102098000 size=0x4000 prot=1/1 path="/Users/lbcheng/cheng-lang/docs/campaigns/2026-08-31-kernel-userpath/probes/heldexec_kinfo_probe/khprobe"
  region[13] addr=0x102554000 size=0x60000 prot=0/0 path="/usr/lib/dyld"
PROC_PIDREGIONPATHINFO(self) regions_walked=56 (first 3 with non-empty path shown)

=== SECTION 4: COPY-PASTE CONSTANTS (all from this run) ===
KINFO_PROC_SIZE = 648
OFF_KP_PROC = 0
OFF_KP_PROC_P_PID = 40
OFF_KP_PROC_P_COMM = 243
OFF_KP_PROC_P_FLAG = 32
OFF_KP_PROC_P_STARTTIME = 0
OFF_KP_PROC_P_STARTTIME_TV_SEC = 0
OFF_KP_PROC_P_STARTTIME_TV_USEC = 8
OFF_KP_EPROC = 296
OFF_KP_EPROC_E_PPID = 560
OFF_KP_EPROC_E_PGID = 564
OFF_KP_EPROC_E_PCRED = 312
OFF_KP_EPROC_E_PCRED_P_RUID = 392
OFF_KP_EPROC_E_PCRED_P_SVUID = 396
OFF_KP_EPROC_E_PCRED_P_RGID = 400
OFF_KP_EPROC_E_PCRED_P_SVGID = 404
OFF_KP_EPROC_E_UCRED = 416
OFF_KP_EPROC_E_UCRED_CR_UID = 420
OFF_KP_EPROC_E_UCRED_CR_NGROUPS = 424
OFF_KP_EPROC_E_UCRED_CR_GROUPS = 428
```

---

## 四、交叉验证（两侧数值并排）

四条互相独立的证据链，全部一致，**未出现不可信项**。

### 4.1 法 A vs 法 B：`offsetof`（编译期） vs 运行时指针差

21 项全部 `AGREE`（例）：

| 字段 | offsetof | ptrdiff |
|---|---|---|
| `kp_proc.p_pid` | 40 | 40 |
| `kp_proc.p_comm` | 243 | 243 |
| `kp_proc.p_flag` | 32 | 32 |
| `kp_eproc.e_ppid` | 560 | 560 |
| `kp_eproc.e_pgid` | 564 | 564 |
| `kp_eproc.e_pcred.p_ruid` | 392 | 392 |
| `kp_eproc.e_ucred.cr_uid` | 420 | 420 |
| `kp_eproc.e_ucred.cr_groups` | 428 | 428 |

### 4.2 法 C：**不依赖 `offsetof`** 的原始缓冲区字节扫描（内核返回值侧）

| 扫描目标 | 命中偏移 | 期望（法 A/B） | 判定 |
|---|---|---|---|
| int32 `getpid()`=34300 | 40（唯一命中，total=1） | `p_pid`=40 | MATCH |
| 字符串 `"khprobe\0"` | 243（唯一命中，total=1） | `p_comm`=243 | MATCH |
| int32 `getuid()`=501 | 392, 396, 420（total=3） | `p_ruid`=392 / `p_svuid`=396 / `cr_uid`=420 | 三个偏移逐一对上，且**无多余命中** |
| int32 `getppid()`=34294 | 560, 564（total=2） | `e_ppid`=560（首个命中） | MATCH；第二命中 564 是 `e_pgid`，因本次运行 `getppid()==getpgrp()`=34294，**顺带独立证实 `e_pgid`=564** |

### 4.3 法 D：解码值 vs libc 自报值（全 MATCH）

```
p_pid=34300 == getpid()          p_comm="khprobe" == getprogname()
e_ppid=34294 == getppid()        e_pgid=34294 == getpgrp()
cr_uid=501 == geteuid()          p_ruid=501 == getuid()   p_svuid=501 == getuid()
p_rgid=20 == getgid()            p_svgid=20 == getgid()
```

### 4.4 法 E：完全不同的 API 对拍 `p_starttime`

```
XPIDINFO pbi_start_tvsec=1789067439  vs kinfo p_starttime.tv_sec=1789067439  -> MATCH
XPIDINFO pbi_start_tvusec=34539      vs kinfo p_starttime.tv_usec=34539      -> MATCH
```

另一条独立旁证：`KERN_PROC_ALL` 返回 `len=605232`，`605232 / 648 = 934` **整除**（`rem=0`）⇒ 内核按 `sizeof(kinfo_proc)=648` 紧密打包，长度侧独立佐证了结构体大小。

---

## 五、可获取面与 errno 清单（调用者：非 root，euid=501）

| # | 调用 | rc | errno | len | 结论 |
|---|---|---|---|---|---|
| 1 | `sysctl{1,14,1,self}` | 0 | 0 | 648 | 自身全字段可读；`p_comm`==`getprogname()` |
| 2 | `sysctl{1,14,KERN_PROC_ALL,0}` 尺寸查询 | 0 | 0 | need=608472（=648×939） | 非 root 可用 |
| 3 | 同上，实际取 | 0 | 0 | got=605232（=648×**934**） | **size-query 比实取系统性多 5 条**（两次运行均差 3240B=5×648）⇒ 分配必须留 slack |
| 4 | `sysctl{1,14,1,外来pid}` ×5（uid 0/262/24） | 0 | 0 | 648 | **rc=0 且 `cr_uid`/`p_ruid`/`p_svuid` 是真实值**（如 launchd pid1 `cr_uid=0`） |
| 5 | `sysctl{1,14,1,999999}`（不存在） | 0 | 0（未改） | **0** | 失败判据是 `len==0`，**不是** rc/errno |
| 6 | `sysctl{1,14,1,已 reap 子进程}` | 0 | 0（未改） | **0** | 同上 |
| 7 | `sysctl{1,14,1,self}` + 16B 缓冲 | -1 | **12 ENOMEM** | 0 | 缓冲必须 ≥648 |
| 8 | `sysctl{1,14,1,被 SIGSTOP 的子进程}` | 0 | 0 | 648 | suspend 窗口内字段齐、`p_starttime` 稳定 |
| 9 | `csops(self, 0, &flags, 4)` | 0 | 0 | — | flags=0x22020201；**ops=0 语义未经 SDK 头确认** |
| 10 | `csops(1, 0, &flags, 4)` | 0 | 0 | — | 非 root 也能读别人 csflags=0x26015b11 |
| 11 | `csops_audittoken(零token, 0, …)` | -1 | **3 ESRCH** | — | 零 token 被拒（只测了错误路径） |
| 12 | `proc_pidpath(self, buf, 4096)` | 103 | 0 | — | 返回字节数（含 NUL），路径正确 |
| 13 | `proc_pidpath(1, …)` | 13 | 0 | — | 非 root 可读 `/sbin/launchd` |
| 14 | `proc_pidpath(999999, …)` | **0** | **3 ESRCH** | — | 陷阱：失败时 rc=0，**必须同时看 errno** |
| 15 | `proc_pidinfo(self, PROC_PIDTBSDINFO=3, …)` | 136 | 0 | — | == `sizeof(struct proc_bsdinfo)`，与 kinfo 对拍一致 |
| 16 | `proc_pidinfo(self, PROC_PIDREGIONPATHINFO=8, …)` | ==sizeof | 0 | — | 走完 56 个 region；首个 r-x 区 `vip_path` == 自身 exe 路径 |

### 对 M2 权限门最关键的一条

**非 root 下 `KERN_PROC_PID` 对 uid≠自己的进程并不返回 EPERM，而是 rc=0 且返回真实凭据**（本次 5/5 采样，含 root 进程）。因此：

- M2 **不能**把权限门写成 `errno==EPERM` / "内核拒绝别人读"；
- 这条 sysctl 的元组对本机任何非 root 进程都是**可读的**，"identity binding" 的证明力只能来自
  「内核填充 + 与 `posix_spawn` 回执 / 通道对端凭据的一致性」，不能来自"别人读不到"。

---

## 六、环境

```
$ uname -a
Darwin lbchengdeMacBook-Pro.local 25.5.0 Darwin Kernel Version 25.5.0: Mon Apr 27 20:41:15 PDT 2026; root:xnu-12377.121.6~2/RELEASE_ARM64_T6041 arm64
$ sw_vers
ProductName:            macOS
ProductVersion:         26.5
BuildVersion:           25F71
$ cc --version
Apple clang version 21.0.0 (clang-2100.1.1.101)
Target: arm64-apple-darwin25.5.0
Thread model: posix
InstalledDir: /Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin
$ sysctl -n kern.osproductversion kern.osversion hw.optional.arm64
26.5
25F71
1
$ arch
arm64
```

SDK：`xcrun --show-sdk-path` = `/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk`
（`sys/sysctl.h:472` 定义 `struct kinfo_proc`，`_pcred`/`_ucred` 同文件；`sys/proc.h` 定义 `extern_proc` 与 `p_starttime` 宏）。

---

## 七、对 M2 施工图的直接影响

### 7.1 可以落定（"待 C 探针"项可关闭）

| 施工图位置 | 原状态 | 本次结论 |
|---|---|---|
| `pd_heldexec_m1m2m4_plan.md:144` "struct 偏移全部未验证，必须先写 C 探针" | 阻塞 | **关闭**：七字段偏移见表 §1.1，四法互证一致 |
| 同行的 `e_pcred`/`e_pgrp` 名字 | 写作 `p_pcred`/`e_pgrp` | **必须改成 `e_pcred`(312)/`e_pgid`(564)**，否则代码根本编不过 |
| 桥的入参 `outBytes` 与 mib | 未定尺寸 | `sizeof(kinfo_proc)=648`；`outBytes < 648` → ENOMEM(12)。桥内应硬校验 `len == 648`，不等即 HARD_RED（可执行的 ABI 自检） |
| 桥的失败判据 | 未写 | **`rc==0 && len==0` = 取不到**（进程不存在/已 reap，errno 保持 0）；`rc==-1 && errno==ENOMEM` = 缓冲不足；**不能只判 rc<0** |
| 权限门判据（"决定 M2 的权限门判据"） | 待测 | **实测非 root 对他人 pid 全可读、无 EPERM** ⇒ 门必须建在值语义（`p_pid`+`p_starttime`+`cr_uid`/`p_ruid`/`p_svuid` 与 spawn 回执一致）上 |
| suspend 窗口内 join 是否可行 | 隐含假设 | **实测可行**：被挂起（SIGSTOP 代理）的子进程 `KERN_PROC_PID` 返回全字段，`p_starttime` 稳定 |
| `p_starttime` 当 pid version 是否够用 | 未验证 | **实测够用**：同进程两次读取 STABLE，父 `{1789067439,34539}` vs 子 `{1789067439,515436}` 可区分 |
| `KERN_PROC_ALL` 可用性 | 未验证 | **实测可用**（934 条 / 260 外来 uid）；尺寸查询系统性多 5 条 ⇒ 分配留 slack（建议 +8×648），计数用**实取 len** 反算 |
| M4 `:204` "(b) `PROC_PIDREGIONPATHINFO` 未验证" | 未验证 | **降级为已实测**：自身进程可用（56 region，首个 r-x 区 `vip_path` 与 `proc_pidpath` 逐字节一致）；regionpathinfo 对**外来 pid** 未测（M4 只对自身/子进程，够用；`proc_pidpath` 对外来 pid 已实测可读） |
| `csops` 可达性 | 未提 | 符号可链接（libSystem.tbd 导出 `csops`/`csops_audittoken`），self rc=0；**SDK 无 `sys/codesign.h`，常量需自查 xnu 源码** |

### 7.2 仍需别的证据

1. **root 视角**：本次全程非 root；M3 安装面落地后（root/签名/codesign 流程）对 root-owned 二进制的行为需复测。
2. **真实 audit token**：`csops_audittoken` 成功路径未测（零 token 只得到 ESRCH）；若 M2 最终要绑真 token，需另写探针。
3. **`POSIX_SPAWN_START_SUSPENDED` 真身**：本探针用 `SIGSTOP` 代理，语义接近但不等价（START_SUSPENDED 是 exec 后、跑任何指令前停住）。
4. **x86_64 / universal 发行面**：本机 arm64，若要求 universal 需在 x86_64（或 Rosetta 编译）重跑本探针。
5. **跨 macOS 版本 ABI**：仅 26.5(25F71) 实测；施工图 §367 已列的风险仍在，建议桥里保留 §7.1 的 `len==648` 硬校验作为运行时兜底（这不是降级，是 ABI 门）。

### 7.3 本次未触碰

未改 `src/**`、未动 `tools/`、未建分支/未 commit、**未启动任何 Cheng 编译进程**（无 `mkdir .rebuild/COMPILE_SLOT.lock`、无 `cheng_cold*`/`kd*`）。全部动作 = `cc` 编译本探针 + 运行 + 写本目录文件 + 写本报告。
