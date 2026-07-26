import { createHash } from "node:crypto";
import { canonicalJson } from "./cheng_semantic_matrix_m9023.ts";
import {
  assertExactCurrentObjectKeys,
  parseUniqueCurrentJson,
} from "./current_schema_json.ts";

const HASH = /^[0-9a-f]{64}$/;
const EMPTY_HASH = createHash("sha256").digest("hex");

export const CHENG_CURRENT_DRIVER_GENERATION_RECEIPT_SCHEMA =
  "cheng_current_driver_generation_receipt";
export const CHENG_CURRENT_DRIVER_GENERATION_ENVIRONMENT_SCHEMA =
  "cheng_current_driver_generation_environment";

export const CHENG_CURRENT_SEMANTIC_INPUT_SPECS = Object.freeze([
  ["cheng-package.toml", "project_manifest"],
  ["src/core/tooling/semantic_snapshot.cheng", "core_source"],
  ["src/core/tooling/semantic_snapshot_production.cheng", "production_source"],
  [
    "src/core/tooling/compiler_snapshot_builder.cheng",
    "snapshot_builder_source",
  ],
  ["src/core/tooling/compiler_csg.cheng", "compiler_csg_source"],
  ["src/core/tooling/lsp_server.cheng", "lsp_producer_source"],
  [
    "src/core/tooling/semantic_snapshot_query_projection.cheng",
    "query_projection_source",
  ],
  ["src/core/lang/typed_expr.cheng", "typed_expr_source"],
  ["src/core/lang/parser.cheng", "parser_declaration_source"],
  ["src/core/tooling/compiler_parser_receipt.cheng", "parser_receipt_source"],
  [
    "src/core/csg_core/compiler_snapshot_schema.cheng",
    "snapshot_schema_source",
  ],
  ["src/core/csg_core/compiler_snapshot_cargo.cheng", "snapshot_cargo_source"],
  ["src/core/csg_core/validator.cheng", "snapshot_cargo_validator_source"],
  ["src/core/backend/compiler_facts.cheng", "compiler_fact_source"],
  ["src/core/backend/primary_object_plan.cheng", "primary_object_plan_source"],
  ["src/core/backend/direct_object_emit.cheng", "direct_object_emit_source"],
  ["src/core/backend/macho_object_writer.cheng", "macho_object_writer_source"],
  ["src/tests/semantic_snapshot_core_smoke.cheng", "core_smoke_source"],
  [
    "src/tests/semantic_snapshot_production_binding_smoke.cheng",
    "production_smoke_source",
  ],
  [
    "src/tests/semantic_snapshot_rejection_smoke.cheng",
    "rejection_smoke_source",
  ],
  [
    "src/tests/lsp_multifile_exact_snapshot_acceptance_smoke.cheng",
    "lsp_version_isolation_smoke_source",
  ],
  ["tools/semantic_snapshot_core_gate.sh", "core_gate_source"],
  [
    "tools/semantic_snapshot_production_binding_gate.sh",
    "production_gate_source",
  ],
  ["tools/semantic_snapshot_rejection_gate.sh", "rejection_gate_source"],
  [
    "tools/lsp_multifile_exact_snapshot_acceptance_gate.sh",
    "published_candidate_gate_source",
  ],
  ["tools/beat_c_process_group_guard.sh", "process_tree_guard"],
  ["artifacts/bootstrap/cheng.stage3", "compiler"],
  ["bootstrap/cheng_cold.c", "cold_compiler_source"],
  ["bootstrap/cold_parser.h", "cold_compiler_include"],
  ["bootstrap/macho_direct.h", "cold_compiler_include"],
  ["bootstrap/elf64_direct.h", "cold_compiler_include"],
  ["bootstrap/coff_direct.h", "cold_compiler_include"],
  ["bootstrap/x64_emit.h", "cold_compiler_include"],
  ["bootstrap/rv64_emit.h", "cold_compiler_include"],
  ["bootstrap/cold_chengcsg_format.h", "cold_compiler_include"],
  ["bootstrap/cold_parser.c", "cold_compiler_include"],
  ["bootstrap/host_runtime.c", "cold_compiler_include"],
  ["bootstrap/cold_types.h", "cold_compiler_include"],
] as const);

const STRUCTURAL_CHECKS = Object.freeze([
  "removed_fallible_apis_absent",
  "core_commits_scalar_only",
  "production_commit_scalar_only",
  "exact_reclaim_constant_time",
  "rejection_terminal_has_no_fallible_tail",
] as const);

const CLOSURE_OBSERVATION_KEYS = Object.freeze([
  "moduleSymbolCoordinateContractExact",
  "referenceOwnerSymbolColumnExact",
  "referenceOwnerSourceFunctionTargetKindExact",
  "referenceBuilderOwnerRemapExact",
  "referenceCargoBindingExact",
  "compilerReferenceFactProjectionExact",
  "lspReferenceIdentityExact",
  "referenceIdentityNoTextOrNameArity",
  "referenceOwnerIdentityContractExact",
  "builderProjectsModuleSymbols",
  "typedCallDeclarationProducerCoordinatesExact",
  "compilerCsgExactCallProjection",
  "exactCallProjection",
  "lspCurrentVersionPinExact",
  "lspSixQueryUncompletedVersionRejection",
  "primaryDebugConsumptionExact",
  "directObjectDebugConsumptionExact",
  "machoDwarfWriterExact",
  "machoDwarfSectionRelocationConsumptionExact",
  "publishedCandidateEvidence",
  "functionOnlyCardinality",
  "functionOnlyKind",
  "builderConsumesDeclarationStream",
  "builderConsumesPatternStream",
  "forcedMissingFacts",
  "admissionRequiresBlocked",
  "lspStagesCandidate",
  "lspCommitsCandidate",
  "lspRejectsFailure",
  "candidatePublicationRequiresZeroMissingFacts",
  "publishedCandidateFixtureMultifileExact",
] as const);

const FALSE_CLOSURE_OBSERVATIONS = new Set([
  "functionOnlyCardinality",
  "functionOnlyKind",
  "forcedMissingFacts",
  "admissionRequiresBlocked",
]);

const PUBLISHED_ROUTING_FRAGMENTS = Object.freeze([
  'if ! "$GUARD" --rss-limit:1073741824 --timeout:240 ',
  'run_guard compiler_build cc -std=c11 -O2 -o "$COMPILER" "$COMPILER_SOURCE"',
  'run_guard smoke_build "$COMPILER" system-link-exec ',
  'run_guard object_first "$COMPILER" system-link-exec ',
  'run_guard object_second "$COMPILER" system-link-exec ',
  'cmp "$WORK/object.first.o" "$OBJECT"',
  'SOURCE_CLOSURE_AFTER_OBJECT_CID="$(source_closure_cid source-closure-after-object)"',
  'SOURCE_CLOSURE_AFTER_RUNTIME_CID="$(source_closure_cid source-closure-after-runtime)"',
  "lsp_multifile_exact_snapshot_acceptance_gate_status=pass",
  "compiler_source_sha256=%s",
  "lsp_module_sha256=%s",
  "query_projection_module_sha256=%s",
  "compiler_csg_module_sha256=%s",
  "source_closure_cid=%s",
  "object_sha256=%s",
  "^lsp_multifile_exact_snapshot_acceptance_status=pass published=1 ",
] as const);

export interface CurrentSemanticInputArtifact {
  readonly relativePath: string;
  readonly role: string;
  readonly raw: Buffer;
}

export interface CurrentSemanticSourceSnapshotRow {
  readonly relativePath: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface CurrentSemanticSnapshotRawEvidence {
  readonly expectedRoot: string;
  readonly inputArtifacts: readonly CurrentSemanticInputArtifact[];
  readonly sourceSnapshotRows: readonly CurrentSemanticSourceSnapshotRow[];
  readonly publishedStdoutRaw: Buffer;
  readonly sourceClosureRaw: Buffer;
  readonly publishedObjectRaw: Buffer;
  readonly bindingRaw: Buffer;
  readonly queryProjectionRaw: Buffer;
  readonly openDocumentUniverseRaw: Buffer;
  readonly snapshotRaw: Buffer;
}

export interface CurrentReleaseIdentityBinding {
  readonly sourceBundleRaw32: string;
  readonly officialDriverRaw32: string;
  readonly executionRaw32: string;
}

export interface CurrentSemanticSnapshotValidation {
  readonly sourceSetCid: string;
  readonly structuralReceiptCid: string;
  readonly closureReceiptCid: string;
  readonly compilerInputReceiptCid: string;
  readonly publishedReceiptCid: string;
  readonly queryProjectionCid: string;
  readonly openDocumentUniverseCid: string;
  readonly snapshotRaw32: string;
  readonly auditCid: string;
}

export interface CurrentMemoryReleaseIdentity {
  readonly sourceClosureRaw32: string;
  readonly drivers: readonly {
    readonly targetTriple:
      "aarch64-unknown-linux-gnu" | "x86_64-unknown-linux-gnu";
    readonly bytesRaw32: string;
  }[];
}

export interface CurrentGenerationEnvironment {
  readonly jobs: number;
  readonly env: Readonly<Record<string, string>>;
}

export interface CurrentGenerationExecution {
  readonly generation: "GEN2" | "GEN3";
  readonly producerDriverRaw32: string;
  readonly inputSourceClosureRaw32: string;
  readonly commandRaw32: string;
  readonly environmentRaw32: string;
  readonly backend2EpochRaw32: string;
  readonly jobs: number;
  readonly stdoutRaw32: string;
  readonly stderrRaw32: string;
  readonly outputDriverRaw32: string;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function observedHash(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !HASH.test(value) ||
    value === EMPTY_HASH ||
    value === "0".repeat(64)
  ) {
    throw new Error(`${label}_raw32_invalid`);
  }
  return value;
}

function frame(value: Buffer | string): readonly Buffer[] {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  if (raw.length > 0xffffffff) {
    throw new Error("current_release_cid_part_too_large");
  }
  const size = Buffer.allocUnsafe(4);
  size.writeUInt32BE(raw.length);
  return [size, raw];
}

export function currentReleaseDomainCid(
  domain: string,
  parts: readonly (Buffer | string)[],
): string {
  const hash = createHash("sha256");
  for (const value of [domain, ...parts]) {
    for (const part of frame(value)) hash.update(part);
  }
  return hash.digest("hex");
}

function exactArray(
  value: unknown,
  expected: readonly unknown[],
  label: string,
): void {
  if (
    !Array.isArray(value) ||
    canonicalJson(value) !== canonicalJson(expected)
  ) {
    throw new Error(`${label}_invalid`);
  }
}

function parseKeyValueReceipt(raw: Buffer, label: string): Map<string, string> {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  if (!text.endsWith("\n") || text.includes("\r") || text.includes("\0")) {
    throw new Error(`${label}_wire_invalid`);
  }
  const rows = new Map<string, string>();
  for (const line of text.slice(0, -1).split("\n")) {
    const split = line.indexOf("=");
    if (split <= 0) throw new Error(`${label}_row_invalid`);
    const key = line.slice(0, split);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || rows.has(key)) {
      throw new Error(`${label}_key_invalid`);
    }
    rows.set(key, line.slice(split + 1));
  }
  return rows;
}

function requireRow(
  rows: ReadonlyMap<string, string>,
  key: string,
  label: string,
): string {
  const value = rows.get(key);
  if (value === undefined) throw new Error(`${label}_missing:${key}`);
  return value;
}

function semanticInputs(
  audit: Record<string, any>,
  evidence: CurrentSemanticSnapshotRawEvidence,
): Map<string, CurrentSemanticInputArtifact> {
  if (
    audit.root !== evidence.expectedRoot ||
    !Array.isArray(audit.inputs) ||
    audit.inputs.length !== CHENG_CURRENT_SEMANTIC_INPUT_SPECS.length ||
    evidence.inputArtifacts.length !== CHENG_CURRENT_SEMANTIC_INPUT_SPECS.length
  ) {
    throw new Error("current_release_semantic_input_set_invalid");
  }
  const snapshotRows = new Map(
    evidence.sourceSnapshotRows.map((row) => [row.relativePath, row]),
  );
  const out = new Map<string, CurrentSemanticInputArtifact>();
  for (
    let index = 0;
    index < CHENG_CURRENT_SEMANTIC_INPUT_SPECS.length;
    index += 1
  ) {
    const [relativePath, role] = CHENG_CURRENT_SEMANTIC_INPUT_SPECS[index]!;
    const declared = audit.inputs[index];
    const artifact = evidence.inputArtifacts[index];
    assertExactCurrentObjectKeys(
      declared,
      ["path", "role", "bytes", "sha256"],
      `current_release_semantic_input_${index}`,
    );
    if (
      artifact === undefined ||
      artifact.relativePath !== relativePath ||
      artifact.role !== role ||
      declared.path !== relativePath ||
      declared.role !== role ||
      artifact.raw.length <= 0 ||
      declared.bytes !== artifact.raw.length ||
      declared.sha256 !== sha256(artifact.raw)
    ) {
      throw new Error(`current_release_semantic_input_${index}_drift`);
    }
    const sourceRow = snapshotRows.get(relativePath);
    if (
      sourceRow === undefined ||
      sourceRow.byteLength !== artifact.raw.length ||
      sourceRow.sha256 !== declared.sha256
    ) {
      throw new Error(`current_release_semantic_input_${index}_not_frozen`);
    }
    out.set(relativePath, artifact);
  }
  return out;
}

function recomputeCompilerInputReceipt(
  inputs: ReadonlyMap<string, CurrentSemanticInputArtifact>,
  compilerInputAudit: unknown,
): string {
  assertExactCurrentObjectKeys(
    compilerInputAudit,
    ["status", "rootPath", "inputCount", "includeEdgeCount", "receiptCid"],
    "current_release_compiler_input_audit",
  );
  const audit = compilerInputAudit as Record<string, unknown>;
  const queue = ["bootstrap/cheng_cold.c"];
  const visited = new Set<string>();
  const edges: string[] = [];
  while (queue.length > 0) {
    const path = queue.shift()!;
    if (visited.has(path)) continue;
    visited.add(path);
    const input = inputs.get(path);
    if (input === undefined) {
      throw new Error(`current_release_compiler_input_missing:${path}`);
    }
    const source = new TextDecoder("utf-8", { fatal: true }).decode(input.raw);
    for (const match of source.matchAll(
      /^[ \t]*#include[ \t]+"([^"\r\n]*)"([^\r\n]*)$/gm,
    )) {
      if (!/^[A-Za-z0-9_.-]+$/.test(match[1]!) || match[2]!.trim() !== "") {
        throw new Error("current_release_compiler_include_invalid");
      }
      const included = `bootstrap/${match[1]}`;
      if (!inputs.has(included)) {
        throw new Error(`current_release_compiler_include_unbound:${included}`);
      }
      edges.push(`${path}->${included}`);
      if (!visited.has(included)) queue.push(included);
    }
  }
  const declared = CHENG_CURRENT_SEMANTIC_INPUT_SPECS.filter(
    ([, role]) => role === "cold_compiler_include",
  )
    .map(([path]) => path)
    .sort();
  const reached = [...visited]
    .filter((path) => path !== "bootstrap/cheng_cold.c")
    .sort();
  if (canonicalJson(declared) !== canonicalJson(reached)) {
    throw new Error("current_release_compiler_include_closure_invalid");
  }
  const receiptCid = currentReleaseDomainCid(
    "cheng.semantic_snapshot.cold_compiler_include_closure",
    [
      ...[...visited]
        .sort()
        .flatMap((path) => [path, sha256(inputs.get(path)!.raw)]),
      ...edges.sort(),
    ],
  );
  if (
    audit.status !== "pass" ||
    audit.rootPath !== "bootstrap/cheng_cold.c" ||
    audit.inputCount !== visited.size ||
    audit.includeEdgeCount !== edges.length ||
    audit.receiptCid !== receiptCid
  ) {
    throw new Error("current_release_compiler_input_audit_drift");
  }
  return receiptCid;
}

function validatePublishedRouting(gateRaw: Buffer, guardRaw32: string): string {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(gateRaw);
  const logical = source.replace(/\\\n[ \t]*/g, " ");
  for (const fragment of PUBLISHED_ROUTING_FRAGMENTS) {
    if (!logical.includes(fragment)) {
      throw new Error("current_release_published_routing_incomplete");
    }
  }
  const calls = [
    ...logical.matchAll(
      /^[ \t]*run_guard[ \t]+(compiler_build|smoke_build|object_first|object_second)\b/gm,
    ),
  ];
  if (
    calls.length !== 4 ||
    new Set(calls.map((match) => match[1])).size !== 4 ||
    (
      logical.match(
        /"\$GUARD"[ \t]+--rss-limit:1073741824[ \t]+--timeout:240/g,
      ) || []
    ).length !== 2 ||
    /^[ \t]*(?:sleep|poll)\b/gm.test(logical) ||
    /^[ \t]*[^#\n]*\|\|[ \t]*true[ \t]*(?:$|#)/gm.test(logical)
  ) {
    throw new Error("current_release_published_routing_invalid");
  }
  return currentReleaseDomainCid(
    "cheng.semantic_snapshot.published_candidate_gate_routing",
    [sha256(gateRaw), guardRaw32, ...PUBLISHED_ROUTING_FRAGMENTS],
  );
}

export function validateCurrentSemanticSnapshotEvidence(
  auditValue: unknown,
  bitmapValue: unknown,
  identity: CurrentReleaseIdentityBinding,
  evidence: CurrentSemanticSnapshotRawEvidence,
): CurrentSemanticSnapshotValidation {
  assertExactCurrentObjectKeys(
    auditValue,
    [
      "schema",
      "status",
      "scope",
      "root",
      "sourceSetCid",
      "structuralAudit",
      "productionClosureAudit",
      "publishedCandidateReceipt",
      "compilerInputAudit",
      "inputs",
      "auditCid",
    ],
    "current_release_semantic_audit",
  );
  const audit = auditValue as Record<string, any>;
  if (
    audit.schema !== "cheng.semantic_snapshot.audit" ||
    audit.status !== "pass" ||
    audit.scope !== "production_closure"
  ) {
    throw new Error("current_release_semantic_audit_status_invalid");
  }
  const inputs = semanticInputs(audit, evidence);
  const sourceSetCid = currentReleaseDomainCid(
    "cheng.semantic_snapshot.audit_source_set",
    CHENG_CURRENT_SEMANTIC_INPUT_SPECS.flatMap(([path, role]) => {
      const raw = inputs.get(path)!.raw;
      return [path, role, String(raw.length), sha256(raw)];
    }),
  );
  if (audit.sourceSetCid !== sourceSetCid) {
    throw new Error("current_release_semantic_source_set_cid_drift");
  }

  assertExactCurrentObjectKeys(
    audit.structuralAudit,
    ["status", "checks", "receiptCid"],
    "current_release_structural_audit",
  );
  const structural = audit.structuralAudit as Record<string, unknown>;
  exactArray(
    structural.checks,
    STRUCTURAL_CHECKS,
    "current_release_structural_checks",
  );
  const structuralReceiptCid = currentReleaseDomainCid(
    "cheng.semantic_snapshot.structure_audit",
    [
      inputs.get("src/core/tooling/semantic_snapshot.cheng")!.raw,
      inputs.get("src/core/tooling/semantic_snapshot_production.cheng")!.raw,
      ...STRUCTURAL_CHECKS,
    ],
  );
  if (
    structural.status !== "pass" ||
    structural.receiptCid !== structuralReceiptCid
  ) {
    throw new Error("current_release_structural_audit_cid_drift");
  }

  assertExactCurrentObjectKeys(
    audit.publishedCandidateReceipt,
    [
      "schema",
      "status",
      "executionBound",
      "sourceVersion",
      "documentCount",
      "openDocumentCount",
      "compilerSha256",
      "sourceClosureCid",
      "objectSha256",
      "bindingReceiptCid",
      "queryProjectionCid",
      "openDocumentUniverseCid",
      "stdoutSha256",
      "runtimeReceiptCid",
      "routingReceiptCid",
      "receiptCid",
    ],
    "current_release_published_candidate",
  );
  const published = audit.publishedCandidateReceipt as Record<string, unknown>;
  const stdout = parseKeyValueReceipt(
    evidence.publishedStdoutRaw,
    "current_release_published_stdout",
  );
  const stdoutKeys = [
    "lsp_multifile_exact_snapshot_acceptance_gate_status",
    "source_sha256",
    "gate_sha256",
    "compiler_sha256",
    "compiler_source_sha256",
    "lsp_module_sha256",
    "query_projection_module_sha256",
    "compiler_csg_module_sha256",
    "source_closure_cid",
    "object_sha256",
    "lsp_multifile_exact_snapshot_acceptance_status",
  ];
  if (
    stdout.size !== stdoutKeys.length ||
    [...stdout.keys()].some((key) => !stdoutKeys.includes(key)) ||
    requireRow(
      stdout,
      "lsp_multifile_exact_snapshot_acceptance_gate_status",
      "current_release_published_stdout",
    ) !== "pass"
  ) {
    throw new Error("current_release_published_stdout_schema_invalid");
  }
  for (const [field, path] of [
    [
      "source_sha256",
      "src/tests/lsp_multifile_exact_snapshot_acceptance_smoke.cheng",
    ],
    ["gate_sha256", "tools/lsp_multifile_exact_snapshot_acceptance_gate.sh"],
    ["compiler_source_sha256", "bootstrap/cheng_cold.c"],
    ["lsp_module_sha256", "src/core/tooling/lsp_server.cheng"],
    [
      "query_projection_module_sha256",
      "src/core/tooling/semantic_snapshot_query_projection.cheng",
    ],
    ["compiler_csg_module_sha256", "src/core/tooling/compiler_csg.cheng"],
  ] as const) {
    if (
      requireRow(stdout, field, "current_release_published_stdout") !==
      sha256(inputs.get(path)!.raw)
    ) {
      throw new Error(`current_release_published_stdout_${field}_drift`);
    }
  }
  const runtime =
    /^pass published=1 source_version=([1-9][0-9]*) documents=([1-9][0-9]*) open_documents=([1-9][0-9]*) binding_receipt=([0-9a-f]{64}) query_projection=([0-9a-f]{64}) open_document_universe=([0-9a-f]{64})$/.exec(
      requireRow(
        stdout,
        "lsp_multifile_exact_snapshot_acceptance_status",
        "current_release_published_stdout",
      ),
    );
  if (runtime === null) {
    throw new Error("current_release_published_runtime_invalid");
  }
  const sourceVersion = Number(runtime[1]);
  const documentCount = Number(runtime[2]);
  const openDocumentCount = Number(runtime[3]);
  const bindingReceiptCid = runtime[4]!;
  const queryProjectionCid = runtime[5]!;
  const openDocumentUniverseCid = runtime[6]!;
  const compilerSha256 = requireRow(
    stdout,
    "compiler_sha256",
    "current_release_published_stdout",
  );
  const sourceClosureCid = requireRow(
    stdout,
    "source_closure_cid",
    "current_release_published_stdout",
  );
  const objectSha256 = requireRow(
    stdout,
    "object_sha256",
    "current_release_published_stdout",
  );
  for (const [label, actual, raw] of [
    ["source_closure", sourceClosureCid, evidence.sourceClosureRaw],
    ["object", objectSha256, evidence.publishedObjectRaw],
    ["binding", bindingReceiptCid, evidence.bindingRaw],
    ["query", queryProjectionCid, evidence.queryProjectionRaw],
    [
      "open_document_universe",
      openDocumentUniverseCid,
      evidence.openDocumentUniverseRaw,
    ],
  ] as const) {
    observedHash(actual, `current_release_published_${label}`);
    if (raw.length <= 0 || sha256(raw) !== actual) {
      throw new Error(`current_release_published_${label}_artifact_drift`);
    }
  }
  if (
    !Number.isSafeInteger(sourceVersion) ||
    sourceVersion <= 1 ||
    !Number.isSafeInteger(documentCount) ||
    documentCount < 2 ||
    !Number.isSafeInteger(openDocumentCount) ||
    openDocumentCount < 2 ||
    openDocumentCount > documentCount ||
    compilerSha256 !==
      sha256(inputs.get("artifacts/bootstrap/cheng.stage3")!.raw) ||
    new Set([bindingReceiptCid, queryProjectionCid, openDocumentUniverseCid])
      .size !== 3
  ) {
    throw new Error("current_release_published_identity_invalid");
  }
  const stdoutRaw32 = sha256(evidence.publishedStdoutRaw);
  const runtimeReceiptCid = currentReleaseDomainCid(
    "cheng.semantic_snapshot.published_candidate_receipt",
    [
      sourceSetCid,
      stdoutRaw32,
      compilerSha256,
      sourceClosureCid,
      objectSha256,
      String(sourceVersion),
      String(documentCount),
      String(openDocumentCount),
      bindingReceiptCid,
      queryProjectionCid,
      openDocumentUniverseCid,
    ],
  );
  const routingReceiptCid = validatePublishedRouting(
    inputs.get("tools/lsp_multifile_exact_snapshot_acceptance_gate.sh")!.raw,
    sha256(inputs.get("tools/beat_c_process_group_guard.sh")!.raw),
  );
  const publishedReceiptCid = currentReleaseDomainCid(
    "cheng.semantic_snapshot.published_candidate_execution_receipt",
    [sourceSetCid, runtimeReceiptCid, routingReceiptCid],
  );
  if (
    published.schema !==
      "cheng.semantic_snapshot.published_candidate_receipt" ||
    published.status !== "pass" ||
    published.executionBound !== true ||
    published.sourceVersion !== sourceVersion ||
    published.documentCount !== documentCount ||
    published.openDocumentCount !== openDocumentCount ||
    published.compilerSha256 !== compilerSha256 ||
    published.sourceClosureCid !== sourceClosureCid ||
    published.objectSha256 !== objectSha256 ||
    published.bindingReceiptCid !== bindingReceiptCid ||
    published.queryProjectionCid !== queryProjectionCid ||
    published.openDocumentUniverseCid !== openDocumentUniverseCid ||
    published.stdoutSha256 !== stdoutRaw32 ||
    published.runtimeReceiptCid !== runtimeReceiptCid ||
    published.routingReceiptCid !== routingReceiptCid ||
    published.receiptCid !== publishedReceiptCid
  ) {
    throw new Error("current_release_published_candidate_cid_drift");
  }

  assertExactCurrentObjectKeys(
    audit.productionClosureAudit,
    ["status", "blockers", "observations", "receiptCid"],
    "current_release_semantic_closure",
  );
  const closure = audit.productionClosureAudit as Record<string, any>;
  assertExactCurrentObjectKeys(
    closure.observations,
    CLOSURE_OBSERVATION_KEYS,
    "current_release_semantic_observations",
  );
  if (
    closure.status !== "pass" ||
    !Array.isArray(closure.blockers) ||
    closure.blockers.length !== 0
  ) {
    throw new Error("current_release_semantic_closure_incomplete");
  }
  for (const key of CLOSURE_OBSERVATION_KEYS) {
    const expected = !FALSE_CLOSURE_OBSERVATIONS.has(key);
    if (closure.observations[key] !== expected) {
      throw new Error(`current_release_semantic_observation_invalid:${key}`);
    }
  }
  const closureSourcePaths = [
    "src/core/tooling/compiler_snapshot_builder.cheng",
    "src/core/tooling/lsp_server.cheng",
    "src/core/csg_core/compiler_snapshot_schema.cheng",
    "src/core/csg_core/compiler_snapshot_cargo.cheng",
    "src/core/csg_core/validator.cheng",
    "src/core/backend/compiler_facts.cheng",
    "src/core/lang/typed_expr.cheng",
    "src/core/tooling/compiler_csg.cheng",
    "src/tests/lsp_multifile_exact_snapshot_acceptance_smoke.cheng",
    "src/core/backend/primary_object_plan.cheng",
    "src/core/backend/direct_object_emit.cheng",
    "src/core/backend/macho_object_writer.cheng",
  ];
  const closureReceiptCid = currentReleaseDomainCid(
    "cheng.semantic_snapshot.production_closure_audit",
    [
      ...closureSourcePaths.map((path) => sha256(inputs.get(path)!.raw)),
      publishedReceiptCid,
      ...CLOSURE_OBSERVATION_KEYS.flatMap((key) => [
        key,
        closure.observations[key] ? "1" : "0",
      ]),
    ],
  );
  if (closure.receiptCid !== closureReceiptCid) {
    throw new Error("current_release_semantic_closure_cid_drift");
  }
  const compilerInputReceiptCid = recomputeCompilerInputReceipt(
    inputs,
    audit.compilerInputAudit,
  );
  const auditCid = currentReleaseDomainCid("cheng.semantic_snapshot.audit", [
    "production_closure",
    sourceSetCid,
    structuralReceiptCid,
    closureReceiptCid,
    compilerInputReceiptCid,
    publishedReceiptCid,
  ]);
  if (audit.auditCid !== auditCid) {
    throw new Error("current_release_semantic_audit_cid_drift");
  }
  if (evidence.snapshotRaw.length <= 0) {
    throw new Error("current_release_semantic_snapshot_artifact_empty");
  }

  assertExactCurrentObjectKeys(
    bitmapValue,
    [
      "schema",
      "status",
      "published",
      "missingFactBitmap",
      "sourceVersion",
      "sourceBundleRaw32",
      "officialDriverRaw32",
      "executionRaw32",
      "snapshotRaw32",
      "queryProjectionRaw32",
      "openDocumentUniverseRaw32",
      "publishedCandidateReceiptRaw32",
      "receiptRaw32",
    ],
    "current_release_semantic_bitmap",
  );
  const bitmap = bitmapValue as Record<string, unknown>;
  const receiptRaw32 = observedHash(
    bitmap.receiptRaw32,
    "current_release_semantic_bitmap",
  );
  const bitmapPayload = { ...bitmap };
  delete bitmapPayload.receiptRaw32;
  if (
    sha256(canonicalJson(bitmapPayload)) !== receiptRaw32 ||
    bitmap.schema !== "cheng_current_semantic_snapshot_admission_receipt" ||
    bitmap.status !== "PASS" ||
    bitmap.published !== 1 ||
    bitmap.missingFactBitmap !== 0 ||
    bitmap.sourceVersion !== sourceVersion ||
    bitmap.sourceBundleRaw32 !== identity.sourceBundleRaw32 ||
    bitmap.officialDriverRaw32 !== identity.officialDriverRaw32 ||
    bitmap.executionRaw32 !== identity.executionRaw32 ||
    bitmap.snapshotRaw32 !== sha256(evidence.snapshotRaw) ||
    bitmap.queryProjectionRaw32 !== queryProjectionCid ||
    bitmap.openDocumentUniverseRaw32 !== openDocumentUniverseCid ||
    bitmap.publishedCandidateReceiptRaw32 !== publishedReceiptCid
  ) {
    throw new Error("current_release_semantic_bitmap_or_identity_drift");
  }
  return Object.freeze({
    sourceSetCid,
    structuralReceiptCid,
    closureReceiptCid,
    compilerInputReceiptCid,
    publishedReceiptCid,
    queryProjectionCid,
    openDocumentUniverseCid,
    snapshotRaw32: sha256(evidence.snapshotRaw),
    auditCid,
  });
}

function parseMemoryPin(
  value: unknown,
  label: string,
): { readonly bytesRaw32: string } {
  assertExactCurrentObjectKeys(
    value,
    ["path", "byteLength", "bytesRaw32"],
    label,
  );
  const pin = value as Record<string, unknown>;
  if (
    typeof pin.path !== "string" ||
    !Number.isSafeInteger(pin.byteLength) ||
    Number(pin.byteLength) <= 0
  ) {
    throw new Error(`${label}_invalid`);
  }
  return { bytesRaw32: observedHash(pin.bytesRaw32, label) };
}

export function extractCurrentMemoryReleaseIdentity(
  value: unknown,
): CurrentMemoryReleaseIdentity {
  assertExactCurrentObjectKeys(
    value,
    [
      "schema",
      "evidenceKind",
      "sourceClosure",
      "workloadRunner",
      "drivers",
      "cases",
      "manifestSha256",
    ],
    "current_release_memory_manifest",
  );
  const manifest = value as Record<string, unknown>;
  if (
    manifest.schema !== "cheng.memory_release_gate" ||
    manifest.evidenceKind !== "production" ||
    !Array.isArray(manifest.drivers) ||
    manifest.drivers.length !== 2
  ) {
    throw new Error("current_release_memory_identity_invalid");
  }
  const targets = [
    "aarch64-unknown-linux-gnu",
    "x86_64-unknown-linux-gnu",
  ] as const;
  const drivers = manifest.drivers.map((value, index) => {
    assertExactCurrentObjectKeys(
      value,
      ["targetTriple", "artifact"],
      `current_release_memory_driver_${index}`,
    );
    const row = value as Record<string, unknown>;
    if (row.targetTriple !== targets[index]) {
      throw new Error("current_release_memory_driver_order_invalid");
    }
    return Object.freeze({
      targetTriple: targets[index]!,
      bytesRaw32: parseMemoryPin(
        row.artifact,
        `current_release_memory_driver_${index}_artifact`,
      ).bytesRaw32,
    });
  });
  return Object.freeze({
    sourceClosureRaw32: parseMemoryPin(
      manifest.sourceClosure,
      "current_release_memory_source",
    ).bytesRaw32,
    drivers: Object.freeze(drivers),
  });
}

export function parseCurrentGenerationEnvironment(
  value: unknown,
): CurrentGenerationEnvironment {
  assertExactCurrentObjectKeys(
    value,
    [
      "schema",
      "status",
      "jobs",
      "PATH",
      "LANG",
      "LC_ALL",
      "TZ",
      "BACKEND_INCREMENTAL",
      "BACKEND_MULTI_MODULE_CACHE",
      "CHENG_DISABLE_PRIMARY_OBJECT_CACHE",
      "CHENG_PROGRESS",
    ],
    "current_release_generation_environment",
  );
  const row = value as Record<string, unknown>;
  if (
    row.schema !== CHENG_CURRENT_DRIVER_GENERATION_ENVIRONMENT_SCHEMA ||
    row.status !== "FROZEN" ||
    !Number.isSafeInteger(row.jobs) ||
    Number(row.jobs) <= 0 ||
    Number(row.jobs) > 256 ||
    typeof row.PATH !== "string" ||
    row.PATH.length === 0 ||
    row.LANG !== "C" ||
    row.LC_ALL !== "C" ||
    row.TZ !== "UTC" ||
    row.BACKEND_INCREMENTAL !== "0" ||
    row.BACKEND_MULTI_MODULE_CACHE !== "0" ||
    row.CHENG_DISABLE_PRIMARY_OBJECT_CACHE !== "1" ||
    row.CHENG_PROGRESS !== "1"
  ) {
    throw new Error("current_release_generation_environment_invalid");
  }
  return Object.freeze({
    jobs: Number(row.jobs),
    env: Object.freeze({
      PATH: row.PATH,
      LANG: "C",
      LC_ALL: "C",
      TZ: "UTC",
      BACKEND_INCREMENTAL: "0",
      BACKEND_MULTI_MODULE_CACHE: "0",
      CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
      CHENG_PROGRESS: "1",
      BACKEND_JOBS: String(row.jobs),
    }),
  });
}

export function currentGenerationExecutionRaw32(
  value: CurrentGenerationExecution,
): string {
  return currentReleaseDomainCid(
    "cheng.compiler.current_driver_generation_execution",
    [
      value.generation,
      value.producerDriverRaw32,
      value.inputSourceClosureRaw32,
      value.commandRaw32,
      value.environmentRaw32,
      value.backend2EpochRaw32,
      String(value.jobs),
      value.stdoutRaw32,
      value.stderrRaw32,
      value.outputDriverRaw32,
    ],
  );
}

export function validateCurrentDriverGenerationReceipt(
  value: unknown,
  actual: CurrentGenerationExecution,
): string {
  assertExactCurrentObjectKeys(
    value,
    [
      "schema",
      "status",
      "generation",
      "producerDriverRaw32",
      "inputSourceClosureRaw32",
      "commandRaw32",
      "environmentRaw32",
      "backend2EpochRaw32",
      "jobs",
      "stdoutRaw32",
      "stderrRaw32",
      "outputDriverRaw32",
      "executionRaw32",
      "receiptRaw32",
    ],
    "current_release_generation_receipt",
  );
  const receipt = value as Record<string, unknown>;
  const executionRaw32 = currentGenerationExecutionRaw32(actual);
  for (const key of [
    "producerDriverRaw32",
    "inputSourceClosureRaw32",
    "commandRaw32",
    "environmentRaw32",
    "backend2EpochRaw32",
    "outputDriverRaw32",
  ] as const) {
    observedHash(receipt[key], `current_release_generation_${key}`);
  }
  for (const key of ["stdoutRaw32", "stderrRaw32"] as const) {
    if (typeof receipt[key] !== "string" || !HASH.test(receipt[key])) {
      throw new Error(`current_release_generation_${key}_invalid`);
    }
  }
  if (
    receipt.schema !== CHENG_CURRENT_DRIVER_GENERATION_RECEIPT_SCHEMA ||
    receipt.status !== "PASS" ||
    receipt.generation !== actual.generation ||
    receipt.producerDriverRaw32 !== actual.producerDriverRaw32 ||
    receipt.inputSourceClosureRaw32 !== actual.inputSourceClosureRaw32 ||
    receipt.commandRaw32 !== actual.commandRaw32 ||
    receipt.environmentRaw32 !== actual.environmentRaw32 ||
    receipt.backend2EpochRaw32 !== actual.backend2EpochRaw32 ||
    receipt.jobs !== actual.jobs ||
    receipt.stdoutRaw32 !== actual.stdoutRaw32 ||
    receipt.stderrRaw32 !== actual.stderrRaw32 ||
    receipt.outputDriverRaw32 !== actual.outputDriverRaw32 ||
    receipt.executionRaw32 !== executionRaw32
  ) {
    throw new Error("current_release_generation_execution_drift");
  }
  const receiptRaw32 = observedHash(
    receipt.receiptRaw32,
    "current_release_generation_receipt",
  );
  const payload = { ...receipt };
  delete payload.receiptRaw32;
  if (sha256(canonicalJson(payload)) !== receiptRaw32) {
    throw new Error("current_release_generation_receipt_self_hash_invalid");
  }
  return receiptRaw32;
}

export function parseCurrentCanonicalJson(raw: Buffer, label: string): unknown {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  if (!text.endsWith("\n")) throw new Error(`${label}_newline_invalid`);
  const value = parseUniqueCurrentJson(text, label);
  if (`${canonicalJson(value)}\n` !== text) {
    throw new Error(`${label}_canonical_json_invalid`);
  }
  return value;
}
