#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main

int main(void) {
    Arena arena;
    memset(&arena, 0, sizeof(arena));
    Symbols symbols;
    memset(&symbols, 0, sizeof(symbols));
    FnDef functions[2];
    ColdFnInlineParamStorage formal_storage[2];
    memset(functions, 0, sizeof(functions));
    memset(formal_storage, 0, sizeof(formal_storage));
    cold_fn_bind_inline_param_storage(
        &functions[0], &formal_storage[0]);
    cold_fn_bind_inline_param_storage(
        &functions[1], &formal_storage[1]);
    symbols.functions = functions;
    symbols.function_count = 2;

    functions[0].name = cold_cstr_span("fixture_caller");
    functions[1].name = cold_cstr_span("fixture_cstring_reader");
    functions[1].arity = 1;
    functions[1].param_type[0] = cold_cstr_span("cstring");
    functions[1].param_kind[0] = SLOT_OPAQUE;
    functions[1].param_size[0] = 8;
    functions[1].param_exact_type_id[0] =
        cold_exact_abi_builtin_type_id(
            functions[1].param_type[0], SLOT_OPAQUE);

    BodyIR *body = body_new(&arena);
    body->producer_function_row = 0;
    body->debug_name = functions[0].name;
    (void)body_block(body);
    int32_t string_slot = body_slot(
        body, SLOT_STR, COLD_STR_SLOT_SIZE);
    body_slot_set_type(
        body, string_slot, cold_cstr_span("str"));
    int32_t string_definition = body_op(
        body, BODY_OP_STR_CONCAT,
        string_slot, -1, -1);
    int32_t string_type_id = cold_exact_managed_type_id(
        &symbols, body, string_slot, SLOT_STR);
    if (string_type_id < 0) return 10;
    body->op_value_def_slot[string_definition] = string_slot;
    body->op_value_def_exact_type_id[string_definition] =
        string_type_id;
    body->op_value_def_producer_function_row[string_definition] = 0;
    body->op_value_def_place_kind[string_definition] =
        COLD_EXPR_PLACE_TEMPORARY;
    body->op_value_def_ownership[string_definition] =
        COLD_EXPR_OWN_MOVE;
    body->op_value_def_origin_id[string_definition] =
        string_definition;
    body->slot_exact_type_id[string_slot] = string_type_id;
    body->slot_place_kind[string_slot] =
        COLD_EXPR_PLACE_TEMPORARY;
    body->slot_origin_id[string_slot] = string_definition;
    body->slot_managed_storage_kind[string_slot] =
        COLD_MANAGED_STORAGE_STR;

    int32_t argument = body_call_arg(body, string_slot);
    body->call_arg_value_def_op_id[argument] = string_definition;
    body->call_arg_place_kind[argument] =
        COLD_EXPR_PLACE_TEMPORARY;
    body->call_arg_ownership[argument] = COLD_EXPR_OWN_MOVE;
    body->call_arg_origin_id[argument] = string_definition;

    functions[1].borrows_args = false;
    int32_t op_count_before = body->op_count;
    cold_materialize_exact_abi_pointer_string_call_args(
        body, &symbols, &functions[1], argument, 1);
    if (body->op_count != op_count_before ||
        body->call_arg_slot[argument] != string_slot ||
        body->call_arg_value_def_op_id[argument] !=
            string_definition) {
        return 11;
    }

    functions[1].borrows_args = true;
    cold_materialize_exact_abi_pointer_string_call_args(
        body, &symbols, &functions[1], argument, 1);
    int32_t projection =
        body->call_arg_value_def_op_id[argument];
    if (projection != op_count_before ||
        body->call_arg_slot[argument] == string_slot ||
        body->call_arg_place_kind[argument] !=
            COLD_EXPR_PLACE_BORROW_PROJECTION ||
        body->call_arg_ownership[argument] !=
            COLD_EXPR_OWN_BORROW_SHARED ||
        body->call_arg_origin_id[argument] !=
            string_definition ||
        !cold_exact_abi_pointer_string_data_tuple_valid(
            body, &symbols, projection)) {
        return 12;
    }

    body->op_exact_source_a_value_def_op_id[projection] = -1;
    if (cold_exact_abi_pointer_string_data_tuple_valid(
            body, &symbols, projection)) {
        return 13;
    }
    body->op_exact_source_a_value_def_op_id[projection] =
        string_definition;
    body->op_value_def_ownership[projection] =
        COLD_EXPR_OWN_PLAIN;
    if (cold_exact_abi_pointer_string_data_tuple_valid(
            body, &symbols, projection)) {
        return 14;
    }

    puts("cold_dynamic_str_cstring_borrow_fixture=passed");
    return 0;
}
