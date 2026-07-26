// @ts-nocheck
// Strict regalloc preflight.  This module intentionally separates source evidence from
// release evidence: a model manifest never substitutes for a process-tree RSS guard, and
// raw driver identity is never normalized or masked.
import {createHash, randomBytes} from "node:crypto";
import {accessSync, closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, readdirSync, realpathSync, rmSync, writeSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, initChengToolkitModule, jsonResult, runChengDriver, takeTrailingText, zodSchema} from "./cheng_toolkit_m9000.ts";
import {
  CHENG_CURRENT_FORMAL_COMPILER_ENV,
  CHENG_CURRENT_FORMAL_COMPILER_UNSET_ENV,
  CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
  buildEbnfParserNodeMap,
  parserOwnedStructuredWitnessAccepted,
} from "./cheng_ebnf_parser_node_map.ts";
import {validateCompilerExecutionStageReceipt} from "./cheng_execution_stage_receipt_validator.ts";
import {canonicalJson} from "./cheng_semantic_matrix_m9023.ts";
import {readCurrentChengGrammarCorpus} from "./cheng_grammar_corpus_store.ts";

var chengRegallocPreflightInputSchema, ChengRegallocPreflightTool;

const TARGET = "arm64-apple-darwin";
const DEFAULT_RSS_CAP_BYTES = 1073741824;
const DEFAULT_TIMEOUT_SEC = 300;
const DEFAULT_RELEASE_TIMEOUT_SEC = 3600;
const EXTERNAL_LOCK_MAX_VALIDITY_SECONDS = 86400;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 1 << 30;
const FUSION_ROOT = process.env.CHENG_REGALLOC_ONE_SHOT_FUSION_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const CHENG_FIXTURE = join(FUSION_ROOT, "fixtures/regalloc_preflight/regalloc_source_contract.cheng");
const C_FIXTURE = join(FUSION_ROOT, "fixtures/regalloc_preflight/bodyir_packed_slab_contract.c");
const PRODUCTION_GATE_DEPENDENCY_FILES = Object.freeze({
  gate: "tools/regalloc_production_gate.sh",
  guard: "tools/beat_c_process_group_guard.sh",
  evidence: "tools/regalloc_production_evidence.sh",
  lockValidator: "tools/regalloc_external_lock_validator.py",
});
const PRODUCTION_GATE_DEPENDENCY_EXPECTED_SHA256 = Object.freeze({
  "tools/regalloc_production_gate.sh": "d4c3092af0a0be3a618e3d42922d0ca160fd751682bc4be717bbf7a39e538940",
  "tools/beat_c_process_group_guard.sh": "1a2456ed271bcc5e36f19d2497519d75ede6ac2c204fad74207aa23ad7312532",
  "tools/regalloc_production_evidence.sh": "eba70942df1c1488a524bdf9a8659d0ea4bf29d4d97a136a2013a2a49dc68741",
  "tools/regalloc_external_lock_validator.py": "b4266c000cbde7590ef7cb3b7801ba6367b668ff36f5a28a7c4319177c01ae44",
});
const RELEASE_EVIDENCE_INPUTS = Object.freeze([
  ["officialManifest", "officialManifestSha256", "REGALLOC_GATE_OFFICIAL_MANIFEST", "REGALLOC_GATE_OFFICIAL_MANIFEST_SHA256"],
  ["baselineManifest", "baselineManifestSha256", "REGALLOC_GATE_BASELINE_MANIFEST", "REGALLOC_GATE_BASELINE_MANIFEST_SHA256"],
  ["officialBuildReceipt", "officialBuildReceiptSha256", "REGALLOC_GATE_OFFICIAL_BUILD_RECEIPT", "REGALLOC_GATE_OFFICIAL_BUILD_RECEIPT_SHA256"],
  ["executionStagePolicy", "executionStagePolicySha256", "REGALLOC_GATE_EXECUTION_STAGE_POLICY", "REGALLOC_GATE_EXECUTION_STAGE_POLICY_SHA256"],
  ["backend2VersionManifest", "backend2VersionManifestSha256", "REGALLOC_GATE_BACKEND2_VERSION_MANIFEST", "REGALLOC_GATE_BACKEND2_VERSION_MANIFEST_SHA256"],
  ["jobsLock", "jobsLockSha256", "REGALLOC_GATE_JOBS_LOCK", "REGALLOC_GATE_JOBS_LOCK_SHA256"],
  ["execDiffLock", "execDiffLockSha256", "REGALLOC_GATE_EXEC_DIFF_LOCK", "REGALLOC_GATE_EXEC_DIFF_LOCK_SHA256"],
  ["targetEmitLock", "targetEmitLockSha256", "REGALLOC_GATE_TARGET_EMIT_LOCK", "REGALLOC_GATE_TARGET_EMIT_LOCK_SHA256"],
  ["gen3Lock", "gen3LockSha256", "REGALLOC_GATE_GEN3_LOCK", "REGALLOC_GATE_GEN3_LOCK_SHA256"],
]);
const AARCH64_F64_RUNTIME_GATE_FILES = Object.freeze({
  gate: "tools/regalloc_aarch64_f64_runtime_gate.sh",
  guard: "tools/beat_c_process_group_guard.sh",
  contract: "src/tests/regalloc_aarch64_f64_contract_smoke.cheng",
  image: "src/tests/regalloc_aarch64_f64_runtime_image.cheng",
  harness: "src/tests/regalloc_aarch64_f64_runtime_harness.c",
  bridge: "src/tests/regalloc_aarch64_f64_runtime_bridge.S",
});
const AARCH64_F64_RUNTIME_GATE_MEMORY_BYTES = 1073741824;
const AARCH64_F64_RUNTIME_GATE_GUARD_STAGES = Object.freeze([
  "contract_compile",
  "contract_run",
  "image_compile",
  "image_run",
  "native_link",
  "native_run",
]);
const AARCH64_F64_RUNTIME_GATE_EXPECTED_SHA256 = Object.freeze({
  "tools/regalloc_aarch64_f64_runtime_gate.sh": "3467f9604ce81c1051d584fed60c2832a70880c6945565b8fea7824bf887d9dd",
  "tools/beat_c_process_group_guard.sh": "1a2456ed271bcc5e36f19d2497519d75ede6ac2c204fad74207aa23ad7312532",
  "src/tests/regalloc_aarch64_f64_contract_smoke.cheng": "aa4efe675edbb9474497733d6e2af915c466522152786a55bfb2216f43b50d41",
  "src/tests/regalloc_aarch64_f64_runtime_image.cheng": "3a6b2b624d94a3c505035526058a80a6fbe194339667a705eacedc7f546b2214",
  "src/tests/regalloc_aarch64_f64_runtime_harness.c": "0694520d7bf6cdc2d5d9133be902bad0d07a6b465eef7fbf67fdd1da42c4084d",
  "src/tests/regalloc_aarch64_f64_runtime_bridge.S": "3869b3301a34ce454cc868b53d33238f87b7a37ee71efc89f637556f5a0cc572",
});
const X86_64_F64_RUNTIME_GATE_FILES = Object.freeze({
  gate: "tools/regalloc_x86_64_f64_runtime_gate.sh",
  guard: "tools/beat_c_process_group_guard.sh",
  image: "src/tests/regalloc_x86_64_f64_runtime_image.cheng",
  harness: "src/tests/regalloc_x86_64_f64_runtime_harness.c",
  bridge: "src/tests/regalloc_x86_64_f64_runtime_bridge.S",
});
const X86_64_F64_RUNTIME_GATE_MEMORY_BYTES = 1073741824;
const X86_64_F64_RUNTIME_GATE_GUARD_STAGES = Object.freeze([
  "rosetta_probe",
  "image_compile",
  "image_run",
  "native_link",
  "disassemble",
  "rosetta_run",
]);
const X86_64_F64_RUNTIME_GATE_EXPECTED_SHA256 = Object.freeze({
  "tools/regalloc_x86_64_f64_runtime_gate.sh": "6f780002fe0400cdbdc3a586bdacbac80d4d6e60969aeffe6a9de0bc92f710df",
  "tools/beat_c_process_group_guard.sh": "1a2456ed271bcc5e36f19d2497519d75ede6ac2c204fad74207aa23ad7312532",
  "src/tests/regalloc_x86_64_f64_runtime_image.cheng": "7e979e51f13734d47c1c6bb12fcd8aaa8e62c8d068f69fcef539cc7219dbbc28",
  "src/tests/regalloc_x86_64_f64_runtime_harness.c": "2c9d5305ff533a20a97eaa179929449dde12131f5abd481f32f35dd7edb0bad2",
  "src/tests/regalloc_x86_64_f64_runtime_bridge.S": "73e2f3adcadd15be8f143b773c8e884cbb6cab7c3950e7bfa484a9b3ef85d9b7",
});
const TYPED_EXPR_SOURCE_RELATIVE = "src/core/lang/typed_expr.cheng";
const FORMAL_SPEC_RELATIVE = "docs/cheng-formal-spec.md";
const EBNF_PARSER_NODE_MAP_RELATIVE =
  "fixtures/semantic/ebnf_parser_node_map.json";
const EBNF_PARSER_NODE_MAP_PATH =
  join(FUSION_ROOT, EBNF_PARSER_NODE_MAP_RELATIVE);
const EBNF_PARSER_PRODUCER_DECLARATIONS_RELATIVE =
  "fixtures/semantic/ebnf_parser_producer_claims.json";
const EBNF_PARSER_PRODUCER_DECLARATIONS_PATH =
  join(FUSION_ROOT, EBNF_PARSER_PRODUCER_DECLARATIONS_RELATIVE);
const FORMAL_RECEIPT_AUTHORITY_FILES = Object.freeze([
  CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
  "src/core/tooling/compiler_parser_receipt.cheng",
]);
const SEMANTIC_PIPELINE_GATE_RELATIVE = "src/cheng_semantic_pipeline_gate_m9025.ts";
const SEMANTIC_MODEL_RELATIVE = "src/cheng_semantic_matrix_m9023.ts";
const SEMANTIC_PIPELINE_MODEL_RELATIVE = "src/cheng_semantic_pipeline_matrix_m9024.ts";
const SEMANTIC_PIPELINE_GATE_RECEIPT_SCHEMA = "cheng_semantic_pipeline_structural_gate_receipt";
const SEMANTIC_PIPELINE_GATE_TIMEOUT_SECONDS = 300;
const SEMANTIC_PIPELINE_EXPECTED_COUNTS = Object.freeze({
  baseLegalCount: 1584,
  profileAssignmentCount: 2520,
  joinedAssignmentCount: 3991680,
  legalJoinedCount: 285336,
  matrixCaseCount: 2927,
  matrixAcceptCount: 2920,
  matrixRejectCount: 7,
});
const FORMAL_EXPRESSION_SLICE_SCHEMA = "cheng_formal_expression_ebnf";
const FORMAL_LITERAL_DEFINITIONS_SCHEMA = "cheng_formal_expression_literal_definitions";
const FORMAL_LEXICAL_DEFINITIONS_SCHEMA = "cheng_formal_lexical_terminal_definitions";
const FORMAL_GRAMMAR_BLOCK_SCHEMA = "cheng_formal_grammar_block";
const FORMAL_OPERATOR_PRECEDENCE_SCHEMA = "cheng_formal_operator_precedence_table";
const FORMAL_CONDITIONAL_SEMANTICS_SCHEMA = "cheng_formal_conditional_semantics";
const FORMAL_SPACECALL_EXCLUSION_SCHEMA = "cheng_formal_spacecall_exclusion";
const FORMAL_SPACECALL_EXCLUSION_START = "#### 1.3.5 spaceCall 的 strict-profile 排除\n";
const FORMAL_SPACECALL_EXCLUSION_END = "- 本排除与 `factor ::= spaceCall | postfix | whenExpr | ifExpr | caseExpr` 的 EBNF 并存：EBNF 描述全量语法空间，生产剖面按本条收窄，二者不构成矛盾。\n";
const FORMAL_MODULE_VISIBILITY_SCHEMA = "cheng_formal_module_visibility";
const CURRENT_FORMAL_SOURCE_MANIFEST_SCHEMA =
  "cheng_current_formal_source_manifest";
const CURRENT_FORMAL_PROFILE_SCHEMA = "cheng_current_formal_profile";
const FORMAL_EXPRESSION_LEAF_COVERAGE_SCHEMA = "cheng_formal_expression_leaf_alternative_coverage";
const FORMAL_EXPRESSION_STRUCTURAL_GAPS = Object.freeze([
  "callSuffix empty/nonempty and repeated arguments",
  "postfix and spaceAtom zero/one/multiple suffix composition",
  "comprehension optional if",
  "tuple/list empty/value/trailing-comma structure",
  "when/if zero/one/multiple elif and required/optional else branches",
  "case direct/multiline/guard/else structure",
  "fn/iterator optional name/generic/return/where and suite forms",
  "three lexical references remain without exact-hash lexer-definition bindings",
  "operator associativity and cross-production precedence require direct executable obligation mappings",
]);
const FORMAL_GRAMMAR_BOUND_EXTERNAL_REFERENCES = Object.freeze(["caseEntry", "paramList", "pattern", "suite", "typeExpr", "typeParamList"]);
const FORMAL_CHENG_COMPILER_PROFILE_SCHEMA = "cheng_formal_compile_profile";
const FORMAL_CHENG_COMPILER_ENV =
  CHENG_CURRENT_FORMAL_COMPILER_ENV;
const FORMAL_CHENG_COMPILER_UNSET_ENV =
  CHENG_CURRENT_FORMAL_COMPILER_UNSET_ENV;
const AUTHORITY_MINIMUM_REQUIRED_FILES = Object.freeze([
  "src/core/lang/parser.cheng",
  "src/core/lang/typed_expr.cheng",
  "src/core/backend/lowering_plan.cheng",
  "src/core/backend/primary_object_plan.cheng",
  "src/core/backend2/backend2_pipeline.cheng",
  "src/core/backend2/backend2_lower.cheng",
  "src/core/backend2/backend2_lower_slots.cheng",
  "src/core/backend2/backend2_lower_stmt.cheng",
  "src/core/backend2/backend2_lower_util.cheng",
]);
const BACKEND2_PIPELINE_AUTHORITY_ROOT = "src/core/backend2/backend2_pipeline.cheng";
const POST_SEAL_LEGACY_SCANNER_FILES = Object.freeze(new Set([
  "src/core/backend/primary_object_plan.cheng",
  "src/core/backend/regalloc_aarch64_adapter.cheng",
  "src/core/backend/x86_64_body_emit.cheng",
  "src/core/backend2/backend2_pipeline.cheng",
  "src/core/backend2/backend2_lower.cheng",
  "src/core/backend2/backend2_lower_slots.cheng",
  "src/core/backend2/backend2_lower_stmt.cheng",
  "src/core/backend2/backend2_lower_util.cheng",
]));
const REMOVED_BACKEND2_INDEPENDENT_EMITTER_MODULES = Object.freeze([
  "src/core/backend2/backend2_emit.cheng",
  "src/core/backend2/backend2_emit_ops.cheng",
  "src/core/backend2/backend2_frame.cheng",
]);
const POST_SEAL_LEGACY_SCANNER_NAME_RULES = Object.freeze([
  Object.freeze({family: "source_lines_slot", pattern: /^PrimaryBodyIrSourceLinesSlot$/}),
  Object.freeze({family: "build_source_cache", pattern: /^PrimaryBodyIrBuildSource(?:[A-Z][A-Za-z0-9_]*)+Cache(?:For(?:[A-Z][A-Za-z0-9_]*)+)?$/}),
  Object.freeze({family: "lookup_source", pattern: /^PrimaryBodyIrLookupSource(?:[A-Z][A-Za-z0-9_]*)+$/}),
]);
const POST_SEAL_REEXPORT_DEPTH_WALKER_NAMES = Object.freeze(new Set([
  "PrimaryBodyIrLookupSourceConstStrLiteralAtDepth",
  "PrimaryBodyIrSourceObjectLayoutAtDepth",
  "PrimaryBodyIrSourceFieldShapeAtDepth",
]));
const POST_SEAL_REEXPORT_NAME_RULES = Object.freeze([
  Object.freeze({family: "pure_forwarding_import_shim", pattern: /^PrimaryBodyIrSourceIsPureForwardingShim$/}),
  Object.freeze({family: "lookup_source_via_reexport", pattern: /^PrimaryBodyIrLookupSource(?:[A-Z][A-Za-z0-9_]*)+ViaReexport$/}),
  Object.freeze({family: "source_layout_via_reexport", pattern: /^PrimaryBodyIrSourceObjectLayoutDeclPathViaReexport$/}),
]);
const FROZEN_METADATA_SELF_AUDIT_NAMES = Object.freeze([
  "TypedExprModuleConstLiteralForContext",
  "typedExprBuildFrozenMetadataProjection",
  "typedExprFrozenProjectionSchemaExact",
  "typedExprFrozenCanonicalDigest",
  "typedExprFrozenProjectionLiveBytes",
  "typedExprReleaseFrozenMetadataProjection",
  "typedExprFrozenMaterializeContext",
  "typedExprFrozenExpectedCanonicalRowsExact",
]);
// These are canonical, read-only TypedExprIr queries used by all three production
// realizers in the pinned ignition tree.  Frozen metadata producer/query functions are
// audited as roots, but are deliberately not required to be reachable from a realizer.
const REALIZER_AUTHORITY_API_NAMES = Object.freeze([
  "TypedExprIrCanonicalFieldMetaState",
  "TypedExprIrAliasTarget",
  "TypedExprIrVisibleSourceRowState",
]);
const POST_SEAL_FORBIDDEN_EXACT_FUNCTIONS = Object.freeze(new Map([
  ["PrimaryBodyIrCompleteAssignmentRhs", "assignment_rhs_source_recovery"],
  ["PrimaryBodyIrSourceLinesStrippedAt", "stripped_source_line_cache"],
  ["PrimaryBodyIrRecoverReturnAggregateConstructorText", "return_aggregate_source_recovery"],
]));
const TYPED_EXPR_EXACT_SOURCE_RECOVERY_FUNCTIONS = Object.freeze(new Map([
  ["TypedExprExtractArgsText", "single_line_call_args_source_recovery"],
  ["TypedExprExtractArgsTextMultiline", "multiline_call_args_source_recovery"],
]));
const TYPED_EXPR_RESULT_INTRINSIC_BUILDER = "TypedExprBuildFactInto";
const POST_SEAL_FIXED_METADATA_TEXT_FUNCTIONS = Object.freeze(new Set([
  "MetadataTextStable",
  "PrimaryObjectMetadataTextStable",
  "B2PrimaryObjectMetadataTextStable",
]));
const POST_SEAL_FIXED_METADATA_TEXT_FILES = Object.freeze(new Set([
  "src/core/backend/metadata_text_authority.cheng",
  "src/core/backend/primary_object_plan.cheng",
  "src/core/backend2/backend2_lower_util.cheng",
]));
const POST_SEAL_DYNAMIC_WORKLIST_CAP_FUNCTIONS = Object.freeze(new Set([
  "PrimaryBodyIrSeqAddValueNodeIsStructured",
]));
const POST_SEAL_PROGRAM_DERIVED_ENCODING_REJECT_CAPS = Object.freeze(new Map([
  ["PrimaryBodyIRStrEqLiteralWordCount", Object.freeze({counter: "literalLen", operator: ">", limit: 4095, rejectSink: "return_zero", family: "string_literal_length_rejected_by_encoding_width"})],
  ["PrimaryBodyIRFillCallOp", Object.freeze({counter: "stackArgBytes", operator: ">", limit: 4095, rejectSink: "return_minus_one", family: "program_stack_argument_bytes_rejected_by_encoding_width"})],
  ["PrimaryBodyIrIndexedScaleWordCount", Object.freeze({counter: "elemSize", operator: "<=", limit: 65535, rejectSink: "fallthrough_zero", family: "program_element_size_rejected_by_encoding_width"})],
  ["regallocA64AppendStrEqLiteral", Object.freeze({counter: "literalLen", operator: ">", limit: 4095, rejectSink: "return_false", family: "regalloc_adapter_string_literal_length_rejected_by_encoding_width"})],
  ["regallocA64AppendIndexedAddress", Object.freeze({counter: "stride", operator: ">", limit: 65535, rejectSink: "return_minus_one", family: "regalloc_adapter_stride_rejected_by_encoding_width"})],
  ["X64BodyStrEqLiteralByteCount", Object.freeze({counter: "literalLen", operator: ">", limit: 4095, rejectSink: "return_zero", family: "x64_string_literal_length_rejected_by_encoding_width"})],
]));
const SEMANTIC_NUMERIC_LIMIT_PHYSICAL_ALLOWLIST = Object.freeze([
  Object.freeze({counter: "waveSize", family: "backend_resource_wave_partition"}),
  Object.freeze({counter: "binDigits", family: "integer_literal_machine_width"}),
  Object.freeze({counter: "hexDigits", family: "integer_literal_machine_width"}),
  Object.freeze({counter: "bucketIndex", family: "hash_table_physical_bucket_count"}),
  Object.freeze({counter: "reg", family: "target_abi_register_count"}),
]);
const POST_SEAL_SOURCE_METADATA_INDEX_APIS = Object.freeze(new Set([
  "TypedExprBuildIndexLookupCallDeclarationInSource",
  "TypedExprBuildIndexVisibleContextSourcePath",
  "TypedExprCallDeclarationParamType",
  "TypedExprCallDeclarationResolvedReturnType",
]));
const POST_SEAL_COLD_CSG_FIELD_LAYOUT_FUNCTIONS = Object.freeze(new Map([
  ["PrimaryBodyIrColdCsgFieldShape", "cold_csg_field_shape"],
  ["PrimaryBodyIrColdCsgObjectSpecs", "cold_csg_object_specs"],
  ["PrimaryBodyIrLookupColdCsgObjectLayout", "cold_csg_object_layout"],
  ["PrimaryBodyIrLookupColdCsgFieldMeta", "cold_csg_field_meta"],
]));
const POST_SEAL_NAMED_FIELD_METADATA_DIRECT_API = "TypedExprIrLookupSingleFieldMeta";
const POST_SEAL_OWNER_LEAF_METADATA_CALLS = Object.freeze(new Set([
  "PrimaryBodyIrCanonicalFieldMeta",
  "PrimaryBodyIrLookupSingleFieldMeta",
  "PrimaryBodyIrLookupChainFieldMeta",
  "TypedExprIrCanonicalFieldMetaState",
  "TypedExprIrLookupSingleFieldMeta",
  "TypedExprIrLookupTypeLayout",
  "TypedExprIrLookupTypeLayoutRow",
]));
const TYPED_EXPR_OWNER_REQUIRED_INDEX_CONTRACTS = Object.freeze([
  Object.freeze({
    functionName: "TypedExprIrLookupTypeLayoutRow",
    ownerParameter: "sourcePath",
    sourceIndexKind: "ir_layout_source",
    forbiddenGlobalIndexKind: "ir_layout_global",
  }),
  Object.freeze({
    functionName: "TypedExprIrIndexedFieldRow",
    ownerParameter: "sourcePath",
    sourceIndexKind: "ir_field_source",
    forbiddenGlobalIndexKind: "ir_field_global",
  }),
]);
const CALLEE_OWNER_FALLBACK_FUNCTIONS = Object.freeze(new Set([
  "PrimaryBodyIrCallResultLayoutSourcePath",
  "PrimaryBodyIrTargetParamType",
  "PrimaryBodyIrResolvedOrRegisteredWholeCallOrdinal",
  "PrimaryBodyIrAppendCallArgs",
  "PrimaryBodyIrAppendWholeCallExprToSlot",
  "PrimaryBodyIrAppendCallExprNodeToSlot",
  "Backend2CalleeAbiViewsForFunction",
  "LoweringBuildTypedFunctionReferenceIndex",
]));
const EXACT_OWNER_RESOLVER_FUNCTIONS = Object.freeze(new Set([
  "PrimaryObjectIrFunctionIndexBucketMin",
  "PrimaryObjectIrFunctionIndex",
]));
const ABI_WIDTH_AUTHORITY_FUNCTION = "PrimaryBodyIrFillCallArgAbiSizes";
const PIPELINE_ENTRY_LEGAL_SOURCE_IO_FUNCTION_SHA256 = Object.freeze({
  "src/core/lang/typed_expr.cheng#TypedExprEnsureSourceTextsCoverExprLayer": "049a057563b7843a1403beb3288cbbe636b7f23ab1695d694b952bfb939ad5b9",
  "src/core/tooling/compiler_csg.cheng#CompilerCsgReadSourceTextCached": "80e388688d6d631fec9822ac8908075c14b4872d0150893697c5b3dc82eb979f",
  "src/core/tooling/compiler_csg.cheng#CompilerCsgTraceStage": "2096e849112bee7f05631597b6e11bf214180ec4869b8add9020d8a926a9df66",
  "src/core/tooling/path.cheng#ReadTextFile": "b3df18e49465c2e08d6caccc3f4a71a46f8635e4adcccfbfc233ec5aeae9f490",
});
const QUALIFIED_NESTED_CALL_WITNESS = Object.freeze({
  schema: "cheng_qualified_nested_call_declaration_witness",
  id: "qualified_nested_call.std_monotimes",
  family: "qualified_nested_call_canonical_declaration",
  fixtureFile: "typedexpr_qualified_nested_call_positive.cheng",
  fixtureLabel: "fusion/typedexpr_qualified_nested_call_positive.cheng",
  moduleName: "std/monotimes",
  modulePath: "src/std/monotimes.cheng",
  alias: "monotimes",
  outerName: "MonoTimeNs",
  innerName: "GetMonoTime",
  innerReturnType: "MonoTime",
  outerParameterType: "MonoTime",
  outerReturnType: "int64",
  assignmentType: "int64",
});
const C_BOOTSTRAP_INCLUDE_FILES = Object.freeze([
  "cheng_cold.c", "cold_parser.h", "cold_parser.c", "cold_types.h",
  "macho_direct.h", "elf64_direct.h", "coff_direct.h", "x64_emit.h",
  "rv64_emit.h", "cold_chengcsg_format.h", "host_runtime.c",
]);
const TYPED_EXPR_AUDIT_FAMILIES = Object.freeze([
  "shared_cross_module_return_binding",
  "qualified_nested_call_canonical_declaration",
  "dynamic_seq_contextual_empty",
  "dynamic_seq_contextual_recursive_elements",
  "fixed_seq_contextual_matching_length",
  "call_root_postfix",
  "ternary_call_argument",
  "if_expression_call_argument",
  "ordinary_named_arguments",
  "tuple_call_argument",
  "bound_comprehension",
  "result_question_call_argument",
  "public_deref_no_pointer",
  "aggregate_constructor_fields",
  "empty_seq_without_context",
  "heterogeneous_seq_elements",
  "contextual_seq_element_mismatch",
  "fixed_seq_length_mismatch",
  "empty_seq_candidate_ambiguity",
  "unknown_seq_element",
  "aggregate_constructor_unknown_field",
  "character_literal",
  "composite_default_initialization",
  "contextual_nil",
  "large_decimal_literal",
  "named_aggregate_whole_argument",
  "fmt_interpolation",
  "const_argument",
  "enum_argument",
  "bare_binding_argument",
  "identifier_root_field",
  "identifier_root_index",
  "identifier_root_slice",
  "identifier_root_arrow_no_pointer",
  "builtin_cast_conversion",
  "new_expression_no_pointer",
  "explicit_generic_call",
  "ordinary_nested_call",
  "result_value_nonbare",
  "address_of_place_no_pointer",
  "address_of_function_no_pointer",
  "float_literal",
  "unary_expression",
  "when_expression",
  "case_expression",
  "range_call_argument_not_first_class",
  "membership_expression",
  "set_literal",
  "fn_literal",
  "iterator_literal",
  "function_value_callee",
  "call_root_index",
  "parenthesized_call_root_postfix",
  "direct_comprehension_argument_unsupported",
  "qualified_conversion",
  "named_conversion",
  "enum_conversion",
  "generic_constraint",
  "generic_default",
  "default_parameter_omission",
  "logical_or",
  "logical_and",
  "bitwise_or",
  "bitwise_xor",
  "bitwise_and",
  "equality_equal",
  "equality_not_equal",
  "comparison_less",
  "comparison_less_equal",
  "comparison_greater",
  "comparison_greater_equal",
  "membership_notin",
  "range_inclusive_call_argument_not_first_class",
  "binary_add",
  "binary_subtract",
  "binary_multiply",
  "binary_divide",
  "binary_modulo",
  "named_argument_equals",
  "identifier_root_slice_inclusive",
  "short_string_literal",
  "multiline_string_literal",
  "bool_literal",
  "int32_literal",
  "unnamed_tuple_literal",
  "parenthesized_expression",
  "unary_plus",
  "unary_logical_not",
  "unary_bitwise_not",
  "unary_dollar",
  "unary_caret",
  "unary_percent",
  "await_expression",
  "unary_comprehension",
  "space_call_removed",
]);
// Direct fixture-to-obligation contracts.  These IDs are deliberately not inferred from
// a family or production name: a grammar change must either preserve the exact stable ID
// or require an explicit ledger edit.
const FORMAL_OBLIGATION_IDS_BY_FAMILY = Object.freeze({
  bitwise_and: ["ebnf.bitwiseAnd.production"],
  bitwise_or: ["ebnf.bitwiseOr.production"],
  bitwise_xor: ["ebnf.bitwiseXor.production"],
  named_argument_equals: ["ebnf.callArg.production"],
  case_expression: ["ebnf.caseExpr.production"],
  comparison_less: ["ebnf.comparison.production"],
  ternary_call_argument: ["ebnf.conditionalExpr.production"],
  equality_equal: ["ebnf.equality.production"],
  bare_binding_argument: ["ebnf.factor.production"],
  fn_literal: ["ebnf.fnLiteral.production"],
  if_expression_call_argument: ["ebnf.ifExpr.production"],
  iterator_literal: ["ebnf.iteratorLiteral.production"],
  logical_and: ["ebnf.logicalAnd.production"],
  logical_or: ["ebnf.logicalOr.production"],
  membership_expression: ["ebnf.membership.production"],
  identifier_root_field: ["ebnf.postfix.production"],
  parenthesized_expression: ["ebnf.primary.production"],
  range_call_argument_not_first_class: ["ebnf.rangeExpr.production"],
  set_literal: ["ebnf.spacePrimary.production"],
  binary_add: ["ebnf.sum.production"],
  binary_multiply: ["ebnf.term.production"],
  unary_expression: ["ebnf.unary.production"],
  when_expression: ["ebnf.whenExpr.production"],
});
const TYPED_EXPR_MATRIX = [
  {family: "shared_cross_module_return_binding", expected: "GREEN", file: "typedexpr_shared_cross_module_positive.cheng"},
  {family: "qualified_nested_call_canonical_declaration", expected: "GREEN", declarationWitnessId: "qualified_nested_call.std_monotimes", file: "typedexpr_qualified_nested_call_positive.cheng"},
  {family: "dynamic_seq_contextual_empty", expected: "GREEN", file: "typedexpr_seq_dynamic_empty_positive.cheng"},
  {family: "dynamic_seq_contextual_recursive_elements", expected: "GREEN", file: "typedexpr_contextual_seq_positive.cheng"},
  {family: "fixed_seq_contextual_matching_length", expected: "GREEN", file: "typedexpr_seq_fixed_context_positive.cheng"},
  {family: "call_root_postfix", expected: "GREEN", file: "typedexpr_call_root_postfix_positive.cheng"},
  {family: "ternary_call_argument", expected: "GREEN", file: "typedexpr_ternary_arg_positive.cheng"},
  {family: "if_expression_call_argument", expected: "GREEN", file: "typedexpr_if_expr_arg_positive.cheng"},
  {family: "ordinary_named_arguments", expected: "GREEN", file: "typedexpr_named_args_positive.cheng"},
  {family: "tuple_call_argument", expected: "GREEN", file: "typedexpr_tuple_arg_positive.cheng"},
  {family: "bound_comprehension", expected: "GREEN", file: "typedexpr_comprehension_positive.cheng"},
  {family: "result_question_call_argument", expected: "GREEN", file: "typedexpr_result_question_arg_positive.cheng"},
  {family: "public_deref_no_pointer", expected: "RED", diagnostic: "no_pointer", file: "typedexpr_deref_public_negative.cheng"},
  {family: "aggregate_constructor_fields", expected: "GREEN", file: "typedexpr_aggregate_ctor_positive.cheng"},
  {family: "empty_seq_without_context", expected: "RED", diagnostic: "missing_element_type", file: "typedexpr_seq_empty_negative.cheng"},
  {family: "heterogeneous_seq_elements", expected: "RED", diagnostic: "static_argument_type", file: "typedexpr_seq_heterogeneous_negative.cheng"},
  {family: "contextual_seq_element_mismatch", expected: "RED", diagnostic: "static_argument_type", file: "typedexpr_seq_element_mismatch_negative.cheng"},
  {family: "fixed_seq_length_mismatch", expected: "RED", diagnostic: "fixed_length", file: "typedexpr_seq_fixed_length_negative.cheng"},
  {family: "empty_seq_candidate_ambiguity", expected: "RED", diagnostic: "ambiguous_call", file: "typedexpr_seq_ambiguous_negative.cheng"},
  {family: "unknown_seq_element", expected: "RED", diagnostic: "static_argument_type", file: "typedexpr_seq_unknown_negative.cheng"},
  {family: "aggregate_constructor_unknown_field", expected: "RED", diagnostic: "constructor_field", file: "typedexpr_aggregate_ctor_field_negative.cheng"},
  {family: "character_literal", expected: "GREEN", file: "typedexpr_character_literal_positive.cheng"},
  {family: "composite_default_initialization", expected: "GREEN", file: "typedexpr_composite_default_positive.cheng"},
  {family: "contextual_nil", expected: "GREEN", file: "typedexpr_contextual_nil_positive.cheng"},
  {family: "large_decimal_literal", expected: "GREEN", file: "typedexpr_large_decimal_positive.cheng"},
  {family: "named_aggregate_whole_argument", expected: "GREEN", file: "typedexpr_named_aggregate_arg_positive.cheng"},
  {family: "fmt_interpolation", expected: "GREEN", file: "typedexpr_fmt_positive.cheng"},
  {family: "const_argument", expected: "GREEN", file: "typedexpr_const_arg_positive.cheng"},
  {family: "enum_argument", expected: "GREEN", file: "typedexpr_enum_arg_positive.cheng"},
  {family: "bare_binding_argument", expected: "GREEN", file: "typedexpr_bare_binding_positive.cheng"},
  {family: "identifier_root_field", expected: "GREEN", file: "typedexpr_identifier_field_positive.cheng"},
  {family: "identifier_root_index", expected: "GREEN", file: "typedexpr_identifier_index_positive.cheng"},
  {family: "identifier_root_slice", expected: "GREEN", file: "typedexpr_identifier_slice_positive.cheng"},
  {family: "identifier_root_arrow_no_pointer", expected: "RED", diagnostic: "no_pointer", file: "typedexpr_identifier_arrow_negative.cheng"},
  {family: "builtin_cast_conversion", expected: "GREEN", file: "typedexpr_cast_positive.cheng"},
  {family: "new_expression_no_pointer", expected: "RED", diagnostic: "no_pointer", file: "typedexpr_new_public_negative.cheng"},
  {family: "explicit_generic_call", expected: "GREEN", file: "typedexpr_explicit_generic_positive.cheng"},
  {family: "ordinary_nested_call", expected: "GREEN", file: "typedexpr_nested_call_positive.cheng"},
  {family: "result_value_nonbare", expected: "GREEN", file: "typedexpr_result_value_nonbare_positive.cheng"},
  {family: "address_of_place_no_pointer", expected: "RED", diagnostic: "no_pointer", file: "typedexpr_address_place_negative.cheng"},
  {family: "address_of_function_no_pointer", expected: "RED", diagnostic: "no_pointer", file: "typedexpr_address_function_negative.cheng"},
  {family: "float_literal", expected: "GREEN", file: "typedexpr_float_positive.cheng"},
  {family: "unary_expression", expected: "GREEN", file: "typedexpr_unary_positive.cheng"},
  {family: "when_expression", expected: "GREEN", file: "typedexpr_when_positive.cheng"},
  {family: "case_expression", expected: "GREEN", file: "typedexpr_case_positive.cheng"},
  {family: "range_call_argument_not_first_class", expected: "RED", diagnostic: "range_not_first_class", file: "typedexpr_range_arg_negative.cheng"},
  {family: "membership_expression", expected: "GREEN", file: "typedexpr_membership_positive.cheng"},
  {family: "set_literal", expected: "GREEN", file: "typedexpr_set_positive.cheng"},
  {family: "fn_literal", expected: "GREEN", file: "typedexpr_fn_literal_positive.cheng"},
  {family: "iterator_literal", expected: "GREEN", file: "typedexpr_iterator_literal_positive.cheng"},
  {family: "function_value_callee", expected: "GREEN", file: "typedexpr_function_callee_positive.cheng"},
  {family: "call_root_index", expected: "GREEN", file: "typedexpr_call_root_index_positive.cheng"},
  {family: "parenthesized_call_root_postfix", expected: "GREEN", file: "typedexpr_parenthesized_call_postfix_positive.cheng"},
  {family: "direct_comprehension_argument_unsupported", expected: "RED", diagnostic: "direct_comprehension_argument", file: "typedexpr_comprehension_direct_arg_negative.cheng"},
  {family: "qualified_conversion", expected: "GREEN", file: "typedexpr_qualified_conversion_positive.cheng"},
  {family: "named_conversion", expected: "GREEN", file: "typedexpr_named_conversion_positive.cheng"},
  {family: "enum_conversion", expected: "GREEN", file: "typedexpr_enum_conversion_positive.cheng"},
  {family: "generic_constraint", expected: "GREEN", file: "typedexpr_generic_constraint_positive.cheng"},
  {family: "generic_default", expected: "GREEN", file: "typedexpr_generic_default_positive.cheng"},
  {family: "default_parameter_omission", expected: "GREEN", file: "typedexpr_default_param_positive.cheng"},
  {family: "logical_or", expected: "GREEN", file: "typedexpr_logical_or_positive.cheng"},
  {family: "logical_and", expected: "GREEN", file: "typedexpr_logical_and_positive.cheng"},
  {family: "bitwise_or", expected: "GREEN", file: "typedexpr_bitwise_or_positive.cheng"},
  {family: "bitwise_xor", expected: "GREEN", file: "typedexpr_bitwise_xor_positive.cheng"},
  {family: "bitwise_and", expected: "GREEN", file: "typedexpr_bitwise_and_positive.cheng"},
  {family: "equality_equal", expected: "GREEN", file: "typedexpr_equality_equal_positive.cheng"},
  {family: "equality_not_equal", expected: "GREEN", file: "typedexpr_equality_not_equal_positive.cheng"},
  {family: "comparison_less", expected: "GREEN", file: "typedexpr_comparison_less_positive.cheng"},
  {family: "comparison_less_equal", expected: "GREEN", file: "typedexpr_comparison_less_equal_positive.cheng"},
  {family: "comparison_greater", expected: "GREEN", file: "typedexpr_comparison_greater_positive.cheng"},
  {family: "comparison_greater_equal", expected: "GREEN", file: "typedexpr_comparison_greater_equal_positive.cheng"},
  {family: "membership_notin", expected: "GREEN", file: "typedexpr_membership_notin_positive.cheng"},
  {family: "range_inclusive_call_argument_not_first_class", expected: "RED", diagnostic: "range_not_first_class", file: "typedexpr_range_inclusive_arg_negative.cheng"},
  {family: "binary_add", expected: "GREEN", file: "typedexpr_binary_add_positive.cheng"},
  {family: "binary_subtract", expected: "GREEN", file: "typedexpr_binary_subtract_positive.cheng"},
  {family: "binary_multiply", expected: "GREEN", file: "typedexpr_binary_multiply_positive.cheng"},
  {family: "binary_divide", expected: "GREEN", file: "typedexpr_binary_divide_positive.cheng"},
  {family: "binary_modulo", expected: "GREEN", file: "typedexpr_binary_modulo_positive.cheng"},
  {family: "named_argument_equals", expected: "GREEN", file: "typedexpr_named_arg_equals_positive.cheng"},
  {family: "identifier_root_slice_inclusive", expected: "GREEN", file: "typedexpr_identifier_slice_inclusive_positive.cheng"},
  {family: "short_string_literal", expected: "GREEN", file: "typedexpr_short_string_positive.cheng"},
  {family: "multiline_string_literal", expected: "GREEN", file: "typedexpr_multiline_string_positive.cheng"},
  {family: "bool_literal", expected: "GREEN", file: "typedexpr_bool_literal_positive.cheng"},
  {family: "int32_literal", expected: "GREEN", file: "typedexpr_int32_literal_positive.cheng"},
  {family: "unnamed_tuple_literal", expected: "GREEN", file: "typedexpr_unnamed_tuple_positive.cheng"},
  {family: "parenthesized_expression", expected: "GREEN", file: "typedexpr_parenthesized_positive.cheng"},
  {family: "unary_plus", expected: "GREEN", file: "typedexpr_unary_plus_positive.cheng"},
  {family: "unary_logical_not", expected: "GREEN", file: "typedexpr_unary_not_positive.cheng"},
  {family: "unary_bitwise_not", expected: "GREEN", file: "typedexpr_unary_bitwise_not_positive.cheng"},
  {family: "unary_dollar", expected: "GREEN", file: "typedexpr_unary_dollar_positive.cheng"},
  {family: "unary_caret", expected: "GREEN", file: "typedexpr_unary_caret_positive.cheng"},
  {family: "unary_percent", expected: "GREEN", file: "typedexpr_unary_percent_positive.cheng"},
  {family: "await_expression", expected: "GREEN", file: "typedexpr_await_positive.cheng"},
  {family: "unary_comprehension", expected: "GREEN", file: "typedexpr_unary_comprehension_positive.cheng"},
  {family: "space_call_removed", expected: "RED", diagnostic: "space_call_removed", file: "typedexpr_space_call_negative.cheng"},
].map((entry) => ({...entry, id: entry.family, formalObligationIds: [...(FORMAL_OBLIGATION_IDS_BY_FAMILY[entry.family] || [])], path: join(FUSION_ROOT, "fixtures/regalloc_preflight", entry.file)}));
const FORMAL_EXPRESSION_REQUIRED_ALTERNATIVES = Object.freeze([
  "conditionalExpr.ternary", "logicalOr.or", "logicalAnd.and",
  "bitwiseOr.or", "bitwiseXor.xor", "bitwiseAnd.and",
  "equality.equal", "equality.not_equal",
  "comparison.less", "comparison.less_equal", "comparison.greater", "comparison.greater_equal",
  "membership.in", "membership.notin", "rangeExpr.inclusive", "rangeExpr.exclusive",
  "sum.add", "sum.subtract", "term.multiply", "term.divide", "term.modulo",
  "factor.spaceCall_policy_reject", "factor.postfix", "factor.whenExpr", "factor.ifExpr", "factor.caseExpr",
  "postfix.field", "postfix.arrow", "postfix.callSuffix", "postfix.index",
  "postfix.slice_inclusive", "postfix.slice_exclusive", "postfix.question",
  "callArg.positional", "callArg.named_equals", "callArg.named_colon",
  "unary.plus", "unary.minus", "unary.not", "unary.bitwise_not", "unary.dollar",
  "unary.caret", "unary.percent", "unary.await", "unary.deref", "unary.address", "unary.comprehension",
  "primary.ident", "primary.number_int32", "primary.number_large_decimal", "primary.number_float",
  "primary.string_short", "primary.string_multiline", "primary.char", "primary.bool",
  "primary.tuple_named", "primary.tuple_unnamed", "primary.list_empty", "primary.list_values",
  "primary.list_comprehension", "primary.fnLiteral", "primary.iteratorLiteral", "primary.parenthesized",
  "spacePrimary.set_literal",
  "whenExpr", "ifExpr", "caseExpr", "fnLiteral", "iteratorLiteral",
]);
const FORMAL_EXPRESSION_LEDGER = Object.freeze([
  ["conditionalExpr.ternary", "ternary_call_argument"],
  ["logicalOr.or", "logical_or"], ["logicalAnd.and", "logical_and"],
  ["bitwiseOr.or", "bitwise_or"], ["bitwiseXor.xor", "bitwise_xor"], ["bitwiseAnd.and", "bitwise_and"],
  ["equality.equal", "equality_equal"], ["equality.not_equal", "equality_not_equal"],
  ["comparison.less", "comparison_less"], ["comparison.less_equal", "comparison_less_equal"],
  ["comparison.greater", "comparison_greater"], ["comparison.greater_equal", "comparison_greater_equal"],
  ["membership.in", "membership_expression"], ["membership.notin", "membership_notin"],
  ["rangeExpr.inclusive", "range_inclusive_call_argument_not_first_class"], ["rangeExpr.exclusive", "range_call_argument_not_first_class"],
  ["sum.add", "binary_add"], ["sum.subtract", "binary_subtract"],
  ["term.multiply", "binary_multiply"], ["term.divide", "binary_divide"], ["term.modulo", "binary_modulo"],
  ["factor.spaceCall_policy_reject", "space_call_removed"], ["factor.postfix", "bare_binding_argument"],
  ["factor.whenExpr", "when_expression"], ["factor.ifExpr", "if_expression_call_argument"], ["factor.caseExpr", "case_expression"],
  ["postfix.field", "identifier_root_field"], ["postfix.arrow", "identifier_root_arrow_no_pointer"],
  ["postfix.callSuffix", "ordinary_nested_call"], ["postfix.index", "identifier_root_index"],
  ["postfix.slice_inclusive", "identifier_root_slice_inclusive"], ["postfix.slice_exclusive", "identifier_root_slice"],
  ["postfix.question", "result_question_call_argument"], ["callArg.positional", "ordinary_nested_call"],
  ["callArg.named_equals", "named_argument_equals"], ["callArg.named_colon", "ordinary_named_arguments"],
  ["unary.plus", "unary_plus"], ["unary.minus", "unary_expression"], ["unary.not", "unary_logical_not"],
  ["unary.bitwise_not", "unary_bitwise_not"], ["unary.dollar", "unary_dollar"], ["unary.caret", "unary_caret"],
  ["unary.percent", "unary_percent"], ["unary.await", "await_expression"], ["unary.deref", "public_deref_no_pointer"],
  ["unary.address", "address_of_place_no_pointer"], ["unary.comprehension", "unary_comprehension"],
  ["primary.ident", "bare_binding_argument"], ["primary.number_int32", "int32_literal"],
  ["primary.number_large_decimal", "large_decimal_literal"], ["primary.number_float", "float_literal"],
  ["primary.string_short", "short_string_literal"], ["primary.string_multiline", "multiline_string_literal"],
  ["primary.char", "character_literal"], ["primary.bool", "bool_literal"],
  ["primary.tuple_named", "tuple_call_argument"], ["primary.tuple_unnamed", "unnamed_tuple_literal"],
  ["primary.list_empty", "dynamic_seq_contextual_empty"], ["primary.list_values", "dynamic_seq_contextual_recursive_elements"],
  ["primary.list_comprehension", "bound_comprehension"], ["primary.fnLiteral", "fn_literal"],
  ["primary.iteratorLiteral", "iterator_literal"], ["primary.parenthesized", "parenthesized_expression"],
  ["spacePrimary.set_literal", "set_literal"], ["whenExpr", "when_expression"],
  ["ifExpr", "if_expression_call_argument"], ["caseExpr", "case_expression"],
  ["fnLiteral", "fn_literal"], ["iteratorLiteral", "iterator_literal"],
]);
const MEMORY_ROLES = [
  "csg_path_to_macho",
  "source_path_to_macho",
  "source_to_object",
  "facts_from_source",
  "csg_roundtrip",
  "command_csg_emit",
];
const MEMORY_EVENT_FIELDS = [
  "kind", "arena_id", "arena_role", "body_id", "clone_source_body_id", "family", "cause",
  "op_count", "op_capacity", "slot_count", "slot_capacity", "call_arg_count", "call_arg_capacity",
  "old_capacity", "new_capacity", "old_bytes", "new_bytes", "arena_used_bytes",
  "owned_slab_before_bytes", "owned_slab_peak_bytes", "owned_slab_after_bytes",
  "retained_before_bytes", "retained_peak_bytes", "retained_after_bytes",
];
const MEMORY_ROW_BYTES = Object.freeze({
  op: 44n,
  slot: 52n,
  call_arg: 24n,
});

function sha256(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function renderHashedKv(fields, payloadKey) {
  const payload = Buffer.from(fields.map(([key, value]) => `${key}=${value}\n`).join(""), "utf8");
  return Buffer.concat([payload, Buffer.from(`${payloadKey}=${sha256(payload)}\n`, "utf8")]);
}

function writeExclusiveSnapshot(path, raw, label, mode = 0o600, allowEmpty = false) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try {
    writeAll(fd, raw);
    fchmodSync(fd, mode);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  return stableSnapshot(path, label, Math.max(raw.length, 1), allowEmpty);
}

function formalChengCompilerProfile() {
  const env = Object.fromEntries(Object.entries(FORMAL_CHENG_COMPILER_ENV).sort(([left], [right]) => left.localeCompare(right)));
  const unsetEnv = [...FORMAL_CHENG_COMPILER_UNSET_ENV].sort();
  const payload = {
    schema: FORMAL_CHENG_COMPILER_PROFILE_SCHEMA,
    action: "system-link-exec",
    target: TARGET,
    env,
    unsetEnv,
  };
  return {...payload, sha256: sha256(Buffer.from(JSON.stringify(payload), "utf8"))};
}

function formalChengDriverOptions(root, timeoutMs, maxBuffer, hardExecutionOptions = {}) {
  return {
    root,
    cwd: root,
    timeoutMs,
    maxBuffer,
    env: FORMAL_CHENG_COMPILER_ENV,
    unsetEnv: FORMAL_CHENG_COMPILER_UNSET_ENV,
    ...hardExecutionOptions,
  };
}

function sameStat(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function canonicalAbsolute(value, label, kind, executable = false, allowEmpty = false) {
  const path = String(value || "");
  if (!isAbsolute(path) || resolve(path) !== path) throw new Error(`${label} must be a canonical absolute path: ${path}`);
  let stat;
  try { stat = lstatSync(path, {bigint: true}); }
  catch (error) { throw new Error(`${label} is unavailable: ${path} (${error instanceof Error ? error.message : String(error)})`); }
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink: ${path}`);
  if (kind === "file" && !stat.isFile()) throw new Error(`${label} must be a regular file: ${path}`);
  if (kind === "dir" && !stat.isDirectory()) throw new Error(`${label} must be a directory: ${path}`);
  if (realpathSync.native(path) !== path) throw new Error(`${label} must already be its canonical real path: ${path}`);
  if (kind === "file" && !allowEmpty && stat.size <= 0n) throw new Error(`${label} must be non-empty: ${path}`);
  if (executable) {
    try { accessSync(path, constants.X_OK); }
    catch { throw new Error(`${label} must be executable: ${path}`); }
  }
  return path;
}

function stableSnapshot(path, label, maxBytes = MAX_SNAPSHOT_BYTES, allowEmpty = false) {
  const before = lstatSync(path, {bigint: true});
  if (before.isSymbolicLink() || !before.isFile() || (!allowEmpty && before.size <= 0n)) throw new Error(`${label} must be a ${allowEmpty ? "regular" : "non-empty regular"} non-symlink file: ${path}`);
  if (before.size > BigInt(maxBytes)) throw new Error(`${label} exceeds ${maxBytes} bytes: ${path}`);
  if (!Number.isInteger(constants.O_NOFOLLOW)) throw new Error("O_NOFOLLOW is required for regalloc preflight snapshots");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd, {bigint: true});
    if (!opened.isFile() || !sameStat(before, opened)) throw new Error(`${label} changed before open: ${path}`);
    const length = Number(opened.size);
    const raw = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      const count = readSync(fd, raw, offset, Math.min(1024 * 1024, length - offset), offset);
      if (count <= 0) throw new Error(`${label} truncated while reading: ${path}`);
      offset += count;
    }
    const afterFd = fstatSync(fd, {bigint: true});
    const afterPath = lstatSync(path, {bigint: true});
    if (afterPath.isSymbolicLink() || !afterPath.isFile() || !sameStat(opened, afterFd) || !sameStat(afterFd, afterPath)) {
      throw new Error(`${label} changed while reading: ${path}`);
    }
    return {path, raw, sha256: sha256(raw), stat: afterPath};
  } finally {
    closeSync(fd);
  }
}

function parseUniqueUnhashedKv(raw, label) {
  let text;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(raw); }
  catch (error) { throw new Error(`${label} must be valid UTF-8: ${error instanceof Error ? error.message : String(error)}`); }
  if (!text.endsWith("\n") || text.includes("\r") || text.includes("\0")) throw new Error(`${label} must use NUL-free LF lines and end with LF`);
  const lines = text.slice(0, -1).split("\n");
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) throw new Error(`${label} is empty`);
  const rows = new Map();
  for (let index = 0; index < lines.length; index++) {
    const split = lines[index].indexOf("=");
    if (split <= 0) throw new Error(`${label} line ${index + 1} is not key=value`);
    const key = lines[index].slice(0, split);
    const value = lines[index].slice(split + 1);
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key) || rows.has(key)) throw new Error(`${label} has invalid or duplicate key: ${key}`);
    rows.set(key, value);
  }
  return {rows, lines};
}

function validatePayloadKv(raw, label, payloadKey) {
  const parsed = parseUniqueUnhashedKv(raw, label);
  const last = parsed.lines[parsed.lines.length - 1];
  if (!last.startsWith(`${payloadKey}=`) || !/^[0-9a-f]{64}$/.test(parsed.rows.get(payloadKey) || "")) {
    throw new Error(`${label} must end in ${payloadKey}=<sha256>`);
  }
  const payload = Buffer.from(parsed.lines.slice(0, -1).join("\n") + "\n", "utf8");
  if (sha256(payload) !== parsed.rows.get(payloadKey)) throw new Error(`${label} payload hash mismatch`);
  return parsed.rows;
}

function requireSha256(value, label) {
  const normalized = String(value || "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error(`${label} must be a lowercase SHA-256`);
  return normalized;
}

function boundWorkSnapshot(workDir, pathValue, expectedSha256, label, allowEmpty = false, maxBytes = MAX_SNAPSHOT_BYTES) {
  const path = canonicalAbsolute(pathValue, label, "file", false, allowEmpty);
  if (dirname(path) !== workDir) throw new Error(`${label} must be a direct child of the production gate work directory`);
  const snapshot = stableSnapshot(path, label, maxBytes, allowEmpty);
  if (snapshot.sha256 !== requireSha256(expectedSha256, `${label} expected SHA-256`)) throw new Error(`${label} SHA-256 mismatch`);
  return snapshot;
}

function exactDistinctSnapshots(snapshots, label) {
  for (let left = 0; left < snapshots.length; left++) {
    for (let right = left + 1; right < snapshots.length; right++) {
      if (snapshots[left].path === snapshots[right].path ||
          (snapshots[left].stat.dev === snapshots[right].stat.dev && snapshots[left].stat.ino === snapshots[right].stat.ino)) {
        throw new Error(`${label} must use distinct paths and inodes`);
      }
    }
  }
}

function openStreamingState(path, label, maxBytes) {
  const before = lstatSync(path, {bigint: true});
  if (before.isSymbolicLink() || !before.isFile() || before.size <= 0n) throw new Error(`${label} must be a non-empty regular non-symlink file: ${path}`);
  if (before.size > BigInt(maxBytes)) throw new Error(`${label} exceeds ${maxBytes} bytes: ${path}`);
  if (!Number.isInteger(constants.O_NOFOLLOW)) throw new Error("O_NOFOLLOW is required for regalloc preflight snapshots");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd, {bigint: true});
    if (!opened.isFile() || !sameStat(before, opened)) throw new Error(`${label} changed before open: ${path}`);
    return {path, label, fd, opened, hash: createHash("sha256"), buffer: Buffer.allocUnsafe(1024 * 1024)};
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function readStreamingChunk(state, offset) {
  const remaining = state.opened.size - BigInt(offset);
  if (remaining <= 0n) return 0;
  const wanted = Number(remaining > BigInt(state.buffer.length) ? BigInt(state.buffer.length) : remaining);
  let filled = 0;
  while (filled < wanted) {
    const count = readSync(state.fd, state.buffer, filled, wanted - filled, offset + filled);
    if (count <= 0) throw new Error(`${state.label} truncated while streaming: ${state.path}`);
    filled += count;
  }
  state.hash.update(state.buffer.subarray(0, filled));
  return filled;
}

function finishStreamingState(state) {
  const afterFd = fstatSync(state.fd, {bigint: true});
  const afterPath = lstatSync(state.path, {bigint: true});
  if (afterPath.isSymbolicLink() || !afterPath.isFile() || !sameStat(state.opened, afterFd) || !sameStat(afterFd, afterPath)) throw new Error(`${state.label} changed while streaming: ${state.path}`);
  return {path: state.path, sha256: state.hash.digest("hex"), stat: afterPath};
}

function stableStreamingSnapshot(path, label, maxBytes = MAX_SNAPSHOT_BYTES) {
  const state = openStreamingState(path, label, maxBytes);
  try {
    let offset = 0;
    while (BigInt(offset) < state.opened.size) offset += readStreamingChunk(state, offset);
    return finishStreamingState(state);
  } finally {
    closeSync(state.fd);
  }
}

function stableStreamingRawCompare(specs, maxBytes = MAX_SNAPSHOT_BYTES) {
  const states = [];
  try {
    for (const spec of specs) states.push(openStreamingState(spec.path, spec.label, maxBytes));
    let identical = states.every((state) => state.opened.size === states[0].opened.size);
    let offset = 0;
    const maxSize = states.reduce((largest, state) => state.opened.size > largest ? state.opened.size : largest, 0n);
    while (BigInt(offset) < maxSize) {
      const counts = states.map((state) => readStreamingChunk(state, offset));
      if (!counts.every((count) => count === counts[0])) identical = false;
      if (identical) {
        const first = states[0].buffer.subarray(0, counts[0]);
        for (let index = 1; index < states.length; index++) {
          if (!first.equals(states[index].buffer.subarray(0, counts[index]))) {
            identical = false;
            break;
          }
        }
      }
      offset += states[0].buffer.length;
    }
    return {identical, snapshots: states.map((state) => finishStreamingState(state))};
  } finally {
    for (const state of states) closeSync(state.fd);
  }
}

function strictKv(raw, label, payloadKey) {
  let text;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(raw); }
  catch (error) { throw new Error(`${label} must be valid UTF-8: ${error instanceof Error ? error.message : String(error)}`); }
  if (!text.endsWith("\n") || text.includes("\r")) throw new Error(`${label} must use LF lines and end with LF`);
  const lines = text.slice(0, -1).split("\n");
  if (lines.length < 2) throw new Error(`${label} is incomplete`);
  const rows = new Map();
  for (let index = 0; index < lines.length; index++) {
    const split = lines[index].indexOf("=");
    if (split <= 0) throw new Error(`${label} line ${index + 1} is not key=value`);
    const key = lines[index].slice(0, split);
    const value = lines[index].slice(split + 1);
    if (!/^[A-Za-z0-9_.-]+$/.test(key) || rows.has(key)) throw new Error(`${label} has invalid or duplicate key: ${key}`);
    if (value.length === 0) throw new Error(`${label} has empty value: ${key}`);
    rows.set(key, value);
  }
  const lastKey = lines[lines.length - 1].slice(0, lines[lines.length - 1].indexOf("="));
  if (lastKey !== payloadKey || !/^[0-9a-f]{64}$/.test(rows.get(payloadKey) || "")) throw new Error(`${label} must end in ${payloadKey}=<sha256>`);
  const payload = Buffer.from(lines.slice(0, -1).join("\n") + "\n", "utf8");
  if (sha256(payload) !== rows.get(payloadKey)) throw new Error(`${label} payload hash mismatch`);
  return {rows, lines};
}

function validateCanonicalRegallocEvidenceLabels(raw, label) {
  const text = typeof raw === "string"
    ? raw
    : new TextDecoder("utf-8", {fatal: true}).decode(raw);
  const forbidden = [
    /\bv(?:3|4|5|6)\s+(?:receipt|snapshot|ledger|report)\b/g,
    /\b(?:receipt|object|snapshot|ledger|report)\/v(?:3|4|5|6)\b/g,
    /(?:^|_)v(?:3|4|5|6)(?:_|$)/g,
    /\bv(?:3|4|5|6)(?:\/v(?:3|4|5|6))+\s+evidence\b/g,
    /\bregalloc_(?:single_pass\.production|frozen_plan_snapshot|action_emission_ledger|production_gate)\.v(?:3|4|5|6)\b/g,
  ];
  const matches = forbidden.flatMap((pattern) => text.match(pattern) || []);
  if (matches.length !== 0) {
    throw new Error(
      `${label} retained legacy regalloc evidence labels: ${
        [...new Set(matches)].sort().join(",")
      }`,
    );
  }
  return {
    schema: "cheng_regalloc_evidence_label_surface",
    label,
    legacyLabelCount: 0,
  };
}

function formalExpressionSlice(raw) {
  const text = typeof raw === "string" ? raw : new TextDecoder("utf-8", {fatal: true}).decode(raw);
  const versionMatches = [
    ...text.matchAll(/^> 版本：([0-9]{4}-[0-9]{2}-[0-9]{2})$/gm),
  ];
  if (versionMatches.length !== 1 || versionMatches[0]?.[1] === undefined) {
    throw new Error("formal spec must contain exactly one canonical version");
  }
  const startAnchor = "expression     ::= conditionalExpr ;\n";
  const endAnchor = "iteratorLiteral ::= \"iterator\" [ ident ] [ typeParamList ] paramList\n                    [ \":\" typeExpr ]\n                    [ \"where\" expression ]\n                    \"=\" suite ;";
  const start = text.indexOf(startAnchor);
  const endStart = text.indexOf(endAnchor, start + startAnchor.length);
  if (start < 0 || endStart < 0 || text.indexOf(startAnchor, start + 1) >= 0 || text.indexOf(endAnchor, endStart + 1) >= 0) throw new Error("formal expression EBNF anchors must each occur exactly once");
  const end = endStart + endAnchor.length;
  if (text[end] !== "\n") throw new Error("formal expression EBNF slice must end in LF");
  const slice = Buffer.from(text.slice(start, end + 1), "utf8");
  const sliceSha256 = sha256(slice);
  return {
    text: slice.toString("utf8"),
    raw: slice,
    sha256: sliceSha256,
    specVersion: versionMatches[0][1],
  };
}

function exactFormalSpecSlice(text, label, startAnchor, endAnchor) {
  const start = text.indexOf(startAnchor);
  const endStart = text.indexOf(endAnchor, start + startAnchor.length);
  if (start < 0 || endStart < 0 || text.indexOf(startAnchor, start + 1) >= 0 || text.indexOf(endAnchor, endStart + 1) >= 0) {
    throw new Error(`${label} anchors must each occur exactly once`);
  }
  const end = endStart + endAnchor.length;
  const raw = Buffer.from(text.slice(start, end), "utf8");
  return {text: raw.toString("utf8"), raw, sha256: sha256(raw)};
}

function formalExpressionSupplementalSlices(raw) {
  const text = typeof raw === "string" ? raw : new TextDecoder("utf-8", {fatal: true}).decode(raw);
  const grammar = exactFormalSpecSlice(
    text,
    "formal grammar block",
    "module         ::= { NEWLINE }\n",
    "charLiteral    ::= `'` CHARACTER `'` ;\n",
  );
  const literals = exactFormalSpecSlice(
    text,
    "formal bool/char literal definitions",
    'boolLiteral    ::= "true" | "false" ;\n',
    "charLiteral    ::= `'` CHARACTER `'` ;\n",
  );
  const lexical = exactFormalSpecSlice(
    text,
    "formal lexical terminal definitions",
    "ident          ::= IDENT ;\n",
    "stringLiteral  ::= SHORT_STRING | MULTILINE_STRING ;\n",
  );
  const precedence = exactFormalSpecSlice(
    text,
    "formal operator precedence table",
    "### 1.3 运算符优先级\n",
    "| 15  | `?:` | 条件运算 |\n",
  );
  const conditional = exactFormalSpecSlice(
    text,
    "formal conditional-expression semantics",
    "#### 1.3.4 条件表达式 `?:` 与 postfix `?` 区分\n",
    "- 例：`flag ? 1 : false ? 2 : 0` 按右结合解析为 `flag ? 1 : (false ? 2 : 0)`。\n",
  );
  const moduleVisibility = exactFormalSpecSlice(
    text,
    "formal module visibility semantics",
    "### 1.4 模块导出与可见性\n",
    "- 不支持 `*` 导出标记。\n",
  );
  return {grammar, literals, lexical, precedence, conditional, moduleVisibility};
}

function validateGeneratedEbnfParserMapBinding(
  raw,
  formalSpecRaw,
  parserRaw,
  producerDeclarationsRaw,
) {
  let value;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", {fatal: true}).decode(raw),
    );
  } catch (error) {
    throw new Error(
      `generated EBNF parser map is not strict JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const exactTopLevel = [
    "counts",
    "parser",
    "producerDeclarations",
    "receiptEvidence",
    "rows",
    "schema",
    "spec",
  ];
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !==
        JSON.stringify(exactTopLevel)) {
    throw new Error("generated EBNF parser map exact schema mismatch");
  }
  if (value.schema !== "cheng_ebnf_parser_node_map" ||
      /\.v[0-9]+$/.test(value.schema)) {
    throw new Error("generated EBNF parser map schema is not the unique current schema");
  }
  const formalSpecBytes = Buffer.isBuffer(formalSpecRaw)
    ? formalSpecRaw
    : Buffer.from(formalSpecRaw);
  const parserBytes = Buffer.isBuffer(parserRaw)
    ? parserRaw
    : Buffer.from(parserRaw);
  const producerDeclarationsBytes =
    Buffer.isBuffer(producerDeclarationsRaw)
      ? producerDeclarationsRaw
      : Buffer.from(producerDeclarationsRaw);
  const formalSpecSha256 = sha256(formalSpecBytes);
  const parserSha256 = sha256(parserBytes);
  const producerDeclarationsSha256 = sha256(producerDeclarationsBytes);
  const regenerated = buildEbnfParserNodeMap(
    formalSpecBytes,
    parserBytes,
    producerDeclarationsBytes,
  );
  const producerProjection = (doc) => ({
    schema: doc.schema,
    spec: doc.spec,
    parser: doc.parser,
    producerDeclarations: doc.producerDeclarations,
    requiredObligationCount: doc.counts.requiredObligationCount,
    rows: doc.rows.map((row) => ({
      production: row.production,
      name: row.name,
      body_ref: row.body_ref,
      parser_fn: row.parser_fn,
      node_kinds: row.node_kinds,
      node_kind_receipts: row.node_kind_receipts,
      span_model: row.span_model,
      required_obligation_count: row.required_obligation_count,
      producer_receipt_sha256: row.producer_receipt_sha256,
      notes: row.notes,
    })),
  });
  if (canonicalJson(producerProjection(value)) !==
      canonicalJson(producerProjection(regenerated))) {
    throw new Error(
      "generated EBNF parser map producer projection is not current",
    );
  }
  const counts = value.counts;
  const receipts = value.receiptEvidence;
  const rows = value.rows;
  if (value.spec?.path !== FORMAL_SPEC_RELATIVE ||
      value.spec?.formalSpecSha256 !== formalSpecSha256 ||
      typeof value.spec?.ebnfSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(value.spec.ebnfSha256) ||
      value.parser?.path !== "src/core/lang/parser.cheng" ||
      value.parser?.sha256 !== parserSha256 ||
      !Array.isArray(rows) ||
      !Number.isSafeInteger(value.spec?.productionCount) ||
      value.spec.productionCount <= 0 ||
      rows.length !== value.spec.productionCount ||
      value.producerDeclarations?.path !==
        EBNF_PARSER_PRODUCER_DECLARATIONS_RELATIVE ||
      value.producerDeclarations?.sha256 !==
        producerDeclarationsSha256) {
    throw new Error("generated EBNF parser map formal spec/parser identity mismatch");
  }
  const receiptRowKeys = [
    "accepted",
    "manifestPath",
    "manifestSha256",
    "reason",
    "receiptPath",
    "receiptSha256",
    "sourcePath",
    "sourceSha256",
  ];
  if (receipts === null || typeof receipts !== "object" ||
      Array.isArray(receipts) ||
      canonicalJson(Object.keys(receipts).sort()) !== canonicalJson([
        "acceptedCount",
        "inputCount",
        "rejectedCount",
        "rows",
      ]) ||
      !Number.isSafeInteger(receipts.inputCount) ||
      receipts.inputCount <= 0 ||
      receipts.acceptedCount !== receipts.inputCount ||
      receipts.rejectedCount !== 0 ||
      !Array.isArray(receipts.rows) ||
      receipts.rows.length !== receipts.inputCount ||
      receipts.rows.some((row) =>
        row === null || typeof row !== "object" || Array.isArray(row) ||
        canonicalJson(Object.keys(row).sort()) !==
          canonicalJson(receiptRowKeys) ||
        row?.accepted !== true ||
        row?.reason !== "" ||
        typeof row?.sourcePath !== "string" ||
        row.sourcePath.length === 0 ||
        typeof row?.receiptPath !== "string" ||
        row.receiptPath.length === 0 ||
        typeof row?.manifestPath !== "string" ||
        row.manifestPath.length === 0 ||
        !/^[0-9a-f]{64}$/.test(row?.sourceSha256 ?? "") ||
        !/^[0-9a-f]{64}$/.test(row?.receiptSha256 ?? "") ||
        !/^[0-9a-f]{64}$/.test(row?.manifestSha256 ?? "")
      )) {
    throw new Error("generated EBNF parser map has zero, rejected or malformed production receipts");
  }
  const receiptPaths = new Set();
  const receiptFixedPointGroups = new Map();
  for (const row of receipts.rows) {
    if (receiptPaths.has(row.receiptPath)) {
      throw new Error("generated EBNF parser map repeats a receipt path");
    }
    receiptPaths.add(row.receiptPath);
    const groupKey = `${row.manifestSha256}\0${row.sourcePath}`;
    const group = receiptFixedPointGroups.get(groupKey) ?? [];
    group.push(row);
    receiptFixedPointGroups.set(groupKey, group);
  }
  if ([...receiptFixedPointGroups.values()].some((group) =>
    group.length !== 2 ||
    group[0].sourceSha256 !== group[1].sourceSha256 ||
    group[0].manifestPath !== group[1].manifestPath ||
    group[0].receiptSha256 === group[1].receiptSha256
  )) {
    throw new Error(
      "generated EBNF parser map receipt fixed point identity is invalid",
    );
  }
  const mapRowKeys = [
    "body_ref",
    "missing_required_count",
    "missing_required_obligation_ids",
    "name",
    "node_kind_receipts",
    "node_kinds",
    "notes",
    "parser_fn",
    "producer_receipt_sha256",
    "production",
    "receipt_ready",
    "required_obligation_count",
    "span_model",
    "status",
    "witness_projections",
    "witness_receipt_sha256s",
    "witnessed_required_count",
  ];
  const witnessProjectionKeys = [
    "channel",
    "obligation_id",
    "parser_node_identity_sha256",
    "parser_node_kind",
    "receipt_sha256",
  ];
  if (counts === null || typeof counts !== "object" ||
      Array.isArray(counts) ||
      canonicalJson(Object.keys(counts).sort()) !== canonicalJson([
        "MAPPED",
        "PARTIAL",
        "UNMAPPED",
        "missingRequiredCount",
        "requiredObligationCount",
        "total",
        "witnessedRequiredCount",
      ]) ||
      counts.total !== rows.length ||
      counts.MAPPED + counts.PARTIAL + counts.UNMAPPED !== rows.length ||
      counts.requiredObligationCount !==
        counts.witnessedRequiredCount + counts.missingRequiredCount ||
      counts.MAPPED !== rows.length ||
      counts.PARTIAL !== 0 ||
      counts.UNMAPPED !== 0 ||
      counts.requiredObligationCount <= 0 ||
      counts.witnessedRequiredCount !== counts.requiredObligationCount ||
      counts.missingRequiredCount !== 0 ||
      rows.some((row, index) =>
        row === null || typeof row !== "object" || Array.isArray(row) ||
        canonicalJson(Object.keys(row).sort()) !== canonicalJson(mapRowKeys) ||
        row?.production !== index + 1 ||
        row?.status !== "MAPPED" ||
        row?.receipt_ready !== true ||
        row.required_obligation_count !==
          row.witnessed_required_count + row.missing_required_count ||
        row.witnessed_required_count !== row.required_obligation_count ||
        row.missing_required_count !== 0 ||
        !Array.isArray(row.missing_required_obligation_ids) ||
        row.missing_required_obligation_ids.length !== 0 ||
        !Array.isArray(row.witness_receipt_sha256s) ||
        row.witness_receipt_sha256s.length === 0 ||
        row.witness_receipt_sha256s.some((receiptSha256) =>
          !/^[0-9a-f]{64}$/.test(receiptSha256)) ||
        !Array.isArray(row.witness_projections) ||
        new Set(row.witness_projections.map((projection) =>
          projection?.obligation_id)).size !==
            row.required_obligation_count ||
        row.witness_projections.some((projection) =>
          projection === null ||
          typeof projection !== "object" ||
          Array.isArray(projection) ||
          canonicalJson(Object.keys(projection).sort()) !==
            canonicalJson(witnessProjectionKeys) ||
          typeof projection.channel !== "string" ||
          projection.channel.length === 0 ||
          typeof projection.obligation_id !== "string" ||
          projection.obligation_id.length === 0 ||
          typeof projection.parser_node_kind !== "string" ||
          projection.parser_node_kind.length === 0 ||
          !parserOwnedStructuredWitnessAccepted(
            row.span_model,
            projection.parser_node_kind,
          ) ||
          !/^[0-9a-f]{64}$/.test(
            projection.parser_node_identity_sha256 ?? "") ||
          !/^[0-9a-f]{64}$/.test(projection.receipt_sha256 ?? "") ||
          !row.witness_receipt_sha256s.includes(
            projection.receipt_sha256))
      )) {
    throw new Error("generated EBNF parser map obligation/status projection is invalid");
  }
  const receiptGroupKeyBySha256 = new Map();
  for (const [groupKey, group] of receiptFixedPointGroups) {
    for (const receipt of group) {
      if (receiptGroupKeyBySha256.has(receipt.receiptSha256)) {
        throw new Error(
          "generated EBNF parser map repeats a receipt content identity",
        );
      }
      receiptGroupKeyBySha256.set(receipt.receiptSha256, groupKey);
    }
  }
  const admittedReceiptSha256s =
    new Set(receipts.rows.map((row) => row.receiptSha256));
  for (const [index, row] of rows.entries()) {
    const expectedObligationIds =
      regenerated.rows[index].missing_required_obligation_ids;
    const projectedObligationIds = [
      ...new Set(row.witness_projections.map(
        (projection) => projection.obligation_id,
      )),
    ].sort();
    if (canonicalJson(projectedObligationIds) !==
          canonicalJson([...expectedObligationIds].sort()) ||
        row.witness_receipt_sha256s.some(
          (receiptSha256) =>
            !admittedReceiptSha256s.has(receiptSha256)) ||
        row.witness_projections.some(
          (projection) =>
            !admittedReceiptSha256s.has(
              projection.receipt_sha256))) {
      throw new Error(
        "generated EBNF parser map witness projection is not receipt-bound",
      );
    }
    for (const obligationId of expectedObligationIds) {
      const groups = new Map();
      for (const projection of row.witness_projections) {
        if (projection.obligation_id !== obligationId) continue;
        const groupKey =
          receiptGroupKeyBySha256.get(projection.receipt_sha256);
        if (groupKey === undefined) {
          throw new Error(
            "generated EBNF parser map witness projection receipt is unknown",
          );
        }
        const receiptHashes = groups.get(groupKey) ?? new Set();
        receiptHashes.add(projection.receipt_sha256);
        groups.set(groupKey, receiptHashes);
      }
      if (![...groups.values()].some(
        (receiptHashes) => receiptHashes.size === 2)) {
        throw new Error(
          "generated EBNF parser map witness projection lacks " +
          "a two-driver fixed point",
        );
      }
    }
  }
  return {
    schema: value.schema,
    mapSha256: sha256(Buffer.isBuffer(raw) ? raw : Buffer.from(raw)),
    formalSpecSha256: value.spec.formalSpecSha256,
    formalEbnfSha256: value.spec.ebnfSha256,
    parserSha256: value.parser.sha256,
    producerDeclarationsSha256: value.producerDeclarations.sha256,
    receiptEvidenceSha256: sha256(
      Buffer.from(canonicalJson(receipts)),
    ),
    productionCount: value.spec.productionCount,
    receiptInputCount: receipts.inputCount,
    receiptAcceptedCount: receipts.acceptedCount,
    mappedCount: counts.MAPPED,
    partialCount: counts.PARTIAL,
    unmappedCount: counts.UNMAPPED,
    requiredObligationCount: counts.requiredObligationCount,
    witnessedRequiredCount: counts.witnessedRequiredCount,
    missingRequiredCount: counts.missingRequiredCount,
  };
}

function validateTypedExprFormalSpecBinding(
  raw,
  generatedMapRaw,
  parserRaw,
  producerDeclarationsRaw,
  identityContext,
) {
  const sourcePath = identityContext?.sourcePath ?? FORMAL_SPEC_RELATIVE;
  try {
    if (identityContext === null || typeof identityContext !== "object" ||
        !/^[0-9a-f]{64}$/.test(
          identityContext.sourceSnapshotSha256 ?? "") ||
        !/^[0-9a-f]{64}$/.test(
          identityContext.receiptToolClosureSha256 ?? "") ||
        !/^[0-9a-f]{64}$/.test(
          identityContext.receiptSourcePlanSha256 ?? "")) {
      throw new Error(
        "current formal profile requires exact source snapshot, receipt tool closure and source-plan identities",
      );
    }
    const formalSpecRaw = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const generatedMap = validateGeneratedEbnfParserMapBinding(
      generatedMapRaw,
      formalSpecRaw,
      parserRaw,
      producerDeclarationsRaw,
    );
    const slice = formalExpressionSlice(formalSpecRaw);
    const supplemental = formalExpressionSupplementalSlices(raw);
    const supplementalBindings = [
      {schema: FORMAL_GRAMMAR_BLOCK_SCHEMA, sha256: supplemental.grammar.sha256, bytes: supplemental.grammar.raw.length},
      {schema: FORMAL_LITERAL_DEFINITIONS_SCHEMA, sha256: supplemental.literals.sha256, bytes: supplemental.literals.raw.length},
      {schema: FORMAL_LEXICAL_DEFINITIONS_SCHEMA, sha256: supplemental.lexical.sha256, bytes: supplemental.lexical.raw.length},
      {schema: FORMAL_OPERATOR_PRECEDENCE_SCHEMA, sha256: supplemental.precedence.sha256, bytes: supplemental.precedence.raw.length},
      {schema: FORMAL_CONDITIONAL_SEMANTICS_SCHEMA, sha256: supplemental.conditional.sha256, bytes: supplemental.conditional.raw.length},
      {schema: FORMAL_MODULE_VISIBILITY_SCHEMA, sha256: supplemental.moduleVisibility.sha256, bytes: supplemental.moduleVisibility.raw.length},
    ];
    const currentSourceManifest = {
      schema: CURRENT_FORMAL_SOURCE_MANIFEST_SCHEMA,
      sourceSnapshotSha256: identityContext.sourceSnapshotSha256,
      receiptToolClosureSha256:
        identityContext.receiptToolClosureSha256,
      receiptSourcePlanSha256:
        identityContext.receiptSourcePlanSha256,
      receiptEvidenceSha256: generatedMap.receiptEvidenceSha256,
      files: [
        {path: FORMAL_SPEC_RELATIVE, sha256: generatedMap.formalSpecSha256},
        {path: "src/core/lang/parser.cheng", sha256: generatedMap.parserSha256},
        {
          path: EBNF_PARSER_PRODUCER_DECLARATIONS_RELATIVE,
          sha256: generatedMap.producerDeclarationsSha256,
        },
        {
          path: EBNF_PARSER_NODE_MAP_RELATIVE,
          sha256: generatedMap.mapSha256,
        },
      ],
    };
    const currentSourceManifestSha256 = sha256(
      Buffer.from(canonicalJson(currentSourceManifest)),
    );
    const profilePayload = {
      schema: CURRENT_FORMAL_PROFILE_SCHEMA,
      specVersion: slice.specVersion,
      sourceManifestSha256: currentSourceManifestSha256,
      sourceSnapshotSha256: identityContext.sourceSnapshotSha256,
      receiptToolClosureSha256:
        identityContext.receiptToolClosureSha256,
      receiptSourcePlanSha256:
        identityContext.receiptSourcePlanSha256,
      formalSpecSha256: generatedMap.formalSpecSha256,
      formalEbnfSha256: generatedMap.formalEbnfSha256,
      expressionSliceSha256: slice.sha256,
      mapSha256: generatedMap.mapSha256,
      receiptEvidenceSha256: generatedMap.receiptEvidenceSha256,
      compilerProfileSha256: formalChengCompilerProfile().sha256,
      supplementalBindings,
    };
    const profileIdentitySha256 = sha256(
      Buffer.from(canonicalJson(profilePayload)),
    );
    if (identityContext.expectedProfileIdentitySha256 !== undefined &&
        identityContext.expectedProfileIdentitySha256 !==
          profileIdentitySha256) {
      throw new Error("current formal profile identity drifted");
    }
    return {
      status: "GREEN",
      reason: "formal blocks, parser producer projection, parser receipts and the current source snapshot manifest share one exact identity",
      sourcePath,
      schema: CURRENT_FORMAL_PROFILE_SCHEMA,
      specVersion: slice.specVersion,
      sliceSha256: slice.sha256,
      sliceBytes: slice.raw.length,
      generatedMap,
      currentSourceManifest,
      currentSourceManifestSha256,
      profileIdentitySha256,
      supplementalBindings,
    };
  } catch (error) {
    return {
      status: "UNPROVEN",
      reason: error instanceof Error ? error.message : String(error),
      sourcePath,
      schema: CURRENT_FORMAL_PROFILE_SCHEMA,
    };
  }
}

function tokenizeFormalExpressionEbnf(text) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    if (/\s/.test(text[index])) { index++; continue; }
    if (text.slice(index, index + 3) === "::=") { tokens.push({kind: "assign", value: "::="}); index += 3; continue; }
    if (text[index] === '"') {
      let value = "";
      index++;
      let closed = false;
      while (index < text.length) {
        if (text[index] === "\\" && index + 1 < text.length) {
          value += text[index] + text[index + 1];
          index += 2;
          continue;
        }
        if (text[index] === '"') { index++; closed = true; break; }
        value += text[index++];
      }
      if (!closed) throw new Error("formal expression EBNF contains an unterminated terminal");
      tokens.push({kind: "terminal", value});
      continue;
    }
    const ident = text.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (ident) { tokens.push({kind: "ident", value: ident[0]}); index += ident[0].length; continue; }
    if ("[]{}()|;".includes(text[index])) { tokens.push({kind: text[index], value: text[index]}); index++; continue; }
    throw new Error(`formal expression EBNF has an unsupported token at byte ${Buffer.byteLength(text.slice(0, index), "utf8")}: ${JSON.stringify(text[index])}`);
  }
  return tokens;
}

function parseFormalExpressionEbnf(text) {
  const tokens = tokenizeFormalExpressionEbnf(text);
  let cursor = 0;
  const peek = () => tokens[cursor] || null;
  const take = (kind) => {
    const token = peek();
    if (!token || token.kind !== kind) throw new Error(`formal expression EBNF expected ${kind}, got ${token?.kind || "EOF"}`);
    cursor++;
    return token;
  };
  const parseChoice = (stop) => {
    const alternatives = [parseSequence(new Set([...stop, "|"]))];
    while (peek()?.kind === "|") { take("|"); alternatives.push(parseSequence(new Set([...stop, "|"]))); }
    return alternatives.length === 1 ? alternatives[0] : {kind: "choice", alternatives};
  };
  const parseSequence = (stop) => {
    const items = [];
    while (peek() && !stop.has(peek().kind)) items.push(parseAtom());
    return {kind: "sequence", items};
  };
  const parseAtom = () => {
    const token = peek();
    if (!token) throw new Error("formal expression EBNF ended inside a production");
    if (token.kind === "ident") { cursor++; return {kind: "symbol", value: token.value}; }
    if (token.kind === "terminal") { cursor++; return {kind: "terminal", value: token.value}; }
    const wrappers = {"[": ["]", "optional"], "{": ["}", "repetition"], "(": [")", "group"]};
    const wrapper = wrappers[token.kind];
    if (wrapper) {
      cursor++;
      const child = parseChoice(new Set([wrapper[0]]));
      take(wrapper[0]);
      return {kind: wrapper[1], child};
    }
    throw new Error(`formal expression EBNF has unexpected ${token.kind}`);
  };
  const productions = [];
  const names = new Set();
  while (cursor < tokens.length) {
    const name = take("ident").value;
    if (names.has(name)) throw new Error(`formal expression EBNF has duplicate production: ${name}`);
    names.add(name);
    take("assign");
    const expression = parseChoice(new Set([";"]));
    take(";");
    productions.push({name, expression});
  }
  return productions;
}

function canonicalFormalEbnfNode(node) {
  if (node.kind === "symbol") return `N(${node.value})`;
  if (node.kind === "terminal") return `T(${JSON.stringify(node.value)})`;
  if (node.kind === "sequence") return `S(${node.items.map(canonicalFormalEbnfNode).join(",")})`;
  if (node.kind === "choice") return `C(${node.alternatives.map(canonicalFormalEbnfNode).join("|")})`;
  if (node.kind === "optional") return `O(${canonicalFormalEbnfNode(node.child)})`;
  if (node.kind === "repetition") return `R(${canonicalFormalEbnfNode(node.child)})`;
  if (node.kind === "group") return `G(${canonicalFormalEbnfNode(node.child)})`;
  throw new Error(`unknown formal EBNF node kind: ${node.kind}`);
}

function renderFormalEbnfNode(node) {
  if (node.kind === "symbol") return node.value;
  if (node.kind === "terminal") return JSON.stringify(node.value);
  if (node.kind === "sequence") return node.items.map(renderFormalEbnfNode).join(" ");
  if (node.kind === "choice") return node.alternatives.map(renderFormalEbnfNode).join(" | ");
  if (node.kind === "optional") return `[ ${renderFormalEbnfNode(node.child)} ]`;
  if (node.kind === "repetition") return `{ ${renderFormalEbnfNode(node.child)} }`;
  if (node.kind === "group") return `( ${renderFormalEbnfNode(node.child)} )`;
  throw new Error(`unknown formal EBNF node kind: ${node.kind}`);
}

function deriveFormalExpressionObligationManifest(raw) {
  const slice = formalExpressionSlice(raw);
  const supplemental = formalExpressionSupplementalSlices(raw);
  const productions = parseFormalExpressionEbnf(slice.text);
  const productionNames = new Set(productions.map((production) => production.name));
  const externalReferences = new Set();
  const obligations = [];
  const ids = new Set();
  const structurallyImpossibleInteractions = [];
  const addObligation = (row) => {
    if (ids.has(row.obligation_id)) throw new Error(`formal EBNF obligation id collision: ${row.obligation_id}`);
    ids.add(row.obligation_id);
    obligations.push(row);
  };
  const shortHash = (node) => sha256(Buffer.from(canonicalFormalEbnfNode(node), "utf8")).slice(0, 16);
  const chainRows = [];
  for (const production of productions) {
    addObligation({obligation_id: `ebnf.${production.name}.production`, production: production.name, kind: "production", state: "reachable", fragment: renderFormalEbnfNode(production.expression), fragment_sha256: sha256(Buffer.from(canonicalFormalEbnfNode(production.expression), "utf8"))});
    const counters = {choice: 0, optional: 0, repetition: 0};
    const structuralSites = [];
    const withActivationGuard = (guards, site, states) => {
      const next = new Map([...guards].map(([key, values]) => [key, new Set(values)]));
      const prior = next.get(site);
      next.set(site, prior ? new Set([...prior].filter((state) => states.includes(state))) : new Set(states));
      return next;
    };
    const renderActivationGuards = (guards) => [...guards].sort(([left], [right]) => left.localeCompare(right)).map(([site, states]) => ({site, states: [...states].sort()}));
    const visit = (node, activationGuards = new Map()) => {
      if (node.kind === "symbol") {
        if (!productionNames.has(node.value) && !["NEWLINE", "INDENT", "DEDENT"].includes(node.value)) externalReferences.add(node.value);
        return;
      }
      if (node.kind === "terminal") return;
      if (node.kind === "choice") {
        const ordinal = counters.choice++;
        const duplicateHashes = new Map();
        const states = [];
        const alternatives = [];
        for (const alternative of node.alternatives) {
          const hash = shortHash(alternative);
          const occurrence = duplicateHashes.get(hash) || 0;
          duplicateHashes.set(hash, occurrence + 1);
          const state = `alt.${hash}.${occurrence}`;
          states.push(state);
          alternatives.push({alternative, hash, occurrence, state});
        }
        const site = `choice.${ordinal}`;
        structuralSites.push({site, states, activationGuards});
        for (const alternative of alternatives) {
          addObligation({obligation_id: `ebnf.${production.name}.${site}.${alternative.state}`, production: production.name, kind: "choice", state: "alternative", siteState: alternative.state, site: ordinal, activationGuards: renderActivationGuards(activationGuards), fragment: renderFormalEbnfNode(alternative.alternative), fragment_sha256: sha256(Buffer.from(canonicalFormalEbnfNode(alternative.alternative), "utf8"))});
          visit(alternative.alternative, withActivationGuard(activationGuards, site, [alternative.state]));
        }
        return;
      }
      if (node.kind === "optional") {
        const ordinal = counters.optional++;
        const site = `optional.${ordinal}`;
        const states = ["absent", "present"];
        structuralSites.push({site, states, activationGuards});
        for (const state of states) addObligation({obligation_id: `ebnf.${production.name}.${site}.${state}`, production: production.name, kind: "optional", state, site: ordinal, activationGuards: renderActivationGuards(activationGuards), fragment: renderFormalEbnfNode(node.child), fragment_sha256: sha256(Buffer.from(canonicalFormalEbnfNode(node.child), "utf8"))});
        visit(node.child, withActivationGuard(activationGuards, site, ["present"]));
        return;
      }
      if (node.kind === "repetition") {
        const ordinal = counters.repetition++;
        const site = `repetition.${ordinal}`;
        const states = ["zero", "one", "many"];
        structuralSites.push({site, states, activationGuards});
        for (const state of states) addObligation({obligation_id: `ebnf.${production.name}.${site}.${state}`, production: production.name, kind: "repetition", state, site: ordinal, activationGuards: renderActivationGuards(activationGuards), fragment: renderFormalEbnfNode(node.child), fragment_sha256: sha256(Buffer.from(canonicalFormalEbnfNode(node.child), "utf8"))});
        visit(node.child, withActivationGuard(activationGuards, site, ["one", "many"]));
        return;
      }
      if (node.kind === "sequence" || node.kind === "group") {
        for (const child of node.kind === "sequence" ? node.items : [node.child]) visit(child, activationGuards);
        return;
      }
      throw new Error(`unknown formal EBNF node kind: ${node.kind}`);
    };
    visit(production.expression);
    const interactionSatisfiable = (leftSite, leftState, rightSite, rightState) => {
      const constraints = new Map();
      const merge = (site, states) => {
        const prior = constraints.get(site);
        const next = prior ? new Set([...prior].filter((state) => states.has(state))) : new Set(states);
        constraints.set(site, next);
        return next.size > 0;
      };
      for (const [site, states] of leftSite.activationGuards) if (!merge(site, states)) return false;
      for (const [site, states] of rightSite.activationGuards) if (!merge(site, states)) return false;
      return merge(leftSite.site, new Set([leftState])) && merge(rightSite.site, new Set([rightState]));
    };
    for (let left = 0; left < structuralSites.length; left++) {
      for (let right = left + 1; right < structuralSites.length; right++) {
        const pair = [structuralSites[left], structuralSites[right]];
        for (const leftState of pair[0].states) {
          for (const rightState of pair[1].states) {
            const fragment = `${pair[0].site}=${leftState},${pair[1].site}=${rightState}`;
            if (!interactionSatisfiable(pair[0], leftState, pair[1], rightState)) {
              structurallyImpossibleInteractions.push({production: production.name, interaction: fragment, proof: "ancestor activation-guard intersection is empty"});
              continue;
            }
            addObligation({obligation_id: `ebnf.${production.name}.interaction.${pair[0].site}.${leftState}__${pair[1].site}.${rightState}`, production: production.name, kind: "structural_interaction", state: "pairwise_cartesian", sites: pair.map((entry) => entry.site), siteStates: [leftState, rightState], fragment, fragment_sha256: sha256(Buffer.from(fragment, "utf8"))});
          }
        }
      }
    }
    const root = production.expression;
    if (root.kind === "sequence" && root.items[0]?.kind === "symbol" && root.items[1]?.kind === "repetition") {
      const lower = root.items[0].value;
      const repeatCanonical = canonicalFormalEbnfNode(root.items[1].child);
      if (repeatCanonical.includes(`N(${lower})`)) chainRows.push({higher: production.name, lower});
    }
  }
  for (const chain of chainRows) {
    addObligation({obligation_id: `ebnf.${chain.higher}.associativity.left`, production: chain.higher, kind: "associativity", state: "left", fragment: `${chain.higher} left-associative repeated ${chain.lower}`, fragment_sha256: sha256(Buffer.from(`${chain.higher}\0left\0${chain.lower}`, "utf8"))});
    addObligation({obligation_id: `ebnf.${chain.higher}.precedence.lower.${chain.lower}`, production: chain.higher, kind: "precedence", state: "lower_binds_tighter", fragment: `${chain.lower} binds tighter than ${chain.higher}`, fragment_sha256: sha256(Buffer.from(`${chain.higher}\0precedence\0${chain.lower}`, "utf8"))});
  }
  const literalDefinitions = new Map([
    ["boolLiteral", 'boolLiteral    ::= "true" | "false" ;\n'],
    ["charLiteral", "charLiteral    ::= `'` CHARACTER `'` ;\n"],
  ]);
  const lexicalDefinitions = new Map([
    ["ident", "ident          ::= IDENT ;\n"],
    ["numberLiteral", "numberLiteral  ::= INTEGER | FLOAT ;\n"],
    ["stringLiteral", "stringLiteral  ::= SHORT_STRING | MULTILINE_STRING ;\n"],
  ]);
  const externalReferenceBindings = [];
  for (const reference of [...externalReferences].sort()) {
    const definition = literalDefinitions.get(reference) || null;
    const literalBound =
      definition !== null && supplemental.literals.text.includes(definition);
    const lexicalDefinition = lexicalDefinitions.get(reference) || null;
    const lexicalBound = lexicalDefinition !== null &&
      supplemental.lexical.text.includes(lexicalDefinition);
    const grammarPattern = new RegExp(`^${reference}\\s+::=`, "m");
    const grammarBound =
      FORMAL_GRAMMAR_BOUND_EXTERNAL_REFERENCES.includes(reference) &&
      grammarPattern.test(supplemental.grammar.text);
    const bound = literalBound || lexicalBound || grammarBound;
    const binding = {
      reference,
      status: bound ? "GREEN" : "UNPROVEN",
      classification: literalBound ? "literal_production" : lexicalBound ? "lexical_terminal_definition" : grammarBound ? "grammar_production_outside_expression_slice" : "lexical_reference_without_pinned_lexer_definition",
      reason: literalBound ? "exact formal literal-definition slice and definition text are hash-bound" : lexicalBound ? "exact formal lexical-terminal-definition slice and definition text are hash-bound" : grammarBound ? "definition is outside the expression slice but exact-hash bound by the complete formal grammar block" : "lexical reference has no exact-hash lexer-definition binding",
      sourceSchema: literalBound ? FORMAL_LITERAL_DEFINITIONS_SCHEMA : lexicalBound ? FORMAL_LEXICAL_DEFINITIONS_SCHEMA : grammarBound ? FORMAL_GRAMMAR_BLOCK_SCHEMA : null,
      sourceSha256: literalBound ? supplemental.literals.sha256 : lexicalBound ? supplemental.lexical.sha256 : grammarBound ? supplemental.grammar.sha256 : null,
      definitionSha256: literalBound ? sha256(Buffer.from(definition, "utf8")) : lexicalBound ? sha256(Buffer.from(lexicalDefinition, "utf8")) : null,
    };
    externalReferenceBindings.push(binding);
    addObligation({
      obligation_id: `ebnf.external.${reference}.definition`,
      production: null,
      kind: "external_reference",
      state: bound ? "definition_hash_bound" : "definition_unproven",
      fragment: reference,
      fragment_sha256: sha256(Buffer.from(reference, "utf8")),
      evidenceRequirement: "formal_spec_binding",
      bindingStatus: binding.status,
      sourceSchema: binding.sourceSchema,
      sourceSha256: binding.sourceSha256,
    });
  }
  addObligation({
    obligation_id: "semantic.operator_precedence.table.binding",
    production: null,
    kind: "semantic_binding",
    state: "exact_hash_bound",
    fragment: supplemental.precedence.text,
    fragment_sha256: supplemental.precedence.sha256,
    evidenceRequirement: "formal_spec_binding",
    bindingStatus: "GREEN",
    sourceSchema: FORMAL_OPERATOR_PRECEDENCE_SCHEMA,
    sourceSha256: supplemental.precedence.sha256,
  });
  const shiftRow = "| 77  | `<< >>` | 移位 |\n";
  addObligation({
    obligation_id: "semantic.operator_precedence.shift.77",
    production: null,
    kind: "precedence",
    state: "shift_precedence_77",
    fragment: shiftRow,
    fragment_sha256: sha256(Buffer.from(shiftRow, "utf8")),
    evidenceRequirement: "formal_and_fixture",
    bindingStatus: supplemental.precedence.text.includes(shiftRow) ? "GREEN" : "UNPROVEN",
    sourceSchema: FORMAL_OPERATOR_PRECEDENCE_SCHEMA,
    sourceSha256: supplemental.precedence.sha256,
  });
  const conditionalRightAssociative = '- `?:` 为右结合，语义遵循 `conditionalExpr ::= logicalOr [ "?" expression ":" conditionalExpr ]`。\n';
  addObligation({
    obligation_id: "semantic.conditionalExpr.associativity.right",
    production: "conditionalExpr",
    kind: "associativity",
    state: "right",
    fragment: conditionalRightAssociative,
    fragment_sha256: sha256(Buffer.from(conditionalRightAssociative, "utf8")),
    evidenceRequirement: "formal_and_fixture",
    bindingStatus: supplemental.conditional.text.includes(conditionalRightAssociative) ? "GREEN" : "UNPROVEN",
    sourceSchema: FORMAL_CONDITIONAL_SEMANTICS_SCHEMA,
    sourceSha256: supplemental.conditional.sha256,
  });
  const factorProduction = productions.find((production) => production.name === "factor");
  const spaceCallProduction = productions.find((production) => production.name === "spaceCall");
  const strictCallSyntax = formalChengCompilerProfile().env.CHENG_STRICT_CALL_SYNTAX === "1";
  const ebnfAdmitsSpaceCall = Boolean(factorProduction && spaceCallProduction && canonicalFormalEbnfNode(factorProduction.expression).includes("N(spaceCall)"));
  // spec 1.3.5 strict-profile 排除条款: 锚点缺席(旧 spec)即无绑定, 钉值/关键字不符同样无绑定
  let spaceCallExclusion = null;
  const specText = typeof raw === "string" ? raw : new TextDecoder("utf-8", {fatal: true}).decode(raw);
  if (specText.includes(FORMAL_SPACECALL_EXCLUSION_START)) {
    spaceCallExclusion = exactFormalSpecSlice(
      specText,
      "formal spaceCall exclusion",
      FORMAL_SPACECALL_EXCLUSION_START,
      FORMAL_SPACECALL_EXCLUSION_END,
    );
  }
  const spaceCallExclusionBound = spaceCallExclusion !== null
    && spaceCallExclusion.text.includes("CHENG_STRICT_CALL_SYNTAX=1")
    && spaceCallExclusion.text.includes("space_call_removed");
  const formalProfileContradictions = [];
  if (strictCallSyntax && ebnfAdmitsSpaceCall) {
    if (!spaceCallExclusionBound) {
      formalProfileContradictions.push({
        feature: "spaceCall",
        status: "UNPROVEN",
        formalState: "admitted_by_factor_and_spaceCall_productions",
        compilerProfileState: "CHENG_STRICT_CALL_SYNTAX=1_rejects_space_call",
        reason: "no exact-hash formal specification exclusion binds strict profile rejection to the admitted EBNF production",
      });
      addObligation({
        obligation_id: "semantic.profile.strict_call_syntax.spaceCall_exclusion",
        production: "spaceCall",
        kind: "formal_profile_consistency",
        state: "contradiction_unresolved",
        fragment: "factor admits spaceCall while CHENG_STRICT_CALL_SYNTAX=1 rejects it",
        fragment_sha256: sha256(Buffer.from("factor\0spaceCall\0CHENG_STRICT_CALL_SYNTAX=1", "utf8")),
        evidenceRequirement: "formal_spec_binding",
        bindingStatus: "UNPROVEN",
        sourceSchema: null,
        sourceSha256: null,
      });
    } else {
      addObligation({
        obligation_id: "semantic.profile.strict_call_syntax.spaceCall_exclusion",
        production: "spaceCall",
        kind: "formal_profile_consistency",
        state: "excluded_by_strict_profile",
        fragment: spaceCallExclusion.text,
        fragment_sha256: spaceCallExclusion.sha256,
        evidenceRequirement: "formal_spec_binding",
        bindingStatus: "GREEN",
        sourceSchema: FORMAL_SPACECALL_EXCLUSION_SCHEMA,
        sourceSha256: spaceCallExclusion.sha256,
      });
    }
  }
  obligations.sort((left, right) => left.obligation_id.localeCompare(right.obligation_id));
  const manifestPayload = {
    schema: "cheng_formal_expression_ebnf_obligation_manifest",
    specVersion: slice.specVersion,
    sliceSha256: slice.sha256,
    supplementalSliceSha256: {
      grammar: supplemental.grammar.sha256,
      literals: supplemental.literals.sha256,
      lexical: supplemental.lexical.sha256,
      precedence: supplemental.precedence.sha256,
      conditional: supplemental.conditional.sha256,
    },
    productionCount: productions.length,
    externalReferences: [...externalReferences].sort(),
    externalReferenceBindings,
    formalProfileContradictions,
    structurallyImpossibleInteractionCount: structurallyImpossibleInteractions.length,
    structurallyImpossibleInteractionProofSha256: sha256(Buffer.from(JSON.stringify(structurallyImpossibleInteractions), "utf8")),
    obligations,
  };
  return {...manifestPayload, obligationCount: obligations.length, manifestSha256: sha256(Buffer.from(JSON.stringify(manifestPayload), "utf8"))};
}

function evaluateFormalExpressionObligationCoverage(manifest, leafCoverage) {
  const declaredFixtureMappings = [];
  const declaredObligations = new Set();
  const obligationById = new Map((manifest.obligations || []).map((entry) => [entry.obligation_id, entry]));
  if (obligationById.size !== (manifest.obligations || []).length) throw new Error("formal obligation manifest contains duplicate IDs");
  for (const entry of leafCoverage.entries || []) {
    const local = new Set();
    for (const obligationId of entry.formalObligationIds || []) {
      if (typeof obligationId !== "string" || obligationId.length === 0) throw new Error(`formal obligation mapping must be a nonempty ID: ${entry.family}`);
      if (local.has(obligationId)) throw new Error(`duplicate formal obligation mapping inside family ${entry.family}: ${obligationId}`);
      local.add(obligationId);
      if (!obligationById.has(obligationId)) throw new Error(`unknown formal obligation mapping: ${entry.family} -> ${obligationId}`);
      if (declaredObligations.has(obligationId)) throw new Error(`duplicate formal obligation mapping across fixture families: ${obligationId}`);
      declaredObligations.add(obligationId);
      declaredFixtureMappings.push({obligation_id: obligationId, family: entry.family, fixture: entry.fixture, evidenceStatus: "DECLARED_ONLY"});
    }
  }
  const satisfied = new Set();
  const formalBindingMappings = [];
  const unboundFormalObligationIds = [];
  for (const obligation of manifest.obligations || []) {
    const requirement = obligation.evidenceRequirement || "fixture";
    if ((requirement === "formal_spec_binding" || requirement === "formal_and_fixture") && obligation.bindingStatus !== "GREEN") {
      unboundFormalObligationIds.push(obligation.obligation_id);
      continue;
    }
    if (requirement === "formal_spec_binding") {
      satisfied.add(obligation.obligation_id);
      formalBindingMappings.push({obligation_id: obligation.obligation_id, sourceSchema: obligation.sourceSchema, sourceSha256: obligation.sourceSha256});
      continue;
    }
    // A ledger declaration is not an execution witness.  Executable obligations stay
    // UNPROVEN until a structured parser/IR trace binds the exact obligation ID, fixture
    // hash and compile result; textual source matching is intentionally forbidden.
  }
  const missingObligationIds = manifest.obligations.map((entry) => entry.obligation_id).filter((id) => !satisfied.has(id));
  return {
    status: missingObligationIds.length === 0 ? "GREEN" : "UNPROVEN",
    reason: missingObligationIds.length === 0 ? "every mechanically derived EBNF/semantic obligation has an exact formal binding or structured parser/IR execution witness" : `${missingObligationIds.length} mechanically derived EBNF/semantic obligations lack an exact formal binding or structured parser/IR execution witness; ${declaredObligations.size} fixture mappings are declarations only`,
    schema: "cheng_formal_expression_ebnf_obligation_coverage",
    manifestSha256: manifest.manifestSha256,
    obligationCount: manifest.obligationCount,
    satisfiedObligationCount: satisfied.size,
    declaredFixtureMappingCount: declaredObligations.size,
    witnessedObligationCount: 0,
    formalBindingMappingCount: formalBindingMappings.length,
    missingObligationCount: missingObligationIds.length,
    missingObligationIds,
    unboundFormalObligationIds,
    declaredFixtureMappings,
    executionWitnesses: [],
    formalBindingMappings,
  };
}

function uintValue(value, label, max = (1n << 64n) - 1n) {
  if (!/^(0|[1-9][0-9]*)$/.test(String(value))) throw new Error(`${label} must be a canonical unsigned integer`);
  const out = BigInt(value);
  if (out > max) throw new Error(`${label} exceeds its integer range`);
  return out;
}

function exactKeys(rows, expected, label) {
  const actual = [...rows.keys()].sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} field set mismatch`);
  }
}

function sourceImports(path, raw) {
  let text;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(raw); }
  catch { throw new Error(`source manifest closure contains invalid UTF-8: ${path}`); }
  const out = [];
  const single = /^import ([A-Za-z_][A-Za-z0-9_./]*)(?: as [A-Za-z_][A-Za-z0-9_]*)?$/;
  const grouped = /^import ([A-Za-z_][A-Za-z0-9_./]*)\/\[([^\]]+)\]$/;
  for (const [index, rawLine] of text.split(/\n/).entries()) {
    const line = rawLine.split("#", 1)[0].trim();
    if (!line.startsWith("import ")) continue;
    const group = line.match(grouped);
    if (group) {
      const members = group[2].split(",").map((value) => value.trim());
      if (members.length === 0 || members.some((value) => !/^[A-Za-z_][A-Za-z0-9_./]*$/.test(value))) {
        throw new Error(`unsupported group import at ${path}:${index + 1}`);
      }
      for (const member of members) out.push(`${group[1]}/${member}`);
      continue;
    }
    const match = line.match(single);
    if (!match) throw new Error(`unsupported import surface at ${path}:${index + 1}`);
    out.push(match[1]);
  }
  return out;
}

function sourceLineLocator(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index++) if (text[index] === "\n") starts.push(index + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (starts[middle] <= offset) low = middle + 1;
      else high = middle;
    }
    return low;
  };
}

function isFmtQuote(text, quoteOffset) {
  if (quoteOffset < 3 || text.slice(quoteOffset - 3, quoteOffset) !== "Fmt") return false;
  return quoteOffset === 3 || !/[A-Za-z0-9_]/.test(text[quoteOffset - 4]);
}

function quotedLiteralEnd(text, quoteOffset, limit) {
  const quote = text[quoteOffset];
  const width = quote === '"' && text.slice(quoteOffset, quoteOffset + 3) === '"""' ? 3 : 1;
  let cursor = quoteOffset + width;
  while (cursor < limit) {
    if (width === 1 && text[cursor] === "\\") {
      if (cursor + 1 >= limit) return {error: "unterminated quoted escape", offset: cursor};
      cursor += 2;
      continue;
    }
    if (width === 3 && text.slice(cursor, cursor + 3) === '"""') return {end: cursor + 3};
    if (width === 1 && text[cursor] === quote) return {end: cursor + 1};
    cursor++;
  }
  return {error: "unterminated quoted literal", offset: quoteOffset};
}

// Exact structural mirror of ParserValueExprFindFmtInterpolationEnd. Quoted
// literals and /* */ comments are opaque; braces nest everywhere else.
function fmtInterpolationEnd(text, contentStart, contentLimit) {
  let cursor = contentStart;
  let braceDepth = 1;
  while (cursor < contentLimit) {
    const ch = text[cursor];
    if (ch === '"' || ch === "'") {
      const quoted = quotedLiteralEnd(text, cursor, contentLimit);
      if (quoted.error) return quoted;
      cursor = quoted.end;
      continue;
    }
    if (ch === "/" && cursor + 1 < contentLimit && text[cursor + 1] === "*") {
      const close = text.indexOf("*/", cursor + 2);
      if (close < 0 || close + 2 > contentLimit) return {error: "unterminated Fmt interpolation comment", offset: cursor};
      cursor = close + 2;
      continue;
    }
    if (ch === "{") braceDepth++;
    else if (ch === "}") {
      braceDepth--;
      if (braceDepth === 0) return {end: cursor};
    }
    cursor++;
  }
  return {error: "unterminated Fmt interpolation", offset: contentStart - 1};
}

function chengSpanHasToken(text) {
  let index = 0;
  while (index < text.length) {
    if (/\s/.test(text[index])) { index++; continue; }
    if (text[index] === "#" || (text[index] === "/" && text[index + 1] === "/")) {
      while (index < text.length && text[index] !== "\n") index++;
      continue;
    }
    if (text[index] === "/" && text[index + 1] === "*") {
      const close = text.indexOf("*/", index + 2);
      if (close < 0) return false;
      index = close + 2;
      continue;
    }
    return true;
  }
  return false;
}

// Exact structural mirror of ParserValueExprParseFmtInterpolations. This does
// not guess through malformed input: every malformed escape/brace/comment is
// returned as a hard analysis error.
function parseFmtLiteral(text, quoteOffset, limit = text.length) {
  const expressions = [];
  const delimiterWidth = text.slice(quoteOffset, quoteOffset + 3) === '"""' ? 3 : 1;
  let cursor = quoteOffset + delimiterWidth;
  while (cursor < limit) {
    const ch = text[cursor];
    if (ch === "\\") {
      if (cursor + 1 >= limit) return {error: "unterminated Fmt escape", offset: cursor, expressions};
      cursor += 2;
      continue;
    }
    if (delimiterWidth === 3 && text.slice(cursor, cursor + 3) === '"""') return {end: cursor + 3, delimiterWidth, expressions};
    if (delimiterWidth === 1 && ch === '"') return {end: cursor + 1, delimiterWidth, expressions};
    if (ch === "{") {
      if (cursor + 1 < limit && text[cursor + 1] === "{") { cursor += 2; continue; }
      const expressionStart = cursor + 1;
      const found = fmtInterpolationEnd(text, expressionStart, limit);
      if (found.error) return {...found, expressions};
      const expressionText = text.slice(expressionStart, found.end);
      if (!chengSpanHasToken(expressionText)) return {error: "empty Fmt interpolation", offset: expressionStart, expressions};
      expressions.push({start: expressionStart, end: found.end});
      cursor = found.end + 1;
      continue;
    }
    if (ch === "}") {
      if (cursor + 1 < limit && text[cursor + 1] === "}") { cursor += 2; continue; }
      return {error: "unmatched Fmt close brace", offset: cursor, expressions};
    }
    cursor++;
  }
  return {error: "unterminated Fmt literal", offset: quoteOffset, delimiterWidth, expressions};
}

// Cheng-aware lexical projection used by the capability gate below. Literal
// payloads and comments are removed, but executable {expr} spans inside Fmt
// literals are recursively projected back into code at their original offsets.
function lexChengSource(text, includeFmtExpressions = true) {
  const code = Array.from(text, (ch) => ch === "\n" ? "\n" : " ");
  const strings = [];
  const fmtInterpolations = [];
  const errors = [];
  const lineAt = sourceLineLocator(text);
  let index = 0;
  while (index < text.length) {
    const ch = text[index];
    if (ch === "#" || (ch === "/" && text[index + 1] === "/")) {
      while (index < text.length && text[index] !== "\n") index++;
      continue;
    }
    if (ch === "/" && text[index + 1] === "*") {
      const close = text.indexOf("*/", index + 2);
      if (close < 0) {
        errors.push({kind: "comment", line: lineAt(index), offset: index, reason: "unterminated block comment"});
        break;
      }
      index = close + 2;
      continue;
    }
    if (ch === '"' && isFmtQuote(text, index)) {
      const parsed = parseFmtLiteral(text, index);
      const literalEnd = parsed.end || text.length;
      const delimiterWidth = parsed.delimiterWidth || (text.slice(index, index + 3) === '"""' ? 3 : 1);
      strings.push(text.slice(index + delimiterWidth, Math.max(index + delimiterWidth, literalEnd - delimiterWidth)));
      for (const expression of parsed.expressions) {
        const expressionText = text.slice(expression.start, expression.end);
        const expressionLine = lineAt(expression.start);
        fmtInterpolations.push({line: expressionLine, start: expression.start, end: expression.end, sha256: sha256(Buffer.from(expressionText, "utf8"))});
        if (includeFmtExpressions) {
          const nested = lexChengSource(expressionText, true);
          strings.push(...nested.strings);
          for (const child of nested.fmtInterpolations) fmtInterpolations.push({...child, line: expressionLine + child.line - 1, start: expression.start + child.start, end: expression.start + child.end});
          for (const error of nested.errors) errors.push({...error, line: expressionLine + error.line - 1, offset: expression.start + error.offset});
          for (let inner = 0; inner < nested.code.length; inner++) {
            if (nested.code[inner] !== " ") code[expression.start + inner] = nested.code[inner];
          }
        }
      }
      if (parsed.error) errors.push({kind: "fmt", line: lineAt(parsed.offset), offset: parsed.offset, reason: parsed.error});
      index = literalEnd;
      continue;
    }
    if (ch === '"') {
      const width = text.slice(index, index + 3) === '"""' ? 3 : 1;
      const start = index + width;
      index += width;
      let value = "";
      while (index < text.length) {
        if (width === 3 && text.slice(index, index + 3) === '"""') { index += 3; break; }
        if (width === 1 && text[index] === '"') { index++; break; }
        if (width === 1 && text[index] === "\\" && index + 1 < text.length) {
          value += text[index] + text[index + 1];
          index += 2;
          continue;
        }
        value += text[index++];
      }
      strings.push(value);
      continue;
    }
    if (ch === "'") {
      const quoted = quotedLiteralEnd(text, index, text.length);
      index = quoted.end || text.length;
      continue;
    }
    code[index] = ch;
    index++;
  }
  return {code: code.join(""), strings, fmtInterpolations, errors};
}

function chengFunctions(text) {
  const codeLines = lexChengSource(text, false).code.split("\n");
  const rawLines = text.split("\n");
  const out = new Map();
  const topLevelDeclaration = /^(?:fn|iterator|type|let|var|const|macro|template|concept|trait|import|module|when)\b/;
  for (let lineIndex = 0; lineIndex < codeLines.length; lineIndex++) {
    const match = codeLines[lineIndex].match(/^fn\s+(?:([A-Za-z_][A-Za-z0-9_]*)|`([^`\r\n]+)`)\s*(?:\[|\()/);
    if (!match) continue;
    const operatorSymbol = match[2] || null;
    const functionName = match[1] || `\`${operatorSymbol}\``;
    let end = lineIndex + 1;
    while (end < codeLines.length) {
      const line = codeLines[end];
      // A multiline Cheng signature closes with a top-level `) =`.  Only a
      // real declaration starts the next function boundary; column zero by
      // itself is not a boundary.
      if (topLevelDeclaration.test(line)) break;
      end++;
    }
    const raw = rawLines.slice(lineIndex, end).join("\n");
    const lexical = lexChengSource(raw);
    const calls = new Set();
    const members = new Set();
    const identifiers = new Set();
    const firstLineEnd = lexical.code.indexOf("\n");
    for (const found of lexical.code.matchAll(/\b([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)) {
      if (found[1] === functionName && found.index < (firstLineEnd < 0 ? lexical.code.length : firstLineEnd)) continue;
      calls.add(found[1]);
    }
    for (const found of lexical.code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g)) members.add(`${found[1]}.${found[2]}`);
    for (const found of lexical.code.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) identifiers.add(found[0]);
    const fmtInterpolations = lexical.fmtInterpolations.map((entry) => ({...entry, line: lineIndex + entry.line}));
    const lexicalErrors = lexical.errors.map((entry) => ({...entry, line: lineIndex + entry.line}));
    const existing = out.get(functionName);
    if (existing) {
      existing.raw += `\n${raw}`;
      existing.code += `\n${lexical.code}`;
      existing.strings.push(...lexical.strings);
      existing.fmtInterpolations.push(...fmtInterpolations);
      existing.lexicalErrors.push(...lexicalErrors);
      existing.declarationCount++;
      existing.declarationLines.push(lineIndex + 1);
      for (const call of calls) existing.calls.add(call);
      for (const member of members) existing.members.add(member);
      for (const identifier of identifiers) existing.identifiers.add(identifier);
    } else {
      out.set(functionName, {name: functionName, operatorSymbol, declarationCount: 1, declarationLines: [lineIndex + 1], line: lineIndex + 1, raw, code: lexical.code, strings: lexical.strings, fmtInterpolations, lexicalErrors, calls, members, identifiers});
    }
    lineIndex = end - 1;
  }
  return out;
}

// Token projection for post-seal invariants. Unlike regexes over raw source it
// keeps literal tokens as typed values and drops comments/character payloads,
// so a diagnostic name in prose cannot manufacture a semantic hit.
function tokenizeChengFunction(text) {
  const tokens = [];
  const lineAt = sourceLineLocator(text);
  let index = 0;
  let line = 1;
  const push = (kind, value, startLine = line) => tokens.push({kind, value, line: startLine});
  while (index < text.length) {
    const ch = text[index];
    if (ch === "\n") { line++; index++; continue; }
    if (/\s/.test(ch)) { index++; continue; }
    if (ch === "#" || (ch === "/" && text[index + 1] === "/")) {
      while (index < text.length && text[index] !== "\n") index++;
      continue;
    }
    if (ch === "/" && text[index + 1] === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        if (text[index] === "\n") line++;
        index++;
      }
      if (index < text.length) index += 2;
      continue;
    }
    if (ch === '"' && isFmtQuote(text, index)) {
      const startLine = line;
      const parsed = parseFmtLiteral(text, index);
      const literalEnd = parsed.end || text.length;
      const delimiterWidth = parsed.delimiterWidth || (text.slice(index, index + 3) === '"""' ? 3 : 1);
      push("fmt_string", text.slice(index + delimiterWidth, Math.max(index + delimiterWidth, literalEnd - delimiterWidth)), startLine);
      for (const expression of parsed.expressions) {
        const expressionLine = lineAt(expression.start);
        for (const token of tokenizeChengFunction(text.slice(expression.start, expression.end))) {
          tokens.push({...token, line: expressionLine + token.line - 1});
        }
      }
      for (let cursor = index; cursor < literalEnd; cursor++) if (text[cursor] === "\n") line++;
      index = literalEnd;
      continue;
    }
    if (ch === '"') {
      const startLine = line;
      const width = text.slice(index, index + 3) === '"""' ? 3 : 1;
      index += width;
      let value = "";
      while (index < text.length) {
        if (width === 3 && text.slice(index, index + 3) === '"""') { index += 3; break; }
        if (width === 1 && text[index] === '"') { index++; break; }
        if (width === 1 && text[index] === "\\" && index + 1 < text.length) {
          value += text[index] + text[index + 1];
          index += 2;
          continue;
        }
        if (text[index] === "\n") line++;
        value += text[index++];
      }
      push("string", value, startLine);
      continue;
    }
    if (ch === "'") {
      const startLine = line;
      index++;
      while (index < text.length) {
        if (text[index] === "\\" && index + 1 < text.length) { index += 2; continue; }
        if (text[index] === "'") { index++; break; }
        if (text[index] === "\n") line++;
        index++;
      }
      push("char", "", startLine);
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = index++;
      while (index < text.length && /[A-Za-z0-9_]/.test(text[index])) index++;
      push("identifier", text.slice(start, index));
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const start = index++;
      while (index < text.length && /[A-Za-z0-9_.]/.test(text[index])) index++;
      push("number", text.slice(start, index));
      continue;
    }
    const pair = text.slice(index, index + 2);
    if (["==", "!=", ">=", "<=", "&&", "||", "..<", "=>"].includes(pair)) {
      push("symbol", pair);
      index += 2;
      continue;
    }
    push("symbol", ch);
    index++;
  }
  return tokens;
}

function chengCallSites(tokens) {
  const calls = [];
  for (let start = 0; start < tokens.length; start++) {
    if (tokens[start].kind !== "identifier" || (start > 0 && (tokens[start - 1].value === "." || tokens[start - 1].value === "fn"))) continue;
    const parts = [tokens[start].value];
    let cursor = start + 1;
    while (cursor + 1 < tokens.length && tokens[cursor].value === "." && tokens[cursor + 1].kind === "identifier") {
      parts.push(tokens[cursor + 1].value);
      cursor += 2;
    }
    if (tokens[cursor]?.value !== "(") continue;
    const open = cursor;
    let depth = 0;
    let close = -1;
    for (; cursor < tokens.length; cursor++) {
      if (tokens[cursor].value === "(") depth++;
      else if (tokens[cursor].value === ")") {
        depth--;
        if (depth === 0) { close = cursor; break; }
      }
    }
    if (close < 0) continue;
    const args = [];
    let argStart = open + 1;
    let paren = 0;
    let bracket = 0;
    let brace = 0;
    for (let at = open + 1; at < close; at++) {
      const value = tokens[at].value;
      if (value === "(") paren++;
      else if (value === ")") paren--;
      else if (value === "[") bracket++;
      else if (value === "]") bracket--;
      else if (value === "{") brace++;
      else if (value === "}") brace--;
      else if (value === "," && paren === 0 && bracket === 0 && brace === 0) {
        args.push(tokens.slice(argStart, at));
        argStart = at + 1;
      }
    }
    if (argStart < close || args.length > 0) args.push(tokens.slice(argStart, close));
    calls.push({name: parts.join("."), leaf: parts[parts.length - 1], line: tokens[start].line, start, open, close, args});
  }
  return calls;
}

function chengMemberChains(tokens) {
  const chains = [];
  for (let start = 0; start < tokens.length; start++) {
    if (tokens[start].kind !== "identifier" || (start > 0 && tokens[start - 1].value === ".")) continue;
    const parts = [tokens[start].value];
    let cursor = start + 1;
    while (cursor + 1 < tokens.length && tokens[cursor].value === "." && tokens[cursor + 1].kind === "identifier") {
      parts.push(tokens[cursor + 1].value);
      cursor += 2;
    }
    if (parts.length > 1) chains.push({parts, text: parts.join("."), line: tokens[start].line, start, end: cursor});
  }
  return chains;
}

function tokenArgumentIsEmptyString(argument) {
  return argument.length === 1 && argument[0].kind === "string" && argument[0].value === "";
}

function tokenSliceHasIdentifier(tokens, name) {
  return tokens.some((token) => token.kind === "identifier" && token.value === name);
}

function tokenSliceHasMember(tokens, owner, field) {
  for (let index = 0; index + 2 < tokens.length; index++) {
    if (tokens[index].kind === "identifier" && tokens[index].value === owner &&
        tokens[index + 1].value === "." && tokens[index + 2].kind === "identifier" && tokens[index + 2].value === field) return true;
  }
  return false;
}

function tokenSequenceIndex(tokens, values, start = 0) {
  outer: for (let index = start; index + values.length <= tokens.length; index++) {
    for (let offset = 0; offset < values.length; offset++) {
      if (tokens[index + offset].value !== values[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

function tokenSequencePresent(tokens, values) {
  return tokenSequenceIndex(tokens, values) >= 0;
}

function callStringArgument(call, index) {
  const argument = call.args[index] || [];
  return argument.length === 1 && argument[0].kind === "string" ? argument[0].value : null;
}

function assignedAliasesForCallLeaf(tokens, calls, leaf) {
  const aliases = new Set();
  for (const call of calls) {
    if (call.leaf !== leaf || call.start < 2) continue;
    let equals = call.start - 1;
    if (tokens[equals]?.value !== "=") continue;
    const nameToken = tokens[equals - 1];
    const bindingToken = tokens[equals - 2];
    if (nameToken?.kind === "identifier" && (bindingToken?.value === "let" || bindingToken?.value === "var")) aliases.add(nameToken.value);
  }
  return aliases;
}

function chengTypeDeclarations(text) {
  const declarations = new Set();
  let inTypeBlock = false;
  const addVariantConstructors = (rhs) => {
    const first = rhs.match(/^\s*([A-Z][A-Za-z0-9_]*)\s*\(/);
    if (first) declarations.add(first[1]);
    for (const variant of rhs.matchAll(/\|\s*([A-Z][A-Za-z0-9_]*)\s*\(/g)) declarations.add(variant[1]);
  };
  for (const line of lexChengSource(text).code.split("\n")) {
    if (line === "type") { inTypeBlock = true; continue; }
    if (inTypeBlock && line.trim() !== "" && !/^\s/.test(line)) inTypeBlock = false;
    const inline = line.match(/^type\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (inline) { declarations.add(inline[1]); addVariantConstructors(inline[2]); }
    if (!inTypeBlock) continue;
    const match = line.match(/^\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) { declarations.add(match[1]); addVariantConstructors(match[2]); }
    const continuation = line.match(/^\s*\|\s*([A-Z][A-Za-z0-9_]*)\s*\(/);
    if (continuation) declarations.add(continuation[1]);
  }
  return declarations;
}

function authoritySourceText(raw, label) {
  const value = raw?.raw ?? raw;
  if (typeof value === "string") return value;
  try { return new TextDecoder("utf-8", {fatal: true}).decode(value); }
  catch (error) { throw new Error(`authority production source must be UTF-8: ${label}: ${error instanceof Error ? error.message : String(error)}`); }
}

function authorityImportBindings(text, file, moduleToFile) {
  const aliases = new Map();
  const unqualified = [];
  const imports = [];
  const bind = (moduleName, alias, line) => {
    const target = moduleToFile.get(moduleName);
    if (!target) throw new Error(`authority production import closure has unresolved module: ${file}:${line} -> ${moduleName}`);
    imports.push({moduleName, target, alias: alias || null, line});
    const defaultAlias = moduleName.slice(moduleName.lastIndexOf("/") + 1);
    const effectiveAlias = alias || defaultAlias;
    const prior = aliases.get(effectiveAlias);
    if (prior && prior !== target) throw new Error(`authority import alias is ambiguous: ${file}:${line}: ${effectiveAlias}`);
    aliases.set(effectiveAlias, target);
    if (!alias) unqualified.push(target);
  };
  for (const [lineIndex, rawLine] of text.split("\n").entries()) {
    const line = rawLine.split("#", 1)[0].trim();
    if (!line.startsWith("import ")) continue;
    const grouped = line.match(/^import ([A-Za-z_][A-Za-z0-9_./]*)\/\[([^\]]+)\]$/);
    if (grouped) {
      const members = grouped[2].split(",").map((value) => value.trim());
      if (members.length === 0 || members.some((value) => !/^[A-Za-z_][A-Za-z0-9_./]*$/.test(value))) throw new Error(`unsupported authority group import: ${file}:${lineIndex + 1}`);
      for (const member of members) bind(`${grouped[1]}/${member}`, null, lineIndex + 1);
      continue;
    }
    const match = line.match(/^import ([A-Za-z_][A-Za-z0-9_./]*)(?: as ([A-Za-z_][A-Za-z0-9_]*))?$/);
    if (!match) throw new Error(`unsupported authority import surface: ${file}:${lineIndex + 1}`);
    bind(match[1], match[2] || null, lineIndex + 1);
  }
  // std/system is the language's implicit unqualified prelude.  Treat it as a
  // direct lexical candidate source without inventing a manifest import edge.
  for (const preludeModule of ["std/system", "std/result"]) {
    const preludeTarget = moduleToFile.get(preludeModule);
    if (preludeTarget && preludeTarget !== file) unqualified.push(preludeTarget);
  }
  return {aliases, unqualified: [...new Set(unqualified)], imports};
}

function validateAuthorityProductionClosure(sourceRows, strictFileSet = true, rootFiles = AUTHORITY_MINIMUM_REQUIRED_FILES) {
  const sources = sourceRows instanceof Map ? new Map(sourceRows) : new Map(Object.entries(sourceRows || {}));
  const actualFiles = [...sources.keys()].sort();
  const minimumFiles = [...AUTHORITY_MINIMUM_REQUIRED_FILES].sort();
  const exactRootFiles = [...new Set(rootFiles || [])].sort();
  if (exactRootFiles.some((file) => typeof file !== "string" || !/^src\/[A-Za-z0-9_/]+\.cheng$/.test(file))) throw new Error("authority production roots must be canonical Cheng source paths");
  if (!exactRootFiles.includes(BACKEND2_PIPELINE_AUTHORITY_ROOT)) throw new Error(`authority production roots must include ${BACKEND2_PIPELINE_AUTHORITY_ROOT}`);
  const missingMinimumFiles = minimumFiles.filter((file) => !sources.has(file));
  if (strictFileSet && missingMinimumFiles.length > 0) throw new Error(`authority production source manifest is missing minimum-required files: ${missingMinimumFiles.join(",")}`);
  const moduleToFile = new Map();
  for (const file of actualFiles) {
    if (!/^src\/[A-Za-z0-9_/]+\.cheng$/.test(file)) throw new Error(`invalid authority production path: ${file}`);
    const moduleName = file.slice("src/".length, -".cheng".length);
    moduleToFile.set(moduleName, file);
    moduleToFile.set(`cheng/${moduleName}`, file);
  }
  const sourceTexts = new Map(actualFiles.map((file) => [file, authoritySourceText(sources.get(file), file)]));
  const importBindings = new Map(actualFiles.map((file) => [file, authorityImportBindings(sourceTexts.get(file), file, moduleToFile)]));
  if (strictFileSet) {
    const reachableFiles = new Set();
    const queue = [...exactRootFiles];
    while (queue.length > 0) {
      const file = queue.shift();
      if (reachableFiles.has(file)) continue;
      if (!sources.has(file)) throw new Error(`authority production import closure is missing source: ${file}`);
      reachableFiles.add(file);
      for (const imported of importBindings.get(file).imports) queue.push(imported.target);
    }
    const extras = actualFiles.filter((file) => !reachableFiles.has(file));
    const missing = [...reachableFiles].filter((file) => !sources.has(file));
    if (extras.length > 0 || missing.length > 0) throw new Error(`authority production import closure mismatch: unexpected=${extras.join(",")} missing=${missing.join(",")}`);
  }
  const files = new Map();
  const nodes = new Map();
  const keyFor = (file, name) => `${file}#${name}`;
  for (const file of actualFiles) {
    const text = sourceTexts.get(file);
    const functions = chengFunctions(text);
    const typeDeclarations = chengTypeDeclarations(text);
    const {aliases, unqualified} = importBindings.get(file);
    files.set(file, {file, text, functions, typeDeclarations, aliases, unqualified, sha256: sha256(Buffer.from(text, "utf8"))});
    for (const [name, fn] of functions) {
      const tokens = tokenizeChengFunction(fn.raw);
      nodes.set(keyFor(file, name), {file, name, fn, tokens, callSites: chengCallSites(tokens), memberChains: chengMemberChains(tokens), edges: new Set(), sinks: [], unresolvedImportedCalls: [], unresolvedUnqualifiedCalls: [], exactTypeConstructorCalls: []});
    }
  }
  for (const node of nodes.values()) {
    const fileData = files.get(node.file);
    for (const call of node.fn.calls) {
      const leaf = call.slice(call.lastIndexOf(".") + 1);
      if (call === "os.ReadFile" || leaf === "ReadTextFile" || leaf === "TypedExprScanSourceFunctionReturnType") node.sinks.push(call);
      let targetKey = null;
      const dot = call.indexOf(".");
      if (dot > 0) {
        const targetFile = fileData.aliases.get(call.slice(0, dot));
        const targetName = call.slice(dot + 1);
        if (targetFile && nodes.has(keyFor(targetFile, targetName))) targetKey = keyFor(targetFile, targetName);
        else if (targetFile && /^[A-Z]/.test(targetName) && !files.get(targetFile).typeDeclarations.has(targetName)) node.unresolvedImportedCalls.push(call);
      } else {
        const visibleFiles = [node.file, ...fileData.unqualified];
        const candidates = [...new Set(visibleFiles.map((file) => keyFor(file, call)).filter((key) => nodes.has(key)))];
        if (/^[A-Z]/.test(call)) {
          const constructorFiles = [...new Set(visibleFiles.filter((file) => files.get(file).typeDeclarations.has(call)))];
          if (candidates.length === 1) targetKey = candidates[0];
          else if (candidates.length === 0 && constructorFiles.length === 1) node.exactTypeConstructorCalls.push(`${call}:${constructorFiles[0]}`);
          else node.unresolvedUnqualifiedCalls.push(`${call}:function_candidates=${candidates.length}:type_constructor_candidates=${constructorFiles.length}`);
        } else if (candidates.length === 1) targetKey = candidates[0];
        else if (candidates.length > 1) for (const candidate of candidates) node.edges.add(candidate);
      }
      if (targetKey) node.edges.add(targetKey);
    }
  }

  const frozenMetadataSelfAuditSpecs = FROZEN_METADATA_SELF_AUDIT_NAMES.map((name) => [TYPED_EXPR_SOURCE_RELATIVE, name]);
  const realizerAuthorityAnchorSpecs = REALIZER_AUTHORITY_API_NAMES.map((name) => [TYPED_EXPR_SOURCE_RELATIVE, name]);
  const authorityAnchorSpecs = [...frozenMetadataSelfAuditSpecs, ...realizerAuthorityAnchorSpecs];
  const pipelineEntrySelectors = [
    {kind: "lowering_pipeline", file: "src/core/backend/lowering_plan.cheng", pattern: /^BuildLoweringPlanStub(?:FromCompilerCsg(?:Borrowed(?:WithSnapshot)?)?)?$/},
    {kind: "primary_realizer", file: "src/core/backend/primary_object_plan.cheng", pattern: /^BuildPrimaryObjectPlan(?:WithExactFunction)?(?:Into)?$/},
    {kind: "backend2_realizer", file: "src/core/backend2/backend2_pipeline.cheng", pattern: /^Backend2BuildPrimaryObjectPlanInto$/},
  ];
  const issues = [];
  const operatorFunctionDeclarations = [...nodes.values()].filter((node) => node.fn.operatorSymbol !== null).map((node) => ({
    key: keyFor(node.file, node.name),
    symbol: node.fn.operatorSymbol,
    declarationCount: node.fn.declarationCount,
    lines: [...node.fn.declarationLines],
    functionSha256: sha256(Buffer.from(node.fn.raw, "utf8")),
  })).sort((left, right) => left.key.localeCompare(right.key));
  const fmtInterpolationExpressions = [...nodes.values()].flatMap((node) => node.fn.fmtInterpolations.map((entry) => ({
    key: keyFor(node.file, node.name),
    line: entry.line,
    expressionSha256: entry.sha256,
  }))).sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line || left.expressionSha256.localeCompare(right.expressionSha256));
  const fmtInterpolationErrors = [...nodes.values()].flatMap((node) => node.fn.lexicalErrors.filter((entry) => entry.kind === "fmt").map((entry) => ({
    key: keyFor(node.file, node.name),
    line: entry.line,
    reason: entry.reason,
  }))).sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line || left.reason.localeCompare(right.reason));
  if (fmtInterpolationErrors.length > 0) issues.push("authority_fmt_interpolation_malformed");
  const analysisCompleteness = {
    status: fmtInterpolationErrors.length > 0 ? "RED" : "COMPLETE_FOR_SOURCE_WIDE_GATES",
    syntacticDirectCallTokenization: "COMPLETE",
    resolvedCallGraphAuthority: "SOURCE_LEXER_INSUFFICIENT",
    sourceWidePostSealInvariantScan: fmtInterpolationErrors.length > 0 ? "MALFORMED" : "COMPLETE",
    reachabilityClaims: "BOUNDED_SYNTACTIC_MODEL_ONLY",
    fmtInterpolationCallsAndPostSealTokens: fmtInterpolationErrors.length > 0 ? "MALFORMED" : "COMPLETE",
    operatorCallEdges: operatorFunctionDeclarations.length > 0 ? "CONSERVATIVE_COMPLETE" : "NOT_PRESENT",
    reason: fmtInterpolationErrors.length > 0
      ? "malformed Fmt interpolation prevents complete source analysis"
      : operatorFunctionDeclarations.length > 0
        ? "source-wide gates include every backtick operator body and a conservative forbidden-reachability upper bound; semantic call resolution remains unproved"
        : "source-wide function bodies and executable Fmt interpolations are tokenized; semantic call resolution remains unproved",
    longTermAuthority: "consume a compiler-produced structured function/call manifest bound to the exact source CID; Fusion should verify that manifest instead of reimplementing Cheng syntax",
    operatorFunctionDeclarations,
    fmtInterpolationExpressionCount: fmtInterpolationExpressions.length,
    fmtInterpolationErrors,
  };
  const pipelineEntries = [];
  for (const selector of pipelineEntrySelectors) {
    const matches = [...nodes.values()].filter((node) => node.file === selector.file && selector.pattern.test(node.name)).map((node) => keyFor(node.file, node.name)).sort();
    if (strictFileSet && matches.length === 0) issues.push(`authority_pipeline_entry_missing_${selector.kind}`);
    for (const key of matches) pipelineEntries.push({kind: selector.kind, key});
  }
  const authorityAnchors = [];
  for (const [file, name] of authorityAnchorSpecs) {
    const key = keyFor(file, name);
    if (nodes.has(key)) authorityAnchors.push(key);
    else if (strictFileSet) issues.push(`authority_anchor_missing_${file}#${name}`);
  }
  const frozenMetadataSelfAuditAnchors = frozenMetadataSelfAuditSpecs.map(([file, name]) => keyFor(file, name)).filter((key) => nodes.has(key));
  const realizerAuthorityAnchors = realizerAuthorityAnchorSpecs.map(([file, name]) => keyFor(file, name)).filter((key) => nodes.has(key));
  const reverseEdges = new Map([...nodes.keys()].map((key) => [key, new Set()]));
  for (const [from, node] of nodes) for (const to of node.edges) reverseEdges.get(to).add(from);
  const reverseClosureFrom = (anchor) => {
    const closure = new Set([anchor]);
    const queue = [anchor];
    while (queue.length > 0) {
      const key = queue.shift();
      for (const prior of reverseEdges.get(key) || []) {
        if (closure.has(prior)) continue;
        closure.add(prior);
        queue.push(prior);
      }
    }
    return closure;
  };
  const reverseByAnchor = new Map(authorityAnchors.map((anchor) => [anchor, reverseClosureFrom(anchor)]));
  const reverseAuthorityClosure = new Set(authorityAnchors);
  for (const closure of reverseByAnchor.values()) for (const key of closure) reverseAuthorityClosure.add(key);
  const entryAnchorReachability = pipelineEntries.map((entry) => ({entry, reachableAnchors: realizerAuthorityAnchors.filter((anchor) => reverseByAnchor.get(anchor).has(entry.key))}));
  const requiredAnchorsByEntryKind = {
    lowering_pipeline: [...realizerAuthorityAnchors],
    primary_realizer: [...realizerAuthorityAnchors],
    backend2_realizer: [...realizerAuthorityAnchors],
  };
  const disconnectedEntries = [];
  for (const row of entryAnchorReachability) {
    for (const requiredAnchor of requiredAnchorsByEntryKind[row.entry.kind] || []) {
      if (row.reachableAnchors.includes(requiredAnchor)) continue;
      disconnectedEntries.push({entry: row.entry, requiredAnchor});
      issues.push(`authority_entry_disconnected_${row.entry.kind}:${row.entry.key}->${requiredAnchor}`);
    }
  }
  const derivedRootKeys = [...authorityAnchors].sort();
  const forbiddenReachability = [];
  const unresolvedImportedReachability = [];
  const unresolvedUnqualifiedReachability = [];
  const forwardReachable = new Set();
  const entryForwardReachable = new Set();
  const reconstruct = (parents, key) => {
    const path = [];
    let cursor = key;
    while (cursor) { path.push(cursor); cursor = parents.get(cursor) || null; }
    return path.reverse();
  };
  const conservativeOperatorRootKeys = operatorFunctionDeclarations.map((entry) => entry.key);
  const queue = [...derivedRootKeys, ...conservativeOperatorRootKeys];
  const parents = new Map(queue.map((key) => [key, null]));
  while (queue.length > 0) {
    const key = queue.shift();
    const node = nodes.get(key);
    forwardReachable.add(key);
    for (const sink of node.sinks) forbiddenReachability.push([...reconstruct(parents, key), `sink:${sink}`].join(" -> "));
    for (const call of node.unresolvedImportedCalls) unresolvedImportedReachability.push([...reconstruct(parents, key), `unresolved-import:${call}`].join(" -> "));
    for (const call of node.unresolvedUnqualifiedCalls) unresolvedUnqualifiedReachability.push([...reconstruct(parents, key), `unresolved-unqualified:${call}`].join(" -> "));
    for (const edge of node.edges) {
      if (parents.has(edge)) continue;
      parents.set(edge, key);
      queue.push(edge);
    }
  }
  const entryQueue = [...pipelineEntries.map((entry) => entry.key), ...conservativeOperatorRootKeys];
  const entryParents = new Map(entryQueue.map((key) => [key, null]));
  while (entryQueue.length > 0) {
    const key = entryQueue.shift();
    if (entryForwardReachable.has(key)) continue;
    entryForwardReachable.add(key);
    for (const edge of nodes.get(key).edges) {
      if (!entryParents.has(edge)) entryParents.set(edge, key);
      if (!entryForwardReachable.has(edge)) entryQueue.push(edge);
    }
  }
  const entryForwardForbiddenReachability = [];
  const entryForwardUnresolvedReachability = [];
  const entryForwardUnqualifiedReachability = [];
  const legalSourceIoBindings = [];
  const entryForwardSinkNodes = [...entryForwardReachable].filter((key) => nodes.get(key).sinks.length > 0).sort().map((key) => {
    const functionSha256 = sha256(Buffer.from(nodes.get(key).fn.raw, "utf8"));
    const allowedSha256 = PIPELINE_ENTRY_LEGAL_SOURCE_IO_FUNCTION_SHA256[key] || null;
    const exactHashBoundLegalSourceIo = allowedSha256 !== null && allowedSha256 === functionSha256;
    if (exactHashBoundLegalSourceIo) legalSourceIoBindings.push({key, functionSha256});
    else for (const sink of nodes.get(key).sinks) entryForwardForbiddenReachability.push([...reconstruct(entryParents, key), `sink:${sink}`].join(" -> "));
    return {key, sinks: [...nodes.get(key).sinks].sort(), functionSha256, allowedSha256, exactHashBoundLegalSourceIo};
  });
  const entryForwardUnresolvedNodes = [...entryForwardReachable].filter((key) => nodes.get(key).unresolvedImportedCalls.length > 0).sort().map((key) => ({key, calls: [...nodes.get(key).unresolvedImportedCalls].sort(), functionSha256: sha256(Buffer.from(nodes.get(key).fn.raw, "utf8"))}));
  for (const row of entryForwardUnresolvedNodes) for (const call of row.calls) entryForwardUnresolvedReachability.push([...reconstruct(entryParents, row.key), `unresolved-import:${call}`].join(" -> "));
  const entryForwardUnqualifiedNodes = [...entryForwardReachable].filter((key) => nodes.get(key).unresolvedUnqualifiedCalls.length > 0).sort().map((key) => ({key, calls: [...nodes.get(key).unresolvedUnqualifiedCalls].sort(), functionSha256: sha256(Buffer.from(nodes.get(key).fn.raw, "utf8"))}));
  for (const row of entryForwardUnqualifiedNodes) for (const call of row.calls) entryForwardUnqualifiedReachability.push([...reconstruct(entryParents, row.key), `unresolved-unqualified:${call}`].join(" -> "));

  const forbiddenFunctions = [
    ["src/core/backend/lowering_plan.cheng", "LoweringC5FieldTypeFromSourceText", "lowering_source_text_field_type_fallback_present"],
    ["src/core/backend/lowering_plan.cheng", "LoweringFunctionDeclLine", "lowering_function_decl_line_scanner_present"],
    ["src/core/backend/lowering_plan.cheng", "LoweringFunctionDeclHeaderText", "lowering_function_decl_header_scanner_present"],
    ["src/core/backend/lowering_plan.cheng", "LoweringFunctionDeclMatches", "lowering_function_decl_match_scanner_present"],
  ];
  for (const [file, name, issue] of forbiddenFunctions) if (nodes.has(keyFor(file, name))) issues.push(issue);
  const legacyScannerExistence = [...nodes.values()].flatMap((node) => {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file)) return [];
    const rule = POST_SEAL_LEGACY_SCANNER_NAME_RULES.find((candidate) => candidate.pattern.test(node.name));
    if (!rule) return [];
    return [{
      key: keyFor(node.file, node.name),
      family: rule.family,
      line: node.fn.line,
      functionSha256: sha256(Buffer.from(node.fn.raw, "utf8")),
    }];
  }).sort((left, right) => left.key.localeCompare(right.key));
  if (legacyScannerExistence.length > 0) issues.push("post_seal_legacy_scanner_function_present");
  const legacyReexportScannerExistence = [...nodes.values()].flatMap((node) => {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file)) return [];
    const rule = POST_SEAL_REEXPORT_NAME_RULES.find((candidate) => candidate.pattern.test(node.name));
    const family = rule?.family || (POST_SEAL_REEXPORT_DEPTH_WALKER_NAMES.has(node.name) ? "depth_limited_reexport_walker" : null);
    if (!family) return [];
    return [{
      key: keyFor(node.file, node.name),
      family,
      line: node.fn.line,
      functionSha256: sha256(Buffer.from(node.fn.raw, "utf8")),
      formalModuleVisibilityBinding: CURRENT_FORMAL_PROFILE_SCHEMA,
    }];
  }).sort((left, right) => left.key.localeCompare(right.key));
  if (legacyReexportScannerExistence.length > 0) issues.push("post_seal_invalid_import_reexport_scanner_present");
  const exactPostSealForbiddenExistence = [...nodes.values()].flatMap((node) => {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file)) return [];
    const family = POST_SEAL_FORBIDDEN_EXACT_FUNCTIONS.get(node.name);
    if (!family) return [];
    return [{key: keyFor(node.file, node.name), family, line: node.fn.line, functionSha256: sha256(Buffer.from(node.fn.raw, "utf8"))}];
  }).sort((left, right) => left.key.localeCompare(right.key));
  const exactPostSealForbiddenReachability = exactPostSealForbiddenExistence.flatMap((entry) => {
    if (!entryForwardReachable.has(entry.key)) return [];
    return [{...entry, path: reconstruct(entryParents, entry.key).join(" -> ")}];
  });
  if (exactPostSealForbiddenExistence.length > 0) issues.push("post_seal_exact_source_recovery_function_present");
  if (exactPostSealForbiddenReachability.length > 0) issues.push("post_seal_exact_source_recovery_function_reachable");

  const postSealRawBuildIndexMetadataCalls = [];
  for (const node of nodes.values()) {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file)) continue;
    for (const api of POST_SEAL_SOURCE_METADATA_INDEX_APIS) {
      const callPattern = new RegExp(`(?:\\b[A-Za-z_][A-Za-z0-9_]*\\.)?${api}\\s*\\(\\s*([A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*)\\.buildIndex\\b`, "g");
      for (const match of node.fn.code.matchAll(callPattern)) {
        postSealRawBuildIndexMetadataCalls.push({key: keyFor(node.file, node.name), api, receiver: match[1], line: node.fn.line, reachable: entryForwardReachable.has(keyFor(node.file, node.name))});
      }
    }
  }
  postSealRawBuildIndexMetadataCalls.sort((left, right) => left.key.localeCompare(right.key) || left.api.localeCompare(right.api));
  if (postSealRawBuildIndexMetadataCalls.length > 0) issues.push("post_seal_raw_ir_build_index_passed_to_source_metadata_api");

  const postSealRawBuildIndexReads = [];
  for (const node of nodes.values()) {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file)) continue;
    const buildIndexMemberPattern = /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\.buildIndex(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\b/g;
    for (const match of node.fn.code.matchAll(buildIndexMemberPattern)) {
      const parts = match[1].split(".");
      const buildIndexOffset = parts.indexOf("buildIndex");
      const relativeLine = node.fn.code.slice(0, match.index).split("\n").length;
      postSealRawBuildIndexReads.push({
        key: keyFor(node.file, node.name),
        line: node.fn.line + relativeLine - 1,
        chain: match[1],
        internalFieldChain: parts.slice(buildIndexOffset + 1),
        reachable: entryForwardReachable.has(keyFor(node.file, node.name)),
      });
    }
  }
  postSealRawBuildIndexReads.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line || left.chain.localeCompare(right.chain));
  if (postSealRawBuildIndexReads.length > 0) issues.push("post_seal_backend_direct_build_index_read_present");

  const postSealNamedFieldMetadataDirectCalls = [];
  const postSealOwnerlessMetadataCalls = [];
  const postSealOwnerLeafMetadataFallbacks = [];
  for (const node of nodes.values()) {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file)) continue;
    const key = keyFor(node.file, node.name);
    const leafAliases = assignedAliasesForCallLeaf(node.tokens, node.callSites, "TypedExprTypeLeafName");
    for (const call of node.callSites) {
      if (call.leaf === POST_SEAL_NAMED_FIELD_METADATA_DIRECT_API) {
        postSealNamedFieldMetadataDirectCalls.push({key, api: call.name, line: node.fn.line + call.line - 1, reachable: entryForwardReachable.has(key)});
      }
      if (POST_SEAL_OWNER_LEAF_METADATA_CALLS.has(call.leaf) && tokenArgumentIsEmptyString(call.args[1] || [])) {
        postSealOwnerlessMetadataCalls.push({key, api: call.name, line: node.fn.line + call.line - 1, sourceArgument: "empty_string", reachable: entryForwardReachable.has(key)});
      }
      if (!POST_SEAL_OWNER_LEAF_METADATA_CALLS.has(call.leaf)) continue;
      const ownerArguments = call.args.slice(1);
      const alias = [...leafAliases].find((name) => ownerArguments.some((argument) => tokenSliceHasIdentifier(argument, name)));
      const nestedLeaf = ownerArguments.some((argument) => tokenSliceHasIdentifier(argument, "TypedExprTypeLeafName"));
      if (!alias && !nestedLeaf) continue;
      postSealOwnerLeafMetadataFallbacks.push({key, api: call.name, line: node.fn.line + call.line - 1, ownerLeafBinding: alias || "direct_nested_call", reachable: entryForwardReachable.has(key)});
    }
  }
  postSealNamedFieldMetadataDirectCalls.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line);
  postSealOwnerlessMetadataCalls.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line);
  postSealOwnerLeafMetadataFallbacks.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line);
  if (postSealNamedFieldMetadataDirectCalls.length > 0) issues.push("post_seal_named_field_metadata_bypasses_canonical_api");
  if (postSealOwnerlessMetadataCalls.length > 0) issues.push("post_seal_ownerless_field_or_layout_metadata_lookup_present");
  if (postSealOwnerLeafMetadataFallbacks.length > 0) issues.push("post_seal_owner_leaf_field_or_layout_retry_present");

  const postSealColdCsgFieldLayoutFallbacks = [...nodes.values()].flatMap((node) => {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file)) return [];
    const family = POST_SEAL_COLD_CSG_FIELD_LAYOUT_FUNCTIONS.get(node.name);
    if (!family) return [];
    return [{
      key: keyFor(node.file, node.name),
      family,
      line: node.fn.line,
      functionSha256: sha256(Buffer.from(node.fn.raw, "utf8")),
      reachable: entryForwardReachable.has(keyFor(node.file, node.name)),
    }];
  }).sort((left, right) => left.key.localeCompare(right.key));
  if (postSealColdCsgFieldLayoutFallbacks.length > 0) issues.push("post_seal_cold_csg_field_or_layout_fallback_present");

  const typedExprOwnerRequiredIndexContractViolations = [];
  for (const contract of TYPED_EXPR_OWNER_REQUIRED_INDEX_CONTRACTS) {
    const key = keyFor(TYPED_EXPR_SOURCE_RELATIVE, contract.functionName);
    const node = nodes.get(key);
    if (!node) continue;
    const reasons = [];
    const globalCalls = node.callSites.filter((call) => call.leaf === "TypedExprBuildIndexLookup" && callStringArgument(call, 1) === contract.forbiddenGlobalIndexKind);
    if (globalCalls.length > 0) reasons.push(`forbidden_global_index:${contract.forbiddenGlobalIndexKind}`);
    const emptyOwnerGuard = tokenSequencePresent(node.tokens, ["if", contract.ownerParameter, "==", "", ":", "return", "-", "1"]) ||
      (globalCalls.length === 0 && tokenSequencePresent(node.tokens, ["if", contract.ownerParameter, "!=", "", ":"]) && tokenSequencePresent(node.tokens, ["return", "-", "1"]));
    if (!emptyOwnerGuard) reasons.push("owner_missing_not_hard_failed");
    const sourceIndexCalls = node.callSites.filter((call) => call.leaf === "TypedExprBuildIndexLookup" && callStringArgument(call, 1) === contract.sourceIndexKind);
    if (sourceIndexCalls.length === 0) reasons.push(`exact_source_index_missing:${contract.sourceIndexKind}`);
    if (!tokenSliceHasIdentifier(node.tokens, "TypedExprBuildIndexAmbiguous") || !tokenSequencePresent(node.tokens, ["return", "-", "2"])) reasons.push("ambiguous_not_hard_failed");
    if (!tokenSequencePresent(node.tokens, ["return", "-", "1"])) reasons.push("missing_not_hard_failed");
    if (reasons.length > 0) typedExprOwnerRequiredIndexContractViolations.push({key, line: node.fn.line, reasons, forbiddenGlobalCallLines: globalCalls.map((call) => node.fn.line + call.line - 1)});
  }
  typedExprOwnerRequiredIndexContractViolations.sort((left, right) => left.key.localeCompare(right.key));
  if (typedExprOwnerRequiredIndexContractViolations.length > 0) issues.push("typedexpr_field_or_layout_owner_contract_violation");

  const postSealAnySourceGlobalUniqueUses = [...nodes.values()].flatMap((node) => {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file)) return [];
    const identifiers = [...node.fn.identifiers].filter((name) => name.includes("AnySource") || name.includes("GlobalUnique")).sort();
    if (identifiers.length === 0) return [];
    return [{key: keyFor(node.file, node.name), line: node.fn.line, identifiers, reachable: entryForwardReachable.has(keyFor(node.file, node.name))}];
  }).sort((left, right) => left.key.localeCompare(right.key));
  if (postSealAnySourceGlobalUniqueUses.length > 0) issues.push("post_seal_any_source_or_global_unique_resolution_present");

  const postSealCalleeOwnerFallbacks = [];
  for (const node of nodes.values()) {
    if (!CALLEE_OWNER_FALLBACK_FUNCTIONS.has(node.name)) continue;
    const key = keyFor(node.file, node.name);
    let kind = null;
    let relativeLine = 1;
    if (node.name === "PrimaryBodyIrCallResultLayoutSourcePath") {
      const at = tokenSequenceIndex(node.tokens, ["return", "stmt", ".", "sourcePath"]);
      if (at >= 0) { kind = "call_result_owner_from_caller_statement"; relativeLine = node.tokens[at].line; }
    } else if (node.name === "PrimaryBodyIrTargetParamType") {
      const call = node.callSites.find((candidate) => candidate.leaf === "PrimaryObjectIrFunctionIndex" && tokenSliceHasMember(candidate.args[1] || [], "stmt", "sourcePath"));
      if (call) { kind = "callee_param_owner_from_caller_statement"; relativeLine = call.line; }
    } else if (node.name === "PrimaryBodyIrResolvedOrRegisteredWholeCallOrdinal") {
      const at = tokenSequenceIndex(node.tokens, ["lookupSourcePath", "=", "sourcePath"]);
      if (at >= 0) { kind = "registered_call_owner_from_caller_source"; relativeLine = node.tokens[at].line; }
    } else if (node.name === "PrimaryBodyIrAppendCallArgs") {
      const at = tokenSequenceIndex(node.tokens, ["layoutSourcePath", "=", "stmt", ".", "sourcePath"]);
      if (at >= 0) { kind = "callee_param_layout_owner_from_caller_statement"; relativeLine = node.tokens[at].line; }
    } else if (node.name === "PrimaryBodyIrAppendWholeCallExprToSlot" ||
               node.name === "PrimaryBodyIrAppendCallExprNodeToSlot") {
      const at = tokenSequenceIndex(node.tokens, ["resultSourcePath", "=", "stmt", ".", "sourcePath"]);
      if (at >= 0) { kind = "callee_result_layout_owner_from_caller_statement"; relativeLine = node.tokens[at].line; }
    } else if (node.name === "Backend2CalleeAbiViewsForFunction") {
      const at = tokenSequenceIndex(node.tokens, ["targetSourcePath", "=", "irFunction", ".", "sourcePath"]);
      if (at >= 0) { kind = "callee_abi_owner_from_caller_function"; relativeLine = node.tokens[at].line; }
    } else if (node.name === "LoweringBuildTypedFunctionReferenceIndex") {
      const at = tokenSequenceIndex(node.tokens, ["targetSourcePath", "=", "statementSourcePath"]);
      if (at >= 0) { kind = "frozen_statement_owner_from_statement_source"; relativeLine = node.tokens[at].line; }
    }
    if (kind) postSealCalleeOwnerFallbacks.push({key, family: kind, line: node.fn.line + relativeLine - 1, reachable: entryForwardReachable.has(key)});
  }
  postSealCalleeOwnerFallbacks.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line);
  if (postSealCalleeOwnerFallbacks.length > 0) issues.push("post_seal_callee_owner_substituted_from_caller_provenance");

  const postSealAbiUnknownWidthFallbacks = [...nodes.values()].flatMap((node) => {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file) || node.name !== ABI_WIDTH_AUTHORITY_FUNCTION) return [];
    const at = tokenSequenceIndex(node.tokens, ["abiSize", "=", "8"]);
    if (at < 0) return [];
    return [{key: keyFor(node.file, node.name), family: "invalid_or_missing_param_type_defaults_to_eight", line: node.fn.line + node.tokens[at].line - 1, reachable: entryForwardReachable.has(keyFor(node.file, node.name))}];
  }).sort((left, right) => left.key.localeCompare(right.key));
  if (postSealAbiUnknownWidthFallbacks.length > 0) issues.push("post_seal_unknown_callee_param_abi_width_defaults_to_eight");

  const postSealExactOwnerAmbiguityFallbacks = [];
  for (const node of nodes.values()) {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file) || !EXACT_OWNER_RESOLVER_FUNCTIONS.has(node.name)) continue;
    const key = keyFor(node.file, node.name);
    if (node.name === "PrimaryObjectIrFunctionIndexBucketMin") {
      for (const pattern of [["candidate", "<", "result"], ["candidate", "<", "best"]]) {
        const at = tokenSequenceIndex(node.tokens, pattern);
        if (at < 0) continue;
        postSealExactOwnerAmbiguityFallbacks.push({key, family: "minimum_candidate_wins", line: node.fn.line + node.tokens[at].line - 1, reachable: entryForwardReachable.has(key)});
        break;
      }
    } else {
      const at = tokenSequenceIndex(node.tokens, ["return", "i"]);
      if (at >= 0) postSealExactOwnerAmbiguityFallbacks.push({key, family: "first_linear_match_wins", line: node.fn.line + node.tokens[at].line - 1, reachable: entryForwardReachable.has(key)});
    }
  }
  postSealExactOwnerAmbiguityFallbacks.sort((left, right) => left.key.localeCompare(right.key) || left.family.localeCompare(right.family));
  if (postSealExactOwnerAmbiguityFallbacks.length > 0) issues.push("post_seal_exact_owner_resolver_does_not_require_unique_match");

  const parserOwningMergeBorrowContractViolations = [];
  const normalizedExprLayerAdd = nodes.get(keyFor("src/core/lang/parser.cheng", "NormalizedExprLayerAdd"));
  if (normalizedExprLayerAdd) {
    const destinationGuardAt = tokenSequenceIndex(normalizedExprLayerAdd.tokens,
      ["if", "total", ".", "valueExprTreeBorrowLease", ":", "panic"]);
    const sourceGuardAt = tokenSequenceIndex(normalizedExprLayerAdd.tokens,
      ["if", "delta", ".", "valueExprTreeBorrowLease", ":", "panic"]);
    const appendAt = normalizedExprLayerAdd.callSites.find((call) => call.leaf === "ParserValueExprTreeAppendFrom")?.start ?? -1;
    const releaseAt = normalizedExprLayerAdd.callSites.find((call) => call.leaf === "ParserValueExprTreeRelease")?.start ?? -1;
    const reasons = [];
    if (destinationGuardAt < 0) reasons.push("borrowed_destination_not_rejected");
    if (sourceGuardAt < 0) reasons.push("borrowed_source_not_rejected");
    if (appendAt < 0) reasons.push("owning_tree_append_missing");
    if (releaseAt < 0) reasons.push("owning_source_release_missing");
    if (appendAt >= 0 && destinationGuardAt >= appendAt) reasons.push("destination_guard_after_owning_append");
    if (appendAt >= 0 && sourceGuardAt >= appendAt) reasons.push("source_guard_after_owning_append");
    if (releaseAt >= 0 && sourceGuardAt >= releaseAt) reasons.push("source_guard_after_owner_release");
    if (reasons.length > 0) parserOwningMergeBorrowContractViolations.push({
      key: keyFor("src/core/lang/parser.cheng", "NormalizedExprLayerAdd"),
      line: normalizedExprLayerAdd.fn.line,
      reasons,
      reachable: entryForwardReachable.has(keyFor("src/core/lang/parser.cheng", "NormalizedExprLayerAdd")),
    });
  }
  if (parserOwningMergeBorrowContractViolations.length > 0) issues.push("parser_owning_merge_accepts_borrow_descriptor");

  const typedExprExactSourceRecoveryFunctions = [...nodes.values()].flatMap((node) => {
    if (node.file !== TYPED_EXPR_SOURCE_RELATIVE) return [];
    const family = TYPED_EXPR_EXACT_SOURCE_RECOVERY_FUNCTIONS.get(node.name);
    if (!family) return [];
    return [{key: keyFor(node.file, node.name), family, line: node.fn.line, functionSha256: sha256(Buffer.from(node.fn.raw, "utf8")), reachable: entryForwardReachable.has(keyFor(node.file, node.name))}];
  }).sort((left, right) => left.key.localeCompare(right.key));
  if (typedExprExactSourceRecoveryFunctions.length > 0) issues.push("typedexpr_exact_call_args_source_recovery_function_present");

  const typedExprExactSourceRecoveryCallers = [];
  for (const node of nodes.values()) {
    if (node.file !== TYPED_EXPR_SOURCE_RELATIVE) continue;
    for (const call of node.callSites) {
      const family = TYPED_EXPR_EXACT_SOURCE_RECOVERY_FUNCTIONS.get(call.leaf);
      if (!family) continue;
      typedExprExactSourceRecoveryCallers.push({key: keyFor(node.file, node.name), callee: call.leaf, family, line: node.fn.line + call.line - 1, reachable: entryForwardReachable.has(keyFor(node.file, node.name))});
    }
  }
  typedExprExactSourceRecoveryCallers.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line || left.callee.localeCompare(right.callee));
  if (typedExprExactSourceRecoveryCallers.length > 0) issues.push("typedexpr_semantic_call_chain_reaches_exact_call_args_source_recovery");

  const typedExprResultIntrinsicSourceRecovery = [];
  const resultBuilder = nodes.get(keyFor(TYPED_EXPR_SOURCE_RELATIVE, TYPED_EXPR_RESULT_INTRINSIC_BUILDER));
  if (resultBuilder) {
    const structuredAt = tokenSequenceIndex(resultBuilder.tokens, ["resultArgsText", "=", "expr", ".", "callArgsText"]);
    for (const call of resultBuilder.callSites) {
      const assignedTo = call.start >= 2 && resultBuilder.tokens[call.start - 1]?.value === "=" && resultBuilder.tokens[call.start - 2]?.kind === "identifier" ? resultBuilder.tokens[call.start - 2].value : null;
      const directLineRead = call.leaf === "TypedExprSourceLine" && assignedTo === "resultLineRaw";
      const argsRecovery = TYPED_EXPR_EXACT_SOURCE_RECOVERY_FUNCTIONS.has(call.leaf) && assignedTo === "resultArgsText";
      if (!directLineRead && !argsRecovery) continue;
      typedExprResultIntrinsicSourceRecovery.push({
        key: keyFor(resultBuilder.file, resultBuilder.name),
        callee: call.leaf,
        assignedTo,
        line: resultBuilder.fn.line + call.line - 1,
        structuredCallArgsAssignmentLine: structuredAt >= 0 ? resultBuilder.fn.line + resultBuilder.tokens[structuredAt].line - 1 : null,
        sourceRecoveryPrecedesStructuredCallArgs: structuredAt < 0 || call.start < structuredAt,
        reachable: entryForwardReachable.has(keyFor(resultBuilder.file, resultBuilder.name)),
      });
    }
  }
  typedExprResultIntrinsicSourceRecovery.sort((left, right) => left.line - right.line || left.callee.localeCompare(right.callee));
  if (typedExprResultIntrinsicSourceRecovery.length > 0) issues.push("typedexpr_result_intrinsic_uses_source_recovery_instead_of_structured_call_args_authority");

  const postSealFixedMetadataTextCaps = [];
  for (const node of nodes.values()) {
    if (!POST_SEAL_FIXED_METADATA_TEXT_FILES.has(node.file) || !POST_SEAL_FIXED_METADATA_TEXT_FUNCTIONS.has(node.name)) continue;
    for (const match of node.fn.code.matchAll(/\btext\.len\s*(?:>|>=)\s*([0-9]+)\b/g)) {
      const relativeLine = node.fn.code.slice(0, match.index).split("\n").length;
      postSealFixedMetadataTextCaps.push({key: keyFor(node.file, node.name), line: node.fn.line + relativeLine - 1, counter: "text.len", limit: Number(match[1]), kind: "semantic_type_or_layout_text_length", reachable: entryForwardReachable.has(keyFor(node.file, node.name))});
    }
  }
  postSealFixedMetadataTextCaps.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line);
  if (postSealFixedMetadataTextCaps.length > 0) issues.push("post_seal_fixed_metadata_type_or_layout_text_cap_present");

  const postSealDynamicSemanticWorklistCaps = [];
  for (const node of nodes.values()) {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file) || !POST_SEAL_DYNAMIC_WORKLIST_CAP_FUNCTIONS.has(node.name)) continue;
    for (const match of node.fn.code.matchAll(/\bwork\.len\s*>\s*typedIr\.nodes2_nodeIndexs\.len\s*\*\s*([0-9]+)\s*\+\s*([0-9]+)\b/g)) {
      const relativeLine = node.fn.code.slice(0, match.index).split("\n").length;
      postSealDynamicSemanticWorklistCaps.push({
        key: keyFor(node.file, node.name),
        line: node.fn.line + relativeLine - 1,
        counter: "work.len",
        authorityCardinality: "typedIr.nodes2_nodeIndexs.len",
        multiplier: Number(match[1]),
        additive: Number(match[2]),
        kind: "shared_dag_duplicate_enqueue_cap",
        reachable: entryForwardReachable.has(keyFor(node.file, node.name)),
      });
    }
  }
  postSealDynamicSemanticWorklistCaps.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line);
  if (postSealDynamicSemanticWorklistCaps.length > 0) issues.push("post_seal_dynamic_semantic_worklist_cap_present");

  const postSealProgramDerivedEncodingRejectCaps = [];
  const postSealProgramDerivedEncodingCapUnproven = [];
  const postSealProgramDerivedEncodingCapProofs = [];
  for (const node of nodes.values()) {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file)) continue;
    const rule = POST_SEAL_PROGRAM_DERIVED_ENCODING_REJECT_CAPS.get(node.name);
    if (!rule) continue;
    const capAt = tokenSequenceIndex(node.tokens, [rule.counter, rule.operator, String(rule.limit)]);
    if (capAt < 0) continue;
    const sinkSequence = rule.rejectSink === "return_minus_one" ? ["return", "-", "1"] :
      rule.rejectSink === "return_false" ? ["return", "false"] : ["return", "0"];
    const sinkAt = tokenSequenceIndex(node.tokens, sinkSequence, capAt + 3);
    const evidence = {
      key: keyFor(node.file, node.name),
      line: node.fn.line + node.tokens[capAt].line - 1,
      counter: rule.counter,
      operator: rule.operator,
      limit: rule.limit,
      family: rule.family,
      rejectSink: rule.rejectSink,
      rejectSinkLine: sinkAt >= 0 ? node.fn.line + node.tokens[sinkAt].line - 1 : null,
      reachable: entryForwardReachable.has(keyFor(node.file, node.name)),
    };
    if (sinkAt >= 0) postSealProgramDerivedEncodingRejectCaps.push({...evidence, proofStatus: "RED"});
    else {
      let proof = null;
      if (node.name === "PrimaryBodyIrIndexedScaleWordCount") {
        const fillNode = nodes.get(keyFor(node.file, "PrimaryBodyIRFillIndexedAggregateAddressToReg"));
        const predictorExact = tokenSequencePresent(node.tokens, ["if", "elemSize", "<=", "0", ":", "return", "0"]) &&
          tokenSequencePresent(node.tokens, ["if", "elemSize", "<=", String(rule.limit), ":", "return", "2"]) &&
          tokenSequencePresent(node.tokens, ["return", "3"]);
        const fillerExact = !!fillNode &&
          tokenSequencePresent(fillNode.tokens, ["if", "elemSize", ">", "0", ":"]) &&
          tokenSequencePresent(fillNode.tokens, ["if", "elemSize", ">", String(rule.limit), ":"]) &&
          tokenSequencePresent(fillNode.tokens, ["elemSize", "&", String(rule.limit)]) &&
          tokenSequencePresent(fillNode.tokens, ["elemSize", ">", ">", "16"]) &&
          tokenSliceHasIdentifier(fillNode.tokens, "A64EncMovz") &&
          tokenSliceHasIdentifier(fillNode.tokens, "A64EncMovk") &&
          tokenSliceHasIdentifier(fillNode.tokens, "A64EncMadd");
        if (predictorExact && fillerExact) {
          proof = {
            kind: "positive_int32_movz_movk_madd",
            fillerKey: keyFor(node.file, "PrimaryBodyIRFillIndexedAggregateAddressToReg"),
            fillerSha256: sha256(Buffer.from(fillNode.fn.raw, "utf8")),
          };
        }
      } else if (node.name === "regallocA64AppendIndexedAddress") {
        const exactMaterialization = tokenSequencePresent(node.tokens, ["stride", "&", String(rule.limit)]) &&
          tokenSequencePresent(node.tokens, ["if", "stride", ">", String(rule.limit), ":"]) &&
          tokenSequencePresent(node.tokens, ["stride", ">", ">", "16"]) &&
          tokenSliceHasIdentifier(node.tokens, "A64EncMovz") &&
          tokenSliceHasIdentifier(node.tokens, "A64EncMovk") &&
          tokenSliceHasIdentifier(node.tokens, "A64EncMadd");
        if (exactMaterialization) {
          proof = {
            kind: "adapter_positive_int32_movz_movk_madd",
            fillerKey: keyFor(node.file, node.name),
            fillerSha256: sha256(Buffer.from(node.fn.raw, "utf8")),
          };
        }
      }
      if (proof) postSealProgramDerivedEncodingCapProofs.push({...evidence, proofStatus: "PROVEN", proof});
      else postSealProgramDerivedEncodingCapUnproven.push({...evidence, proofStatus: "UNPROVEN", reason: "source lexer found the cap but cannot prove an exact chunk/materialize/loop path"});
    }
  }
  postSealProgramDerivedEncodingRejectCaps.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line);
  postSealProgramDerivedEncodingCapUnproven.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line);
  postSealProgramDerivedEncodingCapProofs.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line);
  if (postSealProgramDerivedEncodingRejectCaps.length > 0) issues.push("post_seal_program_value_rejected_by_physical_encoding_limit");
  if (postSealProgramDerivedEncodingCapUnproven.length > 0) issues.push("post_seal_program_value_encoding_limit_path_unproven");

  const postSealPredictorFillerMirrorViolations = [];
  for (const file of [
    "src/core/backend/primary_object_plan.cheng",
  ]) {
    const predictor = nodes.get(keyFor(file, "PrimaryBodyIRStrEqWordCount"));
    const filler = nodes.get(keyFor(file, "PrimaryBodyIRFillStrEqOp"));
    if (!predictor && !filler) continue;
    const reasons = [];
    let predictorStoreVar = "";
    if (!predictor) reasons.push("predictor_missing");
    else {
      const storeMatch = predictor.fn.code.match(/\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*PrimaryBodyIrStoreSlotWordCount\s*\(\s*bodyIR\s*,\s*op\.target\s*\)/);
      if (!storeMatch) reasons.push("predictor_missing_variable_store_word_count");
      else predictorStoreVar = storeMatch[1];
      if (/\breturn\s+lhsWords\s*\+\s*rhsWords\s*\+\s*19\b/.test(predictor.fn.code)) {
        reasons.push("predictor_assumes_one_word_store");
      }
      if (predictorStoreVar) {
        const exactReturn = new RegExp(`\\breturn\\s+lhsWords\\s*\\+\\s*rhsWords\\s*\\+\\s*18\\s*\\+\\s*${predictorStoreVar}\\b`);
        if (!exactReturn.test(predictor.fn.code)) reasons.push("predictor_store_word_count_not_in_exact_total");
      }
    }
    if (!filler) reasons.push("filler_missing");
    else {
      const storeMatch = filler.fn.code.match(/\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*PrimaryBodyIrStoreSlotWordCount\s*\(\s*bodyIR\s*,\s*op\.target\s*\)/);
      if (!storeMatch) reasons.push("filler_missing_variable_store_word_count");
      else {
        const storeVar = storeMatch[1];
        const exactStoreAnchor = new RegExp(`\\blet\\s+storeIndex\\s*=\\s*offset\\s*\\+\\s*wordCount\\s*-\\s*${storeVar}\\b`);
        if (!exactStoreAnchor.test(filler.fn.code)) reasons.push("filler_store_anchor_not_variable_width");
      }
      if (!/\blet\s+failIndex\s*=\s*storeIndex\s*-\s*1\b/.test(filler.fn.code) ||
          !/\blet\s+successIndex\s*=\s*storeIndex\s*-\s*3\b/.test(filler.fn.code)) {
        reasons.push("filler_branch_anchors_not_store_relative");
      }
    }
    if (reasons.length > 0) {
      postSealPredictorFillerMirrorViolations.push({
        file,
        predictorKey: keyFor(file, "PrimaryBodyIRStrEqWordCount"),
        fillerKey: keyFor(file, "PrimaryBodyIRFillStrEqOp"),
        line: predictor?.fn.line || filler?.fn.line || 0,
        family: "str_eq_variable_width_store_predictor_filler",
        reasons,
        reachable: entryForwardReachable.has(keyFor(file, "PrimaryBodyIRStrEqWordCount")) ||
          entryForwardReachable.has(keyFor(file, "PrimaryBodyIRFillStrEqOp")),
      });
    }
  }
  postSealPredictorFillerMirrorViolations.sort((left, right) => left.file.localeCompare(right.file));
  if (postSealPredictorFillerMirrorViolations.length > 0) issues.push("post_seal_predictor_filler_variable_width_store_contract_violation");

  const bodyIrEntryCAbiMetadataContractViolations = [];
  const bodyIrEntryCAbiMetadataContractProofs = [];
  const coreIrTypesFile = "src/core/ir/core_types.cheng";
  const bodyIrCodecFile = "src/core/backend2/backend2_frag_codec.cheng";
  if (files.has(coreIrTypesFile) || files.has(bodyIrCodecFile)) {
    const reasons = [];
    const coreIrText = files.get(coreIrTypesFile)?.text || "";
    const coreIrCodeLines = lexChengSource(coreIrText, false).code.split("\n");
    let bodyIrFieldPresent = false;
    const bodyIrStart = coreIrCodeLines.findIndex((line) => /^\s*BodyIR\s*=\s*$/.test(line));
    if (bodyIrStart >= 0) {
      const bodyIrIndent = coreIrCodeLines[bodyIrStart].match(/^\s*/)[0].length;
      for (let lineIndex = bodyIrStart + 1; lineIndex < coreIrCodeLines.length; lineIndex++) {
        const line = coreIrCodeLines[lineIndex];
        if (line.trim().length === 0) continue;
        const indent = line.match(/^\s*/)[0].length;
        if (indent <= bodyIrIndent) break;
        if (/^\s*entryIsCAbi\s*:\s*bool\s*$/.test(line)) bodyIrFieldPresent = true;
      }
    }
    if (!bodyIrFieldPresent) reasons.push("bodyir_entry_c_abi_field_missing");

    const codecText = files.get(bodyIrCodecFile)?.text || "";
    const codecCode = lexChengSource(codecText, false).code;
    if (!/^[ \t]*backend2BodyIrCodecVersion[ \t]*:[ \t]*int32[ \t]*=[ \t]*4[ \t]*$/m.test(codecCode) ||
        !/^[ \t]*backend2BodyIrCodecFieldCount[ \t]*:[ \t]*int32[ \t]*=[ \t]*7[ \t]*$/m.test(codecCode)) {
      reasons.push("bodyir_codec_version_or_field_count_missing_or_inexact");
    }
    const sizeNode = nodes.get(keyFor(bodyIrCodecFile, "Backend2BodyIrEncodedSize"));
    if (!sizeNode ||
        !/\bfor\s+i\s+in\s+0\.\.<bodyIR\.cstringLiterals\.len\s*:\s*total\s*=\s*total\s*\+\s*backend2BodyIrCStringSize\s*\(\s*bodyIR\.cstringLiterals\s*\[\s*i\s*\]\s*\)\s*total\s*=\s*total\s*\+\s*4\s*\+\s*4\s*return\s+total\b/.test(sizeNode.fn.code)) {
      reasons.push("bodyir_entry_c_abi_encoded_size_missing");
    }
    const encodeNode = nodes.get(keyFor(bodyIrCodecFile, "Backend2BodyIrEncode"));
    if (!encodeNode) {
      reasons.push("bodyir_entry_c_abi_encode_missing_or_inexact");
    } else {
      const code = encodeNode.fn.code;
      const tagIndex = code.search(/\bbackend2FragCodecPutTag\s*\(\s*buf\s*,\s*cursor\s*,\s*7\s*\)/);
      const flagIndex = code.search(/\bvar\s+entryCAbiFlag\s*:\s*int32\b/);
      const trueIndex = code.search(/\bif\s+bodyIR\.entryIsCAbi\s*:\s*entryCAbiFlag\s*=\s*1\b/);
      const putIndex = code.search(/\bBackend2CodecPutU32\s*\(\s*buf\s*,\s*cursor\s*,\s*entryCAbiFlag\s*\)/);
      if (tagIndex < 0 || flagIndex <= tagIndex || trueIndex <= flagIndex || putIndex <= trueIndex) {
        reasons.push("bodyir_entry_c_abi_encode_missing_or_inexact");
      }
    }
    const decodeNode = nodes.get(keyFor(bodyIrCodecFile, "Backend2BodyIrDecode"));
    if (!decodeNode) {
      reasons.push("bodyir_entry_c_abi_decode_missing_or_inexact");
    } else {
      const code = decodeNode.fn.code;
      const tagIndex = code.search(/\bbackend2FragCodecExpectTag\s*\(\s*buf\s*,\s*cursor\s*,\s*7\s*\)/);
      const readIndex = code.search(/\bbodyIR\.entryIsCAbi\s*=\s*Backend2CodecReadU32\s*\(\s*buf\s*,\s*cursor\s*\)\s*!=\s*0\b/);
      if (tagIndex < 0 || readIndex <= tagIndex) reasons.push("bodyir_entry_c_abi_decode_missing_or_inexact");
    }
    const roundTripNode = nodes.get(keyFor(bodyIrCodecFile, "Backend2BodyIrRoundTripAssert"));
    if (!roundTripNode ||
        !/\bvar\s+enc1\s*=\s*Backend2BodyIrEncode\s*\(\s*bodyIR\s*\)/.test(roundTripNode.fn.code) ||
        !/\blet\s+decoded\s*=\s*Backend2BodyIrDecode\s*\(\s*enc1\s*,\s*cursor\s*\)/.test(roundTripNode.fn.code) ||
        !/\bif\s+cursor\s*!=\s*enc1\.len\s*:\s*panic\s*\(/.test(roundTripNode.fn.code) ||
        !/\bvar\s+enc2\s*=\s*Backend2BodyIrEncode\s*\(\s*decoded\s*\)/.test(roundTripNode.fn.code) ||
        !/\bif\s+!\s*rawbytes\.BytesEqual\s*\(\s*enc1\s*,\s*enc2\s*\)\s*:\s*panic\s*\(/.test(roundTripNode.fn.code)) {
      reasons.push("bodyir_entry_c_abi_roundtrip_assert_missing_or_inexact");
    }
    const metadataNodes = [sizeNode, encodeNode, decodeNode, roundTripNode].filter(Boolean);
    const evidence = {
      family: "bodyir_entry_c_abi_metadata_roundtrip",
      reasons,
      field: "BodyIR.entryIsCAbi:bool",
      codecVersion: 4,
      codecFieldCount: 7,
      files: [coreIrTypesFile, bodyIrCodecFile].filter((file) => files.has(file)).map((file) => ({path: file, sha256: files.get(file).sha256})),
      functions: metadataNodes.map((node) => ({key: keyFor(node.file, node.name), sha256: sha256(Buffer.from(node.fn.raw, "utf8"))})).sort((left, right) => left.key.localeCompare(right.key)),
    };
    if (reasons.length > 0) {
      bodyIrEntryCAbiMetadataContractViolations.push(evidence);
      issues.push("bodyir_entry_c_abi_metadata_roundtrip_contract_violation");
    } else {
      bodyIrEntryCAbiMetadataContractProofs.push({...evidence, proofStatus: "PROVEN"});
    }
  }

  const regallocAdapterF64ContractViolations = [];
  const regallocAdapterF64ContractProofs = [];
  const adapterFile = "src/core/backend/regalloc_aarch64_adapter.cheng";
  const allocatorFile = "src/core/backend/regalloc_single_pass.cheng";
  const adapterNodes = [...nodes.values()].filter((node) => node.file === adapterFile);
  if (adapterNodes.length > 0) {
    const adapterRootKey = keyFor(adapterFile, "RegallocAarch64PrepareFunctionActionRecipes");
    const adapterReachableKeys = new Set();
    if (nodes.has(adapterRootKey)) {
      const work = [adapterRootKey];
      while (work.length > 0) {
        const key = work.pop();
        if (adapterReachableKeys.has(key) || !nodes.has(key)) continue;
        adapterReachableKeys.add(key);
        for (const edge of nodes.get(key).edges) if (!adapterReachableKeys.has(edge)) work.push(edge);
      }
    }
    const reachableAdapterNodes = adapterNodes.filter((node) => adapterReachableKeys.has(keyFor(node.file, node.name)));
    const evidenceFor = (family, reasons, evidenceNodes, contract = {}) => {
      const functions = evidenceNodes.filter(Boolean).map((node) => ({
        key: keyFor(node.file, node.name),
        sha256: sha256(Buffer.from(node.fn.raw, "utf8")),
      })).sort((left, right) => left.key.localeCompare(right.key));
      const evidence = {
        family,
        reasons,
        rootKey: adapterRootKey,
        rootReachable: adapterReachableKeys.has(adapterRootKey),
        functions,
        ...contract,
      };
      if (reasons.length > 0) {
        regallocAdapterF64ContractViolations.push(evidence);
        issues.push(`regalloc_adapter_${family}_contract_violation`);
      } else {
        regallocAdapterF64ContractProofs.push({...evidence, proofStatus: "PROVEN"});
      }
    };

    const constraintNode = nodes.get(keyFor(allocatorFile, "RegallocTargetConstraintsAarch64Darwin"));
    const gprWidthNode = nodes.get(keyFor(allocatorFile, "regallocValueGprWidth"));
    const unsupportedF64CAbiNode = nodes.get(keyFor(adapterFile, "regallocA64CallHasUnsupportedF64CAbi"));
    const callResultClassifierNode = nodes.get(keyFor(adapterFile, "regallocA64CallResultIsF64"));
    const prepareNode = nodes.get(adapterRootKey);
    const admissionReasons = [];
    if (!constraintNode) admissionReasons.push("allocator_target_constraints_missing");
    else if (/\badd\s*\(\s*out\.gprTypeKinds\s*,\s*coreir\.LocalF64Tag\s*\)/.test(constraintNode.fn.code)) {
      admissionReasons.push("allocator_illegally_admits_f64_to_gpr_class");
    }
    if (!gprWidthNode) admissionReasons.push("allocator_gpr_width_classifier_missing");
    else {
      const f64WidthBranch = gprWidthNode.fn.code.match(/\bif\s+typeKind\s*==\s*coreir\.LocalF64Tag\s*:\s*return\s+(-?[0-9]+)\b/);
      if (/\bcoreir\.LocalF64Tag\b/.test(gprWidthNode.fn.code) && (!f64WidthBranch || Number(f64WidthBranch[1]) !== 0)) {
        admissionReasons.push("allocator_illegally_assigns_f64_gpr_width");
      }
    }

    // F64 remains a Stack-class value.  The foreign-call boundary is valid
    // only when the adapter either implements independent AAPCS64 GPR/FPR
    // cursors (including the overflow stack path), or rejects every importc
    // call containing an F64 argument/result before any recipe is emitted.
    const completeClassAwareBridgeNode = reachableAdapterNodes.find((node) => {
      const code = node.fn.code;
      const outgoingStackTransfers = [...code.matchAll(/\bregallocA64AppendOutgoingStackArg\s*\([^)]*?stackArgOffset[^)]*?\)/g)];
      return /\btargetIsImportc\b/.test(code) &&
        /\bfor\s+argIndex\s+in\s+0\.\.<call\.argSlots\.len\b/.test(code) &&
        /\blet\s+slotIndex\s*=\s*call\.argSlots\s*\[\s*argIndex\s*\]/.test(code) &&
        /\blet\s+typeKind\s*=\s*bodyIR\.localSlots\s*\[\s*slotIndex\s*\]\.typeKind\b/.test(code) &&
        /\blet\s+sourceReg\s*=\s*regallocA64CallArgRawReg\s*\([^)]*?bodyIR[^)]*?call[^)]*?argIndex[^)]*?\)/.test(code) &&
        /\bvar\s+gprArgOrdinal\s*:\s*int32\b/.test(code) &&
        /\bvar\s+f64ArgOrdinal\s*:\s*int32\b/.test(code) &&
        /\bvar\s+stackArgOffset\s*:\s*int32\b/.test(code) &&
        /\btypeKind\s*==\s*coreir\.LocalF64Tag\b[\s\S]*?\bif\s+f64ArgOrdinal\s*<\s*8\s*:/.test(code) &&
        /\bA64EncFmovDx\s*\(\s*f64ArgOrdinal\s*,\s*sourceReg\s*\)/.test(code) &&
        /\bf64ArgOrdinal\s*=\s*f64ArgOrdinal\s*\+\s*1\b/.test(code) &&
        /\bif\s+gprArgOrdinal\s*<\s*8\s*:/.test(code) &&
        /\bregallocA64AppendMove\s*\([^)]*?gprArgOrdinal[^)]*?sourceReg[^)]*?\)/.test(code) &&
        /\bgprArgOrdinal\s*=\s*gprArgOrdinal\s*\+\s*1\b/.test(code) &&
        outgoingStackTransfers.length >= 2 &&
        /\bstackArgOffset\s*=\s*stackArgOffset\s*\+\s*8\b/.test(code);
    });
    const completeClassAwareBridgeCaller = completeClassAwareBridgeNode ? reachableAdapterNodes.find((node) => {
      const bridgeKey = keyFor(completeClassAwareBridgeNode.file, completeClassAwareBridgeNode.name);
      if (!node.edges.has(bridgeKey)) return false;
      const callIndex = node.fn.code.indexOf(completeClassAwareBridgeNode.name);
      const emissionMarkers = ["A64EncBlPlaceholder"];
      if (node.name !== "regallocA64AppendCall") emissionMarkers.push("regallocA64AppendCall");
      if (node.name !== "regallocA64BuildActionRecipe") emissionMarkers.push("regallocA64BuildActionRecipe");
      const firstCallEmissionIndex = emissionMarkers
        .map((marker) => node.fn.code.indexOf(marker)).filter((index) => index >= 0)
        .reduce((best, index) => Math.min(best, index), Number.POSITIVE_INFINITY);
      return callIndex >= 0 && callIndex < firstCallEmissionIndex;
    }) : null;
    let admissionProofKind = "";
    if (completeClassAwareBridgeNode && completeClassAwareBridgeCaller) {
      admissionProofKind = "complete_class_aware_bridge";
    } else {
      const classifierReasons = [];
      if (!unsupportedF64CAbiNode) classifierReasons.push("importc_f64_classifier_missing");
      else {
        const code = unsupportedF64CAbiNode.fn.code;
        if (!/\bif\s+!\s*call\.targetIsImportc\s*:\s*return\s+false\b/.test(code)) classifierReasons.push("importc_f64_classifier_not_scoped_to_importc");
        if (!/\bfor\s+argIndex\s+in\s+0\.\.<call\.argSlots\.len\b/.test(code) ||
            !/\blet\s+slotIndex\s*=\s*call\.argSlots\s*\[\s*argIndex\s*\]/.test(code) ||
            !/\bslotIndex\s*>=\s*0\b[\s\S]*?\bslotIndex\s*<\s*bodyIR\.localSlots\.len\b[\s\S]*?\bbodyIR\.localSlots\s*\[\s*slotIndex\s*\]\.typeKind\s*==\s*coreir\.LocalF64Tag\s*:\s*return\s+true\b/.test(code)) {
          classifierReasons.push("importc_f64_argument_classifier_incomplete");
        }
        if (!/\breturn\s+regallocA64CallResultIsF64\s*\(\s*bodyIR\s*,\s*call\s*\)/.test(code)) classifierReasons.push("importc_f64_result_classifier_missing");
        if (!adapterReachableKeys.has(keyFor(adapterFile, unsupportedF64CAbiNode.name))) classifierReasons.push("importc_f64_classifier_unreachable_from_recipe_root");
      }
      if (!callResultClassifierNode ||
          !/\bcall\.resultSlot\s*>=\s*0\b[\s\S]*?\bcall\.resultSlot\s*<\s*bodyIR\.localSlots\.len\b[\s\S]*?\bbodyIR\.localSlots\s*\[\s*call\.resultSlot\s*\]\.typeKind\s*==\s*coreir\.LocalF64Tag\b/.test(callResultClassifierNode.fn.code)) {
        classifierReasons.push("importc_f64_result_classifier_incomplete");
      }
      if (!prepareNode) classifierReasons.push("recipe_root_missing");
      else {
        const code = prepareNode.fn.code;
        const classifierCallIndex = code.indexOf("regallocA64CallHasUnsupportedF64CAbi");
        const firstEmissionIndex = [
          "regallocA64BuildActionRecipe",
          "regallocA64BuildOpRecipe",
          "regallocA64BuildTermRecipe",
          "regallocA64AppendSpAdjust",
          "regallocA64AppendStore",
          "out.prologueWords",
        ].map((marker) => code.indexOf(marker)).filter((index) => index >= 0).reduce((best, index) => Math.min(best, index), Number.POSITIVE_INFINITY);
        const exactReject = /\bfor\s+callIndex\s+in\s+0\.\.<bodyIR\.callSequence\.len\s*:\s*if\s+regallocA64CallHasUnsupportedF64CAbi\s*\(\s*bodyIR\s*,\s*bodyIR\.callSequence\s*\[\s*callIndex\s*\]\s*\)\s*:\s*regallocA64FunctionFail\s*\([\s\S]*?\)\s*return\s+out\b/.test(code);
        if (!exactReject) classifierReasons.push("importc_f64_fail_closed_path_missing");
        if (classifierCallIndex < 0 || classifierCallIndex >= firstEmissionIndex) classifierReasons.push("importc_f64_fail_closed_not_before_emission");
      }
      if (classifierReasons.length === 0) admissionProofKind = "explicit_pre_emission_fail_closed";
      else admissionReasons.push(...classifierReasons);
    }
    evidenceFor("importc_f64_admission", admissionReasons,
      [constraintNode, gprWidthNode, completeClassAwareBridgeNode, completeClassAwareBridgeCaller, unsupportedF64CAbiNode, callResultClassifierNode, prepareNode],
      admissionProofKind ? {proofKind: admissionProofKind} : {candidateProofKinds: ["complete_class_aware_bridge", "explicit_pre_emission_fail_closed"]});

    const entryAbiNode = nodes.get(keyFor(adapterFile, "RegallocAarch64EntryAbiSupported"));
    const entryAbiReasons = [];
    if (!entryAbiNode) {
      entryAbiReasons.push("entry_c_abi_f64_parameter_fail_closed_contract_missing");
      entryAbiReasons.push("entry_c_abi_f64_return_not_explicitly_allowed");
    } else {
      const code = entryAbiNode.fn.code;
      if (!/\bif\s+!\s*bodyIR\.entryIsCAbi\s*:\s*return\s+true\b/.test(code) ||
          !/\bfor\s+slotIndex\s+in\s+0\.\.<bodyIR\.localSlots\.len\s*:\s*if\s+bodyIR\.localSlots\s*\[\s*slotIndex\s*\]\.stackOffset\s*<\s*0\s*&&\s*bodyIR\.localSlots\s*\[\s*slotIndex\s*\]\.typeKind\s*==\s*coreir\.LocalF64Tag\s*:\s*return\s+false\b/.test(code) ||
          !/\breturn\s+true\b/.test(code)) {
        entryAbiReasons.push("entry_c_abi_f64_parameter_fail_closed_contract_missing");
      }
      if (/\b(?:resultSlot|BodyTermReturnTag)\b/.test(code) ||
          /\bif\s+bodyIR\.localSlots\s*\[\s*slotIndex\s*\]\.typeKind\s*==\s*coreir\.LocalF64Tag\s*:\s*return\s+false\b/.test(code)) {
        entryAbiReasons.push("entry_c_abi_f64_return_not_explicitly_allowed");
      }
      if (!adapterReachableKeys.has(keyFor(adapterFile, entryAbiNode.name))) {
        entryAbiReasons.push("entry_c_abi_gate_unreachable_from_recipe_root");
      }
    }
    if (!prepareNode) {
      entryAbiReasons.push("entry_c_abi_admission_not_bound_before_emission");
    } else {
      const code = prepareNode.fn.code;
      const gateIndex = code.indexOf("RegallocAarch64EntryAbiSupported");
      const firstEmissionIndex = [
        "regallocA64BuildActionRecipe",
        "regallocA64BuildOpRecipe",
        "regallocA64BuildTermRecipe",
        "regallocA64AppendSpAdjust",
        "regallocA64AppendStore",
        "out.prologueWords",
      ].map((marker) => code.indexOf(marker)).filter((index) => index >= 0).reduce((best, index) => Math.min(best, index), Number.POSITIVE_INFINITY);
      if (!/\bif\s+!\s*RegallocAarch64EntryAbiSupported\s*\(\s*bodyIR\s*\)\s*:\s*regallocA64FunctionFail\s*\([\s\S]*?\)\s*return\s+out\b/.test(code) ||
          gateIndex < 0 || gateIndex >= firstEmissionIndex) {
        entryAbiReasons.push("entry_c_abi_admission_not_bound_before_emission");
      }
    }
    evidenceFor("f64_entry_c_abi_admission", entryAbiReasons, [entryAbiNode, prepareNode], {
      f64ParameterDisposition: "fail_closed_when_entry_is_c_abi",
      f64ReturnDisposition: "allowed_through_d0_bridge",
    });

    const f64CondMapping = [
      ["BodyCondF64EqTag", "A64CondEQ"],
      ["BodyCondF64NeTag", "A64CondNE"],
      ["BodyCondF64LtTag", "A64CondMI"],
      ["BodyCondF64LeTag", "A64CondLS"],
      ["BodyCondF64GtTag", "A64CondGT"],
      ["BodyCondF64GeTag", "A64CondGE"],
    ];
    const condExact = (node, parameter, tag, condition) => !!node && new RegExp(`\\b${parameter}\\s*==\\s*coreir\\.${tag}\\s*:\\s*return\\s+a64\\.${condition}\\b`).test(node.fn.code);
    const adapterCondNode = nodes.get(keyFor(adapterFile, "regallocA64CondCode"));
    const primaryCondNode = nodes.get(keyFor("src/core/backend/primary_object_plan.cheng", "PrimaryBodyCondArm64TrueCode"));
    const condReasons = [];
    for (const [tag, condition] of f64CondMapping) {
      if (!condExact(primaryCondNode, "condTag", tag, condition)) condReasons.push(`primary_canonical_${tag}_${condition}_missing`);
      if (!condExact(adapterCondNode, "cond", tag, condition)) condReasons.push(`adapter_${tag}_must_map_${condition}`);
    }
    if (adapterCondNode && !adapterReachableKeys.has(keyFor(adapterFile, "regallocA64CondCode"))) condReasons.push("adapter_condition_mapper_not_reachable_from_recipe_root");
    evidenceFor("f64_cond_canonical_mirror", condReasons, [adapterCondNode, primaryCondNode]);

    const machineFragmentsNode = nodes.get(keyFor(adapterFile, "regallocA64BuildMachineFragments"));
    const homeReasons = [];
    if (!prepareNode) homeReasons.push("recipe_root_missing");
    else {
      if (!/\bvar\s+parameterNeedsHome\s*:\s*bool\s*\[\s*\]/.test(prepareNode.fn.code) ||
          !/\badd\s*\(\s*parameterNeedsHome\s*,\s*needsHome\s*\)/.test(prepareNode.fn.code)) homeReasons.push("entry_home_need_derivation_missing");
      if (!/\bbodyIR\.localSlots\s*\[\s*slotIndex\s*\]\.typeKind\s*==\s*coreir\.LocalF64Tag\s*:\s*needsHome\s*=\s*true\b/.test(prepareNode.fn.code)) homeReasons.push("entry_home_f64_stack_consumer_not_forced");
      if (!/\bout\.parameterHomeOffsets\s*\[\s*paramIndex\s*\]\s*=\s*nextIngressOffset\b/.test(prepareNode.fn.code)) homeReasons.push("entry_home_offset_not_allocated");
      if (!/\badd\s*\(\s*out\.localStackOffsets\s*,\s*out\.parameterHomeOffsets\s*\[\s*paramIndex\s*\]\s*\)/.test(prepareNode.fn.code)) homeReasons.push("local_stack_offset_not_bound_to_parameter_home_offset");
      if (!/\blet\s+homeOffset\s*=\s*out\.parameterHomeOffsets\s*\[\s*paramIndex\s*\]/.test(prepareNode.fn.code)) homeReasons.push("entry_home_offset_not_consumed");
      if (!/\blet\s+ingressWord\s*=\s*out\.prologueWords\.len\b/.test(prepareNode.fn.code) ||
          !/\bregallocA64AppendStore\s*\(\s*out\.prologueWords\s*,\s*plan\.constraints\.fixedArgRegs\s*\[\s*paramIndex\s*\]\s*,\s*homeOffset\s*,\s*width\s*\)/.test(prepareNode.fn.code)) homeReasons.push("entry_home_not_written_by_prologue");
      if (!/\badd\s*\(\s*out\.abiIngressOffsets\s*,\s*homeOffset\s*\)/.test(prepareNode.fn.code) ||
          !/\badd\s*\(\s*out\.abiIngressWidths\s*,\s*width\s*\)/.test(prepareNode.fn.code) ||
          !/\badd\s*\(\s*out\.abiIngressWordIndices\s*,\s*ingressWord\s*\)/.test(prepareNode.fn.code) ||
          !/\badd\s*\(\s*out\.abiIngressWordCounts\s*,\s*1\s*\)/.test(prepareNode.fn.code)) homeReasons.push("entry_home_write_not_bound_to_ingress_receipt");
    }
    if (!machineFragmentsNode ||
        !adapterReachableKeys.has(keyFor(adapterFile, "regallocA64BuildMachineFragments")) ||
        !/\bRegallocAarch64FragmentOwnerAbiIngress\b/.test(machineFragmentsNode.fn.code) ||
        !/\bfragment\.wordStart\s*=\s*out\.abiIngressWordIndices\s*\[\s*ingressIndex\s*\]/.test(machineFragmentsNode.fn.code) ||
        !/\bfragment\.wordCount\s*=\s*out\.abiIngressWordCounts\s*\[\s*ingressIndex\s*\]/.test(machineFragmentsNode.fn.code) ||
        !/\bout\.functionWords\s*\[\s*fragment\.wordStart\s*\+\s*wordIndex\s*\]/.test(machineFragmentsNode.fn.code) ||
        !/\bregallocA64WordsSpMemoryCallEffects\b/.test(machineFragmentsNode.fn.code) ||
        !/\bRegallocAarch64EffectSpStore\b/.test(machineFragmentsNode.fn.code) ||
        !/\bregallocA64StackImmediateFits\s*\(\s*out\.abiIngressOffsets\s*\[\s*ingressIndex\s*\]\s*,\s*out\.abiIngressWidths\s*\[\s*ingressIndex\s*\]\s*\)/.test(machineFragmentsNode.fn.code)) homeReasons.push("entry_home_prologue_store_not_owned_by_machine_fragment");
    evidenceFor("entry_home_prologue_store", homeReasons, [prepareNode, machineFragmentsNode]);

    const callResultBridgeNode = reachableAdapterNodes.find((node) =>
      /\bregallocA64CallResultIsF64\s*\(\s*bodyIR\s*,\s*call\s*\)/.test(node.fn.code) &&
      /\bA64EncFmovXd\s*\(\s*a64\.A64X0\s*,\s*0\s*\)/.test(node.fn.code) &&
      node.fn.code.indexOf("A64EncBlPlaceholder") >= 0 &&
      node.fn.code.indexOf("A64EncBlPlaceholder") < node.fn.code.indexOf("A64EncFmovXd"));
    const returnBridgeNode = reachableAdapterNodes.find((node) =>
      /\b(?:BodyTermReturnTag|BodyIrAccessFixedReturnValue)\b/.test(node.fn.code) &&
      /\bcoreir\.LocalF64Tag\b/.test(node.fn.code) &&
      /\bA64EncFmovDx\s*\(\s*0\s*,\s*(?:a64\.A64X0|0)\s*\)/.test(node.fn.code));
    const bridgeReasons = [];
    if (!callResultBridgeNode) bridgeReasons.push("call_result_d0_to_x0_bridge_missing_or_unreachable");
    if (!returnBridgeNode) bridgeReasons.push("return_x0_to_d0_bridge_missing_or_unreachable");
    evidenceFor("f64_call_result_return_bridge", bridgeReasons, [callResultBridgeNode, returnBridgeNode]);
  }
  regallocAdapterF64ContractViolations.sort((left, right) => left.family.localeCompare(right.family));
  regallocAdapterF64ContractProofs.sort((left, right) => left.family.localeCompare(right.family));

  const x64CopyMemoryCheckedArithmeticViolations = [];
  const x64CopyMemoryCheckedArithmeticProofs = [];
  const x64F64AbiContractViolations = [];
  const x64F64AbiContractProofs = [];
  const x64WordCountCheckedArithmeticViolations = [];
  const x64WordCountCheckedArithmeticProofs = [];
  const x64BodyFile = "src/core/backend/x86_64_body_emit.cheng";
  if (files.has(x64BodyFile)) {
    const checkedAddNode = nodes.get(keyFor(x64BodyFile, "X64BodyCheckedAddNonNegative"));
    const checkedMul2Node = nodes.get(keyFor(x64BodyFile, "X64BodyCheckedMul2"));
    const checkedMul4Node = nodes.get(keyFor(x64BodyFile, "x64BodyCheckedMul4"));
    const checkedMul8Node = nodes.get(keyFor(x64BodyFile, "X64BodyCheckedMul8"));
    const checkedMul14Node = nodes.get(keyFor(x64BodyFile, "x64BodyCheckedMul14"));
    const checkedMul16Node = nodes.get(keyFor(x64BodyFile, "x64BodyCheckedMul16"));
    const byteCountNode = nodes.get(keyFor(x64BodyFile, "X64BodyCopyMemoryByteCount"));
    const displacementRangeNode = nodes.get(keyFor(x64BodyFile, "x64BodyCopyDisplacementRangeSupported"));
    const rangeNode = nodes.get(keyFor(x64BodyFile, "X64BodyCopyMemoryRangeSupported"));
    const fillNode = nodes.get(keyFor(x64BodyFile, "x64BodyFillCopyMemory"));
    const copySlotNode = nodes.get(keyFor(x64BodyFile, "X64BodyCopySlotByteCount"));
    const fillCopySlotNode = nodes.get(keyFor(x64BodyFile, "x64BodyFillCopySlot"));
    const indexedAggregateNode = nodes.get(keyFor(x64BodyFile, "X64BodyIndexedAggregateValueCopyBytes"));
    const sretPairCountNode = nodes.get(keyFor(x64BodyFile, "X64ReturnSretCopyPairCount"));
    const sretStrideNode = nodes.get(keyFor(x64BodyFile, "X64ReturnSretCopyStride"));
    const termSizeNode = nodes.get(keyFor(x64BodyFile, "X64BodyTermSize"));
    const fillTermReturnNode = nodes.get(keyFor(x64BodyFile, "x64BodyFillBlockTermReturn"));
    const opByteCountNode = nodes.get(keyFor(x64BodyFile, "X64BodyOpByteCount"));
    const reasons = [];
    const exactCheckedMultiply = (node, factor, maximum) => !!node &&
      new RegExp(`\\bif\\s+value\\s*<\\s*0\\s*\\|\\|\\s*value\\s*>\\s*(?:${maximum}|X64BodyInt32Max\\s*\\/\\s*${factor})\\s*:\\s*return\\s+-1\\b`).test(node.fn.code) &&
      new RegExp(`\\breturn\\s+value\\s*\\*\\s*${factor}\\b`).test(node.fn.code);
    if (!checkedAddNode ||
        !/\bif\s+lhs\s*<\s*0\s*\|\|\s*rhs\s*<\s*0\s*\|\|\s*lhs\s*>\s*X64BodyInt32Max\s*-\s*rhs\s*:\s*return\s+-1\b/.test(checkedAddNode.fn.code) ||
        !/\breturn\s+lhs\s*\+\s*rhs\b/.test(checkedAddNode.fn.code)) reasons.push("copy_memory_checked_add_helper_missing_or_inexact");
    if (!exactCheckedMultiply(checkedMul2Node, 2, 1073741823)) reasons.push("copy_memory_checked_mul2_helper_missing_or_inexact");
    if (!exactCheckedMultiply(checkedMul4Node, 4, 536870911)) reasons.push("copy_memory_checked_mul4_helper_missing_or_inexact");
    if (!exactCheckedMultiply(checkedMul8Node, 8, 268435455)) reasons.push("copy_memory_checked_mul8_helper_missing_or_inexact");
    if (!exactCheckedMultiply(checkedMul14Node, 14, 153391689)) reasons.push("copy_memory_checked_mul14_helper_missing_or_inexact");
    if (!exactCheckedMultiply(checkedMul16Node, 16, 134217727)) reasons.push("copy_memory_checked_mul16_helper_missing_or_inexact");

    if (!byteCountNode ||
        !/\bif\s+byteCount\s*<=\s*0\s*:\s*return\s+0\b/.test(byteCountNode.fn.code) ||
        !/\bif\s+byteCount\s*%\s*8\s*==\s*0\s*:\s*return\s+x64BodyCheckedMul16\s*\(\s*byteCount\s*\/\s*8\s*\)/.test(byteCountNode.fn.code) ||
        !/\bif\s+byteCount\s*%\s*4\s*==\s*0\s*:\s*return\s+x64BodyCheckedMul14\s*\(\s*byteCount\s*\/\s*4\s*\)/.test(byteCountNode.fn.code) ||
        !/\breturn\s+x64BodyCheckedMul16\s*\(\s*byteCount\s*\)/.test(byteCountNode.fn.code)) {
      reasons.push("copy_memory_byte_count_checked_multiply_contract_missing");
    }
    if (!displacementRangeNode ||
        !/\bif\s+offset\s*<\s*0\s*\|\|\s*byteCount\s*<=\s*0\s*:\s*return\s+false\b/.test(displacementRangeNode.fn.code) ||
        !/\bvar\s+lastDelta\s*=\s*byteCount\s*-\s*1\b/.test(displacementRangeNode.fn.code) ||
        !/\bif\s+byteCount\s*%\s*8\s*==\s*0\s*:\s*lastDelta\s*=\s*byteCount\s*-\s*8\b/.test(displacementRangeNode.fn.code) ||
        !/\belif\s+byteCount\s*%\s*4\s*==\s*0\s*:\s*lastDelta\s*=\s*byteCount\s*-\s*4\b/.test(displacementRangeNode.fn.code) ||
        !/\breturn\s+X64BodyCheckedAddNonNegative\s*\(\s*offset\s*,\s*lastDelta\s*\)\s*>=\s*0\b/.test(displacementRangeNode.fn.code) ||
        !rangeNode ||
        !/\breturn\s+X64BodyCopyMemoryByteCount\s*\(\s*byteCount\s*\)\s*>\s*0\s*&&\s*x64BodyCopyDisplacementRangeSupported\s*\(\s*offset\s*,\s*byteCount\s*\)/.test(rangeNode.fn.code)) {
      reasons.push("copy_memory_range_precheck_missing_or_inexact");
    }

    const consumerNodes = [...nodes.values()].filter((node) => node.file === x64BodyFile &&
      node.name !== "X64BodyCopyMemoryByteCount" &&
      [...node.fn.calls].some((call) => call.slice(call.lastIndexOf(".") + 1) === "X64BodyCopyMemoryByteCount"));
    let rawConsumerAddition = false;
    for (const node of consumerNodes) {
      if (/\breturn\s+[^\n]*\+[^\n]*X64BodyCopyMemoryByteCount\s*\(/.test(node.fn.code) ||
          /\breturn\s+[^\n]*X64BodyCopyMemoryByteCount\s*\([^\n]*\+/.test(node.fn.code)) rawConsumerAddition = true;
      const aliases = [...node.fn.code.matchAll(/\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*X64BodyCopyMemoryByteCount\s*\([^)]*\)/g)].map((match) => match[1]);
      for (const alias of aliases) {
        const rawAliasAdd = new RegExp(`\\breturn\\s+[^\\n]*\\+[^\\n]*\\b${alias}\\b|\\breturn\\s+[^\\n]*\\b${alias}\\b[^\\n]*\\+`);
        if (rawAliasAdd.test(node.fn.code)) rawConsumerAddition = true;
      }
    }
    if (rawConsumerAddition) reasons.push("copy_memory_consumer_raw_addition_present");
    if (!opByteCountNode ||
        !/\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*X64BodyCopyMemoryByteCount\s*\(\s*byteCount\s*\)[\s\S]{0,240}?\breturn\s+X64BodyCheckedAddNonNegative\s*\(\s*16\s*,\s*\1\s*\)/.test(opByteCountNode.fn.code) ||
        !/\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*X64BodyCopyMemoryByteCount\s*\(\s*aggByteCount\s*\)[\s\S]{0,240}?\breturn\s+X64BodyCheckedAddNonNegative\s*\(\s*16\s*,\s*\1\s*\)/.test(opByteCountNode.fn.code)) {
      reasons.push("copy_memory_fixed_bytes_checked_add_missing");
    }
    if (!opByteCountNode ||
        !/\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*X64BodyCopyMemoryByteCount\s*\(\s*byteCount\s*\)[\s\S]{0,320}?\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*X64BodyCheckedAddNonNegative\s*\(\s*baseBytes\s*,\s*storeValueBytes\s*\)[\s\S]{0,160}?\breturn\s+X64BodyCheckedAddNonNegative\s*\(\s*\2\s*,\s*\1\s*\)/.test(opByteCountNode.fn.code)) {
      reasons.push("copy_memory_base_store_bytes_checked_add_missing");
    }
    if (!opByteCountNode ||
        !/\blet\s+(aggCopyLoad)\s*=\s*X64BodyIndexedAggregateValueCopyBytes\s*\([^)]*\)[\s\S]{0,180}?\blet\s+(addressAndBase)\s*=\s*X64BodyCheckedAddNonNegative\s*\(\s*addressBytes\s*,\s*8\s*\)[\s\S]{0,100}?\breturn\s+X64BodyCheckedAddNonNegative\s*\(\s*\2\s*,\s*\1\s*\)/.test(opByteCountNode.fn.code) ||
        !/\blet\s+(aggCopyStore)\s*=\s*X64BodyIndexedAggregateValueCopyBytes\s*\([^)]*\)[\s\S]{0,180}?\blet\s+(addressAndBase)\s*=\s*X64BodyCheckedAddNonNegative\s*\(\s*addressBytes\s*,\s*8\s*\)[\s\S]{0,100}?\breturn\s+X64BodyCheckedAddNonNegative\s*\(\s*\2\s*,\s*\1\s*\)/.test(opByteCountNode.fn.code)) {
      reasons.push("copy_memory_indexed_aggregate_checked_add_missing");
    }
    if (!copySlotNode ||
        !/\blet\s+copyParamBytes\s*=\s*X64BodyCopyMemoryByteCount\s*\(\s*slotSize\s*\)[\s\S]{0,120}?\bif\s+copyParamBytes\s*<=\s*0\s*:\s*return\s+copyParamBytes\b/.test(copySlotNode.fn.code) ||
        !/\bvar\s+copyParamExtra\s*=\s*0\b/.test(copySlotNode.fn.code) ||
        [...copySlotNode.fn.code.matchAll(/\bcopyParamExtra\s*=\s*X64BodyCheckedAddNonNegative\s*\(\s*copyParamExtra\s*,\s*X64BodySlotAccessBytes\s*\)/g)].length < 2 ||
        !/\breturn\s+X64BodyCheckedAddNonNegative\s*\(\s*copyParamExtra\s*,\s*copyParamBytes\s*\)/.test(copySlotNode.fn.code)) {
      reasons.push("copy_memory_copy_slot_checked_add_missing");
    }
    if (!copySlotNode ||
        !/\bif\s+slotSize\s*==\s*4\s*:\s*return\s+X64BodySlotAccessBytesForType\s*\(\s*coreir\.LocalI32Tag\s*\)\s*\*\s*2\b/.test(copySlotNode.fn.code) ||
        !/\bif\s+slotSize\s*%\s*8\s*==\s*0\s*:\s*return\s+x64BodyCheckedMul16\s*\(\s*slotSize\s*\/\s*8\s*\)/.test(copySlotNode.fn.code) ||
        !/\bif\s+slotSize\s*%\s*4\s*==\s*0\s*:\s*return\s+x64BodyCheckedMul14\s*\(\s*slotSize\s*\/\s*4\s*\)/.test(copySlotNode.fn.code) ||
        !/\breturn\s+x64BodyCheckedMul16\s*\(\s*slotSize\s*\)/.test(copySlotNode.fn.code)) {
      reasons.push("copy_slot_non_four_byte_count_contract_missing");
    }
    if (!indexedAggregateNode ||
        /\belemSize\s*%\s*4\s*!=\s*0\b/.test(indexedAggregateNode.fn.code) ||
        !/\bif\s+elemSize\s*<=\s*0\s*:\s*return\s+0\b/.test(indexedAggregateNode.fn.code) ||
        !/\breturn\s+X64BodyCopyMemoryByteCount\s*\(\s*elemSize\s*\)/.test(indexedAggregateNode.fn.code)) {
      reasons.push("indexed_aggregate_arbitrary_byte_copy_contract_missing");
    }
    if (!fillCopySlotNode) {
      reasons.push("copy_slot_fill_contract_missing");
    } else {
      const code = fillCopySlotNode.fn.code;
      const paramShapeIndex = code.indexOf("let copySrcParamAgg");
      const scalarFourIndex = code.indexOf("if slotSize == 4");
      if (paramShapeIndex < 0 || scalarFourIndex < 0 || paramShapeIndex >= scalarFourIndex ||
          !/\bif\s+slotSize\s*==\s*4\s*&&\s*!\s*copySrcParamAgg\s*&&\s*!\s*copyTgtParamAgg\s*:/.test(code)) {
        reasons.push("copy_slot_aggregate4_pointer_precedence_missing");
      }
      if (!/\bif\s+copySrcParamAgg\s*\|\|\s*copyTgtParamAgg\s*:[\s\S]{0,500}?\bif\s+slotSize\s*%\s*8\s*==\s*0\s*:[\s\S]{0,140}?\bcopyParamStride\s*=\s*8\b[\s\S]{0,140}?\belif\s+slotSize\s*%\s*4\s*==\s*0\s*:[\s\S]{0,140}?\bcopyParamStride\s*=\s*4\b[\s\S]{0,140}?\belse\s*:\s*copyParamStride\s*=\s*1\s*copyParamChunks\s*=\s*slotSize\b/.test(code) ||
          [...code.matchAll(/\bx64bLoad8\s*\([^)]*?sourceCursor\s*\)/g)].length < 3 ||
          [...code.matchAll(/\bx64bStore8\s*\([^)]*?targetCursor\s*\)/g)].length < 3 ||
          !/\bsourceCursor\s*=\s*X64BodyCheckedAddNonNegative\s*\(\s*sourceCursor\s*,\s*copyParamStride\s*\)/.test(code) ||
          !/\btargetCursor\s*=\s*X64BodyCheckedAddNonNegative\s*\(\s*targetCursor\s*,\s*copyParamStride\s*\)/.test(code)) {
        reasons.push("copy_slot_param_stride_8_4_1_contract_missing");
      }
      if (!/\bif\s+!\s*x64BodyCopyDisplacementRangeSupported\s*\(\s*sourceOffset\s*,\s*slotSize\s*\)\s*\|\|\s*!\s*x64BodyCopyDisplacementRangeSupported\s*\(\s*targetOffset\s*,\s*slotSize\s*\)\s*:\s*return\s+-1\b[\s\S]{0,320}?\bfor\s+copyIndex\s+in\s+0\.\.<slotSize\s*:[\s\S]{0,260}?\bx64bLoad8\s*\([^)]*?sourceCursor\s*\)[\s\S]{0,140}?\bx64bStore8\s*\([^)]*?targetCursor\s*\)[\s\S]{0,260}?\bsourceCursor\s*=\s*X64BodyCheckedAddNonNegative\s*\(\s*sourceCursor\s*,\s*1\s*\)[\s\S]{0,120}?\btargetCursor\s*=\s*X64BodyCheckedAddNonNegative\s*\(\s*targetCursor\s*,\s*1\s*\)/.test(code)) {
        reasons.push("copy_slot_local_arbitrary_byte_fill_contract_missing");
      }
    }
    if (!sretPairCountNode ||
        !/\bif\s+byteCount\s*%\s*8\s*==\s*0\s*:\s*return\s+byteCount\s*\/\s*8\b/.test(sretPairCountNode.fn.code) ||
        !/\bif\s+byteCount\s*%\s*4\s*==\s*0\s*:\s*return\s+byteCount\s*\/\s*4\b/.test(sretPairCountNode.fn.code) ||
        !/\breturn\s+byteCount\b/.test(sretPairCountNode.fn.code) ||
        !sretStrideNode ||
        !/\bif\s+byteCount\s*%\s*8\s*==\s*0\s*:\s*return\s+8\b/.test(sretStrideNode.fn.code) ||
        !/\bif\s+byteCount\s*%\s*4\s*==\s*0\s*:\s*return\s+4\b/.test(sretStrideNode.fn.code) ||
        !/\breturn\s+1\b/.test(sretStrideNode.fn.code)) {
      reasons.push("sret_exact_stride_8_4_1_classifier_missing");
    }
    if (!termSizeNode ||
        !/\blet\s+retCopyStride\s*=\s*X64ReturnSretCopyStride\s*\(\s*retCopyBytes\s*\)/.test(termSizeNode.fn.code) ||
        !/\bif\s+retCopyStride\s*==\s*4\s*:\s*retPerPair\s*=\s*14\b/.test(termSizeNode.fn.code) ||
        !/\bretPairBytes\s*=\s*x64BodyCheckedMul16\s*\(\s*retCopyPairs\s*\)/.test(termSizeNode.fn.code) ||
        !/\bretPairBytes\s*=\s*x64BodyCheckedMul14\s*\(\s*retCopyPairs\s*\)/.test(termSizeNode.fn.code)) {
      reasons.push("sret_stride_byte_count_mirror_missing");
    }
    if (!fillTermReturnNode) {
      reasons.push("sret_stride_fill_contract_missing");
    } else {
      const code = fillTermReturnNode.fn.code;
      if (!/\blet\s+copyStride\s*=\s*X64ReturnSretCopyStride\s*\(\s*retCopyBytes\s*\)/.test(code) ||
          !/\bif\s+copyStride\s*==\s*8\s*:/.test(code) ||
          !/\belif\s+copyStride\s*==\s*4\s*:/.test(code) ||
          !/\belse\s*:\s*for\s+copyIndex\s+in\s+0\.\.<retCopyPairs\s*:/.test(code) ||
          !/\bx64bLoad8\s*\([^)]*?sourceCursor\s*\)/.test(code) ||
          !/\bx64bStore8\s*\([^)]*?targetCursor\s*\)/.test(code) ||
          !/\bsourceCursor\s*=\s*X64BodyCheckedAddNonNegative\s*\(\s*sourceCursor\s*,\s*copyStride\s*\)/.test(code) ||
          !/\btargetCursor\s*=\s*X64BodyCheckedAddNonNegative\s*\(\s*targetCursor\s*,\s*copyStride\s*\)/.test(code)) {
        reasons.push("sret_stride_fill_contract_missing");
      }
    }

    if (!fillNode) {
      reasons.push("copy_memory_fill_missing");
    } else {
      const code = fillNode.fn.code;
      if (/\b(?:sourceOffset|targetOffset)\s*\+\s*copyIndex(?:\s*\*\s*(?:4|8))?\b/.test(code) ||
          /\b(?:sourceCursor|targetCursor)\s*\+\s*(?:1|4|8)\b/.test(code)) reasons.push("copy_memory_fill_raw_offset_arithmetic_present");
      if (!/\bif\s+!\s*X64BodyCopyMemoryRangeSupported\s*\(\s*sourceOffset\s*,\s*byteCount\s*\)\s*\|\|\s*!\s*X64BodyCopyMemoryRangeSupported\s*\(\s*targetOffset\s*,\s*byteCount\s*\)\s*:\s*return\s+-1\b/.test(code) ||
          !/\bvar\s+sourceCursor\s*=\s*sourceOffset\b/.test(code) ||
          !/\bvar\s+targetCursor\s*=\s*targetOffset\b/.test(code)) reasons.push("copy_memory_fill_range_precheck_missing");
      for (const stride of [8, 4, 1]) {
        const guard = stride === 1 ? "byteCount" : `byteCount\\s*\\/\\s*${stride}`;
        const cursorAdvance = new RegExp(`\\bif\\s+copyIndex\\s*\\+\\s*1\\s*<\\s*${guard}\\s*:\\s*sourceCursor\\s*=\\s*X64BodyCheckedAddNonNegative\\s*\\(\\s*sourceCursor\\s*,\\s*${stride}\\s*\\)\\s*targetCursor\\s*=\\s*X64BodyCheckedAddNonNegative\\s*\\(\\s*targetCursor\\s*,\\s*${stride}\\s*\\)\\s*if\\s+sourceCursor\\s*<\\s*0\\s*\\|\\|\\s*targetCursor\\s*<\\s*0\\s*:\\s*return\\s+-1\\b`);
        if (!cursorAdvance.test(code)) reasons.push(`copy_memory_fill_checked_cursor_stride_${stride}_missing`);
      }
      for (const [load, store] of [["x64bLoad64", "x64bStore64"], ["x64bLoad32", "x64bStore32"], ["x64bLoad8", "x64bStore8"]]) {
        if (!new RegExp(`\\b${load}\\s*\\([^)]*?sourceCursor\\s*\\)`).test(code) ||
            !new RegExp(`\\b${store}\\s*\\([^)]*?targetCursor\\s*\\)`).test(code)) reasons.push(`copy_memory_fill_checked_offsets_not_consumed_${load.slice(-2)}`);
      }
    }

    const evidenceNodes = new Map([checkedAddNode, checkedMul2Node, checkedMul4Node, checkedMul8Node, checkedMul14Node, checkedMul16Node, byteCountNode, displacementRangeNode, rangeNode, fillNode, copySlotNode, fillCopySlotNode, indexedAggregateNode, sretPairCountNode, sretStrideNode, termSizeNode, fillTermReturnNode, ...consumerNodes]
      .filter(Boolean).map((node) => [keyFor(node.file, node.name), node]));
    const functions = [...evidenceNodes.values()].map((node) => ({key: keyFor(node.file, node.name), sha256: sha256(Buffer.from(node.fn.raw, "utf8"))}))
      .sort((left, right) => left.key.localeCompare(right.key));
    const evidence = {
      family: "x64_copy_memory_checked_byte_count_and_offsets",
      reasons,
      file: x64BodyFile,
      functions,
      consumerKeys: consumerNodes.map((node) => keyFor(node.file, node.name)).sort(),
    };
    if (reasons.length > 0) {
      x64CopyMemoryCheckedArithmeticViolations.push(evidence);
      issues.push("x64_copy_memory_checked_arithmetic_contract_violation");
    } else {
      x64CopyMemoryCheckedArithmeticProofs.push({...evidence, proofStatus: "PROVEN"});
    }

    const wordsOfCheckedNode = nodes.get(keyFor(x64BodyFile, "X64BodyWordsOfChecked"));
    if (wordsOfCheckedNode) {
      const wordReasons = [];
      if (!/\bif\s+byteCount\s*<=\s*0\s*\|\|\s*byteCount\s*>\s*2147483644\s*:\s*return\s+0\b/.test(wordsOfCheckedNode.fn.code) ||
          !/\breturn\s*\(\s*byteCount\s*\+\s*3\s*\)\s*\/\s*4\b/.test(wordsOfCheckedNode.fn.code)) {
        wordReasons.push("word_count_padding_overflow_guard_missing_or_inexact");
      }
      const wordEvidence = {
        family: "x64_word_count_checked_padding",
        reasons: wordReasons,
        file: x64BodyFile,
        functions: [{key: keyFor(x64BodyFile, wordsOfCheckedNode.name), sha256: sha256(Buffer.from(wordsOfCheckedNode.fn.raw, "utf8"))}],
      };
      if (wordReasons.length > 0) {
        x64WordCountCheckedArithmeticViolations.push(wordEvidence);
        issues.push("x64_word_count_checked_padding_contract_violation");
      } else {
        x64WordCountCheckedArithmeticProofs.push({...wordEvidence, proofStatus: "PROVEN"});
      }
    }

    const f64ToXmmNode = nodes.get(keyFor(x64BodyFile, "x64bMovqXmm0FromRax"));
    const f64FromXmmNode = nodes.get(keyFor(x64BodyFile, "x64bMovqRaxFromXmm0"));
    const callResultF64Node = nodes.get(keyFor(x64BodyFile, "X64BodyCallResultIsF64"));
    const callAbiNode = nodes.get(keyFor(x64BodyFile, "X64BodyCallAbiSupported"));
    const entryAbiNode = nodes.get(keyFor(x64BodyFile, "X64BodyEntryAbiSupported"));
    const productionAdmissionNode = nodes.get(keyFor(x64BodyFile, "X64BodyProductionAdmission"));
    const callWordCountNode = nodes.get(keyFor(x64BodyFile, "X64BodyCallWordCount"));
    const fillCallNode = nodes.get(keyFor(x64BodyFile, "x64BodyFillCallOp"));
    if (f64ToXmmNode || f64FromXmmNode || callResultF64Node || callAbiNode || entryAbiNode) {
      const f64Reasons = [];
      const exactMovqBytes = (node, finalOpcode) => {
        if (!node) return false;
        const bytes = [...node.fn.code.matchAll(/\bx64bPut8\s*\(\s*words\s*,\s*(?:posRaw|pos)\s*,\s*0x([0-9A-Fa-f]+)\s*\)/g)].map((match) => Number.parseInt(match[1], 16));
        return bytes.length === 5 && bytes.every((value, index) => value === [0x66, 0x48, 0x0F, finalOpcode, 0xC0][index]);
      };
      if (!/\bconst\s+X64BodyF64ReturnBridgeBytes\s*=\s*5\b/.test(files.get(x64BodyFile).text) ||
          !exactMovqBytes(f64ToXmmNode, 0x6E) || !exactMovqBytes(f64FromXmmNode, 0x7E)) {
        f64Reasons.push("f64_xmm0_rax_exact_encoding_contract_missing");
      }
      if (!callResultF64Node ||
          !/\bcall\.resultSlot\s*>=\s*0\b[\s\S]*?\bcall\.resultSlot\s*<\s*bodyIR\.localSlots\.len\b[\s\S]*?\bbodyIR\.localSlots\s*\[\s*call\.resultSlot\s*\]\.typeKind\s*==\s*coreir\.LocalF64Tag\b/.test(callResultF64Node.fn.code)) {
        f64Reasons.push("f64_call_result_classifier_missing_or_inexact");
      }
      if (!callAbiNode ||
          !/\bif\s+!\s*call\.targetIsImportc\s*:\s*return\s+true\b/.test(callAbiNode.fn.code) ||
          !/\bfor\s+argIndex\s+in\s+0\.\.<call\.argSlots\.len\s*:[\s\S]{0,180}?\blet\s+argSlot\s*=\s*call\.argSlots\s*\[\s*argIndex\s*\][\s\S]{0,220}?\bbodyIR\.localSlots\s*\[\s*argSlot\s*\]\.typeKind\s*==\s*coreir\.LocalF64Tag\s*:\s*return\s+false\b/.test(callAbiNode.fn.code) ||
          !/\breturn\s+true\b/.test(callAbiNode.fn.code)) {
        f64Reasons.push("importc_f64_argument_fail_closed_contract_missing");
      }
      if (!entryAbiNode) {
        f64Reasons.push("entry_c_abi_f64_parameter_fail_closed_contract_missing");
        f64Reasons.push("entry_c_abi_f64_return_not_explicitly_allowed");
      } else {
        const code = entryAbiNode.fn.code;
        if (!/\bif\s+!\s*bodyIR\.entryIsCAbi\s*:\s*return\s+true\b/.test(code) ||
            !/\bfor\s+slotIndex\s+in\s+0\.\.<bodyIR\.localSlots\.len\s*:\s*if\s+x64BodyLocalIsParam\s*\(\s*bodyIR\.localSlots\s*\[\s*slotIndex\s*\]\s*\)\s*&&\s*bodyIR\.localSlots\s*\[\s*slotIndex\s*\]\.typeKind\s*==\s*coreir\.LocalF64Tag\s*:\s*return\s+false\b/.test(code) ||
            !/\breturn\s+true\b/.test(code)) {
          f64Reasons.push("entry_c_abi_f64_parameter_fail_closed_contract_missing");
        }
        if (/\b(?:resultSlot|BodyTermReturnTag)\b/.test(code) ||
            /\bif\s+bodyIR\.localSlots\s*\[\s*slotIndex\s*\]\.typeKind\s*==\s*coreir\.LocalF64Tag\s*:\s*return\s+false\b/.test(code)) {
          f64Reasons.push("entry_c_abi_f64_return_not_explicitly_allowed");
        }
      }
      if (!productionAdmissionNode ||
          !/\bif\s+!\s*X64BodyValidateFrameLayout\s*\(\s*bodyIR\s*\)\s*\|\|\s*!\s*X64BodyEntryAbiSupported\s*\(\s*bodyIR\s*\)\s*:\s*return\s+false\b/.test(productionAdmissionNode.fn.code)) {
        f64Reasons.push("entry_c_abi_admission_not_bound_to_production_gate");
      }
      if (!productionAdmissionNode ||
          !/\bfor\s+callIndex\s+in\s+0\.\.<bodyIR\.callSequence\.len\s*:\s*if\s+!\s*X64BodyCallAbiSupported\s*\(\s*bodyIR\s*,\s*bodyIR\.callSequence\s*\[\s*callIndex\s*\]\s*\)\s*:\s*return\s+false\b/.test(productionAdmissionNode.fn.code)) {
        f64Reasons.push("f64_abi_admission_not_bound_to_all_calls");
      }
      for (const callerName of ["X64BodyComputePlan", "X64BodyIrWordCount", "X64BodyFillWords"]) {
        const caller = nodes.get(keyFor(x64BodyFile, callerName));
        if (!caller || !new RegExp(`\\bif\\s+!\\s*X64BodyProductionAdmission\\s*\\(\\s*bodyIR\\s*\\)\\s*:`).test(caller.fn.code)) {
          f64Reasons.push(`f64_production_admission_missing_${callerName}`);
        }
      }
      if (!callWordCountNode ||
          !/\bvar\s+resultWords\s*=\s*2\b[\s\S]{0,120}?\bif\s+X64BodyCallResultIsF64\s*\(\s*bodyIR\s*,\s*call\s*\)\s*:\s*resultWords\s*=\s*4\b[\s\S]{0,100}?\bcount\s*=\s*X64BodyCheckedAddNonNegative\s*\(\s*count\s*,\s*resultWords\s*\)/.test(callWordCountNode.fn.code)) {
        f64Reasons.push("f64_call_result_byte_predictor_bridge_missing");
      }
      if (!fillCallNode) {
        f64Reasons.push("f64_call_result_xmm0_to_rax_home_bridge_missing");
      } else {
        const code = fillCallNode.fn.code;
        const classifierIndex = code.indexOf("X64BodyCallResultIsF64");
        const bridgeIndex = code.indexOf("x64bMovqRaxFromXmm0");
        const storeIndex = code.indexOf("x64BodyStoreRegToSlot", bridgeIndex);
        if (classifierIndex < 0 || bridgeIndex <= classifierIndex || storeIndex <= bridgeIndex ||
            !/\bresultBytes\s*=\s*16\b/.test(code) ||
            !/\bx64bPadTo\s*\(\s*words\s*,\s*pos\s*,\s*resStorePos\s*\+\s*resultBytes\s*\)/.test(code)) {
          f64Reasons.push("f64_call_result_xmm0_to_rax_home_bridge_missing");
        }
      }
      if (!termSizeNode ||
          !/\bif\s+resultType\s*==\s*coreir\.LocalF64Tag\s*:\s*f64BridgeBytes\s*=\s*X64BodyF64ReturnBridgeBytes\b/.test(termSizeNode.fn.code) ||
          !/\bX64BodyCheckedAddNonNegative\s*\([^)]*?f64BridgeBytes\s*\)/.test(termSizeNode.fn.code)) {
        f64Reasons.push("f64_return_byte_predictor_bridge_missing");
      }
      if (!fillTermReturnNode) {
        f64Reasons.push("f64_return_rax_to_xmm0_bridge_missing");
      } else {
        const code = fillTermReturnNode.fn.code;
        const loadIndex = code.indexOf("x64BodyResLoad");
        const bridgeIndex = code.indexOf("x64bMovqXmm0FromRax", loadIndex);
        const epilogueIndex = code.indexOf("x64bFillEpilogue", bridgeIndex);
        if (loadIndex < 0 || bridgeIndex <= loadIndex || epilogueIndex <= bridgeIndex ||
            !/\bif\s+resultType\s*==\s*coreir\.LocalF64Tag\s*:/.test(code)) {
          f64Reasons.push("f64_return_rax_to_xmm0_bridge_missing");
        }
      }
      const f64Nodes = [f64ToXmmNode, f64FromXmmNode, callResultF64Node, callAbiNode, entryAbiNode, productionAdmissionNode, callWordCountNode, fillCallNode, termSizeNode, fillTermReturnNode]
        .filter(Boolean);
      const f64Evidence = {
        family: "x64_f64_xmm0_return_and_call_result_bridge",
        reasons: f64Reasons,
        file: x64BodyFile,
        functions: f64Nodes.map((node) => ({key: keyFor(node.file, node.name), sha256: sha256(Buffer.from(node.fn.raw, "utf8"))})).sort((left, right) => left.key.localeCompare(right.key)),
      };
      if (f64Reasons.length > 0) {
        x64F64AbiContractViolations.push(f64Evidence);
        issues.push("x64_f64_abi_contract_violation");
      } else {
        x64F64AbiContractProofs.push({...f64Evidence, proofStatus: "PROVEN"});
      }
    }
  }

  const postSealHardcodedSemanticWalkerLimits = [];
  const allowedPhysicalCounters = new Map(SEMANTIC_NUMERIC_LIMIT_PHYSICAL_ALLOWLIST.map((entry) => [entry.counter, entry.family]));
  const semanticCounterKind = (counter) => {
    const base = counter.slice(counter.lastIndexOf(".") + 1);
    if (/depth|hops|guard/i.test(base)) return "recursive_depth_or_guard";
    if (/^(?:extendCount|scanCount|walkerCount)$/i.test(base)) return "source_or_semantic_scan_count";
    if (/(?:Nodes|NodeCount|PieceCount)$/i.test(base)) return "semantic_node_collection";
    if (/^seqLit(?:Probe|Elem)Count$/i.test(base)) return "semantic_sequence_literal_cardinality";
    if (/^(?:closure|fixedPoint)(?:Pass|Round|Iteration)$/i.test(base)) return "fixed_point_round_cap";
    if (/^(?:segCount|segmentCount|chainCount|fieldChainCount)$/i.test(base)) return "semantic_cardinality";
    return null;
  };
  const recordSemanticLimit = (node, match, counter, limit, kind) => {
    const relativeLine = node.fn.code.slice(0, match.index).split("\n").length;
    postSealHardcodedSemanticWalkerLimits.push({key: keyFor(node.file, node.name), line: node.fn.line + relativeLine - 1, counter, limit, kind, reachable: entryForwardReachable.has(keyFor(node.file, node.name))});
  };
  for (const node of nodes.values()) {
    if (!POST_SEAL_LEGACY_SCANNER_FILES.has(node.file) && node.file !== TYPED_EXPR_SOURCE_RELATIVE) continue;
    for (const match of node.fn.code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)(?:\.len)?\s*(<|<=|>|>=)\s*([0-9]+)\b/g)) {
      const counter = match[1];
      const base = counter;
      if (allowedPhysicalCounters.has(base)) continue;
      const kind = semanticCounterKind(counter);
      const limit = Number(match[3]);
      if (!kind || limit <= 1) continue;
      const operator = match[2];
      const isForwardWalker = kind === "recursive_depth_or_guard" || kind === "source_or_semantic_scan_count";
      if ((operator === "<" || operator === "<=") && !isForwardWalker) continue;
      recordSemanticLimit(node, match, counter, limit, kind);
    }
    for (const match of node.fn.code.matchAll(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+0\.\.<\s*([0-9]+)\b/g)) {
      const counter = match[1];
      if (allowedPhysicalCounters.has(counter)) continue;
      const kind = semanticCounterKind(counter);
      const limit = Number(match[2]);
      if (!kind || limit <= 1) continue;
      recordSemanticLimit(node, match, counter, limit, kind === "recursive_depth_or_guard" ? "bounded_semantic_range_depth" : kind);
    }
  }
  const semanticLimitUnique = new Map(postSealHardcodedSemanticWalkerLimits.map((entry) => [`${entry.key}:${entry.line}:${entry.counter}:${entry.limit}:${entry.kind}`, entry]));
  postSealHardcodedSemanticWalkerLimits.length = 0;
  postSealHardcodedSemanticWalkerLimits.push(...semanticLimitUnique.values());
  postSealHardcodedSemanticWalkerLimits.sort((left, right) => left.key.localeCompare(right.key) || left.line - right.line || left.counter.localeCompare(right.counter));
  if (postSealHardcodedSemanticWalkerLimits.length > 0) issues.push("post_seal_hardcoded_semantic_walker_limit_present");
  if (forbiddenReachability.length > 0) issues.push("authority_production_consumer_reaches_source_io_or_legacy_scanner");
  if (unresolvedImportedReachability.length > 0) issues.push("authority_reachable_imported_call_edge_unresolved");
  if (unresolvedUnqualifiedReachability.length > 0) issues.push("authority_reachable_unqualified_exported_call_edge_unresolved_or_ambiguous");
  if (entryForwardForbiddenReachability.length > 0) issues.push("pipeline_entry_side_branch_reaches_unbound_source_io_or_legacy_scanner");
  if (entryForwardUnresolvedReachability.length > 0) issues.push("pipeline_entry_side_branch_has_unresolved_imported_call_edge");
  if (entryForwardUnqualifiedReachability.length > 0) issues.push("pipeline_entry_side_branch_has_unresolved_or_ambiguous_unqualified_exported_call_edge");

  const oddHitFunctions = [
    ["src/core/backend/lowering_plan.cheng", "LoweringTypedGlobalTypeForName"],
    ["src/core/backend/primary_object_plan.cheng", "PrimaryBodyIrTypedGlobalType"],
    ["src/core/backend/primary_object_plan.cheng", "PrimaryBodyIrTypedGlobalSlotName"],
    ["src/core/backend2/backend2_lower_util.cheng", "PrimaryBodyIrTypedGlobalType"],
    ["src/core/backend2/backend2_lower_util.cheng", "PrimaryBodyIrTypedGlobalSlotName"],
  ];
  const oddHitHeuristics = [];
  for (const [file, name] of oddHitFunctions) {
    const node = nodes.get(keyFor(file, name));
    if (node && /nonExactCount\s*%\s*2\s*==\s*1/.test(node.fn.code) && /maxNonExact/.test(node.fn.code)) oddHitHeuristics.push(`${file}#${name}`);
  }
  if (oddHitHeuristics.length > 0) issues.push("odd_hit_take_last_global_type_heuristic_present");

  const oneLayerFunctions = [
    ["src/core/backend/lowering_plan.cheng", "LoweringTypeTextResolvesToFnPtr"],
    ["src/core/backend/primary_object_plan.cheng", "PrimaryBodyIrResolvedFnPtrDeclType"],
  ];
  const oneLayerAliasHeuristics = [];
  for (const [file, name] of oneLayerFunctions) {
    const node = nodes.get(keyFor(file, name));
    if (node && [...node.fn.calls].some((call) => call.endsWith("TypedExprIrLookupTypeDefAliasTargetType"))) oneLayerAliasHeuristics.push(`${file}#${name}`);
  }
  if (oneLayerAliasHeuristics.length > 0) issues.push("one_layer_alias_resolution_heuristic_present");
  const uniqueForbidden = [...new Set(forbiddenReachability)].sort();
  const uniqueUnresolved = [...new Set(unresolvedImportedReachability)].sort();
  const uniqueUnresolvedUnqualified = [...new Set(unresolvedUnqualifiedReachability)].sort();
  const uniqueEntryForwardForbidden = [...new Set(entryForwardForbiddenReachability)].sort();
  const uniqueEntryForwardUnresolved = [...new Set(entryForwardUnresolvedReachability)].sort();
  const uniqueEntryForwardUnqualified = [...new Set(entryForwardUnqualifiedReachability)].sort();
  const fileEvidence = actualFiles.map((file) => ({path: file, sha256: files.get(file).sha256, functionCount: files.get(file).functions.size}));
  return {
    status: issues.length === 0 ? "GREEN" : "RED",
    reason: issues.length === 0 ? "source-wide post-seal invariants pass; reachability fields are bounded syntactic evidence, not compiler-resolved call authority" : issues.join(","),
    schema: "cheng_regalloc_authority_production_closure",
    productionRoots: exactRootFiles,
    requiredBackend2PipelineRoot: BACKEND2_PIPELINE_AUTHORITY_ROOT,
    fileCount: actualFiles.length,
    functionCount: nodes.size,
    edgeCount: [...nodes.values()].reduce((count, node) => count + node.edges.size, 0),
    closureSha256: sha256(Buffer.from(JSON.stringify(fileEvidence), "utf8")),
    files: fileEvidence,
    forbiddenReachability: uniqueForbidden,
    unresolvedImportedReachability: uniqueUnresolved,
    unresolvedUnqualifiedReachability: uniqueUnresolvedUnqualified,
    entryForwardForbiddenReachability: uniqueEntryForwardForbidden,
    entryForwardUnresolvedReachability: uniqueEntryForwardUnresolved,
    entryForwardUnqualifiedReachability: uniqueEntryForwardUnqualified,
    legacyScannerExistence,
    legacyReexportScannerExistence,
    exactPostSealForbiddenExistence,
    exactPostSealForbiddenReachability,
    postSealRawBuildIndexMetadataCalls,
    postSealRawBuildIndexReads,
    postSealNamedFieldMetadataDirectCalls,
    postSealOwnerlessMetadataCalls,
    postSealOwnerLeafMetadataFallbacks,
    postSealColdCsgFieldLayoutFallbacks,
    typedExprOwnerRequiredIndexContractViolations,
    postSealAnySourceGlobalUniqueUses,
    postSealCalleeOwnerFallbacks,
    postSealAbiUnknownWidthFallbacks,
    postSealExactOwnerAmbiguityFallbacks,
    parserOwningMergeBorrowContractViolations,
    typedExprExactSourceRecoveryFunctions,
    typedExprExactSourceRecoveryCallers,
    typedExprResultIntrinsicSourceRecovery,
    postSealFixedMetadataTextCaps,
    postSealDynamicSemanticWorklistCaps,
    postSealProgramDerivedEncodingRejectCaps,
    postSealProgramDerivedEncodingCapUnproven,
    postSealProgramDerivedEncodingCapProofs,
    postSealPredictorFillerMirrorViolations,
    bodyIrEntryCAbiMetadataContractViolations,
    bodyIrEntryCAbiMetadataContractProofs,
    regallocAdapterF64ContractViolations,
    regallocAdapterF64ContractProofs,
    x64CopyMemoryCheckedArithmeticViolations,
    x64CopyMemoryCheckedArithmeticProofs,
    x64F64AbiContractViolations,
    x64F64AbiContractProofs,
    x64WordCountCheckedArithmeticViolations,
    x64WordCountCheckedArithmeticProofs,
    postSealHardcodedSemanticWalkerLimits,
    semanticNumericLimitPhysicalAllowlist: SEMANTIC_NUMERIC_LIMIT_PHYSICAL_ALLOWLIST,
    analysisCompleteness,
    operatorFunctionDeclarations,
    fmtInterpolationExpressions,
    fmtInterpolationErrors,
    rootDerivation: {
      pipelineEntries,
      authorityAnchors,
      frozenMetadataSelfAuditAnchors,
      realizerAuthorityAnchors,
      entriesReachingAuthorityAnchors: entryAnchorReachability.filter((entry) => entry.reachableAnchors.length > 0).map((entry) => entry.entry),
      entryAnchorReachability,
      requiredAnchorsByEntryKind,
      disconnectedEntries,
      reverseAuthorityNodeCount: reverseAuthorityClosure.size,
      forwardAuthorityNodeCount: forwardReachable.size,
      entryForwardNodeCount: entryForwardReachable.size,
      entryForwardSinkNodes,
      entryForwardUnresolvedNodes,
      entryForwardUnqualifiedNodes,
      legalSourceIoBindings,
      derivedRoots: derivedRootKeys,
      conservativeOperatorForbiddenReachabilityRoots: conservativeOperatorRootKeys,
    },
    oddHitHeuristics,
    oneLayerAliasHeuristics,
    issues,
  };
}

function projectionFields(text) {
  const lines = lexChengSource(text).code.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^(\s*)typedExprFrozenMetadataProjection\s*=\s*ref\s*$/);
    if (!match) continue;
    const base = match[1].length;
    const fields = [];
    for (let row = index + 1; row < lines.length; row++) {
      if (lines[row].trim() === "") continue;
      const indent = lines[row].match(/^\s*/)[0].length;
      if (indent <= base) break;
      const field = lines[row].match(/^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (field) fields.push(field[1]);
    }
    return fields;
  }
  return [];
}

function validateTypedExprFrozenAuthority(raw, sourcePath = TYPED_EXPR_SOURCE_RELATIVE, productionSources = null, productionRootFiles = null) {
  let text;
  if (typeof raw === "string") text = raw;
  else {
    try { text = new TextDecoder("utf-8", {fatal: true}).decode(raw); }
    catch (error) { throw new Error(`TypedExpr authority source must be UTF-8: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const functions = chengFunctions(text);
  const allFields = projectionFields(text);
  const moduleFields = allFields.filter((field) => field.toLowerCase().includes("moduleconst"));
  const issues = [];
  const closure = {};
  const forbidden = [];
  const requiredFieldRoles = {
    context_start: /start/i,
    context_count: /count/i,
    name: /name/i,
    literal: /literal/i,
  };
  for (const [role, pattern] of Object.entries(requiredFieldRoles)) {
    if (!moduleFields.some((field) => pattern.test(field))) issues.push(`projection_module_const_${role}_field_missing`);
  }

  const reachable = (root) => {
    const visited = new Set();
    const queue = [root];
    const calls = new Set();
    const members = new Set();
    const identifiers = new Set();
    const strings = new Set();
    while (queue.length > 0) {
      const name = queue.shift();
      if (visited.has(name)) continue;
      visited.add(name);
      const fn = functions.get(name);
      if (!fn) continue;
      for (const call of fn.calls) {
        calls.add(call);
        if (!call.includes(".") && functions.has(call) && !visited.has(call)) queue.push(call);
      }
      for (const member of fn.members) members.add(member);
      for (const identifier of fn.identifiers) identifiers.add(identifier);
      for (const value of fn.strings) strings.add(value);
    }
    return {visited, calls, members, identifiers, strings};
  };

  const roots = {
    build: "typedExprBuildFrozenMetadataProjection",
    schema: "typedExprFrozenProjectionSchemaExact",
    digest: "typedExprFrozenCanonicalDigest",
    live_bytes: "typedExprFrozenProjectionLiveBytes",
    release: "typedExprReleaseFrozenMetadataProjection",
    materialize: "typedExprFrozenMaterializeContext",
    expected_rows: "typedExprFrozenExpectedCanonicalRowsExact",
  };
  for (const [role, root] of Object.entries(roots)) {
    if (!functions.has(root)) {
      issues.push(`${role}_function_missing`);
      continue;
    }
    const graph = reachable(root);
    const referenced = moduleFields.filter((field) => graph.members.has(`projection.${field}`));
    closure[role] = {root, reachableFunctions: graph.visited.size, moduleConstFields: referenced};
    for (const field of moduleFields) if (!referenced.includes(field)) issues.push(`${role}_missing_${field}`);
    if (role === "expected_rows") {
      if (!graph.strings.has("ctx_module_const_source")) issues.push("expected_rows_missing_ctx_module_const_source");
      for (const legacy of ["module_const", "module_const_scanned"]) if (graph.strings.has(legacy)) issues.push(`expected_rows_legacy_${legacy}_forbidden`);
    }
  }

  const authorityRoots = [
    "TypedExprModuleConstLiteralForContext",
    ...Object.values(roots),
  ];
  for (const root of authorityRoots) {
    if (!functions.has(root)) {
      issues.push(`authority_root_missing_${root}`);
      continue;
    }
    const graph = reachable(root);
    for (const call of graph.calls) {
      const leaf = call.slice(call.lastIndexOf(".") + 1);
      if (call === "os.ReadFile" || leaf === "ReadTextFile" || leaf === "TypedExprScanSourceFunctionReturnType") {
        const row = `${root}->${call}`;
        if (!forbidden.includes(row)) forbidden.push(row);
      }
    }
  }
  if (forbidden.length > 0) issues.push("sealed_authority_reaches_source_io_or_legacy_scan");

  if (functions.has("TypedExprModuleConstLiteralForContext")) {
    const query = reachable("TypedExprModuleConstLiteralForContext");
    if (!query.strings.has("ctx_module_const_source")) issues.push("module_const_query_missing_canonical_ctx_module_const_source");
    if (![...query.calls].some((call) => call.slice(call.lastIndexOf(".") + 1).startsWith("TypedExprBuildIndexLookup"))) issues.push("module_const_query_missing_canonical_build_index_lookup");
    for (const legacy of ["module_const", "module_const_scanned"]) if (query.strings.has(legacy)) issues.push(`module_const_query_legacy_${legacy}_forbidden`);
  }
  if (functions.has("typedExprFrozenMaterializeContext")) {
    const materialize = reachable("typedExprFrozenMaterializeContext");
    for (const field of ["moduleConstNames", "moduleConstLiterals", "moduleConstScanned"]) {
      if (![...materialize.members].some((member) => member.endsWith(`.${field}`))) issues.push(`materialize_context_missing_${field}`);
    }
  }
  for (const legacyFunction of ["TypedExprFunctionHeaderScanContext", "TypedExprScanSourceFunctionReturnType"]) {
    if (functions.has(legacyFunction)) issues.push(`legacy_function_header_function_present_${legacyFunction}`);
  }
  const wholeLexical = lexChengSource(text);
  if (!wholeLexical.strings.includes("ctx_module_const_source")) issues.push("canonical_ctx_module_const_source_key_absent");
  for (const legacyKey of ["module_const", "module_const_scanned"]) {
    if (wholeLexical.strings.includes(legacyKey)) issues.push(`legacy_module_const_key_present_${legacyKey}`);
  }
  const wholeIdentifiers = new Set([...wholeLexical.code.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)].map((match) => match[0]));
  for (const legacyField of ["functionHeaderScanned", "functionHeaderLookup", "functionHeaderNames", "functionHeaderReturnTypes"]) {
    if (wholeIdentifiers.has(legacyField)) issues.push(`legacy_function_header_cache_field_present_${legacyField}`);
  }
  for (const legacyKey of ["function_header_scanned", "function_header_return"]) {
    if (wholeLexical.strings.includes(legacyKey)) issues.push(`legacy_function_header_cache_key_present_${legacyKey}`);
  }

  let productionClosure = null;
  if (productionSources) {
    try {
      productionClosure = validateAuthorityProductionClosure(productionSources, true, productionRootFiles || AUTHORITY_MINIMUM_REQUIRED_FILES);
      for (const issue of productionClosure.issues) if (!issues.includes(issue)) issues.push(issue);
      for (const row of productionClosure.forbiddenReachability) if (!forbidden.includes(row)) forbidden.push(row);
    } catch (error) {
      const reason = `authority_production_closure_invalid:${error instanceof Error ? error.message : String(error)}`;
      issues.push(reason);
      productionClosure = {status: "CFAIL", reason};
    }
  }

  return {
    status: issues.length === 0 ? "GREEN" : "RED",
    reason: issues.length === 0 ? "frozen TypedExpr metadata self-audit is projection-only and production realizers reach canonical read-only TypedExprIr authority" : issues.join(","),
    sourcePath,
    sourceSha256: sha256(Buffer.from(text, "utf8")),
    functionCount: functions.size,
    projectionFieldCount: allFields.length,
    projectionModuleConstFields: moduleFields,
    forbiddenReachability: forbidden,
    closure,
    productionClosure,
    issues,
  };
}

function walkRegularFiles(root, label) {
  const out = [];
  const walk = (directory) => {
    const entries = readdirSync(directory, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const stat = lstatSync(path);
      if (entry.isSymbolicLink() || stat.isSymbolicLink()) throw new Error(`${label} contains a symlink: ${path}`);
      if (entry.isDirectory() && stat.isDirectory()) walk(path);
      else if (entry.isFile() && stat.isFile()) out.push(path);
      else throw new Error(`${label} contains a non-regular entry: ${path}`);
    }
  };
  walk(root);
  return out;
}

function cLocalIncludes(raw, path) {
  let text;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(raw); }
  catch (error) { throw new Error(`C include input must be UTF-8: ${path}: ${error instanceof Error ? error.message : String(error)}`); }
  const clean = new Array(text.length).fill(" ");
  let index = 0;
  let blockComment = false;
  while (index < text.length) {
    if (blockComment) {
      if (text[index] === "*" && text[index + 1] === "/") { blockComment = false; index += 2; continue; }
      if (text[index] === "\n") clean[index] = "\n";
      index++;
      continue;
    }
    if (text[index] === "/" && text[index + 1] === "*") { blockComment = true; index += 2; continue; }
    if (text[index] === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") index++;
      continue;
    }
    if (text[index] === '"' || text[index] === "'") {
      const quote = text[index];
      clean[index] = text[index++];
      while (index < text.length) {
        clean[index] = text[index];
        if (text[index] === "\\" && index + 1 < text.length) {
          clean[++index] = text[index];
          index++;
          continue;
        }
        if (text[index++] === quote) break;
      }
      continue;
    }
    clean[index] = text[index];
    index++;
  }
  if (blockComment) throw new Error(`C include input has an unterminated block comment: ${path}`);
  const includes = [];
  for (const [lineIndex, line] of clean.join("").split("\n").entries()) {
    const match = line.match(/^\s*#\s*include\s*"([^"]+)"\s*$/);
    if (!match && /^\s*#\s*include\s*"/.test(line)) throw new Error(`malformed C local include: ${path}:${lineIndex + 1}`);
    if (!match) continue;
    if (!/^[A-Za-z0-9_.-]+$/.test(match[1])) throw new Error(`C local include must be one canonical basename: ${path}:${lineIndex + 1}: ${match[1]}`);
    includes.push({name: match[1], line: lineIndex + 1});
  }
  return includes;
}

function validateCIncludeClosure(fixtureSnapshot, bootstrapSnapshots) {
  const allowed = new Set(C_BOOTSTRAP_INCLUDE_FILES);
  if (bootstrapSnapshots.size !== allowed.size) throw new Error("C bootstrap include closure cardinality mismatch");
  const fixtureKey = "fusion/bodyir_packed_slab_contract.c";
  const rows = new Map([[fixtureKey, fixtureSnapshot], ...bootstrapSnapshots]);
  const edges = [];
  for (const [from, snapshot] of rows) {
    for (const include of cLocalIncludes(snapshot.raw, snapshot.path)) {
      if (!allowed.has(include.name)) throw new Error(`C include closure contains an undeclared local dependency: ${from}:${include.line} -> ${include.name}`);
      edges.push({from, to: include.name, line: include.line});
    }
  }
  const reachable = new Set([fixtureKey]);
  const queue = [fixtureKey];
  while (queue.length > 0) {
    const from = queue.shift();
    for (const edge of edges) {
      if (edge.from !== from || reachable.has(edge.to)) continue;
      reachable.add(edge.to);
      queue.push(edge.to);
    }
  }
  const missing = C_BOOTSTRAP_INCLUDE_FILES.filter((name) => !reachable.has(name));
  if (missing.length > 0) throw new Error(`C include closure fixed list contains unreachable files: ${missing.join(",")}`);
  return {fileCount: reachable.size, edgeCount: edges.length, files: [...reachable].sort(), edges: edges.sort((left, right) => left.from.localeCompare(right.from) || left.line - right.line || left.to.localeCompare(right.to))};
}

function validateRemovedBackend2IndependentEmitterModules(treeRoot) {
  const absences = [];
  for (const relativePath of REMOVED_BACKEND2_INDEPENDENT_EMITTER_MODULES) {
    const removedPath = join(treeRoot, relativePath);
    try {
      lstatSync(removedPath);
      throw new Error(
        `removed independent backend2 emitter module is present: ${relativePath}`,
      );
    } catch (error) {
      if (error && error.code === "ENOENT") {
        absences.push({
          label: `removed/${relativePath}`,
          path: removedPath,
        });
        continue;
      }
      throw error;
    }
  }
  return absences;
}

function snapshotSourceInputs(treeRoot, explicitInputs = {}) {
  const sourceRoot = join(treeRoot, "src");
  canonicalAbsolute(sourceRoot, "treeRoot/src", "dir");
  const modules = new Map();
  for (const path of walkRegularFiles(sourceRoot, "treeRoot/src")) {
    if (!path.endsWith(".cheng")) continue;
    const moduleName = relative(sourceRoot, path).slice(0, -".cheng".length).split("\\").join("/");
    if (modules.has(moduleName)) throw new Error(`duplicate Cheng module path: ${moduleName}`);
    modules.set(moduleName, path);
    modules.set(`cheng/${moduleName}`, path);
  }
  const queue = [
    {name: "fusion/regalloc_source_contract", path: CHENG_FIXTURE, label: "fusion/regalloc_source_contract.cheng"},
    ...TYPED_EXPR_MATRIX.map((entry) => ({name: `fusion/${entry.file.slice(0, -".cheng".length)}`, path: entry.path, label: `fusion/${entry.file}`})),
  ];
  const visited = new Set();
  const snapshots = [];
  const absences =
    validateRemovedBackend2IndependentEmitterModules(treeRoot);
  const snapshotPaths = new Map();
  const addSnapshot = (path, label, detail) => {
    const prior = snapshotPaths.get(path);
    if (prior) return prior;
    const snap = {label, ...stableSnapshot(path, detail)};
    snapshots.push(snap);
    snapshotPaths.set(path, snap);
    return snap;
  };
  const addOptionalSnapshot = (path, label, detail) => {
    try {
      lstatSync(path);
      canonicalAbsolute(path, detail, "file");
      return addSnapshot(path, label, detail);
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
      absences.push({label, path});
      return null;
    }
  };

  canonicalAbsolute(FUSION_ROOT, "Fusion package root", "dir");
  addSnapshot(join(FUSION_ROOT, "package.json"), "fusion/package.json", "Fusion package.json");
  addOptionalSnapshot(join(FUSION_ROOT, "bun.lock"), "fusion/bun.lock", "Fusion bun.lock");
  addSnapshot(join(FUSION_ROOT, "index.ts"), "fusion/index.ts", "Fusion MCP entry");
  addSnapshot(join(FUSION_ROOT, "cli.ts"), "fusion/cli.ts", "Fusion CLI entry");
  const fusionSourceRoot = join(FUSION_ROOT, "src");
  canonicalAbsolute(fusionSourceRoot, "Fusion src", "dir");
  const fusionSourceFiles = walkRegularFiles(fusionSourceRoot, "Fusion src");
  for (const path of fusionSourceFiles) {
    if (!path.endsWith(".ts")) throw new Error(`Fusion src closure contains a non-TypeScript file: ${path}`);
    addSnapshot(path, `fusion/${relative(FUSION_ROOT, path).split("\\").join("/")}`, `Fusion source ${path}`);
  }
  const fusionToolRoot = join(FUSION_ROOT, "tools");
  canonicalAbsolute(fusionToolRoot, "Fusion tools", "dir");
  const formalReceiptToolFiles =
    walkRegularFiles(fusionToolRoot, "Fusion formal receipt tools");
  for (const path of formalReceiptToolFiles) {
    addSnapshot(
      path,
      `fusion/${relative(FUSION_ROOT, path).split("\\").join("/")}`,
      `Fusion formal receipt tool ${path}`,
    );
  }
  const formalReceiptSourcePlanRoot =
    join(FUSION_ROOT, "fixtures/semantic/grammar_corpus");
  canonicalAbsolute(
    formalReceiptSourcePlanRoot,
    "Fusion formal receipt source plan",
    "dir",
  );
  const formalReceiptSourcePlan =
    readCurrentChengGrammarCorpus(formalReceiptSourcePlanRoot);
  const formalReceiptSourcePlanFiles = [
    formalReceiptSourcePlan.pointerPath,
    ...formalReceiptSourcePlan.filePaths.values(),
  ].sort();
  if (formalReceiptSourcePlanFiles.length === 0) {
    throw new Error("formal receipt source plan is empty");
  }
  for (const path of formalReceiptSourcePlanFiles) {
    addSnapshot(
      path,
      `fusion/${relative(FUSION_ROOT, path).split("\\").join("/")}`,
      `Fusion formal receipt source-plan input ${path}`,
    );
  }
  addSnapshot(
    EBNF_PARSER_NODE_MAP_PATH,
    `fusion/${EBNF_PARSER_NODE_MAP_RELATIVE}`,
    "generated formal EBNF/parser production-receipt map",
  );
  addSnapshot(
    EBNF_PARSER_PRODUCER_DECLARATIONS_PATH,
    `fusion/${EBNF_PARSER_PRODUCER_DECLARATIONS_RELATIVE}`,
    "formal EBNF parser producer declarations",
  );
  const fusionNodeModulesRoot = join(FUSION_ROOT, "node_modules");
  canonicalAbsolute(fusionNodeModulesRoot, "Fusion node_modules", "dir");
  const fusionDependencyFiles = walkRegularFiles(fusionNodeModulesRoot, "Fusion node_modules");
  for (const path of fusionDependencyFiles) {
    addSnapshot(path, `fusion/${relative(FUSION_ROOT, path).split("\\").join("/")}`, `Fusion dependency ${path}`);
  }
  const expectedFixturePaths = new Set([CHENG_FIXTURE, C_FIXTURE, ...TYPED_EXPR_MATRIX.map((entry) => entry.path)]);
  const actualFixturePaths = walkRegularFiles(join(FUSION_ROOT, "fixtures/regalloc_preflight"), "Fusion regalloc fixtures");
  const unexpectedFixtures = actualFixturePaths.filter((path) => !expectedFixturePaths.has(path));
  const missingFixtures = [...expectedFixturePaths].filter((path) => !actualFixturePaths.includes(path));
  if (unexpectedFixtures.length > 0 || missingFixtures.length > 0) throw new Error(`Fusion regalloc fixture closure mismatch: unexpected=${unexpectedFixtures.join(",")} missing=${missingFixtures.join(",")}`);
  while (queue.length > 0) {
    const next = queue.shift();
    if (visited.has(next.path)) continue;
    visited.add(next.path);
    const snap = addSnapshot(next.path, next.label, `source closure ${next.name}`);
    for (const imported of sourceImports(next.path, snap.raw)) {
      const path = modules.get(imported);
      if (!path) throw new Error(`source fixture closure has unresolved import: ${next.name} -> ${imported}`);
      const canonicalName = imported.startsWith("cheng/") ? imported.slice("cheng/".length) : imported;
      queue.push({name: canonicalName, path, label: `src/${canonicalName}.cheng`});
    }
  }
  addSnapshot(join(treeRoot, "cheng-package.toml"), "cheng-package.toml", "treeRoot/cheng-package.toml");
  const lockPath = join(treeRoot, "cheng.lock.toml");
  addOptionalSnapshot(lockPath, "cheng.lock.toml", "treeRoot/cheng.lock.toml");
  addSnapshot(join(treeRoot, "tools/backend2_version_manifest.rec"), "tools/backend2_version_manifest.rec", "backend2 semantic-closure epoch manifest");
  addSnapshot(join(treeRoot, "tools/backend2_version_sentinel.sh"), "tools/backend2_version_sentinel.sh", "backend2 semantic-closure epoch validator");
  for (const relativePath of Object.values(AARCH64_F64_RUNTIME_GATE_FILES)) {
    addSnapshot(join(treeRoot, relativePath), relativePath, `AArch64 F64 runtime gate input ${relativePath}`);
  }
  for (const relativePath of Object.values(X86_64_F64_RUNTIME_GATE_FILES)) {
    if (Object.values(AARCH64_F64_RUNTIME_GATE_FILES).includes(relativePath)) continue;
    addSnapshot(join(treeRoot, relativePath), relativePath, `x86-64 F64 runtime gate input ${relativePath}`);
  }
  addSnapshot(join(treeRoot, TYPED_EXPR_SOURCE_RELATIVE), TYPED_EXPR_SOURCE_RELATIVE, "TypedExpr authority source");
  const manifestAuthorityRoots = explicitInputs.sourceManifestRelativePaths || [];
  if (!Array.isArray(manifestAuthorityRoots) || manifestAuthorityRoots.some((path) => typeof path !== "string" || !/^src\/[A-Za-z0-9_/]+\.cheng$/.test(path))) {
    throw new Error("validated source-manifest authority roots must be canonical Cheng source paths");
  }
  const authorityRootFiles = [...new Set([
    ...AUTHORITY_MINIMUM_REQUIRED_FILES,
    ...FORMAL_RECEIPT_AUTHORITY_FILES,
    ...manifestAuthorityRoots,
  ])].sort();
  const authorityProductionFiles = new Set();
  const authorityQueue = authorityRootFiles.map((relativePath) => ({relativePath, path: join(treeRoot, relativePath)}));
  while (authorityQueue.length > 0) {
    const next = authorityQueue.shift();
    if (authorityProductionFiles.has(next.relativePath)) continue;
    authorityProductionFiles.add(next.relativePath);
    const snap = addSnapshot(next.path, next.relativePath, `authority production import source ${next.relativePath}`);
    for (const imported of sourceImports(next.path, snap.raw)) {
      const importedPath = modules.get(imported);
      if (!importedPath) throw new Error(`authority production import closure has unresolved module: ${next.relativePath} -> ${imported}`);
      const importedRelative = relative(treeRoot, importedPath).split("\\").join("/");
      authorityQueue.push({relativePath: importedRelative, path: importedPath});
    }
  }
  addSnapshot(join(treeRoot, FORMAL_SPEC_RELATIVE), FORMAL_SPEC_RELATIVE, "formal expression specification");
  const bootstrapRoot = join(treeRoot, "bootstrap");
  canonicalAbsolute(bootstrapRoot, "treeRoot/bootstrap", "dir");
  const fixtureSnapshot = addSnapshot(C_FIXTURE, "fusion/bodyir_packed_slab_contract.c", "Fusion C fixture");
  const bootstrapSnapshots = new Map();
  for (const name of C_BOOTSTRAP_INCLUDE_FILES) {
    const path = join(bootstrapRoot, name);
    canonicalAbsolute(path, `bootstrap include ${name}`, "file");
    bootstrapSnapshots.set(name, addSnapshot(path, `bootstrap/${name}`, `bootstrap include ${name}`));
  }
  const cIncludeClosure = validateCIncludeClosure(fixtureSnapshot, bootstrapSnapshots);
  if (explicitInputs.sourceManifest) addSnapshot(explicitInputs.sourceManifest, "input/source_manifest", "explicit source manifest");
  if (explicitInputs.memoryManifest) addSnapshot(explicitInputs.memoryManifest, "input/memory_manifest", "explicit memory manifest");
  snapshots.sort((left, right) => left.label.localeCompare(right.label));
  const seenLabels = new Set();
  for (const snap of snapshots) {
    if (seenLabels.has(snap.label)) throw new Error(`duplicate source input snapshot label: ${snap.label}`);
    seenLabels.add(snap.label);
  }
  absences.sort((left, right) => left.label.localeCompare(right.label));
  const digestRows = [
    ...snapshots.map((snap) => `F\0${snap.label}\0${snap.sha256}\n`),
    ...absences.map((entry) => `A\0${entry.label}\0${entry.path}\n`),
  ];
  const digest = sha256(Buffer.from(digestRows.join(""), "utf8"));
  const formalReceiptToolClosureRows = formalReceiptToolFiles.map((path) => {
    const snapshot = snapshotPaths.get(path);
    if (snapshot === undefined) {
      throw new Error(`formal receipt tool is absent from snapshot: ${path}`);
    }
    return {
      path: relative(FUSION_ROOT, path).split("\\").join("/"),
      byteLength: snapshot.raw.length,
      sha256: snapshot.sha256,
    };
  });
  const formalReceiptSourcePlanRows =
    formalReceiptSourcePlanFiles.map((path) => {
      const snapshot = snapshotPaths.get(path);
      if (snapshot === undefined) {
        throw new Error(
          `formal receipt source-plan input is absent from snapshot: ${path}`,
        );
      }
      return {
        path: relative(FUSION_ROOT, path).split("\\").join("/"),
        byteLength: snapshot.raw.length,
        sha256: snapshot.sha256,
      };
    });
  return {
    sha256: digest,
    snapshots,
    absences,
    byLabel: new Map(snapshots.map((snap) => [snap.label, snap])),
    authorityProductionFiles: [...authorityProductionFiles].sort(),
    authorityProductionRoots: authorityRootFiles,
    authorityProductionScope: manifestAuthorityRoots.length > 0 ? "minimum_plus_validated_source_manifest_import_closure" : "minimum_import_closure",
    authorityManifestRootFileCount: manifestAuthorityRoots.length,
    cIncludeClosure,
    fusionSourceFileCount: fusionSourceFiles.length,
    fusionDependencyFileCount: fusionDependencyFiles.length,
    fusionFixtureCount: actualFixturePaths.length,
    formalReceiptToolClosure: {
      fileCount: formalReceiptToolClosureRows.length,
      sha256: sha256(Buffer.from(canonicalJson(
        formalReceiptToolClosureRows,
      ))),
      rows: formalReceiptToolClosureRows,
    },
    formalReceiptSourcePlan: {
      fileCount: formalReceiptSourcePlanRows.length,
      sha256: sha256(Buffer.from(canonicalJson(
        formalReceiptSourcePlanRows,
      ))),
      rows: formalReceiptSourcePlanRows,
    },
  };
}

function sameSourceInputs(left, right) {
  return left.sha256 === right.sha256 && left.snapshots.length === right.snapshots.length &&
    left.snapshots.every((snap, index) => snap.label === right.snapshots[index].label && snap.sha256 === right.snapshots[index].sha256 && sameStat(snap.stat, right.snapshots[index].stat)) &&
    left.absences.length === right.absences.length && left.absences.every((entry, index) => entry.label === right.absences[index].label && entry.path === right.absences[index].path);
}

function sourceInputsDifference(left, right) {
  const identity = (stat) => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
  if (left.snapshots.length !== right.snapshots.length) return `file_count:${left.snapshots.length}->${right.snapshots.length}`;
  for (let index = 0; index < left.snapshots.length; index++) {
    const before = left.snapshots[index];
    const after = right.snapshots[index];
    if (before.label !== after.label) return `label[${index}]:${before.label}->${after.label}`;
    if (before.sha256 !== after.sha256) return `sha256:${before.label}:${before.sha256}->${after.sha256}`;
    if (!sameStat(before.stat, after.stat)) return `identity:${before.label}:${identity(before.stat)}->${identity(after.stat)}`;
  }
  if (left.absences.length !== right.absences.length) return `absence_count:${left.absences.length}->${right.absences.length}`;
  for (let index = 0; index < left.absences.length; index++) {
    const before = left.absences[index];
    const after = right.absences[index];
    if (before.label !== after.label || before.path !== after.path) return `absence[${index}]:${before.label}:${before.path}->${after.label}:${after.path}`;
  }
  return left.sha256 === right.sha256 ? "none" : `aggregate_sha256:${left.sha256}->${right.sha256}`;
}

function validateSourceManifestPath(treeRoot, manifestPath) {
  const manifest = stableSnapshot(manifestPath, "regalloc source manifest", 64 * 1024 * 1024);
  const {rows} = strictKv(manifest.raw, "regalloc source manifest", "manifest_payload_sha256");
  if (rows.get("schema") !== "regalloc_source_manifest" || rows.get("target") !== TARGET) throw new Error("regalloc source manifest schema/target mismatch");
  const fileCount = Number(uintValue(rows.get("file_count"), "file_count", 1000000n));
  const edgeCount = Number(uintValue(rows.get("import_edge_count"), "import_edge_count", 10000000n));
  if (fileCount <= 0) throw new Error("regalloc source manifest file_count must be positive");
  const expected = ["schema", "entry", "entry_module", "target", "file_count", "import_edge_count", "manifest_payload_sha256"];
  for (let index = 0; index < fileCount; index++) expected.push(`file.${index}.module`, `file.${index}.path`, `file.${index}.sha256`);
  for (let index = 0; index < edgeCount; index++) expected.push(`edge.${index}.from`, `edge.${index}.to`);
  exactKeys(rows, expected, "regalloc source manifest");

  const modules = [];
  const files = [];
  const aliases = new Map();
  const seenPaths = new Set();
  for (let index = 0; index < fileCount; index++) {
    const moduleName = rows.get(`file.${index}.module`);
    const relativePath = rows.get(`file.${index}.path`);
    const expectedHash = rows.get(`file.${index}.sha256`);
    if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*$/.test(moduleName)) throw new Error(`invalid manifest module ${index}`);
    if (index > 0 && modules[index - 1] >= moduleName) throw new Error("manifest modules must be unique and sorted");
    if (relativePath !== `src/${moduleName}.cheng` || seenPaths.has(relativePath) || !/^[A-Za-z0-9_./-]+$/.test(relativePath)) throw new Error(`non-canonical manifest path ${index}`);
    if (!/^[0-9a-f]{64}$/.test(expectedHash)) throw new Error(`invalid manifest file hash ${index}`);
    const absolute = resolve(treeRoot, relativePath);
    if (relative(treeRoot, absolute).startsWith("..") || absolute !== join(treeRoot, relativePath)) throw new Error(`manifest path escapes tree ${index}`);
    canonicalAbsolute(absolute, `manifest file ${index}`, "file");
    const snap = stableSnapshot(absolute, `manifest file ${index}`);
    if (snap.sha256 !== expectedHash) throw new Error(`manifest file hash mismatch ${index}`);
    modules.push(moduleName);
    files.push({path: absolute, relativePath, snapshot: snap});
    aliases.set(moduleName, index);
    aliases.set(`cheng/${moduleName}`, index);
    seenPaths.add(relativePath);
  }
  const entryModule = rows.get("entry_module");
  if (rows.get("entry") !== `src/${entryModule}.cheng` || !aliases.has(entryModule)) throw new Error("manifest entry does not identify a closure file");
  if (modules.filter((value) => value === "core/backend/regalloc_single_pass").length !== 1) throw new Error("allocator absent from source manifest");

  const declaredEdges = [];
  const edgeKeys = new Set();
  for (let index = 0; index < edgeCount; index++) {
    const from = Number(uintValue(rows.get(`edge.${index}.from`), `edge.${index}.from`, BigInt(fileCount - 1)));
    const to = Number(uintValue(rows.get(`edge.${index}.to`), `edge.${index}.to`, BigInt(fileCount - 1)));
    const key = `${from}:${to}`;
    if (edgeKeys.has(key)) throw new Error(`duplicate manifest edge ${index}`);
    if (index > 0 && declaredEdges[index - 1][0] * fileCount + declaredEdges[index - 1][1] >= from * fileCount + to) throw new Error("manifest edges must be sorted");
    edgeKeys.add(key);
    declaredEdges.push([from, to]);
  }
  const actualEdges = new Set();
  for (let from = 0; from < files.length; from++) {
    for (const imported of sourceImports(files[from].path, files[from].snapshot.raw)) {
      const to = aliases.get(imported);
      if (to === undefined) throw new Error(`manifest unresolved import: ${modules[from]} -> ${imported}`);
      actualEdges.add(`${from}:${to}`);
    }
  }
  if (actualEdges.size !== edgeKeys.size || [...actualEdges].some((edge) => !edgeKeys.has(edge))) throw new Error("manifest import edge closure mismatch");
  const reachable = new Set([aliases.get(entryModule)]);
  for (;;) {
    const size = reachable.size;
    for (const [from, to] of declaredEdges) if (reachable.has(from)) reachable.add(to);
    if (reachable.size === size) break;
  }
  if (reachable.size !== fileCount) throw new Error("manifest contains files unreachable from entry");
  for (let index = 0; index < files.length; index++) {
    if (stableSnapshot(files[index].path, `manifest final file ${index}`).sha256 !== files[index].snapshot.sha256) throw new Error(`manifest closure drifted during validation ${index}`);
  }
  if (stableSnapshot(manifestPath, "regalloc source manifest final", 64 * 1024 * 1024).sha256 !== manifest.sha256) throw new Error("regalloc source manifest drifted during validation");
  return {
    path: manifestPath,
    sha256: manifest.sha256,
    fileCount,
    edgeCount,
    entryModule,
    allocatorIndex: modules.indexOf("core/backend/regalloc_single_pass"),
    relativePaths: files.map((file) => file.relativePath),
    files: files.map((file) => ({
      relativePath: file.relativePath,
      sha256: file.snapshot.sha256,
    })),
  };
}

function eventNumber(rows, index, name) {
  return uintValue(rows.get(`event.${index}.${name}`), `event.${index}.${name}`);
}

function bodyBytes(body) {
  return body.opCapacity * MEMORY_ROW_BYTES.op +
    body.slotCapacity * MEMORY_ROW_BYTES.slot +
    body.callArgCapacity * MEMORY_ROW_BYTES.call_arg;
}

function validateMemoryManifestBytes(raw) {
  const {rows} = strictKv(raw, "cold BodyIR memory manifest", "manifest_payload_sha256");
  const header = {
    schema: "cold_bodyir_memory_manifest",
    scope: "arena_used_plus_bodyir_owned_slabs",
    pointer_width_bits: "64",
    arena_alignment_bytes: "8",
    arena_page_payload_bytes: "65536",
    op_row_bytes: MEMORY_ROW_BYTES.op.toString(),
    slot_row_bytes: MEMORY_ROW_BYTES.slot.toString(),
    call_arg_row_bytes: MEMORY_ROW_BYTES.call_arg.toString(),
    initial_op_capacity: "64",
    initial_slot_capacity: "32",
    initial_call_arg_capacity: "8",
    max_active_bodyir_arenas: "1",
  };
  for (const [key, value] of Object.entries(header)) if (rows.get(key) !== value) throw new Error(`memory manifest ${key} mismatch`);
  if (rows.get("complete") !== "1") throw new Error("memory manifest is not complete");
  const eventCount = Number(uintValue(rows.get("event_count"), "event_count", 10000000n));
  const arenaCountFooter = uintValue(rows.get("arena_count"), "arena_count");
  const bodyCountFooter = uintValue(rows.get("body_count"), "body_count");
  const arenaCloseFooter = uintValue(rows.get("arena_close_count"), "arena_close_count");
  const bodyReleaseFooter = uintValue(rows.get("body_release_count"), "body_release_count");
  const peakFooter = uintValue(rows.get("recomputed_peak_retained_bytes"), "recomputed_peak_retained_bytes");
  const expected = [...Object.keys(header), "event_count", "arena_count", "body_count", "arena_close_count", "body_release_count", "recomputed_peak_retained_bytes", "complete", "manifest_payload_sha256"];
  for (let index = 0; index < eventCount; index++) for (const field of MEMORY_EVENT_FIELDS) expected.push(`event.${index}.${field}`);
  exactKeys(rows, expected, "cold BodyIR memory manifest");

  const arenas = new Map();
  const bodies = new Map();
  const roles = new Set();
  let activeArenaCount = 0;
  let arenaOpenCount = 0n;
  let arenaCloseCount = 0n;
  let bodyBirthCount = 0n;
  let bodyReleaseCount = 0n;
  let recomputedPeak = 0n;
  const int32Max = 2147483647n;

  for (let index = 0; index < eventCount; index++) {
    const prefix = `event.${index}.`;
    const kind = rows.get(prefix + "kind");
    const role = rows.get(prefix + "arena_role");
    const family = rows.get(prefix + "family");
    const cause = rows.get(prefix + "cause");
    const arenaId = eventNumber(rows, index, "arena_id");
    const bodyId = eventNumber(rows, index, "body_id");
    const cloneSourceId = eventNumber(rows, index, "clone_source_body_id");
    if (!MEMORY_ROLES.includes(role)) throw new Error(`event ${index} has unknown arena role`);
    const numbers = {};
    for (const name of MEMORY_EVENT_FIELDS.slice(7)) numbers[name] = eventNumber(rows, index, name);
    for (const name of ["op_count", "op_capacity", "slot_count", "slot_capacity", "call_arg_count", "call_arg_capacity", "old_capacity", "new_capacity"]) {
      if (numbers[name] > int32Max) throw new Error(`event ${index} ${name} exceeds int32`);
    }
    if (numbers.op_count > numbers.op_capacity || numbers.slot_count > numbers.slot_capacity || numbers.call_arg_count > numbers.call_arg_capacity) throw new Error(`event ${index} count exceeds capacity`);
    const arena = arenas.get(arenaId.toString());
    if (kind !== "arena_open" && (!arena || !arena.active || arena.role !== role)) throw new Error(`event ${index} references an inactive arena`);
    if (arena && numbers.arena_used_bytes < arena.used) throw new Error(`event ${index} arena.used regressed`);
    if (arena) arena.used = numbers.arena_used_bytes;
    if (numbers.retained_before_bytes !== numbers.arena_used_bytes + numbers.owned_slab_before_bytes ||
        numbers.retained_peak_bytes !== numbers.arena_used_bytes + numbers.owned_slab_peak_bytes ||
        numbers.retained_after_bytes !== numbers.arena_used_bytes + numbers.owned_slab_after_bytes) throw new Error(`event ${index} retained arithmetic mismatch`);
    if (numbers.retained_peak_bytes < numbers.retained_before_bytes || numbers.retained_peak_bytes < numbers.retained_after_bytes) throw new Error(`event ${index} retained peak is not a peak`);
    if (numbers.retained_peak_bytes > recomputedPeak) recomputedPeak = numbers.retained_peak_bytes;

    const noSlabFields = () => {
      if (family !== "none" || cause !== "none" || numbers.old_capacity !== 0n || numbers.new_capacity !== 0n || numbers.old_bytes !== 0n || numbers.new_bytes !== 0n) throw new Error(`event ${index} has slab fields on ${kind}`);
    };
    const zeroBodyRow = () => {
      if (bodyId !== 0n || cloneSourceId !== 0n || numbers.op_count !== 0n || numbers.op_capacity !== 0n || numbers.slot_count !== 0n || numbers.slot_capacity !== 0n || numbers.call_arg_count !== 0n || numbers.call_arg_capacity !== 0n) throw new Error(`event ${index} must have an empty body row`);
    };
    const rowMatchesBody = (body) => {
      if (numbers.op_count !== body.opCount || numbers.op_capacity !== body.opCapacity || numbers.slot_count !== body.slotCount || numbers.slot_capacity !== body.slotCapacity || numbers.call_arg_count !== body.callArgCount || numbers.call_arg_capacity !== body.callArgCapacity) throw new Error(`event ${index} body row drift`);
    };

    if (kind === "arena_open") {
      if (arenaId !== arenaOpenCount + 1n || bodyId !== 0n || arenas.has(arenaId.toString())) throw new Error(`event ${index} has invalid arena identity`);
      if (++activeArenaCount > 1) throw new Error("memory manifest has concurrent BodyIR arenas");
      arenaOpenCount++;
      roles.add(role);
      zeroBodyRow(); noSlabFields();
      if (numbers.owned_slab_before_bytes !== 0n || numbers.owned_slab_peak_bytes !== 0n || numbers.owned_slab_after_bytes !== 0n) throw new Error(`event ${index} arena opens with owned slabs`);
      arenas.set(arenaId.toString(), {active: true, role, used: numbers.arena_used_bytes, owned: 0n});
      continue;
    }
    if (numbers.owned_slab_before_bytes !== arena.owned) throw new Error(`event ${index} owned-before does not match sweep state`);

    if (kind === "body_birth") {
      noSlabFields();
      if (bodyId !== bodyBirthCount + 1n || cloneSourceId !== 0n || bodies.has(bodyId.toString())) throw new Error(`event ${index} has invalid body identity`);
      if (numbers.op_count !== 0n || numbers.op_capacity !== 0n || numbers.slot_count !== 0n || numbers.slot_capacity !== 0n || numbers.call_arg_count !== 0n || numbers.call_arg_capacity !== 0n) throw new Error(`event ${index} body birth is not empty`);
      if (numbers.owned_slab_peak_bytes !== arena.owned || numbers.owned_slab_after_bytes !== arena.owned) throw new Error(`event ${index} body birth changes slab ownership`);
      bodyBirthCount++;
      bodies.set(bodyId.toString(), {alive: true, arenaId, cloneSourceId: 0n, opCount: 0n, opCapacity: 0n, slotCount: 0n, slotCapacity: 0n, callArgCount: 0n, callArgCapacity: 0n});
      continue;
    }
    if (kind === "slab_replace") {
      if (!["op", "slot", "call_arg"].includes(family) || !["grow", "clone"].includes(cause)) throw new Error(`event ${index} has invalid slab family/cause`);
      const body = bodies.get(bodyId.toString());
      if (!body?.alive || body.arenaId !== arenaId) throw new Error(`event ${index} slab body is not alive`);
      if (cause === "clone") {
        if (cloneSourceId === 0n || !bodies.get(cloneSourceId.toString())?.alive) throw new Error(`event ${index} clone source is not alive`);
        if (body.cloneSourceId !== 0n && body.cloneSourceId !== cloneSourceId) throw new Error(`event ${index} clone source changed`);
        body.cloneSourceId = cloneSourceId;
      } else if (cloneSourceId !== body.cloneSourceId) throw new Error(`event ${index} clone source mismatch`);
      const capKey = family === "op" ? "opCapacity" : family === "slot" ? "slotCapacity" : "callArgCapacity";
      const countKey = family === "op" ? "opCount" : family === "slot" ? "slotCount" : "callArgCount";
      const rowBytes = MEMORY_ROW_BYTES[family];
      if (rowBytes === undefined) throw new Error(`event ${index} has unknown slab row width family`);
      const initial = family === "op" ? 64n : family === "slot" ? 32n : 8n;
      if (body[capKey] !== numbers.old_capacity || numbers.old_bytes !== numbers.old_capacity * rowBytes || numbers.new_bytes !== numbers.new_capacity * rowBytes) throw new Error(`event ${index} slab byte/capacity mismatch`);
      if (cause === "grow" && !((numbers.old_capacity === 0n && numbers.new_capacity === initial) || (numbers.old_capacity > 0n && numbers.new_capacity === numbers.old_capacity * 2n))) throw new Error(`event ${index} is outside the doubling chain`);
      if (cause === "clone" && (numbers.old_capacity !== 0n || numbers.new_capacity !== numbers[countKey === "opCount" ? "op_count" : countKey === "slotCount" ? "slot_count" : "call_arg_count"])) throw new Error(`event ${index} clone slab is not exact-live capacity`);
      if (numbers.owned_slab_peak_bytes !== arena.owned + numbers.new_bytes || numbers.owned_slab_after_bytes !== numbers.owned_slab_peak_bytes - numbers.old_bytes) throw new Error(`event ${index} old+new slab overlap mismatch`);
      const prior = {...body};
      body.opCount = numbers.op_count; body.opCapacity = numbers.op_capacity;
      body.slotCount = numbers.slot_count; body.slotCapacity = numbers.slot_capacity;
      body.callArgCount = numbers.call_arg_count; body.callArgCapacity = numbers.call_arg_capacity;
      if ((family !== "op" && (body.opCount !== prior.opCount || body.opCapacity !== prior.opCapacity)) ||
          (family !== "slot" && (body.slotCount !== prior.slotCount || body.slotCapacity !== prior.slotCapacity)) ||
          (family !== "call_arg" && (body.callArgCount !== prior.callArgCount || body.callArgCapacity !== prior.callArgCapacity))) throw new Error(`event ${index} changed an unrelated slab family`);
      arena.owned = numbers.owned_slab_after_bytes;
      continue;
    }
    if (kind === "body_clone") {
      noSlabFields();
      const body = bodies.get(bodyId.toString());
      const source = bodies.get(cloneSourceId.toString());
      if (!body?.alive || !source?.alive || body.cloneSourceId !== cloneSourceId || body.arenaId !== arenaId || source.arenaId !== arenaId) throw new Error(`event ${index} clone relation is invalid`);
      rowMatchesBody(body);
      if (body.opCount !== source.opCount || body.slotCount !== source.slotCount || body.callArgCount !== source.callArgCount || body.opCapacity !== body.opCount || body.slotCapacity !== body.slotCount || body.callArgCapacity !== body.callArgCount) throw new Error(`event ${index} clone is not exact-live and source-equivalent`);
      if (numbers.owned_slab_peak_bytes !== arena.owned || numbers.owned_slab_after_bytes !== arena.owned) throw new Error(`event ${index} body_clone changes owned bytes`);
      continue;
    }
    if (kind === "body_release") {
      noSlabFields();
      const body = bodies.get(bodyId.toString());
      if (!body?.alive || body.arenaId !== arenaId || cloneSourceId !== body.cloneSourceId) throw new Error(`event ${index} releases an invalid body`);
      rowMatchesBody(body);
      const bytes = bodyBytes(body);
      if (arena.owned < bytes || numbers.owned_slab_peak_bytes !== arena.owned || numbers.owned_slab_after_bytes !== arena.owned - bytes) throw new Error(`event ${index} body release ownership mismatch`);
      body.alive = false;
      bodyReleaseCount++;
      arena.owned = numbers.owned_slab_after_bytes;
      continue;
    }
    if (kind === "arena_release_begin") {
      zeroBodyRow(); noSlabFields();
      if (numbers.owned_slab_peak_bytes !== arena.owned || numbers.owned_slab_after_bytes !== arena.owned) throw new Error(`event ${index} release-begin changes owned bytes`);
      continue;
    }
    if (kind === "arena_release_end") {
      zeroBodyRow(); noSlabFields();
      if (arena.owned !== 0n || numbers.owned_slab_peak_bytes !== 0n || numbers.owned_slab_after_bytes !== 0n || [...bodies.values()].some((body) => body.alive && body.arenaId === arenaId)) throw new Error(`event ${index} closes an arena with live ownership`);
      arena.active = false;
      activeArenaCount--;
      arenaCloseCount++;
      continue;
    }
    throw new Error(`event ${index} has unknown kind ${kind}`);
  }
  if (activeArenaCount !== 0 || [...bodies.values()].some((body) => body.alive)) throw new Error("memory manifest ended with live owners");
  if (arenaOpenCount !== arenaCountFooter || arenaCloseCount !== arenaCloseFooter || bodyBirthCount !== bodyCountFooter || bodyReleaseCount !== bodyReleaseFooter || arenaOpenCount !== arenaCloseCount || bodyBirthCount !== bodyReleaseCount) throw new Error("memory manifest footer owner counts mismatch");
  if (recomputedPeak !== peakFooter) throw new Error("memory manifest footer peak is not independently reproduced");
  for (const role of MEMORY_ROLES) if (!roles.has(role)) throw new Error(`memory manifest does not prove arena role: ${role}`);
  return {eventCount, arenaCount: Number(arenaOpenCount), bodyCount: Number(bodyBirthCount), recomputedPeakRetainedBytes: recomputedPeak.toString(), roles: [...roles].sort()};
}

function rawDriverFixedPoint(gen2Path, gen3Path, officialPath) {
  const compared = stableStreamingRawCompare([
    {path: gen2Path, label: "GEN2 driver"},
    {path: gen3Path, label: "GEN3 driver"},
    {path: officialPath, label: "official driver"},
  ]);
  const [gen2, gen3, official] = compared.snapshots;
  if (gen2.stat.dev === gen3.stat.dev && gen2.stat.ino === gen3.stat.ino) throw new Error("GEN2 and GEN3 must be different inodes");
  for (const [path, label, expected] of [[gen2Path, "GEN2 driver final", gen2], [gen3Path, "GEN3 driver final", gen3], [officialPath, "official driver final", official]]) {
    const final = stableStreamingSnapshot(path, label);
    if (final.sha256 !== expected.sha256 || !sameStat(final.stat, expected.stat)) throw new Error(`${label} drifted across raw fixed-point validation`);
  }
  return {identical: compared.identical, gen2Sha256: gen2.sha256, gen3Sha256: gen3.sha256, officialSha256: official.sha256};
}

function validateBackend2VersionManifest(root, snapshot) {
  const expectedPath = join(root, "tools/backend2_version_manifest.rec");
  if (snapshot.path !== expectedPath) throw new Error(`backend2 version manifest must be the current tree artifact: ${expectedPath}`);
  if (!Buffer.isBuffer(snapshot.raw) || sha256(snapshot.raw) !== snapshot.sha256) throw new Error("backend2 version manifest snapshot bytes/hash mismatch");
  const current = stableSnapshot(expectedPath, "backend2 version manifest current", 4 * 1024 * 1024);
  if (current.sha256 !== snapshot.sha256 || !sameStat(current.stat, snapshot.stat)) throw new Error("backend2 version manifest changed after release input pinning");
  const {rows} = parseUniqueUnhashedKv(snapshot.raw, "backend2 version manifest");
  const count = Number(uintValue(rows.get("source_count"), "backend2 version manifest source_count", 100000n));
  if (count <= 0) throw new Error("backend2 version manifest source_count must be positive");
  const exact = ["schema", "version", "sources_sha256", "framing", "source_count"];
  for (let index = 0; index < count; index++) exact.push(`source_${String(index).padStart(4, "0")}`);
  exactKeys(rows, exact, "backend2 version manifest");
  if (rows.get("schema") !== "backend2_version_manifest" ||
      rows.get("framing") !== "backend2_codegen_semantic_closure.framed" ||
      !/^backend2-slice[1-9]\d*$/.test(String(rows.get("version") || ""))) {
    throw new Error("backend2 version manifest schema/framing/version mismatch");
  }
  const sourcesSha256 = requireSha256(rows.get("sources_sha256"), "backend2 version manifest sources SHA-256");
  const sources = [];
  const seen = new Set();
  for (let index = 0; index < count; index++) {
    const relativePath = String(rows.get(`source_${String(index).padStart(4, "0")}`) || "");
    if (!/^src\/[A-Za-z0-9_./-]+\.cheng$/.test(relativePath) || relativePath.includes("//") || relativePath.split("/").some((part) => part === "." || part === "..")) {
      throw new Error(`backend2 version manifest source path is not canonical: ${index}`);
    }
    if (seen.has(relativePath)) throw new Error(`backend2 version manifest source path is duplicated: ${relativePath}`);
    if (index > 0 && sources[index - 1] >= relativePath) throw new Error("backend2 version manifest source paths are not strictly ordered");
    seen.add(relativePath);
    sources.push(relativePath);
    stableSnapshot(join(root, relativePath), `backend2 version manifest source ${index}`, MAX_SNAPSHOT_BYTES);
  }
  for (const required of ["src/core/backend2/backend2_pipeline.cheng", "src/core/backend/regalloc_single_pass.cheng", "src/core/lang/parser.cheng", "src/core/lang/typed_expr.cheng"]) {
    if (!seen.has(required)) throw new Error(`backend2 version manifest omits release-critical source: ${required}`);
  }
  return {schema: rows.get("schema"), version: rows.get("version"), sourcesSha256, framing: rows.get("framing"), sourceCount: count, sources, manifestPath: snapshot.path, manifestSha256: snapshot.sha256};
}

function validateBackend2VersionSentinelReport(snapshot, backend2VersionManifest) {
  const {rows} = parseUniqueUnhashedKv(snapshot.raw, "backend2 version sentinel report");
  const exact = ["schema", "status", "rc", "version", "sources_sha256", "manifest_sha256", "framing", "source_count"];
  for (let index = 0; index < backend2VersionManifest.sourceCount; index++) exact.push(`source_${String(index).padStart(4, "0")}`);
  exactKeys(rows, exact, "backend2 version sentinel report");
  const expected = new Map([
    ["schema", "backend2_version_sentinel"], ["status", "PASS"], ["rc", "0"],
    ["version", backend2VersionManifest.version], ["sources_sha256", backend2VersionManifest.sourcesSha256],
    ["manifest_sha256", backend2VersionManifest.manifestSha256], ["framing", backend2VersionManifest.framing],
    ["source_count", String(backend2VersionManifest.sourceCount)],
  ]);
  for (const [key, value] of expected) if (rows.get(key) !== value) throw new Error(`backend2 version sentinel ${key} mismatch`);
  for (let index = 0; index < backend2VersionManifest.sourceCount; index++) {
    if (rows.get(`source_${String(index).padStart(4, "0")}`) !== backend2VersionManifest.sources[index]) {
      throw new Error(`backend2 version sentinel source closure mismatch: ${index}`);
    }
  }
  return {schema: rows.get("schema"), status: rows.get("status"), version: rows.get("version"), sourcesSha256: rows.get("sources_sha256"), manifestSha256: rows.get("manifest_sha256"), sourceCount: backend2VersionManifest.sourceCount};
}

function validateCurrentWorkspaceSourceHashManifest(root, directory, expectedSha256) {
  const beforeList = stableSnapshot(join(directory, "cheng-sources.before.list"), "official build source list before", 64 * 1024 * 1024);
  const afterList = stableSnapshot(join(directory, "cheng-sources.after.list"), "official build source list after", 64 * 1024 * 1024);
  const beforeHashes = stableSnapshot(join(directory, "cheng-sources.before.sha256"), "official build source hashes before", 256 * 1024 * 1024);
  const afterHashes = stableSnapshot(join(directory, "cheng-sources.after.sha256"), "official build source hashes after", 256 * 1024 * 1024);
  if (!beforeList.raw.equals(afterList.raw) || !beforeHashes.raw.equals(afterHashes.raw)) throw new Error("official build source closure changed while the driver was built");
  if (afterHashes.sha256 !== requireSha256(expectedSha256, "official build workspace source-manifest SHA-256")) throw new Error("official build workspace source-manifest hash mismatch");
  const expectedPaths = walkRegularFiles(join(root, "src"), "official build current src")
    .filter((path) => path.endsWith(".cheng"))
    .map((path) => relative(root, path).split("\\").join("/"));
  for (const relativePath of ["cheng-package.toml", "cheng.lock.toml"]) {
    canonicalAbsolute(join(root, relativePath), `official build ${relativePath}`, "file");
    expectedPaths.push(relativePath);
  }
  expectedPaths.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  const expectedList = Buffer.from(`${expectedPaths.join("\n")}\n`, "utf8");
  if (!afterList.raw.equals(expectedList)) throw new Error("official build source file inventory is not the exact current Cheng closure");
  let text;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(afterHashes.raw); }
  catch { throw new Error("official build source hash manifest is not UTF-8"); }
  if (!text.endsWith("\n") || text.includes("\r") || text.includes("\0")) throw new Error("official build source hash manifest is not canonical LF text");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== expectedPaths.length) throw new Error("official build source hash manifest count mismatch");
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^([0-9a-f]{64})  (.+)$/);
    if (!match || match[2] !== expectedPaths[index]) throw new Error(`official build source hash row mismatch: ${index}`);
    const source = stableSnapshot(join(root, match[2]), `official build current source ${index}`, MAX_SNAPSHOT_BYTES);
    if (source.sha256 !== match[1]) throw new Error(`official driver was not built from current source bytes: ${match[2]}`);
  }
  return {manifestSha256: afterHashes.sha256, fileCount: expectedPaths.length, beforeListSha256: beforeList.sha256, afterListSha256: afterList.sha256, beforeHashesSha256: beforeHashes.sha256, afterHashesSha256: afterHashes.sha256};
}

function recomputeCompilerOutputReceiptCid(compileReceiptCid, outputSha256, backend2VersionManifestSha256) {
  const framedText = (value) => {
    const raw = Buffer.from(value, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(raw.length, 0);
    return Buffer.concat([length, raw]);
  };
  const compileReceiptRaw = Buffer.from(requireSha256(compileReceiptCid, "compiler output receipt compile CID"), "hex");
  const payload = Buffer.concat([
    framedText("cheng.compiler.output_receipt"),
    compileReceiptRaw,
    Buffer.from(requireSha256(outputSha256, "compiler output receipt output SHA-256"), "hex"),
    Buffer.from(requireSha256(backend2VersionManifestSha256, "compiler output receipt backend2 manifest SHA-256"), "hex"),
    framedText(TARGET),
    framedText("unelaborated"),
    framedText("full_backend_codegen=1"),
    framedText("cold_system_link_exec=0"),
    framedText("system_link_exec_scope=selfhost_direct"),
  ]);
  return sha256(payload);
}

function validateAndRecomputeCompileReceipt(rows, expected) {
  const fixedKeys = [
    "compile_receipt_world_head_cid", "compile_receipt_source_bundle_cid", "compile_receipt_entry_source_cid",
    "compile_receipt_compiler_csg_cid", "compile_receipt_canonical_compiler_csg_cid",
    "compile_receipt_output_digest", "compile_receipt_canonical_output_digest",
  ];
  const sourceCount = uintValue(rows.get("compile_receipt_source_snapshot_count"), "compiler report compile receipt source count", 0xffffffffn);
  const providerCount = uintValue(rows.get("compile_receipt_runtime_provider_count"), "compiler report compile receipt provider count", 4096n);
  if (sourceCount <= 0n) throw new Error("compiler report compile receipt source count must be positive");
  const providerKeys = [];
  const providers = [];
  for (let index = 0; index < Number(providerCount); index++) {
    const key = `compile_receipt_runtime_provider.${index}`;
    const provider = rows.get(key);
    if (typeof provider !== "string" || provider.length === 0) throw new Error(`compiler report compile receipt provider is absent: ${index}`);
    providerKeys.push(key);
    providers.push(provider);
  }
  const exactPrefixedKeys = new Set([
    ...fixedKeys, "compile_receipt_source_snapshot_count", "compile_receipt_entry_mode",
    "compile_receipt_target", "compile_receipt_bootstrap_stage", "compile_receipt_runtime_provider_count",
    ...providerKeys, "compile_receipt_cid",
  ]);
  const actualPrefixedKeys = [...rows.keys()].filter((key) => key.startsWith("compile_receipt_"));
  if (actualPrefixedKeys.length !== exactPrefixedKeys.size || actualPrefixedKeys.some((key) => !exactPrefixedKeys.has(key))) {
    throw new Error("compiler report compile receipt field set mismatch");
  }
  if (rows.get("compile_receipt_entry_mode") !== "unelaborated" || rows.get("compile_receipt_target") !== TARGET) {
    throw new Error("compiler report compile receipt mode/target mismatch");
  }
  const sourceBundleCid = requireSha256(rows.get("compile_receipt_source_bundle_cid"), "compiler report compile receipt source bundle CID");
  const entrySourceCid = requireSha256(rows.get("compile_receipt_entry_source_cid"), "compiler report compile receipt entry source CID");
  if (sourceBundleCid !== expected.sourceBundleCid || sourceCount.toString() !== expected.sourceSnapshotCount || entrySourceCid !== expected.entrySourceCid) {
    throw new Error("compiler report compile receipt source identity cross-binding mismatch");
  }
  const framedText = (value, label) => {
    if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be nonempty UTF-8 text`);
    const raw = Buffer.from(value, "utf8");
    if (raw.length > 0xffffffff) throw new Error(`${label} exceeds u32 framing`);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(raw.length, 0);
    return Buffer.concat([length, raw]);
  };
  const u32be = (value) => {
    const raw = Buffer.alloc(4);
    raw.writeUInt32BE(Number(value), 0);
    return raw;
  };
  const payload = Buffer.concat([
    framedText("cheng.compiler.compile_receipt", "compiler receipt domain"),
    Buffer.from(requireSha256(rows.get("compile_receipt_world_head_cid"), "compiler report world-head CID"), "hex"),
    Buffer.from(sourceBundleCid, "hex"), u32be(sourceCount), Buffer.from(entrySourceCid, "hex"),
    framedText(rows.get("compile_receipt_entry_mode"), "compiler receipt entry mode"),
    Buffer.from(requireSha256(rows.get("compile_receipt_compiler_csg_cid"), "compiler report compiler CSG CID"), "hex"),
    Buffer.from(requireSha256(rows.get("compile_receipt_canonical_compiler_csg_cid"), "compiler report canonical compiler CSG CID"), "hex"),
    framedText(rows.get("compile_receipt_target"), "compiler receipt target"),
    Buffer.from(requireSha256(rows.get("compile_receipt_output_digest"), "compiler report output digest"), "hex"),
    Buffer.from(requireSha256(rows.get("compile_receipt_canonical_output_digest"), "compiler report canonical output digest"), "hex"),
    framedText(rows.get("compile_receipt_bootstrap_stage"), "compiler receipt bootstrap stage"),
    u32be(providerCount), ...providers.map((provider, index) => framedText(provider, `compiler receipt provider ${index}`)),
  ]);
  const recomputedCid = sha256(payload);
  const reportedCid = requireSha256(rows.get("compile_receipt_cid"), "compiler report compile receipt CID");
  if (recomputedCid !== reportedCid || reportedCid !== expected.compileReceiptCid) {
    throw new Error("compiler report compile receipt CID does not independently match its canonical payload");
  }
  return {cid: recomputedCid, sourceCount: sourceCount.toString(), providerCount: providerCount.toString(), providers};
}

function validateOfficialDriverBuildReceipt(root, receiptSnapshot, officialDriverSnapshot, backend2VersionManifest) {
  const directory = join(root, "artifacts/verification/current_source_compiler_main");
  const expectedReceiptPath = join(directory, "cheng.compiler-main.build-receipt.txt");
  if (receiptSnapshot.path !== expectedReceiptPath) throw new Error(`official build receipt must be the canonical current-source artifact: ${expectedReceiptPath}`);
  if (!Buffer.isBuffer(receiptSnapshot.raw) || sha256(receiptSnapshot.raw) !== receiptSnapshot.sha256) throw new Error("official build receipt snapshot bytes/hash mismatch");
  const currentReceipt = stableSnapshot(expectedReceiptPath, "official build receipt current", 4 * 1024 * 1024);
  if (currentReceipt.sha256 !== receiptSnapshot.sha256 || !sameStat(currentReceipt.stat, receiptSnapshot.stat)) throw new Error("official build receipt changed after release input pinning");
  const rows = validatePayloadKv(receiptSnapshot.raw, "official build receipt", "receipt_payload_sha256");
  exactKeys(rows, [
    "schema", "status", "entry_path", "entry_mode", "entry_source_sha256", "source_snapshot_count",
    "source_bundle_cid", "compiler_source_manifest_sha256", "workspace_source_manifest_sha256",
    "target", "driver_path", "driver_sha256", "backend2_version_manifest_path",
    "backend2_version_manifest_sha256", "output_path", "output_sha256", "output_bytes",
    "compiler_report_path", "compiler_report_sha256", "compile_receipt_cid",
    "compiler_output_receipt_cid",
    "full_backend_codegen", "cold_system_link_exec", "system_link_exec_scope", "memory_guard_mode",
    "memory_limit_bytes", "process_tree_enforced_peak_bytes", "receipt_payload_sha256",
  ], "official build receipt");
  const entryPath = join(root, "src/core/tooling/compiler_main.cheng");
  const candidatePath = join(directory, "cheng.compiler-main");
  const compilerReportPath = join(directory, "cheng.compiler-main.materialize.report.txt");
  const seedPath = join(root, "artifacts/bootstrap/cheng.stage3");
  const exact = new Map([
    ["schema", "current_source_compiler_build_receipt"], ["status", "complete"],
    ["entry_path", entryPath], ["entry_mode", "unelaborated"], ["target", TARGET],
    ["driver_path", seedPath], ["backend2_version_manifest_path", backend2VersionManifest.manifestPath],
    ["backend2_version_manifest_sha256", backend2VersionManifest.manifestSha256],
    ["output_path", candidatePath], ["compiler_report_path", compilerReportPath],
    ["full_backend_codegen", "1"],
    ["cold_system_link_exec", "0"], ["system_link_exec_scope", "selfhost_direct"],
    ["memory_guard_mode", "process_tree"], ["memory_limit_bytes", String(DEFAULT_RSS_CAP_BYTES)],
  ]);
  for (const [key, value] of exact) if (rows.get(key) !== value) throw new Error(`official build receipt ${key} mismatch`);
  const entry = stableSnapshot(entryPath, "official build unelaborated entry", MAX_SNAPSHOT_BYTES);
  if (rows.get("entry_source_sha256") !== entry.sha256) throw new Error("official build entry bytes do not match the current unelaborated compiler_main source");
  const sourceSnapshotCount = uintValue(rows.get("source_snapshot_count"), "official build source_snapshot_count", 1000000n);
  if (sourceSnapshotCount <= 0n) throw new Error("official build receipt has no compiler-owned source snapshots");
  const sourceBundleCid = requireSha256(rows.get("source_bundle_cid"), "official build source bundle CID");
  if (rows.get("compiler_source_manifest_sha256") !== sourceBundleCid) throw new Error("official build compiler source manifest does not equal the source-bundle root");
  const compileReceiptCid = requireSha256(rows.get("compile_receipt_cid"), "official build compile receipt CID");
  const workspaceSourceManifest = validateCurrentWorkspaceSourceHashManifest(root, directory, rows.get("workspace_source_manifest_sha256"));
  canonicalAbsolute(seedPath, "official build seed driver", "file", true);
  const seed = stableStreamingSnapshot(seedPath, "official build seed driver");
  if (rows.get("driver_sha256") !== seed.sha256) throw new Error("official build seed driver changed");
  canonicalAbsolute(candidatePath, "official current-source driver candidate", "file", true);
  const candidate = stableStreamingSnapshot(candidatePath, "official current-source driver candidate");
  const outputSha256 = requireSha256(rows.get("output_sha256"), "official build output SHA-256");
  if (candidate.sha256 !== outputSha256 || officialDriverSnapshot.sha256 !== outputSha256) throw new Error("official driver bytes do not equal the compiler-produced current-source output");
  if (candidate.stat.dev === officialDriverSnapshot.stat.dev && candidate.stat.ino === officialDriverSnapshot.stat.ino) throw new Error("official driver and current-source build output must be different inodes");
  if (uintValue(rows.get("output_bytes"), "official build output bytes") !== candidate.stat.size) throw new Error("official build output size mismatch");
  const compilerOutputReceiptCid = requireSha256(rows.get("compiler_output_receipt_cid"), "official build compiler output receipt CID");
  const expectedCompilerOutputReceiptCid = recomputeCompilerOutputReceiptCid(compileReceiptCid, outputSha256, backend2VersionManifest.manifestSha256);
  if (compilerOutputReceiptCid !== expectedCompilerOutputReceiptCid) throw new Error("official build compiler output receipt CID does not independently bind the compiled output tuple");

  const compilerReport = stableSnapshot(compilerReportPath, "official compiler-produced materialize report", 256 * 1024 * 1024);
  if (compilerReport.sha256 !== requireSha256(rows.get("compiler_report_sha256"), "official compiler report SHA-256")) throw new Error("official compiler-produced materialize report hash mismatch");
  const {rows: compilerRows} = parseUniqueUnhashedKv(compilerReport.raw, "official compiler-produced materialize report");
  const compileReceipt = validateAndRecomputeCompileReceipt(compilerRows, {
    sourceBundleCid, sourceSnapshotCount: sourceSnapshotCount.toString(), entrySourceCid: entry.sha256, compileReceiptCid,
  });
  const compilerExpected = new Map([
    ["entry", entryPath], ["entry_mode", "unelaborated"], ["entry_source_cid", entry.sha256],
    ["source_snapshot_count", sourceSnapshotCount.toString()], ["source_bundle_cid", sourceBundleCid],
    ["source_manifest_sha256", sourceBundleCid],
    ["compile_receipt_cid", compileReceiptCid],
    ["compiler_output_receipt_cid", compilerOutputReceiptCid], ["target", TARGET], ["emit", "exe"],
    ["output", candidatePath], ["output_sha256", outputSha256],
    ["backend2_version_manifest_sha256", backend2VersionManifest.manifestSha256],
    ["system_link_exec_runtime_execute", "1"], ["system_link_exec", "1"], ["real_backend_codegen", "1"],
    ["full_backend_codegen", "1"], ["cold_system_link_exec", "0"], ["system_link_exec_scope", "selfhost_direct"],
  ]);
  for (const [key, value] of compilerExpected) if (compilerRows.get(key) !== value) throw new Error(`official compiler-produced materialize report ${key} mismatch`);

  const guardPath = join(directory, "cheng.compiler-main.process-tree-guard.report.txt");
  const buildStdout = canonicalAbsolute(join(directory, "cheng.compiler-main.materialize.stdout.txt"), "official driver build stdout", "file", false, true);
  const buildStderr = canonicalAbsolute(join(directory, "cheng.compiler-main.materialize.stderr.txt"), "official driver build stderr", "file", false, true);
  const guard = validateProductionGuardReport(directory, guardPath, {
    tag: "official-driver-build", expectedRc: 0, expectedStdoutPath: buildStdout, expectedStderrPath: buildStderr,
  });
  const peakBytes = uintValue(guard.peakBytes, "official driver build guard peak");
  const sampleCount = uintValue(guard.sampleCount, "official driver build guard sample count");
  if (rows.get("process_tree_enforced_peak_bytes") !== peakBytes.toString()) throw new Error("official driver build guard peak/sample binding mismatch");
  const stdout = stableSnapshot(buildStdout, "official driver build stdout", 256 * 1024 * 1024, true);
  const stderr = stableSnapshot(buildStderr, "official driver build stderr", 256 * 1024 * 1024, true);
  return {
    schema: rows.get("schema"), receiptPath: receiptSnapshot.path, receiptSha256: receiptSnapshot.sha256,
    compilerReportPath: compilerReport.path, compilerReportSha256: compilerReport.sha256,
    entryPath, entrySourceCid: entry.sha256, entryMode: "unelaborated", sourceSnapshotCount: sourceSnapshotCount.toString(),
    sourceBundleCid, workspaceSourceManifestSha256: workspaceSourceManifest.manifestSha256,
    compileReceiptCid, compileReceiptProviderCount: compileReceipt.providerCount, compilerOutputReceiptCid,
    backend2VersionManifestSha256: backend2VersionManifest.manifestSha256,
    outputPath: candidate.path, outputSha256, seedPath: seed.path, seedSha256: seed.sha256,
    guardPath: guard.path, guardSha256: guard.sha256, guardPeakBytes: peakBytes.toString(), guardSampleCount: sampleCount.toString(),
    stdoutSha256: stdout.sha256, stderrSha256: stderr.sha256, sourceFileCount: workspaceSourceManifest.fileCount,
  };
}

function validateProductionGateDependencyBundle(sources) {
  exactKeys(sources, Object.values(PRODUCTION_GATE_DEPENDENCY_FILES), "production gate dependency bundle");
  const files = [];
  for (const relativePath of Object.values(PRODUCTION_GATE_DEPENDENCY_FILES)) {
    const source = sources.get(relativePath);
    const raw = source?.raw ?? source;
    if (!Buffer.isBuffer(raw) && typeof raw !== "string" && !(raw instanceof Uint8Array)) throw new Error(`production gate dependency is unreadable: ${relativePath}`);
    const actualSha256 = sha256(Buffer.from(raw));
    if (source?.sha256 && source.sha256 !== actualSha256) throw new Error(`production gate dependency snapshot hash mismatch: ${relativePath}`);
    if (actualSha256 !== PRODUCTION_GATE_DEPENDENCY_EXPECTED_SHA256[relativePath]) throw new Error(`production gate dependency exact source hash mismatch: ${relativePath}`);
    if (relativePath === PRODUCTION_GATE_DEPENDENCY_FILES.gate) {
      const gateText = Buffer.from(raw).toString("utf8");
      for (const required of [
        "legacy_definition_or_field_present:",
        "mutation.task_local_definition=blocked",
        "mutation.task_local_field=blocked",
        "mutation.predictor_state=blocked",
        "mutation.predictor_lookup=blocked",
        "mutation.legacy_report=blocked",
        "mutation.x86_plan_path=blocked",
        "mutation.artifact_target_identity=blocked",
        "mutation.artifact_darwin_packed=blocked",
        "mutation.emitter_target_identity=blocked",
        "mutation.emitter_x86_recipe_path=blocked",
        "mutation.backend2_generic_entry=blocked",
        "mutation.x86_reloc_delete=blocked",
        "mutation.x86_target_swap=blocked",
        "mutation.x86_symbol_swap=blocked",
        "mutation.x86_relocation_swap=blocked",
        "mutation.x86_action_consumer_bypass=blocked",
        "mutation.x86_cfg_branch_delete=blocked",
        "mutation.x86_cfg_target_redirect=blocked",
        "mutation.x86_cfg_duplicate_consumer=blocked",
        "mutation.x86_primary_reloc_consumer_bypass=blocked",
        "mutation.x86_backend2_reloc_consumer_bypass=blocked",
      ]) {
        if (!gateText.includes(required)) throw new Error(`production gate legacy-source zero-existence contract missing: ${required}`);
      }
    }
    files.push({path: relativePath, sha256: actualSha256});
  }
  return {schema: "cheng_regalloc_production_gate_dependencies", files};
}

function validateReleaseEvidenceFieldPresence(input) {
  if (!input.releaseWorkRoot) throw new Error("releaseWorkRoot is required in release mode");
  for (const [pathKey, shaKey] of RELEASE_EVIDENCE_INPUTS) {
    if (!input[pathKey] || !input[shaKey]) throw new Error(`${pathKey} and ${shaKey} are required in release mode`);
    requireSha256(input[shaKey], shaKey);
  }
  for (const key of ["gen2Driver", "gen3Driver", "officialDriver"]) {
    if (!input[key]) throw new Error(`${key} is required in release mode`);
  }
  return true;
}

function validateExecutionStageReleaseBindings(executionStagePolicy, executionStageValidation, officialDriverSha256, currentSourceManifest) {
  const officialSha256 = requireSha256(officialDriverSha256, "official current-source driver SHA-256");
  if (executionStagePolicy?.identityInputs?.driverBytes?.bytesRaw32 !== officialSha256) {
    throw new Error("seven-stage execution identity is not bound to the official current-source driver bytes");
  }
  if (executionStagePolicy?.targetTriple !== TARGET) {
    throw new Error("seven-stage execution identity target differs from the release target");
  }
  if (executionStagePolicy?.identityInputs?.compilerSourceClosure?.bytesRaw32 !== currentSourceManifest?.sha256) {
    throw new Error("seven-stage execution identity is not bound to the current source manifest bytes");
  }
  const currentSourceHashes = new Map(
    (currentSourceManifest?.files || []).map((entry) => [entry.relativePath, entry.sha256]),
  );
  if (!Array.isArray(executionStagePolicy?.stages) || executionStagePolicy.stages.length !== 7) {
    throw new Error("seven-stage execution policy does not contain exactly seven producer bindings");
  }
  for (const stage of executionStagePolicy.stages) {
    if (currentSourceHashes.get(stage?.producerSource?.path) !== stage?.producerSource?.bytesRaw32) {
      throw new Error(`seven-stage producer source is not an exact current source-manifest member: ${stage?.stageKind || "unknown"}`);
    }
  }
  return {
    schema: "cheng_regalloc_execution_stage_release_identity",
    receiptSha256: requireSha256(executionStageValidation?.receiptFileBytesRaw32, "seven-stage receipt SHA-256"),
    executionRaw32: requireSha256(executionStageValidation?.executionRaw32, "seven-stage execution identity"),
    sevenStageRootRaw32: requireSha256(executionStageValidation?.sevenStageRootRaw32, "seven-stage root"),
    stageReceiptRaw32s: executionStageValidation.stageReceiptRaw32s,
    stageArtifactByteLengths: executionStageValidation.stageArtifactByteLengths,
  };
}

function pathIsWithin(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function writeAll(fd, raw) {
  let offset = 0;
  while (offset < raw.length) offset += writeSync(fd, raw, offset, raw.length - offset);
}

function writeAllAt(fd, raw, position) {
  let offset = 0;
  while (offset < raw.length) offset += writeSync(fd, raw, offset, raw.length - offset, position + offset);
}

function fsyncDirectory(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function claimFdSnapshot(fd, label) {
  const before = fstatSync(fd, {bigint: true});
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size <= 0n || before.size > 65536n) {
    throw new Error(`${label} must be one nonempty regular inode with one link`);
  }
  const raw = Buffer.alloc(Number(before.size));
  let offset = 0;
  while (offset < raw.length) {
    const count = readSync(fd, raw, offset, raw.length - offset, offset);
    if (count <= 0) throw new Error(`${label} ended before its fstat size`);
    offset += count;
  }
  const after = fstatSync(fd, {bigint: true});
  if (!sameStat(before, after) || after.nlink !== 1n) throw new Error(`${label} changed while its bytes were read`);
  return {raw, sha256: sha256(raw), stat: after};
}

function exactFdSnapshot(fd, label, maxBytes = MAX_SNAPSHOT_BYTES, requireOneLink = true, allowEmpty = false) {
  const before = fstatSync(fd, {bigint: true});
  if (!before.isFile() || before.isSymbolicLink() || (requireOneLink && before.nlink !== 1n) || (!allowEmpty && before.size <= 0n) || before.size > BigInt(maxBytes)) {
    throw new Error(`${label} must be one bounded ${allowEmpty ? "" : "nonempty "}regular inode${requireOneLink ? " with one link" : ""}`);
  }
  const raw = Buffer.alloc(Number(before.size));
  let offset = 0;
  while (offset < raw.length) {
    const count = readSync(fd, raw, offset, raw.length - offset, offset);
    if (count <= 0) throw new Error(`${label} ended before its fstat size`);
    offset += count;
  }
  const after = fstatSync(fd, {bigint: true});
  if (!sameStat(before, after) || (requireOneLink && after.nlink !== 1n)) throw new Error(`${label} changed while its bytes were read`);
  return {raw, sha256: sha256(raw), stat: after};
}

function exactPathHeldFdIdentity(pathValue, fd, expected, label, executable = false, allowEmpty = false) {
  const path = canonicalAbsolute(pathValue, label, "file", executable, allowEmpty);
  const pathFd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let pathSnapshot;
  try { pathSnapshot = exactFdSnapshot(pathFd, `${label} path inode`, MAX_SNAPSHOT_BYTES, true, allowEmpty); }
  finally { closeSync(pathFd); }
  const heldSnapshot = exactFdSnapshot(fd, `${label} held inode`, MAX_SNAPSHOT_BYTES, true, allowEmpty);
  const pathStat = lstatSync(path, {bigint: true});
  if (!sameStat(pathSnapshot.stat, heldSnapshot.stat) || !sameStat(pathSnapshot.stat, pathStat) ||
      pathSnapshot.sha256 !== heldSnapshot.sha256 || !pathSnapshot.raw.equals(heldSnapshot.raw) ||
      expected && (heldSnapshot.sha256 !== expected.sha256 || !sameStat(heldSnapshot.stat, expected.stat))) {
    throw new Error(`${label} path no longer exactly names the held immutable bytes`);
  }
  return {...heldSnapshot, path};
}

function copyHeldFdToExclusivePath(sourceFd, sourceExpected, destination, label, mode, requireSourceOneLink = true, allowSourceEmpty = false) {
  const before = exactFdSnapshot(sourceFd, `${label} source`, MAX_SNAPSHOT_BYTES, requireSourceOneLink, allowSourceEmpty);
  if (before.sha256 !== sourceExpected.sha256 || !sameStat(before.stat, sourceExpected.stat)) throw new Error(`${label} source identity mismatch`);
  const out = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try {
    writeAll(out, before.raw);
    fchmodSync(out, mode);
    fsyncSync(out);
  } finally { closeSync(out); }
  const after = exactFdSnapshot(sourceFd, `${label} source final`, MAX_SNAPSHOT_BYTES, requireSourceOneLink, allowSourceEmpty);
  if (after.sha256 !== before.sha256 || !sameStat(after.stat, before.stat) || !after.raw.equals(before.raw)) throw new Error(`${label} source changed during copy`);
  const copied = allowSourceEmpty ? stableSnapshot(destination, label, MAX_SNAPSHOT_BYTES, true) : stableStreamingSnapshot(destination, label);
  if (copied.sha256 !== before.sha256 || copied.stat.nlink !== 1n) throw new Error(`${label} copied bytes mismatch`);
  return copied;
}

function validateReleaseWorkClaim(claim) {
  if (!claim || claim.fd === null || claim.rootFd === null) throw new Error("release claim file descriptors are closed");
  const directoryFlag = constants.O_DIRECTORY;
  if (!Number.isInteger(directoryFlag)) throw new Error("O_DIRECTORY is required for release roots");
  const rootPathStat = lstatSync(claim.workRoot, {bigint: true});
  if (rootPathStat.isSymbolicLink() || !rootPathStat.isDirectory() || realpathSync.native(claim.workRoot) !== claim.workRoot) {
    throw new Error("release root path changed type or canonical identity");
  }
  const rootPathFd = openSync(claim.workRoot, constants.O_RDONLY | constants.O_NOFOLLOW | directoryFlag);
  try {
    const heldRootStat = fstatSync(claim.rootFd, {bigint: true});
    const openedRootStat = fstatSync(rootPathFd, {bigint: true});
    if (!heldRootStat.isDirectory() || !openedRootStat.isDirectory() ||
        !sameStat(heldRootStat, openedRootStat) || !sameStat(openedRootStat, rootPathStat)) {
      throw new Error("release root path no longer names the held directory inode");
    }
  } finally { closeSync(rootPathFd); }

  const pathFd = openSync(claim.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let pathSnapshot;
  try { pathSnapshot = claimFdSnapshot(pathFd, "release claim path inode"); }
  finally { closeSync(pathFd); }
  const heldSnapshot = claimFdSnapshot(claim.fd, "held release claim inode");
  const pathStat = lstatSync(claim.path, {bigint: true});
  if (pathStat.isSymbolicLink() || !pathStat.isFile() || pathStat.nlink !== 1n ||
      !sameStat(pathSnapshot.stat, heldSnapshot.stat) || !sameStat(pathSnapshot.stat, pathStat) ||
      pathSnapshot.sha256 !== heldSnapshot.sha256 || !pathSnapshot.raw.equals(heldSnapshot.raw)) {
    throw new Error("release claim path no longer exactly names the held claim bytes");
  }
  if (!heldSnapshot.raw.equals(claim.expectedRaw) || heldSnapshot.sha256 !== sha256(claim.expectedRaw)) {
    throw new Error("release claim bytes differ from the exact acquired/finalized contract");
  }
  if (claim.expectedStat && !sameStat(heldSnapshot.stat, claim.expectedStat)) {
    throw new Error("release claim metadata differs from the exact acquired/finalized contract");
  }
  return {
    schema: "cheng_regalloc_release_claim_identity",
    path: claim.path,
    sha256: heldSnapshot.sha256,
    device: heldSnapshot.stat.dev.toString(),
    inode: heldSnapshot.stat.ino.toString(),
    size: heldSnapshot.stat.size.toString(),
    mode: heldSnapshot.stat.mode.toString(),
    nlink: heldSnapshot.stat.nlink.toString(),
    mtimeNs: heldSnapshot.stat.mtimeNs.toString(),
    ctimeNs: heldSnapshot.stat.ctimeNs.toString(),
    rootDevice: rootPathStat.dev.toString(),
    rootInode: rootPathStat.ino.toString(),
    rootSize: rootPathStat.size.toString(),
    rootMode: rootPathStat.mode.toString(),
    rootNlink: rootPathStat.nlink.toString(),
    rootMtimeNs: rootPathStat.mtimeNs.toString(),
    rootCtimeNs: rootPathStat.ctimeNs.toString(),
    finalized: claim.finalized,
  };
}

const RELEASE_CLAIM_IDENTITY_KEYS = Object.freeze([
  "schema", "path", "sha256", "device", "inode", "size", "mode", "nlink", "mtimeNs", "ctimeNs",
  "rootDevice", "rootInode", "rootSize", "rootMode", "rootNlink", "rootMtimeNs", "rootCtimeNs", "finalized",
]);

function sameReleaseClaimIdentity(left, right) {
  return RELEASE_CLAIM_IDENTITY_KEYS.every((key) => left?.[key] === right?.[key]);
}

function closeReleaseWorkClaim(claim) {
  if (claim?.fd !== null && claim?.fd !== undefined) {
    closeSync(claim.fd);
    claim.fd = null;
  }
  if (claim?.rootFd !== null && claim?.rootFd !== undefined) {
    closeSync(claim.rootFd);
    claim.rootFd = null;
  }
}

function acquireReleaseWorkClaim(root, input) {
  if (!input.releaseWorkRoot) throw new Error("releaseWorkRoot is required in release mode");
  const workRoot = canonicalAbsolute(input.releaseWorkRoot, "releaseWorkRoot", "dir");
  if (pathIsWithin(root, workRoot) || pathIsWithin(FUSION_ROOT, workRoot)) throw new Error("releaseWorkRoot must be outside both Cheng and Fusion trees");
  for (const flag of [constants.O_CREAT, constants.O_EXCL, constants.O_NOFOLLOW]) if (!Number.isInteger(flag)) throw new Error("O_CREAT|O_EXCL|O_NOFOLLOW are required for release claims");
  if (!Number.isInteger(constants.O_DIRECTORY)) throw new Error("O_DIRECTORY is required for release roots");
  const rootFd = openSync(workRoot, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
  let fd = null;
  try {
    const rootPathStat = lstatSync(workRoot, {bigint: true});
    const rootFdStat = fstatSync(rootFd, {bigint: true});
    if (!rootPathStat.isDirectory() || !rootFdStat.isDirectory() || !sameStat(rootPathStat, rootFdStat) || realpathSync.native(workRoot) !== workRoot) {
      throw new Error("releaseWorkRoot path changed while its directory fd was acquired");
    }
    if (readdirSync(workRoot).length !== 0) throw new Error("releaseWorkRoot must be empty before release work starts");
    const runId = randomBytes(16).toString("hex");
    const path = join(workRoot, ".cheng-regalloc-preflight.claim");
    fd = openSync(path, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const expectedRaw = Buffer.from(`schema=cheng_regalloc_release_claim\nrun_id=${runId}\n`, "utf8");
    writeAllAt(fd, expectedRaw, 0);
    fsyncSync(fd);
    fsyncDirectory(workRoot);
    const stat = fstatSync(fd, {bigint: true});
    const claim = {schema: "cheng_regalloc_release_claim", runId, workRoot, path, fd, rootFd, stat, expectedRaw, finalized: false};
    validateReleaseWorkClaim(claim);
    claim.expectedStat = fstatSync(fd, {bigint: true});
    return claim;
  } catch (error) {
    if (fd !== null) closeSync(fd);
    closeSync(rootFd);
    throw error;
  }
}

function statIdentity(stat) {
  return Object.fromEntries(["dev", "ino", "size", "mode", "nlink", "mtimeNs", "ctimeNs"].map((key) => [key, stat[key].toString()]));
}

function statIdentityValue(value, label) {
  const expected = {};
  for (const key of ["dev", "ino", "size", "mode", "nlink", "mtimeNs", "ctimeNs"]) {
    if (!/^(0|[1-9]\d*)$/.test(String(value?.[key] || ""))) throw new Error(`${label} has an invalid ${key}`);
    expected[key] = BigInt(value[key]);
  }
  return expected;
}

function adoptReleaseWorkClaim(root, input, oneShotContext) {
  const workRoot = canonicalAbsolute(input.releaseWorkRoot, "releaseWorkRoot", "dir");
  if (workRoot !== oneShotContext.releaseWorkRoot || pathIsWithin(root, workRoot) || pathIsWithin(FUSION_ROOT, workRoot)) throw new Error("one-shot release root binding mismatch");
  const oneShotDirectory = canonicalAbsolute(oneShotContext.directory, "one-shot worker directory", "dir");
  if (dirname(oneShotDirectory) !== workRoot || basename(oneShotDirectory) !== "one-shot-worker") throw new Error("one-shot worker directory is not the exact retained release child");
  const entries = readdirSync(workRoot).sort();
  if (entries.length !== 2 || entries[0] !== ".cheng-regalloc-preflight.claim" || entries[1] !== "one-shot-worker") throw new Error("one-shot worker adopted release root has an unexpected initial artifact set");
  const rootFd = openSync(workRoot, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
  let fd = null;
  try {
    const path = join(workRoot, ".cheng-regalloc-preflight.claim");
    fd = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW);
    const expectedRaw = Buffer.from(oneShotContext.claimRawBase64, "base64");
    const expectedStat = statIdentityValue(oneShotContext.claimStat, "one-shot release claim stat");
    const claim = {schema: "cheng_regalloc_release_claim", runId: oneShotContext.claimRunId, workRoot, path, fd, rootFd, expectedRaw, expectedStat, finalized: false, oneShotDirectory};
    const identity = validateReleaseWorkClaim(claim);
    const expectedRunRaw = Buffer.from(`schema=cheng_regalloc_release_claim\nrun_id=${oneShotContext.claimRunId}\n`, "utf8");
    if (!expectedRaw.equals(expectedRunRaw) || identity.sha256 !== sha256(expectedRaw)) throw new Error("one-shot release claim raw/run binding mismatch");
    return claim;
  } catch (error) {
    if (fd !== null) closeSync(fd);
    closeSync(rootFd);
    throw error;
  }
}

function finalizeReleaseWorkClaim(claim, inputSha256) {
  if (claim.finalized) throw new Error("release claim was already finalized");
  validateReleaseWorkClaim(claim);
  const suffix = Buffer.from(`input_sha256=${requireSha256(inputSha256, "release input digest")}\n`, "utf8");
  writeAllAt(claim.fd, suffix, claim.expectedRaw.length);
  fsyncSync(claim.fd);
  fsyncDirectory(claim.workRoot);
  claim.finalized = true;
  claim.inputSha256 = inputSha256;
  claim.expectedRaw = Buffer.concat([claim.expectedRaw, suffix]);
  claim.expectedStat = fstatSync(claim.fd, {bigint: true});
  return {schema: claim.schema, runId: claim.runId, path: claim.path, inputSha256, identity: validateReleaseWorkClaim(claim)};
}

function materializePrivateProductionExecBundle(releaseInputs) {
  const bundlePath = join(releaseInputs.releaseWorkRoot, "private-exec-bundle");
  mkdirSync(bundlePath, {mode: 0o700});
  const files = new Map();
  try {
    for (const [key, relativePath] of Object.entries(PRODUCTION_GATE_DEPENDENCY_FILES)) {
      const source = releaseInputs.dependencySnapshots.get(relativePath);
      if (!source?.raw) throw new Error(`validated production dependency bytes are absent: ${relativePath}`);
      const path = join(bundlePath, basename(relativePath));
      const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, key === "lockValidator" ? 0o600 : 0o700);
      try {
        writeAll(fd, source.raw);
        fchmodSync(fd, key === "lockValidator" ? 0o600 : 0o700);
        fsyncSync(fd);
      } finally { closeSync(fd); }
      const snapshot = stableSnapshot(path, `private production exec bundle ${key}`, 64 * 1024 * 1024);
      if (snapshot.sha256 !== source.sha256) throw new Error(`private production exec bundle hash mismatch: ${relativePath}`);
      files.set(key, snapshot);
    }
    exactDistinctSnapshots([...files.values()], "private production exec bundle");
    fsyncDirectory(bundlePath);
    fsyncDirectory(releaseInputs.releaseWorkRoot);
    return {schema: "cheng_regalloc_private_exec_bundle", path: canonicalAbsolute(bundlePath, "private production exec bundle", "dir"), files};
  } catch (error) {
    fsyncDirectory(releaseInputs.releaseWorkRoot);
    throw error;
  }
}

function materializePrivateRuntimeGateBundle(releaseInputs, sourceInputs) {
  const directory = join(releaseInputs.releaseWorkRoot, "private-runtime-bundle");
  mkdirSync(directory, {mode: 0o700});
  const relativePaths = [...new Set([
    ...Object.values(AARCH64_F64_RUNTIME_GATE_FILES),
    ...Object.values(X86_64_F64_RUNTIME_GATE_FILES),
  ])].sort();
  const files = new Map();
  for (const relativePath of relativePaths) {
    const source = sourceInputs.byLabel.get(relativePath);
    if (!source?.raw) throw new Error(`private runtime-gate source is absent: ${relativePath}`);
    const destination = join(directory, relativePath);
    const parent = dirname(destination);
    mkdirSync(parent, {recursive: true, mode: 0o700});
    const executable = relativePath.startsWith("tools/");
    const fd = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, executable ? 0o700 : 0o600);
    try {
      writeAll(fd, source.raw);
      fchmodSync(fd, executable ? 0o700 : 0o600);
      fsyncSync(fd);
    } finally { closeSync(fd); }
    const copied = stableSnapshot(destination, `private runtime-gate ${relativePath}`, 256 * 1024 * 1024);
    if (copied.sha256 !== source.sha256) throw new Error(`private runtime-gate source hash mismatch: ${relativePath}`);
    files.set(relativePath, copied);
  }
  for (const subdir of [join(directory, "src/tests"), join(directory, "src"), join(directory, "tools"), directory]) {
    fsyncDirectory(subdir);
  }
  const evidence = validatePrivateRuntimeGateBundle(directory, files);
  fsyncDirectory(releaseInputs.releaseWorkRoot);
  return evidence;
}

function validatePrivateRuntimeGateBundle(directoryValue, expectedFiles) {
  const directory = canonicalAbsolute(directoryValue, "private runtime-gate bundle", "dir");
  const actualPaths = walkRegularFiles(directory, "private runtime-gate bundle");
  const actualRelative = actualPaths.map((path) => relative(directory, path).split("\\").join("/")).sort();
  const expectedRelative = [...expectedFiles.keys()].sort();
  if (actualRelative.length !== expectedRelative.length || actualRelative.some((path, index) => path !== expectedRelative[index])) {
    throw new Error("private runtime-gate exact artifact whitelist mismatch");
  }
  const artifacts = [];
  const inodes = new Set();
  for (const relativePath of expectedRelative) {
    const expected = expectedFiles.get(relativePath);
    const executable = relativePath.startsWith("tools/");
    const path = canonicalAbsolute(join(directory, relativePath), `private runtime-gate ${relativePath}`, "file", executable);
    const snapshot = stableSnapshot(path, `private runtime-gate ${relativePath} final`, 256 * 1024 * 1024);
    if (snapshot.sha256 !== expected.sha256 || !sameStat(snapshot.stat, expected.stat)) throw new Error(`private runtime-gate artifact changed: ${relativePath}`);
    const inode = `${snapshot.stat.dev}:${snapshot.stat.ino}`;
    if (snapshot.stat.nlink !== 1n || inodes.has(inode)) throw new Error(`private runtime-gate artifact has a hardlink collision: ${relativePath}`);
    inodes.add(inode);
    artifacts.push({relativePath, path, sha256: snapshot.sha256, device: snapshot.stat.dev.toString(), inode: snapshot.stat.ino.toString(), size: snapshot.stat.size.toString(), mtimeNs: snapshot.stat.mtimeNs.toString(), ctimeNs: snapshot.stat.ctimeNs.toString()});
  }
  const artifactSetSha256 = sha256(Buffer.from(artifacts.map((entry) => `${entry.relativePath}\0${entry.sha256}\0${entry.device}\0${entry.inode}\0${entry.size}\0${entry.mtimeNs}\0${entry.ctimeNs}\n`).join(""), "utf8"));
  return {schema: "cheng_regalloc_private_runtime_gate_bundle", directory, files: expectedFiles, artifacts, artifactSetSha256};
}

function copyStableExecutableToPrivatePath(sourcePath, label, destination, expectedPin) {
  const source = openStreamingState(sourcePath, `${label} source`, MAX_SNAPSHOT_BYTES);
  const out = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o700);
  try {
    let offset = 0;
    while (BigInt(offset) < source.opened.size) {
      const count = readStreamingChunk(source, offset);
      writeAll(out, source.buffer.subarray(0, count));
      offset += count;
    }
    const finalSource = finishStreamingState(source);
    if (finalSource.sha256 !== expectedPin.sha256 || !sameStat(finalSource.stat, expectedPin.stat)) throw new Error(`${label} source changed during private snapshot`);
    fchmodSync(out, 0o700);
    fsyncSync(out);
  } finally {
    closeSync(out);
    closeSync(source.fd);
  }
  const copied = stableStreamingSnapshot(destination, `${label} private executable`);
  if (copied.sha256 !== expectedPin.sha256) throw new Error(`${label} private executable hash mismatch`);
  return copied;
}

function privateTreeParents(root, destination, directoryPaths) {
  let parent = dirname(destination);
  const parents = [];
  while (parent !== root) { parents.push(parent); parent = dirname(parent); }
  for (const path of parents.reverse()) {
    if (!directoryPaths.has(path)) mkdirSync(path, {recursive: false, mode: 0o700});
    directoryPaths.add(path);
  }
}

function privatePythonSourcePaths() {
  const interpreter = canonicalAbsolute(realpathSync.native("/opt/miniconda3/bin/python3"), "private Python source interpreter", "file", true);
  const version = basename(interpreter).match(/^python(\d+\.\d+)$/)?.[1];
  if (!version) throw new Error("private Python source interpreter has an unsupported versioned basename");
  const stdlibRoot = canonicalAbsolute(`/opt/miniconda3/lib/python${version}`, "private Python stdlib source", "dir");
  const psutilRoot = canonicalAbsolute(join(stdlibRoot, "site-packages/psutil"), "private Python psutil source", "dir");
  const files = [];
  const walk = (directory, relativePrefix, skipSitePackages) => {
    for (const entry of readdirSync(directory, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) throw new Error(`private Python source contains a symlink: ${join(directory, entry.name)}`);
      if (skipSitePackages && entry.name === "site-packages") continue;
      if (entry.name === "__pycache__" || entry.name.endsWith(".pyc")) continue;
      const path = join(directory, entry.name);
      const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path, relativePath, false);
      else if (entry.isFile()) files.push({sourcePath: canonicalAbsolute(path, `private Python source ${relativePath}`, "file", false, true), relativePath: `lib/python${version}/${relativePath}`});
      else throw new Error(`private Python source contains a non-regular entry: ${path}`);
    }
  };
  walk(stdlibRoot, "", true);
  const walkPsutil = (directory, relativePrefix) => {
    for (const entry of readdirSync(directory, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) throw new Error(`private Python psutil contains a symlink: ${join(directory, entry.name)}`);
      if (entry.name === "__pycache__" || entry.name.endsWith(".pyc")) continue;
      const path = join(directory, entry.name);
      const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walkPsutil(path, relativePath);
      else if (entry.isFile()) files.push({sourcePath: canonicalAbsolute(path, `private Python psutil ${relativePath}`, "file", false, true), relativePath: `lib/python${version}/site-packages/psutil/${relativePath}`});
      else throw new Error(`private Python psutil contains a non-regular entry: ${path}`);
    }
  };
  walkPsutil(psutilRoot, "");
  files.push({sourcePath: canonicalAbsolute("/opt/miniconda3/lib/libffi.8.dylib", "private Python libffi source", "file", true), relativePath: "lib/libffi.8.dylib"});
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return {interpreter, version, files};
}

function materializePrivatePythonRuntime(parentDirectory, name = "python-runtime") {
  const root = join(parentDirectory, name);
  mkdirSync(root, {mode: 0o700});
  const directoryPaths = new Set([root]);
  const source = privatePythonSourcePaths();
  const rows = [{sourcePath: source.interpreter, relativePath: "bin/python3", executable: true}, ...source.files.map((entry) => ({...entry, executable: false}))];
  const artifacts = [];
  for (const row of rows) {
    const sourceFd = openSync(row.sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const heldSource = exactFdSnapshot(sourceFd, `private Python source ${row.relativePath}`, MAX_SNAPSHOT_BYTES, false, true);
      const destination = join(root, row.relativePath);
      privateTreeParents(root, destination, directoryPaths);
      const copied = copyHeldFdToExclusivePath(sourceFd, heldSource, destination, `private Python ${row.relativePath}`, row.executable ? 0o700 : 0o600, false, true);
      artifacts.push({relativePath: row.relativePath, executable: row.executable, sourcePath: row.sourcePath, sourceSha256: heldSource.sha256, sourceStat: statIdentity(heldSource.stat), private: oneShotIdentity(copied)});
    } finally { closeSync(sourceFd); }
  }
  for (const path of [...directoryPaths].sort((left, right) => right.length - left.length)) fsyncDirectory(path);
  const artifactSetSha256 = sha256(Buffer.from(artifacts.map((entry) => `${entry.relativePath}\0${entry.sourceSha256}\0${entry.sourceStat.dev}\0${entry.sourceStat.ino}\0${entry.private.sha256}\0${entry.private.stat.dev}\0${entry.private.stat.ino}\n`).join(""), "utf8"));
  const runtime = {schema: "cheng_regalloc_private_python_runtime", root: canonicalAbsolute(root, "private Python runtime", "dir"), bin: canonicalAbsolute(join(root, "bin"), "private Python bin", "dir"), version: source.version, artifactSetSha256, artifacts};
  validatePrivatePythonRuntime(runtime);
  return runtime;
}

function validatePrivatePythonRuntime(runtime) {
  const root = canonicalAbsolute(runtime.root, "private Python runtime", "dir");
  const actualPaths = walkRegularFiles(root, "private Python runtime").map((path) => relative(root, path).split("\\").join("/")).sort((left, right) => left.localeCompare(right));
  const expected = [...runtime.artifacts].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const mismatchIndex = actualPaths.findIndex((path, index) => path !== expected[index]?.relativePath);
  if (actualPaths.length !== expected.length || mismatchIndex >= 0) throw new Error(`private Python runtime exact file set changed: actual=${actualPaths.length} expected=${expected.length} first=${mismatchIndex >= 0 ? `${actualPaths[mismatchIndex]}!=${expected[mismatchIndex]?.relativePath}` : "count"}`);
  for (const entry of expected) {
    const sourcePath = canonicalAbsolute(entry.sourcePath, `private Python source final ${entry.relativePath}`, "file", entry.executable, true);
    const sourceSnapshot = stableSnapshot(sourcePath, `private Python source final ${entry.relativePath}`, MAX_SNAPSHOT_BYTES, true);
    const sourceStat = statIdentityValue(entry.sourceStat, `private Python source stat ${entry.relativePath}`);
    if (sourceSnapshot.sha256 !== entry.sourceSha256 || !sameStat(sourceSnapshot.stat, sourceStat) || sourceSnapshot.stat.nlink !== sourceStat.nlink || sourceSnapshot.stat.mode !== sourceStat.mode) throw new Error(`private Python source identity changed: ${entry.relativePath}`);
    const privateSnapshot = exactIdentitySnapshot(entry.private, `private Python runtime ${entry.relativePath}`, entry.executable, true);
    if (privateSnapshot.sha256 !== entry.sourceSha256) throw new Error(`private Python runtime bytes differ: ${entry.relativePath}`);
  }
  const artifactSetSha256 = sha256(Buffer.from(expected.map((entry) => `${entry.relativePath}\0${entry.sourceSha256}\0${entry.sourceStat.dev}\0${entry.sourceStat.ino}\0${entry.private.sha256}\0${entry.private.stat.dev}\0${entry.private.stat.ino}\n`).join(""), "utf8"));
  if (artifactSetSha256 !== runtime.artifactSetSha256) throw new Error("private Python runtime artifact-set binding mismatch");
  return {schema: "cheng_regalloc_private_python_runtime_evidence", root, bin: runtime.bin, version: runtime.version, artifactCount: expected.length, artifactSetSha256};
}

function immutableRootOwnedExecutable(pathValue, label) {
  const path = canonicalAbsolute(realpathSync.native(pathValue), label, "file", true);
  let current = path;
  while (true) {
    const stat = lstatSync(current, {bigint: true});
    if (stat.uid !== 0n || (stat.mode & 0o022n) !== 0n) throw new Error(`${label} or an ancestor is not root-owned and write-protected: ${current}`);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return stableStreamingSnapshot(path, label);
}

function releaseXcodeLayout(compilerPath) {
  const defaultDeveloper = "/Library/Developer/CommandLineTools";
  let developer = defaultDeveloper;
  const marker = "/Contents/Developer/";
  const compilerReal = realpathSync.native(compilerPath);
  const markerIndex = compilerReal.indexOf(marker);
  if (markerIndex >= 0) developer = compilerReal.slice(0, markerIndex + "/Contents/Developer".length);
  const toolBin = developer === defaultDeveloper ? join(developer, "usr/bin") : join(developer, "Toolchains/XcodeDefault.xctoolchain/usr/bin");
  const actualCompiler = compilerReal === "/usr/bin/cc" || compilerReal === "/usr/bin/clang" ? realpathSync.native(join(toolBin, "clang")) : compilerReal;
  return {developer: canonicalAbsolute(developer, "release Xcode developer root", "dir"), toolBin: canonicalAbsolute(toolBin, "release Xcode tool bin", "dir"), actualCompiler};
}

function releaseToolTargets(compilerPath) {
  const xcode = releaseXcodeLayout(compilerPath);
  const fixed = new Map([
    ["bash", "/bin/bash"], ["cc", xcode.actualCompiler],
    ["strings", join(xcode.toolBin, "strings")], ["nm", join(xcode.toolBin, "nm")], ["objdump", join(xcode.toolBin, "objdump")],
    ["otool", join(xcode.toolBin, "otool")], ["shasum", "/usr/bin/shasum"], ["git", join(xcode.developer, "usr/bin/git")],
    ["uname", "/usr/bin/uname"], ["sysctl", "/usr/sbin/sysctl"], ["env", "/usr/bin/env"], ["arch", "/usr/bin/arch"],
    ["xcrun", "/usr/bin/xcrun"], ["awk", "/usr/bin/awk"], ["sed", "/usr/bin/sed"], ["grep", "/usr/bin/grep"],
    ["sort", "/usr/bin/sort"], ["tr", "/usr/bin/tr"], ["cut", "/usr/bin/cut"], ["wc", "/usr/bin/wc"],
    ["head", "/usr/bin/head"], ["tail", "/usr/bin/tail"], ["dirname", "/usr/bin/dirname"], ["basename", "/usr/bin/basename"],
    ["date", "/bin/date"], ["mkdir", "/bin/mkdir"], ["cp", "/bin/cp"], ["mv", "/bin/mv"], ["rm", "/bin/rm"],
    ["mktemp", "/usr/bin/mktemp"], ["chmod", "/bin/chmod"], ["touch", "/usr/bin/touch"], ["tee", "/usr/bin/tee"],
    ["ln", "/bin/ln"], ["seq", "/usr/bin/seq"], ["uniq", "/usr/bin/uniq"],
    ["ps", "/bin/ps"], ["sleep", "/bin/sleep"], ["perl", "/usr/bin/perl"], ["cat", "/bin/cat"],
    ["find", "/usr/bin/find"], ["xargs", "/usr/bin/xargs"], ["od", "/usr/bin/od"], ["file", "/usr/bin/file"],
    ["stat", "/usr/bin/stat"], ["cmp", "/usr/bin/cmp"],
  ]);
  return {xcode, fixed};
}

function materializePrivateReleaseToolchain(releaseInputs, coldDriverPath, compilerPath, driverPin, compilerPin) {
  const directory = join(releaseInputs.releaseWorkRoot, "private-toolchain");
  const bin = join(directory, "bin");
  mkdirSync(bin, {recursive: true, mode: 0o700});
  const pythonRuntime = materializePrivatePythonRuntime(directory);
  const coldDriver = copyStableExecutableToPrivatePath(coldDriverPath, "cold driver", join(directory, "cold-driver"), driverPin);
  const {xcode, fixed} = releaseToolTargets(compilerPath);
  const compiler = immutableRootOwnedExecutable(xcode.actualCompiler, "release actual C compiler");
  if (compilerPath !== "/usr/bin/cc" && compilerPath !== "/usr/bin/clang" && (compiler.sha256 !== compilerPin.sha256 || !sameStat(compiler.stat, compilerPin.stat))) {
    throw new Error("explicit release C compiler does not equal the resolved actual compiler");
  }
  const tools = new Map();
  for (const [name, targetValue] of fixed) {
    const target = immutableRootOwnedExecutable(targetValue, `release tool ${name}`);
    const wrapperRaw = Buffer.from(`#!/bin/bash\nexec ${JSON.stringify(target.path)} "$@"\n`, "utf8");
    const wrapper = writeExclusiveSnapshot(join(bin, name), wrapperRaw, `private release tool wrapper ${name}`, 0o700);
    tools.set(name, {name, kind: "root_owned_fixed", target, wrapper});
  }
  const pythonTarget = stableStreamingSnapshot(join(pythonRuntime.bin, "python3"), "private release Python interpreter");
  const pythonWrapper = writeExclusiveSnapshot(join(bin, "python3"), Buffer.from(`#!/bin/bash\nexec ${JSON.stringify(pythonTarget.path)} "$@"\n`, "utf8"), "private release Python wrapper", 0o700);
  tools.set("python3", {name: "python3", kind: "private_python_runtime", target: pythonTarget, wrapper: pythonWrapper});
  const rgSourcePath = realpathSync.native("/opt/homebrew/bin/rg");
  const rgSource = stableStreamingSnapshot(canonicalAbsolute(rgSourcePath, "release rg source", "file", true), "release rg source");
  const rgPrivate = copyStableExecutableToPrivatePath(rgSource.path, "release rg", join(bin, "rg"), rgSource);
  tools.set("rg", {name: "rg", kind: "private_copy", target: rgPrivate, source: rgSource, wrapper: rgPrivate});
  const fields = [["schema", "cheng_regalloc_private_toolchain"], ["path", bin], ["developer_dir", xcode.developer], ["tool_count", tools.size], ["cold_driver_path", coldDriver.path], ["cold_driver_sha256", coldDriver.sha256], ["python_runtime_sha256", pythonRuntime.artifactSetSha256]];
  const ordered = [...tools.values()].sort((left, right) => left.name.localeCompare(right.name));
  for (let index = 0; index < ordered.length; index++) {
    const tool = ordered[index];
    fields.push(
      [`tool.${index}.name`, tool.name], [`tool.${index}.kind`, tool.kind], [`tool.${index}.target_path`, tool.target.path],
      [`tool.${index}.target_sha256`, tool.target.sha256], [`tool.${index}.target_device`, tool.target.stat.dev], [`tool.${index}.target_inode`, tool.target.stat.ino],
      [`tool.${index}.wrapper_path`, tool.wrapper.path], [`tool.${index}.wrapper_sha256`, tool.wrapper.sha256],
    );
  }
  const manifest = writeExclusiveSnapshot(join(directory, "toolchain-manifest.txt"), renderHashedKv(fields, "manifest_payload_sha256"), "private release toolchain manifest");
  fsyncDirectory(bin);
  fsyncDirectory(directory);
  fsyncDirectory(releaseInputs.releaseWorkRoot);
  const toolchain = {schema: "cheng_regalloc_private_toolchain", directory: canonicalAbsolute(directory, "private release toolchain", "dir"), bin: canonicalAbsolute(bin, "private release tool bin", "dir"), developerDir: xcode.developer, coldDriver, compiler, compilerInput: compilerPin, pythonRuntime, tools, manifest};
  validatePrivateReleaseToolchain(toolchain);
  return toolchain;
}

function validatePrivateReleaseToolchain(toolchain) {
  const pythonRuntime = validatePrivatePythonRuntime(toolchain.pythonRuntime);
  const manifest = stableSnapshot(toolchain.manifest.path, "private release toolchain manifest final");
  if (manifest.sha256 !== toolchain.manifest.sha256 || !sameStat(manifest.stat, toolchain.manifest.stat)) throw new Error("private release toolchain manifest changed");
  const expectedNames = [...toolchain.tools.keys(), ""].filter(Boolean).sort();
  const binEntries = readdirSync(toolchain.bin, {withFileTypes: true});
  if (binEntries.some((entry) => !entry.isFile() || entry.isSymbolicLink()) || binEntries.map((entry) => entry.name).sort().some((name, index) => name !== expectedNames[index]) || binEntries.length !== expectedNames.length) {
    throw new Error("private release toolchain bin exact whitelist mismatch");
  }
  const inodeOwners = new Set();
  for (const tool of toolchain.tools.values()) {
    const target = stableStreamingSnapshot(tool.target.path, `release tool ${tool.name} final target`);
    const wrapper = stableStreamingSnapshot(tool.wrapper.path, `release tool ${tool.name} final wrapper`);
    if (target.sha256 !== tool.target.sha256 || !sameStat(target.stat, tool.target.stat) || wrapper.sha256 !== tool.wrapper.sha256 || !sameStat(wrapper.stat, tool.wrapper.stat)) throw new Error(`private release tool changed: ${tool.name}`);
    const wrapperInode = `${wrapper.stat.dev}:${wrapper.stat.ino}`;
    if (wrapper.stat.nlink !== 1n || inodeOwners.has(wrapperInode)) throw new Error(`private release tool wrapper hardlink collision: ${tool.name}`);
    inodeOwners.add(wrapperInode);
  }
  const coldDriver = stableStreamingSnapshot(toolchain.coldDriver.path, "private cold driver final");
  const compiler = stableStreamingSnapshot(toolchain.compiler.path, "release actual C compiler final");
  if (coldDriver.sha256 !== toolchain.coldDriver.sha256 || !sameStat(coldDriver.stat, toolchain.coldDriver.stat) || compiler.sha256 !== toolchain.compiler.sha256 || !sameStat(compiler.stat, toolchain.compiler.stat)) throw new Error("private release driver/compiler identity changed");
  return {schema: "cheng_regalloc_private_toolchain_evidence", manifestPath: manifest.path, manifestSha256: manifest.sha256, path: toolchain.bin, developerDir: toolchain.developerDir, toolCount: toolchain.tools.size, coldDriverSha256: coldDriver.sha256, compilerSha256: compiler.sha256, pythonRuntimeSha256: pythonRuntime.artifactSetSha256, pythonRuntimeArtifactCount: pythonRuntime.artifactCount};
}

function privateReleaseExecutionEnv(toolchain, extraEnv = {}) {
  if (!toolchain) throw new Error("private release toolchain is required for release execution");
  const fixed = [["PATH", toolchain.bin], ["DEVELOPER_DIR", toolchain.developerDir], ["PYTHONDONTWRITEBYTECODE", "1"], ["PYTHONNOUSERSITE", "1"], ["PYTHONSAFEPATH", "1"]];
  for (const [key, expected] of fixed) {
    if (Object.prototype.hasOwnProperty.call(extraEnv, key) && extraEnv[key] !== expected) {
      throw new Error(`release execution cannot override pinned ${key}`);
    }
  }
  return {...extraEnv, ...Object.fromEntries(fixed)};
}

function exactIdentitySnapshot(identity, label, executable = false, allowEmpty = false) {
  const path = canonicalAbsolute(identity.path, label, "file", executable, allowEmpty);
  const snapshot = allowEmpty ? stableSnapshot(path, label, MAX_SNAPSHOT_BYTES, true) : stableStreamingSnapshot(path, label);
  const expectedStat = statIdentityValue(identity.stat, `${label} stat`);
  if (snapshot.sha256 !== requireSha256(identity.sha256, `${label} SHA-256`) || !sameStat(snapshot.stat, expectedStat) || snapshot.stat.nlink !== 1n) {
    throw new Error(`${label} exact path/SHA/device/inode/size/mtime/ctime identity mismatch`);
  }
  return snapshot;
}

function validateOneShotBundleBuild(context, directory, bun, guard, bundleSource, privateSourceTree, privatePythonRuntime) {
  const build = context.bundleBuild;
  if (!build || build.schema !== "cheng_regalloc_one_shot_bundle_build" || build.timeoutSeconds !== ONE_SHOT_BUNDLE_BUILD_TIMEOUT_SECONDS) throw new Error("one-shot private Bun bundle-build schema/timeout mismatch");
  const outputDirectory = canonicalAbsolute(build.outputDirectory, "one-shot private Bun bundle output directory", "dir");
  if (dirname(outputDirectory) !== directory || basename(outputDirectory) !== "bundle-build-output") throw new Error("one-shot private Bun bundle output directory mismatch");
  const homeDirectory = canonicalAbsolute(build.homeDirectory, "one-shot private Bun bundle home directory", "dir");
  const tempDirectory = canonicalAbsolute(build.tempDirectory, "one-shot private Bun bundle temp directory", "dir");
  if (dirname(homeDirectory) !== directory || basename(homeDirectory) !== "bundle-build-home" || dirname(tempDirectory) !== directory || basename(tempDirectory) !== "bundle-build-tmp" || readdirSync(homeDirectory).length !== 0 || readdirSync(tempDirectory).length !== 0) throw new Error("one-shot private Bun bundle home/temp isolation changed");
  const outputEntries = readdirSync(outputDirectory, {withFileTypes: true});
  if (outputEntries.length !== 1 || outputEntries[0].name !== "bundle.source.bytes" || !outputEntries[0].isFile() || outputEntries[0].isSymbolicLink()) throw new Error("one-shot private Bun bundle output set changed");
  const builtBundle = exactIdentitySnapshot(build.bundleSource, "one-shot private Bun built bundle");
  if (builtBundle.path !== bundleSource.path || builtBundle.sha256 !== bundleSource.sha256 || !sameStat(builtBundle.stat, bundleSource.stat)) throw new Error("one-shot private Bun built bundle identity mismatch");
  const buildGuard = exactIdentitySnapshot(build.guard, "one-shot private Bun build guard");
  const buildStdout = exactIdentitySnapshot(build.stdout, "one-shot private Bun build stdout", false, true);
  const buildStderr = exactIdentitySnapshot(build.stderr, "one-shot private Bun build stderr", false, true);
  const expectedArgs = [
    "build", "--target=bun", "--format=esm", "--sourcemap=none", "--packages=bundle", "--allow-unresolved=",
    `--root=${privateSourceTree.sourceRoot}`, `--outfile=${builtBundle.path}`, join(privateSourceTree.sourceRoot, `src/${basename(context.sourceModule.path)}`),
  ];
  if (!Array.isArray(build.commandArgs) || build.commandArgs.length !== expectedArgs.length || build.commandArgs.some((value, index) => value !== expectedArgs[index])) throw new Error("one-shot private Bun build argv mismatch");
  const expectedEnv = {
    PATH: `${privatePythonRuntime.bin}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C",
    PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", PYTHONSAFEPATH: "1",
    HOME: homeDirectory, TMPDIR: tempDirectory, XDG_CONFIG_HOME: homeDirectory,
    CI: "1", NO_COLOR: "1", TZ: "UTC",
  };
  if (JSON.stringify(Object.entries(build.env || {}).sort()) !== JSON.stringify(Object.entries(expectedEnv).sort())) throw new Error("one-shot private Bun build environment mismatch");
  if (!Array.isArray(build.unsetEnv) || new Set(build.unsetEnv).size !== build.unsetEnv.length || build.unsetEnv.some((key, index) => typeof key !== "string" || key.length === 0 || (index > 0 && build.unsetEnv[index - 1] >= key))) throw new Error("one-shot private Bun build unset-environment contract mismatch");
  const revalidated = validateProductionGuardReport(directory, buildGuard.path, {expectedRc: 0, expectedTimeoutSeconds: ONE_SHOT_BUNDLE_BUILD_TIMEOUT_SECONDS, expectedStartupTimeoutSeconds: 5, expectedCleanupTimeoutSeconds: 20});
  for (const key of ["tag", "path", "sha256", "stdoutPath", "stdoutSha256", "stderrPath", "stderrSha256", "rc", "peakBytes", "sampleCount", "timeoutSeconds"]) {
    if (revalidated[key] !== build.guardEvidence?.[key]) throw new Error(`one-shot private Bun build guard evidence changed: ${key}`);
  }
  if (buildGuard.sha256 !== revalidated.sha256 || buildStdout.path !== revalidated.stdoutPath || buildStdout.sha256 !== revalidated.stdoutSha256 ||
      buildStderr.path !== revalidated.stderrPath || buildStderr.sha256 !== revalidated.stderrSha256 || buildStderr.raw.length !== 0) {
    throw new Error("one-shot private Bun build guard/stream identity mismatch");
  }
  if (bun.path !== context.bun.path || guard.path !== context.guard.path) throw new Error("one-shot private Bun build tool identity mismatch");
  return {schema: "cheng_regalloc_one_shot_bundle_build_evidence", outputDirectory, homeDirectory, tempDirectory, guardSha256: buildGuard.sha256, stdoutSha256: buildStdout.sha256, stderrSha256: buildStderr.sha256, peakBytes: revalidated.peakBytes, sampleCount: revalidated.sampleCount, timeoutSeconds: revalidated.timeoutSeconds};
}

function validateOneShotWorkerContext(context, explicitRequestIdentity = null) {
  if (!context || context.schema !== "cheng_regalloc_one_shot_request") throw new Error("release requires a valid one-shot worker request");
  const directory = canonicalAbsolute(context.directory, "one-shot worker directory", "dir");
  if (FUSION_ROOT !== context.fusionRoot || process.env.CHENG_REGALLOC_ONE_SHOT_FUSION_ROOT !== context.fusionRoot) throw new Error("one-shot worker Fusion root binding mismatch");
  const loadedModulePath = canonicalAbsolute(fileURLToPath(import.meta.url), "one-shot loaded module", "file", true);
  if (pathToFileURL(loadedModulePath).href !== import.meta.url || loadedModulePath !== context.module.path) throw new Error("one-shot worker import.meta.url does not name the unique private module");
  const actualBunPath = canonicalAbsolute(realpathSync.native(process.execPath), "one-shot actual Bun", "file", true);
  if (actualBunPath !== context.bun.path) throw new Error("one-shot worker is not executing with the exact private Bun");
  const module = exactIdentitySnapshot(context.module, "one-shot loaded module", true);
  const bundleSource = exactIdentitySnapshot(context.bundleSource, "one-shot bundle source");
  const bun = exactIdentitySnapshot(context.bun, "one-shot actual Bun", true);
  const guard = exactIdentitySnapshot(context.guard, "one-shot process-tree guard", true);
  const privateSourceTree = validatePrivateOneShotSourceTree(context);
  const privatePythonRuntime = validatePrivatePythonRuntime(context.privatePythonRuntime);
  const bundleBuild = validateOneShotBundleBuild(context, directory, bun, guard, bundleSource, privateSourceTree, privatePythonRuntime);
  const executionHome = canonicalAbsolute(context.executionHome, "one-shot worker home", "dir");
  const executionTemp = canonicalAbsolute(context.executionTemp, "one-shot worker temp", "dir");
  if (dirname(executionHome) !== directory || basename(executionHome) !== "worker-home" || dirname(executionTemp) !== directory || basename(executionTemp) !== "worker-tmp" || readdirSync(executionHome).length !== 0 || readdirSync(executionTemp).length !== 0) throw new Error("one-shot worker home/temp isolation changed");
  const expectedExecutionEnv = {
    PATH: `${privatePythonRuntime.bin}:/usr/bin:/bin`, HOME: executionHome, TMPDIR: executionTemp, XDG_CONFIG_HOME: executionHome,
    LANG: "C", LC_ALL: "C", TZ: "UTC", CI: "1", NO_COLOR: "1",
    PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", PYTHONSAFEPATH: "1",
    CHENG_TOOLCHAIN_ROOT: context.input.treeRoot, CHENG_ROOT: context.input.treeRoot,
    CHENG_REGALLOC_ONE_SHOT_FUSION_ROOT: context.fusionRoot,
  };
  if (JSON.stringify(Object.entries(context.executionEnv || {}).sort()) !== JSON.stringify(Object.entries(expectedExecutionEnv).sort())) throw new Error("one-shot worker isolated environment mismatch");
  if (module.sha256 !== bundleSource.sha256 || module.stat.dev !== bundleSource.stat.dev || module.stat.ino === bundleSource.stat.ino) throw new Error("one-shot loaded module must be a byte-equal distinct-inode copy of the held bundle source");
  let request;
  if (explicitRequestIdentity) {
    request = exactIdentitySnapshot(explicitRequestIdentity, "one-shot base request");
  } else {
    request = stableStreamingSnapshot(canonicalAbsolute(process.env.CHENG_REGALLOC_ONE_SHOT_REQUEST, "one-shot request", "file"), "one-shot request");
    if (request.sha256 !== requireSha256(process.env.CHENG_REGALLOC_ONE_SHOT_REQUEST_SHA256, "one-shot request SHA-256")) throw new Error("one-shot request SHA-256 mismatch");
  }
  if (request.path !== context.requestPath || request.stat.nlink !== 1n) throw new Error("one-shot request identity mismatch");
  const allowed = new Set([basename(context.module.path), basename(context.bun.path), basename(context.guard.path), basename(context.requestPath), basename(context.bundleBuild.guard.path), basename(context.bundleBuild.stdout.path), basename(context.bundleBuild.stderr.path), "worker.guard.txt", "worker.stdout.txt", "worker.stderr.txt", "finalizer-request.json"]);
  const allowedDirectories = new Set(["source-tree", "python-runtime", "bundle-build-output", "bundle-build-home", "bundle-build-tmp", "worker-home", "worker-tmp"]);
  const entries = readdirSync(directory, {withFileTypes: true});
  if (entries.some((entry) => entry.isSymbolicLink() || (allowedDirectories.has(entry.name) ? !entry.isDirectory() : !entry.isFile() || !allowed.has(entry.name))) || ![basename(context.module.path), basename(context.bun.path), basename(context.guard.path), basename(context.requestPath), ...allowedDirectories].every((name) => entries.some((entry) => entry.name === name))) {
    throw new Error("one-shot worker private directory contains an unexpected artifact");
  }
  return {
    schema: "cheng_regalloc_one_shot_worker_evidence",
    directory,
    requestSha256: request.sha256,
    loadedModuleUrl: import.meta.url,
    loadedModuleSha256: module.sha256,
    loadedModuleDevice: module.stat.dev.toString(),
    loadedModuleInode: module.stat.ino.toString(),
    bundleSourceDevice: bundleSource.stat.dev.toString(),
    bundleSourceInode: bundleSource.stat.ino.toString(),
    actualBunPath: bun.path,
    actualBunSha256: bun.sha256,
    guardSha256: guard.sha256,
    sourceSnapshotSha256: context.sourceSnapshotSha256,
    sourceManifestSha256: context.sourceManifestSha256,
    privateSourceSetSha256: privateSourceTree.artifactSetSha256,
    privateSourceArtifactCount: privateSourceTree.artifactCount,
    privatePythonRuntimeSha256: privatePythonRuntime.artifactSetSha256,
    privatePythonRuntimeArtifactCount: privatePythonRuntime.artifactCount,
    bundleBuild,
  };
}

function oneShotIdentity(snapshot) {
  return {path: snapshot.path, sha256: snapshot.sha256, stat: statIdentity(snapshot.stat)};
}

function oneShotFusionSourceRows(sourceInputs) {
  const allowed = /^(package\.json|bun\.lock|index\.ts|cli\.ts|src\/.+\.ts|node_modules\/.+)$/;
  const rows = sourceInputs.snapshots.filter((entry) => entry.label.startsWith("fusion/") && allowed.test(entry.label.slice("fusion/".length))).map((entry) => ({relativePath: entry.label.slice("fusion/".length), source: entry}));
  if (rows.length === 0 || !rows.some((entry) => entry.relativePath === `src/${basename(fileURLToPath(import.meta.url))}`)) {
    throw new Error("one-shot private source closure has an invalid Fusion path set");
  }
  rows.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (new Set(rows.map((entry) => entry.relativePath)).size !== rows.length) throw new Error("one-shot private source closure contains duplicate paths");
  return rows;
}

function materializePrivateOneShotSourceTree(sourceInputs, directory) {
  const sourceRoot = join(directory, "source-tree");
  mkdirSync(sourceRoot, {mode: 0o700});
  const directoryPaths = new Set([sourceRoot]);
  const artifacts = [];
  for (const entry of oneShotFusionSourceRows(sourceInputs)) {
    const sourcePath = canonicalAbsolute(entry.source.path, `one-shot source ${entry.relativePath}`, "file", false, true);
    const sourceFd = openSync(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const heldSource = exactFdSnapshot(sourceFd, `one-shot source ${entry.relativePath}`);
      if (heldSource.sha256 !== entry.source.sha256 || !sameStat(heldSource.stat, entry.source.stat) || !heldSource.raw.equals(entry.source.raw)) throw new Error(`one-shot source snapshot changed before private copy: ${entry.relativePath}`);
      const destination = join(sourceRoot, entry.relativePath);
      let parent = dirname(destination);
      const parents = [];
      while (parent !== sourceRoot) { parents.push(parent); parent = dirname(parent); }
      for (const path of parents.reverse()) {
        if (!directoryPaths.has(path)) mkdirSync(path, {recursive: false, mode: 0o700});
        directoryPaths.add(path);
      }
      const copied = copyHeldFdToExclusivePath(sourceFd, heldSource, destination, `one-shot private source ${entry.relativePath}`, 0o600);
      artifacts.push({relativePath: entry.relativePath, sourcePath, sourceSha256: heldSource.sha256, sourceStat: statIdentity(heldSource.stat), private: oneShotIdentity(copied)});
    } finally { closeSync(sourceFd); }
  }
  for (const path of [...directoryPaths].sort((left, right) => right.length - left.length)) fsyncDirectory(path);
  const artifactSetSha256 = sha256(Buffer.from(artifacts.map((entry) => `${entry.relativePath}\0${entry.sourceSha256}\0${entry.sourceStat.dev}\0${entry.sourceStat.ino}\0${entry.private.sha256}\0${entry.private.stat.dev}\0${entry.private.stat.ino}\n`).join(""), "utf8"));
  return {schema: "cheng_regalloc_one_shot_private_source_tree", sourceRoot: canonicalAbsolute(sourceRoot, "one-shot private source tree", "dir"), artifactSetSha256, artifacts};
}

function validatePrivateOneShotSourceTree(context) {
  const sourceRoot = canonicalAbsolute(context.privateSourceRoot, "one-shot private source tree", "dir");
  const expected = context.privateSources;
  if (!Array.isArray(expected) || expected.length === 0) throw new Error("one-shot private source tree manifest is empty");
  const actualPaths = walkRegularFiles(sourceRoot, "one-shot private source tree").map((path) => relative(sourceRoot, path).split("\\").join("/")).sort();
  const expectedPaths = expected.map((entry) => entry.relativePath).sort();
  if (actualPaths.length !== expectedPaths.length || actualPaths.some((path, index) => path !== expectedPaths[index])) throw new Error("one-shot private source tree exact file set changed");
  const artifacts = [];
  for (const entry of [...expected].sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    const privateSnapshot = exactIdentitySnapshot(entry.private, `one-shot private source ${entry.relativePath}`);
    artifacts.push(entry);
    if (privateSnapshot.sha256 !== entry.sourceSha256) throw new Error(`one-shot private source/source bytes differ: ${entry.relativePath}`);
  }
  const artifactSetSha256 = sha256(Buffer.from(artifacts.map((entry) => `${entry.relativePath}\0${entry.sourceSha256}\0${entry.sourceStat.dev}\0${entry.sourceStat.ino}\0${entry.private.sha256}\0${entry.private.stat.dev}\0${entry.private.stat.ino}\n`).join(""), "utf8"));
  if (artifactSetSha256 !== context.privateSourceSetSha256) throw new Error("one-shot private source tree artifact-set binding mismatch");
  return {sourceRoot, artifactCount: artifacts.length, artifactSetSha256};
}

async function buildPrivateOneShotBundle(privateSourceTree, privateEntryPath, buildImpl = (options) => Bun.build(options)) {
  const context = {privateSourceRoot: privateSourceTree.sourceRoot, privateSourceSetSha256: privateSourceTree.artifactSetSha256, privateSources: privateSourceTree.artifacts};
  validatePrivateOneShotSourceTree(context);
  const build = await buildImpl({entrypoints: [privateEntryPath], root: privateSourceTree.sourceRoot, target: "bun", format: "esm", minify: false, sourcemap: "none"});
  validatePrivateOneShotSourceTree(context);
  if (!build.success || build.outputs.length !== 1) throw new Error(`one-shot Bun bundle failed: ${(build.logs || []).map((entry) => String(entry)).join(" | ")}`);
  const raw = Buffer.from(await build.outputs[0].arrayBuffer());
  if (raw.length <= 0 || raw.length > MAX_SNAPSHOT_BYTES) throw new Error("one-shot Bun bundle has an invalid byte size");
  validatePrivateOneShotSourceTree(context);
  return raw;
}

const ONE_SHOT_BUNDLE_BUILD_TIMEOUT_SECONDS = 300;

async function buildPrivateOneShotBundleGuarded(root, directory, privateSourceTree, privateEntryPath, bun, guard, privatePythonRuntime, maxOutputBytes) {
  const outputDirectory = join(directory, "bundle-build-output");
  const homeDirectory = join(directory, "bundle-build-home");
  const tempDirectory = join(directory, "bundle-build-tmp");
  mkdirSync(outputDirectory, {mode: 0o700});
  mkdirSync(homeDirectory, {mode: 0o700});
  mkdirSync(tempDirectory, {mode: 0o700});
  const bundlePath = join(outputDirectory, "bundle.source.bytes");
  const reportPath = join(directory, "bundle-build.guard.txt");
  const stdoutPath = join(directory, "bundle-build.stdout.txt");
  const stderrPath = join(directory, "bundle-build.stderr.txt");
  const commandArgs = [
    "build", "--target=bun", "--format=esm", "--sourcemap=none", "--packages=bundle", "--allow-unresolved=",
    `--root=${privateSourceTree.sourceRoot}`, `--outfile=${bundlePath}`, privateEntryPath,
  ];
  const env = {
    PATH: `${privatePythonRuntime.bin}:/usr/bin:/bin`, LANG: "C", LC_ALL: "C",
    PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", PYTHONSAFEPATH: "1",
    HOME: homeDirectory, TMPDIR: tempDirectory, XDG_CONFIG_HOME: homeDirectory,
    CI: "1", NO_COLOR: "1", TZ: "UTC",
  };
  const unsetEnv = Object.keys(process.env).sort();
  validatePrivateOneShotSourceTree({privateSourceRoot: privateSourceTree.sourceRoot, privateSourceSetSha256: privateSourceTree.artifactSetSha256, privateSources: privateSourceTree.artifacts});
  const guardArgs = [
    `--rss-limit:${DEFAULT_RSS_CAP_BYTES}`, `--timeout:${ONE_SHOT_BUNDLE_BUILD_TIMEOUT_SECONDS}`, "--startup-timeout:5", "--cleanup-timeout:20",
    `--report-out:${reportPath}`, `--stdout:${stdoutPath}`, `--stderr:${stderrPath}`, "--", bun.path, ...commandArgs,
  ];
  const guarded = await runChengDriver(guard.path, guardArgs, {
    root,
    cwd: privateSourceTree.sourceRoot,
    maxBuffer: maxOutputBytes,
    exactGuardOwnsTimeoutAndCleanup: true,
    hardRssCapBytes: DEFAULT_RSS_CAP_BYTES,
    unsetEnv,
    env,
  });
  if (!processSucceeded(guarded) || guarded.stdoutBuffer?.length !== 0 || guarded.stderrBuffer?.length !== 0) throw new Error(`one-shot private Bun bundle guard failed rc=${guarded.exitCode}: ${takeTrailingText(guarded.stderr, 4000)}`);
  const guardEvidence = validateProductionGuardReport(directory, reportPath, {expectedRc: 0, expectedTimeoutSeconds: ONE_SHOT_BUNDLE_BUILD_TIMEOUT_SECONDS, expectedStartupTimeoutSeconds: 5, expectedCleanupTimeoutSeconds: 20});
  const stdout = stableSnapshot(stdoutPath, "one-shot private Bun bundle stdout", maxOutputBytes, true);
  const stderr = stableSnapshot(stderrPath, "one-shot private Bun bundle stderr", maxOutputBytes, true);
  if (stderr.raw.length !== 0) throw new Error(`one-shot private Bun bundle emitted stderr: ${takeTrailingText(stderr.raw.toString("utf8"), 4000)}`);
  const entries = readdirSync(outputDirectory, {withFileTypes: true});
  if (entries.length !== 1 || entries[0].name !== basename(bundlePath) || !entries[0].isFile() || entries[0].isSymbolicLink()) throw new Error("one-shot private Bun bundle output set mismatch");
  const bundleFd = openSync(bundlePath, constants.O_RDWR | constants.O_NOFOLLOW);
  try { fchmodSync(bundleFd, 0o600); fsyncSync(bundleFd); }
  finally { closeSync(bundleFd); }
  const bundleSource = stableStreamingSnapshot(bundlePath, "one-shot private Bun bundle source");
  if (readdirSync(homeDirectory).length !== 0 || readdirSync(tempDirectory).length !== 0) throw new Error("one-shot private Bun bundle wrote outside its exact output directory");
  validatePrivateOneShotSourceTree({privateSourceRoot: privateSourceTree.sourceRoot, privateSourceSetSha256: privateSourceTree.artifactSetSha256, privateSources: privateSourceTree.artifacts});
  fsyncDirectory(outputDirectory);
  fsyncDirectory(directory);
  return {
    schema: "cheng_regalloc_one_shot_bundle_build",
    outputDirectory: canonicalAbsolute(outputDirectory, "one-shot private Bun bundle output directory", "dir"),
    homeDirectory: canonicalAbsolute(homeDirectory, "one-shot private Bun bundle home directory", "dir"),
    tempDirectory: canonicalAbsolute(tempDirectory, "one-shot private Bun bundle temp directory", "dir"),
    commandArgs,
    env,
    unsetEnv,
    timeoutSeconds: ONE_SHOT_BUNDLE_BUILD_TIMEOUT_SECONDS,
    guardEvidence,
    guard: oneShotIdentity(stableSnapshot(reportPath, "one-shot private Bun bundle guard", 4 * 1024 * 1024)),
    stdout: oneShotIdentity(stdout),
    stderr: oneShotIdentity(stderr),
    bundleSource,
  };
}

async function materializeOneShotReleaseWorker(root, input, releaseClaim, sourceManifest, sourceInputs) {
  const directory = join(releaseClaim.workRoot, "one-shot-worker");
  mkdirSync(directory, {mode: 0o700});
  const held = new Map();
  try {
    const token = randomBytes(24).toString("hex");
    const privateSourceTree = materializePrivateOneShotSourceTree(sourceInputs, directory);
    const privatePythonRuntime = materializePrivatePythonRuntime(directory);
    const bunSourcePath = canonicalAbsolute(realpathSync.native(process.execPath), "one-shot Bun source", "file", true);
    const bunSource = stableStreamingSnapshot(bunSourcePath, "one-shot Bun source");
    const bunSourceFd = openSync(bunSource.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    held.set("bunSource", bunSourceFd);
    exactPathHeldFdIdentity(bunSource.path, bunSourceFd, bunSource, "one-shot Bun source", true);
    const bun = copyStableExecutableToPrivatePath(bunSource.path, "one-shot actual Bun", join(directory, "bun"), bunSource);
    const bunFd = openSync(bun.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    held.set("bun", bunFd);
    const guardSource = sourceInputs.byLabel.get(PRODUCTION_GATE_DEPENDENCY_FILES.guard);
    if (!guardSource?.raw || guardSource.sha256 !== PRODUCTION_GATE_DEPENDENCY_EXPECTED_SHA256[PRODUCTION_GATE_DEPENDENCY_FILES.guard]) throw new Error("one-shot process-tree guard is not the exact source-closure member");
    const guard = writeExclusiveSnapshot(join(directory, "guard.sh"), guardSource.raw, "one-shot process-tree guard", 0o700);
    const guardFd = openSync(guard.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    held.set("guard", guardFd);
    const sourceModulePath = canonicalAbsolute(fileURLToPath(import.meta.url), "loaded regalloc preflight source module", "file");
    const sourceModuleFd = openSync(sourceModulePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    held.set("sourceModule", sourceModuleFd);
    const sourceModule = exactFdSnapshot(sourceModuleFd, "loaded regalloc preflight source module");
    const pinnedSourceModule = sourceInputs.byLabel.get(`fusion/src/${basename(sourceModulePath)}`);
    if (!pinnedSourceModule || pinnedSourceModule.sha256 !== sourceModule.sha256 || !sameStat(pinnedSourceModule.stat, sourceModule.stat)) throw new Error("loaded regalloc module is not the exact complete-source snapshot member");
    const privateEntryPath = canonicalAbsolute(join(privateSourceTree.sourceRoot, `src/${basename(sourceModulePath)}`), "one-shot private bundle entry", "file");
    const bundleBuild = await buildPrivateOneShotBundleGuarded(root, directory, privateSourceTree, privateEntryPath, bun, guard, privatePythonRuntime, input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES);
    exactPathHeldFdIdentity(sourceModulePath, sourceModuleFd, sourceModule, "loaded regalloc preflight source module");
    exactPathHeldFdIdentity(bunSource.path, bunSourceFd, bunSource, "one-shot Bun source", true);
    exactPathHeldFdIdentity(guard.path, guardFd, guard, "one-shot process-tree guard", true);

    const bundleSource = bundleBuild.bundleSource;
    const bundleSourceFd = openSync(bundleSource.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    held.set("bundleSource", bundleSourceFd);
    for (const [key, identity, allowEmpty] of [
      ["bundleBuildGuard", bundleBuild.guard, false], ["bundleBuildStdout", bundleBuild.stdout, true], ["bundleBuildStderr", bundleBuild.stderr, true],
    ]) {
      const fd = openSync(identity.path, constants.O_RDONLY | constants.O_NOFOLLOW);
      held.set(key, fd);
      exactPathHeldFdIdentity(identity.path, fd, {sha256: identity.sha256, stat: statIdentityValue(identity.stat, `${key} stat`)}, key, false, allowEmpty);
    }
    const modulePath = join(directory, `worker-${token}.mjs`);
    const module = copyHeldFdToExclusivePath(bundleSourceFd, bundleSource, modulePath, "one-shot unique loaded module", 0o700);
    const moduleFd = openSync(module.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    held.set("module", moduleFd);

    const executionHome = join(directory, "worker-home");
    const executionTemp = join(directory, "worker-tmp");
    mkdirSync(executionHome, {mode: 0o700});
    mkdirSync(executionTemp, {mode: 0o700});
    const executionEnv = {
      PATH: `${privatePythonRuntime.bin}:/usr/bin:/bin`, HOME: executionHome, TMPDIR: executionTemp, XDG_CONFIG_HOME: executionHome,
      LANG: "C", LC_ALL: "C", TZ: "UTC", CI: "1", NO_COLOR: "1",
      PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", PYTHONSAFEPATH: "1",
      CHENG_TOOLCHAIN_ROOT: root, CHENG_ROOT: root, CHENG_REGALLOC_ONE_SHOT_FUSION_ROOT: FUSION_ROOT,
    };

    const claimIdentity = validateReleaseWorkClaim(releaseClaim);
    const context = {
      schema: "cheng_regalloc_one_shot_request",
      token,
      input,
      directory: canonicalAbsolute(directory, "one-shot worker directory", "dir"),
      releaseWorkRoot: releaseClaim.workRoot,
      claimRunId: releaseClaim.runId,
      claimRawBase64: releaseClaim.expectedRaw.toString("base64"),
      claimStat: statIdentity(releaseClaim.expectedStat),
      claimSha256: claimIdentity.sha256,
      fusionRoot: FUSION_ROOT,
      sourceSnapshotSha256: sourceInputs.sha256,
      sourceManifestPath: sourceManifest.path,
      sourceManifestSha256: sourceManifest.sha256,
      sourceModule: oneShotIdentity({...sourceModule, path: sourceModulePath}),
      privateSourceRoot: privateSourceTree.sourceRoot,
      privateSourceSetSha256: privateSourceTree.artifactSetSha256,
      privateSources: privateSourceTree.artifacts,
      privatePythonRuntime,
      executionHome: canonicalAbsolute(executionHome, "one-shot worker home", "dir"),
      executionTemp: canonicalAbsolute(executionTemp, "one-shot worker temp", "dir"),
      executionEnv,
      bundleBuild: {...bundleBuild, bundleSource: oneShotIdentity(bundleSource)},
      bundleSource: oneShotIdentity(bundleSource),
      module: oneShotIdentity(module),
      bun: oneShotIdentity(bun),
      bunSource: oneShotIdentity(bunSource),
      guard: oneShotIdentity(guard),
    };
    const requestPath = join(directory, "request.json");
    context.requestPath = requestPath;
    const request = writeExclusiveSnapshot(requestPath, Buffer.from(`${JSON.stringify(context)}\n`, "utf8"), "one-shot request");
    const requestFd = openSync(request.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    held.set("request", requestFd);
    fsyncDirectory(directory);
    fsyncDirectory(releaseClaim.workRoot);
    return {schema: "cheng_regalloc_one_shot_materialization", directory: context.directory, context, request, sourceManifest, sourceInputs, held};
  } catch (error) {
    for (const fd of held.values()) closeSync(fd);
    throw error;
  }
}

function closeOneShotReleaseWorker(worker) {
  if (!worker?.held) return;
  for (const fd of worker.held.values()) closeSync(fd);
  worker.held.clear();
}

function validateHeldOneShotReleaseWorker(worker) {
  const rows = [
    ["sourceModule", worker.context.sourceModule, "one-shot source module", false, false],
    ["bundleSource", worker.context.bundleSource, "one-shot bundle source", false, false],
    ["module", worker.context.module, "one-shot loaded module", true, false],
    ["bun", worker.context.bun, "one-shot actual Bun", true, false],
    ["bunSource", worker.context.bunSource, "one-shot Bun source", true, false],
    ["guard", worker.context.guard, "one-shot process-tree guard", true, false],
    ["bundleBuildGuard", worker.context.bundleBuild.guard, "one-shot bundle-build guard", false, false],
    ["bundleBuildStdout", worker.context.bundleBuild.stdout, "one-shot bundle-build stdout", false, true],
    ["bundleBuildStderr", worker.context.bundleBuild.stderr, "one-shot bundle-build stderr", false, true],
  ];
  for (const [key, identity, label, executable, allowEmpty] of rows) exactPathHeldFdIdentity(identity.path, worker.held.get(key), {sha256: identity.sha256, stat: statIdentityValue(identity.stat, `${label} stat`)}, label, executable, allowEmpty);
  const request = exactPathHeldFdIdentity(worker.request.path, worker.held.get("request"), worker.request, "one-shot request");
  const privateSourceTree = validatePrivateOneShotSourceTree(worker.context);
  const privatePythonRuntime = validatePrivatePythonRuntime(worker.context.privatePythonRuntime);
  const bundleBuild = validateOneShotBundleBuild(worker.context, worker.context.directory, exactIdentitySnapshot(worker.context.bun, "one-shot outer actual Bun", true), exactIdentitySnapshot(worker.context.guard, "one-shot outer guard", true), exactIdentitySnapshot(worker.context.bundleSource, "one-shot outer bundle source"), privateSourceTree, privatePythonRuntime);
  const currentManifest = validateSourceManifestPath(worker.context.input.treeRoot, worker.sourceManifest.path);
  if (currentManifest.sha256 !== worker.sourceManifest.sha256 || currentManifest.fileCount !== worker.sourceManifest.fileCount || currentManifest.edgeCount !== worker.sourceManifest.edgeCount) throw new Error("one-shot source manifest changed during worker execution");
  const currentInputs = snapshotSourceInputs(worker.context.input.treeRoot, {sourceManifest: worker.sourceManifest.path, sourceManifestRelativePaths: worker.sourceManifest.relativePaths, memoryManifest: worker.context.input.memoryManifest || null});
  if (!sameSourceInputs(worker.sourceInputs, currentInputs)) throw new Error(`one-shot complete source closure changed during worker execution: ${sourceInputsDifference(worker.sourceInputs, currentInputs)}`);
  return {schema: "cheng_regalloc_one_shot_outer_identity", requestSha256: request.sha256, sourceSnapshotSha256: currentInputs.sha256, privateSourceSetSha256: privateSourceTree.artifactSetSha256, privateSourceArtifactCount: privateSourceTree.artifactCount, privatePythonRuntimeSha256: privatePythonRuntime.artifactSetSha256, privatePythonRuntimeArtifactCount: privatePythonRuntime.artifactCount, bundleBuild};
}

function validateReleaseEvidenceInputs(root, input, options = {}) {
  validateReleaseEvidenceFieldPresence(input);
  const releaseWorkRoot = canonicalAbsolute(input.releaseWorkRoot, "releaseWorkRoot", "dir");
  if (pathIsWithin(root, releaseWorkRoot) || pathIsWithin(FUSION_ROOT, releaseWorkRoot)) {
    throw new Error("releaseWorkRoot must be outside both Cheng and Fusion trees");
  }
  if (options.releaseClaim) {
    const entries = readdirSync(releaseWorkRoot).sort();
    const expectedEntries = options.releaseClaim.oneShotDirectory ? [basename(options.releaseClaim.path), basename(options.releaseClaim.oneShotDirectory)].sort() : [basename(options.releaseClaim.path)];
    if (options.releaseClaim.workRoot !== releaseWorkRoot || entries.length !== expectedEntries.length || entries.some((entry, index) => entry !== expectedEntries[index])) throw new Error("releaseWorkRoot claim ownership changed before input pinning");
  } else if (!options.allowPopulatedReleaseWorkRoot && readdirSync(releaseWorkRoot).length !== 0) {
    throw new Error("releaseWorkRoot must contain only a freshly acquired release claim before validation");
  }
  const releaseWorkRootStat = lstatSync(releaseWorkRoot, {bigint: true});
  const dependencySnapshots = new Map();
  for (const [key, relativePath] of Object.entries(PRODUCTION_GATE_DEPENDENCY_FILES)) {
    const path = canonicalAbsolute(join(root, relativePath), `production gate dependency ${relativePath}`, "file", key !== "lockValidator");
    dependencySnapshots.set(relativePath, stableSnapshot(path, `production gate dependency ${relativePath}`, 64 * 1024 * 1024));
  }
  const dependencyBundle = validateProductionGateDependencyBundle(dependencySnapshots);
  const artifacts = [];
  const env = {};
  for (const [pathKey, shaKey, pathEnv, shaEnv] of RELEASE_EVIDENCE_INPUTS) {
    const path = canonicalAbsolute(input[pathKey], pathKey, "file");
    const expectedSha256 = requireSha256(input[shaKey], shaKey);
    const snapshot = stableSnapshot(path, pathKey, 64 * 1024 * 1024);
    if (snapshot.sha256 !== expectedSha256) throw new Error(`${pathKey} SHA-256 does not match ${shaKey}`);
    artifacts.push({key: pathKey, shaKey, snapshot});
    env[pathEnv] = path;
    env[shaEnv] = expectedSha256;
  }
  const backend2ManifestArtifact = artifacts.find((entry) => entry.key === "backend2VersionManifest");
  if (!backend2ManifestArtifact) throw new Error("backend2 version manifest release artifact is absent");
  const backend2VersionManifest = validateBackend2VersionManifest(root, backend2ManifestArtifact.snapshot);
  exactDistinctSnapshots(artifacts.map((entry) => entry.snapshot), "release manifests and external locks");
  const expectedOfficialPath = join(root, "artifacts/backend_driver/cheng");
  const driverPaths = {
    gen2Driver: canonicalAbsolute(input.gen2Driver, "gen2Driver", "file", true),
    gen3Driver: canonicalAbsolute(input.gen3Driver, "gen3Driver", "file", true),
    officialDriver: canonicalAbsolute(input.officialDriver, "officialDriver", "file", true),
  };
  if (driverPaths.officialDriver !== expectedOfficialPath) throw new Error(`officialDriver must be the current tree artifact: ${expectedOfficialPath}`);
  const driverPins = Object.entries(driverPaths).map(([key, path]) => ({key, snapshot: stableStreamingSnapshot(path, key)}));
  if (driverPins[0].snapshot.stat.dev === driverPins[1].snapshot.stat.dev && driverPins[0].snapshot.stat.ino === driverPins[1].snapshot.stat.ino) {
    throw new Error("GEN2 and GEN3 must be different inodes before release work starts");
  }
  const officialBuildReceiptArtifact = artifacts.find((entry) => entry.key === "officialBuildReceipt");
  if (!officialBuildReceiptArtifact) throw new Error("official current-source build receipt release artifact is absent");
  const officialDriverBuild = validateOfficialDriverBuildReceipt(
    root, officialBuildReceiptArtifact.snapshot, driverPins.find((entry) => entry.key === "officialDriver").snapshot,
    backend2VersionManifest,
  );
  const executionStagePolicyArtifact = artifacts.find((entry) => entry.key === "executionStagePolicy");
  if (!executionStagePolicyArtifact) throw new Error("seven-stage execution policy release artifact is absent");
  const executionStagePolicyText = new TextDecoder("utf-8", {fatal: true}).decode(executionStagePolicyArtifact.snapshot.raw);
  if (!executionStagePolicyText.endsWith("\n") || executionStagePolicyText.slice(0, -1).includes("\n")) {
    throw new Error("seven-stage execution policy must be exactly one canonical JSON line");
  }
  let executionStagePolicy;
  try {
    executionStagePolicy = JSON.parse(executionStagePolicyText.slice(0, -1));
  } catch (error) {
    throw new Error(`seven-stage execution policy JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (executionStagePolicyText !== `${canonicalJson(executionStagePolicy)}\n`) {
    throw new Error("seven-stage execution policy is not canonical JSON");
  }
  const executionStageValidation = validateCompilerExecutionStageReceipt(executionStagePolicy);
  const officialDriverPin = driverPins.find((entry) => entry.key === "officialDriver")?.snapshot;
  if (!officialDriverPin) throw new Error("official current-source driver pin is absent");
  const currentSourceManifest = validateSourceManifestPath(
    root,
    canonicalAbsolute(input.sourceManifest, "sourceManifest", "file"),
  );
  if (join(executionStagePolicy.evidenceRoot, ...executionStagePolicy.receipt.path.split("/")) === executionStagePolicyArtifact.snapshot.path) {
    throw new Error("seven-stage execution policy aliases its compiler-produced receipt");
  }
  const executionStageReceipt = {
    policySha256: executionStagePolicyArtifact.snapshot.sha256,
    ...validateExecutionStageReleaseBindings(
      executionStagePolicy,
      executionStageValidation,
      officialDriverPin.sha256,
      currentSourceManifest,
    ),
  };
  const allSnapshots = [
    ...dependencySnapshots.entries().map(([key, snapshot]) => ({key: `dependency:${key}`, snapshot})),
    ...artifacts.map((entry) => ({key: `evidence:${entry.key}`, snapshot: entry.snapshot})),
    ...driverPins.map((entry) => ({key: `driver:${entry.key}`, snapshot: entry.snapshot})),
  ];
  const digestRows = [
    `releaseWorkRoot\0${releaseWorkRoot}\0${releaseWorkRootStat.dev}\0${releaseWorkRootStat.ino}\n`,
    ...allSnapshots.map((entry) => `${entry.key}\0${entry.snapshot.path}\0${entry.snapshot.sha256}\0${entry.snapshot.stat.dev}\0${entry.snapshot.stat.ino}\0${entry.snapshot.stat.size}\0${entry.snapshot.stat.mtimeNs}\0${entry.snapshot.stat.ctimeNs}\n`),
  ];
  return {
    schema: "cheng_regalloc_release_inputs",
    sha256: sha256(Buffer.from(digestRows.join(""), "utf8")),
    dependencyBundle,
    dependencySnapshots,
    artifacts,
    backend2VersionManifest,
    officialDriverBuild,
    executionStageReceipt,
    env,
    driverPaths,
    driverPins,
    allSnapshots,
    releaseWorkRoot,
    releaseWorkRootStat,
  };
}

function sameReleaseEvidenceInputs(left, right) {
  return left.sha256 === right.sha256 && left.releaseWorkRoot === right.releaseWorkRoot &&
    left.releaseWorkRootStat.dev === right.releaseWorkRootStat.dev && left.releaseWorkRootStat.ino === right.releaseWorkRootStat.ino &&
    left.allSnapshots.length === right.allSnapshots.length &&
    left.allSnapshots.every((entry, index) => entry.key === right.allSnapshots[index].key &&
      entry.snapshot.path === right.allSnapshots[index].snapshot.path &&
      entry.snapshot.sha256 === right.allSnapshots[index].snapshot.sha256 &&
      sameStat(entry.snapshot.stat, right.allSnapshots[index].snapshot.stat));
}

function validateProductionGuardReport(workDir, guardPath, options = {}) {
  const guard = stableSnapshot(guardPath, `production guard ${basename(guardPath)}`, 4 * 1024 * 1024);
  const {rows} = parseUniqueUnhashedKv(guard.raw, `production guard ${basename(guardPath)}`);
  exactKeys(rows, [
    "tool", "schema", "platform", "status", "rc", "abort_reason", "memory_guard_mode",
    "memory_guard_scope", "process_tree_membership_metric", "enforcement_kind",
    "observed_sample_limit_status", "hard_memory_limit_proof_status", "sampling_blind_spot",
    "memory_limit_bytes", "memory_enforcement_metric", "process_tree_resident_metric",
    "process_tree_phys_footprint_metric", "process_tree_phys_footprint_status",
    "process_tree_resident_peak_bytes", "process_tree_phys_footprint_peak_bytes",
    "process_tree_enforced_peak_bytes", "process_tree_enforced_sample_peak_bytes",
    "process_tree_peak_process_count", "process_tree_identity_history_peak_count",
    "root_identity_sampled", "process_tree_escape_pid", "memory_measurement_status",
    "memory_measurement_error", "memory_sample_count", "self_test_global_process_iter_trap_status",
    "self_test_global_process_iter_trap_probe_status", "self_test_global_process_iter_trap_call_count",
    "startup_status", "startup_timeout_seconds", "cleanup_status", "cleanup_timeout_seconds",
    "cleanup_error", "timeout_seconds", "poll_seconds", "stdout", "stderr",
    "command_path", "command_sha256", "command_size", "command_inode", "command_device",
    "command_mtime_ns", "command_ctime_ns", "command_identity_status", "command_identity_error",
    "command_execution_mode", "command_execution_trust_boundary",
    "command_execution_snapshot_path", "command_execution_snapshot_schema", "command_execution_snapshot_sha256",
    "command_execution_snapshot_size", "command_execution_snapshot_inode", "command_execution_snapshot_device",
    "command_execution_snapshot_mtime_ns", "command_execution_snapshot_ctime_ns",
    "command_argv_schema", "command_argv_count", "command_argv_sha256",
    "parent_guard_mode", "parent_guard_monitor_pid", "parent_guard_capability_sha256",
    "parent_guard_limit_bytes", "parent_guard_binding_status",
    "monitor_python_path", "monitor_python_sha256", "monitor_python_size", "monitor_python_inode",
    "monitor_python_device", "monitor_python_mtime_ns", "monitor_python_ctime_ns",
    "monitor_psutil_path", "monitor_psutil_sha256", "monitor_psutil_size", "monitor_psutil_inode",
    "monitor_psutil_device", "monitor_psutil_mtime_ns", "monitor_psutil_ctime_ns",
    "monitor_psutil_closure_schema", "monitor_psutil_closure_root", "monitor_psutil_closure_count", "monitor_psutil_closure_sha256",
    "output_artifact_schema", "output_artifact_count",
    "output_path_history_schema", "output_path_history_status", "output_path_history_monitor",
    "output_path_history_watch_count", "output_path_history_forbidden_events",
    "stdout_status", "stdout_path", "stdout_sha256", "stdout_size", "stdout_inode", "stdout_device",
    "stderr_status", "stderr_path", "stderr_sha256", "stderr_size", "stderr_inode", "stderr_device",
    "target_env_schema", "target_env_mode", "target_env_count", "target_env_sha256",
    "phase_trace_status", "phase_trace_path", "phase_trace_sha256", "phase_trace_size", "phase_trace_inode", "phase_trace_device",
    "resource_trace_status", "resource_trace_path", "resource_trace_sha256", "resource_trace_size", "resource_trace_inode", "resource_trace_device",
    "report_path", "report_inode", "report_device",
  ], `production guard ${basename(guardPath)}`);
  const expected = new Map([
    ["tool", "tools/beat_c_process_group_guard.sh"],
    ["schema", "beat_c_process_memory_guard"],
    ["platform", "darwin"],
    ["status", "completed"],
    ["abort_reason", ""],
    ["memory_guard_mode", "process_tree"],
    ["enforcement_kind", "darwin_cooperative_process_tree_poll"],
    ["observed_sample_limit_status", "proved"],
    ["hard_memory_limit_proof_status", "not_provable_userspace_poll"],
    ["sampling_blind_spot", "inter_sample_transient_peaks_not_provable_by_userspace_polling"],
    ["memory_limit_bytes", String(DEFAULT_RSS_CAP_BYTES)],
    ["memory_enforcement_metric", "max_process_tree_resident_and_phys_footprint"],
    ["process_tree_resident_metric", "current_resident_bytes_sum"],
    ["process_tree_phys_footprint_metric", "darwin_rusage_info_v0_phys_footprint_bytes_sum"],
    ["process_tree_phys_footprint_status", "available"],
    ["root_identity_sampled", "1"],
    ["process_tree_escape_pid", "0"],
    ["memory_measurement_status", "available"],
    ["memory_measurement_error", ""],
    ["startup_status", "sampled"],
    ["cleanup_status", "not_required"],
    ["cleanup_error", ""],
    ["poll_seconds", "0.01"],
    ["self_test_global_process_iter_trap_status", "not_requested"],
    ["self_test_global_process_iter_trap_probe_status", "not_run"],
    ["self_test_global_process_iter_trap_call_count", "0"],
  ]);
  for (const [key, value] of expected) if (rows.get(key) !== value) throw new Error(`production guard ${basename(guardPath)} ${key} mismatch`);
  const parentMode = rows.get("parent_guard_mode");
  if (parentMode === "same_session_descendant") {
    if (rows.get("memory_guard_scope") !== "identity_history_descendants_parent_owned_group" ||
        rows.get("process_tree_membership_metric") !== "darwin_libproc_identity_history_descendants_parent_owned_group" ||
        rows.get("parent_guard_binding_status") !== "proved" ||
        rows.get("parent_guard_limit_bytes") !== String(DEFAULT_RSS_CAP_BYTES) ||
        uintValue(rows.get("parent_guard_monitor_pid"), `${basename(guardPath)} parent guard monitor pid`) <= 1n ||
        !/^[0-9a-f]{64}$/.test(rows.get("parent_guard_capability_sha256") || "")) {
      throw new Error(`production guard ${basename(guardPath)} parent ownership proof mismatch`);
    }
  } else if (parentMode === "standalone") {
    if (rows.get("memory_guard_scope") !== "identity_history_union_group_and_descendants" ||
        rows.get("process_tree_membership_metric") !== "darwin_libproc_identity_history_group_and_descendants" ||
        rows.get("parent_guard_monitor_pid") !== "0" ||
        rows.get("parent_guard_capability_sha256") !== "" ||
        rows.get("parent_guard_limit_bytes") !== "0" ||
        rows.get("parent_guard_binding_status") !== "not_applicable") {
      throw new Error(`production guard ${basename(guardPath)} standalone ownership proof mismatch`);
    }
  } else {
    throw new Error(`production guard ${basename(guardPath)} parent guard mode mismatch`);
  }
  const rc = uintValue(rows.get("rc"), `${basename(guardPath)} rc`, 255n);
  if (options.expectedRc !== undefined && rc !== BigInt(options.expectedRc)) throw new Error(`production guard ${basename(guardPath)} rc mismatch`);
  const numeric = {};
  for (const key of [
    "process_tree_resident_peak_bytes", "process_tree_phys_footprint_peak_bytes",
    "process_tree_enforced_peak_bytes", "process_tree_enforced_sample_peak_bytes",
    "process_tree_peak_process_count", "process_tree_identity_history_peak_count",
    "memory_sample_count", "timeout_seconds",
    "startup_timeout_seconds", "cleanup_timeout_seconds",
  ]) numeric[key] = uintValue(rows.get(key), `${basename(guardPath)} ${key}`);
  if (numeric.process_tree_peak_process_count <= 0n || numeric.process_tree_identity_history_peak_count <= 0n ||
      numeric.memory_sample_count <= 0n || numeric.timeout_seconds <= 0n || numeric.startup_timeout_seconds <= 0n || numeric.cleanup_timeout_seconds <= 0n) throw new Error(`production guard ${basename(guardPath)} has no real process-tree samples or legal timeout contract`);
  for (const [optionKey, numericKey] of [
    ["expectedTimeoutSeconds", "timeout_seconds"],
    ["expectedStartupTimeoutSeconds", "startup_timeout_seconds"],
    ["expectedCleanupTimeoutSeconds", "cleanup_timeout_seconds"],
  ]) {
    if (options[optionKey] !== undefined && numeric[numericKey] !== BigInt(options[optionKey])) {
      throw new Error(`production guard ${basename(guardPath)} ${numericKey} mismatch`);
    }
  }
  const expectedPeak = numeric.process_tree_resident_peak_bytes > numeric.process_tree_phys_footprint_peak_bytes
    ? numeric.process_tree_resident_peak_bytes : numeric.process_tree_phys_footprint_peak_bytes;
  if (numeric.process_tree_enforced_peak_bytes !== expectedPeak ||
      numeric.process_tree_enforced_sample_peak_bytes !== expectedPeak || expectedPeak > BigInt(DEFAULT_RSS_CAP_BYTES)) {
    throw new Error(`production guard ${basename(guardPath)} peak contract mismatch`);
  }
  const tag = options.tag || basename(guardPath).slice(0, -".guard.txt".length);
  const stdoutPath = canonicalAbsolute(rows.get("stdout"), `${tag} guard stdout`, "file", false, true);
  const stderrPath = canonicalAbsolute(rows.get("stderr"), `${tag} guard stderr`, "file", false, true);
  if ((options.expectedStdoutPath === undefined) !== (options.expectedStderrPath === undefined)) {
    throw new Error(`production guard ${tag} requires both explicit stream paths`);
  }
  if (options.expectedStdoutPath !== undefined || options.expectedStderrPath !== undefined) {
    const expectedStdoutPath = canonicalAbsolute(options.expectedStdoutPath, `${tag} expected guard stdout`, "file", false, true);
    const expectedStderrPath = canonicalAbsolute(options.expectedStderrPath, `${tag} expected guard stderr`, "file", false, true);
    if (stdoutPath !== expectedStdoutPath || stderrPath !== expectedStderrPath || dirname(stdoutPath) !== workDir || dirname(stderrPath) !== workDir) {
      throw new Error(`production guard ${tag} explicit stream path mismatch`);
    }
  } else if (dirname(stdoutPath) !== workDir || dirname(stderrPath) !== workDir ||
             basename(stdoutPath) !== `${tag}.stdout.txt` || basename(stderrPath) !== `${tag}.stderr.txt`) {
    throw new Error(`production guard ${tag} stream path mismatch`);
  }
  const stdout = stableSnapshot(stdoutPath, `${tag} guard stdout`, 256 * 1024 * 1024, true);
  const stderr = stableSnapshot(stderrPath, `${tag} guard stderr`, 256 * 1024 * 1024, true);
  return {tag, path: guard.path, sha256: guard.sha256, stdoutPath, stdoutSha256: stdout.sha256, stderrPath, stderrSha256: stderr.sha256, rc: Number(rc), peakBytes: expectedPeak.toString(), sampleCount: numeric.memory_sample_count.toString(), timeoutSeconds: numeric.timeout_seconds.toString()};
}

function validateProductionGuardDirectory(workDir, reportRows) {
  const entries = readdirSync(workDir, {withFileTypes: true});
  const guardEntries = entries.filter((entry) => entry.name.endsWith(".guard.txt"));
  if (guardEntries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) throw new Error("production gate work directory contains a non-regular guard report");
  const names = guardEntries.map((entry) => entry.name).sort();
  if (names.length === 0) throw new Error("production gate work directory contains no guard reports");
  const reports = names.map((name) => validateProductionGuardReport(workDir, join(workDir, name), {expectedRc: 0}));
  const reportTags = new Map();
  for (const [key, value] of reportRows) {
    const match = key.match(/^item\.(.+)\.guard\.scope$/);
    if (!match) continue;
    if (!/^(PRODUCTION|BOTH) status=GREEN(?: |$)/.test(value)) throw new Error(`production report guard status is not GREEN: ${match[1]}`);
    reportTags.set(match[1], value);
  }
  const actualTags = reports.map((entry) => entry.tag).sort();
  const declaredTags = [...reportTags.keys()].sort();
  if (actualTags.length !== declaredTags.length || actualTags.some((tag, index) => tag !== declaredTags[index])) {
    throw new Error("production report and work-directory guard sets differ");
  }
  return {schema: "cheng_regalloc_production_guard_set", guardReportCount: reports.length, reports};
}

function productionRequiredStatuses() {
  const rows = [];
  const add = (scope, keys) => { for (const key of keys) rows.push({key, scope}); };
  add("BOTH", [
    "exec_bundle_identity", "fixture_inventory", "fixture_bundle_identity", "tool_inventory", "dry_contract", "dry_proof_contract",
    "dry_runtime", "dry_perf", "dry_cycle", "dry_stack_home", "dry_coalesced", "single_pass_contract",
    "structured_proof_contract", "runtime_cross_heap_and_call", "runtime_caller_saved_clobber",
    "runtime_pressure_spill", "runtime_loop_branch_phi", "runtime_parallel_copy_critical_edge",
    "runtime_wide_aggregate_before", "runtime_by_address_across_clobber", "runtime_wide_aggregate_after",
    "runtime_wide_aggregate_roundtrip", "runtime_callee_saved_preservation", "runtime_dynamic_seq_indexed",
    "runtime_x8_sret", "runtime_x29_sp_frame_balance", "runtime_stack_args", "perf_current_checksum",
    "final_source_and_fixture_freshness", "exec_bundle_freshness",
  ]);
  add("PRODUCTION", [
    "production_native_host", "production_performance_configuration", "production_target_configuration",
    "production_source_manifest", "production_git_tree", "source_call_shape_diagnostic",
    "source_legacy_symbol_diagnostic", "official.identity", "baseline.identity", "performance_baseline_distinct",
    "external_lock_jobs_determinism", "external_lock_exec_diff", "external_lock_target_emit_hard_fail",
    "external_lock_gen3_fixed_point", "official.driver_legacy_symbol_diagnostic", "production_execution_mode",
    "parallel_copy_cycle_authoritative", "address_escape_stack_home_authoritative",
    "coalesced_copy_authoritative", "runtime.receipt_machine", "perf.current.receipt_machine",
    "dry_perf.baseline", "perf.baseline_execution", "performance_no_regression", "dry_workload.current",
    "dry_workload.baseline", "production_compile_interleaved", "workload.current.receipt_machine",
    "production_wiring_receipt", "production_compile_object_performance", "production_evidence_freshness",
  ]);
  for (const tag of ["contract", "proof_contract"]) add("BOTH", [`${tag}.compile.guard`, `${tag}.compile_result`, `${tag}.run.guard`, `${tag}.run_result`]);
  for (const phase of ["compile", "link", "run"]) add("BOTH", [`runtime.${phase}.guard`, `runtime.${phase}_result`]);
  for (const phase of ["compile", "link"]) add("BOTH", [`perf.current.${phase}.guard`, `perf.current.${phase}_result`]);
  add("BOTH", ["perf.current.preflight.run.guard", "perf.current.preflight.run_result"]);
  for (const tag of ["cycle", "stack_home", "coalesced"]) add("PRODUCTION", [`${tag}.compile.guard`, `${tag}.compile_result`, `${tag}.run.guard`, `${tag}.run_result`]);
  for (const phase of ["compile", "link"]) add("PRODUCTION", [`perf.baseline.${phase}.guard`, `perf.baseline.${phase}_result`]);
  add("PRODUCTION", ["perf.baseline.preflight.run.guard", "perf.baseline.preflight.run_result"]);
  for (let pair = 1; pair <= 7; pair++) {
    const roles = pair % 2 === 1 ? ["baseline", "current", "current", "baseline"] : ["current", "baseline", "baseline", "current"];
    for (let ordinal = 1; ordinal <= 4; ordinal++) {
      const tag = `perf.pair.${pair}.${ordinal}.${roles[ordinal - 1]}.run`;
      add("PRODUCTION", [`${tag}.guard`, `${tag}_result`]);
    }
  }
  for (let pair = 1; pair <= 3; pair++) {
    const roles = pair % 2 === 1 ? ["baseline", "current", "current", "baseline"] : ["current", "baseline", "baseline", "current"];
    for (let ordinal = 1; ordinal <= 4; ordinal++) {
      const tag = `workload.compile_pair.${pair}.${ordinal}.${roles[ordinal - 1]}.compile`;
      add("PRODUCTION", [`${tag}.guard`, `${tag}_result`]);
    }
  }
  for (const phase of ["compile", "link"]) add("PRODUCTION", [`perf.clang.${phase}.guard`, `perf.clang.${phase}_result`]);
  add("PRODUCTION", ["perf.clang.preflight.run.guard", "perf.clang.preflight.run_result"]);
  if (rows.length !== 185 || new Set(rows.map((row) => row.key)).size !== 185) throw new Error("internal production required-status specification is not the canonical 185 unique keys");
  return rows;
}

function strictTsv(raw, columns, label) {
  let text;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(raw); }
  catch { throw new Error(`${label} must be valid UTF-8`); }
  if (!text.endsWith("\n") || text.includes("\r") || text.includes("\0")) throw new Error(`${label} must be NUL-free LF text ending in LF`);
  const lines = text.slice(0, -1).split("\n");
  if (lines.length === 1 && lines[0] === "") throw new Error(`${label} is empty`);
  return lines.map((line, index) => {
    const fields = line.split("\t");
    if (fields.length !== columns) throw new Error(`${label} row ${index} field count mismatch`);
    return fields;
  });
}

function validateProductionRequiredStatusEvidence(workDir, reportRows) {
  const expected = productionRequiredStatuses();
  const manifest = boundWorkSnapshot(workDir, reportRows.get("required_status_manifest_path"), reportRows.get("required_status_manifest_sha256"), "production required-status manifest", false, 4 * 1024 * 1024);
  const actual = boundWorkSnapshot(workDir, reportRows.get("required_status_rows_path"), reportRows.get("required_status_rows_sha256"), "production required-status rows", false, 32 * 1024 * 1024);
  const verdict = boundWorkSnapshot(workDir, reportRows.get("required_status_verdict_path"), reportRows.get("required_status_verdict_sha256"), "production required-status verdict", false, 4 * 1024 * 1024);
  if (basename(manifest.path) !== "required-status.tsv" || basename(actual.path) !== "required-status.actual.tsv" || basename(verdict.path) !== "required-status.detail.txt") {
    throw new Error("production required-status artifact basename mismatch");
  }
  const manifestRows = strictTsv(manifest.raw, 2, "production required-status manifest");
  if (manifestRows.length !== expected.length || manifestRows.some((row, index) => row[0] !== expected[index].key || row[1] !== expected[index].scope)) {
    throw new Error("production required-status manifest is not the canonical ordered 185-key contract");
  }
  const actualRows = strictTsv(actual.raw, 4, "production required-status rows");
  if (actualRows.length !== expected.length || actualRows.some((row, index) =>
    row[0] !== expected[index].key || row[1] !== expected[index].scope || row[2] !== "GREEN" || row[3].length === 0)) {
    throw new Error("production required-status rows are missing, reordered, rescoped or non-GREEN");
  }
  const verdictRows = validatePayloadKv(verdict.raw, "production required-status verdict", "verdict_payload_sha256");
  exactKeys(verdictRows, ["schema", "status", "required_count", "required_manifest_sha256", "status_rows_path", "status_rows_sha256", "verdict_payload_sha256"], "production required-status verdict");
  const exact = new Map([
    ["schema", "regalloc_required_status_contract"], ["status", "proved"], ["required_count", "185"],
    ["required_manifest_sha256", manifest.sha256], ["status_rows_path", actual.path], ["status_rows_sha256", actual.sha256],
  ]);
  for (const [key, value] of exact) if (verdictRows.get(key) !== value) throw new Error(`production required-status verdict ${key} mismatch`);
  const declaredProduction = [];
  for (const [key, value] of reportRows) {
    const match = key.match(/^item\.(.+)\.scope$/);
    if (!match) continue;
    const row = value.match(/^(LOCAL|PRODUCTION|BOTH) status=(GREEN|RED) detail=.*$/);
    if (!row) throw new Error(`production report item is malformed: ${key}`);
    if (row[1] !== "LOCAL") declaredProduction.push({key: match[1], scope: row[1], status: row[2]});
  }
  const expectedReport = [...expected, {key: "production_required_status_contract", scope: "PRODUCTION"}];
  const declaredByKey = new Map(declaredProduction.map((row) => [row.key, row]));
  if (declaredProduction.length !== expectedReport.length || declaredByKey.size !== expectedReport.length || expectedReport.some((entry) => {
    const row = declaredByKey.get(entry.key);
    return !row || row.scope !== entry.scope || row.status !== "GREEN";
  })) {
    throw new Error("production report mandatory key/scope set is not the canonical all-GREEN contract");
  }
  for (let index = 0; index < expected.length; index++) {
    const [key, scope, status, detail] = actualRows[index];
    if (reportRows.get(`item.${key}.scope`) !== `${scope} status=${status} detail=${detail}`) {
      throw new Error(`production required-status detail/report binding mismatch at index ${index}`);
    }
  }
  return {schema: "cheng_regalloc_required_status_evidence", requiredCount: expected.length, reportProductionCount: expectedReport.length, manifestPath: manifest.path, manifestSha256: manifest.sha256, rowsPath: actual.path, rowsSha256: actual.sha256, verdictPath: verdict.path, verdictSha256: verdict.sha256};
}

function validateProductionCompilePairs(workDir, reportRows, expected) {
  const pairsPath = reportRows.get("compile_raw_samples_path");
  if (basename(String(pairsPath || "")) !== "workload.compile.pairs.tsv") throw new Error("production compile raw sample path mismatch");
  const pairs = boundWorkSnapshot(workDir, pairsPath, reportRows.get("compile_raw_samples_sha256"), "production compile raw samples", false, 16 * 1024 * 1024);
  let text;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(pairs.raw); }
  catch { throw new Error("production compile raw samples must be valid UTF-8"); }
  if (!text.endsWith("\n") || text.includes("\r")) throw new Error("production compile raw samples must use LF and end with LF");
  const lines = text.slice(0, -1).split("\n");
  const pairCount = Number(uintValue(reportRows.get("compile_pair_count"), "compile_pair_count", 100n));
  if (pairCount !== 3 || lines.length !== pairCount * 4) throw new Error("production compile raw sample count mismatch");
  const rows = [];
  const artifactPaths = new Set();
  for (let index = 0; index < lines.length; index++) {
    const fields = lines[index].split("\t");
    if (fields.length !== 20) throw new Error(`production compile raw row ${index} field count mismatch`);
    const pair = Number(uintValue(fields[0], `compile row ${index} pair`, BigInt(pairCount)));
    const ordinal = Number(uintValue(fields[2], `compile row ${index} ordinal`, 4n));
    const expectedPair = Math.floor(index / 4) + 1;
    const expectedOrdinal = index % 4 + 1;
    const expectedPattern = expectedPair % 2 === 1 ? "ABBA" : "BAAB";
    const expectedRoles = expectedPattern === "ABBA" ? ["baseline", "current", "current", "baseline"] : ["current", "baseline", "baseline", "current"];
    if (pair !== expectedPair || ordinal !== expectedOrdinal || fields[1] !== expectedPattern || fields[3] !== expectedRoles[expectedOrdinal - 1]) {
      throw new Error(`production compile raw row ${index} sequence mismatch`);
    }
    const wall = uintValue(fields[4], `compile row ${index} wall`);
    const rss = uintValue(fields[5], `compile row ${index} rss`);
    if (wall <= 0n || rss <= 0n || rss > BigInt(DEFAULT_RSS_CAP_BYTES)) throw new Error(`production compile raw row ${index} measurement mismatch`);
    const sourceSha256 = requireSha256(fields[6], `compile row ${index} source SHA-256`);
    const compilerSha256 = requireSha256(fields[7], `compile row ${index} compiler SHA-256`);
    const artifactSpecs = [
      ["metrics", 8, false], ["object", 10, false], ["report", 12, false],
      ["guard", 14, false], ["stdout", 16, true], ["stderr", 18, true],
    ];
    const rawArtifacts = {};
    const keepRawArtifacts = pair === 1 && ordinal === 2 && fields[3] === "current";
    for (const [kind, pathIndex, allowEmpty] of artifactSpecs) {
      if (artifactPaths.has(fields[pathIndex])) throw new Error(`duplicate production compile ${kind} artifact path`);
      artifactPaths.add(fields[pathIndex]);
      rawArtifacts[kind] = boundWorkSnapshot(workDir, fields[pathIndex], fields[pathIndex + 1], `compile row ${index} ${kind}`, allowEmpty, kind === "object" ? MAX_SNAPSHOT_BYTES : 256 * 1024 * 1024);
    }
    const {rows: metricsRows} = parseUniqueUnhashedKv(rawArtifacts.metrics.raw, `compile row ${index} metrics`);
    exactKeys(metricsRows, ["schema", "source_sha256", "compiler_sha256", "compile_wall_ns", "compile_process_tree_peak_bytes", "compile_rc"], `compile row ${index} metrics`);
    if (metricsRows.get("schema") !== "regalloc_compile_measurement" || metricsRows.get("compile_rc") !== "0" ||
        metricsRows.get("source_sha256") !== sourceSha256 || metricsRows.get("compiler_sha256") !== compilerSha256 ||
        metricsRows.get("compile_wall_ns") !== wall.toString() || metricsRows.get("compile_process_tree_peak_bytes") !== rss.toString()) {
      throw new Error(`compile row ${index} metrics identity/schema mismatch`);
    }
    const {rows: guardRows} = parseUniqueUnhashedKv(rawArtifacts.guard.raw, `compile row ${index} guard`);
    if (uintValue(guardRows.get("process_tree_enforced_peak_bytes"), `compile row ${index} guard enforced peak`) !== rss ||
        uintValue(guardRows.get("process_tree_enforced_sample_peak_bytes"), `compile row ${index} guard sample peak`) !== rss) {
      throw new Error(`compile row ${index} guard RSS does not bind the compile measurement`);
    }
    const artifacts = Object.fromEntries(Object.entries(rawArtifacts).map(([kind, snapshot]) => [kind, keepRawArtifacts ? snapshot : {path: snapshot.path, sha256: snapshot.sha256, stat: snapshot.stat}]));
    rows.push({pair, ordinal, pattern: fields[1], role: fields[3], sourceSha256, compilerSha256, wall, rss, artifacts});
  }
  const sourceHashes = new Set(rows.map((row) => row.sourceSha256));
  const currentCompilerHashes = new Set(rows.filter((row) => row.role === "current").map((row) => row.compilerSha256));
  const baselineCompilerHashes = new Set(rows.filter((row) => row.role === "baseline").map((row) => row.compilerSha256));
  const currentObjectHashes = new Set(rows.filter((row) => row.role === "current").map((row) => row.artifacts.object.sha256));
  const baselineObjectHashes = new Set(rows.filter((row) => row.role === "baseline").map((row) => row.artifacts.object.sha256));
  if (sourceHashes.size !== 1 || !sourceHashes.has(expected.workloadSourceSha256) ||
      currentCompilerHashes.size !== 1 || !currentCompilerHashes.has(expected.officialDriverSha256) ||
      baselineCompilerHashes.size !== 1 || !baselineCompilerHashes.has(expected.baselineDriverSha256) ||
      currentCompilerHashes.has(expected.baselineDriverSha256)) {
    throw new Error("production compile source or role-to-compiler identity drift");
  }
  if (currentObjectHashes.size !== 1 || baselineObjectHashes.size !== 1) throw new Error("production compile object bytes are nondeterministic within a role");
  const wallRatios = [];
  const rssRatios = [];
  for (let pair = 1; pair <= pairCount; pair++) {
    const pairRows = rows.filter((row) => row.pair === pair);
    const current = pairRows.filter((row) => row.role === "current");
    const baseline = pairRows.filter((row) => row.role === "baseline");
    wallRatios.push((current[0].wall + current[1].wall) * 1000000n / (baseline[0].wall + baseline[1].wall));
    rssRatios.push((current[0].rss + current[1].rss) * 1000000n / (baseline[0].rss + baseline[1].rss));
  }
  const spread = (values) => values.reduce((max, value) => value > max ? value : max) - values.reduce((min, value) => value < min ? value : min);
  const maxValue = (values) => values.reduce((max, value) => value > max ? value : max);
  const median = (values) => [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)[Math.floor(values.length / 2)];
  const wallSpread = spread(wallRatios);
  const rssSpread = spread(rssRatios);
  if (wallSpread > 100000n || rssSpread > 100000n || maxValue(wallRatios) > 1050000n || maxValue(rssRatios) > 1050000n) {
    throw new Error("production compile paired wall/RSS regression or spread limit exceeded");
  }
  const selected = rows.filter((row) => row.pair === 1 && row.ordinal === 2 && row.role === "current");
  if (selected.length !== 1 || basename(selected[0].artifacts.report.path) !== "workload.compile_pair.1.2.current.compile.report.txt" ||
      basename(selected[0].artifacts.object.path) !== "workload.compile_pair.1.2.current.o") {
    throw new Error("unique workload current receipt selection mismatch");
  }
  const verdict = boundWorkSnapshot(workDir, reportRows.get("compile_pair_verdict_path"), reportRows.get("compile_pair_verdict_sha256"), "production compile pair verdict", false, 4 * 1024 * 1024);
  if (basename(verdict.path) !== "compile-pair-verdict.txt") throw new Error("production compile pair verdict basename mismatch");
  const verdictRows = validatePayloadKv(verdict.raw, "production compile pair verdict", "verdict_payload_sha256");
  exactKeys(verdictRows, [
    "schema", "pair_count", "sample_count", "raw_samples_sha256", "source_sha256",
    "current_compiler_sha256", "baseline_compiler_sha256", "current_object_sha256",
    "baseline_object_sha256", "compile_wall_ratio_median_ppm", "compile_wall_ratio_max_ppm",
    "compile_wall_ratio_spread_ppm", "compile_rss_ratio_median_ppm", "compile_rss_ratio_max_ppm",
    "compile_rss_ratio_spread_ppm", "verdict_payload_sha256",
  ], "production compile pair verdict");
  const verdictExpected = new Map([
    ["schema", "regalloc_compile_pair_verdict"], ["pair_count", "3"], ["sample_count", "12"],
    ["raw_samples_sha256", pairs.sha256], ["source_sha256", expected.workloadSourceSha256],
    ["current_compiler_sha256", expected.officialDriverSha256], ["baseline_compiler_sha256", expected.baselineDriverSha256],
    ["current_object_sha256", [...currentObjectHashes][0]], ["baseline_object_sha256", [...baselineObjectHashes][0]],
    ["compile_wall_ratio_median_ppm", median(wallRatios).toString()], ["compile_wall_ratio_max_ppm", maxValue(wallRatios).toString()],
    ["compile_wall_ratio_spread_ppm", wallSpread.toString()], ["compile_rss_ratio_median_ppm", median(rssRatios).toString()],
    ["compile_rss_ratio_max_ppm", maxValue(rssRatios).toString()], ["compile_rss_ratio_spread_ppm", rssSpread.toString()],
  ]);
  for (const [key, value] of verdictExpected) if (verdictRows.get(key) !== value) throw new Error(`production compile pair verdict ${key} mismatch`);
  return {pairsPath: pairs.path, pairsSha256: pairs.sha256, verdictPath: verdict.path, verdictSha256: verdict.sha256, rowCount: rows.length, selected: selected[0]};
}

function validateProductionPerfEvidence(workDir, reportRows) {
  for (const [key, value] of [["perf_pair_count", "7"], ["perf_regress_ppm", "1050000"], ["perf_max_spread_ppm", "100000"], ["perf_min_ns", "10000000"]]) {
    if (reportRows.get(key) !== value) throw new Error(`production performance report ${key} mismatch`);
  }
  const pairs = boundWorkSnapshot(workDir, reportRows.get("perf_raw_samples_path"), reportRows.get("perf_raw_samples_sha256"), "production performance raw samples", false, 32 * 1024 * 1024);
  if (basename(pairs.path) !== "perf.pairs.tsv") throw new Error("production performance raw sample basename mismatch");
  const rawRows = strictTsv(pairs.raw, 15, "production performance raw samples");
  if (rawRows.length !== 28) throw new Error("production performance raw sample count mismatch");
  const rows = [];
  const uniquePaths = [new Set(), new Set(), new Set(), new Set()];
  const executables = new Map();
  for (let index = 0; index < rawRows.length; index++) {
    const fields = rawRows[index];
    const pair = Number(uintValue(fields[0], `performance row ${index} pair`, 7n));
    const ordinal = Number(uintValue(fields[2], `performance row ${index} ordinal`, 4n));
    const elapsed = uintValue(fields[4], `performance row ${index} elapsed`);
    const expectedPair = Math.floor(index / 4) + 1;
    const expectedOrdinal = index % 4 + 1;
    const pattern = expectedPair % 2 === 1 ? "ABBA" : "BAAB";
    const roles = pattern === "ABBA" ? ["baseline", "current", "current", "baseline"] : ["current", "baseline", "baseline", "current"];
    const role = roles[expectedOrdinal - 1];
    if (pair !== expectedPair || ordinal !== expectedOrdinal || fields[1] !== pattern || fields[3] !== role || elapsed <= 0n) throw new Error(`production performance row ${index} sequence mismatch`);
    const executable = boundWorkSnapshot(workDir, fields[5], fields[6], `performance row ${index} executable`, false, MAX_SNAPSHOT_BYTES);
    const elapsedArtifact = boundWorkSnapshot(workDir, fields[7], fields[8], `performance row ${index} elapsed artifact`, false, 1024 * 1024);
    const stdout = boundWorkSnapshot(workDir, fields[9], fields[10], `performance row ${index} stdout`, false, 64 * 1024 * 1024);
    const stderr = boundWorkSnapshot(workDir, fields[11], fields[12], `performance row ${index} stderr`, true, 64 * 1024 * 1024);
    const guard = boundWorkSnapshot(workDir, fields[13], fields[14], `performance row ${index} guard`, false, 4 * 1024 * 1024);
    const expectedExeName = role === "current" ? "perf.current.exe" : "perf.baseline.exe";
    if (basename(executable.path) !== expectedExeName) throw new Error(`production performance row ${index} executable role mismatch`);
    const priorExecutable = executables.get(role);
    if (priorExecutable && (priorExecutable.path !== executable.path || priorExecutable.sha256 !== executable.sha256)) throw new Error(`production performance ${role} executable identity drift`);
    executables.set(role, {path: executable.path, sha256: executable.sha256});
    for (const [ordinalIndex, artifact] of [elapsedArtifact, stdout, stderr, guard].entries()) {
      if (uniquePaths[ordinalIndex].has(artifact.path)) throw new Error(`production performance duplicate per-sample artifact path ${ordinalIndex}`);
      uniquePaths[ordinalIndex].add(artifact.path);
    }
    if (!elapsedArtifact.raw.equals(Buffer.from(`${elapsed}\n`, "ascii"))) throw new Error(`production performance row ${index} elapsed artifact mismatch`);
    const {rows: stdoutRows} = parseUniqueUnhashedKv(stdout.raw, `performance row ${index} stdout`);
    if (stdoutRows.get("regalloc_gate_external_elapsed_ns") !== elapsed.toString()) throw new Error(`production performance row ${index} stdout elapsed mismatch`);
    const {rows: guardRows} = parseUniqueUnhashedKv(guard.raw, `performance row ${index} guard`);
    if (guardRows.get("schema") !== "beat_c_process_memory_guard" || guardRows.get("status") !== "completed" || guardRows.get("rc") !== "0" ||
        guardRows.get("platform") !== "darwin" || guardRows.get("stdout") !== stdout.path || guardRows.get("stderr") !== stderr.path) {
      throw new Error(`production performance row ${index} guard binding mismatch`);
    }
    rows.push({pair, role, elapsed});
  }
  if (executables.size !== 2 || executables.get("current").path === executables.get("baseline").path) throw new Error("production performance executable roles are not distinct");
  const ratios = [];
  const baselineAverages = [];
  for (let pair = 1; pair <= 7; pair++) {
    const pairRows = rows.filter((row) => row.pair === pair);
    const current = pairRows.filter((row) => row.role === "current").reduce((sum, row) => sum + row.elapsed, 0n);
    const baseline = pairRows.filter((row) => row.role === "baseline").reduce((sum, row) => sum + row.elapsed, 0n);
    baselineAverages.push(baseline / 2n);
    ratios.push(current * 1000000n / baseline);
  }
  const sorted = [...ratios].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const median = sorted[3];
  const spread = sorted[6] - sorted[0];
  const baselineMin = baselineAverages.reduce((min, value) => value < min ? value : min);
  if (baselineMin < 10000000n || spread > 100000n || median > 1050000n) throw new Error("production performance floor/regression/spread contract mismatch");
  const verdict = boundWorkSnapshot(workDir, reportRows.get("perf_pair_verdict_path"), reportRows.get("perf_pair_verdict_sha256"), "production performance pair verdict", false, 4 * 1024 * 1024);
  if (basename(verdict.path) !== "perf.verdict.txt") throw new Error("production performance pair verdict basename mismatch");
  const verdictRows = validatePayloadKv(verdict.raw, "production performance pair verdict", "verdict_payload_sha256");
  exactKeys(verdictRows, ["schema", "pair_count", "sample_count", "raw_samples_sha256", "current_executable_sha256", "baseline_executable_sha256", "median_ratio_ppm", "spread_ppm", "baseline_min_ns", "verdict_payload_sha256"], "production performance pair verdict");
  const exact = new Map([
    ["schema", "regalloc_perf_pair_verdict"], ["pair_count", "7"], ["sample_count", "28"], ["raw_samples_sha256", pairs.sha256],
    ["current_executable_sha256", executables.get("current").sha256], ["baseline_executable_sha256", executables.get("baseline").sha256],
    ["median_ratio_ppm", median.toString()], ["spread_ppm", spread.toString()], ["baseline_min_ns", baselineMin.toString()],
  ]);
  for (const [key, value] of exact) if (verdictRows.get(key) !== value) throw new Error(`production performance pair verdict ${key} mismatch`);
  return {schema: "cheng_regalloc_production_perf_evidence", rowCount: rows.length, pairsPath: pairs.path, pairsSha256: pairs.sha256, verdictPath: verdict.path, verdictSha256: verdict.sha256, currentExecutableSha256: executables.get("current").sha256, baselineExecutableSha256: executables.get("baseline").sha256};
}

function validateProductionReceiptArtifacts(workDir, compileEvidence, expected) {
  const receiptSnapshot = compileEvidence.selected.artifacts.report;
  const objectSnapshot = compileEvidence.selected.artifacts.object;
  const {rows} = parseUniqueUnhashedKv(receiptSnapshot.raw, "workload current production receipt");
  const exact = new Map([
    ["regalloc_receipt_schema", "regalloc_single_pass.production"],
    ["regalloc_allocator", "regalloc_single_pass"],
    ["regalloc_wiring_mode", "production_default"],
    ["regalloc_driver_sha256", expected.officialDriverSha256],
    ["regalloc_source_manifest_sha256", expected.sourceManifestSha256],
    ["regalloc_target", TARGET],
    ["regalloc_output_object_sha256", objectSnapshot.sha256],
    ["regalloc_fixture_source_sha256", compileEvidence.selected.sourceSha256],
  ]);
  for (const [key, value] of exact) if (rows.get(key) !== value) throw new Error(`workload current receipt ${key} mismatch`);
  const snapshot = boundWorkSnapshot(workDir, rows.get("regalloc_frozen_plan_snapshot_path"), rows.get("regalloc_frozen_plan_snapshot_sha256"), "workload current frozen plan snapshot", false, 512 * 1024 * 1024);
  const ledger = boundWorkSnapshot(workDir, rows.get("regalloc_action_emission_ledger_path"), rows.get("regalloc_action_emission_ledger_sha256"), "workload current action emission ledger", false, 512 * 1024 * 1024);
  exactDistinctSnapshots([receiptSnapshot, objectSnapshot, snapshot, ledger], "workload current receipt/object/frozen-plan/action-ledger evidence");
  const snapshotRows = validatePayloadKv(snapshot.raw, "workload current frozen plan snapshot", "snapshot_payload_sha256");
  const ledgerRows = validatePayloadKv(ledger.raw, "workload current action emission ledger", "ledger_payload_sha256");
  const receiptFunctionCount = uintValue(rows.get("regalloc_function_receipt_count"), "receipt function count");
  if (receiptFunctionCount <= 0n ||
      snapshotRows.get("schema") !== "regalloc_frozen_plan_snapshot" ||
      snapshotRows.get("phase") !== "allocator_and_machine_recipe_freeze_before_fill" ||
      snapshotRows.get("source_manifest_sha256") !== expected.sourceManifestSha256 ||
      snapshotRows.get("driver_sha256") !== expected.officialDriverSha256 ||
      snapshotRows.get("target") !== TARGET ||
      uintValue(snapshotRows.get("function_count"), "snapshot function count") !== receiptFunctionCount ||
      snapshotRows.get("fixture_source_sha256") !== rows.get("regalloc_fixture_source_sha256")) {
    throw new Error("workload current frozen plan snapshot identity/count contract mismatch");
  }
  if (ledgerRows.get("schema") !== "regalloc_action_emission_ledger" ||
      ledgerRows.get("output_object_sha256") !== objectSnapshot.sha256 ||
      ledgerRows.get("fixture_source_sha256") !== rows.get("regalloc_fixture_source_sha256") ||
      uintValue(ledgerRows.get("function_count"), "ledger function count") !== receiptFunctionCount) {
    throw new Error("workload current action emission ledger identity/count contract mismatch");
  }
  return {
    schema: "cheng_regalloc_production_receipt_artifacts",
    receiptPath: receiptSnapshot.path,
    receiptSha256: receiptSnapshot.sha256,
    objectPath: objectSnapshot.path,
    objectSha256: objectSnapshot.sha256,
    frozenPlanSnapshotPath: snapshot.path,
    frozenPlanSnapshotSha256: snapshot.sha256,
    actionEmissionLedgerPath: ledger.path,
    actionEmissionLedgerSha256: ledger.sha256,
    functionReceiptCount: receiptFunctionCount.toString(),
  };
}

function releaseDriverManifestIdentity(snapshot, expectedRole, label) {
  const {rows} = strictKv(snapshot.raw, label, "manifest_payload_sha256");
  exactKeys(rows, [
    "schema", "role", "driver_path", "driver_sha256", "source_git_tree",
    "source_manifest_path", "source_manifest_sha256", "allocator_path",
    "allocator_sha256", "target", "certification_report_path",
    "certification_report_sha256", "manifest_payload_sha256",
  ], label);
  if (rows.get("schema") !== "regalloc_driver_manifest" || rows.get("role") !== expectedRole || rows.get("target") !== TARGET) {
    throw new Error(`${label} schema/role/target mismatch`);
  }
  const allocatorPath = canonicalAbsolute(rows.get("allocator_path"), `${label} allocator`, "file");
  const certificationPath = canonicalAbsolute(rows.get("certification_report_path"), `${label} certification report`, "file");
  const allocator = stableStreamingSnapshot(allocatorPath, `${label} allocator`);
  const certification = stableStreamingSnapshot(certificationPath, `${label} certification report`);
  const allocatorSha256 = requireSha256(rows.get("allocator_sha256"), `${label} allocator SHA-256`);
  const certificationSha256 = requireSha256(rows.get("certification_report_sha256"), `${label} certification SHA-256`);
  if (allocator.sha256 !== allocatorSha256 || certification.sha256 !== certificationSha256) throw new Error(`${label} allocator/certification referenced bytes mismatch`);
  return {
    driverSha256: requireSha256(rows.get("driver_sha256"), `${label} driver SHA-256`),
    sourceManifestSha256: requireSha256(rows.get("source_manifest_sha256"), `${label} source-manifest SHA-256`),
    allocatorPath, allocatorSha256, certificationPath, certificationSha256,
  };
}

function productionReleaseExpected(root, releaseInputs, execBundle, sourceManifestSha256, officialDriverSha256) {
  const artifactByKey = new Map(releaseInputs.artifacts.map((entry) => [entry.key, entry]));
  const required = (key) => {
    const entry = artifactByKey.get(key);
    if (!entry) throw new Error(`validated release evidence is absent: ${key}`);
    return {path: entry.snapshot.path, sha256: entry.snapshot.sha256};
  };
  const officialIdentity = releaseDriverManifestIdentity(artifactByKey.get("officialManifest").snapshot, "official_current", "official production driver manifest");
  const baselineIdentity = releaseDriverManifestIdentity(artifactByKey.get("baselineManifest").snapshot, "immutable_baseline", "baseline production driver manifest");
  if (officialIdentity.driverSha256 !== officialDriverSha256) throw new Error("official production manifest driver SHA-256 mismatch");
  if (officialIdentity.sourceManifestSha256 !== sourceManifestSha256 || officialIdentity.allocatorPath !== join(root, "src/core/backend/regalloc_single_pass.cheng")) throw new Error("official production manifest source/allocator binding mismatch");
  const workloadSource = stableSnapshot(join(root, "src/core/backend/primary_object_plan.cheng"), "production compile workload source");
  return {
    root,
    execBundle,
    sourceManifestSha256: requireSha256(sourceManifestSha256, "release source manifest SHA-256"),
    officialDriverSha256: requireSha256(officialDriverSha256, "release official driver SHA-256"),
    baselineDriverSha256: baselineIdentity.driverSha256,
    officialIdentity,
    baselineIdentity,
    workloadSourceSha256: workloadSource.sha256,
    officialManifest: required("officialManifest"),
    baselineManifest: required("baselineManifest"),
    jobsLock: required("jobsLock"),
    execDiffLock: required("execDiffLock"),
    targetEmitLock: required("targetEmitLock"),
    gen3Lock: required("gen3Lock"),
  };
}

function validateProductionExecBundleEvidence(workDir, reportRows, expected) {
  const identity = boundWorkSnapshot(workDir, reportRows.get("exec_bundle_identity_path"), reportRows.get("exec_bundle_identity_sha256"), "production exec-bundle identity", false, 4 * 1024 * 1024);
  if (basename(identity.path) !== "exec-bundle.initial.txt" || reportRows.get("exec_bundle_identity_actual_sha256") !== identity.sha256) {
    throw new Error("production exec-bundle identity report hash/path mismatch");
  }
  const rows = validatePayloadKv(identity.raw, "production exec-bundle identity", "identity_payload_sha256");
  const labels = [
    {label: "self", key: "gate", basename: "regalloc_production_gate.sh"},
    {label: "guard", key: "guard", basename: "beat_c_process_group_guard.sh"},
    {label: "evidence", key: "evidence", basename: "regalloc_production_evidence.sh"},
    {label: "lock_validator", key: "lockValidator", basename: "regalloc_external_lock_validator.py"},
  ];
  const keys = [
    "schema", "source_root", "exec_bundle", "exec_bundle_device", "exec_bundle_inode",
    "exec_bundle_mtime_ns", "exec_bundle_ctime_ns", "bash_source_path", "binding_mode",
  ];
  for (const {label} of labels) {
    for (const suffix of ["path", "expected_sha256", "actual_sha256", "device", "inode", "size", "mtime_ns", "ctime_ns"]) keys.push(`exec_${label}_${suffix}`);
    for (const suffix of ["path", "sha256", "device", "inode"]) keys.push(`exec_${label}_snapshot_${suffix}`);
  }
  keys.push("identity_payload_sha256");
  exactKeys(rows, keys, "production exec-bundle identity");
  if (rows.get("schema") !== "regalloc_exec_bundle_identity" || rows.get("source_root") !== expected.root ||
      rows.get("exec_bundle") !== expected.execBundle.path || rows.get("bash_source_path") !== expected.execBundle.files.get("gate").path ||
      rows.get("binding_mode") !== "explicit_sha256" || reportRows.get("source_root") !== expected.root ||
      reportRows.get("exec_bundle") !== expected.execBundle.path || reportRows.get("exec_bundle_binding_mode") !== "explicit_sha256" ||
      reportRows.get("exec_bundle_identity_payload_sha256") !== rows.get("identity_payload_sha256")) {
    throw new Error("production exec-bundle root/binding identity mismatch");
  }
  const bundleStat = lstatSync(expected.execBundle.path, {bigint: true});
  if (bundleStat.isSymbolicLink() || !bundleStat.isDirectory()) throw new Error("production exec-bundle directory changed type");
  for (const [key, value] of [
    ["exec_bundle_device", bundleStat.dev], ["exec_bundle_inode", bundleStat.ino],
    ["exec_bundle_mtime_ns", bundleStat.mtimeNs], ["exec_bundle_ctime_ns", bundleStat.ctimeNs],
  ]) {
    if (rows.get(key) !== value.toString()) throw new Error(`production exec-bundle identity ${key} mismatch`);
  }
  if (reportRows.get("exec_bundle_device") !== bundleStat.dev.toString() || reportRows.get("exec_bundle_inode") !== bundleStat.ino.toString()) {
    throw new Error("production report exec-bundle directory identity mismatch");
  }
  const execRoot = canonicalAbsolute(join(workDir, "exec-root"), "production private exec-root", "dir");
  const execTools = canonicalAbsolute(join(execRoot, "tools"), "production private exec tools", "dir");
  const rootEntries = readdirSync(execRoot, {withFileTypes: true});
  const toolEntries = readdirSync(execTools, {withFileTypes: true});
  if (rootEntries.length !== 1 || rootEntries[0].name !== "tools" || !rootEntries[0].isDirectory() || rootEntries[0].isSymbolicLink() ||
      toolEntries.length !== labels.length || toolEntries.some((entry) => !entry.isFile() || entry.isSymbolicLink()) ||
      toolEntries.map((entry) => entry.name).sort().some((name, index) => name !== labels.map((entry) => entry.basename).sort()[index])) {
    throw new Error("production private exec-root exact artifact whitelist mismatch");
  }
  const sourceInodes = new Set();
  const snapshotInodes = new Set();
  const files = [];
  for (const spec of labels) {
    const source = expected.execBundle.files.get(spec.key);
    if (!source) throw new Error(`production exec-bundle source is absent: ${spec.key}`);
    const sourceFinal = stableStreamingSnapshot(source.path, `production exec-bundle ${spec.label} final`);
    if (sourceFinal.sha256 !== source.sha256 || !sameStat(sourceFinal.stat, source.stat)) throw new Error(`production exec-bundle ${spec.label} source changed`);
    const prefix = `exec_${spec.label}`;
    for (const [suffix, value] of [
      ["path", source.path], ["expected_sha256", source.sha256], ["actual_sha256", source.sha256],
      ["device", source.stat.dev.toString()], ["inode", source.stat.ino.toString()], ["size", source.stat.size.toString()],
      ["mtime_ns", source.stat.mtimeNs.toString()], ["ctime_ns", source.stat.ctimeNs.toString()],
    ]) if (rows.get(`${prefix}_${suffix}`) !== value) throw new Error(`production exec-bundle ${prefix}_${suffix} mismatch`);
    if (reportRows.get(`${prefix}_path`) !== source.path || reportRows.get(`${prefix}_expected_sha256`) !== source.sha256 || reportRows.get(`${prefix}_actual_sha256`) !== source.sha256) {
      throw new Error(`production report ${prefix} identity mismatch`);
    }
    const sourceInode = `${source.stat.dev}:${source.stat.ino}`;
    if (sourceInodes.has(sourceInode)) throw new Error("production exec-bundle source inode collision");
    sourceInodes.add(sourceInode);
    const snapshotPath = canonicalAbsolute(join(execTools, spec.basename), `production ${spec.label} private snapshot`, "file", spec.key !== "lockValidator");
    const snapshot = stableStreamingSnapshot(snapshotPath, `production ${spec.label} private snapshot`);
    if (snapshot.sha256 !== source.sha256 || rows.get(`${prefix}_snapshot_path`) !== snapshot.path || rows.get(`${prefix}_snapshot_sha256`) !== snapshot.sha256 ||
        rows.get(`${prefix}_snapshot_device`) !== snapshot.stat.dev.toString() || rows.get(`${prefix}_snapshot_inode`) !== snapshot.stat.ino.toString()) {
      throw new Error(`production exec-bundle ${spec.label} private snapshot mismatch`);
    }
    const snapshotInode = `${snapshot.stat.dev}:${snapshot.stat.ino}`;
    if (sourceInodes.has(snapshotInode) || snapshotInodes.has(snapshotInode)) throw new Error("production exec-bundle snapshot inode collision");
    snapshotInodes.add(snapshotInode);
    files.push({label: spec.label, sourcePath: source.path, sourceSha256: source.sha256, snapshotPath: snapshot.path, snapshotSha256: snapshot.sha256});
  }
  return {schema: "cheng_regalloc_exec_bundle_evidence", identityPath: identity.path, identitySha256: identity.sha256, identityPayloadSha256: rows.get("identity_payload_sha256"), files};
}

function validateProductionGateEvidence(workDirValue, reportPathValue, reportExpectedSha256, stdoutRaw, expected) {
  const workDir = canonicalAbsolute(workDirValue, "production gate work directory", "dir");
  const report = boundWorkSnapshot(workDir, reportPathValue, reportExpectedSha256, "production gate report", false, 64 * 1024 * 1024);
  if (basename(report.path) !== "regalloc-production-gate.report.txt") throw new Error("production gate report basename mismatch");

  const {rows: stdoutRows} = parseUniqueUnhashedKv(stdoutRaw, "production gate stdout");
  exactKeys(stdoutRows, [
    "regalloc_gate_production_status",
    "regalloc_gate_local_diagnostic_status",
    "regalloc_gate_production_green_count",
    "regalloc_gate_production_red_count",
    "regalloc_gate_driver_role",
    "regalloc_gate_report",
    "regalloc_gate_report_sha256",
  ], "production gate stdout");
  if (stdoutRows.get("regalloc_gate_production_status") !== "GREEN" ||
      stdoutRows.get("regalloc_gate_production_red_count") !== "0" ||
      stdoutRows.get("regalloc_gate_driver_role") !== "production" ||
      stdoutRows.get("regalloc_gate_report") !== report.path ||
      stdoutRows.get("regalloc_gate_report_sha256") !== report.sha256) {
    throw new Error("production gate stdout identity/status contract mismatch");
  }

  const {rows: reportRows} = parseUniqueUnhashedKv(report.raw, "production gate report");
  const exact = new Map([
    ["schema", "regalloc_production_gate"],
    ["status", "GREEN"],
    ["production_status", "GREEN"],
    ["mode", "run"],
    ["production_red_count", "0"],
    ["root", expected.root],
    ["source_root", expected.root],
    ["exec_bundle", expected.execBundle.path],
    ["exec_bundle_binding_mode", "explicit_sha256"],
    ["target", TARGET],
    ["driver_role", "production"],
    ["driver_source", join(expected.root, "artifacts/backend_driver/cheng")],
    ["driver_sha256", expected.officialDriverSha256],
    ["source_manifest_sha256", expected.sourceManifestSha256],
    ["official_manifest_sha256", expected.officialManifest.sha256],
    ["baseline_manifest_sha256", expected.baselineManifest.sha256],
    ["memory_guard_kind", "sampled_process_tree_limit"],
    ["memory_limit_bytes", String(DEFAULT_RSS_CAP_BYTES)],
    ["memory_poll_seconds", "0.01"],
    ["hard_memory_limit_proof_status", "not_provable_userspace_poll"],
    ["compile_wall_regress_ppm", "1050000"],
    ["compile_rss_regress_ppm", "1050000"],
    ["compile_pair_count", "3"],
    ["compile_max_spread_ppm", "100000"],
    ["work_dir", workDir],
  ]);
  for (const [key, value] of exact) if (reportRows.get(key) !== value) throw new Error(`production gate report ${key} mismatch`);
  const sourceGitTree = String(reportRows.get("source_git_tree") || "");
  if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(sourceGitTree)) throw new Error("production gate report source_git_tree is invalid");

  const lockFields = [
    ["jobs_determinism", expected.jobsLock],
    ["exec_diff", expected.execDiffLock],
    ["target_emit_hard_fail", expected.targetEmitLock],
    ["gen3_fixed_point", expected.gen3Lock],
  ];
  for (const [kind, artifact] of lockFields) {
    if (reportRows.get(`external_lock_${kind}_path`) !== artifact.path ||
        reportRows.get(`external_lock_${kind}_sha256`) !== artifact.sha256) {
      throw new Error(`production gate report external lock mismatch: ${kind}`);
    }
  }

  const execBundleEvidence = validateProductionExecBundleEvidence(workDir, reportRows, expected);
  const requiredStatusEvidence = validateProductionRequiredStatusEvidence(workDir, reportRows);

  const productionGreenCount = uintValue(reportRows.get("production_green_count"), "production report green count");
  const localGreenCount = uintValue(reportRows.get("local_green_count"), "local report green count");
  const localRedCount = uintValue(reportRows.get("local_red_count"), "local report red count");
  if (productionGreenCount !== BigInt(requiredStatusEvidence.reportProductionCount) ||
      stdoutRows.get("regalloc_gate_production_green_count") !== productionGreenCount.toString() ||
      stdoutRows.get("regalloc_gate_local_diagnostic_status") !== reportRows.get("local_diagnostic_status")) {
    throw new Error("production gate stdout/report count or local-status binding mismatch");
  }
  if (!new Set(["GREEN", "RED"]).has(reportRows.get("local_diagnostic_status"))) throw new Error("production gate local diagnostic status is invalid");

  let countedProductionGreen = 0n;
  let countedProductionRed = 0n;
  let countedLocalGreen = 0n;
  let countedLocalRed = 0n;
  let itemCount = 0;
  for (const [key, value] of reportRows) {
    if (!/^item\..+\.scope$/.test(key)) continue;
    const match = value.match(/^(LOCAL|PRODUCTION|BOTH) status=(GREEN|RED) detail=.*$/);
    if (!match) throw new Error(`production gate report item is malformed: ${key}`);
    itemCount++;
    const [, scope, status] = match;
    if (scope === "PRODUCTION" || scope === "BOTH") status === "GREEN" ? countedProductionGreen++ : countedProductionRed++;
    if (scope === "LOCAL" || scope === "BOTH") status === "GREEN" ? countedLocalGreen++ : countedLocalRed++;
  }
  if (itemCount === 0 || countedProductionGreen !== productionGreenCount || countedProductionRed !== 0n ||
      countedLocalGreen !== localGreenCount || countedLocalRed !== localRedCount) {
    throw new Error("production gate report item counts do not independently reproduce the summary");
  }

  const perfEvidence = validateProductionPerfEvidence(workDir, reportRows);
  const compileEvidence = validateProductionCompilePairs(workDir, reportRows, expected);
  const receiptEvidence = validateProductionReceiptArtifacts(workDir, compileEvidence, expected);
  const guardEvidence = validateProductionGuardDirectory(workDir, reportRows);
  const selectedGuard = guardEvidence.reports.filter((entry) => entry.path === compileEvidence.selected.artifacts.guard.path);
  if (selectedGuard.length !== 1 || selectedGuard[0].sha256 !== compileEvidence.selected.artifacts.guard.sha256) {
    throw new Error("selected workload compile guard is not bound into the complete guard set");
  }
  return {
    schema: "cheng_regalloc_production_gate_evidence",
    reportPath: report.path,
    reportSha256: report.sha256,
    sourceGitTree,
    productionGreenCount: productionGreenCount.toString(),
    compilePairRowCount: compileEvidence.rowCount,
    compileEvidence,
    execBundleEvidence,
    perfEvidence,
    requiredStatusEvidence,
    guardEvidence,
    receiptEvidence,
  };
}

async function runProductionReleaseGate(root, releaseInputs, execBundle, privateToolchain, sourceManifestSha256, officialDriverSha256, timeoutMs, maxBuffer) {
  const workRoot = releaseInputs.releaseWorkRoot;
  const gate = execBundle.files.get("gate");
  const guard = execBundle.files.get("guard");
  if (!gate || !guard) throw new Error("private production gate/guard executable is absent");
  const expected = productionReleaseExpected(root, releaseInputs, execBundle, sourceManifestSha256, officialDriverSha256);
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const outerTag = "production-gate.outer";
  const outerReportPath = join(workRoot, `${outerTag}.guard.txt`);
  const outerStdoutPath = join(workRoot, `${outerTag}.stdout.txt`);
  const outerStderrPath = join(workRoot, `${outerTag}.stderr.txt`);
  const cleanEnv = [
    "-i",
    `PATH=${privateToolchain.bin}`,
    `DEVELOPER_DIR=${privateToolchain.developerDir}`,
    "TMPDIR=/private/tmp",
    "LANG=C",
    "LC_ALL=C",
    `REGALLOC_GATE_WORK_ROOT=${workRoot}`,
    ...Object.entries(releaseInputs.env).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`),
    gate.path,
    `--source-root:${root}`,
    `--exec-bundle:${execBundle.path}`,
    `--exec-self-sha256:${gate.sha256}`,
    `--exec-guard-sha256:${guard.sha256}`,
    `--exec-evidence-sha256:${execBundle.files.get("evidence").sha256}`,
    `--exec-lock-validator-sha256:${execBundle.files.get("lockValidator").sha256}`,
  ];
  const guardArgs = [
    `--rss-limit:${DEFAULT_RSS_CAP_BYTES}`, `--timeout:${timeoutSeconds}`, "--startup-timeout:5", "--cleanup-timeout:20",
    `--report-out:${outerReportPath}`, `--stdout:${outerStdoutPath}`, `--stderr:${outerStderrPath}`, "--", "/usr/bin/env", ...cleanEnv,
  ];
  const run = await runChengDriver(guard.path, guardArgs, {root, cwd: root, exactGuardOwnsTimeoutAndCleanup: true, hardRssCapBytes: DEFAULT_RSS_CAP_BYTES, maxBuffer, env: privateReleaseExecutionEnv(privateToolchain)});
  if (!processSucceeded(run)) {
    throw new Error(`${run.timedOut ? "production gate timed out" : run.overflow ? "production gate output overflow" : `production gate failed rc=${run.exitCode}: ${takeTrailingText(run.stderr, 4000)}`}; evidence retained at ${workRoot}`);
  }
  if (run.stdoutBuffer?.length !== 0 || run.stderrBuffer?.length !== 0) throw new Error(`outer production guard emitted unexpected output; evidence retained at ${workRoot}`);
  const outerGuard = validateProductionGuardReport(workRoot, outerReportPath, {expectedRc: 0, expectedTimeoutSeconds: timeoutSeconds, expectedStartupTimeoutSeconds: 5, expectedCleanupTimeoutSeconds: 20});
  if (outerGuard.timeoutSeconds !== String(timeoutSeconds)) throw new Error("outer production guard timeout does not bind releaseTimeoutSec");
  const stdout = stableSnapshot(outerStdoutPath, "outer production gate stdout", maxBuffer);
  const stderr = stableSnapshot(outerStderrPath, "outer production gate stderr", maxBuffer, true);
  if (stderr.raw.length !== 0) throw new Error(`production gate emitted stderr: ${takeTrailingText(stderr.raw.toString("utf8"), 4000)}; evidence retained at ${workRoot}`);
  const {rows: stdoutRows} = parseUniqueUnhashedKv(stdout.raw, "production gate stdout");
  const reportPath = stdoutRows.get("regalloc_gate_report");
  const reportSha256 = stdoutRows.get("regalloc_gate_report_sha256");
  const workDir = canonicalAbsolute(dirname(String(reportPath || "")), "production gate work directory", "dir");
  if (dirname(workDir) !== workRoot) throw new Error("production gate work directory is not a direct child of its retained root");
  const rootEntries = readdirSync(workRoot, {withFileTypes: true});
  if (rootEntries.some((entry) => entry.isSymbolicLink())) throw new Error("production gate retained root contains a symlink");
  const expectedEntries = [
    ".cheng-regalloc-preflight.claim", "aarch64-f64-runtime-gate", "one-shot-worker", "private-exec-bundle", "private-runtime-bundle", "private-toolchain", "semantic-pipeline-gate", "source-gates", "x86-64-f64-runtime-gate",
    `${outerTag}.guard.txt`, `${outerTag}.stdout.txt`, `${outerTag}.stderr.txt`, basename(workDir),
  ].sort();
  const actualEntries = rootEntries.map((entry) => entry.name).sort();
  if (actualEntries.length !== expectedEntries.length || actualEntries.some((name, index) => name !== expectedEntries[index]) ||
      !rootEntries.find((entry) => entry.name === "private-exec-bundle")?.isDirectory() ||
      !rootEntries.find((entry) => entry.name === "one-shot-worker")?.isDirectory() ||
      !rootEntries.find((entry) => entry.name === "private-runtime-bundle")?.isDirectory() ||
      !rootEntries.find((entry) => entry.name === "private-toolchain")?.isDirectory() ||
      !rootEntries.find((entry) => entry.name === "semantic-pipeline-gate")?.isDirectory() ||
      !rootEntries.find((entry) => entry.name === "source-gates")?.isDirectory() ||
      !rootEntries.find((entry) => entry.name === "aarch64-f64-runtime-gate")?.isDirectory() ||
      !rootEntries.find((entry) => entry.name === "x86-64-f64-runtime-gate")?.isDirectory() ||
      !rootEntries.find((entry) => entry.name === basename(workDir))?.isDirectory()) {
    throw new Error("production gate retained root exact artifact whitelist mismatch");
  }
  const evidence = validateProductionGateEvidence(workDir, reportPath, reportSha256, stdout.raw, expected);
  return {...evidence, outerGuard, releaseWorkRoot: workRoot, pathsRetained: true, validation: {workDir, reportPath, reportSha256, stdoutRaw: stdout.raw, expected}};
}

function processSucceeded(run) {
  return !run.missingDriver && !run.timedOut && !run.overflow && run.exitCode === 0;
}

const SEMANTIC_PIPELINE_RECEIPT_KEYS = Object.freeze([
  "schema", "structuralStatus", "parserEvidenceStatus", "realPipelineReceiptStatus", "overallStatus",
  "formalSpecSha256", "gateSourceSha256", "semanticModelSourceSha256", "pipelineModelSourceSha256",
  "materializerBytesSha256", "privateSourceSetSha256", "driverSha256", "bunSha256", "guardSha256",
  "privateToolchainManifestSha256", "grammarObligationRootSha256", "grammarObligationCount",
  "grammarRequiredCount", "grammarMissingRequiredCount", "grammarSourceCoverageReceiptSha256",
  "parserEvidenceRootSha256", "baseLegalCount", "profileAssignmentCount", "joinedAssignmentCount",
  "legalJoinedCount", "classifierAgreementCount", "classifierAgreementSha256", "coverageContractSha256",
  "matrixCaseCount", "matrixAcceptCount", "matrixRejectCount", "matrixManifestSha256",
  "matrixCoverageReceiptSha256", "baseSourceBundleCount", "profileSourceBundleCount",
  "baseSourceBundleRootSha256", "profileSourceBundleRootSha256", "sourceBundleRootSha256",
  "realPipelineProtocolSha256", "receiptSha256",
]);

function canonicalSemanticReceiptJson(value) {
  const canonicalize = (entry) => {
    if (entry === null || typeof entry === "string" || typeof entry === "boolean") return entry;
    if (typeof entry === "number") {
      if (!Number.isSafeInteger(entry)) throw new Error("semantic pipeline receipt contains a non-safe integer");
      return entry;
    }
    if (Array.isArray(entry)) return entry.map(canonicalize);
    if (typeof entry !== "object") throw new Error("semantic pipeline receipt contains a non-JSON value");
    const out = {};
    for (const key of Object.keys(entry).sort()) out[key] = canonicalize(entry[key]);
    return out;
  };
  return JSON.stringify(canonicalize(value));
}

function semanticRealPipelineProtocolSha256() {
  const protocol = {
    schema: "cheng_real_source_bound_seven_stage_protocol",
    receiptSchema: "cheng.compiler.execution_stage_bundle",
    kind: "cheng-real-source-bound-seven-stage-pipeline",
    implemented: false,
    requiredStages: ["typed_expr", "csg", "lowering", "primary", "primary_regalloc", "backend2", "backend2_regalloc"],
    sourceBindings: [
      "case_id",
      "source_bundle_raw32",
      "materializer_bytes_raw32",
      "grammar_obligation_root_raw32",
      "compiler_source_closure_raw32",
      "driver_bytes_raw32",
      "toolchain_manifest_raw32",
      "command_manifest_raw32",
      "target_triple",
    ],
    requiredObservedFacts: ["int32_node_decl_value_def_identity", "expr_class", "owner_type_layout_offsets", "body_ir_use_def_alias", "emission_bytes", "regalloc_plan_actions_fragments_ingress_roots"],
    requiredMutations: [
      "ownership_flip", "declaration_rebind", "layout_offset_change", "codec_cid_field_drop", "cache_stale_hit", "stage_drop",
      "alias_write", "address_escape", "regalloc_action_change", "regalloc_fragment_change", "regalloc_ingress_change",
      "both_backends_same_wrong", "driver_replace", "toolchain_replace", "source_replace",
    ],
  };
  return sha256(Buffer.from(canonicalSemanticReceiptJson(protocol), "utf8"));
}

function validateSemanticPipelineGateReceipt(raw, expected) {
  let text;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(raw); }
  catch (error) { throw new Error(`semantic pipeline receipt is not UTF-8: ${error instanceof Error ? error.message : String(error)}`); }
  if (!text.endsWith("\n") || text.slice(0, -1).includes("\n") || text.length <= 1) throw new Error("semantic pipeline child must emit exactly one canonical JSON line");
  let receipt;
  try { receipt = JSON.parse(text.slice(0, -1)); }
  catch (error) { throw new Error(`semantic pipeline receipt is not JSON: ${error instanceof Error ? error.message : String(error)}`); }
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("semantic pipeline receipt root must be one object");
  exactKeys(new Map(Object.entries(receipt)), SEMANTIC_PIPELINE_RECEIPT_KEYS, "semantic pipeline receipt");
  const payload = {...receipt};
  delete payload.receiptSha256;
  const independentlyRecomputedReceiptSha256 = sha256(Buffer.from(canonicalSemanticReceiptJson(payload), "utf8"));
  if (requireSha256(receipt.receiptSha256, "semantic pipeline receipt hash") !== independentlyRecomputedReceiptSha256) throw new Error("semantic pipeline receipt payload hash mismatch");
  if (text !== `${canonicalSemanticReceiptJson(receipt)}\n`) throw new Error("semantic pipeline receipt is not canonical JSON");

  const exact = new Map([
    ["schema", SEMANTIC_PIPELINE_GATE_RECEIPT_SCHEMA],
    ["structuralStatus", "GREEN"], ["parserEvidenceStatus", "RED"],
    ["realPipelineReceiptStatus", "RED"], ["overallStatus", "RED"],
    ["formalSpecSha256", expected.formalSpec.sha256], ["gateSourceSha256", expected.gateSource.sha256],
    ["semanticModelSourceSha256", expected.modelSource.sha256], ["pipelineModelSourceSha256", expected.pipelineSource.sha256],
    ["materializerBytesSha256", expected.pipelineSource.sha256], ["privateSourceSetSha256", expected.privateSourceSetSha256],
    ["driverSha256", expected.driver.sha256], ["bunSha256", expected.bun.sha256], ["guardSha256", expected.guard.sha256],
    ["privateToolchainManifestSha256", expected.toolchainManifest.sha256],
    ["realPipelineProtocolSha256", semanticRealPipelineProtocolSha256()],
  ]);
  for (const [key, value] of exact) if (receipt[key] !== value) throw new Error(`semantic pipeline receipt ${key} mismatch`);
  for (const key of SEMANTIC_PIPELINE_RECEIPT_KEYS.filter((key) => key.endsWith("Sha256"))) requireSha256(receipt[key], `semantic pipeline receipt ${key}`);

  const exactCounts = new Map([
    ["baseLegalCount", SEMANTIC_PIPELINE_EXPECTED_COUNTS.baseLegalCount],
    ["profileAssignmentCount", SEMANTIC_PIPELINE_EXPECTED_COUNTS.profileAssignmentCount],
    ["joinedAssignmentCount", SEMANTIC_PIPELINE_EXPECTED_COUNTS.joinedAssignmentCount],
    ["legalJoinedCount", SEMANTIC_PIPELINE_EXPECTED_COUNTS.legalJoinedCount],
    ["classifierAgreementCount", SEMANTIC_PIPELINE_EXPECTED_COUNTS.joinedAssignmentCount],
    ["matrixCaseCount", SEMANTIC_PIPELINE_EXPECTED_COUNTS.matrixCaseCount],
    ["matrixAcceptCount", SEMANTIC_PIPELINE_EXPECTED_COUNTS.matrixAcceptCount],
    ["matrixRejectCount", SEMANTIC_PIPELINE_EXPECTED_COUNTS.matrixRejectCount],
    ["baseSourceBundleCount", SEMANTIC_PIPELINE_EXPECTED_COUNTS.baseLegalCount],
    ["profileSourceBundleCount", SEMANTIC_PIPELINE_EXPECTED_COUNTS.matrixAcceptCount],
  ]);
  for (const [key, value] of exactCounts) if (receipt[key] !== value) throw new Error(`semantic pipeline receipt ${key} mismatch`);
  if (!Number.isSafeInteger(receipt.grammarObligationCount) ||
      !Number.isSafeInteger(receipt.grammarRequiredCount) ||
      !Number.isSafeInteger(receipt.grammarMissingRequiredCount) ||
      receipt.grammarObligationCount <= 0 ||
      receipt.grammarRequiredCount <= 0 ||
      receipt.grammarMissingRequiredCount !== receipt.grammarRequiredCount ||
      receipt.grammarRequiredCount > receipt.grammarObligationCount) {
    throw new Error("semantic pipeline missing-parser obligation counts do not remain fail-closed");
  }
  if (receipt.baseLegalCount * receipt.profileAssignmentCount !== receipt.joinedAssignmentCount || receipt.matrixAcceptCount + receipt.matrixRejectCount !== receipt.matrixCaseCount) throw new Error("semantic pipeline receipt count arithmetic mismatch");
  return {receipt, receiptSha256: independentlyRecomputedReceiptSha256};
}

function semanticPipelineSnapshot(sourceInputs, relativePath, label) {
  const snapshot = sourceInputs.byLabel.get(`fusion/${relativePath}`);
  if (!snapshot?.raw) throw new Error(`${label} is absent from the complete source snapshot`);
  return snapshot;
}

function semanticPipelineExecutionEnvironment(toolchain, directory, inputs) {
  const home = join(directory, "home");
  const temp = join(directory, "tmp");
  mkdirSync(home, {mode: 0o700});
  mkdirSync(temp, {mode: 0o700});
  return {
    home,
    temp,
    env: {
      PATH: toolchain.bin, DEVELOPER_DIR: toolchain.developerDir,
      HOME: home, TMPDIR: temp, XDG_CONFIG_HOME: home,
      LANG: "C", LC_ALL: "C", TZ: "UTC", CI: "1", NO_COLOR: "1",
      PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", PYTHONSAFEPATH: "1",
      // guard monitor 身份校验比对 requested==actual; toolchain bin/python3 是 wrapper,
      // 必须显式钉到 wrapper exec 后的真实解释器, 否则 requested(wrapper) != actual(runtime)
      BEAT_C_GUARD_MONITOR_PYTHON: join(toolchain.pythonRuntime.bin, "python3"),
      CHENG_M9024_FORMAL_SPEC_PATH: inputs.formalSpec.path,
      CHENG_M9024_FORMAL_SPEC_SHA256: inputs.formalSpec.sha256,
      CHENG_M9024_DRIVER_PATH: inputs.driver.path,
      CHENG_M9024_DRIVER_SHA256: inputs.driver.sha256,
      CHENG_M9024_BUN_PATH: inputs.bun.path,
      CHENG_M9024_BUN_SHA256: inputs.bun.sha256,
      CHENG_M9024_GUARD_PATH: inputs.guard.path,
      CHENG_M9024_GUARD_SHA256: inputs.guard.sha256,
      CHENG_M9024_TOOLCHAIN_MANIFEST_PATH: inputs.toolchainManifest.path,
      CHENG_M9024_TOOLCHAIN_MANIFEST_SHA256: inputs.toolchainManifest.sha256,
      CHENG_M9024_GATE_SOURCE_SHA256: inputs.gateSource.sha256,
      CHENG_M9024_MODEL_SOURCE_SHA256: inputs.modelSource.sha256,
      CHENG_M9024_PIPELINE_SOURCE_SHA256: inputs.pipelineSource.sha256,
      CHENG_M9024_PRIVATE_SOURCE_SET_SHA256: inputs.privateSourceSetSha256,
    },
  };
}

function semanticPipelineScratchEvidence(home, temp) {
  const rows = [];
  const walk = (root, prefix, directory) => {
    for (const entry of readdirSync(directory, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      const relativePath = `${prefix}/${relative(root, path).split("\\").join("/")}`;
      const stat = lstatSync(path, {bigint: true});
      if (entry.isSymbolicLink() || stat.isSymbolicLink()) throw new Error(`semantic pipeline isolated scratch contains a symlink: ${relativePath}`);
      if (entry.isDirectory() && stat.isDirectory()) {
        rows.push({relativePath, type: "dir", sha256: "-", stat});
        walk(root, prefix, path);
      } else if (entry.isFile() && stat.isFile()) {
        if (stat.nlink !== 1n) throw new Error(`semantic pipeline isolated scratch contains a hardlinked file: ${relativePath}`);
        const snapshot = stableStreamingSnapshot(path, `semantic pipeline isolated scratch ${relativePath}`);
        rows.push({relativePath, type: "file", sha256: snapshot.sha256, stat: snapshot.stat});
      } else throw new Error(`semantic pipeline isolated scratch contains a non-regular entry: ${relativePath}`);
    }
  };
  walk(home, "home", home);
  walk(temp, "tmp", temp);
  rows.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const artifactSetSha256 = sha256(Buffer.from(rows.map((entry) => `${entry.relativePath}\0${entry.type}\0${entry.sha256}\0${entry.stat.dev}\0${entry.stat.ino}\0${entry.stat.size}\0${entry.stat.mode}\0${entry.stat.nlink}\0${entry.stat.mtimeNs}\0${entry.stat.ctimeNs}\n`).join(""), "utf8"));
  return {artifactCount: rows.length, artifactSetSha256};
}

async function runSemanticPipelineGate(root, mode, sourceInputs, inputColdDriver, inputCompiler, driverPin, compilerPin, privateReleaseToolchain, oneShotContext, maxBuffer) {
  const temporaryRoot = mode === "release" ? null : canonicalAbsolute(realpathSync.native(mkdtempSync(join(tmpdir(), "cheng-semantic-pipeline-gate-"))), "semantic pipeline temporary root", "dir");
  const executionRoot = mode === "release" ? oneShotContext.releaseWorkRoot : temporaryRoot;
  const directory = join(executionRoot, "semantic-pipeline-gate");
  mkdirSync(directory, {mode: 0o700});
  let toolchain = privateReleaseToolchain;
  try {
    if (mode !== "release") toolchain = materializePrivateReleaseToolchain({releaseWorkRoot: executionRoot}, inputColdDriver, inputCompiler, driverPin, compilerPin);
    if (!toolchain) throw new Error("semantic pipeline gate requires an actual private toolchain");
    const toolchainEvidence = validatePrivateReleaseToolchain(toolchain);
    const privateSourceTree = mode === "release"
      ? {sourceRoot: oneShotContext.privateSourceRoot, artifactSetSha256: oneShotContext.privateSourceSetSha256, artifacts: oneShotContext.privateSources}
      : materializePrivateOneShotSourceTree(sourceInputs, directory);
    const privateSourceEvidence = validatePrivateOneShotSourceTree({privateSourceRoot: privateSourceTree.sourceRoot, privateSourceSetSha256: privateSourceTree.artifactSetSha256, privateSources: privateSourceTree.artifacts});
    const gateSource = stableSnapshot(join(privateSourceEvidence.sourceRoot, SEMANTIC_PIPELINE_GATE_RELATIVE), "private semantic pipeline gate source", MAX_SNAPSHOT_BYTES);
    const modelSource = stableSnapshot(join(privateSourceEvidence.sourceRoot, SEMANTIC_MODEL_RELATIVE), "private semantic model source", MAX_SNAPSHOT_BYTES);
    const pipelineSource = stableSnapshot(join(privateSourceEvidence.sourceRoot, SEMANTIC_PIPELINE_MODEL_RELATIVE), "private semantic pipeline model source", MAX_SNAPSHOT_BYTES);
    for (const [snapshot, relativePath, label] of [[gateSource, SEMANTIC_PIPELINE_GATE_RELATIVE, "gate"], [modelSource, SEMANTIC_MODEL_RELATIVE, "model"], [pipelineSource, SEMANTIC_PIPELINE_MODEL_RELATIVE, "pipeline model"]]) {
      const pinned = semanticPipelineSnapshot(sourceInputs, relativePath, `semantic pipeline ${label}`);
      if (snapshot.sha256 !== pinned.sha256) throw new Error(`private semantic pipeline ${label} bytes differ from the complete source snapshot`);
    }
    const formalPinned = sourceInputs.byLabel.get(FORMAL_SPEC_RELATIVE);
    if (!formalPinned?.raw) throw new Error("formal specification is absent from the complete source snapshot");
    const formalSpec = writeExclusiveSnapshot(join(directory, "cheng-formal-spec.md"), formalPinned.raw, "private semantic pipeline formal specification", 0o600);
    if (formalSpec.sha256 !== formalPinned.sha256) throw new Error("private semantic pipeline formal specification bytes differ");
    const bun = mode === "release"
      ? exactIdentitySnapshot(oneShotContext.bun, "semantic pipeline private Bun", true)
      : (() => {
          const source = stableStreamingSnapshot(canonicalAbsolute(realpathSync.native(process.execPath), "semantic pipeline Bun source", "file", true), "semantic pipeline Bun source");
          return copyStableExecutableToPrivatePath(source.path, "semantic pipeline private Bun", join(directory, "bun"), source);
        })();
    let guard;
    if (mode === "release") guard = exactIdentitySnapshot(oneShotContext.guard, "semantic pipeline private guard", true);
    else {
      const pinned = sourceInputs.byLabel.get(PRODUCTION_GATE_DEPENDENCY_FILES.guard);
      if (!pinned?.raw || pinned.sha256 !== PRODUCTION_GATE_DEPENDENCY_EXPECTED_SHA256[PRODUCTION_GATE_DEPENDENCY_FILES.guard]) throw new Error("semantic pipeline guard is absent or not the exact pinned guard");
      guard = writeExclusiveSnapshot(join(directory, "guard.sh"), pinned.raw, "semantic pipeline private guard", 0o700);
    }
    const driver = stableStreamingSnapshot(toolchain.coldDriver.path, "semantic pipeline private cold driver");
    const toolchainManifest = stableSnapshot(toolchain.manifest.path, "semantic pipeline private toolchain manifest", MAX_SNAPSHOT_BYTES);
    const inputs = {formalSpec, driver, bun, guard, toolchainManifest, gateSource, modelSource, pipelineSource, privateSourceSetSha256: privateSourceEvidence.artifactSetSha256};
    const isolated = semanticPipelineExecutionEnvironment(toolchain, directory, inputs);
    const unsetEnv = Object.keys(process.env).sort();
    const reportPath = join(directory, "semantic-pipeline.guard.txt");
    const stdoutPath = join(directory, "semantic-pipeline.stdout.txt");
    const stderrPath = join(directory, "semantic-pipeline.stderr.txt");
    const args = [gateSource.path];
    const guardArgs = [
      `--rss-limit:${DEFAULT_RSS_CAP_BYTES}`, `--timeout:${SEMANTIC_PIPELINE_GATE_TIMEOUT_SECONDS}`, "--startup-timeout:5", "--cleanup-timeout:20",
      `--report-out:${reportPath}`, `--stdout:${stdoutPath}`, `--stderr:${stderrPath}`, "--", bun.path, ...args,
    ];
    const guarded = await runChengDriver(guard.path, guardArgs, {
      root, cwd: privateSourceEvidence.sourceRoot, maxBuffer,
      exactGuardOwnsTimeoutAndCleanup: true, hardRssCapBytes: DEFAULT_RSS_CAP_BYTES,
      unsetEnv, env: isolated.env,
    });
    if (!processSucceeded(guarded) || guarded.stdoutBuffer?.length !== 0 || guarded.stderrBuffer?.length !== 0) {
      let childStderr = "";
      let childStdout = "";
      try { childStderr = readFileSync(stderrPath, "utf8"); } catch {}
      try { childStdout = readFileSync(stdoutPath, "utf8"); } catch {}
      throw new Error(`semantic pipeline private child guard failed rc=${guarded.exitCode}: ${takeTrailingText(guarded.stderr, 4000)}${childStderr ? ` child-stderr=${takeTrailingText(childStderr, 2000)}` : ""}${childStdout ? ` child-stdout=${takeTrailingText(childStdout, 2000)}` : ""}`);
    }
    const guardEvidence = validateProductionGuardReport(directory, reportPath, {expectedRc: 0, expectedTimeoutSeconds: SEMANTIC_PIPELINE_GATE_TIMEOUT_SECONDS, expectedStartupTimeoutSeconds: 5, expectedCleanupTimeoutSeconds: 20});
    const stdout = stableSnapshot(stdoutPath, "semantic pipeline child stdout", maxBuffer);
    const stderr = stableSnapshot(stderrPath, "semantic pipeline child stderr", maxBuffer, true);
    if (stderr.raw.length !== 0) throw new Error(`semantic pipeline child emitted stderr: ${takeTrailingText(stderr.raw.toString("utf8"), 4000)}`);
    const parsed = validateSemanticPipelineGateReceipt(stdout.raw, inputs);
    const scratchEvidence = semanticPipelineScratchEvidence(isolated.home, isolated.temp);
    const envEvidence = requestedChildEnvEvidence({env: isolated.env, unsetEnv, hardRssCapBytes: DEFAULT_RSS_CAP_BYTES});
    const fields = [
      ["schema", "cheng_semantic_pipeline_parent_receipt"], ["mode", mode],
      ["child_receipt_sha256", parsed.receiptSha256], ["guard_report_sha256", guardEvidence.sha256],
      ["stdout_sha256", stdout.sha256], ["stderr_sha256", stderr.sha256],
      ["argv_json", JSON.stringify(args)], ["argv_sha256", sha256(Buffer.from(JSON.stringify(args), "utf8"))],
      ["env_key_count", envEvidence.keyCount], ["env_keys_sha256", envEvidence.keysSha256], ["env_values_sha256", envEvidence.valuesSha256],
      ["formal_spec_sha256", formalSpec.sha256], ["driver_sha256", driver.sha256], ["bun_sha256", bun.sha256],
      ["guard_sha256", guard.sha256], ["private_toolchain_manifest_sha256", toolchainManifest.sha256],
      ["private_source_set_sha256", privateSourceEvidence.artifactSetSha256], ["gate_source_sha256", gateSource.sha256],
      ["model_source_sha256", modelSource.sha256], ["pipeline_source_sha256", pipelineSource.sha256],
      ["isolated_scratch_artifact_count", scratchEvidence.artifactCount], ["isolated_scratch_artifact_set_sha256", scratchEvidence.artifactSetSha256],
    ];
    const parentReceipt = writeExclusiveSnapshot(join(directory, "semantic-pipeline.parent-receipt.txt"), renderHashedKv(fields, "receipt_payload_sha256"), "semantic pipeline parent receipt");
    fsyncDirectory(directory);
    if (mode === "release") fsyncDirectory(executionRoot);
    return {
      schema: "cheng_semantic_pipeline_gate_evidence",
      pathsRetained: mode === "release",
      directory: mode === "release" ? directory : null,
      structuralStatus: parsed.receipt.structuralStatus,
      parserEvidenceStatus: parsed.receipt.parserEvidenceStatus,
      realPipelineReceiptStatus: parsed.receipt.realPipelineReceiptStatus,
      overallStatus: parsed.receipt.overallStatus,
      receiptSha256: parsed.receiptSha256,
      parentReceiptSha256: parentReceipt.sha256,
      guardEvidence,
      stdoutSha256: stdout.sha256,
      stderrSha256: stderr.sha256,
      grammarObligationRootSha256: parsed.receipt.grammarObligationRootSha256,
      grammarRequiredCount: parsed.receipt.grammarRequiredCount,
      parserEvidenceRootSha256: parsed.receipt.parserEvidenceRootSha256,
      coverageContractSha256: parsed.receipt.coverageContractSha256,
      matrixManifestSha256: parsed.receipt.matrixManifestSha256,
      sourceBundleRootSha256: parsed.receipt.sourceBundleRootSha256,
      joinedAssignmentCount: parsed.receipt.joinedAssignmentCount,
      legalJoinedCount: parsed.receipt.legalJoinedCount,
      matrixCaseCount: parsed.receipt.matrixCaseCount,
      baseSourceBundleCount: parsed.receipt.baseSourceBundleCount,
      profileSourceBundleCount: parsed.receipt.profileSourceBundleCount,
      privateSourceSetSha256: privateSourceEvidence.artifactSetSha256,
      privateToolchainManifestSha256: toolchainEvidence.manifestSha256,
      driverSha256: driver.sha256,
      bunSha256: bun.sha256,
      guardSha256: guard.sha256,
      formalSpecSha256: formalSpec.sha256,
      peakBytes: guardEvidence.peakBytes,
      sampleCount: guardEvidence.sampleCount,
      isolatedScratchArtifactCount: scratchEvidence.artifactCount,
      isolatedScratchArtifactSetSha256: scratchEvidence.artifactSetSha256,
    };
  } finally {
    if (temporaryRoot && process.env.CHENG_M9022_KEEP_GATE_SCRATCH !== "1") rmSync(temporaryRoot, {recursive: true, force: true});
    else if (temporaryRoot) console.error(`[m9022] gate scratch retained: ${temporaryRoot}`);
  }
}

function createReleaseSourceGuardContext(releaseInputs, execBundle, privateToolchain) {
  const directory = join(releaseInputs.releaseWorkRoot, "source-gates");
  mkdirSync(directory, {mode: 0o700});
  fsyncDirectory(directory);
  fsyncDirectory(releaseInputs.releaseWorkRoot);
  const contracts = releaseSourceChildContracts();
  return {schema: "cheng_regalloc_source_guard_context", directory: canonicalAbsolute(directory, "release source guard directory", "dir"), guard: execBundle.files.get("guard").path, executionEnv: privateReleaseExecutionEnv(privateToolchain), contracts, tags: new Set(), reports: [], receipts: [], toolPins: new Map(), inputPins: new Map()};
}

function releaseSourceChildContracts() {
  if (TYPED_EXPR_MATRIX.length !== 95) throw new Error("release source child contract requires the independent canonical 95-case TypedExpr matrix");
  const rows = [
    {tag: "cheng-internal.compile", caseId: "cheng_internal_contract", expectedRc: "zero", expectedOutput: "present"},
    {tag: "cheng-internal.run", caseId: "cheng_internal_contract", expectedRc: "zero", expectedOutput: "none"},
    {tag: "bodyir.o2.compile", caseId: "bodyir_o2", expectedRc: "zero", expectedOutput: "present"},
    {tag: "bodyir.o2.run", caseId: "bodyir_o2", expectedRc: "zero", expectedOutput: "none"},
    {tag: "bodyir.sanitized.compile", caseId: "bodyir_sanitized", expectedRc: "zero", expectedOutput: "present"},
    {tag: "bodyir.sanitized.run", caseId: "bodyir_sanitized", expectedRc: "zero", expectedOutput: "none"},
  ];
  for (const entry of TYPED_EXPR_MATRIX) {
    rows.push({tag: `typedexpr.${entry.id}.compile`, caseId: entry.id, expectedRc: entry.expected === "GREEN" ? "zero" : "nonzero", expectedOutput: entry.expected === "GREEN" ? "present" : "absent"});
    if (entry.expected === "GREEN") rows.push({tag: `typedexpr.${entry.id}.run`, caseId: entry.id, expectedRc: "zero", expectedOutput: "none"});
  }
  rows.sort((left, right) => left.tag.localeCompare(right.tag));
  if (new Set(rows.map((entry) => entry.tag)).size !== rows.length) throw new Error("release source child contract contains duplicate tags");
  return new Map(rows.map((entry) => [entry.tag, entry]));
}

function requestedChildEnvEvidence(options) {
  const effective = {...process.env};
  for (const key of options.unsetEnv || []) delete effective[key];
  Object.assign(effective, options.env || {});
  effective.CHENG_PROCESS_MAX_RSS_BYTES = String(options.hardRssCapBytes);
  const rows = Object.entries(effective).sort(([left], [right]) => left.localeCompare(right));
  return {
    keyCount: rows.length,
    keysSha256: sha256(Buffer.from(rows.map(([key]) => `${key}\n`).join(""), "utf8")),
    valuesSha256: sha256(Buffer.from(rows.map(([key, value]) => `${key}\0${value}\n`).join(""), "utf8")),
  };
}

function sourceChildOutputPath(args) {
  const explicit = args.find((arg) => String(arg).startsWith("--out:"));
  if (explicit) return String(explicit).slice("--out:".length);
  const index = args.indexOf("-o");
  return index >= 0 && index + 1 < args.length ? String(args[index + 1]) : null;
}

function pinSourceChildPath(cache, path, label, allowEmpty = false) {
  const prior = cache.get(path);
  if (prior) {
    const stat = lstatSync(path, {bigint: true});
    if (!sameStat(prior.stat, stat)) throw new Error(`${label} changed after its first exact pin`);
    return prior;
  }
  const snapshot = stableStreamingSnapshot(path, label, allowEmpty ? MAX_SNAPSHOT_BYTES : MAX_SNAPSHOT_BYTES);
  cache.set(path, snapshot);
  return snapshot;
}

function sourceChildInputSnapshots(args, outputPath, context) {
  const paths = new Set();
  for (const argValue of args) {
    const arg = String(argValue);
    const candidate = arg.startsWith("--in:") ? arg.slice("--in:".length) : arg;
    if (!isAbsolute(candidate) || candidate === outputPath) continue;
    try {
      const stat = lstatSync(candidate);
      if (stat.isFile() && !stat.isSymbolicLink()) paths.add(canonicalAbsolute(candidate, "release source child input", "file"));
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
  }
  return [...paths].sort().map((path) => pinSourceChildPath(context.inputPins, path, `release source child input ${path}`));
}

async function runPreflightChild(driver, args, options, guardContext, tag) {
  if (!guardContext) return runChengDriver(driver, args, options);
  const contract = guardContext.contracts.get(tag);
  if (!contract || !/^[a-z0-9][a-z0-9._-]*$/.test(tag) || guardContext.tags.has(tag)) throw new Error(`release source guard tag is unknown or duplicate: ${tag}`);
  guardContext.tags.add(tag);
  const outputPath = sourceChildOutputPath(args);
  const tool = pinSourceChildPath(guardContext.toolPins, canonicalAbsolute(driver, `release source child tool ${tag}`, "file", true), `release source child tool ${tag}`);
  const guardTool = pinSourceChildPath(guardContext.toolPins, canonicalAbsolute(guardContext.guard, "release source child guard", "file", true), "release source child guard");
  const inputs = sourceChildInputSnapshots(args, outputPath, guardContext);
  const effectiveOptions = {...options, env: privateReleaseExecutionEnv({bin: guardContext.executionEnv.PATH, developerDir: guardContext.executionEnv.DEVELOPER_DIR}, options.env || {})};
  const envEvidence = requestedChildEnvEvidence(effectiveOptions);
  const cwd = canonicalAbsolute(options.cwd || options.root, `release source child cwd ${tag}`, "dir");
  const reportPath = join(guardContext.directory, `${tag}.guard.txt`);
  const stdoutPath = join(guardContext.directory, `${tag}.stdout.txt`);
  const stderrPath = join(guardContext.directory, `${tag}.stderr.txt`);
  const timeoutMs = Number(options.hardTimeoutMs);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error(`release source guard ${tag} requires hardTimeoutMs`);
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const guardArgs = [
    `--rss-limit:${DEFAULT_RSS_CAP_BYTES}`, `--timeout:${timeoutSeconds}`, "--startup-timeout:5", "--cleanup-timeout:10",
    `--report-out:${reportPath}`, `--stdout:${stdoutPath}`, `--stderr:${stderrPath}`, "--", driver, ...args,
  ];
  const {hardTimeoutMs: innerTimeoutMs, ...outerOptions} = effectiveOptions;
  const guarded = await runChengDriver(guardContext.guard, guardArgs, {...outerOptions, exactGuardOwnsTimeoutAndCleanup: true, hardRssCapBytes: DEFAULT_RSS_CAP_BYTES});
  if (guarded.missingDriver || guarded.timedOut || guarded.overflow || guarded.exitCode === null) return guarded;
  try {
    const evidence = validateProductionGuardReport(guardContext.directory, reportPath, {expectedTimeoutSeconds: timeoutSeconds, expectedStartupTimeoutSeconds: 5, expectedCleanupTimeoutSeconds: 10});
    if (evidence.rc !== guarded.exitCode) throw new Error(`release source guard ${tag} wrapper/child rc mismatch`);
    const stdout = stableSnapshot(stdoutPath, `release source guard ${tag} stdout final`, options.maxBuffer || DEFAULT_MAX_OUTPUT_BYTES, true);
    const stderr = stableSnapshot(stderrPath, `release source guard ${tag} stderr final`, options.maxBuffer || DEFAULT_MAX_OUTPUT_BYTES, true);
    const overflow = stdout.raw.length + stderr.raw.length > (options.maxBuffer || DEFAULT_MAX_OUTPUT_BYTES);
    const outputExists = outputPath ? pathEntryExists(outputPath) : false;
    if ((contract.expectedRc === "zero" && evidence.rc !== 0) || (contract.expectedRc === "nonzero" && evidence.rc === 0) ||
        (contract.expectedOutput === "present" && !outputExists) || (contract.expectedOutput === "absent" && outputExists)) {
      throw new Error(`release source child ${tag} does not satisfy its independent rc/output contract`);
    }
    const output = outputExists ? stableStreamingSnapshot(canonicalAbsolute(outputPath, `release source child output ${tag}`, "file", true), `release source child output ${tag}`) : null;
    const finalToolStat = lstatSync(tool.path, {bigint: true});
    const finalGuardStat = lstatSync(guardTool.path, {bigint: true});
    if (!sameStat(tool.stat, finalToolStat) || !sameStat(guardTool.stat, finalGuardStat)) throw new Error(`release source child ${tag} tool identity changed`);
    const fields = [
      ["schema", "cheng_regalloc_source_child_receipt"], ["tag", tag], ["case_id", contract.caseId],
      ["expected_rc", contract.expectedRc], ["actual_rc", evidence.rc], ["expected_output", contract.expectedOutput],
      ["tool_path", tool.path], ["tool_sha256", tool.sha256], ["tool_device", tool.stat.dev], ["tool_inode", tool.stat.ino],
      ["guard_tool_path", guardTool.path], ["guard_tool_sha256", guardTool.sha256], ["cwd", cwd],
      ["argv_json", JSON.stringify(args)], ["argv_sha256", sha256(Buffer.from(JSON.stringify(args), "utf8"))],
      ["env_key_count", envEvidence.keyCount], ["env_keys_sha256", envEvidence.keysSha256], ["env_values_sha256", envEvidence.valuesSha256],
      ["input_count", inputs.length],
    ];
    for (let index = 0; index < inputs.length; index++) fields.push(
      [`input.${index}.path`, inputs[index].path], [`input.${index}.sha256`, inputs[index].sha256],
      [`input.${index}.device`, inputs[index].stat.dev], [`input.${index}.inode`, inputs[index].stat.ino],
    );
    fields.push(
      ["output_state", output ? "present" : "absent"], ["output_path", output?.path || ""], ["output_sha256", output?.sha256 || ""],
      ["guard_report_path", evidence.path], ["guard_report_sha256", evidence.sha256],
      ["stdout_path", stdout.path], ["stdout_sha256", stdout.sha256], ["stderr_path", stderr.path], ["stderr_sha256", stderr.sha256],
    );
    const receipt = writeExclusiveSnapshot(join(guardContext.directory, `${tag}.receipt.txt`), renderHashedKv(fields, "receipt_payload_sha256"), `release source child receipt ${tag}`);
    guardContext.reports.push(evidence);
    guardContext.receipts.push({tag, contract, receipt, tool, guardTool, inputs, output, report: evidence, stdout, stderr});
    return {missingDriver: false, driver, exitCode: overflow ? null : evidence.rc, stdout: stdout.raw.toString("utf8"), stderr: stderr.raw.toString("utf8"), stdoutBuffer: stdout.raw, stderrBuffer: stderr.raw, timedOut: false, overflow};
  } catch (error) {
    return {missingDriver: false, driver, exitCode: null, stdout: "", stderr: error instanceof Error ? error.message : String(error), stdoutBuffer: Buffer.alloc(0), stderrBuffer: Buffer.from(error instanceof Error ? error.message : String(error)), timedOut: false, overflow: false, guardValidationFailed: true};
  }
}

function finalizeReleaseSourceGuardContext(context) {
  const expectedTags = [...context.contracts.keys()].sort();
  const actualTags = [...context.tags].sort();
  if (actualTags.length !== expectedTags.length || actualTags.some((tag, index) => tag !== expectedTags[index])) {
    throw new Error("release source guard tags do not equal the independent canonical 95-case child contract");
  }
  const expectedNames = expectedTags.flatMap((tag) => [`${tag}.guard.txt`, `${tag}.stdout.txt`, `${tag}.stderr.txt`, `${tag}.receipt.txt`]).sort();
  const entries = readdirSync(context.directory, {withFileTypes: true});
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) throw new Error("release source guard directory contains a non-regular artifact");
  const actualNames = entries.map((entry) => entry.name).sort();
  if (actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index]) ||
      context.reports.length !== expectedTags.length || context.receipts.length !== expectedTags.length) {
    throw new Error("release source guard artifact set is incomplete or contains extras");
  }
  for (const pin of [...context.toolPins.values(), ...context.inputPins.values()]) {
    const final = stableStreamingSnapshot(pin.path, `release source final pin ${pin.path}`);
    if (final.sha256 !== pin.sha256 || !sameStat(final.stat, pin.stat)) throw new Error(`release source child pinned input/tool changed: ${pin.path}`);
  }
  const receipts = context.receipts.sort((left, right) => left.tag.localeCompare(right.tag));
  for (let index = 0; index < receipts.length; index++) {
    const entry = receipts[index];
    if (entry.tag !== expectedTags[index]) throw new Error("release source child receipt order mismatch");
    const final = stableSnapshot(entry.receipt.path, `release source child receipt ${entry.tag} final`);
    if (final.sha256 !== entry.receipt.sha256 || !sameStat(final.stat, entry.receipt.stat)) throw new Error(`release source child receipt changed: ${entry.tag}`);
    const rows = validatePayloadKv(final.raw, `release source child receipt ${entry.tag}`, "receipt_payload_sha256");
    const inputCount = Number(uintValue(rows.get("input_count"), `release source child receipt ${entry.tag} input_count`, 1024n));
    const exactReceiptKeys = [
      "schema", "tag", "case_id", "expected_rc", "actual_rc", "expected_output",
      "tool_path", "tool_sha256", "tool_device", "tool_inode", "guard_tool_path", "guard_tool_sha256",
      "cwd", "argv_json", "argv_sha256", "env_key_count", "env_keys_sha256", "env_values_sha256", "input_count",
    ];
    for (let inputIndex = 0; inputIndex < inputCount; inputIndex++) exactReceiptKeys.push(`input.${inputIndex}.path`, `input.${inputIndex}.sha256`, `input.${inputIndex}.device`, `input.${inputIndex}.inode`);
    exactReceiptKeys.push("output_state", "output_path", "output_sha256", "guard_report_path", "guard_report_sha256", "stdout_path", "stdout_sha256", "stderr_path", "stderr_sha256", "receipt_payload_sha256");
    exactKeys(rows, exactReceiptKeys, `release source child receipt ${entry.tag}`);
    if (rows.get("schema") !== "cheng_regalloc_source_child_receipt" || rows.get("tag") !== entry.tag ||
        rows.get("case_id") !== entry.contract.caseId || rows.get("expected_rc") !== entry.contract.expectedRc ||
        rows.get("expected_output") !== entry.contract.expectedOutput || rows.get("guard_report_sha256") !== entry.report.sha256 ||
        rows.get("stdout_sha256") !== entry.stdout.sha256 || rows.get("stderr_sha256") !== entry.stderr.sha256 ||
        rows.get("tool_sha256") !== entry.tool.sha256 || rows.get("guard_tool_sha256") !== entry.guardTool.sha256 ||
        rows.get("output_state") !== (entry.output ? "present" : "absent") || rows.get("output_sha256") !== (entry.output?.sha256 || "") ||
        inputCount !== entry.inputs.length) {
      throw new Error(`release source child receipt binding mismatch: ${entry.tag}`);
    }
  }
  const receiptSetSha256 = sha256(Buffer.from(receipts.map((entry) => `${entry.tag}\0${entry.receipt.sha256}\n`).join(""), "utf8"));
  return {schema: "cheng_regalloc_source_guard_set", independentCaseCount: TYPED_EXPR_MATRIX.length, childReceiptCount: receipts.length, receiptSetSha256, guardReportCount: context.reports.length, tags: actualTags, reports: context.reports.sort((left, right) => left.tag.localeCompare(right.tag)), receipts: receipts.map((entry) => ({tag: entry.tag, path: entry.receipt.path, sha256: entry.receipt.sha256}))};
}

function executableMaterialized(path) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size <= 0) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch { return false; }
}

async function compileAndRunChengFixture(root, driver, tempDir, timeoutMs, maxBuffer, hardExecutionOptions, guardContext) {
  const output = join(tempDir, "regalloc-source-contract.exe");
  const compile = await runPreflightChild(driver, ["system-link-exec", `--root:${root}`, `--in:${CHENG_FIXTURE}`, "--emit:exe", "--link-providers", `--target:${TARGET}`, `--out:${output}`], formalChengDriverOptions(root, timeoutMs, maxBuffer, hardExecutionOptions), guardContext, "cheng-internal.compile");
  if (!processSucceeded(compile) || !executableMaterialized(output)) return {status: "RED", reason: compile.timedOut ? "compile_timed_out" : compile.overflow ? "compile_output_overflow" : compile.exitCode === 0 ? "executable_not_materialized" : "compile_failed", compileRc: compile.exitCode, stderrTail: takeTrailingText(compile.stderr, 2000)};
  const run = await runPreflightChild(output, [], formalChengDriverOptions(root, timeoutMs, maxBuffer, hardExecutionOptions), guardContext, "cheng-internal.run");
  const emptyOutput = run.stdoutBuffer?.length === 0 && run.stderrBuffer?.length === 0;
  return {status: processSucceeded(run) && emptyOutput ? "GREEN" : "RED", reason: !processSucceeded(run) ? "fixture_run_failed" : !emptyOutput ? "fixture_output_contract_mismatch" : "real_internal_contract_and_typedexpr_fixture_passed", compileRc: compile.exitCode, runRc: run.exitCode, stdoutTail: takeTrailingText(run.stdout, 1000), stderrTail: takeTrailingText(run.stderr, 1000)};
}

function pathEntryExists(path) {
  try { lstatSync(path); return true; }
  catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function typedExprDiagnosticMatches(kind, output) {
  const text = String(output || "").toLowerCase();
  const tokens = {
    missing_element_type: ["missing element type", "缺少元素类型", "list literal requires type context"],
    static_argument_type: ["static argument type unavailable", "list literal element type mismatch", "sequence literal element type mismatch", "argument element type mismatch"],
    fixed_length: ["fixed length mismatch", "fixed-length mismatch", "list literal length mismatch", "static argument type unavailable"],
    ambiguous_call: ["ambiguous call declaration", "ambiguous overload"],
    constructor_field: ["unknown object constructor field", "unknown aggregate constructor field"],
    no_pointer: ["no-pointer policy"],
    range_not_first_class: ["range expression is not a first-class call argument", "range value is not first-class"],
    direct_comprehension_argument: ["direct list comprehension argument is unsupported", "bind the list comprehension before passing it"],
    space_call_removed: ["space-call syntax is not supported", "use f(x) instead of f x", "space call is forbidden", "trailing tokens in return value"],
  };
  return (tokens[kind] || []).some((token) => text.includes(token.toLowerCase()));
}

function validateQualifiedNestedCallDeclarationWitness(fixtureRaw, moduleRaw) {
  const witness = QUALIFIED_NESTED_CALL_WITNESS;
  const fixtureText = authoritySourceText(fixtureRaw, witness.fixtureFile);
  const moduleText = authoritySourceText(moduleRaw, witness.modulePath);
  const fixtureCode = lexChengSource(fixtureText).code;
  const moduleCode = lexChengSource(moduleText).code;
  const issues = [];

  const importRows = fixtureCode.split("\n").flatMap((line, index) => {
    const match = line.match(/^\s*import\s+([A-Za-z_][A-Za-z0-9_./]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/);
    return match ? [{line: index + 1, moduleName: match[1], alias: match[2] || match[1].slice(match[1].lastIndexOf("/") + 1)}] : [];
  }).filter((row) => row.alias === witness.alias);
  if (importRows.length !== 1 || importRows[0].moduleName !== witness.moduleName) issues.push("nested_call_canonical_import_edge_missing_or_ambiguous");

  const nestedRows = fixtureCode.split("\n").flatMap((line, index) => {
    const match = line.match(/^\s*let\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\(\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\(\s*\)\s*\)\s*$/);
    return match ? [{line: index + 1, binding: match[1], assignmentType: match[2], outerAlias: match[3], outerName: match[4], innerAlias: match[5], innerName: match[6]}] : [];
  });
  const exactNestedRows = nestedRows.filter((row) => row.outerAlias === witness.alias && row.outerName === witness.outerName && row.innerAlias === witness.alias && row.innerName === witness.innerName);
  if (exactNestedRows.length !== 1) issues.push("qualified_nested_call_ast_edge_missing_or_ambiguous");
  const nestedRow = exactNestedRows.length === 1 ? exactNestedRows[0] : null;
  if (nestedRow && nestedRow.assignmentType !== witness.assignmentType) issues.push("qualified_nested_call_assignment_type_mismatch");

  const declarationsFor = (name) => moduleCode.split("\n").flatMap((line, index) => {
    const prefix = line.match(/^\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (!prefix || prefix[1] !== name) return [];
    const match = line.match(/^\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^()]*)\)\s*:\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*$/);
    if (!match) return [{line: index + 1, name, supported: false, parameterTypes: [], returnType: null}];
    const parameterText = match[2].trim();
    const parameterTypes = parameterText === "" ? [] : parameterText.split(",").map((parameter) => {
      const parameterMatch = parameter.trim().match(/^(?:var\s+)?[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_.]*)$/);
      return parameterMatch ? parameterMatch[1] : null;
    });
    return [{line: index + 1, name, supported: parameterTypes.every((type) => type !== null), parameterTypes, returnType: match[3]}];
  });
  const outerDeclarations = declarationsFor(witness.outerName);
  const innerDeclarations = declarationsFor(witness.innerName);
  if (outerDeclarations.length === 0) issues.push("outer_declaration_edge_missing");
  else if (outerDeclarations.length !== 1 || !outerDeclarations[0].supported) issues.push("outer_declaration_edge_ambiguous_or_unsupported");
  if (innerDeclarations.length === 0) issues.push("inner_declaration_edge_missing");
  else if (innerDeclarations.length !== 1 || !innerDeclarations[0].supported) issues.push("inner_declaration_edge_ambiguous_or_unsupported");
  const outer = outerDeclarations.length === 1 && outerDeclarations[0].supported ? outerDeclarations[0] : null;
  const inner = innerDeclarations.length === 1 && innerDeclarations[0].supported ? innerDeclarations[0] : null;
  if (inner && (inner.parameterTypes.length !== 0 || inner.returnType !== witness.innerReturnType)) issues.push("inner_declaration_signature_mismatch");
  if (outer && (outer.parameterTypes.length !== 1 || outer.parameterTypes[0] !== witness.outerParameterType || outer.returnType !== witness.outerReturnType)) issues.push("outer_declaration_signature_mismatch");
  if (inner && outer && inner.returnType !== outer.parameterTypes[0]) issues.push("nested_call_inner_return_outer_parameter_type_mismatch");
  if (nestedRow && outer && nestedRow.assignmentType !== outer.returnType) issues.push("nested_call_outer_return_assignment_type_mismatch");

  const declarationEdges = [];
  if (nestedRow && outer) declarationEdges.push({from: `${witness.fixtureLabel}:${nestedRow.line}:outer_call`, to: `${witness.modulePath}#${witness.outerName}`, kind: "canonical_declaration", exactType: outer.returnType});
  if (nestedRow && inner) declarationEdges.push({from: `${witness.fixtureLabel}:${nestedRow.line}:inner_call`, to: `${witness.modulePath}#${witness.innerName}`, kind: "canonical_declaration", exactType: inner.returnType});
  const typeFlow = inner && outer ? {innerReturnType: inner.returnType, outerParameterType: outer.parameterTypes[0] || null, outerReturnType: outer.returnType, assignmentType: nestedRow?.assignmentType || null} : null;
  return {
    status: issues.length === 0 ? "GREEN" : "RED",
    reason: issues.length === 0 ? "qualified nested-call argument type is bound through both canonical declaration edges" : issues.join(","),
    schema: witness.schema,
    witnessId: witness.id,
    family: witness.family,
    fixture: witness.fixtureLabel,
    modulePath: witness.modulePath,
    fixtureSha256: sha256(Buffer.from(fixtureText, "utf8")),
    moduleSha256: sha256(Buffer.from(moduleText, "utf8")),
    declarationEdges,
    typeFlow,
    issues,
  };
}

function validateTypedExprCoverageLedger(
  formalSpecSliceSha256,
  formalSpecVersion,
) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(formalSpecVersion ?? "")) {
    throw new Error(
      "TypedExpr coverage ledger requires the current formal spec version",
    );
  }
  requireSha256(
    formalSpecSliceSha256,
    "generated formal expression EBNF slice SHA-256",
  );
  const required = new Set();
  for (const family of TYPED_EXPR_AUDIT_FAMILIES) {
    if (!/^[a-z0-9_]+$/.test(family) || required.has(family)) throw new Error(`duplicate or invalid required TypedExpr audit family: ${family}`);
    required.add(family);
  }
  const formalRequired = new Set();
  for (const alternative of FORMAL_EXPRESSION_REQUIRED_ALTERNATIVES) {
    if (formalRequired.has(alternative)) throw new Error(`duplicate required formal expression alternative: ${alternative}`);
    formalRequired.add(alternative);
  }
  const formalCovered = new Set();
  const formalByFamily = new Map();
  for (const row of FORMAL_EXPRESSION_LEDGER) {
    if (!Array.isArray(row) || row.length !== 2) throw new Error("formal expression ledger row must be [alternative,family]");
    const [alternative, family] = row;
    if (!formalRequired.has(alternative)) throw new Error(`unregistered formal expression alternative: ${alternative}`);
    if (!required.has(family)) throw new Error(`formal expression alternative maps to an unaudited family: ${alternative} -> ${family}`);
    if (formalCovered.has(alternative)) throw new Error(`formal expression alternative has multiple contracts: ${alternative}`);
    formalCovered.add(alternative);
    const alternatives = formalByFamily.get(family) || [];
    alternatives.push(alternative);
    formalByFamily.set(family, alternatives);
  }
  const missingFormal = FORMAL_EXPRESSION_REQUIRED_ALTERNATIVES.filter((alternative) => !formalCovered.has(alternative));
  if (missingFormal.length > 0) throw new Error(`formal expression leaf coverage is UNPROVEN; missing selected leaf alternatives: ${missingFormal.join(",")}`);
  const covered = new Set();
  const fixtures = new Set();
  const formalObligationIds = new Set();
  const entries = [];
  for (const entry of TYPED_EXPR_MATRIX) {
    if (!required.has(entry.family)) throw new Error(`unregistered TypedExpr audit family: ${entry.family}`);
    if (covered.has(entry.family)) throw new Error(`TypedExpr audit family has multiple matrix contracts: ${entry.family}`);
    if (fixtures.has(entry.file)) throw new Error(`TypedExpr matrix fixture is shared by multiple audit families: ${entry.file}`);
    if (entry.expected !== "GREEN" && entry.expected !== "RED") throw new Error(`TypedExpr audit family has invalid expectation: ${entry.family}`);
    if ((entry.expected === "RED") !== (typeof entry.diagnostic === "string" && entry.diagnostic.length > 0)) throw new Error(`TypedExpr audit family must pair RED with one stable diagnostic category: ${entry.family}`);
    const directObligationIds = [];
    const localObligationIds = new Set();
    for (const obligationId of entry.formalObligationIds || []) {
      if (typeof obligationId !== "string" || !/^(?:ebnf|semantic)\.[A-Za-z0-9_.-]+$/.test(obligationId)) throw new Error(`invalid direct formal obligation ID: ${entry.family} -> ${obligationId}`);
      if (localObligationIds.has(obligationId)) throw new Error(`duplicate direct formal obligation ID inside family ${entry.family}: ${obligationId}`);
      if (formalObligationIds.has(obligationId)) throw new Error(`direct formal obligation ID is assigned to multiple families: ${obligationId}`);
      localObligationIds.add(obligationId);
      formalObligationIds.add(obligationId);
      directObligationIds.push(obligationId);
    }
    covered.add(entry.family);
    fixtures.add(entry.file);
    entries.push({family: entry.family, contract: "independent_compile", expectation: entry.expected === "GREEN" ? "compile_run_green" : "compile_reject_without_target", diagnostic: entry.diagnostic || null, declarationWitnessId: entry.declarationWitnessId || null, fixture: `fixtures/regalloc_preflight/${entry.file}`, formalAlternatives: formalByFamily.get(entry.family) || [], formalObligationIds: directObligationIds});
  }
  const missing = TYPED_EXPR_AUDIT_FAMILIES.filter((family) => !covered.has(family));
  if (missing.length > 0) throw new Error(`TypedExpr expression family coverage is UNPROVEN; missing families: ${missing.join(",")}`);
  if (entries.length !== TYPED_EXPR_AUDIT_FAMILIES.length) throw new Error("TypedExpr expression family coverage ledger cardinality mismatch");
  const compilerProfile = formalChengCompilerProfile();
  const coverage = {
    schema: FORMAL_EXPRESSION_LEAF_COVERAGE_SCHEMA,
    scope: "selected_leaf_alternatives_only",
    exhaustiveEbnfStructuralSemanticCoverage: false,
    structuralSemanticGaps: [...FORMAL_EXPRESSION_STRUCTURAL_GAPS],
    familyCount: entries.length,
    selectedLeafAlternativeCount: formalCovered.size,
    directFormalObligationMappingCount: formalObligationIds.size,
    formalSpecSchema: FORMAL_EXPRESSION_SLICE_SCHEMA,
    formalSpecVersion,
    formalSpecSliceSha256,
    compilerProfile,
    entries,
  };
  return {...coverage, ledgerSha256: sha256(Buffer.from(JSON.stringify(coverage), "utf8"))};
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runWorker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = {id: items[index].id, family: items[index].family, expected: items[index].expected, declarationWitnessId: items[index].declarationWitnessId || null, status: "RED", fixture: items[index].path, reason: `matrix_case_internal_failure: ${error instanceof Error ? error.message : String(error)}`};
      }
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, () => runWorker()));
  return results;
}

async function runTypedExprMatrixCase(root, driver, tempDir, entry, timeoutMs, maxBuffer, hardExecutionOptions, guardContext) {
  const output = join(tempDir, `typedexpr-${entry.id}.exe`);
  const compile = await runPreflightChild(driver, ["system-link-exec", `--root:${root}`, `--in:${entry.path}`, "--emit:exe", "--link-providers", `--target:${TARGET}`, `--out:${output}`], formalChengDriverOptions(root, timeoutMs, maxBuffer, hardExecutionOptions), guardContext, `typedexpr.${entry.id}.compile`);
  const targetProduced = pathEntryExists(output);
  const diagnosticText = `${compile.stdout || ""}\n${compile.stderr || ""}`;
  if (entry.expected === "RED") {
    const rejected = !compile.missingDriver && !compile.timedOut && !compile.overflow && compile.exitCode !== 0;
    const diagnosticMatched = typedExprDiagnosticMatches(entry.diagnostic, diagnosticText);
    const status = rejected && !targetProduced && diagnosticMatched ? "GREEN" : "RED";
    return {
      id: entry.id,
      family: entry.family,
      expected: entry.expected,
      declarationWitnessId: entry.declarationWitnessId || null,
      status,
      fixture: entry.path,
      compileRc: compile.exitCode,
      targetProduced,
      diagnostic: entry.diagnostic,
      diagnosticMatched,
      reason: !rejected ? "negative_fixture_was_not_rejected" : targetProduced ? "negative_fixture_materialized_target" : !diagnosticMatched ? "negative_fixture_missed_static_diagnostic" : "negative_fixture_rejected_before_target",
      stdoutTail: takeTrailingText(compile.stdout, 1200),
      stderrTail: takeTrailingText(compile.stderr, 2400),
    };
  }
  if (!processSucceeded(compile) || !executableMaterialized(output)) {
    return {id: entry.id, family: entry.family, expected: entry.expected, declarationWitnessId: entry.declarationWitnessId || null, status: "RED", fixture: entry.path, compileRc: compile.exitCode, targetProduced, reason: compile.timedOut ? "positive_fixture_compile_timed_out" : compile.overflow ? "positive_fixture_compile_output_overflow" : compile.exitCode === 0 ? "positive_fixture_target_missing" : "positive_fixture_compile_failed", stdoutTail: takeTrailingText(compile.stdout, 1200), stderrTail: takeTrailingText(compile.stderr, 2400)};
  }
  const run = await runPreflightChild(output, [], formalChengDriverOptions(root, timeoutMs, maxBuffer, hardExecutionOptions), guardContext, `typedexpr.${entry.id}.run`);
  const emptyOutput = run.stdoutBuffer?.length === 0 && run.stderrBuffer?.length === 0;
  const status = processSucceeded(run) && emptyOutput ? "GREEN" : "RED";
  return {id: entry.id, family: entry.family, expected: entry.expected, declarationWitnessId: entry.declarationWitnessId || null, status, fixture: entry.path, compileRc: compile.exitCode, runRc: run.exitCode, targetProduced, reason: status === "GREEN" ? "positive_fixture_compiled_and_ran" : !processSucceeded(run) ? "positive_fixture_run_failed" : "positive_fixture_output_contract_mismatch", stdoutTail: takeTrailingText(run.stdout, 1200), stderrTail: takeTrailingText(run.stderr, 2400)};
}

function parseExactUnhashedKv(raw, label) {
  const text = authoritySourceText(raw, label);
  if (!text.endsWith("\n")) throw new Error(`${label} must end with one newline`);
  const rows = new Map();
  for (const line of text.slice(0, -1).split("\n")) {
    const match = line.match(/^([a-z][a-z0-9_]*)=([^\r\n]*)$/);
    if (!match) throw new Error(`${label} contains a malformed row`);
    if (rows.has(match[1])) throw new Error(`${label} contains duplicate key ${match[1]}`);
    rows.set(match[1], match[2]);
  }
  return rows;
}

function validateAarch64F64RuntimeGateReport(raw) {
  const rows = parseExactUnhashedKv(raw, "AArch64 F64 runtime gate report");
  exactKeys(rows, [
    "schema",
    "status",
    "target",
    "host_execution",
    "raw_function_reloc_count",
    "nan_compare_case_count",
    "finite_compare_case_count",
    "store_runtime_case_count",
    "constant_payload_case_count",
    "call_clobber_payload_case_count",
    "call_spill_action_count",
    "call_reload_action_count",
    "memory_limit_bytes",
    "memory_guard_scope",
  ], "AArch64 F64 runtime gate report");
  if (rows.get("schema") !== "regalloc_aarch64_f64_runtime_gate" ||
      rows.get("status") !== "GREEN" ||
      rows.get("target") !== TARGET ||
      rows.get("host_execution") !== "native_arm64" ||
      rows.get("raw_function_reloc_count") !== "1" ||
      rows.get("nan_compare_case_count") !== "30" ||
      rows.get("finite_compare_case_count") !== "18" ||
      rows.get("store_runtime_case_count") !== "5" ||
      rows.get("constant_payload_case_count") !== "4" ||
      rows.get("call_clobber_payload_case_count") !== "4" ||
      rows.get("call_spill_action_count") !== "1" ||
      rows.get("call_reload_action_count") !== "1" ||
      rows.get("memory_limit_bytes") !== String(AARCH64_F64_RUNTIME_GATE_MEMORY_BYTES) ||
      rows.get("memory_guard_scope") !== "identity_history_union_group_session_and_descendants") {
    throw new Error("AArch64 F64 runtime gate report contract mismatch");
  }
  return {
    schema: rows.get("schema"),
    target: rows.get("target"),
    hostExecution: rows.get("host_execution"),
    rawFunctionRelocCount: 1,
    nanCompareCaseCount: 30,
    finiteCompareCaseCount: 18,
    storeRuntimeCaseCount: 5,
    storeRuntimeFamilyCount: 3,
    constantPayloadCaseCount: 4,
    callClobberPayloadCaseCount: 4,
    callSpillActionCount: 1,
    callReloadActionCount: 1,
    memoryLimitBytes: String(AARCH64_F64_RUNTIME_GATE_MEMORY_BYTES),
    memoryGuardScope: rows.get("memory_guard_scope"),
  };
}

function processTreeGuardOwnershipSourceReasons(guard) {
  const reasons = [];
  const setSidMatches = guard.match(/\bos\.setsid\(\)/g) || [];
  if (!guard.includes('"same_session_descendant" if parent_guard_mode else "standalone"') ||
      !guard.includes('memory_guard_scope = "identity_history_descendants_parent_owned_group"') ||
      !guard.includes('"identity_history_union_group_session_and_descendants"') ||
      !guard.includes('report.write("parent_guard_binding_status=%s\\n" %')) {
    reasons.push("guard_ownership_mode_contract_missing");
  }
  if (!/parent_guard_mode\s*=\s*bool\(\s*inherited_parent_capability\s+or\s+inherited_parent_monitor_pid\s+or\s+inherited_parent_limit_bytes\s+or\s+inherited_parent_proof_fd\s*\)/.test(guard) ||
      !/len\(inherited_parent_capability\)\s*!=\s*64/.test(guard) ||
      !/any\(char not in "0123456789abcdef" for char in inherited_parent_capability\)/.test(guard) ||
      !/not inherited_parent_monitor_pid\.isdigit\(\)/.test(guard) ||
      !/not inherited_parent_limit_bytes\.isdigit\(\)/.test(guard) ||
      !/inherited_parent_proof_fd\s*!=\s*str\(PARENT_PROOF_FD\)/.test(guard) ||
      !guard.includes("if parent_guard_monitor_pid not in ancestor_pids:") ||
      !guard.includes('if record["rootPid"] != os.getpid():') ||
      !guard.includes('if record["rootPid"] not in ancestor_pids:') ||
      !guard.includes('if ancestor_pids.index(record["rootPid"]) >= monitor_index:') ||
      !guard.includes('inherited_sid != record["rootSid"]') ||
      !guard.includes('inherited_pgid != record["rootPgid"]') ||
      !guard.includes("inherited_sid != os.getpid()") ||
      !guard.includes("and inherited_sid not in ancestor_pids") ||
      !guard.includes("os.getsid(inherited_sid) != inherited_sid") ||
      !guard.includes("os.getpgid(inherited_sid) != inherited_sid") ||
      !guard.includes("rss_limit_bytes > parent_guard_limit_bytes") ||
      !/prepare_monitor_identity\(\)\s+validate_parent_guard_context\(\)\s+prepare_command_identity\(\)/.test(guard)) {
    reasons.push("guard_parent_binding_proof_missing");
  }
  if (setSidMatches.length !== 1 ||
      !/if not parent_guard_mode:\s+os\.setsid\(\)/.test(guard) ||
      !/root_pid,\s*0 if parent_guard_mode else pgid,\s*sid,\s*footprint_reader/.test(guard) ||
      !/if not parent_guard_mode:\s+live_groups\s*=\s*sorted\(\{/.test(guard) ||
      !/for pgid in live_groups:\s+try:\s+os\.killpg\(pgid, sig\)/.test(guard)) {
    reasons.push("guard_parent_owned_process_group_contract_missing");
  }
  return reasons;
}

function runtimeGateGuardReportValidatorSourceReasons(gate) {
  const reasons = [];
  if (!gate.includes('if [ "${1:-}" = "--validate-guard-report" ]') ||
      !gate.includes('"parent_guard_mode") != "same_session_descendant"') ||
      !gate.includes('"parent_guard_mode": "standalone"') ||
      !gate.includes('"identity_history_descendants_parent_owned_group"') ||
      !gate.includes('"identity_history_union_group_session_and_descendants"') ||
      !gate.includes('"parent_guard_binding_status") != "proved"') ||
      !gate.includes('"parent_guard_binding_status": "not_applicable"') ||
      !gate.includes('"enforcement_kind": "darwin_cooperative_process_tree_poll"') ||
      !gate.includes('"hard_memory_limit_proof_status": "not_provable_userspace_poll"') ||
      !gate.includes('"inter_sample_transient_peaks_not_provable_by_userspace_polling"')) {
    reasons.push("runtime_guard_report_ownership_modes_missing");
  }
  if (!gate.includes('PARENT_PROOF_SCHEMA = "cheng.guard.parent_proof"') ||
      !gate.includes("PARENT_PROOF_FD = 3") ||
      !gate.includes("PARENT_PROOF_MAX_RECORD_BYTES = 4096") ||
      !gate.includes("def local_peer_pid(fd):") ||
      !gate.includes("def parse_parent_proof_record(fd):") ||
      !gate.includes("stat.S_ISSOCK(before.st_mode)") ||
      !gate.includes("socket.MSG_PEEK | socket.MSG_DONTWAIT") ||
      !gate.includes("list(record) != PARENT_PROOF_KEYS") ||
      !gate.includes('json.dumps(record, separators=(",", ":")) + "\\n" != text') ||
      !gate.includes('proof_fd = os.environ.get("BEAT_C_GUARD_PARENT_PROOF_FD", "")') ||
      !gate.includes("proof_fd != str(PARENT_PROOF_FD)") ||
      !gate.includes('rows.get("parent_guard_proof_fd") != proof_fd') ||
      !gate.includes('rows.get("parent_guard_proof_peer_pid") != str(peer_pid)') ||
      !gate.includes('rows.get("parent_guard_proof_record_sha256")') ||
      !gate.includes("hashlib.sha256(raw_record).hexdigest()")) {
    reasons.push("runtime_guard_report_parent_proof_transport_missing");
  }
  if (!gate.includes("def stable_process_identity(pid):") ||
      !gate.includes('rows.get("parent_guard_monitor_pid") != monitor_pid') ||
      !gate.includes("if parent_pid not in ancestry:") ||
      !gate.includes('record["rootPpid"] != parent_pid') ||
      !gate.includes("root_pid != os.getpid()") ||
      !gate.includes("root_pid not in ancestry") ||
      !gate.includes("ancestry.index(root_pid) >= monitor_index") ||
      !gate.includes('self_identity["sid"] != record["rootSid"]') ||
      !gate.includes('self_identity["pgid"] != record["rootPgid"]') ||
      !gate.includes("session_leader != os.getpid() and session_leader not in ancestry") ||
      !gate.includes("leader_sid != session_leader or leader_pgid != session_leader") ||
      !gate.includes('record["monitorStartTvsec"] != monitor_identity["startTvsec"]') ||
      !gate.includes('record["monitorStartTvusec"] != monitor_identity["startTvusec"]') ||
      !gate.includes('record["rootStartTvsec"] != root_identity["startTvsec"]') ||
      !gate.includes('record["rootStartTvusec"] != root_identity["startTvusec"]')) {
    reasons.push("runtime_guard_report_parent_session_binding_missing");
  }
  if (!gate.includes('rows.get("parent_guard_limit_bytes") != parent_limit') ||
      !gate.includes("parent_limit_value < int(requested_limit)") ||
      !gate.includes('rows.get("parent_guard_capability_sha256") !=') ||
      !gate.includes('hashlib.sha256(capability.encode("ascii")).hexdigest()') ||
      !gate.includes('record["capability"] != capability') ||
      !gate.includes('record["monitorPid"] != parent_pid') ||
      !gate.includes('record["limitBytes"] != parent_limit_value')) {
    reasons.push("runtime_guard_report_limit_capability_binding_missing");
  }
  if (/(?:^|[ \t])PROCESS_MAX_RSS_BYTES="\$FIXED_LIMIT_BYTES"/m.test(gate)) {
    reasons.push("runtime_guard_report_non_enforcing_limit_alias_present");
  }
  return reasons;
}

function validateAarch64F64RuntimeGateBundle(sourceRows) {
  const sources = sourceRows instanceof Map ? new Map(sourceRows) : new Map(Object.entries(sourceRows || {}));
  exactKeys(sources, Object.values(AARCH64_F64_RUNTIME_GATE_FILES), "AArch64 F64 runtime gate source bundle");
  const text = (key) => authoritySourceText(sources.get(AARCH64_F64_RUNTIME_GATE_FILES[key])?.raw ?? sources.get(AARCH64_F64_RUNTIME_GATE_FILES[key]), AARCH64_F64_RUNTIME_GATE_FILES[key]);
  const gate = text("gate");
  const guard = text("guard");
  const contract = text("contract");
  const image = text("image");
  const harness = text("harness");
  const bridge = text("bridge");
  const reasons = [];
  const fileEvidence = Object.values(AARCH64_F64_RUNTIME_GATE_FILES).map((path) => ({
    path,
    sha256: sha256(Buffer.from(authoritySourceText(sources.get(path)?.raw ?? sources.get(path), path), "utf8")),
  }));
  for (const file of fileEvidence) {
    if (file.sha256 !== AARCH64_F64_RUNTIME_GATE_EXPECTED_SHA256[file.path]) reasons.push(`exact_source_hash_mismatch:${file.path}`);
  }
  const guardStages = [...gate.matchAll(/^run_guard[ \t]+([a-z_]+)\b/gm)].map((match) => match[1]);
  if (guardStages.length !== AARCH64_F64_RUNTIME_GATE_GUARD_STAGES.length ||
      guardStages.some((stage, index) => stage !== AARCH64_F64_RUNTIME_GATE_GUARD_STAGES[index])) {
    reasons.push("guarded_stage_sequence_missing_or_inexact");
  }
  if (!/^FIXED_LIMIT_BYTES=1073741824$/m.test(gate) ||
      !/--rss-limit:"\$FIXED_LIMIT_BYTES"\s+--timeout:600/.test(gate) ||
      !/python3 - "\$report" "\$FIXED_LIMIT_BYTES"/.test(gate)) {
    reasons.push("exact_one_gib_process_tree_guard_contract_missing");
  }
  if (!/run_guard contract_compile "\$COMPILER" system-link-exec/.test(gate) ||
      !/--in:"\$ROOT\/src\/tests\/regalloc_aarch64_f64_contract_smoke\.cheng"/.test(gate) ||
      !/run_guard contract_run "\$WORK\/contract"/.test(gate)) {
    reasons.push("static_contract_oracle_execution_missing");
  }
  if (!/run_guard image_compile "\$COMPILER" system-link-exec/.test(gate) ||
      !/--in:"\$ROOT\/src\/tests\/regalloc_aarch64_f64_runtime_image\.cheng"/.test(gate) ||
      !/run_guard image_run "\$WORK\/image_generator"/.test(gate) ||
      !gate.includes("_regalloc_raw_f64_") || !/\)" -eq 15/.test(gate) ||
      !/grep -Fc '    bl _regalloc_raw_f64_identity'/.test(gate) ||
      !/fail "call_clobber_relocation_count"/.test(gate)) {
    reasons.push("fifteen_function_single_exact_call_relocation_runtime_image_contract_missing");
  }
  if (!/src\/tests\/regalloc_aarch64_f64_runtime_harness\.c/.test(gate) ||
      !/src\/tests\/regalloc_aarch64_f64_runtime_bridge\.S/.test(gate) ||
      !/run_guard native_run "\$WORK\/runtime_gate"/.test(gate) ||
      !/grep -Fxq 'regalloc_aarch64_f64_runtime_gate ok'/.test(gate)) {
    reasons.push("native_runtime_execution_contract_missing");
  }
  if (!/printf 'raw_function_reloc_count=1\\n'/.test(gate) ||
      !/printf 'nan_compare_case_count=30\\n'/.test(gate) ||
      !/printf 'finite_compare_case_count=18\\n'/.test(gate) ||
      !/printf 'store_runtime_case_count=5\\n'/.test(gate) ||
      !/printf 'constant_payload_case_count=4\\n'/.test(gate) ||
      !/printf 'call_clobber_payload_case_count=4\\n'/.test(gate) ||
      !/printf 'call_spill_action_count=1\\n'/.test(gate) ||
      !/printf 'call_reload_action_count=1\\n'/.test(gate) ||
      !/printf 'memory_limit_bytes=%s\\n' "\$FIXED_LIMIT_BYTES"/.test(gate)) {
    reasons.push("runtime_report_exact_counts_missing");
  }
  const guardOwnershipReasons = processTreeGuardOwnershipSourceReasons(guard);
  if (!/schema=beat_c_process_memory_guard(?:\\n|")/.test(guard) ||
      !/observed_sample_limit_status=%s/.test(guard) ||
      !/observed_sample_status\s*=\s*\([\s\S]{0,160}?"proved"/.test(guard)) {
    reasons.push("independent_process_tree_guard_source_contract_missing");
  }
  reasons.push(...guardOwnershipReasons);
  reasons.push(...runtimeGateGuardReportValidatorSourceReasons(gate));

  const contractCode = lexChengSource(contract, false).code;
  if (!/\bglobalEmission\.relocs\.len\s*!=\s*2\b/.test(contractCode) ||
      !/\bglobalEmission\.relocs\s*\[\s*0\s*\]\.kind\s*!=\s*adapter\.RegallocAarch64RelocPage21\b/.test(contractCode) ||
      !/\bglobalEmission\.relocs\s*\[\s*1\s*\]\.kind\s*!=\s*adapter\.RegallocAarch64RelocPageOff12\b/.test(contractCode) ||
      !/\bglobalEmission\.relocs\s*\[\s*1\s*\]\.wordIndex\s*!=\s*globalEmission\.relocs\s*\[\s*0\s*\]\.wordIndex\s*\+\s*1\b/.test(contractCode) ||
      (contract.match(/"resolved_f64_global_word"/g) || []).length < 3 ||
      !/\bverifyF64StoreWords\s*\(\s*globalEmission\s*,\s*1\s*,\s*0\s*,\s*F64StoreDestinationGlobal\s*,\s*0\s*\)/.test(contractCode) ||
      !/\blet\s+storeCode\s*=\s*verifyF64StoreContracts\s*\(\s*\)\s*if\s+storeCode\s*!=\s*0\s*:\s*return\s+190\s*\+\s*storeCode\b/.test(contractCode)) {
    reasons.push("independent_global_page_relocation_store_oracle_missing");
  }

  if (!/F64CompareFn\s+functions\s*\[\s*6\s*\]/.test(harness) ||
      !/const\s+int32_t\s+expected\s*\[\s*6\s*\]\s*=\s*\{\s*0\s*,\s*1\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\}/.test(harness) ||
      !/const\s+double\s+pairs\s*\[\s*5\s*\]\s*\[\s*2\s*\]/.test(harness) ||
      !/function_index\s*<\s*6/.test(harness) || !/pair_index\s*<\s*5/.test(harness)) {
    reasons.push("thirty_nan_compare_runtime_cases_missing");
  }
  if (!/const\s+F64Bits\s+local_inputs\s*\[\s*3\s*\]\s*\[\s*3\s*\]/.test(harness) ||
      !/case_index\s*<\s*3/.test(harness) ||
      !/regalloc_bridge_f64_local\s*\(/.test(harness) ||
      !/const\s+uint64_t\s+expected\s*=\s*~\s*local_inputs\s*\[\s*case_index\s*\]\s*\[\s*2\s*\]\.bits/.test(harness) ||
      !/local_result\.bits\s*!=\s*expected[\s\S]{0,220}?local_result\.bits\s*==\s*local_inputs\s*\[\s*case_index\s*\]\s*\[\s*0\s*\]\.bits[\s\S]{0,180}?local_result\.bits\s*==\s*local_inputs\s*\[\s*case_index\s*\]\s*\[\s*1\s*\]\.bits/.test(harness) ||
      !/regalloc_bridge_f64_field\s*\(\s*field_words\s*,\s*field_payload\.value\s*\)/.test(harness) ||
      !/regalloc_bridge_f64_index\s*\(\s*indexed_words\s*,\s*indexed_payload\.value\s*,\s*3\s*\)/.test(harness) ||
      !/const\s+int\s+store_code\s*=\s*verify_store_payloads\s*\(\s*\)/.test(harness)) {
    reasons.push("five_f64_store_runtime_cases_across_three_families_missing");
  }
  if (!/verify_constant_payloads\s*\(\s*void\s*\)/.test(harness) ||
      !/0x7ff8000000000042/.test(harness) ||
      !/0x8000000000000000/.test(harness) ||
      !/0x7ff0000000000000/.test(harness) ||
      !/0x0000000000000001/.test(harness) ||
      !/actual\s*\[\s*index\s*\]\.bits\s*!=\s*expected\s*\[\s*index\s*\]/.test(harness)) {
    reasons.push("exact_f64_constant_payload_runtime_cases_missing");
  }
  if (!/verify_call_clobber_payloads\s*\(\s*void\s*\)/.test(harness) ||
      !/regalloc_bridge_f64_call_clobber\s*\(\s*inputs\s*\[\s*index\s*\]\.value\s*\)/.test(harness) ||
      !/actual\.bits\s*!=\s*inputs\s*\[\s*index\s*\]\.bits/.test(harness) ||
      !/const\s+int\s+call_clobber_code\s*=\s*verify_call_clobber_payloads\s*\(\s*\)/.test(harness)) {
    reasons.push("f64_call_clobber_exact_payload_runtime_cases_missing");
  }
  const localBridgeMatch = bridge.match(/_regalloc_bridge_f64_local:\s*([\s\S]*?)(?=\n\.globl\s|$)/);
  if (!localBridgeMatch) {
    reasons.push("d0_poison_and_post_bl_x0_to_d0_runtime_bridge_missing");
  } else {
    const code = localBridgeMatch[1];
    const input0Index = code.indexOf("fmov x0, d0");
    const input1Index = code.indexOf("fmov x1, d1");
    const preCallPoisonIndex = code.indexOf("fmov d0, xzr", input1Index);
    const callIndex = code.indexOf("bl _regalloc_raw_f64_local");
    const outputTransformIndex = code.indexOf("mvn x0, x0", callIndex);
    const postCallPoisonIndex = code.indexOf("fmov d0, xzr", callIndex);
    const outputBridgeIndex = code.indexOf("fmov d0, x0", postCallPoisonIndex);
    if (input0Index < 0 || input1Index <= input0Index || preCallPoisonIndex <= input1Index ||
        callIndex <= preCallPoisonIndex || outputTransformIndex <= callIndex ||
        postCallPoisonIndex <= outputTransformIndex || outputBridgeIndex <= postCallPoisonIndex ||
        !/\bstr\s+x30\s*,\s*\[sp\s*,\s*#-16\]!/.test(code) ||
        !/\bldr\s+x30\s*,\s*\[sp\]\s*,\s*#16\s*\bret\b/.test(code)) {
      reasons.push("d0_poison_and_post_bl_x0_to_d0_runtime_bridge_missing");
    }
  }
  const imageCode = lexChengSource(image, false).code;
  const localStoreIndex = imageCode.indexOf("copy.kind = ir.BodyOpStoreLocalTag");
  const f64AddIndex = imageCode.indexOf("add(addOp.operands, int32(texpr.TypedExprIrOpF64Add))", localStoreIndex);
  const localReturnIndex = imageCode.indexOf("appendReturn(body, 3, ir.LocalF64Tag)", f64AddIndex);
  if (localStoreIndex < 0 || f64AddIndex <= localStoreIndex || localReturnIndex <= f64AddIndex ||
      !/\bcopy\.target\s*=\s*2\b[\s\S]{0,100}?\badd\s*\(\s*copy\.operands\s*,\s*0\s*\)/.test(imageCode.slice(localStoreIndex)) ||
      !/\baddOp\.kind\s*=\s*ir\.BodyOpBinOpTag\b[\s\S]{0,120}?\baddOp\.target\s*=\s*3\b/.test(imageCode.slice(localStoreIndex)) ||
      !/\badd\s*\(\s*addOp\.operands\s*,\s*ir\.LocalF64Tag\s*\)[\s\S]{0,180}?\badd\s*\(\s*addOp\.operands\s*,\s*2\s*\)[\s\S]{0,100}?\badd\s*\(\s*addOp\.operands\s*,\s*1\s*\)/.test(imageCode.slice(f64AddIndex - 160))) {
    reasons.push("store_local_to_fadd_to_x0_runtime_dataflow_missing");
  }
  if ((image.match(/emitFunction\("regalloc_raw_f64_(?:local|field|index)"/g) || []).length !== 3 ||
      !/emission\.relocs\.len\s*!=\s*0/.test(image) ||
      (image.match(/emitFunction\("regalloc_raw_f64_const_(?:nan|negative_zero|infinity|subnormal)"/g) || []).length !== 4 ||
      !/emitFunction\("regalloc_raw_f64_identity"/.test(image) ||
      !/emitCallClobberFunction\s*\(\s*"regalloc_raw_f64_call_clobber"/.test(image) ||
      (bridge.match(/^\.globl _regalloc_bridge_f64_/gm) || []).length !== 14) {
    reasons.push("runtime_image_bridge_cardinality_contract_missing");
  }
  if (!/\bkind\s*==\s*alloc\.RegallocValueActionSpillCall\b/.test(imageCode) ||
      !/\bkind\s*==\s*alloc\.RegallocValueActionReloadCall\b/.test(imageCode) ||
      !/\bkind\s*==\s*alloc\.RegallocValueActionCallClobber\b/.test(imageCode) ||
      !/\bspillCount\s*!=\s*1\s*\|\|\s*reloadCount\s*!=\s*1\s*\|\|\s*clobberCount\s*!=\s*1\b/.test(imageCode) ||
      !/regalloc_call_clobber_actions spill=\{spillCount\} reload=\{reloadCount\} clobber=\{clobberCount\}/.test(image) ||
      !/\bcall\.targetSymbol\s*=\s*"regalloc_raw_f64_identity"/.test(image) ||
      !/\bcallTargets\s*:\s*str\[\]\s*=\s*\[\s*"_regalloc_raw_f64_identity"\s*\]/.test(image) ||
      !/\bemission\.relocs\.len\s*!=\s*1\b/.test(imageCode) ||
      !/\bemission\.relocs\s*\[\s*0\s*\]\.kind\s*!=\s*adapter\.RegallocAarch64RelocCall26\b/.test(imageCode) ||
      !/\becho\s*\(\s*Fmt"\s*bl\s+\{reloc\.targetSymbol\}"\s*\)/.test(image)) {
    reasons.push("canonical_call_clobber_spill_reload_action_runtime_witness_missing");
  }
  if (reasons.length > 0) throw new Error(`AArch64 F64 runtime gate source contract violation: ${reasons.join(",")}`);
  return {
    schema: "regalloc_aarch64_f64_runtime_gate_source",
    memoryLimitBytes: String(AARCH64_F64_RUNTIME_GATE_MEMORY_BYTES),
    nanCompareCaseCount: 30,
    finiteCompareCaseCount: 18,
    storeRuntimeCaseCount: 5,
    storeRuntimeFamilyCount: 3,
    constantPayloadCaseCount: 4,
    callClobberPayloadCaseCount: 4,
    callSpillActionCount: 1,
    callReloadActionCount: 1,
    globalStaticRelocOracle: "PAGE21_PAGEOFF12_CONSECUTIVE_SAME_SYMBOL_AND_TAINTED_F64_STORE",
    d0PoisonStatus: "PROVEN",
    postCallX0ToD0Status: "PROVEN",
    localRuntimeDataflow: "StoreLocal->F64Add->X0",
    guardStages: [...guardStages],
    files: fileEvidence,
  };
}

function validateX86_64F64RuntimeGateReport(raw) {
  const rows = parseExactUnhashedKv(raw, "x86-64 F64 runtime gate report");
  exactKeys(rows, [
    "schema",
    "status",
    "target",
    "host_execution",
    "scope",
    "raw_function_reloc_count",
    "nan_compare_case_count",
    "finite_compare_case_count",
    "materialized_function_count",
    "fused_function_count",
    "bridge_result_transform",
    "memory_limit_bytes",
    "memory_guard_scope",
  ], "x86-64 F64 runtime gate report");
  if (rows.get("schema") !== "regalloc_x86_64_f64_runtime_gate" ||
      rows.get("status") !== "GREEN" ||
      rows.get("target") !== "x86_64-apple-darwin" ||
      rows.get("host_execution") !== "rosetta_x86_64" ||
      rows.get("scope") !== "synthetic_bodyir_x64_production_emitter" ||
      rows.get("raw_function_reloc_count") !== "0" ||
      rows.get("nan_compare_case_count") !== "60" ||
      rows.get("finite_compare_case_count") !== "72" ||
      rows.get("materialized_function_count") !== "6" ||
      rows.get("fused_function_count") !== "6" ||
      rows.get("bridge_result_transform") !== "0x5a5a5a5a" ||
      rows.get("memory_limit_bytes") !== String(X86_64_F64_RUNTIME_GATE_MEMORY_BYTES) ||
      rows.get("memory_guard_scope") !== "identity_history_union_group_session_and_descendants") {
    throw new Error("x86-64 F64 runtime gate report contract mismatch");
  }
  return {
    schema: rows.get("schema"),
    target: rows.get("target"),
    hostExecution: rows.get("host_execution"),
    scope: rows.get("scope"),
    rawFunctionRelocCount: 0,
    nanCompareCaseCount: 60,
    finiteCompareCaseCount: 72,
    materializedFunctionCount: 6,
    fusedFunctionCount: 6,
    bridgeResultTransform: rows.get("bridge_result_transform"),
    memoryLimitBytes: String(X86_64_F64_RUNTIME_GATE_MEMORY_BYTES),
    memoryGuardScope: rows.get("memory_guard_scope"),
  };
}

function validateX86_64F64RuntimeGateBundle(sourceRows) {
  const sources = sourceRows instanceof Map ? new Map(sourceRows) : new Map(Object.entries(sourceRows || {}));
  exactKeys(sources, Object.values(X86_64_F64_RUNTIME_GATE_FILES), "x86-64 F64 runtime gate source bundle");
  const text = (key) => authoritySourceText(sources.get(X86_64_F64_RUNTIME_GATE_FILES[key])?.raw ?? sources.get(X86_64_F64_RUNTIME_GATE_FILES[key]), X86_64_F64_RUNTIME_GATE_FILES[key]);
  const gate = text("gate");
  const guard = text("guard");
  const image = text("image");
  const harness = text("harness");
  const bridge = text("bridge");
  const reasons = [];
  const fileEvidence = Object.values(X86_64_F64_RUNTIME_GATE_FILES).map((path) => ({
    path,
    sha256: sha256(Buffer.from(authoritySourceText(sources.get(path)?.raw ?? sources.get(path), path), "utf8")),
  }));
  for (const file of fileEvidence) {
    if (file.sha256 !== X86_64_F64_RUNTIME_GATE_EXPECTED_SHA256[file.path]) reasons.push(`exact_source_hash_mismatch:${file.path}`);
  }

  const guardStages = [...gate.matchAll(/^run_guard[ \t]+([a-z_]+)\b/gm)].map((match) => match[1]);
  if (guardStages.length !== X86_64_F64_RUNTIME_GATE_GUARD_STAGES.length ||
      guardStages.some((stage, index) => stage !== X86_64_F64_RUNTIME_GATE_GUARD_STAGES[index])) {
    reasons.push("guarded_stage_sequence_missing_or_inexact");
  }
  if (!/^FIXED_LIMIT_BYTES=1073741824$/m.test(gate) ||
      !/--rss-limit:"\$FIXED_LIMIT_BYTES"\s+--timeout:600/.test(gate) ||
      !/python3 - "\$report" "\$FIXED_LIMIT_BYTES"/.test(gate) ||
      !/schema=beat_c_process_memory_guard(?:\\n|")/.test(guard) ||
      !/observed_sample_limit_status=%s/.test(guard) ||
      !/observed_sample_status\s*=\s*\([\s\S]{0,160}?"proved"/.test(guard)) {
    reasons.push("exact_one_gib_process_tree_guard_contract_missing");
  }
  reasons.push(...processTreeGuardOwnershipSourceReasons(guard));
  reasons.push(...runtimeGateGuardReportValidatorSourceReasons(gate));
  if (!/^ARCH_RUNNER="\/usr\/bin\/arch"$/m.test(gate) ||
      !/run_guard rosetta_probe "\$ARCH_RUNNER" -x86_64 \/usr\/bin\/true/.test(gate) ||
      !/run_guard rosetta_run "\$ARCH_RUNNER" -x86_64 "\$WORK\/runtime_gate"/.test(gate) ||
      !/printf 'host_execution=rosetta_x86_64\\n'/.test(gate)) {
    reasons.push("rosetta_probe_and_execution_contract_missing");
  }
  if (!/run_guard image_compile "\$COMPILER" system-link-exec/.test(gate) ||
      !/--in:"\$ROOT\/src\/tests\/regalloc_x86_64_f64_runtime_image\.cheng"/.test(gate) ||
      !/--target:arm64-apple-darwin --emit:exe/.test(gate) ||
      !/run_guard image_run "\$WORK\/image_generator"/.test(gate) ||
      !gate.includes("_regalloc_x64_raw_f64_") || !/\)" -eq 12/.test(gate) ||
      !/if grep -Fq '\.reloc' "\$WORK\/raw_functions\.S"; then\s+fail "raw_function_contains_relocation"/.test(gate)) {
    reasons.push("twelve_function_relocation_free_runtime_image_contract_missing");
  }
  if (!/run_guard native_link "\$CLANG"[\s\S]{0,180}?-arch x86_64/.test(gate) ||
      !/src\/tests\/regalloc_x86_64_f64_runtime_harness\.c/.test(gate) ||
      !/src\/tests\/regalloc_x86_64_f64_runtime_bridge\.S/.test(gate) ||
      !/run_guard disassemble "\$OTOOL" -arch x86_64 -tvV "\$WORK\/runtime_gate"/.test(gate) ||
      !/grep -Fq 'ucomisd'/.test(gate) || !/grep -Fq 'setp'/.test(gate) || !/grep -Fq 'setnp'/.test(gate)) {
    reasons.push("x86_64_native_link_and_disassembly_oracle_missing");
  }
  for (const marker of [
    "regalloc_x86_64_f64_runtime_gate ok",
    "nan_compare_case_count=60",
    "finite_compare_case_count=72",
    "materialized_function_count=6",
    "fused_function_count=6",
    "bridge_result_transform=0x5a5a5a5a",
  ]) {
    if (!gate.includes(`grep -Fxq '${marker}'`)) reasons.push(`runtime_marker_missing:${marker}`);
  }
  for (const reportRow of [
    "raw_function_reloc_count=0",
    "nan_compare_case_count=60",
    "finite_compare_case_count=72",
    "materialized_function_count=6",
    "fused_function_count=6",
    "bridge_result_transform=0x5a5a5a5a",
  ]) {
    if (!gate.includes(`printf '${reportRow}\\n'`)) reasons.push(`runtime_report_marker_missing:${reportRow}`);
  }

  if ((harness.match(/F64CompareFn functions\[2\]\[6\]/g) || []).length !== 2 ||
      !/const\s+int32_t\s+expected\[6\]\s*=\s*\{\s*0\s*,\s*1\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\}/.test(harness) ||
      !/const\s+double\s+pairs\[5\]\[2\]/.test(harness) ||
      !/form\s*<\s*2/.test(harness) || !/function_index\s*<\s*6/.test(harness) || !/pair_index\s*<\s*5/.test(harness)) {
    reasons.push("sixty_nan_compare_runtime_cases_missing");
  }
  if (!/const\s+int32_t\s+less\[6\]/.test(harness) ||
      !/const\s+int32_t\s+greater\[6\]/.test(harness) ||
      !/const\s+int32_t\s+equal\[6\]/.test(harness) ||
      !/const\s+double\s+pairs\[6\]\[2\]/.test(harness) ||
      !/pair_index\s*<\s*6/.test(harness) ||
      !/actual\s*!=\s*transformed_expected/.test(harness)) {
    reasons.push("seventy_two_finite_compare_runtime_cases_missing");
  }
  if (!/kResultTransform\s*=\s*UINT32_C\(0x5a5a5a5a\)/.test(harness) ||
      !/\(uint32_t\)value\s*\^\s*kResultTransform/.test(harness) ||
      !/puts\("materialized_function_count=6"\)/.test(harness) ||
      !/puts\("fused_function_count=6"\)/.test(harness) ||
      !/puts\("bridge_result_transform=0x5a5a5a5a"\)/.test(harness)) {
    reasons.push("materialized_fused_bridge_runtime_markers_missing");
  }

  const macroMatch = bridge.match(/\.macro REGALLOC_X64_F64_BRIDGE bridge_name, raw_name\s*([\s\S]*?)\.endmacro/);
  if (!macroMatch) {
    reasons.push("x86_64_f64_bridge_transform_contract_missing");
  } else {
    const body = macroMatch[1];
    const opIndexes = [
      body.indexOf("movq %xmm0, %rdi"),
      body.indexOf("movq %xmm1, %rsi"),
      body.indexOf("movl $0x6d6d6d6d, %eax"),
      body.indexOf("subq $8, %rsp"),
      body.indexOf("call \\raw_name"),
      body.indexOf("addq $8, %rsp"),
      body.indexOf("xorl $0x5a5a5a5a, %eax"),
      body.indexOf("ret"),
    ];
    if (opIndexes.some((index) => index < 0) || opIndexes.some((index, position) => position > 0 && index <= opIndexes[position - 1]) || /\bjmp\b/.test(body)) {
      reasons.push("x86_64_f64_bridge_transform_contract_missing");
    }
  }
  const bridgeInvocations = [...bridge.matchAll(/^REGALLOC_X64_F64_BRIDGE\s+([^,]+),\s+([^\s]+)$/gm)].map((match) => [match[1], match[2]]);
  const expectedSuffixes = ["eq", "ne", "lt", "le", "gt", "ge"];
  const expectedRawNames = new Set(expectedSuffixes.flatMap((suffix) => [
    `_regalloc_x64_raw_f64_${suffix}`,
    `_regalloc_x64_raw_f64_fused_${suffix}`,
  ]));
  if (bridgeInvocations.length !== 12 || new Set(bridgeInvocations.map((entry) => entry[0])).size !== 12 ||
      new Set(bridgeInvocations.map((entry) => entry[1])).size !== 12 ||
      bridgeInvocations.some((entry) => !expectedRawNames.has(entry[1]))) {
    reasons.push("x86_64_f64_bridge_cardinality_contract_missing");
  }

  const imageCode = lexChengSource(image, false).code;
  if (!/var\s+conditions:\s*int32\[\]\s*=\s*\[\s*ir\.BodyCondF64EqTag\s*,\s*ir\.BodyCondF64NeTag\s*,\s*ir\.BodyCondF64LtTag\s*,\s*ir\.BodyCondF64LeTag\s*,\s*ir\.BodyCondF64GtTag\s*,\s*ir\.BodyCondF64GeTag\s*\]/.test(imageCode) ||
      !/var\s+names:\s*str\[\]\s*=\s*\[\s*"eq"\s*,\s*"ne"\s*,\s*"lt"\s*,\s*"le"\s*,\s*"gt"\s*,\s*"ge"\s*\]/.test(image) ||
      !/X64BodyPrepareStackLayout\s*\(\s*body\s*\)/.test(imageCode) ||
      !/body\.x64StackLayoutReady/.test(imageCode) ||
      !/X64BodyCmpFusedAt\s*\(\s*body\s*,\s*0\s*\)\s*!=\s*fusedExpected/.test(imageCode) ||
      !/X64BodyIrWordCount\s*\(\s*body\s*\)/.test(imageCode) ||
      !/X64BodyFillWords\s*\(\s*words\s*,\s*0\s*,\s*wordCount\s*,\s*body\s*\)\s*!=\s*wordCount/.test(imageCode) ||
      !/emitFunction\s*\(\s*Fmt"regalloc_x64_raw_f64_\{names\[index\]\}"\s*,\s*materialized\s*,\s*false\s*\)/.test(image) ||
      !/emitFunction\s*\(\s*Fmt"regalloc_x64_raw_f64_fused_\{names\[index\]\}"\s*,\s*fused\s*,\s*true\s*\)/.test(image)) {
    reasons.push("materialized_and_fused_production_emitter_image_contract_missing");
  }
  if (!/branch\.kind\s*=\s*ir\.BodyTermCbrTag/.test(imageCode) ||
      !/branch\.conditionKind\s*=\s*ir\.BodyCondLocalNonZeroTag/.test(imageCode) ||
      !/appendImmediateReturn\s*\(\s*body\s*,\s*1\s*\)/.test(imageCode) ||
      !/appendImmediateReturn\s*\(\s*body\s*,\s*0\s*\)/.test(imageCode)) {
    reasons.push("fused_compare_control_flow_oracle_missing");
  }
  if (reasons.length > 0) throw new Error(`x86-64 F64 runtime gate source contract violation: ${reasons.join(",")}`);
  return {
    schema: "regalloc_x86_64_f64_runtime_gate_source",
    memoryLimitBytes: String(X86_64_F64_RUNTIME_GATE_MEMORY_BYTES),
    hostExecution: "rosetta_x86_64",
    nanCompareCaseCount: 60,
    finiteCompareCaseCount: 72,
    materializedFunctionCount: 6,
    fusedFunctionCount: 6,
    bridgeResultTransform: "0x5a5a5a5a",
    disassemblyMarkers: ["ucomisd", "setp", "setnp"],
    guardStages: [...guardStages],
    files: fileEvidence,
  };
}

function runtimeGateCompilerArtifactNames(output, report) {
  return [
    output, report, `${output}.darwin-validate.sh`, `${output}.darwin-validation.md`,
    `${output}.darwin-validation.txt`, `${output}.link.log`, `${output}.map`,
    `${output}.primary.o.map`, `${output}.provider.host.o.map`, `${output}.provider.o.map`,
  ];
}

function validateRetainedRuntimeGateWork(workValue, label, stages, extraNames) {
  const work = canonicalAbsolute(workValue, `${label} work`, "dir");
  const expectedNames = [
    ...stages.flatMap((stage) => [`${stage}.guard.txt`, `${stage}.stdout.txt`, `${stage}.stderr.txt`]),
    ...extraNames,
  ].sort();
  const entries = readdirSync(work, {withFileTypes: true});
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())) throw new Error(`${label} work contains a non-regular artifact`);
  const actualNames = entries.map((entry) => entry.name).sort();
  if (actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) {
    const missing = expectedNames.filter((name) => !actualNames.includes(name));
    const extra = actualNames.filter((name) => !expectedNames.includes(name));
    throw new Error(`${label} work exact artifact whitelist mismatch: missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`);
  }
  const guardReports = stages.map((stage) => validateProductionGuardReport(work, join(work, `${stage}.guard.txt`), {
    expectedRc: 0,
    expectedTimeoutSeconds: 600,
    expectedStartupTimeoutSeconds: 5,
    expectedCleanupTimeoutSeconds: 2,
  }));
  const artifacts = expectedNames.map((name) => {
    const snapshot = stableSnapshot(join(work, name), `${label} retained artifact ${name}`, 256 * 1024 * 1024, true);
    return {
      name,
      path: snapshot.path,
      sha256: snapshot.sha256,
      device: snapshot.stat.dev.toString(),
      inode: snapshot.stat.ino.toString(),
      size: snapshot.stat.size.toString(),
      mtimeNs: snapshot.stat.mtimeNs.toString(),
      ctimeNs: snapshot.stat.ctimeNs.toString(),
    };
  });
  const artifactSetSha256 = sha256(Buffer.from(artifacts.map((entry) => `${entry.name}\0${entry.sha256}\0${entry.device}\0${entry.inode}\0${entry.size}\0${entry.mtimeNs}\0${entry.ctimeNs}\n`).join(""), "utf8"));
  return {schema: "cheng_regalloc_retained_runtime_gate", work, artifactCount: artifacts.length, artifactSetSha256, artifacts, guardReportCount: guardReports.length, guardReports};
}

const AARCH64_F64_RUNTIME_GATE_EXTRA_ARTIFACTS = Object.freeze([
  ...runtimeGateCompilerArtifactNames("contract", "contract.compile.report.txt"),
  ...runtimeGateCompilerArtifactNames("image_generator", "image.compile.report.txt"),
  "raw_functions.S", "runtime_gate", "gate.report.txt",
]);
const X86_64_F64_RUNTIME_GATE_EXTRA_ARTIFACTS = Object.freeze([
  // 生产(official driver)system-link-exec 产物合同: 本体+report+map(直链不产 link.log/primary.o.map)
  "image_generator", "image.compile.report.txt", "image_generator.map",
  "raw_functions.S", "runtime_gate", "gate.report.txt",
]);

async function runAarch64F64RuntimeGate(root, driver, compiler, tempDir, timeoutMs, maxBuffer, hardExecutionOptions, retainedRoot = null, privateRuntimeBundle = null, privateToolchain = null) {
  if (retainedRoot !== null && (!privateRuntimeBundle || !privateToolchain)) throw new Error("release AArch64 runtime gate requires private runtime and actual-toolchain bundles");
  const executionRoot = privateRuntimeBundle?.directory || root;
  const gate = canonicalAbsolute(join(executionRoot, AARCH64_F64_RUNTIME_GATE_FILES.gate), "AArch64 F64 runtime gate", "file", true);
  const work = join(retainedRoot || tempDir, "aarch64-f64-runtime-gate");
  const run = await runChengDriver(gate, [], {
    root,
    cwd: root,
    maxBuffer,
    exactGuardOwnsTimeoutAndCleanup: true,
    hardRssCapBytes: hardExecutionOptions.hardRssCapBytes,
    env: privateToolchain ? privateReleaseExecutionEnv(privateToolchain, {
      CHENG_A64_F64_GATE_COMPILER: driver,
      CHENG_A64_F64_GATE_CLANG: compiler,
      CHENG_A64_F64_GATE_WORK: work,
    }) : {
      CHENG_A64_F64_GATE_COMPILER: driver,
      CHENG_A64_F64_GATE_CLANG: compiler,
      CHENG_A64_F64_GATE_WORK: work,
    },
  });
  if (!processSucceeded(run)) {
    return {status: "RED", reason: run.timedOut ? "aarch64_f64_runtime_gate_timed_out" : run.overflow ? "aarch64_f64_runtime_gate_output_overflow" : "aarch64_f64_runtime_gate_failed", runRc: run.exitCode, stdoutTail: takeTrailingText(run.stdout, 2000), stderrTail: takeTrailingText(run.stderr, 4000)};
  }
  const expectedStdout = `regalloc_aarch64_f64_runtime_gate=GREEN\nregalloc_aarch64_f64_runtime_gate_work=${work}\n`;
  if (run.stdout !== expectedStdout || run.stderrBuffer?.length !== 0) {
    return {status: "RED", reason: "aarch64_f64_runtime_gate_output_contract_mismatch", runRc: run.exitCode, stdoutTail: takeTrailingText(run.stdout, 2000), stderrTail: takeTrailingText(run.stderr, 4000)};
  }
  try {
    const gateReport = stableSnapshot(join(work, "gate.report.txt"), "AArch64 F64 runtime gate report", 64 * 1024);
    const verified = validateAarch64F64RuntimeGateReport(gateReport.raw);
    const retainedEvidence = validateRetainedRuntimeGateWork(work, "AArch64 F64 runtime gate", AARCH64_F64_RUNTIME_GATE_GUARD_STAGES, AARCH64_F64_RUNTIME_GATE_EXTRA_ARTIFACTS);
    return {
      status: "GREEN",
      reason: "native AArch64 F64 gate passed 30 NaN and 18 finite comparisons plus 5 cases across 3 store families under exact 1 GiB process-tree guards; independent global PAGE21/PAGEOFF12 store oracle passed",
      runRc: run.exitCode,
      reportSha256: gateReport.sha256,
      pathsRetained: retainedRoot !== null,
      retainedEvidence,
      guardReportCount: retainedEvidence.guardReportCount,
      guardReports: retainedEvidence.guardReports,
      globalStaticRelocOracleStatus: "GREEN",
      privateRuntimeBundleSha256: privateRuntimeBundle?.artifactSetSha256 || null,
      ...verified,
    };
  } catch (error) {
    return {status: "RED", reason: error instanceof Error ? error.message : String(error), runRc: run.exitCode};
  }
}

async function runX86_64F64RuntimeGate(root, driver, compiler, tempDir, timeoutMs, maxBuffer, hardExecutionOptions, retainedRoot = null, privateRuntimeBundle = null, privateToolchain = null) {
  if (retainedRoot !== null && (!privateRuntimeBundle || !privateToolchain)) throw new Error("release x86-64 runtime gate requires private runtime and actual-toolchain bundles");
  const executionRoot = privateRuntimeBundle?.directory || root;
  const gate = canonicalAbsolute(join(executionRoot, X86_64_F64_RUNTIME_GATE_FILES.gate), "x86-64 F64 runtime gate", "file", true);
  const work = join(retainedRoot || tempDir, "x86-64-f64-runtime-gate");
  const run = await runChengDriver(gate, [], {
    root,
    cwd: root,
    maxBuffer,
    exactGuardOwnsTimeoutAndCleanup: true,
    hardRssCapBytes: hardExecutionOptions.hardRssCapBytes,
    env: privateToolchain ? privateReleaseExecutionEnv(privateToolchain, {
      CHENG_X64_F64_GATE_COMPILER: driver,
      CHENG_X64_F64_GATE_CLANG: compiler,
      CHENG_X64_F64_GATE_WORK: work,
    }) : {
      CHENG_X64_F64_GATE_COMPILER: driver,
      CHENG_X64_F64_GATE_CLANG: compiler,
      CHENG_X64_F64_GATE_WORK: work,
    },
  });
  if (!processSucceeded(run)) {
    return {status: "RED", reason: run.timedOut ? "x86_64_f64_runtime_gate_timed_out" : run.overflow ? "x86_64_f64_runtime_gate_output_overflow" : "x86_64_f64_runtime_gate_failed", runRc: run.exitCode, stdoutTail: takeTrailingText(run.stdout, 2000), stderrTail: takeTrailingText(run.stderr, 4000)};
  }
  const expectedStdout = `regalloc_x86_64_f64_runtime_gate=GREEN\nregalloc_x86_64_f64_runtime_gate_work=${work}\n`;
  if (run.stdout !== expectedStdout || run.stderrBuffer?.length !== 0) {
    return {status: "RED", reason: "x86_64_f64_runtime_gate_output_contract_mismatch", runRc: run.exitCode, stdoutTail: takeTrailingText(run.stdout, 2000), stderrTail: takeTrailingText(run.stderr, 4000)};
  }
  try {
    const gateReport = stableSnapshot(join(work, "gate.report.txt"), "x86-64 F64 runtime gate report", 64 * 1024);
    const verified = validateX86_64F64RuntimeGateReport(gateReport.raw);
    const retainedEvidence = validateRetainedRuntimeGateWork(work, "x86-64 F64 runtime gate", X86_64_F64_RUNTIME_GATE_GUARD_STAGES, X86_64_F64_RUNTIME_GATE_EXTRA_ARTIFACTS);
    return {
      status: "GREEN",
      reason: "Rosetta x86-64 F64 gate passed 60 NaN and 72 finite comparisons across six materialized and six fused functions under exact 1 GiB process-tree guards; disassembly and bridge-transform oracles passed",
      runRc: run.exitCode,
      reportSha256: gateReport.sha256,
      pathsRetained: retainedRoot !== null,
      retainedEvidence,
      guardReportCount: retainedEvidence.guardReportCount,
      guardReports: retainedEvidence.guardReports,
      rosettaExecutionStatus: "GREEN",
      disassemblyOracleStatus: "GREEN",
      bridgeTransformStatus: "GREEN",
      privateRuntimeBundleSha256: privateRuntimeBundle?.artifactSetSha256 || null,
      ...verified,
    };
  } catch (error) {
    return {status: "RED", reason: error instanceof Error ? error.message : String(error), runRc: run.exitCode};
  }
}

async function compileAndRunCHarness(root, compiler, tempDir, sanitized, timeoutMs, maxBuffer, hardExecutionOptions, guardContext) {
  const output = join(tempDir, sanitized ? "bodyir-sanitized" : "bodyir-o2");
  const args = sanitized
    ? ["-std=c11", "-O1", "-g", "-fsanitize=address,undefined", "-fno-omit-frame-pointer", "-I", join(root, "bootstrap"), C_FIXTURE, "-o", output]
    : ["-std=c11", "-O2", "-I", join(root, "bootstrap"), C_FIXTURE, "-o", output];
  const tag = sanitized ? "bodyir.sanitized" : "bodyir.o2";
  const compile = await runPreflightChild(compiler, args, {root, cwd: root, timeoutMs, maxBuffer, ...hardExecutionOptions}, guardContext, `${tag}.compile`);
  if (!processSucceeded(compile) || !executableMaterialized(output)) return {status: "RED", reason: compile.exitCode === 0 ? "c_harness_not_materialized" : "c_harness_compile_failed", compileRc: compile.exitCode, stderrTail: takeTrailingText(compile.stderr, 2000)};
  const env = sanitized ? {ASAN_OPTIONS: "halt_on_error=1", UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1"} : {};
  const run = await runPreflightChild(output, [], {root, cwd: root, timeoutMs, maxBuffer, env, ...hardExecutionOptions}, guardContext, `${tag}.run`);
  const emptyOutput = run.stdoutBuffer?.length === 0 && run.stderrBuffer?.length === 0;
  return {status: processSucceeded(run) && emptyOutput ? "GREEN" : "RED", reason: !processSucceeded(run) ? "c_harness_run_failed" : !emptyOutput ? "c_harness_output_contract_mismatch" : sanitized ? "asan_ubsan_contract_passed" : "o2_contract_passed", compileRc: compile.exitCode, runRc: run.exitCode, stdoutTail: takeTrailingText(run.stdout, 1000), stderrTail: takeTrailingText(run.stderr, 2000)};
}

const FINAL_RELEASE_BINDING_KEYS = Object.freeze([
  "source_manifest_sha256", "official_driver_sha256", "baseline_driver_sha256", "allocator_sha256",
  "certification_sha256", "backend2_version_manifest_sha256",
  "official_build_receipt_sha256", "official_compiler_report_sha256", "official_build_guard_sha256",
  "official_source_bundle_cid", "official_entry_source_cid", "official_compile_receipt_cid",
  "official_compiler_output_receipt_cid",
  "official_workspace_source_manifest_sha256", "official_build_seed_sha256",
  "execution_stage_policy_sha256", "execution_stage_receipt_sha256",
  "execution_identity_sha256", "execution_stage_root_sha256",
  "jobs_lock_sha256", "exec_diff_lock_sha256", "target_emit_lock_sha256", "gen3_lock_sha256",
  "production_perf_raw_sha256", "production_perf_verdict_sha256",
  "production_compile_raw_sha256", "production_compile_verdict_sha256",
  "production_receipt_sha256", "production_object_sha256",
  "guard_set_sha256", "exec_final_sha256", "claim_sha256",
  "private_runtime_bundle_sha256", "source_receipt_set_sha256", "semantic_pipeline_receipt_sha256",
  "production_report_sha256", "outer_guard_sha256",
]);

function validateFinalReleaseBindings(bindings, label) {
  const actual = Object.keys(bindings || {}).sort();
  const expected = [...FINAL_RELEASE_BINDING_KEYS].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} exact key set mismatch`);
  for (const key of FINAL_RELEASE_BINDING_KEYS) requireSha256(bindings[key], `${label} ${key}`);
  return bindings;
}

function releaseGuardSetSha256(reports) {
  const rows = reports.map((entry) => ({path: canonicalAbsolute(entry.path, "release guard-set report", "file"), sha256: requireSha256(entry.sha256, "release guard-set report SHA-256")})).sort((left, right) => left.path.localeCompare(right.path));
  if (rows.length === 0 || new Set(rows.map((entry) => entry.path)).size !== rows.length) throw new Error("release guard set is empty or contains duplicate paths");
  for (const row of rows) {
    const snapshot = stableSnapshot(row.path, "release guard-set report", 4 * 1024 * 1024);
    if (snapshot.sha256 !== row.sha256) throw new Error(`release guard-set report changed: ${row.path}`);
  }
  return {guardSetSha256: sha256(Buffer.from(rows.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(""), "utf8")), guardReportCount: rows.length, reports: rows};
}

function collectReleaseArtifactRows(root, excludedBasename) {
  const rows = [];
  const inodeOwners = new Map();
  const walk = (directory) => {
    const entries = readdirSync(directory, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const relativePath = relative(root, path).split("\\").join("/");
      if (dirname(path) === root && entry.name === excludedBasename) continue;
      const stat = lstatSync(path, {bigint: true});
      if (entry.isSymbolicLink() || stat.isSymbolicLink()) throw new Error(`release artifact tree contains a symlink: ${relativePath}`);
      if (entry.isDirectory() && stat.isDirectory()) {
        rows.push({relativePath, type: "dir", sha256: "-", stat});
        walk(path);
      } else if (entry.isFile() && stat.isFile()) {
        if (stat.nlink !== 1n) throw new Error(`release artifact tree contains a file with unexpected hardlinks: ${relativePath}`);
        const inode = `${stat.dev}:${stat.ino}`;
        if (inodeOwners.has(inode)) throw new Error(`release artifact tree inode collision: ${relativePath} and ${inodeOwners.get(inode)}`);
        inodeOwners.set(inode, relativePath);
        const snapshot = stableStreamingSnapshot(path, `release artifact ${relativePath}`);
        rows.push({relativePath, type: "file", sha256: snapshot.sha256, stat: snapshot.stat});
      } else throw new Error(`release artifact tree contains a non-regular entry: ${relativePath}`);
    }
  };
  walk(root);
  rows.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return rows;
}

function releaseArtifactFields(rows, bindings) {
  validateFinalReleaseBindings(bindings, "final release bindings");
  const fields = [["schema", "cheng_regalloc_release_artifact_manifest"], ...FINAL_RELEASE_BINDING_KEYS.map((key) => [key, bindings[key]]), ["artifact_count", rows.length]];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    fields.push(
      [`artifact.${index}.path`, row.relativePath], [`artifact.${index}.type`, row.type], [`artifact.${index}.sha256`, row.sha256],
      [`artifact.${index}.device`, row.stat.dev], [`artifact.${index}.inode`, row.stat.ino], [`artifact.${index}.size`, row.stat.size],
      [`artifact.${index}.mode`, row.stat.mode], [`artifact.${index}.nlink`, row.stat.nlink],
      [`artifact.${index}.mtime_ns`, row.stat.mtimeNs], [`artifact.${index}.ctime_ns`, row.stat.ctimeNs],
    );
  }
  return fields;
}

function materializeFinalReleaseArtifactManifest(rootValue, bindings) {
  const root = canonicalAbsolute(rootValue, "final release artifact root", "dir");
  const basenameValue = "release-artifact-manifest.txt";
  const path = join(root, basenameValue);
  if (pathEntryExists(path)) throw new Error("final release artifact manifest already exists");
  const rows = collectReleaseArtifactRows(root, basenameValue);
  const manifest = writeExclusiveSnapshot(path, renderHashedKv(releaseArtifactFields(rows, bindings), "manifest_payload_sha256"), "final release artifact manifest");
  fsyncDirectory(root);
  return validateFinalReleaseArtifactManifest(root, manifest.path, manifest.sha256, bindings);
}

function validateFinalReleaseArtifactManifest(rootValue, manifestPathValue, expectedSha256, expectedBindings) {
  validateFinalReleaseBindings(expectedBindings, "expected final release bindings");
  const root = canonicalAbsolute(rootValue, "final release artifact root", "dir");
  const manifestPath = canonicalAbsolute(manifestPathValue, "final release artifact manifest", "file");
  if (dirname(manifestPath) !== root || basename(manifestPath) !== "release-artifact-manifest.txt") throw new Error("final release artifact manifest path mismatch");
  const manifest = stableSnapshot(manifestPath, "final release artifact manifest", 512 * 1024 * 1024);
  if (manifest.sha256 !== requireSha256(expectedSha256, "final release artifact manifest expected SHA-256") || manifest.stat.nlink !== 1n) throw new Error("final release artifact manifest identity mismatch");
  const parsed = validatePayloadKv(manifest.raw, "final release artifact manifest", "manifest_payload_sha256");
  const count = Number(uintValue(parsed.get("artifact_count"), "final release artifact count", 1000000n));
  const exact = ["schema", ...FINAL_RELEASE_BINDING_KEYS, "artifact_count"];
  for (let index = 0; index < count; index++) exact.push(
    `artifact.${index}.path`, `artifact.${index}.type`, `artifact.${index}.sha256`, `artifact.${index}.device`, `artifact.${index}.inode`,
    `artifact.${index}.size`, `artifact.${index}.mode`, `artifact.${index}.nlink`, `artifact.${index}.mtime_ns`, `artifact.${index}.ctime_ns`,
  );
  exact.push("manifest_payload_sha256");
  exactKeys(parsed, exact, "final release artifact manifest");
  if (parsed.get("schema") !== "cheng_regalloc_release_artifact_manifest") throw new Error("final release artifact manifest schema mismatch");
  for (const key of FINAL_RELEASE_BINDING_KEYS) if (parsed.get(key) !== expectedBindings[key]) throw new Error(`final release artifact binding mismatch: ${key}`);
  const currentRows = collectReleaseArtifactRows(root, basename(manifestPath));
  if (currentRows.length !== count) throw new Error("final release artifact set count changed");
  for (let index = 0; index < count; index++) {
    const row = currentRows[index];
    for (const [suffix, value] of [
      ["path", row.relativePath], ["type", row.type], ["sha256", row.sha256], ["device", row.stat.dev], ["inode", row.stat.ino],
      ["size", row.stat.size], ["mode", row.stat.mode], ["nlink", row.stat.nlink], ["mtime_ns", row.stat.mtimeNs], ["ctime_ns", row.stat.ctimeNs],
    ]) if (parsed.get(`artifact.${index}.${suffix}`) !== String(value)) throw new Error(`final release artifact changed at index ${index}: ${suffix}`);
  }
  return {schema: "cheng_regalloc_release_artifact_evidence", root, manifestPath, manifestSha256: manifest.sha256, artifactCount: count, bindings: Object.fromEntries(FINAL_RELEASE_BINDING_KEYS.map((key) => [key, parsed.get(key)]))};
}

function check(id, status, reason, extra = {}) {
  return {id, status, reason, ...extra};
}

const RESEARCH_DIAGNOSTIC_CHECK_IDS = Object.freeze(["typedexpr_ebnf_structural_semantic_coverage", "typedexpr_formal_profile_consistency"]);
const SOURCE_REQUIRED_CHECK_IDS = Object.freeze(["typedexpr_expression_leaf_coverage_ledger", "typedexpr_formal_expression_spec_binding", "typedexpr_qualified_nested_call_declaration_binding", "source_snapshot", "driver_toolchain_identity", "typedexpr_frozen_authority_projection_closure", "semantic_pipeline_structural_matrix", "semantic_pipeline_real_receipts", "aarch64_f64_runtime_gate_source_contract", "aarch64_f64_runtime_gate", "x86_64_f64_runtime_gate_source_contract", "x86_64_f64_runtime_gate", "cheng_internal_contract_fixture", "typedexpr_static_arg_expression_matrix", "bodyir_packed_slab_o2", "bodyir_packed_slab_sanitized", "bodyir_memory_and_arena_release"]);
const RELEASE_CRITICAL_CHECK_IDS = Object.freeze(["release_one_shot_worker", "typedexpr_expression_leaf_coverage_ledger", "typedexpr_formal_expression_spec_binding", "typedexpr_qualified_nested_call_declaration_binding", "source_snapshot", "driver_toolchain_identity", "private_actual_toolchain", "execution_stage_receipt_identity", "typedexpr_frozen_authority_projection_closure", "semantic_pipeline_structural_matrix", "semantic_pipeline_real_receipts", "aarch64_f64_runtime_gate_source_contract", "private_runtime_gate_bundle", "aarch64_f64_runtime_gate", "x86_64_f64_runtime_gate_source_contract", "x86_64_f64_runtime_gate", "cheng_internal_contract_fixture", "typedexpr_static_arg_expression_matrix", "bodyir_packed_slab_o2", "bodyir_packed_slab_sanitized", "bodyir_memory_and_arena_release", "release_source_process_tree_guards", "release_cross_bindings", "final_release_artifact_manifest"]);

function sourceChecksGreen(checks) {
  return SOURCE_REQUIRED_CHECK_IDS.every((id) => checks.find((entry) => entry.id === id)?.status === "GREEN");
}

function releaseCriticalChecksGreen(checks) {
  return RELEASE_CRITICAL_CHECK_IDS.every((id) => checks.find((entry) => entry.id === id)?.status === "GREEN");
}

function releasePreFinalChecksGreen(checks) {
  return RELEASE_CRITICAL_CHECK_IDS.filter((id) => id !== "release_cross_bindings" && id !== "final_release_artifact_manifest").every((id) => checks.find((entry) => entry.id === id)?.status === "GREEN") &&
    checks.filter((entry) => entry.requiredForRelease && !["release_cross_bindings", "final_release_artifact_manifest"].includes(entry.id)).every((entry) => entry.status === "GREEN");
}

function result(mode, root, snapshotSha256, checks) {
  const sourceReady = sourceChecksGreen(checks);
  const releaseCriticalReady = releaseCriticalChecksGreen(checks);
  const releaseReady = mode === "release" && releaseCriticalReady && checks.filter((entry) => entry.requiredForRelease).every((entry) => entry.status === "GREEN");
  const verdict = checks.some((entry) => entry.status === "CFAIL") ? "CFAIL" : releaseReady ? "RELEASE_GREEN" : sourceReady && mode === "source" ? "SOURCE_GREEN" : "RED";
  return {schema: "cheng_regalloc_preflight", scope: "regalloc_release", mode, verdict, source_ready: sourceReady ? 1 : 0, release_critical_ready: releaseCriticalReady ? 1 : 0, release_ready: releaseReady ? 1 : 0, research_diagnostic_check_ids: RESEARCH_DIAGNOSTIC_CHECK_IDS, tree_root: root || null, snapshot_sha256: snapshotSha256 || null, compiler_profile: formalChengCompilerProfile(), check_count: checks.length, checks};
}

async function executePreflightOwned(input, oneShotContext = null) {
  const mode = input.mode;
  const checks = [];
  let root = null;
  let snapshotSha256 = null;
  let coldDriver;
  let compiler;
  let inputColdDriver;
  let inputCompiler;
  let sourceInputs;
  let driverPin;
  let compilerPin;
  let sourceManifestPath = null;
  let memoryManifestPath = null;
  let coverageLedger;
  let formalSpecPath;
  let aarch64F64RuntimeGateBundle = null;
  let x86_64F64RuntimeGateBundle = null;
  let aarch64F64RuntimeEvidence = null;
  let x86_64F64RuntimeEvidence = null;
  let releaseInputs = null;
  let releaseFixed = null;
  let releaseClaim = null;
  let productionExecBundle = null;
  let privateReleaseToolchain = null;
  let privateRuntimeGateBundle = null;
  let releaseSourceGuardContext = null;
  let semanticPipelineEvidence = null;
  let production = null;
  const finish = () => {
    if (oneShotContext) {
      const oneShotCheck = checks.find((entry) => entry.id === "release_one_shot_worker");
      try {
        const finalIdentity = validateOneShotWorkerContext(oneShotContext);
        if (oneShotCheck) Object.assign(oneShotCheck, {finalIdentity});
      } catch (error) {
        if (oneShotCheck) {
          oneShotCheck.status = "CFAIL";
          oneShotCheck.reason = error instanceof Error ? error.message : String(error);
        } else checks.push(check("release_one_shot_worker", "CFAIL", error instanceof Error ? error.message : String(error), {requiredForRelease: true}));
      }
    }
    if (releaseClaim?.fd !== null && releaseClaim?.fd !== undefined) {
      const claimCheck = checks.find((entry) => entry.id === "release_work_claim");
      try {
        const finalIdentity = validateReleaseWorkClaim(releaseClaim);
        if (claimCheck) Object.assign(claimCheck, {finalIdentity});
      } catch (error) {
        if (claimCheck) {
          claimCheck.status = "CFAIL";
          claimCheck.reason = error instanceof Error ? error.message : String(error);
        } else {
          checks.push(check("release_work_claim", "CFAIL", error instanceof Error ? error.message : String(error), {requiredForRelease: true, heavyChildStarted: false}));
        }
      } finally {
        closeReleaseWorkClaim(releaseClaim);
      }
    }
    return result(mode, root, snapshotSha256, checks);
  };
  try {
    root = canonicalAbsolute(input.treeRoot, "treeRoot", "dir");
    canonicalAbsolute(join(root, "cheng-package.toml"), "treeRoot/cheng-package.toml", "file");
    coldDriver = canonicalAbsolute(input.coldDriver, "coldDriver", "file", true);
    compiler = canonicalAbsolute(input.cCompiler || "/usr/bin/cc", "cCompiler", "file", true);
    inputColdDriver = coldDriver;
    inputCompiler = compiler;
    if (input.memoryManifest) memoryManifestPath = canonicalAbsolute(input.memoryManifest, "memoryManifest", "file");
    canonicalAbsolute(CHENG_FIXTURE, "Fusion Cheng fixture", "file");
    canonicalAbsolute(C_FIXTURE, "Fusion C fixture", "file");
  } catch (error) {
    checks.push(check("input_paths", "CFAIL", error instanceof Error ? error.message : String(error)));
    return finish();
  }
  if (mode === "release") {
    const requestedRssCap = input.rssCapBytes ?? DEFAULT_RSS_CAP_BYTES;
    if (requestedRssCap !== DEFAULT_RSS_CAP_BYTES) {
      checks.push(check("release_memory_limit", "RED", `release mode requires the exact production process-tree limit ${DEFAULT_RSS_CAP_BYTES}`, {requiredForRelease: true, heavyChildStarted: false, requestedRssCapBytes: String(requestedRssCap)}));
      return finish();
    }
    checks.push(check("release_memory_limit", "GREEN", "release mode is fixed to the exact 1 GiB production process-tree limit", {requiredForRelease: true, heavyChildStarted: false, rssCapBytes: String(DEFAULT_RSS_CAP_BYTES)}));
    if (!input.sourceManifest) {
      checks.push(check("artifact_source_manifest", "RED", "sourceManifest is required before release compilation", {requiredForRelease: true, heavyChildStarted: false}));
      return finish();
    }
    try {
      releaseClaim = oneShotContext ? adoptReleaseWorkClaim(root, input, oneShotContext) : acquireReleaseWorkClaim(root, input);
      checks.push(check("release_work_claim", "GREEN", "exclusive retained release root claimed with O_EXCL|O_NOFOLLOW and fsync", {requiredForRelease: true, heavyChildStarted: false, pathsRetained: true, releaseWorkRoot: releaseClaim.workRoot, claimPath: releaseClaim.path, runId: releaseClaim.runId}));
      if (oneShotContext) checks.push(check("release_one_shot_worker", "GREEN", "a fresh private Bun built and loaded the unique O_EXCL module under exact 1 GiB guards; build argv/environment/source/module/Bun/guard/request identities are exact and retained", {requiredForRelease: true, heavyChildStarted: false, pathsRetained: true, ...validateOneShotWorkerContext(oneShotContext)}));
    } catch (error) {
      checks.push(check("release_work_claim", "RED", error instanceof Error ? error.message : String(error), {requiredForRelease: true, heavyChildStarted: false, pathsRetained: true, releaseWorkRoot: input.releaseWorkRoot || null}));
      return finish();
    }
  }
  const rssCap = BigInt(input.rssCapBytes || DEFAULT_RSS_CAP_BYTES);
  try {
    formalSpecPath = canonicalAbsolute(join(root, FORMAL_SPEC_RELATIVE), `treeRoot/${FORMAL_SPEC_RELATIVE}`, "file");
  } catch (error) {
    checks.push(check("typedexpr_formal_expression_spec_binding", "UNPROVEN", error instanceof Error ? error.message : String(error), {schema: CURRENT_FORMAL_PROFILE_SCHEMA, binding: "generated_ebnf_parser_receipt_map"}));
    return finish();
  }
  try {
    const earlyFormalSpec = stableSnapshot(
      formalSpecPath,
      "formal specification for TypedExpr coverage ledger",
    );
    const earlyFormalSlice = formalExpressionSlice(earlyFormalSpec.raw);
    coverageLedger = validateTypedExprCoverageLedger(
      earlyFormalSlice.sha256,
      earlyFormalSlice.specVersion,
    );
    for (const entry of TYPED_EXPR_MATRIX) canonicalAbsolute(entry.path, `TypedExpr matrix fixture ${entry.id}`, "file");
    checks.push(check("typedexpr_expression_leaf_coverage_ledger", "GREEN", "every selected leaf alternative and audited expression family has one unique executable fixture and explicit outcome contract", coverageLedger));
  } catch (error) {
    checks.push(check("typedexpr_expression_leaf_coverage_ledger", "UNPROVEN", error instanceof Error ? error.message : String(error)));
    return finish();
  }

  // Release artifact requests are fail-closed before any compiler/harness process starts.
  let sourceManifest = null;
  if (input.sourceManifest) {
    try {
      sourceManifestPath = canonicalAbsolute(input.sourceManifest, "sourceManifest", "file");
      sourceManifest = validateSourceManifestPath(root, sourceManifestPath);
      checks.push(check("artifact_source_manifest", "GREEN", "strict current source closure verified", {requiredForRelease: mode === "release", artifact_path: sourceManifestPath, artifact_sha256: sourceManifest.sha256, fileCount: sourceManifest.fileCount, edgeCount: sourceManifest.edgeCount}));
    } catch (error) {
      checks.push(check("artifact_source_manifest", "RED", error instanceof Error ? error.message : String(error), {requiredForRelease: mode === "release", heavyChildStarted: false}));
      return finish();
    }
  }
  if (mode === "release") {
    try {
      releaseInputs = validateReleaseEvidenceInputs(root, input, {releaseClaim});
      const finalizedClaim = finalizeReleaseWorkClaim(releaseClaim, releaseInputs.sha256);
      Object.assign(checks.find((entry) => entry.id === "release_work_claim"), finalizedClaim);
      checks.push(check("release_evidence_inputs", "GREEN", "production dependencies, compiler-owned current-source build receipt, backend2 epoch, four external locks and distinct GEN2/GEN3/official drivers are exact-hash pinned before heavy work", {
        requiredForRelease: true,
        artifact_sha256: releaseInputs.sha256,
        dependencyBundle: releaseInputs.dependencyBundle,
        officialDriverBuild: releaseInputs.officialDriverBuild,
        backend2VersionManifest: releaseInputs.backend2VersionManifest,
        evidence: releaseInputs.artifacts.map((entry) => ({key: entry.key, path: entry.snapshot.path, sha256: entry.snapshot.sha256})),
        drivers: releaseInputs.driverPins.map((entry) => ({key: entry.key, path: entry.snapshot.path, sha256: entry.snapshot.sha256})),
        heavyChildStarted: false,
      }));
      checks.push(check("execution_stage_receipt_identity", "GREEN", "the exact seven-stage compiler receipt, all stage artifacts and the common current-source execution identity passed independent validation", {
        requiredForRelease: true,
        heavyChildStarted: false,
        ...releaseInputs.executionStageReceipt,
      }));
    } catch (error) {
      checks.push(check("release_evidence_inputs", "RED", error instanceof Error ? error.message : String(error), {requiredForRelease: true, heavyChildStarted: false}));
      return finish();
    }
    try {
      releaseFixed = rawDriverFixedPoint(releaseInputs.driverPaths.gen2Driver, releaseInputs.driverPaths.gen3Driver, releaseInputs.driverPaths.officialDriver);
      checks.push(check("raw_gen2_gen3_fixed_point", releaseFixed.identical ? "GREEN" : "RED", releaseFixed.identical ? "full raw files are byte-identical before heavy work" : "full raw driver bytes differ; no UUID/signature masking is permitted", {requiredForRelease: true, heavyChildStarted: false, ...releaseFixed}));
      if (!releaseFixed.identical) return finish();
    } catch (error) {
      checks.push(check("raw_gen2_gen3_fixed_point", "CFAIL", error instanceof Error ? error.message : String(error), {requiredForRelease: true, heavyChildStarted: false}));
      return finish();
    }
    if (!memoryManifestPath) {
      checks.push(check("bodyir_memory_and_arena_release", "RED", "memoryManifest is required before release work starts", {requiredForRelease: true, heavyChildStarted: false}));
      return finish();
    }
    try {
      const snap = stableSnapshot(memoryManifestPath, "cold BodyIR memory manifest", 256 * 1024 * 1024);
      const verified = validateMemoryManifestBytes(snap.raw);
      const peak = BigInt(verified.recomputedPeakRetainedBytes);
      if (peak > rssCap) throw new Error(`recomputed retained peak ${peak} exceeds cap ${rssCap}`);
      checks.push(check("bodyir_memory_and_arena_release", "GREEN", "event sweep, packed-byte arithmetic, old+new overlap and all arena roles verified before heavy work", {requiredForRelease: true, heavyChildStarted: false, artifact_path: memoryManifestPath, artifact_sha256: snap.sha256, ...verified, rssCapBytes: rssCap.toString()}));
    } catch (error) {
      checks.push(check("bodyir_memory_and_arena_release", "RED", error instanceof Error ? error.message : String(error), {requiredForRelease: true, heavyChildStarted: false}));
      return finish();
    }
    try {
      productionExecBundle = materializePrivateProductionExecBundle(releaseInputs);
      driverPin = stableStreamingSnapshot(inputColdDriver, "release coldDriver input identity");
      compilerPin = stableStreamingSnapshot(inputCompiler, "release cCompiler input identity");
      privateReleaseToolchain = materializePrivateReleaseToolchain(releaseInputs, inputColdDriver, inputCompiler, driverPin, compilerPin);
      coldDriver = privateReleaseToolchain.coldDriver.path;
      compiler = privateReleaseToolchain.compiler.path;
      releaseSourceGuardContext = createReleaseSourceGuardContext(releaseInputs, productionExecBundle, privateReleaseToolchain);
      const privateToolchainEvidence = validatePrivateReleaseToolchain(privateReleaseToolchain);
      checks.push(check("private_production_exec_bundle", "GREEN", "the exact validated gate/guard/evidence/lock-validator and source toolchain bytes were materialized with O_EXCL|O_NOFOLLOW and fsync before child execution", {requiredForRelease: true, heavyChildStarted: false, pathsRetained: true, bundlePath: productionExecBundle.path, files: [...productionExecBundle.files].map(([key, snapshot]) => ({key, path: snapshot.path, sha256: snapshot.sha256})), privateToolchain: {directory: privateReleaseToolchain.directory, coldDriverPath: privateReleaseToolchain.coldDriver.path, coldDriverSha256: privateReleaseToolchain.coldDriver.sha256, compilerPath: privateReleaseToolchain.compiler.path, compilerSha256: privateReleaseToolchain.compiler.sha256}}));
      checks.push(check("private_actual_toolchain", "GREEN", "every release subprocess resolves an exact private PATH whose wrappers bind root-owned actual tools, fixed Xcode developer root and full path/SHA/device/inode identity", {requiredForRelease: true, heavyChildStarted: false, pathsRetained: true, ...privateToolchainEvidence}));
    } catch (error) {
      checks.push(check("private_production_exec_bundle", "RED", error instanceof Error ? error.message : String(error), {requiredForRelease: true, heavyChildStarted: false, pathsRetained: true, releaseWorkRoot: releaseInputs.releaseWorkRoot}));
      checks.push(check("private_actual_toolchain", "RED", error instanceof Error ? error.message : String(error), {requiredForRelease: true, heavyChildStarted: false, pathsRetained: true, releaseWorkRoot: releaseInputs.releaseWorkRoot}));
      return finish();
    }
  }

  try {
    sourceInputs = snapshotSourceInputs(root, {sourceManifest: sourceManifestPath, sourceManifestRelativePaths: sourceManifest?.relativePaths || [], memoryManifest: memoryManifestPath});
    snapshotSha256 = sourceInputs.sha256;
    const fusionLockAbsent = sourceInputs.absences.some((entry) => entry.label === "fusion/bun.lock");
    checks.push(check("source_snapshot", fusionLockAbsent ? "UNPROVEN" : "GREEN", fusionLockAbsent ? "Fusion bun.lock is absent; dependency identity is UNPROVEN" : "Fusion execution sources/fixtures/dependencies/lock, formal specification, parser receipt tool/source-plan closures, Cheng authority production import closure, and exact C include closure are pinned by raw SHA-256 and file identity", {artifact_sha256: snapshotSha256, fileCount: sourceInputs.snapshots.length, absentInputs: sourceInputs.absences, fusionSourceFileCount: sourceInputs.fusionSourceFileCount, fusionDependencyFileCount: sourceInputs.fusionDependencyFileCount, fusionFixtureCount: sourceInputs.fusionFixtureCount, formalReceiptToolClosure: sourceInputs.formalReceiptToolClosure, formalReceiptSourcePlan: sourceInputs.formalReceiptSourcePlan, authorityMinimumRequiredFileCount: AUTHORITY_MINIMUM_REQUIRED_FILES.length, authorityFormalReceiptRootFileCount: FORMAL_RECEIPT_AUTHORITY_FILES.length, authorityProductionImportFileCount: sourceInputs.authorityProductionFiles.length, authorityProductionRootFileCount: sourceInputs.authorityProductionRoots.length, authorityManifestRootFileCount: sourceInputs.authorityManifestRootFileCount, authorityProductionScope: sourceInputs.authorityProductionScope, cIncludeClosure: sourceInputs.cIncludeClosure, pinnedSourceManifest: sourceManifestPath, pinnedMemoryManifest: memoryManifestPath}));
    const nestedFixtureSnapshot = sourceInputs.byLabel.get(QUALIFIED_NESTED_CALL_WITNESS.fixtureLabel);
    const nestedModuleSnapshot = sourceInputs.byLabel.get(QUALIFIED_NESTED_CALL_WITNESS.modulePath);
    const nestedBinding = nestedFixtureSnapshot && nestedModuleSnapshot
      ? validateQualifiedNestedCallDeclarationWitness(nestedFixtureSnapshot.raw, nestedModuleSnapshot.raw)
      : {status: "RED", reason: "qualified nested-call fixture or canonical declaration module is absent from the complete snapshot", schema: QUALIFIED_NESTED_CALL_WITNESS.schema, witnessId: QUALIFIED_NESTED_CALL_WITNESS.id, issues: ["qualified_nested_call_snapshot_edge_missing"]};
    checks.push(check("typedexpr_qualified_nested_call_declaration_binding", nestedBinding.status, nestedBinding.reason, {required: true, executionWitnessFamily: QUALIFIED_NESTED_CALL_WITNESS.family, ...nestedBinding}));
    const formalSpecSnapshot = sourceInputs.byLabel.get(FORMAL_SPEC_RELATIVE);
    const generatedEbnfMapSnapshot = sourceInputs.byLabel.get(
      `fusion/${EBNF_PARSER_NODE_MAP_RELATIVE}`,
    );
    const parserSnapshot = sourceInputs.byLabel.get(
      "src/core/lang/parser.cheng",
    );
    const producerDeclarationsSnapshot = sourceInputs.byLabel.get(
      `fusion/${EBNF_PARSER_PRODUCER_DECLARATIONS_RELATIVE}`,
    );
    const formalBinding =
      formalSpecSnapshot && generatedEbnfMapSnapshot && parserSnapshot &&
          producerDeclarationsSnapshot
        ? validateTypedExprFormalSpecBinding(
            formalSpecSnapshot.raw,
            generatedEbnfMapSnapshot.raw,
            parserSnapshot.raw,
            producerDeclarationsSnapshot.raw,
            {
              sourcePath: formalSpecSnapshot.path,
              sourceSnapshotSha256: sourceInputs.sha256,
              receiptToolClosureSha256:
                sourceInputs.formalReceiptToolClosure.sha256,
              receiptSourcePlanSha256:
                sourceInputs.formalReceiptSourcePlan.sha256,
            },
          )
        : {
            status: "UNPROVEN",
            reason:
              "formal specification, parser, producer declarations or generated EBNF receipt map is absent from source snapshot",
          };
    if (formalBinding.status === "GREEN" &&
        coverageLedger.formalSpecSliceSha256 !==
          formalBinding.sliceSha256) {
      formalBinding.status = "UNPROVEN";
      formalBinding.reason =
        "formal expression EBNF drifted between coverage-ledger and source snapshots";
    }
    checks.push(check("typedexpr_formal_expression_spec_binding", formalBinding.status, formalBinding.reason, {...formalBinding, artifact_path: formalSpecPath, artifact_sha256: formalSpecSnapshot?.sha256 || null}));
    if (formalBinding.status !== "GREEN") return finish();
    try {
      const obligationManifest = deriveFormalExpressionObligationManifest(
        formalSpecSnapshot.raw,
      );
      const obligationCoverage = evaluateFormalExpressionObligationCoverage(obligationManifest, coverageLedger);
      checks.push(check("typedexpr_ebnf_structural_semantic_coverage", obligationCoverage.status, obligationCoverage.reason, {required: true, manifest: obligationManifest, coverage: obligationCoverage}));
      const contradictions = obligationManifest.formalProfileContradictions || [];
      checks.push(check("typedexpr_formal_profile_consistency", contradictions.length === 0 ? "GREEN" : "UNPROVEN", contradictions.length === 0 ? "compiler profile is formally bound to every admitted EBNF production" : `${contradictions.length} admitted EBNF production conflicts with the fixed compiler profile without an exact-hash exclusion rule`, {required: true, contradictions, compilerProfile: formalChengCompilerProfile()}));
    } catch (error) {
      checks.push(check("typedexpr_ebnf_structural_semantic_coverage", "UNPROVEN", error instanceof Error ? error.message : String(error), {required: true}));
      return finish();
    }
    const typedExprSnapshot = sourceInputs.byLabel.get(TYPED_EXPR_SOURCE_RELATIVE);
    if (!typedExprSnapshot) throw new Error("TypedExpr authority source is absent from the complete snapshot");
    const authoritySources = new Map();
    for (const relativePath of sourceInputs.authorityProductionFiles) {
      const snapshot = sourceInputs.byLabel.get(relativePath);
      if (!snapshot) throw new Error(`authority production source is absent from the complete snapshot: ${relativePath}`);
      authoritySources.set(relativePath, snapshot.raw);
    }
    const authority = validateTypedExprFrozenAuthority(typedExprSnapshot.raw, typedExprSnapshot.path, authoritySources, sourceInputs.authorityProductionRoots);
    checks.push(check("typedexpr_frozen_authority_projection_closure", authority.status, authority.reason, authority));
    try {
      const runtimeGateSources = new Map(Object.values(AARCH64_F64_RUNTIME_GATE_FILES).map((relativePath) => [relativePath, sourceInputs.byLabel.get(relativePath)]));
      aarch64F64RuntimeGateBundle = validateAarch64F64RuntimeGateBundle(runtimeGateSources);
      checks.push(check("aarch64_f64_runtime_gate_source_contract", "GREEN", "runtime gate, independent guard, native image/harness/bridge and global relocation oracle are exact-hash pinned", aarch64F64RuntimeGateBundle));
    } catch (error) {
      checks.push(check("aarch64_f64_runtime_gate_source_contract", "RED", error instanceof Error ? error.message : String(error)));
    }
    try {
      const runtimeGateSources = new Map(Object.values(X86_64_F64_RUNTIME_GATE_FILES).map((relativePath) => [relativePath, sourceInputs.byLabel.get(relativePath)]));
      x86_64F64RuntimeGateBundle = validateX86_64F64RuntimeGateBundle(runtimeGateSources);
      checks.push(check("x86_64_f64_runtime_gate_source_contract", "GREEN", "runtime gate, independent guard, Rosetta execution, native x86-64 image/harness/bridge and disassembly oracles are exact-hash pinned", x86_64F64RuntimeGateBundle));
    } catch (error) {
      checks.push(check("x86_64_f64_runtime_gate_source_contract", "RED", error instanceof Error ? error.message : String(error)));
    }
    if (mode === "release" && aarch64F64RuntimeGateBundle && x86_64F64RuntimeGateBundle) {
      privateRuntimeGateBundle = materializePrivateRuntimeGateBundle(releaseInputs, sourceInputs);
      checks.push(check("private_runtime_gate_bundle", "GREEN", "AArch64/x86-64 gate scripts, guard and every source input were copied with O_EXCL|O_NOFOLLOW and bound as one exact private artifact set", {requiredForRelease: true, pathsRetained: true, directory: privateRuntimeGateBundle.directory, artifactCount: privateRuntimeGateBundle.artifacts.length, artifactSetSha256: privateRuntimeGateBundle.artifactSetSha256}));
    }
    if (!driverPin) driverPin = stableSnapshot(inputColdDriver, "coldDriver input identity");
    if (!compilerPin) compilerPin = stableSnapshot(inputCompiler, "cCompiler input identity");
    checks.push(check("driver_toolchain_identity", "GREEN", "locked input driver/compiler and release-private execution copies are pinned by full raw bytes and file identity", {
      coldDriverSha256: driverPin.sha256,
      cCompilerSha256: compilerPin.sha256,
      privateColdDriverSha256: privateReleaseToolchain?.coldDriver.sha256 || null,
      privateCompilerSha256: privateReleaseToolchain?.compiler.sha256 || null,
    }));
  } catch (error) {
    checks.push(check("source_snapshot", "CFAIL", error instanceof Error ? error.message : String(error)));
    return finish();
  }

  if (mode !== "release" && !memoryManifestPath) {
    checks.push(check("bodyir_memory_and_arena_release", "UNPROVEN", "cold_bodyir_memory_manifest is absent; packed-slab peak and all six top-level arena releases are not proved"));
  } else if (mode !== "release") {
    try {
      const path = memoryManifestPath;
      const snap = stableSnapshot(path, "cold BodyIR memory manifest", 256 * 1024 * 1024);
      const verified = validateMemoryManifestBytes(snap.raw);
      const peak = BigInt(verified.recomputedPeakRetainedBytes);
      checks.push(check("bodyir_memory_and_arena_release", peak <= rssCap ? "GREEN" : "RED", peak <= rssCap ? "event sweep, packed-byte arithmetic, old+new overlap and all arena roles verified" : `recomputed retained peak ${peak} exceeds cap ${rssCap}`, {artifact_path: path, artifact_sha256: snap.sha256, ...verified, rssCapBytes: rssCap.toString()}));
    } catch (error) {
      checks.push(check("bodyir_memory_and_arena_release", "RED", error instanceof Error ? error.message : String(error)));
    }
  }

  const timeoutMs = Math.round((input.timeoutSec || DEFAULT_TIMEOUT_SEC) * 1000);
  const maxBuffer = input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES;
  const hardExecutionOptions = {hardRssCapBytes: Number(rssCap), hardTimeoutMs: timeoutMs};
  try {
    semanticPipelineEvidence = await runSemanticPipelineGate(root, mode, sourceInputs, inputColdDriver, inputCompiler, driverPin, compilerPin, privateReleaseToolchain, oneShotContext, maxBuffer);
    checks.push(check("semantic_pipeline_structural_matrix", "GREEN", "the complete bounded m9024 join, deterministic source materializer and 2,926-case matrix ran in a private Bun child under the exact 1 GiB process-tree guard; the parent independently rehashed the full canonical receipt", {required: true, requiredForRelease: mode === "release", ...semanticPipelineEvidence}));
    const executionStageReceipt = mode === "release" ? releaseInputs?.executionStageReceipt : null;
    checks.push(check("semantic_pipeline_real_receipts", "RED", executionStageReceipt
      ? "the compiler-owned seven-stage receipt is independently valid, but formal parser-span admission remains RED and is not cross-bound to that receipt"
      : "formal parser-span witnesses and compiler-owned source-bound TypedExpr -> CSG/lowering -> primary/backend2 -> both regalloc receipts are absent", {
      required: true,
      requiredForRelease: mode === "release",
      heavyChildStarted: true,
      receiptSha256: semanticPipelineEvidence.receiptSha256,
      grammarObligationRootSha256: semanticPipelineEvidence.grammarObligationRootSha256,
      grammarRequiredCount: semanticPipelineEvidence.grammarRequiredCount,
      parserEvidenceRootSha256: semanticPipelineEvidence.parserEvidenceRootSha256,
      parserEvidenceStatus: semanticPipelineEvidence.parserEvidenceStatus,
      realPipelineReceiptStatus: semanticPipelineEvidence.realPipelineReceiptStatus,
      executionStageReceipt,
    }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    checks.push(check("semantic_pipeline_structural_matrix", "CFAIL", reason, {required: true, requiredForRelease: mode === "release", pathsRetained: mode === "release", heavyChildStarted: true}));
    checks.push(check("semantic_pipeline_real_receipts", "RED", "semantic structural child did not produce independently valid evidence; parser and seven-stage receipts remain unavailable", {required: true, requiredForRelease: mode === "release", heavyChildStarted: true}));
  }
  const temp = realpathSync.native(mkdtempSync(join(tmpdir(), "cheng-regalloc-preflight-")));
  let releaseSourceGuardSet = null;
  let releaseSourceGuardError = null;
  try {
    const cheng = await compileAndRunChengFixture(root, coldDriver, temp, timeoutMs, maxBuffer, hardExecutionOptions, releaseSourceGuardContext);
    checks.push(check("cheng_internal_contract_fixture", cheng.status, cheng.reason, {...cheng, compilerProfileSha256: formalChengCompilerProfile().sha256}));
    const staticArgCases = await mapWithConcurrency(TYPED_EXPR_MATRIX, 2, (entry) => runTypedExprMatrixCase(root, coldDriver, temp, entry, timeoutMs, maxBuffer, hardExecutionOptions, releaseSourceGuardContext));
    const staticArgGreen = staticArgCases.every((entry) => entry.status === "GREEN");
    checks.push(check("typedexpr_static_arg_expression_matrix", staticArgGreen ? "GREEN" : "RED", staticArgGreen ? "every expression family passed its independent compile/run or compile-fail contract" : `${staticArgCases.filter((entry) => entry.status !== "GREEN").length} independent expression families failed`, {required: true, compilerProfileSha256: formalChengCompilerProfile().sha256, caseCount: staticArgCases.length, cases: staticArgCases}));
    if (aarch64F64RuntimeGateBundle && cheng.status === "GREEN") {
      aarch64F64RuntimeEvidence = await runAarch64F64RuntimeGate(root, coldDriver, compiler, temp, timeoutMs, maxBuffer, hardExecutionOptions, mode === "release" ? releaseInputs.releaseWorkRoot : null, privateRuntimeGateBundle, privateReleaseToolchain);
      checks.push(check("aarch64_f64_runtime_gate", aarch64F64RuntimeEvidence.status, aarch64F64RuntimeEvidence.reason, aarch64F64RuntimeEvidence));
    } else {
      checks.push(check("aarch64_f64_runtime_gate", "RED", !aarch64F64RuntimeGateBundle ? "AArch64 F64 runtime gate source contract is invalid" : "locked Cheng driver failed the prerequisite internal contract; runtime gate not started", {heavyChildStarted: false}));
    }
    if (x86_64F64RuntimeGateBundle && cheng.status === "GREEN") {
      x86_64F64RuntimeEvidence = await runX86_64F64RuntimeGate(root, coldDriver, compiler, temp, timeoutMs, maxBuffer, hardExecutionOptions, mode === "release" ? releaseInputs.releaseWorkRoot : null, privateRuntimeGateBundle, privateReleaseToolchain);
      checks.push(check("x86_64_f64_runtime_gate", x86_64F64RuntimeEvidence.status, x86_64F64RuntimeEvidence.reason, x86_64F64RuntimeEvidence));
    } else {
      checks.push(check("x86_64_f64_runtime_gate", "RED", !x86_64F64RuntimeGateBundle ? "x86-64 F64 runtime gate source contract is invalid" : "locked Cheng driver failed the prerequisite internal contract; runtime gate not started", {heavyChildStarted: false}));
    }
    const o2 = await compileAndRunCHarness(root, compiler, temp, false, timeoutMs, maxBuffer, hardExecutionOptions, releaseSourceGuardContext);
    checks.push(check("bodyir_packed_slab_o2", o2.status, o2.reason, o2));
    const sanitized = await compileAndRunCHarness(root, compiler, temp, true, timeoutMs, maxBuffer, hardExecutionOptions, releaseSourceGuardContext);
    checks.push(check("bodyir_packed_slab_sanitized", sanitized.status, sanitized.reason, sanitized));
    try {
      const finalSourceInputs = snapshotSourceInputs(root, {sourceManifest: sourceManifestPath, sourceManifestRelativePaths: sourceManifest?.relativePaths || [], memoryManifest: memoryManifestPath});
      if (!sameSourceInputs(sourceInputs, finalSourceInputs)) throw new Error(`source input closure changed during preflight execution: ${sourceInputsDifference(sourceInputs, finalSourceInputs)}`);
      if (sourceManifestPath) {
        const finalManifest = validateSourceManifestPath(root, sourceManifestPath);
        if (finalManifest.sha256 !== sourceManifest.sha256 || finalManifest.fileCount !== sourceManifest.fileCount || finalManifest.edgeCount !== sourceManifest.edgeCount) throw new Error("regalloc source manifest or its declared closure changed during preflight execution");
      }
    } catch (error) {
      const sourceCheck = checks.find((entry) => entry.id === "source_snapshot");
      sourceCheck.status = "CFAIL";
      sourceCheck.reason = error instanceof Error ? error.message : String(error);
    }
    try {
      const finalInputDriver = mode === "release" ? stableStreamingSnapshot(inputColdDriver, "coldDriver input final identity") : stableSnapshot(inputColdDriver, "coldDriver input final identity");
      const finalInputCompiler = mode === "release" ? stableStreamingSnapshot(inputCompiler, "cCompiler input final identity") : stableSnapshot(inputCompiler, "cCompiler input final identity");
      if (finalInputDriver.sha256 !== driverPin.sha256 || !sameStat(finalInputDriver.stat, driverPin.stat) ||
          finalInputCompiler.sha256 !== compilerPin.sha256 || !sameStat(finalInputCompiler.stat, compilerPin.stat)) {
        throw new Error("input driver or C compiler changed during preflight execution");
      }
      if (mode === "release") {
        const finalPrivateDriver = stableStreamingSnapshot(coldDriver, "private coldDriver final identity");
        const finalPrivateCompiler = stableStreamingSnapshot(compiler, "private cCompiler final identity");
        if (finalPrivateDriver.sha256 !== privateReleaseToolchain.coldDriver.sha256 || !sameStat(finalPrivateDriver.stat, privateReleaseToolchain.coldDriver.stat) ||
            finalPrivateCompiler.sha256 !== privateReleaseToolchain.compiler.sha256 || !sameStat(finalPrivateCompiler.stat, privateReleaseToolchain.compiler.stat)) {
          throw new Error("private driver or C compiler changed during preflight execution");
        }
      }
    } catch (error) {
      const identityCheck = checks.find((entry) => entry.id === "driver_toolchain_identity");
      identityCheck.status = "CFAIL";
      identityCheck.reason = error instanceof Error ? error.message : String(error);
    }
    if (mode === "release") {
      try { releaseSourceGuardSet = finalizeReleaseSourceGuardContext(releaseSourceGuardContext); }
      catch (error) { releaseSourceGuardError = error; }
    }
  } finally {
    rmSync(temp, {recursive: true, force: true});
  }

  if (mode === "release") {
    if (releaseSourceGuardSet) checks.push(check("release_source_process_tree_guards", "GREEN", "every release-critical fixture/matrix/C child has one exact-tag receipt binding argv/env/input/tool/output to its retained 1 GiB guard and streams", {requiredForRelease: true, pathsRetained: true, directory: releaseSourceGuardContext.directory, ...releaseSourceGuardSet}));
    else checks.push(check("release_source_process_tree_guards", "RED", releaseSourceGuardError instanceof Error ? releaseSourceGuardError.message : String(releaseSourceGuardError || "release source guard set was not finalized"), {requiredForRelease: true, pathsRetained: true, directory: releaseSourceGuardContext?.directory || null}));
  }

  if (mode === "release") {
    const gatePrerequisitesGreen = releaseCriticalChecksGreen(checks) && releaseFixed?.identical === true;
    if (!gatePrerequisitesGreen) {
      const reason = "production gate was not started because source readiness or raw GEN2/GEN3/official identity is not GREEN";
      checks.push(check("production_gate_report", "RED", reason, {requiredForRelease: true, heavyChildStarted: false}));
      checks.push(check("process_tree_rss_guard", "RED", reason, {requiredForRelease: true, heavyChildStarted: false, rssCapBytes: rssCap.toString()}));
      checks.push(check("production_artifacts", "RED", reason, {requiredForRelease: true, heavyChildStarted: false, sourceManifestSha256: sourceManifest.sha256}));
    } else {
      try {
        production = await runProductionReleaseGate(root, releaseInputs, productionExecBundle, privateReleaseToolchain, sourceManifest.sha256, releaseFixed.officialSha256, Math.round((input.releaseTimeoutSec || DEFAULT_RELEASE_TIMEOUT_SEC) * 1000), maxBuffer);
        checks.push(check("production_gate_report", "GREEN", "exact-hash-bound production gate exited zero and its retained report was independently reproduced", {requiredForRelease: true, pathsRetained: true, releaseWorkRoot: production.releaseWorkRoot, reportPath: production.reportPath, reportSha256: production.reportSha256, sourceGitTree: production.sourceGitTree, productionGreenCount: production.productionGreenCount, compilePairRowCount: production.compilePairRowCount}));
        checks.push(check("process_tree_rss_guard", "GREEN", "every retained production guard report proves sampled process-tree resident/phys-footprint peak at or below exactly 1 GiB", {requiredForRelease: true, pathsRetained: true, releaseWorkRoot: production.releaseWorkRoot, rssCapBytes: rssCap.toString(), ...production.guardEvidence}));
        checks.push(check("production_artifacts", "GREEN", "retained unique workload receipt is independently bound to its frozen plan, emission ledger and output object", {requiredForRelease: true, pathsRetained: true, releaseWorkRoot: production.releaseWorkRoot, sourceManifestSha256: sourceManifest.sha256, ...production.receiptEvidence}));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        checks.push(check("production_gate_report", "RED", reason, {requiredForRelease: true, pathsRetained: true, releaseWorkRoot: releaseInputs.releaseWorkRoot}));
        checks.push(check("process_tree_rss_guard", "RED", "production gate evidence was not fully validated", {requiredForRelease: true, pathsRetained: true, releaseWorkRoot: releaseInputs.releaseWorkRoot, rssCapBytes: rssCap.toString()}));
        checks.push(check("production_artifacts", "RED", "production gate evidence was not fully validated", {requiredForRelease: true, pathsRetained: true, releaseWorkRoot: releaseInputs.releaseWorkRoot, sourceManifestSha256: sourceManifest.sha256}));
      }
      try {
        const finalSourceInputs = snapshotSourceInputs(root, {sourceManifest: sourceManifestPath, sourceManifestRelativePaths: sourceManifest.relativePaths, memoryManifest: memoryManifestPath});
        if (!sameSourceInputs(sourceInputs, finalSourceInputs)) throw new Error(`source input closure changed during production gate execution: ${sourceInputsDifference(sourceInputs, finalSourceInputs)}`);
        const finalManifest = validateSourceManifestPath(root, sourceManifestPath);
        if (finalManifest.sha256 !== sourceManifest.sha256 || finalManifest.fileCount !== sourceManifest.fileCount || finalManifest.edgeCount !== sourceManifest.edgeCount) throw new Error("regalloc source manifest changed during production gate execution");
      } catch (error) {
        const sourceCheck = checks.find((entry) => entry.id === "source_snapshot");
        sourceCheck.status = "CFAIL";
        sourceCheck.reason = error instanceof Error ? error.message : String(error);
      }
      for (const runtimeGate of [
        {id: "aarch64_f64_runtime_gate", label: "AArch64 F64 runtime gate", directory: "aarch64-f64-runtime-gate", stages: AARCH64_F64_RUNTIME_GATE_GUARD_STAGES, extras: AARCH64_F64_RUNTIME_GATE_EXTRA_ARTIFACTS, initial: aarch64F64RuntimeEvidence},
        {id: "x86_64_f64_runtime_gate", label: "x86-64 F64 runtime gate", directory: "x86-64-f64-runtime-gate", stages: X86_64_F64_RUNTIME_GATE_GUARD_STAGES, extras: X86_64_F64_RUNTIME_GATE_EXTRA_ARTIFACTS, initial: x86_64F64RuntimeEvidence},
      ]) {
        try {
          const finalEvidence = validateRetainedRuntimeGateWork(join(releaseInputs.releaseWorkRoot, runtimeGate.directory), runtimeGate.label, runtimeGate.stages, runtimeGate.extras);
          if (!runtimeGate.initial?.retainedEvidence || finalEvidence.artifactSetSha256 !== runtimeGate.initial.retainedEvidence.artifactSetSha256) {
            throw new Error(`${runtimeGate.label} retained evidence changed during final validation`);
          }
        } catch (error) {
          const runtimeCheck = checks.find((entry) => entry.id === runtimeGate.id);
          runtimeCheck.status = "CFAIL";
          runtimeCheck.reason = error instanceof Error ? error.message : String(error);
        }
      }
      try {
        const finalPrivateRuntimeBundle = validatePrivateRuntimeGateBundle(privateRuntimeGateBundle.directory, privateRuntimeGateBundle.files);
        if (finalPrivateRuntimeBundle.artifactSetSha256 !== privateRuntimeGateBundle.artifactSetSha256) throw new Error("private runtime-gate bundle changed during release execution");
      } catch (error) {
        const bundleCheck = checks.find((entry) => entry.id === "private_runtime_gate_bundle");
        bundleCheck.status = "CFAIL";
        bundleCheck.reason = error instanceof Error ? error.message : String(error);
      }
      try {
        validatePrivateReleaseToolchain(privateReleaseToolchain);
      } catch (error) {
        const toolchainCheck = checks.find((entry) => entry.id === "private_actual_toolchain");
        toolchainCheck.status = "CFAIL";
        toolchainCheck.reason = error instanceof Error ? error.message : String(error);
      }
      try {
        const finalReleaseInputs = validateReleaseEvidenceInputs(root, input, {allowPopulatedReleaseWorkRoot: true});
        if (!sameReleaseEvidenceInputs(releaseInputs, finalReleaseInputs)) throw new Error("release dependency, evidence or driver inputs changed during production gate execution");
        const finalFixed = rawDriverFixedPoint(finalReleaseInputs.driverPaths.gen2Driver, finalReleaseInputs.driverPaths.gen3Driver, finalReleaseInputs.driverPaths.officialDriver);
        if (!finalFixed.identical || finalFixed.gen2Sha256 !== releaseFixed.gen2Sha256 || finalFixed.gen3Sha256 !== releaseFixed.gen3Sha256 || finalFixed.officialSha256 !== releaseFixed.officialSha256) {
          throw new Error("raw GEN2/GEN3/official fixed point changed during release execution");
        }
        if (production) {
          const finalProduction = validateProductionGateEvidence(production.validation.workDir, production.validation.reportPath, production.validation.reportSha256, production.validation.stdoutRaw, production.validation.expected);
          if (finalProduction.reportSha256 !== production.reportSha256 || finalProduction.receiptEvidence.receiptSha256 !== production.receiptEvidence.receiptSha256 || finalProduction.guardEvidence.guardReportCount !== production.guardEvidence.guardReportCount) {
            throw new Error("retained production evidence changed during final validation");
          }
        }
      } catch (error) {
        const releaseCheck = checks.find((entry) => entry.id === "release_evidence_inputs");
        releaseCheck.status = "CFAIL";
        releaseCheck.reason = error instanceof Error ? error.message : String(error);
        if (production) {
          for (const id of ["production_gate_report", "process_tree_rss_guard", "production_artifacts"]) {
            const productionCheck = checks.find((entry) => entry.id === id);
            productionCheck.status = "CFAIL";
            productionCheck.reason = error instanceof Error ? error.message : String(error);
          }
        }
      }
    }
  }
  if (mode === "release") {
    if (production && releasePreFinalChecksGreen(checks)) {
      try {
        const guardSet = releaseGuardSetSha256([
          oneShotContext.bundleBuild.guardEvidence,
          semanticPipelineEvidence.guardEvidence,
          ...releaseSourceGuardSet.reports,
          ...aarch64F64RuntimeEvidence.guardReports,
          ...x86_64F64RuntimeEvidence.guardReports,
          ...production.guardEvidence.reports,
          production.outerGuard,
        ]);
        const claimIdentity = validateReleaseWorkClaim(releaseClaim);
        const releaseArtifactByKey = new Map(releaseInputs.artifacts.map((entry) => [entry.key, entry.snapshot]));
        const boundReleaseArtifactSha256 = (key) => {
          const artifact = releaseArtifactByKey.get(key);
          if (!artifact) throw new Error(`release cross-binding artifact is absent: ${key}`);
          return requireSha256(artifact.sha256, `release cross-binding ${key} SHA-256`);
        };
        const bindings = {
          source_manifest_sha256: sourceManifest.sha256,
          official_driver_sha256: releaseFixed.officialSha256,
          baseline_driver_sha256: production.validation.expected.baselineDriverSha256,
          allocator_sha256: production.validation.expected.officialIdentity.allocatorSha256,
          certification_sha256: production.validation.expected.officialIdentity.certificationSha256,
          backend2_version_manifest_sha256: boundReleaseArtifactSha256("backend2VersionManifest"),
          official_build_receipt_sha256: releaseInputs.officialDriverBuild.receiptSha256,
          official_compiler_report_sha256: releaseInputs.officialDriverBuild.compilerReportSha256,
          official_build_guard_sha256: releaseInputs.officialDriverBuild.guardSha256,
          official_source_bundle_cid: releaseInputs.officialDriverBuild.sourceBundleCid,
          official_entry_source_cid: releaseInputs.officialDriverBuild.entrySourceCid,
          official_compile_receipt_cid: releaseInputs.officialDriverBuild.compileReceiptCid,
          official_compiler_output_receipt_cid: releaseInputs.officialDriverBuild.compilerOutputReceiptCid,
          official_workspace_source_manifest_sha256: releaseInputs.officialDriverBuild.workspaceSourceManifestSha256,
          official_build_seed_sha256: releaseInputs.officialDriverBuild.seedSha256,
          execution_stage_policy_sha256: releaseInputs.executionStageReceipt.policySha256,
          execution_stage_receipt_sha256: releaseInputs.executionStageReceipt.receiptSha256,
          execution_identity_sha256: releaseInputs.executionStageReceipt.executionRaw32,
          execution_stage_root_sha256: releaseInputs.executionStageReceipt.sevenStageRootRaw32,
          jobs_lock_sha256: boundReleaseArtifactSha256("jobsLock"),
          exec_diff_lock_sha256: boundReleaseArtifactSha256("execDiffLock"),
          target_emit_lock_sha256: boundReleaseArtifactSha256("targetEmitLock"),
          gen3_lock_sha256: boundReleaseArtifactSha256("gen3Lock"),
          production_perf_raw_sha256: production.perfEvidence.pairsSha256,
          production_perf_verdict_sha256: production.perfEvidence.verdictSha256,
          production_compile_raw_sha256: production.compileEvidence.pairsSha256,
          production_compile_verdict_sha256: production.compileEvidence.verdictSha256,
          production_receipt_sha256: production.receiptEvidence.receiptSha256,
          production_object_sha256: production.receiptEvidence.objectSha256,
          guard_set_sha256: guardSet.guardSetSha256,
          exec_final_sha256: production.execBundleEvidence.identitySha256,
          claim_sha256: claimIdentity.sha256,
          private_runtime_bundle_sha256: privateRuntimeGateBundle.artifactSetSha256,
          source_receipt_set_sha256: releaseSourceGuardSet.receiptSetSha256,
          semantic_pipeline_receipt_sha256: semanticPipelineEvidence.receiptSha256,
          production_report_sha256: production.reportSha256,
          outer_guard_sha256: production.outerGuard.sha256,
        };
        for (const key of FINAL_RELEASE_BINDING_KEYS) requireSha256(bindings[key], `release cross-binding ${key}`);
        checks.push(check("release_cross_bindings", "GREEN", "source/driver/backend2 epoch/four external locks/perf/compile/checksum/guard/exec/claim/runtime identities are bound into one exact release tuple", {requiredForRelease: true, pathsRetained: true, bindings, guardReportCount: guardSet.guardReportCount}));
      } catch (error) {
        checks.push(check("release_cross_bindings", "CFAIL", error instanceof Error ? error.message : String(error), {requiredForRelease: true, pathsRetained: true}));
      }
    } else {
      checks.push(check("release_cross_bindings", "RED", "release cross-bindings require every pre-final source/runtime/production check to be GREEN", {requiredForRelease: true, heavyChildStarted: false}));
    }
    checks.push(check("final_release_artifact_manifest", "RED", "the frozen recursive artifact manifest is produced only by the second private one-shot finalizer after the outer worker guard closes", {requiredForRelease: true, pathsRetained: true, heavyChildStarted: false}));
  }
  return finish();
}

function oneShotFailureResult(input, root, reason, extraChecks = []) {
  return result("release", root || null, null, [
    ...extraChecks,
    check("release_one_shot_worker", "CFAIL", reason, {requiredForRelease: true, heavyChildStarted: false}),
  ]);
}

function adoptFinalizedOuterClaim(claim) {
  const snapshot = exactFdSnapshot(claim.fd, "outer held finalized release claim", 65536);
  const pattern = new RegExp(`^schema=cheng_regalloc_release_claim\\nrun_id=${claim.runId}\\ninput_sha256=([0-9a-f]{64})\\n$`);
  const match = snapshot.raw.toString("utf8").match(pattern);
  const initialRaw = Buffer.from(`schema=cheng_regalloc_release_claim\nrun_id=${claim.runId}\n`, "utf8");
  if (!match && !snapshot.raw.equals(initialRaw)) throw new Error("one-shot worker did not preserve or finalize the exact held release claim");
  claim.expectedRaw = snapshot.raw;
  claim.expectedStat = snapshot.stat;
  claim.inputSha256 = match?.[1] || null;
  claim.finalized = Boolean(match);
  return validateReleaseWorkClaim(claim);
}

function finalizerStageOneReady(report) {
  const cross = report?.checks?.find((entry) => entry.id === "release_cross_bindings");
  const finalManifest = report?.checks?.find((entry) => entry.id === "final_release_artifact_manifest");
  return report?.schema === "cheng_regalloc_preflight" && report.mode === "release" && report.verdict === "RED" &&
    releasePreFinalChecksGreen(report.checks) && cross?.status === "GREEN" && finalManifest?.status === "RED" &&
    report.checks.filter((entry) => entry.id !== "final_release_artifact_manifest").every((entry) => entry.status !== "CFAIL");
}

function validateFinalizerClaim(root, identity) {
  const rootStat = lstatSync(root, {bigint: true});
  const expectedRootStat = statIdentityValue({
    dev: identity.rootDevice, ino: identity.rootInode, size: identity.rootSize, mode: identity.rootMode,
    nlink: identity.rootNlink, mtimeNs: identity.rootMtimeNs, ctimeNs: identity.rootCtimeNs,
  }, "finalizer release root identity");
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !sameStat(rootStat, expectedRootStat)) throw new Error("finalizer release root identity mismatch");
  const path = canonicalAbsolute(identity.path, "finalizer release claim", "file");
  if (dirname(path) !== root || basename(path) !== ".cheng-regalloc-preflight.claim") throw new Error("finalizer release claim path mismatch");
  const snapshot = stableSnapshot(path, "finalizer release claim", 65536);
  const stat = statIdentityValue({dev: identity.device, ino: identity.inode, size: identity.size, mode: identity.mode, nlink: identity.nlink, mtimeNs: identity.mtimeNs, ctimeNs: identity.ctimeNs}, "finalizer release claim identity");
  if (snapshot.sha256 !== identity.sha256 || !sameStat(snapshot.stat, stat) || snapshot.stat.nlink !== 1n || identity.finalized !== true) throw new Error("finalizer release claim identity mismatch");
  return snapshot;
}

function finalizerBoundSnapshot(pathValue, expectedSha256, label, allowEmpty = false) {
  const snapshot = stableSnapshot(canonicalAbsolute(pathValue, label, "file", false, allowEmpty), label, 512 * 1024 * 1024, allowEmpty);
  if (snapshot.sha256 !== requireSha256(expectedSha256, `${label} expected SHA-256`)) throw new Error(`${label} changed before finalization`);
  return snapshot;
}

async function revalidateFinalizerReleaseEvidence(context, stageOneReport, cross) {
  const sourceRoot = canonicalAbsolute(context.baseContext.input.treeRoot, "finalizer Cheng source root", "dir");
  const releaseRoot = canonicalAbsolute(context.releaseWorkRoot, "finalizer release evidence root", "dir");
  const releaseInputs = validateReleaseEvidenceInputs(sourceRoot, context.baseContext.input, {allowPopulatedReleaseWorkRoot: true});
  const releaseInputCheck = stageOneReport.checks.find((entry) => entry.id === "release_evidence_inputs");
  if (releaseInputCheck?.status !== "GREEN" || releaseInputCheck.artifact_sha256 !== releaseInputs.sha256) throw new Error("finalizer release input tuple changed after stage one");
  const fixed = rawDriverFixedPoint(releaseInputs.driverPaths.gen2Driver, releaseInputs.driverPaths.gen3Driver, releaseInputs.driverPaths.officialDriver);
  if (!fixed.identical || fixed.officialSha256 !== cross.bindings.official_driver_sha256) throw new Error("finalizer raw GEN2/GEN3/official fixed point changed");

  const artifacts = new Map(releaseInputs.artifacts.map((entry) => [entry.key, entry.snapshot]));
  for (const [key, bindingKey] of [
    ["officialBuildReceipt", "official_build_receipt_sha256"],
    ["executionStagePolicy", "execution_stage_policy_sha256"],
    ["backend2VersionManifest", "backend2_version_manifest_sha256"],
    ["jobsLock", "jobs_lock_sha256"],
    ["execDiffLock", "exec_diff_lock_sha256"],
    ["targetEmitLock", "target_emit_lock_sha256"],
    ["gen3Lock", "gen3_lock_sha256"],
  ]) {
    const artifact = artifacts.get(key);
    if (!artifact || artifact.sha256 !== cross.bindings[bindingKey]) throw new Error(`finalizer direct release binding changed: ${bindingKey}`);
  }
  for (const [field, bindingKey] of [
    ["receiptSha256", "execution_stage_receipt_sha256"],
    ["executionRaw32", "execution_identity_sha256"],
    ["sevenStageRootRaw32", "execution_stage_root_sha256"],
  ]) if (releaseInputs.executionStageReceipt[field] !== cross.bindings[bindingKey]) throw new Error(`finalizer seven-stage execution binding changed: ${bindingKey}`);
  if (releaseInputs.backend2VersionManifest.manifestSha256 !== cross.bindings.backend2_version_manifest_sha256) throw new Error("finalizer backend2 epoch binding changed");
  for (const [field, bindingKey] of [
    ["compilerReportSha256", "official_compiler_report_sha256"], ["guardSha256", "official_build_guard_sha256"],
    ["sourceBundleCid", "official_source_bundle_cid"], ["entrySourceCid", "official_entry_source_cid"],
    ["compileReceiptCid", "official_compile_receipt_cid"], ["compilerOutputReceiptCid", "official_compiler_output_receipt_cid"],
    ["workspaceSourceManifestSha256", "official_workspace_source_manifest_sha256"],
    ["seedSha256", "official_build_seed_sha256"],
  ]) if (releaseInputs.officialDriverBuild[field] !== cross.bindings[bindingKey]) throw new Error(`finalizer official build binding changed: ${bindingKey}`);

  const productionCheck = stageOneReport.checks.find((entry) => entry.id === "production_gate_report");
  if (productionCheck?.status !== "GREEN" || productionCheck.reportSha256 !== cross.bindings.production_report_sha256) throw new Error("finalizer production report binding is unavailable");
  const productionReport = finalizerBoundSnapshot(productionCheck.reportPath, productionCheck.reportSha256, "finalizer production report");
  const {rows: productionRows} = parseUniqueUnhashedKv(productionReport.raw, "finalizer production report");
  const productionWorkDir = canonicalAbsolute(dirname(productionReport.path), "finalizer production work directory", "dir");
  const directProductionArtifacts = [
    ["perf_raw_samples_path", "perf_raw_samples_sha256", "production_perf_raw_sha256", "finalizer production perf raw samples"],
    ["perf_pair_verdict_path", "perf_pair_verdict_sha256", "production_perf_verdict_sha256", "finalizer production perf verdict"],
    ["compile_raw_samples_path", "compile_raw_samples_sha256", "production_compile_raw_sha256", "finalizer production compile raw samples"],
    ["compile_pair_verdict_path", "compile_pair_verdict_sha256", "production_compile_verdict_sha256", "finalizer production compile verdict"],
  ];
  const productionArtifacts = [];
  for (const [pathKey, shaKey, bindingKey, label] of directProductionArtifacts) {
    const artifact = boundWorkSnapshot(productionWorkDir, productionRows.get(pathKey), productionRows.get(shaKey), label, false, 512 * 1024 * 1024);
    if (artifact.sha256 !== cross.bindings[bindingKey]) throw new Error(`${label} direct binding changed`);
    productionArtifacts.push({label, path: artifact.path, sha256: artifact.sha256});
  }
  const receiptCheck = stageOneReport.checks.find((entry) => entry.id === "production_artifacts");
  if (receiptCheck?.status !== "GREEN") throw new Error("finalizer production receipt evidence is unavailable");
  for (const [pathKey, shaKey, bindingKey, label] of [
    ["receiptPath", "receiptSha256", "production_receipt_sha256", "finalizer production receipt"],
    ["objectPath", "objectSha256", "production_object_sha256", "finalizer production object"],
  ]) {
    const artifact = finalizerBoundSnapshot(receiptCheck[pathKey], receiptCheck[shaKey], label);
    if (artifact.sha256 !== cross.bindings[bindingKey]) throw new Error(`${label} direct binding changed`);
    productionArtifacts.push({label, path: artifact.path, sha256: artifact.sha256});
  }

  const revalidationDirectory = join(releaseRoot, "finalizer-external-lock-revalidation");
  mkdirSync(revalidationDirectory, {mode: 0o700});
  const home = join(revalidationDirectory, "home");
  const temp = join(revalidationDirectory, "tmp");
  mkdirSync(home, {mode: 0o700});
  mkdirSync(temp, {mode: 0o700});
  const guard = canonicalAbsolute(join(releaseRoot, "private-exec-bundle/beat_c_process_group_guard.sh"), "finalizer private process-tree guard", "file", true);
  const validator = canonicalAbsolute(join(releaseRoot, "private-exec-bundle/regalloc_external_lock_validator.py"), "finalizer private external-lock validator", "file");
  const pythonRuntime = validatePrivatePythonRuntime(context.baseContext.privatePythonRuntime);
  const python = canonicalAbsolute(join(pythonRuntime.root, "bin/python3"), "finalizer private Python", "file", true);
  const identity = canonicalAbsolute(join(productionWorkDir, "official.identity.txt"), "finalizer official production identity", "file");
  const sentinel = canonicalAbsolute(join(sourceRoot, "tools/backend2_version_sentinel.sh"), "finalizer backend2 version sentinel", "file", true);
  const sentinelTag = "backend2-version-sentinel";
  const sentinelGuardPath = join(revalidationDirectory, `${sentinelTag}.guard.txt`);
  const sentinelStdoutPath = join(revalidationDirectory, `${sentinelTag}.stdout.txt`);
  const sentinelStderrPath = join(revalidationDirectory, `${sentinelTag}.stderr.txt`);
  const sentinelTimeoutSeconds = 300;
  const sentinelCommand = [
    "/usr/bin/env", "-i", `PATH=${pythonRuntime.bin}:/usr/bin:/bin`, `HOME=${home}`, `TMPDIR=${temp}`,
    "LANG=C", "LC_ALL=C", "TZ=UTC", "PYTHONDONTWRITEBYTECODE=1", "PYTHONNOUSERSITE=1", "PYTHONSAFEPATH=1", sentinel,
  ];
  const sentinelRun = await runChengDriver(guard, [
    `--rss-limit:${DEFAULT_RSS_CAP_BYTES}`, `--timeout:${sentinelTimeoutSeconds}`, "--startup-timeout:5", "--cleanup-timeout:20",
    `--report-out:${sentinelGuardPath}`, `--stdout:${sentinelStdoutPath}`, `--stderr:${sentinelStderrPath}`, "--", ...sentinelCommand,
  ], {
    root: sourceRoot, cwd: sourceRoot, exactGuardOwnsTimeoutAndCleanup: true,
    hardRssCapBytes: DEFAULT_RSS_CAP_BYTES, maxBuffer: DEFAULT_MAX_OUTPUT_BYTES,
    env: {PATH: `${pythonRuntime.bin}:/usr/bin:/bin`, HOME: home, TMPDIR: temp, LANG: "C", LC_ALL: "C", TZ: "UTC", PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", PYTHONSAFEPATH: "1"},
  });
  if (!processSucceeded(sentinelRun) || sentinelRun.stdoutBuffer?.length !== 0 || sentinelRun.stderrBuffer?.length !== 0) throw new Error("finalizer backend2 version sentinel failed");
  const sentinelGuard = validateProductionGuardReport(revalidationDirectory, sentinelGuardPath, {expectedRc: 0, expectedTimeoutSeconds: sentinelTimeoutSeconds, expectedStartupTimeoutSeconds: 5, expectedCleanupTimeoutSeconds: 20});
  const sentinelStdout = finalizerBoundSnapshot(sentinelStdoutPath, sentinelGuard.stdoutSha256, "finalizer backend2 version sentinel stdout");
  const sentinelStderr = finalizerBoundSnapshot(sentinelStderrPath, sentinelGuard.stderrSha256, "finalizer backend2 version sentinel stderr", true);
  if (sentinelStderr.raw.length !== 0) throw new Error("finalizer backend2 version sentinel emitted stderr");
  const sentinelEvidence = validateBackend2VersionSentinelReport(sentinelStdout, releaseInputs.backend2VersionManifest);
  const lockSpecs = [
    ["jobs_determinism", artifacts.get("jobsLock")],
    ["exec_diff", artifacts.get("execDiffLock")],
    ["target_emit_hard_fail", artifacts.get("targetEmitLock")],
    ["gen3_fixed_point", artifacts.get("gen3Lock")],
  ];
  const reports = [];
  const timeoutSeconds = 300;
  for (const [kind, lock] of lockSpecs) {
    if (!lock) throw new Error(`finalizer external lock is absent: ${kind}`);
    const tag = `external-lock.${kind}`;
    const reportPath = join(revalidationDirectory, `${tag}.guard.txt`);
    const stdoutPath = join(revalidationDirectory, `${tag}.stdout.txt`);
    const stderrPath = join(revalidationDirectory, `${tag}.stderr.txt`);
    const command = [
      "/usr/bin/env", "-i", `PATH=${pythonRuntime.bin}:/usr/bin:/bin`, `HOME=${home}`, `TMPDIR=${temp}`,
      "LANG=C", "LC_ALL=C", "TZ=UTC", "PYTHONDONTWRITEBYTECODE=1", "PYTHONNOUSERSITE=1", "PYTHONSAFEPATH=1",
      python, validator, "--kind", kind, "--lock", lock.path, "--expected-sha256", lock.sha256,
      "--identity", identity, "--workspace-root", sourceRoot, "--max-validity-seconds", String(EXTERNAL_LOCK_MAX_VALIDITY_SECONDS),
    ];
    const guardArgs = [
      `--rss-limit:${DEFAULT_RSS_CAP_BYTES}`, `--timeout:${timeoutSeconds}`, "--startup-timeout:5", "--cleanup-timeout:20",
      `--report-out:${reportPath}`, `--stdout:${stdoutPath}`, `--stderr:${stderrPath}`, "--", ...command,
    ];
    const run = await runChengDriver(guard, guardArgs, {
      root: sourceRoot, cwd: sourceRoot, exactGuardOwnsTimeoutAndCleanup: true,
      hardRssCapBytes: DEFAULT_RSS_CAP_BYTES, maxBuffer: DEFAULT_MAX_OUTPUT_BYTES,
      env: {PATH: `${pythonRuntime.bin}:/usr/bin:/bin`, HOME: home, TMPDIR: temp, LANG: "C", LC_ALL: "C", TZ: "UTC", PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", PYTHONSAFEPATH: "1"},
    });
    if (!processSucceeded(run) || run.stdoutBuffer?.length !== 0 || run.stderrBuffer?.length !== 0) throw new Error(`finalizer external-lock validator failed: ${kind}`);
    const guardEvidence = validateProductionGuardReport(revalidationDirectory, reportPath, {expectedRc: 0, expectedTimeoutSeconds: timeoutSeconds, expectedStartupTimeoutSeconds: 5, expectedCleanupTimeoutSeconds: 20});
    const stdout = finalizerBoundSnapshot(stdoutPath, guardEvidence.stdoutSha256, `finalizer ${kind} validator stdout`);
    const stderr = finalizerBoundSnapshot(stderrPath, guardEvidence.stderrSha256, `finalizer ${kind} validator stderr`, true);
    if (stderr.raw.length !== 0) throw new Error(`finalizer external-lock validator emitted stderr: ${kind}`);
    const text = stdout.raw.toString("utf8");
    if (!text.endsWith("\n") || !text.startsWith(`status=recomputed kind=${kind} lock_sha256=${lock.sha256} `) || text.slice(0, -1).includes("\n")) throw new Error(`finalizer external-lock validator output contract mismatch: ${kind}`);
    reports.push({kind, lockPath: lock.path, lockSha256: lock.sha256, guard: guardEvidence, stdoutSha256: stdout.sha256, stderrSha256: stderr.sha256});
  }
  const receiptFields = [
    ["schema", "cheng_regalloc_finalizer_external_lock_revalidation"], ["status", "proved"],
    ["release_input_sha256", releaseInputs.sha256], ["backend2_version_manifest_sha256", releaseInputs.backend2VersionManifest.manifestSha256],
    ["official_build_receipt_sha256", releaseInputs.officialDriverBuild.receiptSha256],
    ["official_compiler_output_receipt_cid", releaseInputs.officialDriverBuild.compilerOutputReceiptCid],
    ["execution_stage_policy_sha256", releaseInputs.executionStageReceipt.policySha256],
    ["execution_stage_receipt_sha256", releaseInputs.executionStageReceipt.receiptSha256],
    ["execution_identity_sha256", releaseInputs.executionStageReceipt.executionRaw32],
    ["execution_stage_root_sha256", releaseInputs.executionStageReceipt.sevenStageRootRaw32],
    ["backend2_sentinel_guard_sha256", sentinelGuard.sha256], ["backend2_sentinel_stdout_sha256", sentinelStdout.sha256],
    ["backend2_sentinel_stderr_sha256", sentinelStderr.sha256], ["backend2_sources_sha256", sentinelEvidence.sourcesSha256],
    ["report_count", reports.length],
  ];
  for (let index = 0; index < reports.length; index++) {
    const entry = reports[index];
    receiptFields.push(
      [`lock.${index}.kind`, entry.kind], [`lock.${index}.sha256`, entry.lockSha256],
      [`lock.${index}.guard_path`, entry.guard.path], [`lock.${index}.guard_sha256`, entry.guard.sha256],
      [`lock.${index}.stdout_sha256`, entry.stdoutSha256], [`lock.${index}.stderr_sha256`, entry.stderrSha256],
    );
  }
  for (let index = 0; index < productionArtifacts.length; index++) receiptFields.push(
    [`production.${index}.label`, productionArtifacts[index].label], [`production.${index}.path`, productionArtifacts[index].path], [`production.${index}.sha256`, productionArtifacts[index].sha256],
  );
  receiptFields.push(["production_artifact_count", productionArtifacts.length]);
  const receipt = writeExclusiveSnapshot(join(revalidationDirectory, "receipt.txt"), renderHashedKv(receiptFields, "receipt_payload_sha256"), "finalizer external-lock revalidation receipt");
  fsyncDirectory(revalidationDirectory);
  fsyncDirectory(releaseRoot);
  return {schema: "cheng_regalloc_finalizer_external_lock_revalidation", releaseInputSha256: releaseInputs.sha256, backend2VersionManifest: releaseInputs.backend2VersionManifest, backend2VersionSentinel: {evidence: sentinelEvidence, guard: sentinelGuard, stdoutSha256: sentinelStdout.sha256, stderrSha256: sentinelStderr.sha256}, productionArtifacts, directory: revalidationDirectory, reportCount: reports.length, reports, receiptPath: receipt.path, receiptSha256: receipt.sha256};
}

async function runOneShotFinalizerEntrypoint() {
  const requestPath = canonicalAbsolute(process.env.CHENG_REGALLOC_ONE_SHOT_FINALIZER_REQUEST, "one-shot finalizer request", "file");
  const request = stableSnapshot(requestPath, "one-shot finalizer request", 256 * 1024 * 1024);
  if (request.sha256 !== requireSha256(process.env.CHENG_REGALLOC_ONE_SHOT_FINALIZER_REQUEST_SHA256, "one-shot finalizer request SHA-256")) throw new Error("one-shot finalizer request SHA-256 mismatch");
  let context;
  try { context = JSON.parse(request.raw.toString("utf8")); }
  catch (error) { throw new Error(`one-shot finalizer request JSON is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  if (context.schema !== "cheng_regalloc_one_shot_finalizer_request" || context.requestPath !== requestPath || context.token !== process.env.CHENG_REGALLOC_ONE_SHOT_FINALIZER_TOKEN) throw new Error("one-shot finalizer request token/path/schema mismatch");
  const invokedPath = canonicalAbsolute(realpathSync.native(process.argv[1]), "one-shot finalizer invoked module", "file", true);
  if (pathToFileURL(invokedPath).href !== import.meta.url || invokedPath !== context.baseContext.module.path) throw new Error("one-shot finalizer did not directly invoke the unique private module");
  validateOneShotWorkerContext(context.baseContext, context.baseRequest);
  const root = canonicalAbsolute(context.releaseWorkRoot, "finalizer release root", "dir");
  const claim = validateFinalizerClaim(root, context.claimIdentity);
  const stageOneGuard = exactIdentitySnapshot(context.stageOneGuard, "stage-one outer worker guard");
  const stageOneStdout = exactIdentitySnapshot(context.stageOneStreams?.stdout, "stage-one outer worker stdout", false, true);
  const stageOneStderr = exactIdentitySnapshot(context.stageOneStreams?.stderr, "stage-one outer worker stderr", false, true);
  const expectedTimeoutSeconds = Math.max(1, Math.ceil(context.baseContext.input.releaseTimeoutSec || DEFAULT_RELEASE_TIMEOUT_SEC));
  const revalidatedStageOneGuard = validateProductionGuardReport(context.baseContext.directory, stageOneGuard.path, {expectedRc: 0, expectedTimeoutSeconds, expectedStartupTimeoutSeconds: 5, expectedCleanupTimeoutSeconds: 20});
  for (const key of ["tag", "path", "sha256", "stdoutPath", "stdoutSha256", "stderrPath", "stderrSha256", "rc", "peakBytes", "sampleCount", "timeoutSeconds"]) {
    if (revalidatedStageOneGuard[key] !== context.stageOneGuardEvidence?.[key]) throw new Error(`stage-one outer worker guard evidence changed: ${key}`);
  }
  if (stageOneStdout.path !== revalidatedStageOneGuard.stdoutPath || stageOneStdout.sha256 !== revalidatedStageOneGuard.stdoutSha256 ||
      stageOneStderr.path !== revalidatedStageOneGuard.stderrPath || stageOneStderr.sha256 !== revalidatedStageOneGuard.stderrSha256) {
    throw new Error("stage-one outer worker stream identity mismatch");
  }
  let stageOneWorkerEnvelope;
  try { stageOneWorkerEnvelope = JSON.parse(stageOneStdout.raw.toString("utf8")); }
  catch (error) { throw new Error(`stage-one outer worker stdout is not exact JSON: ${error instanceof Error ? error.message : String(error)}`); }
  if (stageOneWorkerEnvelope?.schema !== "cheng_regalloc_one_shot_result" || stageOneWorkerEnvelope.token !== context.baseContext.token ||
      stageOneWorkerEnvelope.loadedModuleUrl !== pathToFileURL(context.baseContext.module.path).href || stageOneWorkerEnvelope.report?.schema !== "cheng_regalloc_preflight") {
    throw new Error("stage-one outer worker envelope binding mismatch");
  }
  const reboundOneShotCheck = stageOneWorkerEnvelope.report.checks?.find((entry) => entry.id === "release_one_shot_worker");
  if (!reboundOneShotCheck) throw new Error("stage-one worker report lacks the one-shot identity check");
  Object.assign(reboundOneShotCheck, {outerGuard: context.stageOneGuardEvidence, outerIdentity: context.stageOneOuterIdentity});
  if (JSON.stringify(stageOneWorkerEnvelope.report) !== JSON.stringify(context.stageOneReport)) throw new Error("stage-one finalizer request report does not exactly equal the guard-bound worker report plus outer identities");
  if (!finalizerStageOneReady(context.stageOneReport)) throw new Error("stage-one report is not exactly ready for private finalization");
  const cross = context.stageOneReport.checks.find((entry) => entry.id === "release_cross_bindings");
  const stageOneClaimIdentity = context.stageOneReport.checks.find((entry) => entry.id === "release_work_claim")?.finalIdentity;
  const bindingKeys = Object.keys(cross.bindings || {}).sort();
  if (bindingKeys.length !== FINAL_RELEASE_BINDING_KEYS.length || bindingKeys.some((key, index) => key !== [...FINAL_RELEASE_BINDING_KEYS].sort()[index])) throw new Error("stage-one release cross-binding key set mismatch");
  if (!sameReleaseClaimIdentity(stageOneClaimIdentity, context.claimIdentity) || cross.bindings.claim_sha256 !== claim.sha256 || stageOneGuard.sha256 !== context.stageOneGuard.sha256) throw new Error("finalizer claim/outer-worker-guard binding mismatch");
  const finalizerRevalidation = await revalidateFinalizerReleaseEvidence(context, context.stageOneReport, cross);
  const evidence = materializeFinalReleaseArtifactManifest(root, cross.bindings);
  const checks = context.stageOneReport.checks;
  const finalCheck = checks.find((entry) => entry.id === "final_release_artifact_manifest");
  finalCheck.status = "GREEN";
  finalCheck.reason = "the second private one-shot worker froze and recursively enumerated the exact retained tree after stage-one guard closure";
  Object.assign(finalCheck, {requiredForRelease: true, pathsRetained: true, ...evidence, stageOneGuardSha256: stageOneGuard.sha256, finalizerRevalidation});
  const finalReport = result("release", context.stageOneReport.tree_root, context.stageOneReport.snapshot_sha256, checks);
  if (finalReport.verdict !== "RELEASE_GREEN") throw new Error("private finalizer could not reproduce RELEASE_GREEN from the frozen artifact tree");
  process.stdout.write(`${JSON.stringify({schema: "cheng_regalloc_one_shot_finalizer_result", token: context.token, loadedModuleUrl: import.meta.url, report: finalReport})}\n`);
}

async function runPrivateOneShotFinalizer(root, input, worker, stageOneReport, claimIdentity, stageOneGuardEvidence, stageOneStreams, stageOneOuterIdentity, unsetEnv) {
  if (!finalizerStageOneReady(stageOneReport) || claimIdentity.finalized !== true) throw new Error("stage-one result is not eligible for private finalization");
  const token = randomBytes(24).toString("hex");
  const stageOneGuardSnapshot = stableSnapshot(stageOneGuardEvidence.path, "stage-one outer worker guard", 4 * 1024 * 1024);
  if (stageOneGuardSnapshot.sha256 !== stageOneGuardEvidence.sha256) throw new Error("stage-one outer worker guard changed before finalization");
  const requestPath = join(worker.directory, "finalizer-request.json");
  const context = {
    schema: "cheng_regalloc_one_shot_finalizer_request",
    token,
    requestPath,
    releaseWorkRoot: worker.context.releaseWorkRoot,
    baseContext: worker.context,
    baseRequest: oneShotIdentity(worker.request),
    stageOneReport,
    claimIdentity,
    stageOneGuard: oneShotIdentity(stageOneGuardSnapshot),
    stageOneGuardEvidence,
    stageOneStreams,
    stageOneOuterIdentity,
  };
  const request = writeExclusiveSnapshot(requestPath, Buffer.from(`${JSON.stringify(context)}\n`, "utf8"), "one-shot finalizer request");
  const requestFd = openSync(request.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  worker.held.set("finalizerRequest", requestFd);
  fsyncDirectory(worker.directory);
  fsyncDirectory(worker.context.releaseWorkRoot);

  const guardDirectoryPath = join(dirname(worker.context.releaseWorkRoot), `.${basename(worker.context.releaseWorkRoot)}.m9022-finalizer-${token}`);
  mkdirSync(guardDirectoryPath, {mode: 0o700});
  const guardDirectory = canonicalAbsolute(guardDirectoryPath, "one-shot finalizer guard directory", "dir");
  const reportPath = join(guardDirectory, "finalizer.guard.txt");
  const stdoutPath = join(guardDirectory, "finalizer.stdout.txt");
  const stderrPath = join(guardDirectory, "finalizer.stderr.txt");
  const timeoutSeconds = Math.max(1, Math.ceil(input.releaseTimeoutSec || DEFAULT_RELEASE_TIMEOUT_SEC));
  const guardArgs = [
    `--rss-limit:${DEFAULT_RSS_CAP_BYTES}`, `--timeout:${timeoutSeconds}`, "--startup-timeout:5", "--cleanup-timeout:20",
    `--report-out:${reportPath}`, `--stdout:${stdoutPath}`, `--stderr:${stderrPath}`, "--", worker.context.bun.path, worker.context.module.path,
  ];
  const guarded = await runChengDriver(worker.context.guard.path, guardArgs, {
    root,
    cwd: root,
    maxBuffer: input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES,
    exactGuardOwnsTimeoutAndCleanup: true,
    hardRssCapBytes: DEFAULT_RSS_CAP_BYTES,
    unsetEnv,
    env: {
      ...worker.context.executionEnv,
      CHENG_REGALLOC_ONE_SHOT_FINALIZER_REQUEST: request.path,
      CHENG_REGALLOC_ONE_SHOT_FINALIZER_REQUEST_SHA256: request.sha256,
      CHENG_REGALLOC_ONE_SHOT_FINALIZER_TOKEN: token,
    },
  });
  if (!processSucceeded(guarded) || guarded.stdoutBuffer?.length !== 0 || guarded.stderrBuffer?.length !== 0) throw new Error(`one-shot finalizer guard failed rc=${guarded.exitCode}: ${takeTrailingText(guarded.stderr, 4000)}`);
  const guardEvidence = validateProductionGuardReport(guardDirectory, reportPath, {expectedRc: 0, expectedTimeoutSeconds: timeoutSeconds, expectedStartupTimeoutSeconds: 5, expectedCleanupTimeoutSeconds: 20});
  const stdout = stableSnapshot(stdoutPath, "one-shot finalizer stdout", input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES);
  const stderr = stableSnapshot(stderrPath, "one-shot finalizer stderr", input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES, true);
  if (stderr.raw.length !== 0) throw new Error(`one-shot finalizer emitted stderr: ${takeTrailingText(stderr.raw.toString("utf8"), 4000)}`);
  let envelope;
  try { envelope = JSON.parse(stdout.raw.toString("utf8")); }
  catch (error) { throw new Error(`one-shot finalizer stdout is not exact JSON: ${error instanceof Error ? error.message : String(error)}`); }
  if (envelope?.schema !== "cheng_regalloc_one_shot_finalizer_result" || envelope.token !== token || envelope.loadedModuleUrl !== pathToFileURL(worker.context.module.path).href || envelope.report?.verdict !== "RELEASE_GREEN") throw new Error("one-shot finalizer result envelope mismatch");
  const cross = envelope.report.checks.find((entry) => entry.id === "release_cross_bindings");
  const finalCheck = envelope.report.checks.find((entry) => entry.id === "final_release_artifact_manifest");
  if (cross?.status !== "GREEN" || finalCheck?.status !== "GREEN") throw new Error("one-shot finalizer did not return GREEN cross-bindings and recursive manifest");
  exactPathHeldFdIdentity(request.path, requestFd, request, "one-shot finalizer request");
  validateHeldOneShotReleaseWorker(worker);
  const finalEntries = readdirSync(guardDirectory, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name));
  const expectedFinalEntries = [basename(reportPath), basename(stderrPath), basename(stdoutPath)].sort();
  if (finalEntries.length !== expectedFinalEntries.length || finalEntries.some((entry, index) => !entry.isFile() || entry.isSymbolicLink() || entry.name !== expectedFinalEntries[index])) throw new Error("one-shot finalizer guard directory exact artifact set changed");
  const finalGuardEvidence = validateProductionGuardReport(guardDirectory, reportPath, {expectedRc: 0, expectedTimeoutSeconds: timeoutSeconds, expectedStartupTimeoutSeconds: 5, expectedCleanupTimeoutSeconds: 20});
  for (const key of ["tag", "path", "sha256", "stdoutPath", "stdoutSha256", "stderrPath", "stderrSha256", "rc", "peakBytes", "sampleCount", "timeoutSeconds"]) {
    if (finalGuardEvidence[key] !== guardEvidence[key]) throw new Error(`one-shot finalizer guard evidence changed: ${key}`);
  }
  const finalStdout = stableSnapshot(stdoutPath, "one-shot finalizer stdout final", input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES);
  const finalStderr = stableSnapshot(stderrPath, "one-shot finalizer stderr final", input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES, true);
  if (finalStdout.sha256 !== stdout.sha256 || !sameStat(finalStdout.stat, stdout.stat) || finalStderr.sha256 !== stderr.sha256 || !sameStat(finalStderr.stat, stderr.stat)) throw new Error("one-shot finalizer stream identity changed");
  validateFinalReleaseArtifactManifest(worker.context.releaseWorkRoot, finalCheck.manifestPath, finalCheck.manifestSha256, cross.bindings);
  Object.assign(finalCheck, {finalizerGuard: guardEvidence, finalizerGuardDirectory: guardDirectory});
  return envelope.report;
}

async function executePreflight(input) {
  if (input.mode !== "release" || !input.sourceManifest || !input.releaseWorkRoot || (input.rssCapBytes ?? DEFAULT_RSS_CAP_BYTES) !== DEFAULT_RSS_CAP_BYTES) {
    return executePreflightOwned(input, null);
  }
  let root = null;
  let claim = null;
  let worker = null;
  const earlyChecks = [];
  try {
    root = canonicalAbsolute(input.treeRoot, "treeRoot", "dir");
    claim = acquireReleaseWorkClaim(root, input);
    earlyChecks.push(check("release_work_claim", "GREEN", "outer one-shot orchestrator holds the exclusive release root and claim fds", {requiredForRelease: true, releaseWorkRoot: claim.workRoot, claimPath: claim.path, runId: claim.runId}));
    const sourceManifestPath = canonicalAbsolute(input.sourceManifest, "sourceManifest", "file");
    const sourceManifest = validateSourceManifestPath(root, sourceManifestPath);
    const memoryManifestPath = input.memoryManifest ? canonicalAbsolute(input.memoryManifest, "memoryManifest", "file") : null;
    const sourceInputs = snapshotSourceInputs(root, {sourceManifest: sourceManifestPath, sourceManifestRelativePaths: sourceManifest.relativePaths, memoryManifest: memoryManifestPath});
    worker = await materializeOneShotReleaseWorker(root, input, claim, sourceManifest, sourceInputs);
    const reportPath = join(worker.directory, "worker.guard.txt");
    const stdoutPath = join(worker.directory, "worker.stdout.txt");
    const stderrPath = join(worker.directory, "worker.stderr.txt");
    const timeoutSeconds = Math.max(1, Math.ceil(input.releaseTimeoutSec || DEFAULT_RELEASE_TIMEOUT_SEC));
    const unsetEnv = Object.keys(process.env).sort();
    const guardArgs = [
      `--rss-limit:${DEFAULT_RSS_CAP_BYTES}`, `--timeout:${timeoutSeconds}`, "--startup-timeout:5", "--cleanup-timeout:20",
      `--report-out:${reportPath}`, `--stdout:${stdoutPath}`, `--stderr:${stderrPath}`, "--", worker.context.bun.path, worker.context.module.path,
    ];
    const guarded = await runChengDriver(worker.context.guard.path, guardArgs, {
      root,
      cwd: root,
      maxBuffer: input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES,
      exactGuardOwnsTimeoutAndCleanup: true,
      hardRssCapBytes: DEFAULT_RSS_CAP_BYTES,
      unsetEnv,
      env: {
        ...worker.context.executionEnv,
        CHENG_REGALLOC_ONE_SHOT_REQUEST: worker.request.path,
        CHENG_REGALLOC_ONE_SHOT_REQUEST_SHA256: worker.request.sha256,
        CHENG_REGALLOC_ONE_SHOT_TOKEN: worker.context.token,
      },
    });
    if (!processSucceeded(guarded) || guarded.stdoutBuffer?.length !== 0 || guarded.stderrBuffer?.length !== 0) throw new Error(`one-shot process-tree guard failed rc=${guarded.exitCode}: ${takeTrailingText(guarded.stderr, 4000)}`);
    const guardEvidence = validateProductionGuardReport(worker.directory, reportPath, {expectedRc: 0, expectedTimeoutSeconds: timeoutSeconds, expectedStartupTimeoutSeconds: 5, expectedCleanupTimeoutSeconds: 20});
    const stdout = stableSnapshot(stdoutPath, "one-shot worker stdout", input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES);
    const stderr = stableSnapshot(stderrPath, "one-shot worker stderr", input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES, true);
    if (stderr.raw.length !== 0) throw new Error(`one-shot worker emitted stderr: ${takeTrailingText(stderr.raw.toString("utf8"), 4000)}`);
    let envelope;
    try { envelope = JSON.parse(stdout.raw.toString("utf8")); }
    catch (error) { throw new Error(`one-shot worker stdout is not exact JSON: ${error instanceof Error ? error.message : String(error)}`); }
    if (envelope?.schema !== "cheng_regalloc_one_shot_result" || envelope.token !== worker.context.token || envelope.loadedModuleUrl !== pathToFileURL(worker.context.module.path).href || envelope.report?.schema !== "cheng_regalloc_preflight" || envelope.report.mode !== "release") {
      throw new Error("one-shot worker result envelope binding mismatch");
    }
    const outerIdentity = validateHeldOneShotReleaseWorker(worker);
    const claimIdentity = adoptFinalizedOuterClaim(claim);
    const oneShotCheck = envelope.report.checks?.find((entry) => entry.id === "release_one_shot_worker");
    const workerClaimCheck = envelope.report.checks?.find((entry) => entry.id === "release_work_claim");
    if (!oneShotCheck || oneShotCheck.status !== "GREEN" || oneShotCheck.loadedModuleUrl !== envelope.loadedModuleUrl ||
        !sameReleaseClaimIdentity(workerClaimCheck?.finalIdentity, claimIdentity)) {
      throw new Error("one-shot worker report does not bind its loaded module and finalized held claim");
    }
    if (envelope.report.verdict === "RELEASE_GREEN" && claimIdentity.finalized !== true) throw new Error("RELEASE_GREEN requires the one-shot worker to finalize the exact held claim");
    Object.assign(oneShotCheck, {outerGuard: guardEvidence, outerIdentity});
    if (finalizerStageOneReady(envelope.report)) return await runPrivateOneShotFinalizer(root, input, worker, envelope.report, claimIdentity, guardEvidence, {stdout: oneShotIdentity(stdout), stderr: oneShotIdentity(stderr)}, outerIdentity, unsetEnv);
    return envelope.report;
  } catch (error) {
    return oneShotFailureResult(input, root, error instanceof Error ? error.message : String(error), earlyChecks);
  } finally {
    if (worker) closeOneShotReleaseWorker(worker);
    if (claim) closeReleaseWorkClaim(claim);
  }
}

async function runOneShotWorkerEntrypoint() {
  const requestPath = canonicalAbsolute(process.env.CHENG_REGALLOC_ONE_SHOT_REQUEST, "one-shot request", "file");
  const request = stableSnapshot(requestPath, "one-shot request", 64 * 1024 * 1024);
  if (request.sha256 !== requireSha256(process.env.CHENG_REGALLOC_ONE_SHOT_REQUEST_SHA256, "one-shot request SHA-256")) throw new Error("one-shot request SHA-256 mismatch");
  let context;
  try { context = JSON.parse(request.raw.toString("utf8")); }
  catch (error) { throw new Error(`one-shot request JSON is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  if (context.schema !== "cheng_regalloc_one_shot_request" || context.requestPath !== requestPath || context.token !== process.env.CHENG_REGALLOC_ONE_SHOT_TOKEN) throw new Error("one-shot request token/path/schema mismatch");
  const invokedPath = canonicalAbsolute(realpathSync.native(process.argv[1]), "one-shot invoked module", "file", true);
  if (pathToFileURL(invokedPath).href !== import.meta.url || invokedPath !== context.module.path) throw new Error("one-shot Bun did not directly invoke the unique private module");
  const report = await executePreflightOwned(context.input, context);
  process.stdout.write(`${JSON.stringify({schema: "cheng_regalloc_one_shot_result", token: context.token, loadedModuleUrl: import.meta.url, report})}\n`);
}

if (process.env.CHENG_REGALLOC_ONE_SHOT_FINALIZER_REQUEST || process.env.CHENG_REGALLOC_ONE_SHOT_REQUEST) {
  try {
    if (process.env.CHENG_REGALLOC_ONE_SHOT_FINALIZER_REQUEST) await runOneShotFinalizerEntrypoint();
    else await runOneShotWorkerEntrypoint();
  }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 70;
  }
}

var initChengRegallocPreflightModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengRegallocPreflightInputSchema = zodSchema.strictObject({
    mode: zodSchema.enum(["source", "release"]).describe("source proves source contracts only; release additionally requires production identity/artifact evidence."),
    treeRoot: zodSchema.string().min(1).describe("Canonical absolute Cheng source tree."),
    coldDriver: zodSchema.string().min(1).describe("Canonical absolute executable locked driver used for source fixtures."),
    cCompiler: zodSchema.string().min(1).optional().describe("Canonical absolute C compiler. Default /usr/bin/cc."),
    rssCapBytes: zodSchema.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional().describe("Hard target cap used only to reject the memory model. Default 1 GiB."),
    memoryManifest: zodSchema.string().min(1).optional().describe("Canonical cold_bodyir_memory_manifest. Absence is UNPROVEN, never GREEN."),
    sourceManifest: zodSchema.string().min(1).optional().describe("Required in release mode: canonical current regalloc_source_manifest."),
    releaseWorkRoot: zodSchema.string().min(1).optional().describe("Required in release mode: caller-owned canonical empty directory outside Cheng/Fusion; all production evidence is retained here."),
    gen2Driver: zodSchema.string().min(1).optional(),
    gen3Driver: zodSchema.string().min(1).optional(),
    officialDriver: zodSchema.string().min(1).optional(),
    officialManifest: zodSchema.string().min(1).optional().describe("Required in release mode: canonical official production identity manifest."),
    officialManifestSha256: zodSchema.string().regex(/^[0-9a-f]{64}$/).optional(),
    baselineManifest: zodSchema.string().min(1).optional().describe("Required in release mode: canonical immutable baseline identity manifest."),
    baselineManifestSha256: zodSchema.string().regex(/^[0-9a-f]{64}$/).optional(),
    officialBuildReceipt: zodSchema.string().min(1).optional().describe("Required in release mode: sealed current-source compiler build receipt bound to the compiler-produced materialize report."),
    officialBuildReceiptSha256: zodSchema.string().regex(/^[0-9a-f]{64}$/).optional(),
    executionStagePolicy: zodSchema.string().min(1).optional().describe("Required in release mode: canonical external policy pinning the compiler-produced seven-stage receipt and every stage artifact."),
    executionStagePolicySha256: zodSchema.string().regex(/^[0-9a-f]{64}$/).optional(),
    backend2VersionManifest: zodSchema.string().min(1).optional().describe("Required in release mode: current backend2 semantic-closure epoch manifest."),
    backend2VersionManifestSha256: zodSchema.string().regex(/^[0-9a-f]{64}$/).optional(),
    jobsLock: zodSchema.string().min(1).optional().describe("Required in release mode: fresh jobs-determinism external lock."),
    jobsLockSha256: zodSchema.string().regex(/^[0-9a-f]{64}$/).optional(),
    execDiffLock: zodSchema.string().min(1).optional().describe("Required in release mode: fresh exec-diff external lock."),
    execDiffLockSha256: zodSchema.string().regex(/^[0-9a-f]{64}$/).optional(),
    targetEmitLock: zodSchema.string().min(1).optional().describe("Required in release mode: fresh target-emit hard-fail external lock."),
    targetEmitLockSha256: zodSchema.string().regex(/^[0-9a-f]{64}$/).optional(),
    gen3Lock: zodSchema.string().min(1).optional().describe("Required in release mode: fresh GEN3 fixed-point external lock."),
    gen3LockSha256: zodSchema.string().regex(/^[0-9a-f]{64}$/).optional(),
    timeoutSec: zodSchema.number().positive().max(600).optional(),
    releaseTimeoutSec: zodSchema.number().positive().max(DEFAULT_RELEASE_TIMEOUT_SEC).optional().describe("Outer production-gate timeout in release mode. Default/max 3600 seconds."),
    maxOutputBytes: zodSchema.number().int().positive().max(DEFAULT_MAX_OUTPUT_BYTES).optional(),
  });
  ChengRegallocPreflightTool = createChengTextTool({
    name: "cheng_regalloc_preflight",
    searchHint: "strict source and release preflight for regalloc ABI reloc ownership memory artifacts and raw GEN2 GEN3 fixed point",
    inputSchema: chengRegallocPreflightInputSchema,
    description: "Runs every Fusion-owned TypedExpr expression family as an independent real Cheng compile, mechanically binds its formal obligations, keeps frozen module-const metadata as an isolated research diagnostic, requires every realizer to reach canonical read-only TypedExprIr authority, rejects unresolved or ambiguous unqualified exported calls and post-seal source/AnySource/bounded-walker heuristics, runs real regalloc/C contracts, recomputes the cold BodyIR event sweep, pins package/lock/manifests, validates the exact current source closure, and compares full raw GEN2/GEN3/official bytes. Release mode also requires the compiler-produced current-source build receipt, the independently pinned seven-stage execution receipt and backend2 epoch, runs the exact-hash production gate with four pinned external locks, directly binds perf/compile/checksum artifacts, and revalidates the semantic backend2 sentinel plus every external lock under exact 1 GiB guards in the private finalizer. Missing, RED or CFAIL release-critical evidence is an error; research diagnostics remain honest and do not manufacture a release failure.",
    prompt: "Use source mode for early regalloc source readiness and release mode only when strict production manifests and distinct GEN2/GEN3 binaries exist.",
    toAutoClassifierInput: (input) => `regalloc_preflight:${input.mode || "unknown"}`,
    async execute(input) {
      const report = await executePreflight(input);
      if (report.verdict !== "SOURCE_GREEN" && report.verdict !== "RELEASE_GREEN") {
        const error = new Error(`cheng_regalloc_preflight rejected: ${JSON.stringify(report)}`);
        error.code = report.verdict;
        throw error;
      }
      return jsonResult(report);
    },
  });
});

export {
  AARCH64_F64_RUNTIME_GATE_EXTRA_ARTIFACTS,
  AARCH64_F64_RUNTIME_GATE_GUARD_STAGES,
  acquireReleaseWorkClaim,
  ChengRegallocPreflightTool,
  closeReleaseWorkClaim,
  deriveFormalExpressionObligationManifest,
  evaluateFormalExpressionObligationCoverage,
  initChengRegallocPreflightModule,
  executePreflight,
  formalChengCompilerProfile,
  finalizeReleaseWorkClaim,
  buildPrivateOneShotBundle,
  materializeFinalReleaseArtifactManifest,
  materializePrivateOneShotSourceTree,
  materializePrivateReleaseToolchain,
  privateReleaseExecutionEnv,
  rawDriverFixedPoint,
  runSemanticPipelineGate,
  sameSourceInputs,
  snapshotSourceInputs,
  sourceImports,
  strictKv,
  validateAuthorityProductionClosure,
  validateBackend2VersionManifest,
  validateBackend2VersionSentinelReport,
  validateAarch64F64RuntimeGateBundle,
  validateAarch64F64RuntimeGateReport,
  validateX86_64F64RuntimeGateBundle,
  validateX86_64F64RuntimeGateReport,
  validateMemoryManifestBytes,
  validateOfficialDriverBuildReceipt,
  validatePrivateOneShotSourceTree,
  validatePrivateReleaseToolchain,
  validateProductionGateDependencyBundle,
  validateProductionGateEvidence,
  validateProductionGuardReport,
  validateProductionGuardDirectory,
  validateRemovedBackend2IndependentEmitterModules,
  validatePrivateRuntimeGateBundle,
  productionRequiredStatuses,
  validateProductionReceiptArtifacts,
  validateReleaseEvidenceFieldPresence,
  validateReleaseEvidenceInputs,
  validateReleaseWorkClaim,
  validateSemanticPipelineGateReceipt,
  validateFinalReleaseArtifactManifest,
  validateQualifiedNestedCallDeclarationWitness,
  validateRetainedRuntimeGateWork,
  validateCIncludeClosure,
  validateCanonicalRegallocEvidenceLabels,
  validateExecutionStageReleaseBindings,
  FINAL_RELEASE_BINDING_KEYS,
  validateSourceManifestPath,
  validateTypedExprCoverageLedger,
  validateTypedExprFormalSpecBinding,
  validateTypedExprFrozenAuthority,
  X86_64_F64_RUNTIME_GATE_EXTRA_ARTIFACTS,
  X86_64_F64_RUNTIME_GATE_GUARD_STAGES,
};
