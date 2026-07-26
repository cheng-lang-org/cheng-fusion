// @ts-nocheck
import {
  accessSync,
  chmodSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
} from "node:fs";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";
import {basename, dirname, join, relative, resolve} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {
  createChengTextTool,
  initChengToolkitModule,
  jsonResult,
  resolveChengProjectRoot,
  zodSchema,
} from "./cheng_toolkit_m9000.ts";

const SEMANTIC_SNAPSHOT_AUDIT_SCHEMA = "cheng.semantic_snapshot.audit";
const SEMANTIC_SNAPSHOT_AUDIT_SCOPE = "atomic_publish";
const SEMANTIC_SNAPSHOT_AUDIT_PRODUCTION_CLOSURE_SCOPE = "production_closure";
const SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES = 1073741824;
const SEMANTIC_SNAPSHOT_AUDIT_DEFAULT_TIMEOUT_SECONDS = 300;
const SEMANTIC_SNAPSHOT_AUDIT_MAX_TIMEOUT_SECONDS = 1800;
const SEMANTIC_SNAPSHOT_AUDIT_MAX_WRAPPER_OUTPUT_BYTES = 1024 * 1024;
const SEMANTIC_SNAPSHOT_AUDIT_MAX_GATE_OUTPUT_BYTES = 16 * 1024 * 1024;
const SEMANTIC_SNAPSHOT_AUDIT_MAX_GUARD_REPORT_BYTES = 4 * 1024 * 1024;
const SEMANTIC_SNAPSHOT_AUDIT_FAILURE_DIAGNOSTIC_CHARS = 16 * 1024;
const SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH = "tools/lsp_multifile_exact_snapshot_acceptance_gate.sh";
const SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_MIN_TIMEOUT_SECONDS = 1230;
const SEMANTIC_SNAPSHOT_AUDIT_MONITOR_PYTHON = process.env.CHENG_FUSION_SEMANTIC_SNAPSHOT_MONITOR_PYTHON || "/opt/miniconda3/bin/python3.13";

const SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS = Object.freeze([
  {path: "cheng-package.toml", maxBytes: 64 * 1024, role: "project_manifest"},
  {path: "src/core/tooling/semantic_snapshot.cheng", maxBytes: 8 * 1024 * 1024, role: "core_source"},
  {path: "src/core/tooling/semantic_snapshot_production.cheng", maxBytes: 8 * 1024 * 1024, role: "production_source"},
  {path: "src/core/tooling/compiler_snapshot_builder.cheng", maxBytes: 16 * 1024 * 1024, role: "snapshot_builder_source"},
  {path: "src/core/tooling/compiler_csg.cheng", maxBytes: 32 * 1024 * 1024, role: "compiler_csg_source"},
  {path: "src/core/tooling/lsp_server.cheng", maxBytes: 16 * 1024 * 1024, role: "lsp_producer_source"},
  {path: "src/core/tooling/semantic_snapshot_query_projection.cheng", maxBytes: 16 * 1024 * 1024, role: "query_projection_source"},
  {path: "src/core/lang/typed_expr.cheng", maxBytes: 16 * 1024 * 1024, role: "typed_expr_source"},
  {path: "src/core/lang/parser.cheng", maxBytes: 16 * 1024 * 1024, role: "parser_declaration_source"},
  {path: "src/core/tooling/compiler_parser_receipt.cheng", maxBytes: 16 * 1024 * 1024, role: "parser_receipt_source"},
  {path: "src/core/csg_core/compiler_snapshot_schema.cheng", maxBytes: 16 * 1024 * 1024, role: "snapshot_schema_source"},
  {path: "src/core/csg_core/compiler_snapshot_cargo.cheng", maxBytes: 16 * 1024 * 1024, role: "snapshot_cargo_source"},
  {path: "src/core/csg_core/validator.cheng", maxBytes: 16 * 1024 * 1024, role: "snapshot_cargo_validator_source"},
  {path: "src/core/backend/compiler_facts.cheng", maxBytes: 16 * 1024 * 1024, role: "compiler_fact_source"},
  {path: "src/core/backend/primary_object_plan.cheng", maxBytes: 16 * 1024 * 1024, role: "primary_object_plan_source"},
  {path: "src/core/backend/direct_object_emit.cheng", maxBytes: 8 * 1024 * 1024, role: "direct_object_emit_source"},
  {path: "src/core/backend/macho_object_writer.cheng", maxBytes: 8 * 1024 * 1024, role: "macho_object_writer_source"},
  {path: "src/tests/semantic_snapshot_core_smoke.cheng", maxBytes: 8 * 1024 * 1024, role: "core_smoke_source"},
  {path: "src/tests/semantic_snapshot_production_binding_smoke.cheng", maxBytes: 8 * 1024 * 1024, role: "production_smoke_source"},
  {path: "src/tests/semantic_snapshot_rejection_smoke.cheng", maxBytes: 8 * 1024 * 1024, role: "rejection_smoke_source"},
  {path: "src/tests/lsp_multifile_exact_snapshot_acceptance_smoke.cheng", maxBytes: 8 * 1024 * 1024, role: "lsp_version_isolation_smoke_source"},
  {path: "tools/semantic_snapshot_core_gate.sh", maxBytes: 4 * 1024 * 1024, role: "core_gate_source"},
  {path: "tools/semantic_snapshot_production_binding_gate.sh", maxBytes: 4 * 1024 * 1024, role: "production_gate_source"},
  {path: "tools/semantic_snapshot_rejection_gate.sh", maxBytes: 4 * 1024 * 1024, role: "rejection_gate_source"},
  {path: SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH, maxBytes: 4 * 1024 * 1024, role: "published_candidate_gate_source"},
  {path: "tools/beat_c_process_group_guard.sh", maxBytes: 8 * 1024 * 1024, role: "process_tree_guard"},
  {path: "artifacts/bootstrap/cheng.stage3", maxBytes: 512 * 1024 * 1024, role: "compiler"},
  {path: "bootstrap/cheng_cold.c", maxBytes: 16 * 1024 * 1024, role: "cold_compiler_source"},
  {path: "bootstrap/cold_parser.h", maxBytes: 16 * 1024 * 1024, role: "cold_compiler_include"},
  {path: "bootstrap/macho_direct.h", maxBytes: 16 * 1024 * 1024, role: "cold_compiler_include"},
  {path: "bootstrap/elf64_direct.h", maxBytes: 16 * 1024 * 1024, role: "cold_compiler_include"},
  {path: "bootstrap/coff_direct.h", maxBytes: 16 * 1024 * 1024, role: "cold_compiler_include"},
  {path: "bootstrap/x64_emit.h", maxBytes: 16 * 1024 * 1024, role: "cold_compiler_include"},
  {path: "bootstrap/rv64_emit.h", maxBytes: 16 * 1024 * 1024, role: "cold_compiler_include"},
  {path: "bootstrap/cold_chengcsg_format.h", maxBytes: 16 * 1024 * 1024, role: "cold_compiler_include"},
  {path: "bootstrap/cold_parser.c", maxBytes: 16 * 1024 * 1024, role: "cold_compiler_include"},
  {path: "bootstrap/host_runtime.c", maxBytes: 16 * 1024 * 1024, role: "cold_compiler_include"},
  {path: "bootstrap/cold_types.h", maxBytes: 16 * 1024 * 1024, role: "cold_compiler_include"},
]);

const GATE_SPECS = Object.freeze([
  {
    name: "core",
    sourcePath: "tools/semantic_snapshot_core_gate.sh",
    statusKey: "semantic_snapshot_core_gate_status",
    expectedHashes: Object.freeze({
      compiler_sha256: "artifacts/bootstrap/cheng.stage3",
      module_sha256: "src/core/tooling/semantic_snapshot.cheng",
      smoke_sha256: "src/tests/semantic_snapshot_core_smoke.cheng",
    }),
    guardScope: "whole_gate_process_tree",
  },
  {
    name: "production",
    sourcePath: "tools/semantic_snapshot_production_binding_gate.sh",
    statusKey: "semantic_snapshot_production_binding_gate_status",
    expectedHashes: Object.freeze({
      compiler_source_sha256: "bootstrap/cheng_cold.c",
      module_sha256: "src/core/tooling/semantic_snapshot_production.cheng",
      core_module_sha256: "src/core/tooling/semantic_snapshot.cheng",
      schema_module_sha256: "src/core/csg_core/compiler_snapshot_schema.cheng",
      cargo_module_sha256: "src/core/csg_core/compiler_snapshot_cargo.cheng",
      smoke_sha256: "src/tests/semantic_snapshot_production_binding_smoke.cheng",
    }),
    guardScope: "each_external_process_tree",
    smokePath: "src/tests/semantic_snapshot_production_binding_smoke.cheng",
  },
  {
    name: "rejection",
    sourcePath: "tools/semantic_snapshot_rejection_gate.sh",
    statusKey: "semantic_snapshot_rejection_gate_status",
    expectedHashes: Object.freeze({
      compiler_source_sha256: "bootstrap/cheng_cold.c",
      module_sha256: "src/core/tooling/semantic_snapshot_production.cheng",
      cargo_module_sha256: "src/core/csg_core/compiler_snapshot_cargo.cheng",
      smoke_sha256: "src/tests/semantic_snapshot_rejection_smoke.cheng",
    }),
    guardScope: "each_external_process_tree",
    smokePath: "src/tests/semantic_snapshot_rejection_smoke.cheng",
  },
]);

let chengSemanticSnapshotAuditInputSchema;
let ChengSemanticSnapshotAuditTool;

function sha256(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function framePart(value) {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  if (raw.length > 0xffffffff) throw new Error("semantic snapshot audit CID part exceeds u32 framing");
  const size = Buffer.allocUnsafe(4);
  size.writeUInt32BE(raw.length, 0);
  return [size, raw];
}

function domainSeparatedCid(domain, parts) {
  const hash = createHash("sha256");
  for (const framed of [domain, ...parts].flatMap(framePart)) hash.update(framed);
  return hash.digest("hex");
}

function sameGeneration(left, right) {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

function generationFromStat(stat) {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mode: stat.mode,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  });
}

function requireCanonicalRoot(root) {
  const absolute = resolve(root);
  const before = lstatSync(absolute, {bigint: true});
  if (before.isSymbolicLink() || !before.isDirectory()) {
    throw new Error(`semantic snapshot audit root must be a real directory: ${absolute}`);
  }
  const canonical = realpathSync.native(absolute);
  if (canonical !== absolute) throw new Error(`semantic snapshot audit root must be canonical: ${absolute} -> ${canonical}`);
  return canonical;
}

function requireNoSymlinkComponents(root, relativePath) {
  if (!relativePath || relativePath.startsWith("/") || relativePath.split(/[\\/]+/).some((part) => !part || part === "." || part === "..")) {
    throw new Error(`semantic snapshot audit input path is not canonical: ${relativePath}`);
  }
  let current = root;
  const parts = relativePath.split(/[\\/]+/);
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]);
    const stat = lstatSync(current, {bigint: true});
    if (stat.isSymbolicLink()) throw new Error(`semantic snapshot audit input traverses a symlink: ${current}`);
    if (index + 1 < parts.length && !stat.isDirectory()) {
      throw new Error(`semantic snapshot audit input ancestor is not a directory: ${current}`);
    }
  }
  const canonical = realpathSync.native(current);
  if (relative(root, canonical).startsWith("..") || canonical === root) {
    throw new Error(`semantic snapshot audit input escapes its root: ${relativePath}`);
  }
  return current;
}

function readStableRegularFile(root, spec, options = {}) {
  if (!Number.isSafeInteger(spec.maxBytes) || spec.maxBytes <= 0) throw new Error(`invalid input bound for ${spec.path}`);
  const path = requireNoSymlinkComponents(root, spec.path);
  const pathBefore = lstatSync(path, {bigint: true});
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) throw new Error(`semantic snapshot audit input is not a regular file: ${path}`);
  if (pathBefore.size <= 0n && !options.allowEmpty) throw new Error(`semantic snapshot audit input is empty: ${path}`);
  if (pathBefore.size > BigInt(spec.maxBytes)) throw new Error(`semantic snapshot audit input exceeds ${spec.maxBytes} bytes: ${path}`);
  if (!Number.isInteger(fsConstants.O_NOFOLLOW) || fsConstants.O_NOFOLLOW === 0) {
    throw new Error("semantic snapshot audit requires O_NOFOLLOW");
  }
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const descriptorBefore = fstatSync(fd, {bigint: true});
    if (!descriptorBefore.isFile() || !sameGeneration(pathBefore, descriptorBefore)) {
      throw new Error(`semantic snapshot audit input changed while opening: ${spec.path}`);
    }
    const expectedSize = Number(descriptorBefore.size);
    const raw = Buffer.allocUnsafe(expectedSize);
    let offset = 0;
    while (offset < expectedSize) {
      const bytesRead = readSync(fd, raw, offset, Math.min(1024 * 1024, expectedSize - offset), offset);
      if (bytesRead <= 0) throw new Error(`semantic snapshot audit input truncated while reading: ${spec.path}`);
      offset += bytesRead;
    }
    const descriptorAfter = fstatSync(fd, {bigint: true});
    const pathAfter = lstatSync(path, {bigint: true});
    if (pathAfter.isSymbolicLink() || !pathAfter.isFile() ||
        !sameGeneration(descriptorBefore, descriptorAfter) ||
        !sameGeneration(descriptorAfter, pathAfter)) {
      throw new Error(`semantic snapshot audit input changed generation while reading: ${spec.path}`);
    }
    return Object.freeze({
      path: spec.path,
      role: spec.role,
      bytes: expectedSize,
      sha256: sha256(raw),
      generation: generationFromStat(pathAfter),
      raw,
    });
  } finally {
    closeSync(fd);
  }
}

function captureSemanticSnapshotAuditInputs(root) {
  const canonicalRoot = requireCanonicalRoot(root);
  const entries = SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS.map((spec) => readStableRegularFile(canonicalRoot, spec));
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  if (byPath.size !== entries.length) throw new Error("semantic snapshot audit input specification contains duplicate paths");
  return Object.freeze({root: canonicalRoot, entries: Object.freeze(entries), byPath});
}

function verifySemanticSnapshotAuditInputs(root, baseline, phase = "execution") {
  const current = captureSemanticSnapshotAuditInputs(root);
  if (current.entries.length !== baseline.entries.length) throw new Error(`semantic snapshot audit input set drift during ${phase}`);
  for (let index = 0; index < baseline.entries.length; index++) {
    const before = baseline.entries[index];
    const after = current.entries[index];
    if (before.path !== after.path || before.role !== after.role || before.sha256 !== after.sha256 ||
        before.bytes !== after.bytes || !sameGeneration(before.generation, after.generation)) {
      throw new Error(`semantic snapshot audit input drift during ${phase}: ${before.path}`);
    }
  }
  return current;
}

function decodeUtf8(raw, label) {
  try {
    return new TextDecoder("utf-8", {fatal: true}).decode(raw);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function maskChengCommentsAndStrings(source) {
  let out = "";
  let index = 0;
  let state = "code";
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1] || "";
    const third = source[index + 2] || "";
    if (state === "code") {
      if (char === '"' && next === '"' && third === '"') {
        out += "   "; index += 3; state = "triple"; continue;
      }
      if (char === '"') { out += " "; index++; state = "string"; continue; }
      if (char === "'") { out += " "; index++; state = "char"; continue; }
      if (char === "#") { out += " "; index++; state = "line"; continue; }
      if (char === "/" && next === "/") { out += "  "; index += 2; state = "line"; continue; }
      if (char === "/" && next === "*") { out += "  "; index += 2; state = "block"; continue; }
      out += char; index++; continue;
    }
    if (state === "line") {
      if (char === "\n") { out += "\n"; state = "code"; }
      else out += " ";
      index++; continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") { out += "  "; index += 2; state = "code"; continue; }
      out += char === "\n" ? "\n" : " "; index++; continue;
    }
    if (state === "triple") {
      if (char === '"' && next === '"' && third === '"') { out += "   "; index += 3; state = "code"; continue; }
      out += char === "\n" ? "\n" : " "; index++; continue;
    }
    if (char === "\\") {
      out += " ";
      index++;
      if (index < source.length) { out += source[index] === "\n" ? "\n" : " "; index++; }
      continue;
    }
    if ((state === "string" && char === '"') || (state === "char" && char === "'")) state = "code";
    out += char === "\n" ? "\n" : " ";
    index++;
  }
  if (state === "block" || state === "triple" || state === "string" || state === "char") {
    throw new Error(`semantic snapshot source has an unterminated ${state}`);
  }
  return out;
}

function extractTopLevelFunction(source, functionName) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startMatch = new RegExp(`^fn[ \\t]+${escaped}\\(`, "m").exec(source);
  if (!startMatch) throw new Error(`semantic snapshot audit function missing: ${functionName}`);
  const searchFrom = startMatch.index + startMatch[0].length;
  const nextMatch = /^fn[ \t]+[A-Za-z_][A-Za-z0-9_]*\(/m.exec(source.slice(searchFrom));
  const end = nextMatch ? searchFrom + nextMatch.index : source.length;
  return source.slice(startMatch.index, end);
}

function assertNoCommitHazards(functionName, body) {
  const masked = maskChengCommentsAndStrings(body);
  const forbiddenCalls = [
    "add", "reserve", "setLen", "ByteBufInit", "ByteBufFree", "BytesClone", "BytesFree",
    "ReadFile", "WriteFile", "OpenFile", "CloseFile", "StrictValidateInto",
    "semanticSnapshotProductionReleasePayloadForSnapshot",
    "semanticSnapshotProductionStoreMappingsStrictValidNoAlloc",
  ];
  for (const call of forbiddenCalls) {
    if (new RegExp(`\\b${call}\\s*\\(`).test(masked)) throw new Error(`${functionName} contains forbidden call ${call}`);
  }
  if (/\b[A-Za-z_][A-Za-z0-9_]*(?:Clone|Hash|Sha256|CargoBuild|CargoVerify|CargoRelease|FactsFrom|QueryProjectionBuild)[A-Za-z0-9_]*\s*\(/.test(masked)) {
    throw new Error(`${functionName} contains allocation, clone, hash, cargo, or fact projection work`);
  }
  if (/^[ \t]*(?:for|while)\b/m.test(masked)) throw new Error(`${functionName} contains a loop`);
  if (/\breturn[ \t]+false\b/.test(masked)) throw new Error(`${functionName} contains return false`);
  if (/\berr[ \t]*=/.test(masked)) throw new Error(`${functionName} contains recoverable error assignment`);
}

function auditSemanticSnapshotStructure(coreSource, productionSource) {
  const maskedCore = maskChengCommentsAndStrings(coreSource);
  const maskedProduction = maskChengCommentsAndStrings(productionSource);
  for (const removed of ["SemanticSnapshotStorePublishCandidateInto", "SemanticSnapshotStoreRejectCandidateInto"]) {
    if (new RegExp(`\\b${removed}\\b`).test(maskedCore) || new RegExp(`\\b${removed}\\b`).test(maskedProduction)) {
      throw new Error(`removed fallible semantic snapshot API survived: ${removed}`);
    }
  }
  const coreCommitNames = ["SemanticSnapshotStoreCommitCandidateInto", "SemanticSnapshotStoreCommitRejectedCandidateInto"];
  for (const name of coreCommitNames) assertNoCommitHazards(name, extractTopLevelFunction(coreSource, name));
  const productionCommitName = "SemanticSnapshotProductionCommitCandidateInto";
  assertNoCommitHazards(productionCommitName, extractTopLevelFunction(productionSource, productionCommitName));

  const reclaimName = "SemanticSnapshotProductionStoreReclaimSnapshotInto";
  const reclaim = maskChengCommentsAndStrings(extractTopLevelFunction(productionSource, reclaimName));
  if (/^[ \t]*(?:for|while)\b/m.test(reclaim) || /\bsemanticSnapshotProductionStoreMappingsStrictValidNoAlloc\s*\(/.test(reclaim)) {
    throw new Error(`${reclaimName} performs a historical mapping scan`);
  }
  if (!/\bsemanticSnapshotProductionReleasePayloadForSnapshot\s*\(\s*store\s*,\s*snapshotIndex\s*\)/.test(reclaim)) {
    throw new Error(`${reclaimName} does not reclaim the exact snapshot index`);
  }

  const rejectionName = "semanticSnapshotProductionRejectFailureCargoInto";
  const rejection = maskChengCommentsAndStrings(extractTopLevelFunction(productionSource, rejectionName));
  const terminalCall = "SemanticSnapshotStoreCommitRejectedCandidateInto";
  const callPattern = new RegExp(`\\b${terminalCall}\\s*\\(`, "g");
  const matches = [...rejection.matchAll(callPattern)];
  if (matches.length !== 1) throw new Error(`${rejectionName} must contain exactly one terminal rejection commit`);
  const terminalTail = rejection.slice(matches[0].index + matches[0][0].length);
  const tailCalls = [...terminalTail.matchAll(/\b([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)].map((match) => match[1]);
  for (const call of tailCalls) {
    if (call !== "panic") throw new Error(`${rejectionName} has a fallible call after terminal rejection commit: ${call}`);
  }
  if (/\breturn[ \t]+false\b/.test(terminalTail) || /^[ \t]*(?:for|while)\b/m.test(terminalTail)) {
    throw new Error(`${rejectionName} has a fallible tail after terminal rejection commit`);
  }
  if (!/\breturn[ \t]+true\b/.test(terminalTail)) throw new Error(`${rejectionName} does not synchronously finish after terminal rejection commit`);

  const checks = Object.freeze([
    "removed_fallible_apis_absent",
    "core_commits_scalar_only",
    "production_commit_scalar_only",
    "exact_reclaim_constant_time",
    "rejection_terminal_has_no_fallible_tail",
  ]);
  return Object.freeze({
    status: "pass",
    checks,
    receiptCid: domainSeparatedCid("cheng.semantic_snapshot.structure_audit", [coreSource, productionSource, ...checks]),
  });
}

function extractTopLevelFunctionOrEmpty(source, functionName) {
  try {
    return extractTopLevelFunction(source, functionName);
  } catch (error) {
    if (error instanceof Error && error.message.includes("audit function missing")) return "";
    throw error;
  }
}

function squashMaskedCheng(source) {
  return maskChengCommentsAndStrings(source).replace(/\s+/g, "");
}

function hasOrderedFragments(source, fragments) {
  let cursor = 0;
  for (const fragment of fragments) {
    const expected = fragment.replace(/\s+/g, "");
    const found = source.indexOf(expected, cursor);
    if (found < 0) return false;
    cursor = found + expected.length;
  }
  return true;
}

function auditSemanticSnapshotProductionClosure(sources, publishedCandidateReceipt = null) {
  const {
    builderSource,
    lspSource,
    schemaSource,
    cargoSource,
    cargoValidatorSource,
    compilerFactsSource,
    typedExprSource,
    compilerCsgSource,
    lspVersionIsolationSmokeSource,
    primaryObjectPlanSource,
    directObjectEmitSource,
    machoObjectWriterSource,
  } = sources;
  const builder = maskChengCommentsAndStrings(builderSource);
  const lsp = maskChengCommentsAndStrings(lspSource);
  maskChengCommentsAndStrings(schemaSource);
  maskChengCommentsAndStrings(cargoSource);
  maskChengCommentsAndStrings(cargoValidatorSource);
  maskChengCommentsAndStrings(compilerFactsSource);
  maskChengCommentsAndStrings(typedExprSource);
  maskChengCommentsAndStrings(compilerCsgSource);
  maskChengCommentsAndStrings(lspVersionIsolationSmokeSource);
  maskChengCommentsAndStrings(primaryObjectPlanSource);
  maskChengCommentsAndStrings(directObjectEmitSource);
  maskChengCommentsAndStrings(machoObjectWriterSource);
  const functionOnlyCardinality = /\bsymbolCount\s*!=\s*functionCount\b/.test(builder);
  const hasFunctionSubsetGuards =
    /\bsymbols\.symbolKinds\s*\[\s*symbolId\s*\]\s*!=\s*schema\.CsgCompilerSymbolFunction\b/.test(builder);
  const forcedMissingFacts = [
    ["missingSourceInterfaceCount", "sourceCount"],
    ["missingSymbolInterfaceCount", "symbolCount"],
    ["missingFunctionInterfaceCount", "reachableFunctionCount"],
    ["missingTypedNodeProofCount", "typedNodeCount"],
    ["missingReferenceProofCount", "resolvedCallCount"],
    ["missingLexicalScopeProofCount", "sourceCount"],
    ["missingDependencyProofCount", "dependencyCount"],
    ["missingDiagnosticProofCount", "sourceCount"],
  ].every(([target, source]) => new RegExp(`\\bout\\.${target}\\s*=\\s*out\\.${source}\\b`).test(builder));
  const admissionRequiresBlocked = /!receipt\.admissionBlocked\s*\|\|\s*receipt\.missingFactBitmap\s*==\s*0/.test(builder);
  const lspStagesCandidate = /\bsnapshot_production\.SemanticSnapshotProductionStageCandidateInto\s*\(/.test(lsp);
  const lspCommitsCandidate = /\bsnapshot_production\.SemanticSnapshotProductionCommitCandidateInto\s*\(/.test(lsp);
  const lspRejectsFailure = /\bsnapshot_production\.SemanticSnapshotProductionRejectFailureInto\s*\(/.test(lsp);
  const candidateAdmissionRoute = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    lspSource, "lspWorkspaceTryProduceCurrentCompilerSnapshotInto"));
  const candidatePublicationRequiresZeroMissingFacts =
    hasOrderedFragments(candidateAdmissionRoute, [
      "workspace.candidateAdmissionReceiptCid=admission.receiptCid",
      "workspace.candidateAdmissionCompletedStageBitmap=admission.completedStageBitmap",
      "workspace.candidateAdmissionMissingFactBitmap=admission.missingFactBitmap",
      "if!admission.admissionBlocked&&admission.missingFactBitmap==0:",
      "lspWorkspaceMakeStageValidateCommitCandidateInto(",
      "if!admission.admissionBlocked||admission.missingFactBitmap==0:",
      "panic(",
      "SemanticSnapshotProductionRejectFailureInto(",
    ]);
  const publishedCandidateFixture = squashMaskedCheng(lspVersionIsolationSmokeSource);
  const publishedCandidateFixtureMultifileExact =
    hasOrderedFragments(publishedCandidateFixture, [
      "leturiMain=",
      "leturiHelper=",
      "LspWorkspaceBindDocumentCompilerIdentityInto(workspace,uriHelper,",
      "LspWorkspaceBindDocumentCompilerIdentityInto(workspace,uriMain,",
      "LspWorkspaceDidOpenInto(workspace,uriHelper,",
      "LspWorkspaceDidOpenInto(workspace,uriMain,",
      "workspace.metrics.explicitSourceFileReadCount==int64(2)",
      "CurrentVersionPublished(workspace,sourceVersion)",
      "afterReopen.receipt.sourceVersion==int64(7)",
      "LspWorkspaceReleaseInto(workspace,err)",
    ]);
  const declarationColumns = [
    "declarationProducerSourceIds",
    "declarationSourceLocalRows",
    "declarationKinds",
    "declarationNameTokenIds",
    "declarationOwnerIds",
    "declarationLexicalScopeIds",
    "declarationFunctionRows",
    "declarationTypeSyntaxRootIds",
    "declarationSpanIds",
    "declarationNameSpanIds",
    "declarationMutableFlags",
    "declarationExportedFlags",
    "declarationLexicalScopeProducerSourceIds",
    "declarationLexicalScopeSourceLocalRows",
    "declarationLexicalScopeKinds",
    "declarationLexicalScopeParentIds",
    "declarationLexicalScopeOwnerDeclarationIds",
  ];
  const builderConsumesDeclarationStream = declarationColumns.every((column) =>
    new RegExp(`\\b${column}\\b`).test(builder));
  const patternColumns = [
    "patternProducerSourceIds",
    "patternSourceLocalRows",
    "patternKinds",
    "patternNameTokenIds",
    "patternOwnerLexicalScopeIds",
    "patternBindingDeclarationIds",
    "patternSpanIds",
    "patternChildStarts",
    "patternChildCounts",
    "patternChildIds",
  ];
  const builderConsumesPatternStream = patternColumns.every((column) =>
    new RegExp(`\\b${column}\\b`).test(builder));

  const symbolProjection = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    builderSource, "compilerSnapshotBuilderProjectSymbolFunctionReadTablesInto"));
  const moduleSymbolProjection = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    builderSource, "compilerSnapshotBuilderAppendModuleSymbolsInto"));
  const builderProjectsModuleSymbols =
    hasOrderedFragments(symbolProjection, [
      "compilerSnapshotBuilderAppendModuleSymbolsInto(tables,csg,err)",
      "compilerSnapshotBuilderProjectionSymbolsCanonicalizeInto(tables,err)",
      "compilerSnapshotBuilderModuleFunctionOwnersValidateInto(tables,err)",
    ]) &&
    hasOrderedFragments(moduleSymbolProjection, [
      "compilerSnapshotBuilderModuleDeclKeysInto(",
      "let sourceCount=tables.sources.documentCids.len",
      "setLen(moduleSymbolBySource,sourceCount)",
      "tables.parserSidecars.declarationKinds[declarationRow]",
      "tables.parserSidecars.declarationProducerSourceIds[declarationRow]",
      "add(tables.symbols.symbolKinds,schema.CsgCompilerSymbolModule)",
      "CsgCompilerSymbolSourceCoordinateAuthorityStrictValidateInto(",
      "CsgCompilerSymbolInterfaceCidInto(",
      "tables.symbols.ownerSymbolIds[symbolId]=moduleSymbolBySource[sourceId]",
    ]);
  const functionOnlyKind =
    hasFunctionSubsetGuards && !builderProjectsModuleSymbols;

  const moduleCoordinateRows = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    schemaSource, "CsgCompilerModuleParserDeclarationRowsBySourceInto"));
  const moduleCoordinateAuthority = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    schemaSource, "CsgCompilerSymbolSourceCoordinateAuthorityWithModuleRowsStrictValidateInto"));
  const moduleCoordinatePublic = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    schemaSource, "CsgCompilerSymbolSourceCoordinateAuthorityStrictValidateInto"));
  const moduleSymbolCoordinateContractExact =
    hasOrderedFragments(moduleCoordinateRows, [
      "let sourceCount = snapshot.sources.documentCids.len",
      "let declarationCount = snapshot.parserSidecars.declarationKinds.len",
      "declarationCount != snapshot.parserSidecars.declarationProducerSourceIds.len",
      "setLen(rows, sourceCount)",
      "snapshot.parserSidecars.declarationKinds[declarationRow] != 1",
      "if rows[sourceId] >= 0:",
      "rows[sourceId] = declarationRow",
    ]) &&
    hasOrderedFragments(moduleCoordinateAuthority, [
      "if kind != CsgCompilerSymbolModule:",
      "let modulePathText = snapshot.sources.modulePathTextIds[source]",
      "qualifiedName != modulePathText",
      "let moduleDeclaration = moduleDeclarationRows[source]",
      "snapshot.parserSidecars.declarationKinds[moduleDeclaration] != 1",
      "snapshot.parserSidecars.declarationProducerSourceIds[moduleDeclaration] != source",
      "if moduleDeclaration < 0:",
      "nameText != modulePathText || nameSpan != -1 || nameToken != -1 || declarationSpan != -1",
      "nameToken != snapshot.parserSidecars.declarationNameTokenIds[moduleDeclaration]",
      "nameSpan != snapshot.parserSidecars.declarationNameSpanIds[moduleDeclaration]",
      "declarationSpan != snapshot.parserSidecars.declarationSpanIds[moduleDeclaration]",
      "snapshot.tokens.sourceIds[nameToken] != source",
      "snapshot.tokens.spanIds[nameToken] != nameSpan",
      "snapshot.tokens.valueTextIds[nameToken] != nameText",
    ]) &&
    hasOrderedFragments(moduleCoordinatePublic, [
      "CsgCompilerModuleParserDeclarationRowsBySourceInto(",
      "CsgCompilerSymbolSourceCoordinateAuthorityWithModuleRowsStrictValidateInto(",
    ]);

  const referenceTableStart = schemaSource.indexOf("CsgCompilerReferenceTable =");
  const referenceTableEnd = schemaSource.indexOf("CsgCompilerCallTable =", referenceTableStart);
  const referenceTable = referenceTableStart >= 0 && referenceTableEnd > referenceTableStart
    ? squashMaskedCheng(schemaSource.slice(referenceTableStart, referenceTableEnd))
    : "";
  const referenceOwnerSymbolColumnExact =
    (referenceTable.match(/ownerSymbolIds:int32\[\]/g) || []).length === 1 &&
    hasOrderedFragments(referenceTable, [
      "sourceIds: int32[]",
      "spanIds: int32[]",
      "ownerFunctionIds: int32[]",
      "ownerSymbolIds: int32[]",
      "targetSymbolIds: int32[]",
      "referenceKinds: int32[]",
    ]);
  const referenceValidation = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    schemaSource, "csgCompilerReferencesAndCallsValidateInto"));
  const referenceOwnerSourceFunctionTargetKindExact = hasOrderedFragments(
    referenceValidation, [
      "referenceCount != snapshot.references.ownerFunctionIds.len",
      "referenceCount != snapshot.references.ownerSymbolIds.len",
      "let ownerFunction = snapshot.references.ownerFunctionIds[row]",
      "let ownerSymbol = snapshot.references.ownerSymbolIds[row]",
      "!csgCompilerOptionalIndexValid(ownerFunction, snapshot.functions.symbolIds.len)",
      "!csgCompilerIndexValid(ownerSymbol, snapshot.symbols.symbolCids.len)",
      "snapshot.symbols.sourceIds[ownerSymbol] != source",
      "snapshot.symbols.symbolKinds[ownerSymbol] != CsgCompilerSymbolModule",
      "snapshot.symbols.symbolKinds[ownerSymbol] != CsgCompilerSymbolType",
      "snapshot.symbols.symbolKinds[ownerSymbol] != CsgCompilerSymbolFunction",
      "snapshot.symbols.functionIds[ownerSymbol] != ownerFunction",
      "!csgCompilerIndexValid(target, snapshot.symbols.symbolCids.len)",
      "referenceKind == CsgCompilerReferenceCall",
      "snapshot.symbols.symbolKinds[target] != CsgCompilerSymbolFunction",
      "referenceKind == CsgCompilerReferenceType",
      "snapshot.symbols.symbolKinds[target] != CsgCompilerSymbolType",
      "referenceKind == CsgCompilerReferenceImport",
      "snapshot.symbols.symbolKinds[target] != CsgCompilerSymbolModule",
      "snapshot.references.ownerFunctionIds[reference] != caller",
      "snapshot.references.ownerSymbolIds[reference] != snapshot.functions.symbolIds[caller]",
      "snapshot.references.targetSymbolIds[reference] != callee",
    ]);
  const builderReferenceEmptyContract = squashMaskedCheng(
    extractTopLevelFunctionOrEmpty(
      builderSource, "compilerSnapshotBuilderSemanticTablesEmpty"));
  const builderReferenceRemap = squashMaskedCheng(
    extractTopLevelFunctionOrEmpty(
      builderSource, "compilerSnapshotBuilderDeclarationAuthorityCommitInto"));
  const referenceBuilderOwnerRemapExact =
    hasOrderedFragments(builderReferenceEmptyContract, [
      "tables.references.sourceIds.len == 0",
      "tables.references.spanIds.len == 0",
      "tables.references.ownerFunctionIds.len == 0",
      "tables.references.ownerSymbolIds.len == 0",
      "tables.references.targetSymbolIds.len == 0",
      "tables.references.referenceKinds.len == 0",
    ]) &&
    hasOrderedFragments(builderReferenceRemap, [
      "tables.references.targetSymbolIds.len != tables.references.ownerSymbolIds.len",
      "tables.references.targetSymbolIds[row] < 0",
      "tables.references.ownerSymbolIds[row] < 0",
      "tables.references.targetSymbolIds[row] = newByOld[tables.references.targetSymbolIds[row]]",
      "tables.references.ownerSymbolIds[row] = newByOld[tables.references.ownerSymbolIds[row]]",
    ]);
  const cargoReferences = extractTopLevelFunctionOrEmpty(
    cargoSource, "csgCompilerCargoReferencesLine").replace(/\s+/g, "");
  const cargoDecode = extractTopLevelFunctionOrEmpty(
    cargoValidatorSource, "csgCompilerWireDecodeInto").replace(/\s+/g, "");
  const referenceCargoBindingExact =
    hasOrderedFragments(cargoReferences, [
      "csg_dialect::cheng_compiler::references",
      "snapshot.references.ownerFunctionIds",
      "snapshot.references.ownerSymbolIds",
      "snapshot.references.referenceKinds",
      "snapshot.references.sourceIds",
      "snapshot.references.spanIds",
      "snapshot.references.targetSymbolIds",
    ]) &&
    cargoReferences.includes('\\"ownerSymbolIds\\"') &&
    hasOrderedFragments(cargoDecode, [
      'lines[16], "sourceIds", facts.referenceSourceIds',
      'lines[16], "spanIds", facts.referenceSpanIds',
      'lines[16], "ownerFunctionIds", facts.referenceOwnerFunctionIds',
      'lines[16], "ownerSymbolIds", facts.referenceOwnerSymbolIds',
      'lines[16], "targetSymbolIds", facts.referenceTargetSymbolIds',
      'lines[16], "referenceKinds", facts.referenceKinds',
    ]);
  const compilerReferenceFact = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    compilerFactsSource, "CompilerFactSnapshotFillReference"));
  const compilerReferenceIdentityEnd = compilerReferenceFact.indexOf(
    "lettargetNameTextId=");
  const compilerReferenceIdentityPrefix = compilerReferenceIdentityEnd >= 0
    ? compilerReferenceFact.slice(0, compilerReferenceIdentityEnd)
    : compilerReferenceFact;
  const compilerReferenceDisplayProjection =
    "lettargetNameTextId=snapshot.symbols.nameTextIds[target]" +
    "reference.targetName=snapshot.texts[targetNameTextId]";
  const compilerReferenceIdentityWithoutDisplay =
    compilerReferenceFact.replace(compilerReferenceDisplayProjection, "");
  const compilerReferenceFactProjectionExact =
    compilerReferenceFact.includes(compilerReferenceDisplayProjection) &&
    compilerReferenceIdentityWithoutDisplay !== compilerReferenceFact &&
    [
      "sourceId", "spanId", "ownerFunctionId", "ownerSymbolId",
      "targetSymbolId", "referenceKind", "ownerSymbolCid", "targetSymbolCid",
    ].every((field) =>
      (compilerReferenceFact.match(new RegExp(`reference\\.${field}=`, "g")) || []).length === 1) &&
    hasOrderedFragments(
    compilerReferenceIdentityPrefix, [
      "let sourceId = snapshot.references.sourceIds[row]",
      "let spanId = snapshot.references.spanIds[row]",
      "let target = snapshot.references.targetSymbolIds[row]",
      "let ownerFunctionId = snapshot.references.ownerFunctionIds[row]",
      "let ownerSymbolId = snapshot.references.ownerSymbolIds[row]",
      "reference.ownerFunctionId = ownerFunctionId",
      "reference.ownerSymbolId = ownerSymbolId",
      "reference.ownerDeclId = snapshot.symbols.declIds[ownerSymbolId]",
      "reference.targetSymbolId = target",
      "reference.targetDeclId = snapshot.symbols.declIds[target]",
      "reference.referenceKind = snapshot.references.referenceKinds[row]",
      "reference.documentCid = snapshot.sources.documentCids[sourceId]",
      "reference.ownerSymbolCid = snapshot.symbols.symbolCids[ownerSymbolId]",
      "reference.targetSymbolCid = snapshot.symbols.symbolCids[target]",
      "reference.ownerDeclKeyCid = snapshot.symbols.declKeyCids[ownerSymbolId]",
      "reference.targetDeclKeyCid = snapshot.symbols.declKeyCids[target]",
      "reference.declarationTableCid = snapshot.declarations.tableCid",
    ]);
  const lspReferenceIdentity = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    lspSource, "lspPinnedReferenceIdentityInto"));
  const lspReferenceIdentityExact = hasOrderedFragments(lspReferenceIdentity, [
    "tables.references.targetSymbolIds.len",
    "tables.references.ownerSymbolIds.len",
    "facts.CompilerFactSnapshotFillReference(",
    "targetSymbolIdOut = compilerFact.referenceFact.targetSymbolId",
    "ownerSymbolIdOut = compilerFact.referenceFact.ownerSymbolId",
    "sourceIdOut = compilerFact.referenceFact.sourceId",
    "spanIdOut = compilerFact.referenceFact.spanId",
    "referenceKindOut = compilerFact.referenceFact.referenceKind",
    "targetSymbolIdOut != tables.references.targetSymbolIds[referenceId]",
    "ownerSymbolIdOut != tables.references.ownerSymbolIds[referenceId]",
    "sourceIdOut != tables.references.sourceIds[referenceId]",
    "spanIdOut != tables.references.spanIds[referenceId]",
    "referenceKindOut != tables.references.referenceKinds[referenceId]",
    "tables.symbols.sourceIds[ownerSymbolIdOut] != sourceIdOut",
    "compilerFact.referenceFact.ownerSymbolCid",
    "tables.symbols.symbolCids[ownerSymbolIdOut]",
  ]);
  const approximateReferenceIdentityPattern =
    /(?:arity|calleeText|targetName|nameTextIds|qualifiedNameTextIds|functionNames)/;
  const referenceIdentityNoTextOrNameArity =
    !approximateReferenceIdentityPattern.test(referenceValidation) &&
    !approximateReferenceIdentityPattern.test(cargoReferences) &&
    !approximateReferenceIdentityPattern.test(
      compilerReferenceIdentityWithoutDisplay) &&
    !approximateReferenceIdentityPattern.test(lspReferenceIdentity);
  const referenceOwnerIdentityContractExact =
    referenceOwnerSymbolColumnExact &&
    referenceOwnerSourceFunctionTargetKindExact &&
    referenceBuilderOwnerRemapExact &&
    referenceCargoBindingExact &&
    compilerReferenceFactProjectionExact &&
    lspReferenceIdentityExact &&
    referenceIdentityNoTextOrNameArity;

  const addCallDeclaration = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    typedExprSource, "typedExprBuildIndexAddCallDeclarationWithProducer"));
  const sealCallDeclarations = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    typedExprSource, "TypedExprBuildIndexSealCallDeclarations"));
  const typedCallDeclarationProducerCoordinatesExact =
    hasOrderedFragments(addCallDeclaration, [
      "producerSourceIndex < -1 || producerFunctionRow < -1",
      "producerSourceIndex < 0 && producerFunctionRow >= 0",
      "declarationKind == TypedExprCallDeclarationFunction && producerSourceIndex >= 0 && producerFunctionRow < 0",
      "declarationKind == TypedExprCallDeclarationImportc && producerFunctionRow != -1",
      "add(index.callDeclarationProducerSourceIndexes, producerSourceIndex)",
      "add(index.callDeclarationProducerFunctionRows, producerFunctionRow)",
    ]) &&
    hasOrderedFragments(sealCallDeclarations, [
      "rowCount != index.callDeclarationProducerSourceIndexes.len",
      "rowCount != index.callDeclarationProducerFunctionRows.len",
      "let producerSourceIndex = index.callDeclarationProducerSourceIndexes[rowIndex]",
      "let producerFunctionRow = index.callDeclarationProducerFunctionRows[rowIndex]",
      "producerSourceIndex < -1 || producerFunctionRow < -1",
      "index.callDeclarationSealed = true",
    ]);

  const reachableCallProjection = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    compilerCsgSource, "CompilerCsgReachableTargetFromCallDeclaration"));
  const compilerCsgExactCallProjection = hasOrderedFragments(reachableCallProjection, [
    "let buildIndex = texpr.TypedExprIrCallDeclarationBuildIndex(typedIr)",
    "declarationCount != buildIndex.callDeclarationProducerSourceIndexes.len",
    "declarationCount != buildIndex.callDeclarationProducerFunctionRows.len",
    "let declarationContext = buildIndex.callDeclarationProducerSourceIndexes[declarationRow]",
    "let localFunctionRow = buildIndex.callDeclarationProducerFunctionRows[declarationRow]",
    "receipt.sourceSidecars[declarationContext].sourceIndex != declarationContext",
    "if declarationKind == texpr.TypedExprCallDeclarationImportc:",
    "if declarationKind != texpr.TypedExprCallDeclarationFunction:",
    "let resolvedFunctionIndex = sidecar.functionIndexes[localFunctionRow]",
    "set.producerSourceIndexes[resolvedFunctionIndex] != declarationContext",
    "set.producerDeclarationIndexes[resolvedFunctionIndex] != sidecar.functionDeclarationOrdinals[localFunctionRow]",
    "CompilerCsgSourcePathsEquivalent(",
    "set.functionNames[resolvedFunctionIndex] != nodeTarget",
    "set.startLines[resolvedFunctionIndex] != nodeTargetSignatureLineNumber",
  ]);
  const exactCallProjection =
    typedCallDeclarationProducerCoordinatesExact &&
    compilerCsgExactCallProjection;

  const lspPinCurrent = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    lspSource, "lspWorkspacePinCompilerFactsInto"));
  const lspCurrentVersionPinExact = hasOrderedFragments(lspPinCurrent, [
    "let acceptedVersion = workspace.eventState.lastAcceptedSourceVersion",
    "workspace.snapshotStore.core.currentSourceVersion != acceptedVersion",
    "let publishedIndex = workspace.snapshotStore.core.publishedIndex",
    "workspace.snapshotStore.core.sourceVersions[publishedIndex] != acceptedVersion",
    "workspace.snapshotStore.core.states[publishedIndex] != snapshot_core.SemanticSnapshotStatePublished",
    "snapshot_production.SemanticSnapshotProductionStorePinCurrentInto(",
    "pin.corePin.sourceVersion != acceptedVersion",
  ]);
  const fiveRequestsRaw = extractTopLevelFunctionOrEmpty(
    lspVersionIsolationSmokeSource, "FiveSemanticRequestsContentModified");
  const fiveRequests = squashMaskedCheng(fiveRequestsRaw);
  const fiveQueryRejectionExact = [
    "LspWorkspaceExactDefinitionInto",
    "LspWorkspaceExactReferencesInto",
    "LspWorkspaceExactRenameInto",
    "LspWorkspaceExactHoverInto",
    "LspWorkspaceExactCompletionInto",
  ].every((call) => fiveRequests.includes(`lsp.${call}(`)) &&
    (fiveRequestsRaw.match(/"content modified"/g) || []).length === 5 &&
    (fiveRequests.match(/ReceiptEmpty\(/g) || []).length === 5;
  const sixRequestsRaw = extractTopLevelFunctionOrEmpty(
    lspVersionIsolationSmokeSource, "SixSemanticRequestsContentModified");
  const sixRequests = squashMaskedCheng(sixRequestsRaw);
  const sixQueryRejectionExact =
    hasOrderedFragments(sixRequests, [
      "FiveSemanticRequestsContentModified(",
      "lsp.LspWorkspaceExactDiagnosticsInto(",
      "diagnostics.items.len == 0",
      "ReceiptEmpty(diagnostics.receipt)",
    ]) &&
    (sixRequestsRaw.match(/"content modified"/g) || []).length === 1;
  const versionIsolation = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    lspVersionIsolationSmokeSource, "RunVersionIsolationInto"));
  const uncompletedVersionDrivenExact =
    hasOrderedFragments(versionIsolation, [
      "snapshot_production.SemanticSnapshotProductionAcceptSourceEventInto(",
      "sourceVersion != int64(9)",
      "workspace.snapshotStore.core.currentSourceVersion != sourceVersion",
      "workspace.snapshotStore.core.candidateIndex != -1",
      "workspace.snapshotStore.core.states[priorSnapshotIndex] != snapshot_core.SemanticSnapshotStateRejected",
      "workspace.snapshotStore.core.publishedIndex == priorSnapshotIndex",
      "SixSemanticRequestsContentModified(workspace, uriMain",
      "SixSemanticRequestsContentModified(workspace, uriHelper",
    ]);
  const lspSixQueryUncompletedVersionRejection =
    lspCurrentVersionPinExact &&
    fiveQueryRejectionExact &&
    sixQueryRejectionExact &&
    uncompletedVersionDrivenExact;

  const primaryDebugConsumption = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    primaryObjectPlanSource, "PrimaryObjectPlanConsumeDebugSectionPlanReceiptInto"));
  const primaryDebugConsumptionExact = hasOrderedFragments(primaryDebugConsumption, [
    "if !lowering.semanticDebugBound:",
    "PrimaryObjectPlanDebugEmissionEvidenceInto(",
    "DebugSectionPlanConsumptionBuildInto(",
    "DebugSectionPlanConsumptionStrictValidateInto(",
    "plan.semanticDebugBindingReceipt = built.bindingReceipt",
    "plan.debugSectionPlanReceipt = built.sectionPlanReceipt",
    "plan.debugSectionPlanConsumed = true",
  ]);
  const directDebugBuild = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    directObjectEmitSource, "DirectObjectEmitBuildDebugSectionsInto"));
  const directObjectDebugConsumptionExact = hasOrderedFragments(directDebugBuild, [
    "if !plan.debugSectionPlanConsumed:",
    "plan.debugSectionPlanReceipt.backendKind != plan.actualBackendKind",
    "DirectObjectDebugSectionsBuildInto(",
    "DirectObjectDebugSectionsStrictValidateInto(",
  ]) &&
    (squashMaskedCheng(directObjectEmitSource).match(
      /ifdebug\.valid:writeRes=macho_object_writer\.MachOTextDataDebugObjectWrite\(/g) || []).length === 2;
  const machoDebugBytesRaw = extractTopLevelFunctionOrEmpty(
    machoObjectWriterSource, "MachOTextDataDebugObjectBytes");
  const machoDebugBytes = squashMaskedCheng(machoDebugBytesRaw);
  const machoDebugWrite = squashMaskedCheng(extractTopLevelFunctionOrEmpty(
    machoObjectWriterSource, "MachOTextDataDebugObjectWrite"));
  const machoDwarfWriterExact =
    hasOrderedFragments(machoDebugBytes, [
      "!debug.valid || BytesLen(debug.debugLine) <= 0",
      "BytesLen(debug.debugInfo) <= 0",
      "BytesLen(debug.debugAbbrev) <= 0",
      "if lineRelocCount <= 0 || infoRelocCount <= 0:",
      "MachOWriteDebugSectionCommand(",
      "MachOWriteDebugSectionCommand(",
      "MachOWriteDebugSectionCommand(",
      "ObjectBufferWriteBytes(out, debug.debugLine)",
      "ObjectBufferWriteBytes(out, debug.debugInfo)",
      "ObjectBufferWriteBytes(out, debug.debugAbbrev)",
      "MachOWriteDebugRelocation(",
      "MachOWriteDebugRelocation(",
    ]) &&
    (machoDebugBytesRaw.match(/"__debug_line"/g) || []).length === 1 &&
    (machoDebugBytesRaw.match(/"__debug_info"/g) || []).length === 1 &&
    (machoDebugBytesRaw.match(/"__debug_abbrev"/g) || []).length === 1 &&
    hasOrderedFragments(machoDebugWrite, [
      "MachOTextDataDebugObjectBytes(",
      "MachODebugSectionEvidenceBuildInto(",
      "WriteTextFile(",
      "out.relocCount = orel.ObjectRelocsCount(relocs) + debug.relocations.len",
    ]);
  const machoDwarfSectionRelocationConsumptionExact =
    primaryDebugConsumptionExact &&
    directObjectDebugConsumptionExact &&
    machoDwarfWriterExact;

  // Source literals never prove publication. The only accepted evidence is the
  // independently executed, hash-bound acceptance gate receipt, combined with
  // the exact zero-missing admission route and the real two-document fixture.
  const publishedCandidateEvidence =
    publishedCandidateReceipt !== null &&
    publishedCandidateReceipt.schema === "cheng.semantic_snapshot.published_candidate_receipt" &&
    publishedCandidateReceipt.status === "pass" &&
    publishedCandidateReceipt.executionBound === true &&
    /^[0-9a-f]{64}$/.test(publishedCandidateReceipt.receiptCid || "") &&
    candidatePublicationRequiresZeroMissingFacts &&
    publishedCandidateFixtureMultifileExact;
  const blockers = [];
  if (!moduleSymbolCoordinateContractExact) blockers.push("schema_missing_exact_module_symbol_coordinate_discriminator");
  if (!referenceOwnerSymbolColumnExact) blockers.push("schema_missing_reference_owner_symbol_id_column");
  if (!referenceOwnerSourceFunctionTargetKindExact) blockers.push("schema_missing_exact_reference_owner_source_function_target_kind_binding");
  if (!referenceBuilderOwnerRemapExact) blockers.push("builder_missing_exact_reference_owner_symbol_remap");
  if (!referenceCargoBindingExact) blockers.push("cargo_missing_exact_reference_owner_symbol_binding");
  if (!compilerReferenceFactProjectionExact) blockers.push("compiler_fact_missing_exact_reference_owner_symbol_projection");
  if (!lspReferenceIdentityExact) blockers.push("lsp_missing_exact_reference_owner_symbol_consumption");
  if (!referenceIdentityNoTextOrNameArity) blockers.push("reference_identity_uses_text_or_name_arity");
  if (!builderProjectsModuleSymbols) blockers.push("builder_missing_module_symbol_projection");
  if (!exactCallProjection) blockers.push("compiler_missing_exact_call_projection");
  if (!lspSixQueryUncompletedVersionRejection) blockers.push("lsp_missing_uncompleted_version_six_query_rejection");
  if (!machoDwarfSectionRelocationConsumptionExact) blockers.push("macho_missing_real_dwarf_section_relocation_consumption");
  if (!builderConsumesDeclarationStream) blockers.push("builder_missing_parser_declaration_stream_consumption");
  if (!builderConsumesPatternStream) blockers.push("builder_missing_parser_pattern_stream_consumption");
  if (functionOnlyCardinality) blockers.push("builder_symbol_count_equals_function_count");
  if (functionOnlyKind) blockers.push("builder_rejects_non_function_symbols");
  if (forcedMissingFacts) blockers.push("admission_forces_all_fact_domains_missing");
  if (admissionRequiresBlocked) blockers.push("admission_requires_blocked_receipt");
  if (!lspStagesCandidate) blockers.push("lsp_missing_production_stage_candidate");
  if (!lspCommitsCandidate) blockers.push("lsp_missing_production_commit_candidate");
  if (lspRejectsFailure && !lspStagesCandidate && !lspCommitsCandidate) blockers.push("lsp_rejection_only_producer");
  if (!candidatePublicationRequiresZeroMissingFacts) blockers.push("lsp_publication_not_guarded_by_zero_missing_facts");
  if (!publishedCandidateFixtureMultifileExact) blockers.push("published_candidate_fixture_not_exact_multifile");
  if (!publishedCandidateEvidence) blockers.push("no_published_candidate_evidence");
  const observations = Object.freeze({
    moduleSymbolCoordinateContractExact,
    referenceOwnerSymbolColumnExact,
    referenceOwnerSourceFunctionTargetKindExact,
    referenceBuilderOwnerRemapExact,
    referenceCargoBindingExact,
    compilerReferenceFactProjectionExact,
    lspReferenceIdentityExact,
    referenceIdentityNoTextOrNameArity,
    referenceOwnerIdentityContractExact,
    builderProjectsModuleSymbols,
    typedCallDeclarationProducerCoordinatesExact,
    compilerCsgExactCallProjection,
    exactCallProjection,
    lspCurrentVersionPinExact,
    lspSixQueryUncompletedVersionRejection,
    primaryDebugConsumptionExact,
    directObjectDebugConsumptionExact,
    machoDwarfWriterExact,
    machoDwarfSectionRelocationConsumptionExact,
    publishedCandidateEvidence,
    functionOnlyCardinality,
    functionOnlyKind,
    builderConsumesDeclarationStream,
    builderConsumesPatternStream,
    forcedMissingFacts,
    admissionRequiresBlocked,
    lspStagesCandidate,
    lspCommitsCandidate,
    lspRejectsFailure,
    candidatePublicationRequiresZeroMissingFacts,
    publishedCandidateFixtureMultifileExact,
  });
  return Object.freeze({
    status: blockers.length === 0 ? "pass" : "incomplete",
    blockers: Object.freeze(blockers),
    observations,
    receiptCid: domainSeparatedCid("cheng.semantic_snapshot.production_closure_audit", [
      sha256(Buffer.from(builderSource, "utf8")),
      sha256(Buffer.from(lspSource, "utf8")),
      sha256(Buffer.from(schemaSource, "utf8")),
      sha256(Buffer.from(cargoSource, "utf8")),
      sha256(Buffer.from(cargoValidatorSource, "utf8")),
      sha256(Buffer.from(compilerFactsSource, "utf8")),
      sha256(Buffer.from(typedExprSource, "utf8")),
      sha256(Buffer.from(compilerCsgSource, "utf8")),
      sha256(Buffer.from(lspVersionIsolationSmokeSource, "utf8")),
      sha256(Buffer.from(primaryObjectPlanSource, "utf8")),
      sha256(Buffer.from(directObjectEmitSource, "utf8")),
      sha256(Buffer.from(machoObjectWriterSource, "utf8")),
      publishedCandidateReceipt?.receiptCid || "",
      ...Object.entries(observations).flatMap(([key, value]) => [key, value ? "1" : "0"]),
      ...blockers,
    ]),
  });
}

function auditInternallyGuardedGate(source, gate, guardSha256) {
  if (gate.guardScope !== "each_external_process_tree") throw new Error(`gate ${gate.name} is not an internally guarded gate`);
  const functionStart = source.indexOf("run_guard() {");
  if (functionStart < 0 || source.indexOf("run_guard() {", functionStart + 1) >= 0) {
    throw new Error(`${gate.name} gate must define exactly one run_guard function`);
  }
  const functionEndMarker = source.indexOf("\n}\n", functionStart);
  if (functionEndMarker < 0) throw new Error(`${gate.name} gate run_guard function is not structurally closed`);
  const functionEnd = functionEndMarker + 3;
  const guardFunction = source.slice(functionStart, functionEnd);
  const guardInvocation = guardFunction.replace(/\\\n[ \t]*/g, " ").replace(/[ \t]+/g, " ");
  if (!guardInvocation.includes('if ! "$GUARD" --rss-limit:1073741824 --timeout:180 ') ||
      !guardInvocation.includes('--report-out:"$WORK/$name.guard.txt" ') ||
      !guardInvocation.includes('--stdout:"$WORK/$name.stdout.txt" ') ||
      !guardInvocation.includes('--stderr:"$WORK/$name.stderr.txt" -- "$@"; then') ||
      !guardInvocation.includes("return 1")) {
    throw new Error(`${gate.name} gate run_guard does not enforce the fixed exact 1 GiB process-tree contract`);
  }
  if ((guardFunction.match(/"\$GUARD"/g) || []).length !== 1 ||
      (guardFunction.match(/--rss-limit:1073741824/g) || []).length !== 1 ||
      (guardFunction.match(/-- "\$@"/g) || []).length !== 1) {
    throw new Error(`${gate.name} gate run_guard has an ambiguous guard invocation`);
  }

  const main = `${source.slice(0, functionStart)}${source.slice(functionEnd)}`;
  if (!main.includes('GUARD="$ROOT/tools/beat_c_process_group_guard.sh"') ||
      (main.match(/GUARD=/g) || []).length !== 1) {
    throw new Error(`${gate.name} gate guard path is not fixed to the audited root guard`);
  }
  const executableCode = main.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
  if (/(?:^|[|;&][ \t]*)(?:eval|source|alias|function|xargs|parallel|nohup|\.)(?:[ \t]|$)|(?:^|[|;&][ \t]*)(?:bash|sh)[ \t]+-c\b|^[ \t]*(?:command|env)[ \t]/m.test(executableCode)) {
    throw new Error(`${gate.name} gate contains a dynamic execution bypass`);
  }
  if (/(?:GUARD|COMPILER|EXE|OBJECT)[ \t]*=.*(?:\$\(|`)|\$\([ \t]*"?\$\{?(?:COMPILER|EXE|OBJECT|GUARD)\}?|`[^`]*(?:COMPILER|EXE|OBJECT|GUARD)/.test(executableCode)) {
    throw new Error(`${gate.name} gate uses command substitution to generate an execution path`);
  }

  const logical = executableCode.replace(/\\\n[ \t]*/g, " ");
  const calls = [...logical.matchAll(/^[ \t]*run_guard[ \t]+([A-Za-z0-9_]+)[ \t]+(.+)$/gm)].map((match) => ({
    name: match[1],
    command: match[2].replace(/[ \t]+/g, " ").trim(),
  }));
  const expectedSource = gate.smokePath;
  const expected = Object.freeze({
    compiler_build: 'cc -std=c11 -O2 -o "$COMPILER" "$COMPILER_SOURCE"',
    executable_build: `"$COMPILER" system-link-exec --root:"$ROOT" --in:${expectedSource} --emit:exe --target:arm64-apple-darwin --out:"$EXE" --report-out:"$REPORT"`,
    executable_run: '"$EXE"',
    object_first: `"$COMPILER" system-link-exec --root:"$ROOT" --in:${expectedSource} --emit:obj --target:arm64-apple-darwin --out:"$OBJECT" --report-out:"$WORK/object.first.report.txt"`,
    object_second: `"$COMPILER" system-link-exec --root:"$ROOT" --in:${expectedSource} --emit:obj --target:arm64-apple-darwin --out:"$OBJECT" --report-out:"$WORK/object.second.report.txt"`,
  });
  if (calls.length !== Object.keys(expected).length) throw new Error(`${gate.name} gate guarded command count drift: ${calls.length}`);
  const seen = new Set();
  for (const call of calls) {
    if (!(call.name in expected) || seen.has(call.name) || call.command !== expected[call.name]) {
      throw new Error(`${gate.name} gate guarded command route drift: ${call.name}`);
    }
    seen.add(call.name);
  }
  const withoutGuardCalls = logical.replace(/^[ \t]*run_guard[ \t]+[^\n]+$/gm, "");
  if (/^[ \t]*(?:cc\b|"?\$\{?COMPILER\}?"?[ \t]+|"?\$\{?EXE\}?"?(?:[ \t]|$)|"?\$\{?OBJECT\}?"?[ \t]+)/m.test(withoutGuardCalls)) {
    throw new Error(`${gate.name} gate contains an unguarded compile, executable, or object command`);
  }
  const sourceSha256 = sha256(Buffer.from(source, "utf8"));
  const commandRoutes = calls.map((call) => `${call.name}=${call.command}`);
  return Object.freeze({
    status: "pass",
    guardScope: "each_external_process_tree",
    guardedCommandCount: calls.length,
    perProcessTimeoutSeconds: 180,
    memoryLimitBytes: SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES,
    guardSourceSha256: guardSha256,
    receiptCid: domainSeparatedCid("cheng.semantic_snapshot.gate_guard_routing", [gate.name, sourceSha256, guardSha256, ...commandRoutes]),
  });
}

function auditColdCompilerIncludeClosure(baseline) {
  const rootPath = "bootstrap/cheng_cold.c";
  const queue = [rootPath];
  const visited = new Set();
  const edges = [];
  while (queue.length > 0) {
    const path = queue.shift();
    if (visited.has(path)) continue;
    visited.add(path);
    const entry = baseline.byPath.get(path);
    if (!entry) throw new Error(`cold compiler include closure input is not hash-bound: ${path}`);
    const source = decodeUtf8(entry.raw, `cold compiler input ${path}`);
    for (const match of source.matchAll(/^[ \t]*#include[ \t]+"([^"\r\n]*)"([^\r\n]*)$/gm)) {
      if (!/^[A-Za-z0-9_.-]+$/.test(match[1]) || match[2].trim() !== "") {
        throw new Error(`cold compiler local include is not canonical: ${path} -> ${match[0].trim()}`);
      }
      const included = `bootstrap/${match[1]}`;
      if (!baseline.byPath.has(included)) throw new Error(`cold compiler local include is not hash-bound: ${path} -> ${included}`);
      edges.push(`${path}->${included}`);
      if (!visited.has(included)) queue.push(included);
    }
  }
  const declared = baseline.entries.filter((entry) => entry.role === "cold_compiler_include").map((entry) => entry.path).sort();
  const reached = [...visited].filter((path) => path !== rootPath).sort();
  if (declared.length !== reached.length || declared.some((path, index) => path !== reached[index])) {
    throw new Error(`cold compiler declared include set does not equal the recursive local include closure`);
  }
  return Object.freeze({
    status: "pass",
    rootPath,
    inputCount: visited.size,
    includeEdgeCount: edges.length,
    receiptCid: domainSeparatedCid("cheng.semantic_snapshot.cold_compiler_include_closure", [
      ...[...visited].sort().flatMap((path) => [path, baseline.byPath.get(path).sha256]),
      ...edges.sort(),
    ]),
  });
}

function appendBounded(chunks, state, chunk, limit, label, kill) {
  const raw = Buffer.from(chunk);
  state.bytes += raw.length;
  if (state.bytes > limit) {
    state.overflow = true;
    kill();
    return;
  }
  chunks.push(raw);
}

function runGuardProcess(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    const stdoutState = {bytes: 0, overflow: false};
    const stderrState = {bytes: 0, overflow: false};
    let timedOut = false;
    let settled = false;
    const kill = () => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, options.timeoutMs);
    child.stdout.on("data", (chunk) => appendBounded(stdoutChunks, stdoutState, chunk, SEMANTIC_SNAPSHOT_AUDIT_MAX_WRAPPER_OUTPUT_BYTES, "guard stdout", kill));
    child.stderr.on("data", (chunk) => appendBounded(stderrChunks, stderrState, chunk, SEMANTIC_SNAPSHOT_AUDIT_MAX_WRAPPER_OUTPUT_BYTES, "guard stderr", kill));
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        exitCode,
        signal,
        timedOut,
        overflow: stdoutState.overflow || stderrState.overflow,
        stdout: Buffer.concat(stdoutChunks, Math.min(stdoutState.bytes, SEMANTIC_SNAPSHOT_AUDIT_MAX_WRAPPER_OUTPUT_BYTES)),
        stderr: Buffer.concat(stderrChunks, Math.min(stderrState.bytes, SEMANTIC_SNAPSHOT_AUDIT_MAX_WRAPPER_OUTPUT_BYTES)),
      });
    });
  });
}

function readStableGeneratedFile(path, label, maxBytes) {
  const root = realpathSync.native(resolve(path, ".."));
  const spec = {path: path.slice(root.length + 1), role: label, maxBytes};
  const entry = readStableRegularFile(root, spec, {allowEmpty: true});
  const stat = lstatSync(path, {bigint: true});
  if (stat.nlink !== 1n) throw new Error(`${label} must not be hard-linked: ${path}`);
  return entry;
}

function readStableFailureDiagnostic(path, label, maxBytes) {
  try {
    const entry = readStableGeneratedFile(path, label, maxBytes);
    const text = decodeUtf8(entry.raw, label);
    return text.length > SEMANTIC_SNAPSHOT_AUDIT_FAILURE_DIAGNOSTIC_CHARS
      ? text.slice(-SEMANTIC_SNAPSHOT_AUDIT_FAILURE_DIAGNOSTIC_CHARS)
      : text;
  } catch (error) {
    return `<unavailable:${error instanceof Error ? error.message : String(error)}>`;
  }
}

function readStableExternalExecutable(path, label) {
  const canonical = resolve(path);
  if (realpathSync.native(canonical) !== canonical || lstatSync(canonical).isSymbolicLink()) {
    throw new Error(`${label} must be a canonical non-symlink executable: ${canonical}`);
  }
  accessSync(canonical, fsConstants.X_OK);
  return readStableRegularFile(dirname(canonical), {path: basename(canonical), role: label, maxBytes: 128 * 1024 * 1024});
}

function parseKeyValueReceipt(raw, label) {
  const text = decodeUtf8(raw, label);
  if (!text.endsWith("\n") || text.includes("\0") || text.includes("\r")) throw new Error(`${label} is not canonical newline-terminated text`);
  const fields = new Map();
  for (const line of text.slice(0, -1).split("\n")) {
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error(`${label} has a malformed line: ${line}`);
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) || fields.has(key)) throw new Error(`${label} has an invalid or duplicate field: ${key}`);
    fields.set(key, value);
  }
  return {text, fields};
}

function requiredField(fields, key, label) {
  if (!fields.has(key)) throw new Error(`${label} is missing ${key}`);
  return fields.get(key);
}

function positiveIntegerField(fields, key, label, allowZero = false) {
  const raw = requiredField(fields, key, label);
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) throw new Error(`${label} has invalid integer ${key}=${raw}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || (!allowZero && value <= 0)) throw new Error(`${label} has out-of-range integer ${key}=${raw}`);
  return value;
}

function requireSha(value, label) {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${label} is not a SHA-256 digest: ${value}`);
  return value;
}

function verifyGuardReceipt(gate, reportEntry, stdoutEntry, stderrEntry, baseline, expectedPaths, timeoutSeconds, monitorPython) {
  const label = `${gate.name} guard receipt`;
  const parsed = parseKeyValueReceipt(reportEntry.raw, label);
  const fields = parsed.fields;
  const gateInput = baseline.byPath.get(gate.sourcePath);
  if (requiredField(fields, "schema", label) !== "beat_c_process_memory_guard" ||
      requiredField(fields, "status", label) !== "completed" ||
      requiredField(fields, "rc", label) !== "0" ||
      requiredField(fields, "memory_guard_mode", label) !== "process_tree" ||
      requiredField(fields, "observed_sample_limit_status", label) !== "proved" ||
      requiredField(fields, "memory_measurement_status", label) !== "available" ||
      requiredField(fields, "startup_status", label) !== "sampled" ||
      requiredField(fields, "output_path_history_status", label) !== "verified_clean" ||
      requiredField(fields, "command_identity_status", label) !== "available" ||
      requiredField(fields, "process_tree_escape_pid", label) !== "0") {
    throw new Error(`${label} does not prove a completed process-tree guarded run`);
  }
  if (positiveIntegerField(fields, "memory_limit_bytes", label) !== SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES) {
    throw new Error(`${label} did not enforce the exact 1 GiB limit`);
  }
  if (positiveIntegerField(fields, "timeout_seconds", label) !== timeoutSeconds) throw new Error(`${label} timeout drift`);
  if (positiveIntegerField(fields, "memory_sample_count", label) <= 0) throw new Error(`${label} has no memory samples`);
  const peak = positiveIntegerField(fields, "process_tree_enforced_peak_bytes", label, true);
  if (peak > SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES) throw new Error(`${label} exceeded the exact 1 GiB limit`);
  if (requiredField(fields, "command_path", label) !== expectedPaths.gate ||
      requiredField(fields, "command_sha256", label) !== gateInput.sha256 ||
      requiredField(fields, "command_execution_snapshot_sha256", label) !== gateInput.sha256) {
    throw new Error(`${label} command identity does not match the audited gate source`);
  }
  if (requiredField(fields, "monitor_python_path", label) !== monitorPython) {
    throw new Error(`${label} monitor Python identity drift`);
  }
  const monitorPythonSha256 = requireSha(requiredField(fields, "monitor_python_sha256", label), `${label} monitor_python_sha256`);
  if (requiredField(fields, "report_path", label) !== expectedPaths.report ||
      requiredField(fields, "stdout_path", label) !== expectedPaths.stdout ||
      requiredField(fields, "stderr_path", label) !== expectedPaths.stderr) {
    throw new Error(`${label} output paths are not the private audit paths`);
  }
  if (requiredField(fields, "stdout_sha256", label) !== stdoutEntry.sha256 ||
      positiveIntegerField(fields, "stdout_size", label, true) !== stdoutEntry.bytes ||
      requiredField(fields, "stderr_sha256", label) !== stderrEntry.sha256 ||
      positiveIntegerField(fields, "stderr_size", label, true) !== stderrEntry.bytes) {
    throw new Error(`${label} output artifact binding mismatch`);
  }
  const receiptCid = domainSeparatedCid("cheng.semantic_snapshot.guard_receipt", [
    gate.name,
    gateInput.sha256,
    reportEntry.sha256,
    stdoutEntry.sha256,
    stderrEntry.sha256,
    requiredField(fields, "command_argv_sha256", label),
    requiredField(fields, "target_env_sha256", label),
    monitorPython,
    monitorPythonSha256,
    String(peak),
  ]);
  return Object.freeze({
    receiptCid,
    guardScope: "whole_gate_process_tree",
    reportSha256: reportEntry.sha256,
    stdoutSha256: stdoutEntry.sha256,
    stderrSha256: stderrEntry.sha256,
    processTreePeakBytes: peak,
    memorySampleCount: positiveIntegerField(fields, "memory_sample_count", label),
    memoryLimitBytes: SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES,
    monitorPython,
    monitorPythonSha256,
  });
}

function verifyGateStdout(gate, stdoutEntry, baseline, compilerPath = null) {
  const label = `${gate.name} gate stdout`;
  const parsed = parseKeyValueReceipt(stdoutEntry.raw, label);
  if (requiredField(parsed.fields, gate.statusKey, label) !== "pass") throw new Error(`${label} did not report structured PASS`);
  for (const [field, path] of Object.entries(gate.expectedHashes)) {
    const expected = baseline.byPath.get(path)?.sha256;
    if (!expected || requiredField(parsed.fields, field, label) !== expected) throw new Error(`${label} ${field} is not bound to audited input ${path}`);
  }
  requireSha(requiredField(parsed.fields, "compiler_sha256", label), `${label} compiler_sha256`);
  if (gate.guardScope === "whole_gate_process_tree" && requiredField(parsed.fields, "compiler_sha256", label) !== baseline.byPath.get("artifacts/bootstrap/cheng.stage3").sha256) {
    throw new Error(`${label} did not use the audited compiler executable`);
  }
  for (const field of ["report_sha256", "executable_sha256"]) requireSha(requiredField(parsed.fields, field, label), `${label} ${field}`);
  if (gate.name !== "core") requireSha(requiredField(parsed.fields, "object_sha256", label), `${label} object_sha256`);
  return parsed.text;
}

function auditPublishedCandidateGateRouting(source, guardSha256) {
  const logical = source.replace(/\\\n[ \t]*/g, " ");
  const required = [
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
  ];
  for (const fragment of required) {
    if (!logical.includes(fragment)) throw new Error(`published candidate gate routing missing: ${fragment}`);
  }
  const runGuardCalls = [...logical.matchAll(/^[ \t]*run_guard[ \t]+(compiler_build|smoke_build|object_first|object_second)\b/gm)];
  if (runGuardCalls.length !== 4 || new Set(runGuardCalls.map((match) => match[1])).size !== 4) {
    throw new Error("published candidate gate must guard exactly compiler_build, smoke_build, object_first and object_second");
  }
  if ((logical.match(/"\$GUARD"[ \t]+--rss-limit:1073741824[ \t]+--timeout:240/g) || []).length !== 2) {
    throw new Error("published candidate gate must have exactly one run_guard route and one runtime guard");
  }
  if (/^[ \t]*(?:sleep|poll)\b/gm.test(logical) || /^[ \t]*[^#\n]*\|\|[ \t]*true[ \t]*(?:$|#)/gm.test(logical)) {
    throw new Error("published candidate gate contains polling or success masking");
  }
  return Object.freeze({
    status: "pass",
    guardedCommandCount: 5,
    memoryLimitBytes: SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES,
    perProcessTimeoutSeconds: 240,
    receiptCid: domainSeparatedCid("cheng.semantic_snapshot.published_candidate_gate_routing", [
      sha256(Buffer.from(source, "utf8")),
      guardSha256,
      ...required,
    ]),
  });
}

function verifyPublishedCandidateGateStdout(stdoutEntry, baseline, sourceSetCid) {
  const label = "published candidate gate stdout";
  const parsed = parseKeyValueReceipt(stdoutEntry.raw, label);
  const expectedFields = new Set([
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
  ]);
  if (parsed.fields.size !== expectedFields.size ||
      [...parsed.fields.keys()].some((key) => !expectedFields.has(key))) {
    throw new Error(`${label} field set is not the unique current schema`);
  }
  if (requiredField(parsed.fields, "lsp_multifile_exact_snapshot_acceptance_gate_status", label) !== "pass") {
    throw new Error(`${label} did not report PASS`);
  }
  const exactBindings = Object.freeze({
    source_sha256: "src/tests/lsp_multifile_exact_snapshot_acceptance_smoke.cheng",
    gate_sha256: SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH,
    compiler_source_sha256: "bootstrap/cheng_cold.c",
    lsp_module_sha256: "src/core/tooling/lsp_server.cheng",
    query_projection_module_sha256: "src/core/tooling/semantic_snapshot_query_projection.cheng",
    compiler_csg_module_sha256: "src/core/tooling/compiler_csg.cheng",
  });
  for (const [field, path] of Object.entries(exactBindings)) {
    const expected = baseline.byPath.get(path)?.sha256;
    if (!expected || requiredField(parsed.fields, field, label) !== expected) {
      throw new Error(`${label} ${field} is not bound to audited input ${path}`);
    }
  }
  const compilerSha256 = requireSha(requiredField(parsed.fields, "compiler_sha256", label), `${label} compiler_sha256`);
  const sourceClosureCid = requireSha(requiredField(parsed.fields, "source_closure_cid", label), `${label} source_closure_cid`);
  const objectSha256 = requireSha(requiredField(parsed.fields, "object_sha256", label), `${label} object_sha256`);
  const runtime = requiredField(parsed.fields, "lsp_multifile_exact_snapshot_acceptance_status", label);
  const match = /^pass published=1 source_version=([1-9][0-9]*) documents=([1-9][0-9]*) open_documents=([1-9][0-9]*) binding_receipt=([0-9a-f]{64}) query_projection=([0-9a-f]{64}) open_document_universe=([0-9a-f]{64})$/.exec(runtime);
  if (!match) throw new Error(`${label} runtime publication receipt is malformed`);
  const sourceVersion = Number(match[1]);
  if (!Number.isSafeInteger(sourceVersion) || sourceVersion <= 1) throw new Error(`${label} source version is not a real transition`);
  const documentCount = Number(match[2]);
  const openDocumentCount = Number(match[3]);
  if (!Number.isSafeInteger(documentCount) || documentCount < 2) {
    throw new Error(`${label} publication is not multi-file`);
  }
  if (!Number.isSafeInteger(openDocumentCount) || openDocumentCount < 2 || openDocumentCount > documentCount) {
    throw new Error(`${label} open document count is not a real multi-file subset`);
  }
  const bindingReceiptCid = requireSha(match[4], `${label} binding_receipt`);
  const queryProjectionCid = requireSha(match[5], `${label} query_projection`);
  const openDocumentUniverseCid = requireSha(match[6], `${label} open_document_universe`);
  const zeroCid = "0".repeat(64);
  const publicationIdentities = [bindingReceiptCid, queryProjectionCid, openDocumentUniverseCid];
  if (publicationIdentities.some((cid) => cid === zeroCid) ||
      new Set(publicationIdentities).size !== publicationIdentities.length) {
    throw new Error(`${label} publication identities are empty or aliased`);
  }
  return Object.freeze({
    schema: "cheng.semantic_snapshot.published_candidate_stdout_receipt",
    status: "validated",
    sourceVersion,
    documentCount,
    openDocumentCount,
    compilerSha256,
    sourceClosureCid,
    objectSha256,
    bindingReceiptCid,
    queryProjectionCid,
    openDocumentUniverseCid,
    stdoutSha256: stdoutEntry.sha256,
    receiptCid: domainSeparatedCid("cheng.semantic_snapshot.published_candidate_receipt", [
      sourceSetCid,
      stdoutEntry.sha256,
      compilerSha256,
      sourceClosureCid,
      objectSha256,
      String(sourceVersion),
      String(documentCount),
      String(openDocumentCount),
      bindingReceiptCid,
      queryProjectionCid,
      openDocumentUniverseCid,
    ]),
  });
}

function composePublishedCandidateExecutionReceipt(
  runtimeReceipt,
  routingAudit,
  sourceSetCid,
) {
  if (runtimeReceipt?.schema !== "cheng.semantic_snapshot.published_candidate_stdout_receipt" ||
      runtimeReceipt.status !== "validated" ||
      routingAudit?.status !== "pass") {
    throw new Error("published candidate execution receipt inputs are not validated");
  }
  const runtimeReceiptCid = requireSha(
    runtimeReceipt.receiptCid, "published candidate runtime receipt CID");
  const routingReceiptCid = requireSha(
    routingAudit.receiptCid, "published candidate routing receipt CID");
  requireSha(sourceSetCid, "published candidate source set CID");
  return Object.freeze({
    schema: "cheng.semantic_snapshot.published_candidate_receipt",
    status: "pass",
    executionBound: true,
    sourceVersion: runtimeReceipt.sourceVersion,
    documentCount: runtimeReceipt.documentCount,
    openDocumentCount: runtimeReceipt.openDocumentCount,
    compilerSha256: runtimeReceipt.compilerSha256,
    sourceClosureCid: runtimeReceipt.sourceClosureCid,
    objectSha256: runtimeReceipt.objectSha256,
    bindingReceiptCid: runtimeReceipt.bindingReceiptCid,
    queryProjectionCid: runtimeReceipt.queryProjectionCid,
    openDocumentUniverseCid: runtimeReceipt.openDocumentUniverseCid,
    stdoutSha256: runtimeReceipt.stdoutSha256,
    runtimeReceiptCid,
    routingReceiptCid,
    receiptCid: domainSeparatedCid("cheng.semantic_snapshot.published_candidate_execution_receipt", [
      sourceSetCid,
      runtimeReceiptCid,
      routingReceiptCid,
    ]),
  });
}

async function runPublishedCandidateGate(root, baseline, sourceSetCid, timeoutSeconds) {
  if (timeoutSeconds < SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_MIN_TIMEOUT_SECONDS) {
    throw new Error(`published candidate gate timeoutSeconds must be at least ${SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_MIN_TIMEOUT_SECONDS}`);
  }
  verifySemanticSnapshotAuditInputs(root, baseline, "before published candidate gate");
  const gateEntry = baseline.byPath.get(SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH);
  const guardEntry = baseline.byPath.get("tools/beat_c_process_group_guard.sh");
  if (!gateEntry || !guardEntry) throw new Error("published candidate gate inputs are not hash-bound");
  const gatePath = join(root, SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH);
  accessSync(gatePath, fsConstants.X_OK);
  const routingAudit = auditPublishedCandidateGateRouting(
    decodeUtf8(gateEntry.raw, "published candidate gate source"), guardEntry.sha256);
  const env = {
    ...process.env,
    CHENG_LSP_MULTIFILE_VERSION_ISOLATION_ONLY: "0",
    CHENG_LSP_MULTIFILE_CANDIDATE_PREFLIGHT_ONLY: "0",
  };
  const run = await runGuardProcess(gatePath, [], {
    cwd: root,
    env,
    timeoutMs: timeoutSeconds * 1000,
  });
  verifySemanticSnapshotAuditInputs(root, baseline, "after published candidate gate");
  if (run.timedOut) throw new Error("published candidate gate exceeded its bounded timeout");
  if (run.overflow) throw new Error("published candidate gate output exceeded its bound");
  if (run.exitCode !== 0 || run.signal) {
    throw new Error(`published candidate gate failed: exit=${run.exitCode} signal=${run.signal || "none"} stdout=${decodeUtf8(run.stdout, "published candidate stdout")} stderr=${decodeUtf8(run.stderr, "published candidate stderr")}`);
  }
  if (run.stderr.length !== 0) throw new Error("published candidate gate wrote stderr on success");
  const stdoutEntry = Object.freeze({
    raw: run.stdout,
    sha256: sha256(run.stdout),
    bytes: run.stdout.length,
  });
  const runtimeReceipt = verifyPublishedCandidateGateStdout(
    stdoutEntry, baseline, sourceSetCid);
  return composePublishedCandidateExecutionReceipt(
    runtimeReceipt, routingAudit, sourceSetCid);
}

async function runOneGate(root, gate, baseline, timeoutSeconds) {
  verifySemanticSnapshotAuditInputs(root, baseline, `before ${gate.name} gate`);
  const privateDir = realpathSync.native(mkdtempSync(join(tmpdir(), `cheng-semantic-snapshot-audit-${gate.name}-`)));
  chmodSync(privateDir, 0o700);
  const paths = Object.freeze({
    gate: join(root, gate.sourcePath),
    report: join(privateDir, "guard.report.txt"),
    stdout: join(privateDir, "gate.stdout.txt"),
    stderr: join(privateDir, "gate.stderr.txt"),
  });
  const guard = join(root, "tools/beat_c_process_group_guard.sh");
  const compilerPath = join(root, "artifacts/bootstrap/cheng.stage3");
  const monitorPython = resolve(SEMANTIC_SNAPSHOT_AUDIT_MONITOR_PYTHON);
  try {
    accessSync(paths.gate, fsConstants.X_OK);
    accessSync(guard, fsConstants.X_OK);
    accessSync(compilerPath, fsConstants.X_OK);
    if (realpathSync.native(monitorPython) !== monitorPython || lstatSync(monitorPython).isSymbolicLink()) {
      throw new Error(`semantic snapshot audit monitor Python must be a canonical non-symlink executable: ${monitorPython}`);
    }
    accessSync(monitorPython, fsConstants.X_OK);
    const args = [
      `--rss-limit:${SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES}`,
      `--timeout:${timeoutSeconds}`,
      `--report-out:${paths.report}`,
      `--stdout:${paths.stdout}`,
      `--stderr:${paths.stderr}`,
      "--",
      paths.gate,
    ];
    const run = await runGuardProcess(guard, args, {
      cwd: root,
      timeoutMs: (timeoutSeconds + 30) * 1000,
      env: {
        ...process.env,
        CHENG_PROCESS_MAX_RSS_BYTES: String(SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES),
        CHENG_SEMANTIC_SNAPSHOT_COMPILER: compilerPath,
        CHENG_SEMANTIC_SNAPSHOT_MONITOR_PYTHON: monitorPython,
        BEAT_C_GUARD_MONITOR_PYTHON: monitorPython,
      },
    });
    let postError = null;
    try { verifySemanticSnapshotAuditInputs(root, baseline, `after ${gate.name} gate`); }
    catch (error) { postError = error; }
    if (postError) throw postError;
    if (run.timedOut) throw new Error(`${gate.name} semantic snapshot gate exceeded ${timeoutSeconds + 30}s parent deadline`);
    if (run.overflow) throw new Error(`${gate.name} semantic snapshot guard wrapper output exceeded its bound`);
    if (run.exitCode !== 0 || run.signal) {
      const gateStdout = readStableFailureDiagnostic(
        paths.stdout, `${gate.name} failed gate stdout`,
        SEMANTIC_SNAPSHOT_AUDIT_MAX_GATE_OUTPUT_BYTES);
      const gateStderr = readStableFailureDiagnostic(
        paths.stderr, `${gate.name} failed gate stderr`,
        SEMANTIC_SNAPSHOT_AUDIT_MAX_GATE_OUTPUT_BYTES);
      throw new Error(
        `${gate.name} semantic snapshot gate failed: exit=${run.exitCode} signal=${run.signal || "none"}` +
        ` wrapper_stdout=${decodeUtf8(run.stdout, `${gate.name} guard stdout`)}` +
        ` wrapper_stderr=${decodeUtf8(run.stderr, `${gate.name} guard stderr`)}` +
        ` gate_stdout=${gateStdout} gate_stderr=${gateStderr}`);
    }
    if (run.stdout.length !== 0 || run.stderr.length !== 0) throw new Error(`${gate.name} outer guard wrote unexpected wrapper output`);
    const reportEntry = readStableGeneratedFile(paths.report, `${gate.name} guard report`, SEMANTIC_SNAPSHOT_AUDIT_MAX_GUARD_REPORT_BYTES);
    const stdoutEntry = readStableGeneratedFile(paths.stdout, `${gate.name} gate stdout`, SEMANTIC_SNAPSHOT_AUDIT_MAX_GATE_OUTPUT_BYTES);
    const stderrEntry = readStableGeneratedFile(paths.stderr, `${gate.name} gate stderr`, SEMANTIC_SNAPSHOT_AUDIT_MAX_GATE_OUTPUT_BYTES);
    const guardReceipt = verifyGuardReceipt(gate, reportEntry, stdoutEntry, stderrEntry, baseline, paths, timeoutSeconds, monitorPython);
    const stdout = verifyGateStdout(gate, stdoutEntry, baseline, compilerPath);
    return Object.freeze({
      name: gate.name,
      sourcePath: gate.sourcePath,
      sourceSha256: baseline.byPath.get(gate.sourcePath).sha256,
      stdout,
      exitCode: run.exitCode,
      guardReceipt,
    });
  } finally {
    rmSync(privateDir, {recursive: true, force: true});
  }
}

async function runInternallyGuardedGate(root, gate, baseline, routingAudit) {
  verifySemanticSnapshotAuditInputs(root, baseline, `before ${gate.name} gate`);
  const gatePath = join(root, gate.sourcePath);
  const monitorPython = resolve(SEMANTIC_SNAPSHOT_AUDIT_MONITOR_PYTHON);
  accessSync(gatePath, fsConstants.X_OK);
  const monitorBefore = readStableExternalExecutable(monitorPython, "semantic snapshot audit monitor Python");
  if (!process.env.PATH) throw new Error("semantic snapshot audit requires an explicit PATH for the fixed guard monitor");
  const env = {
    ...process.env,
    PATH: `${dirname(monitorPython)}:${process.env.PATH}`,
    BEAT_C_GUARD_MONITOR_PYTHON: monitorPython,
    CHENG_PROCESS_MAX_RSS_BYTES: String(SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES),
  };
  delete env.CHENG_SEMANTIC_SNAPSHOT_COMPILER;
  const run = await runGuardProcess(gatePath, [], {
    cwd: root,
    env,
    timeoutMs: (routingAudit.guardedCommandCount * routingAudit.perProcessTimeoutSeconds + 30) * 1000,
  });
  const monitorAfter = readStableExternalExecutable(monitorPython, "semantic snapshot audit monitor Python");
  if (monitorBefore.sha256 !== monitorAfter.sha256 || !sameGeneration(monitorBefore.generation, monitorAfter.generation)) {
    throw new Error(`${gate.name} semantic snapshot gate monitor Python identity drift`);
  }
  verifySemanticSnapshotAuditInputs(root, baseline, `after ${gate.name} gate`);
  if (run.timedOut) throw new Error(`${gate.name} semantic snapshot gate exceeded its statically proved process-tree timeout sum`);
  if (run.overflow) throw new Error(`${gate.name} semantic snapshot gate output exceeded its bound`);
  if (run.exitCode !== 0 || run.signal) {
    throw new Error(`${gate.name} semantic snapshot gate failed: exit=${run.exitCode} signal=${run.signal || "none"} stdout=${decodeUtf8(run.stdout, `${gate.name} stdout`)} stderr=${decodeUtf8(run.stderr, `${gate.name} stderr`)}`);
  }
  if (run.stderr.length !== 0) throw new Error(`${gate.name} semantic snapshot gate wrote stderr on success`);
  const stdoutEntry = Object.freeze({raw: run.stdout, sha256: sha256(run.stdout), bytes: run.stdout.length});
  const stdout = verifyGateStdout(gate, stdoutEntry, baseline);
  const guardReceipt = Object.freeze({
    receiptCid: domainSeparatedCid("cheng.semantic_snapshot.composed_gate_guard_receipt", [
      gate.name,
      baseline.byPath.get(gate.sourcePath).sha256,
      routingAudit.receiptCid,
      monitorBefore.sha256,
      stdoutEntry.sha256,
      String(run.exitCode),
    ]),
    guardScope: "each_external_process_tree",
    routingReceiptCid: routingAudit.receiptCid,
    guardSourceSha256: routingAudit.guardSourceSha256,
    guardedCommandCount: routingAudit.guardedCommandCount,
    perProcessTimeoutSeconds: routingAudit.perProcessTimeoutSeconds,
    memoryLimitBytes: routingAudit.memoryLimitBytes,
    monitorPython,
    monitorPythonSha256: monitorBefore.sha256,
  });
  return Object.freeze({
    name: gate.name,
    sourcePath: gate.sourcePath,
    sourceSha256: baseline.byPath.get(gate.sourcePath).sha256,
    stdout,
    exitCode: run.exitCode,
    guardReceipt,
  });
}

async function runSemanticSnapshotAudit(
  root,
  scope = SEMANTIC_SNAPSHOT_AUDIT_SCOPE,
  timeoutSeconds = SEMANTIC_SNAPSHOT_AUDIT_DEFAULT_TIMEOUT_SECONDS,
  runPublishedCandidate = false,
) {
  if (scope !== SEMANTIC_SNAPSHOT_AUDIT_SCOPE && scope !== SEMANTIC_SNAPSHOT_AUDIT_PRODUCTION_CLOSURE_SCOPE) {
    throw new Error(`unsupported semantic snapshot audit scope: ${scope}`);
  }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > SEMANTIC_SNAPSHOT_AUDIT_MAX_TIMEOUT_SECONDS) {
    throw new Error(`semantic snapshot audit timeoutSeconds must be an integer in 1..${SEMANTIC_SNAPSHOT_AUDIT_MAX_TIMEOUT_SECONDS}`);
  }
  if (typeof runPublishedCandidate !== "boolean") throw new Error("runPublishedCandidate must be boolean");
  if (runPublishedCandidate && scope !== SEMANTIC_SNAPSHOT_AUDIT_PRODUCTION_CLOSURE_SCOPE) {
    throw new Error("runPublishedCandidate is only valid for production_closure");
  }
  const canonicalRoot = requireCanonicalRoot(root);
  const baseline = captureSemanticSnapshotAuditInputs(canonicalRoot);
  const publicInputs = baseline.entries.map((entry) => Object.freeze({
    path: entry.path,
    role: entry.role,
    bytes: entry.bytes,
    sha256: entry.sha256,
  }));
  const sourceSetCid = domainSeparatedCid(
    "cheng.semantic_snapshot.audit_source_set",
    publicInputs.flatMap((entry) => [entry.path, entry.role, String(entry.bytes), entry.sha256]));
  const coreSource = decodeUtf8(baseline.byPath.get("src/core/tooling/semantic_snapshot.cheng").raw, "semantic_snapshot.cheng");
  const productionSource = decodeUtf8(baseline.byPath.get("src/core/tooling/semantic_snapshot_production.cheng").raw, "semantic_snapshot_production.cheng");
  const structuralAudit = auditSemanticSnapshotStructure(coreSource, productionSource);
  const publishedCandidateReceipt = runPublishedCandidate
    ? await runPublishedCandidateGate(canonicalRoot, baseline, sourceSetCid, timeoutSeconds)
    : null;
  const closureAudit = auditSemanticSnapshotProductionClosure({
    builderSource: decodeUtf8(baseline.byPath.get("src/core/tooling/compiler_snapshot_builder.cheng").raw, "compiler_snapshot_builder.cheng"),
    lspSource: decodeUtf8(baseline.byPath.get("src/core/tooling/lsp_server.cheng").raw, "lsp_server.cheng"),
    schemaSource: decodeUtf8(baseline.byPath.get("src/core/csg_core/compiler_snapshot_schema.cheng").raw, "compiler_snapshot_schema.cheng"),
    cargoSource: decodeUtf8(baseline.byPath.get("src/core/csg_core/compiler_snapshot_cargo.cheng").raw, "compiler_snapshot_cargo.cheng"),
    cargoValidatorSource: decodeUtf8(baseline.byPath.get("src/core/csg_core/validator.cheng").raw, "validator.cheng"),
    compilerFactsSource: decodeUtf8(baseline.byPath.get("src/core/backend/compiler_facts.cheng").raw, "compiler_facts.cheng"),
    typedExprSource: decodeUtf8(baseline.byPath.get("src/core/lang/typed_expr.cheng").raw, "typed_expr.cheng"),
    compilerCsgSource: decodeUtf8(baseline.byPath.get("src/core/tooling/compiler_csg.cheng").raw, "compiler_csg.cheng"),
    lspVersionIsolationSmokeSource: decodeUtf8(baseline.byPath.get("src/tests/lsp_multifile_exact_snapshot_acceptance_smoke.cheng").raw, "lsp_multifile_exact_snapshot_acceptance_smoke.cheng"),
    primaryObjectPlanSource: decodeUtf8(baseline.byPath.get("src/core/backend/primary_object_plan.cheng").raw, "primary_object_plan.cheng"),
    directObjectEmitSource: decodeUtf8(baseline.byPath.get("src/core/backend/direct_object_emit.cheng").raw, "direct_object_emit.cheng"),
    machoObjectWriterSource: decodeUtf8(baseline.byPath.get("src/core/backend/macho_object_writer.cheng").raw, "macho_object_writer.cheng"),
  }, publishedCandidateReceipt);
  const compilerInputAudit = auditColdCompilerIncludeClosure(baseline);
  if (scope === SEMANTIC_SNAPSHOT_AUDIT_PRODUCTION_CLOSURE_SCOPE) {
    verifySemanticSnapshotAuditInputs(canonicalRoot, baseline, "production closure publication check");
    const auditCid = domainSeparatedCid("cheng.semantic_snapshot.audit", [
      scope,
      sourceSetCid,
      structuralAudit.receiptCid,
      closureAudit.receiptCid,
      compilerInputAudit.receiptCid,
      publishedCandidateReceipt?.receiptCid || "",
    ]);
    return Object.freeze({
      schema: SEMANTIC_SNAPSHOT_AUDIT_SCHEMA,
      status: closureAudit.status,
      scope,
      root: canonicalRoot,
      sourceSetCid,
      structuralAudit,
      productionClosureAudit: closureAudit,
      publishedCandidateReceipt,
      compilerInputAudit,
      inputs: Object.freeze(publicInputs),
      auditCid,
    });
  }
  const guardSourceSha256 = baseline.byPath.get("tools/beat_c_process_group_guard.sh").sha256;
  const guardRoutingAudits = new Map();
  for (const gate of GATE_SPECS) {
    if (gate.guardScope !== "each_external_process_tree") continue;
    const gateSource = decodeUtf8(baseline.byPath.get(gate.sourcePath).raw, `${gate.name} gate source`);
    guardRoutingAudits.set(gate.name, auditInternallyGuardedGate(gateSource, gate, guardSourceSha256));
  }
  verifySemanticSnapshotAuditInputs(canonicalRoot, baseline, "after structural audit");
  const gates = [];
  for (const gate of GATE_SPECS) {
    gates.push(gate.guardScope === "whole_gate_process_tree"
      ? await runOneGate(canonicalRoot, gate, baseline, timeoutSeconds)
      : await runInternallyGuardedGate(canonicalRoot, gate, baseline, guardRoutingAudits.get(gate.name)));
  }
  verifySemanticSnapshotAuditInputs(canonicalRoot, baseline, "final publication check");

  const auditCid = domainSeparatedCid("cheng.semantic_snapshot.audit", [
    scope,
    sourceSetCid,
    structuralAudit.receiptCid,
    closureAudit.receiptCid,
    compilerInputAudit.receiptCid,
    ...[...guardRoutingAudits.values()].map((audit) => audit.receiptCid),
    ...gates.flatMap((gate) => [gate.name, gate.sourceSha256, gate.guardReceipt.receiptCid]),
  ]);
  return Object.freeze({
    schema: SEMANTIC_SNAPSHOT_AUDIT_SCHEMA,
    status: "pass",
    scope,
    root: canonicalRoot,
    memoryLimitBytes: SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES,
    sourceSetCid,
    structuralAudit,
    productionClosureAudit: closureAudit,
    compilerInputAudit,
    guardRoutingAudits: Object.freeze([...guardRoutingAudits.entries()].map(([name, audit]) => Object.freeze({name, ...audit}))),
    inputs: Object.freeze(publicInputs),
    gates: Object.freeze(gates),
    auditCid,
  });
}

const initChengSemanticSnapshotAuditModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengSemanticSnapshotAuditInputSchema = zodSchema.strictObject({
    root: zodSchema.string().optional().describe("Explicit Cheng project root for this call. Must contain cheng-package.toml."),
    scope: zodSchema.enum([SEMANTIC_SNAPSHOT_AUDIT_SCOPE, SEMANTIC_SNAPSHOT_AUDIT_PRODUCTION_CLOSURE_SCOPE]),
    timeoutSeconds: zodSchema.number().int().positive().max(SEMANTIC_SNAPSHOT_AUDIT_MAX_TIMEOUT_SECONDS).optional(),
    runPublishedCandidate: zodSchema.boolean().optional().describe("For production_closure, execute and bind the real non-empty multi-file published-candidate gate."),
  });
  ChengSemanticSnapshotAuditTool = createChengTextTool({
    name: "cheng_semantic_snapshot_audit",
    requiresChengProjectRoot: true,
    searchHint: "audit atomic semantic snapshot publication under exact process-tree memory guards",
    inputSchema: chengSemanticSnapshotAuditInputSchema,
    description: "Independently audit Cheng semantic snapshots. scope=atomic_publish proves the scalar atomic commit/reclaim/rejection boundary and runs the three guarded gates. scope=production_closure stable-reads the bound sources and verifies exact module Symbol coordinates, Reference ownerSymbolIds through owner/source/function/target-kind/cargo/CompilerFact/LSP bindings without text or name+arity identity, TypedExpr-to-CSG call projection, current-version six-query LSP rejection, and real Mach-O DWARF section/relocation consumption. With runPublishedCandidate=true it executes the current hash-bound acceptance gate and only accepts its guarded real multi-file published=1 receipt when publication is statically proved to require missingFactBitmap=0. Source names and published=1 literals never count as publication evidence. Symlinks, drift, oversized inputs, malformed structure and failed guarded evidence hard-fail.",
    prompt: "Use scope=production_closure while implementing the full snapshot path; set runPublishedCandidate=true only for the final real publication proof with timeoutSeconds at least 1230. Use scope=atomic_publish to reprove the commit boundary.",
    toAutoClassifierInput: (input) => `semantic-snapshot-audit:${input.scope}:${input.runPublishedCandidate ? "runtime" : "source"}`,
    async execute(input) {
      const root = resolveChengProjectRoot({root: input.root});
      return jsonResult(await runSemanticSnapshotAudit(
        root, input.scope, input.timeoutSeconds, input.runPublishedCandidate || false));
    },
  });
});

export {
  ChengSemanticSnapshotAuditTool,
  GATE_SPECS,
  SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS,
  SEMANTIC_SNAPSHOT_AUDIT_MEMORY_LIMIT_BYTES,
  SEMANTIC_SNAPSHOT_AUDIT_PRODUCTION_CLOSURE_SCOPE,
  SEMANTIC_SNAPSHOT_AUDIT_SCHEMA,
  SEMANTIC_SNAPSHOT_AUDIT_SCOPE,
  SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_GATE_PATH,
  SEMANTIC_SNAPSHOT_PUBLISHED_CANDIDATE_MIN_TIMEOUT_SECONDS,
  auditSemanticSnapshotStructure,
  auditSemanticSnapshotProductionClosure,
  auditPublishedCandidateGateRouting,
  composePublishedCandidateExecutionReceipt,
  auditInternallyGuardedGate,
  auditColdCompilerIncludeClosure,
  captureSemanticSnapshotAuditInputs,
  initChengSemanticSnapshotAuditModule,
  runPublishedCandidateGate,
  runSemanticSnapshotAudit,
  verifyPublishedCandidateGateStdout,
  verifySemanticSnapshotAuditInputs,
};
