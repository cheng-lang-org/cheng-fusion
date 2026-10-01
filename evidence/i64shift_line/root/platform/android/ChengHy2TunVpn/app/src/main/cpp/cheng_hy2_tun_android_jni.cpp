#include "cheng_hy2_tun_core.h"

#include <arpa/inet.h>
#include <android/multinetwork.h>
#include <android/log.h>
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <jni.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>

namespace {

constexpr const char* kTag = "ChengHy2TunAndroid";
constexpr const char* kCoreLibrary = "libcheng_hy2_tun_core.so";
constexpr uint32_t kTcpTraceRxSyn = 0x00000001u;
constexpr uint32_t kTcpTraceRxAck = 0x00000002u;
constexpr uint32_t kTcpTraceRxPayload = 0x00000004u;
constexpr uint32_t kTcpTraceRxFin = 0x00000008u;
constexpr uint32_t kTcpTraceRxRst = 0x00000010u;
constexpr uint32_t kTcpTraceTxSynAck = 0x00000100u;
constexpr uint32_t kTcpTraceTxAck = 0x00000200u;
constexpr uint32_t kTcpTraceTxPayload = 0x00000400u;
constexpr uint32_t kTcpTraceTxFin = 0x00000800u;
constexpr uint32_t kTcpTraceTxRst = 0x00001000u;
constexpr uint32_t kTcpTraceMuxOpen = 0x00010000u;
constexpr uint32_t kTcpTraceMuxData = 0x00020000u;
constexpr uint32_t kTcpTraceMuxFlush = 0x00040000u;
constexpr uint32_t kTcpTraceMuxOpenOk = 0x00080000u;
constexpr uint32_t kTcpTraceMuxOpenError = 0x00100000u;
constexpr uint32_t kTcpTraceMuxRxData = 0x00200000u;
constexpr uint32_t kTcpTraceDecisionPayload = 0x00400000u;
constexpr uint32_t kTcpTracePayloadNonempty = 0x00800000u;
constexpr uint32_t kTcpTraceOpenAttempt = 0x01000000u;
constexpr uint32_t kTcpTraceTunnelReadable = 0x02000000u;
constexpr uint32_t kTcpTraceFrameRead = 0x04000000u;
constexpr uint32_t kTcpTraceFrameError = 0x08000000u;
constexpr uint32_t kTcpTraceUnknownStream = 0x10000000u;

struct CoreSymbols {
  void* handle = nullptr;
  cheng_hy2_tun_core_set_config_fn set_config = nullptr;
  cheng_hy2_tun_core_set_identity_fn set_identity = nullptr;
  cheng_hy2_tun_core_start_fn start = nullptr;
  cheng_hy2_tun_core_stop_fn stop = nullptr;
  cheng_hy2_tun_core_status_fn status = nullptr;
  cheng_hy2_tun_core_mem_diag_fn mem_diag = nullptr;
  int32_t (*last_mem_diag)(ChengHy2TunCoreMemDiag *out) = nullptr;
  cheng_hy2_proxy_core_start_fn proxy_start = nullptr;
  cheng_hy2_proxy_core_stop_fn proxy_stop = nullptr;
  cheng_hy2_proxy_core_status_fn proxy_status = nullptr;
  cheng_hy2_proxy_core_probe_status_fn proxy_probe_status = nullptr;
  cheng_hy2_tun_mobile_gui_snapshot_json_fn gui_snapshot_json = nullptr;
  cheng_hy2_tun_core_set_protect_callback_fn set_protect_callback = nullptr;
  cheng_hy2_tun_core_set_network_bind_callback_fn set_network_bind_callback = nullptr;
  cheng_hy2_tun_core_set_tcp_connect4_callback_fn set_tcp_connect4_callback = nullptr;
  cheng_mobile_emit_callbacks_set_fn set_emit_callbacks = nullptr;
  uint64_t (*tun_rx_bytes)() = nullptr;
  uint64_t (*tun_tx_bytes)() = nullptr;
  uint64_t (*tun_rx_packets)() = nullptr;
  uint64_t (*tun_tx_packets)() = nullptr;
  uint64_t (*tun_wait_calls)() = nullptr;
  uint64_t (*tun_wait_ready)() = nullptr;
  uint64_t (*tun_read_calls)() = nullptr;
  uint64_t (*tun_write_calls)() = nullptr;
  int32_t (*tun_last_wait_result)() = nullptr;
  int32_t (*tun_last_read_result)() = nullptr;
  int32_t (*tun_last_write_result)() = nullptr;
  int32_t (*tun_last_rx_proto)() = nullptr;
  int32_t (*tun_last_rx_sport)() = nullptr;
  int32_t (*tun_last_rx_dport)() = nullptr;
  uint32_t (*tun_last_rx_dst)() = nullptr;
  int32_t (*tun_last_tx_proto)() = nullptr;
  int32_t (*tun_last_tx_sport)() = nullptr;
  int32_t (*tun_last_tx_dport)() = nullptr;
  uint32_t (*tun_last_tx_dst)() = nullptr;
  int32_t (*tun_last_rx_dns_qtype)() = nullptr;
  int32_t (*tun_last_rx_dns_id)() = nullptr;
  int32_t (*tun_dns_ring_dump)(char *, int32_t) = nullptr;
  int32_t (*tun_last_rx_dns_answers)() = nullptr;
  int32_t (*tun_last_rx_dns_rcode)() = nullptr;
  int32_t (*tun_last_rx_dns_checksum_ok)() = nullptr;
  uint32_t (*tun_last_rx_dns_answer_ip)() = nullptr;
  int32_t (*tun_last_tx_dns_qtype)() = nullptr;
  int32_t (*tun_last_tx_dns_id)() = nullptr;
  int32_t (*tun_last_tx_dns_answers)() = nullptr;
  int32_t (*tun_last_tx_dns_rcode)() = nullptr;
  int32_t (*tun_last_tx_dns_checksum_ok)() = nullptr;
  uint32_t (*tun_last_tx_dns_answer_ip)() = nullptr;
  uint32_t (*tun_dns_answer_ip_for_id)(int32_t query_id) = nullptr;
  uint32_t (*tun_dns_answer_ip_for_host)(const char* host_data, int32_t host_len) = nullptr;
  void (*tun_tcp_trace_clear_port)(int32_t local_port) = nullptr;
  void (*tun_tcp_trace_clear_all)() = nullptr;
  uint32_t (*tun_tcp_trace_flags_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_rx_packets_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_tx_packets_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_remote_ip_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_remote_port_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_last_rx_flags_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_last_tx_flags_for_port)(int32_t local_port) = nullptr;
  uint64_t (*tun_tcp_trace_rx_payload_bytes_for_port)(int32_t local_port) = nullptr;
  uint64_t (*tun_tcp_trace_tx_payload_bytes_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_last_rx_payload_len_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_last_tx_payload_len_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_last_rx_seq_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_last_rx_ack_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_last_tx_seq_for_port)(int32_t local_port) = nullptr;
  uint32_t (*tun_tcp_trace_last_tx_ack_for_port)(int32_t local_port) = nullptr;
  std::string error;
};

struct ProtectState {
  JavaVM* vm = nullptr;
  jobject callback = nullptr;
  jmethodID protect_method = nullptr;
  uint64_t network_handle = 0;
};

std::mutex g_mutex;
std::timed_mutex g_core_call_mutex;
// Serializes the nativeStart "register callbacks -> set_config -> set_identity
// -> core.start" sequence against ClearCoreCallbacksInCoreCall() (nativeStop /
// nativeStopProxy / start-failure cleanup). core.stop is fire-and-forget (it
// only sets a stop flag and returns), so without this lock a cleanup thread
// could null the protect callback AFTER a concurrent nativeStart registered
// it, leaving the tun worker dialing with fd_fn=0x0 (traffic self-loop, zero
// dials) until the next start. Deliberately NOT g_core_call_mutex: nativeStart
// must stay lock-free against a gui_snapshot thread stuck inside core.
std::mutex g_callback_mutex;
std::mutex g_status_cache_mutex;
std::string g_last_status_json = "{\"state\":\"stopped\",\"error\":\"\"}";
std::string g_last_proxy_status_json = "{\"state\":\"stopped\",\"error\":\"\"}";
CoreSymbols g_core;
ProtectState g_protect;
std::atomic<uint64_t> g_protect_call_count{0};
std::atomic<uint64_t> g_protect_success_count{0};
std::atomic<uint64_t> g_protect_failure_count{0};
std::atomic<uint64_t> g_bound_network_handle{0};

constexpr int kStatusLockTimeoutMs = 200;

bool TryLockCoreCall(int timeout_ms) {
  return g_core_call_mutex.try_lock_for(std::chrono::milliseconds(timeout_ms));
}

void CacheStatusJson(std::string* slot, const std::string& json) {
  std::lock_guard<std::mutex> lock(g_status_cache_mutex);
  *slot = json;
}

std::string CachedStatusJson(const std::string& slot) {
  std::lock_guard<std::mutex> lock(g_status_cache_mutex);
  return slot;
}

// Mark lock-busy replies so Kotlin never treats them as authoritative terminal
// state (default cache is "stopped"; tearing down a live session on that is wrong).
std::string CachedStatusJsonMarked(const std::string& slot) {
  std::string json = CachedStatusJson(slot);
  if (json.empty()) {
    return "{\"state\":\"stopped\",\"error\":\"\",\"status_source\":\"cache\"}";
  }
  if (json.find("\"status_source\"") != std::string::npos) {
    return json;
  }
  if (!json.empty() && json.back() == '}') {
    json.pop_back();
    json += ",\"status_source\":\"cache\"}";
    return json;
  }
  return json;
}

// SABI v2 emit accumulators. The Cheng core invokes the emit callbacks
// synchronously from inside the @exportc entry it is processing, on the same
// thread that called the JNI wrapper, so thread_local storage is correct and
// needs no extra locking. Each JNI wrapper resets its accumulator before the
// core call and reads it back after the call returns. The fixed-size structs
// from cheng_hy2_tun_core.h are reused as accumulators so the existing
// JSON-building code can read them unchanged.
thread_local ChengHy2TunCoreStartResult g_tun_start_acc{};
thread_local ChengHy2ProxyCoreStartResult g_proxy_start_acc{};
thread_local ChengHy2TunCoreStatus g_status_acc{};
thread_local std::string g_snapshot_acc;

// Copy a utf8_view (ptr + int64 len, NOT NUL-terminated) into a fixed C buffer,
// truncating to cap-1 bytes and NUL-terminating so FixedCString/JsonEscape can
// read it back. Never use strlen on the source: it is not NUL-terminated.
void CopyViewToFixed(char* dst, size_t cap, const char* src, int64_t len) {
  if (dst == nullptr || cap == 0) {
    return;
  }
  size_t n = 0;
  if (src != nullptr && len > 0) {
    n = static_cast<size_t>(len);
    if (n > cap - 1) {
      n = cap - 1;
    }
    std::memcpy(dst, src, n);
  }
  dst[n] = '\0';
}

bool LoadCoreLocked() {
  if (g_core.handle != nullptr) {
    return true;
  }
  g_core.error.clear();
  void* handle = dlopen(kCoreLibrary, RTLD_NOW | RTLD_LOCAL);
  if (handle == nullptr) {
    const char* err = dlerror();
    g_core.error = err != nullptr ? err : "dlopen libcheng_hy2_tun_core.so failed";
    return false;
  }
  auto start = reinterpret_cast<cheng_hy2_tun_core_start_fn>(
      dlsym(handle, "cheng_hy2_tun_core_start"));
  auto set_config = reinterpret_cast<cheng_hy2_tun_core_set_config_fn>(
      dlsym(handle, "cheng_hy2_tun_core_set_config"));
  auto set_identity = reinterpret_cast<cheng_hy2_tun_core_set_identity_fn>(
      dlsym(handle, "cheng_hy2_tun_core_set_identity"));
  auto stop = reinterpret_cast<cheng_hy2_tun_core_stop_fn>(
      dlsym(handle, "cheng_hy2_tun_core_stop"));
  auto status = reinterpret_cast<cheng_hy2_tun_core_status_fn>(
      dlsym(handle, "cheng_hy2_tun_core_status"));
  auto mem_diag = reinterpret_cast<cheng_hy2_tun_core_mem_diag_fn>(
      dlsym(handle, "cheng_hy2_tun_core_mem_diag"));
  auto last_mem_diag = reinterpret_cast<int32_t (*)(ChengHy2TunCoreMemDiag*)>(
      dlsym(handle, "cheng_hy2_tun_last_mem_diag"));
  auto proxy_start = reinterpret_cast<cheng_hy2_proxy_core_start_fn>(
      dlsym(handle, "cheng_hy2_proxy_core_start"));
  auto proxy_stop = reinterpret_cast<cheng_hy2_proxy_core_stop_fn>(
      dlsym(handle, "cheng_hy2_proxy_core_stop"));
  auto proxy_status = reinterpret_cast<cheng_hy2_proxy_core_status_fn>(
      dlsym(handle, "cheng_hy2_proxy_core_status"));
  auto proxy_probe_status = reinterpret_cast<cheng_hy2_proxy_core_probe_status_fn>(
      dlsym(handle, "cheng_hy2_proxy_core_probe_status"));
  auto gui_snapshot_json = reinterpret_cast<cheng_hy2_tun_mobile_gui_snapshot_json_fn>(
      dlsym(handle, "cheng_hy2_tun_mobile_gui_snapshot_json"));
  auto set_protect_callback = reinterpret_cast<cheng_hy2_tun_core_set_protect_callback_fn>(
      dlsym(handle, "cheng_hy2_tun_core_set_protect_callback"));
  auto set_network_bind_callback = reinterpret_cast<cheng_hy2_tun_core_set_network_bind_callback_fn>(
      dlsym(handle, "cheng_hy2_tun_core_set_network_bind_callback"));
  auto set_tcp_connect4_callback = reinterpret_cast<cheng_hy2_tun_core_set_tcp_connect4_callback_fn>(
      dlsym(handle, "cheng_hy2_tun_core_set_tcp_connect4_callback"));
  auto set_emit_callbacks = reinterpret_cast<cheng_mobile_emit_callbacks_set_fn>(
      dlsym(handle, "cheng_mobile_emit_callbacks_set"));
  if (start == nullptr || set_config == nullptr || set_identity == nullptr ||
      stop == nullptr || status == nullptr || mem_diag == nullptr ||
      last_mem_diag == nullptr || proxy_start == nullptr ||
      proxy_stop == nullptr || proxy_status == nullptr || set_protect_callback == nullptr ||
      set_network_bind_callback == nullptr || set_tcp_connect4_callback == nullptr ||
      set_emit_callbacks == nullptr || gui_snapshot_json == nullptr) {
    const char* err = dlerror();
    g_core.error = err != nullptr ? err : "missing Cheng hy2-tun core symbols";
    dlclose(handle);
    return false;
  }
  const int32_t emit_rc = set_emit_callbacks(
      cheng_hy2_tun_start_emit,
      cheng_hy2_proxy_start_emit,
      cheng_hy2_tun_status_emit,
      cheng_hy2_tun_snapshot_emit);
  if (emit_rc != 0) {
    g_core.error = "cheng hy2-tun core emit callback registration failed";
    dlclose(handle);
    return false;
  }
  g_core.handle = handle;
  g_core.set_config = set_config;
  g_core.set_identity = set_identity;
  g_core.start = start;
  g_core.stop = stop;
  g_core.status = status;
  g_core.mem_diag = mem_diag;
  g_core.last_mem_diag = last_mem_diag;
  g_core.proxy_start = proxy_start;
  g_core.proxy_stop = proxy_stop;
  g_core.proxy_status = proxy_status;
  g_core.proxy_probe_status = proxy_probe_status;
  g_core.gui_snapshot_json = gui_snapshot_json;
  g_core.set_protect_callback = set_protect_callback;
  g_core.set_network_bind_callback = set_network_bind_callback;
  g_core.set_tcp_connect4_callback = set_tcp_connect4_callback;
  g_core.set_emit_callbacks = set_emit_callbacks;
  g_core.tun_rx_bytes = reinterpret_cast<uint64_t (*)()>(dlsym(handle, "cheng_mobile_tun_rx_bytes"));
  g_core.tun_tx_bytes = reinterpret_cast<uint64_t (*)()>(dlsym(handle, "cheng_mobile_tun_tx_bytes"));
  g_core.tun_rx_packets = reinterpret_cast<uint64_t (*)()>(dlsym(handle, "cheng_mobile_tun_rx_packets"));
  g_core.tun_tx_packets = reinterpret_cast<uint64_t (*)()>(dlsym(handle, "cheng_mobile_tun_tx_packets"));
  g_core.tun_wait_calls = reinterpret_cast<uint64_t (*)()>(dlsym(handle, "cheng_mobile_tun_wait_calls"));
  g_core.tun_wait_ready = reinterpret_cast<uint64_t (*)()>(dlsym(handle, "cheng_mobile_tun_wait_ready"));
  g_core.tun_read_calls = reinterpret_cast<uint64_t (*)()>(dlsym(handle, "cheng_mobile_tun_read_calls"));
  g_core.tun_write_calls = reinterpret_cast<uint64_t (*)()>(dlsym(handle, "cheng_mobile_tun_write_calls"));
  g_core.tun_last_wait_result = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_wait_result"));
  g_core.tun_last_read_result = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_read_result"));
  g_core.tun_last_write_result = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_write_result"));
  g_core.tun_last_rx_proto = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_rx_proto"));
  g_core.tun_last_rx_sport = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_rx_sport"));
  g_core.tun_last_rx_dport = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_rx_dport"));
  g_core.tun_last_rx_dst = reinterpret_cast<uint32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_rx_dst"));
  g_core.tun_last_tx_proto = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_tx_proto"));
  g_core.tun_last_tx_sport = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_tx_sport"));
  g_core.tun_last_tx_dport = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_tx_dport"));
  g_core.tun_last_tx_dst = reinterpret_cast<uint32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_tx_dst"));
  g_core.tun_last_rx_dns_qtype = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_rx_dns_qtype"));
  g_core.tun_last_rx_dns_id = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_rx_dns_id"));
  g_core.tun_dns_ring_dump = reinterpret_cast<int32_t (*)(char *, int32_t)>(dlsym(handle, "cheng_mobile_tun_dns_ring_dump"));
  g_core.tun_last_rx_dns_answers = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_rx_dns_answers"));
  g_core.tun_last_rx_dns_rcode = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_rx_dns_rcode"));
  g_core.tun_last_rx_dns_checksum_ok = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_rx_dns_checksum_ok"));
  g_core.tun_last_rx_dns_answer_ip = reinterpret_cast<uint32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_rx_dns_answer_ip"));
  g_core.tun_last_tx_dns_qtype = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_tx_dns_qtype"));
  g_core.tun_last_tx_dns_id = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_tx_dns_id"));
  g_core.tun_last_tx_dns_answers = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_tx_dns_answers"));
  g_core.tun_last_tx_dns_rcode = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_tx_dns_rcode"));
  g_core.tun_last_tx_dns_checksum_ok = reinterpret_cast<int32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_tx_dns_checksum_ok"));
  g_core.tun_last_tx_dns_answer_ip = reinterpret_cast<uint32_t (*)()>(dlsym(handle, "cheng_mobile_tun_last_tx_dns_answer_ip"));
  g_core.tun_dns_answer_ip_for_id = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_dns_answer_ip_for_id"));
  g_core.tun_dns_answer_ip_for_host = reinterpret_cast<uint32_t (*)(const char*, int32_t)>(dlsym(handle, "cheng_mobile_tun_dns_answer_ip_for_host"));
  g_core.tun_tcp_trace_clear_port = reinterpret_cast<void (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_clear_port"));
  g_core.tun_tcp_trace_clear_all = reinterpret_cast<void (*)()>(dlsym(handle, "cheng_mobile_tun_tcp_trace_clear_all"));
  g_core.tun_tcp_trace_flags_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_flags_for_port"));
  g_core.tun_tcp_trace_rx_packets_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_rx_packets_for_port"));
  g_core.tun_tcp_trace_tx_packets_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_tx_packets_for_port"));
  g_core.tun_tcp_trace_remote_ip_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_remote_ip_for_port"));
  g_core.tun_tcp_trace_remote_port_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_remote_port_for_port"));
  g_core.tun_tcp_trace_last_rx_flags_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_last_rx_flags_for_port"));
  g_core.tun_tcp_trace_last_tx_flags_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_last_tx_flags_for_port"));
  g_core.tun_tcp_trace_rx_payload_bytes_for_port = reinterpret_cast<uint64_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_rx_payload_bytes_for_port"));
  g_core.tun_tcp_trace_tx_payload_bytes_for_port = reinterpret_cast<uint64_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_tx_payload_bytes_for_port"));
  g_core.tun_tcp_trace_last_rx_payload_len_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_last_rx_payload_len_for_port"));
  g_core.tun_tcp_trace_last_tx_payload_len_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_last_tx_payload_len_for_port"));
  g_core.tun_tcp_trace_last_rx_seq_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_last_rx_seq_for_port"));
  g_core.tun_tcp_trace_last_rx_ack_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_last_rx_ack_for_port"));
  g_core.tun_tcp_trace_last_tx_seq_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_last_tx_seq_for_port"));
  g_core.tun_tcp_trace_last_tx_ack_for_port = reinterpret_cast<uint32_t (*)(int32_t)>(dlsym(handle, "cheng_mobile_tun_tcp_trace_last_tx_ack_for_port"));
  return true;
}

bool LoadCore(std::string* error) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (LoadCoreLocked()) {
    return true;
  }
  if (error != nullptr) {
    *error = g_core.error;
  }
  return false;
}

JNIEnv* AttachCurrentThread(JavaVM* vm, bool* attached) {
  *attached = false;
  JNIEnv* env = nullptr;
  if (vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) == JNI_OK) {
    return env;
  }
  if (vm->AttachCurrentThread(&env, nullptr) != JNI_OK) {
    return nullptr;
  }
  *attached = true;
  return env;
}

int32_t ProtectFd(void*, int32_t fd) {
  g_protect_call_count.fetch_add(1, std::memory_order_relaxed);
  __android_log_print(ANDROID_LOG_INFO, kTag, "ProtectFd enter fd=%d", fd);
  JavaVM* vm = nullptr;
  jobject callback = nullptr;
  jmethodID method = nullptr;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    vm = g_protect.vm;
    callback = g_protect.callback;
    method = g_protect.protect_method;
  }
  if (vm == nullptr || callback == nullptr || method == nullptr) {
    g_protect_failure_count.fetch_add(1, std::memory_order_relaxed);
    return 0;
  }

  bool attached = false;
  JNIEnv* env = AttachCurrentThread(vm, &attached);
  if (env == nullptr) {
    g_protect_failure_count.fetch_add(1, std::memory_order_relaxed);
    return 0;
  }
  jboolean ok = env->CallBooleanMethod(callback, method, static_cast<jint>(fd));
  if (env->ExceptionCheck()) {
    env->ExceptionClear();
    ok = JNI_FALSE;
  }
  if (attached) {
    vm->DetachCurrentThread();
  }
  if (ok != JNI_TRUE) {
    g_protect_failure_count.fetch_add(1, std::memory_order_relaxed);
    __android_log_print(ANDROID_LOG_INFO, kTag, "ProtectFd result fd=%d ok=0", fd);
    return 0;
  }
  g_protect_success_count.fetch_add(1, std::memory_order_relaxed);
  __android_log_print(ANDROID_LOG_INFO,
                      kTag,
                      "ProtectFd result fd=%d ok=1",
                      fd);
  return 1;
}

int32_t NoopProtectFd(void*, int32_t fd) {
  (void)fd;
  return 1;
}

int32_t AndroidNetworkBindFd(void*, int32_t fd) {
  if (fd < 0) {
    return 0;
  }
  const uint64_t network_handle = g_bound_network_handle.load(std::memory_order_acquire);
  if (network_handle == 0) {
    __android_log_print(ANDROID_LOG_INFO,
                        kTag,
                        "AndroidNetworkBindFd missing network fd=%d",
                        fd);
    return 0;
  }
  const int rc = android_setsocknetwork(static_cast<net_handle_t>(network_handle), fd);
  if (rc != 0) {
    const int saved_errno = errno == 0 ? ENETUNREACH : errno;
    __android_log_print(ANDROID_LOG_INFO,
                        kTag,
                        "AndroidNetworkBindFd failed fd=%d network=%llu rc=%d errno=%d",
                        fd,
                        static_cast<unsigned long long>(network_handle),
                        rc,
                        saved_errno);
    errno = saved_errno;
    return 0;
  }
  __android_log_print(ANDROID_LOG_INFO,
                      kTag,
                      "AndroidNetworkBindFd fd=%d network=%llu",
                      fd,
                      static_cast<unsigned long long>(network_handle));
  return 1;
}

int32_t NoopNetworkBindFd(void*, int32_t fd) {
  return fd >= 0 ? 1 : 0;
}

int64_t MonotimeMs() {
  timespec ts;
  if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
    return 0;
  }
  return static_cast<int64_t>(ts.tv_sec) * 1000 +
         static_cast<int64_t>(ts.tv_nsec / 1000000);
}

int32_t AndroidTcpConnect4OnNetwork(uint64_t network_handle,
                                    int32_t b0,
                                    int32_t b1,
                                    int32_t b2,
                                    int32_t b3,
                                    int32_t port,
                                    int32_t timeout_ms,
                                    bool protect_fd,
                                    bool bind_network,
                                    const char* label) {
  if (b0 < 0 || b0 > 255 || b1 < 0 || b1 > 255 ||
      b2 < 0 || b2 > 255 || b3 < 0 || b3 > 255 ||
      port <= 0 || port > 65535) {
    return -EINVAL;
  }
  if (bind_network && network_handle == 0) {
    return -ENODEV;
  }

  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) {
    return -errno;
  }

  if (protect_fd && ProtectFd(nullptr, fd) == 0) {
    const int saved_errno = errno == 0 ? EACCES : errno;
    close(fd);
    return -saved_errno;
  }

  if (bind_network) {
    int bind_rc = android_setsocknetwork(static_cast<net_handle_t>(network_handle), fd);
    if (bind_rc != 0) {
      const int saved_errno = errno == 0 ? ENETUNREACH : errno;
      __android_log_print(ANDROID_LOG_INFO,
                          kTag,
                          "%s setsocknetwork failed fd=%d network=%llu rc=%d errno=%d",
                          label,
                          fd,
                          static_cast<unsigned long long>(network_handle),
                          bind_rc,
                          saved_errno);
      close(fd);
      return -saved_errno;
    }
  }

  const int original_flags = fcntl(fd, F_GETFL, 0);
  if (original_flags < 0) {
    const int saved_errno = errno;
    close(fd);
    return -saved_errno;
  }
  if (fcntl(fd, F_SETFL, original_flags | O_NONBLOCK) != 0) {
    const int saved_errno = errno;
    close(fd);
    return -saved_errno;
  }

  sockaddr_in addr;
  std::memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<uint16_t>(port));
  uint8_t* dst = reinterpret_cast<uint8_t*>(&addr.sin_addr.s_addr);
  dst[0] = static_cast<uint8_t>(b0);
  dst[1] = static_cast<uint8_t>(b1);
  dst[2] = static_cast<uint8_t>(b2);
  dst[3] = static_cast<uint8_t>(b3);

  char host_text[INET_ADDRSTRLEN];
  std::snprintf(host_text, sizeof(host_text), "%d.%d.%d.%d", b0, b1, b2, b3);
  __android_log_print(ANDROID_LOG_INFO,
                      kTag,
                      "%s fd=%d host=%s port=%d network=%llu protect=%d bind=%d",
                      label,
                      fd,
                      host_text,
                      port,
                      static_cast<unsigned long long>(network_handle),
                      protect_fd ? 1 : 0,
                      bind_network ? 1 : 0);

  int rc;
  do {
    rc = connect(fd,
                 reinterpret_cast<const sockaddr*>(&addr),
                 static_cast<socklen_t>(sizeof(addr)));
  } while (rc != 0 && errno == EINTR);
  if (rc == 0) {
    if (fcntl(fd, F_SETFL, original_flags) != 0) {
      const int saved_errno = errno;
      close(fd);
      return -saved_errno;
    }
    return fd;
  }
  if (!(errno == EINPROGRESS || errno == EALREADY || errno == EWOULDBLOCK)) {
    const int saved_errno = errno;
    close(fd);
    return -saved_errno;
  }

  int64_t deadline_ms = 0;
  if (timeout_ms > 0) {
    deadline_ms = MonotimeMs() + static_cast<int64_t>(timeout_ms);
  }
  for (;;) {
    int poll_timeout = 0;
    if (timeout_ms > 0) {
      int64_t remaining = deadline_ms - MonotimeMs();
      if (remaining <= 0) {
        close(fd);
        return -ETIMEDOUT;
      }
      poll_timeout = remaining < 100 ? static_cast<int>(remaining) : 100;
    }

    pollfd pfd;
    pfd.fd = fd;
    pfd.events = POLLOUT;
    pfd.revents = 0;
    do {
      rc = poll(&pfd, 1, poll_timeout);
    } while (rc < 0 && errno == EINTR);
    if (rc < 0) {
      const int saved_errno = errno;
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
    socklen_t socket_error_len = static_cast<socklen_t>(sizeof(socket_error));
    do {
      rc = getsockopt(fd, SOL_SOCKET, SO_ERROR, &socket_error, &socket_error_len);
    } while (rc != 0 && errno == EINTR);
    if (rc != 0) {
      const int saved_errno = errno;
      close(fd);
      return -saved_errno;
    }
    if (socket_error != 0) {
      __android_log_print(ANDROID_LOG_INFO,
                          kTag,
                          "%s socket_error fd=%d host=%s port=%d error=%d revents=0x%x",
                          label,
                          fd,
                          host_text,
                          port,
                          socket_error,
                          static_cast<unsigned int>(pfd.revents));
      close(fd);
      return -socket_error;
    }
    if (fcntl(fd, F_SETFL, original_flags) != 0) {
      const int saved_errno = errno;
      close(fd);
      return -saved_errno;
    }
    return fd;
  }
}

int32_t AndroidTcpConnect4(void*,
                           int32_t b0,
                           int32_t b1,
                           int32_t b2,
                           int32_t b3,
                           int32_t port,
                           int32_t timeout_ms) {
  const uint64_t network_handle = g_bound_network_handle.load(std::memory_order_acquire);
  return AndroidTcpConnect4OnNetwork(
      network_handle,
      b0,
      b1,
      b2,
      b3,
      port,
      timeout_ms,
      true,
      true,
      "AndroidTcpConnect4");
}

int32_t AndroidOwnerTcpProbeConnect4(int32_t b0,
                                     int32_t b1,
                                     int32_t b2,
                                     int32_t b3,
                                     int32_t port,
                                     int32_t timeout_ms,
                                     uint64_t network_handle) {
  return AndroidTcpConnect4OnNetwork(
      network_handle,
      b0,
      b1,
      b2,
      b3,
      port,
      timeout_ms,
      true,
      true,
      "AndroidOwnerTcpProbeConnect4");
}

void ClearProtectCallback(JNIEnv* env) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (g_protect.callback != nullptr) {
    env->DeleteGlobalRef(g_protect.callback);
  }
  g_protect.callback = nullptr;
  g_protect.protect_method = nullptr;
  g_protect.network_handle = 0;
  g_bound_network_handle.store(0, std::memory_order_release);
}

void ThrowIllegalState(JNIEnv* env, const std::string& message) {
  jclass cls = env->FindClass("java/lang/IllegalStateException");
  if (cls != nullptr) {
    env->ThrowNew(cls, message.c_str());
  }
}

std::string JStringToString(JNIEnv* env, jstring value) {
  if (value == nullptr) {
    return std::string();
  }
  const char* chars = env->GetStringUTFChars(value, nullptr);
  if (chars == nullptr) {
    return std::string();
  }
  std::string out(chars);
  env->ReleaseStringUTFChars(value, chars);
  return out;
}

std::vector<uint8_t> JByteArrayToVector(JNIEnv* env, jbyteArray value) {
  std::vector<uint8_t> out;
  if (value == nullptr) {
    return out;
  }
  const jsize size = env->GetArrayLength(value);
  if (size <= 0) {
    return out;
  }
  out.resize(static_cast<size_t>(size));
  env->GetByteArrayRegion(value, 0, size, reinterpret_cast<jbyte*>(out.data()));
  if (env->ExceptionCheck()) {
    env->ExceptionClear();
    out.clear();
  }
  return out;
}

const uint8_t* BytesData(const std::vector<uint8_t>& value) {
  return value.empty() ? nullptr : value.data();
}

jstring StringToJString(JNIEnv* env, const std::string& value) {
  return env->NewStringUTF(value.c_str());
}

std::string FixedCString(const char* value, size_t cap) {
  if (value == nullptr || cap == 0) {
    return std::string();
  }
  size_t n = 0;
  while (n < cap && value[n] != '\0') {
    n += 1;
  }
  return std::string(value, n);
}

std::string JsonEscape(const std::string& value) {
  std::string out;
  out.reserve(value.size() + 8);
  for (char ch : value) {
    switch (ch) {
      case '\\':
        out += "\\\\";
        break;
      case '"':
        out += "\\\"";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\r':
        out += "\\r";
        break;
      case '\t':
        out += "\\t";
        break;
      default:
        if (static_cast<unsigned char>(ch) < 0x20 || static_cast<unsigned char>(ch) >= 0x7f) {
          // NewStringUTF requires valid Modified UTF-8; a corrupted byte
          // (e.g. 0xdd from a torn ring read) aborts the whole app process.
          // Status/probe payloads are ASCII by contract: drop high bytes.
          out += '?';
        } else {
          out += ch;
        }
        break;
    }
  }
  return out;
}

void RedactJsonStringValue(std::string* text, const char* key) {
  const std::string pattern = std::string("\"") + key + "\":\"";
  size_t pos = 0;
  while ((pos = text->find(pattern, pos)) != std::string::npos) {
    const size_t value_start = pos + pattern.size();
    const size_t value_end = text->find('"', value_start);
    if (value_end == std::string::npos) {
      return;
    }
    text->replace(value_start, value_end - value_start, "<redacted>");
    pos = value_start + 10;
  }
}

std::string RedactSecrets(std::string text) {
  RedactJsonStringValue(&text, "auth");
  RedactJsonStringValue(&text, "token");
  RedactJsonStringValue(&text, "secret");
  RedactJsonStringValue(&text, "key_pk8_der");
  RedactJsonStringValue(&text, "expected_auth_sha256");
  return text;
}

void ClearCoreCallbacksInCoreCall() {
  // Serialized against the nativeStart register+start sequence (see
  // g_callback_mutex comment): clearing must never land between a new
  // session's set_protect_callback and core.start, and must never overwrite a
  // registration made after this stop began.
  std::lock_guard<std::mutex> callback_lock(g_callback_mutex);
  if (g_core.handle == nullptr) {
    return;
  }
  if (g_core.set_tcp_connect4_callback != nullptr) {
    g_core.set_tcp_connect4_callback(nullptr, nullptr);
  }
  if (g_core.set_network_bind_callback != nullptr) {
    g_core.set_network_bind_callback(nullptr, nullptr);
  }
  if (g_core.set_protect_callback != nullptr) {
    g_core.set_protect_callback(nullptr, nullptr);
  }
}

std::string Ipv4ToString(uint32_t ip) {
  return std::to_string((ip >> 24) & 0xff) + "." +
         std::to_string((ip >> 16) & 0xff) + "." +
         std::to_string((ip >> 8) & 0xff) + "." +
         std::to_string(ip & 0xff);
}

void AppendTraceFlag(std::string* out, uint32_t flags, uint32_t bit, const char* name) {
  if ((flags & bit) == 0) {
    return;
  }
  if (!out->empty()) {
    *out += "|";
  }
  *out += name;
}

std::string TcpTraceFlagText(uint32_t flags) {
  std::string out;
  AppendTraceFlag(&out, flags, kTcpTraceRxSyn, "rx_syn");
  AppendTraceFlag(&out, flags, kTcpTraceRxAck, "rx_ack");
  AppendTraceFlag(&out, flags, kTcpTraceRxPayload, "rx_payload");
  AppendTraceFlag(&out, flags, kTcpTraceRxFin, "rx_fin");
  AppendTraceFlag(&out, flags, kTcpTraceRxRst, "rx_rst");
  AppendTraceFlag(&out, flags, kTcpTraceTxSynAck, "tx_synack");
  AppendTraceFlag(&out, flags, kTcpTraceTxAck, "tx_ack");
  AppendTraceFlag(&out, flags, kTcpTraceTxPayload, "tx_payload");
  AppendTraceFlag(&out, flags, kTcpTraceTxFin, "tx_fin");
  AppendTraceFlag(&out, flags, kTcpTraceTxRst, "tx_rst");
  AppendTraceFlag(&out, flags, kTcpTraceMuxOpen, "mux_open");
  AppendTraceFlag(&out, flags, kTcpTraceMuxData, "mux_data");
  AppendTraceFlag(&out, flags, kTcpTraceMuxFlush, "mux_flush");
  AppendTraceFlag(&out, flags, kTcpTraceMuxOpenOk, "mux_open_ok");
  AppendTraceFlag(&out, flags, kTcpTraceMuxOpenError, "mux_open_error");
  AppendTraceFlag(&out, flags, kTcpTraceMuxRxData, "mux_rx_data");
  AppendTraceFlag(&out, flags, kTcpTraceDecisionPayload, "decision_payload");
  AppendTraceFlag(&out, flags, kTcpTracePayloadNonempty, "payload_nonempty");
  AppendTraceFlag(&out, flags, kTcpTraceOpenAttempt, "open_attempt");
  AppendTraceFlag(&out, flags, kTcpTraceTunnelReadable, "tunnel_readable");
  AppendTraceFlag(&out, flags, kTcpTraceFrameRead, "frame_read");
  AppendTraceFlag(&out, flags, kTcpTraceFrameError, "frame_error");
  AppendTraceFlag(&out, flags, kTcpTraceUnknownStream, "unknown_stream");
  return out.empty() ? "none" : out;
}

std::string HexByteText(uint32_t value) {
  char buf[16];
  std::snprintf(buf, sizeof(buf), "0x%02x", static_cast<unsigned int>(value & 0xffu));
  return std::string(buf);
}

std::string HexWordText(uint32_t value) {
  char buf[16];
  std::snprintf(buf, sizeof(buf), "0x%08x", static_cast<unsigned int>(value));
  return std::string(buf);
}

std::string TcpConnectErrorText(int32_t rc) {
  if (rc >= 0) {
    return "ok";
  }
  const int code = -rc;
  const char* message = std::strerror(code);
  std::string out = message != nullptr ? message : "unknown";
  out += " (";
  out += std::to_string(code);
  out += ")";
  return out;
}

std::string OwnerTcpProbeResolved4(const std::string& host,
                                   uint8_t b0,
                                   uint8_t b1,
                                   uint8_t b2,
                                   uint8_t b3,
                                   int32_t port,
                                   int32_t timeout_ms,
                                   uint64_t network_handle) {
  const int32_t fd = AndroidOwnerTcpProbeConnect4(
      static_cast<int32_t>(b0),
      static_cast<int32_t>(b1),
      static_cast<int32_t>(b2),
      static_cast<int32_t>(b3),
      port,
      timeout_ms,
      network_handle);
  if (fd >= 0) {
    close(fd);
    return "ok";
  }
  return "tcp probe failed host=" + host + " port=" + std::to_string(port) +
         " error=" + TcpConnectErrorText(fd);
}

std::string OwnerTcpProbe4(const std::string& host,
                           int32_t port,
                           int32_t timeout_ms,
                           uint64_t network_handle) {
  in_addr literal;
  if (inet_pton(AF_INET, host.c_str(), &literal) == 1) {
    const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&literal.s_addr);
    return OwnerTcpProbeResolved4(
        host,
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        port,
        timeout_ms,
        network_handle);
  }

  addrinfo hints;
  std::memset(&hints, 0, sizeof(hints));
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  hints.ai_protocol = IPPROTO_TCP;
  addrinfo* result = nullptr;
  const std::string service = std::to_string(port);
  const int gai = android_getaddrinfofornetwork(
      static_cast<net_handle_t>(network_handle),
      host.c_str(),
      service.c_str(),
      &hints,
      &result);
  if (gai != 0 || result == nullptr) {
    return "dns probe failed host=" + host + " error=" + gai_strerror(gai) +
           " (" + std::to_string(gai) + ")";
  }
  std::string probe_result = "dns probe failed host=" + host + " error=no_ipv4";
  for (addrinfo* cur = result; cur != nullptr; cur = cur->ai_next) {
    if (cur->ai_family != AF_INET || cur->ai_addr == nullptr ||
        cur->ai_addrlen < static_cast<socklen_t>(sizeof(sockaddr_in))) {
      continue;
    }
    const sockaddr_in* addr = reinterpret_cast<const sockaddr_in*>(cur->ai_addr);
    const uint8_t* bytes = reinterpret_cast<const uint8_t*>(&addr->sin_addr.s_addr);
    probe_result = OwnerTcpProbeResolved4(
        host,
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        port,
        timeout_ms,
        network_handle);
    if (probe_result == "ok") {
      break;
    }
  }
  freeaddrinfo(result);
  return probe_result;
}

}  // namespace

// SABI v2 emit callbacks. DEFINED here and resolved by the Cheng core as
// @importc symbols. Text arguments are utf8_view (ptr + int64 len, NOT
// NUL-terminated) — copy exactly len bytes. Each callback only writes the
// thread_local accumulator; the owning JNI wrapper resets it before the core
// call and reads it after.
extern "C" CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_start_emit(
    uint64_t session_id,
    int32_t connected,
    const char* error_text,
    int64_t error_text_len) {
  g_tun_start_acc.session_id = session_id;
  g_tun_start_acc.connected = connected;
  CopyViewToFixed(g_tun_start_acc.error,
                  sizeof(g_tun_start_acc.error),
                  error_text,
                  error_text_len);
  return 0;
}

extern "C" CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_proxy_start_emit(
    uint64_t session_id,
    int32_t connected,
    int32_t listen_port,
    const char* error_text,
    int64_t error_text_len) {
  g_proxy_start_acc.session_id = session_id;
  g_proxy_start_acc.connected = connected;
  g_proxy_start_acc.listen_port = listen_port;
  CopyViewToFixed(g_proxy_start_acc.error,
                  sizeof(g_proxy_start_acc.error),
                  error_text,
                  error_text_len);
  return 0;
}

extern "C" CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_status_emit(
    int32_t abi_version,
    uint64_t session_id,
    int32_t connected,
    uint64_t rx_bytes,
    uint64_t tx_bytes,
    const char* status_text,
    int64_t status_text_len,
    const char* error_text,
    int64_t error_text_len) {
  g_status_acc.abi_version = static_cast<uint32_t>(abi_version);
  g_status_acc.session_id = session_id;
  g_status_acc.connected = connected;
  g_status_acc.rx_bytes = rx_bytes;
  g_status_acc.tx_bytes = tx_bytes;
  CopyViewToFixed(g_status_acc.text,
                  sizeof(g_status_acc.text),
                  status_text,
                  status_text_len);
  CopyViewToFixed(g_status_acc.error,
                  sizeof(g_status_acc.error),
                  error_text,
                  error_text_len);
  return 0;
}

extern "C" CHENG_HY2_TUN_EXPORT int32_t cheng_hy2_tun_snapshot_emit(
    const char* json,
    int64_t json_len) {
  if (json != nullptr && json_len > 0) {
    g_snapshot_acc.assign(json, static_cast<size_t>(json_len));
  } else {
    g_snapshot_acc.clear();
  }
  return 0;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeCoreAvailable(JNIEnv*, jclass) {
  return LoadCore(nullptr) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeLoadError(JNIEnv* env, jclass) {
  std::string error;
  if (LoadCore(&error)) {
    return StringToJString(env, "");
  }
  return StringToJString(env, error);
}

extern "C" JNIEXPORT jstring JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeGuiSnapshot(
    JNIEnv* env,
    jclass,
    jstring platform,
    jstring config_path) {
  std::string error;
  if (!LoadCore(&error)) {
    ThrowIllegalState(env, error);
    return nullptr;
  }
  const std::string platform_text = JStringToString(env, platform);
  const std::string path_text = JStringToString(env, config_path);
  std::string snapshot;
  int32_t rc = -1;
  {
    __android_log_print(ANDROID_LOG_INFO, kTag, "nativeGuiSnapshot skip (core spins), returning cached");
    snapshot = "{\"connected\":0,\"error\":\"\"}";
    rc = 0;
  }
  if (rc < 0) {
    ThrowIllegalState(env, "cheng mobile gui snapshot failed");
    return nullptr;
  }
  return StringToJString(env, snapshot);
}

extern "C" JNIEXPORT jlong JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeStart(
    JNIEnv* env,
    jclass,
    jstring config_json,
    jstring config_path,
    jbyteArray cert_der,
    jbyteArray key_pk8_der,
    jbyteArray trust_root_der,
    jint tun_fd,
    jlong underlying_network_handle,
    jobject protect_callback) {
  std::string error;
  if (!LoadCore(&error)) {
    ThrowIllegalState(env, error);
    return 0;
  }
  const bool use_protect_callback = underlying_network_handle != 0;
  JavaVM* vm = nullptr;
  jmethodID protect_method = nullptr;
  jobject callback_ref = nullptr;
  if (use_protect_callback) {
    if (protect_callback == nullptr) {
      ThrowIllegalState(env, "protect callback missing");
      return 0;
    }
    if (env->GetJavaVM(&vm) != JNI_OK || vm == nullptr) {
      ThrowIllegalState(env, "GetJavaVM failed");
      return 0;
    }
    jclass callback_cls = env->GetObjectClass(protect_callback);
    protect_method = env->GetMethodID(callback_cls, "protect", "(I)Z");
    if (protect_method == nullptr) {
      ThrowIllegalState(env, "protect callback method missing");
      return 0;
    }
    callback_ref = env->NewGlobalRef(protect_callback);
    if (callback_ref == nullptr) {
      ThrowIllegalState(env, "protect callback retain failed");
      return 0;
    }
  }
  ClearProtectCallback(env);
  g_protect_call_count.store(0, std::memory_order_relaxed);
  g_protect_success_count.store(0, std::memory_order_relaxed);
  g_protect_failure_count.store(0, std::memory_order_relaxed);
  if (use_protect_callback) {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_protect.vm = vm;
    g_protect.callback = callback_ref;
    g_protect.protect_method = protect_method;
    g_protect.network_handle = static_cast<uint64_t>(underlying_network_handle);
    g_bound_network_handle.store(static_cast<uint64_t>(underlying_network_handle),
                                 std::memory_order_release);
  }

  std::string config = JStringToString(env, config_json);
  std::string path = JStringToString(env, config_path);
  std::vector<uint8_t> cert = JByteArrayToVector(env, cert_der);
  std::vector<uint8_t> key = JByteArrayToVector(env, key_pk8_der);
  std::vector<uint8_t> root = JByteArrayToVector(env, trust_root_der);
  ChengHy2TunCoreStartResult& result = g_tun_start_acc;
  std::memset(&result, 0, sizeof(result));
  result.abi_version = CHENG_HY2_TUN_CORE_ABI_VERSION;

  int32_t rc = 0;
  {
    // Registration and core.start must be atomic against ClearCoreCallbacks-
    // InCoreCall (nativeStop cleanup): see g_callback_mutex. set_*_callback
    // calls set function pointers and do NOT need to serialize with
    // gui_snapshot. Holding g_core_call_mutex here causes a deadlock when
    // gui_snapshot is stuck inside core (core's snapshot path can block on
    // TLS/network while the GUI thread holds the lock). g_callback_mutex is a
    // separate lightweight lock so nativeStart still proceeds even if the GUI
    // snapshot thread is blocked.
    std::lock_guard<std::mutex> callback_lock(g_callback_mutex);
    __android_log_print(ANDROID_LOG_INFO, kTag, "nativeStart registering callbacks (lock-free)");
    const int32_t bind_rc = g_core.set_network_bind_callback(
        use_protect_callback ? AndroidNetworkBindFd : NoopNetworkBindFd,
        nullptr);
    __android_log_print(ANDROID_LOG_INFO, kTag, "nativeStart network bind callback rc=%d", bind_rc);
    __android_log_print(ANDROID_LOG_INFO, kTag, "nativeStart setting protect callback");
    const int32_t protect_rc = g_core.set_protect_callback(
        use_protect_callback ? ProtectFd : NoopProtectFd,
        nullptr);
    __android_log_print(ANDROID_LOG_INFO, kTag, "nativeStart protect callback rc=%d", protect_rc);
    __android_log_print(ANDROID_LOG_INFO, kTag, "nativeStart setting tcp connect callback");
    const int32_t connect_rc = g_core.set_tcp_connect4_callback(nullptr, nullptr);
    __android_log_print(ANDROID_LOG_INFO, kTag, "nativeStart tcp connect callback rc=%d", connect_rc);
    if (bind_rc != 0) {
      rc = bind_rc;
    } else if (protect_rc != 0) {
      rc = protect_rc;
    } else if (connect_rc != 0) {
      rc = connect_rc;
    }
    if (rc == 0) {
      // Still under g_callback_mutex: core.start spawns the tun worker before
      // returning, so the protect/bind callbacks must already be registered
      // and must stay registered until a future nativeStop acquires this same
      // lock to clear them. Lock-free vs g_core_call_mutex (see above).
      __android_log_print(ANDROID_LOG_INFO,
                          kTag,
                          "nativeStart calling core.set_config bytes=%d path_bytes=%d",
                          static_cast<int32_t>(config.size()),
                          static_cast<int32_t>(path.size()));
      rc = g_core.set_config(
          config.data(),
          static_cast<int64_t>(config.size()),
          path.data(),
          static_cast<int64_t>(path.size()));
      __android_log_print(ANDROID_LOG_INFO,
                          kTag,
                          "nativeStart core.set_config returned rc=%d",
                          rc);
      if (rc == 0) {
        __android_log_print(ANDROID_LOG_INFO,
                            kTag,
                            "nativeStart calling core.set_identity cert=%d key=%d root=%d",
                            static_cast<int32_t>(cert.size()),
                            static_cast<int32_t>(key.size()),
                            static_cast<int32_t>(root.size()));
        rc = g_core.set_identity(
          BytesData(cert),
          static_cast<int64_t>(cert.size()),
          BytesData(key),
          static_cast<int64_t>(key.size()),
          BytesData(root),
          static_cast<int64_t>(root.size()));
        __android_log_print(ANDROID_LOG_INFO,
                            kTag,
                            "nativeStart core.set_identity returned rc=%d",
                            rc);
      }
      if (rc == 0) {
        __android_log_print(ANDROID_LOG_INFO,
                            kTag,
                            "nativeStart calling core.start tun_fd=%d",
                            static_cast<int32_t>(tun_fd));
        rc = g_core.start(
            CHENG_HY2_TUN_CORE_ABI_VERSION,
            static_cast<int32_t>(tun_fd));
        __android_log_print(ANDROID_LOG_INFO,
                            kTag,
                            "nativeStart core.start returned rc=%d connected=%d session=%llu",
                            rc,
                            result.connected,
                            static_cast<unsigned long long>(result.session_id));
      }
    }
  }
  if (rc != 0) {
    std::string message = RedactSecrets(
        result.error[0] != '\0' ? result.error : "cheng_hy2_tun_core_start failed");
    __android_log_print(ANDROID_LOG_ERROR, kTag, "start failed: %s", message.c_str());
    {
      std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
      ClearCoreCallbacksInCoreCall();
    }
    ClearProtectCallback(env);
    ThrowIllegalState(env, message);
    return 0;
  }
  if (result.connected == 0 || result.session_id == 0) {
    {
      std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
      ClearCoreCallbacksInCoreCall();
    }
    ClearProtectCallback(env);
    ThrowIllegalState(env, "cheng_hy2_tun_core_start did not report a connected session");
    return 0;
  }
  return static_cast<jlong>(result.session_id);
}

extern "C" JNIEXPORT jlongArray JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeStartProxy(
    JNIEnv* env,
    jclass,
    jstring config_json,
    jstring config_path,
    jbyteArray cert_der,
    jbyteArray key_pk8_der,
    jbyteArray trust_root_der,
    jlong underlying_network_handle,
    jobject protect_callback) {
  std::string error;
  if (!LoadCore(&error)) {
    ThrowIllegalState(env, error);
    return nullptr;
  }
  const bool use_protect_callback = underlying_network_handle != 0;
  JavaVM* vm = nullptr;
  jmethodID protect_method = nullptr;
  jobject callback_ref = nullptr;
  if (use_protect_callback) {
    if (protect_callback == nullptr) {
      ThrowIllegalState(env, "protect callback missing");
      return nullptr;
    }
    if (env->GetJavaVM(&vm) != JNI_OK || vm == nullptr) {
      ThrowIllegalState(env, "GetJavaVM failed");
      return nullptr;
    }
    jclass callback_cls = env->GetObjectClass(protect_callback);
    protect_method = env->GetMethodID(callback_cls, "protect", "(I)Z");
    if (protect_method == nullptr) {
      ThrowIllegalState(env, "protect callback method missing");
      return nullptr;
    }
    callback_ref = env->NewGlobalRef(protect_callback);
    if (callback_ref == nullptr) {
      ThrowIllegalState(env, "protect callback retain failed");
      return nullptr;
    }
  }
  ClearProtectCallback(env);
  g_protect_call_count.store(0, std::memory_order_relaxed);
  g_protect_success_count.store(0, std::memory_order_relaxed);
  g_protect_failure_count.store(0, std::memory_order_relaxed);
  if (use_protect_callback) {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_protect.vm = vm;
    g_protect.callback = callback_ref;
    g_protect.protect_method = protect_method;
    g_protect.network_handle = static_cast<uint64_t>(underlying_network_handle);
    g_bound_network_handle.store(static_cast<uint64_t>(underlying_network_handle),
                                 std::memory_order_release);
  }

  std::string config = JStringToString(env, config_json);
  std::string path = JStringToString(env, config_path);
  std::vector<uint8_t> cert = JByteArrayToVector(env, cert_der);
  std::vector<uint8_t> key = JByteArrayToVector(env, key_pk8_der);
  std::vector<uint8_t> root = JByteArrayToVector(env, trust_root_der);
  ChengHy2ProxyCoreStartResult& result = g_proxy_start_acc;
  std::memset(&result, 0, sizeof(result));
  result.abi_version = CHENG_HY2_TUN_CORE_ABI_VERSION;

  int32_t rc = 0;
  {
    std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
    const int32_t bind_rc = g_core.set_network_bind_callback(
        use_protect_callback ? AndroidNetworkBindFd : NoopNetworkBindFd,
        nullptr);
    const int32_t protect_rc = g_core.set_protect_callback(
        use_protect_callback ? ProtectFd : NoopProtectFd,
        nullptr);
    const int32_t connect_rc = g_core.set_tcp_connect4_callback(nullptr, nullptr);
    if (bind_rc != 0) {
      rc = bind_rc;
    } else if (protect_rc != 0) {
      rc = protect_rc;
    } else if (connect_rc != 0) {
      rc = connect_rc;
    }
  }
  if (rc == 0) {
    std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
    rc = g_core.set_config(
        config.data(),
        static_cast<int64_t>(config.size()),
        path.data(),
        static_cast<int64_t>(path.size()));
    if (rc == 0) {
      rc = g_core.set_identity(
          BytesData(cert),
          static_cast<int64_t>(cert.size()),
          BytesData(key),
          static_cast<int64_t>(key.size()),
          BytesData(root),
          static_cast<int64_t>(root.size()));
    }
    if (rc == 0) {
      rc = g_core.proxy_start(CHENG_HY2_TUN_CORE_ABI_VERSION);
    }
  }
  if (rc != 0 || result.connected == 0 || result.session_id == 0 || result.listen_port <= 0) {
    std::string message = RedactSecrets(
        result.error[0] != '\0' ? result.error : "cheng_hy2_proxy_core_start failed");
    __android_log_print(ANDROID_LOG_ERROR, kTag, "proxy start failed: %s", message.c_str());
    {
      std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
      ClearCoreCallbacksInCoreCall();
    }
    ClearProtectCallback(env);
    ThrowIllegalState(env, message);
    return nullptr;
  }

  jlongArray out = env->NewLongArray(2);
  if (out == nullptr) {
    {
      std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
      g_core.proxy_stop(result.session_id);
      ClearCoreCallbacksInCoreCall();
    }
    ClearProtectCallback(env);
    ThrowIllegalState(env, "proxy result allocation failed");
    return nullptr;
  }
  jlong values[2] = {
      static_cast<jlong>(result.session_id),
      static_cast<jlong>(result.listen_port),
  };
  env->SetLongArrayRegion(out, 0, 2, values);
  if (env->ExceptionCheck()) {
    {
      std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
      g_core.proxy_stop(result.session_id);
      ClearCoreCallbacksInCoreCall();
    }
    ClearProtectCallback(env);
    return nullptr;
  }
  return out;
}

extern "C" JNIEXPORT jstring JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeOwnerTcpProbe(
    JNIEnv* env,
    jclass,
    jstring host,
    jint port,
    jint timeout_ms,
    jlong underlying_network_handle,
    jobject protect_callback) {
  const std::string host_text = JStringToString(env, host);
  if (host_text.empty()) {
    return StringToJString(env, "tcp probe failed: host missing");
  }
  if (port <= 0 || port > 65535) {
    return StringToJString(env, "tcp probe failed: port out of range");
  }
  if (underlying_network_handle == 0) {
    return StringToJString(env, "tcp probe failed: underlying network missing");
  }
  if (protect_callback == nullptr) {
    return StringToJString(env, "tcp probe failed: protect callback missing");
  }

  JavaVM* vm = nullptr;
  if (env->GetJavaVM(&vm) != JNI_OK || vm == nullptr) {
    return StringToJString(env, "tcp probe failed: GetJavaVM failed");
  }
  jclass callback_cls = env->GetObjectClass(protect_callback);
  jmethodID protect_method = env->GetMethodID(callback_cls, "protect", "(I)Z");
  if (protect_method == nullptr) {
    if (env->ExceptionCheck()) {
      env->ExceptionClear();
    }
    return StringToJString(env, "tcp probe failed: protect callback method missing");
  }
  jobject callback_ref = env->NewGlobalRef(protect_callback);
  if (callback_ref == nullptr) {
    return StringToJString(env, "tcp probe failed: protect callback retain failed");
  }

  const int32_t clamped_timeout =
      timeout_ms < 1000 ? 1000 : (timeout_ms > 30000 ? 30000 : timeout_ms);
  ClearProtectCallback(env);
  g_protect_call_count.store(0, std::memory_order_relaxed);
  g_protect_success_count.store(0, std::memory_order_relaxed);
  g_protect_failure_count.store(0, std::memory_order_relaxed);
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_protect.vm = vm;
    g_protect.callback = callback_ref;
    g_protect.protect_method = protect_method;
    g_protect.network_handle = static_cast<uint64_t>(underlying_network_handle);
    g_bound_network_handle.store(static_cast<uint64_t>(underlying_network_handle),
                                 std::memory_order_release);
  }
  const std::string result = OwnerTcpProbe4(
      host_text,
      static_cast<int32_t>(port),
      clamped_timeout,
      static_cast<uint64_t>(underlying_network_handle));
  ClearProtectCallback(env);
  return StringToJString(env, result);
}

extern "C" JNIEXPORT void JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeStop(JNIEnv* env, jclass, jlong session_id) {
  if (session_id < 0) {
    ClearProtectCallback(env);
    return;
  }
  if (LoadCore(nullptr)) {
    std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
    g_core.stop(static_cast<uint64_t>(session_id));
    ClearCoreCallbacksInCoreCall();
  }
  ClearProtectCallback(env);
}

extern "C" JNIEXPORT void JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeStopProxy(JNIEnv* env, jclass, jlong session_id) {
  if (session_id < 0) {
    ClearProtectCallback(env);
    return;
  }
  if (LoadCore(nullptr)) {
    std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
    g_core.proxy_stop(static_cast<uint64_t>(session_id));
    ClearCoreCallbacksInCoreCall();
  }
  ClearProtectCallback(env);
}

extern "C" JNIEXPORT jstring JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeProxyStatusJson(JNIEnv* env, jclass, jlong session_id) {
  if (!LoadCore(nullptr)) {
    return StringToJString(env, "{\"state\":\"failed\",\"error\":\"core unavailable\"}");
  }
  if (!TryLockCoreCall(kStatusLockTimeoutMs)) {
    __android_log_print(ANDROID_LOG_WARN, kTag, "nativeProxyStatusJson lock busy; returning cache");
    return StringToJString(env, CachedStatusJsonMarked(g_last_proxy_status_json));
  }
  ChengHy2TunCoreStatus& status = g_status_acc;
  std::memset(&status, 0, sizeof(status));
  status.abi_version = CHENG_HY2_TUN_CORE_ABI_VERSION;
  g_core.proxy_status(static_cast<uint64_t>(session_id));
  g_core_call_mutex.unlock();
  const std::string status_error = RedactSecrets(FixedCString(status.error, sizeof(status.error)));
  std::string json = "{\"state\":\"";
  if (status.connected != 0) {
    json += "connected";
  } else if (!status_error.empty()) {
    json += "failed";
  } else {
    json += "stopped";
  }
  json += "\",\"session_id\":";
  json += std::to_string(status.session_id);
  json += ",\"rx_bytes\":";
  json += std::to_string(status.rx_bytes);
  json += ",\"tx_bytes\":";
  json += std::to_string(status.tx_bytes);
  json += ",\"protect_calls\":";
  json += std::to_string(g_protect_call_count.load(std::memory_order_relaxed));
  json += ",\"protect_success\":";
  json += std::to_string(g_protect_success_count.load(std::memory_order_relaxed));
  json += ",\"protect_failure\":";
  json += std::to_string(g_protect_failure_count.load(std::memory_order_relaxed));
  json += ",\"text\":\"";
  json += JsonEscape(FixedCString(status.text, sizeof(status.text)));
  json += "\",\"error\":\"";
  json += JsonEscape(status_error);
  json += "\"}";
  CacheStatusJson(&g_last_proxy_status_json, json);
  return StringToJString(env, json);
}

extern "C" JNIEXPORT jstring JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeProxyProbeJson(JNIEnv* env, jclass, jint timeout_ms) {
  if (!LoadCore(nullptr)) {
    return StringToJString(env, "{\"state\":\"failed\",\"probe_healthy\":false,\"error\":\"core unavailable\"}");
  }
  if (g_core.proxy_probe_status == nullptr) {
    return StringToJString(env, "{\"state\":\"failed\",\"probe_healthy\":false,\"error\":\"proxy probe unavailable\"}");
  }
  ChengHy2TunCoreStatus& status = g_status_acc;
  std::memset(&status, 0, sizeof(status));
  status.abi_version = CHENG_HY2_TUN_CORE_ABI_VERSION;
  int32_t rc = -1;
  {
    std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
    rc = g_core.proxy_probe_status(CHENG_HY2_TUN_CORE_ABI_VERSION, timeout_ms);
  }
  const std::string status_error = RedactSecrets(FixedCString(status.error, sizeof(status.error)));
  const bool healthy = rc == 0 && status.connected != 0;
  std::string json = "{\"state\":\"";
  json += healthy ? "connected" : "failed";
  json += "\",\"probe_healthy\":";
  json += healthy ? "true" : "false";
  json += ",\"sample_ms\":";
  json += std::to_string(status.rx_bytes);
  json += ",\"text\":\"";
  json += JsonEscape(FixedCString(status.text, sizeof(status.text)));
  json += "\",\"error\":\"";
  json += JsonEscape(status_error);
  json += "\"}";
  return StringToJString(env, json);
}

extern "C" JNIEXPORT jstring JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeStatusJson(JNIEnv* env, jclass, jlong session_id) {
  if (!LoadCore(nullptr)) {
    return StringToJString(env, "{\"state\":\"failed\",\"error\":\"core unavailable\"}");
  }
  if (!TryLockCoreCall(kStatusLockTimeoutMs)) {
    __android_log_print(ANDROID_LOG_WARN, kTag, "nativeStatusJson lock busy; returning cache");
    return StringToJString(env, CachedStatusJsonMarked(g_last_status_json));
  }
  ChengHy2TunCoreStatus& status = g_status_acc;
  std::memset(&status, 0, sizeof(status));
  status.abi_version = CHENG_HY2_TUN_CORE_ABI_VERSION;
  g_core.status(static_cast<uint64_t>(session_id));
  uint64_t rx_bytes = status.rx_bytes;
  uint64_t tx_bytes = status.tx_bytes;
  uint64_t rx_packets = 0;
  uint64_t tx_packets = 0;
  uint64_t wait_calls = 0;
  uint64_t wait_ready = 0;
  uint64_t read_calls = 0;
  uint64_t write_calls = 0;
  int32_t last_wait_result = 0;
  int32_t last_read_result = 0;
  int32_t last_write_result = 0;
  int32_t last_rx_proto = -1;
  int32_t last_rx_sport = -1;
  int32_t last_rx_dport = -1;
  uint32_t last_rx_dst = 0;
  int32_t last_tx_proto = -1;
  int32_t last_tx_sport = -1;
  int32_t last_tx_dport = -1;
  uint32_t last_tx_dst = 0;
  int32_t last_rx_dns_qtype = -1;
  int32_t last_rx_dns_id = -1;
  int32_t last_rx_dns_answers = -1;
  int32_t last_rx_dns_rcode = -1;
  int32_t last_rx_dns_checksum_ok = -1;
  uint32_t last_rx_dns_answer_ip = 0;
  int32_t last_tx_dns_qtype = -1;
  int32_t last_tx_dns_id = -1;
  int32_t last_tx_dns_answers = -1;
  int32_t last_tx_dns_rcode = -1;
  int32_t last_tx_dns_checksum_ok = -1;
  uint32_t last_tx_dns_answer_ip = 0;
  if (g_core.tun_rx_bytes != nullptr) {
    rx_bytes = g_core.tun_rx_bytes();
  }
  if (g_core.tun_tx_bytes != nullptr) {
    tx_bytes = g_core.tun_tx_bytes();
  }
  if (g_core.tun_rx_packets != nullptr) {
    rx_packets = g_core.tun_rx_packets();
  }
  if (g_core.tun_tx_packets != nullptr) {
    tx_packets = g_core.tun_tx_packets();
  }
  if (g_core.tun_wait_calls != nullptr) {
    wait_calls = g_core.tun_wait_calls();
  }
  if (g_core.tun_wait_ready != nullptr) {
    wait_ready = g_core.tun_wait_ready();
  }
  if (g_core.tun_read_calls != nullptr) {
    read_calls = g_core.tun_read_calls();
  }
  if (g_core.tun_write_calls != nullptr) {
    write_calls = g_core.tun_write_calls();
  }
  if (g_core.tun_last_wait_result != nullptr) {
    last_wait_result = g_core.tun_last_wait_result();
  }
  if (g_core.tun_last_read_result != nullptr) {
    last_read_result = g_core.tun_last_read_result();
  }
  if (g_core.tun_last_write_result != nullptr) {
    last_write_result = g_core.tun_last_write_result();
  }
  if (g_core.tun_last_rx_proto != nullptr) {
    last_rx_proto = g_core.tun_last_rx_proto();
  }
  if (g_core.tun_last_rx_sport != nullptr) {
    last_rx_sport = g_core.tun_last_rx_sport();
  }
  if (g_core.tun_last_rx_dport != nullptr) {
    last_rx_dport = g_core.tun_last_rx_dport();
  }
  if (g_core.tun_last_rx_dst != nullptr) {
    last_rx_dst = g_core.tun_last_rx_dst();
  }
  if (g_core.tun_last_tx_proto != nullptr) {
    last_tx_proto = g_core.tun_last_tx_proto();
  }
  if (g_core.tun_last_tx_sport != nullptr) {
    last_tx_sport = g_core.tun_last_tx_sport();
  }
  if (g_core.tun_last_tx_dport != nullptr) {
    last_tx_dport = g_core.tun_last_tx_dport();
  }
  if (g_core.tun_last_tx_dst != nullptr) {
    last_tx_dst = g_core.tun_last_tx_dst();
  }
  if (g_core.tun_last_rx_dns_qtype != nullptr) {
    last_rx_dns_qtype = g_core.tun_last_rx_dns_qtype();
  }
  if (g_core.tun_last_rx_dns_id != nullptr) {
    last_rx_dns_id = g_core.tun_last_rx_dns_id();
  }
  if (g_core.tun_last_rx_dns_answers != nullptr) {
    last_rx_dns_answers = g_core.tun_last_rx_dns_answers();
  }
  if (g_core.tun_last_rx_dns_rcode != nullptr) {
    last_rx_dns_rcode = g_core.tun_last_rx_dns_rcode();
  }
  if (g_core.tun_last_rx_dns_checksum_ok != nullptr) {
    last_rx_dns_checksum_ok = g_core.tun_last_rx_dns_checksum_ok();
  }
  if (g_core.tun_last_rx_dns_answer_ip != nullptr) {
    last_rx_dns_answer_ip = g_core.tun_last_rx_dns_answer_ip();
  }
  if (g_core.tun_last_tx_dns_qtype != nullptr) {
    last_tx_dns_qtype = g_core.tun_last_tx_dns_qtype();
  }
  if (g_core.tun_last_tx_dns_id != nullptr) {
    last_tx_dns_id = g_core.tun_last_tx_dns_id();
  }
  if (g_core.tun_last_tx_dns_answers != nullptr) {
    last_tx_dns_answers = g_core.tun_last_tx_dns_answers();
  }
  if (g_core.tun_last_tx_dns_rcode != nullptr) {
    last_tx_dns_rcode = g_core.tun_last_tx_dns_rcode();
  }
  if (g_core.tun_last_tx_dns_checksum_ok != nullptr) {
    last_tx_dns_checksum_ok = g_core.tun_last_tx_dns_checksum_ok();
  }
  if (g_core.tun_last_tx_dns_answer_ip != nullptr) {
    last_tx_dns_answer_ip = g_core.tun_last_tx_dns_answer_ip();
  }
  std::string dns_ring;
  if (g_core.tun_dns_ring_dump != nullptr) {
    char ring_buf[4096];
    int32_t ring_len = g_core.tun_dns_ring_dump(ring_buf, sizeof(ring_buf));
    if (ring_len > 0) {
      dns_ring.assign(ring_buf, static_cast<size_t>(ring_len));
      std::string escaped;
      escaped.reserve(dns_ring.size() + 16);
      for (char c : dns_ring) {
        if (c == '\\') escaped += "\\\\";
        else if (c == '"') escaped += "\\\"";
        else if (c == '\n') escaped += "\\n";
        else if (static_cast<unsigned char>(c) < 32 || static_cast<unsigned char>(c) >= 127) escaped += ' ';
        else escaped += c;
      }
      dns_ring = std::move(escaped);
    }
  }
  ChengHy2TunCoreMemDiag mem_diag{};
  mem_diag.abi_version = CHENG_HY2_TUN_CORE_ABI_VERSION;
  if (g_core.mem_diag != nullptr) {
    g_core.mem_diag(CHENG_HY2_TUN_CORE_ABI_VERSION);
  }
  if (g_core.last_mem_diag != nullptr) {
    g_core.last_mem_diag(&mem_diag);
  }
  g_core_call_mutex.unlock();
  const std::string status_error = RedactSecrets(FixedCString(status.error, sizeof(status.error)));
  std::string json = "{\"state\":\"";
  if (status.connected != 0) {
    json += "connected";
  } else if (!status_error.empty()) {
    json += "failed";
  } else {
    json += "stopped";
  }
  json += "\",\"session_id\":";
  json += std::to_string(status.session_id);
  json += ",\"rx_bytes\":";
  json += std::to_string(rx_bytes);
  json += ",\"tx_bytes\":";
  json += std::to_string(tx_bytes);
  json += ",\"rx_packets\":";
  json += std::to_string(rx_packets);
  json += ",\"tx_packets\":";
  json += std::to_string(tx_packets);
  json += ",\"tun_wait_calls\":";
  json += std::to_string(wait_calls);
  json += ",\"tun_wait_ready\":";
  json += std::to_string(wait_ready);
  json += ",\"tun_read_calls\":";
  json += std::to_string(read_calls);
  json += ",\"tun_write_calls\":";
  json += std::to_string(write_calls);
  json += ",\"tun_last_wait_result\":";
  json += std::to_string(last_wait_result);
  json += ",\"tun_last_read_result\":";
  json += std::to_string(last_read_result);
  json += ",\"tun_last_write_result\":";
  json += std::to_string(last_write_result);
  json += ",\"last_rx_proto\":";
  json += std::to_string(last_rx_proto);
  json += ",\"last_rx_sport\":";
  json += std::to_string(last_rx_sport);
  json += ",\"last_rx_dport\":";
  json += std::to_string(last_rx_dport);
  json += ",\"last_rx_dst\":\"";
  json += JsonEscape(Ipv4ToString(last_rx_dst));
  json += "\",\"last_tx_proto\":";
  json += std::to_string(last_tx_proto);
  json += ",\"last_tx_sport\":";
  json += std::to_string(last_tx_sport);
  json += ",\"last_tx_dport\":";
  json += std::to_string(last_tx_dport);
  json += ",\"last_tx_dst\":\"";
  json += JsonEscape(Ipv4ToString(last_tx_dst));
  json += "\"";
  if (!dns_ring.empty()) {
    json += ",\"dns_ring\":\"";
    json += dns_ring;
    json += "\"";
  };
  json += ",\"last_rx_dns_qtype\":";
  json += std::to_string(last_rx_dns_qtype);
  json += ",\"last_rx_dns_id\":";
  json += std::to_string(last_rx_dns_id);
  json += ",\"last_rx_dns_answers\":";
  json += std::to_string(last_rx_dns_answers);
  json += ",\"last_rx_dns_rcode\":";
  json += std::to_string(last_rx_dns_rcode);
  json += ",\"last_rx_dns_checksum_ok\":";
  json += std::to_string(last_rx_dns_checksum_ok);
  json += ",\"last_rx_dns_answer_ip\":\"";
  json += JsonEscape(Ipv4ToString(last_rx_dns_answer_ip));
  json += "\"";
  json += ",\"last_tx_dns_qtype\":";
  json += std::to_string(last_tx_dns_qtype);
  json += ",\"last_tx_dns_id\":";
  json += std::to_string(last_tx_dns_id);
  json += ",\"last_tx_dns_answers\":";
  json += std::to_string(last_tx_dns_answers);
  json += ",\"last_tx_dns_rcode\":";
  json += std::to_string(last_tx_dns_rcode);
  json += ",\"last_tx_dns_checksum_ok\":";
  json += std::to_string(last_tx_dns_checksum_ok);
  json += ",\"last_tx_dns_answer_ip\":\"";
  json += JsonEscape(Ipv4ToString(last_tx_dns_answer_ip));
  json += "\"";
  json += ",\"protect_calls\":";
  json += std::to_string(g_protect_call_count.load(std::memory_order_relaxed));
  json += ",\"protect_success\":";
  json += std::to_string(g_protect_success_count.load(std::memory_order_relaxed));
  json += ",\"protect_failure\":";
  json += std::to_string(g_protect_failure_count.load(std::memory_order_relaxed));
  json += ",\"mem_alloc\":";
  json += std::to_string(mem_diag.alloc_count);
  json += ",\"mem_free\":";
  json += std::to_string(mem_diag.free_count);
  // Product ORC contract uses residual live (alloc-free). Some Android core
  // builds leave cheng_mm_live_count stuck at alloc while free_count advances;
  // residual is the deterministic unreclaimed count the stability gate asserts.
  {
    int64_t residual = mem_diag.alloc_count - mem_diag.free_count;
    if (residual < 0) {
      residual = 0;
    }
    int64_t live = mem_diag.live_count;
    if (live < 0) {
      live = 0;
    }
    if (mem_diag.free_count > 0 && live >= mem_diag.alloc_count && residual < live) {
      live = residual;
    }
    json += ",\"mem_live\":";
    json += std::to_string(live);
    json += ",\"mem_residual\":";
    json += std::to_string(residual);
  }
  json += ",\"text\":\"";
  json += JsonEscape(FixedCString(status.text, sizeof(status.text)));
  json += "\",\"error\":\"";
  json += JsonEscape(status_error);
  json += "\"";
  json += "}";
  CacheStatusJson(&g_last_status_json, json);
  return StringToJString(env, json);
}

extern "C" JNIEXPORT jstring JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeDnsAnswerIpForId(JNIEnv* env, jclass, jint query_id) {
  if (!LoadCore(nullptr)) {
    return StringToJString(env, "");
  }
  uint32_t answer_ip = 0;
  {
    std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
    if (g_core.tun_dns_answer_ip_for_id != nullptr) {
      answer_ip = g_core.tun_dns_answer_ip_for_id(static_cast<int32_t>(query_id));
    }
  }
  if (answer_ip == 0) {
    return StringToJString(env, "");
  }
  return StringToJString(env, Ipv4ToString(answer_ip));
}

extern "C" JNIEXPORT jstring JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeDnsAnswerIpForHost(JNIEnv* env, jclass, jstring host) {
  if (!LoadCore(nullptr)) {
    return StringToJString(env, "");
  }
  const std::string host_text = JStringToString(env, host);
  if (host_text.empty()) {
    return StringToJString(env, "");
  }
  uint32_t answer_ip = 0;
  {
    std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
    if (g_core.tun_dns_answer_ip_for_host != nullptr) {
      answer_ip = g_core.tun_dns_answer_ip_for_host(host_text.data(),
                                                    static_cast<int32_t>(host_text.size()));
    }
  }
  if (answer_ip == 0) {
    return StringToJString(env, "");
  }
  return StringToJString(env, Ipv4ToString(answer_ip));
}

extern "C" JNIEXPORT void JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeClearTcpTraceForLocalPort(JNIEnv*, jclass, jint local_port) {
  if (!LoadCore(nullptr)) {
    return;
  }
  std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
  if (g_core.tun_tcp_trace_clear_port != nullptr) {
    g_core.tun_tcp_trace_clear_port(static_cast<int32_t>(local_port));
  }
}

extern "C" JNIEXPORT void JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeClearTcpTrace(JNIEnv*, jclass) {
  if (!LoadCore(nullptr)) {
    return;
  }
  std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
  if (g_core.tun_tcp_trace_clear_all != nullptr) {
    g_core.tun_tcp_trace_clear_all();
  }
}

extern "C" JNIEXPORT jstring JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeTcpTraceForLocalPort(JNIEnv* env, jclass, jint local_port) {
  if (!LoadCore(nullptr) || local_port <= 0 || local_port > 65535) {
    return StringToJString(env, "");
  }
  uint32_t flags = 0;
  uint32_t rx_packets = 0;
  uint32_t tx_packets = 0;
  uint32_t remote_ip = 0;
  uint32_t remote_port = 0;
  uint32_t last_rx_flags = 0;
  uint32_t last_tx_flags = 0;
  uint64_t rx_payload_bytes = 0;
  uint64_t tx_payload_bytes = 0;
  uint32_t last_rx_payload_len = 0;
  uint32_t last_tx_payload_len = 0;
  uint32_t last_rx_seq = 0;
  uint32_t last_rx_ack = 0;
  uint32_t last_tx_seq = 0;
  uint32_t last_tx_ack = 0;
  {
    std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
    if (g_core.tun_tcp_trace_flags_for_port != nullptr) {
      flags = g_core.tun_tcp_trace_flags_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_rx_packets_for_port != nullptr) {
      rx_packets = g_core.tun_tcp_trace_rx_packets_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_tx_packets_for_port != nullptr) {
      tx_packets = g_core.tun_tcp_trace_tx_packets_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_remote_ip_for_port != nullptr) {
      remote_ip = g_core.tun_tcp_trace_remote_ip_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_remote_port_for_port != nullptr) {
      remote_port = g_core.tun_tcp_trace_remote_port_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_last_rx_flags_for_port != nullptr) {
      last_rx_flags = g_core.tun_tcp_trace_last_rx_flags_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_last_tx_flags_for_port != nullptr) {
      last_tx_flags = g_core.tun_tcp_trace_last_tx_flags_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_rx_payload_bytes_for_port != nullptr) {
      rx_payload_bytes = g_core.tun_tcp_trace_rx_payload_bytes_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_tx_payload_bytes_for_port != nullptr) {
      tx_payload_bytes = g_core.tun_tcp_trace_tx_payload_bytes_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_last_rx_payload_len_for_port != nullptr) {
      last_rx_payload_len = g_core.tun_tcp_trace_last_rx_payload_len_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_last_tx_payload_len_for_port != nullptr) {
      last_tx_payload_len = g_core.tun_tcp_trace_last_tx_payload_len_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_last_rx_seq_for_port != nullptr) {
      last_rx_seq = g_core.tun_tcp_trace_last_rx_seq_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_last_rx_ack_for_port != nullptr) {
      last_rx_ack = g_core.tun_tcp_trace_last_rx_ack_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_last_tx_seq_for_port != nullptr) {
      last_tx_seq = g_core.tun_tcp_trace_last_tx_seq_for_port(static_cast<int32_t>(local_port));
    }
    if (g_core.tun_tcp_trace_last_tx_ack_for_port != nullptr) {
      last_tx_ack = g_core.tun_tcp_trace_last_tx_ack_for_port(static_cast<int32_t>(local_port));
    }
  }
  if (flags == 0 && rx_packets == 0 && tx_packets == 0) {
    return StringToJString(env, "tcp_trace=none port=" + std::to_string(local_port));
  }
  std::string text = "tcp_trace=" + TcpTraceFlagText(flags);
  text += " port=" + std::to_string(local_port);
  text += " rx=" + std::to_string(rx_packets);
  text += " tx=" + std::to_string(tx_packets);
  text += " rx_bytes=" + std::to_string(rx_payload_bytes);
  text += " tx_bytes=" + std::to_string(tx_payload_bytes);
  text += " last_rx_len=" + std::to_string(last_rx_payload_len);
  text += " last_tx_len=" + std::to_string(last_tx_payload_len);
  if (remote_ip != 0 && remote_port != 0) {
    text += " remote=" + Ipv4ToString(remote_ip) + ":" + std::to_string(remote_port);
  }
  text += " last_rx=" + HexByteText(last_rx_flags);
  text += " last_tx=" + HexByteText(last_tx_flags);
  text += " last_rx_seq=" + HexWordText(last_rx_seq);
  text += " last_rx_ack=" + HexWordText(last_rx_ack);
  text += " last_tx_seq=" + HexWordText(last_tx_seq);
  text += " last_tx_ack=" + HexWordText(last_tx_ack);
  return StringToJString(env, text);
}

extern "C" JNIEXPORT jstring JNICALL
Java_org_cheng_hy2tunvpn_ChengHy2TunNative_nativeTcpTraceSummary(JNIEnv* env, jclass) {
  if (!LoadCore(nullptr)) {
    return StringToJString(env, "tcp_trace_summary core=unavailable");
  }
  constexpr int kMaxSummaryPorts = 64;
  int count = 0;
  int emitted = 0;
  std::string text = "tcp_trace_summary";
  {
    std::lock_guard<std::timed_mutex> lock(g_core_call_mutex);
    for (int port = 1; port <= 65535; ++port) {
      uint32_t flags = 0;
      uint32_t rx_packets = 0;
      uint32_t tx_packets = 0;
      if (g_core.tun_tcp_trace_flags_for_port != nullptr) {
        flags = g_core.tun_tcp_trace_flags_for_port(port);
      }
      if (g_core.tun_tcp_trace_rx_packets_for_port != nullptr) {
        rx_packets = g_core.tun_tcp_trace_rx_packets_for_port(port);
      }
      if (g_core.tun_tcp_trace_tx_packets_for_port != nullptr) {
        tx_packets = g_core.tun_tcp_trace_tx_packets_for_port(port);
      }
      if (flags == 0 && rx_packets == 0 && tx_packets == 0) {
        continue;
      }
      ++count;
      if (emitted >= kMaxSummaryPorts) {
        continue;
      }
      uint32_t remote_ip = 0;
      uint32_t remote_port = 0;
      uint32_t last_rx_flags = 0;
      uint32_t last_tx_flags = 0;
      uint64_t rx_payload_bytes = 0;
      uint64_t tx_payload_bytes = 0;
      uint32_t last_rx_payload_len = 0;
      uint32_t last_tx_payload_len = 0;
      uint32_t last_rx_seq = 0;
      uint32_t last_rx_ack = 0;
      uint32_t last_tx_seq = 0;
      uint32_t last_tx_ack = 0;
      if (g_core.tun_tcp_trace_remote_ip_for_port != nullptr) {
        remote_ip = g_core.tun_tcp_trace_remote_ip_for_port(port);
      }
      if (g_core.tun_tcp_trace_remote_port_for_port != nullptr) {
        remote_port = g_core.tun_tcp_trace_remote_port_for_port(port);
      }
      if (g_core.tun_tcp_trace_last_rx_flags_for_port != nullptr) {
        last_rx_flags = g_core.tun_tcp_trace_last_rx_flags_for_port(port);
      }
      if (g_core.tun_tcp_trace_last_tx_flags_for_port != nullptr) {
        last_tx_flags = g_core.tun_tcp_trace_last_tx_flags_for_port(port);
      }
      if (g_core.tun_tcp_trace_rx_payload_bytes_for_port != nullptr) {
        rx_payload_bytes = g_core.tun_tcp_trace_rx_payload_bytes_for_port(port);
      }
      if (g_core.tun_tcp_trace_tx_payload_bytes_for_port != nullptr) {
        tx_payload_bytes = g_core.tun_tcp_trace_tx_payload_bytes_for_port(port);
      }
      if (g_core.tun_tcp_trace_last_rx_payload_len_for_port != nullptr) {
        last_rx_payload_len = g_core.tun_tcp_trace_last_rx_payload_len_for_port(port);
      }
      if (g_core.tun_tcp_trace_last_tx_payload_len_for_port != nullptr) {
        last_tx_payload_len = g_core.tun_tcp_trace_last_tx_payload_len_for_port(port);
      }
      if (g_core.tun_tcp_trace_last_rx_seq_for_port != nullptr) {
        last_rx_seq = g_core.tun_tcp_trace_last_rx_seq_for_port(port);
      }
      if (g_core.tun_tcp_trace_last_rx_ack_for_port != nullptr) {
        last_rx_ack = g_core.tun_tcp_trace_last_rx_ack_for_port(port);
      }
      if (g_core.tun_tcp_trace_last_tx_seq_for_port != nullptr) {
        last_tx_seq = g_core.tun_tcp_trace_last_tx_seq_for_port(port);
      }
      if (g_core.tun_tcp_trace_last_tx_ack_for_port != nullptr) {
        last_tx_ack = g_core.tun_tcp_trace_last_tx_ack_for_port(port);
      }
      text += " port=" + std::to_string(port);
      text += " trace=" + TcpTraceFlagText(flags);
      text += " rx=" + std::to_string(rx_packets);
      text += " tx=" + std::to_string(tx_packets);
      text += " rx_bytes=" + std::to_string(rx_payload_bytes);
      text += " tx_bytes=" + std::to_string(tx_payload_bytes);
      text += " last_rx_len=" + std::to_string(last_rx_payload_len);
      text += " last_tx_len=" + std::to_string(last_tx_payload_len);
      if (remote_ip != 0 && remote_port != 0) {
        text += " remote=" + Ipv4ToString(remote_ip) + ":" + std::to_string(remote_port);
      }
      text += " last_rx=" + HexByteText(last_rx_flags);
      text += " last_tx=" + HexByteText(last_tx_flags);
      text += " last_rx_seq=" + HexWordText(last_rx_seq);
      text += " last_rx_ack=" + HexWordText(last_rx_ack);
      text += " last_tx_seq=" + HexWordText(last_tx_seq);
      text += " last_tx_ack=" + HexWordText(last_tx_ack);
      ++emitted;
    }
  }
  text += " count=" + std::to_string(count);
  text += " emitted=" + std::to_string(emitted);
  text += " more=" + std::to_string(count > emitted ? 1 : 0);
  return StringToJString(env, text);
}
