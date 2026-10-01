#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main

static void gate_fail(const char *message) {
    fprintf(
        stderr,
        "cold_specialized_exact_sidecar_clone_gate: %s\n",
        message);
    exit(1);
}

static Arena *gate_arena_create(void) {
    Arena *arena = mmap(
        0, sizeof(Arena),
        PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (arena == MAP_FAILED)
        gate_fail("arena owner mmap failed");
    return arena;
}

static int32_t *gate_i32_array(
        Arena *arena, int32_t count,
        int32_t initial) {
    if (!arena || count <= 0)
        gate_fail("array request is invalid");
    int32_t *values = arena_alloc(
        arena, (size_t)count * sizeof(int32_t));
    for (int32_t row = 0; row < count; row++)
        values[row] = initial;
    return values;
}

static BodyIR *gate_source_body(Arena *arena) {
    BodyIR *body = body_new(arena);
    body->producer_function_row = 41;
    int32_t source_slot = body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    int32_t merge_slot = body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    body->slot_exact_type_id[source_slot] = 7001;
    body->slot_place_kind[source_slot] = COLD_EXPR_PLACE_PARAM;
    body->slot_origin_id[source_slot] = 0;
    body->slot_managed_storage_kind[source_slot] =
        COLD_MANAGED_STORAGE_STR;
    body->slot_exact_type_id[merge_slot] = 7001;
    body->slot_place_kind[merge_slot] = COLD_EXPR_PLACE_CFG_MERGE;
    body->slot_origin_id[merge_slot] = 4;
    body->slot_managed_storage_kind[merge_slot] =
        COLD_MANAGED_STORAGE_STR;

    for (int32_t op = 0; op < 5; op++)
        body_op3(body, BODY_OP_NOP, -1, -1, 0, 0);
    const int32_t source_first = 0;
    const int32_t input_first = 1;
    const int32_t source_second = 2;
    const int32_t input_second = 3;
    const int32_t phi = 4;
    int32_t sources[2] = {source_first, source_second};
    int32_t inputs[2] = {input_first, input_second};
    for (int32_t edge = 0; edge < 2; edge++) {
        int32_t source = sources[edge];
        body->op_value_def_slot[source] = source_slot;
        body->op_value_def_exact_type_id[source] = 7001;
        body->op_value_def_producer_function_row[source] = 41;
        body->op_value_def_place_kind[source] =
            COLD_EXPR_PLACE_PARAM;
        body->op_value_def_ownership[source] =
            COLD_EXPR_OWN_BORROW_SHARED;
        body->op_value_def_origin_id[source] = edge;

        int32_t input = inputs[edge];
        body->op_kind[input] = BODY_OP_COPY_COMPOSITE;
        body->op_dst[input] = merge_slot;
        body->op_a[input] = source_slot;
        body->op_b[input] = 0;
        body->op_c[input] = 0;
        body->op_value_def_slot[input] = merge_slot;
        body->op_value_def_exact_type_id[input] = 7001;
        body->op_value_def_producer_function_row[input] = 41;
        body->op_value_def_place_kind[input] =
            COLD_EXPR_PLACE_STACK_LOCAL;
        body->op_value_def_ownership[input] =
            COLD_EXPR_OWN_BORROW_SHARED;
        body->op_value_def_origin_id[input] = merge_slot;
        body->op_source_value_def_op_id[input] = source;
    }
    body->op_kind[phi] = BODY_OP_COPY_COMPOSITE;
    body->op_dst[phi] = merge_slot;
    body->op_a[phi] = merge_slot;
    body->op_b[phi] = input_second;
    body->op_c[phi] = 2;
    body->op_value_def_slot[phi] = merge_slot;
    body->op_value_def_exact_type_id[phi] = 7001;
    body->op_value_def_producer_function_row[phi] = 41;
    body->op_value_def_place_kind[phi] = COLD_EXPR_PLACE_CFG_MERGE;
    body->op_value_def_ownership[phi] = COLD_EXPR_OWN_BORROW_SHARED;
    body->op_value_def_origin_id[phi] = phi;
    body->op_source_value_def_op_id[phi] = input_first;

    body->block_count = 6;
    body->block_cap = 6;
    body->block_op_start = gate_i32_array(arena, 6, 0);
    body->block_op_count = gate_i32_array(arena, 6, 1);
    body->block_term = gate_i32_array(arena, 6, -1);
    body->block_op_start[0] = 0;
    body->block_op_count[0] = 0;
    body->block_op_start[1] = source_first;
    body->block_op_start[2] = input_first;
    body->block_op_start[3] = source_second;
    body->block_op_start[4] = input_second;
    body->block_op_start[5] = phi;

    body->term_count = 6;
    body->term_cap = 6;
    body->term_kind = gate_i32_array(arena, 6, BODY_TERM_BR);
    body->term_kind[0] = BODY_TERM_CBR;
    body->term_kind[5] = BODY_TERM_RET;
    body->term_value = gate_i32_array(arena, 6, -1);
    body->term_case_start = gate_i32_array(arena, 6, -1);
    body->term_case_count = gate_i32_array(arena, 6, 0);
    body->term_true_block = gate_i32_array(arena, 6, -1);
    body->term_false_block = gate_i32_array(arena, 6, -1);
    body->term_true_block[0] = 1;
    body->term_false_block[0] = 3;
    body->term_true_block[1] = 2;
    body->term_true_block[2] = 5;
    body->term_true_block[3] = 4;
    body->term_true_block[4] = 5;
    body->term_source_value_def_op_id =
        gate_i32_array(arena, 6, -1);
    for (int32_t block = 0; block < 6; block++)
        body->block_term[block] = block;

    body->exact_borrowed_merge_count = 2;
    body->exact_borrowed_merge_cap = 4;
    body->exact_borrowed_merge_input_op_ids =
        gate_i32_array(arena, 4, -1);
    body->exact_borrowed_merge_source_def_ids =
        gate_i32_array(arena, 4, -1);
    body->exact_borrowed_merge_input_block_ids =
        gate_i32_array(arena, 4, -1);
    body->exact_borrowed_merge_input_predecessor_block_ids =
        gate_i32_array(arena, 4, -1);
    body->exact_borrowed_merge_input_predecessor_term_ids =
        gate_i32_array(arena, 4, -1);
    body->exact_borrowed_merge_phi_merge_def_ids =
        gate_i32_array(arena, 4, -1);
    body->exact_borrowed_merge_input_op_ids[0] = input_first;
    body->exact_borrowed_merge_input_op_ids[1] = input_second;
    body->exact_borrowed_merge_source_def_ids[0] = source_first;
    body->exact_borrowed_merge_source_def_ids[1] = source_second;
    body->exact_borrowed_merge_input_block_ids[0] = 2;
    body->exact_borrowed_merge_input_block_ids[1] = 4;
    body->exact_borrowed_merge_input_predecessor_block_ids[0] = 1;
    body->exact_borrowed_merge_input_predecessor_block_ids[1] = 3;
    body->exact_borrowed_merge_input_predecessor_term_ids[0] = 1;
    body->exact_borrowed_merge_input_predecessor_term_ids[1] = 3;
    body->exact_borrowed_merge_phi_merge_def_ids[0] = phi;
    body->exact_borrowed_merge_phi_merge_def_ids[1] = phi;
    return body;
}

static void gate_clone_control_tables(
        Arena *arena, BodyIR *destination,
        const BodyIR *source) {
    destination->block_count = source->block_count;
    destination->block_cap = source->block_count;
    destination->block_op_start = cold_clone_i32_array(
        arena, source->block_op_start, source->block_count);
    destination->block_op_count = cold_clone_i32_array(
        arena, source->block_op_count, source->block_count);
    destination->block_term = cold_clone_i32_array(
        arena, source->block_term, source->block_count);
    destination->term_count = source->term_count;
    destination->term_cap = source->term_count;
    destination->term_kind = cold_clone_i32_array(
        arena, source->term_kind, source->term_count);
    destination->term_value = cold_clone_i32_array(
        arena, source->term_value, source->term_count);
    destination->term_case_start = cold_clone_i32_array(
        arena, source->term_case_start, source->term_count);
    destination->term_case_count = cold_clone_i32_array(
        arena, source->term_case_count, source->term_count);
    destination->term_true_block = cold_clone_i32_array(
        arena, source->term_true_block, source->term_count);
    destination->term_false_block = cold_clone_i32_array(
        arena, source->term_false_block, source->term_count);
    destination->term_source_value_def_op_id = cold_clone_i32_array(
        arena, source->term_source_value_def_op_id,
        source->term_count);
}

static void gate_seed_parser_exact_sidecars(
        Arena *arena, BodyIR *body) {
    body->exact_borrowed_rebind_count = 1;
    body->exact_borrowed_rebind_cap = 1;
    body->exact_borrowed_rebind_op_ids =
        gate_i32_array(arena, 1, 3);
    body->exact_borrowed_rebind_prior_def_ids =
        gate_i32_array(arena, 1, 2);
    body->exact_borrowed_rebind_block_ids =
        gate_i32_array(arena, 1, 4);
    body->exact_borrowed_rebind_predecessor_block_ids =
        gate_i32_array(arena, 1, 3);
    body->exact_borrowed_rebind_predecessor_term_ids =
        gate_i32_array(arena, 1, 3);

    body->exact_borrowed_lift_count = 1;
    body->exact_borrowed_lift_cap = 1;
    body->exact_borrowed_lift_input_op_ids =
        gate_i32_array(arena, 1, 3);
    body->exact_borrowed_lift_source_def_ids =
        gate_i32_array(arena, 1, 2);
    body->exact_borrowed_lift_shared_owner_def_ids =
        gate_i32_array(arena, 1, 0);
    body->exact_borrowed_lift_input_block_ids =
        gate_i32_array(arena, 1, 4);
    body->exact_borrowed_lift_input_term_ids =
        gate_i32_array(arena, 1, 4);
    body->exact_borrowed_lift_phi_merge_def_ids =
        gate_i32_array(arena, 1, 4);

    body->exact_loop_owner_closure_count = 1;
    body->exact_loop_owner_closure_cap = 1;
    body->exact_loop_owner_closure_def_ids =
        gate_i32_array(arena, 1, 4);
}

static void gate_require_distinct_merge_arrays(
        const BodyIR *source, const BodyIR *clone) {
#define GATE_REQUIRE_DISTINCT(field) \
    if (source->field == clone->field) \
        gate_fail("specialized merge sidecar aliases template: " #field)
    GATE_REQUIRE_DISTINCT(exact_borrowed_merge_input_op_ids);
    GATE_REQUIRE_DISTINCT(exact_borrowed_merge_source_def_ids);
    GATE_REQUIRE_DISTINCT(exact_borrowed_merge_input_block_ids);
    GATE_REQUIRE_DISTINCT(
        exact_borrowed_merge_input_predecessor_block_ids);
    GATE_REQUIRE_DISTINCT(
        exact_borrowed_merge_input_predecessor_term_ids);
    GATE_REQUIRE_DISTINCT(exact_borrowed_merge_phi_merge_def_ids);
#undef GATE_REQUIRE_DISTINCT
}

static void gate_require_relocation(
        const BodyIR *source, const BodyIR *clone) {
    if (source->exact_borrowed_merge_input_op_ids[1] != 3 ||
        source->exact_borrowed_merge_source_def_ids[1] != 2 ||
        source->exact_borrowed_merge_phi_merge_def_ids[0] != 4 ||
        source->exact_borrowed_merge_phi_merge_def_ids[1] != 4) {
        gate_fail("specialization relocation mutated template sidecar");
    }
    if (clone->op_count != 6 ||
        clone->exact_borrowed_merge_count != 2 ||
        clone->exact_borrowed_merge_cap != 2 ||
        clone->exact_borrowed_merge_input_op_ids[0] != 1 ||
        clone->exact_borrowed_merge_input_op_ids[1] != 4 ||
        clone->exact_borrowed_merge_source_def_ids[0] != 0 ||
        clone->exact_borrowed_merge_source_def_ids[1] != 3 ||
        clone->exact_borrowed_merge_phi_merge_def_ids[0] != 5 ||
        clone->exact_borrowed_merge_phi_merge_def_ids[1] != 5 ||
        clone->exact_borrowed_merge_input_block_ids[0] != 2 ||
        clone->exact_borrowed_merge_input_block_ids[1] != 4 ||
        clone->exact_borrowed_merge_input_predecessor_block_ids[0] != 1 ||
        clone->exact_borrowed_merge_input_predecessor_block_ids[1] != 3 ||
        clone->exact_borrowed_merge_input_predecessor_term_ids[0] != 1 ||
        clone->exact_borrowed_merge_input_predecessor_term_ids[1] != 3) {
        gate_fail("sealed borrowed-merge relocation drifted");
    }
    if (clone->exact_borrowed_rebind_op_ids[0] != 4 ||
        clone->exact_borrowed_rebind_prior_def_ids[0] != 3 ||
        clone->exact_borrowed_rebind_block_ids[0] != 4 ||
        clone->exact_borrowed_rebind_predecessor_block_ids[0] != 3 ||
        clone->exact_borrowed_rebind_predecessor_term_ids[0] != 3 ||
        clone->exact_borrowed_lift_input_op_ids[0] != 4 ||
        clone->exact_borrowed_lift_source_def_ids[0] != 3 ||
        clone->exact_borrowed_lift_shared_owner_def_ids[0] != 0 ||
        clone->exact_borrowed_lift_input_block_ids[0] != 4 ||
        clone->exact_borrowed_lift_input_term_ids[0] != 4 ||
        clone->exact_borrowed_lift_phi_merge_def_ids[0] != 5 ||
        clone->exact_loop_owner_closure_def_ids[0] != 5) {
        gate_fail("parser exact sidecar relocation drifted");
    }
    for (int32_t op = 0; op < clone->op_count; op++) {
        int32_t expected = op == 2 ? -1 : 73;
        if (clone->op_value_def_producer_function_row[op] != expected) {
            gate_fail("producer FunctionRow moved as an op-row domain");
        }
    }
}

static bool gate_mode(int argc, char **argv, const char *name) {
    return argc == 2 && strcmp(argv[1], name) == 0;
}

int main(int argc, char **argv) {
    Arena *arena = gate_arena_create();
    BodyIR *source = gate_source_body(arena);
    BodyIR *clone = body_new(arena);
    body_clone_packed_tables(clone, source);
    gate_clone_control_tables(arena, clone, source);
    if (gate_mode(argc, argv, "partial-clone")) {
        source->exact_borrowed_merge_source_def_ids = NULL;
        cold_clone_specialized_exact_sidecars(
            arena, clone, source);
        gate_fail("partial specialized merge sidecar was accepted");
    }
    if (gate_mode(argc, argv, "odd-merge")) {
        source->exact_borrowed_merge_count = 1;
        cold_clone_specialized_exact_sidecars(
            arena, clone, source);
        gate_fail("odd specialized merge sidecar was accepted");
    }
    if (gate_mode(argc, argv, "fake-merge-nop")) {
        source->op_kind[4] = BODY_OP_NOP;
        cold_clone_specialized_exact_sidecars(arena, clone, source);
        gate_fail("fake NOP merge sidecar was accepted");
    }
    if (gate_mode(argc, argv, "wrong-merge-operands")) {
        source->op_b[4] = 1;
        cold_clone_specialized_exact_sidecars(arena, clone, source);
        gate_fail("wrong merge operand tuple was accepted");
    }
    if (gate_mode(argc, argv, "merge-block-oob")) {
        source->exact_borrowed_merge_input_block_ids[0] =
            source->block_count;
        cold_clone_specialized_exact_sidecars(arena, clone, source);
        gate_fail("out-of-range merge block was accepted");
    }
    if (gate_mode(argc, argv, "merge-source-oob")) {
        source->exact_borrowed_merge_source_def_ids[0] =
            source->op_count;
        cold_clone_specialized_exact_sidecars(arena, clone, source);
        gate_fail("out-of-range merge source was accepted");
    }
    if (gate_mode(argc, argv, "merge-term-oob")) {
        source->exact_borrowed_merge_input_predecessor_term_ids[0] =
            source->term_count;
        cold_clone_specialized_exact_sidecars(arena, clone, source);
        gate_fail("out-of-range merge term was accepted");
    }
    if (gate_mode(argc, argv, "producer-mismatch")) {
        source->op_value_def_producer_function_row[4] = 42;
        cold_clone_specialized_exact_sidecars(arena, clone, source);
        gate_fail("wrong producer FunctionRow was accepted");
    }
    cold_clone_specialized_exact_sidecars(
        arena, clone, source);
    gate_require_distinct_merge_arrays(source, clone);
    clone->producer_function_row = 73;
    for (int32_t op = 0; op < clone->op_count; op++) {
        if (clone->op_value_def_slot[op] >= 0) {
            clone->op_value_def_producer_function_row[op] = 73;
        }
    }
    gate_seed_parser_exact_sidecars(arena, clone);
    if (gate_mode(argc, argv, "partial-relocation")) {
        clone->exact_borrowed_lift_shared_owner_def_ids = NULL;
        cold_body_insert_op_at(clone, 2);
        gate_fail("partial exact relocation sidecar was accepted");
    }
    if (gate_mode(argc, argv, "rebind-block-oob")) {
        clone->exact_borrowed_rebind_block_ids[0] =
            clone->block_count;
        cold_body_insert_op_at(clone, 2);
        gate_fail("out-of-range rebind block was accepted");
    }
    if (gate_mode(argc, argv, "rebind-term-oob")) {
        clone->exact_borrowed_rebind_predecessor_term_ids[0] =
            clone->term_count;
        cold_body_insert_op_at(clone, 2);
        gate_fail("out-of-range rebind term was accepted");
    }
    if (gate_mode(argc, argv, "lift-block-oob")) {
        clone->exact_borrowed_lift_input_block_ids[0] =
            clone->block_count;
        cold_body_insert_op_at(clone, 2);
        gate_fail("out-of-range lift block was accepted");
    }
    if (gate_mode(argc, argv, "lift-term-oob")) {
        clone->exact_borrowed_lift_input_term_ids[0] =
            clone->term_count;
        cold_body_insert_op_at(clone, 2);
        gate_fail("out-of-range lift term was accepted");
    }
    if (argc > 1) gate_fail("unknown gate mode");
    cold_body_insert_op_at(clone, 2);
    gate_require_relocation(source, clone);
    puts("cold_specialized_exact_sidecar_clone_gate_status=pass");
    puts("borrowed_merge_clone=deep");
    puts("exact_sidecar_op_relocation=complete");
    puts("non_op_sidecar_rows=stable");
    arena_release(arena);
    return 0;
}
