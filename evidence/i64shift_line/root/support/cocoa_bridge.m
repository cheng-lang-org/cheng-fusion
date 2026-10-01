#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>
#include <unistd.h>
#include <string.h>
#include "drawlist_bridge.h"

void cheng_app_init(void) {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    [NSApp finishLaunching];
}

void cheng_app_run(void) {
    [NSApp activateIgnoringOtherApps:YES];
    [NSApp run];
}

void cheng_app_terminate(void) {
    [NSApp terminate:nil];
}

#define CHENG_UI_MAX_HANDLES 256
static void* cheng_ui_handle_table[CHENG_UI_MAX_HANDLES];
static int cheng_ui_handle_count = 1;

static int cheng_ui_alloc(void* ptr) {
    if (cheng_ui_handle_count >= CHENG_UI_MAX_HANDLES) return 0;
    int id = cheng_ui_handle_count++;
    cheng_ui_handle_table[id] = ptr;
    return id;
}

static void* cheng_ui_get(int id) {
    if (id <= 0 || id >= CHENG_UI_MAX_HANDLES) return NULL;
    return cheng_ui_handle_table[id];
}

static void cheng_ui_free(int id) {
    if (id > 0 && id < CHENG_UI_MAX_HANDLES) {
        cheng_ui_handle_table[id] = NULL;
    }
}

int cheng_window_create(const char* title, int width, int height) {
    @autoreleasepool {
        NSRect frame = NSMakeRect(0, 0, width, height);
        NSUInteger style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                           NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable;
        NSWindow* win = [[NSWindow alloc] initWithContentRect:frame
            styleMask:style backing:NSBackingStoreBuffered defer:NO];
        [win setTitle:[NSString stringWithUTF8String:title]];
        [win center];
        return cheng_ui_alloc((__bridge_retained void*)win);
    }
}

void cheng_window_show(int win) {
    NSWindow* nsWin = (__bridge NSWindow*)cheng_ui_get(win);
    [nsWin makeKeyAndOrderFront:nil];
}

void cheng_window_close(int win) {
    NSWindow* nsWin = CFBridgingRelease(cheng_ui_get(win));
    [nsWin close];
    cheng_ui_free(win);
}

void cheng_window_set_title(int win, const char* title) {
    NSWindow* nsWin = (__bridge NSWindow*)cheng_ui_get(win);
    [nsWin setTitle:[NSString stringWithUTF8String:title]];
}

void cheng_log(const char* msg) {
    NSLog(@"%s", msg);
}

int cheng_poll_event(void) {
    NSEvent* event = [NSApp nextEventMatchingMask:NSEventMaskAny
        untilDate:[NSDate distantPast] inMode:NSDefaultRunLoopMode dequeue:YES];
    if (!event) return 0; // EVENT_NONE
    [NSApp sendEvent:event];
    if ([event type] == NSEventTypeApplicationDefined) return 0;
    return (int)[event type];
}

// --- Event Queue (ring buffer) ---
#define CHENG_EVENT_QUEUE_SIZE 64

typedef struct {
    int32_t type;    // 0=none, 1=quit, 2=key, 3=click, 4=resize, 5=mouseMove
    int32_t x, y;    // mouse position or resize dimensions
    int32_t keyCode;
    int32_t width, height; // for resize events
} ChengEvent;

static ChengEvent cheng_event_queue[CHENG_EVENT_QUEUE_SIZE];
static int cheng_event_read = 0;
static int cheng_event_write = 0;
static int cheng_event_count = 0;

// Push event into the ring buffer
static void cheng_event_push(ChengEvent ev) {
    if (cheng_event_count >= CHENG_EVENT_QUEUE_SIZE) return; // queue full
    cheng_event_queue[cheng_event_write] = ev;
    cheng_event_write = (cheng_event_write + 1) % CHENG_EVENT_QUEUE_SIZE;
    cheng_event_count++;
}

// --- Next event accessors (read without consuming) ---

int32_t cheng_next_event_type(void) {
    if (cheng_event_count <= 0) return 0;
    return cheng_event_queue[cheng_event_read].type;
}

int32_t cheng_next_event_x(void) {
    if (cheng_event_count <= 0) return 0;
    return cheng_event_queue[cheng_event_read].x;
}

int32_t cheng_next_event_y(void) {
    if (cheng_event_count <= 0) return 0;
    return cheng_event_queue[cheng_event_read].y;
}

int32_t cheng_next_event_key(void) {
    if (cheng_event_count <= 0) return 0;
    return cheng_event_queue[cheng_event_read].keyCode;
}

int32_t cheng_next_event_width(void) {
    if (cheng_event_count <= 0) return 0;
    return cheng_event_queue[cheng_event_read].width;
}

int32_t cheng_next_event_height(void) {
    if (cheng_event_count <= 0) return 0;
    return cheng_event_queue[cheng_event_read].height;
}

void cheng_event_consume(void) {
    if (cheng_event_count <= 0) return;
    cheng_event_read = (cheng_event_read + 1) % CHENG_EVENT_QUEUE_SIZE;
    cheng_event_count--;
}

// Frame-based run: process one frame of system events into our queue, then return
void cheng_app_run_frame(void) {
    // Process all pending system events into our queue
    while (1) {
        NSEvent* event = [NSApp nextEventMatchingMask:NSEventMaskAny
            untilDate:[NSDate distantPast] inMode:NSDefaultRunLoopMode dequeue:YES];
        if (!event) break;
        [NSApp sendEvent:event];

        ChengEvent cev;
        memset(&cev, 0, sizeof(cev));
        NSEventType et = [event type];

        if (et == NSEventTypeLeftMouseDown || et == NSEventTypeRightMouseDown) {
            cev.type = 3; // EVENT_CLICK
            cev.x = (int32_t)[event locationInWindow].x;
            cev.y = (int32_t)[event locationInWindow].y;
            cheng_event_push(cev);
        } else if (et == NSEventTypeKeyDown) {
            cev.type = 2; // EVENT_KEY
            cev.keyCode = (int32_t)[event keyCode];
            cheng_event_push(cev);
        } else if (et == NSEventTypeMouseMoved || et == NSEventTypeLeftMouseDragged) {
            cev.type = 5; // EVENT_MOUSE_MOVE
            cev.x = (int32_t)[event locationInWindow].x;
            cev.y = (int32_t)[event locationInWindow].y;
            cheng_event_push(cev);
        }
    }
    // NOTE: no synthetic EVENT_QUIT here — manual-pump mode never enters
    // [NSApp run], so isRunning is permanently NO and a per-frame QUIT
    // would fire on every frame. Real termination surfaces as the window
    // closing (handled by the host loop) or an explicit Quit menu item.
}

// --- Button ---
void* cheng_button_create(const char* title, int x, int y, int w, int h) {
    NSRect frame = NSMakeRect(x, y, w, h);
    NSButton* btn = [[NSButton alloc] initWithFrame:frame];
    [btn setTitle:[NSString stringWithUTF8String:title]];
    [btn setBezelStyle:NSBezelStyleRounded];
    return (__bridge_retained void*)btn;
}

void cheng_button_set_action(void* btnPtr, void (*callback)(void*), void* ctx) {
    // stub: callback mechanism needs ObjC block/target-action, not yet implemented
    (void)btnPtr; (void)callback; (void)ctx;
}

int cheng_button_create_handle(const char* title, int x, int y, int w, int h) {
    return cheng_ui_alloc(cheng_button_create(title, x, y, w, h));
}

// --- Label ---
void* cheng_label_create(const char* text, int x, int y, int w, int h) {
    NSRect frame = NSMakeRect(x, y, w, h);
    NSTextField* label = [[NSTextField alloc] initWithFrame:frame];
    [label setStringValue:[NSString stringWithUTF8String:text]];
    [label setBezeled:NO];
    [label setDrawsBackground:NO];
    [label setEditable:NO];
    [label setSelectable:NO];
    return (__bridge_retained void*)label;
}

void cheng_label_set_text(void* labelPtr, const char* text) {
    NSTextField* label = (__bridge NSTextField*)labelPtr;
    [label setStringValue:[NSString stringWithUTF8String:text]];
}

int cheng_label_create_handle(const char* text, int x, int y, int w, int h) {
    return cheng_ui_alloc(cheng_label_create(text, x, y, w, h));
}

void cheng_label_set_text_handle(int label, const char* text) {
    void* labelPtr = cheng_ui_get(label);
    if (!labelPtr) return;
    cheng_label_set_text(labelPtr, text);
}

// --- View attachment (add subview to window's contentView) ---
void cheng_window_add_view(void* winPtr, void* viewPtr) {
    NSWindow* win = (__bridge NSWindow*)winPtr;
    NSView* view = (__bridge NSView*)viewPtr;
    [[win contentView] addSubview:view];
}

void cheng_window_add_view_handle(int win, int view) {
    void* winPtr = cheng_ui_get(win);
    void* viewPtr = cheng_ui_get(view);
    if (!winPtr || !viewPtr) return;
    cheng_window_add_view(winPtr, viewPtr);
}

// --- Timer ---
static int cheng_timer_counter = 0;

int cheng_timer_tick(void) {
    // Returns incrementing tick count for frame-based timing
    return ++cheng_timer_counter;
}

void cheng_sleep_ms(int ms) {
    usleep(ms * 1000);
}

// --- Canvas / Custom View ---
// Simple colored rectangle drawing via NSView subclass
@interface ChengCanvasView : NSView
@property (nonatomic, assign) int fillR;
@property (nonatomic, assign) int fillG;
@property (nonatomic, assign) int fillB;
@end

@implementation ChengCanvasView
- (void)drawRect:(NSRect)dirtyRect {
    [[NSColor colorWithCalibratedRed:self.fillR/255.0
                               green:self.fillG/255.0
                                blue:self.fillB/255.0 alpha:1.0] setFill];
    NSRectFill(self.bounds);
}
@end

void* cheng_canvas_create(int x, int y, int w, int h) {
    NSRect frame = NSMakeRect(x, y, w, h);
    ChengCanvasView* canvas = [[ChengCanvasView alloc] initWithFrame:frame];
    canvas.fillR = 255; canvas.fillG = 255; canvas.fillB = 255;
    return (__bridge_retained void*)canvas;
}

void cheng_canvas_set_color(void* canvasPtr, int r, int g, int b) {
    ChengCanvasView* canvas = (__bridge ChengCanvasView*)canvasPtr;
    canvas.fillR = r; canvas.fillG = g; canvas.fillB = b;
    [canvas setNeedsDisplay:YES];
}

int cheng_canvas_create_handle(int x, int y, int w, int h) {
    return cheng_ui_alloc(cheng_canvas_create(x, y, w, h));
}

void cheng_canvas_set_color_handle(int canvas, int r, int g, int b) {
    void* canvasPtr = cheng_ui_get(canvas);
    if (!canvasPtr) return;
    cheng_canvas_set_color(canvasPtr, r, g, b);
}

// --- DrawList-backed Canvas ---
@interface ChengDrawListCanvas : NSView
@property (nonatomic, assign) ChengDrawList* drawList;
@end

@implementation ChengDrawListCanvas
- (void)drawRect:(NSRect)dirtyRect {
    if (self.drawList && self.drawList->count > 0) {
        CGContextRef ctx = [[NSGraphicsContext currentContext] CGContext];
        cheng_drawlist_render_cg(self.drawList, ctx, (int32_t)self.bounds.size.width, (int32_t)self.bounds.size.height);
    }
}
@end

void* cheng_drawlist_canvas_create(int x, int y, int w, int h) {
    NSRect frame = NSMakeRect(x, y, w, h);
    ChengDrawListCanvas* canvas = [[ChengDrawListCanvas alloc] initWithFrame:frame];
    return (__bridge_retained void*)canvas;
}

void cheng_drawlist_canvas_set_list(void* canvasPtr, void* listPtr) {
    ChengDrawListCanvas* canvas = (__bridge ChengDrawListCanvas*)canvasPtr;
    canvas.drawList = (ChengDrawList*)listPtr;
    [canvas setNeedsDisplay:YES];
}

void cheng_view_release(void* viewPtr) {
    CFBridgingRelease(viewPtr);
}

int cheng_drawlist_canvas_create_handle(int x, int y, int w, int h) {
    return cheng_ui_alloc(cheng_drawlist_canvas_create(x, y, w, h));
}

void cheng_drawlist_canvas_set_list_handle(int canvas, int list) {
    void* canvasPtr = cheng_ui_get(canvas);
    void* listPtr = cheng_ui_get(list);
    if (!canvasPtr || !listPtr) return;
    cheng_drawlist_canvas_set_list(canvasPtr, listPtr);
}

void cheng_view_release_handle(int view) {
    void* viewPtr = cheng_ui_get(view);
    if (!viewPtr) return;
    cheng_view_release(viewPtr);
    cheng_ui_free(view);
}

int cheng_drawlist_new_handle(int32_t capacity) {
    return cheng_ui_alloc(cheng_drawlist_new(capacity));
}

void cheng_drawlist_free_handle(int list) {
    ChengDrawList* listPtr = (ChengDrawList*)cheng_ui_get(list);
    if (!listPtr) return;
    cheng_drawlist_free(listPtr);
    cheng_ui_free(list);
}

void cheng_drawlist_clear_handle(int list) {
    ChengDrawList* listPtr = (ChengDrawList*)cheng_ui_get(list);
    cheng_drawlist_clear(listPtr);
}

int32_t cheng_drawlist_count_handle(int list) {
    ChengDrawList* listPtr = (ChengDrawList*)cheng_ui_get(list);
    return cheng_drawlist_count(listPtr);
}

void cheng_drawlist_push_rect_handle(int list, int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, int32_t g, int32_t b, int32_t a) {
    ChengDrawList* listPtr = (ChengDrawList*)cheng_ui_get(list);
    cheng_drawlist_push_rect(listPtr, x, y, w, h, r, g, b, a);
}

void cheng_drawlist_push_border_handle(int list, int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, int32_t g, int32_t b, int32_t a, int32_t borderWidth, int32_t radius) {
    ChengDrawList* listPtr = (ChengDrawList*)cheng_ui_get(list);
    cheng_drawlist_push_border(listPtr, x, y, w, h, r, g, b, a, borderWidth, radius);
}

void cheng_drawlist_push_text_handle(int list, const char* text, int32_t textLen, int32_t x, int32_t y, int32_t fontSize, int32_t r, int32_t g, int32_t b, int32_t a) {
    ChengDrawList* listPtr = (ChengDrawList*)cheng_ui_get(list);
    cheng_drawlist_push_text(listPtr, text, textLen, x, y, fontSize, r, g, b, a);
}

// --- Cocoa-specific additional bindings ---

void cheng_cocoa_window_set_title(void* winPtr, const char* title) {
    NSWindow* win = (__bridge NSWindow*)winPtr;
    [win setTitle:[NSString stringWithUTF8String:title]];
}

int32_t cheng_cocoa_window_frame_x(void* winPtr) {
    NSWindow* win = (__bridge NSWindow*)winPtr;
    return (int32_t)[win frame].origin.x;
}

int32_t cheng_cocoa_window_frame_y(void* winPtr) {
    NSWindow* win = (__bridge NSWindow*)winPtr;
    return (int32_t)[win frame].origin.y;
}

int32_t cheng_cocoa_window_frame_width(void* winPtr) {
    NSWindow* win = (__bridge NSWindow*)winPtr;
    return (int32_t)[win frame].size.width;
}

int32_t cheng_cocoa_window_frame_height(void* winPtr) {
    NSWindow* win = (__bridge NSWindow*)winPtr;
    return (int32_t)[win frame].size.height;
}

void cheng_cocoa_run_loop(void) {
    [NSApp activateIgnoringOtherApps:YES];
    [NSApp run];
}

// Runtime event bridge stubs (required by cheng runtime)
void cheng_native_runtime_event_lock_bridge(void) { }
void cheng_native_runtime_event_unlock_bridge(void) { }
void cheng_native_runtime_event_assert_owner_bridge(void) { }
