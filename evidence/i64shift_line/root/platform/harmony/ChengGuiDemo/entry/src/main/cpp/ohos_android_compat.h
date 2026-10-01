// ohos_android_compat.h
// Compatibility shim so the Android GLES compositor host (cheng_generated_android_host.c
// body) compiles unchanged on OpenHarmony. Only the ~30 Android-specific symbols used by
// the kept GLES render path are mapped here. JNI / NdkMedia decode functions are NOT
// shimmed: those code blocks are excised by the host assembler (see build_gui_host.sh),
// because milestone 1 renders the static scene (rect/text/svg/image atlas) with no video
// decode. OHOS XComponent hands the host an OHNativeWindow* which IS an
// EGLNativeWindowType, so the EGL window-surface path is byte-identical.
#ifndef OHOS_ANDROID_COMPAT_H
#define OHOS_ANDROID_COMPAT_H

#include <hilog/log.h>
#include <native_window/external_window.h>
#include <stdint.h>
#include <stddef.h>

// --- logging: __android_log_print -> OH_LOG_Print ----------------------------
// Android log levels mapped onto OHOS LogLevel. The Android host passes an
// ANDROID_LOG_* level as the first arg; we route everything through OH_LOG_Print
// with LOG_APP type and a fixed domain/tag.
#define ANDROID_LOG_DEBUG LOG_DEBUG
#define ANDROID_LOG_INFO  LOG_INFO
#define ANDROID_LOG_WARN  LOG_WARN
#define ANDROID_LOG_ERROR LOG_ERROR

#define __android_log_print(level, tag, ...) \
  OH_LOG_Print(LOG_APP, (LogLevel)(level), 0xC0DE, (tag), __VA_ARGS__)

// --- __system_property_get: no system properties on this path ----------------
static inline int cheng_ohos_system_property_get(const char* key, char* value) {
  (void)key;
  if (value != NULL) {
    value[0] = '\0';
  }
  return 0;
}
#define __system_property_get(key, value) cheng_ohos_system_property_get((key), (value))

// --- ANativeWindow -> OHNativeWindow -----------------------------------------
// The OHOS XComponent surface callback delivers an OHNativeWindow*; treat it as
// the opaque window handle the host already threads through its render path.
typedef OHNativeWindow ANativeWindow;

// WINDOW_FORMAT_RGBA_8888 -> OHOS pixel format (GRAPHIC_PIXEL_FMT_RGBA_8888 = 12).
#ifndef WINDOW_FORMAT_RGBA_8888
#define WINDOW_FORMAT_RGBA_8888 12
#endif

// ANativeWindow_setBuffersGeometry(window, w, h, fmt) -> OHOS HandleOpt.
// SET_BUFFER_GEOMETRY on OHOS takes (width, height); format is set separately via
// SET_FORMAT. Returns 0 on success exactly like the Android API.
static inline int cheng_ohos_native_window_set_geometry(OHNativeWindow* window, int width, int height, int format) {
  if (window == NULL) {
    return -1;
  }
  int rc = OH_NativeWindow_NativeWindowHandleOpt(window, SET_BUFFER_GEOMETRY, width, height);
  if (rc != 0) {
    return rc;
  }
  // Best-effort format pin; ignore failure so geometry success still reports ok.
  (void)OH_NativeWindow_NativeWindowHandleOpt(window, SET_FORMAT, format);
  return 0;
}
#define ANativeWindow_setBuffersGeometry(w, width, height, fmt) \
  cheng_ohos_native_window_set_geometry((w), (width), (height), (fmt))

static inline void cheng_ohos_native_window_release(OHNativeWindow* window) {
  // The XComponent owns the surface lifecycle; the host must not destroy it.
  (void)window;
}
#define ANativeWindow_release(w) cheng_ohos_native_window_release((w))

// --- opaque aliases for dead JNI/NdkMedia types ------------------------------
// The media-texture cache struct and a few file-scope globals still NAME these
// types, but every function that USES them (video decode, JNI bridge) is excised
// from this OHOS build. Aliasing them to opaque pointers/void keeps the surviving
// declarations well-formed without pulling in JNI or NdkMediaCodec.
typedef void* jobject;
typedef void  JavaVM;
typedef void  AAssetManager;
typedef void  AMediaExtractor;
typedef void  AMediaCodec;

#endif  // OHOS_ANDROID_COMPAT_H
