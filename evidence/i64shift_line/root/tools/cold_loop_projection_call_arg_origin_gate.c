#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

typedef struct LoopCallArgFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation compilation;
    BodyIR *body;
    FnDef *callee;
    int32_t caller_row;
    int32_t callee_row;
    int32_t entry_block;
    int32_t loop_block;
    int32_t exit_block;
    int32_t dead_block;
    int32_t value_slot;
    int32_t projection_slot;
    int32_t carrier_slot;
    int32_t pre_carrier_slot;
    int32_t entry_def;
    int32_t projection_def;
    int32_t decoy_projection_def;
    int32_t merge_def;
    int32_t carrier_op;
    int32_t pre_carrier_op;
    int32_t call_op;
    int32_t pre_call_op;
    int32_t call_arg_start;
    int32_t call_arg_row;
    int32_t loop_op_start;
    int32_t loop_op_end;
    int32_t pre_arg_def;
    int32_t pre_arg_place;
    int32_t pre_arg_ownership;
    int32_t pre_arg_origin;
} LoopCallArgFixture;

static void gate_fail(const char *message) {
    fprintf(
        stderr,
        "cold_loop_projection_call_arg_origin_gate: %s\n",
        message);
    exit(1);
}

static void gate_publish_definition(
        BodyIR *body, int32_t definition, int32_t slot,
        int32_t exact_type, int32_t producer,
        int32_t place, int32_t ownership, int32_t origin) {
    body->op_value_def_slot[definition] = slot;
    body->op_value_def_exact_type_id[definition] = exact_type;
    body->op_value_def_producer_function_row[definition] = producer;
    body->op_value_def_place_kind[definition] = place;
    body->op_value_def_ownership[definition] = ownership;
    body->op_value_def_origin_id[definition] = origin;
}

static void gate_bind_call_arg(
        BodyIR *body, int32_t row, int32_t definition) {
    body->call_arg_value_def_op_id[row] = definition;
    body->call_arg_place_kind[row] =
        body->op_value_def_place_kind[definition];
    body->call_arg_ownership[row] =
        body->op_value_def_ownership[definition];
    body->call_arg_origin_id[row] =
        body->op_value_def_origin_id[definition];
}

static bool *gate_entry_reachability(const BodyIR *body) {
    if (!body || body->block_count <= 0) return 0;
    bool *reachable = calloc(
        (size_t)body->block_count, sizeof(bool));
    int32_t *queue = malloc(
        (size_t)body->block_count * sizeof(int32_t));
    if (!reachable || !queue) {
        free(reachable);
        free(queue);
        return 0;
    }
    int32_t read = 0;
    int32_t write = 0;
    reachable[0] = true;
    queue[write++] = 0;
    while (read < write) {
        int32_t block = queue[read++];
        int32_t term = body->block_term[block];
        if (term < 0 || term >= body->term_count) {
            free(reachable);
            free(queue);
            return 0;
        }
        int32_t targets[2] = {-1, -1};
        int32_t count = 0;
        if (body->term_kind[term] == BODY_TERM_BR) {
            targets[count++] = body->term_true_block[term];
        } else if (body->term_kind[term] == BODY_TERM_CBR) {
            targets[count++] = body->term_true_block[term];
            targets[count++] = body->term_false_block[term];
        } else if (body->term_kind[term] != BODY_TERM_RET &&
                   body->term_kind[term] != BODY_TERM_UNREACHABLE) {
            free(reachable);
            free(queue);
            return 0;
        }
        for (int32_t edge = 0; edge < count; edge++) {
            int32_t target = targets[edge];
            if (target < 0 || target >= body->block_count) {
                free(reachable);
                free(queue);
                return 0;
            }
            if (!reachable[target]) {
                reachable[target] = true;
                queue[write++] = target;
            }
        }
    }
    free(queue);
    return reachable;
}

static void gate_fixture_init(LoopCallArgFixture *fixture) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (fixture->arena == MAP_FAILED)
        gate_fail("fixture arena allocation failed");
    memset(fixture->arena, 0, sizeof(Arena));
    cold_harness_compilation_begin(
        &fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation.symbols;
    ObjectDef *map = symbols_add_object(
        fixture->symbols, cold_cstr_span("LoopCallArgMap"), 1);
    if (!map) gate_fail("map object registration failed");
    map->fields[0].name = cold_cstr_span("key");
    map->fields[0].kind = SLOT_STR;
    map->fields[0].size = COLD_STR_SLOT_SIZE;
    map->fields[0].type_name = cold_cstr_span("str");
    object_finalize_fields(map);

    int32_t formal_kind = SLOT_OBJECT_REF;
    int32_t formal_size = 8;
    Span formal_type = cold_cstr_span("var LoopCallArgMap");
    fixture->callee_row = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("LoopCallArgMutate"),
        1, &formal_kind, &formal_size, &formal_type,
        cold_cstr_span("bool"));
    fixture->caller_row = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("LoopCallArgCaller"),
        0, 0, 0, 0, cold_cstr_span(""));
    if (fixture->callee_row < 0 || fixture->caller_row < 0)
        gate_fail("function registration failed");
    symbols_set_fn_param_types(
        fixture->symbols, fixture->callee_row,
        &formal_type, 1);
    cold_publish_exact_formal_type_ids(
        fixture->symbols, fixture->callee_row);
    fixture->callee =
        &fixture->symbols->functions[fixture->callee_row];

    BodyIR *body = body_new(fixture->arena);
    fixture->body = body;
    body->producer_function_row = fixture->caller_row;
    body->debug_name =
        cold_cstr_span("loop_projection_call_arg_origin");
    fixture->entry_block = body_block(body);
    fixture->loop_block = body_block(body);
    fixture->exit_block = body_block(body);
    fixture->dead_block = body_block(body);

    int32_t exact_value_type =
        SLOT_OBJECT * 1048576 + 1;
    fixture->value_slot = body_slot(
        body, SLOT_OBJECT, map->slot_size);
    body_slot_set_type(body, fixture->value_slot, map->name);
    body->slot_exact_type_id[fixture->value_slot] =
        exact_value_type;
    body->slot_place_kind[fixture->value_slot] =
        COLD_EXPR_PLACE_STACK_LOCAL;
    body->slot_origin_id[fixture->value_slot] =
        fixture->value_slot;
    body->slot_managed_storage_kind[fixture->value_slot] =
        COLD_MANAGED_STORAGE_OBJECT;
    fixture->projection_slot = body_slot(
        body, SLOT_OBJECT, map->slot_size);
    body_slot_set_type(
        body, fixture->projection_slot, map->name);
    body->slot_exact_type_id[fixture->projection_slot] =
        exact_value_type;
    body->slot_place_kind[fixture->projection_slot] =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->slot_managed_storage_kind[fixture->projection_slot] =
        COLD_MANAGED_STORAGE_OBJECT;
    fixture->carrier_slot =
        body_slot(body, SLOT_OBJECT_REF, 8);
    body_slot_set_type(
        body, fixture->carrier_slot, map->name);
    fixture->pre_carrier_slot =
        body_slot(body, SLOT_OBJECT_REF, 8);
    body_slot_set_type(
        body, fixture->pre_carrier_slot, map->name);
    int32_t predicate = body_slot(body, SLOT_I32, 4);
    int32_t zero = body_slot(body, SLOT_I32, 4);
    int32_t call_result = body_slot(body, SLOT_I32, 4);
    int32_t pre_call_result = body_slot(body, SLOT_I32, 4);

    fixture->entry_def = body_op(
        body, BODY_OP_NOP, fixture->value_slot, 0, 0);
    gate_publish_definition(
        body, fixture->entry_def, fixture->value_slot,
        exact_value_type, fixture->caller_row,
        COLD_EXPR_PLACE_STACK_LOCAL, COLD_EXPR_OWN_PLAIN,
        fixture->value_slot);
    fixture->pre_carrier_op = body_op(
        body, BODY_OP_LOCAL_ADDR,
        fixture->pre_carrier_slot, fixture->value_slot, 0);
    int32_t pre_arg =
        body_call_arg(body, fixture->pre_carrier_slot);
    gate_bind_call_arg(body, pre_arg, fixture->entry_def);
    fixture->pre_call_op = body_op3(
        body, BODY_OP_CALL_COMPOSITE,
        pre_call_result, fixture->callee_row, pre_arg, 1);
    fixture->pre_arg_def =
        body->call_arg_value_def_op_id[pre_arg];
    fixture->pre_arg_place =
        body->call_arg_place_kind[pre_arg];
    fixture->pre_arg_ownership =
        body->call_arg_ownership[pre_arg];
    fixture->pre_arg_origin =
        body->call_arg_origin_id[pre_arg];
    body_op(body, BODY_OP_I32_CONST, predicate, 1, 0);
    body_op(body, BODY_OP_I32_CONST, zero, 0, 0);
    int32_t entry_term = body_term(
        body, BODY_TERM_BR, -1, 0, 0,
        fixture->loop_block, -1);
    body_end_block(body, fixture->entry_block, entry_term);

    body_reopen_block(body, fixture->loop_block);
    fixture->loop_op_start = body->op_count;
    fixture->projection_def = body_op(
        body, BODY_OP_COPY_COMPOSITE,
        fixture->projection_slot, fixture->value_slot, 0);
    fixture->decoy_projection_def = body_op(
        body, BODY_OP_COPY_COMPOSITE,
        fixture->projection_slot, fixture->value_slot, 0);
    fixture->carrier_op = body_op(
        body, BODY_OP_LOCAL_ADDR,
        fixture->carrier_slot, fixture->projection_slot, 0);
    fixture->call_arg_start = body->call_arg_count;
    fixture->call_arg_row =
        body_call_arg(body, fixture->carrier_slot);
    fixture->call_op = body_op3(
        body, BODY_OP_CALL_COMPOSITE,
        call_result, fixture->callee_row,
        fixture->call_arg_row, 1);
    fixture->loop_op_end = body->op_count;
    int32_t loop_term = body_term(
        body, BODY_TERM_CBR, predicate, COND_NE, zero,
        fixture->loop_block, fixture->exit_block);
    body_end_block(body, fixture->loop_block, loop_term);

    body_reopen_block(body, fixture->exit_block);
    fixture->merge_def = body_op(
        body, BODY_OP_NOP, fixture->value_slot,
        fixture->entry_def, fixture->projection_def);
    gate_publish_definition(
        body, fixture->merge_def, fixture->value_slot,
        exact_value_type, fixture->caller_row,
        COLD_EXPR_PLACE_CFG_MERGE, COLD_EXPR_OWN_PLAIN,
        fixture->merge_def);
    gate_publish_definition(
        body, fixture->projection_def,
        fixture->projection_slot, exact_value_type,
        fixture->caller_row,
        COLD_EXPR_PLACE_BORROW_PROJECTION,
        COLD_EXPR_OWN_BORROW_UNIQUE,
        fixture->merge_def);
    gate_publish_definition(
        body, fixture->decoy_projection_def,
        fixture->projection_slot, exact_value_type,
        fixture->caller_row,
        COLD_EXPR_PLACE_BORROW_PROJECTION,
        COLD_EXPR_OWN_BORROW_UNIQUE,
        fixture->merge_def);
    body->slot_origin_id[fixture->projection_slot] =
        fixture->merge_def;
    gate_bind_call_arg(
        body, fixture->call_arg_row,
        fixture->projection_def);
    int32_t exit_term = body_term(
        body, BODY_TERM_RET, -1, 0, 0, -1, -1);
    body_end_block(body, fixture->exit_block, exit_term);

    body_reopen_block(body, fixture->dead_block);
    int32_t dead_term = body_term(
        body, BODY_TERM_UNREACHABLE,
        -1, 0, 0, -1, -1);
    body_end_block(body, fixture->dead_block, dead_term);
}

static bool gate_contract_valid(
        const LoopCallArgFixture *fixture) {
    const BodyIR *body = fixture->body;
    int32_t row = fixture->call_arg_row;
    int32_t owner = -1;
    int32_t function = -1;
    int32_t formal = -1;
    if (!body || !fixture->symbols ||
        fixture->call_arg_start != 1 ||
        row < fixture->call_arg_start ||
        row >= body->call_arg_count ||
        fixture->projection_def < fixture->loop_op_start ||
        fixture->projection_def >= fixture->loop_op_end ||
        fixture->projection_def >= fixture->call_op ||
        fixture->call_op < fixture->loop_op_start ||
        fixture->call_op >= fixture->loop_op_end ||
        body->call_arg_value_def_op_id[row] !=
            fixture->projection_def ||
        body->call_arg_place_kind[row] !=
            body->op_value_def_place_kind[
                fixture->projection_def] ||
        body->call_arg_ownership[row] !=
            body->op_value_def_ownership[
                fixture->projection_def] ||
        body->call_arg_origin_id[row] !=
            body->op_value_def_origin_id[
                fixture->projection_def] ||
        body->op_value_def_place_kind[
            fixture->projection_def] !=
            COLD_EXPR_PLACE_BORROW_PROJECTION ||
        body->op_value_def_ownership[
            fixture->projection_def] !=
            COLD_EXPR_OWN_BORROW_UNIQUE ||
        body->op_value_def_origin_id[
            fixture->projection_def] !=
            fixture->merge_def ||
        body->op_value_def_exact_type_id[
            fixture->projection_def] < 0 ||
        body->op_value_def_producer_function_row[
            fixture->projection_def] !=
            body->producer_function_row ||
        body->call_arg_slot[row] != fixture->carrier_slot ||
        body->call_arg_offset[row] != 0 ||
        body->call_arg_value_def_op_id[0] !=
            fixture->pre_arg_def ||
        body->call_arg_place_kind[0] !=
            fixture->pre_arg_place ||
        body->call_arg_ownership[0] !=
            fixture->pre_arg_ownership ||
        body->call_arg_origin_id[0] !=
            fixture->pre_arg_origin ||
        fixture->decoy_projection_def ==
            fixture->projection_def ||
        !cold_exact_call_arg_owner_and_formal(
            body, fixture->symbols, row,
            &owner, &function, &formal) ||
        owner != fixture->call_op ||
        function != fixture->callee_row ||
        formal != 0 ||
        fixture->callee->arity != 1 ||
        fixture->callee->param_exact_type_id[0] < 0 ||
        !cold_exact_var_formal_value_type_ids_same(
            fixture->symbols,
            fixture->callee->param_exact_type_id[0],
            fixture->callee->param_kind[0],
            body->op_value_def_exact_type_id[
                fixture->projection_def],
            body->slot_kind[
                body->op_value_def_slot[
                    fixture->projection_def]])) {
        return false;
    }
    int32_t carrier_count = 0;
    int32_t carrier = -1;
    int32_t source_slot =
        body->op_value_def_slot[fixture->projection_def];
    for (int32_t op = fixture->projection_def + 1;
         op < owner; op++) {
        if (body->op_kind[op] == BODY_OP_LOCAL_ADDR &&
            body->op_dst[op] == fixture->carrier_slot &&
            body->op_a[op] == source_slot &&
            body->op_b[op] == 0 &&
            body->op_c[op] == 0) {
            carrier = op;
            carrier_count++;
        }
    }
    if (carrier_count != 1 ||
        carrier != fixture->carrier_op ||
        cold_block_index_for_op(
            (BodyIR *)body, carrier) !=
            cold_block_index_for_op(
                (BodyIR *)body, owner)) {
        return false;
    }
    bool *reachable = gate_entry_reachability(body);
    int32_t owner_block =
        cold_block_index_for_op((BodyIR *)body, owner);
    bool valid =
        reachable &&
        owner_block >= 0 &&
        owner_block < body->block_count &&
        reachable[owner_block];
    free(reachable);
    return valid;
}

static void gate_mutate(
        LoopCallArgFixture *fixture, const char *mode) {
    BodyIR *body = fixture->body;
    int32_t row = fixture->call_arg_row;
    if (strcmp(mode, "call-arg-def") == 0) {
        body->call_arg_value_def_op_id[row] =
            fixture->merge_def;
    } else if (strcmp(mode, "call-arg-place") == 0) {
        body->call_arg_place_kind[row] =
            COLD_EXPR_PLACE_STACK_LOCAL;
    } else if (strcmp(mode, "call-arg-ownership") == 0) {
        body->call_arg_ownership[row] =
            COLD_EXPR_OWN_BORROW_SHARED;
    } else if (strcmp(mode, "call-arg-origin") == 0) {
        body->call_arg_origin_id[row] =
            fixture->entry_def;
    } else if (strcmp(mode, "value-def-origin") == 0) {
        body->op_value_def_origin_id[
            fixture->projection_def] =
            fixture->entry_def;
    } else if (strcmp(mode, "value-type") == 0) {
        body->op_value_def_exact_type_id[
            fixture->projection_def]++;
    } else if (strcmp(mode, "value-producer") == 0) {
        body->op_value_def_producer_function_row[
            fixture->projection_def]++;
    } else if (strcmp(mode, "carrier-kind") == 0) {
        body->op_kind[fixture->carrier_op] =
            BODY_OP_COPY_I64;
    } else if (strcmp(mode, "carrier-slot") == 0) {
        body->op_dst[fixture->carrier_op] =
            fixture->pre_carrier_slot;
    } else if (strcmp(mode, "carrier-source") == 0) {
        body->op_a[fixture->carrier_op] =
            fixture->value_slot;
    } else if (strcmp(mode, "carrier-block") == 0) {
        fixture->carrier_op = fixture->pre_carrier_op;
    } else if (strcmp(mode, "callee-target") == 0) {
        body->op_a[fixture->call_op] =
            fixture->caller_row;
    } else if (strcmp(mode, "formal-identity") == 0) {
        fixture->callee->arity = 0;
    } else if (strcmp(mode, "owner-range") == 0) {
        fixture->loop_op_end = fixture->call_op;
    } else if (strcmp(mode, "owner-unreachable") == 0) {
        int32_t term =
            body->block_term[fixture->entry_block];
        body->term_true_block[term] =
            fixture->dead_block;
    } else if (strcmp(mode, "definition-after-owner") == 0) {
        fixture->projection_def = fixture->merge_def;
        gate_bind_call_arg(body, row, fixture->merge_def);
    } else if (strcmp(mode, "same-slot-projection") == 0) {
        gate_bind_call_arg(
            body, row, fixture->decoy_projection_def);
    } else if (strcmp(mode, "pre-start-row") == 0) {
        body->call_arg_origin_id[0]++;
    } else if (strcmp(mode, "duplicate-owner") == 0) {
        body_op3(
            body, BODY_OP_CALL_COMPOSITE, -1,
            fixture->callee_row, row, 1);
    } else {
        gate_fail("unknown mutation");
    }
}

static int32_t gate_emit_owned_string(
        BodyIR *body, const char *text) {
    int32_t slot =
        body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    body_slot_set_type(body, slot, cold_cstr_span("str"));
    int32_t literal =
        body_string_literal(body, cold_cstr_span(text));
    int32_t definition =
        body_op(body, BODY_OP_STR_LITERAL, slot, literal, 0);
    ColdExprResult result;
    cold_publish_plain_string_literal_producer(
        body, slot, definition, &result);
    if (result.value_def_op_id != definition ||
        result.slot != slot ||
        result.exact_type_id != SLOT_STR * 1048576) {
        gate_fail("owned string fixture lost exact authority");
    }
    return definition;
}

static int32_t gate_emit_unique_string_projection(
        BodyIR *body, int32_t source_definition) {
    int32_t source_slot =
        body->op_value_def_slot[source_definition];
    int32_t slot =
        body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    body_slot_set_type(body, slot, cold_cstr_span("str"));
    int32_t definition = body_op(
        body, BODY_OP_COPY_COMPOSITE,
        slot, source_slot, 0);
    gate_publish_definition(
        body, definition, slot,
        body->op_value_def_exact_type_id[source_definition],
        body->producer_function_row,
        COLD_EXPR_PLACE_BORROW_PROJECTION,
        COLD_EXPR_OWN_BORROW_UNIQUE,
        source_definition);
    body->slot_exact_type_id[slot] =
        body->op_value_def_exact_type_id[source_definition];
    body->slot_place_kind[slot] =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->slot_origin_id[slot] = source_definition;
    body->slot_managed_storage_kind[slot] =
        COLD_MANAGED_STORAGE_STR;
    return definition;
}

static void gate_run_production_loop_close(void) {
    Arena *arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (arena == MAP_FAILED)
        gate_fail("production arena allocation failed");
    memset(arena, 0, sizeof(Arena));
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, arena);
    Symbols *symbols = compilation.symbols;
    int32_t formal_kind = SLOT_STR_REF;
    int32_t formal_size = 8;
    Span formal_type = cold_cstr_span("var str");
    int32_t callee = symbols_add_fn(
        symbols, cold_cstr_span("LoopProjectionMutate"),
        1, &formal_kind, &formal_size, &formal_type,
        cold_cstr_span("bool"));
    int32_t caller = symbols_add_fn(
        symbols, cold_cstr_span("LoopProjectionCaller"),
        0, 0, 0, 0, cold_cstr_span(""));
    if (callee < 0 || caller < 0)
        gate_fail("production loop functions were not registered");
    symbols_set_fn_param_types(symbols, callee, &formal_type, 1);
    cold_publish_exact_formal_type_ids(symbols, callee);

    BodyIR *body = body_new(arena);
    body->producer_function_row = caller;
    body->debug_name =
        cold_cstr_span("loop_projection_production_close");
    Parser parser = cold_parser_issue_legacy_span(
        symbols,
        cold_cstr_span("loop-projection-production-close"));
    int32_t preheader = body_block(body);
    int32_t condition = body_block(body);
    int32_t backedge = body_block(body);
    int32_t exit = body_block(body);

    Local local_row = {0};
    Locals locals = {
        .items = &local_row,
        .count = 1,
        .cap = 1,
        .arena = arena,
    };
    ColdLocalValueState entry = {0};
    ColdLocalValueState next = {0};
    int32_t entry_definition =
        gate_emit_owned_string(body, "entry-owner");
    local_row.name = cold_cstr_span("loop_owner");
    local_row.kind = SLOT_STR;
    local_row.slot =
        body->op_value_def_slot[entry_definition];
    local_row.is_mutable_place = true;
    local_row.value_def_op_id = entry_definition;
    entry.slot = local_row.slot;
    entry.value_def_op_id = entry_definition;
    body_branch_to(body, preheader, condition);

    body_reopen_block(body, condition);
    int32_t loop_op_start = body->op_count;
    int32_t call_arg_start = body->call_arg_count;
    int32_t term_start = body->term_count;
    int32_t projection =
        gate_emit_unique_string_projection(
            body, entry_definition);
    int32_t projection_slot =
        body->op_value_def_slot[projection];
    int32_t carrier_slot =
        body_slot(body, SLOT_STR_REF, 8);
    body_slot_set_type(
        body, carrier_slot, cold_cstr_span("str"));
    int32_t carrier = body_op(
        body, BODY_OP_LOCAL_ADDR,
        carrier_slot, projection_slot, 0);
    int32_t arg = body_call_arg(body, carrier_slot);
    gate_bind_call_arg(body, arg, projection);
    int32_t result = body_slot(body, SLOT_I32, 4);
    int32_t call = body_op3(
        body, BODY_OP_CALL_COMPOSITE,
        result, callee, arg, 1);
    int32_t predicate = body_slot(body, SLOT_I32, 4);
    int32_t zero = body_slot(body, SLOT_I32, 4);
    body_op(body, BODY_OP_I32_CONST, predicate, 1, 0);
    body_op(body, BODY_OP_I32_CONST, zero, 0, 0);
    int32_t condition_term = body_term(
        body, BODY_TERM_CBR,
        predicate, COND_NE, zero, backedge, exit);
    body_end_block(body, condition, condition_term);

    body_reopen_block(body, backedge);
    int32_t next_definition =
        gate_emit_owned_string(body, "backedge-owner");
    local_row.slot =
        body->op_value_def_slot[next_definition];
    local_row.value_def_op_id = next_definition;
    next.slot = local_row.slot;
    next.value_def_op_id = next_definition;
    int32_t loop_op_end = body->op_count;
    if (!cold_close_exact_managed_loop_phi(
            &parser, body, &locals, 1,
            &entry, &next, preheader, backedge,
            condition, loop_op_start, loop_op_end,
            call_arg_start, term_start)) {
        gate_fail("production loop did not close an exact phi");
    }
    int32_t merge = local_row.value_def_op_id;
    int32_t owner = -1;
    int32_t function = -1;
    int32_t formal = -1;
    if (merge < 0 || merge >= body->op_count ||
        body->op_value_def_place_kind[merge] !=
            COLD_EXPR_PLACE_CFG_MERGE ||
        body->op_value_def_origin_id[projection] != merge ||
        body->slot_origin_id[projection_slot] != merge ||
        body->call_arg_value_def_op_id[arg] != projection ||
        body->call_arg_place_kind[arg] !=
            body->op_value_def_place_kind[projection] ||
        body->call_arg_ownership[arg] !=
            body->op_value_def_ownership[projection] ||
        body->call_arg_origin_id[arg] !=
            body->op_value_def_origin_id[projection] ||
        !cold_exact_call_arg_owner_and_formal(
            body, symbols, arg,
            &owner, &function, &formal) ||
        owner != call || function != callee || formal != 0 ||
        carrier >= call ||
        cold_block_index_for_op(body, carrier) !=
            cold_block_index_for_op(body, call)) {
        fprintf(
            stderr,
            "producer_frontier=call_arg_projection_origin"
            " def=%d expected_def=%d origin=%d"
            " expected_origin=%d owner=%d expected_owner=%d\n",
            body->call_arg_value_def_op_id[arg],
            projection,
            body->call_arg_origin_id[arg],
            body->op_value_def_origin_id[projection],
            owner, call);
        gate_fail(
            "production loop close left partial call-arg authority");
    }

    body_reopen_block(body, exit);
    int32_t terminal = body_term(
        body, BODY_TERM_RET, -1, 0, 0, -1, -1);
    body_end_block(body, exit, terminal);
    puts("production_loop_projection_call_arg_rebind=pass");
    cold_harness_compilation_end(&compilation, false);
    arena_release(arena);
}

int main(int argc, char **argv) {
    if (argc == 2 &&
        strcmp(argv[1], "production-close") == 0) {
        gate_run_production_loop_close();
        return 0;
    }
    LoopCallArgFixture fixture;
    gate_fixture_init(&fixture);
    if (argc == 1 || strcmp(argv[1], "positive") == 0) {
        if (!gate_contract_valid(&fixture))
            gate_fail("positive exact tuple was rejected");
        puts("cold_loop_projection_call_arg_origin_gate_status=pass");
        puts("call_arg_definition_remains_projection=1");
        puts("call_arg_authority_columns_synchronized=1");
        puts("pre_start_call_arg_preserved=1");
        cold_harness_compilation_end(
            &fixture.compilation, false);
        arena_release(fixture.arena);
        return 0;
    }
    gate_mutate(&fixture, argv[1]);
    if (gate_contract_valid(&fixture))
        gate_fail("mutated exact tuple was accepted");
    printf("mutation_rejected=%s\n", argv[1]);
    cold_harness_compilation_end(
        &fixture.compilation, false);
    arena_release(fixture.arena);
    return 0;
}
