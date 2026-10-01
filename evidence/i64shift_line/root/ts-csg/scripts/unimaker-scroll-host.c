/* UniMaker scroll-dump host shim.
 *
 * Linked into the scroll-dump driver executable (arm64-apple-darwin) built from the
 * regenerated scene-runtime source whose main drives cheng_app_scroll_by/get on route 0.
 * Provides the same heap/cstring helpers and file-backed scene/glyph asset readers the
 * digest host uses, plus a scroll_emit callback the driver main prints through. The
 * present/upload/prepare stubs are never invoked on the scroll path (no present), but
 * exist to satisfy the runtime's @importc host-render closure at link time.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ---- scroll emit callback (driver main prints through this) ---- */
void scroll_emit(int32_t tag, int32_t value) {
  printf("scroll tag=%d value=%d\n", tag, value);
  fflush(stdout);
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

/* ---- deterministic asset readers (file-backed, IEEE crc32 validated) ---- */
static uint32_t cheng_scroll_crc32_u8(const uint8_t* data, int byteCount) {
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

static int32_t cheng_scroll_read_asset_file(const char* envName, void* out,
                                            int32_t byteCount, int32_t expectedCrc32) {
  if (out == NULL || byteCount <= 0) return 1;
  const char* path = getenv(envName);
  if (path == NULL || path[0] == '\0') {
    fprintf(stderr, "scroll host: env %s not set\n", envName);
    return 2;
  }
  FILE* f = fopen(path, "rb");
  if (f == NULL) {
    fprintf(stderr, "scroll host: cannot open %s=%s\n", envName, path);
    return 3;
  }
  uint8_t* dst = (uint8_t*)out;
  size_t total = 0;
  while (total < (size_t)byteCount) {
    size_t n = fread(dst + total, 1u, (size_t)byteCount - total, f);
    if (n == 0) {
      fprintf(stderr, "scroll host: short read %s expected=%d got=%zu\n", path, byteCount, total);
      fclose(f);
      return 4;
    }
    total += n;
  }
  uint8_t probe;
  if (fread(&probe, 1u, 1u, f) != 0) {
    fprintf(stderr, "scroll host: asset %s longer than expected=%d\n", path, byteCount);
    fclose(f);
    return 5;
  }
  fclose(f);
  uint32_t actual = cheng_scroll_crc32_u8(dst, byteCount);
  if (actual != (uint32_t)expectedCrc32) {
    fprintf(stderr, "scroll host: crc mismatch %s actual=%08x expected=%08x\n",
            path, actual, (uint32_t)expectedCrc32);
    return 6;
  }
  return 0;
}

int32_t cheng_mobile_host_read_scene_data_asset(void* out, int32_t byteCount, int32_t expectedCrc32) {
  return cheng_scroll_read_asset_file("CHENG_DIGEST_SCENE_DATA", out, byteCount, expectedCrc32);
}
int32_t cheng_mobile_host_read_glyph_sdf_pixel_asset(void* out, int32_t byteCount, int32_t expectedCrc32) {
  return cheng_scroll_read_asset_file("CHENG_DIGEST_GLYPH_PIXELS", out, byteCount, expectedCrc32);
}

/* ---- present/upload/prepare stubs (never invoked on the scroll path) ---- */
void cheng_mobile_host_trace_step(int32_t step) { (void)step; }
void cheng_mobile_host_present(const void* pixels, int32_t w, int32_t h, int32_t stride) {
  (void)pixels; (void)w; (void)h; (void)stride;
}
void cheng_mobile_host_present_gpu_commands(const int32_t* commands, int commandCount,
                                            int commandStrideI32, int width, int height) {
  (void)commands; (void)commandCount; (void)commandStrideI32; (void)width; (void)height;
}
void cheng_mobile_host_present_compositor_frame(const int32_t* layers, int layerCount, int layerStrideI32,
                                                const int32_t* commands, int commandCount, int commandStrideI32,
                                                int width, int height) {
  (void)layers; (void)layerCount; (void)layerStrideI32;
  (void)commands; (void)commandCount; (void)commandStrideI32; (void)width; (void)height;
}
int cheng_mobile_host_present_media_surface_commands(const int32_t* commands, int commandCount,
                                                     int commandStrideI32, int width, int height) {
  (void)commands; (void)commandCount; (void)commandStrideI32; (void)width; (void)height;
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
  return -1;
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
