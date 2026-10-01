#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main

typedef struct FixtureBody {
    BodyIR body;
    int32_t op_kind[3];
    int32_t op_dst[3];
    int32_t op_a[3];
    int32_t op_b[3];
    int32_t op_c[3];
    int32_t op_block_index[3];
    int32_t op_value_def_slot[3];
    int32_t op_value_def_exact_type_id[3];
    int32_t op_value_def_producer_function_row[3];
    int32_t op_value_def_place_kind[3];
    int32_t op_value_def_ownership[3];
    int32_t op_value_def_origin_id[3];
    int32_t op_source_value_def_op_id[3];
    int32_t block_op_start[3];
    int32_t block_op_count[3];
    int32_t block_term[3];
    int32_t term_kind[3];
    int32_t term_true_block[3];
    int32_t term_false_block[3];
    int32_t slot_kind[2];
    int32_t slot_size[2];
    int32_t slot_managed_storage_kind[2];
} FixtureBody;

static void fixture_bind_arrays(FixtureBody *fixture) {
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
    body->op_value_def_ownership =
        fixture->op_value_def_ownership;
    body->op_value_def_origin_id =
        fixture->op_value_def_origin_id;
    body->op_source_value_def_op_id =
        fixture->op_source_value_def_op_id;
    body->block_op_start = fixture->block_op_start;
    body->block_op_count = fixture->block_op_count;
    body->block_term = fixture->block_term;
    body->term_kind = fixture->term_kind;
    body->term_true_block = fixture->term_true_block;
    body->term_false_block = fixture->term_false_block;
    body->slot_kind = fixture->slot_kind;
    body->slot_size = fixture->slot_size;
    body->slot_managed_storage_kind =
        fixture->slot_managed_storage_kind;
}

static void fixture_init_tuple(FixtureBody *fixture) {
    const int32_t object_type_id = SLOT_OBJECT * 1048576 + 1;
    memset(fixture, 0, sizeof(*fixture));
    fixture_bind_arrays(fixture);
    BodyIR *body = &fixture->body;
    body->op_count = 3;
    body->op_cap = 3;
    body->op_block_indexed_op_count = 3;
    body->slot_count = 2;
    body->slot_cap = 2;
    body->cur_open_block = -1;
    body->pending_dominator_edge_from = -1;
    body->pending_dominator_edge_to = -1;

    body->slot_kind[0] = SLOT_OBJECT;
    body->slot_kind[1] = SLOT_OBJECT;
    body->slot_size[0] = 648;
    body->slot_size[1] = 648;
    body->slot_managed_storage_kind[0] =
        COLD_MANAGED_STORAGE_PLAIN;
    body->slot_managed_storage_kind[1] =
        COLD_MANAGED_STORAGE_PLAIN;

    body->op_kind[1] = BODY_OP_COPY_COMPOSITE;
    body->op_dst[1] = 1;
    body->op_a[1] = 0;
    body->op_value_def_slot[1] = 1;
    body->op_value_def_exact_type_id[1] = object_type_id;
    body->op_value_def_producer_function_row[1] = 7;
    body->op_value_def_place_kind[1] =
        COLD_EXPR_PLACE_STACK_LOCAL;
    body->op_value_def_ownership[1] = COLD_EXPR_OWN_PLAIN;
    body->op_value_def_origin_id[1] = 1;
    body->op_source_value_def_op_id[1] = 2;

    body->op_value_def_slot[2] = 0;
    body->op_value_def_exact_type_id[2] = object_type_id;
    body->op_value_def_producer_function_row[2] = 7;
    body->op_value_def_place_kind[2] =
        COLD_EXPR_PLACE_CFG_MERGE;
    body->op_value_def_ownership[2] = COLD_EXPR_OWN_PLAIN;
    body->op_value_def_origin_id[2] = 2;
}

static void fixture_init_dominating(FixtureBody *fixture) {
    fixture_init_tuple(fixture);
    BodyIR *body = &fixture->body;
    body->block_count = 2;
    body->block_cap = 2;
    body->term_count = 2;
    body->term_cap = 2;
    /* The entry merge is emitted as physical row 2, after the row-1 copy it
       dominates.  Exact block identities, not row order, prove the read. */
    body->op_block_index[0] = 1;
    body->op_block_index[1] = 1;
    body->op_block_index[2] = 0;
    body->block_op_start[0] = 2;
    body->block_op_count[0] = 1;
    body->block_term[0] = 0;
    body->block_op_start[1] = 0;
    body->block_op_count[1] = 2;
    body->block_term[1] = 1;
    body->term_kind[0] = BODY_TERM_BR;
    body->term_true_block[0] = 1;
    body->term_false_block[0] = -1;
    body->term_kind[1] = BODY_TERM_RET;
    body->term_true_block[1] = -1;
    body->term_false_block[1] = -1;
}

static void fixture_init_sibling(FixtureBody *fixture) {
    fixture_init_tuple(fixture);
    BodyIR *body = &fixture->body;
    body->block_count = 3;
    body->block_cap = 3;
    body->term_count = 3;
    body->term_cap = 3;
    body->op_block_index[0] = 0;
    body->op_block_index[1] = 2;
    body->op_block_index[2] = 1;
    body->block_op_start[0] = 0;
    body->block_op_count[0] = 1;
    body->block_term[0] = 0;
    body->block_op_start[1] = 2;
    body->block_op_count[1] = 1;
    body->block_term[1] = 1;
    body->block_op_start[2] = 1;
    body->block_op_count[2] = 1;
    body->block_term[2] = 2;
    body->term_kind[0] = BODY_TERM_CBR;
    body->term_true_block[0] = 1;
    body->term_false_block[0] = 2;
    body->term_kind[1] = BODY_TERM_RET;
    body->term_true_block[1] = -1;
    body->term_false_block[1] = -1;
    body->term_kind[2] = BODY_TERM_RET;
    body->term_true_block[2] = -1;
    body->term_false_block[2] = -1;
}

int main(void) {
    FixtureBody dominating;
    FixtureBody sibling;
    fixture_init_dominating(&dominating);
    fixture_init_sibling(&sibling);

    if (!cold_exact_plain_copy_tuple_valid(
            &dominating.body, 2, 1)) {
        return 10;
    }
    dominating.body.op_value_def_place_kind[2] =
        COLD_EXPR_PLACE_MEMORY_VERSION;
    if (!cold_exact_plain_copy_tuple_valid(
            &dominating.body, 2, 1)) {
        return 11;
    }
    dominating.body.op_value_def_place_kind[2] =
        COLD_EXPR_PLACE_STACK_LOCAL;
    if (cold_exact_plain_copy_tuple_valid(
            &dominating.body, 2, 1)) {
        return 12;
    }
    dominating.body.op_value_def_place_kind[2] =
        COLD_EXPR_PLACE_CFG_MERGE;
    dominating.body.op_value_def_exact_type_id[2]++;
    if (cold_exact_plain_copy_tuple_valid(
            &dominating.body, 2, 1)) {
        return 13;
    }
    if (cold_exact_plain_copy_tuple_valid(
            &sibling.body, 2, 1)) {
        return 14;
    }

    cold_dominator_cache_release(dominating.body.dominators_cache);
    cold_dominator_cache_release(sibling.body.dominators_cache);
    puts("cold_plain_cfg_merge_copy_fixture=passed");
    return 0;
}
