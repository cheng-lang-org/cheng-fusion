#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main

static void fixture_object_sentinels(ObjectDef *object) {
    object->base_object_index = -1;
    object->generic_application_template_object_row = -1;
    object->generic_application_binder_kind = COLD_GENERIC_BINDER_NONE;
    object->generic_application_binder_id = -1;
    object->generic_application_type_node = -1;
    object->canonical_mirror_object_row = -1;
}

int main(void) {
    const int32_t domain_size = 1048576;
    Symbols symbols;
    ObjectDef objects[2];
    ObjectField fields[2];
    int32_t object_name_hash_rows[8] = {0};
    int32_t object_local_name_hash_rows[8] = {0};
    int32_t object_local_name_next_rows[2] = {-1, -1};
    int32_t type_local_name_hash_rows[8] = {0};
    int32_t type_name_hash_rows[8] = {0};
    memset(&symbols, 0, sizeof(symbols));
    memset(objects, 0, sizeof(objects));
    memset(fields, 0, sizeof(fields));

    fixture_object_sentinels(&objects[0]);
    objects[0].name = cold_cstr_span("FixturePlainArray");
    objects[0].fields = &fields[0];
    objects[0].field_count = 1;
    objects[0].slot_size = 8;
    fields[0].name = cold_cstr_span("word");
    fields[0].kind = SLOT_I32;
    fields[0].offset = 0;
    fields[0].size = 4;
    fields[0].type_name = cold_cstr_span("int32");

    fixture_object_sentinels(&objects[1]);
    objects[1].name = cold_cstr_span("FixtureManagedArray");
    objects[1].fields = &fields[1];
    objects[1].field_count = 1;
    objects[1].slot_size = COLD_STR_SLOT_SIZE;
    fields[1].name = cold_cstr_span("text");
    fields[1].kind = SLOT_STR;
    fields[1].offset = 0;
    fields[1].size = COLD_STR_SLOT_SIZE;
    fields[1].type_name = cold_cstr_span("str");

    symbols.objects = objects;
    symbols.object_count = 2;
    symbols.object_local_name_hash_rows =
        object_local_name_hash_rows;
    symbols.object_name_hash_rows = object_name_hash_rows;
    symbols.object_local_name_next_rows =
        object_local_name_next_rows;
    symbols.object_name_hash_cap = 8;
    symbols.type_local_name_hash_rows =
        type_local_name_hash_rows;
    symbols.type_name_hash_rows = type_name_hash_rows;
    symbols.type_name_hash_cap = 8;

    int32_t storage = COLD_MANAGED_STORAGE_UNKNOWN;
    if (!cold_exact_fixed_array_global_object_storage(
            &symbols, cold_cstr_span("FixturePlainArray[4]"),
            SLOT_OBJECT_REF * domain_size + 1, &storage) ||
        storage != COLD_MANAGED_STORAGE_PLAIN) {
        return 10;
    }
    storage = COLD_MANAGED_STORAGE_UNKNOWN;
    if (!cold_exact_fixed_array_global_object_storage(
            &symbols, cold_cstr_span("FixtureManagedArray[4]"),
            SLOT_OBJECT_REF * domain_size + 2, &storage) ||
        storage != COLD_MANAGED_STORAGE_OBJECT) {
        return 11;
    }
    storage = COLD_MANAGED_STORAGE_OBJECT;
    if (cold_exact_fixed_array_global_object_storage(
            &symbols, cold_cstr_span("FixturePlainArray"),
            SLOT_OBJECT_REF * domain_size + 1, &storage) ||
        storage != COLD_MANAGED_STORAGE_UNKNOWN) {
        return 12;
    }
    storage = COLD_MANAGED_STORAGE_OBJECT;
    if (cold_exact_fixed_array_global_object_storage(
            &symbols, cold_cstr_span("FixturePlainArray[4]"),
            SLOT_I32 * domain_size, &storage) ||
        storage != COLD_MANAGED_STORAGE_UNKNOWN) {
        return 13;
    }
    puts("cold_fixed_array_global_storage_fixture=passed");
    return 0;
}
