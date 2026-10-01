/* Desktop-only C provider stub for
 * media_moq_es_pump_backpressure_contract_check_main.cheng (S5-B backpressure/yield-point
 * contract on WebSceneMediaEsStreamLoop, docs/... hmpump/design.md).
 *
 * UNLIKE es_prefetch_test_host_stub.c (which always reports "FIFO full" after exactly one
 * frame, purely to bound each StreamLoop() call to one delivered frame for request-count
 * assertions), this stub is deliberately PERMISSIVE: it NEVER reports "full" (always
 * returns 1, "keep going"). A real Harmony-shaped host FIFO with room to spare behaves the
 * same way from StreamLoop's point of view — the sink never says stop. This is exactly the
 * condition that used to let one StreamLoop() call march through the WHOLE remaining clip
 * (see the bridge module's pre-fix history): with THIS stub, the checker can observe
 * whether a single call is actually bounded to one run/GOP (the S5-B contract) or not,
 * which the always-full stub could never distinguish (it forces an early exit on frame 1
 * of every call regardless of the contract under test).
 */
#include <stdint.h>

static int32_t s_captured_count = 0;
static int32_t s_first_frame_idx = -1;
static int32_t s_last_frame_idx = -1;

int32_t cheng_scene_media_es_sink_frame(int32_t frameIdx, const void* runData, int32_t inRunOff, int32_t frameSize) {
  (void)runData;
  (void)inRunOff;
  (void)frameSize;
  s_captured_count = s_captured_count + 1;
  if (s_first_frame_idx < 0) {
    s_first_frame_idx = frameIdx;
  }
  s_last_frame_idx = frameIdx;
  return 1; /* never full: keep streaming within this call */
}

void cheng_host_es_diag(int32_t step, int32_t a, int32_t b) {
  (void)step;
  (void)a;
  (void)b;
}

int32_t cheng_test_es_sink_captured(void) {
  return s_captured_count;
}

int32_t cheng_test_es_sink_first_frame_idx(void) {
  return s_first_frame_idx;
}

int32_t cheng_test_es_sink_last_frame_idx(void) {
  return s_last_frame_idx;
}
