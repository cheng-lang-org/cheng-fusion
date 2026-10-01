/* host_runtime.c -- minimal C provider runtime for pure-Cheng compilation.
 *
 * Provides fd I/O (read/write/poll/close), time, terminal, and file I/O
 * using the exact ChengFullStr ABI from process_provider.c.
 *
 * HTTP, SQLite, auth crypto/random, model provider, process spawn, seatbelt,
 * sockets, and websocket entry points must come from explicit real providers.
 * This file must not grow fallback or stub exports.
 *
 * Included by cheng_cold.c at bootstrap time.
 */

/* ─── System headers ────────────────────────────────────────────────── */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <dirent.h>
#include <errno.h>
#include <limits.h>
#include <time.h>
#include <sys/time.h>
#include <sys/ioctl.h>
#include <poll.h>
#include <termios.h>
#include <stdint.h>
#include <signal.h>
#if defined(__APPLE__) || defined(__linux__)
#include <sys/syscall.h>
#endif

/* ─── macOS TUN/utun support ─────────────────────────────────────────── */
#ifdef __APPLE__
#include <sys/socket.h>
#include <sys/kern_control.h>
#include <net/if.h>
#endif

/* ─── Cheng string ABI (must match process_provider.c exactly) ──────── */

typedef struct {
    const char *data;
    int32_t    len;
    int32_t    store_id;
    int32_t    flags;
    int32_t    _pad;
} ChengFullStr;

typedef struct {
    int32_t len;
    int32_t cap;
    ChengFullStr *buffer;
} ChengStrSeq;

/* ─── Internal helpers ───────────────────────────────────────────────── */

static int32_t csg_meta_len(uint64_t meta) {
    return (int32_t)(meta & 0xffffffffu);
}

static char *csg_copy_bytes(const char *data, int32_t len) {
    if (!data || len <= 0) {
        char *empty = (char *)malloc(1);
        if (empty) empty[0] = '\0';
        return empty;
    }
    char *out = (char *)malloc((size_t)len + 1);
    if (!out) return NULL;
    memcpy(out, data, (size_t)len);
    out[len] = '\0';
    return out;
}

static ChengFullStr csg_str_from_bytes(const char *data, int32_t len) {
    ChengFullStr out;
    char *copy = csg_copy_bytes(data, len);
    out.data = copy ? copy : "";
    out.len  = copy ? len : 0;
    out.store_id = 0;
    out.flags = 0;
    out._pad  = 0;
    return out;
}

static ChengFullStr csg_str_from_c(const char *s) {
    int32_t len = s ? (int32_t)strlen(s) : 0;
    return csg_str_from_bytes(s, len);
}

static ChengFullStr csg_empty_str(void) {
    return csg_str_from_c("");
}

#define PIPE_BUF_SIZE 4096

static bool csg_write_all_bytes(int fd, const void *data, size_t len) {
    const uint8_t *cursor = (const uint8_t *)data;
    while (len > 0) {
        ssize_t amount = write(fd, cursor, len);
        if (amount < 0 && errno == EINTR) continue;
        if (amount <= 0) return false;
        cursor += (size_t)amount;
        len -= (size_t)amount;
    }
    return true;
}

static void csg_write_all_or_exit(int fd, const void *data, size_t len) {
    if (!csg_write_all_bytes(fd, data, len)) _exit(2);
}

/* ─── fd I/O (core process) ─────────────────────────────────────────── */

ChengFullStr cheng_process_read_fd(int32_t fd) {
    char buf[PIPE_BUF_SIZE];
    ssize_t n = read(fd, buf, sizeof(buf));
    if (n <= 0) return csg_empty_str();
    return csg_str_from_bytes(buf, (int32_t)n);
}

ChengFullStr cheng_process_read_fd_blocking(int32_t fd, int32_t timeout_ms) {
    struct pollfd pfd;
    pfd.fd = fd;
    pfd.events = POLLIN;
    int ret = poll(&pfd, 1, timeout_ms);
    if (ret <= 0) return csg_empty_str();
    char buf[PIPE_BUF_SIZE];
    ssize_t n = read(fd, buf, sizeof(buf));
    if (n <= 0) return csg_empty_str();
    return csg_str_from_bytes(buf, (int32_t)n);
}

int32_t cheng_process_write_fd(int32_t fd, const char *data, uint64_t data_meta) {
    int32_t len = csg_meta_len(data_meta);
    if (len <= 0 || !data) return 0;
    ssize_t n = write(fd, data, len);
    return n > 0 ? (int32_t)n : 0;
}

int32_t cheng_process_close_fd(int32_t fd) {
    if (fd >= 0) close(fd);
    return 0;
}

/* ─── Time ───────────────────────────────────────────────────────────── */
int64_t cheng_epoch_time_ms(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (int64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}
double cheng_epoch_time(void) {
    return (double)cheng_epoch_time_ms() / 1000.0;
}
int64_t cheng_epoch_time_seconds(void) {
    return cheng_epoch_time_ms() / 1000;
}

/* f64 -> fixed-width integer truncation runtime helpers.
 *
 * The warm backend has no f64->i32/i64 BodyOp (BodyOpKind stops at
 * BodyOpStrEqTag=18). A pure-cast `int(x)`/`int64(x)` whose arg slot is
 * LocalF64Tag is lowered as a CallOp to these symbols (cast arm in
 * PrimaryBodyIrAppendCallOp). This file is #included by cheng_cold.c, so the
 * symbols compile into the cold binary as dead code (cold compiler never calls
 * them) AND link into warm outputs as the host runtime provider object,
 * resolving the `bl cheng_f64_to_i32`/`bl cheng_f64_to_i64` the cast arm
 * emits. Add-only; does not touch the cold parser/runtime, so the bootstrap
 * fixed point is preserved. */
int32_t cheng_f64_to_i32(double x) {
    return (int32_t)x;
}
int64_t cheng_f64_to_i64(double x) {
    return (int64_t)x;
}

/* Fixed-signature wrappers for operations whose libc entry points are
 * variadic. Cheng FFI declarations are deliberately non-variadic, so calling
 * openat(2) or syscall(2) directly would use the wrong Darwin arm64 vararg
 * convention. These bridges keep the public runtime ABI fixed-width while
 * preserving the kernel no-follow/no-replace contract. */
int32_t cheng_host_openat_fixed(int32_t dir_fd,
                                const char *path,
                                int32_t flags,
                                int32_t mode) {
    if (!path) {
        errno = EINVAL;
        return -1;
    }
    return openat(dir_fd, path, flags, (mode_t)mode);
}

#if defined(__APPLE__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
#endif
int32_t cheng_host_getdents_fixed(int32_t fd,
                                  void *buf,
                                  int32_t cap) {
    if (fd < 0 || !buf || cap <= 0) {
        errno = EINVAL;
        return -1;
    }
#if defined(__APPLE__) && defined(SYS_getdirentries64)
    off_t base = 0;
    long result = syscall(SYS_getdirentries64,
                          fd,
                          buf,
                          (size_t)cap,
                          &base);
    return result < 0 ? -1 : (int32_t)result;
#elif defined(__linux__) && defined(SYS_getdents64)
    long result = syscall(SYS_getdents64, fd, buf, (size_t)cap);
    return result < 0 ? -1 : (int32_t)result;
#else
    errno = ENOTSUP;
    return -1;
#endif
}
#if defined(__APPLE__)
#pragma clang diagnostic pop
#endif

int32_t cheng_host_renameat_noreplace_fixed(int32_t parent_fd,
                                             const char *old_name,
                                             const char *new_name) {
    if (parent_fd < 0 || !old_name || !new_name) {
        errno = EINVAL;
        return -1;
    }
#ifdef __APPLE__
    return renameatx_np(parent_fd,
                        old_name,
                        parent_fd,
                        new_name,
                        RENAME_EXCL);
#elif defined(__linux__) && defined(SYS_renameat2)
    return syscall(SYS_renameat2,
                   parent_fd,
                   old_name,
                   parent_fd,
                   new_name,
                   1U) == 0 ? 0 : -1;
#else
    errno = ENOTSUP;
    return -2;
#endif
}

/* ─── Terminal ──────────────────────────────────────────────────────── */
static struct termios ct_orig, ct_raw;
static int ct_saved;

void cheng_terminal_raw_enable(void) {
    if (!ct_saved) { tcgetattr(STDIN_FILENO, &ct_orig); ct_saved = 1; }
    ct_raw = ct_orig;
    ct_raw.c_iflag &= ~(BRKINT|ICRNL|INPCK|ISTRIP|IXON);
    ct_raw.c_oflag &= ~(OPOST);
    ct_raw.c_lflag &= ~(ECHO|ECHONL|ICANON|ISIG|IEXTEN);
    ct_raw.c_cflag |= (CS8|CREAD);
    ct_raw.c_cc[VMIN] = 1;
    ct_raw.c_cc[VTIME] = 0;
    tcsetattr(STDIN_FILENO, TCSAFLUSH, &ct_raw);
}
void cheng_terminal_raw_disable(void) {
    if (ct_saved) tcsetattr(STDIN_FILENO, TCSAFLUSH, &ct_orig);
}
int32_t cheng_terminal_get_size_rows(void) {
    struct winsize ws;
    if (ioctl(STDOUT_FILENO, TIOCGWINSZ, &ws) == 0) return ws.ws_row;
    return 24;
}
int32_t cheng_terminal_get_size_cols(void) {
    struct winsize ws;
    if (ioctl(STDOUT_FILENO, TIOCGWINSZ, &ws) == 0) return ws.ws_col;
    return 80;
}
int32_t cheng_terminal_read_key(void) {
    unsigned char b[8];
    ssize_t n = read(STDIN_FILENO, b, sizeof(b));
    if (n <= 0) return -1;
    if (n == 1) return b[0];
    int32_t c = 0;
    for (int32_t i = 0; i < n && i < 4; i++) c = (c << 8) | b[i];
    return -(c + 1);
}
int32_t cheng_terminal_read_byte_timeout(int32_t deciseconds) {
    struct pollfd pfd = {STDIN_FILENO, POLLIN, 0};
    if (poll(&pfd, 1, deciseconds * 100) <= 0) return -1;
    unsigned char c;
    if (read(STDIN_FILENO, &c, 1) == 1) return c;
    return -1;
}
void cheng_terminal_write(const char *d, int32_t l) {
    if (l > 0) csg_write_all_or_exit(STDOUT_FILENO, d, (size_t)l);
}
void cheng_terminal_clear_screen(void) {
    csg_write_all_or_exit(STDOUT_FILENO, "\x1b[2J\x1b[H", 8);
}
void cheng_terminal_move_to(int32_t r, int32_t c) {
    char b[32]; int n = snprintf(b, sizeof(b), "\x1b[%d;%dH", r, c);
    if (n <= 0 || n >= (int)sizeof(b)) _exit(2);
    csg_write_all_or_exit(STDOUT_FILENO, b, (size_t)n);
}
void cheng_terminal_set_fg(int32_t c) {
    char b[32]; int n = snprintf(b, sizeof(b), "\x1b[38;5;%dm", c);
    if (n <= 0 || n >= (int)sizeof(b)) _exit(2);
    csg_write_all_or_exit(STDOUT_FILENO, b, (size_t)n);
}
void cheng_terminal_set_bg(int32_t c) {
    char b[32]; int n = snprintf(b, sizeof(b), "\x1b[48;5;%dm", c);
    if (n <= 0 || n >= (int)sizeof(b)) _exit(2);
    csg_write_all_or_exit(STDOUT_FILENO, b, (size_t)n);
}
void cheng_terminal_set_bold(void) {
    csg_write_all_or_exit(STDOUT_FILENO, "\x1b[1m", 4);
}
void cheng_terminal_set_underline(void) {
    csg_write_all_or_exit(STDOUT_FILENO, "\x1b[4m", 4);
}
void cheng_terminal_set_reverse(void) {
    csg_write_all_or_exit(STDOUT_FILENO, "\x1b[7m", 4);
}
void cheng_terminal_reset_attrs(void) {
    csg_write_all_or_exit(STDOUT_FILENO, "\x1b[0m", 4);
}

/* ─── File I/O ──────────────────────────────────────────────────────── */

void ReadFile_impl(ChengFullStr *out, const char *path_data, uint64_t path_meta) {
    out->data = ""; out->len = 0; out->store_id = 0; out->flags = 0; out->_pad = 0;
    int32_t plen = csg_meta_len(path_meta);
    if (plen >= PATH_MAX) return;
    char path[PATH_MAX]; memcpy(path, path_data, plen); path[plen] = 0;
    FILE *f = fopen(path, "rb"); if (!f) return;
    fseek(f, 0, SEEK_END); long sz = ftell(f); fseek(f, 0, SEEK_SET);
    if (sz <= 0 || sz > INT32_MAX) { fclose(f); return; }
    char *buf = (char *)malloc((size_t)sz + 1);
    if (!buf) { fclose(f); return; }
    size_t n = fread(buf, 1, (size_t)sz, f); fclose(f);
    buf[n] = 0;
    out->data = buf; out->len = (int32_t)n;
    out->store_id = 0; out->flags = 0; out->_pad = 0;
}

int32_t RustCsgWriteFile(const char *path_data, uint64_t path_meta,
                          const char *content_data, uint64_t content_meta) {
    int32_t plen = csg_meta_len(path_meta), clen = csg_meta_len(content_meta);
    if (plen >= PATH_MAX) return 0;
    char path[PATH_MAX]; memcpy(path, path_data, plen); path[plen] = 0;
    FILE *f = fopen(path, "w"); if (!f) return 0;
    size_t n = fwrite(content_data, 1, (size_t)clen, f); fclose(f);
    return (int32_t)n;
}

int32_t RustCsgPathReadable(const char *path_data, uint64_t path_meta) {
    int32_t plen = csg_meta_len(path_meta);
    if (plen >= PATH_MAX) return 0;
    char path[PATH_MAX]; memcpy(path, path_data, plen); path[plen] = 0;
    return access(path, R_OK) == 0;
}

int64_t RustCsgFileSize(const char *path_data, uint64_t path_meta) {
    int32_t plen = csg_meta_len(path_meta);
    if (plen >= PATH_MAX) return -1;
    char path[PATH_MAX]; memcpy(path, path_data, plen); path[plen] = 0;
    struct stat st; if (stat(path, &st) != 0) return -1;
    return (int64_t)st.st_size;
}

int32_t RustCsgPathMetadataKind(const char *path_data, uint64_t path_meta) {
    int32_t plen = csg_meta_len(path_meta);
    if (plen >= PATH_MAX) return 0;
    char path[PATH_MAX]; memcpy(path, path_data, plen); path[plen] = 0;
    struct stat st; if (stat(path, &st) != 0) return 0;
    if (S_ISDIR(st.st_mode)) return 1;
    if (S_ISREG(st.st_mode)) return 2;
    return 3;
}

int32_t RustCsgMkdir(const char *path_data, uint64_t path_meta) {
    int32_t plen = csg_meta_len(path_meta);
    if (plen >= PATH_MAX) return 0;
    char path[PATH_MAX]; memcpy(path, path_data, plen); path[plen] = 0;
    return mkdir(path, 0755) == 0;
}

int32_t RustCsgFileDelete(const char *path_data, uint64_t path_meta) {
    int32_t plen = csg_meta_len(path_meta);
    if (plen >= PATH_MAX) return 0;
    char path[PATH_MAX]; memcpy(path, path_data, plen); path[plen] = 0;
    return unlink(path) == 0;
}

/* ─── Environment / realpath ────────────────────────────────────────── */

void RustCsgGetEnv_impl(ChengFullStr *out, const char *name_data, uint64_t name_meta) {
    out->data = ""; out->len = 0; out->store_id = 0; out->flags = 0; out->_pad = 0;
    int32_t nlen = csg_meta_len(name_meta);
    if (nlen >= 256) return;
    char name[256]; memcpy(name, name_data, nlen); name[nlen] = 0;
    const char *val = getenv(name); if (!val) return;
    size_t vlen = strlen(val);
    char *buf = (char *)malloc(vlen + 1); if (!buf) return;
    memcpy(buf, val, vlen + 1);
    out->data = buf; out->len = (int32_t)vlen;
    out->store_id = 0; out->flags = 0; out->_pad = 0;
}

void RustCsgRealPath_impl(ChengFullStr *out, const char *path_data, uint64_t path_meta) {
    out->data = ""; out->len = 0; out->store_id = 0; out->flags = 0; out->_pad = 0;
    int32_t plen = csg_meta_len(path_meta);
    if (plen >= PATH_MAX) return;
    char path[PATH_MAX]; memcpy(path, path_data, plen); path[plen] = 0;
    char resolved[PATH_MAX];
    if (!realpath(path, resolved)) return;
    size_t len = strlen(resolved);
    char *s = (char *)malloc(len + 1); if (!s) return;
    memcpy(s, resolved, len + 1);
    out->data = s; out->len = (int32_t)len;
    out->store_id = 0; out->flags = 0; out->_pad = 0;
}

/* ─── Directory walk ────────────────────────────────────────────────── */

void WalkDirRec_impl(ChengStrSeq *out, const char *root_data, uint64_t root_meta) {
    out->buffer = NULL; out->len = 0; out->cap = 0;
    int32_t rlen = csg_meta_len(root_meta);
    if (rlen >= PATH_MAX) return;
    char root[PATH_MAX]; memcpy(root, root_data, rlen); root[rlen] = 0;
    DIR *d = opendir(root); if (!d) return;
    int cap = 256;
    out->buffer = (ChengFullStr *)malloc(sizeof(ChengFullStr) * cap);
    if (!out->buffer) {
        closedir(d);
        return;
    }
    out->cap = cap;
    struct dirent *e;
    for (;;) {
        errno = 0;
        e = readdir(d);
        if (!e) {
            if (errno != 0) _exit(2);
            break;
        }
        if (e->d_name[0] == '.' && (e->d_name[1] == 0 ||
            (e->d_name[1] == '.' && e->d_name[2] == 0))) continue;
        char full[PATH_MAX];
        int full_length = snprintf(
            full, sizeof(full), "%s/%s", root, e->d_name);
        if (full_length <= 0 || full_length >= (int)sizeof(full)) _exit(2);
        size_t fl = strlen(full);
        if (out->len >= cap) {
            if (cap > INT32_MAX / 2) _exit(2);
            cap *= 2;
            ChengFullStr *grown = (ChengFullStr *)realloc(
                out->buffer, sizeof(ChengFullStr) * (size_t)cap);
            if (!grown) _exit(2);
            out->buffer = grown;
            out->cap = cap;
        }
        ChengFullStr item = csg_str_from_bytes(full, (int32_t)fl);
        if (item.len != (int32_t)fl) _exit(2);
        out->buffer[out->len++] = item;
        if (e->d_type == DT_DIR) {
            ChengStrSeq sub;
            WalkDirRec_impl(&sub, full, ((uint64_t)fl));
            for (int32_t i = 0; i < sub.len; i++) {
                if (out->len >= out->cap) {
                    if (out->cap > INT32_MAX / 2) _exit(2);
                    out->cap *= 2;
                    ChengFullStr *grown = (ChengFullStr *)realloc(
                        out->buffer,
                        sizeof(ChengFullStr) * (size_t)out->cap);
                    if (!grown) _exit(2);
                    out->buffer = grown;
                }
                out->buffer[out->len++] = sub.buffer[i];
            }
            if (sub.buffer) free(sub.buffer);
        }
    }
    if (closedir(d) != 0) _exit(2);
}

/* ─── String helpers ────────────────────────────────────────────────── */

int32_t RustCsgEndsWith(const char *text_data, uint64_t text_meta,
                         const char *suffix_data, uint64_t suffix_meta) {
    int32_t tlen = csg_meta_len(text_meta), slen = csg_meta_len(suffix_meta);
    return slen <= tlen && memcmp(text_data + tlen - slen, suffix_data, slen) == 0;
}

int32_t RustCsgContains(const char *text_data, uint64_t text_meta,
                         const char *needle_data, uint64_t needle_meta) {
    int32_t tlen = csg_meta_len(text_meta), nlen = csg_meta_len(needle_meta);
    if (nlen == 0) return 1; if (nlen > tlen) return 0;
    for (int32_t i = 0; i <= tlen - nlen; i++)
        if (memcmp(text_data + i, needle_data, nlen) == 0) return 1;
    return 0;
}

int32_t StartsWith(const char *text_data, uint64_t text_meta,
                    const char *prefix_data, uint64_t prefix_meta) {
    int32_t tlen = csg_meta_len(text_meta), plen = csg_meta_len(prefix_meta);
    return plen <= tlen && memcmp(text_data, prefix_data, plen) == 0;
}

int32_t RustCsgStrStartsWith(const char *text_data, uint64_t text_meta,
                              const char *prefix_data, uint64_t prefix_meta) {
    return StartsWith(text_data, text_meta, prefix_data, prefix_meta);
}

int32_t RustCsgStrCount(const char *text_data, uint64_t text_meta,
                         const char *needle_data, uint64_t needle_meta) {
    int32_t tlen = csg_meta_len(text_meta), nlen = csg_meta_len(needle_meta);
    if (nlen == 0 || nlen > tlen) return 0;
    int32_t c = 0;
    for (int32_t i = 0; i <= tlen - nlen; i++)
        if (memcmp(text_data + i, needle_data, nlen) == 0) { c++; i += nlen - 1; }
    return c;
}

/* ─── Stdin ──────────────────────────────────────────────────────────── */

int32_t RustCsgStdinIsTerminal(void) { return isatty(0); }

void RustCsgReadStdin_impl(ChengFullStr *out) {
    out->data = ""; out->len = 0; out->store_id = 0; out->flags = 0; out->_pad = 0;
    size_t cap = 65536, total = 0;
    char *data = (char *)malloc(cap + 1); if (!data) _exit(2);
    while (1) {
        char buf[65536];
        ssize_t n = read(0, buf, sizeof(buf));
        if (n < 0 && errno == EINTR) continue;
        if (n < 0) { free(data); _exit(2); }
        if (n == 0) break;
        if ((size_t)n > SIZE_MAX - total) { free(data); _exit(2); }
        if (total + (size_t)n > (size_t)INT32_MAX) {
            free(data);
            _exit(2);
        }
        if (total + (size_t)n > cap) {
            if (total + (size_t)n > (SIZE_MAX - 1) / 2) {
                free(data);
                _exit(2);
            }
            cap = (total + (size_t)n) * 2;
            char *nd = (char *)realloc(data, cap + 1);
            if (!nd) { free(data); _exit(2); }
            data = nd;
        }
        memcpy(data + total, buf, (size_t)n); total += (size_t)n;
    }
    if (total == 0) { free(data); return; }
    data[total] = 0;
    out->data = data; out->len = (int32_t)total;
    out->store_id = 0; out->flags = 0; out->_pad = 0;
}

/* ─── String formatters ─────────────────────────────────────────────── */

void RustCsgInt32ToDecStr_impl(ChengFullStr *out, int32_t value) {
    char buf[32]; int n = snprintf(buf, sizeof(buf), "%d", value);
    char *s = (char *)malloc((size_t)n + 1); memcpy(s, buf, (size_t)n + 1);
    out->data = s; out->len = n;
    out->store_id = 0; out->flags = 0; out->_pad = 0;
}

void RustCsgMillisToRfc3339_impl(ChengFullStr *out, int64_t ms) {
    time_t sec = (time_t)(ms / 1000);
    struct tm tm_buf; gmtime_r(&sec, &tm_buf);
    char buf[64]; int n = strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm_buf);
    char *s = (char *)malloc((size_t)n + 1); memcpy(s, buf, (size_t)n + 1);
    out->data = s; out->len = n;
    out->store_id = 0; out->flags = 0; out->_pad = 0;
}

/* ─── JoinPath ──────────────────────────────────────────────────────── */
void JoinPath_impl(ChengFullStr *out,
    const char *ld, uint64_t lm, const char *rd, uint64_t rm) {
    int32_t ll = csg_meta_len(lm), rl = csg_meta_len(rm);
    int hasSep = (ll > 0 && ld[ll-1] == '/') || (rl > 0 && rd[0] == '/');
    size_t tl = (size_t)ll + (size_t)rl + (hasSep ? 0 : 1);
    if (tl > INT32_MAX) { *out = csg_empty_str(); return; }
    char *b = (char *)malloc(tl + 1); if (!b) { *out = csg_empty_str(); return; }
    memcpy(b, ld, ll);
    if (!hasSep) b[ll] = '/';
    memcpy(b + ll + (hasSep ? 0 : 1), rd, rl);
    b[tl] = 0;
    out->data = b; out->len = (int32_t)tl;
    out->store_id = 0; out->flags = 0; out->_pad = 0;
}

/* ─── ASM aliases (_impl → non-_impl for Cheng @importc names) ──────── */
/* These match the aliases in darwin_inventory_provider.c */
#if defined(__APPLE__) && defined(__aarch64__)
__asm__(
    ".globl _ReadFile\n"
    "_ReadFile:\n"
    "    b _ReadFile_impl\n"
    ".globl _RustCsgGetEnv\n"
    "_RustCsgGetEnv:\n"
    "    b _RustCsgGetEnv_impl\n"
    ".globl _RustCsgRealPath\n"
    "_RustCsgRealPath:\n"
    "    b _RustCsgRealPath_impl\n"
    ".globl _RustCsgReadStdin\n"
    "_RustCsgReadStdin:\n"
    "    b _RustCsgReadStdin_impl\n"
);
#endif

/* ─── exec/run.cheng: getCurrentTimeMs ────────────────────────────── */
int64_t RustCsgGetCurrentTimeMs(void) { return cheng_epoch_time_ms(); }

/* ─── system.cheng: driver_c_new_string ───────────────────────────── */
ChengFullStr driver_c_new_string(const char *d, uint64_t dm) {
    return csg_str_from_bytes(d, csg_meta_len(dm));
}

/* ─── times.cheng: cheng_epoch_time_ms (for std/times) ─────────────── */
ChengFullStr cheng_epoch_time_ms_str(void) {
    int64_t ms = cheng_epoch_time_ms();
    char buf[32]; int n = snprintf(buf, sizeof(buf), "%lld", (long long)ms);
    return csg_str_from_bytes(buf, n);
}

/* ─── Darwin TUN/utun provider ────────────────────────────────────────── */

#ifdef __APPLE__

/* Open a macOS utun device. Returns fd on success, -1 on error.
   The caller can read/write IP packets to this fd.
   On success, the utun interface name (e.g. "utun2") is written to
   ifname_out (must be at least IFNAMSIZ bytes). */
static int cheng_tun_open_utun_impl(char *ifname_out, int32_t ifname_cap) {
    if (!ifname_out || ifname_cap < 16) return -1;
    memset(ifname_out, 0, (size_t)ifname_cap);

    int fd = socket(32, 2, 2); /* AF_SYSTEM=32, SOCK_DGRAM=2, SYSPROTO_CONTROL=2 */
    if (fd < 0) return -1;

    /* Find the utun kernel control ID */
    struct ctl_info ci;
    memset(&ci, 0, sizeof(ci));
    strlcpy(ci.ctl_name, "com.apple.net.utun_control", sizeof(ci.ctl_name));
    if (ioctl(fd, CTLIOCGINFO, &ci) < 0) {
        close(fd);
        return -1;
    }

    /* Connect to the control socket (unit 0 = auto-assign next available) */
    struct sockaddr_ctl addr;
    memset(&addr, 0, sizeof(addr));
    addr.sc_len      = sizeof(addr);
    addr.sc_family   = 32; /* AF_SYSTEM */
    addr.ss_sysaddr  = 2; /* AF_SYS_CONTROL */
    addr.sc_id       = ci.ctl_id;
    addr.sc_unit     = 0;  /* auto-assign */
    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        close(fd);
        return -1;
    }

    /* Get the assigned interface name */
    socklen_t name_len = (socklen_t)ifname_cap;
    if (getsockopt(fd, 2 /* SYSPROTO_CONTROL */, 2 /* UTUN_OPT_IFNAME */,
                   ifname_out, &name_len) < 0) {
        close(fd);
        return -1;
    }

    /* Set non-blocking for event-loop I/O with poll */
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags >= 0) fcntl(fd, F_SETFL, flags | O_NONBLOCK);

    return fd;
}

/* Cheng-exported bridge: open utun device, return fd. */
int32_t cheng_tun_open_utun_bridge(void) {
    char ifname[IFNAMSIZ];
    return (int32_t)cheng_tun_open_utun_impl(ifname, sizeof(ifname));
}

/* Store last-opened utun interface name for retrieval. */
static char cheng_tun_last_utun_name[IFNAMSIZ];

int32_t cheng_tun_open_utun_named_bridge(void) {
    memset(cheng_tun_last_utun_name, 0, sizeof(cheng_tun_last_utun_name));
    int32_t fd = (int32_t)cheng_tun_open_utun_impl(
        cheng_tun_last_utun_name, sizeof(cheng_tun_last_utun_name));
    return fd;
}

const char *cheng_tun_last_utun_name_ptr(void) {
    return cheng_tun_last_utun_name;
}

int32_t cheng_tun_last_utun_name_len(void) {
    return (int32_t)strlen(cheng_tun_last_utun_name);
}

#endif /* __APPLE__ */

/* darwin_inventory_provider: RustCsgPathMetadataKind/RustCsgStdinIsTerminal
   already defined above without _impl suffix. No duplicate needed. */
