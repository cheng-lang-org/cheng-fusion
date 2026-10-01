#include "cheng_hy2_tun_core_bridge.h"

#include <arpa/inet.h>
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <hilog/log.h>
#include <napi/native_api.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

// SABI v2 emit accumulators. The Cheng core pushes start/status/snapshot
// results into these slots by calling the emit callbacks below synchronously
// from within the @exportc entry it is invoked through, on the SAME thread as
// the caller. The thread_local storage therefore keeps each in-flight call's
// result isolated and race-free: reset the slot before the core call, read it
// after the call returns.
namespace cheng_hy2_emit {

struct StartEmitSlot {
  bool received = false;
  uint64_t session_id = 0;
  int32_t connected = 0;
  int32_t listen_port = 0;
  std::string error;
};

struct StatusEmitSlot {
  bool received = false;
  int32_t abi_version = 0;
  uint64_t session_id = 0;
  int32_t connected = 0;
  uint64_t rx_bytes = 0;
  uint64_t tx_bytes = 0;
  std::string text;
  std::string error;
};

struct SnapshotEmitSlot {
  bool received = false;
  std::string json;
};

thread_local StartEmitSlot t_start_emit;
thread_local StatusEmitSlot t_status_emit;
thread_local SnapshotEmitSlot t_snapshot_emit;

}  // namespace cheng_hy2_emit

// emit callbacks: DEFINED here, called by the Cheng core (@importc). Text args
// are utf8_view (ptr + int64_t len), NOT NUL-terminated — copy exactly len
// bytes, never strlen.
extern "C" int32_t cheng_hy2_tun_start_emit(uint64_t session_id,
                                            int32_t connected,
                                            const char* error_text,
                                            int64_t error_text_len) {
  auto& slot = cheng_hy2_emit::t_start_emit;
  slot.received = true;
  slot.session_id = session_id;
  slot.connected = connected;
  slot.listen_port = 0;
  if (error_text != nullptr && error_text_len > 0) {
    slot.error.assign(error_text, static_cast<size_t>(error_text_len));
  } else {
    slot.error.clear();
  }
  return 0;
}

extern "C" int32_t cheng_hy2_proxy_start_emit(uint64_t session_id,
                                              int32_t connected,
                                              int32_t listen_port,
                                              const char* error_text,
                                              int64_t error_text_len) {
  auto& slot = cheng_hy2_emit::t_start_emit;
  slot.received = true;
  slot.session_id = session_id;
  slot.connected = connected;
  slot.listen_port = listen_port;
  if (error_text != nullptr && error_text_len > 0) {
    slot.error.assign(error_text, static_cast<size_t>(error_text_len));
  } else {
    slot.error.clear();
  }
  return 0;
}

extern "C" int32_t cheng_hy2_tun_status_emit(int32_t abi_version,
                                             uint64_t session_id,
                                             int32_t connected,
                                             uint64_t rx_bytes,
                                             uint64_t tx_bytes,
                                             const char* status_text,
                                             int64_t status_text_len,
                                             const char* error_text,
                                             int64_t error_text_len) {
  auto& slot = cheng_hy2_emit::t_status_emit;
  slot.received = true;
  slot.abi_version = abi_version;
  slot.session_id = session_id;
  slot.connected = connected;
  slot.rx_bytes = rx_bytes;
  slot.tx_bytes = tx_bytes;
  if (status_text != nullptr && status_text_len > 0) {
    slot.text.assign(status_text, static_cast<size_t>(status_text_len));
  } else {
    slot.text.clear();
  }
  if (error_text != nullptr && error_text_len > 0) {
    slot.error.assign(error_text, static_cast<size_t>(error_text_len));
  } else {
    slot.error.clear();
  }
  return 0;
}

extern "C" int32_t cheng_hy2_tun_snapshot_emit(const char* json, int64_t json_len) {
  auto& slot = cheng_hy2_emit::t_snapshot_emit;
  slot.received = true;
  if (json != nullptr && json_len > 0) {
    slot.json.assign(json, static_cast<size_t>(json_len));
  } else {
    slot.json.clear();
  }
  return 0;
}

extern "C" {
extern int32_t cheng_hy2_tun_core_set_config(
    const char *config_json, int64_t config_json_len,
    const char *config_path, int64_t config_path_len);
extern int32_t cheng_hy2_tun_core_set_identity(
    const uint8_t *cert_der, int64_t cert_der_len,
    const uint8_t *key_pk8_der, int64_t key_pk8_der_len,
    const uint8_t *trust_root_der, int64_t trust_root_der_len);
extern int32_t cheng_hy2_tun_core_start(
    uint32_t abi_version, int32_t tun_fd);
extern int32_t cheng_hy2_tun_core_stop(uint64_t session_id);
extern int32_t cheng_hy2_tun_core_status(uint64_t session_id);
extern int32_t cheng_hy2_tun_core_mem_diag(uint32_t abi_version);
extern int32_t cheng_hy2_tun_last_mem_diag(ChengHy2TunCoreMemDiag *out);
extern int32_t cheng_hy2_tun_mobile_gui_snapshot_json(
    const char *platform, int64_t platform_len,
    const char *config_path, int64_t config_path_len);
extern int32_t cheng_hy2_tun_core_set_protect_callback(
    cheng_hy2_tun_protect_fd_fn protect_fd, void *protect_user_data);
extern int32_t cheng_hy2_tun_core_set_tcp_connect4_callback(
    cheng_hy2_tun_tcp_connect4_fn connect_tcp4, void *connect_user_data);
}

namespace {

constexpr const char* kNativeModuleName = "cheng_hy2_tun_vpn";
constexpr const char* kCoreLibraryName = "libcheng_hy2_tun_core.so";

enum class RuntimeState {
  Disconnected,
  Starting,
  Connected,
  Stopping,
  Error
};

struct CoreSymbols {
  void* handle = nullptr;
  cheng_hy2_tun_core_set_config_fn set_config = nullptr;
  cheng_hy2_tun_core_set_identity_fn set_identity = nullptr;
  cheng_hy2_tun_core_start_fn start = nullptr;
  cheng_hy2_tun_core_stop_fn stop = nullptr;
  cheng_hy2_tun_core_status_fn status = nullptr;
  cheng_hy2_tun_core_mem_diag_fn mem_diag = nullptr;
  int32_t (*last_mem_diag)(ChengHy2TunCoreMemDiag *out) = nullptr;
  cheng_hy2_tun_mobile_gui_snapshot_json_fn gui_snapshot_json = nullptr;
  cheng_hy2_tun_core_set_protect_callback_fn set_protect_callback = nullptr;
  cheng_hy2_tun_core_set_tcp_connect4_callback_fn set_tcp_connect4_callback = nullptr;
  std::string error;
};

struct RuntimeStatus {
  RuntimeState state = RuntimeState::Disconnected;
  uint64_t session_id = 0;
  int32_t tun_fd = -1;
  uint64_t rx_bytes = 0;
  uint64_t tx_bytes = 0;
  std::string text;
  std::string last_error;
};

struct ProtectWaiter {
  uint64_t token = 0;
  int32_t fd = -1;
  bool done = false;
  bool allowed = false;
  std::mutex mutex;
  std::condition_variable cv;
};

struct ProtectEvent {
  uint64_t token = 0;
  int32_t fd = -1;
};

struct ProtectContext {
  napi_threadsafe_function tsfn = nullptr;
  uint32_t timeout_ms = 15000;
};

struct StartContext {
  napi_env env = nullptr;
  napi_async_work work = nullptr;
  napi_deferred deferred = nullptr;
  napi_threadsafe_function tsfn = nullptr;
  std::string config_json;
  std::string config_path;
  std::vector<uint8_t> cert_der;
  std::vector<uint8_t> key_pk8_der;
  std::vector<uint8_t> trust_root_der;
  int32_t tun_fd = -1;
  uint32_t protect_timeout_ms = 15000;
  uint64_t generation = 0;
  uint64_t session_id = 0;
  bool success = false;
  std::string error;
};

struct StopContext {
  napi_env env = nullptr;
  napi_async_work work = nullptr;
  napi_deferred deferred = nullptr;
  uint64_t session_id = 0;
  uint64_t generation = 0;
  bool success = false;
  std::string error;
};

std::mutex g_core_mutex;
CoreSymbols g_core;

std::mutex g_status_mutex;
RuntimeStatus g_status;
std::atomic<uint64_t> g_generation{0};

std::atomic<uint64_t> g_next_protect_token{1};
std::mutex g_protect_mutex;
std::map<uint64_t, std::shared_ptr<ProtectWaiter>> g_protect_waiters;
std::mutex g_protect_context_mutex;
ProtectContext g_protect_context;

const char* StateName(RuntimeState state) {
  switch (state) {
    case RuntimeState::Disconnected:
      return "disconnected";
    case RuntimeState::Starting:
      return "starting";
    case RuntimeState::Connected:
      return "connected";
    case RuntimeState::Stopping:
      return "stopping";
    case RuntimeState::Error:
      return "error";
  }
  return "error";
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

void SetErrorStatus(const std::string& error) {
  std::lock_guard<std::mutex> lock(g_status_mutex);
  g_status.state = RuntimeState::Error;
  g_status.session_id = 0;
  g_status.tun_fd = -1;
  g_status.last_error = RedactSecrets(error);
}

void SetDisconnectedStatus() {
  std::lock_guard<std::mutex> lock(g_status_mutex);
  g_status.state = RuntimeState::Disconnected;
  g_status.session_id = 0;
  g_status.tun_fd = -1;
  g_status.rx_bytes = 0;
  g_status.tx_bytes = 0;
  g_status.text.clear();
  g_status.last_error.clear();
}

void InstallProtectContext(napi_threadsafe_function tsfn, uint32_t timeout_ms) {
  std::lock_guard<std::mutex> lock(g_protect_context_mutex);
  g_protect_context.tsfn = tsfn;
  g_protect_context.timeout_ms = timeout_ms;
}

void ReleaseProtectContext(napi_threadsafe_function expected) {
  napi_threadsafe_function tsfn = nullptr;
  {
    std::lock_guard<std::mutex> lock(g_protect_context_mutex);
    if (g_protect_context.tsfn == nullptr) {
      return;
    }
    if (expected != nullptr && g_protect_context.tsfn != expected) {
      return;
    }
    tsfn = g_protect_context.tsfn;
    g_protect_context.tsfn = nullptr;
  }
  napi_release_threadsafe_function(tsfn, napi_tsfn_release);
}

bool LoadCoreLocked() {
  if (g_core.handle != nullptr) {
    return true;
  }
  g_core.error.clear();
  g_core.handle = reinterpret_cast<void*>(1);
  g_core.set_config = cheng_hy2_tun_core_set_config;
  g_core.set_identity = cheng_hy2_tun_core_set_identity;
  g_core.start = cheng_hy2_tun_core_start;
  g_core.stop = cheng_hy2_tun_core_stop;
  g_core.status = cheng_hy2_tun_core_status;
  g_core.mem_diag = cheng_hy2_tun_core_mem_diag;
  g_core.last_mem_diag = cheng_hy2_tun_last_mem_diag;
  g_core.gui_snapshot_json = cheng_hy2_tun_mobile_gui_snapshot_json;
  g_core.set_protect_callback = cheng_hy2_tun_core_set_protect_callback;
  g_core.set_tcp_connect4_callback = cheng_hy2_tun_core_set_tcp_connect4_callback;
  return true;
}

bool LoadCore(std::string* error) {
  std::lock_guard<std::mutex> lock(g_core_mutex);
  if (LoadCoreLocked()) {
    return true;
  }
  if (error != nullptr) {
    *error = g_core.error;
  }
  return false;
}

std::string GetStringProperty(napi_env env, napi_value object, const char* name) {
  napi_value value = nullptr;
  bool has_property = false;
  napi_status status = napi_has_named_property(env, object, name, &has_property);
  if (status != napi_ok || !has_property) {
    return std::string();
  }
  status = napi_get_named_property(env, object, name, &value);
  if (status != napi_ok || value == nullptr) {
    return std::string();
  }
  size_t size = 0;
  status = napi_get_value_string_utf8(env, value, nullptr, 0, &size);
  if (status != napi_ok) {
    return std::string();
  }
  std::string out(size + 1, '\0');
  size_t copied = 0;
  status = napi_get_value_string_utf8(env, value, out.data(), out.size(), &copied);
  if (status != napi_ok) {
    return std::string();
  }
  out.resize(copied);
  return out;
}

int32_t GetInt32Property(napi_env env, napi_value object, const char* name, int32_t default_value) {
  napi_value value = nullptr;
  bool has_property = false;
  napi_status status = napi_has_named_property(env, object, name, &has_property);
  if (status != napi_ok || !has_property) {
    return default_value;
  }
  status = napi_get_named_property(env, object, name, &value);
  if (status != napi_ok || value == nullptr) {
    return default_value;
  }
  int32_t out = default_value;
  status = napi_get_value_int32(env, value, &out);
  if (status != napi_ok) {
    return default_value;
  }
  return out;
}

bool GetUint8ArrayProperty(napi_env env, napi_value object, const char* name, std::vector<uint8_t>* out) {
  napi_value value = nullptr;
  bool has_property = false;
  napi_status status = napi_has_named_property(env, object, name, &has_property);
  if (status != napi_ok || !has_property) {
    return false;
  }
  status = napi_get_named_property(env, object, name, &value);
  if (status != napi_ok || value == nullptr) {
    return false;
  }
  bool is_typed_array = false;
  status = napi_is_typedarray(env, value, &is_typed_array);
  if (status != napi_ok || !is_typed_array) {
    return false;
  }
  napi_typedarray_type type = napi_int8_array;
  size_t length = 0;
  void* data = nullptr;
  napi_value array_buffer = nullptr;
  size_t byte_offset = 0;
  status = napi_get_typedarray_info(env, value, &type, &length, &data, &array_buffer, &byte_offset);
  if (status != napi_ok || type != napi_uint8_array || data == nullptr || length == 0) {
    return false;
  }
  auto* bytes = static_cast<uint8_t*>(data);
  out->assign(bytes, bytes + length);
  return true;
}

napi_value MakeBool(napi_env env, bool value) {
  napi_value out = nullptr;
  napi_get_boolean(env, value, &out);
  return out;
}

napi_value MakeString(napi_env env, const std::string& value) {
  napi_value out = nullptr;
  napi_create_string_utf8(env, value.c_str(), value.size(), &out);
  return out;
}

void SetNamedString(napi_env env, napi_value object, const char* name, const std::string& value) {
  napi_set_named_property(env, object, name, MakeString(env, value));
}

void SetNamedBool(napi_env env, napi_value object, const char* name, bool value) {
  napi_set_named_property(env, object, name, MakeBool(env, value));
}

void SetNamedInt32(napi_env env, napi_value object, const char* name, int32_t value) {
  napi_value out = nullptr;
  napi_create_int32(env, value, &out);
  napi_set_named_property(env, object, name, out);
}

void SetNamedUint64(napi_env env, napi_value object, const char* name, uint64_t value) {
  napi_value out = nullptr;
  napi_create_double(env, static_cast<double>(value), &out);
  napi_set_named_property(env, object, name, out);
}

void Reject(napi_env env, napi_deferred deferred, const std::string& message) {
  napi_value err = nullptr;
  napi_create_string_utf8(env, message.c_str(), message.size(), &err);
  napi_reject_deferred(env, deferred, err);
}

void CallProtectJs(napi_env env, napi_value js_cb, void* context, void* data) {
  (void)context;
  std::unique_ptr<ProtectEvent> event(static_cast<ProtectEvent*>(data));
  if (env == nullptr || js_cb == nullptr || event == nullptr) {
    return;
  }
  napi_value global = nullptr;
  napi_value argv[2] = {nullptr, nullptr};
  napi_get_global(env, &global);
  napi_create_double(env, static_cast<double>(event->token), &argv[0]);
  napi_create_int32(env, event->fd, &argv[1]);
  napi_value result = nullptr;
  napi_status status = napi_call_function(env, global, js_cb, 2, argv, &result);
  if (status != napi_ok) {
    OH_LOG_ERROR(LOG_APP, "protect callback dispatch failed");
  }
}

int32_t ProtectFd(void* user_data, int32_t fd) {
  auto* protect_context = static_cast<ProtectContext*>(user_data);
  napi_threadsafe_function tsfn = nullptr;
  uint32_t timeout_ms = 0;
  {
    std::lock_guard<std::mutex> lock(g_protect_context_mutex);
    if (protect_context == nullptr || protect_context->tsfn == nullptr || fd < 0) {
      return -1;
    }
    tsfn = protect_context->tsfn;
    timeout_ms = protect_context->timeout_ms;
  }
  if (tsfn == nullptr || timeout_ms == 0) {
    return -1;
  }
  auto waiter = std::make_shared<ProtectWaiter>();
  waiter->token = g_next_protect_token.fetch_add(1);
  waiter->fd = fd;
  {
    std::lock_guard<std::mutex> lock(g_protect_mutex);
    g_protect_waiters[waiter->token] = waiter;
  }
  auto* event = new ProtectEvent();
  event->token = waiter->token;
  event->fd = fd;
  napi_status call_status = napi_call_threadsafe_function(tsfn, event, napi_tsfn_blocking);
  if (call_status != napi_ok) {
    delete event;
    std::lock_guard<std::mutex> lock(g_protect_mutex);
    g_protect_waiters.erase(waiter->token);
    return -1;
  }
  std::unique_lock<std::mutex> wait_lock(waiter->mutex);
  bool completed = waiter->cv.wait_for(wait_lock,
                                       std::chrono::milliseconds(timeout_ms),
                                       [&waiter]() { return waiter->done; });
  {
    std::lock_guard<std::mutex> lock(g_protect_mutex);
    g_protect_waiters.erase(waiter->token);
  }
  if (!completed || !waiter->allowed) {
    return 0;
  }
  return 1;
}

int32_t ProtectedTcpConnect4(void* user_data,
                             int32_t b0,
                             int32_t b1,
                             int32_t b2,
                             int32_t b3,
                             int32_t port,
                             int32_t timeout_ms) {
  if (b0 < 0 || b0 > 255 || b1 < 0 || b1 > 255 ||
      b2 < 0 || b2 > 255 || b3 < 0 || b3 > 255 ||
      port <= 0 || port > 65535) {
    return -EINVAL;
  }
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) {
    return -errno;
  }
  if (ProtectFd(user_data, fd) != 1) {
    const int saved_errno = errno == 0 ? EACCES : errno;
    close(fd);
    return -saved_errno;
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

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<uint16_t>(port));
  uint8_t* dst = reinterpret_cast<uint8_t*>(&addr.sin_addr.s_addr);
  dst[0] = static_cast<uint8_t>(b0);
  dst[1] = static_cast<uint8_t>(b1);
  dst[2] = static_cast<uint8_t>(b2);
  dst[3] = static_cast<uint8_t>(b3);

  int rc = 0;
  do {
    rc = connect(fd, reinterpret_cast<const sockaddr*>(&addr), static_cast<socklen_t>(sizeof(addr)));
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

  const auto deadline = std::chrono::steady_clock::now() +
      std::chrono::milliseconds(timeout_ms > 0 ? timeout_ms : 0);
  for (;;) {
    int poll_timeout = 0;
    if (timeout_ms > 0) {
      const auto now = std::chrono::steady_clock::now();
      if (now >= deadline) {
        close(fd);
        return -ETIMEDOUT;
      }
      const auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - now).count();
      poll_timeout = static_cast<int>(remaining < 100 ? remaining : 100);
      if (poll_timeout <= 0) {
        poll_timeout = 1;
      }
    }

    pollfd pfd{};
    pfd.fd = fd;
    pfd.events = POLLOUT;
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
      OH_LOG_INFO(LOG_APP,
                  "tcp_connect4 failed %{public}d.%{public}d.%{public}d.%{public}d:%{public}d error=%{public}d revents=%{public}d",
                  b0,
                  b1,
                  b2,
                  b3,
                  port,
                  socket_error,
                  static_cast<int>(pfd.revents));
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

napi_value NapiCoreAvailable(napi_env env, napi_callback_info info) {
  (void)info;
  std::string error;
  return MakeBool(env, LoadCore(&error));
}

napi_value NapiCompleteProtect(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = {nullptr, nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 2) {
    return MakeBool(env, false);
  }
  int64_t token_raw = 0;
  bool allowed = false;
  if (napi_get_value_int64(env, argv[0], &token_raw) != napi_ok ||
      napi_get_value_bool(env, argv[1], &allowed) != napi_ok ||
      token_raw <= 0) {
    return MakeBool(env, false);
  }
  std::shared_ptr<ProtectWaiter> waiter;
  {
    std::lock_guard<std::mutex> lock(g_protect_mutex);
    auto it = g_protect_waiters.find(static_cast<uint64_t>(token_raw));
    if (it == g_protect_waiters.end()) {
      return MakeBool(env, false);
    }
    waiter = it->second;
  }
  {
    std::lock_guard<std::mutex> wait_lock(waiter->mutex);
    waiter->allowed = allowed;
    waiter->done = true;
  }
  waiter->cv.notify_one();
  return MakeBool(env, true);
}

const uint8_t* BytesData(const std::vector<uint8_t>& value) {
  return value.empty() ? nullptr : value.data();
}

void ExecuteStart(napi_env env, void* data) {
  (void)env;
  auto* context = static_cast<StartContext*>(data);
  std::string error;
  if (!LoadCore(&error)) {
    context->error = "native Cheng hy2-tun core unavailable: " + error;
    return;
  }
  int32_t protect_rc = g_core.set_protect_callback(ProtectFd, &g_protect_context);
  if (protect_rc != 0) {
    context->error = "cheng_hy2_tun_core_set_protect_callback failed";
    return;
  }
  int32_t connect_rc = g_core.set_tcp_connect4_callback(ProtectedTcpConnect4, &g_protect_context);
  if (connect_rc != 0) {
    context->error = "cheng_hy2_tun_core_set_tcp_connect4_callback failed";
    return;
  }
  int32_t rc = g_core.set_config(
      context->config_json.data(),
      static_cast<int64_t>(context->config_json.size()),
      context->config_path.data(),
      static_cast<int64_t>(context->config_path.size()));
  if (rc == 0) {
    rc = g_core.set_identity(
      BytesData(context->cert_der),
      static_cast<int64_t>(context->cert_der.size()),
      BytesData(context->key_pk8_der),
      static_cast<int64_t>(context->key_pk8_der.size()),
      BytesData(context->trust_root_der),
      static_cast<int64_t>(context->trust_root_der.size()));
  }
  uint64_t emit_session_id = 0;
  int32_t emit_connected = 0;
  std::string emit_error;
  if (rc == 0) {
    cheng_hy2_emit::t_start_emit = cheng_hy2_emit::StartEmitSlot{};
    rc = g_core.start(CHENG_HY2_TUN_CORE_ABI_VERSION, context->tun_fd);
    emit_session_id = cheng_hy2_emit::t_start_emit.session_id;
    emit_connected = cheng_hy2_emit::t_start_emit.connected;
    emit_error = cheng_hy2_emit::t_start_emit.error;
  }
  if (rc != 0 || emit_connected == 0 || emit_session_id == 0) {
    context->error = RedactSecrets(!emit_error.empty() ? emit_error : "cheng_hy2_tun_core_start failed");
    OH_LOG_ERROR(LOG_APP, "core start failed rc=%{public}d connected=%{public}d err=%{public}s",
                 rc, emit_connected, context->error.c_str());
    FILE* diag = fopen("/data/storage/el2/base/haps/entry/files/cheng-hy2-tun/start_diag.txt", "a");
    if (diag != nullptr) {
      fprintf(diag, "start-failed rc=%d connected=%d tunFd=%d err=%s\n", rc, emit_connected, context->tun_fd, context->error.c_str());
      fclose(diag);
    }
    return;
  }
  OH_LOG_ERROR(LOG_APP, "core start accepted session=%{public}llu tunFd=%{public}d",
              (unsigned long long) emit_session_id, context->tun_fd);
  {
    FILE* diag = fopen("/data/storage/el2/base/haps/entry/files/cheng-hy2-tun/start_diag.txt", "a");
    if (diag != nullptr) {
      fprintf(diag, "start-accepted session=%llu tunFd=%d\n", (unsigned long long) emit_session_id, context->tun_fd);
      fclose(diag);
    }
  }
  context->session_id = emit_session_id;
  context->success = true;
}

void CompleteStart(napi_env env, napi_status status, void* data) {
  auto* context = static_cast<StartContext*>(data);
  const bool active_generation = context->generation == g_generation.load();
  if (status == napi_ok && context->success && active_generation) {
    context->tsfn = nullptr;
    {
      std::lock_guard<std::mutex> lock(g_status_mutex);
      g_status.state = RuntimeState::Connected;
      g_status.session_id = context->session_id;
      g_status.tun_fd = context->tun_fd;
      g_status.last_error.clear();
      g_status.text = "connected";
    }
    napi_value out = nullptr;
    napi_create_object(env, &out);
    SetNamedBool(env, out, "connected", true);
    SetNamedUint64(env, out, "sessionId", context->session_id);
    SetNamedInt32(env, out, "tunFd", context->tun_fd);
    napi_resolve_deferred(env, context->deferred, out);
  } else if (status == napi_ok && context->success && !active_generation) {
    if (context->session_id != 0) {
      std::string ignored_error;
      if (LoadCore(&ignored_error)) {
        g_core.stop(context->session_id);
      }
    }
    ReleaseProtectContext(context->tsfn);
    context->tsfn = nullptr;
    SetDisconnectedStatus();
    Reject(env, context->deferred, "native start cancelled by stop request");
  } else {
    std::string error = context->error.empty() ? "native start failed" : context->error;
    ReleaseProtectContext(context->tsfn);
    context->tsfn = nullptr;
    SetErrorStatus(error);
    Reject(env, context->deferred, error);
  }
  napi_delete_async_work(env, context->work);
  delete context;
}

napi_value NapiStart(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = {nullptr, nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 2) {
    napi_value promise = nullptr;
    napi_deferred deferred = nullptr;
    napi_create_promise(env, &deferred, &promise);
    Reject(env, deferred, "start requires request and protect handler");
    return promise;
  }
  napi_valuetype callback_type = napi_undefined;
  napi_typeof(env, argv[1], &callback_type);
  if (callback_type != napi_function) {
    napi_value promise = nullptr;
    napi_deferred deferred = nullptr;
    napi_create_promise(env, &deferred, &promise);
    Reject(env, deferred, "protect handler must be a function");
    return promise;
  }
  auto* context = new StartContext();
  context->env = env;
  context->config_json = GetStringProperty(env, argv[0], "configJson");
  context->config_path = GetStringProperty(env, argv[0], "configPath");
  bool has_cert_der = GetUint8ArrayProperty(env, argv[0], "certDer", &context->cert_der);
  bool has_key_pk8_der = GetUint8ArrayProperty(env, argv[0], "keyPk8Der", &context->key_pk8_der);
  bool has_trust_root_der = GetUint8ArrayProperty(env, argv[0], "trustRootDer", &context->trust_root_der);
  context->tun_fd = GetInt32Property(env, argv[0], "tunFd", -1);
  context->protect_timeout_ms = static_cast<uint32_t>(GetInt32Property(env, argv[0], "protectTimeoutMs", 15000));
  napi_value promise = nullptr;
  napi_create_promise(env, &context->deferred, &promise);
  if (context->config_json.empty()) {
    Reject(env, context->deferred, "configJson missing in native start request");
    delete context;
    return promise;
  }
  if (context->config_path.empty()) {
    Reject(env, context->deferred, "configPath missing in native start request");
    delete context;
    return promise;
  }
  if (!has_cert_der || !has_key_pk8_der || !has_trust_root_der) {
    Reject(env, context->deferred, "identity bytes missing in native start request");
    delete context;
    return promise;
  }
  if (context->tun_fd < 0 || context->protect_timeout_ms == 0) {
    Reject(env, context->deferred, "invalid fd or protect timeout in native start request");
    delete context;
    return promise;
  }
  {
    std::lock_guard<std::mutex> lock(g_status_mutex);
    if (g_status.state == RuntimeState::Starting || g_status.state == RuntimeState::Connected ||
        g_status.state == RuntimeState::Stopping) {
      Reject(env, context->deferred, "hy2-tun native session already active");
      delete context;
      return promise;
    }
    context->generation = g_generation.fetch_add(1) + 1;
    g_status.state = RuntimeState::Starting;
    g_status.tun_fd = context->tun_fd;
    g_status.last_error.clear();
  }
  napi_value resource_name = nullptr;
  napi_create_string_utf8(env, "ChengHy2TunStart", NAPI_AUTO_LENGTH, &resource_name);
  napi_status tsfn_status = napi_create_threadsafe_function(env,
                                                           argv[1],
                                                           nullptr,
                                                           resource_name,
                                                           0,
                                                           1,
                                                           nullptr,
                                                           nullptr,
                                                           nullptr,
                                                           CallProtectJs,
                                                           &context->tsfn);
  if (tsfn_status != napi_ok) {
    SetErrorStatus("failed to create protect callback bridge");
    Reject(env, context->deferred, "failed to create protect callback bridge");
    delete context;
    return promise;
  }
  InstallProtectContext(context->tsfn, context->protect_timeout_ms);
  napi_create_string_utf8(env, "ChengHy2TunStartWork", NAPI_AUTO_LENGTH, &resource_name);
  napi_create_async_work(env, nullptr, resource_name, ExecuteStart, CompleteStart, context, &context->work);
  napi_queue_async_work(env, context->work);
  return promise;
}

void ExecuteStop(napi_env env, void* data) {
  (void)env;
  auto* context = static_cast<StopContext*>(data);
  if (context->session_id == 0) {
    context->success = true;
    return;
  }
  std::string error;
  if (!LoadCore(&error)) {
    context->error = "native Cheng hy2-tun core unavailable: " + error;
    return;
  }
  int32_t rc = g_core.stop(context->session_id);
  if (rc != 0) {
    context->error = "cheng_hy2_tun_core_stop failed";
    return;
  }
  context->success = true;
}

void CompleteStop(napi_env env, napi_status status, void* data) {
  auto* context = static_cast<StopContext*>(data);
  ReleaseProtectContext(nullptr);
  if (status == napi_ok && context->success) {
    SetDisconnectedStatus();
    napi_value out = nullptr;
    napi_create_object(env, &out);
    SetNamedBool(env, out, "stopped", true);
    napi_resolve_deferred(env, context->deferred, out);
  } else {
    std::string error = context->error.empty() ? "native stop failed" : context->error;
    SetErrorStatus(error);
    Reject(env, context->deferred, error);
  }
  napi_delete_async_work(env, context->work);
  delete context;
}

napi_value NapiStop(napi_env env, napi_callback_info info) {
  (void)info;
  auto* context = new StopContext();
  context->env = env;
  napi_value promise = nullptr;
  napi_create_promise(env, &context->deferred, &promise);
  {
    std::lock_guard<std::mutex> lock(g_status_mutex);
    context->session_id = g_status.session_id;
    context->generation = g_generation.fetch_add(1) + 1;
    g_status.state = RuntimeState::Stopping;
  }
  napi_value resource_name = nullptr;
  napi_create_string_utf8(env, "ChengHy2TunStopWork", NAPI_AUTO_LENGTH, &resource_name);
  napi_create_async_work(env, nullptr, resource_name, ExecuteStop, CompleteStop, context, &context->work);
  napi_queue_async_work(env, context->work);
  return promise;
}

napi_value NapiGuiSnapshot(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  const std::string platform = argc >= 1 ? GetStringProperty(env, argv[0], "platform") : std::string();
  const std::string config_path = argc >= 1 ? GetStringProperty(env, argv[0], "configPath") : std::string();
  std::string error;
  if (!LoadCore(&error)) {
    return MakeString(env, "{\"format\":\"cheng_hy2_tun_mobile_gui_error\",\"error\":\"core unavailable\"}");
  }
  std::string rendered;
  int32_t rc = -1;
  {
    std::lock_guard<std::mutex> lock(g_core_mutex);
    cheng_hy2_emit::t_snapshot_emit = cheng_hy2_emit::SnapshotEmitSlot{};
    rc = g_core.gui_snapshot_json(
        platform.data(),
        static_cast<int64_t>(platform.size()),
        config_path.data(),
        static_cast<int64_t>(config_path.size()));
    if (rc == 0 && cheng_hy2_emit::t_snapshot_emit.received) {
      rendered = cheng_hy2_emit::t_snapshot_emit.json;
    }
  }
  if (rc != 0 || rendered.empty()) {
    FILE* diag = fopen("/data/storage/el2/base/haps/entry/files/cheng-hy2-tun/gui_snapshot_last.json", "w");
    if (diag != nullptr) {
      fputs("{\"snapshot\":\"failed\",\"rc\":0}", diag);
      fclose(diag);
    }
    return MakeString(env, "{\"format\":\"cheng_hy2_tun_mobile_gui_error\",\"error\":\"snapshot failed\"}");
  }
  {
    // Debug diagnostics: persist the latest GUI snapshot (includes native
    // worker state and lastError) so it stays readable over hdc even when
    // hilog drops this app's native logs.
    FILE* diag = fopen("/data/storage/el2/base/haps/entry/files/cheng-hy2-tun/gui_snapshot_last.json", "w");
    if (diag != nullptr) {
      fputs(rendered.c_str(), diag);
      fputc('\n', diag);
      fclose(diag);
    }
  }
  return MakeString(env, rendered);
}

napi_value NapiStatus(napi_env env, napi_callback_info info) {
  (void)info;
  RuntimeStatus snapshot;
  {
    std::lock_guard<std::mutex> lock(g_status_mutex);
    snapshot = g_status;
  }
  bool core_available = false;
  std::string core_error;
  {
    std::lock_guard<std::mutex> lock(g_core_mutex);
    core_available = LoadCoreLocked();
    core_error = g_core.error;
  }
  if (snapshot.session_id != 0 && core_available) {
    cheng_hy2_emit::t_status_emit = cheng_hy2_emit::StatusEmitSlot{};
    if (g_core.status(snapshot.session_id) == 0 && cheng_hy2_emit::t_status_emit.received) {
      const auto& core_status = cheng_hy2_emit::t_status_emit;
      snapshot.rx_bytes = core_status.rx_bytes;
      snapshot.tx_bytes = core_status.tx_bytes;
      snapshot.text = core_status.text;
      if (core_status.connected == 0 && snapshot.state == RuntimeState::Connected) {
        snapshot.state = RuntimeState::Error;
        snapshot.last_error = RedactSecrets(!core_status.error.empty() ? core_status.error : "native core disconnected");
        OH_LOG_ERROR(LOG_APP, "core worker exited: %{public}s", snapshot.last_error.c_str());
      } else if (core_status.connected != 0) {
        OH_LOG_ERROR(LOG_APP, "core status poll: connected rx=%{public}llu tx=%{public}llu",
                    (unsigned long long) core_status.rx_bytes, (unsigned long long) core_status.tx_bytes);
      }
    }
  }
  napi_value out = nullptr;
  napi_create_object(env, &out);
  SetNamedString(env, out, "state", StateName(snapshot.state));
  SetNamedBool(env, out, "connected", snapshot.state == RuntimeState::Connected);
  SetNamedUint64(env, out, "sessionId", snapshot.session_id);
  SetNamedInt32(env, out, "tunFd", snapshot.tun_fd);
  SetNamedBool(env, out, "coreAvailable", core_available);
  SetNamedUint64(env, out, "rxBytes", snapshot.rx_bytes);
  SetNamedUint64(env, out, "txBytes", snapshot.tx_bytes);
  ChengHy2TunCoreMemDiag mem_diag{};
  mem_diag.abi_version = CHENG_HY2_TUN_CORE_ABI_VERSION;
  if (core_available && g_core.mem_diag != nullptr && g_core.last_mem_diag != nullptr) {
    g_core.mem_diag(CHENG_HY2_TUN_CORE_ABI_VERSION);
    g_core.last_mem_diag(&mem_diag);
  }
  SetNamedUint64(env, out, "memAlloc", static_cast<uint64_t>(mem_diag.alloc_count));
  SetNamedUint64(env, out, "memFree", static_cast<uint64_t>(mem_diag.free_count));
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
    SetNamedUint64(env, out, "memLive", static_cast<uint64_t>(live));
    SetNamedUint64(env, out, "memResidual", static_cast<uint64_t>(residual));
  }
  SetNamedString(env, out, "text", snapshot.text);
  SetNamedString(env, out, "lastError", RedactSecrets(snapshot.last_error.empty() ? core_error : snapshot.last_error));
  {
    // Debug diagnostics: persist the latest status snapshot so on-device state
    // stays inspectable over hdc even when hilog drops this app's native logs.
    napi_value out_string = nullptr;
    if (napi_coerce_to_string(env, out, &out_string) == napi_ok) {
      size_t text_len = 0;
      if (napi_get_value_string_utf8(env, out_string, nullptr, 0, &text_len) == napi_ok) {
        std::string status_text(text_len + 1, '\0');
        if (napi_get_value_string_utf8(env, out_string, &status_text[0], text_len + 1, &text_len) == napi_ok) {
          FILE* diag = fopen("/data/storage/el2/base/haps/entry/files/cheng-hy2-tun/last_status.json", "w");
          if (diag != nullptr) {
            fputs(status_text.c_str(), diag);
            fputc('\n', diag);
            fclose(diag);
          }
        }
      }
    }
  }
  return out;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor props[] = {
      {"coreAvailable", nullptr, NapiCoreAvailable, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"start", nullptr, NapiStart, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"stop", nullptr, NapiStop, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"status", nullptr, NapiStatus, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"guiSnapshot", nullptr, NapiGuiSnapshot, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"completeProtect", nullptr, NapiCompleteProtect, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(props) / sizeof(props[0]), props);
  return exports;
}

}  // namespace

static napi_module g_cheng_hy2_tun_vpn_module = {0};

extern "C" __attribute__((constructor)) void ChengHy2TunVpnRegisterModule() {
  g_cheng_hy2_tun_vpn_module.nm_version = 1;
  g_cheng_hy2_tun_vpn_module.nm_flags = 0;
  g_cheng_hy2_tun_vpn_module.nm_filename = nullptr;
  g_cheng_hy2_tun_vpn_module.nm_register_func = Init;
  g_cheng_hy2_tun_vpn_module.nm_modname = kNativeModuleName;
  g_cheng_hy2_tun_vpn_module.nm_priv = nullptr;
  napi_module_register(&g_cheng_hy2_tun_vpn_module);
}