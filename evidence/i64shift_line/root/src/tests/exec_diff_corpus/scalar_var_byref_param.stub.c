#include <stdio.h>
#include <stdint.h>

/* scalar_var_byref_param.stub.c — drives the Cheng `probe()` entry, which
 * performs all the caller-side local-var-by-ref slot resolution under test, and
 * checks its int32 return. probe() returns 0 iff every read-back through a
 * `var int32` reference observed the value the callee wrote; a phantom-slot
 * miscompile yields a deterministic nonzero (!= the oracle's 0). */

extern int32_t probe(void);

int main(void) {
    int32_t r = probe();
    printf("probe()=%d (0=ok)\n", (int)r);
    if (r == 0) { printf("scalar_var_byref_param OK\n"); return 0; }
    printf("scalar_var_byref_param BAD\n");
    return 1;
}
