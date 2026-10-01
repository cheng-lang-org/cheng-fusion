#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif
#ifndef O_PATH
#define O_PATH 010000000
#endif

static int write_all(int fd, const void *data, size_t size) {
    const unsigned char *cursor = data;
    while (size != 0) {
        ssize_t written = write(fd, cursor, size);
        if (written < 0 && errno == EINTR) continue;
        if (written <= 0) return -1;
        cursor += (size_t)written;
        size -= (size_t)written;
    }
    return 0;
}

static int read_exact_file(const char *path, char *out, size_t size) {
    int fd = open(path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (fd < 0) return -1;
    size_t offset = 0;
    while (offset < size) {
        ssize_t got = read(fd, out + offset, size - offset);
        if (got < 0 && errno == EINTR) continue;
        if (got <= 0) {
            close(fd);
            return -1;
        }
        offset += (size_t)got;
    }
    char tail = 0;
    ssize_t extra = read(fd, &tail, 1);
    int close_rc = close(fd);
    return extra == 0 && close_rc == 0 ? 0 : -1;
}

static int child_probe(
        const char *finished_path,
        const char *decision_path,
        const char *forbidden_path,
        int abi_pipe) {
    static const char finished_payload[] = "finished-proof-v1\n";
    static const char decision_payload[] = "decision-seed-v1\n";
    int finished_fd = open(
        finished_path, O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    int decision_fd = open(
        decision_path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    int held_fd = open(
        "/proc/self/exe", O_RDONLY | O_CLOEXEC);
    if (finished_fd < 0 || decision_fd < 0 || held_fd < 0 ||
        finished_fd == decision_fd || finished_fd == held_fd ||
        decision_fd == held_fd) return 10;

    int abi = (int)syscall(
        SYS_landlock_create_ruleset, NULL, 0,
        LANDLOCK_CREATE_RULESET_VERSION);
    if (abi < 3) return 11;
    const uint64_t handled =
        LANDLOCK_ACCESS_FS_WRITE_FILE |
        LANDLOCK_ACCESS_FS_REMOVE_DIR |
        LANDLOCK_ACCESS_FS_REMOVE_FILE |
        LANDLOCK_ACCESS_FS_MAKE_CHAR |
        LANDLOCK_ACCESS_FS_MAKE_DIR |
        LANDLOCK_ACCESS_FS_MAKE_REG |
        LANDLOCK_ACCESS_FS_MAKE_SOCK |
        LANDLOCK_ACCESS_FS_MAKE_FIFO |
        LANDLOCK_ACCESS_FS_MAKE_BLOCK |
        LANDLOCK_ACCESS_FS_MAKE_SYM |
        LANDLOCK_ACCESS_FS_REFER |
        LANDLOCK_ACCESS_FS_TRUNCATE;
    struct landlock_ruleset_attr ruleset_attr = {
        .handled_access_fs = handled,
    };
    int ruleset_fd = (int)syscall(
        SYS_landlock_create_ruleset,
        &ruleset_attr, sizeof(ruleset_attr), 0);
    if (ruleset_fd < 0) return 12;
    char finished_proc_path[64];
    if (snprintf(
            finished_proc_path,
            sizeof(finished_proc_path),
            "/proc/self/fd/%d",
            finished_fd) <= 0) return 13;
    int finished_rule_fd = open(
        finished_proc_path, O_PATH | O_CLOEXEC);
    struct stat finished_writer_stat;
    struct stat finished_rule_stat;
    if (finished_rule_fd < 0 ||
        fstat(finished_fd, &finished_writer_stat) != 0 ||
        fstat(finished_rule_fd, &finished_rule_stat) != 0 ||
        finished_writer_stat.st_dev != finished_rule_stat.st_dev ||
        finished_writer_stat.st_ino != finished_rule_stat.st_ino ||
        finished_writer_stat.st_size != finished_rule_stat.st_size) return 14;
    struct landlock_path_beneath_attr path_rule = {
        .allowed_access = LANDLOCK_ACCESS_FS_WRITE_FILE |
            LANDLOCK_ACCESS_FS_TRUNCATE,
        .parent_fd = finished_rule_fd,
    };
    if (syscall(
            SYS_landlock_add_rule, ruleset_fd,
            LANDLOCK_RULE_PATH_BENEATH, &path_rule, 0) != 0) return 15;
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) return 16;
    if (syscall(SYS_landlock_restrict_self, ruleset_fd, 0) != 0) return 17;
    if (close(finished_rule_fd) != 0 || close(ruleset_fd) != 0) return 18;

    if (write_all(
            finished_fd,
            finished_payload,
            sizeof(finished_payload) - 1) != 0 ||
        fdatasync(finished_fd) != 0 || close(finished_fd) != 0) return 19;

    int reopen_finished = open(
        finished_path, O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    if (reopen_finished < 0 || close(reopen_finished) != 0) return 20;

    errno = 0;
    int forbidden_write = open(
        forbidden_path, O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    if (forbidden_write >= 0 || errno != EACCES) return 21;
    errno = 0;
    int decision_write = open(
        decision_path, O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    if (decision_write >= 0 || errno != EACCES) return 22;
    errno = 0;
    int forbidden_truncate = open(
        forbidden_path, O_RDONLY | O_TRUNC | O_CLOEXEC | O_NOFOLLOW);
    if (forbidden_truncate >= 0 || errno != EACCES) return 23;

    char decision_readback[sizeof(decision_payload) - 1];
    ssize_t decision_read = read(
        decision_fd, decision_readback, sizeof(decision_readback));
    if (decision_read != (ssize_t)sizeof(decision_readback) ||
        memcmp(
            decision_readback,
            decision_payload,
            sizeof(decision_readback)) != 0 ||
        close(decision_fd) != 0 || close(held_fd) != 0) return 24;
    if (write_all(abi_pipe, &abi, sizeof(abi)) != 0 ||
        close(abi_pipe) != 0) return 25;
    return 0;
}

int main(void) {
    static const char finished_payload[] = "finished-proof-v1\n";
    static const char decision_payload[] = "decision-seed-v1\n";
    static const char forbidden_payload[] = "forbidden-seed-v1\n";
    char directory[] = "/tmp/cheng-landlock-probe.XXXXXX";
    if (mkdtemp(directory) == NULL) return 30;
    char finished_path[256];
    char decision_path[256];
    char forbidden_path[256];
    if (snprintf(finished_path, sizeof(finished_path), "%s/finished", directory) <= 0 ||
        snprintf(decision_path, sizeof(decision_path), "%s/decision", directory) <= 0 ||
        snprintf(forbidden_path, sizeof(forbidden_path), "%s/forbidden", directory) <= 0) return 31;
    int finished_seed = open(
        finished_path, O_CREAT | O_EXCL | O_WRONLY | O_CLOEXEC, 0600);
    int decision_seed = open(
        decision_path, O_CREAT | O_EXCL | O_WRONLY | O_CLOEXEC, 0400);
    int forbidden_seed = open(
        forbidden_path, O_CREAT | O_EXCL | O_WRONLY | O_CLOEXEC, 0600);
    if (finished_seed < 0 || decision_seed < 0 || forbidden_seed < 0 ||
        close(finished_seed) != 0 ||
        write_all(
            decision_seed,
            decision_payload,
            sizeof(decision_payload) - 1) != 0 ||
        fdatasync(decision_seed) != 0 || close(decision_seed) != 0 ||
        write_all(
            forbidden_seed,
            forbidden_payload,
            sizeof(forbidden_payload) - 1) != 0 ||
        fdatasync(forbidden_seed) != 0 || close(forbidden_seed) != 0) return 32;

    int abi_pipe[2];
    if (pipe2(abi_pipe, O_CLOEXEC) != 0) return 33;
    pid_t child = fork();
    if (child < 0) return 34;
    if (child == 0) {
        close(abi_pipe[0]);
        _exit(child_probe(
            finished_path,
            decision_path,
            forbidden_path,
            abi_pipe[1]));
    }
    close(abi_pipe[1]);
    int status = 0;
    int abi = 0;
    ssize_t abi_read = read(abi_pipe[0], &abi, sizeof(abi));
    int pipe_close = close(abi_pipe[0]);
    pid_t waited = waitpid(child, &status, 0);
    char finished_readback[sizeof(finished_payload) - 1];
    char decision_readback[sizeof(decision_payload) - 1];
    char forbidden_readback[sizeof(forbidden_payload) - 1];
    int verified =
        waited == child && WIFEXITED(status) && WEXITSTATUS(status) == 0 &&
        abi_read == (ssize_t)sizeof(abi) && pipe_close == 0 && abi >= 3 &&
        read_exact_file(
            finished_path,
            finished_readback,
            sizeof(finished_readback)) == 0 &&
        memcmp(
            finished_readback,
            finished_payload,
            sizeof(finished_readback)) == 0 &&
        read_exact_file(
            decision_path,
            decision_readback,
            sizeof(decision_readback)) == 0 &&
        memcmp(
            decision_readback,
            decision_payload,
            sizeof(decision_readback)) == 0 &&
        read_exact_file(
            forbidden_path,
            forbidden_readback,
            sizeof(forbidden_readback)) == 0 &&
        memcmp(
            forbidden_readback,
            forbidden_payload,
            sizeof(forbidden_readback)) == 0;
    int cleanup_rc = 0;
    cleanup_rc |= unlink(finished_path);
    cleanup_rc |= unlink(decision_path);
    cleanup_rc |= unlink(forbidden_path);
    cleanup_rc |= rmdir(directory);
    if (!verified || cleanup_rc != 0) {
        fprintf(stderr,
            "linux_landlock_write_deny_probe_failed child_status=%d abi=%d\n",
            status, abi);
        return 35;
    }
    printf("linux_landlock_write_deny_probe_status=pass\n");
    printf("linux_landlock_abi=%d\n", abi);
    printf("linux_landlock_finished_rule_opath_identity=pass\n");
    printf("linux_landlock_finished_preopen_write=pass\n");
    printf("linux_landlock_forbidden_write=EACCES\n");
    printf("linux_landlock_forbidden_truncate=EACCES\n");
    printf("linux_landlock_decision_reader_write=EACCES\n");
    printf("linux_landlock_read_only_decision=pass\n");
    return 0;
}
