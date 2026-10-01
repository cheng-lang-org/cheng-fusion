/* cold_types.h -- shared type definitions for cold bootstrap compiler
 *
 * Shared by cheng_cold.c (backend) and cold_parser.c (frontend/parser).
 *
 * Build: #include "cold_types.h" (after standard headers)
 */
#ifndef COLD_TYPES_H
#define COLD_TYPES_H

#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>
#include <limits.h>
#include <sys/mman.h>
#include <unistd.h>
#include <setjmp.h>
#include <stdatomic.h>

#include "cold_context.h"

/* ================================================================
 * Span — defined early because extern globals use it
 * ================================================================ */
typedef struct Span {
    const uint8_t *ptr;
    int32_t len;
} Span;

#define COLD_MAX_VARIANT_FIELDS 64
#define COLD_MAX_OBJECT_FIELDS 1024
#define COLD_MAX_TYPE_VARIANTS COLD_MAX_OBJECT_FIELDS

/* ================================================================
 * Extern global state (defined in cheng_cold.c)
 * ================================================================ */
extern bool cold_diag_dump_per_fn;
extern bool cold_diag_dump_slots;
extern char ColdDieError[512];
extern char ColdDieReportPath[PATH_MAX];
extern char **ColdArgv0;
extern jmp_buf ColdErrorJumpStack[16];
extern int ColdErrorJumpDepth;
extern bool ColdErrorRecoveryEnabled;
extern jmp_buf ColdImportSegvJumpBuf;
extern bool ColdImportSegvActive;
extern int ColdImportSegvSaw;
extern bool ColdImportBodyCompilationActive;
extern Span cold_cached_minimal_macho;

/* ================================================================
 * Forward declarations
 * ================================================================ */
struct ArenaPage;
struct Arena;
struct ColdImportSource;

/* ================================================================
 * Arena
 * ================================================================ */
#define ARENA_PAGE 65536

typedef struct ArenaPage {
    struct ArenaPage *next;
    uint8_t *base;
    uint8_t *ptr;
    uint8_t *end;
} ArenaPage;

struct Arena;
typedef void (*ArenaCleanupCallback)(void *context);

typedef struct ArenaCleanup {
    struct ArenaCleanup *previous;
    struct ArenaCleanup *next;
    struct Arena *arena;
    ArenaCleanupCallback callback;
    void *context;
    bool registered;
} ArenaCleanup;

typedef struct Arena {
    ArenaPage *head;
    ArenaPage *current;
    size_t used;
    size_t owned_slab_bytes;
    size_t owned_symbol_bytes;
    uintptr_t owned_address_min;
    uintptr_t owned_address_max;
    ArenaCleanup *cleanup_head;
    /* Phase tracking for 30-80ms architecture compliance */
    int32_t phase_count;
    size_t phase_start_used[8];
    uint64_t phase_start_us[8];
    const char *phase_name[8];
    int32_t phase_page_count[8];   /* pages at phase start */
} Arena;

/* ================================================================
 * Contract types
 * ================================================================ */
#define COLD_CONTRACT_MAX_FIELDS 128

typedef struct ContractField {
    Span key;
    Span value;
} ContractField;

typedef struct ColdContract {
    Span source;
    const char *source_path;
    ContractField fields[COLD_CONTRACT_MAX_FIELDS];
    int32_t count;
} ColdContract;

#define COLD_ENTRY_CHAIN_CAP 8
#define COLD_COMMAND_CASE_CAP 16
#define COLD_NAME_CAP 128
#define COLD_ENTRY_ERROR_CAP 256

typedef struct ColdEntryChainStep {
    char function[COLD_NAME_CAP];
    char kind[64];
    char target[COLD_NAME_CAP];
    char aux[192];
} ColdEntryChainStep;

typedef struct ColdDispatchCase {
    int32_t code;
    char target[COLD_NAME_CAP];
} ColdDispatchCase;

typedef struct ColdCommandCase {
    char text[64];
    int32_t code;
} ColdCommandCase;

typedef struct ColdManifestStats {
    int32_t source_count;
    int32_t missing_count;
    int32_t import_count;
    int32_t function_count;
    int32_t type_block_count;
    int32_t const_block_count;
    int32_t importc_count;
    int32_t declaration_count;
    int32_t function_symbol_count;
    int32_t function_symbol_error_count;
    int32_t entry_function_found;
    int32_t entry_function_line;
    int32_t entry_function_source_start;
    int32_t entry_function_source_len;
    int32_t entry_function_params_start;
    int32_t entry_function_params_len;
    int32_t entry_function_return_start;
    int32_t entry_function_return_len;
    int32_t entry_function_body_start;
    int32_t entry_function_body_len;
    int32_t entry_function_has_body;
    int32_t entry_semantics_ok;
    int32_t entry_chain_step_count;
    int32_t entry_dispatch_case_count;
    int32_t entry_dispatch_default;
    int32_t entry_command_case_count;
    int32_t entry_command_default;
    uint64_t total_bytes;
    uint64_t total_lines;
    uint64_t tree_hash;
    uint64_t declaration_hash;
    char first_missing[PATH_MAX];
    char entry_source[PATH_MAX];
    char entry_function[128];
    char entry_semantics_error[COLD_ENTRY_ERROR_CAP];
    ColdEntryChainStep entry_chain[COLD_ENTRY_CHAIN_CAP];
    ColdDispatchCase entry_dispatch_cases[COLD_COMMAND_CASE_CAP];
    ColdCommandCase entry_command_cases[COLD_COMMAND_CASE_CAP];
} ColdManifestStats;

typedef struct ColdSourceScanStats {
    int32_t import_count;
    int32_t function_count;
    int32_t type_block_count;
    int32_t const_block_count;
    int32_t importc_count;
    int32_t declaration_count;
    int32_t function_symbol_count;
    int32_t function_symbol_error_count;
    int32_t entry_function_found;
    int32_t entry_function_line;
    int32_t entry_function_source_start;
    int32_t entry_function_source_len;
    int32_t entry_function_params_start;
    int32_t entry_function_params_len;
    int32_t entry_function_return_start;
    int32_t entry_function_return_len;
    int32_t entry_function_body_start;
    int32_t entry_function_body_len;
    int32_t entry_function_has_body;
    uint64_t line_count;
    uint64_t byte_count;
    uint64_t declaration_hash;
} ColdSourceScanStats;

typedef struct ColdFunctionSymbol {
    Span name;
    Span params;
    Span return_type;
    Span body;
    Span source_span;
    Span import_name;
    Span export_name;
    Span ffi_owned_result_free;
    bool borrows_args;
    /* Exact source-declared `@thread_boundary` contract flag (scan-side
       twin of FnDef::thread_boundary).  The annotation states that the
       function hands its context-bearing argument across a runtime thread
       boundary; the caller-visible ownership transfer is therefore resolved
       by the callee contract + caller CFG audit, never by callee name. */
    bool thread_boundary;
    int32_t result_ownership_summary;
    int32_t abi_internal;
    int32_t line;
    int32_t has_body;
    Span generic_names[4];
    int32_t generic_count;
    int32_t module_source_row;
    int32_t token_byte_offset;
} ColdFunctionSymbol;

/* ================================================================
 * SoA BodyIR
 * ================================================================ */
enum {
    BODY_OP_NOP = 0,
    BODY_OP_I32_CONST = 1,
    BODY_OP_LOAD_I32 = 2,
    BODY_OP_MAKE_VARIANT = 3,
    BODY_OP_TAG_LOAD = 4,
    BODY_OP_PAYLOAD_LOAD = 5,
    BODY_OP_CALL_I32 = 6,
    BODY_OP_COPY_I32 = 7,
    BODY_OP_I32_ADD = 8,
    BODY_OP_I32_SUB = 9,
    BODY_OP_STR_LITERAL = 10,
    BODY_OP_STR_LEN = 11,
    BODY_OP_CALL_COMPOSITE = 12,
    BODY_OP_COPY_COMPOSITE = 13,
    BODY_OP_UNWRAP_OR_RETURN = 14,
    BODY_OP_MAKE_COMPOSITE = 15,
    BODY_OP_MAKE_SEQ_I32 = 16,
    BODY_OP_SEQ_I32_INDEX = 17,
    BODY_OP_ARRAY_I32_INDEX_DYNAMIC = 18,
    BODY_OP_SEQ_I32_INDEX_DYNAMIC = 19,
    BODY_OP_I32_MUL = 20,
    BODY_OP_I32_ASR = 21,
    BODY_OP_I32_AND = 22,
    BODY_OP_STR_EQ = 23,
    BODY_OP_SEQ_I32_ADD = 24,
    BODY_OP_FIELD_REF = 25,
    BODY_OP_STR_REF_STORE = 26,
    BODY_OP_STR_CONCAT = 27,
    BODY_OP_I32_DIV = 28,
    BODY_OP_I32_TO_STR = 29,
    BODY_OP_PAYLOAD_STORE = 30,
    BODY_OP_STR_INDEX = 31,
    BODY_OP_SEQ_STR_INDEX_DYNAMIC = 32,
    BODY_OP_SEQ_STR_ADD = 33,
    BODY_OP_I32_CMP = 34,
    BODY_OP_I32_REF_LOAD = 35,
    BODY_OP_I32_REF_STORE = 36,
    BODY_OP_I32_OR = 37,
    BODY_OP_PTR_CONST = 38,
    BODY_OP_WRITE_LINE = 39,
    BODY_OP_WRITE_RAW = 115,
    BODY_OP_ARGC_LOAD = 40,
    BODY_OP_ARGV_STR = 41,
    BODY_OP_CWD_STR = 42,
    BODY_OP_PATH_JOIN = 43,
    BODY_OP_PATH_ABSOLUTE = 44,
    BODY_OP_PATH_PARENT = 45,
    BODY_OP_PATH_EXISTS = 46,
    BODY_OP_PATH_FILE_SIZE = 47,
    BODY_OP_PATH_WRITE_TEXT = 48,
    BODY_OP_TEXT_CONTAINS = 49,
    BODY_OP_MKDIR_ONE = 50,
    BODY_OP_ARRAY_I32_INDEX_STORE = 51,
    BODY_OP_SEQ_I32_INDEX_STORE = 52,
    BODY_OP_I32_MOD = 53,
    BODY_OP_I32_SHL = 54,
    BODY_OP_I32_XOR = 55,
    BODY_OP_TIME_NS = 56,
    BODY_OP_GETENV_STR = 57,
    BODY_OP_PARSE_INT = 58,
    BODY_OP_STR_JOIN = 59,
    BODY_OP_STR_SPLIT_CHAR = 60,
    BODY_OP_STR_STRIP = 61,
    BODY_OP_TEXT_SET_INIT = 62,
    BODY_OP_TEXT_SET_INSERT = 63,
    BODY_OP_GETRUSAGE = 64,
    BODY_OP_EXIT = 65,
    BODY_OP_STR_SLICE = 66,
    BODY_OP_READ_FLAG = 67,
    BODY_OP_SHELL_QUOTE = 68,
    BODY_OP_BRK = 69,
    BODY_OP_PATH_READ_TEXT = 70,
    BODY_OP_REMOVE_FILE = 71,
    BODY_OP_CHMOD_X = 72,
    BODY_OP_COLD_SELF_EXEC = 73,
    BODY_OP_I64_CONST = 74,
    BODY_OP_COPY_I64 = 75,
    BODY_OP_I64_FROM_I32 = 76,
    BODY_OP_I64_ADD = 77,
    BODY_OP_I64_SUB = 78,
    BODY_OP_I64_MUL = 79,
    BODY_OP_I64_DIV = 80,
    BODY_OP_I64_CMP = 81,
    BODY_OP_I64_TO_STR = 82,
    BODY_OP_OPEN = 83,
    BODY_OP_READ = 84,
    BODY_OP_CLOSE = 85,
    BODY_OP_MMAP = 86,
    BODY_OP_ATOMIC_LOAD_I32 = 87,
    BODY_OP_ATOMIC_STORE_I32 = 88,
    BODY_OP_ATOMIC_CAS_I32 = 89,
    BODY_OP_PTR_LOAD_I32 = 90,
    BODY_OP_PTR_STORE_I32 = 91,
    BODY_OP_PTR_LOAD_I64 = 92,
    BODY_OP_PTR_STORE_I64 = 93,
    BODY_OP_WRITE_BYTES = 94,
    BODY_OP_F32_CONST = 95,
    BODY_OP_F64_CONST = 96,
    BODY_OP_F32_ADD = 97,
    BODY_OP_F64_ADD = 98,
    BODY_OP_F32_SUB = 99,
    BODY_OP_F64_SUB = 100,
    BODY_OP_F32_MUL = 101,
    BODY_OP_F64_MUL = 102,
    BODY_OP_F32_DIV = 103,
    BODY_OP_F64_DIV = 104,
    BODY_OP_F32_CMP = 105,
    BODY_OP_F64_CMP = 106,
    BODY_OP_F32_NEG = 107,
    BODY_OP_F64_NEG = 108,
    BODY_OP_F32_FROM_I32 = 109,
    BODY_OP_I32_FROM_F32 = 110,
    BODY_OP_F64_FROM_I32 = 111,
    BODY_OP_I32_FROM_F64 = 112,
    BODY_OP_F64_FROM_I64 = 157,
    BODY_OP_I64_FROM_F64 = 158,
    BODY_OP_FN_ADDR = 113,
    BODY_OP_CALL_PTR = 114,
    BODY_OP_MAKE_SEQ_OPAQUE = 116,
    BODY_OP_SLOT_STORE_I32 = 117,
    BODY_OP_SLOT_STORE_I64 = 118,
    BODY_OP_EXEC_SHELL = 119,
    BODY_OP_SEQ_OPAQUE_INDEX_DYNAMIC = 120,
    BODY_OP_SEQ_OPAQUE_ADD = 121,
    BODY_OP_SEQ_OPAQUE_INDEX_STORE = 122,
    BODY_OP_SEQ_OPAQUE_REMOVE = 123,
    BODY_OP_I64_AND = 124,
    BODY_OP_I64_OR = 125,
    BODY_OP_I64_XOR = 126,
    BODY_OP_I64_SHL = 127,
    BODY_OP_I64_ASR = 128,
    BODY_OP_I32_FROM_I64 = 129,
    BODY_OP_ASSERT = 130,
    BODY_OP_STR_SELECT_NONEMPTY = 131,
    BODY_OP_CLOSURE_NEW = 132,
    BODY_OP_CLOSURE_CALL = 133,
    BODY_OP_PATH_WRITE_BYTES = 134,
    BODY_OP_PTR_ADD = 135,
    BODY_OP_COPY_RAW = 136,
    BODY_OP_PATH_IS_ABSOLUTE = 137,
    BODY_OP_THREAD_YIELD = 138,
    BODY_OP_SET_RAW = 139,
    BODY_OP_BYTES_ALLOC = 140,
    BODY_OP_SELECT = 141,
    BODY_OP_SEQ_SET_LEN = 142,
    BODY_OP_PTR_LOAD_U8 = 143,
    BODY_OP_PTR_STORE_U8 = 144,
    BODY_OP_SEQ_OPAQUE_INDEX_REF_DYNAMIC = 145,
    BODY_OP_HEAP_ALLOC = 146,
    BODY_OP_HEAP_FREE = 147,
    BODY_OP_BYTES_TO_HEX = 148,
    BODY_OP_BYTES_GET = 149,
    BODY_OP_BYTES_SET = 150,
    BODY_OP_ATOMIC_ADD_I32 = 151,
    BODY_OP_PTR_LOAD_U16 = 152,
    BODY_OP_PTR_STORE_U16 = 153,
    BODY_OP_ARRAY_OPAQUE_INDEX_DYNAMIC = 154,
    BODY_OP_ARRAY_OPAQUE_INDEX_REF_DYNAMIC = 155,
    BODY_OP_GLOBAL_ADDR = 156,
    BODY_OP_LOCAL_ADDR = 159,
    BODY_OP_STR_INDEX_STORE = 160,
    BODY_OP_ARGV_PTR = 161,
    BODY_OP_I64_FROM_U32 = 162,
    BODY_OP_I64_LSR = 163,
    BODY_OP_I32_LSR = 164,
    BODY_OP_WRITE_TEXT = 165,
    BODY_OP_FGETC = 166,
    /* Specialization-only placeholder. Concrete BodyIR admission rejects it. */
    BODY_OP_TYPE_SIZE = 167,
    /* dst=old owned value, a=unique managed ref, b=new owned value,
       c=target borrow value-definition row. */
    BODY_OP_MANAGED_REF_MOVE_REPLACE = 168,
    BODY_OP_EXACT_PLAIN_SCOPE_END = 169,
    /* Move one owned opaque-sequence element into dst. a=sequence,
       b=index, c=canonical element TypeId. The physical source bytes are
       zeroed after the complete stride is copied. */
    BODY_OP_SEQ_OPAQUE_TAKE_DYNAMIC = 170,
    /* Finalize one str[] literal after every element is either moved as an
       owner or transferred as an exact resource-free STR_LITERAL record.
       dst=sequence, a=empty MAKE_COMPOSITE op, b=first append op, c=exact
       append count. This is an ownership fact and emits no code. */
    BODY_OP_MAKE_SEQ_STR = 171,
};

typedef struct ColdBodyOpSchema {
    int16_t kind;
    bool reads_a_slot;
    bool reads_b_slot;
    bool reads_c_slot;
    bool reads_dst_slot;
    bool writes_dst_slot;
    uint8_t mutation_referent_mask;
    bool has_side_effect;
    uint8_t target_support_mask;
} ColdBodyOpSchema;

enum {
    COLD_BODY_ACCESS_NONE = 0,
    COLD_BODY_ACCESS_DST = 1 << 0,
    COLD_BODY_ACCESS_A = 1 << 1,
    COLD_BODY_ACCESS_B = 1 << 2,
    COLD_BODY_ACCESS_C = 1 << 3,
};

enum {
    COLD_BODY_TARGET_A64 = 1 << 0,
    COLD_BODY_TARGET_X64 = 1 << 1,
    COLD_BODY_TARGET_RV64 = 1 << 2,
    COLD_BODY_TARGET_WASM = 1 << 3,
    COLD_BODY_TARGET_NATIVE = COLD_BODY_TARGET_A64 |
                              COLD_BODY_TARGET_X64 |
                              COLD_BODY_TARGET_RV64,
    COLD_BODY_TARGET_A64_X64 = COLD_BODY_TARGET_A64 |
                               COLD_BODY_TARGET_X64,
    COLD_BODY_TARGET_A64_X64_WASM = COLD_BODY_TARGET_A64 |
                                    COLD_BODY_TARGET_X64 |
                                    COLD_BODY_TARGET_WASM,
    COLD_BODY_TARGET_ALL = COLD_BODY_TARGET_NATIVE |
                           COLD_BODY_TARGET_WASM,
};

const ColdBodyOpSchema *cold_body_op_schema(int32_t kind);

#ifndef COLD_TYPE_SIZE_MODE_DEFINED
#define COLD_TYPE_SIZE_MODE_DEFINED 1
enum {
    COLD_TYPE_SIZE_MODE_ELEM = 1,
    COLD_TYPE_SIZE_MODE_SIZEOF = 2,
};
#endif

enum {
    COLD_MMAP_MODE_RAW = 0,
    COLD_MMAP_MODE_MANAGED_REF = 1,
};

enum {
    BODY_TERM_RET = 1,
    BODY_TERM_BR = 2,
    BODY_TERM_CBR = 3,
    BODY_TERM_SWITCH = 4,
    BODY_TERM_UNREACHABLE = 5,
};

enum {
    COND_EQ = 0,
    COND_NE = 1,
    COND_HS = 2,
    COND_LO = 3,
    COND_MI = 4,
    COND_HI = 8,
    COND_LS = 9,
    COND_GE = 10,
    COND_LT = 11,
    COND_GT = 12,
    COND_LE = 13,
};

enum {
    SLOT_I32 = 1,
    SLOT_VARIANT = 2,
    SLOT_STR = 3,
    SLOT_PTR = 4,
    SLOT_OBJECT = 5,
    SLOT_ARRAY_I32 = 6,
    SLOT_SEQ_I32 = 7,
    SLOT_SEQ_I32_REF = 8,
    SLOT_OBJECT_REF = 9,
    SLOT_SEQ_STR = 10,
    SLOT_STR_REF = 11,
    SLOT_SEQ_STR_REF = 12,
    SLOT_OPAQUE = 13,
    SLOT_OPAQUE_REF = 14,
    SLOT_SEQ_OPAQUE = 15,
    SLOT_I32_REF = 16,
    SLOT_I64 = 17,
    SLOT_I64_REF = 18,
    SLOT_F32 = 19,
    SLOT_F64 = 20,
    SLOT_SEQ_OPAQUE_REF = 21,
};

enum {
    COLD_STR_DATA_OFFSET = 0,
    COLD_STR_LEN_OFFSET = 8,
    COLD_STR_STORE_ID_OFFSET = 12,
    COLD_STR_FLAGS_OFFSET = 16,
    COLD_STR_SLOT_SIZE = 24,
};

enum {
    COLD_MANAGED_VAR_REPLACE_HELPER_NONE = 0,
    COLD_MANAGED_VAR_REPLACE_HELPER_STR = 1,
};

#define COLD_MAX_I32_PARAMS 128

typedef struct ColdDominatorCache {
    int32_t block_count;
    int32_t term_count;
    int32_t switch_count;
    int32_t pending_edge_from;
    int32_t pending_edge_to;
    int32_t reachable_count;
    int32_t edge_count;
    int32_t *idom;
    int32_t *preorder;
    int32_t *postorder;
    int32_t *predecessor_offsets;
    int32_t *predecessors;
    int32_t query_flow_entry_block;
    int32_t query_flow_end_exclusive;
    int32_t query_block;
    int32_t query_relevant_count;
    int32_t query_has_backedge;
    int32_t *query_relevant;
    int32_t *query_queue;
} ColdDominatorCache;

typedef struct ColdExactConsumerIndex ColdExactConsumerIndex;

typedef struct BodyIR {
    int32_t *op_kind;
    int32_t *op_dst;
    int32_t *op_a;
    int32_t *op_b;
    int32_t *op_c;
    int32_t *op_block_index;
    int32_t *op_value_def_slot;
    int32_t *op_value_def_exact_type_id;
    int32_t *op_value_def_producer_function_row;
    int32_t *op_value_def_place_kind;
    int32_t *op_value_def_ownership;
    int32_t *op_value_def_origin_id;
    int32_t *op_value_def_consume_op_index_plus_one;
    int32_t *op_source_value_def_op_id;
    int32_t *op_exact_source_dst_value_def_op_id;
    int32_t *op_exact_source_a_value_def_op_id;
    int32_t *op_exact_source_b_value_def_op_id;
    int32_t *op_exact_source_c_value_def_op_id;
    int32_t op_count;
    int32_t op_cap;
    int32_t op_block_indexed_op_count;

    int32_t *exact_borrowed_rebind_op_ids;
    int32_t *exact_borrowed_rebind_prior_def_ids;
    int32_t *exact_borrowed_rebind_block_ids;
    int32_t *exact_borrowed_rebind_predecessor_block_ids;
    int32_t *exact_borrowed_rebind_predecessor_term_ids;
    int32_t exact_borrowed_rebind_count;
    int32_t exact_borrowed_rebind_cap;
    int32_t *exact_borrowed_merge_input_op_ids;
    int32_t *exact_borrowed_merge_source_def_ids;
    int32_t *exact_borrowed_merge_input_block_ids;
    int32_t *exact_borrowed_merge_input_predecessor_block_ids;
    int32_t *exact_borrowed_merge_input_predecessor_term_ids;
    int32_t *exact_borrowed_merge_phi_merge_def_ids;
    int32_t exact_borrowed_merge_count;
    int32_t exact_borrowed_merge_cap;
    int32_t *exact_borrowed_lift_input_op_ids;
    int32_t *exact_borrowed_lift_source_def_ids;
    int32_t *exact_borrowed_lift_shared_owner_def_ids;
    int32_t *exact_borrowed_lift_input_block_ids;
    int32_t *exact_borrowed_lift_input_term_ids;
    int32_t *exact_borrowed_lift_phi_merge_def_ids;
    int32_t exact_borrowed_lift_count;
    int32_t exact_borrowed_lift_cap;
    int32_t *exact_loop_owner_closure_def_ids;
    int32_t exact_loop_owner_closure_count;
    int32_t exact_loop_owner_closure_cap;

    int32_t *term_kind;
    int32_t *term_value;
    int32_t *term_case_start;
    int32_t *term_case_count;
    int32_t *term_true_block;
    int32_t *term_false_block;
    int32_t *term_source_value_def_op_id;
    int32_t term_count;
    int32_t term_cap;

    int32_t *block_op_start;
    int32_t *block_op_count;
    int32_t *block_term;
    int32_t block_count;
    int32_t block_cap;

    int32_t *slot_kind;
    int32_t *slot_offset;
    int32_t *slot_size;
    int32_t *slot_aux;
    Span *slot_type;
    int32_t *slot_no_alias;
    int32_t *slot_exact_type_id;
    int32_t *slot_place_kind;
    int32_t *slot_origin_id;
    int32_t *slot_managed_storage_kind;
    int32_t slot_count;
    int32_t slot_cap;
    int32_t frame_size;
    int32_t producer_function_row;

    int32_t *switch_tag;
    int32_t *switch_block;
    int32_t *switch_term;
    int32_t switch_count;
    int32_t switch_cap;

    int32_t *call_arg_slot;
    int32_t *call_arg_offset;
    int32_t *call_arg_value_def_op_id;
    int32_t *call_arg_place_kind;
    int32_t *call_arg_ownership;
    int32_t *call_arg_origin_id;
    int32_t call_arg_count;
    int32_t call_arg_cap;

    Span *string_literal;
    int32_t string_literal_count;
    int32_t string_literal_cap;

    int32_t param_count;
    int32_t param_slot[COLD_MAX_I32_PARAMS];
    Span param_name[COLD_MAX_I32_PARAMS];
    int32_t return_kind;
    int32_t return_size;
    Span return_type;
    Span debug_name;
    int32_t sret_slot;
    int32_t x64_sret_shadow_offset;
    bool has_fallback;
    int32_t declaration_origin_row;
    int32_t source_line;
    const char *source_path;
    int32_t cur_open_block;

    Arena *arena;
    void *op_slab_owner;
    size_t op_slab_bytes;
    void *slot_slab_owner;
    size_t slot_slab_bytes;
    void *call_arg_slab_owner;
    size_t call_arg_slab_bytes;
    ArenaCleanup owned_slab_cleanup;

    int32_t mm_body_id;
    int32_t mm_clone_source_id;
    int32_t mm_rep_op_count;
    int32_t mm_rep_slot_count;
    int32_t mm_rep_call_arg_count;
    int32_t pending_dominator_edge_from;
    int32_t pending_dominator_edge_to;
    ColdDominatorCache *dominators_cache;
    ColdExactConsumerIndex *exact_consumer_index;
    uint8_t *exact_var_provenance_certificates;
    int32_t exact_var_provenance_certificate_cap;
} BodyIR;

_Static_assert(COLD_MAX_I32_PARAMS == 128,
               "cold split ABI parameter capacity drift");
_Static_assert(BODY_OP_MAKE_SEQ_STR == 171,
               "cold split BodyOp enum drift");
_Static_assert(BODY_TERM_UNREACHABLE == 5,
               "cold split terminator enum drift");

/* ================================================================
 * Symbol table types
 * ================================================================ */
typedef struct Variant {
    Span name;
    int32_t tag;
    int32_t field_count;
    int32_t *field_kind;
    int32_t *field_size;
    int32_t *field_offset;
    Span *field_type;
} Variant;

typedef struct TypeDef {
    Span name;
    Variant *variants;
    int32_t variant_count;
    Span *generic_names;
    int32_t generic_count;
    int32_t max_field_count;
    int32_t max_slot_size;
    bool is_enum;
    bool is_type_scan_import_projection;
    Span alias_type;
    int32_t declaration_origin_row;
    /* #114: physical declaration identity; mirrors cheng_cold.c's TypeDef
       (this header is only compiled in the standalone COLD_BACKEND_ONLY
       split-build, currently unused by any tools/ build script -- kept in
       sync so it does not silently drift from the amalgamated definition). */
    Span decl_path;
} TypeDef;

typedef struct ObjectField {
    Span name;
    int32_t kind;
    int32_t offset;
    int32_t size;
    int32_t array_len;
    Span type_name;
    bool has_default;
    Span default_expr;
} ObjectField;

enum {
    COLD_INTRINSIC_OBJECT_NONE = 0,
    COLD_INTRINSIC_OBJECT_ERROR_INFO = 1,
    COLD_INTRINSIC_OBJECT_RESULT = 2,
    COLD_INTRINSIC_OBJECT_BYTES = 3,
};

typedef struct ObjectDef {
    Span name;
    ObjectField *fields;
    int32_t field_count;
    int32_t slot_size;
    int32_t base_object_index;
    int32_t inherited_field_count;
    Span *generic_names;
    int32_t generic_count;
    /* A materialized generic application is keyed by exact declaration and
       binder rows.  Names are parser projections used only to parse its
       substituted fields; they are never the identity authority. */
    int32_t generic_application_template_object_row;
    int32_t generic_application_binder_kind;
    int32_t generic_application_binder_id;
    Span *generic_application_scope_names;
    int32_t generic_application_scope_count;
    bool generic_application_open;
    /* Exact Apply row in Symbols.type_identity_graph; -1 for declarations
       and non-application objects.  CID bytes live only on the TypeNode. */
    int32_t generic_application_type_node;
    bool is_ref;
    bool is_parser_declaration;
    bool is_type_scan_import_projection;
    int32_t canonical_mirror_object_row;
    int32_t declaration_origin_row;
    /* #114: physical declaration identity; mirrors cheng_cold.c's ObjectDef
       (see that struct's decl_path comment). */
    Span decl_path;
    int32_t intrinsic_owner_kind;
} ObjectDef;

typedef struct FnDef {
    Span name;
    Span link_name;
    int32_t arity;
    int32_t *param_kind;
    int32_t *param_size;
    int32_t *param_exact_type_id;
    int32_t *param_exact_object_is_ref;
    Span *param_type;
    bool *param_has_default;
    int32_t *param_default_value;
    Span ret;
    Span ffi_owned_result_free;
    bool is_external;
    int32_t template_index;
    /* Exact concrete generic arguments of one specialization, aligned with
       the template's generic_names rows.  The mangled function name is only
       a linker projection; this tuple is the in-memory identity authority. */
    Span *specialization_actual_type;
    int32_t specialization_actual_count;
    /* Physical declaration identity of the imported-signature source line
       (resolved file path + line number). Set only by
       cold_collect_import_module_signatures; zero-valued ({0}, 0) for every
       other registration path (locally-declared fns, synthetic/intrinsic
       registrations). Lets consumer-side overload resolution tell "the same
       physical `fn` reopened under a different import alias" (diamond
       import: two aliases of the same module both registering `alias.$`)
       apart from "two genuinely distinct definitions that happen to declare
       the identical operand type" -- the former must collapse to one
       candidate, the latter must still die ambiguous. */
    Span decl_path;
    int32_t decl_line;
    bool decl_has_body;
    bool borrows_args;
    /* Immutable parser-time @ffi_handle parameter-role projection.  Bits are
       parameter ordinals; consumers never reopen source by path/line. */
    bool ffi_handle_roles_published;
    bool ffi_handle_contract;
    uint32_t ffi_handle_borrow_param_mask;
    uint32_t ffi_handle_consume_param_mask;
    /* Source-declared `@thread_boundary` contract identity.  Ownership
       transfer still follows the ordinary exact CallOp/value-definition
       rules until a branch-sensitive retained-credit sidecar exists. */
    bool thread_boundary;
    int32_t external_borrows_declaration_origin_row;
    int32_t result_ownership_summary;
    int32_t return_exact_type_id;
    int32_t borrow_result_root_kind;
    int32_t borrow_result_root_formal_index;
    int32_t borrow_result_root_formal_mask;
    int32_t borrow_result_root_global_row;
    int32_t borrow_result_root_read_only_proof;
    int32_t declaration_origin_row;
    Span *generic_names;
    int32_t generic_count;
    /* Exact synthetic identity of one cold_ensure_seq_mutation_drop_helper
       (cold_parser.c) product.  seq_mutation_drop_mutation_kind == 0 means
       "not a synthetic helper" and is the calloc zero every ordinary row
       keeps.  FunctionContractAdmission recomputes the arity, formal ABI and
       symbol text from these rows; the source-snapshot re-parse channel
       cannot apply because no source declaration exists for a synthesized
       body. */
    int32_t seq_mutation_drop_mutation_kind;
    int32_t seq_mutation_drop_seq_param_kind;
    int32_t seq_mutation_drop_element_kind;
    int32_t seq_mutation_drop_element_size;
    int32_t seq_mutation_drop_element_object_row;
    int32_t seq_mutation_drop_element_exact_type_id;
    /* Store-helper element transfer mode.  Zero consumes an owned value;
       one borrows the source and materializes one retained owner inside the
       helper before replacing the sequence element. */
    int32_t seq_mutation_drop_element_borrowed;
    /* Exact compiler-owned helper for replacing one managed `var` value.
       The discriminator is explicit because zero is a valid calloc state
       for ordinary functions, while a TypeId is never used as a helper-kind
       sentinel.  The symbol name is only a deterministic projection of this
       tuple. */
    int32_t managed_var_replace_helper_kind;
    int32_t managed_var_replace_value_exact_type_id;
    int32_t managed_var_replace_source_borrowed;
} FnDef;

typedef struct ColdFnInlineParamStorage {
    int32_t kind[COLD_MAX_I32_PARAMS];
    int32_t size[COLD_MAX_I32_PARAMS];
    int32_t exact_type_id[COLD_MAX_I32_PARAMS];
    int32_t exact_object_is_ref[COLD_MAX_I32_PARAMS];
    Span type[COLD_MAX_I32_PARAMS];
    bool has_default[COLD_MAX_I32_PARAMS];
    int32_t default_value[COLD_MAX_I32_PARAMS];
} ColdFnInlineParamStorage;

static void cold_fn_bind_inline_param_storage(
        FnDef *function, ColdFnInlineParamStorage *storage) {
    if (!function || !storage) abort();
    function->param_kind = storage->kind;
    function->param_size = storage->size;
    function->param_exact_type_id = storage->exact_type_id;
    function->param_exact_object_is_ref =
        storage->exact_object_is_ref;
    function->param_type = storage->type;
    function->param_has_default = storage->has_default;
    function->param_default_value = storage->default_value;
}

typedef struct ConstDef {
    Span name;
    int32_t kind;
    int32_t scalar_tag;
    uint64_t scalar_bits;
    Span str_val;
    /* Mirrors GlobalDef.decl_path -- see cheng_cold.c's ConstDef for the
       full comment. */
    Span decl_path;
} ConstDef;

typedef struct GlobalDef {
    Span name;
    int32_t kind;
    int32_t size;
    Span type_name;
    Span init_data;
    Span decl_path;
} GlobalDef;

struct ColdChengCsgTypeIdentityGraph;

typedef struct Symbols {
    FnDef *functions;
    int32_t function_count;
    int32_t function_cap;
    int32_t *function_name_hash_rows;
    int32_t *function_name_tail_rows;
    int32_t *function_name_next_rows;
    int32_t function_name_hash_cap;
    size_t function_mapping_bytes;
    size_t function_accounted_bytes;
    uint64_t symbol_generation;
    TypeDef *types;
    int32_t type_count;
    int32_t type_cap;
    int32_t *type_name_hash_rows;
    int32_t *type_local_name_hash_rows;
    int32_t *type_local_name_next_rows;
    int32_t type_name_hash_cap;
    ObjectDef *objects;
    int32_t object_count;
    int32_t object_cap;
    int32_t *object_name_hash_rows;
    int32_t *object_local_name_hash_rows;
    int32_t *object_local_name_next_rows;
    int32_t object_name_hash_cap;
    /* Exact ObjectDef-row -> synthetic drop-helper Function-row edge.
       -1 means the helper has not been registered. */
    int32_t *object_drop_helper_function_rows;
    /* Generation-bound, derived ObjectDef validation cache.  The lanes are
       a performance index only; canonical ObjectDef/declaration rows remain
       the sole semantic authority. */
    uint64_t *object_owner_cid_generations;
    uint8_t *object_owner_cid_states;
    uint8_t (*object_owner_cids)[32];
    uint64_t *object_storage_generations;
    uint8_t *object_storage_states;
    int32_t *object_storage_obligations;
    ConstDef *consts;
    int32_t const_count;
    int32_t const_cap;
    int32_t *const_name_hash_rows;
    int32_t const_name_hash_cap;
    GlobalDef *globals;
    int32_t global_count;
    int32_t global_cap;
    int32_t *global_name_hash_rows;
    int32_t global_name_hash_cap;
    /* Canonical source identity and declaration-origin layout mirrors the
       combined compiler exactly.  The split parser must not silently lose
       authority fields when a Symbols row crosses the TU boundary. */
    Span source_identity_package_id;
    uint8_t source_identity_root_cid[32];
    Span *source_identity_module_paths;
    Span *source_identity_diagnostic_paths;
    int32_t *source_identity_byte_lengths;
    uint8_t (*source_identity_content_cids)[32];
    uint8_t (*source_identity_document_cids)[32];
    int32_t source_identity_count;
    int32_t source_identity_cap;
    bool source_identity_attached;
    int32_t *declaration_origin_module_source_rows;
    int32_t *declaration_origin_token_byte_offsets;
    uint8_t *declaration_origin_authority_kinds;
    Span *declaration_origin_source_paths;
    int32_t *declaration_origin_source_lines;
    int32_t *declaration_origin_type_rows;
    int32_t *declaration_origin_object_rows;
    int32_t declaration_origin_count;
    int32_t declaration_origin_cap;
    int32_t *declaration_origin_hash_rows;
    int32_t declaration_origin_hash_count;
    int32_t declaration_origin_hash_cap;
    struct ColdChengCsgTypeIdentityGraph *type_identity_graph;
    struct Symbols *type_scan_import_parent;
    Span *type_scan_import_aliases;
    int32_t *type_scan_import_source_rows;
    int32_t type_scan_import_alias_count;
    bool type_scan_import_materializing;
    ColdCompilationContext *compilation_context;
    int32_t compilation_context_row;
    uint64_t compilation_context_id;
    int32_t symbol_scope_row;
    uint64_t symbol_scope_epoch;
    uint64_t source_seal_epoch;
    Arena *arena;
    ArenaCleanup owned_storage_cleanup;
} Symbols;

typedef struct Local {
    Span name;
    int32_t slot;
    int32_t kind;
    bool is_mutable_place;
    bool is_global;
    int32_t global_index;
    /* Exact current value-definition identity. Linear initialization,
       assignment, and structured CFG joins update only this int32 edge;
       ownership/place/origin authority remains immutable on the defining
       BodyIR op and is re-read from that op on every use. */
    int32_t value_def_op_id;
} Local;

typedef struct Locals {
    Local *items;
    int32_t count;
    int32_t cap;
    Arena *arena;
} Locals;

/* ================================================================
 * Parser type
 * ================================================================ */
typedef struct ColdImportSource ColdImportSource;

typedef struct ColdFunctionBodyStore {
    Arena *arena;
    BodyIR **items;
    BodyIR **transaction_base_items;
    int32_t transaction_base_cap;
    int32_t *transaction_rows;
    BodyIR **transaction_items;
    int32_t transaction_count;
    int32_t transaction_cap;
    bool transaction_overlay;
    BodyIR **frozen_items;
    uint64_t *frozen_item_fingerprints;
    uint64_t *frozen_function_fingerprints;
    uint64_t *frozen_type_fingerprints;
    uint64_t *frozen_object_fingerprints;
    uint64_t *frozen_const_fingerprints;
    uint64_t *frozen_global_fingerprints;
    int32_t cap;
    bool frozen;
    uint64_t mutation_generation;
    uint64_t frozen_body_generation;
    uint64_t frozen_symbol_generation;
    uint64_t frozen_body_fingerprint;
    uint64_t frozen_symbol_fingerprint;
    int32_t frozen_cap;
    int32_t frozen_symbol_count;
    int32_t frozen_type_count;
    int32_t frozen_object_count;
    int32_t frozen_const_count;
    int32_t frozen_global_count;
} ColdFunctionBodyStore;

typedef struct Parser {
    Span source;
    int32_t pos;
    Arena *arena;
    Symbols *symbols;
    ColdCompilationContext *compilation_context;
    int32_t compilation_context_row;
    uint64_t compilation_context_id;
    int32_t symbol_scope_row;
    uint64_t symbol_scope_epoch;
    uint64_t source_seal_epoch;
    bool import_mode;  /* when true, parse_fn skips symbols_add_fn */
    Span import_alias;
    struct ColdImportSource *import_sources;  /* for import alias resolution in bare names */
    int32_t import_source_count;
    BodyIR **function_bodies;   /* for storing closure/anonymous function bodies */
    int32_t function_body_cap;  /* capacity of function_bodies array */
    int32_t closure_count;      /* counter for generating unique closure names */
    bool expr_has_resume_block; /* expression lowering opened a continuation block */
    int32_t expr_resume_block;
    const char *source_path;    /* path to source file, for error messages (NULL if unknown) */
    /* #128-r7 root fix: mirrors the same fields on cheng_cold.c's own inline
       Parser struct (see that copy for the full rationale) -- nesting depth
       of if/elif/else/for/while suite bodies (0 == function top-level body),
       plus the depth-gated side-channel carrying a bare-expression
       statement's parsed value up to parse_fn's implicit-tail-return scan. */
    int32_t stmt_scope_depth;
    bool stmt_tail_expr_has;
    int32_t stmt_tail_expr_slot;
    int32_t stmt_tail_expr_value_def_op_id;
    ColdFunctionBodyStore *function_body_store;
    Span active_generic_names[4];
    int32_t active_generic_count;
    int32_t active_generic_binder_kind;
    int32_t active_generic_binder_id;
    /* Reusable arena-owned delimiter stack for exact nested-expression scans.
       Kept on Parser so scans grow only when nesting grows, not once per
       expression, and recovery longjmp cannot leak an external allocation. */
    uint8_t *delimiter_stack;
    int32_t delimiter_stack_cap;
    Arena *parse_scratch_arena;
    Arena *parse_persistent_arena;
    uint64_t parse_scratch_symbol_generation;
    ColdFunctionBodyStore *parse_persistent_body_store;
    BodyIR **parse_persistent_function_bodies;
    int32_t parse_persistent_function_body_cap;
    uint8_t *parse_persistent_delimiter_stack;
    int32_t parse_persistent_delimiter_stack_cap;
    ColdFunctionBodyStore parse_scratch_body_store;
    bool provisional_uninitialized_call_arg;
    int32_t provisional_uninitialized_call_arg_start;
    /* Call-argument borrow context for a managed conditional (`c ? a : b`).
       Call resolution needs the parsed argument kinds, so the callee -- and
       therefore whether the formal is `@borrows` -- is unknown while the
       argument expression is still being parsed.  The arg loop publishes the
       callee spelling and the formal index here; the conditional realizer
       reads it (and only it) to decide whether the arms publish borrowed
       reads instead of moves.  parser_child() leaves these zeroed, so the
       context never leaks into a nested arm or a nested call. */
    bool pending_call_arg_borrow_context;
    Span pending_call_arg_borrow_callee;
    int32_t pending_call_arg_borrow_formal_index;
    /* Set by the conditional realizer when it took the borrowed-arm path, so
       the call site can re-verify the speculation against the callee that
       resolution actually picked. */
    bool produced_borrowed_conditional_arg;
    /* A parser may consume a decoded view of an embedded expression while
       diagnostics and declaration facts must still name the original source.
       Without source_origin_offsets, local offset N maps to
       source_origin_base + N.  With it, every local byte boundary maps to an
       absolute byte boundary in source_origin. */
    Span source_origin;
    int32_t source_origin_base;
    int32_t *source_origin_offsets;
    /* Exact sealed source row for this parser view.  Declaration lookup uses
       Symbols.source_identity_diagnostic_paths[source_identity_row] instead
       of rebuilding an absolute path through getcwd for every expression. */
    int32_t source_identity_row;
} Parser;

typedef struct ColdImportAliasIndex {
    int32_t *hash_rows;
    int32_t hash_cap;
    int32_t source_count;
} ColdImportAliasIndex;

struct ColdImportSource {
    Span alias;
    char path[PATH_MAX];
    int32_t source_row;
    struct ColdImportSource *direct_imports;
    int32_t direct_import_count;
    bool direct_imports_ready;
    ColdImportAliasIndex *list_alias_index;
};

/* ================================================================
 * Cold CSG types
 * ================================================================ */
typedef struct ColdCsgStmt {
    int32_t fn_index;
    int32_t indent;
    Span kind;
    Span a;
    Span b;
    Span c;
    Span d;
} ColdCsgStmt;

typedef struct ColdCsgFunction {
    Span name;
    Span params;
    Span ret;
    int32_t stmt_start;
    int32_t stmt_count;
    int32_t symbol_index;
} ColdCsgFunction;

typedef struct ColdCsg {
    ColdCsgFunction *functions;
    int32_t function_count;
    int32_t function_cap;
    ColdCsgStmt *stmts;
    int32_t stmt_count;
    int32_t stmt_cap;
    Span entry;
    Arena *arena;
    Symbols *symbols;
} ColdCsg;

typedef struct ColdCsgLower {
    ColdCsg *csg;
    int32_t fn_index;
    int32_t cursor;
    int32_t end;
    Parser owner;
} ColdCsgLower;

/* ================================================================
 * Loop context
 * ================================================================ */
#define COLD_LOOP_PATCH_CAP 128

typedef struct ColdLocalValueState {
    int32_t slot;
    int32_t value_def_op_id;
    int32_t consume_op_index_plus_one;
} ColdLocalValueState;

typedef struct LoopCtx {
    int32_t break_terms[COLD_LOOP_PATCH_CAP];
    int32_t break_predecessors[COLD_LOOP_PATCH_CAP];
    ColdLocalValueState *break_states[COLD_LOOP_PATCH_CAP];
    int32_t break_count;
    int32_t continue_terms[COLD_LOOP_PATCH_CAP];
    int32_t continue_predecessors[COLD_LOOP_PATCH_CAP];
    ColdLocalValueState *continue_states[COLD_LOOP_PATCH_CAP];
    int32_t managed_local_count;
    int32_t defer_entry_count;
    int32_t continue_count;
    Span break_label;
    bool is_block;
    struct LoopCtx *parent;
} LoopCtx;

/* ================================================================
 * String literal, match constants
 * ================================================================ */
#define COLD_MATCH_VARIANT_CAP 128
#define COLD_MATCH_FALLTHROUGH_CAP 128
#define COLD_CSG_MATCH_VARIANT_CAP 128
#define COLD_CSG_MATCH_FALLTHROUGH_CAP 128

/* ================================================================
 * Compile stats
 * ================================================================ */
typedef struct ColdCompileStats {
    int32_t function_count;
    int32_t type_count;
    int32_t op_count;
    int32_t block_count;
    int32_t switch_count;
    int32_t call_count;
    int32_t csg_lowering;
    int32_t csg_statement_count;
    int32_t code_words;
    int32_t param_count;
    int32_t abi_register_params;
    int32_t abi_stack_params;
    int32_t max_frame_size;
    char max_frame_function[COLD_NAME_CAP];
    int32_t after_csg_frame_size;
    int32_t after_source_bundle_frame_size;
    size_t arena_kb;
    uint64_t elapsed_us;
    uint64_t parse_us;
    uint64_t codegen_us;
    uint64_t emit_us;
    uint64_t facts_bytes;
    uint64_t facts_mmap_us;
    uint64_t facts_verify_us;
    uint64_t facts_decode_us;
    uint64_t facts_emit_obj_us;
    uint64_t facts_emit_exe_us;
    uint64_t facts_total_us;
    int32_t facts_function_count;
    int32_t facts_word_count;
    int32_t facts_reloc_count;
    int32_t facts_data_count;
    int32_t facts_data_reloc_count;
} ColdCompileStats;

/* ================================================================
 * ================================================================ */
extern BodyIR *cold_current_parsing_body;
/* ColdArgv0 is a char ** global set in main() for self-binary materialize */
extern char **ColdArgv0;

/* ================================================================
 * ================================================================ */

/* Arena */
void *arena_alloc(Arena *a, size_t size);

/* Die / error */
void die(const char *msg);
void cold_die_report_flush(void);

/* Span helpers */
Span source_open(const char *path);
Span span_sub(Span s, int32_t start, int32_t end);
bool span_eq(Span s, const char *text);
bool span_same(Span a, Span b);
bool span_is_i32(Span s);
int32_t span_i32(Span s);
int64_t span_i64(Span s);
Span span_trim(Span s);
void span_write(FILE *file, Span s);
bool cold_span_is_float(Span s);
double cold_span_f64(Span s);
Span cold_decode_string_content(Arena *arena, Span raw, bool fmt_literal);
int32_t cold_decode_char_literal(Span token);
int32_t cold_span_find_char(Span span, char needle);
int32_t cold_span_find_top_level_char(Span span, char needle);
Span cold_strip_inline_comment(Span line);

/* Alignment */
int32_t align_i32(int32_t v, int32_t a);

/* Hash */
uint64_t cold_fnv1a64_update_cstr(uint64_t hash, const char *text);
uint64_t cold_fnv1a64_update(uint64_t hash, Span span);

/* Slot kind helpers */
int32_t cold_slot_kind_from_code(char code);
int32_t cold_slot_size_for_kind(int32_t kind);
int32_t cold_slot_align_for_kind(int32_t kind);
int32_t cold_slot_size_from_type_with_symbols(Symbols *symbols, Span type, int32_t kind);
int32_t cold_slot_kind_from_type_with_symbols(Symbols *symbols, Span type);
Span cold_type_strip_var(Span type, bool *is_var);
bool cold_parse_i32_seq_type(Span type);
bool cold_parse_str_seq_type(Span type);
bool cold_type_has_qualified_name(Span type);
bool cold_span_starts_with(Span span, const char *prefix);
int32_t cold_arg_reg_count(int32_t kind, int32_t size);
int32_t cold_param_size_from_type(Symbols *symbols, Span type, int32_t kind);

/* BodyIR functions */
BodyIR *body_new(Arena *arena);
void body_clone_packed_tables(BodyIR *destination, const BodyIR *source);
int32_t body_slot(BodyIR *body, int32_t kind, int32_t size);
void body_slot_set_type(BodyIR *body, int32_t slot, Span type);
void body_slot_set_array_len(BodyIR *body, int32_t slot, int32_t len);
int32_t body_op3(BodyIR *body, int32_t kind, int32_t dst,
                 int32_t a, int32_t b, int32_t c);
int32_t body_op(BodyIR *body, int32_t kind, int32_t dst, int32_t a, int32_t b);
int32_t body_term(BodyIR *body, int32_t kind, int32_t value,
                  int32_t case_start, int32_t case_count,
                  int32_t true_block, int32_t false_block);
int32_t body_block(BodyIR *body);
void body_end_block(BodyIR *body, int32_t block, int32_t term);
void body_reopen_block(BodyIR *body, int32_t block);
int32_t body_switch_case(BodyIR *body, int32_t owner_term, int32_t tag, int32_t block);
int32_t body_call_arg(BodyIR *body, int32_t slot);
int32_t body_call_arg_with_offset(BodyIR *body, int32_t slot, int32_t offset);
int32_t body_string_literal(BodyIR *body, Span literal);
Span body_get_str_literal_span(BodyIR *body, int32_t index);
int32_t body_slot_for_object_field(BodyIR *body, ObjectField *field);
int32_t cold_span_find_top_level_char(Span span, char needle);

/* Symbols functions */
Symbols *symbols_new(Arena *arena);
int32_t symbols_add_fn(Symbols *symbols, Span name, int32_t arity,
                       const int32_t *param_kinds,
                       const int32_t *param_sizes,
                       const Span *param_types,
                       Span ret);
int32_t symbols_find_fn(Symbols *symbols, Span name, int32_t arity,
                        const int32_t *param_kinds,
                        const int32_t *param_sizes,
                        const Span *param_types,
                        Span ret);
FnDef *symbols_get_fn(Symbols *symbols, int32_t index);
TypeDef *symbols_add_type(Symbols *symbols, Span name, int32_t variant_count);
TypeDef *symbols_find_type(Symbols *symbols, Span name);
ObjectDef *symbols_add_object(Symbols *symbols, Span name, int32_t field_count);
ObjectDef *symbols_find_object(Symbols *symbols, Span name);
void symbols_add_const(Symbols *symbols, Span name, int32_t value, Span decl_path);
void symbols_add_typed_const(Symbols *symbols, Span name, int32_t kind,
                             uint64_t scalar_bits, Span decl_path);
void symbols_add_tagged_const(Symbols *symbols, Span name, int32_t kind,
                              int32_t scalar_tag, uint64_t scalar_bits,
                              Span decl_path);
void symbols_add_str_const(Symbols *symbols, Span name, Span str_val, Span decl_path);
ConstDef *symbols_find_const(Symbols *symbols, Span name);
GlobalDef *symbols_find_global(Symbols *symbols, Span name);
ConstDef *symbols_find_const_qualified(
    Symbols *symbols, Span alias, Span name);
GlobalDef *symbols_find_global_qualified(
    Symbols *symbols, Span alias, Span name);
void symbols_add_global(Symbols *symbols, Span name, int32_t kind,
                        int32_t size, Span type_name, Span init_data,
                        Span decl_path);
ObjectDef *symbols_resolve_object(Symbols *symbols, Span name);
void symbols_refine_object_layouts(Symbols *symbols);

/* External helpers used by parser */
int32_t cold_make_i32_const_slot(BodyIR *body, int32_t value);
int32_t cold_make_str_literal_cstr_slot(BodyIR *body, const char *text);
int32_t cold_seq_opaque_element_size_for_slot(Symbols *symbols, BodyIR *body, int32_t slot);
Variant *type_find_variant(TypeDef *type, Span name);
int32_t cold_split_top_level_commas(Span text, Span *parts, int32_t cap);
void object_finalize_layout(ObjectDef *object);
int32_t cold_make_zero_const_slot(BodyIR *body);

/* Cold CSG helpers used by parser */
int32_t cold_slot_size_from_type_with_symbols(Symbols *symbols, Span type, int32_t kind);
int32_t cold_slot_kind_from_type_with_symbols(Symbols *symbols, Span type);
/* Producer-only structural identity for an opaque-sequence element that has
   no builtin, TypeDef, ObjectDef or direct generic-row projection.  The
   returned payload is 524288 + the canonical persistent TypeNode row + 1. */
int32_t cold_intern_opaque_sequence_structural_element_row(
    Symbols *symbols, const FnDef *function, Span element_type);
bool cold_opaque_sequence_structural_element_row_matches_readonly(
    Symbols *symbols, const FnDef *function, Span element_type,
    int32_t element_row);

/* Object/string/cold helpers */
bool cold_ident_char(uint8_t c);
int32_t cold_require_str_value(BodyIR *body, int32_t slot, const char *context);
ObjectField *cold_required_object_field(ObjectDef *object, const char *name);
Span cold_cstr_span(const char *text);

/* Source scanning helpers called from cold_parser.c */
int32_t cold_line_indent_width(Span line);
bool cold_line_top_level(Span line);
bool cold_line_has_triple_quote(Span line);
void symbols_add_str_const(Symbols *symbols, Span name, Span str_val, Span decl_path);
bool cold_parse_function_symbol_at(Span source, int32_t fn_start, int32_t line_no,
                                    ColdFunctionSymbol *symbol, Symbols *symbols);
bool cold_type_block_looks_like_object(Span body);
int32_t cold_line_end_from(Span source, int32_t pos);
ObjectField *object_find_field(ObjectDef *object, Span name);
int32_t symbols_variant_slot_size(Symbols *symbols, Variant *variant);
int32_t cold_return_kind_from_span(Symbols *symbols, Span ret);
int32_t cold_return_slot_size(Symbols *symbols, Span ret, int32_t kind);
Local *locals_find(Locals *locals, Span name);

/* Type/object helper functions (defined in cheng_cold.c, called from cold_parser.c) */
bool cold_parse_opaque_seq_type(Span type);
bool cold_parse_i32_array_type(Span type, int32_t *len_out);
bool cold_parse_any_fixed_array_type(Symbols *symbols, Span type,
                                     Span *element_type_out,
                                     int32_t *len_out);
int32_t cold_fixed_array_element_size(Symbols *symbols, Span type);
bool cold_span_is_simple_ident(Span span);
bool cold_type_parse_generic_instance(Span type, Span *base, Span *args);
bool cold_type_is_generic_placeholder(Span type, Span *generic_names,
                                      int32_t generic_count);
Variant *symbols_find_variant(Symbols *symbols, Span name);
TypeDef *symbols_find_variant_type(Symbols *symbols, Variant *variant);
void variant_finalize_layout(TypeDef *type, Variant *variant);
int32_t symbols_type_slot_size(TypeDef *type);
void object_finalize_fields(ObjectDef *object);
int32_t symbols_object_slot_size(ObjectDef *object);
TypeDef *symbols_resolve_type(Symbols *symbols, Span type_name);

/* Parser */


#endif /* COLD_TYPES_H */
