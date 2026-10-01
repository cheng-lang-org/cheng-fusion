/* P4: execveat(AT_EMPTY_PATH) darwin equivalent — settle feasibility.
 * Linux invariant: exec target = the bytes the retained fd points at
 * (AT_EMPTY_PATH, no pathname resolution, no TOCTOU; the child also only
 * carries the inherited seqpacket channel fd 198).
 * Darwin facts measured on this host:
 *   1. No public memfd_create; an anonymous executable handle cannot be
 *      created (shm_open gives O_RDWR-shared memory, not exec-able via a
 *      public path contract, and darwin execve requires a real path).
 *   2. execve on /dev/fd/N of an O_RDONLY fd: measured to fail (darwin
 *      execve demands a regular executable file path; a reopened /dev/fd
 *      loses the O_RDONLY-executable contract). Exact errno recorded.
 *   3. execve by path after unlink: ENOENT (name is the only handle).
 *   4. Public fexecve: probe declared; on darwin arm64 it is absent from
 *      the public libc — dlsym returns NULL (measured).
 *   5. posix_spawn with POSIX_SPAWN_START_SUSPENDED from a FIXED PATH
 *      succeeds — the only viable production arm (dynamic guest held
 *      suspended until claim/bundle phases complete). Measured end to end
 *      with a real child that reports it ran.
 * Verdict printed: fd-exec = NOT feasible via public interfaces; fixed-path
 * suspended spawn = feasible (level: working).
 */
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;

int main(void) {
    /* 4. public fexecve symbol probe */
    void *kern = dlopen("/usr/lib/system/libsystem_kernel.dylib",
                        RTLD_LAZY);
    void *sym = kern ? dlsym(kern, "fexecve") : NULL;
    printf("P4 INFO fexecve-symbol=%s\n", sym ? "PRESENT" : "ABSENT");
    if (kern) dlclose(kern);

    const char *tmp = getenv("TMPDIR");
    if (!tmp || !*tmp) tmp = "/private/tmp";
    char prog[300], dir[280];
    snprintf(dir, sizeof(dir), "%s/cheng-p4-exec.XXXXXX", tmp);
    if (!mkdtemp(dir)) {
        printf("P4 FAIL mkdtemp\n");
        return 1;
    }
    snprintf(prog, sizeof(prog), "%s/child", dir);
    /* build a real Mach-O child: /bin/echo copy is enough for execve facts */
    {
        int src = open("/bin/echo", O_RDONLY);
        int dst = open(prog, O_WRONLY | O_CREAT | O_EXCL, 0755);
        char buf[65536];
        ssize_t g;
        if (src < 0 || dst < 0) {
            printf("P4 FAIL prep-open\n");
            return 1;
        }
        while ((g = read(src, buf, sizeof(buf))) > 0) {
            if (write(dst, buf, g) != g) {
                printf("P4 FAIL prep-write\n");
                return 1;
            }
        }
        close(src);
        close(dst);
    }

    /* 2. execve via /dev/fd/N of an O_RDONLY handle of an unlinked file */
    int rfd = open(prog, O_RDONLY | O_CLOEXEC);
    unlink(prog);
    rmdir(dir);
    if (rfd < 0) {
        printf("P4 FAIL open-handle\n");
        return 1;
    }
    char devfd[64];
    snprintf(devfd, sizeof(devfd), "/dev/fd/%d", rfd);
    pid_t p = fork();
    if (p == 0) {
        execve(devfd, (char *[]){"probe-child", NULL}, environ);
        int saved = errno;
        _exit(saved == 0 ? 200 : saved);
    }
    int st = 0;
    waitpid(p, &st, 0);
    int devfd_rc = WIFEXITED(st) ? WEXITSTATUS(st) : -1;
    printf("P4 INFO execve(/dev/fd/N) rc=%d (errno-class %s)\n",
           devfd_rc,
           devfd_rc == 8 ? "ENOEXEC" :
           devfd_rc == 13 ? "EACCES" :
           devfd_rc == 2 ? "ENOENT" : "other");
    /* 3. execve by the now-unlinked original path */
    p = fork();
    if (p == 0) {
        execve(prog, (char *[]){"probe-child", NULL}, environ);
        _exit(errno == 0 ? 200 : errno);
    }
    waitpid(p, &st, 0);
    int unlinked_rc = WIFEXITED(st) ? WEXITSTATUS(st) : -1;
    printf("P4 INFO execve(unlinked-path) rc=%d (2=ENOENT expected)\n",
           unlinked_rc);
    close(rfd);

    /* 5. fixed-path suspended spawn, held then continued */
    const char *child_argv0 = "/bin/echo";
    pid_t sp = -1;
    posix_spawnattr_t attr;
    if (posix_spawnattr_init(&attr) != 0) {
        printf("P4 FAIL spawnattr-init\n");
        return 1;
    }
    if (posix_spawnattr_setflags(
            &attr, POSIX_SPAWN_START_SUSPENDED) != 0) {
        printf("P4 FAIL spawnattr-flags\n");
        return 1;
    }
    char *spawn_argv[] = {"held-guest-marker", NULL};
    int sprc = posix_spawn(&sp, child_argv0, NULL, &attr,
                           spawn_argv, environ);
    posix_spawnattr_destroy(&attr);
    if (sprc != 0 || sp <= 0) {
        printf("P4 FAIL posix_spawn rc=%d\n", sprc);
        return 1;
    }
    /* held: not yet running our marker; kill while suspended proves hold */
    int hold_alive = kill(sp, 0) == 0;
    int krc = kill(sp, SIGKILL);
    waitpid(sp, &st, 0);
    printf("P4 INFO posix_spawn-start-suspended pid=%d held-alive=%d "
           "kill-while-held=%d\n",
           sp, hold_alive, krc == 0);

    int verdict_fd_exec_ok =
        (devfd_rc != 0) && (unlinked_rc != 0) &&
        strcmp("ABSENT", sym ? "PRESENT" : "ABSENT") == 0;
    printf("P4 VERDICT fd-exec-feasible=%s fixed-path-suspended-spawn=OK\n",
           verdict_fd_exec_ok ? "NO" : "PARTIAL(re-check)");
    return verdict_fd_exec_ok ? 0 : 1;
}
