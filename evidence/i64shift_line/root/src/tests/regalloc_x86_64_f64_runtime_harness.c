#include <stdint.h>
#include <stdio.h>

typedef union {
    uint64_t bits;
    double value;
} F64Bits;

typedef int32_t (*F64CompareFn)(double, double);

#define DECLARE_COMPARE(name) \
    extern int32_t regalloc_x64_bridge_f64_##name(double, double); \
    extern int32_t regalloc_x64_bridge_f64_fused_##name(double, double)

DECLARE_COMPARE(eq);
DECLARE_COMPARE(ne);
DECLARE_COMPARE(lt);
DECLARE_COMPARE(le);
DECLARE_COMPARE(gt);
DECLARE_COMPARE(ge);

static const uint32_t kResultTransform = UINT32_C(0x5a5a5a5a);

static int32_t transformed_expected(int32_t value) {
    return (int32_t)((uint32_t)value ^ kResultTransform);
}

static int verify_nan_comparisons(void) {
    F64CompareFn functions[2][6] = {
        {
            regalloc_x64_bridge_f64_eq,
            regalloc_x64_bridge_f64_ne,
            regalloc_x64_bridge_f64_lt,
            regalloc_x64_bridge_f64_le,
            regalloc_x64_bridge_f64_gt,
            regalloc_x64_bridge_f64_ge,
        },
        {
            regalloc_x64_bridge_f64_fused_eq,
            regalloc_x64_bridge_f64_fused_ne,
            regalloc_x64_bridge_f64_fused_lt,
            regalloc_x64_bridge_f64_fused_le,
            regalloc_x64_bridge_f64_fused_gt,
            regalloc_x64_bridge_f64_fused_ge,
        },
    };
    const int32_t expected[6] = {0, 1, 0, 0, 0, 0};
    const F64Bits quiet_nan = {.bits = UINT64_C(0x7ff8000000000042)};
    const F64Bits signaling_nan = {.bits = UINT64_C(0x7ff0000000000042)};
    const F64Bits finite = {.bits = UINT64_C(0x400921fb54442d18)};
    const double pairs[5][2] = {
        {quiet_nan.value, finite.value},
        {finite.value, quiet_nan.value},
        {signaling_nan.value, finite.value},
        {finite.value, signaling_nan.value},
        {quiet_nan.value, signaling_nan.value},
    };
    for (int form = 0; form < 2; ++form) {
        for (int function_index = 0; function_index < 6; ++function_index) {
            for (int pair_index = 0; pair_index < 5; ++pair_index) {
                const int32_t actual = functions[form][function_index](
                    pairs[pair_index][0], pairs[pair_index][1]);
                if (actual != transformed_expected(expected[function_index])) {
                    return 10 + form * 40 + function_index * 5 + pair_index;
                }
            }
        }
    }
    return 0;
}

static int verify_finite_comparisons(void) {
    F64CompareFn functions[2][6] = {
        {
            regalloc_x64_bridge_f64_eq,
            regalloc_x64_bridge_f64_ne,
            regalloc_x64_bridge_f64_lt,
            regalloc_x64_bridge_f64_le,
            regalloc_x64_bridge_f64_gt,
            regalloc_x64_bridge_f64_ge,
        },
        {
            regalloc_x64_bridge_f64_fused_eq,
            regalloc_x64_bridge_f64_fused_ne,
            regalloc_x64_bridge_f64_fused_lt,
            regalloc_x64_bridge_f64_fused_le,
            regalloc_x64_bridge_f64_fused_gt,
            regalloc_x64_bridge_f64_fused_ge,
        },
    };
    const int32_t less[6] = {0, 1, 1, 1, 0, 0};
    const int32_t greater[6] = {0, 1, 0, 0, 1, 1};
    const int32_t equal[6] = {1, 0, 0, 1, 0, 1};
    const int32_t *expected[6] = {
        less, greater, equal, equal, less, greater,
    };
    const F64Bits negative_infinity = {.bits = UINT64_C(0xfff0000000000000)};
    const F64Bits positive_infinity = {.bits = UINT64_C(0x7ff0000000000000)};
    const F64Bits negative_zero = {.bits = UINT64_C(0x8000000000000000)};
    const double pairs[6][2] = {
        {1.0, 2.0},
        {2.0, 1.0},
        {1.0, 1.0},
        {negative_zero.value, 0.0},
        {negative_infinity.value, -1.0},
        {positive_infinity.value, 1.0},
    };
    for (int form = 0; form < 2; ++form) {
        for (int pair_index = 0; pair_index < 6; ++pair_index) {
            for (int function_index = 0; function_index < 6; ++function_index) {
                const int32_t actual = functions[form][function_index](
                    pairs[pair_index][0], pairs[pair_index][1]);
                if (actual != transformed_expected(
                                  expected[pair_index][function_index])) {
                    return 100 + form * 50 + pair_index * 6 + function_index;
                }
            }
        }
    }
    return 0;
}

int main(void) {
    const int nan_code = verify_nan_comparisons();
    if (nan_code != 0) {
        return nan_code;
    }
    const int finite_code = verify_finite_comparisons();
    if (finite_code != 0) {
        return finite_code;
    }
    puts("regalloc_x86_64_f64_runtime_gate ok");
    puts("nan_compare_case_count=60");
    puts("finite_compare_case_count=72");
    puts("materialized_function_count=6");
    puts("fused_function_count=6");
    puts("bridge_result_transform=0x5a5a5a5a");
    return 0;
}
