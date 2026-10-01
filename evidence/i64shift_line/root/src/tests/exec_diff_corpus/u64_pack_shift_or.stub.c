#include <stdio.h>
#include <stdint.h>

// Matches the Cheng `PackSlot` layout: ptr pad @0, uint32 generation @8.
typedef struct PackSlot {
    void* pad;
    uint32_t generation;
} PackSlot;

extern int64_t u64_pack_slot(void* p, int32_t idx);

static int64_t expect(uint32_t gen, int32_t idx) {
    return ((int64_t)(uint64_t)gen << 32) | (int64_t)(uint64_t)(uint32_t)(idx + 1);
}

int main(void) {
    PackSlot s;
    int fail = 0;

    s.generation = 1;       int64_t a = u64_pack_slot(&s, 0); int64_t ea = expect(1, 0);
    s.generation = 7;       int64_t b = u64_pack_slot(&s, 4); int64_t eb = expect(7, 4);
    s.generation = 0x7fffffff; int64_t c = u64_pack_slot(&s, 122); int64_t ec = expect(0x7fffffff, 122);

    printf("pack(gen=1,idx=0)=%lld exp=%lld\n", (long long)a, (long long)ea);
    printf("pack(gen=7,idx=4)=%lld exp=%lld\n", (long long)b, (long long)eb);
    printf("pack(gen=0x7fffffff,idx=122)=%lld exp=%lld\n", (long long)c, (long long)ec);

    if (a != ea) fail = 1;
    if (b != eb) fail = 1;
    if (c != ec) fail = 1;
    if (!fail) { printf("u64_pack_shift_or OK\n"); return 0; }
    printf("u64_pack_shift_or BAD\n");
    return 1;
}
