#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

static void gate_fail(const char *message) {
    fprintf(
        stderr,
        "cold_exact_borrowed_phi_lift_gate: %s\n",
        message);
    exit(1);
}

static int32_t gate_add_function(
        Symbols *symbols, const char *name) {
    int32_t function = symbols_add_fn(
        symbols, cold_cstr_span(name),
        0, 0, 0, 0, cold_cstr_span("int32"));
    if (function < 0)
        gate_fail("function registration failed");
    return function;
}

static int32_t gate_emit_owned_string(
        BodyIR *body, const char *text) {
    int32_t slot =
        body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    body_slot_set_type(
        body, slot, cold_cstr_span("str"));
    int32_t literal = body_string_literal(
        body, cold_cstr_span(text));
    int32_t definition = body_op(
        body, BODY_OP_STR_LITERAL,
        slot, literal, 0);
    ColdExprResult result;
    cold_publish_plain_string_literal_producer(
        body, slot, definition, &result);
    if (result.slot != slot ||
        result.value_def_op_id != definition ||
        result.exact_type_id !=
            SLOT_STR * 1048576) {
        gate_fail(
            "owned string definition lacks exact authority");
    }
    return definition;
}

static int32_t gate_emit_borrowed_string(
        BodyIR *body, const char *text) {
    int32_t owner =
        gate_emit_owned_string(body, text);
    int32_t owner_slot =
        body->op_value_def_slot[owner];
    int32_t slot =
        body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    body_slot_set_type(
        body, slot, cold_cstr_span("str"));
    int32_t definition = body_op(
        body, BODY_OP_COPY_COMPOSITE,
        slot, owner_slot, 0);
    body->op_value_def_slot[definition] = slot;
    body->op_value_def_exact_type_id[definition] =
        body->op_value_def_exact_type_id[owner];
    body->op_value_def_producer_function_row[definition] =
        body->producer_function_row;
    body->op_value_def_place_kind[definition] =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->op_value_def_ownership[definition] =
        COLD_EXPR_OWN_BORROW_SHARED;
    body->op_value_def_origin_id[definition] = owner;
    body->slot_exact_type_id[slot] =
        body->op_value_def_exact_type_id[owner];
    body->slot_place_kind[slot] =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->slot_origin_id[slot] = owner;
    body->slot_managed_storage_kind[slot] =
        COLD_MANAGED_STORAGE_STR;
    return definition;
}

static void gate_build_fixture(
        Arena *arena, Symbols **symbols_out,
        BodyIR **body_out,
        ColdExactLocalMergeRequest requests[4],
        int32_t *merge_block_out) {
    ColdHarnessCompilation *compilation = arena_alloc(
        arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(compilation, arena);
    Symbols *symbols = compilation->symbols;
    BodyIR *body = body_new(arena);
    body->producer_function_row =
        gate_add_function(
            symbols, "ExactBorrowedPhiLiftGate");
    body->debug_name =
        cold_cstr_span("exact_borrowed_phi_lift_gate");
    Parser parser = cold_parser_issue_legacy_span(
        symbols, cold_cstr_span("exact-borrowed-phi-lift"));

    int32_t entry = body_block(body);
    int32_t first = body_block(body);
    int32_t second = body_block(body);
    int32_t merge = body_block(body);
    Local *locals = arena_alloc(
        arena, 4 * sizeof(Local));
    memset(locals, 0, 4 * sizeof(Local));
    memset(
        requests, 0,
        4 * sizeof(ColdExactLocalMergeRequest));
    static const char *names[4] = {
        "mixed_first",
        "mixed_second",
        "borrowed_pair",
        "owned_pair",
    };
    body_reopen_block(body, entry);
    int32_t predicate =
        body_slot(body, SLOT_I32, 4);
    int32_t zero =
        body_slot(body, SLOT_I32, 4);
    body_op(
        body, BODY_OP_I32_CONST,
        predicate, 1, 0);
    body_op(
        body, BODY_OP_I32_CONST,
        zero, 0, 0);
    int32_t entry_term = body_term(
        body, BODY_TERM_CBR,
        predicate, COND_NE, zero,
        first, second);
    body_end_block(body, entry, entry_term);

    body_reopen_block(body, first);
    for (int32_t i = 0; i < 4; i++) {
        int32_t definition =
            i == 0 || i == 2
                ? gate_emit_borrowed_string(
                      body,
                      i == 0 ? "first-mixed-borrow"
                             : "first-borrow-pair")
                : gate_emit_owned_string(
                      body,
                      i == 1 ? "first-mixed-owner"
                             : "first-owner-pair");
        locals[i].name =
            cold_cstr_span(names[i]);
        locals[i].kind = SLOT_STR;
        locals[i].slot =
            body->op_value_def_slot[definition];
        locals[i].value_def_op_id = definition;
        requests[i].local = &locals[i];
        requests[i].first_def = definition;
        requests[i].destination_override = -1;
    }
    body_branch_to(body, first, merge);

    body_reopen_block(body, second);
    for (int32_t i = 0; i < 4; i++) {
        requests[i].second_def =
            i == 1 || i == 2
                ? gate_emit_borrowed_string(
                      body,
                      i == 1 ? "second-mixed-borrow"
                             : "second-borrow-pair")
                : gate_emit_owned_string(
                      body,
                      i == 0 ? "second-mixed-owner"
                             : "second-owner-pair");
    }
    body_branch_to(body, second, merge);

    body_reopen_block(body, merge);
    int32_t final_first = -1;
    int32_t final_second = -1;
    cold_merge_exact_local_defs_batch(
        &parser, body, requests, 4,
        first, second,
        &final_first, &final_second);
    if (final_first < 0 || final_second < 0 ||
        !cold_cfg_predecessor_reaches_merge(
            body, final_first, merge) ||
        !cold_cfg_predecessor_reaches_merge(
            body, final_second, merge)) {
        gate_fail(
            "final exact edge chain does not reach merge");
    }
    *symbols_out = symbols;
    *body_out = body;
    *merge_block_out = merge;
}

int main(int argc, char **argv) {
    Arena arena = {0};
    Symbols *symbols = 0;
    BodyIR *body = 0;
    ColdExactLocalMergeRequest requests[4];
    int32_t merge = -1;
    gate_build_fixture(
        &arena, &symbols, &body,
        requests, &merge);
    if (body->exact_borrowed_lift_count != 2) {
        gate_fail(
            "fixture did not record two exact borrowed lifts");
    }
    if (argc == 2 &&
        strcmp(argv[1], "mutate-input-block") == 0) {
        cold_record_exact_borrowed_phi_lift(
            body,
            body->exact_borrowed_lift_source_def_ids[0],
            body->exact_borrowed_lift_shared_owner_def_ids[0],
            body->exact_borrowed_lift_input_op_ids[0],
            merge,
            body->exact_borrowed_lift_input_term_ids[0],
            body->exact_borrowed_lift_phi_merge_def_ids[0]);
        gate_fail("input-block mutation was accepted");
    } else if (argc == 2 &&
               strcmp(
                   argv[1],
                   "mutate-shared-origin") == 0) {
        int32_t shared =
            body->exact_borrowed_lift_shared_owner_def_ids[0];
        body->op_value_def_origin_id[shared] =
            body->exact_borrowed_lift_source_def_ids[1];
        cold_record_exact_borrowed_phi_lift(
            body,
            body->exact_borrowed_lift_source_def_ids[0],
            shared,
            body->exact_borrowed_lift_input_op_ids[0],
            body->exact_borrowed_lift_input_block_ids[0],
            body->exact_borrowed_lift_input_term_ids[0],
            body->exact_borrowed_lift_phi_merge_def_ids[0]);
        gate_fail("shared-origin mutation was accepted");
    } else if (argc != 1) {
        gate_fail("unknown mutation");
    }
    int32_t result =
        body_slot(body, SLOT_I32, 4);
    body_op(
        body, BODY_OP_I32_CONST,
        result, 0, 0);
    int32_t terminal = body_term(
        body, BODY_TERM_RET,
        result, 0, 0, -1, -1);
    body_end_block(body, merge, terminal);
    if (!cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "exact-borrowed-phi-lift-gate")) {
        gate_fail(
            "exact borrowed phi lift schema was rejected");
    }
    if (argc == 2)
        gate_fail("borrowed phi lift mutation was accepted");
    puts("cold_exact_borrowed_phi_lift_count=2");
    puts("cold_exact_borrowed_phi_lift_gate_status=pass");
    arena_release(&arena);
    return 0;
}
