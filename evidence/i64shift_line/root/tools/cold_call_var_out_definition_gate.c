#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

typedef struct CallVarOutFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation compilation;
    BodyIR *callee_body;
    BodyIR *caller_body;
    Locals callee_locals;
    Locals caller_locals;
    FnDef *callee;
    Local *actual;
    int32_t caller_block;
    int32_t arg_start;
    int32_t value_slot;
    int32_t carrier_slot;
    int32_t carrier_op;
    int32_t call_op;
    int32_t definition;
} CallVarOutFixture;

static void gate_fail(const char *message) {
    fprintf(stderr,
            "cold_call_var_out_definition_gate: %s\n",
            message);
    exit(1);
}

static Arena *gate_arena_new(void) {
    Arena *arena = mmap(0, sizeof(Arena),
                        PROT_READ | PROT_WRITE,
                        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (arena == MAP_FAILED)
        gate_fail("arena owner allocation failed");
    return arena;
}

static void gate_var_place_table_init(
        Arena *arena, ColdVarPlaceTable *table,
        int32_t capacity) {
    if (!arena || !table || capacity <= 0)
        gate_fail("var place table allocation is invalid");
    memset(table, 0, sizeof(*table));
    table->capacity = capacity;
    table->parent_ids = arena_alloc(
        arena, (size_t)capacity * sizeof(int32_t));
    table->kinds = arena_alloc(
        arena, (size_t)capacity * sizeof(int32_t));
    table->a_values = arena_alloc(
        arena, (size_t)capacity * sizeof(int32_t));
    table->b_values = arena_alloc(
        arena, (size_t)capacity * sizeof(int32_t));
}

static void gate_close_void_body(BodyIR *body, int32_t block) {
    int32_t value = body_slot(body, SLOT_I32, 4);
    body_slot_set_type(body, value, (Span){0});
    body_op(body, BODY_OP_I32_CONST, value, 0, 0);
    int32_t term = body_term(
        body, BODY_TERM_RET, value, -1, 0, -1, -1);
    body_end_block(body, block, term);
}

static void gate_fixture_init(CallVarOutFixture *fixture,
                              bool parse_call,
                              bool by_value_formal,
                              bool nested_arg) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = gate_arena_new();
    cold_harness_compilation_begin(
        &fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation.symbols;

    ObjectDef *receipt = symbols_add_object(
        fixture->symbols,
        cold_cstr_span("CallVarOutReceipt"), 1);
    if (!receipt) gate_fail("receipt object registration failed");
    receipt->fields[0].name = cold_cstr_span("text");
    receipt->fields[0].kind = SLOT_STR;
    receipt->fields[0].size = COLD_STR_SLOT_SIZE;
    receipt->fields[0].type_name = cold_cstr_span("str");
    object_finalize_fields(receipt);
    if (receipt->slot_size != COLD_STR_SLOT_SIZE)
        gate_fail("receipt layout drifted");

    int32_t formal_kind =
        by_value_formal ? SLOT_OBJECT : SLOT_OBJECT_REF;
    int32_t formal_size =
        by_value_formal ? receipt->slot_size : 8;
    Span formal_type = by_value_formal
        ? cold_cstr_span("CallVarOutReceipt")
        : cold_cstr_span("var CallVarOutReceipt");
    int32_t callee_row = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("CallVarOutFill"),
        1, &formal_kind, &formal_size, &formal_type,
        cold_cstr_span("bool"));
    if (callee_row < 0)
        gate_fail("callee registration failed");
    symbols_set_fn_param_types(
        fixture->symbols, callee_row,
        &formal_type, 1);
    cold_publish_exact_formal_type_ids(
        fixture->symbols, callee_row);

    fixture->callee_body = body_new(fixture->arena);
    fixture->callee_body->producer_function_row = callee_row;
    fixture->callee_body->debug_name =
        cold_cstr_span("call_var_out_fill");
    int32_t callee_block = body_block(fixture->callee_body);
    int32_t formal_slot = body_slot(
        fixture->callee_body, formal_kind, formal_size);
    body_slot_set_type(
        fixture->callee_body, formal_slot, receipt->name);
    fixture->callee_body->param_count = 1;
    fixture->callee_body->param_slot[0] = formal_slot;
    fixture->callee_body->param_name[0] =
        cold_cstr_span("out");
    locals_init(&fixture->callee_locals, fixture->arena);
    locals_add(
        &fixture->callee_locals,
        fixture->callee_body->param_name[0],
        formal_slot, formal_kind);
    Local *formal = locals_find(
        &fixture->callee_locals,
        fixture->callee_body->param_name[0]);
    if (!formal) gate_fail("formal local registration failed");
    formal->is_mutable_place = true;
    Span formal_types[1] = {formal_type};
    if (!by_value_formal &&
        cold_exact_managed_storage_for_slot(
            fixture->symbols, fixture->callee_body,
            formal_slot, formal_kind) ==
            COLD_MANAGED_STORAGE_UNKNOWN) {
        fprintf(
            stderr,
            "gate receipt fields=%d kind=%d type=%.*s drop=%d exact=%d\n",
            receipt->field_count,
            receipt->fields[0].kind,
            (int)receipt->fields[0].type_name.len,
            receipt->fields[0].type_name.ptr,
            cold_type_requires_managed_drop(
                fixture->symbols, receipt->name, 0) ? 1 : 0,
            cold_exact_managed_type_id(
                fixture->symbols, fixture->callee_body,
                formal_slot, formal_kind));
        gate_fail("formal managed storage was not resolved");
    }
    cold_bind_exact_managed_parameters(
        fixture->callee_body, fixture->symbols,
        &fixture->callee_locals, formal_types);
    gate_close_void_body(fixture->callee_body, callee_block);
    fixture->callee =
        &fixture->symbols->functions[callee_row];
    if (!by_value_formal &&
        (fixture->callee->param_exact_type_id[0] < 0 ||
         fixture->callee->param_exact_object_is_ref[0] != 0)) {
        fprintf(
            stderr,
            "gate formal type_id=%d object_is_ref=%d local_def=%d\n",
            fixture->callee->param_exact_type_id[0],
            fixture->callee->param_exact_object_is_ref[0],
            formal->value_def_op_id);
        gate_fail("callee formal identity was not sealed");
    }

    int32_t caller_row = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("CallVarOutCaller"),
        0, 0, 0, 0, cold_cstr_span(""));
    if (caller_row < 0)
        gate_fail("caller registration failed");
    fixture->callee =
        &fixture->symbols->functions[callee_row];
    fixture->caller_body = body_new(fixture->arena);
    fixture->caller_body->producer_function_row = caller_row;
    fixture->caller_body->debug_name =
        cold_cstr_span("call_var_out_caller");
    fixture->caller_block = body_block(fixture->caller_body);
    locals_init(&fixture->caller_locals, fixture->arena);

    fixture->value_slot = body_slot(
        fixture->caller_body, SLOT_OBJECT,
        receipt->slot_size);
    body_slot_set_type(
        fixture->caller_body,
        fixture->value_slot, receipt->name);
    locals_add(
        &fixture->caller_locals,
        cold_cstr_span("receipt"),
        fixture->value_slot, SLOT_OBJECT);
    fixture->actual = locals_find(
        &fixture->caller_locals,
        cold_cstr_span("receipt"));
    if (!fixture->actual)
        gate_fail("actual local registration failed");
    fixture->actual->is_mutable_place = true;
    if (fixture->actual->value_def_op_id != -1)
        gate_fail("out actual unexpectedly has an input definition");

    if (parse_call) {
        Parser parser = cold_parser_issue_legacy_span(
            fixture->symbols,
            nested_arg
                ? cold_cstr_span("((receipt))")
                : cold_cstr_span("(receipt)"));
        int32_t result_kind = SLOT_I32;
        ColdExprResult result;
        cold_expr_result_reset(&result);
        (void)cold_parse_call_after_name_exact(
            &parser, fixture->caller_body,
            &fixture->caller_locals,
            fixture->callee->name,
            &result_kind, &result);
        if (result_kind != SLOT_I32 ||
            parser.pos != parser.source.len ||
            fixture->actual->value_def_op_id < 0) {
            gate_fail("production call parser did not publish var-out definition");
        }
        fixture->definition =
            fixture->actual->value_def_op_id;
        fixture->call_op =
            fixture->caller_body->op_a[
                fixture->definition];
        fixture->carrier_op =
            fixture->caller_body->op_c[
                fixture->definition];
        fixture->carrier_slot =
            fixture->caller_body->op_dst[
                fixture->carrier_op];
        fixture->arg_start =
            fixture->caller_body->op_b[
                fixture->call_op];
        gate_close_void_body(
            fixture->caller_body,
            fixture->caller_block);
        return;
    }

    fixture->carrier_slot = body_slot(
        fixture->caller_body, SLOT_OBJECT_REF, 8);
    body_slot_set_type(
        fixture->caller_body,
        fixture->carrier_slot, receipt->name);
    fixture->carrier_op = body_op(
        fixture->caller_body, BODY_OP_LOCAL_ADDR,
        fixture->carrier_slot, fixture->value_slot, 0);
    fixture->arg_start =
        fixture->caller_body->call_arg_count;
    body_call_arg(
        fixture->caller_body, fixture->carrier_slot);
    int32_t result_slot = body_slot(
        fixture->caller_body, SLOT_I32, 4);
    body_slot_set_type(
        fixture->caller_body,
        result_slot, cold_cstr_span("bool"));
    fixture->call_op = body_op3(
        fixture->caller_body, BODY_OP_CALL_COMPOSITE,
        result_slot, callee_row, fixture->arg_start, 1);

    int32_t var_out_local_indices[COLD_MAX_I32_PARAMS];
    int32_t carrier_ops[COLD_MAX_I32_PARAMS];
    for (int32_t i = 0; i < COLD_MAX_I32_PARAMS; i++) {
        var_out_local_indices[i] = -1;
        carrier_ops[i] = -1;
    }
    var_out_local_indices[0] =
        (int32_t)(fixture->actual -
                  fixture->caller_locals.items);
    carrier_ops[0] = fixture->carrier_op;
    ColdVarPlaceTable place_table;
    gate_var_place_table_init(
        fixture->arena, &place_table, 8);
    int32_t root_place_ids[COLD_MAX_I32_PARAMS];
    for (int32_t i = 0; i < COLD_MAX_I32_PARAMS; i++)
        root_place_ids[i] = -1;
    root_place_ids[0] =
        cold_exact_var_local_root_place_id(
            fixture->caller_body,
            fixture->symbols,
            &fixture->caller_locals,
            var_out_local_indices[0], &place_table);
    if (root_place_ids[0] < 0)
        gate_fail("manual out-place root was not resolved");
    cold_publish_exact_call_var_out_definitions(
        fixture->caller_body, fixture->symbols,
        &fixture->caller_locals,
        fixture->callee, fixture->call_op,
        fixture->arg_start, 1,
        var_out_local_indices, carrier_ops,
        &place_table, root_place_ids);
    fixture->definition =
        fixture->actual->value_def_op_id;
    gate_close_void_body(
        fixture->caller_body, fixture->caller_block);
}

static void gate_positive(void) {
    CallVarOutFixture fixture;
    gate_fixture_init(&fixture, true, false, false);
    BodyIR *body = fixture.caller_body;
    int32_t definition = fixture.definition;
    if (definition != fixture.call_op + 1 ||
        body->op_kind[definition] != BODY_OP_NOP ||
        body->op_dst[definition] != fixture.value_slot ||
        body->op_a[definition] != fixture.call_op ||
        body->op_b[definition] != 0 ||
        body->op_c[definition] != fixture.carrier_op ||
        body->op_value_def_slot[definition] !=
            fixture.value_slot ||
        body->op_value_def_place_kind[definition] !=
            COLD_EXPR_PLACE_MEMORY_VERSION ||
        body->op_value_def_ownership[definition] !=
            COLD_EXPR_OWN_MOVE ||
        body->op_value_def_origin_id[definition] != definition ||
        body->op_source_value_def_op_id[definition] != -1 ||
        body->slot_place_kind[fixture.value_slot] !=
            COLD_EXPR_PLACE_MEMORY_VERSION ||
        body->slot_origin_id[fixture.value_slot] != definition ||
        !cold_exact_call_var_out_definition_valid(
            body, fixture.symbols, definition) ||
        !cold_exact_local_current_definition_replace_valid(
            body, fixture.symbols,
            fixture.actual, definition) ||
        !cold_bodyir_exact_identity_schema_valid(
            body, fixture.symbols,
            "call-var-out-positive", false)) {
        gate_fail("positive tuple was rejected");
    }
    puts("cold_call_var_out_definition_gate_status=pass");
    puts("post_call_definition_row=1");
    puts("resolved_formal_actual_binding=1");
    arena_release(fixture.arena);
}

typedef struct GateVersionCall {
    int32_t call_op;
    int32_t carrier_op;
    int32_t carrier_slot;
    int32_t arg_start;
    int32_t definition;
} GateVersionCall;

typedef struct GateVersionFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation compilation;
    BodyIR *body;
    Locals locals;
    FnDef *callee;
    Local *root;
    int32_t block;
    int32_t callee_row;
    int32_t caller_row;
    int32_t root_slot;
    int32_t root_definition;
    bool projection;
    Span root_name;
    GateVersionCall first;
    GateVersionCall second;
} GateVersionFixture;

static ObjectDef *gate_add_managed_object(
        Symbols *symbols, Span name) {
    ObjectDef *object = symbols_add_object(symbols, name, 1);
    if (!object)
        gate_fail("managed version object registration failed");
    object->fields[0].name = cold_cstr_span("bytes");
    object->fields[0].kind = SLOT_STR;
    object->fields[0].size = COLD_STR_SLOT_SIZE;
    object->fields[0].type_name = cold_cstr_span("str");
    object_finalize_fields(object);
    if (object->slot_size != COLD_STR_SLOT_SIZE)
        gate_fail("managed version object layout drifted");
    return object;
}

static int32_t gate_add_var_function(
        Symbols *symbols, Span name,
        Span formal_type, Span result_type) {
    int32_t formal_kind = SLOT_OBJECT_REF;
    int32_t formal_size = 8;
    int32_t row = symbols_add_fn(
        symbols, name, 1, &formal_kind,
        &formal_size, &formal_type, result_type);
    if (row < 0)
        gate_fail("var function registration failed");
    symbols_set_fn_param_types(symbols, row, &formal_type, 1);
    cold_publish_exact_formal_type_ids(symbols, row);
    if (symbols->functions[row].param_exact_type_id[0] < 0 ||
        symbols->functions[row].param_exact_object_is_ref[0] != 0)
        gate_fail("var function formal identity was not sealed");
    return row;
}

static GateVersionCall gate_parse_version_call(
        GateVersionFixture *fixture, Span source) {
    if (!fixture || !fixture->body || !fixture->root)
        gate_fail("version call fixture is invalid");
    int32_t op_start = fixture->body->op_count;
    Parser parser = cold_parser_issue_legacy_span(
        fixture->symbols, source);
    int32_t result_kind = SLOT_I32;
    ColdExprResult result;
    cold_expr_result_reset(&result);
    (void)cold_parse_call_after_name_exact(
        &parser, fixture->body, &fixture->locals,
        fixture->callee->name, &result_kind, &result);
    if (result_kind != SLOT_I32 ||
        parser.pos != parser.source.len)
        gate_fail("production parser did not consume version call");

    GateVersionCall call;
    memset(&call, 0, sizeof(call));
    call.call_op = -1;
    call.carrier_op = -1;
    call.carrier_slot = -1;
    call.arg_start = -1;
    call.definition = -1;
    fixture->root = locals_find(
        &fixture->locals, fixture->root_name);
    if (!fixture->root)
        gate_fail("version root local disappeared");
    if (!fixture->projection) {
        call.definition = fixture->root->value_def_op_id;
        if (call.definition < op_start ||
            call.definition >= fixture->body->op_count)
            gate_fail("bare var call did not advance current definition");
        call.call_op = fixture->body->op_a[call.definition];
    } else {
        for (int32_t op = op_start;
             op < fixture->body->op_count; op++) {
            int32_t kind = fixture->body->op_kind[op];
            if ((kind == BODY_OP_CALL_I32 ||
                 kind == BODY_OP_CALL_COMPOSITE) &&
                fixture->body->op_a[op] ==
                    fixture->callee_row) {
                if (call.call_op >= 0)
                    gate_fail("projection call identity is ambiguous");
                call.call_op = op;
            }
        }
        if (call.call_op < 0 ||
            call.call_op + 1 >= fixture->body->op_count)
            gate_fail("projection call was not published");
        call.definition = call.call_op + 1;
    }
    if (call.definition != call.call_op + 1 ||
        fixture->body->op_kind[call.definition] != BODY_OP_NOP ||
        fixture->body->op_value_def_place_kind[call.definition] !=
            COLD_EXPR_PLACE_MEMORY_VERSION)
        gate_fail("post-call MEMORY_VERSION row is not adjacent");
    call.carrier_op = fixture->body->op_c[call.definition];
    if (call.carrier_op < 0 ||
        call.carrier_op >= call.call_op)
        gate_fail("version carrier identity is invalid");
    call.carrier_slot =
        fixture->body->op_dst[call.carrier_op];
    call.arg_start = fixture->body->op_b[call.call_op];
    if (!cold_exact_call_var_out_definition_valid(
            fixture->body, fixture->symbols,
            call.definition))
        gate_fail("production validator rejected version call");
    return call;
}

static void gate_version_fixture_init(
        GateVersionFixture *fixture,
        bool projection, int32_t call_count) {
    if (!fixture || call_count < 1 || call_count > 2)
        gate_fail("version fixture call count is invalid");
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = gate_arena_new();
    cold_harness_compilation_begin(
        &fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation.symbols;
    ObjectDef *byte_buf = gate_add_managed_object(
        fixture->symbols, cold_cstr_span("GateByteBuf"));
    Span root_type = byte_buf->name;
    Span root_formal = cold_cstr_span("var GateByteBuf");
    fixture->root_name = cold_cstr_span("buf");
    Span call_source = cold_cstr_span("(buf)");
    if (projection) {
        ObjectDef *holder = symbols_add_object(
            fixture->symbols, cold_cstr_span("GateByteBufHolder"), 1);
        if (!holder)
            gate_fail("projection holder registration failed");
        holder->fields[0].name = cold_cstr_span("buf");
        holder->fields[0].kind = SLOT_OBJECT;
        holder->fields[0].size = byte_buf->slot_size;
        holder->fields[0].type_name = byte_buf->name;
        object_finalize_fields(holder);
        root_type = holder->name;
        root_formal = cold_cstr_span("var GateByteBufHolder");
        fixture->root_name = cold_cstr_span("holder");
        call_source = cold_cstr_span("(holder.buf)");
    }
    fixture->projection = projection;
    fixture->callee_row = gate_add_var_function(
        fixture->symbols,
        cold_cstr_span("GateByteBufMutate"),
        cold_cstr_span("var GateByteBuf"),
        cold_cstr_span("bool"));
    fixture->caller_row = gate_add_var_function(
        fixture->symbols,
        projection
            ? cold_cstr_span("GateProjectionCaller")
            : cold_cstr_span("GateBareCaller"),
        root_formal, cold_cstr_span(""));
    fixture->callee =
        &fixture->symbols->functions[fixture->callee_row];
    fixture->body = body_new(fixture->arena);
    fixture->body->producer_function_row = fixture->caller_row;
    fixture->body->debug_name = projection
        ? cold_cstr_span("gate_projection_version_caller")
        : cold_cstr_span("gate_bare_version_caller");
    fixture->block = body_block(fixture->body);
    int32_t raw_slot = body_slot(
        fixture->body, SLOT_OBJECT_REF, 8);
    body_slot_set_type(fixture->body, raw_slot, root_type);
    fixture->body->param_count = 1;
    fixture->body->param_slot[0] = raw_slot;
    fixture->body->param_name[0] = fixture->root_name;
    locals_init(&fixture->locals, fixture->arena);
    locals_add(
        &fixture->locals, fixture->root_name,
        raw_slot, SLOT_OBJECT_REF);
    fixture->root = locals_find(
        &fixture->locals, fixture->root_name);
    if (!fixture->root)
        gate_fail("version root parameter was not registered");
    fixture->root->is_mutable_place = true;
    Span parameter_types[1] = {root_formal};
    cold_bind_exact_managed_parameters(
        fixture->body, fixture->symbols,
        &fixture->locals, parameter_types);
    fixture->root = locals_find(
        &fixture->locals, fixture->root_name);
    if (!fixture->root || fixture->root->value_def_op_id < 0)
        gate_fail("version root parameter authority was not bound");
    fixture->root_slot = fixture->root->slot;
    fixture->root_definition = fixture->root->value_def_op_id;
    fixture->first = gate_parse_version_call(
        fixture, call_source);
    if (call_count == 2)
        fixture->second = gate_parse_version_call(
            fixture, call_source);
    gate_close_void_body(fixture->body, fixture->block);
}

static void gate_bare_version_positive(void) {
    GateVersionFixture fixture;
    gate_version_fixture_init(&fixture, false, 2);
    BodyIR *body = fixture.body;
    int32_t first = fixture.first.definition;
    int32_t second = fixture.second.definition;
    int32_t first_arg = fixture.first.arg_start;
    int32_t second_arg = fixture.second.arg_start;
    if (body->op_value_def_place_kind[fixture.root_definition] !=
            COLD_EXPR_PLACE_PARAM ||
        body->op_value_def_ownership[fixture.root_definition] !=
            COLD_EXPR_OWN_BORROW_UNIQUE ||
        body->op_dst[first] != fixture.root_slot ||
        body->op_dst[second] != fixture.root_slot ||
        body->op_value_def_slot[first] != fixture.root_slot ||
        body->op_value_def_slot[second] != fixture.root_slot ||
        body->op_value_def_origin_id[first] !=
            fixture.root_definition ||
        body->op_value_def_origin_id[second] != first ||
        body->op_source_value_def_op_id[first] != -1 ||
        body->op_source_value_def_op_id[second] != -1 ||
        body->op_value_def_ownership[first] !=
            COLD_EXPR_OWN_BORROW_UNIQUE ||
        body->op_value_def_ownership[second] !=
            COLD_EXPR_OWN_BORROW_UNIQUE ||
        body->op_source_value_def_op_id[
            fixture.first.carrier_op] !=
                fixture.root_definition ||
        body->op_source_value_def_op_id[
            fixture.second.carrier_op] != first ||
        body->call_arg_value_def_op_id[first_arg] !=
            fixture.first.carrier_op ||
        body->call_arg_value_def_op_id[second_arg] !=
            fixture.second.carrier_op ||
        body->slot_place_kind[fixture.root_slot] !=
            COLD_EXPR_PLACE_MEMORY_VERSION ||
        body->slot_origin_id[fixture.root_slot] != second ||
        fixture.root->value_def_op_id != second ||
        !cold_exact_local_current_definition_replace_valid(
            body, fixture.symbols,
            fixture.root, second) ||
        cold_exact_var_owner_root_definition(
            body, second, 0) != fixture.root_definition ||
        !cold_exact_unique_var_param_authority_valid(
            body, fixture.symbols, second, 0) ||
        !cold_bodyir_exact_identity_schema_valid(
            body, fixture.symbols,
            "bare-memory-version-positive", false)) {
        gate_fail("consecutive bare var MEMORY_VERSION chain was rejected");
    }
    puts("bare_var_consecutive_calls=2");
    puts("bare_var_current_head=second_version");
    arena_release(fixture.arena);
}

static void gate_projection_version_positive(void) {
    GateVersionFixture fixture;
    gate_version_fixture_init(&fixture, true, 2);
    BodyIR *body = fixture.body;
    GateVersionCall calls[2] = {
        fixture.first, fixture.second};
    if (fixture.root->slot != fixture.root_slot ||
        fixture.root->value_def_op_id !=
            fixture.root_definition ||
        body->slot_place_kind[fixture.root_slot] !=
            COLD_EXPR_PLACE_PARAM ||
        body->slot_origin_id[fixture.root_slot] != 0)
        gate_fail("field projection repointed root authority");
    for (int32_t i = 0; i < 2; i++) {
        int32_t definition = calls[i].definition;
        int32_t carrier = calls[i].carrier_op;
        int32_t out_slot = body->op_dst[definition];
        if (body->op_kind[carrier] != BODY_OP_FIELD_REF ||
            out_slot == fixture.root_slot ||
            out_slot != body->op_dst[carrier] ||
            body->op_value_def_slot[definition] != out_slot ||
            body->op_value_def_place_kind[definition] !=
                COLD_EXPR_PLACE_MEMORY_VERSION ||
            body->op_source_value_def_op_id[definition] != -1 ||
            body->slot_place_kind[out_slot] !=
                COLD_EXPR_PLACE_BORROW_PROJECTION ||
            body->slot_origin_id[out_slot] !=
                body->op_value_def_origin_id[carrier] ||
            cold_exact_var_owner_root_definition(
                body, definition, 0) !=
                fixture.root_definition ||
            !cold_exact_call_var_out_definition_valid(
                body, fixture.symbols, definition)) {
            gate_fail("field projection MEMORY_VERSION authority drifted");
        }
    }
    if (!cold_bodyir_exact_identity_schema_valid(
            body, fixture.symbols,
            "projection-memory-version-positive", false))
        gate_fail("field projection MEMORY_VERSION schema was rejected");
    puts("field_projection_calls=2");
    puts("field_projection_root_unchanged=1");
    arena_release(fixture.arena);
}

static void gate_insert_identity_relocation_probe(
        BodyIR *body, int32_t block,
        int32_t insert_pos, bool relocate) {
    if (!body || block < 0 || block >= body->block_count ||
        insert_pos < body->block_op_start[block] ||
        insert_pos >= body->block_op_start[block] +
            body->block_op_count[block])
        gate_fail("relocation probe position is invalid");
    int32_t sentinel_slot = body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, sentinel_slot, cold_cstr_span("int32"));
    body_ensure_ops(body);
    size_t bytes =
        (size_t)(body->op_count - insert_pos) * sizeof(int32_t);
#define GATE_SHIFT_OP_COLUMN(column) \
    memmove(&body->column[insert_pos + 1], \
            &body->column[insert_pos], bytes)
    GATE_SHIFT_OP_COLUMN(op_kind);
    GATE_SHIFT_OP_COLUMN(op_dst);
    GATE_SHIFT_OP_COLUMN(op_a);
    GATE_SHIFT_OP_COLUMN(op_b);
    GATE_SHIFT_OP_COLUMN(op_c);
    GATE_SHIFT_OP_COLUMN(op_value_def_slot);
    GATE_SHIFT_OP_COLUMN(op_value_def_exact_type_id);
    GATE_SHIFT_OP_COLUMN(op_value_def_producer_function_row);
    GATE_SHIFT_OP_COLUMN(op_value_def_place_kind);
    GATE_SHIFT_OP_COLUMN(op_value_def_ownership);
    GATE_SHIFT_OP_COLUMN(op_value_def_origin_id);
    GATE_SHIFT_OP_COLUMN(op_value_def_consume_op_index_plus_one);
    GATE_SHIFT_OP_COLUMN(op_source_value_def_op_id);
    GATE_SHIFT_OP_COLUMN(op_exact_source_dst_value_def_op_id);
    GATE_SHIFT_OP_COLUMN(op_exact_source_a_value_def_op_id);
    GATE_SHIFT_OP_COLUMN(op_exact_source_b_value_def_op_id);
    GATE_SHIFT_OP_COLUMN(op_exact_source_c_value_def_op_id);
#undef GATE_SHIFT_OP_COLUMN
    body->op_kind[insert_pos] = BODY_OP_I32_CONST;
    body->op_dst[insert_pos] = sentinel_slot;
    body->op_a[insert_pos] = 17;
    body->op_b[insert_pos] = 0;
    body->op_c[insert_pos] = 0;
    body->op_value_def_slot[insert_pos] = -1;
    body->op_value_def_exact_type_id[insert_pos] = -1;
    body->op_value_def_producer_function_row[insert_pos] = -1;
    body->op_value_def_place_kind[insert_pos] =
        COLD_EXPR_PLACE_INVALID;
    body->op_value_def_ownership[insert_pos] =
        COLD_EXPR_OWN_INVALID;
    body->op_value_def_origin_id[insert_pos] = -1;
    body->op_value_def_consume_op_index_plus_one[insert_pos] = 0;
    body->op_source_value_def_op_id[insert_pos] = -1;
    body->op_exact_source_dst_value_def_op_id[insert_pos] = -1;
    body->op_exact_source_a_value_def_op_id[insert_pos] = -1;
    body->op_exact_source_b_value_def_op_id[insert_pos] = -1;
    body->op_exact_source_c_value_def_op_id[insert_pos] = -1;
    body->op_count++;
    if (relocate)
        cold_shift_exact_op_indices_after_insert(
            body, insert_pos);
    body->block_op_count[block]++;
}

static void gate_relocation_positive(void) {
    GateVersionFixture fixture;
    gate_version_fixture_init(&fixture, false, 2);
    BodyIR *body = fixture.body;
    int32_t insert_pos = fixture.first.call_op;
    int32_t first = fixture.first.definition + 1;
    int32_t second = fixture.second.definition + 1;
    int32_t second_carrier = fixture.second.carrier_op + 1;
    int32_t second_call = fixture.second.call_op + 1;
    gate_insert_identity_relocation_probe(
        body, fixture.block, insert_pos, true);
    if (body->op_a[first] != fixture.first.call_op + 1 ||
        body->op_value_def_origin_id[first] !=
            fixture.root_definition ||
        body->op_a[second] != second_call ||
        body->op_c[second] != second_carrier ||
        body->op_value_def_origin_id[second] != first ||
        body->op_source_value_def_op_id[second_carrier] != first ||
        body->slot_origin_id[fixture.root_slot] != second ||
        !cold_exact_call_var_out_definition_valid(
            body, fixture.symbols, first) ||
        !cold_exact_call_var_out_definition_valid(
            body, fixture.symbols, second) ||
        !cold_bodyir_exact_identity_schema_valid(
            body, fixture.symbols,
            "memory-version-relocation-positive", false)) {
        gate_fail("production MEMORY_VERSION relocation was rejected");
    }
    puts("memory_version_relocation=pass");
    arena_release(fixture.arena);
}

static void gate_version_mutation(const char *mode) {
    bool projection_as_root =
        strcmp(mode, "mutate-projection-as-root") == 0 ||
        strcmp(mode, "mutate-projection-callarg-sentinel") == 0;
    GateVersionFixture fixture;
    gate_version_fixture_init(
        &fixture, projection_as_root, 2);
    BodyIR *body = fixture.body;
    int32_t first = fixture.first.definition;
    int32_t second = fixture.second.definition;
    if (strcmp(mode, "mutate-stale-source") == 0) {
        body->op_source_value_def_op_id[
            fixture.second.carrier_op] =
                fixture.root_definition;
    } else if (strcmp(
                   mode,
                   "mutate-forwarded-callarg-sentinel") == 0) {
        int32_t row = fixture.second.arg_start;
        body->call_arg_value_def_op_id[row] = -1;
        body->call_arg_place_kind[row] =
            COLD_EXPR_PLACE_INVALID;
        body->call_arg_ownership[row] =
            COLD_EXPR_OWN_INVALID;
        body->call_arg_origin_id[row] = -1;
    } else if (strcmp(
                   mode,
                   "mutate-forwarded-carrier-origin") == 0) {
        body->op_value_def_origin_id[
            fixture.second.carrier_op] =
                fixture.root_slot;
    } else if (strcmp(
                   mode,
                   "mutate-projection-callarg-sentinel") == 0) {
        int32_t row = fixture.second.arg_start;
        body->call_arg_value_def_op_id[row] = -1;
        body->call_arg_place_kind[row] =
            COLD_EXPR_PLACE_INVALID;
        body->call_arg_ownership[row] =
            COLD_EXPR_OWN_INVALID;
        body->call_arg_origin_id[row] = -1;
    } else if (strcmp(mode, "mutate-wrong-place") == 0) {
        body->op_value_def_place_kind[second] =
            COLD_EXPR_PLACE_STACK_LOCAL;
    } else if (strcmp(mode, "mutate-wrong-parent") == 0) {
        body->op_value_def_origin_id[second] =
            fixture.root_definition;
    } else if (strcmp(mode, "mutate-wrong-current-head") == 0) {
        body->slot_origin_id[fixture.root_slot] = first;
    } else if (strcmp(mode, "mutate-cross-slot") == 0) {
        int32_t cross_slot_source = fixture.first.carrier_op;
        body->op_value_def_origin_id[second] = cross_slot_source;
        body->op_source_value_def_op_id[
            fixture.second.carrier_op] = cross_slot_source;
    } else if (strcmp(mode, "mutate-cycle") == 0) {
        body->op_value_def_origin_id[first] = second;
    } else if (strcmp(mode, "mutate-relocation") == 0) {
        int32_t insert_pos = fixture.first.call_op;
        gate_insert_identity_relocation_probe(
            body, fixture.block, insert_pos, false);
        first++;
        second++;
    } else if (projection_as_root) {
        int32_t root_slot = fixture.root_slot;
        body->op_dst[second] = root_slot;
        body->op_value_def_slot[second] = root_slot;
        body->slot_exact_type_id[root_slot] =
            body->op_value_def_exact_type_id[second];
        body->slot_place_kind[root_slot] =
            COLD_EXPR_PLACE_MEMORY_VERSION;
        body->slot_origin_id[root_slot] = second;
    } else {
        gate_fail("unknown MEMORY_VERSION mutation mode");
    }
    bool definitions_valid =
        cold_exact_call_var_out_definition_valid(
            body, fixture.symbols, first) &&
        cold_exact_call_var_out_definition_valid(
            body, fixture.symbols, second);
    bool current_definition_valid =
        cold_exact_local_current_definition_replace_valid(
            body, fixture.symbols,
            fixture.root, second);
    bool mutates_only_current_head =
        strcmp(mode, "mutate-wrong-current-head") == 0;
    if ((!mutates_only_current_head && definitions_valid) ||
        current_definition_valid ||
        cold_bodyir_exact_identity_schema_valid(
            body, fixture.symbols, mode, false))
        gate_fail("mutated MEMORY_VERSION graph was accepted");
    printf("mutation_rejected=%s\n", mode);
    arena_release(fixture.arena);
}

static void gate_mutation(const char *mode) {
    CallVarOutFixture fixture;
    gate_fixture_init(&fixture, true, false, false);
    BodyIR *body = fixture.caller_body;
    int32_t definition = fixture.definition;
    if (strcmp(mode, "mutate-call") == 0) {
        body->op_a[definition] = fixture.carrier_op;
    } else if (strcmp(mode, "mutate-formal") == 0) {
        body->op_b[definition] = 1;
    } else if (strcmp(mode, "mutate-carrier") == 0) {
        body->op_c[definition] = fixture.call_op;
    } else if (strcmp(mode, "mutate-call-arg") == 0) {
        body->call_arg_slot[fixture.arg_start] =
            fixture.value_slot;
    } else if (strcmp(mode, "mutate-type") == 0) {
        fixture.callee->param_exact_type_id[0]++;
    } else if (strcmp(mode, "mutate-value-type") == 0) {
        body->op_value_def_exact_type_id[definition]++;
    } else if (strcmp(mode, "mutate-producer") == 0) {
        body->op_value_def_producer_function_row[definition]++;
    } else if (strcmp(mode, "mutate-ownership") == 0) {
        body->op_value_def_ownership[definition] =
            COLD_EXPR_OWN_PLAIN;
    } else if (strcmp(mode, "mutate-cfg") == 0) {
        int32_t original_count =
            body->block_op_count[fixture.caller_block];
        int32_t detached_block = body_block(body);
        body->block_op_count[fixture.caller_block] =
            definition -
            body->block_op_start[fixture.caller_block];
        body->block_op_start[detached_block] = definition;
        body->block_op_count[detached_block] =
            original_count -
            body->block_op_count[fixture.caller_block];
    } else {
        gate_fail("unknown mutation mode");
    }
    if (cold_exact_call_var_out_definition_valid(
            body, fixture.symbols, definition) ||
        cold_bodyir_exact_identity_schema_valid(
            body, fixture.symbols, mode, false)) {
        gate_fail("mutated tuple was accepted");
    }
    printf("mutation_rejected=%s\n", mode);
    arena_release(fixture.arena);
}

static void gate_sentinel_mutation(const char *mode) {
    Arena *arena = gate_arena_new();
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, arena);
    Symbols *symbols = compilation.symbols;
    bool borrows_managed =
        strcmp(mode, "borrows-managed-sentinel") == 0;
    int32_t param_kind = SLOT_I32;
    int32_t param_size = 4;
    Span param_type = cold_cstr_span("int32");
    int32_t argument_kind = SLOT_I32;
    int32_t argument_size = 4;
    Span argument_type = cold_cstr_span("int32");
    if (borrows_managed) {
        ObjectDef *receipt = symbols_add_object(
            symbols, cold_cstr_span("SentinelBorrowReceipt"), 1);
        if (!receipt) gate_fail("sentinel receipt registration failed");
        receipt->fields[0].name = cold_cstr_span("text");
        receipt->fields[0].kind = SLOT_STR;
        receipt->fields[0].size = COLD_STR_SLOT_SIZE;
        receipt->fields[0].type_name = cold_cstr_span("str");
        object_finalize_fields(receipt);
        param_kind = SLOT_OBJECT;
        param_size = receipt->slot_size;
        param_type = receipt->name;
        argument_kind = SLOT_OBJECT;
        argument_size = receipt->slot_size;
        argument_type = receipt->name;
    }
    int32_t callee_row = symbols_add_fn(
        symbols, cold_cstr_span("SentinelTarget"), 1,
        &param_kind, &param_size, &param_type,
        cold_cstr_span("bool"));
    int32_t caller_row = symbols_add_fn(
        symbols, cold_cstr_span("SentinelCaller"), 0,
        0, 0, 0, cold_cstr_span(""));
    if (callee_row < 0 || caller_row < 0)
        gate_fail("sentinel function registration failed");
    symbols_set_fn_param_types(
        symbols, callee_row, &param_type, 1);
    cold_publish_exact_formal_type_ids(symbols, callee_row);
    symbols->functions[callee_row].borrows_args =
        borrows_managed;

    BodyIR *body = body_new(arena);
    body->producer_function_row = caller_row;
    body->debug_name = cold_cstr_span("sentinel_caller");
    int32_t block = body_block(body);
    int32_t argument = body_slot(
        body, argument_kind, argument_size);
    body_slot_set_type(body, argument, argument_type);
    if (!borrows_managed) {
        body_op(
            body, BODY_OP_I32_CONST,
            argument, 7, 0);
    }
    int32_t arg_start = body->call_arg_count;
    body_call_arg(body, argument);
    int32_t result = body_slot(body, SLOT_I32, 4);
    int32_t call_op = -1;
    if (strcmp(mode, "orphan-sentinel") != 0) {
        call_op = body_op3(
            body, BODY_OP_CALL_COMPOSITE,
            result, callee_row, arg_start, 1);
    }
    int32_t term = body_term(
        body, BODY_TERM_RET,
        call_op >= 0 ? result : argument,
        0, 0, -1, -1);
    body_end_block(body, block, term);
    if (strcmp(mode, "invalid-target-sentinel") == 0) {
        body->op_a[call_op] = symbols->function_count;
    } else if (strcmp(mode, "invalid-formal-sentinel") == 0) {
        symbols->functions[callee_row].arity = 0;
    } else if (strcmp(mode, "orphan-sentinel") != 0 &&
               !borrows_managed) {
        gate_fail("unknown sentinel mutation mode");
    }
    if (cold_bodyir_exact_identity_schema_valid(
            body, symbols, mode, false)) {
        gate_fail("sentinel mutation was accepted");
    }
    printf("mutation_rejected=%s\n", mode);
    arena_release(arena);
}

int main(int argc, char **argv) {
    if (argc == 1 || strcmp(argv[1], "positive") == 0) {
        gate_positive();
        return 0;
    }
    if (strcmp(argv[1], "bare-version-positive") == 0) {
        gate_bare_version_positive();
        return 0;
    }
    if (strcmp(argv[1], "projection-version-positive") == 0) {
        gate_projection_version_positive();
        return 0;
    }
    if (strcmp(argv[1], "relocation-positive") == 0) {
        gate_relocation_positive();
        return 0;
    }
    if (strcmp(argv[1], "adjacency") == 0) {
        CallVarOutFixture fixture;
        gate_fixture_init(&fixture, false, false, false);
        gate_insert_identity_relocation_probe(
            fixture.caller_body, fixture.caller_block,
            fixture.definition, true);
        fixture.definition++;
        if (cold_exact_call_var_out_definition_valid(
                fixture.caller_body, fixture.symbols,
                fixture.definition)) {
            gate_fail("non-adjacent producer was accepted");
        }
        puts("mutation_rejected=adjacency");
        arena_release(fixture.arena);
        return 0;
    }
    if (strcmp(argv[1], "by-value") == 0) {
        CallVarOutFixture fixture;
        gate_fixture_init(&fixture, true, true, false);
        gate_fail("uninitialized by-value argument was accepted");
    }
    if (strcmp(argv[1], "nested-by-value") == 0) {
        CallVarOutFixture fixture;
        gate_fixture_init(&fixture, true, true, true);
        gate_fail("nested uninitialized by-value argument was accepted");
    }
    if (strcmp(argv[1], "orphan-sentinel") == 0 ||
        strcmp(argv[1], "invalid-target-sentinel") == 0 ||
        strcmp(argv[1], "invalid-formal-sentinel") == 0 ||
        strcmp(argv[1], "borrows-managed-sentinel") == 0) {
        gate_sentinel_mutation(argv[1]);
        return 0;
    }
    if (strcmp(argv[1], "mutate-stale-source") == 0 ||
        strcmp(argv[1], "mutate-forwarded-callarg-sentinel") == 0 ||
        strcmp(argv[1], "mutate-forwarded-carrier-origin") == 0 ||
        strcmp(argv[1], "mutate-projection-callarg-sentinel") == 0 ||
        strcmp(argv[1], "mutate-wrong-place") == 0 ||
        strcmp(argv[1], "mutate-wrong-parent") == 0 ||
        strcmp(argv[1], "mutate-wrong-current-head") == 0 ||
        strcmp(argv[1], "mutate-cross-slot") == 0 ||
        strcmp(argv[1], "mutate-cycle") == 0 ||
        strcmp(argv[1], "mutate-relocation") == 0 ||
        strcmp(argv[1], "mutate-projection-as-root") == 0) {
        gate_version_mutation(argv[1]);
        return 0;
    }
    gate_mutation(argv[1]);
    return 0;
}
