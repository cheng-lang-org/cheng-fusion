#if defined(__APPLE__)
#define _DARWIN_C_SOURCE
#endif

#if defined(_WIN32) || defined(__CYGWIN__) || defined(__MSYS__)
#define CHENG_MONITOR_WINDOWS 1
#endif

#if defined(__linux__) || defined(CHENG_MONITOR_WINDOWS)
#define _POSIX_C_SOURCE 200809L
#define _DEFAULT_SOURCE
#endif

#if !defined(__APPLE__) && !defined(__linux__) && !defined(CHENG_MONITOR_WINDOWS)
#error "pure_cheng_perf_monitor requires Darwin libproc, Linux /proc, or Windows job-object RSS support"
#endif

#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#if !defined(CHENG_MONITOR_WINDOWS)
#include <sys/resource.h>
#endif
#include <sys/time.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#if defined(__linux__)
#include <dirent.h>
#endif

#if defined(__APPLE__)
#include <libproc.h>
#endif

#if defined(CHENG_MONITOR_WINDOWS)
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <psapi.h>
#if defined(__CYGWIN__) || defined(__MSYS__)
#include <sys/cygwin.h>
#endif
#ifndef PROCESS_QUERY_LIMITED_INFORMATION
#define PROCESS_QUERY_LIMITED_INFORMATION 0x1000
#endif
#endif

static pid_t g_child_pgid = -1;
#if defined(CHENG_MONITOR_WINDOWS)
static HANDLE g_child_job = NULL;
#endif

static void forward_signal(int signo) {
#if defined(CHENG_MONITOR_WINDOWS)
    if (g_child_job != NULL) {
        TerminateJobObject(g_child_job, (UINT)(128 + signo));
    }
#else
    if (g_child_pgid > 0) {
        kill(-g_child_pgid, signo);
    }
#endif
}

static void die_errno(const char *message) {
    fprintf(stderr, "pure_cheng_perf_monitor: %s: %s\n", message, strerror(errno));
    exit(2);
}

#if defined(CHENG_MONITOR_WINDOWS)
static void die_win32_code(const char *message, DWORD code) {
    char *text = NULL;
    DWORD flags = FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS;
    DWORD len = FormatMessageA(flags, NULL, code, 0, (LPSTR)&text, 0, NULL);
    if (len != 0 && text != NULL) {
        while (len > 0 && (text[len - 1] == '\r' || text[len - 1] == '\n')) {
            text[--len] = '\0';
        }
        fprintf(stderr, "pure_cheng_perf_monitor: %s: %s (win32=%lu)\n",
                message, text, (unsigned long)code);
        LocalFree(text);
    } else {
        fprintf(stderr, "pure_cheng_perf_monitor: %s: win32 error %lu\n",
                message, (unsigned long)code);
    }
    exit(2);
}

static void die_win32(const char *message) {
    die_win32_code(message, GetLastError());
}
#endif

static uint64_t now_ms(void) {
#if defined(CLOCK_MONOTONIC)
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) == 0) {
        return (uint64_t)ts.tv_sec * 1000u + (uint64_t)ts.tv_nsec / 1000000u;
    }
#endif
    struct timeval tv;
    if (gettimeofday(&tv, NULL) != 0) {
        die_errno("gettimeofday failed");
    }
    return (uint64_t)tv.tv_sec * 1000u + (uint64_t)tv.tv_usec / 1000u;
}

static void sleep_sample_interval(void) {
    struct timespec req;
    req.tv_sec = 0;
    req.tv_nsec = 10000000L;
    while (nanosleep(&req, &req) != 0) {
        if (errno != EINTR) {
            die_errno("nanosleep failed");
        }
    }
}

#if defined(__linux__)
static int parse_pid_name(const char *name, pid_t *pid_out) {
    long value = 0;
    const unsigned char *p = (const unsigned char *)name;
    if (*p == '\0') {
        return 0;
    }
    while (*p != '\0') {
        if (!isdigit(*p)) {
            return 0;
        }
        value = value * 10 + (long)(*p - '0');
        if (value > 2147483647L) {
            return 0;
        }
        p++;
    }
    *pid_out = (pid_t)value;
    return 1;
}

static int linux_proc_pgrp(pid_t pid, pid_t *pgrp_out) {
    char path[64];
    char buf[4096];
    snprintf(path, sizeof(path), "/proc/%ld/stat", (long)pid);
    FILE *f = fopen(path, "r");
    if (f == NULL) {
        return 0;
    }
    char *line = fgets(buf, sizeof(buf), f);
    fclose(f);
    if (line == NULL) {
        return 0;
    }
    char *rparen = strrchr(buf, ')');
    if (rparen == NULL) {
        return 0;
    }
    char state = 0;
    long ppid = 0;
    long pgrp = 0;
    if (sscanf(rparen + 2, "%c %ld %ld", &state, &ppid, &pgrp) != 3) {
        return 0;
    }
    (void)state;
    (void)ppid;
    *pgrp_out = (pid_t)pgrp;
    return 1;
}

static uint64_t linux_proc_rss_bytes(pid_t pid, long page_size) {
    char path[64];
    unsigned long size_pages = 0;
    unsigned long resident_pages = 0;
    snprintf(path, sizeof(path), "/proc/%ld/statm", (long)pid);
    FILE *f = fopen(path, "r");
    if (f == NULL) {
        return 0;
    }
    int ok = fscanf(f, "%lu %lu", &size_pages, &resident_pages);
    fclose(f);
    if (ok != 2) {
        return 0;
    }
    (void)size_pages;
    return (uint64_t)resident_pages * (uint64_t)page_size;
}

static uint64_t sample_process_group_rss_bytes(pid_t pgid) {
    DIR *dir = opendir("/proc");
    if (dir == NULL) {
        die_errno("open /proc failed");
    }
    long page_size = sysconf(_SC_PAGESIZE);
    if (page_size <= 0) {
        closedir(dir);
        die_errno("sysconf(_SC_PAGESIZE) failed");
    }
    uint64_t total = 0;
    struct dirent *ent = NULL;
    while ((ent = readdir(dir)) != NULL) {
        pid_t pid = 0;
        if (!parse_pid_name(ent->d_name, &pid)) {
            continue;
        }
        pid_t proc_pgrp = -1;
        if (!linux_proc_pgrp(pid, &proc_pgrp) || proc_pgrp != pgid) {
            continue;
        }
        total += linux_proc_rss_bytes(pid, page_size);
    }
    closedir(dir);
    return total;
}
#endif

#if defined(__APPLE__)
static uint64_t sample_process_group_rss_bytes(pid_t pgid) {
    int bytes = proc_listpids(PROC_ALL_PIDS, 0, NULL, 0);
    if (bytes <= 0) {
        die_errno("proc_listpids sizing failed");
    }
    size_t alloc_bytes = (size_t)bytes + 4096u;
    pid_t *pids = (pid_t *)malloc(alloc_bytes);
    if (pids == NULL) {
        die_errno("malloc pids failed");
    }
    int used_bytes = proc_listpids(PROC_ALL_PIDS, 0, pids, (int)alloc_bytes);
    if (used_bytes < 0) {
        free(pids);
        die_errno("proc_listpids failed");
    }
    uint64_t total = 0;
    int count = used_bytes / (int)sizeof(pid_t);
    for (int i = 0; i < count; i++) {
        pid_t pid = pids[i];
        if (pid <= 0) {
            continue;
        }
        struct proc_bsdinfo bsd;
        int bsd_bytes = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &bsd, sizeof(bsd));
        if (bsd_bytes != (int)sizeof(bsd) || (pid_t)bsd.pbi_pgid != pgid) {
            continue;
        }
        struct proc_taskinfo task;
        int task_bytes = proc_pidinfo(pid, PROC_PIDTASKINFO, 0, &task, sizeof(task));
        if (task_bytes == (int)sizeof(task)) {
            total += (uint64_t)task.pti_resident_size;
        }
    }
    free(pids);
    return total;
}
#endif

#if defined(CHENG_MONITOR_WINDOWS)
static DWORD windows_posix_pid_to_winpid(pid_t pid) {
#if defined(__CYGWIN__) || defined(__MSYS__)
    uintptr_t winpid = cygwin_internal(CW_CYGWIN_PID_TO_WINPID, pid);
    if (winpid == 0) {
        fprintf(stderr, "pure_cheng_perf_monitor: failed to map pid %ld to Windows pid\n", (long)pid);
        exit(2);
    }
    return (DWORD)winpid;
#else
    if (pid <= 0) {
        fprintf(stderr, "pure_cheng_perf_monitor: invalid child pid %ld\n", (long)pid);
        exit(2);
    }
    return (DWORD)pid;
#endif
}

static void windows_assign_child_to_job(pid_t child) {
    g_child_job = CreateJobObjectA(NULL, NULL);
    if (g_child_job == NULL) {
        die_win32("CreateJobObject failed");
    }

    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
    memset(&limits, 0, sizeof(limits));
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!SetInformationJobObject(g_child_job, JobObjectExtendedLimitInformation,
                                 &limits, sizeof(limits))) {
        die_win32("SetInformationJobObject failed");
    }

    DWORD winpid = windows_posix_pid_to_winpid(child);
    HANDLE process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE |
                                     PROCESS_QUERY_LIMITED_INFORMATION,
                                 FALSE, winpid);
    if (process == NULL) {
        die_win32("OpenProcess child failed");
    }
    if (!AssignProcessToJobObject(g_child_job, process)) {
        DWORD code = GetLastError();
        CloseHandle(process);
        die_win32_code("AssignProcessToJobObject failed", code);
    }
    CloseHandle(process);
}

static uint64_t windows_process_working_set_bytes(ULONG_PTR process_id) {
    HANDLE process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                                 FALSE, (DWORD)process_id);
    if (process == NULL) {
        DWORD code = GetLastError();
        if (code == ERROR_INVALID_PARAMETER) {
            return 0;
        }
        die_win32_code("OpenProcess for RSS failed", code);
    }

    PROCESS_MEMORY_COUNTERS counters;
    memset(&counters, 0, sizeof(counters));
    counters.cb = sizeof(counters);
    if (!GetProcessMemoryInfo(process, &counters, sizeof(counters))) {
        DWORD code = GetLastError();
        CloseHandle(process);
        if (code == ERROR_INVALID_PARAMETER) {
            return 0;
        }
        die_win32_code("GetProcessMemoryInfo failed", code);
    }
    CloseHandle(process);
    return (uint64_t)counters.WorkingSetSize;
}

static uint64_t sample_process_group_rss_bytes(pid_t pgid) {
    (void)pgid;
    if (g_child_job == NULL) {
        fprintf(stderr, "pure_cheng_perf_monitor: Windows child job is not initialized\n");
        exit(2);
    }

    DWORD capacity = 16;
    for (;;) {
        size_t alloc_bytes = sizeof(JOBOBJECT_BASIC_PROCESS_ID_LIST) +
                             ((size_t)capacity - 1u) * sizeof(ULONG_PTR);
        JOBOBJECT_BASIC_PROCESS_ID_LIST *ids =
            (JOBOBJECT_BASIC_PROCESS_ID_LIST *)malloc(alloc_bytes);
        if (ids == NULL) {
            die_errno("malloc job process list failed");
        }

        DWORD returned = 0;
        if (!QueryInformationJobObject(g_child_job, JobObjectBasicProcessIdList,
                                       ids, (DWORD)alloc_bytes, &returned)) {
            DWORD code = GetLastError();
            free(ids);
            die_win32_code("QueryInformationJobObject process list failed", code);
        }

        if (ids->NumberOfAssignedProcesses <= ids->NumberOfProcessIdsInList) {
            uint64_t total = 0;
            for (DWORD i = 0; i < ids->NumberOfProcessIdsInList; i++) {
                total += windows_process_working_set_bytes(ids->ProcessIdList[i]);
            }
            free(ids);
            return total;
        }

        capacity = ids->NumberOfAssignedProcesses + 8u;
        free(ids);
    }
}
#endif

#if !defined(CHENG_MONITOR_WINDOWS)
static uint64_t rusage_maxrss_bytes(const struct rusage *usage) {
#if defined(__APPLE__)
    return (uint64_t)usage->ru_maxrss;
#else
    return (uint64_t)usage->ru_maxrss * 1024u;
#endif
}
#endif

static int status_to_exit_code(int status) {
    if (WIFEXITED(status)) {
        return WEXITSTATUS(status);
    }
    if (WIFSIGNALED(status)) {
        return 128 + WTERMSIG(status);
    }
    return 125;
}

int main(int argc, char **argv) {
    if (argc < 4) {
        fprintf(stderr, "usage: %s <stdout-file> <stderr-file> <command> [args...]\n", argv[0]);
        return 2;
    }

    const char *stdout_path = argv[1];
    const char *stderr_path = argv[2];
    int out_fd = open(stdout_path, O_CREAT | O_TRUNC | O_WRONLY, 0666);
    if (out_fd < 0) {
        die_errno("open stdout file failed");
    }
    int err_fd = open(stderr_path, O_CREAT | O_TRUNC | O_WRONLY, 0666);
    if (err_fd < 0) {
        close(out_fd);
        die_errno("open stderr file failed");
    }

#if defined(CHENG_MONITOR_WINDOWS)
    int start_pipe[2] = {-1, -1};
    if (pipe(start_pipe) != 0) {
        close(out_fd);
        close(err_fd);
        die_errno("pipe failed");
    }
#endif

#if defined(CHENG_MONITOR_WINDOWS)
    signal(SIGINT, forward_signal);
    signal(SIGTERM, forward_signal);
#else
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = forward_signal;
    sigemptyset(&sa.sa_mask);
    sigaction(SIGINT, &sa, NULL);
    sigaction(SIGTERM, &sa, NULL);
#endif

    uint64_t start_ms = now_ms();
    pid_t child = fork();
    if (child < 0) {
#if defined(CHENG_MONITOR_WINDOWS)
        close(start_pipe[0]);
        close(start_pipe[1]);
#endif
        close(out_fd);
        close(err_fd);
        die_errno("fork failed");
    }
    if (child == 0) {
#if defined(CHENG_MONITOR_WINDOWS)
        close(start_pipe[1]);
#endif
        setpgid(0, 0);
        if (dup2(out_fd, STDOUT_FILENO) < 0 || dup2(err_fd, STDERR_FILENO) < 0) {
            _exit(127);
        }
        close(out_fd);
        close(err_fd);
#if defined(CHENG_MONITOR_WINDOWS)
        char release = 0;
        for (;;) {
            ssize_t n = read(start_pipe[0], &release, 1);
            if (n == 1) {
                break;
            }
            if (n < 0 && errno == EINTR) {
                continue;
            }
            _exit(127);
        }
        close(start_pipe[0]);
#endif
        execvp(argv[3], &argv[3]);
        _exit(errno == ENOENT ? 127 : 126);
    }

    close(out_fd);
    close(err_fd);
    if (setpgid(child, child) != 0 && errno != EACCES && errno != ESRCH) {
#if defined(CHENG_MONITOR_WINDOWS)
        close(start_pipe[0]);
        close(start_pipe[1]);
#else
        kill(child, SIGTERM);
#endif
        die_errno("set child process group failed");
    }
    g_child_pgid = child;

    uint64_t peak_rss = 0;
#if defined(CHENG_MONITOR_WINDOWS)
    close(start_pipe[0]);
    windows_assign_child_to_job(child);
    peak_rss = sample_process_group_rss_bytes(g_child_pgid);
    char release = 'x';
    ssize_t written = 0;
    do {
        written = write(start_pipe[1], &release, 1);
    } while (written < 0 && errno == EINTR);
    close(start_pipe[1]);
    if (written != 1) {
        if (g_child_job != NULL) {
            TerminateJobObject(g_child_job, 127);
        }
        die_errno("release child pipe write failed");
    }
#endif

    int status = 0;
#if !defined(CHENG_MONITOR_WINDOWS)
    struct rusage usage;
    memset(&usage, 0, sizeof(usage));
#endif
    for (;;) {
        uint64_t current_rss = sample_process_group_rss_bytes(g_child_pgid);
        if (current_rss > peak_rss) {
            peak_rss = current_rss;
        }

        pid_t waited = waitpid(child, &status, WNOHANG);
        if (waited == child) {
            break;
        }
        if (waited < 0) {
            if (errno == EINTR) {
                continue;
            }
            die_errno("wait4 failed");
        }
        sleep_sample_interval();
    }
#if !defined(CHENG_MONITOR_WINDOWS)
    if (getrusage(RUSAGE_CHILDREN, &usage) != 0) {
        die_errno("getrusage failed");
    }

    uint64_t usage_rss = rusage_maxrss_bytes(&usage);
    if (usage_rss > peak_rss) {
        peak_rss = usage_rss;
    }
#endif
    uint64_t elapsed_ms = now_ms() - start_ms;
    if (elapsed_ms == 0) {
        elapsed_ms = 1;
    }

    printf("gate_elapsed_ms=%llu\n", (unsigned long long)elapsed_ms);
    printf("gate_process_group_peak_rss_bytes=%llu\n", (unsigned long long)peak_rss);
    printf("gate_exit_code=%d\n", status_to_exit_code(status));
    return 0;
}
