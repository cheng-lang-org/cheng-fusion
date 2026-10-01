#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main
#include "cold_context_harness.h"

typedef struct ManagedVarForwardFixture {
    Arena arena;
    Symbols *symbols;
    ColdHarnessCompilation compilation;
    Parser parser;
    BodyIR *body;
    Locals locals;
    Local *parameter;
    int32_t entry_block;
    int32_t parameter_definition;
    int32_t declaration_ref_kind;
    int32_t expected_ref_kind;
    int32_t expected_storage;
    Span parameter_type;
} ManagedVarForwardFixture;

typedef enum ManagedVarForwardCarrier {
    MANAGED_VAR_FORWARD_OBJECT,
    MANAGED_VAR_FORWARD_STR,
    MANAGED_VAR_FORWARD_OPAQUE_OBJECT,
} ManagedVarForwardCarrier;

static void gate_fail(const char *message) {
    fprintf(stderr, "cold_managed_var_forward_identity_gate: %s\n",
            message);
    exit(1);
}

static void gate_fixture_init(ManagedVarForwardFixture *fixture,
                              ManagedVarForwardCarrier carrier) {
    memset(fixture, 0, sizeof(*fixture));
    cold_harness_compilation_begin(
        &fixture->compilation, &fixture->arena);
    fixture->symbols = fixture->compilation.symbols;
    Span slot_type;
    if (carrier == MANAGED_VAR_FORWARD_OBJECT ||
        carrier == MANAGED_VAR_FORWARD_OPAQUE_OBJECT) {
        ObjectDef *object = symbols_add_object(
            fixture->symbols,
            cold_cstr_span("ManagedVarForwardGateRef"), 0);
        if (!object)
            gate_fail("managed ref object registration failed");
        object->is_ref = true;
        object_finalize_fields(object);
        fixture->declaration_ref_kind =
            carrier == MANAGED_VAR_FORWARD_OPAQUE_OBJECT
                ? SLOT_OPAQUE_REF
                : SLOT_OBJECT_REF;
        fixture->expected_ref_kind = SLOT_OBJECT_REF;
        fixture->expected_storage = COLD_MANAGED_STORAGE_OBJECT;
        fixture->parameter_type =
            cold_cstr_span("var ManagedVarForwardGateRef");
        slot_type = cold_cstr_span("ManagedVarForwardGateRef");
    } else if (carrier == MANAGED_VAR_FORWARD_STR) {
        fixture->declaration_ref_kind = SLOT_STR_REF;
        fixture->expected_ref_kind = SLOT_STR_REF;
        fixture->expected_storage = COLD_MANAGED_STORAGE_STR;
        fixture->parameter_type = cold_cstr_span("var str");
        slot_type = cold_cstr_span("str");
    } else {
        gate_fail("unknown managed carrier fixture");
    }
    int32_t parameter_size = 8;
    int32_t function_row = symbols_add_fn(
        fixture->symbols,
        cold_cstr_span("ManagedVarForwardIdentityGate"),
        1, &fixture->declaration_ref_kind, &parameter_size,
        &fixture->parameter_type, cold_cstr_span(""));
    if (function_row < 0)
        gate_fail("function identity registration failed");

    fixture->body = body_new(&fixture->arena);
    fixture->body->producer_function_row = function_row;
    fixture->body->debug_name =
        cold_cstr_span("managed_var_forward_identity_gate");
    fixture->entry_block = body_block(fixture->body);

    int32_t raw_parameter_slot = body_slot(
        fixture->body, fixture->declaration_ref_kind, 8);
    body_slot_set_type(fixture->body, raw_parameter_slot, slot_type);
    fixture->body->param_count = 1;
    fixture->body->param_slot[0] = raw_parameter_slot;
    fixture->body->param_name[0] = cold_cstr_span("target");

    locals_init(&fixture->locals, &fixture->arena);
    locals_add(
        &fixture->locals, fixture->body->param_name[0],
        raw_parameter_slot, fixture->declaration_ref_kind);
    fixture->parameter = locals_find(
        &fixture->locals, fixture->body->param_name[0]);
    if (!fixture->parameter)
        gate_fail("parameter local registration failed");
    fixture->parameter->is_mutable_place = true;

    Span parameter_types[1] = {fixture->parameter_type};
    cold_bind_exact_managed_parameters(
        fixture->body, fixture->symbols,
        &fixture->locals, parameter_types);
    fixture->parameter = locals_find(
        &fixture->locals, fixture->body->param_name[0]);
    if (!fixture->parameter ||
        fixture->parameter->value_def_op_id < 0)
        gate_fail("exact parameter definition was not bound");
    fixture->parameter_definition =
        fixture->parameter->value_def_op_id;

    fixture->parser.arena = &fixture->arena;
    fixture->parser.symbols = fixture->symbols;
    fixture->parser.source = cold_cstr_span("target");
}

static int32_t gate_forward(ManagedVarForwardFixture *fixture) {
    int32_t forwarded_slot = -1;
    if (!cold_try_forward_bare_var_param_place(
            &fixture->parser, fixture->body,
            &fixture->locals, fixture->parser.source,
            fixture->expected_ref_kind,
            fixture->parameter_type, &forwarded_slot)) {
        gate_fail("exact var parameter was not forwarded");
    }
    return forwarded_slot;
}

static void gate_close_body(ManagedVarForwardFixture *fixture) {
    int32_t terminal = body_term(
        fixture->body, BODY_TERM_RET,
        -1, -1, 0, -1, -1);
    body_end_block(
        fixture->body, fixture->entry_block, terminal);
}

static void gate_run_positive_carrier(
        ManagedVarForwardCarrier carrier) {
    ManagedVarForwardFixture fixture;
    gate_fixture_init(&fixture, carrier);
    int32_t forwarded_slot = gate_forward(&fixture);
    int32_t definition = fixture.body->op_count - 1;
    if (forwarded_slot < 0 ||
        forwarded_slot >= fixture.body->slot_count ||
        forwarded_slot == fixture.parameter->slot ||
        fixture.body->slot_kind[forwarded_slot] !=
            fixture.expected_ref_kind ||
        definition <= fixture.parameter_definition ||
        fixture.body->op_kind[definition] != BODY_OP_COPY_I64 ||
        fixture.body->op_dst[definition] != forwarded_slot ||
        fixture.body->op_a[definition] != fixture.parameter->slot ||
        fixture.body->op_source_value_def_op_id[definition] !=
            fixture.parameter_definition ||
        fixture.body->op_value_def_slot[definition] !=
            forwarded_slot ||
        fixture.body->op_value_def_exact_type_id[definition] !=
            fixture.body->op_value_def_exact_type_id[
                fixture.parameter_definition] ||
        fixture.body->op_value_def_producer_function_row[definition] !=
            fixture.body->producer_function_row ||
        fixture.body->op_value_def_place_kind[definition] !=
            COLD_EXPR_PLACE_STACK_LOCAL ||
        fixture.body->op_value_def_ownership[definition] !=
            COLD_EXPR_OWN_BORROW_UNIQUE ||
        fixture.body->op_value_def_origin_id[definition] !=
            forwarded_slot ||
        fixture.body->slot_exact_type_id[forwarded_slot] !=
            fixture.body->op_value_def_exact_type_id[definition] ||
        fixture.body->slot_place_kind[forwarded_slot] !=
            COLD_EXPR_PLACE_STACK_LOCAL ||
        fixture.body->slot_origin_id[forwarded_slot] !=
            forwarded_slot ||
        fixture.body->slot_managed_storage_kind[forwarded_slot] !=
            fixture.expected_storage) {
        gate_fail("forwarded carrier lost exact immutable authority");
    }
    gate_close_body(&fixture);
    if (!cold_bodyir_exact_identity_schema_valid(
            fixture.body, fixture.symbols,
            "managed-var-forward-gate")) {
        gate_fail("exact schema rejected forwarded carrier");
    }
}

static void gate_run_mismatch(void) {
    ManagedVarForwardFixture fixture;
    gate_fixture_init(&fixture, MANAGED_VAR_FORWARD_OBJECT);
    int32_t op_count = fixture.body->op_count;
    int32_t slot_count = fixture.body->slot_count;
    int32_t forwarded_slot = -1;
    if (cold_try_forward_bare_var_param_place(
            &fixture.parser, fixture.body,
            &fixture.locals, fixture.parser.source,
            SLOT_STR_REF, cold_cstr_span("var str"),
            &forwarded_slot) ||
        forwarded_slot != -1 ||
        fixture.body->op_count != op_count ||
        fixture.body->slot_count != slot_count) {
        gate_fail("mismatched managed carrier was forwarded");
    }
}

static void gate_run_opaque_discriminator(void) {
    ManagedVarForwardFixture fixture;
    gate_fixture_init(
        &fixture, MANAGED_VAR_FORWARD_OPAQUE_OBJECT);
    int32_t slot = fixture.parameter->slot;
    int32_t exact_type =
        fixture.body->slot_exact_type_id[slot];
    if (fixture.body->slot_kind[slot] != SLOT_OPAQUE_REF ||
        fixture.body->slot_size[slot] != 8 ||
        exact_type / 1048576 != SLOT_OBJECT_REF ||
        cold_exact_managed_storage_for_slot(
            fixture.symbols, fixture.body, slot,
            SLOT_OPAQUE_REF) != COLD_MANAGED_STORAGE_OBJECT ||
        cold_managed_storage_from_exact_slot_authority(
            fixture.body, slot) != COLD_MANAGED_STORAGE_OBJECT ||
        cold_exact_storage_for_body_slot(
            fixture.body, slot) != COLD_MANAGED_STORAGE_OBJECT) {
        gate_fail("exact opaque object discriminator was rejected");
    }

    fixture.body->slot_managed_storage_kind[slot] =
        COLD_MANAGED_STORAGE_STR;
    if (cold_managed_storage_from_exact_slot_authority(
            fixture.body, slot) != COLD_MANAGED_STORAGE_UNKNOWN ||
        cold_exact_storage_for_body_slot(
            fixture.body, slot) != COLD_MANAGED_STORAGE_UNKNOWN) {
        gate_fail("forged opaque object storage was accepted");
    }
    fixture.body->slot_managed_storage_kind[slot] =
        COLD_MANAGED_STORAGE_OBJECT;

    fixture.body->slot_exact_type_id[slot] =
        SLOT_STR_REF * 1048576;
    if (cold_managed_storage_from_exact_slot_authority(
            fixture.body, slot) != COLD_MANAGED_STORAGE_UNKNOWN ||
        cold_exact_storage_for_body_slot(
            fixture.body, slot) != COLD_MANAGED_STORAGE_UNKNOWN) {
        gate_fail("forged opaque object TypeId domain was accepted");
    }
    fixture.body->slot_exact_type_id[slot] = exact_type;

    int32_t scalar = body_slot(
        fixture.body, SLOT_OPAQUE_REF, 8);
    body_slot_set_type(
        fixture.body, scalar, cold_cstr_span("int64"));
    if (cold_exact_managed_type_id(
            fixture.symbols, fixture.body,
            scalar, SLOT_OPAQUE_REF) != -1 ||
        cold_exact_managed_storage_for_slot(
            fixture.symbols, fixture.body,
            scalar, SLOT_OPAQUE_REF) !=
            COLD_MANAGED_STORAGE_UNKNOWN) {
        gate_fail("scalar opaque carrier was classified as managed");
    }

    ObjectDef *other = symbols_add_object(
        fixture.symbols,
        cold_cstr_span("ManagedVarForwardOtherRef"), 0);
    if (!other)
        gate_fail("alternate exact object registration failed");
    other->is_ref = true;
    object_finalize_fields(other);
    body_slot_set_type(
        fixture.body, slot,
        cold_cstr_span("ManagedVarForwardOtherRef"));
    int32_t swapped_type = cold_exact_managed_type_id(
        fixture.symbols, fixture.body, slot, SLOT_OPAQUE_REF);
    if (swapped_type < 0 || swapped_type == exact_type) {
        gate_fail("opaque object type swap retained old exact identity");
    }
}

static void gate_run_positive(void) {
    gate_run_positive_carrier(MANAGED_VAR_FORWARD_OBJECT);
    gate_run_positive_carrier(MANAGED_VAR_FORWARD_STR);
    gate_run_positive_carrier(MANAGED_VAR_FORWARD_OPAQUE_OBJECT);
    gate_run_mismatch();
    puts("cold_managed_var_forward_identity_gate_status=pass");
    puts("source_definition_edge=1");
    puts("borrow_unique_preserved=1");
    puts("managed_carriers=object,str,opaque-object-to-object");
    puts("mismatched_carrier_rejected=1");
}

static void gate_run_negative(const char *mode) {
    ManagedVarForwardFixture fixture;
    bool opaque =
        strcmp(mode, "corrupt-opaque-storage") == 0 ||
        strcmp(mode, "corrupt-opaque-type-domain") == 0 ||
        strcmp(mode, "swap-opaque-object-type") == 0;
    gate_fixture_init(
        &fixture,
        opaque ? MANAGED_VAR_FORWARD_OPAQUE_OBJECT
               : MANAGED_VAR_FORWARD_OBJECT);
    if (strcmp(mode, "missing-local-definition") == 0) {
        fixture.parameter->value_def_op_id = -1;
    } else if (strcmp(mode, "corrupt-source-definition") == 0) {
        fixture.body->op_value_def_exact_type_id[
            fixture.parameter_definition]++;
    } else if (strcmp(mode, "corrupt-opaque-storage") == 0) {
        fixture.body->slot_managed_storage_kind[
            fixture.parameter->slot] = COLD_MANAGED_STORAGE_STR;
    } else if (strcmp(mode, "corrupt-opaque-type-domain") == 0) {
        int32_t forged_type = SLOT_STR_REF * 1048576;
        fixture.body->slot_exact_type_id[
            fixture.parameter->slot] = forged_type;
        fixture.body->op_value_def_exact_type_id[
            fixture.parameter_definition] = forged_type;
    } else if (strcmp(mode, "swap-opaque-object-type") == 0) {
        ObjectDef *other = symbols_add_object(
            fixture.symbols,
            cold_cstr_span("ManagedVarForwardOtherRef"), 0);
        if (!other)
            gate_fail("alternate exact object registration failed");
        other->is_ref = true;
        object_finalize_fields(other);
        body_slot_set_type(
            fixture.body, fixture.parameter->slot,
            cold_cstr_span("ManagedVarForwardOtherRef"));
        fixture.parameter_type =
            cold_cstr_span("var ManagedVarForwardOtherRef");
    } else {
        gate_fail("unknown negative mode");
    }
    (void)gate_forward(&fixture);
    gate_fail("negative mutation was accepted");
}

int main(int argc, char **argv) {
    if (argc == 1) {
        gate_run_positive();
        return 0;
    }
    if (argc == 2) {
        if (strcmp(argv[1], "positive-object") == 0) {
            gate_run_positive_carrier(MANAGED_VAR_FORWARD_OBJECT);
            puts("cold_managed_var_forward_identity_gate_status=pass");
            puts("managed_carrier=object");
            return 0;
        }
        if (strcmp(argv[1], "positive-str") == 0) {
            gate_run_positive_carrier(MANAGED_VAR_FORWARD_STR);
            puts("cold_managed_var_forward_identity_gate_status=pass");
            puts("managed_carrier=str");
            return 0;
        }
        if (strcmp(argv[1], "positive-opaque-object") == 0) {
            gate_run_positive_carrier(
                MANAGED_VAR_FORWARD_OPAQUE_OBJECT);
            puts("cold_managed_var_forward_identity_gate_status=pass");
            puts("managed_carrier=opaque-object-to-object");
            return 0;
        }
        if (strcmp(argv[1], "mismatch") == 0) {
            gate_run_mismatch();
            puts("cold_managed_var_forward_identity_gate_status=pass");
            puts("mismatched_carrier_rejected=1");
            return 0;
        }
        if (strcmp(argv[1], "opaque-discriminator") == 0) {
            gate_run_opaque_discriminator();
            puts("cold_managed_var_forward_identity_gate_status=pass");
            puts("opaque_discriminator_negatives=3");
            return 0;
        }
        gate_run_negative(argv[1]);
        return 0;
    }
    gate_fail("usage: cold_managed_var_forward_identity_gate [negative-mode]");
    return 1;
}
