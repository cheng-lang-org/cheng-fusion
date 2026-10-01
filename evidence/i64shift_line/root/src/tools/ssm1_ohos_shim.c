/*
 * ssm1_ohos_shim.c — SSM1 播放核 M4 OHOS 真机冒烟宿主。
 *
 * 链接输入: 本文件 .o + ssm1d_export_ohos.o + psb/psh/dbg_ohos.o (M1 产物),
 * DevEco aarch64-unknown-linux-ohos-clang, musl 动态 exe。
 *
 * 职责:
 *   1. main(): 读 stdin 行 -> 同进程直调 @exportc ssm1d_cmd -> stdout 逐行应答
 *      (行协议与 ssm1_tick_daemon.cheng 完全一致; stdio 全归本文件, 规避
 *      program_support_backend get_std* 的 /dev/std* 重开路径)。
 *   2. 补齐 ohos obj 闭包残余符号 (core_runtime_provider_linux 在车头冷编与
 *      主仓 selfhost driver 双双不可编, 其职责按语义分层补齐, 详见
 *      task_m4_ohos_smoke.md):
 *      - 精确等价实现: __cheng_runtime_atomic_* 四件套、runtime event
 *        futex 锁三桥、fail_stop 桥、errno/socket 平台常量桥、系统信息桥、
 *        openat/getdents64/renameat2 fixed 桥、malloc_zone_pressure_relief
 *        (linux 无 malloc zone, 恒 0 = 无可释放)。
 *      - fail-stop 陷阱 (协议路径不可达, 触发即硬失败并打印 M4TRAP 标记):
 *        terminal 全家、darwin kqueue/peer_credentials、fsverity、biometric。
 */
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <sys/syscall.h>
#include <sys/utsname.h>
#include <unistd.h>

#ifndef FUTEX_WAIT_PRIVATE
#define FUTEX_WAIT_PRIVATE 128
#endif
#ifndef FUTEX_WAKE_PRIVATE
#define FUTEX_WAKE_PRIVATE 129
#endif
#ifndef RENAME_NOREPLACE
#define RENAME_NOREPLACE (1 << 0)
#endif
#ifndef RENAME_EXCLUDE
#define RENAME_EXCLUDE (1 << 1)
#endif

/*
 * __APPLE__ 分支仅用于宿主侧同 shim 验证: 同一 shim + 同一导出面变体在
 * macOS 链 exe 跑协议序列, 把「ohos 真机执行被设备 SELinux 策略封锁」
 * 与「协议/运行时缺陷」两层隔开。语义对齐: event/transport 锁两平台统一
 * pthread (ERRORCHECK / RECURSIVE), exit_group <-> exit,
 * gettid <-> thread_selfid, renameat2 NOREPLACE <-> renameatx_np。
 */
#ifdef __APPLE__
#include <pthread.h>
#include <sys/sysctl.h>
#endif

#define SEQ_CST __ATOMIC_SEQ_CST

/* ---------- fail-stop (语义同 core_runtime_provider_linux: fd2 写 + 退出) ---------- */

static void m4_fail_stop_raw(const char *text, int32_t exit_code) {
    size_t n = strlen(text);
    ssize_t ignored = write(2, text, n);
    ignored = write(2, "\n", 1);
    (void)ignored;
    /* 异步 stderr 桥冲刷窗口: write(2) 后立即 exit_group 会把桥 pipe 里
     * 的诊断数据带走 (F-H3 §13.2 实证), 留 400ms relay 窗口。 */
    usleep(400 * 1000);
    int32_t code = exit_code == 0 ? 70 : exit_code;
#ifdef __APPLE__
    _exit((int)code);
#else
    syscall(SYS_exit_group, code);
    syscall(SYS_exit, code);
#endif
    for (;;) {
    }
}

static int32_t m4_tid(void) {
#ifdef __APPLE__
    return (int32_t)syscall(SYS_thread_selfid);
#else
    return (int32_t)syscall(SYS_gettid);
#endif
}

/* ---------- 原子四件套 (fetch_add 回旧值; cas 回 1=成功; seq_cst) ---------- */

int32_t __cheng_runtime_atomic_load_i32(void *p) {
    return __atomic_load_n((int32_t *)p, SEQ_CST);
}

void __cheng_runtime_atomic_store_i32(void *p, int32_t v) {
    __atomic_store_n((int32_t *)p, v, SEQ_CST);
}

int32_t __cheng_runtime_atomic_add_i32(void *p, int32_t amount) {
    return __atomic_fetch_add((int32_t *)p, amount, SEQ_CST);
}

int32_t __cheng_runtime_atomic_cas_i32(void *p, int32_t expect, int32_t desired) {
    int32_t seen = expect;
    if (__atomic_compare_exchange_n((int32_t *)p, &seen, desired, 0, SEQ_CST, SEQ_CST)) {
        return 1;
    }
    return 0;
}

/* ---------- runtime event 锁 (apple/ohos/android 统一 pthread ERRORCHECK:
 * 自死锁 -> EDEADLK -> fail-stop。ohos 真机裸 futex 入口被设备策略按号/op
 * 白名单封死 (F-H3 §13.2: EPERM / SIGSYS 实证), pthread 是确定可用原语,
 * 两平台语义等价) ---------- */

static pthread_mutex_t m4_ev_mutex;
static int32_t m4_ev_host_owner;

__attribute__((constructor)) static void m4_ev_mutex_init(void) {
    pthread_mutexattr_t attr;
    pthread_mutexattr_init(&attr);
    pthread_mutexattr_settype(&attr, PTHREAD_MUTEX_ERRORCHECK);
    pthread_mutex_init(&m4_ev_mutex, &attr);
    pthread_mutexattr_destroy(&attr);
}

void cheng_native_runtime_event_lock_bridge(void) {
    int32_t tid = m4_tid();
    int rc = pthread_mutex_lock(&m4_ev_mutex);
    if (rc == EDEADLK) {
        m4_fail_stop_raw("cheng runtime event lock recursive acquire", 42);
    }
    if (rc != 0) {
        m4_fail_stop_raw("cheng runtime event lock host acquire failed", 42);
    }
    __atomic_store_n(&m4_ev_host_owner, tid, SEQ_CST);
}

void cheng_native_runtime_event_unlock_bridge(void) {
    int32_t tid = m4_tid();
    if (__atomic_load_n(&m4_ev_host_owner, SEQ_CST) != tid) {
        m4_fail_stop_raw("cheng runtime event unlock by non-owner", 39);
    }
    __atomic_store_n(&m4_ev_host_owner, 0, SEQ_CST);
    if (pthread_mutex_unlock(&m4_ev_mutex) != 0) {
        m4_fail_stop_raw("cheng runtime event unlock state corrupt", 40);
    }
}

void cheng_native_runtime_event_assert_owner_bridge(void) {
    int32_t tid = m4_tid();
    if (__atomic_load_n(&m4_ev_host_owner, SEQ_CST) != tid) {
        m4_fail_stop_raw("cheng runtime event lock ownership required", 43);
    }
}

/* ---------- QUIC transport 递归锁桥 (dual-role 同进程 serve+client 并发
 * 互斥; ohos/android/darwin-host 统一 PTHREAD_MUTEX_RECURSIVE, 常量取自
 * 各平台 pthread.h; 递归 = native_runtime 锁 span 嵌套合法) ---------- */

static pthread_mutex_t m4_quic_transport_mutex;

__attribute__((constructor)) static void m4_quic_transport_mutex_init(void) {
    pthread_mutexattr_t attr;
    pthread_mutexattr_init(&attr);
    pthread_mutexattr_settype(&attr, PTHREAD_MUTEX_RECURSIVE);
    pthread_mutex_init(&m4_quic_transport_mutex, &attr);
    pthread_mutexattr_destroy(&attr);
}

void cheng_native_quic_transport_lock_bridge(void) {
    int rc = pthread_mutex_lock(&m4_quic_transport_mutex);
    if (rc != 0) {
        m4_fail_stop_raw("cheng quic transport lock acquire failed", 42);
    }
}

void cheng_native_quic_transport_unlock_bridge(void) {
    int rc = pthread_mutex_unlock(&m4_quic_transport_mutex);
    if (rc != 0) {
        m4_fail_stop_raw("cheng quic transport unlock state corrupt", 40);
    }
}


#ifdef __APPLE__
/* leader 合成 provider 的 darwin 职责 (仅宿主验证链需要; ohos 走 lld 链,
 * 该符号由 DevEco 内建不在闭包内): darwin 线程入口的间接调用桥, SSM1
 * 冒烟单线程不可达, 保持 fail-stop 陷阱语义。 */
void __cheng_call_indirect_void(void *target, void *arg) {
    (void)target;
    (void)arg;
    m4_fail_stop_raw("M4TRAP __cheng_call_indirect_void reached", 70);
}
#endif

/* ---------- fail_stop 桥 (psh panic 路径) ---------- */

void cheng_native_fail_stop_bridge(void *reason, int32_t reason_bytes, int32_t exit_code) {
    const char *text = (const char *)reason;
    if (text == NULL) {
        text = "cheng native fail-stop";
        reason_bytes = 22;
    }
    int32_t len = reason_bytes < 0 ? 0 : reason_bytes;
    ssize_t ignored = write(2, text, (size_t)len);
    ignored = write(2, "\n", 1);
    (void)ignored;
    int32_t code = exit_code == 0 ? 70 : exit_code;
#ifdef __APPLE__
    _exit((int)code);
#else
    syscall(SYS_exit_group, code);
    syscall(SYS_exit, code);
#endif
    for (;;) {
    }
}

/* ---------- 平台常量桥 (aarch64 linux ABI 值) ---------- */

int32_t cheng_native_errno_code_bridge(void) {
    return (int32_t)errno;
}

int32_t cheng_native_af_inet_bridge(void) {
    return 2;
}

int32_t cheng_native_af_inet6_bridge(void) {
    return 10;
}

int32_t cheng_native_sock_stream_bridge(void) {
    return 1;
}

int32_t cheng_native_sock_dgram_bridge(void) {
    return 2;
}

int32_t cheng_native_ipproto_ip_bridge(void) {
    return 0;
}

int32_t cheng_native_sol_socket_bridge(void) {
    return 1;
}

int32_t cheng_native_so_reuseaddr_bridge(void) {
    return 2;
}

int32_t cheng_native_msg_waitall_bridge(void) {
    return 0x100;
}

int32_t cheng_native_sockaddr_use_len_field_bridge(void) {
    return 0; /* linux sockaddr 无 len 字段 */
}

/* ---------- 系统信息桥 (真机实值) ---------- */

static char m4_os_name_buf[64];
static char m4_os_release_buf[128];
static int32_t m4_uname_done;

static void m4_ensure_uname(void) {
    if (__atomic_load_n(&m4_uname_done, SEQ_CST) != 0) {
        return;
    }
    struct utsname u;
    if (uname(&u) == 0) {
        snprintf(m4_os_name_buf, sizeof(m4_os_name_buf), "%s", u.sysname);
        snprintf(m4_os_release_buf, sizeof(m4_os_release_buf), "%s", u.release);
    } else {
        snprintf(m4_os_name_buf, sizeof(m4_os_name_buf), "Linux");
        m4_os_release_buf[0] = '\0';
    }
    __atomic_store_n(&m4_uname_done, 1, SEQ_CST);
}

int32_t cheng_native_system_cpu_logical_cores_value_bridge(void) {
    long n = sysconf(_SC_NPROCESSORS_ONLN);
    return n > 0 ? (int32_t)n : 1;
}

int64_t cheng_native_system_memory_total_bytes_value_bridge(void) {
#ifdef __APPLE__
    int64_t memsize = 0;
    size_t len = sizeof(memsize);
    if (sysctlbyname("hw.memsize", &memsize, &len, NULL, 0) != 0) {
        return 0;
    }
    return memsize;
#else
    long pages = sysconf(_SC_PHYS_PAGES);
    long page = sysconf(_SC_PAGESIZE);
    if (pages <= 0 || page <= 0) {
        return 0;
    }
    return (int64_t)pages * (int64_t)page;
#endif
}

int64_t cheng_native_system_memory_available_bytes_value_bridge(void) {
#ifdef __APPLE__
    uint64_t free_pages = 0;
    size_t len = sizeof(free_pages);
    if (sysctlbyname("vm.page_free_count", &free_pages, &len, NULL, 0) != 0) {
        return 0;
    }
    long page = sysconf(_SC_PAGESIZE);
    if (page <= 0) {
        return 0;
    }
    return (int64_t)free_pages * (int64_t)page;
#else
    long pages = sysconf(_SC_AVPHYS_PAGES);
    long page = sysconf(_SC_PAGESIZE);
    if (pages <= 0 || page <= 0) {
        return 0;
    }
    return (int64_t)pages * (int64_t)page;
#endif
}

int64_t cheng_native_system_disk_total_bytes_value_bridge(void) {
    struct statvfs st;
    if (statvfs("/", &st) != 0) {
        return 0;
    }
    return (int64_t)st.f_blocks * (int64_t)st.f_frsize;
}

int64_t cheng_native_system_disk_available_bytes_value_bridge(void) {
    struct statvfs st;
    if (statvfs("/", &st) != 0) {
        return 0;
    }
    return (int64_t)st.f_bavail * (int64_t)st.f_frsize;
}

const char *cheng_native_system_os_name_value_bridge(void) {
    m4_ensure_uname();
    return m4_os_name_buf;
}

const char *cheng_native_system_os_release_value_bridge(void) {
    m4_ensure_uname();
    return m4_os_release_buf;
}

/* ---------- linux 无 malloc zone: 恒 0 = 无可释放 (darwin 由 libSystem 供) ---------- */

#ifndef __APPLE__
int64_t malloc_zone_pressure_relief(void *zone, int64_t goal) {
    (void)zone;
    (void)goal;
    return 0;
}
#endif

/* ---------- fixed syscall 桥 (psh 目录/重命名原语) ---------- */

int32_t cheng_host_openat_fixed(int32_t dir_fd, void *path, int32_t flags, int32_t mode) {
    return (int32_t)syscall(SYS_openat, (int)dir_fd, path, (int)flags, (mode_t)mode);
}

int32_t cheng_host_getdents_fixed(int32_t fd, void *buf, int32_t cap) {
#ifdef __APPLE__
    /* darwin 无 getdents64: 目录枚举在 darwin provider 走 opendir 路径,
     * 此桥仅 host 验证链接存在, 触发即 fail-stop。 */
    (void)fd;
    (void)buf;
    (void)cap;
    m4_fail_stop_raw("M4TRAP cheng_host_getdents_fixed on darwin", 70);
#else
    return (int32_t)syscall(SYS_getdents64, (int)fd, buf, (unsigned int)cap);
#endif
}

int32_t cheng_host_renameat_noreplace_fixed(int32_t parent_fd, void *old_name, void *new_name) {
#ifdef __APPLE__
    return (int32_t)syscall(SYS_renameatx_np, (int)parent_fd, old_name, (int)parent_fd,
                            new_name, (unsigned int)RENAME_EXCLUDE);
#else
    return (int32_t)syscall(SYS_renameat2, (int)parent_fd, old_name, (int)parent_fd,
                            new_name, (unsigned int)RENAME_NOREPLACE);
#endif
}

/* ---------- fail-stop 陷阱: 协议路径不可达, 触发即硬失败 ----------
 * terminal 全家 / darwin kqueue / peer_credentials / fsverity / biometric。
 * 职责属 core_runtime_provider_linux 与平台壳层; 该模块 obj 不可编(见
 * task_m1_mobile_smoke.md §5), M4 冒烟不做 C 冒充实现。 */

#define M4_TRAP(name)                                                       \
    do {                                                                    \
        ssize_t ignored = write(2, "M4TRAP " name " reached\n",             \
                                sizeof("M4TRAP " name " reached\n") - 1);   \
        (void)ignored;                                                      \
        m4_fail_stop_raw("M4TRAP " name, 70);                               \
    } while (0)

int32_t cheng_native_terminal_fd_close_once_bridge(int32_t fd) {
    (void)fd;
    M4_TRAP("cheng_native_terminal_fd_close_once_bridge");
}

int32_t cheng_native_terminal_decision_watch_arm_bridge(int32_t decision_reader_fd, int32_t socket_fd) {
    (void)decision_reader_fd;
    (void)socket_fd;
    M4_TRAP("cheng_native_terminal_decision_watch_arm_bridge");
}

int32_t cheng_native_terminal_finished_watch_arm_bridge(int32_t finished_reader_fd) {
    (void)finished_reader_fd;
    M4_TRAP("cheng_native_terminal_finished_watch_arm_bridge");
}

int32_t cheng_native_terminal_finished_recovery_watch_arm_bridge(int32_t finished_reader_fd,
                                                                 int32_t child_pid,
                                                                 int32_t child_birth_platform,
                                                                 uint64_t child_birth0,
                                                                 uint64_t child_birth1) {
    (void)finished_reader_fd;
    (void)child_pid;
    (void)child_birth_platform;
    (void)child_birth0;
    (void)child_birth1;
    M4_TRAP("cheng_native_terminal_finished_recovery_watch_arm_bridge");
}

int32_t cheng_native_terminal_child_birth_capture_bridge(int32_t child_pid, int32_t pidfd,
                                                         void *out_platform, void *out_birth0,
                                                         void *out_birth1) {
    (void)child_pid;
    (void)pidfd;
    (void)out_platform;
    (void)out_birth0;
    (void)out_birth1;
    M4_TRAP("cheng_native_terminal_child_birth_capture_bridge");
}

int32_t cheng_native_terminal_event_wait_bridge(int32_t watch_owner) {
    (void)watch_owner;
    M4_TRAP("cheng_native_terminal_event_wait_bridge");
}

int32_t cheng_native_terminal_event_close_bridge(int32_t watch_owner) {
    (void)watch_owner;
    M4_TRAP("cheng_native_terminal_event_close_bridge");
}

int32_t cheng_native_terminal_darwin_kqueue_note_exit_wait_bridge(int32_t child_pid) {
    (void)child_pid;
    M4_TRAP("cheng_native_terminal_darwin_kqueue_note_exit_wait_bridge");
}

int32_t cheng_native_terminal_darwin_peer_credentials_bridge(int32_t socket_fd, void *out_pid,
                                                             void *out_uid, void *out_gid) {
    (void)socket_fd;
    (void)out_pid;
    (void)out_uid;
    (void)out_gid;
    M4_TRAP("cheng_native_terminal_darwin_peer_credentials_bridge");
}

int32_t cheng_linux_fsverity_enable_sha256_bridge(int32_t fd) {
    (void)fd;
    M4_TRAP("cheng_linux_fsverity_enable_sha256_bridge");
}

int32_t cheng_linux_fsverity_measure_sha256_bridge(int32_t fd, void *out_digest) {
    (void)fd;
    (void)out_digest;
    M4_TRAP("cheng_linux_fsverity_measure_sha256_bridge");
}

const char *cheng_mobile_biometric_fingerprint_authorize_bridge_native(const char *request_wire) {
    (void)request_wire;
    M4_TRAP("cheng_mobile_biometric_fingerprint_authorize_bridge_native");
}

/* ---------- 宿主 main: stdin 行 -> ssm1d_cmd -> stdout 行 ---------- */

extern int32_t ssm1d_cmd(const char *line, void *out, int32_t cap);

#define M4_RESP_CAP 4096

int main(void) {
    static char line_buf[8192];
    static char resp_buf[M4_RESP_CAP];
    for (;;) {
        if (fgets(line_buf, (int)sizeof(line_buf), stdin) == NULL) {
            return 0; /* stdin EOF, 同 daemon rc=0 */
        }
        size_t len = strcspn(line_buf, "\n");
        line_buf[len] = '\0';
        if (len > 0 && line_buf[len - 1] == '\r') {
            line_buf[len - 1] = '\0';
        }
        int32_t ret = ssm1d_cmd(line_buf, resp_buf, M4_RESP_CAP);
        if (ret > 0) {
            fwrite(resp_buf, 1, (size_t)ret, stdout);
            fputc('\n', stdout);
            if (fflush(stdout) != 0) {
                return 1; /* 同 daemon_stdout_flush_failed 语义 */
            }
        } else if (ret == 0) {
            if (strcmp(line_buf, "quit") == 0) {
                return 0;
            }
            /* 空行: 无应答, 与 daemon 一致 */
        } else {
            fprintf(stderr, "shim_cmd_error ret=%d\n", (int)ret);
            return 2;
        }
    }
}
