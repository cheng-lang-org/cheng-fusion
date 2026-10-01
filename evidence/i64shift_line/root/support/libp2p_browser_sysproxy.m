#import "libp2p_browser_sysproxy.h"
#import <Foundation/Foundation.h>
#include <stdlib.h>
#include <string.h>

static void cheng_sysproxy_restore_void(void);
int32_t cheng_sysproxy_restore(void);

// networksetup 对称翻转。恢复文件: <tmp>/cheng-fp-sysproxy-restore.txt
// 内容 7 行: service / webHost:Port(可空) / 占位 / secHost:Port(可空) / 占位 / socksHost:Port(可空) / 占位

static NSString* RestorePath(void) {
    return [NSTemporaryDirectory() stringByAppendingPathComponent:@"cheng-fp-sysproxy-restore.txt"];
}

static NSString* RunNetsetup(NSArray<NSString*>* args) {
    NSTask* t = [NSTask new];
    t.launchPath = @"/usr/sbin/networksetup";
    t.arguments = args;
    NSPipe* out = [NSPipe pipe];
    t.standardOutput = out;
    t.standardError = out;
    @try {
        [t launch];
        [t waitUntilExit];
        NSData* d = [[out fileHandleForReading] readDataToEndOfFile];
        return [[NSString alloc] initWithData:d encoding:NSUTF8StringEncoding] ?: @"";
    } @catch (NSException* e) {
        return nil;
    }
}

static NSString* Trim(NSString* s) {
    return [s stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
}

// 返回 "host:port"(未启用=空串); 解析失败/未启用均返回空。
static NSString* CurrentProxy(NSString* service, NSString* kind) {
    NSString* verb = [NSString stringWithFormat:@"-get%@proxy", kind];
    NSString* s = RunNetsetup(@[verb, service]);
    if (s.length == 0) return @"";
    NSString* enabled = @"";
    NSString* host = @"";
    NSString* port = @"";
    for (NSString* raw in [s componentsSeparatedByString:@"\n"]) {
        NSString* line = Trim(raw);
        NSArray* kv = [line componentsSeparatedByString:@": "];
        if (kv.count < 2) continue;
        NSString* k = Trim(kv[0]);
        NSString* v = Trim([[kv subarrayWithRange:NSMakeRange(1, kv.count - 1)] componentsJoinedByString:@": "]);
        if ([k isEqualToString:@"Enabled"]) enabled = v;
        else if ([k isEqualToString:@"Server"]) host = v;
        else if ([k isEqualToString:@"Port"]) port = v;
    }
    if ([enabled isEqualToString:@"Yes"] && host.length > 0 && port.length > 0) {
        return [NSString stringWithFormat:@"%@:%@", host, port];
    }
    return @"";
}

static void SetOrOff(NSString* verbSet, NSString* verbState, NSString* svc, NSString* hostPort) {
    if (hostPort.length > 0) {
        NSArray* hp = [hostPort componentsSeparatedByString:@":"];
        if (hp.count >= 2) {
            RunNetsetup(@[verbSet, svc, hp[0], hp[1]]);
            return;
        }
    }
    RunNetsetup(@[verbState, svc, @"Off"]);
}

int32_t cheng_sysproxy_apply(const char* service,
                             const char* webProxy, const char* webPort,
                             const char* secureProxy, const char* securePort,
                             const char* socksProxy, const char* socksPort) {
    @autoreleasepool {
        if (!service || strlen(service) == 0) return 1;
        NSString* svc = [NSString stringWithUTF8String:service];
        NSFileManager* fm = [NSFileManager defaultManager];
        NSString* rp = RestorePath();
        if ([fm fileExistsAtPath:rp]) cheng_sysproxy_restore(); // 残留先还原
        NSString* curWeb = CurrentProxy(svc, @"web");
        NSString* curSec = CurrentProxy(svc, @"secureweb");
        NSString* curSocks = CurrentProxy(svc, @"socks");
        NSString* save = [@[svc, curWeb, @"", curSec, @"", curSocks, @""] componentsJoinedByString:@"\n"];
        [save writeToFile:rp atomically:YES encoding:NSUTF8StringEncoding error:nil];
        NSString* webP = webProxy ? [NSString stringWithUTF8String:webProxy] : @"";
        NSString* webN = webPort ? [NSString stringWithUTF8String:webPort] : @"";
        NSString* secP = secureProxy ? [NSString stringWithUTF8String:secureProxy] : @"";
        NSString* secN = securePort ? [NSString stringWithUTF8String:securePort] : @"";
        NSString* socksP = socksProxy ? [NSString stringWithUTF8String:socksProxy] : @"";
        NSString* socksN = socksPort ? [NSString stringWithUTF8String:socksPort] : @"";
        if (webP.length > 0) RunNetsetup(@[@"-setwebproxy", svc, webP, webN]);
        if (secP.length > 0) RunNetsetup(@[@"-setsecurewebproxy", svc, secP, secN]);
        if (socksP.length > 0) RunNetsetup(@[@"-setsocksfirewallproxy", svc, socksP, socksN]);
        // 校验生效; 任一未生效即回滚
        NSString* chkWeb = CurrentProxy(svc, @"web");
        NSString* chkSec = CurrentProxy(svc, @"secureweb");
        NSString* chkSocks = CurrentProxy(svc, @"socks");
        BOOL ok = TRUE;
        if (webP.length > 0 && ![chkWeb isEqualToString:[NSString stringWithFormat:@"%@:%@", webP, webN]]) ok = FALSE;
        if (secP.length > 0 && ![chkSec isEqualToString:[NSString stringWithFormat:@"%@:%@", secP, secN]]) ok = FALSE;
        if (socksP.length > 0 && ![chkSocks isEqualToString:[NSString stringWithFormat:@"%@:%@", socksP, socksN]]) ok = FALSE;
        if (!ok) {
            cheng_sysproxy_restore();
            return 2;
        }
        atexit(cheng_sysproxy_restore_void);
        return 0;
    }
}

static void cheng_sysproxy_restore_void(void) { cheng_sysproxy_restore(); }

void cheng_sysproxy_restore_on_signal(int sig) {
    cheng_sysproxy_restore();
    // 恢复完成后按默认语义终止: 不吞终止信号(吞掉会让门禁 kill 失效)。
    signal(sig, SIG_DFL);
    raise(sig);
}

int32_t cheng_sysproxy_restore(void) {
    @autoreleasepool {
        NSFileManager* fm = [NSFileManager defaultManager];
        NSString* rp = RestorePath();
        if (![fm fileExistsAtPath:rp]) return 0;
        NSString* save = [NSString stringWithContentsOfFile:rp encoding:NSUTF8StringEncoding error:nil];
        if (save.length == 0) { [fm removeItemAtPath:rp error:nil]; return 0; }
        NSArray* f = [save componentsSeparatedByString:@"\n"];
        if (f.count < 7) return 1;
        NSString* svc = f[0];
        SetOrOff(@"-setwebproxy", @"-setwebproxystate", svc, f[1]);
        SetOrOff(@"-setsecurewebproxy", @"-setsecurewebproxystate", svc, f[3]);
        SetOrOff(@"-setsocksfirewallproxy", @"-setsocksfirewallproxystate", svc, f[5]);
        [fm removeItemAtPath:rp error:nil];
        return 0;
    }
}
