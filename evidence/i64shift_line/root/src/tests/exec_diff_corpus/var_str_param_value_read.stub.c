/* string_concat.stub.c — runtime bridge for the string-concat fixture.
 *
 * The fixture's `main` is the entry; it builds str values via the concat bridge
 * and observes only Len(...) (a scalar) — no str crosses the C ABI. This stub
 * supplies the small runtime symbols the fixture's emitted code references:
 *   - driver_c_str_from_utf8_copy_bridge : str-literal -> ChengStrBridge
 *   - driver_c_str_concat_bridge         : (a,b) -> ChengStrBridge (new buffer)
 *   - setMem
 * Both bridges are ABI-exact w.r.t. ChengStrBridge {ptr,len,store_id,flags} and
 * mirror src/core/runtime/program_support_backend.cheng:3918 (concat = alloc
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
