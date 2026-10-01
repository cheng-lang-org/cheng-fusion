#ifndef CHENG_METAL_RENDERER_H
#define CHENG_METAL_RENDERER_H

#import <Cocoa/Cocoa.h>
#import <Metal/Metal.h>
#import <CoreGraphics/CoreGraphics.h>
#import <simd/simd.h>
#import "drawlist_bridge.h"

// Metal GPU 渲染器(战役 S 第一里程碑):
//   - 图形 cmd(RECT/BORDER/IMAGE/阴影)经 GPU 管线绘制(CAMetalLayer)
//   - TEXT cmd 由宿主侧 CoreText 叠加层绘制(glyph CPU 光栅化+GPU 合成,
//     与 Chrome/Safari 同类; glyph atlas 列二里程碑)
//   - setDrawList 深拷贝 cmds+字符串字节(防宿主 rebuild 后悬垂)
//   - 线程: setDrawList 在主线程调用; drawInLayer 由 CAMetalLayer 调度
@interface ChengMetalRenderer : NSObject

// layer 挂到宿主 view; 返回初始化是否成功(device/shader 不可用时 NO, 调用方回退 CG)
- (BOOL)attachToView:(NSView*)view;
// 深拷贝 drawlist(含字符串字节), 供 GPU 帧消费; 文本由调用方 overlay 层绘制
- (void)setDrawList:(const ChengDrawList*)list;
- (void)setViewportW:(int32_t)w h:(int32_t)h;
// 离屏 GPU 渲染(脏时才执行), 回读为 CGImage 供宿主 drawRect 贴画——
// 像素链路(dump/探针)保持统一出口
- (CGImageRef)renderOffscreenCGImage;
- (void)renderNow;

@end

#endif
