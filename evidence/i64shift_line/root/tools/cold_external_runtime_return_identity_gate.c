#define main cheng_cold_compiler_main
#include "../bootstrap/cheng_cold.c"
#undef main

static void require_compatible(Symbols *symbols,
                               const char *expected,
                               const char *actual) {
    if (!cold_runtime_return_signature_abi_compatible(
            symbols, cold_cstr_span(expected), cold_cstr_span(actual))) {
        fprintf(stderr,
                "external_return_identity_expected_compatible=%s:%s\n",
                expected, actual);
        exit(1);
    }
}

static void require_incompatible(Symbols *symbols,
                                 const char *expected,
                                 const char *actual) {
    if (cold_runtime_return_signature_abi_compatible(
            symbols, cold_cstr_span(expected), cold_cstr_span(actual))) {
        fprintf(stderr,
                "external_return_identity_expected_incompatible=%s:%s\n",
                expected, actual);
        exit(1);
    }
}

int main(void) {
    Arena *arena = mmap(NULL, sizeof(Arena), PROT_READ | PROT_WRITE,
                        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (arena == MAP_FAILED) return 2;
    cold_mm_arena_open(arena, "external_runtime_return_identity_test");
    ColdCompilationContext *context =
        arena_alloc(arena, sizeof(ColdCompilationContext));
    cold_compilation_context_begin_terminal_harness(context, arena);
    int32_t scope = cold_symbol_scope_begin_root(context);
    Symbols *symbols = symbols_new_sized(
        context, scope, 8, 8, 8, 8, 8);

    int32_t row = symbols_add_fn(
        symbols, cold_cstr_span("test_external_ptr_return"),
        0, NULL, NULL, NULL, cold_cstr_span("ptr"));
    if (row < 0 || row >= symbols->function_count) return 3;
    symbols->functions[row].is_external = true;
    symbols_set_fn_link_name(
        symbols, row, cold_cstr_span("test_external_ptr_return"));
    cold_publish_exact_formal_type_ids(symbols, row);
    int32_t nominal_return_type_id =
        symbols->functions[row].return_exact_type_id;
    if (nominal_return_type_id < 0 ||
        nominal_return_type_id !=
            cold_exact_return_type_id_from_signature(
                symbols, &symbols->functions[row])) {
        return 4;
    }
    int32_t joined = cold_require_published_exact_runtime_signature(
        symbols, row, cold_cstr_span("test_external_ptr_return"),
        0, NULL, NULL, NULL, cold_cstr_span("cstring"), false);
    if (joined != row ||
        symbols->functions[row].return_exact_type_id !=
            nominal_return_type_id ||
        !span_eq(symbols->functions[row].ret, "ptr")) {
        return 5;
    }

    require_compatible(symbols, "ptr", "cstring");
    require_compatible(symbols, "cstring", "ptr");
    require_compatible(symbols, "ptr", "ptr");
    require_compatible(symbols, "int32", "int32");
    require_compatible(symbols, "void", "void");

    require_incompatible(symbols, "ptr", "int64");
    require_incompatible(symbols, "int64", "cstring");
    require_incompatible(symbols, "ptr", "int32");
    require_incompatible(symbols, "int32", "int64");
    require_incompatible(symbols, "int64", "uint64");
    require_incompatible(symbols, "void", "ptr");
    require_incompatible(symbols, "cstring", "void");

    cold_compilation_context_release(context, false);
    arena_release(arena);
    puts("cold_external_runtime_return_identity=pass mutations=7 nominal_type_id=stable");
    return 0;
}
