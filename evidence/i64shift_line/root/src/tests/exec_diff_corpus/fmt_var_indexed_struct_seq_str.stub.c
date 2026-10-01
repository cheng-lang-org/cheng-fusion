/* fmt_var_indexed_struct_seq_str.stub.c — runtime bridges for the G5 wcz fixture.
 *
 * Form under test: `var x = bag.rows[i].labels[j]` — a local STR initialized from
 * a DOUBLE-index chain (`bag.rows[i]` indexes a seq-of-struct; `.labels[j]` then
 * indexes a str-seq field of that struct element). The front-end mis-infers the
 * local's type as the intermediate struct type (`Row`), stopping the chain at
 * `bag.rows[i]` and dropping the `.labels[j]` tail. The backend then minted an
 * Aggregate slot for `x`; the str value's node-eval store mismatched the slot
 * shape (store_shape miss), the line lowered to a zero-word invalid op, and the
 * whole function fell to word-count-zero (cold). The fix re-types the slot by the
 * RHS node-eval probe (which walks the real field/index chain to a str leaf).
 *
 * The fixture's `main` builds the seq-of-struct + str-seq and observes only
 * Len(...) (a scalar) — no str crosses the C ABI. This stub supplies the runtime
 * symbols the emitted code references, each ABI-exact w.r.t. the production
 * runtime (mirrors src/std/system_helpers_backend.cheng and
 * src/core/runtime/program_support_backend.cheng):
 *   str { char* data; int32 len; int32 store_id; int32 flags }  (24 bytes)
 *   seq { int32 len;  int32 cap; void* buffer }                 (16 bytes)
 *   - setMem                              : zero/byte-fill
 *   - cheng_index_ptr_local(buf,idx,esz)  : element address
 *   - cheng_seq_set_grow(seqPtr,idx,esz)  : grow seq so idx is valid, return addr
 *   - cheng_seq_str_add(seqPtr,valuePtr)  : append 24-byte str to seq-of-str
 *   - driver_c_str_from_utf8_copy_bridge  : cstr-literal -> str (sret)
 * The fixture is its own `main`, so this stub defines NO main (the harness
 * aliases the mangled _main).
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

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

void* cheng_index_ptr_local(void* buffer, int32_t idx, int32_t elemSize) {
    if (buffer == NULL || elemSize <= 0) return NULL;
    return (char*)buffer + (int64_t)idx * (int64_t)elemSize;
}

void* cheng_seq_set_grow(void* seqPtr, int32_t idx, int32_t elemSize) {
    if (seqPtr == NULL || elemSize <= 0)
        return cheng_index_ptr_local(NULL, idx, elemSize);
    ChengSeqHeader* h = (ChengSeqHeader*)seqPtr;
    if (idx < 0)
        return cheng_index_ptr_local(h->buffer, idx, elemSize);
    int32_t needLen = idx + 1;
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
        if (newBuf == NULL)
            return cheng_index_ptr_local(h->buffer, idx, elemSize);
        if (newCap > oldCap) {
            int64_t off = (int64_t)oldCap * (int64_t)elemSize;
            int64_t zeroBytes = ((int64_t)newCap - (int64_t)oldCap) * (int64_t)elemSize;
            memset((char*)newBuf + off, 0, (size_t)zeroBytes);
        }
        h->buffer = newBuf;
        h->cap = newCap;
    }
    if (needLen > h->len) h->len = needLen;
    return cheng_index_ptr_local(h->buffer, idx, elemSize);
}

ChengStr driver_c_str_from_utf8_copy_bridge(const char* raw, int32_t n) {
    ChengStr s;
    char* buf = (char*)malloc((size_t)n + 1);
    if (n > 0) memcpy(buf, raw, (size_t)n);
    buf[n] = '\0';
    s.data = buf; s.len = n; s.store_id = 0; s.flags = 1;
    return s;
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
