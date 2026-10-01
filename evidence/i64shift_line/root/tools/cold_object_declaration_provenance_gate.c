#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

typedef struct ObjectProvenanceFixture {
    Arena arena;
    ColdSourceSnapshotTable source_snapshot;
    ColdHarnessCompilation compilation;
    Span source;
    Symbols *symbols;
    ObjectDef *canonical;
    ObjectDef *declaration;
} ObjectProvenanceFixture;

static void gate_fail(const char *message) {
    fprintf(
        stderr,
        "cold_object_declaration_provenance_gate: %s\n",
        message);
    exit(1);
}

static void gate_set_field(ObjectDef *object, int32_t kind) {
    object->fields[0].name = cold_cstr_span("text");
    object->fields[0].kind = kind;
    object->fields[0].size =
        kind == SLOT_STR ? COLD_STR_SLOT_SIZE : 4;
    object->fields[0].type_name =
        kind == SLOT_STR
            ? cold_cstr_span("str")
            : cold_cstr_span("int32");
    object_finalize_fields(object);
}

static void gate_fixture_init(ObjectProvenanceFixture *fixture) {
    memset(fixture, 0, sizeof(*fixture));
    cold_harness_compilation_begin(
        &fixture->compilation, &fixture->arena);
    fixture->compilation.snapshot =
        &fixture->source_snapshot;
    cold_source_snapshot_begin(
        &fixture->source_snapshot, &fixture->arena,
        fixture->compilation.context);
    fixture->source = cold_source_snapshot_open_entry(
        &fixture->source_snapshot,
        "src/tests/cold_declaration_origin_body/types.cheng");
    if (fixture->source.len <= 17)
        gate_fail("source snapshot fixture is too short");
    cold_source_snapshot_seal(
        &fixture->source_snapshot);
    symbols_bind_source_snapshot(
        fixture->compilation.symbols,
        &fixture->source_snapshot);
    fixture->symbols = fixture->compilation.symbols;
    Span name = cold_cstr_span("CanonicalMirrorReceipt");
    fixture->canonical =
        symbols_add_object(fixture->symbols, name, 1);
    gate_set_field(fixture->canonical, SLOT_STR);
    fixture->declaration = symbols_add_object_at_origin(
        fixture->symbols, name, 1, 0, 17);
    gate_set_field(fixture->declaration, SLOT_STR);
}

static void gate_import_synthetic_mirror(
        ObjectProvenanceFixture *fixture) {
    Span qualified_name =
        cold_cstr_span("mirror.ManagedRow");
    ObjectDef *canonical = symbols_add_object(
        fixture->symbols, qualified_name, 2);
    canonical->fields[0].name =
        cold_cstr_span("label");
    canonical->fields[0].kind = SLOT_STR;
    canonical->fields[0].size =
        COLD_STR_SLOT_SIZE;
    canonical->fields[0].type_name =
        cold_cstr_span("str");
    canonical->fields[1].name =
        cold_cstr_span("value");
    canonical->fields[1].kind = SLOT_I32;
    canonical->fields[1].size = 4;
    canonical->fields[1].type_name =
        cold_cstr_span("int32");
    object_finalize_fields(canonical);
    int32_t canonical_row =
        symbols_object_index(
            fixture->symbols, canonical);
    if (!cold_collect_import_module_types(
            fixture->symbols,
            cold_cstr_span("mirror"),
            fixture->source,
            "src/tests/cold_declaration_origin_body/types.cheng")) {
        gate_fail("imported parser declaration scan failed");
    }
    ObjectDef *declaration =
        symbols_find_object(
            fixture->symbols, qualified_name);
    if (!declaration ||
        declaration == canonical ||
        !declaration->is_parser_declaration ||
        declaration->canonical_mirror_object_row !=
            canonical_row ||
        declaration->decl_path.len <= 0 ||
        !span_eq(
            declaration->decl_path,
            "src/tests/cold_declaration_origin_body/types.cheng") ||
        declaration->field_count != 2 ||
        declaration->generic_count != 0 ||
        declaration->is_ref) {
        gate_fail("imported parser mirror metadata was not initialized");
    }
}

static void gate_positive(void) {
    ObjectProvenanceFixture fixture;
    gate_fixture_init(&fixture);
    ObjectDef *resolved = symbols_find_object(
        fixture.symbols,
        cold_cstr_span("CanonicalMirrorReceipt"));
    if (fixture.symbols->object_count != 2 ||
        fixture.canonical == fixture.declaration ||
        fixture.canonical->is_parser_declaration ||
        fixture.canonical->declaration_origin_row != -1 ||
        fixture.canonical->canonical_mirror_object_row != -1 ||
        !fixture.declaration->is_parser_declaration ||
        fixture.declaration->declaration_origin_row < 0 ||
        fixture.declaration->canonical_mirror_object_row != 0 ||
        resolved != fixture.declaration) {
        gate_fail("structural provenance rows are not exact");
    }
    cold_require_parser_object_canonical_mirror_exact(
        fixture.symbols, fixture.declaration);
    ObjectDef *same = symbols_add_object_at_origin(
        fixture.symbols,
        fixture.declaration->name, 1, 0, 17);
    if (same != fixture.declaration ||
        fixture.symbols->object_count != 2) {
        gate_fail("parser declaration identity was duplicated");
    }
    gate_import_synthetic_mirror(&fixture);
    puts("cold_object_declaration_provenance_gate_status=pass");
    puts("canonical_row=0");
    puts("parser_declaration_row=1");
    puts("parser_lookup_wins=1");
    puts("imported_synthetic_mirror_initialized=1");
    cold_source_snapshot_end(
        &fixture.source_snapshot);
    arena_release(&fixture.arena);
}

static void gate_mutation(const char *mode) {
    ObjectProvenanceFixture fixture;
    gate_fixture_init(&fixture);
    if (strcmp(mode, "field") == 0) {
        fixture.declaration->fields[0].kind = SLOT_I32;
    } else if (strcmp(mode, "parser-kind") == 0) {
        fixture.declaration->is_parser_declaration = false;
    } else if (strcmp(mode, "parser-origin") == 0) {
        fixture.declaration->declaration_origin_row = -1;
    } else if (strcmp(mode, "canonical-origin") == 0) {
        fixture.canonical->declaration_origin_row = 0;
    } else if (strcmp(mode, "mirror-row") == 0) {
        fixture.declaration->canonical_mirror_object_row = 1;
    } else {
        gate_fail("unknown mutation");
    }
    cold_require_parser_object_canonical_mirror_exact(
        fixture.symbols, fixture.declaration);
    gate_fail("mutated provenance was accepted");
}

int main(int argc, char **argv) {
    if (argc == 1 || strcmp(argv[1], "positive") == 0) {
        gate_positive();
        return 0;
    }
    gate_mutation(argv[1]);
    return 0;
}
