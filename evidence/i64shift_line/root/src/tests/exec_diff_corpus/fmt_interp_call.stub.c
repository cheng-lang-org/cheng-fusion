/* fmt_interp_call.stub.c — str-building runtime bridges for the Fmt-interp-call
 * fixture (wcz Lane 3). The fixture's `main` is the entry; it builds str values
 * via Fmt interpolation and observes only Len(...) (a scalar) — no str crosses
 * the C ABI. This stub supplies the runtime symbols the fixture's emitted code
 * references, each ABI-exact w.r.t. the production runtime:
 *   str  { char* data; int32 len; int32 store_id; int32 flags }   (24 bytes)
 *   seq  { int32 len;  int32 cap; void* buffer }                  (16 bytes)
 * The fmt-parts seq holds 24-byte `str` elements; seq/str args pass BY ADDRESS.
 *   - setMem                              : zero/byte-fill
 *   - driver_c_str_from_utf8_copy_bridge  : cstr-literal -> str (sret)
 *   - cheng_i32_to_str_bridge             : int32 -> decimal str (sret)
 *   - cheng_seq_str_add(seqPtr, valuePtr) : append str to seq-of-str (cap-double)
 *   - cheng_strutils_join_bridge(seqPtr,sepPtr) : join seq-of-str by sep (sret)
 * Mirrors src/core/runtime/program_support_backend.cheng (cheng_seq_str_add /
 * cheng_strutils_join_bridge / cheng_i32_to_str_bridge). The fixture is its own
 * `main`, so this stub defines NO main (the harness aliases the mangled _main).
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

typedef struct ChengStr {
    char*   data;
    int32_t len;
    int32_t store_id;
    int32_t flags;
} ChengStr;

typedef struct ChengSeqHeader {
    int32_t len;
    int32_t cap;
    void*   buffer;
} ChengSeqHeader;

void setMem(void* dest, int32_t val, int32_t size) {
    if (size <= 0) return;
    memset(dest, val, (size_t)size);
}

ChengStr driver_c_str_from_utf8_copy_bridge(const char* raw, int32_t n) {
    ChengStr s;
    char* buf = (char*)malloc((size_t)n + 1);
    if (n > 0) memcpy(buf, raw, (size_t)n);
    buf[n] = '\0';
    s.data = buf; s.len = n; s.store_id = 0; s.flags = 1;
    return s;
}

ChengStr cheng_i32_to_str_bridge(int32_t value) {
    char tmp[16];
    int n = snprintf(tmp, sizeof(tmp), "%d", value);
    return driver_c_str_from_utf8_copy_bridge(tmp, n);
}

ChengStr cheng_i64_to_str_bridge(int64_t value) {
    char tmp[24];
    int n = snprintf(tmp, sizeof(tmp), "%lld", (long long)value);
    return driver_c_str_from_utf8_copy_bridge(tmp, n);
}

/* append the 24-byte str at valuePtr to the seq-of-str (cap-doubling grow). */
void cheng_seq_str_add(void* seqPtr, void* valuePtr) {
    if (seqPtr == NULL || valuePtr == NULL) return;
    ChengSeqHeader* h = (ChengSeqHeader*)seqPtr;
    int32_t needLen = h->len + 1;
    int32_t elemSize = (int32_t)sizeof(ChengStr);
    if (needLen > h->cap || h->buffer == NULL) {
        int32_t newCap = h->cap;
        if (newCap < 4) newCap = 4;
        while (newCap < needLen) {
            int32_t doubled = newCap * 2;
            if (doubled <= 0) { newCap = needLen; break; }
            newCap = doubled;
        }
        int32_t oldCap = h->cap;
        int64_t bytes = (int64_t)newCap * (int64_t)elemSize;
        void* newBuf = realloc(h->buffer, (size_t)bytes);
        if (newBuf == NULL) return;
        if (newCap > oldCap)
            memset((char*)newBuf + (int64_t)oldCap * elemSize, 0,
                   (size_t)(((int64_t)newCap - oldCap) * elemSize));
        h->buffer = newBuf;
        h->cap = newCap;
    }
    ChengStr* slot = (ChengStr*)((char*)h->buffer + (int64_t)h->len * elemSize);
    *slot = *(ChengStr*)valuePtr;
    h->len = needLen;
}

/* join the seq-of-str by sep. Both args pass BY ADDRESS; sret-returns a str. */
ChengStr cheng_strutils_join_bridge(ChengSeqHeader* partsPtr, ChengStr* sepPtr) {
    ChengSeqHeader parts = *partsPtr;
    ChengStr sep = *sepPtr;
    ChengStr* elems = (ChengStr*)parts.buffer;
    int32_t total = 0;
    for (int32_t i = 0; i < parts.len; i++) {
        total += elems[i].len;
        if (i + 1 < parts.len) total += sep.len;
    }
    char* buf = (char*)malloc((size_t)total + 1);
    int32_t pos = 0;
    for (int32_t i = 0; i < parts.len; i++) {
        if (elems[i].len > 0) memcpy(buf + pos, elems[i].data, (size_t)elems[i].len);
        pos += elems[i].len;
        if (i + 1 < parts.len && sep.len > 0) {
            memcpy(buf + pos, sep.data, (size_t)sep.len);
            pos += sep.len;
        }
    }
    buf[total] = '\0';
    ChengStr s; s.data = buf; s.len = total; s.store_id = 0; s.flags = 1;
    return s;
}
