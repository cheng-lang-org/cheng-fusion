/* Extracted from src/core/runtime/linux_nolibc_aarch64_entry.S (syscall macro,
 * verbatim) for bionic-hosted executables: no _start here (bionic crt owns it).
 */
.text
.p2align 2

.macro CHENG_LINUX_SYSCALL name, argc
.globl \name
.type \name, %function
\name:
  mov x8, x0
.if \argc >= 1
  mov x0, x1
.endif
.if \argc >= 2
  mov x1, x2
.endif
.if \argc >= 3
  mov x2, x3
.endif
.if \argc >= 4
  mov x3, x4
.endif
.if \argc >= 5
  mov x4, x5
.endif
.if \argc >= 6
  mov x5, x6
.endif
  svc #0
  ret
.size \name, . - \name
.endm

CHENG_LINUX_SYSCALL __cheng_linux_syscall0, 0
CHENG_LINUX_SYSCALL __cheng_linux_syscall1, 1
CHENG_LINUX_SYSCALL __cheng_linux_syscall2, 2
CHENG_LINUX_SYSCALL __cheng_linux_syscall3, 3
CHENG_LINUX_SYSCALL __cheng_linux_syscall4, 4
CHENG_LINUX_SYSCALL __cheng_linux_syscall5, 5
CHENG_LINUX_SYSCALL __cheng_linux_syscall6, 6

.globl __cheng_linux_atomic_cas_i32
.type __cheng_linux_atomic_cas_i32, %function
__cheng_linux_atomic_cas_i32:
  /* (ptr x0, expect w1, desired w2) -> w0 1=swapped 0=not */
  cbz x0, 2f
1:
  ldaxr w3, [x0]
  cmp w3, w1
  b.ne 3f
  stlxr w4, w2, [x0]
  cbnz w4, 1b
  mov w0, #1
  ret
3:
  clrex
2:
  mov w0, #0
  ret
.size __cheng_linux_atomic_cas_i32, . - __cheng_linux_atomic_cas_i32
