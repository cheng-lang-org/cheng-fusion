// GENERATED split of cheng_gui_host.c — ADAPTER half (slice-8 physical split, mechanical).
#include "cheng_gui_host_shared.h"
static int s_audio_player_fd = -1;
static int64_t s_stream_pause_started_ns = 0;
static GLuint s_surf_oes_tex = 0u;
static OH_NativeImage* s_surf_nimg = NULL;
static GLuint s_surf_fbo = 0u;
static GLuint s_surf_prog = 0u;
static GLint s_surf_prog_tex = -1;
static GLint s_surf_prog_mtx = -1;
static GLuint s_surf_vao = 0u;
static int s_surf_have_frame = 0;            // first UpdateSurfaceImage succeeded
static int s_surf_out_n = 0;                 // surface-frame present counter (fps meter)
static void cheng_stream_prefetch_frames(ChengStreamCtx* ctx);  // ES fetch (fetch thread)

// ---- endurance oracle: unimaker.playback_endurance.v1 -----------------------
// Reuses the surface present counter (s_surf_out_n). Samples the interval between presents into
// a ring (p50/p95), counts stalls (> 1.5x the frame period), tracks the ES sink frame count
// (rate) and RSS growth (leak slope). Exported as one structured ChengMD hilog line (same
// channel/shape as open_to_first_frame) periodically and at playback end. Reset at teardown.
#define CHENG_ENDUR_RING 256
static double s_endur_ivl_ms[CHENG_ENDUR_RING];
static int s_endur_ivl_head = 0;
static int s_endur_ivl_count = 0;
static int64_t s_endur_present_last_ns = 0;
static int s_endur_stall_n = 0;
static int64_t s_endur_es_sink_n = 0;   // frames pushed into the input FIFO (local + network sinks)
static int64_t s_endur_t0_ns = 0;       // first present ts — anchor for rates + RSS slope
static int64_t s_endur_rss0_kb = 0;     // RSS at t0 — leak-slope anchor

// #139 (涓流无界 + pthread_join 无超时; S8 上界论证 区制 C, case file
// ~/cheng-patches/20260719/14gap/bound_analysis.md): host-side cancel fast-path for the
// two fetch-thread joins in this file (cheng_android_media_texture_release and
// cheng_stream_teardown_active below). The Cheng fetch drain loop
// (WebSceneMediaOrchestrateFetchAll, web_scene_media_orchestrator.cheng) now carries:
//   1. a whole-fetch cumulative deadline (60000ms base, extended by transfer size at a
//      50 bytes/ms floor — ES fetches ≤1.1MB see ≤82s, the largest whole-file pull
//      ~5.9MB sees ≤178s) — the hard backstop making the
//      join's wait provably FINITE even against a peer dripping ≥1 byte per sub-20s
//      window forever (previously structurally unbounded: each msquicNativePipeRead
//      resets its own 20000ms idle window per call and ≥1 byte counts as a successful
//      read, so the drain loop never lacked a fresh window);
//   2. a cancel flag — a plain cross-thread int32 with no QUIC/session state behind
//      it, checked before every read — so teardown aborts an in-flight fetch at the
//      NEXT drain-loop iteration (≤ one 20000ms read idle window) instead of waiting
//      out the deadline.
// Setting the flag from THIS (render) thread is safe: it is the only media-fetch
// global a non-pump thread may write, so the single-thread-owns-the-QUIC-pump
// invariant (no session/pipe state touched here) is preserved. The flag is cleared by
// the Cheng bridge on the next ES open (WebSceneMediaEsOpen/AudioEsOpen), never here.
// Fail-open dlsym with the latched-resolve precedent of cheng_stream_media_pin_resolve
// below: a scene .so baked before this export existed simply keeps pre-cancel behavior
// — the join is still bounded by the size-aware cumulative deadline alone.
typedef int32_t (*cheng_fetch_cancel_set_fn)(int32_t);
static cheng_fetch_cancel_set_fn s_fetch_cancel_set_fn = NULL;
static int s_fetch_cancel_resolve = 0;   // 0 = untried, 1 = ready, 2 = missing (logged once, latched)

static int cheng_stream_fetch_cancel_resolve(void) {
  if (s_fetch_cancel_resolve != 0) return s_fetch_cancel_resolve == 1;
  s_fetch_cancel_resolve = 2;   // latched until the symbol resolves below
  void* h = NULL;
  Dl_info self_info;
  if (dladdr((void*)&cheng_stream_fetch_cancel_resolve, &self_info) && self_info.dli_fname != NULL) {
    h = dlopen(self_info.dli_fname, RTLD_NOW | RTLD_NOLOAD);
  }
  if (h == NULL) {
    h = dlopen(NULL, RTLD_NOW | RTLD_GLOBAL);
  }
  if (h == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "fetch cancel: self dlopen failed: %s", dlerror());
    return 0;
  }
  s_fetch_cancel_set_fn = (cheng_fetch_cancel_set_fn)dlsym(h, "cheng_scene_media_fetch_cancel_set");
  if (s_fetch_cancel_set_fn == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                        "fetch cancel: dlsym cheng_scene_media_fetch_cancel_set missing — teardown join relies on the size-aware cumulative fetch deadline alone (scene .so predates the #139 cancel wrapper?)");
    return 0;
  }
  s_fetch_cancel_resolve = 1;
  return 1;
}

// Request cancellation of any in-flight trickling fetch right before joining the fetch
// thread. With the export present the join below waits at most one pipe-read idle
// window (≤20000ms, msquicNativePipeReadTimeoutMs); without it, at most the whole-fetch
// cumulative deadline (60s base + size extension) plus that window. Either way the wait
// is finite by construction — this call only picks the tighter bound. The join itself
// stays a plain pthread_join: the hmaudio2 join-then-release invariant (never destroy
// decoder/ES state while the fetch thread can still touch it) is load-bearing and a
// timed-out join that proceeded to destroy would break it.
static void cheng_stream_fetch_cancel_request(void) {
  if (!cheng_stream_fetch_cancel_resolve()) return;
  s_fetch_cancel_set_fn(1);
  cheng_media_diag("fetch cancel: requested before fetch-thread join (#139)");
}

void cheng_android_media_texture_release(ChengAndroidMediaTextureCache* texture) {
  if (texture == NULL) {
    return;
  }
  if (texture->stream_ctx != NULL) {
    // Tear down the streaming decoder: signal stop + wake the blocked producer,
    // stop/destroy the codec (no more callbacks), then free the source + ring.
    ChengStreamCtx* sc = (ChengStreamCtx*)texture->stream_ctx;
    pthread_mutex_lock(&sc->mu);
    sc->stop = 1;
    pthread_cond_broadcast(&sc->cv_notfull);
    pthread_mutex_unlock(&sc->mu);
    pthread_mutex_lock(&sc->fq_mu);
    pthread_cond_broadcast(&sc->cv_notempty);   // wake the codec input-wait so it exits
    pthread_cond_broadcast(&sc->cv_notfull_fq);  // wake the persistent-conn sink so it stops
    pthread_mutex_unlock(&sc->fq_mu);
    // Join the fetch thread before freeing sc (it reads sc in its loop). The #139
    // cancel request bounds this join to ≤ one 20s read idle window (hard backstop:
    // the size-aware whole-fetch cumulative deadline) — see cheng_stream_fetch_cancel_request.
    cheng_stream_fetch_cancel_request();
    if (s_fetch_thread_started) { pthread_join(s_fetch_thread, NULL); s_fetch_thread_started = 0; }
    s_stream_starting = 0;
    if (sc->dec != NULL) { OH_VideoDecoder_Stop(sc->dec); OH_VideoDecoder_Destroy(sc->dec); }
    // Decoder destroyed → no more RenderOutputBuffer. Free the decode-to-surface GL
    // resources (this runs on the render thread, EGL context current).
    if (s_surf_nimg != NULL || s_surf_mode) {
      __atomic_store_n(&s_surf_mode, 0, __ATOMIC_SEQ_CST);
      if (s_surf_fbo != 0u) { glDeleteFramebuffers(1, &s_surf_fbo); s_surf_fbo = 0u; }
      if (s_surf_prog != 0u) { glDeleteProgram(s_surf_prog); s_surf_prog = 0u; }
      if (s_surf_vao != 0u) { glDeleteVertexArrays(1, &s_surf_vao); s_surf_vao = 0u; }
      if (s_stream_tex != 0u) { glDeleteTextures(1, &s_stream_tex); s_stream_tex = 0u; }
      if (s_surf_nimg != NULL) { OH_NativeImage_Destroy(&s_surf_nimg); s_surf_nimg = NULL; }
      if (s_surf_oes_tex != 0u) { glDeleteTextures(1, &s_surf_oes_tex); s_surf_oes_tex = 0u; }
      s_surf_window = NULL; s_surf_have_frame = 0; s_surf_out_n = 0;
    }
    s_stream_play_base_ns = 0; s_stream_last_frame_idx = -1;  // restart play clock on re-prepare
    while (sc->ring_size > 0) {
      free(sc->ring[sc->ring_head]);
      sc->ring_head = (sc->ring_head + 1) % CHENG_STREAM_RING_CAP;
      sc->ring_size--;
    }
    // Free the recycled RGBA pool buffers (decoder already destroyed → none in flight).
    while (sc->pool_top > 0) free(sc->pool[--sc->pool_top]);
    // Free any access units still queued in the input prefetch FIFO.
    pthread_mutex_lock(&sc->fq_mu);
    while (sc->fq_size > 0) {
      free(sc->fq[sc->fq_head]);
      sc->fq_head = (sc->fq_head + 1) % CHENG_STREAM_FQ_CAP;
      sc->fq_size--;
    }
    pthread_mutex_unlock(&sc->fq_mu);
    pthread_mutex_destroy(&sc->mu);
    pthread_cond_destroy(&sc->cv_notfull);
    pthread_mutex_destroy(&sc->fq_mu);
    pthread_cond_destroy(&sc->cv_notempty);
    pthread_cond_destroy(&sc->cv_notfull_fq);
    free(sc);
    texture->stream_ctx = NULL;
    if (texture->video_tex != 0u) { glDeleteTextures(1, &texture->video_tex); texture->video_tex = 0u; }
    texture->gl_texture = 0u;
    texture->valid = 0;
    return;
  }
  if (texture->video_tex != 0u) {
    // Video card: delete the per-card placeholder texture only. gl_texture may be
    // the SHARED stream texture (s_stream_tex) and the decoder is global — both are
    // torn down once in cheng_gui_host_pause, never per-card.
    if (texture->video_tex != s_stream_tex) {
      glDeleteTextures(1, &texture->video_tex);
    }
    texture->video_tex = 0u;
    texture->gl_texture = 0u;
    texture->valid = 0;
    return;
  }
  if (texture->video_frames != NULL) {
    if (texture->video_frame_count > 0) {
      glDeleteTextures(texture->video_frame_count, texture->video_frames);
    }
    free(texture->video_frames);
    texture->video_frames = NULL;
    texture->video_frame_count = 0;
    texture->gl_texture = 0u;  // was an alias into video_frames; already deleted
  } else if (texture->gl_texture != 0u) {
    glDeleteTextures(1, &texture->gl_texture);
    texture->gl_texture = 0u;
  }
  texture->valid = 0;
}

// Emit one unimaker.playback_endurance.v1 line (same ChengMD channel + shape as
// open_to_first_frame) summarizing present smoothness, ES sink rate and RSS slope. Cold path
// (periodic / at playback end), so the ring snapshot + sort here never touch the render budget.
void cheng_endurance_report(const char* reason) {
  int n = s_endur_ivl_count;
  if (n <= 0) return;
  double tmp[CHENG_ENDUR_RING];
  for (int i = 0; i < n; i++) tmp[i] = s_endur_ivl_ms[i];
  for (int i = 1; i < n; i++) {           // insertion sort (n<=256, cold path)
    double v = tmp[i]; int j = i - 1;
    while (j >= 0 && tmp[j] > v) { tmp[j + 1] = tmp[j]; j--; }
    tmp[j + 1] = v;
  }
  int p95i = (int)((double)(n - 1) * 0.95 + 0.5);
  if (p95i < 0) p95i = 0;
  if (p95i >= n) p95i = n - 1;
  double p95 = tmp[p95i];
  double p50 = tmp[n / 2];
  int64_t now_ns = cheng_monotime_ns();
  double elapsed_s = (s_endur_t0_ns != 0) ? (double)(now_ns - s_endur_t0_ns) / 1.0e9 : 0.0;
  double es_sink_rate = (elapsed_s > 0.0) ? (double)s_endur_es_sink_n / elapsed_s : 0.0;
  int64_t rss_kb = cheng_read_rss_kb();
  double rss_slope = (elapsed_s > 0.0) ? (double)(rss_kb - s_endur_rss0_kb) / elapsed_s : 0.0;
  char b[256];
  snprintf(b, sizeof(b),
           "unimaker.playback_endurance.v1 route=%d reason=%s present_n=%d p50_ms=%.1f p95_ms=%.1f stall_n=%d es_sink_rate=%.1f rss_kb=%lld rss_slope_kb_s=%.2f elapsed_s=%.1f",
           s_fetch_route, reason ? reason : "?", s_surf_out_n, p50, p95, s_endur_stall_n,
           es_sink_rate, (long long)rss_kb, rss_slope, elapsed_s);
  cheng_media_diag(b);
}

// ---- decode-to-surface (zero-copy GPU) helpers ----
// Create the OES external texture + OH_NativeImage + native window. MUST run on the
// render thread with the EGL context current (prepare does, before spawning the fetch
// thread, so s_surf_window is ready by the time the decoder calls SetSurface).
int cheng_surface_create_oes(void) {
  if (s_surf_window != NULL) return 1;
  glGenTextures(1, &s_surf_oes_tex);
  glBindTexture(GL_TEXTURE_EXTERNAL_OES, s_surf_oes_tex);
  glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glBindTexture(GL_TEXTURE_EXTERNAL_OES, 0u);
  s_surf_nimg = OH_NativeImage_Create(s_surf_oes_tex, GL_TEXTURE_EXTERNAL_OES);
  if (s_surf_nimg == NULL) { cheng_media_diag("surface: NativeImage_Create NULL"); return 0; }
  s_surf_window = OH_NativeImage_AcquireNativeWindow(s_surf_nimg);
  if (s_surf_window == NULL) { cheng_media_diag("surface: AcquireNativeWindow NULL"); return 0; }
  cheng_media_diag("surface: OES texture + native window created");
  return 1;
}

// Lazily build the OES→RGBA pass (program + FBO + s_stream_tex target). Needs frame
// dims (w,h) for the RGBA target. Returns 1 when ready.
static int cheng_surface_init_pass(int w, int h) {
  if (s_surf_prog != 0u && s_stream_tex != 0u && s_surf_fbo != 0u) return 1;
  if (w <= 0 || h <= 0) return 0;
  static const char* vs =
    "#version 300 es\n"
    "uniform mat4 uTransform;\n"
    "out vec2 vUV;\n"
    "void main(){\n"
    "  vec2 p = vec2((gl_VertexID==2)?3.0:-1.0,(gl_VertexID==1)?3.0:-1.0);\n"
    "  gl_Position = vec4(p,0.0,1.0);\n"
    "  vec2 uv = p*0.5+0.5;\n"
    "  vUV = (uTransform*vec4(uv,0.0,1.0)).xy;\n"   // OES transform matrix carries orientation
    "}\n";
  static const char* fs =
    "#version 300 es\n"
    "#extension GL_OES_EGL_image_external_essl3 : require\n"
    "precision mediump float;\n"
    "uniform samplerExternalOES uTex;\n"
    "in vec2 vUV;\n"
    "out vec4 frag;\n"
    "void main(){ frag = texture(uTex, vUV); }\n";
  GLuint v = cheng_gl_compile_shader(GL_VERTEX_SHADER, vs);
  GLuint f = cheng_gl_compile_shader(GL_FRAGMENT_SHADER, fs);
  if (v == 0u || f == 0u) return 0;
  s_surf_prog = glCreateProgram();
  glAttachShader(s_surf_prog, v); glAttachShader(s_surf_prog, f);
  glLinkProgram(s_surf_prog);
  GLint ok = 0; glGetProgramiv(s_surf_prog, GL_LINK_STATUS, &ok);
  glDeleteShader(v); glDeleteShader(f);
  if (!ok) { cheng_media_diag("surface: program link FAIL"); glDeleteProgram(s_surf_prog); s_surf_prog = 0u; return 0; }
  s_surf_prog_tex = glGetUniformLocation(s_surf_prog, "uTex");
  s_surf_prog_mtx = glGetUniformLocation(s_surf_prog, "uTransform");
  glGenVertexArrays(1, &s_surf_vao);
  glGenTextures(1, &s_stream_tex);
  glBindTexture(GL_TEXTURE_2D, s_stream_tex);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL);
  glBindTexture(GL_TEXTURE_2D, 0u);
  glGenFramebuffers(1, &s_surf_fbo);
  glBindFramebuffer(GL_FRAMEBUFFER, s_surf_fbo);
  glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, s_stream_tex, 0);
  GLenum st = glCheckFramebufferStatus(GL_FRAMEBUFFER);
  glBindFramebuffer(GL_FRAMEBUFFER, 0u);
  if (st != GL_FRAMEBUFFER_COMPLETE) { char b[64]; snprintf(b,sizeof(b),"surface: FBO incomplete 0x%x", st); cheng_media_diag(b); return 0; }
  cheng_media_diag("surface: OES→RGBA pass ready");
  return 1;
}

// Pull the latest decoded frame from the surface into s_stream_tex (RGBA) via the
// GPU pass. Saves/restores GL state so the scene compositor is never disturbed.
// Returns 1 only when a real frame was consumed and drawn this call (修5 2026-07-26:
// the 秒开 t1 marker used to be stamped by the CALLER unconditionally, so "first sink"
// could be true while zero frames had ever reached the surface).
int cheng_surface_consume(int w, int h) {
  if (!cheng_surface_init_pass(w, h)) return 0;
  int upd = OH_NativeImage_UpdateSurfaceImage(s_surf_nimg);  // latest frame → OES tex
  if (upd != 0) {
    // 2026-07-25: this swallow was the ONLY signal gap when the emulator froze on the first
    // frame — UpdateSurfaceImage failing every call means the OES texture never advances
    // while the caller's wall-clock idx (and the whole decode pipeline) run normally. 1 Hz.
    // 2026-07-26 REAL-DEVICE 定谳 (3KN0224C18003262, hilog /tmp/harmony_probe_0016.log): rc is
    // CONSTANTLY 40601000 with have_frame=0 on the real device too — identical to the emulator
    // — while the decoder reports decode started / frames=186 / stream loop exit rc=5 and the
    // ES audio fallback plays. So the zero-copy decode-to-surface chain has NEVER delivered a
    // producer frame to this NativeImage consumer on ANY platform generation tested; the
    // historical "~10fps degradation"/frozen-frame reports and slice-4's device question all
    // collapse into this one producer→consumer break (decoder output likely not actually
    // routed to s_surf_window despite SetSurface OK). Root-fix lives on the decoder-output
    // side, not in vsync scheduling — the OH_NativeVSync callbacks themselves were observed
    // arriving on-device (hilog "recv vsync timestamp, from:cheng_video_vsync").
    static int64_t s_upd_diag_last_ns = 0;
    int64_t upd_now_ns = cheng_monotime_ns();
    if (upd_now_ns - s_upd_diag_last_ns >= 1000000000LL) {
      s_upd_diag_last_ns = upd_now_ns;
      char ub[96];
      snprintf(ub, sizeof(ub), "surface: UpdateSurfaceImage rc=%d have_frame=%d out_n=%d", upd, s_surf_have_frame, s_surf_out_n);
      cheng_media_diag(ub);
    }
    if (!s_surf_have_frame) return 0;                        // no frame yet: nothing to show
  }
  s_surf_have_frame = 1;
  float mtx[16];
  if (OH_NativeImage_GetTransformMatrix(s_surf_nimg, mtx) != 0) {
    for (int i = 0; i < 16; i++) mtx[i] = (i % 5 == 0) ? 1.0f : 0.0f;  // identity fallback
  }
  // Save the GL state the scene compositor relies on.
  GLint pFbo = 0, pProg = 0, pVao = 0, pActive = 0, pVp[4] = {0,0,0,0};
  GLboolean pBlend = glIsEnabled(GL_BLEND), pDepth = glIsEnabled(GL_DEPTH_TEST), pScissor = glIsEnabled(GL_SCISSOR_TEST);
  glGetIntegerv(GL_FRAMEBUFFER_BINDING, &pFbo);
  glGetIntegerv(GL_CURRENT_PROGRAM, &pProg);
  glGetIntegerv(GL_VERTEX_ARRAY_BINDING, &pVao);
  glGetIntegerv(GL_ACTIVE_TEXTURE, &pActive);
  glGetIntegerv(GL_VIEWPORT, pVp);
  glBindFramebuffer(GL_FRAMEBUFFER, s_surf_fbo);
  glViewport(0, 0, w, h);
  glDisable(GL_BLEND); glDisable(GL_DEPTH_TEST); glDisable(GL_SCISSOR_TEST);
  glUseProgram(s_surf_prog);
  glUniformMatrix4fv(s_surf_prog_mtx, 1, GL_FALSE, mtx);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_EXTERNAL_OES, s_surf_oes_tex);
  glUniform1i(s_surf_prog_tex, 0);
  glBindVertexArray(s_surf_vao);
  glDrawArrays(GL_TRIANGLES, 0, 3);
  glBindTexture(GL_TEXTURE_EXTERNAL_OES, 0u);
  // Restore.
  glBindVertexArray((GLuint)pVao);
  glUseProgram((GLuint)pProg);
  glBindFramebuffer(GL_FRAMEBUFFER, (GLuint)pFbo);
  glViewport(pVp[0], pVp[1], pVp[2], pVp[3]);
  glActiveTexture((GLenum)pActive);
  if (pBlend) glEnable(GL_BLEND); else glDisable(GL_BLEND);
  if (pDepth) glEnable(GL_DEPTH_TEST); else glDisable(GL_DEPTH_TEST);
  if (pScissor) glEnable(GL_SCISSOR_TEST); else glDisable(GL_SCISSOR_TEST);
  s_surf_out_n++;
  // Endurance oracle: sample the present interval (feeds p50/p95 + stall count), anchor the
  // RSS/rate clock on the very first present, and periodically export a structured line.
  {
    int64_t endur_now_ns = cheng_monotime_ns();
    if (s_endur_present_last_ns != 0) {
      double ivl_ms = (double)(endur_now_ns - s_endur_present_last_ns) / 1.0e6;
      s_endur_ivl_ms[s_endur_ivl_head] = ivl_ms;
      s_endur_ivl_head = (s_endur_ivl_head + 1) % CHENG_ENDUR_RING;
      if (s_endur_ivl_count < CHENG_ENDUR_RING) s_endur_ivl_count++;
      double efps = (s_stream_ctx != NULL && s_stream_ctx->fps > 0.0) ? s_stream_ctx->fps : 30.0;
      double period_ms = 1000.0 / efps;
      if (ivl_ms > 1.5 * period_ms) s_endur_stall_n++;   // gap > 1.5x the frame period = a stall
    } else {
      s_endur_t0_ns = endur_now_ns;
      s_endur_rss0_kb = cheng_read_rss_kb();
    }
    s_endur_present_last_ns = endur_now_ns;
    // Time-based periodic (5s wall clock) alongside the 300-present count: a short clip
    // (e.g. the 186-frame content-sync asset) ends before 300 presents ever accumulate,
    // and its teardown line is lost when the route-leave also exits the process — so a
    // count-only trigger produced ZERO endurance lines for exactly the sessions slice-4
    // needs (device-window p50/p95/stall_n). Wall clock is the metric's own axis.
    static int64_t s_endur_last_report_ns = 0;
    if (s_endur_last_report_ns == 0) s_endur_last_report_ns = endur_now_ns;
    if ((s_surf_out_n % 300) == 0 ||
        (endur_now_ns - s_endur_last_report_ns) >= 5000000000LL) {
      s_endur_last_report_ns = endur_now_ns;
      cheng_endurance_report("periodic");
    }
  }
  if (s_surf_out_n <= 6 || (s_surf_out_n % 30) == 0) {
    char b[64]; snprintf(b, sizeof(b), "surf OUT n=%d", s_surf_out_n); cheng_media_diag(b);
  }
  return 1;
}

// Draw a back-button overlay (translucent dark circle + white left chevron) at the
// top-left of a fullscreen video. screen_width/height are LOGICAL px (same space as
// touch coords), so the published rect hit-tests 1:1.
void cheng_android_gpu_draw_video_back_overlay(int screen_width, int screen_height) {
  int margin = 16;
  int safe_top = 44;
  int btn = 40;
  int x = margin;
  int y = safe_top;
  cheng_android_gpu_draw_rect(screen_width, screen_height, x, y, btn, btn, 0x99000000u, btn / 2);
  uint32_t ink = 0xFFFFFFFFu;
  int cx = x + btn / 2 - 3;
  int cy = y + btn / 2;
  int arm = 9;
  int thick = 4;
  for (int i = 0; i < arm; i++) {
    cheng_android_gpu_draw_rect(screen_width, screen_height, cx + i, cy - i - thick / 2, thick, thick, ink, 1);
    cheng_android_gpu_draw_rect(screen_width, screen_height, cx + i, cy + i - thick / 2, thick, thick, ink, 1);
  }
  s_video_back_btn_x = x - 6;
  s_video_back_btn_y = y - 6;
  s_video_back_btn_w = btn + 12;
  s_video_back_btn_h = btn + 12;
}

// Producer: convert each decoded frame to RGBA and push into the bounded ring,
// blocking when full (backpressure keeps memory bounded for any-length video).
static void cheng_stream_on_new_output(OH_AVCodec* c, uint32_t index, OH_AVBuffer* buffer, void* u) {
  ChengStreamCtx* ctx = (ChengStreamCtx*)u;
  static int s_out_n = 0;
  if (__atomic_load_n(&s_surf_mode, __ATOMIC_SEQ_CST)) {
    // Zero-copy: render the decoded frame straight to the OES surface ASAP (no CPU touch).
    // Pacing is owned by the RENDER LOOP (vsync-paced at panel refresh) + the wall-clock
    // frame-index gate in draw_registered — NOT here. RenderOutputBufferAtTime is wrong for
    // this offscreen OH_NativeImage queue (no system composer time-gates a private buffer
    // queue), so just render-to-surface and let the consumer pace via UpdateSurfaceImage.
    //
    // Seek-epoch gate (see the ChengStreamCtx field comment + cheng_stream_apply_seek): this
    // path bypasses mu/ring entirely, so cheng_stream_apply_seek's fq/ring drain can never
    // reach a frame already in flight here — without this check, a decode dispatched before a
    // seek could still land on the surface after the seek completes (in-flight callback racing
    // OH_VideoDecoder_Flush, which OHOS lets finish rather than aborting it). Drop instead of
    // render whenever a seek is currently being applied (seek_epoch != seek_epoch_flushed);
    // return the buffer via FreeOutputBuffer so it goes back to the decoder's own pool instead
    // of leaking. ctx == NULL here would mean RegisterCallback was called with no userData,
    // which cheng_ohos_start_streaming_decode never does — fall through to the old
    // always-render behavior in that case since there is no epoch to gate on.
    int dropStale = 0;
    if (ctx != NULL) {
      pthread_mutex_lock(&ctx->mu);
      dropStale = (ctx->seek_epoch != ctx->seek_epoch_flushed);
      pthread_mutex_unlock(&ctx->mu);
    }
    if (dropStale) {
      char b[48]; snprintf(b, sizeof(b), "dec RENDER dropped (seek epoch, idx=%u)", index); cheng_media_diag(b);
      OH_VideoDecoder_FreeOutputBuffer(c, index);
      return;
    }
    s_out_n++;
    // 修6: capture the render-to-surface return code — it was silently discarded, which left
    // zero log signal for a producer that decodes fine but never queues a buffer to the
    // surface (the exact 40601000 NO_BUFFER family this campaign chased). Errors log loud.
    OH_AVErrCode rrc = OH_VideoDecoder_RenderOutputBuffer(c, index);
    if (s_out_n <= 6 || (s_out_n % 30) == 0 || rrc != AV_ERR_OK) {
      char b[64]; snprintf(b, sizeof(b), "dec RENDER n=%d rrc=%d", s_out_n, (int)rrc);
      if (rrc != AV_ERR_OK) { __android_log_print(ANDROID_LOG_ERROR, "ChengMD", "%{public}s", b); } else { cheng_media_diag(b); }
    }
    return;
  }
  if (ctx != NULL && buffer != NULL && !ctx->stop) {
    OH_AVCodecBufferAttr attr; memset(&attr, 0, sizeof(attr));
    OH_AVBuffer_GetBufferAttr(buffer, &attr);
    int is_eos = (attr.flags & AVCODEC_BUFFER_FLAGS_EOS) ? 1 : 0;
    s_out_n++;  // continuous decode-output meter: first 6 + every 30th (compute fps from log ts deltas)
    if (s_out_n <= 6 || (s_out_n % 30) == 0) { char b[80]; snprintf(b, sizeof(b), "dec OUT n=%d size=%d flags=%d eos=%d", s_out_n, attr.size, attr.flags, is_eos); cheng_media_diag(b); }
    uint8_t* nv12 = (!is_eos && attr.size > 0) ? OH_AVBuffer_GetAddr(buffer) : NULL;
    int w = ctx->w, h = ctx->h, stride = ctx->w, slice = ctx->h;
    OH_AVFormat* of = OH_VideoDecoder_GetOutputDescription(c);
    if (of != NULL) {
      if (!OH_AVFormat_GetIntValue(of, OH_MD_KEY_VIDEO_STRIDE, &stride) || stride < w) stride = w;
      if (!OH_AVFormat_GetIntValue(of, OH_MD_KEY_VIDEO_SLICE_HEIGHT, &slice) || slice < h) slice = h;
      OH_AVFormat_Destroy(of);
    }
    if (nv12 != NULL && w > 0 && h > 0) {
      // Take a pre-faulted RGBA buffer from the pool (no per-frame malloc).
      pthread_mutex_lock(&ctx->mu);
      unsigned char* rgba = (ctx->pool_top > 0) ? ctx->pool[--ctx->pool_top] : NULL;
      pthread_mutex_unlock(&ctx->mu);
      if (rgba != NULL) {
        cheng_nv12_to_rgba_into(rgba, nv12, w, h, stride, slice);
        pthread_mutex_lock(&ctx->mu);
        while (ctx->ring_size == CHENG_STREAM_RING_CAP && !ctx->stop) {
          pthread_cond_wait(&ctx->cv_notfull, &ctx->mu);
        }
        if (!ctx->stop) {
          ctx->ring[ctx->ring_tail] = rgba;
          ctx->ring_tail = (ctx->ring_tail + 1) % CHENG_STREAM_RING_CAP;
          ctx->ring_size++;
          rgba = NULL;
        }
        if (rgba != NULL) ctx->pool[ctx->pool_top++] = rgba;  // stopping: return to pool
        pthread_mutex_unlock(&ctx->mu);
      }
    }
  }
  OH_VideoDecoder_FreeOutputBuffer(c, index);
}

// Start a decoder fed by per-frame ES fetches. Metadata (w/h/fps/count) comes from
// es_open, not a demuxer — there is no OH_AVSource/random-access readAt. The render
// thread supplies access units via cheng_stream_prefetch_frames. 秒开: the first
// IDR (frame 0, inline SPS/PPS) decodes as soon as it is fetched.
ChengStreamCtx* cheng_ohos_start_streaming_decode(int w, int h, double fps, int frame_count) {
  if (w <= 0 || h <= 0 || frame_count <= 0) { cheng_media_diag("stream: bad meta"); return NULL; }
  ChengStreamCtx* ctx = (ChengStreamCtx*)calloc(1, sizeof(ChengStreamCtx));
  if (ctx == NULL) return NULL;
  CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_STREAM_CTX_CALLOC, sizeof(ChengStreamCtx));
  ctx->w = w; ctx->h = h;
  ctx->fps = (fps >= 1.0 && fps <= 240.0) ? fps : 30.0;
  ctx->frame_count = frame_count;
  ctx->next_frame_idx = 0;
  ctx->frame_bytes = (size_t)w * (size_t)h * 4;
  ctx->pool_top = 0;  // RGBA pool allocated below only if surface mode is unavailable
  ctx->dec = OH_VideoDecoder_CreateByMime(OH_AVCODEC_MIMETYPE_VIDEO_AVC);
  if (ctx->dec == NULL) { free(ctx); cheng_media_diag("stream: CreateByMime NULL"); return NULL; }
  OH_AVFormat* cfg = OH_AVFormat_Create();
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_WIDTH, w);
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_HEIGHT, h);
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_PIXEL_FORMAT, AV_PIXEL_FORMAT_NV12);
  OH_AVErrCode cfgRc = OH_VideoDecoder_Configure(ctx->dec, cfg);
  OH_AVFormat_Destroy(cfg);
  pthread_mutex_init(&ctx->mu, NULL);
  pthread_cond_init(&ctx->cv_notfull, NULL);
  pthread_mutex_init(&ctx->fq_mu, NULL);
  pthread_cond_init(&ctx->cv_notempty, NULL);
  pthread_cond_init(&ctx->cv_notfull_fq, NULL);
  OH_AVCodecCallback cb;
  cb.onError = cheng_dec_on_error;
  cb.onStreamChanged = cheng_dec_on_stream_changed;
  cb.onNeedInputBuffer = cheng_stream_on_need_input;
  cb.onNewOutputBuffer = cheng_stream_on_new_output;
  OH_AVErrCode regRc = OH_VideoDecoder_RegisterCallback(ctx->dec, cb, ctx);
  // Decode-to-surface: bind the OES native window (created in prepare) so the HW decoder
  // renders directly to the GPU — zero CPU conversion. If the surface isn't available,
  // fall back to the CPU NV12→RGBA path (s_surf_mode stays 0).
  if (s_surf_window != NULL && OH_VideoDecoder_SetSurface(ctx->dec, s_surf_window) == AV_ERR_OK) {
    __atomic_store_n(&s_surf_mode, 1, __ATOMIC_SEQ_CST);
    cheng_media_diag("stream: SetSurface OK (zero-copy GPU decode)");
  } else {
    cheng_media_diag("stream: no surface — CPU convert path");
    // CPU fallback only: pre-allocate + pre-fault the RGBA pool (avoids per-frame
    // 12MB malloc page-faults). Skipped in surface mode (no CPU conversion).
    for (int i = 0; i < CHENG_STREAM_RING_CAP + 2; i++) {
      unsigned char* b = (unsigned char*)malloc(ctx->frame_bytes);
      if (b == NULL) break;
      CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_CPU_RING_POOL_MALLOC, ctx->frame_bytes);
      memset(b, 0, ctx->frame_bytes);
      ctx->pool[ctx->pool_top++] = b;
    }
  }
  if (regRc != AV_ERR_OK || cfgRc != AV_ERR_OK ||
      OH_VideoDecoder_Prepare(ctx->dec) != AV_ERR_OK || OH_VideoDecoder_Start(ctx->dec) != AV_ERR_OK) {
    OH_VideoDecoder_Destroy(ctx->dec);
    // 修6: SetSurface above may already have latched s_surf_mode=1 for a decoder that just
    // died — a stale 1 would route the present path to a surface no producer exists for.
    __atomic_store_n(&s_surf_mode, 0, __ATOMIC_SEQ_CST);
    pthread_mutex_destroy(&ctx->mu); pthread_cond_destroy(&ctx->cv_notfull); pthread_mutex_destroy(&ctx->fq_mu); pthread_cond_destroy(&ctx->cv_notempty); pthread_cond_destroy(&ctx->cv_notfull_fq);
    free(ctx); cheng_media_diag("stream: register/cfg/prepare/start fail"); return NULL;
  }
  char okb[112]; snprintf(okb, sizeof(okb), "stream decode started %dx%d fps=%d frames=%d",
                          w, h, (int)(ctx->fps + 0.5), frame_count);
  cheng_media_diag(okb);
  return ctx;
}

// Render-thread ES prefetch: the ONLY place the Cheng QUIC bridge runs (single-
// threaded runtime). Fetch access units into the input FIFO until it is full, then
// return (non-blocking). Loops at frame_count (frame 0 is an IDR → resumes cleanly).
// pts is monotonic across loop wraps so the decoder never drops frames.
#define CHENG_STREAM_MAXFRAME 262144
static int64_t s_stream_pts_seq = 0;
int s_stream_prefetch_total = 0;  // non-static: gen.c's deferred audio-open gate reads it (修3)
static void cheng_stream_prefetch_frames(ChengStreamCtx* ctx) {
  if (ctx == NULL || ctx->stop) return;
  extern int32_t cheng_scene_media_es_fetch_frame(int32_t frameIdx, void* outBuf, int32_t outCap);
  // Fetch AT MOST ONE frame per call: each fetch re-dials QUIC (~0.4s), so filling
  // the whole FIFO in one call would block the render thread for seconds and starve
  // the OHOS render loop (present stops). One-per-present keeps the loop alive.
  pthread_mutex_lock(&ctx->fq_mu);
  int hasSlot = (ctx->fq_size < CHENG_STREAM_FQ_CAP);
  pthread_mutex_unlock(&ctx->fq_mu);
  if (!hasSlot) return;
  unsigned char* bytes = (unsigned char*)malloc(CHENG_STREAM_MAXFRAME);
  if (bytes == NULL) return;
  CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_ES_PREFETCH_MALLOC, CHENG_STREAM_MAXFRAME);
  int idx = ctx->next_frame_idx;
  int n = cheng_scene_media_es_fetch_frame(idx, bytes, CHENG_STREAM_MAXFRAME);
  if (n <= 0) { free(bytes); return; }   // transient fetch failure — retry next present
  int key = (idx == 0);                  // IDR at stream start (inline SPS/PPS)
  int64_t pts = s_stream_pts_seq;
  s_stream_pts_seq += (int64_t)(1000000.0 / ctx->fps);
  pthread_mutex_lock(&ctx->fq_mu);
  if (ctx->fq_size < CHENG_STREAM_FQ_CAP) {
    ctx->fq[ctx->fq_tail] = bytes; ctx->fq_len[ctx->fq_tail] = n;
    ctx->fq_pts[ctx->fq_tail] = pts; ctx->fq_key[ctx->fq_tail] = key;
    ctx->fq_tail = (ctx->fq_tail + 1) % CHENG_STREAM_FQ_CAP;
    ctx->fq_size++;
    bytes = NULL;
    pthread_cond_signal(&ctx->cv_notempty);  // wake the codec waiting for input
  }
  pthread_mutex_unlock(&ctx->fq_mu);
  if (bytes != NULL) { free(bytes); return; }
  s_stream_prefetch_total++;
  if (s_stream_prefetch_total <= 8 || (s_stream_prefetch_total % 30) == 0) {
    char pb[80]; snprintf(pb, sizeof(pb), "es prefetch idx=%d n=%d total=%d", idx, n, s_stream_prefetch_total);
    cheng_media_diag(pb);
  }
  ctx->next_frame_idx++;
  if (ctx->next_frame_idx >= ctx->frame_count) ctx->next_frame_idx = 0;
}

// ---- playback-window block-cache pin (容量淘汰 pinned 豁免的宿主侧接线) -------------
// The S4 disk block cache (web_scene_media_block_cache.cheng) evicts cached GOP blocks
// LRU-style under capacity pressure; its pinned flag exempts the block the playback
// window is currently consuming (agent-4's WebSceneMediaBlockCacheSetPinned, honest
// false on a missing key). This wires that flag on Harmony: when the ES pump crosses
// INTO a new GOP (cheng_scene_media_es_sink_frame's key==1 — the real GOP-start bit
// off the .moqidx flags word), the previous GOP's block is unpinned and the new GOP's
// block is pinned, keyed (assetCid, gopStartFrameIdx, isAudio=0) exactly as the
// bridge's own WebSceneMediaBlockCachePut keys it. A seek leaves the current GOP
// (cheng_stream_apply_seek clears; the post-seek GOP is re-pinned by the sink when the
// pump pushes its snapped keyframe), and session teardown
// (cheng_stream_teardown_active / cheng_android_media_texture_release) always leaves
// zero pins behind — a stale pin would permanently exempt a dead session's block.
//
// The assetCid is the on-wire announce asset_cid, which only the Cheng bridge holds
// (webSceneMediaEsAssetCid) — the host learns it via the cheng_scene_media_es_asset_cid
// export (strToCStringTemp, same shape as cheng_scene_media_es_last_error), NOT from
// any host-side state. Both symbols resolve via the S4 self-dlopen precedent
// (dladdr + RTLD_NOLOAD on this process's own image, dlopen(NULL) fallback — the scene
// objects are statically linked into this .so); a scene .so baked before the wrappers
// existed lacks them, which logs ONE loud ERROR and latches the miss (no dlsym retry
// per GOP, no silent degrade — the pin simply stays off and the log says why).
//
// Thread model (matches the cache module's own single-fetch-thread note in
// web_scene_media_block_cache.cheng): pin transitions run ONLY on the fetch thread
// (the sink and the network path's cheng_stream_apply_seek are both called there),
// teardown clears run on the render thread strictly AFTER pthread_join of the fetch
// thread (same post-join single-thread argument as cheng_audio_es_teardown), so no
// lock is introduced. The pin call itself is pure in-memory bookkeeping on the cache
// module's entries (find key, flip flag — no manifest persist, no I/O), and it is
// made OUTSIDE fq_mu so no host lock is ever held across a Cheng-runtime call.
typedef int32_t (*cheng_block_cache_set_pinned_fn)(const char*, int32_t, int32_t, int32_t);
typedef const char* (*cheng_es_asset_cid_cstr_fn)(void);
static cheng_block_cache_set_pinned_fn s_block_cache_set_pinned_fn = NULL;
static cheng_es_asset_cid_cstr_fn s_es_asset_cid_fn = NULL;
static int s_media_pin_resolve = 0;   // 0 = untried, 1 = ready, 2 = missing (logged once, latched)
static int32_t s_media_pin_gop = -1;  // currently pinned GOP start frame; -1 = no pin held
static char s_media_pin_cid[96];      // assetCid of the held pin (64-hex + NUL); empty = none

static int cheng_stream_media_pin_resolve(void) {
  if (s_media_pin_resolve != 0) return s_media_pin_resolve == 1;
  s_media_pin_resolve = 2;   // latched until BOTH symbols resolve below
  void* h = NULL;
  Dl_info self_info;
  if (dladdr((void*)&cheng_stream_media_pin_resolve, &self_info) && self_info.dli_fname != NULL) {
    h = dlopen(self_info.dli_fname, RTLD_NOW | RTLD_NOLOAD);
  }
  if (h == NULL) {
    h = dlopen(NULL, RTLD_NOW | RTLD_GLOBAL);
  }
  if (h == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "media pin: self dlopen failed: %s", dlerror());
    return 0;
  }
  s_block_cache_set_pinned_fn = (cheng_block_cache_set_pinned_fn)dlsym(h, "cheng_scene_media_block_cache_set_pinned");
  s_es_asset_cid_fn = (cheng_es_asset_cid_cstr_fn)dlsym(h, "cheng_scene_media_es_asset_cid");
  if (s_block_cache_set_pinned_fn == NULL || s_es_asset_cid_fn == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                        "media pin: dlsym missing (set_pinned=%p es_asset_cid=%p) — playing GOP NOT protected from block-cache eviction (scene .so predates the pin wrappers?)",
                        (void*)s_block_cache_set_pinned_fn, (void*)s_es_asset_cid_fn);
    return 0;
  }
  s_media_pin_resolve = 1;
  return 1;
}

// Switch the pinned GOP to newGopStart (-1 = clear only). No-op when the GOP is
// unchanged. On any failure (exports missing, empty cid, key not yet cached) the pin
// bookkeeping is left cleared (nothing held), never faked.
static void cheng_stream_media_pin_switch(int32_t newGopStart) {
  if (newGopStart == s_media_pin_gop) return;
  if (cheng_stream_media_pin_resolve() && s_media_pin_gop >= 0 && s_media_pin_cid[0] != '\0') {
    int32_t uok = s_block_cache_set_pinned_fn(s_media_pin_cid, s_media_pin_gop, 0, 0);
    char ub[128]; snprintf(ub, sizeof(ub), "media pin: unpin gop=%d ok=%d", (int)s_media_pin_gop, (int)uok);
    cheng_media_diag(ub);
  }
  s_media_pin_gop = -1;
  s_media_pin_cid[0] = '\0';
  if (newGopStart < 0) return;
  if (!cheng_stream_media_pin_resolve()) return;   // the one loud ERROR was already logged
  const char* cidRaw = s_es_asset_cid_fn();
  if (cidRaw == NULL || cidRaw[0] == '\0') {
    cheng_media_diag("media pin: es asset cid empty (no open ES session) — GOP not pinned");
    return;
  }
  // strToCStringTemp storage is owned by the Cheng runtime and reused by later bridge
  // calls — copy out NOW, before the set_pinned call below re-enters the runtime.
  char cid[96];
  snprintf(cid, sizeof(cid), "%s", cidRaw);
  int32_t pok = s_block_cache_set_pinned_fn(cid, newGopStart, 0, 1);
  if (pok != 1) {
    // Honest false (agent-4's contract): the block is not cached — cold first GOP with
    // no prewarm, or past the prewarmed window (Harmony wires no video prefetch tick,
    // so those GOPs are network-served and never enter the cache). Nothing to protect.
    char pb[144]; snprintf(pb, sizeof(pb), "media pin: pin miss gop=%d (block not cached)", (int)newGopStart);
    cheng_media_diag(pb);
    return;
  }
  snprintf(s_media_pin_cid, sizeof(s_media_pin_cid), "%s", cid);
  s_media_pin_gop = newGopStart;
  char pb[160]; snprintf(pb, sizeof(pb), "media pin: pinned gop=%d cid=%.12s...", (int)newGopStart, cid);
  cheng_media_diag(pb);
}

// Sink for the persistent-connection ES stream loop (called from the Cheng bridge's
// WebSceneMediaEsStreamLoop over the @importc seam). Copies one access unit
// (runData[inRunOff .. inRunOff+frameSize)) into the input FIFO, BLOCKING when the FIFO
// is full (backpressure paces the fetch to playback). Returns 1 to continue, 0 to stop.
// `key` is the real GOP-start bit read from the .moqidx flags word (bridge's
// WebSceneMediaEsIsKeyFrame field, S1) — replaces the previous frameIdx==0 approximation so
// AVCODEC_BUFFER_FLAGS_SYNC_FRAME (consumed at cheng_gui_host_gen.c ~:3686) reflects the
// stream's actual periodic GOP structure, not just the very first frame of the session.
// External linkage so the bridge's @importc resolves at HAP link time.
int32_t cheng_scene_media_es_sink_frame(int32_t frameIdx, const void* runData, int32_t inRunOff, int32_t frameSize, int32_t key) {
  ChengStreamCtx* sc = s_stream_ctx;
  if (sc == NULL || runData == NULL || frameSize <= 0) return 1;  // skip frame, keep streaming
  const unsigned char* src = (const unsigned char*)runData + inRunOff;
  pthread_mutex_lock(&sc->fq_mu);
  while (sc->fq_size >= CHENG_STREAM_FQ_CAP && !sc->stop) {
    pthread_cond_wait(&sc->cv_notfull_fq, &sc->fq_mu);   // FIFO full → wait for the codec to drain
  }
  if (sc->stop) { pthread_mutex_unlock(&sc->fq_mu); return 0; }
  unsigned char* b = (unsigned char*)malloc((size_t)frameSize);
  if (b == NULL) { pthread_mutex_unlock(&sc->fq_mu); return 1; }
  CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_ES_SINK_MALLOC, frameSize);
  memcpy(b, src, (size_t)frameSize);
  int64_t pts = s_stream_pts_seq;
  s_stream_pts_seq += (int64_t)(1000000.0 / (sc->fps > 0.0 ? sc->fps : 30.0));
  sc->fq[sc->fq_tail] = b; sc->fq_len[sc->fq_tail] = frameSize;
  sc->fq_pts[sc->fq_tail] = pts; sc->fq_key[sc->fq_tail] = key;
  sc->fq_tail = (sc->fq_tail + 1) % CHENG_STREAM_FQ_CAP;
  sc->fq_size++;
  pthread_cond_signal(&sc->cv_notempty);
  s_endur_es_sink_n++;   // endurance oracle: ES sink rate (network path)
  s_stream_prefetch_total++;
  if (s_stream_prefetch_total <= 8 || (s_stream_prefetch_total % 30) == 0) {
    char pb[80]; snprintf(pb, sizeof(pb), "es sink idx=%d n=%d total=%d", frameIdx, frameSize, s_stream_prefetch_total);
    cheng_media_diag(pb);
  }
  int stop = sc->stop;
  pthread_mutex_unlock(&sc->fq_mu);
  if (key == 1) {
    // Pump crossed into a new GOP (real .moqidx GOP-start bit) — move the block-cache
    // pin from the previous GOP to this one (video key isAudio=0). Runs AFTER fq_mu is
    // released: no host lock is held across the dlsym'd Cheng-runtime call. The switch
    // itself dedupes on an unchanged GOP.
    cheng_stream_media_pin_switch(frameIdx);
  }
  return stop ? 0 : 1;
}

// #14 r2: defined with the media-control mailbox block far below (after
// cheng_host_video_seek). Teardown (route leave) must drop any still-unconsumed
// external media action so it can never be applied to the NEXT stream/route —
// mailbox contract: cleared on teardown, logged. Same-thread with the drain
// (both render thread), so this cannot race the consumer, only the ArkTS writer,
// against which the mailbox mutex guards.
static void cheng_host_media_mailbox_clear(const char* reason);

// #14 S5 v4 (session-generation counter, hardens v3's sampling-window residual): a plain
// NULL-sampling edge (v3's s_had_sc_last_frame) can only detect a teardown if some call to
// cheng_host_video_sync_paused_requested lands in the window where s_stream_ctx reads NULL.
// Both stream-establishment paths (cheng_stream_local_file_worker, cheng_stream_fetch_worker)
// run unconditionally on a pthread_create-backed fetch thread (gen.c's single dispatch site),
// so teardown's NULL-out and the next session's non-NULL write are two independent, racily
// timed writes — the NULL window between them can, in principle, be fully skipped by every
// render-thread call to sync() if the fetch thread re-establishes fast enough. This counter
// makes the session boundary itself the signal instead of a transient value: it is incremented
// exactly once per call to cheng_stream_teardown_active (below), which — like the sync function
// that reads it — runs 100% on g_render_thread (gen.c:3175's sole call site, itself only
// reachable from cheng_gui_host_tick), so writer and reader are thread-serial by RenderLoop's
// call order, same as every other render-thread-only static in this file. A counter cannot
// suffer the sampling miss a boolean NULL-edge can: even if the NULL window is never observed,
// the value has still moved by exactly 1 relative to whatever the reader last recorded.
static unsigned int s_stream_session_gen = 0;

// #14 S5 v5: hoisted out of cheng_host_video_sync_paused_requested (was a function-local
// static there) so cheng_stream_teardown_active below can reset it directly, in place, at
// the exact instant the old session ends — see the reset below and the v5 paragraph on
// cheng_host_video_sync_paused_requested for why the reset moved here from sync's gen-check.
// Still render-thread-owned/touched only by these two render-thread-only functions.
static int s_last_seen_paused = 0;    // matches s_stream_paused's cheng_gui_host_gen.c init (0)

// Tear down the active stream (network OR local) and reset all stream globals so the
// next video route spawns fresh. MUST run on the render thread with the EGL context
// current (draw path), since it frees the decode-to-surface GL resources. Without this
// the first-tapped stream persists (single decoder/thread), so a later route would show
// the previous card's video. Mirrors the cache-release teardown but on the globals.
void cheng_stream_teardown_active(void) {
  // Bumped first, unconditionally, as the function's single entry point (before the
  // no-op early-return a few lines down) so every call to this function — including a
  // call that finds nothing to tear down — advances the generation exactly once. The
  // call site (gen.c:3175) only ever invokes this function when a stream was active or
  // starting, so every call here really is a session boundary, never a spurious no-op
  // reset of a session that hasn't begun yet.
  s_stream_session_gen++;
  // #14 S5 v5 (session-end reset moved here from sync's gen-check, replacing v4's
  // reset-on-next-sync-call): resetting s_stream_paused/s_last_seen_paused HERE, at the
  // precise render-thread instant the old session ends, is strictly earlier than any touch
  // event belonging to the NEXT session can possibly land (that session's route isn't even
  // navigated to yet). v4 instead cleared these two on the first sync() call to observe the
  // generation bump, which could run after the touch thread had already written a fresh
  // pause for the new session in the teardown-to-establish gap — silently discarding that
  // intent (v4's self-constructed sixth-scenario residual). Doing it here removes that
  // ordering hazard: a stale value from the old session is what gets zeroed, and any write
  // the touch thread performs after this point in time is, by construction, for the new
  // session and is never touched by this line again.
  s_stream_paused = 0;
  s_last_seen_paused = 0;
  cheng_endurance_report("teardown");   // final oracle line for this session (no-op if it never presented)
  cheng_host_media_mailbox_clear("stream teardown");
  // Tear down the local-file audio player first (independent of the video stream).
  if (s_audio_player != NULL) {
    OH_AVPlayer_Stop(s_audio_player);
    OH_AVPlayer_ReleaseSync(s_audio_player);
    s_audio_player = NULL;
    cheng_media_diag("audio: AVPlayer released");
  }
  if (s_audio_player_fd >= 0) { close(s_audio_player_fd); s_audio_player_fd = -1; }
  if (s_stream_ctx == NULL && !s_stream_starting && !s_fetch_thread_started) {
    // #14 S8 v2: nothing video-side to join, so no fetch thread could possibly still be
    // inside cheng_audio_es_prefetch_push/apply_seek (engage only ever happens FROM that
    // thread, which requires s_fetch_thread_started to have been 1) — tearing down here is
    // still safe (cheng_audio_es_teardown is idempotent/no-op when never engaged), and
    // matches the "audio teardown is unconditional at every exit of this function" contract.
    cheng_audio_es_teardown();
    return;
  }
  ChengStreamCtx* sc = s_stream_ctx;
  if (sc != NULL) {
    pthread_mutex_lock(&sc->mu); sc->stop = 1; pthread_cond_broadcast(&sc->cv_notfull); pthread_mutex_unlock(&sc->mu);
    pthread_mutex_lock(&sc->fq_mu);
    pthread_cond_broadcast(&sc->cv_notempty); pthread_cond_broadcast(&sc->cv_notfull_fq);
    pthread_mutex_unlock(&sc->fq_mu);
  }
  // #139: abort any in-flight trickling fetch BEFORE this join — with the cancel export
  // the join waits ≤ one 20s pipe-read idle window; without it (older scene .so) it is
  // still bounded by the size-aware whole-fetch cumulative deadline plus that window. Either
  // way finite by construction (was: structurally unbounded against a ≥1-byte-per-20s
  // trickling peer — S8 区制 C). See cheng_stream_fetch_cancel_request's header.
  cheng_stream_fetch_cancel_request();
  if (s_fetch_thread_started) { pthread_join(s_fetch_thread, NULL); s_fetch_thread_started = 0; }
  // #14 S8 v2 (fix for v1's REFUTED ordering, see fix_verdict.md's teardownOrderProof):
  // tear down the ES audio pipeline ONLY after pthread_join above has returned — the fetch
  // thread (the sole caller of cheng_audio_es_prefetch_push/apply_seek) is now structurally
  // dead, so cheng_audio_es_teardown's mutex/cond destroy below can never race a still-running
  // fetch-thread call into those primitives. Mirrors the video decoder's own Stop/Destroy a
  // line below, which already waits until after this same pthread_join for the identical reason.
  cheng_audio_es_teardown();
  if (sc != NULL && sc->dec != NULL) { OH_VideoDecoder_Stop(sc->dec); OH_VideoDecoder_Destroy(sc->dec); sc->dec = NULL; }
  // Free decode-to-surface GL resources (render thread, EGL current).
  if (s_surf_nimg != NULL || __atomic_load_n(&s_surf_mode, __ATOMIC_SEQ_CST)) {
    __atomic_store_n(&s_surf_mode, 0, __ATOMIC_SEQ_CST);
    if (s_surf_fbo != 0u) { glDeleteFramebuffers(1, &s_surf_fbo); s_surf_fbo = 0u; }
    if (s_surf_prog != 0u) { glDeleteProgram(s_surf_prog); s_surf_prog = 0u; }
    if (s_surf_vao != 0u) { glDeleteVertexArrays(1, &s_surf_vao); s_surf_vao = 0u; }
    if (s_stream_tex != 0u) { glDeleteTextures(1, &s_stream_tex); s_stream_tex = 0u; }
    if (s_surf_nimg != NULL) { OH_NativeImage_Destroy(&s_surf_nimg); s_surf_nimg = NULL; }
    if (s_surf_oes_tex != 0u) { glDeleteTextures(1, &s_surf_oes_tex); s_surf_oes_tex = 0u; }
    s_surf_window = NULL; s_surf_have_frame = 0; s_surf_out_n = 0;
  }
  s_stream_play_base_ns = 0; s_stream_last_frame_idx = -1;
  if (sc != NULL) {
    while (sc->ring_size > 0) { free(sc->ring[sc->ring_head]); sc->ring_head = (sc->ring_head + 1) % CHENG_STREAM_RING_CAP; sc->ring_size--; }
    while (sc->pool_top > 0) free(sc->pool[--sc->pool_top]);
    pthread_mutex_lock(&sc->fq_mu);
    while (sc->fq_size > 0) { free(sc->fq[sc->fq_head]); sc->fq_head = (sc->fq_head + 1) % CHENG_STREAM_FQ_CAP; sc->fq_size--; }
    pthread_mutex_unlock(&sc->fq_mu);
    pthread_mutex_destroy(&sc->mu); pthread_cond_destroy(&sc->cv_notfull);
    pthread_mutex_destroy(&sc->fq_mu); pthread_cond_destroy(&sc->cv_notempty); pthread_cond_destroy(&sc->cv_notfull_fq);
    free(sc);
  }
  s_stream_ctx = NULL;
  __atomic_store_n(&s_stream_ready, 0, __ATOMIC_SEQ_CST);
  s_stream_starting = 0;
  s_fetch_route = -1;
  // Reset EOS + endurance state so the NEXT playback session starts clean (the one-shot feed
  // prewarm guard s_prewarm_started is deliberately NOT reset — it is per app session).
  __atomic_store_n(&s_stream_src_eof, 0, __ATOMIC_SEQ_CST);
  s_stream_eos = 0; s_stream_eos_logged = 0;
  s_endur_ivl_head = 0; s_endur_ivl_count = 0; s_endur_present_last_ns = 0;
  s_endur_stall_n = 0; s_endur_es_sink_n = 0; s_endur_t0_ns = 0; s_endur_rss0_kb = 0;
  // Invalidate the texture-cache entry this stream owned (replayblack fix,
  // 2026-07-11 — see s_active_stream_texture's declaration comment). Without this,
  // the entry stays valid=1 with gl_texture pointing at the s_stream_tex name just
  // deleted above: same-card re-entry hits prepare_media_surface_texture's cache-hit
  // fast path, never re-spawns the worker/surface, and composites a dangling GL
  // texture name forever (GLES samples an incomplete/never-respecified texture as
  // solid black — the reported same-card replay black screen). Reuses the existing
  // per-texture release (cheng_android_gpu_destroy's own cleanup path) so only THIS
  // card's entry is torn down — other cached cards' posters/textures are untouched.
  if (s_active_stream_texture != NULL) {
    cheng_android_media_texture_release(s_active_stream_texture);
    s_active_stream_texture = NULL;
  }
  cheng_video_vsync_disengage();  // route left: fall back to event-driven pacing
  cheng_media_diag("stream teardown (route left video)");
}

// Lightweight seek reset (video-seek-scrub-blueprint.md §S3a): drains the input FIFO and
// output ring, flushes the decoder, and resets the play-clock globals — WITHOUT tearing down
// the decoder/surface/threads (mirrors the fq/ring drain in cheng_stream_teardown_active above,
// extracted so seek does not duplicate it, but returns ring buffers to the pool instead of
// freeing them since decode continues and the pool is reused). Callers own the ordering: the
// network path's fetch thread calls this AFTER repositioning the Cheng bridge's ES cursor
// (WebSceneMediaEsSeekToPositionMs, via cheng_scene_media_es_seek_to_position_ms) so the FIFO
// this drains is not immediately refilled with pre-seek frames; the local-file path's worker
// calls this AFTER OH_AVDemuxer_SeekToTime for the same reason. Both callers own sc->dec
// (created once in cheng_ohos_start_streaming_decode and never recreated here), so Flush (not
// Stop/Destroy) is correct — the decoder keeps running, it just discards buffered/in-flight
// state and resumes taking input from cheng_stream_on_need_input as normal.
void cheng_stream_apply_seek(ChengStreamCtx* sc) {
  if (sc == NULL) return;
  // Open the seek-epoch gate FIRST (before touching fq/ring or calling Flush) — see the
  // seek_epoch/seek_epoch_flushed comment on ChengStreamCtx. This is what
  // cheng_stream_on_new_output's zero-copy branch checks to drop in-flight pre-seek frames
  // that OH_VideoDecoder_Flush cannot retroactively un-render from the surface.
  pthread_mutex_lock(&sc->mu);
  sc->seek_epoch++;
  pthread_mutex_unlock(&sc->mu);
  pthread_mutex_lock(&sc->fq_mu);
  while (sc->fq_size > 0) {
    free(sc->fq[sc->fq_head]);
    sc->fq_head = (sc->fq_head + 1) % CHENG_STREAM_FQ_CAP;
    sc->fq_size--;
  }
  // #14-eos: clear a possibly-stale EOS mark from a PRIOR pass over this same clip
  // (network ES loops) — without this, a seek to a non-final position after the pump
  // already reached the end once would leave input_done=1, and cheng_stream_on_need_input
  // would push an immediate EOS instead of waiting for the (about to arrive) post-seek
  // frames. Mirrors cheng_audio_es_apply_seek's identical reset below.
  sc->input_done = 0;
  pthread_cond_signal(&sc->cv_notfull_fq);  // a producer may be backed off waiting for FIFO space
  pthread_mutex_unlock(&sc->fq_mu);
  pthread_mutex_lock(&sc->mu);
  while (sc->ring_size > 0) {
    sc->pool[sc->pool_top++] = sc->ring[sc->ring_head];  // recycle, not free — decode continues
    sc->ring_head = (sc->ring_head + 1) % CHENG_STREAM_RING_CAP;
    sc->ring_size--;
  }
  pthread_cond_signal(&sc->cv_notfull);  // the decoder's output callback may be waiting for pool/ring space
  pthread_mutex_unlock(&sc->mu);
  // Flush is called with NO lock held (mu and fq_mu both released above). OHOS's own contract
  // (native_avcodec_videodecoder.h OH_VideoDecoder_Flush + the AVCodec video-decoding guide:
  // "If flush()/reset()/stop()/destroy() is executed in a non-callback thread, the execution
  // result is returned after all callbacks are executed") means Flush blocks here until any
  // onNewOutputBuffer callback that was already running when we called it has fully returned.
  // cheng_stream_on_new_output's CPU-convert branch takes sc->mu to push into the ring — if we
  // held mu across this call, that in-flight callback could never acquire it to finish, Flush
  // could never observe it as complete, and we would deadlock against our own lock. Calling it
  // unlocked is what makes this safe.
  if (sc->dec != NULL) {
    OH_AVErrCode frc = OH_VideoDecoder_Flush(sc->dec);
    char fb[48]; snprintf(fb, sizeof(fb), "seek: decoder flush rc=%d", (int)frc); cheng_media_diag(fb);
  }
  // Second drain (CPU-convert path): the callback above could have pushed one more frame into
  // the ring during the unlock-to-Flush-return window. Flush's "blocks until all callbacks are
  // executed" guarantee means that stray push, if it happened, is already complete by the time
  // Flush returns — this drain sweeps it out before any consumer can read a pre-seek frame.
  pthread_mutex_lock(&sc->mu);
  while (sc->ring_size > 0) {
    sc->pool[sc->pool_top++] = sc->ring[sc->ring_head];
    sc->ring_head = (sc->ring_head + 1) % CHENG_STREAM_RING_CAP;
    sc->ring_size--;
  }
  pthread_cond_signal(&sc->cv_notfull);
  // Close the seek-epoch gate: any onNewOutputBuffer callback observing seek_epoch ==
  // seek_epoch_flushed from here on is guaranteed (by the same Flush contract) to be decoding
  // post-seek input only — render it normally.
  sc->seek_epoch_flushed = sc->seek_epoch;
  pthread_mutex_unlock(&sc->mu);
  s_stream_pts_seq = 0;
  s_stream_play_base_ns = cheng_monotime_ns();
  s_stream_last_frame_idx = -1;
  // A seek leaves the current GOP: clear its block-cache pin (no-op when none is held
  // — e.g. the local-file path, whose sink never fires). The post-seek GOP is
  // re-pinned by cheng_scene_media_es_sink_frame when the pump pushes its snapped
  // keyframe (seek always lands on a real GOP head, S3a). Runs on the fetch thread
  // for the network path (see the pin block's thread-model comment above).
  cheng_stream_media_pin_switch(-1);
  cheng_media_diag("seek: applied (fq/ring drained x2, decoder flushed, epoch closed, pts reset)");
}

// #14-eos: marks the video ES input FIFO's producer (the fetch thread, the only caller —
// see cheng_stream_fetch_worker) as exhausted once WebSceneMediaEsStreamLoop returns rc==7
// (pump cursor has passed the last frame — source exhaustion, not an error). Wakes
// cheng_stream_on_need_input (the codec's own OH_AVCodecCallback thread), which already
// waits on this same cv_notempty for a frame, so it can push an EOS buffer instead of
// waiting forever for a frame that will never arrive. Single writer (fetch thread) /
// single reader (codec callback thread), write under fq_mu + cond_broadcast — the exact
// shape cheng_audio_es_mark_input_done below uses for the audio-side twin.
void cheng_stream_mark_video_input_done(ChengStreamCtx* sc) {
  if (sc == NULL) return;
  pthread_mutex_lock(&sc->fq_mu);
  sc->input_done = 1;
  pthread_cond_broadcast(&sc->cv_notempty);
  pthread_mutex_unlock(&sc->fq_mu);
}

// ===== #14 S8 slice1: HarmonyOS Audio ES consumption chain =====================
// video-seek-scrub-blueprint.md §7.1 选项 A (音频 ES 化) — Option A parity with the
// Android host's ChengAndroidAudioEsStreamCtx family (mobile_shell_codegen.cheng,
// landed b710fb7de/S7 aa6f3101d-lineage). Harmony has no AMediaCodec poll loop; it
// decodes via OHOS's own async OH_AVCodecCallback idiom — the SAME one the video
// decoder above already uses (OH_AudioCodec_* is the audio twin of OH_VideoDecoder_*,
// same OH_AVCodec/OH_AVCodecCallback/OH_AVBuffer types, same "onNeedInputBuffer WAITS
// on a condvar the fetch thread signals" shape as cheng_stream_on_need_input in
// cheng_gui_host_gen.c). Output goes to OH_AudioRenderer (libohaudio.so, low-latency),
// whose OnWriteData callback is its own realtime audio thread — the audio-side twin of
// cheng_stream_on_new_output's zero-copy present path above.
//
// Thread ownership (see fix_verdict.md's threadModelProof table for the full picture):
//   - cheng_audio_es_engage / cheng_audio_es_prefetch_push / cheng_audio_es_apply_seek /
//     cheng_audio_es_teardown: called ONLY from cheng_stream_fetch_worker (the fetch
//     thread — the single thread allowed to touch the Cheng QUIC bridge on Harmony,
//     see that function's own header comment) or, for teardown, from
//     cheng_stream_teardown_active (render thread, after the fetch thread has been
//     pthread_join'd — never concurrent with the fetch thread by construction, same
//     invariant the video decoder teardown above already relies on).
//   - cheng_aes_on_error/on_stream_changed/on_need_input/on_new_output: OHOS's codec-
//     internal thread (never the fetch or render thread — mirrors cheng_dec_on_error/
//     cheng_stream_on_need_input's own documented ownership above).
//   - cheng_aes_render_write_callback: OHOS's own realtime audio thread (ohaudio),
//     the audio-side twin of Android's AAudio data callback — touches ONLY the PCM
//     ring + frames_played, both under pcm_mu, zero calls/allocs/IO in the critical
//     section (S7 v2 lock-widen precedent: this is a NEW ctx so there is no legacy
//     race to close, but the same lock-discipline is applied from day one).
#define CHENG_AES_FQ_CAP 64
#define CHENG_AES_MAXFRAME 16384
#define CHENG_AES_PCM_RING_FRAMES 65536  /* sample-frames; ~1.4s headroom at 48kHz */
typedef struct ChengAudioEsStreamCtx {
  pthread_mutex_t fq_mu;
  pthread_cond_t cv_notempty;      // cheng_aes_on_need_input waits here (mirrors sc->cv_notempty above)
  pthread_cond_t cv_notfull_fq;    // reserved for a future blocking producer; broadcast on stop/seek
  unsigned char* fq[CHENG_AES_FQ_CAP];
  int32_t fq_len[CHENG_AES_FQ_CAP];
  int fq_head, fq_tail, fq_size;
  int next_frame_idx;              // fetch-thread prefetch cursor (loops at frame_count)
  int frame_count;
  int64_t pts_seq;                 // monotonic ADTS-AU pts (1024 samples/frame)
  int sample_rate;
  int channels;
  int input_done;
  volatile int stop;
  pthread_mutex_t pcm_mu;          // protects the PCM ring AND frames_played together
  int16_t* pcm;                    // malloc'd: pcm_cap_samples int16 slots
  int pcm_cap_samples;
  int pcm_head, pcm_tail, pcm_size;
  volatile int64_t frames_played;  // total sample-frames the renderer has consumed
} ChengAudioEsStreamCtx;
static ChengAudioEsStreamCtx s_aes_ctx;
static int s_aes_ctx_inited = 0;
static volatile int s_aes_engaged = 0;   // 1 once decoder+renderer are both live
static OH_AVCodec* s_aes_dec = NULL;
static OH_AudioRenderer* s_aes_renderer = NULL;

static void cheng_audio_es_ctx_init(void) {
  if (s_aes_ctx_inited) return;
  memset(&s_aes_ctx, 0, sizeof(s_aes_ctx));
  pthread_mutex_init(&s_aes_ctx.fq_mu, NULL);
  pthread_cond_init(&s_aes_ctx.cv_notempty, NULL);
  pthread_cond_init(&s_aes_ctx.cv_notfull_fq, NULL);
  pthread_mutex_init(&s_aes_ctx.pcm_mu, NULL);
  s_aes_ctx_inited = 1;
}

static void cheng_aes_on_error(OH_AVCodec* c, int32_t e, void* u) {
  (void)c; (void)u;
  char b[48]; snprintf(b, sizeof(b), "aes dec on_error code=%d", e); cheng_media_diag(b);
}
static void cheng_aes_on_stream_changed(OH_AVCodec* c, OH_AVFormat* f, void* u) {
  (void)c; (void)f; (void)u; cheng_media_diag("aes dec on_stream_changed");
}

// Codec-internal thread: WAIT for an AAC ADTS AU the fetch thread pushed (mirrors
// cheng_stream_on_need_input's blocking-wait shape exactly, the established Harmony
// idiom — NOT Android's non-blocking poll). Must not return without pushing (or the
// codec loses this buffer offer and starves), except when stopping.
static void cheng_aes_on_need_input(OH_AVCodec* c, uint32_t index, OH_AVBuffer* buffer, void* u) {
  ChengAudioEsStreamCtx* sc = (ChengAudioEsStreamCtx*)u;
  if (sc == NULL || buffer == NULL || sc->stop) return;
  unsigned char* bytes = NULL; int32_t len = 0;
  pthread_mutex_lock(&sc->fq_mu);
  while (sc->fq_size == 0 && !sc->stop && !sc->input_done) {
    pthread_cond_wait(&sc->cv_notempty, &sc->fq_mu);
  }
  int eos = (sc->fq_size == 0 && sc->input_done) ? 1 : 0;
  if (sc->fq_size > 0) {
    bytes = sc->fq[sc->fq_head]; len = sc->fq_len[sc->fq_head];
    sc->fq_head = (sc->fq_head + 1) % CHENG_AES_FQ_CAP;
    sc->fq_size--;
    pthread_cond_signal(&sc->cv_notfull_fq);
  }
  int stop = sc->stop;
  pthread_mutex_unlock(&sc->fq_mu);
  if (stop) return;  // teardown in progress — the buffer index is about to be invalidated by Stop/Destroy
  OH_AVCodecBufferAttr attr; memset(&attr, 0, sizeof(attr));
  if (bytes != NULL) {
    uint8_t* addr = OH_AVBuffer_GetAddr(buffer);
    int32_t cap = OH_AVBuffer_GetCapacity(buffer);
    if (addr != NULL && len > 0 && len <= cap) {
      memcpy(addr, bytes, (size_t)len);
      attr.offset = 0; attr.size = len; attr.pts = sc->pts_seq;
      sc->pts_seq += (int64_t)(1024.0 * 1000000.0 / (double)(sc->sample_rate > 0 ? sc->sample_rate : 48000));
    }
    free(bytes);
  } else if (eos) {
    attr.flags = AVCODEC_BUFFER_FLAGS_EOS;
  }
  OH_AVBuffer_SetBufferAttr(buffer, &attr);
  OH_AudioCodec_PushInputBuffer(c, index);
}

// Codec-internal thread: decoded PCM -> ring (mirrors cheng_dec_on_new_output's
// pcm_mu-protected write shape). Never touches frames_played — only
// cheng_aes_render_write_callback (the OHOS realtime audio thread) does that.
static void cheng_aes_on_new_output(OH_AVCodec* c, uint32_t index, OH_AVBuffer* buffer, void* u) {
  ChengAudioEsStreamCtx* sc = (ChengAudioEsStreamCtx*)u;
  if (sc != NULL && buffer != NULL) {
    OH_AVCodecBufferAttr attr; memset(&attr, 0, sizeof(attr));
    OH_AVBuffer_GetBufferAttr(buffer, &attr);
    int is_eos = (attr.flags & AVCODEC_BUFFER_FLAGS_EOS) ? 1 : 0;
    if (!is_eos && attr.size > 0) {
      uint8_t* addr = OH_AVBuffer_GetAddr(buffer);
      if (addr != NULL) {
        const int16_t* pcm = (const int16_t*)addr;
        int slots = (int)(attr.size / (int32_t)sizeof(int16_t));
        pthread_mutex_lock(&sc->pcm_mu);
        for (int i = 0; i < slots; i++) {
          if (sc->pcm_size >= sc->pcm_cap_samples) break;  // ring full: drop tail, renderer underrun self-heals
          sc->pcm[sc->pcm_tail] = pcm[i];
          sc->pcm_tail = (sc->pcm_tail + 1) % sc->pcm_cap_samples;
          sc->pcm_size++;
        }
        pthread_mutex_unlock(&sc->pcm_mu);
      }
    }
  }
  OH_AudioCodec_FreeOutputBuffer(c, index);
}

// OHOS realtime audio thread (ohaudio's own, NOT the codec-internal thread above):
// drain the PCM ring into the device buffer. Touches ONLY the ring + frames_played,
// both under pcm_mu — pure load/store, zero calls/allocs/IO in the critical section
// (matches the AAudio data callback's own realtime contract on the Android side).
// numFrames advances by the DEVICE's requested frame count (not by how many samples
// were actually available), same as Android's cheng_android_aes_data_callback: the
// device clock keeps moving through an underrun (silence-filled), so the master clock
// must too.
static OH_AudioData_Callback_Result cheng_aes_render_write_callback(OH_AudioRenderer* renderer, void* userData, void* audioData, int32_t audioDataSize) {
  (void)renderer;
  ChengAudioEsStreamCtx* sc = (ChengAudioEsStreamCtx*)userData;
  int16_t* out = (int16_t*)audioData;
  int ch = (sc->channels > 0) ? sc->channels : 2;
  int want_slots = audioDataSize / (int32_t)sizeof(int16_t);
  int numFrames = want_slots / ch;
  pthread_mutex_lock(&sc->pcm_mu);
  // #14 S8 v2 (fix for v_a.md/v_b.md finding ③): OH_AudioRenderer_Stop/Release's
  // cross-thread contract against an in-flight write-data callback is NOT documented the
  // way OH_AVCodec's flush/stop/destroy contract is (see cheng_audio_es_teardown's own
  // honestResidual comment below) — so this callback CAN still fire after
  // cheng_audio_es_teardown has already freed sc->pcm (now also done under this same
  // pcm_mu, see teardown). Judge under the lock and fail safe to silence instead of
  // dereferencing a freed/NULL ring.
  if (sc->pcm == NULL || sc->pcm_cap_samples <= 0) {
    pthread_mutex_unlock(&sc->pcm_mu);
    for (int i = 0; i < want_slots; i++) { out[i] = 0; }
    return AUDIO_DATA_CALLBACK_RESULT_VALID;
  }
  int avail = sc->pcm_size;
  int take = (avail < want_slots) ? avail : want_slots;
  for (int i = 0; i < take; i++) {
    out[i] = sc->pcm[sc->pcm_head];
    sc->pcm_head = (sc->pcm_head + 1) % sc->pcm_cap_samples;
  }
  sc->pcm_size -= take;
  sc->frames_played += numFrames;
  pthread_mutex_unlock(&sc->pcm_mu);
  for (int i = take; i < want_slots; i++) { out[i] = 0; }  // underrun -> silence
  return AUDIO_DATA_CALLBACK_RESULT_VALID;
}

// AAC-LC/ADTS decoder (audio/mp4a-latm twin): IS_ADTS=1 so the codec parses each AU's
// own 7-byte ADTS header itself — no csd-0, exactly mirroring the Android host's
// cheng_android_create_aes_decoder and this file's own video ES's inline-SPS/PPS
// approach. Same async OH_AVCodecCallback registration shape as
// cheng_ohos_start_streaming_decode above (OH_AudioCodec_* is the audio sibling API of
// OH_VideoDecoder_*, both OH_AVCodec-based).
static OH_AVCodec* cheng_aes_create_decoder(int sample_rate, int channels, ChengAudioEsStreamCtx* sc) {
  OH_AVCodec* dec = OH_AudioCodec_CreateByMime(OH_AVCODEC_MIMETYPE_AUDIO_AAC, false);
  if (dec == NULL) { cheng_media_diag("aes: CreateByMime NULL"); return NULL; }
  OH_AVFormat* cfg = OH_AVFormat_Create();
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_AUD_SAMPLE_RATE, sample_rate);
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_AUD_CHANNEL_COUNT, channels);
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_AAC_IS_ADTS, 1);
  OH_AVErrCode cfgRc = OH_AudioCodec_Configure(dec, cfg);
  OH_AVFormat_Destroy(cfg);
  OH_AVCodecCallback cb;
  cb.onError = cheng_aes_on_error;
  cb.onStreamChanged = cheng_aes_on_stream_changed;
  cb.onNeedInputBuffer = cheng_aes_on_need_input;
  cb.onNewOutputBuffer = cheng_aes_on_new_output;
  OH_AVErrCode regRc = OH_AudioCodec_RegisterCallback(dec, cb, sc);
  if (cfgRc != AV_ERR_OK || regRc != AV_ERR_OK ||
      OH_AudioCodec_Prepare(dec) != AV_ERR_OK || OH_AudioCodec_Start(dec) != AV_ERR_OK) {
    OH_AudioCodec_Destroy(dec);
    char b[80]; snprintf(b, sizeof(b), "aes: cfg/register/prepare/start fail cfg=%d reg=%d", (int)cfgRc, (int)regRc); cheng_media_diag(b);
    return NULL;
  }
  char okb[80]; snprintf(okb, sizeof(okb), "aes: decoder configured+started %dHz ch=%d (ADTS)", sample_rate, channels); cheng_media_diag(okb);
  return dec;
}

// Low-latency PCM output stream (libohaudio.so — the OHOS twin of AAudio). 16-bit
// interleaved at the index's sample-rate/channel-count; the write-data callback drains
// the ring.
static OH_AudioRenderer* cheng_aes_create_renderer(int sample_rate, int channels, ChengAudioEsStreamCtx* sc) {
  OH_AudioStreamBuilder* builder = NULL;
  if (OH_AudioStreamBuilder_Create(&builder, AUDIOSTREAM_TYPE_RENDERER) != AUDIOSTREAM_SUCCESS || builder == NULL) {
    cheng_media_diag("aes: stream builder create failed");
    return NULL;
  }
  OH_AudioStreamBuilder_SetSamplingRate(builder, sample_rate);
  OH_AudioStreamBuilder_SetChannelCount(builder, channels);
  OH_AudioStreamBuilder_SetSampleFormat(builder, AUDIOSTREAM_SAMPLE_S16LE);
  OH_AudioStreamBuilder_SetLatencyMode(builder, AUDIOSTREAM_LATENCY_MODE_FAST);
  OH_AudioStreamBuilder_SetRendererWriteDataCallback(builder, cheng_aes_render_write_callback, sc);
  OH_AudioRenderer* renderer = NULL;
  OH_AudioStream_Result genRc = OH_AudioStreamBuilder_GenerateRenderer(builder, &renderer);
  OH_AudioStreamBuilder_Destroy(builder);
  if (genRc != AUDIOSTREAM_SUCCESS || renderer == NULL) {
    char b[64]; snprintf(b, sizeof(b), "aes: renderer generate failed rc=%d", (int)genRc); cheng_media_diag(b);
    return NULL;
  }
  if (OH_AudioRenderer_Start(renderer) != AUDIOSTREAM_SUCCESS) {
    OH_AudioRenderer_Release(renderer);
    cheng_media_diag("aes: renderer start failed");
    return NULL;
  }
  char okb[64]; snprintf(okb, sizeof(okb), "aes: renderer started %dHz ch=%d", sample_rate, channels); cheng_media_diag(okb);
  return renderer;
}

// Engage the ES audio pipeline once the Cheng bridge's audio ES open + sample_rate/
// channels/frame_count have already succeeded (called from cheng_stream_fetch_worker,
// mirroring cheng_ohos_start_streaming_decode's own call shape). Builds the decoder +
// renderer; on ANY failure tears back down to fully disengaged so the caller can fall
// back to cheng_audio_play_local_file — same fail-open precedent as every other
// dlsym'd-optional feature in this file (es_seek_to_position_ms_fn,
// etc.). Returns 1 engaged, 0 not.
int cheng_audio_es_engage(int32_t sample_rate, int32_t channels, int32_t frame_count) {
  if (sample_rate <= 0 || channels <= 0 || frame_count <= 0) return 0;
  cheng_audio_es_ctx_init();
  ChengAudioEsStreamCtx* sc = &s_aes_ctx;
  sc->sample_rate = sample_rate; sc->channels = channels; sc->frame_count = frame_count;
  sc->next_frame_idx = 0; sc->pts_seq = 0; sc->input_done = 0; sc->stop = 0;
  sc->fq_head = sc->fq_tail = sc->fq_size = 0;
  sc->pcm_cap_samples = CHENG_AES_PCM_RING_FRAMES * channels;
  sc->pcm = (int16_t*)malloc((size_t)sc->pcm_cap_samples * sizeof(int16_t));
  sc->pcm_head = sc->pcm_tail = sc->pcm_size = 0;
  sc->frames_played = 0;
  if (sc->pcm == NULL) { cheng_media_diag("aes: pcm ring alloc failed"); return 0; }
  s_aes_dec = cheng_aes_create_decoder(sample_rate, channels, sc);
  if (s_aes_dec == NULL) { free(sc->pcm); sc->pcm = NULL; return 0; }
  s_aes_renderer = cheng_aes_create_renderer(sample_rate, channels, sc);
  if (s_aes_renderer == NULL) {
    OH_AudioCodec_Stop(s_aes_dec); OH_AudioCodec_Destroy(s_aes_dec); s_aes_dec = NULL;
    free(sc->pcm); sc->pcm = NULL;
    return 0;
  }
  __atomic_store_n(&s_aes_engaged, 1, __ATOMIC_SEQ_CST);
  cheng_media_diag("aes: engaged (ES audio pipeline live)");
  return 1;
}

// Push one ADTS access unit into the input FIFO (fetch thread; non-blocking — a full
// FIFO just drops this tick's offer, since the fetch thread must never stall on audio
// backpressure; the codec's own onNeedInputBuffer wait absorbs the resulting gap).
void cheng_audio_es_prefetch_push(int32_t frame_idx, const unsigned char* src, int32_t frame_size) {
  if (!__atomic_load_n(&s_aes_engaged, __ATOMIC_SEQ_CST) || src == NULL || frame_size <= 0) return;
  ChengAudioEsStreamCtx* sc = &s_aes_ctx;
  pthread_mutex_lock(&sc->fq_mu);
  if (sc->fq_size >= CHENG_AES_FQ_CAP) { pthread_mutex_unlock(&sc->fq_mu); return; }
  unsigned char* b = (unsigned char*)malloc((size_t)frame_size);
  if (b == NULL) { pthread_mutex_unlock(&sc->fq_mu); return; }
  memcpy(b, src, (size_t)frame_size);
  sc->fq[sc->fq_tail] = b; sc->fq_len[sc->fq_tail] = frame_size;
  sc->fq_tail = (sc->fq_tail + 1) % CHENG_AES_FQ_CAP;
  sc->fq_size++;
  pthread_cond_signal(&sc->cv_notempty);
  pthread_mutex_unlock(&sc->fq_mu);
  (void)frame_idx;
}

// Seek reset (fetch thread, called right after the video seek's own
// cheng_stream_apply_seek — video-seek-scrub-blueprint.md §7.1 选项 A, mirroring the
// Android host's S7 seek-sync): drains the input FIFO, flushes the decoder, resets the
// PCM ring + master clock + next fetch cursor. newAudioFrameIdx is the audio-side
// cursor the Cheng bridge already computed (WebSceneMediaAudioEsSeekToVideoFrame's own
// fps/sample-rate alignment math) — this function only resets LOCAL C-side state,
// mirroring cheng_stream_apply_seek's own division of labor (the bridge owns the
// transport-cursor math, this owns the decoder/ring).
void cheng_audio_es_apply_seek(int32_t newAudioFrameIdx) {
  if (!__atomic_load_n(&s_aes_engaged, __ATOMIC_SEQ_CST)) return;
  ChengAudioEsStreamCtx* sc = &s_aes_ctx;
  pthread_mutex_lock(&sc->fq_mu);
  while (sc->fq_size > 0) {
    free(sc->fq[sc->fq_head]);
    sc->fq_head = (sc->fq_head + 1) % CHENG_AES_FQ_CAP;
    sc->fq_size--;
  }
  sc->input_done = 0;
  pthread_cond_signal(&sc->cv_notfull_fq);
  pthread_mutex_unlock(&sc->fq_mu);
  // Flush is called with no lock held, same reasoning as cheng_stream_apply_seek above
  // (OHOS's own contract: flush()/stop()/destroy() off the callback thread returns only
  // after any in-flight callback has finished — held locks here could deadlock against it).
  OH_AVErrCode frc = (s_aes_dec != NULL) ? OH_AudioCodec_Flush(s_aes_dec) : AV_ERR_INVALID_VAL;
  pthread_mutex_lock(&sc->pcm_mu);
  sc->pcm_head = 0; sc->pcm_tail = 0; sc->pcm_size = 0;
  sc->frames_played = 0;
  pthread_mutex_unlock(&sc->pcm_mu);
  sc->next_frame_idx = (newAudioFrameIdx >= 0) ? newAudioFrameIdx : 0;
  sc->pts_seq = 0;
  char b[64]; snprintf(b, sizeof(b), "aes: seek applied frame=%d flush_rc=%d", (int)sc->next_frame_idx, (int)frc); cheng_media_diag(b);
}

// #14-eos: marks the audio ES input FIFO's producer (the fetch thread) as exhausted once
// its own prefetch cursor has reached WebSceneMediaAudioEsFrameCount() — mirrors
// cheng_stream_mark_video_input_done's video-side twin above. Wakes cheng_aes_on_need_input,
// which already has a complete input_done/EOS branch (this mechanism has been dead code
// until now — nothing ever set input_done=1 outside of the 0-reset in engage/apply_seek
// above). Fail-open no-op when audio ES was never engaged this session (no network audio
// track, or this card fell back to the bundled local clip) — same precedent as every other
// s_aes_engaged-gated call in this file.
void cheng_audio_es_mark_input_done(void) {
  if (!__atomic_load_n(&s_aes_engaged, __ATOMIC_SEQ_CST)) return;
  ChengAudioEsStreamCtx* sc = &s_aes_ctx;
  pthread_mutex_lock(&sc->fq_mu);
  sc->input_done = 1;
  pthread_cond_broadcast(&sc->cv_notempty);
  pthread_mutex_unlock(&sc->fq_mu);
}

// #14-eos: freezes (Stop, NOT Release) the ES audio renderer once both the video and audio
// producers have reached end-of-stream — called from the render thread's existing
// s_stream_eos_logged latch (cheng_gui_host_gen.c), the same one-shot gate that already
// Stops the local-file OH_AVPlayer at EOS. Real teardown (Stop+Release, decoder Destroy,
// FIFO/PCM ring free) stays exclusively cheng_audio_es_teardown's job below, which only
// ever runs after the fetch thread has been pthread_join'd — calling Stop here, while the
// fetch thread may still be exiting its own loop, touches nothing cheng_aes_render_write_
// callback isn't already defending against under pcm_mu (see that callback's own
// honestResidual comment) and nothing cheng_audio_es_teardown's later Stop+Release isn't
// already safe to call a second time on. No-op when this session never engaged ES audio.
void cheng_audio_es_stop_at_eos(void) {
  if (s_aes_renderer != NULL) OH_AudioRenderer_Stop(s_aes_renderer);
}

// Tear down the ES audio pipeline (renderer stop/release, decoder stop/destroy, FIFO/
// ring drain). Called from cheng_stream_teardown_active (render thread) AFTER the fetch
// thread has already been pthread_join'd there — never concurrent with the fetch
// thread's own cheng_audio_es_prefetch_push/apply_seek calls by construction, same
// invariant the video decoder teardown a few lines above already relies on.
//
// honestResidual (see fix_verdict.md): OH_AudioRenderer_Stop/Release's cross-thread
// contract against an in-flight cheng_aes_render_write_callback is NOT documented in
// the NDK headers the way OH_AVCodec's flush/stop/destroy contract explicitly is
// (native_avcodec_videodecoder.h's own comment, quoted in cheng_stream_apply_seek
// above) — s_aes_engaged is cleared FIRST (before Stop/Release) so the callback's own
// read of sc fields is still well-defined even if one more invocation races the
// teardown, but this is not a proven-safe destroy-vs-callback ordering the way the
// OH_AVCodec side is. Flagged, not silently assumed.
void cheng_audio_es_teardown(void) {
  if (!__atomic_load_n(&s_aes_engaged, __ATOMIC_SEQ_CST) && s_aes_dec == NULL && s_aes_renderer == NULL) return;
  __atomic_store_n(&s_aes_engaged, 0, __ATOMIC_SEQ_CST);
  if (s_aes_renderer != NULL) { OH_AudioRenderer_Stop(s_aes_renderer); OH_AudioRenderer_Release(s_aes_renderer); s_aes_renderer = NULL; }
  ChengAudioEsStreamCtx* sc = &s_aes_ctx;
  if (s_aes_ctx_inited) {
    pthread_mutex_lock(&sc->fq_mu);
    sc->stop = 1;
    pthread_cond_broadcast(&sc->cv_notempty);
    pthread_cond_broadcast(&sc->cv_notfull_fq);
    pthread_mutex_unlock(&sc->fq_mu);
  }
  if (s_aes_dec != NULL) { OH_AudioCodec_Stop(s_aes_dec); OH_AudioCodec_Destroy(s_aes_dec); s_aes_dec = NULL; }
  if (s_aes_ctx_inited) {
    pthread_mutex_lock(&sc->fq_mu);
    while (sc->fq_size > 0) { free(sc->fq[sc->fq_head]); sc->fq_head = (sc->fq_head + 1) % CHENG_AES_FQ_CAP; sc->fq_size--; }
    pthread_mutex_unlock(&sc->fq_mu);
    // #14 S8 v2 (fix for v_a.md/v_b.md finding ③): free sc->pcm under pcm_mu — the same
    // lock cheng_aes_render_write_callback now takes before touching sc->pcm — so its
    // NULL-and-cap check above and this free/NULL-out can never interleave torn (a check
    // outside the lock the writer also doesn't take is not a real check).
    pthread_mutex_lock(&sc->pcm_mu);
    if (sc->pcm != NULL) { free(sc->pcm); sc->pcm = NULL; }
    sc->pcm_cap_samples = 0; sc->pcm_head = sc->pcm_tail = sc->pcm_size = 0;
    pthread_mutex_unlock(&sc->pcm_mu);
    pthread_mutex_destroy(&sc->fq_mu);
    pthread_cond_destroy(&sc->cv_notempty);
    pthread_cond_destroy(&sc->cv_notfull_fq);
    pthread_mutex_destroy(&sc->pcm_mu);
    s_aes_ctx_inited = 0;
  }
  cheng_media_diag("aes: teardown");
}
// ===== end #14 S8 slice1 =========================================================

// Play the local clip's audio track via OH_AVPlayer (looping). No video surface is set,
// so it renders audio only — the surface video path owns the picture. Idempotent; runs
// on the fetch thread (no Cheng QUIC bridge).
void cheng_audio_play_local_file(const char* path, int looping) {
  if (s_audio_player != NULL) return;
  int fd = open(path, O_RDONLY);
  if (fd < 0) { cheng_media_diag("audio: open fail"); return; }
  struct stat st;
  if (fstat(fd, &st) != 0 || st.st_size <= 0) { close(fd); cheng_media_diag("audio: fstat fail"); return; }
  OH_AVPlayer* p = OH_AVPlayer_Create();
  if (p == NULL) { close(fd); cheng_media_diag("audio: AVPlayer_Create NULL"); return; }
  OH_AVPlayer_SetOnInfoCallback(p, cheng_audio_on_info, NULL);
  if (OH_AVPlayer_SetFDSource(p, fd, 0, (int64_t)st.st_size) != AV_ERR_OK) {
    OH_AVPlayer_ReleaseSync(p); close(fd); cheng_media_diag("audio: SetFDSource fail"); return;
  }
  OH_AVPlayer_SetLooping(p, looping ? true : false);   // local clip: single playthrough (EOS); network: loop with the live stream
  OH_AVPlayer_SetVolume(p, 1.0f, 1.0f);
  OH_AVErrCode prc = OH_AVPlayer_Prepare(p);  // async → cheng_audio_on_info plays on AV_PREPARED
  s_audio_player = p;
  s_audio_player_fd = fd;                      // keep the fd open until ReleaseSync
  char b[48]; snprintf(b, sizeof(b), "audio: AVPlayer prepare rc=%d", (int)prc); cheng_media_diag(b);
}

// Push one access unit into the streaming decoder's input FIFO, BLOCKING when full
// (backpressure paces the demuxer to playback). Mirrors cheng_scene_media_es_sink_frame
// but sources from a local file instead of the QUIC bridge. Returns 1 to continue, 0 to stop.
static int cheng_stream_local_push_frame(ChengStreamCtx* sc, const unsigned char* src, int n, int key) {
  if (sc == NULL || src == NULL || n <= 0) return 1;
  pthread_mutex_lock(&sc->fq_mu);
  while (sc->fq_size >= CHENG_STREAM_FQ_CAP && !sc->stop) {
    pthread_cond_wait(&sc->cv_notfull_fq, &sc->fq_mu);
  }
  if (sc->stop) { pthread_mutex_unlock(&sc->fq_mu); return 0; }
  unsigned char* b = (unsigned char*)malloc((size_t)n);
  if (b == NULL) { pthread_mutex_unlock(&sc->fq_mu); return 1; }
  CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_LOCAL_PUSH_FRAME_MALLOC, n);
  memcpy(b, src, (size_t)n);
  int64_t pts = s_stream_pts_seq;
  s_stream_pts_seq += (int64_t)(1000000.0 / (sc->fps > 0.0 ? sc->fps : 30.0));
  sc->fq[sc->fq_tail] = b; sc->fq_len[sc->fq_tail] = n;
  sc->fq_pts[sc->fq_tail] = pts; sc->fq_key[sc->fq_tail] = key;
  sc->fq_tail = (sc->fq_tail + 1) % CHENG_STREAM_FQ_CAP;
  sc->fq_size++;
  pthread_cond_signal(&sc->cv_notempty);
  s_endur_es_sink_n++;   // endurance oracle: ES sink rate (local path)
  int stop = sc->stop;
  pthread_mutex_unlock(&sc->fq_mu);
  return stop ? 0 : 1;
}

// Self-contained videoFetchError/videoFetchRetryable reporter for the local-file worker below
// (dladdr + dlopen(RTLD_NOLOAD) self-lookup, same precedent as
// cheng_location_resolve_runtime_set_state above — independent of gen.c's file-scope static
// s_runtime_set_state so this stays self-contained in the hand-written adapter half).
typedef int32_t (*cheng_stream_runtime_set_state_fn)(const char*, const char*);
static cheng_stream_runtime_set_state_fn s_stream_runtime_set_state = NULL;

static int cheng_stream_resolve_runtime_set_state(void) {
  if (s_stream_runtime_set_state != NULL) return 1;
  void* self_handle = NULL;
  Dl_info self_info;
  if (dladdr((void*)&cheng_stream_resolve_runtime_set_state, &self_info) && self_info.dli_fname != NULL) {
    self_handle = dlopen(self_info.dli_fname, RTLD_NOW | RTLD_NOLOAD);
  }
  if (self_handle == NULL) self_handle = dlopen(NULL, RTLD_NOW);
  if (self_handle == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "local stream failure report: self dlopen failed: %s", dlerror());
    return 0;
  }
  s_stream_runtime_set_state = (cheng_stream_runtime_set_state_fn)dlsym(self_handle, "cheng_mobile_host_runtime_set_state");
  if (s_stream_runtime_set_state == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "local stream failure report: dlsym cheng_mobile_host_runtime_set_state failed");
    return 0;
  }
  return 1;
}

// Abort helper for cheng_stream_local_file_worker's early-return failure paths below (open/
// fstat/demuxer/track/decode-start/AVBuffer). Device-verified gap (own-dial 2026-07-12, same
// defect class as the network fetch worker's content-mismatch abort in cheng_gui_host_gen.c):
// every one of these returns used to leave s_stream_starting latched at 1 forever — only
// cheng_stream_teardown_active (a route change/back navigation) ever cleared it — so a local-
// decode failure on THIS card (now the primary path for own-IP content after the own-ip fix
// above) would black-screen the detail page with no retry and no visible error, exactly like
// the reported network-side symptom. Resets the gate and writes the SAME videoFetchError/
// videoFetchRetryable state keys the network fetch worker already uses, so one GUI-side
// handler covers both workers.
static void cheng_stream_report_local_failure(const char* what) {
  cheng_media_diag(what);
  if (cheng_stream_resolve_runtime_set_state()) {
    int errOk = s_stream_runtime_set_state("videoFetchError", what);
    int retryOk = s_stream_runtime_set_state("videoFetchRetryable", "1");
    __android_log_print((errOk != 0 && retryOk != 0) ? ANDROID_LOG_INFO : ANDROID_LOG_ERROR, "ChengCHT",
                        "local stream failure report: videoFetchError state write err_ok=%d retryable_ok=%d", errOk, retryOk);
  } else {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "local stream failure report: runtime set_state unavailable, failure NOT surfaced to GUI (%s)", what);
  }
  s_stream_starting = 0;  // release the re-entry gate (mirrors the fetch worker's abort-must-unlatch fix)
}

// Local-file playback worker (麦田 card, route home_content_detail_open_1=44): decode
// the bundled maitian.mp4 from rawfile to the SAME OES surface the network path uses —
// zero network, no QUIC bridge (so it is single-thread-safe on this fetch pthread). The
// OHOS demuxer yields annexB access units (inline SPS/PPS at IDR), identical to the
// publisher's ES, so the streaming decoder (no CSD config) decodes them unchanged. Loops
// at EOS by seeking back to the start.
void* cheng_stream_local_file_worker(void* arg) {
  (void)arg;
  cheng_host_extract_rawfile_to_cache("maitian.mp4");
  const char* path = "/data/storage/el2/base/haps/entry/cache/maitian.mp4";
  int fd = open(path, O_RDONLY);
  if (fd < 0) { cheng_stream_report_local_failure("local: maitian open fail"); return NULL; }
  struct stat st;
  if (fstat(fd, &st) != 0 || st.st_size <= 0) { close(fd); cheng_stream_report_local_failure("local: maitian fstat fail"); return NULL; }
  OH_AVSource* src = OH_AVSource_CreateWithFD(fd, 0, (int64_t)st.st_size);
  if (src == NULL) { close(fd); cheng_stream_report_local_failure("local: CreateWithFD NULL"); return NULL; }
  OH_AVDemuxer* demux = OH_AVDemuxer_CreateWithSource(src);
  if (demux == NULL) { OH_AVSource_Destroy(src); close(fd); cheng_stream_report_local_failure("local: demuxer NULL"); return NULL; }
  OH_AVFormat* srcFmt = OH_AVSource_GetSourceFormat(src);
  int32_t trackCount = 0;
  if (srcFmt) { OH_AVFormat_GetIntValue(srcFmt, OH_MD_KEY_TRACK_COUNT, &trackCount); OH_AVFormat_Destroy(srcFmt); }
  int vTrack = -1; int32_t vW = 0, vH = 0, vRot = 0; double vFps = 0.0; int64_t durUs = 0;
  for (int32_t t = 0; t < trackCount; t++) {
    OH_AVFormat* tf = OH_AVSource_GetTrackFormat(src, (uint32_t)t);
    if (!tf) continue;
    int32_t type = -1;
    OH_AVFormat_GetIntValue(tf, OH_MD_KEY_TRACK_TYPE, &type);
    if (type == MEDIA_TYPE_VID) {
      OH_AVFormat_GetIntValue(tf, OH_MD_KEY_WIDTH, &vW);
      OH_AVFormat_GetIntValue(tf, OH_MD_KEY_HEIGHT, &vH);
      OH_AVFormat_GetDoubleValue(tf, OH_MD_KEY_FRAME_RATE, &vFps);
      OH_AVFormat_GetIntValue(tf, OH_MD_KEY_ROTATION, &vRot);
      OH_AVFormat_GetLongValue(tf, OH_MD_KEY_DURATION, &durUs);
      vTrack = (int)t; OH_AVFormat_Destroy(tf); break;
    }
    OH_AVFormat_Destroy(tf);
  }
  if (vTrack < 0 || vW <= 0 || vH <= 0) { OH_AVDemuxer_Destroy(demux); OH_AVSource_Destroy(src); close(fd); cheng_stream_report_local_failure("local: no video track"); return NULL; }
  OH_AVDemuxer_SelectTrackByID(demux, (uint32_t)vTrack);
  if (vFps < 1.0 || vFps > 240.0) vFps = 30.0;
  int frameCount = (durUs > 0) ? (int)((double)durUs * vFps / 1000000.0) : (int)(vFps * 10.0);
  if (frameCount <= 0) frameCount = (int)(vFps * 10.0);
  ChengStreamCtx* sc = cheng_ohos_start_streaming_decode(vW, vH, vFps, frameCount);
  if (sc == NULL) { OH_AVDemuxer_Destroy(demux); OH_AVSource_Destroy(src); close(fd); cheng_stream_report_local_failure("local: start decode fail"); return NULL; }
  sc->es_rotation = cheng_android_normalize_video_rotation_degrees(vRot);
  s_stream_ctx = sc;
  __atomic_store_n(&s_stream_ready, 1, __ATOMIC_SEQ_CST);
  char rb[112]; snprintf(rb, sizeof(rb), "local maitian up %dx%d fps=%d frames=%d rot=%d", vW, vH, (int)(vFps + 0.5), frameCount, sc->es_rotation);
  cheng_media_diag(rb);
  // Audio: play the same local clip's AAC track via OH_AVPlayer, single playthrough (looping=0)
  // so it winds down with the video at EOS (the render path Stops it on the final frame).
  cheng_audio_play_local_file(path, 0);
  OH_AVBuffer* sample = OH_AVBuffer_Create(CHENG_STREAM_MAXFRAME);
  if (sample == NULL) { cheng_media_diag("local: AVBuffer_Create NULL"); OH_AVDemuxer_Destroy(demux); OH_AVSource_Destroy(src); close(fd); return NULL; }
  int total = 0;
  while (!sc->stop) {
    // Seek check (video-seek-scrub-blueprint.md §S3a): this worker is the ONLY thread that
    // may touch `demux` (a local variable — not reachable from cheng_host_video_seek, which
    // runs on the render/main thread and can only hand off via sc->seek_requested/
    // seek_target_ms under fq_mu, same S5-B-shaped gateway as sc->paused_requested). Seeking
    // to the sync sample AT-OR-BEFORE the target time (not the closest one) guarantees the
    // decoder always resumes from a real GOP head, matching the network path's
    // WebSceneMediaEsSeekToFrame keyframe-snap semantics.
    pthread_mutex_lock(&sc->fq_mu);
    int doSeek = sc->seek_requested;
    int32_t seekMs = sc->seek_target_ms;
    sc->seek_requested = 0;
    pthread_mutex_unlock(&sc->fq_mu);
    if (doSeek) {
      OH_AVErrCode srb = OH_AVDemuxer_SeekToTime(demux, (int64_t)seekMs, SEEK_MODE_PREVIOUS_SYNC);
      char sb[64]; snprintf(sb, sizeof(sb), "local: seek to ms=%d rc=%d", seekMs, (int)srb); cheng_media_diag(sb);
      cheng_stream_apply_seek(sc);
      continue;
    }
    OH_AVErrCode rc = OH_AVDemuxer_ReadSampleBuffer(demux, (uint32_t)vTrack, sample);
    if (rc != AV_ERR_OK) {                            // EOS: mark the source done and stop reading
      __atomic_store_n(&s_stream_src_eof, 1, __ATOMIC_SEQ_CST);  // render path latches s_stream_eos once the queues drain
      cheng_media_diag("local: maitian EOS (source drained)");
      break;                                          // no re-seek loop — single playthrough winds down
    }
    OH_AVCodecBufferAttr attr; memset(&attr, 0, sizeof(attr));
    OH_AVBuffer_GetBufferAttr(sample, &attr);
    uint8_t* addr = OH_AVBuffer_GetAddr(sample);
    if (addr == NULL || attr.size <= 0) continue;
    int key = (attr.flags & AVCODEC_BUFFER_FLAGS_SYNC_FRAME) ? 1 : 0;
    if (cheng_stream_local_push_frame(sc, addr, attr.size, key) == 0) break;
    if (++total <= 8 || (total % 30) == 0) { char pb[64]; snprintf(pb, sizeof(pb), "local sink n=%d size=%d key=%d", total, attr.size, key); cheng_media_diag(pb); }
  }
  OH_AVBuffer_Destroy(sample);
  OH_AVDemuxer_Destroy(demux);
  OH_AVSource_Destroy(src);
  close(fd);
  cheng_media_diag("local: maitian worker exit");
  return NULL;
}

// Feed (route 0) QUIC prewarm worker (S3 skeleton, N≤2 plan):
// - Env gate CHENG_FEED_MEDIA_PREWARM=0 → no-op (desktop/off).
// - Logs the full plan (up to 2 peers collected at prepare).
// - DIALS plan[0] only (dial+announce+index via es_open) — single global ES session.
// - plan[1] is recorded/logged only until per-slot connection pool lands.
// Never creates a decoder or presents a frame. Fetch worker joins this thread before
// its own dial so the Cheng QUIC pump stays single-threaded. Honest rc, no fallback.
void* cheng_stream_prewarm_worker(void* arg) {
  (void)arg;
  const char* gate = getenv("CHENG_FEED_MEDIA_PREWARM");
  if (gate != NULL && gate[0] == '0' && gate[1] == '\0') {
    cheng_media_diag("prewarm: CHENG_FEED_MEDIA_PREWARM=0, skip");
    return NULL;
  }
  int plan_n = s_prewarm_plan_count;
  if (plan_n < 0) plan_n = 0;
  if (plan_n > CHENG_FEED_PREWARM_N) plan_n = CHENG_FEED_PREWARM_N;
  {
    char pb[160];
    snprintf(pb, sizeof(pb), "prewarm: plan n=%d", plan_n);
    cheng_media_diag(pb);
    for (int i = 0; i < plan_n; i++) {
      char lb[128];
      int port_i = (s_prewarm_ports[i] > 0) ? s_prewarm_ports[i] : 38000;
      snprintf(lb, sizeof(lb), "prewarm: plan[%d] %s:%d", i,
               s_prewarm_hosts[i][0] != '\0' ? s_prewarm_hosts[i] : "<empty>", port_i);
      cheng_media_diag(lb);
    }
  }
  extern int32_t cheng_scene_media_es_open(const char* host, int32_t port);
  const char* host = (s_prewarm_hosts[0][0] != '\0') ? s_prewarm_hosts[0]
                     : ((s_prewarm_peer_host[0] != '\0') ? s_prewarm_peer_host : NULL);
  if (host == NULL) { cheng_media_diag("prewarm: no peer host, skip"); return NULL; }
  int32_t port = (s_prewarm_ports[0] > 0) ? s_prewarm_ports[0]
               : ((s_prewarm_peer_port > 0) ? s_prewarm_peer_port : 38000);
  char b[112]; snprintf(b, sizeof(b), "prewarm: es_open dial %s:%d ...", host, port); cheng_media_diag(b);
  int32_t opened = cheng_scene_media_es_open(host, port);
  char ob[96];
  snprintf(ob, sizeof(ob), "prewarm: es_open rc=%d (dial+index plan0; plan1 deferred to pool)", opened);
  cheng_media_diag(ob);
  return NULL;
}
static int s_img_ndk_tried = 0, s_img_ndk_ok = 0;
int cheng_img_ndk_load(void) {
  if (s_img_ndk_tried) return s_img_ndk_ok;
  s_img_ndk_tried = 1;
  void* hs = dlopen("libimage_source.so", RTLD_NOW | RTLD_GLOBAL);
  void* hp = dlopen("libpixelmap.so", RTLD_NOW | RTLD_GLOBAL);
  if (hs == NULL || hp == NULL) {
    char b[160]; snprintf(b, sizeof(b), "img ndk dlopen fail src=%p pm=%p err=%s", hs, hp, dlerror());
    cheng_media_diag(b);
    return 0;
  }
  p_CreateFromFd = (fn_img_CreateFromFd)dlsym(hs, "OH_ImageSourceNative_CreateFromFd");
  p_CreatePixelmap = (fn_img_CreatePixelmap)dlsym(hs, "OH_ImageSourceNative_CreatePixelmap");
  p_SrcRelease = (fn_img_SrcRelease)dlsym(hs, "OH_ImageSourceNative_Release");
  p_DoptCreate = (fn_dopt_Create)dlsym(hs, "OH_DecodingOptions_Create");
  p_DoptSetPixelFormat = (fn_dopt_SetPixelFormat)dlsym(hs, "OH_DecodingOptions_SetPixelFormat");
  p_DoptRelease = (fn_dopt_Release)dlsym(hs, "OH_DecodingOptions_Release");
  p_IInfoCreate = (fn_iinfo_Create)dlsym(hp, "OH_PixelmapImageInfo_Create");
  p_GetImageInfo = (fn_pm_GetImageInfo)dlsym(hp, "OH_PixelmapNative_GetImageInfo");
  p_GetWidth = (fn_iinfo_GetU32)dlsym(hp, "OH_PixelmapImageInfo_GetWidth");
  p_GetHeight = (fn_iinfo_GetU32)dlsym(hp, "OH_PixelmapImageInfo_GetHeight");
  p_GetRowStride = (fn_iinfo_GetU32)dlsym(hp, "OH_PixelmapImageInfo_GetRowStride");
  p_IInfoRelease = (fn_iinfo_Release)dlsym(hp, "OH_PixelmapImageInfo_Release");
  p_ReadPixels = (fn_pm_ReadPixels)dlsym(hp, "OH_PixelmapNative_ReadPixels");
  p_PmRelease = (fn_pm_Release)dlsym(hp, "OH_PixelmapNative_Release");
  if (!p_CreateFromFd || !p_CreatePixelmap || !p_SrcRelease || !p_DoptCreate ||
      !p_DoptSetPixelFormat || !p_DoptRelease || !p_IInfoCreate || !p_GetImageInfo ||
      !p_GetWidth || !p_GetHeight || !p_GetRowStride || !p_IInfoRelease ||
      !p_ReadPixels || !p_PmRelease) {
    cheng_media_diag("img ndk dlsym incomplete");
    return 0;
  }
  s_img_ndk_ok = 1;
  cheng_media_diag("img ndk dlopen OK");
  return 1;
}

// The RawFile readers in the host body call this to reach the resource manager.
void* cheng_ohos_resource_manager(void) {
  return s_gui_resource_manager;
}

char* cheng_gui_read_rawfile_text(const char* rel) {
  if (s_gui_resource_manager == NULL || rel == NULL || rel[0] == '\0') {
    return NULL;
  }
  NativeResourceManager* rm = (NativeResourceManager*)s_gui_resource_manager;
  RawFile* rawFile = OH_ResourceManager_OpenRawFile(rm, rel);
  if (rawFile == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "payload rawfile missing rel=%s", rel);
    return NULL;
  }
  long size = OH_ResourceManager_GetRawFileSize(rawFile);
  if (size < 0) {
    OH_ResourceManager_CloseRawFile(rawFile);
    return NULL;
  }
  char* buf = (char*)calloc((size_t)size + 1u, 1u);
  if (buf == NULL) {
    OH_ResourceManager_CloseRawFile(rawFile);
    return NULL;
  }
  if (size > 0) {
    int n = OH_ResourceManager_ReadRawFile(rawFile, buf, (size_t)size);
    if (n < 0) {
      free(buf);
      OH_ResourceManager_CloseRawFile(rawFile);
      return NULL;
    }
    buf[n < (int)size ? n : (int)size] = '\0';
  }
  OH_ResourceManager_CloseRawFile(rawFile);
  return buf;
}

// ---- ES diagnostic sink (cheng_host_es_diag) --------------------------------
// The media-network bridge calls this at each ES-open milestone (announce parse,
// es_index_bytes, esindex fetch, MQES/MQAS magic, dims) so the exact failure point is
// visible in hilog. Mirrors the Android host's cheng_host_es_diag. step codes are
// documented at the bridge call sites.
void cheng_host_es_diag(int32_t step, int32_t a, int32_t b) {
  __android_log_print(ANDROID_LOG_INFO, "ChengMD", "es diag step=%{public}d a=%{public}d b=%{public}d", (int)step, (int)a, (int)b);
}

// ---- CHT handler bridges (video/fullscreen) ---------------------------------
// Targets of the compiled handleVideoToggle. They gate the shared stream play-clock
// (s_stream_paused) so the displayed frame freezes on pause and resumes from the same
// frame on play (base shifted by the paused duration → no time jump). Idempotent.
static int s_cheng_host_fullscreen_active = 0;
static int s_cheng_host_video_muted_preview = 0;
static int s_cheng_host_video_muted_hires = 0;

void cheng_host_video_pause(void) {
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht video bridge: pause (was paused=%d)", s_stream_paused);
  if (!s_stream_paused) {
    s_stream_paused = 1;
    s_stream_pause_started_ns = cheng_monotime_ns();
    cheng_video_vsync_disengage();  // paused: fall back to event-driven pacing
    if (s_audio_player != NULL) OH_AVPlayer_Pause(s_audio_player);
  }
}
void cheng_host_video_play(void) {
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht video bridge: play (was paused=%d)", s_stream_paused);
  if (s_stream_paused) {
    s_stream_paused = 0;
    if (s_stream_pause_started_ns > 0 && s_stream_play_base_ns > 0) {
      s_stream_play_base_ns += (cheng_monotime_ns() - s_stream_pause_started_ns);
    }
    s_stream_pause_started_ns = 0;
    if (s_audio_player != NULL) OH_AVPlayer_Play(s_audio_player);
    // (vsync engage is NOT called here — cheng_gui_host_tick's self-healing invariant
    // re-arms on the next tick now that s_stream_paused is 0; see the tick() comment.)
  }
}

int32_t cheng_host_video_paused(int32_t handle) {
  (void)handle;
  return s_stream_paused;
}

void cheng_host_video_play_slot(int32_t handle) {
  (void)handle;
  cheng_host_video_play();
}

void cheng_host_video_pause_slot(int32_t handle) {
  (void)handle;
  cheng_host_video_pause();
}

// Drag-seek entry point (video-seek-scrub-blueprint.md §S3a). Fire-and-forget: hands the
// target off to whichever thread owns this stream's decode pipeline via ChengStreamCtx's
// fq_mu-guarded seek_requested/seek_target_ms (same shape as the S5-B pause gateway,
// cheng_host_video_pause above) — this may be called from the render/main thread, which must
// never touch sc->dec/demux directly (owned by the fetch or local-file worker thread). handle
// is accepted for API symmetry with pause/play/set_muted but currently unused (single active
// stream, same precedent as cheng_host_video_pause/play ignoring it).
void cheng_host_video_seek(int32_t handle, int32_t position_ms) {
  (void)handle;
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht video bridge: seek position_ms=%d", position_ms);
  ChengStreamCtx* sc = s_stream_ctx;
  if (sc == NULL || position_ms < 0) return;
  pthread_mutex_lock(&sc->fq_mu);
  sc->seek_requested = 1;
  sc->seek_target_ms = position_ms;
  pthread_cond_broadcast(&sc->cv_notfull_fq);  // wake a backed-off fetch/local worker (same broadcast precedent as pause)
  pthread_mutex_unlock(&sc->fq_mu);
}

void cheng_host_video_set_muted(int32_t handle, int32_t muted) {
  if (handle == 2) {
    s_cheng_host_video_muted_hires = muted != 0;
  } else {
    s_cheng_host_video_muted_preview = muted != 0;
  }
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht video bridge: muted handle=%d muted=%d", handle, muted != 0);
}

int32_t cheng_host_fullscreen_active(void) {
  return s_cheng_host_fullscreen_active;
}

void cheng_host_request_fullscreen(void) {
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht fullscreen bridge: request (was active=%d)", s_cheng_host_fullscreen_active);
  s_cheng_host_fullscreen_active = 1;
}

void cheng_host_exit_fullscreen(void) {
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht fullscreen bridge: exit (was active=%d)", s_cheng_host_fullscreen_active);
  s_cheng_host_fullscreen_active = 0;
}

// ---- CHT file picker bridge (cheng_host_open_file_picker) -------------------
// Real OHOS file selection. cheng_host_open_file_picker runs on the Cheng render
// thread and cannot call @ohos.file.picker directly (picker APIs are ArkTS-only,
// UIAbility-bound), so it hands the request to the ArkTS main thread via a NAPI
// threadsafe function (cheng_gui_entry_trigger_file_picker, cheng_gui_entry.cpp).
// ArkTS opens the matching picker class, copies the picked file into the app
// cache as a REAL sandbox path (no content://-style indirection — cheng_host_publish
// already requires a plain filesystem path), then calls back into
// cheng_gui_host_file_picker_deliver on the ArkTS thread (same direct-call pattern
// already used by cheng_gui_host_on_back / cheng_gui_host_set_resource_manager).
// That computes the resultMode payload — mirrors the Android chengFilePickerPayload
// contract (mobile_shell_codegen.cheng), substituting Android's content:// "uri"
// mode with the real extracted path — and dispatches it into the scene runtime
// through the existing generic state bridges (cheng_mobile_host_runtime_set_state /
// _append_string_array_state / _apply_media_selection / _apply_product_csv_selection).
// Known gap: qr-text (DID recovery QR import) needs an OHOS barcode-scan round-trip
// that is not wired here; it fails loudly instead of faking a decode (matches the
// GPS/location bridge's honesty convention below).
extern void cheng_gui_entry_trigger_file_picker(const char* ref_name, const char* kind, const char* result_mode, const char* result_state_ref);


void cheng_host_open_file_picker(const char* ref_name, const char* kind, const char* result_mode, const char* result_state_ref) {
  const char* k = kind != NULL ? kind : "";
  if (strcmp(k, "image") != 0 && strcmp(k, "video") != 0 && strcmp(k, "audio") != 0 &&
      strcmp(k, "text") != 0 && strcmp(k, "text-document") != 0 && strcmp(k, "image-video") != 0 &&
      strcmp(k, "any") != 0) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "file picker bridge: unsupported kind=%s", k);
    abort();
  }
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT",
                      "cht file picker bridge: open ref=%s kind=%s mode=%s state_ref=%s",
                      ref_name != NULL ? ref_name : "", k,
                      result_mode != NULL ? result_mode : "",
                      result_state_ref != NULL ? result_state_ref : "");
  cheng_gui_entry_trigger_file_picker(ref_name != NULL ? ref_name : "", k,
                                      result_mode != NULL ? result_mode : "",
                                      result_state_ref != NULL ? result_state_ref : "");
}

// ---- CHT GPS location capture bridge (cheng_host_capture_location) --------
// Real OHOS single-shot fix via @ohos.geoLocationManager. Mirrors Android's async
// contract (mobile_shell_codegen.cheng requestChengLocationCapture /
// chengRequestLocationCaptureFromNative): geoLocationManager.getCurrentLocation is a
// Promise, so this cannot block the Cheng render thread. Hand the request to ArkTS via
// a napi_threadsafe_function (same pattern as cheng_host_open_file_picker /
// cheng_gui_entry_trigger_file_picker above), return "" (async pending) immediately —
// the scene runtime's __csg_scene_capture_location_for_segment already treats "" as
// pending and reads the fix back from previewRef/statusRef/messageRef once ArkTS
// delivers it via cheng_gui_host_location_capture_deliver below. This is exactly the
// contract Android's real (non-digest) host uses: cheng_host_capture_location in
// mobile_shell_codegen.cheng also always returns "" and writes the fix back later
// through dispatchRuntimeState. Reverse geocoding (address label) is a higher-layer
// concern; this bridge only ever delivers the raw fix.
extern void cheng_gui_entry_trigger_location_capture(int32_t timeout_ms, int32_t max_age_ms,
                                                      const char* preview_ref, const char* status_ref,
                                                      const char* message_ref);

const char* cheng_host_capture_location(int32_t timeout_ms, int32_t max_age_ms, const char* preview_ref, const char* status_ref, const char* message_ref) {
  const char* previewRef = preview_ref != NULL ? preview_ref : "";
  const char* statusRef = status_ref != NULL ? status_ref : "";
  const char* messageRef = message_ref != NULL ? message_ref : "";
  if (previewRef[0] == '\0' || statusRef[0] == '\0' || messageRef[0] == '\0') {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "location capture bridge: missing state refs");
    return "err:unavailable:定位服务不可用，请检查 GPS 开关";
  }
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT",
                      "cht location capture bridge: request timeout_ms=%d max_age_ms=%d preview_ref=%s status_ref=%s message_ref=%s",
                      timeout_ms, max_age_ms, previewRef, statusRef, messageRef);
  cheng_gui_entry_trigger_location_capture(timeout_ms, max_age_ms, previewRef, statusRef, messageRef);
  return "";
}

// Delivered by cheng_gui_entry.cpp (ArkTS main-thread NAPI call) once the
// geoLocationManager permission/fix/timeout round trip resolves. Independently
// resolves cheng_mobile_host_runtime_set_state (exported default-visibility from
// scene_app_oh.o, statically linked into this same .so) instead of reusing gen.c's
// file-scope static s_runtime_set_state — mirrors cheng_resolve_exports' dladdr +
// dlopen(RTLD_NOLOAD) self-lookup (cheng_gui_host_gen.c) so this bridge stays
// self-contained in the hand-written adapter half. ok=0 writes statusRef=err_code,
// messageRef=err_message (mirrors Android's writeLocationCaptureFailure); ok!=0
// writes previewRef="<lat>, <lon>", statusRef="success" (mirrors Android's
// writeCapturedLocation coordinate branch).
typedef int32_t (*cheng_location_runtime_set_state_fn)(const char*, const char*);
static cheng_location_runtime_set_state_fn s_location_runtime_set_state = NULL;

static int cheng_location_resolve_runtime_set_state(void) {
  if (s_location_runtime_set_state != NULL) {
    return 1;
  }
  void* self_handle = NULL;
  Dl_info self_info;
  if (dladdr((void*)&cheng_location_resolve_runtime_set_state, &self_info) && self_info.dli_fname != NULL) {
    self_handle = dlopen(self_info.dli_fname, RTLD_NOW | RTLD_NOLOAD);
  }
  if (self_handle == NULL) {
    self_handle = dlopen(NULL, RTLD_NOW);
  }
  if (self_handle == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "location capture deliver: self dlopen failed: %s", dlerror());
    return 0;
  }
  s_location_runtime_set_state = (cheng_location_runtime_set_state_fn)dlsym(self_handle, "cheng_mobile_host_runtime_set_state");
  if (s_location_runtime_set_state == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "location capture deliver: dlsym cheng_mobile_host_runtime_set_state failed");
    return 0;
  }
  return 1;
}

void cheng_gui_host_location_capture_deliver(const char* preview_ref, const char* status_ref, const char* message_ref,
                                              int32_t ok, double lat, double lon,
                                              const char* err_code, const char* err_message) {
  const char* previewRef = preview_ref != NULL ? preview_ref : "";
  const char* statusRef = status_ref != NULL ? status_ref : "";
  const char* messageRef = message_ref != NULL ? message_ref : "";
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT",
                      "location capture deliver: ok=%d preview_ref=%s status_ref=%s",
                      ok, previewRef, statusRef);
  if (!cheng_location_resolve_runtime_set_state()) {
    return;
  }
  if (ok) {
    char coord[64];
    snprintf(coord, sizeof(coord), "%.6f, %.6f", lat, lon);
    s_location_runtime_set_state(previewRef, coord);
    s_location_runtime_set_state(statusRef, "success");
    if (strcmp(messageRef, previewRef) != 0) {
      s_location_runtime_set_state(messageRef, "");
    }
  } else {
    const char* code = err_code != NULL && err_code[0] != '\0' ? err_code : "unavailable";
    const char* msg = err_message != NULL && err_message[0] != '\0' ? err_message : "定位服务不可用，请检查 GPS 开关";
    s_location_runtime_set_state(statusRef, code);
    s_location_runtime_set_state(messageRef, msg);
  }
}

/* Content-location "view on map" bridge (content card tap → chengOpenContentLocation).
 * Android forwards this to a native Maps intent via chengOpenContentLocationFromNative;
 * Harmony has no equivalent Want/ArkTS round-trip wired yet (same NAPI↔ArkTS gap as GPS
 * capture above). The content_location_open effect dispatch already treats any status <= 0
 * as a graceful "did not open" (no crash, __csgSceneLastEventApplyStatus = -1), so — exactly
 * like GPS capture — fail loudly via hilog and decline honestly instead of aborting the
 * whole route walk. Never fake a successful open. */
int32_t cheng_host_open_content_location(const char* content_json) {
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht content location bridge unsupported on Harmony content_len=%zu",
                      content_json != NULL ? strlen(content_json) : 0u);
  return 0;
}

/* Social group creation bridge. Same missing-backend gap as the synccast siblings below
 * (group state lives in the dlopen'd libp2p feed runtime, which does not expose a group-create
 * export yet — only libp2p_feed_node_contents is wired). Click-only (fires from the explicit
 * "create group" button, never during an automated route walk), so — matching the synccast/
 * region-policy/content-delete family — fail loudly and abort rather than fabricate a group. */
const char* cheng_host_social_groups_create(const char* group_meta_json) {
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht social group create bridge unsupported on Harmony meta_len=%zu",
                      group_meta_json != NULL ? strlen(group_meta_json) : 0u);
  abort();
}

const char* cheng_host_social_synccast_control(const char* room_id, const char* op) {
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht synccast control bridge unsupported on Harmony room=%s op=%s",
                      room_id != NULL ? room_id : "",
                      op != NULL ? op : "");
  abort();
}

const char* cheng_host_social_synccast_refresh(const char* room_id) {
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht synccast refresh bridge unsupported on Harmony room=%s",
                      room_id != NULL ? room_id : "");
  abort();
}

const char* cheng_host_region_policy_refresh(void) {
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht region policy bridge unsupported on Harmony");
  abort();
}

// Fires on every tab_profile route enter (unlike the click-only bridges above), so it must
// NOT abort. The local libp2p identity lives in the dlopen'd feed runtime
// (libcheng_feed_harmony.so) which is blocked on the S2 feed_core.o build wall — until that
// lands, honestly report unavailable so the profile peerId text keeps its static fallback.
const char* cheng_host_profile_peer_id_refresh(void) {
  __android_log_print(ANDROID_LOG_WARN, "ChengCHT",
                      "profile peer id refresh: feed runtime identity unavailable on Harmony");
  return "{\"ok\":false,\"error\":\"peer_identity_unavailable\"}";
}

/* Profile asset-action submit (points/rwad recharge/transfer). The committing mutation —
 * points/ledger persistence and the async P2P NFC transfer branch — belongs to a native
 * profile asset service that has no Harmony implementation yet (same gap as trading_refresh/
 * rwad_nfc_receive_toggle below). Click-only (fires from the submit button inside the
 * assetActionState modal, never during an automated route walk), so fail loudly and abort
 * rather than fabricate a transfer result. */
const char* cheng_host_profile_asset_action_submit(const char* request_json) {
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht profile asset action submit bridge unsupported on Harmony request_len=%zu",
                      request_json != NULL ? strlen(request_json) : 0u);
  abort();
}

// ---- CHT distributed-feed bridge (cheng_host_node_contents_refresh) ---------
// Wires the retained scene's node-contents refresh action to the pure-Cheng
// distributed feed runtime (unimaker_compat_ffi NodeRuntime). That runtime pulls
// the full libp2p/QUIC/crypto/gossipsub closure, so — exactly like the in-app MoQ
// publisher (libcheng_moq_harmony.so) — it ships as its OWN dlopen'd .so
// (libcheng_feed_harmony.so) to keep its ~1371 shared libp2p symbols isolated from
// scene_app_oh.o. One feed node is booted lazily; each refresh subscribes to the
// social-publish gossip topic, dials the owner peer, drains inbound announces into
// the local feed, and returns the {ok,items} envelope the scene applies via
// __csg_scene_apply_node_contents_refresh (same shape as the old Kotlin shell's
// feedSubscribePeer + socialFeedSnapshot -> chengAppendNodeContentItems path).
typedef void (*cheng_feed_nimmain_fn)(void);
typedef int64_t (*cheng_feed_node_init_fn)(const char*);
typedef int32_t (*cheng_feed_node_start_fn)(int64_t);
typedef const char* (*cheng_feed_node_contents_fn)(int64_t, const char*, int32_t);
typedef const char* (*cheng_feed_network_discovery_snapshot_fn)(int64_t, const char*, int32_t, int32_t);
static cheng_feed_node_contents_fn s_feed_node_contents = NULL;
static int64_t s_feed_handle = 0;
static void* s_feed_dl_handle = NULL;
static pthread_mutex_t s_feed_mu = PTHREAD_MUTEX_INITIALIZER;
static char s_feed_result_buf[65536];
static char s_feed_nodes_snapshot_buf[65536];
// libp2p_network_discovery_snapshot lazy-resolution state — deliberately kept OUT
// of the 4-symbol core gate below (see cheng_host_nodes_snapshot_refresh comment):
// resolved once s_feed_dl_handle exists, result (including a miss) cached so a
// missing symbol does not retry dlsym on every route-enter call.
static cheng_feed_network_discovery_snapshot_fn s_feed_network_discovery_snapshot = NULL;
static int s_feed_network_discovery_snapshot_probed = 0;

// Boot the feed runtime once (dlopen + NimMain + node_init + node_start). Returns 0
// on ready, negative on any failure. Caller holds s_feed_mu.
static int cheng_feed_ensure_loaded(void) {
  if (s_feed_node_contents != NULL && s_feed_handle > 0) {
    return 0;
  }
  void* h = dlopen("libcheng_feed_harmony.so", RTLD_NOW | RTLD_LOCAL);
  if (h == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "feed: dlopen libcheng_feed_harmony.so failed: %s", dlerror());
    return -1;
  }
  cheng_feed_nimmain_fn nim = (cheng_feed_nimmain_fn)dlsym(h, "NimMain");
  cheng_feed_node_init_fn node_init = (cheng_feed_node_init_fn)dlsym(h, "libp2p_node_init_slim");
  cheng_feed_node_start_fn node_start = (cheng_feed_node_start_fn)dlsym(h, "libp2p_node_start");
  cheng_feed_node_contents_fn node_contents = (cheng_feed_node_contents_fn)dlsym(h, "libp2p_feed_node_contents");
  if (nim == NULL || node_init == NULL || node_start == NULL || node_contents == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "feed: dlsym missing (nim=%p init=%p start=%p contents=%p)",
                        (void*)nim, (void*)node_init, (void*)node_start, (void*)node_contents);
    return -2;
  }
  nim();
  const char* cfg = "{\"dataDir\":\"/data/storage/el2/base/haps/entry/cache/feed\","
                    "\"listenAddr\":\"/ip4/0.0.0.0/udp/0/quic-v1\"}";
  int64_t handle = node_init(cfg);
  if (handle <= 0) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "feed: node_init failed handle=%lld", (long long)handle);
    return -3;
  }
  if (node_start(handle) != 0) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "feed: node_start failed");
    return -4;
  }
  s_feed_handle = handle;
  s_feed_node_contents = node_contents;
  s_feed_dl_handle = h;
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "feed: runtime ready handle=%lld", (long long)handle);
  return 0;
}

// Lazily resolve libp2p_network_discovery_snapshot, independent of the 4-symbol
// core gate in cheng_feed_ensure_loaded above. This 5th export landed AFTER the S2
// build recipe's original 4 export-roots (docs/s2-feed-core-build-wall-20260708.md
// section 1: NimMain,libp2p_node_init_slim,libp2p_node_start,libp2p_feed_node_contents)
// — an already-deployed libcheng_feed_harmony.so built from that recipe legitimately
// lacks this symbol, and that must NOT fail the shared core gate
// cheng_host_node_contents_refresh depends on. Caller holds s_feed_mu and must have
// already observed cheng_feed_ensure_loaded()==0 (so s_feed_dl_handle is live).
// Returns 0 with s_feed_network_discovery_snapshot set on success, -1 on a cached miss.
static int cheng_feed_network_discovery_snapshot_ensure(void) {
  if (s_feed_network_discovery_snapshot_probed) {
    return s_feed_network_discovery_snapshot != NULL ? 0 : -1;
  }
  s_feed_network_discovery_snapshot_probed = 1;
  s_feed_network_discovery_snapshot =
      (cheng_feed_network_discovery_snapshot_fn)dlsym(s_feed_dl_handle, "libp2p_network_discovery_snapshot");
  if (s_feed_network_discovery_snapshot == NULL) {
    __android_log_print(ANDROID_LOG_WARN, "ChengCHT",
                        "feed: libp2p_network_discovery_snapshot symbol missing (built from pre-5th-root export-roots recipe?)");
    return -1;
  }
  return 0;
}

const char* cheng_host_node_contents_refresh(const char* peer_id, int32_t use_network) {
  pthread_mutex_lock(&s_feed_mu);
  if (cheng_feed_ensure_loaded() != 0) {
    pthread_mutex_unlock(&s_feed_mu);
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "cht feed bridge: runtime unavailable peer=%s", peer_id != NULL ? peer_id : "");
    return "{\"ok\":false,\"error\":\"feed_runtime_unavailable\"}";
  }
  const char* raw = s_feed_node_contents(s_feed_handle, peer_id != NULL ? peer_id : "", use_network);
  if (raw == NULL) {
    pthread_mutex_unlock(&s_feed_mu);
    return "{\"ok\":false,\"error\":\"feed_node_contents_returned_null\"}";
  }
  // The runtime returns a libc-strdup'd cstring; copy into a bounded static buffer
  // (the scene copies our return via strFromCStringCopy) and free the source so a
  // per-refresh call does not leak. Same libc allocator across host and feed .so.
  size_t n = strlen(raw);
  if (n >= sizeof(s_feed_result_buf)) {
    n = sizeof(s_feed_result_buf) - 1;
  }
  memcpy(s_feed_result_buf, raw, n);
  s_feed_result_buf[n] = '\0';
  free((void*)raw);
  pthread_mutex_unlock(&s_feed_mu);
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht feed bridge: node_contents_refresh peer=%s net=%d bytes=%zu",
                      peer_id != NULL ? peer_id : "", use_network, n);
  return s_feed_result_buf;
}

// Nodes-tab route-enter refresh: fires once every time tab_nodes becomes the
// active route (unlike the click-only bridges above), mirroring the profile
// peerId route-enter fetch above rather than Kotlin's own pushNodesToRuntime
// ("runtime_create"/"resume") async paths, which cover cold start / foreground
// resume, not this mid-session tab-switch case. Reuses the same dlopen'd feed
// runtime (s_feed_handle/s_feed_mu/cheng_feed_ensure_loaded) as
// node_contents_refresh above for the 4-symbol core gate, then independently
// lazy-resolves libp2p_network_discovery_snapshot via
// cheng_feed_network_discovery_snapshot_ensure (see its comment — this symbol is
// its OWN dependency scope, not folded into the shared core gate) and calls it
// with the same params as the Android reflection call (sourceFilter="", limit=64,
// connectCap=4). Fires on every route enter, so it must not abort — honestly
// report unavailable rather than crash.
const char* cheng_host_nodes_snapshot_refresh(void) {
  pthread_mutex_lock(&s_feed_mu);
  if (cheng_feed_ensure_loaded() != 0) {
    pthread_mutex_unlock(&s_feed_mu);
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "cht feed bridge: nodes snapshot runtime unavailable");
    return "{\"ok\":false,\"error\":\"feed_runtime_unavailable\"}";
  }
  if (cheng_feed_network_discovery_snapshot_ensure() != 0) {
    pthread_mutex_unlock(&s_feed_mu);
    return "{\"ok\":false,\"error\":\"discovery_snapshot_symbol_missing\"}";
  }
  const char* raw = s_feed_network_discovery_snapshot(s_feed_handle, "", 64, 4);
  if (raw == NULL) {
    pthread_mutex_unlock(&s_feed_mu);
    return "{\"ok\":false,\"error\":\"nodes_snapshot_refresh_returned_null\"}";
  }
  // Same libc allocator ownership handling as node_contents_refresh above: copy
  // the dupCString'd cstring into our own bounded static buffer and free the
  // source so a per-refresh call does not leak.
  size_t n = strlen(raw);
  if (n >= sizeof(s_feed_nodes_snapshot_buf)) {
    n = sizeof(s_feed_nodes_snapshot_buf) - 1;
  }
  memcpy(s_feed_nodes_snapshot_buf, raw, n);
  s_feed_nodes_snapshot_buf[n] = '\0';
  free((void*)raw);
  pthread_mutex_unlock(&s_feed_mu);
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht feed bridge: nodes_snapshot_refresh bytes=%zu", n);
  return s_feed_nodes_snapshot_buf;
}

const char* cheng_host_clear_published_contents(const char* peer_id) {
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht clear published bridge unsupported on Harmony peer=%s",
                      peer_id != NULL ? peer_id : "");
  abort();
}

const char* cheng_host_content_delete(const char* content_json, const char* confirm_message) {
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht content delete bridge unsupported on Harmony content_len=%zu message=%s",
                      content_json != NULL ? strlen(content_json) : 0u,
                      confirm_message != NULL ? confirm_message : "");
  abort();
}

const char* cheng_host_profile_bio_did_create(void) {
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht profile device DID bridge unsupported on Harmony");
  abort();
}

/* Profile device-DID import (recovery-phrase restore). Same missing mobile-CAPI dependency as
 * bio_did_create above (Android gates both behind cheng_resolve_mobile_capi_exports(), which has
 * no Harmony port). Click-only (fires from the explicit "import" button after recovery-text
 * entry), so fail loudly and abort like its sibling. recovery_raw is secret recovery material —
 * only its length is ever logged, never its content. */
const char* cheng_host_profile_bio_did_import(const char* recovery_raw) {
  const char* probe = recovery_raw != NULL ? recovery_raw : "";
  while (*probe != 0 && (unsigned char)(*probe) <= 32) {
    probe++;
  }
  if (*probe == 0) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "cht profile device DID import missing recovery text");
    return "{\"ok\":false,\"error\":\"device_did_recovery_required\"}";
  }
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht profile device DID import bridge unsupported on Harmony recovery_len=%zu",
                      recovery_raw != NULL ? strlen(recovery_raw) : 0u);
  abort();
}

const char* cheng_host_trading_refresh(const char* pair_json, const char* interval) {
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht trading refresh bridge unsupported on Harmony pair_len=%zu interval=%s",
                      pair_json != NULL ? strlen(pair_json) : 0u,
                      interval != NULL ? interval : "");
  abort();
}

const char* cheng_host_rwad_nfc_receive_toggle(const char* wallet_id, int32_t active) {
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht rwad nfc receive bridge unsupported on Harmony wallet=%s active=%d",
                      wallet_id != NULL ? wallet_id : "",
                      active);
  abort();
}

// ---- CHT publish bridge (cheng_host_publish) -------------------------------
// Target of the compiled external-publish effect (生产 computer-use 发布路径). The
// scene passes the first selected mediaFiles path; the host refuses empty/unreadable
// paths instead of substituting a bundled demo asset.
// 2026-07-23: dlsym switched to the parameterized entry
// cheng_moq_harmony_publish_serve_file_ex (media_moq_publisher_main.cheng) — the
// poster path is now supplied by THIS host (explicit arg) instead of being
// hardcoded to the bundled maitian poster inside the publisher, and the same
// entry persists the real publish CID receipt (publish_cid_pipeline record:
// assetCid/manifestCid/posterCid from the actual chunker) into
// cache/published_tasks.jsonl at ingest time. The prebuilt publisher .so is
// gate-checked for this symbol at packaging time (CMakeLists FATAL_ERROR), so a
// NULL dlsym here means the packaging gate was bypassed — fail loud, no fallback
// to the old whole-asset entry (the old symbol stays exported for ABI compat but
// is no longer the publish path).
static volatile int s_publish_started = 0;
static pthread_t s_publish_thread;
typedef int (*cheng_publish_serve_file_ex_fn)(const char*, const char*, const char*, const char*);
static cheng_publish_serve_file_ex_fn s_publish_serve = NULL;
static char s_publish_selected_path[PATH_MAX];
static char s_publish_poster_path[PATH_MAX];

static void* cheng_publish_serve_worker(void* arg) {
  (void)arg;
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht publish bridge: serve thread binding 0.0.0.0:ephemeral path=%{public}s poster=%{public}s", s_publish_selected_path, s_publish_poster_path);
  // ES pair empty: a user-picked gallery video has no pre-demuxed elementary
  // stream/index, so the announce is whole-asset (honest absence, no fake index).
  int rc = s_publish_serve ? s_publish_serve(s_publish_selected_path, s_publish_poster_path, "", "") : -99;
  // rc: 0=clean exit, 3=ingest/manifest/cid-persist err, 4=listener-start/ready err, 5=accept err (mediaMoqPublisherRun)
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht publish bridge: serve returned rc=%{public}d", rc);
  return NULL;
}

void cheng_host_publish(const char* selected_media_path, const char* publish_kind, const char* publish_payload_json) {
  // publish_trace t_pub0: the 发布 tap resolved to this native bridge call, before
  // anything is validated or queued to the serve thread. Mirrors the Android JNI
  // bridge's t_pub0 placement (cheng_host_publish() in mobile_shell_codegen.cheng)
  // so the same field name/marker text lets one oracle parse both platforms. hilog
  // masks any non-%{public} field as <private> on this device, so kind must be
  // tagged public to be legible (unlike the Android logcat convention it mirrors).
  __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell", "publish_trace t_pub0 kind=%{public}s",
                      publish_kind != NULL ? publish_kind : "");
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht publish bridge: external-publish (started=%d kind=%{public}s path=%{public}s payload_len=%zu)",
                      s_publish_started,
                      publish_kind != NULL ? publish_kind : "",
                      selected_media_path != NULL ? selected_media_path : "",
                      publish_payload_json != NULL ? strlen(publish_payload_json) : 0);
  if (s_publish_started) return;
  if (selected_media_path == NULL || selected_media_path[0] == '\0') {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: selected media path missing");
    return;
  }
  if (selected_media_path[0] != '/' || access(selected_media_path, R_OK) != 0) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: selected media path unreadable/unsupported path=%{public}s",
                        selected_media_path);
    return;
  }
  snprintf(s_publish_selected_path, sizeof(s_publish_selected_path), "%s", selected_media_path);
  // Stale ready/cid/peer files from a prior run would report the wrong port/publish
  // result / a peer that is no longer connected.
  unlink("/data/storage/el2/base/haps/entry/cache/moq_ready.port");
  unlink("/data/storage/el2/base/haps/entry/cache/moq_ready.cid");
  unlink("/data/storage/el2/base/haps/entry/cache/moq_ready.peer");
  int ex = cheng_host_extract_rawfile_to_cache("maitian_poster.jpg");
  if (ex != 0) { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: poster extraction failed"); return; }
  // Real extracted poster file (cheng_host_extract_rawfile_to_cache writes it here),
  // handed to the parameterized publish entry instead of the publisher assuming it.
  snprintf(s_publish_poster_path, sizeof(s_publish_poster_path), "%s", "/data/storage/el2/base/haps/entry/cache/maitian_poster.jpg");
  if (access(s_publish_poster_path, R_OK) != 0) { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: poster cache file unreadable path=%{public}s", s_publish_poster_path); return; }
  // publish_trace t_pub1: local artifact materialized (selected media path validated,
  // poster extracted to cache) — the Harmony publish flow has no separate JSON-post
  // build step like Android's chengPublishRun, so this is the closest analogous
  // boundary: everything local is ready, about to hand off to the serve thread
  // (dlopen + pthread_create below start the network-facing half).
  __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell", "publish_trace t_pub1 kind=%{public}s",
                      publish_kind != NULL ? publish_kind : "");
  if (s_publish_serve == NULL) {
    void* h = dlopen("libcheng_moq_harmony.so", RTLD_NOW | RTLD_LOCAL);
    if (h == NULL) { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: dlopen libcheng_moq_harmony.so failed: %s", dlerror()); return; }
    s_publish_serve = (cheng_publish_serve_file_ex_fn)dlsym(h, "cheng_moq_harmony_publish_serve_file_ex");
    if (s_publish_serve == NULL) { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: dlsym cheng_moq_harmony_publish_serve_file_ex failed (stale publisher prebuilt? CMake gate should have caught this)"); return; }
  }
  if (pthread_create(&s_publish_thread, NULL, cheng_publish_serve_worker, NULL) == 0) {
    s_publish_started = 1;
    __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht publish bridge: selected media publisher started (production GUI -> ephemeral port)");
    pthread_t reporter;
    if (pthread_create(&reporter, NULL, cheng_publish_port_reporter, NULL) == 0) pthread_detach(reporter);
  } else { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: pthread_create failed"); }
}

// ---- CHT startup own-serve bridge (cheng_host_start_own_serve) --------------
// Serves this device's own bundled 麦田 asset from app startup, independent of the
// user ever tapping 发布: a paired viewer device can dial in as soon as this app is
// up. Shares s_publish_started/s_publish_thread with cheng_host_publish above — ONE
// process, ONE accept loop; a later publish-button tap on a user-picked file sees
// s_publish_started already 1 and no-ops there, so this never double-binds a second
// listener. Resolves the NO-ARG "cheng_moq_harmony_publish_serve" symbol (not the
// _file variant cheng_host_publish uses) — that entry point takes no path argument
// and only ever opens the six bundled maitian.* cache paths it hardcodes internally
// (media_moq_publisher_main.cheng chengMoqHarmonyPublishServe), so no caller-supplied
// path can steer it at an arbitrary file.
typedef int (*cheng_publish_serve_bare_fn)(void);
static cheng_publish_serve_bare_fn s_publish_serve_bare = NULL;

static void* cheng_own_serve_worker(void* arg) {
  (void)arg;
  // mediaMoqPublisherRun reports WHICH rc=4 branch fired only on stderr, and a HAP
  // swallows stderr — persist it to the cache dir so hdc shell cat can attribute
  // the failure (first needed 2026-07-11: bind-38000 rc=4 with three candidate causes).
  int serve_errfd = open("/data/storage/el2/base/haps/entry/cache/moq_serve_stderr.log",
                         O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (serve_errfd >= 0) { dup2(serve_errfd, 2); close(serve_errfd); }
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht own-serve bridge: startup serve thread binding 0.0.0.0:38000 (bundled maitian asset)");
  int rc = s_publish_serve_bare ? s_publish_serve_bare() : -99;
  // rc: 0=clean exit, 3=ingest/manifest err, 4=listener-start/ready err, 5=accept err (mediaMoqPublisherRun)
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht own-serve bridge: serve returned rc=%{public}d", rc);
  return NULL;
}

void cheng_host_start_own_serve(void) {
  if (s_publish_started) {
    __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht own-serve bridge: publish/serve already running (started=%d), reusing — no second bind", s_publish_started);
    return;
  }
  static const char* kOwnAssets[6] = {
    "maitian.mp4", "maitian_poster.jpg", "maitian.h264",
    "maitian.moqidx", "maitian.aac", "maitian.aidx"
  };
  for (int i = 0; i < 6; i++) {
    int ex = cheng_host_extract_rawfile_to_cache(kOwnAssets[i]);
    if (ex != 0) {
      __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "cht own-serve bridge: rawfile extract failed asset=%{public}s rc=%{public}d", kOwnAssets[i], ex);
      return;
    }
  }
  // Stale ready/cid/peer files from a prior run would report the wrong port/publish
  // result / a peer that is no longer connected.
  unlink("/data/storage/el2/base/haps/entry/cache/moq_ready.port");
  unlink("/data/storage/el2/base/haps/entry/cache/moq_ready.cid");
  unlink("/data/storage/el2/base/haps/entry/cache/moq_ready.peer");
  if (s_publish_serve_bare == NULL) {
    void* h = dlopen("libcheng_moq_harmony.so", RTLD_NOW | RTLD_LOCAL);
    if (h == NULL) { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "cht own-serve bridge: dlopen libcheng_moq_harmony.so failed: %s", dlerror()); return; }
    s_publish_serve_bare = (cheng_publish_serve_bare_fn)dlsym(h, "cheng_moq_harmony_publish_serve");
    if (s_publish_serve_bare == NULL) { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "cht own-serve bridge: dlsym cheng_moq_harmony_publish_serve failed"); return; }
  }
  if (pthread_create(&s_publish_thread, NULL, cheng_own_serve_worker, NULL) == 0) {
    s_publish_started = 1;
    __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht own-serve bridge: startup publisher started (bundled maitian asset -> fixed port 38000)");
    pthread_t reporter;
    if (pthread_create(&reporter, NULL, cheng_publish_port_reporter, NULL) == 0) pthread_detach(reporter);
  } else { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "cht own-serve bridge: pthread_create failed"); }
}

// ---- S4 block cache production wiring (cheng_host_start_media_block_cache) --
// video-seek-scrub-blueprint.md §S4. cheng_scene_media_block_cache_init is a plain
// @exportc of web_scene_media_block_cache.cheng, part of the SAME scene module closure
// cheng_scene_media_es_sink_frame/cheng_host_video_seek already link against — resolved by
// re-dlopen'ing this process's own image (mirrors cheng_gui_host_gen.c's
// cheng_resolve_exports: dladdr+RTLD_NOLOAD self lookup, falling back to dlopen(NULL)), NOT
// a separate named .so the way libcheng_moq_harmony.so is (that is a distinct publish-only
// module). Root dir uses the same OHOS per-HAP sandbox cache convention as the moq_ready.*/
// rawfile-extract paths above, in its OWN subdirectory — physically isolated from both the
// cheng-publish staging flow (cheng_host_publish above, no dedicated subdir of its own) and
// moq_serve_stderr.log/moq_ready.* siblings (video-seek-scrub-blueprint.md §S4 module header
// requires this isolation; module never derives the path itself). Idempotent + fail-open:
// call once from ArkTS at startup (mirrors startOwnServe's "call once after
// setResourceManager" contract); a scene .so built before this slice simply lacks the export
// (dlsym NULL) and the cache stays uninitialized (WebSceneMediaBlockCacheGet already returns
// Err on every lookup in that state — no crash, same behavior as before this slice).
static int s_media_block_cache_started = 0;
void cheng_host_start_media_block_cache(void) {
  if (s_media_block_cache_started) {
    return;
  }
  static const char kMediaBlockCacheDir[] = "/data/storage/el2/base/haps/entry/cache/media_block_cache";
  Dl_info self_info;
  void* h = NULL;
  if (dladdr((void*)&cheng_host_start_media_block_cache, &self_info) && self_info.dli_fname != NULL) {
    h = dlopen(self_info.dli_fname, RTLD_NOW | RTLD_NOLOAD);
  }
  if (h == NULL) {
    h = dlopen(NULL, RTLD_NOW | RTLD_GLOBAL);
  }
  if (h == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "media block cache: self dlopen failed: %s", dlerror());
    return;
  }
  int32_t (*blockCacheInitFn)(const char*) = (int32_t (*)(const char*))dlsym(h, "cheng_scene_media_block_cache_init");
  if (blockCacheInitFn == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "media block cache: dlsym cheng_scene_media_block_cache_init failed (older scene .so?)");
    return;
  }
  int ok = blockCacheInitFn(kMediaBlockCacheDir) != 0;
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "media block cache: init cache=%s ok=%d", kMediaBlockCacheDir, ok);
  s_media_block_cache_started = ok ? 1 : 0;
}

// ---- #14 NAPI media control dispatch (r2: render-thread pending-action mailbox) ----
// Harmony's first NAPI-reachable play/pause/seek entry (task #14; S6 verdict follow-up:
// before this, the CSG media-control entry cheng_app_media_control — dlsym'd but never
// called as gen.c's s_app_media_control — and the seek_epoch-gated decoder handoff
// cheng_host_video_seek above BOTH had zero callers on this platform). Dispatch
// semantics mirror the landed Android JNI path (native_apply_media_action,
// mobile_shell_codegen.cheng, 57376dfb0): forward the action to the CSG layer
// (receipt/paint state), then — for a video-slot Seek whose payload is a well-formed
// non-negative int32 ms value — additionally hand the decoder-level whole-file seek
// target to cheng_host_video_seek.
//
// r2 THREADING (r1's ArkTS-thread direct dispatch was REFUTED on the S3a red line,
// aa6f3101d): cheng_host_video_seek's first line bare-reads s_stream_ctx and then locks
// fq_mu INSIDE that ctx, while cheng_stream_teardown_active (render thread, route-leave
// tick) frees the ctx — an ArkTS-thread call is a TOCTOU use-after-free (the Android
// twin sink is a volatile global write with no dereference, so the "mirrors Android"
// argument never covered the sink's thread safety). The CSG entry is same-disease, not
// a pure atomic forward: cheng_app_media_control (scene template,
// ts-csg/scripts/scene-runtime-smoke-source.mjs) runs __csg_scene_build, mutates
// __csgSceneGraph through WebSceneClearDirty + WebSceneApplyMediaControl[WithPayload],
// allocates via the single-threaded Cheng runtime (strFromCStringCopy), and its
// Seek-with-payload branch forwards into the ES transport
// (WebSceneMediaEsSeekToPositionMs) — all state the render thread's scene tick owns.
// Same disease, same cure, play/pause/seek alike: NOTHING here runs on the ArkTS
// thread. cheng_host_apply_media_action only validates + publishes the action into the
// latest-wins mailbox below and returns "queued"; cheng_host_media_mailbox_drain —
// called by the render loop (cheng_gui_entry.cpp RenderLoop) immediately before every
// cheng_gui_host_tick — consumes the newest action ON the render thread and runs the
// full dispatch body there. CSG call, receipt window and cheng_host_video_seek are then
// same-thread-serial with cheng_stream_teardown_active (which also clears the mailbox,
// see its forward decl above), closing the UAF exactly per the red line's prescription
// ("锁保护或强制渲染线程消息队列" — this is the message-queue arm).
//
// Mailbox contract: latest-wins (an unconsumed action is overwritten, logged); cleared
// on stream teardown (logged); a drained Seek that finds no live stream ctx is honestly
// dropped with a hilog line — an action never outlives the stream it targeted. Symbols
// resolve via the same self-dlopen the S4 block-cache init above uses (dladdr +
// RTLD_NOLOAD, dlopen(NULL) fallback), now lazily at first drain — so the resolver
// statics below are render-thread-owned. The two receipt debug exports are optional
// exactly as on Android (either NULL degrades receipt_kind to -1, which skips the
// decoder-seek dispatch; the CSG action itself still applies).
typedef int32_t (*cheng_host_media_control_dispatch_fn)(uint64_t, const char*, const char*, const char*);
typedef int32_t (*cheng_host_media_receipt_i32_fn)(void);
typedef int32_t (*cheng_host_media_receipt_i32_at_fn)(int32_t);
static cheng_host_media_control_dispatch_fn s_host_media_control_dispatch = NULL;  // render thread only
static cheng_host_media_receipt_i32_fn s_host_media_receipt_count = NULL;          // render thread only
static cheng_host_media_receipt_i32_at_fn s_host_media_receipt_kind_at = NULL;     // render thread only

// Pending-action mailbox. Writer: ArkTS main thread (cheng_host_apply_media_action).
// Consumers: render thread only (cheng_host_media_mailbox_drain each RenderLoop
// iteration; cheng_host_media_mailbox_clear from cheng_stream_teardown_active). Every
// field is guarded by s_media_mailbox_mu — a file-scope leaf mutex (never freed, unlike
// fq_mu which lives inside the freeable ctx; nothing is called while it is held, so no
// lock-order cycle is possible).
static pthread_mutex_t s_media_mailbox_mu = PTHREAD_MUTEX_INITIALIZER;
static char* s_media_mailbox_slot = NULL;     // owned heap copies (strdup)
static char* s_media_mailbox_action = NULL;
static char* s_media_mailbox_payload = NULL;
static int s_media_mailbox_pending = 0;
static uint64_t s_media_mailbox_gen = 0;      // bumps per publish; ties log lines together

static int cheng_host_resolve_media_control_dispatch(void) {
  if (s_host_media_control_dispatch != NULL) return 1;
  void* h = NULL;
  Dl_info self_info;
  if (dladdr((void*)&cheng_host_resolve_media_control_dispatch, &self_info) && self_info.dli_fname != NULL) {
    h = dlopen(self_info.dli_fname, RTLD_NOW | RTLD_NOLOAD);
  }
  if (h == NULL) {
    h = dlopen(NULL, RTLD_NOW | RTLD_GLOBAL);
  }
  if (h == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "media control bridge: self dlopen failed: %s", dlerror());
    return 0;
  }
  s_host_media_control_dispatch = (cheng_host_media_control_dispatch_fn)dlsym(h, "cheng_app_media_control");
  if (s_host_media_control_dispatch == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "media control bridge: dlsym cheng_app_media_control failed (older scene .so?)");
    return 0;
  }
  s_host_media_receipt_count = (cheng_host_media_receipt_i32_fn)dlsym(h, "cheng_app_debug_media_receipt_count");
  s_host_media_receipt_kind_at = (cheng_host_media_receipt_i32_at_fn)dlsym(h, "cheng_app_debug_media_receipt_kind_at");
  return 1;
}

// ArkTS-main-thread half: validate + publish only. The single runtime global it reads
// is s_gui_app_id — written exactly once, on the render thread, inside
// cheng_gui_host_begin before the first tick; a stale 0 read here only yields the
// honest cold-start drop (mirroring Android's runtime->app_id == 0u guard), never a
// dereference. Returns 1 = queued into the mailbox, 0 = dropped (logged).
int32_t cheng_host_apply_media_action(const char* action_kind, const char* slot_id, const char* payload) {
  const char* actionRaw = action_kind != NULL ? action_kind : "";
  const char* slotRaw = slot_id != NULL ? slot_id : "";
  const char* payloadRaw = payload != NULL ? payload : "";
  if (actionRaw[0] == '\0' || slotRaw[0] == '\0') {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "media control bridge: empty action/slot");
    return 0;
  }
  if (s_gui_app_id == 0u) {
    // Mirrors Android's runtime->app_id == 0u guard: the host has not begun yet (cold
    // start before the surface/render loop). Honest drop, logged — no queueing (a
    // queued action would otherwise fire whenever the loop eventually starts, which is
    // not what the external command meant).
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                        "media control bridge: host not begun, dropping slot=%s action=%s", slotRaw, actionRaw);
    return 0;
  }
  char* slotCopy = strdup(slotRaw);
  char* actionCopy = strdup(actionRaw);
  char* payloadCopy = strdup(payloadRaw);
  if (slotCopy == NULL || actionCopy == NULL || payloadCopy == NULL) {
    free(slotCopy);
    free(actionCopy);
    free(payloadCopy);
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                        "media control bridge: mailbox alloc failed, dropping slot=%s action=%s", slotRaw, actionRaw);
    return 0;
  }
  char* prevSlot = NULL;
  char* prevAction = NULL;
  char* prevPayload = NULL;
  uint64_t prevGen = 0;
  int prevPending = 0;
  uint64_t gen = 0;
  pthread_mutex_lock(&s_media_mailbox_mu);
  prevPending = s_media_mailbox_pending;
  if (prevPending) {  // latest-wins: take ownership of the stale entry, overwrite below
    prevSlot = s_media_mailbox_slot;
    prevAction = s_media_mailbox_action;
    prevPayload = s_media_mailbox_payload;
    prevGen = s_media_mailbox_gen;
  }
  s_media_mailbox_slot = slotCopy;
  s_media_mailbox_action = actionCopy;
  s_media_mailbox_payload = payloadCopy;
  s_media_mailbox_pending = 1;
  s_media_mailbox_gen += 1;
  gen = s_media_mailbox_gen;
  pthread_mutex_unlock(&s_media_mailbox_mu);
  if (prevPending) {
    __android_log_print(ANDROID_LOG_WARN, "ChengCHT",
                        "media control bridge: overwrote unconsumed slot=%s action=%s gen=%llu",
                        prevSlot, prevAction, (unsigned long long)prevGen);
    free(prevSlot);
    free(prevAction);
    free(prevPayload);
  }
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT",
                      "media control bridge: queued slot=%s action=%s payload_len=%zu gen=%llu",
                      slotRaw, actionRaw, strlen(payloadRaw), (unsigned long long)gen);
  return 1;
}

// #14 S5 backpressure gateway v2 (supersedes the touch-thread mirror call REFUTED in
// fix.patch.REFUTED-v1-touch-thread-uaf: cheng_host_video_pause/play run on the
// XComponent touch callback thread — OnDispatchTouch, cheng_gui_entry.cpp, via the
// scene's direct chengVideoPause/Play call, which is NOT the mailbox path above — so a
// v1-style dereference of s_stream_ctx from inside pause/play races
// cheng_stream_teardown_active's free(sc)/pthread_mutex_destroy(&sc->fq_mu)/NULL-out on
// the render thread with no ordering between the two threads, same TOCTOU shape as the
// S3a red line aa6f3101d).
//
// v2 instead pushes the mirror from HERE: this function already runs unconditionally,
// once per frame, on g_render_thread — the exact same thread that runs
// cheng_stream_teardown_active — so the dereference below is thread-serial with teardown
// by construction (RenderLoop's call order), needing no lock around the s_stream_ctx
// pointer itself. cheng_host_video_pause/play are UNCHANGED by this — they still only
// write the bare volatile int s_stream_paused (no sc dereference), exactly as before #14.
// last_seen is a function-local static: only this render-thread-only function ever reads
// or writes it, so the change-detection compare itself needs no synchronization either.
//
// #14 S5 v3 (session-boundary fix on top of v2): s_stream_paused/s_last_seen_paused are
// process-lifetime state with no session scoping, but the pause *intent* they encode is
// session-scoped in the UI (a fresh video defaults to playing). Without the two edges
// below, a user who pauses video A and leaves the route without resuming leaves
// s_stream_paused stuck at 1 forever; opening video B then calls
// cheng_host_video_pause()'s own pre-existing idempotent gate `if (!s_stream_paused)`,
// which is already false — the whole pause path (vsync disengage, AVPlayer_Pause, this
// mirror) silently no-ops for B. s_had_sc_last_frame is, like s_last_seen_paused, a
// function-local static only this render-thread-only function touches (a plain bool edge
// tracker, not a cached pointer — deliberately avoids comparing against a possibly-freed
// ChengStreamCtx* from a torn-down session).
//
// #14 S5 v4 (generation-counted session-end reset, replaces v3's NULL-sampling session-end
// edge): v3's `s_had_sc_last_frame && !hasSc` could only fire if some call to this function
// observed s_stream_ctx as NULL. Since both establishment paths dispatch onto an independent
// fetch thread (see s_stream_session_gen's declaration comment above
// cheng_stream_teardown_active), a teardown's NULL-out and the next session's non-NULL write
// can both land inside the gap between two consecutive calls to this function, in which case
// hasSc reads 1 on both sides and that edge never visibly transitions through 0 — the reset
// is silently skipped and s_stream_paused stays stuck from the torn-down session. Comparing
// s_stream_session_gen instead is immune to this: teardown bumps it unconditionally and
// synchronously with the free/NULL-out (same render thread, see above), so it has moved by
// exactly 1 relative to what this function last recorded regardless of whether the
// intervening NULL was ever sampled. The v3 session-start edge below (forceMirror) is
// unchanged — it answers a different question (did sc go NULL->non-NULL, to catch a pause
// pressed before establishment) and stays correct standing alone.
//
// #14 S5 v5 (this gen-check no longer clears s_stream_paused/s_last_seen_paused itself):
// that reset now happens inside cheng_stream_teardown_active, synchronously at session-end
// (see its declaration site above) — doing it there instead of here is what stops a touch
// thread pause/play write landing in the teardown-to-establish gap from being silently
// overwritten by this block on the next sync() call (v4's honestResidual: the sixth
// scenario). What this block still owns: forcing exactly one mirror push on the first call
// after a generation bump, so the (now already-correct) s_stream_paused value actually
// reaches the new sc — otherwise, in the compressed-timing case, the NULL-edge forceMirror
// below never fires (hasSc never visibly dips through 0) and s_stream_paused's value-compare
// gate could skip pushing it to sc_B until an unrelated later pause/play happens to flip it.
static void cheng_host_video_sync_paused_requested(void) {
  static int s_had_sc_last_frame = 0;   // render-thread-owned; tracks (s_stream_ctx != NULL) as of the previous call
  static unsigned int s_last_seen_gen = 0;  // render-thread-owned; s_stream_session_gen as of the previous call
  ChengStreamCtx* sc = s_stream_ctx;    // render-thread read, serialized with teardown's free+NULL by call order, not by a lock
  int hasSc = (sc != NULL);
  unsigned int curGen = s_stream_session_gen;  // render-thread read; writer is teardown, same thread, no lock needed (see above)

  // Session-end forced mirror (generation-counted, v5): at least one teardown ran since the
  // last call to this function, which already reset s_stream_paused/s_last_seen_paused
  // in-place (see cheng_stream_teardown_active) — this block's only remaining job is to make
  // sure that value (or whatever it's since become, if the touch thread wrote a fresh pause
  // for the new session in the meantime) actually reaches sc on the next call, independent
  // of what hasSc reads on this call (0 or already-1 in the compressed-timing case) — see
  // the comment above this function for why that independence is exactly the fix.
  int forceGen = 0;
  if (curGen != s_last_seen_gen) {
    forceGen = 1;
    s_last_seen_gen = curGen;
  }

  // Session-start edge (no sc last frame, live sc now): force one unconditional mirror
  // below, bypassing the value-compare. Covers the window where the user paused BEFORE
  // this session's stream finished establishing: s_stream_paused already flipped 0->1
  // (and s_last_seen_paused was already updated to match it) while sc was still NULL, so
  // the plain compare below would see wantPaused == s_last_seen_paused and skip the
  // mirror forever — this sc would never learn it should start paused.
  int forceMirror = (!s_had_sc_last_frame && hasSc) || forceGen;
  s_had_sc_last_frame = hasSc;

  int wantPaused = s_stream_paused;   // volatile int read — same cross-thread-read contract cheng_gui_host_tick already relies on
  if (!forceMirror && wantPaused == s_last_seen_paused) return;
  s_last_seen_paused = wantPaused;
  if (sc == NULL) return;
  pthread_mutex_lock(&sc->fq_mu);
  sc->paused_requested = wantPaused;
  pthread_cond_broadcast(&sc->cv_notfull_fq);  // wake a fetch thread backed off in its paused wait
  pthread_mutex_unlock(&sc->fq_mu);
}

// Render-thread consumer: called by RenderLoop (cheng_gui_entry.cpp) immediately before
// every cheng_gui_host_tick, so the whole dispatch body below — CSG call, receipt
// window, decoder seek — is same-thread-serial with the tick's route-leave teardown
// (cheng_stream_teardown_active). This is the body r1 ran on the ArkTS thread, moved
// here verbatim modulo the mailbox handoff. Runs cheng_host_video_sync_paused_requested
// first, unconditionally (independent of whether a mailbox action is pending), so the
// #14 S5 pause/play backpressure mirror rides this same every-frame render-thread call
// RenderLoop already makes (see that function's comment for the full thread-safety case).
void cheng_host_media_mailbox_drain(void) {
  // 2026-07-26: publish receipts ride the same render-thread drain tick (see gen.c mailbox).
  cheng_host_publish_receipt_drain();
  cheng_host_video_sync_paused_requested();
  char* slotOwned = NULL;
  char* actionOwned = NULL;
  char* payloadOwned = NULL;
  uint64_t gen = 0;
  pthread_mutex_lock(&s_media_mailbox_mu);
  if (!s_media_mailbox_pending) {
    pthread_mutex_unlock(&s_media_mailbox_mu);
    return;
  }
  slotOwned = s_media_mailbox_slot;
  actionOwned = s_media_mailbox_action;
  payloadOwned = s_media_mailbox_payload;
  gen = s_media_mailbox_gen;
  s_media_mailbox_slot = NULL;
  s_media_mailbox_action = NULL;
  s_media_mailbox_payload = NULL;
  s_media_mailbox_pending = 0;
  pthread_mutex_unlock(&s_media_mailbox_mu);
  if (cheng_host_resolve_media_control_dispatch()) {
    int32_t before_receipts = s_host_media_receipt_count != NULL ? s_host_media_receipt_count() : -1;
    int32_t ok = s_host_media_control_dispatch(s_gui_app_id, slotOwned, actionOwned, payloadOwned);
    int32_t after_receipts = s_host_media_receipt_count != NULL ? s_host_media_receipt_count() : -1;
    int32_t receipt_index = (after_receipts > before_receipts && after_receipts > 0) ? after_receipts - 1 : -1;
    int32_t receipt_kind = (receipt_index >= 0 && s_host_media_receipt_kind_at != NULL) ? s_host_media_receipt_kind_at(receipt_index) : -1;
    __android_log_print(ANDROID_LOG_INFO, "ChengCHT",
                        "media control bridge: slot=%s action=%s payload_len=%zu ok=%d receipts=%d,%d kind=%d gen=%llu",
                        slotOwned, actionOwned, strlen(payloadOwned), (int)ok, (int)before_receipts,
                        (int)after_receipts, (int)receipt_kind, (unsigned long long)gen);
    // receipt_kind == 1 is CHENG_MEDIA_KIND_VIDEO (WebSceneMediaMimeMatchesKind kindCode
    // 1 <-> "video/" — the same gate the Android JNI path uses, so an audio-slot Seek
    // keeps going through its own audio path and never yanks the video decoder). strtol
    // (not atoi) so a malformed payload is rejected instead of silently seeking to 0.
    if (ok != 0 && receipt_kind == 1 && strcmp(actionOwned, "Seek") == 0) {
      char* seekEndPtr = NULL;
      long seekMsParsed = strtol(payloadOwned, &seekEndPtr, 10);
      if (payloadOwned[0] != '\0' && seekEndPtr != NULL && *seekEndPtr == '\0' &&
          seekMsParsed >= 0 && seekMsParsed <= 2147483647L) {
        if (s_stream_ctx == NULL) {
          // Mailbox contract: no live stream ctx at consume time — honest drop, logged
          // (the CSG action above still applied; only the decoder-level seek is moot).
          __android_log_print(ANDROID_LOG_INFO, "ChengCHT",
                              "media control bridge: no stream ctx, dropping decoder seek ms=%ld gen=%llu",
                              seekMsParsed, (unsigned long long)gen);
        } else {
          cheng_host_video_seek(1, (int32_t)seekMsParsed);
        }
      }
    }
  }
  free(slotOwned);
  free(actionOwned);
  free(payloadOwned);
}

// Render-thread teardown hook (forward-declared above cheng_stream_teardown_active,
// which is its only caller): a still-unconsumed action targeted the stream/route being
// torn down and must not fire against the NEXT one — drop it honestly, logged.
static void cheng_host_media_mailbox_clear(const char* reason) {
  char* slotOwned = NULL;
  char* actionOwned = NULL;
  char* payloadOwned = NULL;
  uint64_t gen = 0;
  int hadPending = 0;
  pthread_mutex_lock(&s_media_mailbox_mu);
  hadPending = s_media_mailbox_pending;
  if (hadPending) {
    slotOwned = s_media_mailbox_slot;
    actionOwned = s_media_mailbox_action;
    payloadOwned = s_media_mailbox_payload;
    gen = s_media_mailbox_gen;
    s_media_mailbox_slot = NULL;
    s_media_mailbox_action = NULL;
    s_media_mailbox_payload = NULL;
    s_media_mailbox_pending = 0;
  }
  pthread_mutex_unlock(&s_media_mailbox_mu);
  if (hadPending) {
    __android_log_print(ANDROID_LOG_WARN, "ChengCHT",
                        "media control bridge: clearing unconsumed mailbox (%s) slot=%s action=%s gen=%llu",
                        reason, slotOwned, actionOwned, (unsigned long long)gen);
    free(slotOwned);
    free(actionOwned);
    free(payloadOwned);
  }
}

// ---- CHT clipboard bridge (cheng_host_clipboard_write_text) -----------------
// Target of the compiled handleCopyDidBackup. Real OHOS pasteboard write via the
// UDMF native C API (libpasteboard/libudmf). Forward-declared (opaque types) like
// the RawFile bridge above. The Add* calls COPY, so all four objects are created
// and destroyed here — no transfer, no double-free.
typedef struct OH_Pasteboard OH_Pasteboard;
typedef struct OH_UdmfData OH_UdmfData;
typedef struct OH_UdmfRecord OH_UdmfRecord;
typedef struct OH_UdsPlainText OH_UdsPlainText;
extern OH_Pasteboard* OH_Pasteboard_Create(void);
extern void OH_Pasteboard_Destroy(OH_Pasteboard* pasteboard);
extern int OH_Pasteboard_SetData(OH_Pasteboard* pasteboard, OH_UdmfData* data);
extern OH_UdmfData* OH_UdmfData_Create(void);
extern void OH_UdmfData_Destroy(OH_UdmfData* data);
extern int OH_UdmfData_AddRecord(OH_UdmfData* data, OH_UdmfRecord* record);
extern OH_UdmfRecord* OH_UdmfRecord_Create(void);
extern void OH_UdmfRecord_Destroy(OH_UdmfRecord* record);
extern int OH_UdmfRecord_AddPlainText(OH_UdmfRecord* record, OH_UdsPlainText* plainText);
extern OH_UdsPlainText* OH_UdsPlainText_Create(void);
extern void OH_UdsPlainText_Destroy(OH_UdsPlainText* plainText);
extern int OH_UdsPlainText_SetContent(OH_UdsPlainText* plainText, const char* content);

void cheng_host_clipboard_write_text(const char* text) {
  if (text == NULL) { return; }
  OH_UdsPlainText* pt = OH_UdsPlainText_Create();
  OH_UdmfRecord* rec = OH_UdmfRecord_Create();
  OH_UdmfData* data = OH_UdmfData_Create();
  OH_Pasteboard* pb = OH_Pasteboard_Create();
  if (pt != NULL && rec != NULL && data != NULL && pb != NULL) {
    OH_UdsPlainText_SetContent(pt, text);
    OH_UdmfRecord_AddPlainText(rec, pt);
    OH_UdmfData_AddRecord(data, rec);
    OH_Pasteboard_SetData(pb, data);
    __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht clipboard bridge: wrote %zu chars", strlen(text));
  }
  if (pb != NULL) { OH_Pasteboard_Destroy(pb); }
  if (data != NULL) { OH_UdmfData_Destroy(data); }
  if (rec != NULL) { OH_UdmfRecord_Destroy(rec); }
  if (pt != NULL) { OH_UdsPlainText_Destroy(pt); }
}
