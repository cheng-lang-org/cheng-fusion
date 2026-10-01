/* P3: /proc darwin equivalent — information surface inventory.
 * The held-exec parent consumes exactly these /proc facts:
 *   (a) /proc/self/exe vnode == fixed launcher path vnode (launcher identity,
 *       psb cheng_held_exec_launcher_identity_digest_into);
 *   (b) open(/proc/<childPid>/exe, O_PATH) then fstat (size/mode/dev/ino)
 *       == retained fd fstat (child image match,
 *       psb cheng_held_exec_child_image_matches);
 *   (c) /proc/<pid>/exe open + fs-verity measure (process image digest).
 * Darwin inventory measured here with libproc:
 *   - proc_pidpath(self) returns the literal executable path, then
 *     stat() gives dev/ino/mode/size comparable to fstat(self fd);
 *   - proc_pidpath on a non-existent pid fails (ESRCH-class), on a
 *     zombie fails after reap — no stale identity surface;
 *   - PROC_PIDTBSDINFO pbi_status is observable for a live child.
 * Honest gap recorded: path->stat has a replace-by-name window that the
 * Linux /proc/<pid>/exe O_PATH open does not; the design closes it with
 * the fixed-path issuance bar + post-spawn image re-proof, see DESIGN.md.
 */
#include <libproc.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/wait.h>
#include <errno.h>

int main(void) {
    char pathbuf[PROC_PIDPATHINFO_SIZE];
    memset(pathbuf, 0, sizeof(pathbuf));
    int self = getpid();
    int got = proc_pidpath(self, pathbuf, sizeof(pathbuf));
    if (got <= 0) {
        printf("P3 FAIL proc_pidpath-self errno=%d\n", errno);
        return 1;
    }
    struct stat exe_stat, self_fd_stat;
    if (stat(pathbuf, &exe_stat) != 0) {
        printf("P3 FAIL stat-self-path errno=%d\n", errno);
        return 1;
    }
    int selffd = open(pathbuf, O_RDONLY | O_CLOEXEC);
    if (selffd < 0) {
        printf("P3 FAIL open-self errno=%d\n", errno);
        return 1;
    }
    if (fstat(selffd, &self_fd_stat) != 0) {
        printf("P3 FAIL fstat-self\n");
        return 1;
    }
    close(selffd);
    int same = exe_stat.st_dev == self_fd_stat.st_dev &&
        exe_stat.st_ino == self_fd_stat.st_ino &&
        exe_stat.st_mode == self_fd_stat.st_mode &&
        exe_stat.st_size == self_fd_stat.st_size;
    if (!same) {
        printf("P3 FAIL identity-diverge\n");
        return 1;
    }
    printf("P3 INFO self exe=%s dev=%llu ino=%llu mode=%o size=%lld\n",
           pathbuf, (unsigned long long)exe_stat.st_dev,
           (unsigned long long)exe_stat.st_ino,
           (unsigned)exe_stat.st_mode, (long long)exe_stat.st_size);

    /* non-existent pid: no identity surface */
    pid_t ghost = 999999;
    memset(pathbuf, 0, sizeof(pathbuf));
    got = proc_pidpath(ghost, pathbuf, sizeof(pathbuf));
    printf("P3 INFO nonexistent-pid proc_pidpath=%d errno=%d(%s)\n",
           got, errno, got <= 0 ? "rejected" : "UNEXPECTED");

    /* zombie after reap: surface gone */
    pid_t c = fork();
    if (c == 0) _exit(0);
    int st = 0;
    if (waitpid(c, &st, 0) != c) {
        printf("P3 FAIL reap\n");
        return 1;
    }
    memset(pathbuf, 0, sizeof(pathbuf));
    got = proc_pidpath(c, pathbuf, sizeof(pathbuf));
    printf("P3 INFO reaped-pid proc_pidpath=%d errno=%d(%s)\n",
           got, errno, got <= 0 ? "rejected" : "UNEXPECTED");

    /* live child: status observable through PROC_PIDTBSDINFO */
    pid_t live = fork();
    if (live == 0) {
        struct timespec t = {2, 0};
        nanosleep(&t, NULL);
        _exit(0);
    }
    struct proc_bsdinfo info;
    memset(&info, 0, sizeof(info));
    int ok = proc_pidinfo(live, PROC_PIDTBSDINFO, 0, &info,
                          sizeof(info)) == (int)sizeof(info) &&
        info.pbi_pid == (uint32_t)live && info.pbi_status >= 1 &&
        info.pbi_status <= 4;
    printf("P3 INFO live-child bsdinfo pid_match_status=%d status=%u\n",
           ok, ok ? (unsigned)info.pbi_status : 0u);
    kill(live, 9);
    waitpid(live, &st, 0);
    if (!ok) {
        printf("P3 FAIL live-child-bsdinfo\n");
        return 1;
    }
    printf("P3 OK self-identity-exact ghost/reaped-rejected live-observable\n");
    return 0;
}
