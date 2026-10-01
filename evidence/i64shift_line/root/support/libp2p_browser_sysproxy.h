#ifndef LIBP2P_BROWSER_SYSPROXY_H
#define LIBP2P_BROWSER_SYSPROXY_H

// 系统/网络服务代理的对称翻转(指纹 profile per-profile 出口)。
// 安全设计:
//   1. 仅当 profile 显式给出 "systemProxy" 配置时才触碰系统设置;
//   2. 应用前把原 web/secureWeb/socks 设置存到恢复文件, 退出(atexit + SIGINT/SIGTERM)时恢复;
//   3. 启动时若发现未恢复的残留文件(上次异常退出), 先恢复再继续;
//   4. networksetup 不可用/无权限时如实返回失败, 不做半翻转。
#include <stdint.h>

// 返回 0 成功(已应用并登记恢复文件), 非 0 失败(未触碰或已回滚)。
int32_t cheng_sysproxy_apply(const char* service,
                             const char* webProxy,   const char* webPort,
                             const char* secureProxy, const char* securePort,
                             const char* socksProxy, const char* socksPort);

// 恢复 apply 前保存的原设置; 返回 0 成功。
int32_t cheng_sysproxy_restore(void);

// signal() 直接可挂的处理器包装(SIGINT/SIGTERM)。
void cheng_sysproxy_restore_on_signal(int sig);

#endif
