// ===========================================================================
// OHOS driver glue (C, appended to the GLES host body translation unit).
// Exposes a tiny C API consumed by the C++ NAPI/XComponent entry (cheng_gui_entry.cpp).
// Drives cheng_app_* (which call back into present_compositor_frame ->
// cheng_android_gpu_ensure -> EGL setup + eglSwapBuffers in this same file).
// ===========================================================================

static cheng_app_init_fn        s_gui_app_init = NULL;
static cheng_app_set_window_fn  s_gui_app_set_window = NULL;
static cheng_app_tick_fn        s_gui_app_tick = NULL;
static cheng_app_needs_frame_fn s_gui_app_needs_frame = NULL;
static cheng_app_on_touch_milli_fn s_gui_app_on_touch = NULL;
static cheng_app_pause_fn       s_gui_app_pause = NULL;
static cheng_app_resume_fn      s_gui_app_resume = NULL;

static uint64_t s_gui_app_id = 0u;
static int      s_gui_phys_width = 0;
static int      s_gui_phys_height = 0;
static float    s_gui_density = 0.0f;

static void* s_gui_resource_manager = NULL;
static int   s_gui_runtime_payloads_applied = 0;
static int   s_gui_launch_args_applied = 0;
static int   s_gui_exports_resolved = 0;

// The RawFile readers in the host body call this to reach the resource manager.
void* cheng_ohos_resource_manager(void) {
  return s_gui_resource_manager;
}

void cheng_gui_host_set_resource_manager(void* rm) {
  s_gui_resource_manager = rm;
  __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell", "host set rm=%p", rm);
}

static char* cheng_gui_read_rawfile_text(const char* rel) {
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

static void cheng_gui_apply_payloads(void) {
  if (s_gui_runtime_payloads_applied == 0 && s_app_handle != NULL && s_gui_resource_manager != NULL) {
    cheng_mobile_host_runtime_set_manifest_payloads_fn setPayloads =
        (cheng_mobile_host_runtime_set_manifest_payloads_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_set_manifest_payloads");
    if (setPayloads != NULL) {
      char* manifest = cheng_gui_read_rawfile_text("mobile_shell_runtime_contract_v1.json");
      char* contract = cheng_gui_read_rawfile_text("mobile_shell_runtime_contract_payload.json");
      char* bundle   = cheng_gui_read_rawfile_text("mobile_shell_runtime_bundle_payload.json");
      setPayloads(manifest, contract, bundle);
      free(manifest); free(contract); free(bundle);
    }
    s_gui_runtime_payloads_applied = 1;
  }
  if (s_gui_launch_args_applied == 0 && s_app_handle != NULL && s_gui_resource_manager != NULL) {
    cheng_mobile_host_runtime_set_launch_args_fn setArgs =
        (cheng_mobile_host_runtime_set_launch_args_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_set_launch_args");
    if (setArgs != NULL) {
      char* kv   = cheng_gui_read_rawfile_text("mobile_shell_launch_args.kv");
      char* json = cheng_gui_read_rawfile_text("mobile_shell_launch_args.json");
      setArgs(kv, json);
      free(kv); free(json);
    }
    s_gui_launch_args_applied = 1;
  }
}

static int cheng_gui_resolve_exports(void) {
  if (s_gui_exports_resolved) {
    return 1;
  }
  if (!cheng_resolve_exports()) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "cheng_resolve_exports failed");
    return 0;
  }
  s_gui_app_init        = (cheng_app_init_fn)dlsym(s_app_handle, "cheng_app_init");
  s_gui_app_set_window  = (cheng_app_set_window_fn)dlsym(s_app_handle, "cheng_app_set_window");
  s_gui_app_tick        = (cheng_app_tick_fn)dlsym(s_app_handle, "cheng_app_tick");
  s_gui_app_needs_frame = (cheng_app_needs_frame_fn)dlsym(s_app_handle, "cheng_app_needs_frame");
  s_gui_app_on_touch    = (cheng_app_on_touch_milli_fn)dlsym(s_app_handle, "cheng_app_on_touch_milli");
  s_gui_app_pause       = (cheng_app_pause_fn)dlsym(s_app_handle, "cheng_app_pause");
  s_gui_app_resume      = (cheng_app_resume_fn)dlsym(s_app_handle, "cheng_app_resume");
  if (s_gui_app_init == NULL || s_gui_app_set_window == NULL || s_gui_app_tick == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "missing app export init=%p set_window=%p tick=%p",
                        (void*)s_gui_app_init, (void*)s_gui_app_set_window, (void*)s_gui_app_tick);
    return 0;
  }
  s_gui_exports_resolved = 1;
  return 1;
}

// Called once on the render thread (after the surface exists) before ticking.
// Returns 1 on success.
int cheng_gui_host_begin(void* window, int phys_width, int phys_height, float density) {
  if (!cheng_gui_resolve_exports()) {
    return 0;
  }
  cheng_gui_apply_payloads();
  if (s_gui_app_id == 0u) {
    s_gui_app_id = s_gui_app_init();
    __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell", "cheng_app_init -> %llu",
                        (unsigned long long)s_gui_app_id);
  }
  s_gui_phys_width  = phys_width;
  s_gui_phys_height = phys_height;
  s_gui_density     = density > 0.0f ? density : 1.0f;

  // Wire the host-body globals that the GLES present path reads.
  s_active_window  = (ANativeWindow*)window;
  s_active_width   = s_gui_phys_width;
  s_active_height  = s_gui_phys_height;
  s_active_density = s_gui_density;

  int logical_width  = (int)((float)s_gui_phys_width  / s_gui_density);
  int logical_height = (int)((float)s_gui_phys_height / s_gui_density);
  if (logical_width  <= 0) logical_width  = s_gui_phys_width;
  if (logical_height <= 0) logical_height = s_gui_phys_height;

  __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell",
                      "host_begin phys=%dx%d logical=%dx%d density=%.3f app_id=%llu",
                      s_gui_phys_width, s_gui_phys_height, logical_width, logical_height,
                      (double)s_gui_density, (unsigned long long)s_gui_app_id);

  s_gui_app_set_window(s_gui_app_id, 1u, logical_width, logical_height, s_gui_density);

  // One-shot probe: is libohaudio.so loadable in THIS app's linker namespace and do the
  // OH_AudioRenderer entry points resolve? findings.md:2866 showed libimage_source/libpixelmap
  // are blocked from the default namespace (DT_NEEDED would fail the whole .so → black screen),
  // so audio MUST be reached via dlopen and the symbols verified before any renderer is built.
  // The result decides whether streamed AAC audio can be wired at all on this device.
  {
    static int s_ohaudio_probed = 0;
    if (!s_ohaudio_probed) {
      s_ohaudio_probed = 1;
      void* h = dlopen("libohaudio.so", RTLD_NOW | RTLD_LOCAL);
      if (h == NULL) {
        const char* e = dlerror();
        __android_log_print(ANDROID_LOG_ERROR, "ChengAudioProbe",
                            "libohaudio.so dlopen FAILED: %{public}s (namespace-blocked → audio unavailable)",
                            e ? e : "(null)");
      } else {
        void* sym_build  = dlsym(h, "OH_AudioStreamBuilder_Create");
        void* sym_gen    = dlsym(h, "OH_AudioStreamBuilder_GenerateRenderer");
        void* sym_start  = dlsym(h, "OH_AudioRenderer_Start");
        void* sym_fwr    = dlsym(h, "OH_AudioRenderer_GetFramesWritten");
        __android_log_print(ANDROID_LOG_INFO, "ChengAudioProbe",
                            "libohaudio.so dlopen OK handle!=0=%{public}d Create=%{public}d GenRenderer=%{public}d Start=%{public}d FramesWritten=%{public}d",
                            h != NULL, sym_build != NULL, sym_gen != NULL, sym_start != NULL, sym_fwr != NULL);
        void* hc = dlopen("libnative_media_acodec.so", RTLD_NOW | RTLD_LOCAL);
        void* sym_acdec = NULL;
        if (hc != NULL) sym_acdec = dlsym(hc, "OH_AudioCodec_CreateByMime");
        __android_log_print(ANDROID_LOG_INFO, "ChengAudioProbe",
                            "acodec dlopen!=0=%{public}d OH_AudioCodec_CreateByMime=%{public}d", hc != NULL, sym_acdec != NULL);
      }
    }
  }
  return 1;
}

void cheng_gui_host_tick(float dt) {
  if (s_gui_app_id != 0u && s_gui_app_tick != NULL) {
    static int s_tkd = 0; int tkd = (s_tkd < 300);
    if (tkd) { char tb[80]; snprintf(tb, sizeof(tb), "TKD f=%d entry svid=%d sstart=%d", s_tkd, s_video_active, s_stream_starting); cheng_media_diag(tb); }
    s_gui_app_tick(s_gui_app_id, dt);
    if (tkd) cheng_media_diag("TKD after_app_tick");
    // Keep presenting while a video plays: the scene presents only when it
    // changes, so a static feed would freeze the clip. overlay_refresh replays
    // the cached scene layers + advances the media frame (draw_registered selects
    // the time-correct frame) + swaps — driving smooth, complete playback.
    // QUIC fetch now runs on the dedicated fetch thread (cheng_stream_fetch_worker), NOT
    // here — the render thread only presents, so it never blocks on the network. That is
    // what lifts playback from ~10fps-with-stutter toward smooth 30fps.
    if (tkd) cheng_media_diag("TKD before_overlay");
    if (s_video_active && s_replay_valid && s_replay_width > 0 && s_replay_height > 0) {
      cheng_mobile_host_present_overlay_refresh(s_replay_width, s_replay_height);
    }
    if (tkd) { cheng_media_diag("TKD after_overlay"); s_tkd++; }
    static int s_diag_frame = 0;
    if ((s_diag_frame++ % 60) == 0) {
      typedef int (*i32_void_fn)(void);
      i32_void_fn st = (i32_void_fn)dlsym(s_app_handle, "cheng_app_debug_last_main_status");
      i32_void_fn bs = (i32_void_fn)dlsym(s_app_handle, "cheng_app_debug_build_step");
      i32_void_fn lc = (i32_void_fn)dlsym(s_app_handle, "cheng_app_debug_compositor_layer_count");
      int status = st ? st() : -9999;
      int step   = bs ? bs() : -1;
      int layers = lc ? lc() : -1;
      int needs  = s_gui_app_needs_frame ? s_gui_app_needs_frame(s_gui_app_id) : -1;
      // CHT regression diag: when the GPU compositor build fails (status!=0/layers==0), surface the
      // exact atlas-coverage miss (glyph 801-804 / image 811 / svg 821-822) + node/ordinal/codepoint.
      int gcode = s_app_debug_glyph_atlas_fail_code ? s_app_debug_glyph_atlas_fail_code() : -1;
      int groute = s_app_debug_glyph_atlas_fail_route_index ? s_app_debug_glyph_atlas_fail_route_index() : -1;
      int gnode = s_app_debug_glyph_atlas_fail_node_id ? s_app_debug_glyph_atlas_fail_node_id() : -1;
      int gord = s_app_debug_glyph_atlas_fail_ordinal ? s_app_debug_glyph_atlas_fail_ordinal() : -1;
      int gcp = s_app_debug_glyph_atlas_fail_codepoint ? s_app_debug_glyph_atlas_fail_codepoint() : -1;
      int scode = s_app_debug_svg_atlas_fail_code ? s_app_debug_svg_atlas_fail_code() : -1;
      __android_log_print(ANDROID_LOG_INFO, "ChengGuiDiag",
                          "tick status=%{public}d step=%{public}d layers=%{public}d needs=%{public}d "
                          "glyphFail=%{public}d route=%{public}d node=%{public}d ord=%{public}d cp=%{public}d svgFail=%{public}d",
                          status, step, layers, needs, gcode, groute, gnode, gord, gcp, scode);
      // #31 diag: why the maitian video slot doesn't compose a VIDEO surface command.
      // guard: 0=would compose / 2370 route / 2376 cid / 2380 no-box / 2382 invisible / 2384 no-layer / -20 no video slot
      i32_void_fn mvg = (i32_void_fn)dlsym(s_app_handle, "cheng_app_debug_media_video_guard");
      i32_void_fn mvn = (i32_void_fn)dlsym(s_app_handle, "cheng_app_debug_media_video_node");
      i32_void_fn msc = (i32_void_fn)dlsym(s_app_handle, "cheng_app_debug_media_slot_count_all");
      i32_void_fn mar = (i32_void_fn)dlsym(s_app_handle, "cheng_app_debug_media_active_route");
      int sceneCmdCount = s_app_debug_media_surface_command_count ? s_app_debug_media_surface_command_count() : -99;
      i32_void_fn vca = (i32_void_fn)dlsym(s_app_handle, "cheng_app_debug_video_cmd_added");
      i32_void_fn vcn = (i32_void_fn)dlsym(s_app_handle, "cheng_app_debug_video_cmd_node");
      __android_log_print(ANDROID_LOG_INFO, "ChengGuiDiag", "videocmd added=%{public}d lastNode=%{public}d", vca?vca():-99, vcn?vcn():-99);
      __android_log_print(ANDROID_LOG_INFO, "ChengGuiDiag",
                          "mediaslot guard=%{public}d videoNode=%{public}d slotCount=%{public}d activeRoute=%{public}d videoActive=%{public}d streamStarting=%{public}d sceneCmd=%{public}d presentCmd=%{public}d presentVid=%{public}d",
                          mvg?mvg():-99, mvn?mvn():-99, msc?msc():-99, mar?mar():-99, s_video_active, s_stream_starting, sceneCmdCount, s_present_media_surface_command_count, s_present_media_surface_video_count);
    }
  }
}

void cheng_gui_host_pause(void) {
  if (s_gui_app_id != 0u && s_gui_app_pause != NULL) {
    s_gui_app_pause(s_gui_app_id);
  }
}

// ---- ES diagnostic sink (cheng_host_es_diag) --------------------------------
// The media-network bridge calls this at each ES-open milestone (announce parse,
// es_index_bytes, esindex fetch, MQES/MQAS magic, dims) so the exact failure point is
// visible in hilog. Mirrors the Android host's cheng_host_es_diag. step codes are
// documented at the bridge call sites.
void cheng_host_es_diag(int32_t step, int32_t a, int32_t b) {
  __android_log_print(ANDROID_LOG_INFO, "ChengMD", "es diag step=%d a=%d b=%d", (int)step, (int)a, (int)b);
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

static int cheng_file_picker_ext_eq(const char* ext, const char* lower) {
  size_t i = 0;
  for (; ext[i] != '\0' && lower[i] != '\0'; i++) {
    char c = ext[i];
    if (c >= 'A' && c <= 'Z') c = (char)(c - 'A' + 'a');
    if (c != lower[i]) return 0;
  }
  return ext[i] == '\0' && lower[i] == '\0';
}

static const char* cheng_file_picker_mime_for_path(const char* path) {
  const char* dot = path != NULL ? strrchr(path, '.') : NULL;
  if (dot == NULL) return "application/octet-stream";
  if (cheng_file_picker_ext_eq(dot, ".jpg") || cheng_file_picker_ext_eq(dot, ".jpeg")) return "image/jpeg";
  if (cheng_file_picker_ext_eq(dot, ".png")) return "image/png";
  if (cheng_file_picker_ext_eq(dot, ".webp")) return "image/webp";
  if (cheng_file_picker_ext_eq(dot, ".gif")) return "image/gif";
  if (cheng_file_picker_ext_eq(dot, ".mp4")) return "video/mp4";
  if (cheng_file_picker_ext_eq(dot, ".mov")) return "video/quicktime";
  if (cheng_file_picker_ext_eq(dot, ".webm")) return "video/webm";
  if (cheng_file_picker_ext_eq(dot, ".mp3")) return "audio/mpeg";
  if (cheng_file_picker_ext_eq(dot, ".m4a")) return "audio/mp4";
  if (cheng_file_picker_ext_eq(dot, ".aac")) return "audio/aac";
  if (cheng_file_picker_ext_eq(dot, ".wav")) return "audio/wav";
  if (cheng_file_picker_ext_eq(dot, ".txt")) return "text/plain";
  if (cheng_file_picker_ext_eq(dot, ".pdf")) return "application/pdf";
  if (cheng_file_picker_ext_eq(dot, ".epub")) return "application/epub+zip";
  return "application/octet-stream";
}

// Reads the whole file at path into a malloc'd buffer (caller frees). Returns NULL
// (and logs) on any I/O failure; outLen receives the byte count on success.
static unsigned char* cheng_file_picker_read_all(const char* path, long* outLen) {
  *outLen = 0;
  FILE* f = fopen(path, "rb");
  if (f == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "file picker: open failed path=%s errno=%d", path, errno);
    return NULL;
  }
  if (fseek(f, 0, SEEK_END) != 0) { fclose(f); return NULL; }
  long len = ftell(f);
  if (len < 0 || fseek(f, 0, SEEK_SET) != 0) { fclose(f); return NULL; }
  unsigned char* buf = (unsigned char*)malloc(len > 0 ? (size_t)len : 1u);
  if (buf == NULL) { fclose(f); return NULL; }
  size_t got = len > 0 ? fread(buf, 1, (size_t)len, f) : 0u;
  fclose(f);
  if ((long)got != len) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "file picker: short read path=%s got=%zu want=%ld", path, got, len);
    free(buf);
    return NULL;
  }
  *outLen = len;
  return buf;
}

static const char kChengBase64Alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Standard RFC 4648 base64 encode, no line wrapping (matches Android's
// android.util.Base64.NO_WRAP). Caller frees the returned buffer.
static char* cheng_base64_encode(const unsigned char* data, long len) {
  long outLen = ((len + 2) / 3) * 4;
  char* out = (char*)malloc((size_t)outLen + 1u);
  if (out == NULL) return NULL;
  long i = 0, o = 0;
  while (i + 3 <= len) {
    uint32_t n = ((uint32_t)data[i] << 16) | ((uint32_t)data[i + 1] << 8) | (uint32_t)data[i + 2];
    out[o++] = kChengBase64Alphabet[(n >> 18) & 0x3Fu];
    out[o++] = kChengBase64Alphabet[(n >> 12) & 0x3Fu];
    out[o++] = kChengBase64Alphabet[(n >> 6) & 0x3Fu];
    out[o++] = kChengBase64Alphabet[n & 0x3Fu];
    i += 3;
  }
  long rem = len - i;
  if (rem == 1) {
    uint32_t n = (uint32_t)data[i] << 16;
    out[o++] = kChengBase64Alphabet[(n >> 18) & 0x3Fu];
    out[o++] = kChengBase64Alphabet[(n >> 12) & 0x3Fu];
    out[o++] = '=';
    out[o++] = '=';
  } else if (rem == 2) {
    uint32_t n = ((uint32_t)data[i] << 16) | ((uint32_t)data[i + 1] << 8);
    out[o++] = kChengBase64Alphabet[(n >> 18) & 0x3Fu];
    out[o++] = kChengBase64Alphabet[(n >> 12) & 0x3Fu];
    out[o++] = kChengBase64Alphabet[(n >> 6) & 0x3Fu];
    out[o++] = '=';
  }
  out[o] = '\0';
  return out;
}

// "data:<mime>;base64,<...>" for a local file. Returns NULL on read/encode failure.
static char* cheng_file_picker_data_url(const char* path) {
  long len = 0;
  unsigned char* bytes = cheng_file_picker_read_all(path, &len);
  if (bytes == NULL) return NULL;
  char* b64 = cheng_base64_encode(bytes, len);
  free(bytes);
  if (b64 == NULL) return NULL;
  const char* mime = cheng_file_picker_mime_for_path(path);
  size_t need = strlen("data:") + strlen(mime) + strlen(";base64,") + strlen(b64) + 1u;
  char* out = (char*)malloc(need);
  if (out != NULL) {
    snprintf(out, need, "data:%s;base64,%s", mime, b64);
  }
  free(b64);
  return out;
}

// Reads a local text file (UTF-8) into a malloc'd NUL-terminated string.
static char* cheng_file_picker_read_text(const char* path) {
  long len = 0;
  unsigned char* bytes = cheng_file_picker_read_all(path, &len);
  if (bytes == NULL) return NULL;
  char* out = (char*)malloc((size_t)len + 1u);
  if (out != NULL) {
    memcpy(out, bytes, (size_t)len);
    out[len] = '\0';
  }
  free(bytes);
  return out;
}

// Delivered by cheng_gui_entry.cpp (ArkTS main-thread NAPI call) once the picker
// promise resolves and the picked file has been copied to a real sandbox path.
// Empty local_path = user cancelled or the picker/copy failed on the ArkTS side —
// an honest no-op, mirrors Android's onActivityResult RESULT_OK-mismatch branch.
void cheng_gui_host_file_picker_deliver(const char* ref_name, const char* kind, const char* result_mode,
                                         const char* result_state_ref, const char* local_path, const char* display_name) {
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT",
                      "file_picker_deliver ref=%s kind=%s mode=%s state_ref=%s path=%s name=%s",
                      ref_name ? ref_name : "", kind ? kind : "", result_mode ? result_mode : "",
                      result_state_ref ? result_state_ref : "", local_path ? local_path : "", display_name ? display_name : "");
  if (local_path == NULL || local_path[0] == '\0') {
    return;
  }
  const char* mode = result_mode != NULL ? result_mode : "";
  const char* stateRef = result_state_ref != NULL ? result_state_ref : "";

  if (strcmp(mode, "qr-text") == 0) {
    // No barcode-decode API is wired on Harmony yet (would need an @ohos.multimedia
    // scan-kit round-trip — same class of gap as the GPS/location bridges below).
    // Fail loudly + give the user visible feedback instead of faking a decode.
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "file_picker_deliver: qr-text decode unsupported on Harmony");
    if (s_runtime_set_state != NULL) {
      s_runtime_set_state("didActionHint", "此设备暂不支持二维码识别");
    }
    return;
  }
  if (strcmp(mode, "product-csv") == 0) {
    char* csvText = cheng_file_picker_read_text(local_path);
    if (csvText == NULL) {
      __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "file_picker_deliver: product-csv read failed path=%s", local_path);
      return;
    }
    if (s_runtime_apply_product_csv_selection != NULL) {
      int ok = s_runtime_apply_product_csv_selection(display_name != NULL ? display_name : "", csvText);
      __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "file_picker_deliver: product-csv ok=%d", ok);
    }
    free(csvText);
    return;
  }
  if (strcmp(mode, "media-selection") == 0) {
    const char* mime = cheng_file_picker_mime_for_path(local_path);
    char* dataUrl = NULL;
    const char* payload;
    if (strncmp(mime, "video/", 6) == 0) {
      payload = local_path;  // large video: pass the real path through, no base64 (matches Android's URI passthrough)
    } else {
      dataUrl = cheng_file_picker_data_url(local_path);
      if (dataUrl == NULL) {
        __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "file_picker_deliver: media-selection encode failed path=%s", local_path);
        return;
      }
      payload = dataUrl;
    }
    if (s_runtime_apply_media_selection != NULL) {
      int ok = s_runtime_apply_media_selection(stateRef, payload);
      __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "file_picker_deliver: media-selection kind=%s ok=%d", stateRef, ok);
    }
    if (dataUrl != NULL) free(dataUrl);
    return;
  }
  if (strcmp(mode, "data-url-array-append") == 0) {
    char* dataUrl = cheng_file_picker_data_url(local_path);
    if (dataUrl == NULL) {
      __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "file_picker_deliver: data-url-array-append encode failed path=%s", local_path);
      return;
    }
    if (s_runtime_append_string_array_state != NULL) {
      int ok = s_runtime_append_string_array_state(stateRef, dataUrl);
      __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "file_picker_deliver: data-url-array-append ok=%d", ok);
    }
    free(dataUrl);
    return;
  }

  // Remaining modes ("", "uri", "name", "text", "data-url") resolve to a single
  // scalar payload written through the generic state bridge — mirrors Android's
  // chengFilePickerPayload() + dispatchRuntimeState() pair.
  char* owned = NULL;
  const char* payload;
  if (strcmp(mode, "") == 0) {
    payload = "";
  } else if (strcmp(mode, "uri") == 0) {
    // OHOS has no cross-app content:// handle; the real sandbox path IS the
    // stable reference (Android's "uri" mode is likewise just an opaque handle).
    payload = local_path;
  } else if (strcmp(mode, "name") == 0) {
    payload = display_name != NULL ? display_name : "";
  } else if (strcmp(mode, "text") == 0) {
    owned = cheng_file_picker_read_text(local_path);
    if (owned == NULL) {
      __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "file_picker_deliver: text read failed path=%s", local_path);
      return;
    }
    payload = owned;
  } else if (strcmp(mode, "data-url") == 0) {
    owned = cheng_file_picker_data_url(local_path);
    if (owned == NULL) {
      __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "file_picker_deliver: data-url encode failed path=%s", local_path);
      return;
    }
    payload = owned;
  } else {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "file_picker_deliver: unsupported result mode=%s", mode);
    abort();
  }
  if (stateRef[0] != '\0' && s_runtime_set_state != NULL) {
    int ok = s_runtime_set_state(stateRef, payload);
    __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "file_picker_deliver: state_ref=%s ok=%d", stateRef, ok);
  }
  if (owned != NULL) free(owned);
}

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

/* GPS location capture is not yet wired on Harmony (needs a NAPI↔ArkTS
 * @ohos.geoLocationManager round-trip). Fail loudly and return the honest
 * synchronous unavailable error — the Cheng runtime writes it to the scene
 * (statusRef=unavailable, messageRef=中文). Never fake a success fix. */
const char* cheng_host_capture_location(int32_t timeout_ms, int32_t max_age_ms, const char* preview_ref, const char* status_ref, const char* message_ref) {
  (void)timeout_ms;
  (void)max_age_ms;
  (void)preview_ref;
  __android_log_print(ANDROID_LOG_ERROR, "ChengCHT",
                      "cht location capture bridge unsupported on Harmony status_ref=%s message_ref=%s",
                      status_ref != NULL ? status_ref : "",
                      message_ref != NULL ? message_ref : "");
  return "err:unavailable:定位服务不可用，请检查 GPS 开关";
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
static cheng_feed_node_contents_fn s_feed_node_contents = NULL;
static int64_t s_feed_handle = 0;
static pthread_mutex_t s_feed_mu = PTHREAD_MUTEX_INITIALIZER;
static char s_feed_result_buf[65536];

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
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "feed: runtime ready handle=%lld", (long long)handle);
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
static volatile int s_publish_started = 0;
static pthread_t s_publish_thread;
typedef int (*cheng_publish_serve_file_fn)(const char*);
static cheng_publish_serve_file_fn s_publish_serve = NULL;
static char s_publish_selected_path[PATH_MAX];

static int cheng_host_extract_rawfile_to_cache(const char* name) {
  NativeResourceManager* rm = (NativeResourceManager*)cheng_ohos_resource_manager();
  if (rm == NULL) { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: no resource manager"); return -1; }
  RawFile* rf = OH_ResourceManager_OpenRawFile(rm, name);
  if (rf == NULL) { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: rawfile missing %s", name); return -2; }
  long len = OH_ResourceManager_GetRawFileSize(rf);
  int ok = -3;
  if (len > 0) {
    uint8_t* buf = (uint8_t*)malloc((size_t)len);
    if (buf != NULL) {
      long got = 0;
      while (got < len) { int n = OH_ResourceManager_ReadRawFile(rf, buf + got, (size_t)(len - got)); if (n <= 0) break; got += n; }
      if (got == len) {
        char path[256];
        snprintf(path, sizeof(path), "/data/storage/el2/base/haps/entry/cache/%s", name);
        FILE* f = fopen(path, "wb");
        if (f != NULL) {
          ok = (fwrite(buf, 1, (size_t)len, f) == (size_t)len) ? 0 : -4;
          fclose(f);
          __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "publish: extracted %{public}s (%{public}ld B) ok=%{public}d", name, len, ok == 0);
        } else { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: cache open failed %s", path); ok = -5; }
      }
      free(buf);
    }
  }
  OH_ResourceManager_CloseRawFile(rf);
  return ok;
}

static void* cheng_publish_serve_worker(void* arg) {
  (void)arg;
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht publish bridge: serve thread binding 0.0.0.0:ephemeral path=%{public}s", s_publish_selected_path);
  int rc = s_publish_serve ? s_publish_serve(s_publish_selected_path) : -99;
  // rc: 0=clean exit, 3=ingest/manifest err, 4=listener-start/ready err, 5=accept err (mediaMoqPublisherRun)
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht publish bridge: serve returned rc=%{public}d", rc);
  return NULL;
}

// OHOS HAP cannot bind a fixed server port, so the publisher binds ephemeral and writes the
// kernel-assigned port to the ready file. Poll it and surface the port to hilog so the
// device-to-device subscriber can dial 192.168.x.x:<port>. Once the port is up, read the
// publish-result return channel (moq_ready.cid, written by the publisher right after the
// port file — may appear a beat later, poll-tolerant) and push the real asset cid into
// runtime state (publishedAssetCid) so the GUI/state layer sees the publish result.
static void* cheng_publish_port_reporter(void* arg) {
  (void)arg;
  const char* ready = "/data/storage/el2/base/haps/entry/cache/moq_ready.port";
  const char* ready_cid = "/data/storage/el2/base/haps/entry/cache/moq_ready.cid";
  int port = 0;
  for (int i = 0; i < 50 && port <= 0; i++) {
    FILE* f = fopen(ready, "r");
    if (f) {
      char buf[32]; memset(buf, 0, sizeof(buf));
      size_t n = fread(buf, 1, sizeof(buf) - 1, f);
      fclose(f);
      if (n > 0) {
        port = atoi(buf);
        if (port > 0) {
          __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "publish: selected media serving on ephemeral bound_port=%{public}d (dial 192.168.1.4:%{public}d)", port, port);
        }
      }
    }
    if (port <= 0) { struct timespec ts; ts.tv_sec = 0; ts.tv_nsec = 100000000L; nanosleep(&ts, NULL); } // 100ms
  }
  if (port <= 0) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: bound port not reported within 5s");
    return NULL;
  }
  char cid[256]; cid[0] = '\0';
  for (int i = 0; i < 50 && cid[0] == '\0'; i++) {
    FILE* f = fopen(ready_cid, "r");
    if (f) {
      char buf[256]; memset(buf, 0, sizeof(buf));
      size_t n = fread(buf, 1, sizeof(buf) - 1, f);
      fclose(f);
      while (n > 0 && (buf[n - 1] == '\n' || buf[n - 1] == '\r' || buf[n - 1] == ' ')) { n--; buf[n] = '\0'; }
      if (n > 0) { snprintf(cid, sizeof(cid), "%s", buf); }
    }
    if (cid[0] == '\0') { struct timespec ts; ts.tv_sec = 0; ts.tv_nsec = 100000000L; nanosleep(&ts, NULL); } // 100ms
  }
  if (cid[0] == '\0') {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: moq_ready.cid not reported within 5s, publishedAssetCid state not set");
    return NULL;
  }
  if (s_runtime_set_state == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: runtime set_state unavailable, publishedAssetCid=%{public}s dropped", cid);
    return NULL;
  }
  int set_ok = s_runtime_set_state("publishedAssetCid", cid);
  __android_log_print(set_ok != 0 ? ANDROID_LOG_INFO : ANDROID_LOG_ERROR, "ChengCHT",
                      "publish: publishedAssetCid=%{public}s runtime_set_state ok=%{public}d", cid, set_ok);
  return NULL;
}

void cheng_host_publish(const char* selected_media_path, const char* publish_kind, const char* publish_payload_json) {
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
  // Stale ready/cid files from a prior run would report the wrong port/publish result.
  unlink("/data/storage/el2/base/haps/entry/cache/moq_ready.port");
  unlink("/data/storage/el2/base/haps/entry/cache/moq_ready.cid");
  int ex = cheng_host_extract_rawfile_to_cache("maitian_poster.jpg");
  if (ex != 0) { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: poster extraction failed"); return; }
  if (s_publish_serve == NULL) {
    void* h = dlopen("libcheng_moq_harmony.so", RTLD_NOW | RTLD_LOCAL);
    if (h == NULL) { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: dlopen libcheng_moq_harmony.so failed: %s", dlerror()); return; }
    s_publish_serve = (cheng_publish_serve_file_fn)dlsym(h, "cheng_moq_harmony_publish_serve_file");
    if (s_publish_serve == NULL) { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: dlsym cheng_moq_harmony_publish_serve_file failed"); return; }
  }
  if (pthread_create(&s_publish_thread, NULL, cheng_publish_serve_worker, NULL) == 0) {
    s_publish_started = 1;
    __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "cht publish bridge: selected media publisher started (production GUI -> ephemeral port)");
    pthread_t reporter;
    if (pthread_create(&reporter, NULL, cheng_publish_port_reporter, NULL) == 0) pthread_detach(reporter);
  } else { __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "publish: pthread_create failed"); }
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

// System back gesture/button: route to the scene's back handler (pops the active
// route, e.g. video-player/fullscreen -> feed). Returns nonzero if the scene
// navigated back (caller consumes the event); 0 if already at root (caller lets
// the system handle = exit). The HarmonyOS native GUI has no built-in back, so
// the ArkTS page's onBackPress must call this (cheng_app_on_back is exported by
// the scene; the Kotlin Android shell calls it the same way in onBackPressed).
int cheng_gui_host_on_back(void) {
  if (s_gui_app_id == 0u || s_app_handle == NULL) {
    return 0;
  }
  typedef int32_t (*on_back_fn)(uint64_t);
  on_back_fn fn = (on_back_fn)dlsym(s_app_handle, "cheng_app_on_back");
  if (fn == NULL) {
    return 0;
  }
  int rc = (int)fn(s_gui_app_id);
  char bb[48]; snprintf(bb, sizeof(bb), "on_back consumed=%d", rc);
  cheng_media_diag(bb);
  return rc;
}

void cheng_gui_host_touch(int phase, int phys_x, int phys_y) {
  if (s_gui_app_id == 0u || s_gui_app_on_touch == NULL || s_gui_density <= 0.0f) {
    return;
  }
  // cheng_app_on_touch_milli takes logical coordinates in milli-units (logical px * 1000).
  int lx_milli = (int)(((float)phys_x / s_gui_density) * 1000.0f);
  int ly_milli = (int)(((float)phys_y / s_gui_density) * 1000.0f);
  { char tb[80]; int rt = s_app_debug_route_index ? s_app_debug_route_index() : -2;
    snprintf(tb, sizeof(tb), "touch phase=%d phys=%d,%d lx=%d ly=%d route=%d", phase, phys_x, phys_y, lx_milli/1000, ly_milli/1000, rt);
    cheng_media_diag(tb); }
  // Fullscreen-video back button (host-drawn ON TOP of the video): consume a DOWN
  // inside its published logical hit rect and route to on_back; everything else
  // forwards to the scene's own handlers. phase 0 == DOWN.
  if (phase == 0 && s_video_back_btn_w > 0) {
    int lx = lx_milli / 1000;
    int ly = ly_milli / 1000;
    if (lx >= s_video_back_btn_x && lx < s_video_back_btn_x + s_video_back_btn_w &&
        ly >= s_video_back_btn_y && ly < s_video_back_btn_y + s_video_back_btn_h) {
      cheng_gui_host_on_back();
      return;  // consume; do not forward to the scene
    }
  }
  s_gui_app_on_touch(s_gui_app_id, phase, 0, lx_milli, ly_milli);
}
