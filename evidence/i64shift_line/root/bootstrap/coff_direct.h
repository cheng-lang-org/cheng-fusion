/* coff_direct.h -- Minimal COFF/PE object file (.obj) writer for Windows x86_64.
 *
 * Writes a relocatable COFF object file for x86_64-pc-windows-msvc.
 * Symbols + relocations for external linkage.
 */

#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdlib.h>
#include <errno.h>

#define IMAGE_FILE_MACHINE_AMD64      0x8664
#define IMAGE_FILE_MACHINE_ARM64      0xAA64

#define IMAGE_REL_AMD64_REL32         0x0004
#define IMAGE_REL_AMD64_ADDR64        0x0001
#define IMAGE_REL_ARM64_BRANCH26      0x0003

static bool coff_write_all_bytes(int fd, const void *data, size_t len) {
    const uint8_t *p = (const uint8_t *)data;
    while (len > 0) {
        ssize_t n = write(fd, p, len);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) return false;
        p += (size_t)n;
        len -= (size_t)n;
    }
    return true;
}

static bool coff_write_hex_sidecar(const char *path, const uint8_t *data, int32_t len) {
    if (!path || !data || len < 0) return false;
    size_t path_len = strlen(path);
    char *sidecar = (char *)malloc(path_len + 5);
    if (!sidecar) return false;
    memcpy(sidecar, path, path_len);
    memcpy(sidecar + path_len, ".hex", 5);

    int fd = open(sidecar, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        free(sidecar);
        return false;
    }

    static const char hex[] = "0123456789abcdef";
    char out[8192];
    size_t out_len = 0;
    for (int32_t i = 0; i < len; i++) {
        uint8_t b = data[i];
        out[out_len++] = hex[b >> 4];
        out[out_len++] = hex[b & 15];
        if (out_len + 2 > sizeof(out)) {
            if (!coff_write_all_bytes(fd, out, out_len)) {
                close(fd);
                unlink(sidecar);
                free(sidecar);
                return false;
            }
            out_len = 0;
        }
    }
    bool ok = out_len == 0 || coff_write_all_bytes(fd, out, out_len);
    if (close(fd) != 0) ok = false;
    if (!ok) unlink(sidecar);
    free(sidecar);
    return ok;
}

/* COFF symbol table entry (18 bytes) */
typedef struct {
    char     name[8];         /* 8-byte name (or offset into string table) */
    uint32_t value;
    int16_t  section_number;
    uint16_t type;
    uint8_t  storage_class;
    uint8_t  num_aux;
} __attribute__((packed)) CoffSym;

/* COFF relocation entry (10 bytes) */
typedef struct {
    uint32_t virtual_address;
    uint32_t symbol_table_index;
    uint16_t type;
} __attribute__((packed)) CoffReloc;

static bool coff_write_object(const char *path,
                              const uint32_t *code, int32_t code_words,
                              const char **names, const int32_t *offsets,
                              int32_t name_count,
                              int32_t local_count,
                              const int32_t *reloc_offsets,
                              const int32_t *reloc_symbols,
                              int32_t reloc_count,
                              uint16_t machine) {
    if (!path || code_words < 0 ||
        code_words > INT32_MAX / 4 ||
        name_count < 0 ||
        name_count > INT32_MAX / (int32_t)sizeof(CoffSym) ||
        local_count < 0 || local_count > name_count ||
        reloc_count < 0 || reloc_count > UINT16_MAX ||
        (code_words > 0 && !code) ||
        (name_count > 0 && (!names || !offsets)) ||
        (reloc_count > 0 && (!reloc_offsets || !reloc_symbols)) ||
        (machine != IMAGE_FILE_MACHINE_AMD64 &&
         machine != IMAGE_FILE_MACHINE_ARM64)) {
        return false;
    }
    int32_t code_sz = code_words * 4;
    int32_t nsyms = name_count;
    int32_t *name_stroff = (int32_t *)calloc(nsyms > 0 ? nsyms : 1, sizeof(int32_t));
    bool *use_strtab = (bool *)calloc(nsyms > 0 ? nsyms : 1, sizeof(bool));
    if (!name_stroff || !use_strtab) {
        free(name_stroff);
        free(use_strtab);
        return false;
    }

    /* Build string table for long symbol names (> 8 chars) */
    char strtab[65536];
    int32_t str_off = 4; /* first 4 bytes = size of string table */
    for (int32_t i = 0; i < name_count; i++) {
        if (!names[i]) {
            free(name_stroff);
            free(use_strtab);
            return false;
        }
        size_t name_length = strlen(names[i]);
        if (name_length > (size_t)INT32_MAX) {
            free(name_stroff);
            free(use_strtab);
            return false;
        }
        int32_t nl = (int32_t)name_length;
        if (nl <= 8) {
            /* Short name fits in CoffSym.name */
            name_stroff[i] = 0;
            use_strtab[i] = false;
        } else {
            /* Long name: store in string table */
            name_stroff[i] = str_off;
            use_strtab[i] = true;
            if (name_length >= sizeof(strtab) - (size_t)str_off) {
                free(name_stroff);
                free(use_strtab);
                return false;
            }
            memcpy(strtab + str_off, names[i], nl);
            str_off += nl;
            strtab[str_off++] = '\0';
        }
    }
    uint32_t coff_strtab_size = (uint32_t)str_off;
    memcpy(strtab, &coff_strtab_size, 4);

    /* Build symbol table */
    CoffSym *syms = (CoffSym *)calloc(
        (size_t)(nsyms > 0 ? nsyms : 1), sizeof(CoffSym));
    if (!syms) {
        free(name_stroff);
        free(use_strtab);
        return false;
    }
    for (int32_t i = 0; i < name_count; i++) {
        if (offsets[i] > (int32_t)(UINT32_MAX / 4u)) {
            free(syms);
            free(name_stroff);
            free(use_strtab);
            return false;
        }
        int32_t nl = (int32_t)strlen(names[i]);
        if (use_strtab[i]) {
            /* First 4 bytes are zeros, next 4 bytes = offset into string table */
            syms[i].name[0] = 0;
            syms[i].name[1] = 0;
            syms[i].name[2] = 0;
            syms[i].name[3] = 0;
            uint32_t off = (uint32_t)name_stroff[i];
            memcpy(&syms[i].name[4], &off, 4);
        } else {
            memset(syms[i].name, 0, 8);
            memcpy(syms[i].name, names[i], nl < 8 ? nl : 8);
        }
        syms[i].value          = (offsets[i] >= 0) ? (uint32_t)offsets[i] * 4u : 0;
        syms[i].section_number = (offsets[i] >= 0) ? 1 : 0; /* section 1 or UNDEF */
        syms[i].type           = 0x20; /* function */
        syms[i].storage_class  = (offsets[i] >= 0 && i < local_count) ? 3 : 2; /* static local : external */
        syms[i].num_aux        = 0;
    }
    int32_t sym_size = nsyms * (int32_t)sizeof(CoffSym);

    /* Build relocation table */
    CoffReloc *relocs = (CoffReloc *)calloc(reloc_count > 0 ? reloc_count : 1, sizeof(CoffReloc));
    if (!relocs) {
        free(syms);
        free(name_stroff);
        free(use_strtab);
        return false;
    }
    for (int32_t i = 0; i < reloc_count; i++) {
        if (reloc_offsets[i] < 0 || reloc_offsets[i] >= code_sz ||
            reloc_symbols[i] < 0 || reloc_symbols[i] >= nsyms) {
            free(syms);
            free(relocs);
            free(name_stroff);
            free(use_strtab);
            return false;
        }
        relocs[i].virtual_address   = (uint32_t)reloc_offsets[i];
        relocs[i].symbol_table_index = (uint32_t)reloc_symbols[i];
        relocs[i].type              = (machine == IMAGE_FILE_MACHINE_ARM64) ?
                                        IMAGE_REL_ARM64_BRANCH26 : IMAGE_REL_AMD64_REL32;
    }
    int32_t reloc_size = reloc_count * (int32_t)sizeof(CoffReloc);

    /* COFF layout */
    int32_t hdr_sz    = 20;  /* COFF file header */
    int32_t sect_sz   = 40;  /* one section header */
    int64_t code_off64 = (int64_t)hdr_sz + sect_sz;
    int64_t reloc_off64 = code_off64 + code_sz;
    int64_t sym_off64 = reloc_off64 + reloc_size;
    int64_t str_off_file64 = sym_off64 + sym_size;
    int64_t total_sz64 = str_off_file64 + str_off;
    if (total_sz64 > INT32_MAX) {
        free(syms);
        free(relocs);
        free(name_stroff);
        free(use_strtab);
        return false;
    }
    int32_t code_off = (int32_t)code_off64;
    int32_t reloc_off = (int32_t)reloc_off64;
    int32_t sym_off = (int32_t)sym_off64;
    int32_t str_off_file = (int32_t)str_off_file64;
    int32_t total_sz = (int32_t)total_sz64;

    uint8_t *buf = (uint8_t *)calloc(1, total_sz);
    if (!buf) {
        free(syms);
        free(relocs);
        free(name_stroff);
        free(use_strtab);
        return false;
    }
    uint32_t *w = (uint32_t *)buf;

    /* COFF File Header
       Layout: Machine(2) + NumberOfSections(2) at offset 0,
               TimeDateStamp(4) at offset 4,
               PointerToSymbolTable(4) at offset 8,
               NumberOfSymbols(4) at offset 12.
       w[] = uint32_t view, so w[0]=bytes0-3, w[1]=bytes4-7, etc.
       Pack Machine (low 16 bits) with NumberOfSections=1 (high 16 bits). */
    w[0] = machine | (1 << 16);  /* Machine + NumberOfSections=1 */
    w[1] = 0;                    /* TimeDateStamp */
    w[2] = (uint32_t)sym_off;    /* PointerToSymbolTable */
    w[3] = (uint32_t)nsyms;      /* NumberOfSymbols */

    /* Optional header size: 0 for object files */
    uint16_t *h16 = (uint16_t *)(buf + 16);
    h16[0] = 0;                /* SizeOfOptionalHeader */
    uint16_t *flags = (uint16_t *)(buf + 18);
    flags[0] = 0;              /* Characteristics */

    /* Section Header */
    uint8_t *sect = buf + hdr_sz;
    memset(sect, 0, 40);
    memcpy(sect, ".text", 5);  /* Name */
    uint32_t *s32 = (uint32_t *)(sect + 8);
    s32[0] = 0;                     /* PhysicalAddress / VirtualSize */
    s32[1] = 0;                     /* VirtualAddress */
    s32[2] = (uint32_t)code_sz;     /* SizeOfRawData */
    s32[3] = (uint32_t)code_off;    /* PointerToRawData */
    s32[4] = (uint32_t)reloc_off;   /* PointerToRelocations */
    s32[5] = 0;                     /* PointerToLinenumbers */
    uint16_t *s16 = (uint16_t *)(sect + 32);
    s16[0] = (uint16_t)reloc_count; /* NumberOfRelocations */
    s16[1] = 0;                     /* NumberOfLinenumbers */
    s32 = (uint32_t *)(sect + 36);
    s32[0] = 0x60500020;            /* Characteristics: TEXT, CODE, EXECUTE, READ, ALIGN_16 */

    /* Code */
    if (code_sz > 0) memcpy(buf + code_off, code, (size_t)code_sz);
    /* Relocations */
    memcpy(buf + reloc_off, relocs, reloc_size);
    /* Symbol table */
    memcpy(buf + sym_off, syms, sym_size);
    /* String table */
    memcpy(buf + str_off_file, strtab, 4); /* first 4 bytes = total size */
    memcpy(buf + str_off_file + 4, strtab + 4, str_off - 4);

    free(syms);
    free(relocs);
    free(name_stroff);
    free(use_strtab);

    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) { free(buf); return false; }
    bool ok = coff_write_all_bytes(fd, buf, (size_t)total_sz);
    if (close(fd) != 0) ok = false;
    if (!ok || !coff_write_hex_sidecar(path, buf, total_sz)) {
        unlink(path);
        free(buf);
        return false;
    }
    free(buf);
    return true;
}

static bool coff_write_text_data_object(const char *path,
                                        const uint32_t *code, int32_t code_words,
                                        const uint8_t *data, int32_t data_size,
                                        const char **names, const uint32_t *values,
                                        const uint8_t *sections,
                                        int32_t name_count,
                                        int32_t local_count,
                                        const int32_t *reloc_offsets,
                                        const int32_t *reloc_symbols,
                                        int32_t reloc_count,
                                        uint16_t machine) {
    if (!path || code_words < 0 ||
        code_words > INT32_MAX / 4 || data_size < 0 ||
        name_count < 0 ||
        name_count > INT32_MAX / (int32_t)sizeof(CoffSym) ||
        local_count < 0 || local_count > name_count ||
        reloc_count < 0 || reloc_count > UINT16_MAX ||
        (code_words > 0 && !code) || (data_size > 0 && !data) ||
        (name_count > 0 && !names) ||
        (reloc_count > 0 && (!reloc_offsets || !reloc_symbols)) ||
        (machine != IMAGE_FILE_MACHINE_AMD64 &&
         machine != IMAGE_FILE_MACHINE_ARM64)) {
        return false;
    }
    int32_t code_sz = code_words * 4;
    int32_t nsyms = name_count;
    int32_t *name_stroff = (int32_t *)calloc(nsyms > 0 ? nsyms : 1, sizeof(int32_t));
    bool *use_strtab = (bool *)calloc(nsyms > 0 ? nsyms : 1, sizeof(bool));
    if (!name_stroff || !use_strtab) {
        free(name_stroff);
        free(use_strtab);
        return false;
    }

    char strtab[65536];
    int32_t str_off = 4;
    for (int32_t i = 0; i < name_count; i++) {
        if (!names[i]) {
            free(name_stroff);
            free(use_strtab);
            return false;
        }
        size_t name_length = strlen(names[i]);
        if (name_length > (size_t)INT32_MAX) {
            free(name_stroff);
            free(use_strtab);
            return false;
        }
        int32_t nl = (int32_t)name_length;
        if (nl <= 8) {
            name_stroff[i] = 0;
            use_strtab[i] = false;
        } else {
            name_stroff[i] = str_off;
            use_strtab[i] = true;
            if (name_length >= sizeof(strtab) - (size_t)str_off) {
                free(name_stroff);
                free(use_strtab);
                return false;
            }
            memcpy(strtab + str_off, names[i], nl);
            str_off += nl;
            strtab[str_off++] = '\0';
        }
    }
    uint32_t coff_strtab_size = (uint32_t)str_off;
    memcpy(strtab, &coff_strtab_size, 4);

    CoffSym *syms = (CoffSym *)calloc(nsyms > 0 ? nsyms : 1, sizeof(CoffSym));
    if (!syms) {
        free(name_stroff);
        free(use_strtab);
        return false;
    }
    for (int32_t i = 0; i < name_count; i++) {
        int32_t nl = (int32_t)strlen(names[i]);
        if (use_strtab[i]) {
            syms[i].name[0] = 0;
            syms[i].name[1] = 0;
            syms[i].name[2] = 0;
            syms[i].name[3] = 0;
            uint32_t off = (uint32_t)name_stroff[i];
            memcpy(&syms[i].name[4], &off, 4);
        } else {
            memset(syms[i].name, 0, 8);
            memcpy(syms[i].name, names[i], nl < 8 ? nl : 8);
        }
        syms[i].value = values ? values[i] : 0;
        syms[i].section_number = sections ? (int16_t)sections[i] : 0;
        syms[i].type = (syms[i].section_number == 1 || syms[i].section_number == 0) ? 0x20 : 0;
        syms[i].storage_class = (syms[i].section_number > 0 && i < local_count) ? 3 : 2;
        syms[i].num_aux = 0;
    }
    int32_t sym_size = nsyms * (int32_t)sizeof(CoffSym);

    CoffReloc *relocs = (CoffReloc *)calloc(reloc_count > 0 ? reloc_count : 1, sizeof(CoffReloc));
    if (!relocs) {
        free(syms);
        free(name_stroff);
        free(use_strtab);
        return false;
    }
    for (int32_t i = 0; i < reloc_count; i++) {
        if (reloc_offsets[i] < 0 || reloc_offsets[i] >= code_sz ||
            reloc_symbols[i] < 0 || reloc_symbols[i] >= nsyms) {
            free(syms);
            free(relocs);
            free(name_stroff);
            free(use_strtab);
            return false;
        }
        relocs[i].virtual_address = (uint32_t)reloc_offsets[i];
        relocs[i].symbol_table_index = (uint32_t)reloc_symbols[i];
        relocs[i].type = (machine == IMAGE_FILE_MACHINE_ARM64) ?
                         IMAGE_REL_ARM64_BRANCH26 : IMAGE_REL_AMD64_REL32;
    }
    int32_t reloc_size = reloc_count * (int32_t)sizeof(CoffReloc);

    int32_t hdr_sz = 20;
    int32_t sect_sz = 40;
    int64_t text_off64 = (int64_t)hdr_sz + sect_sz * 2;
    int64_t text_reloc_off64 = text_off64 + code_sz;
    int64_t data_off64 = text_reloc_off64 + reloc_size;
    int64_t sym_off64 = data_off64 + data_size;
    int64_t str_off_file64 = sym_off64 + sym_size;
    int64_t total_sz64 = str_off_file64 + str_off;
    if (total_sz64 > INT32_MAX) {
        free(syms);
        free(relocs);
        free(name_stroff);
        free(use_strtab);
        return false;
    }
    int32_t text_off = (int32_t)text_off64;
    int32_t text_reloc_off = (int32_t)text_reloc_off64;
    int32_t data_off = (int32_t)data_off64;
    int32_t sym_off = (int32_t)sym_off64;
    int32_t str_off_file = (int32_t)str_off_file64;
    int32_t total_sz = (int32_t)total_sz64;

    uint8_t *buf = (uint8_t *)calloc(1, total_sz);
    if (!buf) {
        free(syms);
        free(relocs);
        free(name_stroff);
        free(use_strtab);
        return false;
    }
    uint32_t *w = (uint32_t *)buf;
    w[0] = machine | (2 << 16);
    w[1] = 0;
    w[2] = (uint32_t)sym_off;
    w[3] = (uint32_t)nsyms;
    uint16_t *h16 = (uint16_t *)(buf + 16);
    h16[0] = 0;
    uint16_t *flags = (uint16_t *)(buf + 18);
    flags[0] = 0;

    uint8_t *sect = buf + hdr_sz;
    memset(sect, 0, 40);
    memcpy(sect, ".text", 5);
    uint32_t *s32 = (uint32_t *)(sect + 8);
    s32[0] = 0;
    s32[1] = 0;
    s32[2] = (uint32_t)code_sz;
    s32[3] = (uint32_t)text_off;
    s32[4] = (uint32_t)text_reloc_off;
    s32[5] = 0;
    uint16_t *s16 = (uint16_t *)(sect + 32);
    s16[0] = (uint16_t)reloc_count;
    s16[1] = 0;
    s32 = (uint32_t *)(sect + 36);
    s32[0] = 0x60500020;

    sect += 40;
    memset(sect, 0, 40);
    memcpy(sect, ".data", 5);
    s32 = (uint32_t *)(sect + 8);
    s32[0] = 0;
    s32[1] = 0;
    s32[2] = (uint32_t)data_size;
    s32[3] = (uint32_t)data_off;
    s32[4] = 0;
    s32[5] = 0;
    s16 = (uint16_t *)(sect + 32);
    s16[0] = 0;
    s16[1] = 0;
    s32 = (uint32_t *)(sect + 36);
    s32[0] = 0xC0500040;

    if (code_sz > 0) memcpy(buf + text_off, code, (size_t)code_sz);
    memcpy(buf + text_reloc_off, relocs, (size_t)reloc_size);
    if (data && data_size > 0) memcpy(buf + data_off, data, (size_t)data_size);
    memcpy(buf + sym_off, syms, (size_t)sym_size);
    memcpy(buf + str_off_file, strtab, 4);
    memcpy(buf + str_off_file + 4, strtab + 4, (size_t)(str_off - 4));

    free(syms);
    free(relocs);
    free(name_stroff);
    free(use_strtab);

    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) { free(buf); return false; }
    bool ok = coff_write_all_bytes(fd, buf, (size_t)total_sz);
    if (close(fd) != 0) ok = false;
    if (!ok || !coff_write_hex_sidecar(path, buf, total_sz)) {
        unlink(path);
        free(buf);
        return false;
    }
    free(buf);
    return true;
}

/* ================================================================
 * Minimal PE/COFF executable (.exe) writer for x86_64 and ARM64.
 *
 * Writes a PE32+ executable with one .text section mapped at
 * IMAGE_BASE + section_rva.  No imports, no CRT, no relocations.
 * ================================================================ */

#define IMAGE_DOS_SIGNATURE     0x5A4D   /* "MZ" */
#define IMAGE_PE_SIGNATURE      0x00004550 /* "PE\0\0" */
#define IMAGE_FILE_EXECUTABLE   0x0002
#define IMAGE_FILE_LARGE_ADDRESS_AWARE 0x0020
#define IMAGE_FILE_LINE_NUMS_STRIPPED  0x0004
#define IMAGE_FILE_LOCAL_SYMS_STRIPPED 0x0008
#define IMAGE_FILE_32BIT_MACHINE       0x0100

#define IMAGE_SUBSYSTEM_WINDOWS_CUI    3  /* console */

/* PE32+ optional header (112 bytes for x86_64/ARM64) */
typedef struct {
    uint16_t magic;              /* 0x020B = PE32+ */
    uint8_t  major_linker;
    uint8_t  minor_linker;
    uint32_t size_of_code;
    uint32_t size_of_initialized_data;
    uint32_t size_of_uninitialized_data;
    uint32_t address_of_entry_point;
    uint32_t base_of_code;
    uint64_t image_base;
    uint32_t section_alignment;
    uint32_t file_alignment;
    uint16_t major_os_version;
    uint16_t minor_os_version;
    uint16_t major_image_version;
    uint16_t minor_image_version;
    uint16_t major_subsystem_version;
    uint16_t minor_subsystem_version;
    uint32_t win32_version_value;
    uint32_t size_of_image;
    uint32_t size_of_headers;
    uint32_t checksum;
    uint16_t subsystem;
    uint16_t dll_characteristics;
    uint64_t size_of_stack_reserve;
    uint64_t size_of_stack_commit;
    uint64_t size_of_heap_reserve;
    uint64_t size_of_heap_commit;
    uint32_t loader_flags;
    uint32_t number_of_rva_and_sizes;
    /* Data directories (16 entries x 8 bytes = 128 bytes) follow.
       For minimal exe all zeros. */
} __attribute__((packed)) Pe32PlusOptHdr;

static int32_t coff_align_i32(int32_t value, int32_t align) {
    return ((value + align - 1) / align) * align;
}

static bool coff_write_exe(const char *path,
                           const uint32_t *code, int32_t code_words,
                           uint16_t machine,
                           const uint8_t *global_data,
                           int32_t global_data_size,
                           const int32_t *global_offsets,
                           int32_t global_count,
                           const int32_t *global_patch_pos,
                           const int32_t *global_patch_idx,
                           int32_t global_patch_count) {
    int32_t code_sz = code_words * 4;
    bool has_data = global_data && global_data_size > 0;
    if (global_patch_count > 0) {
        if (machine != IMAGE_FILE_MACHINE_AMD64 ||
            !has_data || !global_offsets || global_count <= 0 ||
            !global_patch_pos || !global_patch_idx) {
            return false;
        }
    }

    /* Layout */
    int32_t dos_hdr_sz     = 64;   /* DOS header + stub */
    int32_t pe_sig_sz      = 4;    /* "PE\0\0" */
    int32_t coff_hdr_sz    = 20;   /* COFF file header */
    int32_t opt_hdr_sz     = 112;  /* PE32+ optional header */
    int32_t data_dir_sz    = 128;  /* 16 data directories (all zero) */
    int32_t sect_hdr_sz    = 40;
    int32_t section_count  = has_data ? 2 : 1;

    int32_t hdrs_sz  = dos_hdr_sz + pe_sig_sz + coff_hdr_sz + opt_hdr_sz +
                       data_dir_sz + sect_hdr_sz * section_count;

    /* Align headers to file_alignment (512) */
    int32_t file_align = 512;
    int32_t hdrs_padded = coff_align_i32(hdrs_sz, file_align);

    int32_t sect_align = 0x1000;   /* 4KB section alignment */
    uint64_t image_base = 0x140000000ULL; /* default PE image base */
    int32_t code_rva  = sect_align;       /* .text starts at first section-aligned offset */
    int32_t code_raw_sz = coff_align_i32(code_sz, file_align);
    int32_t data_rva = code_rva + coff_align_i32(code_sz, sect_align);
    int32_t data_raw_off = hdrs_padded + code_raw_sz;
    int32_t data_raw_sz = has_data ? coff_align_i32(global_data_size, file_align) : 0;

    int32_t total_sz  = hdrs_padded + code_raw_sz + data_raw_sz;
    int32_t image_sz  = has_data
        ? data_rva + coff_align_i32(global_data_size, sect_align)
        : code_rva + coff_align_i32(code_sz, sect_align);

    uint8_t *buf = (uint8_t *)calloc(1, (size_t)total_sz);
    if (!buf) return false;

    /* ---- DOS Header (64 bytes) ---- */
    {
        uint16_t *d16 = (uint16_t *)buf;
        d16[0] = (uint16_t)IMAGE_DOS_SIGNATURE;      /* e_magic = "MZ" */
        /* bytes at offset 2-57: DOS stub (keep zero) */
        /* e_lfanew at offset 60 (uint32_t) points to PE signature */
        uint32_t *d32 = (uint32_t *)(buf + 60);
        d32[0] = (uint32_t)dos_hdr_sz;
    }

    /* ---- PE Signature (4 bytes) ---- */
    uint32_t *pe_sig = (uint32_t *)(buf + dos_hdr_sz);
    pe_sig[0] = IMAGE_PE_SIGNATURE;

    /* ---- COFF File Header (20 bytes) ---- */
    {
        uint8_t *coff = buf + dos_hdr_sz + pe_sig_sz;
        uint16_t *c16 = (uint16_t *)coff;
        c16[0] = machine;                    /* Machine */
        c16[1] = (uint16_t)section_count;     /* NumberOfSections */
        /* TimeDateStamp (4 bytes at off+4) = 0 */
        /* PointerToSymbolTable (4 bytes at off+8) = 0 */
        /* NumberOfSymbols (4 bytes at off+12) = 0 */
        c16[2] = (uint16_t)opt_hdr_sz;       /* SizeOfOptionalHeader */
        uint16_t chars = IMAGE_FILE_EXECUTABLE;
        if (machine != IMAGE_FILE_MACHINE_ARM64) {
            /* x86_64: large-address-aware, no 32-bit flag */
            chars |= IMAGE_FILE_LARGE_ADDRESS_AWARE;
        }
        chars |= IMAGE_FILE_LINE_NUMS_STRIPPED | IMAGE_FILE_LOCAL_SYMS_STRIPPED;
        c16[3] = chars;                      /* Characteristics */
    }

    /* ---- PE32+ Optional Header (112 bytes) ---- */
    {
        uint8_t *opt = buf + dos_hdr_sz + pe_sig_sz + coff_hdr_sz;
        uint16_t *o16 = (uint16_t *)opt;
        o16[0] = 0x020B;                     /* Magic = PE32+ */
        /* major/minor linker = 0 */
        uint32_t *o32 = (uint32_t *)(opt + 4);
        o32[0] = (uint32_t)code_sz;          /* SizeOfCode */
        o32[1] = has_data ? (uint32_t)data_raw_sz : 0; /* SizeOfInitializedData */
        /* SizeOfUninitializedData = 0 */
        o32[2] = 0;
        o32[3] = (uint32_t)code_rva;         /* AddressOfEntryPoint */
        o32[4] = (uint32_t)code_rva;         /* BaseOfCode */
        uint64_t *o64 = (uint64_t *)(opt + 24);
        o64[0] = image_base;                 /* ImageBase */
        o32 = (uint32_t *)(opt + 32);
        o32[0] = (uint32_t)sect_align;       /* SectionAlignment */
        o32[1] = (uint32_t)file_align;       /* FileAlignment */
        /* OS/Image/Subsystem versions all 0 */
        o32 = (uint32_t *)(opt + 56);
        o32[0] = (uint32_t)image_sz;         /* SizeOfImage */
        o32[1] = (uint32_t)hdrs_padded;      /* SizeOfHeaders */
        /* Checksum = 0 */
        uint16_t *opt16 = (uint16_t *)(opt + 68);
        opt16[0] = IMAGE_SUBSYSTEM_WINDOWS_CUI; /* Subsystem = console */
        /* DLL characteristics = 0 (NX compat not needed for minimal) */
        o64 = (uint64_t *)(opt + 72);
        o64[0] = 0x100000ULL;                /* SizeOfStackReserve = 1MB */
        o64[1] = 0x1000ULL;                  /* SizeOfStackCommit = 4KB */
        o64[2] = 0x100000ULL;                /* SizeOfHeapReserve = 1MB */
        o64[3] = 0x1000ULL;                  /* SizeOfHeapCommit = 4KB */
        /* LoaderFlags = 0 */
        o32 = (uint32_t *)(opt + 108);
        o32[0] = 16;                         /* NumberOfRvaAndSizes */
    }
    /* Data directories (128 bytes) follow – all zeros */

    /* ---- Section Headers ---- */
    {
        uint8_t *sect = buf + dos_hdr_sz + pe_sig_sz + coff_hdr_sz + opt_hdr_sz + data_dir_sz;
        memset(sect, 0, 40);
        memcpy(sect, ".text", 5);            /* Name */
        uint32_t *s32 = (uint32_t *)(sect + 8);
        s32[0] = (uint32_t)code_sz;          /* VirtualSize */
        s32[1] = (uint32_t)code_rva;         /* VirtualAddress */
        s32[2] = (uint32_t)code_raw_sz;      /* SizeOfRawData */
        s32[3] = (uint32_t)hdrs_padded;      /* PointerToRawData */
        /* PointerToRelocations = 0 */
        /* PointerToLinenumbers = 0 */
        /* NumberOfRelocations = 0, NumberOfLinenumbers = 0 */
        s32 = (uint32_t *)(sect + 36);
        s32[0] = 0x60000020;                 /* Characteristics: TEXT, CODE, EXECUTE, READ */

        if (has_data) {
            sect += 40;
            memset(sect, 0, 40);
            memcpy(sect, ".data", 5);
            s32 = (uint32_t *)(sect + 8);
            s32[0] = (uint32_t)global_data_size; /* VirtualSize */
            s32[1] = (uint32_t)data_rva;         /* VirtualAddress */
            s32[2] = (uint32_t)data_raw_sz;      /* SizeOfRawData */
            s32[3] = (uint32_t)data_raw_off;     /* PointerToRawData */
            s32 = (uint32_t *)(sect + 36);
            s32[0] = 0xC0000040;                 /* INIT_DATA, READ, WRITE */
        }
    }

    /* ---- Code ---- */
    memcpy(buf + hdrs_padded, code, (size_t)code_sz);
    if (global_patch_count > 0) {
        uint8_t *text = buf + hdrs_padded;
        for (int32_t pi = 0; pi < global_patch_count; pi++) {
            int32_t pos = global_patch_pos[pi];
            int32_t gi = global_patch_idx[pi];
            if (pos < 0 || pos + 4 > code_sz || gi < 0 || gi >= global_count) {
                free(buf);
                return false;
            }
            int64_t target = (int64_t)data_rva + global_offsets[gi];
            int64_t next_rip = (int64_t)code_rva + pos + 4;
            int64_t rel64 = target - next_rip;
            if (rel64 < INT32_MIN || rel64 > INT32_MAX) {
                free(buf);
                return false;
            }
            int32_t rel = (int32_t)rel64;
            text[pos + 0] = (uint8_t)rel;
            text[pos + 1] = (uint8_t)(rel >> 8);
            text[pos + 2] = (uint8_t)(rel >> 16);
            text[pos + 3] = (uint8_t)(rel >> 24);
        }
    }
    if (has_data) {
        memcpy(buf + data_raw_off, global_data, (size_t)global_data_size);
    }

    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0755);
    if (fd < 0) { free(buf); return false; }
    write(fd, buf, (size_t)total_sz);
    close(fd);
    free(buf);
    return true;
}
