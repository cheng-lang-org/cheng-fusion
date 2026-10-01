#ifndef __APPLE__
#ifndef _GNU_SOURCE
#define _GNU_SOURCE 1
#endif
#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif
#endif

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>

/*
 * Test-only rename interposition.  It pauses after the real rename syscall
 * has committed one selected destination, before the production helper can
 * fsync or advance to the next map -> binary -> report transition.
 */
static int lifecycle_rename_event_fd = -1;
static char lifecycle_rename_pause_destination[PATH_MAX];
static int lifecycle_rename_pause_ordinal = 0;
static int lifecycle_rename_observed = 0;

static int lifecycle_intercepted_rename(const char *source,
                                        const char *destination) {
    int rc = renameat(
        AT_FDCWD, source, AT_FDCWD, destination);
    if (rc == 0 &&
        lifecycle_rename_event_fd >= 0 &&
        lifecycle_rename_pause_ordinal > 0 &&
        strcmp(destination,
               lifecycle_rename_pause_destination) == 0) {
        lifecycle_rename_observed++;
        if (lifecycle_rename_observed ==
            lifecycle_rename_pause_ordinal) {
            uint8_t event = 1;
            ssize_t written;
            do {
                written = write(
                    lifecycle_rename_event_fd,
                    &event, sizeof(event));
            } while (written < 0 && errno == EINTR);
            if (written != (ssize_t)sizeof(event))
                _exit(120);
            for (;;) pause();
        }
    }
    return rc;
}

#define rename lifecycle_intercepted_rename
#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#undef rename

static void lifecycle_fail(const char *reason) {
    fprintf(stderr,
            "build_backend_driver_staging_lifecycle_gate_error=%s\n",
            reason);
    exit(1);
}

static void lifecycle_path(char *out,
                           size_t cap,
                           const char *root,
                           const char *leaf) {
    int n = snprintf(out, cap, "%s/%s", root, leaf);
    if (n <= 0 || n >= (int)cap)
        lifecycle_fail("path_too_long");
}

static void lifecycle_write(const char *path,
                            const char *text,
                            mode_t mode) {
    if (!cold_write_text_file(path, text) ||
        chmod(path, mode) != 0)
        lifecycle_fail("fixture_write_failed");
}

static void lifecycle_require_absent(const char *path,
                                     const char *reason) {
    if (access(path, F_OK) == 0 || errno != ENOENT)
        lifecycle_fail(reason);
}

static void lifecycle_remove_fixture(const char *path,
                                     const char *reason) {
    struct stat identity;
    if (!path || lstat(path, &identity) != 0 ||
        !S_ISREG(identity.st_mode)) {
        lifecycle_fail(reason);
    }
    ColdOwnedStagingFile owned = {0};
    int copied = snprintf(
        owned.path, sizeof(owned.path), "%s", path);
    if (copied <= 0 ||
        copied >= (int)sizeof(owned.path)) {
        lifecycle_fail(reason);
    }
    owned.device = identity.st_dev;
    owned.inode = identity.st_ino;
    owned.owned = true;
    if (!cold_owned_staging_remove(&owned))
        lifecycle_fail(reason);
}

typedef struct LifecycleAbandonedClaim {
    char path[PATH_MAX];
    dev_t device;
    ino_t inode;
} LifecycleAbandonedClaim;

static bool lifecycle_fd_write_all(int fd,
                                   const void *data,
                                   size_t length) {
    const uint8_t *bytes = data;
    size_t offset = 0;
    while (offset < length) {
        ssize_t written =
            write(fd, bytes + offset, length - offset);
        if (written < 0 && errno == EINTR) continue;
        if (written <= 0) return false;
        offset += (size_t)written;
    }
    return true;
}

static bool lifecycle_fd_read_all(int fd,
                                  void *data,
                                  size_t length) {
    uint8_t *bytes = data;
    size_t offset = 0;
    while (offset < length) {
        ssize_t read_count =
            read(fd, bytes + offset, length - offset);
        if (read_count < 0 && errno == EINTR) continue;
        if (read_count <= 0) return false;
        offset += (size_t)read_count;
    }
    return true;
}

static void lifecycle_arm_rename_pause(int event_fd,
                                       const char *destination,
                                       int ordinal) {
    int copied;
    if (event_fd < 0 || !destination || !destination[0] ||
        ordinal <= 0)
        lifecycle_fail("rename_pause_invalid");
    copied = snprintf(
        lifecycle_rename_pause_destination,
        sizeof(lifecycle_rename_pause_destination),
        "%s", destination);
    if (copied <= 0 ||
        copied >=
            (int)sizeof(lifecycle_rename_pause_destination))
        lifecycle_fail("rename_pause_path_too_long");
    lifecycle_rename_event_fd = event_fd;
    lifecycle_rename_pause_ordinal = ordinal;
    lifecycle_rename_observed = 0;
}

static void lifecycle_disarm_rename_pause(void) {
    lifecycle_rename_event_fd = -1;
    lifecycle_rename_pause_destination[0] = '\0';
    lifecycle_rename_pause_ordinal = 0;
    lifecycle_rename_observed = 0;
}

static void lifecycle_kill_after_rename_event(
        pid_t child,
        int event_fd,
        const char *reason) {
    struct pollfd watched = {
        .fd = event_fd,
        .events = POLLIN,
        .revents = 0,
    };
    int poll_rc;
    do {
        poll_rc = poll(&watched, 1, 5000);
    } while (poll_rc < 0 && errno == EINTR);
    uint8_t event = 0;
    if (poll_rc != 1 ||
        (watched.revents & POLLIN) == 0 ||
        !lifecycle_fd_read_all(
            event_fd, &event, sizeof(event)) ||
        event != 1) {
        kill(child, SIGKILL);
        while (waitpid(child, NULL, 0) < 0 &&
               errno == EINTR) {}
        lifecycle_fail(reason);
    }
    if (kill(child, SIGKILL) != 0)
        lifecycle_fail(reason);
    int status = 0;
    pid_t waited;
    do {
        waited = waitpid(child, &status, 0);
    } while (waited < 0 && errno == EINTR);
    if (waited != child ||
        !WIFSIGNALED(status) ||
        WTERMSIG(status) != SIGKILL)
        lifecycle_fail(reason);
}

static void lifecycle_require_contains(const char *path,
                                       const char *text,
                                       const char *reason) {
    if (!cold_file_contains_text(path, text))
        lifecycle_fail(reason);
}

static void lifecycle_require_regular(const char *path,
                                      const char *reason) {
    struct stat identity;
    if (lstat(path, &identity) != 0 ||
        !S_ISREG(identity.st_mode))
        lifecycle_fail(reason);
}

static void lifecycle_owned_from_path(
        ColdOwnedStagingFile *owned,
        const char *path,
        const char *reason) {
    struct stat identity;
    if (!owned || !path ||
        lstat(path, &identity) != 0 ||
        !S_ISREG(identity.st_mode))
        lifecycle_fail(reason);
    memset(owned, 0, sizeof(*owned));
    int copied = snprintf(
        owned->path, sizeof(owned->path), "%s", path);
    if (copied <= 0 ||
        copied >= (int)sizeof(owned->path))
        lifecycle_fail(reason);
    owned->device = identity.st_dev;
    owned->inode = identity.st_ino;
    owned->owned = true;
}

static void lifecycle_child_staging_path(
        char *out,
        size_t cap,
        const char *installed,
        pid_t child) {
    int length = snprintf(
        out, cap, "%s.installing-%ld",
        installed, (long)child);
    if (length <= 0 || length >= (int)cap)
        lifecycle_fail("child_staging_path_too_long");
}

static LifecycleAbandonedClaim lifecycle_abandon_claim(
        const char *canonical_path,
        bool partial_write) {
    int channel[2];
    if (pipe(channel) != 0)
        lifecycle_fail("claim_crash_pipe_failed");
    pid_t child = fork();
    if (child < 0)
        lifecycle_fail("claim_crash_fork_failed");
    if (child == 0) {
        close(channel[0]);
        ColdOwnedStagingFile claim = {0};
        ColdInstallLockRecord record;
        int claim_fd = -1;
        if (!cold_install_lock_claim_open(
                &claim, &record,
                canonical_path, &claim_fd)) {
            _exit(81);
        }
        if (partial_write) {
            static const char partial_record[] =
                "schema=cheng.backend_driver.install_lock\n"
                "owner_pid=";
            if (!cold_resource_diagnostic_write_all(
                    claim_fd, partial_record,
                    sizeof(partial_record) - 1) ||
                fsync(claim_fd) != 0) {
                _exit(82);
            }
        }
        LifecycleAbandonedClaim message = {0};
        int copied = snprintf(
            message.path, sizeof(message.path),
            "%s", claim.path);
        if (copied <= 0 ||
            copied >= (int)sizeof(message.path)) {
            _exit(83);
        }
        message.device = claim.device;
        message.inode = claim.inode;
        if (!lifecycle_fd_write_all(
                channel[1], &message, sizeof(message))) {
            _exit(84);
        }
        _exit(0);
    }
    close(channel[1]);
    LifecycleAbandonedClaim message = {0};
    bool received = lifecycle_fd_read_all(
        channel[0], &message, sizeof(message));
    int close_rc = close(channel[0]);
    int status = 0;
    if (!received || close_rc != 0 ||
        waitpid(child, &status, 0) != child ||
        !WIFEXITED(status) ||
        WEXITSTATUS(status) != 0) {
        lifecycle_fail("claim_crash_child_failed");
    }
    return message;
}

static void lifecycle_remove_abandoned_claim(
        const LifecycleAbandonedClaim *claim,
        const char *reason) {
    if (!claim || !claim->path[0])
        lifecycle_fail(reason);
    ColdOwnedStagingFile owned = {0};
    int copied = snprintf(
        owned.path, sizeof(owned.path),
        "%s", claim->path);
    if (copied <= 0 ||
        copied >= (int)sizeof(owned.path)) {
        lifecycle_fail(reason);
    }
    owned.device = claim->device;
    owned.inode = claim->inode;
    owned.owned = true;
    if (!cold_owned_staging_remove(&owned))
        lifecycle_fail(reason);
}

static void lifecycle_run_success(const char *root) {
    char next_path[PATH_MAX];
    char next_map[PATH_MAX];
    char next_report[PATH_MAX];
    char compiler_path[PATH_MAX];
    char compiler_map[PATH_MAX];
    char compiler_report[PATH_MAX];
    lifecycle_path(next_path, sizeof(next_path),
                   root, "compiler_main.direct.next");
    lifecycle_path(next_map, sizeof(next_map),
                   root, "compiler_main.direct.next.map");
    lifecycle_path(next_report, sizeof(next_report),
                   root, "compiler_main.direct.next.report.txt");
    lifecycle_path(compiler_path, sizeof(compiler_path),
                   root, "compiler_main.direct");
    lifecycle_path(compiler_map, sizeof(compiler_map),
                   root, "compiler_main.direct.map");
    lifecycle_path(compiler_report, sizeof(compiler_report),
                   root, "compiler_main.direct.report.txt");
    lifecycle_write(next_path, "pass-b-binary\n", 0755);
    lifecycle_write(next_map, "pass-b-map\n", 0644);
    char stale_next_report[PATH_MAX * 3];
    int stale_report_length = snprintf(
        stale_next_report, sizeof(stale_next_report),
        "full_backend_codegen=1\n"
        "system_link_exec_scope=selfhost_direct\n"
        "output=%s\n"
        "output_map=%s\n"
        "output_sha256=stale-next-binary-sha\n"
        "output_map_sha256=stale-next-map-sha\n",
        next_path, next_map);
    if (stale_report_length <= 0 ||
        stale_report_length >= (int)sizeof(stale_next_report))
        lifecycle_fail("pass_b_stale_report_shape_failed");
    lifecycle_write(next_report, stale_next_report, 0644);
    lifecycle_write(compiler_path, "old-binary\n", 0755);
    lifecycle_write(compiler_map, "old-map\n", 0644);
    lifecycle_write(compiler_report, "old-report\n", 0644);
    if (!cold_install_pass_b_staging(
            next_path, next_map, next_report,
            compiler_path, compiler_map, compiler_report,
            true, NULL, NULL, NULL))
        lifecycle_fail("pass_b_success_install_failed");
    lifecycle_require_absent(
        next_path, "pass_b_success_binary_fragment");
    lifecycle_require_absent(
        next_map, "pass_b_success_map_fragment");
    lifecycle_require_absent(
        next_report, "pass_b_success_report_fragment");
    if (!cold_file_contains_text(
            compiler_path, "pass-b-binary\n") ||
        !cold_file_contains_text(
            compiler_map, "pass-b-map\n") ||
        !cold_file_contains_text(
            compiler_report, "full_backend_codegen=1\n") ||
        !cold_backend_driver_report_matches_installed(
            compiler_report, compiler_path, compiler_map) ||
        cold_file_contains_text(
            compiler_report, next_path) ||
        cold_file_contains_text(
            compiler_report, next_map) ||
        access(compiler_path, X_OK) != 0)
        lifecycle_fail("pass_b_success_install_content_mismatch");

    char staging_binary[PATH_MAX];
    char staging_map[PATH_MAX];
    char staging_report[PATH_MAX];
    char installed_binary[PATH_MAX];
    char installed_map[PATH_MAX];
    char installed_report[PATH_MAX];
    lifecycle_path(staging_binary, sizeof(staging_binary),
                   root, "cheng.installing");
    lifecycle_path(staging_map, sizeof(staging_map),
                   root, "cheng.map.installing");
    lifecycle_path(staging_report, sizeof(staging_report),
                   root, "cheng.report.txt.installing");
    lifecycle_path(installed_binary, sizeof(installed_binary),
                   root, "cheng");
    lifecycle_path(installed_map, sizeof(installed_map),
                   root, "cheng.map");
    lifecycle_path(installed_report, sizeof(installed_report),
                   root, "cheng.report.txt");
    lifecycle_write(installed_binary, "old-official\n", 0755);
    lifecycle_write(installed_map, "old-official-map\n", 0644);
    lifecycle_write(installed_report, "old-official-report\n", 0644);
    ColdOwnedStagingFile owned_binary = {0};
    ColdOwnedStagingFile owned_map = {0};
    ColdOwnedStagingFile owned_report = {0};
    if (!cold_owned_staging_create(
            &owned_binary, staging_binary,
            (const uint8_t *)"official-binary\n",
            strlen("official-binary\n"), 0755) ||
        !cold_owned_staging_create(
            &owned_map, staging_map,
            (const uint8_t *)"official-map\n",
            strlen("official-map\n"), 0644))
        lifecycle_fail("official_owned_staging_create_failed");
    char binary_sha256[65];
    char map_sha256[65];
    if (!cold_file_sha256_hex(staging_binary, binary_sha256) ||
        !cold_file_sha256_hex(staging_map, map_sha256))
        lifecycle_fail("official_owned_staging_hash_failed");
    char report_text[PATH_MAX * 3];
    int report_length = snprintf(
        report_text, sizeof(report_text),
        "backend_driver_candidate=full_backend_codegen\n"
        "output=%s\n"
        "output_map=%s\n"
        "output_sha256=%s\n"
        "output_map_sha256=%s\n",
        installed_binary, installed_map,
        binary_sha256, map_sha256);
    if (report_length <= 0 ||
        report_length >= (int)sizeof(report_text) ||
        !cold_owned_staging_create(
            &owned_report, staging_report,
            (const uint8_t *)report_text,
            (size_t)report_length,
            0644))
        lifecycle_fail("official_owned_staging_create_failed");
    if (!cold_write_text_file_atomic_replace(
            installed_report,
            "full_backend_codegen=0\n"
            "gate_blocked=1\n"
            "gate_blocker_id=backend_driver_atomic_install_in_progress\n"))
        lifecycle_fail("official_success_red_report_write_failed");
    if (!cold_commit_backend_driver_staging(
            &owned_binary, &owned_map, &owned_report,
            installed_binary, installed_map, installed_report))
        lifecycle_fail("official_success_commit_failed");
    lifecycle_require_absent(
        staging_binary, "official_success_binary_fragment");
    lifecycle_require_absent(
        staging_map, "official_success_map_fragment");
    lifecycle_require_absent(
        staging_report, "official_success_report_fragment");
    if (!cold_file_contains_text(
            installed_binary, "official-binary\n") ||
        !cold_file_contains_text(
            installed_map, "official-map\n") ||
        !cold_file_contains_text(
            installed_report,
            "backend_driver_candidate=full_backend_codegen\n") ||
        !cold_backend_driver_report_matches_installed(
            installed_report, installed_binary, installed_map))
        lifecycle_fail("official_success_content_mismatch");
    puts("build_backend_driver_staging_lifecycle=success_zero_fragments");
    puts("build_backend_driver_staging_direct_report=final_path_sha_unique");
    puts("build_backend_driver_staging_official_report=final_path_sha_unique");
    puts("build_backend_driver_staging_parent_durability=fsync_after_rename");
}

static void lifecycle_run_failure(const char *root) {
    char foreign_preexisting_next[PATH_MAX];
    char foreign_preexisting_map[PATH_MAX];
    char foreign_preexisting_report[PATH_MAX];
    lifecycle_path(
        foreign_preexisting_next,
        sizeof(foreign_preexisting_next),
        root, "foreign-preexisting.next");
    lifecycle_path(
        foreign_preexisting_map,
        sizeof(foreign_preexisting_map),
        root, "foreign-preexisting.next.map");
    lifecycle_path(
        foreign_preexisting_report,
        sizeof(foreign_preexisting_report),
        root, "foreign-preexisting.next.report.txt");
    lifecycle_write(
        foreign_preexisting_next,
        "foreign-preexisting\n", 0755);
    lifecycle_write(
        foreign_preexisting_map,
        "foreign-preexisting-map\n", 0644);
    lifecycle_write(
        foreign_preexisting_report,
        "foreign-preexisting-report\n", 0644);
    if (cold_pass_b_staging_paths_absent(
            foreign_preexisting_next,
            foreign_preexisting_map,
            foreign_preexisting_report) ||
        !cold_file_contains_text(
            foreign_preexisting_next,
            "foreign-preexisting\n") ||
        cold_write_pass_b_honest_failure_record(
            foreign_preexisting_report,
            "/foreign/compiler",
            "/foreign/source.cheng",
            "arm64-apple-darwin",
            127,
            "must not overwrite foreign report") ||
        !cold_file_contains_text(
            foreign_preexisting_report,
            "foreign-preexisting-report\n")) {
        lifecycle_fail(
            "pass_b_foreign_preexisting_mutated");
    }
    lifecycle_remove_fixture(
        foreign_preexisting_next,
        "pass_b_foreign_preexisting_cleanup_failed");
    lifecycle_remove_fixture(
        foreign_preexisting_map,
        "pass_b_foreign_preexisting_map_cleanup_failed");
    lifecycle_remove_fixture(
        foreign_preexisting_report,
        "pass_b_foreign_preexisting_report_cleanup_failed");
    char captured_next[PATH_MAX];
    char captured_next_moved[PATH_MAX];
    lifecycle_path(
        captured_next, sizeof(captured_next),
        root, "captured-child.next");
    lifecycle_path(
        captured_next_moved,
        sizeof(captured_next_moved),
        root, "captured-child.next.moved");
    lifecycle_write(
        captured_next, "captured-child\n", 0755);
    ColdOwnedStagingFile captured_child = {0};
    ColdOwnedStagingFile absent_map = {0};
    if (!cold_owned_staging_capture_if_present(
            &captured_child, captured_next) ||
        renameat(
            AT_FDCWD, captured_next,
            AT_FDCWD, captured_next_moved) != 0 ||
        !cold_fsync_parent_directory(captured_next)) {
        lifecycle_fail(
            "pass_b_capture_swap_setup_failed");
    }
    lifecycle_write(
        captured_next, "foreign-after-capture\n", 0755);
    if (cold_remove_captured_pass_b_executable_staging(
            &captured_child, &absent_map) ||
        !cold_file_contains_text(
            captured_next, "foreign-after-capture\n")) {
        lifecycle_fail(
            "pass_b_capture_swap_deleted_foreign");
    }
    lifecycle_remove_fixture(
        captured_next,
        "pass_b_capture_foreign_cleanup_failed");
    int captured_moved_length = snprintf(
        captured_child.path,
        sizeof(captured_child.path),
        "%s", captured_next_moved);
    if (captured_moved_length <= 0 ||
        captured_moved_length >=
            (int)sizeof(captured_child.path) ||
        !cold_owned_staging_remove(&captured_child)) {
        lifecycle_fail(
            "pass_b_capture_owner_cleanup_failed");
    }
    char retry_next[PATH_MAX];
    char retry_map[PATH_MAX];
    char retry_report[PATH_MAX];
    char retry_canonical_report[PATH_MAX];
    lifecycle_path(
        retry_next, sizeof(retry_next),
        root, "retry.direct.next");
    lifecycle_path(
        retry_map, sizeof(retry_map),
        root, "retry.direct.next.map");
    lifecycle_path(
        retry_report, sizeof(retry_report),
        root, "retry.direct.next.report.txt");
    lifecycle_path(
        retry_canonical_report,
        sizeof(retry_canonical_report),
        root, "retry.direct.report.txt");
    lifecycle_write(
        retry_report,
        "gate_blocked=1\n"
        "error=first failure\n",
        0644);
    ColdOwnedStagingFile retry_owned_report = {0};
    if (!cold_owned_staging_capture_if_present(
            &retry_owned_report, retry_report) ||
        !cold_promote_pass_b_failure_report(
            &retry_owned_report,
            retry_canonical_report) ||
        !cold_pass_b_staging_paths_absent(
            retry_next, retry_map, retry_report) ||
        !cold_file_contains_text(
            retry_canonical_report,
            "full_backend_codegen=0\n") ||
        !cold_file_contains_text(
            retry_canonical_report,
            "pass_b_staging_report_encoding=hex\n") ||
        !cold_file_contains_text(
            retry_canonical_report,
            "pass_b_staging_report_hex=676174655f626c6f636b65643d310a6572726f723d6669727374206661696c7572650a\n")) {
        lifecycle_fail(
            "pass_b_failure_retry_not_recoverable");
    }
    char empty_next[PATH_MAX];
    char empty_map[PATH_MAX];
    char empty_report[PATH_MAX];
    char empty_canonical[PATH_MAX];
    lifecycle_path(
        empty_next, sizeof(empty_next),
        root, "empty.direct.next");
    lifecycle_path(
        empty_map, sizeof(empty_map),
        root, "empty.direct.next.map");
    lifecycle_path(
        empty_report, sizeof(empty_report),
        root, "empty.direct.next.report.txt");
    lifecycle_path(
        empty_canonical, sizeof(empty_canonical),
        root, "empty.direct.report.txt");
    static const uint8_t empty_payload[1] = {0};
    if (!cold_write_file_bytes(
            empty_report, empty_payload, 0)) {
        lifecycle_fail(
            "pass_b_empty_report_create_failed");
    }
    ColdOwnedStagingFile empty_owned = {0};
    if (!cold_owned_staging_capture_if_present(
            &empty_owned, empty_report) ||
        !cold_promote_pass_b_failure_report(
            &empty_owned, empty_canonical) ||
        !cold_pass_b_staging_paths_absent(
            empty_next, empty_map, empty_report) ||
        !cold_file_contains_text(
            empty_canonical,
            "pass_b_staging_report_bytes=0\n") ||
        !cold_file_contains_text(
            empty_canonical,
            "pass_b_staging_report_hex=\n")) {
        lifecycle_fail(
            "pass_b_empty_report_retry_not_recoverable");
    }
    char nul_next[PATH_MAX];
    char nul_map[PATH_MAX];
    char nul_report[PATH_MAX];
    char nul_canonical[PATH_MAX];
    lifecycle_path(
        nul_next, sizeof(nul_next),
        root, "nul.direct.next");
    lifecycle_path(
        nul_map, sizeof(nul_map),
        root, "nul.direct.next.map");
    lifecycle_path(
        nul_report, sizeof(nul_report),
        root, "nul.direct.next.report.txt");
    lifecycle_path(
        nul_canonical, sizeof(nul_canonical),
        root, "nul.direct.report.txt");
    static const uint8_t nul_payload[] = {
        'x', 0, 'y', '\n'
    };
    if (!cold_write_file_bytes(
            nul_report, nul_payload,
            sizeof(nul_payload))) {
        lifecycle_fail(
            "pass_b_nul_report_create_failed");
    }
    ColdOwnedStagingFile nul_owned = {0};
    if (!cold_owned_staging_capture_if_present(
            &nul_owned, nul_report) ||
        !cold_promote_pass_b_failure_report(
            &nul_owned, nul_canonical) ||
        !cold_pass_b_staging_paths_absent(
            nul_next, nul_map, nul_report) ||
        !cold_file_contains_text(
            nul_canonical,
            "pass_b_staging_report_bytes=4\n") ||
        !cold_file_contains_text(
            nul_canonical,
            "pass_b_staging_report_hex=7800790a\n")) {
        lifecycle_fail(
            "pass_b_nul_report_retry_not_recoverable");
    }
    char same_bytes_report[PATH_MAX];
    char same_bytes_moved[PATH_MAX];
    char same_bytes_canonical[PATH_MAX];
    lifecycle_path(
        same_bytes_report, sizeof(same_bytes_report),
        root, "same-bytes.next.report.txt");
    lifecycle_path(
        same_bytes_moved, sizeof(same_bytes_moved),
        root, "same-bytes.next.report.moved");
    lifecycle_path(
        same_bytes_canonical,
        sizeof(same_bytes_canonical),
        root, "same-bytes.report.txt");
    static const char same_bytes_text[] =
        "gate_blocked=1\n"
        "error=same bytes\n";
    lifecycle_write(
        same_bytes_report, same_bytes_text, 0644);
    ColdOwnedStagingFile same_bytes_owned = {0};
    if (!cold_owned_staging_capture_if_present(
            &same_bytes_owned, same_bytes_report) ||
        renameat(
            AT_FDCWD, same_bytes_report,
            AT_FDCWD, same_bytes_moved) != 0 ||
        !cold_fsync_parent_directory(
            same_bytes_report)) {
        lifecycle_fail(
            "pass_b_same_bytes_swap_setup_failed");
    }
    lifecycle_write(
        same_bytes_report, same_bytes_text, 0644);
    if (cold_promote_pass_b_failure_report(
            &same_bytes_owned,
            same_bytes_canonical) ||
        !cold_file_contains_text(
            same_bytes_report,
            "error=same bytes\n") ||
        cold_file_exists_nonempty(
            same_bytes_canonical)) {
        lifecycle_fail(
            "pass_b_same_bytes_foreign_deleted");
    }
    lifecycle_remove_fixture(
        same_bytes_report,
        "pass_b_same_bytes_foreign_cleanup_failed");
    int same_bytes_moved_length = snprintf(
        same_bytes_owned.path,
        sizeof(same_bytes_owned.path),
        "%s", same_bytes_moved);
    if (same_bytes_moved_length <= 0 ||
        same_bytes_moved_length >=
            (int)sizeof(same_bytes_owned.path) ||
        !cold_owned_staging_remove(
            &same_bytes_owned)) {
        lifecycle_fail(
            "pass_b_same_bytes_owner_cleanup_failed");
    }
    lifecycle_remove_fixture(
        retry_canonical_report,
        "pass_b_retry_canonical_cleanup_failed");
    lifecycle_remove_fixture(
        empty_canonical,
        "pass_b_empty_canonical_cleanup_failed");
    lifecycle_remove_fixture(
        nul_canonical,
        "pass_b_nul_canonical_cleanup_failed");

    char next_path[PATH_MAX];
    char next_map[PATH_MAX];
    char next_report[PATH_MAX];
    char compiler_path[PATH_MAX];
    char compiler_map[PATH_MAX];
    char compiler_report[PATH_MAX];
    lifecycle_path(next_path, sizeof(next_path),
                   root, "compiler_main.direct.next");
    lifecycle_path(next_map, sizeof(next_map),
                   root, "compiler_main.direct.next.map");
    lifecycle_path(next_report, sizeof(next_report),
                   root, "compiler_main.direct.next.report.txt");
    lifecycle_path(compiler_path, sizeof(compiler_path),
                   root, "blocked-destination");
    lifecycle_path(compiler_map, sizeof(compiler_map),
                   root, "compiler_main.direct.map");
    lifecycle_path(compiler_report, sizeof(compiler_report),
                   root, "compiler_main.direct.report.txt");
    lifecycle_write(next_path, "failed-pass-b-binary\n", 0755);
    lifecycle_write(next_map, "failed-pass-b-map\n", 0644);
    lifecycle_write(next_report,
                    "gate_blocked=1\n"
                    "error=fixture_pass_b_failure\n",
                    0644);
    if (!cold_mkdir_p(compiler_path))
        lifecycle_fail("blocked_destination_create_failed");
    char blocker[PATH_MAX];
    lifecycle_path(blocker, sizeof(blocker),
                   compiler_path, "nonempty");
    lifecycle_write(blocker, "block\n", 0644);
    if (cold_install_pass_b_staging(
            next_path, next_map, next_report,
            compiler_path, compiler_map, compiler_report,
            true, NULL, NULL, NULL))
        lifecycle_fail("pass_b_failure_was_installed");
    lifecycle_require_absent(
        next_path, "pass_b_failure_executable_fragment");
    lifecycle_require_absent(
        next_map, "pass_b_failure_map_fragment");
    lifecycle_require_absent(
        next_report, "pass_b_failure_report_fragment");
    if (!cold_file_contains_text(
            compiler_report, "full_backend_codegen=0\n") ||
        !cold_file_contains_text(
            compiler_report,
            "gate_blocker_id=pass_b_atomic_install_in_progress\n") ||
        cold_file_contains_text(
            compiler_report, "full_backend_codegen=1\n"))
        lifecycle_fail("pass_b_partial_install_not_red");
    if (!cold_write_backend_driver_failure_report(
            root,
            "arm64-apple-darwin",
            "full_backend_generated_install_failed",
            "full_backend_codegen_install_generated_compiler",
            "src/core/tooling/backend_driver_dispatch_min.cheng",
            compiler_report,
            next_path,
            next_map,
            "fixture generated compiler install failed"))
        lifecycle_fail("outer_blocker_report_write_failed");
    char outer_report[PATH_MAX];
    lifecycle_path(outer_report, sizeof(outer_report),
                   root, "artifacts/backend_driver/cheng.report.txt");
    char nested_report_sha256[65];
    char nested_report_sha_line[96];
    if (!cold_file_sha256_hex(
            compiler_report, nested_report_sha256) ||
        snprintf(nested_report_sha_line,
                 sizeof(nested_report_sha_line),
                 "gate_blocker_report_sha256=%s\n",
                 nested_report_sha256) <= 0)
        lifecycle_fail("nested_blocker_hash_failed");
    if (!cold_file_contains_text(
            outer_report,
            "gate_blocker_id=full_backend_generated_install_failed\n") ||
        !cold_file_contains_text(
            outer_report, nested_report_sha_line) ||
        !cold_file_contains_text(
            outer_report, "gate_blocker_report_exists=1\n") ||
        !cold_file_contains_text(
            outer_report, "gate_blocker_artifact_exists=0\n") ||
        !cold_file_contains_text(
            outer_report, "gate_blocker_map_exists=0\n"))
        lifecycle_fail("outer_blocker_report_not_bound");

    char staging_binary[PATH_MAX];
    char staging_map[PATH_MAX];
    char staging_report[PATH_MAX];
    char installed_binary[PATH_MAX];
    char installed_map[PATH_MAX];
    char installed_report[PATH_MAX];
    lifecycle_path(staging_binary, sizeof(staging_binary),
                   root, "official.installing");
    lifecycle_path(staging_map, sizeof(staging_map),
                   root, "official.map.installing");
    lifecycle_path(staging_report, sizeof(staging_report),
                   root, "official.report.installing");
    lifecycle_path(installed_binary, sizeof(installed_binary),
                   root, "blocked-official");
    lifecycle_path(installed_map, sizeof(installed_map),
                   root, "official.map");
    lifecycle_path(installed_report, sizeof(installed_report),
                   root, "official.report");
    ColdOwnedStagingFile owned_binary = {0};
    ColdOwnedStagingFile owned_map = {0};
    ColdOwnedStagingFile owned_report = {0};
    if (!cold_owned_staging_create(
            &owned_binary, staging_binary,
            (const uint8_t *)"candidate-binary\n",
            strlen("candidate-binary\n"), 0755) ||
        !cold_owned_staging_create(
            &owned_map, staging_map,
            (const uint8_t *)"candidate-map\n",
            strlen("candidate-map\n"), 0644) ||
        !cold_owned_staging_create(
            &owned_report, staging_report,
            (const uint8_t *)"candidate-report\n",
            strlen("candidate-report\n"), 0644))
        lifecycle_fail("official_failure_staging_create_failed");
    if (!cold_mkdir_p(installed_binary))
        lifecycle_fail("blocked_official_create_failed");
    lifecycle_path(blocker, sizeof(blocker),
                   installed_binary, "nonempty");
    lifecycle_write(blocker, "block\n", 0644);
    if (!cold_write_text_file_atomic_replace(
            installed_report,
            "full_backend_codegen=0\n"
            "gate_blocked=1\n"
            "gate_blocker_id=backend_driver_atomic_install_in_progress\n"))
        lifecycle_fail("official_failure_red_report_write_failed");
    if (cold_commit_backend_driver_staging(
            &owned_binary, &owned_map, &owned_report,
            installed_binary, installed_map, installed_report))
        lifecycle_fail("official_failure_was_committed");
    lifecycle_require_absent(
        staging_binary, "official_failure_executable_fragment");
    lifecycle_require_absent(
        staging_map, "official_failure_map_fragment");
    lifecycle_require_absent(
        staging_report, "official_failure_report_fragment");
    if (!cold_file_contains_text(
            installed_report, "full_backend_codegen=0\n") ||
        cold_file_contains_text(
            installed_report, "full_backend_codegen=1\n"))
        lifecycle_fail("map_before_binary_failure_not_red");

    char foreign_staging[PATH_MAX];
    char foreign_installed[PATH_MAX];
    lifecycle_path(foreign_installed, sizeof(foreign_installed),
                   root, "foreign-cheng");
    if (!cold_backend_driver_staging_path(
            foreign_staging, sizeof(foreign_staging),
            foreign_installed))
        lifecycle_fail("foreign_staging_path_failed");
    lifecycle_write(foreign_staging, "foreign-entry\n", 0755);
    ColdOwnedStagingFile rejected_foreign = {0};
    if (cold_owned_staging_create(
            &rejected_foreign, foreign_staging,
            (const uint8_t *)"replacement\n",
            strlen("replacement\n"), 0755) ||
        !cold_file_contains_text(
            foreign_staging, "foreign-entry\n"))
        lifecycle_fail("foreign_staging_was_reused_or_deleted");

    char swapped_staging[PATH_MAX];
    char swapped_moved[PATH_MAX];
    lifecycle_path(swapped_staging, sizeof(swapped_staging),
                   root, "swapped.installing");
    lifecycle_path(swapped_moved, sizeof(swapped_moved),
                   root, "swapped-owned-moved");
    ColdOwnedStagingFile swapped_owned = {0};
    if (!cold_owned_staging_create(
            &swapped_owned, swapped_staging,
            (const uint8_t *)"owned-entry\n",
            strlen("owned-entry\n"), 0755) ||
        rename(swapped_staging, swapped_moved) != 0)
        lifecycle_fail("staging_identity_swap_setup_failed");
    lifecycle_write(swapped_staging, "foreign-after-swap\n", 0755);
    if (cold_owned_staging_remove(&swapped_owned) ||
        !cold_file_contains_text(
            swapped_staging, "foreign-after-swap\n"))
        lifecycle_fail("staging_identity_swap_deleted_foreign");
    unlink(swapped_staging);
    unlink(swapped_moved);

    char second_staging_binary[PATH_MAX];
    char second_staging_map[PATH_MAX];
    char second_staging_report[PATH_MAX];
    char second_installed_binary[PATH_MAX];
    char second_installed_map[PATH_MAX];
    char second_installed_report[PATH_MAX];
    lifecycle_path(second_staging_binary,
                   sizeof(second_staging_binary),
                   root, "second-official.installing");
    lifecycle_path(second_staging_map,
                   sizeof(second_staging_map),
                   root, "second-official.map.installing");
    lifecycle_path(second_staging_report,
                   sizeof(second_staging_report),
                   root, "second-official.report.installing");
    lifecycle_path(second_installed_binary,
                   sizeof(second_installed_binary),
                   root, "second-official");
    lifecycle_path(second_installed_map,
                   sizeof(second_installed_map),
                   root, "second-official.map");
    lifecycle_path(second_installed_report,
                   sizeof(second_installed_report),
                   root, "second-official.report");
    ColdOwnedStagingFile second_binary = {0};
    ColdOwnedStagingFile second_map = {0};
    ColdOwnedStagingFile second_report = {0};
    if (!cold_owned_staging_create(
            &second_binary, second_staging_binary,
            (const uint8_t *)"second-binary\n",
            strlen("second-binary\n"), 0755) ||
        !cold_owned_staging_create(
            &second_map, second_staging_map,
            (const uint8_t *)"second-map\n",
            strlen("second-map\n"), 0644) ||
        !cold_owned_staging_create(
            &second_report, second_staging_report,
            (const uint8_t *)"second-green-report\n",
            strlen("second-green-report\n"), 0644) ||
        !cold_write_text_file_atomic_replace(
            second_installed_report,
            "full_backend_codegen=0\n"
            "gate_blocked=1\n"
            "gate_blocker_id=backend_driver_atomic_install_in_progress\n") ||
        !cold_owned_staging_rename(
            &second_map, second_installed_map) ||
        !cold_owned_staging_rename(
            &second_binary, second_installed_binary))
        lifecycle_fail("binary_before_report_setup_failed");
    if (!cold_file_contains_text(
            second_installed_report,
            "gate_blocker_id=backend_driver_atomic_install_in_progress\n") ||
        cold_file_contains_text(
            second_installed_report, "full_backend_codegen=1\n"))
        lifecycle_fail("binary_before_report_failure_not_red");
    if (!cold_owned_staging_remove(&second_report))
        lifecycle_fail("binary_before_report_staging_cleanup_failed");
    lifecycle_require_absent(
        second_staging_binary,
        "binary_before_report_binary_staging_fragment");
    lifecycle_require_absent(
        second_staging_map,
        "binary_before_report_map_staging_fragment");
    lifecycle_require_absent(
        second_staging_report,
        "binary_before_report_report_staging_fragment");

    char race_binary[PATH_MAX];
    char race_report[PATH_MAX];
    lifecycle_path(race_binary, sizeof(race_binary),
                   root, "race-official");
    lifecycle_path(race_report, sizeof(race_report),
                   root, "race-official.report.txt");
    lifecycle_write(race_binary, "race-old-binary\n", 0755);
    lifecycle_write(race_report,
                    "full_backend_codegen=1\n",
                    0644);
    ColdOwnedStagingFile first_lock = {0};
    ColdOwnedStagingFile second_lock = {0};
    ColdDestinationSnapshot race_before;
    char live_lock_sha_before[65];
    char live_lock_sha_after[65];
    if (!cold_install_lock_acquire(
            &first_lock, race_binary) ||
        !cold_file_sha256_hex(
            first_lock.path, live_lock_sha_before) ||
        !cold_destination_snapshot_capture(
            &race_before, race_binary))
        lifecycle_fail("official_race_first_lock_failed");
    if (cold_install_lock_acquire(
            &second_lock, race_binary) ||
        !cold_owned_staging_identity_current(&first_lock) ||
        !cold_file_sha256_hex(
            first_lock.path, live_lock_sha_after) ||
        strcmp(live_lock_sha_before,
               live_lock_sha_after) != 0)
        lifecycle_fail("official_race_second_lock_was_admitted");
    lifecycle_write(race_binary, "race-external-drift\n", 0755);
    if (cold_destination_snapshot_matches(&race_before))
        lifecycle_fail("official_destination_drift_was_not_detected");
    if (!cold_write_text_file_atomic_replace(
            race_report,
            "full_backend_codegen=0\n"
            "gate_blocked=1\n"
            "gate_blocker_id=backend_driver_destination_drift\n") ||
        cold_file_contains_text(
            race_report, "full_backend_codegen=1\n"))
        lifecycle_fail("official_destination_drift_not_red");
    if (!cold_install_lock_release(&first_lock))
        lifecycle_fail("official_race_lock_release_failed");

    const char *claim_crash_leaves[] = {
        "after-open-lock-official",
        "partial-write-lock-official",
    };
    for (size_t crash_case = 0;
         crash_case <
             sizeof(claim_crash_leaves) /
             sizeof(claim_crash_leaves[0]);
         crash_case++) {
        char crash_binary[PATH_MAX];
        char crash_lock_path[PATH_MAX];
        lifecycle_path(
            crash_binary, sizeof(crash_binary), root,
            claim_crash_leaves[crash_case]);
        if (!cold_install_lock_path(
                crash_lock_path,
                sizeof(crash_lock_path),
                crash_binary)) {
            lifecycle_fail("claim_crash_lock_path_failed");
        }
        LifecycleAbandonedClaim abandoned =
            lifecycle_abandon_claim(
                crash_lock_path, crash_case == 1);
        lifecycle_require_absent(
            crash_lock_path,
            "claim_crash_exposed_partial_canonical");
        struct stat abandoned_before;
        struct stat abandoned_after;
        ColdOwnedStagingFile crash_recovery_lock = {0};
        if (lstat(abandoned.path,
                  &abandoned_before) != 0 ||
            abandoned_before.st_dev !=
                abandoned.device ||
            abandoned_before.st_ino !=
                abandoned.inode ||
            !cold_install_lock_acquire(
                &crash_recovery_lock,
                crash_binary) ||
            !cold_install_lock_release(
                &crash_recovery_lock) ||
            lstat(abandoned.path,
                  &abandoned_after) != 0 ||
            abandoned_after.st_dev !=
                abandoned_before.st_dev ||
            abandoned_after.st_ino !=
                abandoned_before.st_ino ||
            abandoned_after.st_mode !=
                abandoned_before.st_mode ||
            abandoned_after.st_size !=
                abandoned_before.st_size) {
            lifecycle_fail(
                "claim_crash_blocked_or_mutated_foreign");
        }
        lifecycle_require_absent(
            crash_lock_path,
            "claim_crash_recovery_lock_fragment");
        lifecycle_remove_abandoned_claim(
            &abandoned,
            "claim_crash_cleanup_failed");
    }

    char stale_binary[PATH_MAX];
    lifecycle_path(stale_binary, sizeof(stale_binary),
                   root, "stale-dead-official");
    pid_t stale_owner = fork();
    if (stale_owner < 0)
        lifecycle_fail("stale_lock_fork_failed");
    if (stale_owner == 0) {
        ColdOwnedStagingFile abandoned_lock = {0};
        _exit(cold_install_lock_acquire(
                  &abandoned_lock, stale_binary)
                  ? 0
                  : 71);
    }
    int stale_status = 0;
    if (waitpid(stale_owner, &stale_status, 0) != stale_owner ||
        !WIFEXITED(stale_status) ||
        WEXITSTATUS(stale_status) != 0) {
        lifecycle_fail("stale_lock_owner_failed");
    }
    char stale_lock_path[PATH_MAX];
    if (!cold_install_lock_path(
            stale_lock_path, sizeof(stale_lock_path),
            stale_binary)) {
        lifecycle_fail("stale_lock_path_failed");
    }
    ColdInstallLockRecord stale_record;
    if (!cold_install_lock_load(
            stale_lock_path, stale_lock_path, 2,
            &stale_record, NULL) ||
        stale_record.owner_pid != stale_owner ||
        stale_record.owner_start_token == 0) {
        lifecycle_fail("stale_lock_record_invalid");
    }
    char stale_owner_path[PATH_MAX];
    if (!cold_install_lock_claim_path(
            stale_owner_path, sizeof(stale_owner_path),
            stale_lock_path, stale_record.owner_pid,
            stale_record.nonce)) {
        lifecycle_fail("stale_owner_path_failed");
    }
    ColdOwnedStagingFile recovered_lock = {0};
    if (!cold_install_lock_acquire(
            &recovered_lock, stale_binary) ||
        recovered_lock.lock_owner_pid != getpid() ||
        strcmp(recovered_lock.lock_nonce,
               stale_record.nonce) == 0 ||
        !cold_install_lock_release(&recovered_lock)) {
        lifecycle_fail("stale_dead_lock_not_recovered");
    }
    lifecycle_require_absent(
        stale_lock_path, "stale_recovered_lock_fragment");
    lifecycle_require_absent(
        stale_owner_path, "stale_owner_link_fragment");

    char foreign_lock_binary[PATH_MAX];
    char foreign_lock_path[PATH_MAX];
    lifecycle_path(
        foreign_lock_binary, sizeof(foreign_lock_binary),
        root, "foreign-lock-official");
    if (!cold_install_lock_path(
            foreign_lock_path, sizeof(foreign_lock_path),
            foreign_lock_binary)) {
        lifecycle_fail("foreign_lock_path_failed");
    }
    lifecycle_write(
        foreign_lock_path,
        "schema=foreign.install.lock\n"
        "owner=unknown\n",
        0600);
    char foreign_sha_before[65];
    char foreign_sha_after[65];
    ColdOwnedStagingFile foreign_lock = {0};
    if (!cold_file_sha256_hex(
            foreign_lock_path, foreign_sha_before) ||
        cold_install_lock_acquire(
            &foreign_lock, foreign_lock_binary) ||
        !cold_file_sha256_hex(
            foreign_lock_path, foreign_sha_after) ||
        strcmp(foreign_sha_before, foreign_sha_after) != 0) {
        lifecycle_fail("foreign_lock_was_recovered_or_changed");
    }
    lifecycle_remove_fixture(
        foreign_lock_path, "foreign_lock_cleanup_failed");

    char tamper_binary[PATH_MAX];
    lifecycle_path(tamper_binary, sizeof(tamper_binary),
                   root, "tamper-lock-official");
    ColdOwnedStagingFile tampered_lock = {0};
    if (!cold_install_lock_acquire(
            &tampered_lock, tamper_binary)) {
        lifecycle_fail("tamper_lock_acquire_failed");
    }
    lifecycle_write(
        tampered_lock.path,
        "schema=cheng.backend_driver.install_lock\n"
        "owner_pid=2\n"
        "transaction_nonce=tampered\n",
        0600);
    char tampered_sha_before[65];
    char tampered_sha_after[65];
    ColdOwnedStagingFile tampered_attempt = {0};
    if (!cold_file_sha256_hex(
            tampered_lock.path, tampered_sha_before) ||
        cold_install_lock_release(&tampered_lock) ||
        cold_install_lock_acquire(
            &tampered_attempt, tamper_binary) ||
        !cold_file_sha256_hex(
            tampered_lock.path, tampered_sha_after) ||
        strcmp(tampered_sha_before, tampered_sha_after) != 0) {
        lifecycle_fail("tampered_lock_was_released_or_changed");
    }
    lifecycle_remove_fixture(
        tampered_lock.path, "tampered_lock_cleanup_failed");
    lifecycle_remove_fixture(
        tampered_lock.lock_owner_path,
        "tampered_owner_cleanup_failed");

    char swapped_lock_binary[PATH_MAX];
    char swapped_lock_moved[PATH_MAX];
    lifecycle_path(
        swapped_lock_binary, sizeof(swapped_lock_binary),
        root, "inode-swap-lock-official");
    lifecycle_path(
        swapped_lock_moved, sizeof(swapped_lock_moved),
        root, "inode-swap-lock-moved");
    ColdOwnedStagingFile swapped_lock = {0};
    if (!cold_install_lock_acquire(
            &swapped_lock, swapped_lock_binary) ||
        rename(swapped_lock.path, swapped_lock_moved) != 0 ||
        !cold_fsync_parent_directory(swapped_lock.path)) {
        lifecycle_fail("inode_swap_lock_setup_failed");
    }
    lifecycle_write(
        swapped_lock.path,
        "schema=foreign.replacement.lock\n",
        0600);
    char swapped_foreign_sha_before[65];
    char swapped_foreign_sha_after[65];
    ColdOwnedStagingFile swapped_lock_attempt = {0};
    if (!cold_file_sha256_hex(
            swapped_lock.path,
            swapped_foreign_sha_before) ||
        cold_install_lock_release(&swapped_lock) ||
        cold_install_lock_acquire(
            &swapped_lock_attempt,
            swapped_lock_binary) ||
        !cold_file_sha256_hex(
            swapped_lock.path,
            swapped_foreign_sha_after) ||
        strcmp(swapped_foreign_sha_before,
               swapped_foreign_sha_after) != 0) {
        lifecycle_fail("inode_swap_lock_deleted_foreign");
    }
    lifecycle_remove_fixture(
        swapped_lock.path,
        "inode_swap_foreign_cleanup_failed");
    lifecycle_remove_fixture(
        swapped_lock_moved,
        "inode_swap_owned_cleanup_failed");
    lifecycle_remove_fixture(
        swapped_lock.lock_owner_path,
        "inode_swap_owner_cleanup_failed");

    puts("build_backend_driver_staging_lifecycle=failure_zero_executable_fragments");
    puts("build_backend_driver_staging_blocker=diagnosable");
    puts("build_backend_driver_staging_foreign_entry=hard_fail_preserved");
    puts("build_backend_driver_pass_b_preexisting_generation=hard_fail_preserved");
    puts("build_backend_driver_pass_b_captured_inode_swap=foreign_preserved");
    puts("build_backend_driver_pass_b_failure_retry=second_generation_admitted");
    puts("build_backend_driver_pass_b_malformed_failure_retry=empty_and_nul_second_generation_admitted");
    puts("build_backend_driver_pass_b_same_bytes_foreign=preserved");
    puts("build_backend_driver_staging_partial_commit=red_until_report_last");
    puts("build_backend_driver_staging_official_race=locked_and_drift_red");
    puts("build_backend_driver_install_lock=stale_dead_recovered_live_foreign_tamper_inode_swap_refused");
    puts("build_backend_driver_install_lock_atomic_visibility=after_open_partial_canonical_absent_foreign_preserved");
}

typedef enum LifecycleCrashPhase {
    LIFECYCLE_CRASH_AFTER_MAP = 0,
    LIFECYCLE_CRASH_AFTER_BINARY = 1,
    LIFECYCLE_CRASH_AFTER_REPORT = 2,
} LifecycleCrashPhase;

static const char *lifecycle_crash_phase_name(
        LifecycleCrashPhase phase) {
    switch (phase) {
        case LIFECYCLE_CRASH_AFTER_MAP: return "map";
        case LIFECYCLE_CRASH_AFTER_BINARY: return "binary";
        case LIFECYCLE_CRASH_AFTER_REPORT: return "report";
    }
    lifecycle_fail("crash_phase_invalid");
    return "";
}

static void lifecycle_recover_sigkill_lock(
        const char *installed_binary,
        pid_t dead_owner,
        const char *reason) {
    char lock_path[PATH_MAX];
    char owner_path[PATH_MAX];
    char ledger_path[PATH_MAX];
    ColdInstallLockRecord stale;
    struct stat lock_before;
    struct stat owner_before;
    struct stat ledger_before;
    if (!cold_install_lock_path(
            lock_path, sizeof(lock_path),
            installed_binary) ||
        !cold_install_lock_load(
            lock_path, lock_path, 2,
            &stale, &lock_before) ||
        stale.owner_pid != dead_owner ||
        stale.owner_start_token == 0 ||
        !cold_install_lock_claim_path(
            owner_path, sizeof(owner_path),
            lock_path, stale.owner_pid,
            stale.nonce) ||
        !cold_install_staging_ledger_path(
            ledger_path, sizeof(ledger_path),
            lock_path, &stale) ||
        lstat(owner_path, &owner_before) != 0 ||
        lstat(ledger_path, &ledger_before) != 0 ||
        lock_before.st_dev != owner_before.st_dev ||
        lock_before.st_ino != owner_before.st_ino ||
        stale.staging_ledger_device !=
            ledger_before.st_dev ||
        stale.staging_ledger_inode !=
            ledger_before.st_ino) {
        lifecycle_fail(reason);
    }
    lifecycle_require_regular(ledger_path, reason);
    ColdOwnedStagingFile recovered = {0};
    if (!cold_install_lock_acquire(
            &recovered, installed_binary) ||
        recovered.lock_owner_pid != getpid() ||
        strcmp(recovered.lock_nonce, stale.nonce) == 0 ||
        !cold_install_lock_release(&recovered)) {
        lifecycle_fail(reason);
    }
    lifecycle_require_absent(lock_path, reason);
    lifecycle_require_absent(owner_path, reason);
    lifecycle_require_absent(ledger_path, reason);
}

static void lifecycle_run_pass_b_sigkill_case(
        const char *root,
        LifecycleCrashPhase phase) {
    char leaf[64];
    int leaf_length = snprintf(
        leaf, sizeof(leaf), "pass-b-kill-%s",
        lifecycle_crash_phase_name(phase));
    if (leaf_length <= 0 ||
        leaf_length >= (int)sizeof(leaf))
        lifecycle_fail("pass_b_kill_leaf_invalid");
    char case_root[PATH_MAX];
    lifecycle_path(
        case_root, sizeof(case_root), root, leaf);
    if (!cold_mkdir_p(case_root))
        lifecycle_fail("pass_b_kill_root_create_failed");

    char next_path[PATH_MAX];
    char next_map[PATH_MAX];
    char next_report[PATH_MAX];
    char compiler_path[PATH_MAX];
    char compiler_map[PATH_MAX];
    char compiler_report[PATH_MAX];
    lifecycle_path(next_path, sizeof(next_path),
                   case_root, "compiler_main.direct.next");
    lifecycle_path(next_map, sizeof(next_map),
                   case_root, "compiler_main.direct.next.map");
    lifecycle_path(next_report, sizeof(next_report),
                   case_root,
                   "compiler_main.direct.next.report.txt");
    lifecycle_path(compiler_path, sizeof(compiler_path),
                   case_root, "compiler_main.direct");
    lifecycle_path(compiler_map, sizeof(compiler_map),
                   case_root, "compiler_main.direct.map");
    lifecycle_path(compiler_report, sizeof(compiler_report),
                   case_root,
                   "compiler_main.direct.report.txt");
    lifecycle_write(next_path, "pass-b-new-binary\n", 0755);
    lifecycle_write(next_map, "pass-b-new-map\n", 0644);
    char next_report_text[PATH_MAX * 3];
    int report_length = snprintf(
        next_report_text, sizeof(next_report_text),
        "real_backend_codegen=1\n"
        "full_backend_codegen=1\n"
        "cold_system_link_exec=0\n"
        "system_link_exec_scope=selfhost_direct\n"
        "output=%s\n"
        "output_map=%s\n"
        "output_sha256=staging-binary-sha\n"
        "output_map_sha256=staging-map-sha\n",
        next_path, next_map);
    if (report_length <= 0 ||
        report_length >= (int)sizeof(next_report_text))
        lifecycle_fail("pass_b_kill_report_invalid");
    lifecycle_write(
        next_report, next_report_text, 0644);
    lifecycle_write(
        compiler_path, "pass-b-old-binary\n", 0755);
    lifecycle_write(
        compiler_map, "pass-b-old-map\n", 0644);
    lifecycle_write(
        compiler_report, "pass-b-old-report\n", 0644);

    const char *pause_destination =
        phase == LIFECYCLE_CRASH_AFTER_MAP
            ? compiler_map
            : phase == LIFECYCLE_CRASH_AFTER_BINARY
                ? compiler_path
                : compiler_report;
    int pause_ordinal =
        phase == LIFECYCLE_CRASH_AFTER_REPORT ? 2 : 1;
    int channel[2];
    if (pipe(channel) != 0)
        lifecycle_fail("pass_b_kill_pipe_failed");
    lifecycle_arm_rename_pause(
        channel[1], pause_destination,
        pause_ordinal);
    pid_t child = fork();
    if (child < 0)
        lifecycle_fail("pass_b_kill_fork_failed");
    if (child == 0) {
        close(channel[0]);
        int result = cold_install_pass_b_staging(
            next_path, next_map, next_report,
            compiler_path, compiler_map,
            compiler_report, true,
            NULL, NULL, NULL);
        _exit(result ? 90 : 91);
    }
    close(channel[1]);
    lifecycle_disarm_rename_pause();
    lifecycle_kill_after_rename_event(
        child, channel[0],
        "pass_b_kill_boundary_not_reached");
    close(channel[0]);

    lifecycle_require_regular(
        next_path, "pass_b_kill_next_binary_missing");
    lifecycle_require_regular(
        next_map, "pass_b_kill_next_map_missing");
    lifecycle_require_regular(
        next_report, "pass_b_kill_next_report_missing");
    if (phase == LIFECYCLE_CRASH_AFTER_MAP) {
        lifecycle_require_contains(
            compiler_map, "pass-b-new-map\n",
            "pass_b_kill_map_not_committed");
        lifecycle_require_contains(
            compiler_path, "pass-b-old-binary\n",
            "pass_b_kill_binary_advanced_early");
    } else {
        lifecycle_require_contains(
            compiler_map, "pass-b-new-map\n",
            "pass_b_kill_map_missing");
        lifecycle_require_contains(
            compiler_path, "pass-b-new-binary\n",
            "pass_b_kill_binary_missing");
    }
    if (phase != LIFECYCLE_CRASH_AFTER_REPORT) {
        lifecycle_require_contains(
            compiler_report,
            "gate_blocker_id=pass_b_atomic_install_in_progress\n",
            "pass_b_kill_report_not_red");
        if (cold_file_contains_text(
                compiler_report,
                "full_backend_codegen=1\n"))
            lifecycle_fail(
                "pass_b_kill_green_report_published_early");
    } else if (!cold_backend_driver_report_matches_installed(
                   compiler_report,
                   compiler_path,
                   compiler_map) ||
               !cold_file_contains_text(
                   compiler_report,
                   "full_backend_codegen=1\n")) {
        lifecycle_fail(
            "pass_b_kill_report_last_not_bound");
    }
    if (phase == LIFECYCLE_CRASH_AFTER_MAP) {
        ColdOwnedStagingFile exact_owner = {0};
        lifecycle_owned_from_path(
            &exact_owner, next_path,
            "pass_b_kill_owner_capture_failed");
        char moved_owner[PATH_MAX];
        lifecycle_path(
            moved_owner, sizeof(moved_owner),
            case_root, "next-binary-moved");
        if (renameat(
                AT_FDCWD, next_path,
                AT_FDCWD, moved_owner) != 0 ||
            !cold_fsync_parent_directory(next_path))
            lifecycle_fail(
                "pass_b_kill_owner_swap_failed");
        lifecycle_write(
            next_path, "foreign-replacement\n", 0755);
        ColdOwnedStagingFile refused = {0};
        if (cold_install_lock_acquire(
                &refused, compiler_path) ||
            !cold_file_contains_text(
                next_path, "foreign-replacement\n"))
            lifecycle_fail(
                "pass_b_kill_foreign_deleted");
        lifecycle_remove_fixture(
            next_path,
            "pass_b_kill_foreign_cleanup_failed");
        if (renameat(
                AT_FDCWD, moved_owner,
                AT_FDCWD, next_path) != 0 ||
            !cold_fsync_parent_directory(next_path))
            lifecycle_fail(
                "pass_b_kill_exact_owner_restore_failed");
        int copied = snprintf(
            exact_owner.path,
            sizeof(exact_owner.path),
            "%s", next_path);
        if (copied <= 0 ||
            copied >= (int)sizeof(exact_owner.path) ||
            !cold_owned_staging_identity_current(
                &exact_owner))
            lifecycle_fail(
                "pass_b_kill_exact_owner_recovery_failed");
    }
    lifecycle_recover_sigkill_lock(
        compiler_path, child,
        "pass_b_kill_lock_recovery_failed");
    lifecycle_require_absent(
        next_path,
        "pass_b_kill_next_binary_not_recovered");
    lifecycle_require_absent(
        next_map,
        "pass_b_kill_next_map_not_recovered");
    lifecycle_require_absent(
        next_report,
        "pass_b_kill_next_report_not_recovered");
}

static void lifecycle_run_official_sigkill_case(
        const char *root,
        LifecycleCrashPhase phase) {
    char leaf[64];
    int leaf_length = snprintf(
        leaf, sizeof(leaf), "official-kill-%s",
        lifecycle_crash_phase_name(phase));
    if (leaf_length <= 0 ||
        leaf_length >= (int)sizeof(leaf))
        lifecycle_fail("official_kill_leaf_invalid");
    char case_root[PATH_MAX];
    lifecycle_path(
        case_root, sizeof(case_root), root, leaf);
    if (!cold_mkdir_p(case_root))
        lifecycle_fail("official_kill_root_create_failed");

    char installed_binary[PATH_MAX];
    char installed_map[PATH_MAX];
    char installed_report[PATH_MAX];
    lifecycle_path(
        installed_binary, sizeof(installed_binary),
        case_root, "cheng");
    lifecycle_path(
        installed_map, sizeof(installed_map),
        case_root, "cheng.map");
    lifecycle_path(
        installed_report, sizeof(installed_report),
        case_root, "cheng.report.txt");
    lifecycle_write(
        installed_binary, "official-old-binary\n", 0755);
    lifecycle_write(
        installed_map, "official-old-map\n", 0644);
    lifecycle_write(
        installed_report, "official-old-report\n", 0644);

    const char *pause_destination =
        phase == LIFECYCLE_CRASH_AFTER_MAP
            ? installed_map
            : phase == LIFECYCLE_CRASH_AFTER_BINARY
                ? installed_binary
                : installed_report;
    int pause_ordinal =
        phase == LIFECYCLE_CRASH_AFTER_REPORT ? 2 : 1;
    int channel[2];
    if (pipe(channel) != 0)
        lifecycle_fail("official_kill_pipe_failed");
    lifecycle_arm_rename_pause(
        channel[1], pause_destination,
        pause_ordinal);
    pid_t child = fork();
    if (child < 0)
        lifecycle_fail("official_kill_fork_failed");
    if (child == 0) {
        close(channel[0]);
        char staging_binary[PATH_MAX];
        char staging_map[PATH_MAX];
        char staging_report[PATH_MAX];
        if (!cold_backend_driver_staging_path(
                staging_binary, sizeof(staging_binary),
                installed_binary) ||
            !cold_backend_driver_staging_path(
                staging_map, sizeof(staging_map),
                installed_map) ||
            !cold_backend_driver_staging_path(
                staging_report, sizeof(staging_report),
                installed_report))
            _exit(92);
        ColdOwnedStagingFile install_lock = {0};
        ColdOwnedStagingFile owned_binary = {0};
        ColdOwnedStagingFile owned_map = {0};
        ColdOwnedStagingFile owned_report = {0};
        if (!cold_install_lock_acquire(
                &install_lock, installed_binary) ||
            !cold_owned_staging_create(
                &owned_binary, staging_binary,
                (const uint8_t *)"official-new-binary\n",
                strlen("official-new-binary\n"), 0755) ||
            !cold_owned_staging_create(
                &owned_map, staging_map,
                (const uint8_t *)"official-new-map\n",
                strlen("official-new-map\n"), 0644))
            _exit(93);
        char binary_sha256[65];
        char map_sha256[65];
        if (!cold_file_sha256_hex(
                staging_binary, binary_sha256) ||
            !cold_file_sha256_hex(
                staging_map, map_sha256))
            _exit(94);
        char report_text[PATH_MAX * 3];
        int report_length = snprintf(
            report_text, sizeof(report_text),
            "real_backend_codegen=1\n"
            "backend_driver_candidate=full_backend_codegen\n"
            "full_backend_codegen=1\n"
            "cold_system_link_exec=0\n"
            "system_link_exec_scope=selfhost_direct\n"
            "output=%s\n"
            "output_map=%s\n"
            "output_sha256=%s\n"
            "output_map_sha256=%s\n",
            installed_binary, installed_map,
            binary_sha256, map_sha256);
        if (report_length <= 0 ||
            report_length >= (int)sizeof(report_text) ||
            !cold_write_text_file_atomic_replace(
                installed_report,
                "full_backend_codegen=0\n"
                "gate_blocked=1\n"
                "gate_blocker_id=backend_driver_atomic_install_in_progress\n") ||
            !cold_owned_staging_create(
                &owned_report, staging_report,
                (const uint8_t *)report_text,
                (size_t)report_length, 0644) ||
            !cold_install_staging_generation_create(
                &install_lock,
                (const char *const[]){
                    staging_binary,
                    staging_map,
                    staging_report,
                },
                (const ColdOwnedStagingFile *const[]){
                    &owned_binary,
                    &owned_map,
                    &owned_report,
                },
                3))
            _exit(95);
        int committed = cold_commit_backend_driver_staging(
            &owned_binary, &owned_map, &owned_report,
            installed_binary, installed_map,
            installed_report);
        int cleaned = committed &&
            cold_install_staging_generation_cleanup(
                &install_lock);
        int released = cleaned &&
            cold_install_lock_release(&install_lock);
        _exit(committed && cleaned && released ? 96 : 97);
    }
    close(channel[1]);
    lifecycle_disarm_rename_pause();
    lifecycle_kill_after_rename_event(
        child, channel[0],
        "official_kill_boundary_not_reached");
    close(channel[0]);

    char staging_binary[PATH_MAX];
    char staging_map[PATH_MAX];
    char staging_report[PATH_MAX];
    lifecycle_child_staging_path(
        staging_binary, sizeof(staging_binary),
        installed_binary, child);
    lifecycle_child_staging_path(
        staging_map, sizeof(staging_map),
        installed_map, child);
    lifecycle_child_staging_path(
        staging_report, sizeof(staging_report),
        installed_report, child);
    if (phase == LIFECYCLE_CRASH_AFTER_MAP) {
        lifecycle_require_contains(
            installed_map, "official-new-map\n",
            "official_kill_map_not_committed");
        lifecycle_require_contains(
            installed_binary, "official-old-binary\n",
            "official_kill_binary_advanced_early");
        lifecycle_require_absent(
            staging_map,
            "official_kill_map_staging_not_consumed");
        lifecycle_require_regular(
            staging_binary,
            "official_kill_binary_staging_missing");
        lifecycle_require_regular(
            staging_report,
            "official_kill_report_staging_missing");
    } else {
        lifecycle_require_contains(
            installed_map, "official-new-map\n",
            "official_kill_map_missing");
        lifecycle_require_contains(
            installed_binary, "official-new-binary\n",
            "official_kill_binary_missing");
        lifecycle_require_absent(
            staging_map,
            "official_kill_map_staging_fragment");
        lifecycle_require_absent(
            staging_binary,
            "official_kill_binary_staging_fragment");
        if (phase == LIFECYCLE_CRASH_AFTER_BINARY)
            lifecycle_require_regular(
                staging_report,
                "official_kill_report_staging_missing");
        else
            lifecycle_require_absent(
                staging_report,
                "official_kill_report_staging_fragment");
    }
    if (phase != LIFECYCLE_CRASH_AFTER_REPORT) {
        lifecycle_require_contains(
            installed_report,
            "gate_blocker_id=backend_driver_atomic_install_in_progress\n",
            "official_kill_report_not_red");
        if (cold_file_contains_text(
                installed_report,
                "full_backend_codegen=1\n"))
            lifecycle_fail(
                "official_kill_green_report_published_early");
    } else if (!cold_backend_driver_report_matches_installed(
                   installed_report,
                   installed_binary,
                   installed_map) ||
               !cold_file_contains_text(
                   installed_report,
                   "full_backend_codegen=1\n")) {
        lifecycle_fail(
            "official_kill_report_last_not_bound");
    }
    if (phase == LIFECYCLE_CRASH_AFTER_MAP) {
        ColdOwnedStagingFile exact_owner = {0};
        lifecycle_owned_from_path(
            &exact_owner, staging_binary,
            "official_kill_owner_capture_failed");
        char moved_owner[PATH_MAX];
        lifecycle_path(
            moved_owner, sizeof(moved_owner),
            case_root, "owned-binary-moved");
        if (renameat(
                AT_FDCWD, staging_binary,
                AT_FDCWD, moved_owner) != 0 ||
            !cold_fsync_parent_directory(staging_binary))
            lifecycle_fail(
                "official_kill_owner_swap_failed");
        lifecycle_write(
            staging_binary, "foreign-replacement\n", 0755);
        ColdOwnedStagingFile refused = {0};
        if (cold_install_lock_acquire(
                &refused, installed_binary) ||
            cold_owned_staging_remove(&exact_owner) ||
            !cold_file_contains_text(
                staging_binary,
                "foreign-replacement\n"))
            lifecycle_fail(
                "official_kill_foreign_deleted");
        lifecycle_remove_fixture(
            staging_binary,
            "official_kill_foreign_cleanup_failed");
        if (renameat(
                AT_FDCWD, moved_owner,
                AT_FDCWD, staging_binary) != 0 ||
            !cold_fsync_parent_directory(staging_binary))
            lifecycle_fail(
                "official_kill_exact_owner_restore_failed");
        int copied = snprintf(
            exact_owner.path,
            sizeof(exact_owner.path),
            "%s", staging_binary);
        if (copied <= 0 ||
            copied >= (int)sizeof(exact_owner.path) ||
            !cold_owned_staging_identity_current(
                &exact_owner))
            lifecycle_fail(
                "official_kill_exact_owner_recovery_failed");
    }
    lifecycle_recover_sigkill_lock(
        installed_binary, child,
        "official_kill_lock_recovery_failed");
    lifecycle_require_absent(
        staging_binary,
        "official_kill_binary_staging_not_recovered");
    lifecycle_require_absent(
        staging_map,
        "official_kill_map_staging_not_recovered");
    lifecycle_require_absent(
        staging_report,
        "official_kill_report_staging_not_recovered");
}

static void lifecycle_run_crash_recovery(const char *root) {
    for (int phase = LIFECYCLE_CRASH_AFTER_MAP;
         phase <= LIFECYCLE_CRASH_AFTER_REPORT;
         phase++) {
        lifecycle_run_pass_b_sigkill_case(
            root, (LifecycleCrashPhase)phase);
        lifecycle_run_official_sigkill_case(
            root, (LifecycleCrashPhase)phase);
    }
    puts("build_backend_driver_pass_b_sigkill_map=red_report_recovered_zero_fragments");
    puts("build_backend_driver_pass_b_sigkill_binary=red_report_recovered_zero_fragments");
    puts("build_backend_driver_pass_b_sigkill_report=green_report_recovered_zero_fragments");
    puts("build_backend_driver_official_sigkill_map=red_report_recovered_zero_fragments");
    puts("build_backend_driver_official_sigkill_binary=red_report_recovered_zero_fragments");
    puts("build_backend_driver_official_sigkill_report=green_report_recovered_zero_fragments");
    puts("build_backend_driver_sigkill_lock_recovery=owner_generation_exact_inode");
    puts("build_backend_driver_sigkill_foreign_replacement=pass_b_and_official_preserved_hard_fail");
    puts("build_backend_driver_staging_crash_consistency_status=pass");
}

int main(int argc, char **argv) {
    if (argc != 3)
        lifecycle_fail("usage");
    if (strcmp(argv[1], "success") == 0) {
        lifecycle_run_success(argv[2]);
    } else if (strcmp(argv[1], "failure") == 0) {
        lifecycle_run_failure(argv[2]);
    } else if (strcmp(argv[1], "crash-recovery") == 0) {
        lifecycle_run_crash_recovery(argv[2]);
    } else {
        lifecycle_fail("unknown_case");
    }
    return 0;
}
