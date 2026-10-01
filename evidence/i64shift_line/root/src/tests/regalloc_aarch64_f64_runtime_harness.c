#include <stdint.h>
#include <stdio.h>

typedef union {
    uint64_t bits;
    double value;
} F64Bits;

typedef int32_t (*F64CompareFn)(double, double);

extern int32_t regalloc_bridge_f64_eq(double, double);
extern int32_t regalloc_bridge_f64_ne(double, double);
extern int32_t regalloc_bridge_f64_lt(double, double);
extern int32_t regalloc_bridge_f64_le(double, double);
extern int32_t regalloc_bridge_f64_gt(double, double);
extern int32_t regalloc_bridge_f64_ge(double, double);
extern double regalloc_bridge_f64_local(double, double);
extern void regalloc_bridge_f64_field(uint64_t *, double);
extern void regalloc_bridge_f64_index(uint64_t *, double, uint32_t);
extern double regalloc_bridge_f64_const_nan(void);
extern double regalloc_bridge_f64_const_negative_zero(void);
extern double regalloc_bridge_f64_const_infinity(void);
extern double regalloc_bridge_f64_const_subnormal(void);
extern double regalloc_bridge_f64_call_clobber(double);

static int verify_nan_comparisons(void) {
    F64CompareFn functions[6] = {
        regalloc_bridge_f64_eq,
        regalloc_bridge_f64_ne,
        regalloc_bridge_f64_lt,
        regalloc_bridge_f64_le,
        regalloc_bridge_f64_gt,
        regalloc_bridge_f64_ge,
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
    for (int function_index = 0; function_index < 6; ++function_index) {
        for (int pair_index = 0; pair_index < 5; ++pair_index) {
            const int32_t actual = functions[function_index](
                pairs[pair_index][0], pairs[pair_index][1]);
            if (actual != expected[function_index]) {
                return 10 + function_index * 5 + pair_index;
            }
        }
    }
    return 0;
}

static int verify_finite_comparisons(void) {
    F64CompareFn functions[6] = {
        regalloc_bridge_f64_eq,
        regalloc_bridge_f64_ne,
        regalloc_bridge_f64_lt,
        regalloc_bridge_f64_le,
        regalloc_bridge_f64_gt,
        regalloc_bridge_f64_ge,
    };
    const int32_t expected[3][6] = {
        {0, 1, 1, 1, 0, 0},
        {0, 1, 0, 0, 1, 1},
        {1, 0, 0, 1, 0, 1},
    };
    const double pairs[3][2] = {
        {1.0, 2.0},
        {2.0, 1.0},
        {1.0, 1.0},
    };
    for (int pair_index = 0; pair_index < 3; ++pair_index) {
        for (int function_index = 0; function_index < 6; ++function_index) {
            const int32_t actual = functions[function_index](
                pairs[pair_index][0], pairs[pair_index][1]);
            if (actual != expected[pair_index][function_index]) {
                return 40 + pair_index * 6 + function_index;
            }
        }
    }
    return 0;
}

static int verify_store_payloads(void) {
    const F64Bits local_inputs[3][3] = {
        {
            {.bits = UINT64_C(0x3ff8000000000000)},
            {.bits = UINT64_C(0x4002000000000000)},
            {.bits = UINT64_C(0x400e000000000000)},
        },
        {
            {.bits = UINT64_C(0xc008000000000000)},
            {.bits = UINT64_C(0x3fe0000000000000)},
            {.bits = UINT64_C(0xc004000000000000)},
        },
        {
            {.bits = UINT64_C(0x3fd0000000000000)},
            {.bits = UINT64_C(0x3fe0000000000000)},
            {.bits = UINT64_C(0x3fe8000000000000)},
        },
    };
    for (int case_index = 0; case_index < 3; ++case_index) {
        F64Bits local_result = {
            .value = regalloc_bridge_f64_local(
                local_inputs[case_index][0].value,
                local_inputs[case_index][1].value),
        };
        const uint64_t expected = ~local_inputs[case_index][2].bits;
        if (local_result.bits != expected ||
            local_result.bits == local_inputs[case_index][0].bits ||
            local_result.bits == local_inputs[case_index][1].bits ||
            local_result.bits == local_inputs[case_index][2].bits) {
            return 50 + case_index;
        }
    }

    const F64Bits field_payload = {
        .bits = UINT64_C(0xc008000000000001),
    };
    uint64_t field_words[4] = {
        UINT64_C(0x1111111111111111),
        UINT64_C(0x2222222222222222),
        UINT64_C(0x3333333333333333),
        UINT64_C(0x4444444444444444),
    };
    regalloc_bridge_f64_field(field_words, field_payload.value);
    if (field_words[0] != UINT64_C(0x1111111111111111) ||
        field_words[1] != field_payload.bits ||
        field_words[2] != UINT64_C(0x3333333333333333) ||
        field_words[3] != UINT64_C(0x4444444444444444)) {
        return 53;
    }

    const F64Bits indexed_payload = {
        .bits = UINT64_C(0x3fd5555555555555),
    };
    uint64_t indexed_words[8] = {
        UINT64_C(0x0101010101010101),
        UINT64_C(0x0202020202020202),
        UINT64_C(0x0303030303030303),
        UINT64_C(0x0404040404040404),
        UINT64_C(0x0505050505050505),
        UINT64_C(0x0606060606060606),
        UINT64_C(0x0707070707070707),
        UINT64_C(0x0808080808080808),
    };
    regalloc_bridge_f64_index(indexed_words, indexed_payload.value, 3);
    for (int index = 0; index < 8; ++index) {
        const uint64_t expected = index == 3
            ? indexed_payload.bits
            : (UINT64_C(0x0101010101010101) * (uint64_t)(index + 1));
        if (indexed_words[index] != expected) {
            return 60 + index;
        }
    }
    return 0;
}

static int verify_constant_payloads(void) {
    const F64Bits actual[4] = {
        {.value = regalloc_bridge_f64_const_nan()},
        {.value = regalloc_bridge_f64_const_negative_zero()},
        {.value = regalloc_bridge_f64_const_infinity()},
        {.value = regalloc_bridge_f64_const_subnormal()},
    };
    const uint64_t expected[4] = {
        UINT64_C(0x7ff8000000000042),
        UINT64_C(0x8000000000000000),
        UINT64_C(0x7ff0000000000000),
        UINT64_C(0x0000000000000001),
    };
    for (int index = 0; index < 4; ++index) {
        if (actual[index].bits != expected[index]) {
            return 80 + index;
        }
    }
    return 0;
}

static int verify_call_clobber_payloads(void) {
    const F64Bits inputs[4] = {
        {.bits = UINT64_C(0x7ff8000000000042)},
        {.bits = UINT64_C(0x8000000000000000)},
        {.bits = UINT64_C(0x0000000000000001)},
        {.bits = UINT64_C(0x3ff0000000000000)},
    };
    for (int index = 0; index < 4; ++index) {
        const F64Bits actual = {
            .value = regalloc_bridge_f64_call_clobber(inputs[index].value),
        };
        if (actual.bits != inputs[index].bits) {
            return 90 + index;
        }
    }
    return 0;
}

int main(void) {
    const int compare_code = verify_nan_comparisons();
    if (compare_code != 0) {
        return compare_code;
    }
    const int finite_code = verify_finite_comparisons();
    if (finite_code != 0) {
        return finite_code;
    }
    const int store_code = verify_store_payloads();
    if (store_code != 0) {
        return store_code;
    }
    const int constant_code = verify_constant_payloads();
    if (constant_code != 0) {
        return constant_code;
    }
    const int call_clobber_code = verify_call_clobber_payloads();
    if (call_clobber_code != 0) {
        return call_clobber_code;
    }
    puts("regalloc_aarch64_f64_runtime_gate ok");
    return 0;
}
