#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

typedef struct GateFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation *compilation;
    BodyIR *body;
    int32_t zero_op;
    int32_t definition;
    int32_t staging_slot;
    int32_t destination_slot;
} GateFixture;

static void gate_fail(const char *message) {
    fprintf(
        stderr,
        "cold_generic_seq_cleanup_exact_identity_gate: %s\n",
        message);
    exit(1);
}

static GateFixture gate_fixture(void) {
    GateFixture fixture;
    memset(&fixture, 0, sizeof(fixture));
    fixture.arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (fixture.arena == MAP_FAILED)
        gate_fail("arena allocation failed");
    memset(fixture.arena, 0, sizeof(Arena));
    fixture.compilation = arena_alloc(
        fixture.arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(
        fixture.compilation, fixture.arena);
    fixture.symbols = fixture.compilation->symbols;

    int32_t function_row = symbols_add_fn(
        fixture.symbols,
        cold_cstr_span("GateGenericCleanup$exact"),
        0, 0, 0, 0, cold_cstr_span("int32"));
    if (function_row < 0)
        gate_fail("function identity missing");

    Span int32_type = cold_cstr_span("int32");
    int32_t int32_kind =
        cold_slot_kind_from_type_with_symbols(
            fixture.symbols, int32_type);
    int32_t int32_size =
        cold_payload_size_from_type_with_symbols(
            fixture.symbols, int32_type,
            int32_kind);
    Span pointer_type = cold_cstr_span("ptr");
    int32_t pointer_kind =
        cold_slot_kind_from_type_with_symbols(
            fixture.symbols, pointer_type);
    int32_t pointer_size =
        cold_payload_size_from_type_with_symbols(
            fixture.symbols, pointer_type,
            pointer_kind);
    if (int32_kind != SLOT_I32 || int32_size != 4 ||
        pointer_kind != SLOT_OPAQUE ||
        pointer_size != 8) {
        gate_fail("canonical scalar layout drifted");
    }

    ObjectDef *header = symbols_add_object(
        fixture.symbols,
        cold_cstr_span("GateSeqHeader"), 3);
    header->fields[0].name = cold_cstr_span("len");
    header->fields[0].type_name = int32_type;
    header->fields[0].kind = int32_kind;
    header->fields[0].size = int32_size;
    header->fields[1].name = cold_cstr_span("cap");
    header->fields[1].type_name = int32_type;
    header->fields[1].kind = int32_kind;
    header->fields[1].size = int32_size;
    header->fields[2].name = cold_cstr_span("buffer");
    header->fields[2].type_name = pointer_type;
    header->fields[2].kind = pointer_kind;
    header->fields[2].size = pointer_size;
    object_finalize_fields(header);

    fixture.body = body_new(fixture.arena);
    fixture.body->producer_function_row = function_row;
    fixture.body->debug_name =
        cold_cstr_span("GateGenericCleanup$exact");
    (void)body_block(fixture.body);

    int32_t zero_len =
        cold_make_i32_const_slot(fixture.body, 0);
    fixture.zero_op = fixture.body->op_count - 1;
    int32_t zero_cap =
        cold_make_i32_const_slot(fixture.body, 0);
    int32_t zero_buffer =
        body_slot(
            fixture.body, pointer_kind,
            pointer_size);
    body_slot_set_type(
        fixture.body, zero_buffer,
        pointer_type);
    body_op3(
        fixture.body, BODY_OP_MAKE_COMPOSITE,
        zero_buffer, 0, -1, 0);

    int32_t payload_start =
        fixture.body->call_arg_count;
    body_call_arg_with_offset(
        fixture.body, zero_len,
        header->fields[0].offset);
    body_call_arg_with_offset(
        fixture.body, zero_cap,
        header->fields[1].offset);
    body_call_arg_with_offset(
        fixture.body, zero_buffer,
        header->fields[2].offset);

    fixture.staging_slot = body_slot(
        fixture.body, SLOT_OBJECT,
        symbols_object_slot_size(header));
    body_slot_set_type(
        fixture.body, fixture.staging_slot,
        header->name);
    int32_t staging_producer = body_op3(
        fixture.body, BODY_OP_MAKE_COMPOSITE,
        fixture.staging_slot, 0,
        payload_start, header->field_count);
    ColdExprResult staging;
    cold_publish_owned_managed_producer(
        fixture.body, fixture.symbols,
        fixture.staging_slot, SLOT_OBJECT,
        staging_producer, &staging);

    Parser parser;
    memset(&parser, 0, sizeof(parser));
    parser.arena = fixture.arena;
    parser.symbols = fixture.symbols;
    ColdExprResult bound =
        cold_emit_exact_default_local_definition(
            &parser, fixture.body, &staging);
    fixture.definition = bound.value_def_op_id;
    fixture.destination_slot = bound.slot;
    return fixture;
}

static int gate_positive(void) {
    GateFixture fixture = gate_fixture();
    cold_rebind_specialized_copy_authority(
        fixture.body, fixture.symbols);
    int32_t exact_type_id =
        cold_exact_managed_type_id(
            fixture.symbols, fixture.body,
            fixture.destination_slot, SLOT_OBJECT);
    if (fixture.definition < 0 ||
        fixture.body->op_source_value_def_op_id[
            fixture.definition] != -1 ||
        fixture.body->op_value_def_exact_type_id[
            fixture.definition] != exact_type_id ||
        fixture.body->op_value_def_producer_function_row[
            fixture.definition] !=
            fixture.body->producer_function_row ||
        fixture.body->op_value_def_place_kind[
            fixture.definition] !=
            COLD_EXPR_PLACE_STACK_LOCAL ||
        fixture.body->op_value_def_consume_op_index_plus_one[
            fixture.definition] != 0 ||
        !cold_exact_slot_authority_is_sentinel(
            fixture.body, fixture.staging_slot)) {
        gate_fail("neutral root identity drifted");
    }

    /* LocalSlot metadata is the final physical slot state, not historical
       ownership authority.  Advancing it must not invalidate the immutable
       neutral definition that specialization is currently rebinding. */
    fixture.body->slot_place_kind[
        fixture.destination_slot] =
            COLD_EXPR_PLACE_MEMORY_VERSION;
    fixture.body->slot_origin_id[
        fixture.destination_slot] =
            fixture.definition;
    cold_rebind_specialized_copy_authority(
        fixture.body, fixture.symbols);
    fixture.body->slot_place_kind[
        fixture.destination_slot] =
            COLD_EXPR_PLACE_STACK_LOCAL;
    fixture.body->slot_origin_id[
        fixture.destination_slot] =
            fixture.destination_slot;

    int32_t parameter_kind = SLOT_OBJECT;
    int32_t parameter_size =
        fixture.body->slot_size[
            fixture.destination_slot];
    Span parameter_type =
        fixture.body->slot_type[
            fixture.destination_slot];
    int32_t callee_row = symbols_add_fn(
        fixture.symbols,
        cold_cstr_span("GateConsumePlainHeader"),
        1, &parameter_kind, &parameter_size,
        &parameter_type, cold_cstr_span("int32"));
    if (callee_row < 0)
        gate_fail("plain callee identity missing");
    symbols_set_fn_param_types(
        fixture.symbols, callee_row,
        &parameter_type, 1);
    cold_publish_exact_formal_type_ids(
        fixture.symbols, callee_row);
    FnDef *callee =
        &fixture.symbols->functions[callee_row];
    if (callee->param_exact_type_id[0] !=
            exact_type_id ||
        callee->borrows_args) {
        gate_fail("plain callee TypeId drifted");
    }

    ColdExprResult root;
    if (!cold_specialized_exact_result_at(
            fixture.body, fixture.symbols,
            fixture.definition,
            &root)) {
        gate_fail("plain call root is not exact");
    }
    int32_t arg_start =
        fixture.body->call_arg_count;
    int32_t row = body_call_arg(
        fixture.body,
        fixture.destination_slot);
    cold_bind_parsed_call_arg_authority(
        fixture.body, row, &root);
    cold_materialize_exact_borrow_call_args(
        fixture.body, fixture.symbols,
        callee, arg_start, 1);
    int32_t call_result =
        body_slot(fixture.body, SLOT_I32, 4);
    body_slot_set_type(
        fixture.body, call_result,
        cold_cstr_span("int32"));
    int32_t call_op = body_op3(
        fixture.body, BODY_OP_CALL_COMPOSITE,
        call_result, callee_row, arg_start, 1);
    Parser parser;
    memset(&parser, 0, sizeof(parser));
    parser.arena = fixture.arena;
    parser.symbols = fixture.symbols;
    int32_t temporary_sources[
        COLD_MAX_I32_PARAMS];
    int32_t temporary_count =
        cold_prepare_exact_call_arg_transfers(
            &parser, fixture.body,
            fixture.symbols, callee,
            call_op, arg_start, 1,
            temporary_sources,
            COLD_MAX_I32_PARAMS);
    if (fixture.body->call_arg_value_def_op_id[row] != -1 ||
        fixture.body->call_arg_place_kind[row] !=
            COLD_EXPR_PLACE_INVALID ||
        fixture.body->call_arg_ownership[row] !=
            COLD_EXPR_OWN_INVALID ||
        fixture.body->call_arg_origin_id[row] != -1 ||
        fixture.body->op_value_def_consume_op_index_plus_one[
            fixture.definition] != 0 ||
        temporary_count != 0) {
        gate_fail("plain by-value call became an ownership transfer");
    }
    puts("cold_generic_seq_cleanup_exact_identity_unit=pass");
    return 0;
}

static int gate_negative(void) {
    GateFixture fixture = gate_fixture();
    fixture.body->op_a[fixture.zero_op] = 1;
    cold_rebind_specialized_copy_authority(
        fixture.body, fixture.symbols);
    gate_fail("non-neutral source-less copy was accepted");
    return 1;
}

int main(int argc, char **argv) {
    if (argc == 2 &&
        strcmp(argv[1], "unit-positive") == 0) {
        return gate_positive();
    }
    if (argc == 2 &&
        strcmp(argv[1], "unit-negative") == 0) {
        return gate_negative();
    }
    return cheng_cold_embedded_main(argc, argv);
}
