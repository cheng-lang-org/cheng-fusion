/* elf64_direct.h -- Self-contained ELF64 object file (.o) reader + writer.
 *
 * Writes/reads minimal ELF64 relocatable objects for aarch64, riscv64,
 * or x86_64 linux targets.  Symbols + relocations for external linkage.
 *
 * Reader: elf64_read_object() extracts .text + symbol table from a .o file.
 * Writer: elf64_write_object() / elf_write_exec() produce .o / executable.
 */

#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <errno.h>

static bool elf64_write_all_bytes(int fd, const void *data, size_t len) {
    const uint8_t *cursor = (const uint8_t *)data;
    while (len > 0) {
        ssize_t amount = write(fd, cursor, len);
        if (amount < 0 && errno == EINTR) continue;
        if (amount <= 0) return false;
        cursor += (size_t)amount;
        len -= (size_t)amount;
    }
    return true;
}

static bool elf64_write_code_bytes(int fd, const void *data, size_t len,
                                   int source_fd) {
    const uint8_t *cursor = (const uint8_t *)data;
    const size_t chunk_bytes = (size_t)4u * 1024u * 1024u;
    uint8_t *buffer = source_fd >= 0 ? malloc(chunk_bytes) : NULL;
    if (source_fd >= 0 && !buffer) return false;
    size_t source_offset = 0;
    while (len > 0) {
        size_t amount = len < chunk_bytes ? len : chunk_bytes;
        const uint8_t *source = cursor;
        if (source_fd >= 0) {
            size_t received = 0;
            while (received < amount) {
                ssize_t part = pread(source_fd, buffer + received,
                                     amount - received,
                                     (off_t)(source_offset + received));
                if (part < 0 && errno == EINTR) continue;
                if (part <= 0) {
                    free(buffer);
                    return false;
                }
                received += (size_t)part;
            }
            source = buffer;
        }
        if (!elf64_write_all_bytes(fd, source, amount)) {
            free(buffer);
            return false;
        }
        cursor += amount;
        source_offset += amount;
        len -= amount;
    }
    free(buffer);
    return true;
}

static bool elf64_write_zero_bytes(int fd, size_t len) {
    static const uint8_t zeros[64] = {0};
    while (len > 0) {
        size_t amount = len < sizeof(zeros) ? len : sizeof(zeros);
        if (!elf64_write_all_bytes(fd, zeros, amount)) return false;
        len -= amount;
    }
    return true;
}

static bool elf64_read_all_bytes(int fd, void *data, size_t len) {
    uint8_t *cursor = (uint8_t *)data;
    while (len > 0) {
        ssize_t amount = read(fd, cursor, len);
        if (amount < 0 && errno == EINTR) continue;
        if (amount <= 0) return false;
        cursor += (size_t)amount;
        len -= (size_t)amount;
    }
    return true;
}

/* ELF64 constants */
#define ELF64_MAGIC      0x464C457F  /* "\x7FELF" */
#define ELFCLASS64       2
#define ELFDATA2LSB      1
#define EV_CURRENT       1
#define ELFOSABI_SYSV    0
#define ET_REL           1
#define ET_EXEC          2
#define EM_AARCH64       183
#define EM_X86_64        62
#define EM_RISCV         243

#define SHT_PROGBITS     1
#define SHT_SYMTAB       2
#define SHT_STRTAB       3
#define SHT_RELA         4
#define SHT_NOBITS       8

#define SHF_WRITE        0x1
#define SHF_ALLOC        0x2
#define SHF_EXECINSTR    0x4
#define SHF_INFO_LINK    0x40

#define STB_LOCAL        0
#define STB_GLOBAL       1
#define STT_NOTYPE       0
#define STT_OBJECT       1
#define STT_FUNC         2
#define ELF64_ST_INFO(b,t) (((b) << 4) + ((t) & 0x0F))

/* ARM64 relocations */
#define R_AARCH64_CALL26     283
#define R_AARCH64_ADR_PREL_PG_HI21  275
#define R_AARCH64_ADD_ABS_LO12_NC   277
#define R_AARCH64_ADR_GOT_PAGE      311
#define R_AARCH64_LD64_GOT_LO12_NC  312
#define R_AARCH64_GLOB_DAT          1025

/* x86_64 relocations */
#define R_X86_64_PLT32       4
#define R_X86_64_PC32        2

/* RISC-V relocations */
#define R_RISCV_CALL         18
#define R_RISCV_CALL_PLT     19
#define R_RISCV_HI20         26
#define R_RISCV_LO12_I       27

typedef struct {
    uint32_t sh_name;
    uint32_t sh_type;
    uint64_t sh_flags;
    uint64_t sh_addr;
    uint64_t sh_offset;
    uint64_t sh_size;
    uint32_t sh_link;
    uint32_t sh_info;
    uint64_t sh_addralign;
    uint64_t sh_entsize;
} Elf64_Shdr;

typedef struct {
    uint32_t st_name;
    uint8_t  st_info;
    uint8_t  st_other;
    uint16_t st_shndx;
    uint64_t st_value;
    uint64_t st_size;
} Elf64_Sym;

typedef struct {
    uint64_t r_offset;
    uint64_t r_info;
    int64_t  r_addend;
} Elf64_Rela;

static int32_t elf64_align_i32(int32_t value, int32_t align) {
    if (align <= 1) return value;
    return (value + align - 1) & ~(align - 1);
}

static bool elf64_write_object_bytes(const char *path,
                               const void *code, int32_t code_sz,
                               const char **names, const int32_t *offsets,
                               int32_t name_count,
                               int32_t local_count,
                               const int32_t *reloc_offsets,
                               const int32_t *reloc_symbols,
                               int32_t reloc_count,
                               uint16_t machine,
                               int code_source_fd) {
    if (!path || code_sz < 0 || name_count < 0 || local_count < 0 ||
        local_count > name_count || reloc_count < 0) {
        return false;
    }

    /* Build string table */
    size_t strtab_size = 1; /* first byte is \0 */
    for (int32_t i = 0; i < name_count; i++) {
        if (!names || !names[i]) return false;
        size_t nl = strlen(names[i]);
        if (nl > (size_t)INT32_MAX || strtab_size > (size_t)INT32_MAX - nl - 1) {
            return false;
        }
        strtab_size += nl + 1;
    }
    char *strtab = (char *)calloc(strtab_size, 1);
    if (!strtab) return false;
    int32_t str_off = 1; /* first byte is \0 */
    int32_t name_stroff_count = name_count > 0 ? name_count : 1;
    int32_t *name_stroff = (int32_t *)calloc((size_t)name_stroff_count, sizeof(int32_t));
    if (!name_stroff) { free(strtab); return false; }
    for (int32_t i = 0; i < name_count; i++) {
        name_stroff[i] = str_off;
        int32_t nl = (int32_t)strlen(names[i]);
        memcpy(strtab + str_off, names[i], (size_t)nl);
        str_off += nl;
        strtab[str_off++] = '\0';
    }
    /* Build section name string table */
    char shstrtab[128];
    memset(shstrtab, 0, sizeof(shstrtab));
    int32_t shstr_off = 1; /* first byte is \0 */
    int32_t shstr_text = shstr_off;
    memcpy(shstrtab + shstr_off, ".text", 6); shstr_off += 6;
    int32_t shstr_rela = shstr_off;
    memcpy(shstrtab + shstr_off, ".rela.text", 11); shstr_off += 11;
    int32_t shstr_symtab = shstr_off;
    memcpy(shstrtab + shstr_off, ".symtab", 8); shstr_off += 8;
    int32_t shstr_strtab = shstr_off;
    memcpy(shstrtab + shstr_off, ".strtab", 8); shstr_off += 8;
    int32_t shstr_shstrtab = shstr_off;
    memcpy(shstrtab + shstr_off, ".shstrtab", 10); shstr_off += 10;

    /* Build symbol table */
    int32_t nsyms = 1 + name_count; /* NULL symbol + defined + undefined */
    Elf64_Sym *syms = (Elf64_Sym *)calloc(nsyms, sizeof(Elf64_Sym));
    /* sym[0] is the NULL symbol */
    int32_t si = 1;
    for (int32_t i = 0; i < name_count; i++) {
        syms[si].st_name  = name_stroff[i];
        syms[si].st_other = 0;
        syms[si].st_size  = 0;
        if (offsets[i] < 0) {
            /* Undefined external symbol */
            syms[si].st_info  = ELF64_ST_INFO(STB_GLOBAL, STT_NOTYPE);
            syms[si].st_shndx = 0;
            syms[si].st_value = 0;
        } else {
            syms[si].st_info  = (i < local_count) ?
                ELF64_ST_INFO(STB_LOCAL, STT_FUNC) :
                ELF64_ST_INFO(STB_GLOBAL, STT_FUNC);
            syms[si].st_shndx = 1; /* .text */
            syms[si].st_value = (machine == EM_X86_64)
                ? (uint64_t)offsets[i]
                : (uint64_t)(offsets[i] * 4);
        }
        si++;
    }
    int32_t sym_size = nsyms * (int32_t)sizeof(Elf64_Sym);

    /* Build relocation table */
    int32_t nreloc = reloc_count > 0 ? reloc_count : 0;
    Elf64_Rela *relas = (Elf64_Rela *)calloc(nreloc, sizeof(Elf64_Rela));
    if (nreloc > 0 && !relas) {
        free(name_stroff);
        free(strtab);
        free(syms);
        return false;
    }
    for (int32_t i = 0; i < nreloc; i++) {
        if (!reloc_offsets || !reloc_symbols ||
            reloc_symbols[i] < 0 || reloc_symbols[i] >= name_count) {
            free(name_stroff);
            free(strtab);
            free(syms);
            free(relas);
            return false;
        }
        relas[i].r_offset = (uint64_t)reloc_offsets[i];
        uint32_t sym = (uint32_t)(reloc_symbols[i] + 1); /* +1 for NULL sym[0] */
        uint32_t type = (machine == EM_AARCH64) ? R_AARCH64_CALL26 :
                        (machine == EM_RISCV)   ? R_RISCV_CALL :
                        R_X86_64_PLT32;
        relas[i].r_info = ((uint64_t)sym << 32) | (uint64_t)type;
        relas[i].r_addend = (machine == EM_X86_64) ? -4 : 0;
    }
    int32_t rela_size = nreloc * (int32_t)sizeof(Elf64_Rela);

    /* Section count: NULL + .text + .rela.text + .symtab + .strtab + .shstrtab */
    int32_t shnum = 6;
    int32_t text_idx = 1, rela_idx = 2, symtab_idx = 3, strtab_idx = 4, shstrtab_idx = 5;

    /* Layout */
    int32_t hdr_sz = 64;
    int32_t shdr_sz = shnum * (int32_t)sizeof(Elf64_Shdr);
    int32_t code_off = hdr_sz + shdr_sz;
    int32_t rela_off = code_off + code_sz;
    int32_t sym_off = rela_off + rela_size;
    int32_t str_off_file = sym_off + sym_size;
    int32_t shstr_off_file = str_off_file + str_off;
    uint8_t header[64 + 6 * sizeof(Elf64_Shdr)];
    memset(header, 0, sizeof(header));
    uint32_t *w = (uint32_t *)header;

    /* ELF Header */
    w[0] = ELF64_MAGIC;  /* e_ident: magic */
    header[4] = ELFCLASS64;  /* 64-bit */
    header[5] = ELFDATA2LSB; /* little-endian */
    header[6] = EV_CURRENT;  /* version */
    header[7] = ELFOSABI_SYSV; /* OS/ABI */
    /* padding bytes 8-15 are zero */
    w[4] = ET_REL | ((uint32_t)machine << 16); /* e_type + e_machine */
    w[5] = 1;                                   /* e_version */
    w[6] = 0;             /* e_entry low */
    w[7] = 0;             /* e_entry high */
    w[8] = 0;             /* e_phoff low */
    w[9] = 0;             /* e_phoff high */
    w[10] = (uint32_t)hdr_sz; /* e_shoff low */
    w[11] = 0;            /* e_shoff high */
    w[12] = 0;            /* e_flags */
    header[0x34] = (uint8_t)hdr_sz;
    header[0x35] = (uint8_t)(hdr_sz >> 8);
    header[0x36] = 0; header[0x37] = 0; /* e_phentsize */
    header[0x38] = 0; header[0x39] = 0; /* e_phnum */
    header[0x3A] = (uint8_t)sizeof(Elf64_Shdr);
    header[0x3B] = (uint8_t)(sizeof(Elf64_Shdr) >> 8);
    header[0x3C] = (uint8_t)shnum;
    header[0x3D] = (uint8_t)(shnum >> 8);
    header[0x3E] = (uint8_t)shstrtab_idx;
    header[0x3F] = (uint8_t)(shstrtab_idx >> 8);

    /* Section headers start after ELF header */
    Elf64_Shdr *shdrs = (Elf64_Shdr *)(header + hdr_sz);

    /* Section 0: NULL */
    memset(&shdrs[0], 0, sizeof(Elf64_Shdr));

    /* Section 1: .text */
    shdrs[text_idx].sh_name      = (uint32_t)shstr_text;
    shdrs[text_idx].sh_type      = SHT_PROGBITS;
    shdrs[text_idx].sh_flags     = SHF_ALLOC | SHF_EXECINSTR;
    shdrs[text_idx].sh_addr      = 0;
    shdrs[text_idx].sh_offset    = (uint64_t)code_off;
    shdrs[text_idx].sh_size      = (uint64_t)code_sz;
    shdrs[text_idx].sh_link      = 0;
    shdrs[text_idx].sh_info      = 0;
    shdrs[text_idx].sh_addralign = 4;
    shdrs[text_idx].sh_entsize   = 0;

    /* Section 2: .rela.text */
    shdrs[rela_idx].sh_name      = (uint32_t)shstr_rela;
    shdrs[rela_idx].sh_type      = SHT_RELA;
    shdrs[rela_idx].sh_flags     = SHF_INFO_LINK;
    shdrs[rela_idx].sh_addr      = 0;
    shdrs[rela_idx].sh_offset    = (uint64_t)rela_off;
    shdrs[rela_idx].sh_size      = (uint64_t)rela_size;
    shdrs[rela_idx].sh_link      = (uint32_t)symtab_idx;
    shdrs[rela_idx].sh_info      = (uint32_t)text_idx;
    shdrs[rela_idx].sh_addralign = 8;
    shdrs[rela_idx].sh_entsize   = (uint64_t)sizeof(Elf64_Rela);

    /* Section 3: .symtab */
    shdrs[symtab_idx].sh_name      = (uint32_t)shstr_symtab;
    shdrs[symtab_idx].sh_type      = SHT_SYMTAB;
    shdrs[symtab_idx].sh_flags     = 0;
    shdrs[symtab_idx].sh_addr      = 0;
    shdrs[symtab_idx].sh_offset    = (uint64_t)sym_off;
    shdrs[symtab_idx].sh_size      = (uint64_t)sym_size;
    shdrs[symtab_idx].sh_link      = (uint32_t)strtab_idx;
    shdrs[symtab_idx].sh_info      = (uint32_t)(local_count + 1);
    shdrs[symtab_idx].sh_addralign = 8;
    shdrs[symtab_idx].sh_entsize   = (uint64_t)sizeof(Elf64_Sym);

    /* Section 4: .strtab */
    shdrs[strtab_idx].sh_name      = (uint32_t)shstr_strtab;
    shdrs[strtab_idx].sh_type      = SHT_STRTAB;
    shdrs[strtab_idx].sh_flags     = 0;
    shdrs[strtab_idx].sh_addr      = 0;
    shdrs[strtab_idx].sh_offset    = (uint64_t)str_off_file;
    shdrs[strtab_idx].sh_size      = (uint64_t)str_off;
    shdrs[strtab_idx].sh_link      = 0;
    shdrs[strtab_idx].sh_info      = 0;
    shdrs[strtab_idx].sh_addralign = 1;
    shdrs[strtab_idx].sh_entsize   = 0;

    /* Section 5: .shstrtab */
    shdrs[shstrtab_idx].sh_name      = (uint32_t)shstr_shstrtab;
    shdrs[shstrtab_idx].sh_type      = SHT_STRTAB;
    shdrs[shstrtab_idx].sh_flags     = 0;
    shdrs[shstrtab_idx].sh_addr      = 0;
    shdrs[shstrtab_idx].sh_offset    = (uint64_t)shstr_off_file;
    shdrs[shstrtab_idx].sh_size      = (uint64_t)shstr_off;
    shdrs[shstrtab_idx].sh_link      = 0;
    shdrs[shstrtab_idx].sh_info      = 0;
    shdrs[shstrtab_idx].sh_addralign = 1;
    shdrs[shstrtab_idx].sh_entsize   = 0;

    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        free(strtab);
        free(name_stroff);
        free(syms);
        free(relas);
        return false;
    }
    bool write_ok =
        elf64_write_all_bytes(fd, header, sizeof(header)) &&
        (code_sz <= 0 ||
         elf64_write_code_bytes(fd, code, (size_t)code_sz,
                                code_source_fd)) &&
        (rela_size <= 0 ||
         elf64_write_all_bytes(fd, relas, (size_t)rela_size)) &&
        elf64_write_all_bytes(fd, syms, (size_t)sym_size) &&
        elf64_write_all_bytes(fd, strtab, (size_t)str_off) &&
        elf64_write_all_bytes(fd, shstrtab, (size_t)shstr_off);
    if (close(fd) != 0) write_ok = false;
    free(strtab);
    free(syms);
    free(relas);
    free(name_stroff);
    if (!write_ok) unlink(path);
    return write_ok;
}

static bool elf64_write_object(const char *path,
                               const uint32_t *code, int32_t code_words,
                               const char **names, const int32_t *offsets,
                               int32_t name_count,
                               int32_t local_count,
                               const int32_t *reloc_offsets,
                               const int32_t *reloc_symbols,
                               int32_t reloc_count,
                               uint16_t machine) {
    if (code_words < 0 || code_words > INT32_MAX / 4) return false;
    return elf64_write_object_bytes(
        path, code, code_words * 4,
        names, offsets, name_count, local_count,
        reloc_offsets, reloc_symbols, reloc_count, machine, -1);
}

static bool elf64_write_text_data_object_bytes(const char *path,
                                         const void *code, int32_t code_sz,
                                         const uint8_t *data, int32_t data_size,
                                         const char **names,
                                         const uint64_t *values,
                                         const uint8_t *sections,
                                         int32_t name_count,
                                         int32_t local_count,
                                         const int32_t *reloc_offsets,
                                         const int32_t *reloc_symbols,
                                         const uint32_t *reloc_types,
                                         const int64_t *reloc_addends,
                                         int32_t reloc_count,
                                         uint16_t machine,
                                         int code_source_fd) {
    if (!path || code_sz < 0 || data_size < 0 || name_count < 0 ||
        local_count < 0 || local_count > name_count || reloc_count < 0) {
        return false;
    }

    size_t strtab_size = 1;
    for (int32_t i = 0; i < name_count; i++) {
        if (!names || !names[i]) return false;
        size_t nl = strlen(names[i]);
        if (nl > (size_t)INT32_MAX || strtab_size > (size_t)INT32_MAX - nl - 1) {
            return false;
        }
        strtab_size += nl + 1;
    }
    char *strtab = (char *)calloc(strtab_size, 1);
    if (!strtab) return false;
    int32_t name_stroff_count = name_count > 0 ? name_count : 1;
    int32_t *name_stroff = (int32_t *)calloc((size_t)name_stroff_count, sizeof(int32_t));
    if (!name_stroff) { free(strtab); return false; }
    int32_t str_off = 1;
    for (int32_t i = 0; i < name_count; i++) {
        name_stroff[i] = str_off;
        int32_t nl = (int32_t)strlen(names[i]);
        memcpy(strtab + str_off, names[i], (size_t)nl);
        str_off += nl;
        strtab[str_off++] = '\0';
    }

    char shstrtab[160];
    memset(shstrtab, 0, sizeof(shstrtab));
    int32_t shstr_off = 1;
    int32_t shstr_text = shstr_off;
    memcpy(shstrtab + shstr_off, ".text", 6); shstr_off += 6;
    int32_t shstr_data = shstr_off;
    memcpy(shstrtab + shstr_off, ".data", 6); shstr_off += 6;
    int32_t shstr_rela = shstr_off;
    memcpy(shstrtab + shstr_off, ".rela.text", 11); shstr_off += 11;
    int32_t shstr_symtab = shstr_off;
    memcpy(shstrtab + shstr_off, ".symtab", 8); shstr_off += 8;
    int32_t shstr_strtab = shstr_off;
    memcpy(shstrtab + shstr_off, ".strtab", 8); shstr_off += 8;
    int32_t shstr_shstrtab = shstr_off;
    memcpy(shstrtab + shstr_off, ".shstrtab", 10); shstr_off += 10;

    int32_t nsyms = 1 + name_count;
    Elf64_Sym *syms = (Elf64_Sym *)calloc((size_t)nsyms, sizeof(Elf64_Sym));
    if (!syms) { free(name_stroff); free(strtab); return false; }
    for (int32_t i = 0; i < name_count; i++) {
        uint8_t section = sections ? sections[i] : 1;
        syms[i + 1].st_name = name_stroff[i];
        syms[i + 1].st_other = 0;
        syms[i + 1].st_size = 0;
        if (section == 0) {
            syms[i + 1].st_info = ELF64_ST_INFO(STB_GLOBAL, STT_NOTYPE);
            syms[i + 1].st_shndx = 0;
            syms[i + 1].st_value = 0;
        } else {
            uint8_t bind = (i < local_count) ? STB_LOCAL : STB_GLOBAL;
            uint8_t type = (section == 2) ? STT_OBJECT : STT_FUNC;
            syms[i + 1].st_info = ELF64_ST_INFO(bind, type);
            syms[i + 1].st_shndx = (section == 2) ? 2 : 1;
            syms[i + 1].st_value = values ? values[i] : 0;
        }
    }
    int32_t sym_size = nsyms * (int32_t)sizeof(Elf64_Sym);

    int32_t nreloc = reloc_count > 0 ? reloc_count : 0;
    Elf64_Rela *relas = (Elf64_Rela *)calloc((size_t)(nreloc > 0 ? nreloc : 1), sizeof(Elf64_Rela));
    if (nreloc > 0 && !relas) {
        free(name_stroff); free(strtab); free(syms);
        return false;
    }
    for (int32_t i = 0; i < nreloc; i++) {
        if (!reloc_offsets || !reloc_symbols ||
            reloc_symbols[i] < 0 || reloc_symbols[i] >= name_count) {
            free(name_stroff); free(strtab); free(syms); free(relas);
            return false;
        }
        uint32_t sym = (uint32_t)(reloc_symbols[i] + 1);
        uint32_t type = reloc_types ? reloc_types[i] :
            ((machine == EM_AARCH64) ? R_AARCH64_CALL26 :
             (machine == EM_RISCV) ? R_RISCV_CALL : R_X86_64_PLT32);
        int64_t addend = reloc_addends ? reloc_addends[i] :
            ((machine == EM_X86_64) ? -4 : 0);
        relas[i].r_offset = (uint64_t)reloc_offsets[i];
        relas[i].r_info = ((uint64_t)sym << 32) | (uint64_t)type;
        relas[i].r_addend = addend;
    }
    int32_t rela_size = nreloc * (int32_t)sizeof(Elf64_Rela);

    int32_t shnum = 7;
    int32_t text_idx = 1, data_idx = 2, rela_idx = 3;
    int32_t symtab_idx = 4, strtab_idx = 5, shstrtab_idx = 6;
    int32_t hdr_sz = 64;
    int32_t shdr_sz = shnum * (int32_t)sizeof(Elf64_Shdr);
    int32_t code_off = hdr_sz + shdr_sz;
    int32_t data_off = elf64_align_i32(code_off + code_sz, 8);
    int32_t rela_off = elf64_align_i32(data_off + data_size, 8);
    int32_t sym_off = rela_off + rela_size;
    int32_t str_off_file = sym_off + sym_size;
    int32_t shstr_off_file = str_off_file + str_off;
    uint8_t header[64 + 7 * sizeof(Elf64_Shdr)];
    memset(header, 0, sizeof(header));
    uint32_t *w = (uint32_t *)header;
    w[0] = ELF64_MAGIC;
    header[4] = ELFCLASS64;
    header[5] = ELFDATA2LSB;
    header[6] = EV_CURRENT;
    header[7] = ELFOSABI_SYSV;
    w[4] = ET_REL | ((uint32_t)machine << 16);
    w[5] = 1;
    w[10] = (uint32_t)hdr_sz;
    header[0x34] = (uint8_t)hdr_sz;
    header[0x3A] = (uint8_t)sizeof(Elf64_Shdr);
    header[0x3B] = (uint8_t)(sizeof(Elf64_Shdr) >> 8);
    header[0x3C] = (uint8_t)shnum;
    header[0x3E] = (uint8_t)shstrtab_idx;

    Elf64_Shdr *shdrs = (Elf64_Shdr *)(header + hdr_sz);
    memset(&shdrs[0], 0, sizeof(Elf64_Shdr));
    shdrs[text_idx].sh_name = (uint32_t)shstr_text;
    shdrs[text_idx].sh_type = SHT_PROGBITS;
    shdrs[text_idx].sh_flags = SHF_ALLOC | SHF_EXECINSTR;
    shdrs[text_idx].sh_offset = (uint64_t)code_off;
    shdrs[text_idx].sh_size = (uint64_t)code_sz;
    shdrs[text_idx].sh_addralign = 4;

    shdrs[data_idx].sh_name = (uint32_t)shstr_data;
    shdrs[data_idx].sh_type = SHT_PROGBITS;
    shdrs[data_idx].sh_flags = SHF_ALLOC | SHF_WRITE;
    shdrs[data_idx].sh_offset = (uint64_t)data_off;
    shdrs[data_idx].sh_size = (uint64_t)data_size;
    shdrs[data_idx].sh_addralign = 8;

    shdrs[rela_idx].sh_name = (uint32_t)shstr_rela;
    shdrs[rela_idx].sh_type = SHT_RELA;
    shdrs[rela_idx].sh_flags = SHF_INFO_LINK;
    shdrs[rela_idx].sh_offset = (uint64_t)rela_off;
    shdrs[rela_idx].sh_size = (uint64_t)rela_size;
    shdrs[rela_idx].sh_link = (uint32_t)symtab_idx;
    shdrs[rela_idx].sh_info = (uint32_t)text_idx;
    shdrs[rela_idx].sh_addralign = 8;
    shdrs[rela_idx].sh_entsize = (uint64_t)sizeof(Elf64_Rela);

    shdrs[symtab_idx].sh_name = (uint32_t)shstr_symtab;
    shdrs[symtab_idx].sh_type = SHT_SYMTAB;
    shdrs[symtab_idx].sh_offset = (uint64_t)sym_off;
    shdrs[symtab_idx].sh_size = (uint64_t)sym_size;
    shdrs[symtab_idx].sh_link = (uint32_t)strtab_idx;
    shdrs[symtab_idx].sh_info = (uint32_t)(local_count + 1);
    shdrs[symtab_idx].sh_addralign = 8;
    shdrs[symtab_idx].sh_entsize = (uint64_t)sizeof(Elf64_Sym);

    shdrs[strtab_idx].sh_name = (uint32_t)shstr_strtab;
    shdrs[strtab_idx].sh_type = SHT_STRTAB;
    shdrs[strtab_idx].sh_offset = (uint64_t)str_off_file;
    shdrs[strtab_idx].sh_size = (uint64_t)str_off;
    shdrs[strtab_idx].sh_addralign = 1;

    shdrs[shstrtab_idx].sh_name = (uint32_t)shstr_shstrtab;
    shdrs[shstrtab_idx].sh_type = SHT_STRTAB;
    shdrs[shstrtab_idx].sh_offset = (uint64_t)shstr_off_file;
    shdrs[shstrtab_idx].sh_size = (uint64_t)shstr_off;
    shdrs[shstrtab_idx].sh_addralign = 1;

    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        free(name_stroff); free(strtab); free(syms); free(relas);
        return false;
    }
    int32_t text_end = code_off + code_sz;
    int32_t data_end = data_off + data_size;
    bool write_ok =
        elf64_write_all_bytes(fd, header, sizeof(header)) &&
        (code_sz <= 0 ||
         elf64_write_code_bytes(fd, code, (size_t)code_sz,
                                code_source_fd)) &&
        elf64_write_zero_bytes(fd, (size_t)(data_off - text_end)) &&
        (data_size <= 0 ||
         elf64_write_all_bytes(fd, data, (size_t)data_size)) &&
        elf64_write_zero_bytes(fd, (size_t)(rela_off - data_end)) &&
        (rela_size <= 0 ||
         elf64_write_all_bytes(fd, relas, (size_t)rela_size)) &&
        elf64_write_all_bytes(fd, syms, (size_t)sym_size) &&
        elf64_write_all_bytes(fd, strtab, (size_t)str_off) &&
        elf64_write_all_bytes(fd, shstrtab, (size_t)shstr_off);
    if (close(fd) != 0) write_ok = false;
    free(strtab);
    free(syms);
    free(relas);
    free(name_stroff);
    if (!write_ok) unlink(path);
    return write_ok;
}

static bool elf64_write_text_data_object(const char *path,
                                         const uint32_t *code,
                                         int32_t code_words,
                                         const uint8_t *data, int32_t data_size,
                                         const char **names,
                                         const uint64_t *values,
                                         const uint8_t *sections,
                                         int32_t name_count,
                                         int32_t local_count,
                                         const int32_t *reloc_offsets,
                                         const int32_t *reloc_symbols,
                                         const uint32_t *reloc_types,
                                         const int64_t *reloc_addends,
                                         int32_t reloc_count,
                                         uint16_t machine) {
    if (code_words < 0 || code_words > INT32_MAX / 4) return false;
    return elf64_write_text_data_object_bytes(
        path, code, code_words * 4,
        data, data_size, names, values, sections,
        name_count, local_count,
        reloc_offsets, reloc_symbols, reloc_types, reloc_addends,
        reloc_count, machine, -1);
}

/* Minimal ELF64 static executable writer. Maps headers + code in one PT_LOAD.
   Code starts at 0x400000 + code_off. No dynamic linking. */
static bool elf_write_exec(const char *path, const uint32_t *code,
                            int32_t code_words, uint16_t machine) {
    int32_t code_sz = code_words * 4;
    int32_t hdr_sz = 64;
    int32_t phdr_sz = 56; /* one PT_LOAD */
    int32_t phdr_off = hdr_sz;
    int32_t code_off = hdr_sz + phdr_sz;
    int32_t entry_stub_sz = (machine == EM_X86_64) ? 9 : 0;
    uint64_t entry = 0x400000 + code_off;
    int32_t total_sz = code_off + entry_stub_sz + code_sz;

    uint8_t *buf = (uint8_t *)calloc(1, total_sz);
    if (!buf) return false;
    uint32_t *w = (uint32_t *)buf;

    /* ELF Header */
    w[0] = ELF64_MAGIC;
    buf[4] = ELFCLASS64; buf[5] = ELFDATA2LSB;
    buf[6] = EV_CURRENT; buf[7] = ELFOSABI_SYSV;
    w[4] = ET_EXEC | ((uint32_t)machine << 16);
    w[5] = 1;                        /* e_version */
    w[6] = (uint32_t)entry;          /* e_entry */
    w[7] = (uint32_t)(entry >> 32);
    w[8] = (uint32_t)phdr_off;       /* e_phoff */
    w[9] = 0;
    w[10] = 0;                       /* e_shoff */
    w[11] = 0;
    w[12] = 0;                       /* e_flags (4 bytes at 0x30) */
    /* e_ehsize (2) + e_phentsize (2) */
    buf[0x34] = 64; buf[0x35] = 0;
    buf[0x36] = (uint8_t)phdr_sz; buf[0x37] = (uint8_t)(phdr_sz >> 8);
    /* e_phnum (2) + e_shentsize (2) */
    buf[0x38] = 1; buf[0x39] = 0;
    buf[0x3A] = 0; buf[0x3B] = 0;
    /* e_shnum (2) + e_shstrndx (2) */
    buf[0x3C] = 0; buf[0x3D] = 0;
    buf[0x3E] = 0; buf[0x3F] = 0;

    /* Program Header: PT_LOAD covering headers + code.
       p_offset and p_vaddr must be congruent modulo p_align. */
    {
        uint32_t *ph = (uint32_t *)(buf + phdr_off);
        ph[0] = 1;                    /* p_type = PT_LOAD */
        ph[1] = 5;                    /* p_flags = PF_R | PF_X */
        ph[2] = 0;                    /* p_offset (low) */
        ph[3] = 0;                    /* p_offset (high) */
        ph[4] = (uint32_t)0x400000;   /* p_vaddr (low) */
        ph[5] = 0;                    /* p_vaddr (high) */
        ph[6] = (uint32_t)0x400000;   /* p_paddr (low) */
        ph[7] = 0;                    /* p_paddr (high) */
        ph[8] = (uint32_t)total_sz;   /* p_filesz (low) */
        ph[9] = 0;                    /* p_filesz (high) */
        ph[10] = (uint32_t)total_sz;  /* p_memsz (low) */
        ph[11] = 0;                   /* p_memsz (high) */
        ph[12] = 0x1000;              /* p_align (low) */
        ph[13] = 0;                   /* p_align (high) */
    }

    /* Linux enters a static ELF at _start with argc/argv on the initial stack,
       while Cheng x86_64 trampolines expect the normal SysV main registers. */
    if (machine == EM_X86_64) {
        uint8_t *stub = buf + code_off;
        stub[0] = 0x48; stub[1] = 0x8B; stub[2] = 0x3C; stub[3] = 0x24;       /* mov (%rsp), %rdi */
        stub[4] = 0x48; stub[5] = 0x8D; stub[6] = 0x74; stub[7] = 0x24;       /* lea 8(%rsp), %rsi */
        stub[8] = 0x08;
    }
    /* Copy code words */
    memcpy(buf + code_off + entry_stub_sz, code, code_sz);

    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0755);
    if (fd < 0) { free(buf); return false; }
    bool write_ok = elf64_write_all_bytes(fd, buf, (size_t)total_sz);
    if (close(fd) != 0) write_ok = false;
    free(buf);
    if (!write_ok) unlink(path);
    return write_ok;
}

/* Minimal ELF64 .o reader for provider archive linking.
   Extracts .text section, global symbol table, and relocations from a relocatable .o.
   Caller frees out_code, out_names, out_offsets,
   out_reloc_offsets, and out_reloc_names. */
static bool elf64_read_object(const char *path,
                               uint32_t **out_code, int32_t *out_code_words,
                               char ***out_names, int32_t **out_offsets,
                               int32_t *out_name_count,
                               int32_t **out_reloc_offsets,
                               char ***out_reloc_names,
                               int32_t *out_reloc_count) {
    int fd = open(path, O_RDONLY);
    if (fd < 0) return false;
    off_t sz = lseek(fd, 0, SEEK_END);
    if (sz < 64 || (uintmax_t)sz > SIZE_MAX ||
        lseek(fd, 0, SEEK_SET) != 0) {
        close(fd);
        return false;
    }
    uint8_t *data = (uint8_t *)malloc((size_t)sz);
    if (!data) { close(fd); return false; }
    bool read_ok = elf64_read_all_bytes(fd, data, (size_t)sz);
    if (close(fd) != 0) read_ok = false;
    if (!read_ok) { free(data); return false; }

    if (*(uint32_t *)data != ELF64_MAGIC) { free(data); return false; }
    uint16_t machine = *(uint16_t *)(data + 0x12);
    uint64_t shoff = *(uint64_t *)(data + 0x28);
    uint16_t shnum = *(uint16_t *)(data + 0x3C);
    uint16_t shentsize = *(uint16_t *)(data + 0x3A);
    if (shnum == 0 || shentsize < 64) { free(data); return false; }

    uint64_t text_off = 0, text_sz = 0;
    uint64_t sym_off = 0, sym_sz = 0, sym_entsize = 0;
    uint64_t str_off = 0, str_sz = 0;
    int32_t text_idx = -1;
    for (int32_t i = 0; i < shnum; i++) {
        uint64_t s = shoff + (uint64_t)i * shentsize;
        if (s + 64 > (uint64_t)sz) break;
        uint32_t sh_type = *(uint32_t *)(data + s + 4);
        uint64_t sh_offset = *(uint64_t *)(data + s + 24);
        uint64_t sh_size = *(uint64_t *)(data + s + 32);
        if (sh_type == 1) { text_off = sh_offset; text_sz = sh_size; text_idx = i; }        /* SHT_PROGBITS */
        else if (sh_type == 2) { sym_off = sh_offset; sym_sz = sh_size; sym_entsize = *(uint64_t *)(data + s + 56); } /* SHT_SYMTAB */
        else if (sh_type == 3) { str_off = sh_offset; str_sz = sh_size; }     /* SHT_STRTAB */
    }
    if (text_sz == 0 || sym_sz == 0 || str_sz == 0) { free(data); return false; }

    int32_t cw = (int32_t)(text_sz / 4);
    uint32_t *code = (uint32_t *)malloc((size_t)cw * sizeof(uint32_t));
    memcpy(code, data + text_off, (size_t)text_sz);

    int32_t max_syms = (int32_t)(sym_sz / (sym_entsize > 0 ? sym_entsize : 24));
    char **names = (char **)calloc((size_t)max_syms, sizeof(char *));
    int32_t *offsets = (int32_t *)calloc((size_t)max_syms, sizeof(int32_t));
    int32_t nc = 0;
    for (int32_t i = 0; i < max_syms && nc < max_syms; i++) {
        uint64_t sp = sym_off + (uint64_t)i * sym_entsize;
        if (sp + 24 > (uint64_t)sz) break;
        uint32_t st_name = *(uint32_t *)(data + sp);
        uint8_t st_info = *(uint8_t *)(data + sp + 4);
        uint64_t st_value = *(uint64_t *)(data + sp + 8);
        uint16_t st_shndx = *(uint16_t *)(data + sp + 14);
        if (st_name > 0 && st_name < str_sz && (st_info >> 4) == 1) { /* STB_GLOBAL */
            const char *sn = (const char *)(data + str_off + st_name);
            if (sn[0]) {
                names[nc] = strdup(sn);
                offsets[nc] = (st_shndx == (uint16_t)text_idx)
                    ? (machine == EM_X86_64 ? (int32_t)st_value : (int32_t)(st_value / 4))
                    : -1;
                nc++;
            }
        }
    }

    /* Read relocations (.rela.text) – entries targeting undefined (external) symbols */
    int32_t reloc_n = 0;
    int32_t *reloc_offsets = NULL;
    char **reloc_names = NULL;
    if (text_idx >= 0 && sym_entsize > 0) {
        uint64_t rela_off = 0, rela_sz = 0, rela_entsize = 24;
        for (int32_t i = 0; i < shnum; i++) {
            uint64_t s = shoff + (uint64_t)i * shentsize;
            if (s + 64 > (uint64_t)sz) break;
            uint32_t sh_type = *(uint32_t *)(data + s + 4);
            uint32_t sh_info = *(uint32_t *)(data + s + 44);
            uint64_t sh_entsize = *(uint64_t *)(data + s + 56);
            if (sh_type == 4 && (int32_t)sh_info == text_idx) { /* SHT_RELA for .text */
                rela_off = *(uint64_t *)(data + s + 24);
                rela_sz = *(uint64_t *)(data + s + 32);
                if (sh_entsize > 0) rela_entsize = sh_entsize;
                break;
            }
        }
        if (rela_sz > 0 && rela_entsize >= 24) {
            int32_t max_rela = (int32_t)(rela_sz / rela_entsize);
            if (max_rela > 0 && max_rela < 100000) {
                reloc_offsets = (int32_t *)calloc((size_t)max_rela, sizeof(int32_t));
                reloc_names = (char **)calloc((size_t)max_rela, sizeof(char *));
                for (int32_t i = 0; i < max_rela; i++) {
                    uint64_t rp = rela_off + (uint64_t)i * rela_entsize;
                    if (rp + 24 > (uint64_t)sz) break;
                    uint64_t r_offset = *(uint64_t *)(data + rp);
                    uint64_t r_info = *(uint64_t *)(data + rp + 8);
                    uint32_t sym_idx = (uint32_t)(r_info >> 32);
                    if (sym_idx == 0 || (uint64_t)sym_idx >= (uint64_t)max_syms) continue;
                    uint64_t sp = sym_off + (uint64_t)sym_idx * sym_entsize;
                    if (sp + 16 > (uint64_t)sz) continue;
                    uint16_t st_shndx = *(uint16_t *)(data + sp + 14);
                    if (st_shndx != 0) continue; /* defined locally – already resolved */
                    uint32_t st_name = *(uint32_t *)(data + sp);
                    if (st_name == 0 || st_name >= str_sz) continue;
                    const char *sn = (const char *)(data + str_off + st_name);
                    if (!sn[0]) continue;
                    reloc_offsets[reloc_n] = (int32_t)r_offset;
                    reloc_names[reloc_n] = strdup(sn);
                    reloc_n++;
                }
            }
        }
    }

    free(data);
    *out_code = code; *out_code_words = cw;
    *out_names = names; *out_offsets = offsets; *out_name_count = nc;
    *out_reloc_offsets = reloc_offsets;
    *out_reloc_names = reloc_names;
    *out_reloc_count = reloc_n;
    return true;
}
