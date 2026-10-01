#include <stdio.h>
#include <stdint.h>

extern int64_t wide_hex_a(void);
extern int64_t wide_hex_b(void);
extern int64_t wide_hex_c(void);
extern int64_t wide_hex_neg(void);

int main(void) {
    int fail = 0;

    int64_t a = wide_hex_a();   int64_t ea = (int64_t)0x1234567890ABCDEFLL;
    int64_t b = wide_hex_b();   int64_t eb = (int64_t)0x100000001LL;
    int64_t c = wide_hex_c();   int64_t ec = (int64_t)0x00FF00FF00FF00FFLL;
    int64_t n = wide_hex_neg(); int64_t en = -(int64_t)0x1234567890ABCDEFLL;

    printf("a=%lld exp=%lld\n", (long long)a, (long long)ea);
    printf("b=%lld exp=%lld\n", (long long)b, (long long)eb);
    printf("c=%lld exp=%lld\n", (long long)c, (long long)ec);
    printf("n=%lld exp=%lld\n", (long long)n, (long long)en);

    if (a != ea) fail = 1;
    if (b != eb) fail = 1;
    if (c != ec) fail = 1;
    if (n != en) fail = 1;
    if (!fail) { printf("wide_hex_imm OK\n"); return 0; }
    printf("wide_hex_imm BAD\n");
    return 1;
}
