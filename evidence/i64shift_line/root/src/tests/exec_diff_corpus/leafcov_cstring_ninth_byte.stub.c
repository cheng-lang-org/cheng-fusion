/* Stub for leafcov_cstring_ninth_byte: args 9 (p) and 10 (q) arrive on the
 * STACK under the arm64 ABI ([sp] and [sp,#8] at call time). Both are read
 * back byte by byte with positional weights; any slot/stride mislayout or a
 * NULL empty-literal pointer changes the folded value or faults. No main. */

int leafcov9_probe(int a1, int a2, int a3, int a4, int a5, int a6, int a7,
                   int a8, const char *p, const char *q) {
    (void)a2; (void)a3; (void)a4; (void)a5; (void)a6; (void)a7;
    int acc = a1 + a8;
    int i = 0;
    while (p[i] != 0) { acc += (i + 1) * p[i]; i++; }
    i = 0;
    while (q[i] != 0) { acc += (i + 1) * q[i] * 2; i++; }
    return acc;
}
