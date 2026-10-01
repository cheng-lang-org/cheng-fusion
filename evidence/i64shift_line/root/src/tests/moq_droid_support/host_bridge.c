/* Android host bridge for MoQ standalone test binaries.
 * Same provisioning pattern as the generated android .so host C:
 * platform stdio handles + entropy + atomic intrinsics live host-side.
 */
#include <stdint.h>
#include <stdio.h>
#include <sys/random.h>
#include <errno.h>

int32_t __cheng_runtime_atomic_cas_i32(int32_t *p, int32_t expect, int32_t desired) {
    if (!p) return 0;
    return __atomic_compare_exchange_n(p, &expect, desired, 0,
                                       __ATOMIC_SEQ_CST, __ATOMIC_SEQ_CST) ? 1 : 0;
}
void __cheng_runtime_atomic_store_i32(int32_t *p, int32_t value) {
    if (!p) return;
    __atomic_store_n(p, value, __ATOMIC_SEQ_CST);
}
int32_t __cheng_runtime_atomic_load_i32(int32_t *p) {
    if (!p) return 0;
    return __atomic_load_n(p, __ATOMIC_SEQ_CST);
}
int32_t __cheng_runtime_atomic_add_i32(int32_t *p, int32_t delta) {
    if (!p) return 0;
    return __atomic_add_fetch(p, delta, __ATOMIC_SEQ_CST);
}

void *get_stdout(void) { return (void *)stdout; }
void *get_stderr(void) { return (void *)stderr; }

int32_t cheng_fwrite(const void *buf, int64_t size, int64_t n, void *stream) {
    if (!buf || size <= 0 || n <= 0) return 0;
    FILE *f = stream ? (FILE *)stream : stdout;
    return (int32_t)fwrite(buf, (size_t)size, (size_t)n, f);
}

int32_t cheng_system_entropy_fill(void *dst, int32_t len) {
    if (!dst || len <= 0) return 0;
    int32_t offset = 0;
    unsigned char *p = (unsigned char *)dst;
    while (offset < len) {
        int32_t chunk = len - offset;
        if (chunk > 256) chunk = 256;
        if (getentropy(p + offset, (size_t)chunk) != 0) return 0;
        offset += chunk;
    }
    return 1;
}

__attribute__((constructor)) static void cheng_host_stdio_init(void) {
    setvbuf(stdout, 0, _IONBF, 0);
    setvbuf(stderr, 0, _IONBF, 0);
}

/* f64 -> fixed-width integer truncation helpers (mirror of
 * bootstrap/host_runtime.c): the warm backend lowers pure casts
 * int(x)/int64(x) on f64 slots to calls to these symbols; the host bridge is
 * the provider object on device links. */
int32_t cheng_f64_to_i32(double x) {
    return (int32_t)x;
}
int64_t cheng_f64_to_i64(double x) {
    return (int64_t)x;
}

/* Shared-library publication entry (no Cheng main()): media_moq_publisher_main's
 * runtime-entry import asks whether the allocation-ledger process entry was primed.
 * A bionic-hosted .so never runs the executable entry gate, so prime the imported
 * gate itself and let real begin/close capability checks happen through the Cheng
 * provider state. Returning 0 here would be a hard dlopen-time poison (entry gate
 * treats it as EX_NOPERM) for an API that is never invoked in library mode. */
int32_t cheng_allocation_ledger_process_entry_prime(void) {
    return 1;
}

/* core_runtime_provider_linux reads the raw-syscall errno cell when reporting
 * cheng_errno. The static-exe cold backend maps one at 0x4000000000; a bionic
 * .so cannot reserve that address, and every failed raw syscall path also falls
 * back to __errno_location() and the provider's own last-errno slot. Return NULL
 * so the bridge skips the raw cell and uses the bionic/libc cell. */
void *cheng_linux_errno_cell_location(void) {
    return 0;
}

/* core_runtime_provider_linux also imports the glibc-style errno cell entry
 * directly (cheng_linux_errno_location_runtime -> __errno_location). Bionic
 * names that entry __errno(), so provide the expected alias for the .so link;
 * it is the same per-thread errno cell the fallback above ends up reading. */
int *__errno_location(void) {
    return __errno();
}
