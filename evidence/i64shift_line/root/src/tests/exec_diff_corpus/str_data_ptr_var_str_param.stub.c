/* str_data_ptr_var_str_param.stub.c — runtime bridge for the G10 fixture.
 *
 * The fixture's `main` is the entry. It builds a writable 4-byte str via the
 * concat bridge ("ab"+"cd"), then writes 4 bytes into it through StrDataPtr(out)
 * on a `var str` param and reads them back via inline str indexing — no str
 * crosses the C ABI. This stub supplies the small runtime symbols the emitted
 * code references:
 *   - driver_c_str_from_utf8_copy_bridge : str-literal -> ChengStrBridge
 *   - driver_c_str_concat_bridge         : (a,b) -> ChengStrBridge (new buffer)
 *   - setMem
 *   - cheng_rawmem_write_i8              : dst[idx] = (int8)v   (the byte writer
 *                                          StrDataPtr(out) feeds; see
 *                                          rawmem_support.RawmemWriteI8)
 * Both str bridges are ABI-exact w.r.t. ChengStrBridge {ptr,len,store_id,flags}
 * and mirror src/core/runtime/program_support_backend.cheng (concat = alloc
 * lenA+lenB, copy A then B, len=total). The fixture is its own `main`, so this
 * stub defines NO main (the harness aliases the fixture's mangled _main).
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct ChengStrBridge {
    const char* ptr;
    int32_t len;
    int32_t store_id;
    int32_t flags;
} ChengStrBridge;

void setMem(void* dest, int32_t val, int32_t size) {
    if (size <= 0) return;
    memset(dest, val, (size_t)size);
}

void cheng_rawmem_write_i8(void* dst, int32_t idx, int8_t v) {
    ((char*)dst)[idx] = (char)v;
}

ChengStrBridge driver_c_str_from_utf8_copy_bridge(const char* raw, int32_t n) {
    ChengStrBridge s;
    char* buf = (char*)malloc((size_t)n + 1);
    if (n > 0) memcpy(buf, raw, (size_t)n);
    buf[n] = '\0';
    s.ptr = buf; s.len = n; s.store_id = 0; s.flags = 1;
    return s;
}

/* @abi_internal: the real bridge (program_support_backend.cheng:4225) takes its
 * str args BY POINTER (callee reads a->/b->), return via sret. The previous
 * by-value signature put both 24-byte structs in SysV MEMORY class and read
 * stack slots the driver never populates -> garbage ptr/len (segfault). */
ChengStrBridge driver_c_str_concat_bridge(const ChengStrBridge* a, const ChengStrBridge* b) {
    int32_t total = a->len + b->len;
    ChengStrBridge s;
    if (total <= 0) { s.ptr = ""; s.len = 0; s.store_id = 0; s.flags = 1; return s; }
    char* buf = (char*)malloc((size_t)total + 1);
    if (a->len > 0) memcpy(buf, a->ptr, (size_t)a->len);
    if (b->len > 0) memcpy(buf + a->len, b->ptr, (size_t)b->len);
    buf[total] = '\0';
    s.ptr = buf; s.len = total; s.store_id = 0; s.flags = 1;
    return s;
}
