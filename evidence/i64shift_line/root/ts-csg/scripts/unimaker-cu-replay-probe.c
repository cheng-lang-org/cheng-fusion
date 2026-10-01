#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
extern void cheng_mobile_host_runtime_set_launch_args(const char* kv, const char* json);
extern void cheng_mobile_host_begin_offscreen_capture(int w, int h);
extern uint64_t cheng_app_init(void);
extern void cheng_app_set_window(uint64_t app, uint64_t win, int32_t w, int32_t h, float scale);
extern void cheng_app_tick(uint64_t app, float dt);
extern int32_t cheng_app_computer_use_compile_text_utf8(const char* text, int32_t executionMode, int32_t slowPermille);
extern int32_t cheng_app_computer_use_gui_replay_start(int32_t slowPermille);
extern int32_t cheng_app_computer_use_gui_replay_tick(int32_t deltaMs);
extern int32_t cheng_app_debug_computer_use_gui_replay_active(void);
extern int32_t cheng_app_debug_computer_use_gui_replay_step_index(void);
extern int32_t cheng_app_debug_computer_use_gui_replay_step_count(void);
extern int32_t cheng_app_debug_computer_use_gui_replay_applied_count(void);
extern int32_t cheng_app_debug_computer_use_gui_replay_last_status(void);
extern int32_t cheng_app_debug_computer_use_manifest_ready(void);
extern int32_t cheng_app_debug_computer_use_action_count(void);
extern int32_t cheng_app_debug_computer_use_template_count(void);
extern int32_t cheng_app_debug_computer_use_step_count(void);
extern int32_t cheng_app_debug_computer_use_coverage_percent(void);
extern int32_t cheng_app_debug_computer_use_last_template_code(void);
extern int32_t cheng_app_debug_computer_use_last_action_count(void);
extern int32_t cheng_app_debug_computer_use_last_step_count(void);
extern int32_t cheng_app_debug_computer_use_last_status(void);
static const char* cases[] = {
  "发布短视频草稿",
  "发布广告视频草稿",
  "发布授权商品草稿",
  "帮我购买商品",
  "搜索内容",
  "查看距离最近的二手",
  "点赞这个内容",
  "查看消息并翻看聊天记录",
};
int main(void) {
  cheng_mobile_host_runtime_set_launch_args("route_state=home_default\nroute_lock=1\n", "");
  cheng_mobile_host_begin_offscreen_capture(390, 844);
  uint64_t app = cheng_app_init();
  cheng_app_set_window(app, 1, 390, 844, 1.0f);
  for (int i=0;i<3;i++) cheng_app_tick(app, 0.016667f);
  printf("manifest_ready=%d action_count=%d template_count=%d step_count=%d coverage=%d\n",
    cheng_app_debug_computer_use_manifest_ready(), cheng_app_debug_computer_use_action_count(),
    cheng_app_debug_computer_use_template_count(), cheng_app_debug_computer_use_step_count(),
    cheng_app_debug_computer_use_coverage_percent());
  int all_ok = 1;
  for (int c=0; c<8; c++) {
    int compile = cheng_app_computer_use_compile_text_utf8(cases[c], 1, 0);
    int code = cheng_app_debug_computer_use_last_template_code();
    int steps = cheng_app_debug_computer_use_last_step_count();
    int actions = cheng_app_debug_computer_use_last_action_count();
    int status = cheng_app_debug_computer_use_last_status();
    int start = code > 0 ? cheng_app_computer_use_gui_replay_start(0) : 0;
    int tick = 0;
    int loops = 0;
    while (cheng_app_debug_computer_use_gui_replay_active() != 0 && loops < 5000) {
      tick = cheng_app_computer_use_gui_replay_tick(16);
      cheng_app_tick(app, 0.016667f);
      loops++;
    }
    int idx = cheng_app_debug_computer_use_gui_replay_step_index();
    int applied = cheng_app_debug_computer_use_gui_replay_applied_count();
    int replay_status = cheng_app_debug_computer_use_gui_replay_last_status();
    int ok = compile == c + 1 && code == c + 1 && steps > 0 && replay_status == 2 && idx == steps && applied == steps;
    if (ok == 0) all_ok = 0;
    printf("case=%d utterance=%s compile=%d template_code=%d steps=%d actions=%d compile_status=%d start=%d loops=%d tick=%d step_index=%d applied=%d replay_status=%d ok=%d\n",
      c, cases[c], compile, code, steps, actions, status, start, loops, tick, idx, applied, replay_status, ok);
    fflush(stdout);
  }
  printf("ALL_COMPUTER_USE_REPLAY_OK=%d\n", all_ok);
  return all_ok ? 0 : 1;
}
