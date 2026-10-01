#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main

int main(void) {
    const int32_t domain_size = 1048576;
    Symbols symbols;
    memset(&symbols, 0, sizeof(symbols));
    int32_t type_name_hash_rows[1] = {0};
    symbols.type_name_hash_rows = type_name_hash_rows;
    symbols.type_name_hash_cap = 1;

    Span ptr_type = {
        (const uint8_t *)"ptr", 3
    };
    int32_t builtin_type_id =
        cold_exact_abi_builtin_type_id(
            ptr_type, SLOT_OPAQUE_REF);
    if (builtin_type_id !=
            SLOT_OBJECT_REF * domain_size) {
        return 10;
    }
    if (cold_exact_abi_pointer_alias_type_id(
            &symbols, ptr_type, SLOT_OPAQUE_REF) !=
            builtin_type_id) {
        return 18;
    }
    if (cold_body_exact_object_ref_bit(
            &symbols, ptr_type, SLOT_OPAQUE_REF,
            builtin_type_id) != -1) {
        return 11;
    }

    BodyIR body;
    memset(&body, 0, sizeof(body));
    int32_t slot_kind[1] = { SLOT_OPAQUE_REF };
    int32_t slot_size[1] = { 8 };
    Span slot_type[1] = { ptr_type };
    int32_t slot_exact_type_id[1] = { builtin_type_id };
    int32_t slot_storage[1] = { COLD_MANAGED_STORAGE_PLAIN };
    body.slot_count = 1;
    body.slot_kind = slot_kind;
    body.slot_size = slot_size;
    body.slot_type = slot_type;
    body.slot_exact_type_id = slot_exact_type_id;
    body.slot_managed_storage_kind = slot_storage;
    if (!cold_exact_abi_builtin_pointer_slot_identity(
            &body, &symbols, 0)) {
        return 14;
    }
    if (cold_recorded_storage_obligation_for_body_slot(
            &body, &symbols, 0) != COLD_MANAGED_STORAGE_PLAIN) {
        return 15;
    }
    if (cold_canonical_storage_obligation_for_body_slot(
            &body, &symbols, 0) != COLD_MANAGED_STORAGE_PLAIN) {
        return 16;
    }
    slot_storage[0] = COLD_MANAGED_STORAGE_OBJECT;
    if (cold_recorded_storage_obligation_for_body_slot(
            &body, &symbols, 0) != COLD_MANAGED_STORAGE_UNKNOWN) {
        return 17;
    }
    slot_storage[0] = COLD_MANAGED_STORAGE_PLAIN;

    ObjectDef object;
    memset(&object, 0, sizeof(object));
    object.is_ref = true;
    symbols.objects = &object;
    symbols.object_count = 1;
    Span nominal_type = {
        (const uint8_t *)"FixtureRef", 10
    };
    if (cold_body_exact_object_ref_bit(
            &symbols, nominal_type, SLOT_OPAQUE_REF,
            SLOT_OBJECT_REF * domain_size + 1) != 1) {
        return 12;
    }
    if (cold_body_exact_object_ref_bit(
            &symbols, nominal_type, SLOT_OPAQUE_REF,
            SLOT_OBJECT_REF * domain_size) != -2) {
        return 13;
    }
    slot_type[0] = nominal_type;
    slot_exact_type_id[0] = SLOT_OBJECT_REF * domain_size + 1;
    if (cold_exact_abi_builtin_pointer_slot_identity(
            &body, &symbols, 0)) {
        return 18;
    }

    puts("cold_abi_builtin_body_object_identity_fixture=passed");
    return 0;
}
