#include <stdint.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <pthread.h>
#include <sys/socket.h>
#include <stdatomic.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <stdio.h>
#include <stddef.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/sysinfo.h>
#include <sys/statvfs.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#if defined(__ANDROID__)
#include <android/log.h>
#include <signal.h>
#endif

#include "cheng_hy2_tun_core.h"

#if defined(_WIN32)
#define CHENG_MOBILE_EXPORT __declspec(dllexport)
#else
#define CHENG_MOBILE_EXPORT __attribute__((visibility("default")))
#endif

#define CHENG_MOBILE_DNS_RING_CAP 256
#define CHENG_MOBILE_DNS_HOST_CAP 256
#define CHENG_MOBILE_TCP_TRACE_PORT_COUNT 65536
#define CHENG_MOBILE_TCP_TRACE_RX_SYN 0x00000001u
#define CHENG_MOBILE_TCP_TRACE_RX_ACK 0x00000002u
#define CHENG_MOBILE_TCP_TRACE_RX_PAYLOAD 0x00000004u
#define CHENG_MOBILE_TCP_TRACE_RX_FIN 0x00000008u
#define CHENG_MOBILE_TCP_TRACE_RX_RST 0x00000010u
#define CHENG_MOBILE_TCP_TRACE_TX_SYNACK 0x00000100u
#define CHENG_MOBILE_TCP_TRACE_TX_ACK 0x00000200u
#define CHENG_MOBILE_TCP_TRACE_TX_PAYLOAD 0x00000400u
#define CHENG_MOBILE_TCP_TRACE_TX_FIN 0x00000800u
#define CHENG_MOBILE_TCP_TRACE_TX_RST 0x00001000u
#define CHENG_MOBILE_TCP_TRACE_MUX_OPEN 0x00010000u
#define CHENG_MOBILE_TCP_TRACE_MUX_DATA 0x00020000u
#define CHENG_MOBILE_TCP_TRACE_MUX_FLUSH 0x00040000u
#define CHENG_MOBILE_TCP_TRACE_MUX_OPEN_OK 0x00080000u
#define CHENG_MOBILE_TCP_TRACE_MUX_OPEN_ERROR 0x00100000u
#define CHENG_MOBILE_TCP_TRACE_MUX_RX_DATA 0x00200000u
#define CHENG_MOBILE_TCP_TRACE_DECISION_PAYLOAD 0x00400000u
#define CHENG_MOBILE_TCP_TRACE_PAYLOAD_NONEMPTY 0x00800000u
#define CHENG_MOBILE_TCP_TRACE_OPEN_ATTEMPT 0x01000000u
#define CHENG_MOBILE_TCP_TRACE_TUNNEL_READABLE 0x02000000u
#define CHENG_MOBILE_TCP_TRACE_FRAME_READ 0x04000000u
#define CHENG_MOBILE_TCP_TRACE_FRAME_ERROR 0x08000000u
#define CHENG_MOBILE_TCP_TRACE_UNKNOWN_STREAM 0x10000000u

typedef int32_t (*cheng_mobile_protect_fd_fn)(void *user_data, int32_t fd);
typedef int32_t (*cheng_mobile_network_bind_fd_fn)(void *user_data, int32_t fd);
typedef int32_t (*cheng_mobile_tcp_connect4_fn)(
    void *user_data,
    int32_t b0,
    int32_t b1,
    int32_t b2,
    int32_t b3,
    int32_t port,
    int32_t timeout_ms);
typedef void (*cheng_mobile_thread_entry_fn)(void *ctx);
typedef int32_t (*cheng_mobile_tun_start_emit_fn)(uint64_t session_id,
                                                  int32_t connected,
                                                  const char *error_text,
                                                  int64_t error_text_len);
typedef int32_t (*cheng_mobile_proxy_start_emit_fn)(uint64_t session_id,
                                                    int32_t connected,
                                                    int32_t listen_port,
                                                    const char *error_text,
                                                    int64_t error_text_len);
typedef int32_t (*cheng_mobile_status_emit_fn)(int32_t abi,
                                               uint64_t session_id,
                                               int32_t connected,
                                               uint64_t rx,
                                               uint64_t tx,
                                               const char *state,
                                               int64_t state_len,
                                               const char *error,
                                               int64_t error_len);
typedef int32_t (*cheng_mobile_snapshot_emit_fn)(const char *json,
                                                 int64_t json_len);

extern void cheng_hy2_tun_core_worker_entry_bridge(void *ctx);
extern void cheng_hy2_proxy_core_worker_entry_bridge(void *ctx);

typedef struct ChengMobileThreadTask {
    cheng_mobile_thread_entry_fn entry;
    void *ctx;
} ChengMobileThreadTask;

typedef struct ChengMobileThreadHandle {
    pthread_t thread;
} ChengMobileThreadHandle;

static cheng_mobile_protect_fd_fn g_protect_fd = 0;
/* [protect-hold] ClearProtectCallback 清除 g_protect_fd 后, 后续拨号失去
 * VpnService protect → 被 global 路由导回自家 TUN(自环)。保留最后已知有效
 * 回调副本, 清除后拨号仍受保护。 */
static cheng_mobile_protect_fd_fn g_protect_fd_last = 0;
static void *g_protect_user_data = 0;
static cheng_mobile_network_bind_fd_fn g_network_bind_fd = 0;
static void *g_network_bind_user_data = 0;
static cheng_mobile_tcp_connect4_fn g_tcp_connect4 = 0;
static void *g_tcp_connect4_user_data = 0;
static cheng_mobile_tun_start_emit_fn g_emit_tun_start = 0;
static cheng_mobile_proxy_start_emit_fn g_emit_proxy_start = 0;
static cheng_mobile_status_emit_fn g_emit_status = 0;
static cheng_mobile_snapshot_emit_fn g_emit_snapshot = 0;
static uint64_t g_tun_rx_bytes = 0;
static uint64_t g_tun_tx_bytes = 0;
static uint64_t g_tun_rx_packets = 0;
static uint64_t g_tun_tx_packets = 0;
static uint64_t g_tun_wait_calls = 0;
static uint64_t g_tun_wait_ready = 0;
static uint64_t g_tun_read_calls = 0;
static uint64_t g_tun_write_calls = 0;
static int32_t g_tun_last_wait_result = 0;
static int32_t g_tun_last_read_result = 0;
static int32_t g_tun_last_write_result = 0;
static atomic_int g_local_proxy_stop_requested;
static int g_local_proxy_stop_pipe_read = -1;
static int g_local_proxy_stop_pipe_write = -1;
static int32_t g_tun_last_rx_proto = -1;
static int32_t g_tun_last_rx_sport = -1;
static int32_t g_tun_last_rx_dport = -1;
static uint32_t g_tun_last_rx_dst = 0;
static int32_t g_tun_last_tx_proto = -1;
static int32_t g_tun_last_tx_sport = -1;
static int32_t g_tun_last_tx_dport = -1;
static uint32_t g_tun_last_tx_dst = 0;
static int32_t g_tun_last_rx_dns_qtype = -1;
static int32_t g_tun_last_rx_dns_id = -1;
static int32_t g_tun_last_rx_dns_answers = -1;
static int32_t g_tun_last_rx_dns_rcode = -1;
static int32_t g_tun_last_rx_dns_checksum_ok = -1;
static uint32_t g_tun_last_rx_dns_answer_ip = 0;
static int32_t g_tun_last_tx_dns_qtype = -1;
static int32_t g_tun_last_tx_dns_id = -1;
static int32_t g_tun_last_tx_dns_answers = -1;
static int32_t g_tun_last_tx_dns_rcode = -1;
static int32_t g_tun_last_tx_dns_checksum_ok = -1;
static uint32_t g_tun_last_tx_dns_answer_ip = 0;
static uint32_t g_tun_dns_ring_seq = 0;
static int32_t g_tun_dns_ring_id[CHENG_MOBILE_DNS_RING_CAP];
static int32_t g_tun_dns_ring_qtype[CHENG_MOBILE_DNS_RING_CAP];
static int32_t g_tun_dns_ring_answers[CHENG_MOBILE_DNS_RING_CAP];
static int32_t g_tun_dns_ring_rcode[CHENG_MOBILE_DNS_RING_CAP];
static int32_t g_tun_dns_ring_checksum_ok[CHENG_MOBILE_DNS_RING_CAP];
static uint32_t g_tun_dns_ring_answer_ip[CHENG_MOBILE_DNS_RING_CAP];
static char g_tun_dns_ring_host[CHENG_MOBILE_DNS_RING_CAP][CHENG_MOBILE_DNS_HOST_CAP];
static atomic_uint g_tun_tcp_trace_flags[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_rx_packets[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_tx_packets[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_remote_ip[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_remote_port[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_last_rx_flags[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_last_tx_flags[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_ullong g_tun_tcp_trace_rx_payload_bytes[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_ullong g_tun_tcp_trace_tx_payload_bytes[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_last_rx_payload_len[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_last_tx_payload_len[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_last_rx_seq[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_last_rx_ack[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_last_tx_seq[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static atomic_uint g_tun_tcp_trace_last_tx_ack[CHENG_MOBILE_TCP_TRACE_PORT_COUNT];
static char *g_fake_dns_map_read_buf = 0;
static int32_t g_fake_dns_map_read_len = 0;
static pthread_mutex_t g_start_ready_mutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t g_start_ready_cond = PTHREAD_COND_INITIALIZER;
static int32_t g_start_ready_state = 0;

static struct timespec cheng_mobile_deadline_from_now_ms(int32_t timeout_ms) {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    if (timeout_ms < 0) {
        timeout_ms = 0;
    }
    ts.tv_sec += timeout_ms / 1000;
    ts.tv_nsec += (long)(timeout_ms % 1000) * 1000000L;
    if (ts.tv_nsec >= 1000000000L) {
        ts.tv_sec += 1;
        ts.tv_nsec -= 1000000000L;
    }
    return ts;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_start_ready_reset(void) {
    pthread_mutex_lock(&g_start_ready_mutex);
    g_start_ready_state = 0;
    pthread_cond_broadcast(&g_start_ready_cond);
    pthread_mutex_unlock(&g_start_ready_mutex);
    return 1;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_start_ready_signal(void) {
    pthread_mutex_lock(&g_start_ready_mutex);
    if (g_start_ready_state == 0) {
        g_start_ready_state = 1;
    }
    pthread_cond_broadcast(&g_start_ready_cond);
    int32_t state = g_start_ready_state;
    pthread_mutex_unlock(&g_start_ready_mutex);
    return state == 1 ? 1 : 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_start_ready_fail(void) {
    pthread_mutex_lock(&g_start_ready_mutex);
    if (g_start_ready_state == 0) {
        g_start_ready_state = -1;
    }
    pthread_cond_broadcast(&g_start_ready_cond);
    int32_t state = g_start_ready_state;
    pthread_mutex_unlock(&g_start_ready_mutex);
    return state == -1 ? 1 : 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_start_ready_wait(int32_t timeout_ms) {
    struct timespec deadline = cheng_mobile_deadline_from_now_ms(timeout_ms);
    pthread_mutex_lock(&g_start_ready_mutex);
    while (g_start_ready_state == 0) {
        int rc = pthread_cond_timedwait(&g_start_ready_cond,
                                        &g_start_ready_mutex,
                                        &deadline);
        if (rc == ETIMEDOUT) {
            pthread_mutex_unlock(&g_start_ready_mutex);
            return 0;
        }
        if (rc != 0) {
            pthread_mutex_unlock(&g_start_ready_mutex);
            errno = rc;
            return -2;
        }
    }
    int32_t state = g_start_ready_state;
    pthread_mutex_unlock(&g_start_ready_mutex);
    return state;
}

static void cheng_mobile_tun_tcp_trace_note_flag(int32_t local_port, uint32_t bit) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return;
    }
    atomic_fetch_or_explicit(&g_tun_tcp_trace_flags[local_port], bit, memory_order_relaxed);
}

static char *cheng_mobile_path_copy(const void *path_data, int32_t path_len) {
    if (path_data == 0 || path_len <= 0 || path_len > 4096) {
        errno = EINVAL;
        return 0;
    }
    const char *src = (const char *)path_data;
    for (int32_t i = 0; i < path_len; ++i) {
        if (src[i] == '\0') {
            errno = EINVAL;
            return 0;
        }
    }
    char *path = (char *)calloc((size_t)path_len + 1u, 1u);
    if (path == 0) {
        errno = ENOMEM;
        return 0;
    }
    memcpy(path, src, (size_t)path_len);
    path[path_len] = '\0';
    return path;
}

CHENG_MOBILE_EXPORT void *cheng_mobile_fake_dns_map_read_ptr_bridge(const void *path_data,
                                                                    int32_t path_len) {
    free(g_fake_dns_map_read_buf);
    g_fake_dns_map_read_buf = 0;
    g_fake_dns_map_read_len = 0;

    char *path = cheng_mobile_path_copy(path_data, path_len);
    if (path == 0) {
        return 0;
    }
    FILE *fp = fopen(path, "rb");
    free(path);
    if (fp == 0) {
        return 0;
    }
    if (fseek(fp, 0, SEEK_END) != 0) {
        fclose(fp);
        return 0;
    }
    long size = ftell(fp);
    if (size <= 0 || size > 1048576) {
        fclose(fp);
        return 0;
    }
    if (fseek(fp, 0, SEEK_SET) != 0) {
        fclose(fp);
        return 0;
    }
    char *buf = (char *)calloc((size_t)size + 1u, 1u);
    if (buf == 0) {
        fclose(fp);
        return 0;
    }
    size_t got = fread(buf, 1u, (size_t)size, fp);
    fclose(fp);
    if (got != (size_t)size) {
        free(buf);
        return 0;
    }
    g_fake_dns_map_read_buf = buf;
    g_fake_dns_map_read_len = (int32_t)size;
    return g_fake_dns_map_read_buf;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_fake_dns_map_read_len_bridge(const void *path_data,
                                                                      int32_t path_len) {
    (void)path_data;
    (void)path_len;
    return g_fake_dns_map_read_len;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_fake_dns_map_write_bridge(const void *path_data,
                                                                   int32_t path_len,
                                                                   const void *data,
                                                                   int32_t data_len) {
    if (data_len < 0 || data_len > 1048576) {
        errno = EINVAL;
        return 0;
    }
    if (data_len > 0 && data == 0) {
        errno = EINVAL;
        return 0;
    }
    char *path = cheng_mobile_path_copy(path_data, path_len);
    if (path == 0) {
        return 0;
    }
    size_t path_size = strlen(path);
    char *tmp = (char *)calloc(path_size + 5u, 1u);
    if (tmp == 0) {
        free(path);
        errno = ENOMEM;
        return 0;
    }
    memcpy(tmp, path, path_size);
    memcpy(tmp + path_size, ".tmp", 5u);

    FILE *fp = fopen(tmp, "wb");
    if (fp == 0) {
        free(tmp);
        free(path);
        return 0;
    }
    size_t wrote = 0;
    if (data_len > 0) {
        wrote = fwrite(data, 1u, (size_t)data_len, fp);
    }
    int flush_rc = fflush(fp);
    int close_rc = fclose(fp);
    if ((data_len > 0 && wrote != (size_t)data_len) || flush_rc != 0 || close_rc != 0) {
        unlink(tmp);
        free(tmp);
        free(path);
        return 0;
    }
    if (rename(tmp, path) != 0) {
        unlink(tmp);
        free(tmp);
        free(path);
        return 0;
    }
    free(tmp);
    free(path);
    return 1;
}

CHENG_MOBILE_EXPORT int32_t cheng_native_errno_code_bridge(void) {
    return errno;
}

CHENG_MOBILE_EXPORT int32_t cheng_errno(void) {
    return errno;
}

CHENG_MOBILE_EXPORT int32_t libc_send(int32_t fd, void *buf, int32_t len, int32_t flags) {
    if (fd < 0 || buf == 0 || len < 0) {
        errno = EINVAL;
        return -1;
    }
    ssize_t n;
    do {
        n = send(fd, buf, (size_t)len, flags);
    } while (n < 0 && errno == EINTR);
    if (n < 0 && errno == 0) {
        errno = EIO;
    }
    return (int32_t)n;
}

CHENG_MOBILE_EXPORT int32_t libc_recv(int32_t fd, void *buf, int32_t len, int32_t flags) {
    if (fd < 0 || buf == 0 || len < 0) {
        errno = EINVAL;
        return -1;
    }
    ssize_t n;
    do {
        n = recv(fd, buf, (size_t)len, flags);
    } while (n < 0 && errno == EINTR);
    if (n < 0 && errno == 0) {
        errno = EIO;
    }
    return (int32_t)n;
}

CHENG_MOBILE_EXPORT int32_t libc_sendto(int32_t fd,
                                        void *buf,
                                        int32_t len,
                                        int32_t flags,
                                        void *addr,
                                        int32_t addrlen) {
    if (fd < 0 || buf == 0 || len < 0 || addrlen < 0) {
        errno = EINVAL;
        return -1;
    }
    ssize_t n;
    do {
        n = sendto(fd,
                   buf,
                   (size_t)len,
                   flags,
                   (const struct sockaddr *)addr,
                   (socklen_t)addrlen);
    } while (n < 0 && errno == EINTR);
    if (n < 0 && errno == 0) {
        errno = EIO;
    }
    return (int32_t)n;
}

CHENG_MOBILE_EXPORT int32_t libc_recvfrom(int32_t fd,
                                          void *buf,
                                          int32_t len,
                                          int32_t flags,
                                          void *addr,
                                          int32_t *addrlen) {
    if (fd < 0 || buf == 0 || len < 0) {
        errno = EINVAL;
        return -1;
    }
    socklen_t raw_len = 0;
    socklen_t *raw_len_ptr = 0;
    if (addr != 0 && addrlen != 0) {
        if (*addrlen < 0) {
            errno = EINVAL;
            return -1;
        }
        raw_len = (socklen_t)(*addrlen);
        raw_len_ptr = &raw_len;
    }
    ssize_t n;
    do {
        n = recvfrom(fd,
                     buf,
                     (size_t)len,
                     flags,
                     (struct sockaddr *)addr,
                     raw_len_ptr);
    } while (n < 0 && errno == EINTR);
    if (raw_len_ptr != 0) {
        *addrlen = (int32_t)raw_len;
    }
    if (n < 0 && errno == 0) {
        errno = EIO;
    }
    return (int32_t)n;
}

static void *cheng_mobile_thread_trampoline(void *raw) {
    ChengMobileThreadTask *task = (ChengMobileThreadTask *)raw;
    if (task == 0) {
        return 0;
    }
    cheng_mobile_thread_entry_fn entry = task->entry;
    void *ctx = task->ctx;
    free(task);
    if (entry != 0) {
        entry(ctx);
    }
    return 0;
}

/* Watchdog disabled: worker spin expected during cold runtime debugging. */
static void *cheng_worker_watchdog(void *arg) {
    (void)arg;
    while (1) { sleep(60); }
    return 0;
}

static void *cheng_mobile_tun_thread_trampoline(void *raw) {
    (void)raw;
#if defined(__ANDROID__)
    pthread_setname_np(pthread_self(), "ChengHy2TunCore");
    __android_log_print(ANDROID_LOG_INFO, "ChengHy2TunCore", "tun worker enter");
    /* Start watchdog: if worker doesn't finish in 8s, abort to get tombstone backtrace */
    pthread_t wd;
    pthread_create(&wd, 0, cheng_worker_watchdog, 0);
    pthread_detach(wd);
#endif
    cheng_hy2_tun_core_worker_entry_bridge(0);
#if defined(__ANDROID__)
    __android_log_print(ANDROID_LOG_INFO, "ChengHy2TunCore", "tun worker exit");
#endif
    return 0;
}

static void *cheng_mobile_proxy_thread_trampoline(void *raw) {
    (void)raw;
#if defined(__ANDROID__)
    pthread_setname_np(pthread_self(), "ChengHy2Proxy");
    __android_log_print(ANDROID_LOG_INFO, "ChengHy2TunCore", "proxy worker enter");
#endif
    cheng_hy2_proxy_core_worker_entry_bridge(0);
#if defined(__ANDROID__)
    __android_log_print(ANDROID_LOG_INFO, "ChengHy2TunCore", "proxy worker exit");
#endif
    return 0;
}

static void *cheng_mobile_thread_start_trampoline(void *(*trampoline)(void *)) {
    if (trampoline == 0) {
        errno = EINVAL;
        return 0;
    }
    ChengMobileThreadHandle *handle =
        (ChengMobileThreadHandle *)calloc(1, sizeof(ChengMobileThreadHandle));
    if (handle == 0) {
        errno = ENOMEM;
        return 0;
    }
    /* Worker threads run cheng-generated cold functions whose single frames
     * reach multiple megabytes (see cheng_thread_create_with_bigstack_runtime
     * in program_support_backend.cheng). Bionic's default pthread stack is
     * only ~1MB, which overflows as soon as cold-layout shifts add depth.
     * Match the runtime's 64MB worker stacks and fail hard on attr errors.
     */
    pthread_attr_t worker_attr;
    int arc = pthread_attr_init(&worker_attr);
    if (arc != 0) {
        free(handle);
        errno = arc;
        return 0;
    }
    arc = pthread_attr_setstacksize(&worker_attr, 64ULL * 1024ULL * 1024ULL);
    if (arc != 0) {
        pthread_attr_destroy(&worker_attr);
        free(handle);
        errno = arc;
        return 0;
    }
    int rc = pthread_create(&handle->thread, &worker_attr, trampoline, 0);
    pthread_attr_destroy(&worker_attr);
#if defined(__ANDROID__)
    __android_log_print(ANDROID_LOG_INFO,
                        "ChengHy2TunCore",
                        "thread_start_trampoline rc=%d handle=%p",
                        rc,
                        (void *)handle);
#endif
    if (rc != 0) {
        free(handle);
        errno = rc;
        return 0;
    }
    return handle;
}

#if defined(__ANDROID__)
/* SCOPED DIAGNOSTIC (worker orc hunt): LR capture. REVERT. */
CHENG_MOBILE_EXPORT void *cheng_debug_retaddr1(void) { return __builtin_return_address(1); }
CHENG_MOBILE_EXPORT void *cheng_debug_retaddr2(void) { return __builtin_return_address(2); }
CHENG_MOBILE_EXPORT void *cheng_debug_retaddr3(void) { return __builtin_return_address(3); }
CHENG_MOBILE_EXPORT int getentropy(void *buf, size_t len) {
    if (buf == 0) {
        errno = EFAULT;
        return -1;
    }
    if (len > 256) {
        errno = EIO;
        return -1;
    }
    int fd;
    do {
        fd = open("/dev/urandom", O_RDONLY | O_CLOEXEC);
    } while (fd < 0 && errno == EINTR);
    if (fd < 0) {
        return -1;
    }

    uint8_t *p = (uint8_t *)buf;
    size_t off = 0;
    while (off < len) {
        ssize_t n;
        do {
            n = read(fd, p + off, len - off);
        } while (n < 0 && errno == EINTR);
        if (n <= 0) {
            int saved_errno = n == 0 ? EIO : errno;
            close(fd);
            errno = saved_errno;
            return -1;
        }
        off += (size_t)n;
    }
    if (close(fd) != 0) {
        return -1;
    }
    return 0;
}
#endif

static uint16_t cheng_mobile_be16(const uint8_t *p) {
    return (uint16_t)(((uint16_t)p[0] << 8) | (uint16_t)p[1]);
}

static uint32_t cheng_mobile_be32(const uint8_t *p) {
    uint32_t value = ((uint32_t)p[0] << 24);
    value |= ((uint32_t)p[1] << 16);
    value |= ((uint32_t)p[2] << 8);
    value |= (uint32_t)p[3];
    return value;
}

static uint32_t cheng_mobile_checksum_bytes(const uint8_t *p, int32_t n) {
    uint32_t sum = 0;
    int32_t i = 0;
    while (i + 1 < n) {
        sum += (uint32_t)cheng_mobile_be16(p + i);
        i += 2;
    }
    if (i < n) {
        sum += (uint32_t)p[i] << 8;
    }
    return sum;
}

static int32_t cheng_mobile_udp_checksum_ok(const uint8_t *p, ssize_t n, int32_t ihl, int32_t udp_len) {
    if (udp_len < 8 || n < (ssize_t)(ihl + udp_len)) {
        return 0;
    }
    if (cheng_mobile_be16(p + ihl + 6) == 0) {
        return 1;
    }
    uint32_t sum = 0;
    sum += (uint32_t)cheng_mobile_be16(p + 12);
    sum += (uint32_t)cheng_mobile_be16(p + 14);
    sum += (uint32_t)cheng_mobile_be16(p + 16);
    sum += (uint32_t)cheng_mobile_be16(p + 18);
    sum += 17;
    sum += (uint32_t)udp_len;
    sum += cheng_mobile_checksum_bytes(p + ihl, udp_len);
    while ((sum >> 16) != 0) {
        sum = (sum & 0xffffu) + (sum >> 16);
    }
    return (sum & 0xffffu) == 0xffffu ? 1 : 0;
}

static int32_t cheng_mobile_dns_skip_name(const uint8_t *payload, int32_t payload_len, int32_t pos) {
    while (pos < payload_len) {
        int32_t label_len = (int32_t)payload[pos];
        if ((label_len & 192) == 192) {
            return pos + 2 <= payload_len ? pos + 2 : payload_len + 1;
        }
        if ((label_len & 192) == 192) {
            if (pos + 1 >= payload_len) {
                return payload_len + 1;
            }
            return pos + 2;
        }
        if ((label_len & 192) != 0 || label_len > 63) {
            return payload_len + 1;
        }
        pos += 1;
        if (label_len == 0) {
            return pos;
        }
        if (pos + label_len > payload_len) {
            return payload_len + 1;
        }
        pos += label_len;
    }
    return payload_len + 1;
}

static char cheng_mobile_ascii_lower(char ch) {
    if (ch >= 'A' && ch <= 'Z') {
        return (char)(ch - 'A' + 'a');
    }
    return ch;
}

static int cheng_mobile_dns_host_equals(const char *left, const char *right) {
    if (left == 0 || right == 0) {
        return 0;
    }
    int32_t pos = 0;
    while (left[pos] != '\0' && right[pos] != '\0') {
        if (cheng_mobile_ascii_lower(left[pos]) != cheng_mobile_ascii_lower(right[pos])) {
            return 0;
        }
        pos += 1;
    }
    return left[pos] == '\0' && right[pos] == '\0';
}

static int32_t cheng_mobile_normalize_host(const char *host_data,
                                           int32_t host_len,
                                           char *out,
                                           int32_t out_cap) {
    if (host_data == 0 || out == 0 || out_cap <= 1 || host_len <= 0 || host_len >= out_cap) {
        return 0;
    }
    int32_t n = host_len;
    while (n > 0 && host_data[n - 1] == '.') {
        n -= 1;
    }
    if (n <= 0 || n >= out_cap) {
        return 0;
    }
    for (int32_t i = 0; i < n; ++i) {
        char ch = host_data[i];
        if (ch == '\0' || ch == '/' || ch == ':' || ch == ' ') {
            return 0;
        }
        out[i] = cheng_mobile_ascii_lower(ch);
    }
    out[n] = '\0';
    return n;
}

static int32_t cheng_mobile_dns_read_question_name(const uint8_t *payload,
                                                   int32_t payload_len,
                                                   int32_t pos,
                                                   char *out,
                                                   int32_t out_cap) {
    if (payload == 0 || out == 0 || out_cap <= 1) {
        return payload_len + 1;
    }
    int32_t out_pos = 0;
    while (pos < payload_len) {
        int32_t label_len = (int32_t)payload[pos];
        if ((label_len & 192) != 0 || label_len > 63) {
            return payload_len + 1;
        }
        pos += 1;
        if (label_len == 0) {
            if (out_pos > 0 && out[out_pos - 1] == '.') {
                out_pos -= 1;
            }
            out[out_pos] = '\0';
            return pos;
        }
        if (pos + label_len > payload_len) {
            return payload_len + 1;
        }
        if (out_pos != 0) {
            if (out_pos + 1 >= out_cap) {
                return payload_len + 1;
            }
            out[out_pos] = '.';
            out_pos += 1;
        }
        if (out_pos + label_len >= out_cap) {
            return payload_len + 1;
        }
        for (int32_t i = 0; i < label_len; ++i) {
            char ch = (char)payload[pos + i];
            if (ch == '\0') {
                return payload_len + 1;
            }
            out[out_pos + i] = cheng_mobile_ascii_lower(ch);
        }
        out_pos += label_len;
        pos += label_len;
    }
    return payload_len + 1;
}

static void cheng_mobile_record_dns_packet(int is_tx,
                                           const uint8_t *payload,
                                           int32_t payload_len,
                                           int32_t checksum_ok) {
    int32_t query_id = -1;
    int32_t qtype = -1;
    int32_t answers = -1;
    int32_t rcode = -1;
    uint32_t answer_ip = 0;
    char qname[CHENG_MOBILE_DNS_HOST_CAP];
    memset(qname, 0, sizeof(qname));
    if (payload != 0 && payload_len >= 12) {
        query_id = (int32_t)cheng_mobile_be16(payload);
        answers = (int32_t)cheng_mobile_be16(payload + 6);
        rcode = (int32_t)(payload[3] & 15);
        int32_t pos = cheng_mobile_dns_read_question_name(payload,
                                                          payload_len,
                                                          12,
                                                          qname,
                                                          CHENG_MOBILE_DNS_HOST_CAP);
        if (pos + 4 <= payload_len) {
            qtype = (int32_t)cheng_mobile_be16(payload + pos);
            pos += 4;
        }
        for (int32_t i = 0; i < answers && pos < payload_len; ++i) {
            pos = cheng_mobile_dns_skip_name(payload, payload_len, pos);
            if (pos + 10 > payload_len) {
                break;
            }
            int32_t answer_type = (int32_t)cheng_mobile_be16(payload + pos);
            int32_t answer_class = (int32_t)cheng_mobile_be16(payload + pos + 2);
            int32_t rd_len = (int32_t)cheng_mobile_be16(payload + pos + 8);
            pos += 10;
            if (pos + rd_len > payload_len) {
                break;
            }
            if (answer_type == 1 && answer_class == 1 && rd_len == 4) {
                answer_ip = cheng_mobile_be32(payload + pos);
                break;
            }
            pos += rd_len;
        }
    }
    if (is_tx) {
        g_tun_last_tx_dns_id = query_id;
        g_tun_last_tx_dns_qtype = qtype;
        g_tun_last_tx_dns_answers = answers;
        g_tun_last_tx_dns_rcode = rcode;
        g_tun_last_tx_dns_checksum_ok = checksum_ok;
        g_tun_last_tx_dns_answer_ip = answer_ip;
        uint32_t seq = g_tun_dns_ring_seq++;
        uint32_t slot = seq % CHENG_MOBILE_DNS_RING_CAP;
        g_tun_dns_ring_id[slot] = query_id;
        g_tun_dns_ring_qtype[slot] = qtype;
        g_tun_dns_ring_answers[slot] = answers;
        g_tun_dns_ring_rcode[slot] = rcode;
        g_tun_dns_ring_checksum_ok[slot] = checksum_ok;
        g_tun_dns_ring_answer_ip[slot] = answer_ip;
        memcpy(g_tun_dns_ring_host[slot], qname, CHENG_MOBILE_DNS_HOST_CAP);
    } else {
        g_tun_last_rx_dns_id = query_id;
        g_tun_last_rx_dns_qtype = qtype;
        g_tun_last_rx_dns_answers = answers;
        g_tun_last_rx_dns_rcode = rcode;
        g_tun_last_rx_dns_checksum_ok = checksum_ok;
        g_tun_last_rx_dns_answer_ip = answer_ip;
    }
}

static void cheng_mobile_record_tcp_trace(int is_tx,
                                          const uint8_t *p,
                                          ssize_t n,
                                          int32_t ihl) {
    if (p == 0 || n < (ssize_t)(ihl + 20)) {
        return;
    }
    int32_t tcp_header_len = (int32_t)((p[ihl + 12] >> 4) & 15) * 4;
    if (tcp_header_len < 20 || n < (ssize_t)(ihl + tcp_header_len)) {
        return;
    }
    int32_t total_len = (int32_t)cheng_mobile_be16(p + 2);
    if (total_len < ihl + tcp_header_len || total_len > n) {
        total_len = (int32_t)n;
    }
    int32_t payload_len = total_len - ihl - tcp_header_len;
    int32_t sport = (int32_t)cheng_mobile_be16(p + ihl);
    int32_t dport = (int32_t)cheng_mobile_be16(p + ihl + 2);
    uint32_t src = cheng_mobile_be32(p + 12);
    uint32_t dst = cheng_mobile_be32(p + 16);
    uint32_t seq = cheng_mobile_be32(p + ihl + 4);
    uint32_t ack = cheng_mobile_be32(p + ihl + 8);
    uint32_t flags_byte = (uint32_t)p[ihl + 13];
    int32_t local_port = is_tx ? dport : sport;
    int32_t remote_port = is_tx ? sport : dport;
    uint32_t remote_ip = is_tx ? src : dst;
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return;
    }

    uint32_t bits = 0;
    if (is_tx) {
        if ((flags_byte & 0x12u) == 0x12u) {
            bits |= CHENG_MOBILE_TCP_TRACE_TX_SYNACK;
        }
        if ((flags_byte & 0x10u) != 0) {
            bits |= CHENG_MOBILE_TCP_TRACE_TX_ACK;
        }
        if (payload_len > 0) {
            bits |= CHENG_MOBILE_TCP_TRACE_TX_PAYLOAD;
        }
        if ((flags_byte & 0x01u) != 0) {
            bits |= CHENG_MOBILE_TCP_TRACE_TX_FIN;
        }
        if ((flags_byte & 0x04u) != 0) {
            bits |= CHENG_MOBILE_TCP_TRACE_TX_RST;
        }
        atomic_fetch_add_explicit(&g_tun_tcp_trace_tx_packets[local_port], 1u, memory_order_relaxed);
        atomic_store_explicit(&g_tun_tcp_trace_last_tx_flags[local_port], flags_byte, memory_order_relaxed);
        atomic_store_explicit(&g_tun_tcp_trace_last_tx_payload_len[local_port], (uint32_t)payload_len, memory_order_relaxed);
        atomic_store_explicit(&g_tun_tcp_trace_last_tx_seq[local_port], seq, memory_order_relaxed);
        atomic_store_explicit(&g_tun_tcp_trace_last_tx_ack[local_port], ack, memory_order_relaxed);
        if (payload_len > 0) {
            atomic_fetch_add_explicit(&g_tun_tcp_trace_tx_payload_bytes[local_port],
                                      (unsigned long long)payload_len,
                                      memory_order_relaxed);
        }
    } else {
        if ((flags_byte & 0x02u) != 0) {
            bits |= CHENG_MOBILE_TCP_TRACE_RX_SYN;
        }
        if ((flags_byte & 0x10u) != 0) {
            bits |= CHENG_MOBILE_TCP_TRACE_RX_ACK;
        }
        if (payload_len > 0) {
            bits |= CHENG_MOBILE_TCP_TRACE_RX_PAYLOAD;
        }
        if ((flags_byte & 0x01u) != 0) {
            bits |= CHENG_MOBILE_TCP_TRACE_RX_FIN;
        }
        if ((flags_byte & 0x04u) != 0) {
            bits |= CHENG_MOBILE_TCP_TRACE_RX_RST;
        }
        atomic_fetch_add_explicit(&g_tun_tcp_trace_rx_packets[local_port], 1u, memory_order_relaxed);
        atomic_store_explicit(&g_tun_tcp_trace_last_rx_flags[local_port], flags_byte, memory_order_relaxed);
        atomic_store_explicit(&g_tun_tcp_trace_last_rx_payload_len[local_port], (uint32_t)payload_len, memory_order_relaxed);
        atomic_store_explicit(&g_tun_tcp_trace_last_rx_seq[local_port], seq, memory_order_relaxed);
        atomic_store_explicit(&g_tun_tcp_trace_last_rx_ack[local_port], ack, memory_order_relaxed);
        if (payload_len > 0) {
            atomic_fetch_add_explicit(&g_tun_tcp_trace_rx_payload_bytes[local_port],
                                      (unsigned long long)payload_len,
                                      memory_order_relaxed);
        }
    }
    atomic_fetch_or_explicit(&g_tun_tcp_trace_flags[local_port], bits, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_remote_ip[local_port], remote_ip, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_remote_port[local_port], (uint32_t)remote_port, memory_order_relaxed);
}

static void cheng_mobile_record_ip_packet(int is_tx, const void *buf, ssize_t n) {
    int32_t proto = -1;
    int32_t sport = -1;
    int32_t dport = -1;
    uint32_t dst = 0;
    if (buf != 0 && n >= 20) {
        const uint8_t *p = (const uint8_t *)buf;
        int version = (p[0] >> 4) & 15;
        int ihl = (p[0] & 15) * 4;
        if (version == 4 && ihl >= 20 && n >= ihl) {
            proto = (int32_t)p[9];
            dst = cheng_mobile_be32(p + 16);
            if ((proto == 6 || proto == 17) && n >= ihl + 4) {
                sport = (int32_t)cheng_mobile_be16(p + ihl);
                dport = (int32_t)cheng_mobile_be16(p + ihl + 2);
            }
            if (proto == 6) {
                cheng_mobile_record_tcp_trace(is_tx, p, n, ihl);
            }
            if (proto == 17 && n >= ihl + 8) {
                int32_t udp_len = (int32_t)cheng_mobile_be16(p + ihl + 4);
                if (udp_len >= 8 && n >= (ssize_t)(ihl + udp_len) &&
                    (sport == 53 || dport == 53)) {
                    int32_t checksum_ok = cheng_mobile_udp_checksum_ok(p, n, ihl, udp_len);
                    cheng_mobile_record_dns_packet(is_tx, p + ihl + 8, udp_len - 8, checksum_ok);
                }
            }
        }
    }
    if (is_tx) {
        g_tun_last_tx_proto = proto;
        g_tun_last_tx_sport = sport;
        g_tun_last_tx_dport = dport;
        g_tun_last_tx_dst = dst;
    } else {
        g_tun_last_rx_proto = proto;
        g_tun_last_rx_sport = sport;
        g_tun_last_rx_dport = dport;
        g_tun_last_rx_dst = dst;
    }
}

#if defined(__ANDROID__)
static int cheng_mobile_packet_is_dns(const void *buf, ssize_t n) {
    if (buf == 0 || n < 28) {
        return 0;
    }
    const uint8_t *p = (const uint8_t *)buf;
    int version = (p[0] >> 4) & 15;
    int ihl = (p[0] & 15) * 4;
    if (version != 4 || ihl < 20 || n < (ssize_t)(ihl + 8) || p[9] != 17) {
        return 0;
    }
    int sport = (int)cheng_mobile_be16(p + ihl);
    int dport = (int)cheng_mobile_be16(p + ihl + 2);
    return sport == 53 || dport == 53;
}

static void cheng_mobile_log_ip_packet(const char *kind,
                                       int32_t fd,
                                       const void *buf,
                                       ssize_t n) {
    if (buf == 0 || n < 20) {
        __android_log_print(ANDROID_LOG_INFO,
                            "ChengHy2TunBridge",
                            "%s fd=%d len=%zd",
                            kind,
                            fd,
                            n);
        return;
    }
    const uint8_t *p = (const uint8_t *)buf;
    int version = (p[0] >> 4) & 15;
    int ihl = (p[0] & 15) * 4;
    int proto = p[9];
    if (version != 4 || ihl < 20 || n < ihl) {
        __android_log_print(ANDROID_LOG_INFO,
                            "ChengHy2TunBridge",
                            "%s fd=%d len=%zd non_ipv4 v=%d ihl=%d",
                            kind,
                            fd,
                            n,
                            version,
                            ihl);
        return;
    }
    if (proto == 6 && n >= ihl + 20) {
        int sport = (int)cheng_mobile_be16(p + ihl);
        int dport = (int)cheng_mobile_be16(p + ihl + 2);
        int flags = p[ihl + 13];
        /* [seq-hunt] TCP seq/ack 明文入日志: 量化虚拟 TCP 序列号漂移。 */
        unsigned int tcp_seq = ((unsigned int)p[ihl + 4] << 24) | ((unsigned int)p[ihl + 5] << 16) | ((unsigned int)p[ihl + 6] << 8) | (unsigned int)p[ihl + 7];
        unsigned int tcp_ack = ((unsigned int)p[ihl + 8] << 24) | ((unsigned int)p[ihl + 9] << 16) | ((unsigned int)p[ihl + 10] << 8) | (unsigned int)p[ihl + 11];
        __android_log_print(ANDROID_LOG_INFO,
                            "ChengHy2TunBridge",
                            "%s fd=%d len=%zd proto=tcp flags=0x%x sport=%d dport=%d seq=%u ack=%u",
                            kind,
                            fd,
                            n,
                            flags,
                            sport,
                            dport,
                            tcp_seq,
                            tcp_ack);
        return;
    }
    if (proto == 17 && n >= ihl + 8) {
        int sport = (int)cheng_mobile_be16(p + ihl);
        int dport = (int)cheng_mobile_be16(p + ihl + 2);
        __android_log_print(ANDROID_LOG_INFO,
                            "ChengHy2TunBridge",
                            "%s fd=%d len=%zd proto=udp sport=%d dport=%d",
                            kind,
                            fd,
                            n,
                            sport,
                            dport);
        return;
    }
    __android_log_print(ANDROID_LOG_INFO,
                        "ChengHy2TunBridge",
                        "%s fd=%d len=%zd proto=%d",
                        kind,
                        fd,
                        n,
                        proto);
}
#endif

CHENG_MOBILE_EXPORT int32_t cheng_hy2_tun_core_set_protect_callback(
    cheng_mobile_protect_fd_fn protect_fd,
    void *protect_user_data) {
    g_protect_fd = protect_fd;
    if (protect_fd != 0) {
        g_protect_fd_last = protect_fd;
    }
    g_protect_user_data = protect_user_data;
#if defined(__ANDROID__)
    __android_log_print(ANDROID_LOG_INFO, "ChengBridge", "set_protect: fd_fn=%p", (void*)protect_fd);
#endif
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_hy2_tun_core_set_network_bind_callback(
    cheng_mobile_network_bind_fd_fn bind_fd,
    void *bind_user_data) {
    g_network_bind_fd = bind_fd;
    g_network_bind_user_data = bind_user_data;
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_hy2_tun_core_set_tcp_connect4_callback(
    cheng_mobile_tcp_connect4_fn connect_tcp4,
    void *connect_user_data) {
    g_tcp_connect4 = connect_tcp4;
    g_tcp_connect4_user_data = connect_user_data;
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_emit_callbacks_set(
    cheng_mobile_tun_start_emit_fn tun_start_emit,
    cheng_mobile_proxy_start_emit_fn proxy_start_emit,
    cheng_mobile_status_emit_fn status_emit,
    cheng_mobile_snapshot_emit_fn snapshot_emit) {
    if (tun_start_emit == 0 || proxy_start_emit == 0 || status_emit == 0 || snapshot_emit == 0) {
        return -1;
    }
    g_emit_tun_start = tun_start_emit;
    g_emit_proxy_start = proxy_start_emit;
    g_emit_status = status_emit;
    g_emit_snapshot = snapshot_emit;
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_protect_callback_ready(void) {
    int32_t r = g_protect_fd != 0 ? 1 : 0;
#if defined(__ANDROID__)
    __android_log_print(ANDROID_LOG_INFO, "ChengBridge", "protect_ready: g_protect_fd=%p result=%d", (void*)g_protect_fd, r);
#endif
    return r;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_network_bind_fd(int32_t fd) {
#if defined(__ANDROID__)
    static int logged_count = 0;
    if (logged_count < 4) {
        __android_log_print(ANDROID_LOG_INFO,
                            "ChengHy2TunBridge",
                            "network_bind_fd cb=%p ctx=%p fd=%d",
                            (void *)g_network_bind_fd,
                            g_network_bind_user_data,
                            fd);
        logged_count += 1;
    }
#endif
    if (fd < 0) {
        return 0;
    }
    if (g_network_bind_fd == 0) {
        return 1;
    }
    return g_network_bind_fd(g_network_bind_user_data, fd);
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_protect_fd(int32_t fd) {
#if defined(__ANDROID__)
    static int logged_count = 0;
    if (logged_count < 4) {
        __android_log_print(ANDROID_LOG_INFO,
                            "ChengHy2TunBridge",
                            "protect_fd cb=%p ctx=%p fd=%d",
                            (void *)g_protect_fd,
                            g_protect_user_data,
                            fd);
        logged_count += 1;
    }
#endif
    if (fd < 0) {
        return 0;
    }
    /* [protect-hold] 优先当前回调, 被清除时回退最后已知有效副本 */
    if (g_protect_fd != 0) {
        return g_protect_fd(g_protect_user_data, fd);
    }
    if (g_protect_fd_last != 0) {
        return g_protect_fd_last(g_protect_user_data, fd);
    }
    return 0;
}

static int32_t cheng_mobile_set_nonblocking_fd(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0) {
        return -errno;
    }
    if (fcntl(fd, F_SETFL, flags | O_NONBLOCK) != 0) {
        return -errno;
    }
    return 0;
}

static int64_t cheng_mobile_monotime_ms(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
        return 0;
    }
    return ((int64_t)ts.tv_sec * 1000) + ((int64_t)ts.tv_nsec / 1000000);
}

static int32_t cheng_mobile_tcp_connect4_protected_octets_impl(
    uint8_t b0,
    uint8_t b1,
    uint8_t b2,
    uint8_t b3,
    int32_t port,
    int32_t timeout_ms,
    const char *log_host) {
    if (port <= 0 || port > 65535) {
        return -EINVAL;
    }
    if (g_tcp_connect4 != 0) {
        return g_tcp_connect4(g_tcp_connect4_user_data,
                              (int32_t)b0,
                              (int32_t)b1,
                              (int32_t)b2,
                              (int32_t)b3,
                              port,
                              timeout_ms);
    }
    if (g_protect_fd == 0) {
        return -ENODEV;
    }

    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        return -errno;
    }

    if (cheng_mobile_protect_fd(fd) == 0) {
        int saved_errno = errno == 0 ? EACCES : errno;
        close(fd);
        return -saved_errno;
    }

    /* Do NOT bindNetwork here: android_setsocknetwork overwrites the
     * SO_MARK that protect_fd installed, destroying the VPN bypass and
     * looping the exit dial back into our own tun. protect_fd plus the
     * app's addDisallowedApplication(self) already pin routing to the
     * physical network. */

    int original_flags = fcntl(fd, F_GETFL, 0);
    if (original_flags < 0) {
        int saved_errno = errno;
        close(fd);
        return -saved_errno;
    }
    if (fcntl(fd, F_SETFL, original_flags | O_NONBLOCK) != 0) {
        int saved_errno = errno;
        close(fd);
        return -saved_errno;
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((uint16_t)port);
    uint8_t *dst = (uint8_t *)&addr.sin_addr.s_addr;
    dst[0] = b0;
    dst[1] = b1;
    dst[2] = b2;
    dst[3] = b3;

    int rc;
    do {
        rc = connect(fd, (const struct sockaddr *)&addr, (socklen_t)sizeof(addr));
    } while (rc != 0 && errno == EINTR);
    if (rc == 0) {
        if (fcntl(fd, F_SETFL, original_flags) != 0) {
            int saved_errno = errno;
            close(fd);
            return -saved_errno;
        }
        return fd;
    }
    if (!(errno == EINPROGRESS || errno == EALREADY || errno == EWOULDBLOCK)) {
        int saved_errno = errno;
        close(fd);
        return -saved_errno;
    }

    int64_t deadline_ms = 0;
    if (timeout_ms > 0) {
        deadline_ms = cheng_mobile_monotime_ms() + (int64_t)timeout_ms;
    }
    for (;;) {
        if (atomic_load_explicit(&g_local_proxy_stop_requested, memory_order_acquire) != 0) {
            close(fd);
            return -ECANCELED;
        }
        int poll_timeout = 100;
        if (timeout_ms <= 0) {
            poll_timeout = 0;
        } else {
            int64_t remaining = deadline_ms - cheng_mobile_monotime_ms();
            if (remaining <= 0) {
                close(fd);
                return -ETIMEDOUT;
            }
            if (remaining < (int64_t)poll_timeout) {
                poll_timeout = (int)remaining;
            }
        }

        struct pollfd pfd;
        pfd.fd = fd;
        pfd.events = POLLOUT;
        pfd.revents = 0;
        do {
            rc = poll(&pfd, 1, poll_timeout);
        } while (rc < 0 && errno == EINTR);
        if (rc < 0) {
            int saved_errno = errno;
            close(fd);
            return -saved_errno;
        }
        if (rc == 0) {
            if (timeout_ms <= 0) {
                close(fd);
                return -ETIMEDOUT;
            }
            continue;
        }

        int socket_error = 0;
        socklen_t socket_error_len = (socklen_t)sizeof(socket_error);
        do {
            rc = getsockopt(fd,
                            SOL_SOCKET,
                            SO_ERROR,
                            &socket_error,
                            &socket_error_len);
        } while (rc != 0 && errno == EINTR);
        if (rc != 0) {
            int saved_errno = errno;
            close(fd);
            return -saved_errno;
        }
        if (socket_error != 0) {
#if defined(__ANDROID__)
            __android_log_print(ANDROID_LOG_INFO,
                                "ChengHy2TunBridge",
                                "mobile_tcp_connect4 fd=%d host=%s port=%d socket_error=%d revents=0x%x",
                                fd,
                                log_host == 0 ? "<addr>" : log_host,
                                port,
                                socket_error,
                                (int)pfd.revents);
#endif
            close(fd);
            return -socket_error;
        }
        if (fcntl(fd, F_SETFL, original_flags) != 0) {
            int saved_errno = errno;
            close(fd);
            return -saved_errno;
        }
        return fd;
    }
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tcp_connect4_protected_addr_bridge(
    int32_t b0,
    int32_t b1,
    int32_t b2,
    int32_t b3,
    int32_t port,
    int32_t timeout_ms) {
    if (b0 < 0 || b0 > 255 || b1 < 0 || b1 > 255 ||
        b2 < 0 || b2 > 255 || b3 < 0 || b3 > 255) {
        return -EINVAL;
    }
    return cheng_mobile_tcp_connect4_protected_octets_impl((uint8_t)b0,
                                                           (uint8_t)b1,
                                                           (uint8_t)b2,
                                                           (uint8_t)b3,
                                                           port,
                                                           timeout_ms,
                                                           "<octets>");
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tcp_connect4_protected_cstring_bridge(
    const char *host,
    int32_t port,
    int32_t timeout_ms) {
    if (host == 0 || host[0] == '\0' || port <= 0 || port > 65535) {
        return -EINVAL;
    }
    uint8_t octets[4];
    if (inet_pton(AF_INET, host, octets) != 1) {
        return -EINVAL;
    }
    return cheng_mobile_tcp_connect4_protected_octets_impl(octets[0],
                                                           octets[1],
                                                           octets[2],
                                                           octets[3],
                                                           port,
                                                           timeout_ms,
                                                           host);
}

static int32_t cheng_mobile_stop_pipe_ensure(void) {
    if (g_local_proxy_stop_pipe_read >= 0 && g_local_proxy_stop_pipe_write >= 0) {
        return 0;
    }
    int fds[2] = {-1, -1};
    if (pipe(fds) != 0) {
        return -errno;
    }
    int32_t read_rc = cheng_mobile_set_nonblocking_fd(fds[0]);
    if (read_rc != 0) {
        close(fds[0]);
        close(fds[1]);
        return read_rc;
    }
    int32_t write_rc = cheng_mobile_set_nonblocking_fd(fds[1]);
    if (write_rc != 0) {
        close(fds[0]);
        close(fds[1]);
        return write_rc;
    }
    g_local_proxy_stop_pipe_read = fds[0];
    g_local_proxy_stop_pipe_write = fds[1];
    return 0;
}

static void cheng_mobile_stop_pipe_drain(void) {
    if (g_local_proxy_stop_pipe_read < 0) {
        return;
    }
    char buf[64];
    for (;;) {
        ssize_t n = read(g_local_proxy_stop_pipe_read, buf, sizeof(buf));
        if (n > 0) {
            continue;
        }
        if (n < 0 && errno == EINTR) {
            continue;
        }
        break;
    }
}

static int32_t cheng_mobile_stop_pipe_signal(void) {
    int32_t rc = cheng_mobile_stop_pipe_ensure();
    if (rc != 0) {
        return rc;
    }
    char b = 0;
    for (;;) {
        ssize_t n = write(g_local_proxy_stop_pipe_write, &b, 1);
        if (n == 1) {
            return 0;
        }
        if (n < 0 && errno == EINTR) {
            continue;
        }
        if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
            return 0;
        }
        return n < 0 ? -errno : -EIO;
    }
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_local_proxy_stop_set(int32_t stop_requested) {
    if (stop_requested == 0) {
        atomic_store_explicit(&g_local_proxy_stop_requested, 0, memory_order_release);
        cheng_mobile_stop_pipe_drain();
        return 0;
    }
    int32_t rc = cheng_mobile_stop_pipe_ensure();
    if (rc != 0) {
        return rc;
    }
    atomic_store_explicit(&g_local_proxy_stop_requested, 1, memory_order_release);
    rc = cheng_mobile_stop_pipe_signal();
    if (rc != 0) {
        return rc;
    }
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_local_proxy_stop_requested(void) {
    return atomic_load_explicit(&g_local_proxy_stop_requested,
                                memory_order_acquire);
}

CHENG_MOBILE_EXPORT void *cheng_mobile_thread_start_joinable(
    cheng_mobile_thread_entry_fn entry,
    void *ctx) {
    if (entry == 0) {
        errno = EINVAL;
        return 0;
    }
    ChengMobileThreadTask *task = (ChengMobileThreadTask *)calloc(1, sizeof(ChengMobileThreadTask));
    if (task == 0) {
        errno = ENOMEM;
        return 0;
    }
    ChengMobileThreadHandle *handle =
        (ChengMobileThreadHandle *)calloc(1, sizeof(ChengMobileThreadHandle));
    if (handle == 0) {
        int saved_errno = errno;
        free(task);
        errno = saved_errno == 0 ? ENOMEM : saved_errno;
        return 0;
    }
    task->entry = entry;
    task->ctx = ctx;
    int rc = pthread_create(&handle->thread, 0, cheng_mobile_thread_trampoline, task);
    if (rc != 0) {
        free(task);
        free(handle);
        errno = rc;
        return 0;
    }
    return handle;
}

CHENG_MOBILE_EXPORT void *cheng_mobile_thread_start_hy2_tun_worker(void) {
    return cheng_mobile_thread_start_trampoline(cheng_mobile_tun_thread_trampoline);
}

CHENG_MOBILE_EXPORT void *cheng_mobile_thread_start_hy2_proxy_worker(void) {
    return cheng_mobile_thread_start_trampoline(cheng_mobile_proxy_thread_trampoline);
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_thread_join(void *raw_handle) {
    ChengMobileThreadHandle *handle = (ChengMobileThreadHandle *)raw_handle;
    if (handle == 0) {
        errno = EINVAL;
        return 0;
    }
    int rc = pthread_join(handle->thread, 0);
    free(handle);
    if (rc != 0) {
        errno = rc;
        return 0;
    }
    return 1;
}

CHENG_MOBILE_EXPORT void cheng_mobile_udp_debug_event(int32_t kind,
                                                      int32_t fd,
                                                      int32_t len,
                                                      int32_t rc,
                                                      int32_t err) {
#if defined(__ANDROID__)
    static int logged_count = 0;
    if (logged_count < 256) {
        __android_log_print(ANDROID_LOG_INFO,
                            "ChengHy2TunBridge",
                            "udp_event kind=%d fd=%d len=%d rc=%d err=%d",
                            kind,
                            fd,
                            len,
                            rc,
                            err);
        logged_count += 1;
    }
#else
    (void)kind;
    (void)fd;
    (void)len;
    (void)rc;
    (void)err;
#endif
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_udp_fd_wait_readable(int32_t fd,
                                                              int32_t timeout_ms) {
    static int wait_log_count = 0;
    if (fd < 0) {
        errno = EBADF;
        return -EBADF;
    }
    struct pollfd pfd;
    pfd.fd = fd;
    pfd.events = POLLIN;
    pfd.revents = 0;
    int rc;
    do {
        rc = poll(&pfd, 1, timeout_ms);
    } while (rc < 0 && errno == EINTR);
#if defined(__ANDROID__)
    if (wait_log_count < 128) {
        __android_log_print(ANDROID_LOG_INFO,
                            "ChengHy2TunBridge",
                            "mobile_udp_wait fd=%d timeout=%d rc=%d revents=0x%x errno=%d",
                            fd,
                            timeout_ms,
                            rc,
                            (int)pfd.revents,
                            errno);
        wait_log_count += 1;
    }
#endif
    if (rc < 0) {
        return -errno;
    }
    if (rc == 0 || pfd.revents == 0) {
        return 0;
    }
    if ((pfd.revents & POLLIN) != 0) {
        return 1;
    }
    if ((pfd.revents & (POLLERR | POLLHUP | POLLNVAL)) != 0) {
        return -EIO;
    }
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_fd_wait_readable_bridge(int32_t fd,
                                                          int32_t timeout_ms) {
    if (fd < 0) {
        return -EBADF;
    }
    int32_t stop_pipe_rc = cheng_mobile_stop_pipe_ensure();
    if (stop_pipe_rc != 0) {
        return stop_pipe_rc;
    }
    if (atomic_load_explicit(&g_local_proxy_stop_requested, memory_order_acquire) != 0) {
        return 1;
    }
    struct pollfd pfds[2];
    pfds[0].fd = fd;
    pfds[0].events = POLLIN;
    pfds[0].revents = 0;
    pfds[1].fd = g_local_proxy_stop_pipe_read;
    pfds[1].events = POLLIN;
    pfds[1].revents = 0;
    int rc;
    do {
        rc = poll(pfds, 2, timeout_ms);
    } while (rc < 0 && errno == EINTR);
    if (rc < 0) {
        return -errno;
    }
    if (rc == 0) {
        return 0;
    }
    if ((pfds[1].revents & POLLIN) != 0) {
        return 1;
    }
    if ((pfds[0].revents & POLLIN) != 0) {
        return 1;
    }
    if ((pfds[0].revents & (POLLERR | POLLHUP | POLLNVAL)) != 0) {
        return -EIO;
    }
    if ((pfds[1].revents & (POLLERR | POLLHUP | POLLNVAL)) != 0) {
        return -EIO;
    }
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_tcp_socket_error_bridge(int32_t fd) {
    if (fd < 0) {
        return -EBADF;
    }
    int value = 0;
    socklen_t len = (socklen_t)sizeof(value);
    int rc;
    do {
        rc = getsockopt(fd, SOL_SOCKET, SO_ERROR, &value, &len);
    } while (rc != 0 && errno == EINTR);
    if (rc != 0) {
        return -errno;
    }
    return (int32_t)value;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_udp_recvfrom_addr_ptr_bridge(
    int32_t fd,
    void *buf,
    int32_t len,
    int32_t flags,
    void *addr,
    int32_t addr_cap,
    void *out_addr_len,
    void *out_err) {
    static int recv_log_count = 0;
    if (out_addr_len != 0) {
        *((int32_t *)out_addr_len) = 0;
    }
    if (out_err != 0) {
        *((int32_t *)out_err) = 0;
    }
    if (fd < 0 || buf == 0 || len <= 0 || addr == 0 || addr_cap <= 0 ||
        out_addr_len == 0 || out_err == 0) {
        if (out_err != 0) {
            *((int32_t *)out_err) = EINVAL;
        }
        errno = EINVAL;
        return -1;
    }
    socklen_t addr_len = (socklen_t)addr_cap;
    ssize_t n;
    do {
        n = recvfrom(fd,
                     buf,
                     (size_t)len,
                     flags,
                     (struct sockaddr *)addr,
                     &addr_len);
    } while (n < 0 && errno == EINTR);
#if defined(__ANDROID__)
    if (recv_log_count < 128) {
        __android_log_print(ANDROID_LOG_INFO,
                            "ChengHy2TunBridge",
                            "mobile_udp_recv fd=%d len=%d flags=%d rc=%zd addr_len=%u errno=%d",
                            fd,
                            len,
                            flags,
                            n,
                            (unsigned)addr_len,
                            errno);
        recv_log_count += 1;
    }
#endif
    if (n < 0) {
        *((int32_t *)out_err) = errno;
        return -1;
    }
    *((int32_t *)out_addr_len) = (int32_t)addr_len;
    return (int32_t)n;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_fd_wait_readable(int32_t fd,
                                                              int32_t timeout_ms) {
    g_tun_wait_calls += 1;
    if (fd < 0) {
        g_tun_last_wait_result = -EBADF;
        return -EBADF;
    }
    struct pollfd pfd;
    pfd.fd = fd;
    pfd.events = POLLIN;
    pfd.revents = 0;
    int rc;
    do {
        rc = poll(&pfd, 1, timeout_ms);
    } while (rc < 0 && errno == EINTR);
    if (rc < 0) {
        g_tun_last_wait_result = -errno;
        return -errno;
    }
    if (rc == 0 || pfd.revents == 0) {
        g_tun_last_wait_result = 0;
        return 0;
    }
    if ((pfd.revents & POLLIN) != 0) {
        g_tun_wait_ready += 1;
        g_tun_last_wait_result = 1;
        return 1;
    }
    g_tun_last_wait_result = -EIO;
    return -EIO;
}

CHENG_MOBILE_EXPORT int64_t cheng_mobile_tun_fd_read(int32_t fd,
                                                     void *buf,
                                                     int32_t count) {
    g_tun_read_calls += 1;
    if (fd < 0 || buf == 0 || count <= 0) {
        g_tun_last_read_result = -EINVAL;
        return -EINVAL;
    }
    ssize_t n;
    do {
        n = read(fd, buf, (size_t)count);
    } while (n < 0 && errno == EINTR);
#if defined(__ANDROID__)
    static int logged_count = 0;
    if (n > 0 && (logged_count < 64 || cheng_mobile_packet_is_dns(buf, n))) {
        cheng_mobile_log_ip_packet("tun_read", fd, buf, n);
        if (logged_count < 64) {
            logged_count += 1;
        }
    }
#endif
    if (n < 0) {
        g_tun_last_read_result = -errno;
        return -errno;
    }
    g_tun_last_read_result = (int32_t)n;
    if (n > 0) {
        cheng_mobile_record_ip_packet(0, buf, n);
        g_tun_rx_packets += 1;
        g_tun_rx_bytes += (uint64_t)n;
    }
    return (int64_t)n;
}

CHENG_MOBILE_EXPORT int64_t cheng_mobile_tun_fd_write(int32_t fd,
                                                      const void *buf,
                                                      int32_t count) {
    g_tun_write_calls += 1;
    if (fd < 0 || buf == 0 || count <= 0) {
        g_tun_last_write_result = -EINVAL;
        return -EINVAL;
    }
    ssize_t n;
    do {
        n = write(fd, buf, (size_t)count);
    } while (n < 0 && errno == EINTR);
#if defined(__ANDROID__)
    static int logged_count = 0;
    if (n > 0 && (logged_count < 64 || cheng_mobile_packet_is_dns(buf, n))) {
        cheng_mobile_log_ip_packet("tun_write", fd, buf, n);
        if (logged_count < 64) {
            logged_count += 1;
        }
    }
#endif
    if (n < 0) {
        g_tun_last_write_result = -errno;
        return -errno;
    }
    g_tun_last_write_result = (int32_t)n;
    if (n > 0) {
        cheng_mobile_record_ip_packet(1, buf, n);
        g_tun_tx_packets += 1;
        g_tun_tx_bytes += (uint64_t)n;
    }
    return (int64_t)n;
}

CHENG_MOBILE_EXPORT uint64_t cheng_mobile_tun_rx_bytes(void) {
    return g_tun_rx_bytes;
}

CHENG_MOBILE_EXPORT uint64_t cheng_mobile_tun_tx_bytes(void) {
    return g_tun_tx_bytes;
}

CHENG_MOBILE_EXPORT uint64_t cheng_mobile_tun_rx_packets(void) {
    return g_tun_rx_packets;
}

CHENG_MOBILE_EXPORT uint64_t cheng_mobile_tun_tx_packets(void) {
    return g_tun_tx_packets;
}

CHENG_MOBILE_EXPORT uint64_t cheng_mobile_tun_wait_calls(void) {
    return g_tun_wait_calls;
}

CHENG_MOBILE_EXPORT uint64_t cheng_mobile_tun_wait_ready(void) {
    return g_tun_wait_ready;
}

CHENG_MOBILE_EXPORT uint64_t cheng_mobile_tun_read_calls(void) {
    return g_tun_read_calls;
}

CHENG_MOBILE_EXPORT uint64_t cheng_mobile_tun_write_calls(void) {
    return g_tun_write_calls;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_wait_result(void) {
    return g_tun_last_wait_result;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_read_result(void) {
    return g_tun_last_read_result;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_write_result(void) {
    return g_tun_last_write_result;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_rx_proto(void) {
    return g_tun_last_rx_proto;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_rx_sport(void) {
    return g_tun_last_rx_sport;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_rx_dport(void) {
    return g_tun_last_rx_dport;
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_last_rx_dst(void) {
    return g_tun_last_rx_dst;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_tx_proto(void) {
    return g_tun_last_tx_proto;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_tx_sport(void) {
    return g_tun_last_tx_sport;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_tx_dport(void) {
    return g_tun_last_tx_dport;
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_last_tx_dst(void) {
    return g_tun_last_tx_dst;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_rx_dns_qtype(void) {
    return g_tun_last_rx_dns_qtype;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_rx_dns_id(void) {
    return g_tun_last_rx_dns_id;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_rx_dns_answers(void) {
    return g_tun_last_rx_dns_answers;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_rx_dns_rcode(void) {
    return g_tun_last_rx_dns_rcode;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_rx_dns_checksum_ok(void) {
    return g_tun_last_rx_dns_checksum_ok;
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_last_rx_dns_answer_ip(void) {
    return g_tun_last_rx_dns_answer_ip;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_tx_dns_qtype(void) {
    return g_tun_last_tx_dns_qtype;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_tx_dns_id(void) {
    return g_tun_last_tx_dns_id;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_tx_dns_answers(void) {
    return g_tun_last_tx_dns_answers;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_tx_dns_rcode(void) {
    return g_tun_last_tx_dns_rcode;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_last_tx_dns_checksum_ok(void) {
    return g_tun_last_tx_dns_checksum_ok;
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_last_tx_dns_answer_ip(void) {
    return g_tun_last_tx_dns_answer_ip;
}

/* Newest-first text dump of the transmitted-DNS ring for diagnostics:
 * "id=<id> qt=<qtype> ans=<answers> rcode=<rcode> ip=<a.b.c.d> host=<qname>\n".
 * Returns the number of bytes written (excluding NUL). */
CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_dns_ring_dump(char *out, int32_t cap) {
    if (out == 0 || cap <= 0) {
        return 0;
    }
    int32_t used = 0;
    out[0] = '\0';
    uint32_t seq = g_tun_dns_ring_seq;
    uint32_t limit = seq < (uint32_t)CHENG_MOBILE_DNS_RING_CAP ? seq : (uint32_t)CHENG_MOBILE_DNS_RING_CAP;
    for (uint32_t i = 0; i < limit; ++i) {
        uint32_t pos = (seq - 1 - i) % (uint32_t)CHENG_MOBILE_DNS_RING_CAP;
        uint32_t ip = g_tun_dns_ring_answer_ip[pos];
        int n = snprintf(out + used, (size_t)(cap - used),
                         "id=%d qt=%d ans=%d rc=%d ip=%u.%u.%u.%u host=%s\n",
                         g_tun_dns_ring_id[pos],
                         g_tun_dns_ring_qtype[pos],
                         g_tun_dns_ring_answers[pos],
                         g_tun_dns_ring_rcode[pos],
                         (ip >> 24) & 255, (ip >> 16) & 255, (ip >> 8) & 255, ip & 255,
                         g_tun_dns_ring_host[pos]);
        if (n < 0 || used + n >= cap) {
            break;
        }
        used += n;
    }
    return used;
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_dns_answer_ip_for_id(int32_t query_id) {
    uint32_t seq = g_tun_dns_ring_seq;
    uint32_t limit = seq < CHENG_MOBILE_DNS_RING_CAP ? seq : CHENG_MOBILE_DNS_RING_CAP;
    for (uint32_t i = 0; i < limit; ++i) {
        uint32_t pos = (seq - 1 - i) % CHENG_MOBILE_DNS_RING_CAP;
        if (g_tun_dns_ring_id[pos] != query_id) {
            continue;
        }
        if (g_tun_dns_ring_qtype[pos] != 1) {
            continue;
        }
        if (g_tun_dns_ring_answers[pos] <= 0) {
            continue;
        }
        if (g_tun_dns_ring_rcode[pos] != 0) {
            continue;
        }
        if (g_tun_dns_ring_checksum_ok[pos] != 1) {
            continue;
        }
        if (g_tun_dns_ring_answer_ip[pos] == 0) {
            continue;
        }
        return g_tun_dns_ring_answer_ip[pos];
    }
    return 0;
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_dns_answer_ip_for_host(const void *host_data,
                                                                     int32_t host_len) {
    char host[CHENG_MOBILE_DNS_HOST_CAP];
    if (cheng_mobile_normalize_host((const char *)host_data,
                                    host_len,
                                    host,
                                    CHENG_MOBILE_DNS_HOST_CAP) <= 0) {
        return 0;
    }
    uint32_t seq = g_tun_dns_ring_seq;
    uint32_t limit = seq < CHENG_MOBILE_DNS_RING_CAP ? seq : CHENG_MOBILE_DNS_RING_CAP;
    for (uint32_t i = 0; i < limit; ++i) {
        uint32_t pos = (seq - 1 - i) % CHENG_MOBILE_DNS_RING_CAP;
        if (!cheng_mobile_dns_host_equals(g_tun_dns_ring_host[pos], host)) {
            continue;
        }
        if (g_tun_dns_ring_qtype[pos] != 1) {
            continue;
        }
        if (g_tun_dns_ring_answers[pos] <= 0) {
            continue;
        }
        if (g_tun_dns_ring_rcode[pos] != 0) {
            continue;
        }
        if (g_tun_dns_ring_checksum_ok[pos] != 1) {
            continue;
        }
        if (g_tun_dns_ring_answer_ip[pos] == 0) {
            continue;
        }
        return g_tun_dns_ring_answer_ip[pos];
    }
    return 0;
}

CHENG_MOBILE_EXPORT void cheng_mobile_tun_tcp_trace_clear_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return;
    }
    atomic_store_explicit(&g_tun_tcp_trace_flags[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_rx_packets[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_tx_packets[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_remote_ip[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_remote_port[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_last_rx_flags[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_last_tx_flags[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_rx_payload_bytes[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_tx_payload_bytes[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_last_rx_payload_len[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_last_tx_payload_len[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_last_rx_seq[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_last_rx_ack[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_last_tx_seq[local_port], 0u, memory_order_relaxed);
    atomic_store_explicit(&g_tun_tcp_trace_last_tx_ack[local_port], 0u, memory_order_relaxed);
}

CHENG_MOBILE_EXPORT void cheng_mobile_tun_tcp_trace_clear_all(void) {
    for (int32_t local_port = 1; local_port < CHENG_MOBILE_TCP_TRACE_PORT_COUNT; ++local_port) {
        cheng_mobile_tun_tcp_trace_clear_port(local_port);
    }
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_mux_open(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_MUX_OPEN);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_mux_data(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_MUX_DATA);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_mux_flush(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_MUX_FLUSH);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_mux_open_ok(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_MUX_OPEN_OK);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_mux_open_error(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_MUX_OPEN_ERROR);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_mux_rx_data(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_MUX_RX_DATA);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_decision_payload(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_DECISION_PAYLOAD);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_payload_nonempty(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_PAYLOAD_NONEMPTY);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_open_attempt(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_OPEN_ATTEMPT);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_tunnel_readable(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_TUNNEL_READABLE);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_frame_read(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_FRAME_READ);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_frame_error(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_FRAME_ERROR);
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_mobile_tun_tcp_trace_note_unknown_stream(int32_t local_port) {
    cheng_mobile_tun_tcp_trace_note_flag(local_port, CHENG_MOBILE_TCP_TRACE_UNKNOWN_STREAM);
    return 0;
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_flags_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_flags[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_rx_packets_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_rx_packets[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_tx_packets_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_tx_packets[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_remote_ip_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_remote_ip[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_remote_port_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_remote_port[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_rx_flags_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_last_rx_flags[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_tx_flags_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_last_tx_flags[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint64_t cheng_mobile_tun_tcp_trace_rx_payload_bytes_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return (uint64_t)atomic_load_explicit(&g_tun_tcp_trace_rx_payload_bytes[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint64_t cheng_mobile_tun_tcp_trace_tx_payload_bytes_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return (uint64_t)atomic_load_explicit(&g_tun_tcp_trace_tx_payload_bytes[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_rx_payload_len_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_last_rx_payload_len[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_tx_payload_len_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_last_tx_payload_len[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_rx_seq_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_last_rx_seq[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_rx_ack_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_last_rx_ack[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_tx_seq_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_last_tx_seq[local_port], memory_order_relaxed);
}

CHENG_MOBILE_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_tx_ack_for_port(int32_t local_port) {
    if (local_port <= 0 || local_port >= CHENG_MOBILE_TCP_TRACE_PORT_COUNT) {
        return 0;
    }
    return atomic_load_explicit(&g_tun_tcp_trace_last_tx_ack[local_port], memory_order_relaxed);
}

__attribute__((weak)) int32_t cheng_hy2_tun_start_emit(uint64_t session_id, int32_t connected, const char* error_text, int64_t error_text_len) {
    if (g_emit_tun_start == 0) abort();
    return g_emit_tun_start(session_id, connected, error_text, error_text_len);
}
__attribute__((weak)) int32_t cheng_hy2_tun_status_emit(int32_t abi, uint64_t session_id, int32_t connected, uint64_t rx, uint64_t tx, const char* state, int64_t state_len, const char* error, int64_t error_len) {
    if (g_emit_status == 0) abort();
    return g_emit_status(abi, session_id, connected, rx, tx, state, state_len, error, error_len);
}

static ChengHy2TunCoreMemDiag g_last_mem_diag;

__attribute__((weak)) int32_t cheng_hy2_tun_mem_diag_emit(
    uint32_t abi_version,
    int64_t alloc_count,
    int64_t free_count,
    int64_t live_count) {
    g_last_mem_diag.abi_version = abi_version;
    g_last_mem_diag.alloc_count = alloc_count;
    g_last_mem_diag.free_count = free_count;
    g_last_mem_diag.live_count = live_count;
    return 0;
}

CHENG_MOBILE_EXPORT int32_t cheng_hy2_tun_last_mem_diag(ChengHy2TunCoreMemDiag *out) {
    if (out == 0) {
        return -1;
    }
    *out = g_last_mem_diag;
    return 0;
}

__attribute__((weak)) int32_t cheng_hy2_tun_snapshot_emit(const char* json, int64_t json_len) {
    if (g_emit_snapshot == 0) abort();
    return g_emit_snapshot(json, json_len);
}
__attribute__((weak)) int32_t cheng_hy2_proxy_start_emit(uint64_t session_id, int32_t connected, int32_t listen_port, const char* error, int64_t error_len) {
    if (g_emit_proxy_start == 0) abort();
    return g_emit_proxy_start(session_id, connected, listen_port, error, error_len);
}

int32_t cheng_native_msg_waitall_bridge(void) { return MSG_WAITALL; }
void cheng_native_register_line_map_from_argv0(const char* argv0, int64_t argv0_len) { (void)argv0; (void)argv0_len; }

/* System info bridges. */
int32_t cheng_native_system_cpu_logical_cores_value_bridge(void) {
    return (int32_t)sysconf(_SC_NPROCESSORS_ONLN);
}
int64_t cheng_native_system_memory_total_bytes_value_bridge(void) {
    struct sysinfo si;
    if (sysinfo(&si) != 0) return 0;
    return (int64_t)si.totalram * si.mem_unit;
}
int64_t cheng_native_system_memory_available_bytes_value_bridge(void) {
    struct sysinfo si;
    if (sysinfo(&si) != 0) return 0;
    return (int64_t)si.freeram * si.mem_unit;
}
int64_t cheng_native_system_disk_total_bytes_value_bridge(void) {
    struct statvfs vfs;
    if (statvfs("/", &vfs) != 0) return 0;
    return (int64_t)vfs.f_blocks * vfs.f_frsize;
}
int64_t cheng_native_system_disk_available_bytes_value_bridge(void) {
    struct statvfs vfs;
    if (statvfs("/", &vfs) != 0) return 0;
    return (int64_t)vfs.f_bavail * vfs.f_frsize;
}

/* [tls-hdr-hunt] quic transport 全局锁桥: tcp-tls 会话的 UDP 路径闭包在
 * aarch64 冷发射下首次引用到该桥(此前布局从未发射到)。语义=transport 全局
 * 互斥, 锁内嵌套合法 → 递归互斥锁; 等待点均在锁外。
 * [ohos-port] musl(OpenHarmony) 无 _NP 初始化宏, 改运行时 init with
 * PTHREAD_MUTEX_RECURSIVE; 其余平台保持零成本静态初始化。 */
#include <pthread.h>
#if defined(__OHOS__) || (defined(__MUSL__) && !defined(PTHREAD_RECURSIVE_MUTEX_INITIALIZER_NP))
static pthread_mutex_t cheng_quic_transport_lock;
static pthread_once_t cheng_quic_transport_lock_once = PTHREAD_ONCE_INIT;
static void cheng_quic_transport_lock_init(void) {
    pthread_mutexattr_t attr;
    pthread_mutexattr_init(&attr);
    pthread_mutexattr_settype(&attr, PTHREAD_MUTEX_RECURSIVE);
    pthread_mutex_init(&cheng_quic_transport_lock, &attr);
    pthread_mutexattr_destroy(&attr);
}
#define CHENG_QUIC_LOCK_ENSURE() pthread_once(&cheng_quic_transport_lock_once, cheng_quic_transport_lock_init)
#else
static pthread_mutex_t cheng_quic_transport_lock = PTHREAD_RECURSIVE_MUTEX_INITIALIZER_NP;
#define CHENG_QUIC_LOCK_ENSURE() ((void)0)
#endif
void cheng_native_quic_transport_lock_bridge(void) {
    CHENG_QUIC_LOCK_ENSURE();
    pthread_mutex_lock(&cheng_quic_transport_lock);
}
void cheng_native_quic_transport_unlock_bridge(void) {
    pthread_mutex_unlock(&cheng_quic_transport_lock);
}
