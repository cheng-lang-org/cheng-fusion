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
    Local local;
    int32_t loop_block;
    int32_t definition;
    int32_t projection;
    int32_t scope_end;
} GateFixture;

typedef struct GenericAbiFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation *compilation;
    ColdSourceSnapshotTable *source_snapshot;
    Span source_rows[1];
    Span diagnostic_paths[1];
    Span module_paths[1];
    uint8_t content_cids[1][32];
    uint8_t document_cids[1][32];
    ObjectDef *open_result;
    ObjectDef *concrete_result;
    ObjectDef *other_open_result;
    int32_t generic_function_row;
    int32_t other_generic_function_row;
} GenericAbiFixture;

typedef struct GateIdentitySource {
    ColdSourceSnapshotTable *snapshot;
    Span source_rows[1];
    Span diagnostic_paths[1];
    Span module_paths[1];
    uint8_t content_cids[1][32];
    uint8_t document_cids[1][32];
} GateIdentitySource;

typedef struct DirectImportProjectionFixture {
    Arena *arena;
    Arena *scan_arena;
    Symbols *parent;
    Symbols *local;
    ColdHarnessCompilation *compilation;
    ColdSourceSnapshotTable *snapshot;
    Span source_rows[2];
    Span diagnostic_paths[2];
    Span module_paths[2];
    uint8_t content_cids[2][32];
    uint8_t document_cids[2][32];
    Span import_aliases[1];
    int32_t import_source_rows[1];
    TypeDef *parent_scalar;
    ObjectDef *parent_base;
    ObjectDef *parent_derived;
    ObjectDef *parent_result;
    ObjectDef *parent_fixed_bytes32;
    int32_t wrong_type_offset;
} DirectImportProjectionFixture;

static void gate_fail(const char *message) {
    fprintf(
        stderr,
        "cold_loop_local_plain_scope_identity_gate: %s\n",
        message);
    exit(1);
}

static ObjectDef *gate_add_plain_pair(Symbols *symbols) {
    ObjectDef *object = symbols_add_object(
        symbols, cold_cstr_span("GateLoopPlainPair"), 2);
    object->fields[0].name = cold_cstr_span("left");
    object->fields[0].type_name = cold_cstr_span("int32");
    object->fields[0].kind = SLOT_I32;
    object->fields[0].size = 4;
    object->fields[1].name = cold_cstr_span("right");
    object->fields[1].type_name = cold_cstr_span("int32");
    object->fields[1].kind = SLOT_I32;
    object->fields[1].size = 4;
    object_finalize_fields(object);
    return object;
}

static ObjectDef *gate_add_parser_result(
        Symbols *symbols, Span name,
        Span decl_path, int32_t origin) {
    ObjectDef *object =
        symbols_add_object(symbols, name, 1);
    Span generic_name = cold_cstr_span("T");
    symbols_set_object_generic_names(
        symbols, object, &generic_name, 1);
    object->fields[0].name =
        cold_cstr_span("value");
    object->fields[0].type_name =
        cold_cstr_span("T");
    object->fields[0].kind = SLOT_I32;
    object->fields[0].size = 4;
    object->is_parser_declaration = true;
    object->declaration_origin_row = origin;
    object->decl_path = decl_path;
    object_finalize_fields(object);
    return object;
}

static ObjectDef *gate_add_parser_result_at_origin(
        Symbols *symbols, Span name,
        Span decl_path, int32_t module_source_row,
        int32_t token_byte_offset) {
    ObjectDef *object =
        symbols_add_object_at_origin(
            symbols, name, 1,
            module_source_row,
            token_byte_offset);
    Span generic_name = cold_cstr_span("T");
    symbols_set_object_generic_names(
        symbols, object, &generic_name, 1);
    object->fields[0].name =
        cold_cstr_span("value");
    object->fields[0].type_name =
        cold_cstr_span("T");
    object->fields[0].kind = SLOT_I32;
    object->fields[0].size = 4;
    object->is_parser_declaration = true;
    object->decl_path = decl_path;
    object_finalize_fields(object);
    return object;
}

static ObjectDef *gate_add_parser_bytes(
        Symbols *symbols) {
    ObjectDef *object =
        symbols_add_object(
            symbols,
            cold_cstr_span("rawbytes.Bytes"), 2);
    object->fields[0].name =
        cold_cstr_span("data");
    object->fields[0].type_name =
        cold_cstr_span("ptr");
    object->fields[0].kind = SLOT_PTR;
    object->fields[0].size = 8;
    object->fields[1].name =
        cold_cstr_span("len");
    object->fields[1].type_name =
        cold_cstr_span("int32");
    object->fields[1].kind = SLOT_I32;
    object->fields[1].size = 4;
    object->is_parser_declaration = true;
    object->declaration_origin_row = 12;
    object->decl_path =
        cold_cstr_span("/gate/std/rawbytes.cheng");
    object_finalize_fields(object);
    return object;
}

static ObjectDef *gate_add_parser_bytes_at_origin(
        Symbols *symbols, int32_t module_source_row,
        int32_t token_byte_offset, Span decl_path) {
    ObjectDef *object =
        symbols_add_object_at_origin(
            symbols,
            cold_cstr_span("rawbytes.Bytes"), 2,
            module_source_row, token_byte_offset);
    object->fields[0].name =
        cold_cstr_span("data");
    object->fields[0].type_name =
        cold_cstr_span("ptr");
    object->fields[0].kind = SLOT_PTR;
    object->fields[0].size = 8;
    object->fields[1].name =
        cold_cstr_span("len");
    object->fields[1].type_name =
        cold_cstr_span("int32");
    object->fields[1].kind = SLOT_I32;
    object->fields[1].size = 4;
    object->is_parser_declaration = true;
    object->decl_path = decl_path;
    object_finalize_fields(object);
    return object;
}

static ObjectDef *gate_add_concrete_u(
        Symbols *symbols, int32_t module_source_row,
        int32_t token_byte_offset) {
    ObjectDef *object =
        symbols_add_object_at_origin(
            symbols, cold_cstr_span("U"), 1,
            module_source_row, token_byte_offset);
    object->fields[0].name =
        cold_cstr_span("bits");
    object->fields[0].type_name =
        cold_cstr_span("int64");
    object->fields[0].kind = SLOT_I64;
    object->fields[0].size = 8;
    object->is_parser_declaration = true;
    object->decl_path =
        cold_cstr_span("/gate/generic_abi.cheng");
    object_finalize_fields(object);
    return object;
}

static void gate_generic_source_identity(
        GenericAbiFixture *fixture) {
    static const char source_text[] =
        "fn GateGenericFormal[T](value: Result[T]): Result[T] =\n"
        "    return value\n"
        "fn GateGenericOther[U](value: U): U =\n"
        "    return value\n"
        "type U = object\n"
        "    bits: int64\n"
        "type Bytes = object\n"
        "    data: ptr\n"
        "    len: int32\n"
        "type ForgedBytes = object\n"
        "    data: ptr\n"
        "    len: int32\n"
        "type Result[T] = object\n"
        "    value: T\n";
    fixture->source_rows[0] =
        cold_cstr_span(source_text);
    ColdSourceSnapshotTable *snapshot =
        cold_harness_compilation_seal_source(
            fixture->compilation,
            fixture->source_rows[0], "generic_abi");
    fixture->source_snapshot = snapshot;
    fixture->source_rows[0] = snapshot->bytes[0];
    fixture->diagnostic_paths[0] = snapshot->diagnostic_paths[0];
    fixture->module_paths[0] = snapshot->module_paths[0];
    memcpy(fixture->content_cids[0],
           snapshot->content_cids[0], 32);
    memcpy(fixture->document_cids[0],
           snapshot->document_cids[0], 32);
}

static int32_t gate_identity_declaration_offset(
        Span source, const char *declaration) {
    const char *match =
        strstr((const char *)source.ptr, declaration);
    if (!match) {
        gate_fail("identity declaration source is missing");
    }
    ptrdiff_t offset =
        match - (const char *)source.ptr;
    if (offset < 0 || offset >= source.len) {
        gate_fail("identity declaration offset is invalid");
    }
    return (int32_t)offset;
}

static void gate_require_source_identity_canonicalization(
        DirectImportProjectionFixture *fixture) {
    if (!fixture || !fixture->arena) {
        gate_fail("source identity canonical fixture is invalid");
    }
    int32_t canonical_to_internal[2] = {-1, -1};
    int32_t internal_to_canonical[2] = {-1, -1};
    if (!cold_source_identity_canonical_order(
            2, fixture->document_cids,
            canonical_to_internal,
            internal_to_canonical)) {
        gate_fail("source identity canonical order failed");
    }

    Span canonical_sources[2];
    Span canonical_modules[2];
    Span canonical_diagnostics[2];
    int32_t canonical_lengths[2];
    uint8_t canonical_content_cids[2][32];
    uint8_t canonical_document_cids[2][32];
    for (int32_t rank = 0; rank < 2; rank++) {
        int32_t internal = canonical_to_internal[rank];
        if (internal < 0 || internal >= 2 ||
            internal_to_canonical[internal] != rank) {
            gate_fail("source identity canonical maps disagree");
        }
        canonical_sources[rank] = fixture->source_rows[internal];
        canonical_modules[rank] = fixture->module_paths[internal];
        canonical_diagnostics[rank] = fixture->module_paths[internal];
        canonical_lengths[rank] = fixture->source_rows[internal].len;
        memcpy(canonical_content_cids[rank],
               fixture->content_cids[internal], 32);
        memcpy(canonical_document_cids[rank],
               fixture->document_cids[internal], 32);
    }

    Span reversed_sources[2] = {
        canonical_sources[1], canonical_sources[0]
    };
    Span reversed_modules[2] = {
        canonical_modules[1], canonical_modules[0]
    };
    Span reversed_diagnostics[2] = {
        canonical_diagnostics[1], canonical_diagnostics[0]
    };
    int32_t reversed_lengths[2] = {
        canonical_lengths[1], canonical_lengths[0]
    };
    uint8_t reversed_content_cids[2][32];
    uint8_t reversed_document_cids[2][32];
    memcpy(reversed_content_cids[0], canonical_content_cids[1], 32);
    memcpy(reversed_content_cids[1], canonical_content_cids[0], 32);
    memcpy(reversed_document_cids[0], canonical_document_cids[1], 32);
    memcpy(reversed_document_cids[1], canonical_document_cids[0], 32);

    uint8_t canonical_root[32];
    uint8_t reversed_root[32];
    if (!cold_source_identity_root_cid_compute(
            fixture->arena, 2,
            canonical_sources, NULL,
            canonical_document_cids,
            canonical_content_cids,
            canonical_root) ||
        !cold_source_identity_root_cid_compute(
            fixture->arena, 2,
            reversed_sources, NULL,
            reversed_document_cids,
            reversed_content_cids,
            reversed_root) ||
        memcmp(canonical_root, reversed_root, 32) != 0 ||
        memcmp(canonical_root, fixture->snapshot->root_cid, 32) != 0) {
        gate_fail("source identity root depends on capture order");
    }
    if (!cold_source_identity_metadata_validate(
            fixture->arena, fixture->snapshot->package_id,
            canonical_root, 2, NULL, canonical_lengths,
            canonical_modules, canonical_diagnostics,
            canonical_content_cids, canonical_document_cids,
            true, true)) {
        gate_fail("canonical source identity metadata was rejected");
    }

    uint8_t wrong_root[32];
    memcpy(wrong_root, canonical_root, 32);
    wrong_root[0] ^= 0x01u;
    if (cold_source_identity_metadata_validate(
            fixture->arena, fixture->snapshot->package_id,
            wrong_root, 2, NULL, canonical_lengths,
            canonical_modules, canonical_diagnostics,
            canonical_content_cids, canonical_document_cids,
            true, true)) {
        gate_fail("bad source identity root was accepted");
    }
    if (cold_source_identity_metadata_validate(
            fixture->arena, fixture->snapshot->package_id,
            reversed_root, 2, NULL, reversed_lengths,
            reversed_modules, reversed_diagnostics,
            reversed_content_cids, reversed_document_cids,
            true, true)) {
        gate_fail("noncanonical source identity metadata was accepted");
    }
}

static void gate_identity_source_attach(
        GateFixture *fixture,
        GateIdentitySource *identity) {
    static const char source_text[] =
        "type GateOp = enum\n"
        "    GateRead\n"
        "type GateFetcher = fn(op: GateOp): int32\n"
        "type Result[T] = object\n"
        "    value: T\n"
        "type Bytes = object\n"
        "    data: ptr\n"
        "    len: int32\n"
        "type OtherResult[T] = object\n"
        "    value: T\n";
    if (!fixture || !fixture->arena ||
        !fixture->symbols || !identity) {
        gate_fail("identity source fixture is invalid");
    }
    memset(identity, 0, sizeof(*identity));
    identity->source_rows[0] =
        cold_cstr_span(source_text);
    identity->snapshot = cold_harness_compilation_seal_source(
        fixture->compilation, identity->source_rows[0], "identity");
    identity->source_rows[0] = identity->snapshot->bytes[0];
    fixture->parser = cold_parser_issue_legacy_span(
        fixture->symbols, identity->source_rows[0]);
    identity->diagnostic_paths[0] =
        identity->snapshot->diagnostic_paths[0];
    identity->module_paths[0] =
        identity->snapshot->module_paths[0];
    memcpy(identity->content_cids[0],
           identity->snapshot->content_cids[0], 32);
    memcpy(identity->document_cids[0],
           identity->snapshot->document_cids[0], 32);
}

static void gate_direct_import_projection_fixture(
        DirectImportProjectionFixture *fixture) {
    static const char direct_source[] =
        "type DirectScalar = int32\n"
        "type DirectBase = object\n"
        "    baseValue: int32\n"
        "type DirectDerived = object of DirectBase\n"
        "    childValue: int32\n"
        "type DirectResult[T] = object\n"
        "    value: T\n"
        "type DirectFixedBytes32 = object\n"
        "    word: int64\n";
    static const char wrong_source[] =
        "type WrongScalar = int32\n"
        "type WrongObject = object\n"
        "    value: int32\n";
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (fixture->arena == MAP_FAILED)
        gate_fail("direct import projection arena allocation failed");
    memset(fixture->arena, 0, sizeof(Arena));
    fixture->compilation = arena_alloc(
        fixture->arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(
        fixture->compilation, fixture->arena);
    fixture->scan_arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (fixture->scan_arena == MAP_FAILED)
        gate_fail("direct import type-scan arena allocation failed");
    memset(fixture->scan_arena, 0, sizeof(Arena));
    fixture->parent = fixture->compilation->symbols;
    fixture->source_rows[0] =
        cold_cstr_span(direct_source);
    fixture->source_rows[1] =
        cold_cstr_span(wrong_source);
    const char *module_paths[2] = {
        "direct_dep", "wrong_dep"};
    fixture->snapshot =
        cold_harness_compilation_seal_sources(
            fixture->compilation, fixture->source_rows,
            module_paths, 2);
    for (int32_t row = 0; row < 2; row++) {
        fixture->source_rows[row] =
            fixture->snapshot->bytes[row];
        fixture->diagnostic_paths[row] =
            fixture->snapshot->diagnostic_paths[row];
        fixture->module_paths[row] =
            fixture->snapshot->module_paths[row];
        memcpy(fixture->content_cids[row],
               fixture->snapshot->content_cids[row], 32);
        memcpy(fixture->document_cids[row],
               fixture->snapshot->document_cids[row], 32);
    }
    gate_require_source_identity_canonicalization(
        fixture);

    int32_t scalar_offset =
        gate_identity_declaration_offset(
            fixture->source_rows[0],
            "DirectScalar");
    int32_t base_offset =
        gate_identity_declaration_offset(
            fixture->source_rows[0],
            "DirectBase");
    int32_t derived_offset =
        gate_identity_declaration_offset(
            fixture->source_rows[0],
            "DirectDerived");
    int32_t result_offset =
        gate_identity_declaration_offset(
            fixture->source_rows[0],
            "DirectResult");
    int32_t fixed_bytes32_offset =
        gate_identity_declaration_offset(
            fixture->source_rows[0],
            "DirectFixedBytes32");
    fixture->wrong_type_offset =
        gate_identity_declaration_offset(
            fixture->source_rows[1],
            "WrongScalar");
    fixture->parent_scalar =
        symbols_add_type_at_origin(
            fixture->parent,
            cold_cstr_span("dep.DirectScalar"),
            0, 0, scalar_offset);
    fixture->parent_scalar->alias_type =
        cold_cstr_span("int32");
    fixture->parent_scalar->decl_path =
        fixture->diagnostic_paths[0];

    fixture->parent_base =
        symbols_add_object_at_origin(
            fixture->parent,
            cold_cstr_span("dep.DirectBase"),
            1, 0, base_offset);
    fixture->parent_base->decl_path =
        fixture->diagnostic_paths[0];
    fixture->parent_base->fields[0].name =
        cold_cstr_span("baseValue");
    fixture->parent_base->fields[0].type_name =
        cold_cstr_span("int32");
    fixture->parent_base->fields[0].kind =
        SLOT_I32;
    fixture->parent_base->fields[0].size = 4;
    object_finalize_fields(
        fixture->parent_base);

    fixture->parent_derived =
        symbols_add_object_at_origin(
            fixture->parent,
            cold_cstr_span("dep.DirectDerived"),
            2, 0, derived_offset);
    fixture->parent_derived->decl_path =
        fixture->diagnostic_paths[0];
    object_materialize_inherited_prefix(
        fixture->parent,
        fixture->parent_derived,
        symbols_object_index(
            fixture->parent,
            fixture->parent_base));
    fixture->parent_derived->fields[1].name =
        cold_cstr_span("childValue");
    fixture->parent_derived->fields[1].type_name =
        cold_cstr_span("int32");
    fixture->parent_derived->fields[1].kind =
        SLOT_I32;
    fixture->parent_derived->fields[1].size = 4;
    object_finalize_fields_with_base(
        fixture->parent_derived,
        fixture->parent_base);

    fixture->parent_result =
        symbols_add_object_at_origin(
            fixture->parent,
            cold_cstr_span("dep.DirectResult"),
            1, 0, result_offset);
    fixture->parent_result->decl_path =
        fixture->diagnostic_paths[0];
    Span result_generic_name = cold_cstr_span("T");
    symbols_set_object_generic_names(
        fixture->parent, fixture->parent_result,
        &result_generic_name, 1);
    fixture->parent_result->fields[0].name =
        cold_cstr_span("value");
    fixture->parent_result->fields[0].type_name =
        cold_cstr_span("T");
    fixture->parent_result->fields[0].kind = SLOT_I32;
    fixture->parent_result->fields[0].size = 4;
    object_finalize_fields(fixture->parent_result);

    fixture->parent_fixed_bytes32 =
        symbols_add_object_at_origin(
            fixture->parent,
            cold_cstr_span("dep.DirectFixedBytes32"),
            1, 0, fixed_bytes32_offset);
    fixture->parent_fixed_bytes32->decl_path =
        fixture->diagnostic_paths[0];
    fixture->parent_fixed_bytes32->fields[0].name =
        cold_cstr_span("word");
    fixture->parent_fixed_bytes32->fields[0].type_name =
        cold_cstr_span("int64");
    fixture->parent_fixed_bytes32->fields[0].kind = SLOT_I64;
    fixture->parent_fixed_bytes32->fields[0].size = 8;
    object_finalize_fields(
        fixture->parent_fixed_bytes32);

    fixture->local =
        symbols_new_type_scan(
            fixture->parent, fixture->scan_arena);
    fixture->import_aliases[0] =
        cold_cstr_span("dep");
    fixture->import_source_rows[0] = 0;
    fixture->local->type_scan_import_parent =
        fixture->parent;
    fixture->local->type_scan_import_aliases =
        fixture->import_aliases;
    fixture->local->type_scan_import_source_rows =
        fixture->import_source_rows;
    fixture->local->type_scan_import_alias_count = 1;
}

static int gate_isolated_direct_import_positive(void) {
    DirectImportProjectionFixture fixture;
    gate_direct_import_projection_fixture(&fixture);
    TypeDef *local_scalar = symbols_find_type(
        fixture.local,
        cold_cstr_span("dep.DirectScalar"));
    ObjectDef *local_derived =
        symbols_find_object(
            fixture.local,
            cold_cstr_span("dep.DirectDerived"));
    int32_t local_derived_row =
        symbols_object_index(
            fixture.local, local_derived);
    if (!local_scalar ||
        !local_scalar->is_type_scan_import_projection ||
        !local_derived ||
        !local_derived->is_type_scan_import_projection ||
        local_derived_row < 0 ||
        local_derived->base_object_index < 0 ||
        local_derived->base_object_index >=
            fixture.local->object_count) {
        gate_fail("direct import projection is incomplete");
    }
    ObjectDef *local_base =
        &fixture.local->objects[
            local_derived->base_object_index];
    uint8_t parent_base_cid[32];
    uint8_t local_base_cid[32];
    uint8_t parent_type_cid[32];
    uint8_t local_type_cid[32];
    if (!cold_object_semantic_owner_cid(
            fixture.parent,
            fixture.parent_base,
            parent_base_cid) ||
        !cold_object_semantic_owner_cid(
            fixture.local,
            local_base,
            local_base_cid) ||
        memcmp(parent_base_cid,
               local_base_cid, 32) != 0 ||
        !cold_type_identity_declaration_owner_cid(
            fixture.parent,
            fixture.parent_scalar->
                declaration_origin_row,
            COLD_TYPE_IDENTITY_DECLARATION_KIND_TYPE,
            parent_type_cid) ||
        !cold_type_identity_declaration_owner_cid(
            fixture.local,
            local_scalar->declaration_origin_row,
            COLD_TYPE_IDENTITY_DECLARATION_KIND_TYPE,
            local_type_cid) ||
        memcmp(parent_type_cid,
               local_type_cid, 32) != 0) {
        gate_fail("direct import projection owner CID drifted");
    }

    Span application_type = cold_cstr_span(
        "dep.DirectResult[dep.DirectFixedBytes32]");
    ObjectDef *application = symbols_resolve_object(
        fixture.local, application_type);
    ObjectDef *local_fixed_bytes32 =
        symbols_find_object_local(
            fixture.local,
            cold_cstr_span("dep.DirectFixedBytes32"));
    if (!application || !local_fixed_bytes32 ||
        !local_fixed_bytes32->is_type_scan_import_projection ||
        application->generic_application_type_node < 0 ||
        !fixture.local->type_identity_graph ||
        cold_type_identity_nominal_object_row_readonly(
            fixture.local,
            cold_cstr_span("dep.DirectResult"),
            2) != COLD_TYPE_IDENTITY_NOMINAL_INVALID) {
        gate_fail(
            "qualified generic dependency projection is incomplete");
    }
    int32_t frozen_object_count =
        fixture.local->object_count;
    int32_t frozen_type_count =
        fixture.local->type_count;
    ColdTypeIdentityGraph rebuilt_graph;
    memset(&rebuilt_graph, 0, sizeof(rebuilt_graph));
    rebuilt_graph.symbols = fixture.local;
    int32_t rebuilt_node =
        cold_type_identity_graph_build(
            &rebuilt_graph, application_type,
            NULL, 0,
            COLD_GENERIC_BINDER_NONE,
            -1, 0);
    int32_t canonical_node =
        application->generic_application_type_node;
    if (rebuilt_node < 0 ||
        rebuilt_graph.nodes[rebuilt_node].kind !=
            COLD_TYPE_IDENTITY_APPLY ||
        rebuilt_graph.nodes[rebuilt_node].exact_type_id !=
            cold_type_identity_object_exact_type_id(
                fixture.local,
                symbols_object_index(
                    fixture.local, application)) ||
        memcmp(
            rebuilt_graph.nodes[rebuilt_node].cid,
            fixture.local->type_identity_graph->nodes[
                canonical_node].cid,
            32) != 0 ||
        fixture.local->object_count != frozen_object_count ||
        fixture.local->type_count != frozen_type_count) {
        gate_fail(
            "qualified generic TypeGraph identity is not frozen");
    }
    cold_type_identity_graph_release(&rebuilt_graph);
    puts("isolated_direct_type=exact_owner");
    puts("isolated_direct_base=exact_owner");
    puts("isolated_direct_projection=local_rows");
    puts("isolated_qualified_generic_typegraph=frozen_exact_owner");
    puts("source_identity_root=capture_order_independent");
    puts("source_identity_facts=canonical_order_required");
    puts("source_identity_section=byte_identical");
    puts("source_identity_loader=bad_root_and_truncation_rejected");
    puts("isolated_direct_import_identity_status=pass");
    cold_harness_compilation_end(
        fixture.compilation, false);
    arena_release(fixture.scan_arena);
    arena_release(fixture.arena);
    return 0;
}

static int gate_isolated_direct_binding_mutation(void) {
    DirectImportProjectionFixture fixture;
    gate_direct_import_projection_fixture(&fixture);
    fixture.import_source_rows[0] = 1;
    (void)symbols_find_object(
        fixture.local,
        cold_cstr_span("dep.DirectDerived"));
    gate_fail("direct import source binding mutation was accepted");
    return 1;
}

static int gate_isolated_direct_object_origin_mutation(void) {
    DirectImportProjectionFixture fixture;
    gate_direct_import_projection_fixture(&fixture);
    ObjectDef *local =
        symbols_find_object(
            fixture.local,
            cold_cstr_span("dep.DirectDerived"));
    if (!local)
        gate_fail("direct import object projection is missing");
    local->declaration_origin_row =
        symbols_declaration_origin_intern(
            fixture.local, 1,
            fixture.wrong_type_offset);
    (void)cold_type_scan_materialize_parent_object(
        fixture.local,
        fixture.parent_derived, 0);
    gate_fail("direct import object origin mutation was accepted");
    return 1;
}

static int gate_isolated_direct_type_origin_mutation(void) {
    DirectImportProjectionFixture fixture;
    gate_direct_import_projection_fixture(&fixture);
    TypeDef *local =
        symbols_find_type(
            fixture.local,
            cold_cstr_span("dep.DirectScalar"));
    if (!local)
        gate_fail("direct import type projection is missing");
    local->declaration_origin_row =
        symbols_declaration_origin_intern(
            fixture.local, 1,
            fixture.wrong_type_offset);
    (void)cold_type_scan_materialize_import_type(
        fixture.local,
        cold_cstr_span("dep.DirectScalar"));
    gate_fail("direct import type origin mutation was accepted");
    return 1;
}

static void gate_generic_abi_fixture(
        GenericAbiFixture *fixture) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (fixture->arena == MAP_FAILED)
        gate_fail("generic ABI arena allocation failed");
    memset(fixture->arena, 0, sizeof(Arena));
    fixture->compilation = arena_alloc(
        fixture->arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(
        fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation->symbols;
    gate_generic_source_identity(fixture);
    const char *result_declaration =
        strstr(
            (const char *)fixture->source_rows[0].ptr,
            "type Result");
    if (!result_declaration) {
        gate_fail("generic object declaration identity is missing");
    }
    (void)gate_add_parser_result_at_origin(
        fixture->symbols,
        cold_cstr_span("result.Result"),
        fixture->diagnostic_paths[0],
        0,
        (int32_t)(
            result_declaration -
            (const char *)fixture->source_rows[0].ptr));
    const char *concrete_u_declaration =
        strstr(
            (const char *)fixture->source_rows[0].ptr,
            "type U = object");
    if (!concrete_u_declaration) {
        gate_fail("concrete U declaration identity is missing");
    }
    (void)gate_add_concrete_u(
        fixture->symbols, 0,
        (int32_t)(
            concrete_u_declaration -
            (const char *)fixture->source_rows[0].ptr));
    const char *bytes_declaration =
        strstr(
            (const char *)fixture->source_rows[0].ptr,
            "type Bytes = object");
    if (!bytes_declaration) {
        gate_fail("Bytes declaration identity is missing");
    }
    (void)gate_add_parser_bytes_at_origin(
        fixture->symbols, 0,
        (int32_t)(
            bytes_declaration -
            (const char *)fixture->source_rows[0].ptr),
        fixture->diagnostic_paths[0]);

    const char *first_declaration =
        strstr(
            (const char *)fixture->source_rows[0].ptr,
            "fn GateGenericFormal");
    if (!first_declaration) {
        gate_fail("first generic declaration identity is missing");
    }
    int32_t parameter_kind = SLOT_OBJECT;
    int32_t parameter_size = 8;
    Span parameter_type =
        cold_cstr_span("Result[T]");
    fixture->generic_function_row =
        symbols_add_fn_at_origin(
            fixture->symbols,
            cold_cstr_span("GateGenericFormal"),
            1, &parameter_kind, &parameter_size,
            &parameter_type, parameter_type,
            0,
            (int32_t)(
                first_declaration -
                (const char *)
                    fixture->source_rows[0].ptr));
    symbols_set_fn_param_types(
        fixture->symbols,
        fixture->generic_function_row,
        &parameter_type, 1);
    Span generic_name = cold_cstr_span("T");
    symbols_set_fn_generics(
        fixture->symbols,
        fixture->generic_function_row,
        &generic_name, 1);
    const char *other_declaration =
        strstr(
            (const char *)fixture->source_rows[0].ptr,
            "fn GateGenericOther");
    if (!other_declaration) {
        gate_fail("second generic declaration identity is missing");
    }
    int32_t other_parameter_kind = SLOT_I32;
    int32_t other_parameter_size = 4;
    Span other_type = cold_cstr_span("U");
    fixture->other_generic_function_row =
        symbols_add_fn_at_origin(
            fixture->symbols,
            cold_cstr_span("GateGenericOther"),
            1, &other_parameter_kind,
            &other_parameter_size,
            &other_type, other_type,
            0,
            (int32_t)(
                other_declaration -
                (const char *)fixture->source_rows[0].ptr));
    symbols_set_fn_param_types(
        fixture->symbols,
        fixture->other_generic_function_row,
        &other_type, 1);
    symbols_set_fn_generics(
        fixture->symbols,
        fixture->other_generic_function_row,
        &other_type, 1);
    FnDef *first_function =
        &fixture->symbols->functions[
            fixture->generic_function_row];
    FnDef *second_function =
        &fixture->symbols->functions[
            fixture->other_generic_function_row];
    Span first_generic_names[1] = {
        cold_cstr_span("T")
    };
    Span second_generic_names[1] = {
        cold_cstr_span("U")
    };
    fixture->open_result =
        symbols_resolve_object_in_generic_scope(
            fixture->symbols,
            cold_cstr_span("Result[T]"),
            first_generic_names, 1,
            COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN,
            first_function->declaration_origin_row);
    fixture->concrete_result =
        symbols_resolve_object(
            fixture->symbols,
            cold_cstr_span("Result[U]"));
    fixture->other_open_result =
        symbols_resolve_object_in_generic_scope(
            fixture->symbols,
            cold_cstr_span("Result[U]"),
            second_generic_names, 1,
            COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN,
            second_function->declaration_origin_row);
    if (!fixture->open_result ||
        !fixture->concrete_result ||
        !fixture->other_open_result) {
        gate_fail("generic ABI materialization failed");
    }
    symbols_refine_object_layouts(
        fixture->symbols);
}

static bool gate_type_node_contains_binder(
        const ColdTypeIdentityGraph *graph,
        int32_t node_row, int32_t binder_kind,
        int32_t binder_id) {
    if (!graph || node_row < 0 ||
        node_row >= graph->node_count) {
        return false;
    }
    const ColdTypeIdentityNode *node =
        &graph->nodes[node_row];
    if (node->kind ==
            COLD_TYPE_IDENTITY_GENERIC_BINDER) {
        return node->payload0 == binder_kind &&
               node->payload1 == binder_id;
    }
    for (int32_t child = 0;
         child < node->child_count; child++) {
        int32_t child_row =
            graph->children[
                node->child_start + child];
        if (child_row >= node_row ||
            !gate_type_node_contains_binder(
                graph, child_row,
                binder_kind, binder_id)) {
            continue;
        }
        return true;
    }
    return false;
}

static void gate_require_generic_binder_identity(
        GenericAbiFixture *fixture) {
    if (!fixture || !fixture->symbols ||
        fixture->generic_function_row < 0 ||
        fixture->other_generic_function_row < 0) {
        gate_fail("generic binder fixture is incomplete");
    }
    FnDef *first =
        &fixture->symbols->functions[
            fixture->generic_function_row];
    FnDef *second =
        &fixture->symbols->functions[
            fixture->other_generic_function_row];
    if (first->declaration_origin_row < 0 ||
        second->declaration_origin_row < 0 ||
        first->declaration_origin_row ==
            second->declaration_origin_row) {
        gate_fail("generic binder owners are not exact");
    }
    ColdTypeIdentityGraph graph;
    memset(&graph, 0, sizeof(graph));
    graph.symbols = fixture->symbols;
    Span first_name = cold_cstr_span("T");
    int32_t first_node =
        cold_type_identity_graph_build(
            &graph, first_name, &first_name, 1,
            COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN,
            first->declaration_origin_row, 0);
    Span alpha_name = cold_cstr_span("Alpha");
    int32_t alpha_node =
        cold_type_identity_graph_build(
            &graph, alpha_name, &alpha_name, 1,
            COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN,
            first->declaration_origin_row, 0);
    Span second_name = cold_cstr_span("U");
    int32_t second_node =
        cold_type_identity_graph_build(
            &graph, second_name, &second_name, 1,
            COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN,
            second->declaration_origin_row, 0);
    if (first_node < 0 ||
        alpha_node != first_node ||
        second_node < 0 ||
        second_node == first_node ||
        memcmp(
            graph.nodes[first_node].cid,
            graph.nodes[second_node].cid,
            32) == 0) {
        gate_fail("generic binder alpha/owner identity drifted");
    }
    if (cold_type_identity_graph_build(
            &graph, first_name, &first_name, 1,
            COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN,
            fixture->symbols->declaration_origin_count,
            0) >= 0) {
        gate_fail("missing generic binder owner was accepted");
    }
    struct {
        const char *type;
        int32_t kind;
    } nested[] = {
        {"T[]", COLD_TYPE_IDENTITY_SEQUENCE},
        {"T[3]", COLD_TYPE_IDENTITY_FIXED_ARRAY},
        {"Result[T]", COLD_TYPE_IDENTITY_APPLY},
        {"fn (value: T): T",
         COLD_TYPE_IDENTITY_FUNCTION},
    };
    for (size_t index = 0;
         index < sizeof(nested) / sizeof(nested[0]);
         index++) {
        int32_t node =
            cold_type_identity_graph_build(
                &graph,
                cold_cstr_span(nested[index].type),
                &first_name, 1,
                COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN,
                first->declaration_origin_row, 0);
        int32_t expected_binder_kind =
            strcmp(nested[index].type, "Result[T]") == 0
                ? COLD_GENERIC_BINDER_OBJECT_ROW
                : COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN;
        int32_t expected_binder_id =
            strcmp(nested[index].type, "Result[T]") == 0
                ? fixture->open_result->
                      generic_application_template_object_row
                : first->declaration_origin_row;
        if (node < 0 ||
            graph.nodes[node].kind !=
                nested[index].kind ||
            !gate_type_node_contains_binder(
                &graph, node,
                expected_binder_kind,
                expected_binder_id)) {
            gate_fail("nested generic binder identity was lost");
        }
        if (strcmp(nested[index].type, "Result[T]") == 0) {
            int32_t open_row =
                symbols_object_index(
                    fixture->symbols,
                    fixture->open_result);
            int32_t concrete_row =
                symbols_object_index(
                    fixture->symbols,
                    fixture->concrete_result);
            if (open_row < 0 || concrete_row < 0 ||
                graph.nodes[node].exact_type_id !=
                    cold_type_identity_object_exact_type_id(
                        fixture->symbols, open_row) ||
                graph.nodes[node].exact_type_id ==
                    cold_type_identity_object_exact_type_id(
                        fixture->symbols, concrete_row)) {
                gate_fail(
                    "generic application TypeGraph selected "
                    "the wrong same-text object row");
            }
        }
    }
    Span same_text = cold_cstr_span("Result[U]");
    int32_t closed_same_text_node =
        cold_type_identity_graph_build(
            &graph, same_text, NULL, 0,
            COLD_GENERIC_BINDER_NONE,
            -1, 0);
    int32_t open_same_text_node =
        cold_type_identity_graph_build(
            &graph, same_text,
            &second_name, 1,
            COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN,
            second->declaration_origin_row, 0);
    int32_t closed_same_text_row =
        symbols_object_index(
            fixture->symbols,
            fixture->concrete_result);
    int32_t open_same_text_row =
        symbols_object_index(
            fixture->symbols,
            fixture->other_open_result);
    if (closed_same_text_node < 0 ||
        open_same_text_node < 0 ||
        closed_same_text_node ==
            open_same_text_node ||
        closed_same_text_row < 0 ||
        open_same_text_row < 0 ||
        closed_same_text_row ==
            open_same_text_row ||
        graph.nodes[
            closed_same_text_node].kind !=
                COLD_TYPE_IDENTITY_APPLY ||
        graph.nodes[
            open_same_text_node].kind !=
                COLD_TYPE_IDENTITY_APPLY ||
        graph.nodes[
            closed_same_text_node].exact_type_id !=
                cold_type_identity_object_exact_type_id(
                    fixture->symbols,
                    closed_same_text_row) ||
        graph.nodes[
            open_same_text_node].exact_type_id !=
                cold_type_identity_object_exact_type_id(
                    fixture->symbols,
                    open_same_text_row) ||
        memcmp(
            graph.nodes[
                closed_same_text_node].cid,
            graph.nodes[
                open_same_text_node].cid,
            32) == 0) {
        gate_fail(
            "same-text closed/open generic application "
            "identity collapsed");
    }
}

static void gate_require_generic_application_alias_identity(
        GenericAbiFixture *fixture) {
    if (!fixture || !fixture->symbols) {
        gate_fail(
            "generic application alias fixture is incomplete");
    }
    ObjectDef *bare =
        symbols_resolve_object(
            fixture->symbols,
            cold_cstr_span("Result[Bytes]"));
    int32_t object_count_after_bare =
        fixture->symbols->object_count;
    ObjectDef *qualified =
        symbols_resolve_object(
            fixture->symbols,
            cold_cstr_span(
                "Result[rawbytes.Bytes]"));
    int32_t bare_row =
        symbols_object_index(
            fixture->symbols, bare);
    int32_t qualified_row =
        symbols_object_index(
            fixture->symbols, qualified);
    int32_t bare_type_id =
        cold_exact_object_definition_type_id(
            fixture->symbols, bare,
            SLOT_OBJECT);
    int32_t qualified_type_id =
        cold_exact_object_definition_type_id(
            fixture->symbols, qualified,
            SLOT_OBJECT);
    if (!bare || !qualified ||
        bare != qualified ||
        fixture->symbols->object_count !=
            object_count_after_bare ||
        bare_row < 0 ||
        qualified_row != bare_row ||
        bare_type_id < 0 ||
        qualified_type_id != bare_type_id ||
        cold_canonical_object_identity(
            fixture->symbols, bare_row) !=
            cold_canonical_object_identity(
                fixture->symbols,
                qualified_row)) {
        gate_fail(
            "same declaration generic arguments split "
            "application identity");
    }
    if (!cold_result_layout_exact_identity_matches(
            fixture->symbols, bare,
            cold_cstr_span("Result[Bytes]")) ||
        !cold_result_layout_exact_identity_matches(
            fixture->symbols, bare,
            cold_cstr_span(
                "Result[rawbytes.Bytes]"))) {
        gate_fail(
            "same declaration Result layout aliases split "
            "exact TypeNode identity");
    }

    ColdTypeIdentityGraph graph;
    memset(&graph, 0, sizeof(graph));
    graph.symbols = fixture->symbols;
    int32_t bare_node =
        cold_type_identity_graph_build(
            &graph,
            cold_cstr_span("Result[Bytes]"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE,
            -1, 0);
    int32_t qualified_node =
        cold_type_identity_graph_build(
            &graph,
            cold_cstr_span(
                "Result[rawbytes.Bytes]"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE,
            -1, 0);
    if (bare_node < 0 ||
        qualified_node != bare_node ||
        graph.nodes[bare_node].exact_type_id !=
            bare_type_id ||
        memcmp(
            graph.nodes[bare_node].cid,
            graph.nodes[qualified_node].cid,
            32) != 0) {
        gate_fail(
            "same declaration generic arguments split "
            "TypeNode identity");
    }

    const char *forged_declaration =
        strstr(
            (const char *)
                fixture->source_rows[0].ptr,
            "type ForgedBytes");
    if (!forged_declaration) {
        gate_fail(
            "forged Bytes declaration identity is missing");
    }
    ObjectDef *forged =
        symbols_add_object_at_origin(
            fixture->symbols,
            cold_cstr_span("forged.Bytes"), 2,
            0,
            (int32_t)(
                forged_declaration -
                (const char *)
                    fixture->source_rows[0].ptr));
    forged->fields[0].name =
        cold_cstr_span("data");
    forged->fields[0].type_name =
        cold_cstr_span("ptr");
    forged->fields[0].kind = SLOT_PTR;
    forged->fields[0].size = 8;
    forged->fields[1].name =
        cold_cstr_span("len");
    forged->fields[1].type_name =
        cold_cstr_span("int32");
    forged->fields[1].kind = SLOT_I32;
    forged->fields[1].size = 4;
    forged->is_parser_declaration = true;
    forged->decl_path =
        fixture->diagnostic_paths[0];
    object_finalize_fields(forged);
    ObjectDef *forged_application =
        symbols_resolve_object(
            fixture->symbols,
            cold_cstr_span(
                "Result[forged.Bytes]"));
    int32_t forged_row =
        symbols_object_index(
            fixture->symbols,
            forged_application);
    int32_t forged_type_id =
        cold_exact_object_definition_type_id(
            fixture->symbols,
            forged_application,
            SLOT_OBJECT);
    if (!forged_application ||
        forged_application == bare ||
        forged_row < 0 ||
        forged_type_id < 0 ||
        forged_type_id == bare_type_id ||
        cold_canonical_object_identity(
            fixture->symbols,
            forged_row) ==
            cold_canonical_object_identity(
                fixture->symbols,
                bare_row)) {
        gate_fail(
            "same-layout forged generic argument "
            "collapsed nominal identity");
    }
    if (!cold_result_layout_exact_identity_matches(
            fixture->symbols, forged_application,
            cold_cstr_span("Result[forged.Bytes]")) ||
        cold_result_layout_exact_identity_matches(
            fixture->symbols, bare,
            cold_cstr_span("Result[forged.Bytes]"))) {
        gate_fail(
            "Result layout exact TypeNode gate accepted "
            "a forged nominal argument");
    }
    cold_type_identity_graph_release(&graph);
}

static void gate_require_generic_binder_row_independence(
        GenericAbiFixture *fixture) {
    FnDef *first =
        &fixture->symbols->functions[
            fixture->generic_function_row];
    Span generic_name = cold_cstr_span("T");
    ColdTypeIdentityGraph first_graph;
    memset(&first_graph, 0, sizeof(first_graph));
    first_graph.symbols = fixture->symbols;
    int32_t first_node =
        cold_type_identity_graph_build(
            &first_graph, generic_name,
            &generic_name, 1,
            COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN,
            first->declaration_origin_row, 0);
    if (first_node < 0)
        gate_fail("first stable binder CID build failed");

    Symbols *alternate_symbols =
        cold_harness_compilation_new_symbols(
            fixture->compilation);
    const char *source =
        (const char *)fixture->source_rows[0].ptr;
    const char *other = strstr(
        source, "fn GateGenericOther");
    const char *concrete_u = strstr(
        source, "type U = object");
    const char *bytes = strstr(
        source, "type Bytes = object");
    const char *type = strstr(
        source, "type Result");
    if (!other || !concrete_u || !bytes || !type)
        gate_fail("alternate declaration offsets missing");
    (void)symbols_declaration_origin_intern(
        alternate_symbols, 0,
        (int32_t)(type - source));
    (void)symbols_declaration_origin_intern(
        alternate_symbols, 0,
        (int32_t)(other - source));
    (void)symbols_declaration_origin_intern(
        alternate_symbols, 0,
        (int32_t)(concrete_u - source));
    (void)symbols_declaration_origin_intern(
        alternate_symbols, 0,
        (int32_t)(bytes - source));
    int32_t parameter_kind = SLOT_I32;
    int32_t parameter_size = 4;
    int32_t alternate_function =
        symbols_add_fn_at_origin(
            alternate_symbols,
            cold_cstr_span("GateGenericFormal"),
            1, &parameter_kind, &parameter_size,
            &generic_name, generic_name,
            0, 0);
    symbols_set_fn_param_types(
        alternate_symbols,
        alternate_function,
        &generic_name, 1);
    symbols_set_fn_generics(
        alternate_symbols,
        alternate_function,
        &generic_name, 1);
    FnDef *alternate =
        &alternate_symbols->functions[
            alternate_function];
    if (alternate->declaration_origin_row ==
            first->declaration_origin_row) {
        gate_fail("alternate binder row was not reordered");
    }
    ColdTypeIdentityGraph alternate_graph;
    memset(&alternate_graph, 0,
           sizeof(alternate_graph));
    alternate_graph.symbols = alternate_symbols;
    int32_t alternate_node =
        cold_type_identity_graph_build(
            &alternate_graph, generic_name,
            &generic_name, 1,
            COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN,
            alternate->declaration_origin_row, 0);
    if (alternate_node < 0 ||
        memcmp(
            first_graph.nodes[first_node].cid,
            alternate_graph.nodes[
                alternate_node].cid,
            32) != 0) {
        gate_fail("binder CID depends on facts-local origin row");
    }

    ColdTypeIdentityGraph apply_a;
    ColdTypeIdentityGraph apply_b;
    memset(&apply_a, 0, sizeof(apply_a));
    memset(&apply_b, 0, sizeof(apply_b));
    apply_a.symbols = fixture->symbols;
    apply_b.symbols = fixture->symbols;
    int32_t base_a =
        cold_type_identity_graph_build(
            &apply_a, cold_cstr_span("int32"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t arg_a =
        cold_type_identity_graph_build(
            &apply_a, cold_cstr_span("int64"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t base_b =
        cold_type_identity_graph_build(
            &apply_b, cold_cstr_span("int32"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t arg_b =
        cold_type_identity_graph_build(
            &apply_b, cold_cstr_span("int64"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t children_a[2] = {base_a, arg_a};
    int32_t children_b[2] = {base_b, arg_b};
    int32_t projected_a =
        cold_type_identity_graph_intern(
            &apply_a,
            COLD_TYPE_IDENTITY_APPLY,
            1, 0, 17, children_a, 2);
    int32_t projected_b =
        cold_type_identity_graph_intern(
            &apply_b,
            COLD_TYPE_IDENTITY_APPLY,
            1, 0, 29, children_b, 2);
    if (projected_a < 0 || projected_b < 0 ||
        memcmp(
            apply_a.nodes[projected_a].cid,
            apply_b.nodes[projected_b].cid,
            32) != 0 ||
        cold_type_identity_graph_intern(
            &apply_a,
            COLD_TYPE_IDENTITY_APPLY,
            1, 0, 29, children_a, 2) >= 0) {
        gate_fail("Apply CID includes or admits conflicting local TypeId");
    }
}

static void gate_require_generic_abi(
        GenericAbiFixture *fixture) {
    Span *open_names = NULL;
    int32_t open_count = 0;
    int32_t open_binder_kind =
        COLD_GENERIC_BINDER_NONE;
    int32_t open_binder_id = -1;
    bool open_application = false;
    int32_t open_template_row =
        fixture && fixture->open_result
            ? fixture->open_result->
                  generic_application_template_object_row
            : -1;
    if (!fixture || !fixture->open_result ||
        fixture->open_result->field_count != 1 ||
        fixture->open_result->fields[0].kind !=
            SLOT_I32 ||
        fixture->open_result->fields[0].size != 4 ||
        !cold_object_generic_scope_readonly(
            fixture->symbols,
            symbols_object_index(
                fixture->symbols,
            fixture->open_result),
            &open_names, &open_count,
            &open_binder_kind,
            &open_binder_id,
            &open_application) ||
        !open_application ||
        open_count != 1 ||
        open_binder_kind !=
            COLD_GENERIC_BINDER_OBJECT_ROW ||
        open_binder_id != open_template_row ||
        !span_eq(open_names[0], "T")) {
        gate_fail("open generic Result ABI is not exact");
    }
    if (fixture->generic_function_row < 0 ||
        fixture->generic_function_row >=
            fixture->symbols->function_count ||
        fixture->symbols->functions[
            fixture->generic_function_row].
                param_exact_type_id[0] !=
            SLOT_OBJECT * 1048576 +
                symbols_object_index(
                    fixture->symbols,
                    fixture->open_result) + 1 ||
        fixture->symbols->functions[
            fixture->generic_function_row].
                return_exact_type_id !=
            SLOT_OBJECT * 1048576 +
                symbols_object_index(
                    fixture->symbols,
                    fixture->open_result) + 1) {
        gate_fail("generic formal TypeId publication is not exact");
    }

    Span *concrete_names = NULL;
    int32_t concrete_count = 0;
    int32_t concrete_binder_kind =
        COLD_GENERIC_BINDER_NONE;
    int32_t concrete_binder_id = -1;
    bool concrete_open = true;
    if (!fixture->concrete_result ||
        fixture->concrete_result->field_count != 1 ||
        fixture->concrete_result->fields[0].kind !=
            SLOT_OBJECT ||
        fixture->concrete_result->fields[0].size != 8 ||
        !cold_object_generic_scope_readonly(
            fixture->symbols,
            symbols_object_index(
                fixture->symbols,
            fixture->concrete_result),
            &concrete_names, &concrete_count,
            &concrete_binder_kind,
            &concrete_binder_id,
            &concrete_open) ||
        concrete_open ||
        concrete_count != 0 ||
        concrete_binder_kind !=
            COLD_GENERIC_BINDER_NONE ||
        concrete_binder_id != -1) {
        gate_fail("concrete one-letter type was guessed generic");
    }

    Span *other_open_names = NULL;
    int32_t other_open_count = 0;
    int32_t other_open_binder_kind =
        COLD_GENERIC_BINDER_NONE;
    int32_t other_open_binder_id = -1;
    bool other_open = false;
    int32_t second_origin =
        fixture->symbols->functions[
            fixture->other_generic_function_row].
            declaration_origin_row;
    int32_t concrete_row =
        symbols_object_index(
            fixture->symbols,
            fixture->concrete_result);
    int32_t other_open_row =
        symbols_object_index(
            fixture->symbols,
            fixture->other_open_result);
    if (!fixture->other_open_result ||
        fixture->other_open_result ==
            fixture->concrete_result ||
        concrete_row < 0 ||
        other_open_row < 0 ||
        cold_canonical_object_identity(
            fixture->symbols,
            concrete_row) ==
            cold_canonical_object_identity(
                fixture->symbols,
                other_open_row) ||
        !span_same(
            fixture->other_open_result->name,
            fixture->concrete_result->name) ||
        fixture->other_open_result->field_count != 1 ||
        fixture->other_open_result->fields[0].kind !=
            SLOT_I32 ||
        fixture->other_open_result->fields[0].size != 4 ||
        !cold_object_generic_scope_readonly(
            fixture->symbols,
            symbols_object_index(
                fixture->symbols,
                fixture->other_open_result),
            &other_open_names, &other_open_count,
            &other_open_binder_kind,
            &other_open_binder_id,
            &other_open) ||
        !other_open ||
        other_open_count != 1 ||
        other_open_binder_kind !=
            COLD_GENERIC_BINDER_FUNCTION_DECLARATION_ORIGIN ||
        other_open_binder_id != second_origin ||
        !span_eq(other_open_names[0], "U")) {
        fprintf(
            stderr,
            "same_text_debug rows=%d/%d canonical=%d/%d "
            "same_ptr=%d same_name=%d fields=%d/%d "
            "kinds=%d/%d sizes=%d/%d open=%d count=%d "
            "binder=%d/%d expected=%d\n",
            concrete_row, other_open_row,
            concrete_row >= 0
                ? cold_canonical_object_identity(
                      fixture->symbols,
                      concrete_row)
                : -1,
            other_open_row >= 0
                ? cold_canonical_object_identity(
                      fixture->symbols,
                      other_open_row)
                : -1,
            fixture->other_open_result ==
                    fixture->concrete_result
                ? 1 : 0,
            span_same(
                fixture->other_open_result->name,
                fixture->concrete_result->name)
                ? 1 : 0,
            fixture->concrete_result->field_count,
            fixture->other_open_result->field_count,
            fixture->concrete_result->fields[0].kind,
            fixture->other_open_result->fields[0].kind,
            fixture->concrete_result->fields[0].size,
            fixture->other_open_result->fields[0].size,
            other_open ? 1 : 0,
            other_open_count,
            other_open_binder_kind,
            other_open_binder_id,
            second_origin);
        gate_fail("same-text generic and concrete identities collapsed");
    }

    int32_t concrete_kind = SLOT_OBJECT;
    int32_t concrete_size =
        symbols_object_slot_size(
            fixture->concrete_result);
    int32_t open_kind = SLOT_OBJECT;
    int32_t open_size =
        symbols_object_slot_size(
            fixture->other_open_result);
    Span same_text_type =
        cold_cstr_span("Result[U]");
    int32_t concrete_helper =
        symbols_add_fn(
            fixture->symbols,
            cold_cstr_span(
                "<gate-drop-concrete>"),
            1, &concrete_kind, &concrete_size,
            &same_text_type,
            cold_cstr_span("void"));
    int32_t open_helper =
        symbols_add_fn(
            fixture->symbols,
            cold_cstr_span(
                "<gate-drop-open>"),
            1, &open_kind, &open_size,
            &same_text_type,
            cold_cstr_span("void"));
    if (concrete_helper < 0 ||
        open_helper < 0) {
        gate_fail(
            "drop helper formal fixture registration failed");
    }
    cold_publish_exact_object_formal_type_id(
        fixture->symbols,
        concrete_helper, 0,
        fixture->concrete_result);
    cold_publish_exact_object_formal_type_id(
        fixture->symbols,
        open_helper, 0,
        fixture->other_open_result);
    int32_t concrete_exact =
        cold_exact_object_definition_type_id(
            fixture->symbols,
            fixture->concrete_result,
            SLOT_OBJECT);
    int32_t open_exact =
        cold_exact_object_definition_type_id(
            fixture->symbols,
            fixture->other_open_result,
            SLOT_OBJECT);
    if (concrete_exact < 0 ||
        open_exact < 0 ||
        concrete_exact == open_exact ||
        fixture->symbols->functions[
            concrete_helper].
            param_exact_type_id[0] !=
            concrete_exact ||
        fixture->symbols->functions[
            open_helper].
            param_exact_type_id[0] !=
            open_exact ||
        fixture->symbols->functions[
            concrete_helper].
            param_exact_object_is_ref[0] != 0 ||
        fixture->symbols->functions[
            open_helper].
            param_exact_object_is_ref[0] != 0) {
        gate_fail(
            "drop helper formal lost exact ObjectDef identity");
    }

    BodyIR *concrete_body =
        body_new(fixture->arena);
    concrete_body->producer_function_row =
        concrete_helper;
    concrete_body->param_count = 1;
    int32_t concrete_param = body_slot(
        concrete_body, concrete_kind,
        concrete_size);
    body_slot_set_type(
        concrete_body, concrete_param,
        same_text_type);
    concrete_body->param_slot[0] =
        concrete_param;
    int32_t concrete_bound_exact = -1;
    int32_t concrete_bound_ref = -1;
    int32_t concrete_storage =
        cold_frozen_formal_storage_for_param(
            concrete_body, fixture->symbols,
            concrete_param, concrete_kind, 0,
            &concrete_bound_exact,
            &concrete_bound_ref);
    BodyIR *open_body =
        body_new(fixture->arena);
    open_body->producer_function_row =
        open_helper;
    open_body->param_count = 1;
    int32_t open_param = body_slot(
        open_body, open_kind, open_size);
    body_slot_set_type(
        open_body, open_param,
        same_text_type);
    open_body->param_slot[0] = open_param;
    int32_t open_bound_exact = -1;
    int32_t open_bound_ref = -1;
    int32_t open_storage =
        cold_frozen_formal_storage_for_param(
            open_body, fixture->symbols,
            open_param, open_kind, 0,
            &open_bound_exact, &open_bound_ref);
    if (concrete_bound_exact !=
            concrete_exact ||
        concrete_bound_ref != 0 ||
        concrete_storage ==
            COLD_MANAGED_STORAGE_UNKNOWN ||
        open_bound_exact != open_exact ||
        open_bound_ref != 0 ||
        open_storage !=
            COLD_MANAGED_STORAGE_UNKNOWN) {
        gate_fail(
            "parameter binding reconstructed same-text ObjectDef identity");
    }
}

static ColdExprResult gate_emit_loop_local(
        GateFixture *fixture, ObjectDef *object) {
    BodyIR *body = fixture->body;
    int32_t left = cold_make_i32_const_slot(body, 0);
    int32_t right = cold_make_i32_const_slot(body, 0);
    int32_t payload_start = body->call_arg_count;
    body_call_arg_with_offset(
        body, left, object->fields[0].offset);
    body_call_arg_with_offset(
        body, right, object->fields[1].offset);

    int32_t staging = body_slot(
        body, SLOT_OBJECT,
        symbols_object_slot_size(object));
    body_slot_set_type(body, staging, object->name);
    int32_t staging_definition = body_op3(
        body, BODY_OP_MAKE_COMPOSITE,
        staging, 0, payload_start, object->field_count);
    ColdExprResult source;
    cold_publish_owned_managed_producer(
        body, fixture->symbols,
        staging, SLOT_OBJECT,
        staging_definition, &source);
    return cold_emit_exact_default_local_definition(
        &fixture->parser, body, &source);
}

static int32_t gate_emit_borrow_projection(
        GateFixture *fixture,
        const ColdExprResult *source) {
    BodyIR *body = fixture->body;
    int32_t slot = body_slot(
        body, SLOT_OBJECT,
        body->slot_size[source->slot]);
    body_slot_set_type(
        body, slot, body->slot_type[source->slot]);
    int32_t projection = body_op(
        body, BODY_OP_COPY_COMPOSITE,
        slot, source->slot, 0);
    cold_publish_exact_managed_read(
        body, projection,
        COLD_EXACT_READ_OPERAND_A, source);
    body->op_value_def_slot[projection] = slot;
    body->op_value_def_exact_type_id[projection] =
        source->exact_type_id;
    body->op_value_def_producer_function_row[projection] =
        body->producer_function_row;
    body->op_value_def_place_kind[projection] =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->op_value_def_ownership[projection] =
        COLD_EXPR_OWN_BORROW_SHARED;
    body->op_value_def_origin_id[projection] =
        source->value_def_op_id;
    body->slot_exact_type_id[slot] = source->exact_type_id;
    body->slot_place_kind[slot] =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->slot_origin_id[slot] = source->value_def_op_id;
    body->slot_managed_storage_kind[slot] =
        COLD_MANAGED_STORAGE_PLAIN;
    return projection;
}

static void gate_fixture(GateFixture *fixture) {
    memset(fixture, 0, sizeof(*fixture));
    fixture->arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (fixture->arena == MAP_FAILED)
        gate_fail("arena allocation failed");
    memset(fixture->arena, 0, sizeof(Arena));
    fixture->compilation = arena_alloc(
        fixture->arena, sizeof(ColdHarnessCompilation));
    cold_harness_compilation_begin(
        fixture->compilation, fixture->arena);
    fixture->symbols = fixture->compilation->symbols;
    ObjectDef *object = gate_add_plain_pair(fixture->symbols);
    int32_t function = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("GateLoopPlainScope"),
        0, 0, 0, 0, cold_cstr_span("int32"));
    if (function < 0)
        gate_fail("function registration failed");
    fixture->symbols->functions[
        function].result_ownership_summary =
            COLD_RESULT_OWNERSHIP_OWNED;

    fixture->body = body_new(fixture->arena);
    fixture->body->producer_function_row = function;
    fixture->body->debug_name =
        cold_cstr_span("GateLoopPlainScope");
    fixture->parser = cold_parser_issue_legacy_span(
        fixture->symbols,
        cold_cstr_span("loop-local-plain-scope"));

    int32_t entry = body_block(fixture->body);
    int32_t header = body_block(fixture->body);
    fixture->loop_block = body_block(fixture->body);
    int32_t exit = body_block(fixture->body);

    body_reopen_block(fixture->body, entry);
    body_branch_to(fixture->body, entry, header);

    body_reopen_block(fixture->body, header);
    int32_t predicate =
        cold_make_i32_const_slot(fixture->body, 1);
    int32_t zero =
        cold_make_i32_const_slot(fixture->body, 0);
    int32_t condition = body_term(
        fixture->body, BODY_TERM_CBR,
        predicate, COND_NE, zero,
        fixture->loop_block, exit);
    body_end_block(fixture->body, header, condition);

    body_reopen_block(fixture->body, fixture->loop_block);
    ColdExprResult local =
        gate_emit_loop_local(fixture, object);
    fixture->local.name =
        cold_cstr_span("expectedProofCid");
    fixture->local.kind = SLOT_OBJECT;
    fixture->local.slot = local.slot;
    fixture->local.is_mutable_place = true;
    fixture->local.value_def_op_id =
        local.value_def_op_id;
    fixture->definition = local.value_def_op_id;
    fixture->projection =
        gate_emit_borrow_projection(fixture, &local);
    if (!cold_emit_exact_plain_scope_end(
            &fixture->parser, fixture->body,
            &fixture->local, fixture->definition)) {
        gate_fail("production scope closer rejected plain storage");
    }
    fixture->scope_end = fixture->body->op_count - 1;
    body_branch_to(
        fixture->body, fixture->loop_block, header);

    body_reopen_block(fixture->body, exit);
    int32_t result =
        cold_make_i32_const_slot(fixture->body, 0);
    int32_t terminal = body_term(
        fixture->body, BODY_TERM_RET,
        result, 0, 0, -1, -1);
    body_end_block(fixture->body, exit, terminal);
}

static void gate_require_nested_fmt_source_map(void) {
    Arena *arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (arena == MAP_FAILED)
        gate_fail("nested Fmt arena allocation failed");
    memset(arena, 0, sizeof(Arena));
    Span source = cold_cstr_span(
        "Fmt\"outer={Fmt\\\"inner={name}\\\"}\"");
    Parser parser = cold_parser_issue_lexical_span(arena, source);
    Span content = span_sub(source, 4, source.len - 1);
    int32_t expression_start = -1;
    for (int32_t i = 0; i < content.len; i++) {
        if (content.ptr[i] == '{') {
            expression_start = i + 1;
            break;
        }
    }
    if (expression_start <= 0)
        gate_fail("nested Fmt expression start missing");
    int32_t close_offset = -1;
    int32_t *origin_offsets = 0;
    Span decoded = cold_fmt_decode_interpolation(
        &parser, content, expression_start, true,
        &close_offset, &origin_offsets);
    if (!span_eq(decoded, "Fmt\"inner={name}\"") ||
        close_offset <= expression_start || !origin_offsets)
        gate_fail("nested Fmt decoded expression mismatch");
    Parser child = parser_child(&parser, decoded);
    child.source_origin = source;
    child.source_origin_offsets = origin_offsets;
    Span raw_expression = cold_parser_origin_span(
        &child, decoded);
    Span expected_raw = span_sub(
        source,
        4 + expression_start,
        4 + close_offset);
    if (raw_expression.ptr != expected_raw.ptr ||
        raw_expression.len != expected_raw.len ||
        !span_eq(raw_expression, "Fmt\\\"inner={name}\\\""))
        gate_fail("nested Fmt original source span mismatch");

    Span escaped_close_content = cold_cstr_span("value\\}}");
    Parser escaped_close_parser = cold_parser_issue_lexical_span(
        arena, escaped_close_content);
    int32_t escaped_close_offset = -1;
    int32_t *escaped_close_origins = 0;
    Span escaped_close_decoded = cold_fmt_decode_interpolation(
        &escaped_close_parser,
        escaped_close_content,
        0,
        true,
        &escaped_close_offset,
        &escaped_close_origins);
    if (!span_eq(escaped_close_decoded, "value}") ||
        escaped_close_offset != escaped_close_content.len - 1 ||
        !escaped_close_origins)
        gate_fail("escaped Fmt close terminated interpolation");
    puts("nested_fmt_source_map=exact");
    arena_release(arena);
}

static int gate_positive(void) {
    gate_require_nested_fmt_source_map();
    GateFixture fixture;
    gate_fixture(&fixture);
    GateIdentitySource identity;
    gate_identity_source_attach(
        &fixture, &identity);
    int32_t gate_op_offset =
        gate_identity_declaration_offset(
            identity.source_rows[0],
            "type GateOp");
    int32_t gate_fetcher_offset =
        gate_identity_declaration_offset(
            identity.source_rows[0],
            "type GateFetcher");
    int32_t result_offset =
        gate_identity_declaration_offset(
            identity.source_rows[0],
            "type Result");
    int32_t bytes_offset =
        gate_identity_declaration_offset(
            identity.source_rows[0],
            "type Bytes");
    int32_t other_result_offset =
        gate_identity_declaration_offset(
            identity.source_rows[0],
            "type OtherResult");
    TypeDef *gate_op =
        symbols_add_type_at_origin(
            fixture.symbols,
            cold_cstr_span("gate.GateOp"), 0,
            0, gate_op_offset);
    gate_op->is_enum = true;
    TypeDef *gate_op_alias =
        symbols_add_type_at_origin(
            fixture.symbols,
            cold_cstr_span("gate.GateOpAlias"), 0,
            0, gate_op_offset);
    gate_op_alias->is_enum = true;
    (void)gate_add_parser_result_at_origin(
        fixture.symbols,
        cold_cstr_span("result.Result"),
        cold_cstr_span("/gate/std/result.cheng"),
        0, result_offset);
    (void)gate_add_parser_result_at_origin(
        fixture.symbols,
        cold_cstr_span("resalias.Result"),
        cold_cstr_span("/gate/std/result.cheng"),
        0, result_offset);
    (void)gate_add_parser_bytes_at_origin(
        fixture.symbols, 0, bytes_offset,
        cold_cstr_span("/gate/identity.cheng"));
    Span function_source =
        cold_cstr_span(
            "fn (op: GateOp, bytes: int64): Result[Bytes]");
    TypeDef *gate_fetcher =
        symbols_add_type_at_origin(
            fixture.symbols,
            cold_cstr_span("gate.GateFetcher"), 0,
            0, gate_fetcher_offset);
    TypeDef *gate_fetcher_alias =
        symbols_add_type_at_origin(
            fixture.symbols,
            cold_cstr_span("gate.GateFetcherAlias"), 0,
            0, gate_fetcher_offset);
    ObjectDef *source_less =
        symbols_add_object(
            fixture.symbols,
            cold_cstr_span("gate.SourceLess"), 0);
    object_finalize_fields(source_less);
    Span function_type =
        cold_scope_import_type_symbols(
            fixture.symbols,
            cold_cstr_span("gate"),
            function_source, NULL, 0);
    symbols_set_type_alias(
        gate_fetcher, function_type);
    symbols_set_type_alias(
        gate_fetcher_alias, function_type);
    Span qualified_function_type =
        cold_qualify_import_type(
            fixture.symbols,
            cold_cstr_span("gate"),
            function_source);
    Parser scoped_parser = fixture.parser;
    scoped_parser.import_mode = true;
    scoped_parser.import_alias =
        cold_cstr_span("gate");
    Span parser_function_type =
        parser_scope_type(
            &scoped_parser, function_source);
    int32_t object_count_before_type_graph =
        fixture.symbols->object_count;
    int32_t result_template_row =
        symbols_object_index(
            fixture.symbols,
            symbols_find_object(
                fixture.symbols,
                cold_cstr_span("result.Result")));
    if (result_template_row < 0 ||
        symbols_find_object(
            fixture.symbols,
            cold_cstr_span("Result")) ||
        symbols_find_object(
            fixture.symbols,
            cold_cstr_span("Result[Bytes]"))) {
        gate_fail("read-only nominal fixture is invalid");
    }
    uint8_t state = 0;
    ColdTypeIdentityGraph type_graph;
    memset(&type_graph, 0, sizeof(type_graph));
    type_graph.symbols = fixture.symbols;
    int32_t pointer_node =
        cold_type_identity_graph_build(
            &type_graph, cold_cstr_span("uint8 *"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t function_node =
        cold_type_identity_graph_build(
            &type_graph, function_type,
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t result_node =
        cold_type_identity_graph_build(
            &type_graph,
            cold_cstr_span("Result[Bytes]"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t result_owner_node =
        cold_type_identity_graph_build(
            &type_graph,
            cold_cstr_span("result.Result"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t result_alias_owner_node =
        cold_type_identity_graph_build(
            &type_graph,
            cold_cstr_span("resalias.Result"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t gate_op_node =
        cold_type_identity_graph_build(
            &type_graph,
            cold_cstr_span("gate.GateOp"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t gate_op_alias_node =
        cold_type_identity_graph_build(
            &type_graph,
            cold_cstr_span("gate.GateOpAlias"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t gate_fetcher_node =
        cold_type_identity_graph_build(
            &type_graph,
            cold_cstr_span("gate.GateFetcher"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t gate_fetcher_alias_node =
        cold_type_identity_graph_build(
            &type_graph,
            cold_cstr_span("gate.GateFetcherAlias"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    int32_t source_less_node =
        cold_type_identity_graph_build(
            &type_graph,
            cold_cstr_span("gate.SourceLess"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    if (fixture.body->op_value_def_ownership[
            fixture.definition] != COLD_EXPR_OWN_PLAIN ||
        fixture.body->slot_managed_storage_kind[
            fixture.local.slot] !=
                COLD_MANAGED_STORAGE_PLAIN ||
        fixture.body->op_value_def_origin_id[
            fixture.projection] != fixture.definition ||
        fixture.body->op_value_def_consume_op_index_plus_one[
            fixture.definition] != fixture.scope_end + 1 ||
        !cold_exact_plain_scope_end_tuple_valid(
            fixture.body, fixture.symbols,
            fixture.scope_end) ||
        !cold_exact_definition_consumption_dataflow_valid(
            fixture.body, fixture.definition) ||
        !cold_exact_definition_consumption_dataflow(
            fixture.body, fixture.definition,
            fixture.loop_block, &state) ||
        state != COLD_VALUE_CONSUMED ||
        !cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "loop-local-plain-scope-gate", false) ||
        pointer_node < 0 ||
        type_graph.nodes[pointer_node].kind !=
            COLD_TYPE_IDENTITY_RAW_POINTER ||
        type_graph.nodes[pointer_node].child_count != 1 ||
        !span_eq(
            function_type,
            "fn(op: gate.GateOp, bytes: int64): Result[Bytes]") ||
        !span_same(
            function_type,
            qualified_function_type) ||
        !span_same(
            function_type,
            parser_function_type) ||
        function_node < 0 ||
        type_graph.nodes[function_node].kind !=
            COLD_TYPE_IDENTITY_FUNCTION ||
        type_graph.nodes[function_node].child_count != 3 ||
        result_node < 0 ||
        type_graph.nodes[result_node].kind !=
            COLD_TYPE_IDENTITY_APPLY ||
        type_graph.nodes[result_node].child_count != 2 ||
        type_graph.nodes[result_node].exact_type_id != -1 ||
        type_graph.children[
            type_graph.nodes[result_node].child_start] !=
            result_owner_node ||
        result_owner_node < 0 ||
        result_alias_owner_node < 0 ||
        result_owner_node !=
            result_alias_owner_node ||
        type_graph.nodes[result_owner_node].
                exact_type_id !=
            type_graph.nodes[result_alias_owner_node].
                exact_type_id ||
        memcmp(
            type_graph.nodes[result_owner_node].cid,
            type_graph.nodes[
                result_alias_owner_node].cid,
            32) != 0 ||
        gate_op_node < 0 ||
        gate_op_alias_node < 0 ||
        gate_op_node != gate_op_alias_node ||
        type_graph.nodes[gate_op_node].
                exact_type_id !=
            type_graph.nodes[gate_op_alias_node].
                exact_type_id ||
        memcmp(
            type_graph.nodes[gate_op_node].cid,
            type_graph.nodes[gate_op_alias_node].cid,
            32) != 0 ||
        gate_fetcher_node < 0 ||
        gate_fetcher_alias_node < 0 ||
        gate_fetcher_node !=
            gate_fetcher_alias_node ||
        type_graph.nodes[gate_fetcher_node].
                exact_type_id !=
            type_graph.nodes[
                gate_fetcher_alias_node].
                exact_type_id ||
        memcmp(
            type_graph.nodes[gate_fetcher_node].cid,
            type_graph.nodes[
                gate_fetcher_alias_node].cid,
            32) != 0 ||
        source_less_node >= 0 ||
        fixture.symbols->object_count !=
            object_count_before_type_graph ||
        symbols_find_object(
            fixture.symbols,
            cold_cstr_span("Result")) ||
        symbols_find_object(
            fixture.symbols,
            cold_cstr_span("Result[Bytes]")) ||
        !cold_fn_sig_is_type(function_source) ||
        cold_fn_sig_is_type(
            cold_cstr_span(
                "fnx (op: GateOp)")) ||
        cold_fn_sig_is_type(
            cold_cstr_span(
                "fn (op: GateOp"))) {
        fprintf(
            stderr,
            "positive_debug pointer=%d/%d/%d function=%d/%d/%d "
            "result=%d/%d/%d/%d owner=%d/%d "
            "gate_op=%d/%d fetcher=%d/%d source_less=%d "
            "objects=%d/%d fn_type=%d/%d/%d\n",
            pointer_node,
            pointer_node >= 0
                ? type_graph.nodes[pointer_node].kind
                : -1,
            pointer_node >= 0
                ? type_graph.nodes[pointer_node].child_count
                : -1,
            function_node,
            function_node >= 0
                ? type_graph.nodes[function_node].kind
                : -1,
            function_node >= 0
                ? type_graph.nodes[function_node].child_count
                : -1,
            result_node,
            result_node >= 0
                ? type_graph.nodes[result_node].kind
                : -1,
            result_node >= 0
                ? type_graph.nodes[result_node].child_count
                : -1,
            result_node >= 0
                ? type_graph.nodes[result_node].exact_type_id
                : -2,
            result_owner_node,
            result_alias_owner_node,
            gate_op_node, gate_op_alias_node,
            gate_fetcher_node,
            gate_fetcher_alias_node,
            source_less_node,
            object_count_before_type_graph,
            fixture.symbols->object_count,
            cold_fn_sig_is_type(function_source)
                ? 1 : 0,
            cold_fn_sig_is_type(
                cold_cstr_span(
                    "fnx (op: GateOp)"))
                ? 1 : 0,
            cold_fn_sig_is_type(
                cold_cstr_span(
                    "fn (op: GateOp"))
                ? 1 : 0);
        fprintf(
            stderr,
            "positive_debug body=%d/%d/%d/%d/%d/%d/%d/%d "
            "function_text=%d/%d/%d result_base=%d "
            "result_owner=%d/%d gate_owner=%d/%d "
            "fetcher_owner=%d/%d residual=%d/%d\n",
            fixture.body->op_value_def_ownership[
                fixture.definition],
            fixture.body->slot_managed_storage_kind[
                fixture.local.slot],
            fixture.body->op_value_def_origin_id[
                fixture.projection],
            fixture.body->
                op_value_def_consume_op_index_plus_one[
                    fixture.definition],
            cold_exact_plain_scope_end_tuple_valid(
                fixture.body, fixture.symbols,
                fixture.scope_end)
                ? 1 : 0,
            cold_exact_definition_consumption_dataflow_valid(
                fixture.body, fixture.definition)
                ? 1 : 0,
            state,
            cold_bodyir_exact_identity_schema_valid(
                fixture.body, fixture.symbols,
                "loop-local-plain-scope-debug", false)
                ? 1 : 0,
            span_eq(
                function_type,
                "fn(op: gate.GateOp, bytes: int64): Result[Bytes]")
                ? 1 : 0,
            span_same(
                function_type,
                qualified_function_type)
                ? 1 : 0,
            span_same(
                function_type,
                parser_function_type)
                ? 1 : 0,
            result_node >= 0 &&
                    type_graph.nodes[result_node].
                            child_count > 0
                ? type_graph.nodes[
                      type_graph.children[
                          type_graph.nodes[result_node].
                              child_start]].payload0
                : -1,
            result_owner_node >= 0
                ? type_graph.nodes[
                      result_owner_node].exact_type_id
                : -1,
            result_alias_owner_node >= 0
                ? type_graph.nodes[
                      result_alias_owner_node].
                      exact_type_id
                : -1,
            gate_op_node >= 0
                ? type_graph.nodes[
                      gate_op_node].exact_type_id
                : -1,
            gate_op_alias_node >= 0
                ? type_graph.nodes[
                      gate_op_alias_node].exact_type_id
                : -1,
            gate_fetcher_node >= 0
                ? type_graph.nodes[
                      gate_fetcher_node].exact_type_id
                : -1,
            gate_fetcher_alias_node >= 0
                ? type_graph.nodes[
                      gate_fetcher_alias_node].
                      exact_type_id
                : -1,
            symbols_find_object(
                fixture.symbols,
                cold_cstr_span("Result"))
                ? 1 : 0,
            symbols_find_object(
                fixture.symbols,
                cold_cstr_span("Result[Bytes]"))
                ? 1 : 0);
        gate_fail("positive loop-local identity proof failed");
    }
    (void)gate_add_parser_result_at_origin(
        fixture.symbols,
        cold_cstr_span("other.Result"),
        cold_cstr_span("/gate/other/result.cheng"),
        0, other_result_offset);
    int32_t other_result_owner_node =
        cold_type_identity_graph_build(
            &type_graph,
            cold_cstr_span("other.Result"),
            NULL, 0,
            COLD_GENERIC_BINDER_NONE, -1, 0);
    if (other_result_owner_node < 0 ||
        memcmp(
            type_graph.nodes[result_owner_node].cid,
            type_graph.nodes[
                other_result_owner_node].cid,
            32) == 0) {
        gate_fail("distinct nominal declaration owners collapsed");
    }
    if (cold_type_identity_nominal_object_row_readonly(
            fixture.symbols,
            cold_cstr_span("Result"), 1) !=
            COLD_TYPE_IDENTITY_NOMINAL_AMBIGUOUS) {
        gate_fail("ambiguous parser nominal identity was accepted");
    }
    cold_type_identity_graph_release(&type_graph);
    cold_harness_compilation_end(
        fixture.compilation, false);
    arena_release(fixture.arena);
    GenericAbiFixture generic_abi;
    gate_generic_abi_fixture(&generic_abi);
    gate_require_generic_abi(&generic_abi);
    gate_require_generic_binder_identity(
        &generic_abi);
    gate_require_generic_binder_row_independence(
        &generic_abi);
    gate_require_generic_application_alias_identity(
        &generic_abi);
    if (!cold_type_block_looks_like_object(
            cold_cstr_span(
                "    ok:\n"
                "        bool\n"
                "    value:\n"
                "        int32\n")) ||
        cold_type_block_looks_like_object(
            cold_cstr_span(
                "    value: int32 unexpected\n"))) {
        gate_fail("multiline object declaration boundary is not exact");
    }
    puts("loop_local_plain_scope_definition=plain");
    puts("loop_local_plain_scope_backedge=consumed");
    puts("raw_pointer_type_node=pointee_exact");
    puts("spaced_function_type=structurally_scoped");
    puts("standard_result_apply=base_and_argument_exact");
    puts("type_graph_nominal_resolution=readonly_physical");
    puts("ambiguous_nominal_resolution=rejected");
    puts("open_generic_result_abi=i32_4");
    puts("generic_formal_type_id=open_result_exact");
    puts("generic_application_alias=declaration_exact");
    puts("generic_application_same_text=distinct_exact_identity");
    puts("object_drop_helper_formal_type_id=exact_object_row");
    puts("object_param_binding=frozen_type_id");
    puts("generic_application_type_graph=exact_scope_identity");
    puts("generic_binder_alpha_rename=same_cid");
    puts("generic_binder_distinct_owner=distinct_cid");
    puts("generic_binder_origin_row=projection_only");
    puts("generic_apply_type_id=projection_only");
    puts("nested_generic_binder=structurally_preserved");
    puts("nominal_object_alias=canonical_node");
    puts("nominal_enum_alias=canonical_node");
    puts("nominal_type_alias=canonical_node");
    puts("nominal_distinct_owner=distinct_cid");
    puts("nominal_source_less=rejected");
    puts("concrete_one_letter_nominal_abi=object_8");
    puts("multiline_object_boundary=exact");
    puts("cold_loop_local_plain_scope_identity_gate_status=pass");
    cold_harness_compilation_end(
        generic_abi.compilation, false);
    arena_release(generic_abi.arena);
    return 0;
}

static int gate_missing_generic_base(void) {
    GateFixture fixture;
    gate_fixture(&fixture);
    (void)gate_add_parser_bytes(fixture.symbols);
    ColdTypeIdentityGraph graph;
    memset(&graph, 0, sizeof(graph));
    graph.symbols = fixture.symbols;
    (void)cold_type_identity_graph_build(
        &graph, cold_cstr_span("Missing[Bytes]"),
        NULL, 0,
        COLD_GENERIC_BINDER_NONE, -1, 0);
    gate_fail("missing generic base was accepted");
    return 1;
}

static int gate_missing_scope_end(void) {
    GateFixture fixture;
    gate_fixture(&fixture);
    fixture.body->op_kind[fixture.scope_end] =
        BODY_OP_NOP;
    fixture.body->op_source_value_def_op_id[
        fixture.scope_end] = -1;
    fixture.body->op_value_def_consume_op_index_plus_one[
        fixture.definition] = 0;
    if (cold_exact_definition_consumption_dataflow_valid(
            fixture.body, fixture.definition)) {
        gate_fail("missing loop-local scope end was accepted");
    }
    gate_fail("missing loop-local scope end was rejected");
    return 1;
}

static int gate_forged_scope_end(void) {
    GateFixture fixture;
    gate_fixture(&fixture);
    fixture.body->op_a[fixture.scope_end] =
        fixture.local.slot;
    if (cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "loop-local-plain-scope-forged", false)) {
        gate_fail("forged loop-local scope end was accepted");
    }
    gate_fail("forged loop-local scope end was rejected");
    return 1;
}

static int gate_generic_abi_mutation(void) {
    GenericAbiFixture fixture;
    gate_generic_abi_fixture(&fixture);
    gate_require_generic_abi(&fixture);
    fixture.open_result->fields[0].kind =
        SLOT_OPAQUE;
    fixture.open_result->fields[0].size = 8;
    ColdTypeIdentityGraph graph;
    memset(&graph, 0, sizeof(graph));
    graph.symbols = fixture.symbols;
    FunctionContractAdmission admission;
    memset(&admission, 0, sizeof(admission));
    admission.symbols = fixture.symbols;
    admission.type_graph = &graph;
    admission.phase = "generic-abi-mutation";
    cold_require_type_object_layout_contract(
        &admission);
    gate_fail("mutated open generic ABI was accepted");
    return 1;
}

static int gate_forged_generic_origin(void) {
    GenericAbiFixture fixture;
    gate_generic_abi_fixture(&fixture);
    gate_require_generic_abi(&fixture);
    fixture.open_result->declaration_origin_row++;
    Span *generic_names = NULL;
    int32_t generic_count = 0;
    int32_t generic_binder_kind =
        COLD_GENERIC_BINDER_NONE;
    int32_t generic_binder_id = -1;
    bool open_application = false;
    if (cold_object_generic_scope_readonly(
            fixture.symbols,
            symbols_object_index(
                fixture.symbols,
            fixture.open_result),
            &generic_names, &generic_count,
            &generic_binder_kind,
            &generic_binder_id,
            &open_application)) {
        gate_fail("forged generic declaration origin was accepted");
    }
    gate_fail("forged generic declaration origin was rejected");
    return 1;
}

static int gate_forged_generic_binder(void) {
    GenericAbiFixture fixture;
    gate_generic_abi_fixture(&fixture);
    gate_require_generic_abi(&fixture);
    fixture.open_result->
        generic_application_binder_id =
        fixture.symbols->functions[
            fixture.other_generic_function_row].
            declaration_origin_row;
    Span *generic_names = NULL;
    int32_t generic_count = 0;
    int32_t generic_binder_kind =
        COLD_GENERIC_BINDER_NONE;
    int32_t generic_binder_id = -1;
    bool open_application = false;
    if (cold_object_generic_scope_readonly(
            fixture.symbols,
            symbols_object_index(
                fixture.symbols,
                fixture.open_result),
            &generic_names, &generic_count,
            &generic_binder_kind,
            &generic_binder_id,
            &open_application)) {
        gate_fail("forged generic binder was accepted");
    }
    gate_fail("forged generic binder was rejected");
    return 1;
}

static int gate_forged_generic_template_application(void) {
    GenericAbiFixture fixture;
    gate_generic_abi_fixture(&fixture);
    ObjectDef *template_object =
        symbols_find_object(
            fixture.symbols,
            cold_cstr_span("result.Result"));
    int32_t template_row =
        symbols_object_index(
            fixture.symbols, template_object);
    if (!template_object || template_row < 0 ||
        template_object->generic_count <= 0) {
        gate_fail("generic template fixture is missing");
    }
    template_object->
        generic_application_template_object_row =
        template_row;
    Span *generic_names = NULL;
    int32_t generic_count = 0;
    int32_t generic_binder_kind =
        COLD_GENERIC_BINDER_NONE;
    int32_t generic_binder_id = -1;
    bool open_application = false;
    if (cold_object_generic_scope_readonly(
            fixture.symbols, template_row,
            &generic_names, &generic_count,
            &generic_binder_kind,
            &generic_binder_id,
            &open_application)) {
        gate_fail(
            "generic template application metadata was accepted");
    }
    gate_fail(
        "forged generic template application metadata was rejected");
    return 1;
}

static int gate_frozen_param_authority(void) {
    GenericAbiFixture fixture;
    gate_generic_abi_fixture(&fixture);
    gate_require_generic_abi(&fixture);
    puts("object_param_binding=frozen_type_id");
    puts("open_object_param_storage=unknown");
    puts("cold_frozen_param_identity_gate_status=pass");
    cold_harness_compilation_end(
        fixture.compilation, false);
    arena_release(fixture.arena);
    return 0;
}

static int gate_forged_frozen_param_authority(void) {
    GenericAbiFixture fixture;
    gate_generic_abi_fixture(&fixture);
    gate_require_generic_abi(&fixture);
    int32_t concrete_helper = -1;
    for (int32_t row = 0;
         row < fixture.symbols->function_count;
         row++) {
        if (span_eq(
                fixture.symbols->functions[row].name,
                "<gate-drop-concrete>")) {
            concrete_helper = row;
            break;
        }
    }
    int32_t open_exact =
        cold_exact_object_definition_type_id(
            fixture.symbols,
            fixture.other_open_result,
            SLOT_OBJECT);
    if (concrete_helper < 0 ||
        open_exact < 0) {
        gate_fail(
            "frozen parameter forgery fixture is missing");
    }
    fixture.symbols->functions[
        concrete_helper].
        param_exact_type_id[0] = open_exact;
    BodyIR *body = body_new(fixture.arena);
    body->producer_function_row =
        concrete_helper;
    body->param_count = 1;
    int32_t param = body_slot(
        body, SLOT_OBJECT,
        fixture.symbols->functions[
            concrete_helper].param_size[0]);
    body_slot_set_type(
        body, param,
        cold_cstr_span("Result[U]"));
    body->param_slot[0] = param;
    Locals locals;
    locals_init(&locals, fixture.arena);
    locals_add(
        &locals, cold_cstr_span("value"),
        param, SLOT_OBJECT);
    Span param_types[1] = {
        cold_cstr_span("Result[U]")};
    cold_bind_exact_managed_parameters(
        body, fixture.symbols,
        &locals, param_types);
    gate_fail(
        "forged frozen parameter ObjectDef was accepted");
    return 1;
}

int main(int argc, char **argv) {
    if (argc == 1 ||
        (argc == 2 &&
         strcmp(argv[1], "positive") == 0)) {
        return gate_positive();
    }
    if (argc == 2 &&
        strcmp(argv[1], "missing-scope-end") == 0) {
        return gate_missing_scope_end();
    }
    if (argc == 2 &&
        strcmp(argv[1], "missing-generic-base") == 0) {
        return gate_missing_generic_base();
    }
    if (argc == 2 &&
        strcmp(argv[1], "forged-scope-end") == 0) {
        return gate_forged_scope_end();
    }
    if (argc == 2 &&
        strcmp(argv[1], "generic-abi-mutation") == 0) {
        return gate_generic_abi_mutation();
    }
    if (argc == 2 &&
        strcmp(argv[1], "forged-generic-origin") == 0) {
        return gate_forged_generic_origin();
    }
    if (argc == 2 &&
        strcmp(argv[1], "forged-generic-binder") == 0) {
        return gate_forged_generic_binder();
    }
    if (argc == 2 &&
        strcmp(
            argv[1],
            "forged-generic-template-application") == 0) {
        return gate_forged_generic_template_application();
    }
    if (argc == 2 &&
        strcmp(
            argv[1],
            "frozen-param-authority") == 0) {
        return gate_frozen_param_authority();
    }
    if (argc == 2 &&
        strcmp(
            argv[1],
            "forged-frozen-param-authority") == 0) {
        return gate_forged_frozen_param_authority();
    }
    if (argc == 2 &&
        strcmp(
            argv[1],
            "isolated-direct-import-positive") == 0) {
        return gate_isolated_direct_import_positive();
    }
    if (argc == 2 &&
        strcmp(
            argv[1],
            "isolated-direct-binding-mutation") == 0) {
        return gate_isolated_direct_binding_mutation();
    }
    if (argc == 2 &&
        strcmp(
            argv[1],
            "isolated-direct-object-origin-mutation") == 0) {
        return gate_isolated_direct_object_origin_mutation();
    }
    if (argc == 2 &&
        strcmp(
            argv[1],
            "isolated-direct-type-origin-mutation") == 0) {
        return gate_isolated_direct_type_origin_mutation();
    }
    gate_fail("unknown mode");
    return 1;
}
