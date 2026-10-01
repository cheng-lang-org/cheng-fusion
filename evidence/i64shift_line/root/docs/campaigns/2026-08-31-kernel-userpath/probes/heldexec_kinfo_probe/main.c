/*
 * heldexec_kinfo_probe — darwin kinfo_proc 偏移 / sysctl 可获取面 实测探针
 *
 * 目的：为 held-exec M2（darwin child audit token join）提供实测常量。
 * 只读系统：本探针不写任何文件、不改任何系统状态（除自身 fork 的子进程）。
 *
 * build:  cc -O0 -Wall -o khprobe main.c
 * run:    ./khprobe
 *
 * 输出三段：
 *   [1] offsetof + 运行时指针差 两法测同一批偏移（编译器期 vs 运行期）
 *   [2] 活体 sysctl(KERN_PROC_PID, self) 原始缓冲区按测得偏移解码 + 独立字节扫描
 *   [3] sysctl 可获取面（KERN_PROC_ALL / 外来 pid / csops / proc_pidinfo / proc_pidpath /
 *       PROC_PIDREGIONPATHINFO）与 errno
 */

#include <sys/types.h>
#include <sys/sysctl.h>
#include <sys/proc.h>
#include <sys/proc_info.h>
#include <sys/param.h>
#include <sys/wait.h>
#include <libproc.h>

#include <errno.h>
#include <signal.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

/* SDK 未公开 sys/codesign.h（实测 grep 无命中），故 csops 需自声明；
 * libSystem.tbd 实测导出 csops / csops_audittoken 两个符号。 */
extern int csops(pid_t pid, unsigned int ops, void *useraddr, size_t usersize);
extern int csops_audittoken(void *token, unsigned int ops, void *useraddr, size_t usersize);

/* 实测得到的偏移，供活体解码用（全部来自本进程本机本次测量，非硬编码） */
static size_t O_KP_PROC, O_P_PID, O_P_COMM, O_P_FLAG, O_P_START;
static size_t O_START_SEC, O_START_USEC;
static size_t O_KP_EPROC, O_E_PPID, O_E_PGID;
static size_t O_E_PCRED, O_RUID, O_SVUID, O_RGID, O_SVGID;
static size_t O_E_UCRED, O_CR_UID, O_CR_NGROUPS, O_CR_GROUPS;

static void sep(const char *t) { printf("\n=== %s ===\n", t); }

/* 每条偏移并排打印：offsetof（编译期）vs 运行时指针差（运行期），slot 传 0 表示只打印 */
#define MEASURE_W(label, member, slot)                                                 \
    do {                                                                               \
        size_t o_ = offsetof(struct kinfo_proc, member);                               \
        size_t p_ = (size_t)((char *)&kprobe.member - (char *)&kprobe);                \
        size_t w_ = sizeof(((struct kinfo_proc *)0)->member);                          \
        if (slot)                                                                      \
            *(slot) = o_;                                                              \
        printf("OFF %-28s offsetof=%-5zu ptrdiff=%-5zu width=%-3zu %s\n", (label), o_,  \
               p_, w_, (o_ == p_) ? "AGREE" : "*** DISAGREE ***");                     \
    } while (0)

static uint32_t rd_u32(const unsigned char *b, size_t off) {
    uint32_t v;
    memcpy(&v, b + off, sizeof v);
    return v;
}
static int32_t rd_i32(const unsigned char *b, size_t off) {
    int32_t v;
    memcpy(&v, b + off, sizeof v);
    return v;
}
static uint64_t rd_u64(const unsigned char *b, size_t off) {
    uint64_t v;
    memcpy(&v, b + off, sizeof v);
    return v;
}
static uint16_t rd_u16(const unsigned char *b, size_t off) {
    uint16_t v;
    memcpy(&v, b + off, sizeof v);
    return v;
}

/* 独立于 offsetof 的字节扫描：在原始缓冲区里找 int32 值的所有出现位置 */
static void scan_i32(const unsigned char *buf, size_t len, int32_t val, const char *label,
                     size_t expected) {
    unsigned char pat[4];
    size_t first = (size_t)-1;
    int n = 0;
    memcpy(pat, &val, sizeof pat);
    printf("SCAN %-22s i32=%-8d hits:", label, val);
    for (size_t i = 0; i + 4 <= len; i++) {
        if (memcmp(buf + i, pat, 4) == 0) {
            if (first == (size_t)-1)
                first = i;
            if (n < 8)
                printf(" %zu", i);
            n++;
        }
    }
    if (n == 0)
        printf(" (none)");
    printf("  | total=%d first=%zd expected=%zu -> %s\n", n,
           (first == (size_t)-1) ? -1 : (ssize_t)first, expected,
           (first == expected) ? "MATCH" : "MISMATCH");
}

/* 独立于 offsetof 的字符串扫描：找 NUL 结尾的 progname 出现位置 */
static void scan_cstr(const unsigned char *buf, size_t len, const char *s, const char *label,
                      size_t expected) {
    size_t sl = strlen(s) + 1;
    size_t first = (size_t)-1;
    int n = 0;
    printf("SCAN %-22s \"%s\\0\" hits:", label, s);
    for (size_t i = 0; i + sl <= len; i++) {
        if (memcmp(buf + i, s, sl) == 0) {
            if (first == (size_t)-1)
                first = i;
            if (n < 8)
                printf(" %zu", i);
            n++;
        }
    }
    if (n == 0)
        printf(" (none)");
    printf("  | total=%d first=%zd expected=%zu -> %s\n", n,
           (first == (size_t)-1) ? -1 : (ssize_t)first, expected,
           (first == expected) ? "MATCH" : "MISMATCH");
}

/* 取一个 pid 的 kinfo_proc；返回 sysctl rc，errno 由调用方读 */
static int get_kinfo(pid_t pid, unsigned char *buf, size_t bufsz, size_t *outlen) {
    int mib[4];
    size_t len = bufsz;
    mib[0] = CTL_KERN;
    mib[1] = KERN_PROC;
    mib[2] = KERN_PROC_PID;
    mib[3] = (int)pid;
    memset(buf, 0, bufsz);
    errno = 0;
    int rc = sysctl(mib, 4, buf, &len, NULL, 0);
    if (outlen)
        *outlen = len;
    return rc;
}

/* 打印若干关键字段（用实测偏移解码） */
static void dump_key(const unsigned char *b, size_t len) {
    char comm[64];
    memset(comm, 0, sizeof comm);
    if (len >= O_P_COMM + 17)
        memcpy(comm, b + O_P_COMM, 16);
    printf("     decoded: p_pid=%d p_comm=\"%s\" p_flag=0x%08x p_starttime={%lld,%d} "
           "e_ppid=%d e_pgid=%d\n",
           rd_i32(b, O_P_PID), comm, rd_u32(b, O_P_FLAG),
           (long long)rd_u64(b, O_START_SEC), rd_i32(b, O_START_USEC), rd_i32(b, O_E_PPID),
           rd_i32(b, O_E_PGID));
    printf("              e_ucred.cr_uid=%u e_pcred.p_ruid=%u p_svuid=%u p_rgid=%u p_svgid=%u\n",
           rd_u32(b, O_CR_UID), rd_u32(b, O_RUID), rd_u32(b, O_SVUID), rd_u32(b, O_RGID),
           rd_u32(b, O_SVGID));
}

int main(void) {
    struct kinfo_proc kprobe; /* 仅用于运行时指针差 */
    unsigned char buf[4096];
    size_t len = 0;
    pid_t self = getpid();

    sep("ENV (compile-time / self-reported)");
#if defined(__arm64__)
    printf("arch=arm64\n");
#elif defined(__x86_64__)
    printf("arch=x86_64\n");
#else
    printf("arch=unknown\n");
#endif
    printf("pid=%d ppid=%d uid=%u euid=%u gid=%u pgid=%d progname=\"%s\"\n", (int)self,
           (int)getppid(), (unsigned)getuid(), (unsigned)geteuid(), (unsigned)getgid(),
           (int)getpgrp(), getprogname());
    printf("sizeof(struct kinfo_proc)=%zu\n", sizeof(struct kinfo_proc));
    printf("sizeof(struct extern_proc)=%zu sizeof(struct _pcred)=%zu sizeof(struct _ucred)=%zu\n",
           sizeof(struct extern_proc), sizeof(struct _pcred), sizeof(struct _ucred));
    printf("MAXCOMLEN=%d sizeof(struct timeval)=%zu sizeof(pid_t)=%zu sizeof(uid_t)=%zu\n",
           MAXCOMLEN, sizeof(struct timeval), sizeof(pid_t), sizeof(uid_t));
    printf("CTL_KERN=%d KERN_PROC=%d KERN_PROC_PID=%d KERN_PROC_ALL=%d\n", CTL_KERN, KERN_PROC,
           KERN_PROC_PID, KERN_PROC_ALL);
    printf("PROC_PIDTBSDINFO=%d PROC_PIDREGIONPATHINFO=%d\n", PROC_PIDTBSDINFO,
           PROC_PIDREGIONPATHINFO);

    sep("SECTION 1: offsets (offsetof vs runtime pointer-diff, same struct)");
    MEASURE_W("kp_proc", kp_proc, &O_KP_PROC);
    MEASURE_W("kp_proc.p_pid", kp_proc.p_pid, &O_P_PID);
    MEASURE_W("kp_proc.p_comm", kp_proc.p_comm, &O_P_COMM);
    MEASURE_W("kp_proc.p_flag", kp_proc.p_flag, &O_P_FLAG);
    MEASURE_W("kp_proc.p_starttime", kp_proc.p_starttime, &O_P_START);
    MEASURE_W("kp_proc.p_starttime.tv_sec", kp_proc.p_starttime.tv_sec, &O_START_SEC);
    MEASURE_W("kp_proc.p_starttime.tv_usec", kp_proc.p_starttime.tv_usec, &O_START_USEC);
    size_t sink = 0;
    MEASURE_W("kp_proc.p_stat", kp_proc.p_stat, &sink);
    MEASURE_W("kp_proc.p_pgrp", kp_proc.p_pgrp, &sink);
    MEASURE_W("kp_eproc", kp_eproc, &O_KP_EPROC);
    MEASURE_W("kp_eproc.e_ppid", kp_eproc.e_ppid, &O_E_PPID);
    MEASURE_W("kp_eproc.e_pgid", kp_eproc.e_pgid, &O_E_PGID);
    MEASURE_W("kp_eproc.e_pcred", kp_eproc.e_pcred, &O_E_PCRED);
    MEASURE_W("kp_eproc.e_pcred.p_ruid", kp_eproc.e_pcred.p_ruid, &O_RUID);
    MEASURE_W("kp_eproc.e_pcred.p_svuid", kp_eproc.e_pcred.p_svuid, &O_SVUID);
    MEASURE_W("kp_eproc.e_pcred.p_rgid", kp_eproc.e_pcred.p_rgid, &O_RGID);
    MEASURE_W("kp_eproc.e_pcred.p_svgid", kp_eproc.e_pcred.p_svgid, &O_SVGID);
    MEASURE_W("kp_eproc.e_ucred", kp_eproc.e_ucred, &O_E_UCRED);
    MEASURE_W("kp_eproc.e_ucred.cr_uid", kp_eproc.e_ucred.cr_uid, &O_CR_UID);
    MEASURE_W("kp_eproc.e_ucred.cr_ngroups", kp_eproc.e_ucred.cr_ngroups, &O_CR_NGROUPS);
    MEASURE_W("kp_eproc.e_ucred.cr_groups", kp_eproc.e_ucred.cr_groups, &O_CR_GROUPS);

    sep("SECTION 2: live sysctl(KERN_PROC_PID, self) raw decode + independent byte scan");
    int rc = get_kinfo(self, buf, sizeof buf, &len);
    printf("sysctl(CTL_KERN,KERN_PROC,KERN_PROC_PID,%d) rc=%d errno=%d(%s) len=%zu "
           "(expect len=%zu)\n",
           (int)self, rc, errno, strerror(errno), len, sizeof(struct kinfo_proc));
    if (rc != 0) {
        printf("FATAL: self KERN_PROC_PID failed; aborting sections 2-3\n");
        return 1;
    }
    dump_key(buf, len);

    /* 交叉验证 A：解码值 vs libc 自报值 */
    char comm16[17];
    memset(comm16, 0, sizeof comm16);
    memcpy(comm16, buf + O_P_COMM, 16);
    printf("XVALUE p_pid=%d vs getpid()=%d                     -> %s\n", rd_i32(buf, O_P_PID),
           (int)self, (rd_i32(buf, O_P_PID) == (int32_t)self) ? "MATCH" : "MISMATCH");
    printf("XVALUE p_comm=\"%s\" vs getprogname()=\"%s\"        -> %s\n", comm16, getprogname(),
           (strcmp(comm16, getprogname()) == 0) ? "MATCH" : "MISMATCH");
    printf("XVALUE p_starttime.tv_sec=%lld vs time(NULL)=%lld (sec, sanity only)\n",
           (long long)rd_u64(buf, O_START_SEC), (long long)time(NULL));
    printf("XVALUE p_flag=0x%08x (P_INMEM? see sys/proc.h)\n", rd_u32(buf, O_P_FLAG));
    printf("XVALUE e_ppid=%d vs getppid()=%d                  -> %s\n", rd_i32(buf, O_E_PPID),
           (int)getppid(), (rd_i32(buf, O_E_PPID) == (int32_t)getppid()) ? "MATCH" : "MISMATCH");
    printf("XVALUE e_pgid=%d vs getpgrp()=%d                   -> %s\n", rd_i32(buf, O_E_PGID),
           (int)getpgrp(), (rd_i32(buf, O_E_PGID) == (int32_t)getpgrp()) ? "MATCH" : "MISMATCH");
    printf("XVALUE e_ucred.cr_uid=%u vs geteuid()=%u           -> %s\n", rd_u32(buf, O_CR_UID),
           (unsigned)geteuid(),
           (rd_u32(buf, O_CR_UID) == (uint32_t)geteuid()) ? "MATCH" : "MISMATCH");
    printf("XVALUE e_pcred.p_ruid=%u vs getuid()=%u            -> %s\n", rd_u32(buf, O_RUID),
           (unsigned)getuid(), (rd_u32(buf, O_RUID) == (uint32_t)getuid()) ? "MATCH" : "MISMATCH");
    printf("XVALUE e_pcred.p_svuid=%u vs getuid()=%u           -> %s\n", rd_u32(buf, O_SVUID),
           (unsigned)getuid(),
           (rd_u32(buf, O_SVUID) == (uint32_t)getuid()) ? "MATCH" : "MISMATCH");
    printf("XVALUE e_pcred.p_rgid=%u vs getgid()=%u            -> %s\n", rd_u32(buf, O_RGID),
           (unsigned)getgid(), (rd_u32(buf, O_RGID) == (uint32_t)getgid()) ? "MATCH" : "MISMATCH");
    printf("XVALUE e_pcred.p_svgid=%u vs getgid()=%u           -> %s\n", rd_u32(buf, O_SVGID),
           (unsigned)getgid(),
           (rd_u32(buf, O_SVGID) == (uint32_t)getgid()) ? "MATCH" : "MISMATCH");
    printf("XVALUE e_ucred.cr_ngroups=%u cr_groups[0]=%u\n", rd_u16(buf, O_CR_NGROUPS),
           rd_u32(buf, O_CR_GROUPS));

    /* 交叉验证 B：完全不依赖 offsetof 的原始字节扫描 */
    scan_i32(buf, len, (int32_t)self, "kp_proc.p_pid", O_P_PID);
    scan_i32(buf, len, (int32_t)getppid(), "kp_eproc.e_ppid", O_E_PPID);
    scan_i32(buf, len, (int32_t)getuid(), "uid(ruid/uid/euid)", O_RUID);
    scan_cstr(buf, len, getprogname(), "kp_proc.p_comm", O_P_COMM);

    /* 交叉验证 C：同一进程用完全不同 API（proc_pidinfo）取 start time / uid 比对 */
    {
        struct proc_bsdinfo pbi;
        memset(&pbi, 0, sizeof pbi);
        errno = 0;
        int r = proc_pidinfo(self, PROC_PIDTBSDINFO, 0, &pbi, (int)sizeof pbi);
        int e = errno;
        printf("proc_pidinfo(self,PROC_PIDTBSDINFO) rc=%d errno=%d(%s) sizeof(pbi)=%zu\n", r, e,
               strerror(e), sizeof pbi);
        if (r == (int)sizeof pbi) {
            printf("XPIDINFO pbi_pid=%u pbi_comm=\"%s\" pbi_uid=%u pbi_ruid=%u pbi_svuid=%u "
                   "pbi_rgid=%u\n",
                   pbi.pbi_pid, pbi.pbi_comm, (unsigned)pbi.pbi_uid, (unsigned)pbi.pbi_ruid,
                   (unsigned)pbi.pbi_svuid, (unsigned)pbi.pbi_rgid);
            printf("XPIDINFO pbi_start_tvsec=%llu vs kinfo p_starttime.tv_sec=%lld -> %s\n",
                   (unsigned long long)pbi.pbi_start_tvsec,
                   (long long)rd_u64(buf, O_START_SEC),
                   ((uint64_t)rd_u64(buf, O_START_SEC) == pbi.pbi_start_tvsec) ? "MATCH"
                                                                              : "MISMATCH");
            printf("XPIDINFO pbi_start_tvusec=%llu vs kinfo p_starttime.tv_usec=%d -> %s\n",
                   (unsigned long long)pbi.pbi_start_tvusec, rd_i32(buf, O_START_USEC),
                   ((uint32_t)rd_i32(buf, O_START_USEC) == (uint32_t)pbi.pbi_start_tvusec)
                       ? "MATCH"
                       : "MISMATCH");
        }
    }

    sep("SECTION 3a: KERN_PROC_ALL availability");
    {
        int mib[4] = {CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0};
        size_t need = 0;
        errno = 0;
        int r1 = sysctl(mib, 4, NULL, &need, NULL, 0);
        int e1 = errno;
        printf("KERN_PROC_ALL size-query rc=%d errno=%d(%s) need=%zu\n", r1, e1, strerror(e1), need);
        if (r1 == 0 && need > 0) {
            unsigned char *all = malloc(need + 4 * sizeof(struct kinfo_proc));
            size_t got = need + 4 * sizeof(struct kinfo_proc);
            errno = 0;
            int r2 = sysctl(mib, 4, all, &got, NULL, 0);
            int e2 = errno;
            printf("KERN_PROC_ALL fetch rc=%d errno=%d(%s) got=%zu count=%zu rem=%zu\n", r2, e2,
                   strerror(e2), got, got / sizeof(struct kinfo_proc),
                   got % sizeof(struct kinfo_proc));
            if (r2 == 0) {
                size_t n = got / sizeof(struct kinfo_proc);
                int foreign = 0, shown = 0;
                printf("KERN_PROC_ALL foreign(uid!=%u) sample:\n", (unsigned)getuid());
                for (size_t i = 0; i < n; i++) {
                    const unsigned char *b = all + i * sizeof(struct kinfo_proc);
                    if (rd_u32(b, O_CR_UID) != (uint32_t)getuid()) {
                        foreign++;
                        if (shown < 5) {
                            char c[17];
                            memset(c, 0, sizeof c);
                            memcpy(c, b + O_P_COMM, 16);
                            printf("  foreign[%d] pid=%d comm=\"%s\" cr_uid=%u ruid=%u e_ppid=%d\n",
                                   shown, rd_i32(b, O_P_PID), c, rd_u32(b, O_CR_UID),
                                   rd_u32(b, O_RUID), rd_i32(b, O_E_PPID));
                            shown++;
                        }
                    }
                }
                printf("KERN_PROC_ALL total=%zu foreign=%d\n", n, foreign);
                /* 3b 用外来 pid 复测 KERN_PROC_PID */
                sep("SECTION 3b: KERN_PROC_PID on pid NOT owned by us (non-root)");
                printf("caller euid=%u (root=0 -> %s)\n", (unsigned)geteuid(),
                       (geteuid() == 0) ? "ROOT" : "NON-ROOT");
                size_t probes = 0;
                for (size_t i = 0; i < n && probes < 5; i++) {
                    const unsigned char *b = all + i * sizeof(struct kinfo_proc);
                    if (rd_u32(b, O_CR_UID) == (uint32_t)getuid())
                        continue;
                    int32_t target = rd_i32(b, O_P_PID);
                    size_t l2 = 0;
                    unsigned char tmp[sizeof(struct kinfo_proc)];
                    int r3 = get_kinfo(target, tmp, sizeof tmp, &l2);
                    int e3 = errno;
                    printf("KERN_PROC_PID(pid=%d foreign) rc=%d errno=%d(%s) len=%zu\n", target, r3,
                           e3, strerror(e3), l2);
                    if (r3 == 0 && l2 == sizeof(struct kinfo_proc)) {
                        char c[17];
                        memset(c, 0, sizeof c);
                        memcpy(c, tmp + O_P_COMM, 16);
                        printf("    filled: p_pid=%d (requested %d -> %s) p_comm=\"%s\" "
                               "cr_uid=%u p_ruid=%u p_svuid=%u\n",
                               rd_i32(tmp, O_P_PID), target,
                               (rd_i32(tmp, O_P_PID) == target) ? "MATCH" : "ZEROED/MISMATCH", c,
                               rd_u32(tmp, O_CR_UID), rd_u32(tmp, O_RUID), rd_u32(tmp, O_SVUID));
                    }
                    probes++;
                }
                if (probes == 0)
                    printf("no foreign-uid process present in KERN_PROC_ALL snapshot\n");
            }
            free(all);
        }
    }

    sep("SECTION 3c: error paths / sizing");
    {
        size_t l3 = 0;
        unsigned char tiny[16];
        int r4 = get_kinfo(self, tiny, sizeof tiny, &l3);
        int e4 = errno;
        printf("KERN_PROC_PID(self) with 16-byte buffer: rc=%d errno=%d(%s) len=%zu\n", r4, e4,
               strerror(e4), l3);

        size_t l5 = 0;
        unsigned char tmp[sizeof(struct kinfo_proc)];
        int r5 = get_kinfo((pid_t)999999, tmp, sizeof tmp, &l5);
        int e5 = errno;
        printf("KERN_PROC_PID(999999 nonexistent): rc=%d errno=%d(%s) len=%zu\n", r5, e5,
               strerror(e5), l5);

        int r6 = get_kinfo((pid_t)1, tmp, sizeof tmp, &l5);
        int e6 = errno;
        printf("KERN_PROC_PID(1 launchd): rc=%d errno=%d(%s) len=%zu", r6, e6, strerror(e6), l5);
        if (r6 == 0 && l5 == sizeof(struct kinfo_proc))
            printf(" p_pid=%d cr_uid=%u p_comm=\"%.16s\"", rd_i32(tmp, O_P_PID),
                   rd_u32(tmp, O_CR_UID), (const char *)(tmp + O_P_COMM));
        printf("\n");
    }

    sep("SECTION 3d: same-uid child (fork) — child kinfo_proc + pid-version stability");
    {
        pid_t child = fork();
        if (child == 0) {
            struct timespec ts = {0, 400 * 1000 * 1000};
            nanosleep(&ts, NULL);
            _exit(0);
        } else if (child < 0) {
            printf("fork failed errno=%d(%s)\n", errno, strerror(errno));
        } else {
            struct timespec ts = {0, 100 * 1000 * 1000};
            nanosleep(&ts, NULL);
            size_t lc = 0;
            unsigned char cb[sizeof(struct kinfo_proc)];
            int rc2 = get_kinfo(child, cb, sizeof cb, &lc);
            int ec = errno;
            printf("KERN_PROC_PID(child=%d) rc=%d errno=%d(%s) len=%zu\n", (int)child, rc2, ec,
                   strerror(ec), lc);
            if (rc2 == 0 && lc == sizeof(struct kinfo_proc)) {
                char c[17];
                memset(c, 0, sizeof c);
                memcpy(c, cb + O_P_COMM, 16);
                printf("    child: p_pid=%d p_comm=\"%s\" cr_uid=%u p_ruid=%u e_ppid=%d "
                       "p_starttime={%lld,%d}\n",
                       rd_i32(cb, O_P_PID), c, rd_u32(cb, O_CR_UID), rd_u32(cb, O_RUID),
                       rd_i32(cb, O_E_PPID), (long long)rd_u64(cb, O_START_SEC),
                       rd_i32(cb, O_START_USEC));
                printf("    child e_ppid==getpid()? %s ; child start >= parent start? %s\n",
                       (rd_i32(cb, O_E_PPID) == (int32_t)self) ? "MATCH" : "MISMATCH",
                       (rd_u64(cb, O_START_SEC) >= rd_u64(buf, O_START_SEC)) ? "yes" : "no");
            }
            /* 同 pid 二次取值：p_starttime 稳定性（pid version 语义） */
            size_t lc2 = 0;
            unsigned char cb2[sizeof(struct kinfo_proc)];
            int rc3 = get_kinfo(child, cb2, sizeof cb2, &lc2);
            if (rc3 == 0 && lc2 == sizeof(struct kinfo_proc))
                printf("    child 2nd read p_starttime={%lld,%d} (1st {%lld,%d}) -> %s\n",
                       (long long)rd_u64(cb2, O_START_SEC), rd_i32(cb2, O_START_USEC),
                       (long long)rd_u64(cb, O_START_SEC), rd_i32(cb, O_START_USEC),
                       (rd_u64(cb2, O_START_SEC) == rd_u64(cb, O_START_SEC)) ? "STABLE" : "MOVED");
            /* suspend 窗口可获取性：M2 的 audit join 发生在子进程被挂起时 */
            kill(child, SIGSTOP);
            {
                struct timespec t2 = {0, 50 * 1000 * 1000};
                nanosleep(&t2, NULL);
            }
            size_t ls = 0;
            unsigned char sb[sizeof(struct kinfo_proc)];
            int rcs = get_kinfo(child, sb, sizeof sb, &ls);
            int es = errno;
            printf("    child SIGSTOP'd (suspend window proxy): KERN_PROC_PID rc=%d errno=%d(%s) "
                   "len=%zu",
                   rcs, es, strerror(es), ls);
            if (rcs == 0 && ls == sizeof(struct kinfo_proc))
                printf(" p_pid=%d p_starttime={%lld,%d} cr_uid=%u p_ruid=%u p_flag=0x%08x",
                       rd_i32(sb, O_P_PID), (long long)rd_u64(sb, O_START_SEC),
                       rd_i32(sb, O_START_USEC), rd_u32(sb, O_CR_UID), rd_u32(sb, O_RUID),
                       rd_u32(sb, O_P_FLAG));
            printf("\n");
            kill(child, SIGCONT);

            int st = 0;
            waitpid(child, &st, 0);
            size_t lc3 = 0;
            unsigned char cb3[sizeof(struct kinfo_proc)];
            int rc4 = get_kinfo(child, cb3, sizeof cb3, &lc3);
            int ec4 = errno;
            printf("    after reap: KERN_PROC_PID(reaped child) rc=%d errno=%d(%s) len=%zu\n", rc4,
                   ec4, strerror(ec4), lc3);
        }
    }

    sep("SECTION 3e: csops / proc_pidpath / PROC_PIDREGIONPATHINFO");
    {
        /* csops: CS_OPS_STATUS 常量不在公开 SDK 头（sys/codesign.h 不在 SDK），此处 ops=0 */
        uint32_t csflags = 0;
        errno = 0;
        int r = csops(self, 0, &csflags, sizeof csflags);
        int e = errno;
        printf("csops(self, ops=0, &flags) rc=%d errno=%d(%s) flags=0x%08x "
               "[ops=0 常量含义未经 SDK 头确认]\n",
               r, e, strerror(e), csflags);
        errno = 0;
        csflags = 0;
        int r1b = csops((pid_t)1, 0, &csflags, sizeof csflags);
        printf("csops(1 launchd, ops=0, &flags) rc=%d errno=%d(%s) flags=0x%08x\n", r1b, errno,
               strerror(errno), csflags);
        errno = 0;
        uint64_t token[4] = {0, 0, 0, 0};
        int r1c = csops_audittoken(token, 0, &csflags, sizeof csflags);
        printf("csops_audittoken(zero-token, ops=0) rc=%d errno=%d(%s)\n", r1c, errno,
               strerror(errno));

        char path[4096];
        memset(path, 0, sizeof path);
        errno = 0;
        int rp = proc_pidpath(self, path, sizeof path);
        printf("proc_pidpath(self) rc=%d errno=%d(%s) path=\"%s\"\n", rp, errno, strerror(errno),
               path);
        memset(path, 0, sizeof path);
        errno = 0;
        int rp1 = proc_pidpath((pid_t)1, path, sizeof path);
        printf("proc_pidpath(1) rc=%d errno=%d(%s) path=\"%s\"\n", rp1, errno, strerror(errno),
               path);
        memset(path, 0, sizeof path);
        errno = 0;
        int rp2 = proc_pidpath((pid_t)999999, path, sizeof path);
        printf("proc_pidpath(999999) rc=%d errno=%d(%s)\n", rp2, errno, strerror(errno));

        /* PROC_PIDREGIONPATHINFO：M4 备选口径，实测能否拿到 __TEXT 的 vnode 路径 */
        uint64_t addr = 0;
        int nreg = 0, textshown = 0;
        for (int i = 0; i < 4096; i++) {
            struct proc_regionwithpathinfo rpi;
            memset(&rpi, 0, sizeof rpi);
            errno = 0;
            int rr = proc_pidinfo(self, PROC_PIDREGIONPATHINFO, addr, &rpi, (int)sizeof rpi);
            if (rr != (int)sizeof rpi) {
                if (i == 0)
                    printf("PROC_PIDREGIONPATHINFO(self) first call rc=%d errno=%d(%s) "
                           "sizeof=%zu\n",
                           rr, errno, strerror(errno), sizeof rpi);
                break;
            }
            nreg++;
            if (rpi.prp_prinfo.pri_size == 0)
                break;
            if (textshown < 3 && rpi.prp_vip.vip_path[0] != '\0') {
                printf("  region[%d] addr=0x%llx size=0x%llx prot=%d/%d path=\"%s\"\n", nreg,
                       (unsigned long long)rpi.prp_prinfo.pri_address,
                       (unsigned long long)rpi.prp_prinfo.pri_size, rpi.prp_prinfo.pri_protection,
                       rpi.prp_prinfo.pri_max_protection, rpi.prp_vip.vip_path);
                textshown++;
            }
            addr = rpi.prp_prinfo.pri_address + rpi.prp_prinfo.pri_size;
        }
        printf("PROC_PIDREGIONPATHINFO(self) regions_walked=%d (first 3 with non-empty path shown)\n",
               nreg);
    }

    sep("SECTION 4: COPY-PASTE CONSTANTS (all from this run)");
    printf("KINFO_PROC_SIZE = %zu\n", sizeof(struct kinfo_proc));
    printf("OFF_KP_PROC = %zu\n", O_KP_PROC);
    printf("OFF_KP_PROC_P_PID = %zu\n", O_P_PID);
    printf("OFF_KP_PROC_P_COMM = %zu\n", O_P_COMM);
    printf("OFF_KP_PROC_P_FLAG = %zu\n", O_P_FLAG);
    printf("OFF_KP_PROC_P_STARTTIME = %zu\n", O_P_START);
    printf("OFF_KP_PROC_P_STARTTIME_TV_SEC = %zu\n", O_START_SEC);
    printf("OFF_KP_PROC_P_STARTTIME_TV_USEC = %zu\n", O_START_USEC);
    printf("OFF_KP_EPROC = %zu\n", O_KP_EPROC);
    printf("OFF_KP_EPROC_E_PPID = %zu\n", O_E_PPID);
    printf("OFF_KP_EPROC_E_PGID = %zu\n", O_E_PGID);
    printf("OFF_KP_EPROC_E_PCRED = %zu\n", O_E_PCRED);
    printf("OFF_KP_EPROC_E_PCRED_P_RUID = %zu\n", O_RUID);
    printf("OFF_KP_EPROC_E_PCRED_P_SVUID = %zu\n", O_SVUID);
    printf("OFF_KP_EPROC_E_PCRED_P_RGID = %zu\n", O_RGID);
    printf("OFF_KP_EPROC_E_PCRED_P_SVGID = %zu\n", O_SVGID);
    printf("OFF_KP_EPROC_E_UCRED = %zu\n", O_E_UCRED);
    printf("OFF_KP_EPROC_E_UCRED_CR_UID = %zu\n", O_CR_UID);
    printf("OFF_KP_EPROC_E_UCRED_CR_NGROUPS = %zu\n", O_CR_NGROUPS);
    printf("OFF_KP_EPROC_E_UCRED_CR_GROUPS = %zu\n", O_CR_GROUPS);
    return 0;
}
