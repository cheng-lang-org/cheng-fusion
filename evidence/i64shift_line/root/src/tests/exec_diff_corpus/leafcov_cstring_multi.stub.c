/* Stub for leafcov_cstring_multi: length bridges over received C string
 * pointers. Each Cheng cstring literal arg is a NUL-terminated byte run in the
 * object's data section, addressed by an ADRP page/pageoff reloc emitted inside
 * the call sequence (AppendCStringArgRelocs subIndex per register arg). If any
 * reloc (including the second arg of the two-arg call, or the empty literal's
 * NUL-only payload) is mis-targeted, the measured length differs and the
 * fixture's exit code changes. The fixture defines its own `fn main(): int32`;
 * this stub defines NO main. */

int leafcov_cstrlen(const char *p) {
    int n = 0;
    while (p[n] != 0) n++;
    return n;
}

int leafcov_cstrcat2len(const char *p, const char *q) {
    int n = 0;
    while (p[n] != 0) n++;
    int m = 0;
    while (q[m] != 0) m++;
    return n + m;
}
