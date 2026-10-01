#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main

static int32_t fixture_register_alloc(
        Symbols *symbols, const char *mode) {
    int32_t kinds[2] = {SLOT_I64, SLOT_I64};
    int32_t sizes[2] = {8, 8};
    Span types[2] = {
        cold_cstr_span("uint64"),
        cold_cstr_span("uint64")};
    Span return_type = cold_cstr_span("ptr");
    Span link_name = cold_cstr_span("fixture_alloc");
    if (strcmp(mode, "missing-type") == 0)
        types[0] = (Span){0};
    if (strcmp(mode, "wrong-kind") == 0)
        kinds[0] = SLOT_I32;
    if (strcmp(mode, "wrong-size") == 0)
        sizes[0] = 4;
    if (strcmp(mode, "empty-link") == 0)
        link_name = (Span){0};
    return symbols_register_exact_external_runtime_fn(
        symbols,
        cold_cstr_span("fixture_exact_external_alloc"),
        link_name, 2, kinds, sizes, types, return_type);
}

static int32_t fixture_register_free(Symbols *symbols) {
    int32_t kinds[1] = {SLOT_OPAQUE};
    int32_t sizes[1] = {8};
    Span types[1] = {cold_cstr_span("ptr")};
    return symbols_register_exact_external_runtime_fn(
        symbols,
        cold_cstr_span("fixture_exact_external_free"),
        cold_cstr_span("fixture_free"), 1,
        kinds, sizes, types, cold_cstr_span("void"));
}

static int32_t fixture_ensure_source_empty_void(Symbols *symbols) {
    Span name = cold_cstr_span("fixture_source_empty_void");
    int32_t count_before = symbols->function_count;
    int32_t source_row = symbols_add_fn(
        symbols, name, 0, NULL, NULL, NULL, (Span){0});
    if (source_row != count_before) return -1;
    symbols->functions[source_row].is_external = true;
    symbols_set_fn_link_name(symbols, source_row, name);
    int32_t ensured_row =
        symbols_ensure_exact_external_runtime_fn(
            symbols, name, name, 0,
            NULL, NULL, NULL, cold_cstr_span("void"));
    if (ensured_row != source_row ||
        symbols->function_count != count_before + 1) {
        return -1;
    }
    return ensured_row;
}

/* The Cheng internal name and the linker identity are independent columns.
   This is the real `free` / `cheng_free` shape from std/system: a source row
   whose internal name equals a requested libc link must not be reused when
   its stored link_name identifies a different external symbol. */
static int32_t fixture_ensure_internal_name_link_separation(
        Symbols *symbols, bool forge_internal_collision) {
    int32_t kinds[1] = {SLOT_OPAQUE};
    int32_t sizes[1] = {8};
    Span types[1] = {cold_cstr_span("ptr")};
    Span requested_link = cold_cstr_span("fixture_libc_free");
    Span synthetic_name = cold_cstr_span("fixture_exact_libc_free");
    Span source_name = forge_internal_collision ?
        synthetic_name : requested_link;
    int32_t source_row = symbols_add_fn(
        symbols, source_name, 1, kinds, sizes, types,
        (Span){0});
    symbols_set_fn_param_types(symbols, source_row, types, 1);
    symbols->functions[source_row].is_external = true;
    symbols_set_fn_link_name(
        symbols, source_row,
        cold_cstr_span("fixture_managed_free"));
    int32_t count_before = symbols->function_count;
    int32_t exact_row = symbols_ensure_exact_external_runtime_fn(
        symbols, synthetic_name, requested_link, 1,
        kinds, sizes, types, cold_cstr_span("void"));
    if (forge_internal_collision) return -1;
    if (exact_row == source_row ||
        exact_row != count_before ||
        symbols->function_count != count_before + 1 ||
        !span_same(symbols->functions[source_row].link_name,
                   cold_cstr_span("fixture_managed_free")) ||
        !span_same(symbols->functions[exact_row].link_name,
                   requested_link)) {
        return -1;
    }
    int32_t duplicate_count = symbols->function_count;
    int32_t duplicate_row = symbols_ensure_exact_external_runtime_fn(
        symbols, synthetic_name, requested_link, 1,
        kinds, sizes, types, cold_cstr_span("void"));
    if (duplicate_row != exact_row ||
        symbols->function_count != duplicate_count) {
        return -1;
    }
    return exact_row;
}

/* Conversely, an existing source @importc row with the exact stored link is
   the authoritative row even when its internal name and nominal pointer type
   differ from the compiler schema.  Its semantic TypeId must survive the ABI
   compatibility join. */
static int32_t fixture_ensure_exact_source_link_reuse(Symbols *symbols) {
    int32_t kinds[1] = {SLOT_OPAQUE};
    int32_t sizes[1] = {8};
    Span source_types[1] = {cold_cstr_span("cstring")};
    Span schema_types[1] = {cold_cstr_span("ptr")};
    Span link = cold_cstr_span("fixture_nominal_abort");
    int32_t source_row = symbols_add_fn(
        symbols, cold_cstr_span("fixtureSourceNominalAbort"),
        1, kinds, sizes, source_types, cold_cstr_span("ptr"));
    symbols_set_fn_param_types(symbols, source_row, source_types, 1);
    symbols->functions[source_row].is_external = true;
    symbols_set_fn_link_name(symbols, source_row, link);
    int32_t count_before = symbols->function_count;
    int32_t ensured_row = symbols_ensure_exact_external_runtime_fn(
        symbols, cold_cstr_span("fixture_exact_nominal_abort"),
        link, 1, kinds, sizes, schema_types,
        cold_cstr_span("cstring"));
    if (ensured_row != source_row ||
        symbols->function_count != count_before ||
        !span_same(symbols->functions[source_row].param_type[0],
                   source_types[0]) ||
        symbols->functions[source_row].param_exact_type_id[0] !=
            SLOT_OPAQUE * 1048576 ||
        !span_eq(symbols->functions[source_row].ret, "ptr") ||
        symbols->functions[source_row].return_exact_type_id !=
            SLOT_OPAQUE * 1048576) {
        return -1;
    }
    return ensured_row;
}

/* Equal register width is not return identity.  A source uint64 FunctionRow
   must not satisfy a parser-synthesized int64 CallOp for the same link. */
static int32_t fixture_reject_wrong_semantic_return(Symbols *symbols) {
    Span link = cold_cstr_span("fixture_wrong_semantic_return");
    int32_t source_row = symbols_add_fn(
        symbols, cold_cstr_span("fixtureWrongSemanticReturn"),
        0, NULL, NULL, NULL, cold_cstr_span("uint64"));
    symbols->functions[source_row].is_external = true;
    symbols_set_fn_link_name(symbols, source_row, link);
    return symbols_ensure_exact_external_runtime_fn(
        symbols, cold_cstr_span("fixture_exact_wrong_semantic_return"),
        link, 0, NULL, NULL, NULL, cold_cstr_span("int64"));
}

int main(int argc, char **argv) {
    const int32_t domain_size = 1048576;
    const char *mode = argc > 1 ? argv[1] : "positive";
    Arena *arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (arena == MAP_FAILED) return 90;
    cold_mm_arena_open(arena, "external_runtime_signature_fixture");
    ColdCompilationContext *context =
        arena_alloc(arena, sizeof(ColdCompilationContext));
    cold_compilation_context_begin_terminal_harness(
        context, arena);
    int32_t root_scope =
        cold_symbol_scope_begin_root(context);
    Symbols *symbols = symbols_new_sized(
        context, root_scope, 8, 2, 2, 2, 2);

    if (strcmp(mode, "internal-identity-drift") == 0) {
        (void)fixture_ensure_internal_name_link_separation(
            symbols, true);
        return 97;
    }
    if (strcmp(mode, "wrong-return") == 0) {
        (void)fixture_reject_wrong_semantic_return(symbols);
        return 98;
    }

    int32_t alloc_row = fixture_register_alloc(symbols, mode);
    if (strcmp(mode, "link-drift") == 0) {
        int32_t kinds[2] = {SLOT_I64, SLOT_I64};
        int32_t sizes[2] = {8, 8};
        Span types[2] = {
            cold_cstr_span("uint64"),
            cold_cstr_span("uint64")};
        (void)symbols_register_exact_external_runtime_fn(
            symbols,
            cold_cstr_span("fixture_exact_external_alloc"),
            cold_cstr_span("fixture_other_alloc"), 2,
            kinds, sizes, types, cold_cstr_span("ptr"));
        return 93;
    }
    if (strcmp(mode, "forged-type-id") == 0) {
        symbols->functions[alloc_row].param_exact_type_id[0] =
            SLOT_I32 * domain_size;
        (void)fixture_register_alloc(symbols, "positive");
        return 91;
    }
    if (strcmp(mode, "forged-return-type-id") == 0) {
        symbols->functions[alloc_row].return_exact_type_id =
            SLOT_I32 * domain_size;
        (void)fixture_register_alloc(symbols, "positive");
        return 94;
    }
    if (strcmp(mode, "type-text-drift") == 0) {
        int32_t kinds[2] = {SLOT_I64, SLOT_I64};
        int32_t sizes[2] = {8, 8};
        Span types[2] = {
            cold_cstr_span("int64"),
            cold_cstr_span("uint64")};
        (void)symbols_register_exact_external_runtime_fn(
            symbols,
            cold_cstr_span("fixture_exact_external_alloc"),
            cold_cstr_span("fixture_alloc"), 2,
            kinds, sizes, types, cold_cstr_span("ptr"));
        return 95;
    }
    int32_t function_count_before_duplicate =
        symbols->function_count;
    int32_t duplicate_alloc_row =
        fixture_register_alloc(symbols, "positive");
    if (duplicate_alloc_row != alloc_row ||
        symbols->function_count != function_count_before_duplicate) {
        return 96;
    }
    int32_t free_row = fixture_register_free(symbols);
    int32_t source_empty_void_row =
        fixture_ensure_source_empty_void(symbols);
    int32_t separated_link_row =
        fixture_ensure_internal_name_link_separation(
            symbols, false);
    int32_t reused_source_link_row =
        fixture_ensure_exact_source_link_reuse(symbols);
    FnDef *alloc = &symbols->functions[alloc_row];
    FnDef *release = &symbols->functions[free_row];
    if (!alloc->is_external ||
        !span_eq(alloc->link_name, "fixture_alloc") ||
        alloc->arity != 2 ||
        alloc->param_kind[0] != SLOT_I64 ||
        alloc->param_kind[1] != SLOT_I64 ||
        alloc->param_size[0] != 8 ||
        alloc->param_size[1] != 8 ||
        !span_eq(alloc->param_type[0], "uint64") ||
        !span_eq(alloc->param_type[1], "uint64") ||
        alloc->param_exact_type_id[0] !=
            SLOT_I64 * domain_size ||
        alloc->param_exact_type_id[1] !=
            SLOT_I64 * domain_size ||
        alloc->return_exact_type_id !=
            SLOT_OPAQUE * domain_size ||
        !release->is_external ||
        !span_eq(release->link_name, "fixture_free") ||
        release->param_exact_type_id[0] !=
            SLOT_OPAQUE * domain_size ||
        release->return_exact_type_id !=
            SLOT_I32 * domain_size ||
        source_empty_void_row < 0 ||
        symbols->functions[source_empty_void_row].
            return_exact_type_id != -1 ||
        separated_link_row < 0 ||
        reused_source_link_row < 0) {
        return 92;
    }

    cold_compilation_context_release(context, false);
    arena_release(arena);
    puts("cold_external_runtime_signature_identity_fixture=passed");
    return 0;
}
