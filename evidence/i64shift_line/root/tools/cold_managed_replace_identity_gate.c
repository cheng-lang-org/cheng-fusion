#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

typedef struct GateFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation *compilation;
    Parser parser;
    BodyIR *body;
    ColdFunctionBodyStore body_store;
    Local target;
    ColdExprResult target_value;
    ColdExprResult source;
    int32_t entry_block;
    int32_t target_def;
    int32_t source_def;
} GateFixture;

typedef struct GateSharedParamFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation *compilation;
    Parser parser;
    BodyIR *body;
    ObjectDef *object;
    int32_t function_row;
    int32_t entry_block;
    int32_t raw_param_slots[2];
    ColdExprResult parameters[2];
} GateSharedParamFixture;

typedef struct GateManagedGlobalFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation *compilation;
    Parser parser;
    BodyIR *body;
    ColdFunctionBodyStore body_store;
    Locals locals;
    Local target;
    Local decoy_target;
    ColdExprResult source;
    int32_t target_global_index;
    int32_t decoy_global_index;
    int32_t target_def;
    int32_t source_raw_slot;
    int32_t source_def;
    int32_t previous_def;
    int32_t store;
    int32_t resume_block;
    int32_t value_size;
    int32_t decoy_source_type_id;
} GateManagedGlobalFixture;

typedef struct GateBodyStoreAdmissionFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation *compilation;
    ColdFunctionBodyStore store;
    ObjectDef *object;
    ObjectDef *decoy_object;
    int32_t ordinary_row;
    int32_t template_row;
    int32_t specialization_row;
    int32_t ordinary_origin_row;
    int32_t template_origin_row;
    int32_t ordinary_token_offset;
    int32_t template_token_offset;
    BodyIR *ordinary_body;
    BodyIR *specialization_body;
    int32_t ordinary_param_slots[2];
    int32_t specialization_param_slots[2];
    int32_t ordinary_param_definitions[2];
    int32_t specialization_param_definitions[2];
} GateBodyStoreAdmissionFixture;

static void gate_shared_param_negative_rejected(
    const char *mode);

static Span gate_declaration_source;
static const int32_t gate_declaration_source_row = 0;
static bool gate_declaration_snapshot_active;

static void gate_fail(const char *message) {
    fprintf(stderr, "cold_managed_replace_identity_gate: %s\n", message);
    exit(1);
}

static Arena *gate_arena_new(void) {
    Arena *arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (arena == MAP_FAILED)
        gate_fail("gate arena owner allocation failed");
    return arena;
}

static ColdExprResult gate_emit_exact_frozen_param_definition(
        BodyIR *body, Symbols *symbols,
        int32_t source_slot, int32_t source_kind,
        int32_t param_index, int32_t ownership) {
    if (!body || !symbols ||
        body->producer_function_row < 0 ||
        body->producer_function_row >= symbols->function_count ||
        param_index < 0 || param_index >= body->param_count ||
        source_slot < 0 || source_slot >= body->slot_count ||
        body->param_slot[param_index] != source_slot ||
        body->slot_kind[source_slot] != source_kind) {
        gate_fail("frozen parameter fixture identity is invalid");
    }
    FnDef *function =
        &symbols->functions[body->producer_function_row];
    if (param_index >= function->arity)
        gate_fail("frozen parameter fixture exceeds formal signature");
    int32_t exact_type_id = -1;
    int32_t formal_object_is_ref = -1;
    int32_t storage =
        cold_frozen_formal_storage_for_param(
            body, symbols, source_slot, source_kind,
            param_index, &exact_type_id,
            &formal_object_is_ref);
    if (storage == COLD_MANAGED_STORAGE_UNKNOWN ||
        exact_type_id < 0 ||
        exact_type_id !=
            function->param_exact_type_id[param_index] ||
        formal_object_is_ref !=
            function->param_exact_object_is_ref[param_index]) {
        gate_fail("frozen parameter fixture authority drifted");
    }
    return cold_emit_exact_param_definition(
        body, symbols, source_slot, source_kind,
        param_index, ownership, storage,
        exact_type_id, formal_object_is_ref);
}

static void gate_declaration_snapshot_begin(void) {
    const char *package_root = getenv(
        "CHENG_COLD_MANAGED_REPLACE_DECLARATION_ROOT");
    const char *source_path = getenv(
        "CHENG_COLD_MANAGED_REPLACE_DECLARATION_SOURCE");
    if (!package_root || !package_root[0] ||
        !source_path || !source_path[0]) {
        gate_fail("managed replace declaration snapshot input is missing");
    }
    char resolved_root[PATH_MAX];
    char resolved_source[PATH_MAX];
    if (!realpath(package_root, resolved_root) ||
        !realpath(source_path, resolved_source)) {
        gate_fail("managed replace declaration snapshot path is invalid");
    }
    size_t root_length = strlen(resolved_root);
    if (root_length == 0 ||
        strncmp(resolved_source, resolved_root, root_length) != 0 ||
        resolved_source[root_length] != '/') {
        gate_fail("managed replace declaration source escaped package root");
    }
    gate_declaration_source = source_open_raw(resolved_source);
    if (!gate_declaration_source.ptr ||
        gate_declaration_source.len <= 0) {
        gate_fail("managed replace declaration source is missing");
    }
    gate_declaration_snapshot_active = true;
}

static void gate_declaration_snapshot_end(void) {
    if (!gate_declaration_snapshot_active)
        gate_fail("managed replace declaration snapshot is not active");
    source_close(gate_declaration_source);
    gate_declaration_source = (Span){0};
    gate_declaration_snapshot_active = false;
}

static void gate_compilation_begin(
        ColdHarnessCompilation *compilation, Arena *arena) {
    if (!gate_declaration_snapshot_active ||
        !gate_declaration_source.ptr ||
        gate_declaration_source.len <= 0) {
        gate_fail("managed replace declaration source owner is inactive");
    }
    cold_harness_compilation_begin(compilation, arena);
    (void)cold_harness_compilation_seal_source(
        compilation, gate_declaration_source,
        "managed_replace_identity_gate");
}

#define cold_harness_compilation_begin(compilation, arena) \
    gate_compilation_begin((compilation), (arena))

static int32_t gate_declaration_name_offset(Span name) {
    if (!gate_declaration_snapshot_active ||
        gate_declaration_source_row < 0 ||
        !name.ptr || name.len <= 0) {
        gate_fail("managed replace declaration lookup is unavailable");
    }
    int32_t found = -1;
    for (int32_t offset = 0;
         offset + name.len <= gate_declaration_source.len;
         offset++) {
        if (memcmp(
                gate_declaration_source.ptr + offset,
                name.ptr, (size_t)name.len) != 0) {
            continue;
        }
        if (offset > 0) {
            uint8_t before =
                gate_declaration_source.ptr[offset - 1];
            if ((before >= 'A' && before <= 'Z') ||
                (before >= 'a' && before <= 'z') ||
                (before >= '0' && before <= '9') ||
                before == '_') {
                continue;
            }
        }
        int32_t after = offset + name.len;
        if (after < gate_declaration_source.len) {
            uint8_t next = gate_declaration_source.ptr[after];
            if ((next >= 'A' && next <= 'Z') ||
                (next >= 'a' && next <= 'z') ||
                (next >= '0' && next <= '9') ||
                next == '_') {
                continue;
            }
        }
        while (after < gate_declaration_source.len &&
               (gate_declaration_source.ptr[after] == ' ' ||
                gate_declaration_source.ptr[after] == '\t')) {
            after++;
        }
        if (after >= gate_declaration_source.len ||
            gate_declaration_source.ptr[after] != '=') {
            continue;
        }
        if (found >= 0)
            gate_fail("managed replace declaration identity is ambiguous");
        found = offset;
    }
    if (found < 0)
        gate_fail("managed replace declaration identity is missing");
    return found;
}

static Span gate_declaration_unique_source(Span needle) {
    if (!gate_declaration_snapshot_active ||
        !needle.ptr || needle.len <= 0) {
        gate_fail("managed replace declaration source lookup is invalid");
    }
    int32_t found = -1;
    for (int32_t offset = 0;
         offset + needle.len <= gate_declaration_source.len;
         offset++) {
        if (memcmp(
                gate_declaration_source.ptr + offset,
                needle.ptr, (size_t)needle.len) != 0) {
            continue;
        }
        if (found >= 0)
            gate_fail("managed replace declaration source is ambiguous");
        found = offset;
    }
    if (found < 0)
        gate_fail("managed replace declaration source is missing");
    return span_sub(
        gate_declaration_source,
        found,
        gate_declaration_source.len);
}

static bool gate_declaration_ident_byte(uint8_t value) {
    return (value >= 'A' && value <= 'Z') ||
           (value >= 'a' && value <= 'z') ||
           (value >= '0' && value <= '9') ||
           value == '_';
}

static int32_t gate_declaration_function_token_offset(
        const char *function_name) {
    if (!gate_declaration_snapshot_active ||
        !function_name || !function_name[0]) {
        gate_fail("function declaration token name is missing");
    }
    size_t name_size = strlen(function_name);
    if (name_size > INT32_MAX)
        gate_fail("function declaration token name is too long");
    int32_t name_length = (int32_t)name_size;
    int32_t found = -1;
    bool line_has_code = false;
    bool line_comment = false;
    bool quoted = false;
    bool triple_quoted = false;
    bool escaped = false;
    uint8_t quote = 0;
    for (int32_t offset = 0;
         offset < gate_declaration_source.len;) {
        uint8_t value =
            gate_declaration_source.ptr[offset];
        if (line_comment) {
            if (value == '\n') {
                line_comment = false;
                line_has_code = false;
            }
            offset++;
            continue;
        }
        if (triple_quoted) {
            if (value == '"' &&
                offset + 2 <
                    gate_declaration_source.len &&
                gate_declaration_source.ptr[
                    offset + 1] == '"' &&
                gate_declaration_source.ptr[
                    offset + 2] == '"') {
                triple_quoted = false;
                offset += 3;
                continue;
            }
            offset++;
            continue;
        }
        if (quoted) {
            if (escaped) {
                escaped = false;
            } else if (value == '\\') {
                escaped = true;
            } else if (value == quote) {
                quoted = false;
            }
            offset++;
            continue;
        }
        if (value == '\n') {
            line_has_code = false;
            offset++;
            continue;
        }
        if (!line_has_code &&
            (value == ' ' || value == '\t' ||
             value == '\r')) {
            offset++;
            continue;
        }
        if (value == '#') {
            line_comment = true;
            offset++;
            continue;
        }
        if (value == '"' &&
            offset + 2 <
                gate_declaration_source.len &&
            gate_declaration_source.ptr[
                offset + 1] == '"' &&
            gate_declaration_source.ptr[
                offset + 2] == '"') {
            triple_quoted = true;
            line_has_code = true;
            offset += 3;
            continue;
        }
        if (value == '"' || value == '\'') {
            quoted = true;
            quote = value;
            escaped = false;
            line_has_code = true;
            offset++;
            continue;
        }
        if (!line_has_code &&
            value == 'f' &&
            offset + 2 <
                gate_declaration_source.len &&
            gate_declaration_source.ptr[
                offset + 1] == 'n' &&
            (gate_declaration_source.ptr[
                 offset + 2] == ' ' ||
             gate_declaration_source.ptr[
                 offset + 2] == '\t')) {
            int32_t name_offset = offset + 2;
            while (name_offset <
                       gate_declaration_source.len &&
                   (gate_declaration_source.ptr[
                        name_offset] == ' ' ||
                    gate_declaration_source.ptr[
                        name_offset] == '\t')) {
                name_offset++;
            }
            int64_t name_end_64 =
                (int64_t)name_offset + name_length;
            if (name_end_64 <=
                    gate_declaration_source.len &&
                memcmp(
                    gate_declaration_source.ptr +
                        name_offset,
                    function_name,
                    name_size) == 0) {
                int32_t name_end =
                    (int32_t)name_end_64;
                if ((name_offset == 0 ||
                     !gate_declaration_ident_byte(
                         gate_declaration_source.ptr[
                             name_offset - 1])) &&
                    (name_end >=
                         gate_declaration_source.len ||
                     !gate_declaration_ident_byte(
                         gate_declaration_source.ptr[
                             name_end]))) {
                    int32_t suffix = name_end;
                    if (suffix <
                            gate_declaration_source.len &&
                        (gate_declaration_source.ptr[
                             suffix] == '(' ||
                         gate_declaration_source.ptr[
                             suffix] == '[')) {
                        if (found >= 0) {
                            gate_fail(
                                "function declaration token identity is ambiguous");
                        }
                        found = offset;
                    }
                }
            }
        }
        line_has_code = true;
        offset++;
    }
    if (quoted || triple_quoted) {
        gate_fail(
            "function declaration source has unterminated quoted text");
    }
    if (found < 0) {
        gate_fail(
            "function declaration token identity is missing");
    }
    return found;
}

static int32_t gate_declaration_offset_after_unique_marker(
        const char *marker) {
    if (!marker || !marker[0])
        gate_fail("declaration marker is missing");
    Span marker_span = cold_cstr_span(marker);
    Span match =
        gate_declaration_unique_source(marker_span);
    ptrdiff_t offset =
        match.ptr - gate_declaration_source.ptr;
    if (offset < 0 ||
        offset > INT32_MAX - marker_span.len) {
        gate_fail("declaration marker offset is invalid");
    }
    return (int32_t)offset + marker_span.len;
}

static int32_t gate_declaration_same_line_ident_offset(
        int32_t token_offset, const char *identifier) {
    if (!identifier || !identifier[0] ||
        token_offset < 0 ||
        token_offset >= gate_declaration_source.len) {
        gate_fail("declaration same-line identifier input is invalid");
    }
    size_t identifier_size = strlen(identifier);
    int32_t line_end = token_offset;
    while (line_end < gate_declaration_source.len &&
           gate_declaration_source.ptr[line_end] != '\n') {
        line_end++;
    }
    for (int32_t offset = token_offset;
         (int64_t)offset + identifier_size <= line_end;
         offset++) {
        if (memcmp(
                gate_declaration_source.ptr + offset,
                identifier, identifier_size) != 0) {
            continue;
        }
        int32_t after =
            offset + (int32_t)identifier_size;
        if ((offset == token_offset ||
             !gate_declaration_ident_byte(
                 gate_declaration_source.ptr[offset - 1])) &&
            (after >= line_end ||
             !gate_declaration_ident_byte(
                 gate_declaration_source.ptr[after]))) {
            return offset;
        }
    }
    gate_fail(
        "declaration same-line identifier is missing");
    return -1;
}

static ObjectDef *gate_add_declared_object(
        Symbols *symbols, Span name, int32_t field_count) {
    int32_t token_offset =
        gate_declaration_name_offset(name);
    return symbols_add_object_at_origin(
        symbols, name, field_count,
        gate_declaration_source_row,
        token_offset);
}

static void gate_set_marker_object(ObjectDef *object) {
    if (!object || object->field_count != 1)
        gate_fail("managed marker object fixture is invalid");
    object->fields[0].name = cold_cstr_span("marker");
    object->fields[0].kind = SLOT_I32;
    object->fields[0].size = 4;
    object->fields[0].type_name = cold_cstr_span("int32");
}

static void gate_set_marks_object(ObjectDef *object) {
    if (!object || object->field_count != 1)
        gate_fail("managed marks object fixture is invalid");
    object->fields[0].name = cold_cstr_span("marks");
    object->fields[0].kind = SLOT_SEQ_I32;
    object->fields[0].size = 16;
    object->fields[0].type_name =
        cold_cstr_span("int32[]");
}

static void gate_publish_exact_ref_formal(
        Symbols *symbols, int32_t function_row,
        Span param_type, ObjectDef *object) {
    if (!symbols || function_row < 0 ||
        function_row >= symbols->function_count ||
        !object || object < symbols->objects ||
        object >= symbols->objects + symbols->object_count) {
        gate_fail("managed formal identity producer is invalid");
    }
    symbols_set_fn_param_types(
        symbols, function_row, &param_type, 1);
    cold_publish_exact_formal_type_ids(
        symbols, function_row);
    FnDef *function =
        &symbols->functions[function_row];
    int32_t object_row =
        (int32_t)(object - symbols->objects);
    object_row = cold_canonical_object_identity(
        symbols, object_row);
    if (object_row < 0 ||
        object_row >= symbols->object_count) {
        gate_fail(
            "managed formal canonical object identity is invalid");
    }
    ObjectDef *canonical_object =
        &symbols->objects[object_row];
    int32_t expected_type_id =
        SLOT_OBJECT_REF * 1048576 +
        object_row + 1;
    if (function->arity != 1 ||
        function->param_exact_type_id[0] !=
            expected_type_id ||
        function->param_exact_object_is_ref[0] !=
            (canonical_object->is_ref ? 1 : 0)) {
        gate_fail(
            "managed formal exact TypeId authority was not published");
    }
}

static void gate_shared_param_fixture_init(
        GateSharedParamFixture *fixture) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = gate_arena_new();
    fixture->compilation = arena_alloc(
        fixture->arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(
        fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation->symbols;
    fixture->body = body_new(fixture->arena);
    fixture->object = gate_add_declared_object(
        fixture->symbols,
        cold_cstr_span("ManagedSharedParamGateRef"), 1);
    if (!fixture->object)
        gate_fail("shared ref parameter object registration failed");
    fixture->object->is_ref = true;
    gate_set_marks_object(fixture->object);
    object_finalize_fields(fixture->object);

    int32_t param_kinds[2] = {
        SLOT_PTR, SLOT_PTR,
    };
    int32_t param_sizes[2] = {8, 8};
    Span param_types[2] = {
        fixture->object->name,
        fixture->object->name,
    };
    fixture->function_row = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("ManagedSharedParamGate"),
        2, param_kinds, param_sizes, param_types,
        cold_cstr_span(""));
    if (fixture->function_row < 0)
        gate_fail("shared ref parameter function registration failed");
    FnDef *function =
        &fixture->symbols->functions[
            fixture->function_row];
    function->borrows_args = true;
    symbols_set_fn_param_types(
        fixture->symbols, fixture->function_row,
        param_types, 2);
    cold_publish_exact_formal_type_ids(
        fixture->symbols, fixture->function_row);
    int32_t object_row =
        cold_canonical_object_identity(
            fixture->symbols,
            symbols_object_index(
                fixture->symbols,
                fixture->object));
    int32_t expected_type_id =
        SLOT_OBJECT_REF * 1048576 +
        object_row + 1;
    for (int32_t param_index = 0;
         param_index < 2; param_index++) {
        if (function->param_exact_type_id[
                param_index] != expected_type_id ||
            function->param_exact_object_is_ref[
                param_index] != 1) {
            gate_fail(
                "shared ref parameter formal authority was not published");
        }
    }

    fixture->body->producer_function_row =
        fixture->function_row;
    fixture->body->debug_name =
        cold_cstr_span("managed_shared_param_gate");
    fixture->parser.arena = fixture->arena;
    fixture->parser.symbols = fixture->symbols;
    fixture->entry_block =
        body_block(fixture->body);
    fixture->body->param_count = 2;
    for (int32_t param_index = 0;
         param_index < 2; param_index++) {
        int32_t raw_param =
            body_slot(fixture->body, SLOT_PTR, 8);
        body_slot_set_type(
            fixture->body, raw_param,
            fixture->object->name);
        fixture->raw_param_slots[
            param_index] = raw_param;
        fixture->body->param_slot[
            param_index] = raw_param;
        fixture->body->param_name[
            param_index] =
                param_index == 0
                    ? cold_cstr_span("source")
                    : cold_cstr_span("decoy");
    }
    for (int32_t param_index = 0;
         param_index < 2; param_index++) {
        fixture->parameters[param_index] =
            gate_emit_exact_frozen_param_definition(
                fixture->body, fixture->symbols,
                fixture->raw_param_slots[
                    param_index],
                SLOT_PTR, param_index,
                COLD_EXPR_OWN_BORROW_SHARED);
        ColdExprResult *parameter =
            &fixture->parameters[param_index];
        int32_t definition =
            parameter->value_def_op_id;
        if (parameter->kind != SLOT_PTR ||
            parameter->place_kind !=
                COLD_EXPR_PLACE_PARAM ||
            parameter->ownership !=
                COLD_EXPR_OWN_BORROW_SHARED ||
            parameter->origin_id !=
                param_index ||
            definition < 0 ||
            definition >=
                fixture->body->op_count ||
            fixture->body->op_kind[
                definition] !=
                BODY_OP_COPY_I64 ||
            fixture->body->op_a[
                definition] !=
                fixture->raw_param_slots[
                    param_index] ||
            fixture->body->op_b[
                definition] != 1 ||
            fixture->body->op_c[
                definition] != 0 ||
            !cold_exact_op_tuple_matches_result(
                fixture->body, parameter)) {
            gate_fail(
                "shared ref parameter source tuple is not exact");
        }
    }
}

static bool gate_shared_param_view_contract(
        const GateSharedParamFixture *fixture,
        const ColdExprResult *source,
        const ColdExprResult *view) {
    if (!fixture || !fixture->body ||
        !fixture->symbols || !source || !view ||
        !cold_exact_shared_ref_param_pointer_value_shape(
            fixture->body, fixture->symbols,
            source) ||
        view->value_def_op_id < 0 ||
        view->value_def_op_id >=
            fixture->body->op_count) {
        return false;
    }
    int32_t definition =
        view->value_def_op_id;
    return view->kind == SLOT_OBJECT_REF &&
           view->place_kind ==
               COLD_EXPR_PLACE_BORROW_PROJECTION &&
           view->ownership ==
               COLD_EXPR_OWN_BORROW_SHARED &&
           view->origin_id ==
               source->value_def_op_id &&
           fixture->body->op_kind[
               definition] ==
               BODY_OP_COPY_I64 &&
           fixture->body->op_dst[
               definition] == view->slot &&
           fixture->body->op_a[
               definition] == source->slot &&
           fixture->body->op_b[
               definition] == 0 &&
           fixture->body->op_c[
               definition] == 0 &&
           fixture->body->op_value_def_origin_id[
               definition] ==
               source->value_def_op_id &&
           fixture->body->op_source_value_def_op_id[
               definition] == -1 &&
           fixture->body
                   ->op_value_def_consume_op_index_plus_one[
                       source->value_def_op_id] == 0 &&
           cold_exact_op_tuple_matches_result(
               fixture->body, view);
}

static bool gate_exact_nonparam_ref_source_contract(
        BodyIR *body, Symbols *symbols,
        const ColdExprResult *source,
        int32_t expected_place) {
    if (!body || !symbols || !source ||
        source->slot < 0 ||
        source->slot >= body->slot_count ||
        source->kind != SLOT_PTR ||
        body->slot_kind[source->slot] != SLOT_PTR ||
        body->slot_size[source->slot] != 8 ||
        source->value_def_op_id < 0 ||
        source->value_def_op_id >= body->op_count ||
        source->place_kind != expected_place ||
        source->producer_function_row !=
            body->producer_function_row ||
        !cold_exact_op_tuple_matches_result(
            body, source) ||
        body->slot_exact_type_id[
            source->slot] != source->exact_type_id ||
        body->slot_place_kind[
            source->slot] != source->place_kind ||
        body->slot_origin_id[
            source->slot] != source->origin_id ||
        body->slot_managed_storage_kind[
            source->slot] !=
                COLD_MANAGED_STORAGE_OBJECT ||
        cold_exact_managed_type_id(
            symbols, body,
            source->slot, source->kind) !=
                source->exact_type_id ||
        cold_exact_managed_storage_for_slot(
            symbols, body,
            source->slot, source->kind) !=
                COLD_MANAGED_STORAGE_OBJECT ||
        body->op_value_def_consume_op_index_plus_one[
            source->value_def_op_id] != 0 ||
        cold_current_open_block(body) < 0 ||
        !cold_exact_definition_is_live_at_current_point(
            body, source->value_def_op_id,
            cold_current_open_block(body))) {
        return false;
    }
    int32_t definition =
        source->value_def_op_id;
    if (expected_place == COLD_EXPR_PLACE_GLOBAL) {
        return source->ownership ==
                   COLD_EXPR_OWN_BORROW_SHARED &&
               body->op_kind[definition] ==
                   BODY_OP_GLOBAL_ADDR &&
               body->op_dst[definition] ==
                   source->slot &&
               body->op_a[definition] ==
                   source->origin_id &&
               body->op_b[definition] == 0 &&
               body->op_c[definition] == 0 &&
               body->op_source_value_def_op_id[
                   definition] == -1;
    }
    if (expected_place ==
            COLD_EXPR_PLACE_STACK_LOCAL) {
        int32_t root_slot =
            body->op_a[definition];
        return source->ownership ==
                   COLD_EXPR_OWN_BORROW_SHARED &&
               body->op_kind[definition] ==
                   BODY_OP_COPY_I64 &&
               body->op_dst[definition] ==
                   source->slot &&
               body->op_b[definition] == 0 &&
               body->op_c[definition] == 0 &&
               source->origin_id == source->slot &&
               root_slot >= 0 &&
               root_slot < body->slot_count &&
               cold_exact_slot_authority_is_sentinel(
                   body, root_slot) &&
               body->op_source_value_def_op_id[
                   definition] == -1;
    }
    if (expected_place == COLD_EXPR_PLACE_TEMPORARY) {
        return source->ownership == COLD_EXPR_OWN_MOVE &&
               body->op_kind[definition] ==
                   BODY_OP_PTR_CONST &&
               body->op_dst[definition] ==
                   source->slot &&
               body->op_a[definition] == 0 &&
               body->op_b[definition] == 0 &&
               body->op_c[definition] == 0 &&
               source->origin_id == definition &&
               body->op_source_value_def_op_id[
                   definition] == -1 &&
               cold_exact_owned_ref_pointer_value_shape(
                   source);
    }
    return false;
}

static void gate_run_shared_param_nonparam_capability_negative(
        const char *mode) {
    Arena *arena = gate_arena_new();
    ColdHarnessCompilation *compilation = arena_alloc(
        arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(compilation, arena);
    Symbols *symbols = compilation->symbols;
    ObjectDef *object = gate_add_declared_object(
        symbols,
        cold_cstr_span("ManagedSharedParamGateRef"), 1);
    if (!object)
        gate_fail(
            "non-param ref source object registration failed");
    object->is_ref = true;
    gate_set_marks_object(object);
    object_finalize_fields(object);
    int32_t function_row = symbols_add_fn(
        symbols,
        cold_cstr_span(
            "ManagedSharedParamNonParamCapabilityGate"),
        0, 0, 0, 0, cold_cstr_span(""));
    if (function_row < 0)
        gate_fail(
            "non-param ref source function registration failed");
    BodyIR *body = body_new(arena);
    body->producer_function_row = function_row;
    body->debug_name =
        cold_cstr_span(
            "managed_shared_param_nonparam_capability_gate");
    int32_t entry_block = body_block(body);
    ColdExprResult source;
    cold_expr_result_reset(&source);
    int32_t expected_place = COLD_EXPR_PLACE_INVALID;

    if (strcmp(
            mode,
            "shared-ref-param-global") == 0) {
        symbols_add_global(
            symbols,
            cold_cstr_span(
                "managedSharedParamAlternativeGlobal"),
            SLOT_PTR, 8, object->name,
            (Span){0}, (Span){0});
        if (symbols->global_count != 1)
            gate_fail(
                "non-param global source row drifted");
        Parser parser = cold_parser_issue_legacy_span(
            symbols, (Span){0});
        Locals locals;
        locals_init(&locals, arena);
        Local *global = locals_add_global_shadow(
            &parser, body, &locals,
            cold_cstr_span(
                "managedSharedParamAlternativeGlobal"),
            &symbols->globals[0]);
        if (!global ||
            !cold_exact_result_from_definition(
                body, global->slot,
                global->value_def_op_id, &source)) {
            gate_fail(
                "non-param global source was not published");
        }
        expected_place = COLD_EXPR_PLACE_GLOBAL;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-stack") == 0) {
        int32_t root_slot =
            body_slot(body, SLOT_PTR, 8);
        body_slot_set_type(
            body, root_slot, object->name);
        source = cold_emit_exact_root_borrow_copy(
            body, symbols,
            root_slot, SLOT_PTR);
        expected_place =
            COLD_EXPR_PLACE_STACK_LOCAL;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-temporary") == 0) {
        int32_t slot =
            body_slot(body, SLOT_PTR, 8);
        body_slot_set_type(
            body, slot, object->name);
        int32_t definition = body_op(
            body, BODY_OP_PTR_CONST,
            slot, 0, 0);
        cold_publish_exact_managed_definition(
            body, symbols, slot, SLOT_PTR,
            definition, COLD_EXPR_OWN_MOVE,
            &source);
        expected_place = COLD_EXPR_PLACE_TEMPORARY;
    } else {
        gate_fail(
            "unknown non-param ref capability mode");
    }
    if (!gate_exact_nonparam_ref_source_contract(
            body, symbols,
            &source, expected_place)) {
        gate_fail(
            "non-param ref source exact DOD contract failed");
    }
    if (cold_exact_shared_ref_param_pointer_value_shape(
            body, symbols, &source)) {
        gate_fail(
            "non-param ref source was accepted as shared parameter");
    }
    int32_t terminal = body_term(
        body, BODY_TERM_RET,
        -1, 0, 0, -1, -1);
    body_end_block(
        body, entry_block, terminal);
    if (!cold_bodyir_exact_identity_schema_valid(
            body, symbols, mode)) {
        gate_fail(
            "non-param ref source canonical schema was rejected");
    }
    arena_release(arena);
    gate_shared_param_negative_rejected(mode);
}

static void gate_managed_global_set_object_fields(
        ObjectDef *object, ObjectDef *token) {
    if (!object || !token || object->field_count != 2)
        gate_fail("managed global object fixture is invalid");
    object->fields[0].name = cold_cstr_span("token");
    object->fields[0].kind = SLOT_PTR;
    object->fields[0].size = 8;
    object->fields[0].type_name = token->name;
    object->fields[1].name = cold_cstr_span("generation");
    object->fields[1].kind = SLOT_I64;
    object->fields[1].size = 8;
    object->fields[1].type_name = cold_cstr_span("int64");
    object_finalize_fields(object);
    if (object->slot_size != 16)
        gate_fail("managed global object fixture width drifted");
}

static void gate_managed_global_fixture_init(
        GateManagedGlobalFixture *fixture, bool seal) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = gate_arena_new();
    fixture->compilation = arena_alloc(
        fixture->arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(
        fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation->symbols;
    fixture->body = body_new(fixture->arena);
    ObjectDef *token = gate_add_declared_object(
        fixture->symbols,
        cold_cstr_span("ManagedGlobalSchemaToken"), 1);
    if (!token)
        gate_fail("managed global token registration failed");
    token->is_ref = true;
    gate_set_marker_object(token);
    object_finalize_fields(token);
    ObjectDef *owner = gate_add_declared_object(
        fixture->symbols,
        cold_cstr_span("ManagedGlobalSchemaOwner"), 2);
    gate_managed_global_set_object_fields(owner, token);
    ObjectDef *decoy_owner = gate_add_declared_object(
        fixture->symbols,
        cold_cstr_span("ManagedGlobalSchemaDecoyOwner"), 2);
    gate_managed_global_set_object_fields(decoy_owner, token);

    symbols_add_global(
        fixture->symbols,
        cold_cstr_span("managedGlobalSchemaTarget"),
        SLOT_OBJECT, owner->slot_size, owner->name,
        (Span){0}, (Span){0});
    symbols_add_global(
        fixture->symbols,
        cold_cstr_span("managedGlobalSchemaDecoy"),
        SLOT_OBJECT, owner->slot_size, owner->name,
        (Span){0}, (Span){0});
    if (fixture->symbols->global_count != 2)
        gate_fail("managed global fixture rows drifted");
    fixture->target_global_index = 0;
    fixture->decoy_global_index = 1;

    int32_t function_row = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("ManagedGlobalSchemaGate"),
        0, 0, 0, 0, cold_cstr_span(""));
    if (function_row < 0)
        gate_fail("managed global fixture function registration failed");
    fixture->body->producer_function_row = function_row;
    fixture->body->debug_name =
        cold_cstr_span("managed_global_schema_gate");
    cold_function_body_store_init(
        &fixture->body_store, fixture->arena,
        fixture->symbols->function_cap);
    fixture->parser.arena = fixture->arena;
    fixture->parser.symbols = fixture->symbols;
    fixture->parser.source = cold_cstr_span("managedSource");
    fixture->parser.function_body_store = &fixture->body_store;
    fixture->parser.function_bodies = fixture->body_store.items;
    fixture->parser.function_body_cap = fixture->body_store.cap;
    int32_t entry_block = body_block(fixture->body);
    locals_init(&fixture->locals, fixture->arena);

    Local *target = locals_add_global_shadow(
        &fixture->parser, fixture->body, &fixture->locals,
        cold_cstr_span("managedGlobalSchemaTarget"),
        &fixture->symbols->globals[fixture->target_global_index]);
    if (!target)
        gate_fail("managed global target shadow is missing");
    fixture->target = *target;
    fixture->target_def = target->value_def_op_id;
    Local *decoy_target = locals_add_global_shadow(
        &fixture->parser, fixture->body, &fixture->locals,
        cold_cstr_span("managedGlobalSchemaDecoy"),
        &fixture->symbols->globals[fixture->decoy_global_index]);
    if (!decoy_target)
        gate_fail("managed global decoy shadow is missing");
    fixture->decoy_target = *decoy_target;

    fixture->source_raw_slot = body_slot(
        fixture->body, SLOT_OBJECT, owner->slot_size);
    body_slot_set_type(
        fixture->body, fixture->source_raw_slot, owner->name);
    int32_t source_root = body_op3(
        fixture->body, BODY_OP_MAKE_COMPOSITE,
        fixture->source_raw_slot, 0, -1, 0);
    ColdExprResult source_temporary;
    cold_expr_result_reset(&source_temporary);
    cold_publish_owned_managed_producer(
        fixture->body, fixture->symbols,
        fixture->source_raw_slot, SLOT_OBJECT,
        source_root, &source_temporary);
    fixture->source = cold_emit_exact_bind_local_move(
        fixture->body, fixture->symbols,
        &source_temporary);
    fixture->source_def = fixture->source.value_def_op_id;
    fixture->value_size =
        fixture->body->slot_size[fixture->source.slot];
    body_slot_set_type(
        fixture->body, fixture->source.slot, decoy_owner->name);
    fixture->decoy_source_type_id =
        cold_exact_managed_type_id(
            fixture->symbols, fixture->body,
            fixture->source.slot, SLOT_OBJECT);
    body_slot_set_type(
        fixture->body, fixture->source.slot, owner->name);

    fixture->resume_block =
        cold_emit_exact_managed_global_replace(
            &fixture->parser, fixture->body, fixture->symbols,
            &fixture->target, &fixture->source);
    fixture->store = -1;
    fixture->previous_def = -1;
    for (int32_t op = fixture->source_def + 1;
         op < fixture->body->op_count; op++) {
        if (fixture->body->op_kind[op] ==
                BODY_OP_PAYLOAD_LOAD &&
            fixture->body->op_a[op] == fixture->target.slot &&
            fixture->body->op_b[op] == 0 &&
            fixture->body->op_c[op] == fixture->value_size &&
            fixture->body->op_value_def_ownership[op] ==
                COLD_EXPR_OWN_MOVE) {
            if (fixture->previous_def >= 0)
                gate_fail("managed global previous owner is not unique");
            fixture->previous_def = op;
        }
        if (fixture->body->op_kind[op] ==
                BODY_OP_PAYLOAD_STORE &&
            fixture->body->op_dst[op] == fixture->target.slot &&
            fixture->body->op_a[op] == fixture->source.slot &&
            fixture->body->op_source_value_def_op_id[op] ==
                fixture->source_def) {
            if (fixture->store >= 0)
                gate_fail("managed global store is not unique");
            fixture->store = op;
        }
    }
    if (entry_block < 0 || fixture->previous_def < 0 ||
        fixture->store < 0 ||
        fixture->resume_block !=
            cold_current_open_block(fixture->body)) {
        gate_fail("managed global production sequence is incomplete");
    }
    if (!seal) return;
    int32_t terminal = body_term(
        fixture->body, BODY_TERM_RET,
        -1, 0, 0, -1, -1);
    body_end_block(
        fixture->body, fixture->resume_block, terminal);
    if (!cold_bodyir_exact_identity_schema_valid(
            fixture->body, fixture->symbols,
            "managed-global-schema-positive")) {
        gate_fail("managed global positive schema tuple was rejected");
    }
}

static void gate_check_managed_global_schema_positive(void) {
    GateManagedGlobalFixture fixture;
    gate_managed_global_fixture_init(&fixture, true);
    BodyIR *body = fixture.body;
    if (body->op_kind[fixture.target_def] !=
            BODY_OP_GLOBAL_ADDR ||
        body->op_dst[fixture.target_def] != fixture.target.slot ||
        body->op_a[fixture.target_def] !=
            fixture.target_global_index ||
        body->op_b[fixture.target_def] != 0 ||
        body->op_c[fixture.target_def] != 0 ||
        body->op_value_def_place_kind[fixture.target_def] !=
            COLD_EXPR_PLACE_GLOBAL ||
        body->op_value_def_ownership[fixture.target_def] !=
            COLD_EXPR_OWN_BORROW_SHARED ||
        body->op_value_def_origin_id[fixture.target_def] !=
            fixture.target_global_index ||
        body->op_value_def_place_kind[fixture.source_def] !=
            COLD_EXPR_PLACE_STACK_LOCAL ||
        body->op_value_def_ownership[fixture.source_def] !=
            COLD_EXPR_OWN_MOVE ||
        body->op_kind[fixture.store] != BODY_OP_PAYLOAD_STORE ||
        body->op_dst[fixture.store] != fixture.target.slot ||
        body->op_a[fixture.store] != fixture.source.slot ||
        body->op_b[fixture.store] != 0 ||
        body->op_c[fixture.store] != fixture.value_size ||
        body->op_source_value_def_op_id[fixture.store] !=
            fixture.source_def ||
        body->op_value_def_consume_op_index_plus_one[
            fixture.source_def] != fixture.store + 1 ||
        body->op_kind[fixture.previous_def] !=
            BODY_OP_PAYLOAD_LOAD ||
        body->op_a[fixture.previous_def] != fixture.target.slot) {
        fprintf(
            stderr,
            "cold_managed_replace_identity_gate: managed global tuple "
            "target=%d kind=%d dst=%d a=%d b=%d c=%d place=%d own=%d origin=%d "
            "source=%d place=%d own=%d store=%d kind=%d dst=%d a=%d b=%d c=%d edge=%d consume=%d "
            "previous=%d kind=%d a=%d\n",
            fixture.target_def,
            body->op_kind[fixture.target_def],
            body->op_dst[fixture.target_def],
            body->op_a[fixture.target_def],
            body->op_b[fixture.target_def],
            body->op_c[fixture.target_def],
            body->op_value_def_place_kind[fixture.target_def],
            body->op_value_def_ownership[fixture.target_def],
            body->op_value_def_origin_id[fixture.target_def],
            fixture.source_def,
            body->op_value_def_place_kind[fixture.source_def],
            body->op_value_def_ownership[fixture.source_def],
            fixture.store,
            body->op_kind[fixture.store],
            body->op_dst[fixture.store],
            body->op_a[fixture.store],
            body->op_b[fixture.store],
            body->op_c[fixture.store],
            body->op_source_value_def_op_id[fixture.store],
            body->op_value_def_consume_op_index_plus_one[
                fixture.source_def],
            fixture.previous_def,
            body->op_kind[fixture.previous_def],
            body->op_a[fixture.previous_def]);
        gate_fail("managed global positive tuple drifted");
    }
    puts("managed_global_schema_tuple_valid=1");
    arena_release(fixture.arena);
}

static void gate_check_managed_global_schema_double_replace_positive(void) {
    GateManagedGlobalFixture fixture;
    gate_managed_global_fixture_init(&fixture, false);
    BodyIR *body = fixture.body;
    Span owner_type =
        fixture.symbols->globals[
            fixture.target_global_index].type_name;
    int32_t second_raw = body_slot(
        body, SLOT_OBJECT, fixture.value_size);
    body_slot_set_type(body, second_raw, owner_type);
    int32_t second_root = body_op3(
        body, BODY_OP_MAKE_COMPOSITE,
        second_raw, 0, -1, 0);
    ColdExprResult second_temporary;
    cold_expr_result_reset(&second_temporary);
    cold_publish_owned_managed_producer(
        body, fixture.symbols,
        second_raw, SLOT_OBJECT,
        second_root, &second_temporary);
    ColdExprResult second_source =
        cold_emit_exact_bind_local_move(
            body, fixture.symbols,
            &second_temporary);
    int32_t second_resume =
        cold_emit_exact_managed_global_replace(
            &fixture.parser, body, fixture.symbols,
            &fixture.target, &second_source);
    int32_t second_store = -1;
    int32_t global_store_count = 0;
    for (int32_t op = 0; op < body->op_count; op++) {
        if (body->op_kind[op] != BODY_OP_PAYLOAD_STORE ||
            body->op_dst[op] != fixture.target.slot) {
            continue;
        }
        global_store_count++;
        if (body->op_source_value_def_op_id[op] ==
                second_source.value_def_op_id &&
            body->op_a[op] == second_source.slot) {
            if (second_store >= 0)
                gate_fail("second managed global store is not unique");
            second_store = op;
        }
    }
    if (second_resume != cold_current_open_block(body) ||
        second_store < 0 || global_store_count != 2 ||
        body->op_value_def_consume_op_index_plus_one[
            fixture.source_def] != fixture.store + 1 ||
        body->op_value_def_consume_op_index_plus_one[
            second_source.value_def_op_id] !=
            second_store + 1) {
        gate_fail("managed global double replace chain drifted");
    }
    int32_t terminal = body_term(
        body, BODY_TERM_RET,
        -1, 0, 0, -1, -1);
    body_end_block(body, second_resume, terminal);
    if (!cold_bodyir_exact_identity_schema_valid(
            body, fixture.symbols,
            "managed-global-schema-double-replace")) {
        gate_fail("managed global double replace schema was rejected");
    }
    puts("managed_global_schema_double_replace_valid=1");
    arena_release(fixture.arena);
}

static void gate_run_managed_global_schema_negative(
        const char *mode) {
    GateManagedGlobalFixture fixture;
    gate_managed_global_fixture_init(&fixture, true);
    BodyIR *body = fixture.body;
    if (strcmp(mode, "managed-global-schema-dst") == 0) {
        body->op_dst[fixture.store] = fixture.decoy_target.slot;
    } else if (strcmp(
                   mode,
                   "managed-global-schema-dst-non-global") == 0) {
        body->op_dst[fixture.store] = fixture.source.slot;
    } else if (strcmp(
                   mode,
                   "managed-global-schema-target-definition") == 0) {
        body->op_a[fixture.previous_def] =
            fixture.decoy_target.slot;
    } else if (strcmp(
                   mode,
                   "managed-global-schema-global-origin") == 0) {
        body->op_value_def_origin_id[fixture.target_def] =
            fixture.decoy_global_index;
    } else if (strcmp(
                   mode,
                   "managed-global-schema-op-b-offset") == 0) {
        body->op_b[fixture.store] = 8;
    } else if (strcmp(
                   mode,
                   "managed-global-schema-op-c-width") == 0) {
        body->op_c[fixture.store] = fixture.value_size - 8;
    } else if (strcmp(
                   mode,
                   "managed-global-schema-source-type-id") == 0) {
        body_slot_set_type(
            body, fixture.source_raw_slot,
            cold_cstr_span("ManagedGlobalSchemaDecoyOwner"));
        body_slot_set_type(
            body, fixture.source.slot,
            cold_cstr_span("ManagedGlobalSchemaDecoyOwner"));
        body->op_value_def_exact_type_id[fixture.source_def] =
            fixture.decoy_source_type_id;
        body->slot_exact_type_id[fixture.source.slot] =
            fixture.decoy_source_type_id;
    } else if (strcmp(
                   mode,
                   "managed-global-schema-source-storage") == 0) {
        body->slot_kind[fixture.source_raw_slot] = SLOT_SEQ_I32;
        body->slot_kind[fixture.source.slot] = SLOT_SEQ_I32;
        body_slot_set_type(
            body, fixture.source_raw_slot,
            cold_cstr_span("int32[]"));
        body_slot_set_type(
            body, fixture.source.slot,
            cold_cstr_span("int32[]"));
        int32_t sequence_type_id = SLOT_SEQ_I32 * 1048576;
        body->op_value_def_exact_type_id[fixture.source_def] =
            sequence_type_id;
        body->slot_exact_type_id[fixture.source.slot] =
            sequence_type_id;
        body->slot_managed_storage_kind[fixture.source.slot] =
            COLD_MANAGED_STORAGE_SEQUENCE;
    } else if (strcmp(
                   mode,
                   "managed-global-schema-source-def-consumer") == 0) {
        body->op_source_value_def_op_id[fixture.store] =
            fixture.previous_def;
    } else if (strcmp(
                   mode,
                   "managed-global-schema-call-temporary-store") == 0) {
        body->op_kind[fixture.source_def] =
            BODY_OP_CALL_COMPOSITE;
        body->op_value_def_place_kind[fixture.source_def] =
            COLD_EXPR_PLACE_TEMPORARY;
        body->op_value_def_origin_id[fixture.source_def] =
            fixture.source_def;
        body->slot_place_kind[fixture.source.slot] =
            COLD_EXPR_PLACE_TEMPORARY;
        body->slot_origin_id[fixture.source.slot] =
            fixture.source_def;
    } else {
        gate_fail("unknown managed global schema mutation");
    }
    if (cold_bodyir_exact_identity_schema_valid(
            body, fixture.symbols, mode)) {
        gate_fail("managed global schema mutation was accepted");
    }
    fprintf(
        stderr,
        "cold_managed_replace_identity_gate: managed global schema mutation rejected mode=%s\n",
        mode);
    exit(1);
}

static void gate_fixture_init(GateFixture *fixture) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = gate_arena_new();
    fixture->compilation = arena_alloc(
        fixture->arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(
        fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation->symbols;
    fixture->body = body_new(fixture->arena);
    ObjectDef *gate_object = gate_add_declared_object(
        fixture->symbols, cold_cstr_span("ManagedReplaceGateRef"), 1);
    if (!gate_object)
        gate_fail("ref object identity registration failed");
    gate_object->is_ref = true;
    gate_set_marker_object(gate_object);
    object_finalize_fields(gate_object);
    int32_t param_kind = SLOT_OBJECT_REF;
    int32_t param_size = 8;
    Span param_type = cold_cstr_span("var ManagedReplaceGateRef");
    int32_t gate_function = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("ManagedReplaceIdentityGate"),
        1, &param_kind, &param_size, &param_type,
        cold_cstr_span(""));
    if (gate_function < 0)
        gate_fail("function identity registration failed");
    gate_publish_exact_ref_formal(
        fixture->symbols, gate_function,
        param_type, gate_object);
    fixture->body->producer_function_row = gate_function;
    fixture->body->debug_name =
        cold_cstr_span("managed_replace_identity_gate");
    cold_function_body_store_init(
        &fixture->body_store, fixture->arena,
        fixture->symbols->function_cap);
    fixture->parser.arena = fixture->arena;
    fixture->parser.symbols = fixture->symbols;
    fixture->parser.source = cold_cstr_span("nil");
    fixture->parser.function_body_store =
        &fixture->body_store;
    fixture->parser.function_bodies =
        fixture->body_store.items;
    fixture->parser.function_body_cap =
        fixture->body_store.cap;
    fixture->entry_block = body_block(fixture->body);

    int32_t param_slot =
        body_slot(fixture->body, SLOT_OBJECT_REF, 8);
    body_slot_set_type(
        fixture->body, param_slot,
        cold_cstr_span("var ManagedReplaceGateRef"));
    fixture->body->param_count = 1;
    fixture->body->param_slot[0] = param_slot;
    fixture->body->param_name[0] = cold_cstr_span("target");
    ColdExprResult parameter = gate_emit_exact_frozen_param_definition(
        fixture->body, fixture->symbols, param_slot,
        SLOT_OBJECT_REF, 0,
        COLD_EXPR_OWN_BORROW_UNIQUE);
    fixture->target_value = parameter;
    fixture->target.name = cold_cstr_span("target");
    fixture->target.slot = parameter.slot;
    fixture->target.kind = parameter.kind;
    fixture->target.is_mutable_place = true;
    fixture->target.value_def_op_id =
        parameter.value_def_op_id;
    fixture->target_def = parameter.value_def_op_id;

    int32_t source_slot =
        body_slot(fixture->body, SLOT_PTR, 8);
    int32_t source_op = body_op(
        fixture->body, BODY_OP_PTR_CONST,
        source_slot, 0, 0);
    cold_expr_result_reset(&fixture->source);
    fixture->source.slot = source_slot;
    fixture->source.kind = SLOT_PTR;
    fixture->source.value_def_op_id = source_op;
    fixture->source.producer_function_row =
        fixture->body->producer_function_row;
    fixture->source.place_kind =
        COLD_EXPR_PLACE_TEMPORARY;
    fixture->source.origin_id = source_op;
    if (!cold_contextualize_exact_ref_object_nil(
            fixture->body, fixture->symbols,
            &fixture->target, &fixture->source)) {
        gate_fail("ref object nil contextualization failed");
    }
    fixture->source_def = source_op;
}

static int32_t gate_find_unique_replace(const BodyIR *body) {
    int32_t found = -1;
    for (int32_t op = 0; op < body->op_count; op++) {
        if (body->op_kind[op] !=
                BODY_OP_MANAGED_REF_MOVE_REPLACE) {
            continue;
        }
        if (found >= 0)
            gate_fail("multiple managed replace ops emitted");
        found = op;
    }
    if (found < 0) gate_fail("managed replace op was not emitted");
    return found;
}

static ColdExprResult gate_append_borrow_projection(
        GateFixture *fixture,
        const ColdExprResult *source) {
    if (!fixture || !fixture->body || !source ||
        source->slot < 0 ||
        source->slot >= fixture->body->slot_count ||
        source->value_def_op_id < 0 ||
        source->value_def_op_id >=
            fixture->body->op_count ||
        (source->ownership !=
             COLD_EXPR_OWN_BORROW_SHARED &&
         source->ownership !=
             COLD_EXPR_OWN_BORROW_UNIQUE)) {
        gate_fail("borrow projection source authority missing");
    }
    BodyIR *body = fixture->body;
    int32_t destination = body_slot(
        body, source->kind,
        body->slot_size[source->slot]);
    body_slot_set_type(
        body, destination,
        body->slot_type[source->slot]);
    body->slot_aux[destination] =
        body->slot_aux[source->slot];
    body->slot_no_alias[destination] =
        body->slot_no_alias[source->slot];
    int32_t definition = body_op(
        body, BODY_OP_COPY_I64,
        destination, source->slot, 0);
    body->op_value_def_slot[definition] = destination;
    body->op_value_def_exact_type_id[definition] =
        source->exact_type_id;
    body->op_value_def_producer_function_row[definition] =
        body->producer_function_row;
    body->op_value_def_place_kind[definition] =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->op_value_def_ownership[definition] =
        COLD_EXPR_OWN_BORROW_SHARED;
    body->op_value_def_origin_id[definition] =
        source->value_def_op_id;
    body->slot_place_kind[destination] =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->slot_exact_type_id[destination] =
        source->exact_type_id;
    body->slot_origin_id[destination] =
        source->value_def_op_id;
    body->slot_managed_storage_kind[destination] =
        body->slot_managed_storage_kind[source->slot];
    ColdExprResult result;
    cold_expr_result_reset(&result);
    result.slot = destination;
    result.kind = source->kind;
    result.value_def_op_id = definition;
    result.exact_type_id = source->exact_type_id;
    result.producer_function_row =
        body->producer_function_row;
    result.place_kind =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    result.ownership =
        COLD_EXPR_OWN_BORROW_SHARED;
    result.origin_id = source->value_def_op_id;
    return result;
}

static int32_t gate_definition_consumer_count(
        const BodyIR *body, int32_t definition) {
    int32_t count = 0;
    for (int32_t op = 0; op < body->op_count; op++) {
        if (cold_exact_op_consumes_definition(
                body, definition, op)) {
            count++;
        }
    }
    return count;
}

static uint64_t gate_hash_bytes(
        const uint8_t *bytes, int32_t count) {
    uint64_t hash = UINT64_C(1469598103934665603);
    for (int32_t i = 0; i < count; i++) {
        hash ^= bytes[i];
        hash *= UINT64_C(1099511628211);
    }
    return hash;
}

static uint64_t gate_hash_words(
        const uint32_t *words, int32_t count) {
    uint64_t hash = UINT64_C(1469598103934665603);
    for (int32_t i = 0; i < count; i++) {
        hash ^= words[i];
        hash *= UINT64_C(1099511628211);
    }
    return hash;
}

static int32_t gate_count_x64_rep_movsb(
        const X64Code *code) {
    int32_t count = 0;
    for (int32_t i = 0; i + 2 < code->len; i++) {
        if (code->buf[i] == 0xfc &&
            code->buf[i + 1] == 0xf3 &&
            code->buf[i + 2] == 0xa4) {
            count++;
        }
    }
    return count;
}

static void gate_check_a64_object_ref_abi(
        GateFixture *fixture, int32_t replace) {
    FunctionPatchList patches = {0};
    patches.arena = fixture->arena;
    Code *code = code_new(fixture->arena, 128);
    codegen_op(
        code, fixture->body, fixture->symbols,
        &patches, replace);
    uint64_t replace_hash =
        gate_hash_words(code->words, code->count);
    if (code->count != 12 ||
        replace_hash != UINT64_C(0x4f03d3e690438342))
        gate_fail("A64 managed replace machine words missing");
    printf(
        "a64_managed_replace_machine_words=%d\n"
        "a64_managed_replace_machine_hash=%016llx\n",
        code->count, (unsigned long long)replace_hash);

    int32_t kind = SLOT_OBJECT_REF;
    int32_t size = 8;
    Span type =
        cold_cstr_span("var ManagedReplaceGateRef");
    int32_t function = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("A64ObjectRefRegister"),
        1, &kind, &size, &type,
        cold_cstr_span(""));
    if (function < 0)
        gate_fail("A64 register fixture function registration failed");

    BodyIR *callee = body_new(fixture->arena);
    int32_t param =
        body_slot(callee, SLOT_OBJECT_REF, 8);
    callee->param_count = 1;
    callee->param_slot[0] = param;
    code = code_new(fixture->arena, 32);
    codegen_store_params(code, callee);
    uint64_t callee_hash =
        gate_hash_words(code->words, code->count);
    if (code->count != 1 ||
        callee_hash != UINT64_C(0x44ba0bfb88c7a839))
        gate_fail("A64 object-ref callee machine words missing");
    printf(
        "a64_object_ref_callee_machine_words=%d\n"
        "a64_object_ref_callee_machine_hash=%016llx\n",
        code->count, (unsigned long long)callee_hash);

    BodyIR *caller = body_new(fixture->arena);
    int32_t arg =
        body_slot(caller, SLOT_OBJECT_REF, 8);
    body_call_arg(caller, arg);
    code = code_new(fixture->arena, 32);
    int32_t stack_bytes = codegen_load_call_args(
        code, caller, fixture->symbols,
        &fixture->symbols->functions[function],
        0, -1);
    uint64_t caller_hash =
        gate_hash_words(code->words, code->count);
    if (stack_bytes != 0 ||
        code->count != 2 ||
        caller_hash != UINT64_C(0x0fe37f2bd298f85a))
        gate_fail("A64 object-ref caller machine words missing");
    printf(
        "a64_object_ref_caller_machine_words=%d\n"
        "a64_object_ref_caller_machine_hash=%016llx\n",
        code->count, (unsigned long long)caller_hash);

    puts("a64_managed_replace_machine_structure=1");
    puts("a64_object_ref_register_abi=1");
}

static void gate_check_x64_object_ref_abi(
        GateFixture *fixture, int32_t replace) {
    X64Code code = {0};
    x64_init(&code, 128);
    FunctionPatchList patches = {0};
    patches.arena = fixture->arena;
    x64_codegen_op(
        &code, fixture->body, fixture->symbols,
        &patches, replace);
    uint64_t replace_hash =
        gate_hash_bytes(code.buf, code.len);
    if (code.len != 61 ||
        replace_hash != UINT64_C(0x9f975f7afa257b34) ||
        gate_count_x64_rep_movsb(&code) != 2) {
        gate_fail("x64 managed replace machine structure drifted");
    }
    printf(
        "x64_managed_replace_machine_len=%d\n"
        "x64_managed_replace_machine_hash=%016llx\n",
        code.len, (unsigned long long)replace_hash);
    x64_release(&code);

    int32_t kind = SLOT_OBJECT_REF;
    int32_t size = 8;
    Span type =
        cold_cstr_span("var ManagedReplaceGateRef");
    int32_t function = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("X64ObjectRefRegister"),
        1, &kind, &size, &type,
        cold_cstr_span(""));
    if (function < 0)
        gate_fail("x64 register fixture function registration failed");

    BodyIR *callee = body_new(fixture->arena);
    int32_t param =
        body_slot(callee, SLOT_OBJECT_REF, 8);
    callee->param_count = 1;
    callee->param_slot[0] = param;
    x64_init(&code, 128);
    x64_codegen_store_params(&code, callee, 128);
    uint64_t callee_hash =
        gate_hash_bytes(code.buf, code.len);
    if (code.len != 64 ||
        callee_hash != UINT64_C(0xcfdfb9a87ed77429))
        gate_fail("x64 object-ref callee machine words missing");
    printf(
        "x64_object_ref_callee_machine_len=%d\n"
        "x64_object_ref_callee_machine_hash=%016llx\n",
        code.len, (unsigned long long)callee_hash);
    x64_release(&code);

    BodyIR *caller = body_new(fixture->arena);
    int32_t arg =
        body_slot(caller, SLOT_OBJECT_REF, 8);
    body_call_arg(caller, arg);
    x64_init(&code, 128);
    int32_t stack_bytes = x64_codegen_load_call_args(
        &code, caller,
        &fixture->symbols->functions[function], 0);
    uint64_t caller_hash =
        gate_hash_bytes(code.buf, code.len);
    if (stack_bytes != 0 ||
        code.len != 11 ||
        caller_hash != UINT64_C(0xf7cbdcd89e3d92da))
        gate_fail("x64 object-ref caller machine words missing");
    printf(
        "x64_object_ref_caller_machine_len=%d\n"
        "x64_object_ref_caller_machine_hash=%016llx\n",
        code.len, (unsigned long long)caller_hash);
    x64_release(&code);

    puts("x64_managed_replace_machine_structure=1");
    puts("x64_object_ref_register_abi=1");
}

static void gate_check_rv64_object_ref_abi(void) {
    Arena *arena = gate_arena_new();
    ColdHarnessCompilation *compilation = arena_alloc(
        arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(compilation, arena);
    Symbols *symbols = compilation->symbols;
    int32_t one_kind = SLOT_OBJECT_REF;
    int32_t one_size = 8;
    Span one_type =
        cold_cstr_span("var ManagedReplaceGateRef");
    int32_t one_fn = symbols_add_fn(
        symbols, cold_cstr_span("Rv64ObjectRefRegister"),
        1, &one_kind, &one_size, &one_type,
        cold_cstr_span(""));
    if (one_fn < 0)
        gate_fail("RV64 register fixture function registration failed");

    BodyIR *callee = body_new(arena);
    int32_t param =
        body_slot(callee, SLOT_OBJECT_REF, 8);
    callee->param_count = 1;
    callee->param_slot[0] = param;
    Code *code = code_new(arena, 32);
    rv64_codegen_store_params(code, callee);
    if (code->count != 1 ||
        code->words[0] != rv_sd(
            RV_A0, RV_SP,
            (int16_t)callee->slot_offset[param])) {
        gate_fail("RV64 register object-ref param store is not exact");
    }

    BodyIR *caller = body_new(arena);
    int32_t arg =
        body_slot(caller, SLOT_OBJECT_REF, 8);
    body_call_arg(caller, arg);
    code = code_new(arena, 32);
    int32_t stack_bytes = rv64_codegen_load_call_args(
        code, caller, symbols, one_fn, 0);
    if (stack_bytes != 0 ||
        code->count != 1 ||
        code->words[0] != rv_ld(
            RV_A0, RV_SP,
            (int16_t)caller->slot_offset[arg])) {
        gate_fail("RV64 register object-ref call load is not exact");
    }

    int32_t kinds[9];
    int32_t sizes[9];
    Span types[9];
    for (int32_t i = 0; i < 8; i++) {
        kinds[i] = SLOT_I64;
        sizes[i] = 8;
        types[i] = cold_cstr_span("int64");
    }
    kinds[8] = SLOT_OBJECT_REF;
    sizes[8] = 8;
    types[8] = one_type;
    int32_t spill_fn = symbols_add_fn(
        symbols, cold_cstr_span("Rv64ObjectRefStack"),
        9, kinds, sizes, types, cold_cstr_span(""));
    if (spill_fn < 0)
        gate_fail("RV64 stack fixture function registration failed");

    BodyIR *spill_callee = body_new(arena);
    int32_t spill_params[9];
    spill_callee->param_count = 9;
    for (int32_t i = 0; i < 9; i++) {
        spill_params[i] =
            body_slot(spill_callee, kinds[i], 8);
        spill_callee->param_slot[i] = spill_params[i];
    }
    code = code_new(arena, 64);
    rv64_codegen_store_params(code, spill_callee);
    if (code->count != 10) {
        gate_fail("RV64 stack object-ref param store count drifted");
    }
    for (int32_t i = 0; i < 8; i++) {
        if (code->words[i] != rv_sd(
                RV_A0 + i, RV_SP,
                (int16_t)spill_callee->slot_offset[
                    spill_params[i]])) {
            gate_fail("RV64 register prefix param store drifted");
        }
    }
    if (code->words[8] !=
            rv_ld(RV_T0, RV_S0, 16) ||
        code->words[9] != rv_sd(
            RV_T0, RV_SP,
            (int16_t)spill_callee->slot_offset[
                spill_params[8]])) {
        gate_fail("RV64 stack object-ref param store is not exact");
    }

    BodyIR *spill_caller = body_new(arena);
    int32_t spill_args[9];
    for (int32_t i = 0; i < 9; i++) {
        spill_args[i] =
            body_slot(spill_caller, kinds[i], 8);
        body_call_arg(spill_caller, spill_args[i]);
    }
    code = code_new(arena, 64);
    stack_bytes = rv64_codegen_load_call_args(
        code, spill_caller, symbols, spill_fn, 0);
    if (stack_bytes != 16 || code->count != 11 ||
        code->words[0] !=
            rv_addi(RV_SP, RV_SP, -16)) {
        gate_fail("RV64 outgoing object-ref stack frame drifted");
    }
    for (int32_t i = 0; i < 8; i++) {
        if (code->words[1 + i] != rv_ld(
                RV_A0 + i, RV_SP,
                (int16_t)(
                    spill_caller->slot_offset[
                        spill_args[i]] + 16))) {
            gate_fail("RV64 register prefix call load drifted");
        }
    }
    if (code->words[9] != rv_ld(
            RV_T0, RV_SP,
            (int16_t)(
                spill_caller->slot_offset[
                    spill_args[8]] + 16)) ||
        code->words[10] != rv_sd(RV_T0, RV_SP, 0)) {
        gate_fail("RV64 stack object-ref call load is not exact");
    }
    int32_t call_result =
        body_slot(spill_caller, SLOT_I32, 4);
    int32_t call_op = body_op(
        spill_caller, BODY_OP_CALL_I32,
        call_result, spill_fn, 0);
    code = code_new(arena, 64);
    FunctionPatchList patches = {0};
    patches.arena = arena;
    rv64_codegen_op(
        code, spill_caller, symbols,
        &patches, call_op);
    if (code->count != 14 ||
        code->words[11] != rv_jal(RV_RA, 0) ||
        code->words[12] !=
            rv_addi(RV_SP, RV_SP, 16) ||
        code->words[13] != rv_sw(
            RV_A0, RV_SP,
            (int16_t)spill_caller->slot_offset[
                call_result]) ||
        patches.count != 1 ||
        patches.items[0].pos != 11 ||
        patches.items[0].target_function != spill_fn ||
        patches.items[0].kind != FUNCTION_PATCH_CALL) {
        gate_fail("RV64 object-ref call stack lifetime drifted");
    }

    puts("rv64_object_ref_register_abi=1");
    puts("rv64_object_ref_stack_abi=1");
    arena_release(arena);
}

static void gate_check_completed_borrow_before_replace(void) {
    GateFixture fixture;
    gate_fixture_init(&fixture);
    ColdExprResult completed_borrow =
        cold_exact_managed_ref_value_borrow(
            fixture.body, fixture.symbols,
            &fixture.target_value);
    (void)gate_append_borrow_projection(
        &fixture, &completed_borrow);
    int32_t resume = cold_emit_exact_managed_param_replace(
        &fixture.parser, fixture.body, fixture.symbols,
        &fixture.target, &fixture.source,
        fixture.parser.source);
    int32_t terminal = body_term(
        fixture.body, BODY_TERM_RET,
        -1, 0, 0, -1, -1);
    body_end_block(fixture.body, resume, terminal);
    int32_t replace =
        gate_find_unique_replace(fixture.body);
    if (!cold_exact_managed_replace_tuple_valid(
            fixture.body, fixture.symbols, replace) ||
        !cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "managed-replace-completed-borrow")) {
        gate_fail(
            "completed borrow before managed replace was rejected");
    }
    puts("completed_borrow_before_replace=1");
    arena_release(fixture.arena);
}

static void gate_check_managed_object_ref_view(void) {
    GateFixture fixture;
    gate_fixture_init(&fixture);
    BodyIR *body = fixture.body;

    ColdExprResult object_ref_view =
        cold_exact_managed_object_ref_view(
            body, fixture.symbols, &fixture.source,
            cold_cstr_span("ManagedReplaceGateRef"));
    int32_t object_ref_view_def =
        object_ref_view.value_def_op_id;
    if (object_ref_view.slot < 0 ||
        object_ref_view.slot >= body->slot_count ||
        object_ref_view.kind != SLOT_OBJECT_REF ||
        body->slot_kind[object_ref_view.slot] !=
            SLOT_OBJECT_REF ||
        body->slot_size[object_ref_view.slot] != 8 ||
        object_ref_view_def < 0 ||
        object_ref_view_def >= body->op_count ||
        body->op_kind[object_ref_view_def] !=
            BODY_OP_COPY_I64 ||
        body->op_dst[object_ref_view_def] !=
            object_ref_view.slot ||
        body->op_a[object_ref_view_def] !=
            fixture.source.slot ||
        body->op_b[object_ref_view_def] != 0 ||
        body->op_c[object_ref_view_def] != 0 ||
        object_ref_view.place_kind !=
            COLD_EXPR_PLACE_BORROW_PROJECTION ||
        object_ref_view.ownership !=
            COLD_EXPR_OWN_BORROW_SHARED ||
        object_ref_view.origin_id !=
            fixture.source_def ||
        body->op_value_def_place_kind[
            object_ref_view_def] !=
            COLD_EXPR_PLACE_BORROW_PROJECTION ||
        body->op_value_def_ownership[
            object_ref_view_def] !=
            COLD_EXPR_OWN_BORROW_SHARED ||
        body->op_value_def_origin_id[
            object_ref_view_def] !=
            fixture.source_def ||
        body->op_source_value_def_op_id[
            object_ref_view_def] != -1 ||
        body->op_value_def_consume_op_index_plus_one[
            fixture.source_def] != 0) {
        gate_fail(
            "managed object ref view tuple is invalid");
    }
    int32_t terminal = body_term(
        body, BODY_TERM_RET,
        -1, 0, 0, -1, -1);
    body_end_block(
        body, fixture.entry_block, terminal);
    if (!cold_bodyir_exact_identity_schema_valid(
            body, fixture.symbols,
            "managed-object-ref-view-gate")) {
        gate_fail(
            "managed object ref view schema was rejected");
    }
    puts("managed_object_ref_view=1");
    puts("managed_owned_pointer_ref_view_copy=1");
    arena_release(fixture.arena);
}

static void gate_check_managed_shared_param_ref_view(void) {
    GateSharedParamFixture fixture;
    gate_shared_param_fixture_init(&fixture);
    ColdExprResult *source =
        &fixture.parameters[0];
    ColdExprResult view =
        cold_exact_managed_object_ref_view(
            fixture.body, fixture.symbols,
            source, fixture.object->name);
    if (!gate_shared_param_view_contract(
            &fixture, source, &view)) {
        gate_fail(
            "shared ref parameter pointer view contract is invalid");
    }
    int32_t terminal = body_term(
        fixture.body, BODY_TERM_RET,
        -1, 0, 0, -1, -1);
    body_end_block(
        fixture.body,
        fixture.entry_block, terminal);
    if (!cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "managed-shared-param-ref-view-gate")) {
        gate_fail(
            "shared ref parameter pointer view schema was rejected");
    }
    puts("managed_shared_param_ref_view=1");
    puts("managed_shared_param_ref_view_copy_i64=1");
    arena_release(fixture.arena);
}

static void gate_managed_var_ref_fixture_init(
        GateFixture *fixture, int32_t param_kind) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = gate_arena_new();
    fixture->compilation = arena_alloc(
        fixture->arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(
        fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation->symbols;
    fixture->body = body_new(fixture->arena);
    ObjectDef *gate_object = gate_add_declared_object(
        fixture->symbols,
        cold_cstr_span("ManagedVarPtrGateRef"), 1);
    if (!gate_object)
        gate_fail("managed var pointer object registration failed");
    gate_object->is_ref = true;
    gate_set_marker_object(gate_object);
    object_finalize_fields(gate_object);
    if (param_kind != SLOT_OBJECT_REF &&
        param_kind != SLOT_OPAQUE_REF) {
        gate_fail("managed var pointer carrier kind is invalid");
    }
    int32_t param_size = 8;
    Span param_type =
        cold_cstr_span("var ManagedVarPtrGateRef");
    bool param_is_var = false;
    Span value_type = span_trim(
        cold_type_strip_var(param_type, &param_is_var));
    if (!param_is_var ||
        !span_eq(value_type, "ManagedVarPtrGateRef")) {
        gate_fail("managed var pointer value type was not stripped");
    }
    int32_t gate_function = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("ManagedVarPtrGate"),
        1, &param_kind, &param_size, &param_type,
        cold_cstr_span(""));
    if (gate_function < 0)
        gate_fail("managed var pointer function registration failed");
    gate_publish_exact_ref_formal(
        fixture->symbols, gate_function,
        param_type, gate_object);
    fixture->body->producer_function_row =
        gate_function;
    fixture->body->debug_name =
        cold_cstr_span("managed_var_ptr_gate");
    fixture->parser.arena = fixture->arena;
    fixture->parser.symbols = fixture->symbols;
    fixture->entry_block = body_block(fixture->body);

    int32_t raw_param =
        body_slot(fixture->body, param_kind, 8);
    body_slot_set_type(
        fixture->body, raw_param, value_type);
    fixture->body->param_count = 1;
    fixture->body->param_slot[0] = raw_param;
    fixture->body->param_name[0] =
        cold_cstr_span("carrier");
    fixture->source = gate_emit_exact_frozen_param_definition(
        fixture->body, fixture->symbols,
        raw_param, param_kind, 0,
        COLD_EXPR_OWN_BORROW_UNIQUE);
    fixture->source_def =
        fixture->source.value_def_op_id;
    if (!span_same(
            fixture->body->slot_type[raw_param],
            value_type) ||
        fixture->source.slot < 0 ||
        fixture->source.slot >=
            fixture->body->slot_count ||
        !span_same(
            fixture->body->slot_type[
                fixture->source.slot],
            value_type) ||
        fixture->source.kind != param_kind ||
        fixture->source.place_kind !=
            COLD_EXPR_PLACE_PARAM ||
        fixture->source.ownership !=
            COLD_EXPR_OWN_BORROW_UNIQUE ||
        fixture->source.origin_id != 0 ||
        !cold_exact_op_tuple_matches_result(
            fixture->body, &fixture->source)) {
        gate_fail(
            "managed var pointer source tuple is not parse_fn exact");
    }
}

static void gate_managed_var_ptr_fixture_init(
        GateFixture *fixture) {
    gate_managed_var_ref_fixture_init(
        fixture, SLOT_OBJECT_REF);
}

static void gate_check_managed_var_ref_materialize(
        int32_t carrier_kind, const char *schema_phase,
        const char *receipt) {
    GateFixture fixture;
    gate_managed_var_ref_fixture_init(
        &fixture, carrier_kind);
    int32_t kind = fixture.source.kind;
    ColdExprResult materialized;
    int32_t value_slot =
        cold_materialize_var_param_value(
            &fixture.parser, fixture.body,
            fixture.source.slot, &kind,
            &fixture.source,
            &materialized);
    int32_t value_def =
        materialized.value_def_op_id;
    if (kind != SLOT_OBJECT_REF ||
        materialized.slot != value_slot ||
        materialized.kind != kind ||
        fixture.source.kind != carrier_kind ||
        fixture.source.exact_type_id / 1048576 !=
            SLOT_OBJECT_REF ||
        fixture.body->slot_managed_storage_kind[
            fixture.source.slot] !=
            COLD_MANAGED_STORAGE_OBJECT ||
        materialized.exact_type_id !=
            fixture.source.exact_type_id ||
        materialized.producer_function_row !=
            fixture.body->producer_function_row ||
        materialized.place_kind !=
            COLD_EXPR_PLACE_BORROW_PROJECTION ||
        materialized.ownership !=
            COLD_EXPR_OWN_BORROW_SHARED ||
        materialized.origin_id !=
            fixture.source_def ||
        !cold_exact_op_tuple_matches_result(
            fixture.body, &materialized) ||
        value_slot < 0 ||
        value_slot >= fixture.body->slot_count ||
        fixture.body->slot_kind[value_slot] !=
            SLOT_OBJECT_REF ||
        fixture.body->slot_size[value_slot] != 8 ||
        value_def <= fixture.source_def ||
        fixture.body->op_kind[value_def] !=
            BODY_OP_PAYLOAD_LOAD ||
        fixture.body->op_dst[value_def] !=
            value_slot ||
        fixture.body->op_a[value_def] !=
            fixture.source.slot ||
        fixture.body->op_b[value_def] != 0 ||
        fixture.body->op_c[value_def] != 8 ||
        fixture.body->op_value_def_place_kind[
            value_def] !=
            COLD_EXPR_PLACE_BORROW_PROJECTION ||
        fixture.body->op_value_def_ownership[
            value_def] !=
            COLD_EXPR_OWN_BORROW_SHARED ||
        fixture.body->op_value_def_origin_id[
            value_def] !=
            fixture.source_def ||
        fixture.body->op_value_def_consume_op_index_plus_one[
            fixture.source_def] != 0) {
        gate_fail(
            "managed var pointer materialization tuple is invalid");
    }
    int32_t terminal = body_term(
        fixture.body, BODY_TERM_RET,
        -1, 0, 0, -1, -1);
    body_end_block(
        fixture.body, fixture.entry_block, terminal);
    if (!cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            schema_phase)) {
        gate_fail(
            "managed var pointer materialization schema was rejected");
    }
    puts(receipt);
    arena_release(fixture.arena);
}

static void gate_check_managed_var_ptr_materialize(void) {
    gate_check_managed_var_ref_materialize(
        SLOT_OBJECT_REF,
        "managed-var-pointer-materialize-gate",
        "managed_var_ptr_materialize=1");
    puts("managed_borrowed_param_ref_view_load=1");
}

static void gate_check_managed_var_opaque_ref_materialize(void) {
    gate_check_managed_var_ref_materialize(
        SLOT_OPAQUE_REF,
        "managed-var-opaque-ref-materialize-gate",
        "managed_var_opaque_ref_materialize=1");
}

static void gate_check_managed_var_object_field_place(void) {
    Arena *arena = gate_arena_new();
    ColdHarnessCompilation *compilation = arena_alloc(
        arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(compilation, arena);
    Symbols *symbols = compilation->symbols;
    ObjectDef *arena_array = gate_add_declared_object(
        symbols, cold_cstr_span("ManagedVarFieldArenaArray"), 4);
    if (!arena_array)
        gate_fail("managed var field value registration failed");
    const char *field_names[4] = {
        "offset", "len", "capacity", "generation"
    };
    for (int32_t field_index = 0; field_index < 4; field_index++) {
        arena_array->fields[field_index].name =
            cold_cstr_span(field_names[field_index]);
        arena_array->fields[field_index].kind = SLOT_I32;
        arena_array->fields[field_index].size = 4;
        arena_array->fields[field_index].type_name =
            cold_cstr_span("int32");
    }
    object_finalize_fields(arena_array);
    if (arena_array->slot_size != 16)
        gate_fail("managed var field value layout drifted");

    ObjectDef *owner = gate_add_declared_object(
        symbols, cold_cstr_span("ManagedVarFieldGateRef"), 2);
    if (!owner)
        gate_fail("managed var field owner registration failed");
    owner->is_ref = true;
    owner->fields[0].name = cold_cstr_span("first");
    owner->fields[1].name = cold_cstr_span("second");
    for (int32_t field_index = 0; field_index < 2; field_index++) {
        owner->fields[field_index].kind = SLOT_OBJECT;
        owner->fields[field_index].size = arena_array->slot_size;
        owner->fields[field_index].type_name = arena_array->name;
    }
    object_finalize_fields(owner);
    if (owner->fields[0].offset != 0 ||
        owner->fields[1].offset != 16 ||
        owner->slot_size != 32) {
        gate_fail("managed var field owner layout drifted");
    }

    int32_t param_kind = SLOT_OBJECT_REF;
    int32_t param_size = 8;
    Span param_type =
        cold_cstr_span("var ManagedVarFieldGateRef");
    bool param_is_var = false;
    Span value_type = span_trim(
        cold_type_strip_var(param_type, &param_is_var));
    if (!param_is_var ||
        !span_eq(value_type, "ManagedVarFieldGateRef")) {
        gate_fail("managed var field value type was not stripped");
    }
    int32_t function_row = symbols_add_fn(
        symbols, cold_cstr_span("ManagedVarFieldPlaceGate"),
        1, &param_kind, &param_size, &param_type,
        cold_cstr_span(""));
    if (function_row < 0)
        gate_fail("managed var field function registration failed");
    gate_publish_exact_ref_formal(
        symbols, function_row,
        param_type, owner);

    BodyIR *body = body_new(arena);
    body->producer_function_row = function_row;
    body->debug_name =
        cold_cstr_span("managed_var_field_place_gate");
    int32_t entry_block = body_block(body);
    int32_t raw_param =
        body_slot(body, SLOT_OBJECT_REF, 8);
    body_slot_set_type(body, raw_param, value_type);
    body->param_count = 1;
    body->param_slot[0] = raw_param;
    body->param_name[0] = cold_cstr_span("carrier");
    ColdExprResult parameter = gate_emit_exact_frozen_param_definition(
        body, symbols, raw_param,
        SLOT_OBJECT_REF, 0,
        COLD_EXPR_OWN_BORROW_UNIQUE);

    Locals locals;
    locals_init(&locals, arena);
    locals_add(
        &locals, body->param_name[0],
        parameter.slot, parameter.kind);
    Local *local = locals_find(&locals, body->param_name[0]);
    if (!local)
        gate_fail("managed var field local registration failed");
    local->is_mutable_place = true;
    local->value_def_op_id = parameter.value_def_op_id;

    Parser parser = cold_parser_issue_legacy_span(
        symbols, cold_cstr_span("carrier.second"));
    ColdVarPlaceTable place_table;
    memset(&place_table, 0, sizeof(place_table));
    place_table.capacity = parser.source.len + 2;
    place_table.parent_ids = arena_alloc(
        arena,
        (size_t)place_table.capacity * sizeof(int32_t));
    place_table.kinds = arena_alloc(
        arena,
        (size_t)place_table.capacity * sizeof(int32_t));
    place_table.a_values = arena_alloc(
        arena,
        (size_t)place_table.capacity * sizeof(int32_t));
    place_table.b_values = arena_alloc(
        arena,
        (size_t)place_table.capacity * sizeof(int32_t));
    int32_t field_place = -1;
    ColdExprResult field_authority;
    cold_expr_result_reset(&field_authority);
    int32_t root_place_id = -1;
    int32_t carrier_op = -1;
    int32_t value_local_index = -1;
    if (!cold_try_reparse_field_call_arg_as_ref(
            &parser, body, &locals, parser.source,
            SLOT_OBJECT_REF,
            cold_cstr_span("var ManagedVarFieldArenaArray"),
            &field_place,
            &field_authority,
            &root_place_id,
            &place_table,
            &carrier_op,
            &value_local_index)) {
        gate_fail("managed var field place was not realized");
    }
    int32_t owner_row =
        (int32_t)(owner - symbols->objects);
    int32_t expected_value_local_index =
        (int32_t)(local - locals.items);
    int32_t field_ref = carrier_op;
    int32_t projection = field_ref - 1;
    int32_t root_parent =
        root_place_id >= 0 &&
                root_place_id < place_table.count
            ? place_table.parent_ids[root_place_id]
            : -1;
    if (root_place_id < 0 ||
        root_place_id >= place_table.count ||
        place_table.kinds[root_place_id] !=
            COLD_VAR_PLACE_FIELD ||
        place_table.a_values[root_place_id] != owner_row ||
        place_table.b_values[root_place_id] != 1 ||
        value_local_index != expected_value_local_index ||
        value_local_index < 0 ||
        value_local_index >= locals.count ||
        &locals.items[value_local_index] != local ||
        carrier_op < 0 || carrier_op >= body->op_count ||
        carrier_op != body->op_count - 1 ||
        carrier_op != field_authority.value_def_op_id ||
        field_authority.slot != field_place ||
        field_authority.kind != SLOT_OBJECT_REF ||
        field_authority.value_def_op_id < 0 ||
        !cold_exact_op_tuple_matches_result(
            body, &field_authority) ||
        root_parent < 0 ||
        root_parent >= place_table.count ||
        place_table.parent_ids[root_parent] != -1 ||
        place_table.kinds[root_parent] !=
            COLD_VAR_PLACE_PARAM ||
        place_table.a_values[root_parent] != 0 ||
        place_table.b_values[root_parent] != 0) {
        gate_fail(
            "managed var field place exact root identity was not preserved");
    }
    if (projection <= parameter.value_def_op_id ||
        body->op_kind[projection] != BODY_OP_PAYLOAD_LOAD ||
        body->op_dst[projection] == raw_param ||
        body->op_a[projection] != parameter.slot ||
        body->op_b[projection] != 0 ||
        body->op_c[projection] != 8 ||
        body->op_value_def_place_kind[projection] !=
            COLD_EXPR_PLACE_BORROW_PROJECTION ||
        body->op_value_def_origin_id[projection] !=
            parameter.value_def_op_id ||
        body->op_kind[field_ref] != BODY_OP_FIELD_REF ||
        body->op_dst[field_ref] != field_place ||
        body->op_a[field_ref] != body->op_dst[projection] ||
        body->op_b[field_ref] != owner->fields[1].offset ||
        body->slot_kind[field_place] != SLOT_OBJECT_REF ||
        body->slot_size[field_place] != 8 ||
        !span_same(body->slot_type[field_place],
                   arena_array->name)) {
        fprintf(
            stderr,
            "cold_managed_replace_identity_gate: field_place raw=%d param_def=%d projection=%d kind=%d dst=%d a=%d b=%d c=%d field_ref=%d kind=%d dst=%d a=%d b=%d c=%d place=%d\n",
            raw_param, parameter.value_def_op_id,
            projection,
            projection >= 0 ? body->op_kind[projection] : -1,
            projection >= 0 ? body->op_dst[projection] : -1,
            projection >= 0 ? body->op_a[projection] : -1,
            projection >= 0 ? body->op_b[projection] : -1,
            projection >= 0 ? body->op_c[projection] : -1,
            field_ref,
            field_ref >= 0 ? body->op_kind[field_ref] : -1,
            field_ref >= 0 ? body->op_dst[field_ref] : -1,
            field_ref >= 0 ? body->op_a[field_ref] : -1,
            field_ref >= 0 ? body->op_b[field_ref] : -1,
            field_ref >= 0 ? body->op_c[field_ref] : -1,
            field_place);
        gate_fail(
            "managed var field place used the raw reference cell");
    }
    int32_t terminal = body_term(
        body, BODY_TERM_RET, -1, 0, 0, -1, -1);
    body_end_block(body, entry_block, terminal);
    if (!cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "managed-var-object-field-place-gate")) {
        gate_fail(
            "managed var field place identity schema was rejected");
    }
    puts("managed_var_object_field_place=1");
    arena_release(arena);
}

static ColdExprResult gate_publish_ref_address_projection(
        BodyIR *body, Symbols *symbols,
        const ColdExprResult *parent,
        ObjectDef *child, int32_t op_kind,
        int32_t op_b, int32_t op_c) {
    if (!body || !symbols || !parent || !child ||
        parent->slot < 0 ||
        parent->slot >= body->slot_count ||
        parent->value_def_op_id < 0 ||
        parent->value_def_op_id >= body->op_count) {
        gate_fail("ref address projection parent is invalid");
    }
    int32_t destination =
        body_slot(body, SLOT_OBJECT_REF, 8);
    body_slot_set_type(
        body, destination, child->name);
    int32_t definition = body_op3(
        body, op_kind, destination,
        parent->slot, op_b, op_c);
    int32_t exact_type_id =
        cold_exact_managed_type_id(
            symbols, body,
            destination, SLOT_OBJECT_REF);
    int32_t storage =
        cold_exact_managed_storage_for_slot(
            symbols, body,
            destination, SLOT_OBJECT_REF);
    if (exact_type_id < 0 ||
        storage != COLD_MANAGED_STORAGE_OBJECT ||
        !cold_exact_op_tuple_is_sentinel(
            body, definition) ||
        !cold_exact_slot_authority_is_sentinel(
            body, destination)) {
        gate_fail(
            "ref address projection destination authority is invalid");
    }
    body->op_value_def_slot[definition] =
        destination;
    body->op_value_def_exact_type_id[
        definition] = exact_type_id;
    body->op_value_def_producer_function_row[
        definition] =
            body->producer_function_row;
    body->op_value_def_place_kind[
        definition] =
            COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->op_value_def_ownership[
        definition] =
            COLD_EXPR_OWN_BORROW_SHARED;
    body->op_value_def_origin_id[
        definition] =
            parent->value_def_op_id;
    body->slot_place_kind[destination] =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->slot_exact_type_id[destination] =
        exact_type_id;
    body->slot_origin_id[destination] =
        parent->value_def_op_id;
    body->slot_managed_storage_kind[
        destination] = storage;

    ColdExprResult projection;
    cold_expr_result_reset(&projection);
    projection.slot = destination;
    projection.kind = SLOT_OBJECT_REF;
    projection.value_def_op_id =
        definition;
    projection.exact_type_id =
        exact_type_id;
    projection.producer_function_row =
        body->producer_function_row;
    projection.place_kind =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    projection.ownership =
        COLD_EXPR_OWN_BORROW_SHARED;
    projection.origin_id =
        parent->value_def_op_id;
    return projection;
}

static void gate_require_ref_address_projection_load(
        BodyIR *body, Symbols *symbols,
        const ColdExprResult *projection,
        ObjectDef *child, const char *label) {
    if (!cold_exact_ref_object_address_projection_shape(
            body, symbols, projection)) {
        gate_fail(
            "ref address projection shape was rejected");
    }
    ColdExprResult view =
        cold_exact_managed_object_ref_view(
            body, symbols, projection,
            child->name);
    int32_t definition =
        view.value_def_op_id;
    if (definition < 0 ||
        definition >= body->op_count ||
        body->op_kind[definition] !=
            BODY_OP_PAYLOAD_LOAD ||
        body->op_a[definition] !=
            projection->slot ||
        body->op_b[definition] != 0 ||
        body->op_c[definition] != 8 ||
        view.kind != SLOT_OBJECT_REF ||
        view.place_kind !=
            COLD_EXPR_PLACE_BORROW_PROJECTION ||
        view.ownership !=
            COLD_EXPR_OWN_BORROW_SHARED ||
        view.origin_id !=
            projection->value_def_op_id ||
        !cold_exact_op_tuple_matches_result(
            body, &view)) {
        gate_fail(label);
    }
}

static void gate_require_i32_const_definition(
        BodyIR *body, int32_t slot,
        int32_t definition) {
    if (!body || slot < 0 ||
        slot >= body->slot_count ||
        definition < 0 ||
        definition >= body->op_count ||
        body->slot_kind[slot] != SLOT_I32 ||
        body->slot_size[slot] != 4 ||
        body->op_kind[definition] !=
            BODY_OP_I32_CONST ||
        body->op_dst[definition] != slot ||
        body->op_a[definition] != 0 ||
        body->op_b[definition] != 0 ||
        body->op_c[definition] != 0 ||
        body->producer_function_row < 0 ||
        !cold_exact_op_tuple_is_sentinel(
            body, definition) ||
        !cold_exact_slot_authority_is_sentinel(
            body, slot)) {
        gate_fail(
            "dynamic index scalar producer is not exact");
    }
    if (!cold_exact_op_tuple_is_sentinel(body, definition) ||
        !cold_exact_slot_authority_is_sentinel(body, slot)) {
        gate_fail(
            "dynamic index scalar producer gained managed authority");
    }
}

static void gate_require_dynamic_index_definition_binding(
        BodyIR *body, int32_t index_slot,
        int32_t index_definition,
        const ColdExprResult *projection) {
    if (!body || !projection ||
        index_slot < 0 ||
        index_slot >= body->slot_count ||
        index_definition < 0 ||
        index_definition >= body->op_count ||
        projection->value_def_op_id <=
            index_definition ||
        projection->value_def_op_id >=
            body->op_count ||
        body->op_kind[
            index_definition] !=
                BODY_OP_I32_CONST ||
        body->op_dst[
            index_definition] != index_slot ||
        body->op_a[
            index_definition] != 0 ||
        body->op_b[
            index_definition] != 0 ||
        body->op_c[
            index_definition] != 0 ||
        body->op_source_value_def_op_id[
            index_definition] != -1 ||
        body->op_kind[
            projection->value_def_op_id] !=
                BODY_OP_SEQ_OPAQUE_INDEX_REF_DYNAMIC ||
        body->op_b[
            projection->value_def_op_id] !=
                index_slot ||
        body->slot_kind[index_slot] != SLOT_I32 ||
        body->slot_size[index_slot] != 4 ||
        !cold_exact_op_tuple_is_sentinel(
            body, index_definition) ||
        !cold_exact_slot_authority_is_sentinel(
            body, index_slot)) {
        gate_fail(
            "dynamic index projection lacks exact scalar definition");
    }
    bool *dominators =
        cold_exact_body_dominators(body);
    if (!dominators ||
        !cold_op_dominates_op(
            body, dominators, index_definition,
            projection->value_def_op_id)) {
        gate_fail(
            "dynamic index producer does not dominate projection");
    }
    int32_t definition_count = 0;
    for (int32_t candidate = 0;
         candidate < projection->value_def_op_id;
         candidate++) {
        if (body->op_dst[candidate] == index_slot) {
            definition_count++;
            if (candidate != index_definition) {
                gate_fail(
                    "dynamic index slot has a competing producer");
            }
        }
    }
    if (definition_count != 1) {
        gate_fail(
            "dynamic index projection definition is not unique");
    }
}

static void gate_body_store_require_origin(
        GateBodyStoreAdmissionFixture *fixture,
        int32_t function_row,
        int32_t expected_token_offset) {
    if (!fixture || !fixture->symbols ||
        function_row < 0 ||
        function_row >=
            fixture->symbols->function_count) {
        gate_fail(
            "body store declaration function row is invalid");
    }
    int32_t origin_row =
        fixture->symbols->functions[
            function_row].declaration_origin_row;
    if (!fixture->symbols->compilation_context ||
        fixture->symbols->source_seal_epoch == 0 ||
        fixture->symbols->source_seal_epoch !=
            fixture->symbols->compilation_context->contexts
                .active_source_epochs[
                    fixture->symbols->compilation_context_row] ||
        !fixture->symbols->source_identity_attached ||
        origin_row < 0 ||
        origin_row >=
            fixture->symbols->declaration_origin_count ||
        fixture->symbols
                ->declaration_origin_authority_kinds[
                    origin_row] !=
            COLD_DECLARATION_ORIGIN_AUTHORITY_SOURCE_SNAPSHOT ||
        fixture->symbols
                ->declaration_origin_module_source_rows[
                    origin_row] !=
            gate_declaration_source_row ||
        fixture->symbols
                ->declaration_origin_token_byte_offsets[
                    origin_row] !=
            expected_token_offset ||
        !span_same(
            fixture->symbols
                ->declaration_origin_source_paths[
                    origin_row],
            fixture->compilation->snapshot
                ->diagnostic_paths[
                    gate_declaration_source_row])) {
        gate_fail(
            "body store declaration origin is not sealed source authority");
    }
}

static BodyIR *gate_body_store_build_body(
        GateBodyStoreAdmissionFixture *fixture,
        int32_t function_row,
        Span debug_name,
        int32_t *param_slots,
        int32_t *param_definitions) {
    if (!fixture || !fixture->symbols ||
        !debug_name.ptr || debug_name.len <= 0 ||
        !param_slots ||
        !param_definitions ||
        function_row < 0 ||
        function_row >=
            fixture->symbols->function_count) {
        gate_fail("body store body builder input is invalid");
    }
    BodyIR *body = body_new(fixture->arena);
    body->producer_function_row = function_row;
    body->debug_name = debug_name;
    body->return_kind = SLOT_I32;
    body->return_size = 4;
    body->return_type =
        cold_cstr_span("int32");
    cold_body_bind_function_declaration_origin(
        body, fixture->symbols,
        function_row);
    int32_t block = body_block(body);
    body->param_count = 2;
    for (int32_t param = 0;
         param < 2; param++) {
        int32_t slot =
            body_slot(
                body, SLOT_OBJECT_REF, 8);
        body_slot_set_type(
            body, slot,
            fixture->object->name);
        param_slots[param] = slot;
        body->param_slot[param] = slot;
        body->param_name[param] =
            param == 0
                ? cold_cstr_span("first")
                : cold_cstr_span("second");
    }
    for (int32_t param = 0;
         param < 2; param++) {
        ColdExprResult parameter =
            gate_emit_exact_frozen_param_definition(
                body, fixture->symbols,
                param_slots[param],
                SLOT_OBJECT_REF, param,
                COLD_EXPR_OWN_BORROW_UNIQUE);
        param_definitions[param] =
            parameter.value_def_op_id;
    }
    int32_t return_slot =
        body_slot(body, SLOT_I32, 4);
    body_slot_set_type(
        body, return_slot,
        cold_cstr_span("int32"));
    int32_t return_definition = body_op(
        body, BODY_OP_I32_CONST,
        return_slot, 0, 0);
    gate_require_i32_const_definition(
        body, return_slot,
        return_definition);
    int32_t terminal = body_term(
        body, BODY_TERM_RET,
        return_slot, -1, 0, -1, -1);
    body_end_block(body, block, terminal);
    return body;
}

static int32_t gate_body_store_specialize_from_typed_actuals(
        GateBodyStoreAdmissionFixture *fixture) {
    if (!fixture || !fixture->symbols ||
        fixture->ordinary_row < 0 ||
        fixture->ordinary_row >=
            fixture->symbols->function_count ||
        fixture->template_row < 0 ||
        fixture->template_row >=
            fixture->symbols->function_count) {
        gate_fail(
            "body store specialization producer input is invalid");
    }
    BodyIR *typed_actual_body =
        body_new(fixture->arena);
    typed_actual_body->producer_function_row =
        fixture->ordinary_row;
    typed_actual_body->debug_name =
        cold_cstr_span(
            "ManagedBodyStoreSpecializationProducer");
    int32_t block =
        body_block(typed_actual_body);
    typed_actual_body->param_count = 2;
    ColdExprResult actuals[2];
    memset(actuals, 0, sizeof(actuals));
    int32_t arg_start =
        typed_actual_body->call_arg_count;
    for (int32_t param = 0;
         param < 2; param++) {
        int32_t raw_slot =
            body_slot(
                typed_actual_body,
                SLOT_OBJECT_REF, 8);
        body_slot_set_type(
            typed_actual_body,
            raw_slot,
            fixture->object->name);
        typed_actual_body->param_slot[param] =
            raw_slot;
        typed_actual_body->param_name[param] =
            param == 0
                ? cold_cstr_span("first")
                : cold_cstr_span("second");
        actuals[param] =
            gate_emit_exact_frozen_param_definition(
                typed_actual_body,
                fixture->symbols,
                raw_slot,
                SLOT_OBJECT_REF,
                param,
                COLD_EXPR_OWN_BORROW_UNIQUE);
        int32_t call_arg_row =
            body_call_arg(
                typed_actual_body,
                actuals[param].slot);
        cold_bind_parsed_call_arg_authority(
            typed_actual_body,
            call_arg_row,
            &actuals[param]);
        if (call_arg_row != arg_start + param ||
            typed_actual_body
                    ->call_arg_value_def_op_id[
                        call_arg_row] !=
                actuals[param].value_def_op_id ||
            typed_actual_body
                    ->call_arg_place_kind[
                        call_arg_row] !=
                COLD_EXPR_PLACE_PARAM ||
            typed_actual_body
                    ->call_arg_ownership[
                        call_arg_row] !=
                COLD_EXPR_OWN_BORROW_UNIQUE ||
            typed_actual_body
                    ->call_arg_origin_id[
                        call_arg_row] != param ||
            !cold_exact_op_tuple_matches_result(
                typed_actual_body,
                &actuals[param])) {
            gate_fail(
                "body store specialization typed actual is not exact");
        }
    }
    int32_t function_count_before =
        fixture->symbols->function_count;
    int32_t specialization_row =
        cold_ensure_specialized(
            fixture->symbols,
            fixture->template_row,
            typed_actual_body,
            arg_start, 2,
            NULL, 0);
    int32_t return_slot =
        body_slot(
            typed_actual_body,
            SLOT_I32, 4);
    body_slot_set_type(
        typed_actual_body,
        return_slot,
        cold_cstr_span("int32"));
    int32_t return_definition =
        body_op(
            typed_actual_body,
            BODY_OP_I32_CONST,
            return_slot, 0, 0);
    gate_require_i32_const_definition(
        typed_actual_body,
        return_slot,
        return_definition);
    int32_t terminal =
        body_term(
            typed_actual_body,
            BODY_TERM_RET,
            return_slot, -1, 0, -1, -1);
    body_end_block(
        typed_actual_body,
        block, terminal);
    if (specialization_row < 0 ||
        specialization_row >=
            fixture->symbols->function_count ||
        fixture->symbols->function_count !=
            function_count_before + 1 ||
        specialization_row !=
            function_count_before ||
        specialization_row ==
            fixture->template_row) {
        gate_fail(
            "canonical specialization producer did not mint a row");
    }
    FnDef *specialization =
        &fixture->symbols->functions[
            specialization_row];
    if (specialization->template_index !=
            fixture->template_row ||
        specialization->specialization_actual_count !=
            1 ||
        !span_same(
            specialization
                ->specialization_actual_type[0],
            fixture->object->name) ||
        specialization->arity != 2 ||
        !span_same(
            span_trim(
                specialization->param_type[0]),
            cold_cstr_span(
                "var ManagedReplaceGateRef")) ||
        !span_same(
            span_trim(
                specialization->param_type[1]),
            cold_cstr_span(
                "var ManagedReplaceGateRef"))) {
        gate_fail(
            "canonical specialization producer tuple is invalid");
    }
    specialization->decl_has_body = true;
    if (!cold_function_specialization_identity_valid(
            fixture->symbols,
            specialization_row)) {
        gate_fail(
            "canonical specialization producer identity is invalid");
    }
    cold_require_specialization_signature_admission(
        fixture->symbols,
        specialization_row);
    return specialization_row;
}

static void gate_body_store_require_exact_body(
        GateBodyStoreAdmissionFixture *fixture,
        BodyIR *body, int32_t function_row,
        const int32_t *param_slots,
        const int32_t *param_definitions) {
    if (!fixture || !fixture->symbols ||
        !body || !param_slots ||
        !param_definitions ||
        body->producer_function_row !=
            function_row ||
        body->param_count != 2 ||
        body->return_kind != SLOT_I32 ||
        body->return_size != 4 ||
        !span_eq(
            span_trim(body->return_type),
            "int32") ||
        param_slots[0] ==
            param_slots[1] ||
        param_definitions[0] ==
            param_definitions[1]) {
        gate_fail(
            "body store positive signature shape is invalid");
    }
    FnDef *function =
        &fixture->symbols->functions[
            function_row];
    int32_t prior_destination = -1;
    for (int32_t param = 0;
         param < 2; param++) {
        int32_t slot = param_slots[param];
        int32_t definition =
            param_definitions[param];
        int32_t destination =
            definition >= 0 &&
                    definition < body->op_count
                ? body->op_dst[definition]
                : -1;
        ColdExprResult result;
        cold_expr_result_reset(&result);
        if (body->param_slot[param] != slot ||
            slot < 0 ||
            slot >= body->slot_count ||
            body->slot_kind[slot] !=
                SLOT_OBJECT_REF ||
            body->slot_size[slot] != 8 ||
            !span_same(
                body->slot_type[slot],
                fixture->object->name) ||
            definition < 0 ||
            definition >= body->op_count ||
            destination < 0 ||
            destination >= body->slot_count ||
            destination == slot ||
            destination == prior_destination ||
            body->op_kind[definition] !=
                BODY_OP_COPY_I64 ||
            body->slot_kind[destination] !=
                SLOT_OBJECT_REF ||
            body->slot_size[destination] != 8 ||
            !span_same(
                body->slot_type[destination],
                fixture->object->name) ||
            body->op_a[definition] != slot ||
            body->op_b[definition] != 1 ||
            body->op_c[definition] != 0 ||
            body->op_value_def_producer_function_row[
                definition] != function_row ||
            body->op_value_def_place_kind[
                definition] !=
                COLD_EXPR_PLACE_PARAM ||
            body->op_value_def_ownership[
                definition] !=
                COLD_EXPR_OWN_BORROW_UNIQUE ||
            body->op_value_def_origin_id[
                definition] != param ||
            body->op_value_def_consume_op_index_plus_one[
                definition] != 0 ||
            body->op_source_value_def_op_id[
                definition] != -1 ||
            body->op_value_def_exact_type_id[
                definition] !=
                function->param_exact_type_id[
                    param] ||
            body->slot_exact_type_id[
                destination] !=
                function->param_exact_type_id[
                    param] ||
            body->slot_place_kind[
                destination] !=
                COLD_EXPR_PLACE_PARAM ||
            body->slot_origin_id[
                destination] != param ||
            body->slot_managed_storage_kind[
                destination] !=
                COLD_MANAGED_STORAGE_OBJECT ||
            !cold_exact_result_from_definition(
                body, destination,
                definition, &result) ||
            result.ownership !=
                COLD_EXPR_OWN_BORROW_UNIQUE ||
            !cold_exact_op_tuple_matches_result(
                body, &result)) {
            gate_fail(
                "body store parameter DOD identity is invalid");
        }
        prior_destination = destination;
    }
}

static void gate_body_store_admission_fixture_init(
        GateBodyStoreAdmissionFixture *fixture) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = gate_arena_new();
    fixture->compilation = arena_alloc(
        fixture->arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(
        fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation->symbols;
    fixture->object = gate_add_declared_object(
        fixture->symbols,
        cold_cstr_span(
            "ManagedReplaceGateRef"), 1);
    fixture->decoy_object =
        gate_add_declared_object(
            fixture->symbols,
            cold_cstr_span(
                "ManagedVarPtrGateOtherRef"), 1);
    if (!fixture->object ||
        !fixture->decoy_object) {
        gate_fail(
            "body store object identity registration failed");
    }
    fixture->object->is_ref = true;
    fixture->decoy_object->is_ref = true;
    gate_set_marker_object(
        fixture->object);
    gate_set_marker_object(
        fixture->decoy_object);
    object_finalize_fields(
        fixture->object);
    object_finalize_fields(
        fixture->decoy_object);

    int32_t param_kinds[2] = {
        SLOT_OBJECT_REF,
        SLOT_OBJECT_REF,
    };
    int32_t param_sizes[2] = {8, 8};
    Span concrete_param_types[2] = {
        cold_cstr_span(
            "var ManagedReplaceGateRef"),
        cold_cstr_span(
            "var ManagedReplaceGateRef"),
    };
    fixture->ordinary_token_offset =
        gate_declaration_function_token_offset(
            "ManagedBodyStoreOrdinary");
    fixture->ordinary_row =
        symbols_add_fn_at_origin(
            fixture->symbols,
            cold_cstr_span(
                "ManagedBodyStoreOrdinary"),
            2, param_kinds, param_sizes,
            concrete_param_types,
            cold_cstr_span("int32"),
            gate_declaration_source_row,
            fixture->ordinary_token_offset);
    if (fixture->ordinary_row < 0)
        gate_fail(
            "body store ordinary registration failed");
    symbols_set_fn_param_types(
        fixture->symbols,
        fixture->ordinary_row,
        concrete_param_types, 2);
    fixture->symbols->functions[
        fixture->ordinary_row]
        .decl_has_body = true;
    cold_publish_exact_formal_type_ids(
        fixture->symbols,
        fixture->ordinary_row);

    Span generic_name =
        cold_cstr_span("T");
    Span generic_param_types[2] = {
        cold_cstr_span("var T"),
        cold_cstr_span("var T"),
    };
    fixture->template_token_offset =
        gate_declaration_function_token_offset(
            "ManagedBodyStoreTemplate");
    fixture->template_row =
        symbols_add_fn_at_origin(
            fixture->symbols,
            cold_cstr_span(
                "ManagedBodyStoreTemplate"),
            2, param_kinds, param_sizes,
            generic_param_types,
            cold_cstr_span("int32"),
            gate_declaration_source_row,
            fixture->template_token_offset);
    if (fixture->template_row < 0)
        gate_fail(
            "body store template registration failed");
    symbols_set_fn_param_types(
        fixture->symbols,
        fixture->template_row,
        generic_param_types, 2);
    symbols_set_fn_generics(
        fixture->symbols,
        fixture->template_row,
        &generic_name, 1);
    fixture->symbols->functions[
        fixture->template_row]
        .decl_has_body = true;

    fixture->specialization_row =
        gate_body_store_specialize_from_typed_actuals(
            fixture);

    fixture->ordinary_origin_row =
        fixture->symbols->functions[
            fixture->ordinary_row]
            .declaration_origin_row;
    fixture->template_origin_row =
        fixture->symbols->functions[
            fixture->template_row]
            .declaration_origin_row;
    gate_body_store_require_origin(
        fixture, fixture->ordinary_row,
        fixture->ordinary_token_offset);
    gate_body_store_require_origin(
        fixture, fixture->template_row,
        fixture->template_token_offset);
    if (fixture->ordinary_origin_row < 0 ||
        fixture->template_origin_row < 0 ||
        fixture->ordinary_origin_row ==
            fixture->template_origin_row) {
        gate_fail(
            "body store declaration origins are not independent");
    }

    fixture->ordinary_body =
        gate_body_store_build_body(
            fixture,
            fixture->ordinary_row,
            fixture->symbols->functions[
                fixture->ordinary_row].name,
            fixture->ordinary_param_slots,
            fixture->ordinary_param_definitions);
    fixture->specialization_body =
        gate_body_store_build_body(
            fixture,
            fixture->specialization_row,
            fixture->symbols->functions[
                fixture->specialization_row].name,
            fixture->specialization_param_slots,
            fixture->specialization_param_definitions);
    gate_body_store_require_exact_body(
        fixture,
        fixture->ordinary_body,
        fixture->ordinary_row,
        fixture->ordinary_param_slots,
        fixture->ordinary_param_definitions);
    gate_body_store_require_exact_body(
        fixture,
        fixture->specialization_body,
        fixture->specialization_row,
        fixture->specialization_param_slots,
        fixture->specialization_param_definitions);
    if (!cold_function_specialization_identity_valid(
            fixture->symbols,
            fixture->specialization_row)) {
        gate_fail(
            "body store specialization tuple is invalid");
    }
    cold_require_specialization_signature_admission(
        fixture->symbols,
        fixture->specialization_row);

    cold_function_body_store_init(
        &fixture->store,
        fixture->arena,
        fixture->symbols->function_cap);
    cold_function_body_store_set(
        &fixture->store,
        fixture->ordinary_row,
        fixture->ordinary_body);
    cold_function_body_store_set(
        &fixture->store,
        fixture->specialization_row,
        fixture->specialization_body);
}

static void gate_check_body_store_signature_admission(void) {
    GateBodyStoreAdmissionFixture fixture;
    gate_body_store_admission_fixture_init(
        &fixture);
    gate_body_store_require_origin(
        &fixture,
        fixture.ordinary_row,
        fixture.ordinary_token_offset);
    gate_body_store_require_origin(
        &fixture,
        fixture.template_row,
        fixture.template_token_offset);
    cold_function_body_store_freeze(
        &fixture.store,
        fixture.symbols);
    cold_function_body_store_assert_frozen_unchanged(
        &fixture.store,
        fixture.symbols,
        "body-store-signature-admission-positive");
    puts("body_store_ordinary_signature_admission=1");
    puts("body_store_specialization_signature_admission=1");
    puts("body_store_specialization_canonical_producer=1");
    puts("body_store_function_token_lexical_authority=1");
    arena_release(fixture.arena);
}

static void gate_run_body_store_admission_negative(
        const char *mode) {
    GateBodyStoreAdmissionFixture fixture;
    gate_body_store_admission_fixture_init(
        &fixture);
    BodyIR *body = fixture.ordinary_body;
    FnDef *function =
        &fixture.symbols->functions[
            fixture.ordinary_row];
    if (strcmp(
            mode,
            "body-store-admission-store-row") == 0) {
        fixture.store.items[
            fixture.ordinary_row] =
                fixture.specialization_body;
    } else if (strcmp(
                   mode,
                   "body-store-admission-producer-row") == 0) {
        body->producer_function_row =
            fixture.specialization_row;
    } else if (strcmp(
                   mode,
                   "body-store-admission-origin-row") == 0) {
        body->declaration_origin_row =
            fixture.template_origin_row;
    } else if (strcmp(
                   mode,
                   "body-store-admission-source-path") == 0) {
        body->source_path =
            cold_arena_cstr_copy(
                fixture.arena,
                "/body-store/decoy.cheng");
    } else if (strcmp(
                   mode,
                   "body-store-admission-source-line") == 0) {
        body->source_line++;
    } else if (strcmp(
                   mode,
                   "body-store-admission-param-count") == 0) {
        body->param_count = 1;
    } else if (strcmp(
                   mode,
                   "body-store-admission-param-slot-range") == 0) {
        body->param_slot[1] =
            body->slot_count;
    } else if (strcmp(
                   mode,
                   "body-store-admission-param-slot-duplicate") == 0) {
        body->param_slot[1] =
            body->param_slot[0];
    } else if (strcmp(
                   mode,
                   "body-store-admission-param-kind") == 0) {
        body->slot_kind[
            body->param_slot[0]] =
                SLOT_PTR;
    } else if (strcmp(
                   mode,
                   "body-store-admission-param-size") == 0) {
        body->slot_size[
            body->param_slot[0]] = 16;
    } else if (strcmp(
                   mode,
                   "body-store-admission-param-type") == 0) {
        body->slot_type[
            body->param_slot[0]] =
                fixture.decoy_object->name;
    } else if (strcmp(
                   mode,
                   "body-store-admission-param-type-id") == 0) {
        int32_t decoy_row =
            symbols_object_index(
                fixture.symbols,
                fixture.decoy_object);
        function->param_exact_type_id[0] =
            SLOT_OBJECT_REF * 1048576 +
            decoy_row + 1;
    } else if (strcmp(
                   mode,
                   "body-store-admission-param-ref-bit") == 0) {
        function->param_exact_object_is_ref[0] = 0;
    } else if (strcmp(
                   mode,
                   "body-store-admission-return-kind") == 0) {
        body->return_kind = SLOT_I64;
    } else if (strcmp(
                   mode,
                   "body-store-admission-return-size") == 0) {
        body->return_size = 8;
    } else if (strcmp(
                   mode,
                   "body-store-admission-return-type") == 0) {
        body->return_type =
            cold_cstr_span("int64");
    } else if (strcmp(
                   mode,
                   "body-store-admission-return-type-id") == 0) {
        function->return_exact_type_id++;
    } else if (strcmp(
                   mode,
                   "body-store-admission-specialization-actual") == 0) {
        fixture.symbols->functions[
            fixture.specialization_row]
            .specialization_actual_type[0] =
                cold_arena_span_copy(
                    fixture.symbols->arena,
                    fixture.decoy_object->name);
    } else if (strcmp(
                   mode,
                   "body-store-admission-specialization-template") == 0) {
        fixture.symbols->functions[
            fixture.specialization_row]
            .template_index =
                fixture.ordinary_row;
    } else if (strcmp(
                   mode,
                   "body-store-token-wrong-source-row") == 0) {
        fixture.symbols
            ->declaration_origin_module_source_rows[
                fixture.ordinary_origin_row] =
                    fixture.compilation->snapshot->count;
    } else if (strcmp(
                   mode,
                   "body-store-token-comment-string") == 0) {
        fixture.symbols
            ->declaration_origin_token_byte_offsets[
                fixture.ordinary_origin_row] =
                    gate_declaration_offset_after_unique_marker(
                        "bodyStoreStringTokenAuthority = \"fn ");
    } else if (strcmp(
                   mode,
                   "body-store-token-same-line-offset") == 0) {
        fixture.symbols
            ->declaration_origin_token_byte_offsets[
                fixture.ordinary_origin_row] =
                    gate_declaration_same_line_ident_offset(
                        fixture.ordinary_token_offset,
                        "first");
    } else {
        gate_fail(
            "unknown body store admission mutation");
    }
    gate_body_store_require_origin(
        &fixture,
        fixture.ordinary_row,
        fixture.ordinary_token_offset);
    gate_body_store_require_origin(
        &fixture,
        fixture.template_row,
        fixture.template_token_offset);
    cold_function_body_store_freeze(
        &fixture.store,
        fixture.symbols);
    gate_fail(
        "body store admission mutation was accepted");
}

static void gate_check_managed_ref_address_projections(void) {
    Arena *arena = gate_arena_new();
    ColdHarnessCompilation *compilation = arena_alloc(
        arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(compilation, arena);
    Symbols *symbols = compilation->symbols;
    ObjectDef *child = gate_add_declared_object(
        symbols,
        cold_cstr_span("ManagedSharedParamGateRef"), 1);
    if (!child)
        gate_fail("projection child object registration failed");
    child->is_ref = true;
    gate_set_marks_object(child);
    object_finalize_fields(child);
    ObjectDef *owner = gate_add_declared_object(
        symbols,
        cold_cstr_span("ManagedRefProjectionOwner"), 1);
    if (!owner)
        gate_fail("projection owner registration failed");
    owner->fields[0].name =
        cold_cstr_span("child");
    owner->fields[0].kind = SLOT_PTR;
    owner->fields[0].size = 8;
    owner->fields[0].type_name =
        child->name;
    object_finalize_fields(owner);

    int32_t field_kind = SLOT_OBJECT;
    int32_t field_size = owner->slot_size;
    Span field_type = owner->name;
    int32_t field_function = symbols_add_fn(
        symbols,
        cold_cstr_span("ManagedFieldProjectionGate"),
        1, &field_kind, &field_size, &field_type,
        cold_cstr_span(""));
    if (field_function < 0)
        gate_fail("field projection function registration failed");
    symbols->functions[
        field_function].borrows_args = true;
    symbols_set_fn_param_types(
        symbols, field_function,
        &field_type, 1);
    cold_publish_exact_formal_type_ids(
        symbols, field_function);

    BodyIR *field_body = body_new(arena);
    field_body->producer_function_row =
        field_function;
    field_body->debug_name =
        cold_cstr_span("managed_field_projection_gate");
    int32_t field_block =
        body_block(field_body);
    int32_t field_raw =
        body_slot(
            field_body, SLOT_OBJECT,
            owner->slot_size);
    body_slot_set_type(
        field_body, field_raw,
        owner->name);
    field_body->param_count = 1;
    field_body->param_slot[0] = field_raw;
    field_body->param_name[0] =
        cold_cstr_span("owner");
    ColdExprResult field_parent =
        gate_emit_exact_frozen_param_definition(
            field_body, symbols,
            field_raw, SLOT_OBJECT, 0,
            COLD_EXPR_OWN_BORROW_SHARED);
    ColdExprResult field_projection =
        gate_publish_ref_address_projection(
            field_body, symbols,
            &field_parent, child,
            BODY_OP_FIELD_REF,
            owner->fields[0].offset, 0);
    gate_require_ref_address_projection_load(
        field_body, symbols,
        &field_projection, child,
        "FIELD_REF object handle was not loaded exactly once");
    int32_t field_terminal = body_term(
        field_body, BODY_TERM_RET,
        -1, 0, 0, -1, -1);
    body_end_block(
        field_body, field_block,
        field_terminal);
    if (!cold_bodyir_exact_identity_schema_valid(
            field_body, symbols,
            "managed-field-ref-view-gate")) {
        gate_fail(
            "FIELD_REF object handle schema was rejected");
    }

    int32_t index_kind =
        SLOT_SEQ_OPAQUE;
    int32_t index_size = 16;
    Span index_type =
        cold_cstr_span(
            "ManagedSharedParamGateRef[]");
    int32_t index_function = symbols_add_fn(
        symbols,
        cold_cstr_span("ManagedIndexProjectionGate"),
        1, &index_kind, &index_size, &index_type,
        cold_cstr_span(""));
    if (index_function < 0)
        gate_fail("index projection function registration failed");
    symbols->functions[
        index_function].borrows_args = true;
    symbols_set_fn_param_types(
        symbols, index_function,
        &index_type, 1);
    cold_publish_exact_formal_type_ids(
        symbols, index_function);

    BodyIR *index_body = body_new(arena);
    index_body->producer_function_row =
        index_function;
    index_body->debug_name =
        cold_cstr_span("managed_index_projection_gate");
    int32_t index_block =
        body_block(index_body);
    int32_t index_raw =
        body_slot(
            index_body,
            SLOT_SEQ_OPAQUE, 16);
    body_slot_set_seq_opaque_type(
        index_body, symbols,
        index_raw, index_type);
    index_body->param_count = 1;
    index_body->param_slot[0] = index_raw;
    index_body->param_name[0] =
        cold_cstr_span("values");
    ColdExprResult index_parent =
        gate_emit_exact_frozen_param_definition(
            index_body, symbols,
            index_raw, SLOT_SEQ_OPAQUE, 0,
            COLD_EXPR_OWN_BORROW_SHARED);
    int32_t dynamic_index =
        body_slot(index_body, SLOT_I32, 4);
    body_slot_set_type(
        index_body, dynamic_index,
        cold_cstr_span("int32"));
    int32_t dynamic_index_definition = body_op(
        index_body, BODY_OP_I32_CONST,
        dynamic_index, 0, 0);
    gate_require_i32_const_definition(
        index_body, dynamic_index,
        dynamic_index_definition);
    ColdExprResult index_projection =
        gate_publish_ref_address_projection(
            index_body, symbols,
            &index_parent, child,
            BODY_OP_SEQ_OPAQUE_INDEX_REF_DYNAMIC,
            dynamic_index, 8);
    gate_require_dynamic_index_definition_binding(
        index_body, dynamic_index,
        dynamic_index_definition,
        &index_projection);
    gate_require_ref_address_projection_load(
        index_body, symbols,
        &index_projection, child,
        "index-ref object handle was not loaded exactly once");
    int32_t index_terminal = body_term(
        index_body, BODY_TERM_RET,
        -1, 0, 0, -1, -1);
    body_end_block(
        index_body, index_block,
        index_terminal);
    if (!cold_bodyir_exact_identity_schema_valid(
            index_body, symbols,
            "managed-index-ref-view-gate")) {
        gate_fail(
            "index-ref object handle schema was rejected");
    }
    puts("managed_ref_field_projection_load=1");
    puts("managed_ref_index_projection_load=1");
    arena_release(arena);
}

static void gate_check_managed_plain_var_aggregate(void) {
    Arena *arena = gate_arena_new();
    ColdHarnessCompilation *compilation = arena_alloc(
        arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(compilation, arena);
    Symbols *symbols = compilation->symbols;
    ObjectDef *object = gate_add_declared_object(
        symbols,
        cold_cstr_span("ManagedPlainAggregateGate"), 1);
    if (!object)
        gate_fail("plain var aggregate registration failed");
    gate_set_marks_object(object);
    object_finalize_fields(object);
    int32_t param_kind =
        SLOT_OBJECT_REF;
    int32_t param_size = 8;
    Span param_type =
        cold_cstr_span(
            "var ManagedPlainAggregateGate");
    int32_t function_row = symbols_add_fn(
        symbols,
        cold_cstr_span("ManagedPlainVarAggregateGate"),
        1, &param_kind, &param_size, &param_type,
        cold_cstr_span(""));
    if (function_row < 0)
        gate_fail("plain var aggregate function registration failed");
    symbols_set_fn_param_types(
        symbols, function_row,
        &param_type, 1);
    cold_publish_exact_formal_type_ids(
        symbols, function_row);
    if (symbols->functions[
            function_row]
            .param_exact_object_is_ref[0] != 0) {
        gate_fail("plain var aggregate ref bit drifted");
    }

    BodyIR *body = body_new(arena);
    body->producer_function_row =
        function_row;
    body->debug_name =
        cold_cstr_span(
            "managed_plain_var_aggregate_gate");
    Parser parser = cold_parser_issue_legacy_span(
        symbols, (Span){0});
    int32_t block = body_block(body);
    int32_t raw_param =
        body_slot(body, SLOT_OBJECT_REF, 8);
    body_slot_set_type(
        body, raw_param, object->name);
    body->param_count = 1;
    body->param_slot[0] = raw_param;
    body->param_name[0] =
        cold_cstr_span("aggregate");
    ColdExprResult parameter =
        gate_emit_exact_frozen_param_definition(
            body, symbols, raw_param,
            SLOT_OBJECT_REF, 0,
            COLD_EXPR_OWN_BORROW_UNIQUE);
    int32_t kind = parameter.kind;
    int32_t op_count_before = body->op_count;
    ColdExprResult materialized;
    int32_t value_slot =
        cold_materialize_var_param_value(
            &parser, body,
            parameter.slot, &kind,
            &parameter,
            &materialized);
    if (value_slot != parameter.slot ||
        kind != parameter.kind ||
        body->op_count != op_count_before ||
        materialized.slot != -1 ||
        materialized.kind != -1 ||
        materialized.value_def_op_id != -1 ||
        materialized.exact_type_id != -1 ||
        materialized.producer_function_row != -1 ||
        materialized.place_kind !=
            COLD_EXPR_PLACE_INVALID ||
        materialized.ownership !=
            COLD_EXPR_OWN_INVALID ||
        materialized.origin_id != -1 ||
        !cold_exact_op_tuple_matches_result(
            body, &parameter)) {
        gate_fail(
            "plain var aggregate carrier identity drifted");
    }
    ObjectField *marks_field = &object->fields[0];
    int32_t marks_slot =
        body_slot(body, SLOT_SEQ_I32, marks_field->size);
    body_slot_set_type(
        body, marks_slot, marks_field->type_name);
    int32_t marks_load = body_op3(
        body, BODY_OP_PAYLOAD_LOAD,
        marks_slot, parameter.slot,
        marks_field->offset, marks_field->size);
    ColdExprResult marks =
        cold_exact_managed_field_borrow(
            body, symbols, &parameter,
            marks_slot, SLOT_SEQ_I32,
            marks_load);
    if (marks.slot != marks_slot ||
        marks.kind != SLOT_SEQ_I32 ||
        marks.value_def_op_id != marks_load ||
        marks.place_kind !=
            COLD_EXPR_PLACE_BORROW_PROJECTION ||
        marks.ownership !=
            COLD_EXPR_OWN_BORROW_SHARED ||
        marks.origin_id !=
            parameter.value_def_op_id ||
        body->op_kind[marks_load] !=
            BODY_OP_PAYLOAD_LOAD ||
        body->op_a[marks_load] !=
            parameter.slot ||
        body->op_b[marks_load] !=
            marks_field->offset ||
        body->op_c[marks_load] !=
            marks_field->size ||
        !cold_exact_op_tuple_matches_result(
            body, &marks)) {
        gate_fail(
            "plain var aggregate field load identity drifted");
    }
    int32_t terminal = body_term(
        body, BODY_TERM_RET,
        -1, 0, 0, -1, -1);
    body_end_block(
        body, block, terminal);
    if (!cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "managed-plain-var-aggregate-gate")) {
        gate_fail(
            "plain var aggregate schema was rejected");
    }
    puts("managed_plain_var_aggregate_carrier=1");
    puts("managed_plain_var_aggregate_load=1");
    arena_release(arena);
}

static void gate_run_managed_var_ptr_missing_def(void) {
    GateFixture fixture;
    gate_managed_var_ptr_fixture_init(&fixture);
    fixture.body->slot_exact_type_id[
        fixture.source.slot] = -1;
    (void)cold_exact_managed_param_carrier_result(
        fixture.body, fixture.symbols,
        fixture.source.slot,
        fixture.source_def);
    gate_fail(
        "managed var pointer missing definition was accepted");
}

static void gate_run_managed_var_ptr_formal_non_var(void) {
    GateFixture fixture;
    gate_managed_var_ptr_fixture_init(&fixture);
    fixture.symbols->functions[
        fixture.body->producer_function_row]
        .param_type[0] =
        cold_cstr_span("ManagedVarPtrGateRef");
    int32_t kind = fixture.source.kind;
    ColdExprResult materialized;
    (void)cold_materialize_var_param_value(
        &fixture.parser, fixture.body,
        fixture.source.slot, &kind,
        &fixture.source,
        &materialized);
    gate_fail(
        "managed var pointer non-var formal was accepted");
}

static void gate_run_managed_var_ptr_fake_slot_text(void) {
    GateFixture fixture;
    gate_managed_var_ptr_fixture_init(&fixture);
    body_slot_set_type(
        fixture.body, fixture.source.slot,
        cold_cstr_span("var ManagedVarPtrGateRef"));
    fixture.body->op_value_def_slot[
        fixture.source_def] = -1;
    int32_t kind = fixture.source.kind;
    ColdExprResult materialized;
    (void)cold_materialize_var_param_value(
        &fixture.parser, fixture.body,
        fixture.source.slot, &kind,
        &fixture.source,
        &materialized);
    gate_fail(
        "managed var pointer fake slot text was accepted");
}

static void gate_run_managed_var_ptr_object_identity_negative(
        const char *mode) {
    GateFixture fixture;
    gate_managed_var_ptr_fixture_init(&fixture);
    if (strcmp(
            mode,
            "managed-var-ptr-unresolved-exact-type") == 0) {
        body_slot_set_type(
            fixture.body, fixture.source.slot,
            cold_cstr_span(
                "ManagedVarPtrGateUnresolvedRef"));
    } else if (strcmp(
                   mode,
                   "managed-var-ptr-ref-flag-drift") == 0) {
        ObjectDef *object = symbols_resolve_object(
            fixture.symbols,
            fixture.body->slot_type[
                fixture.source.slot]);
        if (!object || !object->is_ref)
            gate_fail(
                "managed var pointer ref object fixture is invalid");
        object->is_ref = false;
    } else {
        gate_fail(
            "unknown managed var pointer object identity mode");
    }
    int32_t kind = fixture.source.kind;
    ColdExprResult materialized;
    (void)cold_materialize_var_param_value(
        &fixture.parser, fixture.body,
        fixture.source.slot, &kind,
        &fixture.source,
        &materialized);
    gate_fail(
        "managed var pointer corrupt object identity was accepted");
}

static int32_t gate_add_decoy_managed_var_raw_slot(
        GateFixture *fixture) {
    int32_t decoy = body_slot(
        fixture->body, fixture->source.kind, 8);
    body_slot_set_type(
        fixture->body, decoy,
        fixture->body->slot_type[fixture->source.slot]);
    return decoy;
}

static void gate_run_managed_var_ptr_source_edge_negative(
        const char *mode) {
    GateFixture fixture;
    gate_managed_var_ptr_fixture_init(&fixture);
    BodyIR *body = fixture.body;
    int32_t definition = fixture.source_def;
    int32_t raw_param =
        body->param_slot[fixture.source.origin_id];
    if (strcmp(mode, "managed-var-ptr-source-edge-kind") == 0) {
        body->op_kind[definition] =
            BODY_OP_COPY_COMPOSITE;
    } else if (strcmp(
                   mode,
                   "managed-var-ptr-source-edge-dst") == 0) {
        body->op_dst[definition] =
            gate_add_decoy_managed_var_raw_slot(&fixture);
    } else if (strcmp(
                   mode,
                   "managed-var-ptr-source-edge-a") == 0) {
        body->op_a[definition] =
            gate_add_decoy_managed_var_raw_slot(&fixture);
    } else if (strcmp(
                   mode,
                   "managed-var-ptr-source-edge-borrow") == 0) {
        body->op_b[definition] = 0;
    } else if (strcmp(
                   mode,
                   "managed-var-ptr-source-edge-c") == 0) {
        body->op_c[definition] = 1;
    } else if (strcmp(
                   mode,
                   "managed-var-ptr-source-edge-source") == 0) {
        body->op_source_value_def_op_id[definition] =
            definition;
    } else if (strcmp(
                   mode,
                   "managed-var-ptr-source-edge-raw-authority") == 0) {
        body->slot_place_kind[raw_param] =
            COLD_EXPR_PLACE_PARAM;
    } else if (strcmp(
                   mode,
                   "managed-var-ptr-source-edge-raw-type") == 0 ||
               strcmp(
                   mode,
                   "managed-var-ptr-source-edge-carrier-type") == 0) {
        ObjectDef *other = gate_add_declared_object(
            fixture.symbols,
            cold_cstr_span("ManagedVarPtrGateOtherRef"), 1);
        if (!other)
            gate_fail("managed var pointer alternate object missing");
        other->is_ref = true;
        gate_set_marker_object(other);
        object_finalize_fields(other);
        int32_t changed_slot =
            strcmp(
                mode,
                "managed-var-ptr-source-edge-raw-type") == 0
                ? raw_param
                : fixture.source.slot;
        body_slot_set_type(
            body, changed_slot, other->name);
    } else if (strcmp(
                   mode,
                   "managed-var-ptr-source-edge-decoy-ordinal") == 0) {
        body->param_slot[fixture.source.origin_id] =
            gate_add_decoy_managed_var_raw_slot(&fixture);
    } else {
        gate_fail("unknown managed var pointer source-edge mode");
    }
    int32_t kind = fixture.source.kind;
    ColdExprResult materialized;
    (void)cold_materialize_var_param_value(
        &fixture.parser, body,
        fixture.source.slot, &kind,
        &fixture.source,
        &materialized);
    gate_fail(
        "managed var pointer corrupt source edge was accepted");
}

static void gate_shared_param_negative_rejected(
        const char *mode) {
    fprintf(
        stderr,
        "cold_managed_replace_identity_gate: "
        "shared ref parameter mutation rejected mode=%s\n",
        mode);
    exit(1);
}

static void gate_run_shared_param_copy_to_payload_negative(
        const char *mode) {
    GateSharedParamFixture fixture;
    gate_shared_param_fixture_init(&fixture);
    ColdExprResult *source =
        &fixture.parameters[0];
    ColdExprResult view =
        cold_exact_managed_object_ref_view(
            fixture.body, fixture.symbols,
            source, fixture.object->name);
    if (!gate_shared_param_view_contract(
            &fixture, source, &view)) {
        gate_fail(
            "shared ref parameter COPY_I64 baseline is invalid");
    }
    int32_t definition =
        view.value_def_op_id;
    fixture.body->op_kind[
        definition] =
            BODY_OP_PAYLOAD_LOAD;
    fixture.body->op_c[
        definition] = 8;
    if (gate_shared_param_view_contract(
            &fixture, source, &view)) {
        gate_fail(
            "shared ref parameter PAYLOAD_LOAD mutation was accepted");
    }
    gate_shared_param_negative_rejected(mode);
}

static void gate_run_var_param_payload_to_copy_negative(
        const char *mode) {
    GateFixture fixture;
    gate_managed_var_ptr_fixture_init(&fixture);
    int32_t kind = fixture.source.kind;
    ColdExprResult materialized;
    (void)cold_materialize_var_param_value(
        &fixture.parser, fixture.body,
        fixture.source.slot, &kind,
        &fixture.source,
        &materialized);
    if (!cold_exact_managed_param_ref_object_value_projection(
            fixture.body, fixture.symbols,
            &materialized)) {
        gate_fail(
            "var ref parameter PAYLOAD_LOAD baseline is invalid");
    }
    int32_t definition =
        materialized.value_def_op_id;
    fixture.body->op_kind[
        definition] = BODY_OP_COPY_I64;
    fixture.body->op_c[
        definition] = 0;
    if (cold_exact_managed_param_ref_object_value_projection(
            fixture.body, fixture.symbols,
            &materialized)) {
        gate_fail(
            "var ref parameter COPY_I64 mutation was accepted");
    }
    gate_shared_param_negative_rejected(mode);
}

static void gate_run_shared_param_negative(
        const char *mode) {
    if (strcmp(
            mode,
            "shared-ref-param-copy-to-payload") == 0) {
        gate_run_shared_param_copy_to_payload_negative(
            mode);
    }
    if (strcmp(
            mode,
            "shared-ref-param-var-payload-to-copy") == 0) {
        gate_run_var_param_payload_to_copy_negative(
            mode);
    }
    if (strcmp(
            mode,
            "shared-ref-param-global") == 0 ||
        strcmp(
            mode,
            "shared-ref-param-stack") == 0 ||
        strcmp(
            mode,
            "shared-ref-param-temporary") == 0) {
        gate_run_shared_param_nonparam_capability_negative(
            mode);
    }

    GateSharedParamFixture fixture;
    gate_shared_param_fixture_init(&fixture);
    ColdExprResult source =
        fixture.parameters[0];
    BodyIR *body = fixture.body;
    int32_t definition =
        source.value_def_op_id;
    FnDef *function =
        &fixture.symbols->functions[
            fixture.function_row];
    if (!cold_exact_shared_ref_param_pointer_value_shape(
            body, fixture.symbols,
            &source)) {
        gate_fail(
            "shared ref parameter negative baseline is invalid");
    }

    if (strcmp(
            mode,
            "shared-ref-param-borrows") == 0) {
        function->borrows_args = false;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-formal-var") == 0) {
        function->param_type[0] =
            cold_cstr_span(
                "var ManagedSharedParamGateRef");
    } else if (strcmp(
                   mode,
                   "shared-ref-param-ref-bit") == 0) {
        function->param_exact_object_is_ref[0] = 0;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-origin") == 0) {
        source.origin_id = 1;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-ordinal") == 0) {
        source.origin_id = 1;
        body->op_value_def_origin_id[
            definition] = 1;
        body->slot_origin_id[
            source.slot] = 1;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-producer") == 0) {
        source.producer_function_row =
            fixture.function_row + 1;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-op-a") == 0) {
        body->op_a[definition] =
            fixture.raw_param_slots[1];
    } else if (strcmp(
                   mode,
                   "shared-ref-param-op-b") == 0) {
        body->op_b[definition] = 0;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-slot") == 0) {
        source.slot =
            fixture.parameters[1].slot;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-definition") == 0) {
        source.value_def_op_id =
            fixture.parameters[1]
                .value_def_op_id;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-type-id") == 0) {
        source.exact_type_id++;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-storage") == 0) {
        body->slot_managed_storage_kind[
            source.slot] =
                COLD_MANAGED_STORAGE_PLAIN;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-kind") == 0) {
        source.kind = SLOT_OBJECT_REF;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-size") == 0) {
        body->slot_size[
            source.slot] = 16;
    } else if (strcmp(
                   mode,
                   "shared-ref-param-live") == 0) {
        int32_t terminal = body_term(
            body, BODY_TERM_RET,
            -1, 0, 0, -1, -1);
        body_end_block(
            body, fixture.entry_block,
            terminal);
    } else if (strcmp(
                   mode,
                   "shared-ref-param-consume") == 0) {
        body->op_value_def_consume_op_index_plus_one[
            definition] =
                definition + 1;
    } else {
        gate_fail(
            "unknown shared ref parameter mutation");
    }
    if (cold_exact_shared_ref_param_pointer_value_shape(
            body, fixture.symbols,
            &source)) {
        gate_fail(
            "shared ref parameter mutation was accepted");
    }
    gate_shared_param_negative_rejected(mode);
}

static void gate_check_closure_var_ref_param_type(void) {
    Arena *arena = gate_arena_new();
    ColdHarnessCompilation *compilation = arena_alloc(
        arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(compilation, arena);
    Symbols *symbols = compilation->symbols;
    ObjectDef *object = gate_add_declared_object(
        symbols,
        cold_cstr_span("ManagedClosureVarGateRef"), 1);
    if (!object)
        gate_fail("managed closure ref object registration failed");
    object->is_ref = true;
    object->fields[0].name =
        cold_cstr_span("marker");
    object->fields[0].kind = SLOT_I32;
    object->fields[0].size = 4;
    object->fields[0].type_name =
        cold_cstr_span("int32");
    object_finalize_fields(object);
    int32_t parent_function = symbols_add_fn(
        symbols,
        cold_cstr_span("ManagedClosureVarGateParent"),
        0, 0, 0, 0, cold_cstr_span("int32"));
    if (parent_function < 0)
        gate_fail("managed closure parent registration failed");
    BodyIR *parent = body_new(arena);
    parent->producer_function_row = parent_function;
    parent->debug_name =
        cold_cstr_span("managed_closure_var_gate_parent");
    int32_t parent_block = body_block(parent);
    Locals locals;
    locals_init(&locals, arena);
    Parser parser = cold_parser_issue_legacy_span(
        symbols, gate_declaration_unique_source(
        cold_cstr_span(
            "fn(target: var ManagedClosureVarGateRef): int32 =\n"
            "        return target.marker\n")));
    Span declaration_token = parser_token(&parser);
    if (!span_eq(declaration_token, "fn"))
        gate_fail("managed closure declaration token missing");
    int32_t kind = SLOT_I32;
    int32_t address =
        parse_closure_expr(
            &parser, parent, &locals, &kind,
            declaration_token);
    int32_t address_op = parent->op_count - 1;
    int32_t closure_function =
        address_op >= 0
            ? parent->op_a[address_op]
            : -1;
    if (kind != SLOT_PTR ||
        address < 0 ||
        address >= parent->slot_count ||
        address_op < 0 ||
        parent->op_kind[address_op] != BODY_OP_FN_ADDR ||
        parent->op_dst[address_op] != address ||
        closure_function < 0 ||
        closure_function >= symbols->function_count ||
        symbols->functions[closure_function].arity != 1 ||
        symbols->functions[closure_function].param_kind[0] !=
            SLOT_OBJECT_REF ||
        symbols->functions[closure_function]
                .param_exact_type_id[0] < 0 ||
        symbols->functions[closure_function]
                .param_exact_type_id[0] / 1048576 !=
            SLOT_OBJECT_REF ||
        !span_eq(
            symbols->functions[closure_function].param_type[0],
            "var ManagedClosureVarGateRef")) {
        gate_fail(
            "managed closure var parameter identity was not retained");
    }
    int32_t terminal = body_term(
        parent, BODY_TERM_RET,
        -1, 0, 0, -1, -1);
    body_end_block(parent, parent_block, terminal);
    puts("managed_closure_var_ref_param_type=1");
    arena_release(arena);
}

static void gate_check_positive(void) {
    GateFixture fixture;
    gate_fixture_init(&fixture);
    BodyIR *body = fixture.body;

    if (cold_current_open_block(body) !=
            fixture.entry_block ||
        !cold_exact_definition_is_live_at_current_point(
            body, fixture.target_def,
            fixture.entry_block) ||
        !cold_exact_definition_is_live_at_current_point(
            body, fixture.source_def,
            fixture.entry_block)) {
        gate_fail("target/source definitions are not live in the open block");
    }

    int32_t resume = cold_emit_exact_managed_param_replace(
        &fixture.parser, body, fixture.symbols,
        &fixture.target, &fixture.source,
        fixture.parser.source);
    if (resume != cold_current_open_block(body) ||
        !body_cur_block_valid(body)) {
        gate_fail("managed replace did not preserve open-block currency");
    }
    int32_t terminal = body_term(
        body, BODY_TERM_RET, -1, 0, 0, -1, -1);
    body_end_block(body, resume, terminal);

    int32_t replace = gate_find_unique_replace(body);
    if (!cold_exact_managed_replace_tuple_valid(
            body, fixture.symbols, replace)) {
        gate_fail("managed replace tuple is invalid");
    }
    int32_t old_slot = body->op_dst[replace];
    int32_t expected_type_id =
        SLOT_OBJECT_REF * 1048576 + 1;
    if (body->slot_kind[old_slot] != SLOT_PTR ||
        body->slot_size[old_slot] != 8 ||
        body->slot_kind[body->op_a[replace]] !=
            SLOT_OBJECT_REF ||
        body->slot_size[body->op_a[replace]] != 8 ||
        body->slot_kind[body->op_b[replace]] != SLOT_PTR ||
        body->slot_size[body->op_b[replace]] != 8 ||
        body->op_kind[fixture.source_def] != BODY_OP_PTR_CONST ||
        body->op_a[fixture.source_def] != 0 ||
        body->slot_exact_type_id[old_slot] !=
            expected_type_id ||
        body->slot_exact_type_id[body->op_a[replace]] !=
            expected_type_id ||
        body->slot_exact_type_id[body->op_b[replace]] !=
            expected_type_id) {
        gate_fail("ref object typed-nil replace tuple drifted");
    }
    if (body->op_c[replace] != fixture.target_def ||
        body->op_source_value_def_op_id[replace] !=
            fixture.source_def ||
        body->op_value_def_consume_op_index_plus_one[
            fixture.source_def] != replace + 1 ||
        gate_definition_consumer_count(
            body, fixture.source_def) != 1) {
        gate_fail("owned source does not have one exact replace consumer");
    }
    if (body->op_value_def_consume_op_index_plus_one[
            fixture.target_def] != 0 ||
        !cold_exact_definition_is_live_at_current_point(
            body, fixture.target_def, resume)) {
        gate_fail("unique var parameter definition lost liveness");
    }

    int32_t drop =
        body->op_value_def_consume_op_index_plus_one[replace] - 1;
    int32_t drop_slot =
        drop >= 0 && drop < body->op_count
            ? body->op_dst[drop]
            : -1;
    int32_t drop_call =
        drop >= 0 && drop < body->op_count &&
                body->op_value_def_consume_op_index_plus_one[drop] > 0
            ? body->op_value_def_consume_op_index_plus_one[drop] - 1
            : -1;
    if (drop <= replace || drop >= body->op_count ||
        body->op_kind[drop] != BODY_OP_COPY_COMPOSITE ||
        body->op_source_value_def_op_id[drop] != replace ||
        body->op_a[drop] != old_slot ||
        drop_slot < 0 || drop_slot >= body->slot_count ||
        body->op_value_def_slot[drop] != drop_slot ||
        body->op_value_def_exact_type_id[drop] !=
            body->op_value_def_exact_type_id[replace] ||
        body->op_value_def_producer_function_row[drop] !=
            body->producer_function_row ||
        body->op_value_def_place_kind[drop] !=
            COLD_EXPR_PLACE_TEMPORARY ||
        body->op_value_def_ownership[drop] !=
            COLD_EXPR_OWN_MOVE ||
        body->op_value_def_origin_id[drop] != drop ||
        body->slot_exact_type_id[drop_slot] !=
            body->op_value_def_exact_type_id[replace] ||
        body->slot_place_kind[drop_slot] !=
            COLD_EXPR_PLACE_TEMPORARY ||
        body->slot_origin_id[drop_slot] != drop ||
        body->slot_managed_storage_kind[drop_slot] !=
            body->slot_managed_storage_kind[old_slot] ||
        !cold_exact_drop_argument_materialization_copy(
            body, drop, replace) ||
        gate_definition_consumer_count(body, replace) != 1 ||
        drop_call <= drop || drop_call >= body->op_count ||
        !cold_exact_drop_call_for_definition(
            body, drop_call, drop) ||
        gate_definition_consumer_count(body, drop) != 1) {
        gate_fail("old owner does not have one exact drop");
    }
    if (!cold_bodyir_exact_identity_schema_valid(
            body, fixture.symbols,
            "managed-replace-gate")) {
        gate_fail("whole BodyIR exact identity schema rejected");
    }
    gate_check_rv64_object_ref_abi();
    gate_check_a64_object_ref_abi(&fixture, replace);
    gate_check_x64_object_ref_abi(&fixture, replace);
    gate_check_completed_borrow_before_replace();
    gate_check_managed_object_ref_view();
    gate_check_managed_shared_param_ref_view();
    gate_check_managed_var_ptr_materialize();
    gate_check_managed_var_opaque_ref_materialize();
    gate_check_managed_var_object_field_place();
    gate_check_managed_ref_address_projections();
    gate_check_managed_plain_var_aggregate();
    gate_check_closure_var_ref_param_type();
    gate_check_managed_global_schema_positive();
    gate_check_managed_global_schema_double_replace_positive();
    gate_check_body_store_signature_admission();

    puts("cold_managed_replace_identity_gate_status=pass");
    puts("open_block_liveness=1");
    puts("replace_tuple_valid=1");
    puts("ref_object_typed_nil=1");
    puts("source_unique_consume=1");
    puts("old_exact_drop=1");
    arena_release(fixture.arena);
}

static void gate_run_negative(const char *mode) {
    GateFixture fixture;
    gate_fixture_init(&fixture);
    if (strcmp(mode, "delete-target-def") == 0) {
        fixture.target.value_def_op_id = -1;
    } else if (strcmp(mode, "corrupt-type-id") == 0) {
        fixture.body->op_value_def_exact_type_id[
            fixture.target_def]++;
        fixture.body->slot_exact_type_id[
            fixture.target.slot]++;
    } else if (strcmp(mode, "duplicate-consume") == 0) {
        int32_t first_drop = body_slot(
            fixture.body, SLOT_PTR, 8);
        body_slot_set_type(
            fixture.body, first_drop,
            cold_cstr_span("ManagedReplaceGateRef"));
        int32_t first_consumer = body_op(
            fixture.body, BODY_OP_COPY_COMPOSITE,
            first_drop, fixture.source.slot, 0);
        fixture.body->op_source_value_def_op_id[
            first_consumer] = fixture.source_def;
        fixture.body->op_value_def_consume_op_index_plus_one[
            fixture.source_def] = first_consumer + 1;
    } else if (strcmp(mode, "closed-block") == 0) {
        body_end_block(
            fixture.body, fixture.entry_block, -1);
    } else if (strcmp(
                   mode,
                   "borrow-use-after-replace") == 0) {
        ColdExprResult escaped_borrow =
            cold_exact_managed_ref_value_borrow(
                fixture.body, fixture.symbols,
                &fixture.target_value);
        int32_t resume =
            cold_emit_exact_managed_param_replace(
                &fixture.parser, fixture.body,
                fixture.symbols, &fixture.target,
                &fixture.source,
                fixture.parser.source);
        (void)gate_append_borrow_projection(
            &fixture, &escaped_borrow);
        int32_t terminal = body_term(
            fixture.body, BODY_TERM_RET,
            -1, 0, 0, -1, -1);
        body_end_block(
            fixture.body, resume, terminal);
        if (cold_bodyir_exact_identity_schema_valid(
                fixture.body, fixture.symbols,
                "managed-replace-borrow-after")) {
            gate_fail(
                "borrow use after managed replace was accepted");
        }
        exit(1);
    } else if (strcmp(
                   mode,
                   "sentinel-managed-copy-after-replace") == 0) {
        ColdExprResult escaped_borrow =
            cold_exact_managed_ref_value_borrow(
                fixture.body, fixture.symbols,
                &fixture.target_value);
        int32_t copied_slot = body_slot(
            fixture.body, escaped_borrow.kind,
            fixture.body->slot_size[escaped_borrow.slot]);
        body_slot_set_type(
            fixture.body, copied_slot,
            fixture.body->slot_type[escaped_borrow.slot]);
        fixture.body->slot_aux[copied_slot] =
            fixture.body->slot_aux[escaped_borrow.slot];
        fixture.body->slot_no_alias[copied_slot] =
            fixture.body->slot_no_alias[escaped_borrow.slot];
        (void)body_op(
            fixture.body,
            fixture.body->slot_size[escaped_borrow.slot] == 8
                ? BODY_OP_COPY_I64
                : BODY_OP_COPY_COMPOSITE,
            copied_slot, escaped_borrow.slot, 0);

        int32_t resume =
            cold_emit_exact_managed_param_replace(
                &fixture.parser, fixture.body,
                fixture.symbols, &fixture.target,
                &fixture.source,
                fixture.parser.source);
        int32_t use_kind = escaped_borrow.kind;
        int32_t use_size =
            fixture.body->slot_size[copied_slot];
        Span use_type =
            fixture.body->slot_type[copied_slot];
        int32_t use_fn = symbols_add_fn(
            fixture.symbols,
            cold_cstr_span("SentinelManagedCopyUse"),
            1, &use_kind, &use_size, &use_type,
            cold_cstr_span("int32"));
        if (use_fn < 0)
            gate_fail("sentinel managed copy use registration failed");
        int32_t arg_start =
            fixture.body->call_arg_count;
        body_call_arg(fixture.body, copied_slot);
        int32_t use_result =
            body_slot(fixture.body, SLOT_I32, 4);
        (void)body_op(
            fixture.body, BODY_OP_CALL_I32,
            use_result, use_fn, arg_start);
        int32_t terminal = body_term(
            fixture.body, BODY_TERM_RET,
            use_result, 0, 0, -1, -1);
        body_end_block(
            fixture.body, resume, terminal);
        if (cold_bodyir_exact_identity_schema_valid(
                fixture.body, fixture.symbols,
                "managed-replace-sentinel-copy-after")) {
            gate_fail(
                "sentinel managed copy after replace was accepted");
        }
        exit(1);
    } else if (strcmp(
                   mode,
                   "managed-object-ref-view-missing-def") == 0) {
        ColdExprResult missing_definition =
            fixture.source;
        missing_definition.value_def_op_id = -1;
        (void)cold_exact_managed_object_ref_view(
            fixture.body, fixture.symbols,
            &missing_definition,
            cold_cstr_span("ManagedReplaceGateRef"));
        gate_fail(
            "managed object ref view missing definition was accepted");
    } else {
        gate_fail("unknown negative mode");
    }
    (void)cold_emit_exact_managed_param_replace(
        &fixture.parser, fixture.body, fixture.symbols,
        &fixture.target, &fixture.source,
        fixture.parser.source);
    gate_fail("negative mutation was accepted");
}

static void gate_run_rv64_abi_negative(const char *mode) {
    Arena *arena = gate_arena_new();
    if (strcmp(mode, "rv64-object-ref-param-width") == 0) {
        BodyIR *callee = body_new(arena);
        int32_t param =
            body_slot(callee, SLOT_OBJECT_REF, 4);
        callee->param_count = 1;
        callee->param_slot[0] = param;
        Code *code = code_new(arena, 16);
        rv64_codegen_store_params(code, callee);
    } else {
        ColdHarnessCompilation *compilation = arena_alloc(
            arena, sizeof(ColdHarnessCompilation));
        cold_harness_compilation_begin(compilation, arena);
        Symbols *symbols = compilation->symbols;
        int32_t kind = SLOT_OBJECT_REF;
        int32_t size = 8;
        Span type =
            cold_cstr_span("var ManagedReplaceGateRef");
        int32_t fn = symbols_add_fn(
            symbols, cold_cstr_span("Rv64ObjectRefNegative"),
            1, &kind, &size, &type, cold_cstr_span(""));
        if (fn < 0)
            gate_fail("RV64 negative fixture function registration failed");
        BodyIR *caller = body_new(arena);
        int32_t arg = -1;
        if (strcmp(mode, "rv64-object-ref-arg-width") == 0) {
            arg = body_slot(caller, SLOT_OBJECT_REF, 4);
        } else if (strcmp(
                       mode,
                       "rv64-object-ref-arg-kind") == 0) {
            arg = body_slot(caller, SLOT_PTR, 8);
        } else {
            gate_fail("unknown RV64 ABI negative mode");
        }
        body_call_arg(caller, arg);
        Code *code = code_new(arena, 16);
        (void)rv64_codegen_load_call_args(
            code, caller, symbols, fn, 0);
    }
    arena_release(arena);
    gate_fail("RV64 ABI negative mutation was accepted");
}

static void gate_run_a64_abi_negative(const char *mode) {
    Arena *arena = gate_arena_new();
    if (strcmp(mode, "a64-object-ref-param-width") == 0) {
        BodyIR *callee = body_new(arena);
        int32_t param =
            body_slot(callee, SLOT_OBJECT_REF, 4);
        callee->param_count = 1;
        callee->param_slot[0] = param;
        Code *code = code_new(arena, 16);
        codegen_store_params(code, callee);
    } else {
        ColdHarnessCompilation *compilation = arena_alloc(
            arena, sizeof(ColdHarnessCompilation));
        cold_harness_compilation_begin(compilation, arena);
        Symbols *symbols = compilation->symbols;
        int32_t kind = SLOT_OBJECT_REF;
        int32_t size = 8;
        Span type =
            cold_cstr_span("var ManagedReplaceGateRef");
        int32_t function = symbols_add_fn(
            symbols, cold_cstr_span("A64ObjectRefNegative"),
            1, &kind, &size, &type, cold_cstr_span(""));
        if (function < 0)
            gate_fail("A64 negative fixture function registration failed");
        BodyIR *caller = body_new(arena);
        int32_t arg = -1;
        if (strcmp(mode, "a64-object-ref-arg-width") == 0) {
            arg = body_slot(caller, SLOT_OBJECT_REF, 4);
        } else if (strcmp(
                       mode,
                       "a64-object-ref-arg-kind") == 0) {
            arg = body_slot(caller, SLOT_PTR, 8);
        } else {
            gate_fail("unknown A64 ABI negative mode");
        }
        body_call_arg(caller, arg);
        Code *code = code_new(arena, 16);
        (void)codegen_load_call_args(
            code, caller, symbols,
            &symbols->functions[function], 0, -1);
    }
    arena_release(arena);
    gate_fail("A64 ABI negative mutation was accepted");
}

static void gate_run_x64_abi_negative(const char *mode) {
    Arena *arena = gate_arena_new();
    if (strcmp(mode, "x64-object-ref-param-width") == 0) {
        BodyIR *callee = body_new(arena);
        int32_t param =
            body_slot(callee, SLOT_OBJECT_REF, 4);
        callee->param_count = 1;
        callee->param_slot[0] = param;
        X64Code code = {0};
        x64_init(&code, 128);
        x64_codegen_store_params(&code, callee, 128);
        x64_release(&code);
    } else {
        ColdHarnessCompilation *compilation = arena_alloc(
            arena, sizeof(ColdHarnessCompilation));
        cold_harness_compilation_begin(compilation, arena);
        Symbols *symbols = compilation->symbols;
        int32_t kind = SLOT_OBJECT_REF;
        int32_t size = 8;
        Span type =
            cold_cstr_span("var ManagedReplaceGateRef");
        int32_t function = symbols_add_fn(
            symbols, cold_cstr_span("X64ObjectRefNegative"),
            1, &kind, &size, &type, cold_cstr_span(""));
        if (function < 0)
            gate_fail("x64 negative fixture function registration failed");
        BodyIR *caller = body_new(arena);
        int32_t arg = -1;
        if (strcmp(mode, "x64-object-ref-arg-width") == 0) {
            arg = body_slot(caller, SLOT_OBJECT_REF, 4);
        } else if (strcmp(
                       mode,
                       "x64-object-ref-arg-kind") == 0) {
            arg = body_slot(caller, SLOT_PTR, 8);
        } else {
            gate_fail("unknown x64 ABI negative mode");
        }
        body_call_arg(caller, arg);
        X64Code code = {0};
        x64_init(&code, 128);
        (void)x64_codegen_load_call_args(
            &code, caller,
            &symbols->functions[function], 0);
        x64_release(&code);
    }
    arena_release(arena);
    gate_fail("x64 ABI negative mutation was accepted");
}

int main(int argc, char **argv) {
    if (argc >= 2 && strcmp(argv[1], "compiler") == 0)
        return cheng_cold_embedded_main(argc - 1, argv + 1);
    gate_declaration_snapshot_begin();
    if (argc == 2) {
        if (ColdErrorJumpDepth < 0 ||
            ColdErrorJumpDepth >= COLD_JMP_STACK_MAX) {
            gate_fail("negative gate recovery stack is unavailable");
        }
        ColdErrorRecoveryEnabled = true;
        int32_t recovery_index = ColdErrorJumpDepth++;
        if (setjmp(ColdErrorJumpStack[recovery_index]) != 0) {
            ColdErrorJumpDepth = recovery_index;
            ColdErrorRecoveryEnabled = false;
            return 1;
        }
    }
    if (argc == 2 &&
        cold_span_starts_with(
            cold_cstr_span(argv[1]),
            "managed-global-schema-")) {
        gate_run_managed_global_schema_negative(argv[1]);
    }
    if (argc == 2 &&
        cold_span_starts_with(
            cold_cstr_span(argv[1]), "rv64-object-ref-")) {
        gate_run_rv64_abi_negative(argv[1]);
    }
    if (argc == 2 &&
        cold_span_starts_with(
            cold_cstr_span(argv[1]), "a64-object-ref-")) {
        gate_run_a64_abi_negative(argv[1]);
    }
    if (argc == 2 &&
        cold_span_starts_with(
            cold_cstr_span(argv[1]), "x64-object-ref-")) {
        gate_run_x64_abi_negative(argv[1]);
    }
    if (argc == 2 &&
        strcmp(
            argv[1],
            "managed-var-ptr-missing-def") == 0) {
        gate_run_managed_var_ptr_missing_def();
    }
    if (argc == 2 &&
        strcmp(
            argv[1],
            "managed-var-ptr-formal-non-var") == 0) {
        gate_run_managed_var_ptr_formal_non_var();
    }
    if (argc == 2 &&
        strcmp(
            argv[1],
            "managed-var-ptr-fake-slot-text") == 0) {
        gate_run_managed_var_ptr_fake_slot_text();
    }
    if (argc == 2 &&
        (strcmp(
             argv[1],
             "managed-var-ptr-unresolved-exact-type") == 0 ||
         strcmp(
             argv[1],
             "managed-var-ptr-ref-flag-drift") == 0)) {
        gate_run_managed_var_ptr_object_identity_negative(
            argv[1]);
    }
    if (argc == 2 &&
        cold_span_starts_with(
            cold_cstr_span(argv[1]),
            "managed-var-ptr-source-edge-")) {
        gate_run_managed_var_ptr_source_edge_negative(
            argv[1]);
    }
    if (argc == 2 &&
        cold_span_starts_with(
            cold_cstr_span(argv[1]),
            "shared-ref-param-")) {
        gate_run_shared_param_negative(
            argv[1]);
    }
    if (argc == 2 &&
        (cold_span_starts_with(
             cold_cstr_span(argv[1]),
             "body-store-admission-") ||
         cold_span_starts_with(
             cold_cstr_span(argv[1]),
             "body-store-token-"))) {
        gate_run_body_store_admission_negative(
            argv[1]);
    }
    if (argc == 2)
        gate_run_negative(argv[1]);
    if (argc != 1)
        gate_fail("unexpected arguments");
    gate_check_positive();
    gate_declaration_snapshot_end();
    return 0;
}
