#import <Cocoa/Cocoa.h>
#import <mach/mach.h>
#import <malloc/malloc.h>
#import <WebKit/WebKit.h>
#import <CoreText/CoreText.h>
#include <string.h>
#include <signal.h>
#include <stdint.h>
#include <stdlib.h>
#include "drawlist_bridge.h"
#import "metal_renderer.h"
#include "libp2p_browser_fp_js.h"
#include "libp2p_browser_sysproxy.h"

extern int32_t cheng_libp2p_browser_init(const void* selfPeerRaw, int64_t selfPeerLen, int32_t viewportW, int32_t viewportH);
extern int32_t cheng_libp2p_browser_begin_load(const void* urlRaw, int64_t urlLen);
extern int32_t cheng_libp2p_browser_on_load_complete(const void* htmlRaw, int64_t htmlLen);
extern int32_t cheng_libp2p_browser_on_page_loaded(const void* urlRaw, int64_t urlLen, const void* htmlRaw, int64_t htmlLen);
extern int32_t cheng_libp2p_browser_on_url_loaded(const void* urlRaw, int64_t urlLen);
extern int32_t cheng_libp2p_browser_on_page_snapshot(const void* urlRaw, int64_t urlLen, const void* snapRaw, int64_t snapLen);
extern int32_t cheng_libp2p_browser_refresh_snapshot(const void* urlRaw, int64_t urlLen, const void* snapRaw, int64_t snapLen);
extern int32_t cheng_libp2p_browser_capture_script_len(void);
extern int32_t cheng_libp2p_browser_capture_script_byte(int32_t index);
extern int32_t cheng_libp2p_browser_url_len(void);
extern int32_t cheng_libp2p_browser_url_byte(int32_t index);
extern int32_t cheng_libp2p_browser_right_open(void);
extern int32_t cheng_libp2p_browser_click(int32_t x, int32_t y);
extern int32_t cheng_libp2p_browser_apply_ready(void);
extern int32_t cheng_libp2p_browser_apply_field_len(void);
extern int32_t cheng_libp2p_browser_apply_field_byte(int32_t index);
extern int32_t cheng_libp2p_browser_apply_value_len(void);
extern int32_t cheng_libp2p_browser_apply_value_byte(int32_t index);
extern int32_t cheng_libp2p_browser_apply_ctl_id(void);
extern int32_t cheng_libp2p_browser_apply_action_len(void);
extern int32_t cheng_libp2p_browser_apply_action_byte(int32_t index);
extern int32_t cheng_libp2p_browser_last_error_len(void);
extern int32_t cheng_libp2p_browser_last_error_byte(int32_t index);
extern int32_t cheng_libp2p_browser_cuse_action(int32_t ctlId, const void* actionRaw, int64_t actionLen, const void* payloadRaw, int64_t payloadLen, const void* effectRaw, int64_t effectLen, int32_t confirmed);
extern int32_t cheng_libp2p_browser_cuse_command(const void* textRaw, int64_t textLen, const void* effectRaw, int64_t effectLen, int32_t confirmed);
extern int32_t cheng_libp2p_browser_plan_begin(const void* goalRaw, int64_t goalLen);
extern int32_t cheng_libp2p_browser_plan_prompt_len(void);
extern int32_t cheng_libp2p_browser_plan_prompt_byte(int32_t index);
extern int32_t cheng_libp2p_browser_plan_submit(const void* replyRaw, int64_t replyLen);
extern int32_t cheng_libp2p_browser_plan_step_count(void);
extern int32_t cheng_libp2p_browser_plan_step_len_at(int32_t index);
extern int32_t cheng_libp2p_browser_plan_step_byte_at(int32_t index, int32_t byteIndex);
extern int32_t cheng_libp2p_browser_plan_allow(const void* allowRaw, int64_t allowLen);
extern int32_t cheng_libp2p_browser_read_result_len(void);
extern int32_t cheng_libp2p_browser_read_result_byte(int32_t index);
extern int32_t cheng_libp2p_browser_key(int32_t code);
extern int32_t cheng_libp2p_browser_attach_peer(const void* peerRaw, int64_t peerLen);
extern int32_t cheng_libp2p_browser_select_peer(const void* peerRaw, int64_t peerLen);
extern int32_t cheng_libp2p_browser_paint_count(void);
extern int32_t cheng_libp2p_browser_paint_kind_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_x_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_y_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_w_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_h_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_color_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_font_size_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_text_align_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_radius_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_border_width_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_font_weight_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_font_family_len_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_font_family_byte_at(int32_t index, int32_t byteIndex);
extern int32_t cheng_libp2p_browser_paint_clip_x_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_clip_y_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_clip_w_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_clip_h_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_shadow_x_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_shadow_y_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_shadow_blur_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_text_len_at(int32_t index);
extern int32_t cheng_libp2p_browser_paint_text_byte_at(int32_t index, int32_t byteIndex);
extern int32_t cheng_libp2p_browser_parse_ms(void);
extern int32_t cheng_libp2p_browser_layout_ms(void);
extern int32_t cheng_libp2p_browser_paint_ms(void);
extern int32_t cheng_libp2p_browser_node_count(void);
extern int32_t cheng_libp2p_browser_widget_count(void);
extern int32_t cheng_libp2p_browser_widget_kind_at(int32_t index);
extern int32_t cheng_libp2p_browser_widget_x_at(int32_t index);
extern int32_t cheng_libp2p_browser_widget_y_at(int32_t index);
extern int32_t cheng_libp2p_browser_widget_w_at(int32_t index);
extern int32_t cheng_libp2p_browser_widget_h_at(int32_t index);
extern int32_t cheng_libp2p_browser_widget_ctl_id_at(int32_t index);
extern int32_t cheng_libp2p_browser_widget_ctl_flags_at(int32_t index);
extern int32_t cheng_libp2p_browser_widget_ctl_role_len_at(int32_t index);
extern int32_t cheng_libp2p_browser_widget_ctl_role_byte_at(int32_t index, int32_t byteIndex);
extern int32_t cheng_libp2p_browser_widget_ctl_name_len_at(int32_t index);
extern int32_t cheng_libp2p_browser_widget_ctl_name_byte_at(int32_t index, int32_t byteIndex);
extern int32_t cheng_libp2p_browser_widget_value_len_at(int32_t index);
extern int32_t cheng_libp2p_browser_widget_value_byte_at(int32_t index, int32_t byteIndex);
extern int32_t cheng_libp2p_browser_widget_input_type_len_at(int32_t index);
extern int32_t cheng_libp2p_browser_widget_input_type_byte_at(int32_t index, int32_t byteIndex);

// 控件表诊断 dump(env 门控, 桌面门禁断言用): 逐 ctlId>0 的 widget 打一行
// [ctl] idx= id= kind= flags= box= type= role= name= value=。
static void ChengBrowserDumpControlsIfRequested(void) {
    NSString* env = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_CTL_DUMP"];
    if (env.length == 0) return;
    int32_t n = cheng_libp2p_browser_widget_count();
    for (int32_t i = 0; i < n; i++) {
        int32_t ctlId = cheng_libp2p_browser_widget_ctl_id_at(i);
        if (ctlId <= 0) continue;
        int32_t kind = cheng_libp2p_browser_widget_kind_at(i);
        int32_t flags = cheng_libp2p_browser_widget_ctl_flags_at(i);
        int32_t x = cheng_libp2p_browser_widget_x_at(i);
        int32_t y = cheng_libp2p_browser_widget_y_at(i);
        int32_t w = cheng_libp2p_browser_widget_w_at(i);
        int32_t h = cheng_libp2p_browser_widget_h_at(i);
        NSMutableString* line = [NSMutableString string];
        [line appendFormat:@"[ctl] idx=%d id=%d kind=%d flags=%d box=%d,%d,%d,%d type=", i, ctlId, kind, flags, x, y, w, h];
        // UTF-8 提取辅助(静态上下文, 无 self): data 缓冲 + stringWithUTF8String
        #define CHENG_ABI_APPEND(field, lenFn, byteFn) do { \
            int32_t _fl = lenFn(field); \
            NSMutableData* _fd = [NSMutableData dataWithLength:(NSUInteger)_fl + 1]; \
            char* _fb = (char*)_fd.mutableBytes; \
            for (int32_t _b = 0; _b < _fl; _b++) _fb[_b] = (char)byteFn(field, _b); \
            _fb[_fl] = 0; \
            [line appendString:[NSString stringWithUTF8String:_fb] ?: @""]; \
        } while(0)
        CHENG_ABI_APPEND(i, cheng_libp2p_browser_widget_input_type_len_at, cheng_libp2p_browser_widget_input_type_byte_at);
        [line appendString:@" role="];
        CHENG_ABI_APPEND(i, cheng_libp2p_browser_widget_ctl_role_len_at, cheng_libp2p_browser_widget_ctl_role_byte_at);
        [line appendString:@" name="];
        CHENG_ABI_APPEND(i, cheng_libp2p_browser_widget_ctl_name_len_at, cheng_libp2p_browser_widget_ctl_name_byte_at);
        [line appendString:@" value="];
        CHENG_ABI_APPEND(i, cheng_libp2p_browser_widget_value_len_at, cheng_libp2p_browser_widget_value_byte_at);
        #undef CHENG_ABI_APPEND
        fprintf(stderr, "%s\n", line.UTF8String);
    }
}

static NSData* gChengHttpBody = nil;
static int32_t gChengHttpStatus = 0;
// 自重启: cheng ABI 长跑滞留(托管分配零归还, 编译器内核级)触发高水位时,
// execv 自身恢复而非退出——START_URL/脚本 env 全在, 重启后页面自动重载,
// 指令脚本从头重放(脚本需幂等)。
static char* gExecPath = NULL;
static char** gSavedArgv = NULL;

int32_t cheng_browser_http_get(const void* urlRaw, int64_t urlLen) {
    gChengHttpBody = nil;
    gChengHttpStatus = 0;
    if (!urlRaw || urlLen <= 0) return -1;
    NSString* urlStr = [[NSString alloc] initWithBytes:urlRaw length:(NSUInteger)urlLen encoding:NSUTF8StringEncoding];
    if (urlStr.length == 0) return -1;
    NSURL* url = [NSURL URLWithString:urlStr];
    if (!url) return -1;
    dispatch_semaphore_t sem = dispatch_semaphore_create(0);
    __block NSData* data = nil;
    __block NSInteger status = 0;
    NSURLSessionConfiguration* cfg = [NSURLSessionConfiguration ephemeralSessionConfiguration];
    NSOperationQueue* q = [[NSOperationQueue alloc] init];
    NSURLSession* session = [NSURLSession sessionWithConfiguration:cfg delegate:nil delegateQueue:q];
    NSURLSessionDataTask* task = [session dataTaskWithURL:url completionHandler:^(NSData* d, NSURLResponse* resp, NSError* err) {
        (void)err;
        data = d;
        if ([resp isKindOfClass:[NSHTTPURLResponse class]]) {
            status = [(NSHTTPURLResponse*)resp statusCode];
        } else if (d) {
            status = 200;
        }
        dispatch_semaphore_signal(sem);
    }];
    [task resume];
    dispatch_semaphore_wait(sem, DISPATCH_TIME_FOREVER);
    [session finishTasksAndInvalidate];
    gChengHttpBody = data;
    gChengHttpStatus = (int32_t)status;
    if (status >= 200 && status < 300 && data) return 0;
    return -1;
}

int32_t cheng_browser_http_status(void) {
    return gChengHttpStatus;
}

int32_t cheng_browser_http_body_len(void) {
    if (!gChengHttpBody) return 0;
    NSUInteger n = gChengHttpBody.length;
    if (n > 2147483647u) return 2147483647;
    return (int32_t)n;
}

int32_t cheng_browser_http_body_byte(int32_t index) {
    if (!gChengHttpBody || index < 0) return 0;
    if ((NSUInteger)index >= gChengHttpBody.length) return 0;
    const unsigned char* p = (const unsigned char*)gChengHttpBody.bytes;
    return (int32_t)p[index];
}

const void* cheng_browser_http_body_ptr(void) {
    if (!gChengHttpBody) return NULL;
    return gChengHttpBody.bytes;
}

@interface ChengBrowserDrawCanvas : NSView
@property (nonatomic, assign) ChengDrawList* drawList;
@property (nonatomic, weak) id clickTarget;
// 渲染模式: NO=CG 全量(render_cg), YES=Metal 图形层 + 本 view 仅画 IMAGE
// (文本由 textOverlay view 负责)
@property (nonatomic, assign) BOOL metalMode;
@property (nonatomic, weak) ChengMetalRenderer* metalRenderer;
@end

@implementation ChengBrowserDrawCanvas
- (void)drawRect:(NSRect)dirtyRect {
    [[NSColor colorWithCalibratedWhite:0.0 alpha:0.0] setFill];
    NSRectFill(self.bounds);
    if (!self.drawList || self.drawList->count <= 0) return;
    if (self.metalMode) {
        // Metal 模式: GPU 离屏管线画出全部图形 cmd(矩形/圆角/边框/阴影),
        // 贴为底图; 本 view 再叠加 IMAGE cmd(CG); 文本由 textOverlay 层负责
        CGContextRef ctx = [[NSGraphicsContext currentContext] CGContext];
        CGContextSetBlendMode(ctx, kCGBlendModeNormal);
        if (self.metalRenderer) {
            CGImageRef gpuFrame = [self.metalRenderer renderOffscreenCGImage];
            if (gpuFrame) {
                CGContextDrawImage(ctx, CGRectMake(0, 0, self.bounds.size.width, self.bounds.size.height), gpuFrame);
                CGImageRelease(gpuFrame);
            }
        }
        int32_t n = self.drawList->count;
        for (int32_t i = 0; i < n; i++) {
            const ChengDrawCmd* c = &self.drawList->cmds[i];
            if (c->kind != CHENG_DRAW_CMD_IMAGE) continue;
            ChengDrawCmd one = *c;
            ChengDrawList tmp;
            tmp.cmds = &one;
            tmp.count = 1;
            tmp.capacity = 1;
            CGContextSaveGState(ctx);
            extern void cheng_drawlist_render_one_cg(const ChengDrawList* list, int32_t index, void* ctx, int32_t viewW, int32_t viewH);
            cheng_drawlist_render_one_cg(&tmp, 0, ctx, (int32_t)self.bounds.size.width, (int32_t)self.bounds.size.height);
            CGContextRestoreGState(ctx);
        }
        return;
    }
    CGContextRef ctx = [[NSGraphicsContext currentContext] CGContext];
    cheng_drawlist_render_cg(self.drawList, ctx, (int32_t)self.bounds.size.width, (int32_t)self.bounds.size.height);
}
- (BOOL)acceptsFirstResponder { return YES; }
- (void)mouseDown:(NSEvent*)event {
    [self.window makeFirstResponder:self];
    if ([self.clickTarget respondsToSelector:@selector(handleRightClick:)]) {
        [self.clickTarget performSelector:@selector(handleRightClick:) withObject:event];
    }
}
- (void)keyDown:(NSEvent*)event {
    if ([self.clickTarget respondsToSelector:@selector(handleRightKey:)]) {
        [self.clickTarget performSelector:@selector(handleRightKey:) withObject:event];
    }
}
- (BOOL)isFlipped { return NO; }
@end

// 文本叠加层: Metal 模式下仅绘制 TEXT cmd(glyph CPU 光栅化+GPU 合成)

@class ChengLibp2pBrowserHost;

@interface ChengCapturePipe : NSObject<WKScriptMessageHandler>
@property (nonatomic, weak) ChengLibp2pBrowserHost* host;
@end


@interface ChengTextOverlayView : NSView
@property (nonatomic, assign) ChengDrawList* drawList;
@end

@implementation ChengTextOverlayView
- (BOOL)isFlipped { return NO; }
- (void)drawRect:(NSRect)dirtyRect {
    [[NSColor colorWithCalibratedWhite:0.0 alpha:0.0] setFill];
    NSRectFill(self.bounds);
    if (!self.drawList || self.drawList->count <= 0) return;
    CGContextRef ctx = [[NSGraphicsContext currentContext] CGContext];
    for (int32_t i = 0; i < self.drawList->count; i++) {
        if (self.drawList->cmds[i].kind != CHENG_DRAW_CMD_TEXT) continue;
        cheng_drawlist_render_one_cg(self.drawList, i, ctx, (int32_t)self.bounds.size.width, (int32_t)self.bounds.size.height);
    }
}
@end

@interface ChengLibp2pBrowserHost : NSObject<WKNavigationDelegate, WKUIDelegate>
@property (nonatomic, strong) NSWindow* window;
@property (nonatomic, strong) NSTextField* urlField;
@property (nonatomic, strong) NSTextField* peerField;
@property (nonatomic, strong) NSButton* goButton;
@property (nonatomic, strong) NSTextField* statsLabel;
@property (nonatomic, strong) WKWebView* webView;
@property (nonatomic, strong) ChengBrowserDrawCanvas* rightCanvas;
@property (nonatomic, assign) ChengDrawList* drawList;
@property (nonatomic, strong) NSMutableArray<NSData*>* textKeep;
@property (nonatomic, strong) ChengCapturePipe* capturePipe;
@property (nonatomic, assign) BOOL captureBusy;
@property (nonatomic, assign) BOOL captureQueued;
@property (nonatomic, assign) BOOL captureQueuedRefresh;
@property (nonatomic, assign) int32_t captureGen;
@property (nonatomic, strong) NSProgressIndicator* progress;
@property (nonatomic, assign) int32_t frameSeq;
@property (nonatomic, copy) NSString* lastSnapHash;
@property (nonatomic, assign) long lastSnapBytes;
@property (nonatomic, assign) int32_t refreshCount;
@property (nonatomic, strong) NSMutableSet<NSString*>* registeredFontPaths;
@property (nonatomic, strong) NSDictionary* fpProfile;
@property (nonatomic, assign) int32_t viewportW;
@property (nonatomic, assign) int32_t viewportH;
@property (nonatomic, strong) NSTimer* eventTimer;
@property (nonatomic, strong) NSTimer* rssTimer;
@property (nonatomic, assign) NSTimeInterval lastCaptureStart;
- (void)startRssGuard;
- (BOOL)captureThrottled;
@property (nonatomic, assign) int32_t eventLine;
@property (nonatomic, strong) NSArray<NSString*>* eventLines;
@property (nonatomic, assign) int32_t cuseLine;
@property (nonatomic, strong) NSArray<NSString*>* cuseLines;
@property (nonatomic, assign) int32_t cmdLine;
@property (nonatomic, strong) NSArray<NSString*>* cmdLines;
@property (nonatomic, assign) BOOL cmdDonePrinted;
@property (nonatomic, strong) NSArray<NSString*>* planLines;
@property (nonatomic, assign) int32_t planLine;
@property (nonatomic, copy) NSString* pendingPlanEffect;
@property (nonatomic, assign) int32_t pendingPlanConfirmed;
@property (nonatomic, assign) BOOL planInProgress;
@property (nonatomic, strong) NSTextField* readOverlay;
@property (nonatomic, strong) NSTimer* readOverlayTimer;
@property (nonatomic, strong) NSTextField* cmdInput;
@property (nonatomic, strong) NSButton* cmdGo;
@property (nonatomic, strong) ChengMetalRenderer* metalRenderer;
@property (nonatomic, strong) ChengTextOverlayView* textOverlay;
@property (nonatomic, assign) BOOL metalMode;
@property (nonatomic, assign) BOOL cuseDonePrinted;
- (void)captureRightRefresh:(BOOL)refresh;
- (void)dumpFrameIfRequested;
- (void)startEventScript;
- (void)runCuseLine:(NSString*)line;
- (void)runCmdLine:(NSString*)line;
- (void)runPlanLine:(NSString*)line;
- (void)runNaturalLanguage:(NSString*)text;
- (void)showReadOverlay:(NSString*)text;
- (void)runUserCommand:(NSString*)text;
- (void)applyChengSelectValue;
@end

@implementation ChengLibp2pBrowserHost
- (void)showProgress:(BOOL)on {    if (self.progress) {        self.progress.hidden = !on;        if (on) [self.progress startAnimation:nil];        else [self.progress stopAnimation:nil];    }}- (void)showErrorPage:(NSString*)msg {    if (!msg) msg = @"未知错误";    NSString* html = [NSString stringWithFormat:        @"<html><head><style>body{font-family:-apple-system,Helvetica,sans-serif;"        @"display:flex;align-items:center;justify-content:center;height:100vh;"        @"margin:0;background:#0d1117;color:#c9d1d9;}"        @".card{max-width:460px;padding:32px;background:#161b22;border-radius:12px;"        @"border:1px solid #30363d;text-align:center;}"        @"h2{color:#f85149;margin:0 0 12px;font-size:18px;}"        @"p{color:#8b949e;font-size:14px;line-height:1.5;margin:0;}"        @"</style></head><body><div class='card'>"        @"<h2>无法加载页面</h2><p>%@</p>"        @"<p style='margin-top:8px;color:#484f58;font-size:12px;'>"        @"请检查网络连接或稍后重试</p></div></body></html>", msg];    [self.webView loadHTMLString:html baseURL:nil];}- (void)reloadPage {    [self.webView reload];}
- (void)callBeginLoad:(NSString*)url {
    const char* u = url.UTF8String;
    cheng_libp2p_browser_begin_load(u, (int64_t)strlen(u));
}

- (void)applySplitLayout:(BOOL)split {
    NSView* content = self.window.contentView;
    NSRect b = content.bounds;
    CGFloat chrome = 48;
    CGFloat stats = 28;
    CGFloat y = 0;
    CGFloat h = b.size.height - chrome;
    self.statsLabel.hidden = !split;
    self.rightCanvas.hidden = !split;
    if (split && self.readOverlay) {
        NSRect rcFrame = self.rightCanvas.frame;
        self.readOverlay.frame = NSMakeRect(8, rcFrame.size.height - 118, rcFrame.size.width - 16, 110);
    }
    if (split && self.cmdInput) {
        NSRect rcFrame = self.rightCanvas.frame;
        CGFloat bottomY = 8;
        self.cmdInput.frame = NSMakeRect(8, bottomY, rcFrame.size.width - 116, 26);
        self.cmdGo.frame = NSMakeRect(rcFrame.size.width - 100, bottomY, 92, 26);
    }
    if (self.metalRenderer) {
        [self.metalRenderer setViewportW:(int32_t)self.rightCanvas.bounds.size.width h:(int32_t)self.rightCanvas.bounds.size.height];
        [self.metalRenderer renderNow];
        [self.textOverlay setNeedsDisplay:YES];
    }
    if (split) {
        CGFloat half = floor(b.size.width / 2.0);
        self.webView.frame = NSMakeRect(0, y, half, h - stats);
        self.rightCanvas.frame = NSMakeRect(half, y, b.size.width - half, h - stats);
        self.statsLabel.frame = NSMakeRect(half, h - stats, b.size.width - half, stats);
        [self.webView layoutSubtreeIfNeeded];
    } else {
        self.webView.frame = NSMakeRect(0, y, b.size.width, h);
        self.rightCanvas.frame = NSMakeRect(b.size.width, y, 0, h);
    }
}

- (void)layoutPanes {
    BOOL rightOpen = cheng_libp2p_browser_right_open() != 0;
    [self applySplitLayout:rightOpen];
    if (rightOpen) {
        self.statsLabel.stringValue = [NSString stringWithFormat:@"Cheng 1:1  parse=%dms layout=%dms paint=%dms nodes=%d ops=%d",
            cheng_libp2p_browser_parse_ms(),
            cheng_libp2p_browser_layout_ms(),
            cheng_libp2p_browser_paint_ms(),
            cheng_libp2p_browser_node_count(),
            cheng_libp2p_browser_paint_count()];
    }
}

- (void)stampClipShadowAt:(int32_t)i {
    int32_t cw = cheng_libp2p_browser_paint_clip_w_at(i);
    int32_t ch = cheng_libp2p_browser_paint_clip_h_at(i);
    if (cw > 0 && ch > 0) {
        cheng_drawlist_set_last_clip(self.drawList,
            cheng_libp2p_browser_paint_clip_x_at(i),
            cheng_libp2p_browser_paint_clip_y_at(i),
            cw, ch);
    }
    int32_t blur = cheng_libp2p_browser_paint_shadow_blur_at(i);
    int32_t sx = cheng_libp2p_browser_paint_shadow_x_at(i);
    int32_t sy = cheng_libp2p_browser_paint_shadow_y_at(i);
    if (blur > 0 || sx != 0 || sy != 0) {
        int32_t color = cheng_libp2p_browser_paint_color_at(i);
        int32_t sa = (color >> 24) & 255;
        int32_t sr = (color >> 16) & 255;
        int32_t sg = (color >> 8) & 255;
        int32_t sb = color & 255;
        if (sa <= 0) sa = 64;
        cheng_drawlist_set_last_shadow(self.drawList, sx, sy, blur, sr, sg, sb, sa);
    }
}

// 内存防护: phys_footprint 超限立即退出(进程整体回收, 系统秒恢复),
// 上限 env CHENG_LIBP2P_BROWSER_MAX_RSS_MB(默认 4096)。
- (void)recycleChengSession {
    fprintf(stderr, "[recycle] rebuilding cheng session after %d refreshes\n", self.refreshCount);
    const char* selfPeer = "desktop-peer";
    cheng_libp2p_browser_init(selfPeer, (int64_t)strlen(selfPeer), self.viewportW, self.viewportH);
    self.refreshCount = 0;
}

- (void)startRssGuard {
    int64_t capMb = 6144;
    NSString* env = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_MAX_RSS_MB"];
    if (env.length > 0 && env.intValue > 256) capMb = env.intValue;
    NSThread* t = [[NSThread alloc] initWithBlock:^{
        for(;;){
            task_vm_info_data_t info;
            mach_msg_type_number_t cnt = TASK_VM_INFO_COUNT;
            if (task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &cnt) == KERN_SUCCESS) {
                int64_t mb = (int64_t)(info.phys_footprint / (1024 * 1024));
                if (mb > capMb) {
                    fprintf(stderr, "[rss-guard] phys_footprint %lldMB > cap %lldMB: execv self-restart (reload start url; scripts replay)\n", mb, capMb);
                    if (gExecPath && gSavedArgv) {
                        execv(gExecPath, gSavedArgv);
                    }
                    fprintf(stderr, "[rss-guard] execv failed, exiting\n");
                    exit(9);
                }
            }
            [NSThread sleepForTimeInterval:1.0];
        }
    }];
    t.name = @"cheng-rss-guard";
    [t start];
}

- (BOOL)captureThrottled {
    // 动态最小间隔: CLB 越大=页面越重=单轮编译滞留越多(ABI 零归还下滞留
    // 速率与频率成正比), 按最近一次 CLB 字节数自适应(4KB->300ms, 4MB->2000ms)
    CGFloat minMs = 300;
    NSString* env = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_MIN_CAPTURE_MS"];
    if (env.length > 0 && env.doubleValue > 0) {
        minMs = env.doubleValue;
    } else if (self.lastSnapBytes > 0) {
        minMs = 300.0 + (CGFloat)self.lastSnapBytes / 2048.0;
        if (minMs > 2000) minMs = 2000;
    }
    NSTimeInterval now = [NSProcessInfo processInfo].systemUptime;
    if (now - self.lastCaptureStart < minMs / 1000.0) return YES;
    return NO;
}

- (NSData*)decodePaintImage:(const char*)buf length:(int32_t)len {
    if (!buf || len <= 0) return nil;
    NSString* s = [[NSString alloc] initWithBytes:buf length:(NSUInteger)len encoding:NSUTF8StringEncoding];
    if (!s) return nil;
    if ([s hasPrefix:@"data:"]) {
        NSRange comma = [s rangeOfString:@","];
        if (comma.location == NSNotFound) return nil;
        NSString* meta = [s substringToIndex:comma.location];
        NSString* payload = [s substringFromIndex:comma.location + 1];
        if ([meta rangeOfString:@"base64"].location != NSNotFound) {
            return [[NSData alloc] initWithBase64EncodedString:payload options:NSDataBase64DecodingIgnoreUnknownCharacters];
        }
        NSString* decoded = [payload stringByRemovingPercentEncoding];
        if (!decoded) decoded = payload;
        return [decoded dataUsingEncoding:NSUTF8StringEncoding];
    }
    return [NSData dataWithBytes:buf length:(NSUInteger)len];
}

- (void)rebuildRightDrawList {
    if (!self.textKeep) self.textKeep = [NSMutableArray array];
    [self.textKeep removeAllObjects];
    int32_t n = cheng_libp2p_browser_paint_count();
    int32_t cap = n + 256;
    if (cap < 2048) cap = 2048;
    if (self.drawList) {
        cheng_drawlist_free(self.drawList);
        self.drawList = NULL;
    }
    self.drawList = cheng_drawlist_new(cap);
    self.rightCanvas.drawList = self.drawList;
    if (self.textOverlay) self.textOverlay.drawList = self.drawList;
    for (int32_t i = 0; i < n; i++) {
        int32_t kind = cheng_libp2p_browser_paint_kind_at(i);
        int32_t x = cheng_libp2p_browser_paint_x_at(i);
        int32_t y = cheng_libp2p_browser_paint_y_at(i);
        int32_t w = cheng_libp2p_browser_paint_w_at(i);
        int32_t h = cheng_libp2p_browser_paint_h_at(i);
        int32_t color = cheng_libp2p_browser_paint_color_at(i);
        int32_t a = (color >> 24) & 255;
        int32_t r = (color >> 16) & 255;
        int32_t g = (color >> 8) & 255;
        int32_t b = color & 255;
        int32_t radius = cheng_libp2p_browser_paint_radius_at(i);
        if (kind == 1 || kind == 8) {
            if (w <= 0 || h <= 0) continue;
            if (kind == 1 && a <= 0) continue;
            int32_t fa = a > 0 ? a : 255;
            if (radius > 0) {
                cheng_drawlist_push_round_rect(self.drawList, x, y, w, h, r, g, b, fa, radius);
            } else {
                cheng_drawlist_push_rect(self.drawList, x, y, w, h, r, g, b, fa);
            }
            [self stampClipShadowAt:i];
        } else if (kind == 2) {
            if (w <= 0 || h <= 0) continue;
            int32_t ba = a > 0 ? a : 255;
            int32_t bw = cheng_libp2p_browser_paint_border_width_at(i);
            if (bw <= 0) bw = 1;
            cheng_drawlist_push_border(self.drawList, x, y, w, h, r, g, b, ba, bw, radius);
            [self stampClipShadowAt:i];
        } else if (kind == 3) {
            int32_t tlen = cheng_libp2p_browser_paint_text_len_at(i);
            if (tlen <= 0) continue;
            NSMutableData* data = [NSMutableData dataWithLength:(NSUInteger)tlen + 1];
            char* buf = (char*)data.mutableBytes;
            for (int32_t k = 0; k < tlen; k++) buf[k] = (char)cheng_libp2p_browser_paint_text_byte_at(i, k);
            buf[tlen] = 0;
            [self.textKeep addObject:data];
            int32_t flen = cheng_libp2p_browser_paint_font_family_len_at(i);
            const char* fam = NULL;
            int32_t famLen = 0;
            if (flen > 0) {
                NSMutableData* famData = [NSMutableData dataWithLength:(NSUInteger)flen + 1];
                char* fbuf = (char*)famData.mutableBytes;
                for (int32_t k = 0; k < flen; k++) fbuf[k] = (char)cheng_libp2p_browser_paint_font_family_byte_at(i, k);
                fbuf[flen] = 0;
                [self.textKeep addObject:famData];
                fam = fbuf;
                famLen = flen;
            }
            int32_t fontSize = cheng_libp2p_browser_paint_font_size_at(i);
            if (fontSize <= 0) fontSize = 14;
            int32_t weight = cheng_libp2p_browser_paint_font_weight_at(i);
            int32_t tal = cheng_libp2p_browser_paint_text_align_at(i);
            int32_t ta = a > 0 ? a : 255;
            cheng_drawlist_push_text_ex2(self.drawList, buf, tlen, x, y, w, h, fontSize, weight, fam, famLen, r, g, b, ta, tal);
            [self stampClipShadowAt:i];
        } else if (kind == 5) {
            if (w <= 0 || h <= 0) continue;
            int32_t tlen = cheng_libp2p_browser_paint_text_len_at(i);
            if (tlen <= 0) continue;
            NSMutableData* raw = [NSMutableData dataWithLength:(NSUInteger)tlen + 1];
            char* buf = (char*)raw.mutableBytes;
            for (int32_t k = 0; k < tlen; k++) buf[k] = (char)cheng_libp2p_browser_paint_text_byte_at(i, k);
            buf[tlen] = 0;
            NSData* decoded = [self decodePaintImage:buf length:tlen];
            if (!decoded) {
                fprintf(stderr, "[gate] decode FAIL op#%d tlen=%d prefix=%.28s\n", i, tlen, buf);
                continue;
            }
            [self.textKeep addObject:decoded];
            cheng_drawlist_push_image(self.drawList, x, y, w, h, a > 0 ? a : 255, decoded.bytes, (int32_t)decoded.length);
            [self stampClipShadowAt:i];
        }
    }
    [self.rightCanvas setNeedsDisplay:YES];
    int32_t imgInList = 0;
    for (int32_t q = 0; q < self.drawList->count; q++)
        if (self.drawList->cmds[q].kind == CHENG_DRAW_CMD_IMAGE) imgInList += 1;
    fprintf(stderr, "[gate] frame seq=%d drawlistCount=%d imagesInList=%d\n",
        self.frameSeq, self.drawList->count, imgInList);
    for (int32_t q = 0; q < self.drawList->count; q++) {
        if (self.drawList->cmds[q].kind == CHENG_DRAW_CMD_IMAGE) {
            fprintf(stderr, "[gate]   dlImg#%d rect=(%d,%d,%d,%d) bytes=%d\n", q,
                self.drawList->cmds[q].x, self.drawList->cmds[q].y,
                self.drawList->cmds[q].w, self.drawList->cmds[q].h,
                self.drawList->cmds[q].textLen);
        }
    }
    [self.rightCanvas setNeedsDisplay:YES];
    // 布局树重建碎片页归还系统(每次重建 ~0.3MB 碎片累积成线性增长)
    malloc_zone_pressure_relief(malloc_default_zone(), 0);
    [self dumpFrameIfRequested];    if (self.metalMode && self.metalRenderer) {
        [self.metalRenderer setDrawList:self.drawList];
        [self.metalRenderer setViewportW:(int32_t)self.rightCanvas.bounds.size.width h:(int32_t)self.rightCanvas.bounds.size.height];
        [self.metalRenderer renderNow];
    }
    [self.rightCanvas setNeedsDisplay:YES];

}

- (void)dumpLeftFrame:(int32_t)seq dir:(NSString*)dir {
    __weak ChengLibp2pBrowserHost* weakSelf = self;
    WKSnapshotConfiguration* cfg = [WKSnapshotConfiguration new];
    cfg.rect = self.webView.bounds;
    [self.webView takeSnapshotWithConfiguration:cfg completionHandler:^(NSImage* image, NSError* error) {
        if (!image || error) return;
        ChengLibp2pBrowserHost* strong = weakSelf;
        if (!strong) return;
        NSRect rect = image.size.width > 0 ? NSMakeRect(0, 0, image.size.width, image.size.height) : NSZeroRect;
        CGImageRef cg = [image CGImageForProposedRect:&rect context:nil hints:nil];
        if (!cg) return;
        NSBitmapImageRep* rep = [[NSBitmapImageRep alloc] initWithCGImage:cg];
        NSData* data = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
        if (data) {
            NSString* png = [NSString stringWithFormat:@"left-%04d.png", seq];
            [data writeToFile:[dir stringByAppendingPathComponent:png] atomically:YES];
        }
    }];
}

- (void)dumpFrameIfRequested {
    NSString* dir = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_FRAME_DUMP"];
    if (dir.length == 0) return;
    NSString* leftDir = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_LEFT_DUMP"];
    BOOL dumpLeft = leftDir.length > 0 && self.frameSeq < 40;
    if (dumpLeft) [self dumpLeftFrame:self.frameSeq + 1 dir:leftDir];
    fprintf(stderr, "[gate] dump: rightOpen=%d canvasW=%.0f seq=%d ops=%d imgOps=%d\n",
        cheng_libp2p_browser_right_open(), self.rightCanvas.bounds.size.width, self.frameSeq,
        cheng_libp2p_browser_paint_count(), ({
            int c = 0;
            for (int32_t q = 0; q < cheng_libp2p_browser_paint_count(); q++) {
                int kk = cheng_libp2p_browser_paint_kind_at(q);
                if (kk == 5) {
                    c += 1;
                    fprintf(stderr, "[gate]   imgOp#%d rect=(%d,%d,%d,%d)\n", q,
                        cheng_libp2p_browser_paint_x_at(q),
                        cheng_libp2p_browser_paint_y_at(q),
                        cheng_libp2p_browser_paint_w_at(q),
                        cheng_libp2p_browser_paint_h_at(q));
                } else if (q < cheng_libp2p_browser_paint_count()) {
                    fprintf(stderr, "[gate]   op#%d kind=%d rect=(%d,%d,%d,%d) color=%d\n", q, kk,
                        cheng_libp2p_browser_paint_x_at(q),
                        cheng_libp2p_browser_paint_y_at(q),
                        cheng_libp2p_browser_paint_w_at(q),
                        cheng_libp2p_browser_paint_h_at(q),
                        cheng_libp2p_browser_paint_color_at(q));
                }
            }
            c;
        }));
    NSView* v = self.rightCanvas;
    NSRect b = v.bounds;
    if (b.size.width <= 0 || b.size.height <= 0) return;
    NSBitmapImageRep* rep = [v bitmapImageRepForCachingDisplayInRect:b];
    if (!rep) return;
    [v cacheDisplayInRect:b toBitmapImageRep:rep];
    self.frameSeq += 1;
    NSString* png = [NSString stringWithFormat:@"right-%03d.png", self.frameSeq];
    NSData* data = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    if (data) [data writeToFile:[dir stringByAppendingPathComponent:png] atomically:YES];
    NSString* probes = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_PROBES"];
    if (probes.length == 0) return;
    NSMutableString* json = [NSMutableString stringWithString:@"["];
    NSArray* pts = [probes componentsSeparatedByString:@";"];
    for (NSUInteger i = 0; i < pts.count; i++) {
        NSArray* xy = [pts[i] componentsSeparatedByString:@","];
        if (xy.count < 2) continue;
        NSInteger x = [(NSString*)xy[0] integerValue];
        NSInteger y = [(NSString*)xy[1] integerValue];
        int r = 0, g = 0, bl = 0;
        // 原始字节直读(免 AppKit 颜色管理漂移); 探针为点坐标, 按位图缩放换算
        NSUInteger scale = 1;
        if (b.size.width > 0 && [rep pixelsWide] > (NSInteger)b.size.width) {
            scale = (NSUInteger)round((double)[rep pixelsWide] / b.size.width);
            if (scale == 0) scale = 1;
        }
        NSUInteger pxX = (NSUInteger)x * scale;
        NSUInteger pxY = (NSUInteger)y * scale;
        if (pxX < (NSUInteger)[rep pixelsWide] && pxY < (NSUInteger)[rep pixelsHigh]) {
            uint8_t* base = (uint8_t*)[rep bitmapData];
            NSUInteger bpp = [rep samplesPerPixel];
            NSUInteger row = [rep bytesPerRow];
            uint8_t* px = base + pxY * row + pxX * bpp;
            if (bpp >= 3) { r = px[0]; g = px[1]; bl = px[2]; }
        }
        if (i > 0) [json appendString:@","];
        [json appendFormat:@"{\"x\":%ld,\"y\":%ld,\"r\":%d,\"g\":%d,\"b\":%d}", (long)x, (long)y, r, g, bl];
    }
    [json appendString:@"]"];
    NSString* pj = [NSString stringWithFormat:@"probes-%03d.json", self.frameSeq];
    [json writeToFile:[dir stringByAppendingPathComponent:pj] atomically:YES encoding:NSUTF8StringEncoding error:nil];
}

- (void)startEventScript {
    // plan/cuse/cmd 队列装载独立于 events 是否为空(修: events 空/缺失时
    // 提前 return 会跳过语义驱动装载——巴林真站冒烟实证)
    NSString* file = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_EVENT_SCRIPT"];
    NSMutableArray<NSString*>* lines = [NSMutableArray array];
    if (file.length > 0) {
        NSString* text = [NSString stringWithContentsOfFile:file encoding:NSUTF8StringEncoding error:nil];
        for (NSString* line in [text componentsSeparatedByString:@"\n"]) {
            NSString* t = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            if (t.length == 0 || [t hasPrefix:@"#"]) continue;
            [lines addObject:t];
        }
    }
    self.eventLines = lines;
    self.eventLine = 0;
    // 语义动作行(CUSE_SCRIPT, ctlId|action|payload|effect|confirmed)排在
    // 事件行之前; CUSE 行需右栏已开(rightOpen), 未开则本轮跳过下轮重试。
    NSString* cuseFile = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_CUSE_SCRIPT"];
    if (cuseFile.length > 0) {
        NSString* cuseText = [NSString stringWithContentsOfFile:cuseFile encoding:NSUTF8StringEncoding error:nil];
        NSMutableArray<NSString*>* clines = [NSMutableArray array];
        for (NSString* line in [cuseText componentsSeparatedByString:@"\n"]) {
            NSString* t = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            if (t.length == 0 || [t hasPrefix:@"#"]) continue;
            [clines addObject:t];
        }
        self.cuseLines = clines;
        self.cuseLine = 0;
    }
    NSString* planFile = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_PLANNER_SCRIPT"];
    if (planFile.length > 0) {
        NSString* planText = [NSString stringWithContentsOfFile:planFile encoding:NSUTF8StringEncoding error:nil];
        NSMutableArray<NSString*>* plines = [NSMutableArray array];
        for (NSString* line in [planText componentsSeparatedByString:@"\n"]) {
            NSString* t = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            if (t.length == 0 || [t hasPrefix:@"#"]) continue;
            [plines addObject:t];
        }
        self.planLines = plines;
        self.planLine = 0;
    }
    NSString* cmdFile = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_CMD_SCRIPT"];
    if (cmdFile.length > 0) {
        NSString* cmdText = [NSString stringWithContentsOfFile:cmdFile encoding:NSUTF8StringEncoding error:nil];
        NSMutableArray<NSString*>* mlines = [NSMutableArray array];
        for (NSString* line in [cmdText componentsSeparatedByString:@"\n"]) {
            NSString* t = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            if (t.length == 0 || [t hasPrefix:@"#"]) continue;
            [mlines addObject:t];
        }
        self.cmdLines = mlines;
        self.cmdLine = 0;
    }
    if (lines.count == 0 && self.planLines.count == 0 && self.cuseLines.count == 0 && self.cmdLines.count == 0) return;
    CGFloat interval = 0.4;
    NSString* iv = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_EVENT_INTERVAL_MS"];
    if (iv.length > 0 && iv.doubleValue > 20) interval = iv.doubleValue / 1000.0;
    __weak ChengLibp2pBrowserHost* weakSelf = self;
    self.eventTimer = [NSTimer timerWithTimeInterval:interval repeats:YES block:^(NSTimer* t) {
        ChengLibp2pBrowserHost* strong = weakSelf;
        if (!strong) { [t invalidate]; return; }
        if (strong.planLines.count > 0) {
            if (strong.planLine < (int32_t)strong.planLines.count) {
                if (cheng_libp2p_browser_right_open() == 0) return;
                [strong runPlanLine:strong.planLines[strong.planLine]];
                strong.planLine += 1;
                return;
            }
        }
        if (strong.cuseLines.count > 0) {
            if (strong.cuseLine < (int32_t)strong.cuseLines.count) {
                if (cheng_libp2p_browser_right_open() == 0) return;
                [strong runCuseLine:strong.cuseLines[strong.cuseLine]];
                strong.cuseLine += 1;
                return;
            }
            if (!strong.cuseDonePrinted) {
                strong.cuseDonePrinted = YES;
                fprintf(stderr, "[cuse] done\n");
            }
        }
        if (strong.cmdLines.count > 0) {
            if (strong.cmdLine < (int32_t)strong.cmdLines.count) {
                if (cheng_libp2p_browser_right_open() == 0) return;
                [strong runCmdLine:strong.cmdLines[strong.cmdLine]];
                strong.cmdLine += 1;
                return;
            }
            if (!strong.cmdDonePrinted) {
                strong.cmdDonePrinted = YES;
                fprintf(stderr, "[cmd] done\n");
            }
        }
        if (strong.eventLine >= (int32_t)strong.eventLines.count) { [t invalidate]; return; }
        NSString* js = strong.eventLines[strong.eventLine];
        strong.eventLine += 1;
        [strong.webView evaluateJavaScript:js completionHandler:^(id r, NSError* e) { (void)r; (void)e; }];
    }];
    [[NSRunLoop mainRunLoop] addTimer:self.eventTimer forMode:NSRunLoopCommonModes];
}

// 语义动作行: ctlId|actionKind|payload|effectClass|confirmed。经 cheng 准入
// (确认门/disabled/类型矩阵)后由 apply 通道取注入指令; rc<0 上报不重试不降级。
// 注: 门禁行格式 '|' 分隔, payload 不得含 '|'(仅门禁驱动用, 非产品通道)。
- (void)runCuseLine:(NSString*)line {
    NSArray<NSString*>* p = [line componentsSeparatedByString:@"|"];
    if (p.count < 5) { fprintf(stderr, "[cuse] ERR rc=-99 bad-line\n"); return; }
    int32_t ctlId = (int32_t)[p[0] intValue];
    int32_t confirmed = [p[4] intValue] != 0 ? 1 : 0;
    const char* actionRaw = p[1].UTF8String;
    const char* payloadRaw = p[2].UTF8String;
    const char* effectRaw = p[3].UTF8String;
    int32_t rc = cheng_libp2p_browser_cuse_action(ctlId,
        actionRaw, (int64_t)strlen(actionRaw),
        payloadRaw, (int64_t)strlen(payloadRaw),
        effectRaw, (int64_t)strlen(effectRaw),
        confirmed);
    if (rc != 0) {
        int32_t elen = cheng_libp2p_browser_last_error_len();
        NSMutableData* ed = [NSMutableData dataWithLength:(NSUInteger)elen + 1];
        char* ebuf = (char*)ed.mutableBytes;
        for (int32_t b = 0; b < elen; b++) ebuf[b] = (char)cheng_libp2p_browser_last_error_byte(b);
        ebuf[elen] = 0;
        fprintf(stderr, "[cuse] ERR rc=%d id=%d err=%s\n", rc, ctlId, ebuf);
        return;
    }
    fprintf(stderr, "[cuse] ok rc=0 id=%d action=%s\n", ctlId, p[1].UTF8String);
    [self applyChengSelectValue];
    [self rebuildRightDrawList];
}

// 用户文字指令入口: 从输入框取文本，经 runCmdLine 同链路执行
- (IBAction)runUserCmdAction:(id)sender {
    NSString* text = self.cmdInput.stringValue ?: @"";
    if ([[text stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]] length] == 0) return;
    self.cmdInput.stringValue = @"";
    [self runUserCommandWithFallback:text];
}

// 确定性尝试失败(-10)时自动降级到 LLM 规划
- (void)runUserCommandWithFallback:(NSString*)text {
    // 先走确定性解析: 构造 wire 调 cuse_command
    // 确定性动词命中(rc != -10)→执行; rc == -10 → 自然语言降级
    const char* textRaw = text.UTF8String;
    int32_t rc = cheng_libp2p_browser_cuse_command(
        textRaw, (int64_t)strlen(textRaw),
        "", 0, 0);
    if (rc != -10) {
        // 确定性路径命中
        if (rc != 0) {
            int32_t elen = cheng_libp2p_browser_last_error_len();
            NSMutableData* ed = [NSMutableData dataWithLength:(NSUInteger)elen + 1];
            char* ebuf = (char*)ed.mutableBytes;
            for (int32_t b = 0; b < elen; b++) ebuf[b] = (char)cheng_libp2p_browser_last_error_byte(b);
            ebuf[elen] = 0;
            fprintf(stderr, "[cmd] ERR rc=%d cmd=%s err=%s\n", rc, text.UTF8String, ebuf);
        } else {
            fprintf(stderr, "[cmd] ok rc=0 cmd=%s\n", text.UTF8String);
            [self applyChengSelectValue];
            [self rebuildRightDrawList];
        }
        return;
    }
    // 非结构化指令 → 自然语言降级到 LLM 规划
    fprintf(stderr, "[nl] fallback to LLM: %s\n", text.UTF8String);
    [self runNaturalLanguage:text];
}

// 自然语言输入 → 本机 LLM 规划 → 指令序列 → 逐条走语义通道
- (void)runNaturalLanguage:(NSString*)text {
    if (self.planInProgress) return;
    self.planInProgress = YES;
    NSString* goal = text;
    NSString* effectClass = @"";
    int32_t confirmed = 0;
    const char* goalRaw = goal.UTF8String;
    int32_t rc = cheng_libp2p_browser_plan_begin(goalRaw, (int64_t)strlen(goalRaw));
    if (rc != 0) {
        fprintf(stderr, "[nl] ERR rc=%d begin\n", rc);
        self.planInProgress = NO;
        return;
    }
    int32_t plen = cheng_libp2p_browser_plan_prompt_len();
    NSMutableData* pd = [NSMutableData dataWithLength:(NSUInteger)plen + 1];
    char* pbuf = (char*)pd.mutableBytes;
    for (int32_t b = 0; b < plen; b++) pbuf[b] = (char)cheng_libp2p_browser_plan_prompt_byte(b);
    pbuf[plen] = 0;
    NSString* prompt = [NSString stringWithUTF8String:pbuf] ?: @"";
    NSString* model = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_PLAN_MODEL"];
    if (model.length == 0) model = @"qwen2.5:3b";
    NSString* url = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_PLAN_URL"];
    if (url.length == 0) url = @"http://127.0.0.1:11434/api/chat";
    NSDictionary* body = @{@"model": model,
                           @"messages": @[@{@"role": @"user", @"content": prompt}],
                           @"stream": @NO,
                           @"options": @{@"temperature": @0}};
    NSData* bodyData = [NSJSONSerialization dataWithJSONObject:body options:0 error:nil];
    if (!bodyData) { fprintf(stderr, "[nl] ERR body\n"); self.planInProgress = NO; return; }
    NSMutableURLRequest* req = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:url]];
    req.HTTPMethod = @"POST";
    req.HTTPBody = bodyData;
    req.timeoutInterval = 120;
    dispatch_semaphore_t sem = dispatch_semaphore_create(0);
    __block NSData* respData = nil;
    [[NSURLSession.sharedSession dataTaskWithRequest:req
                                   completionHandler:^(NSData* d, NSURLResponse* r, NSError* e) {
        (void)r;
        if (!e) respData = d;
        dispatch_semaphore_signal(sem);
    }] resume];
    dispatch_semaphore_wait(sem, DISPATCH_TIME_FOREVER);
    if (!respData) { fprintf(stderr, "[nl] ERR http\n"); self.planInProgress = NO; return; }
    NSDictionary* resp = [NSJSONSerialization JSONObjectWithData:respData options:0 error:nil];
    NSString* content = resp[@"message"][@"content"];
    if (content.length == 0) { fprintf(stderr, "[nl] ERR empty\n"); self.planInProgress = NO; return; }
    const char* replyRaw = content.UTF8String;
    fprintf(stderr, "[nl] reply=%.200s\n", replyRaw);
    rc = cheng_libp2p_browser_plan_submit(replyRaw, (int64_t)strlen(replyRaw));
    if (rc != 0) {
        fprintf(stderr, "[nl] ERR rc=%d submit (no protocol lines)\n", rc);
        self.planInProgress = NO;
        return;
    }
    int32_t n = cheng_libp2p_browser_plan_step_count();
    fprintf(stderr, "[nl] ok steps=%d\n", n);
    // 解析出的指令序列逐条走语义通道(准入/确认门/语义寻址全继承)
    for (int32_t i = 0; i < n; i++) {
        int32_t slen = cheng_libp2p_browser_plan_step_len_at(i);
        NSMutableData* sd = [NSMutableData dataWithLength:(NSUInteger)slen + 1];
        char* sbuf = (char*)sd.mutableBytes;
        for (int32_t b = 0; b < slen; b++) sbuf[b] = (char)cheng_libp2p_browser_plan_step_byte_at(i, b);
        sbuf[slen] = 0;
        NSString* step = [NSString stringWithUTF8String:sbuf] ?: @"";
        fprintf(stderr, "[nl] step %d/%d: %s\n", i + 1, n, step.UTF8String);
        // 直接走 cuse_command(确定性执行, 全部语义保障)
        const char* stepRaw = step.UTF8String;
        int32_t src_rc = cheng_libp2p_browser_cuse_command(
            stepRaw, (int64_t)strlen(stepRaw),
            effectClass.UTF8String, (int64_t)strlen(effectClass.UTF8String),
            confirmed);
        if (src_rc != 0) {
            int32_t elen = cheng_libp2p_browser_last_error_len();
            NSMutableData* ed = [NSMutableData dataWithLength:(NSUInteger)elen + 1];
            char* ebuf = (char*)ed.mutableBytes;
            for (int32_t b2 = 0; b2 < elen; b2++) ebuf[b2] = (char)cheng_libp2p_browser_last_error_byte(b2);
            ebuf[elen] = 0;
            fprintf(stderr, "[nl] step %d ERR rc=%d err=%s\n", i + 1, src_rc, ebuf);
        } else {
            fprintf(stderr, "[nl] step %d ok\n", i + 1);
            [self applyChengSelectValue];
            [self rebuildRightDrawList];
        }
    }
    fprintf(stderr, "[nl] done steps=%d\n", n);
    self.planInProgress = NO;
}

- (void)runUserCommand:(NSString*)text {
    // 默认效果类 none / 确认否——用户显式声明时在前缀标注:
    //   !confirm <指令>  → 确认执行（通过 external-publish 确认门）
    NSString* body = text;
    NSString* effectClass = @"";
    int32_t confirmed = 0;
    if ([body hasPrefix:@"!confirm "]) {
        effectClass = @"external-publish";
        confirmed = 1;
        body = [body substringFromIndex:9];
    }
    NSString* wire = [NSString stringWithFormat:@"%@|%@|%d", body, effectClass, confirmed];
    [self runCmdLine:wire];
}

// 结构化指令行: instruction|effectClass|confirmed。动词+名称精确检索,
// 无 LLM 无模糊; rc<0 上报不重试不降级。门禁行格式 '|' 分隔。
- (void)runCmdLine:(NSString*)line {
    NSArray<NSString*>* p = [line componentsSeparatedByString:@"|"];
    if (p.count < 3) { fprintf(stderr, "[cmd] ERR rc=-99 bad-line\n"); return; }
    int32_t confirmed = [p[2] intValue] != 0 ? 1 : 0;
    const char* textRaw = p[0].UTF8String;
    const char* effectRaw = p[1].UTF8String;
    int32_t rc = cheng_libp2p_browser_cuse_command(
        textRaw, (int64_t)strlen(textRaw),
        effectRaw, (int64_t)strlen(effectRaw),
        confirmed);
    if (rc != 0) {
        int32_t elen = cheng_libp2p_browser_last_error_len();
        NSMutableData* ed = [NSMutableData dataWithLength:(NSUInteger)elen + 1];
        char* ebuf = (char*)ed.mutableBytes;
        for (int32_t b = 0; b < elen; b++) ebuf[b] = (char)cheng_libp2p_browser_last_error_byte(b);
        ebuf[elen] = 0;
        fprintf(stderr, "[cmd] ERR rc=%d cmd=%s err=%s\n", rc, p[0].UTF8String, ebuf);
        return;
    }
    // 凭据脱敏: 目标控件为 password 时日志掩码 payload(注入值不受影响)
    NSString* logCmd = p[0];
    {
        NSRange setRange = [logCmd rangeOfString:@"^输入 |^set " options:NSRegularExpressionSearch];
        NSRange q1 = [logCmd rangeOfString:@"\""];
        if (setRange.location != NSNotFound && q1.location != NSNotFound) {
            NSRange q2 = [logCmd rangeOfString:@"\"" options:0 range:NSMakeRange(q1.location + 1, logCmd.length - q1.location - 1)];
            if (q2.location != NSNotFound) {
                NSString* target = [logCmd substringWithRange:NSMakeRange(q1.location + 1, q2.location - q1.location - 1)];
                int32_t n = cheng_libp2p_browser_widget_count();
                for (int32_t wi = 0; wi < n; wi++) {
                    int32_t tlen = cheng_libp2p_browser_widget_input_type_len_at(wi);
                    NSMutableData* td = [NSMutableData dataWithLength:(NSUInteger)tlen + 1];
                    char* tb = (char*)td.mutableBytes;
                    for (int32_t b = 0; b < tlen; b++) tb[b] = (char)cheng_libp2p_browser_widget_input_type_byte_at(wi, b);
                    tb[tlen] = 0;
                    if (strcmp(tb, "password") == 0) {
                        int32_t nlen = cheng_libp2p_browser_widget_ctl_name_len_at(wi);
                        NSMutableData* nd = [NSMutableData dataWithLength:(NSUInteger)nlen + 1];
                        char* nb = (char*)nd.mutableBytes;
                        for (int32_t b = 0; b < nlen; b++) nb[b] = (char)cheng_libp2p_browser_widget_ctl_name_byte_at(wi, b);
                        nb[nlen] = 0;
                        if (strcmp(target.UTF8String, nb) == 0) {
                            NSRange vq = [logCmd rangeOfString:@"\"" options:0 range:NSMakeRange(q2.location + 1, logCmd.length - q2.location - 1)];
                            if (vq.location != NSNotFound) {
                                NSRange payloadRange = NSMakeRange(q2.location + 1, logCmd.length - q2.location - 1);
                                NSRange tailRange = NSMakeRange(vq.location, logCmd.length - vq.location);
                                logCmd = [NSString stringWithFormat:@"%@\"****\"%@", [logCmd substringWithRange:NSMakeRange(0, payloadRange.location)], [logCmd substringWithRange:tailRange]];
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
    fprintf(stderr, "[cmd] ok rc=0 cmd=%s\n", logCmd.UTF8String);
    NSMutableString* act = [NSMutableString string];
    int32_t alen2 = cheng_libp2p_browser_apply_action_len();
    for (int32_t b = 0; b < alen2; b++) [act appendFormat:@"%c", (char)cheng_libp2p_browser_apply_action_byte(b)];
    if (![act isEqualToString:@"Read"] && self.readOverlay && !self.readOverlay.hidden) {
        self.readOverlay.hidden = YES;
    }
    if ([act isEqualToString:@"Read"]) {
        // 读取语义: 输出命中文本行(不注入任何事件)
        NSMutableData* rd = [NSMutableData dataWithLength:(NSUInteger)cheng_libp2p_browser_read_result_len() + 1];
        char* rbuf = (char*)rd.mutableBytes;
        int32_t rlen = cheng_libp2p_browser_read_result_len();
        for (int32_t b = 0; b < rlen; b++) rbuf[b] = (char)cheng_libp2p_browser_read_result_byte(b);
        rbuf[rlen] = 0;
        fprintf(stderr, "[read] %s", rbuf);
        [self showReadOverlay:[NSString stringWithUTF8String:rbuf] ?: @""];
        NSString* readOut = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_READ_OUT"];
        if (readOut.length > 0) {
            NSString* cmdText = p[0] ?: @"";
            NSMutableString* json = [NSMutableString string];
            [json appendFormat:@"{\"verb\":\"read\",\"cmd\":\"%@", cmdText];
            [json appendString:@"\",\"lines\":[\""];
            // 内容 JSON 转义: 反斜杠/引号/换行
            NSData* rd2 = [NSData dataWithBytes:rbuf length:(NSUInteger)rlen];
            NSString* body = [[NSString alloc] initWithData:rd2 encoding:NSUTF8StringEncoding] ?: @"";
            NSString* esc = [body stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"];
            esc = [esc stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""];
            esc = [esc stringByReplacingOccurrencesOfString:@"\n" withString:@"\", \""];
            [json appendString:esc];
            [json appendString:@"\"]}\n"];
            NSFileHandle* fh = [NSFileHandle fileHandleForWritingAtPath:readOut];
            if (fh == nil) {
                [@"" writeToFile:readOut atomically:YES encoding:NSUTF8StringEncoding error:nil];
                fh = [NSFileHandle fileHandleForWritingAtPath:readOut];
            }
            if (fh) {
                [fh seekToEndOfFile];
                [fh writeData:[json dataUsingEncoding:NSUTF8StringEncoding]];
                [fh closeFile];
            }
        }
        fprintf(stderr, "[read-overlay] shown\n");
        return;
    }
    if ([act isEqualToString:@"Drag"]) {
        // 拖拽双轨: 默认 JS 合成事件(mock/无风控场景, 门禁稳定无权限依赖);
        // env CHENG_LIBP2P_BROWSER_DRAG_CGEVENT=1 时走 CGEvent 真实事件
        // (isTrusted=true, 对抗滑块风控; 需辅助功能权限+app 前台)。
        // 两者均为后台线程——evaluateJavaScript 的 completion 派发回主线程,
        // 主线程阻塞等待会死锁(实证)。
        NSString* value = [self copyChengLen:cheng_libp2p_browser_apply_value_len() byteAt:cheng_libp2p_browser_apply_value_byte];
        NSPoint viewOrigin = self.webView.frame.origin;
        NSRect winFrame = self.webView.window.frame;
        CGFloat screenH = NSScreen.mainScreen.frame.size.height;
        __weak ChengLibp2pBrowserHost* weakSelf2 = self;
        BOOL useCG = [NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_DRAG_CGEVENT"] isEqualToString:@"1"];
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            NSArray<NSString*>* nums = [value componentsSeparatedByString:@","];
            if (nums.count < 4) { fprintf(stderr, "[drag] ERR bad-params\n"); return; }
            double px = nums[0].doubleValue, py = nums[1].doubleValue;
            double dx = nums[2].doubleValue, dy = nums[3].doubleValue;
            dispatch_semaphore_t ss = dispatch_semaphore_create(0);
            __block double sx = 0, sy = 0;
            [self.webView evaluateJavaScript:@"(function(){return [window.scrollX||0, window.scrollY||0];})()"
                 completionHandler:^(id r, NSError* e) {
                (void)e;
                NSArray* ra = r;
                if ([ra isKindOfClass:[NSArray class]] && ra.count >= 2) {
                    sx = [ra[0] doubleValue]; sy = [ra[1] doubleValue];
                }
                dispatch_semaphore_signal(ss);
            }];
            dispatch_semaphore_wait(ss, DISPATCH_TIME_FOREVER);
            if (useCG) {
                NSPoint viewPt = NSMakePoint(px - sx, py - sy);
                NSPoint winPt = [self.webView convertPoint:viewPt toView:nil];
                CGFloat gx = winFrame.origin.x + winPt.x;
                CGFloat gy = screenH - (winFrame.origin.y + winPt.y);
                CGEventRef down = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDown, CGPointMake(gx, gy), kCGMouseButtonLeft);
                CGEventPost(kCGHIDEventTap, down);
                CFRelease(down);
                int steps = 25;
                for (int s = 1; s <= steps; s++) {
                    double t = (double)s / steps;
                    double ease = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2;
                    CGFloat cx = gx + (CGFloat)(dx * ease) + (CGFloat)((s % 3) - 1) * 0.6;
                    CGFloat cy = gy + (CGFloat)(dy * ease) + (CGFloat)((s % 2) - 0.5) * 0.4;
                    CGEventRef mv = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseDragged, CGPointMake(cx, cy), kCGMouseButtonLeft);
                    CGEventPost(kCGHIDEventTap, mv);
                    CFRelease(mv);
                    [NSThread sleepForTimeInterval:0.018];
                }
                CGEventRef up = CGEventCreateMouseEvent(NULL, kCGEventLeftMouseUp, CGPointMake(gx + dx, gy + dy), kCGMouseButtonLeft);
                CGEventPost(kCGHIDEventTap, up);
                CFRelease(up);
            } else {
                // JS 合成轨迹(mousedown 到起点元素, move/up 派发到 window)
                NSArray* payload = @[@(px), @(py), @(dx), @(dy)];
                NSData* jd = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
                NSString* jarr = jd ? [[NSString alloc] initWithData:jd encoding:NSUTF8StringEncoding] : @"[]";
                NSString* js = [NSString stringWithFormat:
                    @"(function(p){var x=p[0],y=p[1],dx=p[2],dy=p[3];var el=document.elementFromPoint(x,y);if(!el)return 'E:noel';"
                    @"var o={bubbles:true,cancelable:true,view:window,clientX:x,clientY:y,button:0,buttons:1};"
                    @"el.dispatchEvent(new MouseEvent('mousedown',o));"
                    @"var steps=12;"
                    @"for(var i=1;i<=steps;i++){var t=i/steps;var cx=x+dx*t,cy=y+dy*t;"
                    @"var mv=new MouseEvent('mousemove',Object.assign({},o,{clientX:cx,clientY:cy}));window.dispatchEvent(mv);}"
                    @"window.dispatchEvent(new MouseEvent('mouseup',Object.assign({},o,{buttons:0})));"
                    @"return 'ok';})(%@)", jarr];
                dispatch_semaphore_t js2 = dispatch_semaphore_create(0);
                [self.webView evaluateJavaScript:js completionHandler:^(id r, NSError* e) {
                    (void)e;
                    // fprintf 无 %@(ObjC 格式符), 用 UTF8String
                    NSString* rs = [r isKindOfClass:[NSString class]] ? r : @"?";
                    fprintf(stderr, "[drag] js=%s\n", rs.UTF8String);
                    dispatch_semaphore_signal(js2);
                }];
                dispatch_semaphore_wait(js2, DISPATCH_TIME_FOREVER);
            }
            fprintf(stderr, "[drag] done (%.0f,%.0f)+(%.0f,%.0f)\n", px, py, dx, dy);
            dispatch_async(dispatch_get_main_queue(), ^{
                [weakSelf2 captureRightRefresh:YES];
            });
        });
        return;
    }
    [self applyChengSelectValue];
    [self rebuildRightDrawList];
}

// read 结果上屏: 半透明卡片显示最近命中文本行(前 5 行), 6 秒后自动消退
- (void)showReadOverlay:(NSString*)text {
    if (!self.readOverlay) return;
    NSString* trimmed = text.length > 600 ? [text substringToIndex:600] : text;
    NSMutableString* shown = [NSMutableString stringWithString:@"▸ 读取结果\n"];
    NSArray* lines = [trimmed componentsSeparatedByString:@"\n"];
    int32_t shown_n = 0;
    for (NSString* l in lines) {
        if (l.length == 0) continue;
        [shown appendFormat:@"%@\n", l];
        shown_n += 1;
        if (shown_n >= 5) break;
    }
    if (shown_n == 0) [shown appendString:@"(无命中)"];
    dispatch_async(dispatch_get_main_queue(), ^{
        self.readOverlay.stringValue = shown;
        self.readOverlay.hidden = NO;
    });
    __weak ChengLibp2pBrowserHost* wself = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(6 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        wself.readOverlay.hidden = YES;
    });
}

// Q4b 规划行: goal|effectClass|confirmed。控件树+goal 组装 prompt(cheng) →
// 真实模型端点(默认本机 ollama /api/chat) → 回复确定性解析为指令行(cheng) →
// 插入 cmdLines 队列逐条执行(准入/确认门/语义注入全继承)。模型无幻觉兜底:
// 解析不出协议行即 hard-fail 上报。
- (void)runPlanLine:(NSString*)line {
    NSArray<NSString*>* p = [line componentsSeparatedByString:@"|"];
    if (p.count < 3) { fprintf(stderr, "[plan] ERR rc=-99 bad-line\n"); return; }
    NSString* goal = p[0];
    NSString* effectClass = p[1];
    int32_t confirmed = [p[2] intValue] != 0 ? 1 : 0;
    NSString* allowVerbs = p.count > 3 ? p[3] : @"";
    if (allowVerbs.length > 0) {
        const char* allowRaw = allowVerbs.UTF8String;
        cheng_libp2p_browser_plan_allow(allowRaw, (int64_t)strlen(allowRaw));
    }
    const char* goalRaw = goal.UTF8String;
    NSString* model = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_PLAN_MODEL"];
    if (model.length == 0) model = @"qwen2.5:0.5b";
    NSString* url = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_PLAN_URL"];
    if (url.length == 0) url = @"http://127.0.0.1:11434/api/chat";
    int32_t rc = 0;
    // 小模型在大清单上偶发动词漂移: 失败自动重试(重新 begin 取最新页面
    // 状态组装 prompt 再请求, 最多 3 次)——确定性重试, 非解析放宽
    for (int32_t attempt = 0; attempt < 3; attempt++) {
        rc = cheng_libp2p_browser_plan_begin(goalRaw, (int64_t)strlen(goalRaw));
        if (rc != 0) {
            fprintf(stderr, "[plan] ERR rc=%d begin\n", rc);
            return;
        }
        int32_t plen = cheng_libp2p_browser_plan_prompt_len();
        NSMutableData* pd = [NSMutableData dataWithLength:(NSUInteger)plen + 1];
        char* pbuf = (char*)pd.mutableBytes;
        for (int32_t b = 0; b < plen; b++) pbuf[b] = (char)cheng_libp2p_browser_plan_prompt_byte(b);
        pbuf[plen] = 0;
        NSString* prompt = [NSString stringWithUTF8String:pbuf] ?: @"";
        NSDictionary* body = @{@"model": model,
                               @"messages": @[@{@"role": @"user", @"content": prompt}],
                               @"stream": @NO,
                               @"options": @{@"temperature": @0}};
        NSData* bodyData = [NSJSONSerialization dataWithJSONObject:body options:0 error:nil];
        if (!bodyData) { fprintf(stderr, "[plan] ERR rc=-98 body\n"); return; }
        NSMutableURLRequest* req = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:url]];
        req.HTTPMethod = @"POST";
        req.HTTPBody = bodyData;
        req.timeoutInterval = 120;
        dispatch_semaphore_t sem = dispatch_semaphore_create(0);
        __block NSData* respData = nil;
        [[NSURLSession.sharedSession dataTaskWithRequest:req
                                       completionHandler:^(NSData* d, NSURLResponse* r, NSError* e) {
            (void)r;
            if (!e) respData = d;
            dispatch_semaphore_signal(sem);
        }] resume];
        dispatch_semaphore_wait(sem, DISPATCH_TIME_FOREVER);
        if (!respData) { fprintf(stderr, "[plan] ERR rc=-97 http (attempt %d)\n", attempt + 1); return; }
        NSDictionary* resp = [NSJSONSerialization JSONObjectWithData:respData options:0 error:nil];
        NSString* content = resp[@"message"][@"content"];
        if (content.length == 0) { fprintf(stderr, "[plan] ERR rc=-96 empty-content (attempt %d)\n", attempt + 1); return; }
        const char* replyRaw = content.UTF8String;
        fprintf(stderr, "[plan] reply=%.200s\n", replyRaw);
        rc = cheng_libp2p_browser_plan_submit(replyRaw, (int64_t)strlen(replyRaw));
        if (rc == 0) {
            if (allowVerbs.length > 0) fprintf(stderr, "[plan] allow-verbs=%s\n", allowVerbs.UTF8String);
            break;
        }
        fprintf(stderr, "[plan] retry %d/2 (no protocol lines)\n", attempt + 1);
    }
    if (rc != 0) {
        fprintf(stderr, "[plan] ERR rc=%d submit after 3 attempts\n", rc);
        return;
    }
    int32_t n = cheng_libp2p_browser_plan_step_count();
    fprintf(stderr, "[plan] ok steps=%d goal=%s\n", n, goal.UTF8String);
    // 派生指令行插入 cmdLines 当前位置之后(effectClass/confirmed 沿规划行),
    // 复用执行回读循环: 每条 cuse_command → apply 注入 → 重抓回读。
    NSMutableArray<NSString*>* queue = [NSMutableArray arrayWithArray:self.cmdLines];
    NSMutableArray<NSString*>* steps = [NSMutableArray array];
    for (int32_t i = 0; i < n; i++) {
        int32_t slen = cheng_libp2p_browser_plan_step_len_at(i);
        NSMutableData* sd = [NSMutableData dataWithLength:(NSUInteger)slen + 1];
        char* sbuf = (char*)sd.mutableBytes;
        for (int32_t b = 0; b < slen; b++) sbuf[b] = (char)cheng_libp2p_browser_plan_step_byte_at(i, b);
        sbuf[slen] = 0;
        NSString* s = [NSString stringWithUTF8String:sbuf] ?: @"";
        [steps addObject:[NSString stringWithFormat:@"%@|%@|%d", s, effectClass, confirmed]];
    }
    [queue insertObjects:steps atIndexes:[NSIndexSet indexSetWithIndexesInRange:NSMakeRange(self.cmdLine, steps.count)]];
    self.cmdLines = queue;
}

- (void)go: (id)sender {
    NSString* url = self.urlField.stringValue;
    fprintf(stderr, "[gate] go: url=%s\n", url.UTF8String ? url.UTF8String : "empty");
    if (url.length == 0) return;
    [self callBeginLoad:url];
    [self layoutPanes];
    NSURL* nsurl = [NSURL URLWithString:url];
    if (!nsurl) return;
    [self.webView loadRequest:[NSURLRequest requestWithURL:nsurl]];
}

- (void)connectPeer: (id)sender {
    NSString* peer = self.peerField.stringValue;
    if (peer.length == 0) return;
    const char* p = peer.UTF8String;
    int64_t n = (int64_t)strlen(p);
    cheng_libp2p_browser_attach_peer(p, n);
    cheng_libp2p_browser_select_peer(p, n);
}

- (void)windowDidResize:(NSNotification*)notification {
    BOOL ro = cheng_libp2p_browser_right_open() != 0;
    [self applySplitLayout:ro];
}

- (void)windowDidEndLiveResize:(NSNotification*)notification {
    BOOL ro = cheng_libp2p_browser_right_open() != 0;
    [self applySplitLayout:ro];
    // 冲刷冻结期排队的重抓(视口已定, 一次全量快照)
    BOOL pending = self.captureQueued;
    BOOL pendingRefresh = self.captureQueuedRefresh;
    self.captureQueued = NO;
    self.captureQueuedRefresh = NO;
    if (!cheng_libp2p_browser_right_open()) return;
    [self captureRightRefresh:pending ? pendingRefresh : YES];
}
- (void)webView:(WKWebView*)webView didFailNavigation:(WKNavigation*)navigation withError:(NSError*)error {
    [self showProgress:NO];
    if (error.code == NSURLErrorCancelled) return;
    [self showErrorPage:error.localizedDescription ?: @"加载失败"];
}
- (void)webView:(WKWebView*)webView didFailProvisionalNavigation:(WKNavigation*)navigation withError:(NSError*)error {
    [self showProgress:NO];
    if (error.code == NSURLErrorCancelled) return;
    [self showErrorPage:error.localizedDescription ?: @"加载失败"];
}
- (void)webView:(WKWebView*)webView didCommitNavigation:(WKNavigation*)navigation {
    [self showProgress:YES];
}
- (void)webView:(WKWebView*)webView didStartProvisionalNavigation:(WKNavigation*)navigation {
    self.captureGen += 1;
    self.captureQueued = NO;
    self.captureQueuedRefresh = NO;
    NSURL* u = webView.URL;
    if (u && u.absoluteString.length > 0) {
        [self callBeginLoad:u.absoluteString];
    }
    [self layoutPanes];
}

// CLB 尾行 FONT|family|base64 → 临时 .ttf 落盘 + CTFontManager 进程域注册。
// 每个文件只注册一次(路径哈希去重); 失败静默(右栏回退系统字体, 与旧行为一致)。
- (void)registerWebfontsFromClb:(NSString*)snap {
    if (snap.length == 0) return;
    if (!self.registeredFontPaths) self.registeredFontPaths = [NSMutableSet set];
    NSArray<NSString*>* lines = [snap componentsSeparatedByString:@"\n"];
    for (NSString* line in lines) {
        if (![line hasPrefix:@"FONT|"]) continue;
        NSArray<NSString*>* parts = [line componentsSeparatedByString:@"|"];
        if (parts.count < 3) continue;
        NSString* b64 = parts[2];
        NSLog(@"[webfont] line fam=%@ b64len=%lu", parts[1], (unsigned long)b64.length);
        NSData* data = [[NSData alloc] initWithBase64EncodedString:b64 options:0];
        if (data.length < 256) continue;
        NSString* pathHash = [NSString stringWithFormat:@"%lu.%@", (unsigned long)data.length, [b64 substringToIndex:MIN((NSUInteger)32, b64.length)]];
        if ([self.registeredFontPaths containsObject:pathHash]) continue;
        NSString* dir = NSTemporaryDirectory();
        NSString* path = [dir stringByAppendingPathComponent:[NSString stringWithFormat:@"bhb-font-%@.ttf", pathHash]];
        if (![[NSFileManager defaultManager] fileExistsAtPath:path]) {
            [data writeToFile:path atomically:YES];
        }
        CFURLRef url = (__bridge CFURLRef)[NSURL fileURLWithPath:path];
        CFErrorRef err = NULL;
        Boolean ok = CTFontManagerRegisterFontsForURL(url, kCTFontManagerScopeProcess, &err);
        NSLog(@"[webfont] register %@ -> %d (bytes=%lu)", path, ok, (unsigned long)data.length);
        if (err) { NSLog(@"[webfont] err: %@", (__bridge NSError*)err); CFRelease(err); }
        [self.registeredFontPaths addObject:pathHash];
    }
}

- (void)applySnapshot:(id)result error:(NSError*)error pageUrl:(NSString*)pageUrl refresh:(BOOL)refresh {
    if (NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_FRAME_DUMP"] != nil) {
        fprintf(stderr, "[gate] applySnapshot: cls=%s len=%ld refresh=%d err=%s\n",
            result ? NSStringFromClass([result class]).UTF8String : "nil",
            (long)([result isKindOfClass:[NSString class]] ? [(NSString*)result length] : -1),
            refresh ? 1 : 0,
            error ? error.localizedDescription.UTF8String : "none");
    }
            const char* urlRaw = pageUrl.UTF8String;
            int64_t urlLen = urlRaw ? (int64_t)strlen(urlRaw) : 0;
            if (!error && [result isKindOfClass:[NSString class]]) {
        NSString* snap = (NSString*)result;
        if (![snap hasPrefix:@"CLB2"] && ![snap hasPrefix:@"CLB3"] && ![snap hasPrefix:@"CLB4"]) {
            // 捕获异常/空回串如实上报(禁止静默丢弃)
            fprintf(stderr, "[gate] capture rejected: %s\n", snap.UTF8String);
        }
        if ([snap hasPrefix:@"CLB2"] || [snap hasPrefix:@"CLB3"] || [snap hasPrefix:@"CLB4"]) {
            self.lastSnapBytes = (long)snap.length;
            NSString* clbDump = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_CLB_DUMP"];
            if (clbDump.length > 0) [snap writeToFile:clbDump atomically:YES encoding:NSUTF8StringEncoding error:nil];
            // CLB 尾行 FONT|family|base64(data:font/ttf) → 落临时文件注册
            // CoreText 进程域(按已注册路径去重); 右栏字形才能用页面真实
            // 网络字体(PT Sans 等), 否则全页静默回退系统字体。
            [self registerWebfontsFromClb:snap];
            // 跨域 iframe 像素回放: contentDocument 不可达, 但宿主窗口合成快照
            // 含其渲染内容。检测 tag=iframe 且 img 空的盒, 异步取窗口快照裁矩形
            // 填 img 字段后再进编译(仅 iframe 页多一拍异步, 无 iframe 页零开销)。
            {
                NSArray<NSString*>* snapLines = [snap componentsSeparatedByString:@"\n"];
                NSMutableArray<NSArray*>* cropBoxes = [NSMutableArray array];
                if (snapLines.count > 2) {
                    int boxCount2 = [[snapLines[1] componentsSeparatedByString:@" "][2] intValue];
                    for (int b2 = 0; b2 < boxCount2 && (2 + b2*10 + 9) < (int)snapLines.count; b2++) {
                        int base2 = 2 + b2*10;
                        if ([snapLines[base2+1] isEqualToString:@"iframe"] && snapLines[base2+8].length == 0) {
                            NSArray<NSString*>* nums2 = [snapLines[base2] componentsSeparatedByString:@" "];
                            if (nums2.count >= 5) {
                                NSRect r2 = NSMakeRect([nums2[1] doubleValue], [nums2[2] doubleValue],
                                                       [nums2[3] doubleValue], [nums2[4] doubleValue]);
                                if (r2.size.width > 2 && r2.size.height > 2) {
                                    [cropBoxes addObject:@[ @(b2), NSStringFromRect(r2) ]];
                                }
                            }
                        }
                    }
                }
                if (cropBoxes.count > 0) {
                    [self fillIframePixelsForSnap:snap boxes:cropBoxes url:pageUrl refresh:refresh];
                    return;
                }
            }
            [self compileAndShowSnap:snap url:pageUrl refresh:refresh];
        }
    }
    if (pageUrl.length > 0) self.urlField.stringValue = pageUrl;
    [self layoutPanes];
    [self rebuildRightDrawList];
}

// applySnapshot 编译尾(独立成方法供 iframe 异步像素填充后续走)。
- (void)compileAndShowSnap:(NSString*)snap url:(NSString*)pageUrl refresh:(BOOL)refresh {
    const char* urlRaw = pageUrl.UTF8String;
    int64_t urlLen = urlRaw ? (int64_t)strlen(urlRaw) : 0;
    // 增量补丁第一片: CLB 字节与上次一致(动画空帧/悬停噪声)时跳过重编译重绘,
    // 右栏保留上一帧。刷新首次(refresh==NO)永不跳过。
    if (refresh && self.lastSnapHash && [self.lastSnapHash isEqualToString:snap]) {
        return;
    }
    {
        double capMb = 16;
        NSString* capEnv = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_MAX_CLB_MB"];
        if (capEnv.length > 0 && capEnv.doubleValue > 1) capMb = capEnv.doubleValue;
        if (snap.length > capMb * 1024.0 * 1024.0) {
            fprintf(stderr, "[rss-guard] CLB %lu bytes > cap %.0fMB: refusing (keeping previous frame)\n",
                (unsigned long)snap.length, capMb);
            return;
        }
    }
    self.lastSnapHash = snap;
    const char* snapRaw = snap.UTF8String;
    if (snapRaw) {
        int64_t snapLen = (int64_t)strlen(snapRaw);
        if (refresh) {
            self.refreshCount += 1;
            // 注: recycleChengSession(重建 session)实测不能归还内存——
            // ABI 零归还下 cheng 堆只增不减, 重建只是换一块新滞留区; 唯一
            // 有效兜底是 rss-guard 的 execv 自重启(登录态/URL 保留)。
            int32_t recycleAfter = 20;
            NSString* rcEnv = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_RECYCLE_REBUILDS"];
            if (rcEnv.length > 0 && rcEnv.intValue > 10) recycleAfter = rcEnv.intValue;
            if (self.refreshCount >= recycleAfter) [self recycleChengSession];
            cheng_libp2p_browser_refresh_snapshot(urlRaw, urlLen, snapRaw, snapLen);
        } else {
            cheng_libp2p_browser_on_page_snapshot(urlRaw, urlLen, snapRaw, snapLen);
        }
        ChengBrowserDumpControlsIfRequested();
    }
    if (pageUrl.length > 0) self.urlField.stringValue = pageUrl;
    [self layoutPanes];
    [self rebuildRightDrawList];
}

// 跨域 iframe 像素填充: 窗口合成快照按 CLB 矩形裁 PNG 填 img 字段。
- (void)fillIframePixelsForSnap:(NSString*)snap boxes:(NSArray<NSArray*>*)cropBoxes url:(NSString*)pageUrl refresh:(BOOL)refresh {
    WKSnapshotConfiguration* cfg = [[WKSnapshotConfiguration alloc] init];
    cfg.rect = NSMakeRect(0, 0, self.webView.bounds.size.width, self.webView.bounds.size.height);
    __weak ChengLibp2pBrowserHost* weakSelf = self;
    [self.webView takeSnapshotWithConfiguration:cfg completionHandler:^(NSImage* image, NSError* error) {
        ChengLibp2pBrowserHost* s = weakSelf;
        if (!s) return;
        if (!image || error) {
            [s compileAndShowSnap:snap url:pageUrl refresh:refresh];
            return;
        }
        NSRect whole = NSMakeRect(0, 0, image.size.width, image.size.height);
        CGImageRef cg = [image CGImageForProposedRect:&whole context:nil hints:nil];
        if (!cg) {
            [s compileAndShowSnap:snap url:pageUrl refresh:refresh];
            return;
        }
        CGFloat scale = image.size.width > 0 ? (CGFloat)CGImageGetWidth(cg) / image.size.width : 1.0;
        NSString* finalSnap = snap;
        NSMutableArray<NSString*>* lines2 = [[snap componentsSeparatedByString:@"\n"] mutableCopy];
        for (NSArray* entry in cropBoxes) {
            NSInteger bIdx = [entry[0] integerValue];
            NSRect r2 = NSRectFromString(entry[1]);
            CGFloat vw2 = image.size.width / scale;
            CGFloat vh2 = image.size.height / scale;
            CGFloat cx = MAX(0.0, r2.origin.x);
            CGFloat cy = MAX(0.0, r2.origin.y);
            CGFloat cw2 = MIN(r2.origin.x + r2.size.width, vw2) - cx;
            CGFloat ch2 = MIN(r2.origin.y + r2.size.height, vh2) - cy;
            if (cw2 < 2 || ch2 < 2) continue;
            CGImageRef cropImg = CGImageCreateWithImageInRect(cg,
                CGRectMake(cx * scale, cy * scale, cw2 * scale, ch2 * scale));
            if (!cropImg) continue;
            NSBitmapImageRep* rep = [[NSBitmapImageRep alloc] initWithCGImage:cropImg];
            NSData* data = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
            CFRelease(cropImg);
            if (!data) continue;
            NSString* uri = [NSString stringWithFormat:@"data:image/png;base64,%@",
                [data base64EncodedStringWithOptions:0]];
            int base2 = 2 + (int)bIdx * 10;
            if (base2 + 8 < (int)lines2.count) {
                lines2[base2 + 8] = uri;
                finalSnap = [lines2 componentsJoinedByString:@"\n"];
            }
        }
        [s compileAndShowSnap:finalSnap url:pageUrl refresh:refresh];
    }];
}

- (NSString*)chengCaptureScript {
    int32_t n = cheng_libp2p_browser_capture_script_len();
    if (n <= 0) return @"";
    NSMutableData* data = [NSMutableData dataWithLength:(NSUInteger)n + 1];
    char* buf = (char*)data.mutableBytes;
    for (int32_t i = 0; i < n; i++) buf[i] = (char)cheng_libp2p_browser_capture_script_byte(i);
    buf[n] = 0;
    return [NSString stringWithUTF8String:buf];
}

- (void)captureRightRefresh:(BOOL)refresh {
    // live resize 期间视口连续变化: 每次快照都全量重编译且 cheng 侧滞留
    // (ABI 零归还), 拖拽数秒即 GB 级——期间冻结, 排队一次, 结束统一冲刷
    if (self.window && self.window.inLiveResize) {
        self.captureQueued = YES;
        if (refresh) self.captureQueuedRefresh = YES;
        return;
    }
    if (self.captureBusy) {
        self.captureQueued = YES;
        if (refresh) self.captureQueuedRefresh = YES;
        return;
    }
    if ([self captureThrottled]) {
        self.captureQueued = YES;
        if (refresh) self.captureQueuedRefresh = YES;
        __weak ChengLibp2pBrowserHost* weakSelf = self;
        NSString* envMs = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_MIN_CAPTURE_MS"];
        CGFloat minMs = (envMs.length > 0 && envMs.doubleValue > 0) ? envMs.doubleValue : 300;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(minMs * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
            ChengLibp2pBrowserHost* s = weakSelf;
            if (!s || !s.captureQueued) return;
            s.captureQueued = NO;
            BOOL r = s.captureQueuedRefresh;
            s.captureQueuedRefresh = NO;
            [s captureRightRefresh:r];
        });
        return;
    }
    self.lastCaptureStart = [NSProcessInfo processInfo].systemUptime;
    NSString* js = [self chengCaptureScript];
    if (js.length == 0) return;
    self.captureBusy = YES;
    int32_t gen = self.captureGen;
    BOOL useRefresh = refresh;
    __weak ChengLibp2pBrowserHost* weakSelf = self;
    NSString* pageUrl = self.webView.URL.absoluteString ?: @"";
    [self.webView evaluateJavaScript:js completionHandler:^(id result, NSError* error) {
        ChengLibp2pBrowserHost* strong = weakSelf;
        if (!strong) return;
        strong.captureBusy = NO;
        if (strong.captureGen == gen) {
            [strong applySnapshot:result error:error pageUrl:pageUrl refresh:useRefresh];
        }
        if (strong.captureQueued) {
            BOOL again = strong.captureQueuedRefresh || (cheng_libp2p_browser_right_open() != 0);
            strong.captureQueued = NO;
            strong.captureQueuedRefresh = NO;
            [strong captureRightRefresh:again];
        }
    }];
}

// _blank/window.open 新窗口接管: 新 WKWebView 整体替换主 webView(视图位置/
// delegate/快照与事件链全部自动指向新窗口)。configuration 由系统从父页复制,
// userContentController(chengCapture 消息+documentStart 注入)随之可用。
- (WKWebView*)webView:(WKWebView*)webView createWebViewWithConfiguration:(WKWebViewConfiguration*)configuration
                                      forNavigationAction:(WKNavigationAction*)navigationAction
                                           windowFeatures:(WKWindowFeatures*)windowFeatures {
    WKWebView* nv = [[WKWebView alloc] initWithFrame:webView.frame configuration:configuration];
    nv.navigationDelegate = self;
    nv.UIDelegate = self;
    nv.autoresizesSubviews = YES;
    [webView.superview addSubview:nv positioned:NSWindowAbove relativeTo:nil];
    nv.frame = webView.frame;
    [self layoutPanes];
    if ([nv.superview isKindOfClass:[NSView class]]) {
        // 保持与旧 webView 相同的 autoresizing/约束语义: 直接以 frame 对齐右侧画布区
        nv.frame = webView.frame;
        nv.autoresizingMask = webView.autoresizingMask;
    }
    [webView removeFromSuperview];
    self.webView = nv;
    fprintf(stderr, "[gate] webview takeover for new window\n");
    return nv;
}

- (void)webView:(WKWebView*)webView didFinishNavigation:(WKNavigation*)navigation {
    fprintf(stderr, "[gate] didFinishNavigation url=%s\n", webView.URL.absoluteString.UTF8String ? webView.URL.absoluteString.UTF8String : "nil");
    [self applySplitLayout:YES];
    [self captureRightRefresh:NO];
}

- (NSString*)copyChengLen:(int32_t)n byteAt:(int32_t(*)(int32_t))byteFn {
    if (n <= 0 || !byteFn) return @"";
    NSMutableData* data = [NSMutableData dataWithLength:(NSUInteger)n + 1];
    char* buf = (char*)data.mutableBytes;
    for (int32_t i = 0; i < n; i++) buf[i] = (char)byteFn(i);
    buf[n] = 0;
    NSString* s = [NSString stringWithUTF8String:buf];
    return s ?: @"";
}

// apply 通道: 按 apply_action 分派注入模板。
//   Click/Toggle           → __chengCtlById(cid).click()
//   SetText/SetNumber/Select → native value setter + input/change
//   value / ctlId=0(旧路径) → fieldId 寻址写回(getElementById/name, iframe walk)
- (void)applyChengSelectValue {
    if (cheng_libp2p_browser_apply_ready() == 0) return;
    int32_t ctlId = cheng_libp2p_browser_apply_ctl_id();
    NSMutableString* action = [NSMutableString string];
    int32_t alen = cheng_libp2p_browser_apply_action_len();
    for (int32_t b = 0; b < alen; b++) [action appendFormat:@"%c", (char)cheng_libp2p_browser_apply_action_byte(b)];
    NSString* field = [self copyChengLen:cheng_libp2p_browser_apply_field_len() byteAt:cheng_libp2p_browser_apply_field_byte];
    NSString* value = [self copyChengLen:cheng_libp2p_browser_apply_value_len() byteAt:cheng_libp2p_browser_apply_value_byte];
    __weak ChengLibp2pBrowserHost* weakSelf = self;
    void (^done)(id, NSError*) = ^(id result, NSError* error) {
        (void)result; (void)error;
        ChengLibp2pBrowserHost* strong = weakSelf;
        if (!strong) return;
        [strong captureRightRefresh:YES];
    };
    if (ctlId > 0 && ([action isEqualToString:@"Click"] || [action isEqualToString:@"Toggle"])) {
        NSString* js = [NSString stringWithFormat:
            @"(function(cid){if(!window.__chengCtlById)return 'E:noreg';var el=window.__chengCtlById(cid);if(!el)return 'E:noel';try{el.scrollIntoView({block:'center'});}catch(ex){}el.click();return 'ok';})(%d)",
            ctlId];
        [self.webView evaluateJavaScript:js completionHandler:done];
        return;
    }
    if (ctlId > 0 && ([action isEqualToString:@"SetText"] || [action isEqualToString:@"SetNumber"] || [action isEqualToString:@"Select"])) {
        NSArray* payload = @[ @(ctlId), field ?: @"", value ?: @"" ];
        NSData* json = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
        if (!json) return;
        NSString* arr = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
        if (arr.length == 0) return;
        NSString* js = [NSString stringWithFormat:
            @"(function(p){var cid=p[0],id=p[1],v=p[2];function find(doc,id){if(!id||!doc)return null;var e=doc.getElementById(id);if(e)return e;var n=doc.getElementsByName(id);if(n&&n.length)return n[0];return null;}function walk(doc,id){var el=find(doc,id);if(el)return el;var fs=doc.getElementsByTagName('iframe');for(var i=0;i<fs.length;i++){try{var d=fs[i].contentDocument||(fs[i].contentWindow&&fs[i].contentWindow.document);if(d){var hit=walk(d,id);if(hit)return hit;}}catch(ex){}}return null;}var el=(cid&&window.__chengCtlById)?window.__chengCtlById(cid):null;if(!el)el=walk(document,id);if(!el)return 'E:noel';try{el.scrollIntoView({block:'center'});}catch(ex){}var tag=el.tagName||'';var proto=tag==='SELECT'?HTMLSelectElement.prototype:tag==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;var desc=Object.getOwnPropertyDescriptor(proto,'value');if(desc&&desc.set)desc.set.call(el,v);else el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';})(%@)",
            arr];
        [self.webView evaluateJavaScript:js completionHandler:done];
        return;
    }
    NSArray* payload = @[field ?: @"", value ?: @""];
    NSData* json = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    if (!json) return;
    NSString* arr = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
    if (arr.length == 0) return;
    NSString* js = [NSString stringWithFormat:
        @"(function(p){var id=p[0],v=p[1];function find(doc,id){if(!id||!doc)return null;var e=doc.getElementById(id);if(e)return e;var n=doc.getElementsByName(id);if(n&&n.length)return n[0];return null;}function walk(doc){var el=find(doc,id);if(el)return el;var fs=doc.getElementsByTagName('iframe');for(var i=0;i<fs.length;i++){try{var d=fs[i].contentDocument||(fs[i].contentWindow&&fs[i].contentWindow.document);if(d){var hit=walk(d);if(hit)return hit;}}catch(ex){}}return null;}var el=walk(document);if(!el)return;var tag=el.tagName||'';var proto=tag==='SELECT'?HTMLSelectElement.prototype:tag==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;var desc=Object.getOwnPropertyDescriptor(proto,'value');if(desc&&desc.set)desc.set.call(el,v);else el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})(%@)",
        arr];
    [self.webView evaluateJavaScript:js completionHandler:done];
}

- (void)handleRightClick:(NSEvent*)event {
    if (cheng_libp2p_browser_right_open() == 0) return;
    NSPoint p = [self.rightCanvas convertPoint:event.locationInWindow fromView:nil];
    NSRect b = self.rightCanvas.bounds;
    int32_t x = (int32_t)p.x;
    int32_t y = (int32_t)(b.size.height - p.y);
    int32_t kind = cheng_libp2p_browser_click(x, y);
    [self rebuildRightDrawList];
    if (kind == 5) {
        [self applyChengSelectValue];
        return;
    }
    NSString* replay = [NSString stringWithFormat:
        @"(function(x,y){var e=document.elementFromPoint(x,y);if(!e)return;var o={bubbles:true,cancelable:true,composed:true,view:window,clientX:x,clientY:y,button:0,buttons:1};try{if(window.PointerEvent)e.dispatchEvent(new PointerEvent('pointerdown',o));}catch(ex){}e.dispatchEvent(new MouseEvent('mousedown',o));if(e.focus)try{e.focus();}catch(ex){}o.buttons=0;try{if(window.PointerEvent)e.dispatchEvent(new PointerEvent('pointerup',o));}catch(ex){}e.dispatchEvent(new MouseEvent('mouseup',o));e.dispatchEvent(new MouseEvent('click',o));})(%d,%d)",
        x, y];
    __weak ChengLibp2pBrowserHost* weakSelf = self;
    [self.webView evaluateJavaScript:replay completionHandler:^(id result, NSError* error) {
        (void)result; (void)error;
        ChengLibp2pBrowserHost* strong = weakSelf;
        if (!strong) return;
        [strong captureRightRefresh:YES];
    }];
}

- (void)handleRightKey:(NSEvent*)event {
    if (cheng_libp2p_browser_right_open() == 0) return;
    NSString* chars = event.characters;
    if (chars.length == 0) return;
    unichar c = [chars characterAtIndex:0];
    int32_t code = 0;
    if (c == NSDeleteCharacter || c == 8) code = 8;
    else if (c >= 32 && c < 127) code = (int32_t)c;
    else return;
    cheng_libp2p_browser_key(code);
    [self rebuildRightDrawList];
    NSString* replay = [NSString stringWithFormat:
        @"(function(code){var el=document.activeElement||document.body;var back=code===8;var key=back?'Backspace':String.fromCharCode(code);var init={key:key,keyCode:code,which:code,bubbles:true,cancelable:true};el.dispatchEvent(new KeyboardEvent('keydown',init));var tag=el.tagName||'';if((tag==='INPUT'||tag==='TEXTAREA')&&!el.readOnly&&!el.disabled){var proto=tag==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;var desc=Object.getOwnPropertyDescriptor(proto,'value');var cur=el.value||'';var next=cur;if(back)next=cur.length?cur.slice(0,-1):cur;else if(code>=32&&code<127)next=cur+String.fromCharCode(code);if(desc&&desc.set)desc.set.call(el,next);else el.value=next;el.dispatchEvent(new Event('input',{bubbles:true}));}el.dispatchEvent(new KeyboardEvent('keyup',init));})(%d)",
        code];
    __weak ChengLibp2pBrowserHost* weakSelf = self;
    [self.webView evaluateJavaScript:replay completionHandler:^(id result, NSError* error) {
        (void)result; (void)error;
        ChengLibp2pBrowserHost* strong = weakSelf;
        if (!strong) return;
        [strong captureRightRefresh:YES];
    }];
}

@end

@implementation ChengCapturePipe
- (void)userContentController:(WKUserContentController*)controller didReceiveScriptMessage:(WKScriptMessage*)message {
    (void)controller;
    ChengLibp2pBrowserHost* host = self.host;
    if (!host) return;
    BOOL refresh = cheng_libp2p_browser_right_open() != 0;
    [host captureRightRefresh:refresh];
    (void)message;
}
@end

int cheng_libp2p_browser_host_main(int argc, const char** argv) {
    @autoreleasepool {
        {
            char buf[4096];
            uint32_t sz = sizeof(buf);
            if (_NSGetExecutablePath(buf, &sz) == 0) {
                gExecPath = strdup(buf);
            } else {
                gExecPath = strdup(argv[0]);
            }
            gSavedArgv = (char**)calloc((size_t)argc + 1, sizeof(char*));
            for (int ai = 0; ai < argc; ai++) gSavedArgv[ai] = strdup(argv[ai]);
        }
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        const char* selfPeer = "desktop-peer";
        cheng_libp2p_browser_init(selfPeer, (int64_t)strlen(selfPeer), 640, 720);

        ChengLibp2pBrowserHost* host = [ChengLibp2pBrowserHost new];
        NSRect frame = NSMakeRect(0, 0, 1280, 800);
        NSUInteger style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                           NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable;
        host.window = [[NSWindow alloc] initWithContentRect:frame styleMask:style
            backing:NSBackingStoreBuffered defer:NO];
        [host.window setTitle:@"Cheng libp2p Browser"];
        [host.window center];
        host.window.delegate = (id)host;

        host.urlField = [[NSTextField alloc] initWithFrame:NSMakeRect(8, 760, 720, 28)];
        host.urlField.placeholderString = @"https://";
        host.goButton = [[NSButton alloc] initWithFrame:NSMakeRect(736, 758, 72, 32)];
        [host.goButton setTitle:@"打开"];
        [host.goButton setBezelStyle:NSBezelStyleRounded];
        [host.goButton setTarget:host];
        [host.goButton setAction:@selector(go:)];
        host.peerField = [[NSTextField alloc] initWithFrame:NSMakeRect(816, 760, 280, 28)];
        host.peerField.placeholderString = @"指定手机节点 peer id";
        NSButton* conn = [[NSButton alloc] initWithFrame:NSMakeRect(1104, 758, 160, 32)];
        [conn setTitle:@"连接并指定"];
        [conn setBezelStyle:NSBezelStyleRounded];
        [conn setTarget:host];
        [conn setAction:@selector(connectPeer:)];

        WKWebViewConfiguration* cfg = [WKWebViewConfiguration new];
        ChengCapturePipe* pipe = [ChengCapturePipe new];
        pipe.host = host;
        [cfg.userContentController addScriptMessageHandler:pipe name:@"chengCapture"];
        host.capturePipe = pipe;
        // 指纹 profile: JSON(seed/ua/platform/languages/tz/webgl/硬件面) →
        // documentStart 注入(全部 frame) + customUserAgent + 每 profile 隔离
        // 数据仓 + 进程 TZ。无 profile 时零开销直通。
        NSString* fpPath = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_FP_PROFILE"];
        NSDictionary* fp = nil;
        if (fpPath.length > 0) {
            NSData* fpData = [NSData dataWithContentsOfFile:fpPath];
            if (fpData) {
                fp = [NSJSONSerialization JSONObjectWithData:fpData options:0 error:nil];
                if (![fp isKindOfClass:[NSDictionary class]]) fp = nil;
            }
        }
        if (fp) {
            host.fpProfile = fp;
            NSData* fpJson = [NSJSONSerialization dataWithJSONObject:fp options:0 error:nil];
            NSString* fpJsonStr = fpJson ? [[NSString alloc] initWithData:fpJson encoding:NSUTF8StringEncoding] : @"{}";
            NSString* inject = [NSString stringWithFormat:
                @"window.__chengFpProfile = %@;\n%@\n", fpJsonStr, [NSString stringWithUTF8String:kChengLibp2pBrowserFpJS]];
            WKUserScript* fpScript = [[WKUserScript alloc] initWithSource:inject
                injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:NO];
            [cfg.userContentController addUserScript:fpScript];
            NSString* tzIana = fp[@"tzIana"];
            if ([tzIana isKindOfClass:[NSString class]] && tzIana.length > 0) setenv("TZ", tzIana.UTF8String, 1);
            // 系统/网络服务代理已翻转: 信号时先恢复原代理再按默认语义终止
            // (不装处理器会让门禁的 kill 失效)。
            NSDictionary* spChk = fp[@"systemProxy"];
            if ([spChk isKindOfClass:[NSDictionary class]]) {
                signal(SIGINT, cheng_sysproxy_restore_on_signal);
                signal(SIGTERM, cheng_sysproxy_restore_on_signal);
            }
            if (@available(macOS 11.0, *)) {
                NSString* dsId = fp[@"dataStoreId"];
                NSUUID* uuid = dsId.length > 0 ? [[NSUUID alloc] initWithUUIDString:dsId] : nil;
                if (uuid) cfg.websiteDataStore = [WKWebsiteDataStore dataStoreForIdentifier:uuid];
            }
            // per-profile 出口(显式 opt-in): systemProxy = {service, web, webPort,
            // secure, securePort, socks, socksPort} — 对称翻转系统网络服务代理,
            // atexit/信号恢复原值。未配置则不触碰系统设置。
            NSDictionary* sp = fp[@"systemProxy"];
            if ([sp isKindOfClass:[NSDictionary class]]) {
                NSString* svc = sp[@"service"];
                if ([svc isKindOfClass:[NSString class]] && svc.length > 0) {
                    NSString* pWeb = [sp[@"web"] isKindOfClass:[NSString class]] ? sp[@"web"] : @"";
                    NSString* pWebPort = [sp[@"webPort"] isKindOfClass:[NSString class]] ? sp[@"webPort"] : @"";
                    NSString* pSec = [sp[@"secure"] isKindOfClass:[NSString class]] ? sp[@"secure"] : @"";
                    NSString* pSecPort = [sp[@"securePort"] isKindOfClass:[NSString class]] ? sp[@"securePort"] : @"";
                    NSString* pSocks = [sp[@"socks"] isKindOfClass:[NSString class]] ? sp[@"socks"] : @"";
                    NSString* pSocksPort = [sp[@"socksPort"] isKindOfClass:[NSString class]] ? sp[@"socksPort"] : @"";
                    int32_t rc2 = cheng_sysproxy_apply(svc.UTF8String,
                        pWeb.UTF8String, pWebPort.UTF8String,
                        pSec.UTF8String, pSecPort.UTF8String,
                        pSocks.UTF8String, pSocksPort.UTF8String);
                    if (rc2 != 0) fprintf(stderr, "[fp] systemProxy apply rc=%d\n", rc2);
                }
            }
        }
        host.webView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 1280, 752) configuration:cfg];
        host.webView.navigationDelegate = host;
        host.webView.UIDelegate = host;
        if (fp) {
            NSString* ua = fp[@"ua"];
            if ([ua isKindOfClass:[NSString class]] && ua.length > 0) host.webView.customUserAgent = ua;
        }
        host.rightCanvas = [[ChengBrowserDrawCanvas alloc] initWithFrame:NSMakeRect(1280, 0, 0, 752)];
        host.rightCanvas.clickTarget = host;
        {
            // read 结果 overlay: 半透明卡片贴右栏顶部, 显示最近一次命中文本行
            NSTextField* ov = [[NSTextField alloc] initWithFrame:NSMakeRect(8, 8, 624, 110)];
            ov.editable = NO;
            ov.bordered = NO;
            ov.bezeled = NO;
            ov.drawsBackground = YES;
            ov.backgroundColor = [NSColor colorWithCalibratedWhite:0.06 alpha:0.88];
            ov.textColor = [NSColor colorWithCalibratedRed:0.55 green:0.95 blue:0.65 alpha:1.0];
            ov.font = [NSFont monospacedSystemFontOfSize:12 weight:NSFontWeightRegular];
            ov.hidden = YES;
            ov.autoresizingMask = NSViewWidthSizable;
            [host.rightCanvas addSubview:ov];
            host.readOverlay = ov;
        }
        {
            // 右栏底部文字指令输入框: 用户直接键入 computer use 指令
            NSTextField* ci = [[NSTextField alloc] initWithFrame:NSMakeRect(8, 8, 524, 26)];
            ci.placeholderString = @"指令: 点击 <名称> | set <名称> <值> | read <关键词> | drag x y dx dy";
            ci.editable = YES;
            ci.bordered = YES;
            ci.target = host;
            ci.action = @selector(runUserCmdAction:);
            // NSTextField 回车触发 action
            [ci.cell setSendsActionOnEndEditing:YES];
            ci.backgroundColor = [NSColor colorWithCalibratedWhite:0.12 alpha:0.92];
            ci.textColor = [NSColor whiteColor];
            ci.font = [NSFont monospacedSystemFontOfSize:13 weight:NSFontWeightRegular];
            [host.rightCanvas addSubview:ci];
            host.cmdInput = ci;
            NSButton* go = [[NSButton alloc] initWithFrame:NSMakeRect(540, 8, 92, 26)];
            go.title = @"执行";
            go.bezelStyle = NSBezelStyleRounded;
            go.target = host;
            go.action = @selector(runUserCmdAction:);
            [host.rightCanvas addSubview:go];
            host.cmdGo = go;
        }
        {
            // 渲染模式: 默认 metal(图形 GPU + 文本叠加层); 失败/显式 cg 回退
            // Metal 后端当前为实验性(viewport 时序/像素验证未收尾):
            // env CHENG_LIBP2P_BROWSER_RENDER=metal 显式开启; 默认 CG 稳定路径
            NSString* rm = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_RENDER"];
            BOOL wantMetal = rm.length > 0 && [rm isEqualToString:@"metal"];
            if (wantMetal) {
                ChengMetalRenderer* mr = [ChengMetalRenderer new];
                if ([mr attachToView:host.rightCanvas]) {
                    host.metalRenderer = mr;
                    host.metalMode = YES;
                    host.rightCanvas.metalMode = YES;
                    ChengTextOverlayView* tov = [[ChengTextOverlayView alloc] initWithFrame:host.rightCanvas.bounds];
                    tov.drawList = host.drawList;
                    [host.rightCanvas addSubview:tov positioned:NSWindowAbove relativeTo:nil];
                    host.textOverlay = tov;
                    fprintf(stderr, "[render] metal gpu pipeline active\n");
                } else {
                    fprintf(stderr, "[render] metal unavailable, fallback to cg\n");
                }
            }
        }
        host.statsLabel = [[NSTextField alloc] initWithFrame:NSMakeRect(640, 724, 640, 28)];
        [host.statsLabel setEditable:NO];
        [host.statsLabel setBezeled:NO];
        [host.statsLabel setDrawsBackground:NO];
        host.statsLabel.hidden = YES;
        host.rightCanvas.hidden = YES;

        NSView* content = host.window.contentView;
        [content addSubview:host.urlField];
        [content addSubview:host.goButton];
        [content addSubview:host.peerField];
        [content addSubview:conn];
        [content addSubview:host.webView];
        [content addSubview:host.rightCanvas];
        [content addSubview:host.statsLabel];
        [host layoutPanes];
        // --- 菜单栏 ---
        NSMenu* mb = [[NSMenu alloc] init];
        NSMenuItem* ai = [[NSMenuItem alloc] init];
        [mb addItem:ai];
        NSMenu* am = [[NSMenu alloc] init];
        [am addItem:[[NSMenuItem alloc] initWithTitle:@"关于" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""]];
        [am addItem:[NSMenuItem separatorItem]];
        [am addItem:[[NSMenuItem alloc] initWithTitle:@"退出" action:@selector(terminate:) keyEquivalent:@"q"]];
        [ai setSubmenu:am];
        NSMenuItem* ei = [[NSMenuItem alloc] init];
        [mb addItem:ei];
        NSMenu* em = [[NSMenu alloc] initWithTitle:@"编辑"];
        [em addItem:[[NSMenuItem alloc] initWithTitle:@"剪切" action:@selector(cut:) keyEquivalent:@"x"]];
        [em addItem:[[NSMenuItem alloc] initWithTitle:@"拷贝" action:@selector(copy:) keyEquivalent:@"c"]];
        [em addItem:[[NSMenuItem alloc] initWithTitle:@"粘贴" action:@selector(paste:) keyEquivalent:@"v"]];
        [em addItem:[[NSMenuItem alloc] initWithTitle:@"全选" action:@selector(selectAll:) keyEquivalent:@"a"]];
        [ei setSubmenu:em];
        NSMenuItem* vi = [[NSMenuItem alloc] init];
        [mb addItem:vi];
        NSMenu* vm = [[NSMenu alloc] initWithTitle:@"显示"];
        [vm addItem:[[NSMenuItem alloc] initWithTitle:@"重新加载" action:@selector(reloadPage) keyEquivalent:@"r"]];
        [vi setSubmenu:vm];
        NSMenuItem* wi = [[NSMenuItem alloc] init];
        [mb addItem:wi];
        NSMenu* wm = [[NSMenu alloc] initWithTitle:@"窗口"];
        [wm addItem:[[NSMenuItem alloc] initWithTitle:@"最小化" action:@selector(performMiniaturize:) keyEquivalent:@"m"]];
        [wi setSubmenu:wm];
        [NSApp setMainMenu:mb];
        [host.window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
        NSString* startUrl = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_START_URL"];
        fprintf(stderr, "[gate] launch: startUrl=%s eventScript=%s\n",
            startUrl.UTF8String ? startUrl.UTF8String : "unset",
            NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_EVENT_SCRIPT"].UTF8String ? "set" : "unset");
        if (startUrl.length > 0) {
            host.urlField.stringValue = startUrl;
            // 登录态导入: cookie JSON 数组([{domain,path,name,value,secure,expiresSeconds?}])
            // 注入 dataStore 后再首载——携带已登录凭证启动, 零验证交互
            NSString* cookieFile = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_COOKIE_FILE"];
            if (cookieFile.length > 0) {
                NSString* ctext = [NSString stringWithContentsOfFile:cookieFile encoding:NSUTF8StringEncoding error:nil];
                NSData* cdata = [ctext dataUsingEncoding:NSUTF8StringEncoding];
                NSArray* cookies = cdata ? [NSJSONSerialization JSONObjectWithData:cdata options:0 error:nil] : nil;
                if ([cookies isKindOfClass:[NSArray class]] && cookies.count > 0) {
                    WKHTTPCookieStore* store = host.webView.configuration.websiteDataStore.httpCookieStore;
                    dispatch_semaphore_t csem = dispatch_semaphore_create(0);
                    int32_t injected = 0;
                    for (NSDictionary* c in cookies) {
                        if (![c isKindOfClass:[NSDictionary class]]) continue;
                        NSString* name = c[@"name"];
                        NSString* value = c[@"value"];
                        NSString* domain = c[@"domain"];
                        NSString* path = c[@"path"] ?: @"/";
                        if (![name isKindOfClass:[NSString class]] || ![value isKindOfClass:[NSString class]] || ![domain isKindOfClass:[NSString class]]) continue;
                        NSMutableDictionary* props = [NSMutableDictionary dictionary];
                        props[NSHTTPCookieName] = name;
                        props[NSHTTPCookieValue] = value;
                        props[NSHTTPCookieDomain] = domain;
                        props[NSHTTPCookiePath] = path;
                        props[NSHTTPCookieSecure] = @"TRUE";
                        NSNumber* exp = [c objectForKey:@"expiresSeconds"];
                        if ([exp isKindOfClass:[NSNumber class]] && exp.doubleValue > 0) {
                            props[NSHTTPCookieExpires] = [NSDate dateWithTimeIntervalSinceNow:exp.doubleValue];
                        } else {
                            props[NSHTTPCookieExpires] = [NSDate dateWithTimeIntervalSinceNow:3600 * 24 * 365];
                        }
                        NSHTTPCookie* ck = [NSHTTPCookie cookieWithProperties:props];
                        if (!ck) continue;
                        [store setCookie:ck completionHandler:^{ dispatch_semaphore_signal(csem); }];
                        dispatch_semaphore_wait(csem, DISPATCH_TIME_FOREVER);
                        injected++;
                    }
                    fprintf(stderr, "[cookie] injected %d cookies\n", injected);
                } else {
                    fprintf(stderr, "[cookie] WARN: cookie file unreadable or empty\n");
                }
            }
            [host go:nil];
            fprintf(stderr, "[gate] go called\n");
        }
        NSString* jsDbg = NSProcessInfo.processInfo.environment[@"CHENG_LIBP2P_BROWSER_JS_DEBUG"];
        if (jsDbg.length > 0) {
            NSString* js = [NSString stringWithContentsOfFile:jsDbg encoding:NSUTF8StringEncoding error:nil];
            if (js.length > 0) {
                __weak ChengLibp2pBrowserHost* wSelf = host;
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(12 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                    ChengLibp2pBrowserHost* s = wSelf;
                    if (!s) return;
                    [s.webView evaluateJavaScript:js completionHandler:^(id r, NSError* e) {
                        fprintf(stderr, "[jsdbg] err=%s result=%s\n",
                            e ? e.localizedDescription.UTF8String : "none",
                            [r isKindOfClass:[NSString class]] ? [(NSString*)r UTF8String] : "nonstring");
                    }];
                });
            }
        }
        [host startEventScript];
        {
            NSDictionary* axopt = @{(__bridge NSString*)kAXTrustedCheckOptionPrompt: @NO};
            BOOL axok = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)axopt);
            fprintf(stderr, "[ax] drag CGEvent accessibility trusted=%s\n", axok ? "YES" : "NO (grant in System Settings -> Privacy -> Accessibility to enable CGEvent drag)");
        }
        [host startRssGuard];
        [NSApp run];
    }
    return 0;
}

int main(int argc, const char** argv) {
    return cheng_libp2p_browser_host_main(argc, argv);
}
