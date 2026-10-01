#define main cold_bootstrap_embedded_program_main
#include "../bootstrap/cheng_cold.c"
#undef main

static bool gate_copy_file(const char *source, const char *target) {
    int source_fd = open(source, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (source_fd < 0) return false;
    struct stat source_stat;
    if (fstat(source_fd, &source_stat) != 0 ||
        !S_ISREG(source_stat.st_mode) ||
        source_stat.st_size <= 0 ||
        source_stat.st_size > INT32_MAX) {
        close(source_fd);
        return false;
    }
    int target_fd = open(target,
                         O_WRONLY | O_CREAT | O_EXCL |
                             O_CLOEXEC | O_NOFOLLOW,
                         0700);
    if (target_fd < 0) {
        close(source_fd);
        return false;
    }
    uint8_t buffer[65536];
    off_t copied = 0;
    bool ok = true;
    while (copied < source_stat.st_size) {
        ssize_t read_count = read(source_fd, buffer, sizeof(buffer));
        if (read_count <= 0) {
            ok = false;
            break;
        }
        ssize_t written = 0;
        while (written < read_count) {
            ssize_t write_count = write(
                target_fd,
                buffer + written,
                (size_t)(read_count - written));
            if (write_count <= 0) {
                ok = false;
                break;
            }
            written += write_count;
        }
        if (!ok) break;
        copied += read_count;
    }
    if (ok && (copied != source_stat.st_size || fsync(target_fd) != 0)) {
        ok = false;
    }
    if (close(target_fd) != 0) ok = false;
    if (close(source_fd) != 0) ok = false;
    return ok;
}

static bool gate_locate_signature(uint8_t *data,
                                  int32_t length,
                                  int32_t *signature_offset,
                                  int32_t *signature_size) {
    if (!data || length < 32 ||
        cold_u32le(data) != (uint32_t)MH_MAGIC_64) {
        return false;
    }
    uint32_t ncmds = cold_u32le(data + 16);
    uint32_t sizeofcmds = cold_u32le(data + 20);
    if (sizeofcmds > (uint32_t)(length - 32)) return false;
    int32_t position = 32;
    int32_t found = 0;
    for (uint32_t command_index = 0;
         command_index < ncmds;
         command_index++) {
        if (position > length - 8) return false;
        uint32_t command = cold_u32le(data + position);
        uint32_t command_size = cold_u32le(data + position + 4);
        if (command_size < 8 ||
            command_size > (uint32_t)(length - position)) {
            return false;
        }
        if (command == LC_CODE_SIGNATURE && command_size == 16) {
            found++;
            *signature_offset =
                (int32_t)cold_u32le(data + position + 8);
            *signature_size =
                (int32_t)cold_u32le(data + position + 12);
        }
        position += (int32_t)command_size;
    }
    return found == 1 &&
           position == 32 + (int32_t)sizeofcmds &&
           *signature_offset > 0 &&
           *signature_size >= 20 &&
           *signature_offset <= length - *signature_size;
}

static void gate_put_u32be(uint8_t *target, uint32_t value) {
    target[0] = (uint8_t)(value >> 24);
    target[1] = (uint8_t)(value >> 16);
    target[2] = (uint8_t)(value >> 8);
    target[3] = (uint8_t)value;
}

static bool gate_mutate(const char *mode,
                        uint8_t *data,
                        int32_t length,
                        int64_t contract_slot,
                        int64_t path_slot) {
    int32_t signature_offset = 0;
    int32_t signature_size = 0;
    if (!gate_locate_signature(
            data, length, &signature_offset, &signature_size)) {
        return false;
    }
    uint8_t *signature = data + signature_offset;
    uint32_t code_directory_offset = cold_u32be(signature + 16);
    if (code_directory_offset >= (uint32_t)signature_size ||
        code_directory_offset + 88u > (uint32_t)signature_size) {
        return false;
    }
    uint8_t *code_directory = signature + code_directory_offset;
    if (strcmp(mode, "valid_patch") == 0 ||
        strcmp(mode, "post_sign_same_size") == 0 ||
        strcmp(mode, "post_write_consistent_same_size") == 0 ||
        strcmp(mode, "pre_sign_contract_same_size") == 0 ||
        strcmp(mode, "pre_sign_path_same_size") == 0) {
        int64_t mutation_offset =
            contract_slot +
            (int64_t)strlen(
                "CHENG_COLD_EMBEDDED_CONTRACT\n");
        if (mutation_offset < 0 || mutation_offset >= signature_offset) {
            return false;
        }
        data[mutation_offset] =
            data[mutation_offset] == (uint8_t)'x' ?
                (uint8_t)'y' :
                (uint8_t)'x';
        return true;
    }
    if (strcmp(mode, "outside_patch") == 0) {
        for (int32_t page_offset = 4096;
             page_offset + 128 < signature_offset;
             page_offset += 4096) {
            if (!cold_macho_refresh_bootstrap_page_intersects(
                    page_offset,
                    4096,
                    contract_slot,
                    COLD_EMBEDDED_CONTRACT_CAP) &&
                !cold_macho_refresh_bootstrap_page_intersects(
                    page_offset,
                    4096,
                    path_slot,
                    COLD_EMBEDDED_SOURCE_PATH_CAP)) {
                data[page_offset + 127] ^= 1u;
                return true;
            }
        }
        return false;
    }
    if (strcmp(mode, "super_count") == 0) {
        gate_put_u32be(signature + 8, 2u);
        return true;
    }
    if (strcmp(mode, "version") == 0) {
        gate_put_u32be(code_directory + 8, 0x00020300u);
        return true;
    }
    if (strcmp(mode, "identifier") == 0) {
        uint32_t identifier_offset =
            cold_u32be(code_directory + 20);
        if (identifier_offset >=
            cold_u32be(code_directory + 4)) {
            return false;
        }
        code_directory[identifier_offset] = 0;
        return true;
    }
    if (strcmp(mode, "identifier_content") == 0) {
        uint32_t identifier_offset =
            cold_u32be(code_directory + 20);
        uint32_t hash_offset =
            cold_u32be(code_directory + 16);
        if (identifier_offset >= hash_offset ||
            code_directory[identifier_offset] == 0) {
            return false;
        }
        code_directory[identifier_offset] =
            code_directory[identifier_offset] == (uint8_t)'x' ?
                (uint8_t)'y' :
                (uint8_t)'x';
        return true;
    }
    if (strcmp(mode, "special_slots") == 0) {
        gate_put_u32be(code_directory + 24, 1u);
        return true;
    }
    if (strcmp(mode, "code_slots") == 0) {
        gate_put_u32be(
            code_directory + 28,
            cold_u32be(code_directory + 28) + 1u);
        return true;
    }
    if (strcmp(mode, "code_limit") == 0) {
        gate_put_u32be(
            code_directory + 32,
            cold_u32be(code_directory + 32) - 1u);
        return true;
    }
    if (strcmp(mode, "hash_offset") == 0) {
        gate_put_u32be(
            code_directory + 16,
            cold_u32be(code_directory + 16) - 1u);
        return true;
    }
    if (strcmp(mode, "page_size") == 0) {
        code_directory[39] = 14u;
        return true;
    }
    return false;
}

int main(int argc, char **argv) {
    if (argc != 4) return 64;
    const char *mode = argv[1];
    const char *source = argv[2];
    const char *target = argv[3];
    if (!gate_copy_file(source, target)) return 65;
    int fd = open(target, O_RDWR | O_CLOEXEC | O_NOFOLLOW);
    if (fd < 0) return 66;
    struct stat st;
    if (fstat(fd, &st) != 0 ||
        st.st_size <= 0 ||
        st.st_size > INT32_MAX) {
        close(fd);
        return 67;
    }
    int32_t length = (int32_t)st.st_size;
    uint8_t *data = (uint8_t *)mmap(
        0, (size_t)length, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (data == MAP_FAILED) {
        close(fd);
        return 68;
    }
    int64_t contract_slot = cold_find_patch_slot(
        data,
        (size_t)length,
        "CHENG_COLD_EMBEDDED_CONTRACT\n",
        COLD_EMBEDDED_CONTRACT_CAP);
    int64_t path_slot = cold_find_patch_slot(
        data,
        (size_t)length,
        "CHENG_COLD_EMBEDDED_SOURCE_PATH\n",
        COLD_EMBEDDED_SOURCE_PATH_CAP);
    char expected_identifier_sha256[65];
    bool identifier_bound =
        cold_macho_bootstrap_identifier_sha256_bytes(
            data,
            (size_t)length,
            expected_identifier_sha256);
    bool mutated =
        identifier_bound &&
        contract_slot >= 0 &&
        path_slot >= 0 &&
        gate_mutate(
            mode, data, length, contract_slot, path_slot);
    bool durable =
        mutated &&
        msync(data, (size_t)length, MS_SYNC) == 0 &&
        fsync(fd) == 0;
    char expected_pre_sign_sha256[65];
    durable =
        durable &&
        cold_bootstrap_bridge_fd_sha256(
            fd,
            st.st_size,
            expected_pre_sign_sha256);
    munmap(data, (size_t)length);
    if (durable &&
        (strcmp(mode, "pre_sign_contract_same_size") == 0 ||
         strcmp(mode, "pre_sign_path_same_size") == 0)) {
        int64_t tamper_offset =
            strcmp(mode, "pre_sign_contract_same_size") == 0 ?
            contract_slot +
                (int64_t)strlen(
                    "CHENG_COLD_EMBEDDED_CONTRACT\n") + 1 :
            path_slot +
                (int64_t)strlen(
                    "CHENG_COLD_EMBEDDED_SOURCE_PATH\n");
        uint8_t original = 0;
        durable =
            tamper_offset >= 0 &&
            tamper_offset < length &&
            pread(
                fd,
                &original,
                1,
                (off_t)tamper_offset) == 1;
        uint8_t replacement =
            original == (uint8_t)'x' ?
                (uint8_t)'y' :
                (uint8_t)'x';
        durable =
            durable &&
            pwrite(
                fd,
                &replacement,
                1,
                (off_t)tamper_offset) == 1 &&
            fsync(fd) == 0;
    }
    close(fd);
    if (!durable) return 69;
    char error[256];
    char signed_candidate_sha256[65];
    bool refreshed = cold_macho_refresh_bootstrap_adhoc_signature(
        target,
        contract_slot,
        path_slot,
        expected_identifier_sha256,
        expected_pre_sign_sha256,
        signed_candidate_sha256,
        error,
        sizeof(error));
    bool expected_success =
        strcmp(mode, "valid_patch") == 0 ||
        strcmp(mode, "post_sign_same_size") == 0 ||
        strcmp(mode, "post_write_consistent_same_size") == 0;
    if (refreshed != expected_success) {
        fprintf(stderr,
                "mode=%s refreshed=%d error=%s\n",
                mode,
                refreshed ? 1 : 0,
                error);
        return 70;
    }
    if (strcmp(mode, "post_sign_same_size") == 0) {
        int mutation_fd = open(
            target, O_RDWR | O_CLOEXEC | O_NOFOLLOW);
        struct stat mutation_identity;
        char mutated_sha256[65];
        char rejected_candidate_sha256[65];
        char strict_error[256];
        int64_t mutation_offset =
            contract_slot +
            (int64_t)strlen(
                "CHENG_COLD_EMBEDDED_CONTRACT\n");
        uint8_t original = 0;
        bool mutation_rejected =
            mutation_fd >= 0 &&
            fstat(mutation_fd, &mutation_identity) == 0 &&
            mutation_identity.st_size == length &&
            pread(
                mutation_fd,
                &original,
                1,
                (off_t)mutation_offset) == 1;
        uint8_t replacement =
            original == (uint8_t)'x' ?
                (uint8_t)'y' :
                (uint8_t)'x';
        mutation_rejected =
            mutation_rejected &&
            pwrite(
                mutation_fd,
                &replacement,
                1,
                (off_t)mutation_offset) == 1 &&
            fsync(mutation_fd) == 0 &&
            cold_bootstrap_bridge_fd_sha256(
                mutation_fd,
                mutation_identity.st_size,
                mutated_sha256) &&
            strcmp(
                signed_candidate_sha256,
                mutated_sha256) != 0 &&
            !cold_macho_bootstrap_adhoc_signature_fd(
                mutation_fd,
                target,
                contract_slot,
                path_slot,
                expected_identifier_sha256,
                0,
                false,
                0,
                rejected_candidate_sha256,
                strict_error,
                sizeof(strict_error));
        if (mutation_fd >= 0 &&
            close(mutation_fd) != 0) {
            mutation_rejected = false;
        }
        if (!mutation_rejected) return 71;
    }
    if (strcmp(
            mode,
            "post_write_consistent_same_size") == 0) {
        int mutation_fd = open(
            target,
            O_RDWR | O_CLOEXEC | O_NOFOLLOW);
        struct stat mutation_identity;
        int64_t mutation_offset =
            contract_slot +
            (int64_t)strlen(
                "CHENG_COLD_EMBEDDED_CONTRACT\n");
        uint8_t original = 0;
        char tampered_pre_sign_sha256[65];
        bool tampered =
            mutation_fd >= 0 &&
            fstat(mutation_fd, &mutation_identity) == 0 &&
            mutation_identity.st_size == length &&
            pread(
                mutation_fd,
                &original,
                1,
                (off_t)mutation_offset) == 1;
        uint8_t replacement =
            original == (uint8_t)'x' ?
                (uint8_t)'y' :
                (uint8_t)'x';
        tampered =
            tampered &&
            pwrite(
                mutation_fd,
                &replacement,
                1,
                (off_t)mutation_offset) == 1 &&
            fsync(mutation_fd) == 0 &&
            cold_bootstrap_bridge_fd_sha256(
                mutation_fd,
                mutation_identity.st_size,
                tampered_pre_sign_sha256);
        if (mutation_fd >= 0 &&
            close(mutation_fd) != 0) {
            tampered = false;
        }
        char tampered_candidate_sha256[65];
        char tampered_error[256];
        tampered =
            tampered &&
            cold_macho_refresh_bootstrap_adhoc_signature(
                target,
                contract_slot,
                path_slot,
                expected_identifier_sha256,
                tampered_pre_sign_sha256,
                tampered_candidate_sha256,
                tampered_error,
                sizeof(tampered_error)) &&
            strcmp(
                tampered_candidate_sha256,
                signed_candidate_sha256) != 0;
        if (!tampered) return 72;
    }
    return 0;
}
