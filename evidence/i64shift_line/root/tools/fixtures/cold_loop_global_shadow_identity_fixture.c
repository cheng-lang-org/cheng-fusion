#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main

typedef struct Fixture {
    Symbols symbols;
    GlobalDef globals[2];
    Parser parser;
    BodyIR body;
    Locals locals;
    Local local_rows[1];
    ColdLocalValueState entry;
    ColdLocalValueState backedge;

    int32_t op_kind[2];
    int32_t op_dst[2];
    int32_t op_a[2];
    int32_t op_b[2];
    int32_t op_c[2];
    int32_t op_value_def_slot[2];
    int32_t op_value_def_exact_type_id[2];
    int32_t op_value_def_producer_function_row[2];
    int32_t op_value_def_place_kind[2];
    int32_t op_value_def_ownership[2];
    int32_t op_value_def_origin_id[2];
    int32_t op_value_def_consume_op_index_plus_one[2];
    int32_t op_source_value_def_op_id[2];

    int32_t slot_kind[2];
    int32_t slot_size[2];
    int32_t slot_exact_type_id[2];
    int32_t slot_place_kind[2];
    int32_t slot_origin_id[2];
    int32_t slot_managed_storage_kind[2];
} Fixture;

static void fixture_bind(Fixture *fixture) {
    BodyIR *body = &fixture->body;
    fixture->symbols.globals = fixture->globals;
    fixture->symbols.global_count = 2;
    fixture->parser.symbols = &fixture->symbols;
    fixture->locals.items = fixture->local_rows;
    fixture->locals.count = 1;
    fixture->locals.cap = 1;

    body->op_kind = fixture->op_kind;
    body->op_dst = fixture->op_dst;
    body->op_a = fixture->op_a;
    body->op_b = fixture->op_b;
    body->op_c = fixture->op_c;
    body->op_value_def_slot = fixture->op_value_def_slot;
    body->op_value_def_exact_type_id =
        fixture->op_value_def_exact_type_id;
    body->op_value_def_producer_function_row =
        fixture->op_value_def_producer_function_row;
    body->op_value_def_place_kind =
        fixture->op_value_def_place_kind;
    body->op_value_def_ownership =
        fixture->op_value_def_ownership;
    body->op_value_def_origin_id =
        fixture->op_value_def_origin_id;
    body->op_value_def_consume_op_index_plus_one =
        fixture->op_value_def_consume_op_index_plus_one;
    body->op_source_value_def_op_id =
        fixture->op_source_value_def_op_id;
    body->slot_kind = fixture->slot_kind;
    body->slot_size = fixture->slot_size;
    body->slot_exact_type_id = fixture->slot_exact_type_id;
    body->slot_place_kind = fixture->slot_place_kind;
    body->slot_origin_id = fixture->slot_origin_id;
    body->slot_managed_storage_kind =
        fixture->slot_managed_storage_kind;
}

static void fixture_init(Fixture *fixture) {
    const int32_t exact_type_id =
        SLOT_OBJECT_REF * 1048576 + 17;
    memset(fixture, 0, sizeof(*fixture));
    fixture_bind(fixture);

    fixture->globals[0].kind = SLOT_OBJECT;
    fixture->globals[1].kind = SLOT_OBJECT;
    fixture->body.producer_function_row = 41;
    fixture->body.op_count = 1;
    fixture->body.op_cap = 2;
    fixture->body.slot_count = 2;
    fixture->body.slot_cap = 2;

    for (int32_t slot = 0; slot < 2; slot++) {
        fixture->slot_kind[slot] = SLOT_OBJECT_REF;
        fixture->slot_size[slot] = 8;
        fixture->slot_exact_type_id[slot] = exact_type_id;
        fixture->slot_place_kind[slot] = COLD_EXPR_PLACE_GLOBAL;
        fixture->slot_origin_id[slot] = 0;
        fixture->slot_managed_storage_kind[slot] =
            COLD_MANAGED_STORAGE_OBJECT;
    }

    fixture->op_kind[0] = BODY_OP_GLOBAL_ADDR;
    fixture->op_dst[0] = 0;
    fixture->op_a[0] = 0;
    fixture->op_value_def_slot[0] = 0;
    fixture->op_value_def_exact_type_id[0] = exact_type_id;
    fixture->op_value_def_producer_function_row[0] = 41;
    fixture->op_value_def_place_kind[0] =
        COLD_EXPR_PLACE_GLOBAL;
    fixture->op_value_def_ownership[0] =
        COLD_EXPR_OWN_BORROW_SHARED;
    fixture->op_value_def_origin_id[0] = 0;
    fixture->op_source_value_def_op_id[0] = -1;

    fixture->local_rows[0].slot = 0;
    fixture->local_rows[0].kind = SLOT_OBJECT_REF;
    fixture->local_rows[0].is_global = true;
    fixture->local_rows[0].global_index = 0;
    fixture->local_rows[0].value_def_op_id = 0;

    fixture->entry.slot = 0;
    fixture->entry.value_def_op_id = 0;
    fixture->entry.consume_op_index_plus_one = 0;
    fixture->backedge.slot = 1;
    fixture->backedge.value_def_op_id = -1;
    fixture->backedge.consume_op_index_plus_one = 0;
}

static bool fixture_join_valid(Fixture *fixture) {
    return cold_exact_same_global_shadow_join_inputs(
        &fixture->parser, &fixture->body,
        &fixture->local_rows[0],
        &fixture->entry, &fixture->backedge);
}

int main(void) {
    Fixture fixture;
    fixture_init(&fixture);

    if (!fixture_join_valid(&fixture)) return 10;
    if (cold_loop_local_needs_exact_phi(
            &fixture.parser, &fixture.body,
            &fixture.locals, 0,
            &fixture.entry, &fixture.backedge)) {
        return 11;
    }

    ColdLocalValueState saved_entry = fixture.entry;
    fixture.entry = fixture.backedge;
    fixture.backedge = saved_entry;
    if (!fixture_join_valid(&fixture)) return 12;
    if (cold_loop_local_needs_exact_phi(
            &fixture.parser, &fixture.body,
            &fixture.locals, 0,
            &fixture.entry, &fixture.backedge)) {
        return 13;
    }

    fixture_init(&fixture);
    fixture.entry.value_def_op_id = -1;
    if (fixture_join_valid(&fixture)) return 14;

    fixture_init(&fixture);
    fixture.backedge.consume_op_index_plus_one = 1;
    if (fixture_join_valid(&fixture)) return 15;

    fixture_init(&fixture);
    fixture.slot_origin_id[1] = 1;
    if (fixture_join_valid(&fixture)) return 16;

    fixture_init(&fixture);
    fixture.slot_exact_type_id[1]++;
    if (fixture_join_valid(&fixture)) return 17;

    fixture_init(&fixture);
    fixture.slot_managed_storage_kind[1] =
        COLD_MANAGED_STORAGE_PLAIN;
    if (fixture_join_valid(&fixture)) return 18;

    fixture_init(&fixture);
    fixture.op_a[0] = 1;
    if (fixture_join_valid(&fixture)) return 19;

    fixture_init(&fixture);
    fixture.op_value_def_ownership[0] =
        COLD_EXPR_OWN_BORROW_UNIQUE;
    if (fixture_join_valid(&fixture)) return 20;

    puts("cold_loop_global_shadow_identity_fixture=passed");
    return 0;
}
