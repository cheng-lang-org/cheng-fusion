// SABI v2 Android host for cheng_unimaker_planner_classify_task_kind.
//
// Provides the @importc emit sink that the Cheng bridge calls synchronously,
// then surfaces the captured taskKind bytes to Kotlin via JNI. Mirrors the
// desktop provider in src/tests/fixtures/unimaker_planner_task_bridge_provider.c
// and the emit accumulators in cheng_hy2_tun_android_jni.cpp.
//
// No mock path: if the Cheng export is missing at runtime the JNI entry returns
// null / available=false so the Capacitor plugin reports an honest no-device
// state instead of fabricated scores.

#include <jni.h>

#include <cstdint>
#include <cstring>
#include <dlfcn.h>
#include <mutex>
#include <string>

namespace {

using ClassifyFn = int32_t (*)(const void* transcript_raw, int64_t transcript_len);

// Weak so this translation unit can also be linked without planner.o (dlsym-only).
extern "C" int32_t cheng_unimaker_planner_classify_task_kind(
    const void* transcript_raw,
    int64_t transcript_len
) __attribute__((weak));

std::mutex g_resolve_mu;
ClassifyFn g_classify = nullptr;
bool g_resolve_attempted = false;
std::string g_resolve_error;

// SABI v2 emit is synchronous on the calling thread (same contract as hy2-tun).
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
    // Also try the production mobile capi soname in case it was not yet global.
    void* handle = dlopen("libcheng_mobile_capi.so", RTLD_NOW | RTLD_GLOBAL);
    if (handle != nullptr) {
      sym = dlsym(handle, "cheng_unimaker_planner_classify_task_kind");
    }
    if (sym == nullptr) {
      handle = dlopen("libedgeplanner.so", RTLD_NOW | RTLD_GLOBAL);
      if (handle != nullptr) {
        sym = dlsym(handle, "cheng_unimaker_planner_classify_task_kind");
      }
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

extern "C" JNIEXPORT jboolean JNICALL
Java_com_unimaker_app_edge_ChengPlannerTaskNative_nativeCoreAvailable(JNIEnv*, jclass) {
  return ResolveClassify() != nullptr ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_edge_ChengPlannerTaskNative_nativeLoadError(JNIEnv* env, jclass) {
  ResolveClassify();
  if (g_resolve_error.empty()) {
    return env->NewStringUTF("");
  }
  return env->NewStringUTF(g_resolve_error.c_str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_unimaker_app_edge_ChengPlannerTaskNative_nativeClassifyTaskKind(
    JNIEnv* env,
    jclass,
    jbyteArray transcript_utf8
) {
  ClassifyFn classify = ResolveClassify();
  if (classify == nullptr) {
    return nullptr;
  }

  const jsize len = transcript_utf8 != nullptr ? env->GetArrayLength(transcript_utf8) : 0;
  const jbyte* bytes = nullptr;
  if (len > 0) {
    bytes = env->GetByteArrayElements(transcript_utf8, nullptr);
    if (bytes == nullptr) {
      return nullptr;
    }
  }

  g_task_kind_acc.clear();
  g_emit_rc = -1;
  const int32_t rc = classify(
      bytes != nullptr ? reinterpret_cast<const void*>(bytes) : nullptr,
      static_cast<int64_t>(len)
  );
  if (bytes != nullptr) {
    env->ReleaseByteArrayElements(transcript_utf8, const_cast<jbyte*>(bytes), JNI_ABORT);
  }
  if (rc != 0 || g_emit_rc != 0) {
    return nullptr;
  }
  // taskKind strings are ASCII constants from planner_task.cheng; NewStringUTF is correct.
  return env->NewStringUTF(g_task_kind_acc.c_str());
}
