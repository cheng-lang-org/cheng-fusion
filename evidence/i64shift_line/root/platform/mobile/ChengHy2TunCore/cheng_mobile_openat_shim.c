/* Mobile link shim for cheng_host_openat_fixed.
 *
 * program_support_host_runtime.cheng imports this fixed-width openat bridge
 * (non-variadic signature, see bootstrap/host_runtime.c for the desktop
 * definition). The mobile NDK build has no other provider, so the shared
 * library carries this single-purpose translation unit.
 */
#include <errno.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/types.h>

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
