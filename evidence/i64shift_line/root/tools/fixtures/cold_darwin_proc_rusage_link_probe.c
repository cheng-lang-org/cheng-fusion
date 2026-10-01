#include <libproc.h>
#include <stdint.h>
#include <unistd.h>

extern void *cheng_malloc(int64_t size);
extern void cheng_free(void *value);

int main(void) {
    struct rusage_info_v0 usage;
    void *allocation = cheng_malloc(16);
    if (!allocation) return 2;
    cheng_free(allocation);
    if (proc_pid_rusage(
            getpid(), RUSAGE_INFO_V0,
            (rusage_info_t *)&usage) != 0) {
        return 3;
    }
    return usage.ri_phys_footprint > 0 ? 0 : 4;
}
