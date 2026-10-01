#define main cheng_cold_embedded_main
#define arena_release cold_embedded_arena_release
#include "../bootstrap/cheng_cold.c"
#undef arena_release
#undef main
#include "cold_context_harness.h"

/* Gate fixtures use stack Arena owners.  Release their registered slabs and
   mmap-backed pages exactly like production, but never munmap the stack
   owner itself. */
static void gate_stack_arena_release(Arena *arena) {
    if (!arena) return;
    cold_mm_arena_release_begin_hook(arena);
    arena_cleanup_release_all(arena);
    if (arena->owned_slab_bytes != 0 || arena->owned_symbol_bytes != 0)
        die("gate stack arena retained tracked storage");
    ArenaPage *page = arena->head;
    while (page) {
        ArenaPage *next = page->next;
        size_t payload = (size_t)(page->end - page->base);
        if (munmap(page, sizeof(ArenaPage) + payload) != 0)
            die("gate stack arena page release failed");
        page = next;
    }
    cold_mm_arena_release_end_hook(arena);
    memset(arena, 0, sizeof(*arena));
}

#define arena_release gate_stack_arena_release

static void gate_fail(const char *message) {
    fprintf(stderr, "cold_body_op_schema_differential_gate: %s\n", message);
    exit(1);
}

static uint64_t gate_hash_bytes(const void *data, size_t length) {
    const uint8_t *bytes = (const uint8_t *)data;
    uint64_t hash = UINT64_C(1469598103934665603);
    for (size_t i = 0; i < length; i++) {
        hash ^= bytes[i];
        hash *= UINT64_C(1099511628211);
    }
    return hash;
}

static uint64_t gate_schema_tuple_hash(
        int32_t mutation_kind, int32_t tuple_byte,
        uint8_t xor_mask) {
    uint64_t hash = UINT64_C(1469598103934665603);
    for (int32_t kind = BODY_OP_NOP;
         kind < COLD_BODY_OP_SCHEMA_COUNT; kind++) {
        const ColdBodyOpSchema *schema =
            cold_body_op_schema(kind);
        uint8_t tuple[] = {
            (uint8_t)kind,
            schema->reads_a_slot ? 1u : 0u,
            schema->reads_b_slot ? 1u : 0u,
            schema->reads_c_slot ? 1u : 0u,
            schema->reads_dst_slot ? 1u : 0u,
            schema->writes_dst_slot ? 1u : 0u,
            schema->mutation_referent_mask,
            schema->has_side_effect ? 1u : 0u,
            schema->target_support_mask,
        };
        if (kind == mutation_kind) {
            if (tuple_byte < 1 ||
                tuple_byte >= (int32_t)sizeof(tuple) ||
                xor_mask == 0) {
                gate_fail("invalid schema mutation coordinate");
            }
            tuple[tuple_byte] ^= xor_mask;
        }
        for (size_t byte = 0; byte < sizeof(tuple); byte++) {
            hash ^= tuple[byte];
            hash *= UINT64_C(1099511628211);
        }
    }
    return hash;
}

static int32_t gate_check_schema_mutation_sensitivity(
        uint64_t baseline) {
    int32_t mutations = 0;
    for (int32_t kind = BODY_OP_NOP;
         kind < COLD_BODY_OP_SCHEMA_COUNT; kind++) {
        /* Four physical read roles plus value-dst write. */
        for (int32_t tuple_byte = 1;
             tuple_byte <= 5; tuple_byte++) {
            if (gate_schema_tuple_hash(
                    kind, tuple_byte, 1u) == baseline) {
                gate_fail("schema read/write mutation escaped tuple hash");
            }
            mutations++;
        }
        /* Every possible mutation-target operand is independently killed. */
        for (uint8_t bit = COLD_BODY_ACCESS_DST;
             bit <= COLD_BODY_ACCESS_C; bit <<= 1) {
            if (gate_schema_tuple_hash(kind, 6, bit) == baseline) {
                gate_fail("schema mutation-target change escaped tuple hash");
            }
            mutations++;
        }
        if (gate_schema_tuple_hash(kind, 7, 1u) == baseline) {
            gate_fail("schema effect mutation escaped tuple hash");
        }
        mutations++;
        /* Each backend capability bit is a separate admission fact. */
        for (uint8_t bit = COLD_BODY_TARGET_A64;
             bit <= COLD_BODY_TARGET_WASM; bit <<= 1) {
            if (gate_schema_tuple_hash(kind, 8, bit) == baseline) {
                gate_fail("schema capability mutation escaped tuple hash");
            }
            mutations++;
        }
    }
    if (mutations != COLD_BODY_OP_SCHEMA_COUNT * 14)
        gate_fail("schema mutation matrix is incomplete");
    return mutations;
}

static int32_t GateSchemaMutationCount = 0;

static void gate_check_schema(void) {
    cold_validate_body_op_schema();
    if (COLD_BODY_OP_SCHEMA_COUNT !=
        BODY_OP_MAKE_SEQ_STR + 1)
        gate_fail("schema count does not cover every declared BodyIR op");
    uint64_t hash = gate_schema_tuple_hash(-1, 1, 1u);
    if (hash != UINT64_C(0x1822d1817c6c432a)) {
        fprintf(stderr, "schema_tuple_hash=0x%016llx\n",
                (unsigned long long)hash);
        gate_fail("full 172-row operand/effect tuple changed");
    }
    GateSchemaMutationCount =
        gate_check_schema_mutation_sensitivity(hash);
}

static void gate_check_dse_and_cross_block(void) {
    Arena arena = {0};
    Symbols symbols = {0};
    BodyIR *body = body_new(&arena);
    int32_t source = body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    int32_t start = body_slot(body, SLOT_I32, 4);
    int32_t length = body_slot(body, SLOT_I32, 4);
    int32_t result = body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    int32_t block = body_block(body);
    body_op(body, BODY_OP_I32_CONST, length, 7, 0);
    body_op3(body, BODY_OP_STR_SLICE, result, source, start, length);
    int32_t term = body_term(body, BODY_TERM_RET, result, 0, 0, -1, -1);
    body_end_block(body, block, term);
    cold_opt_pass(body, &symbols);
    if (body->op_kind[0] != BODY_OP_I32_CONST ||
        body->op_kind[1] != BODY_OP_STR_SLICE)
        gate_fail("DSE removed the c-slot producer chain");
    arena_release(&arena);

    Arena cross_arena = {0};
    body = body_new(&cross_arena);
    source = body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    start = body_slot(body, SLOT_I32, 4);
    length = body_slot(body, SLOT_I32, 4);
    result = body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    int32_t entry = body_block(body);
    body_op(body, BODY_OP_I32_CONST, length, 999, 0);
    int32_t use = body_block(body);
    term = body_term(body, BODY_TERM_BR, 0, 0, 0, use, -1);
    body_end_block(body, entry, term);
    body_reopen_block(body, use);
    body_op3(body, BODY_OP_STR_SLICE, result, source, start, length);
    term = body_term(body, BODY_TERM_RET, result, 0, 0, -1, -1);
    body_end_block(body, use, term);
    int32_t safe = 0;
    int32_t unsafe = 0;
    cold_cross_block_slot_analysis(body, &symbols, &safe, &unsafe);
    if (safe != 3 || unsafe != 1)
        gate_fail("cross-block analysis did not observe the c-slot read");
    arena_release(&cross_arena);
}

static void gate_check_observable_effect_dse(void) {
    static const int32_t observable_effects[] = {
        BODY_OP_CLOSURE_CALL,
        BODY_OP_HEAP_ALLOC,
        BODY_OP_HEAP_FREE,
        BODY_OP_SEQ_I32_ADD,
        BODY_OP_SEQ_STR_ADD,
        BODY_OP_SEQ_OPAQUE_ADD,
        BODY_OP_SEQ_OPAQUE_REMOVE,
        BODY_OP_MANAGED_REF_MOVE_REPLACE,
    };
    for (size_t i = 0;
         i < sizeof(observable_effects) / sizeof(observable_effects[0]); i++) {
        Arena arena = {0};
        Symbols symbols = {0};
        BodyIR *body = body_new(&arena);
        int32_t dst = body_slot(body, SLOT_PTR, 8);
        int32_t a = body_slot(body, SLOT_PTR, 8);
        int32_t b = body_slot(body, SLOT_I32, 4);
        int32_t c = body_slot(body, SLOT_I32, 4);
        body_op3(body, observable_effects[i], dst, a, b, c);
        cold_opt_pass(body, &symbols);
        if (body->op_kind[0] != observable_effects[i])
            gate_fail("DSE removed an observable call/allocation/sequence mutation");
        arena_release(&arena);
    }
}

static BodyIR *gate_body_for_c_op(Arena *arena, int32_t kind,
                                  int32_t *c_first, int32_t *c_second) {
    BodyIR *body = body_new(arena);
    int32_t dst_kind = SLOT_I32;
    int32_t dst_size = 4;
    int32_t a_kind = SLOT_PTR;
    int32_t a_size = 8;
    int32_t b_kind = SLOT_I32;
    int32_t b_size = 4;
    if (kind == BODY_OP_STR_SLICE) {
        dst_kind = SLOT_STR;
        dst_size = COLD_STR_SLOT_SIZE;
        a_kind = SLOT_STR;
        a_size = COLD_STR_SLOT_SIZE;
    } else if (kind == BODY_OP_READ || kind == BODY_OP_WRITE_RAW ||
               kind == BODY_OP_WRITE_BYTES) {
        a_kind = SLOT_I32;
        a_size = 4;
        b_kind = kind == BODY_OP_WRITE_BYTES ? SLOT_OBJECT : SLOT_PTR;
        b_size = kind == BODY_OP_WRITE_BYTES ? 16 : 8;
    } else if (kind == BODY_OP_ATOMIC_CAS_I32) {
        a_kind = SLOT_PTR;
        a_size = 8;
    } else if (kind == BODY_OP_BYTES_SET) {
        a_kind = SLOT_OBJECT;
        a_size = 16;
    } else if (kind == BODY_OP_SELECT) {
        dst_kind = SLOT_I64;
        dst_size = 8;
        a_kind = SLOT_I32;
        a_size = 4;
        b_kind = SLOT_I64;
        b_size = 8;
    }
    int32_t dst = body_slot(body, dst_kind, dst_size);
    int32_t a = body_slot(body, a_kind, a_size);
    int32_t b = body_slot(body, b_kind, b_size);
    *c_first = body_slot(body,
        kind == BODY_OP_SELECT ? SLOT_I64 : SLOT_I32,
        kind == BODY_OP_SELECT ? 8 : 4);
    *c_second = body_slot(body,
        kind == BODY_OP_SELECT ? SLOT_I64 : SLOT_I32,
        kind == BODY_OP_SELECT ? 8 : 4);
    body_op3(body, kind, dst, a, b, *c_first);
    return body;
}

static uint64_t gate_emit_rv64_hash(int32_t kind, bool second_c) {
    Arena arena = {0};
    int32_t c_first = -1;
    int32_t c_second = -1;
    BodyIR *body = gate_body_for_c_op(&arena, kind, &c_first, &c_second);
    body->op_c[0] = second_c ? c_second : c_first;
    Code *code = code_new(&arena, 128);
    Symbols symbols = {0};
    FunctionPatchList patches = {0};
    patches.arena = &arena;
    rv64_codegen_op(code, body, &symbols, &patches, 0);
    uint64_t hash = gate_hash_bytes(code->words,
                                    (size_t)code->count * sizeof(uint32_t));
    arena_release(&arena);
    return hash;
}

static uint64_t gate_emit_wasm_hash(int32_t kind, bool second_c) {
    Arena arena = {0};
    int32_t c_first = -1;
    int32_t c_second = -1;
    BodyIR *body = gate_body_for_c_op(&arena, kind, &c_first, &c_second);
    body->op_c[0] = second_c ? c_second : c_first;
    WasmCode wasm;
    wasm_init(&wasm, 256);
    Symbols symbols = {0};
    wasm_codegen_op(&wasm, body, &symbols, NULL, 0, NULL);
    uint64_t hash = gate_hash_bytes(wasm.buf, (size_t)wasm.len);
    free(wasm.buf);
    arena_release(&arena);
    return hash;
}

static void gate_check_codegen_c_consumers(void) {
    static const int32_t rv64_supported[] = {
        BODY_OP_STR_SLICE,
        BODY_OP_READ,
        BODY_OP_ATOMIC_CAS_I32,
        BODY_OP_WRITE_RAW,
        BODY_OP_WRITE_BYTES,
        BODY_OP_COPY_RAW,
        BODY_OP_SET_RAW,
        BODY_OP_BYTES_SET,
        BODY_OP_SELECT,
    };
    static const int32_t wasm_supported[] = {
        BODY_OP_STR_SLICE,
        BODY_OP_ATOMIC_CAS_I32,
        BODY_OP_COPY_RAW,
        BODY_OP_SET_RAW,
        BODY_OP_BYTES_SET,
        BODY_OP_SELECT,
    };
    for (size_t i = 0; i < sizeof(rv64_supported) / sizeof(rv64_supported[0]); i++) {
        int32_t kind = rv64_supported[i];
        if (gate_emit_rv64_hash(kind, false) == gate_emit_rv64_hash(kind, true))
            gate_fail("RV64 supported op does not consume its c-slot");
    }
    for (size_t i = 0; i < sizeof(wasm_supported) / sizeof(wasm_supported[0]); i++) {
        int32_t kind = wasm_supported[i];
        if (gate_emit_wasm_hash(kind, false) == gate_emit_wasm_hash(kind, true))
            gate_fail("WASM supported op does not consume its c-slot");
    }

    Arena arena = {0};
    int32_t c_first = -1;
    int32_t c_second = -1;
    BodyIR *cas = gate_body_for_c_op(
        &arena, BODY_OP_ATOMIC_CAS_I32, &c_first, &c_second);
    Code *code = code_new(&arena, 32);
    Symbols symbols = {0};
    FunctionPatchList patches = {0};
    patches.arena = &arena;
    rv64_codegen_op(code, cas, &symbols, &patches, 0);
    int32_t off_dst = cas->slot_offset[cas->op_dst[0]];
    if (code->count != 11 ||
        code->words[4] != rv_bne(RV_T3, RV_T1, 24) ||
        code->words[6] != rv_bne(RV_T4, RV_ZERO, -12) ||
        code->words[9] != rv_jal(RV_ZERO, 8) ||
        code->words[10] != rv_sw(RV_ZERO, RV_SP, (int16_t)off_dst))
        gate_fail("RV64 CAS compare-fail/retry control flow changed");
    arena_release(&arena);
}

static void gate_check_deferred_type_size_template_admission(void) {
    Arena arena = {0};
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, &arena);
    Symbols *symbols = compilation.symbols;
    int32_t fn_index = symbols_add_fn(
        symbols,
        cold_cstr_span("generic_type_size_template"),
        0, NULL, NULL, 0, cold_cstr_span("int32"));
    if (fn_index < 0) gate_fail("generic template symbol registration failed");
    Span generic_name = cold_cstr_span("T");
    cold_function_generic_names_set(
        symbols, &symbols->functions[fn_index],
        &generic_name, 1);
    symbols->functions[fn_index].template_index = -1;
    BodyIR *body = body_new(&arena);
    int32_t result = body_slot(body, SLOT_I32, 4);
    int32_t type_index = body_string_literal(body, cold_cstr_span("T"));
    int32_t block = body_block(body);
    body_op3(body, BODY_OP_TYPE_SIZE, result, type_index,
             COLD_TYPE_SIZE_MODE_SIZEOF, 0);
    int32_t term = body_term(body, BODY_TERM_RET, result, 0, 0, -1, -1);
    body_end_block(body, block, term);
    if (!cold_body_codegen_ready(symbols, fn_index, body))
        gate_fail("generic template deferred type-size was not retained");
    cold_harness_compilation_end(&compilation, false);
    arena_release(&arena);
}

static int32_t gate_add_owned_fixture_function(
        Symbols *symbols, const char *name, const char *return_type) {
    int32_t function = symbols_add_fn(
        symbols, cold_cstr_span(name), 0, NULL, NULL, 0,
        cold_cstr_span(return_type));
    if (function < 0)
        gate_fail("fixture function registration failed");
    symbols->functions[function].result_ownership_summary =
        COLD_RESULT_OWNERSHIP_OWNED;
    return function;
}

static void gate_check_exact_block_op_coverage(void) {
    Arena exact_arena = {0};
    ColdHarnessCompilation exact_compilation;
    cold_harness_compilation_begin(
        &exact_compilation, &exact_arena);
    Symbols *exact_symbols = exact_compilation.symbols;
    BodyIR *exact = body_new(&exact_arena);
    exact->producer_function_row = gate_add_owned_fixture_function(
        exact_symbols, "exact_block_coverage", "int32");
    int32_t entry = body_block(exact);
    int32_t next = body_block(exact);
    int32_t value = body_slot(exact, SLOT_I32, 4);
    body_op(exact, BODY_OP_I32_CONST, value, 1, 0);
    int32_t term = body_term(
        exact, BODY_TERM_BR, -1, -1, 0, next, -1);
    body_end_block(exact, entry, term);
    body_reopen_block(exact, next);
    body_op(exact, BODY_OP_I32_CONST, value, 2, 0);
    term = body_term(
        exact, BODY_TERM_RET, value, 0, 0, -1, -1);
    body_end_block(exact, next, term);
    if (!cold_bodyir_exact_identity_schema_valid(
            exact, exact_symbols,
            "gate-exact-block-coverage")) {
        gate_fail("exact non-overlapping block ranges were rejected");
    }
    cold_harness_compilation_end(&exact_compilation, false);
    arena_release(&exact_arena);

    Arena orphan_arena = {0};
    ColdHarnessCompilation orphan_compilation;
    cold_harness_compilation_begin(
        &orphan_compilation, &orphan_arena);
    Symbols *orphan_symbols = orphan_compilation.symbols;
    BodyIR *orphan = body_new(&orphan_arena);
    orphan->producer_function_row = gate_add_owned_fixture_function(
        orphan_symbols, "orphan_block_range", "int32");
    int32_t block = body_block(orphan);
    value = body_slot(orphan, SLOT_I32, 4);
    body_op(orphan, BODY_OP_I32_CONST, value, 1, 0);
    term = body_term(
        orphan, BODY_TERM_RET, value, 0, 0, -1, -1);
    body_end_block(orphan, block, term);
    /* This is the exact historical mutation: reopening the same join after
       an emitted row resets its single contiguous range and orphans that row. */
    body_reopen_block(orphan, block);
    body_op(orphan, BODY_OP_I32_CONST, value, 2, 0);
    term = body_term(
        orphan, BODY_TERM_RET, value, 0, 0, -1, -1);
    body_end_block(orphan, block, term);
    if (cold_bodyir_exact_identity_schema_valid(
            orphan, orphan_symbols,
            "gate-orphan-block-range")) {
        gate_fail("orphan op row escaped exact block-range validation");
    }
    cold_harness_compilation_end(&orphan_compilation, false);
    arena_release(&orphan_arena);
}

static int32_t gate_emit_plain_string_definition_into(
        BodyIR *body, int32_t slot, const char *text) {
    body_slot_set_type(body, slot, cold_cstr_span("str"));
    int32_t literal =
        body_string_literal(body, cold_cstr_span(text));
    int32_t definition =
        body_op(body, BODY_OP_STR_LITERAL, slot, literal, 0);
    ColdExprResult result;
    cold_publish_plain_string_literal_producer(
        body, slot, definition, &result);
    if (result.value_def_op_id != definition ||
        result.slot != slot ||
        result.exact_type_id < 0) {
        gate_fail("string definition fixture lost exact authority");
    }
    return definition;
}

static int32_t gate_emit_plain_string_definition(
        BodyIR *body, const char *text) {
    int32_t slot =
        body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    return gate_emit_plain_string_definition_into(
        body, slot, text);
}

static int32_t gate_add_managed_string_function(
        Symbols *symbols, const char *name, int32_t arity) {
    int32_t param_kinds[COLD_MAX_I32_PARAMS];
    int32_t param_sizes[COLD_MAX_I32_PARAMS];
    Span param_types[COLD_MAX_I32_PARAMS];
    if (arity < 0 || arity > COLD_MAX_I32_PARAMS)
        gate_fail("managed string fixture arity is invalid");
    for (int32_t i = 0; i < arity; i++) {
        param_kinds[i] = SLOT_STR_REF;
        param_sizes[i] = 8;
        param_types[i] = cold_cstr_span("var str");
    }
    return symbols_add_fn(
        symbols, cold_cstr_span(name), arity,
        param_kinds, param_sizes, param_types,
        cold_cstr_span("int32"));
}

static int32_t gate_emit_borrow_projection(
        BodyIR *body, int32_t source_def);

static int32_t gate_emit_borrowed_string_definition(
        BodyIR *body, const char *text) {
    int32_t owner =
        gate_emit_plain_string_definition(body, text);
    return gate_emit_borrow_projection(body, owner);
}

static int32_t gate_count_exact_place(
        const BodyIR *body, int32_t start, int32_t place) {
    int32_t count = 0;
    for (int32_t op = start; op < body->op_count; op++) {
        if (body->op_value_def_place_kind[op] == place)
            count++;
    }
    return count;
}

static void gate_require_three_way_merge_semantics(
        BodyIR *body, const ColdExactLocalMergeRequest requests[3],
        int32_t shared_copy_start) {
    static const int32_t expected_merge_ownership[3] = {
        COLD_EXPR_OWN_MOVE,
        COLD_EXPR_OWN_BORROW_SHARED,
        COLD_EXPR_OWN_MOVE,
    };
    static const int32_t expected_first_input_ownership[3] = {
        COLD_EXPR_OWN_MOVE,
        COLD_EXPR_OWN_BORROW_SHARED,
        COLD_EXPR_OWN_MOVE,
    };
    static const int32_t expected_second_input_ownership[3] = {
        COLD_EXPR_OWN_MOVE,
        COLD_EXPR_OWN_BORROW_SHARED,
        COLD_EXPR_OWN_MOVE,
    };
    for (int32_t i = 0; i < 3; i++) {
        int32_t first_input = requests[i].first_input_def;
        int32_t second_input = requests[i].second_input_def;
        int32_t merge = requests[i].merge_def;
        if (first_input < 0 || second_input < 0 || merge < 0 ||
            body->op_value_def_ownership[first_input] !=
                expected_first_input_ownership[i] ||
            body->op_value_def_ownership[second_input] !=
                expected_second_input_ownership[i] ||
            body->op_value_def_ownership[merge] !=
                expected_merge_ownership[i]) {
            gate_fail("managed merge ownership mode is not canonical");
        }
    }
    if (body->op_value_def_consume_op_index_plus_one[
            requests[0].first_def] == 0 ||
        body->op_value_def_consume_op_index_plus_one[
            requests[0].second_def] == 0 ||
        body->op_value_def_consume_op_index_plus_one[
            requests[1].first_def] != 0 ||
        body->op_value_def_consume_op_index_plus_one[
            requests[1].second_def] != 0 ||
        body->op_value_def_consume_op_index_plus_one[
            requests[2].first_def] == 0 ||
        body->op_value_def_consume_op_index_plus_one[
            requests[2].second_def] != 0) {
        gate_fail("managed merge source consumption is not path exact");
    }
    if (gate_count_exact_place(
            body, shared_copy_start,
            COLD_EXPR_PLACE_SHARED_COPY) != 1) {
        gate_fail("mixed merge did not lift exactly one borrowed edge");
    }
}

static void gate_check_multi_managed_cfg_merge(void) {
    Arena arena = {0};
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, &arena);
    Symbols *symbols = compilation.symbols;
    int32_t function = gate_add_managed_string_function(
        symbols, "MultiManagedCfgMergeGate", 0);
    if (function < 0)
        gate_fail("multi-managed merge function registration failed");
    BodyIR *body = body_new(&arena);
    body->producer_function_row = function;
    body->debug_name =
        cold_cstr_span("multi_managed_cfg_merge_gate");
    Parser parser = cold_parser_issue_legacy_span(
        symbols, cold_cstr_span("multi-managed-cfg-merge"));

    int32_t entry_block = body_block(body);
    int32_t first = body_block(body);
    int32_t second = body_block(body);
    int32_t merge = body_block(body);
    int32_t predicate = body_slot(body, SLOT_I32, 4);
    int32_t zero = body_slot(body, SLOT_I32, 4);
    body_op(body, BODY_OP_I32_CONST, predicate, 1, 0);
    body_op(body, BODY_OP_I32_CONST, zero, 0, 0);
    int32_t entry_term = body_term(
        body, BODY_TERM_CBR, predicate, COND_NE, zero,
        first, second);
    body_end_block(body, entry_block, entry_term);
    body_reopen_block(body, first);
    Local locals[3];
    ColdExactLocalMergeRequest requests[3];
    memset(locals, 0, sizeof(locals));
    memset(requests, 0, sizeof(requests));
    static const char *names[3] = {"first", "second", "third"};
    static const char *first_values[3] = {"a", "b", "c"};
    static const char *second_values[3] = {"d", "e", "f"};
    for (int32_t i = 0; i < 3; i++) {
        requests[i].first_def =
            i == 1
                ? gate_emit_borrowed_string_definition(
                      body, "borrow-a")
                : gate_emit_plain_string_definition(
                      body, first_values[i]);
        locals[i].name = cold_cstr_span(names[i]);
        locals[i].kind = SLOT_STR;
        locals[i].slot =
            body->op_value_def_slot[
                requests[i].first_def];
        locals[i].value_def_op_id =
            requests[i].first_def;
        requests[i].local = &locals[i];
        requests[i].destination_override = -1;
    }
    int32_t term = body_term(
        body, BODY_TERM_BR, -1, -1, 0, merge, -1);
    body_end_block(body, first, term);

    body_reopen_block(body, second);
    for (int32_t i = 0; i < 3; i++) {
        requests[i].second_def =
            i == 0
                ? gate_emit_plain_string_definition(
                      body, second_values[i])
                : gate_emit_borrowed_string_definition(
                      body, i == 1 ? "borrow-b"
                                   : "borrow-c");
    }
    term = body_term(
        body, BODY_TERM_BR, -1, -1, 0, merge, -1);
    body_end_block(body, second, term);

    body_reopen_block(body, merge);
    int32_t shared_copy_start = body->op_count;
    int32_t final_first = -1;
    int32_t final_second = -1;
    cold_merge_exact_local_defs_batch(
        &parser, body, requests, 3,
        first, second,
        &final_first, &final_second);
    gate_require_three_way_merge_semantics(
        body, requests, shared_copy_start);
    for (int32_t i = 0; i < 3; i++) {
        if (requests[i].first_input_def < 0 ||
            requests[i].second_input_def < 0 ||
            requests[i].merge_def < 0 ||
            locals[i].value_def_op_id !=
                requests[i].merge_def ||
            body->op_value_def_place_kind[
                requests[i].merge_def] !=
                COLD_EXPR_PLACE_CFG_MERGE ||
            !cold_exact_phi_input_sources_definition(
                body, requests[i].first_input_def,
                requests[i].first_def) ||
            !cold_exact_phi_input_sources_definition(
                body, requests[i].second_input_def,
                requests[i].second_def)) {
            gate_fail("multi-managed merge identity was not committed");
        }
    }
    if (!cold_cfg_predecessor_reaches_merge(
            body, final_first, merge) ||
        !cold_cfg_predecessor_reaches_merge(
            body, final_second, merge)) {
        gate_fail("multi-managed merge edge chain is incomplete");
    }
    int32_t result = body_slot(body, SLOT_I32, 4);
    body_op(body, BODY_OP_I32_CONST, result, 0, 0);
    term = body_term(
        body, BODY_TERM_RET, result, 0, 0, -1, -1);
    body_end_block(body, merge, term);
    if (!cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "gate-multi-managed-cfg-merge")) {
        gate_fail("multi-managed merge failed exact schema");
    }

    int32_t borrowed_merge = requests[1].merge_def;
    body->op_value_def_ownership[borrowed_merge] =
        COLD_EXPR_OWN_MOVE;
    if (cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "gate-borrow-merge-ownership-mutation")) {
        gate_fail("borrowed merge ownership mutation escaped validation");
    }
    body->op_value_def_ownership[borrowed_merge] =
        COLD_EXPR_OWN_BORROW_SHARED;

    int32_t saved_start = body->block_op_start[merge];
    int32_t saved_count = body->block_op_count[merge];
    int32_t last_merge = requests[2].merge_def;
    body->block_op_start[merge] = last_merge;
    body->block_op_count[merge] =
        saved_start + saved_count - last_merge;
    if (cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "gate-multi-managed-orphan-mutation")) {
        gate_fail("multi-managed orphan mutation escaped validation");
    }
    body->block_op_start[merge] = saved_start;
    body->block_op_count[merge] = saved_count;
    cold_harness_compilation_end(&compilation, false);
    arena_release(&arena);
}

static int32_t gate_emit_borrow_projection(
        BodyIR *body, int32_t source_def) {
    int32_t source_slot =
        body->op_value_def_slot[source_def];
    int32_t destination =
        body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    body_slot_set_type(
        body, destination, cold_cstr_span("str"));
    int32_t definition = body_op(
        body, BODY_OP_COPY_COMPOSITE,
        destination, source_slot, 0);
    body->op_value_def_slot[definition] = destination;
    body->op_value_def_exact_type_id[definition] =
        body->op_value_def_exact_type_id[source_def];
    body->op_value_def_producer_function_row[definition] =
        body->producer_function_row;
    body->op_value_def_place_kind[definition] =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->op_value_def_ownership[definition] =
        COLD_EXPR_OWN_BORROW_SHARED;
    body->op_value_def_origin_id[definition] = source_def;
    body->slot_exact_type_id[destination] =
        body->op_value_def_exact_type_id[source_def];
    body->slot_place_kind[destination] =
        COLD_EXPR_PLACE_BORROW_PROJECTION;
    body->slot_origin_id[destination] = source_def;
    body->slot_managed_storage_kind[destination] =
        COLD_MANAGED_STORAGE_STR;
    body->op_exact_source_a_value_def_op_id[definition] =
        source_def;
    return definition;
}

static int32_t gate_emit_forward_origin_consumer(
        BodyIR *body, int32_t source_slot, int32_t place) {
    int32_t destination =
        body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    body_slot_set_type(
        body, destination, cold_cstr_span("str"));
    int32_t definition = body_op(
        body, BODY_OP_COPY_COMPOSITE,
        destination, source_slot, 0);
    body->op_value_def_slot[definition] = destination;
    body->op_value_def_producer_function_row[definition] =
        body->producer_function_row;
    body->op_value_def_place_kind[definition] = place;
    body->op_value_def_ownership[definition] =
        place == COLD_EXPR_PLACE_BORROW_PROJECTION
            ? COLD_EXPR_OWN_BORROW_SHARED
            : COLD_EXPR_OWN_MOVE;
    body->slot_place_kind[destination] = place;
    body->slot_managed_storage_kind[destination] =
        COLD_MANAGED_STORAGE_STR;
    return definition;
}

static void gate_bind_forward_origin(
        BodyIR *body, int32_t definition, int32_t origin) {
    int32_t destination =
        body->op_value_def_slot[definition];
    body->op_value_def_exact_type_id[definition] =
        body->op_value_def_exact_type_id[origin];
    body->op_value_def_origin_id[definition] = origin;
    body->slot_exact_type_id[destination] =
        body->op_value_def_exact_type_id[origin];
    body->slot_origin_id[destination] = origin;
    body->op_exact_source_a_value_def_op_id[definition] = origin;
}

static void gate_check_cfg_dominating_forward_origins(void) {
    Arena arena = {0};
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, &arena);
    Symbols *symbols = compilation.symbols;
    BodyIR *body = body_new(&arena);
    body->producer_function_row = gate_add_owned_fixture_function(
        symbols, "cfg_dominating_forward_origins", "str");
    body->debug_name =
        cold_cstr_span("cfg_dominating_forward_origins");
    int32_t source_slot =
        body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    int32_t dominator = body_block(body);
    int32_t consumer = body_block(body);

    body_reopen_block(body, consumer);
    int32_t projection = gate_emit_forward_origin_consumer(
        body, source_slot,
        COLD_EXPR_PLACE_BORROW_PROJECTION);
    int32_t shared_copy = gate_emit_forward_origin_consumer(
        body, source_slot, COLD_EXPR_PLACE_SHARED_COPY);
    int32_t term = body_term(
        body, BODY_TERM_RET,
        body->op_value_def_slot[shared_copy],
        0, 0, -1, -1);
    body_end_block(body, consumer, term);

    body_reopen_block(body, dominator);
    int32_t origin = gate_emit_plain_string_definition_into(
        body, source_slot, "dominating-forward-origin");
    term = body_term(
        body, BODY_TERM_BR, -1, -1, 0, consumer, -1);
    body_end_block(body, dominator, term);
    gate_bind_forward_origin(body, projection, origin);
    gate_bind_forward_origin(body, shared_copy, origin);

    if (!(origin > projection && origin > shared_copy) ||
        !cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "gate-cfg-dominating-forward-origins")) {
        gate_fail("CFG-dominating forward origin was rejected");
    }
    cold_harness_compilation_end(&compilation, false);
    arena_release(&arena);
}

static void gate_expect_same_block_forward_origin_rejected(
        int32_t place, const char *phase) {
    Arena arena = {0};
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, &arena);
    Symbols *symbols = compilation.symbols;
    BodyIR *body = body_new(&arena);
    body->producer_function_row = gate_add_owned_fixture_function(
        symbols, "same_block_forward_origin", "str");
    body->debug_name =
        cold_cstr_span("same_block_forward_origin");
    int32_t source_slot =
        body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    int32_t block = body_block(body);
    int32_t consumer = gate_emit_forward_origin_consumer(
        body, source_slot, place);
    int32_t origin = gate_emit_plain_string_definition_into(
        body, source_slot, "same-block-forward-origin");
    gate_bind_forward_origin(body, consumer, origin);
    int32_t term = body_term(
        body, BODY_TERM_RET,
        body->op_value_def_slot[consumer],
        0, 0, -1, -1);
    body_end_block(body, block, term);
    if (origin <= consumer ||
        cold_bodyir_exact_identity_schema_valid(
            body, symbols, phase)) {
        gate_fail("same-block forward origin escaped validation");
    }
    cold_harness_compilation_end(&compilation, false);
    arena_release(&arena);
}

static void gate_expect_nondominating_forward_origin_rejected(
        int32_t place, const char *phase) {
    Arena arena = {0};
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, &arena);
    Symbols *symbols = compilation.symbols;
    BodyIR *body = body_new(&arena);
    body->producer_function_row = gate_add_owned_fixture_function(
        symbols, "nondominating_forward_origin", "str");
    body->debug_name =
        cold_cstr_span("nondominating_forward_origin");
    int32_t source_slot =
        body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    int32_t entry = body_block(body);
    int32_t consumer_block = body_block(body);
    int32_t origin_block = body_block(body);
    int32_t exit = body_block(body);

    body_reopen_block(body, entry);
    int32_t predicate = body_slot(body, SLOT_I32, 4);
    body_op(body, BODY_OP_I32_CONST, predicate, 1, 0);
    int32_t zero = body_slot(body, SLOT_I32, 4);
    body_op(body, BODY_OP_I32_CONST, zero, 0, 0);
    int32_t term = body_term(
        body, BODY_TERM_CBR, predicate, COND_NE, zero,
        consumer_block, origin_block);
    body_end_block(body, entry, term);

    body_reopen_block(body, consumer_block);
    int32_t consumer = gate_emit_forward_origin_consumer(
        body, source_slot, place);
    term = body_term(
        body, BODY_TERM_BR, -1, -1, 0, exit, -1);
    body_end_block(body, consumer_block, term);

    body_reopen_block(body, origin_block);
    int32_t origin = gate_emit_plain_string_definition_into(
        body, source_slot, "nondominating-forward-origin");
    term = body_term(
        body, BODY_TERM_BR, -1, -1, 0, exit, -1);
    body_end_block(body, origin_block, term);
    gate_bind_forward_origin(body, consumer, origin);

    body_reopen_block(body, exit);
    int32_t result = body_slot(body, SLOT_I32, 4);
    body_op(body, BODY_OP_I32_CONST, result, 0, 0);
    term = body_term(
        body, BODY_TERM_RET, result, 0, 0, -1, -1);
    body_end_block(body, exit, term);
    if (origin <= consumer ||
        cold_bodyir_exact_identity_schema_valid(
            body, symbols, phase)) {
        gate_fail("non-dominating forward origin escaped validation");
    }
    cold_harness_compilation_end(&compilation, false);
    arena_release(&arena);
}

static void gate_check_forward_origin_dominance(void) {
    static const int32_t places[2] = {
        COLD_EXPR_PLACE_BORROW_PROJECTION,
        COLD_EXPR_PLACE_SHARED_COPY,
    };
    static const char *same_block_phases[2] = {
        "gate-same-block-forward-borrow",
        "gate-same-block-forward-share",
    };
    static const char *nondominating_phases[2] = {
        "gate-nondominating-forward-borrow",
        "gate-nondominating-forward-share",
    };
    gate_check_cfg_dominating_forward_origins();
    for (int32_t i = 0; i < 2; i++) {
        gate_expect_same_block_forward_origin_rejected(
            places[i], same_block_phases[i]);
        gate_expect_nondominating_forward_origin_rejected(
            places[i], nondominating_phases[i]);
    }
}

static void gate_check_three_managed_loop_phi(void) {
    Arena arena = {0};
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, &arena);
    Symbols *symbols = compilation.symbols;
    int32_t function = gate_add_managed_string_function(
        symbols, "ThreeManagedLoopPhiGate", 0);
    if (function < 0)
        gate_fail("managed loop function registration failed");
    BodyIR *body = body_new(&arena);
    body->producer_function_row = function;
    body->debug_name =
        cold_cstr_span("three_managed_loop_phi_gate");
    Parser parser = cold_parser_issue_legacy_span(
        symbols, cold_cstr_span("three-managed-loop-phi"));

    int32_t preheader = body_block(body);
    int32_t condition = body_block(body);
    int32_t backedge = body_block(body);
    int32_t exit = body_block(body);
    Local local_rows[3];
    Locals locals = {
        .items = local_rows,
        .count = 3,
        .cap = 3,
        .arena = &arena,
    };
    ColdLocalValueState entry[3];
    ColdLocalValueState next[3];
    memset(local_rows, 0, sizeof(local_rows));
    memset(entry, 0, sizeof(entry));
    memset(next, 0, sizeof(next));
    static const char *names[3] = {
        "loop_owned", "loop_borrowed", "loop_mixed"
    };
    for (int32_t i = 0; i < 3; i++) {
        int32_t definition =
            i == 1
                ? gate_emit_borrowed_string_definition(
                      body, "entry-borrowed")
                : gate_emit_plain_string_definition(
                      body, i == 0 ? "entry-owned"
                                   : "entry-mixed");
        local_rows[i].name = cold_cstr_span(names[i]);
        local_rows[i].kind = SLOT_STR;
        local_rows[i].slot =
            body->op_value_def_slot[definition];
        local_rows[i].value_def_op_id = definition;
        entry[i].slot = local_rows[i].slot;
        entry[i].value_def_op_id = definition;
    }
    body_branch_to(body, preheader, condition);

    body_reopen_block(body, condition);
    int32_t loop_op_start = body->op_count;
    int32_t projection =
        gate_emit_borrow_projection(
            body, entry[0].value_def_op_id);
    int32_t predicate = body_slot(body, SLOT_I32, 4);
    body_op(body, BODY_OP_I32_CONST, predicate, 1, 0);
    int32_t zero = body_slot(body, SLOT_I32, 4);
    body_op(body, BODY_OP_I32_CONST, zero, 0, 0);
    int32_t term = body_term(
        body, BODY_TERM_CBR, predicate, COND_NE, zero,
        backedge, exit);
    body_end_block(body, condition, term);

    body_reopen_block(body, backedge);
    for (int32_t i = 0; i < 3; i++) {
        int32_t definition =
            i == 0
                ? gate_emit_plain_string_definition(
                      body, "backedge-owned")
                : gate_emit_borrowed_string_definition(
                      body, i == 1 ? "backedge-borrowed"
                                   : "backedge-mixed");
        local_rows[i].slot =
            body->op_value_def_slot[definition];
        local_rows[i].value_def_op_id = definition;
        next[i].slot = local_rows[i].slot;
        next[i].value_def_op_id = definition;
    }
    int32_t loop_op_end = body->op_count;
    int32_t shared_copy_start = body->op_count;
    if (!cold_close_exact_managed_loop_phi(
            &parser, body, &locals, 3,
            entry, next, preheader, backedge,
            condition, loop_op_start, loop_op_end,
            0, 0)) {
        gate_fail("three-managed loop did not close exact phi");
    }
    static const int32_t expected_ownership[3] = {
        COLD_EXPR_OWN_MOVE,
        COLD_EXPR_OWN_BORROW_SHARED,
        COLD_EXPR_OWN_MOVE,
    };
    for (int32_t i = 0; i < 3; i++) {
        if (body->op_value_def_ownership[
                local_rows[i].value_def_op_id] !=
            expected_ownership[i]) {
            gate_fail("managed loop phi ownership mode is not canonical");
        }
    }
    if (gate_count_exact_place(
            body, shared_copy_start,
            COLD_EXPR_PLACE_SHARED_COPY) != 1) {
        gate_fail("managed loop mixed phi did not lift one borrow");
    }
    int32_t projection_slot =
        body->op_value_def_slot[projection];
    if (body->op_value_def_origin_id[projection] !=
            local_rows[0].value_def_op_id ||
        body->slot_origin_id[projection_slot] !=
            local_rows[0].value_def_op_id) {
        gate_fail("managed loop projection origin was not rebound atomically");
    }

    body_reopen_block(body, exit);
    int32_t result = body_slot(body, SLOT_I32, 4);
    body_op(body, BODY_OP_I32_CONST, result, 0, 0);
    term = body_term(
        body, BODY_TERM_RET, result, 0, 0, -1, -1);
    body_end_block(body, exit, term);
    if (!cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "gate-three-managed-loop-phi")) {
        gate_fail("three-managed loop phi failed exact schema");
    }
    int32_t saved_projection_origin =
        body->slot_origin_id[projection_slot];
    body->slot_origin_id[projection_slot] =
        entry[0].value_def_op_id;
    if (cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "gate-loop-projection-slot-origin-mutation")) {
        gate_fail("loop projection slot-origin mutation escaped validation");
    }
    body->slot_origin_id[projection_slot] =
        saved_projection_origin;
    cold_harness_compilation_end(&compilation, false);
    arena_release(&arena);
}

static void gate_invoke_concrete_deferred_type_size(int32_t mode,
                                                     bool valid_type_index) {
    Arena arena = {0};
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, &arena);
    Symbols *symbols = compilation.symbols;
    int32_t fn_index = symbols_add_fn(
        symbols,
        cold_cstr_span("concrete_type_size_leak"),
        0, NULL, NULL, 0, cold_cstr_span("int32"));
    if (fn_index < 0) gate_fail("concrete symbol registration failed");
    BodyIR *body = body_new(&arena);
    int32_t result = body_slot(body, SLOT_I32, 4);
    int32_t type_index = body_string_literal(
        body, cold_cstr_span("ConcreteWideValue"));
    int32_t block = body_block(body);
    body_op3(body, BODY_OP_TYPE_SIZE, result,
             valid_type_index ? type_index : type_index + 1,
             mode, 0);
    int32_t term = body_term(body, BODY_TERM_RET, result, 0, 0, -1, -1);
    body_end_block(body, block, term);
    (void)cold_body_codegen_ready(symbols, fn_index, body);
    gate_fail("concrete deferred type-size passed post-specialization admission");
}

static void gate_check_plain_composite_constructor_contract(void) {
    Arena arena = {0};
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, &arena);
    Symbols *symbols = compilation.symbols;
    ObjectDef *inner = symbols_add_object(
        symbols, cold_cstr_span("GatePlainBytes32"), 0);
    ObjectDef *outer = symbols_add_object(
        symbols, cold_cstr_span("GatePlainEnvelope"), 1);
    inner->slot_size = 32;
    outer->slot_size = 32;
    outer->fields[0].name = cold_cstr_span("payload");
    outer->fields[0].kind = SLOT_OBJECT;
    outer->fields[0].offset = 0;
    outer->fields[0].size = 32;
    outer->fields[0].type_name = inner->name;

    BodyIR *body = body_new(&arena);
    body->producer_function_row = gate_add_owned_fixture_function(
        symbols, "plain_composite_constructor_contract", "int32");
    int32_t block = body_block(body);
    int32_t inner_slot = body_slot(body, SLOT_OBJECT, 32);
    body_slot_set_type(body, inner_slot, inner->name);
    int32_t inner_definition = body_op3(
        body, BODY_OP_MAKE_COMPOSITE, inner_slot, 0, -1, 0);
    ColdExprResult inner_result;
    cold_publish_owned_managed_producer(
        body, symbols, inner_slot, SLOT_OBJECT,
        inner_definition, &inner_result);
    if (inner_result.ownership != COLD_EXPR_OWN_PLAIN ||
        inner_result.value_def_op_id != inner_definition) {
        gate_fail("plain nested composite did not publish exact PLAIN authority");
    }
    int32_t payload_row = body_call_arg_with_offset(
        body, inner_slot, 0);
    cold_bind_parsed_call_arg_authority(
        body, payload_row, &inner_result);
    int32_t outer_slot = body_slot(body, SLOT_OBJECT, 32);
    body_slot_set_type(body, outer_slot, outer->name);
    int32_t make_op = body_op3(
        body, BODY_OP_MAKE_COMPOSITE, outer_slot, 0,
        payload_row, 1);
    int32_t term = body_term(
        body, BODY_TERM_RET, -1, 0, 0, -1, -1);
    body_end_block(body, block, term);
    if (!cold_exact_object_constructor_tuple_valid(
            body, symbols, make_op)) {
        gate_fail("exact PLAIN nested composite constructor was rejected");
    }

    body->call_arg_value_def_op_id[payload_row] = -1;
    body->call_arg_place_kind[payload_row] = COLD_EXPR_PLACE_INVALID;
    body->call_arg_ownership[payload_row] = COLD_EXPR_OWN_INVALID;
    body->call_arg_origin_id[payload_row] = -1;
    if (cold_exact_object_constructor_tuple_valid(
            body, symbols, make_op)) {
        gate_fail("aggregate constructor sentinel escaped structural contract");
    }
    cold_bind_parsed_call_arg_authority(
        body, payload_row, &inner_result);
    body->call_arg_offset[payload_row] = 8;
    if (cold_exact_object_constructor_tuple_valid(
            body, symbols, make_op)) {
        gate_fail("aggregate constructor field offset mutation escaped contract");
    }
    cold_harness_compilation_end(&compilation, false);
    arena_release(&arena);
}

static void gate_check_plain_pointer_field_base_contract(void) {
    Arena arena = {0};
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, &arena);
    Symbols *symbols = compilation.symbols;
    ObjectDef *object = symbols_add_object(
        symbols, cold_cstr_span("GatePlainPointerBase"), 1);
    ObjectDef *other = symbols_add_object(
        symbols, cold_cstr_span("GateOtherPlainPointerBase"), 1);
    object->slot_size = 256;
    other->slot_size = 256;
    object->fields[0].name = cold_cstr_span("heads");
    object->fields[0].kind = SLOT_ARRAY_I32;
    object->fields[0].offset = 160;
    object->fields[0].size = 36;
    object->fields[0].type_name = cold_cstr_span("int32[9]");
    object->fields[0].array_len = 9;
    other->fields[0] = object->fields[0];
    other->fields[0].offset = 124;

    BodyIR *body = body_new(&arena);
    body->producer_function_row = gate_add_owned_fixture_function(
        symbols, "plain_pointer_field_base_contract", "int32");
    int32_t block = body_block(body);
    int32_t source = body_slot(body, SLOT_OPAQUE, 8);
    body_slot_set_type(
        body, source, cold_cstr_span("GatePlainPointerBase*"));
    if (!cold_plain_object_pointer_field_source_is_canonical(
            symbols, body, source, object)) {
        gate_fail("plain pointer field source was not canonical");
    }
    int32_t base =
        cold_materialize_plain_object_pointer_field_base(
            symbols, body, source, object);
    if (base == source || body->slot_kind[base] != SLOT_PTR ||
        !span_same(body->slot_type[base], body->slot_type[source]) ||
        body->op_kind[body->op_count - 1] != BODY_OP_COPY_I64 ||
        body->op_dst[body->op_count - 1] != base ||
        body->op_a[body->op_count - 1] != source ||
        !cold_exact_slot_authority_is_sentinel(body, base)) {
        gate_fail("plain pointer field base was not materialized canonically");
    }
    int32_t field = body_slot(body, SLOT_OBJECT_REF, 8);
    body_slot_set_type(
        body, field, cold_cstr_span("int32[9]"));
    body_slot_set_array_len(body, field, 9);
    int32_t projection = body_op3(
        body, BODY_OP_FIELD_REF, field, base, 160, 0);
    int32_t result = body_slot(body, SLOT_I32, 4);
    body_op(body, BODY_OP_I32_CONST, result, 0, 0);
    int32_t term = body_term(
        body, BODY_TERM_RET, result, 0, 0, -1, -1);
    body_end_block(body, block, term);
    if (!cold_bodyir_exact_identity_schema_valid(
            body, symbols, "gate-plain-pointer-field-base")) {
        gate_fail("plain pointer field base failed exact schema");
    }

    int32_t saved_base_kind = body->slot_kind[base];
    Span saved_base_type = body->slot_type[base];
    body->slot_kind[base] = SLOT_OBJECT_REF;
    body->slot_type[base] = object->name;
    if (cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "gate-object-ref-pointer-base-mutation")) {
        gate_fail("object-ref pointer base mutation escaped exact schema");
    }
    body->slot_kind[base] = saved_base_kind;
    body->slot_type[base] = saved_base_type;

    Span saved_source_type = body->slot_type[source];
    Span saved_materialized_type = body->slot_type[base];
    body->slot_type[source] =
        cold_cstr_span("GateOtherPlainPointerBase*");
    body->slot_type[base] = body->slot_type[source];
    if (cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "gate-pointer-pointee-identity-mutation")) {
        gate_fail("pointer pointee identity mutation escaped exact schema");
    }
    body->slot_type[source] = saved_source_type;
    body->slot_type[base] = saved_materialized_type;

    int32_t saved_offset = body->op_b[projection];
    body->op_b[projection] = 164;
    if (cold_bodyir_exact_identity_schema_valid(
            body, symbols,
            "gate-pointer-field-offset-mutation")) {
        gate_fail("pointer field offset mutation escaped exact schema");
    }
    body->op_b[projection] = saved_offset;
    cold_harness_compilation_end(&compilation, false);
    arena_release(&arena);
}

static void gate_check_wide_scalar_fixed_array_store_contract(void) {
    Arena arena = {0};
    ColdHarnessCompilation compilation;
    cold_harness_compilation_begin(&compilation, &arena);
    Symbols *symbols = compilation.symbols;
    BodyIR *body = body_new(&arena);
    int32_t base = body_slot(body, SLOT_ARRAY_I32, 64 * 8);
    body_slot_set_type(
        body, base, cold_cstr_span("int64[64]"));
    body_slot_set_array_len(body, base, 64);
    int32_t index = body_slot(body, SLOT_I32, 4);
    body_op(body, BODY_OP_I32_CONST, index, 3, 0);
    int32_t value = body_slot(body, SLOT_I64, 8);
    body_slot_set_type(body, value, cold_cstr_span("int64"));
    body_op(body, BODY_OP_I64_CONST, value, 7, 0);
    Parser parser = {0};
    parser.symbols = symbols;
    ColdExprResult value_result;
    cold_expr_result_reset(&value_result);
    int32_t projection = body->op_count;
    int32_t store = -1;
    if (!cold_emit_exact_fixed_array_index_store(
            &parser, body, base,
            body->slot_type[base],
            index, SLOT_I32,
            value, SLOT_I64,
            0, &value_result, &store)) {
        gate_fail("wide scalar fixed-array store was not emitted");
    }
    int32_t destination = body->op_dst[projection];
    if (body->op_kind[projection] !=
            BODY_OP_ARRAY_OPAQUE_INDEX_REF_DYNAMIC ||
        destination < 0 || destination >= body->slot_count ||
        body->slot_kind[destination] != SLOT_I64_REF ||
        body->op_c[projection] != 8 ||
        body->op_kind[projection + 1] != BODY_OP_PAYLOAD_STORE ||
        body->op_dst[projection + 1] != destination ||
        !cold_exact_slot_authority_is_sentinel(
            body, destination) ||
        !cold_exact_fixed_array_index_ref_shape_valid(
            body, symbols, projection)) {
        gate_fail("wide scalar fixed-array store carrier is non-canonical");
    }

    int32_t saved_kind = body->slot_kind[destination];
    body->slot_kind[destination] = SLOT_OBJECT_REF;
    if (cold_exact_fixed_array_index_ref_shape_valid(
            body, symbols, projection)) {
        gate_fail("wide scalar object-ref mutation escaped shape gate");
    }
    body->slot_kind[destination] = saved_kind;

    int32_t saved_stride = body->op_c[projection];
    body->op_c[projection] = 4;
    if (cold_exact_fixed_array_index_ref_shape_valid(
            body, symbols, projection)) {
        gate_fail("wide scalar stride mutation escaped shape gate");
    }
    body->op_c[projection] = saved_stride;

    Span saved_type = body->slot_type[destination];
    body->slot_type[destination] = cold_cstr_span("uint64");
    if (cold_exact_fixed_array_index_ref_shape_valid(
            body, symbols, projection)) {
        gate_fail("wide scalar element identity mutation escaped shape gate");
    }
    body->slot_type[destination] = saved_type;
    cold_harness_compilation_end(&compilation, false);
    arena_release(&arena);
}

int main(int argc, char **argv) {
    if (argc >= 2 && strcmp(argv[1], "compiler") == 0)
        return cheng_cold_embedded_main(argc - 1, argv + 1);
    if (argc == 2 && strcmp(argv[1], "unknown-kind") == 0) {
        (void)cold_body_op_schema(COLD_BODY_OP_SCHEMA_COUNT);
        gate_fail("unknown schema kind was accepted");
    }
    if (argc == 2 && strcmp(argv[1], "deferred-type-size") == 0) {
        gate_invoke_concrete_deferred_type_size(
            COLD_TYPE_SIZE_MODE_SIZEOF, true);
    }
    if (argc == 2 && strcmp(argv[1], "deferred-type-size-mode") == 0) {
        gate_invoke_concrete_deferred_type_size(99, true);
    }
    if (argc == 2 && strcmp(argv[1], "deferred-type-size-identity") == 0) {
        gate_invoke_concrete_deferred_type_size(
            COLD_TYPE_SIZE_MODE_ELEM, false);
    }
    gate_check_schema();
    gate_check_dse_and_cross_block();
    gate_check_observable_effect_dse();
    gate_check_codegen_c_consumers();
    gate_check_deferred_type_size_template_admission();
    gate_check_exact_block_op_coverage();
    gate_check_multi_managed_cfg_merge();
    gate_check_forward_origin_dominance();
    gate_check_three_managed_loop_phi();
    gate_check_plain_composite_constructor_contract();
    gate_check_plain_pointer_field_base_contract();
    gate_check_wide_scalar_fixed_array_store_contract();
    puts("cold_body_op_schema_differential_gate_status=pass");
    printf("body_op_schema_count=%d\n", COLD_BODY_OP_SCHEMA_COUNT);
    printf("schema_role_capability_mutations_rejected=%d\n",
           GateSchemaMutationCount);
    puts("c_slot_schema_count=10");
    puts("rv64_c_slot_codegen_count=9");
    puts("wasm_c_slot_codegen_count=6");
    puts("exact_block_op_coverage=1");
    puts("orphan_op_range_rejected=1");
    puts("multi_managed_cfg_merge_count=3");
    puts("managed_cfg_owned_owned_move=1");
    puts("managed_cfg_borrow_borrow_reborrow=1");
    puts("managed_cfg_mixed_borrow_lift=1");
    puts("multi_managed_orphan_mutation_rejected=1");
    puts("managed_cfg_ownership_mutation_rejected=1");
    puts("managed_cfg_dominating_forward_origin_count=2");
    puts("managed_same_block_forward_origin_rejected=2");
    puts("managed_nondominating_forward_origin_rejected=2");
    puts("managed_loop_phi_count=3");
    puts("managed_loop_projection_origin_rebound=1");
    puts("managed_loop_slot_origin_mutation_rejected=1");
    puts("plain_composite_constructor_contract=1");
    puts("plain_composite_constructor_mutations_rejected=2");
    puts("plain_pointer_field_base_contract=1");
    puts("plain_pointer_field_base_mutations_rejected=3");
    puts("wide_scalar_fixed_array_store_contract=1");
    puts("wide_scalar_fixed_array_store_mutations_rejected=3");
    return 0;
}
