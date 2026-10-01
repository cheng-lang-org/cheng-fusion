#define main cold_bootstrap_embedded_program_main
#include "../bootstrap/cheng_cold.c"
#undef main

static bool gate_write_exact(
        int fd,
        const char *bytes,
        size_t length) {
    return ftruncate(fd, 0) == 0 &&
           lseek(fd, 0, SEEK_SET) == 0 &&
           cold_resource_diagnostic_write_all(
               fd,
               bytes,
               length) &&
           fsync(fd) == 0;
}

static bool gate_report_rejected(
        int fd,
        const char *bytes,
        size_t length,
        ColdContract *contract,
        const char *source_path,
        const char *output_path,
        uint64_t contract_hash,
        uint64_t elapsed_us,
        const ColdBootstrapSelfImageReceipt *self_image,
        const ColdBootstrapSigningReceipt *signing) {
    return gate_write_exact(fd, bytes, length) &&
           !cold_compile_report_signature_authority_valid_fd(
               fd,
               contract,
               source_path,
               output_path,
               contract_hash,
               elapsed_us,
               self_image,
               signing);
}

static bool gate_replace_field_value(
        char *out,
        size_t out_cap,
        size_t *out_length,
        const char *report,
        size_t report_length,
        const char *key,
        const char *replacement) {
    size_t key_length = strlen(key);
    const char *found = strstr(report, key);
    if (!found ||
        found != report &&
        found[-1] != '\n') {
        return false;
    }
    const char *value = found + key_length;
    const char *line_end = memchr(
        value,
        '\n',
        report_length - (size_t)(value - report));
    if (!line_end) return false;
    size_t prefix_length = (size_t)(value - report);
    size_t replacement_length = strlen(replacement);
    size_t suffix_offset = (size_t)(line_end - report);
    size_t suffix_length = report_length - suffix_offset;
    if (prefix_length + replacement_length +
            suffix_length >= out_cap) {
        return false;
    }
    memcpy(out, report, prefix_length);
    memcpy(
        out + prefix_length,
        replacement,
        replacement_length);
    memcpy(
        out + prefix_length + replacement_length,
        report + suffix_offset,
        suffix_length);
    *out_length =
        prefix_length +
        replacement_length +
        suffix_length;
    return true;
}

int main(int argc, char **argv) {
    if (argc != 4) return 64;
    const char *contract_path = argv[1];
    const char *self_path = argv[2];
    const char *work_dir = argv[3];
    ColdContract contract;
    if (!cold_contract_parse(
            &contract,
            contract_path) ||
        !cold_contract_validate(&contract)) {
        return 65;
    }
    int self_fd = open(
        self_path,
        O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    ColdBootstrapSelfImageReceipt self_image;
    memset(&self_image, 0, sizeof(self_image));
    self_image.source_kind = "pinned_fd";
    self_image.executable_format =
        "elf64-x86_64-linux";
    self_image.fd = 198;
    if (self_fd < 0 ||
        !cold_bootstrap_self_image_identity_capture(
            self_fd,
            &self_image.before)) {
        if (self_fd >= 0) close(self_fd);
        return 66;
    }
    self_image.after = self_image.before;
    memcpy(
        self_image.copied_sha256,
        self_image.before.sha256,
        sizeof(self_image.copied_sha256));
    self_image.copied_matches_before = true;
    self_image.stable = true;
    if (close(self_fd) != 0) return 67;

    char output_path[PATH_MAX];
    char generated_path[PATH_MAX];
    char report_path[PATH_MAX];
    int output_length = snprintf(
        output_path,
        sizeof(output_path),
        "%s/candidate",
        work_dir);
    int report_path_length = snprintf(
        report_path,
        sizeof(report_path),
        "%s/report",
        work_dir);
    if (output_length <= 0 ||
        output_length >= (int)sizeof(output_path) ||
        report_path_length <= 0 ||
        report_path_length >= (int)sizeof(report_path) ||
        !cold_generated_c_path(
            generated_path,
            sizeof(generated_path),
            output_path)) {
        return 68;
    }
    size_t normalized_length = 0;
    uint64_t contract_hash = 0;
    char *normalized = cold_normalized_alloc(
        &contract,
        &normalized_length,
        &contract_hash);
    free(normalized);
    char transaction_id[65];
    if (!cold_bootstrap_publication_transaction_id(
            contract_hash,
            &self_image.before,
            output_path,
            generated_path,
            report_path,
            transaction_id)) {
        return 69;
    }
    uint8_t generated_digest[32];
    char generated_sha256[65];
    cold_sha256_bytes(
        (const uint8_t *)"generated",
        strlen("generated"),
        generated_digest);
    cold_sha256_hex(
        generated_digest,
        generated_sha256);
    ColdBootstrapSigningReceipt signing = {
        .darwin_sign_mode = "not_applicable",
        .in_process_sign_refresh_count = 0,
        .external_sign_exec_count = 0,
        .code_directory_identifier_sha256 =
            "not_applicable",
        .pre_sign_sha256 =
            self_image.before.sha256,
        .generated_c_sha256 =
            generated_sha256,
        .candidate_sha256 =
            self_image.before.sha256,
        .publication_transaction_id = transaction_id,
        .publication_executable_path = output_path,
        .publication_generated_path = generated_path,
        .publication_report_path = report_path
    };
    const uint64_t elapsed_us = 1234;
    char expected[PATH_MAX * 4 + 8192];
    size_t expected_length = 0;
    if (!cold_compile_report_format(
            expected,
            sizeof(expected),
            &expected_length,
            &contract,
            contract_path,
            output_path,
            contract_hash,
            elapsed_us,
            &self_image,
            &signing)) {
        return 70;
    }
    int report_fd = open(
        report_path,
        O_RDWR | O_CREAT | O_EXCL |
            O_CLOEXEC | O_NOFOLLOW,
        0600);
    if (report_fd < 0 ||
        !gate_write_exact(
            report_fd,
            expected,
            expected_length) ||
        !cold_compile_report_signature_authority_valid_fd(
            report_fd,
            &contract,
            contract_path,
            output_path,
            contract_hash,
            elapsed_us,
            &self_image,
            &signing)) {
        if (report_fd >= 0) close(report_fd);
        return 71;
    }

    int32_t mutations = 0;
    if (!gate_report_rejected(
            report_fd,
            expected,
            expected_length - 1,
            &contract,
            contract_path,
            output_path,
            contract_hash,
            elapsed_us,
            &self_image,
            &signing)) {
        close(report_fd);
        return 72;
    }
    mutations++;
    char mutation[sizeof(expected) + 256];
    memcpy(mutation, expected, expected_length);
    memcpy(
        mutation + expected_length,
        "unknown_key=1\n",
        strlen("unknown_key=1\n"));
    if (!gate_report_rejected(
            report_fd,
            mutation,
            expected_length + strlen("unknown_key=1\n"),
            &contract,
            contract_path,
            output_path,
            contract_hash,
            elapsed_us,
            &self_image,
            &signing)) {
        close(report_fd);
        return 73;
    }
    mutations++;
    const char *first_end = strchr(expected, '\n');
    const char *second_end =
        first_end ? strchr(first_end + 1, '\n') : 0;
    if (!first_end || !second_end) {
        close(report_fd);
        return 74;
    }
    size_t first_length =
        (size_t)(first_end + 1 - expected);
    size_t second_length =
        (size_t)(second_end + 1 - (first_end + 1));
    memcpy(
        mutation,
        first_end + 1,
        second_length);
    memcpy(
        mutation + second_length,
        expected,
        first_length);
    memcpy(
        mutation + second_length + first_length,
        second_end + 1,
        expected_length -
            (size_t)(second_end + 1 - expected));
    if (!gate_report_rejected(
            report_fd,
            mutation,
            expected_length,
            &contract,
            contract_path,
            output_path,
            contract_hash,
            elapsed_us,
            &self_image,
            &signing)) {
        close(report_fd);
        return 75;
    }
    mutations++;

    static const char *keys[] = {
        "target=",
        "darwin_sign_mode=",
        "darwin_code_directory_identifier_sha256=",
        "bootstrap_pre_sign_sha256=",
        "bootstrap_generated_c_sha256=",
        "bootstrap_candidate_sha256=",
        "in_process_sign_refresh_count=",
        "external_sign_exec_count=",
        "self_image_source=",
        "self_image_executable_format=",
        "self_image_fd=",
        "self_image_pre_sha256=",
        "self_image_pre_portable_cid=",
        "self_image_copy_sha256=",
        "self_image_post_sha256=",
        "self_image_post_portable_cid=",
        "self_image_stable="
    };
    for (size_t index = 0;
         index < sizeof(keys) / sizeof(keys[0]);
         index++) {
        size_t mutation_length = 0;
        if (!gate_replace_field_value(
                mutation,
                sizeof(mutation),
                &mutation_length,
                expected,
                expected_length,
                keys[index],
                "forged") ||
            !gate_report_rejected(
                report_fd,
                mutation,
                mutation_length,
                &contract,
                contract_path,
                output_path,
                contract_hash,
                elapsed_us,
                &self_image,
                &signing)) {
            close(report_fd);
            return 76;
        }
        mutations++;
    }

    ColdBootstrapSigningReceipt invalid_signing =
        signing;
    invalid_signing.external_sign_exec_count = 1;
    size_t ignored_length = 0;
    if (cold_compile_report_format(
            mutation,
            sizeof(mutation),
            &ignored_length,
            &contract,
            contract_path,
            output_path,
            contract_hash,
            elapsed_us,
            &self_image,
            &invalid_signing)) {
        close(report_fd);
        return 77;
    }
    mutations++;
    invalid_signing = signing;
    char uppercase_candidate[65];
    memcpy(
        uppercase_candidate,
        signing.candidate_sha256,
        sizeof(uppercase_candidate));
    uppercase_candidate[0] = 'A';
    invalid_signing.candidate_sha256 =
        uppercase_candidate;
    if (cold_compile_report_format(
            mutation,
            sizeof(mutation),
            &ignored_length,
            &contract,
            contract_path,
            output_path,
            contract_hash,
            elapsed_us,
            &self_image,
            &invalid_signing)) {
        close(report_fd);
        return 78;
    }
    mutations++;
    ColdBootstrapSelfImageReceipt invalid_self =
        self_image;
    invalid_self.stable = false;
    if (cold_compile_report_format(
            mutation,
            sizeof(mutation),
            &ignored_length,
            &contract,
            contract_path,
            output_path,
            contract_hash,
            elapsed_us,
            &invalid_self,
            &signing)) {
        close(report_fd);
        return 79;
    }
    mutations++;
    char injected_source[PATH_MAX];
    int injected_length = snprintf(
        injected_source,
        sizeof(injected_source),
        "%s\ninjected=1",
        contract_path);
    if (injected_length <= 0 ||
        injected_length >=
            (int)sizeof(injected_source) ||
        cold_compile_report_format(
            mutation,
            sizeof(mutation),
            &ignored_length,
            &contract,
            injected_source,
            output_path,
            contract_hash,
            elapsed_us,
            &self_image,
            &signing)) {
        close(report_fd);
        return 80;
    }
    mutations++;

    bool close_ok = close(report_fd) == 0;
    printf(
        "cold_bootstrap_compile_report_gate_status=PASS\n"
        "cold_bootstrap_compile_report_gate_mutations=%d\n",
        mutations);
    return close_ok ? 0 : 81;
}
