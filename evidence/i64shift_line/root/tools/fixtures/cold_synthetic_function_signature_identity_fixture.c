#define main cheng_cold_embedded_program_main
#include "cheng_cold.c"
#undef main

static void fixture_object_sentinels(ObjectDef *object) {
    object->base_object_index = -1;
    object->generic_application_template_object_row = -1;
    object->generic_application_binder_kind =
        COLD_GENERIC_BINDER_NONE;
    object->generic_application_binder_id = -1;
    object->generic_application_type_node = -1;
    object->canonical_mirror_object_row = -1;
    object->declaration_origin_row = -1;
}

int main(int argc, char **argv) {
    const int32_t domain_size = 1048576;
    const char *mode = argc > 1 ? argv[1] : "positive";
    Symbols symbols;
    ObjectDef objects[1];
    ObjectField fields[1];
    FnDef functions[1];
    ColdFnInlineParamStorage formal_storage;
    int32_t object_name_hash_rows[8] = {0};
    int32_t object_local_name_hash_rows[8] = {0};
    int32_t object_local_name_next_rows[1] = {-1};
    int32_t type_name_hash_rows[8] = {0};
    int32_t type_local_name_hash_rows[8] = {0};
    memset(&symbols, 0, sizeof(symbols));
    memset(objects, 0, sizeof(objects));
    memset(fields, 0, sizeof(fields));
    memset(functions, 0, sizeof(functions));
    memset(&formal_storage, 0, sizeof(formal_storage));

    fixture_object_sentinels(&objects[0]);
    objects[0].name = cold_cstr_span("FixtureManagedAggregate");
    objects[0].fields = fields;
    objects[0].field_count = 1;
    objects[0].slot_size = COLD_STR_SLOT_SIZE;
    fields[0].name = cold_cstr_span("payload");
    fields[0].kind = SLOT_STR;
    fields[0].offset = 0;
    fields[0].size = COLD_STR_SLOT_SIZE;
    fields[0].type_name = cold_cstr_span("str");

    symbols.objects = objects;
    symbols.object_count = 1;
    symbols.object_cap = 1;
    symbols.object_name_hash_rows = object_name_hash_rows;
    symbols.object_local_name_hash_rows =
        object_local_name_hash_rows;
    symbols.object_local_name_next_rows =
        object_local_name_next_rows;
    symbols.object_name_hash_cap = 8;
    symbols.type_name_hash_rows = type_name_hash_rows;
    symbols.type_local_name_hash_rows =
        type_local_name_hash_rows;
    symbols.type_name_hash_cap = 8;
    symbols_object_name_indices_rebuild(&symbols);

    cold_fn_bind_inline_param_storage(
        &functions[0], &formal_storage);
    functions[0].name =
        cold_cstr_span("fixture_synthetic_owned_consumer");
    functions[0].arity = 1;
    functions[0].param_kind[0] = SLOT_OBJECT;
    functions[0].param_size[0] = COLD_STR_SLOT_SIZE;
    functions[0].param_type[0] =
        cold_cstr_span("FixtureManagedAggregate");
    functions[0].param_exact_type_id[0] = -1;
    functions[0].param_exact_object_is_ref[0] = -1;
    functions[0].ret = cold_cstr_span("void");
    functions[0].return_exact_type_id = -1;
    functions[0].declaration_origin_row = -1;
    functions[0].template_index = -1;
    symbols.functions = functions;
    symbols.function_count = 1;
    symbols.function_cap = 1;

    cold_publish_exact_object_formal_type_id(
        &symbols, 0, 0, &objects[0]);
    int32_t object_type_id =
        SLOT_OBJECT * domain_size + 1;
    if (functions[0].param_exact_type_id[0] !=
            object_type_id ||
        functions[0].param_exact_object_is_ref[0] != 0 ||
        functions[0].return_exact_type_id != -1) {
        return 10;
    }
    if (strcmp(mode, "missing-return") != 0) {
        cold_publish_exact_formal_type_ids(&symbols, 0);
    }
    if (strcmp(mode, "publisher-drift") == 0) {
        functions[0].return_exact_type_id =
            SLOT_I64 * domain_size;
        cold_publish_exact_formal_type_ids(&symbols, 0);
        return 11;
    }
    if (strcmp(mode, "forged-return") == 0) {
        functions[0].return_exact_type_id =
            SLOT_I64 * domain_size;
    }

    BodyIR body;
    int32_t slot_kind[1] = {SLOT_OBJECT};
    int32_t slot_size[1] = {COLD_STR_SLOT_SIZE};
    Span slot_type[1] = {
        cold_cstr_span("FixtureManagedAggregate")};
    int32_t slot_exact_type_id[1] = {object_type_id};
    int32_t slot_managed_storage_kind[1] = {
        COLD_MANAGED_STORAGE_OBJECT};
    memset(&body, 0, sizeof(body));
    body.producer_function_row = 0;
    body.param_count = 1;
    body.param_slot[0] = 0;
    body.slot_count = 1;
    body.slot_kind = slot_kind;
    body.slot_size = slot_size;
    body.slot_type = slot_type;
    body.slot_exact_type_id = slot_exact_type_id;
    body.slot_managed_storage_kind =
        slot_managed_storage_kind;
    body.return_kind = SLOT_I32;
    body.return_size = 4;
    body.return_type = cold_cstr_span("void");

    if (strcmp(mode, "wrong-formal") == 0) {
        body.slot_type[0] =
            cold_cstr_span("FixtureOtherAggregate");
    }
    if (strcmp(mode, "wrong-body-return") == 0) {
        body.return_type = cold_cstr_span("int32");
    }
    cold_require_function_body_signature_admission(
        &symbols, 0, &body);
    if (strcmp(mode, "positive") != 0) return 12;
    if (functions[0].return_exact_type_id !=
            SLOT_I32 * domain_size) {
        return 13;
    }
    puts("cold_synthetic_function_signature_identity_fixture=passed");
    return 0;
}
