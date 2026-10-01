#ifndef CHENG_DRAWLIST_BRIDGE_H
#define CHENG_DRAWLIST_BRIDGE_H

#include <stdint.h>

typedef enum {
    CHENG_DRAW_CMD_RECT = 1,
    CHENG_DRAW_CMD_BORDER = 2,
    CHENG_DRAW_CMD_TEXT = 3,
    CHENG_DRAW_CMD_IMAGE = 4,
    CHENG_DRAW_CMD_RAWBGRA = 5,
} ChengDrawCmdKind;

typedef struct {
    int32_t kind;       // ChengDrawCmdKind
    int32_t x, y, w, h; // bounds
    int32_t r, g, b, a; // color (0-255)
    int32_t borderWidth;
    int32_t radius;     // corner radius
    const char* text;   // for CHENG_DRAW_CMD_TEXT
    int32_t textLen;
    int32_t fontSize;
    int32_t fontWeight;
    const char* fontFamily;
    int32_t fontFamilyLen;
    int32_t layer;      // z-order
    int32_t opacity;    // 0-255
    int32_t clipX, clipY, clipW, clipH;
    int32_t shadowX, shadowY, shadowBlur;
    int32_t shadowR, shadowG, shadowB, shadowA;
    int32_t textAlign;  // 0=left, 1=center within (x, x+w); others = left
} ChengDrawCmd;

typedef struct {
    ChengDrawCmd* cmds;
    int32_t count;
    int32_t capacity;
} ChengDrawList;

// Lifetime
ChengDrawList* cheng_drawlist_new(int32_t capacity);
void cheng_drawlist_free(ChengDrawList* list);
void cheng_drawlist_init(ChengDrawList* list, int32_t capacity);
void cheng_drawlist_clear(ChengDrawList* list);

// Push commands
void cheng_drawlist_push_rect(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, int32_t g, int32_t b, int32_t a);
void cheng_drawlist_push_round_rect(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, int32_t g, int32_t b, int32_t a, int32_t radius);
void cheng_drawlist_push_border(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, int32_t g, int32_t b, int32_t a, int32_t borderWidth, int32_t radius);
void cheng_drawlist_push_text(ChengDrawList* list, const char* text, int32_t textLen, int32_t x, int32_t y, int32_t fontSize, int32_t r, int32_t g, int32_t b, int32_t a);
void cheng_drawlist_push_text_ex(ChengDrawList* list, const char* text, int32_t textLen, int32_t x, int32_t y, int32_t w, int32_t h, int32_t fontSize, int32_t fontWeight, const char* fontFamily, int32_t fontFamilyLen, int32_t r, int32_t g, int32_t b, int32_t a);
void cheng_drawlist_push_text_ex2(ChengDrawList* list, const char* text, int32_t textLen, int32_t x, int32_t y, int32_t w, int32_t h, int32_t fontSize, int32_t fontWeight, const char* fontFamily, int32_t fontFamilyLen, int32_t r, int32_t g, int32_t b, int32_t a, int32_t textAlign);
void cheng_drawlist_push_image(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h, int32_t opacity, const char* imageData, int32_t imageDataLen);
void cheng_drawlist_push_bgra(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h, void* bgra);
void cheng_drawlist_set_last_clip(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h);
void cheng_drawlist_set_last_shadow(ChengDrawList* list, int32_t x, int32_t y, int32_t blur, int32_t r, int32_t g, int32_t b, int32_t a);

// Query
int32_t cheng_drawlist_count(const ChengDrawList* list);

// Platform render: draws the list to current CGContext
void cheng_drawlist_render_cg(const ChengDrawList* list, void* cgContext, int32_t viewW, int32_t viewH);

// 单条 cmd 渲染(host Metal 模式下仅用其 IMAGE 分支)
void cheng_drawlist_render_one_cg(const ChengDrawList* list, int32_t index, void* cgContext, int32_t viewW, int32_t viewH);

#endif
