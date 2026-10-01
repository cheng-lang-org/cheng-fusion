/* macho_direct.h -- Self-contained ARM64 Mach-O executable writer.
 *
 * Writes a minimal but complete Mach-O with all required load commands.
 * Only external dependency: codesign for adhoc signing (macOS requirement).
 *
 * Usage:
 *   MachOWriter mw = {0};
 *   macho_init(&mw, code_words, code_bytes);
 *   macho_write_text(&mw, code_words);
 *   macho_finalize(&mw, output_path);
 */

#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdlib.h>
#include <errno.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/wait.h>
#ifdef __APPLE__
#include <mach/machine.h>
#else
#ifndef CPU_TYPE_ARM64
#define CPU_TYPE_ARM64 0x0100000c
#endif
#ifndef CPU_SUBTYPE_ARM64_ALL
#define CPU_SUBTYPE_ARM64_ALL 0
#endif
#endif

#ifndef MH_MAGIC_64
#define MH_MAGIC_64 0xfeedfacf
#endif
#ifndef MH_OBJECT
#define MH_OBJECT 1
#endif
#ifndef MH_SUBSECTIONS_VIA_SYMBOLS
#define MH_SUBSECTIONS_VIA_SYMBOLS 0x2000
#endif
#ifndef MH_EXECUTE
#define MH_EXECUTE 2
#endif

#ifndef LC_SEGMENT64
#define LC_SEGMENT64 0x19
#endif
#ifndef LC_BUILD_VERSION
#define LC_BUILD_VERSION 0x32
#endif
#ifndef LC_SYMTAB
#define LC_SYMTAB 0x2
#endif
#ifndef LC_DYSYMTAB
#define LC_DYSYMTAB 0xb
#endif
#ifndef LC_CODE_SIGNATURE
#define LC_CODE_SIGNATURE 0x1d
#endif
#ifndef LC_MAIN
#define LC_MAIN 0x80000028
#endif
#ifndef LC_DYLD_INFO
#define LC_DYLD_INFO 0x80000022
#endif
#ifndef LC_LOAD_DYLINKER
#define LC_LOAD_DYLINKER 0x0e
#endif
#ifndef LC_LOAD_DYLIB
#define LC_LOAD_DYLIB 0x0c
#endif
#ifndef LC_UUID
#define LC_UUID 0x1b
#endif
#ifndef LC_FUNCTION_STARTS
#define LC_FUNCTION_STARTS 0x26
#endif
#ifndef LC_DATA_IN_CODE
#define LC_DATA_IN_CODE 0x29
#endif

#ifndef CPU_TYPE_ARM64
#define CPU_TYPE_ARM64 0x0100000c
#endif
#ifndef CPU_SUBTYPE_ARM64_ALL
#define CPU_SUBTYPE_ARM64_ALL 0
#endif

#ifndef N_UNDF
#define N_UNDF 0x0
#endif
#ifndef N_EXT
#define N_EXT 0x01
#endif
#ifndef N_SECT
#define N_SECT 0x0e
#endif
#ifndef N_PEXT
#define N_PEXT 0x10
#endif

#ifndef ARM64_RELOC_BRANCH26
#define ARM64_RELOC_BRANCH26 2
#endif

#define PAGE_SIZE 4096
#define MACHO_EXEC_PAGE_SIZE 16384

static int32_t macho_align_i32(int32_t value, int32_t align) {
    return ((value + align - 1) / align) * align;
}

#ifndef ARM64_RELOC_UNSIGNED
#define ARM64_RELOC_UNSIGNED 0
#endif
#ifndef ARM64_RELOC_PAGE21
#define ARM64_RELOC_PAGE21 3
#endif
#ifndef ARM64_RELOC_PAGEOFF12
#define ARM64_RELOC_PAGEOFF12 4
#endif

#define MAX_SECTIONS 4

typedef struct {
    uint32_t vm_offset;
    uint32_t vm_size;
    uint32_t file_offset;
    uint32_t file_size;
} MachOSection;

typedef struct __attribute__((packed)) relocation_info_t {
    uint32_t r_address;
    uint32_t r_symbolnum: 24,
             r_pcrel:      1,
             r_length:     2,
             r_extern:     1,
             r_type:       4;
} relocation_info_t;

typedef struct __attribute__((packed)) nlist_64_t {
    uint32_t  n_strx;
    uint8_t   n_type;
    uint8_t   n_sect;
    uint16_t  n_desc;
    uint64_t  n_value;
} nlist_64_t;

static void macho_segname(uint8_t *dst, const char *name) {
    memset(dst, 0, 16);
    size_t len = strlen(name);
    if (len > 16) len = 16;
    memcpy(dst, name, len);
}

/* MachOWriter: executable Mach-O builder (MH_EXECUTE) */
typedef struct {
    uint8_t  *buf;
    int32_t   cap;
    int32_t   len;
    int32_t   ncmds;
    int32_t   sizeofcmds_pos;
    int32_t   code_offset;
    int32_t   code_limit;
    int32_t   data_size;       /* initialized global data bytes */
} MachOWriter;

static bool macho_init(MachOWriter *mw, int32_t code_words, int32_t code_size) {
    (void)code_words;
    (void)code_size;
    int32_t code_offset = 1024;  /* room for 13+ load commands (header + cmds < 1024) */
    mw->cap = code_offset;
    mw->buf = (uint8_t *)calloc(1, mw->cap);
    if (!mw->buf) return false;
    mw->len = 0;
    uint32_t *w = (uint32_t*)mw->buf;
    w[0] = MH_MAGIC_64; w[1] = CPU_TYPE_ARM64; w[2] = CPU_SUBTYPE_ARM64_ALL; w[3] = MH_EXECUTE;
    w[4] = 0; mw->sizeofcmds_pos = 5; w[5] = 0; w[6] = 0x00200085; w[7] = 0;
    mw->len = 32; mw->ncmds = 0;
    mw->code_offset = code_offset; mw->code_limit = code_size;
    return true;
}

static int32_t macho_append_cmd(MachOWriter *mw, int32_t cmd, int32_t cmdsize) {
    uint32_t *w = (uint32_t*)(mw->buf + mw->len);
    w[0] = cmd; w[1] = cmdsize; mw->len += cmdsize; mw->ncmds++;
    return mw->len - cmdsize;
}

static int32_t macho_add_segment(MachOWriter *mw, const char *name,
                                 uint64_t vmaddr, uint64_t vmsize,
                                 uint64_t fileoff, uint64_t filesize,
                                 int32_t maxprot, int32_t initprot, int32_t flags) {
    int32_t off = macho_append_cmd(mw, LC_SEGMENT64, 72);
    uint32_t *w = (uint32_t*)(mw->buf + off);
    macho_segname(mw->buf + off + 8, name);
    w[6] = (uint32_t)vmaddr; w[7] = (uint32_t)(vmaddr >> 32);
    w[8] = (uint32_t)vmsize; w[9] = (uint32_t)(vmsize >> 32);
    w[10] = (uint32_t)fileoff; w[11] = (uint32_t)(fileoff >> 32);
    w[12] = (uint32_t)filesize; w[13] = (uint32_t)(filesize >> 32);
    w[14] = maxprot; w[15] = initprot; w[16] = 0; w[17] = flags;
    return off;
}

static void macho_patch_segment(MachOWriter *mw, int32_t seg_off, int32_t nsects) {
    uint32_t *w = (uint32_t*)(mw->buf + seg_off);
    w[1] = 72 + nsects * 80; w[16] = nsects;
}

static void macho_add_section(MachOWriter *mw, const char *name, const char *segname,
                              uint64_t addr, uint64_t size, uint32_t offset,
                              int32_t align, uint32_t flags) {
    uint32_t *w = (uint32_t*)(mw->buf + mw->len);
    macho_segname(mw->buf + mw->len, name);
    macho_segname(mw->buf + mw->len + 16, segname);
    w[8] = (uint32_t)addr; w[9] = (uint32_t)(addr >> 32);
    w[10] = (uint32_t)size; w[11] = (uint32_t)(size >> 32);
    w[12] = offset; w[13] = align; w[14] = 0; w[15] = 0;
    w[16] = flags; w[17] = 0; w[18] = 0; w[19] = 0;
    mw->len += 80;
}

static bool macho_write_all(int fd, const void *bytes, size_t len) {
    const uint8_t *cursor = (const uint8_t *)bytes;
    while (len > 0) {
        size_t chunk = len;
        if (chunk > (size_t)1024 * 1024)
            chunk = (size_t)1024 * 1024;
        ssize_t wrote = write(fd, cursor, chunk);
        if (wrote < 0 && errno == EINTR) continue;
        if (wrote <= 0) return false;
        cursor += (size_t)wrote;
        len -= (size_t)wrote;
    }
    return true;
}

/* Code is a page-aligned anonymous mapping and becomes dead in monotonically
   increasing page order during the final object write.  Reclaim each written
   page range immediately so streaming does not fault the complete code image
   back into the resident set. */
static bool macho_write_all_consuming_mmap(int fd,
                                           const void *bytes,
                                           size_t len) {
    const size_t page = (size_t)sysconf(_SC_PAGESIZE);
    if (page == 0 || ((uintptr_t)bytes % page) != 0) return false;
    const uint8_t *cursor = (const uint8_t *)bytes;
    while (len > 0) {
        size_t chunk = len;
        if (chunk > (size_t)1024 * 1024)
            chunk = (size_t)1024 * 1024;
        if (!macho_write_all(fd, cursor, chunk)) return false;
        size_t reclaim = chunk / page * page;
        if (reclaim > 0 &&
            madvise((void *)(uintptr_t)cursor, reclaim,
                    MADV_DONTNEED) != 0)
            return false;
        cursor += chunk;
        len -= chunk;
    }
    return true;
}

static bool macho_configure_bounded_stream_fd(int fd) {
#ifdef F_NOCACHE
    return fcntl(fd, F_NOCACHE, 1) == 0;
#else
    (void)fd;
    return true;
#endif
}

static bool macho_codesign_path(const char *path) {
    if (!path || !path[0]) return false;
    pid_t child = fork();
    if (child < 0) return false;
    if (child == 0) {
        int null_fd = open("/dev/null", O_WRONLY | O_CLOEXEC);
        if (null_fd < 0 || dup2(null_fd, STDERR_FILENO) < 0) _exit(127);
        if (null_fd != STDERR_FILENO && close(null_fd) != 0) _exit(127);
        execl("/usr/bin/codesign", "codesign", "--force", "-s", "-", "-i",
              "cheng.cold.direct", path, (char *)NULL);
        _exit(127);
    }
    int status = 0;
    pid_t waited;
    do {
        waited = waitpid(child, &status, 0);
    } while (waited < 0 && errno == EINTR);
    return waited == child && WIFEXITED(status) && WEXITSTATUS(status) == 0;
}

static bool macho_write_zeros(int fd, size_t len) {
    static const uint8_t zeros[4096] = {0};
    while (len > 0) {
        size_t chunk = len < sizeof(zeros) ? len : sizeof(zeros);
        if (!macho_write_all(fd, zeros, chunk)) return false;
        len -= chunk;
    }
    return true;
}

static bool macho_finalize(MachOWriter *mw, const char *path,
                           const uint32_t *code, int32_t code_words,
                           const uint8_t *global_data) {
    if (!mw || !path || !code || code_words < 0) {
        if (mw) free(mw->buf);
        return false;
    }
    int32_t sizeofcmds = mw->len - 32;
    ((uint32_t*)mw->buf)[4] = mw->ncmds;
    ((uint32_t*)mw->buf)[5] = sizeofcmds;
    int32_t text_file_size = macho_align_i32(
        mw->code_offset + mw->code_limit, MACHO_EXEC_PAGE_SIZE);
    int32_t total = text_file_size + macho_align_i32(mw->data_size, MACHO_EXEC_PAGE_SIZE);
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0755);
    bool ok = fd >= 0;
    if (ok) ok = macho_configure_bounded_stream_fd(fd);
    if (ok) ok = macho_write_all(fd, mw->buf, (size_t)mw->code_offset);
    if (ok && code_words > 0) {
        ok = macho_write_all(fd, code, (size_t)code_words * sizeof(uint32_t));
    }
    if (ok && mw->data_size > 0) {
        if (!global_data || lseek(fd, (off_t)text_file_size, SEEK_SET) < 0) {
            ok = false;
        } else {
            ok = macho_write_all(fd, global_data, (size_t)mw->data_size);
        }
    }
    if (ok && ftruncate(fd, (off_t)total) != 0) ok = false;
    if (fd >= 0 && close(fd) != 0) ok = false;
    free(mw->buf);
    if (!ok) {
        unlink(path);
        return false;
    }
    if (!getenv("COLD_NO_SIGN")) {
        if (!macho_codesign_path(path)) {
            unlink(path);
            return false;
        }
    }
    return true;
}

static bool macho_write_exec(const char *path,
                             const uint32_t *code, int32_t code_words,
                             const uint8_t *global_data,
                             int32_t global_data_size,
                             const int32_t *global_offsets, int32_t global_count,
                             const int32_t *global_patch_pos,
                             const int32_t *global_patch_idx,
                             int32_t global_patch_count) {
    MachOWriter mw = {0};
    int32_t code_sz = code_words * 4;
    if (!macho_init(&mw, code_words, code_sz)) return false;
    int32_t code_off = mw.code_offset;
    int32_t text_file_size = macho_align_i32(code_off + code_sz, MACHO_EXEC_PAGE_SIZE);
    uint64_t text_addr = 0x100000000ULL;
    uint64_t data_addr = text_addr + (uint64_t)text_file_size;
    int32_t data_file_size = global_data_size > 0
        ? macho_align_i32(global_data_size, MACHO_EXEC_PAGE_SIZE) : 0;
    /* Patch GLOBAL_ADDR placeholders: emit ADRP + ADD for each global reference */
    for (int32_t pi = 0; pi < global_patch_count; pi++) {
        int32_t pos = global_patch_pos[pi];
        int32_t gi = global_patch_idx[pi];
        if (gi < 0 || gi >= global_count) continue;
        int32_t goff = global_offsets[gi];
        uint64_t gaddr = data_addr + (uint64_t)goff;
        /* PC of the ADRP instruction */
        uint64_t pc = text_addr + (uint64_t)code_off + (uint64_t)pos * 4;
        /* ADRP: page-relative offset */
        int64_t page_diff = ((int64_t)(gaddr >> 12) - (int64_t)(pc >> 12));
        uint32_t adrp = 0x90000000u | ((uint32_t)(page_diff & 3) << 29) |
                        ((uint32_t)((page_diff >> 2) & 0x7FFFF) << 5);
        /* ADD: page offset */
        uint32_t add  = 0x91000000u | ((uint32_t)(gaddr & 0xFFF) << 10);
        /* Patch the placeholder words (words[pos] = ADRP, words[pos+1] = ADD) */
        uint32_t *cw = (uint32_t *)code;
        cw[pos] = adrp;
        cw[pos + 1] = add;
    }

    macho_add_segment(&mw, "__PAGEZERO", 0, 0x100000000ULL, 0, 0, 0, 0, 0);
    int32_t text_seg = macho_add_segment(&mw, "__TEXT", text_addr, (uint64_t)text_file_size, 0, (uint64_t)text_file_size, 5, 5, 0);
    macho_add_section(&mw, "__text", "__TEXT", text_addr + code_off, code_sz, code_off, 2, 0x80000400);
    macho_patch_segment(&mw, text_seg, 1);

    /* Add file-backed __DATA so typed scalar initializers survive direct emit. */
    if (global_data_size > 0) {
        int32_t data_file_off = text_file_size;
        int32_t data_seg = macho_add_segment(&mw, "__DATA", data_addr, (uint64_t)data_file_size,
                                             (uint64_t)data_file_off,
                                             (uint64_t)data_file_size, 3, 3, 0);
        macho_add_section(&mw, "__data", "__DATA", data_addr, global_data_size,
                          (uint32_t)data_file_off, 3, 0);
        macho_patch_segment(&mw, data_seg, 1);
        if (!global_data) { free(mw.buf); return false; }
    }
    mw.data_size = global_data_size;

    uint64_t linkedit_addr = data_addr + (uint64_t)data_file_size;
    int32_t linkedit_fileoff = text_file_size + data_file_size;
    macho_add_segment(&mw, "__LINKEDIT", linkedit_addr, 0, (uint64_t)linkedit_fileoff, 0, 1, 1, 0);
    { int32_t o = macho_append_cmd(&mw, LC_DYLD_INFO, 48); uint32_t *w = (uint32_t*)(mw.buf + o); for (int i = 2; i < 12; i++) w[i] = 0; }
    { int32_t o = macho_append_cmd(&mw, LC_LOAD_DYLINKER, 32); ((uint32_t*)(mw.buf + o))[2] = 12; memcpy(mw.buf + o + 12, "/usr/lib/dyld\0", 14); }
    { int32_t o = macho_append_cmd(&mw, LC_LOAD_DYLIB, 56); uint32_t *w = (uint32_t*)(mw.buf + o); w[2] = 24; w[3] = 2; w[4] = 0x10000; w[5] = 0x10000; memcpy(mw.buf + o + 24, "/usr/lib/libSystem.B.dylib\0", 28); }
    { int32_t o = macho_append_cmd(&mw, LC_UUID, 24); uint8_t *p = mw.buf + o + 8; for (int i = 0; i < 16; i++) p[i] = (uint8_t)(0xC0 + i); }
    { int32_t o = macho_append_cmd(&mw, LC_BUILD_VERSION, 24); uint32_t *w = (uint32_t*)(mw.buf + o); w[2] = 1; w[3] = 0x000e0000; w[4] = 0x000e0000; w[5] = 0; }
    { int32_t o = macho_append_cmd(&mw, LC_FUNCTION_STARTS, 16); ((uint32_t*)(mw.buf + o))[2] = text_file_size; ((uint32_t*)(mw.buf + o))[3] = 0; }
    { int32_t o = macho_append_cmd(&mw, LC_DATA_IN_CODE, 16); ((uint32_t*)(mw.buf + o))[2] = text_file_size; ((uint32_t*)(mw.buf + o))[3] = 0; }
    { int32_t o = macho_append_cmd(&mw, LC_MAIN, 24); uint32_t *w = (uint32_t*)(mw.buf + o); w[2] = code_off; w[3] = 0; w[4] = 0; w[5] = 0; }
    return macho_finalize(&mw, path, code, code_words, global_data);
}

/* Forward declaration for object writers below */
static bool macho_write_object_with_debug_full(const char *path,
                                               const uint32_t *code, int32_t code_words,
                                               const char **names, const int32_t *offsets,
                                               int32_t name_count, int32_t local_count,
                                               const int32_t *reloc_offsets,
                                               const int32_t *reloc_symbols,
                                               int32_t reloc_count,
                                               const uint8_t *reloc_types,
                                               const uint8_t *debug_line_data, int32_t debug_line_size,
                                               const uint8_t *debug_abbrev_data, int32_t debug_abbrev_size,
                                               const uint8_t *debug_str_data, int32_t debug_str_size,
                                               const uint8_t *debug_info_data, int32_t debug_info_size,
                                               const uint8_t *debug_loc_data, int32_t debug_loc_size,
                                               const uint8_t *debug_frame_data, int32_t debug_frame_size,
                                               const uint8_t *debug_aranges_data, int32_t debug_aranges_size,
                                               const uint8_t *debug_ranges_data, int32_t debug_ranges_size,
                                               bool consume_code_mapping);

/* ---- Direct single-call Mach-O object writer (no symbol support) ---- */

static bool macho_write_object(const char *path,
                                const uint32_t *code, int32_t code_words,
                                const char **names, const int32_t *offsets,
                                int32_t name_count, int32_t local_count,
                                const int32_t *reloc_offsets,
                                const int32_t *reloc_symbols,
                                int32_t reloc_count) {
    return macho_write_object_with_debug_full(path, code, code_words,
                                              names, offsets, name_count, local_count,
                                              reloc_offsets, reloc_symbols, reloc_count, NULL,
                                              NULL, 0, NULL, 0, NULL, 0, NULL, 0, NULL, 0,
                                              NULL, 0, NULL, 0, NULL, 0, false);
}

/* -- DWARF .debug_line section builder (minimal ARM64/AArch64) -- */

/* ULEB128 encode, returns bytes written */
static int32_t uleb128_encode(uint8_t *buf, uint64_t value) {
    int32_t n = 0;
    do {
        uint8_t byte = (uint8_t)(value & 0x7F);
        value >>= 7;
        if (value) byte |= 0x80;
        buf[n++] = byte;
    } while (value);
    return n;
}

/* SLEB128 encode, returns bytes written */
static int32_t sleb128_encode(uint8_t *buf, int64_t value) {
    int32_t n = 0;
    bool more = true;
    while (more) {
        uint8_t byte = (uint8_t)(value & 0x7F);
        value >>= 7;
        if ((value == 0 && (byte & 0x40) == 0) ||
            (value == -1 && (byte & 0x40) != 0)) {
            more = false;
        } else {
            byte |= 0x80;
        }
        buf[n++] = byte;
    }
    return n;
}

/* DWARF line number program opcodes */
#define DW_LNS_copy           1
#define DW_LNS_advance_pc     2
#define DW_LNS_advance_line   3
#define DW_LNS_set_file       4
#define DW_LNS_const_add_pc   8
#define DW_LNE_end_sequence   1
#define DW_LNE_set_address    2

/* Build a minimal DWARF .debug_line section.
   source_path: full path to source file (used in file name table)
   func_addrs:    array of function byte-addresses (relative to section start)
   func_sizes:    array of function sizes in bytes
   func_lines:    array of source line numbers for each function
   func_count:    number of functions
   out_size:      receives total debug_line section size
   Returns malloc'd buffer, or NULL on failure.
   min_inst_len: minimum instruction length (4 for ARM64, 1 for x86) */
static uint8_t *macho_build_dwarf_debug_line(const char *source_path,
                                              const uint64_t *func_addrs,
                                              const uint32_t *func_sizes,
                                              const int32_t *func_lines,
                                              int32_t func_count,
                                              int32_t min_inst_len,
                                              int32_t *out_size) {
    if (!source_path || !source_path[0] || func_count < 0) return NULL;
    if (func_count > 0 && (!func_addrs || !func_sizes || !func_lines)) return NULL;
    if (min_inst_len != 1 && min_inst_len != 4) return NULL;
    size_t src_path_size = strlen(source_path);
    if (src_path_size > (size_t)INT32_MAX - 32u) return NULL;
    int32_t src_path_len = (int32_t)src_path_size;
    int32_t buf_cap = 16384;
    uint8_t *buf = (uint8_t *)malloc((size_t)buf_cap);
    if (!buf) return NULL;
    int32_t pos = 0;

    /* Helper macro to ensure capacity */
    #define DW_ENSURE(N) do { \
        int32_t required_ = (N); \
        if (required_ < 0 || pos > INT32_MAX - required_) { \
            free(buf); \
            return NULL; \
        } \
        if (pos + required_ > buf_cap) { \
            int64_t grown_ = (int64_t)buf_cap * 2 + required_ + 4096; \
            if (grown_ > INT32_MAX) { free(buf); return NULL; } \
            int32_t new_cap = (int32_t)grown_; \
            uint8_t *new_buf = (uint8_t *)realloc(buf, (size_t)new_cap); \
            if (!new_buf) { free(buf); return NULL; } \
            buf = new_buf; \
            buf_cap = new_cap; \
        } \
    } while(0)

    /* Standard opcode lengths (opcode_base=13) */
    uint8_t std_op_len[12] = {0,1,1,1,1,0,0,0,1,0,0,1};

    /* Directory table: empty (just null terminator) */
    int32_t dir_table_size = 1;
    int32_t file_entry_size = src_path_len + 1 + 1 + 1 + 1;
    int32_t file_table_size = file_entry_size + 1;
    int32_t prologue_len = 1+1+1+1+1+12 + dir_table_size + file_table_size;

    /* Estimate line number program size */
    int64_t approx_prog_size = 0;
    for (int32_t i = 0; i < func_count; i++) {
        approx_prog_size += 22; /* two DW_LNE_set_address (func start + func end) */
        /* DW_LNS_advance_line + SLEB128 */
        int64_t sd = (int64_t)func_lines[i] - 1;
        int32_t sleb_sz = 0;
        bool more_s = true;
        while (more_s) {
            sleb_sz++;
            uint8_t byte = (uint8_t)(sd & 0x7F);
            sd >>= 7;
            if ((sd == 0 && (byte & 0x40) == 0) || (sd == -1 && (byte & 0x40) != 0))
                more_s = false;
        }
        approx_prog_size += 1 + sleb_sz;
        approx_prog_size += 2; /* DW_LNS_set_file + ULEB128(0) */
        approx_prog_size += 1; /* DW_LNS_copy */
        approx_prog_size += 3; /* DW_LNE_end_sequence */
    }

    int64_t total_approx64 = 4+2+4 + (int64_t)prologue_len + approx_prog_size;
    if (total_approx64 > INT32_MAX - 4096) {
        free(buf);
        return NULL;
    }
    int32_t total_approx = (int32_t)total_approx64;
    if (total_approx > buf_cap) {
        int32_t new_cap = total_approx + 4096;
        uint8_t *new_buf = (uint8_t *)realloc(buf, (size_t)new_cap);
        if (!new_buf) {
            free(buf);
            return NULL;
        }
        buf = new_buf;
        buf_cap = new_cap;
    }

    /* Write unit_length placeholder */
    uint32_t unit_length_off = (uint32_t)pos;
    DW_ENSURE(4); pos += 4;

    /* version = 2 */
    DW_ENSURE(2);
    buf[pos++] = 2; buf[pos++] = 0;

    /* prologue_length placeholder */
    uint32_t prologue_len_off = (uint32_t)pos;
    DW_ENSURE(4); pos += 4;

    /* Prologue fields */
    buf[pos++] = (uint8_t)min_inst_len; /* minimum_instruction_length */
    buf[pos++] = 1;                     /* default_is_stmt */
    buf[pos++] = (uint8_t)(-5 & 0xFF);  /* line_base = -5 */
    buf[pos++] = 14;                    /* line_range */
    buf[pos++] = 13;                    /* opcode_base */
    memcpy(buf + pos, std_op_len, 12); pos += 12;

    /* Include directories: empty */
    buf[pos++] = 0;

    /* File names: source_path */
    memcpy(buf + pos, source_path, (size_t)src_path_len); pos += src_path_len;
    buf[pos++] = 0;
    pos += uleb128_encode(buf + pos, 0); /* dir_index = 0 */
    pos += uleb128_encode(buf + pos, 0); /* time = 0 */
    pos += uleb128_encode(buf + pos, 0); /* size = 0 */
    buf[pos++] = 0; /* end of file table */

    /* Patch prologue_length */
    int32_t actual_prologue_len = pos - (int32_t)prologue_len_off - 4;
    buf[prologue_len_off+0] = (uint8_t)(actual_prologue_len & 0xFF);
    buf[prologue_len_off+1] = (uint8_t)((actual_prologue_len>>8) & 0xFF);
    buf[prologue_len_off+2] = (uint8_t)((actual_prologue_len>>16) & 0xFF);
    buf[prologue_len_off+3] = (uint8_t)((actual_prologue_len>>24) & 0xFF);

    /* Line number program */
    for (int32_t i = 0; i < func_count; i++) {
        uint64_t addr = func_addrs[i];
        /* Set address to function start */
        DW_ENSURE(11);
        buf[pos++] = 0; buf[pos++] = 9; buf[pos++] = DW_LNE_set_address;
        buf[pos++] = (uint8_t)(addr & 0xFF);
        buf[pos++] = (uint8_t)((addr>>8) & 0xFF);
        buf[pos++] = (uint8_t)((addr>>16) & 0xFF);
        buf[pos++] = (uint8_t)((addr>>24) & 0xFF);
        buf[pos++] = (uint8_t)((addr>>32) & 0xFF);
        buf[pos++] = (uint8_t)((addr>>40) & 0xFF);
        buf[pos++] = (uint8_t)((addr>>48) & 0xFF);
        buf[pos++] = (uint8_t)((addr>>56) & 0xFF);

        /* Set line */
        DW_ENSURE(11); /* opcode + max sleb128(int64) */
        int32_t sleb_sz = sleb128_encode(
            buf + pos + 1, (int64_t)func_lines[i] - 1);
        buf[pos] = DW_LNS_advance_line;
        pos += 1 + sleb_sz;

        /* Set file = 0 */
        DW_ENSURE(2);
        buf[pos] = DW_LNS_set_file;
        pos++;
        pos += uleb128_encode(buf + pos, 0);

        /* Copy (emit row) */
        DW_ENSURE(1);
        buf[pos++] = DW_LNS_copy;

        /* Set address to end of function */
        uint64_t end_addr = addr + func_sizes[i];
        DW_ENSURE(11);
        buf[pos++] = 0; buf[pos++] = 9; buf[pos++] = DW_LNE_set_address;
        buf[pos++] = (uint8_t)(end_addr & 0xFF);
        buf[pos++] = (uint8_t)((end_addr>>8) & 0xFF);
        buf[pos++] = (uint8_t)((end_addr>>16) & 0xFF);
        buf[pos++] = (uint8_t)((end_addr>>24) & 0xFF);
        buf[pos++] = (uint8_t)((end_addr>>32) & 0xFF);
        buf[pos++] = (uint8_t)((end_addr>>40) & 0xFF);
        buf[pos++] = (uint8_t)((end_addr>>48) & 0xFF);
        buf[pos++] = (uint8_t)((end_addr>>56) & 0xFF);

        /* End sequence */
        DW_ENSURE(3);
        buf[pos++] = 0; buf[pos++] = 1; buf[pos++] = DW_LNE_end_sequence;
    }

    /* Patch unit_length */
    int32_t unit_length = pos - (int32_t)unit_length_off - 4;
    buf[unit_length_off+0] = (uint8_t)(unit_length & 0xFF);
    buf[unit_length_off+1] = (uint8_t)((unit_length>>8) & 0xFF);
    buf[unit_length_off+2] = (uint8_t)((unit_length>>16) & 0xFF);
    buf[unit_length_off+3] = (uint8_t)((unit_length>>24) & 0xFF);

    if (out_size) *out_size = pos;
    return buf;

    #undef DW_ENSURE
}

/* Mach-O object writer with DWARF .debug_line section.
   Same as macho_write_object, but also includes a __DWARF,__debug_line section. */
static bool macho_write_object_with_debug(const char *path,
                                          const uint32_t *code, int32_t code_words,
                                          const char **names, const int32_t *offsets,
                                          int32_t name_count, int32_t local_count,
                                          const int32_t *reloc_offsets,
                                          const int32_t *reloc_symbols,
                                          int32_t reloc_count,
                                          const uint8_t *debug_line_data,
                                          int32_t debug_line_size) {
    return macho_write_object_with_debug_full(path, code, code_words,
                                              names, offsets, name_count, local_count,
                                              reloc_offsets, reloc_symbols, reloc_count, NULL,
                                              debug_line_data, debug_line_size,
                                              NULL, 0, NULL, 0, NULL, 0, NULL, 0,
                                              NULL, 0, NULL, 0, NULL, 0, false);
}

/* ---- DWARF .debug_loc / .debug_info / .debug_abbrev / .debug_str builders ---- */

#define DW_TAG_compile_unit      0x11
#define DW_TAG_base_type         0x24
#define DW_TAG_structure_type    0x13
#define DW_TAG_member            0x0d
#define DW_TAG_pointer_type      0x0f
#define DW_TAG_subprogram        0x2e
#define DW_TAG_formal_parameter  0x05
#define DW_TAG_variable          0x34

#define DW_CHILDREN_no           0
#define DW_CHILDREN_yes          1

#define DW_AT_name               0x03
#define DW_AT_byte_size          0x0b
#define DW_AT_low_pc             0x11
#define DW_AT_high_pc            0x12
#define DW_AT_language           0x13
#define DW_AT_location           0x02
#define DW_AT_stmt_list          0x10
#define DW_AT_ranges             0x55
#define DW_AT_type               0x49
#define DW_AT_frame_base         0x40
#define DW_AT_encoding           0x3e
#define DW_AT_data_member_location 0x38

#define DW_FORM_addr             0x01
#define DW_FORM_data1            0x0b
#define DW_FORM_data2            0x05
#define DW_FORM_data4            0x06
#define DW_FORM_strp             0x0e
#define DW_FORM_ref4             0x13
#define DW_FORM_exprloc          0x18
#define DW_FORM_sec_offset       0x17
#define DW_FORM_flag_present     0x1c

#define DW_ATE_signed            0x05
#define DW_ATE_unsigned          0x07
#define DW_ATE_boolean           0x02
#define DW_ATE_address           0x01
#define DW_LANG_C89              0x0001

#define DW_OP_reg0               0x50
#define DW_OP_reg1               0x51
#define DW_OP_reg2               0x52
#define DW_OP_reg3               0x53
#define DW_OP_reg4               0x54
#define DW_OP_reg5               0x55
#define DW_OP_reg6               0x56
#define DW_OP_reg7               0x57
#define DW_OP_fbreg              0x91
#define DW_OP_breg31             0x8f

/* ---- Type descriptors for DWARF debug_info ---- */
#define MACHO_DW_TYPE_BASE    0
#define MACHO_DW_TYPE_STRUCT  1
#define MACHO_DW_TYPE_PTR     2
#define MACHO_DW_MAX_MEMBERS  8

/* Describes a single DWARF type DIE to be emitted in .debug_info.
   Cross-references within the type table use type_idx indices.
   This must only reference types at lower indices (emitted first). */
typedef struct {
    int32_t name_str_off;                        /* offset of type name in .debug_str */
    uint8_t kind;                                /* MACHO_DW_TYPE_* */
    uint8_t byte_size;                           /* byte size of the type */
    uint8_t encoding;                            /* DW_ATE_* for base types */
    uint8_t member_count;                        /* for struct types */
    int32_t member_name_offs[MACHO_DW_MAX_MEMBERS];  /* member name str offsets */
    uint8_t member_byte_sizes[MACHO_DW_MAX_MEMBERS];
    uint8_t member_offsets[MACHO_DW_MAX_MEMBERS];    /* byte offset in struct */
    int32_t member_type_idxs[MACHO_DW_MAX_MEMBERS];  /* type table index */
    int32_t pointee_type_idx;                        /* for ptr: pointee type index, -1 = void */
} MachoDwarfTypeDesc;

/* Build a minimal .debug_str section from an array of strings.
   strings:     null-terminated strings
   string_count: number of strings
   out_size:    receives total section size
   Returns malloc'd buffer. */
static uint8_t *macho_build_dwarf_debug_str(const char **strings,
                                             int32_t string_count,
                                             int32_t *out_size) {
    if (string_count < 0) { if (out_size) *out_size = 0; return NULL; }
    if (string_count > 0 && !strings) { if (out_size) *out_size = 0; return NULL; }
    int32_t total = 0;
    for (int32_t i = 0; i < string_count; i++) {
        if (!strings[i]) { if (out_size) *out_size = 0; return NULL; }
        total += (int32_t)strlen(strings[i]) + 1;
    }
    if (total < 1) total = 1;
    uint8_t *buf = (uint8_t *)malloc((size_t)total);
    if (!buf) { if (out_size) *out_size = 0; return NULL; }
    int32_t pos = 0;
    for (int32_t i = 0; i < string_count; i++) {
        int32_t len = (int32_t)strlen(strings[i]);
        memcpy(buf + pos, strings[i], (size_t)len);
        pos += len;
        buf[pos++] = 0;
    }
    if (pos < total) buf[pos] = 0;
    if (out_size) *out_size = total;
    return buf;
}

/* Build a minimal .debug_abbrev section.
   Abbreviations:
     1 = DW_TAG_compile_unit (children yes)
     2 = DW_TAG_base_type (children no)
     3 = DW_TAG_subprogram (children yes)
     4 = DW_TAG_formal_parameter (children no)
     5 = DW_TAG_variable (children no)
     6 = DW_TAG_structure_type (children yes)
     7 = DW_TAG_member (children no)
     8 = DW_TAG_pointer_type (children no)
   Returns malloc'd buffer. */
static uint8_t *macho_build_dwarf_debug_abbrev(int32_t *out_size) {
    uint8_t buf_stack[256];
    int32_t pos = 0;

    /* Abbrev 1: compile_unit */
    pos += uleb128_encode(buf_stack + pos, 1);
    pos += uleb128_encode(buf_stack + pos, DW_TAG_compile_unit);
    buf_stack[pos++] = DW_CHILDREN_yes;
    pos += uleb128_encode(buf_stack + pos, DW_AT_name);      pos += uleb128_encode(buf_stack + pos, DW_FORM_strp);
    pos += uleb128_encode(buf_stack + pos, DW_AT_language);  pos += uleb128_encode(buf_stack + pos, DW_FORM_data2);
    pos += uleb128_encode(buf_stack + pos, DW_AT_low_pc);    pos += uleb128_encode(buf_stack + pos, DW_FORM_addr);
    pos += uleb128_encode(buf_stack + pos, DW_AT_high_pc);   pos += uleb128_encode(buf_stack + pos, DW_FORM_data4);
    pos += uleb128_encode(buf_stack + pos, DW_AT_stmt_list); pos += uleb128_encode(buf_stack + pos, DW_FORM_data4);
    pos += uleb128_encode(buf_stack + pos, DW_AT_ranges);    pos += uleb128_encode(buf_stack + pos, DW_FORM_sec_offset);
    pos += uleb128_encode(buf_stack + pos, 0); pos += uleb128_encode(buf_stack + pos, 0);

    /* Abbrev 2: base_type */
    pos += uleb128_encode(buf_stack + pos, 2);
    pos += uleb128_encode(buf_stack + pos, DW_TAG_base_type);
    buf_stack[pos++] = DW_CHILDREN_no;
    pos += uleb128_encode(buf_stack + pos, DW_AT_name);      pos += uleb128_encode(buf_stack + pos, DW_FORM_strp);
    pos += uleb128_encode(buf_stack + pos, DW_AT_byte_size); pos += uleb128_encode(buf_stack + pos, DW_FORM_data1);
    pos += uleb128_encode(buf_stack + pos, DW_AT_encoding);  pos += uleb128_encode(buf_stack + pos, DW_FORM_data1);
    pos += uleb128_encode(buf_stack + pos, 0); pos += uleb128_encode(buf_stack + pos, 0);

    /* Abbrev 3: subprogram */
    pos += uleb128_encode(buf_stack + pos, 3);
    pos += uleb128_encode(buf_stack + pos, DW_TAG_subprogram);
    buf_stack[pos++] = DW_CHILDREN_yes;
    pos += uleb128_encode(buf_stack + pos, DW_AT_name);      pos += uleb128_encode(buf_stack + pos, DW_FORM_strp);
    pos += uleb128_encode(buf_stack + pos, DW_AT_low_pc);    pos += uleb128_encode(buf_stack + pos, DW_FORM_addr);
    pos += uleb128_encode(buf_stack + pos, DW_AT_high_pc);   pos += uleb128_encode(buf_stack + pos, DW_FORM_data4);
    pos += uleb128_encode(buf_stack + pos, DW_AT_frame_base);pos += uleb128_encode(buf_stack + pos, DW_FORM_exprloc);
    pos += uleb128_encode(buf_stack + pos, 0); pos += uleb128_encode(buf_stack + pos, 0);

    /* Abbrev 4: formal_parameter */
    pos += uleb128_encode(buf_stack + pos, 4);
    pos += uleb128_encode(buf_stack + pos, DW_TAG_formal_parameter);
    buf_stack[pos++] = DW_CHILDREN_no;
    pos += uleb128_encode(buf_stack + pos, DW_AT_name);     pos += uleb128_encode(buf_stack + pos, DW_FORM_strp);
    pos += uleb128_encode(buf_stack + pos, DW_AT_type);     pos += uleb128_encode(buf_stack + pos, DW_FORM_ref4);
    pos += uleb128_encode(buf_stack + pos, DW_AT_location); pos += uleb128_encode(buf_stack + pos, DW_FORM_sec_offset);
    pos += uleb128_encode(buf_stack + pos, 0); pos += uleb128_encode(buf_stack + pos, 0);

    /* Abbrev 5: variable */
    pos += uleb128_encode(buf_stack + pos, 5);
    pos += uleb128_encode(buf_stack + pos, DW_TAG_variable);
    buf_stack[pos++] = DW_CHILDREN_no;
    pos += uleb128_encode(buf_stack + pos, DW_AT_name);     pos += uleb128_encode(buf_stack + pos, DW_FORM_strp);
    pos += uleb128_encode(buf_stack + pos, DW_AT_type);     pos += uleb128_encode(buf_stack + pos, DW_FORM_ref4);
    pos += uleb128_encode(buf_stack + pos, DW_AT_location); pos += uleb128_encode(buf_stack + pos, DW_FORM_sec_offset);
    pos += uleb128_encode(buf_stack + pos, 0); pos += uleb128_encode(buf_stack + pos, 0);

    /* Abbrev 6: structure_type (children yes) */
    pos += uleb128_encode(buf_stack + pos, 6);
    pos += uleb128_encode(buf_stack + pos, DW_TAG_structure_type);
    buf_stack[pos++] = DW_CHILDREN_yes;
    pos += uleb128_encode(buf_stack + pos, DW_AT_name);      pos += uleb128_encode(buf_stack + pos, DW_FORM_strp);
    pos += uleb128_encode(buf_stack + pos, DW_AT_byte_size); pos += uleb128_encode(buf_stack + pos, DW_FORM_data1);
    pos += uleb128_encode(buf_stack + pos, 0); pos += uleb128_encode(buf_stack + pos, 0);

    /* Abbrev 7: member (children no) */
    pos += uleb128_encode(buf_stack + pos, 7);
    pos += uleb128_encode(buf_stack + pos, DW_TAG_member);
    buf_stack[pos++] = DW_CHILDREN_no;
    pos += uleb128_encode(buf_stack + pos, DW_AT_name);                pos += uleb128_encode(buf_stack + pos, DW_FORM_strp);
    pos += uleb128_encode(buf_stack + pos, DW_AT_type);                pos += uleb128_encode(buf_stack + pos, DW_FORM_ref4);
    pos += uleb128_encode(buf_stack + pos, DW_AT_data_member_location);pos += uleb128_encode(buf_stack + pos, DW_FORM_data1);
    pos += uleb128_encode(buf_stack + pos, DW_AT_byte_size);           pos += uleb128_encode(buf_stack + pos, DW_FORM_data1);
    pos += uleb128_encode(buf_stack + pos, 0); pos += uleb128_encode(buf_stack + pos, 0);

    /* Abbrev 8: pointer_type (children no) */
    pos += uleb128_encode(buf_stack + pos, 8);
    pos += uleb128_encode(buf_stack + pos, DW_TAG_pointer_type);
    buf_stack[pos++] = DW_CHILDREN_no;
    pos += uleb128_encode(buf_stack + pos, DW_AT_type); pos += uleb128_encode(buf_stack + pos, DW_FORM_ref4);
    pos += uleb128_encode(buf_stack + pos, 0); pos += uleb128_encode(buf_stack + pos, 0);

    /* Section terminator */
    buf_stack[pos++] = 0;

    uint8_t *result = (uint8_t *)malloc((size_t)pos);
    if (!result) { if (out_size) *out_size = 0; return NULL; }
    memcpy(result, buf_stack, (size_t)pos);
    if (out_size) *out_size = pos;
    return result;
}

/* Build a minimal .debug_loc section for variable location lists.
   Each variable gets a single-range location entry covering the entire function
   (offset 0 to func_size) with the given location expression.
   func_sizes[i]:   byte size of the containing function for variable i
   loc_exprs[i]:    location expression bytes (no length prefix)
   loc_expr_lens[i]: length of each location expression
   var_count:       number of variables
   out_offsets:     if non-NULL, receives the byte offset of each var's entry in the section
   out_size:        receives total .debug_loc section size
   Returns malloc'd buffer. */
static uint8_t *macho_build_dwarf_debug_loc(const uint32_t *func_sizes,
                                              const uint8_t **loc_exprs,
                                              const int32_t *loc_expr_lens,
                                              int32_t var_count,
                                              int32_t *out_offsets,
                                              int32_t *out_size) {
    if (var_count < 0) { if (out_size) *out_size = 0; return NULL; }
    if (var_count > 0 && (!func_sizes || !loc_exprs || !loc_expr_lens)) {
        if (out_size) *out_size = 0; return NULL;
    }

    /* Each entry has 8+8+2+len bytes, plus 8+8 terminator. */
    int32_t est = 16;
    for (int32_t i = 0; i < var_count; i++) {
        if (loc_expr_lens[i] < 0) { if (out_size) *out_size = 0; return NULL; }
        est += 8 + 8 + 2 + loc_expr_lens[i] + 16;
    }

    uint8_t *buf = (uint8_t *)malloc((size_t)est);
    if (!buf) { if (out_size) *out_size = 0; return NULL; }

    int32_t pos = 0;
    for (int32_t i = 0; i < var_count; i++) {
        if (out_offsets) out_offsets[i] = pos;
        /* 8-byte begin offset = 0 */
        buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0;
        buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0;
        /* 8-byte end offset = func_size */
        uint32_t end = (uint32_t)func_sizes[i];
        buf[pos++] = (uint8_t)(end & 0xFF);
        buf[pos++] = (uint8_t)((end >> 8) & 0xFF);
        buf[pos++] = (uint8_t)((end >> 16) & 0xFF);
        buf[pos++] = (uint8_t)((end >> 24) & 0xFF);
        buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0;
        /* location expression length (u16) */
        uint16_t elen = (uint16_t)loc_expr_lens[i];
        buf[pos++] = (uint8_t)(elen & 0xFF);
        buf[pos++] = (uint8_t)((elen >> 8) & 0xFF);
        /* expression bytes */
        if (elen > 0) memcpy(buf + pos, loc_exprs[i], (size_t)elen);
        pos += elen;
        /* end-of-list terminator (16 zero bytes for addr_size=8) */
        for (int32_t z = 0; z < 16; z++) buf[pos++] = 0;
    }

    if (var_count == 0) {
        for (int32_t z = 0; z < 16; z++) buf[pos++] = 0;
    }

    if (out_size) *out_size = pos;
    return buf;
}

/* Build a minimal DWARF .debug_frame section for call frame information.
   Uses DWARF3 format for ARM64 Mach-O.
   One CIE (Common Information Entry) followed by one FDE per function.
   CIE: CFA = SP + 0, FP(x29) saved at CFA-32, LR(x30) saved at CFA-24.
   FDE: sets CFA offset to 32 + aligned(frame_size) matching the actual prologue
   (two stp_pre pairs: x19/x20 and FP/LR, then sub SP,SP,frame_size).

   func_addrs:       byte addresses of functions (within __TEXT,__text)
   func_sizes:       byte sizes of functions
   func_frame_sizes: raw body->frame_size values (will be aligned to 16 internally)
   func_count:       number of functions
   out_size:         receives total .debug_frame section size
   Returns malloc'd buffer or NULL on failure. */
static uint8_t *macho_build_dwarf_debug_frame(
    const uint64_t *func_addrs,
    const uint32_t *func_sizes,
    const int32_t *func_frame_sizes,
    int32_t func_count,
    int32_t *out_size)
{
    if (func_count < 0) { if (out_size) *out_size = 0; return NULL; }
    if (func_count > 0 && (!func_addrs || !func_sizes || !func_frame_sizes)) {
        if (out_size) *out_size = 0; return NULL;
    }
    if (func_count == 0) {
        if (out_size) *out_size = 0; return NULL;
    }

    /* Estimate: CIE (~36 bytes) + per-function FDE (~32 bytes each) */
    int32_t est = 64 + func_count * 36;
    uint8_t *buf = (uint8_t *)malloc((size_t)est);
    if (!buf) { if (out_size) *out_size = 0; return NULL; }

    int32_t pos = 0;

    /* ---- CIE (Common Information Entry) ---- */
    int32_t cie_len_pos = pos;
    buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0; /* length placeholder */

    /* CIE identifier: 0xFFFFFFFF for .debug_frame (marks this as a CIE) */
    buf[pos++] = 0xFF; buf[pos++] = 0xFF; buf[pos++] = 0xFF; buf[pos++] = 0xFF;

    buf[pos++] = 3;  /* DWARF version 3 */
    buf[pos++] = 0;  /* augmentation string = "" (empty, no augmentation data) */

    pos += uleb128_encode(buf + pos, 1);   /* code_alignment_factor = 1 */
    pos += sleb128_encode(buf + pos, -4);  /* data_alignment_factor = -4 (AArch64) */
    pos += uleb128_encode(buf + pos, 30);  /* return_address_register = x30/LR */

    /* Initial instructions for all FDEs sharing this CIE */

    /* DW_CFA_def_cfa (0x0C): CFA = r31(SP) + 0
       The CFA offset will be overridden per-function in each FDE. */
    buf[pos++] = 0x0C;
    pos += uleb128_encode(buf + pos, 31);  /* register = SP */
    pos += uleb128_encode(buf + pos, 0);   /* offset = 0 (placeholder) */

    /* DW_CFA_offset (0x80|reg): r29(FP) saved at CFA - 32
       The prologue does stp_pre x29,x30,[SP,#-16]! after stp_pre x19,x20,[SP,#-16]!
       so FP is at initial_SP - 32 = CFA - 32.
       Factored offset: (-32) / (-4) = 8. */
    buf[pos++] = 0x80 | 29;
    pos += uleb128_encode(buf + pos, 8);

    /* DW_CFA_offset (0x80|reg): r30(LR) saved at CFA - 24
       LR is at initial_SP - 24 = CFA - 24.
       Factored offset: (-24) / (-4) = 6. */
    buf[pos++] = 0x80 | 30;
    pos += uleb128_encode(buf + pos, 6);

    /* Pad to 4-byte alignment */
    while (pos % 4 != 0) buf[pos++] = 0;

    /* Fill in CIE length (everything after the length field) */
    int32_t cie_len = pos - cie_len_pos - 4;
    buf[cie_len_pos]   = (uint8_t)(cie_len & 0xFF);
    buf[cie_len_pos+1] = (uint8_t)((cie_len >> 8) & 0xFF);
    buf[cie_len_pos+2] = (uint8_t)((cie_len >> 16) & 0xFF);
    buf[cie_len_pos+3] = (uint8_t)((cie_len >> 24) & 0xFF);

    int32_t cie_offset = 0; /* CIE is at offset 0 within .debug_frame */

    /* ---- FDEs (Frame Description Entries) ---- */
    for (int32_t i = 0; i < func_count; i++) {
        /* Align frame_size to 16 (matching codegen: align_i32(body->frame_size, 16)) */
        int32_t fs = func_frame_sizes[i];
        if (fs < 0) fs = 0;
        int32_t aligned_fs = (fs + 15) & ~15;
        /* Total frame = 16 (x19/x20) + 16 (FP/LR) + aligned local frame */
        int32_t total_frame = 32 + aligned_fs;

        int32_t fde_len_pos = pos;
        buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0; /* length placeholder */

        /* CIE pointer: offset of CIE from start of .debug_frame section (always 0) */
        buf[pos++] = (uint8_t)(cie_offset & 0xFF);
        buf[pos++] = (uint8_t)((cie_offset >> 8) & 0xFF);
        buf[pos++] = (uint8_t)((cie_offset >> 16) & 0xFF);
        buf[pos++] = (uint8_t)((cie_offset >> 24) & 0xFF);

        /* initial_location: 8-byte address (byte offset within __TEXT,__text) */
        uint64_t addr = func_addrs[i];
        buf[pos++] = (uint8_t)(addr & 0xFF);
        buf[pos++] = (uint8_t)((addr >> 8) & 0xFF);
        buf[pos++] = (uint8_t)((addr >> 16) & 0xFF);
        buf[pos++] = (uint8_t)((addr >> 24) & 0xFF);
        buf[pos++] = (uint8_t)((addr >> 32) & 0xFF);
        buf[pos++] = (uint8_t)((addr >> 40) & 0xFF);
        buf[pos++] = (uint8_t)((addr >> 48) & 0xFF);
        buf[pos++] = (uint8_t)((addr >> 56) & 0xFF);

        /* address_range: 8-byte size of function */
        uint64_t range = func_sizes[i];
        buf[pos++] = (uint8_t)(range & 0xFF);
        buf[pos++] = (uint8_t)((range >> 8) & 0xFF);
        buf[pos++] = (uint8_t)((range >> 16) & 0xFF);
        buf[pos++] = (uint8_t)((range >> 24) & 0xFF);
        buf[pos++] = (uint8_t)((range >> 32) & 0xFF);
        buf[pos++] = (uint8_t)((range >> 40) & 0xFF);
        buf[pos++] = (uint8_t)((range >> 48) & 0xFF);
        buf[pos++] = (uint8_t)((range >> 56) & 0xFF);

        /* DW_CFA_def_cfa_offset (0x0E): override CFA offset to actual frame size */
        buf[pos++] = 0x0E;
        pos += uleb128_encode(buf + pos, (uint64_t)total_frame);

        /* Pad to 4-byte alignment */
        while (pos % 4 != 0) buf[pos++] = 0;

        /* Fill in FDE length (everything after the length field) */
        int32_t fde_len = pos - fde_len_pos - 4;
        buf[fde_len_pos]   = (uint8_t)(fde_len & 0xFF);
        buf[fde_len_pos+1] = (uint8_t)((fde_len >> 8) & 0xFF);
        buf[fde_len_pos+2] = (uint8_t)((fde_len >> 16) & 0xFF);
        buf[fde_len_pos+3] = (uint8_t)((fde_len >> 24) & 0xFF);
    }

    /* Shrink buffer to actual used size */
    if (pos < est) {
        uint8_t *shrunk = (uint8_t *)realloc(buf, (size_t)pos);
        if (shrunk) buf = shrunk;
    }
    if (out_size) *out_size = pos;
    return buf;
}

/* Build .debug_aranges section for fast address lookup.
   Maps each function's PC range to CU at cu_offset (typically 0). */
static uint8_t *macho_build_dwarf_debug_aranges(
    const uint64_t *addrs, const uint32_t *sizes, int32_t count,
    int32_t cu_offset, int32_t *out_size) {
    if (count <= 0 || !addrs || !sizes) {
        if (out_size) *out_size = 0; return NULL;
    }
    int32_t sz = 32 + count * 16; /* header + entries + terminator */
    uint8_t *buf = (uint8_t *)malloc((size_t)sz);
    if (!buf) { if (out_size) *out_size = 0; return NULL; }
    int32_t p = 0;
    int32_t body = sz - 4; /* unit_length excludes itself */
    buf[p++] = (uint8_t)(body); buf[p++] = (uint8_t)(body >> 8);
    buf[p++] = (uint8_t)(body >> 16); buf[p++] = (uint8_t)(body >> 24);
    buf[p++] = 2; buf[p++] = 0; /* version = 2 */
    buf[p++] = (uint8_t)(cu_offset); buf[p++] = (uint8_t)(cu_offset >> 8);
    buf[p++] = (uint8_t)(cu_offset >> 16); buf[p++] = (uint8_t)(cu_offset >> 24);
    buf[p++] = 8; buf[p++] = 0; /* addr_size=8, seg_size=0 */
    buf[p++] = 0; buf[p++] = 0; buf[p++] = 0; buf[p++] = 0; /* pad to 16 */
    for (int32_t i = 0; i < count; i++) {
        uint64_t a = addrs[i], l = sizes[i];
        for (int32_t b = 0; b < 8; b++) buf[p++] = (uint8_t)(a >> (b * 8));
        for (int32_t b = 0; b < 8; b++) buf[p++] = (uint8_t)(l >> (b * 8));
    }
    for (int32_t z = 0; z < 16; z++) buf[p++] = 0; /* terminator */
    if (out_size) *out_size = p;
    return buf;
}

/* Build .debug_ranges section for non-contiguous code range lists.
   One range entry per function with absolute addresses. */
static uint8_t *macho_build_dwarf_debug_ranges(
    const uint64_t *addrs, const uint32_t *sizes, int32_t count,
    int32_t *out_size) {
    if (count <= 0 || !addrs || !sizes) {
        if (out_size) *out_size = 0; return NULL;
    }
    int32_t sz = 16 + count * 16; /* entries + terminator */
    uint8_t *buf = (uint8_t *)malloc((size_t)sz);
    if (!buf) { if (out_size) *out_size = 0; return NULL; }
    int32_t p = 0;
    for (int32_t i = 0; i < count; i++) {
        uint64_t a = addrs[i], e = addrs[i] + sizes[i];
        for (int32_t b = 0; b < 8; b++) buf[p++] = (uint8_t)(a >> (b * 8));
        for (int32_t b = 0; b < 8; b++) buf[p++] = (uint8_t)(e >> (b * 8));
    }
    for (int32_t z = 0; z < 16; z++) buf[p++] = 0; /* end-of-list */
    if (out_size) *out_size = p;
    return buf;
}

/* Info for a single variable used to build .debug_info DIEs */
typedef struct {
    int32_t func_index;      /* index into func_name_str_offs / func_addrs / func_sizes */
    int32_t name_str_off;    /* offset of variable name in .debug_str */
    int32_t loc_off;         /* offset of location list entry in .debug_loc */
} MachoDwarfVarEntry;

/* Return the byte size of a type DIE (excluding children of struct).
   For struct types, includes member DIEs and null terminator. */
static int32_t macho_dwarf_type_die_size(const MachoDwarfTypeDesc *desc) {
    switch (desc->kind) {
        case MACHO_DW_TYPE_BASE:
            return 7;  /* uleb(2) + strp(4) + data1(1) + data1(1) */
        case MACHO_DW_TYPE_STRUCT: {
            int32_t sz = 6; /* uleb(6) + strp(4) + data1(1) */
            for (int32_t i = 0; i < desc->member_count && i < MACHO_DW_MAX_MEMBERS; i++)
                sz += 11;  /* uleb(7) + strp(4) + ref4(4) + data1(1) + data1(1) */
            sz += 1; /* children null terminator */
            return sz;
        }
        case MACHO_DW_TYPE_PTR:
            return 5;  /* uleb(8) + ref4(4) */
        default:
            return 0;
    }
}

/* Compute CU-relative offsets for each type DIE and the total type section size.
   Returns total bytes consumed by type DIEs.
   Offsets start after CU DIE at offset 11 + cu_die_size. */
static int32_t macho_dwarf_compute_type_offsets(const MachoDwarfTypeDesc *type_descs,
                                                  int32_t type_count,
                                                  int32_t cu_die_size,
                                                  int32_t *type_offsets) {
    int32_t off = 11 + cu_die_size;
    for (int32_t i = 0; i < type_count; i++) {
        if (type_offsets) type_offsets[i] = off;
        off += macho_dwarf_type_die_size(&type_descs[i]);
    }
    return off - (11 + cu_die_size);
}

/* Build a minimal DWARF .debug_info section.
   Uses DWARF4 format with 64-bit addresses.

   source_path_str_off:  offset of source file path in .debug_str
   type_descs:           array of type descriptors (type_count entries), or NULL
   type_count:           number of types (0 = use old behavior with single int32 base_type)
   var_type_idxs:        per-variable type index into type_descs (may be NULL if type_count==0)
   func_name_str_offs:   offsets of function names in .debug_str (func_count entries)
   func_addrs:           function byte addresses (func_count entries)
   func_sizes:           function byte sizes (func_count entries)
   func_count:           number of functions
   vars:                 array of variable/parameter info (var_count entries)
   var_count:            total number of variables across all functions
   debug_abbrev_off:     offset of .debug_abbrev section (typically 0)
   out_size:             receives total .debug_info section size
   Returns malloc'd buffer. */
static uint8_t *macho_build_dwarf_debug_info(
    int32_t source_path_str_off,
    const MachoDwarfTypeDesc *type_descs,
    int32_t type_count,
    const int32_t *var_type_idxs,
    const int32_t *func_name_str_offs,
    const uint64_t *func_addrs,
    const uint32_t *func_sizes,
    int32_t func_count,
    const MachoDwarfVarEntry *vars,
    int32_t var_count,
    int32_t debug_abbrev_off,
    int32_t debug_ranges_off,
    int32_t *out_size) {

    if (func_count < 0) { if (out_size) *out_size = 0; return NULL; }
    if (func_count > 0 && (!func_name_str_offs || !func_addrs || !func_sizes)) {
        if (out_size) *out_size = 0; return NULL;
    }
    if (var_count > 0 && !vars) { if (out_size) *out_size = 0; return NULL; }
    if (type_count > 0 && (!type_descs || !var_type_idxs)) {
        if (out_size) *out_size = 0; return NULL;
    }

    /* Compute CU-level low_pc and high_pc (offset) */
    uint64_t cu_low = 0;
    uint64_t cu_high_offset = 0;
    if (func_count > 0) {
        cu_low = func_addrs[0];
        uint64_t cu_high = func_addrs[0] + func_sizes[0];
        for (int32_t i = 1; i < func_count; i++) {
            if (func_addrs[i] < cu_low) cu_low = func_addrs[i];
            uint64_t end = func_addrs[i] + func_sizes[i];
            if (end > cu_high) cu_high = end;
        }
        cu_high_offset = cu_high - cu_low;
        if (cu_high_offset > 0xFFFFFFFFu) cu_high_offset = 0xFFFFFFFFu;
    }

    /* DIE sizes (ULEB128 codes 1-5 are 1 byte each) */
    int32_t cu_die_size = 1 + 4 + 2 + 8 + 4 + 4 + 4;      /* 27 */
    int32_t subprog_die_size = 1 + 4 + 8 + 4 + 3;          /* 20 (frame_base exprloc: length + DW_OP_breg31 + 0) */
    int32_t param_die_size = 1 + 4 + 4 + 4;                /* 13 */

    /* Compute type DIE offsets */
    int32_t type_offsets_stk[16];
    int32_t *type_offsets = NULL;
    if (type_count > 0) {
        type_offsets = (type_count <= 16) ? type_offsets_stk :
                       (int32_t *)malloc((size_t)type_count * sizeof(int32_t));
        if (type_count > 16 && !type_offsets) {
            if (out_size) *out_size = 0; return NULL;
        }
    }
    int32_t type_section_size = macho_dwarf_compute_type_offsets(
        type_descs, type_count, cu_die_size,
        type_offsets);

    /* Count params per function */
    int32_t *func_pc = NULL;
    if (var_count > 0) {
        func_pc = (int32_t *)calloc((size_t)(func_count > 0 ? func_count : 1), sizeof(int32_t));
        if (!func_pc) {
            if (type_offsets && type_offsets != type_offsets_stk) free(type_offsets);
            if (out_size) *out_size = 0; return NULL;
        }
        for (int32_t vi = 0; vi < var_count; vi++) {
            int32_t fi = vars[vi].func_index;
            if (fi >= 0 && fi < func_count) func_pc[fi]++;
        }
    }

    int32_t total = 11; /* CU header */
    total += cu_die_size;
    total += type_section_size;
    for (int32_t fi = 0; fi < func_count; fi++) {
        total += subprog_die_size;
        total += func_pc ? func_pc[fi] * param_die_size : 0;
        total += 1; /* null terminator for subprogram children */
    }
    total += 1; /* null terminator for CU children */

    uint8_t *buf = (uint8_t *)malloc((size_t)total);
    if (!buf) {
        free(func_pc);
        if (type_offsets && type_offsets != type_offsets_stk) free(type_offsets);
        if (out_size) *out_size = 0; return NULL;
    }

    int32_t pos = 0;
    int32_t unit_len_off = pos;
    pos += 4; /* unit_length placeholder */

    /* version = 4 */
    buf[pos++] = 4; buf[pos++] = 0;
    /* debug_abbrev_offset */
    buf[pos++] = (uint8_t)(debug_abbrev_off & 0xFF);
    buf[pos++] = (uint8_t)((debug_abbrev_off >> 8) & 0xFF);
    buf[pos++] = (uint8_t)((debug_abbrev_off >> 16) & 0xFF);
    buf[pos++] = (uint8_t)((debug_abbrev_off >> 24) & 0xFF);
    /* address_size = 8 */
    buf[pos++] = 8;

    /* CU DIE (abbrev code 1) */
    pos += uleb128_encode(buf + pos, 1);
    /* strp: source_path */
    uint32_t sp = (uint32_t)source_path_str_off;
    buf[pos++] = (uint8_t)(sp & 0xFF); buf[pos++] = (uint8_t)((sp >> 8) & 0xFF);
    buf[pos++] = (uint8_t)((sp >> 16) & 0xFF); buf[pos++] = (uint8_t)((sp >> 24) & 0xFF);
    /* data2: DW_LANG_C89 */
    buf[pos++] = (uint8_t)(DW_LANG_C89 & 0xFF); buf[pos++] = (uint8_t)((DW_LANG_C89 >> 8) & 0xFF);
    /* addr: low_pc */
    buf[pos++] = (uint8_t)(cu_low & 0xFF); buf[pos++] = (uint8_t)((cu_low >> 8) & 0xFF);
    buf[pos++] = (uint8_t)((cu_low >> 16) & 0xFF); buf[pos++] = (uint8_t)((cu_low >> 24) & 0xFF);
    buf[pos++] = (uint8_t)((cu_low >> 32) & 0xFF); buf[pos++] = (uint8_t)((cu_low >> 40) & 0xFF);
    buf[pos++] = (uint8_t)((cu_low >> 48) & 0xFF); buf[pos++] = (uint8_t)((cu_low >> 56) & 0xFF);
    /* data4: high_pc offset */
    uint32_t ho = (uint32_t)cu_high_offset;
    buf[pos++] = (uint8_t)(ho & 0xFF); buf[pos++] = (uint8_t)((ho >> 8) & 0xFF);
    buf[pos++] = (uint8_t)((ho >> 16) & 0xFF); buf[pos++] = (uint8_t)((ho >> 24) & 0xFF);
    /* data4: stmt_list = 0 */
    buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0; buf[pos++] = 0;
    /* sec_offset: ranges = debug_ranges_off */
    uint32_t ro = (uint32_t)debug_ranges_off;
    buf[pos++] = (uint8_t)(ro & 0xFF); buf[pos++] = (uint8_t)((ro >> 8) & 0xFF);
    buf[pos++] = (uint8_t)((ro >> 16) & 0xFF); buf[pos++] = (uint8_t)((ro >> 24) & 0xFF);

    /* Type DIEs */
    for (int32_t ti = 0; ti < type_count; ti++) {
        const MachoDwarfTypeDesc *td = &type_descs[ti];
        switch (td->kind) {
            case MACHO_DW_TYPE_BASE: {
                /* Abbrev 2: base_type */
                pos += uleb128_encode(buf + pos, 2);
                uint32_t tn = (uint32_t)td->name_str_off;
                buf[pos++] = (uint8_t)(tn & 0xFF); buf[pos++] = (uint8_t)((tn >> 8) & 0xFF);
                buf[pos++] = (uint8_t)((tn >> 16) & 0xFF); buf[pos++] = (uint8_t)((tn >> 24) & 0xFF);
                buf[pos++] = td->byte_size;
                buf[pos++] = td->encoding;
                break;
            }
            case MACHO_DW_TYPE_STRUCT: {
                /* Abbrev 6: structure_type */
                pos += uleb128_encode(buf + pos, 6);
                uint32_t sn = (uint32_t)td->name_str_off;
                buf[pos++] = (uint8_t)(sn & 0xFF); buf[pos++] = (uint8_t)((sn >> 8) & 0xFF);
                buf[pos++] = (uint8_t)((sn >> 16) & 0xFF); buf[pos++] = (uint8_t)((sn >> 24) & 0xFF);
                buf[pos++] = td->byte_size;
                /* Member DIEs */
                int32_t mc = td->member_count < MACHO_DW_MAX_MEMBERS ? td->member_count : MACHO_DW_MAX_MEMBERS;
                for (int32_t mi = 0; mi < mc; mi++) {
                    pos += uleb128_encode(buf + pos, 7); /* Abbrev 7: member */
                    uint32_t mn = (uint32_t)td->member_name_offs[mi];
                    buf[pos++] = (uint8_t)(mn & 0xFF); buf[pos++] = (uint8_t)((mn >> 8) & 0xFF);
                    buf[pos++] = (uint8_t)((mn >> 16) & 0xFF); buf[pos++] = (uint8_t)((mn >> 24) & 0xFF);
                    /* ref4: member type */
                    int32_t mt_idx = td->member_type_idxs[mi];
                    int32_t mt_off = (mt_idx >= 0 && mt_idx < type_count && type_offsets)
                                     ? type_offsets[mt_idx] : 0;
                    buf[pos++] = (uint8_t)(mt_off & 0xFF); buf[pos++] = (uint8_t)((mt_off >> 8) & 0xFF);
                    buf[pos++] = (uint8_t)((mt_off >> 16) & 0xFF); buf[pos++] = (uint8_t)((mt_off >> 24) & 0xFF);
                    buf[pos++] = td->member_offsets[mi];  /* data_member_location */
                    buf[pos++] = td->member_byte_sizes[mi]; /* byte_size */
                }
                buf[pos++] = 0; /* children null terminator */
                break;
            }
            case MACHO_DW_TYPE_PTR: {
                /* Abbrev 8: pointer_type */
                pos += uleb128_encode(buf + pos, 8);
                int32_t pt_idx = td->pointee_type_idx;
                int32_t pt_off = (pt_idx >= 0 && pt_idx < type_count && type_offsets)
                                 ? type_offsets[pt_idx] : 0;
                buf[pos++] = (uint8_t)(pt_off & 0xFF); buf[pos++] = (uint8_t)((pt_off >> 8) & 0xFF);
                buf[pos++] = (uint8_t)((pt_off >> 16) & 0xFF); buf[pos++] = (uint8_t)((pt_off >> 24) & 0xFF);
                break;
            }
        }
    }

    /* Subprograms + their formal_parameter children */
    int32_t var_idx = 0;
    for (int32_t fi = 0; fi < func_count; fi++) {
        /* subprogram DIE (abbrev code 3) */
        pos += uleb128_encode(buf + pos, 3);
        uint32_t fn = (uint32_t)func_name_str_offs[fi];
        buf[pos++] = (uint8_t)(fn & 0xFF); buf[pos++] = (uint8_t)((fn >> 8) & 0xFF);
        buf[pos++] = (uint8_t)((fn >> 16) & 0xFF); buf[pos++] = (uint8_t)((fn >> 24) & 0xFF);
        /* addr: low_pc = func_addr */
        uint64_t fa = func_addrs[fi];
        buf[pos++] = (uint8_t)(fa & 0xFF); buf[pos++] = (uint8_t)((fa >> 8) & 0xFF);
        buf[pos++] = (uint8_t)((fa >> 16) & 0xFF); buf[pos++] = (uint8_t)((fa >> 24) & 0xFF);
        buf[pos++] = (uint8_t)((fa >> 32) & 0xFF); buf[pos++] = (uint8_t)((fa >> 40) & 0xFF);
        buf[pos++] = (uint8_t)((fa >> 48) & 0xFF); buf[pos++] = (uint8_t)((fa >> 56) & 0xFF);
        /* data4: high_pc = func_size (offset) */
        uint32_t fs = func_sizes[fi];
        buf[pos++] = (uint8_t)(fs & 0xFF); buf[pos++] = (uint8_t)((fs >> 8) & 0xFF);
        buf[pos++] = (uint8_t)((fs >> 16) & 0xFF); buf[pos++] = (uint8_t)((fs >> 24) & 0xFF);
        /* exprloc: frame_base = DW_OP_breg31 0 (SP) */
        buf[pos++] = 2;  /* length */
        buf[pos++] = DW_OP_breg31;
        buf[pos++] = 0;  /* SLEB128(0) */

        /* formal_parameter children */
        while (var_idx < var_count && vars[var_idx].func_index == fi) {
            pos += uleb128_encode(buf + pos, 4);
            uint32_t pn = (uint32_t)vars[var_idx].name_str_off;
            buf[pos++] = (uint8_t)(pn & 0xFF); buf[pos++] = (uint8_t)((pn >> 8) & 0xFF);
            buf[pos++] = (uint8_t)((pn >> 16) & 0xFF); buf[pos++] = (uint8_t)((pn >> 24) & 0xFF);
            /* ref4: type = type DIE CU-relative offset */
            int32_t type_idx = var_type_idxs ? var_type_idxs[var_idx] : 0;
            int32_t type_ref = (type_offsets && type_idx >= 0 && type_idx < type_count)
                               ? type_offsets[type_idx] : (11 + cu_die_size);
            uint32_t tr = (uint32_t)type_ref;
            buf[pos++] = (uint8_t)(tr & 0xFF); buf[pos++] = (uint8_t)((tr >> 8) & 0xFF);
            buf[pos++] = (uint8_t)((tr >> 16) & 0xFF); buf[pos++] = (uint8_t)((tr >> 24) & 0xFF);
            /* sec_offset: location list offset in .debug_loc */
            uint32_t lo = (uint32_t)vars[var_idx].loc_off;
            buf[pos++] = (uint8_t)(lo & 0xFF); buf[pos++] = (uint8_t)((lo >> 8) & 0xFF);
            buf[pos++] = (uint8_t)((lo >> 16) & 0xFF); buf[pos++] = (uint8_t)((lo >> 24) & 0xFF);
            var_idx++;
        }
        buf[pos++] = 0; /* null terminator for subprogram children */
    }
    buf[pos++] = 0; /* null terminator for CU children */

    /* Patch unit_length */
    int32_t ul = pos - unit_len_off - 4;
    buf[unit_len_off + 0] = (uint8_t)(ul & 0xFF);
    buf[unit_len_off + 1] = (uint8_t)((ul >> 8) & 0xFF);
    buf[unit_len_off + 2] = (uint8_t)((ul >> 16) & 0xFF);
    buf[unit_len_off + 3] = (uint8_t)((ul >> 24) & 0xFF);

    free(func_pc);
    if (type_offsets && type_offsets != type_offsets_stk) free(type_offsets);
    if (out_size) *out_size = total;
    return buf;
}

/* Extended Mach-O object writer with full DWARF debug sections.
   Same as macho_write_object_with_debug but also accepts debug_abbrev,
   debug_str, debug_info, and debug_loc sections.
   Pass 0/NULL for any unused section. */

/* ld64 drops assembler temps when carving atoms.  After the Mach-O `_`
   prefix, `.Lfoo` looks like an ELF temp; one `_main` then owns a
   300MB+ __text and ARM64 B/BL (±128MB) dies.  Drop a leading `.L` so
   private Cheng names stay unique N_EXT atoms. */
static void macho_atom_symbol_bytes(const char *name, const char **out, int32_t *len) {
    int32_t nl = (int32_t)strlen(name);
    if (nl >= 2 && name[0] == '.' && name[1] == 'L') {
        name += 2;
        nl -= 2;
    }
    *out = name;
    *len = nl;
}

static bool macho_write_object_with_debug_full(const char *path,
                                               const uint32_t *code, int32_t code_words,
                                               const char **names, const int32_t *offsets,
                                               int32_t name_count, int32_t local_count,
                                               const int32_t *reloc_offsets,
                                               const int32_t *reloc_symbols,
                                               int32_t reloc_count,
                                               const uint8_t *reloc_types,
                                               const uint8_t *debug_line_data, int32_t debug_line_size,
                                               const uint8_t *debug_abbrev_data, int32_t debug_abbrev_size,
                                               const uint8_t *debug_str_data, int32_t debug_str_size,
                                               const uint8_t *debug_info_data, int32_t debug_info_size,
                                               const uint8_t *debug_loc_data, int32_t debug_loc_size,
                                               const uint8_t *debug_frame_data, int32_t debug_frame_size,
                                               const uint8_t *debug_aranges_data, int32_t debug_aranges_size,
                                               const uint8_t *debug_ranges_data, int32_t debug_ranges_size,
                                               bool consume_code_mapping) {
    if (code_words < 0 || name_count < 0 ||
        local_count < 0 || local_count > name_count || reloc_count < 0) return false;
    if (name_count > 0 && (!names || !offsets)) return false;
    if (reloc_count > 0 && (!reloc_offsets || !reloc_symbols)) return false;
    if ((int64_t)code_words * 4 > INT32_MAX) return false;

    int32_t code_sz = code_words * 4;

    /* Collect non-zero DWARF sections */
    int32_t dbg_count = 0;
    int32_t dbg_sizes[8] = {0};
    const uint8_t *dbg_data[8] = {NULL};
    dbg_sizes[0] = debug_line_size;   dbg_data[0] = debug_line_data;
    dbg_sizes[1] = debug_abbrev_size; dbg_data[1] = debug_abbrev_data;
    dbg_sizes[2] = debug_str_size;    dbg_data[2] = debug_str_data;
    dbg_sizes[3] = debug_info_size;   dbg_data[3] = debug_info_data;
    dbg_sizes[4] = debug_loc_size;    dbg_data[4] = debug_loc_data;
    dbg_sizes[5] = debug_frame_size;  dbg_data[5] = debug_frame_data;
    dbg_sizes[6] = debug_aranges_size;  dbg_data[6] = debug_aranges_data;
    dbg_sizes[7] = debug_ranges_size;   dbg_data[7] = debug_ranges_data;
    for (int32_t i = 0; i < 8; i++) {
        if (dbg_data[i] && dbg_sizes[i] > 0) dbg_count++;
    }

    static const char *dwarf_sec_names[8] = {
        "__debug_line", "__debug_abbrev", "__debug_str",
        "__debug_info", "__debug_loc", "__debug_frame",
        "__debug_aranges", "__debug_ranges"
    };
    int32_t nsect = 1 + dbg_count;

    /* Symbol string table */
    /* Do not plant mid-function N_EXT labels.  Function symbols are already
       N_EXT atoms (largest ~12MB).  A 1MB stride splits live frames; ld then
       enters the second half without a prologue. */
    enum { COLD_MACHO_DEBUG_ISLAND_STRIDE = 1 * 1024 * 1024 };
    int32_t island_count = 0;
    int32_t total_syms = name_count + island_count;
    if (total_syms < name_count) return false;
    size_t str_cap = 2;
    for (int32_t i = 0; i < name_count; i++) {
        if (!names[i]) return false;
        size_t nl = strlen(names[i]);
        size_t add = nl + 2;
        if (str_cap > SIZE_MAX - add) return false;
        str_cap += add;
    }
    str_cap += (size_t)island_count * 40u;
    if (str_cap > INT32_MAX) return false;

    char *strtab = (char *)calloc(1, str_cap);
    size_t na = total_syms > 0 ? (size_t)total_syms : 1;
    int32_t *nstroff = (int32_t *)calloc(na, sizeof(int32_t));
    nlist_64_t *syms = (nlist_64_t *)calloc(na, sizeof(nlist_64_t));
    size_t ra = reloc_count > 0 ? (size_t)reloc_count : 1;
    relocation_info_t *relocs = (relocation_info_t *)calloc(ra, sizeof(relocation_info_t));
    if (!strtab || !nstroff || !syms || !relocs) {
        free(strtab); free(nstroff); free(syms); free(relocs);
        return false;
    }

    int32_t stro = 1;
    for (int32_t i = 0; i < name_count; i++) {
        const char *atom_name;
        int32_t nl;
        macho_atom_symbol_bytes(names[i], &atom_name, &nl);
        nstroff[i] = stro;
        strtab[stro++] = '_';
        memcpy(strtab + stro, atom_name, (size_t)nl);
        stro += nl; strtab[stro++] = '\0';
    }

    int32_t nsyms = name_count;
    for (int32_t i = 0; i < nsyms; i++) {
        syms[i].n_strx = (uint32_t)nstroff[i];
        if (offsets[i] < 0) {
            syms[i].n_type = N_UNDF | N_EXT; syms[i].n_sect = 0; syms[i].n_value = 0;
        } else if (i < local_count) {
            /* Private-extern, not section-local: ld64 carves atoms from
               consecutive N_EXT symbols.  One N_SECT _main over a 300MB+
               __text cannot host branch islands, so ARM64 B/BL (±128MB)
               fails at link. */
            syms[i].n_type = N_SECT | N_EXT | N_PEXT;
            syms[i].n_sect = 1;
            syms[i].n_value = (uint64_t)(offsets[i] * 4);
        } else {
            syms[i].n_type = N_SECT | N_EXT; syms[i].n_sect = 1; syms[i].n_value = (uint64_t)(offsets[i] * 4);
        }
        syms[i].n_desc = 0;
    }
    for (int32_t island = 0; island < island_count; island++) {
        int32_t si = name_count + island;
        char island_name[32];
        int32_t n = snprintf(
            island_name, sizeof(island_name),
            "cheng_cold_island_%d", island + 1);
        if (n <= 0 || n >= (int32_t)sizeof(island_name) ||
            stro + 1 + n + 1 >= (int32_t)str_cap) {
            free(strtab); free(nstroff); free(syms); free(relocs);
            return false;
        }
        nstroff[si] = stro;
        strtab[stro++] = '_';
        memcpy(strtab + stro, island_name, (size_t)n);
        stro += n;
        strtab[stro++] = '\0';
        syms[si].n_strx = (uint32_t)nstroff[si];
        syms[si].n_type = N_SECT | N_EXT;
        syms[si].n_sect = 1;
        syms[si].n_value = (uint64_t)(island + 1) * (uint64_t)COLD_MACHO_DEBUG_ISLAND_STRIDE;
        syms[si].n_desc = 0;
    }
    strtab[stro++] = '\0';
    nsyms = total_syms;
    if ((int64_t)nsyms * (int64_t)sizeof(nlist_64_t) > INT32_MAX) {
        free(strtab); free(nstroff); free(syms); free(relocs);
        return false;
    }
    int32_t sym_size = nsyms * (int32_t)sizeof(nlist_64_t);

    int32_t nreloc = reloc_count;
    for (int32_t i = 0; i < nreloc; i++) {
        if (reloc_offsets[i] < 0 || reloc_offsets[i] >= code_sz ||
            reloc_symbols[i] < 0 || reloc_symbols[i] >= nsyms) {
            free(strtab); free(nstroff); free(syms); free(relocs);
            return false;
        }
        uint8_t rtype = reloc_types ? reloc_types[i] : (uint8_t)ARM64_RELOC_BRANCH26;
        if (rtype != ARM64_RELOC_BRANCH26 &&
            rtype != ARM64_RELOC_PAGE21 &&
            rtype != ARM64_RELOC_PAGEOFF12) {
            free(strtab); free(nstroff); free(syms); free(relocs);
            return false;
        }
        relocs[i].r_address = reloc_offsets[i];
        relocs[i].r_symbolnum = (uint32_t)reloc_symbols[i];
        relocs[i].r_pcrel = (rtype == ARM64_RELOC_PAGEOFF12) ? 0u : 1u;
        relocs[i].r_length = 2; relocs[i].r_extern = 1;
        relocs[i].r_type = rtype;
    }
    if ((int64_t)nreloc * (int64_t)sizeof(relocation_info_t) > INT32_MAX) {
        free(strtab); free(nstroff); free(syms); free(relocs);
        return false;
    }
    int32_t reloc_size = nreloc * (int32_t)sizeof(relocation_info_t);

    /* Mach-O layout */
    int32_t hdr_sz = 32;
    int32_t seg_cmd_sz = 72 + 80 * nsect;
    int32_t build_ver_cmd_sz = 24, symtab_cmd_sz = 24;
    int32_t cmd_sz = seg_cmd_sz + build_ver_cmd_sz + symtab_cmd_sz;
    int32_t code_off = hdr_sz + cmd_sz;

    int32_t sect_off[9];
    sect_off[0] = code_off;
    int32_t cur = code_off + code_sz;
    int32_t si = 1;
    for (int32_t dw = 0; dw < 8; dw++) {
        if (dbg_data[dw] && dbg_sizes[dw] > 0) {
            sect_off[si] = cur; cur += dbg_sizes[dw]; si++;
        }
    }

    int32_t reloc_off = cur;
    int32_t sym_off = reloc_off + reloc_size;
    int32_t strof = sym_off + sym_size;
    int64_t total_sz64 = (int64_t)strof + stro;
    if (total_sz64 > INT32_MAX) {
        free(strtab); free(nstroff); free(syms); free(relocs);
        return false;
    }
    int32_t total_sz = (int32_t)total_sz64;

    uint8_t *buf = (uint8_t *)calloc(1, (size_t)code_off);
    if (!buf) {
        free(strtab); free(nstroff); free(syms); free(relocs);
        return false;
    }
    uint32_t *w = (uint32_t *)buf;
    w[0] = MH_MAGIC_64; w[1] = CPU_TYPE_ARM64; w[2] = CPU_SUBTYPE_ARM64_ALL; w[3] = MH_OBJECT;
    w[4] = 3; w[5] = (uint32_t)cmd_sz; w[6] = MH_SUBSECTIONS_VIA_SYMBOLS; w[7] = 0;
    int32_t ph = hdr_sz;

    /* LC_SEGMENT64 */
    uint32_t *seg = (uint32_t *)(buf + ph);
    seg[0] = LC_SEGMENT64; seg[1] = (uint32_t)seg_cmd_sz;
    macho_segname(buf + ph + 8, "");
    seg[6] = 0; seg[7] = 0;
    seg[8] = (uint32_t)(code_sz + cur - code_off - code_sz); seg[9] = 0;
    seg[10] = (uint32_t)code_off; seg[11] = 0;
    seg[12] = (uint32_t)(code_sz + cur - code_off - code_sz); seg[13] = 0;
    seg[14] = 7; seg[15] = 7; seg[16] = (uint32_t)nsect; seg[17] = 0;

    /* Section 0: __TEXT,__text */
    {
        uint32_t *sec = (uint32_t *)(buf + ph + 72);
        macho_segname(buf + ph + 72, "__text");
        macho_segname(buf + ph + 88, "__TEXT");
        sec[8] = 0; sec[9] = 0;
        sec[10] = (uint32_t)code_sz; sec[11] = 0;
        sec[12] = (uint32_t)code_off; sec[13] = 2;
        sec[14] = (uint32_t)reloc_off; sec[15] = (uint32_t)nreloc;
        sec[16] = 0x80000400; sec[17] = 0; sec[18] = 0; sec[19] = 0;
    }

    /* DWARF sections */
    si = 1;
    for (int32_t dw = 0; dw < 8; dw++) {
        if (!(dbg_data[dw] && dbg_sizes[dw] > 0)) continue;
        uint32_t *sec = (uint32_t *)(buf + ph + 72 + 80 * si);
        macho_segname(buf + ph + 72 + 80 * si, dwarf_sec_names[dw]);
        macho_segname(buf + ph + 72 + 80 * si + 16, "__DWARF");
        sec[8] = (uint32_t)(code_sz); sec[9] = 0;
        sec[10] = (uint32_t)dbg_sizes[dw]; sec[11] = 0;
        sec[12] = (uint32_t)sect_off[si]; sec[13] = 0;
        sec[14] = 0; sec[15] = 0;
        sec[16] = 0x02000000; sec[17] = 0; sec[18] = 0; sec[19] = 0;
        si++;
    }
    ph += seg_cmd_sz;

    /* LC_BUILD_VERSION */
    {
        uint32_t *bv = (uint32_t *)(buf + ph);
        bv[0] = 0x32; bv[1] = build_ver_cmd_sz; bv[2] = 1;
        bv[3] = 0x000e0000; bv[4] = 0x000e0000; bv[5] = 0;
    }
    ph += build_ver_cmd_sz;

    /* LC_SYMTAB */
    {
        uint32_t *st = (uint32_t *)(buf + ph);
        st[0] = LC_SYMTAB; st[1] = symtab_cmd_sz;
        st[2] = (uint32_t)sym_off; st[3] = (uint32_t)nsyms;
        st[4] = (uint32_t)strof; st[5] = (uint32_t)stro;
    }

    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        free(buf); free(strtab); free(nstroff); free(syms); free(relocs);
        return false;
    }
    if (!macho_configure_bounded_stream_fd(fd)) {
        close(fd);
        unlink(path);
        free(buf); free(strtab); free(nstroff); free(syms); free(relocs);
        return false;
    }
    bool write_ok = macho_write_all(fd, buf, (size_t)code_off);
    if (write_ok && code_sz > 0)
        write_ok = consume_code_mapping
            ? macho_write_all_consuming_mmap(fd, code, (size_t)code_sz)
            : macho_write_all(fd, code, (size_t)code_sz);
    for (int32_t dw = 0; write_ok && dw < 8; dw++) {
        if (dbg_data[dw] && dbg_sizes[dw] > 0)
            write_ok = macho_write_all(
                fd, dbg_data[dw], (size_t)dbg_sizes[dw]);
    }
    if (write_ok && reloc_size > 0)
        write_ok = macho_write_all(fd, relocs, (size_t)reloc_size);
    if (write_ok && sym_size > 0)
        write_ok = macho_write_all(fd, syms, (size_t)sym_size);
    if (write_ok && stro > 0)
        write_ok = macho_write_all(fd, strtab, (size_t)stro);
    if (write_ok) {
        off_t final_offset = lseek(fd, 0, SEEK_CUR);
        if (final_offset != (off_t)total_sz) write_ok = false;
    }
    int close_rc = close(fd);
    if (!write_ok || close_rc != 0) {
        unlink(path);
        free(buf); free(strtab); free(nstroff); free(syms); free(relocs);
        return false;
    }
    free(buf); free(strtab); free(nstroff); free(syms); free(relocs);
    return true;
}

/* Mach-O object writer with code + data sections (for LSP compiler facts) */
static bool macho_write_text_data_object(const char *path,
                                         const uint32_t *code, int32_t code_words,
                                         const uint8_t *data, int32_t data_size,
                                         const char **names,
                                         const uint64_t *symbol_values,
                                         const uint8_t *symbol_sections,
                                         int32_t name_count,
                                         int32_t local_count,
                                         const int32_t *reloc_offsets,
                                         const int32_t *reloc_symbols,
                                         const uint8_t *reloc_types,
                                         const uint8_t *reloc_pcrel,
                                         int32_t reloc_count) {
    if (code_words < 0 || data_size <= 0 || name_count <= 0 ||
        local_count < 0 || local_count > name_count || reloc_count < 0) return false;
    if ((int64_t)code_words * 4 > INT32_MAX) return false;
    int32_t code_sz = code_words * 4;
    if (code_sz > 0 && !code) return false;
    if (!data || !names || !symbol_values || !symbol_sections) return false;
    if (reloc_count > 0 &&
        (!reloc_offsets || !reloc_symbols || !reloc_types || !reloc_pcrel)) return false;

    /* Function N_EXT atoms already exist.  Mid-function 1MB labels split
       live frames and send control into the second half without a prologue. */
    enum { COLD_MACHO_ISLAND_STRIDE = 1 * 1024 * 1024 };
    int32_t island_count = 0;
    int32_t total_syms = name_count + island_count;
    if (total_syms < name_count) return false;

    size_t str_cap = 2;
    for (int32_t i = 0; i < name_count; i++) {
        if (!names[i]) return false;
        size_t nl = strlen(names[i]);
        size_t add = nl + 2;
        if (str_cap > SIZE_MAX - add) return false;
        str_cap += add;
    }
    str_cap += (size_t)island_count * 40u;
    if (str_cap > INT32_MAX) return false;

    char *strtab = (char *)calloc(1, str_cap);
    int32_t *name_stroff = (int32_t *)calloc((size_t)total_syms, sizeof(int32_t));
    nlist_64_t *syms = (nlist_64_t *)calloc((size_t)total_syms, sizeof(nlist_64_t));
    relocation_info_t *relocs =
        (relocation_info_t *)calloc(reloc_count > 0 ? (size_t)reloc_count : 1u,
                                    sizeof(relocation_info_t));
    if (!strtab || !name_stroff || !syms || !relocs) {
        free(strtab); free(name_stroff); free(syms); free(relocs);
        return false;
    }

    int32_t str_off = 1;
    for (int32_t i = 0; i < name_count; i++) {
        const char *atom_name;
        int32_t nl;
        macho_atom_symbol_bytes(names[i], &atom_name, &nl);
        name_stroff[i] = str_off;
        strtab[str_off++] = '_';
        memcpy(strtab + str_off, atom_name, (size_t)nl);
        str_off += nl;
        strtab[str_off++] = '\0';
    }

    for (int32_t i = 0; i < name_count; i++) {
        syms[i].n_strx = (uint32_t)name_stroff[i];
        uint8_t section = symbol_sections[i];
        if (section == 0) {
            syms[i].n_type = N_UNDF | N_EXT;
            syms[i].n_sect = 0;
            syms[i].n_value = 0;
        } else {
            if (section != 1 && section != 2) {
                free(strtab); free(name_stroff); free(syms); free(relocs);
                return false;
            }
            syms[i].n_type = (uint8_t)(N_SECT | N_EXT |
                (i < local_count ? N_PEXT : 0));
            syms[i].n_sect = section;
            syms[i].n_value = symbol_values[i];
        }
        syms[i].n_desc = 0;
    }
    for (int32_t island = 0; island < island_count; island++) {
        int32_t si = name_count + island;
        char island_name[32];
        int32_t n = snprintf(
            island_name, sizeof(island_name),
            "cheng_cold_island_%d", island + 1);
        if (n <= 0 || n >= (int32_t)sizeof(island_name) ||
            str_off + 1 + n + 1 >= (int32_t)str_cap) {
            free(strtab); free(name_stroff); free(syms); free(relocs);
            return false;
        }
        name_stroff[si] = str_off;
        strtab[str_off++] = '_';
        memcpy(strtab + str_off, island_name, (size_t)n);
        str_off += n;
        strtab[str_off++] = '\0';
        syms[si].n_strx = (uint32_t)name_stroff[si];
        syms[si].n_type = N_SECT | N_EXT;
        syms[si].n_sect = 1;
        syms[si].n_value = (uint64_t)(island + 1) * (uint64_t)COLD_MACHO_ISLAND_STRIDE;
        syms[si].n_desc = 0;
    }
    strtab[str_off++] = '\0';
    if ((int64_t)total_syms * (int64_t)sizeof(nlist_64_t) > INT32_MAX) {
        free(strtab); free(name_stroff); free(syms); free(relocs);
        return false;
    }
    int32_t sym_size = total_syms * (int32_t)sizeof(nlist_64_t);

    for (int32_t i = 0; i < reloc_count; i++) {
        uint8_t reloc_type = reloc_types[i];
        if (reloc_offsets[i] < 0 || reloc_offsets[i] >= code_sz ||
            reloc_symbols[i] < 0 || reloc_symbols[i] >= name_count ||
            (reloc_type != ARM64_RELOC_BRANCH26 &&
             reloc_type != ARM64_RELOC_PAGE21 &&
             reloc_type != ARM64_RELOC_PAGEOFF12 &&
             reloc_type != ARM64_RELOC_UNSIGNED)) {
            free(strtab); free(name_stroff); free(syms); free(relocs);
            return false;
        }
        relocs[i].r_address = reloc_offsets[i];
        relocs[i].r_symbolnum = (uint32_t)reloc_symbols[i];
        relocs[i].r_pcrel = reloc_pcrel[i] ? 1u : 0u;
        relocs[i].r_length = 2;
        relocs[i].r_extern = 1;
        relocs[i].r_type = reloc_type;
    }
    if ((int64_t)reloc_count * (int64_t)sizeof(relocation_info_t) > INT32_MAX) {
        free(strtab); free(name_stroff); free(syms); free(relocs);
        return false;
    }
    int32_t reloc_size = reloc_count * (int32_t)sizeof(relocation_info_t);

    int32_t hdr_sz = 32, seg_cmd_sz = 72 + 80 * 2;
    int32_t build_ver_cmd_sz = 24, symtab_cmd_sz = 24;
    int32_t cmd_sz = seg_cmd_sz + build_ver_cmd_sz + symtab_cmd_sz;
    int32_t text_off = hdr_sz + cmd_sz;
    int32_t data_addr = macho_align_i32(code_sz, 8);
    int32_t data_off = text_off + data_addr;
    int32_t reloc_off = macho_align_i32(data_off + data_size, 8);
    int32_t sym_off = macho_align_i32(reloc_off + reloc_size, 8);
    int32_t str_off_file = sym_off + sym_size;
    int64_t total_sz64 = (int64_t)str_off_file + str_off;
    if (total_sz64 > INT32_MAX) {
        free(strtab); free(name_stroff); free(syms); free(relocs);
        return false;
    }
    int32_t total_sz = (int32_t)total_sz64;
    uint8_t *buf = (uint8_t *)calloc(1, (size_t)text_off);
    if (!buf) {
        free(strtab); free(name_stroff); free(syms); free(relocs);
        return false;
    }

    uint32_t *w = (uint32_t *)buf;
    w[0] = MH_MAGIC_64; w[1] = CPU_TYPE_ARM64; w[2] = CPU_SUBTYPE_ARM64_ALL; w[3] = MH_OBJECT;
    w[4] = 3; w[5] = cmd_sz; w[6] = MH_SUBSECTIONS_VIA_SYMBOLS; w[7] = 0;
    int32_t pos = hdr_sz;

    uint32_t *seg = (uint32_t *)(buf + pos);
    seg[0] = LC_SEGMENT64; seg[1] = seg_cmd_sz;
    macho_segname(buf + pos + 8, "");
    seg[6] = 0; seg[7] = 0;
    seg[8] = (uint32_t)(data_addr + data_size); seg[9] = 0;
    seg[10] = (uint32_t)text_off; seg[11] = 0;
    seg[12] = (uint32_t)(data_addr + data_size); seg[13] = 0;
    seg[14] = 7; seg[15] = 7; seg[16] = 2; seg[17] = 0;

    uint32_t *text_sec = (uint32_t *)(buf + pos + 72);
    macho_segname(buf + pos + 72, "__text");
    macho_segname(buf + pos + 88, "__TEXT");
    text_sec[8] = 0; text_sec[9] = 0;
    text_sec[10] = (uint32_t)code_sz; text_sec[11] = 0;
    text_sec[12] = (uint32_t)text_off; text_sec[13] = 2;
    text_sec[14] = (uint32_t)reloc_off; text_sec[15] = reloc_count;
    text_sec[16] = 0x80000400; text_sec[17] = 0; text_sec[18] = 0; text_sec[19] = 0;

    uint32_t *data_sec = (uint32_t *)(buf + pos + 72 + 80);
    macho_segname(buf + pos + 72 + 80, "__data");
    macho_segname(buf + pos + 72 + 80 + 16, "__DATA");
    data_sec[8] = (uint32_t)data_addr; data_sec[9] = 0;
    data_sec[10] = (uint32_t)data_size; data_sec[11] = 0;
    data_sec[12] = (uint32_t)data_off; data_sec[13] = 3;
    data_sec[14] = 0; data_sec[15] = 0;
    data_sec[16] = 0; data_sec[17] = 0; data_sec[18] = 0; data_sec[19] = 0;
    pos += seg_cmd_sz;

    uint32_t *bv = (uint32_t *)(buf + pos);
    bv[0] = 0x32; bv[1] = build_ver_cmd_sz; bv[2] = 1; bv[3] = 0x000e0000; bv[4] = 0x000e0000; bv[5] = 0;
    pos += build_ver_cmd_sz;

    uint32_t *st = (uint32_t *)(buf + pos);
    st[0] = LC_SYMTAB; st[1] = symtab_cmd_sz;
    st[2] = (uint32_t)sym_off; st[3] = (uint32_t)total_syms;
    st[4] = (uint32_t)str_off_file; st[5] = (uint32_t)str_off;

    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        free(buf); free(strtab); free(name_stroff); free(syms); free(relocs);
        return false;
    }
    if (!macho_configure_bounded_stream_fd(fd)) {
        close(fd);
        unlink(path);
        free(buf); free(strtab); free(name_stroff); free(syms); free(relocs);
        return false;
    }
    size_t text_padding = (size_t)data_addr - (size_t)code_sz;
    size_t data_padding =
        (size_t)reloc_off - ((size_t)data_off + (size_t)data_size);
    size_t reloc_padding =
        (size_t)sym_off - ((size_t)reloc_off + (size_t)reloc_size);
    bool write_ok = macho_write_all(fd, buf, (size_t)text_off);
    if (write_ok && code_sz > 0)
        write_ok = macho_write_all_consuming_mmap(
            fd, code, (size_t)code_sz);
    if (write_ok) write_ok = macho_write_zeros(fd, text_padding);
    if (write_ok && data_size > 0)
        write_ok = macho_write_all(fd, data, (size_t)data_size);
    if (write_ok) write_ok = macho_write_zeros(fd, data_padding);
    if (write_ok && reloc_size > 0)
        write_ok = macho_write_all(fd, relocs, (size_t)reloc_size);
    if (write_ok) write_ok = macho_write_zeros(fd, reloc_padding);
    if (write_ok && sym_size > 0)
        write_ok = macho_write_all(fd, syms, (size_t)sym_size);
    if (write_ok && str_off > 0)
        write_ok = macho_write_all(fd, strtab, (size_t)str_off);
    if (write_ok) {
        off_t final_offset = lseek(fd, 0, SEEK_CUR);
        if (final_offset != (off_t)total_sz) write_ok = false;
    }
    int close_rc = close(fd);
    if (!write_ok || close_rc != 0) {
        unlink(path);
        free(buf); free(strtab); free(name_stroff); free(syms); free(relocs);
        return false;
    }
    free(buf); free(strtab); free(name_stroff); free(syms); free(relocs);
    return true;
}
