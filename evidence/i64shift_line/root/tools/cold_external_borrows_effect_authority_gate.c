#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

typedef struct ExternalBorrowsFixture {
    Arena *arena;
    Symbols *symbols;
    ColdHarnessCompilation compilation;
    ColdSourceSnapshotTable *source_snapshot;
    int32_t function_row;
} ExternalBorrowsFixture;

static void gate_fail(const char *message) {
    fprintf(
        stderr,
        "cold_external_borrows_effect_authority_gate: %s\n",
        message);
    exit(1);
}

static void gate_fixture(
        ExternalBorrowsFixture *fixture,
        bool declared_borrows) {
    static const char borrows_source[] =
        "@borrows\n"
        "@abi_internal\n"
        "@importc(\"gate_external_borrows\")\n"
        "fn gateExternalBorrows(value: str): int32\n";
    static const char owned_source[] =
        "@abi_internal\n"
        "@importc(\"gate_external_borrows\")\n"
        "fn gateExternalBorrows(value: str): int32\n";
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

    const char *source_text =
        declared_borrows ? borrows_source : owned_source;
    Span source = {
        (const uint8_t *)source_text,
        (int32_t)strlen(source_text)};
    ColdSourceSnapshotTable *snapshot =
        cold_harness_compilation_seal_source(
            &fixture->compilation, source,
            "tests/external_borrows_effect");
    fixture->source_snapshot = snapshot;

    const char *fn_text =
        strstr(source_text, "fn gateExternalBorrows");
    if (!fn_text)
        gate_fail("function token is missing");
    int32_t token_byte_offset =
        (int32_t)(fn_text - source_text);
    int32_t param_kind = SLOT_STR;
    int32_t param_size = COLD_STR_SLOT_SIZE;
    Span param_type = cold_cstr_span("str");
    fixture->function_row =
        symbols_add_fn_at_origin(
            fixture->symbols,
            cold_cstr_span("gateExternalBorrows"),
            1, &param_kind, &param_size,
            &param_type, cold_cstr_span("int32"),
            0, token_byte_offset);
    if (fixture->function_row < 0)
        gate_fail("function registration failed");
    symbols_set_fn_param_types(
        fixture->symbols,
        fixture->function_row, &param_type, 1);
    cold_publish_exact_formal_type_ids(
        fixture->symbols,
        fixture->function_row);
    FnDef *function =
        &fixture->symbols->
            functions[fixture->function_row];
    function->is_external = true;
    function->link_name =
        cold_cstr_span("gate_external_borrows");
    function->borrows_args = true;
}

static void gate_admit(
        ExternalBorrowsFixture *fixture) {
    FunctionContractAdmission admission;
    memset(&admission, 0, sizeof(admission));
    admission.symbols = fixture->symbols;
    admission.phase =
        "external-borrows-effect-gate";
    cold_function_contract_derive_borrows_args(
        &admission, fixture->function_row, NULL);
}

static int gate_positive(void) {
    ExternalBorrowsFixture fixture;
    gate_fixture(&fixture, true);
    gate_admit(&fixture);
    FnDef *function =
        &fixture.symbols->
            functions[fixture.function_row];
    if (!function->borrows_args ||
        function->
                external_borrows_declaration_origin_row !=
            function->declaration_origin_row) {
        gate_fail("source declaration effect did not seal");
    }

    puts("external_borrows_source_authority=exact_origin");
    puts("cold_external_borrows_effect_authority_gate_status=pass");
    cold_harness_compilation_end(
        &fixture.compilation, false);
    arena_release(fixture.arena);
    return 0;
}

static int gate_source_mismatch(void) {
    ExternalBorrowsFixture fixture;
    gate_fixture(&fixture, false);
    gate_admit(&fixture);
    gate_fail("forged source effect was accepted");
    return 1;
}

static int gate_origin_mutation(void) {
    ExternalBorrowsFixture fixture;
    gate_fixture(&fixture, true);
    FnDef *function =
        &fixture.symbols->
            functions[fixture.function_row];
    function->
        external_borrows_declaration_origin_row =
            function->declaration_origin_row + 1;
    gate_admit(&fixture);
    gate_fail("mutated source effect origin was accepted");
    return 1;
}

int main(int argc, char **argv) {
    if (argc == 1 ||
        (argc == 2 &&
         strcmp(argv[1], "positive") == 0)) {
        return gate_positive();
    }
    if (argc == 2 &&
        strcmp(argv[1], "source-mismatch") == 0) {
        return gate_source_mismatch();
    }
    if (argc == 2 &&
        strcmp(argv[1], "origin-mutation") == 0) {
        return gate_origin_mutation();
    }
    gate_fail("unknown mode");
    return 1;
}
