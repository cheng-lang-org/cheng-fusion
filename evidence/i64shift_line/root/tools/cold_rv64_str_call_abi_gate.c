#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

static void gate_fail(const char *message) {
    fprintf(stderr, "cold_rv64_str_call_abi_gate: %s\n", message);
    exit(1);
}

static Arena *gate_arena_new(void) {
    Arena *arena = mmap(0, sizeof(Arena), PROT_READ | PROT_WRITE,
                        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (arena == MAP_FAILED) gate_fail("arena allocation failed");
    return arena;
}

static int32_t gate_add_function(Symbols *symbols, const char *name,
                                 int32_t arity, int32_t *kinds,
                                 int32_t *sizes) {
    Span types[COLD_MAX_I32_PARAMS];
    if (arity < 0 || arity > COLD_MAX_I32_PARAMS)
        gate_fail("fixture arity is invalid");
    for (int32_t i = 0; i < arity; i++) {
        types[i] = kinds[i] == SLOT_STR_REF
            ? cold_cstr_span("var str")
            : kinds[i] == SLOT_STR
                ? cold_cstr_span("str")
                : cold_cstr_span("int64");
    }
    int32_t function = symbols_add_fn(
        symbols, cold_cstr_span(name), arity, kinds, sizes, types,
        cold_cstr_span(""));
    if (function < 0) gate_fail("fixture function registration failed");
    return function;
}

static void gate_check_str_ref_register_abi(Arena *arena, Symbols *symbols) {
    int32_t kind = SLOT_STR_REF;
    int32_t size = 8;
    int32_t function = gate_add_function(
        symbols, "Rv64StrRefRegisterFixture", 1, &kind, &size);

    BodyIR *callee = body_new(arena);
    int32_t param = body_slot(callee, SLOT_STR_REF, 8);
    callee->param_count = 1;
    callee->param_slot[0] = param;
    Code *code = code_new(arena, 16);
    rv64_codegen_store_params(code, callee);
    if (code->count != 1 ||
        code->words[0] != rv_sd(
            RV_A0, RV_SP, (int16_t)callee->slot_offset[param])) {
        gate_fail("str-ref register ingress is not one address carrier");
    }

    BodyIR *caller = body_new(arena);
    int32_t arg = body_slot(caller, SLOT_STR_REF, 8);
    body_call_arg(caller, arg);
    code = code_new(arena, 16);
    int32_t stack_bytes = rv64_codegen_load_call_args(
        code, caller, symbols, function, 0);
    if (stack_bytes != 0 || code->count != 1 ||
        code->words[0] != rv_ld(
            RV_A0, RV_SP, (int16_t)caller->slot_offset[arg])) {
        gate_fail("str-ref register egress is not one address carrier");
    }
}

static void gate_check_str_ref_stack_abi(Arena *arena, Symbols *symbols) {
    int32_t kinds[9];
    int32_t sizes[9];
    for (int32_t i = 0; i < 8; i++) {
        kinds[i] = SLOT_I64;
        sizes[i] = 8;
    }
    kinds[8] = SLOT_STR_REF;
    sizes[8] = 8;
    int32_t function = gate_add_function(
        symbols, "Rv64StrRefStackFixture", 9, kinds, sizes);

    BodyIR *callee = body_new(arena);
    int32_t params[9];
    callee->param_count = 9;
    for (int32_t i = 0; i < 9; i++) {
        params[i] = body_slot(callee, kinds[i], sizes[i]);
        callee->param_slot[i] = params[i];
    }
    Code *code = code_new(arena, 32);
    rv64_codegen_store_params(code, callee);
    if (code->count != 10 ||
        code->words[8] != rv_ld(RV_T0, RV_S0, 16) ||
        code->words[9] != rv_sd(
            RV_T0, RV_SP, (int16_t)callee->slot_offset[params[8]])) {
        gate_fail("str-ref stack ingress is not one address carrier");
    }

    BodyIR *caller = body_new(arena);
    int32_t args[9];
    for (int32_t i = 0; i < 9; i++) {
        args[i] = body_slot(caller, kinds[i], sizes[i]);
        body_call_arg(caller, args[i]);
    }
    code = code_new(arena, 32);
    int32_t stack_bytes = rv64_codegen_load_call_args(
        code, caller, symbols, function, 0);
    if (stack_bytes != 16 || code->count != 11 ||
        code->words[0] != rv_addi(RV_SP, RV_SP, -16) ||
        code->words[9] != rv_ld(
            RV_T0, RV_SP, (int16_t)(caller->slot_offset[args[8]] + 16)) ||
        code->words[10] != rv_sd(RV_T0, RV_SP, 0)) {
        gate_fail("str-ref stack egress is not one address carrier");
    }
}

static void gate_check_str_register_abi(Arena *arena, Symbols *symbols) {
    int32_t kind = SLOT_STR;
    int32_t size = COLD_STR_SLOT_SIZE;
    int32_t function = gate_add_function(
        symbols, "Rv64StrRegisterFixture", 1, &kind, &size);

    BodyIR *callee = body_new(arena);
    int32_t param = body_slot(callee, SLOT_STR, COLD_STR_SLOT_SIZE);
    callee->param_count = 1;
    callee->param_slot[0] = param;
    Code *code = code_new(arena, 16);
    rv64_codegen_store_params(code, callee);
    if (code->count != 3) gate_fail("str register ingress word count drifted");
    for (int32_t part = 0; part < 3; part++) {
        if (code->words[part] != rv_sd(
                RV_A0 + part, RV_SP,
                (int16_t)(callee->slot_offset[param] + part * 8))) {
            gate_fail("str register ingress omitted a 64-bit word");
        }
    }

    BodyIR *caller = body_new(arena);
    int32_t arg = body_slot(caller, SLOT_STR, COLD_STR_SLOT_SIZE);
    body_call_arg(caller, arg);
    code = code_new(arena, 16);
    int32_t stack_bytes = rv64_codegen_load_call_args(
        code, caller, symbols, function, 0);
    if (stack_bytes != 0 || code->count != 3)
        gate_fail("str register egress word count drifted");
    for (int32_t part = 0; part < 3; part++) {
        if (code->words[part] != rv_ld(
                RV_A0 + part, RV_SP,
                (int16_t)(caller->slot_offset[arg] + part * 8))) {
            gate_fail("str register egress omitted a 64-bit word");
        }
    }
}

static void gate_check_str_stack_abi(Arena *arena, Symbols *symbols) {
    int32_t kinds[7];
    int32_t sizes[7];
    for (int32_t i = 0; i < 6; i++) {
        kinds[i] = SLOT_I64;
        sizes[i] = 8;
    }
    kinds[6] = SLOT_STR;
    sizes[6] = COLD_STR_SLOT_SIZE;
    int32_t function = gate_add_function(
        symbols, "Rv64StrStackFixture", 7, kinds, sizes);

    BodyIR *callee = body_new(arena);
    int32_t params[7];
    callee->param_count = 7;
    for (int32_t i = 0; i < 7; i++) {
        params[i] = body_slot(callee, kinds[i], sizes[i]);
        callee->param_slot[i] = params[i];
    }
    Code *code = code_new(arena, 32);
    rv64_codegen_store_params(code, callee);
    if (code->count != 12)
        gate_fail("str stack ingress instruction count drifted");
    for (int32_t part = 0; part < 3; part++) {
        int32_t instruction = 6 + part * 2;
        if (code->words[instruction] !=
                rv_ld(RV_T0, RV_S0, (int16_t)(16 + part * 8)) ||
            code->words[instruction + 1] != rv_sd(
                RV_T0, RV_SP,
                (int16_t)(callee->slot_offset[params[6]] + part * 8))) {
            gate_fail("str stack ingress omitted a 64-bit word");
        }
    }

    BodyIR *caller = body_new(arena);
    int32_t args[7];
    for (int32_t i = 0; i < 7; i++) {
        args[i] = body_slot(caller, kinds[i], sizes[i]);
        body_call_arg(caller, args[i]);
    }
    code = code_new(arena, 32);
    int32_t stack_bytes = rv64_codegen_load_call_args(
        code, caller, symbols, function, 0);
    if (stack_bytes != 32 || code->count != 13 ||
        code->words[0] != rv_addi(RV_SP, RV_SP, -32)) {
        gate_fail("str stack egress frame is not the aligned 24-byte ABI area");
    }
    for (int32_t part = 0; part < 3; part++) {
        int32_t instruction = 7 + part * 2;
        if (code->words[instruction] != rv_ld(
                RV_T0, RV_SP,
                (int16_t)(caller->slot_offset[args[6]] + 32 + part * 8)) ||
            code->words[instruction + 1] !=
                rv_sd(RV_T0, RV_SP, (int16_t)(part * 8))) {
            gate_fail("str stack egress omitted a 64-bit word");
        }
    }
}

static void gate_run_negative(const char *mode) {
    Arena *arena = gate_arena_new();
    if (strcmp(mode, "str-ref-param-width") == 0 ||
        strcmp(mode, "str-param-width") == 0) {
        int32_t kind = strcmp(mode, "str-ref-param-width") == 0
            ? SLOT_STR_REF : SLOT_STR;
        BodyIR *callee = body_new(arena);
        int32_t param = body_slot(callee, kind, 16);
        callee->param_count = 1;
        callee->param_slot[0] = param;
        Code *code = code_new(arena, 16);
        rv64_codegen_store_params(code, callee);
    } else {
        ColdHarnessCompilation *compilation = arena_alloc(
            arena, sizeof(ColdHarnessCompilation));
        cold_harness_compilation_begin(compilation, arena);
        Symbols *symbols = compilation->symbols;
        bool str_ref = strncmp(mode, "str-ref-", 8) == 0;
        int32_t param_kind = str_ref ? SLOT_STR_REF : SLOT_STR;
        int32_t param_size = str_ref ? 8 : COLD_STR_SLOT_SIZE;
        int32_t function = gate_add_function(
            symbols, "Rv64NegativeFixture", 1, &param_kind, &param_size);
        BodyIR *caller = body_new(arena);
        int32_t arg = -1;
        if (strcmp(mode, "str-ref-arg-width") == 0) {
            arg = body_slot(caller, SLOT_STR_REF, 16);
        } else if (strcmp(mode, "str-ref-arg-kind") == 0) {
            arg = body_slot(caller, SLOT_PTR, 8);
        } else if (strcmp(mode, "str-arg-width") == 0) {
            arg = body_slot(caller, SLOT_STR, 16);
        } else if (strcmp(mode, "str-arg-kind") == 0) {
            arg = body_slot(caller, SLOT_OBJECT, COLD_STR_SLOT_SIZE);
        } else {
            gate_fail("unknown negative mode");
        }
        body_call_arg(caller, arg);
        Code *code = code_new(arena, 16);
        (void)rv64_codegen_load_call_args(
            code, caller, symbols, function, 0);
    }
    gate_fail("negative ABI mutation was accepted");
}

int main(int argc, char **argv) {
    if (argc == 2) {
        gate_run_negative(argv[1]);
        return 1;
    }
    if (argc != 1) gate_fail("usage: gate [negative-mode]");
    Arena *arena = gate_arena_new();
    ColdHarnessCompilation *compilation = arena_alloc(
        arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(compilation, arena);
    Symbols *symbols = compilation->symbols;
    gate_check_str_ref_register_abi(arena, symbols);
    gate_check_str_ref_stack_abi(arena, symbols);
    gate_check_str_register_abi(arena, symbols);
    gate_check_str_stack_abi(arena, symbols);
    puts("rv64_str_ref_single_carrier_abi=1");
    puts("rv64_str_complete_24_byte_register_abi=1");
    puts("rv64_str_complete_24_byte_stack_abi=1");
    arena_release(arena);
    return 0;
}
