/* Stub for leafcov_cstring_arg_shape_matrix: shape-boundary probes around
 * the arm64 8-register argument window. leafcov9_eight keeps its cstring in
 * the last register slot (no stack args at all); leafcov9_mix interleaves
 * cstrings with scalars across register positions and the first stack slot.
 * Every cstring is read back byte by byte, so a NULL empty-literal pointer
 * or a misplaced slot changes the fold or faults. No main. */

int leafcov9_mix(const char *s, int b, const char *t, int c, const char *u,
                 int d, const char *v, int e, const char *w) {
    int acc = b + c + d + e;
    int i = 0;
    while (s[i] != 0) { acc += s[i]; i++; }
    i = 0;
    while (t[i] != 0) { acc += t[i] * 2; i++; }
    i = 0;
    while (u[i] != 0) { acc += u[i] * 3; i++; }
    i = 0;
    while (v[i] != 0) { acc += v[i] * 4; i++; }
    i = 0;
    while (w[i] != 0) { acc += w[i] * 5; i++; }
    return acc;
}

int leafcov9_eight(int a1, int a2, int a3, int a4, int a5, int a6, int a7,
                   const char *s) {
    (void)a2; (void)a3; (void)a4; (void)a5; (void)a6; (void)a7;
    int acc = a1;
    int i = 0;
    while (s[i] != 0) { acc += s[i]; i++; }
    return acc;
}
