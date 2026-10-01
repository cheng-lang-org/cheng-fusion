#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main

int main(void) {
    const int32_t pointer_type_id =
        SLOT_OBJECT_REF * 1048576;
    Arena arena;
    Symbols symbols;
    TypeDef types[1];
    FnDef functions[1];
    ColdFnInlineParamStorage formal_storage;
    int32_t type_name_hash_rows[8] = {0};
    int32_t type_local_name_hash_rows[8] = {0};
    int32_t type_local_name_next_rows[1] = {-1};
    memset(&arena, 0, sizeof(arena));
    memset(&symbols, 0, sizeof(symbols));
    memset(types, 0, sizeof(types));
    memset(functions, 0, sizeof(functions));
    memset(&formal_storage, 0, sizeof(formal_storage));

    types[0].name = cold_cstr_span("Int32Ptr");
    types[0].alias_type = cold_cstr_span("int32 *");
    types[0].declaration_origin_row = -1;
    symbols.types = types;
    symbols.type_count = 1;
    symbols.type_cap = 1;
    symbols.type_name_hash_rows = type_name_hash_rows;
    symbols.type_local_name_hash_rows =
        type_local_name_hash_rows;
    symbols.type_local_name_next_rows =
        type_local_name_next_rows;
    symbols.type_name_hash_cap = 8;
    symbols_type_name_indices_rebuild(&symbols);

    cold_fn_bind_inline_param_storage(
        &functions[0], &formal_storage);
    functions[0].name =
        cold_cstr_span("typed_abi_pointer_out");
    functions[0].arity = 1;
    functions[0].param_kind[0] = SLOT_PTR;
    functions[0].param_size[0] = 8;
    functions[0].param_type[0] =
        cold_cstr_span("Int32Ptr");
    functions[0].param_exact_type_id[0] =
        pointer_type_id;
    functions[0].param_exact_object_is_ref[0] = -1;
    functions[0].borrows_args = true;
    symbols.functions = functions;
    symbols.function_count = 1;

    Span pointee = {0};
    if (!cold_exact_abi_pointer_alias_pointee(
            &symbols, cold_cstr_span("Int32Ptr"),
            &pointee) ||
        !span_eq(pointee, "int32") ||
        cold_exact_abi_pointer_alias_type_id(
            &symbols, cold_cstr_span("Int32Ptr"),
            SLOT_PTR) != pointer_type_id ||
        cold_exact_formal_type_id_from_signature(
            &symbols, &functions[0], 0, 0) !=
            pointer_type_id) {
        return 10;
    }

    BodyIR *body = body_new(&arena);
    body->producer_function_row = 0;
    body->debug_name = functions[0].name;
    (void)body_block(body);
    int32_t raw_pointer = body_slot(
        body, SLOT_PTR, 8);
    body_slot_set_type(
        body, raw_pointer,
        cold_cstr_span("Int32Ptr"));
    body->param_count = 1;
    body->param_slot[0] = raw_pointer;
    int32_t exact_type_id = -1;
    int32_t object_is_ref = -2;
    int32_t storage =
        cold_frozen_formal_storage_for_param(
            body, &symbols, raw_pointer,
            SLOT_PTR, 0, &exact_type_id,
            &object_is_ref);
    if (storage != COLD_MANAGED_STORAGE_PLAIN ||
        exact_type_id != pointer_type_id ||
        object_is_ref != -1) {
        return 11;
    }
    ColdExprResult pointer =
        cold_emit_exact_param_definition(
            body, &symbols, raw_pointer,
            SLOT_PTR, 0, COLD_EXPR_OWN_PLAIN,
            storage, exact_type_id, object_is_ref);
    int32_t value = body_slot(body, SLOT_I32, 4);
    int32_t value_definition = body_op(
        body, BODY_OP_I32_CONST, value, 7, 0);
    (void)value_definition;
    int32_t store = body_op(
        body, BODY_OP_PTR_STORE_I32,
        pointer.slot, value, 0);
    cold_publish_exact_managed_read(
        body, store, COLD_EXACT_READ_OPERAND_DST,
        &pointer);
    if (!cold_exact_abi_pointer_param_store_tuple_valid(
            body, &symbols, store)) {
        return 12;
    }

    body->op_exact_source_dst_value_def_op_id[store] = -1;
    if (cold_exact_abi_pointer_param_store_tuple_valid(
            body, &symbols, store)) {
        return 13;
    }
    body->op_exact_source_dst_value_def_op_id[store] =
        pointer.value_def_op_id;
    body->op_kind[store] = BODY_OP_PTR_STORE_I64;
    if (cold_exact_abi_pointer_param_store_tuple_valid(
            body, &symbols, store)) {
        return 14;
    }
    body->op_kind[store] = BODY_OP_PTR_STORE_I32;
    body->op_value_def_place_kind[pointer.value_def_op_id] =
        COLD_EXPR_PLACE_STACK_LOCAL;
    if (cold_exact_abi_pointer_param_store_tuple_valid(
            body, &symbols, store)) {
        return 15;
    }
    body->op_value_def_place_kind[pointer.value_def_op_id] =
        COLD_EXPR_PLACE_PARAM;
    functions[0].borrows_args = false;
    if (cold_exact_abi_pointer_param_store_tuple_valid(
            body, &symbols, store)) {
        return 16;
    }
    functions[0].borrows_args = true;
    functions[0].param_exact_type_id[0] =
        pointer_type_id + 1;
    if (cold_exact_abi_pointer_param_store_tuple_valid(
            body, &symbols, store)) {
        return 17;
    }
    functions[0].param_exact_type_id[0] =
        pointer_type_id;

    puts("cold_typed_abi_pointer_lvalue_fixture=passed");
    return 0;
}
