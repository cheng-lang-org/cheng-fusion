#include <stdint.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>
#if defined(__APPLE__) || defined(__linux__)
#include <sys/syscall.h>
#endif
int32_t cheng_f64_to_i32(double x) { return (int32_t)x; }
int64_t cheng_f64_to_i64(double x) { return (int64_t)x; }
int32_t cheng_host_openat_fixed(int32_t dir_fd, const char *path, int32_t flags, int32_t mode) { if (!path) { errno = EINVAL; return -1; } return openat(dir_fd, path, flags, (mode_t)mode); }
#if defined(__APPLE__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
#endif
int32_t cheng_host_getdents_fixed(int32_t fd, void *buf, int32_t cap) {
  if (fd < 0 || !buf || cap <= 0) { errno = EINVAL; return -1; }
#if defined(__APPLE__) && defined(SYS_getdirentries64)
  off_t base = 0; long result = syscall(SYS_getdirentries64, fd, buf, (size_t)cap, &base); return result < 0 ? -1 : (int32_t)result;
#elif defined(__linux__) && defined(SYS_getdents64)
  long result = syscall(SYS_getdents64, fd, buf, (size_t)cap); return result < 0 ? -1 : (int32_t)result;
#else
  errno = ENOTSUP; return -1;
#endif
}
#if defined(__APPLE__)
#pragma clang diagnostic pop
#endif
int32_t cheng_host_renameat_noreplace_fixed(int32_t parent_fd, const char *old_name, const char *new_name) {
  if (parent_fd < 0 || !old_name || !new_name) { errno = EINVAL; return -1; }
#ifdef __APPLE__
  return renameatx_np(parent_fd, old_name, parent_fd, new_name, RENAME_EXCL);
#elif defined(__linux__) && defined(SYS_renameat2)
  return syscall(SYS_renameat2, parent_fd, old_name, parent_fd, new_name, 1U) == 0 ? 0 : -1;
#else
  errno = ENOTSUP; return -2;
#endif
}
