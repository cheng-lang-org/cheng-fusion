/* Desktop-only C provider stub for media_moq_es_prefetch_tick_check_main.cheng (S5 of
 * docs/video-seek-scrub-blueprint.md). Supplies the two @importc symbols
 * web_scene_media_network_bridge.cheng expects the real host to provide
 * (cheng_scene_media_es_sink_frame / cheng_host_es_diag) so the bridge module links and
 * runs on desktop against a real media_moq_publisher_main — no decode/render, just enough
 * to observe what WebSceneMediaEsStreamLoop actually delivered.
 *
 * The sink always returns 2 ("FIFO full, stop this run, resume at the same cursor next
 * tick") after recording exactly one frame — this is the real backpressure signal a host
 * FIFO gives under load (see cheng_scene_media_es_sink_frame's contract comment in the
 * bridge module), reused here purely to bound each WebSceneMediaEsStreamLoop() call to at
 * most one delivered frame / at most one network object request, so the calling test can
 * assert exact request counts against the publisher's own served-object log. Mirrors the
 * (never-landed) seek_test_host_stub.c design documented in
 * media_moq_es_seek_to_frame_check_main.cheng's header comment.
 */
#include <stdint.h>

static int32_t s_captured_count = 0;
static int32_t s_first_frame_idx = -1;

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
