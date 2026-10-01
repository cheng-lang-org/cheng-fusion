#ifndef CHENG_MOBILE_SURFACE_PROVIDER_H
#define CHENG_MOBILE_SURFACE_PROVIDER_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Opaque handle ─────────────────────────────────────── */

typedef void* MobileSurfaceHandle;

/* ── Pixel buffer returned by Lock ─────────────────────── */

typedef struct {
    void*   pixels;   /* RGBA 8888 pixel data, 4 bytes per pixel */
    int32_t stride;   /* bytes per row (may be > width*4 for alignment) */
    int32_t width;    /* width in pixels */
    int32_t height;   /* height in pixels */
} MobileSurfaceBuffer;

/* ── Event constants ────────────────────────────────────── */

/* Return value of mobile_surface_poll_event */
#define MOBILE_SURFACE_EVENT_NONE   0
#define MOBILE_SURFACE_EVENT_TOUCH  1
#define MOBILE_SURFACE_EVENT_KEY    2
#define MOBILE_SURFACE_EVENT_CLOSE  3

/* Touch action values (mirrors Android MotionEvent) */
#define MOBILE_SURFACE_TOUCH_DOWN   0
#define MOBILE_SURFACE_TOUCH_UP     1
#define MOBILE_SURFACE_TOUCH_MOVE   2
#define MOBILE_SURFACE_TOUCH_CANCEL 3

/* Key action */
#define MOBILE_SURFACE_KEY_DOWN     0
#define MOBILE_SURFACE_KEY_UP       1

/* ── Event struct — flat layout for Cheng FFI compat ───── */

typedef struct {
    int32_t type;            /* MobileSurfaceEventType */
    int32_t _pad0;
    int64_t timestampMs;
    int32_t surfaceWidth;
    int32_t surfaceHeight;
    /* Touch fields (valid when type == MOBILE_SURFACE_EVENT_TOUCH) */
    int32_t fingerId;
    int32_t touchAction;
    int32_t touchX;
    int32_t touchY;
    int32_t pressure;
    /* Key fields (valid when type == MOBILE_SURFACE_EVENT_KEY) */
    int32_t keyCode;
    int32_t keyAction;
    int32_t keyModifiers;
} MobileSurfaceEvent;

/* ── Lifecycle ──────────────────────────────────────────── */

MobileSurfaceHandle mobile_surface_create(int32_t width, int32_t height, const char* title);
void mobile_surface_destroy(MobileSurfaceHandle surface);

/* ── Rendering (Lock/Unlock) ────────────────────────────── */

/*
 * Lock the surface for writing. Returns a buffer struct.
 * The pixels pointer is valid until the matching Unlock call.
 * Returns zeroed buffer (pixels=NULL) on failure.
 */
MobileSurfaceBuffer mobile_surface_lock(MobileSurfaceHandle surface);

/*
 * Unlock and post the pixel buffer to the display.
 * Must be preceded by a successful Lock call.
 */
void mobile_surface_unlock(MobileSurfaceHandle surface);

/* ── Input ──────────────────────────────────────────────── */

/*
 * Poll the next pending event.
 * Returns MOBILE_SURFACE_EVENT_NONE (0) if no event is pending.
 * Otherwise fills *out_event and returns the event type.
 */
int32_t mobile_surface_poll_event(MobileSurfaceHandle surface, MobileSurfaceEvent* out_event);

#ifdef __cplusplus
}
#endif

#endif /* CHENG_MOBILE_SURFACE_PROVIDER_H */
