/* cold_parser.h -- declarations for the source parser (cold_parser.c)
 *
 * This header forward-declares the shared struct types to avoid pulling in
 * the full type definitions from cold_types.h.  cheng_cold.c includes this
 * header to call parser functions.  cold_parser.c includes both cold_types.h
 * (for full type definitions) and cold_parser.h (for its own declarations).
 */
#ifndef COLD_PARSER_H
#define COLD_PARSER_H

#include <stdint.h>
#include <stdbool.h>

typedef enum ColdConstScalarTag {
    COLD_CONST_SCALAR_NONE = 0,
    COLD_CONST_SCALAR_BOOL,
    COLD_CONST_SCALAR_I8,
    COLD_CONST_SCALAR_U8,
    COLD_CONST_SCALAR_I16,
    COLD_CONST_SCALAR_U16,
    COLD_CONST_SCALAR_I32,
    COLD_CONST_SCALAR_U32,
    COLD_CONST_SCALAR_I64,
    COLD_CONST_SCALAR_U64,
    COLD_CONST_SCALAR_F32,
    COLD_CONST_SCALAR_F64,
    COLD_CONST_SCALAR_CHAR
} ColdConstScalarTag;

/* ================================================================
 * Forward declarations of struct types (defined in cold_types.h or cheng_cold.c)
 * ================================================================ */
typedef struct Arena Arena;
typedef struct Span Span;
typedef struct BodyIR BodyIR;
typedef struct Symbols Symbols;
typedef struct Locals Locals;
typedef struct LoopCtx LoopCtx;
typedef struct Parser Parser;
typedef struct ColdImportSource ColdImportSource;
typedef struct ColdFunctionBodyStore ColdFunctionBodyStore;
typedef struct ColdCompileStats ColdCompileStats;
typedef struct ObjectField ObjectField;
typedef struct ObjectDef ObjectDef;
typedef struct TypeDef TypeDef;
typedef struct Variant Variant;
typedef struct ColdExprResult ColdExprResult;
typedef struct ColdCompilationContext ColdCompilationContext;

/* ================================================================
 * Parser state machine
 * ================================================================ */
Parser cold_parser_issue_legacy_span(Symbols *symbols, Span source);
Parser cold_parser_issue_lexical_span(Arena *arena, Span source);
void cold_parser_bind_source_identity_row(Parser *parser,
                                          int32_t source_identity_row);
Parser parser_child(Parser *owner, Span source);
void parser_ws(Parser *parser);
void parser_line(Parser *parser);
void parser_inline_ws(Parser *parser);
Span parser_token(Parser *parser);
Span parser_peek(Parser *parser);
bool parser_take(Parser *parser, const char *text);
Span parser_take_type_span(Parser *parser);
void parser_skip_balanced(Parser *parser, const char *open, const char *close);
int32_t parser_next_indent(Parser *parser);

/* ================================================================
 * Import parsing
 * ================================================================ */
bool cold_parse_import_line(Span trimmed, Span *module_out, Span *alias_out);
bool cold_import_source_path(Span module_path, char *out, size_t out_cap);
Span cold_qualify_import_type(Symbols *symbols, Span alias, Span type);
Span cold_scope_import_type_symbols(Symbols *symbols, Span alias, Span type,
                                    Span *generic_names, int32_t generic_count);
Span cold_import_default_alias(Span module_path);

/* ================================================================
 * Signature/type/const collection
 * ================================================================ */
void cold_collect_imported_function_signatures(Symbols *symbols, Span source);
void cold_collect_function_signatures(Symbols *symbols, Span source);
bool cold_collect_import_module_types(Symbols *symbols, Span alias, Span source,
                                      const char *decl_path);
void cold_collect_import_module_types_from_path(Symbols *symbols, Span alias,
                                                Span module_path);
void cold_collect_import_module_enum_blocks(Symbols *symbols, Span alias, Span source,
                                            const char *decl_path);
void cold_collect_import_module_consts(Symbols *symbols, Span alias, Span source,
                                       Span decl_path);
void cold_collect_import_module_signatures(Symbols *symbols, Span alias, Span source);
void cold_import_types_once_reset(void);
void cold_import_declaration_batch_begin(void);
void cold_import_declaration_batch_end(void);
Span cold_strip_inline_comment(Span line);
void symbols_refine_object_layouts(Symbols *symbols);
int32_t symbols_declaration_origin_intern(
    Symbols *symbols, int32_t module_source_row,
    int32_t token_byte_offset);
bool cold_object_generic_scope_readonly(
    Symbols *symbols, int32_t object_row,
    Span **generic_names_out, int32_t *generic_count_out,
    int32_t *generic_binder_kind_out,
    int32_t *generic_binder_id_out,
    bool *open_application_out);
void cold_rescope_unresolved_object_field_types(Symbols *symbols);
void symbols_refine_function_signature_layouts(Symbols *symbols);
TypeDef *symbols_add_type_at_origin(Symbols *symbols, Span name,
                                    int32_t variant_count,
                                    int32_t module_source_row,
                                    int32_t token_byte_offset);
ObjectDef *symbols_add_object_at_origin(Symbols *symbols, Span name,
                                        int32_t field_count,
                                        int32_t module_source_row,
                                        int32_t token_byte_offset);
void cold_body_bind_declaration_origin(BodyIR *body, Symbols *symbols,
                                       int32_t declaration_origin_row);

/* ================================================================
 * Source type/const/function/expression parsing
 * ================================================================ */
void parse_type(Parser *parser);
void parse_const(Parser *parser);
BodyIR *parse_fn(Parser *parser, int32_t *symbol_index_out);

int32_t parse_expr(Parser *parser, BodyIR *body, Locals *locals, int32_t *kind);
int32_t parse_term(Parser *parser, BodyIR *body, Locals *locals, int32_t *kind);
int32_t cold_materialize_fmt_str(BodyIR *body, int32_t slot, int32_t kind);
int32_t cold_materialize_i32_ref(BodyIR *body, int32_t slot, int32_t *kind);
int32_t cold_materialize_i64_value(BodyIR *body, int32_t slot, int32_t *kind);
int32_t cold_materialize_ptr_value(BodyIR *body, int32_t slot, int32_t *kind);
int32_t parse_statement(Parser *parser, BodyIR *body, Locals *locals,
                        int32_t block, LoopCtx *loop);
int32_t parse_call_after_name(Parser *parser, BodyIR *body, Locals *locals,
                              Span name, int32_t *kind);
int32_t parse_call_from_args_span(Parser *owner, BodyIR *body, Locals *locals,
                                  Span name, Span args, int32_t *kind);
int32_t parse_let_binding(Parser *parser, BodyIR *body, Locals *locals,
                          int32_t block, bool is_var, int32_t stmt_indent);
int32_t parse_arith_expr(Parser *parser, BodyIR *body, Locals *locals, int32_t *kind);
int32_t parse_compare_expr(Parser *parser, BodyIR *body, Locals *locals, int32_t *kind);
int32_t parse_primary(Parser *parser, BodyIR *body, Locals *locals, int32_t *kind);
int32_t parse_postfix(Parser *parser, BodyIR *body, Locals *locals,
                      int32_t slot, int32_t *kind);
int32_t parse_if(Parser *parser, BodyIR *body, Locals *locals,
                 int32_t block, int32_t stmt_indent, LoopCtx *loop);
int32_t parse_for(Parser *parser, BodyIR *body, Locals *locals,
                  int32_t block, int32_t stmt_indent, LoopCtx *loop);
int32_t parse_while(Parser *parser, BodyIR *body, Locals *locals,
                    int32_t block, int32_t stmt_indent, LoopCtx *loop);
int32_t parse_match(Parser *parser, BodyIR *body, Locals *locals,
                    int32_t block, LoopCtx *loop);
void parse_return(Parser *parser, BodyIR *body, Locals *locals, int32_t block);
int32_t parse_assign(Parser *parser, BodyIR *body, Locals *locals, Span name);
int32_t parse_field_assign(Parser *parser, BodyIR *body, Locals *locals,
                           Span name, int32_t seq_block);
int32_t parse_statements_until(Parser *parser, BodyIR *body, Locals *locals,
                               int32_t block, int32_t end_indent,
                               const char *stop_token, LoopCtx *loop,
                               int32_t *last_stmt_op_start_out);
int32_t parse_expr_from_span(Parser *owner, BodyIR *body, Locals *locals,
                              Span expr, int32_t *kind,
                              const char *trailing_message);
int32_t parse_constructor(Parser *parser, BodyIR *body, Locals *locals,
                           Variant *variant);
int32_t cold_arg_reg_count(int32_t kind, int32_t size);
int32_t parse_param_specs_with_generics(Symbols *symbols, Span params,
                                        Span *generic_names,
                                        int32_t generic_count,
                                        int32_t generic_binder_kind,
                                        int32_t generic_binder_id,
                                        Span *names, int32_t *kinds,
                                        int32_t *sizes, Span *types,
                                        int32_t cap);
int32_t parse_param_specs(Symbols *symbols, Span params, Span *names,
                          int32_t *kinds, int32_t *sizes, Span *types,
                          int32_t cap);
int32_t parse_i32_seq_literal(Parser *parser, BodyIR *body, Locals *locals,
                              int32_t *kind);
int32_t parse_expected_payloadless_variant(Parser *parser, BodyIR *body,
                                           TypeDef *type, int32_t *kind);
int32_t parse_seq_lvalue_from_span(Parser *owner, BodyIR *body, Locals *locals,
                                   Span target, int32_t *kind_out,
                                   ColdExprResult *result_out);
int32_t parse_seq_index_ref_from_spans(Parser *owner, BodyIR *body, Locals *locals,
                                       Span target, Span index, int32_t *kind_out,
                                       int32_t *scalar_width_out,
                                       ColdExprResult *result_out);
void parse_store_field_path_into_ref(Parser *owner, BodyIR *body, Locals *locals,
                                     int32_t base_ref_slot, Span field_path,
                                     int32_t value_slot, int32_t value_kind,
                                     const ColdExprResult *value_result,
                                     const ColdExprResult *base_authority);
int32_t body_branch_to(BodyIR *body, int32_t block, int32_t target_block);
void parse_condition_span(Parser *owner, BodyIR *body, Locals *locals,
                          Span condition, int32_t block,
                          int32_t true_block, int32_t false_block);
void loop_add_break(LoopCtx *loop, int32_t term, Span label);
void loop_add_continue(LoopCtx *loop, int32_t term);
int32_t cold_imported_param_specs(Symbols *symbols, Span alias, Span params,
                                  Span *names, int32_t *kinds,
                                  int32_t *sizes, Span *types, int32_t cap,
                                  bool *has_defaults, int32_t *default_values,
                                  Span *generic_names, int32_t generic_count,
                                  int32_t generic_binder_kind,
                                  int32_t generic_binder_id);
Span cold_arena_join3(Arena *arena, Span a, const char *mid, Span b);
int32_t cold_make_str_literal_cstr_slot(BodyIR *body, const char *text);
bool cold_type_contains_sabi_boundary(Span type);

/* ================================================================
 * Import compilation (called from backend dispatch)
 * ================================================================ */
int32_t cold_collect_direct_import_sources(Span entry_source,
                                           ColdImportSource *imports,
                                           int32_t import_cap);
int32_t cold_compile_imported_bodies_no_recurse(Symbols *symbols, Span entry_source,
                                                BodyIR **function_bodies,
                                                int32_t body_cap, bool strict);
void cold_compile_reachable_import_bodies(Symbols *symbols,
                                          Span entry_source,
                                          ColdFunctionBodyStore *body_store,
                                          int32_t entry_function,
                                          ColdImportSource *imports,
                                          int32_t import_count);
void cold_collect_all_transitive_imports(
    Symbols *symbols,
    ColdImportSource *import_sources,
    int32_t import_source_count);

/* ================================================================
 * Compile pipeline — available in full build only
 * ================================================================ */
#ifndef COLD_BACKEND_ONLY
bool cold_compile_source_path_to_macho(const char *out_path,
                                       const char *src_path,
                                       bool allow_demo,
                                       ColdCompileStats *stats);
bool cold_compile_source_to_object(const char *out_path,
                                   const char *src_path,
                                   const char *target,
                                   uint32_t target_feature_mask,
                                   const char *export_roots_csv,
                                   const char *symbol_visibility,
                                   bool reachable_entry_only,
                                   ColdCompileStats *stats);

int cold_cmd_compile_bootstrap(int argc, char **argv, const char *self_path);
int cold_cmd_bootstrap_bridge(int argc, char **argv, const char *self_path);
int cold_cmd_build_backend_driver(int argc, char **argv, const char *self_path);
#endif /* COLD_BACKEND_ONLY */

#endif /* COLD_PARSER_H */
