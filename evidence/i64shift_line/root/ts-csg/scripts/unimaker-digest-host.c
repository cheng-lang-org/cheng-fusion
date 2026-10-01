/* UniMaker deterministic frame-digest host shim.
 *
 * Linked into the digest-driver executable built identically for
 * arm64-apple-darwin (reference) and aarch64-linux-android (device). The generated
 * Cheng scene-runtime source (with a digest-driver main, see unimaker-digest-oracle.mjs)
 * owns the entry point and loops every route calling cheng_app_debug_compute_frame_digest;
 * this file provides only (a) the cheng_mobile_host_* / cheng_malloc family the runtime
 * imports, (b) the two asset readers serving the same scene_data.bin / glyph_sdf_pixels.bin
 * both platforms consume, and (c) the cheng_digest_* emit callbacks the driver main prints
 * through. It defines NO main(); the Cheng-generated main is the entry.
 *
 * The digest path builds + encodes the per-route compositor host batch but never presents
 * pixels, so the present/upload/prepare stubs are never invoked at runtime — they exist
 * only to satisfy the dynamic linker. The only difference between the reference and device
 * runs is the CPU architecture, which is exactly what the digest comparison verifies.
 */
#include <stdint.h>
#include <errno.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

typedef struct ChengDigestSeqHeader {
  int32_t len;
  int32_t cap;
  void* buffer;
} ChengDigestSeqHeader;

typedef struct ChengDigestStr {
  void* data;
  int32_t len;
  int32_t store_id;
  int32_t flags;
} ChengDigestStr;

static void cheng_digest_unexpected_host_call(const char* name) {
  fprintf(stderr, "digest host: unexpected host call %s\n", name);
  abort();
}

/* ---- digest emit callbacks (driver main prints through these) ---- */
void cheng_digest_emit_meta(int32_t routeCount, int32_t viewportW, int32_t viewportH) {
  printf("digest_host route_count=%d viewport=%dx%d\n", routeCount, viewportW, viewportH);
}
void cheng_digest_emit(int32_t routeIndex, int32_t ok, int32_t hi, int32_t lo) {
  printf("route %d %d %d %d\n", routeIndex, ok, hi, lo);
}
void cheng_digest_emit_route_diag(int32_t routeIndex, int32_t status,
                                  int32_t cssCode, int32_t cssPropertyCode,
                                  int32_t cssRoute, int32_t cssNode,
                                  int32_t layoutCode, int32_t layoutRoute,
                                  int32_t layoutNode, int32_t layoutOrdinal,
                                  int32_t frameStep, int32_t buildStep,
                                  int32_t glyphCode, int32_t glyphRoute,
                                  int32_t glyphNode, int32_t glyphOrdinal,
                                  int32_t glyphCodepoint) {
  printf("route_diag %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d\n",
         routeIndex, status, cssCode, cssPropertyCode, cssRoute, cssNode,
         layoutCode, layoutRoute, layoutNode, layoutOrdinal, frameStep, buildStep,
         glyphCode, glyphRoute, glyphNode, glyphOrdinal, glyphCodepoint);
}
void cheng_digest_emit_edge_meta(int32_t edgeCount) {
  printf("digest_host edge_count=%d\n", edgeCount);
}
void cheng_digest_emit_edge(int32_t edgeIndex, int32_t source, int32_t node,
                            int32_t expectedTarget, int32_t landed) {
  printf("edge %d %d %d %d %d\n", edgeIndex, source, node, expectedTarget, landed);
}
void cheng_digest_emit_edge_hit(int32_t edgeIndex, int32_t source, int32_t node,
                                int32_t expectedTarget, int32_t hitNode,
                                int32_t centerX, int32_t centerY) {
  printf("edge_hit %d %d %d %d %d %d %d\n",
         edgeIndex, source, node, expectedTarget, hitNode, centerX, centerY);
}
void cheng_digest_emit_hit_rect_meta(int32_t hitRectCount) {
  printf("digest_host hit_rect_count=%d\n", hitRectCount);
}
void cheng_digest_emit_hit_rect(int32_t hitRectIndex, int32_t source, int32_t node,
                                int32_t expectedTarget, int32_t hitNode,
                                int32_t centerX, int32_t centerY) {
  printf("hit_rect %d %d %d %d %d %d %d\n",
         hitRectIndex, source, node, expectedTarget, hitNode, centerX, centerY);
}
void cheng_digest_emit_probe(int32_t probeCode, int32_t status) {
  printf("probe %d %d\n", probeCode, status);
}
void cheng_digest_done(int32_t failures) {
  fflush(stdout);
  if (failures == 0) {
    printf("digest_host ok\n");
    fflush(stdout);
  } else {
    fprintf(stderr, "digest host: %d route(s) failed to compute\n", failures);
  }
}

/* ---- heap + cstring helpers the runtime imports ---- */
void* cheng_malloc(int32_t size) {
  return calloc(1u, (size_t)(size > 0 ? size : 1));
}
void cheng_free(void* p) {
  if (p != NULL) free(p);
}
char* driver_c_new_string(int32_t size) {
  if (size < 0 || size >= INT32_MAX) abort();
  char* out = (char*)cheng_malloc(size + 1);
  if (out == NULL) return NULL;
  out[size] = '\0';
  return out;
}
int32_t cheng_cstrlen(const char* s) {
  if (s == NULL) return 0;
  size_t n = strlen(s);
  if (n > (size_t)INT32_MAX) abort();
  return (int32_t)n;
}
char* driver_c_new_string_copy_n(void* raw, int32_t n) {
  if (n < 0 || n >= INT32_MAX) abort();
  char* out = (char*)cheng_malloc(n + 1);
  if (out == NULL) return NULL;
  if (raw != NULL && n > 0) memcpy(out, raw, (size_t)n);
  out[n] = '\0';
  return out;
}

void cheng_mem_retain(void* p) {
  (void)p;
}
void cheng_mem_release(void* p) {
  (void)p;
}
int32_t cheng_ptr_size(void) {
  return (int32_t)sizeof(void*);
}
void store_ptr(void* p, void* value) {
  if (p == NULL) abort();
  *((void**)p) = value;
}
void* load_ptr(void* p) {
  if (p == NULL) abort();
  return *((void**)p);
}
void store_int32(void* p, int32_t value) {
  if (p == NULL) abort();
  *((int32_t*)p) = value;
}
int32_t load_int32(void* p) {
  if (p == NULL) abort();
  return *((int32_t*)p);
}
int32_t cheng_f64_to_i32(double value) {
  return (int32_t)value;
}
void cheng_rawmem_write_char(void* dst, int32_t idx, char value) {
  if (dst == NULL || idx < 0) return;
  ((char*)dst)[idx] = value;
}
void* cheng_seq_set_grow(void* seqPtr, int32_t idx, int32_t elemSize) {
  if (seqPtr == NULL || idx < 0 || elemSize <= 0 || idx == INT32_MAX) abort();
  ChengDigestSeqHeader* seq = (ChengDigestSeqHeader*)seqPtr;
  if (seq->len < 0 || seq->cap < 0 || seq->cap < seq->len) abort();
  int32_t needLen = idx + 1;
  if (needLen > seq->cap || seq->buffer == NULL) {
    int32_t newCap = seq->cap < 4 ? 4 : seq->cap;
    while (newCap < needLen) {
      int32_t grown = newCap + (newCap / 2);
      if (grown <= newCap) {
        newCap = needLen;
        break;
      }
      newCap = grown;
    }
    int64_t bytes64 = (int64_t)newCap * (int64_t)elemSize;
    if (bytes64 <= 0 || bytes64 > (int64_t)INT32_MAX || bytes64 >= 67108864LL) abort();
    int32_t oldCap = seq->cap;
    void* next = realloc(seq->buffer, (size_t)bytes64);
    if (next == NULL) abort();
    if (newCap > oldCap) {
      memset((uint8_t*)next + ((size_t)oldCap * (size_t)elemSize),
             0,
             (size_t)(newCap - oldCap) * (size_t)elemSize);
    }
    seq->buffer = next;
    seq->cap = newCap;
  }
  if (needLen > seq->len) seq->len = needLen;
  return (void*)((uint8_t*)seq->buffer + ((size_t)idx * (size_t)elemSize));
}
int32_t cheng_seq_string_elem_bytes_compat(void) {
  return (int32_t)sizeof(ChengDigestStr);
}
void cheng_seq_string_register_compat(void* seqPtr) {
  (void)seqPtr;
}
int32_t cheng_errno(void) {
  return errno;
}
int32_t cheng_epoch_time_seconds(void) {
  return (int32_t)time(NULL);
}
int64_t cheng_epoch_time_ms(void) {
  struct timespec ts;
  if (clock_gettime(CLOCK_REALTIME, &ts) != 0) return 0;
  return ((int64_t)ts.tv_sec * 1000LL) + ((int64_t)ts.tv_nsec / 1000000LL);
}
int64_t cheng_monotime_ns(void) {
  struct timespec ts;
  if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 0;
  return ((int64_t)ts.tv_sec * 1000000000LL) + (int64_t)ts.tv_nsec;
}
void* get_stderr(void) {
  return stderr;
}
const char* cheng_strerror(int32_t errnum) {
  return strerror(errnum);
}
void* cheng_os_fopen_mode_bridge(const char* path, const char* mode) {
  return fopen(path, mode);
}
int32_t cheng_fclose(void* f) {
  if (f == NULL) return -1;
  return fclose((FILE*)f);
}
int32_t cheng_fflush(void* f) {
  return fflush((FILE*)f);
}
int32_t cheng_fwrite(const void* data, int32_t size, int32_t count, void* f) {
  if (f == NULL || size < 0 || count < 0) return -1;
  return (int32_t)fwrite(data, (size_t)size, (size_t)count, (FILE*)f);
}

/* ---- deterministic asset readers (file-backed, IEEE crc32 validated) ---- */
static uint32_t cheng_digest_crc32_u8(const uint8_t* data, int byteCount) {
  uint32_t crc = 0xffffffffu;
  for (int i = 0; i < byteCount; i++) {
    crc ^= (uint32_t)data[i];
    for (int bit = 0; bit < 8; bit++) {
      uint32_t mask = 0u - (crc & 1u);
      crc = (crc >> 1u) ^ (0xedb88320u & mask);
    }
  }
  return crc ^ 0xffffffffu;
}

static int32_t cheng_digest_read_asset_file(const char* envName, void* out,
                                            int32_t byteCount, int32_t expectedCrc32) {
  if (out == NULL || byteCount <= 0) return 1;
  const char* path = getenv(envName);
  if (path == NULL || path[0] == '\0') {
    fprintf(stderr, "digest host: env %s not set\n", envName);
    return 2;
  }
  FILE* f = fopen(path, "rb");
  if (f == NULL) {
    fprintf(stderr, "digest host: cannot open %s=%s\n", envName, path);
    return 3;
  }
  uint8_t* dst = (uint8_t*)out;
  size_t total = 0;
  while (total < (size_t)byteCount) {
    size_t n = fread(dst + total, 1u, (size_t)byteCount - total, f);
    if (n == 0) {
      fprintf(stderr, "digest host: short read %s expected=%d got=%zu\n", path, byteCount, total);
      fclose(f);
      return 4;
    }
    total += n;
  }
  uint8_t probe;
  if (fread(&probe, 1u, 1u, f) != 0) {
    fprintf(stderr, "digest host: asset %s longer than expected=%d\n", path, byteCount);
    fclose(f);
    return 5;
  }
  fclose(f);
  uint32_t actual = cheng_digest_crc32_u8(dst, byteCount);
  if (actual != (uint32_t)expectedCrc32) {
    fprintf(stderr, "digest host: crc mismatch %s actual=%08x expected=%08x\n",
            path, actual, (uint32_t)expectedCrc32);
    return 6;
  }
  return 0;
}

int32_t cheng_mobile_host_read_scene_data_asset(void* out, int32_t byteCount, int32_t expectedCrc32) {
  return cheng_digest_read_asset_file("CHENG_DIGEST_SCENE_DATA", out, byteCount, expectedCrc32);
}
int32_t cheng_mobile_host_read_glyph_sdf_pixel_asset(void* out, int32_t byteCount, int32_t expectedCrc32) {
  return cheng_digest_read_asset_file("CHENG_DIGEST_GLYPH_PIXELS", out, byteCount, expectedCrc32);
}

/* ---- present/upload/prepare stubs (never invoked on the digest path) ---- */
void cheng_mobile_host_trace_step(int32_t step) { (void)step; }
void cheng_mobile_host_present(const void* pixels, int32_t w, int32_t h, int32_t stride) {
  (void)pixels; (void)w; (void)h; (void)stride;
}
void cheng_mobile_host_present_gpu_commands(const int32_t* commands, int commandCount,
                                            int commandStrideI32, int width, int height) {
  (void)commands; (void)commandCount; (void)commandStrideI32; (void)width; (void)height;
}
/* LIVE_MIRROR_CAMPAIGN P1: 软光栅 + 帧转储 + ack。
   无 CHENG_HS_FRAME 环境变量时保持 digest 路径原 no-op 语义。
   命令流编码: web_scene_runtime WebSceneEncodeCompositorFrameHostBatch —
   命令 17 word/kind,command: [0]=kind(1=FillRect,6=SetClip) [3]=x [4]=y
   [5]=w [6]=h [7]=color(ARGB); 层 17 word: [6]=[7]=offsetX/Y
   [15]=commandStart [16]=commandCount。门禁场景为 textless 纯 fill-rect。*/
static int32_t cheng_hs_last_ack_version = 0;

static void cheng_hs_fill_rect(uint8_t* pixels, int frameW, int frameH,
                               int clipX0, int clipY0, int clipX1, int clipY1,
                               int x, int y, int w, int h, uint32_t argb) {
  int x0 = x > clipX0 ? x : clipX0;
  int y0 = y > clipY0 ? y : clipY0;
  int x1 = x + w < clipX1 ? x + w : clipX1;
  int y1 = y + h < clipY1 ? y + h : clipY1;
  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x1 > frameW) x1 = frameW;
  if (y1 > frameH) y1 = frameH;
  if (x0 >= x1 || y0 >= y1) return;
  uint32_t a = (argb >> 24) & 0xffu;
  uint32_t r = (argb >> 16) & 0xffu;
  uint32_t g = (argb >> 8) & 0xffu;
  uint32_t b = argb & 0xffu;
  for (int py = y0; py < y1; py++) {
    uint8_t* row = pixels + ((size_t)py * (size_t)frameW + (size_t)x0) * 4u;
    for (int px = x0; px < x1; px++) {
      if (a == 0xffu) {
        row[0] = (uint8_t)r; row[1] = (uint8_t)g; row[2] = (uint8_t)b; row[3] = 0xffu;
      } else {
        uint32_t ia = 255u - a;
        row[0] = (uint8_t)((r * a + row[0] * ia + 127u) / 255u);
        row[1] = (uint8_t)((g * a + row[1] * ia + 127u) / 255u);
        row[2] = (uint8_t)((b * a + row[2] * ia + 127u) / 255u);
        row[3] = (uint8_t)(a + (row[3] * ia + 127u) / 255u);
      }
      row += 4;
    }
  }
}

void cheng_mobile_host_present_compositor_frame(const int32_t* layers, int layerCount, int layerStrideI32,
                                                const int32_t* commands, int commandCount, int commandStrideI32,
                                                int width, int height) {
  const char* framePath = getenv("CHENG_HS_FRAME");
  if (framePath == NULL || framePath[0] == '\0') {
    (void)layers; (void)layerCount; (void)layerStrideI32;
    (void)commands; (void)commandCount; (void)commandStrideI32;
    (void)width; (void)height;
    return;
  }
  if (width <= 0 || height <= 0 || layers == NULL || commands == NULL) {
    fprintf(stderr, "hotswap host: bad compositor frame %dx%d\n", width, height);
    exit(8);
  }
  static uint8_t* pixels = NULL;
  static int frameW = 0;
  static int frameH = 0;
  if (pixels == NULL || frameW != width || frameH != height) {
    free(pixels);
    pixels = (uint8_t*)calloc(1u, (size_t)width * (size_t)height * 4u);
    frameW = width;
    frameH = height;
    if (pixels == NULL) {
      fprintf(stderr, "hotswap host: frame alloc failed\n");
      exit(8);
    }
  } else {
    memset(pixels, 0, (size_t)frameW * (size_t)frameH * 4u);
  }
  for (int li = 0; li < layerCount; li++) {
    const int32_t* layer = layers + (size_t)li * (size_t)layerStrideI32;
    int offX = layer[6];
    int offY = layer[7];
    int commandStart = layer[15];
    int cmdCount = layer[16];
    int clipX0 = 0, clipY0 = 0, clipX1 = frameW, clipY1 = frameH;
    for (int ci = 0; ci < cmdCount; ci++) {
      int index = commandStart + ci;
      if (index < 0 || index >= commandCount) {
        fprintf(stderr, "hotswap host: command index %d out of range %d\n", index, commandCount);
        exit(8);
      }
      const int32_t* cmd = commands + (size_t)index * (size_t)commandStrideI32;
      int32_t kind = cmd[0];
      if (kind == 6) {
        clipX0 = cmd[3] + offX;
        clipY0 = cmd[4] + offY;
        clipX1 = clipX0 + cmd[5];
        clipY1 = clipY0 + cmd[6];
        continue;
      }
      if (kind != 1) {
        fprintf(stderr, "hotswap host: unsupported gpu command kind %d\n", kind);
        exit(8);
      }
      cheng_hs_fill_rect(pixels, frameW, frameH, clipX0, clipY0, clipX1, clipY1,
                         cmd[3] + offX, cmd[4] + offY, cmd[5], cmd[6],
                         (uint32_t)cmd[7]);
    }
  }
  FILE* ff = fopen(framePath, "wb");
  if (ff == NULL) {
    fprintf(stderr, "hotswap host: cannot write frame %s\n", framePath);
    exit(8);
  }
  size_t total = (size_t)frameW * (size_t)frameH * 4u;
  if (fwrite(pixels, 1u, total, ff) != total) {
    fprintf(stderr, "hotswap host: short frame write %s\n", framePath);
    exit(8);
  }
  fclose(ff);
  const char* ackPath = getenv("CHENG_HS_ACK");
  if (ackPath != NULL && ackPath[0] != '\0') {
    FILE* af = fopen(ackPath, "wb");
    if (af == NULL) {
      fprintf(stderr, "hotswap host: cannot write ack %s\n", ackPath);
      exit(8);
    }
    fprintf(af, "%d\n", cheng_hs_last_ack_version);
    fclose(af);
  }
}
int cheng_mobile_host_present_media_surface_commands(const int32_t* commands, int commandCount,
                                                     int commandStrideI32, int width, int height) {
  (void)commands; (void)commandCount; (void)commandStrideI32; (void)width; (void)height;
  if (commandCount == 0) return 1;
  return 0;
}
int cheng_mobile_host_prepare_media_surface_texture(int kindCode, int surfaceKind, int textureProvider,
                                                    const char* slotId, const char* assetCid,
                                                    const char* manifestCid, const char* posterCid,
                                                    int width, int height,
                                                    const char* peerHost, int peerPort,
                                                    int playbackState) {
  (void)kindCode; (void)surfaceKind; (void)textureProvider; (void)slotId; (void)assetCid;
  (void)manifestCid; (void)posterCid; (void)width; (void)height; (void)peerHost; (void)peerPort;
  (void)playbackState;
  /* Route transitions now hard-require media texture prepare (in-frame GPU command order),
   * so the digest path DOES reach this hook. The digest oracle measures scene/layout/command
   * structure deterministically — host texture decode is faked as ready, same discipline as
   * the CHENG_FAKE_LOCATION_ADDR GPS injection. Device runs do the real decode. */
  return 1;
}
void cheng_mobile_host_register_media_surface_texture(int kindCode, int surfaceKind, int textureProvider,
                                                      const char* slotId, const char* assetCid,
                                                      const char* manifestCid, int textureId,
                                                      int width, int height) {
  (void)kindCode; (void)surfaceKind; (void)textureProvider; (void)slotId; (void)assetCid;
  (void)manifestCid; (void)textureId; (void)width; (void)height;
}
void cheng_mobile_host_upload_image_atlas(const int32_t* entries, int entryCount, int entryStrideI32,
                                          const int32_t* pixels, int pixelCount) {
  (void)entries; (void)entryCount; (void)entryStrideI32; (void)pixels; (void)pixelCount;
}
void cheng_mobile_host_upload_svg_display_list_atlas(const int32_t* entries, int entryCount, int entryStrideI32,
                                                     const int32_t* primitives, int primitiveCount,
                                                     int primitiveStrideI32) {
  (void)entries; (void)entryCount; (void)entryStrideI32;
  (void)primitives; (void)primitiveCount; (void)primitiveStrideI32;
}
void cheng_mobile_host_upload_glyph_sdf_atlas(const int32_t* entries, int entryCount, int entryStrideI32,
                                              const int32_t* glyphs, int glyphCount, int glyphStrideI32,
                                              const int32_t* runs, int runCount, int runStrideI32,
                                              const int32_t* runGlyphs, int runGlyphCount, int runGlyphStrideI32,
                                              const int32_t* pixels, int pixelCount) {
  (void)entries; (void)entryCount; (void)entryStrideI32; (void)glyphs; (void)glyphCount; (void)glyphStrideI32;
  (void)runs; (void)runCount; (void)runStrideI32; (void)runGlyphs; (void)runGlyphCount; (void)runGlyphStrideI32;
  (void)pixels; (void)pixelCount;
}
void cheng_mobile_host_upload_glyph_sdf_atlas_bytes(const int32_t* entries, int entryCount, int entryStrideI32,
                                                    const int32_t* glyphs, int glyphCount, int glyphStrideI32,
                                                    const int32_t* runs, int runCount, int runStrideI32,
                                                    const int32_t* runGlyphs, int runGlyphCount, int runGlyphStrideI32,
                                                    const uint8_t* pixels, int pixelByteCount) {
  (void)entries; (void)entryCount; (void)entryStrideI32; (void)glyphs; (void)glyphCount; (void)glyphStrideI32;
  (void)runs; (void)runCount; (void)runStrideI32; (void)runGlyphs; (void)runGlyphCount; (void)runGlyphStrideI32;
  (void)pixels; (void)pixelByteCount;
}

void cheng_mobile_host_upload_glyph_sdf_atlas_metadata(const int32_t* entries, int entryCount, int entryStrideI32,
                                                       const int32_t* glyphs, int glyphCount, int glyphStrideI32,
                                                       const int32_t* runs, int runCount, int runStrideI32,
                                                       const int32_t* runGlyphs, int runGlyphCount, int runGlyphStrideI32) {
  (void)entries; (void)entryCount; (void)entryStrideI32; (void)glyphs; (void)glyphCount; (void)glyphStrideI32;
  (void)runs; (void)runCount; (void)runStrideI32; (void)runGlyphs; (void)runGlyphCount; (void)runGlyphStrideI32;
}
void cheng_mobile_host_set_ink_fade(int permille) { (void)permille; }
void cheng_mobile_host_upload_ink_field(const void* data, int gridW, int gridH) {
  (void)data; (void)gridW; (void)gridH;
}
void cheng_mobile_host_present_overlay_refresh(int width, int height) {
  (void)width; (void)height;
}

/* ---- Android-only host bridge symbols for the digest harness ---- */
/* ChtEvent target value bridge: the headless host has no live DOM input, so the zero default
 * event handle (target=0) returns an empty string — the honest no-input value (never fabricated). */
const char* cheng_host_event_target_value(int64_t handle) {
  (void)handle;
  return "";
}
void cheng_host_es_diag(int32_t step, int32_t a, int32_t b) {
  (void)step; (void)a; (void)b;
}
int32_t cheng_scene_media_es_sink_frame(int32_t frameIdx, void* runData,
                                        int32_t inRunOff, int32_t frameSize) {
  (void)frameIdx; (void)runData; (void)inRunOff; (void)frameSize;
  cheng_digest_unexpected_host_call("cheng_scene_media_es_sink_frame");
  return -1;
}
void cheng_host_publish(const char* selectedMediaPath, const char* publishKind, const char* publishPayloadJson) {
  (void)selectedMediaPath;
  (void)publishKind;
  (void)publishPayloadJson;
  cheng_digest_unexpected_host_call("cheng_host_publish");
}
void cheng_host_open_file_picker(const char* refName, const char* kind,
                                 const char* resultMode, const char* resultStateRef) {
  (void)refName; (void)kind; (void)resultMode; (void)resultStateRef;
  cheng_digest_unexpected_host_call("cheng_host_open_file_picker");
}
/* GPS capture in the static digest driver returns the fix synchronously (the Cheng runtime does
 * the state writeback, so no async set_state sink is needed here). Deterministic and gated only by
 * CHENG_FAKE_LOCATION: an injected "lat,lon,acc" yields "ok:<lat>, <lon>", anything else yields an
 * "err:unavailable:…" failure. Never a real GPS read, never a fabricated fix. Route-enter fires
 * this for publish routes during compute_frame_digest; the returned string is copied immediately
 * by the Cheng side, so a static buffer is safe in the single-threaded digest. */
const char* cheng_host_capture_location(int32_t timeoutMs, int32_t maxAgeMs,
                                        const char* previewRef, const char* statusRef,
                                        const char* messageRef) {
  (void)timeoutMs; (void)maxAgeMs; (void)statusRef; (void)messageRef;
  static char result[256];
  /* Publish pages (previewRef=locationMessage) show a desensitized reverse-geocoded
   * address (PWA formatContentLocationLabel), NOT the raw coordinate. CHENG_FAKE_LOCATION_ADDR
   * injects that already-clipped display text deterministically so the address-display path is
   * gate-testable without an ingress reverse-geocode server. Chat (previewRef=locationName)
   * keeps the coordinate label. */
  const char* fakeAddr = getenv("CHENG_FAKE_LOCATION_ADDR");
  if (fakeAddr != NULL && fakeAddr[0] != '\0' && previewRef != NULL &&
      strcmp(previewRef, "locationMessage") == 0) {
    snprintf(result, sizeof(result), "ok:%s", fakeAddr);
    fprintf(stderr, "digest host: CHENG_FAKE_LOCATION_ADDR injected %s\n", fakeAddr);
    return result;
  }
  const char* fake = getenv("CHENG_FAKE_LOCATION");
  if (fake != NULL && fake[0] != '\0') {
    double lat = 0.0, lon = 0.0, acc = 0.0;
    if (sscanf(fake, "%lf,%lf,%lf", &lat, &lon, &acc) >= 2) {
      snprintf(result, sizeof(result), "ok:%.6f, %.6f", lat, lon);
      fprintf(stderr, "digest host: CHENG_FAKE_LOCATION injected %.6f, %.6f\n", lat, lon);
      return result;
    }
    fprintf(stderr, "digest host: CHENG_FAKE_LOCATION malformed '%s' (want lat,lon,acc)\n", fake);
  }
  return "err:unavailable:定位服务不可用，请检查 GPS 开关";
}
static int32_t cheng_digest_json_has_nonempty_string_field(const char* json, const char* key) {
  if (json == NULL || key == NULL || key[0] == '\0') return 0;
  char needle[96];
  int written = snprintf(needle, sizeof(needle), "\"%s\"", key);
  if (written <= 0 || written >= (int)sizeof(needle)) return 0;
  const char* cursor = json;
  while ((cursor = strstr(cursor, needle)) != NULL) {
    const char* p = cursor + written;
    while (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t') p++;
    if (*p != ':') {
      cursor += 1;
      continue;
    }
    p++;
    while (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t') p++;
    if (*p != '"') {
      cursor += 1;
      continue;
    }
    p++;
    if (*p != '"' && *p != '\0') return 1;
    cursor += 1;
  }
  return 0;
}
int32_t cheng_host_open_content_location(const char* contentJson) {
  if (contentJson == NULL || contentJson[0] == '\0') return 0;
  if (contentJson[0] != '{') return -1;
  static const char* keys[] = {
    "locationHint",
    "location",
    "country",
    "province",
    "city",
    "district",
  };
  for (size_t i = 0; i < sizeof(keys) / sizeof(keys[0]); i++) {
    if (cheng_digest_json_has_nonempty_string_field(contentJson, keys[i])) return 1;
  }
  return 0;
}
const char* cheng_host_social_groups_create(const char* groupMetaJson) {
  (void)groupMetaJson;
  cheng_digest_unexpected_host_call("cheng_host_social_groups_create");
  return "";
}
const char* cheng_host_social_synccast_control(const char* requestJson) {
  (void)requestJson;
  cheng_digest_unexpected_host_call("cheng_host_social_synccast_control");
  return "";
}
const char* cheng_host_social_synccast_refresh(const char* requestJson) {
  (void)requestJson;
  cheng_digest_unexpected_host_call("cheng_host_social_synccast_refresh");
  return "";
}
const char* cheng_host_region_policy_refresh(const char* requestJson) {
  (void)requestJson;
  cheng_digest_unexpected_host_call("cheng_host_region_policy_refresh");
  return "";
}
/* Profile asset-action submit (points/rwad recharge/transfer). The submit button lives inside the
 * assetActionState-gated modal (default null), so the digest frame/edge walk never opens it and
 * must never call this host bridge; if it ever does, that is a real regression — abort loudly
 * rather than fabricate a transfer result. */
const char* cheng_host_profile_asset_action_submit(const char* requestJson) {
  (void)requestJson;
  cheng_digest_unexpected_host_call("cheng_host_profile_asset_action_submit");
  return "";
}
/* Profile peerId refresh fires on tab_profile route enter (frame digest walks every route),
 * so the digest host must answer instead of aborting. CHENG_FAKE_PEER_ID injects a
 * deterministic identity for desktop/device digest parity; without it the host honestly
 * reports unavailable and the peerId text keeps its static fallback on both sides. */
const char* cheng_host_profile_peer_id_refresh(void) {
  static char peer_result[320];
  const char* fake = getenv("CHENG_FAKE_PEER_ID");
  if (fake != NULL && fake[0] != '\0') {
    snprintf(peer_result, sizeof(peer_result), "{\"ok\":true,\"peerId\":\"%s\"}", fake);
    return peer_result;
  }
  return "{\"ok\":false,\"error\":\"peer_identity_unavailable\"}";
}
const char* cheng_host_node_contents_refresh(const char* requestJson) {
  (void)requestJson;
  cheng_digest_unexpected_host_call("cheng_host_node_contents_refresh");
  return "";
}
/* Nodes snapshot refresh fires on tab_nodes route enter (frame digest walks every route),
 * so the digest host must answer honestly instead of aborting. This is byte-identical to
 * what libp2p_network_discovery_snapshot's stub backend (unimaker_android_social_group_backend.cheng)
 * actually returns today for a freshly-initialized handle: a real (empty) discovery result,
 * never a fabricated peer list. */
const char* cheng_host_nodes_snapshot_refresh(void) {
  return "{\"ok\":true,\"peerId\":\"\",\"connectedPeers\":[],\"connectedPeersInfo\":[],\"discoveredPeers\":{\"peers\":[],\"totalCount\":0},\"mdnsDebug\":{},\"autoConnect\":{\"attempted\":0,\"connected\":0},\"mdnsProbeOk\":false,\"bootstrap\":{\"ok\":false},\"lastError\":\"\"}";
}
const char* cheng_host_clear_published_contents(const char* requestJson) {
  (void)requestJson;
  cheng_digest_unexpected_host_call("cheng_host_clear_published_contents");
  return "";
}
const char* cheng_host_content_delete(const char* requestJson) {
  (void)requestJson;
  cheng_digest_unexpected_host_call("cheng_host_content_delete");
  return "";
}
const char* cheng_host_rwad_nfc_receive_toggle(const char* walletId, int32_t active) {
  (void)walletId; (void)active;
  cheng_digest_unexpected_host_call("cheng_host_rwad_nfc_receive_toggle");
  return "";
}
const char* cheng_host_profile_bio_did_create(const char* requestJson) {
  (void)requestJson;
  cheng_digest_unexpected_host_call("cheng_host_profile_bio_did_create");
  return "";
}
const char* cheng_host_profile_bio_did_import(const char* recoveryRaw) {
  (void)recoveryRaw;
  cheng_digest_unexpected_host_call("cheng_host_profile_bio_did_import");
  return "";
}
const char* cheng_host_trading_refresh(const char* requestJson) {
  (void)requestJson;
  cheng_digest_unexpected_host_call("cheng_host_trading_refresh");
  return "";
}
void cheng_host_clipboard_write_text(const char* text) {
  (void)text;
  cheng_digest_unexpected_host_call("cheng_host_clipboard_write_text");
}
int32_t cheng_host_fullscreen_active(void) {
  return 0;
}
void cheng_host_request_fullscreen(void) {
  cheng_digest_unexpected_host_call("cheng_host_request_fullscreen");
}
void cheng_host_exit_fullscreen(void) {
  cheng_digest_unexpected_host_call("cheng_host_exit_fullscreen");
}
int32_t cheng_host_video_paused(const char* slotId) {
  (void)slotId;
  return 1;
}
void cheng_host_video_play_slot(const char* slotId) {
  (void)slotId;
  cheng_digest_unexpected_host_call("cheng_host_video_play_slot");
}
void cheng_host_video_pause_slot(const char* slotId) {
  (void)slotId;
  cheng_digest_unexpected_host_call("cheng_host_video_pause_slot");
}
void cheng_host_video_set_muted(const char* slotId, int32_t muted) {
  (void)slotId; (void)muted;
  cheng_digest_unexpected_host_call("cheng_host_video_set_muted");
}

int32_t cheng_native_stream_send(int32_t fd, const void* data, int32_t len) {
  (void)fd; (void)data; (void)len;
  cheng_digest_unexpected_host_call("cheng_native_stream_send");
  return -1;
}
int32_t cheng_native_stream_recv(int32_t fd, void* data, int32_t len) {
  (void)fd; (void)data; (void)len;
  cheng_digest_unexpected_host_call("cheng_native_stream_recv");
  return -1;
}
int32_t cheng_fd_wait_readable_bridge(int32_t fd, int32_t timeoutMs) {
  (void)fd; (void)timeoutMs;
  cheng_digest_unexpected_host_call("cheng_fd_wait_readable_bridge");
  return -1;
}
int32_t cheng_fd_wait_writable_bridge(int32_t fd, int32_t timeoutMs) {
  (void)fd; (void)timeoutMs;
  cheng_digest_unexpected_host_call("cheng_fd_wait_writable_bridge");
  return -1;
}
int32_t cheng_mobile_protect_fd(int32_t fd) {
  (void)fd;
  cheng_digest_unexpected_host_call("cheng_mobile_protect_fd");
  return 0;
}
int32_t cheng_mobile_udp_fd_wait_readable(int32_t fd, int32_t timeoutMs) {
  (void)fd; (void)timeoutMs;
  cheng_digest_unexpected_host_call("cheng_mobile_udp_fd_wait_readable");
  return -1;
}
int32_t cheng_mobile_udp_recvfrom_addr_ptr_bridge(int32_t fd, void* data, int32_t len,
                                                  void* addr, void* addrLen) {
  (void)fd; (void)data; (void)len; (void)addr; (void)addrLen;
  cheng_digest_unexpected_host_call("cheng_mobile_udp_recvfrom_addr_ptr_bridge");
  return -1;
}
void cheng_mobile_udp_debug_event(int32_t code, int32_t a, int32_t b, int32_t c) {
  (void)code; (void)a; (void)b; (void)c;
}
int32_t cheng_udp_platform_use_len_field_bridge(void) {
  return 1;
}
int32_t cheng_system_entropy_fill(void* out, int32_t byteCount) {
  (void)out; (void)byteCount;
  cheng_digest_unexpected_host_call("cheng_system_entropy_fill");
  return -1;
}
int32_t c_iometer_call(void) {
  cheng_digest_unexpected_host_call("c_iometer_call");
  return -1;
}

int32_t libc_socket(int32_t domain, int32_t type, int32_t protocol) {
  return socket(domain, type, protocol);
}
int32_t libc_connect(int32_t fd, const void* addr, int32_t addrLen) {
  return connect(fd, (const struct sockaddr*)addr, (socklen_t)addrLen);
}
int32_t libc_bind(int32_t fd, const void* addr, int32_t addrLen) {
  return bind(fd, (const struct sockaddr*)addr, (socklen_t)addrLen);
}
int32_t libc_setsockopt(int32_t fd, int32_t level, int32_t optName,
                        const void* optVal, int32_t optLen) {
  return setsockopt(fd, level, optName, optVal, (socklen_t)optLen);
}
int32_t libc_getsockname(int32_t fd, void* addr, void* addrLen) {
  return getsockname(fd, (struct sockaddr*)addr, (socklen_t*)addrLen);
}
int32_t libc_sendto(int32_t fd, const void* data, int32_t len, int32_t flags,
                    const void* addr, int32_t addrLen) {
  return (int32_t)sendto(fd, data, (size_t)len, flags,
                         (const struct sockaddr*)addr, (socklen_t)addrLen);
}
int32_t libc_shutdown(int32_t fd, int32_t how) {
  return shutdown(fd, how);
}
int32_t libc_close(int32_t fd) {
  return close(fd);
}
int32_t libc_fcntl(int32_t fd, int32_t cmd, int32_t arg) {
  return fcntl(fd, cmd, arg);
}
int32_t libc_inet_pton(int32_t af, const char* src, void* dst) {
  return inet_pton(af, src, dst);
}
const char* libc_inet_ntop(int32_t af, const void* src, char* dst, int32_t size) {
  return inet_ntop(af, src, dst, (socklen_t)size);
}

/* ---- LIVE_MIRROR_CAMPAIGN P1: 换装请求查询 + 睡眠 ---- */

static uint32_t cheng_hs_bin_crc32_from_env(const char* envName) {
  const char* path = getenv(envName);
  if (path == NULL || path[0] == '\0') return 0u;
  FILE* f = fopen(path, "rb");
  if (f == NULL) return 0u;
  uint32_t crc = 0xffffffffu;
  uint8_t buf[65536];
  size_t n;
  while ((n = fread(buf, 1u, sizeof(buf), f)) > 0) {
    for (size_t i = 0; i < n; i++) {
      crc ^= (uint32_t)buf[i];
      for (int bit = 0; bit < 8; bit++) {
        uint32_t mask = 0u - (crc & 1u);
        crc = (crc >> 1u) ^ (0xedb88320u & mask);
      }
    }
  }
  fclose(f);
  return crc ^ 0xffffffffu;
}

int32_t cheng_mobile_host_swap_request_query(int32_t* version, int32_t* byteCount,
                                             int32_t* crc32v, int32_t* flags) {
  const char* path = getenv("CHENG_HS_SWAP_REQUEST");
  if (path == NULL || path[0] == '\0') {
    fprintf(stderr, "hotswap host: env CHENG_HS_SWAP_REQUEST not set\n");
    return 2;
  }
  FILE* f = fopen(path, "rb");
  if (f == NULL) return 1;
  char line[256];
  size_t n = fread(line, 1u, sizeof(line) - 1u, f);
  fclose(f);
  line[n] = '\0';
  int v = 0;
  int bc = 0;
  int fl = 0;
  if (sscanf(line, "SWAP %d %d %d", &v, &bc, &fl) != 3) return 3;
  if (version) *version = (int32_t)v;
  if (byteCount) *byteCount = (int32_t)bc;
  if (flags) *flags = (int32_t)fl;
  if (crc32v) *crc32v = (int32_t)cheng_hs_bin_crc32_from_env("CHENG_DIGEST_SCENE_DATA");
  cheng_hs_last_ack_version = (int32_t)v;
  return 0;
}

void cheng_hs_sleep_ms(int32_t ms) {
  if (ms <= 0) return;
  struct timespec ts;
  ts.tv_sec = (time_t)(ms / 1000);
  ts.tv_nsec = (long)(ms % 1000) * 1000000L;
  nanosleep(&ts, NULL);
}
