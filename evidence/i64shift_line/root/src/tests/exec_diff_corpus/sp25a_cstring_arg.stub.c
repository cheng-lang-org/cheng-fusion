/* Stub for sp25a_cstring_arg: cstrlen over the received C string pointer.
 * The Cheng cstring literal arg is materialized as a NUL-terminated byte run in
 * the object's __data, addressed by an ADRP page/pageoff reloc emitted inside the
 * call sequence (FillCallOp). If that reloc is correct, p points at the literal
 * bytes and the length matches; if not, p is bogus and the length differs.
 * The fixture defines its own `fn main(): int32` (the executable entry, aliased
 * by the harness), so this stub defines NO main — only the cstrlen bridge. */

int sp25a_cstrlen(const char *p) {
    int n = 0;
    while (p[n] != 0) n++;
    return n;
}
