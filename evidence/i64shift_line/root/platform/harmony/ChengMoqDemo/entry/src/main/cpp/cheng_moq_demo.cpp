#include <dlfcn.h>
#include <hilog/log.h>
#include <napi/native_api.h>
#include <rawfile/raw_file_manager.h>
#include <rawfile/raw_file.h>

#include <cstdint>
#include <cstdio>
#include <mutex>
#include <string>
#include <pthread.h>
#include <sys/stat.h>

namespace {

constexpr const char* kNativeModuleName = "cheng_moq_demo";
constexpr const char* kCoreLibraryName = "libcheng_moq_harmony.so";
constexpr const char* kLogTag = "ChengMoqPub";
constexpr const char* kCacheDir = "/data/storage/el2/base/haps/entry/cache";

// Reverse direction: Harmony PUBLISHES the 麦田 clip → Android plays. HarmonyOS forbids
// running native CLI binaries from /data/local/tmp (SELinux), so the real publisher
// (media_moq_publisher_main.cheng's serve loop) runs in-app via this NAPI: extract the
// bundled ES assets to the app cache, then call cheng_moq_harmony_publish_serve on a
// background thread (it binds 0.0.0.0:38000 and serves until the process dies).
typedef int (*publish_serve_fn)(void);

std::mutex g_mutex;
void* g_handle = nullptr;
publish_serve_fn g_serve = nullptr;
pthread_t g_serve_thread;
bool g_serve_started = false;
std::string g_error;

void* ServeThread(void* arg) {
  (void)arg;
  OH_LOG_INFO(LOG_APP, "[%{public}s] publish serve thread: binding 0.0.0.0:38000", kLogTag);
  int rc = g_serve();
  OH_LOG_INFO(LOG_APP, "[%{public}s] publish serve returned rc=%{public}d", kLogTag, rc);
  return nullptr;
}

// Extract one bundled rawfile asset to <cache>/<name>. Returns true on success.
bool ExtractRawfile(NativeResourceManager* rm, const char* name) {
  RawFile* rf = OH_ResourceManager_OpenRawFile(rm, name);
  if (rf == nullptr) {
    OH_LOG_ERROR(LOG_APP, "[%{public}s] rawfile missing: %{public}s", kLogTag, name);
    return false;
  }
  long len = OH_ResourceManager_GetRawFileSize(rf);
  bool ok = false;
  if (len > 0) {
    uint8_t* buf = (uint8_t*)malloc((size_t)len);
    if (buf != nullptr) {
      long got = 0;
      while (got < len) {
        int n = OH_ResourceManager_ReadRawFile(rf, buf + got, (size_t)(len - got));
        if (n <= 0) break;
        got += n;
      }
      if (got == len) {
        char path[256];
        snprintf(path, sizeof(path), "%s/%s", kCacheDir, name);
        FILE* f = fopen(path, "wb");
        if (f != nullptr) {
          ok = (fwrite(buf, 1, (size_t)len, f) == (size_t)len);
          fclose(f);
          OH_LOG_INFO(LOG_APP, "[%{public}s] extracted %{public}s -> %{public}s (%{public}ld B) ok=%{public}d",
                      kLogTag, name, path, len, (int)ok);
        } else {
          OH_LOG_ERROR(LOG_APP, "[%{public}s] cache open failed: %{public}s", kLogTag, path);
        }
      }
      free(buf);
    }
  }
  OH_ResourceManager_CloseRawFile(rf);
  return ok;
}

napi_value MakeNumber(napi_env env, int64_t value) {
  napi_value out = nullptr;
  napi_create_int64(env, value, &out);
  return out;
}

// publishServe(resourceManager): extract assets + start the serve thread. Returns 0 on
// start (serve runs in the background), negative on setup failure. Idempotent.
napi_value NapiPublishServe(napi_env env, napi_callback_info info) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (g_serve_started) return MakeNumber(env, 0);

  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 1) { OH_LOG_ERROR(LOG_APP, "[%{public}s] missing resourceManager arg", kLogTag); return MakeNumber(env, -1); }
  NativeResourceManager* rm = OH_ResourceManager_InitNativeResourceManager(env, argv[0]);
  if (rm == nullptr) { OH_LOG_ERROR(LOG_APP, "[%{public}s] InitNativeResourceManager NULL", kLogTag); return MakeNumber(env, -2); }

  mkdir(kCacheDir, 0700);
  bool extracted = ExtractRawfile(rm, "maitian.mp4")
                && ExtractRawfile(rm, "maitian_poster.jpg")
                && ExtractRawfile(rm, "maitian.h264")
                && ExtractRawfile(rm, "maitian.moqidx");
  if (!extracted) { OH_LOG_ERROR(LOG_APP, "[%{public}s] asset extraction failed", kLogTag); return MakeNumber(env, -3); }

  if (g_serve == nullptr) {
    g_handle = dlopen(kCoreLibraryName, RTLD_NOW | RTLD_LOCAL);
    if (g_handle == nullptr) {
      const char* e = dlerror();
      OH_LOG_ERROR(LOG_APP, "[%{public}s] dlopen failed: %{public}s", kLogTag, e ? e : "?");
      return MakeNumber(env, -4);
    }
    g_serve = reinterpret_cast<publish_serve_fn>(dlsym(g_handle, "cheng_moq_harmony_publish_serve"));
    if (g_serve == nullptr) {
      OH_LOG_ERROR(LOG_APP, "[%{public}s] dlsym cheng_moq_harmony_publish_serve failed", kLogTag);
      return MakeNumber(env, -5);
    }
  }
  if (pthread_create(&g_serve_thread, nullptr, ServeThread, nullptr) != 0) {
    OH_LOG_ERROR(LOG_APP, "[%{public}s] pthread_create failed", kLogTag);
    return MakeNumber(env, -6);
  }
  g_serve_started = true;
  OH_LOG_INFO(LOG_APP, "[%{public}s] publisher started (Harmony -> serves 麦田 on 0.0.0.0:38000)", kLogTag);
  return MakeNumber(env, 0);
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor props[] = {
      {"publishServe", nullptr, NapiPublishServe, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(props) / sizeof(props[0]), props);
  return exports;
}

}  // namespace

static napi_module g_cheng_moq_demo_module = {0};

extern "C" __attribute__((constructor)) void ChengMoqDemoRegisterModule() {
  g_cheng_moq_demo_module.nm_version = 1;
  g_cheng_moq_demo_module.nm_flags = 0;
  g_cheng_moq_demo_module.nm_filename = nullptr;
  g_cheng_moq_demo_module.nm_register_func = Init;
  g_cheng_moq_demo_module.nm_modname = kNativeModuleName;
  g_cheng_moq_demo_module.nm_priv = nullptr;
  napi_module_register(&g_cheng_moq_demo_module);
}
