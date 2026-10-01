#include <poll.h>
#include <stdint.h>

static int32_t GateCheckpointTarget = 0;
static int GateCheckpointEventFd = -1;
static void gate_atomic_checkpoint(int32_t checkpoint);
#define COLD_BOOTSTRAP_ATOMIC_GATE_CHECKPOINT(ID) \
    gate_atomic_checkpoint((int32_t)(ID))
#define main cold_bootstrap_embedded_program_main
#include "../bootstrap/cheng_cold.c"
#undef main

static void gate_atomic_checkpoint(int32_t checkpoint) {
    if (GateCheckpointTarget != checkpoint) return;
    uint32_t event[2] = {
        0x43425458u,
        (uint32_t)checkpoint
    };
    if (GateCheckpointEventFd < 0 ||
        !cold_resource_diagnostic_write_all(
            GateCheckpointEventFd,
            (const char *)event,
            sizeof(event))) {
        _exit(120);
    }
    for (;;) pause();
}

typedef struct GateCheckpointConfig {
    uint32_t magic;
    uint32_t version;
    int32_t checkpoint;
    int32_t reserved;
} GateCheckpointConfig;

#if defined(COLD_BOOTSTRAP_ATOMIC_GATE_CHILD)
static bool gate_read_exact(
        int fd,
        void *out,
        size_t length) {
    size_t copied = 0;
    while (copied < length) {
        ssize_t amount = read(
            fd,
            (uint8_t *)out + copied,
            length - copied);
        if (amount <= 0) return false;
        copied += (size_t)amount;
    }
    uint8_t extra = 0;
    return read(fd, &extra, 1u) == 0;
}

int main(int argc, char **argv) {
    GateCheckpointConfig config;
    memset(&config, 0, sizeof(config));
    errno = 0;
    bool configured =
        gate_read_exact(196, &config, sizeof(config));
    if (!configured && errno != EBADF) return 120;
    if (configured) {
        struct stat executable_identity;
        struct stat pinned_identity;
        int executable_fd =
            argc > 0 && argv && argv[0] ?
            open(
                argv[0],
                O_RDONLY | O_CLOEXEC | O_NOFOLLOW) : -1;
        bool exact =
            config.magic == 0x43425458u &&
            config.version == 1u &&
            config.checkpoint >= 0 &&
            config.checkpoint <= 25 &&
            executable_fd >= 0 &&
            fstat(executable_fd, &executable_identity) == 0 &&
            fstat(198, &pinned_identity) == 0 &&
            S_ISREG(executable_identity.st_mode) &&
            S_ISREG(pinned_identity.st_mode) &&
            executable_identity.st_dev ==
                pinned_identity.st_dev &&
            executable_identity.st_ino ==
                pinned_identity.st_ino &&
            executable_identity.st_uid ==
                pinned_identity.st_uid &&
            executable_identity.st_gid ==
                pinned_identity.st_gid &&
            executable_identity.st_size ==
                pinned_identity.st_size &&
            (executable_identity.st_mode & 07777) ==
                (pinned_identity.st_mode & 07777) &&
            executable_identity.st_nlink ==
                pinned_identity.st_nlink;
        int close_rc =
            executable_fd >= 0 ? close(executable_fd) : 0;
        if (!exact || close_rc != 0) return 121;
        GateCheckpointTarget = config.checkpoint;
        GateCheckpointEventFd = 197;
    }
    return cold_bootstrap_embedded_program_main(
        argc, argv);
}
#else

static bool gate_txdir_create(
        const char *requested_path,
        const char *transaction_id,
        char out_path[PATH_MAX]) {
    char canonical[PATH_MAX];
    char parent[PATH_MAX];
    if (!cold_bootstrap_canonical_output_path(
            requested_path,
            canonical,
            sizeof(canonical)) ||
        !cold_parent_dir(
            canonical,
            parent,
            sizeof(parent))) {
        return false;
    }
    size_t parent_length = strlen(parent);
    while (parent_length > 1 &&
           parent[parent_length - 1] == '/') {
        parent[--parent_length] = '\0';
    }
    int written = snprintf(
        out_path,
        PATH_MAX,
        "%s/.cheng-bootstrap-tx-%s",
        parent,
        transaction_id);
    return written > 0 &&
           written < PATH_MAX &&
           mkdir(out_path, 0700) == 0 &&
           cold_fsync_parent_directory(out_path);
}

static bool gate_txdir_remove(const char *path) {
    return rmdir(path) == 0 &&
           cold_fsync_parent_directory(path);
}

static bool gate_write_payload(
        ColdBootstrapStagedArtifact *artifact,
        const char *payload,
        mode_t mode,
        char out_sha256[65]) {
    size_t length = strlen(payload);
    return artifact &&
           cold_resource_diagnostic_write_all(
               artifact->fd,
               payload,
               length) &&
           cold_bootstrap_staged_artifact_finish_write(
               artifact,
               mode,
               (off_t)length) &&
           cold_bootstrap_bridge_fd_sha256(
               artifact->fd,
               (off_t)length,
               out_sha256);
}

static bool gate_artifact_held_fd_is_read_only(
        const ColdBootstrapStagedArtifact *artifact) {
    if (!artifact || artifact->held_fd < 0) {
        return false;
    }
    int flags = fcntl(artifact->held_fd, F_GETFL);
    return flags >= 0 &&
           (flags & O_ACCMODE) == O_RDONLY;
}

static bool gate_mutate_same_size(
        const char *path,
        mode_t final_mode) {
    int fd = open(
        path,
        O_RDWR | O_CLOEXEC | O_NOFOLLOW);
    if (fd < 0) return false;
    uint8_t value = 0;
    bool ok =
        pread(fd, &value, 1, 0) == 1;
    value ^= 1u;
    ok = ok &&
         pwrite(fd, &value, 1, 0) == 1 &&
         fsync(fd) == 0 &&
         fchmod(fd, final_mode) == 0 &&
         fsync(fd) == 0;
    int close_rc = close(fd);
    return ok && close_rc == 0;
}

static bool gate_sidecar_mutation_rejected(
        const char *requested_path,
        const char *role) {
    char path[PATH_MAX];
    if (!cold_bootstrap_canonical_output_path(
            requested_path,
            path,
            sizeof(path))) {
        return false;
    }
    ColdBootstrapStagedArtifact artifact;
    cold_bootstrap_staged_artifact_zero(&artifact);
    static const char transaction_id[] =
        "1234567812345678123456781234567812345678123456781234567812345678";
    char transaction_path[PATH_MAX];
    char expected_sha256[65];
    bool ok =
        gate_txdir_create(
            path,
            transaction_id,
            transaction_path) &&
        cold_bootstrap_staged_artifact_prepare(
            &artifact,
            path,
            role,
            transaction_id) &&
        gate_write_payload(
            &artifact,
            "alpha",
            0444,
            expected_sha256) &&
        cold_bootstrap_staged_artifact_seal_file(
            &artifact) &&
        gate_artifact_held_fd_is_read_only(
            &artifact) &&
        cold_bootstrap_staged_artifact_sha256_matches(
            &artifact,
            artifact.temporary_name,
            1,
            expected_sha256);
    if (ok) {
        ok =
            chmod(artifact.temporary_path, 0644) == 0 &&
            gate_mutate_same_size(
                artifact.temporary_path,
                0444) &&
            !cold_bootstrap_staged_artifact_sha256_matches(
                &artifact,
                artifact.temporary_name,
                1,
                expected_sha256);
    }
    bool rollback_ok =
        cold_bootstrap_staged_artifact_rollback(
            &artifact) &&
        gate_txdir_remove(transaction_path);
    struct stat ignored;
    errno = 0;
    bool absent =
        lstat(path, &ignored) != 0 &&
        errno == ENOENT;
    return ok && rollback_ok && absent;
}

static bool gate_same_inode_race_rolls_back(
        const char *requested_path) {
    char path[PATH_MAX];
    if (!cold_bootstrap_canonical_output_path(
            requested_path,
            path,
            sizeof(path))) {
        return false;
    }
    ColdBootstrapStagedArtifact artifact;
    cold_bootstrap_staged_artifact_zero(&artifact);
    static const char transaction_id[] =
        "abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01abcdef01";
    char transaction_path[PATH_MAX];
    char expected_sha256[65];
    bool ok =
        gate_txdir_create(
            path,
            transaction_id,
            transaction_path) &&
        cold_bootstrap_staged_artifact_prepare(
            &artifact,
            path,
            "race",
            transaction_id) &&
        gate_write_payload(
            &artifact,
            "alpha",
            0444,
            expected_sha256) &&
        cold_bootstrap_staged_artifact_seal_file(
            &artifact) &&
        gate_artifact_held_fd_is_read_only(
            &artifact) &&
        linkat(
            artifact.staging_fd,
            artifact.temporary_name,
            artifact.parent_fd,
            artifact.final_name,
            0) == 0 &&
        !cold_bootstrap_staged_artifact_publish(
            &artifact) &&
        artifact.published;
    bool rollback_ok =
        cold_bootstrap_staged_artifact_rollback(
            &artifact) &&
        gate_txdir_remove(transaction_path);
    struct stat ignored;
    errno = 0;
    bool final_absent =
        lstat(path, &ignored) != 0 &&
        errno == ENOENT;
    errno = 0;
    bool temporary_absent =
        lstat(artifact.temporary_path, &ignored) != 0 &&
        errno == ENOENT;
    return ok && rollback_ok &&
           final_absent && temporary_absent;
}

static bool gate_final_mutation_rejected(
        const char *requested_path) {
    char path[PATH_MAX];
    if (!cold_bootstrap_canonical_output_path(
            requested_path,
            path,
            sizeof(path))) {
        return false;
    }
    ColdBootstrapStagedArtifact artifact;
    cold_bootstrap_staged_artifact_zero(&artifact);
    static const char transaction_id[] =
        "1020304010203040102030401020304010203040102030401020304010203040";
    char transaction_path[PATH_MAX];
    char expected_sha256[65];
    bool ok =
        gate_txdir_create(
            path,
            transaction_id,
            transaction_path) &&
        cold_bootstrap_staged_artifact_prepare(
            &artifact,
            path,
            "final",
            transaction_id) &&
        gate_write_payload(
            &artifact,
            "alpha",
            0444,
            expected_sha256) &&
        cold_bootstrap_staged_artifact_seal_file(
            &artifact) &&
        gate_artifact_held_fd_is_read_only(
            &artifact) &&
        cold_bootstrap_staged_artifact_publish(
            &artifact) &&
        cold_bootstrap_final_path_sha256_matches(
            &artifact,
            0444,
            expected_sha256);
    if (ok) {
        ok =
            chmod(path, 0644) == 0 &&
            gate_mutate_same_size(path, 0444) &&
            !cold_bootstrap_final_path_sha256_matches(
                &artifact,
                0444,
                expected_sha256);
    }
    bool rollback_ok =
        cold_bootstrap_staged_artifact_rollback(
            &artifact) &&
        gate_txdir_remove(transaction_path);
    struct stat ignored;
    errno = 0;
    bool absent =
        lstat(path, &ignored) != 0 &&
        errno == ENOENT;
    return ok && rollback_ok && absent;
}

static bool gate_path_absent(
        const char *path) {
    struct stat ignored;
    errno = 0;
    return lstat(path, &ignored) != 0 &&
           errno == ENOENT;
}

static bool gate_foreign_pending_case_preserved(
        const char *requested_path,
        bool partial) {
    static const char full_transaction_id[] =
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    static const char partial_transaction_id[] =
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    const char *transaction_id =
        partial ?
        partial_transaction_id :
        full_transaction_id;
    static const char self_cid[] =
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    char output_path[PATH_MAX];
    char generated_path[PATH_MAX];
    char report_path[PATH_MAX];
    char txdir_path[PATH_MAX];
    char pending_path[PATH_MAX];
    char case_path[PATH_MAX];
    int case_length = snprintf(
        case_path,
        sizeof(case_path),
        "%s-%s",
        requested_path,
        partial ? "partial" : "full");
    if (case_length <= 0 ||
        case_length >= (int)sizeof(case_path) ||
        !cold_bootstrap_canonical_output_path(
            case_path,
            output_path,
            sizeof(output_path))) {
        return false;
    }
    int generated_length = snprintf(
        generated_path,
        sizeof(generated_path),
        "%s.generated.c",
        output_path);
    int report_length = snprintf(
        report_path,
        sizeof(report_path),
        "%s.report",
        output_path);
    if (generated_length <= 0 ||
        generated_length >= (int)sizeof(generated_path) ||
        report_length <= 0 ||
        report_length >= (int)sizeof(report_path) ||
        !gate_txdir_create(
            output_path,
            transaction_id,
            txdir_path)) {
        return false;
    }
    static const char payload[] =
        "foreign-pending-intent-authority\n";
    size_t full_length = sizeof(payload) - 1u;
    size_t written_length =
        partial ? full_length - 1u : full_length;
    uint8_t pending_digest[32];
    char pending_cid[65];
    cold_sha256_bytes(
        (const uint8_t *)payload,
        full_length,
        pending_digest);
    cold_sha256_hex(pending_digest, pending_cid);
    int pending_length = snprintf(
        pending_path,
        sizeof(pending_path),
        "%s/intent-%s.pending",
        txdir_path,
        pending_cid);
    if (pending_length <= 0 ||
        pending_length >= (int)sizeof(pending_path)) {
        gate_txdir_remove(txdir_path);
        return false;
    }
    int pending_fd = open(
        pending_path,
        O_WRONLY | O_CREAT | O_EXCL |
            O_CLOEXEC | O_NOFOLLOW,
        0600);
    bool staged =
        pending_fd >= 0 &&
        cold_resource_diagnostic_write_all(
            pending_fd,
            payload,
            written_length) &&
        fsync(pending_fd) == 0;
    int pending_close_rc =
        pending_fd >= 0 ? close(pending_fd) : 0;
    char before_sha256[65];
    char after_sha256[65];
    struct stat before;
    int before_fd = open(
        pending_path,
        O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    bool before_exact =
        staged &&
        pending_close_rc == 0 &&
        before_fd >= 0 &&
        fstat(before_fd, &before) == 0 &&
        S_ISREG(before.st_mode) &&
        before.st_uid == geteuid() &&
        before.st_nlink == 1 &&
        before.st_size == (off_t)written_length &&
        (before.st_mode & 07777) == 0600 &&
        cold_bootstrap_fd_exact_text(
            before_fd,
            payload,
            written_length) &&
        cold_bootstrap_bridge_fd_sha256(
            before_fd,
            before.st_size,
            before_sha256);
    if (before_fd >= 0) close(before_fd);
    bool preserved = before_exact;
    for (int32_t attempt = 0;
         attempt < 2;
         attempt++) {
        ColdBootstrapPublicationTransaction transaction;
        int begin_status =
            cold_bootstrap_publication_transaction_begin(
                &transaction,
                transaction_id,
                0x123456789abcdef0ull,
                self_cid,
                "foreign-pending-gate",
                "arm64-apple-darwin",
                "/foreign/pending/contract.cheng",
                output_path,
                generated_path,
                report_path);
        bool close_ok =
            cold_bootstrap_transaction_close_preserve(
                &transaction);
        struct stat after;
        int after_fd = open(
            pending_path,
            O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
        bool attempt_preserved =
            begin_status == 0 &&
            close_ok &&
            after_fd >= 0 &&
            fstat(after_fd, &after) == 0 &&
            before.st_dev == after.st_dev &&
            before.st_ino == after.st_ino &&
            before.st_mode == after.st_mode &&
            before.st_nlink == after.st_nlink &&
            before.st_size == after.st_size &&
            (after.st_mode & 07777) == 0600 &&
            cold_bootstrap_fd_exact_text(
                after_fd,
                payload,
                written_length) &&
            cold_bootstrap_bridge_fd_sha256(
                after_fd,
                after.st_size,
                after_sha256) &&
            strcmp(before_sha256, after_sha256) == 0 &&
            gate_path_absent(output_path) &&
            gate_path_absent(generated_path) &&
            gate_path_absent(report_path);
        if (after_fd >= 0) close(after_fd);
        preserved =
            preserved && attempt_preserved;
    }
    bool pending_cleaned =
        unlink(pending_path) == 0;
    bool transaction_cleaned =
        gate_txdir_remove(txdir_path);
    bool cleaned =
        pending_cleaned && transaction_cleaned;
    return preserved && cleaned;
}

static bool gate_foreign_pending_preserved(
        const char *requested_path) {
    bool full_preserved =
        gate_foreign_pending_case_preserved(
            requested_path, false);
    bool partial_preserved =
        gate_foreign_pending_case_preserved(
            requested_path, true);
    return full_preserved && partial_preserved;
}

static int gate_wait_child(pid_t child) {
    int status = 0;
    return waitpid(child, &status, 0) == child &&
           WIFEXITED(status) ?
           WEXITSTATUS(status) : -1;
}

static pid_t gate_spawn_compile(
        int current_fd,
        const char *self_path,
        const char *contract_path,
        const char *output_path,
        const char *report_path,
        int32_t checkpoint,
        int event_fd) {
    int config_pipe[2];
    if (current_fd < 0 ||
        pipe(config_pipe) != 0) {
        return -1;
    }
    pid_t child = fork();
    if (child < 0) {
        close(config_pipe[0]);
        close(config_pipe[1]);
        return -1;
    }
    if (child != 0) {
        close(config_pipe[0]);
        GateCheckpointConfig config = {
            .magic = 0x43425458u,
            .version = 1u,
            .checkpoint = checkpoint,
            .reserved = 0
        };
        bool wrote =
            cold_resource_diagnostic_write_all(
                config_pipe[1],
                (const char *)&config,
                sizeof(config));
        int close_rc = close(config_pipe[1]);
        if (!wrote || close_rc != 0) {
            kill(child, SIGKILL);
            waitpid(child, 0, 0);
            return -1;
        }
        return child;
    }
    close(config_pipe[1]);
    int null_fd = open(
        "/dev/null",
        O_RDWR | O_CLOEXEC);
    if (null_fd < 0 ||
        dup2(config_pipe[0], 196) < 0 ||
        (checkpoint > 0 ?
         dup2(event_fd, 197) :
         dup2(null_fd, 197)) < 0 ||
        dup2(current_fd, 198) < 0 ||
        dup2(null_fd, STDOUT_FILENO) < 0 ||
        (checkpoint != 0 &&
         dup2(null_fd, STDERR_FILENO) < 0)) {
        _exit(121);
    }
    if (config_pipe[0] != 196) close(config_pipe[0]);
    if (checkpoint > 0 && event_fd != 197) {
        close(event_fd);
    }
    if (current_fd != 198) close(current_fd);
    if (null_fd != STDOUT_FILENO &&
        null_fd != STDERR_FILENO) {
        close(null_fd);
    }
    char input_flag[PATH_MAX + 16];
    char output_flag[PATH_MAX + 16];
    char report_flag[PATH_MAX + 24];
    if (snprintf(
            input_flag,
            sizeof(input_flag),
            "--in:%s",
            contract_path) <= 0 ||
        snprintf(
            output_flag,
            sizeof(output_flag),
            "--out:%s",
            output_path) <= 0 ||
        snprintf(
            report_flag,
            sizeof(report_flag),
            "--report-out:%s",
            report_path) <= 0) {
        _exit(122);
    }
    char *compile_argv[] = {
        (char *)self_path,
        "compile-bootstrap",
        input_flag,
        output_flag,
        report_flag,
        "--bootstrap-self-image-fd:198",
        0
    };
    char *compile_env[] = {
        "LC_ALL=C",
        "LANG=C",
        "PATH=/usr/bin:/bin",
        0
    };
    execve(self_path, compile_argv, compile_env);
    _exit(123);
}

static bool gate_candidate_self_check(
        const char *path) {
    int output_pipe[2];
    int error_pipe[2];
    if (pipe(output_pipe) != 0 ||
        pipe(error_pipe) != 0) {
        return false;
    }
    pid_t child = fork();
    if (child < 0) return false;
    if (child == 0) {
        close(output_pipe[0]);
        close(error_pipe[0]);
        if (dup2(
                output_pipe[1],
                STDOUT_FILENO) < 0 ||
            dup2(
                error_pipe[1],
                STDERR_FILENO) < 0) {
            _exit(123);
        }
        close(output_pipe[1]);
        close(error_pipe[1]);
        execl(path, path, "self-check", (char *)0);
        _exit(124);
    }
    close(output_pipe[1]);
    close(error_pipe[1]);
    char output[8192];
    char error[4096];
    ssize_t output_length =
        read(output_pipe[0], output, sizeof(output) - 1u);
    ssize_t error_length =
        read(error_pipe[0], error, sizeof(error) - 1u);
    int output_close_rc = close(output_pipe[0]);
    int error_close_rc = close(error_pipe[0]);
    int status = gate_wait_child(child);
    if (output_length < 0 || error_length != 0 ||
        output_close_rc != 0 || error_close_rc != 0 ||
        status != 0) {
        return false;
    }
    output[output_length] = '\0';
    char self_check[16];
    return cold_bootstrap_text_value_exact(
               output,
               (size_t)output_length,
               "cheng_bootstrap_self_check",
               self_check,
               sizeof(self_check)) &&
           strcmp(self_check, "ok") == 0;
}

static bool gate_codesign_verify(
        const char *path) {
    pid_t child = fork();
    if (child < 0) return false;
    if (child == 0) {
        int null_fd = open(
            "/dev/null",
            O_RDWR | O_CLOEXEC);
        if (null_fd < 0 ||
            dup2(null_fd, STDOUT_FILENO) < 0 ||
            dup2(null_fd, STDERR_FILENO) < 0) {
            _exit(125);
        }
        execl(
            "/usr/bin/codesign",
            "/usr/bin/codesign",
            "--verify",
            "--strict",
            path,
            (char *)0);
        _exit(126);
    }
    return gate_wait_child(child) == 0;
}

static bool gate_report_matches_outputs(
        const char *output_path,
        const char *report_path,
        const char *current_sha256) {
    char generated_path[PATH_MAX];
    int generated_length = snprintf(
        generated_path,
        sizeof(generated_path),
        "%s.generated.c",
        output_path);
    if (generated_length <= 0 ||
        generated_length >= (int)sizeof(generated_path)) {
        return false;
    }
    const char *paths[3] = {
        output_path,
        generated_path,
        report_path
    };
    const mode_t modes[3] = {0555, 0444, 0444};
    char sha256[3][65];
    for (int32_t index = 0; index < 3; index++) {
        int fd = open(
            paths[index],
            O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
        struct stat identity;
        bool exact =
            fd >= 0 &&
            fstat(fd, &identity) == 0 &&
            S_ISREG(identity.st_mode) &&
            identity.st_uid == geteuid() &&
            identity.st_nlink == 1 &&
            identity.st_size > 0 &&
            (identity.st_mode & 07777) == modes[index] &&
            cold_bootstrap_bridge_fd_sha256(
                fd,
                identity.st_size,
                sha256[index]);
        int close_rc = fd >= 0 ? close(fd) : 0;
        if (!exact || close_rc != 0) return false;
    }
    int report_fd = open(
        report_path,
        O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    struct stat report_identity;
    if (report_fd < 0 ||
        fstat(report_fd, &report_identity) != 0 ||
        report_identity.st_size <= 0 ||
        report_identity.st_size > 65536) {
        if (report_fd >= 0) close(report_fd);
        return false;
    }
    size_t length = (size_t)report_identity.st_size;
    char *text = (char *)malloc(length + 1u);
    if (!text) {
        close(report_fd);
        return false;
    }
    size_t copied = 0;
    while (copied < length) {
        ssize_t amount = pread(
            report_fd,
            text + copied,
            length - copied,
            (off_t)copied);
        if (amount <= 0) break;
        copied += (size_t)amount;
    }
    text[length] = '\0';
    char candidate[65];
    char generated[65];
    char transaction_id[65];
    char self_source[32];
    char self_fd[16];
    char self_pre_sha256[65];
    char self_copy_sha256[65];
    char self_post_sha256[65];
    char self_copy_matches[8];
    char self_stable[8];
    bool matches =
        copied == length &&
        cold_bootstrap_text_value_exact(
            text,
            length,
            "bootstrap_candidate_sha256",
            candidate,
            sizeof(candidate)) &&
        cold_bootstrap_text_value_exact(
            text,
            length,
            "bootstrap_generated_c_sha256",
            generated,
            sizeof(generated)) &&
        cold_bootstrap_text_value_exact(
            text,
            length,
            "bootstrap_publication_transaction_id",
            transaction_id,
            sizeof(transaction_id)) &&
        cold_compile_report_sha256_valid(transaction_id) &&
        strcmp(candidate, sha256[0]) == 0 &&
        strcmp(generated, sha256[1]) == 0 &&
        current_sha256 &&
        cold_bootstrap_text_value_exact(
            text,
            length,
            "self_image_source",
            self_source,
            sizeof(self_source)) &&
        strcmp(self_source, "pinned_fd") == 0 &&
        cold_bootstrap_text_value_exact(
            text,
            length,
            "self_image_fd",
            self_fd,
            sizeof(self_fd)) &&
        strcmp(self_fd, "198") == 0 &&
        cold_bootstrap_text_value_exact(
            text,
            length,
            "self_image_pre_sha256",
            self_pre_sha256,
            sizeof(self_pre_sha256)) &&
        cold_bootstrap_text_value_exact(
            text,
            length,
            "self_image_copy_sha256",
            self_copy_sha256,
            sizeof(self_copy_sha256)) &&
        cold_bootstrap_text_value_exact(
            text,
            length,
            "self_image_post_sha256",
            self_post_sha256,
            sizeof(self_post_sha256)) &&
        strcmp(self_pre_sha256, current_sha256) == 0 &&
        strcmp(self_copy_sha256, current_sha256) == 0 &&
        strcmp(self_post_sha256, current_sha256) == 0 &&
        cold_bootstrap_text_value_exact(
            text,
            length,
            "self_image_copy_matches_pre",
            self_copy_matches,
            sizeof(self_copy_matches)) &&
        strcmp(self_copy_matches, "1") == 0 &&
        cold_bootstrap_text_value_exact(
            text,
            length,
            "self_image_stable",
            self_stable,
            sizeof(self_stable)) &&
        strcmp(self_stable, "1") == 0;
    int close_rc = close(report_fd);
    free(text);
    return matches &&
           close_rc == 0 &&
           gate_codesign_verify(output_path) &&
           gate_candidate_self_check(output_path);
}

static bool gate_directory_has_no_transaction_entries(
        const char *path) {
    DIR *directory = opendir(path);
    if (!directory) return false;
    bool clean = true;
    struct dirent *entry = 0;
    while ((entry = readdir(directory)) != 0) {
        const char *name = entry->d_name;
        if (strncmp(
                name,
                ".cheng-bootstrap-",
                strlen(".cheng-bootstrap-")) == 0 ||
            strstr(name, ".tmp") != 0 ||
            strncmp(name, "intent-", 7u) == 0 ||
            strncmp(name, "commit-", 7u) == 0) {
            clean = false;
            break;
        }
    }
    int close_rc = closedir(directory);
    return clean && close_rc == 0;
}

static bool gate_transaction_role_hold(
        const char *case_path,
        const char *final_path,
        const char *role,
        int *out_fd,
        struct stat *out_identity) {
    if (!case_path || !final_path ||
        !role || !out_fd || !out_identity) {
        return false;
    }
    *out_fd = -1;
    errno = 0;
    int held_fd = open(
        final_path,
        O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (held_fd >= 0) {
        struct stat final_identity;
        if (fstat(held_fd, &final_identity) != 0 ||
            !S_ISREG(final_identity.st_mode)) {
            close(held_fd);
            return false;
        }
        *out_fd = held_fd;
        *out_identity = final_identity;
        return true;
    }
    if (errno != ENOENT) return false;
    DIR *directory = opendir(case_path);
    if (!directory) return false;
    char transaction_name[NAME_MAX + 1];
    transaction_name[0] = '\0';
    bool exact = true;
    struct dirent *entry = 0;
    while ((entry = readdir(directory)) != 0) {
        if (strncmp(
                entry->d_name,
                ".cheng-bootstrap-tx-",
                strlen(".cheng-bootstrap-tx-")) != 0) {
            continue;
        }
        if (transaction_name[0]) {
            exact = false;
            break;
        }
        int copied = snprintf(
            transaction_name,
            sizeof(transaction_name),
            "%s",
            entry->d_name);
        if (copied <= 0 ||
            copied >=
                (int)sizeof(transaction_name)) {
            exact = false;
            break;
        }
    }
    int directory_close_rc = closedir(directory);
    if (!exact || directory_close_rc != 0 ||
        !transaction_name[0]) {
        return false;
    }
    char temporary_path[PATH_MAX];
    int temporary_length = snprintf(
        temporary_path,
        sizeof(temporary_path),
        "%s/%s/%s.tmp",
        case_path,
        transaction_name,
        role);
    if (temporary_length <= 0 ||
        temporary_length >= (int)sizeof(temporary_path)) {
        return false;
    }
    held_fd = open(
        temporary_path,
        O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    struct stat temporary_identity;
    if (held_fd < 0 ||
        fstat(held_fd, &temporary_identity) != 0 ||
        !S_ISREG(temporary_identity.st_mode)) {
        if (held_fd >= 0) close(held_fd);
        return false;
    }
    *out_fd = held_fd;
    *out_identity = temporary_identity;
    return true;
}

static bool gate_held_identity_matches_path(
        int held_fd,
        const struct stat *expected,
        const char *path) {
    if (held_fd < 0 || !expected || !path) return false;
    struct stat held_identity;
    if (fstat(held_fd, &held_identity) != 0 ||
        !S_ISREG(held_identity.st_mode) ||
        held_identity.st_dev != expected->st_dev ||
        held_identity.st_ino != expected->st_ino) {
        return false;
    }
    int path_fd = open(
        path,
        O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    struct stat path_identity;
    bool matches =
        path_fd >= 0 &&
        fstat(path_fd, &path_identity) == 0 &&
        S_ISREG(path_identity.st_mode) &&
        path_identity.st_dev == held_identity.st_dev &&
        path_identity.st_ino == held_identity.st_ino;
    int close_rc = path_fd >= 0 ? close(path_fd) : 0;
    return matches && close_rc == 0;
}

static bool gate_crash_matrix(
        const char *root,
        int current_fd,
        const char *current_sha256,
        const char *self_path,
        const char *contract_path,
        int32_t only_checkpoint) {
    int32_t first =
        only_checkpoint > 0 ? only_checkpoint : 1;
    int32_t last =
        only_checkpoint > 0 ? only_checkpoint : 25;
    for (int32_t checkpoint = first;
         checkpoint <= last;
         checkpoint++) {
        char case_path[PATH_MAX];
        char output_path[PATH_MAX];
        char generated_path[PATH_MAX];
        char report_path[PATH_MAX];
        if (snprintf(
                case_path,
                sizeof(case_path),
                "%s/crash-%d",
                root,
                checkpoint) <= 0 ||
            snprintf(
                output_path,
                sizeof(output_path),
                "%s/candidate",
                case_path) <= 0 ||
            snprintf(
                generated_path,
                sizeof(generated_path),
                "%s/candidate.generated.c",
                case_path) <= 0 ||
            snprintf(
                report_path,
                sizeof(report_path),
                "%s/candidate.report",
                case_path) <= 0 ||
            mkdir(case_path, 0700) != 0) {
            return false;
        }
        int events[2];
        if (pipe(events) != 0) return false;
        pid_t child = gate_spawn_compile(
            current_fd,
            self_path,
            contract_path,
            output_path,
            report_path,
            checkpoint,
            events[1]);
        close(events[1]);
        if (child < 0) {
            close(events[0]);
            return false;
        }
        struct pollfd event_poll = {
            .fd = events[0],
            .events = POLLIN,
            .revents = 0
        };
        uint32_t event[2] = {0, 0};
        bool checkpoint_reached =
            poll(&event_poll, 1, 30000) == 1 &&
            (event_poll.revents & POLLIN) != 0 &&
            read(events[0], event, sizeof(event)) ==
                (ssize_t)sizeof(event) &&
            event[0] == 0x43425458u &&
            event[1] == (uint32_t)checkpoint;
        close(events[0]);
        if (!checkpoint_reached ||
            kill(child, SIGKILL) != 0) {
            int early_status = 0;
            pid_t early_wait =
                waitpid(
                    child,
                    &early_status,
                    WNOHANG);
            fprintf(
                stderr,
                "crash_checkpoint_event_failed=%d wait=%ld exit=%d signal=%d\n",
                checkpoint,
                (long)early_wait,
                early_wait == child &&
                    WIFEXITED(early_status) ?
                    WEXITSTATUS(early_status) : -1,
                early_wait == child &&
                    WIFSIGNALED(early_status) ?
                    WTERMSIG(early_status) : -1);
            if (early_wait == 0) {
                kill(child, SIGKILL);
                waitpid(child, 0, 0);
            }
            return false;
        }
        int killed_status = 0;
        if (waitpid(
                child,
                &killed_status,
                0) != child ||
            !WIFSIGNALED(killed_status) ||
            WTERMSIG(killed_status) != SIGKILL) {
            fprintf(
                stderr,
                "crash_checkpoint_kill_failed=%d\n",
                checkpoint);
            return false;
        }
        int committed_fd[3] = {-1, -1, -1};
        struct stat committed_identity[3];
        bool continuity_before = true;
        if (checkpoint >= 10) {
            continuity_before =
                gate_transaction_role_hold(
                    case_path,
                    output_path,
                    "executable",
                    &committed_fd[0],
                    &committed_identity[0]) &&
                gate_transaction_role_hold(
                    case_path,
                    generated_path,
                    "generated",
                    &committed_fd[1],
                    &committed_identity[1]) &&
                gate_transaction_role_hold(
                    case_path,
                    report_path,
                    "report",
                    &committed_fd[2],
                    &committed_identity[2]);
        }
        pid_t retry = gate_spawn_compile(
            current_fd,
            self_path,
            contract_path,
            output_path,
            report_path,
            0,
            -1);
        int retry_status =
            retry >= 0 ? gate_wait_child(retry) : -1;
        bool report_matches =
            retry_status == 0 &&
            gate_report_matches_outputs(
                output_path,
                report_path,
                current_sha256);
        bool directory_clean =
            retry_status == 0 &&
            gate_directory_has_no_transaction_entries(
                case_path);
        bool continuity_after =
            checkpoint < 10 ||
            (continuity_before &&
             gate_held_identity_matches_path(
                 committed_fd[0],
                 &committed_identity[0],
                 output_path) &&
             gate_held_identity_matches_path(
                 committed_fd[1],
                 &committed_identity[1],
                 generated_path) &&
             gate_held_identity_matches_path(
                 committed_fd[2],
                 &committed_identity[2],
                 report_path));
        bool continuity_close = true;
        for (int32_t index = 0; index < 3; index++) {
            if (committed_fd[index] >= 0 &&
                close(committed_fd[index]) != 0) {
                continuity_close = false;
            }
        }
        continuity_after =
            continuity_after && continuity_close;
        if (retry < 0 ||
            retry_status != 0 ||
            !report_matches ||
            !directory_clean ||
            !continuity_after) {
            fprintf(
                stderr,
                "crash_checkpoint_recovery_failed=%d retry=%d report=%d clean=%d continuity=%d\n",
                checkpoint,
                retry_status,
                report_matches ? 1 : 0,
                directory_clean ? 1 : 0,
                continuity_after ? 1 : 0);
            return false;
        }
    }
    return true;
}

static bool gate_find_transaction_directory(
        const char *case_path,
        char out_path[PATH_MAX]) {
    if (!case_path || !out_path) return false;
    DIR *directory = opendir(case_path);
    if (!directory) return false;
    char transaction_name[NAME_MAX + 1];
    transaction_name[0] = '\0';
    bool exact = true;
    struct dirent *entry = 0;
    while ((entry = readdir(directory)) != 0) {
        if (strncmp(
                entry->d_name,
                ".cheng-bootstrap-tx-",
                strlen(".cheng-bootstrap-tx-")) != 0) {
            continue;
        }
        if (transaction_name[0]) {
            exact = false;
            break;
        }
        int copied = snprintf(
            transaction_name,
            sizeof(transaction_name),
            "%s",
            entry->d_name);
        if (copied <= 0 ||
            copied >=
                (int)sizeof(transaction_name)) {
            exact = false;
            break;
        }
    }
    int close_rc = closedir(directory);
    if (!exact || close_rc != 0 ||
        !transaction_name[0]) {
        return false;
    }
    int path_length = snprintf(
        out_path,
        PATH_MAX,
        "%s/%s",
        case_path,
        transaction_name);
    return path_length > 0 &&
           path_length < PATH_MAX;
}

static bool gate_partial_precommit_rollback_recovers(
        const char *root,
        int current_fd,
        const char *current_sha256,
        const char *self_path,
        const char *contract_path) {
    char case_path[PATH_MAX];
    char output_path[PATH_MAX];
    char report_path[PATH_MAX];
    if (snprintf(
            case_path,
            sizeof(case_path),
            "%s/partial-precommit-rollback",
            root) <= 0 ||
        snprintf(
            output_path,
            sizeof(output_path),
            "%s/candidate",
            case_path) <= 0 ||
        snprintf(
            report_path,
            sizeof(report_path),
            "%s/candidate.report",
            case_path) <= 0 ||
        mkdir(case_path, 0700) != 0) {
        return false;
    }
    int events[2];
    if (pipe(events) != 0) return false;
    pid_t child = gate_spawn_compile(
        current_fd,
        self_path,
        contract_path,
        output_path,
        report_path,
        8,
        events[1]);
    close(events[1]);
    if (child < 0) {
        close(events[0]);
        return false;
    }
    struct pollfd event_poll = {
        .fd = events[0],
        .events = POLLIN,
        .revents = 0
    };
    uint32_t event[2] = {0, 0};
    bool checkpoint_reached =
        poll(&event_poll, 1, 30000) == 1 &&
        (event_poll.revents & POLLIN) != 0 &&
        read(events[0], event, sizeof(event)) ==
            (ssize_t)sizeof(event) &&
        event[0] == 0x43425458u &&
        event[1] == 8u;
    close(events[0]);
    if (!checkpoint_reached ||
        kill(child, SIGKILL) != 0) {
        kill(child, SIGKILL);
        waitpid(child, 0, 0);
        return false;
    }
    int killed_status = 0;
    if (waitpid(child, &killed_status, 0) != child ||
        !WIFSIGNALED(killed_status) ||
        WTERMSIG(killed_status) != SIGKILL) {
        return false;
    }
    char transaction_path[PATH_MAX];
    if (!gate_find_transaction_directory(
            case_path,
            transaction_path)) {
        return false;
    }
    int transaction_fd = open(
        transaction_path,
        O_RDONLY | O_CLOEXEC | O_DIRECTORY | O_NOFOLLOW);
    bool partial_rollback =
        transaction_fd >= 0 &&
        unlinkat(
            transaction_fd,
            "executable.tmp",
            0) == 0 &&
        fsync(transaction_fd) == 0;
    int transaction_close_rc =
        transaction_fd >= 0 ?
        close(transaction_fd) : 0;
    if (!partial_rollback ||
        transaction_close_rc != 0) {
        return false;
    }
    pid_t retry = gate_spawn_compile(
        current_fd,
        self_path,
        contract_path,
        output_path,
        report_path,
        0,
        -1);
    int retry_status =
        retry >= 0 ? gate_wait_child(retry) : -1;
    return retry >= 0 &&
           retry_status == 0 &&
           gate_report_matches_outputs(
               output_path,
               report_path,
               current_sha256) &&
           gate_directory_has_no_transaction_entries(
               case_path);
}

int main(int argc, char **argv) {
    if (argc != 4 && argc != 5) return 64;
    int32_t only_checkpoint =
        argc == 5 ? (int32_t)atoi(argv[4]) : 0;
    if (only_checkpoint < 0 ||
        only_checkpoint > 25) {
        return 64;
    }
    char generated_path[PATH_MAX];
    char report_path[PATH_MAX];
    char race_path[PATH_MAX];
    char final_path[PATH_MAX];
    char foreign_pending_path[PATH_MAX];
    int generated_length = snprintf(
            generated_path,
            sizeof(generated_path),
            "%s/generated",
            argv[1]);
    int report_length = snprintf(
            report_path,
            sizeof(report_path),
            "%s/report",
            argv[1]);
    int race_length = snprintf(
            race_path,
            sizeof(race_path),
            "%s/race",
            argv[1]);
    int final_length = snprintf(
            final_path,
            sizeof(final_path),
            "%s/final",
            argv[1]);
    int foreign_pending_length = snprintf(
            foreign_pending_path,
            sizeof(foreign_pending_path),
            "%s/foreign-pending",
            argv[1]);
    if (generated_length <= 0 ||
        generated_length >= (int)sizeof(generated_path) ||
        report_length <= 0 ||
        report_length >= (int)sizeof(report_path) ||
        race_length <= 0 ||
        race_length >= (int)sizeof(race_path) ||
        final_length <= 0 ||
        final_length >= (int)sizeof(final_path) ||
        foreign_pending_length <= 0 ||
        foreign_pending_length >=
            (int)sizeof(foreign_pending_path)) {
        return 65;
    }
    bool generated_rejected =
        gate_sidecar_mutation_rejected(
            generated_path,
            "generated");
    bool report_rejected =
        gate_sidecar_mutation_rejected(
            report_path,
            "report");
    bool race_rolled_back =
        gate_same_inode_race_rolls_back(
            race_path);
    bool final_rejected =
        gate_final_mutation_rejected(
            final_path);
    bool foreign_pending_preserved =
        gate_foreign_pending_preserved(
            foreign_pending_path);
    char self_path[PATH_MAX];
    int current_fd = -1;
    struct stat current_identity;
    char current_sha256[65];
    bool current_exact =
        realpath(argv[2], self_path) != 0 &&
        (current_fd = open(
            self_path,
            O_RDONLY | O_CLOEXEC | O_NOFOLLOW)) >= 0 &&
        fstat(current_fd, &current_identity) == 0 &&
        S_ISREG(current_identity.st_mode) &&
        current_identity.st_uid == geteuid() &&
        current_identity.st_nlink == 1 &&
        current_identity.st_size > 0 &&
        (current_identity.st_mode & 07777) == 0500 &&
        cold_bootstrap_bridge_fd_sha256(
            current_fd,
            current_identity.st_size,
            current_sha256);
    bool crash_matrix =
        current_exact &&
        gate_crash_matrix(
            argv[1],
            current_fd,
            current_sha256,
            self_path,
            argv[3],
            only_checkpoint);
    bool partial_precommit_rollback =
        only_checkpoint > 0 ||
        (current_exact &&
         gate_partial_precommit_rollback_recovers(
             argv[1],
             current_fd,
             current_sha256,
             self_path,
             argv[3]));
    int current_close_rc =
        current_fd >= 0 ? close(current_fd) : 0;
    crash_matrix =
        crash_matrix && current_close_rc == 0;
    if (!generated_rejected ||
        !report_rejected ||
        !race_rolled_back ||
        !final_rejected ||
        !foreign_pending_preserved ||
        !partial_precommit_rollback ||
        !crash_matrix) {
        fprintf(
            stderr,
            "generated=%d report=%d race=%d final=%d pending=%d partial_rollback=%d crash=%d\n",
            generated_rejected ? 1 : 0,
            report_rejected ? 1 : 0,
            race_rolled_back ? 1 : 0,
            final_rejected ? 1 : 0,
            foreign_pending_preserved ? 1 : 0,
            partial_precommit_rollback ? 1 : 0,
            crash_matrix ? 1 : 0);
        return 66;
    }
    puts("cold_bootstrap_atomic_publication_helper_status=PASS");
    printf(
        "cold_bootstrap_atomic_publication_helper_mutations=%d\n",
        only_checkpoint > 0 ? 7 : 32);
    return 0;
}
#endif
