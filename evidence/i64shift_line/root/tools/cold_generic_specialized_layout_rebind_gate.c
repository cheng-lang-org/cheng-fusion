#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

enum GateOpRow {
    GATE_OP_PARAM_MARKER = 0,
    GATE_OP_MAKE_SEQ,
    GATE_OP_SEQ_INDEX,
    GATE_OP_SEQ_INDEX_REF,
    GATE_OP_SEQ_STORE,
    GATE_OP_SEQ_ADD,
    GATE_OP_SEQ_REMOVE,
    GATE_OP_SEQ_SET_LEN,
    GATE_OP_COPY_FIRST,
    GATE_OP_COPY_SECOND,
    GATE_OP_NESTED_CALL_FIRST,
    GATE_OP_NESTED_CALL_SECOND,
    GATE_OP_COUNT
};

enum GateManagedOpRow {
    GATE_MANAGED_OP_PARAM_MARKER = 0,
    GATE_MANAGED_OP_COPY,
    GATE_MANAGED_OP_NESTED_CALL,
    GATE_MANAGED_OP_COUNT
};

enum GateSubwordOpRow {
    GATE_SUBWORD_OP_PARAM_MARKER = 0,
    GATE_SUBWORD_OP_ARRAY_INDEX,
    GATE_SUBWORD_OP_ARRAY_INDEX_REF,
    GATE_SUBWORD_OP_COUNT
};

typedef struct GateFixture {
    Arena *arena;
    ColdSourceSnapshotTable source_snapshot;
    ColdHarnessCompilation compilation;
    Span source;
    Symbols *symbols;
    Parser parser;
    ColdFunctionBodyStore body_store;
    BodyIR *template_body;
    BodyIR *managed_template_body;
    BodyIR *subword_template_body;
    int32_t template_function_row;
    int32_t managed_template_function_row;
    int32_t subword_template_function_row;
    int32_t nested_template_function_row;
    int32_t raw_parameter_slot;
    int32_t sequence_slot;
    int32_t sequence_literal_payload_slot;
    int32_t value_slot;
    int32_t sequence_value_slot;
    int32_t value_ref_slot;
    int32_t index_slot;
    int32_t array_slot;
    int32_t array_value_slot;
    int32_t array_ref_value_slot;
    int32_t copy_first_slot;
    int32_t copy_second_slot;
    int32_t trailing_slot;
    int32_t nested_result_first_slot;
    int32_t nested_result_second_slot;
    int32_t managed_raw_parameter_slot;
    int32_t managed_value_slot;
    int32_t managed_copy_slot;
    int32_t managed_result_slot;
    int32_t managed_index_slot;
    int32_t subword_raw_parameter_slot;
    int32_t adjacent_object_row;
    int32_t target_object_row;
    int32_t adjacent_variant_row;
    int32_t target_variant_row;
} GateFixture;

typedef struct GateCase {
    const char *name;
    Span type;
    int32_t element_size;
    Span adjacent_type;
} GateCase;

typedef struct GateSpecializedOpRows {
    int32_t make_seq;
    int32_t seq_index;
    int32_t seq_index_ref;
    int32_t seq_store;
    int32_t seq_add;
    int32_t seq_remove;
    int32_t seq_set_len;
    int32_t copy_first;
    int32_t copy_second;
    int32_t nested_call_first;
    int32_t nested_call_second;
} GateSpecializedOpRows;

static void gate_fail(const char *message) {
    fprintf(
        stderr,
        "cold_generic_specialized_layout_rebind_gate: %s\n",
        message);
    exit(1);
}

static GateSpecializedOpRows gate_specialized_op_rows(
        GateFixture *fixture, BodyIR *body,
        int32_t sequence_kind) {
    if (!fixture || !body)
        gate_fail("specialized op row lookup input invalid");
    int32_t literal_growth =
        sequence_kind == SLOT_SEQ_I32 ? 1 : 0;
    if (sequence_kind != SLOT_SEQ_I32 &&
        sequence_kind != SLOT_SEQ_OPAQUE) {
        gate_fail("specialized op row lookup sequence kind invalid");
    }
    if (body->op_count != GATE_OP_COUNT + literal_growth) {
        gate_fail("specialized op row count drifted");
    }
    GateSpecializedOpRows rows = {
        GATE_OP_MAKE_SEQ + literal_growth,
        GATE_OP_SEQ_INDEX + literal_growth,
        GATE_OP_SEQ_INDEX_REF + literal_growth,
        GATE_OP_SEQ_STORE + literal_growth,
        GATE_OP_SEQ_ADD + literal_growth,
        GATE_OP_SEQ_REMOVE + literal_growth,
        GATE_OP_SEQ_SET_LEN + literal_growth,
        GATE_OP_COPY_FIRST + literal_growth,
        GATE_OP_COPY_SECOND + literal_growth,
        GATE_OP_NESTED_CALL_FIRST + literal_growth,
        GATE_OP_NESTED_CALL_SECOND + literal_growth
    };
    if (sequence_kind == SLOT_SEQ_I32) {
        int32_t staging = rows.make_seq - 1;
        int32_t staging_slot = body->op_a[rows.make_seq];
        if (body->op_kind[staging] != BODY_OP_MAKE_COMPOSITE ||
            body->op_dst[staging] != staging_slot ||
            body->op_a[staging] != 0 ||
            body->op_b[staging] < 0 ||
            body->op_c[staging] != 1 ||
            body->op_kind[rows.make_seq] !=
                BODY_OP_MAKE_SEQ_I32 ||
            body->op_dst[rows.make_seq] !=
                fixture->sequence_slot ||
            body->op_b[rows.make_seq] != -1 ||
            body->op_c[rows.make_seq] != 1 ||
            !cold_exact_i32_sequence_literal_tuple_valid(
                body, rows.make_seq)) {
            gate_fail("canonical int32 sequence literal tuple drifted");
        }
    } else if (
        body->op_kind[rows.make_seq] !=
            BODY_OP_MAKE_SEQ_OPAQUE ||
        body->op_dst[rows.make_seq] !=
            fixture->sequence_slot) {
        gate_fail("canonical opaque sequence literal tuple drifted");
    }
    return rows;
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

static int gate_create_temp_file(
        char *path, size_t path_cap,
        const char *stem) {
    const char *temp_root =
        getenv("TMPDIR");
    if (!path || path_cap == 0 ||
        !stem || stem[0] == '\0' ||
        !temp_root || temp_root[0] == '\0') {
        gate_fail("canonical temporary directory is missing");
    }
    char canonical_root[PATH_MAX];
    if (!realpath(
            temp_root, canonical_root)) {
        gate_fail("temporary directory canonicalization failed");
    }
    int written = snprintf(
        path, path_cap, "%s/%s.XXXXXX",
        canonical_root, stem);
    if (written <= 0 ||
        (size_t)written >= path_cap) {
        gate_fail("temporary file path is too long");
    }
    return mkstemp(path);
}

static int32_t gate_find_function_declaration(
        GateFixture *fixture, const char *name) {
    if (!fixture || !fixture->symbols ||
        !fixture->source.ptr || fixture->source.len <= 0 ||
        !name || name[0] == '\0') {
        gate_fail("function declaration lookup input invalid");
    }
    int32_t found = -1;
    int32_t pos = 0;
    int32_t line_no = 0;
    bool in_triple = false;
    while (pos < fixture->source.len) {
        int32_t start = pos;
        while (pos < fixture->source.len &&
               fixture->source.ptr[pos] != '\n') {
            pos++;
        }
        int32_t end = pos;
        if (pos < fixture->source.len) pos++;
        line_no++;
        Span line = span_sub(
            fixture->source, start, end);
        if (in_triple) {
            if (cold_line_has_triple_quote(line))
                in_triple = false;
            continue;
        }
        if (!cold_line_top_level(line)) {
            if (cold_line_has_triple_quote(line))
                in_triple = true;
            continue;
        }
        ColdFunctionSymbol symbol;
        if (!cold_parse_function_symbol_at(
                fixture->source, start, line_no,
                &symbol, fixture->symbols) ||
            !span_eq(symbol.name, name)) {
            continue;
        }
        if (found >= 0)
            gate_fail("function declaration identity is ambiguous");
        if (symbol.module_source_row != 0 ||
            symbol.token_byte_offset < 0) {
            gate_fail("function declaration lacks source identity");
        }
        found = symbol.token_byte_offset;
    }
    if (found < 0)
        gate_fail("function declaration identity is missing");
    return found;
}

static void gate_parse_source_types(
        GateFixture *fixture) {
    if (!fixture || !fixture->symbols ||
        !fixture->source.ptr ||
        fixture->source.len <= 0) {
        gate_fail("source type parser input invalid");
    }
    Parser parser = cold_parser_issue_legacy_span(
        fixture->symbols, fixture->source);
    while (parser.pos < fixture->source.len) {
        int32_t line_start = parser.pos;
        while (line_start < fixture->source.len &&
               (fixture->source.ptr[line_start] == '\n' ||
                fixture->source.ptr[line_start] == '\r')) {
            line_start++;
        }
        if (line_start >= fixture->source.len)
            break;
        int32_t line_end = line_start;
        while (line_end < fixture->source.len &&
               fixture->source.ptr[line_end] != '\n') {
            line_end++;
        }
        Span line = span_sub(
            fixture->source, line_start, line_end);
        Span trimmed = span_trim(line);
        if (cold_line_top_level(line) &&
            cold_span_is_exact_or_prefix_space(
                trimmed, "type")) {
            parser.pos = line_start;
            parse_type(&parser);
        } else {
            parser.pos =
                line_end < fixture->source.len
                    ? line_end + 1 : line_end;
        }
    }
}

static ObjectDef *gate_add_plain_object(
        GateFixture *fixture, const char *name,
        int32_t field_count, int32_t field_kind,
        int32_t field_size, const char *field_type) {
    ObjectDef *object = symbols_add_object(
        fixture->symbols, cold_cstr_span(name),
        field_count);
    for (int32_t field = 0; field < field_count; field++) {
        char field_name[32];
        snprintf(
            field_name, sizeof(field_name),
            "field%d", field);
        object->fields[field].name =
            cold_arena_span_copy(
                fixture->arena,
                cold_cstr_span(field_name));
        object->fields[field].kind = field_kind;
        object->fields[field].size = field_size;
        object->fields[field].type_name =
            cold_cstr_span(field_type);
    }
    object_finalize_fields(object);
    return object;
}

static TypeDef *gate_add_variant(
        GateFixture *fixture, const char *type_name,
        const char *variant_name) {
    TypeDef *type = symbols_add_type(
        fixture->symbols, cold_cstr_span(type_name), 1);
    Variant *variant = &type->variants[0];
    variant->name = cold_cstr_span(variant_name);
    variant->tag = 0;
    cold_variant_fields_allocate(
        fixture->symbols, variant, 1);
    variant->field_kind[0] = SLOT_I64;
    variant->field_size[0] = 8;
    variant->field_type[0] = cold_cstr_span("int64");
    variant_finalize_layout(type, variant);
    return type;
}

static void gate_build_nested_template(
        GateFixture *fixture) {
    int32_t parameter_kind = SLOT_I32;
    int32_t parameter_size = 4;
    Span parameter_type = cold_cstr_span("T");
    int32_t declaration_offset =
        gate_find_function_declaration(
            fixture, "RoundTemplate");
    fixture->nested_template_function_row =
        symbols_add_fn_at_origin(
            fixture->symbols,
            cold_cstr_span("RoundTemplate"),
            1, &parameter_kind, &parameter_size,
            &parameter_type, parameter_type,
            0, declaration_offset);
    if (fixture->nested_template_function_row < 0)
        gate_fail("nested template registration failed");
    symbols_set_fn_param_types(
        fixture->symbols,
        fixture->nested_template_function_row,
        &parameter_type, 1);
    symbols_set_fn_generics(
        fixture->symbols,
        fixture->nested_template_function_row,
        &parameter_type, 1);
    FnDef *function =
        &fixture->symbols->functions[
            fixture->nested_template_function_row];
    function->template_index = -1;
}

static void gate_build_template(GateFixture *fixture) {
    int32_t parameter_kind = SLOT_I32;
    int32_t parameter_size = 4;
    Span parameter_type = cold_cstr_span("T");
    int32_t declaration_offset =
        gate_find_function_declaration(
            fixture, "GateGenericLayout");
    fixture->template_function_row =
        symbols_add_fn_at_origin(
            fixture->symbols,
            cold_cstr_span("GateGenericLayout"),
            1, &parameter_kind, &parameter_size,
            &parameter_type, cold_cstr_span("int32"),
            0, declaration_offset);
    if (fixture->template_function_row < 0)
        gate_fail("template function registration failed");
    symbols_set_fn_param_types(
        fixture->symbols,
        fixture->template_function_row,
        &parameter_type, 1);
    symbols_set_fn_generics(
        fixture->symbols,
        fixture->template_function_row,
        &parameter_type, 1);
    FnDef *function =
        &fixture->symbols->functions[
            fixture->template_function_row];
    function->template_index = -1;
    function->decl_has_body = true;

    BodyIR *body = body_new(fixture->arena);
    fixture->template_body = body;
    body->producer_function_row =
        fixture->template_function_row;
    body->debug_name =
        cold_cstr_span("GateGenericLayout");
    body->return_kind = SLOT_I32;
    body->return_size = 4;
    body->return_type = cold_cstr_span("int32");
    cold_body_bind_function_declaration_origin(
        body, fixture->symbols,
        fixture->template_function_row);

    fixture->raw_parameter_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->raw_parameter_slot,
        cold_cstr_span("T"));
    fixture->sequence_slot =
        body_slot(body, SLOT_SEQ_OPAQUE, 16);
    body_slot_set_type(
        body, fixture->sequence_slot,
        cold_cstr_span("T"));
    body->slot_aux[fixture->sequence_slot] = 4;
    fixture->sequence_literal_payload_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->sequence_literal_payload_slot,
        cold_cstr_span("T"));
    fixture->value_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->value_slot,
        cold_cstr_span("T"));
    fixture->sequence_value_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->sequence_value_slot,
        cold_cstr_span("T"));
    fixture->value_ref_slot =
        body_slot(body, SLOT_I32_REF, 8);
    body_slot_set_type(
        body, fixture->value_ref_slot,
        cold_cstr_span("var T"));
    fixture->index_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->index_slot,
        cold_cstr_span("int32"));
    fixture->copy_first_slot =
        body_slot(body, SLOT_I32, 4);
    fixture->copy_second_slot =
        body_slot(body, SLOT_I32, 4);
    fixture->nested_result_first_slot =
        body_slot(body, SLOT_I32, 4);
    fixture->nested_result_second_slot =
        body_slot(body, SLOT_I32, 4);

    body->param_count = 1;
    body->param_slot[0] =
        fixture->raw_parameter_slot;
    body->param_name[0] =
        cold_cstr_span("value");
    int32_t block = body_block(body);
    int32_t parameter_marker = body_op3(
        body, BODY_OP_COPY_I32,
        fixture->value_slot,
        fixture->raw_parameter_slot, 0, -1);
    if (parameter_marker != GATE_OP_PARAM_MARKER)
        gate_fail("parameter marker row drifted");
    int32_t sequence_literal_payload =
        body_call_arg(
            body,
            fixture->sequence_literal_payload_slot);
    int32_t make_op = body_op3(
        body, BODY_OP_MAKE_SEQ_OPAQUE,
        fixture->sequence_slot,
        sequence_literal_payload, 4, 1);
    if (make_op != GATE_OP_MAKE_SEQ)
        gate_fail("sequence make op row drifted");
    body_op3(
        body, BODY_OP_SEQ_OPAQUE_INDEX_DYNAMIC,
        fixture->sequence_value_slot,
        fixture->sequence_slot,
        fixture->index_slot, 4);
    body_op3(
        body, BODY_OP_SEQ_OPAQUE_INDEX_REF_DYNAMIC,
        fixture->value_ref_slot,
        fixture->sequence_slot,
        fixture->index_slot, 4);
    body_op3(
        body, BODY_OP_SEQ_OPAQUE_INDEX_STORE,
        fixture->value_slot, fixture->sequence_slot,
        fixture->index_slot, 4);
    body_op(
        body, BODY_OP_SEQ_OPAQUE_ADD,
        fixture->sequence_slot, fixture->value_slot, 4);
    body_op3(
        body, BODY_OP_SEQ_OPAQUE_REMOVE,
        fixture->sequence_slot, fixture->index_slot, 4, 0);
    body_op3(
        body, BODY_OP_SEQ_SET_LEN,
        fixture->sequence_slot, fixture->index_slot, 0, 4);
    int32_t copy_first_op = body_op(
        body, BODY_OP_COPY_I32,
        fixture->copy_first_slot,
        fixture->value_slot, 0);
    int32_t copy_second_op = body_op(
        body, BODY_OP_COPY_I32,
        fixture->copy_second_slot,
        fixture->copy_first_slot, 0);
    if (copy_first_op != GATE_OP_COPY_FIRST ||
        copy_second_op != GATE_OP_COPY_SECOND) {
        gate_fail("copy propagation op rows drifted");
    }
    int32_t first_nested_arg =
        body_call_arg(body, fixture->value_slot);
    int32_t first_nested_call = body_op3(
        body, BODY_OP_CALL_I32,
        fixture->nested_result_first_slot,
        fixture->nested_template_function_row,
        first_nested_arg, 0);
    int32_t second_nested_arg =
        body_call_arg(body, fixture->copy_first_slot);
    int32_t second_nested_call = body_op3(
        body, BODY_OP_CALL_I32,
        fixture->nested_result_second_slot,
        fixture->nested_template_function_row,
        second_nested_arg, 0);
    if (first_nested_call !=
            GATE_OP_NESTED_CALL_FIRST ||
        second_nested_call !=
            GATE_OP_NESTED_CALL_SECOND) {
        gate_fail("nested generic call rows drifted");
    }
    if (body->op_count != GATE_OP_COUNT)
        gate_fail("focused op table row count drifted");
    int32_t term = body_term(
        body, BODY_TERM_RET, fixture->index_slot,
        -1, 0, -1, -1);
    body_end_block(body, block, term);

    ColdExprResult sequence_definition;
    cold_publish_exact_managed_definition(
        body, fixture->symbols,
        fixture->sequence_slot, SLOT_SEQ_OPAQUE,
        make_op, COLD_EXPR_OWN_MOVE,
        &sequence_definition);
    cold_function_body_store_init(
        &fixture->body_store, fixture->arena, 64);
    cold_function_body_store_set(
        &fixture->body_store,
        fixture->template_function_row, body);
    fixture->parser.arena = fixture->arena;
    fixture->parser.symbols = fixture->symbols;
    fixture->parser.function_body_store =
        &fixture->body_store;
    fixture->parser.function_bodies =
        fixture->body_store.items;
    fixture->parser.function_body_cap =
        fixture->body_store.cap;
}

static void gate_build_managed_template(
        GateFixture *fixture) {
    int32_t parameter_kind = SLOT_I32;
    int32_t parameter_size = 4;
    Span parameter_type = cold_cstr_span("T");
    int32_t declaration_offset =
        gate_find_function_declaration(
            fixture, "GateManagedChain");
    fixture->managed_template_function_row =
        symbols_add_fn_at_origin(
            fixture->symbols,
            cold_cstr_span("GateManagedChain"),
            1, &parameter_kind, &parameter_size,
            &parameter_type, cold_cstr_span("int32"),
            0, declaration_offset);
    if (fixture->managed_template_function_row < 0)
        gate_fail("managed template registration failed");
    symbols_set_fn_param_types(
        fixture->symbols,
        fixture->managed_template_function_row,
        &parameter_type, 1);
    symbols_set_fn_generics(
        fixture->symbols,
        fixture->managed_template_function_row,
        &parameter_type, 1);
    FnDef *function =
        &fixture->symbols->functions[
            fixture->managed_template_function_row];
    function->template_index = -1;
    function->decl_has_body = true;

    BodyIR *body = body_new(fixture->arena);
    fixture->managed_template_body = body;
    body->producer_function_row =
        fixture->managed_template_function_row;
    body->debug_name =
        cold_cstr_span("GateManagedChain");
    body->return_kind = SLOT_I32;
    body->return_size = 4;
    body->return_type = cold_cstr_span("int32");
    cold_body_bind_function_declaration_origin(
        body, fixture->symbols,
        fixture->managed_template_function_row);

    fixture->managed_raw_parameter_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->managed_raw_parameter_slot,
        cold_cstr_span("T"));
    fixture->managed_value_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->managed_value_slot,
        cold_cstr_span("T"));
    fixture->managed_copy_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->managed_copy_slot,
        cold_cstr_span("T"));
    fixture->managed_result_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->managed_result_slot,
        cold_cstr_span("T"));
    fixture->managed_index_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->managed_index_slot,
        cold_cstr_span("int32"));
    body->param_count = 1;
    body->param_slot[0] =
        fixture->managed_raw_parameter_slot;
    body->param_name[0] =
        cold_cstr_span("value");

    int32_t block = body_block(body);
    int32_t marker = body_op3(
        body, BODY_OP_COPY_I32,
        fixture->managed_value_slot,
        fixture->managed_raw_parameter_slot,
        0, -1);
    int32_t copy = body_op(
        body, BODY_OP_COPY_I32,
        fixture->managed_copy_slot,
        fixture->managed_value_slot, 0);
    int32_t arg =
        body_call_arg(
            body, fixture->managed_copy_slot);
    int32_t call = body_op3(
        body, BODY_OP_CALL_I32,
        fixture->managed_result_slot,
        fixture->nested_template_function_row,
        arg, 0);
    if (marker != GATE_MANAGED_OP_PARAM_MARKER ||
        copy != GATE_MANAGED_OP_COPY ||
        call != GATE_MANAGED_OP_NESTED_CALL ||
        body->op_count != GATE_MANAGED_OP_COUNT) {
        gate_fail("managed chain op rows drifted");
    }
    body->op_source_value_def_op_id[copy] = marker;
    int32_t term = body_term(
        body, BODY_TERM_RET,
        fixture->managed_index_slot,
        -1, 0, -1, -1);
    body_end_block(body, block, term);
    cold_function_body_store_set(
        &fixture->body_store,
        fixture->managed_template_function_row,
        body);
}

static void gate_build_subword_template(
        GateFixture *fixture) {
    Span parameter_type = cold_cstr_span("T[3]");
    Span generic_name = cold_cstr_span("T");
    int32_t declaration_offset =
        gate_find_function_declaration(
            fixture, "GateSubwordArray");
    int32_t declaration_origin_row =
        symbols_declaration_origin_intern(
            fixture->symbols, 0,
            declaration_offset);
    if (declaration_origin_row < 0 ||
        declaration_origin_row >=
            fixture->symbols->declaration_origin_count) {
        gate_fail("subword template declaration origin missing");
    }
    int32_t parameter_kind =
        cold_parser_slot_kind_from_type_in_generic_scope(
            fixture->symbols, parameter_type,
            &generic_name, 1,
            COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN,
            declaration_origin_row);
    int32_t parameter_size =
        cold_param_size_from_type(
            fixture->symbols, parameter_type,
            parameter_kind);
    if (parameter_kind != SLOT_ARRAY_I32 ||
        parameter_size <= 0) {
        gate_fail("subword template parameter layout missing");
    }
    fixture->subword_template_function_row =
        symbols_add_fn_at_origin(
            fixture->symbols,
            cold_cstr_span("GateSubwordArray"),
            1, &parameter_kind, &parameter_size,
            &parameter_type, cold_cstr_span("int32"),
            0, declaration_offset);
    if (fixture->subword_template_function_row < 0)
        gate_fail("subword template registration failed");
    symbols_set_fn_param_types(
        fixture->symbols,
        fixture->subword_template_function_row,
        &parameter_type, 1);
    symbols_set_fn_generics(
        fixture->symbols,
        fixture->subword_template_function_row,
        &generic_name, 1);
    FnDef *function =
        &fixture->symbols->functions[
            fixture->subword_template_function_row];
    function->template_index = -1;
    function->decl_has_body = true;

    BodyIR *body = body_new(fixture->arena);
    fixture->subword_template_body = body;
    body->producer_function_row =
        fixture->subword_template_function_row;
    body->debug_name =
        cold_cstr_span("GateSubwordArray");
    body->return_kind = SLOT_I32;
    body->return_size = 4;
    body->return_type = cold_cstr_span("int32");
    cold_body_bind_function_declaration_origin(
        body, fixture->symbols,
        fixture->subword_template_function_row);

    fixture->subword_raw_parameter_slot =
        body_slot(
            body, parameter_kind,
            parameter_size);
    body_slot_set_type(
        body, fixture->subword_raw_parameter_slot,
        cold_cstr_span("T[3]"));
    body_slot_set_array_len(
        body, fixture->subword_raw_parameter_slot, 3);
    fixture->array_slot =
        body_slot(
            body, parameter_kind,
            parameter_size);
    body_slot_set_type(
        body, fixture->array_slot,
        cold_cstr_span("T[3]"));
    body_slot_set_array_len(
        body, fixture->array_slot, 3);
    fixture->trailing_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->trailing_slot,
        cold_cstr_span("int32"));
    fixture->array_value_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, fixture->array_value_slot,
        cold_cstr_span("T"));
    fixture->array_ref_value_slot =
        body_slot(body, SLOT_I32_REF, 8);
    body_slot_set_type(
        body, fixture->array_ref_value_slot,
        cold_cstr_span("var T"));
    int32_t index_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, index_slot,
        cold_cstr_span("int32"));
    body->param_count = 1;
    body->param_slot[0] =
        fixture->subword_raw_parameter_slot;
    body->param_name[0] =
        cold_cstr_span("values");

    int32_t block = body_block(body);
    int32_t marker = body_op3(
        body, BODY_OP_COPY_COMPOSITE,
        fixture->array_slot,
        fixture->subword_raw_parameter_slot, 0, -1);
    body_op3(
        body, BODY_OP_ARRAY_OPAQUE_INDEX_DYNAMIC,
        fixture->array_value_slot,
        fixture->array_slot, index_slot, 4);
    body_op3(
        body, BODY_OP_ARRAY_OPAQUE_INDEX_REF_DYNAMIC,
        fixture->array_ref_value_slot,
        fixture->array_slot, index_slot, 4);
    if (marker != GATE_SUBWORD_OP_PARAM_MARKER ||
        body->op_count != GATE_SUBWORD_OP_COUNT) {
        gate_fail("subword op rows drifted");
    }
    int32_t term = body_term(
        body, BODY_TERM_RET, index_slot,
        -1, 0, -1, -1);
    body_end_block(body, block, term);
    cold_function_body_store_set(
        &fixture->body_store,
        fixture->subword_template_function_row,
        body);
}

static void gate_fixture_init(GateFixture *fixture) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = gate_arena_create();
    cold_harness_compilation_begin_sized(
        &fixture->compilation, fixture->arena,
        4, 16, 16, 16, 64);
    fixture->compilation.snapshot =
        &fixture->source_snapshot;
    cold_source_snapshot_begin(
        &fixture->source_snapshot, fixture->arena,
        fixture->compilation.context);
    fixture->source = cold_source_snapshot_open_entry(
        &fixture->source_snapshot,
        "src/tests/cold_generic_type_size_specialization_smoke.cheng");
    cold_source_snapshot_seal(
        &fixture->source_snapshot);
    symbols_bind_source_snapshot(
        fixture->compilation.symbols,
        &fixture->source_snapshot);
    fixture->symbols = fixture->compilation.symbols;
    gate_parse_source_types(fixture);

    ObjectDef *adjacent_object =
        gate_add_plain_object(
            fixture, "GateAdjacent24",
            3, SLOT_I64, 8, "int64");
    fixture->adjacent_object_row =
        symbols_object_index(
            fixture->symbols, adjacent_object);
    ObjectDef *target_object =
        gate_add_plain_object(
            fixture, "GateObject24",
            3, SLOT_I64, 8, "int64");
    fixture->target_object_row =
        symbols_object_index(
            fixture->symbols, target_object);
    ObjectDef *object40 =
        gate_add_plain_object(
            fixture, "GateObject40",
            5, SLOT_I64, 8, "int64");
    ObjectDef *cleanup120 =
        gate_add_plain_object(
            fixture, "GateCleanupCap5",
            5, SLOT_STR, COLD_STR_SLOT_SIZE, "str");
    if (adjacent_object->slot_size != 24 ||
        target_object->slot_size != 24 ||
        object40->slot_size != 40 ||
        cleanup120->field_count != 5 ||
        cleanup120->slot_size != 120) {
        gate_fail("object layout fixture drifted");
    }

    TypeDef *adjacent_variant =
        gate_add_variant(
            fixture, "GateAdjacentVariant",
            "GateAdjacentVariantValue");
    fixture->adjacent_variant_row =
        (int32_t)(adjacent_variant -
                  fixture->symbols->types);
    TypeDef *target_variant =
        gate_add_variant(
            fixture, "GateTargetVariant",
            "GateTargetVariantValue");
    fixture->target_variant_row =
        (int32_t)(target_variant -
                  fixture->symbols->types);
    if (adjacent_variant->max_slot_size != 16 ||
        target_variant->max_slot_size != 16) {
        gate_fail("variant layout fixture drifted");
    }
    gate_build_nested_template(fixture);
    gate_build_template(fixture);
    gate_build_managed_template(fixture);
    gate_build_subword_template(fixture);
}

static void gate_fixture_end(GateFixture *fixture) {
    cold_source_snapshot_end(
        &fixture->source_snapshot);
    arena_release(fixture->arena);
    fixture->arena = NULL;
}

static void gate_bind_specialization_identity(
        GateFixture *fixture, int32_t function_row,
        int32_t template_row, Span actual_type) {
    fixture->symbols->functions[
        function_row].template_index =
            template_row;
    cold_function_specialization_actuals_set(
        fixture->symbols,
        &fixture->symbols->functions[function_row],
        &actual_type, 1);
    cold_bind_specialization_declaration_projection(
        fixture->symbols, function_row,
        template_row);
}

static int32_t gate_add_specialization(
        GateFixture *fixture, const GateCase *test_case) {
    int32_t parameter_kind =
        cold_parser_slot_kind_from_type(
            fixture->symbols, test_case->type);
    int32_t parameter_size =
        cold_parser_slot_size_from_type(
            fixture->symbols, test_case->type,
            parameter_kind);
    if (parameter_size <= 0)
        gate_fail("specialization parameter layout missing");
    char name[128];
    snprintf(
        name, sizeof(name), "GateGenericLayout$%s",
        test_case->name);
    Span parameter_type = test_case->type;
    int32_t function_row = symbols_add_fn(
        fixture->symbols, cold_cstr_span(name),
        1, &parameter_kind, &parameter_size,
        &parameter_type, cold_cstr_span("int32"));
    if (function_row < 0)
        gate_fail("specialization registration failed");
    symbols_set_fn_param_types(
        fixture->symbols, function_row,
        &parameter_type, 1);
    gate_bind_specialization_identity(
        fixture, function_row,
        fixture->template_function_row,
        test_case->type);
    cold_publish_exact_formal_type_ids(
        fixture->symbols, function_row);
    return function_row;
}

static int32_t gate_add_managed_specialization(
        GateFixture *fixture,
        const GateCase *test_case) {
    int32_t parameter_kind =
        cold_parser_slot_kind_from_type(
            fixture->symbols, test_case->type);
    int32_t parameter_size =
        cold_parser_slot_size_from_type(
            fixture->symbols, test_case->type,
            parameter_kind);
    if (parameter_size <= 0)
        gate_fail("managed specialization parameter layout missing");
    char name[128];
    snprintf(
        name, sizeof(name), "GateManagedChain$%s",
        test_case->name);
    Span parameter_type = test_case->type;
    int32_t function_row = symbols_add_fn(
        fixture->symbols, cold_cstr_span(name),
        1, &parameter_kind, &parameter_size,
        &parameter_type, cold_cstr_span("int32"));
    if (function_row < 0)
        gate_fail("managed specialization registration failed");
    symbols_set_fn_param_types(
        fixture->symbols, function_row,
        &parameter_type, 1);
    gate_bind_specialization_identity(
        fixture, function_row,
        fixture->managed_template_function_row,
        test_case->type);
    cold_publish_exact_formal_type_ids(
        fixture->symbols, function_row);
    return function_row;
}

static int32_t gate_add_subword_specialization(
        GateFixture *fixture,
        const GateCase *test_case) {
    Span array_type = cold_arena_join3(
        fixture->arena, test_case->type, "",
        cold_cstr_span("[3]"));
    int32_t parameter_kind = SLOT_ARRAY_I32;
    int32_t parameter_size =
        cold_parser_slot_size_from_type(
            fixture->symbols, array_type,
            parameter_kind);
    char name[128];
    snprintf(
        name, sizeof(name), "GateSubwordArray$%s",
        test_case->name);
    int32_t function_row = symbols_add_fn(
        fixture->symbols, cold_cstr_span(name),
        1, &parameter_kind, &parameter_size,
        &array_type, cold_cstr_span("int32"));
    if (function_row < 0)
        gate_fail("subword specialization registration failed");
    symbols_set_fn_param_types(
        fixture->symbols, function_row,
        &array_type, 1);
    gate_bind_specialization_identity(
        fixture, function_row,
        fixture->subword_template_function_row,
        test_case->type);
    cold_publish_exact_formal_type_ids(
        fixture->symbols, function_row);
    return function_row;
}

static BodyIR *gate_clone_case(
        GateFixture *fixture, const GateCase *test_case,
        int32_t *function_row_out) {
    int32_t function_row =
        gate_add_specialization(fixture, test_case);
    BodyIR *body = cold_clone_specialized_body(
        &fixture->parser, function_row);
    if (!body)
        gate_fail("specialized body clone missing");
    if (function_row_out)
        *function_row_out = function_row;
    return body;
}

static BodyIR *gate_clone_managed_case(
        GateFixture *fixture,
        const GateCase *test_case,
        int32_t *function_row_out) {
    int32_t function_row =
        gate_add_managed_specialization(
            fixture, test_case);
    BodyIR *body = cold_clone_specialized_body(
        &fixture->parser, function_row);
    if (!body)
        gate_fail("managed specialized body clone missing");
    if (function_row_out)
        *function_row_out = function_row;
    return body;
}

static BodyIR *gate_clone_subword_case(
        GateFixture *fixture,
        const GateCase *test_case,
        int32_t *function_row_out) {
    int32_t function_row =
        gate_add_subword_specialization(
            fixture, test_case);
    BodyIR *body = cold_clone_specialized_body(
        &fixture->parser, function_row);
    if (!body)
        gate_fail("subword specialized body clone missing");
    if (function_row_out)
        *function_row_out = function_row;
    return body;
}

static int32_t gate_sequence_type_id_for(
        GateFixture *fixture, BodyIR *body,
        Span type) {
    Span prior = body->slot_type[
        fixture->sequence_slot];
    body->slot_type[fixture->sequence_slot] = type;
    int32_t type_id = cold_exact_managed_type_id(
        fixture->symbols, body,
        fixture->sequence_slot,
        SLOT_SEQ_OPAQUE);
    body->slot_type[fixture->sequence_slot] = prior;
    return type_id;
}

static void gate_validate_frame(
        GateFixture *fixture, BodyIR *body) {
    (void)fixture;
    for (int32_t slot = 0;
         slot < body->slot_count; slot++) {
        int32_t size = body->slot_size[slot];
        int32_t align = size >= 8 ? 8 : 4;
        int32_t reserved = align_i32(size, align);
        if (size <= 0 ||
            body->slot_offset[slot] < 0 ||
            body->slot_offset[slot] % align != 0 ||
            body->slot_offset[slot] + reserved >
                body->frame_size) {
            gate_fail("specialized frame slot invalid");
        }
        for (int32_t prior = 0;
             prior < slot; prior++) {
            int32_t prior_size =
                body->slot_size[prior];
            int32_t prior_align =
                prior_size >= 8 ? 8 : 4;
            int32_t prior_end =
                body->slot_offset[prior] +
                align_i32(prior_size, prior_align);
            int32_t end =
                body->slot_offset[slot] + reserved;
            if (body->slot_offset[slot] < prior_end &&
                body->slot_offset[prior] < end) {
                gate_fail("specialized frame slots overlap");
            }
        }
    }
}

static void gate_validate_case(
        GateFixture *fixture, const GateCase *test_case,
        BodyIR *body, int32_t function_row) {
    int32_t expected_copy_kind =
        cold_parser_slot_kind_from_type(
            fixture->symbols, test_case->type);
    int32_t expected_copy_size =
        cold_parser_slot_size_from_type(
            fixture->symbols, test_case->type,
            expected_copy_kind);
    if (cold_exact_storage_authority_for_slot(
            fixture->symbols, body,
            fixture->value_slot,
            expected_copy_kind) !=
            COLD_MANAGED_STORAGE_UNKNOWN) {
        gate_fail("managed case entered scalar container positive");
    }
    int32_t expected_type_id =
        cold_exact_managed_type_id(
            fixture->symbols, body,
            fixture->sequence_slot,
            span_eq(test_case->type, "int32")
                ? SLOT_SEQ_I32
                : (span_eq(test_case->type, "str")
                    ? SLOT_SEQ_STR
                    : SLOT_SEQ_OPAQUE));
    int32_t expected_sequence_kind =
        span_eq(test_case->type, "int32")
            ? SLOT_SEQ_I32
            : (span_eq(test_case->type, "str")
                ? SLOT_SEQ_STR
                : SLOT_SEQ_OPAQUE);
    GateSpecializedOpRows rows =
        gate_specialized_op_rows(
            fixture, body, expected_sequence_kind);
    int32_t expected_sequence_aux =
        expected_sequence_kind == SLOT_SEQ_OPAQUE
            ? test_case->element_size : 0;
    if (expected_type_id < 0 ||
        body->producer_function_row != function_row ||
        body->slot_kind[fixture->sequence_slot] !=
            expected_sequence_kind ||
        body->slot_size[fixture->sequence_slot] != 16 ||
        body->slot_aux[fixture->sequence_slot] !=
            expected_sequence_aux ||
        !cold_type_is_dynamic_seq_type(
            body->slot_type[fixture->sequence_slot]) ||
        !span_same(
            span_trim(span_sub(
                body->slot_type[
                    fixture->sequence_slot],
                0,
                body->slot_type[
                    fixture->sequence_slot].len - 2)),
            test_case->type) ||
        body->slot_exact_type_id[
            fixture->sequence_slot] !=
            expected_type_id ||
        body->op_value_def_exact_type_id[
            rows.make_seq] != expected_type_id ||
        body->op_value_def_producer_function_row[
            rows.make_seq] != function_row) {
        fprintf(
            stderr,
            "cold_generic_specialized_layout_rebind_gate:"
            " case=%s producer=%d/%d"
            " seq_kind=%d seq_size=%d seq_aux=%d"
            " seq_type=%.*s expected_type=%.*s"
            " slot_type_id=%d expected_type_id=%d"
            " make_type_id=%d make_producer=%d\n",
            test_case->name,
            body->producer_function_row, function_row,
            body->slot_kind[fixture->sequence_slot],
            body->slot_size[fixture->sequence_slot],
            body->slot_aux[fixture->sequence_slot],
            body->slot_type[fixture->sequence_slot].len,
            body->slot_type[fixture->sequence_slot].ptr,
            test_case->type.len, test_case->type.ptr,
            body->slot_exact_type_id[
                fixture->sequence_slot],
            expected_type_id,
            body->op_value_def_exact_type_id[
                rows.make_seq],
            body->op_value_def_producer_function_row[
                rows.make_seq]);
        gate_fail("specialized slot layout or TypeId drifted");
    }
    int32_t expected_parameter_copy_op =
        expected_copy_size <= 4
            ? BODY_OP_COPY_I32
            : (expected_copy_size == 8
                ? BODY_OP_COPY_I64
                : BODY_OP_COPY_COMPOSITE);
    FnDef *specialized_function =
        &fixture->symbols->functions[function_row];
    if (body->param_count != 1 ||
        body->param_slot[0] !=
            fixture->raw_parameter_slot ||
        !span_eq(body->param_name[0], "value") ||
        specialized_function->arity != 1 ||
        body->slot_kind[
            fixture->raw_parameter_slot] !=
            expected_copy_kind ||
        body->slot_size[
            fixture->raw_parameter_slot] !=
            expected_copy_size ||
        !span_same(
            body->slot_type[
                fixture->raw_parameter_slot],
            test_case->type) ||
        body->slot_kind[fixture->value_slot] !=
            expected_copy_kind ||
        body->slot_size[fixture->value_slot] !=
            expected_copy_size ||
        !span_same(
            body->slot_type[fixture->value_slot],
            test_case->type) ||
        body->op_kind[GATE_OP_PARAM_MARKER] !=
            expected_parameter_copy_op ||
        body->op_dst[GATE_OP_PARAM_MARKER] !=
            fixture->value_slot ||
        body->op_a[GATE_OP_PARAM_MARKER] !=
            fixture->raw_parameter_slot ||
        body->op_b[GATE_OP_PARAM_MARKER] != 0 ||
        body->op_c[GATE_OP_PARAM_MARKER] != 0) {
        gate_fail("specialized parameter marker drifted");
    }
    int32_t parameter_storage =
        cold_exact_storage_authority_for_slot(
            fixture->symbols, body,
            fixture->value_slot,
            expected_copy_kind);
    if (parameter_storage ==
            COLD_MANAGED_STORAGE_UNKNOWN) {
        if (!cold_exact_op_tuple_is_sentinel(
                body, GATE_OP_PARAM_MARKER) ||
            !cold_exact_slot_authority_is_sentinel(
                body, fixture->value_slot) ||
            !cold_exact_slot_authority_is_sentinel(
                body, fixture->raw_parameter_slot)) {
            gate_fail("scalar parameter marker gained managed authority");
        }
    } else {
        int32_t parameter_type_id =
            cold_exact_managed_type_id(
                fixture->symbols, body,
                fixture->value_slot,
                expected_copy_kind);
        if (parameter_type_id < 0 ||
            specialized_function->
                param_exact_type_id[0] !=
                parameter_type_id ||
            body->op_value_def_slot[
                GATE_OP_PARAM_MARKER] !=
                fixture->value_slot ||
            body->op_value_def_exact_type_id[
                GATE_OP_PARAM_MARKER] !=
                parameter_type_id ||
            body->op_value_def_producer_function_row[
                GATE_OP_PARAM_MARKER] !=
                function_row ||
            body->op_value_def_place_kind[
                GATE_OP_PARAM_MARKER] !=
                COLD_EXPR_PLACE_PARAM ||
            body->op_value_def_ownership[
                GATE_OP_PARAM_MARKER] !=
                COLD_EXPR_OWN_MOVE ||
            body->op_value_def_origin_id[
                GATE_OP_PARAM_MARKER] != 0 ||
            body->slot_exact_type_id[
                fixture->value_slot] !=
                parameter_type_id ||
            body->slot_place_kind[
                fixture->value_slot] !=
                COLD_EXPR_PLACE_PARAM ||
            body->slot_origin_id[
                fixture->value_slot] != 0 ||
            body->slot_managed_storage_kind[
                fixture->value_slot] !=
                parameter_storage ||
            !cold_exact_slot_authority_is_sentinel(
                body, fixture->raw_parameter_slot)) {
            gate_fail("managed parameter marker authority drifted");
        }
    }
    int32_t expected_native_width =
        expected_sequence_kind == SLOT_SEQ_I32 ? 0
                                               : test_case->element_size;
    int32_t expected_make_width =
        expected_sequence_kind == SLOT_SEQ_I32 ? -1
                                               : test_case->element_size;
    int32_t expected_index_kind =
        expected_sequence_kind == SLOT_SEQ_I32
            ? BODY_OP_SEQ_I32_INDEX_DYNAMIC
            : BODY_OP_SEQ_OPAQUE_INDEX_DYNAMIC;
    int32_t expected_store_kind =
        expected_sequence_kind == SLOT_SEQ_I32
            ? BODY_OP_SEQ_I32_INDEX_STORE
            : BODY_OP_SEQ_OPAQUE_INDEX_STORE;
    int32_t expected_add_kind =
        expected_sequence_kind == SLOT_SEQ_I32
            ? BODY_OP_SEQ_I32_ADD
            : BODY_OP_SEQ_OPAQUE_ADD;
    if (body->op_b[rows.make_seq] !=
            expected_make_width ||
        body->op_kind[rows.seq_index] !=
            expected_index_kind ||
        body->op_dst[rows.seq_index] !=
            fixture->sequence_value_slot ||
        body->op_a[rows.seq_index] !=
            fixture->sequence_slot ||
        body->op_b[rows.seq_index] !=
            fixture->index_slot ||
        body->op_c[rows.seq_index] !=
            expected_native_width ||
        body->op_kind[rows.seq_index_ref] !=
            BODY_OP_SEQ_OPAQUE_INDEX_REF_DYNAMIC ||
        body->op_dst[rows.seq_index_ref] !=
            fixture->value_ref_slot ||
        body->op_a[rows.seq_index_ref] !=
            fixture->sequence_slot ||
        body->op_b[rows.seq_index_ref] !=
            fixture->index_slot ||
        body->op_c[rows.seq_index_ref] !=
            test_case->element_size ||
        body->op_kind[rows.seq_store] !=
            expected_store_kind ||
        body->op_dst[rows.seq_store] !=
            fixture->value_slot ||
        body->op_a[rows.seq_store] !=
            fixture->sequence_slot ||
        body->op_b[rows.seq_store] !=
            fixture->index_slot ||
        body->op_c[rows.seq_store] !=
            expected_native_width ||
        body->op_kind[rows.seq_add] !=
            expected_add_kind ||
        body->op_dst[rows.seq_add] !=
            fixture->sequence_slot ||
        body->op_a[rows.seq_add] !=
            fixture->value_slot ||
        body->op_b[rows.seq_add] !=
            expected_native_width ||
        body->op_c[rows.seq_add] != 0 ||
        body->op_kind[rows.seq_remove] !=
            BODY_OP_SEQ_OPAQUE_REMOVE ||
        body->op_dst[rows.seq_remove] !=
            fixture->sequence_slot ||
        body->op_a[rows.seq_remove] !=
            fixture->index_slot ||
        body->op_b[rows.seq_remove] !=
            test_case->element_size ||
        body->op_c[rows.seq_remove] != 0 ||
        body->op_kind[rows.seq_set_len] !=
            BODY_OP_SEQ_SET_LEN ||
        body->op_dst[rows.seq_set_len] !=
            fixture->sequence_slot ||
        body->op_a[rows.seq_set_len] !=
            fixture->index_slot ||
        body->op_b[rows.seq_set_len] != 0 ||
        body->op_c[rows.seq_set_len] !=
            test_case->element_size) {
        fprintf(
            stderr,
            "cold_generic_specialized_layout_rebind_gate:"
            " case=%s expected_width=%d"
            " make=%d index=%d index_ref=%d store=%d"
            " add=%d remove=%d setlen=%d"
            "\n",
            test_case->name, test_case->element_size,
            body->op_b[rows.make_seq],
            body->op_c[rows.seq_index],
            body->op_c[rows.seq_index_ref],
            body->op_c[rows.seq_store],
            body->op_b[rows.seq_add],
            body->op_b[rows.seq_remove],
            body->op_c[rows.seq_set_len]);
        gate_fail("specialized op element width drifted");
    }
    int32_t expected_copy_op =
        expected_copy_size <= 4
            ? BODY_OP_COPY_I32
            : (expected_copy_size <= 8
                ? BODY_OP_COPY_I64
                : BODY_OP_COPY_COMPOSITE);
    if (body->slot_kind[fixture->copy_first_slot] !=
            expected_copy_kind ||
        body->slot_size[fixture->copy_first_slot] !=
            expected_copy_size ||
        !span_same(
            body->slot_type[fixture->copy_first_slot],
            test_case->type) ||
        body->op_kind[rows.copy_first] !=
            expected_copy_op ||
        body->slot_kind[fixture->copy_second_slot] !=
            expected_copy_kind ||
        body->slot_size[fixture->copy_second_slot] !=
            expected_copy_size ||
        !span_same(
            body->slot_type[fixture->copy_second_slot],
            test_case->type) ||
        body->op_kind[rows.copy_second] !=
            expected_copy_op) {
        gate_fail("second copy propagation slot drifted");
    }
    int32_t first_nested_target =
        body->op_a[rows.nested_call_first];
    int32_t second_nested_target =
        body->op_a[rows.nested_call_second];
    int32_t expected_nested_call_kind =
        cold_kind_is_composite(expected_copy_kind)
            ? BODY_OP_CALL_COMPOSITE
            : BODY_OP_CALL_I32;
    if (first_nested_target < 0 ||
        first_nested_target >=
            fixture->symbols->function_count ||
        first_nested_target ==
            fixture->nested_template_function_row ||
        second_nested_target != first_nested_target ||
        fixture->symbols->functions[
            first_nested_target].template_index !=
            fixture->nested_template_function_row ||
        !span_same(
            fixture->symbols->functions[
                first_nested_target].ret,
            test_case->type) ||
        body->op_kind[
            rows.nested_call_first] !=
            expected_nested_call_kind ||
        body->op_kind[
            rows.nested_call_second] !=
            expected_nested_call_kind ||
        body->slot_kind[
            fixture->nested_result_first_slot] !=
            expected_copy_kind ||
        body->slot_size[
            fixture->nested_result_first_slot] !=
            expected_copy_size ||
        !span_same(
            body->slot_type[
                fixture->nested_result_first_slot],
            test_case->type) ||
        body->slot_kind[
            fixture->nested_result_second_slot] !=
            expected_copy_kind ||
        body->slot_size[
            fixture->nested_result_second_slot] !=
            expected_copy_size ||
        !span_same(
            body->slot_type[
                fixture->nested_result_second_slot],
            test_case->type)) {
        fprintf(
            stderr,
            "cold_generic_specialized_layout_rebind_gate:"
            " case=%s nested_template=%d targets=%d/%d"
            " target_param=%.*s target_ret=%.*s"
            " expected=%.*s"
            " call_kinds=%d/%d expected_call_kind=%d"
            " result_kinds=%d/%d expected_kind=%d"
            " result_sizes=%d/%d expected_size=%d"
            " result_types=%.*s/%.*s\n",
            test_case->name,
            fixture->nested_template_function_row,
            first_nested_target,
            second_nested_target,
            first_nested_target >= 0 &&
                    first_nested_target <
                        fixture->symbols->function_count
                ? fixture->symbols->functions[
                      first_nested_target].
                      param_type[0].len : 0,
            first_nested_target >= 0 &&
                    first_nested_target <
                        fixture->symbols->function_count
                ? fixture->symbols->functions[
                      first_nested_target].
                      param_type[0].ptr : 0,
            first_nested_target >= 0 &&
                    first_nested_target <
                        fixture->symbols->function_count
                ? fixture->symbols->functions[
                      first_nested_target].ret.len : 0,
            first_nested_target >= 0 &&
                    first_nested_target <
                        fixture->symbols->function_count
                ? fixture->symbols->functions[
                      first_nested_target].ret.ptr : 0,
            test_case->type.len, test_case->type.ptr,
            body->op_kind[rows.nested_call_first],
            body->op_kind[rows.nested_call_second],
            expected_nested_call_kind,
            body->slot_kind[
                fixture->nested_result_first_slot],
            body->slot_kind[
                fixture->nested_result_second_slot],
            expected_copy_kind,
            body->slot_size[
                fixture->nested_result_first_slot],
            body->slot_size[
                fixture->nested_result_second_slot],
            expected_copy_size,
            body->slot_type[
                fixture->nested_result_first_slot].len,
            body->slot_type[
                fixture->nested_result_first_slot].ptr,
            body->slot_type[
                fixture->nested_result_second_slot].len,
            body->slot_type[
                fixture->nested_result_second_slot].ptr);
        gate_fail("second nested generic call result drifted");
    }
    int32_t nested_storage =
        cold_exact_storage_authority_for_slot(
            fixture->symbols, body,
            fixture->nested_result_second_slot,
            expected_copy_kind);
    if (nested_storage !=
            COLD_MANAGED_STORAGE_UNKNOWN) {
        int32_t first_type_id =
            body->slot_exact_type_id[
                fixture->nested_result_first_slot];
        int32_t second_type_id =
            body->slot_exact_type_id[
                fixture->nested_result_second_slot];
        int32_t expected_nested_ownership =
            nested_storage == COLD_MANAGED_STORAGE_PLAIN
                ? COLD_EXPR_OWN_PLAIN
                : COLD_EXPR_OWN_MOVE;
        if (first_type_id < 0 ||
            second_type_id != first_type_id ||
            body->op_value_def_slot[
                rows.nested_call_first] !=
                fixture->nested_result_first_slot ||
            body->op_value_def_slot[
                rows.nested_call_second] !=
                fixture->nested_result_second_slot ||
            body->op_value_def_exact_type_id[
                rows.nested_call_first] !=
                first_type_id ||
            body->op_value_def_exact_type_id[
                rows.nested_call_second] !=
                second_type_id ||
            body->op_value_def_producer_function_row[
                rows.nested_call_first] !=
                function_row ||
            body->op_value_def_producer_function_row[
                rows.nested_call_second] !=
                function_row ||
            body->op_value_def_place_kind[
                rows.nested_call_first] !=
                COLD_EXPR_PLACE_TEMPORARY ||
            body->op_value_def_place_kind[
                rows.nested_call_second] !=
                COLD_EXPR_PLACE_TEMPORARY ||
            body->op_value_def_ownership[
                rows.nested_call_first] !=
                expected_nested_ownership ||
            body->op_value_def_ownership[
                rows.nested_call_second] !=
                expected_nested_ownership ||
            body->op_value_def_origin_id[
                rows.nested_call_first] !=
                rows.nested_call_first ||
            body->op_value_def_origin_id[
                rows.nested_call_second] !=
                rows.nested_call_second ||
            body->slot_place_kind[
                fixture->nested_result_first_slot] !=
                COLD_EXPR_PLACE_TEMPORARY ||
            body->slot_place_kind[
                fixture->nested_result_second_slot] !=
                COLD_EXPR_PLACE_TEMPORARY ||
            body->slot_origin_id[
                fixture->nested_result_first_slot] !=
                rows.nested_call_first ||
            body->slot_origin_id[
                fixture->nested_result_second_slot] !=
                rows.nested_call_second ||
            body->slot_managed_storage_kind[
                fixture->nested_result_first_slot] !=
                nested_storage ||
            body->slot_managed_storage_kind[
                fixture->nested_result_second_slot] !=
                nested_storage) {
            fprintf(
                stderr,
                "cold_generic_specialized_layout_rebind_gate:"
                " nested authority case=%s storage=%d function=%d"
                " expected_slots=%d/%d expected_ops=%d/%d"
                " types=%d/%d slots=%d/%d op_types=%d/%d"
                " producers=%d/%d places=%d/%d ownership=%d/%d"
                " origins=%d/%d slot_places=%d/%d"
                " slot_origins=%d/%d slot_storage=%d/%d\n",
                test_case->name, nested_storage, function_row,
                fixture->nested_result_first_slot,
                fixture->nested_result_second_slot,
                rows.nested_call_first,
                rows.nested_call_second,
                first_type_id, second_type_id,
                body->op_value_def_slot[
                    rows.nested_call_first],
                body->op_value_def_slot[
                    rows.nested_call_second],
                body->op_value_def_exact_type_id[
                    rows.nested_call_first],
                body->op_value_def_exact_type_id[
                    rows.nested_call_second],
                body->op_value_def_producer_function_row[
                    rows.nested_call_first],
                body->op_value_def_producer_function_row[
                    rows.nested_call_second],
                body->op_value_def_place_kind[
                    rows.nested_call_first],
                body->op_value_def_place_kind[
                    rows.nested_call_second],
                body->op_value_def_ownership[
                    rows.nested_call_first],
                body->op_value_def_ownership[
                    rows.nested_call_second],
                body->op_value_def_origin_id[
                    rows.nested_call_first],
                body->op_value_def_origin_id[
                    rows.nested_call_second],
                body->slot_place_kind[
                    fixture->nested_result_first_slot],
                body->slot_place_kind[
                    fixture->nested_result_second_slot],
                body->slot_origin_id[
                    fixture->nested_result_first_slot],
                body->slot_origin_id[
                    fixture->nested_result_second_slot],
                body->slot_managed_storage_kind[
                    fixture->nested_result_first_slot],
                body->slot_managed_storage_kind[
                    fixture->nested_result_second_slot]);
            gate_fail("nested managed result authority drifted");
        }
    }
    if (test_case->adjacent_type.len > 0) {
        int32_t adjacent_type_id =
            gate_sequence_type_id_for(
                fixture, body,
                test_case->adjacent_type);
        if (adjacent_type_id < 0 ||
            adjacent_type_id == expected_type_id ||
            body->slot_exact_type_id[
                fixture->sequence_slot] ==
                adjacent_type_id) {
            gate_fail("adjacent nominal identity was accepted");
        }
    }
    if (expected_sequence_kind == SLOT_SEQ_OPAQUE &&
        !cold_exact_opaque_sequence_literal_tuple_valid(
            body, fixture->symbols,
            rows.make_seq)) {
        int32_t payload = body->op_a[rows.make_seq];
        int32_t element_slot =
            payload >= 0 && payload < body->call_arg_count
                ? body->call_arg_slot[payload] : -1;
        fprintf(
            stderr,
            "cold_generic_specialized_layout_rebind_gate:"
            " opaque tuple case=%s op=%d dst=%d kind=%d"
            " size=%d aux=%d a=%d b=%d c=%d type_id=%d"
            " arg_count=%d elem_slot=%d elem_size=%d offset=%d"
            " def=%d place=%d own=%d origin=%d storage=%d\n",
            test_case->name, rows.make_seq,
            body->op_dst[rows.make_seq],
            body->slot_kind[fixture->sequence_slot],
            body->slot_size[fixture->sequence_slot],
            body->slot_aux[fixture->sequence_slot],
            body->op_a[rows.make_seq],
            body->op_b[rows.make_seq],
            body->op_c[rows.make_seq],
            body->op_value_def_exact_type_id[rows.make_seq],
            body->call_arg_count, element_slot,
            element_slot >= 0 ? body->slot_size[element_slot] : -1,
            payload >= 0 ? body->call_arg_offset[payload] : -1,
            payload >= 0 ? body->call_arg_value_def_op_id[payload] : -2,
            payload >= 0 ? body->call_arg_place_kind[payload] : -2,
            payload >= 0 ? body->call_arg_ownership[payload] : -2,
            payload >= 0 ? body->call_arg_origin_id[payload] : -2,
            element_slot >= 0
                ? cold_exact_storage_authority_for_slot(
                      fixture->symbols, body, element_slot,
                      body->slot_kind[element_slot])
                : -2);
        gate_fail("canonical opaque sequence literal tuple is invalid");
    }
    gate_validate_frame(fixture, body);
}

static void gate_validate_managed_case(
        GateFixture *fixture,
        const GateCase *test_case,
        BodyIR *body, int32_t function_row) {
    int32_t kind =
        cold_parser_slot_kind_from_type(
            fixture->symbols, test_case->type);
    int32_t size =
        cold_parser_slot_size_from_type(
            fixture->symbols, test_case->type,
            kind);
    int32_t storage =
        cold_exact_storage_authority_for_slot(
            fixture->symbols, body,
            fixture->managed_value_slot, kind);
    int32_t type_id =
        cold_exact_managed_type_id(
            fixture->symbols, body,
            fixture->managed_value_slot, kind);
    FnDef *function =
        &fixture->symbols->functions[function_row];
    int32_t nested_target =
        body->op_a[
            GATE_MANAGED_OP_NESTED_CALL];
    if (storage ==
            COLD_MANAGED_STORAGE_UNKNOWN ||
        type_id < 0 ||
        function->template_index !=
            fixture->managed_template_function_row ||
        function->specialization_actual_count != 1 ||
        !span_same(
            function->specialization_actual_type[0],
            test_case->type) ||
        function->param_exact_type_id[0] !=
            type_id ||
        body->producer_function_row !=
            function_row ||
        body->param_count != 1 ||
        body->param_slot[0] !=
            fixture->managed_raw_parameter_slot ||
        !span_eq(body->param_name[0], "value") ||
        body->slot_kind[
            fixture->managed_value_slot] != kind ||
        body->slot_size[
            fixture->managed_value_slot] != size ||
        !span_same(
            body->slot_type[
                fixture->managed_value_slot],
            test_case->type) ||
        body->op_value_def_slot[
            GATE_MANAGED_OP_PARAM_MARKER] !=
            fixture->managed_value_slot ||
        body->op_value_def_exact_type_id[
            GATE_MANAGED_OP_PARAM_MARKER] != type_id ||
        body->op_value_def_producer_function_row[
            GATE_MANAGED_OP_PARAM_MARKER] !=
            function_row ||
        body->op_value_def_place_kind[
            GATE_MANAGED_OP_PARAM_MARKER] !=
            COLD_EXPR_PLACE_PARAM ||
        body->op_value_def_ownership[
            GATE_MANAGED_OP_PARAM_MARKER] !=
            COLD_EXPR_OWN_MOVE ||
        body->op_value_def_origin_id[
            GATE_MANAGED_OP_PARAM_MARKER] != 0 ||
        body->op_value_def_consume_op_index_plus_one[
            GATE_MANAGED_OP_PARAM_MARKER] !=
            GATE_MANAGED_OP_COPY + 1) {
        fprintf(
            stderr,
            "cold_generic_specialized_layout_rebind_gate:"
            " managed parameter case=%s storage=%d type=%d"
            " template=%d/%d actual_count=%d"
            " actual=%.*s formal_type=%d producer=%d/%d"
            " param_count=%d raw=%d/%d value_kind=%d/%d"
            " value_size=%d/%d value_type=%.*s"
            " def_slot=%d/%d def_type=%d def_producer=%d/%d"
            " def_place=%d def_ownership=%d def_origin=%d"
            " def_consume=%d/%d\n",
            test_case->name, storage, type_id,
            function->template_index,
            fixture->managed_template_function_row,
            function->specialization_actual_count,
            function->specialization_actual_type[0].len,
            function->specialization_actual_type[0].ptr,
            function->param_exact_type_id[0],
            body->producer_function_row, function_row,
            body->param_count, body->param_slot[0],
            fixture->managed_raw_parameter_slot,
            body->slot_kind[fixture->managed_value_slot],
            kind,
            body->slot_size[fixture->managed_value_slot],
            size,
            body->slot_type[fixture->managed_value_slot].len,
            body->slot_type[fixture->managed_value_slot].ptr,
            body->op_value_def_slot[
                GATE_MANAGED_OP_PARAM_MARKER],
            fixture->managed_value_slot,
            body->op_value_def_exact_type_id[
                GATE_MANAGED_OP_PARAM_MARKER],
            body->op_value_def_producer_function_row[
                GATE_MANAGED_OP_PARAM_MARKER],
            function_row,
            body->op_value_def_place_kind[
                GATE_MANAGED_OP_PARAM_MARKER],
            body->op_value_def_ownership[
                GATE_MANAGED_OP_PARAM_MARKER],
            body->op_value_def_origin_id[
                GATE_MANAGED_OP_PARAM_MARKER],
            body->op_value_def_consume_op_index_plus_one[
                GATE_MANAGED_OP_PARAM_MARKER],
            GATE_MANAGED_OP_COPY + 1);
        gate_fail("managed parameter authority drifted");
    }
    bool managed_call_authority =
        storage != COLD_MANAGED_STORAGE_PLAIN;
    if (body->slot_kind[
            fixture->managed_copy_slot] != kind ||
        body->slot_size[
            fixture->managed_copy_slot] != size ||
        !span_same(
            body->slot_type[
                fixture->managed_copy_slot],
            test_case->type) ||
        body->op_value_def_slot[
            GATE_MANAGED_OP_COPY] !=
            fixture->managed_copy_slot ||
        body->op_value_def_exact_type_id[
            GATE_MANAGED_OP_COPY] != type_id ||
        body->op_value_def_producer_function_row[
            GATE_MANAGED_OP_COPY] != function_row ||
        body->op_value_def_place_kind[
            GATE_MANAGED_OP_COPY] !=
            COLD_EXPR_PLACE_STACK_LOCAL ||
        body->op_value_def_ownership[
            GATE_MANAGED_OP_COPY] !=
            COLD_EXPR_OWN_MOVE ||
        body->op_value_def_origin_id[
            GATE_MANAGED_OP_COPY] !=
            fixture->managed_copy_slot ||
        body->op_source_value_def_op_id[
            GATE_MANAGED_OP_COPY] !=
            GATE_MANAGED_OP_PARAM_MARKER ||
        body->op_value_def_consume_op_index_plus_one[
            GATE_MANAGED_OP_COPY] !=
            (managed_call_authority
                 ? GATE_MANAGED_OP_NESTED_CALL + 1
                 : 0) ||
        body->call_arg_count != 1 ||
        body->call_arg_slot[0] !=
            fixture->managed_copy_slot) {
        gate_fail("managed copy-to-call authority drifted");
    }
    if (managed_call_authority) {
        if (body->call_arg_value_def_op_id[0] !=
                GATE_MANAGED_OP_COPY ||
            body->call_arg_place_kind[0] !=
                COLD_EXPR_PLACE_STACK_LOCAL ||
            body->call_arg_ownership[0] !=
                COLD_EXPR_OWN_MOVE ||
            body->call_arg_origin_id[0] !=
                fixture->managed_copy_slot) {
            gate_fail("managed copy-to-call authority drifted");
        }
    } else if (
        body->call_arg_value_def_op_id[0] != -1 ||
        body->call_arg_place_kind[0] !=
            COLD_EXPR_PLACE_INVALID ||
        body->call_arg_ownership[0] !=
            COLD_EXPR_OWN_INVALID ||
        body->call_arg_origin_id[0] != -1) {
        gate_fail("plain copy carried managed call authority");
    }
    int32_t expected_result_ownership =
        storage == COLD_MANAGED_STORAGE_PLAIN
            ? COLD_EXPR_OWN_PLAIN
            : COLD_EXPR_OWN_MOVE;
    if (nested_target < 0 ||
        nested_target >=
            fixture->symbols->function_count ||
        nested_target ==
            fixture->nested_template_function_row ||
        fixture->symbols->functions[
            nested_target].template_index !=
            fixture->nested_template_function_row ||
        fixture->symbols->functions[
            nested_target].
                specialization_actual_count != 1 ||
        !span_same(
            fixture->symbols->functions[
                nested_target].
                specialization_actual_type[0],
            test_case->type) ||
        body->op_value_def_slot[
            GATE_MANAGED_OP_NESTED_CALL] !=
            fixture->managed_result_slot ||
        body->op_value_def_exact_type_id[
            GATE_MANAGED_OP_NESTED_CALL] !=
            type_id ||
        body->op_value_def_producer_function_row[
            GATE_MANAGED_OP_NESTED_CALL] !=
            function_row ||
        body->op_value_def_place_kind[
            GATE_MANAGED_OP_NESTED_CALL] !=
            COLD_EXPR_PLACE_TEMPORARY ||
        body->op_value_def_ownership[
            GATE_MANAGED_OP_NESTED_CALL] !=
            expected_result_ownership ||
        body->op_value_def_origin_id[
            GATE_MANAGED_OP_NESTED_CALL] !=
            GATE_MANAGED_OP_NESTED_CALL ||
        body->slot_exact_type_id[
            fixture->managed_result_slot] !=
            type_id ||
        body->slot_place_kind[
            fixture->managed_result_slot] !=
            COLD_EXPR_PLACE_TEMPORARY ||
        body->slot_origin_id[
            fixture->managed_result_slot] !=
            GATE_MANAGED_OP_NESTED_CALL ||
        body->slot_managed_storage_kind[
            fixture->managed_result_slot] !=
            storage) {
        gate_fail("managed nested result authority drifted");
    }
    for (int32_t op = 0;
         op < body->op_count; op++) {
        int32_t op_kind = body->op_kind[op];
        if (op_kind ==
                BODY_OP_SEQ_OPAQUE_INDEX_STORE ||
            op_kind == BODY_OP_SEQ_OPAQUE_REMOVE ||
            op_kind == BODY_OP_SEQ_SET_LEN) {
            gate_fail("managed positive contains unsupported container op");
        }
    }
    if (test_case->adjacent_type.len > 0) {
        Span prior =
            body->slot_type[
                fixture->managed_value_slot];
        body->slot_type[
            fixture->managed_value_slot] =
                test_case->adjacent_type;
        int32_t adjacent_type_id =
            cold_exact_managed_type_id(
                fixture->symbols, body,
                fixture->managed_value_slot,
                kind);
        body->slot_type[
            fixture->managed_value_slot] = prior;
        if (adjacent_type_id < 0 ||
            adjacent_type_id == type_id) {
            gate_fail("managed adjacent nominal identity was accepted");
        }
    }
    gate_validate_frame(fixture, body);
}

static void gate_validate_subword_case(
        GateFixture *fixture,
        const GateCase *test_case,
        BodyIR *body, int32_t function_row) {
    Span array_type = cold_arena_join3(
        fixture->arena, test_case->type, "",
        cold_cstr_span("[3]"));
    int32_t expected_array_size =
        cold_parser_slot_size_from_type(
            fixture->symbols, array_type,
            SLOT_ARRAY_I32);
    FnDef *specialized_function =
        &fixture->symbols->functions[function_row];
    int32_t expected_array_type_id =
        SLOT_ARRAY_I32 * 1048576;
    if (body->producer_function_row != function_row ||
        body->param_count != 1 ||
        body->param_slot[0] !=
            fixture->subword_raw_parameter_slot ||
        !span_eq(body->param_name[0], "values") ||
        body->slot_kind[
            fixture->subword_raw_parameter_slot] !=
            SLOT_ARRAY_I32 ||
        body->slot_size[
            fixture->subword_raw_parameter_slot] !=
            expected_array_size ||
        !span_same(
            body->slot_type[
                fixture->subword_raw_parameter_slot],
            array_type) ||
        body->slot_kind[fixture->array_slot] !=
            SLOT_ARRAY_I32 ||
        body->slot_size[fixture->array_slot] !=
            expected_array_size ||
        body->slot_aux[fixture->array_slot] != 3 ||
        !span_same(
            body->slot_type[fixture->array_slot],
            array_type) ||
        body->op_kind[
            GATE_SUBWORD_OP_PARAM_MARKER] !=
            BODY_OP_COPY_I64 ||
        body->op_dst[
            GATE_SUBWORD_OP_PARAM_MARKER] !=
            fixture->array_slot ||
        body->op_a[
            GATE_SUBWORD_OP_PARAM_MARKER] !=
            fixture->subword_raw_parameter_slot ||
        body->op_b[
            GATE_SUBWORD_OP_PARAM_MARKER] != 0 ||
        body->op_c[
            GATE_SUBWORD_OP_PARAM_MARKER] != 0 ||
        specialized_function->param_exact_type_id[0] !=
            expected_array_type_id ||
        body->op_value_def_slot[
            GATE_SUBWORD_OP_PARAM_MARKER] !=
            fixture->array_slot ||
        body->op_value_def_exact_type_id[
            GATE_SUBWORD_OP_PARAM_MARKER] !=
            expected_array_type_id ||
        body->op_value_def_producer_function_row[
            GATE_SUBWORD_OP_PARAM_MARKER] !=
            function_row ||
        body->op_value_def_place_kind[
            GATE_SUBWORD_OP_PARAM_MARKER] !=
            COLD_EXPR_PLACE_PARAM ||
        body->op_value_def_ownership[
            GATE_SUBWORD_OP_PARAM_MARKER] !=
            COLD_EXPR_OWN_MOVE ||
        body->op_value_def_origin_id[
            GATE_SUBWORD_OP_PARAM_MARKER] != 0 ||
        body->op_value_def_consume_op_index_plus_one[
            GATE_SUBWORD_OP_PARAM_MARKER] != 0 ||
        body->op_source_value_def_op_id[
            GATE_SUBWORD_OP_PARAM_MARKER] != -1 ||
        body->slot_exact_type_id[fixture->array_slot] !=
            expected_array_type_id ||
        body->slot_place_kind[fixture->array_slot] !=
            COLD_EXPR_PLACE_PARAM ||
        body->slot_origin_id[fixture->array_slot] != 0 ||
        body->slot_managed_storage_kind[
            fixture->array_slot] !=
            COLD_MANAGED_STORAGE_PLAIN ||
        !cold_exact_slot_authority_is_sentinel(
            body, fixture->subword_raw_parameter_slot)) {
        gate_fail("subword parameter or array layout drifted");
    }
    if (expected_array_size != 8 ||
        body->slot_offset[fixture->array_slot] % 8 != 0 ||
        body->slot_offset[fixture->trailing_slot] !=
            body->slot_offset[fixture->array_slot] + 8 ||
        body->op_c[
            GATE_SUBWORD_OP_ARRAY_INDEX] !=
            test_case->element_size ||
        body->op_c[
            GATE_SUBWORD_OP_ARRAY_INDEX_REF] !=
            test_case->element_size) {
        gate_fail("subword fixed-array alignment or width drifted");
    }
    gate_validate_frame(fixture, body);
}

static GateCase gate_case_named(
        const char *name, const char *type,
        int32_t element_size,
        const char *adjacent_type) {
    GateCase out;
    out.name = name;
    out.type = cold_cstr_span(type);
    out.element_size = element_size;
    out.adjacent_type =
        adjacent_type
            ? cold_cstr_span(adjacent_type)
            : (Span){0};
    return out;
}

static BodyIR *gate_clone_named_case(
        GateFixture *fixture, const char *name,
        GateCase *test_case_out,
        int32_t *function_row_out) {
    GateCase test_case;
    if (strcmp(name, "cleanup") == 0) {
        test_case = gate_case_named(
            "cleanup", "GateCleanupCap5", 120, 0);
    } else if (strcmp(name, "variant") == 0) {
        test_case = gate_case_named(
            "variant", "GateTargetVariant", 16,
            "GateAdjacentVariant");
    } else if (strcmp(name, "uint8") == 0) {
        test_case = gate_case_named(
            "uint8", "uint8", 1, 0);
    } else {
        test_case = gate_case_named(
            "object24", "GateObject24", 24,
            "GateAdjacent24");
    }
    BodyIR *body = gate_clone_case(
        fixture, &test_case,
        function_row_out);
    if (test_case_out)
        *test_case_out = test_case;
    return body;
}

static void gate_positive(void) {
    GateFixture fixture;
    gate_fixture_init(&fixture);
    FnDef *initial_function_rows =
        fixture.symbols->functions;
    int32_t initial_function_cap =
        fixture.symbols->function_cap;
    int32_t initial_function_count =
        fixture.symbols->function_count;
    GateCase cases[] = {
        { "uint8", { (uint8_t *)"uint8", 5 }, 1, {0} },
        { "uint16", { (uint8_t *)"uint16", 6 }, 2, {0} },
        { "int32", { (uint8_t *)"int32", 5 }, 4, {0} },
        { "int64", { (uint8_t *)"int64", 5 }, 8, {0} },
        { "variant", { (uint8_t *)"GateTargetVariant", 17 }, 16,
          { (uint8_t *)"GateAdjacentVariant", 19 } }
    };
    GateCase managed_cases[] = {
        { "str", { (uint8_t *)"str", 3 }, COLD_STR_SLOT_SIZE, {0} },
        { "object24", { (uint8_t *)"GateObject24", 12 }, 24,
          { (uint8_t *)"GateAdjacent24", 14 } },
        { "object40", { (uint8_t *)"GateObject40", 12 }, 40, {0} },
        { "cleanup", { (uint8_t *)"GateCleanupCap5", 15 }, 120, {0} }
    };
    int32_t scalar_case_count =
        (int32_t)(sizeof(cases) / sizeof(cases[0]));
    for (int32_t index = 0;
         index < scalar_case_count; index++) {
        int32_t function_row = -1;
        BodyIR *body = gate_clone_case(
            &fixture, &cases[index],
            &function_row);
        gate_validate_case(
            &fixture, &cases[index],
            body, function_row);
        /* GateTargetVariant is a focused in-memory layout discriminator,
           not a declaration in the immutable source snapshot.  Exercise
           its specialization and adjacent-row identity here, but do not
           publish that synthetic-only function into the production freeze
           set, whose TypeNode nominal owner must have a real declaration
           origin. */
        if (!span_eq(
                cases[index].type,
                "GateTargetVariant")) {
            cold_function_body_store_set(
                &fixture.body_store,
                function_row, body);
        }
    }
    int32_t managed_case_count =
        (int32_t)(
            sizeof(managed_cases) /
            sizeof(managed_cases[0]));
    for (int32_t index = 0;
         index < managed_case_count; index++) {
        int32_t function_row = -1;
        BodyIR *body =
            gate_clone_managed_case(
                &fixture,
                &managed_cases[index],
                &function_row);
        gate_validate_managed_case(
            &fixture,
            &managed_cases[index],
            body, function_row);
        cold_function_body_store_set(
            &fixture.body_store,
            function_row, body);
    }
    GateCase subword_cases[] = {
        { "uint8-subword",
          { (uint8_t *)"uint8", 5 }, 1, {0} },
        { "uint16-subword",
          { (uint8_t *)"uint16", 6 }, 2, {0} }
    };
    int32_t subword_case_count =
        (int32_t)(
            sizeof(subword_cases) /
            sizeof(subword_cases[0]));
    for (int32_t index = 0;
         index < subword_case_count; index++) {
        int32_t function_row = -1;
        BodyIR *body = gate_clone_subword_case(
            &fixture, &subword_cases[index],
            &function_row);
        gate_validate_subword_case(
            &fixture, &subword_cases[index],
            body, function_row);
        cold_function_body_store_set(
            &fixture.body_store,
            function_row, body);
    }
    if (fixture.symbols->functions !=
            initial_function_rows ||
        fixture.symbols->function_cap !=
            initial_function_cap ||
        fixture.symbols->function_count <=
            initial_function_count) {
        gate_fail("function symbol reservation row identity drifted");
    }
    cold_function_body_store_freeze(
        &fixture.body_store, fixture.symbols);
    cold_function_body_store_assert_frozen_unchanged(
        &fixture.body_store, fixture.symbols,
        "generic-specialized-layout-rebind-positive");
    puts("cold_generic_specialized_layout_rebind_gate_status=pass");
    printf(
        "specialization_case_count=%d\n",
        scalar_case_count +
            managed_case_count);
    puts("specialized_op_width_count=9");
    puts("native_sequence_literal_encoding=canonical");
    puts("native_sequence_op_encoding=canonical");
    puts("native_i32_sequence_slot_aux=0");
    puts("opaque_uint8_carrier_bytes=4");
    puts("opaque_uint8_payload_bytes=1");
    puts("cleanup_cap5_bytes=120");
    puts("body_store_freeze=exact");
    puts("copy_propagation_second_slot=exact");
    puts("managed_copy_nested_single_owner=exact");
    puts("subword_fixed_array_alignment=exact");
    puts("symbol_function_reservation=row_stable");
    puts("adjacent_object_identity=exact");
    puts("adjacent_variant_identity=exact");
    gate_fixture_end(&fixture);
}

static int gate_freeze_mutation(const char *mode) {
    GateFixture fixture;
    gate_fixture_init(&fixture);
    GateCase test_case = gate_case_named(
        "uint8-freeze", "uint8", 1, 0);
    int32_t function_row = -1;
    BodyIR *body = gate_clone_case(
        &fixture, &test_case, &function_row);
    gate_validate_case(
        &fixture, &test_case,
        body, function_row);
    cold_function_body_store_set(
        &fixture.body_store, function_row, body);
    cold_function_body_store_freeze(
        &fixture.body_store, fixture.symbols);
    cold_function_body_store_assert_frozen_unchanged(
        &fixture.body_store, fixture.symbols,
        "generic-freeze-before-mutation");
    if (strcmp(mode, "freeze-body-second-slot") == 0) {
        body->slot_size[fixture.copy_second_slot]++;
    } else if (strcmp(
                   mode,
                   "freeze-symbol-function") == 0) {
        fixture.symbols->functions[
            function_row].param_size[0]++;
    } else if (strcmp(
                   mode,
                   "freeze-symbol-decl-path") == 0) {
        fixture.symbols->functions[
            function_row].decl_path =
                cold_cstr_span(
                    "src/tests/fingerprint-drift.cheng");
    } else if (strcmp(
                   mode,
                   "freeze-symbol-decl-line") == 0) {
        fixture.symbols->functions[
            function_row].decl_line++;
    } else {
        gate_fail("unknown freeze mutation");
    }
    cold_function_body_store_assert_frozen_unchanged(
        &fixture.body_store, fixture.symbols,
        mode);
    puts("freeze_mutation_was_accepted=1");
    gate_fixture_end(&fixture);
    return 0;
}

static void gate_mutate_width(
        BodyIR *body, const char *mode,
        int32_t stale_width) {
    if (strcmp(mode, "make-seq-width") == 0)
        body->op_b[GATE_OP_MAKE_SEQ] = stale_width;
    else if (strcmp(mode, "seq-index-width") == 0)
        body->op_c[GATE_OP_SEQ_INDEX] = stale_width;
    else if (strcmp(mode, "seq-index-ref-width") == 0)
        body->op_c[GATE_OP_SEQ_INDEX_REF] = stale_width;
    else if (strcmp(mode, "seq-store-width") == 0)
        body->op_c[GATE_OP_SEQ_STORE] = stale_width;
    else if (strcmp(mode, "seq-add-width") == 0)
        body->op_b[GATE_OP_SEQ_ADD] = stale_width;
    else if (strcmp(mode, "seq-remove-width") == 0)
        body->op_b[GATE_OP_SEQ_REMOVE] = stale_width;
    else if (strcmp(mode, "seq-setlen-width") == 0)
        body->op_c[GATE_OP_SEQ_SET_LEN] = stale_width;
    else
        gate_fail("unknown width mutation");
}

static int gate_subword_mutation(const char *mode) {
    GateFixture fixture;
    gate_fixture_init(&fixture);
    GateCase test_case = gate_case_named(
        "uint8-subword-mutation",
        "uint8", 1, 0);
    int32_t function_row = -1;
    BodyIR *body = gate_clone_subword_case(
        &fixture, &test_case, &function_row);
    gate_validate_subword_case(
        &fixture, &test_case,
        body, function_row);
    if (strcmp(mode, "array-index-width") == 0) {
        body->op_c[
            GATE_SUBWORD_OP_ARRAY_INDEX] = 4;
    } else if (strcmp(
                   mode,
                   "array-index-ref-width") == 0) {
        body->op_c[
            GATE_SUBWORD_OP_ARRAY_INDEX_REF] = 4;
    } else if (strcmp(mode, "array-slot-size") == 0) {
        body->slot_size[
            fixture.array_slot] = 16;
    } else if (strcmp(mode, "subword-array-aux") == 0) {
        body->slot_aux[
            fixture.array_slot] = 2;
    } else if (strcmp(mode, "subword-array-align") == 0) {
        body->slot_offset[
            fixture.array_slot] += 4;
    } else {
        gate_fail("unknown subword mutation");
    }
    gate_validate_subword_case(
        &fixture, &test_case,
        body, function_row);
    gate_fail("mutated subword layout was accepted");
    return 1;
}

static void gate_mutation(const char *mode) {
    GateFixture fixture;
    gate_fixture_init(&fixture);
    GateCase test_case =
        gate_case_named(
            "uint8-mutation",
            "uint8", 1, 0);
    int32_t function_row = -1;
    BodyIR *body = gate_clone_named_case(
        &fixture, "uint8",
        &test_case, &function_row);
    if (strstr(mode, "-width")) {
        gate_mutate_width(body, mode, 4);
    } else if (strcmp(
                   mode,
                   "opaque-payload-carrier-size") == 0) {
        body->slot_size[
            fixture.sequence_literal_payload_slot] = 1;
    } else if (strcmp(mode, "frame-overlap") == 0) {
        body->slot_offset[
            fixture.value_ref_slot] =
                body->slot_offset[
                    fixture.sequence_slot];
    } else {
        gate_fail("unknown mutation");
    }
    gate_validate_case(
        &fixture, &test_case,
        body, function_row);
    gate_fail("mutated specialized layout was accepted");
}

static void gate_native_sequence_mutation(
        const char *mode) {
    GateFixture fixture;
    gate_fixture_init(&fixture);
    GateCase test_case =
        gate_case_named(
            "int32-native-mutation",
            "int32", 4, 0);
    int32_t function_row = -1;
    BodyIR *body = gate_clone_case(
        &fixture, &test_case, &function_row);
    GateSpecializedOpRows rows =
        gate_specialized_op_rows(
            &fixture, body, SLOT_SEQ_I32);
    if (strcmp(mode, "native-literal-opcode") == 0) {
        body->op_kind[rows.make_seq] =
            BODY_OP_MAKE_SEQ_OPAQUE;
    } else if (strcmp(
                   mode,
                   "native-index-opcode") == 0) {
        body->op_kind[rows.seq_index] =
            BODY_OP_SEQ_OPAQUE_INDEX_DYNAMIC;
    } else if (strcmp(
                   mode,
                   "native-store-opcode") == 0) {
        body->op_kind[rows.seq_store] =
            BODY_OP_SEQ_OPAQUE_INDEX_STORE;
    } else if (strcmp(
                   mode,
                   "native-add-opcode") == 0) {
        body->op_kind[rows.seq_add] =
            BODY_OP_SEQ_OPAQUE_ADD;
    } else if (strcmp(
                   mode,
                   "native-staging-count") == 0) {
        body->op_c[rows.make_seq - 1] = 2;
    } else if (strcmp(
                   mode,
                   "native-payload-offset") == 0) {
        int32_t payload =
            body->op_b[rows.make_seq - 1];
        if (payload < 0 ||
            payload >= body->call_arg_count) {
            gate_fail("native payload mutation row invalid");
        }
        body->call_arg_offset[payload] = 4;
    } else if (strcmp(
                   mode,
                   "native-i32-slot-aux-count") == 0) {
        body->slot_aux[fixture.sequence_slot] = 1;
    } else if (strcmp(
                   mode,
                   "native-i32-slot-aux-stride") == 0) {
        body->slot_aux[fixture.sequence_slot] = 4;
    } else {
        gate_fail("unknown native sequence mutation");
    }
    gate_validate_case(
        &fixture, &test_case,
        body, function_row);
    gate_fail("mutated native sequence tuple was accepted");
}

static int gate_missing_identity(const char *mode) {
    GateFixture fixture;
    gate_fixture_init(&fixture);
    GateCase test_case;
    if (strcmp(mode, "missing-object-identity") == 0) {
        test_case = gate_case_named(
            "missing-object", "GateObject24", 24,
            "GateAdjacent24");
    } else if (strcmp(mode, "missing-variant-identity") == 0) {
        test_case = gate_case_named(
            "missing-variant", "GateTargetVariant", 16,
            "GateAdjacentVariant");
    } else {
        gate_fail("unknown missing identity mutation");
    }
    int32_t function_row =
        gate_add_managed_specialization(
            &fixture, &test_case);
    if (strcmp(mode, "missing-object-identity") == 0) {
        fixture.symbols->object_count =
            fixture.target_object_row;
    } else {
        fixture.symbols->type_count =
            fixture.target_variant_row;
    }
    BodyIR *mutated_body =
        cold_clone_specialized_body(
            &fixture.parser, function_row);
    if (!mutated_body ||
        !cold_bodyir_exact_identity_schema_valid(
            mutated_body, fixture.symbols,
            "generic-layout-missing-nominal")) {
        gate_fail("specialization missing nominal identity rejected");
    }
    puts("missing_nominal_identity_was_accepted=1");
    gate_fixture_end(&fixture);
    return 0;
}

static int gate_managed_source_mutation(
        const char *mode) {
    GateFixture fixture;
    gate_fixture_init(&fixture);
    GateCase test_case = gate_case_named(
        "str-source-mutation", "str",
        COLD_STR_SLOT_SIZE, 0);
    if (strcmp(
            mode,
            "managed-copy-missing-source-edge") == 0) {
        fixture.managed_template_body->
            op_source_value_def_op_id[
                GATE_MANAGED_OP_COPY] = -1;
    } else if (strcmp(
                   mode,
                   "managed-copy-orphan-reciprocal-consume") ==
               0) {
        fixture.managed_template_body->
            op_source_value_def_op_id[
                GATE_MANAGED_OP_COPY] = -1;
        fixture.managed_template_body->
            op_value_def_consume_op_index_plus_one[
                GATE_MANAGED_OP_PARAM_MARKER] =
                    GATE_MANAGED_OP_COPY + 1;
    }
    int32_t function_row = -1;
    BodyIR *body = gate_clone_managed_case(
        &fixture, &test_case, &function_row);
    if (strcmp(
            mode,
            "managed-copy-source-producer-dst-drift") ==
        0) {
        body->op_dst[
            GATE_MANAGED_OP_PARAM_MARKER] =
                fixture.managed_raw_parameter_slot;
        cold_rebind_specialized_copy_authority(
            body, fixture.symbols);
    } else if (strcmp(
                   mode,
                   "managed-copy-source-slot-typeid-drift") ==
               0) {
        body->slot_exact_type_id[
            fixture.managed_value_slot]++;
        cold_rebind_specialized_copy_authority(
            body, fixture.symbols);
    } else if (
        strcmp(
            mode,
            "managed-copy-missing-source-edge") != 0 &&
        strcmp(
            mode,
            "managed-copy-orphan-reciprocal-consume") != 0) {
        gate_fail("unknown managed source mutation");
    }
    if (!cold_bodyir_exact_identity_schema_valid(
            body, fixture.symbols,
            "generic-layout-managed-source-mutation")) {
        gate_fail("generic specialization copy authority drifted");
    }
    puts("managed_copy_source_mutation_was_accepted=1");
    gate_fixture_end(&fixture);
    return 0;
}

int main(int argc, char **argv) {
    if (argc == 1 ||
        strcmp(argv[1], "positive") == 0) {
        gate_positive();
        return 0;
    }
    if (strcmp(argv[1], "missing-object-identity") == 0 ||
        strcmp(argv[1], "missing-variant-identity") == 0) {
        return gate_missing_identity(argv[1]);
    }
    if (strncmp(
            argv[1],
            "managed-copy-", 13) == 0) {
        return gate_managed_source_mutation(argv[1]);
    }
    if (strncmp(argv[1], "native-", 7) == 0) {
        gate_native_sequence_mutation(argv[1]);
        return 0;
    }
    if (strcmp(argv[1], "array-index-width") == 0 ||
        strcmp(argv[1], "array-index-ref-width") == 0 ||
        strcmp(argv[1], "array-slot-size") == 0 ||
        strcmp(argv[1], "subword-array-aux") == 0 ||
        strcmp(argv[1], "subword-array-align") == 0) {
        return gate_subword_mutation(argv[1]);
    }
    if (strncmp(argv[1], "freeze-", 7) == 0)
        return gate_freeze_mutation(argv[1]);
    gate_mutation(argv[1]);
    return 0;
}
