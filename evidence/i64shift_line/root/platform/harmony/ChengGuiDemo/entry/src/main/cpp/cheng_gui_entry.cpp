// OHOS NAPI + XComponent entry for the Cheng GUI host.
// Registers the native module (setResourceManager from ArkTS) and the XComponent
// surface callbacks; starts a pthread render loop that drives the C host driver
// (cheng_gui_host_begin/tick/pause), which in turn drives the GLES compositor +
// EGL swap inside cheng_gui_host.c.
#include <ace/xcomponent/native_interface_xcomponent.h>
#include <hilog/log.h>
#include <napi/native_api.h>
#include <rawfile/raw_file_manager.h>

#include <pthread.h>
#include <time.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>

// Cross-device MoQ fetch entry, exported by the scene app (web_scene_media_network_bridge)
// linked into this same .so: dial host:port, fetch the announced object, write to
// outPath, return the byte count (>=0) or a negative status.
extern "C" int32_t cheng_scene_media_fetch_remote_announced_to_file(const char* host, int32_t port, const char* outPath);

// C driver API implemented in cheng_gui_host.c
extern "C" int  cheng_gui_host_begin(void* window, int phys_width, int phys_height, float density);
extern "C" void cheng_gui_host_tick(float dt);
extern "C" void cheng_gui_host_pause(void);
extern "C" void cheng_gui_host_touch(int phase, int phys_x, int phys_y);
extern "C" void cheng_gui_host_set_resource_manager(void* rm);
extern "C" int  cheng_gui_host_on_back(void);
// File picker bridge: DeliverFilePickerResult (ArkTS main thread) hands the picked
// file to the scene runtime; cheng_gui_entry_trigger_file_picker (defined below,
// outside the anonymous namespace so cheng_gui_host.c can call it) hands a picker
// request the other way, from the Cheng render thread to the ArkTS main thread.
extern "C" void cheng_gui_host_file_picker_deliver(const char* ref_name, const char* kind, const char* result_mode,
                                                    const char* result_state_ref, const char* local_path, const char* display_name);
// Startup-period own-content serve (cheng_gui_host_adapter.c): serves this device's
// bundled 麦田 asset from app launch, independent of the 发布 button. Idempotent —
// shares the publish gate, so calling this after (or before) a user publish is a
// safe no-op on whichever side loses the race.
extern "C" void cheng_host_start_own_serve(void);
// S4 block cache production wiring (cheng_gui_host_adapter.c, video-seek-scrub-blueprint.md
// §S4): initializes the GOP block cache against the OHOS per-HAP sandbox cache dir. Idempotent
// — safe to call once from ArkTS at startup alongside startOwnServe.
extern "C" void cheng_host_start_media_block_cache(void);
// #14 NAPI media control dispatch (cheng_gui_host_adapter.c, r2 mailbox shape): first
// NAPI-reachable play/pause/seek entry on this platform. The ArkTS-thread half only
// validates and publishes the action into a latest-wins mailbox (returns nonzero when
// queued); the CSG dispatch (cheng_app_media_control) and the seek_epoch-gated decoder
// handoff (cheng_host_video_seek) both run later, on the render thread, when RenderLoop
// drains the mailbox — same-thread-serial with stream teardown, per the S3a red line
// (r1's ArkTS-thread direct dispatch was a TOCTOU UAF against the render-thread
// teardown's free of the stream ctx).
extern "C" int32_t cheng_host_apply_media_action(const char* action_kind, const char* slot_id, const char* payload);
// #14 r2: render-thread consumer of the media-action mailbox; RenderLoop calls it
// immediately before every cheng_gui_host_tick.
extern "C" void cheng_host_media_mailbox_drain(void);
// Location capture bridge: DeliverLocationCaptureResult (ArkTS main thread) hands the
// geoLocationManager fix (or classified failure) to the scene runtime;
// cheng_gui_entry_trigger_location_capture (defined below) hands a capture request the
// other way, from the Cheng render thread to the ArkTS main thread. Same split as the
// file picker bridge above.
extern "C" void cheng_gui_host_location_capture_deliver(const char* preview_ref, const char* status_ref, const char* message_ref,
                                                          int32_t ok, double lat, double lon,
                                                          const char* err_code, const char* err_message);
// #14-eos: render-thread stream teardown (cheng_gui_host_adapter.c) — MUST run on this
// thread with the EGL context current (it frees decode-to-surface GL resources; see the
// function's own header comment). RenderLoop calls it once, right after its own `while
// (g_running)` loop exits, which is the natural surface-destroyed shutdown point that is
// (a) still the render thread and (b) still has EGL current — see the call site below for
// why this must NOT move into OnSurfaceDestroyed/cheng_gui_host_pause (a different thread).
extern "C" void cheng_stream_teardown_active(void);

namespace {

constexpr unsigned int kDomain = 0xC0DE;
constexpr const char* kTag = "ChengGuiDemo";

OHNativeWindow* g_window = nullptr;
int   g_width = 0;
int   g_height = 0;
float g_density = 3.0f;  // device pixel ratio for phys->logical viewport
pthread_t g_render_thread;
volatile int g_running = 0;
volatile int g_begun = 0;
// #14-eos v2: true once ANY RenderLoop thread has ever been created — distinguishes "this is
// the very first OnSurfaceCreated ever" (nothing to join) from "OnSurfaceDestroyed already
// ran once and a prior generation's thread handle is sitting in g_render_thread" (see
// OnSurfaceCreated below for how this is used, and RenderLoop's own join at its top for why).
volatile int g_render_thread_started = 0;
// #14-eos v3: bumped once, unconditionally, at the top of every OnSurfaceDestroyed —
// i.e. every time OHOS tells us a native window it previously handed us is going away.
// A RenderLoop generation snapshots this counter at spawn time (ChengRenderLoopArgs::
// spawnEpoch, captured in the SAME OnSurfaceCreated call that captures its window/size,
// so the two are never torn apart) and re-reads it right before it would touch that
// window. If the counter has moved, at least one OnSurfaceDestroyed fired since this
// generation's window was captured — meaning THIS generation's own window (not some
// other generation's) may already be a dangling OHNativeWindow* as far as OHOS is
// concerned — so it must not be handed to cheng_gui_host_begin. See RenderLoop's check
// for how this is used; plain volatile (no atomics) to match every other cross-thread
// flag already in this file (g_running, g_render_thread_started) — the pthread_create/
// pthread_join calls that already gate every reader of this counter are the same de
// facto barriers those flags already rely on, so this adds no new synchronization
// primitive or deadlock surface.
volatile uint64_t g_surface_destroy_epoch = 0;

// #14-eos v4 (fix for v_a3.md §风险②, "begin冷启动 check-then-use 终局"): a one-time,
// pre-cheng_gui_host_begin epoch read (RenderLoop's check below) cannot by itself close
// the gap — cheng_gui_host_begin's cold-start body (dlsym×7 + rawfile I/O×5 + app_init,
// gen.c, ONLY on the process's first successful call — see s_gui_exports_resolved/
// s_gui_runtime_payloads_applied's one-time gates there) is a real, non-instruction-scale
// wall-clock window during which g_running/g_surface_destroy_epoch can be driven through
// ANY number of further OnSurfaceDestroyed→OnSurfaceCreated cycles on the XComponent
// thread (each spawning a new generation that immediately blocks joining this one, per
// the v2/v3 join chain — so g_running can be flipped back to 1 by a LATER generation's
// create while THIS generation is still stuck cold-starting, i.e. a stale generation's
// own `while (g_running)` check could otherwise read a "resurrected" g_running=1 that
// belongs to a different, later generation entirely). RenderLoop's while-condition below
// re-reads g_surface_destroy_epoch against mySpawnEpoch on every iteration (not just
// once before begin) to close that: since g_surface_destroy_epoch is monotonic and never
// reset, ANY OnSurfaceDestroyed since this generation's spawn — regardless of how many
// generations came and went while this one was cold-starting — permanently disqualifies
// it from ever entering the loop (hence from ever reaching cheng_gui_host_tick/
// cheng_android_gpu_ensure), even if g_running happens to read 1 at that instant.
//
// That closes "may this generation touch the window at all", but not "is a touch that IS
// about to happen still safe against a destroy landing in the same instant" — the actual
// window dereference (EGL calls on `window`) happens inside cheng_android_gpu_ensure
// (gen.c), reached from cheng_gui_host_tick, i.e. genuinely concurrently with whatever
// the XComponent thread is doing. g_window_touch_mutex below is the mutual-exclusion
// primitive that closes THAT: OnSurfaceDestroyed holds it only across its own two
// (instant, no-I/O) writes; cheng_android_gpu_ensure holds it across its EGL call
// sequence (see cheng_gui_window_touch_lock/unlock below and their gen.c call site) —
// never across cheng_gui_host_begin's cold-start body, which never touches the window at
// all (see ChengRenderLoopArgs's comment) and stays completely unlocked/unbounded. This
// bounds OnSurfaceDestroyed's wait to "however long one EGL call sequence takes"
// (GPU-driver-bound, no I/O, no dlsym, no network — orders of magnitude under any ANR
// threshold), regardless of how long a cold start elsewhere might take.
pthread_mutex_t g_window_touch_mutex = PTHREAD_MUTEX_INITIALIZER;
// Forward-declared here (defined further down, outside this namespace, alongside this
// file's other cross-TU C-callable bridge functions) so OnSurfaceDestroyed below — and
// gen.c's cheng_android_gpu_ensure, via its own matching extern declaration — can both
// call these before/independent of that later definition point.
extern "C" void cheng_gui_window_touch_lock(void);
extern "C" void cheng_gui_window_touch_unlock(void);

// #14-eos v2/v3: passed to a NEW RenderLoop thread so it can join the OUTGOING generation
// before touching EGL/GL — see RenderLoop's own join at its top. Heap-allocated per spawn
// (not a shared global) so there is no ordering hazard between "commit that a prior thread
// exists to join" and "the pthread_create call that actually starts a thread able to
// consume that fact": OnSurfaceCreated only ever hands this struct to a thread it already
// knows was created successfully, and the new thread itself frees it before doing anything
// else — no second reader, no leak, no shared mutable state between generations.
// v3: also carries this generation's OWN window/size/density and the destroy-epoch that
// was current the instant they were captured (see g_surface_destroy_epoch above and the
// v_a2.md finding this closes) — a generation's RenderLoop thread may sit blocked in the
// join below for an unbounded time (network-I/O-bound teardown of the generation it is
// waiting on), during which g_window/g_width/g_height/g_density can be overwritten by
// ANY number of newer OnSurfaceCreated calls; reading those globals AFTER the join, as
// v2 did, binds this generation to whichever window happens to be current when the join
// finally clears — not necessarily its own. Snapshotting them here, at spawn time (same
// call, same thread, same instant as the prevThread/hasPrev snapshot), makes each
// generation immune to every later generation's global writes, the same way hasPrev/
// prevThread already are.
struct ChengRenderLoopArgs {
  pthread_t prevThread;
  int hasPrev;
  OHNativeWindow* window;
  int width;
  int height;
  float density;
  uint64_t spawnEpoch;
};

void* RenderLoop(void* arg) {
  // #14-eos v2 (fix for v_a.md §1.7 finding): join the OUTGOING generation's thread BEFORE
  // touching EGL/GL or any of the shared stream state at all. Before this, OnSurfaceCreated
  // (XComponent thread) pthread_create'd a NEW RenderLoop the instant g_running was 0, with
  // NO join of whatever thread g_render_thread still held — that old thread's OWN exit path
  // (this loop's `while (g_running)` ending, then cheng_stream_teardown_active() below, which
  // pthread_join's the network fetch thread + destroys the decoders + glDelete*s GL objects)
  // could still be mid-flight. A fast surface-destroy-then-recreate (screen rotation is the
  // common real-world trigger) previously raced the OLD thread's teardown tail (GL deletes,
  // global state resets) against this NEW thread's cheng_gui_host_begin (fresh eglMakeCurrent
  // + GL object creation) — two threads touching the SAME EGL display/shared GL objects and
  // globals concurrently, a window patch1 (the plain teardown-on-exit addition) had already
  // widened from microseconds to "however long the network fetch-thread join takes" without
  // addressing it. Joining HERE — on the NEW thread, before any of its own EGL/GL work —
  // makes the two generations strictly sequential without ever blocking the XComponent
  // callback thread that calls pthread_create (that call still returns immediately; only the
  // new render thread itself waits).
  ChengRenderLoopArgs* rlArgs = reinterpret_cast<ChengRenderLoopArgs*>(arg);
  OHNativeWindow* myWindow = nullptr;
  int myWidth = 0, myHeight = 0;
  float myDensity = 3.0f;
  uint64_t mySpawnEpoch = 0;
  if (rlArgs != nullptr) {
    myWindow = rlArgs->window;
    myWidth = rlArgs->width;
    myHeight = rlArgs->height;
    myDensity = rlArgs->density;
    mySpawnEpoch = rlArgs->spawnEpoch;
    if (rlArgs->hasPrev) {
      pthread_join(rlArgs->prevThread, nullptr);
    }
    free(rlArgs);
  }
  // #14-eos v3: the join above can block for an unbounded time (see the comment on
  // g_surface_destroy_epoch). By the time it clears, THIS generation's own window
  // (myWindow, captured at spawn — not whatever g_window currently holds) may itself
  // have been destroyed by OHOS: an OnSurfaceDestroyed for THIS generation's surface,
  // possibly followed by zero or more further create/destroy cycles that never spawned
  // a thread of their own (because g_running was still 1) or that this generation isn't
  // even the direct predecessor of. Any OnSurfaceDestroyed since spawn invalidates the
  // window this generation captured — bump of the epoch is the only signal needed,
  // regardless of how many generations came and went in between. Mirror the existing
  // cheng_gui_host_begin-failure path exactly: never touch myWindow, never touch
  // g_running (a newer generation may depend on it staying whatever it currently is),
  // never call cheng_stream_teardown_active (this generation never began, so it never
  // set up anything of its own to tear down — whatever real generation preceded it
  // already tore its own stuff down before this thread's join above could clear, by
  // induction on the join chain).
  if (g_surface_destroy_epoch != mySpawnEpoch) {
    OH_LOG_Print(LOG_APP, LOG_INFO, kDomain, kTag,
                 "RenderLoop generation superseded before begin (window destroyed during join wait), skipping");
    return nullptr;
  }
  if (!cheng_gui_host_begin(myWindow, myWidth, myHeight, myDensity)) {
    OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "cheng_gui_host_begin failed");
    g_running = 0;
    return nullptr;
  }
  g_begun = 1;
  OH_LOG_Print(LOG_APP, LOG_INFO, kDomain, kTag, "render loop begun phys=%{public}dx%{public}d", myWidth, myHeight);
  struct timespec prev;
  clock_gettime(CLOCK_MONOTONIC, &prev);
  // #14-eos v4: re-check mySpawnEpoch on every iteration, not just g_running. Plain
  // g_running alone is not enough here — cheng_gui_host_begin above can take a real,
  // unbounded amount of wall-clock time on its (first-ever) cold-start body, during
  // which the XComponent thread can run any number of further OnSurfaceDestroyed→
  // OnSurfaceCreated cycles; each such create spawns a fresh generation that immediately
  // blocks joining this one (v2/v3 join chain), so g_running can be flipped back to 1 by
  // a LATER generation while THIS generation was still cold-starting. Without the epoch
  // term, this (superseded) generation would read g_running==1, enter the loop, and call
  // cheng_gui_host_tick/cheng_android_gpu_ensure using myWindow — a window some OTHER,
  // more-current generation's OnSurfaceDestroyed has already invalidated. epoch is
  // monotonic and only ever set by OnSurfaceDestroyed, so mySpawnEpoch mismatching here
  // is an unforgeable "at least one destroy happened since I was spawned" signal,
  // independent of g_running's current value or how many generations came and went.
  while (g_running && g_surface_destroy_epoch == mySpawnEpoch) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    float dt = (float)(now.tv_sec - prev.tv_sec) + (float)(now.tv_nsec - prev.tv_nsec) / 1.0e9f;
    if (dt <= 0.0f || dt > 0.25f) dt = 1.0f / 60.0f;
    prev = now;
    // #14 r2: consume the newest external media action (Want/NAPI mailbox) on THIS
    // thread before the tick — the tick's route-leave teardown frees the stream ctx,
    // so the dispatch (CSG call + decoder seek) must stay same-thread-serial with it.
    cheng_host_media_mailbox_drain();
    cheng_gui_host_tick(dt);
    // Pace the render loop. (Removing this sleep to rely on a vsync-blocking swap REGRESSED
    // the loop to ~10fps — the swap is not a clean 60Hz block here — so keep the sleep.)
    // ~11ms → ~60fps loop target so the wall-clock frame-index gate can resolve 30fps video.
    struct timespec sleep_ts = {0, 11 * 1000 * 1000};
    nanosleep(&sleep_ts, nullptr);
  }
  // #14-eos: OnSurfaceDestroyed (XComponent thread) only sets g_running=0 and calls
  // cheng_gui_host_pause() — neither ever tore down an active network stream, so the
  // fetch thread / video+audio decoders / audio renderer kept running past surface
  // destruction, all the way to process death. This is this loop's OWN exit point:
  // g_running is already 0 (OnSurfaceDestroyed set it before this iteration's check),
  // still the render thread, EGL still current (no swap/teardown has run yet this exit) —
  // exactly the precondition cheng_stream_teardown_active documents for itself. Runs
  // exactly once, sequentially after the loop, so it can never race a still-executing
  // loop iteration or a second concurrent teardown.
  cheng_stream_teardown_active();
  return nullptr;
}

void OnSurfaceCreated(OH_NativeXComponent* component, void* window) {
  uint64_t w = 0, h = 0;
  if (OH_NativeXComponent_GetXComponentSize(component, window, &w, &h) != 0 || w == 0 || h == 0) {
    OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag,
                 "GetXComponentSize failed w=%{public}llu h=%{public}llu",
                 (unsigned long long)w, (unsigned long long)h);
    return;
  }
  g_window = (OHNativeWindow*)window;
  g_width = (int)w;
  g_height = (int)h;
  OH_LOG_Print(LOG_APP, LOG_INFO, kDomain, kTag,
               "OnSurfaceCreated size=%{public}dx%{public}d", g_width, g_height);
  if (!g_running) {
    g_running = 1;
    // #14-eos v2: snapshot whether a PRIOR generation's thread handle is sitting in
    // g_render_thread — and the handle itself — strictly BEFORE the pthread_create call
    // below overwrites g_render_thread with the NEW thread's own handle (reading it AFTER
    // would race the new thread reading the very same global for its own identity). First
    // ever call: g_render_thread_started is still 0, so hasPrev stays 0 and the new thread's
    // join below is a no-op — there has never been anything to join.
    ChengRenderLoopArgs* rlArgs = reinterpret_cast<ChengRenderLoopArgs*>(calloc(1, sizeof(ChengRenderLoopArgs)));
    if (rlArgs == nullptr) {
      g_running = 0;
      OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "RenderLoop args alloc failed");
      return;
    }
    rlArgs->hasPrev = g_render_thread_started;
    rlArgs->prevThread = g_render_thread;
    // #14-eos v3: snapshot THIS generation's own window/size/density and the
    // destroy-epoch current right now — same call, same thread, same instant as the
    // hasPrev/prevThread snapshot above, so RenderLoop never has to read g_window/
    // g_width/g_height/g_density (which later generations are free to overwrite while
    // this one is still blocked joining) nor guess whether its own window survived the
    // wait (see g_surface_destroy_epoch's comment and RenderLoop's check).
    rlArgs->window = g_window;
    rlArgs->width = g_width;
    rlArgs->height = g_height;
    rlArgs->density = g_density;
    rlArgs->spawnEpoch = g_surface_destroy_epoch;
    if (pthread_create(&g_render_thread, nullptr, RenderLoop, rlArgs) != 0) {
      g_running = 0;
      free(rlArgs);
      OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "pthread_create failed");
    } else {
      g_render_thread_started = 1;
    }
  }
}

void OnSurfaceDestroyed(OH_NativeXComponent* component, void* window) {
  (void)component; (void)window;
  // #14-eos v4: hold g_window_touch_mutex across both writes below so this callback can
  // never return — telling OHOS it may reclaim the window — while cheng_android_gpu_ensure
  // (gen.c, reached from RenderLoop's cheng_gui_host_tick) is mid-EGL-call on that same
  // window. The lock is only ever held elsewhere across that same bounded EGL call
  // sequence (see g_window_touch_mutex's declaration above), never across anything
  // unbounded, so this blocks for at most one EGL call's worth of time — nowhere near an
  // ANR risk — regardless of what the render thread's cold-start body might be doing
  // concurrently (that body never touches the window, so it never holds this mutex).
  cheng_gui_window_touch_lock();
  g_running = 0;
  // #14-eos v3: OHOS is telling us the window it previously handed us (whichever
  // generation currently holds g_window) is going away. Bump BEFORE any RenderLoop
  // generation blocked in its own join could observe it, so a generation that captured
  // its spawnEpoch snapshot before this point and re-checks after can tell its own
  // window may no longer be valid — see g_surface_destroy_epoch's comment.
  g_surface_destroy_epoch++;
  cheng_gui_window_touch_unlock();
  cheng_gui_host_pause();
}

void OnDispatchTouch(OH_NativeXComponent* component, void* window) {
  OH_NativeXComponent_TouchEvent touch;
  if (OH_NativeXComponent_GetTouchEvent(component, window, &touch) != 0) {
    return;
  }
  cheng_gui_host_touch((int)touch.type, (int)touch.x, (int)touch.y);
}

OH_NativeXComponent_Callback g_callback = {
  .OnSurfaceCreated = OnSurfaceCreated,
  .OnSurfaceChanged = nullptr,
  .OnSurfaceDestroyed = OnSurfaceDestroyed,
  .DispatchTouchEvent = OnDispatchTouch,
};

napi_value SetResourceManager(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc >= 1) {
    NativeResourceManager* rm = OH_ResourceManager_InitNativeResourceManager(env, argv[0]);
    cheng_gui_host_set_resource_manager((void*)rm);
  }
  napi_value undef = nullptr;
  napi_get_undefined(env, &undef);
  return undef;
}

napi_value SetDensity(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc >= 1) {
    double d = 0.0;
    if (napi_get_value_double(env, argv[0], &d) == napi_ok && d > 0.5 && d < 10.0) {
      g_density = (float)d;
      OH_LOG_Print(LOG_APP, LOG_INFO, kDomain, kTag, "setDensity %{public}.3f", d);
    }
  }
  napi_value undef = nullptr;
  napi_get_undefined(env, &undef);
  return undef;
}

struct ChengXdevFetchArgs { char host[64]; int port; char outPath[256]; };

void* ChengXdevFetchWorker(void* arg) {
  ChengXdevFetchArgs* a = (ChengXdevFetchArgs*)arg;
  struct timespec t0, t1;
  clock_gettime(CLOCK_MONOTONIC, &t0);
  int32_t n = cheng_scene_media_fetch_remote_announced_to_file(a->host, a->port, a->outPath);
  clock_gettime(CLOCK_MONOTONIC, &t1);
  long ms = (t1.tv_sec - t0.tv_sec) * 1000L + (t1.tv_nsec - t0.tv_nsec) / 1000000L;
  OH_LOG_Print(LOG_APP, LOG_INFO, kDomain, "ChengXdev",
               "秒开 fetch host=%{public}s:%{public}d -> bytes=%{public}d ms=%{public}ld out=%{public}s",
               a->host, a->port, n, ms, a->outPath);
  free(a);
  return nullptr;
}

napi_value FetchRemote(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  ChengXdevFetchArgs* a = (ChengXdevFetchArgs*)calloc(1, sizeof(ChengXdevFetchArgs));
  if (a == nullptr) { napi_value u = nullptr; napi_get_undefined(env, &u); return u; }
  size_t len = 0;
  if (argc >= 1) napi_get_value_string_utf8(env, argv[0], a->host, sizeof(a->host), &len);
  if (argc >= 2) { double p = 0; napi_get_value_double(env, argv[1], &p); a->port = (int)p; }
  if (argc >= 3) napi_get_value_string_utf8(env, argv[2], a->outPath, sizeof(a->outPath), &len);
  OH_LOG_Print(LOG_APP, LOG_INFO, kDomain, "ChengXdev",
               "fetchRemote dispatch host=%{public}s port=%{public}d", a->host, a->port);
  pthread_t th;
  if (pthread_create(&th, nullptr, ChengXdevFetchWorker, a) == 0) {
    pthread_detach(th);
  } else {
    free(a);
  }
  napi_value undef = nullptr;
  napi_get_undefined(env, &undef);
  return undef;
}

napi_value NavigateBack(napi_env env, napi_callback_info info) {
  (void)info;
  // Route the system back gesture to the scene; returns true if the scene
  // navigated back (consume the event) or false if at root (let the system exit).
  int handled = cheng_gui_host_on_back();
  napi_value out = nullptr;
  napi_get_boolean(env, handled != 0, &out);
  return out;
}

// startOwnServe(): begins serving this device's own bundled 麦田 asset (no user
// interaction required) — call once from ArkTS after setResourceManager. Runs on a
// detached native thread inside cheng_host_start_own_serve; returns immediately.
napi_value StartOwnServe(napi_env env, napi_callback_info info) {
  (void)info;
  cheng_host_start_own_serve();
  napi_value undef = nullptr;
  napi_get_undefined(env, &undef);
  return undef;
}

// startMediaBlockCache(): S4 block cache production wiring (video-seek-scrub-blueprint.md
// §S4) — call once from ArkTS at startup alongside startOwnServe. Idempotent, returns
// immediately (no thread spawn needed, just an mkdir + Init call).
napi_value StartMediaBlockCache(napi_env env, napi_callback_info info) {
  (void)info;
  cheng_host_start_media_block_cache();
  napi_value undef = nullptr;
  napi_get_undefined(env, &undef);
  return undef;
}

// applyMediaAction(actionKind, slotId, payload): #14 NAPI media control dispatch —
// the ArkTS-facing half of cheng_host_apply_media_action above (argument order matches
// that C entry). Runs on the ArkTS main thread but (r2) only publishes into the
// render-thread mailbox — the CSG/decoder dispatch itself happens at the next
// RenderLoop drain, so unlike navigateBack/deliverFilePickerResult nothing
// runtime-owned is dereferenced from this thread. Strings are fetched with the
// two-call NAPI length+copy pattern instead of fixed stack buffers: on the Android twin
// the media payload can be arbitrarily large (audio OpenAsset payloads are data URLs),
// so truncating here would silently corrupt the action — fail-closed on any non-string
// argument instead. Returns the queued boolean (accept/receipt detail is logged by the
// render-thread drain).
napi_value ApplyMediaAction(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3] = {nullptr, nullptr, nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  napi_value out = nullptr;
  napi_get_boolean(env, false, &out);
  if (argc < 3) {
    OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "applyMediaAction: expected 3 args, got %{public}zu", argc);
    return out;
  }
  char* strs[3] = {nullptr, nullptr, nullptr};
  bool argOk = true;
  for (int i = 0; i < 3; i++) {
    size_t len = 0;
    if (napi_get_value_string_utf8(env, argv[i], nullptr, 0, &len) != napi_ok) {
      argOk = false;
      break;
    }
    strs[i] = (char*)calloc(1, len + 1);
    if (strs[i] == nullptr) {
      argOk = false;
      break;
    }
    size_t copied = 0;
    if (napi_get_value_string_utf8(env, argv[i], strs[i], len + 1, &copied) != napi_ok) {
      argOk = false;
      break;
    }
  }
  if (argOk) {
    int32_t ok = cheng_host_apply_media_action(strs[0], strs[1], strs[2]);
    napi_get_boolean(env, ok != 0, &out);
  } else {
    OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "applyMediaAction: non-string argument");
  }
  for (int i = 0; i < 3; i++) {
    free(strs[i]);
  }
  return out;
}

// ---- File picker bridge -----------------------------------------------------
// cheng_host_open_file_picker (cheng_gui_host.c) runs on the Cheng render thread
// and needs to invoke @ohos.file.picker, which is ArkTS-only and UIAbility-bound.
// A napi_threadsafe_function is the production-correct way to call from an
// arbitrary native thread into a JS callback registered once from ArkTS
// (registerFilePickerCallback); the result comes back later via a plain,
// synchronous NAPI call from the ArkTS main thread (deliverFilePickerResult),
// matching the direct-call pattern already used by navigateBack/setResourceManager.
napi_threadsafe_function g_filePickerTsfn = nullptr;

struct ChengFilePickerRequest {
  char refName[80];
  char kind[32];
  char resultMode[32];
  char resultStateRef[80];
};

void CallJsFilePickerCallback(napi_env env, napi_value js_callback, void* context, void* data) {
  (void)context;
  ChengFilePickerRequest* req = reinterpret_cast<ChengFilePickerRequest*>(data);
  if (env != nullptr && js_callback != nullptr) {
    napi_value argv[4] = {nullptr, nullptr, nullptr, nullptr};
    napi_create_string_utf8(env, req->refName, NAPI_AUTO_LENGTH, &argv[0]);
    napi_create_string_utf8(env, req->kind, NAPI_AUTO_LENGTH, &argv[1]);
    napi_create_string_utf8(env, req->resultMode, NAPI_AUTO_LENGTH, &argv[2]);
    napi_create_string_utf8(env, req->resultStateRef, NAPI_AUTO_LENGTH, &argv[3]);
    napi_value undef = nullptr;
    napi_get_undefined(env, &undef);
    napi_value result = nullptr;
    napi_call_function(env, undef, js_callback, 4, argv, &result);
  }
  free(req);
}

napi_value RegisterFilePickerCallback(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc >= 1 && g_filePickerTsfn == nullptr) {
    napi_value resourceName = nullptr;
    napi_create_string_utf8(env, "ChengFilePicker", NAPI_AUTO_LENGTH, &resourceName);
    napi_status st = napi_create_threadsafe_function(env, argv[0], nullptr, resourceName, 0, 1,
                                                       nullptr, nullptr, nullptr,
                                                       CallJsFilePickerCallback, &g_filePickerTsfn);
    if (st != napi_ok) {
      OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "napi_create_threadsafe_function(file picker) failed st=%{public}d", (int)st);
      g_filePickerTsfn = nullptr;
    }
  }
  napi_value undef = nullptr;
  napi_get_undefined(env, &undef);
  return undef;
}

napi_value DeliverFilePickerResult(napi_env env, napi_callback_info info) {
  size_t argc = 6;
  napi_value argv[6] = {nullptr, nullptr, nullptr, nullptr, nullptr, nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char refName[80] = {0};
  char kind[32] = {0};
  char resultMode[32] = {0};
  char resultStateRef[80] = {0};
  char localPath[PATH_MAX] = {0};
  char displayName[256] = {0};
  size_t len = 0;
  if (argc >= 1) napi_get_value_string_utf8(env, argv[0], refName, sizeof(refName), &len);
  if (argc >= 2) napi_get_value_string_utf8(env, argv[1], kind, sizeof(kind), &len);
  if (argc >= 3) napi_get_value_string_utf8(env, argv[2], resultMode, sizeof(resultMode), &len);
  if (argc >= 4) napi_get_value_string_utf8(env, argv[3], resultStateRef, sizeof(resultStateRef), &len);
  if (argc >= 5) napi_get_value_string_utf8(env, argv[4], localPath, sizeof(localPath), &len);
  if (argc >= 6) napi_get_value_string_utf8(env, argv[5], displayName, sizeof(displayName), &len);
  cheng_gui_host_file_picker_deliver(refName, kind, resultMode, resultStateRef, localPath, displayName);
  napi_value undef = nullptr;
  napi_get_undefined(env, &undef);
  return undef;
}

// ---- Location capture bridge -------------------------------------------------
// cheng_host_capture_location (cheng_gui_host_adapter.c) runs on the Cheng render
// thread and needs to invoke @ohos.geoLocationManager.getCurrentLocation, which is
// Promise-based and ArkTS-only. Same napi_threadsafe_function hop as the file picker
// above; the fix (or classified failure) comes back later via a plain, synchronous
// NAPI call from the ArkTS main thread (deliverLocationCaptureResult).
napi_threadsafe_function g_locationCaptureTsfn = nullptr;

struct ChengLocationCaptureRequest {
  int32_t timeoutMs;
  int32_t maxAgeMs;
  char previewRef[80];
  char statusRef[80];
  char messageRef[80];
};

void CallJsLocationCaptureCallback(napi_env env, napi_value js_callback, void* context, void* data) {
  (void)context;
  ChengLocationCaptureRequest* req = reinterpret_cast<ChengLocationCaptureRequest*>(data);
  if (env != nullptr && js_callback != nullptr) {
    napi_value argv[5] = {nullptr, nullptr, nullptr, nullptr, nullptr};
    napi_create_int32(env, req->timeoutMs, &argv[0]);
    napi_create_int32(env, req->maxAgeMs, &argv[1]);
    napi_create_string_utf8(env, req->previewRef, NAPI_AUTO_LENGTH, &argv[2]);
    napi_create_string_utf8(env, req->statusRef, NAPI_AUTO_LENGTH, &argv[3]);
    napi_create_string_utf8(env, req->messageRef, NAPI_AUTO_LENGTH, &argv[4]);
    napi_value undef = nullptr;
    napi_get_undefined(env, &undef);
    napi_value result = nullptr;
    napi_call_function(env, undef, js_callback, 5, argv, &result);
  }
  free(req);
}

napi_value RegisterLocationCaptureCallback(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc >= 1 && g_locationCaptureTsfn == nullptr) {
    napi_value resourceName = nullptr;
    napi_create_string_utf8(env, "ChengLocationCapture", NAPI_AUTO_LENGTH, &resourceName);
    napi_status st = napi_create_threadsafe_function(env, argv[0], nullptr, resourceName, 0, 1,
                                                       nullptr, nullptr, nullptr,
                                                       CallJsLocationCaptureCallback, &g_locationCaptureTsfn);
    if (st != napi_ok) {
      OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "napi_create_threadsafe_function(location capture) failed st=%{public}d", (int)st);
      g_locationCaptureTsfn = nullptr;
    }
  }
  napi_value undef = nullptr;
  napi_get_undefined(env, &undef);
  return undef;
}

napi_value DeliverLocationCaptureResult(napi_env env, napi_callback_info info) {
  size_t argc = 8;
  napi_value argv[8] = {nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr, nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  char previewRef[80] = {0};
  char statusRef[80] = {0};
  char messageRef[80] = {0};
  char errCode[32] = {0};
  char errMessage[160] = {0};
  bool ok = false;
  double lat = 0.0;
  double lon = 0.0;
  size_t len = 0;
  if (argc >= 1) napi_get_value_string_utf8(env, argv[0], previewRef, sizeof(previewRef), &len);
  if (argc >= 2) napi_get_value_string_utf8(env, argv[1], statusRef, sizeof(statusRef), &len);
  if (argc >= 3) napi_get_value_string_utf8(env, argv[2], messageRef, sizeof(messageRef), &len);
  if (argc >= 4) napi_get_value_bool(env, argv[3], &ok);
  if (argc >= 5) napi_get_value_double(env, argv[4], &lat);
  if (argc >= 6) napi_get_value_double(env, argv[5], &lon);
  if (argc >= 7) napi_get_value_string_utf8(env, argv[6], errCode, sizeof(errCode), &len);
  if (argc >= 8) napi_get_value_string_utf8(env, argv[7], errMessage, sizeof(errMessage), &len);
  cheng_gui_host_location_capture_deliver(previewRef, statusRef, messageRef, ok ? 1 : 0, lat, lon, errCode, errMessage);
  napi_value undef = nullptr;
  napi_get_undefined(env, &undef);
  return undef;
}

napi_value NapiInit(napi_env env, napi_value exports) {
  napi_property_descriptor props[11] = {
    {"setResourceManager", nullptr, SetResourceManager, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setDensity", nullptr, SetDensity, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"fetchRemote", nullptr, FetchRemote, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"navigateBack", nullptr, NavigateBack, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"registerFilePickerCallback", nullptr, RegisterFilePickerCallback, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"deliverFilePickerResult", nullptr, DeliverFilePickerResult, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"startOwnServe", nullptr, StartOwnServe, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"startMediaBlockCache", nullptr, StartMediaBlockCache, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"applyMediaAction", nullptr, ApplyMediaAction, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"registerLocationCaptureCallback", nullptr, RegisterLocationCaptureCallback, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"deliverLocationCaptureResult", nullptr, DeliverLocationCaptureResult, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 11, props);

  // Bind the XComponent: ArkUI injects the OH_NativeXComponent* under
  // __NATIVE_XCOMPONENT_OBJ__ on this module's exports when the XComponent whose
  // libraryname matches this module is loaded. Register the surface callbacks on
  // it. (The global OH_NativeXComponent_OnLoad export is NOT auto-invoked on this
  // OHOS version, so this property path is the reliable binding mechanism.)
  napi_value exportInstance = nullptr;
  if (napi_get_named_property(env, exports, OH_NATIVE_XCOMPONENT_OBJ, &exportInstance) == napi_ok) {
    OH_NativeXComponent* nativeXComponent = nullptr;
    if (napi_unwrap(env, exportInstance, reinterpret_cast<void**>(&nativeXComponent)) == napi_ok &&
        nativeXComponent != nullptr) {
      OH_NativeXComponent_RegisterCallback(nativeXComponent, &g_callback);
      OH_LOG_Print(LOG_APP, LOG_INFO, kDomain, kTag, "XComponent callback registered via NapiInit OBJ");
    } else {
      OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "napi_unwrap __NATIVE_XCOMPONENT_OBJ__ failed");
    }
  } else {
    OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "no __NATIVE_XCOMPONENT_OBJ__ on exports");
  }
  return exports;
}

napi_module g_module = {
  .nm_version = 1,
  .nm_flags = 0,
  .nm_filename = nullptr,
  .nm_register_func = NapiInit,
  .nm_modname = "cheng_gui_host",
  .nm_priv = nullptr,
  .reserved = {0},
};

}  // namespace

extern "C" __attribute__((constructor)) void ChengGuiRegisterModule(void) {
  napi_module_register(&g_module);
}

extern "C" __attribute__((visibility("default"))) void OH_NativeXComponent_OnLoad(OH_NativeXComponent* component, void* reserved) {
  (void)reserved;
  OH_NativeXComponent_RegisterCallback(component, &g_callback);
}

// #14-eos v4: render-thread side of the g_window_touch_mutex handshake (see the mutex's
// own declaration above and OnSurfaceDestroyed's use of these same two functions).
// Called from cheng_android_gpu_ensure (cheng_gui_host_gen.c) around its EGL call
// sequence — that function has no visibility into this .cpp's globals, so the mutex
// itself stays private here and these two are the only cross-TU surface it needs.
extern "C" void cheng_gui_window_touch_lock(void) {
  pthread_mutex_lock(&g_window_touch_mutex);
}

extern "C" void cheng_gui_window_touch_unlock(void) {
  pthread_mutex_unlock(&g_window_touch_mutex);
}

// Called from cheng_gui_host.c's cheng_host_open_file_picker (Cheng render thread).
// Queues the request onto the ArkTS main thread via the threadsafe function
// registered by registerFilePickerCallback; returns immediately (the eventual
// picker result comes back asynchronously through deliverFilePickerResult).
// g_filePickerTsfn == nullptr means ArkTS never registered its callback — a
// startup wiring bug, not a runtime condition, so it aborts loudly like the
// equivalent missing-bridge checks in cheng_gui_host.c.
extern "C" void cheng_gui_entry_trigger_file_picker(const char* refName, const char* kind, const char* resultMode, const char* resultStateRef) {
  if (g_filePickerTsfn == nullptr) {
    OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "file picker bridge: ArkTS callback not registered");
    abort();
  }
  ChengFilePickerRequest* req = reinterpret_cast<ChengFilePickerRequest*>(calloc(1, sizeof(ChengFilePickerRequest)));
  if (req == nullptr) {
    OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "file picker bridge: alloc failed");
    abort();
  }
  snprintf(req->refName, sizeof(req->refName), "%s", refName != nullptr ? refName : "");
  snprintf(req->kind, sizeof(req->kind), "%s", kind != nullptr ? kind : "");
  snprintf(req->resultMode, sizeof(req->resultMode), "%s", resultMode != nullptr ? resultMode : "");
  snprintf(req->resultStateRef, sizeof(req->resultStateRef), "%s", resultStateRef != nullptr ? resultStateRef : "");
  napi_status st = napi_call_threadsafe_function(g_filePickerTsfn, req, napi_tsfn_nonblocking);
  if (st != napi_ok) {
    OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "file picker bridge: napi_call_threadsafe_function failed st=%{public}d", (int)st);
    free(req);
    abort();
  }
}

// Called from cheng_gui_host_adapter.c's cheng_host_capture_location (Cheng render
// thread). Queues the request onto the ArkTS main thread via the threadsafe function
// registered by registerLocationCaptureCallback; returns immediately (the eventual
// fix or classified failure comes back asynchronously through
// deliverLocationCaptureResult). g_locationCaptureTsfn == nullptr means ArkTS never
// registered its callback — a startup wiring bug, not a runtime condition, so it
// aborts loudly like the equivalent file picker check above.
extern "C" void cheng_gui_entry_trigger_location_capture(int32_t timeout_ms, int32_t max_age_ms,
                                                          const char* preview_ref, const char* status_ref,
                                                          const char* message_ref) {
  if (g_locationCaptureTsfn == nullptr) {
    OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "location capture bridge: ArkTS callback not registered");
    abort();
  }
  ChengLocationCaptureRequest* req = reinterpret_cast<ChengLocationCaptureRequest*>(calloc(1, sizeof(ChengLocationCaptureRequest)));
  if (req == nullptr) {
    OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "location capture bridge: alloc failed");
    abort();
  }
  req->timeoutMs = timeout_ms;
  req->maxAgeMs = max_age_ms;
  snprintf(req->previewRef, sizeof(req->previewRef), "%s", preview_ref != nullptr ? preview_ref : "");
  snprintf(req->statusRef, sizeof(req->statusRef), "%s", status_ref != nullptr ? status_ref : "");
  snprintf(req->messageRef, sizeof(req->messageRef), "%s", message_ref != nullptr ? message_ref : "");
  napi_status st = napi_call_threadsafe_function(g_locationCaptureTsfn, req, napi_tsfn_nonblocking);
  if (st != napi_ok) {
    OH_LOG_Print(LOG_APP, LOG_ERROR, kDomain, kTag, "location capture bridge: napi_call_threadsafe_function failed st=%{public}d", (int)st);
    free(req);
    abort();
  }
}
