#include "drawlist_bridge.h"
#include <stdlib.h>
#include <string.h>
#include <CoreText/CoreText.h>
#include <CoreGraphics/CoreGraphics.h>
#import <Cocoa/Cocoa.h>
#import <ImageIO/ImageIO.h>

// -- 图片解码缓存 --
// 每帧对每图重新 base64->NSImage 全量解码会把 phys_footprint 推到数 GB
// (淘宝级页面实证); 按内容哈希缓存 CGImage, 位图预算+条目双上限 LRU。
// 渲染只在主线程, 无锁。
typedef struct ImgCacheEntry {
    uint64_t hash;
    int32_t len;
    CGImageRef image;
    uint64_t bitmapBytes;
    uint64_t lastUse;
    struct ImgCacheEntry* next;
} ImgCacheEntry;

static ImgCacheEntry* g_imgCache = NULL;
static uint64_t g_imgCacheUse = 0;
static int32_t g_imgCacheCount = 0;
static uint64_t g_imgCacheBytes = 0;

#define IMG_CACHE_MAX_ENTRIES 96
#define IMG_CACHE_MAX_BYTES (256ULL * 1024 * 1024)

static uint64_t cheng_img_fnv(const char* data, int32_t len) {
    uint64_t h = 1469598103934665603ULL;
    for (int32_t i = 0; i < len; i++) {
        h ^= (unsigned char)data[i];
        h *= 1099511628211ULL;
    }
    return h;
}

static void cheng_img_cache_put(uint64_t hash, int32_t len, CGImageRef image) {
    uint64_t w = (uint64_t)CGImageGetWidth(image);
    uint64_t h = (uint64_t)CGImageGetHeight(image);
    uint64_t bytes = w * h * 4;
    // 同位图预算淘汰最旧(链表尾), 条目超限同样
    while ((g_imgCacheBytes + bytes > IMG_CACHE_MAX_BYTES || g_imgCacheCount >= IMG_CACHE_MAX_ENTRIES) && g_imgCache) {
        ImgCacheEntry** prev = &g_imgCache;
        ImgCacheEntry* oldest = g_imgCache;
        for (ImgCacheEntry* e = g_imgCache; e; e = e->next) {
            if (e->lastUse <= oldest->lastUse) { oldest = e; }
        }
        for (prev = &g_imgCache; *prev && *prev != oldest; prev = &(*prev)->next) {}
        if (!*prev) break;
        *prev = oldest->next;
        g_imgCacheBytes -= oldest->bitmapBytes;
        g_imgCacheCount--;
        CGImageRelease(oldest->image);
        free(oldest);
    }
    ImgCacheEntry* e = (ImgCacheEntry*)malloc(sizeof(ImgCacheEntry));
    e->hash = hash;
    e->len = len;
    e->image = image;  // 接管引用
    e->bitmapBytes = bytes;
    e->lastUse = ++g_imgCacheUse;
    e->next = g_imgCache;
    g_imgCache = e;
    g_imgCacheBytes += bytes;
    g_imgCacheCount++;
}

static CGImageRef cheng_img_cache_get(const char* data, int32_t len) {
    uint64_t hash = cheng_img_fnv(data, len);
    for (ImgCacheEntry* e = g_imgCache; e; e = e->next) {
        if (e->hash == hash && e->len == len) {
            e->lastUse = ++g_imgCacheUse;
            return e->image;
        }
    }
    return NULL;
}

// -- lifetime --

ChengDrawList* cheng_drawlist_new(int32_t capacity) {
    ChengDrawList* list = (ChengDrawList*)calloc(1, sizeof(ChengDrawList));
    cheng_drawlist_init(list, capacity);
    return list;
}

void cheng_drawlist_free(ChengDrawList* list) {
    if (!list) return;
    free(list->cmds);
    free(list);
}

void cheng_drawlist_init(ChengDrawList* list, int32_t capacity) {
    if (!list) return;
    if (capacity < 1) capacity = 1;
    list->cmds = (ChengDrawCmd*)calloc((size_t)capacity, sizeof(ChengDrawCmd));
    list->capacity = capacity;
    list->count = 0;
}

void cheng_drawlist_clear(ChengDrawList* list) {
    if (list) list->count = 0;
}

int32_t cheng_drawlist_count(const ChengDrawList* list) {
    return list ? list->count : 0;
}

// -- push commands --

void cheng_drawlist_push_rect(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, int32_t g, int32_t b, int32_t a) {
    if (!list || list->count >= list->capacity) return;
    ChengDrawCmd* cmd = &list->cmds[list->count++];
    memset(cmd, 0, sizeof(*cmd));
    cmd->kind = CHENG_DRAW_CMD_RECT;
    cmd->x = x; cmd->y = y; cmd->w = w; cmd->h = h;
    cmd->r = r; cmd->g = g; cmd->b = b; cmd->a = a;
}

void cheng_drawlist_push_round_rect(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, int32_t g, int32_t b, int32_t a, int32_t radius) {
    if (!list || list->count >= list->capacity) return;
    ChengDrawCmd* cmd = &list->cmds[list->count++];
    memset(cmd, 0, sizeof(*cmd));
    cmd->kind = CHENG_DRAW_CMD_RECT;
    cmd->x = x; cmd->y = y; cmd->w = w; cmd->h = h;
    cmd->r = r; cmd->g = g; cmd->b = b; cmd->a = a;
    cmd->radius = radius;
}

void cheng_drawlist_push_border(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h, int32_t r, int32_t g, int32_t b, int32_t a, int32_t borderWidth, int32_t radius) {
    if (!list || list->count >= list->capacity) return;
    ChengDrawCmd* cmd = &list->cmds[list->count++];
    memset(cmd, 0, sizeof(*cmd));
    cmd->kind = CHENG_DRAW_CMD_BORDER;
    cmd->x = x; cmd->y = y; cmd->w = w; cmd->h = h;
    cmd->r = r; cmd->g = g; cmd->b = b; cmd->a = a;
    cmd->borderWidth = borderWidth;
    cmd->radius = radius;
}

void cheng_drawlist_push_text(ChengDrawList* list, const char* text, int32_t textLen, int32_t x, int32_t y, int32_t fontSize, int32_t r, int32_t g, int32_t b, int32_t a) {
    cheng_drawlist_push_text_ex(list, text, textLen, x, y, 0, 0, fontSize, 400, NULL, 0, r, g, b, a);
}

void cheng_drawlist_push_text_ex(ChengDrawList* list, const char* text, int32_t textLen, int32_t x, int32_t y, int32_t w, int32_t h, int32_t fontSize, int32_t fontWeight, const char* fontFamily, int32_t fontFamilyLen, int32_t r, int32_t g, int32_t b, int32_t a) {
    cheng_drawlist_push_text_ex2(list, text, textLen, x, y, w, h, fontSize, fontWeight, fontFamily, fontFamilyLen, r, g, b, a, 0);
}

void cheng_drawlist_push_text_ex2(ChengDrawList* list, const char* text, int32_t textLen, int32_t x, int32_t y, int32_t w, int32_t h, int32_t fontSize, int32_t fontWeight, const char* fontFamily, int32_t fontFamilyLen, int32_t r, int32_t g, int32_t b, int32_t a, int32_t textAlign) {
    if (!list || list->count >= list->capacity) return;
    ChengDrawCmd* cmd = &list->cmds[list->count++];
    memset(cmd, 0, sizeof(*cmd));
    cmd->kind = CHENG_DRAW_CMD_TEXT;
    cmd->x = x; cmd->y = y; cmd->w = w; cmd->h = h;
    cmd->r = r; cmd->g = g; cmd->b = b; cmd->a = a;
    cmd->text = text;
    cmd->textLen = textLen;
    cmd->fontSize = fontSize;
    cmd->fontWeight = fontWeight;
    cmd->fontFamily = fontFamily;
    cmd->fontFamilyLen = fontFamilyLen;
    cmd->textAlign = textAlign;
}

void cheng_drawlist_set_last_clip(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h) {
    if (!list || list->count <= 0) return;
    ChengDrawCmd* cmd = &list->cmds[list->count - 1];
    cmd->clipX = x; cmd->clipY = y; cmd->clipW = w; cmd->clipH = h;
}

void cheng_drawlist_set_last_shadow(ChengDrawList* list, int32_t x, int32_t y, int32_t blur, int32_t r, int32_t g, int32_t b, int32_t a) {
    if (!list || list->count <= 0) return;
    ChengDrawCmd* cmd = &list->cmds[list->count - 1];
    cmd->shadowX = x; cmd->shadowY = y; cmd->shadowBlur = blur;
    cmd->shadowR = r; cmd->shadowG = g; cmd->shadowB = b; cmd->shadowA = a;
}

void cheng_drawlist_push_bgra(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h, void* bgra) {
    if (!list || list->count >= list->capacity) return;
    ChengDrawCmd* cmd = &list->cmds[list->count++];
    memset(cmd, 0, sizeof(*cmd));
    cmd->kind = CHENG_DRAW_CMD_RAWBGRA;
    cmd->x = x; cmd->y = y; cmd->w = w; cmd->h = h;
    cmd->text = bgra;
    cmd->textLen = w * h * 4;
}

void cheng_drawlist_push_image(ChengDrawList* list, int32_t x, int32_t y, int32_t w, int32_t h, int32_t opacity, const char* imageData, int32_t imageDataLen) {
    if (!list || list->count >= list->capacity) return;
    ChengDrawCmd* cmd = &list->cmds[list->count++];
    memset(cmd, 0, sizeof(*cmd));
    cmd->kind = CHENG_DRAW_CMD_IMAGE;
    cmd->x = x; cmd->y = y; cmd->w = w; cmd->h = h;
    cmd->opacity = opacity;
    cmd->text = imageData;
    cmd->textLen = imageDataLen;
}

// -- render (CoreGraphics) --

static void cheng_drawlist_apply_clip_shadow(CGContextRef ctx, const ChengDrawCmd* cmd, int32_t viewH) {
    if (cmd->clipW > 0 && cmd->clipH > 0) {
        CGRect c = CGRectMake(cmd->clipX, viewH - cmd->clipY - cmd->clipH, cmd->clipW, cmd->clipH);
        CGContextClipToRect(ctx, c);
    }
    if (cmd->shadowA > 0 && (cmd->shadowBlur > 0 || cmd->shadowX != 0 || cmd->shadowY != 0)) {
        CGColorSpaceRef cs = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
        CGFloat comp[] = {cmd->shadowR / 255.0, cmd->shadowG / 255.0, cmd->shadowB / 255.0, cmd->shadowA / 255.0};
        CGColorRef col = CGColorCreate(cs, comp);
        CGContextSetShadowWithColor(ctx, CGSizeMake((CGFloat)cmd->shadowX, (CGFloat)(-cmd->shadowY)), (CGFloat)cmd->shadowBlur, col);
        CGColorRelease(col);
        CGColorSpaceRelease(cs);
    }
}

// -- 字体缓存 --
// resize/重绘每帧对每个文本 op 重新 CTFontCreateWithName+family 校验,
// CoreText 内部对象累积; 按(尺寸,粗细,家族列表)缓存 CTFont, LRU 128 项。
typedef struct FontCacheEntry {
    uint64_t hash;
    CTFontRef font;
    uint64_t lastUse;
    struct FontCacheEntry* next;
} FontCacheEntry;

static FontCacheEntry* g_fontCache = NULL;
static uint64_t g_fontCacheUse = 0;
static int32_t g_fontCacheCount = 0;

static uint64_t cheng_font_fnv(const char* key) {
    uint64_t h = 1469598103934665603ULL;
    for (const char* p = key; *p; p++) {
        h ^= (unsigned char)*p;
        h *= 1099511628211ULL;
    }
    return h;
}

static CTFontRef cheng_font_cache_get(const char* key) {
    uint64_t hash = cheng_font_fnv(key);
    for (FontCacheEntry* e = g_fontCache; e; e = e->next) {
        if (e->hash == hash) {
            e->lastUse = ++g_fontCacheUse;
            return e->font;
        }
    }
    return NULL;
}

static void cheng_font_cache_put(const char* key, CTFontRef font) {
    while (g_fontCacheCount >= 128 && g_fontCache) {
        FontCacheEntry** prev = &g_fontCache;
        FontCacheEntry* oldest = g_fontCache;
        for (FontCacheEntry* e = g_fontCache; e; e = e->next) {
            if (e->lastUse <= oldest->lastUse) oldest = e;
        }
        for (prev = &g_fontCache; *prev && *prev != oldest; prev = &(*prev)->next) {}
        if (!*prev) break;
        *prev = oldest->next;
        g_fontCacheCount--;
        CFRelease(oldest->font);
        free(oldest);
    }
    FontCacheEntry* e = (FontCacheEntry*)malloc(sizeof(FontCacheEntry));
    e->hash = cheng_font_fnv(key);
    e->font = font;
    CFRetain(font);  // 缓存自持 +1(调用方对返回值另有 +1, 各自释放)
    e->lastUse = ++g_fontCacheUse;
    e->next = g_fontCache;
    g_fontCache = e;
    g_fontCacheCount++;
}

static CTFontRef cheng_drawlist_make_font(const ChengDrawCmd* cmd) {
    CGFloat size = cmd->fontSize > 0 ? (CGFloat)cmd->fontSize : 14.0;
    char fontKey[512];
    snprintf(fontKey, sizeof(fontKey), "%d|%d|%.*s", (int)size, (int)cmd->fontWeight,
             cmd->fontFamilyLen > 200 ? 200 : cmd->fontFamilyLen, cmd->fontFamily ? cmd->fontFamily : "");
    CTFontRef cachedFont = cheng_font_cache_get(fontKey);
    if (cachedFont) { CFRetain(cachedFont); return cachedFont; }
    CTFontRef font = NULL;
    if (cmd->fontFamily && cmd->fontFamilyLen > 0) {
        // CLB 传整条 CSS 字体列表('|' 分隔): 逐个 CTFontCreateWithName 并校验
        // family 名真实命中(不命中时 CoreText 静默退默认, 与 CSS 回落链不符),
        // 首个真实命中的生效; 通用关键字映射系统语义字体。
        NSMutableData* nameBuf = [NSMutableData dataWithLength:(NSUInteger)cmd->fontFamilyLen + 1];
        memcpy(nameBuf.mutableBytes, cmd->fontFamily, (NSUInteger)cmd->fontFamilyLen);
        NSString* list = [[NSString alloc] initWithData:nameBuf encoding:NSUTF8StringEncoding];
        for (NSString* raw in [list componentsSeparatedByString:@"|"]) {
            NSString* fam = [[raw stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]] stringByReplacingOccurrencesOfString:@"\u00a0" withString:@" "];
            if (fam.length == 0) continue;
            CTFontRef candidate = NULL;
            if ([fam caseInsensitiveCompare:@"sans-serif"] == NSOrderedSame) {
                candidate = CTFontCreateUIFontForLanguage(kCTFontUIFontSystem, size, NULL);
            } else if ([fam caseInsensitiveCompare:@"serif"] == NSOrderedSame) {
                candidate = CTFontCreateWithName(CFSTR("Times New Roman"), size, NULL);
            } else if ([fam caseInsensitiveCompare:@"monospace"] == NSOrderedSame) {
                candidate = CTFontCreateWithName(CFSTR("Courier New"), size, NULL);
            } else {
                candidate = CTFontCreateWithName((CFStringRef)fam, size, NULL);
                CFStringRef familyName = CTFontCopyFamilyName(candidate);
                NSString* familyNs = (__bridge NSString*)familyName;
                BOOL matched = [familyNs compare:fam options:NSCaseInsensitiveSearch] == NSOrderedSame;
                CFRelease(familyName);
                if (!matched) { CFRelease(candidate); candidate = NULL; }
            }
            if (candidate) { font = candidate; break; }
        }
    }
    if (!font) font = CTFontCreateUIFontForLanguage(kCTFontUIFontSystem, size, NULL);
    if (font && cmd->fontWeight >= 600) {
        CTFontRef bold = CTFontCreateCopyWithSymbolicTraits(font, size, NULL, kCTFontBoldTrait, kCTFontBoldTrait);
        if (bold) {
            CFRelease(font);
            font = bold;
        }
    }
    // 缓存已含 symbolic traits 调整后的字体(键含权重), 此处直接接管
    if (font) cheng_font_cache_put(fontKey, font);
    return font;
}

void cheng_drawlist_render_one_cg(const ChengDrawList* list, int32_t index, void* cgContext, int32_t viewW, int32_t viewH) {
    if (!list || index < 0 || index >= list->count) return;
    ChengDrawList one;
    one.cmds = (ChengDrawCmd*)&list->cmds[index];
    one.count = 1;
    one.capacity = 1;
    cheng_drawlist_render_cg(&one, cgContext, viewW, viewH);
}

void cheng_drawlist_render_cg(const ChengDrawList* list, void* cgContext, int32_t viewW, int32_t viewH) {
    CGContextRef ctx = (CGContextRef)cgContext;
    if (!ctx || !list) return;
    (void)viewW;
    CGContextSaveGState(ctx);
    for (int32_t i = 0; i < list->count; i++) {
        const ChengDrawCmd* cmd = &list->cmds[i];
        CGFloat r = cmd->r / 255.0;
        CGFloat g = cmd->g / 255.0;
        CGFloat b = cmd->b / 255.0;
        CGFloat a = cmd->a / 255.0;
        CGRect rect = CGRectMake(cmd->x, viewH - cmd->y - cmd->h, cmd->w, cmd->h);
        CGContextSaveGState(ctx);
        cheng_drawlist_apply_clip_shadow(ctx, cmd, viewH);
        CGContextSetRGBFillColor(ctx, r, g, b, a);
        CGContextSetRGBStrokeColor(ctx, r, g, b, a);
        switch (cmd->kind) {
            case CHENG_DRAW_CMD_RECT:
                if (cmd->radius > 0) {
                    CGFloat r2 = cmd->radius;
                    CGFloat minDim = rect.size.width < rect.size.height ? rect.size.width : rect.size.height;
                    if (r2 > minDim / 2) r2 = minDim / 2;
                    CGPathRef path = CGPathCreateWithRoundedRect(rect, r2, r2, NULL);
                    CGContextAddPath(ctx, path);
                    CGPathRelease(path);
                    CGContextFillPath(ctx);
                } else {
                    CGContextFillRect(ctx, rect);
                }
                break;
            case CHENG_DRAW_CMD_BORDER:
                if (cmd->radius > 0) {
                    CGFloat r2 = cmd->radius;
                    CGFloat minDim = rect.size.width < rect.size.height ? rect.size.width : rect.size.height;
                    if (r2 > minDim/2) r2 = minDim/2;
                    CGPathRef path = CGPathCreateWithRoundedRect(rect, r2, r2, NULL);
                    CGContextAddPath(ctx, path);
                    CGPathRelease(path);
                } else {
                    CGContextAddRect(ctx, rect);
                }
                CGContextSetLineWidth(ctx, cmd->borderWidth > 0 ? cmd->borderWidth : 1);
                CGContextStrokePath(ctx);
                break;
            case CHENG_DRAW_CMD_TEXT: {
                if (cmd->text && cmd->textLen > 0) {
                    CFStringRef str = CFStringCreateWithBytes(NULL, (const UInt8*)cmd->text, cmd->textLen, kCFStringEncodingUTF8, false);
                    if (!str) break;
                    CTFontRef font = cheng_drawlist_make_font(cmd);
                    if (!font) { CFRelease(str); break; }
                    CGFloat components[] = {r, g, b, a};
                    CGColorSpaceRef cs = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
                    CGColorRef color = CGColorCreate(cs, components);
                    CFStringRef keys[] = { kCTFontAttributeName, kCTForegroundColorAttributeName };
                    CFTypeRef values[] = { font, color };
                    CFDictionaryRef attrs = CFDictionaryCreate(NULL, (const void**)keys, (const void**)values, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
                    CFAttributedStringRef attrStr = CFAttributedStringCreate(NULL, str, attrs);
                    // bidi 方向显式锁 LTR: 含 '\' 分隔符/混合数字的行, CTLine
                    // 的段落方向分析可能判成 RTL 导致整行字序反向(淘宝分类行
                    // 实证), WebKit 对同内容按 LTR 绘制, 此处显式对齐
                    CTWritingDirection wd = kCTWritingDirectionLeftToRight;
                    CTParagraphStyleSetting psSetting = { kCTParagraphStyleSpecifierBaseWritingDirection, sizeof(wd), &wd };
                    CTParagraphStyleRef pstyle = CTParagraphStyleCreate(&psSetting, 1);
                    CFRange fullRange = CFRangeMake(0, CFAttributedStringGetLength(attrStr));
                    CFAttributedStringSetAttribute(attrStr, fullRange, kCTParagraphStyleAttributeName, pstyle);
                    CFRelease(pstyle);
                    CTLineRef line = CTLineCreateWithAttributedString(attrStr);
                    CGFloat ascent = 0, descent = 0, leading = 0;
                    CGFloat lineW = CTLineGetTypographicBounds(line, &ascent, &descent, &leading);
                    // WebKit 半行距模型: 行盒内垂直居中基线(盒高有效时), 免盒顶
                    // 钉基线在 line-height != 字号行高时的系统性垂直偏移。
                    // 静态文本标定夹具 A/B: MAE 9.28→7.76(-16%), 精确一致 +0.63pp。
                    CGFloat textTop = (CGFloat)cmd->y;
                    if (cmd->h > 0) {
                        textTop = (CGFloat)cmd->y + ((CGFloat)cmd->h - (ascent + descent)) / 2.0;
                    }
                    // WebKit 按钮语义: 表单提交类文本在盒内水平居中(textAlign=1)。
                    CGFloat drawX = (CGFloat)cmd->x;
                    if (cmd->textAlign == 1 && cmd->w > 0 && lineW < (CGFloat)cmd->w) {
                        drawX = (CGFloat)cmd->x + ((CGFloat)cmd->w - lineW) / 2.0;
                    }
                    CGContextSetTextPosition(ctx, drawX, viewH - textTop - ascent);
                    CTLineDraw(line, ctx);
                    CFRelease(line); CFRelease(attrStr); CFRelease(attrs);
                    CGColorRelease(color); CGColorSpaceRelease(cs);
                    CFRelease(font); CFRelease(str);
                }
                break;
            }
            case CHENG_DRAW_CMD_RAWBGRA:
                if (cmd->text && cmd->textLen >= cmd->w * cmd->h * 4 && cmd->w > 0 && cmd->h > 0) {
                    NSRect dest = NSMakeRect(rect.origin.x, rect.origin.y, rect.size.width, rect.size.height);
                    // one-pass BGRA -> big-endian RGBA snapshot, then the
                    // plain default CGImage layout. Byte-order flags on
                    // CGBitmapContext/CGImageCreate were measured to be
                    // silently ignored for alphaNone layouts on this OS;
                    // the default layout has no such ambiguity. The
                    // snapshot also decouples the draw from the rotating
                    // A/B surface buffers.
                    static uint8_t* conv = NULL;
                    static int32_t convCap = 0;
                    int32_t need = cmd->w * cmd->h * 4;
                    if (convCap < need) {
                        uint8_t* grown = (uint8_t*)realloc(conv, (size_t)need);
                        if (!grown) { free(conv); conv = NULL; convCap = 0; break; }
                        conv = grown; convCap = need;
                    }
                    const uint8_t* srcP = (const uint8_t*)cmd->text;
                    int32_t total = cmd->w * cmd->h;
                    for (int32_t i = 0; i < total; i++) {
                        conv[i * 4 + 0] = srcP[i * 4 + 2];
                        conv[i * 4 + 1] = srcP[i * 4 + 1];
                        conv[i * 4 + 2] = srcP[i * 4 + 0];
                        conv[i * 4 + 3] = srcP[i * 4 + 3];
                    }
                    CGColorSpaceRef cs = CGColorSpaceCreateDeviceRGB();
                    CGDataProviderRef prov = CGDataProviderCreateWithData(NULL, conv,
                        (size_t)need, NULL);
                    CGImageRef img = prov ? CGImageCreate(cmd->w, cmd->h, 8, 32, cmd->w * 4, cs,
                        kCGImageAlphaPremultipliedLast,
                        prov, NULL, false, kCGRenderingIntentDefault) : NULL;
                    if (img) {
                        CGContextDrawImage(ctx, dest, img);
                        CGImageRelease(img);
                    }
                    if (prov) CFRelease(prov);
                    CGColorSpaceRelease(cs);
                }
                break;
            case CHENG_DRAW_CMD_IMAGE:
                if (cmd->text && cmd->textLen > 0 && cmd->w > 0 && cmd->h > 0) {
                    NSRect dest = NSMakeRect(rect.origin.x, rect.origin.y, rect.size.width, rect.size.height);
                    CGFloat frac = cmd->opacity > 0 ? cmd->opacity / 255.0 : 1.0;
                    CGImageRef cachedImg = cheng_img_cache_get(cmd->text, cmd->textLen);
                    if (cachedImg) {
                        // 非 flipped ctx 中 CGContextDrawImage 视觉上下颠倒,
                        // 翻转补偿后与原 NSImage drawInRect 视觉等价
                        CGContextSaveGState(ctx);
                        CGContextTranslateCTM(ctx, 0, dest.origin.y + dest.size.height);
                        CGContextScaleCTM(ctx, 1.0, -1.0);
                        CGRect unflipped = CGRectMake(dest.origin.x, 0, dest.size.width, dest.size.height);
                        CGContextDrawImage(ctx, unflipped, cachedImg);
                        CGContextRestoreGState(ctx);
                    } else {
                        NSData* data = [NSData dataWithBytes:cmd->text length:(NSUInteger)cmd->textLen];
                        CGImageSourceRef src = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
                        CGImageRef decoded = NULL;
                        if (src) {
                            decoded = CGImageSourceCreateImageAtIndex(src, 0, NULL);
                            CFRelease(src);
                        }
                        if (decoded) {
                            CGContextDrawImage(ctx, dest, decoded);
                            cheng_img_cache_put(cheng_img_fnv(cmd->text, cmd->textLen), cmd->textLen, decoded);
                        } else {
                            // CGImageSource 不支持的格式(SVG 等)回退 NSImage, 不入缓存(量少)
                            NSImage* img = [[NSImage alloc] initWithData:data];
                            if (img) {
                                [img drawInRect:dest fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:frac];
                            }
                        }
                    }
                }
                break;
            default:
                break;
        }
        CGContextRestoreGState(ctx);
    }
    CGContextRestoreGState(ctx);
}
