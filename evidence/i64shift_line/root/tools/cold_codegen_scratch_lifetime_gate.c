#define main cheng_cold_embedded_main
#include "../bootstrap/cheng_cold.c"
#undef main

static void gate_fail(const char *message) {
    fprintf(stderr, "cold_codegen_scratch_lifetime_gate: %s\n", message);
    exit(1);
}

static void *gate_touch_scratch(Arena *arena) {
    (void)arena_alloc(arena, (size_t)ARENA_PAGE * 2u);
    ArenaPage *mapping = arena->head;
    BodyIR *body = body_new(arena);
    (void)body_slot(body, SLOT_I32, 4);
    (void)body_slot(body, SLOT_STR, COLD_STR_SLOT_SIZE);
    long page_size = sysconf(_SC_PAGESIZE);
    if (!mapping || page_size <= 0 ||
        ((uintptr_t)mapping % (uintptr_t)page_size) != 0 ||
        arena->owned_slab_bytes == 0) {
        gate_fail("scratch did not acquire aligned physical owners");
    }
    return mapping;
}

static void gate_require_unmapped(void *mapping) {
    errno = 0;
    int rc = mprotect(
        mapping, (size_t)sysconf(_SC_PAGESIZE), PROT_NONE);
    if (rc == 0 || errno != ENOMEM) {
        fprintf(stderr,
                "cold_codegen_scratch_lifetime_gate: "
                "mprotect_rc=%d errno=%d mapping=%p\n",
                rc, errno, mapping);
        gate_fail("scratch mapping remained physically mapped after release");
    }
}

static int32_t GateSavedLiteralOffsets[2] = {17, 29};
static ColdA64LoopRegPlan GateSavedLoopPlan;
static Code GateCarrierCode;

static void gate_prepare_carriers(void) {
    memset(&GateCarrierCode, 0, sizeof(GateCarrierCode));
    memset(&GateSavedLoopPlan, 0, sizeof(GateSavedLoopPlan));
    GateCarrierCode.local_string_literal_offsets = GateSavedLiteralOffsets;
    GateCarrierCode.local_string_literal_count = 2;
    cold_a64_active_loop_plan = &GateSavedLoopPlan;
}

static void gate_replace_carriers_with_scratch(
    ColdCodegenScratchOwner *owner) {
    int32_t *scratch_offsets =
        arena_alloc(owner->arena, 2u * sizeof(int32_t));
    ColdA64LoopRegPlan *scratch_loop =
        arena_alloc(owner->arena, sizeof(ColdA64LoopRegPlan));
    scratch_offsets[0] = 31;
    scratch_offsets[1] = 37;
    GateCarrierCode.local_string_literal_offsets = scratch_offsets;
    GateCarrierCode.local_string_literal_count = 2;
    cold_a64_active_loop_plan = scratch_loop;
}

static void gate_require_carriers_restored(void) {
    if (GateCarrierCode.local_string_literal_offsets !=
            GateSavedLiteralOffsets ||
        GateCarrierCode.local_string_literal_count != 2 ||
        cold_a64_active_loop_plan != &GateSavedLoopPlan) {
        gate_fail("scratch carrier restoration failed");
    }
}

static void gate_success_release(void) {
    int64_t begin_before = ColdCodegenScratchBeginCount;
    int64_t release_before = ColdCodegenScratchReleaseCount;
    int64_t failure_before = ColdCodegenScratchFailureReleaseCount;
    int64_t live_before = ColdCodegenScratchLiveCount;
    gate_prepare_carriers();
    ColdCodegenScratchOwner *owner = cold_codegen_scratch_begin();
    cold_a64_codegen_scratch_bind_carriers(owner, &GateCarrierCode);
    gate_replace_carriers_with_scratch(owner);
    void *mapping = gate_touch_scratch(owner->arena);
    cold_codegen_scratch_end(owner);
    if (ColdCodegenScratchTop ||
        ColdCodegenScratchBeginCount != begin_before + 1 ||
        ColdCodegenScratchReleaseCount != release_before + 1 ||
        ColdCodegenScratchFailureReleaseCount != failure_before ||
        ColdCodegenScratchLiveCount != live_before) {
        gate_fail("success release counters are not balanced");
    }
    gate_require_carriers_restored();
    gate_require_unmapped(mapping);
}

static void *GateFailureMapping = 0;

static void gate_die_failure_release(void) {
    int64_t begin_before = ColdCodegenScratchBeginCount;
    int64_t release_before = ColdCodegenScratchReleaseCount;
    int64_t failure_before = ColdCodegenScratchFailureReleaseCount;
    int64_t live_before = ColdCodegenScratchLiveCount;
    gate_prepare_carriers();
    GateFailureMapping = 0;
    ColdErrorRecoveryEnabled = true;
    ColdErrorJumpDepth = 1;
    if (setjmp(ColdErrorJumpStack[0]) == 0) {
        ColdCodegenScratchOwner *owner = cold_codegen_scratch_begin();
        cold_a64_codegen_scratch_bind_carriers(owner, &GateCarrierCode);
        gate_replace_carriers_with_scratch(owner);
        GateFailureMapping = gate_touch_scratch(owner->arena);
        die("focused codegen scratch failure");
        gate_fail("injected die failure returned");
    }
    ColdErrorJumpDepth = 0;
    ColdErrorRecoveryEnabled = false;
    ColdMmAborted = false;
    ColdDieError[0] = '\0';
    if (!GateFailureMapping ||
        ColdCodegenScratchTop ||
        ColdCodegenScratchBeginCount != begin_before + 1 ||
        ColdCodegenScratchReleaseCount != release_before + 1 ||
        ColdCodegenScratchFailureReleaseCount != failure_before + 1 ||
        ColdCodegenScratchLiveCount != live_before) {
        gate_fail("die failure release counters are not balanced");
    }
    gate_require_carriers_restored();
    gate_require_unmapped(GateFailureMapping);
}

static void *GateSignalMapping = 0;

static void gate_signal_failure_release(int signal_number) {
    int64_t begin_before = ColdCodegenScratchBeginCount;
    int64_t release_before = ColdCodegenScratchReleaseCount;
    int64_t failure_before = ColdCodegenScratchFailureReleaseCount;
    int64_t live_before = ColdCodegenScratchLiveCount;
    struct sigaction previous;
    struct sigaction action;
    memset(&action, 0, sizeof(action));
    action.sa_handler = cold_sigsegv_die_handler;
    sigemptyset(&action.sa_mask);
    if (sigaction(signal_number, &action, &previous) != 0)
        gate_fail("codegen signal handler install failed");

    gate_prepare_carriers();
    ColdCodegenScratchOwner *owner = cold_codegen_scratch_begin();
    cold_a64_codegen_scratch_bind_carriers(owner, &GateCarrierCode);
    gate_replace_carriers_with_scratch(owner);
    GateSignalMapping = gate_touch_scratch(owner->arena);
    if (sigsetjmp(owner->signal_jump, 1) == 0) {
        owner->signal_recovery_active = true;
        raise(signal_number);
        gate_fail("signal did not reach the scratch recovery landing");
    }
    if (owner->pending_signal != signal_number ||
        owner->release_state != COLD_CODEGEN_SCRATCH_ACTIVE) {
        gate_fail("signal recovery landing lost owner identity");
    }
    cold_codegen_scratch_fail(owner);
    if (sigaction(signal_number, &previous, 0) != 0)
        gate_fail("codegen signal handler restore failed");
    if (ColdCodegenScratchTop ||
        ColdCodegenScratchBeginCount != begin_before + 1 ||
        ColdCodegenScratchReleaseCount != release_before + 1 ||
        ColdCodegenScratchFailureReleaseCount != failure_before + 1 ||
        ColdCodegenScratchLiveCount != live_before) {
        gate_fail("signal failure release counters are not balanced");
    }
    gate_require_carriers_restored();
    gate_require_unmapped(GateSignalMapping);
}

static void gate_release_internal_failure(void) {
    pid_t child = fork();
    if (child < 0) gate_fail("release-internal child fork failed");
    if (child == 0) {
        ColdErrorRecoveryEnabled = true;
        ColdErrorJumpDepth = 1;
        if (setjmp(ColdErrorJumpStack[0]) != 0) {
            _exit(90);
        }
        ColdCodegenScratchOwner *owner = cold_codegen_scratch_begin();
        (void)arena_alloc(owner->arena, 64);
        owner->arena->owned_symbol_bytes = 1;
        cold_codegen_scratch_end(owner);
        _exit(91);
    }
    int status = 0;
    if (waitpid(child, &status, 0) != child)
        gate_fail("release-internal child wait failed");
    if (!WIFEXITED(status) || WEXITSTATUS(status) != 2) {
        gate_fail("release-internal failure did not hard-fail live owner");
    }
}

int main(void) {
    if (ColdCodegenScratchTop ||
        ColdCodegenScratchLiveCount != 0) {
        gate_fail("scratch state was not initially empty");
    }
    gate_success_release();
    gate_die_failure_release();
    gate_signal_failure_release(SIGSEGV);
    gate_signal_failure_release(SIGBUS);
    gate_release_internal_failure();
    if (ColdCodegenScratchTop ||
        ColdCodegenScratchLiveCount != 0 ||
        ColdCodegenScratchBeginCount != 4 ||
        ColdCodegenScratchReleaseCount != 4 ||
        ColdCodegenScratchFailureReleaseCount != 3) {
        gate_fail("terminal scratch ledger is not balanced");
    }
    puts("cold_codegen_scratch_lifetime_gate_status=PASS");
    puts("cold_codegen_scratch_begin_count=4");
    puts("cold_codegen_scratch_release_count=4");
    puts("cold_codegen_scratch_failure_release_count=3");
    puts("cold_codegen_scratch_live_count=0");
    puts("cold_codegen_scratch_signal_recovery=PROVED");
    puts("cold_codegen_scratch_carrier_restore=PROVED");
    puts("cold_codegen_scratch_release_internal_failure=HARD_FAIL");
    return 0;
}
