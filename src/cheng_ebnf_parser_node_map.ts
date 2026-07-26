import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  readdirSync,
} from "node:fs";
import {basename, dirname, join, relative, resolve} from "node:path";
import {buildChengGrammarObligationContract} from "./cheng_semantic_pipeline_matrix_m9024.ts";
import {canonicalJson} from "./cheng_semantic_matrix_m9023.ts";
import {
  bindCurrentReceiptAgainstObligations,
  tokenKindNamesFromParserSource,
  valueExprKindNamesFromParserSource,
  type BindOneResult,
  type MapRow,
} from "../tools/grammar_receipt_bind.ts";
import {
  assertExactCurrentObjectKeys,
  parseUniqueCurrentJson,
} from "./current_schema_json.ts";

export const CHENG_EBNF_PARSER_PRODUCER_CLAIMS_SCHEMA =
  "cheng_ebnf_parser_producer_declarations";
export const CHENG_EBNF_PARSER_NODE_MAP_SCHEMA =
  "cheng_ebnf_parser_node_map";
export const CHENG_PARSER_PRODUCTION_RECEIPT_HARNESS_SCHEMA =
  "cheng_parser_production_receipt_harness";
export const CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE =
  "src/core/tooling/backend_driver_dispatch_min.cheng";
export const CHENG_PARSER_RECEIPT_BUILD_COMPILER = "/usr/bin/cc";
export const CHENG_CURRENT_FORMAL_COMPILER_ENV = Object.freeze({
  BACKEND_INCREMENTAL: "0",
  BACKEND_JOBS: "1",
  BACKEND_MULTI_MODULE_CACHE: "0",
  CHENG_BACKEND_DRIVER_HANDOFF: "0",
  CHENG_DISABLE_COLD_OBJECT_CACHE: "1",
  CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
  CHENG_DISABLE_PROVIDER_OBJECT_CACHE: "1",
  CHENG_DISABLE_PURE_EXE_CACHE: "1",
  CHENG_NO_BACKEND_DRIVER_HANDOFF: "1",
  CHENG_REQUIRE_PURE_SYSTEM_LINK_EXEC: "1",
  CHENG_STRICT_CALL_SYNTAX: "1",
  CHENG_STRICT_NO_CACHE: "1",
  CHENG_SYSTEM_LINK_EXEC_NO_CACHE: "1",
  LANG: "C",
  LC_ALL: "C",
  PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
  TMPDIR: "/tmp",
});
export const CHENG_CURRENT_FORMAL_COMPILER_UNSET_ENV = Object.freeze([
  "BACKEND_FN_SCHED",
  "BACKEND_STAGE1_LOCAL_ENV_LOOKUP",
  "BACKEND_TARGET",
  "CHENG_ALIAS_LICM_GVN",
  "CHENG_ALIAS_LICM_GVN_APPLY",
  "CHENG_BACKEND2",
  "CHENG_BACKEND2_JOBS",
  "CHENG_BACKEND2_SKIP_LOWER",
  "CHENG_BACKEND_DRIVER_BOOTSTRAP_DOWNSTREAM",
  "CHENG_COMPILER_CSG_LEGACY_CANONICAL_CID_DIAGNOSTIC",
  "CHENG_CSGE_IR_CACHE_ROOT",
  "CHENG_CSG_TYPED_IR_BATCH_LIMIT",
  "CHENG_DISABLE_TRIVIAL_WRAPPER_REDIRECT",
  "CHENG_ESCAPE_ARENA_APPLY",
  "CHENG_ESCAPE_ARENA_ROUTE",
  "CHENG_FULL_MATERIALIZE_EXE",
  "CHENG_LEAF_INLINER",
  "CHENG_NATIVE_LINK_PARALLEL",
  "CHENG_NO_BOOTSTRAP_BRIDGE",
  "CHENG_NO_IMPORT_BODIES",
  "CHENG_OBJECT_REACHABLE_ONLY",
  "CHENG_PRIMARY_KEEP_BODYIR_FOR_ZERO_SCAN",
  "CHENG_PRIMARY_LOWER_RSS",
  "CHENG_PURE_RAW_FLAG_BRIDGE",
  "CHENG_REGALLOC_OVERLAY_DRYRUN",
  "CHENG_SCOPE_EXIT_RELEASE",
  "CHENG_SKIP_LOWER_DIR",
  "CHENG_TARGET",
  "CHENG_TYPED_EXPR_RHS_NODE_INDEX_BUILD",
  "CHENG_TYPED_EXPR_LEGACY",
  "CHENG_TYPED_IR_KEEP_COLD_CSG_ROWS",
  "CHENG_TYPED_IR_KEEP_COLD_CSG_STATEMENTS",
  "CHENG_ZC_FAST_EXIT",
  "STAGE1_FN_SCHED",
]);

export function parserReceiptHarnessCompilerEnvironment(
  _base: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return {...CHENG_CURRENT_FORMAL_COMPILER_ENV};
}

export function parserReceiptHarnessCompilerProfile() {
  const env = Object.fromEntries(
    Object.entries(CHENG_CURRENT_FORMAL_COMPILER_ENV)
      .sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0),
  );
  const unsetEnv = [...CHENG_CURRENT_FORMAL_COMPILER_UNSET_ENV].sort();
  const payload = {
    schema: "cheng_formal_compile_profile",
    action: "system-link-exec",
    target: "arm64-apple-darwin",
    env,
    unsetEnv,
  };
  return {
    ...payload,
    sha256: sha256(Buffer.from(JSON.stringify(payload), "utf8")),
  };
}

export type ParserMapStatus = "MAPPED" | "PARTIAL" | "UNMAPPED";

export function parserWitnessFixedPointRejectedReceiptPaths(
  rows: readonly {
    readonly manifestSha256: string;
    readonly sourcePath: string;
    readonly receiptPath: string;
    readonly accepted: boolean;
    readonly witnessedObligationIds: readonly string[];
  }[],
): ReadonlySet<string> {
  const rejected = new Set<string>();
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.manifestSha256}\0${row.sourcePath}`;
    const group = groups.get(key) ?? [];
    groups.set(key, [...group, row]);
  }
  for (const group of groups.values()) {
    if (group.length !== 2 ||
        group.some((row) => !row.accepted) ||
        canonicalJson([...group[0]!.witnessedObligationIds].sort()) !==
          canonicalJson([...group[1]!.witnessedObligationIds].sort())) {
      for (const row of group) rejected.add(row.receiptPath);
    }
  }
  return rejected;
}

export interface ParserProducerClaim {
  readonly name: string;
  readonly parserFunctions: readonly string[];
  readonly nodeKinds: readonly string[];
  readonly spanModel: string;
  readonly notes: string;
}

interface ParserProducerClaims {
  readonly schema: typeof CHENG_EBNF_PARSER_PRODUCER_CLAIMS_SCHEMA;
  readonly rows: readonly ParserProducerClaim[];
}

interface FormalProduction {
  readonly name: string;
  readonly body: string;
}

interface FunctionReceipt {
  readonly name: string;
  readonly file: "src/core/lang/parser.cheng";
  readonly line: number;
  readonly bodySha256: string;
}

interface NodeKindReceipt {
  readonly name: string;
  readonly file: "src/core/lang/parser.cheng";
  readonly line: number;
  readonly declarationKind: "function" | "type" | "field" | "enum_member";
  readonly declarationSha256: string;
}

export interface EbnfParserNodeMapRow {
  readonly production: number;
  readonly name: string;
  readonly body_ref: {readonly body: string; readonly sha256: string};
  readonly parser_fn: readonly FunctionReceipt[];
  readonly node_kinds: readonly string[];
  readonly node_kind_receipts: readonly NodeKindReceipt[];
  readonly span_model: string;
  readonly status: ParserMapStatus;
  readonly receipt_ready: boolean;
  readonly required_obligation_count: number;
  readonly witnessed_required_count: number;
  readonly missing_required_count: number;
  readonly missing_required_obligation_ids: readonly string[];
  readonly witness_projections: readonly ParserOwnedWitnessProjection[];
  readonly witness_receipt_sha256s: readonly string[];
  readonly producer_receipt_sha256: string;
  readonly notes: string;
}

export interface ParserOwnedWitnessProjection {
  readonly obligation_id: string;
  readonly parser_node_kind: string;
  readonly parser_node_identity_sha256: string;
  readonly channel: string;
  readonly receipt_sha256: string;
}

export interface EbnfParserNodeMap {
  readonly schema: typeof CHENG_EBNF_PARSER_NODE_MAP_SCHEMA;
  readonly spec: {
    readonly path: "docs/cheng-formal-spec.md";
    readonly formalSpecSha256: string;
    readonly ebnfSha256: string;
    readonly productionCount: number;
  };
  readonly parser: {
    readonly path: "src/core/lang/parser.cheng";
    readonly sha256: string;
    readonly lineCount: number;
  };
  readonly producerDeclarations: {
    readonly path: "fixtures/semantic/ebnf_parser_producer_claims.json";
    readonly sha256: string;
  };
  readonly receiptEvidence: {
    readonly inputCount: number;
    readonly acceptedCount: number;
    readonly rejectedCount: number;
    readonly rows: readonly {
      readonly sourcePath: string;
      readonly receiptPath: string;
      readonly manifestPath: string;
      readonly sourceSha256: string;
      readonly receiptSha256: string;
      readonly manifestSha256: string;
      readonly accepted: boolean;
      readonly reason: string;
    }[];
  };
  readonly counts: {
    readonly total: number;
    readonly MAPPED: number;
    readonly PARTIAL: number;
    readonly UNMAPPED: number;
    readonly requiredObligationCount: number;
    readonly witnessedRequiredCount: number;
    readonly missingRequiredCount: number;
  };
  readonly rows: readonly EbnfParserNodeMapRow[];
}

const admittedMapSerialization = new WeakMap<object, string>();
const builtCurrentMapAuthority = new WeakSet<object>();

function deepFreezeCurrentSchema<T>(value: T): T {
  if (value !== null && typeof value === "object" &&
      !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreezeCurrentSchema(child);
    }
    Object.freeze(value);
  }
  return value;
}

function hasCompleteAdmittedReceiptEvidence(
  doc: EbnfParserNodeMap,
): boolean {
  const admittedReceiptSha256s = new Set(
    doc.receiptEvidence.rows
      .filter((row) => row.accepted)
      .map((row) => row.receiptSha256),
  );
  return doc.schema === CHENG_EBNF_PARSER_NODE_MAP_SCHEMA &&
    doc.receiptEvidence.inputCount > 0 &&
    doc.receiptEvidence.rows.length === doc.receiptEvidence.inputCount &&
    doc.receiptEvidence.acceptedCount === doc.receiptEvidence.inputCount &&
    doc.receiptEvidence.rejectedCount === 0 &&
    doc.receiptEvidence.rows.every(
      (row) => row.accepted && row.reason === "",
    ) &&
    doc.counts.total > 0 &&
    doc.rows.length === doc.counts.total &&
    doc.counts.MAPPED === doc.counts.total &&
    doc.counts.PARTIAL === 0 &&
    doc.counts.UNMAPPED === 0 &&
    doc.counts.requiredObligationCount > 0 &&
    doc.counts.witnessedRequiredCount ===
      doc.counts.requiredObligationCount &&
    doc.counts.missingRequiredCount === 0 &&
    doc.rows.every((row, index) =>
      row.production === index + 1 &&
      row.status === "MAPPED" &&
      row.receipt_ready &&
      row.required_obligation_count > 0 &&
      row.witnessed_required_count === row.required_obligation_count &&
      row.missing_required_count === 0 &&
      row.missing_required_obligation_ids.length === 0 &&
      new Set(row.witness_projections.map(
        (projection) => projection.obligation_id,
      )).size === row.required_obligation_count &&
      row.witness_projections.every(
        (projection) =>
          /^[0-9a-f]{64}$/.test(projection.parser_node_identity_sha256) &&
          /^[0-9a-f]{64}$/.test(projection.receipt_sha256) &&
          admittedReceiptSha256s.has(projection.receipt_sha256) &&
          projection.parser_node_kind.length > 0 &&
          projection.channel.length > 0,
      ) &&
      [...new Set(row.witness_projections.map(
        (projection) => projection.obligation_id,
      ))].every((obligationId) =>
        new Set(
          row.witness_projections
            .filter((projection) =>
              projection.obligation_id === obligationId)
            .map((projection) => projection.receipt_sha256),
        ).size >= 2) &&
      row.witness_receipt_sha256s.length > 0 &&
      row.witness_receipt_sha256s.every(
        (hash) => /^[0-9a-f]{64}$/.test(hash)));
}

export function parserOwnedStructuredWitnessAccepted(
  spanModel: string | undefined,
  parserNodeKind: string,
  production = "",
  declaredNodeKinds: readonly string[] = [],
): boolean {
  if (spanModel === "type_syntax_span") {
    return parserNodeKind.startsWith("ParserTypeSyntax") ||
      parserNodeKind === "ParserTypeGenericSymbol";
  }
  if (spanModel === "pattern_span") {
    return parserNodeKind.startsWith("ParserPattern");
  }
  if (spanModel === "annotation_span") {
    return parserNodeKind === "ParserAnnotation";
  }
  if (spanModel === "annotation_arg_span") {
    return parserNodeKind === "ParserAnnotation" ||
      parserNodeKind.startsWith("ParserAnnotationArg");
  }
  if (spanModel === "value_node_char_span") {
    return parserNodeKind.startsWith("ParserValueExpr") &&
      !parserNodeKind.startsWith("ParserValueExprRegion") &&
      !parserNodeKind.startsWith("ParserValueExprStatement") &&
      parserNodeKind !== "ParserValueExprSourceText";
  }
  if (spanModel === "statement_root_span") {
    return parserNodeKind.startsWith("ParserValueExprStatement") &&
      declaredNodeKinds.includes(parserNodeKind);
  }
  if (spanModel === "line_fact_span") {
    if (production === "breakStmt") {
      return parserNodeKind === "NormalizedExprBreakStmt";
    }
    if (production === "continueStmt") {
      return parserNodeKind === "NormalizedExprContinueStmt";
    }
    if (production === "deferStmt") {
      return parserNodeKind === "NormalizedExprDeferStmt" ||
        parserNodeKind === "NormalizedScopeDeferSuite";
    }
    if (production === "suite") {
      return parserNodeKind === "NormalizedScopeIndentedSuite" ||
        parserNodeKind === "NormalizedScopeInlineSuite";
    }
    return false;
  }
  if (spanModel === "record_fact") {
    if (production === "module") {
      return parserNodeKind === "ParserValueExprSourceText";
    }
    if (production === "storage") {
      return [
        "ParserValueTokenLet",
        "ParserValueTokenVar",
        "ParserValueTokenConst",
      ].includes(parserNodeKind);
    }
    if (production === "importDecl" ||
        production === "modulePath") {
      return parserNodeKind === "ParserImportEdge";
    }
    return false;
  }
  if (spanModel === "declaration_span") {
    return parserNodeKind.startsWith("ParserDeclaration") &&
      declaredNodeKinds.includes(parserNodeKind);
  }
  if (spanModel === "region_span") {
    if (production === "caseArm") {
      return parserNodeKind === "ParserStructuredCaseArm";
    }
    if (production === "lvalue") {
      return parserNodeKind === "ParserStructuredLValue";
    }
    return declaredNodeKinds.includes(parserNodeKind) &&
      (parserNodeKind.startsWith("ParserValueExprRegion") ||
        parserNodeKind.startsWith("ParserTypeSyntax") ||
        parserNodeKind.startsWith("ParserDeclaration"));
  }
  return false;
}

function parserOwnedWitnessProjection(
  result: BindOneResult,
  mapRow: MapRow | undefined,
): ParserOwnedWitnessProjection | null {
  if (result.receipt === null || result.result.kind !== "hit" ||
      mapRow === undefined ||
      !parserOwnedStructuredWitnessAccepted(
        mapRow.span_model,
        result.result.parserNodeKind,
        result.production,
        mapRow.node_kinds,
      )) {
    return null;
  }
  return {
    obligation_id: result.obligationId,
    parser_node_kind: result.result.parserNodeKind,
    parser_node_identity_sha256:
      result.result.parserNodeIdentitySha256,
    channel: result.result.channel,
    receipt_sha256: result.receipt.receiptSha256,
  };
}

const SPAN_MODELS = new Set([
  "value_node_char_span",
  "statement_root_span",
  "line_fact_span",
  "record_fact",
  "whole_file",
  "type_syntax_span",
  "pattern_span",
  "annotation_span",
  "annotation_arg_span",
  "region_span",
  "declaration_span",
  "none",
]);

const CURRENT_ANNOTATION_PRODUCER_CONTRACTS: Readonly<Record<string, {
  readonly parserFunctions: readonly string[];
  readonly nodeKinds: readonly string[];
  readonly spanModel: string;
}>> = Object.freeze({
  annotations: {
    parserFunctions: [
      "ParserApplyNormalizedFunctionAnnotationsInto",
      "ParserNormalizedAnnotationRegisteredName",
      "ParserValueExprAppendAnnotationInto",
      "ParserValueExprBindAnnotationTargets",
      "ParserValueExprTreeAnnotationsStrictValidateInto",
    ],
    nodeKinds: [
      "annotationProducerSourceIndexes",
      "annotationSourceLocalRows",
      "annotationNameTokenIndexes",
      "annotationTargetTokenIndexes",
      "annotationSpanStarts",
      "annotationSpanEnds",
      "annotationArgRootStarts",
      "annotationArgRootCounts",
      "annotationArgRootNodeIndexes",
    ],
    spanModel: "annotation_span",
  },
  annotation: {
    parserFunctions: [
      "ParserApplyNormalizedFunctionAnnotationsInto",
      "ParserNormalizedAnnotationRegisteredName",
      "ParserNormalizedFunctionAnnotationTargetDecl",
      "ParserValueExprAppendAnnotationInto",
      "ParserValueExprBindAnnotationTargets",
    ],
    nodeKinds: [
      "annotationProducerSourceIndexes",
      "annotationSourceLocalRows",
      "annotationNameTokenIndexes",
      "annotationTargetTokenIndexes",
      "annotationSpanStarts",
      "annotationSpanEnds",
      "annotationArgRootStarts",
      "annotationArgRootCounts",
      "annotationArgRootNodeIndexes",
    ],
    spanModel: "annotation_span",
  },
  annotationArgs: {
    parserFunctions: [
      "ParserValueExprAppendAnnotationInto",
      "ParserValueExprParseAnnotationArgInto",
      "ParserValueExprTreeAnnotationsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserValueExprRegionAnnotationArgs",
      "ParserValueTokenLeftParen",
      "ParserValueTokenRightParen",
      "ParserValueTokenComma",
      "ParserValueTokenSemicolon",
      "annotationArgRootStarts",
      "annotationArgRootCounts",
      "annotationArgRootNodeIndexes",
      "annotationArgOwnerRows",
    ],
    spanModel: "annotation_arg_span",
  },
  annotationArg: {
    parserFunctions: [
      "ParserValueExprAppendAnnotationArgNode",
      "ParserValueExprParseAnnotationArgInto",
      "ParserValueExprTreeAnnotationsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserAnnotationArgBoolean",
      "ParserAnnotationArgCharacter",
      "ParserAnnotationArgDict",
      "ParserAnnotationArgIdentifier",
      "ParserAnnotationArgKeyValue",
      "ParserAnnotationArgList",
      "ParserAnnotationArgNumber",
      "ParserAnnotationArgString",
      "annotationArgProducerSourceIndexes",
      "annotationArgSourceLocalRows",
      "annotationArgOwnerRows",
      "annotationArgKinds",
      "annotationArgTokenIndexes",
      "annotationArgSeparatorTokenIndexes",
      "annotationArgSpanStarts",
      "annotationArgSpanEnds",
      "annotationArgChildStarts",
      "annotationArgChildCounts",
      "annotationArgChildNodeIndexes",
    ],
    spanModel: "annotation_arg_span",
  },
  annotationList: {
    parserFunctions: [
      "ParserValueExprAppendAnnotationArgNode",
      "ParserValueExprParseAnnotationArgInto",
      "ParserValueExprTreeAnnotationsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserAnnotationArgList",
      "ParserValueTokenLeftBracket",
      "ParserValueTokenRightBracket",
      "ParserValueTokenComma",
      "annotationArgTokenIndexes",
      "annotationArgSpanStarts",
      "annotationArgSpanEnds",
      "annotationArgChildStarts",
      "annotationArgChildCounts",
      "annotationArgChildNodeIndexes",
    ],
    spanModel: "annotation_arg_span",
  },
  annotationDict: {
    parserFunctions: [
      "ParserValueExprAppendAnnotationArgNode",
      "ParserValueExprParseAnnotationArgInto",
      "ParserValueExprTreeAnnotationsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserAnnotationArgDict",
      "ParserAnnotationArgKeyValue",
      "ParserValueTokenLeftBrace",
      "ParserValueTokenRightBrace",
      "ParserValueTokenComma",
      "annotationArgTokenIndexes",
      "annotationArgSpanStarts",
      "annotationArgSpanEnds",
      "annotationArgChildStarts",
      "annotationArgChildCounts",
      "annotationArgChildNodeIndexes",
    ],
    spanModel: "annotation_arg_span",
  },
  annotationEntry: {
    parserFunctions: [
      "ParserNormalizedAnnotationKeyValueInto",
      "ParserValueExprParseAnnotationArgInto",
      "ParserValueExprTreeAnnotationsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserAnnotationArgKeyValue",
      "ParserValueTokenAssign",
      "ParserValueTokenColon",
      "annotationArgOwnerRows",
      "annotationArgTokenIndexes",
      "annotationArgSeparatorTokenIndexes",
      "annotationArgSpanStarts",
      "annotationArgSpanEnds",
      "annotationArgChildStarts",
      "annotationArgChildCounts",
      "annotationArgChildNodeIndexes",
    ],
    spanModel: "annotation_arg_span",
  },
  annotationKey: {
    parserFunctions: [
      "ParserValueExprAnnotationArgKeyKind",
      "ParserValueExprParseAnnotationArgInto",
      "ParserValueExprTreeAnnotationsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserAnnotationArgBoolean",
      "ParserAnnotationArgIdentifier",
      "ParserAnnotationArgNumber",
      "ParserAnnotationArgString",
      "annotationArgOwnerRows",
      "annotationArgTokenIndexes",
      "annotationArgSpanStarts",
      "annotationArgSpanEnds",
      "annotationArgChildNodeIndexes",
    ],
    spanModel: "annotation_arg_span",
  },
});

const CURRENT_CONCEPT_TRAIT_PRODUCER_CONTRACTS: Readonly<Record<string, {
  readonly parserFunctions: readonly string[];
  readonly nodeKinds: readonly string[];
  readonly spanModel: string;
}>> = Object.freeze({
  conceptDecl: {
    parserFunctions: [
      "ParserValueExprProcessConceptTraitRange",
      "ParserValueExprSetDeclarationGenericSymbols",
      "ParserValueExprSetDeclarationSuiteLexicalScope",
      "ParserValueExprTreeDeclarationsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserDeclarationConcept",
      "ParserDeclarationLexicalScopeBlock",
      "ParserValueExprRegionConceptTraitHeader",
      "declarationSuiteLexicalScopeRows",
      "typeGenericSymbolOwnerDeclarationRows",
    ],
    spanModel: "declaration_span",
  },
  traitDecl: {
    parserFunctions: [
      "ParserValueExprProcessConceptTraitRange",
      "ParserValueExprSetDeclarationGenericSymbols",
      "ParserValueExprSetDeclarationSuiteLexicalScope",
      "ParserValueExprTreeDeclarationsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserDeclarationTrait",
      "ParserDeclarationLexicalScopeBlock",
      "ParserValueExprRegionConceptTraitHeader",
      "declarationSuiteLexicalScopeRows",
      "typeGenericSymbolOwnerDeclarationRows",
    ],
    spanModel: "declaration_span",
  },
  conceptStmt: {
    parserFunctions: [
      "ParserValueExprProcessConceptTraitRange",
      "ParserValueExprSetDeclarationGenericSymbols",
      "ParserValueExprSetDeclarationSuiteLexicalScope",
      "ParserValueExprTreeDeclarationsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserDeclarationConcept",
      "ParserDeclarationLexicalScopeBlock",
      "ParserValueExprRegionConceptTraitHeader",
      "declarationSuiteLexicalScopeRows",
      "typeGenericSymbolOwnerDeclarationRows",
    ],
    spanModel: "declaration_span",
  },
  traitStmt: {
    parserFunctions: [
      "ParserValueExprProcessConceptTraitRange",
      "ParserValueExprSetDeclarationGenericSymbols",
      "ParserValueExprSetDeclarationSuiteLexicalScope",
      "ParserValueExprTreeDeclarationsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserDeclarationTrait",
      "ParserDeclarationLexicalScopeBlock",
      "ParserValueExprRegionConceptTraitHeader",
      "declarationSuiteLexicalScopeRows",
      "typeGenericSymbolOwnerDeclarationRows",
    ],
    spanModel: "declaration_span",
  },
});

const CURRENT_EXACT_SURFACE_PRODUCER_CONTRACTS: Readonly<Record<string, {
  readonly parserFunctions: readonly string[];
  readonly nodeKinds: readonly string[];
  readonly spanModel: string;
}>> = Object.freeze({
  moduleHeader: {
    parserFunctions: [
      "ParserValueExprProcessStatementRangeWithTypeOwner",
      "ParserValueExprAppendRegion",
      "ParserValueExprAppendDeclaration",
      "ParserValueExprTreeDeclarationsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserValueExprRegionModuleHeaderLine",
      "ParserDeclarationModule",
      "ParserValueTokenModule",
      "ParserValueTokenIdentifier",
      "regionKinds",
      "regionSourceTextIds",
      "regionSpanStarts",
      "regionSpanEnds",
      "regionAnchorTokenIndexes",
      "declarationNameTokenIndexes",
      "declarationOwnerRows",
      "declarationLexicalScopeRows",
      "declarationFunctionRows",
      "declarationTypeSyntaxRootIndexes",
      "declarationGenericSymbolStarts",
      "declarationGenericSymbolCounts",
      "declarationSuiteLexicalScopeRows",
      "declarationNameSpanStarts",
      "declarationNameSpanEnds",
    ],
    spanModel: "declaration_span",
  },
  lvalue: {
    parserFunctions: [
      "ParserValueExprProcessStatementRangeWithTypeOwner",
      "ParserValueExprAppendRegion",
      "ParserValueExprParseExactRoot",
      "ParserValueExprAppendStatementRoot",
      "ParserValueExprTreeStatementRootsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserValueExprRegionLValue",
      "ParserValueExprIdentifier",
      "ParserValueExprField",
      "ParserValueExprIndex",
      "ParserValueExprStatementAssignmentRhs",
      "ParserValueTokenAssign",
      "regionKinds",
      "regionSourceTextIds",
      "regionSpanStarts",
      "regionSpanEnds",
      "regionAnchorTokenIndexes",
      "nodeProducerSourceIndexes",
      "nodeSourceLocalIndexes",
      "parentNodeIndexes",
      "firstChilds",
      "childCounts",
      "nextSiblings",
      "statementRootNodeIndexes",
      "statementRootRoles",
      "statementRootAnchorTokenIndexes",
      "statementRootBindingDeclarationStarts",
      "statementRootBindingDeclarationCounts",
    ],
    spanModel: "region_span",
  },
  caseArm: {
    parserFunctions: [
      "ParserValueExprProcessStatementRangeWithTypeOwner",
      "ParserValueExprAppendRegion",
      "ParserValueExprParseCaseEntryListRange",
      "ParserValueExprParsePatternRange",
      "ParserValueExprAppendStatementRoot",
      "ParserValueExprTreePatternsStrictValidateInto",
      "ParserValueExprTreeStatementRootsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserValueExprRegionCaseArm",
      "ParserValueExprStatementCaseEntry",
      "ParserValueTokenOf",
      "ParserValueTokenColon",
      "ParserValueTokenComma",
      "ParserPatternBinding",
      "ParserPatternWildcard",
      "ParserPatternLiteral",
      "ParserPatternTuple",
      "ParserPatternSequence",
      "ParserPatternObject",
      "ParserPatternConstructor",
      "ParserPatternNamedField",
      "ParserPatternRange",
      "patternProducerSourceIndexes",
      "patternSourceLocalRows",
      "patternOwnerKinds",
      "patternOwnerRows",
      "patternSpanStarts",
      "patternSpanEnds",
      "patternChildStarts",
      "patternChildCounts",
      "patternChildNodeIndexes",
      "statementRootNodeIndexes",
      "statementRootRoles",
      "statementRootAnchorTokenIndexes",
    ],
    spanModel: "region_span",
  },
});

const CURRENT_PATTERN_PRODUCER_FUNCTIONS = Object.freeze([
  "ParserValueExprParsePatternRange",
  "ParserValueExprParsePatternInto",
  "ParserValueExprAppendPatternNode",
  "ParserValueExprTreePatternsStrictValidateInto",
] as const);

const CURRENT_PATTERN_IDENTITY_COLUMNS = Object.freeze([
  "patternProducerSourceIndexes",
  "patternSourceLocalRows",
  "patternKinds",
  "patternNameTokenIndexes",
  "patternOwnerLexicalScopeRows",
  "patternOwnerKinds",
  "patternOwnerRows",
  "patternBindingDeclarationRows",
  "patternTypeSyntaxRootIndexes",
  "patternSpanStarts",
  "patternSpanEnds",
  "patternChildStarts",
  "patternChildCounts",
  "patternChildNodeIndexes",
] as const);

const CURRENT_PATTERN_TYPE_ANNOTATION_COLUMNS = Object.freeze([
  "ParserTypeSyntaxRootBindingAnnotation",
  "typeSyntaxProducerSourceIndexes",
  "typeSyntaxSourceLocalRows",
  "typeSyntaxRootKinds",
  "typeSyntaxOwnerTokenIndexes",
  "typeSyntaxDeclarationOwnerTokenIndexes",
  "typeSyntaxDeclarationOwnerNodeIndexes",
  "typeSyntaxSpanStarts",
  "typeSyntaxSpanEnds",
  "declarationTypeSyntaxRootIndexes",
] as const);

const CURRENT_PATTERN_ALL_KINDS = Object.freeze([
  "ParserPatternBinding",
  "ParserPatternWildcard",
  "ParserPatternLiteral",
  "ParserPatternTuple",
  "ParserPatternSequence",
  "ParserPatternObject",
  "ParserPatternConstructor",
  "ParserPatternNamedField",
  "ParserPatternRange",
] as const);

const CURRENT_PATTERN_PRODUCER_CONTRACTS: Readonly<Record<string, {
  readonly parserFunctions: readonly string[];
  readonly nodeKinds: readonly string[];
  readonly spanModel: "pattern_span";
}>> = Object.freeze({
  pattern: {
    parserFunctions: CURRENT_PATTERN_PRODUCER_FUNCTIONS,
    nodeKinds: [
      "ParserPatternKind",
      ...CURRENT_PATTERN_ALL_KINDS,
      ...CURRENT_PATTERN_IDENTITY_COLUMNS,
      ...CURRENT_PATTERN_TYPE_ANNOTATION_COLUMNS,
      "ParserValueTokenColon",
    ],
    spanModel: "pattern_span",
  },
  variantPattern: {
    parserFunctions: CURRENT_PATTERN_PRODUCER_FUNCTIONS,
    nodeKinds: [
      "ParserPatternLiteral",
      "ParserPatternConstructor",
      ...CURRENT_PATTERN_IDENTITY_COLUMNS,
    ],
    spanModel: "pattern_span",
  },
  rangePattern: {
    parserFunctions: CURRENT_PATTERN_PRODUCER_FUNCTIONS,
    nodeKinds: [
      "ParserPatternRange",
      ...CURRENT_PATTERN_IDENTITY_COLUMNS,
      "ParserValueTokenRangeInclusive",
      "ParserValueTokenRangeExclusive",
    ],
    spanModel: "pattern_span",
  },
  objectPattern: {
    parserFunctions: CURRENT_PATTERN_PRODUCER_FUNCTIONS,
    nodeKinds: [
      "ParserPatternConstructor",
      "ParserPatternNamedField",
      ...CURRENT_PATTERN_IDENTITY_COLUMNS,
      "ParserValueTokenColon",
    ],
    spanModel: "pattern_span",
  },
  patternArg: {
    parserFunctions: CURRENT_PATTERN_PRODUCER_FUNCTIONS,
    nodeKinds: [
      ...CURRENT_PATTERN_ALL_KINDS,
      ...CURRENT_PATTERN_IDENTITY_COLUMNS,
      "ParserValueTokenColon",
    ],
    spanModel: "pattern_span",
  },
  literalPattern: {
    parserFunctions: CURRENT_PATTERN_PRODUCER_FUNCTIONS,
    nodeKinds: [
      "ParserPatternLiteral",
      ...CURRENT_PATTERN_IDENTITY_COLUMNS,
      "ParserValueTokenInteger",
      "ParserValueTokenFloat",
      "ParserValueTokenString",
      "ParserValueTokenChar",
      "ParserValueTokenTrue",
      "ParserValueTokenFalse",
    ],
    spanModel: "pattern_span",
  },
});

export function assertCurrentPatternProducerClaim(
  claim: ParserProducerClaim,
): void {
  const contract = CURRENT_PATTERN_PRODUCER_CONTRACTS[claim.name];
  if (contract === undefined) {
    throw new Error(
      `${claim.name} is not a current Pattern production`);
  }
  if (claim.spanModel !== contract.spanModel ||
      canonicalJson([...claim.parserFunctions].sort()) !==
        canonicalJson([...contract.parserFunctions].sort()) ||
      canonicalJson([...claim.nodeKinds].sort()) !==
        canonicalJson([...contract.nodeKinds].sort())) {
    throw new Error(
      `${claim.name} current Pattern producer declaration invalid`,
    );
  }
}

const CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS = Object.freeze([
  "typeSyntaxProducerSourceIndexes",
  "typeSyntaxSourceLocalRows",
  "typeSyntaxSpanStarts",
  "typeSyntaxSpanEnds",
  "typeSyntaxOwnerTokenIndexes",
] as const);

const CURRENT_TYPE_SYNTAX_DECLARATION_COLUMNS = Object.freeze([
  "typeSyntaxDeclarationOwnerTokenIndexes",
  "typeSyntaxDeclarationOwnerNodeIndexes",
] as const);

const CURRENT_TYPE_SYNTAX_CHILD_COLUMNS = Object.freeze([
  "typeSyntaxChildStarts",
  "typeSyntaxChildCounts",
  "typeSyntaxChildNodeIndexes",
] as const);

const CURRENT_TYPE_SYNTAX_BRACKET_COLUMNS = Object.freeze([
  "typeSyntaxBracketArgStarts",
  "typeSyntaxBracketArgCounts",
  "typeSyntaxBracketArgTokenStarts",
  "typeSyntaxBracketArgTokenCounts",
  "typeSyntaxBracketArgTypeNodeIndexes",
  "typeSyntaxBracketArgConstExprRootIndexes",
] as const);

const CURRENT_TYPE_CONST_COLUMNS = Object.freeze([
  "typeConstExprProducerSourceIndexes",
  "typeConstExprKinds",
  "typeConstExprTokenIndexes",
  "typeConstExprLeftChildIndexes",
  "typeConstExprRightChildIndexes",
  "typeConstExprIntegerValues",
] as const);

const CURRENT_TYPE_GENERIC_COLUMNS = Object.freeze([
  "typeGenericSymbolProducerSourceIndexes",
  "typeGenericSymbolDeclarationOwnerTokenIndexes",
  "typeGenericSymbolNameTokenIndexes",
  "typeGenericSymbolOrdinals",
  "typeGenericSymbolSpanStarts",
  "typeGenericSymbolSpanEnds",
  "typeGenericSymbolOwnerDeclarationRows",
  "typeGenericSymbolOwnerTypeSyntaxNodeIndexes",
  "typeGenericSymbolConstraintTypeSyntaxNodeIndexes",
  "typeGenericSymbolDefaultTypeSyntaxNodeIndexes",
  "typeGenericSymbolChildStarts",
  "typeGenericSymbolChildCounts",
  "typeGenericSymbolChildTypeSyntaxNodeIndexes",
] as const);

const CURRENT_TYPE_SYNTAX_PRODUCER_CONTRACTS: Readonly<Record<string, {
  readonly parserFunctions: readonly string[];
  readonly nodeKinds: readonly string[];
  readonly spanModel: "type_syntax_span";
}>> = Object.freeze({
  implicitObjectType: {
    parserFunctions: [
      "ParserValueExprProcessTypeDeclarationRangeInto",
      "ParserValueExprAppendTypeSyntaxRootInto",
      "parserTypeSyntaxParsePrimary",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxImplicitObject",
      "ParserTypeSyntaxObject",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_DECLARATION_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
      "ParserValueTokenOf",
    ],
    spanModel: "type_syntax_span",
  },
  objectType: {
    parserFunctions: [
      "ParserValueExprProcessTypeDeclarationRangeInto",
      "ParserValueExprAppendTypeSyntaxRootInto",
      "parserTypeSyntaxParsePrimary",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxObject",
      "ParserTypeSyntaxRefObject",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_DECLARATION_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
      "ParserValueTokenOf",
    ],
    spanModel: "type_syntax_span",
  },
  typeParamList: {
    parserFunctions: [
      "ParserValueExprAppendDeclarationGenericSymbols",
      "ParserValueExprTypeSyntaxSetGenericSymbols",
      "ParserValueExprTreeGenericSymbolsStrictValidateInto",
      "ParserValueExprAppendRegion",
    ],
    nodeKinds: [
      "ParserValueExprRegionTypeParamList",
      ...CURRENT_TYPE_GENERIC_COLUMNS,
    ],
    spanModel: "type_syntax_span",
  },
  typeParam: {
    parserFunctions: [
      "ParserValueExprAppendDeclarationGenericSymbols",
      "ParserValueExprTypeSyntaxSetGenericSymbols",
      "ParserValueExprTreeGenericSymbolsStrictValidateInto",
    ],
    nodeKinds: [...CURRENT_TYPE_GENERIC_COLUMNS],
    spanModel: "type_syntax_span",
  },
  typeExpr: {
    parserFunctions: [
      "parserTypeSyntaxParseRange",
      "parserTypeSyntaxParsePrimary",
      "parserTypeSyntaxParseAlgebraic",
      "ParserValueExprAppendTypeSyntaxNode",
      "ParserValueExprTypeSyntaxSetQuestionToken",
      "ParserValueExprTypeSyntaxSetBracketArgs",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxKind",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_DECLARATION_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
      "typeSyntaxBracketArgStarts",
      "typeSyntaxBracketArgCounts",
      "typeSyntaxQuestionTokenIndexes",
    ],
    spanModel: "type_syntax_span",
  },
  algebraicType: {
    parserFunctions: [
      "parserTypeSyntaxParseAlgebraic",
      "parserTypeSyntaxParseVariant",
      "ParserValueExprAppendTypeSyntaxNode",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxAlgebraic",
      "ParserTypeSyntaxVariant",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
    ],
    spanModel: "type_syntax_span",
  },
  variantType: {
    parserFunctions: [
      "parserTypeSyntaxParseVariant",
      "parserTypeSyntaxListInto",
      "ParserValueExprAppendTypeSyntaxNode",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxVariant",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      "typeSyntaxNameTokenIndexes",
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
    ],
    spanModel: "type_syntax_span",
  },
  procType: {
    parserFunctions: [
      "parserTypeSyntaxParseRange",
      "parserTypeSyntaxParsePrimary",
      "parserTypeSyntaxListInto",
      "ParserValueExprAppendTypeSyntaxNode",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxFunction",
      "ParserValueTokenFn",
      "ParserValueTokenColon",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      "typeSyntaxNameTokenIndexes",
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
    ],
    spanModel: "type_syntax_span",
  },
  tupleType: {
    parserFunctions: [
      "parserTypeSyntaxParseRange",
      "parserTypeSyntaxParsePrimary",
      "parserTypeSyntaxListInto",
      "ParserValueExprAppendTypeSyntaxNode",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxTuple",
      "ParserValueTokenTuple",
      "ParserValueTokenLeftBracket",
      "ParserValueTokenRightBracket",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      "typeSyntaxNameTokenIndexes",
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
    ],
    spanModel: "type_syntax_span",
  },
  setType: {
    parserFunctions: [
      "parserTypeSyntaxParseRange",
      "parserTypeSyntaxParsePrimary",
      "parserTypeSyntaxBracketArgRangesInto",
      "ParserValueExprTypeSyntaxSetBracketArgs",
      "ParserValueExprAppendTypeSyntaxNode",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxNominal",
      "ParserTypeSyntaxBracketApply",
      "ParserValueTokenSet",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
      "typeSyntaxBracketArgStarts",
      "typeSyntaxBracketArgCounts",
      "typeSyntaxBracketArgTypeNodeIndexes",
      "typeSyntaxBracketArgConstExprRootIndexes",
    ],
    spanModel: "type_syntax_span",
  },
  enumType: {
    parserFunctions: [
      "parserTypeSyntaxParseRange",
      "parserTypeSyntaxParsePrimary",
      "ParserValueExprAppendEnumVariantsRangeInto",
      "ParserValueExprTreeEnumVariantsStrictValidateInto",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxEnum",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_DECLARATION_COLUMNS,
      "typeSyntaxEnumVariantStarts",
      "typeSyntaxEnumVariantCounts",
      "typeEnumVariantProducerSourceIndexes",
      "typeEnumVariantDeclarationOwnerNodeIndexes",
      "typeEnumVariantDeclarationOwnerTokenIndexes",
      "typeEnumVariantNameTokenIndexes",
      "typeEnumVariantOrdinals",
      "typeEnumVariantPayloadTypeSyntaxNodeIndexes",
    ],
    spanModel: "type_syntax_span",
  },
  refType: {
    parserFunctions: [
      "parserTypeSyntaxParseRange",
      "parserTypeSyntaxParsePrimary",
      "ParserValueExprAppendTypeSyntaxNode",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxRefObject",
      "ParserValueTokenRef",
      "ParserValueTokenObject",
      "ParserValueTokenOf",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
    ],
    spanModel: "type_syntax_span",
  },
  varType: {
    parserFunctions: [
      "parserTypeSyntaxParseRange",
      "parserTypeSyntaxParsePrimary",
      "ParserValueExprAppendTypeSyntaxNode",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxVarBorrow",
      "ParserValueTokenVar",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
    ],
    spanModel: "type_syntax_span",
  },
  typePostfix: {
    parserFunctions: [
      "parserTypeSyntaxParseRange",
      "parserTypeSyntaxParsePrimary",
      "parserTypeSyntaxBracketArgRangesInto",
      "ParserValueExprTypeSyntaxSetBracketArgs",
      "ParserValueExprTypeSyntaxSetQuestionToken",
      "ParserValueExprAppendTypeSyntaxNode",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxQualified",
      "ParserTypeSyntaxBracketApply",
      "ParserTypeSyntaxSeq",
      "ParserTypeSyntaxFixedArray",
      "ParserTypeSyntaxGrouped",
      "ParserTypeSyntaxOptional",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      "typeSyntaxNameTokenIndexes",
      "typeSyntaxQuestionTokenIndexes",
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_BRACKET_COLUMNS.slice(0, 2),
      "typeSyntaxBracketArgTypeNodeIndexes",
      "typeSyntaxBracketArgConstExprRootIndexes",
    ],
    spanModel: "type_syntax_span",
  },
  typePrimary: {
    parserFunctions: [
      "parserTypeSyntaxParsePrimary",
      "parserTypeSyntaxParseRange",
      "ParserValueExprAppendTypeSyntaxNode",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      "ParserTypeSyntaxNominal",
      "ParserTypeSyntaxGrouped",
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      "typeSyntaxNameTokenIndexes",
      ...CURRENT_TYPE_SYNTAX_CHILD_COLUMNS,
    ],
    spanModel: "type_syntax_span",
  },
  typeArg: {
    parserFunctions: [
      "parserTypeSyntaxBracketArgRangesInto",
      "ParserValueExprTypeSyntaxSetBracketArgs",
      "ParserValueExprTreeTypeSyntaxBracketArgsStrictValidateInto",
    ],
    nodeKinds: [
      ...CURRENT_TYPE_SYNTAX_IDENTITY_COLUMNS,
      ...CURRENT_TYPE_SYNTAX_BRACKET_COLUMNS,
      ...CURRENT_TYPE_CONST_COLUMNS,
    ],
    spanModel: "type_syntax_span",
  },
});

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function extractFormalProductions(formalSpecSource: string): readonly FormalProduction[] {
  const fences = [...formalSpecSource.matchAll(/```ebnf\s*\n([\s\S]*?)\n```/g)];
  if (fences.length !== 1 || fences[0]?.[1] === undefined) {
    throw new Error(`formal spec must contain one ebnf fence, found ${fences.length}`);
  }
  const source = fences[0][1].replace(/\/\*[\s\S]*?\*\//g, " ");
  const starts = [...source.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s*::=\s*/gm)];
  return starts.map((match, productionIndex) => {
    if (match[1] === undefined || match.index === undefined) {
      throw new Error(`invalid formal EBNF production ${productionIndex + 1}`);
    }
    const bodyStart = match.index + match[0].length;
    let quote = "";
    let escaped = false;
    let bodyEnd = -1;
    for (let index = bodyStart; index < source.length; index += 1) {
      const ch = source[index]!;
      if (quote !== "") {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === "\"" || ch === "'" || ch === "`") {
        quote = ch;
      } else if (ch === ";") {
        bodyEnd = index;
        break;
      }
    }
    if (bodyEnd < 0 || quote !== "") {
      throw new Error(`formal EBNF production lacks terminator: ${match[1]}`);
    }
    const nextStart = starts[productionIndex + 1]?.index;
    if (nextStart !== undefined && bodyEnd >= nextStart) {
      throw new Error(`formal EBNF production overlaps next production: ${match[1]}`);
    }
    return {
      name: match[1],
      body: source.slice(bodyStart, bodyEnd).replace(/\s+/g, " ").trim(),
    };
  });
}

function parseClaims(source: string): ParserProducerClaims {
  const raw = parseUniqueCurrentJson(
    source,
    "ebnf_parser_producer_declarations",
  );
  assertExactCurrentObjectKeys(raw, [
    "schema",
    "rows",
  ], "ebnf_parser_producer_declarations");
  const claims = raw as {
    readonly schema?: unknown;
    readonly rows?: readonly Record<string, unknown>[];
  };
  if (claims.schema !== CHENG_EBNF_PARSER_PRODUCER_CLAIMS_SCHEMA ||
      !Array.isArray(claims.rows)) {
    throw new Error("invalid EBNF parser producer claims schema");
  }
  const rows = claims.rows.map((row, index): ParserProducerClaim => {
    for (const generated of ["status", "coverage", "receiptReady", "receipt_ready"]) {
      if (generated in row) {
        throw new Error(
          `producer declaration ${index + 1} must not contain generated ${generated}`,
        );
      }
    }
    const actualKeys = Object.keys(row).sort();
    const expectedKeys = [
      "name",
      "nodeKinds",
      "notes",
      "parserFunctions",
      "spanModel",
    ];
    if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
      throw new Error(`producer declaration ${index + 1} keys invalid`);
    }
    if (typeof row.name !== "string" ||
        !Array.isArray(row.parserFunctions) ||
        !row.parserFunctions.every(
          (entry: unknown) =>
            typeof entry === "string" &&
            /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry)) ||
        !Array.isArray(row.nodeKinds) ||
        !row.nodeKinds.every(
          (entry: unknown) =>
            typeof entry === "string" &&
            (/^<[^<>\r\n]+>$/.test(entry) ||
             /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry))) ||
        typeof row.spanModel !== "string" ||
        !SPAN_MODELS.has(row.spanModel) ||
        typeof row.notes !== "string" ||
        new Set(row.parserFunctions).size !== row.parserFunctions.length ||
        new Set(row.nodeKinds).size !== row.nodeKinds.length) {
      throw new Error(`invalid EBNF parser producer claim ${index + 1}`);
    }
    return {
      name: row.name,
      parserFunctions: row.parserFunctions as readonly string[],
      nodeKinds: row.nodeKinds as readonly string[],
      spanModel: row.spanModel,
      notes: row.notes,
    };
  });
  return {schema: CHENG_EBNF_PARSER_PRODUCER_CLAIMS_SCHEMA, rows};
}

interface ParserDeclarationIndex {
  readonly lineCount: number;
  readonly functionReceipts: ReadonlyMap<string, FunctionReceipt>;
  readonly nodeKindReceipts:
    ReadonlyMap<string, readonly NodeKindReceipt[]>;
}

function parserDeclarationIndex(
  parserSource: string,
): ParserDeclarationIndex {
  const lines = parserSource.split("\n");
  const starts: {readonly name: string; readonly lineIndex: number}[] = [];
  const nodeKindReceipts = new Map<string, NodeKindReceipt[]>();
  const addNodeKindReceipt = (
    name: string,
    line: string,
    lineIndex: number,
    declarationKind: NodeKindReceipt["declarationKind"],
  ): void => {
    const rows = nodeKindReceipts.get(name) ?? [];
    rows.push({
      name,
      file: "src/core/lang/parser.cheng",
      line: lineIndex + 1,
      declarationKind,
      declarationSha256: sha256(`${line}\n`),
    });
    nodeKindReceipts.set(name, rows);
  };
  let enclosingType: string | null = null;
  lines.forEach((line, lineIndex) => {
    const functionMatch =
      /^fn\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line);
    if (functionMatch?.[1] !== undefined) {
      starts.push({name: functionMatch[1], lineIndex});
      addNodeKindReceipt(
        functionMatch[1],
        line,
        lineIndex,
        "function",
      );
    }
    if (/^fn\b/.test(line)) {
      enclosingType = null;
      return;
    }
    const typeMatch =
      /^ {4}([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/.exec(line);
    if (typeMatch?.[1] !== undefined) {
      addNodeKindReceipt(typeMatch[1], line, lineIndex, "type");
      enclosingType = line;
      return;
    }
    if (enclosingType !== null &&
        /\s=\s*(?:ref\s+)?object(?:\s|$)/.test(enclosingType)) {
      const fieldMatch =
        /^ {8,}([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\S/.exec(line);
      if (fieldMatch?.[1] !== undefined) {
        addNodeKindReceipt(
          fieldMatch[1],
          line,
          lineIndex,
          "field",
        );
        return;
      }
    }
    if (enclosingType !== null &&
        /\s=\s*enum\s*$/.test(enclosingType)) {
      const enumMemberMatch =
        /^ {8,}([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(line);
      if (enumMemberMatch?.[1] !== undefined) {
        addNodeKindReceipt(
          enumMemberMatch[1],
          line,
          lineIndex,
          "enum_member",
        );
      }
    }
  });
  const functionReceipts = new Map<string, FunctionReceipt>();
  starts.forEach((entry, index) => {
    if (functionReceipts.has(entry.name)) {
      throw new Error(`duplicate parser function ${entry.name}`);
    }
    const end = starts[index + 1]?.lineIndex ?? lines.length;
    const body = lines.slice(entry.lineIndex, end).join("\n").trimEnd() + "\n";
    functionReceipts.set(entry.name, {
      name: entry.name,
      file: "src/core/lang/parser.cheng",
      line: entry.lineIndex + 1,
      bodySha256: sha256(body),
    });
  });
  return {
    lineCount: lines.length,
    functionReceipts,
    nodeKindReceipts,
  };
}

function nodeKindReceipt(
  declarationIndex: ParserDeclarationIndex,
  name: string,
): NodeKindReceipt {
  const matches = declarationIndex.nodeKindReceipts.get(name) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `parser node declaration cardinality invalid: ${name}/${matches.length}`,
    );
  }
  return matches[0]!;
}

export interface ParserReceiptEvidenceInput {
  readonly sourcePath: string;
  readonly sourceBytes: Buffer;
  readonly receiptPath: string;
  readonly receiptBytes: Buffer;
  readonly manifestPath: string;
  readonly manifestBytes: Buffer;
}

export interface EbnfParserNodeMapBuildOptions {
  readonly receiptProducerBytes?: Buffer;
  readonly receiptEvidence?: readonly ParserReceiptEvidenceInput[];
  readonly harnessFormalSpecPath?: string;
  readonly harnessParserPath?: string;
  readonly harnessReceiptProducerPath?: string;
  readonly harnessDriverEntryPath?: string;
  readonly harnessDriverEntrySha256?: string;
  readonly harnessBootstrapPath?: string;
  readonly harnessBootstrapSha256?: string;
  readonly harnessPath?: string;
  readonly harnessSha256?: string;
  readonly harnessDependencyClosureSha256?: string;
  readonly harnessToolClosureSha256?: string;
  readonly harnessBuildCompilerExecutablePath?: string;
  readonly harnessBuildCompilerExecutableSha256?: string;
  readonly harnessBuildCompilerVersionSha256?: string;
  readonly harnessRuntimeExecutablePath?: string;
  readonly harnessRuntimeExecutableSha256?: string;
  readonly harnessRuntimeVersion?: string;
  readonly harnessOfficialCurrentBuild?:
    ParserReceiptHarnessOfficialCurrentBuildIdentity;
}

interface HarnessReceiptIdentity {
  readonly path: string;
  readonly sha256: string;
  readonly inode: string;
  readonly byteLength: number;
  readonly sourcePath: string;
  readonly driverRole: string;
  readonly driverSha256: string;
  readonly parserTraceRootSha256: string;
}

function assertExactKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, any> {
  assertExactCurrentObjectKeys(value, keys, label);
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label}_sha256_invalid`);
  }
}

export interface ParserReceiptHarnessToolClosure {
  readonly fileCount: number;
  readonly sha256: string;
  readonly rows: readonly {
    readonly path: string;
    readonly byteLength: number;
    readonly sha256: string;
  }[];
}

export interface ParserReceiptHarnessChengClosure {
  readonly fileCount: number;
  readonly sha256: string;
  readonly rows: readonly {
    readonly path: string;
    readonly byteLength: number;
    readonly sha256: string;
  }[];
}

export interface ParserReceiptHarnessExecutableIdentity {
  readonly command: string;
  readonly executablePath: string;
  readonly executableSha256: string;
  readonly versionSha256: string;
}

export function buildParserReceiptHarnessExecutableIdentity(
  command: string,
): ParserReceiptHarnessExecutableIdentity {
  const located = Bun.which(command);
  if (located === null) {
    throw new Error("harness_build_compiler_missing");
  }
  const executablePath = realpathSync(located);
  const stat = lstatSync(executablePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("harness_build_compiler_path_invalid");
  }
  const executableBytes = readFileSync(executablePath);
  if (executableBytes.length === 0) {
    throw new Error("harness_build_compiler_empty");
  }
  const version = spawnSync(executablePath, ["--version"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (version.error !== undefined || version.status !== 0) {
    throw new Error("harness_build_compiler_version_failed");
  }
  return {
    command,
    executablePath,
    executableSha256: sha256(executableBytes),
    versionSha256: sha256(
      `${String(version.stdout)}\0${String(version.stderr)}`,
    ),
  };
}

function collectChengClosureFiles(
  root: string,
  directory: string,
  out: string[],
): void {
  const directoryStat = lstatSync(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error("cheng_closure_directory_invalid");
  }
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error("cheng_closure_symlink_invalid");
    }
    if (stat.isDirectory()) {
      collectChengClosureFiles(root, path, out);
    } else if (stat.isFile() && /\.(?:cheng|c|h)$/.test(name)) {
      const relativePath = relative(root, path);
      if (relativePath === "" || relativePath.startsWith("..")) {
        throw new Error("cheng_closure_path_invalid");
      }
      out.push(relativePath);
    }
  }
}

export function buildParserReceiptHarnessChengClosure(
  chengRoot: string,
  formalSpecPath: string,
): ParserReceiptHarnessChengClosure {
  const canonicalRoot = resolve(chengRoot);
  const canonicalSpec = resolve(formalSpecPath);
  const specRelative = relative(canonicalRoot, canonicalSpec);
  if (specRelative === "" || specRelative.startsWith("..")) {
    throw new Error("cheng_closure_formal_spec_path_invalid");
  }
  const paths: string[] = [];
  collectChengClosureFiles(
    canonicalRoot,
    join(canonicalRoot, "src"),
    paths,
  );
  collectChengClosureFiles(
    canonicalRoot,
    join(canonicalRoot, "bootstrap"),
    paths,
  );
  for (const name of ["cheng-package.toml", "cheng.lock"]) {
    const path = join(canonicalRoot, name);
    if (!existsSync(path)) continue;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error("cheng_closure_manifest_path_invalid");
    }
    paths.push(name);
  }
  const specStat = lstatSync(canonicalSpec);
  if (specStat.isSymbolicLink() || !specStat.isFile()) {
    throw new Error("cheng_closure_formal_spec_invalid");
  }
  paths.push(specRelative);
  paths.sort();
  if (paths.length === 0 || new Set(paths).size !== paths.length) {
    throw new Error("cheng_closure_path_set_invalid");
  }
  const rows = paths.map((path) => {
    const bytes = readFileSync(join(canonicalRoot, path));
    return {path, byteLength: bytes.length, sha256: sha256(bytes)};
  });
  return {
    fileCount: rows.length,
    sha256: sha256(canonicalJson(rows)),
    rows,
  };
}

export async function buildParserReceiptHarnessToolClosure(
  harnessPath: string,
  fusionRoot: string,
): Promise<ParserReceiptHarnessToolClosure> {
  const canonicalRoot = resolve(fusionRoot);
  const canonicalHarness = resolve(harnessPath);
  if (relative(canonicalRoot, canonicalHarness).startsWith("..")) {
    throw new Error("harness_tool_entry_outside_fusion_root");
  }
  const build = await Bun.build({
    entrypoints: [canonicalHarness],
    target: "bun",
    metafile: true,
  });
  if (!build.success || build.metafile === undefined) {
    throw new Error("harness_tool_dependency_build_failed");
  }
  const absolutePaths = Object.keys(build.metafile.inputs).map(
    (inputPath) => resolve(process.cwd(), inputPath),
  );
  const uniquePaths = [...new Set(absolutePaths)].sort();
  const rows = uniquePaths.map((absolutePath) => {
    const relativePath = relative(canonicalRoot, absolutePath);
    const stat = lstatSync(absolutePath);
    if (relativePath === "" || relativePath.startsWith("..") ||
        stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error("harness_tool_dependency_path_invalid");
    }
    const bytes = readFileSync(absolutePath);
    return {
      path: relativePath,
      byteLength: bytes.length,
      sha256: sha256(bytes),
    };
  });
  const harnessRelative = relative(canonicalRoot, canonicalHarness);
  if (rows.length === 0 ||
      !rows.some((row) => row.path === harnessRelative)) {
    throw new Error("harness_tool_entry_missing_from_closure");
  }
  return {
    fileCount: rows.length,
    sha256: sha256(canonicalJson(rows)),
    rows,
  };
}

export interface ParserProductionReceiptHarnessValidationInput {
  readonly officialCurrentBuild:
    ParserReceiptHarnessOfficialCurrentBuildIdentity;
  readonly formalSpecPath: string;
  readonly formalSpecSha256: string;
  readonly formalEbnfSha256: string;
  readonly parserPath: string;
  readonly parserSha256: string;
  readonly receiptProducerPath: string;
  readonly receiptProducerSha256: string;
  readonly driverEntryPath: string;
  readonly driverEntrySha256: string;
  readonly bootstrapPath: string;
  readonly bootstrapSha256: string;
  readonly harnessPath: string;
  readonly harnessSha256: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly receiptPath: string;
  readonly receiptSha256: string;
  readonly dependencyClosureSha256: string;
  readonly toolClosureSha256: string;
  readonly buildCompilerExecutablePath: string;
  readonly buildCompilerExecutableSha256: string;
  readonly buildCompilerVersionSha256: string;
  readonly runtimeExecutablePath: string;
  readonly runtimeExecutableSha256: string;
  readonly runtimeVersion: string;
}

export interface ParserReceiptHarnessOfficialCurrentBuildIdentity {
  readonly bindingPath: string;
  readonly bindingSha256: string;
  readonly officialBuildReceiptPath: string;
  readonly officialBuildReceiptSha256: string;
  readonly sourceSnapshotManifestPath: string;
  readonly sourceSnapshotManifestSha256: string;
  readonly sourceSnapshotRoot: string;
  readonly sourceSnapshotClosureSha256: string;
  readonly officialDriverPath: string;
  readonly officialDriverSha256: string;
}

function parserReceiptHarnessArtifactFileIdentity(
  path: string,
  expectedSha256: unknown,
  expectedByteLength: unknown,
  expectedInode: unknown,
  label: string,
): void {
  if (typeof path !== "string" || path === "" || path !== resolve(path) ||
      typeof expectedSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(expectedSha256) ||
      typeof expectedByteLength !== "number" ||
      !Number.isSafeInteger(expectedByteLength) ||
      expectedByteLength < 0) {
    throw new Error(`${label}_file_identity_invalid`);
  }
  const stat = lstatSync(path, {bigint: true});
  if (stat.isSymbolicLink() || !stat.isFile() ||
      stat.size > BigInt(Number.MAX_SAFE_INTEGER) ||
      Number(stat.size) !== expectedByteLength ||
      (expectedInode !== undefined &&
       (typeof expectedInode !== "string" ||
        expectedInode !== stat.ino.toString())) ||
      sha256(readFileSync(path)) !== expectedSha256) {
    throw new Error(`${label}_file_identity_invalid`);
  }
}

export function validateParserProductionReceiptHarnessArtifactFiles(
  manifestValue: unknown,
  manifestPath: string,
): void {
  if (manifestValue === null || typeof manifestValue !== "object" ||
      Array.isArray(manifestValue) ||
      manifestPath === "" || manifestPath !== resolve(manifestPath)) {
    throw new Error("harness_artifact_manifest_invalid");
  }
  const manifest = manifestValue as any;
  const manifestStat = lstatSync(manifestPath);
  if (manifestStat.isSymbolicLink() || !manifestStat.isFile()) {
    throw new Error("harness_artifact_manifest_invalid");
  }
  const artifactRoot = dirname(manifestPath);
  if (!Array.isArray(manifest.drivers) ||
      !Array.isArray(manifest.sources) ||
      !Array.isArray(manifest.receipts)) {
    throw new Error("harness_artifact_sets_invalid");
  }
  for (const driver of manifest.drivers) {
    if (typeof driver?.path !== "string" ||
        driver?.role !== basename(dirname(resolve(driver.path))) ||
        basename(resolve(driver.path)) !== "cheng" ||
        dirname(dirname(resolve(driver.path))) !== artifactRoot) {
      throw new Error("harness_driver_file_root_invalid");
    }
    parserReceiptHarnessArtifactFileIdentity(
      driver.path,
      driver.sha256,
      driver.byteLength,
      driver.inode,
      "harness_driver",
    );
  }
  for (const source of manifest.sources) {
    parserReceiptHarnessArtifactFileIdentity(
      source?.path,
      source?.sha256,
      source?.byteLength,
      undefined,
      "harness_source",
    );
  }
  for (const receipt of manifest.receipts) {
    if (typeof receipt?.path !== "string" ||
        dirname(resolve(receipt.path)) !== artifactRoot) {
      throw new Error("harness_receipt_file_root_invalid");
    }
    parserReceiptHarnessArtifactFileIdentity(
      receipt.path,
      receipt.sha256,
      receipt.byteLength,
      receipt.inode,
      "harness_receipt",
    );
  }
}

export function validateParserProductionReceiptHarnessSourcePlan(
  manifestValue: unknown,
  expectedSources: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly byteLength: number;
  }[],
): void {
  if (manifestValue === null || typeof manifestValue !== "object" ||
      Array.isArray(manifestValue) ||
      !Array.isArray((manifestValue as any).sources) ||
      expectedSources.length === 0) {
    throw new Error("harness_source_plan_identity_invalid");
  }
  const paths = new Set<string>();
  for (const source of expectedSources) {
    if (source === null || typeof source !== "object" ||
        source.path !== resolve(source.path) ||
        paths.has(source.path) ||
        !/^[0-9a-f]{64}$/.test(source.sha256) ||
        !Number.isSafeInteger(source.byteLength) ||
        source.byteLength < 0) {
      throw new Error("harness_source_plan_identity_invalid");
    }
    paths.add(source.path);
  }
  if (canonicalJson((manifestValue as any).sources) !==
      canonicalJson(expectedSources)) {
    throw new Error("harness_source_plan_identity_invalid");
  }
}

export function validateParserProductionReceiptHarnessIdentity(
  manifestValue: unknown,
  input: ParserProductionReceiptHarnessValidationInput,
): HarnessReceiptIdentity {
  assertExactKeys(manifestValue, [
    "schema",
    "status",
    "officialCurrentBuild",
    "formalEbnfSha256",
    "formalSpec",
    "parser",
    "receiptProducer",
    "driverEntry",
    "bootstrap",
    "harness",
    "dependencyClosure",
    "toolClosure",
    "buildCompiler",
    "compilerProfile",
    "runtime",
    "drivers",
    "sources",
    "receipts",
  ], "harness");
  const manifest = manifestValue;
  if (manifest.schema !== CHENG_PARSER_PRODUCTION_RECEIPT_HARNESS_SCHEMA) {
    throw new Error("harness_schema_invalid");
  }
  if (manifest.status !== "accepted" ||
      manifest.formalEbnfSha256 !== input.formalEbnfSha256) {
    throw new Error("formal_ebnf_identity_invalid");
  }
  assertExactKeys(manifest.officialCurrentBuild, [
    "bindingPath",
    "bindingSha256",
    "officialBuildReceiptPath",
    "officialBuildReceiptSha256",
    "sourceSnapshotManifestPath",
    "sourceSnapshotManifestSha256",
    "sourceSnapshotRoot",
    "sourceSnapshotClosureSha256",
    "officialDriverPath",
    "officialDriverSha256",
  ], "harness_official_current_build");
  for (const key of [
    "bindingSha256",
    "officialBuildReceiptSha256",
    "sourceSnapshotManifestSha256",
    "sourceSnapshotClosureSha256",
    "officialDriverSha256",
  ] as const) {
    assertSha256(
      manifest.officialCurrentBuild[key],
      `harness_official_current_build_${key}`,
    );
  }
  const currentBuildPaths = [
    manifest.officialCurrentBuild.bindingPath,
    manifest.officialCurrentBuild.officialBuildReceiptPath,
    manifest.officialCurrentBuild.sourceSnapshotManifestPath,
    manifest.officialCurrentBuild.sourceSnapshotRoot,
    manifest.officialCurrentBuild.officialDriverPath,
  ];
  if (currentBuildPaths.some((path) =>
        typeof path !== "string" || path !== resolve(path)) ||
      basename(manifest.officialCurrentBuild.bindingPath) !==
        "current-official-binding.kv" ||
      basename(manifest.officialCurrentBuild.officialBuildReceiptPath) !==
        "cheng.current-build-receipt.kv" ||
      basename(manifest.officialCurrentBuild.sourceSnapshotManifestPath) !==
        "cheng-source-snapshot.manifest.txt" ||
      basename(manifest.officialCurrentBuild.sourceSnapshotRoot) !==
        "source-snapshot" ||
      basename(manifest.officialCurrentBuild.officialDriverPath) !== "cheng" ||
      canonicalJson(manifest.officialCurrentBuild) !==
        canonicalJson(input.officialCurrentBuild)) {
    throw new Error("harness_official_current_build_identity_invalid");
  }
  const expectedDriverEntryPath = join(
    resolve(dirname(input.formalSpecPath), ".."),
    CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
  );
  const expectedSourceRoot = resolve(dirname(input.formalSpecPath), "..");
  if (input.formalSpecPath !== resolve(input.formalSpecPath) ||
      input.driverEntryPath !== expectedDriverEntryPath ||
      input.officialCurrentBuild.sourceSnapshotRoot !== expectedSourceRoot ||
      input.officialCurrentBuild.sourceSnapshotManifestPath !== join(
        dirname(expectedSourceRoot),
        "cheng-source-snapshot.manifest.txt",
      )) {
    throw new Error("driver_entry_current_authority_invalid");
  }
  for (const [label, row, expectedPath, expectedSha] of [
    [
      "formal_spec",
      manifest.formalSpec,
      input.formalSpecPath,
      input.formalSpecSha256,
    ],
    ["parser", manifest.parser, input.parserPath, input.parserSha256],
    [
      "receipt_producer",
      manifest.receiptProducer,
      input.receiptProducerPath,
      input.receiptProducerSha256,
    ],
  ] as const) {
    assertExactKeys(row, ["path", "sha256"], label);
    if (row.path !== expectedPath || row.sha256 !== expectedSha) {
      throw new Error(`${label}_identity_invalid`);
    }
  }
  for (const [label, row, expectedPath, expectedSha] of [
    [
      "driver_entry",
      manifest.driverEntry,
      input.driverEntryPath,
      input.driverEntrySha256,
    ],
    [
      "bootstrap",
      manifest.bootstrap,
      input.bootstrapPath,
      input.bootstrapSha256,
    ],
    [
      "harness_tool",
      manifest.harness,
      input.harnessPath,
      input.harnessSha256,
    ],
  ] as const) {
    assertExactKeys(row, ["path", "sha256"], label);
    assertSha256(row.sha256, label);
    if (row.path !== expectedPath || row.sha256 !== expectedSha) {
      throw new Error(`${label}_identity_invalid`);
    }
  }

  assertExactKeys(
    manifest.dependencyClosure,
    ["fileCount", "sha256", "rows"],
    "dependency_closure",
  );
  if (!Array.isArray(manifest.dependencyClosure.rows) ||
      !Number.isSafeInteger(manifest.dependencyClosure.fileCount) ||
      manifest.dependencyClosure.fileCount <= 0 ||
      manifest.dependencyClosure.fileCount !==
        manifest.dependencyClosure.rows.length) {
    throw new Error("dependency_closure_count_invalid");
  }
  const closurePaths = new Set<string>();
  for (const row of manifest.dependencyClosure.rows) {
    assertExactKeys(row, ["path", "byteLength", "sha256"], "closure_row");
    assertSha256(row.sha256, "closure_row");
    if (typeof row.path !== "string" || row.path.length === 0 ||
        closurePaths.has(row.path) ||
        !Number.isSafeInteger(row.byteLength) || row.byteLength < 0) {
      throw new Error("dependency_closure_row_invalid");
    }
    closurePaths.add(row.path);
  }
  assertSha256(manifest.dependencyClosure.sha256, "dependency_closure");
  if (sha256(canonicalJson(manifest.dependencyClosure.rows)) !==
        manifest.dependencyClosure.sha256 ||
      manifest.dependencyClosure.sha256 !==
        input.dependencyClosureSha256) {
    throw new Error("dependency_closure_identity_invalid");
  }

  assertExactKeys(
    manifest.toolClosure,
    ["fileCount", "sha256", "rows"],
    "tool_closure",
  );
  if (!Array.isArray(manifest.toolClosure.rows) ||
      !Number.isSafeInteger(manifest.toolClosure.fileCount) ||
      manifest.toolClosure.fileCount <= 0 ||
      manifest.toolClosure.fileCount !== manifest.toolClosure.rows.length) {
    throw new Error("tool_closure_count_invalid");
  }
  const toolPaths = new Set<string>();
  for (const row of manifest.toolClosure.rows) {
    assertExactKeys(row, ["path", "byteLength", "sha256"], "tool_closure_row");
    assertSha256(row.sha256, "tool_closure_row");
    if (typeof row.path !== "string" || row.path.length === 0 ||
        row.path.startsWith("/") || row.path.split("/").includes("..") ||
        toolPaths.has(row.path) ||
        !Number.isSafeInteger(row.byteLength) || row.byteLength <= 0) {
      throw new Error("tool_closure_row_invalid");
    }
    toolPaths.add(row.path);
  }
  assertSha256(manifest.toolClosure.sha256, "tool_closure");
  if (sha256(canonicalJson(manifest.toolClosure.rows)) !==
        manifest.toolClosure.sha256 ||
      manifest.toolClosure.sha256 !== input.toolClosureSha256) {
    throw new Error("tool_closure_identity_invalid");
  }

  assertExactKeys(
    manifest.buildCompiler,
    [
      "command",
      "executablePath",
      "executableSha256",
      "versionSha256",
    ],
    "harness_build_compiler",
  );
  assertSha256(
    manifest.buildCompiler.executableSha256,
    "harness_build_compiler",
  );
  assertSha256(
    manifest.buildCompiler.versionSha256,
    "harness_build_compiler_version",
  );
  if (manifest.buildCompiler.command !==
        CHENG_PARSER_RECEIPT_BUILD_COMPILER ||
      manifest.buildCompiler.executablePath !==
        input.buildCompilerExecutablePath ||
      manifest.buildCompiler.executableSha256 !==
        input.buildCompilerExecutableSha256 ||
      manifest.buildCompiler.versionSha256 !==
        input.buildCompilerVersionSha256) {
    throw new Error("harness_build_compiler_identity_invalid");
  }

  assertExactKeys(
    manifest.runtime,
    ["executablePath", "executableSha256", "version"],
    "harness_runtime",
  );
  assertSha256(manifest.runtime.executableSha256, "harness_runtime");
  if (typeof manifest.runtime.executablePath !== "string" ||
      manifest.runtime.executablePath.length === 0 ||
      manifest.runtime.executablePath !== input.runtimeExecutablePath ||
      manifest.runtime.executableSha256 !==
        input.runtimeExecutableSha256 ||
      manifest.runtime.version !== input.runtimeVersion) {
    throw new Error("harness_runtime_identity_invalid");
  }

  assertExactKeys(
    manifest.compilerProfile,
    ["schema", "action", "target", "env", "unsetEnv", "sha256"],
    "harness_compiler_profile",
  );
  const expectedCompilerProfile = parserReceiptHarnessCompilerProfile();
  if (canonicalJson(manifest.compilerProfile) !==
      canonicalJson(expectedCompilerProfile)) {
    throw new Error("harness_compiler_profile_identity_invalid");
  }

  if (!Array.isArray(manifest.drivers) || manifest.drivers.length !== 2) {
    throw new Error("harness_driver_count_invalid");
  }
  const expectedRoles = ["receipt_driver_a", "receipt_driver_b"];
  for (const driver of manifest.drivers) {
    assertExactKeys(
      driver,
      ["role", "path", "sha256", "inode", "byteLength"],
      "harness_driver",
    );
    assertSha256(driver.sha256, "harness_driver");
    if (typeof driver.role !== "string" ||
        !expectedRoles.includes(driver.role) ||
        typeof driver.path !== "string" || driver.path.length === 0 ||
        typeof driver.inode !== "string" || driver.inode.length === 0 ||
        !Number.isSafeInteger(driver.byteLength) || driver.byteLength <= 0) {
      throw new Error("harness_driver_identity_invalid");
    }
  }
  if (new Set(manifest.drivers.map((row: any) => row.role)).size !== 2 ||
      manifest.drivers[0].inode === manifest.drivers[1].inode ||
      manifest.drivers[0].sha256 !== manifest.drivers[1].sha256 ||
      manifest.drivers[0].byteLength !== manifest.drivers[1].byteLength ||
      basename(manifest.drivers[0].path) !== "cheng" ||
      basename(manifest.drivers[1].path) !== "cheng" ||
      dirname(manifest.drivers[0].path) ===
        dirname(manifest.drivers[1].path)) {
    throw new Error("harness_driver_fixed_point_invalid");
  }

  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error("harness_source_count_invalid");
  }
  const sourcePaths = new Set<string>();
  for (const source of manifest.sources) {
    assertExactKeys(
      source,
      ["path", "sha256", "byteLength"],
      "harness_source",
    );
    assertSha256(source.sha256, "harness_source");
    if (typeof source.path !== "string" || source.path.length === 0 ||
        sourcePaths.has(source.path) ||
        !Number.isSafeInteger(source.byteLength) || source.byteLength < 0) {
      throw new Error("harness_source_identity_invalid");
    }
    sourcePaths.add(source.path);
  }
  const source = manifest.sources.find(
    (row: any) => row.path === input.sourcePath,
  );
  if (source === undefined || source.sha256 !== input.sourceSha256) {
    throw new Error("harness_source_not_bound");
  }

  if (!Array.isArray(manifest.receipts) ||
      manifest.receipts.length !== manifest.sources.length * 2) {
    throw new Error("harness_receipt_count_invalid");
  }
  const receiptPaths = new Set<string>();
  for (const receipt of manifest.receipts) {
    assertExactKeys(receipt, [
      "path",
      "sha256",
      "inode",
      "byteLength",
      "sourcePath",
      "driverRole",
      "driverSha256",
      "parserTraceRootSha256",
    ], "harness_receipt");
    assertSha256(receipt.sha256, "harness_receipt");
    assertSha256(receipt.driverSha256, "harness_receipt_driver");
    assertSha256(receipt.parserTraceRootSha256, "parser_trace_root");
    const driver = manifest.drivers.find(
      (row: any) => row.role === receipt.driverRole,
    );
    if (typeof receipt.path !== "string" || receipt.path.length === 0 ||
        receiptPaths.has(receipt.path) ||
        typeof receipt.inode !== "string" || receipt.inode.length === 0 ||
        !Number.isSafeInteger(receipt.byteLength) || receipt.byteLength <= 0 ||
        !sourcePaths.has(receipt.sourcePath) ||
        driver === undefined || driver.sha256 !== receipt.driverSha256) {
      throw new Error("harness_receipt_identity_invalid");
    }
    receiptPaths.add(receipt.path);
  }
  for (const sourcePath of sourcePaths) {
    const pair = manifest.receipts.filter(
      (row: any) => row.sourcePath === sourcePath,
    );
    if (pair.length !== 2 ||
        new Set(pair.map((row: any) => row.driverRole)).size !== 2 ||
        pair[0].inode === pair[1].inode ||
        pair[0].parserTraceRootSha256 !== pair[1].parserTraceRootSha256) {
      throw new Error("harness_receipt_fixed_point_invalid");
    }
  }
  const receipt = manifest.receipts.find(
    (row: any) =>
      row.path === input.receiptPath &&
      row.sha256 === input.receiptSha256 &&
      row.sourcePath === input.sourcePath,
  );
  if (receipt === undefined) throw new Error("harness_receipt_not_bound");
  return receipt as HarnessReceiptIdentity;
}

export function buildEbnfParserNodeMap(
  formalSpecBytes: Buffer,
  parserBytes: Buffer,
  producerClaimsBytes: Buffer,
  options: EbnfParserNodeMapBuildOptions = {},
): EbnfParserNodeMap {
  const contract = buildChengGrammarObligationContract(formalSpecBytes);
  const productions = extractFormalProductions(formalSpecBytes.toString("utf8"));
  if (productions.length !== contract.productionCount) {
    throw new Error("formal production extraction count mismatch");
  }
  const rootHashes = new Map<string, string>();
  for (const obligation of contract.obligations) {
    if (obligation.kind === "production" && obligation.structuralPath === "root") {
      if (rootHashes.has(obligation.production)) {
        throw new Error(`duplicate production root ${obligation.production}`);
      }
      rootHashes.set(obligation.production, obligation.fragmentSha256);
    }
  }

  const claims = parseClaims(producerClaimsBytes.toString("utf8"));
  const claimByName = new Map<string, ParserProducerClaim>();
  for (const claim of claims.rows) {
    if (claimByName.has(claim.name)) throw new Error(`duplicate producer claim ${claim.name}`);
    claimByName.set(claim.name, claim);
  }
  if (claimByName.size !== productions.length) {
    throw new Error(`producer claim count=${claimByName.size}, productions=${productions.length}`);
  }

  const parserSource = parserBytes.toString("utf8");
  const declarationIndex = parserDeclarationIndex(parserSource);
  const functionReceipts = declarationIndex.functionReceipts;
  const parserSha256 = sha256(parserBytes);
  const obligationsByProduction = new Map<string, typeof contract.obligations>();
  for (const obligation of contract.obligations) {
    if (obligation.disposition !== "required") continue;
    const rows = obligationsByProduction.get(obligation.production) ?? [];
    obligationsByProduction.set(obligation.production, [...rows, obligation]);
  }
  const provisionalRows = productions.map((production, index): EbnfParserNodeMapRow => {
    const claim = claimByName.get(production.name);
    if (claim === undefined) throw new Error(`producer claim missing: ${production.name}`);
    const typeSyntaxContract =
      CURRENT_TYPE_SYNTAX_PRODUCER_CONTRACTS[production.name];
    if (typeSyntaxContract !== undefined &&
        (claim.spanModel !== typeSyntaxContract.spanModel ||
         canonicalJson([...claim.parserFunctions].sort()) !==
           canonicalJson(
             [...typeSyntaxContract.parserFunctions].sort(),
           ) ||
         canonicalJson([...claim.nodeKinds].sort()) !==
           canonicalJson([...typeSyntaxContract.nodeKinds].sort()))) {
      throw new Error(
        `${production.name} current TypeSyntax producer declaration invalid`,
      );
    }
    const patternContract =
      CURRENT_PATTERN_PRODUCER_CONTRACTS[production.name];
    if (patternContract !== undefined) {
      assertCurrentPatternProducerClaim(claim);
    }
    const annotationContract =
      CURRENT_ANNOTATION_PRODUCER_CONTRACTS[production.name];
    if (annotationContract !== undefined &&
        (claim.spanModel !== annotationContract.spanModel ||
         canonicalJson([...claim.parserFunctions].sort()) !==
           canonicalJson([...annotationContract.parserFunctions].sort()) ||
         canonicalJson([...claim.nodeKinds].sort()) !==
           canonicalJson([...annotationContract.nodeKinds].sort()))) {
      throw new Error(
        `${production.name} current parser producer declaration invalid`,
      );
    }
    const conceptTraitContract =
      CURRENT_CONCEPT_TRAIT_PRODUCER_CONTRACTS[production.name];
    if (conceptTraitContract !== undefined &&
        (claim.spanModel !== conceptTraitContract.spanModel ||
         canonicalJson([...claim.parserFunctions].sort()) !==
           canonicalJson(
             [...conceptTraitContract.parserFunctions].sort(),
           ) ||
         canonicalJson([...claim.nodeKinds].sort()) !==
           canonicalJson([...conceptTraitContract.nodeKinds].sort()))) {
      throw new Error(
        `${production.name} current parser producer declaration invalid`,
      );
    }
    const exactSurfaceContract =
      CURRENT_EXACT_SURFACE_PRODUCER_CONTRACTS[production.name];
    if (exactSurfaceContract !== undefined &&
        (claim.spanModel !== exactSurfaceContract.spanModel ||
         canonicalJson([...claim.parserFunctions].sort()) !==
           canonicalJson(
             [...exactSurfaceContract.parserFunctions].sort(),
           ) ||
         canonicalJson([...claim.nodeKinds].sort()) !==
           canonicalJson([...exactSurfaceContract.nodeKinds].sort()))) {
      throw new Error(
        `${production.name} current exact parser producer declaration invalid`,
      );
    }
    const bodyHash = sha256(production.body);
    if (rootHashes.get(production.name) !== bodyHash) {
      throw new Error(`production body hash mismatch: ${production.name}`);
    }
    const parserFns = claim.parserFunctions.map((name) => {
      const receipt = functionReceipts.get(name);
      if (receipt === undefined) throw new Error(`parser producer function missing: ${production.name}/${name}`);
      return receipt;
    });
    const nodeKindReceipts = claim.nodeKinds
      .filter((name) => !name.startsWith("<"))
      .map((name) => nodeKindReceipt(declarationIndex, name));
    const realNodeKinds = claim.nodeKinds.filter((name) => !name.startsWith("<"));
    const producerDeclared = parserFns.length > 0 || realNodeKinds.length > 0;
    if (!producerDeclared && claim.spanModel !== "none") {
      throw new Error(`producer declaration lacks evidence: ${production.name}`);
    }
    if (producerDeclared && claim.spanModel === "none") {
      throw new Error(`producer declaration lacks span model: ${production.name}`);
    }
    if (["type_syntax_span", "pattern_span", "annotation_span", "annotation_arg_span"]
          .includes(claim.spanModel) && realNodeKinds.length === 0) {
      throw new Error(`structured producer node missing: ${production.name}`);
    }
    const required = obligationsByProduction.get(production.name) ?? [];
    const receiptPayload = {
      production: production.name,
      parserSha256,
      parserFunctions: parserFns,
      nodeKinds: nodeKindReceipts,
      spanModel: claim.spanModel,
      requiredObligationIds: required.map((entry) => entry.obligationId),
    };
    return {
      production: index + 1,
      name: production.name,
      body_ref: {body: production.body, sha256: bodyHash},
      parser_fn: parserFns,
      node_kinds: claim.nodeKinds,
      node_kind_receipts: nodeKindReceipts,
      span_model: claim.spanModel,
      status: producerDeclared ? "PARTIAL" : "UNMAPPED",
      receipt_ready: false,
      required_obligation_count: required.length,
      witnessed_required_count: 0,
      missing_required_count: required.length,
      missing_required_obligation_ids: required.map((entry) => entry.obligationId),
      witness_projections: [],
      witness_receipt_sha256s: [],
      producer_receipt_sha256: sha256(canonicalJson(receiptPayload)),
      notes: claim.notes,
    };
  });
  for (const name of claimByName.keys()) {
    if (!rootHashes.has(name)) throw new Error(`producer claim is not a formal production: ${name}`);
  }

  const mapRows = new Map<string, MapRow>(
    provisionalRows.map((row) => [row.name, row]),
  );
  const witnessedByProduction =
    new Map<string, Map<string, Set<string>>>();
  const witnessedByEvidence = new Map<
    string,
    Map<string, Map<string, Set<string>>>
  >();
  const witnessProjectionsByEvidence = new Map<
    string,
    Map<string, readonly ParserOwnedWitnessProjection[]>
  >();
  const receiptProducerSha256 = options.receiptProducerBytes === undefined
    ? ""
    : sha256(options.receiptProducerBytes);
  const receiptEvidenceInputs = options.receiptEvidence ?? [];
  const validatedArtifactManifests = new Set<string>();
  const evidenceRows = receiptEvidenceInputs.map((evidence) => {
    const base = {
      sourcePath: evidence.sourcePath,
      receiptPath: evidence.receiptPath,
      manifestPath: evidence.manifestPath,
      sourceSha256: sha256(evidence.sourceBytes),
      receiptSha256: sha256(evidence.receiptBytes),
      manifestSha256: sha256(evidence.manifestBytes),
    };
    try {
      const manifest = parseUniqueCurrentJson(
        evidence.manifestBytes.toString("utf8"),
        "parser_receipt_harness_manifest",
      ) as unknown;
      if (!readFileSync(evidence.manifestPath).equals(evidence.manifestBytes) ||
          !readFileSync(evidence.sourcePath).equals(evidence.sourceBytes) ||
          !readFileSync(evidence.receiptPath).equals(evidence.receiptBytes)) {
        throw new Error("harness_evidence_file_bytes_invalid");
      }
      const artifactManifestKey =
        `${evidence.manifestPath}\0${base.manifestSha256}`;
      if (!validatedArtifactManifests.has(artifactManifestKey)) {
        validateParserProductionReceiptHarnessArtifactFiles(
          manifest,
          evidence.manifestPath,
        );
        validatedArtifactManifests.add(artifactManifestKey);
      }
      const manifestRecord = manifest as any;
      const siblingEvidence = receiptEvidenceInputs.filter(
        (row) => sha256(row.manifestBytes) === base.manifestSha256,
      );
      const evidencePaths = siblingEvidence.map(
        (row) => `${row.sourcePath}\0${row.receiptPath}`,
      );
      const manifestPaths = Array.isArray(manifestRecord?.receipts)
        ? manifestRecord.receipts.map(
          (row: any) => `${row.sourcePath}\0${row.path}`,
        )
        : [];
      if (new Set(evidencePaths).size !== evidencePaths.length ||
          canonicalJson([...evidencePaths].sort()) !==
            canonicalJson([...manifestPaths].sort())) {
        throw new Error("harness_evidence_set_invalid");
      }
      if (receiptProducerSha256 === "") {
        throw new Error("receipt_producer_sha_mismatch");
      }
      if (options.harnessOfficialCurrentBuild === undefined) {
        throw new Error("harness_official_current_build_missing");
      }
      const receiptManifest =
        validateParserProductionReceiptHarnessIdentity(manifest, {
          officialCurrentBuild: options.harnessOfficialCurrentBuild,
          formalSpecPath: options.harnessFormalSpecPath ?? "",
          formalSpecSha256: contract.formalSpecSha256,
          formalEbnfSha256: contract.ebnfSha256,
          parserPath: options.harnessParserPath ?? "",
          parserSha256,
          receiptProducerPath:
            options.harnessReceiptProducerPath ?? "",
          receiptProducerSha256,
          driverEntryPath: options.harnessDriverEntryPath ?? "",
          driverEntrySha256:
            options.harnessDriverEntrySha256 ?? "",
          bootstrapPath: options.harnessBootstrapPath ?? "",
          bootstrapSha256: options.harnessBootstrapSha256 ?? "",
          harnessPath: options.harnessPath ?? "",
          harnessSha256: options.harnessSha256 ?? "",
          sourcePath: evidence.sourcePath,
          sourceSha256: base.sourceSha256,
          receiptPath: evidence.receiptPath,
          receiptSha256: base.receiptSha256,
          dependencyClosureSha256:
            options.harnessDependencyClosureSha256 ?? "",
          toolClosureSha256:
            options.harnessToolClosureSha256 ?? "",
          buildCompilerExecutablePath:
            options.harnessBuildCompilerExecutablePath ?? "",
          buildCompilerExecutableSha256:
            options.harnessBuildCompilerExecutableSha256 ?? "",
          buildCompilerVersionSha256:
            options.harnessBuildCompilerVersionSha256 ?? "",
          runtimeExecutablePath:
            options.harnessRuntimeExecutablePath ?? "",
          runtimeExecutableSha256:
            options.harnessRuntimeExecutableSha256 ?? "",
          runtimeVersion: options.harnessRuntimeVersion ?? "",
        });
      const receiptJson = parseUniqueCurrentJson(
        evidence.receiptBytes.toString("utf8"),
        "driver_parse_receipt",
      ) as any;
      const expectedChengRoot = resolve(
        dirname(options.harnessFormalSpecPath ?? ""),
        "..",
      );
      if (receiptJson.schema !== "cheng_driver_parse_receipt" ||
          receiptJson.stage !== "parser" ||
          receiptJson.relativePath !== evidence.sourcePath ||
          receiptJson.sourcePath !== evidence.sourcePath ||
          receiptJson.sourceSha256 !== base.sourceSha256 ||
          receiptJson.driverBytesSha256 !== receiptManifest.driverSha256 ||
          receiptJson.toolchainManifest?.driverPath !==
            receiptManifest.path ||
          resolve(receiptJson.toolchainManifest?.packageRoot ?? "") !==
            expectedChengRoot ||
          resolve(receiptJson.toolchainManifest?.rootDir ?? "") !==
            expectedChengRoot ||
          receiptJson.parserTraceRootSha256 !==
            receiptManifest.parserTraceRootSha256) {
        throw new Error("harness_receipt_identity_invalid");
      }
      const bound = bindCurrentReceiptAgainstObligations(
        evidence.receiptBytes.toString("utf8"),
        evidence.sourceBytes.toString("utf8"),
        formalSpecBytes.toString("utf8"),
        contract.obligations,
        tokenKindNamesFromParserSource(parserSource),
        mapRows,
        valueExprKindNamesFromParserSource(parserSource),
      );
      const evidenceWitnesses =
        new Map<string, Map<string, Set<string>>>();
      const evidenceWitnessProjections =
        new Map<string, ParserOwnedWitnessProjection[]>();
      for (const result of bound.results) {
        const projection = parserOwnedWitnessProjection(
          result,
          mapRows.get(result.production),
        );
        if (projection === null) continue;
        const rows =
          evidenceWitnesses.get(result.production) ?? new Map();
        const receipts = rows.get(result.obligationId) ?? new Set();
        receipts.add(projection.receipt_sha256);
        rows.set(result.obligationId, receipts);
        evidenceWitnesses.set(result.production, rows);
        const projections =
          evidenceWitnessProjections.get(result.production) ?? [];
        projections.push(projection);
        evidenceWitnessProjections.set(result.production, projections);
      }
      witnessedByEvidence.set(evidence.receiptPath, evidenceWitnesses);
      witnessProjectionsByEvidence.set(
        evidence.receiptPath,
        evidenceWitnessProjections,
      );
      return {...base, accepted: true, reason: ""};
    } catch (error) {
      return {
        ...base,
        accepted: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const witnessedIds = (receiptPath: string): readonly string[] => {
    const byProduction = witnessedByEvidence.get(receiptPath);
    if (byProduction === undefined) return [];
    return [...byProduction.entries()]
      .flatMap(([production, rows]) =>
        [...rows.keys()].map(
          (obligationId) => `${production}\0${obligationId}`))
      .sort();
  };
  const fixedPointRejectedReceiptPaths =
    parserWitnessFixedPointRejectedReceiptPaths(
      evidenceRows.map((row) => ({
        manifestSha256: row.manifestSha256,
        sourcePath: row.sourcePath,
        receiptPath: row.receiptPath,
        accepted: row.accepted,
        witnessedObligationIds: witnessedIds(row.receiptPath),
      })),
    );
  const admittedEvidenceRows = evidenceRows.map((row) =>
    fixedPointRejectedReceiptPaths.has(row.receiptPath)
      ? {
          ...row,
          accepted: false,
          reason: row.reason === ""
            ? "harness_obligation_witness_fixed_point_invalid"
            : row.reason,
        }
      : row);
  for (const row of admittedEvidenceRows) {
    if (!row.accepted) continue;
    const byProduction = witnessedByEvidence.get(row.receiptPath);
    if (byProduction === undefined) {
      throw new Error("accepted_evidence_witness_set_missing");
    }
    for (const [production, witnesses] of byProduction) {
      const rows = witnessedByProduction.get(production) ?? new Map();
      for (const [obligationId, receiptSha256s] of witnesses) {
        const receipts = rows.get(obligationId) ?? new Set();
        for (const receiptSha256 of receiptSha256s) {
          receipts.add(receiptSha256);
        }
        rows.set(obligationId, receipts);
      }
      witnessedByProduction.set(production, rows);
    }
  }
  const witnessProjectionsByProduction =
    new Map<string, ParserOwnedWitnessProjection[]>();
  for (const row of admittedEvidenceRows) {
    if (!row.accepted) continue;
    const byProduction =
      witnessProjectionsByEvidence.get(row.receiptPath);
    if (byProduction === undefined) {
      throw new Error("accepted_evidence_witness_projection_missing");
    }
    for (const [production, projections] of byProduction) {
      const rows =
        witnessProjectionsByProduction.get(production) ?? [];
      rows.push(...projections);
      witnessProjectionsByProduction.set(production, rows);
    }
  }
  const counts = {
    total: productions.length,
    MAPPED: 0,
    PARTIAL: 0,
    UNMAPPED: 0,
    requiredObligationCount: 0,
    witnessedRequiredCount: 0,
    missingRequiredCount: 0,
  };
  const rows = provisionalRows.map((row): EbnfParserNodeMapRow => {
    const witnessed = witnessedByProduction.get(row.name) ?? new Map();
    const witnessProjections = [
      ...new Map<string, ParserOwnedWitnessProjection>(
        (witnessProjectionsByProduction.get(row.name) ?? [])
          .map((projection) => [
            canonicalJson(projection),
            projection,
          ]),
      ).values(),
    ].sort((left, right) => {
      const leftKey =
        `${left.obligation_id}\0${left.receipt_sha256}`;
      const rightKey =
        `${right.obligation_id}\0${right.receipt_sha256}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    const missing = row.missing_required_obligation_ids.filter(
      (id) => !witnessed.has(id),
    );
    const producerDeclared = row.parser_fn.length > 0 ||
      row.node_kind_receipts.length > 0;
    const status: ParserMapStatus = missing.length === 0
      ? "MAPPED"
      : producerDeclared || witnessed.size > 0
        ? "PARTIAL"
        : "UNMAPPED";
    counts[status] += 1;
    counts.requiredObligationCount += row.required_obligation_count;
    counts.witnessedRequiredCount += witnessed.size;
    counts.missingRequiredCount += missing.length;
    return {
      ...row,
      status,
      receipt_ready: missing.length === 0,
      witnessed_required_count: witnessed.size,
      missing_required_count: missing.length,
      missing_required_obligation_ids: missing,
      witness_projections: witnessProjections,
      witness_receipt_sha256s:
        [...new Set([...witnessed.values()].flatMap(
          (receipts) => [...receipts],
        ))].sort(),
    };
  });
  const doc: EbnfParserNodeMap = {
    schema: CHENG_EBNF_PARSER_NODE_MAP_SCHEMA,
    spec: {
      path: "docs/cheng-formal-spec.md",
      formalSpecSha256: contract.formalSpecSha256,
      ebnfSha256: contract.ebnfSha256,
      productionCount: contract.productionCount,
    },
    parser: {
      path: "src/core/lang/parser.cheng",
      sha256: parserSha256,
      lineCount: declarationIndex.lineCount,
    },
    producerDeclarations: {
      path: "fixtures/semantic/ebnf_parser_producer_claims.json",
      sha256: sha256(producerClaimsBytes),
    },
    receiptEvidence: {
      inputCount: admittedEvidenceRows.length,
      acceptedCount:
        admittedEvidenceRows.filter((row) => row.accepted).length,
      rejectedCount:
        admittedEvidenceRows.filter((row) => !row.accepted).length,
      rows: admittedEvidenceRows,
    },
    counts,
    rows,
  };
  if (hasCompleteAdmittedReceiptEvidence(doc)) {
    admittedMapSerialization.set(doc, JSON.stringify(doc, null, 2) + "\n");
  }
  builtCurrentMapAuthority.add(doc);
  return deepFreezeCurrentSchema(doc);
}

export interface CurrentFormalParserCoverageAudit {
  readonly schema: "cheng_current_formal_parser_coverage_audit";
  readonly status: "GREEN" | "HARD_RED";
  readonly formalSpecSha256: string;
  readonly parserSha256: string;
  readonly producerDeclarationsSha256: string;
  readonly productionCount: number;
  readonly producerDeclaredCount: number;
  readonly receiptMappedCount: number;
  readonly recomputedUnmappedProductionCount: number;
  readonly unwitnessedProductionCount: number;
  readonly requiredObligationCount: number;
  readonly witnessedRequiredCount: number;
  readonly missingRequiredCount: number;
  readonly focusRows: readonly {
    readonly name: string;
    readonly status: ParserMapStatus;
    readonly requiredObligationCount: number;
    readonly witnessedRequiredCount: number;
    readonly missingRequiredCount: number;
  }[];
  readonly auditSha256: string;
}

export function auditCurrentFormalParserCoverage(
  doc: EbnfParserNodeMap,
): CurrentFormalParserCoverageAudit {
  if (!builtCurrentMapAuthority.has(doc)) {
    throw new Error("current_formal_parser_coverage_map_not_builder_owned");
  }
  const focusNames = new Set([
    "typeExpr",
    "pattern",
    "annotation",
    "annotationArgs",
    "annotationArg",
    "annotationList",
    "annotationDict",
    "annotationEntry",
    "annotationKey",
    "implicitObjectType",
    "objectType",
    "typeParamList",
    "typeParam",
    "moduleHeader",
    "conceptDecl",
    "traitDecl",
    "algebraicType",
    "variantType",
    "procType",
    "tupleType",
    "setType",
    "enumType",
    "refType",
    "varType",
    "typePostfix",
    "typePrimary",
    "typeArg",
    "lvalue",
    "caseArm",
  ]);
  const payload = {
    schema: "cheng_current_formal_parser_coverage_audit" as const,
    status: (
      doc.counts.MAPPED === doc.counts.total &&
      doc.counts.missingRequiredCount === 0 &&
      doc.receiptEvidence.inputCount > 0 &&
      doc.receiptEvidence.acceptedCount ===
        doc.receiptEvidence.inputCount &&
      doc.receiptEvidence.rejectedCount === 0
        ? "GREEN"
        : "HARD_RED"
    ) as "GREEN" | "HARD_RED",
    formalSpecSha256: doc.spec.formalSpecSha256,
    parserSha256: doc.parser.sha256,
    producerDeclarationsSha256: doc.producerDeclarations.sha256,
    productionCount: doc.rows.length,
    producerDeclaredCount: doc.rows.filter((row) =>
      row.parser_fn.length > 0 ||
      row.node_kind_receipts.length > 0).length,
    receiptMappedCount: doc.rows.filter(
      (row) => row.status === "MAPPED").length,
    recomputedUnmappedProductionCount: doc.rows.filter(
      (row) => row.status === "UNMAPPED").length,
    unwitnessedProductionCount: doc.rows.filter(
      (row) => row.missing_required_count > 0).length,
    requiredObligationCount: doc.counts.requiredObligationCount,
    witnessedRequiredCount: doc.counts.witnessedRequiredCount,
    missingRequiredCount: doc.counts.missingRequiredCount,
    focusRows: doc.rows
      .filter((row) => focusNames.has(row.name))
      .map((row) => ({
        name: row.name,
        status: row.status,
        requiredObligationCount: row.required_obligation_count,
        witnessedRequiredCount: row.witnessed_required_count,
        missingRequiredCount: row.missing_required_count,
      })),
  };
  return deepFreezeCurrentSchema({
    ...payload,
    auditSha256: sha256(canonicalJson(payload)),
  });
}

export function serializeEbnfParserNodeMap(doc: EbnfParserNodeMap): string {
  const serialized = admittedMapSerialization.get(doc);
  if (serialized === undefined) {
    const missingRows = doc.rows
      .filter((row) =>
        row.status !== "MAPPED" ||
        !row.receipt_ready ||
        row.missing_required_count !== 0)
      .map((row) => `${row.name}:${row.missing_required_count}`)
      .slice(0, 16)
      .join(",");
    throw new Error(
      "refusing to serialize an EBNF parser map without complete fully " +
      "admitted production receipt evidence " +
      `total=${doc.counts.total} MAPPED=${doc.counts.MAPPED} ` +
      `PARTIAL=${doc.counts.PARTIAL} UNMAPPED=${doc.counts.UNMAPPED} ` +
      `required=${doc.counts.requiredObligationCount} ` +
      `witnessed=${doc.counts.witnessedRequiredCount} ` +
      `missing=${doc.counts.missingRequiredCount} ` +
      `missingRows=${missingRows}`,
    );
  }
  return serialized;
}

export function serializeCurrentUnwitnessedEbnfParserNodeMap(
  formalSpecBytes: Buffer,
  parserBytes: Buffer,
  producerClaimsBytes: Buffer,
): string {
  const doc = buildEbnfParserNodeMap(
    formalSpecBytes,
    parserBytes,
    producerClaimsBytes,
  );
  if (doc.receiptEvidence.inputCount !== 0 ||
      doc.receiptEvidence.acceptedCount !== 0 ||
      doc.receiptEvidence.rejectedCount !== 0 ||
      doc.receiptEvidence.rows.length !== 0 ||
      doc.counts.MAPPED !== 0 ||
      doc.counts.PARTIAL + doc.counts.UNMAPPED !== doc.counts.total ||
      doc.counts.witnessedRequiredCount !== 0 ||
      doc.counts.missingRequiredCount !==
        doc.counts.requiredObligationCount ||
      doc.rows.some((row) =>
        row.receipt_ready ||
        row.witnessed_required_count !== 0 ||
        row.missing_required_count !== row.required_obligation_count ||
        row.missing_required_obligation_ids.length !==
          row.required_obligation_count ||
        row.witness_projections.length !== 0 ||
        row.witness_receipt_sha256s.length !== 0)) {
    throw new Error(
      "current unwitnessed EBNF parser map audit state is invalid",
    );
  }
  return JSON.stringify(doc, null, 2) + "\n";
}

export function validateCurrentUnwitnessedEbnfParserNodeMap(
  serializedMapBytes: Buffer,
  formalSpecBytes: Buffer,
  parserBytes: Buffer,
  producerClaimsBytes: Buffer,
): EbnfParserNodeMap {
  const value = parseUniqueCurrentJson(
    serializedMapBytes.toString("utf8"),
    "ebnf_parser_node_map",
  );
  const expectedBytes = Buffer.from(
    serializeCurrentUnwitnessedEbnfParserNodeMap(
      formalSpecBytes,
      parserBytes,
      producerClaimsBytes,
    ),
    "utf8",
  );
  const expected = parseUniqueCurrentJson(
    expectedBytes.toString("utf8"),
    "ebnf_parser_node_map",
  );
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new Error(
      "current unwitnessed EBNF parser map projection is not exact",
    );
  }
  return buildEbnfParserNodeMap(
    formalSpecBytes,
    parserBytes,
    producerClaimsBytes,
  );
}

export function rebuildSerializedEbnfParserNodeMapFromReceiptArtifacts(
  serializedMapBytes: Buffer,
  formalSpecBytes: Buffer,
  parserBytes: Buffer,
  producerClaimsBytes: Buffer,
): EbnfParserNodeMap {
  const serializedValue = parseUniqueCurrentJson(
    serializedMapBytes.toString("utf8"),
    "ebnf_parser_node_map",
  );
  assertExactCurrentObjectKeys(serializedValue, [
    "schema",
    "spec",
    "parser",
    "producerDeclarations",
    "receiptEvidence",
    "counts",
    "rows",
  ], "ebnf_parser_node_map");
  const serialized = serializedValue as any;
  if (serialized.schema !== CHENG_EBNF_PARSER_NODE_MAP_SCHEMA ||
      serialized.receiptEvidence === null ||
      typeof serialized.receiptEvidence !== "object" ||
      !Array.isArray(serialized.receiptEvidence.rows) ||
      serialized.receiptEvidence.rows.length === 0) {
    throw new Error("ebnf_parser_node_map_receipt_evidence_missing");
  }
  const manifestPaths = new Set<string>(
    serialized.receiptEvidence.rows.map((row: any) => row?.manifestPath),
  );
  if (manifestPaths.size !== 1) {
    throw new Error("ebnf_parser_node_map_manifest_identity_invalid");
  }
  const manifestPath = [...manifestPaths][0]!;
  if (typeof manifestPath !== "string" ||
      manifestPath !== resolve(manifestPath)) {
    throw new Error("ebnf_parser_node_map_manifest_identity_invalid");
  }
  const manifestBytes = readFileSync(manifestPath);
  const manifest = parseUniqueCurrentJson(
    manifestBytes.toString("utf8"),
    "parser_receipt_harness_manifest",
  ) as any;
  validateParserProductionReceiptHarnessArtifactFiles(
    manifest,
    manifestPath,
  );
  if (!Array.isArray(manifest.receipts) ||
      typeof manifest.receiptProducer?.path !== "string") {
    throw new Error("ebnf_parser_node_map_manifest_receipts_invalid");
  }
  const receiptEvidence: ParserReceiptEvidenceInput[] =
    manifest.receipts.map((receipt: any) => ({
      sourcePath: receipt.sourcePath,
      sourceBytes: readFileSync(receipt.sourcePath),
      receiptPath: receipt.path,
      receiptBytes: readFileSync(receipt.path),
      manifestPath,
      manifestBytes,
    }));
  const receiptProducerBytes = readFileSync(manifest.receiptProducer.path);
  const rebuilt = buildEbnfParserNodeMap(
    formalSpecBytes,
    parserBytes,
    producerClaimsBytes,
    {
      receiptProducerBytes,
      receiptEvidence,
      harnessFormalSpecPath: manifest.formalSpec?.path,
      harnessParserPath: manifest.parser?.path,
      harnessReceiptProducerPath: manifest.receiptProducer?.path,
      harnessDriverEntryPath: manifest.driverEntry?.path,
      harnessDriverEntrySha256: manifest.driverEntry?.sha256,
      harnessBootstrapPath: manifest.bootstrap?.path,
      harnessBootstrapSha256: manifest.bootstrap?.sha256,
      harnessPath: manifest.harness?.path,
      harnessSha256: manifest.harness?.sha256,
      harnessDependencyClosureSha256: manifest.dependencyClosure?.sha256,
      harnessToolClosureSha256: manifest.toolClosure?.sha256,
      harnessBuildCompilerExecutablePath:
        manifest.buildCompiler?.executablePath,
      harnessBuildCompilerExecutableSha256:
        manifest.buildCompiler?.executableSha256,
      harnessBuildCompilerVersionSha256:
        manifest.buildCompiler?.versionSha256,
      harnessRuntimeExecutablePath: manifest.runtime?.executablePath,
      harnessRuntimeExecutableSha256: manifest.runtime?.executableSha256,
      harnessRuntimeVersion: manifest.runtime?.version,
    },
  );
  const canonicalBytes = Buffer.from(
    serializeEbnfParserNodeMap(rebuilt),
    "utf8",
  );
  if (canonicalJson(serializedValue) !== canonicalJson(rebuilt) ||
      !serializedMapBytes.equals(canonicalBytes)) {
    throw new Error("ebnf_parser_node_map_not_current_receipt_projection");
  }
  return rebuilt;
}
