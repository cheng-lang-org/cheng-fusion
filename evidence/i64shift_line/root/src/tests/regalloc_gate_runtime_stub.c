#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern int32_t regallocGateCrossHeapAndCall(int32_t seed);
extern int32_t regallocGateCallerSavedClobber(int32_t seed);
extern int32_t regallocGatePressure(int32_t seed);
extern int32_t regallocGateLoopBranchPhi(int32_t seed);
extern int32_t regallocGateParallelCopyCritical(int32_t seed);
extern int32_t regallocGateStackArgsRoundTrip(int32_t seed);

typedef struct {
    int32_t a;
    int32_t b;
    int32_t c;
    int32_t d;
    int32_t e;
    int32_t f;
} RegallocGateWideAggregate;

extern RegallocGateWideAggregate regallocGateMakeWideAggregate(int32_t seed);
extern int32_t regallocGateConsumeWideAggregate(RegallocGateWideAggregate value);
extern int32_t regallocGateByAddressAcrossClobber(
    RegallocGateWideAggregate *value, int32_t seed);
extern int32_t regallocGateWideAggregateRoundTrip(int32_t seed);
typedef struct {
    int32_t len;
    int32_t cap;
    void *buffer;
} RegallocGateI32Seq;
extern int32_t regallocGateDynamicSeqIndexed(
    RegallocGateI32Seq *values, int32_t index);
extern int32_t regalloc_gate_verify_callee_saved(void);
extern int32_t regalloc_gate_verify_sret(void);
extern int32_t regalloc_gate_verify_frame_and_sp(void);

void *cheng_malloc(int32_t size) {
    int32_t allocation_size = size;
    if (allocation_size <= 0) allocation_size = 1;
    return calloc(1, (size_t)allocation_size);
}

void setMem(void *destination, int32_t value, int32_t size) {
    if (destination == NULL || size <= 0) return;
    memset(destination, value, (size_t)size);
}

int main(void) {
    int32_t cross = regallocGateCrossHeapAndCall(7);
    int32_t caller = regallocGateCallerSavedClobber(7);
    int32_t pressure = regallocGatePressure(3);
    int32_t phi = regallocGateLoopBranchPhi(100);
    int32_t parallel = regallocGateParallelCopyCritical(7);
    int32_t stack_args = regallocGateStackArgsRoundTrip(0);
    RegallocGateWideAggregate made = regallocGateMakeWideAggregate(3);
    int32_t aggregate_before = regallocGateConsumeWideAggregate(made);
    int32_t by_address = regallocGateByAddressAcrossClobber(&made, 3);
    int32_t aggregate_after = regallocGateConsumeWideAggregate(made);
    int32_t aggregate = regallocGateWideAggregateRoundTrip(3);
    int32_t indexed_values[4] = {5, 7, 11, 13};
    RegallocGateI32Seq indexed_header = {4, 4, indexed_values};
    int32_t dynamic_indexed =
        regallocGateDynamicSeqIndexed(&indexed_header, 2);
    int32_t callee_saved = regalloc_gate_verify_callee_saved();
    int32_t sret = regalloc_gate_verify_sret();
    int32_t frame_sp = regalloc_gate_verify_frame_and_sp();

    printf("regalloc_gate_runtime cross=%d caller=%d pressure=%d phi=%d parallel=%d stack_args=%d aggregate_before=%d by_address=%d aggregate_after=%d aggregate=%d dynamic_indexed=%d callee_saved=%d sret=%d frame_sp=%d\n",
           cross, caller, pressure, phi, parallel, stack_args, aggregate_before,
           by_address, aggregate_after, aggregate, dynamic_indexed,
           callee_saved, sret,
           frame_sp);
    if (cross != 1480) return 11;
    if (caller != 241) return 12;
    if (pressure != 483) return 13;
    if (phi != 50) return 14;
    if (parallel != 1573) return 15;
    if (stack_args != 385) return 24;
    if (aggregate_before != 337) return 16;
    if (by_address != 416) return 17;
    if (made.a != 109 || made.f != 165) return 18;
    if (aggregate_after != 1293) return 19;
    if (aggregate != 2046) return 20;
    if (dynamic_indexed != 1200 || indexed_values[2] != 31) return 25;
    if (callee_saved != 1) return 21;
    if (sret != 1) return 22;
    if (frame_sp != 1) return 23;
    return 0;
}
