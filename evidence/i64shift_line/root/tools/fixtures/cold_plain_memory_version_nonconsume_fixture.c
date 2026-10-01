#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main
#undef cold_exact_op_consumes_definition

enum {
    FIXTURE_OP_COUNT = 8,
    FIXTURE_SLOT_COUNT = 5,
    FIXTURE_BLOCK_COUNT = 6,
    FIXTURE_TERM_COUNT = 6,
};

typedef struct FixtureBody {
    BodyIR body;
    int32_t op_kind[FIXTURE_OP_COUNT];
    int32_t op_dst[FIXTURE_OP_COUNT];
    int32_t op_a[FIXTURE_OP_COUNT];
    int32_t op_b[FIXTURE_OP_COUNT];
    int32_t op_c[FIXTURE_OP_COUNT];
    int32_t op_block_index[FIXTURE_OP_COUNT];
    int32_t op_value_def_slot[FIXTURE_OP_COUNT];
    int32_t op_value_def_exact_type_id[FIXTURE_OP_COUNT];
    int32_t op_value_def_producer_function_row[FIXTURE_OP_COUNT];
    int32_t op_value_def_place_kind[FIXTURE_OP_COUNT];
    int32_t op_value_def_ownership[FIXTURE_OP_COUNT];
    int32_t op_value_def_origin_id[FIXTURE_OP_COUNT];
    int32_t op_value_def_consume_op_index_plus_one[FIXTURE_OP_COUNT];
    int32_t op_source_value_def_op_id[FIXTURE_OP_COUNT];
    int32_t op_exact_source_dst_value_def_op_id[FIXTURE_OP_COUNT];
    int32_t op_exact_source_a_value_def_op_id[FIXTURE_OP_COUNT];
    int32_t op_exact_source_b_value_def_op_id[FIXTURE_OP_COUNT];
    int32_t op_exact_source_c_value_def_op_id[FIXTURE_OP_COUNT];
    int32_t block_op_start[FIXTURE_BLOCK_COUNT];
    int32_t block_op_count[FIXTURE_BLOCK_COUNT];
    int32_t block_term[FIXTURE_BLOCK_COUNT];
    int32_t term_kind[FIXTURE_TERM_COUNT];
    int32_t term_true_block[FIXTURE_TERM_COUNT];
    int32_t term_false_block[FIXTURE_TERM_COUNT];
    int32_t term_source_value_def_op_id[FIXTURE_TERM_COUNT];
    int32_t term_value[FIXTURE_TERM_COUNT];
    int32_t slot_kind[FIXTURE_SLOT_COUNT];
    int32_t slot_size[FIXTURE_SLOT_COUNT];
    int32_t slot_exact_type_id[FIXTURE_SLOT_COUNT];
    int32_t slot_place_kind[FIXTURE_SLOT_COUNT];
    int32_t slot_origin_id[FIXTURE_SLOT_COUNT];
    int32_t slot_managed_storage_kind[FIXTURE_SLOT_COUNT];
} FixtureBody;

static void fixture_fill_minus_one(int32_t *values, int32_t count) {
    for (int32_t i = 0; i < count; i++) values[i] = -1;
}

static void fixture_bind(FixtureBody *fixture) {
    BodyIR *body = &fixture->body;
    body->op_kind = fixture->op_kind;
    body->op_dst = fixture->op_dst;
    body->op_a = fixture->op_a;
    body->op_b = fixture->op_b;
    body->op_c = fixture->op_c;
    body->op_block_index = fixture->op_block_index;
    body->op_value_def_slot = fixture->op_value_def_slot;
    body->op_value_def_exact_type_id =
        fixture->op_value_def_exact_type_id;
    body->op_value_def_producer_function_row =
        fixture->op_value_def_producer_function_row;
    body->op_value_def_place_kind =
        fixture->op_value_def_place_kind;
    body->op_value_def_ownership = fixture->op_value_def_ownership;
    body->op_value_def_origin_id = fixture->op_value_def_origin_id;
    body->op_value_def_consume_op_index_plus_one =
        fixture->op_value_def_consume_op_index_plus_one;
    body->op_source_value_def_op_id =
        fixture->op_source_value_def_op_id;
    body->op_exact_source_dst_value_def_op_id =
        fixture->op_exact_source_dst_value_def_op_id;
    body->op_exact_source_a_value_def_op_id =
        fixture->op_exact_source_a_value_def_op_id;
    body->op_exact_source_b_value_def_op_id =
        fixture->op_exact_source_b_value_def_op_id;
    body->op_exact_source_c_value_def_op_id =
        fixture->op_exact_source_c_value_def_op_id;
    body->block_op_start = fixture->block_op_start;
    body->block_op_count = fixture->block_op_count;
    body->block_term = fixture->block_term;
    body->term_kind = fixture->term_kind;
    body->term_true_block = fixture->term_true_block;
    body->term_false_block = fixture->term_false_block;
    body->term_source_value_def_op_id =
        fixture->term_source_value_def_op_id;
    body->term_value = fixture->term_value;
    body->slot_kind = fixture->slot_kind;
    body->slot_size = fixture->slot_size;
    body->slot_exact_type_id = fixture->slot_exact_type_id;
    body->slot_place_kind = fixture->slot_place_kind;
    body->slot_origin_id = fixture->slot_origin_id;
    body->slot_managed_storage_kind =
        fixture->slot_managed_storage_kind;
}

static void fixture_init(FixtureBody *fixture) {
    const int32_t type_id = SLOT_OBJECT * 1048576 + 91;
    memset(fixture, 0, sizeof(*fixture));
    fixture_bind(fixture);
    BodyIR *body = &fixture->body;
    body->op_count = FIXTURE_OP_COUNT;
    body->op_cap = FIXTURE_OP_COUNT;
    body->op_block_indexed_op_count = FIXTURE_OP_COUNT;
    body->slot_count = FIXTURE_SLOT_COUNT;
    body->slot_cap = FIXTURE_SLOT_COUNT;
    body->block_count = FIXTURE_BLOCK_COUNT;
    body->block_cap = FIXTURE_BLOCK_COUNT;
    body->term_count = FIXTURE_TERM_COUNT;
    body->term_cap = FIXTURE_TERM_COUNT;
    body->producer_function_row = 37;
    body->cur_open_block = -1;
    body->pending_dominator_edge_from = -1;
    body->pending_dominator_edge_to = -1;

    fixture_fill_minus_one(fixture->op_dst, FIXTURE_OP_COUNT);
    fixture_fill_minus_one(fixture->op_a, FIXTURE_OP_COUNT);
    fixture_fill_minus_one(fixture->op_b, FIXTURE_OP_COUNT);
    fixture_fill_minus_one(fixture->op_c, FIXTURE_OP_COUNT);
    fixture_fill_minus_one(
        fixture->op_value_def_slot, FIXTURE_OP_COUNT);
    fixture_fill_minus_one(
        fixture->op_value_def_exact_type_id, FIXTURE_OP_COUNT);
    fixture_fill_minus_one(
        fixture->op_value_def_producer_function_row,
        FIXTURE_OP_COUNT);
    fixture_fill_minus_one(
        fixture->op_value_def_origin_id, FIXTURE_OP_COUNT);
    fixture_fill_minus_one(
        fixture->op_source_value_def_op_id, FIXTURE_OP_COUNT);
    fixture_fill_minus_one(
        fixture->op_exact_source_dst_value_def_op_id,
        FIXTURE_OP_COUNT);
    fixture_fill_minus_one(
        fixture->op_exact_source_a_value_def_op_id,
        FIXTURE_OP_COUNT);
    fixture_fill_minus_one(
        fixture->op_exact_source_b_value_def_op_id,
        FIXTURE_OP_COUNT);
    fixture_fill_minus_one(
        fixture->op_exact_source_c_value_def_op_id,
        FIXTURE_OP_COUNT);
    fixture_fill_minus_one(
        fixture->term_true_block, FIXTURE_TERM_COUNT);
    fixture_fill_minus_one(
        fixture->term_false_block, FIXTURE_TERM_COUNT);
    fixture_fill_minus_one(
        fixture->term_source_value_def_op_id,
        FIXTURE_TERM_COUNT);
    fixture_fill_minus_one(
        fixture->term_value, FIXTURE_TERM_COUNT);
    fixture_fill_minus_one(
        fixture->slot_exact_type_id, FIXTURE_SLOT_COUNT);
    fixture_fill_minus_one(
        fixture->slot_origin_id, FIXTURE_SLOT_COUNT);

    body->slot_kind[0] = SLOT_OBJECT;
    body->slot_size[0] = 648;
    body->slot_exact_type_id[0] = type_id;
    body->slot_place_kind[0] = COLD_EXPR_PLACE_CFG_MERGE;
    body->slot_origin_id[0] = 7;
    body->slot_managed_storage_kind[0] = COLD_MANAGED_STORAGE_PLAIN;
    body->slot_kind[1] = SLOT_OBJECT;
    body->slot_size[1] = 648;
    body->slot_exact_type_id[1] = type_id;
    body->slot_place_kind[1] = COLD_EXPR_PLACE_STACK_LOCAL;
    body->slot_origin_id[1] = 1;
    body->slot_managed_storage_kind[1] = COLD_MANAGED_STORAGE_PLAIN;
    body->slot_kind[2] = SLOT_OBJECT_REF;
    body->slot_size[2] = 8;
    body->slot_kind[3] = SLOT_I32;
    body->slot_size[3] = 4;
    body->slot_kind[4] = SLOT_I32;
    body->slot_size[4] = 4;

    /* Entry value and its independent phi ingress copy. */
    body->op_kind[0] = BODY_OP_COPY_COMPOSITE;
    body->op_dst[0] = 0;
    body->op_a[0] = 0;
    body->op_b[0] = 0;
    body->op_c[0] = 0;
    body->op_value_def_slot[0] = 0;
    body->op_value_def_exact_type_id[0] = type_id;
    body->op_value_def_producer_function_row[0] = 37;
    body->op_value_def_place_kind[0] = COLD_EXPR_PLACE_STACK_LOCAL;
    body->op_value_def_ownership[0] = COLD_EXPR_OWN_PLAIN;
    body->op_value_def_origin_id[0] = 0;

    body->op_kind[1] = BODY_OP_COPY_COMPOSITE;
    body->op_dst[1] = 1;
    body->op_a[1] = 0;
    body->op_b[1] = 0;
    body->op_c[1] = 0;
    body->op_value_def_slot[1] = 1;
    body->op_value_def_exact_type_id[1] = type_id;
    body->op_value_def_producer_function_row[1] = 37;
    body->op_value_def_place_kind[1] = COLD_EXPR_PLACE_STACK_LOCAL;
    body->op_value_def_ownership[1] = COLD_EXPR_OWN_PLAIN;
    body->op_value_def_origin_id[1] = 1;
    body->op_value_def_consume_op_index_plus_one[1] = 8;
    body->op_source_value_def_op_id[1] = 0;
    body->op_exact_source_a_value_def_op_id[1] = 0;

    /* Body: exact field projection, scalar store, new PLAIN version. */
    body->op_kind[2] = BODY_OP_FIELD_REF;
    body->op_dst[2] = 2;
    body->op_a[2] = 0;
    body->op_b[2] = 0;
    body->op_c[2] = 0;
    body->op_source_value_def_op_id[2] = 7;

    body->op_kind[3] = BODY_OP_ARRAY_I32_INDEX_STORE;
    body->op_dst[3] = 3;
    body->op_a[3] = 2;
    body->op_b[3] = 4;
    body->op_c[3] = 0;

    body->op_kind[4] = BODY_OP_NOP;
    body->op_dst[4] = 0;
    body->op_a[4] = 3;
    body->op_b[4] = 2;
    body->op_c[4] = 0;
    body->op_value_def_slot[4] = 0;
    body->op_value_def_exact_type_id[4] = type_id;
    body->op_value_def_producer_function_row[4] = 37;
    body->op_value_def_place_kind[4] = COLD_EXPR_PLACE_MEMORY_VERSION;
    body->op_value_def_ownership[4] = COLD_EXPR_OWN_PLAIN;
    body->op_value_def_origin_id[4] = 7;
    body->op_source_value_def_op_id[4] = 7;

    body->op_kind[5] = BODY_OP_COPY_COMPOSITE;
    body->op_dst[5] = 1;
    body->op_a[5] = 0;
    body->op_b[5] = 0;
    body->op_c[5] = 0;
    body->op_value_def_slot[5] = 1;
    body->op_value_def_exact_type_id[5] = type_id;
    body->op_value_def_producer_function_row[5] = 37;
    body->op_value_def_place_kind[5] = COLD_EXPR_PLACE_STACK_LOCAL;
    body->op_value_def_ownership[5] = COLD_EXPR_OWN_PLAIN;
    body->op_value_def_origin_id[5] = 1;
    body->op_value_def_consume_op_index_plus_one[5] = 8;
    body->op_source_value_def_op_id[5] = 4;
    body->op_exact_source_a_value_def_op_id[5] = 4;

    /* Exit probe row has no semantic authority. */
    body->op_kind[6] = BODY_OP_NOP;

    body->op_kind[7] = BODY_OP_COPY_COMPOSITE;
    body->op_dst[7] = 0;
    body->op_a[7] = 1;
    body->op_b[7] = 5;
    body->op_c[7] = 0;
    body->op_value_def_slot[7] = 0;
    body->op_value_def_exact_type_id[7] = type_id;
    body->op_value_def_producer_function_row[7] = 37;
    body->op_value_def_place_kind[7] = COLD_EXPR_PLACE_CFG_MERGE;
    body->op_value_def_ownership[7] = COLD_EXPR_OWN_PLAIN;
    body->op_value_def_origin_id[7] = 7;
    body->op_source_value_def_op_id[7] = 1;
    body->op_exact_source_a_value_def_op_id[7] = 7;

    const int32_t starts[FIXTURE_BLOCK_COUNT] = {0, 7, 2, 2, 5, 6};
    const int32_t counts[FIXTURE_BLOCK_COUNT] = {2, 1, 0, 3, 1, 1};
    for (int32_t block = 0; block < FIXTURE_BLOCK_COUNT; block++) {
        body->block_op_start[block] = starts[block];
        body->block_op_count[block] = counts[block];
        body->block_term[block] = block;
    }
    body->op_block_index[0] = 0;
    body->op_block_index[1] = 0;
    body->op_block_index[2] = 3;
    body->op_block_index[3] = 3;
    body->op_block_index[4] = 3;
    body->op_block_index[5] = 4;
    body->op_block_index[6] = 5;
    body->op_block_index[7] = 1;

    body->term_kind[0] = BODY_TERM_BR;
    body->term_true_block[0] = 1;
    body->term_kind[1] = BODY_TERM_BR;
    body->term_true_block[1] = 2;
    body->term_kind[2] = BODY_TERM_CBR;
    body->term_true_block[2] = 3;
    body->term_false_block[2] = 5;
    body->term_kind[3] = BODY_TERM_BR;
    body->term_true_block[3] = 4;
    body->term_kind[4] = BODY_TERM_BR;
    body->term_true_block[4] = 1;
    body->term_kind[5] = BODY_TERM_RET;
}

static void fixture_release(FixtureBody *fixture) {
    cold_dominator_cache_release(fixture->body.dominators_cache);
    fixture->body.dominators_cache = 0;
}

int main(void) {
    FixtureBody positive;
    fixture_init(&positive);
    if (!cold_exact_plain_memory_version_source_read(
            &positive.body, 7, 4)) return 10;
    if (cold_exact_op_consumes_definition(
            &positive.body, 7, 4)) return 11;
    if (!cold_exact_plain_merge_reentry_authority_valid(
            &positive.body, 7)) return 12;
    if (!cold_exact_definition_consumption_dataflow_valid(
            &positive.body, 7)) return 13;
    if (!cold_exact_definition_is_live_before_op(
            &positive.body, 7, 6)) return 14;
    fixture_release(&positive);

    FixtureBody move;
    fixture_init(&move);
    move.body.op_value_def_ownership[7] = COLD_EXPR_OWN_MOVE;
    move.body.op_value_def_ownership[4] = COLD_EXPR_OWN_MOVE;
    if (cold_exact_plain_memory_version_source_read(
            &move.body, 7, 4)) return 20;
    if (!cold_exact_op_consumes_definition(
            &move.body, 7, 4)) return 21;
    if (cold_exact_plain_merge_reentry_authority_valid(
            &move.body, 7)) return 22;
    fixture_release(&move);

    FixtureBody wrong_type;
    fixture_init(&wrong_type);
    wrong_type.body.op_value_def_exact_type_id[4]++;
    if (cold_exact_plain_memory_version_source_read(
            &wrong_type.body, 7, 4)) return 30;
    fixture_release(&wrong_type);

    FixtureBody wrong_projection;
    fixture_init(&wrong_projection);
    wrong_projection.body.op_source_value_def_op_id[2] = 0;
    if (cold_exact_plain_memory_version_source_read(
            &wrong_projection.body, 7, 4)) return 40;
    fixture_release(&wrong_projection);

    FixtureBody wrong_storage;
    fixture_init(&wrong_storage);
    wrong_storage.body.slot_managed_storage_kind[0] =
        COLD_MANAGED_STORAGE_OBJECT;
    if (cold_exact_plain_memory_version_source_read(
            &wrong_storage.body, 7, 4)) return 50;
    fixture_release(&wrong_storage);

    FixtureBody missing_backedge;
    fixture_init(&missing_backedge);
    missing_backedge.body.op_source_value_def_op_id[5] = 0;
    missing_backedge.body.op_exact_source_a_value_def_op_id[5] = 0;
    if (cold_exact_plain_merge_reentry_authority_valid(
            &missing_backedge.body, 7)) return 60;
    fixture_release(&missing_backedge);

    FixtureBody wrong_ingress_consume;
    fixture_init(&wrong_ingress_consume);
    wrong_ingress_consume.body
        .op_value_def_consume_op_index_plus_one[5] = 0;
    if (cold_exact_plain_merge_reentry_authority_valid(
            &wrong_ingress_consume.body, 7)) return 70;
    fixture_release(&wrong_ingress_consume);

    puts("cold_plain_memory_version_nonconsume_fixture=passed");
    return 0;
}
