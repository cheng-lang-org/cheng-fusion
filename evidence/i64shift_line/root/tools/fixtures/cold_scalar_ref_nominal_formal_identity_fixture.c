#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main

int main(void) {
    const int32_t domain_size = 1048576;
    TypeDef types[2];
    Symbols symbols;
    int32_t type_name_hash_rows[8] = {0};
    int32_t type_local_name_hash_rows[8] = {0};
    int32_t type_local_name_next_rows[2] = {-1, -1};
    int32_t declaration_origin_type_rows[2] = {0, 1};
    memset(types, 0, sizeof(types));
    memset(&symbols, 0, sizeof(symbols));
    symbols.types = types;
    symbols.type_count = 2;
    symbols.type_cap = 2;
    symbols.type_name_hash_rows = type_name_hash_rows;
    symbols.type_local_name_hash_rows =
        type_local_name_hash_rows;
    symbols.type_local_name_next_rows =
        type_local_name_next_rows;
    symbols.type_name_hash_cap = 8;
    symbols.declaration_origin_type_rows =
        declaration_origin_type_rows;
    symbols.declaration_origin_count = 2;

    types[0].name = cold_cstr_span("os.AtomicTree");
    types[0].alias_type = cold_cstr_span("uint64");
    types[0].declaration_origin_row = 0;
    types[1].name = cold_cstr_span("LeaseOrdinal");
    types[1].alias_type = cold_cstr_span("int32");
    types[1].declaration_origin_row = 1;
    symbols_type_name_indices_rebuild(&symbols);

    int32_t atomic_tree_type_id =
        SLOT_I64_REF * domain_size + 1;
    int32_t lease_ordinal_type_id =
        SLOT_I32_REF * domain_size + 2;
    if (!cold_exact_scalar_ref_formal_type_id_matches(
            &symbols, cold_cstr_span("var os.AtomicTree"),
            SLOT_I64_REF, 8, atomic_tree_type_id)) {
        return 10;
    }
    if (!cold_exact_scalar_ref_formal_type_id_matches(
            &symbols, cold_cstr_span("var LeaseOrdinal"),
            SLOT_I32_REF, 8, lease_ordinal_type_id)) {
        return 11;
    }
    if (!cold_exact_scalar_ref_formal_type_id_matches(
            &symbols, cold_cstr_span("var uint64"),
            SLOT_I64_REF, 8,
            SLOT_I64_REF * domain_size)) {
        return 12;
    }
    if (!cold_exact_scalar_ref_formal_type_id_matches(
            &symbols, cold_cstr_span("var int32"),
            SLOT_I32_REF, 8,
            SLOT_I32_REF * domain_size)) {
        return 13;
    }

    if (cold_exact_scalar_ref_formal_type_id_matches(
            &symbols, cold_cstr_span("var os.AtomicTree"),
            SLOT_I64_REF, 8,
            SLOT_I64_REF * domain_size)) {
        return 14;
    }
    if (cold_exact_scalar_ref_formal_type_id_matches(
            &symbols, cold_cstr_span("var os.AtomicTree"),
            SLOT_I64_REF, 8,
            SLOT_I64_REF * domain_size + 2)) {
        return 15;
    }
    if (cold_exact_scalar_ref_formal_type_id_matches(
            &symbols, cold_cstr_span("var os.AtomicTree"),
            SLOT_I32_REF, 8, atomic_tree_type_id)) {
        return 16;
    }
    if (cold_exact_scalar_ref_formal_type_id_matches(
            &symbols, cold_cstr_span("var os.AtomicTree"),
            SLOT_I64_REF, 4, atomic_tree_type_id)) {
        return 17;
    }
    if (cold_exact_scalar_ref_formal_type_id_matches(
            &symbols, cold_cstr_span("var MissingAlias"),
            SLOT_I64_REF, 8, atomic_tree_type_id)) {
        return 18;
    }
    if (cold_exact_scalar_ref_formal_type_id_matches(
            &symbols, cold_cstr_span("var uint64"),
            SLOT_I64_REF, 8, atomic_tree_type_id)) {
        return 19;
    }

    FnDef functions[1];
    ColdFnInlineParamStorage formal_storage;
    BodyIR body;
    int32_t slot_kind[1] = {SLOT_I64_REF};
    int32_t slot_size[1] = {8};
    Span slot_type[1] = {cold_cstr_span("os.AtomicTree")};
    int32_t slot_exact_type_id[1] = {-1};
    int32_t slot_managed_storage_kind[1] = {
        COLD_MANAGED_STORAGE_UNKNOWN};
    int32_t op_value_def_slot[1] = {0};
    int32_t op_value_def_exact_type_id[1] = {-1};
    int32_t op_value_def_producer_function_row[1] = {0};
    int32_t op_value_def_ownership[1] = {COLD_EXPR_OWN_PLAIN};
    memset(functions, 0, sizeof(functions));
    memset(&formal_storage, 0, sizeof(formal_storage));
    memset(&body, 0, sizeof(body));
    cold_fn_bind_inline_param_storage(
        &functions[0], &formal_storage);
    functions[0].arity = 1;
    functions[0].param_kind[0] = SLOT_I64_REF;
    functions[0].param_size[0] = 8;
    functions[0].param_type[0] =
        cold_cstr_span("var os.AtomicTree");
    functions[0].param_exact_type_id[0] =
        atomic_tree_type_id;
    functions[0].param_exact_object_is_ref[0] = -1;
    symbols.functions = functions;
    symbols.function_count = 1;
    body.producer_function_row = 0;
    body.param_count = 1;
    body.param_slot[0] = 0;
    body.slot_count = 1;
    body.slot_kind = slot_kind;
    body.slot_size = slot_size;
    body.slot_type = slot_type;
    body.slot_exact_type_id = slot_exact_type_id;
    body.slot_managed_storage_kind =
        slot_managed_storage_kind;
    body.op_value_def_slot = op_value_def_slot;
    body.op_value_def_exact_type_id =
        op_value_def_exact_type_id;
    body.op_value_def_producer_function_row =
        op_value_def_producer_function_row;
    body.op_value_def_ownership = op_value_def_ownership;
    int32_t exact_type_id = -1;
    int32_t object_is_ref = -2;
    int32_t storage = cold_frozen_formal_storage_for_param(
        &body, &symbols, 0, SLOT_I64_REF, 0,
        &exact_type_id, &object_is_ref);
    if (storage != COLD_MANAGED_STORAGE_PLAIN ||
        exact_type_id != atomic_tree_type_id ||
        object_is_ref != -1) {
        return 20;
    }
    slot_exact_type_id[0] = atomic_tree_type_id;
    if (cold_exact_managed_storage_for_slot(
            &symbols, &body, 0, SLOT_I64_REF) !=
        COLD_MANAGED_STORAGE_PLAIN) {
        return 29;
    }
    slot_exact_type_id[0] = -1;
    if (cold_exact_managed_storage_for_slot(
            &symbols, &body, 0, SLOT_I64_REF) !=
        COLD_MANAGED_STORAGE_PLAIN) {
        return 30;
    }
    slot_exact_type_id[0] =
        SLOT_I64_REF * domain_size + 2;
    if (cold_exact_managed_storage_for_slot(
            &symbols, &body, 0, SLOT_I64_REF) !=
        COLD_MANAGED_STORAGE_UNKNOWN) {
        return 31;
    }
    slot_exact_type_id[0] = atomic_tree_type_id;
    slot_size[0] = 4;
    if (cold_exact_managed_storage_for_slot(
            &symbols, &body, 0, SLOT_I64_REF) !=
        COLD_MANAGED_STORAGE_UNKNOWN) {
        return 32;
    }
    slot_size[0] = 8;
    slot_type[0] = cold_cstr_span("uint64");
    slot_exact_type_id[0] = SLOT_I64_REF * domain_size;
    if (cold_exact_managed_storage_for_slot(
            &symbols, &body, 0, SLOT_I64_REF) !=
        COLD_MANAGED_STORAGE_PLAIN) {
        return 33;
    }
    slot_type[0] = cold_cstr_span("os.AtomicTree");

    {
        Arena arena;
        memset(&arena, 0, sizeof(arena));
        BodyIR *forward_body = body_new(&arena);
        forward_body->producer_function_row = 0;
        forward_body->debug_name =
            cold_cstr_span("nominal_scalar_var_forward");
        (void)body_block(forward_body);
        int32_t raw_slot = body_slot(
            forward_body, SLOT_I64_REF, 8);
        body_slot_set_type(
            forward_body, raw_slot,
            cold_cstr_span("os.AtomicTree"));
        int32_t source_slot = body_slot(
            forward_body, SLOT_I64_REF, 8);
        body_slot_set_type(
            forward_body, source_slot,
            cold_cstr_span("os.AtomicTree"));
        forward_body->param_count = 1;
        forward_body->param_slot[0] = raw_slot;
        int32_t source_definition = body_op(
            forward_body, BODY_OP_COPY_I64,
            source_slot, raw_slot, 0);
        forward_body->op_b[source_definition] = 1;
        forward_body->op_value_def_slot[source_definition] =
            source_slot;
        forward_body->op_value_def_exact_type_id[
            source_definition] = atomic_tree_type_id;
        forward_body->op_value_def_producer_function_row[
            source_definition] = 0;
        forward_body->op_value_def_place_kind[
            source_definition] = COLD_EXPR_PLACE_PARAM;
        forward_body->op_value_def_ownership[
            source_definition] = COLD_EXPR_OWN_BORROW_UNIQUE;
        forward_body->op_value_def_origin_id[
            source_definition] = 0;
        forward_body->op_exact_source_a_value_def_op_id[
            source_definition] = source_definition;
        forward_body->slot_exact_type_id[raw_slot] =
            atomic_tree_type_id;
        forward_body->slot_place_kind[raw_slot] =
            COLD_EXPR_PLACE_PARAM;
        forward_body->slot_origin_id[raw_slot] = 0;
        forward_body->slot_managed_storage_kind[raw_slot] =
            COLD_MANAGED_STORAGE_PLAIN;
        forward_body->slot_exact_type_id[source_slot] =
            atomic_tree_type_id;
        forward_body->slot_place_kind[source_slot] =
            COLD_EXPR_PLACE_PARAM;
        forward_body->slot_origin_id[source_slot] = 0;
        forward_body->slot_managed_storage_kind[source_slot] =
            COLD_MANAGED_STORAGE_PLAIN;
        ColdExprResult source = {
            source_slot,
            SLOT_I64_REF,
            source_definition,
            atomic_tree_type_id,
            0,
            COLD_EXPR_PLACE_PARAM,
            COLD_EXPR_OWN_BORROW_UNIQUE,
            0};
        ColdExprResult forwarded =
            cold_emit_exact_borrow_call_carrier(
                forward_body, &symbols, &source,
                SLOT_I64_REF);
        if (forwarded.value_def_op_id <= source_definition ||
            forwarded.slot == source_slot ||
            forwarded.kind != SLOT_I64_REF ||
            forwarded.exact_type_id != atomic_tree_type_id ||
            forwarded.place_kind != COLD_EXPR_PLACE_STACK_LOCAL ||
            forwarded.ownership != COLD_EXPR_OWN_BORROW_UNIQUE ||
            forward_body->op_kind[
                forwarded.value_def_op_id] != BODY_OP_COPY_I64 ||
            forward_body->op_source_value_def_op_id[
                forwarded.value_def_op_id] != source_definition ||
            forward_body->op_value_def_slot[
                forwarded.value_def_op_id] != forwarded.slot ||
            forward_body->slot_exact_type_id[forwarded.slot] !=
                atomic_tree_type_id ||
            forward_body->slot_managed_storage_kind[
                forwarded.slot] != COLD_MANAGED_STORAGE_PLAIN) {
            return 34;
        }
    }

    int32_t atomic_tree_value_type_id =
        SLOT_I64 * domain_size + 1;
    slot_kind[0] = SLOT_I64;
    slot_size[0] = 8;
    slot_exact_type_id[0] = atomic_tree_value_type_id;
    slot_managed_storage_kind[0] =
        COLD_MANAGED_STORAGE_PLAIN;
    if (cold_canonical_storage_obligation_for_body_slot(
            &body, &symbols, 0) !=
        COLD_MANAGED_STORAGE_PLAIN) {
        return 21;
    }
    slot_exact_type_id[0] = SLOT_I64 * domain_size + 2;
    if (cold_canonical_storage_obligation_for_body_slot(
            &body, &symbols, 0) !=
        COLD_MANAGED_STORAGE_UNKNOWN) {
        return 22;
    }
    slot_exact_type_id[0] = atomic_tree_type_id;
    if (cold_canonical_storage_obligation_for_body_slot(
            &body, &symbols, 0) !=
        COLD_MANAGED_STORAGE_UNKNOWN) {
        return 23;
    }
    slot_exact_type_id[0] = atomic_tree_value_type_id;
    slot_size[0] = 4;
    if (cold_canonical_storage_obligation_for_body_slot(
            &body, &symbols, 0) !=
        COLD_MANAGED_STORAGE_UNKNOWN) {
        return 24;
    }
    slot_size[0] = 8;
    slot_type[0] = cold_cstr_span("uint64");
    slot_exact_type_id[0] = SLOT_I64 * domain_size;
    if (cold_canonical_storage_obligation_for_body_slot(
            &body, &symbols, 0) !=
        COLD_MANAGED_STORAGE_PLAIN) {
        return 25;
    }
    slot_kind[0] = SLOT_I32;
    slot_size[0] = 4;
    slot_type[0] = cold_cstr_span("bool");
    slot_exact_type_id[0] = SLOT_I32 * domain_size;
    if (cold_canonical_storage_obligation_for_body_slot(
            &body, &symbols, 0) !=
        COLD_MANAGED_STORAGE_PLAIN) {
        return 35;
    }
    slot_size[0] = 1;
    if (cold_canonical_storage_obligation_for_body_slot(
            &body, &symbols, 0) !=
        COLD_MANAGED_STORAGE_PLAIN) {
        return 36;
    }
    slot_size[0] = 2;
    if (cold_canonical_storage_obligation_for_body_slot(
            &body, &symbols, 0) !=
        COLD_MANAGED_STORAGE_UNKNOWN) {
        return 37;
    }
    slot_type[0] = cold_cstr_span("os.AtomicTree");
    slot_kind[0] = SLOT_I64;
    slot_size[0] = 8;
    slot_exact_type_id[0] = atomic_tree_value_type_id;
    op_value_def_exact_type_id[0] =
        atomic_tree_value_type_id;
    functions[0].param_kind[0] = SLOT_I64;
    functions[0].param_size[0] = 8;
    functions[0].param_type[0] =
        cold_cstr_span("os.AtomicTree");
    functions[0].param_exact_type_id[0] =
        atomic_tree_value_type_id;
    body.op_count = 1;
    if (!cold_exact_plain_abi_scalar_formal_copy_shape_valid(
            &body, &symbols, &functions[0], 0, 0)) {
        return 26;
    }
    functions[0].param_type[0] = cold_cstr_span("uint64");
    functions[0].param_exact_type_id[0] =
        SLOT_I64 * domain_size;
    if (cold_exact_plain_abi_scalar_formal_copy_shape_valid(
            &body, &symbols, &functions[0], 0, 0)) {
        return 27;
    }
    functions[0].param_type[0] =
        cold_cstr_span("os.AtomicTree");
    functions[0].param_exact_type_id[0] =
        atomic_tree_value_type_id;
    op_value_def_ownership[0] = COLD_EXPR_OWN_MOVE;
    if (cold_exact_plain_abi_scalar_formal_copy_shape_valid(
            &body, &symbols, &functions[0], 0, 0)) {
        return 28;
    }

    puts("cold_scalar_ref_nominal_formal_identity_fixture=passed");
    return 0;
}
