/* live-host.c — LIVE_MIRROR 实时档 in-process 微型宿主。
 * dlopen 渲染器 dylib, 直接调用 csg_hs_frame_once / csg_hs_poll_frame:
 * 免渲染器 exe 的 spawn(实测 20ms)与文件轮询往返; 链接仅 libSystem, 自身启动 <10ms。
 *
 * 用法: live-host [--once]
 *   默认: frame_once 后进入 5ms 轮询循环, poll 返回 99(quit)退出。
 *   --once: 单帧后退出(冷基线)。
 * 退出码语义与渲染器 main 一致(20+initialStatus/30/41), 60/61 为宿主自身错误。
 */
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

typedef int (*hs_fn)(void);

int main(int argc, char** argv) {
  const char* path = getenv("CHENG_HS_DYLIB");
  if (path == NULL || path[0] == '\0') path = "renderer.dylib";
  void* handle = dlopen(path, RTLD_NOW | RTLD_LOCAL);
  if (handle == NULL) {
    fprintf(stderr, "live-host: dlopen %s failed: %s\n", path, dlerror());
    return 60;
  }
  hs_fn frame_once = (hs_fn)dlsym(handle, "csg_hs_frame_once");
  hs_fn poll_frame = (hs_fn)dlsym(handle, "csg_hs_poll_frame");
  if (frame_once == NULL || poll_frame == NULL) {
    fprintf(stderr, "live-host: dlsym failed: %s\n", dlerror());
    return 61;
  }
  int rc = frame_once();
  if (rc != 0) {
    fprintf(stderr, "live-host: frame_once rc=%d\n", rc);
    return rc;
  }
  if (argc > 1 && strcmp(argv[1], "--once") == 0) return 0;
  // 换班回收: Cheng 运行时重建路径存在按节点比例的内存留存(见 LIVE_MIRROR
  // CAMPAIGN 缺口), 达到换班阈值即退出(7), 驱动端重拉宿主, RSS 有界锯齿。
  long recycle = 300;
  const char* rcEnv = getenv("CHENG_HS_RECYCLE_SWAPS");
  if (rcEnv && rcEnv[0]) recycle = atol(rcEnv);
  long swaps = 0;
  for (;;) {
    int p = poll_frame();
    if (p == 99) return 0;
    if (p == 41) {
      fprintf(stderr, "live-host: swap failed\n");
      return 41;
    }
    if (p == 1) {
      swaps += 1;
      if (swaps >= recycle) {
        fprintf(stderr, "live-host: recycle after %ld swaps\n", swaps);
        return 7;
      }
    }
    usleep(5000);
  }
}
