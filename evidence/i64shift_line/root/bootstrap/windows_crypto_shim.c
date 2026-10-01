#include <errno.h>
#include <stddef.h>
#include <windows.h>
#include <bcrypt.h>

int getentropy(void *buf, size_t size) {
    if (!buf && size > 0) {
        errno = EINVAL;
        return -1;
    }
    if (size == 0) return 0;
    if (size > 2147483647u) {
        errno = EIO;
        return -1;
    }
    if (BCryptGenRandom(NULL, (PUCHAR)buf, (ULONG)size, BCRYPT_USE_SYSTEM_PREFERRED_RNG) == 0) {
        return 0;
    }
    errno = EIO;
    return -1;
}
