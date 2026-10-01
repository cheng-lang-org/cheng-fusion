/* Stub for leafcov_cstring_stack_arg: the 9th arg (a C string pointer) arrives
 * on the STACK under the arm64 ABI. Returns a1 + a8 + strlen(p) so both a
 * mis-read register arg and a mis-targeted stack cstring reloc change the
 * value. The fixture defines its own `fn main(): int32`; this stub defines NO
 * main. */

int leafcov_take9(int a1, int a2, int a3, int a4, int a5, int a6, int a7,
                  int a8, const char *p) {
    (void)a2; (void)a3; (void)a4; (void)a5; (void)a6; (void)a7;
    int n = 0;
    while (p[n] != 0) n++;
    return a1 + a8 + n;
}
