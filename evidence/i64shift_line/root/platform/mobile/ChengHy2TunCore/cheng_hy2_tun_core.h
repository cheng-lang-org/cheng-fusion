#ifndef CHENG_HY2_TUN_CORE_H
#define CHENG_HY2_TUN_CORE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#if defined(_WIN32)
#define CHENG_HY2_TUN_EXPORT __declspec(dllexport)
#else
#define CHENG_HY2_TUN_EXPORT __attribute__((visibility("default")))
#endif

#define CHENG_HY2_TUN_CORE_ABI_VERSION 3u

typedef int32_t (*cheng_hy2_tun_protect_fd_fn)(void *user_data, int32_t fd);
typedef int32_t (*cheng_hy2_tun_network_bind_fd_fn)(void *user_data, int32_t fd);
typedef int32_t (*cheng_hy2_tun_tcp_connect4_fn)(
    void *user_data,
    int32_t b0,
    int32_t b1,
    int32_t b2,
    int32_t b3,
    int32_t port,
    int32_t timeout_ms);

typedef struct ChengHy2TunCoreStartRequest {
    uint32_t abi_version;
    int32_t tun_fd;
    const char *config_json;
    int32_t config_json_len;
    const char *config_path;
    int32_t config_path_len;
    const uint8_t *cert_der;
    int32_t cert_der_len;
    const uint8_t *key_pk8_der;
    int32_t key_pk8_der_len;
    const uint8_t *trust_root_der;
    int32_t trust_root_der_len;
    cheng_hy2_tun_protect_fd_fn protect_fd;
    void *protect_user_data;
} ChengHy2TunCoreStartRequest;

typedef struct ChengHy2TunCoreStartResult {
    uint32_t abi_version;
    uint64_t session_id;
    int32_t connected;
    char error[512];
} ChengHy2TunCoreStartResult;

typedef struct ChengHy2TunCoreStatus {
    uint32_t abi_version;
    uint64_t session_id;
    int32_t connected;
    uint64_t rx_bytes;
    uint64_t tx_bytes;
    char text[128];
    char error[512];
} ChengHy2TunCoreStatus;

/* VPN session ORC contract sample (additive; does not change status emit ABI). */
typedef struct ChengHy2TunCoreMemDiag {
    uint32_t abi_version;
    int64_t alloc_count;
    int64_t free_count;
    int64_t live_count;
} ChengHy2TunCoreMemDiag;

typedef struct ChengHy2ProxyCoreStartResult {
    uint32_t abi_version;
    uint64_t session_id;
    int32_t connected;
    int32_t listen_port;
    char error[512];
} ChengHy2ProxyCoreStartResult;

typedef int32_t (*cheng_hy2_tun_core_set_config_fn)(
    const char *config_json,
    int64_t config_json_len,
    const char *config_path,
    int64_t config_path_len);
typedef int32_t (*cheng_hy2_tun_core_set_identity_fn)(
    const uint8_t *cert_der,
    int64_t cert_der_len,
    const uint8_t *key_pk8_der,
    int64_t key_pk8_der_len,
    const uint8_t *trust_root_der,
    int64_t trust_root_der_len);
typedef int32_t (*cheng_hy2_tun_core_start_fn)(
    uint32_t abi_version,
    int32_t tun_fd);
typedef int32_t (*cheng_hy2_tun_core_stop_fn)(uint64_t session_id);
typedef int32_t (*cheng_hy2_tun_core_status_fn)(uint64_t session_id);
typedef int32_t (*cheng_hy2_tun_core_mem_diag_fn)(uint32_t abi_version);
typedef int32_t (*cheng_hy2_proxy_core_start_fn)(uint32_t abi_version);
typedef int32_t (*cheng_hy2_proxy_core_stop_fn)(uint64_t session_id);
typedef int32_t (*cheng_hy2_proxy_core_status_fn)(uint64_t session_id);
typedef int32_t (*cheng_hy2_proxy_core_probe_status_fn)(
    uint32_t abi_version,
    int32_t timeout_ms);
typedef int32_t (*cheng_hy2_tun_mobile_gui_snapshot_json_fn)(
    const char *platform,
    int64_t platform_len,
    const char *config_path,
    int64_t config_path_len);
typedef int32_t (*cheng_hy2_tun_core_set_protect_callback_fn)(
    cheng_hy2_tun_protect_fd_fn protect_fd,
    void *protect_user_data);
typedef int32_t (*cheng_hy2_tun_core_set_network_bind_callback_fn)(
    cheng_hy2_tun_network_bind_fd_fn bind_fd,
    void *bind_user_data);
typedef int32_t (*cheng_hy2_tun_core_set_tcp_connect4_callback_fn)(
    cheng_hy2_tun_tcp_connect4_fn connect_tcp4,
    void *connect_user_data);
typedef int32_t (*cheng_hy2_tun_start_emit_fn)(
    uint64_t session_id,
    int32_t connected,
    const char *error_text,
    int64_t error_text_len);
typedef int32_t (*cheng_hy2_proxy_start_emit_fn)(
    uint64_t session_id,
    int32_t connected,
    int32_t listen_port,
    const char *error_text,
    int64_t error_text_len);
typedef int32_t (*cheng_hy2_tun_status_emit_fn)(
    int32_t abi_version,
    uint64_t session_id,
    int32_t connected,
    uint64_t rx_bytes,
    uint64_t tx_bytes,
    const char *status_text,
    int64_t status_text_len,
    const char *error_text,
    int64_t error_text_len);
typedef int32_t (*cheng_hy2_tun_snapshot_emit_fn)(
    const char *json,
    int64_t json_len);
typedef int32_t (*cheng_mobile_emit_callbacks_set_fn)(
    cheng_hy2_tun_start_emit_fn tun_start_emit,
    cheng_hy2_proxy_start_emit_fn proxy_start_emit,
    cheng_hy2_tun_status_emit_fn status_emit,
    cheng_hy2_tun_snapshot_emit_fn snapshot_emit);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_core_set_protect_callback(
    cheng_hy2_tun_protect_fd_fn protect_fd,
    void *protect_user_data);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_core_set_network_bind_callback(
    cheng_hy2_tun_network_bind_fd_fn bind_fd,
    void *bind_user_data);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_core_set_tcp_connect4_callback(
    cheng_hy2_tun_tcp_connect4_fn connect_tcp4,
    void *connect_user_data);

CHENG_HY2_TUN_EXPORT int32_t cheng_mobile_emit_callbacks_set(
    cheng_hy2_tun_start_emit_fn tun_start_emit,
    cheng_hy2_proxy_start_emit_fn proxy_start_emit,
    cheng_hy2_tun_status_emit_fn status_emit,
    cheng_hy2_tun_snapshot_emit_fn snapshot_emit);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_core_set_config(
    const char *config_json,
    int64_t config_json_len,
    const char *config_path,
    int64_t config_path_len);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_core_set_identity(
    const uint8_t *cert_der,
    int64_t cert_der_len,
    const uint8_t *key_pk8_der,
    int64_t key_pk8_der_len,
    const uint8_t *trust_root_der,
    int64_t trust_root_der_len);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_core_start(
    uint32_t abi_version,
    int32_t tun_fd);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_core_stop(uint64_t session_id);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_core_status(uint64_t session_id);

/*
 * Samples Cheng ORC allocator counters into the platform mem_diag emit slot.
 * Call from the same thread that will read cheng_hy2_tun_mem_diag_emit results
 * (or the platform-local accumulator filled by that emit).
 */
CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_core_mem_diag(uint32_t abi_version);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_proxy_core_start(uint32_t abi_version);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_proxy_core_stop(uint64_t session_id);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_proxy_core_status(uint64_t session_id);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_proxy_core_probe_status(
    uint32_t abi_version,
    int32_t timeout_ms);

/*
 * SABI v2 emit callbacks. These are DEFINED by the platform layer (this JNI
 * bridge) and called back synchronously by the Cheng core from within the
 * @exportc entry points (start/status/probe/snapshot). Text arguments use the
 * utf8_view ABI: (ptr, int64_t len) and are NOT NUL-terminated, so copies must
 * use len bytes (never strlen). The Cheng core resolves these as @importc
 * symbols at load time.
 */
CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_start_emit(
    uint64_t session_id,
    int32_t connected,
    const char *error_text,
    int64_t error_text_len);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_proxy_start_emit(
    uint64_t session_id,
    int32_t connected,
    int32_t listen_port,
    const char *error_text,
    int64_t error_text_len);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_status_emit(
    int32_t abi_version,
    uint64_t session_id,
    int32_t connected,
    uint64_t rx_bytes,
    uint64_t tx_bytes,
    const char *status_text,
    int64_t status_text_len,
    const char *error_text,
    int64_t error_text_len);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_mem_diag_emit(
    uint32_t abi_version,
    int64_t alloc_count,
    int64_t free_count,
    int64_t live_count);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_last_mem_diag(
    ChengHy2TunCoreMemDiag *out);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_snapshot_emit(
    const char *json,
    int64_t json_len);

CHENG_HY2_TUN_EXPORT uint64_t cheng_mobile_tun_wait_calls(void);
CHENG_HY2_TUN_EXPORT uint64_t cheng_mobile_tun_wait_ready(void);
CHENG_HY2_TUN_EXPORT uint64_t cheng_mobile_tun_read_calls(void);
CHENG_HY2_TUN_EXPORT uint64_t cheng_mobile_tun_write_calls(void);
CHENG_HY2_TUN_EXPORT int32_t cheng_mobile_tun_last_wait_result(void);
CHENG_HY2_TUN_EXPORT int32_t cheng_mobile_tun_last_read_result(void);
CHENG_HY2_TUN_EXPORT int32_t cheng_mobile_tun_last_write_result(void);
CHENG_HY2_TUN_EXPORT uint32_t cheng_mobile_tun_dns_answer_ip_for_host(
    const void *host_data,
    int32_t host_len);

CHENG_HY2_TUN_EXPORT uint64_t cheng_mobile_tun_tcp_trace_rx_payload_bytes_for_port(
    int32_t local_port);
CHENG_HY2_TUN_EXPORT uint64_t cheng_mobile_tun_tcp_trace_tx_payload_bytes_for_port(
    int32_t local_port);
CHENG_HY2_TUN_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_rx_payload_len_for_port(
    int32_t local_port);
CHENG_HY2_TUN_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_tx_payload_len_for_port(
    int32_t local_port);
CHENG_HY2_TUN_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_rx_seq_for_port(
    int32_t local_port);
CHENG_HY2_TUN_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_rx_ack_for_port(
    int32_t local_port);
CHENG_HY2_TUN_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_tx_seq_for_port(
    int32_t local_port);
CHENG_HY2_TUN_EXPORT uint32_t cheng_mobile_tun_tcp_trace_last_tx_ack_for_port(
    int32_t local_port);

CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_mobile_gui_snapshot_json(
    const char *platform,
    int64_t platform_len,
    const char *config_path,
    int64_t config_path_len);

#ifdef __cplusplus
}
#endif

#endif
