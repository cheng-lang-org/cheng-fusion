#include <stdio.h>
#include <stdint.h>

extern uint32_t rotl32(uint32_t x, uint32_t n);
extern uint32_t rotr32(uint32_t x, uint32_t n);
extern uint32_t rotl_compose(uint32_t x);

static uint32_t rl(uint32_t x, uint32_t n) { return (x << n) | (x >> (32 - n)); }
static uint32_t rr(uint32_t x, uint32_t n) { return (x >> n) | (x << (32 - n)); }

int main(void) {
    int fail = 0;
    uint32_t v = 0x12345678u;

    uint32_t l1 = rotl32(v, 4);  uint32_t el1 = rl(v, 4);
    uint32_t l2 = rotl32(v, 1);  uint32_t el2 = rl(v, 1);
    uint32_t l3 = rotl32(0x80000001u, 1); uint32_t el3 = rl(0x80000001u, 1);
    uint32_t r1 = rotr32(v, 4);  uint32_t er1 = rr(v, 4);
    uint32_t r2 = rotr32(v, 12); uint32_t er2 = rr(v, 12);
    uint32_t c  = rotl_compose(v); uint32_t ec = rl(v, 24);

    printf("l1=%08x exp=%08x\n", l1, el1);
    printf("l2=%08x exp=%08x\n", l2, el2);
    printf("l3=%08x exp=%08x\n", l3, el3);
    printf("r1=%08x exp=%08x\n", r1, er1);
    printf("r2=%08x exp=%08x\n", r2, er2);
    printf("c=%08x exp=%08x\n", c, ec);

    if (l1 != el1) fail = 1;
    if (l2 != el2) fail = 1;
    if (l3 != el3) fail = 1;
    if (r1 != er1) fail = 1;
    if (r2 != er2) fail = 1;
    if (c  != ec)  fail = 1;
    if (!fail) { printf("bit_rotate OK\n"); return 0; }
    printf("bit_rotate BAD\n");
    return 1;
}
