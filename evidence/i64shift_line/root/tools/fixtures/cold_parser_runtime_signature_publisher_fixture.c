#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main

static int32_t fixture_add_source_compat(
        Symbols *symbols, Span internal_name, Span link_name,
        Span *types, int32_t arity, Span return_type) {
    int32_t kinds[COLD_MAX_I32_PARAMS];
    int32_t sizes[COLD_MAX_I32_PARAMS];
    for (int32_t formal = 0; formal < arity; formal++) {
        kinds[formal] =
            cold_parser_slot_kind_from_type_in_generic_scope(
                symbols, types[formal], NULL, 0,
                COLD_GENERIC_BINDER_NONE, -1);
        sizes[formal] =
            cold_parser_slot_size_from_type_in_generic_scope(
                symbols, types[formal], kinds[formal],
                NULL, 0, COLD_GENERIC_BINDER_NONE, -1);
    }
    int32_t row = symbols_add_fn(
        symbols, internal_name, arity, kinds, sizes,
        types, return_type);
    if (row < 0 || row >= symbols->function_count) return -1;
    symbols_set_fn_param_types(symbols, row, types, arity);
    symbols->functions[row].is_external = true;
    symbols_set_fn_link_name(symbols, row, link_name);
    return row;
}

static int32_t fixture_ensure_ptr_i32_i32_void(
        Symbols *symbols, const char *link_name) {
    Span types[3] = {
        cold_cstr_span("ptr"),
        cold_cstr_span("int32"),
        cold_cstr_span("int32")};
    return symbols_ensure_exact_external_runtime_signature(
        symbols, cold_cstr_span(link_name), 3,
        types, cold_cstr_span("void"));
}

static int32_t fixture_source_row_join(
        Symbols *symbols, const char *mode) {
    Span link = cold_cstr_span("fixture_seq_release_range_compat");
    Span types[3] = {
        cold_cstr_span("ptr"),
        cold_cstr_span("int32"),
        cold_cstr_span("int32")};
    int32_t arity = 3;
    Span return_type = cold_cstr_span("void");
    if (strcmp(mode, "wrong-arity") == 0) arity = 2;
    if (strcmp(mode, "wrong-formal") == 0)
        types[1] = cold_cstr_span("uint64");
    if (strcmp(mode, "missing-formal") == 0)
        types[0] = (Span){0};
    if (strcmp(mode, "wrong-return") == 0)
        return_type = cold_cstr_span("int32");
    Span stored_link = strcmp(mode, "link-drift") == 0
        ? cold_cstr_span("fixture_other_compat") : link;
    int32_t source_row = fixture_add_source_compat(
        symbols, link, stored_link, types, arity,
        return_type);
    if (source_row < 0) return -1;
    if (strcmp(mode, "forged-type-id") == 0)
        symbols->functions[source_row].param_exact_type_id[0] =
            SLOT_I32 * 1048576;
    int32_t count_before = symbols->function_count;
    int32_t ensured = fixture_ensure_ptr_i32_i32_void(
        symbols, "fixture_seq_release_range_compat");
    if (strcmp(mode, "positive") != 0) return -1;
    if (ensured != source_row ||
        symbols->function_count != count_before) {
        return -1;
    }
    return ensured;
}

int main(int argc, char **argv) {
    const char *mode = argc > 1 ? argv[1] : "positive";
    Arena *arena = mmap(
        0, sizeof(Arena), PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (arena == MAP_FAILED) return 90;
    cold_mm_arena_open(
        arena, "parser_runtime_signature_publisher_fixture");
    ColdCompilationContext *context =
        arena_alloc(arena, sizeof(ColdCompilationContext));
    cold_compilation_context_begin_terminal_harness(
        context, arena);
    int32_t root_scope =
        cold_symbol_scope_begin_root(context);
    Symbols *symbols = symbols_new_sized(
        context, root_scope, 16, 2, 2, 2, 2);

    int32_t release_row = fixture_source_row_join(symbols, mode);
    if (strcmp(mode, "positive") != 0) return 97;
    int32_t delete_row = fixture_ensure_ptr_i32_i32_void(
        symbols, "fixture_seq_delete_shift_compat");
    int32_t init_row = fixture_ensure_ptr_i32_i32_void(
        symbols, "fixture_seq_init_compat");
    int32_t count_before_duplicate = symbols->function_count;
    int32_t duplicate_delete_row =
        fixture_ensure_ptr_i32_i32_void(
            symbols, "fixture_seq_delete_shift_compat");
    int32_t pointer_type_id = SLOT_OPAQUE * 1048576;
    int32_t int32_type_id = SLOT_I32 * 1048576;
    if (release_row < 0 || delete_row < 0 || init_row < 0 ||
        duplicate_delete_row != delete_row ||
        symbols->function_count != count_before_duplicate) {
        return 91;
    }
    int32_t rows[3] = {release_row, delete_row, init_row};
    for (int32_t index = 0; index < 3; index++) {
        FnDef *function = &symbols->functions[rows[index]];
        if (!function->is_external || function->arity != 3 ||
            function->param_kind[0] != SLOT_OPAQUE ||
            function->param_kind[1] != SLOT_I32 ||
            function->param_kind[2] != SLOT_I32 ||
            function->param_size[0] != 8 ||
            function->param_size[1] != 4 ||
            function->param_size[2] != 4 ||
            function->param_exact_type_id[0] != pointer_type_id ||
            function->param_exact_type_id[1] != int32_type_id ||
            function->param_exact_type_id[2] != int32_type_id ||
            function->param_exact_object_is_ref[0] != -1 ||
            function->param_exact_object_is_ref[1] != -1 ||
            function->param_exact_object_is_ref[2] != -1 ||
            function->return_exact_type_id != int32_type_id) {
            return 92;
        }
    }
    cold_compilation_context_release(context, false);
    arena_release(arena);
    puts("cold_parser_runtime_signature_publisher_fixture=passed");
    return 0;
}
