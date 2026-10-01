// csg_player --window 探针胶水（边界层）：cocoa_bridge.m 的
// cheng_window_create 只把 NSWindow* 落进内部 static 句柄表，而
// cheng_drawlist_push_image / cheng_drawlist_canvas_set_list 等只有
// 原始指针签名。raw 画布/列表链路因此需要一个返回指针的开窗入口，
// 其余逻辑逐字对齐 cocoa_bridge.m 的 cheng_window_create。
#import <Cocoa/Cocoa.h>

void* csg_window_create_ptr(const char* title, int width, int height) {
    @autoreleasepool {
        NSRect frame = NSMakeRect(0, 0, width, height);
        NSUInteger style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                           NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable;
        NSWindow* win = [[NSWindow alloc] initWithContentRect:frame
            styleMask:style backing:NSBackingStoreBuffered defer:NO];
        [win setTitle:[NSString stringWithUTF8String:title]];
        [win center];
        return (__bridge_retained void*)win;
    }
}

void csg_window_show_ptr(void* winPtr) {
    NSWindow* win = (__bridge NSWindow*)winPtr;
    [win makeKeyAndOrderFront:nil];
}

void csg_window_close_ptr(void* winPtr) {
    NSWindow* win = CFBridgingRelease(winPtr);
    [win close];
}
