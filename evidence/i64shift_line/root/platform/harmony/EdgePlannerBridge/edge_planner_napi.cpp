// SABI v2 Harmony/NAPI host for cheng_unimaker_planner_classify_task_kind.
//
// Provides the @importc emit sink that the Cheng bridge calls synchronously,
// then surfaces the captured taskKind bytes to ArkTS via N-API. Mirrors the
// Android JNI host platform/android/ChengPlannerTaskBridge/edge_planner_bridge.cpp
// method-for-method (dlsym resolve, thread_local emit accumulator, honest
// no-device state) and the NAPI module-registration skeleton used by
// libp2p_harmony_napi.cpp (EXTERN_C_START/napi_module_register).
//
// No mock path: if the Cheng export is missing at runtime, coreAvailable()
// returns ok=false and classifyTaskKind() returns ok=false with an error
// string instead of a fabricated taskKind.

#include <napi/native_api.h>

#include <cstdint>
#include <cstring>
#include <dlfcn.h>
#include <mutex>
#include <string>

namespace {

using ClassifyFn = int32_t (*)(const void* transcript_raw, int64_t transcript_len);

// Weak so this translation unit can also be linked without planner_ohos.o (dlsym-only).
extern "C" int32_t cheng_unimaker_planner_classify_task_kind(
    const void* transcript_raw,
    int64_t transcript_len
) __attribute__((weak));

std::mutex g_resolve_mu;
ClassifyFn g_classify = nullptr;
bool g_resolve_attempted = false;
std::string g_resolve_error;

// SABI v2 emit is synchronous on the calling thread (same contract as the
// Android host and the hy2-tun Harmony emit accumulators).
thread_local std::string g_task_kind_acc;
thread_local int32_t g_emit_rc = 0;

ClassifyFn ResolveClassify() {
  std::lock_guard<std::mutex> lock(g_resolve_mu);
  if (g_resolve_attempted) {
    return g_classify;
  }
  g_resolve_attempted = true;
  if (cheng_unimaker_planner_classify_task_kind != nullptr) {
    g_classify = &cheng_unimaker_planner_classify_task_kind;
    g_resolve_error.clear();
    return g_classify;
  }
  void* sym = dlsym(RTLD_DEFAULT, "cheng_unimaker_planner_classify_task_kind");
  if (sym == nullptr) {
    void* handle = dlopen("libedgeplanner.so", RTLD_NOW | RTLD_GLOBAL);
    if (handle != nullptr) {
      sym = dlsym(handle, "cheng_unimaker_planner_classify_task_kind");
    }
  }
  if (sym == nullptr) {
    const char* err = dlerror();
    g_resolve_error = err != nullptr ? err : "cheng_unimaker_planner_classify_task_kind not found";
    g_classify = nullptr;
    return nullptr;
  }
  g_classify = reinterpret_cast<ClassifyFn>(sym);
  g_resolve_error.clear();
  return g_classify;
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

// Result shape matches the addon-wide NativeResult{ok,error?,payload?}
// convention (see types/*/index.d.ts across this NAPI target set).
napi_value MakeResult(napi_env env, bool ok, const std::string& error = std::string()) {
  napi_value object = nullptr;
  napi_create_object(env, &object);
  SetNamedBool(env, object, "ok", ok);
  if (!error.empty()) {
    SetNamedString(env, object, "error", error);
  }
  return object;
}

bool ReadStringArg(napi_env env, napi_value value, std::string* output) {
  if (value == nullptr) {
    output->clear();
    return true;
  }
  napi_valuetype type = napi_undefined;
  if (napi_typeof(env, value, &type) != napi_ok) {
    return false;
  }
  if (type == napi_undefined || type == napi_null) {
    output->clear();
    return true;
  }
  if (type != napi_string) {
    return false;
  }
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok) {
    return false;
  }
  output->resize(length + 1);
  if (length == 0) {
    output->clear();
    return true;
  }
  size_t written = 0;
  if (napi_get_value_string_utf8(env, value, output->data(), output->size(), &written) != napi_ok) {
    return false;
  }
  output->resize(written);
  return true;
}

napi_value NapiCoreAvailable(napi_env env, napi_callback_info /*info*/) {
  return MakeResult(env, ResolveClassify() != nullptr);
}

napi_value NapiLoadError(napi_env env, napi_callback_info /*info*/) {
  ResolveClassify();
  napi_value result = MakeResult(env, true);
  SetNamedString(env, result, "payload", g_resolve_error);
  return result;
}

napi_value NapiClassifyTaskKind(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  ClassifyFn classify = ResolveClassify();
  if (classify == nullptr) {
    return MakeResult(
        env,
        false,
        g_resolve_error.empty() ? "cheng_unimaker_planner_classify_task_kind not loaded" : g_resolve_error
    );
  }

  std::string transcript;
  if (argc < 1 || !ReadStringArg(env, args[0], &transcript)) {
    return MakeResult(env, false, "field_type_mismatch:transcript");
  }

  g_task_kind_acc.clear();
  g_emit_rc = -1;
  const int32_t rc = classify(transcript.data(), static_cast<int64_t>(transcript.size()));
  if (rc != 0 || g_emit_rc != 0) {
    return MakeResult(env, false, "cheng_unimaker_planner_classify_task_kind emit failed");
  }

  // taskKind strings are ASCII constants from planner_task.cheng.
  napi_value result = MakeResult(env, true);
  SetNamedString(env, result, "payload", g_task_kind_acc);
  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor descriptors[] = {
      {"coreAvailable", nullptr, NapiCoreAvailable, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"loadError", nullptr, NapiLoadError, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"classifyTaskKind", nullptr, NapiClassifyTaskKind, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(descriptors) / sizeof(descriptors[0]), descriptors);
  return exports;
}

}  // namespace

// Cheng @importc("cheng_unimaker_planner_task_kind_emit") host implementation.
extern "C" int32_t cheng_unimaker_planner_task_kind_emit(const unsigned char* data, int64_t len) {
  if (data == nullptr || len < 0) {
    g_task_kind_acc.clear();
    g_emit_rc = -1;
    return -1;
  }
  g_task_kind_acc.assign(reinterpret_cast<const char*>(data), static_cast<size_t>(len));
  g_emit_rc = 0;
  return 0;
}

EXTERN_C_START
static napi_value InitEdgePlannerModule(napi_env env, napi_value exports) {
  return Init(env, exports);
}
EXTERN_C_END

static napi_module g_edge_planner_napi_module = {
    .nm_version = 1,
    .nm_flags = 0,
    .nm_filename = nullptr,
    .nm_register_func = InitEdgePlannerModule,
    .nm_modname = "edge_planner_napi",
    .nm_priv = ((void*)0),
    .reserved = {0},
};

extern "C" __attribute__((constructor)) void RegisterEdgePlannerNapiModule(void) {
  napi_module_register(&g_edge_planner_napi_module);
}
