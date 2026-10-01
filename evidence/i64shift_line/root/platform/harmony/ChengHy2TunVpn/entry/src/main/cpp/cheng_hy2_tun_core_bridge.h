#ifndef CHENG_HY2_TUN_CORE_BRIDGE_H
#define CHENG_HY2_TUN_CORE_BRIDGE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define CHENG_HY2_TUN_CORE_ABI_VERSION 3u

typedef int32_t (*cheng_hy2_tun_protect_fd_fn)(void* user_data, int32_t fd);
typedef int32_t (*cheng_hy2_tun_tcp_connect4_fn)(
    void* user_data,
    int32_t b0,
    int32_t b1,
    int32_t b2,
    int32_t b3,
    int32_t port,
    int32_t timeout_ms);

typedef struct ChengHy2TunCoreStartRequest {
  uint32_t abi_version;
  int32_t tun_fd;
  const char* config_json;
  int32_t config_json_len;
  const char* config_path;
  int32_t config_path_len;
  const uint8_t* cert_der;
  int32_t cert_der_len;
  const uint8_t* key_pk8_der;
  int32_t key_pk8_der_len;
  const uint8_t* trust_root_der;
  int32_t trust_root_der_len;
  cheng_hy2_tun_protect_fd_fn protect_fd;
  void* protect_user_data;
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

// SABI v2 entry points. utf8_view / bytes_view cross the C ABI as
// (ptr, int64_t len) — note the length is int64_t, not int32_t. Start/status/
// snapshot no longer take out-pointers; their results are pushed to the
// platform layer via the emit callbacks declared below.
typedef int32_t (*cheng_hy2_tun_core_set_config_fn)(
                                               const char* config_json,
                                               int64_t config_json_len,
                                               const char* config_path,
                                               int64_t config_path_len);
typedef int32_t (*cheng_hy2_tun_core_set_identity_fn)(
                                               const uint8_t* cert_der,
                                               int64_t cert_der_len,
                                               const uint8_t* key_pk8_der,
                                               int64_t key_pk8_der_len,
                                               const uint8_t* trust_root_der,
                                               int64_t trust_root_der_len);
typedef int32_t (*cheng_hy2_tun_core_start_fn)(uint32_t abi_version,
                                               int32_t tun_fd);
typedef int32_t (*cheng_hy2_tun_core_stop_fn)(uint64_t session_id);
typedef int32_t (*cheng_hy2_tun_core_status_fn)(uint64_t session_id);
typedef int32_t (*cheng_hy2_tun_core_mem_diag_fn)(uint32_t abi_version);
typedef int32_t (*cheng_hy2_proxy_core_start_fn)(uint32_t abi_version);
typedef int32_t (*cheng_hy2_proxy_core_stop_fn)(uint64_t session_id);
typedef int32_t (*cheng_hy2_proxy_core_status_fn)(uint64_t session_id);
typedef int32_t (*cheng_hy2_tun_core_set_protect_callback_fn)(
    cheng_hy2_tun_protect_fd_fn protect_fd,
    void* protect_user_data);
typedef int32_t (*cheng_hy2_tun_core_set_tcp_connect4_callback_fn)(
    cheng_hy2_tun_tcp_connect4_fn connect_tcp4,
    void* connect_user_data);
typedef int32_t (*cheng_hy2_tun_mobile_gui_snapshot_json_fn)(
    const char* platform,
    int64_t platform_len,
    const char* config_path,
    int64_t config_path_len);

// SABI v2 emit callbacks. These are DEFINED by the platform layer (the NAPI
// bridge .cpp) and called back synchronously by the Cheng core from inside the
// @exportc entry points (start/status/snapshot). The Cheng core resolves them
// as @importc symbols at load time. Text arguments use the utf8_view ABI:
// (ptr, int64_t len) and are NOT NUL-terminated, so copies must use len bytes
// (never strlen).
int32_t cheng_hy2_tun_start_emit(uint64_t session_id,
                                 int32_t connected,
                                 const char* error_text,
                                 int64_t error_text_len);
int32_t cheng_hy2_proxy_start_emit(uint64_t session_id,
                                   int32_t connected,
                                   int32_t listen_port,
                                   const char* error_text,
                                   int64_t error_text_len);
int32_t cheng_hy2_tun_status_emit(int32_t abi_version,
                                  uint64_t session_id,
                                  int32_t connected,
                                  uint64_t rx_bytes,
                                  uint64_t tx_bytes,
                                  const char* status_text,
                                  int64_t status_text_len,
                                  const char* error_text,
                                  int64_t error_text_len);
int32_t cheng_hy2_tun_snapshot_emit(const char* json, int64_t json_len);

#ifdef __cplusplus
}
#endif

#endif
