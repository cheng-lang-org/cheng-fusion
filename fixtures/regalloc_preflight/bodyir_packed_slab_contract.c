/* Fusion-owned contract over the real target tree's bootstrap/cheng_cold.c. */
#define main cheng_cold_embedded_main
#include "cheng_cold.c"
#undef main

static int contract_fail(const char *message) {
    fprintf(stderr, "bodyir_packed_slab_contract: %s\n", message);
    return 1;
}

static size_t packed_bytes(const BodyIR *body) {
    return (size_t)body->op_cap * 20u +
           (size_t)body->slot_cap * 36u +
           (size_t)body->call_arg_cap * 8u;
}

int main(void) {
    Arena *arena = mmap(0, sizeof(Arena), PROT_READ | PROT_WRITE,
                        MAP_PRIVATE | MAP_ANON, -1, 0);
    if (arena == MAP_FAILED) return contract_fail("arena mmap failed");

    BodyIR *source = body_new(arena);
    for (int32_t i = 0; i < 33; i++) {
        int32_t slot = body_slot(source, SLOT_I32, 4);
        source->slot_aux[slot] = 1000 + i;
        body_slot_set_type(source, slot, cold_cstr_span("int32"));
    }
    for (int32_t i = 0; i < 65; i++) {
        body_op3(source, BODY_OP_I32_CONST, i % 33,
                 2000 + i, 3000 + i, 4000 + i);
    }
    for (int32_t i = 0; i < 9; i++) {
        body_call_arg_with_offset(source, i, 5000 + i);
    }
    if (source->op_cap != 128 || source->slot_cap != 64 ||
        source->call_arg_cap != 16) {
        return contract_fail("64/32/8 capacities did not double exactly");
    }
    if (source->op_dst != source->op_kind + source->op_cap ||
        source->op_a != source->op_dst + source->op_cap ||
        source->op_b != source->op_a + source->op_cap ||
        source->op_c != source->op_b + source->op_cap) {
        return contract_fail("op columns are not packed");
    }
    if (source->slot_offset != source->slot_kind + source->slot_cap ||
        source->slot_size != source->slot_offset + source->slot_cap ||
        source->slot_aux != source->slot_size + source->slot_cap ||
        source->slot_type != (Span *)(source->slot_aux + source->slot_cap) ||
        source->slot_no_alias !=
            (int32_t *)(source->slot_type + source->slot_cap)) {
        return contract_fail("slot columns are not packed");
    }
    if (((uintptr_t)source->slot_type % _Alignof(Span)) != 0) {
        return contract_fail("source Span column is misaligned");
    }
    if (source->call_arg_offset !=
        source->call_arg_slot + source->call_arg_cap) {
        return contract_fail("call-arg columns are not packed");
    }
    for (int32_t i = 0; i < 33; i++) {
        if (source->slot_aux[i] != 1000 + i)
            return contract_fail("slot growth lost live data");
    }
    for (int32_t i = 0; i < 65; i++) {
        if (source->op_a[i] != 2000 + i ||
            source->op_b[i] != 3000 + i ||
            source->op_c[i] != 4000 + i) {
            return contract_fail("op growth lost live data");
        }
    }
    for (int32_t i = 0; i < 9; i++) {
        if (source->call_arg_slot[i] != i ||
            source->call_arg_offset[i] != 5000 + i) {
            return contract_fail("call-arg growth lost live data");
        }
    }

    size_t source_bytes = packed_bytes(source);
    if (source_bytes !=
        (size_t)20 * 128u + (size_t)36 * 64u + (size_t)8 * 16u) {
        return contract_fail("packed byte formula drifted");
    }
    if (arena->owned_slab_bytes != source_bytes)
        return contract_fail("obsolete growth slabs remain accounted");
    if (arena_retained_bytes(arena) != arena->used + source_bytes)
        return contract_fail("retained metric omitted owned slabs");

    BodyIR *clone = cold_codegen_clone_body(arena, source);
    if (clone->op_cap != 65 || clone->slot_cap != 33 ||
        clone->call_arg_cap != 9) {
        return contract_fail("clone capacity is not exact live count");
    }
    if (((uintptr_t)clone->slot_type % _Alignof(Span)) != 0)
        return contract_fail("odd-capacity clone Span column is misaligned");
    if (clone->op_slab_owner == source->op_slab_owner ||
        clone->slot_slab_owner == source->slot_slab_owner ||
        clone->call_arg_slab_owner == source->call_arg_slab_owner) {
        return contract_fail("clone shares a slab owner with source");
    }
    clone->op_a[0] = -11;
    clone->slot_aux[0] = -22;
    clone->call_arg_offset[0] = -33;
    if (source->op_a[0] == -11 || source->slot_aux[0] == -22 ||
        source->call_arg_offset[0] == -33) {
        return contract_fail("clone mutation changed source");
    }
    source->op_b[1] = -44;
    source->slot_aux[1] = -55;
    source->call_arg_offset[1] = -66;
    if (clone->op_b[1] == -44 || clone->slot_aux[1] == -55 ||
        clone->call_arg_offset[1] == -66) {
        return contract_fail("source mutation changed clone");
    }

    body_release_owned_slabs(clone);
    if (clone->owned_slab_cleanup.registered || clone->op_slab_owner ||
        clone->slot_slab_owner || clone->call_arg_slab_owner ||
        clone->op_count != 0 || clone->slot_count != 0 ||
        clone->call_arg_count != 0 ||
        arena->owned_slab_bytes != source_bytes) {
        return contract_fail("clone release did not reach zero-owner state");
    }
    body_release_owned_slabs(clone);
    body_release_owned_slabs(source);
    body_release_owned_slabs(source);
    if (arena->owned_slab_bytes != 0 ||
        source->owned_slab_cleanup.registered)
        return contract_fail("idempotent source release left ownership");
    if (arena_retained_bytes(arena) != arena->used)
        return contract_fail("retained metric did not drop released slabs");

    BodyIR *abort_body = body_new(arena);
    (void)body_slot(abort_body, SLOT_I32, 4);
    (void)body_op(abort_body, BODY_OP_I32_CONST, 0, 7, 0);
    (void)body_call_arg(abort_body, 0);
    if (arena->owned_slab_bytes == 0 || !arena->cleanup_head)
        return contract_fail("abort owner was not registered");
    arena_cleanup_release_all(arena);
    if (arena->owned_slab_bytes != 0 || arena->cleanup_head ||
        abort_body->owned_slab_cleanup.registered ||
        abort_body->op_slab_owner || abort_body->slot_slab_owner ||
        abort_body->call_arg_slab_owner) {
        return contract_fail("abort cleanup left slab ownership");
    }

    arena_release(arena);
    return 0;
}
