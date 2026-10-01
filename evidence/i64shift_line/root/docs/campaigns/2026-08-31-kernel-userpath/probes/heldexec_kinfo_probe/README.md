# heldexec_kinfo_probe（darwin `kinfo_proc` 偏移 / `sysctl` 可获取面 实测探针）

为 held-exec M2（darwin child audit token join）提供实测常量。只读系统，除自身 `fork` 出的子进程外不改任何状态。

## 编译 + 运行（一行）

```
cc -O0 -Wall -o khprobe main.c && ./khprobe > raw_output.txt 2>&1
```

（C 层 `cc` 直编，不涉及 Cheng 编译槽位；`raw_output.txt` 是本次实跑原始输出，已入库；可执行文件跑完删除。）

## 实测环境

macOS 26.5 (25F71) / Darwin 25.5.0 `RELEASE_ARM64_T6041` / arm64 / Apple clang 21.0.0。

## 覆盖

- `offsetof` vs 运行时指针差 双法测偏移（`kp_proc`/`kp_eproc`/`p_comm`/`p_flag`/`p_starttime`/`e_ppid`/`e_pgid`/`e_pcred.*`/`e_ucred.*`）
- 活体 `sysctl(KERN_PROC_PID, self)` 原始缓冲区按测得偏移解码 + 不依赖 `offsetof` 的字节扫描交叉验证
- `proc_pidinfo(PROC_PIDTBSDINFO)` 第三方 API 交叉验证 `p_starttime`
- 可获取面：`KERN_PROC_PID` 自身/外来 pid/不存在 pid/已 reap 子进程/挂起子进程、`KERN_PROC_ALL`、缓冲区过小、`csops`、`proc_pidpath`、`PROC_PIDREGIONPATHINFO`
