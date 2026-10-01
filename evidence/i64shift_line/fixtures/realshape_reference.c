// realshape 期望值 C 参照: uint64 循环移位 + int64 ashr 复合（规范 1.3.2）。
#include <stdio.h>
#include <stdint.h>

static uint64_t u64fb(uint32_t b0, uint32_t b1, uint32_t b2, uint32_t b3,
                      uint32_t b4, uint32_t b5, uint32_t b6, uint32_t b7) {
    return ((uint64_t)b0 << 56) | ((uint64_t)b1 << 48) | ((uint64_t)b2 << 40) |
           ((uint64_t)b3 << 32) | ((uint64_t)b4 << 24) | ((uint64_t)b5 << 16) |
           ((uint64_t)b6 << 8) | (uint64_t)b7;
}

int main(void) {
    /* rotr64_realshape_u64: 循环移位真值 */
    uint64_t x1 = u64fb(0x01, 0x80, 0, 0, 0, 0, 0, 0x01);
    uint64_t x2 = u64fb(0x80, 0, 0, 0, 0, 0, 0, 0);
    uint64_t g1 = (x1 >> 1) | (x1 << 63);
    uint64_t g2 = (x2 >> 8) | (x2 << 56);
    printf("u64_rotr1=%016llx rotr8=%016llx\n",
           (unsigned long long)g1, (unsigned long long)g2);
    printf("u64_exp1=%016llx exp2=%016llx\n",
           (unsigned long long)u64fb(0x80, 0xc0, 0, 0, 0, 0, 0, 0),
           (unsigned long long)u64fb(0x00, 0x80, 0, 0, 0, 0, 0, 0));
    /* rotr64_realshape_i64spec: int64 形 + ashr 语义 */
    int64_t v = (int64_t)u64fb(0x80, 0, 0, 0, 0, 0, 0, 0);
    int64_t s = (v >> 8) | (v << 56);
    printf("i64_case2=%016llx exp2=%016llx\n",
           (unsigned long long)s,
           (unsigned long long)u64fb(0xff, 0x80, 0, 0, 0, 0, 0, 0));
    /* case1 正数: ashr==物理同 */
    int64_t w = (int64_t)x1;
    int64_t s1 = (w >> 1) | (w << 63);
    printf("i64_case1=%016llx\n", (unsigned long long)s1);
    return 0;
}
