#!/usr/bin/env python3
"""Strictly validate a RISC-V ELF relocatable object independently of Cheng."""
import argparse
import os
import stat
import struct
import sys

EM_RISCV = 243
ET_REL = 1
EV_CURRENT = 1
ELFCLASS32 = 1
ELFCLASS64 = 2
ELFDATA2LSB = 1
SHT_PROGBITS = 1
SHT_SYMTAB = 2
SHT_STRTAB = 3
SHT_RELA = 4
SHT_NOBITS = 8
SHN_LORESERVE = 0xFF00
EF_RVC = 0x1
EF_SINGLE = 0x2
OP_LOAD = 0x03
OP_STORE = 0x23
OP_IMM32 = 0x1B
OP_32 = 0x3B
OP_FP = 0x53
MAX_OBJECT_BYTES = 512 * 1024 * 1024
R_RISCV_CALL = 18


def stable_identity(value):
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def read_stable_regular_file(path):
    before = os.lstat(path)
    if not stat.S_ISREG(before.st_mode):
        raise SystemExit("not a regular file: %s" % path)
    if before.st_size <= 0 or before.st_size > MAX_OBJECT_BYTES:
        raise SystemExit("object byte count out of range: %s" % path)
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
        if stable_identity(before) != stable_identity(opened):
            raise SystemExit("object identity changed before read: %s" % path)
        chunks = []
        total = 0
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_OBJECT_BYTES:
                raise SystemExit("object read exceeds byte limit: %s" % path)
            chunks.append(chunk)
        after_fd = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    after_path = os.lstat(path)
    if (
        stable_identity(before) != stable_identity(after_fd)
        or stable_identity(before) != stable_identity(after_path)
        or total != before.st_size
    ):
        raise SystemExit("object identity changed during read: %s" % path)
    return b"".join(chunks)


def checked_range(data, offset, size, label):
    if offset < 0 or size < 0 or offset > len(data) or size > len(data) - offset:
        raise SystemExit("%s range out of bounds" % label)
    return data[offset:offset + size]


def u16(data, off):
    checked_range(data, off, 2, "u16")
    return struct.unpack_from("<H", data, off)[0]


def u32(data, off):
    checked_range(data, off, 4, "u32")
    return struct.unpack_from("<I", data, off)[0]


def u64(data, off):
    checked_range(data, off, 8, "u64")
    return struct.unpack_from("<Q", data, off)[0]


def terminated_string(table, offset, label):
    if offset < 0 or offset >= len(table):
        raise SystemExit("%s string offset out of bounds" % label)
    if offset > 0 and table[offset - 1] != 0:
        raise SystemExit("%s string offset is not an entry boundary" % label)
    end = table.find(b"\x00", offset)
    if end < 0:
        raise SystemExit("%s string is not terminated" % label)
    return table[offset:end]


def parse_elf(path):
    data = read_stable_regular_file(path)
    return parse_elf_payload(data, path)


def parse_elf_payload(data, path):
    if len(data) < 52:
        raise SystemExit("file too small: %s" % path)
    if data[0:4] != b"\x7fELF":
        raise SystemExit("not ELF: %s" % path)
    ei_class = data[4]
    ei_data = data[5]
    if ei_class not in (ELFCLASS32, ELFCLASS64):
        raise SystemExit("unknown EI_CLASS=%d" % ei_class)
    if ei_data != ELFDATA2LSB:
        raise SystemExit("ELF is not little-endian")
    if data[6] != EV_CURRENT:
        raise SystemExit("invalid EI_VERSION=%d" % data[6])
    if data[7] != 0 or data[8] != 0 or any(data[9:16]):
        raise SystemExit("ELF identification ABI/padding is not canonical")
    expected_header_size = 52 if ei_class == ELFCLASS32 else 64
    expected_section_size = 40 if ei_class == ELFCLASS32 else 64
    if len(data) < expected_header_size:
        raise SystemExit("truncated ELF header")
    e_type = u16(data, 16)
    e_machine = u16(data, 18)
    e_version = u32(data, 20)
    if e_type != ET_REL:
        raise SystemExit("e_type=%d want ET_REL" % e_type)
    if e_version != EV_CURRENT:
        raise SystemExit("e_version=%d want 1" % e_version)
    if ei_class == ELFCLASS32:
        e_entry = u32(data, 24)
        e_phoff = u32(data, 28)
        e_flags = u32(data, 36)
        e_ehsize = u16(data, 40)
        e_phentsize = u16(data, 42)
        e_phnum = u16(data, 44)
        e_shoff = u32(data, 32)
        e_shentsize = u16(data, 46)
        e_shnum = u16(data, 48)
        e_shstrndx = u16(data, 50)
    else:
        e_entry = u64(data, 24)
        e_phoff = u64(data, 32)
        e_flags = u32(data, 48)
        e_ehsize = u16(data, 52)
        e_phentsize = u16(data, 54)
        e_phnum = u16(data, 56)
        e_shoff = u64(data, 40)
        e_shentsize = u16(data, 58)
        e_shnum = u16(data, 60)
        e_shstrndx = u16(data, 62)
    if e_ehsize != expected_header_size:
        raise SystemExit("invalid ELF header size")
    if e_entry != 0 or e_phoff != 0 or e_phentsize != 0 or e_phnum != 0:
        raise SystemExit("ET_REL unexpectedly carries program-header state")
    if e_shentsize != expected_section_size:
        raise SystemExit("invalid section header entry size")
    if e_shnum <= 0 or e_shstrndx >= e_shnum:
        raise SystemExit("invalid section header count/index")
    checked_range(
        data, e_shoff, e_shentsize * e_shnum, "section header table"
    )

    sections = []
    for index in range(e_shnum):
        base = e_shoff + index * e_shentsize
        if ei_class == ELFCLASS32:
            section = {
                "index": index,
                "name_offset": u32(data, base),
                "type": u32(data, base + 4),
                "flags": u32(data, base + 8),
                "offset": u32(data, base + 16),
                "size": u32(data, base + 20),
                "link": u32(data, base + 24),
                "info": u32(data, base + 28),
                "addralign": u32(data, base + 32),
                "entsize": u32(data, base + 36),
            }
        else:
            section = {
                "index": index,
                "name_offset": u32(data, base),
                "type": u32(data, base + 4),
                "flags": u64(data, base + 8),
                "offset": u64(data, base + 24),
                "size": u64(data, base + 32),
                "link": u32(data, base + 40),
                "info": u32(data, base + 44),
                "addralign": u64(data, base + 48),
                "entsize": u64(data, base + 56),
            }
        if section["type"] != SHT_NOBITS:
            section["bytes"] = checked_range(
                data,
                section["offset"],
                section["size"],
                "section[%d]" % index,
            )
        else:
            section["bytes"] = b""
        alignment = section["addralign"]
        if alignment != 0 and (
            alignment & (alignment - 1) != 0
            or section["offset"] % alignment != 0
        ):
            raise SystemExit("section[%d] alignment is invalid" % index)
        sections.append(section)

    null_section = sections[0]
    if any(
        null_section[field] != 0
        for field in (
            "name_offset",
            "type",
            "flags",
            "offset",
            "size",
            "link",
            "info",
            "addralign",
            "entsize",
        )
    ):
        raise SystemExit("null section is not canonical")

    shstr_section = sections[e_shstrndx]
    if shstr_section["type"] != SHT_STRTAB:
        raise SystemExit("section-name table is not SHT_STRTAB")
    shstr = shstr_section["bytes"]
    if not shstr or shstr[0] != 0 or shstr[-1] != 0:
        raise SystemExit("section-name table is not canonical")
    by_name = {}
    for section in sections:
        name = terminated_string(
            shstr, section["name_offset"], "section[%d]" % section["index"]
        )
        section["name"] = name
        by_name.setdefault(name, []).append(section)

    def unique_section(name, section_type):
        matches = by_name.get(name, [])
        if len(matches) != 1:
            raise SystemExit(
                "section %r count=%d want 1" % (name, len(matches))
            )
        section = matches[0]
        if section["type"] != section_type:
            raise SystemExit("section %r has invalid type" % (name,))
        return section

    text_section = unique_section(b".text", SHT_PROGBITS)
    strtab_section = unique_section(b".strtab", SHT_STRTAB)
    symtab_section = unique_section(b".symtab", SHT_SYMTAB)
    text = text_section["bytes"]
    strtab = strtab_section["bytes"]
    symtab = symtab_section["bytes"]
    if not text:
        raise SystemExit("empty .text")
    if not strtab or strtab[0] != 0 or strtab[-1] != 0:
        raise SystemExit(".strtab is not canonical")
    strtab_entries = strtab.split(b"\x00")[:-1]
    for index, entry in enumerate(strtab_entries):
        try:
            entry.decode("utf-8", errors="strict")
        except UnicodeDecodeError as error:
            raise SystemExit(
                ".strtab entry[%d] is not UTF-8" % index
            ) from error
    expected_sym_entsize = 24 if ei_class == ELFCLASS64 else 16
    if (
        symtab_section["entsize"] != expected_sym_entsize
        or len(symtab) % expected_sym_entsize != 0
        or symtab_section["link"] != strtab_section["index"]
    ):
        raise SystemExit(".symtab shape/link is invalid")
    symbol_count = len(symtab) // expected_sym_entsize
    if symtab_section["info"] > symbol_count:
        raise SystemExit(".symtab info exceeds symbol count")

    symbols = []
    for index in range(symbol_count):
        offset = index * expected_sym_entsize
        if ei_class == ELFCLASS64:
            (
                st_name,
                st_info,
                st_other,
                st_shndx,
                st_value,
                st_size,
            ) = struct.unpack_from("<IBBHQQ", symtab, offset)
        else:
            (
                st_name,
                st_value,
                st_size,
                st_info,
                st_other,
                st_shndx,
            ) = struct.unpack_from("<IIIBBH", symtab, offset)
        name = terminated_string(strtab, st_name, "symbol[%d]" % index)
        if st_shndx < SHN_LORESERVE and st_shndx >= e_shnum:
            raise SystemExit("symbol[%d] section index out of bounds" % index)
        symbols.append(
            {
                "name": name,
                "bind": st_info >> 4,
                "type": st_info & 0xF,
                "other": st_other,
                "shndx": st_shndx,
                "value": st_value,
                "size": st_size,
            }
        )
    if symbols and any(
        symbols[0][field] != expected
        for field, expected in (
            ("name", b""),
            ("bind", 0),
            ("type", 0),
            ("other", 0),
            ("shndx", 0),
            ("value", 0),
            ("size", 0),
        )
    ):
        raise SystemExit("null symbol is not canonical")
    for index, symbol in enumerate(symbols):
        if index < symtab_section["info"] and symbol["bind"] != 0:
            raise SystemExit("global symbol precedes sh_info boundary")
        if index >= symtab_section["info"] and symbol["bind"] == 0:
            raise SystemExit("local symbol follows sh_info boundary")
    rela_matches = by_name.get(b".rela.text", [])
    if len(rela_matches) > 1:
        raise SystemExit("section b'.rela.text' count=%d want <=1" % len(rela_matches))
    relocations = []
    if rela_matches:
        rela_section = rela_matches[0]
        expected_rela_entsize = 24 if ei_class == ELFCLASS64 else 12
        if (
            rela_section["type"] != SHT_RELA
            or rela_section["link"] != symtab_section["index"]
            or rela_section["info"] != text_section["index"]
            or rela_section["entsize"] != expected_rela_entsize
            or len(rela_section["bytes"]) % expected_rela_entsize != 0
        ):
            raise SystemExit(".rela.text shape/link/info is invalid")
        for index in range(len(rela_section["bytes"]) // expected_rela_entsize):
            offset = index * expected_rela_entsize
            if ei_class == ELFCLASS64:
                r_offset, r_info, r_addend = struct.unpack_from(
                    "<QQq", rela_section["bytes"], offset
                )
                symbol_index = r_info >> 32
                relocation_type = r_info & 0xFFFFFFFF
            else:
                r_offset, r_info, r_addend = struct.unpack_from(
                    "<IIi", rela_section["bytes"], offset
                )
                symbol_index = r_info >> 8
                relocation_type = r_info & 0xFF
            if symbol_index >= len(symbols):
                raise SystemExit("relocation[%d] symbol index out of bounds" % index)
            if r_offset >= len(text):
                raise SystemExit("relocation[%d] text offset out of bounds" % index)
            relocations.append(
                {
                    "offset": r_offset,
                    "type": relocation_type,
                    "addend": r_addend,
                    "symbol_index": symbol_index,
                    "symbol": symbols[symbol_index],
                }
            )
    return {
        "path": path,
        "data": data,
        "ei_class": ei_class,
        "ei_data": ei_data,
        "e_type": e_type,
        "e_machine": e_machine,
        "e_flags": e_flags,
        "text": text,
        "text_section_index": text_section["index"],
        "text_offset": text_section["offset"],
        "strtab": strtab,
        "strtab_entries": frozenset(strtab_entries),
        "symbols": symbols,
        "relocations": relocations,
        "size": len(data),
    }
def classify_word(word):
    opcode = word & 0x7F
    funct3 = (word >> 12) & 7
    fp_fmt = (word >> 25) & 3
    kinds = []
    if opcode in (OP_LOAD, OP_STORE) and funct3 == 3:
        kinds.append("ld/sd")
    if opcode == OP_IMM32:
        kinds.append("OP-IMM-32")
    if opcode == OP_32:
        kinds.append("OP-32")
    if opcode == OP_FP and fp_fmt == 1:
        kinds.append("fmt=D")
    return opcode, funct3, fp_fmt, kinds


def rounding_mode_valid(value):
    return value <= 4 or value == 7


def validate_rv32imacf_word(word):
    opcode = word & 0x7F
    funct3 = (word >> 12) & 7
    funct7 = (word >> 25) & 0x7F
    rs2 = (word >> 20) & 31
    if opcode in (0x37, 0x17, 0x6F):
        return []
    if opcode == 0x67:
        return [] if funct3 == 0 else ["jalr-encoding-invalid"]
    if opcode == 0x63:
        return [] if funct3 in (0, 1, 4, 5, 6, 7) else ["branch-encoding-invalid"]
    if opcode == OP_LOAD:
        if funct3 == 3:
            return ["ld/sd"]
        return [] if funct3 in (0, 1, 2, 4, 5) else ["load-encoding-invalid"]
    if opcode == OP_STORE:
        if funct3 == 3:
            return ["ld/sd"]
        return [] if funct3 in (0, 1, 2) else ["store-encoding-invalid"]
    if opcode == 0x13:
        if funct3 in (0, 2, 3, 4, 6, 7):
            return []
        if funct3 == 1:
            return [] if funct7 == 0 else ["slli-encoding-invalid"]
        if funct3 == 5:
            return [] if funct7 in (0, 0x20) else ["srli-srai-encoding-invalid"]
        return ["op-imm-encoding-invalid"]
    if opcode == 0x33:
        if funct7 in (0, 1):
            return []
        if funct7 == 0x20 and funct3 in (0, 5):
            return []
        return ["op-encoding-invalid"]
    if opcode == OP_IMM32:
        return ["OP-IMM-32"]
    if opcode == OP_32:
        return ["OP-32"]
    if opcode == 0x0F:
        rd = (word >> 7) & 31
        rs1 = (word >> 15) & 31
        fence_mode = (word >> 28) & 15
        return (
            []
            if funct3 == 0 and rd == 0 and rs1 == 0 and fence_mode == 0
            else ["misc-mem-extension-not-rv32imacf"]
        )
    if opcode == 0x73:
        return [] if word in (0x00000073, 0x00100073) else ["system-extension-not-rv32imacf"]
    if opcode == 0x2F:
        funct5 = (word >> 27) & 31
        valid_funct5 = {
            0x00,
            0x01,
            0x02,
            0x03,
            0x04,
            0x08,
            0x0C,
            0x10,
            0x14,
            0x18,
            0x1C,
        }
        if funct3 != 2 or funct5 not in valid_funct5:
            return ["atomic-encoding-invalid"]
        if funct5 == 0x02 and rs2 != 0:
            return ["lr-w-rs2-nonzero"]
        return []
    if opcode == 0x07:
        return [] if funct3 == 2 else ["fp-load-not-single"]
    if opcode == 0x27:
        return [] if funct3 == 2 else ["fp-store-not-single"]
    if opcode in (0x43, 0x47, 0x4B, 0x4F):
        fp_format = (word >> 25) & 3
        return (
            []
            if fp_format == 0 and rounding_mode_valid(funct3)
            else ["fp-fused-not-single"]
        )
    if opcode == OP_FP:
        if ((word >> 25) & 3) == 1:
            return ["fmt=D"]
        if funct7 in (0x00, 0x04, 0x08, 0x0C):
            return [] if rounding_mode_valid(funct3) else ["fp-rounding-mode-invalid"]
        if funct7 == 0x2C:
            return [] if rs2 == 0 and rounding_mode_valid(funct3) else ["fsqrt-s-invalid"]
        if funct7 == 0x10:
            return [] if funct3 in (0, 1, 2) else ["fsgnj-s-invalid"]
        if funct7 == 0x14:
            return [] if funct3 in (0, 1) else ["fminmax-s-invalid"]
        if funct7 == 0x50:
            return [] if funct3 in (0, 1, 2) else ["fcompare-s-invalid"]
        if funct7 == 0x60:
            return [] if rs2 in (0, 1) and rounding_mode_valid(funct3) else ["fcvt-w-s-invalid"]
        if funct7 == 0x70:
            return [] if rs2 == 0 and funct3 in (0, 1) else ["fmv-x-w-fclass-s-invalid"]
        if funct7 == 0x68:
            return [] if rs2 in (0, 1) and rounding_mode_valid(funct3) else ["fcvt-s-w-invalid"]
        if funct7 == 0x78:
            return [] if rs2 == 0 and funct3 == 0 else ["fmv-w-x-invalid"]
        return ["fp-extension-not-rv32imacf"]
    return ["opcode-not-rv32imacf"]


def validate_rv32imacf_compressed(half):
    quadrant = half & 3
    funct3 = (half >> 13) & 7
    rd = (half >> 7) & 31
    rs2 = (half >> 2) & 31
    bit12 = (half >> 12) & 1
    if quadrant == 0:
        if funct3 == 0:
            immediate = (
                ((half >> 7) & 0xF) << 6
                | ((half >> 11) & 0x3) << 4
                | ((half >> 5) & 0x1) << 3
                | ((half >> 6) & 0x1) << 2
            )
            return [] if immediate != 0 else ["c-addi4spn-zero"]
        if funct3 in (2, 3, 6, 7):
            return []
        if funct3 in (1, 5):
            return ["compressed-double-float-not-rv32imacf"]
        return ["compressed-quadrant0-reserved"]
    if quadrant == 1:
        if funct3 in (0, 1, 2, 5, 6, 7):
            return []
        if funct3 == 3:
            immediate = ((half >> 2) & 31) | (bit12 << 5)
            if rd == 2:
                return [] if immediate != 0 else ["c-addi16sp-zero"]
            return [] if rd not in (0, 2) and immediate != 0 else ["c-lui-reserved"]
        if funct3 == 4:
            subkind = (half >> 10) & 3
            if subkind in (0, 1):
                return [] if bit12 == 0 else ["c-shift-rv64-only"]
            if subkind == 2:
                return []
            return [] if bit12 == 0 else ["c-subw-addw-rv64-only"]
        return ["compressed-quadrant1-reserved"]
    if quadrant == 2:
        if funct3 == 0:
            return [] if bit12 == 0 and rd != 0 else ["c-slli-reserved"]
        if funct3 == 1:
            return ["compressed-double-float-not-rv32imacf"]
        if funct3 == 2:
            return [] if rd != 0 else ["c-lwsp-rd-zero"]
        if funct3 == 3:
            return []
        if funct3 == 4:
            if bit12 == 0 and rs2 == 0:
                return [] if rd != 0 else ["c-jr-rs1-zero"]
            if bit12 == 0:
                return [] if rd != 0 else ["c-mv-rd-zero"]
            if rs2 == 0:
                return []
            return [] if rd != 0 else ["c-add-rd-zero"]
        if funct3 == 5:
            return ["compressed-double-float-not-rv32imacf"]
        if funct3 in (6, 7):
            return []
        return ["compressed-quadrant2-reserved"]
    return ["compressed-quadrant-reserved"]


def scan_rv32_text(text):
    bad = []
    insns = []
    i = 0
    while i < len(text):
        if i + 2 > len(text):
            bad.append("truncated at %d" % i)
            break
        half = text[i] | (text[i + 1] << 8)
        if (half & 3) != 3:
            kinds = validate_rv32imacf_compressed(half)
            insns.append((i, 2, half, half & 0x3, 0, 0, kinds))
            for kind in kinds:
                bad.append("%s at %d half=0x%04x" % (kind, i, half))
            i += 2
            continue
        if i + 4 > len(text):
            bad.append("truncated 32-bit insn at %d" % i)
            break
        word = struct.unpack_from("<I", text, i)[0]
        opcode, funct3, fp_fmt, _classified = classify_word(word)
        kinds = validate_rv32imacf_word(word)
        insns.append((i, 4, word, opcode, funct3, fp_fmt, kinds))
        for kind in kinds:
            bad.append("%s at %d word=0x%08x" % (kind, i, word))
        i += 4
    return bad, insns


STB_GLOBAL = 1
STT_FUNC = 2


def validate_required_calls(info, required_names):
    errors = []
    calls = [
        relocation for relocation in info["relocations"]
        if relocation["type"] == R_RISCV_CALL
    ]
    for relocation in calls:
        offset = relocation["offset"]
        symbol = relocation["symbol"]
        if relocation["addend"] != 0:
            errors.append(
                "R_RISCV_CALL symbol=%r addend=%d want 0"
                % (symbol["name"], relocation["addend"])
            )
        if not symbol["name"]:
            errors.append("dangling R_RISCV_CALL has empty symbol")
            continue
        if offset % 4 != 0 or offset + 8 > len(info["text"]):
            errors.append(
                "R_RISCV_CALL offset=%d is not aligned AUIPC+JALR pair"
                % offset
            )
            continue
        auipc = struct.unpack_from("<I", info["text"], offset)[0]
        jalr = struct.unpack_from("<I", info["text"], offset + 4)[0]
        auipc_opcode = auipc & 0x7F
        auipc_rd = (auipc >> 7) & 31
        jalr_opcode = jalr & 0x7F
        jalr_rd = (jalr >> 7) & 31
        jalr_funct3 = (jalr >> 12) & 7
        jalr_rs1 = (jalr >> 15) & 31
        jalr_imm = (jalr >> 20) & 0xFFF
        if auipc_opcode != 0x17 or auipc_rd != 1:
            errors.append(
                "R_RISCV_CALL symbol=%r offset=%d does not point to AUIPC ra"
                % (symbol["name"], offset)
            )
        if (
            jalr_opcode != 0x67
            or jalr_rd != 1
            or jalr_funct3 != 0
            or jalr_rs1 != 1
            or jalr_imm != 0
        ):
            errors.append(
                "R_RISCV_CALL symbol=%r offset=%d lacks JALR ra,ra,0"
                % (symbol["name"], offset)
            )
    seen = set()
    for required_name in required_names:
        encoded = required_name.encode("utf-8")
        if encoded in seen:
            errors.append("duplicate required call argument %r" % required_name)
            continue
        seen.add(encoded)
        matches = [
            relocation for relocation in calls
            if relocation["symbol"]["name"] == encoded
        ]
        if len(matches) != 1:
            errors.append(
                "R_RISCV_CALL symbol=%r count=%d want 1"
                % (required_name, len(matches))
            )
            continue
        named_indices = [
            index for index, symbol in enumerate(info["symbols"])
            if symbol["name"] == encoded
        ]
        relocation = matches[0]
        symbol = relocation["symbol"]
        if (
            len(named_indices) != 1
            or named_indices[0] != relocation["symbol_index"]
            or symbol["bind"] != STB_GLOBAL
            or symbol["type"] != STT_FUNC
            or symbol["shndx"] != info["text_section_index"]
        ):
            errors.append(
                "R_RISCV_CALL symbol=%r lacks unique defined .text global STT_FUNC identity"
                % required_name
            )
    return errors


def count_rd_a0_writes(text):
    count = 0
    i = 0
    while i + 4 <= len(text):
        half = text[i] | (text[i + 1] << 8)
        if (half & 3) != 3:
            i += 2
            continue
        word = struct.unpack_from("<I", text, i)[0]
        opcode = word & 0x7F
        rd = (word >> 7) & 31
        if rd == 10 and opcode in (0x13, 0x33, 0x37, 0x1B, 0x3B):
            count += 1
        i += 4
    return count


def dump_insns(insns):
    print("text_insn_count=%d" % len(insns))
    for off, width, word, opcode, funct3, fp_fmt, kinds in insns:
        print(
            "insn off=%d width=%d word=0x%08x opcode=0x%x funct3=%d fmt=%d rv64_only=%s"
            % (off, width, word, opcode, funct3, fp_fmt, ",".join(kinds) if kinds else "none")
        )


def spec_word_i(opcode, funct3, rd, rs1, imm):
    return (opcode & 0x7F) | ((rd & 31) << 7) | ((funct3 & 7) << 12) | ((rs1 & 31) << 15) | ((imm & 0xFFF) << 20)


def spec_word_s(opcode, funct3, rs1, rs2, imm):
    return (
        (opcode & 0x7F)
        | ((imm & 0x1F) << 7)
        | ((funct3 & 7) << 12)
        | ((rs1 & 31) << 15)
        | ((rs2 & 31) << 20)
        | (((imm >> 5) & 0x7F) << 25)
    )


def spec_word_r(opcode, funct3, funct7, rd, rs1, rs2):
    return (
        (opcode & 0x7F)
        | ((rd & 31) << 7)
        | ((funct3 & 7) << 12)
        | ((rs1 & 31) << 15)
        | ((rs2 & 31) << 20)
        | ((funct7 & 0x7F) << 25)
    )


def align_up(value, alignment):
    return (value + alignment - 1) // alignment * alignment


def build_selftest_elf(ei_class, e_flags):
    if ei_class not in (ELFCLASS32, ELFCLASS64):
        raise AssertionError("self-test ELF class")
    word = spec_word_i(0x13, 0, 10, 0, 42)
    text = struct.pack("<I", word)
    strtab = b"\x00helper_add\x00\xe8\xbe\x85\xe5\x8a\xa9\x00"
    shstrtab = b"\x00.text\x00.symtab\x00.strtab\x00.shstrtab\x00"
    header_size = 52 if ei_class == ELFCLASS32 else 64
    section_size = 40 if ei_class == ELFCLASS32 else 64
    symbol_size = 16 if ei_class == ELFCLASS32 else 24
    alignment = 4 if ei_class == ELFCLASS32 else 8
    text_offset = header_size
    symtab_offset = align_up(text_offset + len(text), alignment)
    if ei_class == ELFCLASS32:
        null_symbol = bytes(symbol_size)
        function_symbol = struct.pack(
            "<IIIBBH", 1, 0, len(text), 0x12, 0, 1
        )
    else:
        null_symbol = bytes(symbol_size)
        function_symbol = struct.pack(
            "<IBBHQQ", 1, 0x12, 0, 1, 0, len(text)
        )
    symtab = null_symbol + function_symbol
    strtab_offset = symtab_offset + len(symtab)
    shstrtab_offset = strtab_offset + len(strtab)
    section_offset = align_up(
        shstrtab_offset + len(shstrtab), alignment
    )
    ident = b"\x7fELF" + bytes(
        [ei_class, ELFDATA2LSB, EV_CURRENT, 0, 0]
    ) + bytes(7)
    if ei_class == ELFCLASS32:
        header = struct.pack(
            "<16sHHIIIIIHHHHHH",
            ident,
            ET_REL,
            EM_RISCV,
            EV_CURRENT,
            0,
            0,
            section_offset,
            e_flags,
            header_size,
            0,
            0,
            section_size,
            5,
            4,
        )

        def section(name, kind, flags, offset, size, link, info, align, entsize):
            return struct.pack(
                "<IIIIIIIIII",
                name,
                kind,
                flags,
                0,
                offset,
                size,
                link,
                info,
                align,
                entsize,
            )

    else:
        header = struct.pack(
            "<16sHHIQQQIHHHHHH",
            ident,
            ET_REL,
            EM_RISCV,
            EV_CURRENT,
            0,
            0,
            section_offset,
            e_flags,
            header_size,
            0,
            0,
            section_size,
            5,
            4,
        )

        def section(name, kind, flags, offset, size, link, info, align, entsize):
            return struct.pack(
                "<IIQQQQIIQQ",
                name,
                kind,
                flags,
                0,
                offset,
                size,
                link,
                info,
                align,
                entsize,
            )

    sections = b"".join(
        [
            bytes(section_size),
            section(1, SHT_PROGBITS, 6, text_offset, len(text), 0, 0, 4, 0),
            section(
                7,
                SHT_SYMTAB,
                0,
                symtab_offset,
                len(symtab),
                3,
                1,
                alignment,
                symbol_size,
            ),
            section(15, SHT_STRTAB, 0, strtab_offset, len(strtab), 0, 0, 1, 0),
            section(
                23,
                SHT_STRTAB,
                0,
                shstrtab_offset,
                len(shstrtab),
                0,
                0,
                1,
                0,
            ),
        ]
    )
    payload = bytearray(header)
    payload.extend(text)
    payload.extend(bytes(symtab_offset - len(payload)))
    payload.extend(symtab)
    payload.extend(strtab)
    payload.extend(shstrtab)
    payload.extend(bytes(section_offset - len(payload)))
    payload.extend(sections)
    return bytes(payload), {
        "section_offset": section_offset,
        "section_size": section_size,
        "symtab_offset": symtab_offset,
        "symbol_size": symbol_size,
        "strtab_offset": strtab_offset,
        "strtab_size": len(strtab),
        "section_name_offset_field": 0,
        "section_link_field": 24 if ei_class == ELFCLASS32 else 40,
        "section_count_field": 48 if ei_class == ELFCLASS32 else 60,
    }


def build_call_selftest_elf(
    ei_class,
    relocation_specs=None,
    text_words=None,
    helper_info=0x12,
    helper_shndx=1,
    second_name_offset=12,
):
    if ei_class not in (ELFCLASS32, ELFCLASS64):
        raise AssertionError("call self-test ELF class")
    if relocation_specs is None:
        relocation_specs = [(0, 1, R_RISCV_CALL, 0)]
    if text_words is None:
        text_words = [0x00000097, spec_word_i(0x67, 0, 1, 1, 0)]
    text = b"".join(struct.pack("<I", word) for word in text_words)
    strtab = b"\x00helper_add\x00wrong\x00"
    shstrtab = b"\x00.text\x00.symtab\x00.strtab\x00.rela.text\x00.shstrtab\x00"
    header_size = 52 if ei_class == ELFCLASS32 else 64
    section_size = 40 if ei_class == ELFCLASS32 else 64
    symbol_size = 16 if ei_class == ELFCLASS32 else 24
    rela_size = 12 if ei_class == ELFCLASS32 else 24
    alignment = 4 if ei_class == ELFCLASS32 else 8
    text_offset = header_size
    symtab_offset = align_up(text_offset + len(text), alignment)
    if ei_class == ELFCLASS32:
        symbols = [
            bytes(symbol_size),
            struct.pack(
                "<IIIBBH", 1, 0, len(text), helper_info, 0, helper_shndx
            ),
            struct.pack("<IIIBBH", second_name_offset, 0, len(text), 0x12, 0, 1),
        ]
        relocations = [
            struct.pack("<IIi", offset, (symbol << 8) | kind, addend)
            for offset, symbol, kind, addend in relocation_specs
        ]
    else:
        symbols = [
            bytes(symbol_size),
            struct.pack(
                "<IBBHQQ", 1, helper_info, 0, helper_shndx, 0, len(text)
            ),
            struct.pack("<IBBHQQ", second_name_offset, 0x12, 0, 1, 0, len(text)),
        ]
        relocations = [
            struct.pack("<QQq", offset, (symbol << 32) | kind, addend)
            for offset, symbol, kind, addend in relocation_specs
        ]
    symtab = b"".join(symbols)
    rela = b"".join(relocations)
    strtab_offset = symtab_offset + len(symtab)
    rela_offset = align_up(strtab_offset + len(strtab), alignment)
    shstrtab_offset = rela_offset + len(rela)
    section_offset = align_up(shstrtab_offset + len(shstrtab), alignment)
    ident = b"\x7fELF" + bytes(
        [ei_class, ELFDATA2LSB, EV_CURRENT, 0, 0]
    ) + bytes(7)
    if ei_class == ELFCLASS32:
        header = struct.pack(
            "<16sHHIIIIIHHHHHH", ident, ET_REL, EM_RISCV, EV_CURRENT,
            0, 0, section_offset, EF_RVC | EF_SINGLE, header_size,
            0, 0, section_size, 6, 5,
        )

        def section(name, kind, flags, offset, size, link, info, align, entsize):
            return struct.pack(
                "<IIIIIIIIII", name, kind, flags, 0, offset, size,
                link, info, align, entsize,
            )
    else:
        header = struct.pack(
            "<16sHHIQQQIHHHHHH", ident, ET_REL, EM_RISCV, EV_CURRENT,
            0, 0, section_offset, EF_RVC | EF_SINGLE, header_size,
            0, 0, section_size, 6, 5,
        )

        def section(name, kind, flags, offset, size, link, info, align, entsize):
            return struct.pack(
                "<IIQQQQIIQQ", name, kind, flags, 0, offset, size,
                link, info, align, entsize,
            )
    sections = b"".join(
        [
            bytes(section_size),
            section(shstrtab.index(b".text"), SHT_PROGBITS, 6, text_offset, len(text), 0, 0, 4, 0),
            section(shstrtab.index(b".symtab"), SHT_SYMTAB, 0, symtab_offset, len(symtab), 3, 1, alignment, symbol_size),
            section(shstrtab.index(b".strtab"), SHT_STRTAB, 0, strtab_offset, len(strtab), 0, 0, 1, 0),
            section(shstrtab.index(b".rela.text"), SHT_RELA, 0, rela_offset, len(rela), 2, 1, alignment, rela_size),
            section(shstrtab.index(b".shstrtab"), SHT_STRTAB, 0, shstrtab_offset, len(shstrtab), 0, 0, 1, 0),
        ]
    )
    payload = bytearray(header)
    payload.extend(text)
    payload.extend(bytes(symtab_offset - len(payload)))
    payload.extend(symtab)
    payload.extend(strtab)
    payload.extend(bytes(rela_offset - len(payload)))
    payload.extend(rela)
    payload.extend(shstrtab)
    payload.extend(bytes(section_offset - len(payload)))
    payload.extend(sections)
    return bytes(payload)


def self_test_expect_rejected(name, payload):
    try:
        parse_elf_payload(payload, "selftest:" + name)
    except SystemExit:
        print("SELFTEST_REJECT_OK name=%s" % name)
        return True
    print("SELFTEST_REJECT_FAIL name=%s" % name)
    return False


def self_test_elf_parser():
    failed = 0
    for ei_class in (ELFCLASS32, ELFCLASS64):
        payload, layout = build_selftest_elf(ei_class, EF_RVC | EF_SINGLE)
        info = parse_elf_payload(payload, "selftest:valid")
        if (
            info["ei_class"] != ei_class
            or info["e_type"] != ET_REL
            or info["e_machine"] != EM_RISCV
            or info["e_flags"] != EF_RVC | EF_SINGLE
            or b"helper_add" not in info["strtab_entries"]
            or b"\xe8\xbe\x85\xe5\x8a\xa9" not in info["strtab_entries"]
            or len(info["symbols"]) != 2
        ):
            print("SELFTEST_ELF_FAIL class=%d" % ei_class)
            failed += 1
        else:
            print("SELFTEST_ELF_OK class=%d bytes=%d" % (ei_class, len(payload)))
        if exact_flags_error(info["e_flags"], EF_RVC | EF_SINGLE) is not None:
            print("SELFTEST_FLAGS_FAIL name=exact class=%d" % ei_class)
            failed += 1
        if exact_flags_error(
            info["e_flags"] | 0x4, EF_RVC | EF_SINGLE
        ) is None:
            print("SELFTEST_FLAGS_FAIL name=extra_bit class=%d" % ei_class)
            failed += 1

        mutants = []
        mutants.append(("truncated_%d" % ei_class, payload[:-1]))
        wrong_type = bytearray(payload)
        struct.pack_into("<H", wrong_type, 16, 2)
        mutants.append(("not_rel_%d" % ei_class, bytes(wrong_type)))
        zero_sections = bytearray(payload)
        struct.pack_into(
            "<H", zero_sections, layout["section_count_field"], 0
        )
        mutants.append(("zero_sections_%d" % ei_class, bytes(zero_sections)))
        bad_link = bytearray(payload)
        struct.pack_into(
            "<I",
            bad_link,
            layout["section_offset"]
            + 2 * layout["section_size"]
            + layout["section_link_field"],
            4,
        )
        mutants.append(("bad_symtab_link_%d" % ei_class, bytes(bad_link)))
        bad_name = bytearray(payload)
        struct.pack_into(
            "<I",
            bad_name,
            layout["symtab_offset"] + layout["symbol_size"],
            0xFFFFFFFF,
        )
        mutants.append(("bad_symbol_name_%d" % ei_class, bytes(bad_name)))
        duplicate_text = bytearray(payload)
        struct.pack_into(
            "<I",
            duplicate_text,
            layout["section_offset"] + 3 * layout["section_size"],
            1,
        )
        mutants.append(("duplicate_text_%d" % ei_class, bytes(duplicate_text)))
        bad_strtab = bytearray(payload)
        bad_strtab[
            layout["strtab_offset"] + layout["strtab_size"] - 1
        ] = 65
        mutants.append(("unterminated_strtab_%d" % ei_class, bytes(bad_strtab)))
        for name, mutant in mutants:
            if not self_test_expect_rejected(name, mutant):
                failed += 1
        call_payload = build_call_selftest_elf(ei_class)
        call_info = parse_elf_payload(call_payload, "selftest:call-valid")
        call_errors = validate_required_calls(call_info, ["helper_add"])
        if call_errors:
            print(
                "SELFTEST_CALL_FAIL name=valid class=%d errors=%r"
                % (ei_class, call_errors)
            )
            failed += 1
        else:
            print("SELFTEST_CALL_OK name=valid class=%d" % ei_class)
        call_cases = [
            (
                "single_jal",
                build_call_selftest_elf(
                    ei_class,
                    text_words=[0x000000EF, spec_word_i(0x67, 0, 1, 1, 0)],
                ),
                ["helper_add"],
            ),
            (
                "wrong_symbol",
                build_call_selftest_elf(
                    ei_class, relocation_specs=[(0, 2, R_RISCV_CALL, 0)]
                ),
                ["helper_add"],
            ),
            (
                "duplicate",
                build_call_selftest_elf(
                    ei_class,
                    relocation_specs=[
                        (0, 1, R_RISCV_CALL, 0),
                        (0, 1, R_RISCV_CALL, 0),
                    ],
                ),
                ["helper_add"],
            ),
            (
                "misaligned",
                build_call_selftest_elf(
                    ei_class, relocation_specs=[(2, 1, R_RISCV_CALL, 0)]
                ),
                ["helper_add"],
            ),
            (
                "bad_jalr",
                build_call_selftest_elf(
                    ei_class, text_words=[0x00000097, 0x00000013]
                ),
                ["helper_add"],
            ),
            (
                "missing",
                build_call_selftest_elf(ei_class, relocation_specs=[]),
                ["helper_add"],
            ),
            (
                "nonzero_addend",
                build_call_selftest_elf(
                    ei_class, relocation_specs=[(0, 1, R_RISCV_CALL, 4)]
                ),
                ["helper_add"],
            ),
            (
                "duplicate_symbol_name",
                build_call_selftest_elf(ei_class, second_name_offset=1),
                ["helper_add"],
            ),
            (
                "wrong_binding",
                build_call_selftest_elf(ei_class, helper_info=0x22),
                ["helper_add"],
            ),
            (
                "wrong_type",
                build_call_selftest_elf(ei_class, helper_info=0x11),
                ["helper_add"],
            ),
            (
                "undefined_symbol",
                build_call_selftest_elf(ei_class, helper_shndx=0),
                ["helper_add"],
            ),
        ]
        for name, call_mutant, required in call_cases:
            mutant_info = parse_elf_payload(
                call_mutant, "selftest:call-" + name
            )
            if not validate_required_calls(mutant_info, required):
                print(
                    "SELFTEST_CALL_REJECT_FAIL name=%s class=%d"
                    % (name, ei_class)
                )
                failed += 1
            else:
                print(
                    "SELFTEST_CALL_REJECT_OK name=%s class=%d"
                    % (name, ei_class)
                )
        dangling_payload = build_call_selftest_elf(
            ei_class, relocation_specs=[(0, 99, R_RISCV_CALL, 0)]
        )
        if not self_test_expect_rejected(
            "dangling_call_%d" % ei_class, dangling_payload
        ):
            failed += 1
    return failed


def self_test_scanner():
    # Spec-packed words, independent of the Cheng/C encoder.
    addi = spec_word_i(0x13, 0, 10, 0, 42)
    lw = spec_word_i(0x03, 2, 10, 2, 0)
    ld = spec_word_i(0x03, 3, 10, 2, 0)
    sd = spec_word_s(0x23, 3, 2, 10, 8)
    addiw = spec_word_i(0x1B, 0, 10, 10, 1)
    addw = spec_word_r(0x3B, 0, 0, 10, 10, 11)
    fadd_d = spec_word_r(0x53, 0, 1, 0, 1, 2)
    mul = spec_word_r(0x33, 0, 1, 10, 11, 12)
    fadd_s = spec_word_r(0x53, 0, 0, 0, 1, 2)
    ecall = 0x00000073
    csrrw = spec_word_i(0x73, 1, 10, 11, 1)
    unknown = 0x0000007B
    cases = [
        ("legal_addi", addi, []),
        ("legal_lw", lw, []),
        ("ld", ld, ["ld/sd"]),
        ("sd", sd, ["ld/sd"]),
        ("OP-IMM-32", addiw, ["OP-IMM-32"]),
        ("OP-32", addw, ["OP-32"]),
        ("fmt=D", fadd_d, ["fmt=D"]),
        ("legal_mul", mul, []),
        ("legal_fadd_s", fadd_s, []),
        ("legal_ecall", ecall, []),
        ("csr_not_imacf", csrrw, ["system-extension-not-rv32imacf"]),
        ("unknown_opcode", unknown, ["opcode-not-rv32imacf"]),
    ]
    failed = 0
    for name, word, expect in cases:
        text = struct.pack("<I", word)
        bad, _insns = scan_rv32_text(text)
        kinds = [b.split(" at ", 1)[0] for b in bad]
        if kinds != expect:
            print("SELFTEST_FAIL name=%s word=0x%08x got=%s expect=%s" % (name, word, kinds, expect))
            failed += 1
        else:
            print("SELFTEST_OK name=%s word=0x%08x kinds=%s" % (name, word, kinds if kinds else "none"))
    compressed_cases = [
        ("legal_c_nop", 0x0001, []),
        ("legal_c_lw", 0x4000, []),
        ("legal_c_flw", 0x6000, []),
        ("legal_c_jal", 0x2001, []),
        ("legal_c_ebreak", 0x9002, []),
        ("c_addi4spn_zero", 0x0000, ["c-addi4spn-zero"]),
        (
            "c_fld_not_imacf",
            0x2000,
            ["compressed-double-float-not-rv32imacf"],
        ),
        ("c_subw_rv64", 0x9C01, ["c-subw-addw-rv64-only"]),
        (
            "c_fldsp_not_imacf",
            0x2002,
            ["compressed-double-float-not-rv32imacf"],
        ),
    ]
    for name, half, expect in compressed_cases:
        bad, _insns = scan_rv32_text(struct.pack("<H", half))
        kinds = [item.split(" at ", 1)[0] for item in bad]
        if kinds != expect:
            print(
                "SELFTEST_FAIL name=%s half=0x%04x got=%s expect=%s"
                % (name, half, kinds, expect)
            )
            failed += 1
        else:
            print(
                "SELFTEST_OK name=%s half=0x%04x kinds=%s"
                % (name, half, kinds if kinds else "none")
            )
    failed += self_test_elf_parser()
    if failed:
        return 1
    print("riscv_elf_isa_check_selftest=pass")
    return 0


def find_text_range(path):
    info = parse_elf(path)
    return info["data"], info["text_offset"], len(info["text"])


def write_exclusive(path, payload):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    descriptor = os.open(path, flags, 0o600)
    try:
        view = memoryview(payload)
        while view:
            written = os.write(descriptor, view)
            if written <= 0:
                raise SystemExit("exclusive write made no progress")
            view = view[written:]
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def mutate_text(path, out_path, word):
    data, off, size = find_text_range(path)
    if size < 4:
        raise SystemExit(".text too small to mutate")
    buf = bytearray(data)
    buf[off:off + 4] = struct.pack("<I", word)
    write_exclusive(out_path, buf)


def exact_flags_error(actual, expected):
    if actual == expected:
        return None
    return "e_flags=0x%x want exactly 0x%x" % (actual, expected)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?")
    ap.add_argument("--expect-class", type=int)
    ap.add_argument("--expect-machine", type=int, default=EM_RISCV)
    ap.add_argument("--expect-flags")
    ap.add_argument("--forbid-rv64-only", action="store_true")
    ap.add_argument("--require-sym", action="append", default=[])
    ap.add_argument("--require-strtab-utf8", action="append", default=[])
    ap.add_argument("--require-call", action="append", default=[])
    ap.add_argument("--require-rd-a0-writes", type=int, default=0)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--mutate", choices=["ld", "sd", "op-imm-32", "op-32", "fmt-d"])
    ap.add_argument("--mutate-out")
    args = ap.parse_args()
    if args.self_test:
        return self_test_scanner()
    if not args.path:
        raise SystemExit("path required")
    if args.mutate:
        if not args.mutate_out:
            raise SystemExit("--mutate-out required")
        words = {
            "ld": spec_word_i(0x03, 3, 10, 2, 0),
            "sd": spec_word_s(0x23, 3, 2, 10, 8),
            "op-imm-32": spec_word_i(0x1B, 0, 10, 10, 1),
            "op-32": spec_word_r(0x3B, 0, 0, 10, 10, 11),
            "fmt-d": spec_word_r(0x53, 0, 1, 0, 1, 2),
        }
        mutate_text(args.path, args.mutate_out, words[args.mutate])
        print("mutated=%s out=%s word=0x%08x" % (args.mutate, args.mutate_out, words[args.mutate]))
        return 0
    if args.expect_class is None:
        raise SystemExit("--expect-class required")
    info = parse_elf(args.path)
    errors = []
    if info["ei_data"] != 1:
        errors.append("EI_DATA=%d want 1 (LSB)" % info["ei_data"])
    if info["ei_class"] != args.expect_class:
        errors.append("EI_CLASS=%d want %d" % (info["ei_class"], args.expect_class))
    if info["e_machine"] != args.expect_machine:
        errors.append("e_machine=%d want %d" % (info["e_machine"], args.expect_machine))
    if args.expect_flags is not None:
        want = int(args.expect_flags, 0)
        flags_error = exact_flags_error(info["e_flags"], want)
        if flags_error is not None:
            errors.append(flags_error)
    insns = []
    if args.forbid_rv64_only:
        bad, insns = scan_rv32_text(info["text"])
        errors.extend(bad)
        if len(info["text"]) == 0:
            errors.append("empty .text")
    for required_symbol in args.require_sym:
        want = required_symbol.encode("utf-8")
        found = False
        for sym in info["symbols"]:
            if (
                sym["name"] == want
                and sym["bind"] == STB_GLOBAL
                and sym["type"] == STT_FUNC
            ):
                found = True
                break
        if not found:
            errors.append(
                "missing global STT_FUNC %s in .symtab strtab=%r"
                % (required_symbol, info["strtab"])
            )
    for utf8_name in args.require_strtab_utf8:
        needle = utf8_name.encode("utf-8")
        if needle not in info["strtab_entries"]:
            errors.append(
                "missing utf8 in .strtab name=%r strtab=%r"
                % (utf8_name, info["strtab"])
            )
    errors.extend(validate_required_calls(info, args.require_call))
    a0_writes = count_rd_a0_writes(info["text"])
    if args.require_rd_a0_writes > 0 and a0_writes < args.require_rd_a0_writes:
        errors.append(
            "rd-a0 writes=%d want>=%d" % (a0_writes, args.require_rd_a0_writes)
        )
    print("path=%s" % info["path"])
    print("ei_class=%d" % info["ei_class"])
    print("ei_data=%d" % info["ei_data"])
    print("e_type=%d" % info["e_type"])
    print("e_machine=%d" % info["e_machine"])
    print("e_flags=0x%x" % info["e_flags"])
    print("text_bytes=%d" % len(info["text"]))
    print("strtab=%r" % info["strtab"])
    print("rd_a0_writes=%d" % a0_writes)
    for sym in info["symbols"]:
        print(
            "sym name=%r bind=%d type=%d shndx=%d value=%d size=%d"
            % (
                sym["name"],
                sym["bind"],
                sym["type"],
                sym["shndx"],
                sym["value"],
                sym["size"],
            )
        )
    for relocation in info["relocations"]:
        print(
            "reloc offset=%d type=%d symbol_index=%d symbol=%r addend=%d"
            % (
                relocation["offset"],
                relocation["type"],
                relocation["symbol_index"],
                relocation["symbol"]["name"],
                relocation["addend"],
            )
        )
    if insns:
        dump_insns(insns)
    if errors:
        for e in errors:
            print("FAIL:%s" % e)
        return 1
    print("riscv_elf_isa_check=pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
