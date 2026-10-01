/* Headless GPU capture harness: drives the pure-Cheng retained runtime to render ONE
 * route into an EGL pbuffer at an exact logical viewport and reads the RGBA back, so the
 * device GPU output (the SAME pipeline the APK renders with) can be pixel-compared to the
 * React PWA. Links the generated Android host (GL present + offscreen capture) and the
 * app .so. Assets are read from $CHENG_HEADLESS_ASSET_DIR (no Activity/AssetManager).
 *
 * argv: <route_state> <out_raw_path> [width] [height]
 * out raw = 8-byte header (uint32 LE width, height) + width*height*4 RGBA (top-left order).
 */
#include <stdint.h>
#include <time.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>

extern void cheng_mobile_host_runtime_set_launch_args(const char* kv, const char* json);
extern void cheng_mobile_host_begin_offscreen_capture(int width, int height);
extern int cheng_mobile_host_read_offscreen_pixels(int width, int height, unsigned char* out_rgba);
extern void cheng_mobile_host_end_offscreen_capture(void);
extern uint64_t cheng_app_init(void);
extern void cheng_app_set_window(uint64_t app_id, uint64_t window_id, int32_t physical_w, int32_t physical_h, float scale);
extern void cheng_app_tick(uint64_t app_id, float delta_seconds);
extern int32_t cheng_app_debug_ink_overlay_spawn(int32_t x, int32_t y, int32_t size, int32_t color);
extern int32_t cheng_app_debug_ink_overlay_launch(int32_t seed);
extern void cheng_app_on_touch_milli(uint64_t app_id, int32_t action, int32_t pointer_id, int32_t x_milli, int32_t y_milli);
extern int32_t cheng_app_debug_ink_overlay_active(void);
/* Weak: media-less scenes (emitter media-gate) export no cheng_app_media_control;
 * the undefined weak symbol binds to 0 and run_media_control_sequence no-ops. */
extern int32_t cheng_app_media_control(uint64_t app_id, const char* slot_id, const char* action_kind, const char* payload) __attribute__((weak));
extern int32_t cheng_app_debug_media_surface_command_count(void);
extern int32_t cheng_app_debug_media_surface_batch_bytes(void);
extern int32_t cheng_app_debug_media_surface_batch_stride(void);
extern int32_t cheng_app_debug_media_surface_status(void);
extern int32_t cheng_app_debug_media_surface_prepare_identity_ok(void);
extern int32_t cheng_app_debug_media_surface_prepare_receipt_count(void);
extern int32_t cheng_app_debug_media_surface_prepare_status_at(int32_t index);
extern int32_t cheng_app_debug_media_surface_prepare_kind_at(int32_t index);
extern int32_t cheng_app_debug_media_surface_prepare_surface_at(int32_t index);
extern int32_t cheng_app_debug_media_surface_prepare_provider_at(int32_t index);
extern int32_t cheng_app_debug_media_surface_prepare_width_at(int32_t index);
extern int32_t cheng_app_debug_media_surface_prepare_height_at(int32_t index);
extern int32_t cheng_app_debug_media_receipt_count(void);
extern int32_t cheng_app_debug_media_receipt_action_code_at(int32_t index);
extern int32_t cheng_app_debug_media_receipt_status_at(int32_t index);
extern int32_t cheng_app_debug_media_receipt_state_at(int32_t index);
extern int32_t cheng_app_debug_media_receipt_kind_at(int32_t index);
extern int32_t cheng_app_debug_media_receipt_audio_provider_hash_at(int32_t index);
extern int32_t cheng_app_debug_media_slot_state(const char* slot_id);

const char* cheng_host_profile_asset_action_submit(const char* request_json) {
  (void)request_json;
  fprintf(stderr, "unexpected host call: cheng_host_profile_asset_action_submit\n");
  abort();
}

static void print_media_probe(const char* label) {
  const char* slot = "unimaker.truth.video.slot";
  int surface_count = cheng_app_debug_media_surface_command_count();
  int prepare_count = cheng_app_debug_media_surface_prepare_receipt_count();
  int receipt_count = cheng_app_debug_media_receipt_count();
  fprintf(stderr,
          "%s_media surface_count=%d surface_bytes=%d surface_stride=%d surface_status=%d prepare_identity=%d prepare_count=%d receipt_count=%d slot_state=%d\n",
          label,
          surface_count,
          cheng_app_debug_media_surface_batch_bytes(),
          cheng_app_debug_media_surface_batch_stride(),
          cheng_app_debug_media_surface_status(),
          cheng_app_debug_media_surface_prepare_identity_ok(),
          prepare_count,
          receipt_count,
          cheng_app_debug_media_slot_state(slot));
  for (int i = 0; i < prepare_count && i < 4; i++) {
    fprintf(stderr,
            "%s_media_prepare[%d] status=%d kind=%d surface=%d provider=%d size=%dx%d\n",
            label,
            i,
            cheng_app_debug_media_surface_prepare_status_at(i),
            cheng_app_debug_media_surface_prepare_kind_at(i),
            cheng_app_debug_media_surface_prepare_surface_at(i),
            cheng_app_debug_media_surface_prepare_provider_at(i),
            cheng_app_debug_media_surface_prepare_width_at(i),
            cheng_app_debug_media_surface_prepare_height_at(i));
  }
  for (int i = 0; i < receipt_count && i < 8; i++) {
    fprintf(stderr,
            "%s_media_receipt[%d] action=%d status=%d state=%d kind=%d audio_provider=%d\n",
            label,
            i,
            cheng_app_debug_media_receipt_action_code_at(i),
            cheng_app_debug_media_receipt_status_at(i),
            cheng_app_debug_media_receipt_state_at(i),
            cheng_app_debug_media_receipt_kind_at(i),
            cheng_app_debug_media_receipt_audio_provider_hash_at(i));
  }
}

static long long media_monotonic_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (long long)ts.tv_sec * 1000LL + (long long)(ts.tv_nsec / 1000000);
}

static int run_media_control_sequence(uint64_t app, const char* spec) {
  const char* slot = (spec != NULL && spec[0] != '\0') ? spec : "unimaker.truth.video.slot";
  long long begin_ms = media_monotonic_ms();
  if (cheng_app_media_control == 0) {
    fprintf(stderr, "media_control_sequence skipped: scene exports no cheng_app_media_control\n");
    return 0;
  }
  int open_ok = cheng_app_media_control(app, slot, "OpenAsset", "");
  long long after_open_ms = media_monotonic_ms();
  int play_ok = cheng_app_media_control(app, slot, "Play", "");
  long long after_play_ms = media_monotonic_ms();
  fprintf(stderr, "media_control_sequence slot=%s open=%d play=%d open_latency_ms=%lld play_latency_ms=%lld total_latency_ms=%lld\n",
          slot, open_ok, play_ok, after_open_ms - begin_ms, after_play_ms - after_open_ms, after_play_ms - begin_ms);
  print_media_probe("post_media_control");
  return open_ok != 0 && play_ok != 0;
}

static int run_capture_swipe(uint64_t app, const char* spec, const char* label) {
  int sx0, sy0, sx1, sy1, steps;
  if (sscanf(spec, "%d,%d,%d,%d,%d", &sx0, &sy0, &sx1, &sy1, &steps) != 5 || steps <= 0) {
    fprintf(stderr, "bad %s: %s\n", label, spec);
    return 0;
  }
  extern int32_t cheng_app_ink_overlay_command_count(uint64_t);
  cheng_app_on_touch_milli(app, 0, 0, sx0 * 1000, sy0 * 1000);
  for (int i = 1; i <= steps; i++) {
    int mx = sx0 + ((sx1 - sx0) * i) / steps;
    int my = sy0 + ((sy1 - sy0) * i) / steps;
    cheng_app_on_touch_milli(app, 2, 0, mx * 1000, my * 1000);
    cheng_app_tick(app, 0.016667f);
    if (i == steps / 2 || i == steps) {
      fprintf(stderr, "%s step=%d ink_cmds=%d\n", label, i, cheng_app_ink_overlay_command_count(0));
    }
  }
  cheng_app_on_touch_milli(app, 1, 0, sx1 * 1000, sy1 * 1000);
  cheng_app_tick(app, 0.016667f);
  fprintf(stderr, "%s done ink_cmds=%d\n", label, cheng_app_ink_overlay_command_count(0));
  return 1;
}

static void print_capture_probe(const char* label, int tx, int ty) {
  extern int32_t cheng_app_debug_route_hit_probe(int32_t, int32_t);
  extern int32_t cheng_app_debug_box_probe(int32_t, int32_t, int32_t);
  fprintf(stderr, "%s_route_hit=%d\n", label, cheng_app_debug_route_hit_probe(tx * 1000, ty * 1000));
  fprintf(stderr, "%s_box node=%d x=%d y=%d w=%d h=%d target=%d\n",
          label,
          cheng_app_debug_box_probe(tx * 1000, ty * 1000, 0),
          cheng_app_debug_box_probe(tx * 1000, ty * 1000, 1),
          cheng_app_debug_box_probe(tx * 1000, ty * 1000, 2),
          cheng_app_debug_box_probe(tx * 1000, ty * 1000, 3),
          cheng_app_debug_box_probe(tx * 1000, ty * 1000, 4),
          cheng_app_debug_box_probe(tx * 1000, ty * 1000, 5));
}

static void print_did_event_state(const char* label) {
  extern int32_t cheng_app_debug_last_event_hit_node_id(void);
  extern int32_t cheng_app_debug_last_event_hit_status(void);
  extern int32_t cheng_app_debug_last_event_apply_status(void);
  extern int32_t cheng_app_debug_state_value_truthy(const char*);
  fprintf(stderr, "%s_event hit_node=%d hit_status=%d apply_status=%d showDidRecoverySheet=%d showDidBackupSheet=%d didBusy=%d didText=%d peerId=%d didActionHint=%d\n",
          label,
          cheng_app_debug_last_event_hit_node_id(),
          cheng_app_debug_last_event_hit_status(),
          cheng_app_debug_last_event_apply_status(),
          cheng_app_debug_state_value_truthy("showDidRecoverySheet"),
          cheng_app_debug_state_value_truthy("showDidBackupSheet"),
          cheng_app_debug_state_value_truthy("didBusy"),
          cheng_app_debug_state_value_truthy("didText"),
          cheng_app_debug_state_value_truthy("peerId"),
          cheng_app_debug_state_value_truthy("didActionHint"));
}

static void print_node_boxes_from_env(void) {
  const char* spec = getenv("CHENG_CAPTURE_NODE_BOXES");
  if (spec == NULL || spec[0] == '\0') return;
  extern int32_t cheng_app_debug_node_box(int32_t, int32_t);
  const char* cursor = spec;
  while (*cursor != '\0') {
    char* end = NULL;
    long node = strtol(cursor, &end, 10);
    if (end == cursor) break;
    if (node > 0 && node <= 2147483647L) {
      int32_t node_id = (int32_t)node;
      fprintf(stderr, "node_box node=%d x=%d y=%d w=%d h=%d\n",
              node_id,
              cheng_app_debug_node_box(node_id, 0),
              cheng_app_debug_node_box(node_id, 1),
              cheng_app_debug_node_box(node_id, 2),
              cheng_app_debug_node_box(node_id, 3));
    }
    cursor = end;
    while (*cursor == ',' || *cursor == ' ' || *cursor == ';') cursor++;
  }
}

int main(int argc, char** argv) {
  const char* route = argc > 1 ? argv[1] : "home_default";
  const char* out_path = argc > 2 ? argv[2] : "/data/local/tmp/cheng_capture.raw";
  int width = argc > 3 ? atoi(argv[3]) : 390;
  int height = argc > 4 ? atoi(argv[4]) : 844;
  if (width <= 0 || height <= 0) {
    fprintf(stderr, "bad viewport %dx%d\n", width, height);
    return 1;
  }

  char kv[512];
  const char* lock = getenv("CHENG_CAPTURE_NO_ROUTE_LOCK") != NULL ? "" : "route_lock=1\n";
  if (getenv("CHENG_CAPTURE_INK_KV") != NULL) {
    snprintf(kv, sizeof(kv), "route_state=%s\n%sink_launch=1\nink_seed=52\n", route, lock);
  } else {
    snprintf(kv, sizeof(kv), "route_state=%s\n%s", route, lock);
  }
  cheng_mobile_host_runtime_set_launch_args(kv, "");

  cheng_mobile_host_begin_offscreen_capture(width, height);

  uint64_t app = cheng_app_init();
  cheng_app_set_window(app, 1u, width, height, 1.0f);
  /* Optional ink overlay fixture: CHENG_CAPTURE_INK_SPAWN="x,y,size,colorHex" */
  const char* ink_spec = getenv("CHENG_CAPTURE_INK_SPAWN");
  if (ink_spec != NULL && ink_spec[0] != '\0') {
    int ix = 0, iy = 0, isz = 0;
    unsigned int icolor = 0;
    if (sscanf(ink_spec, "%d,%d,%d,%x", &ix, &iy, &isz, &icolor) == 4) {
      cheng_app_debug_ink_overlay_spawn(ix, iy, isz, (int32_t)icolor);
    } else {
      fprintf(stderr, "bad CHENG_CAPTURE_INK_SPAWN: %s\n", ink_spec);
      return 1;
    }
  }
  /* Optional ink launch animation: CHENG_CAPTURE_INK_LAUNCH=<seed>, capture
   * after CHENG_CAPTURE_TICKS ticks (default 12). */
  const char* ink_launch = getenv("CHENG_CAPTURE_INK_LAUNCH");
  const char* tick_spec = getenv("CHENG_CAPTURE_TICKS");
  int tick_count = tick_spec != NULL ? atoi(tick_spec) : 12;
  if (tick_count <= 0 || tick_count > 2000) {
    fprintf(stderr, "bad CHENG_CAPTURE_TICKS\n");
    return 1;
  }
  /* settle the scene first so launch starts from a rendered base frame */
  int settle_count = getenv("CHENG_CAPTURE_SETTLE") != NULL ? atoi(getenv("CHENG_CAPTURE_SETTLE")) : 12;
  for (int i = 0; i < settle_count; i++) {
    cheng_app_tick(app, 0.016667f);
  }
  if (ink_launch != NULL && ink_launch[0] != '\0') {
    cheng_app_debug_ink_overlay_launch(atoi(ink_launch));
  }
  /* Optional swipe simulation: CHENG_CAPTURE_SWIPE="x0,y0,x1,y1,steps" — down,
   * N interpolated moves (one tick each), then up; reports qi overlay counts. */
  const char* swipe_spec = getenv("CHENG_CAPTURE_SWIPE");
  if (swipe_spec != NULL && swipe_spec[0] != '\0') {
    if (!run_capture_swipe(app, swipe_spec, "swipe")) {
      return 1;
    }
  }
  /* Optional tap simulation: CHENG_CAPTURE_TAP="x,y" (logical px) fired before
   * the timed tick run, to exercise qi/transition paths headlessly. */
  const char* tap_spec = getenv("CHENG_CAPTURE_TAP");
  if (tap_spec != NULL && tap_spec[0] != '\0') {
    int tx = 0, ty = 0;
    if (sscanf(tap_spec, "%d,%d", &tx, &ty) == 2) {
      print_capture_probe("pre_tap", tx, ty);
      {
        extern int32_t cheng_app_debug_route_index(void);
        fprintf(stderr, "pre_tap_route_index=%d\n", cheng_app_debug_route_index());
      }
      long long tap_begin_ms = media_monotonic_ms();
      if (getenv("CHENG_CAPTURE_TAP_UP_ONLY") == NULL) {
        cheng_app_on_touch_milli(app, 0, 0, tx * 1000, ty * 1000);
      }
      cheng_app_on_touch_milli(app, 1, 0, tx * 1000, ty * 1000);
      long long tap_up_ms = media_monotonic_ms();
      print_media_probe("tap_immediate");
      long long tap_immediate_ms = media_monotonic_ms();
      fprintf(stderr, "tap_receipt_latency_ms begin_to_immediate_media_probe=%lld\n", tap_immediate_ms - tap_begin_ms);
      {
        extern int32_t cheng_app_debug_build_step(void);
        extern int32_t cheng_app_debug_state_value_truthy(const char*);
        fprintf(stderr, "post_up_build_step=%d showSearch=%d\n", cheng_app_debug_build_step(), cheng_app_debug_state_value_truthy("showSearch"));
      }
      long long receipts_ready_ms = 0;
      for (int i = 0; i < 6; i++) {
        cheng_app_tick(app, 0.016667f);
        if (receipts_ready_ms == 0 && cheng_app_debug_media_receipt_count() >= 2) {
          receipts_ready_ms = media_monotonic_ms();
        }
      }
      {
        extern int32_t cheng_app_debug_route_index(void);
        fprintf(stderr, "post_tap_route_index=%d\n", cheng_app_debug_route_index());
      }
      fprintf(stderr, "tap_to_two_media_receipts_ms=%lld\n", receipts_ready_ms - tap_begin_ms);
      print_media_probe("post_tap");
      print_did_event_state("post_tap");
      fprintf(stderr, "tap_timing_ms tap_down_to_up=%lld tap_begin_to_media_probe=%lld\n",
              tap_up_ms - tap_begin_ms, media_monotonic_ms() - tap_begin_ms);
      fprintf(stderr, "tap done overlay_active=%d\n", cheng_app_debug_ink_overlay_active());
      {
        extern int32_t cheng_app_debug_route_hit_probe(int32_t, int32_t);
        fprintf(stderr, "route_hit_probe=%d\n", cheng_app_debug_route_hit_probe(tx * 1000, ty * 1000));
      }
    }
  }
  const char* swipe2_spec = getenv("CHENG_CAPTURE_SWIPE2");
  if (swipe2_spec != NULL && swipe2_spec[0] != '\0') {
    if (!run_capture_swipe(app, swipe2_spec, "swipe2")) {
      return 1;
    }
  }
  /* Optional system back: CHENG_CAPTURE_BACK=1 fires cheng_app_on_back after the
   * primary tap, so the captured frame reflects the post-back route. Used to
   * regression-gate the native back chain (route id + clean present). */
  if (getenv("CHENG_CAPTURE_BACK") != NULL) {
    extern int32_t cheng_app_on_back(uint64_t);
    extern int32_t cheng_app_debug_route_index(void);
    int back_before = cheng_app_debug_route_index();
    int back_rc = cheng_app_on_back(app);
    for (int i = 0; i < 6; i++) cheng_app_tick(app, 0.016667f);
    int back_after = cheng_app_debug_route_index();
    fprintf(stderr, "back rc=%d route_before=%d route_after=%d\n", back_rc, back_before, back_after);
  }
  const char* media_control_spec = getenv("CHENG_CAPTURE_MEDIA_OPEN_PLAY");
  if (media_control_spec != NULL) {
    if (!run_media_control_sequence(app, media_control_spec)) {
      fprintf(stderr, "media_control_sequence failed\n");
      return 1;
    }
    for (int i = 0; i < 6; i++) cheng_app_tick(app, 0.016667f);
    print_media_probe("post_media_control_tick");
  }
  /* Optional second tap (e.g. open sort sheet, then pick an option). */
  const char* tap2_spec = getenv("CHENG_CAPTURE_TAP2");
  if (tap2_spec != NULL && tap2_spec[0] != '\0') {
    int tx2 = 0, ty2 = 0;
    if (sscanf(tap2_spec, "%d,%d", &tx2, &ty2) == 2) {
      for (int i = 0; i < 4; i++) cheng_app_tick(app, 0.016667f);
      print_capture_probe("pre_tap2", tx2, ty2);
      if (getenv("CHENG_CAPTURE_TAP2_PROBE_ONLY") != NULL) {
        fprintf(stderr, "tap2 probe_only=1\n");
      } else {
        cheng_app_on_touch_milli(app, 0, 0, tx2 * 1000, ty2 * 1000);
        cheng_app_on_touch_milli(app, 1, 0, tx2 * 1000, ty2 * 1000);
        {
          extern int32_t cheng_app_debug_route_index(void);
          fprintf(stderr, "tap2 route=%d\n", cheng_app_debug_route_index());
        }
        for (int i = 0; i < 6; i++) cheng_app_tick(app, 0.016667f);
        print_did_event_state("post_tap2");
      }
    }
  }
  /* Optional state injection: CHENG_CAPTURE_STATE="ref=value" drives a scene
   * state entry directly (e.g. searchQuery) to exercise the M2 reactive path. */
  const char* state_spec = getenv("CHENG_CAPTURE_STATE");
  if (state_spec != NULL && state_spec[0] != '\0') {
    char ref[128], val[256];
    const char* eq = strchr(state_spec, '=');
    if (eq != NULL && (size_t)(eq - state_spec) < sizeof(ref)) {
      memcpy(ref, state_spec, (size_t)(eq - state_spec));
      ref[eq - state_spec] = 0;
      snprintf(val, sizeof(val), "%s", eq + 1);
      extern int32_t cheng_mobile_host_runtime_set_state(const char*, const char*);
      int sr = cheng_mobile_host_runtime_set_state(ref, val);
      fprintf(stderr, "set_state %s=%s -> %d\n", ref, val, sr);
    }
  }
  print_node_boxes_from_env();
  for (int i = 0; i < tick_count; i++) {
    if (getenv("CHENG_CAPTURE_TICK_TRACE") != NULL && i % 25 == 0) {
      extern int32_t cheng_app_debug_build_step(void);
      extern int32_t cheng_app_debug_last_main_status(void);
      extern int32_t cheng_app_debug_glyph_atlas_fail_code(void);
      extern int32_t cheng_app_debug_glyph_atlas_fail_node_id(void);
      extern int32_t cheng_app_debug_glyph_atlas_fail_codepoint(void);
      extern int32_t cheng_app_debug_frame_source(int32_t);
      fprintf(stderr, "tick=%d build_step=%d status=%d glyph_fail=%d node=%d cp=%d nf=%d,%d,%d,%d,%d\n", i, cheng_app_debug_build_step(), cheng_app_debug_last_main_status(), cheng_app_debug_glyph_atlas_fail_code(), cheng_app_debug_glyph_atlas_fail_node_id(), cheng_app_debug_glyph_atlas_fail_codepoint(), cheng_app_debug_frame_source(1), cheng_app_debug_frame_source(2), cheng_app_debug_frame_source(3), cheng_app_debug_frame_source(4), cheng_app_debug_frame_source(5));
      print_media_probe("tick_trace");
      fflush(stderr);
    }
    cheng_app_tick(app, 0.016667f);
  }
  print_media_probe("pre_read");

  size_t n = (size_t)width * (size_t)height * 4u;
  unsigned char* px = (unsigned char*)malloc(n);
  if (px == NULL) {
    fprintf(stderr, "oom\n");
    return 1;
  }
  if (!cheng_mobile_host_read_offscreen_pixels(width, height, px)) {
    fprintf(stderr, "offscreen read failed\n");
    return 1;
  }
  FILE* f = fopen(out_path, "wb");
  if (f == NULL) {
    fprintf(stderr, "open %s failed\n", out_path);
    return 1;
  }
  uint32_t w32 = (uint32_t)width;
  uint32_t h32 = (uint32_t)height;
  fwrite(&w32, 4u, 1u, f);
  fwrite(&h32, 4u, 1u, f);
  fwrite(px, 1u, n, f);
  fclose(f);
  free(px);
  printf("capture ok route=%s %dx%d -> %s\n", route, width, height, out_path);
  fflush(stdout);
  fflush(stderr);
  cheng_mobile_host_end_offscreen_capture();
  _Exit(0);
}

/* ---- host-support shims for media-less/standalone capture runs ----
 * The scene/capi libraries import these from the app shell (hand-written C).
 * The capture executable provides minimal equivalents: serial "parallelism",
 * clock/entropy via libc, logs to stderr, panic aborts. */
void cheng_mobile_host_emit_log(const char* line) {
  if (line != NULL) fprintf(stderr, "scene_log %s\n", line);
}
int64_t cheng_monotime_ns(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (int64_t)ts.tv_sec * 1000000000LL + ts.tv_nsec;
}
int32_t cheng_system_entropy_fill(void* out, int32_t byte_count) {
  if (out == NULL || byte_count <= 0) return 1;
  FILE* f = fopen("/dev/urandom", "rb");
  if (f == NULL) return 2;
  size_t got = fread(out, 1, (size_t)byte_count, f);
  fclose(f);
  return got == (size_t)byte_count ? 0 : 3;
}
int32_t cheng_thread_parallelism(void) { return 1; }
int32_t cheng_thread_start(void* entry, void* arg) { (void)entry; (void)arg; return 0; }
int32_t cheng_thread_join(int32_t handle) { (void)handle; return 0; }
void cheng_panic_cstring_and_exit(const char* message) {
  fprintf(stderr, "panic %s\n", message != NULL ? message : "");
  fflush(stderr);
  abort();
}
int64_t cheng_epoch_time_seconds(void) {
  return (int64_t)time(NULL);
}
