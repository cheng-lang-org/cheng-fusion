#include <stdint.h>

int32_t regallocGatePerfCallee(int32_t value) {
    return (value & 31) + 1;
}

int32_t regallocGatePerfHot(int32_t iterations) {
    int32_t a = 1;
    int32_t b = 2;
    int32_t c = 3;
    int32_t d = 4;
    for (int32_t i = 0; i < iterations; ++i) {
        int32_t bump = regallocGatePerfCallee(i);
        a += i & 7;
        b += bump;
        c += i & 3;
        d += i & 1;
    }
    return a + b + c + d;
}
