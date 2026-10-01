#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <mach-o/loader.h>
#include <mach/machine.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

enum {
    EXPECTED_SIGNATURE_LINE = 28,
};

static const char *const kExpectedFunctionName =
    "BorrowCounterReplaceThenWrite";

typedef struct {
    uint8_t *data;
    size_t len;
} Bytes;

typedef struct {
    bool valid;
    bool load;
    bool is64;
    unsigned rt;
    unsigned rn;
    unsigned byte_offset;
} UnsignedMemoryOp;

typedef struct {
    size_t parameter_chain_index;
    unsigned parameter_input_spill;
    unsigned cell_spill;
    size_t replace_index;
    size_t projection_index;
    size_t dereference_index;
    size_t object_spill_index;
    unsigned object_spill;
    size_t constant_index;
    unsigned value_spill;
    size_t field_base_load_index;
    size_t field_value_load_index;
    size_t field_store_index;
} A64IdentityChain;

static void fail(const char *format, ...) {
    va_list args;
    fprintf(stderr, "a64_machine_analysis_error=");
    va_start(args, format);
    vfprintf(stderr, format, args);
    va_end(args);
    fputc('\n', stderr);
    exit(2);
}

static Bytes read_file(const char *path) {
    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        fail("open_failed path=%s errno=%d", path, errno);
    }
    if (fseek(file, 0, SEEK_END) != 0) {
        fail("seek_end_failed path=%s errno=%d", path, errno);
    }
    long raw_len = ftell(file);
    if (raw_len < 0) {
        fail("tell_failed path=%s errno=%d", path, errno);
    }
    if (fseek(file, 0, SEEK_SET) != 0) {
        fail("seek_start_failed path=%s errno=%d", path, errno);
    }
    size_t len = (size_t)raw_len;
    uint8_t *data = (uint8_t *)malloc(len + 1);
    if (data == NULL) {
        fail("allocation_failed path=%s bytes=%zu", path, len + 1);
    }
    if (len != 0 && fread(data, 1, len, file) != len) {
        fail("read_failed path=%s errno=%d", path, errno);
    }
    if (fclose(file) != 0) {
        fail("close_failed path=%s errno=%d", path, errno);
    }
    data[len] = 0;
    Bytes result = {data, len};
    return result;
}

static void write_exclusive(const char *path, const uint8_t *data, size_t len) {
    int fd = open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0400);
    if (fd < 0) {
        fail("output_open_failed path=%s errno=%d", path, errno);
    }
    size_t written = 0;
    while (written < len) {
        ssize_t count = write(fd, data + written, len - written);
        if (count <= 0) {
            fail("output_write_failed path=%s errno=%d", path, errno);
        }
        written += (size_t)count;
    }
    if (fsync(fd) != 0) {
        fail("output_fsync_failed path=%s errno=%d", path, errno);
    }
    if (close(fd) != 0) {
        fail("output_close_failed path=%s errno=%d", path, errno);
    }
}

static void verify_source_line(
    const Bytes *source,
    unsigned wanted_line,
    const char *expected
) {
    size_t start = 0;
    unsigned line = 1;
    while (line < wanted_line && start < source->len) {
        const uint8_t *newline =
            memchr(source->data + start, '\n', source->len - start);
        if (newline == NULL) {
            fail("source_line_missing line=%u", wanted_line);
        }
        start = (size_t)(newline - source->data) + 1;
        line += 1;
    }
    size_t end = start;
    while (end < source->len && source->data[end] != '\n') {
        if (source->data[end] == '\r') {
            fail("source_crlf_forbidden line=%u", wanted_line);
        }
        end += 1;
    }
    size_t expected_len = strlen(expected);
    if (end - start != expected_len ||
        memcmp(source->data + start, expected, expected_len) != 0) {
        fail("source_line_mismatch line=%u", wanted_line);
    }
}

static size_t split_tabs(char *line, char **fields, size_t field_capacity) {
    size_t count = 0;
    char *cursor = line;
    while (true) {
        if (count == field_capacity) {
            fail("line_map_field_overflow");
        }
        fields[count++] = cursor;
        char *tab = strchr(cursor, '\t');
        if (tab == NULL) {
            return count;
        }
        *tab = '\0';
        cursor = tab + 1;
    }
}

static bool parse_u64(const char *text, uint64_t *value) {
    if (text == NULL || text[0] == '\0' || text[0] == '-') {
        return false;
    }
    errno = 0;
    char *end = NULL;
    unsigned long long parsed = strtoull(text, &end, 0);
    if (errno != 0 || end == text || *end != '\0') {
        return false;
    }
    *value = (uint64_t)parsed;
    return true;
}

static void parse_exact_line_map_row(
    Bytes *map,
    const char *source_path,
    uint64_t *function_offset,
    uint64_t *function_size,
    uint64_t *entry_count
) {
    char *save = NULL;
    char *line = strtok_r((char *)map->data, "\n", &save);
    if (line == NULL || strcmp(line, "cheng_line_map") != 0) {
        fail("line_map_schema_mismatch");
    }
    line = strtok_r(NULL, "\n", &save);
    static const char kEntryCountPrefix[] = "entry_count=";
    uint64_t declared_entry_count = 0;
    if (line == NULL ||
        strncmp(
            line,
            kEntryCountPrefix,
            sizeof(kEntryCountPrefix) - 1
        ) != 0 ||
        !parse_u64(
            line + sizeof(kEntryCountPrefix) - 1,
            &declared_entry_count
        ) ||
        declared_entry_count == 0 ||
        declared_entry_count > UINT32_MAX) {
        fail("line_map_entry_count_header_mismatch");
    }

    uint64_t actual_entry_count = 0;
    unsigned exact_row_count = 0;
    while ((line = strtok_r(NULL, "\n", &save)) != NULL) {
        if (strncmp(line, "entry\t", 6) != 0) {
            fail("line_map_unknown_record");
        }
        actual_entry_count += 1;
        char *fields[32];
        size_t field_count =
            split_tabs(line, fields, sizeof(fields) / sizeof(fields[0]));
        if (field_count < 9) {
            fail("line_map_entry_truncated");
        }
        if (strcmp(fields[0], "entry") != 0 ||
            strcmp(fields[2], kExpectedFunctionName) != 0 ||
            strcmp(fields[3], source_path) != 0 ||
            strcmp(fields[4], "28") != 0 ||
            strcmp(fields[5], "28") != 0 ||
            strcmp(fields[6], "28") != 0) {
            continue;
        }

        bool function_name_match = false;
        bool module_path_match = false;
        bool offset_seen = false;
        bool size_seen = false;
        uint64_t row_offset = 0;
        uint64_t row_size = 0;
        for (size_t i = 7; i < field_count; ++i) {
            if (strncmp(fields[i], "offset=", 7) == 0) {
                if (offset_seen ||
                    !parse_u64(fields[i] + 7, &row_offset)) {
                    fail("line_map_offset_invalid");
                }
                offset_seen = true;
            } else if (strncmp(fields[i], "size=", 5) == 0) {
                if (size_seen || !parse_u64(fields[i] + 5, &row_size)) {
                    fail("line_map_size_invalid");
                }
                size_seen = true;
            } else if (strncmp(fields[i], "function_name=", 14) == 0) {
                function_name_match =
                    strcmp(fields[i] + 14, kExpectedFunctionName) == 0;
            } else if (strncmp(fields[i], "module_path=", 12) == 0) {
                module_path_match =
                    strcmp(fields[i] + 12, source_path) == 0;
            }
        }
        if (!offset_seen || !size_seen || row_size == 0 ||
            !function_name_match || !module_path_match) {
            fail("line_map_exact_row_metadata_invalid");
        }
        exact_row_count += 1;
        *function_offset = row_offset;
        *function_size = row_size;
    }
    if (actual_entry_count != declared_entry_count) {
        fail(
            "line_map_actual_entry_count_mismatch declared=%" PRIu64
            " actual=%" PRIu64,
            declared_entry_count,
            actual_entry_count
        );
    }
    if (exact_row_count != 1) {
        fail("line_map_exact_row_count=%u", exact_row_count);
    }
    *entry_count = declared_entry_count;
}

static uint32_t read_u32(const uint8_t *data) {
    return (uint32_t)data[0] |
        ((uint32_t)data[1] << 8) |
        ((uint32_t)data[2] << 16) |
        ((uint32_t)data[3] << 24);
}

static void find_text_section(
    const Bytes *binary,
    uint64_t *text_file_offset,
    uint64_t *text_size
) {
    if (binary->len < sizeof(struct mach_header_64)) {
        fail("macho_header_truncated");
    }
    struct mach_header_64 header;
    memcpy(&header, binary->data, sizeof(header));
    if (header.magic != MH_MAGIC_64) {
        fail("macho_magic_mismatch");
    }
    if (header.cputype != CPU_TYPE_ARM64) {
        fail("macho_cpu_is_not_arm64 cputype=%d", header.cputype);
    }
    if (header.filetype != MH_EXECUTE) {
        fail("macho_filetype_is_not_execute filetype=%u", header.filetype);
    }
    uint64_t commands_end =
        (uint64_t)sizeof(header) + (uint64_t)header.sizeofcmds;
    if (commands_end > binary->len) {
        fail("macho_load_commands_truncated");
    }
    size_t command_offset = sizeof(header);
    unsigned text_count = 0;
    for (uint32_t i = 0; i < header.ncmds; ++i) {
        if (command_offset + sizeof(struct load_command) > commands_end) {
            fail("macho_load_command_header_truncated index=%u", i);
        }
        struct load_command load;
        memcpy(&load, binary->data + command_offset, sizeof(load));
        if (load.cmdsize < sizeof(load) ||
            command_offset + load.cmdsize > commands_end) {
            fail("macho_load_command_invalid index=%u", i);
        }
        if (load.cmd == LC_SEGMENT_64) {
            if (load.cmdsize < sizeof(struct segment_command_64)) {
                fail("macho_segment_truncated index=%u", i);
            }
            struct segment_command_64 segment;
            memcpy(&segment, binary->data + command_offset, sizeof(segment));
            uint64_t sections_bytes =
                (uint64_t)segment.nsects * sizeof(struct section_64);
            if ((uint64_t)sizeof(segment) + sections_bytes > load.cmdsize) {
                fail("macho_sections_truncated index=%u", i);
            }
            size_t section_offset = command_offset + sizeof(segment);
            for (uint32_t j = 0; j < segment.nsects; ++j) {
                struct section_64 section;
                memcpy(
                    &section,
                    binary->data + section_offset +
                        (size_t)j * sizeof(section),
                    sizeof(section)
                );
                if (strncmp(section.sectname, "__text", 16) == 0 &&
                    strncmp(section.segname, "__TEXT", 16) == 0) {
                    text_count += 1;
                    *text_file_offset = section.offset;
                    *text_size = section.size;
                }
            }
        }
        command_offset += load.cmdsize;
    }
    if (command_offset != commands_end) {
        fail("macho_load_command_size_mismatch");
    }
    if (text_count != 1) {
        fail("macho_text_section_count=%u", text_count);
    }
    if (*text_file_offset + *text_size > binary->len) {
        fail("macho_text_section_out_of_bounds");
    }
}

static UnsignedMemoryOp decode_unsigned_memory(uint32_t word) {
    UnsignedMemoryOp result = {0};
    uint32_t opcode = word & 0xffc00000u;
    if (opcode == 0xf9400000u) {
        result.valid = true;
        result.load = true;
        result.is64 = true;
    } else if (opcode == 0xf9000000u) {
        result.valid = true;
        result.load = false;
        result.is64 = true;
    } else if (opcode == 0xb9400000u) {
        result.valid = true;
        result.load = true;
        result.is64 = false;
    } else if (opcode == 0xb9000000u) {
        result.valid = true;
        result.load = false;
        result.is64 = false;
    } else {
        return result;
    }
    result.rt = word & 31u;
    result.rn = (word >> 5) & 31u;
    unsigned scale = result.is64 ? 8u : 4u;
    result.byte_offset = ((word >> 10) & 0xfffu) * scale;
    return result;
}

static bool decode_movz_w(uint32_t word, unsigned *rt, unsigned *value) {
    if ((word & 0x7f800000u) != 0x52800000u) {
        return false;
    }
    unsigned shift_selector = (word >> 21) & 3u;
    if (shift_selector != 0) {
        return false;
    }
    *rt = word & 31u;
    *value = (word >> 5) & 0xffffu;
    return true;
}

static bool try_analyze_a64_identity_chain(
    const uint32_t *words,
    size_t word_count,
    size_t parameter_chain_index,
    A64IdentityChain *chain
) {
    if (words == NULL || chain == NULL ||
        parameter_chain_index + 2 >= word_count) {
        return false;
    }
    memset(chain, 0, sizeof(*chain));

    UnsignedMemoryOp parameter_store =
        decode_unsigned_memory(words[parameter_chain_index]);
    UnsignedMemoryOp parameter_load =
        decode_unsigned_memory(words[parameter_chain_index + 1]);
    UnsignedMemoryOp cell_store =
        decode_unsigned_memory(words[parameter_chain_index + 2]);
    if (!parameter_store.valid || parameter_store.load ||
        !parameter_store.is64 || parameter_store.rn != 31 ||
        parameter_store.rt != 0 ||
        !parameter_load.valid || !parameter_load.load ||
        !parameter_load.is64 || parameter_load.rn != 31 ||
        parameter_load.rt != 0 ||
        parameter_load.byte_offset != parameter_store.byte_offset ||
        !cell_store.valid || cell_store.load ||
        !cell_store.is64 || cell_store.rn != 31 ||
        cell_store.rt != 0 ||
        cell_store.byte_offset == parameter_store.byte_offset) {
        return false;
    }
    chain->parameter_chain_index = parameter_chain_index;
    chain->parameter_input_spill = parameter_store.byte_offset;
    chain->cell_spill = cell_store.byte_offset;

    unsigned replace_count = 0;
    for (size_t i = parameter_chain_index + 3;
         i + 2 < word_count;
         ++i) {
        UnsignedMemoryOp cell_load = decode_unsigned_memory(words[i]);
        UnsignedMemoryOp replacement_load =
            decode_unsigned_memory(words[i + 1]);
        UnsignedMemoryOp replacement_store =
            decode_unsigned_memory(words[i + 2]);
        if (cell_load.valid && cell_load.load && cell_load.is64 &&
            cell_load.rn == 31 &&
            cell_load.byte_offset == chain->cell_spill &&
            replacement_load.valid && replacement_load.load &&
            replacement_load.is64 && replacement_load.rn == 31 &&
            replacement_load.byte_offset != chain->cell_spill &&
            replacement_store.valid && !replacement_store.load &&
            replacement_store.is64 &&
            replacement_store.rn == cell_load.rt &&
            replacement_store.rt == replacement_load.rt &&
            replacement_store.byte_offset == 0) {
            replace_count += 1;
            chain->replace_index = i;
        }
    }
    if (replace_count != 1) {
        return false;
    }

    unsigned projection_count = 0;
    for (size_t i = chain->replace_index + 3;
         i < word_count;
         ++i) {
        UnsignedMemoryOp cell_load = decode_unsigned_memory(words[i]);
        if (!cell_load.valid || !cell_load.load || !cell_load.is64 ||
            cell_load.rn != 31 ||
            cell_load.byte_offset != chain->cell_spill) {
            continue;
        }
        for (size_t j = i + 1;
             j + 1 < word_count && j <= i + 8;
             ++j) {
            UnsignedMemoryOp dereference =
                decode_unsigned_memory(words[j]);
            UnsignedMemoryOp object_store =
                decode_unsigned_memory(words[j + 1]);
            if (!dereference.valid || !dereference.load ||
                !dereference.is64 ||
                dereference.rn != cell_load.rt ||
                dereference.byte_offset != 0 ||
                !object_store.valid || object_store.load ||
                !object_store.is64 || object_store.rn != 31 ||
                object_store.rt != dereference.rt) {
                continue;
            }
            unsigned exact_cell_dereference_count = 0;
            bool nonzero_cell_dereference = false;
            for (size_t k = i + 1; k <= j; ++k) {
                UnsignedMemoryOp candidate =
                    decode_unsigned_memory(words[k]);
                if (!candidate.valid || !candidate.load ||
                    !candidate.is64 ||
                    candidate.rn != cell_load.rt) {
                    continue;
                }
                if (candidate.byte_offset != 0) {
                    nonzero_cell_dereference = true;
                    break;
                }
                exact_cell_dereference_count += 1;
            }
            if (nonzero_cell_dereference ||
                exact_cell_dereference_count != 1) {
                continue;
            }
            projection_count += 1;
            chain->projection_index = i;
            chain->dereference_index = j;
            chain->object_spill_index = j + 1;
            chain->object_spill = object_store.byte_offset;
        }
    }
    if (projection_count != 1) {
        return false;
    }

    unsigned constant_count = 0;
    for (size_t i = chain->object_spill_index + 1;
         i + 1 < word_count;
         ++i) {
        unsigned value_register = 0;
        unsigned value = 0;
        UnsignedMemoryOp value_store =
            decode_unsigned_memory(words[i + 1]);
        if (decode_movz_w(words[i], &value_register, &value) &&
            value == 73 &&
            value_store.valid && !value_store.load &&
            !value_store.is64 && value_store.rn == 31 &&
            value_store.rt == value_register) {
            constant_count += 1;
            chain->constant_index = i;
            chain->value_spill = value_store.byte_offset;
        }
    }
    if (constant_count != 1) {
        return false;
    }

    unsigned field_store_count = 0;
    for (size_t i = chain->constant_index + 2;
         i + 2 < word_count;
         ++i) {
        UnsignedMemoryOp object_load =
            decode_unsigned_memory(words[i]);
        UnsignedMemoryOp value_load =
            decode_unsigned_memory(words[i + 1]);
        UnsignedMemoryOp field_store =
            decode_unsigned_memory(words[i + 2]);
        if (object_load.valid && object_load.load &&
            object_load.is64 && object_load.rn == 31 &&
            object_load.byte_offset == chain->object_spill &&
            value_load.valid && value_load.load &&
            !value_load.is64 && value_load.rn == 31 &&
            value_load.byte_offset == chain->value_spill &&
            field_store.valid && !field_store.load &&
            !field_store.is64 &&
            field_store.rn == object_load.rt &&
            field_store.rt == value_load.rt &&
            field_store.byte_offset == 0) {
            field_store_count += 1;
            chain->field_base_load_index = i;
            chain->field_value_load_index = i + 1;
            chain->field_store_index = i + 2;
        }
    }
    if (field_store_count != 1) {
        return false;
    }
    return chain->replace_index < chain->projection_index &&
           chain->projection_index < chain->dereference_index &&
           chain->dereference_index < chain->object_spill_index &&
           chain->object_spill_index < chain->constant_index &&
           chain->constant_index < chain->field_base_load_index &&
           chain->field_base_load_index <
               chain->field_value_load_index &&
           chain->field_value_load_index < chain->field_store_index;
}

static void analyze_a64_function(
    const uint8_t *function,
    size_t function_size,
    size_t *chain_start_word,
    size_t *chain_end_word
) {
    if (function_size == 0 || function_size % 4 != 0) {
        fail("a64_function_size_invalid bytes=%zu", function_size);
    }
    size_t word_count = function_size / 4;
    uint32_t *words = (uint32_t *)calloc(word_count, sizeof(uint32_t));
    if (words == NULL) {
        fail("a64_word_allocation_failed count=%zu", word_count);
    }
    for (size_t i = 0; i < word_count; ++i) {
        words[i] = read_u32(function + i * 4);
    }

    unsigned parameter_shape_count = 0;
    unsigned complete_chain_count = 0;
    A64IdentityChain chain = {0};
    for (size_t i = 0; i + 2 < word_count; ++i) {
        UnsignedMemoryOp first = decode_unsigned_memory(words[i]);
        UnsignedMemoryOp second = decode_unsigned_memory(words[i + 1]);
        UnsignedMemoryOp third = decode_unsigned_memory(words[i + 2]);
        if (first.valid && !first.load && first.is64 &&
            first.rn == 31 && first.rt == 0 &&
            second.valid && second.load && second.is64 &&
            second.rn == 31 && second.rt == 0 &&
            second.byte_offset == first.byte_offset &&
            third.valid && !third.load && third.is64 &&
            third.rn == 31 && third.rt == 0 &&
            third.byte_offset != first.byte_offset) {
            parameter_shape_count += 1;
            A64IdentityChain candidate = {0};
            if (try_analyze_a64_identity_chain(
                    words, word_count, i, &candidate)) {
                complete_chain_count += 1;
                chain = candidate;
            }
        }
    }
    if (complete_chain_count != 1) {
        fail(
            "a64_complete_identity_chain_count=%u parameter_shape_count=%u",
            complete_chain_count,
            parameter_shape_count
        );
    }
    *chain_start_word = chain.projection_index;
    *chain_end_word = chain.field_store_index + 1;

    printf("line_map_exact_row_count=1\n");
    printf("line_map_signature_line=%d\n", EXPECTED_SIGNATURE_LINE);
    printf("a64_function_word_count=%zu\n", word_count);
    printf("a64_parameter_cell_shape_count=%u\n", parameter_shape_count);
    printf("a64_complete_identity_chain_count=1\n");
    printf(
        "a64_parameter_input_spill_offset=%u\n",
        chain.parameter_input_spill
    );
    printf("a64_parameter_cell_spill_offset=%u\n", chain.cell_spill);
    printf("a64_replace_writeback_count=1\n");
    printf("a64_replace_word_index=%zu\n", chain.replace_index + 2);
    printf(
        "a64_post_replace_cell_load_word_index=%zu\n",
        chain.projection_index
    );
    printf(
        "a64_cell_dereference_word_index=%zu\n",
        chain.dereference_index
    );
    printf("a64_cell_dereference_count=1\n");
    printf("a64_object_spill_offset=%u\n", chain.object_spill);
    printf("a64_field_value=73\n");
    printf("a64_field_offset=0\n");
    printf(
        "a64_field_store_word_index=%zu\n",
        chain.field_store_index
    );
    printf("a64_replace_field_structure=1\n");
    free(words);
}

int main(int argc, char **argv) {
    if (argc != 6) {
        fprintf(
            stderr,
            "usage: %s SOURCE MAP EXECUTABLE FUNCTION_SLICE CHAIN_SLICE\n",
            argv[0]
        );
        return 2;
    }
    const char *source_path = argv[1];
    const char *map_path = argv[2];
    const char *binary_path = argv[3];
    const char *function_slice_path = argv[4];
    const char *chain_slice_path = argv[5];

    Bytes source = read_file(source_path);
    verify_source_line(
        &source,
        28,
        "fn BorrowCounterReplaceThenWrite(counter: var BorrowCounter) ="
    );
    verify_source_line(
        &source,
        29,
        "    counter = new(BorrowCounter)"
    );
    verify_source_line(&source, 30, "    counter.value = 73");

    Bytes map = read_file(map_path);
    uint64_t function_offset = 0;
    uint64_t function_size = 0;
    uint64_t line_map_entry_count = 0;
    parse_exact_line_map_row(
        &map,
        source_path,
        &function_offset,
        &function_size,
        &line_map_entry_count
    );

    Bytes binary = read_file(binary_path);
    uint64_t text_file_offset = 0;
    uint64_t text_size = 0;
    find_text_section(&binary, &text_file_offset, &text_size);
    if (function_offset > text_size ||
        function_size > text_size - function_offset) {
        fail("line_map_function_range_out_of_text");
    }
    uint64_t function_file_offset = text_file_offset + function_offset;
    if (function_file_offset > binary.len ||
        function_size > binary.len - function_file_offset) {
        fail("line_map_function_range_out_of_file");
    }
    const uint8_t *function = binary.data + function_file_offset;
    write_exclusive(
        function_slice_path,
        function,
        (size_t)function_size
    );

    size_t chain_start_word = 0;
    size_t chain_end_word = 0;
    analyze_a64_function(
        function,
        (size_t)function_size,
        &chain_start_word,
        &chain_end_word
    );
    if (chain_end_word <= chain_start_word ||
        chain_end_word * 4 > function_size) {
        fail("a64_chain_range_invalid");
    }
    write_exclusive(
        chain_slice_path,
        function + chain_start_word * 4,
        (chain_end_word - chain_start_word) * 4
    );

    printf("line_map_function_offset=0x%" PRIx64 "\n", function_offset);
    printf("line_map_function_size=%" PRIu64 "\n", function_size);
    printf("line_map_entry_count=%" PRIu64 "\n", line_map_entry_count);
    printf(
        "a64_replace_field_chain_word_count=%zu\n",
        chain_end_word - chain_start_word
    );
    printf("cold_var_ref_replace_field_store_machine_status=pass\n");

    free(binary.data);
    free(map.data);
    free(source.data);
    return 0;
}
