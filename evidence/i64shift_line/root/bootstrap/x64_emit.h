/* x64_emit.h -- Minimal x86_64 instruction encoder for cold compiler.
 *
 * Produces AMD64 machine code in a byte buffer.
 * Instructions are variable-length (1-15 bytes).
 * Uses AT&T operand order in comments (src, dst).
 *
 * Register encoding:
 *   RAX=0, RCX=1, RDX=2, RBX=3, RSP=4, RBP=5, RSI=6, RDI=7
 *   R8-R15: 8-15 with REX.B prefix
 *   32-bit variants: same numbers with no REX prefix (or REX.W=0)
 */

#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <limits.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <errno.h>

/* REX prefix: 0x40 | (W<<3) | (R<<2) | (X<<1) | B */
#define REX_W   0x48  /* 64-bit operand size */
#define REX_R   0x44  /* ModRM.reg extension */
#define REX_X   0x42  /* SIB.index extension */
#define REX_B   0x41  /* ModRM.rm or SIB.base extension */

/* ModRM byte: (mod<<6) | (reg<<3) | rm */
#define MODRM(mod, reg, rm) (((mod)<<6) | ((reg)<<3) | (rm))

/* SIB byte: (scale<<6) | (index<<3) | base */
#define SIB(scale, index, base) (((scale)<<6) | ((index)<<3) | (base))

/* Condition codes for Jcc / SETcc / CMOVcc */
enum { CC_O=0, CC_NO, CC_B, CC_AE, CC_E, CC_NE, CC_BE, CC_A,
       CC_S, CC_NS, CC_P, CC_NP, CC_L, CC_GE, CC_LE, CC_G };

/* ---- Byte buffer for x86_64 code ---- */
typedef struct {
    uint8_t *buf;
    int32_t cap;
    int32_t len;
    size_t committed_bytes;
    size_t reserved_bytes;
    size_t flushed_bytes;
    int backing_fd;
    bool file_backed;
    bool linux_syscalls;
    bool windows_abi;
    /* Immutable instruction-set authority for this object.  Baseline x86_64
       is zero; optional instructions may only be selected when every required
       bit was supplied by the target contract. */
    uint32_t target_feature_mask;
    /* Allow heap ops to lower to runtime malloc/free calls. Only valid in
       codegen drivers that resolve FunctionPatch entries into relocations. */
    bool heap_runtime_calls;
    int32_t *global_patch_pos;
    int32_t *global_patch_idx;
    int32_t *global_patch_dst;
    int32_t global_patch_count;
    int32_t global_patch_cap;
} X64Code;

static size_t x64_page_size(void) {
    long raw = sysconf(_SC_PAGESIZE);
    if (raw <= 0) abort();
    return (size_t)raw;
}

static size_t x64_page_aligned_bytes(size_t bytes) {
    size_t page = x64_page_size();
    if (bytes > SIZE_MAX - (page - 1)) abort();
    return (bytes + page - 1) / page * page;
}

static void x64_init_fields(X64Code *c, int32_t cap,
                            size_t committed, size_t reserved) {
    c->cap = (int32_t)committed;
    c->len = 0;
    c->committed_bytes = committed;
    c->reserved_bytes = reserved;
    c->flushed_bytes = 0;
    c->backing_fd = -1;
    c->file_backed = false;
#ifdef __linux__
    c->linux_syscalls = true;
#else
    c->linux_syscalls = false;
#endif
    c->windows_abi = false;
    c->target_feature_mask = 0;
    c->global_patch_pos = NULL;
    c->global_patch_idx = NULL;
    c->global_patch_dst = NULL;
    c->global_patch_count = 0;
    c->global_patch_cap = 0;
    (void)cap;
}

static void x64_init(X64Code *c, int32_t cap) {
    if (!c || cap <= 0) abort();
    size_t committed = x64_page_aligned_bytes((size_t)cap);
    size_t reserved = x64_page_aligned_bytes((size_t)INT32_MAX);
#if defined(MAP_ANONYMOUS)
    int anonymous_flag = MAP_ANONYMOUS;
#else
    int anonymous_flag = MAP_ANON;
#endif
    c->buf = mmap(NULL, reserved, PROT_NONE,
                  MAP_PRIVATE | anonymous_flag, -1, 0);
    if (c->buf == MAP_FAILED) abort();
    if (mprotect(c->buf, committed, PROT_READ | PROT_WRITE) != 0) {
        munmap(c->buf, reserved);
        abort();
    }
    x64_init_fields(c, cap, committed, reserved);
}

/* Large ELF text is an immutable append stream except for explicit patch
   sites.  Keep its virtual address stable for the encoder, but back it with
   an unlinked sparse file so completed clean ranges can leave the resident
   set before the whole object has been emitted. */
static void x64_init_file_backed(X64Code *c, int32_t cap,
                                 const char *output_path) {
    if (!c || cap <= 0 || !output_path || output_path[0] == '\0') abort();
    size_t committed = x64_page_aligned_bytes((size_t)cap);
    size_t reserved = x64_page_aligned_bytes((size_t)INT32_MAX);
    size_t path_len = strlen(output_path);
    static const char suffix[] = ".cheng-x64-spool.XXXXXX";
    if (path_len > SIZE_MAX - sizeof(suffix) ||
        path_len + sizeof(suffix) > (size_t)PATH_MAX) abort();
    char path[PATH_MAX];
    int rendered = snprintf(path, sizeof(path), "%s%s", output_path, suffix);
    if (rendered <= 0 || (size_t)rendered >= sizeof(path)) abort();
    int fd = mkstemp(path);
    if (fd < 0) abort();
    if (fchmod(fd, S_IRUSR | S_IWUSR) != 0 ||
        unlink(path) != 0 ||
        ftruncate(fd, (off_t)reserved) != 0) {
        close(fd);
        abort();
    }
    c->buf = mmap(NULL, reserved, PROT_READ | PROT_WRITE,
                  MAP_SHARED, fd, 0);
    if (c->buf == MAP_FAILED) {
        close(fd);
        abort();
    }
    x64_init_fields(c, cap, committed, reserved);
    c->backing_fd = fd;
    c->file_backed = true;
}

static void x64_flush_file_backed_prefix(X64Code *c) {
    if (!c || !c->file_backed) return;
    const size_t batch = (size_t)8u * 1024u * 1024u;
    size_t page = x64_page_size();
    size_t safe_end = (size_t)c->len / page * page;
    if (safe_end <= c->flushed_bytes ||
        safe_end - c->flushed_bytes < batch) return;
    size_t length = safe_end - c->flushed_bytes;
    if (msync(c->buf + c->flushed_bytes, length, MS_SYNC) != 0) abort();
#if defined(MAP_ANONYMOUS)
    int anonymous_flag = MAP_ANONYMOUS;
#else
    int anonymous_flag = MAP_ANON;
#endif
    void *retired = mmap(c->buf + c->flushed_bytes, length, PROT_NONE,
                         MAP_PRIVATE | anonymous_flag | MAP_FIXED, -1, 0);
    if (retired != c->buf + c->flushed_bytes) abort();
    c->flushed_bytes = safe_end;
}

static void x64_sync_file_backing(X64Code *c) {
    if (!c || !c->file_backed) return;
    size_t end = x64_page_aligned_bytes((size_t)c->len);
    if (end > c->flushed_bytes) {
        size_t length = end - c->flushed_bytes;
        if (msync(c->buf + c->flushed_bytes, length, MS_SYNC) != 0)
            abort();
#if defined(MAP_ANONYMOUS)
        int anonymous_flag = MAP_ANONYMOUS;
#else
        int anonymous_flag = MAP_ANON;
#endif
        void *retired = mmap(c->buf + c->flushed_bytes, length, PROT_NONE,
                             MAP_PRIVATE | anonymous_flag | MAP_FIXED,
                             -1, 0);
        if (retired != c->buf + c->flushed_bytes) abort();
    }
    if (fsync(c->backing_fd) != 0) abort();
    c->flushed_bytes = end;
}

static void x64_write_backing_at(X64Code *c, int32_t pos,
                                 const uint8_t *bytes, size_t length) {
    if (!c || !c->file_backed || c->backing_fd < 0 || pos < 0 ||
        (size_t)pos > (size_t)c->len ||
        length > (size_t)c->len - (size_t)pos) abort();
    size_t written = 0;
    while (written < length) {
        ssize_t amount = pwrite(c->backing_fd, bytes + written,
                                length - written,
                                (off_t)pos + (off_t)written);
        if (amount < 0 && errno == EINTR) continue;
        if (amount <= 0) abort();
        written += (size_t)amount;
    }
}

static void x64_patch4(X64Code *c, int32_t pos, uint32_t value) {
    if (!c || pos < 0 || pos > c->len - 4) abort();
    uint8_t bytes[4] = {
        (uint8_t)value,
        (uint8_t)(value >> 8),
        (uint8_t)(value >> 16),
        (uint8_t)(value >> 24),
    };
    size_t split = c->file_backed ? c->flushed_bytes : 0;
    if (!c->file_backed || (size_t)pos >= split) {
        memcpy(c->buf + pos, bytes, sizeof(bytes));
        return;
    }
    size_t retired_part = split - (size_t)pos;
    if (retired_part > sizeof(bytes)) retired_part = sizeof(bytes);
    x64_write_backing_at(c, pos, bytes, retired_part);
    if (retired_part < sizeof(bytes)) {
        memcpy(c->buf + pos + retired_part,
               bytes + retired_part, sizeof(bytes) - retired_part);
    }
}

static void x64_release(X64Code *c) {
    if (!c) return;
    if (c->buf && c->buf != MAP_FAILED && c->reserved_bytes > 0) {
        if (munmap(c->buf, c->reserved_bytes) != 0) abort();
    }
    if (c->backing_fd >= 0 && close(c->backing_fd) != 0) abort();
    free(c->global_patch_pos);
    memset(c, 0, sizeof(*c));
}

static void x64_emit1(X64Code *c, uint8_t b) {
    if (c->len >= c->cap) {
        if (!c->buf || c->buf == MAP_FAILED ||
            c->committed_bytes == 0 ||
            c->reserved_bytes < c->committed_bytes) abort();
        int32_t next = c->cap;
        while (next <= c->len) {
            int32_t growth = next / 4 + (next % 4 != 0);
            if (growth <= 0 || next > INT32_MAX - growth) abort();
            next += growth;
        }
        size_t next_committed = x64_page_aligned_bytes((size_t)next);
        if (next_committed <= c->committed_bytes ||
            next_committed > c->reserved_bytes ||
            next_committed > (size_t)INT32_MAX) abort();
        if (!c->file_backed &&
            mprotect(c->buf + c->committed_bytes,
                     next_committed - c->committed_bytes,
                     PROT_READ | PROT_WRITE) != 0) abort();
        c->committed_bytes = next_committed;
        c->cap = (int32_t)next_committed;
    }
    c->buf[c->len++] = b;
}

static void x64_emit4(X64Code *c, uint32_t v) {
    x64_emit1(c, (uint8_t)(v));
    x64_emit1(c, (uint8_t)(v >> 8));
    x64_emit1(c, (uint8_t)(v >> 16));
    x64_emit1(c, (uint8_t)(v >> 24));
}

static void x64_emit8(X64Code *c, uint64_t v) {
    x64_emit4(c, (uint32_t)(v));
    x64_emit4(c, (uint32_t)(v >> 32));
}

static void x64_emit_modrm_mem0(X64Code *c, int reg_field, int base_reg) {
    int base = base_reg & 7;
    if (base == 4) {
        x64_emit1(c, MODRM(0, reg_field & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else if (base == 5) {
        x64_emit1(c, MODRM(1, reg_field & 7, 5));
        x64_emit1(c, 0);
    } else {
        x64_emit1(c, MODRM(0, reg_field & 7, base));
    }
}

static void x64_emit_modrm_mem_index(X64Code *c, int reg_field,
                                     int base_reg, int index_reg, int scale) {
    int base = base_reg & 7;
    int mod = (base == 5) ? 1 : 0;
    x64_emit1(c, MODRM(mod, reg_field & 7, 4));
    x64_emit1(c, SIB(scale, index_reg & 7, base));
    if (mod == 1) x64_emit1(c, 0);
}

/* ---- Basic instructions ---- */

/* mov $imm32, %r32 */
static void x64_mov_r32_imm32(X64Code *c, int reg, int32_t imm) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xB8 + (reg & 7));
    x64_emit4(c, (uint32_t)imm);
}

/* mov $imm64, %r64 */
static void x64_mov_r64_imm64(X64Code *c, int reg, uint64_t imm) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0xB8 + (reg & 7));
    x64_emit8(c, imm);
}

/* mov %r32, [base + disp32] */
static void x64_mov_mr32_r32(X64Code *c, int base, int32_t disp, int reg) {
    if (reg >= 8 || base >= 8) x64_emit1(c, (reg >= 8 ? REX_R : 0) | (base >= 8 ? REX_B : 0));
    x64_emit1(c, 0x89);
    if ((base & 7) == 4) { /* RSP/R12 need SIB */
        x64_emit1(c, MODRM(2, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(2, reg & 7, base & 7));
    }
    x64_emit4(c, (uint32_t)disp);
}

/* mov [base + disp32], %r64 */
static void x64_mov_mr64_r64(X64Code *c, int base, int32_t disp, int reg) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_R : 0) | (base >= 8 ? REX_B : 0));
    x64_emit1(c, 0x89);
    if ((base & 7) == 4) {
        x64_emit1(c, MODRM(2, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(2, reg & 7, base & 7));
    }
    x64_emit4(c, (uint32_t)disp);
}

/* mov %r32, [base + disp32] (store 32-bit) */
static void x64_mov_mr32_r32_store(X64Code *c, int base, int32_t disp, int reg) {
    x64_mov_mr32_r32(c, base, disp, reg);
}

/* mov %r64, [base + disp32] (store 64-bit) */
static void x64_mov_mr64_r64_store(X64Code *c, int base, int32_t disp, int reg) {
    x64_mov_mr64_r64(c, base, disp, reg);
}

/* mov [base + disp32], %r32 (load 32-bit) */
static void x64_mov_r32_mr32(X64Code *c, int reg, int base, int32_t disp) {
    if (reg >= 8 || base >= 8) x64_emit1(c, (reg >= 8 ? REX_R : 0) | (base >= 8 ? REX_B : 0));
    x64_emit1(c, 0x8B);
    if ((base & 7) == 4) {
        x64_emit1(c, MODRM(2, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(2, reg & 7, base & 7));
    }
    x64_emit4(c, (uint32_t)disp);
}

/* mov [base + disp32], %r64 (load 64-bit) */
static void x64_mov_r64_mr64(X64Code *c, int reg, int base, int32_t disp) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_R : 0) | (base >= 8 ? REX_B : 0));
    x64_emit1(c, 0x8B);
    if ((base & 7) == 4) {
        x64_emit1(c, MODRM(2, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(2, reg & 7, base & 7));
    }
    x64_emit4(c, (uint32_t)disp);
}

/* add %r32, %r32 */
static void x64_add_r32_r32(X64Code *c, int dst, int src) {
    if (dst >= 8 || src >= 8) x64_emit1(c, (src >= 8 ? REX_R : 0) | (dst >= 8 ? REX_B : 0));
    x64_emit1(c, 0x01);
    x64_emit1(c, MODRM(3, src & 7, dst & 7));
}

/* sub %r32, %r32 */
static void x64_sub_r32_r32(X64Code *c, int dst, int src) {
    if (dst >= 8 || src >= 8) x64_emit1(c, (src >= 8 ? REX_R : 0) | (dst >= 8 ? REX_B : 0));
    x64_emit1(c, 0x29);
    x64_emit1(c, MODRM(3, src & 7, dst & 7));
}

/* imul %r32, %r32 */
static void x64_imul_r32_r32(X64Code *c, int dst, int src) {
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0xAF);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}

/* cmp %r32, %r32 */
static void x64_cmp_r32_r32(X64Code *c, int a, int b) {
    if (a >= 8 || b >= 8) x64_emit1(c, (a >= 8 ? REX_R : 0) | (b >= 8 ? REX_B : 0));
    x64_emit1(c, 0x39);
    x64_emit1(c, MODRM(3, a & 7, b & 7));
}

/* cmp $imm8, %r32 (or %r64) */
static void x64_cmp_r32_imm8(X64Code *c, int reg, int8_t imm) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0x83);
    x64_emit1(c, MODRM(3, 7, reg & 7));
    x64_emit1(c, (uint8_t)imm);
}

/* jmp rel32 (relative jump) */
static void x64_jmp_rel32(X64Code *c, int32_t rel) {
    x64_emit1(c, 0xE9);
    x64_emit4(c, (uint32_t)rel);
}

/* jcc rel32 (conditional jump) */
static void x64_jcc_rel32(X64Code *c, int cc, int32_t rel) {
    x64_emit1(c, 0x0F);
    x64_emit1(c, 0x80 + cc);
    x64_emit4(c, (uint32_t)rel);
}

/* call rel32 (relative call) */
static void x64_call_rel32(X64Code *c, int32_t rel) {
    x64_emit1(c, 0xE8);
    x64_emit4(c, (uint32_t)rel);
}

/* call *%reg (indirect call via register) */
static void x64_call_reg(X64Code *c, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xFF);
    x64_emit1(c, MODRM(3, 2, reg & 7));
}

/* ret */
static void x64_ret(X64Code *c) {
    x64_emit1(c, 0xC3);
}

/* nop (3-byte) */
static void x64_nop3(X64Code *c) {
    x64_emit1(c, 0x0F); x64_emit1(c, 0x1F); x64_emit1(c, 0x00);
}

/* lea [base + disp32], %r64 */
static void x64_lea_r64_mr(X64Code *c, int reg, int base, int32_t disp) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_R : 0) | (base >= 8 ? REX_B : 0));
    x64_emit1(c, 0x8D);
    if ((base & 7) == 4) {
        x64_emit1(c, MODRM(2, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(2, reg & 7, base & 7));
    }
    x64_emit4(c, (uint32_t)disp);
}

/* lea disp32(%rip), %r64 */
static void x64_lea_r64_rip_rel32(X64Code *c, int reg, int32_t rel) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_R : 0));
    x64_emit1(c, 0x8D);
    x64_emit1(c, MODRM(0, reg & 7, 5));
    x64_emit4(c, (uint32_t)rel);
}

/* push %r64 */
static void x64_push_r64(X64Code *c, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0x50 + (reg & 7));
}

/* pop %r64 */
static void x64_pop_r64(X64Code *c, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0x58 + (reg & 7));
}

/* xchg %rax, %reg (for saving/restoring) */
static void x64_mov_r64_r64(X64Code *c, int dst, int src) {
    x64_emit1(c, REX_W | (src >= 8 ? REX_R : 0) | (dst >= 8 ? REX_B : 0));
    x64_emit1(c, 0x89);
    x64_emit1(c, MODRM(3, src & 7, dst & 7));
}

/* sub $imm8, %rsp */
static void x64_sub_rsp_imm8(X64Code *c, int8_t imm) {
    x64_emit1(c, 0x48);
    x64_emit1(c, 0x83);
    x64_emit1(c, MODRM(3, 5, 4)); /* sub $imm8, %rsp */
    x64_emit1(c, (uint8_t)imm);
}

/* sub $imm32, %rsp */
static void x64_sub_rsp_imm32(X64Code *c, int32_t imm) {
    x64_emit1(c, 0x48);
    x64_emit1(c, 0x81);
    x64_emit1(c, MODRM(3, 5, 4));
    x64_emit4(c, (uint32_t)imm);
}

/* add $imm8, %rsp */
static void x64_add_rsp_imm8(X64Code *c, int8_t imm) {
    x64_emit1(c, 0x48);
    x64_emit1(c, 0x83);
    x64_emit1(c, MODRM(3, 0, 4)); /* add $imm8, %rsp */
    x64_emit1(c, (uint8_t)imm);
}

/* add $imm32, %rsp */
static void x64_add_rsp_imm32(X64Code *c, int32_t imm) {
    x64_emit1(c, 0x48);
    x64_emit1(c, 0x81);
    x64_emit1(c, MODRM(3, 0, 4));
    x64_emit4(c, (uint32_t)imm);
}

/* mov %r32, %r32 */
static void x64_mov_r32_r32(X64Code *c, int dst, int src) {
    if (dst >= 8 || src >= 8) x64_emit1(c, (src >= 8 ? REX_R : 0) | (dst >= 8 ? REX_B : 0));
    x64_emit1(c, 0x89);
    x64_emit1(c, MODRM(3, src & 7, dst & 7));
}

/* sub %r64, %r64 */
static void x64_sub_r64_r64(X64Code *c, int dst, int src) {
    x64_emit1(c, REX_W | (src >= 8 ? REX_R : 0) | (dst >= 8 ? REX_B : 0));
    x64_emit1(c, 0x29);
    x64_emit1(c, MODRM(3, src & 7, dst & 7));
}
/* add %r64, %r64 */
static void x64_add_r64_r64(X64Code *c, int dst, int src) {
    x64_emit1(c, REX_W | (src >= 8 ? REX_R : 0) | (dst >= 8 ? REX_B : 0));
    x64_emit1(c, 0x01);
    x64_emit1(c, MODRM(3, src & 7, dst & 7));
}
/* xor %r32, %r32 */
static void x64_xor_r32_r32(X64Code *c, int dst, int src) {
    if (dst >= 8 || src >= 8) x64_emit1(c, (src >= 8 ? REX_R : 0) | (dst >= 8 ? REX_B : 0));
    x64_emit1(c, 0x31);
    x64_emit1(c, MODRM(3, src & 7, dst & 7));
}
/* xor %r64, %r64 */
static void x64_xor_r64_r64(X64Code *c, int dst, int src) {
    x64_emit1(c, REX_W | (src >= 8 ? REX_R : 0) | (dst >= 8 ? REX_B : 0));
    x64_emit1(c, 0x31);
    x64_emit1(c, MODRM(3, src & 7, dst & 7));
}
/* neg %r32 */
static void x64_neg_r32(X64Code *c, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xF7);
    x64_emit1(c, MODRM(3, 3, reg & 7));
}
/* not %r32 */
static void x64_not_r32(X64Code *c, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xF7);
    x64_emit1(c, MODRM(3, 2, reg & 7));
}
/* cmp %r64, %r64 */
static void x64_cmp_r64_r64(X64Code *c, int a, int b) {
    x64_emit1(c, REX_W | (a >= 8 ? REX_R : 0) | (b >= 8 ? REX_B : 0));
    x64_emit1(c, 0x39);
    x64_emit1(c, MODRM(3, a & 7, b & 7));
}
/* cmp $imm32, %r64 */
static void x64_cmp_r64_imm8(X64Code *c, int reg, int8_t imm) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x83);
    x64_emit1(c, MODRM(3, 7, reg & 7));
    x64_emit1(c, (uint8_t)imm);
}
/* cmp $imm32, %r32 */
static void x64_cmp_r32_imm32(X64Code *c, int reg, int32_t imm) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0x81);
    x64_emit1(c, MODRM(3, 7, reg & 7));
    x64_emit4(c, (uint32_t)imm);
}
/* and $imm8, %r32 */
static void x64_and_r32_imm8(X64Code *c, int reg, int8_t imm) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0x83);
    x64_emit1(c, MODRM(3, 4, reg & 7));
    x64_emit1(c, (uint8_t)imm);
}
/* shr $imm8, %r32 */
static void x64_shr_r32_imm8(X64Code *c, int reg, int8_t imm) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xC1);
    x64_emit1(c, MODRM(3, 5, reg & 7));
    x64_emit1(c, (uint8_t)imm);
}
/* inc %r32 */
static void x64_inc_r32(X64Code *c, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xFF);
    x64_emit1(c, MODRM(3, 0, reg & 7));
}
/* dec %r32 */
static void x64_dec_r32(X64Code *c, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xFF);
    x64_emit1(c, MODRM(3, 1, reg & 7));
}
/* rep stosq */
static void x64_rep_stosq(X64Code *c) {
    x64_emit1(c, 0xF3);
    x64_emit1(c, 0x48);
    x64_emit1(c, 0xAB);
}
/* mov $imm32, [base + disp32] (64-bit) */
static void x64_mov_mr64_imm32(X64Code *c, int base, int32_t disp, int32_t imm) {
    x64_emit1(c, REX_W | (base >= 8 ? REX_B : 0));
    x64_emit1(c, 0xC7);
    if ((base & 7) == 4) {
        x64_emit1(c, MODRM(2, 0, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(2, 0, base & 7));
    }
    x64_emit4(c, (uint32_t)disp);
    x64_emit4(c, (uint32_t)imm);
}
/* mov [base + disp32], %r32 (store, explicit) */
static void x64_mov_mr32_imm32(X64Code *c, int base, int32_t disp, int32_t imm) {
    if (base >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xC7);
    if ((base & 7) == 4) {
        x64_emit1(c, MODRM(2, 0, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(2, 0, base & 7));
    }
    x64_emit4(c, (uint32_t)disp);
    x64_emit4(c, (uint32_t)imm);
}
/* SETcc %r8 (set byte on condition) */
static void x64_setcc_r8(X64Code *c, int cc, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0x0F);
    x64_emit1(c, 0x90 + cc);
    x64_emit1(c, MODRM(3, 0, reg & 7));
}
/* movzb %r8, %r32 */
static void x64_movzb_r8_r32(X64Code *c, int dst, int src) {
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F);
    x64_emit1(c, 0xB6);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* shl %cl, %r32 */
static void x64_shl_r32_cl(X64Code *c, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xD3);
    x64_emit1(c, MODRM(3, 4, reg & 7));
}
/* shr %cl, %r32 */
static void x64_shr_r32_cl(X64Code *c, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xD3);
    x64_emit1(c, MODRM(3, 5, reg & 7));
}
/* sar %cl, %r32 */
static void x64_sar_r32_cl(X64Code *c, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xD3);
    x64_emit1(c, MODRM(3, 7, reg & 7));
}
/* test %r32, %r32 */
static void x64_test_r32_r32(X64Code *c, int a, int b) {
    if (a >= 8 || b >= 8) x64_emit1(c, (a >= 8 ? REX_R : 0) | (b >= 8 ? REX_B : 0));
    x64_emit1(c, 0x85);
    x64_emit1(c, MODRM(3, a & 7, b & 7));
}
/* test %r64, %r64 */
static void x64_test_r64_r64(X64Code *c, int a, int b) {
    x64_emit1(c, REX_W | (a >= 8 ? REX_R : 0) | (b >= 8 ? REX_B : 0));
    x64_emit1(c, 0x85);
    x64_emit1(c, MODRM(3, a & 7, b & 7));
}
/* cdq (sign-extend EAX→EDX:EAX) */
static void x64_cdq(X64Code *c) { x64_emit1(c, 0x99); }
/* cqo (sign-extend RAX→RDX:RAX) */
static void x64_cqo(X64Code *c) { x64_emit1(c, REX_W); x64_emit1(c, 0x99); }
/* idiv %r32 (EDX:EAX / r32 → EAX, remainder in EDX) */
static void x64_idiv_r32(X64Code *c, int reg) {
    if (reg >= 8) x64_emit1(c, REX_B);
    x64_emit1(c, 0xF7);
    x64_emit1(c, MODRM(3, 7, reg & 7));
}
/* idiv %r64 (RDX:RAX / r64 → RAX, remainder in RDX) */
static void x64_idiv_r64(X64Code *c, int reg) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0xF7);
    x64_emit1(c, MODRM(3, 7, reg & 7));
}
/* imul %r64, %r64 */
static void x64_imul_r64_r64(X64Code *c, int dst, int src) {
    x64_emit1(c, REX_W | (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0xAF);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* and %r64, %r64 */
static void x64_and_r64_r64(X64Code *c, int dst, int src) {
    x64_emit1(c, REX_W | (src >= 8 ? REX_R : 0) | (dst >= 8 ? REX_B : 0));
    x64_emit1(c, 0x21);
    x64_emit1(c, MODRM(3, src & 7, dst & 7));
}
/* or %r64, %r64 */
static void x64_or_r64_r64(X64Code *c, int dst, int src) {
    x64_emit1(c, REX_W | (src >= 8 ? REX_R : 0) | (dst >= 8 ? REX_B : 0));
    x64_emit1(c, 0x09);
    x64_emit1(c, MODRM(3, src & 7, dst & 7));
}
/* xor %r64, %r64 (use REX.W 0x31 form) */
static void x64_xor_r64_r64_alt(X64Code *c, int dst, int src) {
    x64_emit1(c, REX_W | (src >= 8 ? REX_R : 0) | (dst >= 8 ? REX_B : 0));
    x64_emit1(c, 0x31);
    x64_emit1(c, MODRM(3, src & 7, dst & 7));
}
/* shl %cl, %r64 */
static void x64_shl_r64_cl(X64Code *c, int reg) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0xD3);
    x64_emit1(c, MODRM(3, 4, reg & 7));
}
/* shr %cl, %r64 */
static void x64_shr_r64_cl(X64Code *c, int reg) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0xD3);
    x64_emit1(c, MODRM(3, 5, reg & 7));
}
/* sar %cl, %r64 */
static void x64_sar_r64_cl(X64Code *c, int reg) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0xD3);
    x64_emit1(c, MODRM(3, 7, reg & 7));
}
/* movsxd %r32, %r64 (sign-extend 32→64) */
static void x64_movsxd_r64_r32(X64Code *c, int dst, int src) {
    x64_emit1(c, REX_W | (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x63);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* xchg %rax, %r64 (special short encoding) */
static void x64_xchg_rax_r64(X64Code *c, int reg) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x90 + (reg & 7));
}
/* lock cmpxchg %r32, [base] */
static void x64_lock_cmpxchg_r32_mr(X64Code *c, int base_reg, int reg) {
    x64_emit1(c, 0xF0); /* LOCK prefix */
    if (base_reg >= 8 || reg >= 8) x64_emit1(c, (base_reg >= 8 ? REX_B : 0) | (reg >= 8 ? REX_R : 0));
    x64_emit1(c, 0x0F);
    x64_emit1(c, 0xB1);
    x64_emit_modrm_mem0(c, reg, base_reg);
}
/* lock xadd %r32, [base] */
static void x64_lock_xadd_r32_mr(X64Code *c, int base_reg, int reg) {
    x64_emit1(c, 0xF0); /* LOCK prefix */
    if (base_reg >= 8 || reg >= 8) x64_emit1(c, (base_reg >= 8 ? REX_B : 0) | (reg >= 8 ? REX_R : 0));
    x64_emit1(c, 0x0F);
    x64_emit1(c, 0xC1);
    x64_emit_modrm_mem0(c, reg, base_reg);
}
/* mov (load) 64-bit from [base] */
static void x64_mov_r64_mr64_base(X64Code *c, int reg, int base_reg) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_R : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x8B);
    x64_emit_modrm_mem0(c, reg, base_reg);
}
/* mov (store) 64-bit to [base] */
static void x64_mov_mr64_base_r64(X64Code *c, int base_reg, int reg) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_R : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x89);
    x64_emit_modrm_mem0(c, reg, base_reg);
}
/* mov (load) 32-bit from [base] */
static void x64_mov_r32_mr32_base(X64Code *c, int reg, int base_reg) {
    if (reg >= 8 || base_reg >= 8) x64_emit1(c, (reg >= 8 ? REX_R : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x8B);
    x64_emit_modrm_mem0(c, reg, base_reg);
}
/* mov (store) 32-bit to [base] */
static void x64_mov_mr32_base_r32(X64Code *c, int base_reg, int reg) {
    if (base_reg >= 8 || reg >= 8) x64_emit1(c, (reg >= 8 ? REX_R : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x89);
    x64_emit_modrm_mem0(c, reg, base_reg);
}
/* jmp rel8 (short jump, ±127 bytes) */
static void x64_jmp_rel8(X64Code *c, int8_t rel) { x64_emit1(c, 0xEB); x64_emit1(c, (uint8_t)rel); }
/* jcc rel8 (short conditional jump) */
static void x64_jcc_rel8(X64Code *c, int cc, int8_t rel) {
    x64_emit1(c, 0x70 + cc);
    x64_emit1(c, (uint8_t)rel);
}
/* lea [base + disp32], %r32 */
static void x64_lea_r32_mr(X64Code *c, int reg, int base, int32_t disp) {
    if (reg >= 8 || base >= 8) x64_emit1(c, (reg >= 8 ? REX_R : 0) | (base >= 8 ? REX_B : 0));
    x64_emit1(c, 0x8D);
    if ((base & 7) == 4) {
        x64_emit1(c, MODRM(2, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(2, reg & 7, base & 7));
    }
    x64_emit4(c, (uint32_t)disp);
}
/* mov %r32, [base_reg + index_reg*4] (scaled index store) */
static void x64_mov_mr32_base_index4_r32(X64Code *c, int base_reg, int index_reg, int reg) {
    if (reg >= 8 || index_reg >= 8 || base_reg >= 8)
        x64_emit1(c, (reg >= 8 ? REX_R : 0) | (index_reg >= 8 ? REX_X : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x89);
    x64_emit_modrm_mem_index(c, reg, base_reg, index_reg, 2);
}
/* mov [base_reg + index_reg*4], %r32 (scaled index load) */
static void x64_mov_r32_mr32_base_index4(X64Code *c, int reg, int base_reg, int index_reg) {
    if (reg >= 8 || index_reg >= 8 || base_reg >= 8)
        x64_emit1(c, (reg >= 8 ? REX_R : 0) | (index_reg >= 8 ? REX_X : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x8B);
    x64_emit_modrm_mem_index(c, reg, base_reg, index_reg, 2);
}
/* mov [base_reg + index_reg*8], %r64 (scaled index store 64-bit) */
static void x64_mov_mr64_base_index8_r64(X64Code *c, int base_reg, int index_reg, int reg) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_R : 0) | (index_reg >= 8 ? REX_X : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x89);
    x64_emit_modrm_mem_index(c, reg, base_reg, index_reg, 3);
}
/* mov [base_reg + index_reg*8], %r64 (load 64-bit) */
static void x64_mov_r64_mr64_base_index8(X64Code *c, int reg, int base_reg, int index_reg) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_R : 0) | (index_reg >= 8 ? REX_X : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x8B);
    x64_emit_modrm_mem_index(c, reg, base_reg, index_reg, 3);
}
/* #133 v3: mov [base_reg + index_reg*2], %r16 (scaled halfword-index store)
   -- same SIB-scaled-index family as x64_mov_mr32_base_index4_r32 above,
   just scale=1 (SIB scale field, meaning x2) instead of scale=2 (x4), plus
   the 0x66 operand-size-override legacy prefix that must precede any REX
   byte. Needed so int16[N]/uint16[N] fixed-array elements can be indexed
   with a 2-byte stride on x64 instead of silently reusing the 4-byte
   dword path (the same stride tear #133 v2 already fixed on arm64). */
static void x64_mov_mr16_base_index2_r16(X64Code *c, int base_reg, int index_reg, int reg) {
    x64_emit1(c, 0x66);
    if (reg >= 8 || index_reg >= 8 || base_reg >= 8)
        x64_emit1(c, (reg >= 8 ? REX_R : 0) | (index_reg >= 8 ? REX_X : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x89);
    x64_emit_modrm_mem_index(c, reg, base_reg, index_reg, 1);
}
/* mov [base_reg + index_reg*2], %r32 (scaled halfword-index zero-extend
   load, movzwl form) -- element read counterpart of the store above. */
static void x64_movzw_r32_mr16_base_index2(X64Code *c, int reg, int base_reg, int index_reg) {
    if (reg >= 8 || index_reg >= 8 || base_reg >= 8)
        x64_emit1(c, (reg >= 8 ? REX_R : 0) | (index_reg >= 8 ? REX_X : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0xB7);
    x64_emit_modrm_mem_index(c, reg, base_reg, index_reg, 1);
}
/* movb [base], %r8 (store byte) */
static void x64_mov_mr8_r8(X64Code *c, int base_reg, int reg) {
    if (base_reg >= 8 || reg >= 8) x64_emit1(c, (base_reg >= 8 ? REX_B : 0) | (reg >= 8 ? REX_R : 0));
    x64_emit1(c, 0x88);
    x64_emit_modrm_mem0(c, reg, base_reg);
}
/* movzb [base], %r32 (load zero-extend byte) */
static void x64_movzb_r32_mr8(X64Code *c, int reg, int base_reg) {
    if (reg >= 8 || base_reg >= 8) x64_emit1(c, (reg >= 8 ? REX_R : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0xB6);
    x64_emit_modrm_mem0(c, reg, base_reg);
}
/* movzw [base], %r32 (load zero-extend 16-bit) */
static void x64_movzw_r32_mr16(X64Code *c, int reg, int base_reg) {
    if (reg >= 8 || base_reg >= 8) x64_emit1(c, (reg >= 8 ? REX_R : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0xB7);
    x64_emit_modrm_mem0(c, reg, base_reg);
}
/* movw [base], %r16 (store 16-bit) */
static void x64_mov_mr16_r16(X64Code *c, int base_reg, int reg) {
    x64_emit1(c, 0x66); /* operand size override */
    if (base_reg >= 8 || reg >= 8) x64_emit1(c, (base_reg >= 8 ? REX_B : 0) | (reg >= 8 ? REX_R : 0));
    x64_emit1(c, 0x89);
    x64_emit_modrm_mem0(c, reg, base_reg);
}
/* push imm32 */
static void x64_push_imm32(X64Code *c, int32_t imm) { x64_emit1(c, 0x68); x64_emit4(c, (uint32_t)imm); }
/* int3 */
static void x64_int3(X64Code *c) { x64_emit1(c, 0xCC); }
/* syscall (x86_64) */
static int32_t x64_syscall_op_context = -1;
static void x64_syscall(X64Code *c) {
    if (c->windows_abi) {
        fprintf(stderr, "cold: raw unix syscall emitted for windows target (op_kind=%d)\n",
                x64_syscall_op_context);
        fflush(stderr);
        abort();
    }
    x64_emit1(c, 0x0F); x64_emit1(c, 0x05);
}

/* mov %r64, [base_reg + disp8] (load 64-bit, disp8 form) */
static void x64_mov_r64_mr64_base_disp8(X64Code *c, int reg, int base_reg, int8_t disp) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_R : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x8B);
    if ((base_reg & 7) == 4) {
        x64_emit1(c, MODRM(1, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(1, reg & 7, base_reg & 7));
    }
    x64_emit1(c, (uint8_t)disp);
}
/* mov [base_reg + disp8], %r64 (store 64-bit, disp8 form) */
static void x64_mov_mr64_base_disp8_r64(X64Code *c, int base_reg, int8_t disp, int reg) {
    x64_emit1(c, REX_W | (reg >= 8 ? REX_R : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x89);
    if ((base_reg & 7) == 4) {
        x64_emit1(c, MODRM(1, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(1, reg & 7, base_reg & 7));
    }
    x64_emit1(c, (uint8_t)disp);
}
/* mov %r32, [base_reg + disp8] (load 32-bit, disp8 form) */
static void x64_mov_r32_mr32_base_disp8(X64Code *c, int reg, int base_reg, int8_t disp) {
    if (reg >= 8 || base_reg >= 8) x64_emit1(c, (reg >= 8 ? REX_R : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x8B);
    if ((base_reg & 7) == 4) {
        x64_emit1(c, MODRM(1, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(1, reg & 7, base_reg & 7));
    }
    x64_emit1(c, (uint8_t)disp);
}
/* mov [base_reg + disp8], %r32 (store 32-bit, disp8 form) */
static void x64_mov_mr32_base_disp8_r32(X64Code *c, int base_reg, int8_t disp, int reg) {
    if (base_reg >= 8 || reg >= 8) x64_emit1(c, (base_reg >= 8 ? REX_B : 0) | (reg >= 8 ? REX_R : 0));
    x64_emit1(c, 0x89);
    if ((base_reg & 7) == 4) {
        x64_emit1(c, MODRM(1, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(1, reg & 7, base_reg & 7));
    }
    x64_emit1(c, (uint8_t)disp);
}
/* movzb [base_reg + disp8], %r32 (load zero-extend byte from disp8) */
static void x64_movzb_r32_mr8_base_disp8(X64Code *c, int reg, int base_reg, int8_t disp) {
    if (reg >= 8 || base_reg >= 8) x64_emit1(c, (reg >= 8 ? REX_R : 0) | (base_reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0xB6);
    if ((base_reg & 7) == 4) {
        x64_emit1(c, MODRM(1, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(1, reg & 7, base_reg & 7));
    }
    x64_emit1(c, (uint8_t)disp);
}
/* movb [base_reg + disp8], %r8 (store byte, disp8 form) */
static void x64_mov_mr8_base_disp8_r8(X64Code *c, int base_reg, int8_t disp, int reg) {
    if (base_reg >= 8 || reg >= 8) x64_emit1(c, (base_reg >= 8 ? REX_B : 0) | (reg >= 8 ? REX_R : 0));
    x64_emit1(c, 0x88);
    if ((base_reg & 7) == 4) {
        x64_emit1(c, MODRM(1, reg & 7, 4));
        x64_emit1(c, SIB(0, 4, 4));
    } else {
        x64_emit1(c, MODRM(1, reg & 7, base_reg & 7));
    }
    x64_emit1(c, (uint8_t)disp);
}

/* ---- float (SSE) helpers ---- */
/* movss [base+disp32], %xmm (store scalar single) */
static void x64_movss_mr_xmm(X64Code *c, int base, int32_t disp, int xmm) {
    x64_emit1(c, 0xF3);
    if (xmm >= 8 || base >= 8) x64_emit1(c, (xmm >= 8 ? REX_R : 0) | (base >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x11);
    if ((base & 7) == 4) { x64_emit1(c, MODRM(2, xmm & 7, 4)); x64_emit1(c, SIB(0, 4, 4)); }
    else x64_emit1(c, MODRM(2, xmm & 7, base & 7));
    x64_emit4(c, (uint32_t)disp);
}
/* movss %xmm, [base+disp32] (load scalar single) */
static void x64_movss_xmm_mr(X64Code *c, int xmm, int base, int32_t disp) {
    x64_emit1(c, 0xF3);
    if (xmm >= 8 || base >= 8) x64_emit1(c, (xmm >= 8 ? REX_R : 0) | (base >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x10);
    if ((base & 7) == 4) { x64_emit1(c, MODRM(2, xmm & 7, 4)); x64_emit1(c, SIB(0, 4, 4)); }
    else x64_emit1(c, MODRM(2, xmm & 7, base & 7));
    x64_emit4(c, (uint32_t)disp);
}
/* movsd [base+disp32], %xmm (store scalar double) */
static void x64_movsd_mr_xmm(X64Code *c, int base, int32_t disp, int xmm) {
    x64_emit1(c, 0xF2);
    if (xmm >= 8 || base >= 8) x64_emit1(c, (xmm >= 8 ? REX_R : 0) | (base >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x11);
    if ((base & 7) == 4) { x64_emit1(c, MODRM(2, xmm & 7, 4)); x64_emit1(c, SIB(0, 4, 4)); }
    else x64_emit1(c, MODRM(2, xmm & 7, base & 7));
    x64_emit4(c, (uint32_t)disp);
}
/* movsd %xmm, [base+disp32] (load scalar double) */
static void x64_movsd_xmm_mr(X64Code *c, int xmm, int base, int32_t disp) {
    x64_emit1(c, 0xF2);
    if (xmm >= 8 || base >= 8) x64_emit1(c, (xmm >= 8 ? REX_R : 0) | (base >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x10);
    if ((base & 7) == 4) { x64_emit1(c, MODRM(2, xmm & 7, 4)); x64_emit1(c, SIB(0, 4, 4)); }
    else x64_emit1(c, MODRM(2, xmm & 7, base & 7));
    x64_emit4(c, (uint32_t)disp);
}
/* movd %r32, %xmm */
static void x64_movd_xmm_r32(X64Code *c, int xmm, int reg) {
    x64_emit1(c, 0x66);
    if (xmm >= 8 || reg >= 8) x64_emit1(c, (xmm >= 8 ? REX_R : 0) | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x6E);
    x64_emit1(c, MODRM(3, xmm & 7, reg & 7));
}
/* movq %r64, %xmm */
static void x64_movq_xmm_r64(X64Code *c, int xmm, int reg) {
    x64_emit1(c, 0x66);
    x64_emit1(c, REX_W | (xmm >= 8 ? REX_R : 0) | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x6E);
    x64_emit1(c, MODRM(3, xmm & 7, reg & 7));
}
/* movd %xmm, %r32 */
static void x64_movd_r32_xmm(X64Code *c, int reg, int xmm) {
    x64_emit1(c, 0x66);
    if (xmm >= 8 || reg >= 8) x64_emit1(c, (xmm >= 8 ? REX_R : 0) | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x7E);
    x64_emit1(c, MODRM(3, xmm & 7, reg & 7));
}
/* addss %xmm, %xmm */
static void x64_addss(X64Code *c, int dst, int src) {
    x64_emit1(c, 0xF3);
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x58);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* subss %xmm, %xmm */
static void x64_subss(X64Code *c, int dst, int src) {
    x64_emit1(c, 0xF3);
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x5C);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* mulss %xmm, %xmm */
static void x64_mulss(X64Code *c, int dst, int src) {
    x64_emit1(c, 0xF3);
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x59);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* divss %xmm, %xmm */
static void x64_divss(X64Code *c, int dst, int src) {
    x64_emit1(c, 0xF3);
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x5E);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* addsd %xmm, %xmm */
static void x64_addsd(X64Code *c, int dst, int src) {
    x64_emit1(c, 0xF2);
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x58);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* subsd %xmm, %xmm */
static void x64_subsd(X64Code *c, int dst, int src) {
    x64_emit1(c, 0xF2);
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x5C);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* mulsd %xmm, %xmm */
static void x64_mulsd(X64Code *c, int dst, int src) {
    x64_emit1(c, 0xF2);
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x59);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* divsd %xmm, %xmm */
static void x64_divsd(X64Code *c, int dst, int src) {
    x64_emit1(c, 0xF2);
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x5E);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* ucomiss %xmm, %xmm (unordered compare scalar single, sets EFLAGS) */
static void x64_ucomiss(X64Code *c, int a, int b) {
    if (a >= 8 || b >= 8) x64_emit1(c, (a >= 8 ? REX_R : 0) | (b >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x2E);
    x64_emit1(c, MODRM(3, a & 7, b & 7));
}
/* ucomisd %xmm, %xmm (unordered compare scalar double, sets EFLAGS) */
static void x64_ucomisd(X64Code *c, int a, int b) {
    x64_emit1(c, 0x66);
    if (a >= 8 || b >= 8) x64_emit1(c, (a >= 8 ? REX_R : 0) | (b >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x2E);
    x64_emit1(c, MODRM(3, a & 7, b & 7));
}
/* cvtsi2ss %r32, %xmm */
static void x64_cvtsi2ss(X64Code *c, int xmm, int reg) {
    x64_emit1(c, 0xF3);
    if (xmm >= 8 || reg >= 8) x64_emit1(c, (xmm >= 8 ? REX_R : 0) | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x2A);
    x64_emit1(c, MODRM(3, xmm & 7, reg & 7));
}
/* cvtsi2sd %r32, %xmm */
static void x64_cvtsi2sd(X64Code *c, int xmm, int reg) {
    x64_emit1(c, 0xF2);
    if (xmm >= 8 || reg >= 8) x64_emit1(c, (xmm >= 8 ? REX_R : 0) | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x2A);
    x64_emit1(c, MODRM(3, xmm & 7, reg & 7));
}
/* cvttss2si %xmm, %r32 */
static void x64_cvttss2si(X64Code *c, int reg, int xmm) {
    x64_emit1(c, 0xF3);
    if (xmm >= 8 || reg >= 8) x64_emit1(c, (xmm >= 8 ? REX_R : 0) | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x2C);
    x64_emit1(c, MODRM(3, reg & 7, xmm & 7));
}
/* cvttsd2si %xmm, %r32 */
static void x64_cvttsd2si(X64Code *c, int reg, int xmm) {
    x64_emit1(c, 0xF2);
    if (xmm >= 8 || reg >= 8) x64_emit1(c, (xmm >= 8 ? REX_R : 0) | (reg >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x2C);
    x64_emit1(c, MODRM(3, reg & 7, xmm & 7));
}
/* xorps %xmm, %xmm */
static void x64_xorps(X64Code *c, int dst, int src) {
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x57);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}
/* mulss %xmm, %xmm (for negation via sign bit) */
static void x64_xorps_alt(X64Code *c, int dst, int src) {
    if (dst >= 8 || src >= 8) x64_emit1(c, (dst >= 8 ? REX_R : 0) | (src >= 8 ? REX_B : 0));
    x64_emit1(c, 0x0F); x64_emit1(c, 0x57);
    x64_emit1(c, MODRM(3, dst & 7, src & 7));
}

/* ---- Relocation patching ---- */
static void x64_patch_call_rel32(X64Code *c, int32_t pos, int32_t target) {
    /* pos points to the byte AFTER the E8 opcode */
    int32_t rel = target - (pos + 4); /* RIP-relative: offset from end of instruction */
    x64_patch4(c, pos, (uint32_t)rel);
}

static void x64_patch_jmp_rel32(X64Code *c, int32_t pos, int32_t target) {
    int32_t rel = target - (pos + 4);
    x64_patch4(c, pos, (uint32_t)rel);
}
