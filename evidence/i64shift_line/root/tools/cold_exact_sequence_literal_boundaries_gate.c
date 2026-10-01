#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

typedef struct SequenceBoundaryFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation compilation;
    Parser parser;
    BodyIR *body;
    Locals locals;
    int32_t caller_row;
    int32_t block;
} SequenceBoundaryFixture;

static void gate_fail(const char *message) {
    fprintf(
        stderr,
        "cold_exact_sequence_literal_boundaries_gate: %s\n",
        message);
    exit(1);
}

static void gate_fixture_init(
        SequenceBoundaryFixture *fixture,
        const char *name) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (fixture->arena == MAP_FAILED)
        gate_fail("arena owner allocation failed");
    cold_harness_compilation_begin(
        &fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation.symbols;
    fixture->caller_row = symbols_add_fn(
        fixture->symbols, cold_cstr_span(name),
        0, 0, 0, 0, cold_cstr_span("int32"));
    if (fixture->caller_row < 0)
        gate_fail("caller registration failed");
    fixture->body = body_new(fixture->arena);
    fixture->body->producer_function_row =
        fixture->caller_row;
    fixture->body->debug_name = cold_cstr_span(name);
    fixture->body->return_kind = SLOT_I32;
    fixture->body->return_type =
        cold_cstr_span("int32");
    fixture->block = body_block(fixture->body);
    locals_init(&fixture->locals, fixture->arena);
    fixture->parser = cold_parser_issue_legacy_span(
        fixture->symbols, cold_cstr_span("[3, 5]"));
}

static int32_t gate_parse_staging(
        SequenceBoundaryFixture *fixture) {
    int32_t kind = SLOT_I32;
    ColdExprResult parsed;
    cold_expr_result_reset(&parsed);
    int32_t slot = cold_parse_expr_with_result(
        &fixture->parser, fixture->body,
        &fixture->locals, &kind, &parsed);
    if (fixture->parser.pos !=
            fixture->parser.source.len ||
        kind != SLOT_ARRAY_I32 ||
        parsed.value_def_op_id != -1) {
        gate_fail("fixed-array staging shape drifted");
    }
    return slot;
}

static ColdExprResult gate_materialize(
        SequenceBoundaryFixture *fixture,
        int32_t staging_slot,
        int32_t *slot_out) {
    ColdExprResult result;
    int32_t kind = SLOT_ARRAY_I32;
    int32_t slot =
        cold_materialize_exact_i32_sequence_literal(
            fixture->body, fixture->symbols,
            staging_slot, cold_cstr_span("int32[]"),
            &kind, &result);
    if (kind != SLOT_SEQ_I32 ||
        result.slot != slot ||
        result.kind != kind ||
        result.value_def_op_id < 0 ||
        fixture->body->slot_aux[slot] != 0 ||
        !cold_exact_i32_sequence_literal_tuple_valid(
            fixture->body,
            result.value_def_op_id) ||
        !cold_exact_op_tuple_matches_result(
            fixture->body, &result)) {
        gate_fail("unified materializer lost exact authority");
    }
    *slot_out = slot;
    return result;
}

static void gate_close_i32(
        SequenceBoundaryFixture *fixture) {
    int32_t zero = body_slot(
        fixture->body, SLOT_I32, 4);
    body_slot_set_type(
        fixture->body, zero,
        cold_cstr_span("int32"));
    body_op(
        fixture->body, BODY_OP_I32_CONST,
        zero, 0, 0);
    ColdExprResult scalar;
    cold_expr_result_reset(&scalar);
    cold_finish_exact_function_return(
        &fixture->parser, fixture->body,
        &fixture->locals, zero, SLOT_I32,
        &scalar, false);
}

static void gate_local_positive(void) {
    SequenceBoundaryFixture fixture;
    gate_fixture_init(
        &fixture, "sequence_literal_local");
    int32_t staging = gate_parse_staging(&fixture);
    int32_t sequence = -1;
    ColdExprResult produced =
        gate_materialize(
            &fixture, staging, &sequence);
    ColdExprResult bound =
        cold_emit_exact_bind_local_move(
            fixture.body, fixture.symbols, &produced);
    locals_add(
        &fixture.locals,
        cold_cstr_span("offsets"),
        bound.slot, bound.kind);
    Local *local = locals_find(
        &fixture.locals,
        cold_cstr_span("offsets"));
    if (!local)
        gate_fail("local binding registration failed");
    local->value_def_op_id =
        bound.value_def_op_id;
    if (fixture.body->
            op_value_def_consume_op_index_plus_one[
                produced.value_def_op_id] !=
            bound.value_def_op_id + 1 ||
        fixture.body->slot_aux[bound.slot] != 0) {
        gate_fail("local binding lost sequence count/consume");
    }
    gate_close_i32(&fixture);
    if (!cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "sequence-literal-local")) {
        gate_fail("local boundary schema rejected");
    }
    cold_harness_compilation_end(
        &fixture.compilation, false);
    arena_release(fixture.arena);
}

static void gate_return_positive(void) {
    SequenceBoundaryFixture fixture;
    gate_fixture_init(
        &fixture, "sequence_literal_return");
    fixture.body->return_kind = SLOT_SEQ_I32;
    fixture.body->return_type =
        cold_cstr_span("int32[]");
    int32_t staging = gate_parse_staging(&fixture);
    ColdExprResult sentinel;
    cold_expr_result_reset(&sentinel);
    cold_finish_exact_function_return(
        &fixture.parser, fixture.body,
        &fixture.locals, staging, SLOT_ARRAY_I32,
        &sentinel, false);
    if (fixture.body->term_count != 1 ||
        fixture.body->term_kind[0] != BODY_TERM_RET ||
        fixture.body->term_source_value_def_op_id[0] < 0 ||
        !cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "sequence-literal-return")) {
        gate_fail("return boundary lost exact transfer");
    }
    cold_harness_compilation_end(
        &fixture.compilation, false);
    arena_release(fixture.arena);
}

static void gate_call_positive(void) {
    SequenceBoundaryFixture fixture;
    gate_fixture_init(
        &fixture, "sequence_literal_call");
    int32_t staging = gate_parse_staging(&fixture);
    int32_t param_kind = SLOT_SEQ_I32;
    int32_t param_size = 16;
    Span param_type = cold_cstr_span("int32[]");
    int32_t callee = symbols_add_fn(
        fixture.symbols,
        cold_cstr_span("consumeOffsets"),
        1, &param_kind, &param_size, &param_type,
        cold_cstr_span("int32"));
    if (callee < 0)
        gate_fail("callee registration failed");
    symbols_set_fn_param_types(
        fixture.symbols, callee,
        &param_type, 1);
    int32_t arg_start =
        fixture.body->call_arg_count;
    body_call_arg(fixture.body, staging);
    FnDef *fn =
        &fixture.symbols->functions[callee];
    if (!cold_contextualize_sequence_arg(
            fixture.body, fixture.symbols, fn,
            arg_start, 0, false, false)) {
        gate_fail("call argument was not contextualized");
    }
    int32_t row = arg_start;
    int32_t definition =
        fixture.body->
            call_arg_value_def_op_id[row];
    if (definition < 0)
        gate_fail("call argument definition missing");
    fn = &fixture.symbols->functions[callee];
    fn->param_exact_type_id[0] =
        fixture.body->
            op_value_def_exact_type_id[definition];
    int32_t result = body_slot(
        fixture.body, SLOT_I32, 4);
    body_slot_set_type(
        fixture.body, result,
        cold_cstr_span("int32"));
    int32_t call = body_op3(
        fixture.body, BODY_OP_CALL_COMPOSITE,
        result, callee, arg_start, 1);
    int32_t temporary_sources[COLD_MAX_I32_PARAMS];
    int32_t temporary_count =
        cold_prepare_exact_call_arg_transfers(
            &fixture.parser, fixture.body,
            fixture.symbols, fn, call,
            arg_start, 1, temporary_sources,
            COLD_MAX_I32_PARAMS);
    if (temporary_count != 0)
        gate_fail("call argument cleanup set drifted");
    int32_t term = body_term(
        fixture.body, BODY_TERM_RET,
        result, -1, 0, -1, -1);
    body_end_block(
        fixture.body, fixture.block, term);
    if (fixture.body->
            op_value_def_consume_op_index_plus_one[
                definition] != call + 1 ||
        !cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "sequence-literal-call")) {
        gate_fail("call boundary schema rejected");
    }
    cold_harness_compilation_end(
        &fixture.compilation, false);
    arena_release(fixture.arena);
}

static void gate_field_positive(void) {
    SequenceBoundaryFixture fixture;
    gate_fixture_init(
        &fixture, "sequence_literal_field");
    ObjectDef *owner = symbols_add_object(
        fixture.symbols,
        cold_cstr_span("SequenceFieldOwner"), 1);
    owner->fields[0].name =
        cold_cstr_span("offsets");
    owner->fields[0].kind = SLOT_SEQ_I32;
    owner->fields[0].size = 16;
    owner->fields[0].type_name =
        cold_cstr_span("int32[]");
    object_finalize_fields(owner);
    int32_t base_kind = SLOT_OBJECT;
    ColdExprResult base_default;
    cold_expr_result_reset(&base_default);
    (void)cold_parser_default_slot(
        &fixture.parser, fixture.body,
        &fixture.locals, owner->name,
        &base_kind, &base_default);
    ColdExprResult base_source =
        cold_emit_exact_default_local_definition(
            &fixture.parser, fixture.body,
            &base_default);
    int32_t base = base_source.slot;
    int32_t staging = gate_parse_staging(&fixture);
    int32_t value_kind = SLOT_ARRAY_I32;
    ColdExprResult value;
    cold_expr_result_reset(&value);
    int32_t sequence =
        cold_coerce_object_field_value(
            &fixture.parser, fixture.body,
            &owner->fields[0], staging,
            &value_kind, &value);
    int32_t store =
        cold_emit_exact_managed_field_replace(
            &fixture.parser, fixture.body,
            owner, base, &owner->fields[0],
            sequence, value_kind, 16,
            &base_source, &value);
    if (fixture.body->op_source_value_def_op_id[
            store] != value.value_def_op_id) {
        gate_fail("field boundary consume edge missing");
    }
    gate_close_i32(&fixture);
    if (!cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "sequence-literal-field")) {
        gate_fail("field boundary schema rejected");
    }
    cold_harness_compilation_end(
        &fixture.compilation, false);
    arena_release(fixture.arena);
}

static void gate_positive(void) {
    gate_local_positive();
    gate_return_positive();
    gate_call_positive();
    gate_field_positive();
    puts("cold_exact_sequence_literal_boundaries_gate_status=pass");
    puts("local_binding=1");
    puts("function_return=1");
    puts("call_argument=1");
    puts("field_store=1");
}

static void gate_schema_mutation(const char *mode) {
    SequenceBoundaryFixture fixture;
    gate_fixture_init(
        &fixture, "sequence_literal_mutation");
    int32_t staging = gate_parse_staging(&fixture);
    int32_t sequence = -1;
    ColdExprResult produced =
        gate_materialize(
            &fixture, staging, &sequence);
    if (strcmp(mode, "local-definition") == 0) {
        produced.value_def_op_id = -1;
        (void)cold_emit_exact_bind_local_move(
            fixture.body, fixture.symbols, &produced);
        gate_fail("local definition mutation was accepted");
    }
    if (strcmp(mode, "sequence-aux") == 0) {
        fixture.body->slot_aux[sequence]++;
    } else if (strcmp(mode, "staging-aux") == 0) {
        fixture.body->slot_aux[staging]++;
    } else if (strcmp(mode, "producer-type") == 0) {
        fixture.body->op_value_def_exact_type_id[
            produced.value_def_op_id]++;
    } else {
        gate_fail("unknown schema mutation");
    }
    int32_t term = body_term(
        fixture.body, BODY_TERM_RET,
        -1, -1, 0, -1, -1);
    body_end_block(
        fixture.body, fixture.block, term);
    if (!cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "sequence-literal-mutation")) {
        exit(1);
    }
    gate_fail("sequence tuple mutation was accepted");
}

static void gate_call_mutation(const char *mode) {
    SequenceBoundaryFixture fixture;
    gate_fixture_init(
        &fixture, "sequence_literal_call_mutation");
    int32_t staging = gate_parse_staging(&fixture);
    int32_t param_kind = SLOT_SEQ_I32;
    int32_t param_size = 16;
    Span param_type = cold_cstr_span("int32[]");
    int32_t callee = symbols_add_fn(
        fixture.symbols,
        cold_cstr_span("consumeOffsetsMutation"),
        1, &param_kind, &param_size, &param_type,
        cold_cstr_span("int32"));
    symbols_set_fn_param_types(
        fixture.symbols, callee,
        &param_type, 1);
    int32_t arg_start =
        fixture.body->call_arg_count;
    body_call_arg(fixture.body, staging);
    FnDef *fn =
        &fixture.symbols->functions[callee];
    (void)cold_contextualize_sequence_arg(
        fixture.body, fixture.symbols, fn,
        arg_start, 0, false, false);
    int32_t definition =
        fixture.body->
            call_arg_value_def_op_id[arg_start];
    fn = &fixture.symbols->functions[callee];
    fn->param_exact_type_id[0] =
        fixture.body->
            op_value_def_exact_type_id[definition];
    int32_t result = body_slot(
        fixture.body, SLOT_I32, 4);
    body_slot_set_type(
        fixture.body, result,
        cold_cstr_span("int32"));
    int32_t call = body_op3(
        fixture.body, BODY_OP_CALL_COMPOSITE,
        result, callee, arg_start, 1);
    int32_t temporary_sources[COLD_MAX_I32_PARAMS];
    (void)cold_prepare_exact_call_arg_transfers(
        &fixture.parser, fixture.body,
        fixture.symbols, fn, call,
        arg_start, 1, temporary_sources,
        COLD_MAX_I32_PARAMS);
    int32_t term = body_term(
        fixture.body, BODY_TERM_RET,
        result, -1, 0, -1, -1);
    body_end_block(
        fixture.body, fixture.block, term);
    if (strcmp(mode, "call-value-def") == 0) {
        fixture.body->
            call_arg_value_def_op_id[arg_start] = -1;
    } else if (strcmp(mode, "call-formal-type") == 0) {
        fn->param_exact_type_id[0]++;
    } else if (strcmp(mode, "call-consume") == 0) {
        fixture.body->
            op_value_def_consume_op_index_plus_one[
                definition] = 0;
    } else {
        gate_fail("unknown call mutation");
    }
    if (!cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "sequence-literal-call-mutation")) {
        exit(1);
    }
    gate_fail("call argument mutation was accepted");
}

int main(int argc, char **argv) {
    if (argc == 1 ||
        strcmp(argv[1], "positive") == 0) {
        gate_positive();
        return 0;
    }
    if (strncmp(argv[1], "call-", 5) == 0) {
        gate_call_mutation(argv[1]);
        return 0;
    }
    gate_schema_mutation(argv[1]);
    return 0;
}
