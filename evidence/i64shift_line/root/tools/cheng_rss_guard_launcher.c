#if !defined(__APPLE__)
#define _POSIX_C_SOURCE 200809L
#endif

#include <errno.h>
#include <limits.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#if defined(CHENG_RSS_GUARD_FORCE_UNSUPPORTED_FOR_TEST)
#elif defined(__APPLE__)
#include <libproc.h>
#include <sys/proc.h>
#elif defined(__linux__)
#include <dirent.h>
#endif

#define CHENG_RSS_GUARD_DEFAULT_MAX_BYTES 1073741824LL
#define CHENG_RSS_GUARD_MAX_PROCESS_COUNT 1048576U
#ifndef CHENG_RSS_GUARD_POLL_NS
#define CHENG_RSS_GUARD_POLL_NS 10000000L
#endif

typedef struct {
    long long resident_bytes;
    long long phys_footprint_bytes;
    long long enforced_bytes;
    size_t process_count;
} ProcessTreeMemorySample;

typedef struct {
    pid_t pid;
    uint64_t start_identity;
    pid_t initial_pgid;
    pid_t initial_sid;
} ProcessIdentity;

typedef struct {
    ProcessIdentity *items;
    size_t len;
    size_t cap;
} ProcessIdentityHistory;

static void identity_history_release(ProcessIdentityHistory *history) {
    free(history->items);
    history->items = NULL;
    history->len = 0;
    history->cap = 0;
}

#if !defined(CHENG_RSS_GUARD_FORCE_UNSUPPORTED_FOR_TEST) && \
    (defined(__APPLE__) || defined(__linux__))
static ProcessIdentity *identity_history_find(ProcessIdentityHistory *history,
                                              pid_t pid) {
    for (size_t i = 0; i < history->len; i++) {
        if (history->items[i].pid == pid) return &history->items[i];
    }
    return NULL;
}

static int identity_history_add(ProcessIdentityHistory *history,
                                ProcessIdentity identity) {
    ProcessIdentity *existing = identity_history_find(history, identity.pid);
    if (existing) return existing->start_identity == identity.start_identity;
    if (history->len >= CHENG_RSS_GUARD_MAX_PROCESS_COUNT) return 0;
    if (history->len == history->cap) {
        size_t next = history->cap == 0 ? 32U : history->cap * 2U;
        if (next > CHENG_RSS_GUARD_MAX_PROCESS_COUNT) {
            next = CHENG_RSS_GUARD_MAX_PROCESS_COUNT;
        }
        if (next <= history->cap || next > SIZE_MAX / sizeof(ProcessIdentity)) return 0;
        ProcessIdentity *grown =
            (ProcessIdentity *)realloc(history->items, next * sizeof(ProcessIdentity));
        if (!grown) return 0;
        history->items = grown;
        history->cap = next;
    }
    history->items[history->len++] = identity;
    return 1;
}
#endif

static long long parse_positive_i64(const char *raw) {
    if (!raw || raw[0] == '\0') return 0;
    long long value = 0;
    for (const char *p = raw; *p; p++) {
        if (*p < '0' || *p > '9') return -1;
        long long digit = (long long)(*p - '0');
        if (value > (LLONG_MAX - digit) / 10LL) return -1;
        value = value * 10LL + digit;
    }
    return value > 0 ? value : -1;
}

static long long configured_max_memory_bytes(void) {
    const char *legacy_names[] = {
        "PROCESS_MAX_RSS_BYTES",
        "CHENG_MAX_RSS_BYTES",
        "MAX_RSS_BYTES",
        "PARENT_RSS_GUARD",
    };
    for (size_t i = 0; i < sizeof(legacy_names) / sizeof(legacy_names[0]); i++) {
        if (getenv(legacy_names[i]) != NULL) return -1;
    }
    const char *raw = getenv("CHENG_PROCESS_MAX_RSS_BYTES");
    if (!raw || raw[0] == '\0') return CHENG_RSS_GUARD_DEFAULT_MAX_BYTES;
    return parse_positive_i64(raw);
}

#if !defined(CHENG_RSS_GUARD_FORCE_UNSUPPORTED_FOR_TEST) && \
    (defined(__APPLE__) || defined(__linux__))
static int checked_add_i64(long long *total, long long value) {
    if (value < 0 || *total > LLONG_MAX - value) return 0;
    *total += value;
    return 1;
}
#endif

#if defined(CHENG_RSS_GUARD_FORCE_UNSUPPORTED_FOR_TEST)

static int platform_memory_preflight(void) {
    return 0;
}

static int process_tree_memory_sample(pid_t root_pid,
                                      pid_t pgid,
                                      pid_t sid,
                                      ProcessIdentityHistory *history,
                                      pid_t *escape_pid,
                                      ProcessTreeMemorySample *sample) {
    (void)root_pid;
    (void)pgid;
    (void)sid;
    (void)history;
    (void)escape_pid;
    memset(sample, 0, sizeof(*sample));
    return -1;
}

static const char *memory_enforcement_metric_name(void) {
    return "unsupported";
}

static const char *phys_footprint_status_name(void) {
    return "unsupported";
}

#elif defined(__APPLE__)

typedef struct {
    pid_t *items;
    size_t len;
    size_t cap;
} PidSet;

static void pid_set_release(PidSet *set) {
    free(set->items);
    set->items = NULL;
    set->len = 0;
    set->cap = 0;
}

static int pid_set_contains(const PidSet *set, pid_t pid) {
    for (size_t i = 0; i < set->len; i++) {
        if (set->items[i] == pid) return 1;
    }
    return 0;
}

static int pid_set_add(PidSet *set, pid_t pid) {
    if (pid <= 0 || pid_set_contains(set, pid)) return 1;
    if (set->len >= CHENG_RSS_GUARD_MAX_PROCESS_COUNT) return 0;
    if (set->len == set->cap) {
        size_t next = set->cap == 0 ? 32U : set->cap * 2U;
        if (next > CHENG_RSS_GUARD_MAX_PROCESS_COUNT) {
            next = CHENG_RSS_GUARD_MAX_PROCESS_COUNT;
        }
        if (next <= set->cap || next > SIZE_MAX / sizeof(pid_t)) return 0;
        pid_t *grown = (pid_t *)realloc(set->items, next * sizeof(pid_t));
        if (!grown) return 0;
        set->items = grown;
        set->cap = next;
    }
    set->items[set->len++] = pid;
    return 1;
}

typedef int (*DarwinPidListFn)(pid_t, void *, int);

static int darwin_append_pid_list(PidSet *set, DarwinPidListFn list_fn, pid_t key) {
    size_t cap = 64U;
    for (;;) {
        if (cap > CHENG_RSS_GUARD_MAX_PROCESS_COUNT ||
            cap > (size_t)INT_MAX / sizeof(pid_t)) {
            return -1;
        }
        pid_t *buffer = (pid_t *)calloc(cap, sizeof(pid_t));
        if (!buffer) return -1;
        errno = 0;
        int count = list_fn(key, buffer, (int)(cap * sizeof(pid_t)));
        int saved_errno = errno;
        if (count < 0) {
            free(buffer);
            if (saved_errno == ESRCH) return 1;
            return -1;
        }
        if ((size_t)count < cap) {
            for (int i = 0; i < count; i++) {
                if (!pid_set_add(set, buffer[i])) {
                    free(buffer);
                    return -1;
                }
            }
            free(buffer);
            return 1;
        }
        free(buffer);
        if (cap > CHENG_RSS_GUARD_MAX_PROCESS_COUNT / 2U) return -1;
        cap *= 2U;
    }
}

static int darwin_pid_is_live_non_zombie(pid_t pid) {
    struct proc_bsdinfo info;
    int rc = proc_pidinfo((int)pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info));
    if (rc != (int)sizeof(info)) return 0;
    return info.pbi_status != SZOMB;
}

/* 1 = measured, 0 = process vanished/zombie, -1 = required metric unavailable. */
static int darwin_process_snapshot(pid_t pid,
                                   ProcessIdentity *identity,
                                   long long *resident,
                                   long long *footprint) {
    struct proc_bsdinfo info;
    int info_rc = proc_pidinfo((int)pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info));
    if (info_rc != (int)sizeof(info) || info.pbi_status == SZOMB) return 0;

    struct proc_taskinfo task;
    int task_rc = proc_pidinfo((int)pid, PROC_PIDTASKINFO, 0, &task, sizeof(task));
    if (task_rc != (int)sizeof(task)) {
        return darwin_pid_is_live_non_zombie(pid) ? -1 : 0;
    }

    struct rusage_info_v0 usage;
    memset(&usage, 0, sizeof(usage));
    if (proc_pid_rusage((int)pid, RUSAGE_INFO_V0, (rusage_info_t *)&usage) != 0) {
        return darwin_pid_is_live_non_zombie(pid) ? -1 : 0;
    }
    if (task.pti_resident_size > (uint64_t)LLONG_MAX ||
        usage.ri_phys_footprint == 0 ||
        usage.ri_phys_footprint > (uint64_t)LLONG_MAX ||
        info.pbi_start_tvsec > UINT64_MAX / 1000000ULL) {
        return -1;
    }
    pid_t current_sid = getsid(pid);
    if (current_sid <= 0 || info.pbi_pgid == 0 || info.pbi_pgid > INT_MAX) return -1;
    identity->pid = pid;
    identity->start_identity =
        info.pbi_start_tvsec * 1000000ULL + info.pbi_start_tvusec;
    identity->initial_pgid = (pid_t)info.pbi_pgid;
    identity->initial_sid = current_sid;
    *resident = (long long)task.pti_resident_size;
    *footprint = (long long)usage.ri_phys_footprint;
    return 1;
}

static int platform_memory_preflight(void) {
    ProcessIdentity identity;
    long long resident = 0;
    long long footprint = 0;
    return darwin_process_snapshot(getpid(), &identity, &resident, &footprint) == 1 &&
           resident > 0 && footprint > 0;
}

static int process_tree_memory_sample(pid_t root_pid,
                                      pid_t pgid,
                                      pid_t sid,
                                      ProcessIdentityHistory *history,
                                      pid_t *escape_pid,
                                      ProcessTreeMemorySample *sample) {
    memset(sample, 0, sizeof(*sample));
    PidSet set = {0};
    if (!pid_set_add(&set, root_pid)) return -1;
    for (size_t i = 0; i < history->len; i++) {
        if (!pid_set_add(&set, history->items[i].pid)) {
            pid_set_release(&set);
            return -1;
        }
    }
    for (size_t i = 0; i < set.len; i++) {
        if (darwin_append_pid_list(&set, proc_listchildpids, set.items[i]) < 0) {
            pid_set_release(&set);
            return -1;
        }
    }

    for (size_t i = 0; i < set.len; i++) {
        ProcessIdentity identity;
        long long resident = 0;
        long long footprint = 0;
        int measured =
            darwin_process_snapshot(set.items[i], &identity, &resident, &footprint);
        if (measured < 0) {
            pid_set_release(&set);
            return -1;
        }
        if (measured == 0) continue;
        ProcessIdentity *previous = identity_history_find(history, identity.pid);
        if (previous && previous->start_identity != identity.start_identity) {
            *escape_pid = identity.pid;
            pid_set_release(&set);
            return -2;
        }
        if (!previous &&
            (identity.initial_pgid != pgid || identity.initial_sid != sid)) {
            if (!identity_history_add(history, identity)) {
                pid_set_release(&set);
                return -1;
            }
            *escape_pid = identity.pid;
            pid_set_release(&set);
            return -2;
        }
        if (!identity_history_add(history, identity)) {
            pid_set_release(&set);
            return -1;
        }
    }

    for (size_t i = 0; i < history->len; i++) {
        ProcessIdentity current;
        long long resident = 0;
        long long footprint = 0;
        int measured = darwin_process_snapshot(
            history->items[i].pid, &current, &resident, &footprint);
        if (measured < 0 ||
            (measured > 0 &&
             (!checked_add_i64(&sample->resident_bytes, resident) ||
              !checked_add_i64(&sample->phys_footprint_bytes, footprint)))) {
            pid_set_release(&set);
            return -1;
        }
        if (measured == 0 || current.start_identity != history->items[i].start_identity) {
            continue;
        }
        if (current.initial_pgid != history->items[i].initial_pgid ||
            current.initial_sid != history->items[i].initial_sid) {
            *escape_pid = current.pid;
            pid_set_release(&set);
            return -2;
        }
        sample->process_count++;
    }
    pid_set_release(&set);
    sample->enforced_bytes = sample->resident_bytes > sample->phys_footprint_bytes
                                 ? sample->resident_bytes
                                 : sample->phys_footprint_bytes;
    return 1;
}

static const char *memory_enforcement_metric_name(void) {
    return "max_process_tree_resident_and_phys_footprint";
}

static const char *phys_footprint_status_name(void) {
    return "available";
}

#elif defined(__linux__)

typedef struct {
    pid_t pid;
    pid_t ppid;
    pid_t pgrp;
    pid_t sid;
    uint64_t start_identity;
    long long resident_bytes;
    int selected;
} LinuxProcessRow;

typedef struct {
    LinuxProcessRow *items;
    size_t len;
    size_t cap;
} LinuxProcessRows;

static int parse_pid_name(const char *name, pid_t *pid) {
    if (!name || name[0] == '\0') return 0;
    long long value = 0;
    for (const char *p = name; *p; p++) {
        if (*p < '0' || *p > '9') return 0;
        value = value * 10LL + (long long)(*p - '0');
        if (value > INT_MAX) return 0;
    }
    if (value <= 0) return 0;
    *pid = (pid_t)value;
    return 1;
}

static int parse_i64_token(const char *token, long long *value) {
    if (!token || token[0] == '\0') return 0;
    errno = 0;
    char *end = NULL;
    long long parsed = strtoll(token, &end, 10);
    if (errno != 0 || !end || *end != '\0') return 0;
    *value = parsed;
    return 1;
}

/* 1 = read, 0 = process vanished/inaccessible, -1 = malformed required row. */
static int linux_read_process_row(pid_t pid, LinuxProcessRow *row) {
    char path[64];
    int written = snprintf(path, sizeof(path), "/proc/%d/stat", (int)pid);
    if (written <= 0 || (size_t)written >= sizeof(path)) return -1;
    FILE *file = fopen(path, "r");
    if (!file) {
        if (errno == ENOENT || errno == ESRCH || errno == EACCES) return 0;
        return -1;
    }
    char *line = NULL;
    size_t line_cap = 0;
    ssize_t line_len = getline(&line, &line_cap, file);
    int saved_errno = errno;
    fclose(file);
    if (line_len <= 0) {
        free(line);
        if (saved_errno == ENOENT || saved_errno == ESRCH) return 0;
        return -1;
    }
    char *right_paren = strrchr(line, ')');
    if (!right_paren || right_paren[1] != ' ') {
        free(line);
        return -1;
    }

    long long ppid = 0;
    long long pgrp = 0;
    long long start_identity = 0;
    long long rss_pages = 0;
    char *save = NULL;
    char *token = strtok_r(right_paren + 2, " ", &save);
    int field_after_comm = 0;
    while (token) {
        if (field_after_comm == 1 && !parse_i64_token(token, &ppid)) {
            free(line);
            return -1;
        }
        if (field_after_comm == 2 && !parse_i64_token(token, &pgrp)) {
            free(line);
            return -1;
        }
        if (field_after_comm == 19 &&
            (!parse_i64_token(token, &start_identity) || start_identity <= 0)) {
            free(line);
            return -1;
        }
        if (field_after_comm == 21) {
            if (!parse_i64_token(token, &rss_pages) || rss_pages < 0) {
                free(line);
                return -1;
            }
            break;
        }
        field_after_comm++;
        token = strtok_r(NULL, " ", &save);
    }
    free(line);
    pid_t sid = getsid(pid);
    if (field_after_comm != 21 || ppid < 0 || ppid > INT_MAX ||
        pgrp <= 0 || pgrp > INT_MAX || sid <= 0 || start_identity <= 0) {
        return -1;
    }
    long page_size = sysconf(_SC_PAGESIZE);
    if (page_size <= 0 || rss_pages > LLONG_MAX / page_size) return -1;
    row->pid = pid;
    row->ppid = (pid_t)ppid;
    row->pgrp = (pid_t)pgrp;
    row->sid = sid;
    row->start_identity = (uint64_t)start_identity;
    row->resident_bytes = rss_pages * page_size;
    row->selected = 0;
    return 1;
}

static void linux_rows_release(LinuxProcessRows *rows) {
    free(rows->items);
    rows->items = NULL;
    rows->len = 0;
    rows->cap = 0;
}

static int linux_rows_append(LinuxProcessRows *rows, LinuxProcessRow row) {
    if (rows->len >= CHENG_RSS_GUARD_MAX_PROCESS_COUNT) return 0;
    if (rows->len == rows->cap) {
        size_t next = rows->cap == 0 ? 64U : rows->cap * 2U;
        if (next > CHENG_RSS_GUARD_MAX_PROCESS_COUNT) {
            next = CHENG_RSS_GUARD_MAX_PROCESS_COUNT;
        }
        if (next <= rows->cap || next > SIZE_MAX / sizeof(LinuxProcessRow)) return 0;
        LinuxProcessRow *grown =
            (LinuxProcessRow *)realloc(rows->items, next * sizeof(LinuxProcessRow));
        if (!grown) return 0;
        rows->items = grown;
        rows->cap = next;
    }
    rows->items[rows->len++] = row;
    return 1;
}

static int platform_memory_preflight(void) {
    LinuxProcessRow row;
    return linux_read_process_row(getpid(), &row) == 1 && row.resident_bytes > 0;
}

static int process_tree_memory_sample(pid_t root_pid,
                                      pid_t pgid,
                                      pid_t sid,
                                      ProcessIdentityHistory *history,
                                      pid_t *escape_pid,
                                      ProcessTreeMemorySample *sample) {
    memset(sample, 0, sizeof(*sample));
    DIR *proc = opendir("/proc");
    if (!proc) return -1;
    LinuxProcessRows rows = {0};
    struct dirent *entry = NULL;
    while ((entry = readdir(proc)) != NULL) {
        pid_t pid = 0;
        if (!parse_pid_name(entry->d_name, &pid)) continue;
        LinuxProcessRow row;
        int read_status = linux_read_process_row(pid, &row);
        if (read_status < 0 || (read_status > 0 && !linux_rows_append(&rows, row))) {
            closedir(proc);
            linux_rows_release(&rows);
            return -1;
        }
    }
    closedir(proc);

    for (size_t i = 0; i < rows.len; i++) {
        int historical = 0;
        for (size_t member = 0; member < history->len; member++) {
            if (history->items[member].pid == rows.items[i].pid &&
                history->items[member].start_identity == rows.items[i].start_identity) {
                historical = 1;
                break;
            }
        }
        if (rows.items[i].pid == root_pid || historical) {
            rows.items[i].selected = 1;
        }
    }
    int changed = 1;
    while (changed) {
        changed = 0;
        for (size_t i = 0; i < rows.len; i++) {
            if (rows.items[i].selected) continue;
            for (size_t parent = 0; parent < rows.len; parent++) {
                if (rows.items[parent].selected &&
                    rows.items[i].ppid == rows.items[parent].pid) {
                    rows.items[i].selected = 1;
                    changed = 1;
                    break;
                }
            }
        }
    }
    for (size_t i = 0; i < rows.len; i++) {
        if (!rows.items[i].selected) continue;
        ProcessIdentity identity = {
            rows.items[i].pid,
            rows.items[i].start_identity,
            rows.items[i].pgrp,
            rows.items[i].sid,
        };
        ProcessIdentity *previous = identity_history_find(history, identity.pid);
        if (previous && previous->start_identity != identity.start_identity) {
            *escape_pid = identity.pid;
            linux_rows_release(&rows);
            return -2;
        }
        if (!previous &&
            (identity.initial_pgid != pgid || identity.initial_sid != sid)) {
            if (!identity_history_add(history, identity)) {
                linux_rows_release(&rows);
                return -1;
            }
            *escape_pid = identity.pid;
            linux_rows_release(&rows);
            return -2;
        }
        if (!identity_history_add(history, identity)) {
            linux_rows_release(&rows);
            return -1;
        }
    }
    for (size_t member = 0; member < history->len; member++) {
        for (size_t i = 0; i < rows.len; i++) {
            if (rows.items[i].pid != history->items[member].pid ||
                rows.items[i].start_identity != history->items[member].start_identity) {
                continue;
            }
            if (rows.items[i].pgrp != history->items[member].initial_pgid ||
                rows.items[i].sid != history->items[member].initial_sid) {
                *escape_pid = rows.items[i].pid;
                linux_rows_release(&rows);
                return -2;
            }
            if (!checked_add_i64(&sample->resident_bytes, rows.items[i].resident_bytes)) {
                linux_rows_release(&rows);
                return -1;
            }
            sample->process_count++;
            break;
        }
    }
    linux_rows_release(&rows);
    sample->phys_footprint_bytes = 0;
    sample->enforced_bytes = sample->resident_bytes;
    return 1;
}

static const char *memory_enforcement_metric_name(void) {
    return "process_tree_resident";
}

static const char *phys_footprint_status_name(void) {
    return "unsupported";
}

#else

static int platform_memory_preflight(void) {
    return 0;
}

static int process_tree_memory_sample(pid_t root_pid,
                                      pid_t pgid,
                                      pid_t sid,
                                      ProcessIdentityHistory *history,
                                      pid_t *escape_pid,
                                      ProcessTreeMemorySample *sample) {
    (void)root_pid;
    (void)pgid;
    (void)sid;
    (void)history;
    (void)escape_pid;
    memset(sample, 0, sizeof(*sample));
    return -1;
}

static const char *memory_enforcement_metric_name(void) {
    return "unsupported";
}

static const char *phys_footprint_status_name(void) {
    return "unsupported";
}

#endif

static const char *enforcement_kind_name(void) {
#if defined(__APPLE__) && !defined(CHENG_RSS_GUARD_FORCE_UNSUPPORTED_FOR_TEST)
    return "darwin_cooperative_process_tree_poll";
#else
    return "userspace_cooperative_process_tree_poll";
#endif
}

static int platform_identity_matches(const ProcessIdentity *identity) {
#if defined(CHENG_RSS_GUARD_FORCE_UNSUPPORTED_FOR_TEST)
    (void)identity;
    return 0;
#elif defined(__APPLE__)
    ProcessIdentity current;
    long long resident = 0;
    long long footprint = 0;
    int rc = darwin_process_snapshot(
        identity->pid, &current, &resident, &footprint);
    return rc == 1 && current.start_identity == identity->start_identity;
#elif defined(__linux__)
    LinuxProcessRow row;
    int rc = linux_read_process_row(identity->pid, &row);
    return rc == 1 && row.start_identity == identity->start_identity;
#else
    (void)identity;
    return 0;
#endif
}

static void print_memory_exceeded(const ProcessTreeMemorySample *sample,
                                  long long limit) {
    fprintf(stderr,
            "compile_progress phase=resource_guard status=rss_limit_exceeded "
            "memory_limit_bytes=%lld enforcement_metric=%s enforcement_kind=%s "
            "process_tree_resident_bytes=%lld "
            "process_tree_phys_footprint_bytes=%lld "
            "process_tree_phys_footprint_status=%s "
            "process_tree_enforced_bytes=%lld\n",
            limit,
            memory_enforcement_metric_name(),
            enforcement_kind_name(),
            sample->resident_bytes,
            sample->phys_footprint_bytes,
            phys_footprint_status_name(),
            sample->enforced_bytes);
}

static void print_measurement_unavailable(void) {
    fprintf(stderr,
            "compile_progress phase=resource_guard status=memory_measurement_unavailable "
            "enforcement_metric=%s enforcement_kind=%s "
            "process_tree_phys_footprint_status=%s\n",
            memory_enforcement_metric_name(),
            enforcement_kind_name(),
            phys_footprint_status_name());
}

static int sibling_real_path(const char *argv0, char *out, size_t out_cap) {
    const char *slash = strrchr(argv0, '/');
    if (!slash) {
        int n = snprintf(out, out_cap, "%s.real", argv0);
        return n > 0 && (size_t)n < out_cap;
    }
    size_t dir_len = (size_t)(slash - argv0 + 1);
    if (dir_len + strlen("cheng.real") + 1 > out_cap) return 0;
    memcpy(out, argv0, dir_len);
    strcpy(out + dir_len, "cheng.real");
    return 1;
}

static volatile sig_atomic_t received_signal = 0;

static void sleep_poll_interval(void) {
    struct timespec delay;
    delay.tv_sec = (time_t)(CHENG_RSS_GUARD_POLL_NS / 1000000000L);
    delay.tv_nsec = CHENG_RSS_GUARD_POLL_NS % 1000000000L;
    while (nanosleep(&delay, &delay) != 0 && errno == EINTR && !received_signal) {
    }
}

static void guard_signal_handler(int signum) {
    received_signal = signum;
}

static int install_signal_handlers(void) {
    struct sigaction action;
    memset(&action, 0, sizeof(action));
    action.sa_handler = guard_signal_handler;
    if (sigemptyset(&action.sa_mask) != 0) return 0;
    return sigaction(SIGHUP, &action, NULL) == 0 &&
           sigaction(SIGINT, &action, NULL) == 0 &&
           sigaction(SIGTERM, &action, NULL) == 0;
}

static void restore_child_signal_handlers(void) {
    struct sigaction action;
    memset(&action, 0, sizeof(action));
    action.sa_handler = SIG_DFL;
    (void)sigemptyset(&action.sa_mask);
    (void)sigaction(SIGHUP, &action, NULL);
    (void)sigaction(SIGINT, &action, NULL);
    (void)sigaction(SIGTERM, &action, NULL);
}

static int write_barrier_byte(int fd, char value) {
    for (;;) {
        ssize_t written = write(fd, &value, 1);
        if (written == 1) return 1;
        if (written < 0 && errno == EINTR && !received_signal) continue;
        return 0;
    }
}

static int read_barrier_byte(int fd, char expected) {
    char value = 0;
    for (;;) {
        ssize_t count = read(fd, &value, 1);
        if (count == 1) return value == expected;
        if (count < 0 && errno == EINTR && !received_signal) continue;
        return 0;
    }
}

static void scrub_guard_environment_for_target(void) {
    const char *names[] = {
        "CHENG_RSS_GUARD_REAL",
        "CHENG_PROCESS_MAX_RSS_BYTES",
        "CHENG_PARENT_RSS_GUARD",
        "CHENG_RSS_GUARD_CAPABILITY_FD",
        "BEAT_C_GUARD_REPORT",
        "BEAT_C_GUARD_STDOUT",
        "BEAT_C_GUARD_STDERR",
        "BEAT_C_GUARD_RESOURCE_TRACE",
        "BEAT_C_GUARD_PHASE_TRACE",
        "BEAT_C_GUARD_RSS_LIMIT_BYTES",
        "BEAT_C_GUARD_TIMEOUT_SECONDS",
        "BEAT_C_GUARD_POLL_SECONDS",
    };
    for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++) {
        (void)unsetenv(names[i]);
    }
}

static void kill_identity_history(ProcessIdentityHistory *history,
                                  int signum) {
    for (size_t i = 0; i < history->len; i++) {
        if (platform_identity_matches(&history->items[i])) {
            (void)kill(history->items[i].pid, signum);
        }
    }
}

static int refresh_cleanup_history(ProcessIdentityHistory *history,
                                   pid_t child,
                                   pid_t root_pgid,
                                   pid_t root_sid) {
    if (child <= 0 || root_pgid <= 0 || root_sid <= 0) return 1;
    ProcessTreeMemorySample sample;
    pid_t escape_pid = 0;
    int rc = process_tree_memory_sample(
        child, root_pgid, root_sid, history, &escape_pid, &sample);
    return rc != -1;
}

static size_t live_identity_count(ProcessIdentityHistory *history) {
    size_t count = 0;
    for (size_t i = 0; i < history->len; i++) {
        if (platform_identity_matches(&history->items[i])) count++;
    }
    return count;
}

static size_t wait_for_identity_exit(ProcessIdentityHistory *history,
                                     pid_t child,
                                     pid_t root_pgid,
                                     pid_t root_sid,
                                     size_t max_polls) {
    for (size_t poll = 0; poll < max_polls; poll++) {
        size_t live = live_identity_count(history);
        if (live == 0) return 0;
        (void)refresh_cleanup_history(history, child, root_pgid, root_sid);
        sleep_poll_interval();
    }
    (void)refresh_cleanup_history(history, child, root_pgid, root_sid);
    return live_identity_count(history);
}

static int cleanup_child(ProcessIdentityHistory *history,
                         pid_t child,
                         pid_t root_pgid,
                         pid_t root_sid,
                         int *status,
                         int *root_done) {
    int discovery_available =
        refresh_cleanup_history(history, child, root_pgid, root_sid);
    kill_identity_history(history, SIGTERM);
    size_t live = wait_for_identity_exit(
        history, child, root_pgid, root_sid, 50U);
    if (live > 0) {
        kill_identity_history(history, SIGKILL);
        live = wait_for_identity_exit(
            history, child, root_pgid, root_sid, 500U);
    }
    if (!discovery_available) {
        fprintf(stderr,
                "compile_progress phase=resource_guard "
                "status=cleanup_identity_discovery_unavailable\n");
    }
    if (live > 0) {
        fprintf(stderr,
                "compile_progress phase=resource_guard "
                "status=cleanup_identity_timeout live_identity_count=%zu\n",
                live);
        if (child > 0) (void)kill(child, SIGKILL);
    }
    if (!*root_done && child > 0) {
        for (;;) {
            pid_t done = waitpid(child, status, 0);
            if (done == child || (done < 0 && errno == ECHILD)) {
                *root_done = 1;
                break;
            }
            if (done < 0 && errno == EINTR) continue;
            break;
        }
    }
    while (waitpid(-1, NULL, WNOHANG) > 0) {
    }
    return live == 0 && discovery_available;
}

static void print_process_escape(pid_t pid) {
    fprintf(stderr,
            "compile_progress phase=resource_guard status=process_tree_escape_detected "
            "pid=%d enforcement_kind=%s\n",
            (int)pid,
            enforcement_kind_name());
}

int main(int argc, char **argv) {
    long long max_memory = configured_max_memory_bytes();
    if (max_memory < 0) {
        fprintf(stderr, "compile_progress phase=resource_guard status=invalid_max_rss\n");
        return 2;
    }
    if (max_memory > 0 && !platform_memory_preflight()) {
        print_measurement_unavailable();
        return 2;
    }

    char real_path[PATH_MAX];
    const char *env_real = getenv("CHENG_RSS_GUARD_REAL");
    if (env_real && env_real[0] != '\0') {
        if (strlen(env_real) + 1 > sizeof(real_path)) {
            fprintf(stderr, "cheng rss guard real path too long\n");
            return 2;
        }
        strcpy(real_path, env_real);
    } else if (!sibling_real_path(argv[0], real_path, sizeof(real_path))) {
        fprintf(stderr, "cheng rss guard cannot resolve real compiler\n");
        return 2;
    }

    char **child_argv = (char **)calloc((size_t)argc + 1, sizeof(char *));
    if (!child_argv) {
        fprintf(stderr, "cheng rss guard argv allocation failed\n");
        return 2;
    }
    child_argv[0] = real_path;
    for (int i = 1; i < argc; i++) child_argv[i] = argv[i];
    child_argv[argc] = NULL;

    if (!install_signal_handlers()) {
        fprintf(stderr, "cheng rss guard signal handler setup failed: %s\n", strerror(errno));
        free(child_argv);
        return 2;
    }

    int release_pipe[2] = {-1, -1};
    int ready_pipe[2] = {-1, -1};
    if (pipe(release_pipe) != 0 || pipe(ready_pipe) != 0) {
        fprintf(stderr, "cheng rss guard startup pipe failed: %s\n", strerror(errno));
        if (release_pipe[0] >= 0) close(release_pipe[0]);
        if (release_pipe[1] >= 0) close(release_pipe[1]);
        if (ready_pipe[0] >= 0) close(ready_pipe[0]);
        if (ready_pipe[1] >= 0) close(ready_pipe[1]);
        free(child_argv);
        return 2;
    }

    pid_t child = fork();
    if (child < 0) {
        fprintf(stderr, "cheng rss guard fork failed: %s\n", strerror(errno));
        close(release_pipe[0]);
        close(release_pipe[1]);
        close(ready_pipe[0]);
        close(ready_pipe[1]);
        free(child_argv);
        return 2;
    }
    if (child == 0) {
        close(release_pipe[1]);
        close(ready_pipe[0]);
        if (!write_barrier_byte(ready_pipe[1], 'R') ||
            close(ready_pipe[1]) != 0 ||
            !read_barrier_byte(release_pipe[0], 'G')) {
            _exit(126);
        }
        close(release_pipe[0]);
        restore_child_signal_handlers();
        scrub_guard_environment_for_target();
        execv(real_path, child_argv);
        fprintf(stderr, "cheng rss guard exec failed: %s: %s\n", real_path, strerror(errno));
        _exit(127);
    }

    free(child_argv);
    close(release_pipe[0]);
    close(ready_pipe[1]);

    int status = 0;
    int root_done = 0;
    int result = 2;
    pid_t root_pgid = -1;
    pid_t root_sid = -1;
    pid_t escape_pid = 0;
    ProcessIdentityHistory history = {0};

    if (!read_barrier_byte(ready_pipe[0], 'R') || received_signal) {
        close(ready_pipe[0]);
        close(release_pipe[1]);
        (void)cleanup_child(
            &history, child, root_pgid, root_sid, &status, &root_done);
        identity_history_release(&history);
        return received_signal ? 128 + received_signal : 2;
    }
    close(ready_pipe[0]);
    root_pgid = getpgid(child);
    root_sid = getsid(child);
    if (root_pgid <= 0 || root_sid <= 0) {
        close(release_pipe[1]);
        (void)cleanup_child(
            &history, child, root_pgid, root_sid, &status, &root_done);
        identity_history_release(&history);
        print_measurement_unavailable();
        return 2;
    }

    ProcessTreeMemorySample sample;
    int sample_rc = process_tree_memory_sample(
        child, root_pgid, root_sid, &history, &escape_pid, &sample);
    if (sample_rc != 1 || sample.process_count == 0) {
        close(release_pipe[1]);
        if (sample_rc == -2) print_process_escape(escape_pid);
        else print_measurement_unavailable();
        (void)cleanup_child(
            &history, child, root_pgid, root_sid, &status, &root_done);
        identity_history_release(&history);
        return 2;
    }
    if (sample.enforced_bytes > max_memory) {
        close(release_pipe[1]);
        print_memory_exceeded(&sample, max_memory);
        (void)cleanup_child(
            &history, child, root_pgid, root_sid, &status, &root_done);
        identity_history_release(&history);
        return 2;
    }
    if (!write_barrier_byte(release_pipe[1], 'G')) {
        close(release_pipe[1]);
        (void)cleanup_child(
            &history, child, root_pgid, root_sid, &status, &root_done);
        identity_history_release(&history);
        return received_signal ? 128 + received_signal : 2;
    }
    close(release_pipe[1]);

    /* Darwin/libproc is cooperative polling, not a kernel hard limit. A peak
       that starts and ends between samples cannot be proved by this launcher. */
    for (;;) {
        if (received_signal) {
            result = 128 + received_signal;
            break;
        }
        if (!root_done) {
            pid_t done = waitpid(child, &status, WNOHANG);
            if (done == child) {
                root_done = 1;
            } else if (done < 0) {
                if (errno == EINTR) {
                    if (received_signal) {
                        result = 128 + received_signal;
                        break;
                    }
                    continue;
                }
                fprintf(stderr, "cheng rss guard wait failed: %s\n", strerror(errno));
                result = 2;
                break;
            }
        }

        sample_rc = process_tree_memory_sample(
            child, root_pgid, root_sid, &history, &escape_pid, &sample);
        if (sample_rc != 1) {
            if (sample_rc == -2) print_process_escape(escape_pid);
            else print_measurement_unavailable();
            result = 2;
            break;
        }
        if (sample.enforced_bytes > max_memory) {
            print_memory_exceeded(&sample, max_memory);
            result = 2;
            break;
        }
        if (root_done && sample.process_count == 0) {
            if (WIFEXITED(status)) result = WEXITSTATUS(status);
            else if (WIFSIGNALED(status)) result = 128 + WTERMSIG(status);
            else result = 2;
            break;
        }
        sleep_poll_interval();
    }

    if (result == 2 || received_signal) {
        if (!cleanup_child(
                &history, child, root_pgid, root_sid, &status, &root_done)) {
            result = 2;
        }
    } else if (!root_done) {
        if (!cleanup_child(
                &history, child, root_pgid, root_sid, &status, &root_done)) {
            result = 2;
        }
    }
    identity_history_release(&history);
    return result;
}
