#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

typedef struct ManagedFieldSequenceFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation compilation;
    Parser parser;
    BodyIR *body;
    Locals locals;
    ObjectDef *owner;
    ObjectField *field;
    int32_t block;
    int32_t base_slot;
    ColdExprResult base_result;
    int32_t value_slot;
    int32_t value_kind;
    ColdExprResult value_result;
} ManagedFieldSequenceFixture;

static void gate_fail(const char *message) {
    fprintf(
        stderr,
        "cold_managed_field_sequence_literal_gate: %s\n",
        message);
    exit(1);
}

static void gate_fixture_init(
        ManagedFieldSequenceFixture *fixture) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (fixture->arena == MAP_FAILED)
        gate_fail("arena allocation failed");
    memset(fixture->arena, 0, sizeof(Arena));
    cold_harness_compilation_begin(
        &fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation.symbols;
    fixture->owner = symbols_add_object(
        fixture->symbols,
        cold_cstr_span("ManagedFieldSequenceOwner"), 1);
    fixture->field = &fixture->owner->fields[0];
    fixture->field->name =
        cold_cstr_span("functionWordOffsets");
    fixture->field->kind = SLOT_SEQ_I32;
    fixture->field->size = 16;
    fixture->field->type_name =
        cold_cstr_span("int32[]");
    object_finalize_fields(fixture->owner);

    int32_t caller_row = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("ManagedFieldSequenceCaller"),
        0, 0, 0, 0, cold_cstr_span("int32"));
    if (caller_row < 0)
        gate_fail("caller registration failed");
    fixture->body = body_new(fixture->arena);
    fixture->body->producer_function_row = caller_row;
    fixture->body->debug_name =
        cold_cstr_span("managed_field_sequence_literal");
    fixture->block = body_block(fixture->body);
    locals_init(&fixture->locals, fixture->arena);
    fixture->parser = cold_parser_issue_legacy_span(
        fixture->symbols, cold_cstr_span(""));
    int32_t base_kind = SLOT_I32;
    ColdExprResult base_staging;
    cold_expr_result_reset(&base_staging);
    (void)cold_parser_default_slot(
        &fixture->parser, fixture->body,
        &fixture->locals, fixture->owner->name,
        &base_kind, &base_staging);
    fixture->base_result =
        cold_emit_exact_default_local_definition(
            &fixture->parser, fixture->body,
            &base_staging);
    fixture->base_slot = fixture->base_result.slot;
    fixture->parser = cold_parser_issue_legacy_span(
        fixture->symbols, cold_cstr_span("[0]"));
    fixture->value_kind = SLOT_I32;
    cold_expr_result_reset(&fixture->value_result);
    fixture->value_slot = cold_parse_expr_with_result(
        &fixture->parser, fixture->body,
        &fixture->locals, &fixture->value_kind,
        &fixture->value_result);
    if (fixture->parser.pos != fixture->parser.source.len ||
        fixture->value_kind != SLOT_ARRAY_I32 ||
        fixture->value_result.value_def_op_id != -1) {
        gate_fail("literal staging shape drifted");
    }
    fixture->value_slot = cold_coerce_object_field_value(
        &fixture->parser, fixture->body,
        fixture->field, fixture->value_slot,
        &fixture->value_kind,
        &fixture->value_result);
    if (fixture->value_kind != SLOT_SEQ_I32 ||
        fixture->value_result.slot !=
            fixture->value_slot ||
        fixture->value_result.kind != SLOT_SEQ_I32 ||
        fixture->value_result.value_def_op_id < 0 ||
        !cold_exact_op_tuple_matches_result(
            fixture->body,
            &fixture->value_result)) {
        gate_fail("coercion did not publish exact ownership");
    }
}

static void gate_positive(void) {
    ManagedFieldSequenceFixture fixture;
    gate_fixture_init(&fixture);
    int32_t definition =
        fixture.value_result.value_def_op_id;
    int32_t store =
        cold_emit_exact_managed_field_replace(
            &fixture.parser, fixture.body,
            fixture.owner, fixture.base_slot,
            fixture.field, fixture.value_slot,
            fixture.value_kind, fixture.field->size,
            &fixture.base_result,
            &fixture.value_result);
    if (fixture.body->op_kind[definition] !=
            BODY_OP_MAKE_SEQ_I32 ||
        fixture.body->op_value_def_ownership[
            definition] != COLD_EXPR_OWN_MOVE ||
        fixture.body->op_source_value_def_op_id[
            store] != definition ||
        fixture.body->op_value_def_consume_op_index_plus_one[
            definition] != store + 1) {
        gate_fail("field store lost exact consume edge");
    }
    int32_t result =
        cold_make_i32_const_slot(fixture.body, 0);
    int32_t term = body_term(
        fixture.body, BODY_TERM_RET,
        result, -1, 0, -1, -1);
    body_end_block(
        fixture.body, fixture.block, term);
    if (!cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "managed-field-sequence-literal")) {
        gate_fail("exact schema rejected field store");
    }
    puts("cold_managed_field_sequence_literal_gate_status=pass");
    puts("literal_to_sequence_definition=1");
    puts("field_store_consume_edge=1");
    cold_harness_compilation_end(
        &fixture.compilation, false);
    arena_release(fixture.arena);
}

static void gate_mutation(const char *mode) {
    ManagedFieldSequenceFixture fixture;
    gate_fixture_init(&fixture);
    int32_t definition =
        fixture.value_result.value_def_op_id;
    if (strcmp(mode, "missing-definition") == 0) {
        fixture.value_result.value_def_op_id = -1;
    } else if (strcmp(mode, "ownership") == 0) {
        fixture.value_result.ownership =
            COLD_EXPR_OWN_INVALID;
    } else if (strcmp(mode, "type-id") == 0) {
        fixture.body->op_value_def_exact_type_id[
            definition]++;
    } else if (strcmp(mode, "producer-slot") == 0) {
        fixture.body->op_value_def_slot[
            definition] = fixture.base_slot;
    } else {
        gate_fail("unknown mutation");
    }
    (void)cold_emit_exact_managed_field_replace(
        &fixture.parser, fixture.body,
        fixture.owner, fixture.base_slot,
        fixture.field, fixture.value_slot,
        fixture.value_kind, fixture.field->size,
        &fixture.base_result,
        &fixture.value_result);
    gate_fail("mutated RHS authority was accepted");
}

int main(int argc, char **argv) {
    if (argc == 1 || strcmp(argv[1], "positive") == 0) {
        gate_positive();
        return 0;
    }
    gate_mutation(argv[1]);
    return 0;
}
