// GENERATED split of cheng_gui_host.c — GEN half (slice-8 physical split, mechanical).
#include "cheng_gui_host_shared.h"

// s_resource_manager: generator-name alias for the real NativeResourceManager
// handle, which this file owns as s_gui_resource_manager (void*, set by
// cheng_gui_apply_payloads's OH_ResourceManager_InitNativeResourceManager
// call and exposed cross-file via cheng_gui_host_shared.h). Same physical
// storage, no behavior change — lets cheng_host_read_asset below match the
// generator (MobileShellHarmonyHostSource) byte-for-byte.
#define s_resource_manager s_gui_resource_manager

ChengStreamCtx* s_stream_ctx = NULL;
volatile int s_stream_starting = 0;
// Active fullscreen route captured at fetch-thread spawn (single fetch at a time,
// guarded by s_stream_starting, so a plain static is race-free).
// v3e/v4 history (kept for context): this used to be a single route index
// (CHENG_ROUTE_MAITIAN_LOCAL==15) shared by BOTH cards, because the generator baked
// exactly one video into the whole home_content_detail_open route regardless of which
// card was tapped — so no host-side constant could ever select 胡广生's own network
// stream (device-verified: both cards landed on route=15 and spawned the identical
// LOCAL maitian.mp4 worker).
// v5 (2026-07-10): per-card fan-out landed at the generator layer
// (contentRouteTargetForNode in csg-web-materializer.ts + applyMobileContentSnapshotToRoutes
// in unimaker-one-click.mjs) — home_content_detail_open is no longer one route shared by
// every card; each video card now gets its own home_content_detail_open_<content.id>
// route, baked with THAT card's own content/sourcePeer. Local-vs-network can therefore no
// longer be decided by route index at all (below); it is decided by comparing the CARD'S
// OWN sourcePeer (peerHost/peerPort, already transported end-to-end) against this
// device's own IP (see cheng_gui_host_peer_matches_own_ip below).
// M1 slice-5 (2026-07-10): the fixed CHENG_ROUTE_CONTENT_DETAIL_FIRST/LAST index range that
// used to live here (a host-side literal that had to be hand-updated whenever the fixture's
// video count changed) is gone — "is this route a fullscreen video" is now answered by the
// App core's own generated route table via dlsym cheng_app_debug_route_is_fullscreen_video
// (see s_app_debug_route_is_fullscreen_video below), which is regenerated from the real
// scene route facts every materialize run (scene-runtime-smoke-source.mjs). If the symbol is
// missing (stale .o built before this slice landed), the query call sites below log loudly
// and default to "not fullscreen video" — never a silent guess.
// This Harmony device's own LAN IP(s). A tapped card's sourcePeer.host equal to one of them
// means the card's video IS this device's own bundled asset (麦田) — play the local rawfile
// copy, no QUIC dial; any other host dials THAT peer's publisher over the network
// (胡广生, or a future third card, uniformly — see the worker-selection call site below).
// M1 slice-5 (2026-07-10): the fixed "192.168.1.4" literal that used to live here is gone —
// see cheng_gui_host_peer_matches_own_ip below (real getifaddrs() discovery, resolved once
// and cached for the process lifetime; no hot-reload on network change this slice — a NIC
// add/drop mid-session is a separate follow-up).
#define CHENG_GUI_HOST_OWN_IP_MAX 8
static char s_own_ip_text[CHENG_GUI_HOST_OWN_IP_MAX][INET_ADDRSTRLEN];
static uint32_t s_own_ip_addr[CHENG_GUI_HOST_OWN_IP_MAX];
static uint32_t s_own_ip_netmask[CHENG_GUI_HOST_OWN_IP_MAX];
static int s_own_ip_count = -1; /* -1 = not yet resolved this process */

// Enumerates this device's non-loopback IPv4 interface addresses via getifaddrs() (POSIX;
// present in the OHOS NDK sysroot, $OHOS_SDK/native/sysroot/usr/include/ifaddrs.h — same
// bionic-derived shape as Android/glibc). Cached for the process lifetime ONLY once it has
// actually found at least one non-loopback address — no hot-reload on network CHANGE this
// slice (a NIC add/drop mid-session is a separate follow-up). But a getifaddrs() failure or
// an empty result at the FIRST call site to ever run (this device's own own-serve self-stamp,
// cheng_host_start_own_serve → cheng_publish_port_reporter, fired within ~1-2s of app cold
// start — see its call site) must NOT be latched permanently: Wi-Fi association can still be
// settling that early, and the old "resolve once, cache forever" design turned that transient
// miss into every later peer (including the eventual user tap, seconds later with Wi-Fi long
// since up) being misjudged as "network" forever — this device-verified own-dial defect (peer
// == this device's own discovered IP, still dialed over QUIC instead of the local worker) is
// the real-world hit of that gap. s_own_ip_count therefore stays -1 (retry-eligible) on a
// zero/failed result instead of being pinned to 0; a genuinely interface-less sandbox just
// re-runs getifaddrs() on every subsequent check (cheap, side-effect-free) until one succeeds.
static void cheng_gui_host_resolve_own_ips(void) {
  if (s_own_ip_count > 0) return;
  struct ifaddrs* ifas = NULL;
  if (getifaddrs(&ifas) != 0) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
        "own-ip: getifaddrs() FAILED (errno=%d) -- no local address known yet, every peer treated as network (will retry)", errno);
    return;
  }
  int found = 0;
  for (struct ifaddrs* it = ifas; it != NULL && found < CHENG_GUI_HOST_OWN_IP_MAX; it = it->ifa_next) {
    if (it->ifa_addr == NULL || it->ifa_addr->sa_family != AF_INET) continue;
    uint32_t addr = ((struct sockaddr_in*)it->ifa_addr)->sin_addr.s_addr;
    if ((ntohl(addr) >> 24) == 127) continue; /* 127.0.0.0/8 loopback, any address in range */
    uint32_t netmask = 0xFFFFFFFFu;
    if (it->ifa_netmask != NULL && it->ifa_netmask->sa_family == AF_INET) {
      netmask = ((struct sockaddr_in*)it->ifa_netmask)->sin_addr.s_addr;
    }
    int idx = found;
    struct in_addr ina; ina.s_addr = addr;
    inet_ntop(AF_INET, &ina, s_own_ip_text[idx], sizeof(s_own_ip_text[idx]));
    s_own_ip_addr[idx] = addr;
    s_own_ip_netmask[idx] = netmask;
    found++;
  }
  freeifaddrs(ifas);
  if (found == 0) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
        "own-ip: no non-loopback IPv4 interface found yet -- every peer treated as network (will retry)");
    return;
  }
  for (int i = 0; i < found; i++) {
    __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell", "own-ip: discovered %s", s_own_ip_text[i]);
  }
  s_own_ip_count = found; /* only a successful find latches the cache */
}

// Picks which discovered own-IP to compare a peer against when this device has more than
// one non-loopback interface: an EXACT address match always wins first (a device can carry
// two interfaces on the SAME /24 — e.g. Wi-Fi plus a hotspot/tether bridge — where a naive
// "first subnet match" would return the WRONG sibling interface and make an exact peer match
// fail downstream; see cheng_gui_host_peer_matches_own_ip). Only when no interface is an
// exact match does it fall back to same-subnet-as-peer (the interface actually reachable
// from/to that peer), else the first discovered. Returns NULL if no local address is known.
static const char* cheng_gui_host_own_ip_for_peer(const char* peerHost) {
  cheng_gui_host_resolve_own_ips();
  if (s_own_ip_count <= 0) return NULL;
  struct in_addr peerAddr;
  if (peerHost != NULL && peerHost[0] != '\0' && inet_pton(AF_INET, peerHost, &peerAddr) == 1) {
    for (int i = 0; i < s_own_ip_count; i++) {
      if (peerAddr.s_addr == s_own_ip_addr[i]) return s_own_ip_text[i];
    }
    for (int i = 0; i < s_own_ip_count; i++) {
      if ((peerAddr.s_addr & s_own_ip_netmask[i]) == (s_own_ip_addr[i] & s_own_ip_netmask[i])) {
        return s_own_ip_text[i];
      }
    }
  }
  return s_own_ip_text[0];
}

// Is peerHost literally one of this device's own non-loopback IPv4 addresses — i.e. the
// tapped card's video IS this device's own bundled asset (play the local rawfile, no QUIC
// dial)? No local address known (getifaddrs failure or an interface-less sandbox) fails safe
// to 0 (network dial), matching the "保守走 dial, 不静默本地化" contract.
static int cheng_gui_host_peer_matches_own_ip(const char* peerHost) {
  if (peerHost == NULL || peerHost[0] == '\0') return 0;
  const char* ownIp = cheng_gui_host_own_ip_for_peer(peerHost);
  if (ownIp == NULL) return 0;
  return strcmp(peerHost, ownIp) == 0;
}

volatile int s_fetch_route = -1;
// Per-card peer captured at fetch-thread spawn (same single-fetch guard as s_fetch_route).
// The media slot carries peerHost/peerPort透传 from the snapshot's sourcePeer; the prepare
// call stashes it here so cheng_stream_fetch_worker dials the card's own publisher instead
// of a hard-coded IP. Empty host means the card carries NO sourcePeer — this content was
// never given a remote source, so it IS local/bundled content: the worker-selection at the
// prepare call site (fetch_peer_is_local) treats empty the SAME as "peer == own IP" and
// routes to cheng_stream_local_file_worker instead — cheng_stream_fetch_worker (the network
// dialer) is never spawned with an empty host. No IP-literal fallback: the historical
// ".3 default" this replaced silently masked a missing-sourcePeer defect as a
// coincidentally-correct dial (peerhost-pipeline-break-v10 定谳).
static char s_fetch_peer_host[64] = {0};
static volatile int s_fetch_peer_port = 0;
// Content identity of the card the fetch thread is about to dial, captured alongside
// s_fetch_peer_host at the SAME spawn point. Checked against the ES announce's real
// on-wire asset_cid (WebSceneMediaEsContentMatches) once dial lands — a prewarm armed
// ahead of tap is keyed by host:port, not content; if the publisher slot now serves
// DIFFERENT content (peer/content rotation between prewarm and tap), the mismatch must
// be caught and the stale open invalidated rather than silently playing the wrong video
// (mirrors Android's cheng_android_es_content_ok, see cheng_stream_fetch_worker).
static char s_fetch_asset_cid[80] = {0};
// tap→首帧 秒开 instrumentation (single active fetch; CLOCK_MONOTONIC ns). Stamped across
// the cold-open critical path so the perf oracle can attribute the秒开 delay to segments:
//   t0 spawn      = fullscreen video route active → fetch thread spawned (the "tap")
//   dial_start    = cheng_scene_media_es_open begins (QUIC dial)
//   dial_done     = es_open returned (dial + negotiate + announce)
//   index_done    = ES index learned + decoder created (w/h/fps/count → streaming up)
//   first_sink    = first decoded frame observed consumable on the render thread (t1)
//   first_present = first stream texture drawn to the compositor (t2)
// A one-shot cheng_media_diag line ("open_to_first_frame …") is emitted at first_present.
static volatile int64_t s_ff_t0_spawn_ns = 0;
static volatile int64_t s_ff_dial_start_ns = 0;
static volatile int64_t s_ff_dial_done_ns = 0;
static volatile int64_t s_ff_index_done_ns = 0;
static volatile int64_t s_ff_first_sink_ns = 0;
static volatile int64_t s_ff_first_present_ns = 0;
static volatile int s_ff_reported = 0;
// Local-file audio: high-level OH_AVPlayer plays the bundled clip's AAC track (demux +
// decode + render to the audio HAL, looping) in parallel with the surface video path.
OH_AVPlayer* s_audio_player = NULL;
volatile int s_stream_ready = 0;
GLuint s_stream_tex = 0u;
static int64_t s_stream_last_consume_ns = 0;
// Wall-clock play clock for the surface path: advance the displayed frame by real elapsed
// time (idx = elapsed*fps), so playback runs at exactly the source fps regardless of the
// render-loop rate — fixes the 48fps-tick × 33ms-gate aliasing that pinned video to 24fps.
int64_t s_stream_play_base_ns = 0;
int64_t s_stream_last_frame_idx = -1;
// Play/pause gate for the wall-clock play clock (CHT video handler bridge target). When paused the
// play clock stops advancing (the displayed frame freezes); on resume the base is shifted forward by
// the paused duration so playback continues from the same frame without a time jump.
volatile int s_stream_paused = 0;
// Decode-to-surface (zero-copy GPU): the HW decoder renders directly into an OES
// external texture via OH_NativeImage; the render thread converts OES→s_stream_tex
// (RGBA, the Cheng scene's 2D-sampler contract) with a GPU FBO pass. No CPU pixel
// work at all — removes the ~32ms/frame CPU NV12→RGBA that capped playback at ~24fps.
#ifndef GL_TEXTURE_EXTERNAL_OES
#define GL_TEXTURE_EXTERNAL_OES 0x8D65
#endif
volatile int s_surf_mode = 0;         // 1 once SetSurface succeeded (else CPU path)
OHNativeWindow* s_surf_window = NULL;  // created in prepare (render thread, EGL current)
volatile int s_fetch_thread_started = 0;
pthread_t s_fetch_thread;

// ---- local-path + network-path EOS (playthrough wind-down) ------------------
// s_stream_src_eof: the producer hit end-of-stream — set once by the bundled-clip demuxer
// (local path, no re-seek loop) OR, since #14-eos, once by the network fetch thread
// (cheng_stream_fetch_worker) when BOTH the video and audio ES producers it drives have
// exhausted their source (see that function's loopRc==7 handling) — the two paths share
// this one atomic, each worker only ever sets it for its own session.
// s_stream_eos: latched on the render thread once src_eof AND both the input FIFO and the
// output ring have drained — the surface then holds the final frame. Reset at teardown.
volatile int s_stream_src_eof = 0;
volatile int s_stream_eos = 0;
int s_stream_eos_logged = 0;   // one-shot: playback_eos hilog + audio Stop + eos oracle line

// ---- feed (route 0) QUIC prewarm --------------------------------------------
// S3 skeleton: accumulate up to N=2 visible feed video cards' peerHost/peerPort, then
// one-shot spawn a dial+index worker. Worker dials plan[0] only (single global ES session
// constraint); plan[1] is logged for the future per-slot pool. Env gate:
//   CHENG_FEED_MEDIA_PREWARM=0  → skip entirely (desktop/off)
//   unset / any other value    → arm (default on for device warm-path)
// The fetch worker joins this thread BEFORE its own dial — Cheng QUIC is single-threaded.
char s_prewarm_peer_host[64] = {0};  // plan[0] alias
volatile int s_prewarm_peer_port = 0;
char s_prewarm_hosts[CHENG_FEED_PREWARM_N][64] = {{0}};
int s_prewarm_ports[CHENG_FEED_PREWARM_N] = {0};
volatile int s_prewarm_plan_count = 0;
volatile int s_prewarm_started = 0;         // one-shot spawn guard (whole session)
static volatile int s_prewarm_thread_started = 0;  // set once spawned; cleared after the fetch join
static pthread_t s_prewarm_thread;

typedef struct ChengAndroidSvgDisplayListCache {
  int valid;
  int display_list_id;
  int primitive_start;
  int primitive_count;
} ChengAndroidSvgDisplayListCache;

typedef struct ChengAndroidSvgPrimitiveCache {
  int kind;
  int x1;
  int y1;
  int x2;
  int y2;
  int cx;
  int cy;
  int rx;
  int ry;
} ChengAndroidSvgPrimitiveCache;

typedef struct ChengAndroidShellRuntime {
  uint64_t app_id;
  uint64_t window_id;
  ANativeWindow* window;
  int width;
  int height;
  float density;
} ChengAndroidShellRuntime;

static void* s_app_handle = NULL;
static cheng_app_init_fn s_app_init = NULL;
static cheng_app_set_window_fn s_app_set_window = NULL;
static cheng_app_tick_fn s_app_tick = NULL;
static cheng_app_needs_frame_fn s_app_needs_frame = NULL;
static cheng_app_on_touch_milli_fn s_app_on_touch_milli = NULL;
static cheng_app_scroll_by_fn s_app_scroll_by = NULL;
/* Ink overlay channel: optional app export; commands drawn into a dedicated
 * layer cache after media surfaces, never entering the scene frame digest. */
#define CHENG_ANDROID_INK_OVERLAY_ROUTE 0x3FFFFFFF
#define CHENG_ANDROID_INK_OVERLAY_LAYER 0x3FFFFFFF
#define CHENG_ANDROID_INK_OVERLAY_CMD_CAP 512
static cheng_app_ink_overlay_count_fn s_app_ink_overlay_count = NULL;
static cheng_app_ink_overlay_word_fn s_app_ink_overlay_word = NULL;
static int32_t s_ink_overlay_commands[CHENG_ANDROID_INK_OVERLAY_CMD_CAP * CHENG_ANDROID_GPU_COMMAND_STRIDE_I32];
static int s_ink_overlay_command_count = 0;
/* Cached-frame replay: the last presented compositor layer sequence, so an
 * overlay-only frame can redraw from layer caches with zero app encoding. */
#define CHENG_ANDROID_REPLAY_LAYER_CAP 64
static int s_replay_routes[CHENG_ANDROID_REPLAY_LAYER_CAP];
static int s_replay_layers[CHENG_ANDROID_REPLAY_LAYER_CAP];
static int s_replay_offx[CHENG_ANDROID_REPLAY_LAYER_CAP];
static int s_replay_offy[CHENG_ANDROID_REPLAY_LAYER_CAP];
static int s_replay_count = 0;
static int s_replay_recording = 0;
static int s_ink_overlay_bind_attempted_g = 0;
static GLuint s_ink_field_texture = 0u;
static int s_ink_field_w = 0;
static int s_ink_field_h = 0;
static int s_ink_field_tex_w = -1;
static int s_ink_field_tex_h = -1;
static int s_ink_field_active = 0;
static GLuint s_gl_inkfield_program = 0u;
static void cheng_android_gpu_draw_ink_field(int screen_width, int screen_height);
static GLint s_gl_inkfield_screen_loc = -1;
static GLint s_gl_inkfield_texture_loc = -1;
static GLint s_gl_inkfield_fade_loc = -1;
static int s_ink_field_fade_permille = 1000;
static void cheng_android_ink_overlay_lazy_bind(void) {
  if (s_ink_overlay_bind_attempted_g || s_app_ink_overlay_count != NULL) {
    return;
  }
  s_ink_overlay_bind_attempted_g = 1;
  s_app_ink_overlay_count = (cheng_app_ink_overlay_count_fn)dlsym(RTLD_DEFAULT, "cheng_app_ink_overlay_command_count");
  s_app_ink_overlay_word = (cheng_app_ink_overlay_word_fn)dlsym(RTLD_DEFAULT, "cheng_app_ink_overlay_command_word");
  if ((s_app_ink_overlay_count == NULL) != (s_app_ink_overlay_word == NULL)) {
    CHENG_HOST_LOG_ERROR("ink overlay exports half-bound");
    abort();
  }
}
static int s_replay_valid = 0;
static int s_replay_width = 0;
static int s_replay_height = 0;
// Set once a video surface has a decoded frame set; drives the render loop to keep
// presenting (overlay_refresh) every tick so the clip plays smoothly + completely
// even when the scene itself is static (it otherwise presents only on change).
static int s_video_active = 0;
// The s_media_textures[] cache entry that owns the CURRENTLY active decode stream
// (set at spawn in prepare_media_surface_texture's cache-miss branch, cleared+
// invalidated in cheng_stream_teardown_active). Device-verified replayblack bug
// (2026-07-11): cheng_stream_teardown_active() frees s_stream_ctx/s_surf_*/
// s_stream_tex (the decode pipeline) on route-leave, but the texture-cache entry
// itself stays valid=1 with a now-DANGLING texture->gl_texture (the deleted
// s_stream_tex name) — same-card re-entry then hits the cache-hit fast path in
// prepare_media_surface_texture (existing->valid && gl_texture!=0 → return 1),
// which never re-spawns the worker/surface, so the card composites the stale/
// deleted GL name forever (GLES incomplete-texture rule samples it as solid
// black — the reported 黑屏, with the back-button overlay still drawn since
// that is an unrelated unconditional quad). This pointer lets teardown release
// the ONE entry it owns (via the existing cheng_android_media_texture_release,
// same call cheng_android_gpu_destroy already uses for full-app teardown) so
// the next prepare() on this card is a genuine cache miss and re-inits fully —
// no blast radius on other cards' cached posters/textures.
ChengAndroidMediaTextureCache* s_active_stream_texture = NULL;

// ---- Video-active vsync-driven presentation (event-driven, no polling) ------
// Real-device dual-capture root cause (2026-07-10, hilog): while a video plays,
// this host never participates in the OS vsync/frame-pacing protocol (the render
// loop is a raw pthread nanosleep, see cheng_gui_entry.cpp RenderLoop — unchanged
// by this fix, that loop's own scheduling policy is slice-4/device-verification
// scope, not this one). Without an active OH_NativeVSync consumer, the platform's
// frame-pacing heuristics degrade this process toward an idle cadence (observed
// ~858-874ms between ChengGuiDiag tick prints while videoActive=1) even though
// cheng_gui_host_tick's own sleep target is ~11ms, so the ES stream (30fps)
// visibly slow-motions. This directly implements the pacing assumption already
// documented at cheng_stream_on_new_output's s_surf_mode branch above ("Pacing
// is owned by the RENDER LOOP (vsync-paced at panel refresh)... NOT here") —
// that pacing never actually existed until now. The callback does zero GL work
// (its dispatch thread is not guaranteed to be the EGL-current render thread);
// its only job is to keep this process registered as an active vsync consumer
// for exactly as long as video is playing, then let the chain expire (pause/EOS/
// route-leave/app-background) so power falls back to the pre-existing
// event-driven cadence — byte-identical to the no-video-ever-played behavior.
static OH_NativeVSync* s_video_vsync = NULL;
static volatile int s_video_vsync_want = 0;  // cross-thread: cleared from cheng_gui_host_pause too
// Cross-thread: written from the render thread (engage(), the disarm-then-rearm
// idempotency check) AND from the vsync-callback dispatch thread (the two stores
// below) — same cross-thread discipline as s_video_vsync_want, via __atomic_.
static volatile int s_video_vsync_armed = 0;

static void ChengVideoVSyncCallback(long long timestamp, void* data) {
  (void)timestamp; (void)data;
  __atomic_store_n(&s_video_vsync_armed, 0, __ATOMIC_SEQ_CST);
  if (__atomic_load_n(&s_video_vsync_want, __ATOMIC_SEQ_CST) && s_video_vsync != NULL) {
    __atomic_store_n(&s_video_vsync_armed, 1, __ATOMIC_SEQ_CST);
    OH_NativeVSync_RequestFrame(s_video_vsync, ChengVideoVSyncCallback, NULL);
  }
}

// Engage continuous vsync participation. Idempotent; safe to call on every
// video-became-active/resumed transition. Render-thread only (creates+arms the
// OS handle) — mirrors the create-once-reuse pattern the generator's Harmony
// vsync driver uses (mobile_shell_codegen.cheng MobileShellHarmonyGuiHostSource
// OnVSync/cheng_harmony_request_frame), so a future generator migration of this
// host can adopt the same shape unchanged.
static void cheng_video_vsync_engage(void) {
  __atomic_store_n(&s_video_vsync_want, 1, __ATOMIC_SEQ_CST);
  if (s_video_vsync == NULL) {
    const char* name = "cheng_video_vsync";
    s_video_vsync = OH_NativeVSync_Create(name, (unsigned int)strlen(name));
    if (s_video_vsync == NULL) {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                          "video vsync create FAILED - falling back to render-loop-only pacing");
      return;
    }
  }
  if (!__atomic_load_n(&s_video_vsync_armed, __ATOMIC_SEQ_CST)) {
    __atomic_store_n(&s_video_vsync_armed, 1, __ATOMIC_SEQ_CST);
    OH_NativeVSync_RequestFrame(s_video_vsync, ChengVideoVSyncCallback, NULL);
  }
}

// Disengage (pause/EOS/route-leave/app-background): callable from any thread
// (atomic store only, no OH_NativeVSync_Destroy here — the header explicitly
// warns that pointer needs careful handling across threads, and this host's
// cheng_gui_host_pause runs on the XComponent/main thread while engage() runs
// on the render thread, so destroying it from here would race an in-flight
// callback). The already-in-flight callback (bounded to <= 1 vsync period, see
// OnVSync contract) observes want==0 and simply stops re-arming — no further
// wakeups, no polling, power falls back to the existing tick cadence.
void cheng_video_vsync_disengage(void) {
  __atomic_store_n(&s_video_vsync_want, 0, __ATOMIC_SEQ_CST);
}

static cheng_app_scroll_get_fn s_app_scroll_get = NULL;
static cheng_app_pause_fn s_app_pause = NULL;
static cheng_app_on_back_fn s_app_on_back = NULL;
static cheng_app_resume_fn s_app_resume = NULL;
static cheng_app_text_input_utf8_fn s_app_text_input_utf8 = NULL;
static cheng_app_media_control_fn s_app_media_control = NULL;
static cheng_mobile_host_runtime_set_state_fn s_runtime_set_state = NULL;
static cheng_mobile_host_runtime_append_string_array_state_fn s_runtime_append_string_array_state = NULL;
static cheng_mobile_host_runtime_apply_media_selection_fn s_runtime_apply_media_selection = NULL;
static cheng_mobile_host_runtime_apply_product_csv_selection_fn s_runtime_apply_product_csv_selection = NULL;
static cheng_app_debug_i32_fn s_app_debug_last_main_status = NULL;
static cheng_app_debug_i32_fn s_app_debug_build_step = NULL;
static cheng_app_debug_i32_fn s_app_debug_layout_fail_code = NULL;
static cheng_app_debug_i32_fn s_app_debug_layout_fail_route_index = NULL;
static cheng_app_debug_i32_fn s_app_debug_layout_fail_node_id = NULL;
static cheng_app_debug_i32_fn s_app_debug_layout_fail_ordinal = NULL;
static cheng_app_debug_i32_fn s_app_debug_css_fail_code = NULL;
static cheng_app_debug_i32_fn s_app_debug_css_fail_route_index = NULL;
static cheng_app_debug_i32_fn s_app_debug_css_fail_node_id = NULL;
static cheng_app_debug_i32_fn s_app_debug_css_fail_rule_ordinal = NULL;
static cheng_app_debug_i32_fn s_app_debug_css_fail_declaration_ordinal = NULL;
static cheng_app_debug_i32_fn s_app_debug_css_fail_property_code = NULL;
static cheng_app_debug_i32_fn s_app_debug_svg_atlas_fail_code = NULL;
static cheng_app_debug_i32_fn s_app_debug_svg_atlas_fail_paint_index = NULL;
static cheng_app_debug_i32_fn s_app_debug_svg_atlas_fail_route_index = NULL;
static cheng_app_debug_i32_fn s_app_debug_svg_atlas_fail_node_id = NULL;
static cheng_app_debug_i32_fn s_app_debug_svg_atlas_fail_ordinal = NULL;
static cheng_app_debug_i32_fn s_app_debug_svg_atlas_fail_resource_hash = NULL;
static cheng_app_debug_i32_fn s_app_debug_glyph_atlas_fail_code = NULL;
static cheng_app_debug_i32_fn s_app_debug_glyph_atlas_fail_route_index = NULL;
static cheng_app_debug_i32_fn s_app_debug_glyph_atlas_fail_node_id = NULL;
static cheng_app_debug_i32_fn s_app_debug_glyph_atlas_fail_ordinal = NULL;
static cheng_app_debug_i32_fn s_app_debug_glyph_atlas_fail_codepoint = NULL;
static cheng_app_debug_i32_fn s_app_debug_gpu_command_count = NULL;
static cheng_app_debug_i32_fn s_app_debug_media_surface_command_count = NULL;
static cheng_app_debug_i32_fn s_app_debug_media_surface_batch_bytes = NULL;
static cheng_app_debug_i32_fn s_app_debug_media_surface_batch_stride = NULL;
static cheng_app_debug_i32_fn s_app_debug_media_receipt_count = NULL;
static cheng_app_debug_i32_at_fn s_app_debug_media_receipt_action_code_at = NULL;
static cheng_app_debug_i32_at_fn s_app_debug_media_receipt_status_at = NULL;
static cheng_app_debug_i32_at_fn s_app_debug_media_receipt_state_at = NULL;
static cheng_app_debug_i32_at_fn s_app_debug_media_receipt_kind_at = NULL;
static cheng_app_debug_i32_at_fn s_app_debug_media_receipt_audio_provider_hash_at = NULL;
static cheng_app_debug_i32_fn s_app_debug_compositor_layer_count = NULL;
static cheng_app_debug_i32_fn s_app_debug_refresh_css_fail_stage = NULL;
static cheng_app_debug_i32_fn s_app_debug_route_index = NULL;
// App-core semantic export (M1 slice-5): answers "is this route index a fullscreen video
// detail" from the real generated route table (scene-runtime-smoke-source.mjs), replacing
// the host-side CHENG_ROUTE_CONTENT_DETAIL_FIRST/LAST literal range + bare `cur_route == 1`.
static cheng_app_debug_i32_at_fn s_app_debug_route_is_fullscreen_video = NULL;
static cheng_app_debug_i32_fn s_app_debug_touch_hit_index = NULL;
static cheng_app_debug_i32_fn s_app_debug_last_event_hit_node_id = NULL;
static cheng_app_debug_i32_fn s_app_debug_last_event_hit_status = NULL;
static cheng_app_debug_i32_fn s_app_debug_last_event_apply_status = NULL;
static cheng_app_debug_i32_fn s_app_debug_state_publish_notice_open = NULL;
static cheng_app_debug_i32_fn s_app_debug_state_is_original = NULL;
static cheng_app_debug_i32_fn s_app_debug_state_is_paid = NULL;
static cheng_app_debug_i32_fn s_app_debug_state_show_review_console = NULL;
static cheng_app_debug_i32_fn s_app_debug_focused_text_route_index = NULL;
static cheng_app_debug_i32_fn s_app_debug_focused_text_node_id = NULL;

// wave9 phase B: statics for the 59 optional App exports (dossier:
// wf_568671a5-ebd; A text-input/B computer_use/C m2/D distributed-nodes/
// E probe/F video-state/G runtime-storage). All optional (dlsym, not
// cheng_resolve_required_app_export) per the wave9 dossier riskCalls#2 —
// widening the required tier would break compatibility with any scene .o
// built before this addition.
static cheng_app_text_input_cursor_utf8_fn s_app_text_input_cursor_utf8 = NULL;
static cheng_app_clear_text_input_focus_fn s_app_clear_text_input_focus = NULL;
static cheng_app_computer_use_compile_text_utf8_fn s_app_computer_use_compile_text_utf8 = NULL;
static cheng_app_computer_use_gui_replay_start_fn s_app_computer_use_gui_replay_start = NULL;
static cheng_app_computer_use_gui_replay_tick_fn s_app_computer_use_gui_replay_tick = NULL;
static cheng_app_debug_cstring_fn s_app_debug_computer_use_last_title_utf8 = NULL;
static cheng_app_computer_use_media_selection_result_utf8_fn s_app_computer_use_media_selection_result_utf8 = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_last_template_code = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_last_status = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_last_title_byte_len = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_last_distance_km = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_last_media_status = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_last_media_uri_byte_len = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_last_media_name_byte_len = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_last_media_local_path_byte_len = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_chat_trigger_count = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_last_chat_result = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_execution_mode = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_current_slow_permille = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_gui_replay_active = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_gui_replay_step_index = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_gui_replay_step_count = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_gui_replay_applied_count = NULL;
static cheng_app_debug_i32_fn s_app_debug_computer_use_gui_replay_last_status = NULL;
static cheng_app_debug_i32_fn s_app_debug_m2_contents_len = NULL;
static cheng_app_debug_i32_fn s_app_debug_m2_shown_len = NULL;
static cheng_app_debug_i32_fn s_app_debug_m2_title_len = NULL;
static cheng_app_debug_i32_fn s_app_debug_m2_media_len = NULL;
static cheng_app_debug_i32_fn s_app_debug_m2_media_kind = NULL;
static cheng_app_debug_i32_fn s_app_debug_m2_media_is_local = NULL;
static cheng_app_debug_i32_fn s_app_debug_m2_rebind_changed = NULL;
static cheng_app_debug_i32_fn s_app_debug_m2_rebind_applied = NULL;
static cheng_app_debug_i32_fn s_app_debug_m2_active_category_content = NULL;
static cheng_app_debug_i32_fn s_app_debug_m2_first_category_content = NULL;
static cheng_app_distributed_contents_update_utf8_fn s_app_distributed_contents_update_utf8 = NULL;
static cheng_app_nodes_update_utf8_fn s_app_nodes_update_utf8 = NULL;
static cheng_app_debug_i32_fn s_app_debug_nodes_count = NULL;
static cheng_app_debug_i32_fn s_app_debug_shown_count = NULL;
static cheng_app_debug_probe2_fn s_app_debug_route_hit_probe = NULL;
static cheng_app_debug_probe3_fn s_app_debug_box_probe = NULL;
static cheng_app_debug_probe2_fn s_app_debug_node_box = NULL;
static cheng_app_debug_i32_fn s_app_debug_top_kind = NULL;
static cheng_app_debug_i32_fn s_app_debug_top_node = NULL;
static cheng_app_debug_i32_fn s_app_debug_top_apply_status = NULL;
static cheng_app_debug_i32_fn s_app_debug_route_apply_node = NULL;
static cheng_app_debug_i32_fn s_app_debug_route_apply_from = NULL;
static cheng_app_debug_i32_fn s_app_debug_route_apply_target = NULL;
static cheng_app_debug_i32_fn s_app_debug_route_apply_to = NULL;
static cheng_app_debug_i32_fn s_app_debug_route_apply_status = NULL;
static cheng_app_debug_i32_fn s_app_debug_state_is_video_playing = NULL;
static cheng_app_debug_i32_fn s_app_debug_video_overlay_hidden = NULL;
static cheng_mobile_host_runtime_current_route_state_fn s_runtime_current_route_state = NULL;
static cheng_mobile_host_runtime_export_scene_state_snapshot_fn s_runtime_export_scene_state_snapshot = NULL;
static cheng_mobile_host_runtime_restore_scene_state_snapshot_fn s_runtime_restore_scene_state_snapshot = NULL;
static cheng_mobile_host_runtime_set_storage_fn s_runtime_set_storage = NULL;
static cheng_mobile_host_runtime_storage_dirty_count_fn s_runtime_storage_dirty_count = NULL;
static cheng_mobile_host_runtime_storage_dirty_at_fn s_runtime_storage_dirty_key_utf8 = NULL;
static cheng_mobile_host_runtime_storage_dirty_at_fn s_runtime_storage_dirty_value_utf8 = NULL;
static cheng_mobile_host_runtime_storage_clear_dirty_fn s_runtime_storage_clear_dirty = NULL;

static ChengAndroidWindowSlot s_window_slots[CHENG_ANDROID_WINDOW_SLOT_CAP];
static uint64_t s_next_window_id = 1u;
static ANativeWindow* s_active_window = NULL;
static int s_active_width = 0;
static int s_active_height = 0;
static float s_active_density = 1.0f;
static int s_present_width = 0;
static int s_present_height = 0;
static int s_present_gpu_command_count = 0;
static int s_present_gpu_fill_rect_count = 0;
static int s_present_gpu_text_command_count = 0;
static int s_present_gpu_image_command_count = 0;
static int s_present_gpu_icon_command_count = 0;
static int s_present_media_surface_command_count = 0;
static int s_present_media_surface_video_count = 0;
static int s_present_media_surface_image_count = 0;
static int s_present_media_surface_audio_count = 0;
static int s_present_media_surface_playing_count = 0;
static int s_present_media_surface_status = CHENG_ANDROID_MEDIA_SURFACE_STATUS_NONE;
static int s_present_media_surface_missing_provider_count = 0;
static int s_media_surface_prepare_count = 0;
static int s_media_surface_prepare_status = CHENG_ANDROID_MEDIA_SURFACE_STATUS_NONE;
static int s_media_surface_prepare_kind = 0;
static int s_media_surface_prepare_surface_kind = 0;
static int s_media_surface_prepare_texture_provider = 0;
static int s_media_surface_prepare_slot_hash = 0;
static int s_media_surface_prepare_asset_hash = 0;
static int s_media_surface_prepare_manifest_hash = 0;
static int s_media_surface_prepare_poster_hash = 0;
static int s_media_surface_prepare_gl_texture = 0;
static int s_media_surface_prepare_width = 0;
static int s_media_surface_prepare_height = 0;
static int s_media_surface_prepare_pixel_format = 0;
static int s_media_surface_prepare_texture_target = 0;
static int s_media_playback_frame_count = 0;
static int s_media_playback_update_count = 0;
static int s_media_playback_last_state = CHENG_ANDROID_MEDIA_PLAYBACK_CLOSED;
static int64_t s_media_playback_last_presentation_us = -1;
static int s_media_playback_pump_count = 0;
static int s_media_playback_pause_guard_count = 0;
static int s_media_playback_seek_count = 0;
static int s_audio_playback_receipt_count = 0;
static int s_audio_playback_status = 0;
static int s_audio_playback_state = 0;
static int s_audio_playback_sample_rate_hz = 0;
static int s_audio_playback_channel_count = 0;
static int s_audio_playback_bits_per_sample = 0;
static int s_audio_playback_pcm_data_offset = 0;
static int s_audio_playback_pcm_bytes = 0;
static int s_audio_playback_provider_hash = 0;
static int s_audio_playback_slot_hash = 0;
static int s_audio_playback_asset_hash = 0;
static int s_audio_playback_data_hash = 0;
static int s_present_compositor_layer_count = 0;
static int s_present_compositor_reuse_layer_count = 0;
static int s_present_compositor_replace_layer_count = 0;
static int s_present_compositor_move_layer_count = 0;
static int s_present_compositor_drop_layer_count = 0;
static int s_uploaded_glyph_sdf_atlas_entry_count = 0;
static int s_uploaded_glyph_sdf_atlas_pixel_count = 0;
static int s_uploaded_image_atlas_entry_count = 0;
static int s_uploaded_image_atlas_pixel_count = 0;
static int s_uploaded_svg_display_list_entry_count = 0;
static int s_uploaded_svg_primitive_count = 0;
static int s_touch_width = 0;
static int s_touch_height = 0;
// Fullscreen-video back button overlay: host-drawn ON TOP of the video texture (the
// video composites after every scene layer, so the scene's own back button is painted
// under the video and can't be seen/tapped). draw_registered publishes the button's
// logical hit rect here when a fullscreen video is on screen; cheng_gui_host_touch
// hit-tests it on DOWN and routes to cheng_gui_host_on_back. w==0 == no overlay.
int s_video_back_btn_x = 0;
int s_video_back_btn_y = 0;
int s_video_back_btn_w = 0;
int s_video_back_btn_h = 0;
static uint8_t s_input_ring[CHENG_ANDROID_INPUT_RING_CAPACITY];
static uint32_t s_input_write_idx = 0u;
static uint32_t s_input_read_idx = 0u;
static int s_touch_active = 0;
static int s_touch_scrolling = 0;
static int s_touch_down_app_x_milli = 0;
static int s_touch_down_app_y_milli = 0;
static int s_touch_last_app_y_milli = 0;
static int s_touch_route_index = -1;
static int s_fling_active = 0;
static float s_fling_velocity_px_per_ms = 0.0f;
static int s_fling_route_index = -1;
static int s_frame_scroll_px = 0;
static int s_fling_last_applied = -1000000;
static int s_fling_log_count = 0;
static ChengAndroidLayerCache s_layer_caches[CHENG_ANDROID_LAYER_CACHE_CAP];
static ChengAndroidImageTextureCache s_image_textures[CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP];
static ChengAndroidMediaTextureCache s_media_textures[CHENG_ANDROID_MEDIA_TEXTURE_CACHE_CAP];
static int32_t s_media_surface_command_words[CHENG_ANDROID_MEDIA_SURFACE_COMMAND_CAP * CHENG_ANDROID_MEDIA_SURFACE_HOST_STRIDE_I32];
static int s_media_surface_command_word_count = 0;
static ChengAndroidGlyphSdfAtlasCache s_glyph_sdf_atlases[CHENG_ANDROID_GLYPH_SDF_ATLAS_CACHE_CAP];
static ChengAndroidGlyphSdfGlyphCache* s_glyph_sdf_glyphs = NULL;
static int s_glyph_sdf_glyph_count = 0;
static ChengAndroidGlyphSdfRunCache* s_glyph_sdf_runs = NULL;
static int s_glyph_sdf_run_count = 0;
static ChengAndroidGlyphSdfRunGlyphCache* s_glyph_sdf_run_glyphs = NULL;
static int s_glyph_sdf_run_glyph_count = 0;
static ChengAndroidSvgDisplayListCache* s_svg_display_lists = NULL;
static int s_svg_display_list_count = 0;
static ChengAndroidSvgPrimitiveCache* s_svg_primitives = NULL;
static int s_svg_primitive_count = 0;
static GLuint s_pending_image_texture_deletes[CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP];
static int s_pending_image_texture_delete_count = 0;
static EGLDisplay s_egl_display = EGL_NO_DISPLAY;
static EGLContext s_egl_context = EGL_NO_CONTEXT;
static EGLSurface s_egl_surface = EGL_NO_SURFACE;
static EGLConfig s_egl_config = NULL;
static ANativeWindow* s_egl_window = NULL;
// Headless offscreen GPU capture (EGL pbuffer + glReadPixels) for pixel-1:1 measurement.
// Uses the exact same GLES present pipeline the device renders with, at an exact logical
// viewport (no window surface, no system bars).
static int s_headless_capture = 0;
static int s_headless_capture_width = 0;
static int s_headless_capture_height = 0;
static EGLSurface s_egl_pbuffer_surface = EGL_NO_SURFACE;
static GLuint s_gl_rect_program = 0u;
static GLuint s_gl_shadow_program = 0u;
static GLuint s_gl_gradient_program = 0u;
static GLuint s_gl_text_program = 0u;
static GLuint s_gl_blit_program = 0u;
static GLuint s_gl_external_blit_program = 0u;
static GLuint s_gl_vbo = 0u;
static GLuint s_gl_fbo = 0u;
static GLint s_gl_rect_screen_loc = -1;
static GLint s_gl_rect_color_loc = -1;
static GLint s_gl_rect_rect_loc = -1;
static GLint s_gl_rect_radius_loc = -1;
static GLint s_gl_rect_stroke_width_loc = -1;
static GLint s_gl_shadow_screen_loc = -1;
static GLint s_gl_shadow_color_loc = -1;
static GLint s_gl_shadow_origin_rect_loc = -1;
static GLint s_gl_shadow_rect_loc = -1;
static GLint s_gl_shadow_origin_radius_loc = -1;
static GLint s_gl_shadow_radius_loc = -1;
static GLint s_gl_shadow_blur_loc = -1;
static GLint s_gl_shadow_inset_loc = -1;
static GLint s_gl_gradient_screen_loc = -1;
static GLint s_gl_gradient_start_color_loc = -1;
static GLint s_gl_gradient_end_color_loc = -1;
static GLint s_gl_gradient_rect_loc = -1;
static GLint s_gl_gradient_radius_loc = -1;
static GLint s_gl_gradient_start_loc = -1;
static GLint s_gl_gradient_end_loc = -1;
static GLint s_gl_gradient_kind_loc = -1;
static GLint s_gl_gradient_center_loc = -1;
static GLint s_gl_gradient_outer_radius_loc = -1;
static GLint s_gl_text_screen_loc = -1;
static GLint s_gl_text_color_loc = -1;
static GLint s_gl_text_px_range_loc = -1;
static GLint s_gl_text_atlas_loc = -1;
static GLint s_gl_blit_screen_loc = -1;
static GLint s_gl_blit_texture_loc = -1;
static GLint s_gl_external_blit_screen_loc = -1;
static GLint s_gl_external_blit_texture_loc = -1;
static GLint s_gl_external_blit_tex_transform_loc = -1;
static int s_present_compositor_gl_frame_count = 0;
static int s_present_gpu_gl_frame_count = 0;
static int s_tick_debug_log_count = 0;
static int s_gpu_present_debug_log_count = 0;
static int s_compositor_present_debug_log_count = 0;

static const char* kChengRuntimeManifest = "mobile_shell_runtime_contract_v1.json";
static const char* kChengRuntimeContractPayloadRel = "runtime/mobile_shell_runtime_contract_payload.json";
static const char* kChengRuntimeBundlePayloadRel = "runtime/mobile_shell_runtime_bundle_payload.json";
static const char* kChengLaunchArgsKvRel = "runtime/mobile_shell_launch_args.kv";
static const char* kChengLaunchArgsJsonRel = "runtime/mobile_shell_launch_args.json";
static const char* kChengSceneDataAssetRel = "runtime/unimaker_scene_data.bin";
static const char* kChengGlyphSdfPixelAssetRel = "runtime/unimaker_glyph_sdf_pixels.bin";

static void cheng_android_set_media_surface_prepare(int status,
                                                    int kindCode,
                                                    int surfaceKind,
                                                    int textureProvider,
                                                    int slotHash,
                                                    int assetHash,
                                                    int manifestHash,
                                                    int posterHash,
                                                    unsigned int glTexture,
                                                    int width,
                                                    int height,
                                                    int pixelFormat,
                                                    int textureTarget) {
  s_media_surface_prepare_status = status;
  s_media_surface_prepare_kind = kindCode;
  s_media_surface_prepare_surface_kind = surfaceKind;
  s_media_surface_prepare_texture_provider = textureProvider;
  s_media_surface_prepare_slot_hash = slotHash;
  s_media_surface_prepare_asset_hash = assetHash;
  s_media_surface_prepare_manifest_hash = manifestHash;
  s_media_surface_prepare_poster_hash = posterHash;
  s_media_surface_prepare_gl_texture = (int)glTexture;
  s_media_surface_prepare_width = width;
  s_media_surface_prepare_height = height;
  s_media_surface_prepare_pixel_format = pixelFormat;
  s_media_surface_prepare_texture_target = textureTarget;
}

static void cheng_android_record_media_surface_prepare(int status,
                                                       int kindCode,
                                                       int surfaceKind,
                                                       int textureProvider,
                                                       int slotHash,
                                                       int assetHash,
                                                       int manifestHash,
                                                       int posterHash,
                                                       unsigned int glTexture,
                                                       int width,
                                                       int height,
                                                       int pixelFormat,
                                                       int textureTarget) {
  s_media_surface_prepare_count++;
  cheng_android_set_media_surface_prepare(status, kindCode, surfaceKind, textureProvider,
                                          slotHash, assetHash, manifestHash, posterHash,
                                          glTexture, width, height, pixelFormat, textureTarget);
}

static int cheng_android_image_texture_receipt_ready(void) {
  if (s_media_surface_prepare_status != CHENG_ANDROID_MEDIA_SURFACE_STATUS_READY) {
    return 0;
  }
  if (s_media_surface_prepare_kind != CHENG_ANDROID_MEDIA_SURFACE_IMAGE_RASTER_TEXTURE ||
      s_media_surface_prepare_surface_kind != CHENG_ANDROID_MEDIA_SURFACE_IMAGE_RASTER_TEXTURE) {
    return 0;
  }
  if (s_media_surface_prepare_gl_texture <= 0 ||
      s_media_surface_prepare_width <= 0 ||
      s_media_surface_prepare_height <= 0 ||
      s_media_surface_prepare_pixel_format <= 0 ||
      s_media_surface_prepare_texture_target != GL_TEXTURE_2D) {
    return 0;
  }
  if (s_media_surface_prepare_texture_provider <= 0 ||
      s_media_surface_prepare_slot_hash <= 0 ||
      s_media_surface_prepare_asset_hash <= 0 ||
      s_media_surface_prepare_manifest_hash <= 0 ||
      s_media_surface_prepare_poster_hash <= 0) {
    return 0;
  }
  return 1;
}

static int cheng_android_video_texture_receipt_ready(void) {
  if (s_media_surface_prepare_status != CHENG_ANDROID_MEDIA_SURFACE_STATUS_READY) {
    return 0;
  }
  if (s_media_surface_prepare_kind != CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE ||
      s_media_surface_prepare_surface_kind != CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE) {
    return 0;
  }
  if (s_media_surface_prepare_gl_texture <= 0 ||
      s_media_surface_prepare_width <= 0 ||
      s_media_surface_prepare_height <= 0 ||
      s_media_surface_prepare_pixel_format != CHENG_ANDROID_MEDIA_TEXTURE_TARGET_EXTERNAL_OES ||
      s_media_surface_prepare_texture_target != GL_TEXTURE_EXTERNAL_OES) {
    return 0;
  }
  if (s_media_surface_prepare_texture_provider <= 0 ||
      s_media_surface_prepare_slot_hash <= 0 ||
      s_media_surface_prepare_asset_hash <= 0 ||
      s_media_surface_prepare_manifest_hash <= 0 ||
      s_media_surface_prepare_poster_hash <= 0) {
    return 0;
  }
  if (s_media_playback_frame_count <= 0 ||
      s_media_playback_update_count <= 0 ||
      s_media_playback_last_presentation_us < 0) {
    return 0;
  }
  return 1;
}

static void cheng_android_record_audio_playback_receipt(int receiptCount,
                                                        int status,
                                                        int state,
                                                        int sampleRateHz,
                                                        int channelCount,
                                                        int bitsPerSample,
                                                        int pcmDataOffset,
                                                        int pcmBytes,
                                                        int providerHash,
                                                        int slotHash,
                                                        int assetHash,
                                                        int dataHash) {
  s_audio_playback_receipt_count = receiptCount;
  s_audio_playback_status = status;
  s_audio_playback_state = state;
  s_audio_playback_sample_rate_hz = sampleRateHz;
  s_audio_playback_channel_count = channelCount;
  s_audio_playback_bits_per_sample = bitsPerSample;
  s_audio_playback_pcm_data_offset = pcmDataOffset;
  s_audio_playback_pcm_bytes = pcmBytes;
  s_audio_playback_provider_hash = providerHash;
  s_audio_playback_slot_hash = slotHash;
  s_audio_playback_asset_hash = assetHash;
  s_audio_playback_data_hash = dataHash;
}

static void cheng_log(const char* msg) { CHENG_HOST_LOG_INFO("%s", msg ? msg : ""); }

static void* cheng_resolve_required_app_export(const char* name) {
  dlerror();
  void* symbol = dlsym(s_app_handle, name);
  const char* error = dlerror();
  if (symbol == NULL) {
    if (error != NULL) {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "missing required app export %s: %s", name, error);
    } else {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "missing required app export %s", name);
    }
  }
  return symbol;
}

static void cheng_android_gpu_destroy(void);

// ---- CHENG_LEAK_AUDIT storage + implementation (declared extern in
// cheng_gui_host_shared.h; see that header for the point enum + macro gate).
// Entirely absent from the binary unless -DCHENG_LEAK_AUDIT=1.
#ifdef CHENG_LEAK_AUDIT
volatile int64_t g_cheng_leak_audit_calls[CHENG_LEAK_PT_COUNT];
volatile int64_t g_cheng_leak_audit_bytes[CHENG_LEAK_PT_COUNT];
static const char* const s_cheng_leak_audit_names[CHENG_LEAK_PT_COUNT] = {
  "stream_ctx_calloc",
  "cpu_ring_pool_malloc",
  "es_prefetch_malloc",
  "es_sink_malloc",
  "local_push_frame_malloc",
  "on_need_input_free",
  "decode_first_frame_malloc",
  "decode_first_frame_free",
  "cheng_malloc",
  "cheng_free",
};
static int64_t s_leak_audit_last_flush_ns = 0;
static int64_t s_leak_audit_prev_calls[CHENG_LEAK_PT_COUNT];
static int64_t s_leak_audit_prev_bytes[CHENG_LEAK_PT_COUNT];

void cheng_leak_audit_record(ChengLeakAuditPoint point, int64_t bytes) {
  if (point < 0 || point >= CHENG_LEAK_PT_COUNT) return;
  __atomic_fetch_add(&g_cheng_leak_audit_calls[point], 1, __ATOMIC_RELAXED);
  __atomic_fetch_add(&g_cheng_leak_audit_bytes[point], bytes, __ATOMIC_RELAXED);
}

void cheng_leak_audit_tick(void) {
  int64_t now_ns = cheng_monotime_ns();
  if (s_leak_audit_last_flush_ns == 0) {
    s_leak_audit_last_flush_ns = now_ns;
    return;
  }
  if (now_ns - s_leak_audit_last_flush_ns < 5000000000LL) return;  // 5s wall-clock gate
  double elapsed_s = (double)(now_ns - s_leak_audit_last_flush_ns) / 1.0e9;
  s_leak_audit_last_flush_ns = now_ns;
  for (int i = 0; i < CHENG_LEAK_PT_COUNT; i++) {
    int64_t calls_total = __atomic_load_n(&g_cheng_leak_audit_calls[i], __ATOMIC_RELAXED);
    int64_t bytes_total = __atomic_load_n(&g_cheng_leak_audit_bytes[i], __ATOMIC_RELAXED);
    int64_t calls_dt = calls_total - s_leak_audit_prev_calls[i];
    int64_t bytes_dt = bytes_total - s_leak_audit_prev_bytes[i];
    s_leak_audit_prev_calls[i] = calls_total;
    s_leak_audit_prev_bytes[i] = bytes_total;
    if (calls_total == 0) continue;  // never touched: skip the line, keep output legible
    char b[192];
    snprintf(b, sizeof(b),
             "unimaker.leak_audit.v1 point=%s calls_5s=%lld bytes_5s=%lld bytes_per_s=%.0f calls_total=%lld bytes_total=%lld",
             s_cheng_leak_audit_names[i], (long long)calls_dt, (long long)bytes_dt,
             elapsed_s > 0.0 ? (double)bytes_dt / elapsed_s : 0.0,
             (long long)calls_total, (long long)bytes_total);
    cheng_media_diag(b);
  }
  // Net-outstanding pairs: the leak-vs-churn discriminator. A pair whose net
  // keeps climbing tick after tick (not just its raw alloc volume) is the real
  // leak signal; churn nets to ~0 every interval.
  int64_t local_net = g_cheng_leak_audit_bytes[CHENG_LEAK_PT_LOCAL_PUSH_FRAME_MALLOC] -
                       g_cheng_leak_audit_bytes[CHENG_LEAK_PT_ON_NEED_INPUT_FREE];
  int64_t cheng_alloc_net = g_cheng_leak_audit_bytes[CHENG_LEAK_PT_CHENG_MALLOC] -
                             g_cheng_leak_audit_bytes[CHENG_LEAK_PT_CHENG_FREE];
  char nb[192];
  snprintf(nb, sizeof(nb),
           "unimaker.leak_audit_net.v1 local_push_vs_need_input_bytes=%lld cheng_malloc_vs_free_bytes=%lld",
           (long long)local_net, (long long)cheng_alloc_net);
  cheng_media_diag(nb);
}
#endif // CHENG_LEAK_AUDIT

#ifdef CHENG_LEAK_AUDIT
/* The weak cheng_malloc/cheng_free below never run in the real HAP: the strong Cheng
   runtime definitions in prebuilt/ps.o win at link time, so the audit counters read 0
   flow forever (observed 2026-07-11: 10.3MB/s ES-streaming leak with
   cheng_malloc_vs_free_bytes=0). ld --wrap=cheng_malloc/--wrap=cheng_free (added by
   CMake only when CHENG_LEAK_AUDIT is ON) reroutes every cross-object call through
   these wrappers so the boundary is finally metered. Intra-ps.o self calls stay direct
   (module-internal bl), which is fine: the scene runtime / QUIC / ES-fetch allocations
   all come from other objects. */
void* __real_cheng_malloc(int32_t size);
void __real_cheng_free(void* p);
void* __wrap_cheng_malloc(int32_t size) {
  void* p = __real_cheng_malloc(size);
  CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_CHENG_MALLOC, size > 0 ? size : 1);
  return p;
}
void __wrap_cheng_free(void* p) {
  if (p != NULL) {
    CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_CHENG_FREE, (int64_t)malloc_usable_size(p));
  }
  __real_cheng_free(p);
}
#endif // CHENG_LEAK_AUDIT

__attribute__((weak)) void* cheng_malloc(int32_t size) {
  if (size <= 0) {
    size = 1;
  }
  void* p = calloc(1u, (size_t)size);
  CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_CHENG_MALLOC, size);
  return p;
}

__attribute__((weak)) void cheng_free(void* p) {
  if (p != NULL) {
#ifdef CHENG_LEAK_AUDIT
    CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_CHENG_FREE, (int64_t)malloc_usable_size(p));
#endif
    free(p);
  }
}

__attribute__((weak)) char* driver_c_new_string(int32_t size) {
  if (size < 0 || size >= INT32_MAX) {
    abort();
  }
  char* out = (char*)cheng_malloc(size + 1);
  if (out == NULL) {
    return NULL;
  }
  out[size] = '\0';
  return out;
}

__attribute__((weak)) int32_t cheng_cstrlen(const char* s) {
  if (s == NULL) {
    return 0;
  }
  size_t n = strlen(s);
  if (n > (size_t)INT32_MAX) {
    abort();
  }
  return (int32_t)n;
}

__attribute__((weak)) char* driver_c_new_string_copy_n(void* raw, int32_t n) {
  if (n < 0 || n >= INT32_MAX) {
    abort();
  }
  char* out = (char*)cheng_malloc(n + 1);
  if (out == NULL) {
    return NULL;
  }
  if (raw != NULL && n > 0) {
    memcpy(out, raw, (size_t)n);
  }
  out[n] = '\0';
  return out;
}

__attribute__((weak)) int32_t cheng_errno(void) {
  return errno;
}

__attribute__((weak)) char* cheng_strerror(int32_t err) {
  return strerror(err);
}

double cheng_epoch_time(void) {
  return (double)time(NULL);
}

__attribute__((weak)) int64_t cheng_epoch_time_seconds(void) {
  return (int64_t)time(NULL);
}

int64_t cheng_epoch_time_ms(void) {
  struct timespec ts;
  if (clock_gettime(CLOCK_REALTIME, &ts) != 0) {
    return 0;
  }
  return ((int64_t)ts.tv_sec * 1000LL) + ((int64_t)ts.tv_nsec / 1000000LL);
}

__attribute__((weak)) int64_t cheng_monotime_ns(void) {
  struct timespec ts;
  if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
    return 0;
  }
  return ((int64_t)ts.tv_sec * 1000000000LL) + (int64_t)ts.tv_nsec;
}

__attribute__((weak)) void* cheng_os_fopen_mode_bridge(const char* path, const char* mode) {
  if (path == NULL || path[0] == '\0' || mode == NULL || mode[0] == '\0') {
    errno = EINVAL;
    return NULL;
  }
  return (void*)fopen(path, mode);
}

__attribute__((weak)) int32_t cheng_fclose(void* stream) {
  if (stream == NULL) {
    errno = EINVAL;
    return EOF;
  }
  return (int32_t)fclose((FILE*)stream);
}

__attribute__((weak)) int32_t cheng_fflush(void* stream) {
  return (int32_t)fflush((FILE*)stream);
}

__attribute__((weak)) int32_t cheng_fwrite(void* buf, int64_t size, int64_t n, void* stream) {
  if (buf == NULL || stream == NULL || size <= 0 || n <= 0) {
    return 0;
  }
  if ((uint64_t)size > (uint64_t)SIZE_MAX || (uint64_t)n > (uint64_t)SIZE_MAX) {
    errno = EINVAL;
    return 0;
  }
  size_t wrote = fwrite(buf, (size_t)size, (size_t)n, (FILE*)stream);
  if (wrote > 0u) {
    (void)fflush((FILE*)stream);
  }
  if (wrote > (size_t)INT32_MAX) {
    return INT32_MAX;
  }
  return (int32_t)wrote;
}

int32_t cheng_fwrite_i32(void* buf, int32_t size, int32_t n, void* stream) {
  return cheng_fwrite(buf, (int64_t)size, (int64_t)n, stream);
}

__attribute__((weak)) void* get_stderr(void) {
  return (void*)stderr;
}

__attribute__((weak)) void c_iometer_call(void* hook, int32_t op, int64_t bytes) {
  (void)hook;
  (void)op;
  (void)bytes;
}

__attribute__((weak)) int32_t libc_socket(int32_t domain, int32_t type, int32_t protocol) {
  return socket(domain, type, protocol);
}

__attribute__((weak)) int32_t libc_close(int32_t fd) {
  return close(fd);
}

__attribute__((weak)) int32_t libc_fcntl(int32_t fd, int32_t cmd, int32_t arg) {
  return fcntl(fd, cmd, arg);
}

__attribute__((weak)) int32_t libc_bind(int32_t fd, void* addr, int32_t addr_len) {
  if (addr == NULL || addr_len <= 0) {
    errno = EINVAL;
    return -1;
  }
  return bind(fd, (const struct sockaddr*)addr, (socklen_t)addr_len);
}

__attribute__((weak)) int32_t libc_setsockopt(int32_t fd, int32_t level, int32_t opt_name, void* opt_value, int32_t opt_len) {
  if (opt_len < 0) {
    errno = EINVAL;
    return -1;
  }
  return setsockopt(fd, level, opt_name, opt_value, (socklen_t)opt_len);
}

__attribute__((weak)) int32_t libc_sendto(int32_t fd,
                    void* payload,
                    int32_t payload_len,
                    int32_t flags,
                    void* addr,
                    int32_t addr_len) {
  if (payload == NULL || payload_len < 0 || addr == NULL || addr_len <= 0) {
    errno = EINVAL;
    return -1;
  }
  ssize_t rc;
  do {
    rc = sendto(fd, payload, (size_t)payload_len, flags, (const struct sockaddr*)addr, (socklen_t)addr_len);
  } while (rc < 0 && errno == EINTR);
  if (rc > INT32_MAX) {
    abort();
  }
  return (int32_t)rc;
}

__attribute__((weak)) int32_t libc_inet_pton(int32_t family, const char* src, void* dst) {
  if (src == NULL || dst == NULL) {
    errno = EINVAL;
    return -1;
  }
  return inet_pton(family, src, dst);
}

__attribute__((weak)) void* libc_inet_ntop(int32_t family, void* src, void* dst, int32_t size) {
  if (src == NULL || dst == NULL || size <= 0) {
    errno = EINVAL;
    return NULL;
  }
  return (void*)inet_ntop(family, src, (char*)dst, (socklen_t)size);
}

__attribute__((weak)) int32_t cheng_system_entropy_fill(void* dst, int32_t len) {
  if (dst == NULL || len <= 0) {
    return 0;
  }
  int fd = open("/dev/urandom", O_RDONLY | O_CLOEXEC);
  if (fd < 0) {
    return 0;
  }
  uint8_t* out = (uint8_t*)dst;
  int32_t offset = 0;
  while (offset < len) {
    ssize_t got = read(fd, out + offset, (size_t)(len - offset));
    if (got < 0) {
      if (errno == EINTR) {
        continue;
      }
      (void)close(fd);
      return 0;
    }
    if (got == 0) {
      errno = EIO;
      (void)close(fd);
      return 0;
    }
    offset += (int32_t)got;
  }
  (void)close(fd);
  return 1;
}

__attribute__((weak)) int32_t cheng_fd_wait_readable_bridge(int32_t fd, int32_t timeout_ms) {
  if (fd < 0) {
    return -EINVAL;
  }
  struct pollfd pfd;
  memset(&pfd, 0, sizeof(pfd));
  pfd.fd = fd;
  pfd.events = POLLIN;
  int rc;
  do {
    rc = poll(&pfd, 1u, timeout_ms);
  } while (rc < 0 && errno == EINTR);
  if (rc < 0) {
    return -errno;
  }
  if (rc == 0 || pfd.revents == 0) {
    return 0;
  }
  if ((pfd.revents & (POLLIN | POLLERR | POLLHUP | POLLNVAL)) != 0) {
    return 1;
  }
  return 0;
}

__attribute__((weak)) int32_t cheng_udp_platform_use_len_field_bridge(void) {
  return 0;
}

__attribute__((weak)) int32_t cheng_udp_recvfrom_addr_ptr_bridge(int32_t fd,
                                           void* buf,
                                           int32_t len,
                                           int32_t flags,
                                           void* addr,
                                           int32_t addr_cap,
                                           void* out_addr_len,
                                           void* out_err) {
  if (out_addr_len != NULL) {
    *((int32_t*)out_addr_len) = 0;
  }
  if (out_err != NULL) {
    *((int32_t*)out_err) = 0;
  }
  if (fd < 0 || buf == NULL || len <= 0 || addr == NULL || addr_cap <= 0 ||
      out_addr_len == NULL || out_err == NULL) {
    if (out_err != NULL) {
      *((int32_t*)out_err) = EINVAL;
    }
    errno = EINVAL;
    return -1;
  }
  socklen_t raw_len = (socklen_t)addr_cap;
  ssize_t rc;
  do {
    rc = recvfrom(fd, buf, (size_t)len, flags, (struct sockaddr*)addr, &raw_len);
  } while (rc < 0 && errno == EINTR);
  if (rc < 0) {
    *((int32_t*)out_err) = errno;
    return -1;
  }
  if (rc > INT32_MAX || raw_len > (socklen_t)INT32_MAX) {
    abort();
  }
  *((int32_t*)out_addr_len) = (int32_t)raw_len;
  return (int32_t)rc;
}

int32_t cheng_udp_recvfrom_addr_bridge(int32_t fd,
                                       void* buf,
                                       int32_t len,
                                       int32_t flags,
                                       void* addr,
                                       int32_t addr_cap,
                                       int32_t* out_addr_len,
                                       int32_t* out_err) {
  return cheng_udp_recvfrom_addr_ptr_bridge(fd, buf, len, flags, addr, addr_cap, out_addr_len, out_err);
}

int32_t cheng_mobile_protect_callback_ready(void) {
  return 0;
}

__attribute__((weak)) int32_t cheng_mobile_protect_fd(int32_t fd) {
  return fd >= 0 ? 1 : 0;
}

__attribute__((weak)) void cheng_mobile_udp_debug_event(int32_t kind, int32_t fd, int32_t data_len, int32_t rc, int32_t err) {
  if (err != 0 || rc < 0) {
    __android_log_print(ANDROID_LOG_DEBUG, "cheng-mobile-shell",
                        "mobile_udp_event kind=%d fd=%d len=%d rc=%d err=%d",
                        kind, fd, data_len, rc, err);
  }
}

__attribute__((weak)) int32_t cheng_mobile_udp_fd_wait_readable(int32_t fd, int32_t timeout_ms) {
  return cheng_fd_wait_readable_bridge(fd, timeout_ms);
}

__attribute__((weak)) int32_t cheng_mobile_udp_recvfrom_addr_ptr_bridge(int32_t fd,
                                                  void* buf,
                                                  int32_t len,
                                                  int32_t flags,
                                                  void* addr,
                                                  int32_t addr_cap,
                                                  void* out_addr_len,
                                                  void* out_err) {
  return cheng_udp_recvfrom_addr_ptr_bridge(fd, buf, len, flags, addr, addr_cap, out_addr_len, out_err);
}


static uint32_t cheng_android_crc32_u8(const uint8_t* data, int byteCount) {
  uint32_t crc = 0xffffffffu;
  for (int i = 0; i < byteCount; i++) {
    crc ^= (uint32_t)data[i];
    for (int bit = 0; bit < 8; bit++) {
      uint32_t mask = 0u - (crc & 1u);
      crc = (crc >> 1u) ^ (0xedb88320u & mask);
    }
  }
  return crc ^ 0xffffffffu;
}

// Headless asset fallback: when there is no NativeResourceManager (standalone
// capture exe, not an ArkTS ability), read the asset from
// $CHENG_HEADLESS_ASSET_DIR/<rel> on disk. Mirrors the Android
// cheng_android_read_asset_file_fallback contract (same numeric return codes).
static int32_t cheng_harmony_read_asset_file_fallback(const char* rel, void* out, int32_t byteCount, int32_t expectedCrc32) {
  const char* dir = getenv("CHENG_HEADLESS_ASSET_DIR");
  if (dir == NULL || dir[0] == '\0' || out == NULL || byteCount <= 0) {
    return 2;
  }
  char path[4096];
  snprintf(path, sizeof(path), "%s/%s", dir, rel);
  FILE* f = fopen(path, "rb");
  if (f == NULL) {
    return 3;
  }
  size_t total = 0;
  unsigned char* dst = (unsigned char*)out;
  while (total < (size_t)byteCount) {
    size_t n = fread(dst + total, 1u, (size_t)byteCount - total, f);
    if (n == 0) { fclose(f); return 4; }
    total += n;
  }
  unsigned char probe;
  if (fread(&probe, 1u, 1u, f) != 0) { fclose(f); return 5; }
  fclose(f);
  uint32_t actualCrc32 = cheng_android_crc32_u8(dst, byteCount);
  if (actualCrc32 != (uint32_t)expectedCrc32) { return 6; }
  return 0;
}

static const char* cheng_harmony_rawfile_path(const char* relPath) {
  static const char* prefix = "rawfile/";
  if (relPath == NULL) {
    return NULL;
  }
  if (strncmp(relPath, prefix, 8u) == 0) {
    return relPath + 8u;
  }
  return relPath;
}

/* Checked RawFile read: exact byte count + CRC32 match required, so the scene
   runtime's integrity gate passes identically to the Android AAsset readers
   (cheng_mobile_host_read_glyph_sdf_pixel_asset/read_scene_data_asset in
   MobileShellAndroidHostSource). Return codes match that contract:
   0=ok 1=invalid-args 2=no-resource-manager 3=missing 4=length-mismatch
   5=short-read 6=crc-mismatch. */
static int32_t cheng_host_read_asset(const char* rel, void* out, int32_t byteCount, int32_t expectedCrc32) {
  if (out == NULL || byteCount <= 0) {
    CHENG_HOST_LOG_ERROR("rawfile read invalid args rel=%s out=%p byteCount=%d", rel ? rel : "", out, byteCount);
    return 1;
  }
  if (s_resource_manager == NULL) {
    if (getenv("CHENG_HEADLESS_ASSET_DIR") != NULL) {
      return cheng_harmony_read_asset_file_fallback(rel, out, byteCount, expectedCrc32);
    }
    CHENG_HOST_LOG_ERROR("rawfile read without resource manager rel=%s", rel ? rel : "");
    return 2;
  }
  const char* rawPath = cheng_harmony_rawfile_path(rel);
  RawFile* rawFile = OH_ResourceManager_OpenRawFile(s_resource_manager, rawPath);
  if (rawFile == NULL) {
    CHENG_HOST_LOG_ERROR("rawfile missing rel=%s", rel ? rel : "");
    return 3;
  }
  long rawSize = OH_ResourceManager_GetRawFileSize(rawFile);
  if (rawSize != (long)byteCount) {
    CHENG_HOST_LOG_ERROR("rawfile length mismatch rel=%s actual=%ld expected=%d", rel ? rel : "", rawSize, byteCount);
    OH_ResourceManager_CloseRawFile(rawFile);
    return 4;
  }
  uint8_t* dst = (uint8_t*)out;
  int32_t readTotal = 0;
  while (readTotal < byteCount) {
    int n = OH_ResourceManager_ReadRawFile(rawFile, dst + readTotal, (size_t)(byteCount - readTotal));
    if (n <= 0) {
      CHENG_HOST_LOG_ERROR("rawfile short read rel=%s read=%d expected=%d", rel ? rel : "", readTotal, byteCount);
      OH_ResourceManager_CloseRawFile(rawFile);
      return 5;
    }
    readTotal += n;
  }
  OH_ResourceManager_CloseRawFile(rawFile);
  uint32_t actualCrc32 = cheng_android_crc32_u8(dst, byteCount);
  if (actualCrc32 != (uint32_t)expectedCrc32) {
    CHENG_HOST_LOG_ERROR("rawfile crc mismatch rel=%s actual=%08x expected=%08x", rel ? rel : "", actualCrc32, (uint32_t)expectedCrc32);
    return 6;
  }
  CHENG_HOST_LOG_INFO("rawfile read ok rel=%s bytes=%d crc32=%08x", rel ? rel : "", byteCount, actualCrc32);
  return 0;
}

int32_t cheng_mobile_host_read_glyph_sdf_pixel_asset(void* out, int32_t byteCount, int32_t expectedCrc32) {
  return cheng_host_read_asset(kChengGlyphSdfPixelAssetRel, out, byteCount, expectedCrc32);
}

void cheng_mobile_host_trace_step(int32_t step) {
  CHENG_HOST_LOG_INFO("app_trace step=%{public}d", (int)step);
}

int32_t cheng_mobile_host_read_scene_data_asset(void* out, int32_t byteCount, int32_t expectedCrc32) {
  return cheng_host_read_asset(kChengSceneDataAssetRel, out, byteCount, expectedCrc32);
}
static uint64_t cheng_android_register_window(ANativeWindow* window) {
  if (window == NULL) {
    return 0u;
  }
  for (int i = 0; i < CHENG_ANDROID_WINDOW_SLOT_CAP; i++) {
    if (s_window_slots[i].window == window && s_window_slots[i].id != 0u) {
      return s_window_slots[i].id;
    }
  }
  for (int i = 0; i < CHENG_ANDROID_WINDOW_SLOT_CAP; i++) {
    if (s_window_slots[i].id == 0u) {
      uint64_t id = s_next_window_id++;
      if (id == 0u) {
        id = s_next_window_id++;
      }
      s_window_slots[i].id = id;
      s_window_slots[i].window = window;
      return id;
    }
  }
  return 0u;
}

static void cheng_android_unregister_window(uint64_t id) {
  if (id == 0u) {
    return;
  }
  for (int i = 0; i < CHENG_ANDROID_WINDOW_SLOT_CAP; i++) {
    if (s_window_slots[i].id == id) {
      if (s_active_window == s_window_slots[i].window) {
        s_active_window = NULL;
        s_active_width = 0;
        s_active_height = 0;
        s_active_density = 1.0f;
      }
      s_window_slots[i].id = 0u;
      s_window_slots[i].window = NULL;
      return;
    }
  }
}

static int cheng_android_surface_dimension(int preferred, int measured) {
  if (preferred > 0) {
    return preferred;
  }
  return measured > 0 ? measured : 0;
}

static int cheng_android_surface_css_px(int physical, float density) {
  if (physical <= 0) {
    return 0;
  }
  if (density <= 0.0f) {
    return physical;
  }
  int logical = (int)(((float)physical / density) + 0.5f);
  return logical > 0 ? logical : 1;
}

static int cheng_resolve_exports(void) {
  if (s_app_init != NULL) {
    return 1;
  }
  char lib_path[256];
  (void)lib_path; (void)snprintf;
  Dl_info self_info;
  s_app_handle = NULL;
  if (dladdr((void*)&cheng_resolve_exports, &self_info) && self_info.dli_fname != NULL) {
    s_app_handle = dlopen(self_info.dli_fname, RTLD_NOW | RTLD_NOLOAD);
  }
  if (s_app_handle == NULL) {
    s_app_handle = dlopen(NULL, RTLD_NOW | RTLD_GLOBAL);
  }
  if (s_app_handle == NULL) {
    cheng_log(dlerror());
    return 0;
  }
  s_app_init = (cheng_app_init_fn)cheng_resolve_required_app_export("cheng_app_init");
  s_app_set_window = (cheng_app_set_window_fn)cheng_resolve_required_app_export("cheng_app_set_window");
  s_app_tick = (cheng_app_tick_fn)cheng_resolve_required_app_export("cheng_app_tick");
  s_app_needs_frame = (cheng_app_needs_frame_fn)cheng_resolve_required_app_export("cheng_app_needs_frame");
  s_app_on_touch_milli = (cheng_app_on_touch_milli_fn)cheng_resolve_required_app_export("cheng_app_on_touch_milli");
  s_app_pause = (cheng_app_pause_fn)cheng_resolve_required_app_export("cheng_app_pause");
  s_app_resume = (cheng_app_resume_fn)cheng_resolve_required_app_export("cheng_app_resume");
  if (!(s_app_init && s_app_set_window && s_app_tick && s_app_needs_frame && s_app_on_touch_milli && s_app_pause && s_app_resume)) {
    return 0;
  }
  s_app_text_input_utf8 = (cheng_app_text_input_utf8_fn)dlsym(s_app_handle, "cheng_app_text_input_utf8");
  s_app_on_back = (cheng_app_on_back_fn)dlsym(s_app_handle, "cheng_app_on_back");
  s_app_scroll_by = (cheng_app_scroll_by_fn)dlsym(s_app_handle, "cheng_app_scroll_by");
  s_app_scroll_get = (cheng_app_scroll_get_fn)dlsym(s_app_handle, "cheng_app_scroll_get");
  s_app_media_control = (cheng_app_media_control_fn)dlsym(s_app_handle, "cheng_app_media_control");
  // cheng_app_ink_overlay_command_count/word intentionally NOT resolved here: the
  // ink overlay channel is optional and has exactly one resolver,
  // cheng_android_ink_overlay_lazy_bind (guarded by s_ink_overlay_bind_attempted_g),
  // called lazily right before each use in the compositor-frame/overlay-refresh
  // present paths. Duplicating the dlsym here registered the same two symbols into
  // the same two statics twice (driver-skeleton dlsym duplication, cleaned up per
  // harmony-host-codegen-migration-plan.md M3).
  s_runtime_set_state = (cheng_mobile_host_runtime_set_state_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_set_state");
  s_runtime_append_string_array_state = (cheng_mobile_host_runtime_append_string_array_state_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_append_string_array_state");
  s_runtime_apply_media_selection = (cheng_mobile_host_runtime_apply_media_selection_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_apply_media_selection_with_preview");
  s_runtime_apply_product_csv_selection = (cheng_mobile_host_runtime_apply_product_csv_selection_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_apply_product_csv_selection");
  s_app_debug_last_main_status = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_last_main_status");
  s_app_debug_build_step = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_build_step");
  s_app_debug_layout_fail_code = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_layout_fail_code");
  s_app_debug_layout_fail_route_index = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_layout_fail_route_index");
  s_app_debug_layout_fail_node_id = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_layout_fail_node_id");
  s_app_debug_layout_fail_ordinal = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_layout_fail_ordinal");
  s_app_debug_css_fail_code = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_css_fail_code");
  s_app_debug_css_fail_route_index = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_css_fail_route_index");
  s_app_debug_css_fail_node_id = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_css_fail_node_id");
  s_app_debug_css_fail_rule_ordinal = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_css_fail_rule_ordinal");
  s_app_debug_css_fail_declaration_ordinal = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_css_fail_declaration_ordinal");
  s_app_debug_css_fail_property_code = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_css_fail_property_code");
  s_app_debug_svg_atlas_fail_code = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_svg_atlas_fail_code");
  s_app_debug_svg_atlas_fail_paint_index = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_svg_atlas_fail_paint_index");
  s_app_debug_svg_atlas_fail_route_index = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_svg_atlas_fail_route_index");
  s_app_debug_svg_atlas_fail_node_id = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_svg_atlas_fail_node_id");
  s_app_debug_svg_atlas_fail_ordinal = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_svg_atlas_fail_ordinal");
  s_app_debug_svg_atlas_fail_resource_hash = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_svg_atlas_fail_resource_hash");
  s_app_debug_glyph_atlas_fail_code = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_glyph_atlas_fail_code");
  s_app_debug_glyph_atlas_fail_route_index = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_glyph_atlas_fail_route_index");
  s_app_debug_glyph_atlas_fail_node_id = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_glyph_atlas_fail_node_id");
  s_app_debug_glyph_atlas_fail_ordinal = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_glyph_atlas_fail_ordinal");
  s_app_debug_glyph_atlas_fail_codepoint = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_glyph_atlas_fail_codepoint");
  s_app_debug_gpu_command_count = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_gpu_command_count");
  s_app_debug_media_surface_command_count = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_media_surface_command_count");
  s_app_debug_media_surface_batch_bytes = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_media_surface_batch_bytes");
  s_app_debug_media_surface_batch_stride = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_media_surface_batch_stride");
  s_app_debug_media_receipt_count = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_media_receipt_count");
  s_app_debug_media_receipt_action_code_at = (cheng_app_debug_i32_at_fn)dlsym(s_app_handle, "cheng_app_debug_media_receipt_action_code_at");
  s_app_debug_media_receipt_status_at = (cheng_app_debug_i32_at_fn)dlsym(s_app_handle, "cheng_app_debug_media_receipt_status_at");
  s_app_debug_media_receipt_state_at = (cheng_app_debug_i32_at_fn)dlsym(s_app_handle, "cheng_app_debug_media_receipt_state_at");
  s_app_debug_media_receipt_kind_at = (cheng_app_debug_i32_at_fn)dlsym(s_app_handle, "cheng_app_debug_media_receipt_kind_at");
  s_app_debug_media_receipt_audio_provider_hash_at = (cheng_app_debug_i32_at_fn)dlsym(s_app_handle, "cheng_app_debug_media_receipt_audio_provider_hash_at");
  s_app_debug_compositor_layer_count = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_compositor_layer_count");
  s_app_debug_refresh_css_fail_stage = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_refresh_css_fail_stage");
  s_app_debug_route_index = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_route_index");
  s_app_debug_route_is_fullscreen_video = (cheng_app_debug_i32_at_fn)dlsym(s_app_handle, "cheng_app_debug_route_is_fullscreen_video");
  if (s_app_debug_route_is_fullscreen_video == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
        "APP-EXPORT MISSING: cheng_app_debug_route_is_fullscreen_video (stale .o built before "
        "M1 slice-5) -- fullscreen-video route detection defaults to false until the App .so is rebuilt");
  }
  s_app_debug_touch_hit_index = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_touch_hit_index");
  s_app_debug_last_event_hit_node_id = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_last_event_hit_node_id");
  s_app_debug_last_event_hit_status = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_last_event_hit_status");
  s_app_debug_last_event_apply_status = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_last_event_apply_status");
  s_app_debug_state_publish_notice_open = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_state_publish_notice_open");
  s_app_debug_state_is_original = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_state_is_original");
  s_app_debug_state_is_paid = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_state_is_paid");
  s_app_debug_state_show_review_console = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_state_show_review_console");
  s_app_debug_focused_text_route_index = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_focused_text_route_index");
  s_app_debug_focused_text_node_id = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_focused_text_node_id");
  /* wave9 phase B: light up 59 optional exports already present in
     scene_app_oh.o (2026-07-12 build) that resolve_exports never dlsym'd
     (see docs dossier wf_568671a5-ebd). All optional (fail-safe): a NULL
     value here does not abort resolve_exports, mirroring the
     route_is_fullscreen_video NULL-tolerant pattern above -- callers of
     each of these must NULL-check before invoking, by the same
     convention as every other optional s_app_debug_* accessor in this
     function. with_preview (Android's 3-arg
     cheng_mobile_host_runtime_apply_media_selection_with_preview) and the
     6 audio_es_* symbols are intentionally excluded (dossier: former
     needs a call-site protocol change, latter has zero .o hits). */
  /* A. text-input (2) */
  s_app_text_input_cursor_utf8 = (cheng_app_text_input_cursor_utf8_fn)dlsym(s_app_handle, "cheng_app_text_input_cursor_utf8");
  s_app_clear_text_input_focus = (cheng_app_clear_text_input_focus_fn)dlsym(s_app_handle, "cheng_app_clear_text_input_focus");
  /* B. computer_use (22) */
  s_app_computer_use_compile_text_utf8 = (cheng_app_computer_use_compile_text_utf8_fn)dlsym(s_app_handle, "cheng_app_computer_use_compile_text_utf8");
  s_app_computer_use_gui_replay_start = (cheng_app_computer_use_gui_replay_start_fn)dlsym(s_app_handle, "cheng_app_computer_use_gui_replay_start");
  s_app_computer_use_gui_replay_tick = (cheng_app_computer_use_gui_replay_tick_fn)dlsym(s_app_handle, "cheng_app_computer_use_gui_replay_tick");
  s_app_debug_computer_use_last_title_utf8 = (cheng_app_debug_cstring_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_last_title_utf8");
  s_app_computer_use_media_selection_result_utf8 = (cheng_app_computer_use_media_selection_result_utf8_fn)dlsym(s_app_handle, "cheng_app_computer_use_media_selection_result_with_preview_utf8");
  s_app_debug_computer_use_last_template_code = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_last_template_code");
  s_app_debug_computer_use_last_status = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_last_status");
  s_app_debug_computer_use_last_title_byte_len = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_last_title_byte_len");
  s_app_debug_computer_use_last_distance_km = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_last_distance_km");
  s_app_debug_computer_use_last_media_status = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_last_media_status");
  s_app_debug_computer_use_last_media_uri_byte_len = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_last_media_uri_byte_len");
  s_app_debug_computer_use_last_media_name_byte_len = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_last_media_name_byte_len");
  s_app_debug_computer_use_last_media_local_path_byte_len = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_last_media_local_path_byte_len");
  s_app_debug_computer_use_chat_trigger_count = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_chat_trigger_count");
  s_app_debug_computer_use_last_chat_result = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_last_chat_result");
  s_app_debug_computer_use_execution_mode = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_execution_mode");
  s_app_debug_computer_use_current_slow_permille = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_current_slow_permille");
  s_app_debug_computer_use_gui_replay_active = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_gui_replay_active");
  s_app_debug_computer_use_gui_replay_step_index = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_gui_replay_step_index");
  s_app_debug_computer_use_gui_replay_step_count = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_gui_replay_step_count");
  s_app_debug_computer_use_gui_replay_applied_count = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_gui_replay_applied_count");
  s_app_debug_computer_use_gui_replay_last_status = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_computer_use_gui_replay_last_status");
  /* C. m2 debug counters (10) */
  s_app_debug_m2_contents_len = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_m2_contents_len");
  s_app_debug_m2_shown_len = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_m2_shown_len");
  s_app_debug_m2_title_len = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_m2_title_len");
  s_app_debug_m2_media_len = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_m2_media_len");
  s_app_debug_m2_media_kind = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_m2_media_kind");
  s_app_debug_m2_media_is_local = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_m2_media_is_local");
  s_app_debug_m2_rebind_changed = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_m2_rebind_changed");
  s_app_debug_m2_rebind_applied = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_m2_rebind_applied");
  s_app_debug_m2_active_category_content = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_m2_active_category_content");
  s_app_debug_m2_first_category_content = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_m2_first_category_content");
  /* D. distributed/nodes (4) */
  s_app_distributed_contents_update_utf8 = (cheng_app_distributed_contents_update_utf8_fn)dlsym(s_app_handle, "cheng_app_distributed_contents_update_utf8");
  s_app_nodes_update_utf8 = (cheng_app_nodes_update_utf8_fn)dlsym(s_app_handle, "cheng_app_nodes_update_utf8");
  s_app_debug_nodes_count = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_nodes_count");
  s_app_debug_shown_count = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_shown_count");
  /* E. probe / route-apply diagnostics (11) */
  s_app_debug_route_hit_probe = (cheng_app_debug_probe2_fn)dlsym(s_app_handle, "cheng_app_debug_route_hit_probe");
  s_app_debug_box_probe = (cheng_app_debug_probe3_fn)dlsym(s_app_handle, "cheng_app_debug_box_probe");
  s_app_debug_node_box = (cheng_app_debug_probe2_fn)dlsym(s_app_handle, "cheng_app_debug_node_box");
  s_app_debug_top_kind = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_top_kind");
  s_app_debug_top_node = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_top_node");
  s_app_debug_top_apply_status = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_top_apply_status");
  s_app_debug_route_apply_node = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_route_apply_node");
  s_app_debug_route_apply_from = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_route_apply_from");
  s_app_debug_route_apply_target = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_route_apply_target");
  s_app_debug_route_apply_to = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_route_apply_to");
  s_app_debug_route_apply_status = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_route_apply_status");
  /* F. video state diagnostics (2) */
  s_app_debug_state_is_video_playing = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_state_is_video_playing");
  s_app_debug_video_overlay_hidden = (cheng_app_debug_i32_fn)dlsym(s_app_handle, "cheng_app_debug_video_overlay_hidden");
  /* G. runtime storage / snapshot (8) */
  s_runtime_current_route_state = (cheng_mobile_host_runtime_current_route_state_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_current_route_state");
  s_runtime_export_scene_state_snapshot = (cheng_mobile_host_runtime_export_scene_state_snapshot_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_export_scene_state_snapshot_utf8");
  s_runtime_restore_scene_state_snapshot = (cheng_mobile_host_runtime_restore_scene_state_snapshot_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_restore_scene_state_snapshot_utf8");
  s_runtime_set_storage = (cheng_mobile_host_runtime_set_storage_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_set_storage");
  s_runtime_storage_dirty_count = (cheng_mobile_host_runtime_storage_dirty_count_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_storage_dirty_count");
  s_runtime_storage_dirty_key_utf8 = (cheng_mobile_host_runtime_storage_dirty_at_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_storage_dirty_key_utf8");
  s_runtime_storage_dirty_value_utf8 = (cheng_mobile_host_runtime_storage_dirty_at_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_storage_dirty_value_utf8");
  s_runtime_storage_clear_dirty = (cheng_mobile_host_runtime_storage_clear_dirty_fn)dlsym(s_app_handle, "cheng_mobile_host_runtime_storage_clear_dirty");
  return 1;
}
static void cheng_android_gl_abort_if_false(int ok, const char* stage) {
  if (!ok) {
    cheng_log(stage);
    abort();
  }
}

static GLuint cheng_android_gl_compile_shader(GLenum type, const char* source) {
  GLuint shader = glCreateShader(type);
  cheng_android_gl_abort_if_false(shader != 0u, "glCreateShader failed");
  glShaderSource(shader, 1, &source, NULL);
  glCompileShader(shader);
  GLint status = 0;
  glGetShaderiv(shader, GL_COMPILE_STATUS, &status);
  if (status != GL_TRUE) {
    char log_buf[512];
    GLsizei log_len = 0;
    glGetShaderInfoLog(shader, (GLsizei)sizeof(log_buf), &log_len, log_buf);
    log_buf[sizeof(log_buf) - 1u] = 0;
    CHENG_HOST_LOG_ERROR("shader compile failed: %s", log_buf);
    abort();
  }
  return shader;
}

static GLuint cheng_android_gl_link_program(const char* vertex_source, const char* fragment_source) {
  GLuint vertex = cheng_android_gl_compile_shader(GL_VERTEX_SHADER, vertex_source);
  GLuint fragment = cheng_android_gl_compile_shader(GL_FRAGMENT_SHADER, fragment_source);
  GLuint program = glCreateProgram();
  cheng_android_gl_abort_if_false(program != 0u, "glCreateProgram failed");
  glAttachShader(program, vertex);
  glAttachShader(program, fragment);
  glLinkProgram(program);
  glDeleteShader(vertex);
  glDeleteShader(fragment);
  GLint status = 0;
  glGetProgramiv(program, GL_LINK_STATUS, &status);
  if (status != GL_TRUE) {
    char log_buf[512];
    GLsizei log_len = 0;
    glGetProgramInfoLog(program, (GLsizei)sizeof(log_buf), &log_len, log_buf);
    log_buf[sizeof(log_buf) - 1u] = 0;
    CHENG_HOST_LOG_ERROR("program link failed: %s", log_buf);
    abort();
  }
  return program;
}

static void cheng_android_gpu_init_programs(void) {
  if (s_gl_rect_program != 0u && s_gl_shadow_program != 0u && s_gl_gradient_program != 0u && s_gl_text_program != 0u && s_gl_blit_program != 0u && s_gl_external_blit_program != 0u && s_gl_vbo != 0u && s_gl_fbo != 0u) {
    return;
  }
  const char* rect_vs =
      "#version 300 es\n"
      "layout(location = 0) in vec2 a_pos;\n"
      "uniform vec2 u_screen;\n"
      "out vec2 v_pos;\n"
      "void main() {\n"
      "  vec2 clip = vec2((a_pos.x / u_screen.x) * 2.0 - 1.0, 1.0 - (a_pos.y / u_screen.y) * 2.0);\n"
      "  gl_Position = vec4(clip, 0.0, 1.0);\n"
      "  v_pos = a_pos;\n"
      "}\n";
  const char* rect_fs =
      "#version 300 es\n"
      "precision highp float;\n"
      "uniform vec4 u_color;\n"
      "uniform vec4 u_rect;\n"
      "uniform float u_radius;\n"
      "uniform float u_stroke_width;\n"
      "in vec2 v_pos;\n"
      "out vec4 frag_color;\n"
      "float rounded_box_distance(vec2 p, vec4 rect, float radius) {\n"
      "  vec2 half_size = max(rect.zw * 0.5, vec2(0.0));\n"
      "  vec2 center = rect.xy + half_size;\n"
      "  float r = clamp(radius, 0.0, min(half_size.x, half_size.y));\n"
      "  vec2 q = abs(p - center) - max(half_size - vec2(r), vec2(0.0));\n"
      "  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;\n"
      "}\n"
      "void main() {\n"
      "  float d = rounded_box_distance(v_pos, u_rect, u_radius);\n"
      "  float outer_alpha = 1.0 - smoothstep(0.0, 1.0, d);\n"
      "  float alpha = outer_alpha;\n"
      "  if (u_stroke_width > 0.0) {\n"
      "    float sw = min(u_stroke_width, min(u_rect.z, u_rect.w) * 0.5);\n"
      "    vec4 inner_rect = vec4(u_rect.xy + vec2(sw), max(u_rect.zw - vec2(sw * 2.0), vec2(0.0)));\n"
      "    float inner_radius = max(u_radius - sw, 0.0);\n"
      "    float inner_d = rounded_box_distance(v_pos, inner_rect, inner_radius);\n"
      "    float inner_alpha = 1.0 - smoothstep(0.0, 1.0, inner_d);\n"
      "    alpha = outer_alpha * (1.0 - inner_alpha);\n"
      "  }\n"
      "  frag_color = vec4(u_color.rgb, u_color.a * clamp(alpha, 0.0, 1.0));\n"
      "}\n";
  const char* shadow_vs =
      "#version 300 es\n"
      "layout(location = 0) in vec2 a_pos;\n"
      "uniform vec2 u_screen;\n"
      "out vec2 v_pos;\n"
      "void main() {\n"
      "  vec2 clip = vec2((a_pos.x / u_screen.x) * 2.0 - 1.0, 1.0 - (a_pos.y / u_screen.y) * 2.0);\n"
      "  gl_Position = vec4(clip, 0.0, 1.0);\n"
      "  v_pos = a_pos;\n"
      "}\n";
  const char* shadow_fs =
      "#version 300 es\n"
      "precision mediump float;\n"
      "uniform vec4 u_color;\n"
      "uniform vec4 u_origin_rect;\n"
      "uniform vec4 u_shadow_rect;\n"
      "uniform float u_origin_radius;\n"
      "uniform float u_shadow_radius;\n"
      "uniform float u_blur;\n"
      "uniform float u_inset;\n"
      "in vec2 v_pos;\n"
      "out vec4 frag_color;\n"
      "float rounded_box_distance(vec2 p, vec4 rect, float radius) {\n"
      "  vec2 half_size = max(rect.zw * 0.5, vec2(0.0));\n"
      "  vec2 center = rect.xy + half_size;\n"
      "  float r = clamp(radius, 0.0, min(half_size.x, half_size.y));\n"
      "  vec2 q = abs(p - center) - max(half_size - vec2(r), vec2(0.0));\n"
      "  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;\n"
      "}\n"
      "void main() {\n"
      "  float inside_origin = rounded_box_distance(v_pos, u_origin_rect, u_origin_radius);\n"
      "  float outside_shadow = rounded_box_distance(v_pos, u_shadow_rect, u_shadow_radius);\n"
      "  float outer_alpha = u_blur <= 0.0 ? step(outside_shadow, 0.0) : 1.0 - smoothstep(0.0, u_blur, outside_shadow);\n"
      "  outer_alpha *= step(0.0, inside_origin);\n"
      "  float inner_alpha = u_blur <= 0.0 ? step(0.0, outside_shadow) : smoothstep(0.0, u_blur, outside_shadow);\n"
      "  inner_alpha *= step(inside_origin, 0.0);\n"
      "  float alpha = u_inset > 0.5 ? inner_alpha : outer_alpha;\n"
      "  frag_color = vec4(u_color.rgb, u_color.a * clamp(alpha, 0.0, 1.0));\n"
      "}\n";
  const char* gradient_vs =
      "#version 300 es\n"
      "layout(location = 0) in vec2 a_pos;\n"
      "uniform vec2 u_screen;\n"
      "out vec2 v_pos;\n"
      "void main() {\n"
      "  vec2 clip = vec2((a_pos.x / u_screen.x) * 2.0 - 1.0, 1.0 - (a_pos.y / u_screen.y) * 2.0);\n"
      "  gl_Position = vec4(clip, 0.0, 1.0);\n"
      "  v_pos = a_pos;\n"
      "}\n";
  const char* gradient_fs =
      "#version 300 es\n"
      "precision highp float;\n"
      "uniform vec4 u_start_color;\n"
      "uniform vec4 u_end_color;\n"
      "uniform vec4 u_rect;\n"
      "uniform float u_radius;\n"
      "uniform vec2 u_gradient_start;\n"
      "uniform vec2 u_gradient_end;\n"
      "uniform int u_gradient_kind;\n"
      "uniform vec2 u_gradient_center;\n"
      "uniform float u_gradient_outer_radius;\n"
      "in vec2 v_pos;\n"
      "out vec4 frag_color;\n"
      "float rounded_box_distance(vec2 p, vec4 rect, float radius) {\n"
      "  vec2 half_size = max(rect.zw * 0.5, vec2(0.0));\n"
      "  vec2 center = rect.xy + half_size;\n"
      "  float r = clamp(radius, 0.0, min(half_size.x, half_size.y));\n"
      "  vec2 q = abs(p - center) - max(half_size - vec2(r), vec2(0.0));\n"
      "  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;\n"
      "}\n"
      "void main() {\n"
      "  float t;\n"
      "  if (u_gradient_kind == 1) {\n"
      "    float outer = max(u_gradient_outer_radius, 1.0);\n"
      "    t = clamp(distance(v_pos, u_gradient_center) / outer, 0.0, 1.0);\n"
      "  } else {\n"
      "    vec2 axis = u_gradient_end - u_gradient_start;\n"
      "    float denom = max(dot(axis, axis), 1.0);\n"
      "    t = clamp(dot(v_pos - u_gradient_start, axis) / denom, 0.0, 1.0);\n"
      "  }\n"
      "  vec4 color = mix(u_start_color, u_end_color, t);\n"
      "  float inside = step(rounded_box_distance(v_pos, u_rect, u_radius), 0.0);\n"
      "  frag_color = vec4(color.rgb, color.a * inside);\n"
      "}\n";
  const char* text_vs =
      "#version 300 es\n"
      "layout(location = 0) in vec2 a_pos;\n"
      "layout(location = 1) in vec2 a_uv;\n"
      "uniform vec2 u_screen;\n"
      "out vec2 v_uv;\n"
      "void main() {\n"
      "  vec2 clip = vec2((a_pos.x / u_screen.x) * 2.0 - 1.0, 1.0 - (a_pos.y / u_screen.y) * 2.0);\n"
      "  gl_Position = vec4(clip, 0.0, 1.0);\n"
      "  v_uv = a_uv;\n"
      "}\n";
  const char* text_fs =
      "#version 300 es\n"
      "precision mediump float;\n"
      "uniform sampler2D u_atlas;\n"
      "uniform vec4 u_color;\n"
      "uniform float u_px_range;\n"
      "in vec2 v_uv;\n"
      "out vec4 frag_color;\n"
      "void main() {\n"
      "  float d = texture(u_atlas, v_uv).r;\n"
      "  vec2 unit_range = vec2(u_px_range) / vec2(textureSize(u_atlas, 0));\n"
      "  vec2 screen_tex_size = vec2(1.0) / max(fwidth(v_uv), vec2(0.000001));\n"
      "  float screen_px_range = max(0.5 * dot(unit_range, screen_tex_size), 1.0);\n"
      "  float a = clamp((d - 0.5) * screen_px_range + 0.5, 0.0, 1.0) * u_color.a;\n"
      "  frag_color = vec4(u_color.rgb, a);\n"
      "}\n";
  const char* blit_vs =
      "#version 300 es\n"
      "layout(location = 0) in vec2 a_pos;\n"
      "layout(location = 1) in vec2 a_uv;\n"
      "uniform vec2 u_screen;\n"
      "out vec2 v_uv;\n"
      "void main() {\n"
      "  vec2 clip = vec2((a_pos.x / u_screen.x) * 2.0 - 1.0, 1.0 - (a_pos.y / u_screen.y) * 2.0);\n"
      "  gl_Position = vec4(clip, 0.0, 1.0);\n"
      "  v_uv = a_uv;\n"
      "}\n";
  const char* external_blit_vs =
      "#version 300 es\n"
      "layout(location = 0) in vec2 a_pos;\n"
      "layout(location = 1) in vec2 a_uv;\n"
      "uniform vec2 u_screen;\n"
      "uniform mat4 u_tex_transform;\n"
      "out vec2 v_uv;\n"
      "void main() {\n"
      "  vec2 clip = vec2((a_pos.x / u_screen.x) * 2.0 - 1.0, 1.0 - (a_pos.y / u_screen.y) * 2.0);\n"
      "  gl_Position = vec4(clip, 0.0, 1.0);\n"
      "  vec4 transformed = u_tex_transform * vec4(a_uv, 0.0, 1.0);\n"
      "  v_uv = transformed.xy;\n"
      "}\n";
  const char* blit_fs =
      "#version 300 es\n"
      "precision mediump float;\n"
      "uniform sampler2D u_texture;\n"
      "in vec2 v_uv;\n"
      "out vec4 frag_color;\n"
      "void main() {\n"
      "  frag_color = texture(u_texture, v_uv);\n"
      "}\n";
  const char* external_blit_fs =
      "#version 300 es\n"
      "#extension GL_OES_EGL_image_external_essl3 : require\n"
      "precision mediump float;\n"
      "uniform samplerExternalOES u_texture;\n"
      "in vec2 v_uv;\n"
      "out vec4 frag_color;\n"
      "void main() {\n"
      "  frag_color = texture(u_texture, v_uv);\n"
      "}\n";
  s_gl_rect_program = cheng_android_gl_link_program(rect_vs, rect_fs);
  s_gl_shadow_program = cheng_android_gl_link_program(shadow_vs, shadow_fs);
  s_gl_gradient_program = cheng_android_gl_link_program(gradient_vs, gradient_fs);
  s_gl_text_program = cheng_android_gl_link_program(text_vs, text_fs);
  const char* inkfield_fs =
      "#version 300 es\n"
      "precision mediump float;\n"
      "uniform sampler2D u_texture;\n"
      "uniform float u_fade;\n"
      "in vec2 v_uv;\n"
      "out vec4 frag_color;\n"
      "void main() {\n"
      "  float d = texture(u_texture, v_uv).r * u_fade;\n"
      "  float core = smoothstep(0.26, 0.46, d);\n"
      "  float haze = smoothstep(0.05, 0.26, d) * 0.30;\n"
      "  float a = clamp(core + haze, 0.0, 1.0);\n"
      "  vec3 ink = mix(vec3(0.30, 0.34, 0.38), vec3(0.030, 0.040, 0.055), core);\n"
      "  frag_color = vec4(ink * a, a);\n"
      "}\n";
  s_gl_inkfield_program = cheng_android_gl_link_program(blit_vs, inkfield_fs);
  s_gl_blit_program = cheng_android_gl_link_program(blit_vs, blit_fs);
  s_gl_external_blit_program = cheng_android_gl_link_program(external_blit_vs, external_blit_fs);
  s_gl_rect_screen_loc = glGetUniformLocation(s_gl_rect_program, "u_screen");
  s_gl_rect_color_loc = glGetUniformLocation(s_gl_rect_program, "u_color");
  s_gl_rect_rect_loc = glGetUniformLocation(s_gl_rect_program, "u_rect");
  s_gl_rect_radius_loc = glGetUniformLocation(s_gl_rect_program, "u_radius");
  s_gl_rect_stroke_width_loc = glGetUniformLocation(s_gl_rect_program, "u_stroke_width");
  s_gl_shadow_screen_loc = glGetUniformLocation(s_gl_shadow_program, "u_screen");
  s_gl_shadow_color_loc = glGetUniformLocation(s_gl_shadow_program, "u_color");
  s_gl_shadow_origin_rect_loc = glGetUniformLocation(s_gl_shadow_program, "u_origin_rect");
  s_gl_shadow_rect_loc = glGetUniformLocation(s_gl_shadow_program, "u_shadow_rect");
  s_gl_shadow_origin_radius_loc = glGetUniformLocation(s_gl_shadow_program, "u_origin_radius");
  s_gl_shadow_radius_loc = glGetUniformLocation(s_gl_shadow_program, "u_shadow_radius");
  s_gl_shadow_blur_loc = glGetUniformLocation(s_gl_shadow_program, "u_blur");
  s_gl_shadow_inset_loc = glGetUniformLocation(s_gl_shadow_program, "u_inset");
  s_gl_gradient_screen_loc = glGetUniformLocation(s_gl_gradient_program, "u_screen");
  s_gl_gradient_start_color_loc = glGetUniformLocation(s_gl_gradient_program, "u_start_color");
  s_gl_gradient_end_color_loc = glGetUniformLocation(s_gl_gradient_program, "u_end_color");
  s_gl_gradient_rect_loc = glGetUniformLocation(s_gl_gradient_program, "u_rect");
  s_gl_gradient_radius_loc = glGetUniformLocation(s_gl_gradient_program, "u_radius");
  s_gl_gradient_start_loc = glGetUniformLocation(s_gl_gradient_program, "u_gradient_start");
  s_gl_gradient_end_loc = glGetUniformLocation(s_gl_gradient_program, "u_gradient_end");
  s_gl_gradient_kind_loc = glGetUniformLocation(s_gl_gradient_program, "u_gradient_kind");
  s_gl_gradient_center_loc = glGetUniformLocation(s_gl_gradient_program, "u_gradient_center");
  s_gl_gradient_outer_radius_loc = glGetUniformLocation(s_gl_gradient_program, "u_gradient_outer_radius");
  s_gl_text_screen_loc = glGetUniformLocation(s_gl_text_program, "u_screen");
  s_gl_text_color_loc = glGetUniformLocation(s_gl_text_program, "u_color");
  s_gl_text_px_range_loc = glGetUniformLocation(s_gl_text_program, "u_px_range");
  s_gl_text_atlas_loc = glGetUniformLocation(s_gl_text_program, "u_atlas");
  s_gl_inkfield_screen_loc = glGetUniformLocation(s_gl_inkfield_program, "u_screen");
  s_gl_inkfield_texture_loc = glGetUniformLocation(s_gl_inkfield_program, "u_texture");
  s_gl_inkfield_fade_loc = glGetUniformLocation(s_gl_inkfield_program, "u_fade");
  s_gl_blit_screen_loc = glGetUniformLocation(s_gl_blit_program, "u_screen");
  s_gl_blit_texture_loc = glGetUniformLocation(s_gl_blit_program, "u_texture");
  s_gl_external_blit_screen_loc = glGetUniformLocation(s_gl_external_blit_program, "u_screen");
  s_gl_external_blit_texture_loc = glGetUniformLocation(s_gl_external_blit_program, "u_texture");
  s_gl_external_blit_tex_transform_loc = glGetUniformLocation(s_gl_external_blit_program, "u_tex_transform");
  cheng_android_gl_abort_if_false(s_gl_rect_screen_loc >= 0 && s_gl_rect_color_loc >= 0 && s_gl_rect_rect_loc >= 0 && s_gl_rect_radius_loc >= 0 && s_gl_rect_stroke_width_loc >= 0 && s_gl_shadow_screen_loc >= 0 && s_gl_shadow_color_loc >= 0 && s_gl_shadow_origin_rect_loc >= 0 && s_gl_shadow_rect_loc >= 0 && s_gl_shadow_origin_radius_loc >= 0 && s_gl_shadow_radius_loc >= 0 && s_gl_shadow_blur_loc >= 0 && s_gl_shadow_inset_loc >= 0 && s_gl_gradient_screen_loc >= 0 && s_gl_gradient_start_color_loc >= 0 && s_gl_gradient_end_color_loc >= 0 && s_gl_gradient_rect_loc >= 0 && s_gl_gradient_radius_loc >= 0 && s_gl_gradient_start_loc >= 0 && s_gl_gradient_end_loc >= 0 && s_gl_gradient_kind_loc >= 0 && s_gl_gradient_center_loc >= 0 && s_gl_gradient_outer_radius_loc >= 0 && s_gl_text_screen_loc >= 0 && s_gl_text_color_loc >= 0 && s_gl_text_px_range_loc >= 0 && s_gl_text_atlas_loc >= 0 && s_gl_blit_screen_loc >= 0 && s_gl_blit_texture_loc >= 0 && s_gl_external_blit_screen_loc >= 0 && s_gl_external_blit_texture_loc >= 0 && s_gl_external_blit_tex_transform_loc >= 0, "glGetUniformLocation failed");
  glGenBuffers(1, &s_gl_vbo);
  cheng_android_gl_abort_if_false(s_gl_vbo != 0u, "glGenBuffers failed");
  glGenFramebuffers(1, &s_gl_fbo);
  cheng_android_gl_abort_if_false(s_gl_fbo != 0u, "glGenFramebuffers failed");
}


static void cheng_android_gpu_destroy(void) {
  for (int i = 0; i < CHENG_ANDROID_MEDIA_TEXTURE_CACHE_CAP; i++) {
    cheng_android_media_texture_release(&s_media_textures[i]);
  }
  if (s_egl_display != EGL_NO_DISPLAY) {
    eglMakeCurrent(s_egl_display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
    if (s_egl_pbuffer_surface != EGL_NO_SURFACE) {
      eglDestroySurface(s_egl_display, s_egl_pbuffer_surface);
    }
    if (s_egl_surface != EGL_NO_SURFACE) {
      eglDestroySurface(s_egl_display, s_egl_surface);
    }
    if (s_egl_context != EGL_NO_CONTEXT) {
      eglDestroyContext(s_egl_display, s_egl_context);
    }
    eglTerminate(s_egl_display);
  }
  s_egl_display = EGL_NO_DISPLAY;
  s_egl_context = EGL_NO_CONTEXT;
  s_egl_surface = EGL_NO_SURFACE;
  s_egl_pbuffer_surface = EGL_NO_SURFACE;
  s_egl_config = NULL;
  s_egl_window = NULL;
  s_gl_rect_program = 0u;
  s_gl_shadow_program = 0u;
  s_gl_gradient_program = 0u;
  s_gl_text_program = 0u;
  s_gl_blit_program = 0u;
  s_gl_external_blit_program = 0u;
  s_gl_vbo = 0u;
  s_gl_fbo = 0u;
  s_gl_rect_screen_loc = -1;
  s_gl_rect_color_loc = -1;
  s_gl_rect_rect_loc = -1;
  s_gl_rect_radius_loc = -1;
  s_gl_rect_stroke_width_loc = -1;
  s_gl_shadow_screen_loc = -1;
  s_gl_shadow_color_loc = -1;
  s_gl_shadow_origin_rect_loc = -1;
  s_gl_shadow_rect_loc = -1;
  s_gl_shadow_origin_radius_loc = -1;
  s_gl_shadow_radius_loc = -1;
  s_gl_shadow_blur_loc = -1;
  s_gl_shadow_inset_loc = -1;
  s_gl_gradient_screen_loc = -1;
  s_gl_gradient_start_color_loc = -1;
  s_gl_gradient_end_color_loc = -1;
  s_gl_gradient_rect_loc = -1;
  s_gl_gradient_radius_loc = -1;
  s_gl_gradient_start_loc = -1;
  s_gl_gradient_end_loc = -1;
  s_gl_gradient_kind_loc = -1;
  s_gl_gradient_center_loc = -1;
  s_gl_gradient_outer_radius_loc = -1;
  s_gl_text_screen_loc = -1;
  s_gl_text_color_loc = -1;
  s_gl_text_px_range_loc = -1;
  s_gl_text_atlas_loc = -1;
  s_gl_blit_screen_loc = -1;
  s_gl_blit_texture_loc = -1;
  s_gl_external_blit_screen_loc = -1;
  s_gl_external_blit_texture_loc = -1;
  s_gl_external_blit_tex_transform_loc = -1;
  for (int i = 0; i < CHENG_ANDROID_LAYER_CACHE_CAP; i++) {
    memset(&s_layer_caches[i], 0, sizeof(s_layer_caches[i]));
  }
  for (int i = 0; i < CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP; i++) {
    s_image_textures[i].gl_texture = 0u;
    s_image_textures[i].gl_uploaded = 0;
  }
  s_pending_image_texture_delete_count = 0;
  for (int i = 0; i < CHENG_ANDROID_GLYPH_SDF_ATLAS_CACHE_CAP; i++) {
    free(s_glyph_sdf_atlases[i].gl_textures);
    s_glyph_sdf_atlases[i].gl_textures = NULL;
    s_glyph_sdf_atlases[i].gl_texture_count = 0;
    s_glyph_sdf_atlases[i].gl_tile_height = 0;
    s_glyph_sdf_atlases[i].gl_texture = 0u;
    s_glyph_sdf_atlases[i].gl_uploaded = 0;
  }
}

// #14-eos v4 (cheng_gui_entry.cpp): makes this function's EGL touch of `window` mutually
// exclusive, in real wall-clock time, with OnSurfaceDestroyed learning that same window
// is going away and returning to OHOS (the point at which OHOS may reclaim it, per the
// XComponent contract). Defined in cheng_gui_entry.cpp; never held across anything
// unbounded — cheng_gui_host_begin's cold-start body (dlsym/rawfile I/O/app init) runs
// entirely before this function is ever reached and never touches the window, so it
// never holds this lock.
extern void cheng_gui_window_touch_lock(void);
extern void cheng_gui_window_touch_unlock(void);

static void cheng_android_gpu_ensure(ANativeWindow* window, int width, int height) {
  if (window == NULL || width <= 0 || height <= 0) {
    abort();
  }
  cheng_gui_window_touch_lock();
  if (s_egl_display == EGL_NO_DISPLAY) {
    s_egl_display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    cheng_android_gl_abort_if_false(s_egl_display != EGL_NO_DISPLAY, "eglGetDisplay failed");
    cheng_android_gl_abort_if_false(eglInitialize(s_egl_display, NULL, NULL), "eglInitialize failed");
    cheng_android_gl_abort_if_false(eglBindAPI(EGL_OPENGL_ES_API), "eglBindAPI failed");
    const EGLint config_attribs[] = {
      EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
      EGL_SURFACE_TYPE, EGL_WINDOW_BIT | EGL_PBUFFER_BIT,
      EGL_RED_SIZE, 8,
      EGL_GREEN_SIZE, 8,
      EGL_BLUE_SIZE, 8,
      EGL_ALPHA_SIZE, 8,
      EGL_DEPTH_SIZE, 0,
      EGL_STENCIL_SIZE, 0,
      EGL_NONE
    };
    EGLint config_count = 0;
    cheng_android_gl_abort_if_false(eglChooseConfig(s_egl_display, config_attribs, &s_egl_config, 1, &config_count) && config_count == 1, "eglChooseConfig failed");
    const EGLint context_attribs[] = {
      EGL_CONTEXT_CLIENT_VERSION, 3,
      EGL_NONE
    };
    s_egl_context = eglCreateContext(s_egl_display, s_egl_config, EGL_NO_CONTEXT, context_attribs);
    cheng_android_gl_abort_if_false(s_egl_context != EGL_NO_CONTEXT, "eglCreateContext failed");
  }
  if (s_egl_surface == EGL_NO_SURFACE || s_egl_window != window) {
    if (s_egl_surface != EGL_NO_SURFACE) {
      eglDestroySurface(s_egl_display, s_egl_surface);
      s_egl_surface = EGL_NO_SURFACE;
    }
    s_egl_surface = eglCreateWindowSurface(s_egl_display, s_egl_config, (EGLNativeWindowType)(uintptr_t)window, NULL);
    cheng_android_gl_abort_if_false(s_egl_surface != EGL_NO_SURFACE, "eglCreateWindowSurface failed");
    s_egl_window = window;
  }
  cheng_android_gl_abort_if_false(eglMakeCurrent(s_egl_display, s_egl_surface, s_egl_surface, s_egl_context), "eglMakeCurrent failed");
  cheng_android_gpu_init_programs();
  if (s_pending_image_texture_delete_count > 0) {
    glDeleteTextures(s_pending_image_texture_delete_count, s_pending_image_texture_deletes);
    s_pending_image_texture_delete_count = 0;
  }
  glViewport(0, 0, width, height);
  glDisable(GL_DEPTH_TEST);
  glDisable(GL_CULL_FACE);
  glEnable(GL_BLEND);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  cheng_gui_window_touch_unlock();
}

// Headless GPU capture: same EGL display/context/config + program pipeline as the
// window path, but renders into an offscreen pbuffer at the exact logical size so the
// result can be read back with glReadPixels and pixel-compared to the React PWA.
static void cheng_android_gpu_ensure_offscreen(int width, int height) {
  if (width <= 0 || height <= 0) {
    abort();
  }
  if (s_egl_display == EGL_NO_DISPLAY) {
    s_egl_display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    cheng_android_gl_abort_if_false(s_egl_display != EGL_NO_DISPLAY, "eglGetDisplay failed");
    cheng_android_gl_abort_if_false(eglInitialize(s_egl_display, NULL, NULL), "eglInitialize failed");
    cheng_android_gl_abort_if_false(eglBindAPI(EGL_OPENGL_ES_API), "eglBindAPI failed");
    const EGLint config_attribs[] = {
      EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT,
      EGL_SURFACE_TYPE, EGL_WINDOW_BIT | EGL_PBUFFER_BIT,
      EGL_RED_SIZE, 8,
      EGL_GREEN_SIZE, 8,
      EGL_BLUE_SIZE, 8,
      EGL_ALPHA_SIZE, 8,
      EGL_DEPTH_SIZE, 0,
      EGL_STENCIL_SIZE, 0,
      EGL_NONE
    };
    EGLint config_count = 0;
    cheng_android_gl_abort_if_false(eglChooseConfig(s_egl_display, config_attribs, &s_egl_config, 1, &config_count) && config_count == 1, "eglChooseConfig failed");
    const EGLint context_attribs[] = {
      EGL_CONTEXT_CLIENT_VERSION, 3,
      EGL_NONE
    };
    s_egl_context = eglCreateContext(s_egl_display, s_egl_config, EGL_NO_CONTEXT, context_attribs);
    cheng_android_gl_abort_if_false(s_egl_context != EGL_NO_CONTEXT, "eglCreateContext failed");
  }
  if (s_egl_pbuffer_surface == EGL_NO_SURFACE || s_headless_capture_width != width || s_headless_capture_height != height) {
    if (s_egl_pbuffer_surface != EGL_NO_SURFACE) {
      eglDestroySurface(s_egl_display, s_egl_pbuffer_surface);
      s_egl_pbuffer_surface = EGL_NO_SURFACE;
    }
    const EGLint pbuffer_attribs[] = { EGL_WIDTH, width, EGL_HEIGHT, height, EGL_NONE };
    s_egl_pbuffer_surface = eglCreatePbufferSurface(s_egl_display, s_egl_config, pbuffer_attribs);
    cheng_android_gl_abort_if_false(s_egl_pbuffer_surface != EGL_NO_SURFACE, "eglCreatePbufferSurface failed");
    s_headless_capture_width = width;
    s_headless_capture_height = height;
  }
  cheng_android_gl_abort_if_false(eglMakeCurrent(s_egl_display, s_egl_pbuffer_surface, s_egl_pbuffer_surface, s_egl_context), "eglMakeCurrent pbuffer failed");
  cheng_android_gpu_init_programs();
  if (s_pending_image_texture_delete_count > 0) {
    glDeleteTextures(s_pending_image_texture_delete_count, s_pending_image_texture_deletes);
    s_pending_image_texture_delete_count = 0;
  }
  glViewport(0, 0, width, height);
  glDisable(GL_DEPTH_TEST);
  glDisable(GL_CULL_FACE);
  glEnable(GL_BLEND);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
}

// Enable headless capture mode at an exact logical size. After cheng_app_init +
// set_window + tick (which drives present_compositor_frame into the pbuffer), call
// cheng_mobile_host_read_offscreen_pixels to read the RGBA back.
void cheng_mobile_host_begin_offscreen_capture(int width, int height) {
  s_headless_capture = 1;
  cheng_android_gpu_ensure_offscreen(width, height);
}

int cheng_mobile_host_read_offscreen_pixels(int width, int height, unsigned char* out_rgba) {
  if (!s_headless_capture || out_rgba == NULL || width <= 0 || height <= 0) {
    return 0;
  }
  if (width != s_headless_capture_width || height != s_headless_capture_height) {
    return 0;
  }
  glFinish();
  glPixelStorei(GL_PACK_ALIGNMENT, 1);
  glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, out_rgba);
  // glReadPixels origin is bottom-left; flip vertically to top-left row order.
  int row_bytes = width * 4;
  unsigned char* tmp = (unsigned char*)malloc((size_t)row_bytes);
  if (tmp == NULL) {
    return 0;
  }
  for (int y = 0; y < height / 2; y++) {
    unsigned char* top = out_rgba + (size_t)y * (size_t)row_bytes;
    unsigned char* bot = out_rgba + (size_t)(height - 1 - y) * (size_t)row_bytes;
    memcpy(tmp, top, (size_t)row_bytes);
    memcpy(top, bot, (size_t)row_bytes);
    memcpy(bot, tmp, (size_t)row_bytes);
  }
  free(tmp);
  return 1;
}

static void cheng_android_gpu_color_from_argb(uint32_t argb, float* rgba) {
  rgba[0] = (float)((argb >> 16u) & 0xffu) / 255.0f;
  rgba[1] = (float)((argb >> 8u) & 0xffu) / 255.0f;
  rgba[2] = (float)(argb & 0xffu) / 255.0f;
  rgba[3] = (float)((argb >> 24u) & 0xffu) / 255.0f;
}

static int cheng_android_max_int(int a, int b) {
  return a > b ? a : b;
}

static int cheng_android_min_int(int a, int b) {
  return a < b ? a : b;
}

static int cheng_android_framebuffer_width_for(int logical_width) {
  return s_active_width > 0 ? s_active_width : logical_width;
}

static int cheng_android_framebuffer_height_for(int logical_height) {
  return s_active_height > 0 ? s_active_height : logical_height;
}

static int cheng_android_div_floor_i64(int64_t numerator, int64_t denominator) {
  if (denominator <= 0) {
    abort();
  }
  if (numerator >= 0) {
    return (int)(numerator / denominator);
  }
  return (int)(-(((-numerator) + denominator - 1) / denominator));
}

static int cheng_android_div_ceil_i64(int64_t numerator, int64_t denominator) {
  if (denominator <= 0) {
    abort();
  }
  if (numerator >= 0) {
    return (int)((numerator + denominator - 1) / denominator);
  }
  return (int)(-((-numerator) / denominator));
}

static int cheng_android_scale_logical_to_framebuffer(int value, int logical_size, int framebuffer_size) {
  if (logical_size <= 0 || framebuffer_size <= 0) {
    abort();
  }
  return cheng_android_div_floor_i64((int64_t)value * (int64_t)framebuffer_size, (int64_t)logical_size);
}

static int cheng_android_scale_logical_to_framebuffer_ceil(int value, int logical_size, int framebuffer_size) {
  if (logical_size <= 0 || framebuffer_size <= 0) {
    abort();
  }
  return cheng_android_div_ceil_i64((int64_t)value * (int64_t)framebuffer_size, (int64_t)logical_size);
}

static void cheng_android_gpu_set_scissor_top_left(int framebuffer_width, int framebuffer_height, int x, int y, int width, int height) {
  if (framebuffer_width <= 0 || framebuffer_height <= 0 || width < 0 || height < 0) {
    abort();
  }
  int left = cheng_android_max_int(0, x);
  int top = cheng_android_max_int(0, y);
  int right = cheng_android_min_int(framebuffer_width, x + width);
  int bottom = cheng_android_min_int(framebuffer_height, y + height);
  if (right < left) {
    right = left;
  }
  if (bottom < top) {
    bottom = top;
  }
  glEnable(GL_SCISSOR_TEST);
  glScissor(left, framebuffer_height - bottom, right - left, bottom - top);
}

static void cheng_android_gpu_set_scaled_scissor_top_left(int framebuffer_width, int framebuffer_height, int logical_width, int logical_height, int x, int y, int width, int height) {
  if (framebuffer_width <= 0 || framebuffer_height <= 0 || logical_width <= 0 || logical_height <= 0 || width < 0 || height < 0) {
    abort();
  }
  int left = cheng_android_scale_logical_to_framebuffer(x, logical_width, framebuffer_width);
  int top = cheng_android_scale_logical_to_framebuffer(y, logical_height, framebuffer_height);
  int right = cheng_android_scale_logical_to_framebuffer_ceil(x + width, logical_width, framebuffer_width);
  int bottom = cheng_android_scale_logical_to_framebuffer_ceil(y + height, logical_height, framebuffer_height);
  cheng_android_gpu_set_scissor_top_left(framebuffer_width, framebuffer_height, left, top, right - left, bottom - top);
}

static void cheng_android_gpu_intersect_clip(int* clip_x, int* clip_y, int* clip_w, int* clip_h, int rect_x, int rect_y, int rect_w, int rect_h) {
  if (clip_x == NULL || clip_y == NULL || clip_w == NULL || clip_h == NULL || rect_w <= 0 || rect_h <= 0) {
    abort();
  }
  int next_x = cheng_android_max_int(*clip_x, rect_x);
  int next_y = cheng_android_max_int(*clip_y, rect_y);
  int next_right = cheng_android_min_int(*clip_x + *clip_w, rect_x + rect_w);
  int next_bottom = cheng_android_min_int(*clip_y + *clip_h, rect_y + rect_h);
  *clip_x = next_x;
  *clip_y = next_y;
  *clip_w = next_right - next_x;
  *clip_h = next_bottom - next_y;
  if (*clip_w < 0) {
    *clip_w = 0;
  }
  if (*clip_h < 0) {
    *clip_h = 0;
  }
}

static void cheng_android_gpu_draw_rect_shape(int screen_width, int screen_height, int x, int y, int width, int height, uint32_t argb, int radius, int stroke_width) {
  if (width <= 0 || height <= 0) {
    return;
  }
  float x0 = (float)x;
  float y0 = (float)y;
  float x1 = (float)(x + width);
  float y1 = (float)(y + height);
  const float vertices[] = {
    x0, y0, x1, y0, x0, y1,
    x1, y0, x1, y1, x0, y1
  };
  float color[4];
  cheng_android_gpu_color_from_argb(argb, color);
  int clipped_radius = radius < 0 ? 0 : radius;
  int clipped_stroke_width = stroke_width < 0 ? 0 : stroke_width;
  glUseProgram(s_gl_rect_program);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glUniform2f(s_gl_rect_screen_loc, (float)screen_width, (float)screen_height);
  glUniform4f(s_gl_rect_color_loc, color[0], color[1], color[2], color[3]);
  glUniform4f(s_gl_rect_rect_loc, (float)x, (float)y, (float)width, (float)height);
  glUniform1f(s_gl_rect_radius_loc, (float)clipped_radius);
  glUniform1f(s_gl_rect_stroke_width_loc, (float)clipped_stroke_width);
  glBindBuffer(GL_ARRAY_BUFFER, s_gl_vbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)sizeof(vertices), vertices, GL_STREAM_DRAW);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, (GLsizei)(2 * sizeof(float)), (const void*)0);
  glDrawArrays(GL_TRIANGLES, 0, 6);
}

void cheng_android_gpu_draw_rect(int screen_width, int screen_height, int x, int y, int width, int height, uint32_t argb, int radius) {
  cheng_android_gpu_draw_rect_shape(screen_width, screen_height, x, y, width, height, argb, radius, 0);
}

static void cheng_android_gpu_draw_stroke_rect(int screen_width, int screen_height, int x, int y, int width, int height, uint32_t argb, int radius) {
  cheng_android_gpu_draw_rect_shape(screen_width, screen_height, x, y, width, height, argb, radius, 1);
}

static void cheng_android_gpu_draw_svg_circle_pattern(int screen_width, int screen_height, int x, int y, int width, int height, uint32_t argb, int tile_width, int tile_height, int circle_cx, int circle_cy, int circle_radius) {
  if (screen_width <= 0 || screen_height <= 0 || width <= 0 || height <= 0 || tile_width <= 0 || tile_height <= 0 || circle_cx < 0 || circle_cy < 0 || circle_radius <= 0) {
    CHENG_HOST_LOG_ERROR("svg_circle_pattern invalid args screen=%dx%d rect=%d,%d,%d,%d tile=%dx%d circle=%d,%d r=%d",
                        screen_width, screen_height, x, y, width, height, tile_width, tile_height, circle_cx, circle_cy, circle_radius);
    abort();
  }
  int dot_size = circle_radius * 2;
  if (dot_size <= 0) {
    abort();
  }
  int max_y = y + height;
  int max_x = x + width;
  for (int cy = y + circle_cy; cy < max_y; cy += tile_height) {
    for (int cx = x + circle_cx; cx < max_x; cx += tile_width) {
      cheng_android_gpu_draw_rect(screen_width, screen_height, cx - circle_radius, cy - circle_radius, dot_size, dot_size, argb, circle_radius);
    }
  }
}

static void cheng_android_gpu_draw_box_shadow(int screen_width, int screen_height, int x, int y, int width, int height, int offset_x, int offset_y, int blur, int spread, int radius, int inset, uint32_t argb) {
  if (screen_width <= 0 || screen_height <= 0 || blur < 0) {
    abort();
  }
  if (width <= 0 || height <= 0) {
    return;
  }
  int shadow_x = x + offset_x - spread;
  int shadow_y = y + offset_y - spread;
  int shadow_w = width + spread * 2;
  int shadow_h = height + spread * 2;
  if (inset != 0) {
    shadow_x = x + offset_x + spread;
    shadow_y = y + offset_y + spread;
    shadow_w = width - spread * 2;
    shadow_h = height - spread * 2;
  }
  if (shadow_w <= 0 || shadow_h <= 0) {
    return;
  }
  int quad_x = shadow_x - blur;
  int quad_y = shadow_y - blur;
  int quad_w = shadow_w + blur * 2;
  int quad_h = shadow_h + blur * 2;
  if (inset != 0) {
    quad_x = x;
    quad_y = y;
    quad_w = width;
    quad_h = height;
  }
  if (quad_w <= 0 || quad_h <= 0) {
    return;
  }
  float x0 = (float)quad_x;
  float y0 = (float)quad_y;
  float x1 = (float)(quad_x + quad_w);
  float y1 = (float)(quad_y + quad_h);
  const float vertices[] = {
    x0, y0, x1, y0, x0, y1,
    x1, y0, x1, y1, x0, y1
  };
  float color[4];
  cheng_android_gpu_color_from_argb(argb, color);
  int origin_radius = radius < 0 ? 0 : radius;
  int shadow_radius = inset != 0 ? radius - spread : radius + spread;
  if (shadow_radius < 0) {
    shadow_radius = 0;
  }
  glUseProgram(s_gl_shadow_program);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glUniform2f(s_gl_shadow_screen_loc, (float)screen_width, (float)screen_height);
  glUniform4f(s_gl_shadow_color_loc, color[0], color[1], color[2], color[3]);
  glUniform4f(s_gl_shadow_origin_rect_loc, (float)x, (float)y, (float)width, (float)height);
  glUniform4f(s_gl_shadow_rect_loc, (float)shadow_x, (float)shadow_y, (float)shadow_w, (float)shadow_h);
  glUniform1f(s_gl_shadow_origin_radius_loc, (float)origin_radius);
  glUniform1f(s_gl_shadow_radius_loc, (float)shadow_radius);
  glUniform1f(s_gl_shadow_blur_loc, (float)blur);
  glUniform1f(s_gl_shadow_inset_loc, inset != 0 ? 1.0f : 0.0f);
  glBindBuffer(GL_ARRAY_BUFFER, s_gl_vbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)sizeof(vertices), vertices, GL_STREAM_DRAW);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, (GLsizei)(2 * sizeof(float)), (const void*)0);
  glDrawArrays(GL_TRIANGLES, 0, 6);
}

static int cheng_android_gpu_gradient_points(int x, int y, int width, int height, int angle, float* start_x, float* start_y, float* end_x, float* end_y) {
  // CSS gradient angle (0deg = to top, clockwise). Screen y is down, so the
  // direction unit vector is (sin a, -cos a). The gradient line passes through the
  // box center with length |W*sin a| + |H*cos a| (covers all corners), matching the
  // 8 keyword directions exactly while supporting arbitrary degrees.
  double a = (double)angle * 3.14159265358979323846 / 180.0;
  double dirx = sin(a);
  double diry = -cos(a);
  double cx = (double)x + (double)width * 0.5;
  double cy = (double)y + (double)height * 0.5;
  double len = fabs((double)width * dirx) + fabs((double)height * diry);
  double half = len * 0.5;
  *start_x = (float)(cx - dirx * half);
  *start_y = (float)(cy - diry * half);
  *end_x = (float)(cx + dirx * half);
  *end_y = (float)(cy + diry * half);
  return 1;
}

static void cheng_android_gpu_draw_linear_gradient(int screen_width, int screen_height, int x, int y, int width, int height, uint32_t start_argb, uint32_t end_argb, int angle, int radius, int gradient_kind, int center_x_permille, int center_y_permille, int radius_permille) {
  if (screen_width <= 0 || screen_height <= 0) {
    abort();
  }
  if (width <= 0 || height <= 0) {
    return;
  }
  float gradient_start_x = 0.0f;
  float gradient_start_y = 0.0f;
  float gradient_end_x = 0.0f;
  float gradient_end_y = 0.0f;
  if (!cheng_android_gpu_gradient_points(x, y, width, height, angle, &gradient_start_x, &gradient_start_y, &gradient_end_x, &gradient_end_y)) {
    CHENG_HOST_LOG_ERROR("unsupported gradient angle=%d", angle);
    abort();
  }
  // Radial gradient: center is a permille of the box, outer radius a permille of
  // the box diagonal (CSS radial-gradient default extent ~farthest-corner).
  float center_px = (float)x + (float)width * ((float)center_x_permille / 1000.0f);
  float center_py = (float)y + (float)height * ((float)center_y_permille / 1000.0f);
  float diag = sqrtf((float)width * (float)width + (float)height * (float)height);
  float outer_radius = diag * ((float)radius_permille / 1000.0f);
  float x0 = (float)x;
  float y0 = (float)y;
  float x1 = (float)(x + width);
  float y1 = (float)(y + height);
  const float vertices[] = {
    x0, y0, x1, y0, x0, y1,
    x1, y0, x1, y1, x0, y1
  };
  float start_color[4];
  float end_color[4];
  cheng_android_gpu_color_from_argb(start_argb, start_color);
  cheng_android_gpu_color_from_argb(end_argb, end_color);
  int clipped_radius = radius < 0 ? 0 : radius;
  glUseProgram(s_gl_gradient_program);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glUniform2f(s_gl_gradient_screen_loc, (float)screen_width, (float)screen_height);
  glUniform4f(s_gl_gradient_start_color_loc, start_color[0], start_color[1], start_color[2], start_color[3]);
  glUniform4f(s_gl_gradient_end_color_loc, end_color[0], end_color[1], end_color[2], end_color[3]);
  glUniform4f(s_gl_gradient_rect_loc, (float)x, (float)y, (float)width, (float)height);
  glUniform1f(s_gl_gradient_radius_loc, (float)clipped_radius);
  glUniform2f(s_gl_gradient_start_loc, gradient_start_x, gradient_start_y);
  glUniform2f(s_gl_gradient_end_loc, gradient_end_x, gradient_end_y);
  glUniform1i(s_gl_gradient_kind_loc, gradient_kind);
  glUniform2f(s_gl_gradient_center_loc, center_px, center_py);
  glUniform1f(s_gl_gradient_outer_radius_loc, outer_radius);
  glBindBuffer(GL_ARRAY_BUFFER, s_gl_vbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)sizeof(vertices), vertices, GL_STREAM_DRAW);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, (GLsizei)(2 * sizeof(float)), (const void*)0);
  glDrawArrays(GL_TRIANGLES, 0, 6);
}

static void cheng_android_rotated_uv(float u, float v, int rotation_degrees, float* out_u, float* out_v);

static void cheng_android_media_source_display_size(int source_width, int source_height, int rotation_degrees, int* out_width, int* out_height) {
  if (source_width <= 0 || source_height <= 0 || out_width == NULL || out_height == NULL) {
    abort();
  }
  int rotation = cheng_android_normalize_video_rotation_degrees(rotation_degrees);
  if (rotation == 90 || rotation == 270) {
    *out_width = source_height;
    *out_height = source_width;
  } else {
    *out_width = source_width;
    *out_height = source_height;
  }
}

static float cheng_android_clamp_unit_float(float value) {
  if (value < 0.0f) {
    return 0.0f;
  }
  if (value > 1.0f) {
    return 1.0f;
  }
  return value;
}

static void cheng_android_media_object_fit_rect(int source_width, int source_height, int rotation_degrees, int object_fit, int x, int y, int width, int height, int* out_x, int* out_y, int* out_width, int* out_height, float* out_left_u, float* out_right_u, float* out_top_v, float* out_bottom_v) {
  if (source_width <= 0 || source_height <= 0 || width <= 0 || height <= 0 ||
      out_x == NULL || out_y == NULL || out_width == NULL || out_height == NULL ||
      out_left_u == NULL || out_right_u == NULL || out_top_v == NULL || out_bottom_v == NULL) {
    abort();
  }
  int display_source_width = 0;
  int display_source_height = 0;
  cheng_android_media_source_display_size(source_width, source_height, rotation_degrees, &display_source_width, &display_source_height);
  *out_x = x;
  *out_y = y;
  *out_width = width;
  *out_height = height;
  *out_left_u = 0.0f;
  *out_right_u = 1.0f;
  *out_top_v = 0.0f;
  *out_bottom_v = 1.0f;
  if (object_fit == CHENG_ANDROID_MEDIA_OBJECT_FIT_FILL) {
    return;
  }
  if (object_fit == CHENG_ANDROID_MEDIA_OBJECT_FIT_CONTAIN) {
    if ((int64_t)display_source_width * (int64_t)height > (int64_t)width * (int64_t)display_source_height) {
      int fitted_height = (int)(((int64_t)width * (int64_t)display_source_height) / (int64_t)display_source_width);
      if (fitted_height <= 0) fitted_height = 1;
      *out_y = y + ((height - fitted_height) / 2);
      *out_height = fitted_height;
    } else {
      int fitted_width = (int)(((int64_t)height * (int64_t)display_source_width) / (int64_t)display_source_height);
      if (fitted_width <= 0) fitted_width = 1;
      *out_x = x + ((width - fitted_width) / 2);
      *out_width = fitted_width;
    }
    return;
  }
  if (object_fit != CHENG_ANDROID_MEDIA_OBJECT_FIT_COVER) {
    abort();
  }
  float display_crop_horizontal = 0.0f;
  float display_crop_vertical = 0.0f;
  if ((int64_t)display_source_width * (int64_t)height > (int64_t)width * (int64_t)display_source_height) {
    float visible = ((float)width * (float)display_source_height) / ((float)display_source_width * (float)height);
    display_crop_horizontal = (1.0f - cheng_android_clamp_unit_float(visible)) * 0.5f;
  } else {
    float visible = ((float)display_source_width * (float)height) / ((float)width * (float)display_source_height);
    display_crop_vertical = (1.0f - cheng_android_clamp_unit_float(visible)) * 0.5f;
  }
  int rotation = cheng_android_normalize_video_rotation_degrees(rotation_degrees);
  float crop_u = display_crop_horizontal;
  float crop_v = display_crop_vertical;
  if (rotation == 90 || rotation == 270) {
    crop_u = display_crop_vertical;
    crop_v = display_crop_horizontal;
  }
  *out_left_u = crop_u;
  *out_right_u = 1.0f - crop_u;
  *out_top_v = crop_v;
  *out_bottom_v = 1.0f - crop_v;
}

static void cheng_android_gpu_draw_texture_uv_rect(int screen_width, int screen_height, GLuint texture, int x, int y, int width, int height, float left_u, float top_v, float right_u, float bottom_v) {
  if (screen_width <= 0 || screen_height <= 0 || texture == 0u) {
    abort();
  }
  if (width <= 0 || height <= 0) {
    return;
  }
  float x0 = (float)x;
  float y0 = (float)y;
  float x1 = (float)(x + width);
  float y1 = (float)(y + height);
  const float vertices[] = {
    x0, y0, left_u, top_v,
    x1, y0, right_u, top_v,
    x0, y1, left_u, bottom_v,
    x1, y0, right_u, top_v,
    x1, y1, right_u, bottom_v,
    x0, y1, left_u, bottom_v
  };
  glUseProgram(s_gl_blit_program);
  glBlendFuncSeparate(GL_ONE, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glUniform2f(s_gl_blit_screen_loc, (float)screen_width, (float)screen_height);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, texture);
  glUniform1i(s_gl_blit_texture_loc, 0);
  glBindBuffer(GL_ARRAY_BUFFER, s_gl_vbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)sizeof(vertices), vertices, GL_STREAM_DRAW);
  glEnableVertexAttribArray(0);
  glEnableVertexAttribArray(1);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)0);
  glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)(2 * sizeof(float)));
  glDrawArrays(GL_TRIANGLES, 0, 6);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
}

static void cheng_android_gpu_draw_texture_uv(int screen_width, int screen_height, GLuint texture, int x, int y, int width, int height, int flip_y) {
  float top_v = flip_y ? 1.0f : 0.0f;
  float bottom_v = flip_y ? 0.0f : 1.0f;
  cheng_android_gpu_draw_texture_uv_rect(screen_width, screen_height, texture, x, y, width, height, 0.0f, top_v, 1.0f, bottom_v);
}

static void cheng_android_gpu_draw_texture(int screen_width, int screen_height, GLuint texture, int x, int y, int width, int height) {
  cheng_android_gpu_draw_texture_uv(screen_width, screen_height, texture, x, y, width, height, 0);
}

static void cheng_android_gpu_draw_texture_object_fit(int screen_width, int screen_height, GLuint texture, int x, int y, int width, int height, int source_width, int source_height, int object_fit) {
  int draw_x = x;
  int draw_y = y;
  int draw_width = width;
  int draw_height = height;
  float left_u = 0.0f;
  float right_u = 1.0f;
  float top_v = 0.0f;
  float bottom_v = 1.0f;
  cheng_android_media_object_fit_rect(source_width, source_height, 0, object_fit, x, y, width, height, &draw_x, &draw_y, &draw_width, &draw_height, &left_u, &right_u, &top_v, &bottom_v);
  cheng_android_gpu_draw_texture_uv_rect(screen_width, screen_height, texture, draw_x, draw_y, draw_width, draw_height, left_u, top_v, right_u, bottom_v);
}

// Rotation-aware 2D object-fit draw for the streamed ES texture. The publisher's ES
// frames may carry a display-matrix rotation (e.g. portrait video recorded landscape);
// cheng_android_media_object_fit_rect lays the card out at the ROTATED display aspect
// (it swaps source W/H for 90/270), and cheng_android_rotated_uv re-maps each corner's
// UV so the texels land upright. rotation==0 reduces exactly to the plain object_fit
// path (identity UV remap), so the still/legacy callers are unaffected.
static void cheng_android_gpu_draw_texture_object_fit_rot(int screen_width, int screen_height, GLuint texture, int x, int y, int width, int height, int source_width, int source_height, int object_fit, int rotation_degrees) {
  if (screen_width <= 0 || screen_height <= 0 || texture == 0u) {
    abort();
  }
  if (width <= 0 || height <= 0) {
    return;
  }
  int draw_x = x;
  int draw_y = y;
  int draw_width = width;
  int draw_height = height;
  float left_u = 0.0f;
  float right_u = 1.0f;
  float top_v = 0.0f;
  float bottom_v = 1.0f;
  cheng_android_media_object_fit_rect(source_width, source_height, rotation_degrees, object_fit, x, y, width, height, &draw_x, &draw_y, &draw_width, &draw_height, &left_u, &right_u, &top_v, &bottom_v);
  float uv00_u = left_u,  uv00_v = top_v;
  float uv10_u = right_u, uv10_v = top_v;
  float uv01_u = left_u,  uv01_v = bottom_v;
  float uv11_u = right_u, uv11_v = bottom_v;
  cheng_android_rotated_uv(left_u,  top_v,    rotation_degrees, &uv00_u, &uv00_v);
  cheng_android_rotated_uv(right_u, top_v,    rotation_degrees, &uv10_u, &uv10_v);
  cheng_android_rotated_uv(left_u,  bottom_v, rotation_degrees, &uv01_u, &uv01_v);
  cheng_android_rotated_uv(right_u, bottom_v, rotation_degrees, &uv11_u, &uv11_v);
  float x0 = (float)draw_x;
  float y0 = (float)draw_y;
  float x1 = (float)(draw_x + draw_width);
  float y1 = (float)(draw_y + draw_height);
  const float vertices[] = {
    x0, y0, uv00_u, uv00_v,
    x1, y0, uv10_u, uv10_v,
    x0, y1, uv01_u, uv01_v,
    x1, y0, uv10_u, uv10_v,
    x1, y1, uv11_u, uv11_v,
    x0, y1, uv01_u, uv01_v
  };
  glUseProgram(s_gl_blit_program);
  glBlendFuncSeparate(GL_ONE, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glUniform2f(s_gl_blit_screen_loc, (float)screen_width, (float)screen_height);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, texture);
  glUniform1i(s_gl_blit_texture_loc, 0);
  glBindBuffer(GL_ARRAY_BUFFER, s_gl_vbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)sizeof(vertices), vertices, GL_STREAM_DRAW);
  glEnableVertexAttribArray(0);
  glEnableVertexAttribArray(1);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)0);
  glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)(2 * sizeof(float)));
  glDrawArrays(GL_TRIANGLES, 0, 6);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
}

static void cheng_android_texture_transform_identity(float* out_transform) {
  if (out_transform == NULL) {
    abort();
  }
  for (int i = 0; i < 16; i++) {
    out_transform[i] = 0.0f;
  }
  out_transform[0] = 1.0f;
  out_transform[5] = 1.0f;
  out_transform[10] = 1.0f;
  out_transform[15] = 1.0f;
}

int cheng_android_normalize_video_rotation_degrees(int rotation_degrees) {
  int normalized = rotation_degrees % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  if (normalized == 90 || normalized == 180 || normalized == 270) {
    return normalized;
  }
  return 0;
}

static void cheng_android_rotated_uv(float u, float v, int rotation_degrees, float* out_u, float* out_v) {
  if (out_u == NULL || out_v == NULL) {
    abort();
  }
  int rotation = cheng_android_normalize_video_rotation_degrees(rotation_degrees);
  if (rotation == 90) {
    *out_u = v;
    *out_v = 1.0f - u;
  } else if (rotation == 180) {
    *out_u = 1.0f - u;
    *out_v = 1.0f - v;
  } else if (rotation == 270) {
    *out_u = 1.0f - v;
    *out_v = u;
  } else {
    *out_u = u;
    *out_v = v;
  }
}

static void cheng_android_gpu_draw_external_texture(int screen_width, int screen_height, GLuint texture, int x, int y, int width, int height, const float* texture_transform, int rotation_degrees) {
  if (screen_width <= 0 || screen_height <= 0 || texture == 0u) {
    abort();
  }
  if (width <= 0 || height <= 0) {
    return;
  }
  float x0 = (float)x;
  float y0 = (float)y;
  float x1 = (float)(x + width);
  float y1 = (float)(y + height);
  float uv00_u = 0.0f;
  float uv00_v = 1.0f;
  float uv10_u = 1.0f;
  float uv10_v = 1.0f;
  float uv01_u = 0.0f;
  float uv01_v = 0.0f;
  float uv11_u = 1.0f;
  float uv11_v = 0.0f;
  cheng_android_rotated_uv(0.0f, 1.0f, rotation_degrees, &uv00_u, &uv00_v);
  cheng_android_rotated_uv(1.0f, 1.0f, rotation_degrees, &uv10_u, &uv10_v);
  cheng_android_rotated_uv(0.0f, 0.0f, rotation_degrees, &uv01_u, &uv01_v);
  cheng_android_rotated_uv(1.0f, 0.0f, rotation_degrees, &uv11_u, &uv11_v);
  const float vertices[] = {
    x0, y0, uv00_u, uv00_v,
    x1, y0, uv10_u, uv10_v,
    x0, y1, uv01_u, uv01_v,
    x1, y0, uv10_u, uv10_v,
    x1, y1, uv11_u, uv11_v,
    x0, y1, uv01_u, uv01_v
  };
  glUseProgram(s_gl_external_blit_program);
  glBlendFuncSeparate(GL_ONE, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glUniform2f(s_gl_external_blit_screen_loc, (float)screen_width, (float)screen_height);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_EXTERNAL_OES, texture);
  glUniform1i(s_gl_external_blit_texture_loc, 0);
  float identity_transform[16];
  const float* transform = texture_transform;
  if (transform == NULL) {
    cheng_android_texture_transform_identity(identity_transform);
    transform = identity_transform;
  }
  glUniformMatrix4fv(s_gl_external_blit_tex_transform_loc, 1, GL_FALSE, transform);
  glBindBuffer(GL_ARRAY_BUFFER, s_gl_vbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)sizeof(vertices), vertices, GL_STREAM_DRAW);
  glEnableVertexAttribArray(0);
  glEnableVertexAttribArray(1);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)0);
  glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)(2 * sizeof(float)));
  glDrawArrays(GL_TRIANGLES, 0, 6);
  glBindTexture(GL_TEXTURE_EXTERNAL_OES, 0u);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
}

static void cheng_android_gpu_draw_external_texture_object_fit(int screen_width, int screen_height, GLuint texture, int x, int y, int width, int height, int source_width, int source_height, int object_fit, const float* texture_transform, int rotation_degrees) {
  if (screen_width <= 0 || screen_height <= 0 || texture == 0u) {
    abort();
  }
  if (width <= 0 || height <= 0) {
    return;
  }
  int draw_x = x;
  int draw_y = y;
  int draw_width = width;
  int draw_height = height;
  float left_u = 0.0f;
  float right_u = 1.0f;
  float top_v = 0.0f;
  float bottom_v = 1.0f;
  cheng_android_media_object_fit_rect(source_width, source_height, rotation_degrees, object_fit, x, y, width, height, &draw_x, &draw_y, &draw_width, &draw_height, &left_u, &right_u, &top_v, &bottom_v);
  float oes_top_v = 1.0f - top_v;
  float oes_bottom_v = 1.0f - bottom_v;
  float x0 = (float)draw_x;
  float y0 = (float)draw_y;
  float x1 = (float)(draw_x + draw_width);
  float y1 = (float)(draw_y + draw_height);
  float uv00_u = left_u;
  float uv00_v = oes_top_v;
  float uv10_u = right_u;
  float uv10_v = oes_top_v;
  float uv01_u = left_u;
  float uv01_v = oes_bottom_v;
  float uv11_u = right_u;
  float uv11_v = oes_bottom_v;
  cheng_android_rotated_uv(left_u, oes_top_v, rotation_degrees, &uv00_u, &uv00_v);
  cheng_android_rotated_uv(right_u, oes_top_v, rotation_degrees, &uv10_u, &uv10_v);
  cheng_android_rotated_uv(left_u, oes_bottom_v, rotation_degrees, &uv01_u, &uv01_v);
  cheng_android_rotated_uv(right_u, oes_bottom_v, rotation_degrees, &uv11_u, &uv11_v);
  const float vertices[] = {
    x0, y0, uv00_u, uv00_v,
    x1, y0, uv10_u, uv10_v,
    x0, y1, uv01_u, uv01_v,
    x1, y0, uv10_u, uv10_v,
    x1, y1, uv11_u, uv11_v,
    x0, y1, uv01_u, uv01_v
  };
  glUseProgram(s_gl_external_blit_program);
  glBlendFuncSeparate(GL_ONE, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glUniform2f(s_gl_external_blit_screen_loc, (float)screen_width, (float)screen_height);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_EXTERNAL_OES, texture);
  glUniform1i(s_gl_external_blit_texture_loc, 0);
  float identity_transform[16];
  const float* transform = texture_transform;
  if (transform == NULL) {
    cheng_android_texture_transform_identity(identity_transform);
    transform = identity_transform;
  }
  glUniformMatrix4fv(s_gl_external_blit_tex_transform_loc, 1, GL_FALSE, transform);
  glBindBuffer(GL_ARRAY_BUFFER, s_gl_vbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)sizeof(vertices), vertices, GL_STREAM_DRAW);
  glEnableVertexAttribArray(0);
  glEnableVertexAttribArray(1);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)0);
  glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)(2 * sizeof(float)));
  glDrawArrays(GL_TRIANGLES, 0, 6);
  glBindTexture(GL_TEXTURE_EXTERNAL_OES, 0u);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
}

static void cheng_android_gpu_draw_framebuffer_texture(int screen_width, int screen_height, GLuint texture, int x, int y, int width, int height) {
  cheng_android_gpu_draw_texture_uv(screen_width, screen_height, texture, x, y, width, height, 1);
}

static ChengAndroidImageTextureCache* cheng_android_find_image_texture(int texture_id) {
  if (texture_id <= 0) {
    return NULL;
  }
  for (int i = 0; i < CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP; i++) {
    if (s_image_textures[i].valid && s_image_textures[i].texture_id == texture_id) {
      return &s_image_textures[i];
    }
  }
  return NULL;
}

static int cheng_android_image_texture_uploaded(int texture_id) {
  return cheng_android_find_image_texture(texture_id) != NULL;
}

static void cheng_android_gpu_upload_image_texture(ChengAndroidImageTextureCache* texture) {
  if (texture == NULL || !texture->valid || texture->pixels == NULL || texture->width <= 0 || texture->height <= 0 || texture->pixel_count != texture->width * texture->height) {
    abort();
  }
  if (texture->gl_texture == 0u) {
    glGenTextures(1, &texture->gl_texture);
    cheng_android_gl_abort_if_false(texture->gl_texture != 0u, "glGenTextures image failed");
  }
  glBindTexture(GL_TEXTURE_2D, texture->gl_texture);
  glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, texture->width, texture->height, 0, GL_RGBA, GL_UNSIGNED_BYTE, texture->pixels);
  texture->gl_uploaded = 1;
}

static void cheng_android_gpu_draw_image_texture(int screen_width, int screen_height, int x, int y, int width, int height, int texture_id) {
  if (screen_width <= 0 || screen_height <= 0 || width <= 0 || height <= 0 || texture_id <= 0) {
    abort();
  }
  ChengAndroidImageTextureCache* texture = cheng_android_find_image_texture(texture_id);
  if (texture == NULL || texture->pixels == NULL) {
    abort();
  }
  if (!texture->gl_uploaded || texture->gl_texture == 0u) {
    cheng_android_gpu_upload_image_texture(texture);
  }
  cheng_android_gpu_draw_texture(screen_width, screen_height, texture->gl_texture, x, y, width, height);
}

static ChengAndroidMediaTextureCache* cheng_android_find_media_texture(int kind_code, int surface_kind, int texture_provider, int slot_hash, int asset_hash, int manifest_hash, int poster_hash) {
  if (kind_code <= 0 || surface_kind <= 0 || texture_provider <= 0 || slot_hash <= 0 || asset_hash <= 0 || manifest_hash <= 0 || poster_hash <= 0) {
    return NULL;
  }
  for (int i = 0; i < CHENG_ANDROID_MEDIA_TEXTURE_CACHE_CAP; i++) {
    if (s_media_textures[i].valid &&
        s_media_textures[i].kind_code == kind_code &&
        s_media_textures[i].surface_kind == surface_kind &&
        s_media_textures[i].texture_provider == texture_provider &&
        s_media_textures[i].slot_hash == slot_hash &&
        s_media_textures[i].asset_hash == asset_hash &&
        s_media_textures[i].manifest_hash == manifest_hash &&
        s_media_textures[i].poster_hash == poster_hash) {
      return &s_media_textures[i];
    }
  }
  return NULL;
}

static ChengAndroidMediaTextureCache* cheng_android_find_or_allocate_media_texture(int kind_code, int surface_kind, int texture_provider, int slot_hash, int asset_hash, int manifest_hash, int poster_hash) {
  ChengAndroidMediaTextureCache* existing = cheng_android_find_media_texture(kind_code, surface_kind, texture_provider, slot_hash, asset_hash, manifest_hash, poster_hash);
  if (existing != NULL) {
    return existing;
  }
  for (int i = 0; i < CHENG_ANDROID_MEDIA_TEXTURE_CACHE_CAP; i++) {
    if (!s_media_textures[i].valid) {
      return &s_media_textures[i];
    }
  }
  return NULL;
}

static ChengAndroidMediaTextureCache* cheng_android_media_texture_for_command(const int32_t* cmd) {
  if (cmd == NULL) {
    return NULL;
  }
  return cheng_android_find_media_texture((int)cmd[0], (int)cmd[1], (int)cmd[2], (int)cmd[12], (int)cmd[13], (int)cmd[14], (int)cmd[15]);
}

void cheng_media_diag(const char* line) {
  __android_log_print(ANDROID_LOG_INFO, "ChengMD", "%{public}s", line);
}

// Resident set size (KB) from /proc/self/statm (field 2 = resident pages). Cold path only
// (endurance export + first present), so the per-call fopen is fine.
int64_t cheng_read_rss_kb(void) {
  FILE* f = fopen("/proc/self/statm", "r");
  if (f == NULL) return 0;
  long total_pages = 0, res_pages = 0;
  int got = fscanf(f, "%ld %ld", &total_pages, &res_pages);
  fclose(f);
  if (got != 2) return 0;
  long pg = sysconf(_SC_PAGESIZE);
  if (pg <= 0) pg = 4096;
  return (int64_t)res_pages * (int64_t)(pg / 1024);
}

GLuint cheng_gl_compile_shader(GLenum type, const char* src) {
  GLuint s = glCreateShader(type);
  glShaderSource(s, 1, &src, NULL);
  glCompileShader(s);
  GLint ok = 0; glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
  if (!ok) {
    char log[512]; GLsizei n = 0; glGetShaderInfoLog(s, sizeof(log), &n, log);
    char b[600]; snprintf(b, sizeof(b), "surface shader compile FAIL: %s", log); cheng_media_diag(b);
    glDeleteShader(s); return 0u;
  }
  return s;
}

// Queries the App core's real generated route table (s_app_debug_route_is_fullscreen_video,
// dlsym-bound at App load) for whether routeIndex is a fullscreen video detail — the same
// question CHENG_ROUTE_CONTENT_DETAIL_FIRST/LAST + bare `cur_route == 1` used to answer with
// a host-side literal (M1 slice-5). Symbol missing (stale .o, already logged loudly at bind
// time) or no active route (routeIndex < 0) both fail safe to "not fullscreen video" — never
// a silent guess.
static int cheng_gui_host_route_is_fullscreen_video(int routeIndex) {
  if (s_app_debug_route_is_fullscreen_video == NULL || routeIndex < 0) return 0;
  return s_app_debug_route_is_fullscreen_video(routeIndex) != 0;
}

// #14-eos v2: one-shot EOS side effects (audio Stop + endurance report + vsync disengage) —
// factored out of cheng_android_gpu_draw_registered_media_surfaces below so BOTH its render
// paths (the s_surf_mode==1 zero-copy GPU path AND the s_surf_mode==0 CPU NV12->RGBA
// fallback path — a device that never established a zero-copy surface) fire the identical
// one-shot sequence once the source is truly exhausted, instead of only the GPU path having
// it. Before this, a CPU-fallback session never latched this: vsync never disengaged (stayed
// pinned to the render loop's per-frame cadence forever), the ES audio renderer never
// Stopped, and the "eos" endurance-report line never produced — a resource/audit gap
// specific to the device population that needs the CPU fallback. s_stream_eos_logged is the
// pre-existing one-shot gate (unchanged); this just factors its body out to a single copy.
static void cheng_stream_eos_fire_once(int last_frame_idx) {
  if (s_stream_eos_logged) return;
  s_stream_eos_logged = 1;
  char eb[64]; snprintf(eb, sizeof(eb), "playback_eos frame=%d", last_frame_idx);
  cheng_media_diag(eb);
  // Video + audio finish at the SAME point: the local player was created looping, so a
  // one-shot Stop here freezes the audio on the final frame instead of restarting.
  if (s_audio_player != NULL) OH_AVPlayer_Stop(s_audio_player);
  // #14-eos: freezes the NETWORK ES audio renderer at the same instant (no-op if this
  // session never engaged ES audio — see cheng_audio_es_stop_at_eos's own header comment
  // for why Stop, not Release, is correct here).
  cheng_audio_es_stop_at_eos();
  cheng_endurance_report("eos");
  cheng_video_vsync_disengage();  // clip finished: fall back to event-driven pacing
}

static void cheng_android_gpu_draw_registered_media_surfaces(int screen_width, int screen_height, int pass) {
  // Composite each registered media-surface texture on top of the base scene at
  // its card rect. Runs after the layer caches are blitted to the default
  // framebuffer and before eglSwapBuffers (called from present_compositor_frame),
  // so the still frame lands on screen in the same presented frame. The command
  // batch (rects + asset hashes) is the one cached by present_media_surface_commands;
  // the GL texture comes from prepare_media_surface_texture via register_*.
  int count = s_media_surface_command_word_count / CHENG_ANDROID_MEDIA_SURFACE_HOST_STRIDE_I32;
  static int s_media_draw_log = 0;
  int drawn = 0;
  for (int i = 0; i < count; i++) {
    const int32_t* cmd = &s_media_surface_command_words[i * CHENG_ANDROID_MEDIA_SURFACE_HOST_STRIDE_I32];
    int kind_code = (int)cmd[0];
    int surface_kind = (int)cmd[1];
    int texture_provider = (int)cmd[2];
    int route_index = (int)cmd[3];
    int x = (int)cmd[6];
    int y = (int)cmd[7];
    int w = (int)cmd[8];
    int h = (int)cmd[9];
    int playback_state = (int)cmd[10];
    int object_fit = (int)cmd[11];
    int slot_hash = (int)cmd[12];
    int asset_hash = (int)cmd[13];
    int manifest_hash = (int)cmd[14];
    int poster_hash = (int)cmd[15];
    ChengAndroidMediaTextureCache* texture = cheng_android_find_media_texture(
        kind_code, surface_kind, texture_provider, slot_hash, asset_hash, manifest_hash, poster_hash);
    // MoQ streaming consumer (shared single stream for all video cards): once the
    // background worker has the decoder up, pop one decoded RGBA frame per frame
    // period (globally, not per-card) into the shared stream texture, then point
    // this video card at it. The render loop never blocks — if no frame is due/
    // ready it holds the current one. Smooth, complete, looping playback.
    // Frame-advance gate probe (1 Hz): the 2026-07-25 emulator freeze showed video frames
    // never advancing (identical screenshots 2s apart, zero cheng_surface_consume calls)
    // with NO log signal for WHICH conjunct below was false. Rate-limited so it can stay.
    if (kind_code == CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE) {
      static int64_t s_advgate_last_ns = 0;
      int64_t advgate_now_ns = cheng_monotime_ns();
      if (advgate_now_ns - s_advgate_last_ns >= 1000000000LL) {
        s_advgate_last_ns = advgate_now_ns;
        char gb[192];
        snprintf(gb, sizeof(gb),
                 "ADVGATE tex=%d valid=%d ready=%d ctx=%d mode=%d paused=%d eos=%d last_idx=%lld base=%d",
                 texture != NULL, texture != NULL ? texture->valid : -1,
                 __atomic_load_n(&s_stream_ready, __ATOMIC_SEQ_CST), s_stream_ctx != NULL,
                 s_surf_mode, s_stream_paused, s_stream_eos,
                 (long long)s_stream_last_frame_idx, s_stream_play_base_ns != 0);
        cheng_media_diag(gb);
      }
    }
    if (kind_code == CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE &&
        texture != NULL && texture->valid &&
        __atomic_load_n(&s_stream_ready, __ATOMIC_SEQ_CST) && s_stream_ctx != NULL) {
      ChengStreamCtx* sc = s_stream_ctx;
      int64_t now_ns = cheng_monotime_ns();
      double fps = sc->fps > 0.0 ? sc->fps : 30.0;
      int64_t period_ns = (int64_t)(1.0e9 / fps);
      // #14-eos v2: EOS-latch bookkeeping (s_stream_eos, sticky once set) hoisted OUT of the
      // s_surf_mode split below — it only reads sc->fq_mu/sc->mu state, nothing GPU-specific
      // — so BOTH the zero-copy GPU path and the CPU fallback path see the identical latch
      // instead of only the GPU branch computing it (see cheng_stream_eos_fire_once's own
      // comment for why the CPU path previously never got this at all).
      if (!s_stream_eos && s_stream_src_eof) {
        int fq_empty, ring_empty;
        pthread_mutex_lock(&sc->fq_mu); fq_empty = (sc->fq_size == 0); pthread_mutex_unlock(&sc->fq_mu);
        pthread_mutex_lock(&sc->mu); ring_empty = (sc->ring_size == 0); pthread_mutex_unlock(&sc->mu);
        if (fq_empty && ring_empty) s_stream_eos = 1;
      }
      if (s_surf_mode) {
        // Zero-copy GPU path: advance the displayed frame by WALL-CLOCK time (not by a
        // tick-quantized period gate). idx = elapsed*fps; pull a new surface frame only when
        // idx crosses an integer → the video runs at exactly fps regardless of loop rate.
        if (s_stream_play_base_ns == 0) s_stream_play_base_ns = now_ns;
        if (!s_stream_paused) {
          int64_t idx = ((now_ns - s_stream_play_base_ns) * (int64_t)(fps + 0.5)) / 1000000000LL;
          if (s_stream_eos && sc->frame_count > 0 && idx >= (int64_t)(sc->frame_count - 1)) {
            // Wall clock reached the last frame at EOS: clamp + STOP consuming, so the surface
            // holds the final decoded frame (no re-consume, no black) — smooth end of the clip.
            cheng_stream_eos_fire_once(sc->frame_count - 1);
          } else if (s_stream_last_frame_idx < 0 || idx > s_stream_last_frame_idx) {
            // 修5: t1 only when a REAL frame was consumed — the old unconditional stamp let
            // "open_to_first_frame 347ms" print while zero frames had ever hit the surface.
            if (cheng_surface_consume(sc->w, sc->h) == 1 && s_ff_first_sink_ns == 0) {
              s_ff_first_sink_ns = now_ns;  // 秒开 t1 (zero-copy surface path)
            }
            s_stream_last_frame_idx = idx;
          }
        }
      } else if (!s_stream_paused && (s_stream_last_consume_ns == 0 || now_ns - s_stream_last_consume_ns >= period_ns)) {
        unsigned char* frame = NULL;
        pthread_mutex_lock(&sc->mu);
        if (sc->ring_size > 0) {
          frame = sc->ring[sc->ring_head];
          sc->ring_head = (sc->ring_head + 1) % CHENG_STREAM_RING_CAP;
          sc->ring_size--;
          pthread_cond_signal(&sc->cv_notfull);
        }
        pthread_mutex_unlock(&sc->mu);
        if (frame != NULL) {
          if (s_ff_first_sink_ns == 0) s_ff_first_sink_ns = now_ns;  // 秒开 t1 (CPU ring path)
          if (s_stream_tex == 0u) {
            glGenTextures(1, &s_stream_tex);
            glBindTexture(GL_TEXTURE_2D, s_stream_tex);
            glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
            glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, sc->w, sc->h, 0, GL_RGBA, GL_UNSIGNED_BYTE, frame);
          } else {
            glBindTexture(GL_TEXTURE_2D, s_stream_tex);
            glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
            glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, sc->w, sc->h, GL_RGBA, GL_UNSIGNED_BYTE, frame);
          }
          glBindTexture(GL_TEXTURE_2D, 0u);
          pthread_mutex_lock(&sc->mu);              // return the buffer to the pool (no free)
          sc->pool[sc->pool_top++] = frame;
          pthread_mutex_unlock(&sc->mu);
          s_stream_last_consume_ns = now_ns;
        } else if (s_stream_eos && sc->frame_count > 0) {
          // #14-eos v2: CPU fallback's equivalent of the GPU branch's wall-clock "reached the
          // last frame" gate above — there is no analogous ambiguity to wait out here: every
          // successful ring pop above already displayed that exact frame directly (no
          // zero-copy "decoded ahead of what's shown" gap), so the moment the ring is
          // observed empty (frame == NULL) with s_stream_eos already latched, the last
          // texture uploaded above already IS the final frame — fire immediately.
          cheng_stream_eos_fire_once(sc->frame_count - 1);
        }
      }
      if (s_stream_tex != 0u) {
        texture->gl_texture = s_stream_tex;
        texture->width = sc->w;
        texture->height = sc->h;
      }
    } else if (texture != NULL && texture->valid && texture->video_frames != NULL &&
        texture->video_frame_count > 0 && texture->video_fps > 0) {
      // Legacy decode-all frame-paced path (kept for non-streamed clips).
      if (texture->video_start_ns == 0) { texture->video_start_ns = cheng_monotime_ns(); }
      int64_t elapsed_ns = cheng_monotime_ns() - texture->video_start_ns;
      if (elapsed_ns < 0) elapsed_ns = 0;
      int64_t fidx = (elapsed_ns * (int64_t)texture->video_fps) / 1000000000LL;
      int cur = (int)(fidx % (int64_t)texture->video_frame_count);
      texture->gl_texture = texture->video_frames[cur];
    }
    int found = (texture != NULL && texture->valid && texture->gl_texture != 0u &&
                 texture->width > 0 && texture->height > 0) ? 1 : 0;
    if (s_media_draw_log < 200) {
      int dbg_route = s_app_debug_route_index ? s_app_debug_route_index() : -1;
      char buf[256];
      snprintf(buf, sizeof(buf), "DRAW route=%d cmd%d kind=%d found=%d rect=%d,%d,%d,%d slot=%d asset=%d screen=%dx%d",
               dbg_route, i, kind_code, found, x, y, w, h, slot_hash, asset_hash, screen_width, screen_height);
      cheng_media_diag(buf);
      s_media_draw_log++;
    }
    // Composite in the overlay pass (pass 1, after the scene layers) so a PLAYING/SEEKED
    // fullscreen video lands on top — verified-clean playback, unchanged. A video card that
    // is NOT playing (home feed, poster-only) instead composites in the background pass
    // (pass 0, before the scene layers) so the scene's own ▶ icon — part of the layer
    // commands rendered between pass 0 and pass 1 below — stays on top of the poster
    // instead of being covered by it. Non-video kinds (image/audio) keep the original
    // always-pass-1 placement; only the video kind's not-playing case moves.
    int video_kind = (kind_code == CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE);
    int video_playing = (playback_state == CHENG_ANDROID_MEDIA_PLAYBACK_PLAYING ||
                          playback_state == CHENG_ANDROID_MEDIA_PLAYBACK_SEEKED);
    // Narrowed after adversarial review (wf_72848617-bdb breaksFound): only the home-feed
    // poster-only case may composite in pass 0. On the video-detail routes (15/16) a user
    // CAN pause (WebSceneMediaControlActionAllowedForKind permits Pause for VIDEO), and a
    // paused fullscreen video must stay in the verified pass-1 overlay — not fall into the
    // previously-never-exercised pass-0 path underneath the detail page's UI layers.
    int on_detail_route = (route_index == 15 || route_index == 16);
    int pass_match = (video_kind && !video_playing && !on_detail_route) ? (pass == 0) : (pass == 1);
    if (found && w > 0 && h > 0 && pass_match) {
      // Streamed ES video: draw at the ES display rotation (covers BOTH the OES zero-copy
      // and the CPU-ring consume paths — both converge on texture->gl_texture==s_stream_tex).
      // The source dims are the ES native w/h; the object-fit+rotated-UV math swaps them for
      // 90/270 so the card lays out upright. Other media (images, legacy decode-all) keep the
      // plain non-rotated path (their textures are already upright RGBA).
      int es_rot = 0;
      if (kind_code == CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE &&
          texture->gl_texture == s_stream_tex && s_stream_ctx != NULL) {
        es_rot = s_stream_ctx->es_rotation;
        // 秒开 t2 + one-shot segment report: first time the streamed texture composites.
        if (!s_ff_reported && s_ff_first_present_ns == 0 && s_ff_t0_spawn_ns != 0) {
          s_ff_first_present_ns = cheng_monotime_ns();
          int64_t total_ms = (s_ff_first_present_ns - s_ff_t0_spawn_ns) / 1000000LL;
          int64_t dial_ms = (s_ff_dial_done_ns > s_ff_dial_start_ns && s_ff_dial_start_ns != 0)
              ? (s_ff_dial_done_ns - s_ff_dial_start_ns) / 1000000LL : 0;
          int64_t index_ms = (s_ff_index_done_ns > s_ff_dial_done_ns && s_ff_dial_done_ns != 0)
              ? (s_ff_index_done_ns - s_ff_dial_done_ns) / 1000000LL : 0;
          int64_t fetch_decode_ms = (s_ff_first_sink_ns > s_ff_index_done_ns && s_ff_index_done_ns != 0)
              ? (s_ff_first_sink_ns - s_ff_index_done_ns) / 1000000LL : 0;
          int64_t present_ms = (s_ff_first_sink_ns != 0 && s_ff_first_present_ns > s_ff_first_sink_ns)
              ? (s_ff_first_present_ns - s_ff_first_sink_ns) / 1000000LL : 0;
          int64_t spawn_ms = (s_ff_dial_start_ns > s_ff_t0_spawn_ns && s_ff_dial_start_ns != 0)
              ? (s_ff_dial_start_ns - s_ff_t0_spawn_ns) / 1000000LL : 0;
          char fb[280];
          // Legacy segment line (device-perf-oracle RE_OPEN_TO_FIRST_FRAME) + S3 plan
          // t0/t1/t2 fields on the same sink: t0=spawn(tap→route), t1=first sink,
          // t2=first present (cumulative ms from t0).
          int64_t t0_ms = 0;
          int64_t t1_ms = (s_ff_first_sink_ns > s_ff_t0_spawn_ns && s_ff_first_sink_ns != 0)
              ? (s_ff_first_sink_ns - s_ff_t0_spawn_ns) / 1000000LL : 0;
          int64_t t2_ms = total_ms;
          snprintf(fb, sizeof(fb),
                   "open_to_first_frame route=%d total_ms=%lld spawn_ms=%lld dial_ms=%lld index_ms=%lld fetch_decode_ms=%lld present_ms=%lld t0_ms=%lld t1_ms=%lld t2_ms=%lld",
                   s_fetch_route, (long long)total_ms, (long long)spawn_ms, (long long)dial_ms,
                   (long long)index_ms, (long long)fetch_decode_ms, (long long)present_ms,
                   (long long)t0_ms, (long long)t1_ms, (long long)t2_ms);
          cheng_media_diag(fb);
          s_ff_reported = 1;
        }
      }
      if (es_rot != 0) {
        cheng_android_gpu_draw_texture_object_fit_rot(screen_width, screen_height, texture->gl_texture,
                                                      x, y, w, h, texture->width, texture->height, object_fit, es_rot);
      } else {
        cheng_android_gpu_draw_texture_object_fit(screen_width, screen_height, texture->gl_texture,
                                                  x, y, w, h, texture->width, texture->height, object_fit);
      }
      drawn++;
    }
  }
  // Stream teardown on route-leave (runs once, in the overlay pass after the layers):
  // left the fullscreen video (back to home/feed) while a stream is still running →
  // tear it down so the NEXT card tapped spawns its own source fresh. Switching cards
  // always passes through home, so this is the swap point. Render thread + EGL current
  // here, required to free the surface GL resources.
  // v4: `cur_route == 14` removed — device-verified DEAD/WRONG, not "胡广生 detail".
  // route-reachability.json index 14 = home_channel_manager_open (an unrelated,
  // non-video screen); keeping the comparison would misfire is_fullscreen_video=1
  // there (wrong back-button overlay + wrong teardown gating) if that screen is ever
  // visited.
  // M1 slice-5 (2026-07-10): the route-index check below now queries the App core's own
  // generated route table (cheng_gui_host_route_is_fullscreen_video) instead of a host-side
  // literal range — it automatically covers however many per-card fan-out routes the
  // current fixture has, not just the two the range used to be hand-set to.
  if (pass == 1) {
    int cur_route = s_app_debug_route_index ? s_app_debug_route_index() : -1;
    int is_fullscreen_video = cheng_gui_host_route_is_fullscreen_video(cur_route);
    if (!is_fullscreen_video && (s_stream_starting || s_stream_ctx != NULL)) {
      cheng_stream_teardown_active();
    }
    // Back button on top of the fullscreen video (video covers the scene's own back).
    if (drawn > 0 && is_fullscreen_video) {
      cheng_android_gpu_draw_video_back_overlay(screen_width, screen_height);
    } else {
      s_video_back_btn_w = 0;
    }
  }
  static int s_media_draw_sum_log = 0;
  if (s_media_draw_sum_log < 8) {
    char buf[160];
    snprintf(buf, sizeof(buf), "DRAW_REGISTERED wordcount=%d count=%d drawn=%d",
             s_media_surface_command_word_count, count, drawn);
    cheng_media_diag(buf);
    s_media_draw_sum_log++;
  }
}
static int cheng_android_hash31(const char* text) {
  if (text == NULL || text[0] == 0) {
    return -1;
  }
  uint64_t hash = 216613626ull;
  for (const unsigned char* p = (const unsigned char*)text; *p != 0; p++) {
    hash = (hash * 16777619ull + (uint64_t)(*p)) & 2147483647ull;
  }
  int out = (int)hash;
  return out <= 0 ? 1 : out;
}

static int cheng_android_is_hex_sha256(const char* text) {
  if (text == NULL || strlen(text) != 64u) {
    return 0;
  }
  for (int i = 0; i < 64; i++) {
    char ch = text[i];
    int hex = (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f');
    if (!hex) {
      return 0;
    }
  }
  return 1;
}

int cheng_mobile_host_register_media_surface_texture(int kindCode, int surfaceKind, int textureProvider, int slotHash, int assetHash, int manifestHash, int posterHash, unsigned int glTexture, int width, int height, int pixelFormat);
#define CHENG_DEC_MAX_FRAMES 600
typedef struct {
  OH_AVDemuxer* demux;
  uint32_t vTrack;
  pthread_mutex_t mu;
  pthread_cond_t cv;
  int captured;
  int input_eos;
  unsigned char* nv12;
  int w, h, stride, slice;
  // All-frames capture (collect_all=1): every decoded frame is converted to RGBA
  // in presentation order so the render loop can play the clip back frame-paced.
  int collect_all;
  int output_eos;
  unsigned char* frames[CHENG_DEC_MAX_FRAMES];
  int frame_count;
} ChengDecCtx;

// NV12 (stride/slice layout) -> tightly packed RGBA8 (w*h*4), caller frees.
// NV12→RGBA is the playback bottleneck: 1304x2320 = 3.03M px/frame of scalar YUV→RGB
// single-threaded costs ~68ms/frame (= 14.5fps, half the 30fps source). Rows are
// independent, so split them across cores: each worker converts a [y0,y1) band.
typedef struct {
  const uint8_t* Y; const uint8_t* UV; unsigned char* rgba;
  int w; int stride; int y0; int y1;
} ChengNv12Band;
static void cheng_nv12_band(const ChengNv12Band* bd) {
  const uint8_t* Y = bd->Y; const uint8_t* UV = bd->UV;
  unsigned char* rgba = bd->rgba; int w = bd->w, stride = bd->stride;
  for (int y = bd->y0; y < bd->y1; y++) {
    const uint8_t* Yr = Y + (size_t)y * stride;
    const uint8_t* UVr = UV + (size_t)(y >> 1) * stride;
    unsigned char* orow = rgba + (size_t)y * (size_t)w * 4;
    int x = 0;
#ifdef CHENG_HAS_NEON
    // SIMD bulk: 16 luma px/iter. 8 chroma pairs (16 UV bytes) cover the 16 luma. Q7
    // BT.601 coeffs (×128) kept in int16 (max 227*127=28829 < 32767). vqmovun saturates
    // to [0,255]. ~6-8x the scalar inner loop, so playback is no longer conversion-bound.
    const int16x8_t c179 = vdupq_n_s16(179);  // 1.402*128  (R += c179*V)
    const int16x8_t c44  = vdupq_n_s16(44);   // 0.344*128  (G -= c44*U)
    const int16x8_t c91  = vdupq_n_s16(91);   // 0.714*128  (G -= c91*V)
    const int16x8_t c227 = vdupq_n_s16(227);  // 1.772*128  (B += c227*U)
    const int16x8_t bias = vdupq_n_s16(128);
    const uint8x16_t a255 = vdupq_n_u8(255);
    for (; x + 16 <= w; x += 16) {
      uint8x16_t Yp = vld1q_u8(Yr + x);
      uint8x8x2_t uvd = vld2_u8(UVr + x);          // val[0]=8 U, val[1]=8 V
      uint8x8x2_t uu = vzip_u8(uvd.val[0], uvd.val[0]);  // each U twice → 16
      uint8x8x2_t vv = vzip_u8(uvd.val[1], uvd.val[1]);
      uint8x16_t Up = vcombine_u8(uu.val[0], uu.val[1]);
      uint8x16_t Vp = vcombine_u8(vv.val[0], vv.val[1]);
      int16x8_t Ylo = vreinterpretq_s16_u16(vmovl_u8(vget_low_u8(Yp)));
      int16x8_t Yhi = vreinterpretq_s16_u16(vmovl_u8(vget_high_u8(Yp)));
      int16x8_t Ulo = vsubq_s16(vreinterpretq_s16_u16(vmovl_u8(vget_low_u8(Up))), bias);
      int16x8_t Uhi = vsubq_s16(vreinterpretq_s16_u16(vmovl_u8(vget_high_u8(Up))), bias);
      int16x8_t Vlo = vsubq_s16(vreinterpretq_s16_u16(vmovl_u8(vget_low_u8(Vp))), bias);
      int16x8_t Vhi = vsubq_s16(vreinterpretq_s16_u16(vmovl_u8(vget_high_u8(Vp))), bias);
      int16x8_t Rlo = vaddq_s16(Ylo, vshrq_n_s16(vmulq_s16(Vlo, c179), 7));
      int16x8_t Rhi = vaddq_s16(Yhi, vshrq_n_s16(vmulq_s16(Vhi, c179), 7));
      int16x8_t Glo = vsubq_s16(vsubq_s16(Ylo, vshrq_n_s16(vmulq_s16(Ulo, c44), 7)), vshrq_n_s16(vmulq_s16(Vlo, c91), 7));
      int16x8_t Ghi = vsubq_s16(vsubq_s16(Yhi, vshrq_n_s16(vmulq_s16(Uhi, c44), 7)), vshrq_n_s16(vmulq_s16(Vhi, c91), 7));
      int16x8_t Blo = vaddq_s16(Ylo, vshrq_n_s16(vmulq_s16(Ulo, c227), 7));
      int16x8_t Bhi = vaddq_s16(Yhi, vshrq_n_s16(vmulq_s16(Uhi, c227), 7));
      uint8x16x4_t out;
      out.val[0] = vcombine_u8(vqmovun_s16(Rlo), vqmovun_s16(Rhi));
      out.val[1] = vcombine_u8(vqmovun_s16(Glo), vqmovun_s16(Ghi));
      out.val[2] = vcombine_u8(vqmovun_s16(Blo), vqmovun_s16(Bhi));
      out.val[3] = a255;
      vst4q_u8(orow + (size_t)x * 4, out);
    }
#endif
    for (; x < w; x++) {
      int Yv = Yr[x];
      int Uv = UVr[(x & ~1)] - 128;
      int Vv = UVr[(x & ~1) + 1] - 128;
      int r = Yv + ((91881 * Vv) >> 16);
      int g = Yv - ((22554 * Uv) >> 16) - ((46802 * Vv) >> 16);
      int b = Yv + ((116130 * Uv) >> 16);
      if (r < 0) r = 0; else if (r > 255) r = 255;
      if (g < 0) g = 0; else if (g > 255) g = 255;
      if (b < 0) b = 0; else if (b > 255) b = 255;
      size_t o = (size_t)x * 4;
      orow[o] = (unsigned char)r; orow[o + 1] = (unsigned char)g; orow[o + 2] = (unsigned char)b; orow[o + 3] = 255;
    }
  }
}
static void* cheng_nv12_band_thread(void* arg) { cheng_nv12_band((const ChengNv12Band*)arg); return NULL; }
// Convert NV12 → RGBA into a CALLER-PROVIDED buffer (reused from a pool, so no
// per-frame malloc/page-fault). Splits rows across cores.
void cheng_nv12_to_rgba_into(unsigned char* rgba, const uint8_t* nv12, int w, int h, int stride, int slice) {
  if (rgba == NULL || nv12 == NULL || w <= 0 || h <= 0) return;
  const uint8_t* Y = nv12;
  const uint8_t* UV = nv12 + (size_t)stride * (size_t)slice;
  long ncpu = sysconf(_SC_NPROCESSORS_ONLN);
  int nthreads = (int)ncpu;
  if (nthreads < 1) nthreads = 1;
  if (nthreads > 6) nthreads = 6;          // leave cores for HW decode / render / fetch
  if (h < nthreads * 16) nthreads = 1;     // tiny frames: not worth the thread spawn
  ChengNv12Band bands[6];
  pthread_t tids[6];
  int rows = h / nthreads;
  rows &= ~1;                              // keep band starts on even rows (UV is 2x2 subsampled)
  if (rows < 1) { nthreads = 1; }
  int y = 0;
  for (int t = 0; t < nthreads; t++) {
    int y1 = (t == nthreads - 1) ? h : (y + rows);
    bands[t].Y = Y; bands[t].UV = UV; bands[t].rgba = rgba;
    bands[t].w = w; bands[t].stride = stride; bands[t].y0 = y; bands[t].y1 = y1;
    y = y1;
  }
  int spawned[6] = {0};
  for (int t = 1; t < nthreads; t++) {
    if (pthread_create(&tids[t], NULL, cheng_nv12_band_thread, &bands[t]) == 0) spawned[t] = 1;
    else cheng_nv12_band(&bands[t]);
  }
  cheng_nv12_band(&bands[0]);
  for (int t = 1; t < nthreads; t++) if (spawned[t]) pthread_join(tids[t], NULL);
}
static unsigned char* cheng_nv12_to_rgba(const uint8_t* nv12, int w, int h, int stride, int slice) {
  if (nv12 == NULL || w <= 0 || h <= 0) return NULL;
  unsigned char* rgba = (unsigned char*)malloc((size_t)w * (size_t)h * 4);
  if (rgba == NULL) return NULL;
  const uint8_t* Y = nv12;
  const uint8_t* UV = nv12 + (size_t)stride * (size_t)slice;
  long ncpu = sysconf(_SC_NPROCESSORS_ONLN);
  int nthreads = (int)ncpu;
  if (nthreads < 1) nthreads = 1;
  if (nthreads > 6) nthreads = 6;          // leave cores for HW decode / render / fetch
  if (h < nthreads * 16) nthreads = 1;     // tiny frames: not worth the thread spawn
  ChengNv12Band bands[6];
  pthread_t tids[6];
  int rows = h / nthreads;
  rows &= ~1;                              // keep band starts on even rows (UV is 2x2 subsampled)
  if (rows < 1) { nthreads = 1; }
  int y = 0;
  for (int t = 0; t < nthreads; t++) {
    int y1 = (t == nthreads - 1) ? h : (y + rows);
    bands[t].Y = Y; bands[t].UV = UV; bands[t].rgba = rgba;
    bands[t].w = w; bands[t].stride = stride; bands[t].y0 = y; bands[t].y1 = y1;
    y = y1;
  }
  // Spawn workers for bands 1..N-1, convert band 0 on this thread, then join. Bands
  // are disjoint [y0,y1) ranges, so a failed spawn just converts that band inline.
  int spawned[6] = {0};
  for (int t = 1; t < nthreads; t++) {
    if (pthread_create(&tids[t], NULL, cheng_nv12_band_thread, &bands[t]) == 0) spawned[t] = 1;
    else cheng_nv12_band(&bands[t]);
  }
  cheng_nv12_band(&bands[0]);
  for (int t = 1; t < nthreads; t++) if (spawned[t]) pthread_join(tids[t], NULL);
  return rgba;
}

void cheng_dec_on_error(OH_AVCodec* c, int32_t e, void* u) {
  (void)c; (void)u;
  char b[48]; snprintf(b, sizeof(b), "dec on_error code=%d", e); cheng_media_diag(b);
}
void cheng_dec_on_stream_changed(OH_AVCodec* c, OH_AVFormat* f, void* u) {
  (void)c; (void)f; (void)u; cheng_media_diag("dec on_stream_changed");
}
static void cheng_dec_on_need_input(OH_AVCodec* c, uint32_t index, OH_AVBuffer* buffer, void* u) {
  ChengDecCtx* ctx = (ChengDecCtx*)u;
  if (ctx == NULL || buffer == NULL) { return; }
  if (ctx->input_eos) { return; }
  OH_AVErrCode rc = OH_AVDemuxer_ReadSampleBuffer(ctx->demux, ctx->vTrack, buffer);
  if (rc == AV_ERR_OK) {
    OH_AVCodecBufferAttr attr;
    OH_AVBuffer_GetBufferAttr(buffer, &attr);
    OH_AVBuffer_SetBufferAttr(buffer, &attr);
    OH_VideoDecoder_PushInputBuffer(c, index);
  } else {
    OH_AVCodecBufferAttr attr;
    memset(&attr, 0, sizeof(attr));
    attr.flags = AVCODEC_BUFFER_FLAGS_EOS;
    OH_AVBuffer_SetBufferAttr(buffer, &attr);
    OH_VideoDecoder_PushInputBuffer(c, index);
    ctx->input_eos = 1;
  }
}
static void cheng_dec_on_new_output(OH_AVCodec* c, uint32_t index, OH_AVBuffer* buffer, void* u) {
  ChengDecCtx* ctx = (ChengDecCtx*)u;
  if (ctx != NULL && buffer != NULL) {
    OH_AVCodecBufferAttr attr;
    memset(&attr, 0, sizeof(attr));
    OH_AVBuffer_GetBufferAttr(buffer, &attr);
    int is_eos = (attr.flags & AVCODEC_BUFFER_FLAGS_EOS) ? 1 : 0;
    pthread_mutex_lock(&ctx->mu);
    // Track display dims; output-description WIDTH/HEIGHT report the 64-aligned
    // BUFFER size (e.g. 320x570 content in a 384x576 buffer) whose right/bottom
    // padding has UV=0 and would convert to a bright-green band. stride/sliceHeight
    // index the NV12 buffer; the valid content is the top-left ctx->w x ctx->h.
    int w = ctx->w, h = ctx->h, stride = ctx->w, slice = ctx->h;
    OH_AVFormat* of = OH_VideoDecoder_GetOutputDescription(c);
    if (of != NULL) {
      if (!OH_AVFormat_GetIntValue(of, OH_MD_KEY_VIDEO_STRIDE, &stride) || stride < w) stride = w;
      if (!OH_AVFormat_GetIntValue(of, OH_MD_KEY_VIDEO_SLICE_HEIGHT, &slice) || slice < h) slice = h;
      OH_AVFormat_Destroy(of);
    }
    uint8_t* nv12 = (!is_eos && attr.size > 0) ? OH_AVBuffer_GetAddr(buffer) : NULL;
    if (ctx->collect_all) {
      // Complete playback: convert every frame to RGBA in presentation order.
      if (nv12 != NULL && w > 0 && h > 0 && ctx->frame_count < CHENG_DEC_MAX_FRAMES) {
        unsigned char* rgba = cheng_nv12_to_rgba(nv12, w, h, stride, slice);
        if (rgba != NULL) {
          ctx->frames[ctx->frame_count++] = rgba;
          ctx->w = w; ctx->h = h; ctx->stride = stride; ctx->slice = slice;
          ctx->captured = 1;
        }
      }
      if (is_eos || ctx->frame_count >= CHENG_DEC_MAX_FRAMES) ctx->output_eos = 1;
      pthread_cond_signal(&ctx->cv);
    } else if (!ctx->captured) {
      // 秒开: keep the raw NV12 of the first frame; the caller converts it.
      if (nv12 != NULL && w > 0 && h > 0) {
        size_t sz = (size_t)stride * (size_t)slice * 3 / 2;
        ctx->nv12 = (unsigned char*)malloc(sz);
        if (ctx->nv12 != NULL) {
          CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_DECODE_FIRST_FRAME_MALLOC, sz);
          memcpy(ctx->nv12, nv12, sz);
          ctx->w = w; ctx->h = h; ctx->stride = stride; ctx->slice = slice;
          ctx->captured = 1;
        }
      }
      pthread_cond_signal(&ctx->cv);
    }
    pthread_mutex_unlock(&ctx->mu);
  }
  OH_VideoDecoder_FreeOutputBuffer(c, index);
}

// Decode the FIRST video frame of an mp4 file to a malloc'd RGBA8 buffer (caller
// frees). Buffer mode (no surface), synchronous Query path. Returns 1 on success
// (sets *out_rgba/*out_w/*out_h), 0 on any failure. Runs on the render thread for
// a one-shot first frame; the result is cached by register so it runs once.
static int cheng_ohos_decode_first_frame(const char* path, unsigned char** out_rgba, int* out_w, int* out_h) {
  *out_rgba = NULL; *out_w = 0; *out_h = 0;
  int fd = open(path, O_RDONLY);
  if (fd < 0) { cheng_media_diag("decode open fail"); return 0; }
  struct stat st;
  if (fstat(fd, &st) != 0 || st.st_size <= 0) { close(fd); cheng_media_diag("decode fstat fail"); return 0; }
  int64_t fileSize = (int64_t)st.st_size;

  OH_AVSource* src = OH_AVSource_CreateWithFD(fd, 0, fileSize);
  if (src == NULL) { close(fd); cheng_media_diag("decode CreateWithFD NULL"); return 0; }
  OH_AVDemuxer* demux = OH_AVDemuxer_CreateWithSource(src);
  if (demux == NULL) { OH_AVSource_Destroy(src); close(fd); cheng_media_diag("decode demuxer NULL"); return 0; }

  OH_AVFormat* srcFmt = OH_AVSource_GetSourceFormat(src);
  int32_t trackCount = 0;
  if (srcFmt) { OH_AVFormat_GetIntValue(srcFmt, OH_MD_KEY_TRACK_COUNT, &trackCount); OH_AVFormat_Destroy(srcFmt); }
  int vTrack = -1; int32_t vW = 0, vH = 0;
  for (int32_t t = 0; t < trackCount; t++) {
    OH_AVFormat* tf = OH_AVSource_GetTrackFormat(src, (uint32_t)t);
    if (!tf) continue;
    int32_t type = -1;
    OH_AVFormat_GetIntValue(tf, OH_MD_KEY_TRACK_TYPE, &type);
    if (type == MEDIA_TYPE_VID) {
      OH_AVFormat_GetIntValue(tf, OH_MD_KEY_WIDTH, &vW);
      OH_AVFormat_GetIntValue(tf, OH_MD_KEY_HEIGHT, &vH);
      vTrack = (int)t; OH_AVFormat_Destroy(tf); break;
    }
    OH_AVFormat_Destroy(tf);
  }
  if (vTrack < 0 || vW <= 0 || vH <= 0) { OH_AVDemuxer_Destroy(demux); OH_AVSource_Destroy(src); close(fd); cheng_media_diag("decode no video track"); return 0; }
  OH_AVDemuxer_SelectTrackByID(demux, (uint32_t)vTrack);

  OH_AVCodec* dec = OH_VideoDecoder_CreateByMime(OH_AVCODEC_MIMETYPE_VIDEO_AVC);
  if (dec == NULL) { OH_AVDemuxer_Destroy(demux); OH_AVSource_Destroy(src); close(fd); cheng_media_diag("decode CreateByMime NULL"); return 0; }
  OH_AVFormat* cfg = OH_AVFormat_Create();
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_WIDTH, vW);
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_HEIGHT, vH);
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_PIXEL_FORMAT, AV_PIXEL_FORMAT_NV12);
  OH_AVErrCode cfgRc = OH_VideoDecoder_Configure(dec, cfg);
  OH_AVFormat_Destroy(cfg);
  ChengDecCtx ctx;
  memset(&ctx, 0, sizeof(ctx));
  ctx.demux = demux;
  ctx.vTrack = (uint32_t)vTrack;
  ctx.w = vW;
  ctx.h = vH;
  pthread_mutex_init(&ctx.mu, NULL);
  pthread_cond_init(&ctx.cv, NULL);

  OH_AVCodecCallback cb;
  cb.onError = cheng_dec_on_error;
  cb.onStreamChanged = cheng_dec_on_stream_changed;
  cb.onNeedInputBuffer = cheng_dec_on_need_input;
  cb.onNewOutputBuffer = cheng_dec_on_new_output;
  if (OH_VideoDecoder_RegisterCallback(dec, cb, &ctx) != AV_ERR_OK ||
      cfgRc != AV_ERR_OK ||
      OH_VideoDecoder_Prepare(dec) != AV_ERR_OK ||
      OH_VideoDecoder_Start(dec) != AV_ERR_OK) {
    OH_VideoDecoder_Destroy(dec); OH_AVDemuxer_Destroy(demux); OH_AVSource_Destroy(src); close(fd);
    pthread_mutex_destroy(&ctx.mu); pthread_cond_destroy(&ctx.cv);
    cheng_media_diag("decode register/cfg/prepare/start fail");
    return 0;
  }

  // Wait up to ~3s for the codec thread to deliver the first decoded frame.
  pthread_mutex_lock(&ctx.mu);
  struct timespec ts;
  clock_gettime(CLOCK_REALTIME, &ts);
  ts.tv_sec += 3;
  while (!ctx.captured) {
    if (pthread_cond_timedwait(&ctx.cv, &ctx.mu, &ts) != 0) { break; }
  }
  int captured = ctx.captured;
  pthread_mutex_unlock(&ctx.mu);

  OH_VideoDecoder_Stop(dec);
  OH_VideoDecoder_Destroy(dec);
  OH_AVDemuxer_Destroy(demux);
  OH_AVSource_Destroy(src);
  close(fd);

  unsigned char* rgba = NULL;
  int gw = ctx.w, gh = ctx.h, gst = ctx.stride, gsl = ctx.slice;
  if (captured && ctx.nv12 != NULL && gw > 0 && gh > 0) {
    rgba = (unsigned char*)malloc((size_t)gw * (size_t)gh * 4);
    if (rgba != NULL) {
      const uint8_t* Y = ctx.nv12;
      const uint8_t* UV = ctx.nv12 + (size_t)gst * (size_t)gsl;
      for (int y = 0; y < gh; y++) {
        for (int x = 0; x < gw; x++) {
          int Yv = Y[(size_t)y * gst + x];
          int Uv = UV[(size_t)(y >> 1) * gst + (x & ~1)] - 128;
          int Vv = UV[(size_t)(y >> 1) * gst + (x & ~1) + 1] - 128;
          int r = Yv + ((91881 * Vv) >> 16);
          int g = Yv - ((22554 * Uv) >> 16) - ((46802 * Vv) >> 16);
          int b = Yv + ((116130 * Uv) >> 16);
          if (r < 0) r = 0; else if (r > 255) r = 255;
          if (g < 0) g = 0; else if (g > 255) g = 255;
          if (b < 0) b = 0; else if (b > 255) b = 255;
          size_t o = ((size_t)y * (size_t)gw + (size_t)x) * 4;
          rgba[o] = (unsigned char)r; rgba[o + 1] = (unsigned char)g; rgba[o + 2] = (unsigned char)b; rgba[o + 3] = 255;
        }
      }
    }
  }
  if (ctx.nv12 != NULL) {
    CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_DECODE_FIRST_FRAME_FREE, (size_t)gst * (size_t)gsl * 3 / 2);
    free(ctx.nv12);
  }
  pthread_mutex_destroy(&ctx.mu);
  pthread_cond_destroy(&ctx.cv);

  if (captured && rgba != NULL) {
    *out_rgba = rgba; *out_w = gw; *out_h = gh;
    char okbuf[128]; snprintf(okbuf, sizeof(okbuf), "decode OK %dx%d stride=%d slice=%d", gw, gh, gst, gsl);
    cheng_media_diag(okbuf);
    return 1;
  }
  if (rgba != NULL) { free(rgba); }
  {
    char nbuf[128];
    snprintf(nbuf, sizeof(nbuf), "decode no frame captured=%d vWH=%dx%d", captured, vW, vH);
    cheng_media_diag(nbuf);
  }
  return 0;
}

// Decode ALL video frames of an mp4 to an ordered array of malloc'd RGBA8 frames
// (caller frees each + the array). Same OHOS callback-mode decoder as the
// first-frame path but collects every output buffer until EOS. Returns 1 on
// success (>=1 frame), 0 on failure. Enables complete frame-paced playback.
static int cheng_ohos_decode_all_frames(const char* path, unsigned char*** out_frames, int* out_count, int* out_w, int* out_h, double* out_fps) {
  *out_frames = NULL; *out_count = 0; *out_w = 0; *out_h = 0; *out_fps = 0.0;
  double vFps = 0.0;
  int fd = open(path, O_RDONLY);
  if (fd < 0) { cheng_media_diag("decode_all open fail"); return 0; }
  struct stat st;
  if (fstat(fd, &st) != 0 || st.st_size <= 0) { close(fd); cheng_media_diag("decode_all fstat fail"); return 0; }
  int64_t fileSize = (int64_t)st.st_size;
  OH_AVSource* src = OH_AVSource_CreateWithFD(fd, 0, fileSize);
  if (src == NULL) { close(fd); cheng_media_diag("decode_all CreateWithFD NULL"); return 0; }
  OH_AVDemuxer* demux = OH_AVDemuxer_CreateWithSource(src);
  if (demux == NULL) { OH_AVSource_Destroy(src); close(fd); cheng_media_diag("decode_all demuxer NULL"); return 0; }
  OH_AVFormat* srcFmt = OH_AVSource_GetSourceFormat(src);
  int32_t trackCount = 0;
  if (srcFmt) { OH_AVFormat_GetIntValue(srcFmt, OH_MD_KEY_TRACK_COUNT, &trackCount); OH_AVFormat_Destroy(srcFmt); }
  int vTrack = -1; int32_t vW = 0, vH = 0;
  for (int32_t t = 0; t < trackCount; t++) {
    OH_AVFormat* tf = OH_AVSource_GetTrackFormat(src, (uint32_t)t);
    if (!tf) continue;
    int32_t type = -1;
    OH_AVFormat_GetIntValue(tf, OH_MD_KEY_TRACK_TYPE, &type);
    if (type == MEDIA_TYPE_VID) {
      OH_AVFormat_GetIntValue(tf, OH_MD_KEY_WIDTH, &vW);
      OH_AVFormat_GetIntValue(tf, OH_MD_KEY_HEIGHT, &vH);
      OH_AVFormat_GetDoubleValue(tf, OH_MD_KEY_FRAME_RATE, &vFps);
      vTrack = (int)t; OH_AVFormat_Destroy(tf); break;
    }
    OH_AVFormat_Destroy(tf);
  }
  if (vTrack < 0 || vW <= 0 || vH <= 0) { OH_AVDemuxer_Destroy(demux); OH_AVSource_Destroy(src); close(fd); cheng_media_diag("decode_all no video track"); return 0; }
  OH_AVDemuxer_SelectTrackByID(demux, (uint32_t)vTrack);
  OH_AVCodec* dec = OH_VideoDecoder_CreateByMime(OH_AVCODEC_MIMETYPE_VIDEO_AVC);
  if (dec == NULL) { OH_AVDemuxer_Destroy(demux); OH_AVSource_Destroy(src); close(fd); cheng_media_diag("decode_all CreateByMime NULL"); return 0; }
  OH_AVFormat* cfg = OH_AVFormat_Create();
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_WIDTH, vW);
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_HEIGHT, vH);
  OH_AVFormat_SetIntValue(cfg, OH_MD_KEY_PIXEL_FORMAT, AV_PIXEL_FORMAT_NV12);
  OH_AVErrCode cfgRc = OH_VideoDecoder_Configure(dec, cfg);
  OH_AVFormat_Destroy(cfg);
  ChengDecCtx ctx;
  memset(&ctx, 0, sizeof(ctx));
  ctx.demux = demux; ctx.vTrack = (uint32_t)vTrack; ctx.w = vW; ctx.h = vH; ctx.collect_all = 1;
  pthread_mutex_init(&ctx.mu, NULL);
  pthread_cond_init(&ctx.cv, NULL);
  OH_AVCodecCallback cb;
  cb.onError = cheng_dec_on_error;
  cb.onStreamChanged = cheng_dec_on_stream_changed;
  cb.onNeedInputBuffer = cheng_dec_on_need_input;
  cb.onNewOutputBuffer = cheng_dec_on_new_output;
  if (OH_VideoDecoder_RegisterCallback(dec, cb, &ctx) != AV_ERR_OK || cfgRc != AV_ERR_OK ||
      OH_VideoDecoder_Prepare(dec) != AV_ERR_OK || OH_VideoDecoder_Start(dec) != AV_ERR_OK) {
    OH_VideoDecoder_Destroy(dec); OH_AVDemuxer_Destroy(demux); OH_AVSource_Destroy(src); close(fd);
    pthread_mutex_destroy(&ctx.mu); pthread_cond_destroy(&ctx.cv);
    cheng_media_diag("decode_all register/cfg/prepare/start fail");
    return 0;
  }
  // Wait up to ~6s for the codec thread to drain all frames to EOS.
  pthread_mutex_lock(&ctx.mu);
  struct timespec ts;
  clock_gettime(CLOCK_REALTIME, &ts);
  ts.tv_sec += 6;
  while (!ctx.output_eos) {
    if (pthread_cond_timedwait(&ctx.cv, &ctx.mu, &ts) != 0) { break; }
  }
  int n = ctx.frame_count;
  pthread_mutex_unlock(&ctx.mu);
  OH_VideoDecoder_Stop(dec);
  OH_VideoDecoder_Destroy(dec);
  OH_AVDemuxer_Destroy(demux);
  OH_AVSource_Destroy(src);
  close(fd);
  pthread_mutex_destroy(&ctx.mu);
  pthread_cond_destroy(&ctx.cv);
  if (n <= 0) { cheng_media_diag("decode_all no frames"); return 0; }
  unsigned char** arr = (unsigned char**)malloc((size_t)n * sizeof(unsigned char*));
  if (arr == NULL) { for (int i = 0; i < n; i++) free(ctx.frames[i]); return 0; }
  for (int i = 0; i < n; i++) arr[i] = ctx.frames[i];
  if (vFps < 1.0 || vFps > 240.0) vFps = 12.0;
  *out_frames = arr; *out_count = n; *out_w = ctx.w; *out_h = ctx.h; *out_fps = vFps;
  char okbuf[96]; snprintf(okbuf, sizeof(okbuf), "decode_all OK frames=%d %dx%d fps=%d", n, ctx.w, ctx.h, (int)(vFps + 0.5));
  cheng_media_diag(okbuf);
  return 1;
}

// --- MoQ progressive streaming decode ------------------------------------------
// Codec input callback — runs on the decoder's INTERNAL thread, so it must NEVER
// touch the Cheng QUIC bridge (single-threaded runtime). It only DRAINS the input
// FIFO the render thread fills (cheng_stream_prefetch_frames). Non-blocking: if the
// FIFO is empty it returns without pushing and the codec re-requests later.
void cheng_stream_on_need_input(OH_AVCodec* c, uint32_t index, OH_AVBuffer* buffer, void* u) {
  ChengStreamCtx* ctx = (ChengStreamCtx*)u;
  if (ctx == NULL || buffer == NULL || ctx->stop) return;
  unsigned char* bytes = NULL; int32_t len = 0; int64_t pts = 0; int key = 0;
  pthread_mutex_lock(&ctx->fq_mu);
  // WAIT for a frame (the render thread fills + signals). Must not return without
  // pushing or the codec loses this buffer offer and starves.
  while (ctx->fq_size == 0 && !ctx->stop && !ctx->input_done) {
    pthread_cond_wait(&ctx->cv_notempty, &ctx->fq_mu);
  }
  // #14-eos: FIFO drained AND the fetch thread has marked the source exhausted
  // (cheng_stream_mark_video_input_done, on WebSceneMediaEsStreamLoop rc==7) — this is a
  // genuine end-of-stream, not a spurious wakeup. Mirrors cheng_aes_on_need_input's
  // identical eos derivation.
  int eos = (ctx->fq_size == 0 && ctx->input_done) ? 1 : 0;
  if (ctx->fq_size > 0) {
    bytes = ctx->fq[ctx->fq_head]; len = ctx->fq_len[ctx->fq_head];
    pts = ctx->fq_pts[ctx->fq_head]; key = ctx->fq_key[ctx->fq_head];
    ctx->fq_head = (ctx->fq_head + 1) % CHENG_STREAM_FQ_CAP;
    ctx->fq_size--;
    pthread_cond_signal(&ctx->cv_notfull_fq);  // a slot freed → wake the persistent-conn sink
  }
  pthread_mutex_unlock(&ctx->fq_mu);
  if (bytes == NULL && !eos) return;  // stopped, not EOS
  uint8_t* addr = OH_AVBuffer_GetAddr(buffer);
  int32_t cap = OH_AVBuffer_GetCapacity(buffer);
  static int s_in_n = 0;
  if (bytes != NULL) {
    if (addr != NULL && len > 0 && len <= cap) {
      memcpy(addr, bytes, (size_t)len);
      OH_AVCodecBufferAttr attr; memset(&attr, 0, sizeof(attr));
      attr.offset = 0; attr.size = len; attr.pts = pts;
      attr.flags = key ? AVCODEC_BUFFER_FLAGS_SYNC_FRAME : AVCODEC_BUFFER_FLAGS_NONE;
      OH_AVBuffer_SetBufferAttr(buffer, &attr);
      OH_AVErrCode prc = OH_VideoDecoder_PushInputBuffer(c, index);
      if (s_in_n < 6) { s_in_n++; char b[64]; snprintf(b, sizeof(b), "dec push in len=%d key=%d cap=%d rc=%d", len, key, cap, (int)prc); cheng_media_diag(b); }
    } else if (s_in_n < 6) {
      s_in_n++; char b[64]; snprintf(b, sizeof(b), "dec push SKIP len=%d cap=%d addr=%d", len, cap, addr != NULL); cheng_media_diag(b);
    }
    CHENG_LEAK_AUDIT_RECORD(CHENG_LEAK_PT_ON_NEED_INPUT_FREE, len);
    free(bytes);
  } else if (eos) {
    // #14-eos: push an EOS buffer instead of waiting forever for a frame that will never
    // arrive. cheng_stream_on_new_output already recognizes AVCODEC_BUFFER_FLAGS_EOS on
    // its output side (adapter.c, is_eos check) — it has been waiting for this since
    // before this branch existed.
    OH_AVCodecBufferAttr attr; memset(&attr, 0, sizeof(attr));
    attr.flags = AVCODEC_BUFFER_FLAGS_EOS;
    OH_AVBuffer_SetBufferAttr(buffer, &attr);
    OH_VideoDecoder_PushInputBuffer(c, index);
    cheng_media_diag("dec push EOS (video ES input exhausted)");
  }
}

// OH_AVPlayer state callback: Prepare is async, so start playback once the player
// reaches AV_PREPARED (=2). State arrives in infoBody under OH_PLAYER_STATE.
void cheng_audio_on_info(OH_AVPlayer* player, AVPlayerOnInfoType type, OH_AVFormat* infoBody, void* userData) {
  (void)userData;
  if (type == AV_INFO_TYPE_STATE_CHANGE && infoBody != NULL) {
    int32_t st = -1;
    OH_AVFormat_GetIntValue(infoBody, OH_PLAYER_STATE, &st);
    if (st == AV_PREPARED) {
      OH_AVPlayer_Play(player);
      cheng_media_diag("audio: AVPlayer prepared -> play");
    }
  }
}

// Dedicated FETCH thread: owns ALL QUIC (es_open + decoder create + the fetch loop).
// The Cheng runtime's slab allocator is spinlock-protected (thread-safe), and the QUIC
// datapath/session globals are touched ONLY here (the render thread never calls the
// bridge), so this runs concurrently with the render thread without corruption. This is
// what makes playback smooth: the render thread only PRESENTS (never blocks on QUIC).
static void* cheng_stream_fetch_worker(void* arg) {
  (void)arg;
  extern int32_t cheng_scene_media_es_open(const char* host, int32_t port);
  extern int32_t cheng_scene_media_es_frame_count(void);
  extern int32_t cheng_scene_media_es_width(void);
  extern int32_t cheng_scene_media_es_height(void);
  extern int32_t cheng_scene_media_es_fps(void);
  extern int32_t cheng_scene_media_es_stream_loop(void);
  // Current-index display-matrix rotation is a required ABI member. Missing exports
  // fail the host link instead of silently treating an unknown wire format as rotation 0.
  extern int32_t cheng_scene_media_es_rotation(void);
  typedef int32_t (*cheng_es_int_fn)(void);
  // Content-addressing verify for a prewarmed dial (see s_fetch_asset_cid): a prefetch armed
  // ahead of tap is keyed by host:port, not content — if the publisher slot now serves DIFFERENT
  // content (peer/content rotation between prewarm and tap), the mismatch must be caught rather
  // than silently played. This independent content-addressing extension remains dlsym-bound;
  // es_invalidate_fn reuses
  // cheng_es_int_fn: the real export (chengSceneMediaEsInvalidateAppExport) returns int32_t, not
  // void — the cold @exportc ABI always carries an int32_t result.
  typedef int32_t (*cheng_es_str_int_fn)(const char*);
  cheng_es_str_int_fn es_content_matches_fn = (cheng_es_str_int_fn)dlsym(s_app_handle, "cheng_scene_media_es_content_matches");
  cheng_es_int_fn es_invalidate_fn = (cheng_es_int_fn)dlsym(s_app_handle, "cheng_scene_media_es_invalidate");
  // S5-B pause/resume gateway (video-seek-scrub-blueprint.md §7.4): mirrors this thread's
  // OWN view of sc->paused_requested into the Cheng bridge's WebSceneMediaEsSetPaused —
  // called ONLY from this fetch thread (see the pump loop below), never cross-thread. Same
  // fail-open dlsym precedent as the other optional exports above: an older scene .so
  // without it just never gets a pause gateway (no crash, playback runs as before).
  typedef int32_t (*cheng_es_int_int_fn)(int32_t);
  cheng_es_int_int_fn es_set_paused_fn = (cheng_es_int_int_fn)dlsym(s_app_handle, "cheng_scene_media_es_set_paused");
  // S3a seek gateway (video-seek-scrub-blueprint.md §S3a): mirrors this thread's OWN view of
  // sc->seek_requested/seek_target_ms into the Cheng bridge's WebSceneMediaEsSeekToPositionMs
  // — called ONLY from this fetch thread (see the pump loop below), same single-thread-owns-
  // the-QUIC-pump invariant as es_set_paused_fn above. Reuses cheng_es_int_int_fn's shape
  // (int32_t position_ms in, int32_t ok out). Same fail-open dlsym precedent: an older scene
  // .so without this export just never gets a seek gateway (no crash, no seek effect).
  cheng_es_int_int_fn es_seek_to_position_ms_fn = (cheng_es_int_int_fn)dlsym(s_app_handle, "cheng_scene_media_es_seek_to_position_ms");
  // #14 S8: Audio ES bridge exports (video-seek-scrub-blueprint.md §7.1 选项 A) — mirrors
  // the Android host's identical dlsym set (mobile_shell_codegen.cheng, S7/aa6f3101d
  // lineage), same fail-open precedent as every optional export above: an older scene
  // .so without these just never engages ES audio (falls back to the local-file clip
  // below), no crash. es_pump_cursor_fn reads the VIDEO ES's own post-seek-snap cursor
  // (WebSceneMediaEsPumpCursor) — the alignment anchor audio seek needs.
  typedef int32_t (*cheng_aes_open_fn)(const char*, int32_t);
  cheng_aes_open_fn audio_es_open_fn = (cheng_aes_open_fn)dlsym(s_app_handle, "cheng_scene_media_audio_es_open");
  // #14 S8 v2 (fix for v_a.md/v_b.md finding ⑤): the .cheng bridge's getters are
  // WebSceneMediaAudioSampleRate/WebSceneMediaAudioChannels (no "Es" — only the
  // open/frame_count/fetch_frame/pump_cursor/seek members of this family carry "Es" in
  // their .cheng name), so their implicit-export names are cheng_scene_media_audio_
  // sample_rate / cheng_scene_media_audio_channels, NOT ..._audio_es_sample_rate/
  // ..._audio_es_channels — v1 had them wrong, which made this engage gate always false.
  cheng_es_int_fn audio_es_sample_rate_fn = (cheng_es_int_fn)dlsym(s_app_handle, "cheng_scene_media_audio_sample_rate");
  cheng_es_int_fn audio_es_channels_fn = (cheng_es_int_fn)dlsym(s_app_handle, "cheng_scene_media_audio_channels");
  cheng_es_int_fn audio_es_frame_count_fn = (cheng_es_int_fn)dlsym(s_app_handle, "cheng_scene_media_audio_es_frame_count");
  typedef int32_t (*cheng_aes_fetch_frame_fn)(int32_t, unsigned char*, int32_t);
  // #14 S8 v2 (fix for v_a.md/v_b.md finding ⑤): the .cheng fn is WebSceneMediaAudioEs
  // FrameFetch ("Frame" then "Fetch") — v1's literal had the two words transposed.
  cheng_aes_fetch_frame_fn audio_es_fetch_frame_fn = (cheng_aes_fetch_frame_fn)dlsym(s_app_handle, "cheng_scene_media_audio_es_frame_fetch");
  cheng_es_int_fn es_pump_cursor_fn = (cheng_es_int_fn)dlsym(s_app_handle, "cheng_scene_media_es_pump_cursor");
  cheng_es_int_int_fn audio_es_seek_to_video_frame_fn = (cheng_es_int_int_fn)dlsym(s_app_handle, "cheng_scene_media_audio_es_seek_to_video_frame");
  cheng_es_int_fn audio_es_pump_cursor_fn = (cheng_es_int_fn)dlsym(s_app_handle, "cheng_scene_media_audio_es_pump_cursor");
  // #14-eos patch2: background S4 disk-block-cache prefetch for the audio ES track —
  // mirrors the video ES's own S5 wiring (s_es_prefetch_tick_fn above, cheng_scene_media_
  // es_prefetch_tick / video-seek-scrub-blueprint.md §S5), same fail-open dlsym precedent.
  // Runs on THIS fetch thread only (see the loop below) — the single thread allowed to
  // touch the Cheng QUIC bridge — filling the SAME S4 block-cache keys
  // webSceneMediaAudioEsFetchBatch now reads first (block-aligned to webSceneMediaEsBatchFrames,
  // see that .cheng function's own header comment), so FrameFetch is a cache hit whenever
  // this tick has run ahead of the read cursor.
  typedef int32_t (*cheng_aes_prefetch_tick_fn)(int32_t);
  cheng_aes_prefetch_tick_fn audio_es_prefetch_tick_fn = (cheng_aes_prefetch_tick_fn)dlsym(s_app_handle, "cheng_scene_media_audio_es_prefetch_tick");
  // Real dial-failure reason (WebSceneMediaEsLastError, set on every dial/negotiate/ack
  // Err branch in web_scene_media_network_bridge.cheng) for the loud-timeout report below.
  // Same fail-open dlsym precedent as es_content_matches_fn above — a
  // scene .o without this export degrades to a generic reason string, never a crash.
  typedef const char* (*cheng_es_cstr_fn)(void);
  cheng_es_cstr_fn es_last_error_fn = (cheng_es_cstr_fn)dlsym(s_app_handle, "cheng_scene_media_es_last_error");
  // Dial the card's own publisher: the media slot's peerHost/peerPort透传 from the snapshot
  // sourcePeer, stashed at prepare time. An empty host means "no sourcePeer" — local content
  // semantics — which the worker-selection in cheng_mobile_host_prepare_media_surface_texture
  // (fetch_peer_is_local) already routes to cheng_stream_local_file_worker instead of ever
  // spawning this thread, so s_fetch_peer_host is guaranteed non-empty here. No IP-literal
  // fallback: an empty host reaching this point is an invariant violation (a new call site
  // added elsewhere without honoring the local/network split), not a "guess an address and
  // dial" case — surface it loudly instead of silently defaulting.
  if (s_fetch_peer_host[0] == '\0') {
    cheng_media_diag("fetch thread: INVARIANT VIOLATION empty peer host reached network dial worker — aborting, no fallback dial");
    s_stream_starting = 0;  // release the re-entry gate — see the abort-must-unlatch note below
    return NULL;
  }
  const char* dial_host = s_fetch_peer_host;
  int32_t dial_port = (s_fetch_peer_port > 0) ? s_fetch_peer_port : 38000;
  char db[96]; snprintf(db, sizeof(db), "fetch thread: es open dial %s:%d...", dial_host, dial_port); cheng_media_diag(db);
  // Serialize with the one-shot feed prewarm dial: the Cheng runtime drives ALL QUIC on a single
  // thread, so join any in-flight prewarm BEFORE we dial — never two threads in the QUIC pump at
  // once. es_open is bounded by its own dial timeout (the opened!=1 path below already relies on
  // that), so this join cannot hang beyond that timeout — no separate watchdog needed.
  if (s_prewarm_thread_started) {
    pthread_join(s_prewarm_thread, NULL);
    s_prewarm_thread_started = 0;
    cheng_media_diag("fetch thread: joined feed prewarm before dial");
  }
  s_ff_dial_start_ns = cheng_monotime_ns();  // 秒开 dial segment begins
  int32_t opened = cheng_scene_media_es_open(dial_host, dial_port);
  s_ff_dial_done_ns = cheng_monotime_ns();   // dial + negotiate + announce complete
  char ob[64]; snprintf(ob, sizeof(ob), "fetch thread: es open=%d", opened); cheng_media_diag(ob);
  if (opened != 1) {
    // Loud dial-timeout/failure (方向A收口): opened!=1 means webSceneMediaEsEnsureDialed
    // hit dial/negotiate/ack Err OR the QUIC handshake pump ran past its 2000ms deadline
    // (Libp2pQuicOneShotHandshakeTimeoutMs, quic_transport.cheng:28) without clientReady —
    // see msquicNativeDialPumpReadyCode (native_runtime.cheng:5192-5235). Previously this
    // branch returned NULL silently: no ERROR-level log, no runtime-state write, so the
    // GUI had zero signal to distinguish "still connecting" from "gave up" — the surface
    // just stayed on its last frame/poster forever. This does NOT retry (no loop here);
    // retry is the caller re-invoking cheng_mobile_host_prepare_media_surface_texture for
    // the card — gated on s_stream_starting, which every early-return abort in this worker
    // (this branch included, below) must clear itself: it is set 1 by the spawner BEFORE
    // this thread starts (see cheng_mobile_host_prepare_media_surface_texture) and this
    // thread owns clearing it on every exit that doesn't reach the s_stream_ready handoff
    // — device-verified this was previously missing (streamStarting stuck 1 forever after
    // an abort, permanently blocking retry — see the content-mismatch branch below, the
    // real-world hit of this gap).
    const char* reason = (es_last_error_fn != NULL) ? es_last_error_fn() : NULL;
    if (reason == NULL || reason[0] == '\0') reason = "dial timeout or handshake failure (no reason text available)";
    char eb[256];
    snprintf(eb, sizeof(eb), "fetch thread: ES DIAL FAILED host=%s port=%d opened=%d reason=%s",
             dial_host, dial_port, opened, reason);
    __android_log_print(ANDROID_LOG_ERROR, "ChengMD", "%{public}s", eb);
    if (s_runtime_set_state != NULL) {
      char stateVal[288];
      snprintf(stateVal, sizeof(stateVal), "dial %s:%d failed: %s", dial_host, dial_port, reason);
      int errOk = s_runtime_set_state("videoFetchError", stateVal);
      int retryOk = s_runtime_set_state("videoFetchRetryable", "1");
      __android_log_print((errOk != 0 && retryOk != 0) ? ANDROID_LOG_INFO : ANDROID_LOG_ERROR, "ChengMD",
                          "fetch thread: videoFetchError state write err_ok=%d retryable_ok=%d", errOk, retryOk);
    } else {
      __android_log_print(ANDROID_LOG_ERROR, "ChengMD", "fetch thread: runtime set_state unavailable, dial failure NOT surfaced to GUI (%{public}s)", eb);
    }
    s_stream_starting = 0;  // release the re-entry gate — see the abort-must-unlatch note above
    return NULL;
  }
  // Content-addressing verify (mirrors Android's cheng_android_es_content_ok): a prewarm
  // dial is keyed by host:port, not content — if the publisher slot now serves DIFFERENT
  // content than this card expects (peer/content rotation between the prewarm dial and
  // this tap), the caller must NOT engage the decoder on a mismatch (that would silently
  // play the wrong video). NULL resolver (older scene .o without these exports) → cannot
  // verify → pass under the content-verification extension's own contract. A real mismatch
  // invalidates the stale open (forces a genuine redial on the next attempt) and aborts
  // this fetch loudly instead of falling through.
  if (es_content_matches_fn != NULL && !es_content_matches_fn(s_fetch_asset_cid)) {
    char cb[160]; snprintf(cb, sizeof(cb), "fetch thread: es content mismatch expected=%s — invalidating, aborting fetch", s_fetch_asset_cid);
    cheng_media_diag(cb);
    if (es_invalidate_fn != NULL) { es_invalidate_fn(); }
    // Device-verified gap (own-dial 2026-07-12): this abort used to return NULL with no
    // runtime-state write and no s_stream_starting reset — the GUI had zero signal (unlike
    // the dial-timeout branch above, which already surfaces videoFetchError) and the re-entry
    // gate stayed latched forever, so the detail page sat on a black surface with no retry,
    // no fallback, no visible error. The content reject itself stays loud/unconditional (an
    // address-mismatched frame must never play); only the AFTERMATH is fixed here: surface it
    // to the GUI the same way a dial failure already is, and release the gate so the next
    // prepare tick (or a user re-tap) gets a genuine retry instead of a permanent latch.
    if (s_runtime_set_state != NULL) {
      char stateVal[224];
      snprintf(stateVal, sizeof(stateVal), "content mismatch dialing %s:%d (expected=%s)", dial_host, dial_port, s_fetch_asset_cid);
      int errOk = s_runtime_set_state("videoFetchError", stateVal);
      int retryOk = s_runtime_set_state("videoFetchRetryable", "1");
      __android_log_print((errOk != 0 && retryOk != 0) ? ANDROID_LOG_INFO : ANDROID_LOG_ERROR, "ChengMD",
                          "fetch thread: videoFetchError state write err_ok=%d retryable_ok=%d (content mismatch)", errOk, retryOk);
    } else {
      __android_log_print(ANDROID_LOG_ERROR, "ChengMD", "fetch thread: runtime set_state unavailable, content mismatch NOT surfaced to GUI (%{public}s)", cb);
    }
    s_stream_starting = 0;  // release the re-entry gate — see the abort-must-unlatch note above
    return NULL;
  }
  int vw = cheng_scene_media_es_width();
  int vh = cheng_scene_media_es_height();
  double vfps = (double)cheng_scene_media_es_fps();
  int vfc = cheng_scene_media_es_frame_count();
  int vrot = cheng_android_normalize_video_rotation_degrees((int)cheng_scene_media_es_rotation());
  ChengStreamCtx* sc = cheng_ohos_start_streaming_decode(vw, vh, vfps, vfc);
  if (sc == NULL) { s_stream_starting = 0; return NULL; }  // release the re-entry gate — see the abort-must-unlatch note above
  sc->es_rotation = vrot;
  s_stream_ctx = sc;
  s_ff_index_done_ns = cheng_monotime_ns();  // ES index learned + decoder created
  __atomic_store_n(&s_stream_ready, 1, __ATOMIC_SEQ_CST);
  char rb[112]; snprintf(rb, sizeof(rb), "VIDEO streaming up %dx%d fps=%d frames=%d rotation=%d (fetch thread)",
                        sc->w, sc->h, (int)(sc->fps + 0.5), vfc, vrot); cheng_media_diag(rb);
  // #14 S8 (video-seek-scrub-blueprint.md §7.1 选项 A): try the real audio ES track over
  // the SAME connection this thread already dialed for video, on THIS thread (the only
  // one allowed to touch the Cheng QUIC bridge). On any failure (older scene .so missing
  // the exports, no audio track indexed, decoder/renderer create failure) fall back to
  // the bundled hgs clip's AAC track locally via OH_AVPlayer — same fail-open precedent
  // as every other optional export in this function, and the ONLY path on an older build.
  // 2026-07-26 root-cause fix (修3): the audio ES open used to run RIGHT HERE, before the
  // first video pump iteration, on this same thread — device-measured it blocked 12.4s
  // (announce+aindex against a wedged peer) while the freshly-dialed video session sat idle
  // and the publisher timed it out; the very first pump then returned rc=5 and (pre-修1)
  // the thread exited: decoder got ZERO input for the whole session while every "decode
  // started" banner had already been printed. The open is now deferred into the pump loop
  // below, gated on the video pump having actually produced at least one AU
  // (s_stream_prefetch_total > 0) — the session is proven live before anything audio-side
  // is allowed to touch this connection, and 首帧 never waits behind the audio dial.
  int audio_es_engaged_this_session = 0;
  int aes_attempted = 0;
  // PERSISTENT-CONNECTION fetch: dials once and streams every frame over the same conn
  // (no per-batch re-dial), pushing each into the FIFO via the C sink with backpressure.
  //
  // S5-B pump loop (video-seek-scrub-blueprint.md §7.4 "让位点"):
  // WebSceneMediaEsStreamLoop does exactly ONE bounded unit of work per call (one cached
  // GOP, or one network-fetch run under the byte budget) and returns — see its own header
  // comment in web_scene_media_network_bridge.cheng. This thread is the ONLY caller on
  // Harmony (its sink, cheng_scene_media_es_sink_frame, BLOCKS on a full FIFO instead of
  // signalling "full" the way the Android/desktop non-blocking sink does), so before this
  // change a single call ran unbounded through the WHOLE remaining clip with no way back
  // out — no tick gap to insert prefetch, and a pause request could never be observed mid-
  // stream. Now every rc==0 return is a safe yield point: this loop re-checks
  // sc->paused_requested (written by ANY thread, e.g. the render thread on a UI pause, via
  // cheng_stream_video_request_paused — guarded by sc->fq_mu) and mirrors it into the Cheng
  // bridge's own flag itself, on THIS thread only — the single thread allowed to touch the
  // QUIC/pump globals (msquicNativeCurSlot etc.), so no cross-thread race on them is ever
  // introduced. Runs until teardown (sc->stop) or the stream truly ends/errors.
  int last_mirrored_paused = -1;
  // #14 S8: this loop's own AAC AU fetch cursor (the only producer of this index — see
  // the prefetch block's own comment below). Reset on seek alongside the adapter-side
  // ring/decoder reset (cheng_audio_es_apply_seek), not tracked inside ChengAudioEsStreamCtx
  // itself since this loop is the sole owner/reader.
  int32_t aesPrefetchCursor = 0;
  static unsigned char s_aes_prefetch_buf[16384];
  // #14-eos: this session's own view of whether each network producer has reached its
  // source's end (set by this thread only — see the audio prefetch block and the
  // loopRc==7 handling below). Neither implies thread exit alone; only marks the
  // corresponding decoder's input side done so it can push an EOS buffer instead of
  // waiting forever — see cheng_stream_mark_video_input_done/cheng_audio_es_mark_input_done.
  int video_input_done = 0;
  int audio_input_done = 0;
  // 修1: consecutive-failure streak for the pump. WebSceneMediaEsStreamLoop's own header
  // demands it be called ONCE PER TICK repeatedly — its DeadStreak self-heal (teardown +
  // redial after 3 consecutive rc=5) can only ever fire if the caller keeps calling. The
  // old first-error break turned one transient rc into a permanent zero-AU session.
  int esErrStreak = 0;
  for (;;) {
    pthread_mutex_lock(&sc->fq_mu);
    int want_paused = sc->paused_requested;
    int doSeek = sc->seek_requested;
    int32_t seekMs = sc->seek_target_ms;
    sc->seek_requested = 0;
    int should_stop = sc->stop;
    pthread_mutex_unlock(&sc->fq_mu);
    if (should_stop) {
      cheng_media_diag("fetch thread: stream loop stop (teardown)");
      break;
    }
    if (es_set_paused_fn != NULL && want_paused != last_mirrored_paused) {
      es_set_paused_fn(want_paused);
      last_mirrored_paused = want_paused;
    }
    // S3a seek (video-seek-scrub-blueprint.md §S3a): reposition the Cheng bridge's ES pump
    // cursor FIRST (WebSceneMediaEsSeekToPositionMs snaps it to the enclosing keyframe), THEN
    // drain the now-stale local FIFO/ring and flush the decoder — this ordering keeps the
    // drain from racing a fresh fetch that could otherwise land in the FIFO between the two
    // steps and get wiped by the drain.
    if (doSeek) {
      int32_t seekOk = (es_seek_to_position_ms_fn != NULL) ? es_seek_to_position_ms_fn(seekMs) : 0;
      char skb[64]; snprintf(skb, sizeof(skb), "fetch thread: seek ms=%d bridge_ok=%d", seekMs, seekOk); cheng_media_diag(skb);
      cheng_stream_apply_seek(sc);
      // #14 S8 audio ES seek-sync (video-seek-scrub-blueprint.md §7.1 选项 A, mirrors the
      // Android host's S7 seek-sync): align the audio cursor to the VIDEO ES's own
      // post-seek-snap cursor (es_pump_cursor_fn — the enclosing-keyframe-snapped frame
      // index WebSceneMediaEsSeekToPositionMs just landed the video pump on), THEN reset
      // the local decoder/ring. Runs on THIS SAME fetch thread, the only one that ever
      // touches audio ES state (open/prefetch/seek all live here) — no cross-thread
      // dereference introduced.
      if (audio_es_seek_to_video_frame_fn != NULL && es_pump_cursor_fn != NULL) {
        int32_t videoFrameIdx = es_pump_cursor_fn();
        int32_t aesSeekOk = audio_es_seek_to_video_frame_fn(videoFrameIdx);
        int32_t newAudioFrame = (audio_es_pump_cursor_fn != NULL) ? audio_es_pump_cursor_fn() : -1;
        cheng_audio_es_apply_seek(newAudioFrame);
        aesPrefetchCursor = (newAudioFrame >= 0) ? newAudioFrame : 0;
        char askb[96]; snprintf(askb, sizeof(askb), "fetch thread: audio seek video_frame=%d bridge_ok=%d audio_frame=%d", videoFrameIdx, aesSeekOk, newAudioFrame); cheng_media_diag(askb);
      }
      // #14-eos: a seek can move the cursor back off the end (e.g. the user drags back
      // from a near-finished position), so this thread's own "have I already told the
      // decoder(s) input is done" bookkeeping must be re-armed here — cheng_stream_apply_
      // seek/cheng_audio_es_apply_seek above already reset the STRUCT-level sc->input_done/
      // s_aes_ctx.input_done (what the decoder callbacks actually read), but WITHOUT this
      // reset the loop's own !video_input_done/!audio_input_done gates below would stay
      // permanently latched true from before the seek, silently never fetching another
      // frame and never re-marking input_done a second time if the cursor reaches the end
      // again after this seek — the exact "stall forever" failure mode patch1 exists to fix.
      video_input_done = 0;
      audio_input_done = 0;
      continue;
    }
    // #14-eos v2 (fix for v_a.md §1.2 finding): once the video ES pump has exhausted,
    // WebSceneMediaEsStreamLoop's own entry order (webSceneMediaEsPumpEnded checked BEFORE
    // webSceneMediaEsPaused — see that function's own header comment) means it latches to
    // returning rc==7 FOREVER, never rc==8, regardless of pause state from here on. The
    // loopRc==8 branch below — this loop's ONLY pre-v2 blocking wait — therefore becomes
    // permanently unreachable the instant video exhausts, no matter what want_paused does.
    // Combined with the audio prefetch block right below being ALSO gated on !want_paused
    // (so audio_input_done could never latch either while paused), the pre-v2 sequence for
    // "video already exhausted, audio not yet, user pauses" was: skip audio fetch (paused) →
    // call stream_loop → get rc==7 (not 8, latched) → video_input_done already true, skip →
    // audio_input_done still false and audio_es_fetch_frame_fn != NULL → don't break → loop
    // straight back to the top with NO wait, NO fetch, NO state change — a genuine zero-block
    // busy spin pinning this thread at 100% CPU until resume/seek/stop. Checking want_paused
    // HERE — before EITHER the audio prefetch block or the stream_loop call — makes this the
    // ONE pause gate this loop ever needs, reachable in every combination of video/audio
    // exhaustion, not just "video not yet exhausted" (which is all the old loopRc==8 branch
    // could ever cover). Same blocking primitive as that branch: cv_notfull_fq, already
    // broadcast by both teardown (should_stop) and every pause/resume/seek request (adapter.c
    // cheng_stream_video_request_paused/cheng_stream_apply_seek's callers), so this wakes
    // promptly; re-checking seek_requested lets a drag-seek while paused fall through to the
    // `if (doSeek)` branch above on the NEXT iteration instead of staying parked here.
    if (want_paused) {
      pthread_mutex_lock(&sc->fq_mu);
      while (sc->paused_requested && !sc->seek_requested && !sc->stop) {
        pthread_cond_wait(&sc->cv_notfull_fq, &sc->fq_mu);
      }
      pthread_mutex_unlock(&sc->fq_mu);
      continue;
    }
    // #14 S8: bounded, non-blocking audio ES prefetch (this thread's own view of
    // want_paused above gates it — same S5-B backpressure shape the video pump loop
    // already uses, so audio and video stop fetching together on pause).
    // #14-eos: distinguishes "temporarily can't fetch" (network hiccup — aesN<=0, retried
    // next tick, does NOT mark done) from "genuinely exhausted" (prefetch cursor has
    // reached the track's own frame count — marks audio_input_done and wakes
    // cheng_aes_on_need_input's EOS branch via cheng_audio_es_mark_input_done). Gated on
    // !audio_input_done so a done session stops touching the bridge for audio at all.
    // (want_paused is always false by construction here after the v2 check above, but the
    // guard is kept as-is rather than stripped — see that check's own comment.)
    if (!want_paused && audio_es_fetch_frame_fn != NULL && !audio_input_done) {
      for (int aesPrefetchI = 0; aesPrefetchI < 4; aesPrefetchI++) {
        if (audio_es_frame_count_fn != NULL && aesPrefetchCursor >= audio_es_frame_count_fn()) {
          cheng_audio_es_mark_input_done();
          audio_input_done = 1;
          break;
        }
        int32_t aesN = audio_es_fetch_frame_fn(aesPrefetchCursor, s_aes_prefetch_buf, (int32_t)sizeof(s_aes_prefetch_buf));
        if (aesN <= 0) break;
        cheng_audio_es_prefetch_push(aesPrefetchCursor, s_aes_prefetch_buf, aesN);
        aesPrefetchCursor++;
      }
    }
    // #14-eos patch2: background S4 block-cache fill, same shape/precedent as the video
    // ES's own (Android-only-wired) s_es_prefetch_tick_fn(8) call. Bounded (at most 2
    // blocks per call — the bridge function's own "never race ahead unboundedly" contract,
    // see WebSceneMediaAudioEsPrefetchTick's header comment) and non-blocking (the bridge
    // never loops internally past that bound), so it never turns this thread's normally
    // network-paced loop into a busy spin. 2 rather than video's 8: an audio block (~2s of
    // audio) covers more wall-clock time per block than a video GOP typically does, and
    // this fetch thread has no "don't starve the render thread's frame budget" constraint
    // the Android host's tick call is written against. Gated on !audio_input_done for the
    // same reason the fetch block above is: a done session has nothing left to prefetch.
    // #14-eos v2 (fix for v_a.md §3.2 finding): "bounded per call" alone does NOT bound the
    // window's distance ahead of REAL consumption — WebSceneMediaAudioEsPrefetchTick's own
    // cursor (webSceneMediaAudioEsPumpCursor, read via audio_es_pump_cursor_fn below) is a
    // SEPARATE cursor from this loop's actual consumption cursor (aesPrefetchCursor, driven
    // by the fetch block above via audio_es_fetch_frame_fn) — the two are only ever
    // re-synced by a seek (see the doSeek branch above, which assigns aesPrefetchCursor
    // straight from this SAME audio_es_pump_cursor_fn getter, confirming both cursors share
    // one frame-index space). Calling the tick unconditionally every iteration (as patch2 v1
    // did) lets its cursor race arbitrarily far ahead of what has actually been consumed —
    // nothing here ever blocked it on real playback progress, so within the first few dozen
    // ticks after playback starts it would prefetch the ENTIRE remaining track over the SAME
    // persistent connection the video pump needs on THIS SAME thread on EVERY tick
    // immediately below — exactly the "aggressive prefetch that races ahead unboundedly and
    // starves the foreground stream's bandwidth" WebSceneMediaAudioEsPrefetchTick's own
    // header comment says never to do; the video side never needs this guard because its own
    // PrefetchTick and its own consumption (WebSceneMediaEsStreamLoop) share ONE cursor, so
    // its window is bounded by construction. Gating on "real consumption has caught up to (or
    // passed) the prefetch frontier" pins the window to AT MOST the 2 blocks (~4s) one call
    // adds ahead of actual playback at all times: refill only once that buffer is exhausted,
    // never before — the audio-side equivalent of the video side's implicit bound.
    if (!want_paused && audio_es_engaged_this_session && !audio_input_done && audio_es_prefetch_tick_fn != NULL && audio_es_pump_cursor_fn != NULL) {
      int32_t aesPrefetchedTo = audio_es_pump_cursor_fn();
      if (aesPrefetchCursor >= aesPrefetchedTo) {
        audio_es_prefetch_tick_fn(2);
      }
    }
    // 修3 (deferred audio open — see the comment at the old pre-loop site above): only after
    // the video pump has demonstrably produced its first AU is the audio track opened over
    // the same connection, once per session. On failure the bundled clip fallback engages,
    // exactly as before, just later.
    if (!aes_attempted && s_stream_prefetch_total > 0) {
      aes_attempted = 1;
      if (audio_es_open_fn != NULL && audio_es_sample_rate_fn != NULL && audio_es_channels_fn != NULL &&
          audio_es_frame_count_fn != NULL && audio_es_fetch_frame_fn != NULL) {
        int32_t aesOpened = audio_es_open_fn(dial_host, dial_port);
        if (aesOpened == 1) {
          int32_t asr = audio_es_sample_rate_fn();
          int32_t ach = audio_es_channels_fn();
          int32_t afc = audio_es_frame_count_fn();
          audio_es_engaged_this_session = cheng_audio_es_engage(asr, ach, afc);
          char aeb[112]; snprintf(aeb, sizeof(aeb), "fetch thread: audio es open=%d sr=%d ch=%d frames=%d engaged=%d",
                                  aesOpened, asr, ach, afc, audio_es_engaged_this_session);
          cheng_media_diag(aeb);
        } else {
          cheng_media_diag("fetch thread: audio es open failed, falling back to local clip audio");
        }
      }
      if (!audio_es_engaged_this_session) {
        cheng_host_extract_rawfile_to_cache("hgs.mp4");
        cheng_audio_play_local_file("/data/storage/el2/base/haps/entry/cache/hgs.mp4", 1);  // loop with the live video
      }
    }
    int32_t loopRc = cheng_scene_media_es_stream_loop();
    if (loopRc == 8) {
      // #14-eos v2: defensive fallback only — the want_paused check added above this loop's
      // audio-prefetch block already intercepts every want_paused==true iteration before
      // control ever reaches this stream_loop call (and mirrors want_paused into the bridge's
      // own paused flag synchronously on this same thread just above, via es_set_paused_fn,
      // the flag's sole writer), so loopRc can no longer actually be 8 here. Left in place
      // (same wait shape, harmless if ever reached) rather than removed, in case a future
      // change to the gate above reintroduces a path where it could fire again.
      // Paused: back off event-driven (no polling) until resumed or torn down — the SAME
      // cv_notfull_fq teardown already broadcasts on, plus cheng_stream_video_request_paused
      // broadcasts it on every request, so this wakes promptly either way. Also wakes (and
      // does NOT re-wait) on a pending seek — a drag-seek while paused must still update the
      // displayed frame, matching every other video player's scrub-while-paused behavior; the
      // seek is applied on the next loop iteration's `if (doSeek)` branch above, then this
      // branch is re-entered (still paused) and goes back to waiting.
      pthread_mutex_lock(&sc->fq_mu);
      while (sc->paused_requested && !sc->seek_requested && !sc->stop) {
        pthread_cond_wait(&sc->cv_notfull_fq, &sc->fq_mu);
      }
      pthread_mutex_unlock(&sc->fq_mu);
      continue;
    }
    if (loopRc == 0) {
      esErrStreak = 0;  // 修1: only CONSECUTIVE failures count
      continue;  // one bounded unit done cleanly — same rc as "call again immediately"
    }
    if (loopRc != 7) {
      // 修1 (2026-07-26 root cause): DO NOT exit on the first error. The bridge's own
      // DeadStreak self-heal needs 3 consecutive failing calls to tear down + redial the
      // session; the old immediate break capped the streak at 1 forever. Bounded retry with
      // event-driven backoff (cv_notfull_fq is broadcast by teardown and pause requests, so
      // this wakes promptly on shutdown); threshold 12 = two full self-heal rounds of margin.
      esErrStreak++;
      if (esErrStreak <= 8 || (esErrStreak % 30) == 0) {
        char lb[80]; snprintf(lb, sizeof(lb), "fetch thread: es pump rc=%d streak=%d", loopRc, esErrStreak); cheng_media_diag(lb);
      }
      if (esErrStreak >= 12) {
        // 修2: exit ritual aligned with the content-mismatch branch above — surface the
        // error to the GUI and release the re-entry gate so a user re-tap gets a genuine
        // retry (the old bare break left sstart latched at 1 with zero GUI signal).
        if (s_runtime_set_state != NULL) {
          char stateVal[64];
          snprintf(stateVal, sizeof(stateVal), "es pump rc=%d after %d retries", loopRc, esErrStreak);
          int errOk = s_runtime_set_state("videoFetchError", stateVal);
          int retryOk = s_runtime_set_state("videoFetchRetryable", "1");
          __android_log_print((errOk != 0 && retryOk != 0) ? ANDROID_LOG_INFO : ANDROID_LOG_ERROR, "ChengMD",
                              "fetch thread: videoFetchError state write err_ok=%d retryable_ok=%d (pump give-up)", errOk, retryOk);
        } else {
          __android_log_print(ANDROID_LOG_ERROR, "ChengMD", "fetch thread: runtime set_state unavailable, pump give-up NOT surfaced to GUI");
        }
        s_stream_starting = 0;  // release the re-entry gate — abort-must-unlatch
        char lb[80]; snprintf(lb, sizeof(lb), "fetch thread: es pump gave up rc=%d after %d streaks", loopRc, esErrStreak); cheng_media_diag(lb);
        break;
      }
      pthread_mutex_lock(&sc->fq_mu);
      if (!sc->stop) {
        struct timespec bts; clock_gettime(CLOCK_REALTIME, &bts);  // cv is default-attr = CLOCK_REALTIME
        long backoff_ms = 100L * (esErrStreak < 5 ? esErrStreak : 5);
        bts.tv_nsec += backoff_ms * 1000000L;
        bts.tv_sec += bts.tv_nsec / 1000000000L;
        bts.tv_nsec %= 1000000000L;
        pthread_cond_timedwait(&sc->cv_notfull_fq, &sc->fq_mu, &bts);
      }
      int stop_now = sc->stop;
      pthread_mutex_unlock(&sc->fq_mu);
      if (stop_now) break;
      continue;
    }
    esErrStreak = 0;  // 修1: rc==7 is source exhaustion, not a failure
    // #14-eos: loopRc==7 — the video ES pump cursor has passed the last frame (source
    // exhaustion, not an error). Mark the video decoder's input side done ONCE so
    // cheng_stream_on_need_input's EOS branch fires instead of waiting forever, but do
    // NOT exit this thread yet — the audio producer (if this session has one) may still
    // have frames left to drain (see the prefetch block above), and this thread is the
    // only one that can ever fetch them.
    if (!video_input_done) {
      cheng_media_diag("fetch thread: video ES source exhausted (loopRc=7)");
      cheng_stream_mark_video_input_done(sc);
      video_input_done = 1;
    }
    if (audio_input_done || audio_es_fetch_frame_fn == NULL) {
      // Both producers this session actually has are exhausted (or this session never had
      // a network audio track to begin with — audio_es_fetch_frame_fn==NULL, the same
      // fail-open case handled everywhere else in this function): the network path has
      // now also reached its own end-of-stream. Reuses the existing s_stream_src_eof latch
      // (previously only ever set by the LOCAL-file worker, see cheng_stream_local_file_
      // worker) — the render thread's existing s_stream_eos block (s_surf_mode branch
      // above) already knows how to consume it and drive the playback_eos/vsync-disengage/
      // endurance-report sequence, network path included, from here on.
      __atomic_store_n(&s_stream_src_eof, 1, __ATOMIC_SEQ_CST);
      cheng_media_diag("fetch thread: network EOS (video+audio producers exhausted), thread exiting");
      break;
    }
  }
  return NULL;
}
fn_img_CreateFromFd p_CreateFromFd;
fn_img_CreatePixelmap p_CreatePixelmap;
fn_img_SrcRelease p_SrcRelease;
fn_dopt_Create p_DoptCreate;
fn_dopt_SetPixelFormat p_DoptSetPixelFormat;
fn_dopt_Release p_DoptRelease;
fn_iinfo_Create p_IInfoCreate;
fn_pm_GetImageInfo p_GetImageInfo;
fn_iinfo_GetU32 p_GetWidth, p_GetHeight, p_GetRowStride;
fn_iinfo_Release p_IInfoRelease;
fn_pm_ReadPixels p_ReadPixels;
fn_pm_Release p_PmRelease;
static int cheng_ohos_decode_image_rgba(const char* path, unsigned char** out_rgba, int* out_w, int* out_h) {
  *out_rgba = NULL; *out_w = 0; *out_h = 0;
  if (!cheng_img_ndk_load()) return 0;
  int fd = open(path, O_RDONLY);
  if (fd < 0) { cheng_media_diag("img open fail"); return 0; }
  OH_ImageSourceNative* src = NULL;
  if (p_CreateFromFd(fd, &src) != CHENG_IMAGE_SUCCESS || src == NULL) {
    close(fd); cheng_media_diag("img CreateFromFd fail"); return 0;
  }
  OH_DecodingOptions* opts = NULL;
  p_DoptCreate(&opts);
  if (opts != NULL) p_DoptSetPixelFormat(opts, CHENG_PIXEL_FORMAT_RGBA_8888);
  OH_PixelmapNative* pm = NULL;
  int rc = p_CreatePixelmap(src, opts, &pm);
  if (opts != NULL) p_DoptRelease(opts);
  if (rc != CHENG_IMAGE_SUCCESS || pm == NULL) {
    p_SrcRelease(src); close(fd); cheng_media_diag("img CreatePixelmap fail"); return 0;
  }
  uint32_t w = 0, h = 0, rowStride = 0;
  OH_Pixelmap_ImageInfo* info = NULL;
  p_IInfoCreate(&info);
  p_GetImageInfo(pm, info);
  p_GetWidth(info, &w);
  p_GetHeight(info, &h);
  p_GetRowStride(info, &rowStride);
  p_IInfoRelease(info);
  if (rowStride < w * 4u) rowStride = w * 4u;
  unsigned char* rgba = NULL;
  if (w > 0 && h > 0) {
    size_t bufSize = (size_t)rowStride * (size_t)h;
    unsigned char* tmp = (unsigned char*)malloc(bufSize);
    if (tmp != NULL) {
      size_t got = bufSize;
      if (p_ReadPixels(pm, tmp, &got) == CHENG_IMAGE_SUCCESS) {
        rgba = (unsigned char*)malloc((size_t)w * (size_t)h * 4);
        if (rgba != NULL) {
          for (uint32_t y = 0; y < h; y++) {
            memcpy(rgba + (size_t)y * (size_t)w * 4, tmp + (size_t)y * (size_t)rowStride, (size_t)w * 4);
          }
        }
      }
      free(tmp);
    }
  }
  p_PmRelease(pm);
  p_SrcRelease(src);
  close(fd);
  if (rgba != NULL) {
    *out_rgba = rgba; *out_w = (int)w; *out_h = (int)h;
    char b[96]; snprintf(b, sizeof(b), "img decode OK %ux%u", w, h);
    cheng_media_diag(b);
    return 1;
  }
  cheng_media_diag("img decode no pixels");
  return 0;
}

// Video-card poster (posterCid) decode for the home feed's not-yet-playing surface. The
// asset ships as a HAP rawfile at runtime/media/assets/<posterCid>.png (same relative
// layout the Android reference host reads via assets.open(), see mobile_shell_codegen.cheng's
// "runtime/media/assets/%s.png" poster paths) — rawfiles live inside the packaged HAP, not
// the filesystem, so OH_ImageSourceNative can't open them directly; extract to a REAL cache
// file first (same pattern cheng_host_extract_rawfile_to_cache uses for hgs.mp4), then decode
// via cheng_ohos_decode_image_rgba. The cache filename is keyed by posterCid (not a shared
// single slot like xdev_poster.png) so distinct cards keep distinct cached posters.
static int cheng_ohos_decode_video_poster_rgba(const char* posterCid, unsigned char** out_rgba, int* out_w, int* out_h) {
  *out_rgba = NULL; *out_w = 0; *out_h = 0;
  if (posterCid == NULL || posterCid[0] == '\0') {
    cheng_media_diag("video poster: empty posterCid");
    return 0;
  }
  char rel[192];
  int relLen = snprintf(rel, sizeof(rel), "runtime/media/assets/%s.png", posterCid);
  if (relLen <= 0 || relLen >= (int)sizeof(rel)) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "video poster: rel path overflow cid=%s", posterCid);
    return 0;
  }
  char cachePath[256];
  int cacheLen = snprintf(cachePath, sizeof(cachePath),
      "/data/storage/el2/base/haps/entry/cache/video_poster_%s.png", posterCid);
  if (cacheLen <= 0 || cacheLen >= (int)sizeof(cachePath)) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "video poster: cache path overflow cid=%s", posterCid);
    return 0;
  }
  if (access(cachePath, R_OK) != 0) {
    NativeResourceManager* rm = (NativeResourceManager*)cheng_ohos_resource_manager();
    if (rm == NULL) {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "video poster: no resource manager rel=%s", rel);
      return 0;
    }
    RawFile* rf = OH_ResourceManager_OpenRawFile(rm, rel);
    if (rf == NULL) {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "video poster: rawfile missing rel=%s", rel);
      return 0;
    }
    long len = OH_ResourceManager_GetRawFileSize(rf);
    int extracted = 0;
    if (len > 0) {
      uint8_t* buf = (uint8_t*)malloc((size_t)len);
      if (buf != NULL) {
        long got = 0;
        while (got < len) {
          int n = OH_ResourceManager_ReadRawFile(rf, buf + got, (size_t)(len - got));
          if (n <= 0) break;
          got += n;
        }
        if (got == len) {
          FILE* f = fopen(cachePath, "wb");
          if (f != NULL) {
            extracted = (fwrite(buf, 1, (size_t)len, f) == (size_t)len) ? 1 : 0;
            fclose(f);
            if (!extracted) {
              __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "video poster: cache write short cid=%s", posterCid);
            }
          } else {
            __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "video poster: cache open failed %s", cachePath);
          }
        } else {
          __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                              "video poster: rawfile short read rel=%s got=%ld expected=%ld", rel, got, len);
        }
        free(buf);
      }
    } else {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "video poster: rawfile empty rel=%s", rel);
    }
    OH_ResourceManager_CloseRawFile(rf);
    if (!extracted) return 0;
  }
  if (!cheng_ohos_decode_image_rgba(cachePath, out_rgba, out_w, out_h)) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "video poster: decode failed cid=%s path=%s", posterCid, cachePath);
    return 0;
  }
  return 1;
}

int cheng_mobile_host_prepare_media_surface_texture(int kindCode,
                                                    int surfaceKind,
                                                    int textureProvider,
                                                    const char* slotId,
                                                    const char* assetCid,
                                                    const char* manifestCid,
                                                    const char* posterCid,
                                                    int width,
                                                    int height,
                                                    const char* peerHost,
                                                    int peerPort,
                                                    int playbackState) {
  // The scene's prepare loop (__csg_scene_prepare_media_surface_textures) FAILS
  // the whole batch (and clears every overlay) unless EACH surface returns 1, and
  // present_media_surface_commands then clears the batch unless EVERY command's
  // texture is found in the cache. So a texture must be registered for every media
  // surface (video/image/audio), and prepare must return 1 on success / 0 on fail
  // (NOT the status enum — STATUS_READY=3 would read as "!=1" and fail the batch).
  // playbackState is the FFI contract's 12th argument (scene-runtime-smoke-source.mjs
  // @importc declares it, mirroring MobileShellAndroidHostSource's playbackWantsVideo
  // param) — Harmony has no per-card MediaPlayer state (one fullscreen route is active
  // at a time, not one MediaPlayer per card), so this host still gates poster-vs-play
  // on the route table below (cheng_gui_host_route_is_fullscreen_video), not on
  // playbackState directly; accepting the 12th parameter here (instead of silently
  // dropping it, the pre-absorption bug this generator now fixes) keeps the call ABI
  // honest and the value is folded into the entry diagnostic for future correlation.
  (void)width; (void)height;
  // Hash the identifiers the SAME way the scene encodes the present command
  // (WebSceneResourceIdHash31 == cheng_android_hash31, FNV-1a 31-bit), so the
  // registered texture is found by the present/draw path at draw time.
  int slotHash = cheng_android_hash31(slotId);
  int assetHash = cheng_android_hash31(assetCid);
  int manifestHash = cheng_android_hash31(manifestCid);
  int posterHash = cheng_android_hash31(posterCid);
  { static int s_prepdiag = 0; if (s_prepdiag < 40) { char pd[192]; snprintf(pd, sizeof(pd), "PREP entry kind=%d sstart=%d playback=%d poster=%s", kindCode, s_stream_starting, playbackState, posterCid != NULL ? posterCid : "<null>"); cheng_media_diag(pd); s_prepdiag++; } }
  // 秒开 feed (route 0) QUIC prewarm (S3 N≤2 skeleton): accumulate peerHost/peerPort from
  // visible feed video cards BEFORE the cache-hit early return (device-verified: cache-hit
  // used to eat the one-shot window). Env CHENG_FEED_MEDIA_PREWARM=0 disables. Plan grows
  // to N=2 distinct peers; first registration also spawns the dial worker (plan0 dial+index;
  // plan1 deferred — global ES session). Mutually exclusive with fullscreen fetch-gate.
  if (kindCode == CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE) {
    int prewarm_route = s_app_debug_route_index ? s_app_debug_route_index() : -1;
    int prewarm_peer_ok = (peerHost != NULL && peerHost[0] != '\0');
    const char* prewarm_gate = getenv("CHENG_FEED_MEDIA_PREWARM");
    int prewarm_env_off = (prewarm_gate != NULL && prewarm_gate[0] == '0' && prewarm_gate[1] == '\0');
    { static int s_prewarmgatediag = 0; if (s_prewarmgatediag < 20) {
        char pwd[160];
        snprintf(pwd, sizeof(pwd), "PREP prewarm-gate route=%d peer=%s env_off=%d plan=%d",
                 prewarm_route, prewarm_peer_ok ? peerHost : "<empty>",
                 prewarm_env_off, (int)s_prewarm_plan_count);
        cheng_media_diag(pwd);
        s_prewarmgatediag++;
    } }
    if (!prewarm_env_off && prewarm_peer_ok && prewarm_route == 0) {
      int port = (peerPort > 0) ? peerPort : 38000;
      int already = 0;
      for (int i = 0; i < s_prewarm_plan_count && i < CHENG_FEED_PREWARM_N; i++) {
        if (strcmp(s_prewarm_hosts[i], peerHost) == 0 && s_prewarm_ports[i] == port) {
          already = 1;
          break;
        }
      }
      if (!already && s_prewarm_plan_count < CHENG_FEED_PREWARM_N) {
        int idx = s_prewarm_plan_count;
        snprintf(s_prewarm_hosts[idx], sizeof(s_prewarm_hosts[idx]), "%s", peerHost);
        s_prewarm_ports[idx] = port;
        s_prewarm_plan_count = idx + 1;
        if (idx == 0) {
          snprintf(s_prewarm_peer_host, sizeof(s_prewarm_peer_host), "%s", peerHost);
          s_prewarm_peer_port = port;
        }
        char ab[128];
        snprintf(ab, sizeof(ab), "prepare feed: prewarm plan[%d]=%s:%d (n=%d)",
                 idx, peerHost, port, (int)s_prewarm_plan_count);
        cheng_media_diag(ab);
      }
      if (!s_prewarm_started && s_prewarm_plan_count > 0) {
        s_prewarm_started = 1;
        if (pthread_create(&s_prewarm_thread, NULL, cheng_stream_prewarm_worker, NULL) == 0) {
          s_prewarm_thread_started = 1;
          cheng_media_diag("prepare feed: prewarm dial worker spawned");
        } else {
          s_prewarm_started = 0;   // spawn failed → honest no-op, allow a later card to retry
          cheng_media_diag("prepare feed: prewarm spawn FAILED");
        }
      }
    }
  }
  // Click-to-play gate (no autoplay): only start the video fetch when the active route is
  // a fullscreen video detail (one per video card, or the legacy content_detail=1), NOT on
  // the home feed (route 0). The home card prepare still registers a placeholder/poster
  // surface below but never spawns the QUIC fetch — so the video plays only after the user
  // taps the card and enters fullscreen. Route indices resolved from scene.csgc. Computed
  // here (BEFORE the cache-hit check below, not just inside the video kindCode branch as
  // originally) because the cache-hit gate itself now needs to know whether a previously
  // registered texture for this identity was ever anything more than the not-fullscreen
  // 2x2 navy placeholder (poster-lock fix, see the cache-hit block).
  int cur_route = (kindCode == CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE)
      ? (s_app_debug_route_index ? s_app_debug_route_index() : -1) : -1;
  // M1 slice-5 (2026-07-10): the gate below queries the App core's own generated route
  // table (cheng_gui_host_route_is_fullscreen_video, see its declaration comment above)
  // instead of a host-side literal range — it covers however many per-card fan-out routes
  // the current fixture has. Local-vs-network is decided separately, by this card's own
  // peer (below), not by which route index was hit.
  int is_fullscreen_video = cheng_gui_host_route_is_fullscreen_video(cur_route);
  if (slotHash <= 0 || assetHash <= 0 || manifestHash <= 0 || posterHash <= 0) {
    return 0;
  }
  // Click-to-play fetch gate — HOISTED ABOVE the texture cache-hit return (2026-07-26 device
  // 定谳). It used to live inside the video branch BELOW the cache-hit early return, so any
  // session whose texture identity was already registered (fullscreen-restore plants the 2x2
  // placeholder during the route transition; a dial abort leaves the entry valid) could NEVER
  // reach it again: cache hit → return 1 → stream never starts / never retries, matching the
  // real-device symptom "playback=2, sstart stays 0, no spawn log ever" on both the restore
  // path and the abort-retry path. The gate is self-guarded (s_stream_starting latch +
  // is_fullscreen_video) and owns no texture-cache state — texture reuse and stream lifecycle
  // are independent decisions, so the gate must not be starved by a texture hit.
  if (kindCode == CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE &&
      !s_stream_starting && is_fullscreen_video) {
      s_stream_starting = 1;
      s_fetch_route = cur_route;
      // 秒开 t0: the tap that brought this fullscreen video route active spawns the fetch.
      // Reset the segment clock so the one-shot open_to_first_frame report measures this open.
      s_ff_t0_spawn_ns = cheng_monotime_ns();
      s_ff_dial_start_ns = 0; s_ff_dial_done_ns = 0; s_ff_index_done_ns = 0;
      s_ff_first_sink_ns = 0; s_ff_first_present_ns = 0; s_ff_reported = 0;
      // Capture this card's peer透传 for the fetch worker (see s_fetch_peer_host). Written
      // before the worker spawns, under the s_stream_starting guard (single fetch at a time).
      if (peerHost != NULL && peerHost[0] != '\0') {
        snprintf(s_fetch_peer_host, sizeof(s_fetch_peer_host), "%s", peerHost);
        s_fetch_peer_port = peerPort;
      } else {
        s_fetch_peer_host[0] = '\0';
        s_fetch_peer_port = 0;
      }
      // Capture the expected content id alongside the peer (see s_fetch_asset_cid) so the
      // fetch worker can verify the dial actually landed on this card's content, not a
      // rotated one.
      snprintf(s_fetch_asset_cid, sizeof(s_fetch_asset_cid), "%s", assetCid != NULL ? assetCid : "");
      // Create the decode-to-surface OES texture + native window HERE (render thread,
      // EGL context current) BEFORE spawning the fetch thread, so the decoder's
      // SetSurface (fetch thread) finds s_surf_window ready — no cross-thread handshake.
      cheng_surface_create_oes();
      // Spawn the dedicated fetch thread so the render thread NEVER blocks. Local-vs-network
      // is decided by THIS card's own peer (captured just above), not by route index: a peer
      // equal to this device's own IP (real getifaddrs() discovery, M1 slice-5 — see
      // cheng_gui_host_peer_matches_own_ip's declaration comment above) means the card's
      // video IS this device's bundled asset (麦田) — decode the local rawfile, no QUIC; any
      // other peer streams from that peer over QUIC (胡广生, or a future third card,
      // uniformly). An EMPTY peer (no sourcePeer stamped at publish time) carries the SAME
      // meaning as "peer == own IP": this card was never given a remote source, so it IS
      // local/bundled content — also routes to the local worker, never a guessed network
      // dial (this replaces the historical ".3 default" that silently masked the missing
      // sourcePeer as a coincidentally-correct dial; peerhost-pipeline-break-v10 定谳).
      // Both branches feed the same OES surface.
      int fetch_peer_is_local = (s_fetch_peer_host[0] == '\0')
        || cheng_gui_host_peer_matches_own_ip(s_fetch_peer_host);
      void* (*worker)(void*) = fetch_peer_is_local
        ? cheng_stream_local_file_worker : cheng_stream_fetch_worker;
      // A retry after an aborted attempt (s_stream_starting was just released by that
      // worker's own early return, see the abort-must-unlatch note in cheng_stream_fetch_worker
      // above) leaves s_fetch_thread_started still 1 with a finished-but-unjoined thread
      // handle in s_fetch_thread — overwriting it via pthread_create below without joining
      // first would leak that thread's resources on every retry. Mirrors the existing
      // prewarm-join-before-dial precedent a few lines up; the target already returned (or
      // is about to, having just cleared s_stream_starting itself), so this join cannot block.
      if (s_fetch_thread_started) {
        pthread_join(s_fetch_thread, NULL);
        s_fetch_thread_started = 0;
        cheng_media_diag("prepare video: joined aborted fetch thread before retry");
      }
      if (pthread_create(&s_fetch_thread, NULL, worker, NULL) == 0) {
        s_fetch_thread_started = 1;
        cheng_media_diag(fetch_peer_is_local
          ? "prepare video: LOCAL maitian worker spawned" : "prepare video: fetch thread spawned");
      } else {
        cheng_media_diag("prepare video: fetch thread spawn FAILED");
      }
  }
  // Already decoded+registered (cache hit) — skip rework, the texture persists. EXCEPT: a
  // video card's not-yet-playing (poster) surface only ever gets registered with the real
  // decoded posterCid pixels when the card was NOT fullscreen at prepare time (see the
  // video branch below); every other route through this function (fullscreen's own
  // initial registration, before its streaming frames start arriving) plants the 2x2 navy
  // "vp" placeholder instead. Because the cache key is the SAME slot/asset/manifest/poster
  // identity regardless of which route registered it first, a card that was ever opened
  // fullscreen even once (or whose very first poster decode attempt failed) would
  // otherwise lock this cache entry at 2x2 forever — the not-fullscreen branch below would
  // never run again for that identity, matching the device symptom of zero
  // cheng_ohos_decode_video_poster_rgba calls ever. So: a hit is only treated as "done"
  // when it is NOT an unresolved 2x2 poster placeholder currently being viewed
  // not-fullscreen — in that one case, fall through and retry the real poster decode,
  // freeing the stale placeholder texture first so it isn't leaked.
  ChengAndroidMediaTextureCache* existing = cheng_android_find_media_texture(
      kindCode, surfaceKind, textureProvider, slotHash, assetHash, manifestHash, posterHash);
  if (existing != NULL && existing->valid && existing->gl_texture != 0u) {
    int existingIsUnresolvedPoster = (kindCode == CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE) &&
        !is_fullscreen_video && existing->width == 2 && existing->height == 2;
    if (!existingIsUnresolvedPoster) {
      return 1;
    }
    GLuint stalePlaceholderTexture = existing->gl_texture;
    existing->valid = 0;
    existing->gl_texture = 0u;
    if (stalePlaceholderTexture != 0u) {
      glDeleteTextures(1, &stalePlaceholderTexture);
    }
    cheng_media_diag("prepare video: retrying poster decode after unresolved 2x2 placeholder");
  }
  // Produce the surface texels. Video first-frame = decode the cross-device
  // fetched mp4 (Android publisher -> this Harmony GUI); image/audio still use a
  // tagged solid placeholder (cyan/yellow) until their decoders are wired.
  int texW = 0, texH = 0;
  unsigned char* pixels = NULL;
  int freePixels = 0;
  unsigned char placeholder[2 * 2 * 4];
  if (kindCode == CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE) {
    // MoQ-over-QUIC PROGRESSIVE streaming. The Cheng runtime is SINGLE-THREADED, so
    // the QUIC session open + decoder start run synchronously on the render thread
    // (a background pthread calling the Cheng bridge corrupts the runtime). This is
    // the same render-thread fetch pattern the first-frame 秒开 used. Started once;
    // draw_registered then consumes the ring into the shared stream texture.
    // The click-to-play fetch gate that lived HERE is hoisted above the texture cache-hit
    // return (see its new site right after the hash guard, 2026-07-26) — a registered
    // texture identity used to starve it forever on the fullscreen-restore and abort-retry
    // paths. Texture production below is unchanged.
    // Feed (route 0) prewarm now runs at function entry (see the top of
    // cheng_mobile_host_prepare_media_surface_texture) — device-verified 3/3 real sessions
    // (v5_dirA_r1/r2/r3_hilog.txt) show the cache-hit return above starves this exact spot
    // after the FIRST successful registration, so a gate placed here never gets a second
    // try for the rest of the feed dwell. Hoisting closes that race; cur_route computed
    // above is still used by the fetch-gate directly above, unchanged.
    GLuint vtex = 0u;
    glGenTextures(1, &vtex);
    if (vtex == 0u) {
      // Miss must be loud: this fires iff no EGL/GL context is current on this
      // thread yet (see the cheng_android_gpu_ensure() call cheng_gui_host_tick()
      // now does up front) or the driver is in a bad state — either way silently
      // returning 0 here used to retry forever with zero signal (device-verified
      // deadlock, see cheng_gui_host_tick).
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                          "prepare_media_surface glGenTextures failed kind=%d glCtx=%p glErr=0x%x",
                          kindCode, (void*)eglGetCurrentContext(), (unsigned)glGetError());
      return 0;
    }
    unsigned char vp[2 * 2 * 4];
    for (int p = 0; p < 4; p++) { vp[p * 4 + 0] = 16; vp[p * 4 + 1] = 18; vp[p * 4 + 2] = 28; vp[p * 4 + 3] = 255; }
    // Home feed (not fullscreen, not playing): decode this card's REAL posterCid instead of
    // the solid navy placeholder above, so the card shows its own artwork under the ▶ icon
    // instead of a black rectangle. Fullscreen playback is untouched — it still starts from
    // the solid placeholder (replaced within one decoded frame by the streaming path below),
    // so no poster-decode latency is added to the 秒开 fullscreen-open hot path.
    unsigned char* posterPixels = NULL;
    int posterFreePixels = 0;
    int posterW = 0, posterH = 0;
    if (!is_fullscreen_video) {
      if (!cheng_ohos_decode_video_poster_rgba(posterCid, &posterPixels, &posterW, &posterH) || posterPixels == NULL) {
        __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                            "prepare video: poster decode failed cid=%s slot=%s, falling back to placeholder",
                            posterCid != NULL ? posterCid : "<null>", slotId != NULL ? slotId : "<null>");
        posterPixels = NULL;
      } else {
        posterFreePixels = 1;
      }
    }
    int texUseW = (posterPixels != NULL) ? posterW : 2;
    int texUseH = (posterPixels != NULL) ? posterH : 2;
    glBindTexture(GL_TEXTURE_2D, vtex);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, texUseW, texUseH, 0, GL_RGBA, GL_UNSIGNED_BYTE,
                 posterPixels != NULL ? posterPixels : vp);
    glBindTexture(GL_TEXTURE_2D, 0u);
    if (posterFreePixels) free(posterPixels);
    int okv = cheng_mobile_host_register_media_surface_texture(
        kindCode, surfaceKind, textureProvider, slotHash, assetHash, manifestHash, posterHash,
        vtex, texUseW, texUseH, GL_RGBA);
    ChengAndroidMediaTextureCache* vc = cheng_android_find_media_texture(
        kindCode, surfaceKind, textureProvider, slotHash, assetHash, manifestHash, posterHash);
    if (vc != NULL) {
      vc->video_tex = vtex;  // placeholder; draw swaps in the shared stream texture
      s_video_active = 1;    // keep the render loop presenting for smooth playback
      // (vsync engage is NOT called here — cheng_gui_host_tick's self-healing invariant
      // picks this up on the next tick regardless of whether this call site was reached
      // via cache-miss or cache-hit; see the tick() comment for why enumerating engage
      // call sites here was the actual bug.)
      // Record which cache entry now owns the stream this call just spawned (this
      // whole video branch only runs on a genuine cache MISS — a cache-hit already
      // returned at the top of the function), so cheng_stream_teardown_active can
      // invalidate exactly this entry on route-leave. See s_active_stream_texture's
      // declaration comment (replayblack fix, 2026-07-11).
      s_active_stream_texture = vc;
    } else {
      glDeleteTextures(1, &vtex);
    }
    return (okv && vc != NULL) ? 1 : 0;
  } else if (kindCode == CHENG_ANDROID_MEDIA_SURFACE_IMAGE_RASTER_TEXTURE) {
    // Image card: the poster (463998 B) moves over the kernel-TCP side channel, not
    // the QUIC datapath — the pure-Cheng QUIC has no STREAM-data loss recovery yet,
    // so a large transfer stalls, while the OS kernel TCP stack delivers it reliably
    // (the same transport the ChengPerAppVPN uses for large traffic). Fetch on demand
    // to THIS card's own peerHost/peerPort (the same sourcePeer透传 the video branch
    // uses — peerHost/peerPort are this function's own params), then decode via the
    // dlopen'd image NDK. No IP-literal fallback: an empty peerHost means no
    // sourcePeer (local content semantics, same contract as the video path) — skip
    // the network fetch rather than guessing an address; the decode-fail branch
    // below already handles "no poster available" with a placeholder texture. No
    // placeholder fallback: a miss leaves the surface unprepared so only the real
    // decoded poster is ever shown.
    const char* png = "/data/storage/el2/base/haps/entry/cache/xdev_poster.png";
    if (access(png, R_OK) != 0) {
      if (peerHost != NULL && peerHost[0] != '\0') {
        extern int32_t cheng_scene_media_fetch_remote_poster_tcp_to_file(const char* host, int32_t port, const char* outPath);
        int32_t pb = cheng_scene_media_fetch_remote_poster_tcp_to_file(peerHost, peerPort > 0 ? peerPort : 38000, png);
        char pbuf[96]; snprintf(pbuf, sizeof(pbuf), "prepare poster tcp fetch bytes=%d", pb);
        cheng_media_diag(pbuf);
      } else {
        cheng_media_diag("prepare poster: no sourcePeer -> local content semantics, skip network fetch");
      }
    }
    if (!cheng_ohos_decode_image_rgba(png, &pixels, &texW, &texH)) {
      // #31: a poster fetch/decode MISS must NOT fail the whole media-surface batch.
      // The scene's prepare loop fails the entire batch (blocking the sibling VIDEO
      // card's prepare → no streaming playback) unless every surface returns 1. So on
      // a poster miss, register a placeholder texture (same as the image else-branch)
      // and return 1, letting the video surface get prepared.
      texW = 2; texH = 2;
      for (int p = 0; p < texW * texH; p++) {
        placeholder[p * 4 + 0] = 24; placeholder[p * 4 + 1] = 26; placeholder[p * 4 + 2] = 38; placeholder[p * 4 + 3] = 255;
      }
      pixels = placeholder;
      freePixels = 0;
    } else {
      freePixels = 1;
    }
  } else {
    texW = 2; texH = 2;
    for (int p = 0; p < texW * texH; p++) {
      placeholder[p * 4 + 0] = 24; placeholder[p * 4 + 1] = 26; placeholder[p * 4 + 2] = 38; placeholder[p * 4 + 3] = 255;
    }
    pixels = placeholder;
  }
  GLuint glTex = 0u;
  glGenTextures(1, &glTex);
  if (glTex == 0u) {
    if (freePixels) free(pixels);
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "prepare_media_surface glGenTextures failed (no GL context?) kind=%d", kindCode);
    return 0;
  }
  glBindTexture(GL_TEXTURE_2D, glTex);
  glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, texW, texH, 0, GL_RGBA, GL_UNSIGNED_BYTE, pixels);
  glBindTexture(GL_TEXTURE_2D, 0u);
  if (freePixels) free(pixels);
  int ok = cheng_mobile_host_register_media_surface_texture(
      kindCode, surfaceKind, textureProvider,
      slotHash, assetHash, manifestHash, posterHash,
      glTex, texW, texH, GL_RGBA);
  {
    char buf[200];
    snprintf(buf, sizeof(buf), "PREPARE kind=%d surf=%d provider=%d hashes=%d,%d,%d,%d glTex=%u ok=%d",
             kindCode, surfaceKind, textureProvider, slotHash, assetHash, manifestHash, posterHash, glTex, ok);
    cheng_media_diag(buf);
  }
  return ok ? 1 : 0;
}
int cheng_mobile_host_register_media_surface_texture(int kindCode, int surfaceKind, int textureProvider, int slotHash, int assetHash, int manifestHash, int posterHash, unsigned int glTexture, int width, int height, int pixelFormat) {
  if (kindCode <= 0 || kindCode > CHENG_ANDROID_MEDIA_SURFACE_AUDIO_COVER_TEXTURE ||
      surfaceKind != kindCode ||
      (textureProvider != CHENG_ANDROID_MEDIA_TEXTURE_PROVIDER_METAL_SURFACE &&
       textureProvider != CHENG_ANDROID_MEDIA_TEXTURE_PROVIDER_SURFACE) ||
      slotHash <= 0 || assetHash <= 0 || manifestHash <= 0 || posterHash <= 0 ||
      glTexture == 0u || width <= 0 || height <= 0 || pixelFormat <= 0) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "register_media_texture invalid kind=%d surface=%d provider=%d hashes=%d,%d,%d,%d texture=%u size=%dx%d pixel=%d",
                        kindCode, surfaceKind, textureProvider, slotHash, assetHash, manifestHash, posterHash,
                        glTexture, width, height, pixelFormat);
    return 0;
  }
  ChengAndroidMediaTextureCache* texture = cheng_android_find_or_allocate_media_texture(kindCode, surfaceKind, textureProvider, slotHash, assetHash, manifestHash, posterHash);
  if (texture == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "register_media_texture cache_full cap=%d", CHENG_ANDROID_MEDIA_TEXTURE_CACHE_CAP);
    return 0;
  }
  texture->valid = 1;
  texture->kind_code = kindCode;
  texture->surface_kind = surfaceKind;
  texture->texture_provider = textureProvider;
  texture->slot_hash = slotHash;
  texture->asset_hash = assetHash;
  texture->manifest_hash = manifestHash;
  texture->poster_hash = posterHash;
  texture->width = width;
  texture->height = height;
  texture->pixel_format = pixelFormat;
  texture->texture_target = GL_TEXTURE_2D;
  texture->gl_texture = (GLuint)glTexture;
  cheng_android_record_media_surface_prepare(CHENG_ANDROID_MEDIA_SURFACE_STATUS_READY,
                                             kindCode, surfaceKind, textureProvider,
                                             slotHash, assetHash, manifestHash, posterHash,
                                             glTexture, width, height, pixelFormat, GL_TEXTURE_2D);
  __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell",
                      "register_media_texture ok kind=%d provider=%d hashes=%d,%d,%d,%d texture=%u size=%dx%d pixel=%d receipt=%d,%d,%d,%d,%d,%d",
                      kindCode, textureProvider, slotHash, assetHash, manifestHash, posterHash, glTexture, width, height, pixelFormat,
                      s_media_surface_prepare_count, s_media_surface_prepare_status,
                      s_media_surface_prepare_kind, s_media_surface_prepare_surface_kind,
                      s_media_surface_prepare_gl_texture, s_media_surface_prepare_pixel_format);
  return 1;
}

void cheng_mobile_host_upload_image_atlas(const int32_t* entries, int entryCount, int entryStrideI32, const int32_t* pixels, int pixelCount) {
  if (entries == NULL || pixels == NULL || entryCount <= 0 || entryCount > CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP || entryStrideI32 < CHENG_ANDROID_IMAGE_ATLAS_HOST_STRIDE_I32 || pixelCount <= 0) {
    CHENG_HOST_LOG_ERROR(
                        "upload_image invalid args entries=%p entryCount=%d entryStride=%d pixels=%p pixelCount=%d",
                        (const void*)entries, entryCount, entryStrideI32, (const void*)pixels, pixelCount);
    abort();
  }
  CHENG_HOST_LOG_INFO(
                      "upload_image begin entryCount=%d entryStride=%d pixelCount=%d",
                      entryCount, entryStrideI32, pixelCount);
  ChengAndroidImageTextureCache new_textures[CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP];
  memset(new_textures, 0, sizeof(new_textures));
  for (int i = 0; i < entryCount; i++) {
    const int32_t* entry = entries + ((size_t)i * (size_t)entryStrideI32);
    int texture_id = (int)entry[0];
    int width = (int)entry[1];
    int height = (int)entry[2];
    int pixel_start = (int)entry[3];
    int entry_pixel_count = (int)entry[4];
    if (texture_id <= 0 || width <= 0 || height <= 0 || pixel_start < 0 || entry_pixel_count <= 0 || pixel_start > pixelCount || entry_pixel_count > pixelCount - pixel_start) {
      for (int cleanup = 0; cleanup < i; cleanup++) {
        free(new_textures[cleanup].pixels);
      }
      abort();
    }
    if ((int64_t)entry_pixel_count != (int64_t)width * (int64_t)height) {
      for (int cleanup = 0; cleanup < i; cleanup++) {
        free(new_textures[cleanup].pixels);
      }
      abort();
    }
    for (int j = 0; j < i; j++) {
      if (new_textures[j].valid && new_textures[j].texture_id == texture_id) {
        for (int cleanup = 0; cleanup < i; cleanup++) {
          free(new_textures[cleanup].pixels);
        }
        abort();
      }
    }
    uint8_t* rgba = (uint8_t*)malloc((size_t)entry_pixel_count * 4u);
    if (rgba == NULL) {
      for (int cleanup = 0; cleanup < i; cleanup++) {
        free(new_textures[cleanup].pixels);
      }
      abort();
    }
    for (int pixel_index = 0; pixel_index < entry_pixel_count; pixel_index++) {
      uint32_t argb = (uint32_t)pixels[pixel_start + pixel_index];
      uint32_t alpha = (argb >> 24u) & 0xffu;
      uint32_t red = (argb >> 16u) & 0xffu;
      uint32_t green = (argb >> 8u) & 0xffu;
      uint32_t blue = argb & 0xffu;
      size_t byte_index = (size_t)pixel_index * 4u;
      rgba[byte_index + 0u] = (uint8_t)((red * alpha + 127u) / 255u);
      rgba[byte_index + 1u] = (uint8_t)((green * alpha + 127u) / 255u);
      rgba[byte_index + 2u] = (uint8_t)((blue * alpha + 127u) / 255u);
      rgba[byte_index + 3u] = (uint8_t)alpha;
    }
    new_textures[i].valid = 1;
    new_textures[i].texture_id = texture_id;
    new_textures[i].width = width;
     new_textures[i].height = height;
     new_textures[i].pixel_count = entry_pixel_count;
     new_textures[i].pixels = rgba;
   }
   int total_entry_count = entryCount;
   int total_pixel_count = pixelCount;
   for (int i = 0; i < CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP; i++) {
     if (!s_image_textures[i].valid || !s_image_textures[i].dynamic_texture) {
       continue;
     }
     if (total_entry_count >= CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP) {
       abort();
     }
     for (int j = 0; j < total_entry_count; j++) {
       if (new_textures[j].valid && new_textures[j].texture_id == s_image_textures[i].texture_id) {
         abort();
       }
     }
     new_textures[total_entry_count] = s_image_textures[i];
     total_pixel_count += s_image_textures[i].pixel_count;
     memset(&s_image_textures[i], 0, sizeof(s_image_textures[i]));
     total_entry_count++;
   }
   for (int i = 0; i < CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP; i++) {
     if (s_image_textures[i].gl_texture != 0u && s_pending_image_texture_delete_count < CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP) {
       s_pending_image_texture_deletes[s_pending_image_texture_delete_count] = s_image_textures[i].gl_texture;
       s_pending_image_texture_delete_count++;
    }
  }
   for (int i = 0; i < CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP; i++) {
     free(s_image_textures[i].pixels);
   }
   memcpy(s_image_textures, new_textures, sizeof(new_textures));
   s_uploaded_image_atlas_entry_count = total_entry_count;
   s_uploaded_image_atlas_pixel_count = total_pixel_count;
 }

static const ChengAndroidSvgDisplayListCache* cheng_android_find_svg_display_list(int display_list_id) {
  if (display_list_id <= 0) {
    return NULL;
  }
  for (int i = 0; i < s_svg_display_list_count; i++) {
    if (s_svg_display_lists[i].valid && s_svg_display_lists[i].display_list_id == display_list_id) {
      return &s_svg_display_lists[i];
    }
  }
  return NULL;
}

static int cheng_android_svg_primitive_valid(const ChengAndroidSvgPrimitiveCache* primitive) {
  if (primitive == NULL) {
    return 0;
  }
  if (primitive->kind == CHENG_ANDROID_SVG_PRIMITIVE_LINE) {
    return 1;
  }
  if (primitive->kind == CHENG_ANDROID_SVG_PRIMITIVE_CIRCLE) {
    return primitive->rx > 0 && primitive->ry > 0 && primitive->rx == primitive->ry;
  }
  if (primitive->kind == CHENG_ANDROID_SVG_PRIMITIVE_ELLIPSE) {
    return primitive->rx > 0 && primitive->ry > 0;
  }
  if (primitive->kind == CHENG_ANDROID_SVG_PRIMITIVE_RECT) {
    return primitive->x2 > 0 && primitive->y2 > 0;
  }
  if (primitive->kind == CHENG_ANDROID_SVG_PRIMITIVE_TRIANGLE) {
    // Third vertex rides in cx/cy (PaintSvgPrimitiveSetTriangle in
    // web_paint_runtime.cheng); rx/ry are unused. Same non-degenerate
    // (cross product != 0) check the scene already applies in
    // WebSceneSvgPrimitiveHostFieldsValid before it ever reaches the host.
    int64_t dx1 = (int64_t)primitive->x2 - (int64_t)primitive->x1;
    int64_t dy1 = (int64_t)primitive->y2 - (int64_t)primitive->y1;
    int64_t dx2 = (int64_t)primitive->cx - (int64_t)primitive->x1;
    int64_t dy2 = (int64_t)primitive->cy - (int64_t)primitive->y1;
    return (dx1 * dy2 - dy1 * dx2) != 0;
  }
  return 0;
}

static void cheng_android_gpu_draw_svg_triangles(int screen_width, int screen_height, const float* vertices, int vertex_count, uint32_t argb) {
  if (screen_width <= 0 || screen_height <= 0 || vertices == NULL || vertex_count <= 0) {
    CHENG_HOST_LOG_ERROR("svg_triangles invalid screen=%dx%d vertices=%p vertex_count=%d color=%08x",
                         screen_width, screen_height, (const void*)vertices, vertex_count, (unsigned)argb);
    abort();
  }
  float color[4];
  cheng_android_gpu_color_from_argb(argb, color);
  glUseProgram(s_gl_rect_program);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glUniform2f(s_gl_rect_screen_loc, (float)screen_width, (float)screen_height);
  glUniform4f(s_gl_rect_color_loc, color[0], color[1], color[2], color[3]);
  glUniform4f(s_gl_rect_rect_loc, 0.0f, 0.0f, (float)screen_width, (float)screen_height);
  glUniform1f(s_gl_rect_radius_loc, 0.0f);
  glUniform1f(s_gl_rect_stroke_width_loc, 0.0f);
  glBindBuffer(GL_ARRAY_BUFFER, s_gl_vbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)((size_t)vertex_count * 2u * sizeof(float)), vertices, GL_STREAM_DRAW);
  glEnableVertexAttribArray(0);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, (GLsizei)(2 * sizeof(float)), (const void*)0);
  glDrawArrays(GL_TRIANGLES, 0, vertex_count);
}

static void cheng_android_gpu_draw_svg_segment(int screen_width, int screen_height, float x0, float y0, float x1, float y1, float stroke_width, uint32_t argb) {
  if (stroke_width <= 0.0f) {
    CHENG_HOST_LOG_ERROR("svg_segment invalid stroke screen=%dx%d p0=%.3f,%.3f p1=%.3f,%.3f stroke=%.6f color=%08x",
                         screen_width, screen_height, x0, y0, x1, y1, stroke_width, (unsigned)argb);
    abort();
  }
  float dx = x1 - x0;
  float dy = y1 - y0;
  float length = sqrtf(dx * dx + dy * dy);
  if (length <= 0.0001f) {
    return;
  }
  float half = stroke_width * 0.5f;
  float nx = -dy / length * half;
  float ny = dx / length * half;
  const float vertices[] = {
    x0 + nx, y0 + ny,
    x1 + nx, y1 + ny,
    x0 - nx, y0 - ny,
    x1 + nx, y1 + ny,
    x1 - nx, y1 - ny,
    x0 - nx, y0 - ny
  };
  cheng_android_gpu_draw_svg_triangles(screen_width, screen_height, vertices, 6, argb);
}

static void cheng_android_gpu_draw_svg_rect_path(int screen_width, int screen_height, float left, float top, float right, float bottom, float stroke_width, uint32_t argb) {
  if (right <= left || bottom <= top) {
    CHENG_HOST_LOG_ERROR("svg_rect_path invalid screen=%dx%d rect=%.3f,%.3f,%.3f,%.3f stroke=%.6f color=%08x",
                         screen_width, screen_height, left, top, right, bottom, stroke_width, (unsigned)argb);
    abort();
  }
  cheng_android_gpu_draw_svg_segment(screen_width, screen_height, left, top, right, top, stroke_width, argb);
  cheng_android_gpu_draw_svg_segment(screen_width, screen_height, right, top, right, bottom, stroke_width, argb);
  cheng_android_gpu_draw_svg_segment(screen_width, screen_height, right, bottom, left, bottom, stroke_width, argb);
  cheng_android_gpu_draw_svg_segment(screen_width, screen_height, left, bottom, left, top, stroke_width, argb);
}

static void cheng_android_gpu_draw_svg_ellipse_path(int screen_width, int screen_height, float center_x, float center_y, float radius_x, float radius_y, float stroke_width, uint32_t argb) {
  if (radius_x <= 0.0f || radius_y <= 0.0f) {
    CHENG_HOST_LOG_ERROR("svg_ellipse_path invalid screen=%dx%d center=%.3f,%.3f radius=%.6f,%.6f stroke=%.6f color=%08x",
                         screen_width, screen_height, center_x, center_y, radius_x, radius_y, stroke_width, (unsigned)argb);
    abort();
  }
  const int segments = 32;
  const float pi = 3.14159265358979323846f;
  float prev_x = center_x + radius_x;
  float prev_y = center_y;
  for (int i = 1; i <= segments; i++) {
    float theta = (2.0f * pi * (float)i) / (float)segments;
    float next_x = center_x + cosf(theta) * radius_x;
    float next_y = center_y + sinf(theta) * radius_y;
    cheng_android_gpu_draw_svg_segment(screen_width, screen_height, prev_x, prev_y, next_x, next_y, stroke_width, argb);
    prev_x = next_x;
    prev_y = next_y;
  }
}

static int cheng_android_gpu_normalize_rotation_degrees(int rotation_degrees) {
  int rotation = rotation_degrees % 360;
  if (rotation < 0) {
    rotation += 360;
  }
  if (rotation != 0 && rotation != 90 && rotation != 180 && rotation != 270) {
    CHENG_HOST_LOG_ERROR("unsupported svg rotation=%d", rotation_degrees);
    abort();
  }
  return rotation;
}

static void cheng_android_gpu_rotate_point_90(float center_x, float center_y, int rotation, float* px, float* py) {
  if (px == NULL || py == NULL) {
    CHENG_HOST_LOG_ERROR("svg_rotate invalid pointer center=%.3f,%.3f rotation=%d px=%p py=%p",
                         center_x, center_y, rotation, (void*)px, (void*)py);
    abort();
  }
  if (rotation == 0) {
    return;
  }
  float dx = *px - center_x;
  float dy = *py - center_y;
  if (rotation == 90) {
    *px = center_x - dy;
    *py = center_y + dx;
  } else if (rotation == 180) {
    *px = center_x - dx;
    *py = center_y - dy;
  } else if (rotation == 270) {
    *px = center_x + dy;
    *py = center_y - dx;
  } else {
    CHENG_HOST_LOG_ERROR("svg_rotate unsupported rotation=%d center=%.3f,%.3f point=%.3f,%.3f",
                         rotation, center_x, center_y, *px, *py);
    abort();
  }
}

static void cheng_android_gpu_draw_svg_display_list(int screen_width, int screen_height, int x, int y, int width, int height, uint32_t argb, int icon_kind, int primitive_count, int display_list_id, int rotation_degrees) {
  if (screen_width <= 0 || screen_height <= 0 || width <= 0 || height <= 0 || icon_kind != CHENG_ANDROID_PAINT_ICON_KIND_SVG || primitive_count <= 0 || display_list_id <= 0) {
    CHENG_HOST_LOG_ERROR(
                        "svg_draw invalid args screen=%dx%d rect=%d,%d,%d,%d icon_kind=%d primitive_count=%d display_list_id=%d",
                        screen_width, screen_height, x, y, width, height, icon_kind, primitive_count, display_list_id);
    abort();
  }
  const ChengAndroidSvgDisplayListCache* display_list = cheng_android_find_svg_display_list(display_list_id);
  if (display_list == NULL || s_svg_primitives == NULL || display_list->primitive_count != primitive_count) {
    CHENG_HOST_LOG_ERROR(
                        "svg_draw missing display_list id=%d expected_primitives=%d actual_primitives=%d primitive_cache_count=%d",
                        display_list_id, primitive_count, display_list != NULL ? display_list->primitive_count : -1, s_svg_primitive_count);
    abort();
  }
  if (display_list->primitive_start < 0 || display_list->primitive_count <= 0 || display_list->primitive_start > s_svg_primitive_count - display_list->primitive_count) {
    CHENG_HOST_LOG_ERROR(
                        "svg_draw primitive range invalid id=%d start=%d count=%d primitive_cache_count=%d",
                        display_list_id, display_list->primitive_start, display_list->primitive_count, s_svg_primitive_count);
    abort();
  }
  float scale_x = (float)width / CHENG_ANDROID_SVG_COORD_UNIT;
  float scale_y = (float)height / CHENG_ANDROID_SVG_COORD_UNIT;
  float stroke_width = CHENG_ANDROID_SVG_STROKE_UNIT * (scale_x + scale_y) * 0.5f;
  int rotation = cheng_android_gpu_normalize_rotation_degrees(rotation_degrees);
  float center_x = (float)x + (float)width * 0.5f;
  float center_y = (float)y + (float)height * 0.5f;
  for (int i = 0; i < display_list->primitive_count; i++) {
    const ChengAndroidSvgPrimitiveCache* primitive = &s_svg_primitives[display_list->primitive_start + i];
    if (!cheng_android_svg_primitive_valid(primitive)) {
      CHENG_HOST_LOG_ERROR(
                          "svg_draw invalid primitive id=%d index=%d kind=%d x1=%d y1=%d x2=%d y2=%d cx=%d cy=%d rx=%d ry=%d",
                          display_list_id, i, primitive->kind, primitive->x1, primitive->y1, primitive->x2, primitive->y2,
                          primitive->cx, primitive->cy, primitive->rx, primitive->ry);
      abort();
    }
    if (primitive->kind == CHENG_ANDROID_SVG_PRIMITIVE_LINE) {
      float x0 = (float)x + (float)primitive->x1 * scale_x;
      float y0 = (float)y + (float)primitive->y1 * scale_y;
      float x1 = (float)x + (float)primitive->x2 * scale_x;
      float y1 = (float)y + (float)primitive->y2 * scale_y;
      cheng_android_gpu_rotate_point_90(center_x, center_y, rotation, &x0, &y0);
      cheng_android_gpu_rotate_point_90(center_x, center_y, rotation, &x1, &y1);
      cheng_android_gpu_draw_svg_segment(screen_width, screen_height, x0, y0, x1, y1, stroke_width, argb);
    } else if (primitive->kind == CHENG_ANDROID_SVG_PRIMITIVE_CIRCLE || primitive->kind == CHENG_ANDROID_SVG_PRIMITIVE_ELLIPSE) {
      float primitive_center_x = (float)x + (float)primitive->cx * scale_x;
      float primitive_center_y = (float)y + (float)primitive->cy * scale_y;
      float radius_x = (float)primitive->rx * scale_x;
      float radius_y = (float)primitive->ry * scale_y;
      cheng_android_gpu_rotate_point_90(center_x, center_y, rotation, &primitive_center_x, &primitive_center_y);
      if (rotation == 90 || rotation == 270) {
        float tmp = radius_x;
        radius_x = radius_y;
        radius_y = tmp;
      }
      cheng_android_gpu_draw_svg_ellipse_path(screen_width, screen_height, primitive_center_x, primitive_center_y, radius_x, radius_y, stroke_width, argb);
    } else if (primitive->kind == CHENG_ANDROID_SVG_PRIMITIVE_RECT) {
      float left = (float)x + (float)primitive->x1 * scale_x;
      float top = (float)y + (float)primitive->y1 * scale_y;
      float right = left + (float)primitive->x2 * scale_x;
      float bottom = top + (float)primitive->y2 * scale_y;
      float x0 = left;
      float y0 = top;
      float x1 = right;
      float y1 = top;
      float x2 = right;
      float y2 = bottom;
      float x3 = left;
      float y3 = bottom;
      cheng_android_gpu_rotate_point_90(center_x, center_y, rotation, &x0, &y0);
      cheng_android_gpu_rotate_point_90(center_x, center_y, rotation, &x1, &y1);
      cheng_android_gpu_rotate_point_90(center_x, center_y, rotation, &x2, &y2);
      cheng_android_gpu_rotate_point_90(center_x, center_y, rotation, &x3, &y3);
      cheng_android_gpu_draw_svg_segment(screen_width, screen_height, x0, y0, x1, y1, stroke_width, argb);
      cheng_android_gpu_draw_svg_segment(screen_width, screen_height, x1, y1, x2, y2, stroke_width, argb);
      cheng_android_gpu_draw_svg_segment(screen_width, screen_height, x2, y2, x3, y3, stroke_width, argb);
      cheng_android_gpu_draw_svg_segment(screen_width, screen_height, x3, y3, x0, y0, stroke_width, argb);
    } else if (primitive->kind == CHENG_ANDROID_SVG_PRIMITIVE_TRIANGLE) {
      // Third vertex rides in cx/cy — see cheng_android_svg_primitive_valid.
      float x0 = (float)x + (float)primitive->x1 * scale_x;
      float y0 = (float)y + (float)primitive->y1 * scale_y;
      float x1 = (float)x + (float)primitive->x2 * scale_x;
      float y1 = (float)y + (float)primitive->y2 * scale_y;
      float x2 = (float)x + (float)primitive->cx * scale_x;
      float y2 = (float)y + (float)primitive->cy * scale_y;
      cheng_android_gpu_rotate_point_90(center_x, center_y, rotation, &x0, &y0);
      cheng_android_gpu_rotate_point_90(center_x, center_y, rotation, &x1, &y1);
      cheng_android_gpu_rotate_point_90(center_x, center_y, rotation, &x2, &y2);
      cheng_android_gpu_draw_svg_segment(screen_width, screen_height, x0, y0, x1, y1, stroke_width, argb);
      cheng_android_gpu_draw_svg_segment(screen_width, screen_height, x1, y1, x2, y2, stroke_width, argb);
      cheng_android_gpu_draw_svg_segment(screen_width, screen_height, x2, y2, x0, y0, stroke_width, argb);
    } else {
      abort();
    }
  }
}

void cheng_mobile_host_upload_svg_display_list_atlas(const int32_t* entries, int entryCount, int entryStrideI32, const int32_t* primitives, int primitiveCount, int primitiveStrideI32) {
  if (entries == NULL || primitives == NULL || entryCount <= 0 || primitiveCount <= 0 || entryStrideI32 < CHENG_ANDROID_SVG_DISPLAY_LIST_ENTRY_HOST_STRIDE_I32 || primitiveStrideI32 < CHENG_ANDROID_SVG_PRIMITIVE_HOST_STRIDE_I32) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "upload_svg invalid args entries=%p entryCount=%d entryStride=%d primitives=%p primitiveCount=%d primitiveStride=%d",
                        (const void*)entries, entryCount, entryStrideI32, (const void*)primitives, primitiveCount, primitiveStrideI32);
    abort();
  }
  __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell",
                      "upload_svg begin entryCount=%d entryStride=%d primitiveCount=%d primitiveStride=%d",
                      entryCount, entryStrideI32, primitiveCount, primitiveStrideI32);
  ChengAndroidSvgPrimitiveCache* new_primitives = (ChengAndroidSvgPrimitiveCache*)calloc((size_t)primitiveCount, sizeof(ChengAndroidSvgPrimitiveCache));
  if (new_primitives == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "upload_svg primitive allocation failed count=%d", primitiveCount);
    abort();
  }
  for (int i = 0; i < primitiveCount; i++) {
    const int32_t* source = primitives + ((size_t)i * (size_t)primitiveStrideI32);
    new_primitives[i].kind = (int)source[0];
    new_primitives[i].x1 = (int)source[1];
    new_primitives[i].y1 = (int)source[2];
    new_primitives[i].x2 = (int)source[3];
    new_primitives[i].y2 = (int)source[4];
    new_primitives[i].cx = (int)source[5];
    new_primitives[i].cy = (int)source[6];
    new_primitives[i].rx = (int)source[7];
    new_primitives[i].ry = (int)source[8];
    if (!cheng_android_svg_primitive_valid(&new_primitives[i])) {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                          "upload_svg invalid primitive index=%d kind=%d x1=%d y1=%d x2=%d y2=%d cx=%d cy=%d rx=%d ry=%d",
                          i, new_primitives[i].kind, new_primitives[i].x1, new_primitives[i].y1,
                          new_primitives[i].x2, new_primitives[i].y2, new_primitives[i].cx,
                          new_primitives[i].cy, new_primitives[i].rx, new_primitives[i].ry);
      free(new_primitives);
      abort();
    }
  }
  ChengAndroidSvgDisplayListCache* new_display_lists = (ChengAndroidSvgDisplayListCache*)calloc((size_t)entryCount, sizeof(ChengAndroidSvgDisplayListCache));
  if (new_display_lists == NULL) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "upload_svg display list allocation failed count=%d", entryCount);
    free(new_primitives);
    abort();
  }
  for (int i = 0; i < entryCount; i++) {
    const int32_t* entry = entries + ((size_t)i * (size_t)entryStrideI32);
    int display_list_id = (int)entry[0];
    int primitive_start = (int)entry[1];
    int entry_primitive_count = (int)entry[2];
    if (display_list_id <= 0 || primitive_start < 0 || entry_primitive_count <= 0 || primitive_start > primitiveCount - entry_primitive_count) {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                          "upload_svg invalid entry index=%d display_list_id=%d primitive_start=%d entry_primitive_count=%d primitiveCount=%d",
                          i, display_list_id, primitive_start, entry_primitive_count, primitiveCount);
      free(new_display_lists);
      free(new_primitives);
      abort();
    }
    for (int j = 0; j < i; j++) {
      if (new_display_lists[j].valid && new_display_lists[j].display_list_id == display_list_id) {
        __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                            "upload_svg duplicate display_list_id=%d index=%d previous=%d", display_list_id, i, j);
        free(new_display_lists);
        free(new_primitives);
        abort();
      }
    }
    new_display_lists[i].valid = 1;
    new_display_lists[i].display_list_id = display_list_id;
    new_display_lists[i].primitive_start = primitive_start;
    new_display_lists[i].primitive_count = entry_primitive_count;
  }
  free(s_svg_display_lists);
  s_svg_display_lists = new_display_lists;
  s_svg_display_list_count = entryCount;
  free(s_svg_primitives);
  s_svg_primitives = new_primitives;
  s_svg_primitive_count = primitiveCount;
  s_uploaded_svg_display_list_entry_count = entryCount;
  s_uploaded_svg_primitive_count = primitiveCount;
}

// bail57 root ①: CHENG_HOST_WINDOW is the OHOS-native window handle typedef the
// GLES core relies on for present_compositor_frame's viewport-clipped present
// path (replaces the raw ANativeWindow_setBuffersGeometry Android-compat-shim
// call). Copied byte-for-byte from the generator (MobileShellHarmonyGuiHostGenSource).
typedef OHNativeWindow* CHENG_HOST_WINDOW;

// #14-eos v5 (fix for v_a.md's REFUTED finding on v4's fix.patch): this function's
// OH_NativeWindow_NativeWindowHandleOpt call is one of two real, unlocked dereferences of
// `window` that v4 left exposed (the other is ANativeWindow_setBuffersGeometry in
// cheng_mobile_host_present_gpu_commands below) — both are called from present_* functions
// BEFORE their own already-locked cheng_android_gpu_ensure call, on the same epoch-gated
// RenderLoop iteration, so OnSurfaceDestroyed could complete its handshake (lock+2 writes+
// unlock+return, the point OHOS may reclaim the window) while this OS call was still
// executing on the same window. Lock held only across this function's single OS call — same
// leaf-lock, zero-nesting, one-OS-call ANR bound as cheng_android_gpu_ensure itself (see its
// own g_window_touch_mutex comment in cheng_gui_entry.cpp). No epoch re-check inside the
// lock: matching cheng_android_gpu_ensure's existing form, the mutex's mutual exclusion with
// OnSurfaceDestroyed already establishes the window hasn't been handed back to OHOS yet for
// as long as this lock is held, so re-deriving that from epoch would be redundant.
static int cheng_host_window_set_geometry(CHENG_HOST_WINDOW w, int width, int height, int fmt) {
  (void)fmt;
  if (w != NULL) {
    cheng_gui_window_touch_lock();
    (void)OH_NativeWindow_NativeWindowHandleOpt(w, SET_BUFFER_GEOMETRY, width, height);
    cheng_gui_window_touch_unlock();
  }
  return 0;
}

static int cheng_android_glyph_sdf_tile_crosses_glyph(const ChengAndroidGlyphSdfAtlasCache* atlas, int tile_height) {
  if (atlas == NULL || tile_height <= 0) {
    abort();
  }
  for (int i = 0; i < s_glyph_sdf_glyph_count; i++) {
    const ChengAndroidGlyphSdfGlyphCache* glyph = &s_glyph_sdf_glyphs[i];
    if (glyph->sdf_atlas_id != atlas->sdf_atlas_id) {
      continue;
    }
    if (glyph->atlas_y < 0 || glyph->height <= 0 || glyph->atlas_y + glyph->height > atlas->height) {
      abort();
    }
    int first_tile = glyph->atlas_y / tile_height;
    int last_tile = (glyph->atlas_y + glyph->height - 1) / tile_height;
    if (first_tile != last_tile) {
      return 1;
    }
  }
  return 0;
}

static int cheng_android_glyph_sdf_choose_tile_height(const ChengAndroidGlyphSdfAtlasCache* atlas, int max_texture_size) {
  if (atlas == NULL || max_texture_size <= 0 || atlas->width <= 0 || atlas->height <= 0) {
    abort();
  }
  if (atlas->width > max_texture_size) {
    CHENG_HOST_LOG_ERROR(
                        "glyph sdf atlas width %d exceeds GL_MAX_TEXTURE_SIZE %d",
                        atlas->width, max_texture_size);
    abort();
  }
  if (atlas->height <= max_texture_size) {
    return atlas->height;
  }
  for (int tile_height = max_texture_size; tile_height >= 1; tile_height--) {
    if (!cheng_android_glyph_sdf_tile_crosses_glyph(atlas, tile_height)) {
      return tile_height;
    }
  }
  CHENG_HOST_LOG_ERROR(
                      "glyph sdf atlas %dx%d cannot be tiled without splitting glyphs; max=%d",
                      atlas->width, atlas->height, max_texture_size);
  abort();
}

static int cheng_android_clip_layer_rect_to_viewport(int logical_width,
                                                     int logical_height,
                                                     int offset_x,
                                                     int offset_y,
                                                     int* x,
                                                     int* y,
                                                     int* w,
                                                     int* h) {
  if (logical_width <= 0 || logical_height <= 0 || x == NULL || y == NULL || w == NULL || h == NULL || *w < 0 || *h < 0) {
    abort();
  }
  if (*w == 0 || *h == 0) {
    return 0;
  }
  int viewport_x = 0 - offset_x;
  int viewport_y = 0 - offset_y;
  int viewport_right = viewport_x + logical_width;
  int viewport_bottom = viewport_y + logical_height;
  int left = *x;
  int top = *y;
  int right = *x + *w;
  int bottom = *y + *h;
  if (viewport_x > left) {
    left = viewport_x;
  }
  if (viewport_y > top) {
    top = viewport_y;
  }
  if (viewport_right < right) {
    right = viewport_right;
  }
  if (viewport_bottom < bottom) {
    bottom = viewport_bottom;
  }
  if (right <= left || bottom <= top) {
    *x = left;
    *y = top;
    *w = 0;
    *h = 0;
    return 0;
  }
  *x = left;
  *y = top;
  *w = right - left;
  *h = bottom - top;
  return 1;
}

static void cheng_android_gpu_upload_glyph_sdf_atlas(ChengAndroidGlyphSdfAtlasCache* atlas) {
  if (atlas == NULL || !atlas->valid || atlas->pixels == NULL || atlas->width <= 0 || atlas->height <= 0 || atlas->pixel_count != atlas->width * atlas->height) {
    abort();
  }
  GLint max_texture_size = 0;
  glGetIntegerv(GL_MAX_TEXTURE_SIZE, &max_texture_size);
  int tile_height = cheng_android_glyph_sdf_choose_tile_height(atlas, (int)max_texture_size);
  int tile_count = (atlas->height + tile_height - 1) / tile_height;
  if (tile_count <= 0) {
    abort();
  }
  if (atlas->gl_textures != NULL && (atlas->gl_texture_count != tile_count || atlas->gl_tile_height != tile_height)) {
    glDeleteTextures(atlas->gl_texture_count, atlas->gl_textures);
    free(atlas->gl_textures);
    atlas->gl_textures = NULL;
    atlas->gl_texture_count = 0;
    atlas->gl_tile_height = 0;
    atlas->gl_texture = 0u;
  }
  if (atlas->gl_textures == NULL) {
    atlas->gl_textures = (GLuint*)calloc((size_t)tile_count, sizeof(GLuint));
    if (atlas->gl_textures == NULL) {
      abort();
    }
    glGenTextures(tile_count, atlas->gl_textures);
    for (int i = 0; i < tile_count; i++) {
      cheng_android_gl_abort_if_false(atlas->gl_textures[i] != 0u, "glGenTextures glyph sdf tile failed");
    }
    atlas->gl_texture_count = tile_count;
    atlas->gl_tile_height = tile_height;
    atlas->gl_texture = atlas->gl_textures[0];
  }
  glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
  for (int tile_index = 0; tile_index < tile_count; tile_index++) {
    int tile_y = tile_index * tile_height;
    int upload_height = tile_height;
    if (tile_y + upload_height > atlas->height) {
      upload_height = atlas->height - tile_y;
    }
    if (upload_height <= 0) {
      abort();
    }
    glBindTexture(GL_TEXTURE_2D, atlas->gl_textures[tile_index]);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_R8, atlas->width, upload_height, 0, GL_RED, GL_UNSIGNED_BYTE, atlas->pixels + ((size_t)tile_y * (size_t)atlas->width));
  }
  atlas->gl_uploaded = 1;
  CHENG_HOST_LOG_INFO(
                      "glyph sdf atlas upload tiled id=%d size=%dx%d tile_height=%d tiles=%d max=%d",
                      atlas->sdf_atlas_id, atlas->width, atlas->height, tile_height, tile_count, (int)max_texture_size);
}

static ChengAndroidLayerCache* cheng_android_find_layer_cache(int route_index, int layer_id) {
  if (route_index < 0 || layer_id <= 0) {
    return NULL;
  }
  for (int i = 0; i < CHENG_ANDROID_LAYER_CACHE_CAP; i++) {
    if (s_layer_caches[i].valid && s_layer_caches[i].route_index == route_index && s_layer_caches[i].layer_id == layer_id) {
      return &s_layer_caches[i];
    }
  }
  return NULL;
}

static ChengAndroidLayerCache* cheng_android_ensure_layer_cache(int route_index, int layer_id, int origin_x, int origin_y, int width, int height, int logical_width, int logical_height, int framebuffer_width, int framebuffer_height) {
  if (route_index < 0 || layer_id <= 0 || width <= 0 || height <= 0 || logical_width <= 0 || logical_height <= 0 || framebuffer_width <= 0 || framebuffer_height <= 0) {
    return NULL;
  }
  int physical_left = cheng_android_scale_logical_to_framebuffer(origin_x, logical_width, framebuffer_width);
  int physical_top = cheng_android_scale_logical_to_framebuffer(origin_y, logical_height, framebuffer_height);
  int physical_right = cheng_android_scale_logical_to_framebuffer_ceil(origin_x + width, logical_width, framebuffer_width);
  int physical_bottom = cheng_android_scale_logical_to_framebuffer_ceil(origin_y + height, logical_height, framebuffer_height);
  int physical_width = physical_right - physical_left;
  int physical_height = physical_bottom - physical_top;
  if (physical_width <= 0 || physical_height <= 0) {
    abort();
  }
  ChengAndroidLayerCache* cache = cheng_android_find_layer_cache(route_index, layer_id);
  if (cache == NULL) {
    for (int i = 0; i < CHENG_ANDROID_LAYER_CACHE_CAP; i++) {
      if (!s_layer_caches[i].valid) {
        cache = &s_layer_caches[i];
        memset(cache, 0, sizeof(*cache));
        break;
      }
    }
  }
  if (cache == NULL) {
    return NULL;
  }
  if (cache->gl_texture == 0u) {
    glGenTextures(1, &cache->gl_texture);
    cheng_android_gl_abort_if_false(cache->gl_texture != 0u, "glGenTextures layer cache failed");
  }
  if (!cache->valid || cache->width != width || cache->height != height || cache->physical_width != physical_width || cache->physical_height != physical_height) {
    glBindTexture(GL_TEXTURE_2D, cache->gl_texture);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, physical_width, physical_height, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL);
  }
  cache->valid = 1;
  cache->route_index = route_index;
  cache->layer_id = layer_id;
  cache->origin_x = origin_x;
  cache->origin_y = origin_y;
  cache->width = width;
  cache->height = height;
  cache->physical_width = physical_width;
  cache->physical_height = physical_height;
  return cache;
}

static void cheng_android_drop_layer_cache(int route_index, int layer_id) {
  ChengAndroidLayerCache* cache = cheng_android_find_layer_cache(route_index, layer_id);
  if (cache == NULL) {
    return;
  }
  if (cache->gl_texture != 0u) {
    glDeleteTextures(1, &cache->gl_texture);
  }
  memset(cache, 0, sizeof(*cache));
}

/* Ported from the Android generator template (mobile_shell_codegen.cheng
 * MobileShellNativeGlesCoreSource, added in c38236ed6 as the surgical companion
 * fix for the metadataOnly upload path): a glyph metadata refresh means layout
 * may have changed while pixels did not, so every retained layer cache and the
 * replay list must be invalidated or stale paint output survives the rebind.
 * The Android template additionally calls
 * cheng_android_invalidate_cached_compositor_frame(); this host has no such
 * cached-compositor mechanism -- its equivalent retained state is exactly the
 * replay list (s_replay_valid/s_replay_count), reset below. */
static void cheng_android_drop_all_layer_caches(const char* reason) {
  int dropped = 0;
  for (int i = 0; i < CHENG_ANDROID_LAYER_CACHE_CAP; i++) {
    if (!s_layer_caches[i].valid) {
      continue;
    }
    if (s_layer_caches[i].gl_texture != 0u) {
      glDeleteTextures(1, &s_layer_caches[i].gl_texture);
    }
    memset(&s_layer_caches[i], 0, sizeof(s_layer_caches[i]));
    dropped++;
  }
  s_replay_valid = 0;
  s_replay_count = 0;
  CHENG_HOST_LOG_INFO("drop_layer_caches reason=%s count=%d", reason != NULL ? reason : "", dropped);
}

static ChengAndroidGlyphSdfAtlasCache* cheng_android_find_glyph_sdf_atlas(int sdf_atlas_id) {
  if (sdf_atlas_id <= 0) {
    return NULL;
  }
  for (int i = 0; i < CHENG_ANDROID_GLYPH_SDF_ATLAS_CACHE_CAP; i++) {
    if (s_glyph_sdf_atlases[i].valid && s_glyph_sdf_atlases[i].sdf_atlas_id == sdf_atlas_id) {
      return &s_glyph_sdf_atlases[i];
    }
  }
  return NULL;
}

static ChengAndroidGlyphSdfAtlasCache* cheng_android_ensure_glyph_sdf_atlas(int sdf_atlas_id) {
  ChengAndroidGlyphSdfAtlasCache* cache = cheng_android_find_glyph_sdf_atlas(sdf_atlas_id);
  if (cache != NULL) {
    return cache;
  }
  for (int i = 0; i < CHENG_ANDROID_GLYPH_SDF_ATLAS_CACHE_CAP; i++) {
    if (!s_glyph_sdf_atlases[i].valid) {
      cache = &s_glyph_sdf_atlases[i];
      memset(cache, 0, sizeof(*cache));
      cache->valid = 1;
      cache->sdf_atlas_id = sdf_atlas_id;
      return cache;
    }
  }
  return NULL;
}

static int cheng_android_glyph_sdf_atlas_uploaded(int sdf_atlas_id) {
  return cheng_android_find_glyph_sdf_atlas(sdf_atlas_id) != NULL;
}

static const ChengAndroidGlyphSdfGlyphCache* cheng_android_find_glyph_sdf_glyph(int glyph_id) {
  if (glyph_id <= 0 || glyph_id > s_glyph_sdf_glyph_count || s_glyph_sdf_glyphs == NULL) {
    return NULL;
  }
  const ChengAndroidGlyphSdfGlyphCache* glyph = &s_glyph_sdf_glyphs[glyph_id - 1];
  if (glyph->glyph_id != glyph_id) {
    abort();
  }
  return glyph;
}

static const ChengAndroidGlyphSdfRunCache* cheng_android_find_glyph_sdf_run(int glyph_run_id) {
  if (glyph_run_id <= 0 || glyph_run_id > s_glyph_sdf_run_count || s_glyph_sdf_runs == NULL) {
    return NULL;
  }
  const ChengAndroidGlyphSdfRunCache* run = &s_glyph_sdf_runs[glyph_run_id - 1];
  if (run->glyph_run_id != glyph_run_id) {
    abort();
  }
  return run;
}

static int cheng_android_glyph_sdf_texture_scale(const ChengAndroidGlyphSdfAtlasCache* atlas) {
  if (atlas == NULL || atlas->px_range <= 0 || atlas->spread_px <= 0 || atlas->px_range % CHENG_ANDROID_GLYPH_SDF_BASE_PX_RANGE != 0) {
    abort();
  }
  int scale = atlas->px_range / CHENG_ANDROID_GLYPH_SDF_BASE_PX_RANGE;
  if (scale <= 0 || atlas->spread_px % scale != 0) {
    abort();
  }
  return scale;
}

static void cheng_android_glyph_sdf_run_visual_bounds(int glyph_run_id, int sdf_atlas_id, int fallback_width, int fallback_height, int* out_pad_x, int* out_pad_y, int* out_width, int* out_height) {
  if (glyph_run_id <= 0 || sdf_atlas_id <= 0 || fallback_width <= 0 || fallback_height <= 0 || out_pad_x == NULL || out_pad_y == NULL || out_width == NULL || out_height == NULL) {
    abort();
  }
  const ChengAndroidGlyphSdfAtlasCache* run_atlas = cheng_android_find_glyph_sdf_atlas(sdf_atlas_id);
  const ChengAndroidGlyphSdfRunCache* run = cheng_android_find_glyph_sdf_run(glyph_run_id);
  if (run_atlas == NULL || run == NULL || run->sdf_atlas_id != sdf_atlas_id || run->glyph_count <= 0 || run->advance_width <= 0) {
    abort();
  }
  int pen_x = 0;
  int min_left = 0;
  int min_top = 0;
  int max_right = fallback_width;
  int max_bottom = fallback_height;
  for (int i = 0; i < run->glyph_count; i++) {
    int run_glyph_index = run->glyph_start + i;
    if (run_glyph_index < 0 || run_glyph_index >= s_glyph_sdf_run_glyph_count) {
      abort();
    }
    const ChengAndroidGlyphSdfRunGlyphCache* run_glyph = &s_glyph_sdf_run_glyphs[run_glyph_index];
    const ChengAndroidGlyphSdfGlyphCache* glyph = cheng_android_find_glyph_sdf_glyph(run_glyph->glyph_id);
    if (glyph == NULL || glyph->sdf_atlas_id <= 0 || glyph->font_atlas_id <= 0 || glyph->advance != run_glyph->advance || glyph->font_size <= 0) {
      abort();
    }
    const ChengAndroidGlyphSdfAtlasCache* glyph_atlas = cheng_android_find_glyph_sdf_atlas(glyph->sdf_atlas_id);
    if (glyph_atlas == NULL) {
      abort();
    }
    int sdf_scale = cheng_android_glyph_sdf_texture_scale(glyph_atlas);
    int pad = (glyph_atlas->spread_px + sdf_scale - 1) / sdf_scale;
    if (pad < 0) {
      abort();
    }
    int cell_size = glyph->font_size * 2;
    int glyph_left = pen_x - pad;
    int glyph_top = -pad;
    int glyph_right = glyph_left + cell_size;
    int glyph_bottom = glyph_top + cell_size;
    if (glyph_left < min_left) {
      min_left = glyph_left;
    }
    if (glyph_top < min_top) {
      min_top = glyph_top;
    }
    if (glyph_right > max_right) {
      max_right = glyph_right;
    }
    if (glyph_bottom > max_bottom) {
      max_bottom = glyph_bottom;
    }
    pen_x += run_glyph->advance;
  }
  if (pen_x != run->advance_width) {
    abort();
  }
  if (run->advance_width > max_right) {
    max_right = run->advance_width;
  }
  *out_pad_x = -min_left;
  *out_pad_y = -min_top;
  *out_width = max_right - min_left;
  *out_height = max_bottom - min_top;
}

static void cheng_android_gpu_draw_text_sdf(int screen_width, int screen_height, int x, int y, int width, int height, uint32_t argb, int font_atlas_id, int glyph_run_id, int glyph_run_glyph_count, int sdf_atlas_id) {
  if (screen_width <= 0 || screen_height <= 0 || width < 0 || height < 0) {
    abort();
  }
  const ChengAndroidGlyphSdfAtlasCache* run_atlas = cheng_android_find_glyph_sdf_atlas(sdf_atlas_id);
  const ChengAndroidGlyphSdfRunCache* run = cheng_android_find_glyph_sdf_run(glyph_run_id);
  if (run_atlas == NULL || run_atlas->pixels == NULL || run == NULL) {
    abort();
  }
  if (font_atlas_id <= 0 || run->font_atlas_id != font_atlas_id || run->sdf_atlas_id != sdf_atlas_id || glyph_run_glyph_count != run->glyph_count || glyph_run_glyph_count <= 0) {
    abort();
  }
  float color[4];
  cheng_android_gpu_color_from_argb(argb, color);
  glUseProgram(s_gl_text_program);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glUniform2f(s_gl_text_screen_loc, (float)screen_width, (float)screen_height);
  glUniform4f(s_gl_text_color_loc, color[0], color[1], color[2], color[3]);
  glActiveTexture(GL_TEXTURE0);
  glUniform1i(s_gl_text_atlas_loc, 0);
  glBindBuffer(GL_ARRAY_BUFFER, s_gl_vbo);
  glEnableVertexAttribArray(0);
  glEnableVertexAttribArray(1);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)0);
  glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)(2 * sizeof(float)));
  int pen_x = x;
  int bound_sdf_atlas_id = -1;
  int bound_sdf_tile_index = -1;
  for (int i = 0; i < run->glyph_count; i++) {
    int run_glyph_index = run->glyph_start + i;
    if (run_glyph_index < 0 || run_glyph_index >= s_glyph_sdf_run_glyph_count) {
      abort();
    }
    const ChengAndroidGlyphSdfRunGlyphCache* run_glyph = &s_glyph_sdf_run_glyphs[run_glyph_index];
    const ChengAndroidGlyphSdfGlyphCache* glyph = cheng_android_find_glyph_sdf_glyph(run_glyph->glyph_id);
    if (glyph == NULL || glyph->sdf_atlas_id <= 0 || glyph->font_atlas_id <= 0 || glyph->advance != run_glyph->advance) {
      abort();
    }
    ChengAndroidGlyphSdfAtlasCache* glyph_atlas = cheng_android_find_glyph_sdf_atlas(glyph->sdf_atlas_id);
    if (glyph_atlas == NULL || glyph_atlas->pixels == NULL || glyph_atlas->font_atlas_id != glyph->font_atlas_id || glyph->atlas_x < 0 || glyph->atlas_y < 0 || glyph->width <= 0 || glyph->height <= 0 || glyph->atlas_x + glyph->width > glyph_atlas->width || glyph->atlas_y + glyph->height > glyph_atlas->height) {
      abort();
    }
    if (!glyph_atlas->gl_uploaded || glyph_atlas->gl_texture == 0u) {
      cheng_android_gpu_upload_glyph_sdf_atlas(glyph_atlas);
    }
    if (glyph_atlas->gl_textures == NULL || glyph_atlas->gl_texture_count <= 0 || glyph_atlas->gl_tile_height <= 0) {
      abort();
    }
    int tile_index = glyph->atlas_y / glyph_atlas->gl_tile_height;
    int tile_y = tile_index * glyph_atlas->gl_tile_height;
    int tile_height = glyph_atlas->gl_tile_height;
    if (tile_y + tile_height > glyph_atlas->height) {
      tile_height = glyph_atlas->height - tile_y;
    }
    if (tile_index < 0 || tile_index >= glyph_atlas->gl_texture_count || tile_height <= 0 || glyph->atlas_y + glyph->height > tile_y + tile_height) {
      abort();
    }
    if (bound_sdf_atlas_id != glyph_atlas->sdf_atlas_id || bound_sdf_tile_index != tile_index) {
      glBindTexture(GL_TEXTURE_2D, glyph_atlas->gl_textures[tile_index]);
      glUniform1f(s_gl_text_px_range_loc, 2.0f * (float)glyph_atlas->px_range);
      bound_sdf_atlas_id = glyph_atlas->sdf_atlas_id;
      bound_sdf_tile_index = tile_index;
    }
    int sdf_scale = cheng_android_glyph_sdf_texture_scale(glyph_atlas);
    float inv_sdf_scale = 1.0f / (float)sdf_scale;
    float draw_spread = (float)glyph_atlas->spread_px * inv_sdf_scale;
    float x0 = (float)pen_x - draw_spread;
    float y0 = (float)y - draw_spread;
    if (glyph->font_size <= 0) {
      abort();
    }
  float logical_cell_size = (float)glyph->font_size * 2.0f;
  float x1 = x0 + logical_cell_size;
  float y1 = y0 + logical_cell_size;
  float u0 = (float)glyph->atlas_x / (float)glyph_atlas->width;
  float v0 = (float)(glyph->atlas_y - tile_y) / (float)tile_height;
  float u1 = (float)(glyph->atlas_x + glyph->width) / (float)glyph_atlas->width;
  float v1 = (float)(glyph->atlas_y + glyph->height - tile_y) / (float)tile_height;
    const float vertices[] = {
      x0, y0, u0, v0,
      x1, y0, u1, v0,
      x0, y1, u0, v1,
      x1, y0, u1, v0,
      x1, y1, u1, v1,
      x0, y1, u0, v1
    };
    glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)sizeof(vertices), vertices, GL_STREAM_DRAW);
    glDrawArrays(GL_TRIANGLES, 0, 6);
    pen_x += run_glyph->advance;
  }
}

/* Unified with the generator's parameterized implementation
 * (MobileShellNativeGlesCoreSource / MobileShellAndroidHostSource,
 * mobile_shell_codegen.cheng :23242 / :15991 -- both identical modulo the
 * platform log-hook vs direct __android_log_print divergence already
 * accepted by slice-0). metadataOnly is derived from pixels == NULL exactly
 * like the generator: this single function now serves both the pixel-upload
 * callers (cheng_mobile_host_upload_glyph_sdf_atlas/_bytes) and the
 * metadata-only caller (cheng_mobile_host_upload_glyph_sdf_atlas_metadata,
 * v3c/5b30e2692), replacing the two independently-hand-written
 * implementations that existed before slice-3 (this file used to carry a
 * full second copy under _metadata with a looser cache-field check that
 * silently allowed an atlas reflow -- width/height/font_atlas_id/spread_px/
 * px_range changing -- without a matching pixel re-upload; the generator's
 * check aborts on that mismatch instead of risking stale pixel bytes being
 * reinterpreted under new dimensions, so slice-3 adopts the generator's
 * stricter invariant here).
 *
 * Scope note (slice-3, glyph SDF atlas family): the generator's current
 * _common text (as of d12df89c6, landed 2026-07-10 09:31, ~2h before the
 * v3c host commit) additionally requires glyph_id == index+1 / stores runs
 * at array slot glyph_run_id-1, to support O(1) cheng_android_find_glyph_sdf_
 * glyph/_run array indexing added by that same commit. That indexing change
 * is an unrelated perf refactor (not part of the metadataOnly/glyph-SDF-atlas
 * fork this slice targets) and this host's find_glyph_sdf_glyph/find_glyph_
 * sdf_run are still linear-scan, so it is intentionally NOT ported here --
 * porting only the metadataOnly text below is self-consistent with the
 * existing linear-scan lookups. Flagged for a follow-up slice, not silently
 * dropped. */
static void cheng_mobile_host_upload_glyph_sdf_atlas_common(const int32_t* entries, int entryCount, int entryStrideI32, const int32_t* glyphs, int glyphCount, int glyphStrideI32, const int32_t* runs, int runCount, int runStrideI32, const int32_t* runGlyphs, int runGlyphCount, int runGlyphStrideI32, const void* pixels, int pixelCount, int pixelsAreBytes) {
  int metadataOnly = pixels == NULL;
  if (entries == NULL || glyphs == NULL || runs == NULL || runGlyphs == NULL || entryCount <= 0 || glyphCount <= 0 || runCount <= 0 || runGlyphCount <= 0 || entryStrideI32 < CHENG_ANDROID_GLYPH_SDF_ATLAS_HOST_STRIDE_I32 || glyphStrideI32 < CHENG_ANDROID_GLYPH_SDF_GLYPH_HOST_STRIDE_I32 || runStrideI32 < CHENG_ANDROID_GLYPH_SDF_RUN_HOST_STRIDE_I32 || runGlyphStrideI32 < CHENG_ANDROID_GLYPH_SDF_RUN_GLYPH_HOST_STRIDE_I32 || (!metadataOnly && pixelCount <= 0) || (metadataOnly && pixelCount != 0)) {
    CHENG_HOST_LOG_ERROR(
                        "upload_glyph invalid args entries=%p entryCount=%d entryStride=%d glyphs=%p glyphCount=%d glyphStride=%d runs=%p runCount=%d runStride=%d runGlyphs=%p runGlyphCount=%d runGlyphStride=%d pixels=%p pixelCount=%d",
                        (const void*)entries, entryCount, entryStrideI32, (const void*)glyphs, glyphCount, glyphStrideI32,
                        (const void*)runs, runCount, runStrideI32, (const void*)runGlyphs, runGlyphCount, runGlyphStrideI32,
                        (const void*)pixels, pixelCount);
    abort();
  }
  CHENG_HOST_LOG_INFO(
                      "upload_glyph begin entryCount=%d entryStride=%d glyphCount=%d glyphStride=%d runCount=%d runStride=%d runGlyphCount=%d runGlyphStride=%d pixelCount=%d metadataOnly=%d",
                      entryCount, entryStrideI32, glyphCount, glyphStrideI32, runCount, runStrideI32, runGlyphCount, runGlyphStrideI32, pixelCount, metadataOnly);
  s_uploaded_glyph_sdf_atlas_entry_count = 0;
  s_uploaded_glyph_sdf_atlas_pixel_count = 0;
  for (int i = 0; i < entryCount; i++) {
    const int32_t* entry = entries + ((size_t)i * (size_t)entryStrideI32);
    int sdf_atlas_id = (int)entry[0];
    int width = (int)entry[1];
    int height = (int)entry[2];
    int pixel_start = (int)entry[3];
    int entry_pixel_count = (int)entry[4];
    int font_atlas_id = (int)entry[5];
    int spread_px = (int)entry[6];
    int px_range = (int)entry[7];
    if (sdf_atlas_id <= 0 || width <= 0 || height <= 0 || font_atlas_id <= 0 || spread_px <= 0 || px_range <= 0) {
      CHENG_HOST_LOG_ERROR(
                          "upload_glyph invalid atlas entry index=%d sdf_atlas_id=%d size=%dx%d font_atlas_id=%d spread=%d px_range=%d",
                          i, sdf_atlas_id, width, height, font_atlas_id, spread_px, px_range);
      abort();
    }
    if ((!metadataOnly && (pixel_start < 0 || entry_pixel_count <= 0 || pixel_start > pixelCount || entry_pixel_count > pixelCount - pixel_start)) || (metadataOnly && (pixel_start != 0 || entry_pixel_count <= 0))) {
      CHENG_HOST_LOG_ERROR(
                          "upload_glyph invalid atlas pixels index=%d pixel_start=%d entry_pixel_count=%d pixelCount=%d",
                          i, pixel_start, entry_pixel_count, pixelCount);
      abort();
    }
    if ((int64_t)entry_pixel_count != (int64_t)width * (int64_t)height) {
      CHENG_HOST_LOG_ERROR(
                          "upload_glyph atlas pixel count mismatch index=%d entry_pixel_count=%d width=%d height=%d",
                          i, entry_pixel_count, width, height);
      abort();
    }
    ChengAndroidGlyphSdfAtlasCache* cache = metadataOnly ? cheng_android_find_glyph_sdf_atlas(sdf_atlas_id) : cheng_android_ensure_glyph_sdf_atlas(sdf_atlas_id);
    if (cache == NULL) {
      CHENG_HOST_LOG_ERROR("upload_glyph atlas cache allocation failed sdf_atlas_id=%d", sdf_atlas_id);
      abort();
    }
    size_t needed = (size_t)entry_pixel_count;
    if (metadataOnly) {
      if (!cache->valid || cache->pixels == NULL || cache->pixel_count != entry_pixel_count || cache->sdf_atlas_id != sdf_atlas_id || cache->font_atlas_id != font_atlas_id || cache->width != width || cache->height != height || cache->spread_px != spread_px || cache->px_range != px_range) {
        CHENG_HOST_LOG_ERROR(
                            "upload_glyph metadata without matching pixel cache sdf_atlas_id=%d cached_valid=%d cached_pixels=%p cached_pixels_count=%d entry_pixel_count=%d",
                            sdf_atlas_id, cache->valid, (void*)cache->pixels, cache->pixel_count, entry_pixel_count);
        abort();
      }
    } else {
      if (cache->pixels == NULL || cache->pixel_count != entry_pixel_count) {
        free(cache->pixels);
        cache->pixels = (uint8_t*)malloc(needed);
        if (cache->pixels == NULL) {
          CHENG_HOST_LOG_ERROR(
                              "upload_glyph atlas pixel allocation failed sdf_atlas_id=%d bytes=%zu", sdf_atlas_id, needed);
          memset(cache, 0, sizeof(*cache));
          abort();
        }
      }
      if (pixelsAreBytes) {
        memcpy(cache->pixels, ((const uint8_t*)pixels) + pixel_start, needed);
      } else {
        const int32_t* pixel_words = (const int32_t*)pixels;
        for (int pixel_index = 0; pixel_index < entry_pixel_count; pixel_index++) {
          int value = (int)pixel_words[pixel_start + pixel_index];
          if (value < 0 || value > 255) {
            CHENG_HOST_LOG_ERROR(
                                "upload_glyph invalid pixel index=%d absolute=%d value=%d", pixel_index, pixel_start + pixel_index, value);
            abort();
          }
          cache->pixels[pixel_index] = (uint8_t)value;
        }
      }
    }
    if (metadataOnly && cache->gl_uploaded) {
      CHENG_HOST_LOG_INFO(
                          "upload_glyph metadata preserves gl atlas sdf_atlas_id=%d glyphCount=%d runCount=%d runGlyphCount=%d",
                          sdf_atlas_id, glyphCount, runCount, runGlyphCount);
    }
    if (!metadataOnly) {
      cache->gl_uploaded = 0;
    }
    cache->valid = 1;
    cache->sdf_atlas_id = sdf_atlas_id;
    cache->font_atlas_id = font_atlas_id;
    cache->width = width;
    cache->height = height;
    cache->pixel_count = entry_pixel_count;
    cache->spread_px = spread_px;
    cache->px_range = px_range;
    s_uploaded_glyph_sdf_atlas_pixel_count = entry_pixel_count;
    s_uploaded_glyph_sdf_atlas_entry_count++;
  }
  ChengAndroidGlyphSdfGlyphCache* new_glyphs = (ChengAndroidGlyphSdfGlyphCache*)calloc((size_t)glyphCount, sizeof(ChengAndroidGlyphSdfGlyphCache));
  ChengAndroidGlyphSdfRunCache* new_runs = (ChengAndroidGlyphSdfRunCache*)calloc((size_t)runCount, sizeof(ChengAndroidGlyphSdfRunCache));
  ChengAndroidGlyphSdfRunGlyphCache* new_run_glyphs = (ChengAndroidGlyphSdfRunGlyphCache*)calloc((size_t)runGlyphCount, sizeof(ChengAndroidGlyphSdfRunGlyphCache));
  if (new_glyphs == NULL || new_runs == NULL || new_run_glyphs == NULL) {
    CHENG_HOST_LOG_ERROR(
                        "upload_glyph allocation failed glyphCount=%d runCount=%d runGlyphCount=%d",
                        glyphCount, runCount, runGlyphCount);
    free(new_glyphs);
    free(new_runs);
    free(new_run_glyphs);
    abort();
  }
  for (int i = 0; i < glyphCount; i++) {
    const int32_t* glyph = glyphs + ((size_t)i * (size_t)glyphStrideI32);
    int glyph_id = (int)glyph[0];
    int sdf_atlas_id = (int)glyph[1];
    int atlas_x = (int)glyph[2];
    int atlas_y = (int)glyph[3];
    int glyph_width = (int)glyph[4];
    int glyph_height = (int)glyph[5];
    int advance = (int)glyph[6];
    int font_atlas_id = (int)glyph[7];
    int sdf_pixel_start = (int)glyph[8];
    int sdf_pixel_count = (int)glyph[9];
    int codepoint = (int)glyph[10];
    int font_size = (int)glyph[11];
    const ChengAndroidGlyphSdfAtlasCache* atlas = cheng_android_find_glyph_sdf_atlas(sdf_atlas_id);
    if (atlas == NULL || glyph_id != i + 1 || font_atlas_id <= 0 || atlas_x < 0 || atlas_y < 0 || glyph_width <= 0 || glyph_height <= 0 || advance <= 0 || codepoint <= 0 || font_size <= 0) {
      CHENG_HOST_LOG_ERROR(
                          "upload_glyph invalid glyph index=%d glyph_id=%d sdf_atlas_id=%d atlas_present=%d font_atlas_id=%d atlas_xy=%d,%d glyph_size=%dx%d advance=%d codepoint=%d font_size=%d",
                          i, glyph_id, sdf_atlas_id, atlas != NULL, font_atlas_id, atlas_x, atlas_y, glyph_width, glyph_height, advance, codepoint, font_size);
      abort();
    }
    if (font_atlas_id != atlas->font_atlas_id || atlas_x + glyph_width > atlas->width || atlas_y + glyph_height > atlas->height) {
      CHENG_HOST_LOG_ERROR(
                          "upload_glyph glyph outside atlas index=%d glyph_id=%d font=%d atlas_font=%d atlas_xy=%d,%d glyph_size=%dx%d atlas_size=%dx%d",
                          i, glyph_id, font_atlas_id, atlas->font_atlas_id, atlas_x, atlas_y, glyph_width, glyph_height, atlas->width, atlas->height);
      abort();
    }
    if (sdf_pixel_start != atlas_y * atlas->width + atlas_x || sdf_pixel_count != glyph_width * glyph_height) {
      CHENG_HOST_LOG_ERROR(
                          "upload_glyph glyph pixel metadata mismatch index=%d glyph_id=%d sdf_pixel_start=%d expected_start=%d sdf_pixel_count=%d expected_count=%d",
                          i, glyph_id, sdf_pixel_start, atlas_y * atlas->width + atlas_x, sdf_pixel_count, glyph_width * glyph_height);
      abort();
    }
    if (sdf_pixel_start + (glyph_height - 1) * atlas->width + glyph_width > atlas->pixel_count) {
      CHENG_HOST_LOG_ERROR(
                          "upload_glyph glyph pixel range overflow index=%d glyph_id=%d end=%d atlas_pixels=%d",
                          i, glyph_id, sdf_pixel_start + (glyph_height - 1) * atlas->width + glyph_width, atlas->pixel_count);
      abort();
    }
    new_glyphs[i].glyph_id = glyph_id;
    new_glyphs[i].sdf_atlas_id = sdf_atlas_id;
    new_glyphs[i].atlas_x = atlas_x;
    new_glyphs[i].atlas_y = atlas_y;
    new_glyphs[i].width = glyph_width;
    new_glyphs[i].height = glyph_height;
    new_glyphs[i].advance = advance;
    new_glyphs[i].font_atlas_id = font_atlas_id;
    new_glyphs[i].sdf_pixel_start = sdf_pixel_start;
    new_glyphs[i].sdf_pixel_count = sdf_pixel_count;
    new_glyphs[i].codepoint = codepoint;
    new_glyphs[i].font_size = font_size;
  }
  free(s_glyph_sdf_glyphs);
  s_glyph_sdf_glyphs = new_glyphs;
  s_glyph_sdf_glyph_count = glyphCount;
  for (int i = 0; i < runGlyphCount; i++) {
    const int32_t* run_glyph = runGlyphs + ((size_t)i * (size_t)runGlyphStrideI32);
    int glyph_id = (int)run_glyph[0];
    int advance = (int)run_glyph[1];
    const ChengAndroidGlyphSdfGlyphCache* glyph = cheng_android_find_glyph_sdf_glyph(glyph_id);
    if (glyph == NULL || advance <= 0 || glyph->advance != advance) {
      CHENG_HOST_LOG_ERROR(
                          "upload_glyph invalid run_glyph index=%d glyph_id=%d glyph_present=%d advance=%d expected_advance=%d",
                          i, glyph_id, glyph != NULL, advance, glyph != NULL ? glyph->advance : -1);
      abort();
    }
    new_run_glyphs[i].glyph_id = glyph_id;
    new_run_glyphs[i].advance = advance;
  }
  free(s_glyph_sdf_run_glyphs);
  s_glyph_sdf_run_glyphs = new_run_glyphs;
  s_glyph_sdf_run_glyph_count = runGlyphCount;
  for (int i = 0; i < runCount; i++) {
    const int32_t* run = runs + ((size_t)i * (size_t)runStrideI32);
    int glyph_run_id = (int)run[0];
    int font_atlas_id = (int)run[1];
    int sdf_atlas_id = (int)run[2];
    int glyph_start = (int)run[3];
    int glyph_count = (int)run[4];
    int advance_width = (int)run[5];
    const ChengAndroidGlyphSdfAtlasCache* atlas = cheng_android_find_glyph_sdf_atlas(sdf_atlas_id);
    if (atlas == NULL || glyph_run_id <= 0 || glyph_run_id > runCount || new_runs[glyph_run_id - 1].glyph_run_id != 0 || font_atlas_id <= 0 || glyph_start < 0 || glyph_count <= 0 || glyph_start + glyph_count > runGlyphCount || advance_width <= 0) {
      CHENG_HOST_LOG_ERROR(
                          "upload_glyph invalid run index=%d run_id=%d font=%d sdf_atlas_id=%d atlas_present=%d atlas_font=%d glyph_start=%d glyph_count=%d runGlyphCount=%d advance_width=%d",
                          i, glyph_run_id, font_atlas_id, sdf_atlas_id, atlas != NULL, atlas != NULL ? atlas->font_atlas_id : -1,
                          glyph_start, glyph_count, runGlyphCount, advance_width);
      abort();
    }
    int measured_advance = 0;
    for (int glyph_index = 0; glyph_index < glyph_count; glyph_index++) {
      const ChengAndroidGlyphSdfRunGlyphCache* run_glyph = &new_run_glyphs[glyph_start + glyph_index];
      const ChengAndroidGlyphSdfGlyphCache* glyph = cheng_android_find_glyph_sdf_glyph(run_glyph->glyph_id);
      if (glyph == NULL || glyph->advance != run_glyph->advance || glyph->sdf_atlas_id <= 0 || glyph->font_atlas_id <= 0) {
        CHENG_HOST_LOG_ERROR(
                            "upload_glyph invalid run glyph reference run_index=%d run_id=%d local_glyph_index=%d glyph_id=%d glyph_present=%d",
                            i, glyph_run_id, glyph_index, run_glyph->glyph_id, glyph != NULL);
        abort();
      }
      if (glyph_index == 0 && (font_atlas_id != glyph->font_atlas_id || sdf_atlas_id != glyph->sdf_atlas_id)) {
        CHENG_HOST_LOG_ERROR(
                            "upload_glyph run first glyph mismatch index=%d run_id=%d run_font=%d glyph_font=%d run_sdf=%d glyph_sdf=%d",
                            i, glyph_run_id, font_atlas_id, glyph->font_atlas_id, sdf_atlas_id, glyph->sdf_atlas_id);
        abort();
      }
      measured_advance += run_glyph->advance;
    }
    if (measured_advance != advance_width) {
      CHENG_HOST_LOG_ERROR(
                          "upload_glyph run advance mismatch index=%d run_id=%d measured=%d expected=%d glyph_start=%d glyph_count=%d",
                          i, glyph_run_id, measured_advance, advance_width, glyph_start, glyph_count);
      abort();
    }
    int run_store_index = glyph_run_id - 1;
    new_runs[run_store_index].glyph_run_id = glyph_run_id;
    new_runs[run_store_index].font_atlas_id = font_atlas_id;
    new_runs[run_store_index].sdf_atlas_id = sdf_atlas_id;
    new_runs[run_store_index].glyph_start = glyph_start;
    new_runs[run_store_index].glyph_count = glyph_count;
    new_runs[run_store_index].advance_width = advance_width;
  }
  free(s_glyph_sdf_runs);
  s_glyph_sdf_runs = new_runs;
  s_glyph_sdf_run_count = runCount;
  if (metadataOnly) {
    cheng_android_drop_all_layer_caches("glyph_metadata");
  }
}

void cheng_mobile_host_upload_glyph_sdf_atlas(const int32_t* entries, int entryCount, int entryStrideI32, const int32_t* glyphs, int glyphCount, int glyphStrideI32, const int32_t* runs, int runCount, int runStrideI32, const int32_t* runGlyphs, int runGlyphCount, int runGlyphStrideI32, const int32_t* pixels, int pixelCount) {
  cheng_mobile_host_upload_glyph_sdf_atlas_common(entries, entryCount, entryStrideI32, glyphs, glyphCount, glyphStrideI32, runs, runCount, runStrideI32, runGlyphs, runGlyphCount, runGlyphStrideI32, (const void*)pixels, pixelCount, 0);
}

void cheng_mobile_host_upload_glyph_sdf_atlas_bytes(const int32_t* entries, int entryCount, int entryStrideI32, const int32_t* glyphs, int glyphCount, int glyphStrideI32, const int32_t* runs, int runCount, int runStrideI32, const int32_t* runGlyphs, int runGlyphCount, int runGlyphStrideI32, const uint8_t* pixels, int pixelByteCount) {
  cheng_mobile_host_upload_glyph_sdf_atlas_common(entries, entryCount, entryStrideI32, glyphs, glyphCount, glyphStrideI32, runs, runCount, runStrideI32, runGlyphs, runGlyphCount, runGlyphStrideI32, (const void*)pixels, pixelByteCount, 1);
}

/* SDF glyph-atlas metadata-only upload (host half of the 2026-07-08 pixel-upload-skip
 * feature, ee9f211a3). Thin wrapper over the now-unified _common (slice-3,
 * mobile_shell_codegen.cheng :23483-23493 wrapper shape): calls _common with
 * pixels=NULL, pixelCount=0, pixelsAreBytes=1, which _common reads back into
 * metadataOnly = pixels == NULL. Same entries/glyphs/runs/runGlyphs shapes as
 * cheng_mobile_host_upload_glyph_sdf_atlas above, but no pixel buffer: the scene has
 * already uploaded pixels for every referenced sdf_atlas_id in an earlier full call
 * and only wants to refresh glyph/run layout metadata (e.g. after a font reflow)
 * without re-copying pixels or re-uploading the GPU texture. Every referenced atlas
 * id must already carry uploaded pixels with identical width/height/font_atlas_id/
 * spread_px/px_range (_common's metadataOnly branch aborts on any mismatch instead
 * of silently reinterpreting stale pixel bytes under new dimensions); gl_uploaded
 * and the GPU texture it guards are left untouched so the renderer does not
 * re-upload. */
void cheng_mobile_host_upload_glyph_sdf_atlas_metadata(const int32_t* entries, int entryCount, int entryStrideI32, const int32_t* glyphs, int glyphCount, int glyphStrideI32, const int32_t* runs, int runCount, int runStrideI32, const int32_t* runGlyphs, int runGlyphCount, int runGlyphStrideI32) {
  cheng_mobile_host_upload_glyph_sdf_atlas_common(entries, entryCount, entryStrideI32, glyphs, glyphCount, glyphStrideI32, runs, runCount, runStrideI32, runGlyphs, runGlyphCount, runGlyphStrideI32, NULL, 0, 1);
}

static void cheng_android_gpu_draw_layer_cache(int framebuffer_width, int framebuffer_height, int logical_width, int logical_height, const ChengAndroidLayerCache* cache, int offset_x, int offset_y) {
  if (s_replay_recording && cache != NULL && s_replay_count < CHENG_ANDROID_REPLAY_LAYER_CAP) {
    s_replay_routes[s_replay_count] = cache->route_index;
    s_replay_layers[s_replay_count] = cache->layer_id;
    s_replay_offx[s_replay_count] = offset_x;
    s_replay_offy[s_replay_count] = offset_y;
    s_replay_count++;
  }
  if (framebuffer_width <= 0 || framebuffer_height <= 0 || logical_width <= 0 || logical_height <= 0 || cache == NULL || !cache->valid || cache->gl_texture == 0u || cache->width <= 0 || cache->height <= 0 || cache->physical_width <= 0 || cache->physical_height <= 0) {
    CHENG_HOST_LOG_ERROR(
                        "draw_layer_cache invalid framebuffer=%dx%d logical=%dx%d cache=%p valid=%d texture=%u rect=%d,%d physical=%dx%d offset=%d,%d",
                        framebuffer_width, framebuffer_height, logical_width, logical_height,
                        (const void*)cache, cache != NULL ? cache->valid : -1,
                        cache != NULL ? cache->gl_texture : 0u,
                        cache != NULL ? cache->width : 0,
                        cache != NULL ? cache->height : 0,
                        cache != NULL ? cache->physical_width : 0,
                        cache != NULL ? cache->physical_height : 0,
                        offset_x, offset_y);
    abort();
  }
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  glViewport(0, 0, framebuffer_width, framebuffer_height);
  cheng_android_gpu_draw_framebuffer_texture(logical_width, logical_height, cache->gl_texture, offset_x + cache->origin_x, offset_y + cache->origin_y, cache->width, cache->height);
}

static void cheng_android_render_gpu_commands_to_layer_cache(ChengAndroidLayerCache* cache, const int32_t* commands, int commandCount, int commandStrideI32, int commandStart, int layerCommandCount) {
  if (cache == NULL || !cache->valid || cache->gl_texture == 0u || cache->width <= 0 || cache->height <= 0 || cache->physical_width <= 0 || cache->physical_height <= 0 || commands == NULL || commandCount < 0 || commandStrideI32 < CHENG_ANDROID_GPU_COMMAND_STRIDE_I32 || commandStart < 0 || layerCommandCount < 0 || commandStart + layerCommandCount > commandCount) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "render_layer_cache invalid cache=%p valid=%d texture=%u logical=%dx%d physical=%dx%d commands=%p commandCount=%d stride=%d start=%d count=%d",
                        (void*)cache, cache != NULL ? cache->valid : -1,
                        cache != NULL ? cache->gl_texture : 0u,
                        cache != NULL ? cache->width : 0,
                        cache != NULL ? cache->height : 0,
                        cache != NULL ? cache->physical_width : 0,
                        cache != NULL ? cache->physical_height : 0,
                        (const void*)commands, commandCount, commandStrideI32,
                        commandStart, layerCommandCount);
    abort();
  }
  glBindFramebuffer(GL_FRAMEBUFFER, s_gl_fbo);
  glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, cache->gl_texture, 0);
  if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "render_layer_cache framebuffer incomplete cache_texture=%u cache_rect=%d,%d,%d,%d",
                        cache->gl_texture, cache->origin_x, cache->origin_y,
                        cache->width, cache->height);
    abort();
  }
  glViewport(0, 0, cache->physical_width, cache->physical_height);
  glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
  glClear(GL_COLOR_BUFFER_BIT);
  int clip_x = 0;
  int clip_y = 0;
  int clip_w = cache->width;
  int clip_h = cache->height;
  cheng_android_gpu_set_scaled_scissor_top_left(cache->physical_width, cache->physical_height, cache->width, cache->height, clip_x, clip_y, clip_w, clip_h);
  for (int i = 0; i < layerCommandCount; i++) {
    const int32_t* cmd = commands + ((size_t)(commandStart + i) * (size_t)commandStrideI32);
    int kind = (int)cmd[0];
    int x = (int)cmd[3] - cache->origin_x;
    int y = (int)cmd[4] - cache->origin_y;
    int w = (int)cmd[5];
    int h = (int)cmd[6];
    uint32_t color = (uint32_t)cmd[7];
    int image_id = (int)cmd[8];
    int icon_kind = (int)cmd[9];
    int icon_primitive_count = (int)cmd[10];
    int svg_display_list_id = (int)cmd[11];
    int font_atlas_id = (int)cmd[12];
    int glyph_run_id = (int)cmd[13];
    int glyph_run_glyph_count = (int)cmd[14];
    int glyph_sdf_atlas_id = (int)cmd[15];
    int rotation_degrees = (int)cmd[16];
    if (kind == CHENG_ANDROID_GPU_FILL_RECT) {
      s_present_gpu_fill_rect_count++;
      cheng_android_gpu_draw_rect(cache->width, cache->height, x, y, w, h, color, font_atlas_id);
    } else if (kind == CHENG_ANDROID_GPU_STROKE_RECT) {
      s_present_gpu_fill_rect_count++;
      cheng_android_gpu_draw_stroke_rect(cache->width, cache->height, x, y, w, h, color, font_atlas_id);
    } else if (kind == CHENG_ANDROID_GPU_BOX_SHADOW) {
      s_present_gpu_fill_rect_count++;
      cheng_android_gpu_draw_box_shadow(cache->width, cache->height, x, y, w, h, image_id, icon_kind, icon_primitive_count, svg_display_list_id, font_atlas_id, glyph_sdf_atlas_id, color);
    } else if (kind == CHENG_ANDROID_GPU_GRADIENT_FILL) {
      s_present_gpu_fill_rect_count++;
      cheng_android_gpu_draw_linear_gradient(cache->width, cache->height, x, y, w, h, color, (uint32_t)image_id, icon_kind, font_atlas_id, icon_primitive_count, svg_display_list_id, glyph_run_id, glyph_run_glyph_count);
    } else if (kind == CHENG_ANDROID_GPU_SVG_CIRCLE_PATTERN) {
      s_present_gpu_fill_rect_count++;
      cheng_android_gpu_draw_svg_circle_pattern(cache->width, cache->height, x, y, w, h, color, image_id, icon_kind, icon_primitive_count, svg_display_list_id, font_atlas_id);
    } else if (kind == CHENG_ANDROID_GPU_FILL_TEXT) {
      if (font_atlas_id > 0 && glyph_run_id > 0 && glyph_run_glyph_count > 0 && cheng_android_glyph_sdf_atlas_uploaded(glyph_sdf_atlas_id)) {
        if (w > 0 && h > 0) {
          int text_pad_x = 0;
          int text_pad_y = 0;
          int text_visual_w = w;
          int text_visual_h = h;
          cheng_android_glyph_sdf_run_visual_bounds(glyph_run_id, glyph_sdf_atlas_id, w, h, &text_pad_x, &text_pad_y, &text_visual_w, &text_visual_h);
          int text_clip_x = clip_x;
          int text_clip_y = clip_y;
          int text_clip_w = clip_w;
          int text_clip_h = clip_h;
          cheng_android_gpu_intersect_clip(&text_clip_x, &text_clip_y, &text_clip_w, &text_clip_h, x - text_pad_x, y - text_pad_y, text_visual_w, text_visual_h);
          cheng_android_gpu_set_scaled_scissor_top_left(cache->physical_width, cache->physical_height, cache->width, cache->height, text_clip_x, text_clip_y, text_clip_w, text_clip_h);
          cheng_android_gpu_draw_text_sdf(cache->width, cache->height, x, y, w, h, color, font_atlas_id, glyph_run_id, glyph_run_glyph_count, glyph_sdf_atlas_id);
          cheng_android_gpu_set_scaled_scissor_top_left(cache->physical_width, cache->physical_height, cache->width, cache->height, clip_x, clip_y, clip_w, clip_h);
          s_present_gpu_text_command_count++;
        }
      } else {
        __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                            "render_layer_cache invalid text command index=%d commandIndex=%d font_atlas_id=%d glyph_run_id=%d glyph_run_glyph_count=%d glyph_sdf_atlas_id=%d uploaded=%d glyph_runs=%d glyph_atlases=%d",
                            i, commandStart + i, font_atlas_id, glyph_run_id,
                            glyph_run_glyph_count, glyph_sdf_atlas_id,
                            cheng_android_glyph_sdf_atlas_uploaded(glyph_sdf_atlas_id),
                            s_glyph_sdf_run_count, s_uploaded_glyph_sdf_atlas_entry_count);
        abort();
      }
    } else if (kind == CHENG_ANDROID_GPU_DRAW_IMAGE) {
      if (image_id > 0 && cheng_android_image_texture_uploaded(image_id)) {
        cheng_android_gpu_draw_image_texture(cache->width, cache->height, x, y, w, h, image_id);
        s_present_gpu_image_command_count++;
      } else {
        __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                            "render_layer_cache invalid image command index=%d commandIndex=%d image_id=%d uploaded=%d image_entries=%d image_pixels=%d",
                            i, commandStart + i, image_id,
                            cheng_android_image_texture_uploaded(image_id),
                            s_uploaded_image_atlas_entry_count, s_uploaded_image_atlas_pixel_count);
        abort();
      }
    } else if (kind == CHENG_ANDROID_GPU_DRAW_ICON) {
      cheng_android_gpu_draw_svg_display_list(cache->width, cache->height, x, y, w, h, color, icon_kind, icon_primitive_count, svg_display_list_id, rotation_degrees);
      s_present_gpu_icon_command_count++;
    } else if (kind == CHENG_ANDROID_GPU_SET_CLIP) {
      cheng_android_gpu_intersect_clip(&clip_x, &clip_y, &clip_w, &clip_h, x, y, w, h);
      cheng_android_gpu_set_scaled_scissor_top_left(cache->physical_width, cache->physical_height, cache->width, cache->height, clip_x, clip_y, clip_w, clip_h);
    }
  }
  glDisable(GL_SCISSOR_TEST);
}

void cheng_mobile_host_present_gpu_commands(const int32_t* commands, int commandCount, int commandStrideI32, int width, int height) {
  ANativeWindow* window = s_active_window;
  if (window == NULL || commands == NULL || commandCount <= 0 || commandStrideI32 < CHENG_ANDROID_GPU_COMMAND_STRIDE_I32 || width <= 0 || height <= 0) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "present_gpu invalid args window=%p commands=%p commandCount=%d stride=%d size=%dx%d",
                        (void*)window, (const void*)commands, commandCount, commandStrideI32, width, height);
    return;
  }
  int framebuffer_width = cheng_android_framebuffer_width_for(width);
  int framebuffer_height = cheng_android_framebuffer_height_for(height);
  // #14-eos v5: see cheng_host_window_set_geometry's own comment above — this is the other
  // of the two real, unlocked window dereferences v_a.md's REFUTED finding identified on v4.
  // Lock held only across this single OS call (leaf, zero nesting: cheng_android_gpu_ensure
  // below takes/releases the SAME mutex in its own separate call, never while this one is
  // held), same one-OS-call ANR bound as cheng_android_gpu_ensure. No epoch re-check inside
  // the lock, matching cheng_android_gpu_ensure's existing form (see its comment).
  cheng_gui_window_touch_lock();
  int setBuffersGeometryFailed = ANativeWindow_setBuffersGeometry(window, framebuffer_width, framebuffer_height, WINDOW_FORMAT_RGBA_8888) != 0;
  cheng_gui_window_touch_unlock();
  if (setBuffersGeometryFailed) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "present_gpu setBuffersGeometry failed framebuffer=%dx%d logical=%dx%d",
                        framebuffer_width, framebuffer_height, width, height);
    abort();
  }
  __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell",
                      "present_gpu begin commands=%d stride=%d logical=%dx%d framebuffer=%dx%d uploaded_image_entries=%d uploaded_svg_entries=%d uploaded_glyph_atlases=%d glyph_runs=%d",
                      commandCount, commandStrideI32, width, height, framebuffer_width, framebuffer_height,
                      s_uploaded_image_atlas_entry_count, s_uploaded_svg_display_list_entry_count,
                      s_uploaded_glyph_sdf_atlas_entry_count, s_glyph_sdf_run_count);
  cheng_android_gpu_ensure(window, framebuffer_width, framebuffer_height);
  glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
  glClear(GL_COLOR_BUFFER_BIT);
  int clip_x = 0;
  int clip_y = 0;
  int clip_w = width;
  int clip_h = height;
  cheng_android_gpu_set_scaled_scissor_top_left(framebuffer_width, framebuffer_height, width, height, clip_x, clip_y, clip_w, clip_h);
  s_present_gpu_command_count = commandCount;
  s_present_gpu_fill_rect_count = 0;
  s_present_gpu_text_command_count = 0;
  s_present_gpu_image_command_count = 0;
  s_present_gpu_icon_command_count = 0;
  s_present_compositor_layer_count = 0;
  s_present_compositor_reuse_layer_count = 0;
  s_present_compositor_replace_layer_count = 0;
  s_present_compositor_move_layer_count = 0;
  s_present_compositor_drop_layer_count = 0;
  for (int i = 0; i < commandCount; i++) {
    const int32_t* cmd = commands + ((size_t)i * (size_t)commandStrideI32);
    int kind = (int)cmd[0];
    int x = (int)cmd[3];
    int y = (int)cmd[4];
    int w = (int)cmd[5];
    int h = (int)cmd[6];
    uint32_t color = (uint32_t)cmd[7];
    int image_id = (int)cmd[8];
    int icon_kind = (int)cmd[9];
    int icon_primitive_count = (int)cmd[10];
    int svg_display_list_id = (int)cmd[11];
    int font_atlas_id = (int)cmd[12];
    int glyph_run_id = (int)cmd[13];
    int glyph_run_glyph_count = (int)cmd[14];
    int glyph_sdf_atlas_id = (int)cmd[15];
    int rotation_degrees = (int)cmd[16];
    if (kind == CHENG_ANDROID_GPU_FILL_RECT) {
      s_present_gpu_fill_rect_count++;
      cheng_android_gpu_draw_rect(width, height, x, y, w, h, color, font_atlas_id);
    } else if (kind == CHENG_ANDROID_GPU_STROKE_RECT) {
      s_present_gpu_fill_rect_count++;
      cheng_android_gpu_draw_stroke_rect(width, height, x, y, w, h, color, font_atlas_id);
    } else if (kind == CHENG_ANDROID_GPU_BOX_SHADOW) {
      s_present_gpu_fill_rect_count++;
      cheng_android_gpu_draw_box_shadow(width, height, x, y, w, h, image_id, icon_kind, icon_primitive_count, svg_display_list_id, font_atlas_id, glyph_sdf_atlas_id, color);
    } else if (kind == CHENG_ANDROID_GPU_GRADIENT_FILL) {
      s_present_gpu_fill_rect_count++;
      cheng_android_gpu_draw_linear_gradient(width, height, x, y, w, h, color, (uint32_t)image_id, icon_kind, font_atlas_id, icon_primitive_count, svg_display_list_id, glyph_run_id, glyph_run_glyph_count);
    } else if (kind == CHENG_ANDROID_GPU_SVG_CIRCLE_PATTERN) {
      s_present_gpu_fill_rect_count++;
      cheng_android_gpu_draw_svg_circle_pattern(width, height, x, y, w, h, color, image_id, icon_kind, icon_primitive_count, svg_display_list_id, font_atlas_id);
    } else if (kind == CHENG_ANDROID_GPU_FILL_TEXT) {
      if (font_atlas_id > 0 && glyph_run_id > 0 && glyph_run_glyph_count > 0 && cheng_android_glyph_sdf_atlas_uploaded(glyph_sdf_atlas_id)) {
        if (w > 0 && h > 0) {
          int text_pad_x = 0;
          int text_pad_y = 0;
          int text_visual_w = w;
          int text_visual_h = h;
          cheng_android_glyph_sdf_run_visual_bounds(glyph_run_id, glyph_sdf_atlas_id, w, h, &text_pad_x, &text_pad_y, &text_visual_w, &text_visual_h);
          int text_clip_x = clip_x;
          int text_clip_y = clip_y;
          int text_clip_w = clip_w;
          int text_clip_h = clip_h;
          cheng_android_gpu_intersect_clip(&text_clip_x, &text_clip_y, &text_clip_w, &text_clip_h, x - text_pad_x, y - text_pad_y, text_visual_w, text_visual_h);
          cheng_android_gpu_set_scaled_scissor_top_left(framebuffer_width, framebuffer_height, width, height, text_clip_x, text_clip_y, text_clip_w, text_clip_h);
          cheng_android_gpu_draw_text_sdf(width, height, x, y, w, h, color, font_atlas_id, glyph_run_id, glyph_run_glyph_count, glyph_sdf_atlas_id);
          cheng_android_gpu_set_scaled_scissor_top_left(framebuffer_width, framebuffer_height, width, height, clip_x, clip_y, clip_w, clip_h);
          s_present_gpu_text_command_count++;
        }
      } else {
        __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                            "present_gpu invalid text command index=%d font_atlas_id=%d glyph_run_id=%d glyph_run_glyph_count=%d glyph_sdf_atlas_id=%d uploaded=%d glyph_runs=%d glyph_atlases=%d",
                            i, font_atlas_id, glyph_run_id, glyph_run_glyph_count, glyph_sdf_atlas_id,
                            cheng_android_glyph_sdf_atlas_uploaded(glyph_sdf_atlas_id), s_glyph_sdf_run_count, s_uploaded_glyph_sdf_atlas_entry_count);
        abort();
      }
    } else if (kind == CHENG_ANDROID_GPU_DRAW_IMAGE) {
      if (image_id > 0 && cheng_android_image_texture_uploaded(image_id)) {
        cheng_android_gpu_draw_image_texture(width, height, x, y, w, h, image_id);
        s_present_gpu_image_command_count++;
      } else {
        __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                            "present_gpu invalid image command index=%d image_id=%d uploaded=%d image_entries=%d image_pixels=%d",
                            i, image_id, cheng_android_image_texture_uploaded(image_id),
                            s_uploaded_image_atlas_entry_count, s_uploaded_image_atlas_pixel_count);
        abort();
      }
    } else if (kind == CHENG_ANDROID_GPU_DRAW_ICON) {
      __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell",
                          "present_gpu draw_icon index=%d icon_kind=%d primitive_count=%d display_list_id=%d rect=%d,%d,%d,%d rotation=%d",
                          i, icon_kind, icon_primitive_count, svg_display_list_id, x, y, w, h, rotation_degrees);
      cheng_android_gpu_draw_svg_display_list(width, height, x, y, w, h, color, icon_kind, icon_primitive_count, svg_display_list_id, rotation_degrees);
      s_present_gpu_icon_command_count++;
    } else if (kind == CHENG_ANDROID_GPU_SET_CLIP) {
      cheng_android_gpu_intersect_clip(&clip_x, &clip_y, &clip_w, &clip_h, x, y, w, h);
      cheng_android_gpu_set_scaled_scissor_top_left(framebuffer_width, framebuffer_height, width, height, clip_x, clip_y, clip_w, clip_h);
    }
  }
  cheng_android_gpu_draw_registered_media_surfaces(width, height, 1);
  glDisable(GL_SCISSOR_TEST);
  cheng_android_gl_abort_if_false(eglSwapBuffers(s_egl_display, s_egl_surface), "eglSwapBuffers failed");
  s_present_gpu_gl_frame_count++;
  s_present_width = width;
  s_present_height = height;
  if (s_gpu_present_debug_log_count < 4) {
    __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell",
                        "present_gpu frame=%d commands=%d fills=%d text=%d images=%d icons=%d logical=%dx%d framebuffer=%dx%d",
                        s_present_gpu_gl_frame_count, s_present_gpu_command_count,
                        s_present_gpu_fill_rect_count, s_present_gpu_text_command_count,
                        s_present_gpu_image_command_count, s_present_gpu_icon_command_count,
                        width, height, framebuffer_width, framebuffer_height);
    s_gpu_present_debug_log_count++;
  }
}

int cheng_mobile_host_present_media_surface_commands(const int32_t* commands, int commandCount, int commandStrideI32, int width, int height) {
  ANativeWindow* window = s_active_window;
  s_present_media_surface_command_count = 0;
  s_present_media_surface_video_count = 0;
  s_present_media_surface_image_count = 0;
  s_present_media_surface_audio_count = 0;
  s_present_media_surface_playing_count = 0;
  s_present_media_surface_missing_provider_count = 0;
  s_present_media_surface_status = CHENG_ANDROID_MEDIA_SURFACE_STATUS_NONE;
  if (commandCount == 0) {
    s_media_surface_command_word_count = 0;
    return 1;
  }
  if (window == NULL || commands == NULL || commandCount < 0 || commandCount > CHENG_ANDROID_MEDIA_SURFACE_COMMAND_CAP || commandStrideI32 < CHENG_ANDROID_MEDIA_SURFACE_HOST_STRIDE_I32 || width <= 0 || height <= 0) {
    s_present_media_surface_status = CHENG_ANDROID_MEDIA_SURFACE_STATUS_INVALID_BATCH;
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "present_media_surface invalid args window=%p commands=%p commandCount=%d stride=%d size=%dx%d",
                        (void*)window, (const void*)commands, commandCount, commandStrideI32, width, height);
    s_media_surface_command_word_count = 0;
    return 0;
  }
  for (int i = 0; i < commandCount; i++) {
    const int32_t* cmd = commands + ((size_t)i * (size_t)commandStrideI32);
    int kind_code = (int)cmd[0];
    int surface_kind = (int)cmd[1];
    int texture_provider = (int)cmd[2];
    int route_index = (int)cmd[3];
    int layer_id = (int)cmd[4];
    int node_id = (int)cmd[5];
    int x = (int)cmd[6];
    int y = (int)cmd[7];
    int w = (int)cmd[8];
    int h = (int)cmd[9];
    int playback_state = (int)cmd[10];
    int object_fit = (int)cmd[11];
    int slot_hash = (int)cmd[12];
    int asset_hash = (int)cmd[13];
    int manifest_hash = (int)cmd[14];
    int poster_hash = (int)cmd[15];
    if (kind_code <= 0 || kind_code > CHENG_ANDROID_MEDIA_SURFACE_AUDIO_COVER_TEXTURE ||
        surface_kind != kind_code ||
        (texture_provider != CHENG_ANDROID_MEDIA_TEXTURE_PROVIDER_METAL_SURFACE &&
         texture_provider != CHENG_ANDROID_MEDIA_TEXTURE_PROVIDER_SURFACE) ||
        route_index < 0 || layer_id <= 0 || node_id <= 0 ||
        x < 0 || y < 0 || w <= 0 || h <= 0 ||
        playback_state < 0 || playback_state > 6 ||
        object_fit < CHENG_ANDROID_MEDIA_OBJECT_FIT_COVER || object_fit > CHENG_ANDROID_MEDIA_OBJECT_FIT_FILL ||
        slot_hash <= 0 || asset_hash <= 0 || manifest_hash <= 0 || poster_hash <= 0) {
      s_present_media_surface_status = CHENG_ANDROID_MEDIA_SURFACE_STATUS_INVALID_BATCH;
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                          "present_media_surface invalid command index=%d kind=%d surface=%d provider=%d route=%d layer=%d node=%d rect=%d,%d,%d,%d playback=%d fit=%d hashes=%d,%d,%d,%d",
                          i, kind_code, surface_kind, texture_provider, route_index, layer_id, node_id,
                          x, y, w, h, playback_state, object_fit, slot_hash, asset_hash, manifest_hash, poster_hash);
      s_media_surface_command_word_count = 0;
      return 0;
    }
    ChengAndroidMediaTextureCache* texture = cheng_android_find_media_texture(kind_code, surface_kind, texture_provider, slot_hash, asset_hash, manifest_hash, poster_hash);
    if (texture == NULL || !texture->valid || texture->gl_texture == 0u || texture->width <= 0 || texture->height <= 0) {
      s_present_media_surface_missing_provider_count++;
    }
    if (kind_code == CHENG_ANDROID_MEDIA_SURFACE_VIDEO_FIRST_FRAME_TEXTURE) {
      s_present_media_surface_video_count++;
    } else if (kind_code == CHENG_ANDROID_MEDIA_SURFACE_IMAGE_RASTER_TEXTURE) {
      s_present_media_surface_image_count++;
    } else if (kind_code == CHENG_ANDROID_MEDIA_SURFACE_AUDIO_COVER_TEXTURE) {
      s_present_media_surface_audio_count++;
    }
    if (playback_state == CHENG_ANDROID_MEDIA_PLAYBACK_PLAYING || playback_state == CHENG_ANDROID_MEDIA_PLAYBACK_SEEKED) {
      s_present_media_surface_playing_count++;
    }
  }
  s_present_media_surface_command_count = commandCount;
  if (s_present_media_surface_missing_provider_count > 0) {
    s_present_media_surface_status = CHENG_ANDROID_MEDIA_SURFACE_STATUS_PROVIDER_UNAVAILABLE;
    s_media_surface_command_word_count = 0;
    int missing_provider = -1;
    int missing_slot_hash = -1;
    int missing_asset_hash = -1;
    int missing_manifest_hash = -1;
    int missing_poster_hash = -1;
    int cache_provider = -1;
    int cache_slot_hash = -1;
    int cache_asset_hash = -1;
    int cache_manifest_hash = -1;
    int cache_poster_hash = -1;
    for (int i = 0; i < commandCount; i++) {
      const int32_t* cmd = commands + ((size_t)i * (size_t)commandStrideI32);
      ChengAndroidMediaTextureCache* texture = cheng_android_find_media_texture((int)cmd[0], (int)cmd[1], (int)cmd[2], (int)cmd[12], (int)cmd[13], (int)cmd[14], (int)cmd[15]);
      if (texture == NULL || !texture->valid || texture->gl_texture == 0u || texture->width <= 0 || texture->height <= 0) {
        missing_provider = (int)cmd[2];
        missing_slot_hash = (int)cmd[12];
        missing_asset_hash = (int)cmd[13];
        missing_manifest_hash = (int)cmd[14];
        missing_poster_hash = (int)cmd[15];
        break;
      }
    }
    for (int i = 0; i < CHENG_ANDROID_MEDIA_TEXTURE_CACHE_CAP; i++) {
      if (s_media_textures[i].valid) {
        cache_provider = s_media_textures[i].texture_provider;
        cache_slot_hash = s_media_textures[i].slot_hash;
        cache_asset_hash = s_media_textures[i].asset_hash;
        cache_manifest_hash = s_media_textures[i].manifest_hash;
        cache_poster_hash = s_media_textures[i].poster_hash;
        break;
      }
    }
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "present_media_surface provider_unavailable commands=%d stride=%d video=%d image=%d audio=%d missing=%d logical=%dx%d missing_key=%d,%d,%d,%d,%d cache_key=%d,%d,%d,%d,%d",
                        commandCount, commandStrideI32, s_present_media_surface_video_count,
                        s_present_media_surface_image_count, s_present_media_surface_audio_count,
                        s_present_media_surface_missing_provider_count, width, height,
                        missing_provider, missing_slot_hash, missing_asset_hash, missing_manifest_hash, missing_poster_hash,
                        cache_provider, cache_slot_hash, cache_asset_hash, cache_manifest_hash, cache_poster_hash);
    return 0;
  }
  for (int i = 0; i < commandCount; i++) {
    const int32_t* cmd = commands + ((size_t)i * (size_t)commandStrideI32);
    memcpy(&s_media_surface_command_words[i * CHENG_ANDROID_MEDIA_SURFACE_HOST_STRIDE_I32], cmd, (size_t)CHENG_ANDROID_MEDIA_SURFACE_HOST_STRIDE_I32 * sizeof(int32_t));
  }
  s_media_surface_command_word_count = commandCount * CHENG_ANDROID_MEDIA_SURFACE_HOST_STRIDE_I32;
  s_present_media_surface_status = CHENG_ANDROID_MEDIA_SURFACE_STATUS_READY;
  __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell",
                      "present_media_surface ready commands=%d stride=%d video=%d image=%d audio=%d playing=%d logical=%dx%d",
                      commandCount, commandStrideI32, s_present_media_surface_video_count,
                      s_present_media_surface_image_count, s_present_media_surface_audio_count, s_present_media_surface_playing_count,
                      width, height);
  return 1;
}

void cheng_mobile_host_present_compositor_frame(const int32_t* layers, int layerCount, int layerStrideI32, const int32_t* commands, int commandCount, int commandStrideI32, int width, int height) {
  CHENG_HOST_WINDOW window = s_active_window;
  if ((!s_headless_capture && window == NULL) || layers == NULL || layerCount <= 0 || layerStrideI32 < CHENG_ANDROID_COMPOSITOR_LAYER_STRIDE_I32 || commandCount < 0 || commandStrideI32 < CHENG_ANDROID_GPU_COMMAND_STRIDE_I32 || width <= 0 || height <= 0) {
    CHENG_HOST_LOG_ERROR(
                        "present_compositor invalid args window=%p layers=%p layerCount=%d layerStride=%d commands=%p commandCount=%d commandStride=%d size=%dx%d",
                        (void*)window, (const void*)layers, layerCount, layerStrideI32,
                        (const void*)commands, commandCount, commandStrideI32, width, height);
    abort();
  }
  if (commandCount > 0 && commands == NULL) {
    CHENG_HOST_LOG_ERROR(
                        "present_compositor missing commands commandCount=%d commandStride=%d",
                        commandCount, commandStrideI32);
    abort();
  }
  // Headless capture renders at the exact logical size (no density upscale, no window).
  int framebuffer_width = s_headless_capture ? width : cheng_android_framebuffer_width_for(width);
  int framebuffer_height = s_headless_capture ? height : cheng_android_framebuffer_height_for(height);
  if (!s_headless_capture && cheng_host_window_set_geometry(window, framebuffer_width, framebuffer_height, WINDOW_FORMAT_RGBA_8888) != 0) {
    CHENG_HOST_LOG_ERROR(
                        "present_compositor setBuffersGeometry failed framebuffer=%dx%d logical=%dx%d",
                        framebuffer_width, framebuffer_height, width, height);
    abort();
  }
  {
    char trace_present_prop[92];
    trace_present_prop[0] = '\0';
    if (__system_property_get("debug.cheng.trace_present", trace_present_prop) > 0 && trace_present_prop[0] == '1') {
      CHENG_HOST_LOG_INFO(
                          "present_compositor begin layers=%d layerStride=%d commands=%d commandStride=%d logical=%dx%d framebuffer=%dx%d headless=%d",
                          layerCount, layerStrideI32, commandCount, commandStrideI32,
                          width, height, framebuffer_width, framebuffer_height, s_headless_capture);
    }
  }
  {
    /* on-device frame oracle: adb shell setprop debug.cheng.dump_cmds 1 */
    char dump_prop[92];
    dump_prop[0] = '\0';
    if (__system_property_get("debug.cheng.dump_cmds", dump_prop) > 0 && dump_prop[0] == '1') {
      for (int dump_i = 0; dump_i < commandCount; dump_i++) {
        const int32_t* dump_cmd = commands + ((size_t)dump_i * (size_t)commandStrideI32);
        CHENG_HOST_LOG_INFO(
                            "cmd[%d] kind=%d xywh=%d,%d,%d,%d color=%08x image=%d icon=%d primitives=%d svg=%d font=%d run=%d atlas=%d glyphs=%d rotation=%d",
                            dump_i, (int)dump_cmd[0], (int)dump_cmd[3], (int)dump_cmd[4],
                            (int)dump_cmd[5], (int)dump_cmd[6], (unsigned)dump_cmd[7],
                            (int)dump_cmd[8], (int)dump_cmd[9], (int)dump_cmd[10],
                            (int)dump_cmd[11], (int)dump_cmd[12], (int)dump_cmd[13],
                            (int)dump_cmd[15], (int)dump_cmd[14], (int)dump_cmd[16]);
      }
      for (int dump_l = 0; dump_l < layerCount; dump_l++) {
        const int32_t* dump_layer = layers + ((size_t)dump_l * (size_t)layerStrideI32);
        CHENG_HOST_LOG_INFO(
                            "layer[%d] action=%d route=%d layer=%d cache=%d,%d offset=%d,%d dirty=%d,%d,%d,%d command=%d+%d",
                            dump_l, (int)dump_layer[0], (int)dump_layer[1], (int)dump_layer[2],
                            (int)dump_layer[3], (int)dump_layer[4], (int)dump_layer[6],
                            (int)dump_layer[7], (int)dump_layer[10], (int)dump_layer[11],
                            (int)dump_layer[12], (int)dump_layer[13],
                            (int)dump_layer[15], (int)dump_layer[16]);
      }
    }
  }
  if (s_headless_capture) {
    cheng_android_gpu_ensure_offscreen(framebuffer_width, framebuffer_height);
  } else {
    cheng_android_gpu_ensure(window, framebuffer_width, framebuffer_height);
  }
  /* Poll the optional ink overlay channel at the consumption site so both
   * the JNI tick path and the headless capture path see overlay commands.
   * The app-side exports ignore appId by construction (reserved). */
  cheng_android_ink_overlay_lazy_bind();
  s_ink_overlay_command_count = 0;
  static int s_ink_poll_log_count = 0;
  if (s_ink_poll_log_count < 3) {
    CHENG_HOST_LOG_INFO(
                        "ink_poll bound=%d", s_app_ink_overlay_count != NULL ? 1 : 0);
    s_ink_poll_log_count++;
  }
  if (s_app_ink_overlay_count != NULL && s_app_ink_overlay_word != NULL) {
    int ink_count = (int)s_app_ink_overlay_count((uint64_t)0u);
    if (ink_count < 0 || ink_count > CHENG_ANDROID_INK_OVERLAY_CMD_CAP) {
      CHENG_HOST_LOG_ERROR(
                          "ink overlay command count out of range: %d (cap %d)",
                          ink_count, CHENG_ANDROID_INK_OVERLAY_CMD_CAP);
      abort();
    }
    int ink_words = ink_count * CHENG_ANDROID_GPU_COMMAND_STRIDE_I32;
    for (int iw = 0; iw < ink_words; iw++) {
      s_ink_overlay_commands[iw] = s_app_ink_overlay_word((uint64_t)0u, iw);
    }
    s_ink_overlay_command_count = ink_count;
  }
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  glViewport(0, 0, framebuffer_width, framebuffer_height);
  glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
  glClear(GL_COLOR_BUFFER_BIT);
  cheng_android_gpu_set_scaled_scissor_top_left(framebuffer_width, framebuffer_height, width, height, 0, 0, width, height);
  // Background pass: composite the fullscreen detail video FIRST, so the transpiled
  // detail UI layers (header/关注/back/title/date) blit on top of it below.
  cheng_android_gpu_draw_registered_media_surfaces(width, height, 0);
  s_replay_count = 0;
  s_replay_recording = 1;
  s_replay_valid = 0;
  s_present_gpu_command_count = commandCount;
  s_present_gpu_fill_rect_count = 0;
  s_present_gpu_text_command_count = 0;
  s_present_gpu_image_command_count = 0;
  s_present_gpu_icon_command_count = 0;
  s_present_compositor_layer_count = layerCount;
  s_present_compositor_reuse_layer_count = 0;
  s_present_compositor_replace_layer_count = 0;
  s_present_compositor_move_layer_count = 0;
  s_present_compositor_drop_layer_count = 0;
  for (int i = 0; i < layerCount; i++) {
    const int32_t* layer = layers + ((size_t)i * (size_t)layerStrideI32);
    int action = (int)layer[0];
    int route_index = (int)layer[1];
    int layer_id = (int)layer[2];
    int cache_route_index = (int)layer[3];
    int cache_layer_id = (int)layer[4];
    int offset_x = (int)layer[6];
    int offset_y = (int)layer[7];
    int dirty_x = (int)layer[10];
    int dirty_y = (int)layer[11];
    int dirty_w = (int)layer[12];
    int dirty_h = (int)layer[13];
    int command_start = (int)layer[15];
    int layer_command_count = (int)layer[16];
    int clipped_dirty_x = dirty_x;
    int clipped_dirty_y = dirty_y;
    int clipped_dirty_w = dirty_w;
    int clipped_dirty_h = dirty_h;
    int clipped_dirty_visible = 0;
    if (dirty_w > 0 && dirty_h > 0) {
      clipped_dirty_visible = cheng_android_clip_layer_rect_to_viewport(width, height, offset_x, offset_y,
                                                                        &clipped_dirty_x, &clipped_dirty_y,
                                                                        &clipped_dirty_w, &clipped_dirty_h);
    }
    if (route_index < 0 || layer_id <= 0 || cache_route_index < 0 || cache_layer_id <= 0 || command_start < 0 || layer_command_count < 0 || command_start + layer_command_count > commandCount) {
      CHENG_HOST_LOG_ERROR(
                          "present_compositor invalid layer index=%d action=%d route=%d layer=%d cache=%d,%d command_start=%d layer_commands=%d commandCount=%d",
                          i, action, route_index, layer_id, cache_route_index, cache_layer_id,
                          command_start, layer_command_count, commandCount);
      abort();
    }
    if (action == CHENG_ANDROID_LAYER_TRANSITION_DROP) {
      s_present_compositor_drop_layer_count++;
      cheng_android_drop_layer_cache(cache_route_index, cache_layer_id);
      continue;
    }
    if (action == CHENG_ANDROID_LAYER_TRANSITION_REUSE) {
      if (layer_command_count != 0) {
        CHENG_HOST_LOG_ERROR(
                            "present_compositor reuse with commands index=%d route=%d layer=%d cache=%d,%d layer_commands=%d",
                            i, route_index, layer_id, cache_route_index, cache_layer_id, layer_command_count);
        abort();
      }
      ChengAndroidLayerCache* source_cache = cheng_android_find_layer_cache(cache_route_index, cache_layer_id);
      if (source_cache == NULL) {
        CHENG_HOST_LOG_ERROR(
                            "present_compositor reuse cache missing index=%d route=%d layer=%d cache=%d,%d",
                            i, route_index, layer_id, cache_route_index, cache_layer_id);
        abort();
      }
      s_present_compositor_reuse_layer_count++;
      cheng_android_gpu_draw_layer_cache(framebuffer_width, framebuffer_height, width, height, source_cache, offset_x, offset_y);
      continue;
    }
    if (layer_command_count == 0 && action == CHENG_ANDROID_LAYER_TRANSITION_REPLACE) {
      s_present_compositor_replace_layer_count++;
      if (dirty_w <= 0 || dirty_h <= 0 || !clipped_dirty_visible) {
        cheng_android_drop_layer_cache(route_index, layer_id);
        continue;
      }
      ChengAndroidLayerCache* empty_replace_cache = cheng_android_ensure_layer_cache(route_index, layer_id, clipped_dirty_x, clipped_dirty_y, clipped_dirty_w, clipped_dirty_h, width, height, framebuffer_width, framebuffer_height);
      if (empty_replace_cache == NULL) {
        CHENG_HOST_LOG_ERROR(
                            "present_compositor empty replace cache alloc failed index=%d route=%d layer=%d dirty=%d,%d,%d,%d",
                            i, route_index, layer_id, clipped_dirty_x, clipped_dirty_y, clipped_dirty_w, clipped_dirty_h);
        abort();
      }
      cheng_android_render_gpu_commands_to_layer_cache(empty_replace_cache, commands, commandCount, commandStrideI32, command_start, layer_command_count);
      cheng_android_gpu_draw_layer_cache(framebuffer_width, framebuffer_height, width, height, empty_replace_cache, offset_x, offset_y);
      continue;
    }
    if (layer_command_count == 0 && action == 0) {
      ChengAndroidLayerCache* move_cache = cheng_android_find_layer_cache(cache_route_index, cache_layer_id);
      if (move_cache == NULL) {
        CHENG_HOST_LOG_ERROR(
                            "present_compositor move cache missing index=%d route=%d layer=%d cache=%d,%d action=%d",
                            i, route_index, layer_id, cache_route_index, cache_layer_id, action);
        abort();
      }
      s_present_compositor_move_layer_count++;
      cheng_android_gpu_draw_layer_cache(framebuffer_width, framebuffer_height, width, height, move_cache, offset_x, offset_y);
      continue;
    }
    if (action != 0 && action != CHENG_ANDROID_LAYER_TRANSITION_REPLACE) {
      CHENG_HOST_LOG_ERROR(
                          "present_compositor unsupported action index=%d action=%d route=%d layer=%d",
                          i, action, route_index, layer_id);
      abort();
    }
    if (dirty_w <= 0 || dirty_h <= 0) {
      CHENG_HOST_LOG_ERROR(
                          "present_compositor invalid dirty rect index=%d action=%d route=%d layer=%d dirty=%d,%d,%d,%d commands=%d",
                          i, action, route_index, layer_id, dirty_x, dirty_y, dirty_w, dirty_h,
                          layer_command_count);
      abort();
    }
    if (!clipped_dirty_visible) {
      continue;
    }
    ChengAndroidLayerCache* target_cache = cheng_android_ensure_layer_cache(route_index, layer_id, clipped_dirty_x, clipped_dirty_y, clipped_dirty_w, clipped_dirty_h, width, height, framebuffer_width, framebuffer_height);
    if (target_cache == NULL) {
      CHENG_HOST_LOG_ERROR(
                          "present_compositor cache alloc failed index=%d action=%d route=%d layer=%d dirty=%d,%d,%d,%d",
                          i, action, route_index, layer_id, clipped_dirty_x, clipped_dirty_y, clipped_dirty_w, clipped_dirty_h);
      abort();
    }
    if (action == CHENG_ANDROID_LAYER_TRANSITION_REPLACE) {
      s_present_compositor_replace_layer_count++;
    }
    cheng_android_render_gpu_commands_to_layer_cache(target_cache, commands, commandCount, commandStrideI32, command_start, layer_command_count);
    cheng_android_gpu_draw_layer_cache(framebuffer_width, framebuffer_height, width, height, target_cache, offset_x, offset_y);
  }
  s_replay_recording = 0;
  s_replay_valid = 1;
  s_replay_width = width;
  s_replay_height = height;
  cheng_android_gpu_draw_registered_media_surfaces(width, height, 1);
  cheng_android_gpu_draw_ink_field(width, height);
  if (s_ink_overlay_command_count > 0) {
    ChengAndroidLayerCache* ink_cache = cheng_android_ensure_layer_cache(CHENG_ANDROID_INK_OVERLAY_ROUTE, CHENG_ANDROID_INK_OVERLAY_LAYER,
                                                                         0, 0, width, height, width, height,
                                                                         framebuffer_width, framebuffer_height);
    if (ink_cache == NULL) {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "ink overlay layer cache unavailable");
      abort();
    }
    cheng_android_render_gpu_commands_to_layer_cache(ink_cache, s_ink_overlay_commands,
                                                     s_ink_overlay_command_count,
                                                     CHENG_ANDROID_GPU_COMMAND_STRIDE_I32,
                                                     0, s_ink_overlay_command_count);
    cheng_android_gpu_draw_layer_cache(framebuffer_width, framebuffer_height, width, height, ink_cache, 0, 0);
  }
  glDisable(GL_SCISSOR_TEST);
  if (s_headless_capture) {
    glFinish();
  } else {
    cheng_android_gl_abort_if_false(eglSwapBuffers(s_egl_display, s_egl_surface), "eglSwapBuffers compositor failed");
  }
  /* Ink animation frame pacing probe: monotonic timestamp per presented
   * frame while the overlay is active (bounded count). */
  static int s_ink_frame_probe_count = 0;
  if (s_ink_overlay_command_count > 0 && s_ink_frame_probe_count < 240) {
    struct timespec ink_ts;
    clock_gettime(CLOCK_MONOTONIC, &ink_ts);
    CHENG_HOST_LOG_INFO(
                        "ink_frame i=%d t_us=%lld cmds=%d",
                        s_ink_frame_probe_count,
                        (long long)(ink_ts.tv_sec * 1000000LL + ink_ts.tv_nsec / 1000LL),
                        s_ink_overlay_command_count);
    s_ink_frame_probe_count++;
  }
  s_present_compositor_gl_frame_count++;
  s_present_width = width;
  s_present_height = height;
  if (s_compositor_present_debug_log_count < 4) {
    CHENG_HOST_LOG_INFO(
                        "present_compositor frame=%d layers=%d commands=%d reuse=%d replace=%d move=%d drop=%d logical=%dx%d framebuffer=%dx%d",
                        s_present_compositor_gl_frame_count, s_present_compositor_layer_count,
                        s_present_gpu_command_count, s_present_compositor_reuse_layer_count,
                        s_present_compositor_replace_layer_count, s_present_compositor_move_layer_count,
                        s_present_compositor_drop_layer_count, width, height, framebuffer_width, framebuffer_height);
    s_compositor_present_debug_log_count++;
  }
}

/* Ink wash field (LBM grid) upload: R8 grid texture, drawn fullscreen by
 * the overlay refresh between the paper background and overlay commands. */
static const void* s_ink_field_data = NULL;
static int s_ink_field_dirty = 0;
void cheng_mobile_host_set_ink_fade(int permille) {
  if (permille < 0) {
    permille = 0;
  }
  if (permille > 1000) {
    permille = 1000;
  }
  s_ink_field_fade_permille = permille;
}
void cheng_mobile_host_upload_ink_field(const void* data, int gridW, int gridH) {
  if (data == NULL || gridW <= 0 || gridH <= 0 || gridW > 2048 || gridH > 2048) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "ink field upload invalid %dx%d", gridW, gridH);
    abort();
  }
  /* GL work is deferred to draw time: the GL context may not exist yet on
   * the very first tick. The app-side buffer is a stable module static. */
  s_ink_field_data = data;
  s_ink_field_w = gridW;
  s_ink_field_h = gridH;
  s_ink_field_dirty = 1;
  s_ink_field_active = 1;
}

static void cheng_android_gpu_draw_ink_field(int screen_width, int screen_height) {
  if (!s_ink_field_active || s_gl_inkfield_program == 0u) {
    return;
  }
  if (s_ink_field_dirty) {
    if (s_ink_field_texture == 0u) {
      glGenTextures(1, &s_ink_field_texture);
      cheng_android_gl_abort_if_false(s_ink_field_texture != 0u, "glGenTextures ink field failed");
    }
    glBindTexture(GL_TEXTURE_2D, s_ink_field_texture);
    glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
    if (s_ink_field_tex_w != s_ink_field_w || s_ink_field_tex_h != s_ink_field_h) {
      /* first upload (or grid resize): allocate storage + set sampler params once. */
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
      glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
      glTexImage2D(GL_TEXTURE_2D, 0, GL_R8, s_ink_field_w, s_ink_field_h, 0, GL_RED, GL_UNSIGNED_BYTE, s_ink_field_data);
      s_ink_field_tex_w = s_ink_field_w;
      s_ink_field_tex_h = s_ink_field_h;
    } else {
      /* subsequent frames: same dims -> in-place sub-update, no storage
       * realloc/orphan. Sampled pixels are identical to the full re-upload. */
      glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, s_ink_field_w, s_ink_field_h, GL_RED, GL_UNSIGNED_BYTE, s_ink_field_data);
    }
    s_ink_field_dirty = 0;
  }
  if (s_ink_field_texture == 0u) {
    return;
  }
  float x0 = 0.0f;
  float y0 = 0.0f;
  float x1 = (float)screen_width;
  float y1 = (float)screen_height;
  const float vertices[] = {
    x0, y0, 0.0f, 0.0f,
    x1, y0, 1.0f, 0.0f,
    x0, y1, 0.0f, 1.0f,
    x1, y0, 1.0f, 0.0f,
    x1, y1, 1.0f, 1.0f,
    x0, y1, 0.0f, 1.0f
  };
  glUseProgram(s_gl_inkfield_program);
  glBlendFuncSeparate(GL_ONE, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
  glUniform2f(s_gl_inkfield_screen_loc, (float)screen_width, (float)screen_height);
  glUniform1f(s_gl_inkfield_fade_loc, (float)s_ink_field_fade_permille / 1000.0f);
  glActiveTexture(GL_TEXTURE0);
  glBindTexture(GL_TEXTURE_2D, s_ink_field_texture);
  glUniform1i(s_gl_inkfield_texture_loc, 0);
  glBindBuffer(GL_ARRAY_BUFFER, s_gl_vbo);
  glBufferData(GL_ARRAY_BUFFER, (GLsizeiptr)sizeof(vertices), vertices, GL_STREAM_DRAW);
  glEnableVertexAttribArray(0);
  glEnableVertexAttribArray(1);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)0);
  glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, (GLsizei)(4 * sizeof(float)), (const void*)(2 * sizeof(float)));
  glDrawArrays(GL_TRIANGLES, 0, 6);
  glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
}

/* Overlay-only frame: replay the last presented layer sequence from layer
 * caches (zero app-side encoding) + media + ink overlay. The app calls
 * this on ticks where only the overlay animates. */
void cheng_mobile_host_present_overlay_refresh(int width, int height) {
  if (width <= 0 || height <= 0) {
    __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                        "overlay refresh invalid viewport %dx%d", width, height);
    abort();
  }
  /* Two modes: loading splash (no cached scene yet -> paper background,
   * ink only) and over-scene refresh (replay cached layers + ink). */
  int replay_scene = s_replay_valid && width == s_replay_width && height == s_replay_height;
  ANativeWindow* window = s_active_window;
  if (window == NULL && !s_headless_capture) {
    return;
  }
  int framebuffer_width = cheng_android_framebuffer_width_for(width);
  int framebuffer_height = cheng_android_framebuffer_height_for(height);
  if (s_headless_capture) {
    cheng_android_gpu_ensure_offscreen(framebuffer_width, framebuffer_height);
  } else {
    cheng_android_gpu_ensure(window, framebuffer_width, framebuffer_height);
  }
  cheng_android_ink_overlay_lazy_bind();
  s_ink_overlay_command_count = 0;
  if (s_app_ink_overlay_count != NULL && s_app_ink_overlay_word != NULL) {
    int ink_count = (int)s_app_ink_overlay_count((uint64_t)0u);
    if (ink_count < 0 || ink_count > CHENG_ANDROID_INK_OVERLAY_CMD_CAP) {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                          "ink overlay command count out of range: %d (cap %d)",
                          ink_count, CHENG_ANDROID_INK_OVERLAY_CMD_CAP);
      abort();
    }
    int ink_words = ink_count * CHENG_ANDROID_GPU_COMMAND_STRIDE_I32;
    for (int iw = 0; iw < ink_words; iw++) {
      s_ink_overlay_commands[iw] = s_app_ink_overlay_word((uint64_t)0u, iw);
    }
    s_ink_overlay_command_count = ink_count;
  }
  glBindFramebuffer(GL_FRAMEBUFFER, 0);
  glViewport(0, 0, framebuffer_width, framebuffer_height);
  if (replay_scene) {
    glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
  } else {
    /* paper background for the loading splash */
    glClearColor(0.969f, 0.957f, 0.929f, 1.0f);
  }
  glClear(GL_COLOR_BUFFER_BIT);
  cheng_android_gpu_set_scaled_scissor_top_left(framebuffer_width, framebuffer_height, width, height, 0, 0, width, height);
  if (replay_scene) {
    // Background pass: fullscreen detail video under the replayed UI layers (same as
    // present_compositor), so overlay-only refresh frames keep the video behind the UI.
    cheng_android_gpu_draw_registered_media_surfaces(width, height, 0);
    for (int i = 0; i < s_replay_count; i++) {
      ChengAndroidLayerCache* cache = cheng_android_find_layer_cache(s_replay_routes[i], s_replay_layers[i]);
      if (cache == NULL) {
        __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                            "overlay refresh layer cache missing route=%d layer=%d",
                            s_replay_routes[i], s_replay_layers[i]);
        abort();
      }
      cheng_android_gpu_draw_layer_cache(framebuffer_width, framebuffer_height, width, height, cache, s_replay_offx[i], s_replay_offy[i]);
    }
    cheng_android_gpu_draw_registered_media_surfaces(width, height, 1);
  }
  cheng_android_gpu_draw_ink_field(width, height);
  if (s_ink_overlay_command_count > 0) {
    ChengAndroidLayerCache* ink_cache = cheng_android_ensure_layer_cache(CHENG_ANDROID_INK_OVERLAY_ROUTE, CHENG_ANDROID_INK_OVERLAY_LAYER,
                                                                         0, 0, width, height, width, height,
                                                                         framebuffer_width, framebuffer_height);
    if (ink_cache == NULL) {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell", "ink overlay layer cache unavailable");
      abort();
    }
    cheng_android_render_gpu_commands_to_layer_cache(ink_cache, s_ink_overlay_commands,
                                                     s_ink_overlay_command_count,
                                                     CHENG_ANDROID_GPU_COMMAND_STRIDE_I32,
                                                     0, s_ink_overlay_command_count);
    cheng_android_gpu_draw_layer_cache(framebuffer_width, framebuffer_height, width, height, ink_cache, 0, 0);
  }
  glDisable(GL_SCISSOR_TEST);
  if (s_headless_capture) {
    glFinish();
  } else {
    cheng_android_gl_abort_if_false(eglSwapBuffers(s_egl_display, s_egl_surface), "eglSwapBuffers overlay refresh failed");
  }
  static int s_ink_refresh_probe_count = 0;
  if (s_ink_overlay_command_count > 0 && s_ink_refresh_probe_count < 240) {
    struct timespec ink_ts;
    clock_gettime(CLOCK_MONOTONIC, &ink_ts);
    __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell",
                        "ink_frame i=%d t_us=%lld cmds=%d",
                        s_ink_refresh_probe_count,
                        (long long)(ink_ts.tv_sec * 1000000LL + ink_ts.tv_nsec / 1000LL),
                        s_ink_overlay_command_count);
    s_ink_refresh_probe_count++;
  }
  s_present_compositor_gl_frame_count++;
}

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
cheng_app_pause_fn       s_gui_app_pause = NULL;
static cheng_app_resume_fn      s_gui_app_resume = NULL;

uint64_t s_gui_app_id = 0u;
static int      s_gui_phys_width = 0;
static int      s_gui_phys_height = 0;
static float    s_gui_density = 0.0f;

void* s_gui_resource_manager = NULL;
static int   s_gui_runtime_payloads_applied = 0;
static int   s_gui_launch_args_applied = 0;
static int   s_gui_exports_resolved = 0;

void cheng_gui_host_set_resource_manager(void* rm) {
  s_gui_resource_manager = rm;
  __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell", "host set rm=%p", rm);
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
    if (s_gui_app_id == 0u) {
      // Init failed → every later tick silently no-ops (black screen with a healthy render
      // loop, the exact real-device flake of 2026-07-25). Pull the scene's own build-step
      // and main-status debug exports RIGHT NOW so the failing deserialization sub-step is
      // in the log, instead of unreachable behind the tick-side diag that never runs.
      typedef int32_t (*cheng_dbg_i32_fn)(void);
      cheng_dbg_i32_fn dbg_step = (cheng_dbg_i32_fn)dlsym(s_app_handle, "cheng_app_debug_build_step");
      cheng_dbg_i32_fn dbg_status = (cheng_dbg_i32_fn)dlsym(s_app_handle, "cheng_app_debug_last_main_status");
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                          "cheng_app_init FAILED (id=0): build_step=%{public}d last_main_status=%{public}d",
                          dbg_step != NULL ? (int)dbg_step() : -1,
                          dbg_status != NULL ? (int)dbg_status() : -1);
    }
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
    // Media-surface texture preparation runs (by design — see the comment at the scene's
    // __csg_scene_present_active_route call site) BEFORE the compositor frame is built, so
    // it can call the host to glGenTextures. But the EGL/GL context was only ever created
    // lazily inside cheng_mobile_host_present_compositor_frame's present_gpu path (via
    // cheng_android_gpu_ensure) — which never runs until AFTER media-surface prepare
    // succeeds. On the very first tick that is a hard deadlock: prepare needs a current GL
    // context to allocate a texture name, and the context was never going to exist until a
    // frame had already been presented once. Root fix: ensure the context up front, exactly
    // like present_gpu does, so the very first tick's media-surface texture creation has a
    // valid context to allocate into.
    if (s_active_window != NULL) {
      cheng_android_gpu_ensure(s_active_window,
          cheng_android_framebuffer_width_for(s_active_width),
          cheng_android_framebuffer_height_for(s_active_height));
    }
    static int s_tkd = 0; int tkd = (s_tkd < 300);
    if (tkd) { char tb[80]; snprintf(tb, sizeof(tb), "TKD f=%d entry svid=%d sstart=%d", s_tkd, s_video_active, s_stream_starting); cheng_media_diag(tb); }
    s_gui_app_tick(s_gui_app_id, dt);
    CHENG_LEAK_AUDIT_TICK();  // no-op unless -DCHENG_LEAK_AUDIT=1; internally wall-clock gated to ~5s
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
    // Self-healing vsync-engage invariant: while video is active, not paused, and not
    // already finished, guarantee the vsync consumer chain is armed — every tick,
    // unconditionally, rather than relying on the state-transition call sites that flip
    // s_video_active to 1 (texture-cache-miss create, cache-hit reuse, resume-from-pause,
    // ...) to each remember to call cheng_video_vsync_engage(). A real-device repro
    // exposed exactly that gap: leaving a video route and returning hits the texture
    // cache (video_tex already valid), so s_video_active flips true without ever calling
    // engage(), and the clip replays at the un-vsync-paced (slow-motion) cadence with no
    // log signal.
    //   s_stream_eos MUST gate this too: s_video_active is sticky for the process
    // lifetime (never reset back to 0 once a video has ever played), but EOS does NOT
    // set s_stream_paused — so checking s_video_active alone would re-arm on the very
    // next tick after cheng_video_vsync_disengage() fires in the EOS handler, silently
    // cancelling that disengage every time a clip finishes. s_stream_eos is the exact
    // flag the EOS handler itself latches on, and it is only cleared by
    // cheng_stream_teardown_active() (route-leave), which is also where the matching
    // disengage() lives — so this stays disengaged for the whole "finished, holding
    // last frame" window and re-arms only once real playback resumes.
    // engage() is idempotent (reuses the existing OH_NativeVSync handle, only issues a
    // new RequestFrame when s_video_vsync_want was actually false), so re-asserting this
    // every tick costs one atomic load in the already-armed steady state and is race-free
    // with cheng_video_vsync_disengage() (which only ever clears the want flag).
    if (s_video_active && !s_stream_paused && !s_stream_eos &&
        !__atomic_load_n(&s_video_vsync_want, __ATOMIC_SEQ_CST)) {
      cheng_video_vsync_engage();
    }
    if (tkd) { cheng_media_diag("TKD after_overlay"); s_tkd++; }
    // Nodes-tab real-peer bridge: own-serve's accept loop (media_moq_publisher_main.cheng)
    // writes the currently connected client's "ip:port" label to moq_ready.peer right when
    // a real QUIC handshake completes/closes (empty content = no peer connected right now;
    // own-serve accepts one session at a time). This tick polls that tiny file and, ONLY on
    // an actual change, pushes it to the scene's nodes-tab row via cheng_app_nodes_update_utf8
    // (exported by scene_app_oh.o -- buildNodesRowWiring in scene-runtime-smoke-source.mjs).
    // Render-thread-only by construction: this thread never touches native_runtime.cheng's
    // msquicNativeCurSlot -- it only reads a plain-text file the accept thread already wrote
    // a value-copied ip:port string into (see the S5-B single-thread discipline comment
    // above cheng_stream_fetch_worker). No peer connected -> empty discoveredPeers.peers ->
    // the nodes-tab keeps its current-state rendering, never a fabricated row.
    {
      static char s_nodes_last_peer[64] = {0};
      static int s_nodes_peer_inited = 0;
      char peer[64]; peer[0] = '\0';
      FILE* pf = fopen("/data/storage/el2/base/haps/entry/cache/moq_ready.peer", "r");
      if (pf) {
        size_t n = fread(peer, 1, sizeof(peer) - 1, pf);
        fclose(pf);
        while (n > 0 && (peer[n - 1] == '\n' || peer[n - 1] == '\r' || peer[n - 1] == ' ')) { n--; }
        peer[n] = '\0';
      }
      if (!s_nodes_peer_inited || strcmp(peer, s_nodes_last_peer) != 0) {
        s_nodes_peer_inited = 1;
        snprintf(s_nodes_last_peer, sizeof(s_nodes_last_peer), "%s", peer);
        typedef int32_t (*nodes_update_fn)(const char*);
        nodes_update_fn nu = (nodes_update_fn)dlsym(s_app_handle, "cheng_app_nodes_update_utf8");
        if (nu != NULL) {
          char json[160];
          if (peer[0] != '\0') {
            snprintf(json, sizeof(json),
                     "{\"discoveredPeers\":{\"peers\":[{\"peerId\":\"%s\"}]},\"connectedPeers\":[\"%s\"]}",
                     peer, peer);
          } else {
            snprintf(json, sizeof(json), "{\"discoveredPeers\":{\"peers\":[]},\"connectedPeers\":[]}");
          }
          int rc = nu(json);
          __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "nodes bridge: own-serve peer=%{public}s rc=%{public}d",
                              peer[0] ? peer : "(none)", rc);
        } else {
          __android_log_print(ANDROID_LOG_ERROR, "ChengCHT", "nodes bridge: cheng_app_nodes_update_utf8 dlsym missing (stale scene .o)");
        }
      }
    }
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
  cheng_video_vsync_disengage();  // app backgrounded: fall back to event-driven pacing
  if (s_gui_app_id != 0u && s_gui_app_pause != NULL) {
    s_gui_app_pause(s_gui_app_id);
  }
}
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

static int cheng_harmony_state_image_texture_id(const char* state_ref) {
  if (state_ref == NULL || state_ref[0] == '\0') {
    return -1;
  }
  uint64_t hash = 216613626u;
  const char* prefix = "image.state.";
  for (const unsigned char* p = (const unsigned char*)prefix; *p != 0u; p++) {
    hash = (hash * 16777619u + (uint64_t)(*p)) & 2147483647u;
  }
  for (const unsigned char* p = (const unsigned char*)state_ref; *p != 0u; p++) {
    hash = (hash * 16777619u + (uint64_t)(*p)) & 2147483647u;
  }
  int out = (int)hash;
  if (out <= 0) {
    return 1;
  }
  return out;
}

static int cheng_harmony_install_dynamic_image_rgba(const char* state_ref, int width, int height, const unsigned char* rgba_in) {
  int texture_id = cheng_harmony_state_image_texture_id(state_ref);
  if (texture_id <= 0 || width <= 0 || height <= 0 || rgba_in == NULL) {
    return 0;
  }
  int64_t pixel_count_i64 = (int64_t)width * (int64_t)height;
  if (pixel_count_i64 <= 0 || pixel_count_i64 > 33554432LL) {
    return 0;
  }
  int pixel_count = (int)pixel_count_i64;
  uint8_t* rgba = (uint8_t*)malloc((size_t)pixel_count * 4u);
  if (rgba == NULL) {
    return 0;
  }
  memcpy(rgba, rgba_in, (size_t)pixel_count * 4u);
  int slot = -1;
  for (int i = 0; i < CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP; i++) {
    if (s_image_textures[i].valid && s_image_textures[i].texture_id == texture_id) {
      slot = i;
      break;
    }
  }
  if (slot < 0) {
    for (int i = 0; i < CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP; i++) {
      if (!s_image_textures[i].valid) {
        slot = i;
        break;
      }
    }
  }
  if (slot < 0) {
    free(rgba);
    return 0;
  }
  if (s_image_textures[slot].gl_texture != 0u) {
    if (s_pending_image_texture_delete_count >= CHENG_ANDROID_IMAGE_ATLAS_CACHE_CAP) {
      free(rgba);
      abort();
    }
    s_pending_image_texture_deletes[s_pending_image_texture_delete_count] = s_image_textures[slot].gl_texture;
    s_pending_image_texture_delete_count++;
  }
  free(s_image_textures[slot].pixels);
  memset(&s_image_textures[slot], 0, sizeof(s_image_textures[slot]));
  s_image_textures[slot].valid = 1;
  s_image_textures[slot].texture_id = texture_id;
  s_image_textures[slot].width = width;
  s_image_textures[slot].height = height;
  s_image_textures[slot].pixel_count = pixel_count;
  s_image_textures[slot].pixels = rgba;
  s_image_textures[slot].dynamic_texture = 1;
  return 1;
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
    int previewReady = 0;
    if (strncmp(mime, "image/", 6) == 0) {
      unsigned char* previewRgba = NULL;
      int previewW = 0;
      int previewH = 0;
      if (cheng_ohos_decode_image_rgba(local_path, &previewRgba, &previewW, &previewH)) {
        previewReady = cheng_harmony_install_dynamic_image_rgba("mediaPreviews", previewW, previewH, previewRgba);
        free(previewRgba);
      }
    }
    if (s_runtime_apply_media_selection != NULL) {
      int ok = s_runtime_apply_media_selection(stateRef, payload, previewReady);
      __android_log_print(ANDROID_LOG_INFO, "ChengCHT",
                          "file_picker_deliver: media-selection kind=%s preview=%d apply_arity=3 ok=%d",
                          stateRef, previewReady, ok);
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

int cheng_host_extract_rawfile_to_cache(const char* name) {
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

// Publish-receipt mailbox (2026-07-26 init-race root fix). The port reporter thread used to
// call s_runtime_set_state DIRECTLY from its background pthread — and runtime_set_state's
// generated body begins with `if !__csg_scene_build()`, i.e. a full 28.8MB scene
// deserialization re-entered CONCURRENTLY with the render thread's cheng_app_init (the
// __csgSceneInitialized gate is a plain bool set only at the END of the build). The two
// builds share __csgSceneGraph/__csgSceneDataBytes/__csgSceneBuildStep and one BytesFree's
// the buffer the other is parsing — the exact nondeterministic init family observed on
// device (success / fail@build_step=1000 / fail@resources / hang@resources). Same S5-B red
// line, same cure as the #14 r2 media-action mailbox in cheng_gui_host_adapter.c: the
// background thread only memcpy's into this mutex-guarded latest-wins slot; the render
// thread drains it (via cheng_host_media_mailbox_drain → cheng_host_publish_receipt_drain)
// and is the ONLY caller of runtime_set_state/resolve_own_ips for the receipt.
static pthread_mutex_t s_publish_receipt_mu = PTHREAD_MUTEX_INITIALIZER;
static char s_publish_receipt_cid[256] = {0};
static int s_publish_receipt_port = 0;
static int s_publish_receipt_pending = 0;

void cheng_host_publish_receipt_post(const char* cid, int port) {
  pthread_mutex_lock(&s_publish_receipt_mu);
  snprintf(s_publish_receipt_cid, sizeof(s_publish_receipt_cid), "%s", cid != NULL ? cid : "");
  s_publish_receipt_port = port;
  s_publish_receipt_pending = 1;
  pthread_mutex_unlock(&s_publish_receipt_mu);
}

void cheng_host_publish_receipt_drain(void) {
  // Render thread only. Deliberately keeps the receipt pending until the scene runtime is
  // actually up — s_gui_app_id==0 means init failed/not-yet, and calling set_state then
  // would re-enter the very build this mailbox exists to serialize against.
  if (s_gui_app_id == 0u || s_runtime_set_state == NULL) return;
  char cid[256]; int port; int pending;
  pthread_mutex_lock(&s_publish_receipt_mu);
  pending = s_publish_receipt_pending;
  if (pending) {
    snprintf(cid, sizeof(cid), "%s", s_publish_receipt_cid);
    port = s_publish_receipt_port;
    s_publish_receipt_pending = 0;
  }
  pthread_mutex_unlock(&s_publish_receipt_mu);
  if (!pending) return;
  int set_ok = s_runtime_set_state("publishedAssetCid", cid);
  __android_log_print(set_ok != 0 ? ANDROID_LOG_INFO : ANDROID_LOG_ERROR, "ChengCHT",
                      "publish: publishedAssetCid=%{public}s runtime_set_state ok=%{public}d", cid, set_ok);
  if (set_ok != 0) {
    // publish_trace t_pub2 + sourcePeer self-stamp — full original reporter tail, now on
    // the render thread (see the reporter's own comment block for the semantics).
    __android_log_print(ANDROID_LOG_INFO, "cheng-mobile-shell", "publish_trace t_pub2 content_id=%{public}s", cid);
    cheng_gui_host_resolve_own_ips();
    if (s_own_ip_count > 0) {
      char portText[16]; snprintf(portText, sizeof(portText), "%d", port);
      int hostOk = s_runtime_set_state("publishedSourcePeerHost", s_own_ip_text[0]);
      int portOk = s_runtime_set_state("publishedSourcePeerPort", portText);
      __android_log_print((hostOk != 0 && portOk != 0) ? ANDROID_LOG_INFO : ANDROID_LOG_ERROR, "cheng-mobile-shell",
                          "publish: sourcePeer self-stamp host=%{public}s port=%{public}s host_ok=%{public}d port_ok=%{public}d",
                          s_own_ip_text[0], portText, hostOk, portOk);
    } else {
      __android_log_print(ANDROID_LOG_ERROR, "cheng-mobile-shell",
                          "publish: own LAN IPv4 unknown -- sourcePeer NOT stamped, no default (content_id=%{public}s)", cid);
    }
  }
}

// OHOS HAP cannot bind a fixed server port, so the publisher binds ephemeral and writes the
// kernel-assigned port to the ready file. Poll it and surface the port to hilog so the
// device-to-device subscriber can dial 192.168.x.x:<port>. Once the port is up, read the
// publish-result return channel (moq_ready.cid, written by the publisher right after the
// port file — may appear a beat later, poll-tolerant) and post the {cid, port} receipt into
// the mailbox above — this thread never touches the Cheng runtime (init-race root fix).
void* cheng_publish_port_reporter(void* arg) {
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
          __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "publish: selected media serving on ephemeral bound_port=%{public}d (subscribers dial this device's own LAN IP:%{public}d)", port, port);
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
  // Init-race root fix: post the receipt and get off this thread — the render thread's
  // drain (cheng_host_publish_receipt_drain, see the mailbox block above) performs the
  // runtime_set_state + own-IP self-stamp sequence with the scene runtime guaranteed up.
  cheng_host_publish_receipt_post(cid, port);
  __android_log_print(ANDROID_LOG_INFO, "ChengCHT", "publish: receipt posted cid=%{public}s port=%{public}d (render thread will stamp state)", cid, port);
  return NULL;
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
  // cheng_app_on_back is already dlsym-resolved once into s_app_on_back by
  // cheng_resolve_exports (driver-skeleton single-resolution convention, see
  // harmony-host-codegen-migration-plan.md M3) — re-dlsym'ing it here on every
  // back-press was a duplicate registration of the same symbol, now removed.
  if (s_app_on_back == NULL) {
    return 0;
  }
  int rc = (int)s_app_on_back(s_gui_app_id);
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
