/* cold_context.h -- exact process-local compilation authority rows.
 *
 * These rows are deliberately non-portable.  Context ids, epochs, row
 * ordinals, pointers, worker scheduling and counters must never enter a
 * source receipt, CSGC, facts_root or proof.
 */
#ifndef COLD_CONTEXT_H
#define COLD_CONTEXT_H

#include <stdbool.h>
#include <stdint.h>
#include <stdatomic.h>

struct Arena;

typedef enum ColdCompilationContextState {
    COLD_COMPILATION_CONTEXT_EMPTY = 0,
    COLD_COMPILATION_CONTEXT_ACTIVE = 1,
    COLD_COMPILATION_CONTEXT_POISONED = 2,
    COLD_COMPILATION_CONTEXT_DRAINING = 3,
    COLD_COMPILATION_CONTEXT_RELEASED = 4,
} ColdCompilationContextState;

typedef enum ColdSymbolScopeState {
    COLD_SYMBOL_SCOPE_EMPTY = 0,
    COLD_SYMBOL_SCOPE_LIVE_PRESEAL = 1,
    COLD_SYMBOL_SCOPE_SOURCE_BOUND = 2,
    COLD_SYMBOL_SCOPE_ABORTED = 3,
    COLD_SYMBOL_SCOPE_CLOSED = 4,
} ColdSymbolScopeState;

typedef enum ColdSourceSnapshotState {
    COLD_SOURCE_SNAPSHOT_EMPTY = 0,
    COLD_SOURCE_SNAPSHOT_BUILDING = 1,
    COLD_SOURCE_SNAPSHOT_SEALED = 2,
    COLD_SOURCE_SNAPSHOT_ABORTED = 3,
    COLD_SOURCE_SNAPSHOT_DETACHED = 4,
} ColdSourceSnapshotState;

typedef enum ColdSymbolScopeRole {
    COLD_SYMBOL_SCOPE_ROLE_ROOT = 1,
    COLD_SYMBOL_SCOPE_ROLE_TYPE_SCAN = 2,
} ColdSymbolScopeRole;

typedef enum ColdWorkerLeaseState {
    COLD_WORKER_LEASE_EMPTY = 0,
    COLD_WORKER_LEASE_RESERVED = 1,
    COLD_WORKER_LEASE_RUNNING = 2,
    COLD_WORKER_LEASE_EXITED = 3,
    COLD_WORKER_LEASE_JOINED = 4,
    COLD_WORKER_LEASE_CANCELLED = 5,
} ColdWorkerLeaseState;

typedef enum ColdWorkerLeaseResult {
    COLD_WORKER_RESULT_NONE = 0,
    COLD_WORKER_RESULT_OK = 1,
    COLD_WORKER_RESULT_ERROR = 2,
} ColdWorkerLeaseResult;

typedef enum ColdWorkerRole {
    COLD_WORKER_ROLE_CODEGEN = 1,
    COLD_WORKER_ROLE_IMPORT_BODY = 2,
    COLD_WORKER_ROLE_IMPORT_SIGNATURE = 3,
} ColdWorkerRole;

typedef struct ColdCompilationContextRows {
    uint64_t *context_ids;
    uint8_t *states;
    int32_t *begin_jump_depths;
    uint64_t *source_epoch_counters;
    uint64_t *active_source_epochs;
    uint64_t *scope_epoch_counters;
    int32_t *active_snapshot_rows;
    int32_t *outstanding_worker_leases;
    _Atomic uint8_t *stop_requested;
    _Atomic int32_t *first_failed_worker_rows;
    int32_t count;
    int32_t cap;
} ColdCompilationContextRows;

typedef struct ColdSymbolScopeRows {
    int32_t *context_rows;
    uint64_t *context_ids;
    int32_t *parent_scope_rows;
    uint64_t *symbol_scope_epochs;
    uint64_t *bound_source_seal_epochs;
    uint8_t *roles;
    uint8_t *states;
    int32_t count;
    int32_t cap;
} ColdSymbolScopeRows;

typedef struct ColdWorkerLeaseRows {
    int32_t *context_rows;
    uint64_t *context_ids;
    uint64_t *source_seal_epochs;
    int32_t *symbol_scope_rows;
    uint64_t *symbol_scope_epochs;
    uint8_t *worker_roles;
    uint8_t *states;
    _Atomic uint8_t *result_codes;
    int32_t count;
    int32_t cap;
} ColdWorkerLeaseRows;

typedef struct ColdCompilationContext {
    struct Arena *arena;
    ColdCompilationContextRows contexts;
    ColdSymbolScopeRows symbol_scopes;
    ColdWorkerLeaseRows worker_leases;
    int32_t context_row;
    bool claim_held;
    bool initialized;
} ColdCompilationContext;

#endif
