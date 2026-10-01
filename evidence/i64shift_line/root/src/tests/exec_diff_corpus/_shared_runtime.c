/* _shared_runtime.c — shared C runtime stub for the exec_diff net.
 *
 * Motivation: in the pre-wcz=0 world the pure driver's --emit:exe path fails on
 * almost every fixture, because emitting a self-contained executable requires
 * the WHOLE linked runtime to be word-count-zero clean (no WCZ functions in the
 * runtime the exe pulls in). That made the net mostly-SKIP and therefore blind.
 *
 * --emit:obj does NOT have that whole-program requirement: it lowers only the
 * fixture's own functions to a relocatable .o. The undefined runtime symbols the
 * fixture references are then satisfied by linking against this C stub, exactly
 * like the bail_622 ptr_cast_bridge fixture already did. This stub provides the
 * small set of runtime symbols a value-correctness fixture actually needs, so
 * the bulk of the corpus can RUN (driver-obj vs stage3-obj) and diff the runtime
 * result — the whole point of the net.
 *
 * The symbol set was determined empirically: `nm -u` on each driver-emitted .o.
 *   - struct fixtures            -> setMem
 *   - seq fixtures (add/index)   -> setMem + cheng_seq_set_grow
 *   - str-bridge fixtures        -> driver_c_str_from_utf8_copy_bridge + setMem
 * Pure-arithmetic fixtures reference nothing here (libc calloc/free only).
 *
 * Each helper is an ABI-EXACT reimplementation of the pure-Cheng runtime in
 * src/std/system_helpers_backend.cheng (cheng_seq_set_grow / cheng_index_ptr /
 * setMem). Faithfulness matters: this stub stands in for the runtime ONLY so the
 * fixture's own emitted code can run; if the stub diverged from the real runtime
 * semantics it could mask or fabricate a divergence. realloc/memset are the exact
 * libc primitives the real helpers call (cHeapResize=realloc, c_memset=memset).
 *
 * This stub deliberately defines NO `main`: each fixture supplies its own
 * `fn main(): int32` (driver mangles it; the harness aliases the mangled symbol
 * to `_main`. stage3 emits clean `_main`). The observable is the process exit
 * code + stdout, identical on both sides iff the codegen agrees.
 */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <unistd.h>
#include <pthread.h>

/* ---- ChengSeqHeader: { int32 len; int32 cap; void* buffer; } (16 bytes) ----
 * Layout mirrors src/std/system_helpers_backend.cheng:211. */
typedef struct ChengSeqHeader {
    int32_t len;
    int32_t cap;
    void*   buffer;
} ChengSeqHeader;

/* setMem(dest, val, size) — zero/byte-fill. Mirrors c_memset usage in the
 * runtime (e.g. var-seq / struct-local zero-init). */
void setMem(void* dest, int32_t val, int32_t size) {
    if (size <= 0) return;
    memset(dest, val, (size_t)size);
}

/* cheng_index_ptr(base, len, idx, elemSize) — bounds-unchecked element address.
 * The runtime calls cheng_bounds_check(len, idx) first; in this exec_diff
 * context the fixtures index only in-bounds, and the real bounds_check merely
 * traps on OOB, so reproducing the address arithmetic is the faithful behavior. */
static void* cheng_index_ptr_local(void* base, int32_t idx, int32_t elemSize) {
    if (base == NULL || elemSize <= 0) return base;
    int64_t off = (int64_t)idx * (int64_t)elemSize;
    return (void*)((char*)base + off);
}

/* cheng_seq_set_grow(seqPtr, idx, elemSize) — ABI-exact reimplementation of
 * src/std/system_helpers_backend.cheng:752. Grows the seq so `idx` is a valid
 * slot, zero-inits newly-grown bytes, bumps len to idx+1 if needed, and returns
 * the address of element `idx`. This is the helper `add(seq, v)` and indexed
 * stores lower to. */
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

/* cheng_seq_set_len(seqPtr, newLen, elemSize) — ABI-exact reimplementation of
 * src/core/runtime/program_support_backend.cheng cheng_seq_set_len_export.
 * Clamps newLen to >=0, grows (same cap-doubling as set_grow) when target>cap or
 * (target>0 && buffer==NULL), zero-fills the newly exposed tail when target>len,
 * then sets len=target. This is what setLen(seq, n) lowers to. */
void cheng_seq_set_len(void* seqPtr, int32_t newLen, int32_t elemSize) {
    if (seqPtr == NULL || elemSize <= 0) return;
    ChengSeqHeader* h = (ChengSeqHeader*)seqPtr;
    int32_t target = newLen;
    if (target < 0) target = 0;
    if (target > h->cap || (target > 0 && h->buffer == NULL)) {
        int32_t newCap = h->cap;
        if (newCap < 4) newCap = 4;
        while (newCap < target) {
            int32_t doubled = newCap * 2;
            if (doubled <= 0) { newCap = target; break; }
            newCap = doubled;
        }
        int32_t oldCap = h->cap;
        int64_t bytes = (int64_t)newCap * (int64_t)elemSize;
        void* newBuf = realloc(h->buffer, (size_t)bytes);
        if (newBuf == NULL) return;
        if (newCap > oldCap) {
            int64_t off = (int64_t)oldCap * (int64_t)elemSize;
            int64_t zeroBytes = ((int64_t)newCap - (int64_t)oldCap) * (int64_t)elemSize;
            memset((char*)newBuf + off, 0, (size_t)zeroBytes);
        }
        h->buffer = newBuf;
        h->cap = newCap;
    }
    if (target > h->len) {
        int64_t fromBytes = (int64_t)h->len * (int64_t)elemSize;
        int64_t toBytes = (int64_t)target * (int64_t)elemSize;
        if (toBytes > fromBytes)
            memset((char*)h->buffer + fromBytes, 0, (size_t)(toBytes - fromBytes));
    }
    h->len = target;
}

/* cheng_seq_header_len_get(seqPtr) / cheng_seq_header_len_set(seqPtr, value) —
 * ABI-exact reimplementations of program_support_backend.cheng:3024/3031. These
 * read/write the seq header `len` field; `seq.len` lowers to the getter. */
int32_t cheng_seq_header_len_get(void* seqPtr) {
    if (seqPtr == NULL) return 0;
    return ((ChengSeqHeader*)seqPtr)->len;
}

void cheng_seq_header_len_set(void* seqPtr, int32_t value) {
    if (seqPtr == NULL) return;
    ((ChengSeqHeader*)seqPtr)->len = value;
}

/* ---- str bridge (used by ptr_cast_bridge-style fixtures) ----
 * ChengStrBridge { const char* ptr; int32 len; int32 store_id; int32 flags; } */
typedef struct ChengStrBridge {
    const char* ptr;
    int32_t len;
    int32_t store_id;
    int32_t flags;
} ChengStrBridge;

ChengStrBridge driver_c_str_from_utf8_copy_bridge(const char* raw, int32_t n) {
    ChengStrBridge s;
    char* buf = (char*)malloc((size_t)n + 1);
    if (n > 0) memcpy(buf, raw, (size_t)n);
    buf[n] = '\0';
    s.ptr = buf; s.len = n; s.store_id = 0; s.flags = 1;
    return s;
}

/* cheng_seq_str_add(seqPtr, valuePtr) — append the 24-byte str at valuePtr to a
 * seq-of-str (cap-doubling grow). ABI-exact reimplementation of
 * src/core/runtime/program_support_backend.cheng:1379. This is what a str array
 * literal `[a, b]` materialized as a `str[]` call argument lowers each element
 * store to (zero-init seq + per-element add). */
void cheng_seq_str_add(void* seqPtr, void* valuePtr) {
    if (seqPtr == NULL || valuePtr == NULL) return;
    ChengSeqHeader* h = (ChengSeqHeader*)seqPtr;
    int32_t needLen = h->len + 1;
    int32_t elemSize = (int32_t)sizeof(ChengStrBridge);
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
    ChengStrBridge* slot = (ChengStrBridge*)((char*)h->buffer + (int64_t)h->len * elemSize);
    *slot = *(ChengStrBridge*)valuePtr;
    h->len = needLen;
}

/* ---- atomic i32 (single-thread + cross-thread) ----
 * ABI-exact reimplementations of the cheng_atomic_*_i32 exports in
 * src/core/runtime/program_support_backend.cheng:2697-2719. Each real export
 * null-checks p then delegates to the machine atomic intrinsic (LOCK-prefixed /
 * full barrier). __atomic_* with SEQ_CST reproduces that faithfully: value-exact
 * for the single-thread atomic fixtures and race-free for thread_spawn_join.
 * CAS returns 1 on success / 0 on failure (the fixture's assert convention);
 * fetch_add returns the OLD value (fixture: fetchAdd(10,5)==10, cell->15). */
int32_t cheng_atomic_load_i32(void* p) {
    if (p == NULL) return 0;
    return __atomic_load_n((int32_t*)p, __ATOMIC_SEQ_CST);
}

void cheng_atomic_store_i32(void* p, int32_t val) {
    if (p == NULL) return;
    __atomic_store_n((int32_t*)p, val, __ATOMIC_SEQ_CST);
}

int32_t cheng_atomic_cas_i32(void* p, int32_t expect, int32_t desired) {
    if (p == NULL) return 0;
    int32_t exp = expect;
    return __atomic_compare_exchange_n((int32_t*)p, &exp, desired, 0,
                                       __ATOMIC_SEQ_CST, __ATOMIC_SEQ_CST) ? 1 : 0;
}

int32_t cheng_atomic_fetch_add_i32(void* p, int32_t delta) {
    if (p == NULL) return 0;
    return __atomic_fetch_add((int32_t*)p, delta, __ATOMIC_SEQ_CST);
}

/* cheng_malloc(size) — the RC-registry allocator export
 * (program_support_backend.cheng:2427). Returns a zeroed payload of >=size
 * bytes, non-null. The fixtures that reference it (atomic.NewI32 -> new(I32),
 * struct new) neither free nor refcount the result — `nm -u` shows no
 * cheng_mem_release / cheng_mem_retain — so a zeroed heap block is behaviorally
 * exact here: the real allocator's ChengMemHeader + registry are internal and
 * unobserved by these fixtures. size<=0 clamps to 1, mirroring the real clamp. */
void* cheng_malloc(int32_t size) {
    int32_t n = size;
    if (n <= 0) n = 1;
    return calloc(1, (size_t)n);
}

/* cheng_panic_cstring_and_exit(text) — program_support_backend.cheng:4521:
 * emit the cstring as a line to stderr, exit(1). Never reached on the happy
 * path of these fixtures; present so the panic branches link. */
void cheng_panic_cstring_and_exit(const char* text) {
    const char* msg = (text != NULL && text[0] != '\0') ? text : "panic";
    fputs(msg, stderr);
    fputc('\n', stderr);
    _exit(1);
}

/* dr_cstrlen(p) — datareloc_ordinal_stress's @importc("dr_cstrlen"): a plain
 * C strlen returned as int32 (the fixture asserts cstrlen("aa")==2 etc). */
int32_t dr_cstrlen(const char* p) {
    if (p == NULL) return 0;
    return (int32_t)strlen(p);
}

/* __cheng_call_indirect_sret_agg1(sret, fnptr, arg) — the sret-forwarding
 * indirect-call thunk the backend leaves undefined under --emit:obj. ABI derived
 * from the backend thunk template (primary_object_plan.cheng:47781, a64:
 * X16=fnptr; X0=arg; BLR X16; sret kept untouched in X8) and confirmed by
 * disassembling the caller useMaker on x86_64: the thunk is entered with
 * RDI=sret_dest, RSI=fnptr, RDX=arg, and must invoke the target as
 * makePair(RDI=sret_dest, RSI=arg) — SysV sret pointer in RDI, first explicit
 * arg in RSI. The callee writes its aggregate result through the sret pointer. */
void __cheng_call_indirect_sret_agg1(void* sret, void* fnptr, long arg) {
    ((void (*)(void*, long))fnptr)(sret, arg);
}

/* ---- thread spawn/join (pthread) ----
 * cheng_thread_start / cheng_thread_join — ABI-exact reimplementations of
 * program_support_backend.cheng:2772 / 2790. start allocates a {fn_ptr, ctx}
 * task, pthread_creates an entry that reads the task, frees it, then calls
 * fnPtr(ctx) (the __cheng_call_indirect_void semantics of the real
 * cheng_thread_entry_runtime); it returns the pthread_t as an opaque handle.
 * join returns 1 on pthread_join success, 0 on failure. The real runtime uses a
 * 16MB worker stack; the corpus workers are shallow (one atomic add) so the
 * default stack is sufficient and behavior-equivalent for the observable. */
typedef struct ChengThreadTask {
    void* fn_ptr;
    void* ctx;
    void* next;
} ChengThreadTask;

static void* cheng_thread_entry_stub(void* raw) {
    ChengThreadTask* t = (ChengThreadTask*)raw;
    void* fnPtr = t->fn_ptr;
    void* ctx = t->ctx;
    free(t);
    if (fnPtr != NULL) ((void (*)(void*))fnPtr)(ctx);
    return NULL;
}

void* cheng_thread_start(void* fnPtr, void* ctx) {
    if (fnPtr == NULL) return NULL;
    ChengThreadTask* t = (ChengThreadTask*)malloc(sizeof(ChengThreadTask));
    if (t == NULL) return NULL;
    t->fn_ptr = fnPtr;
    t->ctx = ctx;
    t->next = NULL;
    pthread_t th;
    if (pthread_create(&th, NULL, cheng_thread_entry_stub, t) != 0) {
        free(t);
        return NULL;
    }
    return (void*)th;
}

int32_t cheng_thread_join(void* thread) {
    if (thread == NULL) return 0;
    if (pthread_join((pthread_t)thread, NULL) != 0) return 0;
    return 1;
}
