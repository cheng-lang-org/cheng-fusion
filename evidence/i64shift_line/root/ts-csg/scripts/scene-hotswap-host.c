/*
 * scene-hotswap-host.c — LIVE_MIRROR_CAMPAIGN P1 桌面常驻渲染器宿主。
 *
 * 基座 = unimaker-digest-host.c（完整 mobile-host importc 桥/stub 面 +
 * C 运行时桥：cheng_malloc/free/seq/strings/errno/time/crc32/file-simple）。
 *
 * 本文件新增/覆盖：
 *   - cheng_mobile_host_read_scene_data_asset: 无 CRC 读（热换由驱动原子 rename 保证）
 *   - cheng_mobile_host_swap_request_query: 解析换装请求文本
 *   - cheng_hs_sleep_ms: usleep
 *   - cheng_mobile_host_present_compositor_frame: FillRect/SetClip 软光栅
 *       → RGBA 写 CHENG_SCENE_FRAME_DUMP → ack 写 CHENG_SCENE_FRAME_ACK
 */
#define cheng_mobile_host_read_scene_data_asset hs_digest_read_sda_crc
#define cheng_mobile_host_present_compositor_frame hs_digest_present_noop
#include "unimaker-digest-host.c"
#undef cheng_mobile_host_read_scene_data_asset
#undef cheng_mobile_host_present_compositor_frame

#include <string.h>
#include <unistd.h>

static const char* hs_env(const char* name) {
    const char* v = getenv(name);
    return (v && v[0]) ? v : NULL;
}

/* ---- 无 CRC bin 读取 ---- */
int32_t cheng_mobile_host_read_scene_data_asset(void* out, int32_t byteCount, int32_t expectedCrc32) {
    (void)expectedCrc32;
    const char* path = hs_env("CHENG_DIGEST_SCENE_DATA");
    if (!path) return 1;
    FILE* f = fopen(path, "rb");
    if (!f) return 2;
    size_t n = fread(out, 1u, (size_t)byteCount, f);
    fclose(f);
    return ((int32_t)n == (size_t)byteCount) ? 0 : 3;
}

/* ---- 换装请求查询 ---- */
int32_t cheng_mobile_host_swap_request_query(int32_t* outVersion, int32_t* outByteCount, int32_t* outCrc32, int32_t* outFlags) {
    const char* path = hs_env("CHENG_SCENE_SWAP_REQUEST");
    if (!path) return 1;
    FILE* f = fopen(path, "rb");
    if (!f) return 1;
    char tag[8] = {0};
    int32_t version = 0, byteCount = 0, crc = 0, flags = 0;
    int n = fscanf(f, "%7s %d %d %d %d", tag, &version, &byteCount, &crc, &flags);
    fclose(f);
    if (n != 5 || strcmp(tag, "SWAP") != 0) return 2;
    *outVersion = version;
    *outByteCount = byteCount;
    *outCrc32 = crc;
    *outFlags = flags;
    return 0;
}

void cheng_hs_sleep_ms(int32_t ms) {
    if (ms > 0) usleep((useconds_t)ms * 1000u);
}

/* ---- present 终端: 软光栅 + 落盘 + ack ---- */
static uint8_t* hs_fb = NULL;
static int32_t hs_fb_w = 0, hs_fb_h = 0;

void cheng_mobile_host_present_compositor_frame(const int32_t* layers, int32_t layerCount, int32_t layerStrideI32, const int32_t* commands, int32_t commandCount, int32_t commandStrideI32, int32_t width, int32_t height) {
    int32_t total = width * height * 4;
    if (total <= 0 || commandStrideI32 <= 0) {
        fprintf(stderr, "scene-hotswap-host: bad geometry\n");
        exit(2);
    }
    if (hs_fb_w != width || hs_fb_h != height) {
        free(hs_fb);
        hs_fb = (uint8_t*)malloc((size_t)total);
        hs_fb_w = width; hs_fb_h = height;
        if (hs_fb) memset(hs_fb, 0xFF, (size_t)total);
    }
    if (!hs_fb) exit(3);
    memset(hs_fb, 0xFF, (size_t)total);
    int32_t clipX = 0, clipY = 0, clipW = width, clipH = height;
    for (int32_t i = 0; i < commandCount; ++i) {
        const int32_t* cmd = commands + (size_t)i * (size_t)commandStrideI32;
        int32_t kind = cmd[0];
        int32_t x = cmd[3], y = cmd[4], w = cmd[5], h = cmd[6];
        if (kind == 6) {
            if (w <= 0 || h <= 0) { clipX=0;clipY=0;clipW=width;clipH=height; }
            else {
                clipX=x; clipY=y; clipW=w; clipH=h;
                if(clipX<0){clipW+=clipX;clipX=0;}
                if(clipY<0){clipH+=clipY;clipY=0;}
                if(clipX+clipW>width)clipW=width-clipX;
                if(clipY+clipH>height)clipH=height-clipY;
            }
            continue;
        }
        if (kind != 1) {
            fprintf(stderr, "scene-hotswap-host: unsupported kind=%d at %d\n", kind, i);
            exit(2);
        }
        const uint8_t* color = (const uint8_t*)(cmd + 7);
        int32_t x0 = x > clipX ? x : clipX;
        int32_t y0 = y > clipY ? y : clipY;
        int32_t x1 = x + w < clipX + clipW ? x + w : clipX + clipW;
        int32_t y1 = y + h < clipY + clipH ? y + h : clipY + clipH;
        if (x1 > width) x1 = width;
        if (y1 > height) y1 = height;
        for (int32_t yy = y0; yy < y1; ++yy) {
            uint8_t* row = hs_fb + (size_t)yy * (size_t)width * 4u;
            for (int32_t xx = x0; xx < x1; ++xx) {
                row[(size_t)xx*4u+0]=color[0];
                row[(size_t)xx*4u+1]=color[1];
                row[(size_t)xx*4u+2]=color[2];
                row[(size_t)xx*4u+3]=color[3];
            }
        }
    }
    const char* dumpPath = hs_env("CHENG_SCENE_FRAME_DUMP");
    if (!dumpPath) { fprintf(stderr, "scene-hotswap-host: CHENG_SCENE_FRAME_DUMP unset\n"); exit(4); }
    FILE* out = fopen(dumpPath, "wb");
    if (!out) { fprintf(stderr, "scene-hotswap-host: cannot open %s\n", dumpPath); exit(5); }
    fwrite(hs_fb, 1u, (size_t)total, out);
    fclose(out);
    int32_t v = 0;
    const char* reqPath = hs_env("CHENG_SCENE_SWAP_REQUEST");
    if (reqPath) {
        FILE* rf = fopen(reqPath, "rb");
        if (rf) { char tag[8]={0}; if(fscanf(rf,"%7s %d",tag,&v)==2){} fclose(rf); }
    }
    const char* ackPath = hs_env("CHENG_SCENE_FRAME_ACK");
    if (ackPath) {
        FILE* ack = fopen(ackPath, "w");
        if (ack) { fprintf(ack, "frame %d\n", v); fclose(ack); }
    }
}
