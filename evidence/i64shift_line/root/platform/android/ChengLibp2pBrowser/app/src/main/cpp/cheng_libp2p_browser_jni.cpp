#include <jni.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

extern "C" {
int32_t cheng_libp2p_browser_init(const void* selfPeerRaw, int64_t selfPeerLen, int32_t viewportW, int32_t viewportH);
int32_t cheng_libp2p_browser_begin_load(const void* urlRaw, int64_t urlLen);
int32_t cheng_libp2p_browser_on_load_complete(const void* htmlRaw, int64_t htmlLen);
int32_t cheng_libp2p_browser_on_page_loaded(const void* urlRaw, int64_t urlLen, const void* htmlRaw, int64_t htmlLen);
int32_t cheng_libp2p_browser_on_url_loaded(const void* urlRaw, int64_t urlLen);
int32_t cheng_libp2p_browser_on_page_snapshot(const void* urlRaw, int64_t urlLen, const void* snapRaw, int64_t snapLen);
int32_t cheng_libp2p_browser_refresh_snapshot(const void* urlRaw, int64_t urlLen, const void* snapRaw, int64_t snapLen);
int32_t cheng_libp2p_browser_right_open(void);
int32_t cheng_libp2p_browser_click(int32_t x, int32_t y);
int32_t cheng_libp2p_browser_key(int32_t code);
int32_t cheng_libp2p_browser_attach_peer(const void* peerRaw, int64_t peerLen);
int32_t cheng_libp2p_browser_select_peer(const void* peerRaw, int64_t peerLen);
int32_t cheng_libp2p_browser_paint_count(void);
int32_t cheng_libp2p_browser_paint_kind_at(int32_t index);
int32_t cheng_libp2p_browser_paint_x_at(int32_t index);
int32_t cheng_libp2p_browser_paint_y_at(int32_t index);
int32_t cheng_libp2p_browser_paint_w_at(int32_t index);
int32_t cheng_libp2p_browser_paint_h_at(int32_t index);
int32_t cheng_libp2p_browser_paint_color_at(int32_t index);
int32_t cheng_libp2p_browser_url_len(void);
int32_t cheng_libp2p_browser_url_byte(int32_t index);
}

static void jstring_to_raw(JNIEnv* env, jstring s, const char** out, int64_t* outLen, char** owned) {
    *out = nullptr;
    *outLen = 0;
    *owned = nullptr;
    if (!s) return;
    const char* utf = env->GetStringUTFChars(s, nullptr);
    if (!utf) return;
    size_t n = strlen(utf);
    char* copy = (char*)malloc(n + 1);
    if (!copy) {
        env->ReleaseStringUTFChars(s, utf);
        return;
    }
    memcpy(copy, utf, n + 1);
    env->ReleaseStringUTFChars(s, utf);
    *owned = copy;
    *out = copy;
    *outLen = (int64_t)n;
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_init(JNIEnv* env, jobject, jstring selfPeer, jint vw, jint vh) {
    const char* raw = nullptr;
    int64_t n = 0;
    char* owned = nullptr;
    jstring_to_raw(env, selfPeer, &raw, &n, &owned);
    jint rc = cheng_libp2p_browser_init(raw, n, vw, vh);
    free(owned);
    return rc;
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_beginLoad(JNIEnv* env, jobject, jstring url) {
    const char* raw = nullptr;
    int64_t n = 0;
    char* owned = nullptr;
    jstring_to_raw(env, url, &raw, &n, &owned);
    jint rc = cheng_libp2p_browser_begin_load(raw, n);
    free(owned);
    return rc;
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_onLoadComplete(JNIEnv* env, jobject, jstring html) {
    const char* raw = nullptr;
    int64_t n = 0;
    char* owned = nullptr;
    jstring_to_raw(env, html, &raw, &n, &owned);
    jint rc = cheng_libp2p_browser_on_load_complete(raw, n);
    free(owned);
    return rc;
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_onUrlLoaded(JNIEnv* env, jobject, jstring url) {
    const char* urlRaw = nullptr;
    int64_t urlLen = 0;
    char* urlOwned = nullptr;
    jstring_to_raw(env, url, &urlRaw, &urlLen, &urlOwned);
    jint rc = cheng_libp2p_browser_on_url_loaded(urlRaw, urlLen);
    free(urlOwned);
    return rc;
}

extern "C" int32_t cheng_browser_http_get(const void*, int64_t) { return -1; }
extern "C" int32_t cheng_browser_http_status(void) { return 0; }
extern "C" int32_t cheng_browser_http_body_len(void) { return 0; }
extern "C" int32_t cheng_browser_http_body_byte(int32_t) { return 0; }
extern "C" const void* cheng_browser_http_body_ptr(void) { return nullptr; }

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_onPageLoaded(JNIEnv* env, jobject, jstring url, jstring html) {
    const char* urlRaw = nullptr;
    int64_t urlLen = 0;
    char* urlOwned = nullptr;
    const char* htmlRaw = nullptr;
    int64_t htmlLen = 0;
    char* htmlOwned = nullptr;
    jstring_to_raw(env, url, &urlRaw, &urlLen, &urlOwned);
    jstring_to_raw(env, html, &htmlRaw, &htmlLen, &htmlOwned);
    jint rc = cheng_libp2p_browser_on_page_loaded(urlRaw, urlLen, htmlRaw, htmlLen);
    free(urlOwned);
    free(htmlOwned);
    return rc;
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_onPageSnapshot(JNIEnv* env, jobject, jstring url, jstring snapshot) {
    const char* urlRaw = nullptr;
    int64_t urlLen = 0;
    char* urlOwned = nullptr;
    const char* snapRaw = nullptr;
    int64_t snapLen = 0;
    char* snapOwned = nullptr;
    jstring_to_raw(env, url, &urlRaw, &urlLen, &urlOwned);
    jstring_to_raw(env, snapshot, &snapRaw, &snapLen, &snapOwned);
    jint rc = cheng_libp2p_browser_on_page_snapshot(urlRaw, urlLen, snapRaw, snapLen);
    free(urlOwned);
    free(snapOwned);
    return rc;
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_refreshSnapshot(JNIEnv* env, jobject, jstring url, jstring snapshot) {
    const char* urlRaw = nullptr;
    int64_t urlLen = 0;
    char* urlOwned = nullptr;
    const char* snapRaw = nullptr;
    int64_t snapLen = 0;
    char* snapOwned = nullptr;
    jstring_to_raw(env, url, &urlRaw, &urlLen, &urlOwned);
    jstring_to_raw(env, snapshot, &snapRaw, &snapLen, &snapOwned);
    jint rc = cheng_libp2p_browser_refresh_snapshot(urlRaw, urlLen, snapRaw, snapLen);
    free(urlOwned);
    free(snapOwned);
    return rc;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_rightOpen(JNIEnv*, jobject) {
    return cheng_libp2p_browser_right_open() != 0 ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_click(JNIEnv*, jobject, jint x, jint y) {
    return cheng_libp2p_browser_click(x, y);
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_key(JNIEnv*, jobject, jint code) {
    return cheng_libp2p_browser_key(code);
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_attachPeer(JNIEnv* env, jobject, jstring peer) {
    const char* raw = nullptr;
    int64_t n = 0;
    char* owned = nullptr;
    jstring_to_raw(env, peer, &raw, &n, &owned);
    jint rc = cheng_libp2p_browser_attach_peer(raw, n);
    free(owned);
    return rc;
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_selectPeer(JNIEnv* env, jobject, jstring peer) {
    const char* raw = nullptr;
    int64_t n = 0;
    char* owned = nullptr;
    jstring_to_raw(env, peer, &raw, &n, &owned);
    jint rc = cheng_libp2p_browser_select_peer(raw, n);
    free(owned);
    return rc;
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_paintCount(JNIEnv*, jobject) {
    return cheng_libp2p_browser_paint_count();
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_paintKind(JNIEnv*, jobject, jint index) {
    return cheng_libp2p_browser_paint_kind_at(index);
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_paintX(JNIEnv*, jobject, jint index) {
    return cheng_libp2p_browser_paint_x_at(index);
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_paintY(JNIEnv*, jobject, jint index) {
    return cheng_libp2p_browser_paint_y_at(index);
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_paintW(JNIEnv*, jobject, jint index) {
    return cheng_libp2p_browser_paint_w_at(index);
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_paintH(JNIEnv*, jobject, jint index) {
    return cheng_libp2p_browser_paint_h_at(index);
}

extern "C" JNIEXPORT jint JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_paintColor(JNIEnv*, jobject, jint index) {
    return cheng_libp2p_browser_paint_color_at(index);
}

extern "C" JNIEXPORT jstring JNICALL
Java_org_cheng_libp2pbrowser_ChengBrowserNative_currentUrl(JNIEnv* env, jobject) {
    int32_t n = cheng_libp2p_browser_url_len();
    if (n <= 0) return env->NewStringUTF("");
    char* buf = (char*)malloc((size_t)n + 1);
    if (!buf) return env->NewStringUTF("");
    for (int32_t i = 0; i < n; i++) buf[i] = (char)cheng_libp2p_browser_url_byte(i);
    buf[n] = 0;
    jstring out = env->NewStringUTF(buf);
    free(buf);
    return out;
}
