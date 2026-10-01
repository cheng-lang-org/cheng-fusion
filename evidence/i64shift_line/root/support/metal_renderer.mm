#import "metal_renderer.h"
#import <Metal/Metal.h>
#import <QuartzCore/QuartzCore.h>
#import <simd/simd.h>

typedef struct {
    vector_float2 pos;
    vector_float2 size;
    vector_float4 color;
    float radius;
    float borderWidth;
    float borderOn;
    float shadowOn;
    float shadowX;
    float shadowY;
    float shadowBlur;
    vector_float4 shadowColor;
    float pad0;
    float pad1;
    float pad2;
} MdlInstance;

static const char* kShaderSource =
    "using namespace metal;\n"
    "\n"
    "struct Instance {\n"
    "    float2 pos;\n"
    "    float2 size;\n"
    "    float4 color;\n"
    "    float radius;\n"
    "    float borderWidth;\n"
    "    float borderOn;\n"
    "    float shadowOn;\n"
    "    float2 shadowOff;\n"
    "    float shadowBlur;\n"
    "    float4 shadowColor;\n"
    "};\n"
    "\n"
    "struct VSOut {\n"
    "    float4 pos [[position]];\n"
    "    float2 local;\n"
    "    float2 halfSize;\n"
    "    float4 color;\n"
    "    float radius;\n"
    "    float borderWidth;\n"
    "    float borderOn;\n"
    "    float shadowOn;\n"
    "    float2 shadowOff;\n"
    "    float shadowBlur;\n"
    "    float4 shadowColor;\n"
    "};\n"
    "\n"
    "vertex VSOut vs_main(uint vid [[vertex_id]],\n"
    "                     constant Instance* instances [[buffer(0)]],\n"
    "                     constant float2& viewport [[buffer(1)]],\n"
    "                     uint iid [[instance_id]]) {\n"
    "    Instance in = instances[iid];\n"
    "    float2 corner[6] = { {-1,-1},{1,-1},{-1,1}, {-1,1},{1,-1},{1,1} };\n"
    "    float2 c = corner[vid % 6];\n"
    "    VSOut o;\n"
    "    float2 centerNdc = float2(in.pos.x / viewport.x * 2.0 - 1.0,\n"
    "                              1.0 - in.pos.y / viewport.y * 2.0);\n"
    "    float2 pxNdc = 2.0 / viewport;\n"
    "    o.pos = float4(centerNdc + c * (in.size + float2(2.0)) * pxNdc, 0.0, 1.0);\n"
    "    o.local = c * (in.size + float2(2.0));\n"
    "    o.halfSize = in.size;\n"
    "    o.color = in.color;\n"
    "    o.radius = in.radius;\n"
    "    o.borderWidth = in.borderWidth;\n"
    "    o.borderOn = in.borderOn;\n"
    "    o.shadowOn = in.shadowOn;\n"
    "    o.shadowOff = in.shadowOff;\n"
    "    o.shadowBlur = in.shadowBlur;\n"
    "    o.shadowColor = in.shadowColor;\n"
    "    return o;\n"
    "}\n"
    "\n"
    "static float sdRoundRect(float2 p, float2 b, float r) {\n"
    "    float2 q = abs(p) - b + r;\n"
    "    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;\n"
    "}\n"
    "\n"
    "fragment float4 fs_main(VSOut in [[stage_in]]) {\n"
    "    float d = sdRoundRect(in.local, in.halfSize, in.radius);\n"
    "    if (in.shadowOn > 0.5) {\n"
    "        float sd = sdRoundRect(in.local - in.shadowOff, in.halfSize, in.radius);\n"
    "        float a = 1.0 - smoothstep(in.shadowBlur * 0.5, in.shadowBlur * 1.5 + 1.0, sd);\n"
    "        float4 sc = in.shadowColor;\n"
    "        sc.a *= a;\n"
    "        if (sc.a > 0.004) return sc;\n"
    "    }\n"
    "    float aa = 1.0;\n"
    "    float fillMask = 1.0 - smoothstep(-aa, aa, d);\n"
    "    if (fillMask <= 0.004) return float4(0.0);\n"
    "    if (in.borderOn > 0.5 && in.borderWidth > 0) {\n"
    "        float bw = in.borderWidth;\n"
    "        float outer = 1.0 - smoothstep(-aa, aa, d);\n"
    "        float borderMask = clamp(outer - smoothstep(-aa, aa, d + bw), 0.0, 1.0);\n"
    "        return float4(in.color.rgb, in.color.a * outer);\n"
    "    }\n"
    "    return float4(in.color.rgb, in.color.a * fillMask);\n"
    "}\n";

@interface ChengMetalRenderer ()
@property (nonatomic, strong) id<MTLDevice> device;
@property (nonatomic, strong) id<MTLCommandQueue> queue;
@property (nonatomic, strong) id<MTLRenderPipelineState> pipe;
@property (nonatomic, strong) id<MTLTexture> offscreenTex;
@property (nonatomic, assign) MdlInstance* instances;
@property (nonatomic, assign) int32_t instanceCount;
@property (nonatomic, assign) int32_t viewW;
@property (nonatomic, assign) int32_t viewH;
@end

@implementation ChengMetalRenderer

- (BOOL)attachToView:(NSView*)view {
    self.device = MTLCreateSystemDefaultDevice();
    if (!self.device) return NO;
    NSString* shaderSrc = [NSString stringWithUTF8String:kShaderSource];
    NSError* libErr = nil;
    id<MTLLibrary> lib = [self.device newLibraryWithSource:shaderSrc options:nil error:&libErr];
    if (!lib) {
        fprintf(stderr, "[metal] shader compile fail: %s\n", libErr.localizedDescription.UTF8String ?: "?");
        return NO;
    }
    id<MTLFunction> vs = [lib newFunctionWithName:@"vs_main"];
    id<MTLFunction> fs = [lib newFunctionWithName:@"fs_main"];
    if (!vs || !fs) return NO;
    MTLRenderPipelineDescriptor* pd = [MTLRenderPipelineDescriptor new];
    pd.vertexFunction = vs;
    pd.fragmentFunction = fs;
    pd.colorAttachments[0].pixelFormat = MTLPixelFormatBGRA8Unorm;
    pd.colorAttachments[0].blendingEnabled = YES;
    pd.colorAttachments[0].sourceRGBBlendFactor = MTLBlendFactorSourceAlpha;
    pd.colorAttachments[0].destinationRGBBlendFactor = MTLBlendFactorOneMinusSourceAlpha;
    pd.colorAttachments[0].sourceAlphaBlendFactor = MTLBlendFactorOne;
    pd.colorAttachments[0].destinationAlphaBlendFactor = MTLBlendFactorOneMinusSourceAlpha;
    NSError* err = nil;
    self.pipe = [self.device newRenderPipelineStateWithDescriptor:pd error:&err];
    if (!self.pipe) {
        fprintf(stderr, "[metal] pipeline fail: %s\n", err.localizedDescription.UTF8String);
        return NO;
    }
    self.queue = [self.device newCommandQueue];
    return YES;
}

- (void)setViewportW:(int32_t)w h:(int32_t)h {
    fprintf(stderr, "[metal] setViewport %dx%d\n", w, h);
    self.viewW = w;
    self.viewH = h;
    if (!self.device || w <= 0 || h <= 0) return;
    MTLTextureDescriptor* td = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatBGRA8Unorm width:(NSUInteger)w height:(NSUInteger)h mipmapped:NO];
    td.usage = MTLTextureUsageRenderTarget | MTLTextureUsageShaderRead;
    self.offscreenTex = [self.device newTextureWithDescriptor:td];
}

- (void)setDrawList:(const ChengDrawList*)list {
    if (!list) {
        if (self.instances) { free(self.instances); self.instances = NULL; }
        self.instanceCount = 0;
        return;
    }
    MdlInstance* buf = (MdlInstance*)calloc((size_t)list->count * 2 + 1, sizeof(MdlInstance));
    int32_t n = 0;
    for (int32_t i = 0; i < list->count; i++) {
        const ChengDrawCmd* c = &list->cmds[i];
        if (c->kind == CHENG_DRAW_CMD_TEXT) continue;
        MdlInstance* m = &buf[n];
        memset(m, 0, sizeof(*m));
        m->pos.x = c->x + c->w / 2.0;
        m->pos.y = c->y + c->h / 2.0;
        m->size.x = c->w / 2.0;
        m->size.y = c->h / 2.0;
        m->color = vector4(c->r / 255.0f, c->g / 255.0f, c->b / 255.0f, (c->a > 0 ? c->a : 255) / 255.0f);
        m->radius = c->radius > 0 ? (float)c->radius : 0.0f;
        m->borderWidth = (c->kind == CHENG_DRAW_CMD_BORDER && c->borderWidth > 0) ? (float)c->borderWidth : 0.0f;
        m->borderOn = c->kind == CHENG_DRAW_CMD_BORDER ? 1.0f : 0.0f;
        n += 1;
        if (c->shadowA > 0 && (c->shadowBlur > 0 || c->shadowX != 0 || c->shadowY != 0)) {
            MdlInstance* sh = &buf[n];
            memset(sh, 0, sizeof(*sh));
            sh->pos.x = m->pos.x + c->shadowX;
            sh->pos.y = m->pos.y + c->shadowY;
            sh->size = m->size;
            sh->color = vector4(c->shadowR / 255.0f, c->shadowG / 255.0f, c->shadowB / 255.0f, c->shadowA / 255.0f);
            sh->radius = m->radius;
            sh->shadowOn = 1.0f;
            sh->shadowX = (float)c->shadowX;
            sh->shadowY = (float)c->shadowY;
            sh->shadowBlur = (float)c->shadowBlur;
            sh->shadowColor = sh->color;
            n += 1;
        }
    }
    if (self.instances) free(self.instances);
    self.instances = buf;
    self.instanceCount = n;
    fprintf(stderr, "[metal] setDrawList total=%d inst=%d\n", list->count, n);
}

- (void)renderNow {
    // 触发一次 GPU 离屏渲染(结果由 drawRect 经 renderOffscreenCGImage 取用)
    CGImageRef img = [self renderOffscreenCGImage];
    if (img) CFRelease(img);
}

- (CGImageRef)renderOffscreenCGImage {
    // 惰性纹理: setViewport 可能早于布局(视口 0 宽), 渲染时按最终尺寸补建
    if (self.device && self.viewW > 0 && self.viewH > 0 &&
        (!self.offscreenTex || self.offscreenTex.width != (NSUInteger)self.viewW || self.offscreenTex.height != (NSUInteger)self.viewH)) {
        MTLTextureDescriptor* td = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatBGRA8Unorm width:(NSUInteger)self.viewW height:(NSUInteger)self.viewH mipmapped:NO];
        td.usage = MTLTextureUsageRenderTarget | MTLTextureUsageShaderRead;
        self.offscreenTex = [self.device newTextureWithDescriptor:td];
    }
    if (!self.offscreenTex || self.instanceCount <= 0 || self.viewW <= 0) {
        fprintf(stderr, "[metal] offscreen skip tex=%p inst=%d vw=%d\n", (__bridge void*)self.offscreenTex, self.instanceCount, self.viewW);
        return NULL;
    }
    MTLRenderPassDescriptor* rp = [MTLRenderPassDescriptor renderPassDescriptor];
    rp.colorAttachments[0].texture = self.offscreenTex;
    rp.colorAttachments[0].loadAction = MTLLoadActionClear;
    rp.colorAttachments[0].storeAction = MTLStoreActionStore;
    rp.colorAttachments[0].clearColor = MTLClearColorMake(0, 0, 0, 0);
    id<MTLCommandBuffer> cb = [self.queue commandBuffer];
    id<MTLRenderCommandEncoder> enc = [cb renderCommandEncoderWithDescriptor:rp];
    [enc setRenderPipelineState:self.pipe];
    [enc setVertexBytes:self.instances length:(NSUInteger)self.instanceCount * sizeof(MdlInstance) atIndex:0];
    float vp[2] = { (float)self.viewW, (float)self.viewH };
    [enc setVertexBytes:vp length:sizeof(vp) atIndex:1];
    // instanced draw: 每实例一个 quad(6 顶点), instance_id 由 GPU 展开
    [enc drawPrimitives:MTLPrimitiveTypeTriangle vertexStart:0 vertexCount:6 instanceCount:self.instanceCount];
    [enc endEncoding];
    [cb commit];
    [cb waitUntilCompleted];
    NSUInteger w = self.offscreenTex.width, h = self.offscreenTex.height;
    NSUInteger bpr = w * 4;
    void* data = malloc(bpr * h);
    [self.offscreenTex getBytes:data bytesPerRow:bpr fromRegion:MTLRegionMake2D(0, 0, w, h) mipmapLevel:0];
    CGDataProviderRef prov = CGDataProviderCreateWithData(NULL, data, bpr * h, NULL);
    CGColorSpaceRef cs = CGColorSpaceCreateDeviceRGB();
    CGImageRef img = CGImageCreate((size_t)w, (size_t)h, 8, 32, bpr, cs,
        kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst, prov, NULL, false, kCGRenderingIntentDefault);
    CGColorSpaceRelease(cs);
    CGDataProviderRelease(prov);
    free(data);
    return img;
}

@end
