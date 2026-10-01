/* P1: fs-verity darwin equivalent — reuse of verdict-54 "write-freeze-anonymize-attest"
 * freeze point. Re-prove on this host that after close(write fd)+unlink+rmdir:
 *   (a) st_nlink == 0 and content fully readable via the O_RDONLY handle,
 *   (b) reopen by name fails ENOENT,
 *   (c) write on the O_RDONLY fd fails EBADF,
 *   (d) ftruncate on the O_RDONLY fd fails EBADF,
 *   (e) O_RDONLY cannot be upgraded to writable via F_SETFL (F_GETFL mode stuck).
 * These are the kernel facts darwin relies on where Linux uses F_ADD_SEALS.
 * exit 0 = all facts hold; any mismatch = nonzero with a labeled line.
 */
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static const char payload[] =
    "cheng-held-exec-freeze-probe: content pinning facts";
static char dirpath[256], filepath[272];

static int fail(const char *what) {
    printf("P1 FAIL %s\n", what);
    return 1;
}

int main(void) {
    const char *tmp = getenv("TMPDIR");
    if (!tmp || !*tmp) tmp = "/private/tmp";
    snprintf(dirpath, sizeof(dirpath), "%s/cheng-p1-freeze.XXXXXX", tmp);
    if (!mkdtemp(dirpath)) return fail("mkdtemp");
    snprintf(filepath, sizeof(filepath), "%s/envelope.bin", dirpath);

    int wfd = open(filepath, O_RDWR | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
    if (wfd < 0) return fail("open-create");
    size_t off = 0;
    while (off < sizeof(payload) - 1) {
        ssize_t got = write(wfd, payload + off, sizeof(payload) - 1 - off);
        if (got <= 0) return fail("write-full");
        off += (size_t)got;
    }
    int rfd = open(filepath, O_RDONLY | O_CLOEXEC);
    if (rfd < 0) return fail("open-rdonly");

    /* freeze point: close write handle, unlink, rmdir */
    if (close(wfd) != 0) return fail("close-write-handle");
    if (unlink(filepath) != 0) return fail("unlink");
    if (rmdir(dirpath) != 0) return fail("rmdir");

    struct stat st;
    if (fstat(rfd, &st) != 0) return fail("fstat");
    if (st.st_nlink != 0) return fail("nlink-zero");
    if (!S_ISREG(st.st_mode)) return fail("regular-file");
    if ((long)st.st_size != (long)(sizeof(payload) - 1)) return fail("size-pinned");

    char readback[128];
    memset(readback, 0, sizeof(readback));
    ssize_t total = 0;
    while (total < (ssize_t)(sizeof(payload) - 1)) {
        ssize_t got = pread(rfd, readback + total,
                            sizeof(payload) - 1 - (size_t)total, (off_t)total);
        if (got <= 0) return fail("pread-full");
        total += got;
    }
    if (memcmp(readback, payload, sizeof(payload) - 1) != 0)
        return fail("content-intact");

    int reopens = open(filepath, O_RDONLY);
    if (reopens != -1) {
        close(reopens);
        return fail("reopen-enoent");
    }
    if (errno != ENOENT) return fail("reopen-errno-not-enoent");

    if (write(rfd, "x", 1) != -1) return fail("write-ebadf");
    if (ftruncate(rfd, 1) != -1) return fail("ftruncate-ebadf");

    int fl = fcntl(rfd, F_GETFL);
    if (fl < 0) return fail("f-getfl");
    if ((fl & O_ACCMODE) != O_RDONLY) return fail("mode-rdonly");
    if (fcntl(rfd, F_SETFL, fl | O_RDWR) != 0) return fail("f-setfl-refused");
    fl = fcntl(rfd, F_GETFL);
    if (fl < 0 || (fl & O_ACCMODE) != O_RDONLY) return fail("upgrade-stuck-rdonly");
    if (write(rfd, "x", 1) != -1) return fail("write-after-upgrade-attempt");

    close(rfd);
    printf("P1 OK nlink=0 size=%ld reopen=ENOENT write=EBADF "
           "ftruncate=EBADF upgrade-stuck=O_RDONLY\n",
           (long)(sizeof(payload) - 1));
    return 0;
}
