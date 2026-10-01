/* Desktop-only C provider stub for media_moq_es_pool_check_main.cheng (per-slot ES
 * connection pool, web_scene_media_network_bridge.cheng). Supplies the two @importc
 * symbols the bridge expects the real host to provide (cheng_scene_media_es_sink_frame /
 * cheng_host_es_diag) so the bridge module links and runs on desktop against real
 * media_moq_publisher_main processes.
 *
 * Sink: mirrors es_prefetch_test_host_stub.c — returns 2 ("FIFO full") after recording
 * exactly one frame, bounding each StreamLoop call to at most one delivered frame / one
 * network object request, so the check can assert exact delivery against the publisher's
 * served-object log.
 *
 * Diag: RECORDS cheng_host_es_diag step 21 ("pool adopt: warm connection moved to the
 * primary session" — see WebSceneMediaEsOpen's adoption prologue) instead of ignoring
 * it, so the check can prove an adoption actually fired (vs a fresh cold dial) without
 * packet capture. All other steps are ignored exactly like the existing stubs.
 */
#include <stdint.h>

static int32_t s_captured_count = 0;
static int32_t s_first_frame_idx = -1;
static int32_t s_diag_step21_count = 0;

int32_t cheng_scene_media_es_sink_frame(int32_t frameIdx, const void* runData, int32_t inRunOff, int32_t frameSize) {
  (void)runData;
  (void)inRunOff;
  (void)frameSize;
  s_captured_count = s_captured_count + 1;
  if (s_first_frame_idx < 0) {
    s_first_frame_idx = frameIdx;
  }
  return 2; /* FIFO full: stop this run, resume at the same cursor next tick */
}

void cheng_host_es_diag(int32_t step, int32_t a, int32_t b) {
  (void)a;
  (void)b;
  if (step == 21) {
    s_diag_step21_count = s_diag_step21_count + 1;
  }
}

int32_t cheng_test_es_sink_captured(void) {
  return s_captured_count;
}

int32_t cheng_test_es_sink_first_frame_idx(void) {
  return s_first_frame_idx;
}

int32_t cheng_test_es_diag_step21_count(void) {
  return s_diag_step21_count;
}
