#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main

int main(void) {
    const int32_t domain_size = 1048576;
    Symbols symbols;
    BodyIR body;
    FnDef function;
    memset(&symbols, 0, sizeof(symbols));
    memset(&body, 0, sizeof(body));
    memset(&function, 0, sizeof(function));

    Span bool_type = { (const uint8_t *)"bool", 4 };
    int32_t slot_kind[1] = { SLOT_I32 };
    int32_t slot_size[1] = { 1 };
    Span slot_type[1] = { bool_type };
    int32_t slot_exact_type_id[1] = { SLOT_I32 * domain_size };
    int32_t slot_storage[1] = { COLD_MANAGED_STORAGE_PLAIN };
    int32_t definition_slot[1] = { 0 };
    int32_t definition_type_id[1] = { SLOT_I32 * domain_size };
    int32_t definition_producer[1] = { 0 };
    int32_t definition_ownership[1] = { COLD_EXPR_OWN_PLAIN };
    body.slot_count = 1;
    body.slot_kind = slot_kind;
    body.slot_size = slot_size;
    body.slot_type = slot_type;
    body.slot_exact_type_id = slot_exact_type_id;
    body.slot_managed_storage_kind = slot_storage;
    body.op_count = 1;
    body.op_value_def_slot = definition_slot;
    body.op_value_def_exact_type_id = definition_type_id;
    body.op_value_def_producer_function_row = definition_producer;
    body.op_value_def_ownership = definition_ownership;
    body.producer_function_row = 0;

    int32_t param_kind[1] = { SLOT_I32 };
    int32_t param_size[1] = { 1 };
    Span param_type[1] = { bool_type };
    int32_t param_type_id[1] = { SLOT_I32 * domain_size };
    function.arity = 1;
    function.param_kind = param_kind;
    function.param_size = param_size;
    function.param_type = param_type;
    function.param_exact_type_id = param_type_id;

    if (cold_canonical_storage_obligation_for_body_slot(
            &body, &symbols, 0) != COLD_MANAGED_STORAGE_PLAIN) {
        return 10;
    }
    if (!cold_exact_plain_abi_scalar_formal_copy_shape_valid(
            &body, &symbols, &function, 0, 0)) {
        return 11;
    }
    function.param_size[0] = 4;
    if (cold_exact_plain_abi_scalar_formal_copy_shape_valid(
            &body, &symbols, &function, 0, 0)) {
        return 12;
    }
    function.param_size[0] = 1;
    body.slot_size[0] = 4;
    if (cold_canonical_storage_obligation_for_body_slot(
            &body, &symbols, 0) != COLD_MANAGED_STORAGE_UNKNOWN) {
        return 13;
    }
    puts("cold_scalar_ref_narrow_value_call_fixture=passed");
    return 0;
}
