/* elf32_direct.h -- ELF32 RISC-V relocatable object writer (ESP32-S31).
 *
 * Little-endian ELFCLASS32, EM_RISCV. e_flags carries RVC and the
 * single-float ABI bit as required by the ESP32-S31 ISA target.
 */

#ifndef ELFCLASS32
#define ELFCLASS32 1
#endif
#ifndef EF_RISCV_RVC
#define EF_RISCV_RVC 0x0001u
#endif
#ifndef EF_RISCV_FLOAT_ABI_SINGLE
#define EF_RISCV_FLOAT_ABI_SINGLE 0x0002u
#endif

#define ELF32_HDR_SIZE 52
#define ELF32_SHDR_SIZE 40
#define ELF32_SYM_SIZE 16
#define ELF32_RELA_SIZE 12

typedef struct {
    uint32_t sh_name;
    uint32_t sh_type;
    uint32_t sh_flags;
    uint32_t sh_addr;
    uint32_t sh_offset;
    uint32_t sh_size;
    uint32_t sh_link;
    uint32_t sh_info;
    uint32_t sh_addralign;
    uint32_t sh_entsize;
} Elf32_Shdr;

typedef struct {
    uint32_t st_name;
    uint32_t st_value;
    uint32_t st_size;
    uint8_t st_info;
    uint8_t st_other;
    uint16_t st_shndx;
} Elf32_Sym;

typedef struct {
    uint32_t r_offset;
    uint32_t r_info;
    int32_t r_addend;
} Elf32_Rela;

#define ELF32_ST_INFO(b, t) (((b) << 4) + ((t) & 0x0F))
#define ELF32_R_INFO(s, t) (((uint32_t)(s) << 8) + ((uint32_t)(t) & 0xFFu))

static bool elf32_riscv_write_text_data_object_bytes(
        const char *path,
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
        uint32_t e_flags,
        int code_source_fd) {
    if (!path || code_sz < 0 || data_size < 0 || name_count < 0 ||
        local_count < 0 || local_count > name_count || reloc_count < 0) {
        return false;
    }
    if (machine != EM_RISCV) return false;

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
    Elf32_Sym *syms = (Elf32_Sym *)calloc((size_t)nsyms, sizeof(Elf32_Sym));
    if (!syms) { free(name_stroff); free(strtab); return false; }
    for (int32_t i = 0; i < name_count; i++) {
        uint8_t section = sections ? sections[i] : 1;
        uint32_t value32 = 0;
        if (values) {
            if (values[i] > 0xFFFFFFFFull) {
                free(name_stroff); free(strtab); free(syms);
                return false;
            }
            value32 = (uint32_t)values[i];
        }
        syms[i + 1].st_name = (uint32_t)name_stroff[i];
        syms[i + 1].st_other = 0;
        syms[i + 1].st_size = 0;
        if (section == 0) {
            syms[i + 1].st_info = ELF32_ST_INFO(STB_GLOBAL, STT_NOTYPE);
            syms[i + 1].st_shndx = 0;
            syms[i + 1].st_value = 0;
        } else {
            uint8_t bind = (i < local_count) ? STB_LOCAL : STB_GLOBAL;
            uint8_t type = (section == 2) ? STT_OBJECT : STT_FUNC;
            syms[i + 1].st_info = ELF32_ST_INFO(bind, type);
            syms[i + 1].st_shndx = (section == 2) ? 2 : 1;
            syms[i + 1].st_value = value32;
        }
    }
    int32_t sym_size = nsyms * (int32_t)sizeof(Elf32_Sym);

    int32_t nreloc = reloc_count > 0 ? reloc_count : 0;
    Elf32_Rela *relas = (Elf32_Rela *)calloc((size_t)(nreloc > 0 ? nreloc : 1),
                                            sizeof(Elf32_Rela));
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
        uint32_t type = reloc_types ? reloc_types[i] : R_RISCV_CALL;
        int32_t addend = reloc_addends ? (int32_t)reloc_addends[i] : 0;
        if (reloc_offsets[i] < 0) {
            free(name_stroff); free(strtab); free(syms); free(relas);
            return false;
        }
        relas[i].r_offset = (uint32_t)reloc_offsets[i];
        relas[i].r_info = ELF32_R_INFO(sym, type);
        relas[i].r_addend = addend;
    }
    int32_t rela_size = nreloc * (int32_t)sizeof(Elf32_Rela);

    int32_t shnum = 7;
    int32_t text_idx = 1, data_idx = 2, rela_idx = 3;
    int32_t symtab_idx = 4, strtab_idx = 5, shstrtab_idx = 6;
    int32_t hdr_sz = ELF32_HDR_SIZE;
    int32_t shdr_sz = shnum * (int32_t)sizeof(Elf32_Shdr);
    int32_t code_off = hdr_sz + shdr_sz;
    int32_t data_off = elf64_align_i32(code_off + code_sz, 4);
    int32_t rela_off = elf64_align_i32(data_off + data_size, 4);
    int32_t sym_off = rela_off + rela_size;
    int32_t str_off_file = sym_off + sym_size;
    int32_t shstr_off_file = str_off_file + str_off;
    uint8_t header[ELF32_HDR_SIZE + 7 * sizeof(Elf32_Shdr)];
    memset(header, 0, sizeof(header));
    header[0] = 0x7F;
    header[1] = 'E';
    header[2] = 'L';
    header[3] = 'F';
    header[4] = ELFCLASS32;
    header[5] = ELFDATA2LSB;
    header[6] = EV_CURRENT;
    header[7] = ELFOSABI_SYSV;
    header[16] = (uint8_t)ET_REL;
    header[17] = 0;
    header[18] = (uint8_t)(machine & 0xFF);
    header[19] = (uint8_t)((machine >> 8) & 0xFF);
    header[20] = 1;
    header[24] = 0;
    header[28] = 0;
    header[32] = (uint8_t)(hdr_sz & 0xFF);
    header[33] = (uint8_t)((hdr_sz >> 8) & 0xFF);
    header[34] = (uint8_t)((hdr_sz >> 16) & 0xFF);
    header[35] = (uint8_t)((hdr_sz >> 24) & 0xFF);
    header[36] = (uint8_t)(e_flags & 0xFF);
    header[37] = (uint8_t)((e_flags >> 8) & 0xFF);
    header[38] = (uint8_t)((e_flags >> 16) & 0xFF);
    header[39] = (uint8_t)((e_flags >> 24) & 0xFF);
    header[40] = (uint8_t)ELF32_HDR_SIZE;
    header[41] = 0;
    header[42] = 0;
    header[43] = 0;
    header[44] = 0;
    header[45] = 0;
    header[46] = (uint8_t)sizeof(Elf32_Shdr);
    header[47] = 0;
    header[48] = (uint8_t)shnum;
    header[49] = 0;
    header[50] = (uint8_t)shstrtab_idx;
    header[51] = 0;

    Elf32_Shdr *shdrs = (Elf32_Shdr *)(header + hdr_sz);
    memset(&shdrs[0], 0, sizeof(Elf32_Shdr));
    shdrs[text_idx].sh_name = (uint32_t)shstr_text;
    shdrs[text_idx].sh_type = SHT_PROGBITS;
    shdrs[text_idx].sh_flags = SHF_ALLOC | SHF_EXECINSTR;
    shdrs[text_idx].sh_offset = (uint32_t)code_off;
    shdrs[text_idx].sh_size = (uint32_t)code_sz;
    shdrs[text_idx].sh_addralign = 4;

    shdrs[data_idx].sh_name = (uint32_t)shstr_data;
    shdrs[data_idx].sh_type = SHT_PROGBITS;
    shdrs[data_idx].sh_flags = SHF_ALLOC | SHF_WRITE;
    shdrs[data_idx].sh_offset = (uint32_t)data_off;
    shdrs[data_idx].sh_size = (uint32_t)data_size;
    shdrs[data_idx].sh_addralign = 4;

    shdrs[rela_idx].sh_name = (uint32_t)shstr_rela;
    shdrs[rela_idx].sh_type = SHT_RELA;
    shdrs[rela_idx].sh_flags = SHF_INFO_LINK;
    shdrs[rela_idx].sh_offset = (uint32_t)rela_off;
    shdrs[rela_idx].sh_size = (uint32_t)rela_size;
    shdrs[rela_idx].sh_link = (uint32_t)symtab_idx;
    shdrs[rela_idx].sh_info = (uint32_t)text_idx;
    shdrs[rela_idx].sh_addralign = 4;
    shdrs[rela_idx].sh_entsize = (uint32_t)sizeof(Elf32_Rela);

    shdrs[symtab_idx].sh_name = (uint32_t)shstr_symtab;
    shdrs[symtab_idx].sh_type = SHT_SYMTAB;
    shdrs[symtab_idx].sh_offset = (uint32_t)sym_off;
    shdrs[symtab_idx].sh_size = (uint32_t)sym_size;
    shdrs[symtab_idx].sh_link = (uint32_t)strtab_idx;
    shdrs[symtab_idx].sh_info = (uint32_t)(local_count + 1);
    shdrs[symtab_idx].sh_addralign = 4;
    shdrs[symtab_idx].sh_entsize = (uint32_t)sizeof(Elf32_Sym);

    shdrs[strtab_idx].sh_name = (uint32_t)shstr_strtab;
    shdrs[strtab_idx].sh_type = SHT_STRTAB;
    shdrs[strtab_idx].sh_offset = (uint32_t)str_off_file;
    shdrs[strtab_idx].sh_size = (uint32_t)str_off;
    shdrs[strtab_idx].sh_addralign = 1;

    shdrs[shstrtab_idx].sh_name = (uint32_t)shstr_shstrtab;
    shdrs[shstrtab_idx].sh_type = SHT_STRTAB;
    shdrs[shstrtab_idx].sh_offset = (uint32_t)shstr_off_file;
    shdrs[shstrtab_idx].sh_size = (uint32_t)shstr_off;
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
         elf64_write_code_bytes(fd, code, (size_t)code_sz, code_source_fd)) &&
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

static bool elf32_riscv_write_object(const char *path,
                                     const uint32_t *code, int32_t code_words,
                                     const char **names, const int32_t *offsets,
                                     int32_t name_count,
                                     int32_t local_count,
                                     const int32_t *reloc_offsets,
                                     const int32_t *reloc_symbols,
                                     int32_t reloc_count,
                                     uint16_t machine,
                                     uint32_t e_flags) {
    if (code_words < 0 || code_words > INT32_MAX / 4) return false;
    int32_t n = name_count > 0 ? name_count : 1;
    uint64_t *values = (uint64_t *)calloc((size_t)n, sizeof(uint64_t));
    uint8_t *sections = (uint8_t *)calloc((size_t)n, sizeof(uint8_t));
    if (!values || !sections) {
        free(values);
        free(sections);
        return false;
    }
    for (int32_t i = 0; i < name_count; i++) {
        if (offsets && offsets[i] >= 0) {
            sections[i] = 1;
            values[i] = (uint64_t)offsets[i] * 4ull;
        } else {
            sections[i] = 0;
            values[i] = 0;
        }
    }
    uint32_t *reloc_types = 0;
    int64_t *reloc_addends = 0;
    if (reloc_count > 0) {
        reloc_types = (uint32_t *)calloc((size_t)reloc_count, sizeof(uint32_t));
        reloc_addends = (int64_t *)calloc((size_t)reloc_count, sizeof(int64_t));
        if (!reloc_types || !reloc_addends) {
            free(values); free(sections); free(reloc_types); free(reloc_addends);
            return false;
        }
        for (int32_t i = 0; i < reloc_count; i++) reloc_types[i] = R_RISCV_CALL;
    }
    bool ok = elf32_riscv_write_text_data_object_bytes(
        path, code, code_words * 4, NULL, 0,
        names, values, sections, name_count, local_count,
        reloc_offsets, reloc_symbols, reloc_types, reloc_addends,
        reloc_count, machine, e_flags, -1);
    free(values);
    free(sections);
    free(reloc_types);
    free(reloc_addends);
    return ok;
}
