// C 参照 oracle（arm64 apple clang 原生编译）: 与 src/tests/int64_shift_semantics_probe.cheng
// 逐行同构计算, 期望行序一致。刀（标注权威）后 cheng 探针输出须与本程序输出逐字节一致
// （双 oracle 之一; 另一 oracle = expected_probe_output.txt 手工按规范推导值）。
// 注意 cheng 探针里 u64hex 经 sha384SetU64BE+BytesToHex, 全部 64 位模式逐位对照。
#include <stdio.h>
#include <stdint.h>
#include <string.h>

static uint8_t buf[8];
static void set_u64_be(uint64_t v) {
    for (int i = 0; i < 8; i++) buf[i] = (uint8_t)(v >> (56 - 8 * i));
}
static void pr(const char *tag, uint64_t v) {
    set_u64_be(v);
    printf("%s=", tag);
    for (int i = 0; i < 8; i++) printf("%02x", buf[i]);
    printf("\n");
}

/* cheng sha384U64FromBytes(0x80,0,0,0,0,0,0,0x01) = 0x8000000000000001 */
static uint64_t u64frombytes(uint32_t b0, uint32_t b1, uint32_t b2, uint32_t b3,
                             uint32_t b4, uint32_t b5, uint32_t b6, uint32_t b7) {
    return ((uint64_t)b0 << 56) | ((uint64_t)b1 << 48) | ((uint64_t)b2 << 40) |
           ((uint64_t)b3 << 32) | ((uint64_t)b4 << 24) | ((uint64_t)b5 << 16) |
           ((uint64_t)b6 << 8) | (uint64_t)b7;
}

int main(void) {
    int64_t v = (int64_t)u64frombytes(0x80, 0, 0, 0, 0, 0, 0, 0x01);
    int32_t n = 8;
    int32_t s = 56;
    pr("fixed_shl56", (uint64_t)(v << 56));
    pr("var_shl_s56", (uint64_t)(v << s));
    pr("var_shl_64minusn", (uint64_t)(v << (64 - n)));
    pr("signed_shr8", (uint64_t)(v >> n));          /* spec 1.3.2: ashr */
    uint64_t u = (uint64_t)v;
    uint64_t un = (uint64_t)(uint32_t)n;
    pr("uint_shr8", (uint64_t)(int64_t)(u >> un));
    pr("or_term", (uint64_t)((v >> n) | (v << (64 - n))));
    int64_t right = v >> n;
    int64_t left = v << (64 - n);
    pr("split_or", (uint64_t)(right | left));
    pr("split_xor", (uint64_t)(right ^ left));
    int32_t s2 = 64 - n;
    int64_t left2 = v << s2;
    pr("split_s2_or", (uint64_t)(right | left2));
    pr("right_alone", (uint64_t)right);
    pr("left_alone", (uint64_t)left);
    int64_t pos = (int64_t)(int32_t)1;
    pr("pos_shl56", (uint64_t)(pos << s));
    pr("pos_shl_64minusn", (uint64_t)(pos << (64 - n)));
    pr("u_shr", (uint64_t)(int64_t)(u >> un));
    pr("u_shl56", (uint64_t)(int64_t)(u << (uint64_t)56));
    pr("u_shl64minusn", (uint64_t)(int64_t)(u << ((uint64_t)64 - un)));
    pr("u_or", (uint64_t)(int64_t)((u >> un) | (u << ((uint64_t)64 - un))));
    pr("u_xor", (uint64_t)(int64_t)((u >> un) ^ (u << ((uint64_t)64 - un))));
    int64_t hiMask = ((int64_t)1 << (64 - n)) - 1;
    int64_t fixright = (v >> n) & hiMask;
    pr("fix_himask", (uint64_t)hiMask);
    pr("fix_right", (uint64_t)fixright);
    pr("fix_xor", (uint64_t)(fixright ^ (v << (64 - n))));
    return 0;
}
