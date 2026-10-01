/* Android AArch64 runtime intrinsics for Cheng mobile shared libraries.
 *
 * This provider intentionally contains only real low-level intrinsics that
 * cannot be expressed by the current Cheng object emitter for Android:
 * atomic compare-and-swap and indirect void calls.
 */
.text
.p2align 2

/* int32 __cheng_runtime_atomic_cas_i32(int32 *p, int32 expect, int32 desired)
   Returns 1 on success, 0 on failure. */
.globl __cheng_runtime_atomic_cas_i32
.type __cheng_runtime_atomic_cas_i32, %function
__cheng_runtime_atomic_cas_i32:
    mov     w3, #1
.Lcheng_android_cas_i32_loop:
    ldaxr   w4, [x0]
    cmp     w4, w1
    b.ne    .Lcheng_android_cas_i32_fail
    stlxr   w5, w2, [x0]
    cbnz    w5, .Lcheng_android_cas_i32_loop
    mov     w0, w3
    ret
.Lcheng_android_cas_i32_fail:
    clrex
    mov     w0, wzr
    ret
.size __cheng_runtime_atomic_cas_i32, .-__cheng_runtime_atomic_cas_i32

/* int32 __cheng_runtime_atomic_load_i32(int32 *p)
   Returns *p with acquire semantics. */
.globl __cheng_runtime_atomic_load_i32
.type __cheng_runtime_atomic_load_i32, %function
__cheng_runtime_atomic_load_i32:
    ldar    w0, [x0]
    ret
.size __cheng_runtime_atomic_load_i32, .-__cheng_runtime_atomic_load_i32

/* void __cheng_runtime_atomic_store_i32(int32 *p, int32 val)
   Stores val to *p with release semantics. */
.globl __cheng_runtime_atomic_store_i32
.type __cheng_runtime_atomic_store_i32, %function
__cheng_runtime_atomic_store_i32:
    stlr    w1, [x0]
    ret
.size __cheng_runtime_atomic_store_i32, .-__cheng_runtime_atomic_store_i32

/* int32 __cheng_runtime_atomic_add_i32(int32 *p, int32 amount)
   Atomically adds amount to *p, returns the old value. */
.globl __cheng_runtime_atomic_add_i32
.type __cheng_runtime_atomic_add_i32, %function
__cheng_runtime_atomic_add_i32:
.Lcheng_android_atomic_add_loop:
    ldaxr   w2, [x0]
    add     w3, w2, w1
    stlxr   w4, w3, [x0]
    cbnz    w4, .Lcheng_android_atomic_add_loop
    mov     w0, w2
    ret
.size __cheng_runtime_atomic_add_i32, .-__cheng_runtime_atomic_add_i32

/* void __cheng_call_indirect_void(void (*fn)(void *), void *ctx) */
.globl __cheng_call_indirect_void
.type __cheng_call_indirect_void, %function
__cheng_call_indirect_void:
    cbz     x0, .Lcheng_android_call_void_ret
    mov     x16, x0
    mov     x0, x1
    blr     x16
.Lcheng_android_call_void_ret:
    ret
.size __cheng_call_indirect_void, .-__cheng_call_indirect_void

/* Native Linux syscall wrappers (asm-generic ABI, identical to the aarch64
   server's linux_nolibc_aarch64_entry.S). The Cheng Linux provider routes
   connected-stream send/recv through cheng_linux_syscall6 (sendto/recvfrom),
   so the non-blocking EAGAIN is recorded into chengLinuxLastErrno by
   cheng_linux_syscall_i32 — the exact variable the errno bridge reads. On
   aarch64 the generic syscall numbers (sendto=206, recvfrom=207) match, and
   svc #0 is position-independent, so these are PIC-safe inside the .so. */
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
