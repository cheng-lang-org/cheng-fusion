// Bounded semantic-combination planning for the Cheng compiler pipeline.
// This is a contract model. It never invents compiler node IDs, declaration IDs,
// field offsets, or an executed-pipeline verdict.
import {createHash} from "node:crypto";

export const CHENG_SEMANTIC_MATRIX_SCHEMA = "cheng_semantic_matrix.v1";
export const CHENG_SEMANTIC_MATRIX_MANIFEST_SCHEMA = "cheng_semantic_matrix_manifest.v1";
export const CHENG_SEMANTIC_MATRIX_SHARD_SCHEMA = "cheng_semantic_matrix_shard.v1";
export const CHENG_SEMANTIC_STAGE_LEDGER_SCHEMA = "cheng_semantic_stage_contract_ledger.v1";
export const CHENG_SEMANTIC_PIPELINE_RUNNER_KIND = "cheng-real-structured-pipeline.v1";

const AXES = {
  type: [
    "i32",
    "i64",
    "f64",
    "bool",
    "str",
    "seq_i32",
    "seq_str",
    "fixed_str",
    "object_str",
    "managed_object_seq",
    "nested_inline_object_str",
    "result_str",
  ],
  ownership: ["Owned", "Borrowed", "Unmanaged"],
  valueCategory: ["literal", "ident", "field", "index", "call"],
  storage: ["local", "global"],
  fieldPath: ["none", "inline_field", "ref_boundary_field", "indexed_field"],
  callIdentity: ["none", "exact_node_index"],
  overload: ["not_applicable", "unique", "same_name_same_arity"],
  moduleScope: ["same_module", "imported_module"],
  resultTransport: ["value_register", "managed_value_slot", "aggregate_slot", "sret"],
  controlFlow: ["straight", "if_join", "loop_backedge"],
  alias: ["no_alias", "self_alias", "may_alias"],
  sourceSurface: ["ordinary_value", "implicit_var_borrow"],
} as const;

export type SemanticAxisName = keyof typeof AXES;
export type SemanticDimensions = {
  readonly [K in SemanticAxisName]: (typeof AXES)[K][number];
};
export type SemanticExpectation = "accept" | "reject";
export type SemanticTypeName = SemanticDimensions["type"];

interface SemanticTypeDescriptor {
  readonly scalarKind: "i32" | "i64" | "f64" | "bool" | "not_scalar";
  readonly typeShape: "scalar" | "str" | "sequence" | "fixed_array" | "object" | "result_payload";
  readonly managedDepth: "none" | "direct" | "nested_inline" | "nested_sequence";
  readonly elementOwnership: "unmanaged" | "managed";
  readonly containsManagedStorage: boolean;
  readonly ownershipDescriptorKind: "none" | "direct_str" | "sequence_header" | "recursive_fields" | "result_payload";
}

const TYPE_DESCRIPTORS: Readonly<Record<SemanticTypeName, SemanticTypeDescriptor>> = deepFreeze({
  i32: {scalarKind: "i32", typeShape: "scalar", managedDepth: "none", elementOwnership: "unmanaged", containsManagedStorage: false, ownershipDescriptorKind: "none"},
  i64: {scalarKind: "i64", typeShape: "scalar", managedDepth: "none", elementOwnership: "unmanaged", containsManagedStorage: false, ownershipDescriptorKind: "none"},
  f64: {scalarKind: "f64", typeShape: "scalar", managedDepth: "none", elementOwnership: "unmanaged", containsManagedStorage: false, ownershipDescriptorKind: "none"},
  bool: {scalarKind: "bool", typeShape: "scalar", managedDepth: "none", elementOwnership: "unmanaged", containsManagedStorage: false, ownershipDescriptorKind: "none"},
  str: {scalarKind: "not_scalar", typeShape: "str", managedDepth: "direct", elementOwnership: "managed", containsManagedStorage: true, ownershipDescriptorKind: "direct_str"},
  seq_i32: {scalarKind: "not_scalar", typeShape: "sequence", managedDepth: "direct", elementOwnership: "unmanaged", containsManagedStorage: true, ownershipDescriptorKind: "sequence_header"},
  seq_str: {scalarKind: "not_scalar", typeShape: "sequence", managedDepth: "nested_sequence", elementOwnership: "managed", containsManagedStorage: true, ownershipDescriptorKind: "recursive_fields"},
  fixed_str: {scalarKind: "not_scalar", typeShape: "fixed_array", managedDepth: "nested_inline", elementOwnership: "managed", containsManagedStorage: true, ownershipDescriptorKind: "recursive_fields"},
  object_str: {scalarKind: "not_scalar", typeShape: "object", managedDepth: "nested_inline", elementOwnership: "managed", containsManagedStorage: true, ownershipDescriptorKind: "recursive_fields"},
  managed_object_seq: {scalarKind: "not_scalar", typeShape: "sequence", managedDepth: "nested_sequence", elementOwnership: "managed", containsManagedStorage: true, ownershipDescriptorKind: "recursive_fields"},
  nested_inline_object_str: {scalarKind: "not_scalar", typeShape: "object", managedDepth: "nested_inline", elementOwnership: "managed", containsManagedStorage: true, ownershipDescriptorKind: "recursive_fields"},
  result_str: {scalarKind: "not_scalar", typeShape: "result_payload", managedDepth: "nested_inline", elementOwnership: "managed", containsManagedStorage: true, ownershipDescriptorKind: "result_payload"},
});

export const CHENG_SEMANTIC_AXIS_ORDER = Object.freeze([
  "type",
  "ownership",
  "valueCategory",
  "storage",
  "fieldPath",
  "callIdentity",
  "overload",
  "moduleScope",
  "resultTransport",
  "controlFlow",
  "alias",
  "sourceSurface",
] as const satisfies readonly SemanticAxisName[]);

const CONSTRAINT_CODES = Object.freeze([
  "TYPE_OWNERSHIP_EXACT",
  "VALUE_OWNERSHIP_EXACT",
  "FIELD_PATH_EXACT",
  "CALL_IDENTITY_EXACT",
  "CALL_OVERLOAD_EXACT",
  "CALL_MODULE_EXACT",
  "RESULT_TRANSPORT_EXACT",
  "PUBLIC_BORROW_SURFACE_EXACT",
  "VALUE_ORIGIN_REALIZABLE",
  "ALIAS_REALIZABLE",
] as const);
export type SemanticConstraintCode = (typeof CONSTRAINT_CODES)[number];

interface CriticalFamily {
  readonly name: string;
  readonly axes: readonly SemanticAxisName[];
}

const CRITICAL_FAMILIES: readonly CriticalFamily[] = deepFreeze([
  {name: "ownership_store_alias", axes: ["type", "ownership", "storage", "alias"]},
  {name: "ownership_descriptor_transport", axes: ["type", "ownership", "valueCategory", "resultTransport"]},
  {name: "field_ref_boundary", axes: ["type", "ownership", "valueCategory", "fieldPath", "storage"]},
  {name: "exact_call_transport", axes: ["type", "ownership", "callIdentity", "overload", "moduleScope", "resultTransport"]},
  {name: "control_flow_ownership", axes: ["ownership", "storage", "controlFlow", "alias"]},
] satisfies readonly CriticalFamily[]);

export interface SemanticClassification {
  readonly schema: "cheng_semantic_classification.v1";
  readonly legal: boolean;
  readonly violations: readonly SemanticConstraintCode[];
}

export interface SemanticCase {
  readonly schema: "cheng_semantic_case.v1";
  readonly caseId: string;
  readonly modelCaseOrdinal: number;
  readonly expected: SemanticExpectation;
  readonly violationCodes: readonly SemanticConstraintCode[];
  readonly dimensions: SemanticDimensions;
  readonly semanticSha256: string;
}

export interface SemanticUniverse {
  readonly schema: "cheng_semantic_universe.v1";
  readonly assignmentCount: number;
  readonly legalCases: readonly SemanticCase[];
  readonly negativeCases: readonly SemanticCase[];
}

export interface SemanticCoverageContract {
  readonly schema: "cheng_semantic_coverage_contract.v1";
  readonly schemaSha256: string;
  readonly assignmentCount: number;
  readonly legalUniverseCount: number;
  readonly classifierAgreementCount: number;
  readonly classifierAgreementSha256: string;
  readonly critical: readonly string[];
  readonly twise: readonly string[];
  readonly negative: readonly string[];
  readonly contractSha256: string;
}

export interface SemanticCoverageReceipt {
  readonly schema: "cheng_semantic_coverage_receipt.v1";
  readonly contractSha256: string;
  readonly caseCount: number;
  readonly criticalCount: number;
  readonly twiseCount: number;
  readonly negativeCount: number;
  readonly receiptSha256: string;
}

export interface SemanticMatrixManifest {
  readonly schema: typeof CHENG_SEMANTIC_MATRIX_MANIFEST_SCHEMA;
  readonly modelSchemaSha256: string;
  readonly coverageContractSha256: string;
  readonly seed: string;
  readonly generator: "deterministic_weighted_set_cover_non_minimal.v1";
  readonly caseCount: number;
  readonly acceptCount: number;
  readonly rejectCount: number;
  readonly caseIdsSha256: string;
  readonly casesSha256: string;
  readonly manifestSha256: string;
}

export interface SemanticMatrix {
  readonly schema: typeof CHENG_SEMANTIC_MATRIX_SCHEMA;
  readonly manifest: SemanticMatrixManifest;
  readonly coverage: SemanticCoverageReceipt;
  readonly cases: readonly SemanticCase[];
}

export interface SemanticShardManifest {
  readonly schema: typeof CHENG_SEMANTIC_MATRIX_SHARD_SCHEMA;
  readonly parentManifestSha256: string;
  readonly seed: string;
  readonly shardIndex: number;
  readonly shardCount: number;
  readonly caseCount: number;
  readonly caseIdsSha256: string;
  readonly casesSha256: string;
  readonly manifestSha256: string;
}

export interface SemanticMatrixShard {
  readonly schema: typeof CHENG_SEMANTIC_MATRIX_SHARD_SCHEMA;
  readonly manifest: SemanticShardManifest;
  readonly cases: readonly SemanticCase[];
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value as Readonly<T>;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) out[key] = canonicalize(record[key]);
  return out;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: string | Buffer): string {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return createHash("sha256").update(bytes).digest("hex");
}

export const CHENG_SEMANTIC_MODEL_SCHEMA = deepFreeze({
  schema: CHENG_SEMANTIC_MATRIX_SCHEMA,
  scope: "TypedExpr->CSG->lowering->primary/backend2->regalloc",
  enumeration: "bounded_constrained_semantic_domain",
  infiniteGrammarClaim: false,
  axes: AXES,
  typeDescriptors: TYPE_DESCRIPTORS,
  constraints: CONSTRAINT_CODES,
  criticalFamilies: CRITICAL_FAMILIES,
  generalCoverage: {strength: 2, axes: CHENG_SEMANTIC_AXIS_ORDER},
  publicSurface: {
    allowedBorrowSyntax: "var T implicit borrow",
    forbiddenIdentity: ["name+arity", "source_text", "source_line", "raw_pointer"],
  },
});
export const CHENG_SEMANTIC_MODEL_SCHEMA_SHA256 = sha256(canonicalJson(CHENG_SEMANTIC_MODEL_SCHEMA));

// This protocol is deliberately unavailable in v1. These fields are requirements for
// a future compiler-owned runner, not self-reported evidence accepted by this module.
export const CHENG_SEMANTIC_REAL_RUNNER_PROTOCOL = deepFreeze({
  schema: "cheng_real_structured_pipeline_protocol.v1",
  implemented: false,
  sourceBindings: [
    "case_source_bytes_sha256",
    "case_materialization_manifest_sha256",
    "source_materializer_bytes_sha256",
    "semantic_case_sha256",
    "materialization_recipe_sha256",
  ],
  executionIdentityBindings: [
    "driver_bytes_sha256",
    "typed_expr_source_sha256",
    "csg_lowering_source_sha256",
    "primary_source_sha256",
    "backend2_source_sha256",
    "regalloc_source_sha256",
    "toolchain_manifest_sha256",
  ],
  observedStageBindings: [
    "compiler_int32_node_and_decl_indices",
    "compiler_type_layout_receipt_and_field_offsets",
    "expr_class_and_result_transport",
    "ownership_action_ledger",
    "primary_and_backend2_regalloc_receipts",
  ],
  requiredCrossChecks: [
    "source_manifest_hashes_raw_source_and_materializer_bytes",
    "every_stage_receipt_binds_same_execution_identity",
    "typed_expr_exact_identity_and_layout_are_preserved_by_every_downstream_stage",
    "each_stage_is_checked_against_the_symbolic_ownership_oracle",
    "primary_backend2_differential_is_required_but_not_sufficient",
  ],
});

function assertCanonicalSeed(seed: string): void {
  if (seed.length === 0 || Buffer.byteLength(seed, "utf8") > 1024) {
    throw new Error("semantic matrix seed must be a non-empty UTF-8 string of at most 1024 bytes");
  }
}

function orderedDimensions(input: SemanticDimensions): SemanticDimensions {
  const record = input as unknown as Record<string, string>;
  const keys = Object.keys(record);
  if (keys.length !== CHENG_SEMANTIC_AXIS_ORDER.length || keys.some((key) => !CHENG_SEMANTIC_AXIS_ORDER.includes(key as SemanticAxisName))) {
    throw new Error("semantic dimensions must contain every schema axis exactly once");
  }
  const out: Record<string, string> = {};
  for (const axis of CHENG_SEMANTIC_AXIS_ORDER) {
    const value = record[axis];
    if (value === undefined) throw new Error(`semantic axis ${axis} is missing`);
    if (!(AXES[axis] as readonly string[]).includes(value)) throw new Error(`unknown semantic axis value ${axis}=${String(value)}`);
    out[axis] = value;
  }
  return out as unknown as SemanticDimensions;
}

const TYPE_OWNERSHIP_BIT = 1 << 0;
const VALUE_OWNERSHIP_BIT = 1 << 1;
const FIELD_PATH_BIT = 1 << 2;
const CALL_IDENTITY_BIT = 1 << 3;
const CALL_OVERLOAD_BIT = 1 << 4;
const CALL_MODULE_BIT = 1 << 5;
const RESULT_TRANSPORT_BIT = 1 << 6;
const PUBLIC_BORROW_SURFACE_BIT = 1 << 7;
const VALUE_ORIGIN_BIT = 1 << 8;
const ALIAS_BIT = 1 << 9;

function classificationFromMask(mask: number): SemanticClassification {
  const violations: SemanticConstraintCode[] = [];
  for (let index = 0; index < CONSTRAINT_CODES.length; index += 1) {
    const code = CONSTRAINT_CODES[index];
    if (code === undefined) throw new Error("constraint bit escaped schema bounds");
    if ((mask & (1 << index)) !== 0) violations.push(code);
  }
  return deepFreeze({schema: "cheng_semantic_classification.v1", legal: mask === 0, violations});
}

function violationCount(mask: number): number {
  let value = mask >>> 0;
  let count = 0;
  while (value !== 0) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

function generationViolationMask(dimensions: SemanticDimensions): number {
  let mask = 0;
  const managed = TYPE_DESCRIPTORS[dimensions.type].containsManagedStorage;
  const typeOwnershipValid = !((managed && dimensions.ownership === "Unmanaged") || (!managed && dimensions.ownership !== "Unmanaged"));
  if (!typeOwnershipValid) mask |= TYPE_OWNERSHIP_BIT;

  let expectedValueOwnership: SemanticDimensions["ownership"] | null;
  if (dimensions.valueCategory === "literal") expectedValueOwnership = managed ? "Owned" : "Unmanaged";
  else if (dimensions.valueCategory === "ident" || dimensions.valueCategory === "field" || dimensions.valueCategory === "index") {
    expectedValueOwnership = managed ? "Borrowed" : "Unmanaged";
  } else if (!managed) expectedValueOwnership = "Unmanaged";
  else expectedValueOwnership = null;
  if (typeOwnershipValid
      && ((expectedValueOwnership !== null && dimensions.ownership !== expectedValueOwnership)
          || (expectedValueOwnership === null && dimensions.ownership === "Unmanaged"))) mask |= VALUE_OWNERSHIP_BIT;

  const fieldPathLegal = dimensions.valueCategory === "field"
    ? dimensions.fieldPath === "inline_field" || dimensions.fieldPath === "ref_boundary_field"
    : dimensions.valueCategory === "index" ? dimensions.fieldPath === "indexed_field" : dimensions.fieldPath === "none";
  if (!fieldPathLegal) mask |= FIELD_PATH_BIT;

  const call = dimensions.valueCategory === "call";
  if ((call && dimensions.callIdentity !== "exact_node_index") || (!call && dimensions.callIdentity !== "none")) mask |= CALL_IDENTITY_BIT;
  if ((call && dimensions.overload === "not_applicable") || (!call && dimensions.overload !== "not_applicable")) mask |= CALL_OVERLOAD_BIT;
  if (!call && dimensions.moduleScope !== "same_module") mask |= CALL_MODULE_BIT;

  const expectedTransport: SemanticDimensions["resultTransport"] = call
    ? (managed ? "sret" : "value_register")
    : !managed ? "value_register" : dimensions.type === "str" ? "managed_value_slot" : "aggregate_slot";
  if (dimensions.resultTransport !== expectedTransport) mask |= RESULT_TRANSPORT_BIT;

  const borrowOrigin = dimensions.valueCategory === "ident" || dimensions.valueCategory === "field" || dimensions.valueCategory === "index";
  if (dimensions.sourceSurface === "implicit_var_borrow"
      && (dimensions.ownership === "Owned" || dimensions.storage !== "local" || !borrowOrigin)) mask |= PUBLIC_BORROW_SURFACE_BIT;

  const literalType = dimensions.type === "i32" || dimensions.type === "i64" || dimensions.type === "f64" || dimensions.type === "bool"
    || dimensions.type === "str" || dimensions.type === "seq_i32" || dimensions.type === "seq_str" || dimensions.type === "fixed_str";
  if (dimensions.valueCategory === "literal" && !literalType) mask |= VALUE_ORIGIN_BIT;

  const selfAliasRealizable = dimensions.storage === "global" && dimensions.ownership !== "Owned" && borrowOrigin;
  const mayAliasRealizable = dimensions.ownership === "Borrowed" && (borrowOrigin || dimensions.valueCategory === "call");
  if ((dimensions.alias === "self_alias" && !selfAliasRealizable) || (dimensions.alias === "may_alias" && !mayAliasRealizable)) mask |= ALIAS_BIT;
  return mask;
}

function proofViolationMask(dimensions: SemanticDimensions): number {
  let mask = 0;
  const scalar = dimensions.type === "i32" || dimensions.type === "i64" || dimensions.type === "f64" || dimensions.type === "bool";
  const managed = !scalar;
  const typeOwnershipValid = !((scalar && dimensions.ownership !== "Unmanaged") || (managed && dimensions.ownership === "Unmanaged"));
  if (!typeOwnershipValid) mask |= TYPE_OWNERSHIP_BIT;

  let originOwnershipValid: boolean;
  if (dimensions.valueCategory === "literal") originOwnershipValid = dimensions.ownership === (managed ? "Owned" : "Unmanaged");
  else if (dimensions.valueCategory === "ident" || dimensions.valueCategory === "field" || dimensions.valueCategory === "index") {
    originOwnershipValid = dimensions.ownership === (managed ? "Borrowed" : "Unmanaged");
  } else originOwnershipValid = managed ? dimensions.ownership !== "Unmanaged" : dimensions.ownership === "Unmanaged";
  if (typeOwnershipValid && !originOwnershipValid) mask |= VALUE_OWNERSHIP_BIT;

  let fieldPathValid: boolean;
  if (dimensions.valueCategory === "field") fieldPathValid = dimensions.fieldPath === "inline_field" || dimensions.fieldPath === "ref_boundary_field";
  else if (dimensions.valueCategory === "index") fieldPathValid = dimensions.fieldPath === "indexed_field";
  else fieldPathValid = dimensions.fieldPath === "none";
  if (!fieldPathValid) mask |= FIELD_PATH_BIT;

  const call = dimensions.valueCategory === "call";
  if (call ? dimensions.callIdentity !== "exact_node_index" : dimensions.callIdentity !== "none") mask |= CALL_IDENTITY_BIT;
  if (call ? dimensions.overload === "not_applicable" : dimensions.overload !== "not_applicable") mask |= CALL_OVERLOAD_BIT;
  if (!call && dimensions.moduleScope !== "same_module") mask |= CALL_MODULE_BIT;

  let transportValid: boolean;
  if (call) transportValid = dimensions.resultTransport === (managed ? "sret" : "value_register");
  else if (scalar) transportValid = dimensions.resultTransport === "value_register";
  else if (dimensions.type === "str") transportValid = dimensions.resultTransport === "managed_value_slot";
  else transportValid = dimensions.resultTransport === "aggregate_slot";
  if (!transportValid) mask |= RESULT_TRANSPORT_BIT;

  const borrowOrigin = dimensions.valueCategory === "ident" || dimensions.valueCategory === "field" || dimensions.valueCategory === "index";
  if (dimensions.sourceSurface === "implicit_var_borrow"
      && (dimensions.ownership === "Owned" || dimensions.storage !== "local" || !borrowOrigin)) mask |= PUBLIC_BORROW_SURFACE_BIT;

  if (dimensions.valueCategory === "literal") {
    const literal = scalar || dimensions.type === "str" || dimensions.type === "seq_i32" || dimensions.type === "seq_str" || dimensions.type === "fixed_str";
    if (!literal) mask |= VALUE_ORIGIN_BIT;
  }

  if (dimensions.alias === "self_alias") {
    if (dimensions.storage !== "global" || dimensions.ownership === "Owned" || !borrowOrigin) mask |= ALIAS_BIT;
  } else if (dimensions.alias === "may_alias") {
    if (dimensions.ownership !== "Borrowed" || !(borrowOrigin || dimensions.valueCategory === "call")) mask |= ALIAS_BIT;
  }
  return mask;
}

export function classifySemanticDimensions(input: SemanticDimensions): SemanticClassification {
  const dimensions = orderedDimensions(input);
  return classificationFromMask(generationViolationMask(dimensions));
}

// Independent proof classifier. It deliberately does not call orderedDimensions,
// classifySemanticDimensions, generationViolationMask, or TYPE_DESCRIPTORS.
export function proofClassifySemanticDimensions(dimensions: SemanticDimensions): SemanticClassification {
  return classificationFromMask(proofViolationMask(dimensions));
}

function semanticCaseFromDimensions(
  dimensionsInput: SemanticDimensions,
  modelCaseOrdinal: number,
  expected: SemanticExpectation,
  violationCodes: readonly SemanticConstraintCode[],
): SemanticCase {
  const dimensions = orderedDimensions(dimensionsInput);
  if (!Number.isInteger(modelCaseOrdinal) || modelCaseOrdinal < 0 || modelCaseOrdinal > 0x7fffffff) {
    throw new Error("semantic model case ordinal must be a non-negative int32");
  }
  const identityPayload = {schema: CHENG_SEMANTIC_MATRIX_SCHEMA, dimensions};
  const caseId = `sem.v1.${sha256(canonicalJson(identityPayload))}`;
  const semanticPayload = {identityPayload, modelCaseOrdinal, expected, violationCodes};
  return deepFreeze({
    schema: "cheng_semantic_case.v1",
    caseId,
    modelCaseOrdinal,
    expected,
    violationCodes: [...violationCodes],
    dimensions,
    semanticSha256: sha256(canonicalJson(semanticPayload)),
  });
}

function enumerateDimensionAssignments(visitor: (dimensions: SemanticDimensions, ordinal: number) => void): number {
  const dimensions: Record<string, string> = {};
  let ordinal = 0;
  function walk(axisIndex: number): void {
    if (axisIndex === CHENG_SEMANTIC_AXIS_ORDER.length) {
      visitor(dimensions as unknown as SemanticDimensions, ordinal);
      ordinal += 1;
      return;
    }
    const axis = CHENG_SEMANTIC_AXIS_ORDER[axisIndex];
    if (axis === undefined) throw new Error("semantic axis enumeration escaped schema bounds");
    for (const value of AXES[axis]) {
      dimensions[axis] = value;
      walk(axisIndex + 1);
    }
  }
  walk(0);
  return ordinal;
}

interface NegativeWitness {
  readonly dimensions: SemanticDimensions;
  readonly ordinal: number;
  readonly violationCount: number;
}

let cachedUniverse: SemanticUniverse | null = null;

export function enumerateSemanticUniverse(): SemanticUniverse {
  if (cachedUniverse !== null) return cachedUniverse;
  const legalCases: SemanticCase[] = [];
  const negativeWitnesses = new Map<SemanticConstraintCode, NegativeWitness>();
  const caseIds = new Set<string>();
  const assignmentCount = enumerateDimensionAssignments((dimensions, ordinal) => {
    const mask = generationViolationMask(dimensions);
    if (mask === 0) {
      const testCase = semanticCaseFromDimensions(dimensions, ordinal, "accept", []);
      if (caseIds.has(testCase.caseId)) throw new Error(`semantic case ID collision: ${testCase.caseId}`);
      caseIds.add(testCase.caseId);
      legalCases.push(testCase);
      return;
    }
    const count = violationCount(mask);
    for (let index = 0; index < CONSTRAINT_CODES.length; index += 1) {
      if ((mask & (1 << index)) === 0) continue;
      const violation = CONSTRAINT_CODES[index];
      if (violation === undefined) throw new Error("negative witness bit escaped schema bounds");
      const prior = negativeWitnesses.get(violation);
      if (prior === undefined || count < prior.violationCount) {
        negativeWitnesses.set(violation, {dimensions: orderedDimensions(dimensions), ordinal, violationCount: count});
      }
    }
  });
  const negativeCases: SemanticCase[] = [];
  for (const code of CONSTRAINT_CODES) {
    const witness = negativeWitnesses.get(code);
    if (witness === undefined) throw new Error(`no bounded negative witness exists for constraint ${code}`);
    const classification = classifySemanticDimensions(witness.dimensions);
    negativeCases.push(semanticCaseFromDimensions(witness.dimensions, witness.ordinal, "reject", classification.violations));
  }
  const uniqueNegativeCases = [...new Map(negativeCases.map((entry) => [entry.caseId, entry])).values()]
    .sort((a, b) => a.caseId.localeCompare(b.caseId));
  cachedUniverse = deepFreeze({
    schema: "cheng_semantic_universe.v1",
    assignmentCount,
    legalCases: legalCases.sort((a, b) => a.caseId.localeCompare(b.caseId)),
    negativeCases: uniqueNegativeCases,
  });
  return cachedUniverse;
}

function combinations<T>(values: readonly T[], strength: number): T[][] {
  const out: T[][] = [];
  function walk(start: number, chosen: T[]): void {
    if (chosen.length === strength) {
      out.push([...chosen]);
      return;
    }
    for (let index = start; index <= values.length - (strength - chosen.length); index += 1) {
      const value = values[index];
      if (value === undefined) throw new Error("coverage combination escaped input bounds");
      chosen.push(value);
      walk(index + 1, chosen);
      chosen.pop();
    }
  }
  walk(0, []);
  return out;
}

function generationProjectionToken(prefix: string, axes: readonly SemanticAxisName[], dimensions: SemanticDimensions): string {
  return `${prefix}|${axes.map((axis) => `${axis}=${dimensions[axis]}`).join("|")}`;
}

function generationCoverageTokens(testCase: SemanticCase): string[] {
  const classification = classifySemanticDimensions(testCase.dimensions);
  if (testCase.expected === "reject") return classification.violations.map((code) => `negative|${code}`);
  if (!classification.legal) throw new Error(`accept case is semantically illegal: ${testCase.caseId}`);
  const tokens: string[] = [];
  for (const family of CRITICAL_FAMILIES) tokens.push(generationProjectionToken(`critical:${family.name}`, family.axes, testCase.dimensions));
  for (const axes of combinations(CHENG_SEMANTIC_AXIS_ORDER, 2)) tokens.push(generationProjectionToken("twise:2", axes, testCase.dimensions));
  return tokens;
}

// Coverage proof intentionally has a separate assignment enumerator and token builder.
// It consumes only the frozen schema and semantic constraints, never generator tokens,
// selected cases, manifests, or coverage receipts.
function proofCoverageTokens(
  dimensions: SemanticDimensions,
  expected: SemanticExpectation,
  violations: readonly SemanticConstraintCode[],
): string[] {
  if (expected === "reject") return violations.map((code) => `negative|${code}`);
  const tokens: string[] = [];
  for (const family of CRITICAL_FAMILIES) {
    const columns = family.axes.map((axis) => `${axis}=${dimensions[axis]}`).join("|");
    tokens.push(`critical:${family.name}|${columns}`);
  }
  for (let left = 0; left < CHENG_SEMANTIC_AXIS_ORDER.length; left += 1) {
    const leftAxis = CHENG_SEMANTIC_AXIS_ORDER[left];
    if (leftAxis === undefined) throw new Error("coverage proof left axis escaped schema bounds");
    for (let right = left + 1; right < CHENG_SEMANTIC_AXIS_ORDER.length; right += 1) {
      const rightAxis = CHENG_SEMANTIC_AXIS_ORDER[right];
      if (rightAxis === undefined) throw new Error("coverage proof right axis escaped schema bounds");
      tokens.push(`twise:2|${leftAxis}=${dimensions[leftAxis]}|${rightAxis}=${dimensions[rightAxis]}`);
    }
  }
  return tokens;
}

export function semanticCaseCoverageTokens(testCase: SemanticCase): string[] {
  const classification = proofClassifySemanticDimensions(testCase.dimensions);
  if (testCase.expected === "accept" && !classification.legal) throw new Error(`accept case is semantically illegal: ${testCase.caseId}`);
  return proofCoverageTokens(testCase.dimensions, testCase.expected, classification.violations);
}

function independentlyEnumerateCoverageProof(
  visitor: (dimensions: SemanticDimensions, violationMask: number) => void,
): Readonly<{assignmentCount: number; classifierAgreementSha256: string}> {
  const dimensions: Record<string, string> = {};
  const axisOrdinals = new Uint8Array(CHENG_SEMANTIC_AXIS_ORDER.length);
  let assignmentCount = 0;
  const agreementHash = createHash("sha256");
  const agreementRecordBytes = CHENG_SEMANTIC_AXIS_ORDER.length + 8;
  const agreementChunk = Buffer.allocUnsafe(agreementRecordBytes * 4096);
  let agreementOffset = 0;
  function appendAgreement(generationMask: number, proofMask: number): void {
    for (let index = 0; index < axisOrdinals.length; index += 1) agreementChunk[agreementOffset + index] = axisOrdinals[index] ?? 0;
    agreementChunk.writeUInt32LE(generationMask >>> 0, agreementOffset + axisOrdinals.length);
    agreementChunk.writeUInt32LE(proofMask >>> 0, agreementOffset + axisOrdinals.length + 4);
    agreementOffset += agreementRecordBytes;
    if (agreementOffset === agreementChunk.length) {
      agreementHash.update(agreementChunk);
      agreementOffset = 0;
    }
  }
  function walk(axisIndex: number): void {
    if (axisIndex === CHENG_SEMANTIC_AXIS_ORDER.length) {
      const exactDimensions = dimensions as unknown as SemanticDimensions;
      const proofMask = proofViolationMask(exactDimensions);
      const generationMask = generationViolationMask(exactDimensions);
      if (proofMask !== generationMask) {
        throw new Error(`independent semantic classifier mismatch masks=${generationMask}/${proofMask} at ${canonicalJson(exactDimensions)}`);
      }
      appendAgreement(generationMask, proofMask);
      visitor(exactDimensions, proofMask);
      assignmentCount += 1;
      return;
    }
    const axis = CHENG_SEMANTIC_AXIS_ORDER[axisIndex];
    if (axis === undefined) throw new Error("coverage proof enumeration escaped schema bounds");
    const values = AXES[axis];
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      const value = values[valueIndex];
      if (value === undefined) throw new Error("coverage proof value escaped schema bounds");
      dimensions[axis] = value;
      axisOrdinals[axisIndex] = valueIndex;
      walk(axisIndex + 1);
    }
  }
  walk(0);
  if (agreementOffset > 0) agreementHash.update(agreementChunk.subarray(0, agreementOffset));
  return deepFreeze({assignmentCount, classifierAgreementSha256: agreementHash.digest("hex")});
}

let cachedCoverageContract: SemanticCoverageContract | null = null;

export function deriveSemanticCoverageContract(): SemanticCoverageContract {
  if (cachedCoverageContract !== null) return cachedCoverageContract;
  const critical = new Set<string>();
  const twise = new Set<string>();
  let legalUniverseCount = 0;
  const proofEnumeration = independentlyEnumerateCoverageProof((dimensions, violationMask) => {
    if (violationMask !== 0) return;
    legalUniverseCount += 1;
    for (const token of proofCoverageTokens(dimensions, "accept", [])) {
      if (token.startsWith("critical:")) critical.add(token);
      else twise.add(token);
    }
  });
  const payload = {
    schema: "cheng_semantic_coverage_contract.v1" as const,
    schemaSha256: CHENG_SEMANTIC_MODEL_SCHEMA_SHA256,
    assignmentCount: proofEnumeration.assignmentCount,
    legalUniverseCount,
    classifierAgreementCount: proofEnumeration.assignmentCount,
    classifierAgreementSha256: proofEnumeration.classifierAgreementSha256,
    critical: [...critical].sort(),
    twise: [...twise].sort(),
    negative: CONSTRAINT_CODES.map((code) => `negative|${code}`),
  };
  cachedCoverageContract = deepFreeze({...payload, contractSha256: sha256(canonicalJson(payload))});
  return cachedCoverageContract;
}

export function validateSemanticCase(testCase: SemanticCase): SemanticClassification {
  if (testCase.schema !== "cheng_semantic_case.v1") throw new Error("invalid semantic case schema");
  const classification = classifySemanticDimensions(testCase.dimensions);
  const expected: SemanticExpectation = classification.legal ? "accept" : "reject";
  if (testCase.expected !== expected) throw new Error(`semantic case expectation mismatch: ${testCase.caseId}`);
  if (canonicalJson(testCase.violationCodes) !== canonicalJson(classification.violations)) throw new Error(`semantic case violation list mismatch: ${testCase.caseId}`);
  const rebuilt = semanticCaseFromDimensions(testCase.dimensions, testCase.modelCaseOrdinal, expected, classification.violations);
  if (canonicalJson(rebuilt) !== canonicalJson(testCase)) throw new Error(`semantic case identity mismatch: ${testCase.caseId}`);
  return classification;
}

export function validateSemanticCoverage(cases: readonly SemanticCase[]): SemanticCoverageReceipt {
  if (cases.length === 0) throw new Error("semantic coverage requires a non-empty case array");
  const expected = deriveSemanticCoverageContract();
  const observedCritical = new Set<string>();
  const observedTwise = new Set<string>();
  const observedNegative = new Set<string>();
  const ids = new Set<string>();
  for (const testCase of cases) {
    validateSemanticCase(testCase);
    if (ids.has(testCase.caseId)) throw new Error(`duplicate semantic case ID: ${testCase.caseId}`);
    ids.add(testCase.caseId);
    for (const token of semanticCaseCoverageTokens(testCase)) {
      if (token.startsWith("critical:")) observedCritical.add(token);
      else if (token.startsWith("twise:")) observedTwise.add(token);
      else observedNegative.add(token);
    }
  }
  const missingCritical = expected.critical.filter((token) => !observedCritical.has(token));
  const missingTwise = expected.twise.filter((token) => !observedTwise.has(token));
  const missingNegative = expected.negative.filter((token) => !observedNegative.has(token));
  if (missingCritical.length > 0 || missingTwise.length > 0 || missingNegative.length > 0) {
    throw new Error(`semantic coverage incomplete: critical=${missingCritical.length} twise=${missingTwise.length} negative=${missingNegative.length}`);
  }
  const payload = {
    schema: "cheng_semantic_coverage_receipt.v1" as const,
    contractSha256: expected.contractSha256,
    caseCount: cases.length,
    criticalCount: observedCritical.size,
    twiseCount: observedTwise.size,
    negativeCount: observedNegative.size,
  };
  return deepFreeze({...payload, receiptSha256: sha256(canonicalJson(payload))});
}

function candidateTie(seed: string, caseId: string): string {
  return sha256(`${seed}\0${caseId}`);
}

function buildSuiteManifest(seed: string, cases: readonly SemanticCase[], coverageContract: SemanticCoverageContract): SemanticMatrixManifest {
  const acceptCount = cases.filter((entry) => entry.expected === "accept").length;
  const payload = {
    schema: CHENG_SEMANTIC_MATRIX_MANIFEST_SCHEMA as typeof CHENG_SEMANTIC_MATRIX_MANIFEST_SCHEMA,
    modelSchemaSha256: CHENG_SEMANTIC_MODEL_SCHEMA_SHA256,
    coverageContractSha256: coverageContract.contractSha256,
    seed,
    generator: "deterministic_weighted_set_cover_non_minimal.v1" as const,
    caseCount: cases.length,
    acceptCount,
    rejectCount: cases.length - acceptCount,
    caseIdsSha256: sha256(canonicalJson(cases.map((entry) => entry.caseId))),
    casesSha256: sha256(canonicalJson(cases)),
  };
  return deepFreeze({...payload, manifestSha256: sha256(canonicalJson(payload))});
}

interface CandidateTokenRow {
  readonly testCase: SemanticCase;
  readonly tie: string;
  readonly tokens: readonly string[];
}

export function generateSemanticMatrix(seed: string): SemanticMatrix {
  assertCanonicalSeed(seed);
  const universe = enumerateSemanticUniverse();
  const coverageContract = deriveSemanticCoverageContract();
  const required = new Set<string>([...coverageContract.critical, ...coverageContract.twise]);
  const tokenRows: CandidateTokenRow[] = universe.legalCases.map((testCase) => ({
    testCase,
    tie: candidateTie(seed, testCase.caseId),
    tokens: generationCoverageTokens(testCase).filter((token) => !token.startsWith("negative|")),
  }));
  const selected: SemanticCase[] = [];
  const selectedIds = new Set<string>();
  while (required.size > 0) {
    let best: CandidateTokenRow | null = null;
    let bestScore = 0;
    for (const row of tokenRows) {
      if (selectedIds.has(row.testCase.caseId)) continue;
      let score = 0;
      for (const token of row.tokens) if (required.has(token)) score += token.startsWith("critical:") ? 1024 : 1;
      if (score > bestScore || (score === bestScore && score > 0 && (best === null || row.tie < best.tie))) {
        best = row;
        bestScore = score;
      }
    }
    if (best === null || bestScore === 0) throw new Error(`semantic generator cannot cover ${required.size} obligations`);
    selected.push(best.testCase);
    selectedIds.add(best.testCase.caseId);
    for (const token of best.tokens) required.delete(token);
  }
  for (const testCase of universe.negativeCases) {
    if (!selectedIds.has(testCase.caseId)) {
      selected.push(testCase);
      selectedIds.add(testCase.caseId);
    }
  }
  selected.sort((a, b) => a.caseId.localeCompare(b.caseId));
  const coverage = validateSemanticCoverage(selected);
  return deepFreeze({
    schema: CHENG_SEMANTIC_MATRIX_SCHEMA,
    manifest: buildSuiteManifest(seed, selected, coverageContract),
    coverage,
    cases: selected,
  });
}

export function validateSemanticMatrix(suite: SemanticMatrix): Readonly<{caseCount: number; manifestSha256: string}> {
  if (suite.schema !== CHENG_SEMANTIC_MATRIX_SCHEMA) throw new Error("invalid semantic matrix schema");
  assertCanonicalSeed(suite.manifest.seed);
  const coverage = validateSemanticCoverage(suite.cases);
  const expectedManifest = buildSuiteManifest(suite.manifest.seed, suite.cases, deriveSemanticCoverageContract());
  if (canonicalJson(expectedManifest) !== canonicalJson(suite.manifest)) throw new Error("semantic matrix manifest mismatch");
  if (canonicalJson(coverage) !== canonicalJson(suite.coverage)) throw new Error("semantic matrix coverage receipt mismatch");
  return deepFreeze({caseCount: suite.cases.length, manifestSha256: suite.manifest.manifestSha256});
}

function shardIndexForCase(caseId: string, shardCount: number): number {
  const match = /^sem\.v1\.([0-9a-f]{64})$/.exec(caseId);
  const digest = match?.[1];
  if (digest === undefined) throw new Error(`invalid semantic case ID for sharding: ${caseId}`);
  return Number(BigInt(`0x${digest.slice(0, 16)}`) % BigInt(shardCount));
}

function buildShardManifest(suite: SemanticMatrix, shardIndex: number, shardCount: number, cases: readonly SemanticCase[]): SemanticShardManifest {
  const payload = {
    schema: CHENG_SEMANTIC_MATRIX_SHARD_SCHEMA as typeof CHENG_SEMANTIC_MATRIX_SHARD_SCHEMA,
    parentManifestSha256: suite.manifest.manifestSha256,
    seed: suite.manifest.seed,
    shardIndex,
    shardCount,
    caseCount: cases.length,
    caseIdsSha256: sha256(canonicalJson(cases.map((entry) => entry.caseId))),
    casesSha256: sha256(canonicalJson(cases)),
  };
  return deepFreeze({...payload, manifestSha256: sha256(canonicalJson(payload))});
}

export function buildSemanticMatrixShard(suite: SemanticMatrix, shardIndex: number, shardCount: number): SemanticMatrixShard {
  validateSemanticMatrix(suite);
  if (!Number.isInteger(shardCount) || shardCount <= 0 || shardCount > 4096) throw new Error("semantic shardCount must be in [1,4096]");
  if (!Number.isInteger(shardIndex) || shardIndex < 0 || shardIndex >= shardCount) throw new Error("semantic shardIndex is out of range");
  const cases = suite.cases.filter((entry) => shardIndexForCase(entry.caseId, shardCount) === shardIndex);
  return deepFreeze({schema: CHENG_SEMANTIC_MATRIX_SHARD_SCHEMA, manifest: buildShardManifest(suite, shardIndex, shardCount, cases), cases});
}

export function validateSemanticMatrixShard(suite: SemanticMatrix, shard: SemanticMatrixShard): Readonly<{caseCount: number; manifestSha256: string}> {
  validateSemanticMatrix(suite);
  const expected = buildSemanticMatrixShard(suite, shard.manifest.shardIndex, shard.manifest.shardCount);
  if (canonicalJson(expected) !== canonicalJson(shard)) throw new Error("semantic shard manifest or membership mismatch");
  return deepFreeze({caseCount: shard.cases.length, manifestSha256: shard.manifest.manifestSha256});
}

export function reproduceSemanticCase(caseId: string): SemanticCase {
  const universe = enumerateSemanticUniverse();
  const found = [...universe.legalCases, ...universe.negativeCases].find((entry) => entry.caseId === caseId);
  if (found === undefined) throw new Error(`semantic case ID is not in the bounded schema: ${caseId}`);
  validateSemanticCase(found);
  return found;
}

export interface SemanticMaterializationRecipe {
  readonly schema: "cheng_semantic_materialization_recipe.v1";
  readonly caseId: string;
  readonly semanticCaseSha256: string;
  readonly type: {
    readonly modelType: SemanticTypeName;
    readonly scalarKind: SemanticTypeDescriptor["scalarKind"];
    readonly typeShape: SemanticTypeDescriptor["typeShape"];
    readonly managedDepth: SemanticTypeDescriptor["managedDepth"];
    readonly elementOwnership: SemanticTypeDescriptor["elementOwnership"];
    readonly ownershipDescriptorKind: SemanticTypeDescriptor["ownershipDescriptorKind"];
  };
  readonly origin: {
    readonly valueCategory: SemanticDimensions["valueCategory"];
    readonly recipeKind: string;
    readonly objectAndResultConstructionUseCall: true;
  };
  readonly destination: {
    readonly storage: SemanticDimensions["storage"];
    readonly alias: SemanticDimensions["alias"];
  };
  readonly callFixture: SymbolicCallRequirement | null;
  readonly fieldHops: readonly SymbolicFieldHopRequirement[];
  readonly controlFlow: SemanticDimensions["controlFlow"];
  readonly sourceSurface: SemanticDimensions["sourceSurface"];
  readonly resultTransport: SemanticDimensions["resultTransport"];
  readonly usesRawPointerSyntax: false;
  readonly recipeSha256: string;
}

function materializationOriginKind(testCase: SemanticCase): string {
  const {valueCategory, ownership, fieldPath, type} = testCase.dimensions;
  if (valueCategory === "literal") return `${type}_public_literal`;
  if (valueCategory === "ident") return ownership === "Unmanaged" ? "scalar_ident_read" : "managed_ident_borrow";
  if (valueCategory === "field") return fieldPath === "ref_boundary_field" ? "internal_managed_ref_hop_then_field_read" : "inline_field_read";
  if (valueCategory === "index") return "sequence_index_then_value_read";
  if (ownership === "Borrowed") return "exact_borrow_view_call_result";
  if (["object_str", "nested_inline_object_str", "result_str"].includes(type)) return "exact_constructor_or_factory_call_result";
  return "exact_value_call_result";
}

export function buildSemanticMaterializationRecipe(testCase: SemanticCase): SemanticMaterializationRecipe {
  const classification = validateSemanticCase(testCase);
  if (!classification.legal) throw new Error(`cannot materialize illegal semantic case ${testCase.caseId}`);
  const descriptor = TYPE_DESCRIPTORS[testCase.dimensions.type];
  const payload = {
    schema: "cheng_semantic_materialization_recipe.v1" as const,
    caseId: testCase.caseId,
    semanticCaseSha256: testCase.semanticSha256,
    type: {
      modelType: testCase.dimensions.type,
      scalarKind: descriptor.scalarKind,
      typeShape: descriptor.typeShape,
      managedDepth: descriptor.managedDepth,
      elementOwnership: descriptor.elementOwnership,
      ownershipDescriptorKind: descriptor.ownershipDescriptorKind,
    },
    origin: {
      valueCategory: testCase.dimensions.valueCategory,
      recipeKind: materializationOriginKind(testCase),
      objectAndResultConstructionUseCall: true as const,
    },
    destination: {storage: testCase.dimensions.storage, alias: testCase.dimensions.alias},
    callFixture: symbolicCallRequirement(testCase),
    fieldHops: symbolicFieldRequirements(testCase.dimensions.fieldPath),
    controlFlow: testCase.dimensions.controlFlow,
    sourceSurface: testCase.dimensions.sourceSurface,
    resultTransport: testCase.dimensions.resultTransport,
    usesRawPointerSyntax: false as const,
  };
  return deepFreeze({...payload, recipeSha256: sha256(canonicalJson(payload))});
}

export interface SymbolicCallRequirement {
  readonly exactCompilerInt32IdentityRequired: true;
  readonly preserveSameCompilerNodeAndDeclIndicesAcrossStages: true;
  readonly fixtureModuleOrdinal: 0 | 1;
  readonly fixtureDeclarationCount: 1 | 2;
  readonly targetFixtureDeclarationOrdinal: 0 | 1;
  readonly forbiddenKeys: readonly ["name+arity", "source_text", "source_line", "raw_pointer"];
}

export interface SymbolicFieldHopRequirement {
  readonly hopOrdinal: number;
  readonly kind: "field" | "managed_reference_boundary" | "sequence_index_boundary";
  readonly exactOwnerTypeIndexRequired: true;
  readonly exactLayoutReceiptRequired: true;
  readonly exactOffsetRequired: true;
}

export interface SymbolicSemanticFacts {
  readonly caseId: string;
  readonly modelCaseOrdinal: number;
  readonly type: SemanticDimensions["type"];
  readonly exprClass: SemanticDimensions["ownership"];
  readonly valueCategory: SemanticDimensions["valueCategory"];
  readonly storage: SemanticDimensions["storage"];
  readonly callRequirement: SymbolicCallRequirement | null;
  readonly fieldRequirements: readonly SymbolicFieldHopRequirement[];
  readonly resultTransport: SemanticDimensions["resultTransport"];
  readonly controlFlow: SemanticDimensions["controlFlow"];
  readonly alias: SemanticDimensions["alias"];
  readonly sourceSurface: SemanticDimensions["sourceSurface"];
  readonly materializationRecipeSha256: string;
  readonly ownershipActions: readonly string[];
  readonly controlFlowActions: readonly string[];
  readonly aliasInvariant: "proved_no_alias" | "retain_before_release_required";
}

export interface SemanticOracle {
  readonly schema: "cheng_symbolic_semantic_oracle.v1";
  readonly proofScope: "contract_model_only";
  readonly facts: SymbolicSemanticFacts;
  readonly observableContract: {
    readonly differentialIsSufficient: false;
    readonly primaryBackend2Required: true;
    readonly independentOwnershipLedgerRequired: true;
    readonly realObservedReceiptsRequired: true;
  };
  readonly oracleSha256: string;
}

function symbolicCallRequirement(testCase: SemanticCase): SymbolicCallRequirement | null {
  if (testCase.dimensions.valueCategory !== "call") return null;
  const overloaded = testCase.dimensions.overload === "same_name_same_arity";
  return deepFreeze({
    exactCompilerInt32IdentityRequired: true,
    preserveSameCompilerNodeAndDeclIndicesAcrossStages: true,
    fixtureModuleOrdinal: testCase.dimensions.moduleScope === "imported_module" ? 1 : 0,
    fixtureDeclarationCount: overloaded ? 2 : 1,
    targetFixtureDeclarationOrdinal: overloaded ? 1 : 0,
    forbiddenKeys: ["name+arity", "source_text", "source_line", "raw_pointer"],
  });
}

function symbolicFieldRequirements(fieldPath: SemanticDimensions["fieldPath"]): readonly SymbolicFieldHopRequirement[] {
  const kinds: SymbolicFieldHopRequirement["kind"][] = fieldPath === "none"
    ? []
    : fieldPath === "inline_field"
      ? ["field"]
      : fieldPath === "ref_boundary_field"
        ? ["managed_reference_boundary", "field"]
        : ["sequence_index_boundary", "field"];
  return deepFreeze(kinds.map((kind, hopOrdinal) => ({
    hopOrdinal,
    kind,
    exactOwnerTypeIndexRequired: true as const,
    exactLayoutReceiptRequired: true as const,
    exactOffsetRequired: true as const,
  })));
}

function ownershipActions(dimensions: SemanticDimensions): readonly string[] {
  if (dimensions.ownership === "Unmanaged") return ["store_plain"];
  if (dimensions.storage === "global" && dimensions.ownership === "Owned") {
    return ["materialize_owned_local", "move_into_destination", "release_displaced_value", "mark_source_consumed"];
  }
  if (dimensions.storage === "global") return ["retain_rhs_before_release", "store_destination", "release_displaced_value"];
  if (dimensions.ownership === "Owned") return ["bind_move", "mark_source_consumed"];
  return ["retain_rhs", "bind_local"];
}

function controlFlowActions(controlFlow: SemanticDimensions["controlFlow"]): readonly string[] {
  if (controlFlow === "straight") return ["single_reaching_definition"];
  if (controlFlow === "if_join") return ["branch_definitions", "exact_phi_join"];
  return ["entry_definition", "loop_backedge_definition", "exact_loop_phi"];
}

export function buildSemanticOracle(testCase: SemanticCase): SemanticOracle {
  const classification = validateSemanticCase(testCase);
  if (!classification.legal) throw new Error(`cannot build an acceptance oracle for illegal case ${testCase.caseId}`);
  const recipe = buildSemanticMaterializationRecipe(testCase);
  const facts: SymbolicSemanticFacts = {
    caseId: testCase.caseId,
    modelCaseOrdinal: testCase.modelCaseOrdinal,
    type: testCase.dimensions.type,
    exprClass: testCase.dimensions.ownership,
    valueCategory: testCase.dimensions.valueCategory,
    storage: testCase.dimensions.storage,
    callRequirement: recipe.callFixture,
    fieldRequirements: recipe.fieldHops,
    resultTransport: testCase.dimensions.resultTransport,
    controlFlow: testCase.dimensions.controlFlow,
    alias: testCase.dimensions.alias,
    sourceSurface: testCase.dimensions.sourceSurface,
    materializationRecipeSha256: recipe.recipeSha256,
    ownershipActions: ownershipActions(testCase.dimensions),
    controlFlowActions: controlFlowActions(testCase.dimensions.controlFlow),
    aliasInvariant: testCase.dimensions.alias === "no_alias" ? "proved_no_alias" : "retain_before_release_required",
  };
  const payload = {
    schema: "cheng_symbolic_semantic_oracle.v1" as const,
    proofScope: "contract_model_only" as const,
    facts,
    observableContract: {
      differentialIsSufficient: false as const,
      primaryBackend2Required: true as const,
      independentOwnershipLedgerRequired: true as const,
      realObservedReceiptsRequired: true as const,
    },
  };
  return deepFreeze({...payload, oracleSha256: sha256(canonicalJson(payload))});
}

const STAGE_ORDER = Object.freeze([
  "typed_expr",
  "csg",
  "lowering",
  "primary",
  "primary_regalloc",
  "backend2",
  "backend2_regalloc",
] as const);
type ContractStage = (typeof STAGE_ORDER)[number];

export interface SemanticStageContractReceipt {
  readonly schema: "cheng_semantic_stage_contract_receipt.v1";
  readonly stage: ContractStage;
  readonly backend: "primary" | "backend2" | null;
  readonly stageAction: string;
  readonly symbolicRequirements: SymbolicSemanticFacts;
  readonly receiptSha256: string;
}

export interface SemanticContractLedger {
  readonly schema: typeof CHENG_SEMANTIC_STAGE_LEDGER_SCHEMA;
  readonly status: "contract_only";
  readonly caseId: string;
  readonly oracleSha256: string;
  readonly receipts: readonly SemanticStageContractReceipt[];
  readonly ledgerSha256: string;
}

function stageAction(stage: ContractStage): string {
  const actions: Record<ContractStage, string> = {
    typed_expr: "require_classification_and_compiler_identity_receipt",
    csg: "require_semantic_preservation_receipt",
    lowering: "require_ownership_and_layout_preservation_receipt",
    primary: "require_primary_observed_emission_receipt",
    primary_regalloc: "require_primary_observed_regalloc_receipt",
    backend2: "require_backend2_observed_emission_receipt",
    backend2_regalloc: "require_backend2_observed_regalloc_receipt",
  };
  return actions[stage];
}

function receiptWithHash(stage: ContractStage, facts: SymbolicSemanticFacts): SemanticStageContractReceipt {
  const backend = stage.startsWith("primary") ? "primary" : stage.startsWith("backend2") ? "backend2" : null;
  const payload = {
    schema: "cheng_semantic_stage_contract_receipt.v1" as const,
    stage,
    backend: backend as "primary" | "backend2" | null,
    stageAction: stageAction(stage),
    symbolicRequirements: facts,
  };
  return {...payload, receiptSha256: sha256(canonicalJson(payload))};
}

function ledgerWithHash(caseId: string, oracleSha256: string, receipts: readonly SemanticStageContractReceipt[]): SemanticContractLedger {
  const payload = {
    schema: CHENG_SEMANTIC_STAGE_LEDGER_SCHEMA as typeof CHENG_SEMANTIC_STAGE_LEDGER_SCHEMA,
    status: "contract_only" as const,
    caseId,
    oracleSha256,
    receipts,
  };
  return {...payload, ledgerSha256: sha256(canonicalJson(payload))};
}

export function buildSemanticContractLedger(testCase: SemanticCase): SemanticContractLedger {
  const oracle = buildSemanticOracle(testCase);
  return deepFreeze(ledgerWithHash(testCase.caseId, oracle.oracleSha256, STAGE_ORDER.map((stage) => receiptWithHash(stage, oracle.facts))));
}

function validateReceiptHashes(ledger: SemanticContractLedger): void {
  for (const receipt of ledger.receipts) {
    const {receiptSha256, ...payload} = receipt;
    if (receiptSha256 !== sha256(canonicalJson(payload))) throw new Error(`stage contract receipt hash mismatch: ${receipt.stage}`);
  }
  const {ledgerSha256, ...payload} = ledger;
  if (ledgerSha256 !== sha256(canonicalJson(payload))) throw new Error("semantic stage contract ledger hash mismatch");
}

export function validateSemanticContractLedger(testCase: SemanticCase, ledger: SemanticContractLedger): Readonly<{oracleSha256: string}> {
  if (ledger.schema !== CHENG_SEMANTIC_STAGE_LEDGER_SCHEMA || ledger.status !== "contract_only") throw new Error("semantic stage ledger is not a contract-only ledger");
  if (ledger.caseId !== testCase.caseId) throw new Error("semantic stage ledger case identity mismatch");
  if (canonicalJson(ledger.receipts.map((entry) => entry.stage)) !== canonicalJson(STAGE_ORDER)) throw new Error("semantic stage omission, duplication, or order mismatch");
  validateReceiptHashes(ledger);
  const oracle = buildSemanticOracle(testCase);
  if (ledger.oracleSha256 !== oracle.oracleSha256) throw new Error("semantic oracle identity mismatch");
  for (const receipt of ledger.receipts) {
    if (canonicalJson(receipt.symbolicRequirements) !== canonicalJson(oracle.facts)) throw new Error(`symbolic semantic oracle mismatch at ${receipt.stage}`);
  }
  const expected = buildSemanticContractLedger(testCase);
  if (canonicalJson(expected) !== canonicalJson(ledger)) throw new Error("semantic contract ledger is not canonical");
  return deepFreeze({oracleSha256: oracle.oracleSha256});
}

interface MutableSymbolicCallRequirement {
  exactCompilerInt32IdentityRequired: boolean;
  preserveSameCompilerNodeAndDeclIndicesAcrossStages: boolean;
  fixtureModuleOrdinal: number;
  fixtureDeclarationCount: number;
  targetFixtureDeclarationOrdinal: number;
  forbiddenKeys: string[];
}

interface MutableSymbolicFieldHopRequirement {
  hopOrdinal: number;
  kind: string;
  exactOwnerTypeIndexRequired: boolean;
  exactLayoutReceiptRequired: boolean;
  exactOffsetRequired: boolean;
}

interface MutableSymbolicFacts extends Omit<SymbolicSemanticFacts, "exprClass" | "callRequirement" | "fieldRequirements"> {
  exprClass: string;
  callRequirement: MutableSymbolicCallRequirement | null;
  fieldRequirements: MutableSymbolicFieldHopRequirement[];
}

interface MutableStageReceipt {
  schema: "cheng_semantic_stage_contract_receipt.v1";
  stage: ContractStage;
  backend: "primary" | "backend2" | null;
  stageAction: string;
  symbolicRequirements: MutableSymbolicFacts;
  receiptSha256: string;
}

interface MutableLedger {
  schema: typeof CHENG_SEMANTIC_STAGE_LEDGER_SCHEMA;
  status: "contract_only";
  caseId: string;
  oracleSha256: string;
  receipts: MutableStageReceipt[];
  ledgerSha256: string;
}

function mutableClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rehashMutatedLedger(ledger: MutableLedger): MutableLedger {
  for (const receipt of ledger.receipts) {
    const {receiptSha256: _discard, ...payload} = receipt;
    receipt.receiptSha256 = sha256(canonicalJson(payload));
  }
  const {ledgerSha256: _discard, ...payload} = ledger;
  ledger.ledgerSha256 = sha256(canonicalJson(payload));
  return ledger;
}

export type SemanticContractMutation = "ownership_swap" | "call_identity_swap" | "field_offset_proof_drop" | "stage_omission";

export function mutateSemanticContractLedger(ledgerInput: SemanticContractLedger, mutation: SemanticContractMutation): SemanticContractLedger {
  const ledger = mutableClone(ledgerInput) as unknown as MutableLedger;
  if (mutation === "ownership_swap") {
    const receipt = ledger.receipts.find((entry) => entry.stage === "lowering");
    if (receipt === undefined) throw new Error("ownership_swap requires lowering stage");
    receipt.symbolicRequirements.exprClass = receipt.symbolicRequirements.exprClass === "Owned" ? "Borrowed" : "Owned";
  } else if (mutation === "call_identity_swap") {
    const receipt = ledger.receipts.find((entry) => entry.stage === "primary");
    const call = receipt?.symbolicRequirements.callRequirement;
    if (call === null || call === undefined) throw new Error("call_identity_swap requires a call case");
    call.targetFixtureDeclarationOrdinal = call.targetFixtureDeclarationOrdinal === 0 ? 1 : 0;
  } else if (mutation === "field_offset_proof_drop") {
    const receipt = ledger.receipts.find((entry) => entry.stage === "backend2");
    const hop = receipt?.symbolicRequirements.fieldRequirements.at(-1);
    if (hop === undefined) throw new Error("field_offset_proof_drop requires a field/index case");
    hop.exactOffsetRequired = false;
  } else {
    ledger.receipts = ledger.receipts.filter((entry) => entry.stage !== "csg");
  }
  return deepFreeze(rehashMutatedLedger(ledger) as unknown as SemanticContractLedger);
}

export class SemanticPipelineRunnerUnavailableError extends Error {
  readonly code = "REAL_PIPELINE_RUNNER_REQUIRED";

  constructor() {
    super("REAL_PIPELINE_RUNNER_REQUIRED: no compiler-owned command emits source-bound exact TypedExpr, CSG/lowering, primary, backend2, and regalloc observed receipts");
    this.name = "SemanticPipelineRunnerUnavailableError";
  }
}

// Deliberately returns no success in v1. Accepting a caller object here would turn
// self-reported hashes/oracle echoes into a false pipeline proof.
export async function executeSemanticMatrixShard(
  suite: SemanticMatrix,
  shard: SemanticMatrixShard,
  _runner: unknown = null,
): Promise<never> {
  validateSemanticMatrixShard(suite, shard);
  throw new SemanticPipelineRunnerUnavailableError();
}

export interface SemanticDeltaReduction {
  readonly schema: "cheng_semantic_delta_reduction.v1";
  readonly originalCaseIds: readonly string[];
  readonly reducedCaseIds: readonly string[];
  readonly predicateCalls: number;
  readonly semanticLegalityPreserved: true;
  readonly failurePredicatePreserved: true;
  readonly reducedCases: readonly SemanticCase[];
  readonly receiptSha256: string;
}

export async function deltaReduceFailingSemanticCases(
  cases: readonly SemanticCase[],
  failurePredicate: (candidate: readonly SemanticCase[]) => boolean | Promise<boolean>,
): Promise<SemanticDeltaReduction> {
  if (cases.length === 0) throw new Error("delta reduction requires non-empty semantic cases");
  for (const testCase of cases) if (!validateSemanticCase(testCase).legal) throw new Error("delta reduction accepts only semantically legal cases");
  let current = [...new Map(cases.map((entry) => [entry.caseId, entry])).values()];
  if (!(await failurePredicate(current))) throw new Error("delta reduction initial set does not preserve the failure predicate");
  let granularity = 2;
  let predicateCalls = 1;
  while (current.length >= 2) {
    const chunkSize = Math.ceil(current.length / granularity);
    let reduced = false;
    for (let start = 0; start < current.length; start += chunkSize) {
      const candidate = current.slice(0, start).concat(current.slice(start + chunkSize));
      if (candidate.length === 0) continue;
      for (const testCase of candidate) if (!validateSemanticCase(testCase).legal) throw new Error("delta reducer produced an illegal semantic case");
      predicateCalls += 1;
      if (await failurePredicate(candidate)) {
        current = candidate;
        granularity = Math.max(2, granularity - 1);
        reduced = true;
        break;
      }
    }
    if (reduced) continue;
    if (granularity >= current.length) break;
    granularity = Math.min(current.length, granularity * 2);
  }
  predicateCalls += 1;
  if (!(await failurePredicate(current))) throw new Error("delta reduction lost the failure predicate");
  for (const testCase of current) if (!validateSemanticCase(testCase).legal) throw new Error("delta reduction final set is semantically illegal");
  const payload = {
    schema: "cheng_semantic_delta_reduction.v1" as const,
    originalCaseIds: cases.map((entry) => entry.caseId),
    reducedCaseIds: current.map((entry) => entry.caseId),
    predicateCalls,
    semanticLegalityPreserved: true as const,
    failurePredicatePreserved: true as const,
  };
  return deepFreeze({...payload, reducedCases: current, receiptSha256: sha256(canonicalJson(payload))});
}
