/* P2: pidfd darwin equivalent — unconfusable process handle.
 * Linux pidfd invariants consumed by the held-exec parent:
 *   (a) waitid(P_PIDFD, WNOWAIT) blocks on the pidfd event itself
 *       (host_runtime cheng_host_terminal_linux_pidfd_event_wait_runtime);
 *   (b) poll(pidfd) observes the exit of that exact instance;
 *   (c) the handle stays bound to the original process even if the pid
 *       number is later reused.
 * Darwin has no pidfd_open. Measured on this host:
 *   1. PROC_PIDTBSDINFO via proc_pidinfo returns (pbi_pid, pbi_status,
 *      pbi_start time) — the birth tuple the existing darwin birth-capture
 *      bridge (core_runtime_provider_darwin.cheng) uses.
 *   2. kqueue EVFILT_PROC NOTE_EXIT registered while the child is
 *      provably alive (pipe handshake), then EV_ONESHOT delivery with
 *      ident==pid, followed by observe-before-reap waitid(WNOWAIT) with
 *      the exact siginfo — the existing terminal wait bridge path.
 *   3. PID reuse window: spin short-lived children, detect pid-number
 *      recurrence with a different birth tuple — pid number alone is not
 *      an unconfusable handle; (pid, birthtime) is.
 * exit 0 = all observed facts printed and consistent.
 */
#include <errno.h>
#include <signal.h>
#include <sys/event.h>
#include <libproc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/wait.h>

struct birth_key {
    int pid;
    unsigned long long sec;
    unsigned long long usec;
};

static int probe_birth(int pid, struct birth_key *out) {
    struct proc_bsdinfo info;
    memset(&info, 0, sizeof(info));
    if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info,
                     sizeof(info)) != (int)sizeof(info))
        return -1;
    if (info.pbi_pid != (uint32_t)pid) return -2;
    out->pid = (int)info.pbi_pid;
    out->sec = (unsigned long long)info.pbi_start_tvsec;
    out->usec = (unsigned long long)info.pbi_start_tvusec;
    return 0;
}

int main(void) {
    /* 1. self birth identity */
    struct birth_key self;
    if (probe_birth(getpid(), &self) != 0) {
        printf("P2 FAIL proc_pidinfo-self\n");
        return 1;
    }
    printf("P2 INFO self pid=%d birth=%llu.%06llu\n",
           self.pid, self.sec, self.usec);

    /* 2. kqueue NOTE_EXIT with a provably-alive registration window */
    int go[2];
    if (pipe(go) != 0) {
        printf("P2 FAIL pipe\n");
        return 1;
    }
    pid_t pid_a = fork();
    if (pid_a == 0) {
        close(go[1]);
        char c;
        ssize_t g = read(go[0], &c, 1);
        _exit(g == 0 ? 7 : 8); /* hold until the parent registered */
    }
    if (pid_a < 0) {
        printf("P2 FAIL fork\n");
        return 1;
    }
    int kq = kqueue();
    if (kq < 0) {
        printf("P2 FAIL kqueue\n");
        return 1;
    }
    struct kevent change;
    EV_SET(&change, (uintptr_t)pid_a, EVFILT_PROC, EV_ADD | EV_ONESHOT,
           NOTE_EXIT, 0, NULL);
    int reg_rc = kevent(kq, &change, 1, NULL, 0, NULL);
    if (reg_rc != 0) {
        printf("P2 FAIL kevent-register rc=%d errno=%d\n", reg_rc, errno);
        return 1;
    }
    close(go[1]); /* release the child: it exits 7 after registration */

    struct kevent event;
    int wait_rc = kevent(kq, NULL, 0, &event, 1, NULL); /* blocking */
    if (wait_rc != 1) {
        printf("P2 FAIL kevent-wait rc=%d\n", wait_rc);
        return 1;
    }
    if (event.ident != (uintptr_t)pid_a ||
        (event.fflags & NOTE_EXIT) == 0) {
        printf("P2 FAIL kevent-mismatch ident=%llu fflags=%u\n",
               (unsigned long long)event.ident, event.fflags);
        return 1;
    }
    /* observe-before-reap (WNOWAIT equivalent): siginfo still available */
    siginfo_t si;
    memset(&si, 0, sizeof(si));
    si.si_pid = 0;
    if (waitid((idtype_t)P_PID, pid_a, &si, WEXITED | WNOWAIT) != 0 ||
        si.si_pid != pid_a || si.si_code != CLD_EXITED ||
        si.si_status != 7) {
        printf("P2 FAIL waitid-wnowait\n");
        return 1;
    }
    struct birth_key child_a;
    {
        struct proc_bsdinfo zinfo;
        memset(&zinfo, 0, sizeof(zinfo));
        int zcopied = (int)proc_pidinfo(pid_a, PROC_PIDTBSDINFO, 0,
                                        &zinfo, sizeof(zinfo));
        printf("P2 INFO zombie bsdinfo copied=%d (need=%d) status=%u "
               "pid=%u — reaped-first parent must capture birth earlier\n",
               zcopied, (int)sizeof(zinfo),
               zcopied == (int)sizeof(zinfo)
                   ? (unsigned)zinfo.pbi_status : 0u,
               zcopied == (int)sizeof(zinfo)
                   ? (unsigned)zinfo.pbi_pid : 0u);
    }
    if (probe_birth(pid_a, &child_a) == 0) {
        printf("P2 INFO zombie birth pid=%d birth=%llu.%06llu\n",
               child_a.pid, child_a.sec, child_a.usec);
    } else {
        printf("P2 INFO zombie birth unavailable (acceptable post-reap)\n");
    }
    int status = 0;
    if (waitpid(pid_a, &status, 0) != pid_a) {
        printf("P2 FAIL reap\n");
        return 1;
    }
    close(kq);
    printf("P2 OK kqueue-note-exit ident=%d wnowait-status=7\n", pid_a);

    /* 3. pid reuse window measurement.
     * Birth tuple is captured BEFORE reap (fork returns the pid; the
     * probe runs while the child/zombie still exists), mirroring the
     * parent-side contract: identity evidence must be captured before
     * the process is reaped, since after reap nothing remains. */
    int slots = 512;
    struct birth_key *seen = calloc((size_t)slots, sizeof(*seen));
    if (!seen) return 1;
    int reused = 0, distinct = 0, spawned = 0;
    for (int i = 0; i < 400 && spawned < slots; i++) {
        pid_t c = fork();
        if (c == 0) _exit(0);
        if (c < 0) break;
        struct birth_key key;
        int have_birth = probe_birth((int)c, &key) == 0;
        int st = 0;
        if (waitpid(c, &st, 0) != c) break;
        spawned++;
        if (!have_birth) continue;
        int duplicate = 0;
        for (int j = 0; j < distinct; j++) {
            if (seen[j].pid == key.pid) {
                duplicate = 1;
                if (seen[j].sec != key.sec || seen[j].usec != key.usec) {
                    reused++; /* same pid number, different birth instance */
                }
                break;
            }
        }
        if (!duplicate && distinct < slots) {
            seen[distinct++] = key;
        }
    }
    printf("P2 INFO reuse-window spawned=%d distinct_pids=%d "
           "pid_reused_with_different_birth=%d\n",
           spawned, distinct, reused);
    printf("P2 OK pid-number-not-handle "
           "birth-tuple-distinguishes=%s\n",
           reused > 0 ? "proven"
                      : "no-reuse-in-window(tuple-still-required)");
    free(seen);
    return 0;
}
