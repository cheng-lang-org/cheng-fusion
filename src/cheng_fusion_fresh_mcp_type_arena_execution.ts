import { createHash, randomBytes } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  type BigIntStats,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHENG_CURRENT_OFFICIAL_DRIVER,
  CHENG_CURRENT_ROOT,
} from "./cheng_current_parser_receipt_ingress.ts";
import { canonicalJson } from "./cheng_semantic_matrix_m9023.ts";
import {
  validateChengFusionMcpRuntimeIdentity,
  type ChengFusionMcpRuntimeIdentity,
} from "./cheng_fusion_mcp_runtime_identity.ts";
import { verifyInheritedParentGuardForChild } from "./cheng_toolkit_m9000.ts";

export const CHENG_FUSION_FRESH_MCP_TYPE_ARENA_EXECUTION_SCHEMA =
  "cheng_fusion_fresh_mcp_type_arena_execution";
export const CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE = join(
  CHENG_CURRENT_ROOT,
  "src/tests/compiler_csg_type_arena_production_smoke.cheng",
);
export const CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE = join(
  CHENG_CURRENT_ROOT,
  "src/core/lang/typed_expr_type_arena.cheng",
);
export const CHENG_FUSION_TYPE_ARENA_OUTPUT_DIR = join(
  CHENG_CURRENT_ROOT,
  "artifacts/verification/fresh_mcp_type_arena_csg",
);
export const CHENG_FUSION_TYPE_ARENA_SYMBOL = "TypedExprTypeArena";
export const CHENG_FUSION_TYPE_ARENA_TARGET = "arm64-apple-darwin";
export const CHENG_FUSION_TYPE_ARENA_QUERY_SUBSTRATE_PATH =
  relative(CHENG_CURRENT_ROOT, CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE);
export const CHENG_FUSION_TYPE_ARENA_ENTRY_SUBSTRATE_PATH =
  relative(CHENG_CURRENT_ROOT, CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE);

const HASH = /^[0-9a-f]{64}$/;
const GENERATION_ID = /^sha256-[0-9a-f]{64}$/;
const HASH_PREFIXED = /^sha256:[0-9a-f]{64}$/;
const MEMORY_LIMIT_BYTES = 1073741824;
const FUSION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MCP_ENTRY = join(FUSION_ROOT, "index.ts");
const TOOL_NAMES = Object.freeze([
  "cheng_csg_roundtrip",
  "cheng_csg_query",
  "cheng_evidence",
] as const);
const REQUEST_IDS = Object.freeze([2, 3, 4] as const);
const MAX_PROTOCOL_BUFFER_BYTES = 16 * 1024 * 1024;

interface StableFile {
  readonly path: string;
  readonly raw: Buffer;
  readonly raw32: string;
  readonly stat: BigIntStats;
}

export interface FreshMcpTypeArenaStep {
  readonly ordinal: 0 | 1 | 2;
  readonly requestId: 2 | 3 | 4;
  readonly toolName: (typeof TOOL_NAMES)[number];
  readonly inputRaw32: string;
  readonly outputByteLength: number;
  readonly outputRaw32: string;
  readonly responseByteLength: number;
  readonly responseRaw32: string;
  readonly serverPid: number;
  readonly runtimeStartedUnixMs: number;
  readonly initializationNonce: string;
  readonly runtimeReceiptRaw32: string;
}

export interface FreshMcpTypeArenaFilePin {
  readonly path: string;
  readonly device: string;
  readonly inode: string;
  readonly mode: string;
  readonly linkCount: string;
  readonly byteLength: number;
  readonly mtimeNs: string;
  readonly ctimeNs: string;
  readonly bytesRaw32: string;
}

export interface FreshMcpTypeArenaSemanticBinding {
  readonly generationId: string;
  readonly generationHash: string;
  readonly factsRoot: string;
  readonly factsPath: string;
  readonly queryMatchCount: number;
  readonly evidenceDeclarationCount: number;
}

export interface FreshMcpTypeArenaExecutionReport {
  readonly schema: typeof CHENG_FUSION_FRESH_MCP_TYPE_ARENA_EXECUTION_SCHEMA;
  readonly status: "PASS" | "HARD_RED";
  readonly red_count: 0 | 1;
  readonly reason: string;
  readonly projectRoot: string;
  readonly entrySource: string;
  readonly querySource: string;
  readonly outputDir: string;
  readonly target: string;
  readonly symbol: string;
  readonly guardLimitBytes: number;
  readonly guardMonitorPid: number;
  readonly officialDriver: {
    readonly path: string;
    readonly byteLength: number;
    readonly bytesRaw32: string;
  } | null;
  readonly sourceFiles: {
    readonly entrySource: FreshMcpTypeArenaFilePin;
    readonly querySource: FreshMcpTypeArenaFilePin;
  } | null;
  readonly generationArtifacts: {
    readonly facts: FreshMcpTypeArenaFilePin;
    readonly manifest: FreshMcpTypeArenaFilePin;
  } | null;
  readonly runtimeIdentity: ChengFusionMcpRuntimeIdentity | null;
  readonly steps: readonly FreshMcpTypeArenaStep[];
  readonly semantic: FreshMcpTypeArenaSemanticBinding | null;
  readonly semanticRaw32: string;
  readonly executionRaw32: string;
  readonly receiptRaw32: string;
}

interface RawResponse {
  readonly value: Record<string, unknown>;
  readonly raw: Buffer;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}_object_required`);
  }
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label}_keys_invalid`);
  }
}

function sameStat(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function stableFile(pathRaw: string, label: string): StableFile {
  const path = resolve(pathRaw);
  const before = lstatSync(path, { bigint: true });
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1n ||
    before.size <= 0n ||
    before.size > BigInt(Number.MAX_SAFE_INTEGER) ||
    realpathSync.native(path) !== path
  ) {
    throw new Error(`${label}_identity_invalid`);
  }
  const raw = readFileSync(path);
  const after = lstatSync(path, { bigint: true });
  if (!sameStat(before, after) || raw.length !== Number(before.size)) {
    throw new Error(`${label}_drift`);
  }
  return Object.freeze({ path, raw, raw32: sha256(raw), stat: after });
}

function stableArtifact(
  pathRaw: string,
  label: string,
): FreshMcpTypeArenaFilePin {
  const path = resolve(pathRaw);
  const before = lstatSync(path, { bigint: true });
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink <= 0n ||
    before.size <= 0n ||
    before.size > BigInt(Number.MAX_SAFE_INTEGER) ||
    realpathSync.native(path) !== path
  ) {
    throw new Error(`${label}_identity_invalid`);
  }
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  const hash = createHash("sha256");
  let byteLength = 0;
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!sameStat(before, opened)) {
      throw new Error(`${label}_open_identity_drift`);
    }
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      byteLength += count;
    }
  } finally {
    closeSync(fd);
  }
  const after = lstatSync(path, { bigint: true });
  if (
    !sameStat(before, after) ||
    byteLength !== Number(before.size)
  ) {
    throw new Error(`${label}_drift`);
  }
  return Object.freeze({
    path,
    device: before.dev.toString(),
    inode: before.ino.toString(),
    mode: before.mode.toString(),
    linkCount: before.nlink.toString(),
    byteLength,
    mtimeNs: before.mtimeNs.toString(),
    ctimeNs: before.ctimeNs.toString(),
    bytesRaw32: hash.digest("hex"),
  });
}

function sameArtifact(
  left: FreshMcpTypeArenaFilePin,
  right: FreshMcpTypeArenaFilePin,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function verifyArtifactUnchanged(
  pinned: FreshMcpTypeArenaFilePin,
  label: string,
): void {
  const current = stableArtifact(pinned.path, label);
  if (!sameArtifact(pinned, current)) {
    throw new Error(`${label}_drift`);
  }
}

function sourceFiles(): NonNullable<
  FreshMcpTypeArenaExecutionReport["sourceFiles"]
> {
  return Object.freeze({
    entrySource: stableArtifact(
      CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE,
      "fresh_type_arena_entry_source",
    ),
    querySource: stableArtifact(
      CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
      "fresh_type_arena_query_source",
    ),
  });
}

function verifySourceFilesUnchanged(
  pinned: NonNullable<FreshMcpTypeArenaExecutionReport["sourceFiles"]>,
  phase: string,
): void {
  verifyArtifactUnchanged(
    pinned.entrySource,
    `fresh_type_arena_${phase}_entry_source`,
  );
  verifyArtifactUnchanged(
    pinned.querySource,
    `fresh_type_arena_${phase}_query_source`,
  );
}

function sameFile(left: StableFile, right: StableFile): boolean {
  return (
    left.path === right.path &&
    left.raw32 === right.raw32 &&
    left.raw.equals(right.raw) &&
    sameStat(left.stat, right.stat)
  );
}

function expectedInputs(): readonly Record<string, unknown>[] {
  return Object.freeze([
    Object.freeze({
      root: CHENG_CURRENT_ROOT,
      source: CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
      entrySource: CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE,
      outDir: CHENG_FUSION_TYPE_ARENA_OUTPUT_DIR,
      target: CHENG_FUSION_TYPE_ARENA_TARGET,
    }),
    Object.freeze({
      kind: "symbol",
      root: CHENG_CURRENT_ROOT,
      file: CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
      entrySource: CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE,
      name: CHENG_FUSION_TYPE_ARENA_SYMBOL,
      limit: 256,
    }),
    Object.freeze({
      root: CHENG_CURRENT_ROOT,
      file: CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
      symbol: CHENG_FUSION_TYPE_ARENA_SYMBOL,
      limit: 256,
    }),
  ]);
}

function inputRaw32(
  index: number,
  input: Record<string, unknown>,
  sources: NonNullable<FreshMcpTypeArenaExecutionReport["sourceFiles"]>,
  generation: FreshMcpTypeArenaExecutionReport["generationArtifacts"],
): string {
  if (index === 0) {
    return sha256(canonicalJson({ arguments: input, sourceFiles: sources }));
  }
  if (generation === null) {
    throw new Error("fresh_type_arena_generation_artifacts_required");
  }
  return sha256(
    canonicalJson({
      arguments: input,
      sourceFiles: sources,
      generationArtifacts: generation,
    }),
  );
}

function hardRed(reason: string): FreshMcpTypeArenaExecutionReport {
  return Object.freeze({
    schema: CHENG_FUSION_FRESH_MCP_TYPE_ARENA_EXECUTION_SCHEMA,
    status: "HARD_RED",
    red_count: 1,
    reason,
    projectRoot: "",
    entrySource: "",
    querySource: "",
    outputDir: "",
    target: "",
    symbol: "",
    guardLimitBytes: 0,
    guardMonitorPid: 0,
    officialDriver: null,
    sourceFiles: null,
    generationArtifacts: null,
    runtimeIdentity: null,
    steps: Object.freeze([]),
    semantic: null,
    semanticRaw32: "",
    executionRaw32: "",
    receiptRaw32: "",
  });
}

function validateOfficialPin(
  value: unknown,
  requireCurrentArtifacts: boolean,
): asserts value is NonNullable<
  FreshMcpTypeArenaExecutionReport["officialDriver"]
> {
  exactKeys(
    value,
    ["path", "byteLength", "bytesRaw32"],
    "fresh_type_arena_official_driver",
  );
  if (
    value.path !== CHENG_CURRENT_OFFICIAL_DRIVER ||
    !Number.isSafeInteger(value.byteLength) ||
    Number(value.byteLength) <= 0 ||
    typeof value.bytesRaw32 !== "string" ||
    !HASH.test(value.bytesRaw32)
  ) {
    throw new Error("fresh_type_arena_official_driver_pin_invalid");
  }
  if (requireCurrentArtifacts) {
    const actual = stableFile(
      value.path,
      "fresh_type_arena_official_driver",
    );
    if (
      actual.raw.length !== value.byteLength ||
      actual.raw32 !== value.bytesRaw32 ||
      (Number(actual.stat.mode) & 0o111) === 0
    ) {
      throw new Error("fresh_type_arena_official_driver_pin_drift");
    }
  }
}

function validateFilePin(
  value: unknown,
  expectedPath: string,
  label: string,
  requireCurrentArtifact: boolean,
): asserts value is FreshMcpTypeArenaFilePin {
  exactKeys(
    value,
    [
      "path",
      "device",
      "inode",
      "mode",
      "linkCount",
      "byteLength",
      "mtimeNs",
      "ctimeNs",
      "bytesRaw32",
    ],
    label,
  );
  if (
    value.path !== expectedPath ||
    value.path !== resolve(value.path) ||
    typeof value.device !== "string" ||
    !/^(0|[1-9][0-9]*)$/.test(value.device) ||
    typeof value.inode !== "string" ||
    !/^[1-9][0-9]*$/.test(value.inode) ||
    typeof value.mode !== "string" ||
    !/^[1-9][0-9]*$/.test(value.mode) ||
    typeof value.linkCount !== "string" ||
    !/^[1-9][0-9]*$/.test(value.linkCount) ||
    !Number.isSafeInteger(value.byteLength) ||
    Number(value.byteLength) <= 0 ||
    typeof value.mtimeNs !== "string" ||
    !/^[1-9][0-9]*$/.test(value.mtimeNs) ||
    typeof value.ctimeNs !== "string" ||
    !/^[1-9][0-9]*$/.test(value.ctimeNs) ||
    typeof value.bytesRaw32 !== "string" ||
    !HASH.test(value.bytesRaw32)
  ) {
    throw new Error(`${label}_invalid`);
  }
  if (
    requireCurrentArtifact &&
    !sameArtifact(value, stableArtifact(expectedPath, label))
  ) {
    throw new Error(`${label}_drift`);
  }
}

function validateSourceFiles(
  value: unknown,
  requireCurrentArtifacts: boolean,
): asserts value is NonNullable<
  FreshMcpTypeArenaExecutionReport["sourceFiles"]
> {
  exactKeys(
    value,
    ["entrySource", "querySource"],
    "fresh_type_arena_source_files",
  );
  validateFilePin(
    value.entrySource,
    CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE,
    "fresh_type_arena_entry_source_pin",
    requireCurrentArtifacts,
  );
  validateFilePin(
    value.querySource,
    CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
    "fresh_type_arena_query_source_pin",
    requireCurrentArtifacts,
  );
}

function validateSemantic(
  value: unknown,
): asserts value is FreshMcpTypeArenaSemanticBinding {
  exactKeys(
    value,
    [
      "generationId",
      "generationHash",
      "factsRoot",
      "factsPath",
      "queryMatchCount",
      "evidenceDeclarationCount",
    ],
    "fresh_type_arena_semantic",
  );
  if (
    typeof value.generationId !== "string" ||
    !GENERATION_ID.test(value.generationId) ||
    typeof value.generationHash !== "string" ||
    !HASH_PREFIXED.test(value.generationHash) ||
    value.generationId !== value.generationHash.replace(":", "-") ||
    typeof value.factsRoot !== "string" ||
    !HASH_PREFIXED.test(value.factsRoot) ||
    typeof value.factsPath !== "string" ||
    value.factsPath !== resolve(value.factsPath) ||
    relative(CHENG_CURRENT_ROOT, value.factsPath).startsWith("..") ||
    value.queryMatchCount !== 1 ||
    value.evidenceDeclarationCount !== 1
  ) {
    throw new Error("fresh_type_arena_semantic_invalid");
  }
}

function validateGenerationArtifacts(
  value: unknown,
  semantic: FreshMcpTypeArenaSemanticBinding,
  requireCurrentArtifacts: boolean,
): asserts value is NonNullable<
  FreshMcpTypeArenaExecutionReport["generationArtifacts"]
> {
  exactKeys(
    value,
    ["facts", "manifest"],
    "fresh_type_arena_generation_artifacts",
  );
  const generationDir = join(
    CHENG_FUSION_TYPE_ARENA_OUTPUT_DIR,
    ".cheng-csg-generations",
    semantic.generationId,
  );
  const expectedFacts = join(generationDir, "current.facts");
  const expectedManifest = join(generationDir, "summary.json");
  validateFilePin(
    value.facts,
    expectedFacts,
    "fresh_type_arena_facts_pin",
    requireCurrentArtifacts,
  );
  validateFilePin(
    value.manifest,
    expectedManifest,
    "fresh_type_arena_manifest_pin",
    requireCurrentArtifacts,
  );
  if (
    (BigInt(value.facts.mode) & 0o222n) !== 0n ||
    (BigInt(value.manifest.mode) & 0o222n) !== 0n ||
    semantic.factsPath !== value.facts.path ||
    semantic.factsRoot !== `sha256:${value.facts.bytesRaw32}`
  ) {
    throw new Error("fresh_type_arena_facts_semantic_pin_drift");
  }
  if (!requireCurrentArtifacts) return;
  const raw = readFileSync(value.manifest.path);
  if (
    raw.length !== value.manifest.byteLength ||
    sha256(raw) !== value.manifest.bytesRaw32
  ) {
    throw new Error("fresh_type_arena_manifest_bytes_drift");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    throw new Error("fresh_type_arena_manifest_json_invalid");
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("fresh_type_arena_manifest_object_required");
  }
  const manifest = parsed as Record<string, unknown>;
  if (
    manifest.schema !== "cheng-cold-csg.summary" ||
    manifest.root !== CHENG_CURRENT_ROOT ||
    manifest.source !== CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE ||
    manifest.entrySource !== CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE ||
    manifest.target !== CHENG_FUSION_TYPE_ARENA_TARGET ||
    manifest.generationId !== semantic.generationId ||
    manifest.generationHash !== semantic.generationHash ||
    manifest.factsRoot !== semantic.factsRoot ||
    manifest.facts !== value.facts.path
  ) {
    throw new Error("fresh_type_arena_manifest_semantic_drift");
  }
  verifyArtifactUnchanged(
    value.manifest,
    "fresh_type_arena_manifest_after_parse",
  );
}

export function validateFreshMcpTypeArenaExecutionReport(
  value: unknown,
  options: {
    readonly requireCurrentArtifacts?: boolean;
    readonly requireCurrentRuntime?: boolean;
  } = {},
): asserts value is FreshMcpTypeArenaExecutionReport {
  exactKeys(
    value,
    [
      "schema",
      "status",
      "red_count",
      "reason",
      "projectRoot",
      "entrySource",
      "querySource",
      "outputDir",
      "target",
      "symbol",
      "guardLimitBytes",
      "guardMonitorPid",
      "officialDriver",
      "sourceFiles",
      "generationArtifacts",
      "runtimeIdentity",
      "steps",
      "semantic",
      "semanticRaw32",
      "executionRaw32",
      "receiptRaw32",
    ],
    "fresh_type_arena_execution",
  );
  if (value.schema !== CHENG_FUSION_FRESH_MCP_TYPE_ARENA_EXECUTION_SCHEMA) {
    throw new Error("fresh_type_arena_schema_invalid");
  }
  if (value.status === "HARD_RED") {
    if (
      value.red_count !== 1 ||
      typeof value.reason !== "string" ||
      value.reason.length === 0 ||
      value.projectRoot !== "" ||
      value.entrySource !== "" ||
      value.querySource !== "" ||
      value.outputDir !== "" ||
      value.target !== "" ||
      value.symbol !== "" ||
      value.guardLimitBytes !== 0 ||
      value.guardMonitorPid !== 0 ||
      value.officialDriver !== null ||
      value.sourceFiles !== null ||
      value.generationArtifacts !== null ||
      value.runtimeIdentity !== null ||
      !Array.isArray(value.steps) ||
      value.steps.length !== 0 ||
      value.semantic !== null ||
      value.semanticRaw32 !== "" ||
      value.executionRaw32 !== "" ||
      value.receiptRaw32 !== ""
    ) {
      throw new Error("fresh_type_arena_hard_red_must_not_witness");
    }
    return;
  }
  if (
    value.status !== "PASS" ||
    value.red_count !== 0 ||
    value.reason !== "" ||
    value.projectRoot !== CHENG_CURRENT_ROOT ||
    value.entrySource !== CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE ||
    value.querySource !== CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE ||
    value.outputDir !== CHENG_FUSION_TYPE_ARENA_OUTPUT_DIR ||
    value.target !== CHENG_FUSION_TYPE_ARENA_TARGET ||
    value.symbol !== CHENG_FUSION_TYPE_ARENA_SYMBOL ||
    value.guardLimitBytes !== MEMORY_LIMIT_BYTES ||
    !Number.isSafeInteger(value.guardMonitorPid) ||
    Number(value.guardMonitorPid) <= 0 ||
    !Array.isArray(value.steps) ||
    value.steps.length !== TOOL_NAMES.length ||
    typeof value.semanticRaw32 !== "string" ||
    !HASH.test(value.semanticRaw32) ||
    typeof value.executionRaw32 !== "string" ||
    !HASH.test(value.executionRaw32) ||
    typeof value.receiptRaw32 !== "string" ||
    !HASH.test(value.receiptRaw32)
  ) {
    throw new Error("fresh_type_arena_pass_header_invalid");
  }
  validateOfficialPin(
    value.officialDriver,
    options.requireCurrentArtifacts !== false,
  );
  validateSourceFiles(
    value.sourceFiles,
    options.requireCurrentArtifacts !== false,
  );
  validateSemantic(value.semantic);
  validateGenerationArtifacts(
    value.generationArtifacts,
    value.semantic,
    options.requireCurrentArtifacts !== false,
  );
  const runtime = validateChengFusionMcpRuntimeIdentity(
    value.runtimeIdentity,
    { requireCurrentSources: options.requireCurrentRuntime !== false },
  );
  const inputs = expectedInputs();
  const outputHashes = new Set<string>();
  const responseHashes = new Set<string>();
  const steps = value.steps as unknown[];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    exactKeys(
      step,
      [
        "ordinal",
        "requestId",
        "toolName",
        "inputRaw32",
        "outputByteLength",
        "outputRaw32",
        "responseByteLength",
        "responseRaw32",
        "serverPid",
        "runtimeStartedUnixMs",
        "initializationNonce",
        "runtimeReceiptRaw32",
      ],
      `fresh_type_arena_step_${index}`,
    );
    if (
      step.ordinal !== index ||
      step.requestId !== REQUEST_IDS[index] ||
      step.toolName !== TOOL_NAMES[index] ||
      step.inputRaw32 !==
        inputRaw32(
          index,
          inputs[index]!,
          value.sourceFiles,
          value.generationArtifacts,
        ) ||
      !Number.isSafeInteger(step.outputByteLength) ||
      Number(step.outputByteLength) <= 0 ||
      typeof step.outputRaw32 !== "string" ||
      !HASH.test(step.outputRaw32) ||
      !Number.isSafeInteger(step.responseByteLength) ||
      Number(step.responseByteLength) <= Number(step.outputByteLength) ||
      typeof step.responseRaw32 !== "string" ||
      !HASH.test(step.responseRaw32) ||
      step.serverPid !== runtime.serverPid ||
      step.runtimeStartedUnixMs !== runtime.runtimeStartedUnixMs ||
      step.initializationNonce !== runtime.initializationNonce ||
      step.runtimeReceiptRaw32 !== runtime.receiptRaw32
    ) {
      throw new Error(`fresh_type_arena_step_${index}_binding_invalid`);
    }
    if (
      outputHashes.has(step.outputRaw32) ||
      responseHashes.has(step.responseRaw32)
    ) {
      throw new Error(`fresh_type_arena_step_${index}_response_replay`);
    }
    outputHashes.add(step.outputRaw32);
    responseHashes.add(step.responseRaw32);
  }
  if (sha256(canonicalJson(value.semantic)) !== value.semanticRaw32) {
    throw new Error("fresh_type_arena_semantic_hash_drift");
  }
  const executionPayload = {
    guardLimitBytes: value.guardLimitBytes,
    guardMonitorPid: value.guardMonitorPid,
    officialDriver: value.officialDriver,
    sourceFiles: value.sourceFiles,
    generationArtifacts: value.generationArtifacts,
    runtimeReceiptRaw32: runtime.receiptRaw32,
    steps: value.steps,
    semanticRaw32: value.semanticRaw32,
  };
  if (sha256(canonicalJson(executionPayload)) !== value.executionRaw32) {
    throw new Error("fresh_type_arena_execution_hash_drift");
  }
  const payload = { ...value };
  delete payload.receiptRaw32;
  if (sha256(canonicalJson(payload)) !== value.receiptRaw32) {
    throw new Error("fresh_type_arena_receipt_self_hash_drift");
  }
}

function createMcpSession(
  proofFd: number,
  timeoutMs: number,
): {
  readonly child: ChildProcessWithoutNullStreams;
  readonly request: (
    id: number,
    method: string,
    params: Record<string, unknown>,
  ) => Promise<RawResponse>;
  readonly close: () => Promise<void>;
  readonly abort: () => Promise<void>;
} {
  const child = spawn(process.execPath, [MCP_ENTRY], {
    cwd: FUSION_ROOT,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe", proofFd],
  }) as ChildProcessWithoutNullStreams;
  if (!Number.isSafeInteger(child.pid) || Number(child.pid) <= 0) {
    throw new Error("fresh_type_arena_child_pid_invalid");
  }
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let pending:
    | {
        readonly id: number;
        readonly resolve: (response: RawResponse) => void;
        readonly reject: (error: Error) => void;
        readonly timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let fatal: Error | undefined;
  let closeResult:
    | { readonly code: number | null; readonly signal: NodeJS.Signals | null }
    | undefined;
  let resolveExit:
    | ((value: {
        readonly code: number | null;
        readonly signal: NodeJS.Signals | null;
      }) => void)
    | undefined;
  const exit = new Promise<{
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }>((resolvePromise) => {
    resolveExit = resolvePromise;
  });
  const fail = (error: Error): void => {
    if (fatal !== undefined) return;
    fatal = error;
    if (pending !== undefined) {
      clearTimeout(pending.timer);
      const reject = pending.reject;
      pending = undefined;
      reject(error);
    }
  };
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = Buffer.concat([stderr, chunk]);
    if (stderr.length > MAX_PROTOCOL_BUFFER_BYTES) {
      fail(new Error("fresh_type_arena_stderr_overflow"));
      child.kill("SIGKILL");
    }
  });
  child.stdout.on("data", (chunk: Buffer) => {
    stdout = Buffer.concat([stdout, chunk]);
    if (stdout.length > MAX_PROTOCOL_BUFFER_BYTES) {
      fail(new Error("fresh_type_arena_stdout_overflow"));
      child.kill("SIGKILL");
      return;
    }
    for (;;) {
      const newline = stdout.indexOf(0x0a);
      if (newline < 0) return;
      const line = stdout.subarray(0, newline);
      stdout = stdout.subarray(newline + 1);
      if (line.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line.toString("utf8"));
      } catch {
        fail(new Error("fresh_type_arena_non_json_response"));
        child.kill("SIGKILL");
        return;
      }
      if (
        pending === undefined ||
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        (parsed as Record<string, unknown>).id !== pending.id
      ) {
        fail(new Error("fresh_type_arena_response_sequence_invalid"));
        child.kill("SIGKILL");
        return;
      }
      const active = pending;
      pending = undefined;
      clearTimeout(active.timer);
      active.resolve({
        value: parsed as Record<string, unknown>,
        raw: Buffer.concat([line, Buffer.from("\n")]),
      });
    }
  });
  child.once("error", (error) => {
    fail(error);
  });
  child.once("exit", (code, signal) => {
    closeResult = { code, signal };
    if (pending !== undefined) {
      fail(
        new Error(
          `fresh_type_arena_process_exited_mid_sequence:${code ?? "null"}:${signal ?? ""}:${stderr.toString("utf8").slice(-2000)}`,
        ),
      );
    }
    resolveExit?.({ code, signal });
  });
  const request = async (
    id: number,
    method: string,
    params: Record<string, unknown>,
  ): Promise<RawResponse> => {
    if (fatal !== undefined) throw fatal;
    if (closeResult !== undefined) {
      throw new Error("fresh_type_arena_request_after_exit");
    }
    if (pending !== undefined) {
      throw new Error("fresh_type_arena_concurrent_request_forbidden");
    }
    const response = new Promise<RawResponse>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        if (pending?.id === id) pending = undefined;
        const error = new Error(
          `fresh_type_arena_request_timeout:${method}:${stderr.toString("utf8").slice(-2000)}`,
        );
        fail(error);
        child.kill("SIGKILL");
        rejectPromise(error);
      }, timeoutMs);
      pending = {
        id,
        resolve: resolvePromise,
        reject: rejectPromise,
        timer,
      };
    });
    const accepted = child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
    );
    if (!accepted) {
      let onDrain: () => void;
      let onError: (error: Error) => void;
      const drained = new Promise<void>((resolvePromise, rejectPromise) => {
        onDrain = resolvePromise;
        onError = rejectPromise;
        child.stdin.once("drain", onDrain);
        child.stdin.once("error", onError);
      });
      try {
        await Promise.race([
          drained,
          response.then(() => undefined),
        ]);
      } finally {
        child.stdin.off("drain", onDrain!);
        child.stdin.off("error", onError!);
      }
    }
    return await response;
  };
  const close = async (): Promise<void> => {
    child.stdin.end();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, rejectPromise) => {
      timeout = setTimeout(() => {
        child.kill("SIGKILL");
        rejectPromise(new Error("fresh_type_arena_shutdown_timeout"));
      }, timeoutMs);
    });
    let result: Awaited<typeof exit>;
    try {
      result = await Promise.race([exit, timedOut]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
    if (result.code !== 0 || result.signal !== null) {
      throw new Error(
        `fresh_type_arena_shutdown_invalid:${result.code ?? "null"}:${result.signal ?? ""}:${stderr.toString("utf8").slice(-2000)}`,
      );
    }
    if (stdout.length !== 0) {
      throw new Error("fresh_type_arena_trailing_stdout");
    }
  };
  return {
    child,
    request,
    close,
    abort: async () => {
      if (closeResult === undefined) child.kill("SIGKILL");
      await exit;
    },
  };
}

function parseInitialize(
  response: RawResponse,
  expectedPid: number,
  expectedNonce: string,
  earliest: number,
  latest: number,
): ChengFusionMcpRuntimeIdentity {
  exactKeys(response.value, ["jsonrpc", "id", "result"], "fresh_type_arena_initialize_response");
  if (response.value.jsonrpc !== "2.0" || response.value.id !== 1) {
    throw new Error("fresh_type_arena_initialize_envelope_invalid");
  }
  exactKeys(
    response.value.result,
    ["protocolVersion", "capabilities", "serverInfo", "instructions"],
    "fresh_type_arena_initialize_result",
  );
  exactKeys(
    response.value.result.serverInfo,
    ["name", "version", "runtimeIdentity"],
    "fresh_type_arena_server_info",
  );
  if (
    response.value.result.serverInfo.name !== "cheng-fusion" ||
    response.value.result.serverInfo.version !== "current"
  ) {
    throw new Error("fresh_type_arena_server_identity_invalid");
  }
  return validateChengFusionMcpRuntimeIdentity(
    response.value.result.serverInfo.runtimeIdentity,
    {
      expectedServerPid: expectedPid,
      expectedInitializationNonce: expectedNonce,
      earliestRuntimeStartedUnixMs: earliest,
      latestRuntimeStartedUnixMs: latest,
    },
  );
}

function parseToolResponse(
  response: RawResponse,
  requestId: number,
  runtime: ChengFusionMcpRuntimeIdentity,
): { readonly output: Buffer; readonly parsed: Record<string, unknown> } {
  exactKeys(response.value, ["jsonrpc", "id", "result"], `fresh_type_arena_response_${requestId}`);
  if (
    response.value.jsonrpc !== "2.0" ||
    response.value.id !== requestId
  ) {
    throw new Error(`fresh_type_arena_response_${requestId}_envelope_invalid`);
  }
  const result = response.value.result;
  if (result === null || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`fresh_type_arena_response_${requestId}_result_invalid`);
  }
  const resultRecord = result as Record<string, unknown>;
  if (resultRecord.isError === true) {
    const text = Array.isArray(resultRecord.content)
      ? String(
          (resultRecord.content[0] as Record<string, unknown> | undefined)
            ?.text ?? "",
        )
      : "";
    throw new Error(`fresh_type_arena_tool_red:${requestId}:${text}`);
  }
  exactKeys(resultRecord, ["content", "_meta"], `fresh_type_arena_result_${requestId}`);
  exactKeys(
    resultRecord._meta,
    ["chengFusionRuntimeIdentity"],
    `fresh_type_arena_meta_${requestId}`,
  );
  const responseRuntime = validateChengFusionMcpRuntimeIdentity(
    resultRecord._meta.chengFusionRuntimeIdentity,
    { requireCurrentSources: false },
  );
  if (canonicalJson(responseRuntime) !== canonicalJson(runtime)) {
    throw new Error(`fresh_type_arena_response_${requestId}_runtime_drift`);
  }
  if (
    !Array.isArray(resultRecord.content) ||
    resultRecord.content.length !== 1
  ) {
    throw new Error(`fresh_type_arena_response_${requestId}_content_invalid`);
  }
  const content = resultRecord.content[0];
  exactKeys(content, ["type", "text"], `fresh_type_arena_content_${requestId}`);
  if (content.type !== "text" || typeof content.text !== "string") {
    throw new Error(`fresh_type_arena_response_${requestId}_text_invalid`);
  }
  const output = Buffer.from(content.text, "utf8");
  if (output.length === 0 || output.length > MAX_PROTOCOL_BUFFER_BYTES) {
    throw new Error(`fresh_type_arena_response_${requestId}_output_invalid`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.text);
  } catch {
    throw new Error(`fresh_type_arena_response_${requestId}_output_json_invalid`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`fresh_type_arena_response_${requestId}_output_object_required`);
  }
  return { output, parsed: parsed as Record<string, unknown> };
}

function validateRoundtripOutput(
  value: Record<string, unknown>,
): FreshMcpTypeArenaSemanticBinding {
  if (
    value.success !== true ||
    value.root !== CHENG_CURRENT_ROOT ||
    value.source !== CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE ||
    value.entrySource !== CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE ||
    value.writerExitCode !== 0 ||
    value.readerExitCode !== 0 ||
    value.writerProcessOk !== true ||
    value.readerProcessOk !== true ||
    typeof value.generationId !== "string" ||
    !GENERATION_ID.test(value.generationId) ||
    typeof value.generationHash !== "string" ||
    !HASH_PREFIXED.test(value.generationHash) ||
    value.generationId !== value.generationHash.replace(":", "-") ||
    typeof value.factsRootAfter !== "string" ||
    !HASH_PREFIXED.test(value.factsRootAfter) ||
    typeof value.facts !== "string" ||
    value.facts !== resolve(value.facts) ||
    relative(CHENG_CURRENT_ROOT, value.facts).startsWith("..")
  ) {
    throw new Error("fresh_type_arena_roundtrip_semantic_invalid");
  }
  const summary = value.summary;
  if (
    summary === null ||
    typeof summary !== "object" ||
    Array.isArray(summary) ||
    (summary as Record<string, unknown>).schema !==
      "cheng-cold-csg.summary" ||
    (summary as Record<string, unknown>).generationId !== value.generationId ||
    (summary as Record<string, unknown>).generationHash !==
      value.generationHash ||
    (summary as Record<string, unknown>).factsRoot !== value.factsRootAfter
  ) {
    throw new Error("fresh_type_arena_roundtrip_summary_invalid");
  }
  const driverIdentity = value.driverIdentity;
  if (
    driverIdentity === null ||
    typeof driverIdentity !== "object" ||
    Array.isArray(driverIdentity) ||
    (driverIdentity as Record<string, unknown>).driverRole !== "official"
  ) {
    throw new Error("fresh_type_arena_roundtrip_driver_not_official");
  }
  return {
    generationId: value.generationId,
    generationHash: value.generationHash,
    factsRoot: value.factsRootAfter,
    factsPath: value.facts,
    queryMatchCount: 0,
    evidenceDeclarationCount: 0,
  };
}

function pinGenerationArtifacts(
  semantic: FreshMcpTypeArenaSemanticBinding,
): NonNullable<
  FreshMcpTypeArenaExecutionReport["generationArtifacts"]
> {
  const generationDir = join(
    CHENG_FUSION_TYPE_ARENA_OUTPUT_DIR,
    ".cheng-csg-generations",
    semantic.generationId,
  );
  const factsPath = join(generationDir, "current.facts");
  if (semantic.factsPath !== factsPath) {
    throw new Error("fresh_type_arena_roundtrip_facts_path_invalid");
  }
  const generation = Object.freeze({
    facts: stableArtifact(
      factsPath,
      "fresh_type_arena_roundtrip_facts",
    ),
    manifest: stableArtifact(
      join(generationDir, "summary.json"),
      "fresh_type_arena_roundtrip_manifest",
    ),
  });
  validateGenerationArtifacts(generation, semantic, true);
  return generation;
}

function verifyGenerationArtifactsUnchanged(
  pinned: NonNullable<
    FreshMcpTypeArenaExecutionReport["generationArtifacts"]
  >,
  phase: string,
): void {
  verifyArtifactUnchanged(
    pinned.facts,
    `fresh_type_arena_${phase}_facts`,
  );
  verifyArtifactUnchanged(
    pinned.manifest,
    `fresh_type_arena_${phase}_manifest`,
  );
}

export function validateFreshMcpTypeArenaSemanticOutputs(
  base: FreshMcpTypeArenaSemanticBinding,
  query: Record<string, unknown>,
  evidence: Record<string, unknown>,
): FreshMcpTypeArenaSemanticBinding {
  exactKeys(
    query,
    [
      "query",
      "root",
      "factsPath",
      "factsRoot",
      "factsSource",
      "factsEntrySource",
      "name",
      "matches",
    ],
    "fresh_type_arena_query_output",
  );
  if (
    query.query !== "symbol" ||
    query.root !== CHENG_CURRENT_ROOT ||
    query.factsPath !== base.factsPath ||
    query.factsSource !==
      CHENG_FUSION_TYPE_ARENA_QUERY_SUBSTRATE_PATH ||
    query.factsEntrySource !==
      CHENG_FUSION_TYPE_ARENA_ENTRY_SUBSTRATE_PATH ||
    query.factsRoot !== base.factsRoot ||
    query.name !== CHENG_FUSION_TYPE_ARENA_SYMBOL ||
    !Array.isArray(query.matches) ||
    query.matches.length !== 1
  ) {
    throw new Error("fresh_type_arena_query_semantic_invalid");
  }
  const matchingDeclarations = query.matches as unknown[];
  for (let index = 0; index < matchingDeclarations.length; index += 1) {
    const row = matchingDeclarations[index];
    exactKeys(
      row,
      ["id", "name", "kind", "symbolKind", "exported", "loc"],
      `fresh_type_arena_query_declaration_${index}`,
    );
    exactKeys(
      row.loc,
      ["file", "recordLine"],
      `fresh_type_arena_query_declaration_${index}_loc`,
    );
    if (
      typeof row.id !== "string" ||
      !/^cold:data:[0-9]+$/.test(row.id) ||
      row.name !== CHENG_FUSION_TYPE_ARENA_SYMBOL ||
      row.kind !== "csg.symbol" ||
      row.symbolKind !== "data" ||
      row.exported !== true ||
      row.loc.file !==
        CHENG_FUSION_TYPE_ARENA_QUERY_SUBSTRATE_PATH ||
      !Number.isSafeInteger(row.loc.recordLine) ||
      Number(row.loc.recordLine) <= 0
    ) {
      throw new Error("fresh_type_arena_query_exact_declaration_invalid");
    }
  }
  exactKeys(
    evidence,
    [
      "root",
      "factsPath",
      "factsRoot",
      "factsSource",
      "factsEntrySource",
      "symbol",
    ],
    "fresh_type_arena_evidence_output",
  );
  if (
    evidence.root !== CHENG_CURRENT_ROOT ||
    evidence.factsPath !== base.factsPath ||
    evidence.factsSource !==
      CHENG_FUSION_TYPE_ARENA_QUERY_SUBSTRATE_PATH ||
    evidence.factsEntrySource !==
      CHENG_FUSION_TYPE_ARENA_ENTRY_SUBSTRATE_PATH ||
    evidence.factsRoot !== base.factsRoot ||
    Object.hasOwn(evidence, "staleWarning") ||
    evidence.symbol === null ||
    typeof evidence.symbol !== "object" ||
    Array.isArray(evidence.symbol)
  ) {
    throw new Error("fresh_type_arena_evidence_semantic_invalid");
  }
  const symbol = evidence.symbol as Record<string, unknown>;
  exactKeys(
    symbol,
    [
      "name",
      "declarationCount",
      "declarationFiles",
      "impactRadius",
      "crossModuleCallers",
      "crossModuleCallerFiles",
      "factsRoot",
    ],
    "fresh_type_arena_evidence_symbol",
  );
  exactKeys(
    symbol.impactRadius,
    ["inBoundCallers", "outBoundCallees"],
    "fresh_type_arena_evidence_impact_radius",
  );
  if (
    symbol.name !== CHENG_FUSION_TYPE_ARENA_SYMBOL ||
    symbol.declarationCount !== 1 ||
    symbol.declarationCount !== matchingDeclarations.length ||
    !Array.isArray(symbol.declarationFiles) ||
    symbol.declarationFiles.length !== 1 ||
    symbol.declarationFiles[0] !==
      CHENG_FUSION_TYPE_ARENA_QUERY_SUBSTRATE_PATH ||
    !Number.isSafeInteger(symbol.impactRadius.inBoundCallers) ||
    Number(symbol.impactRadius.inBoundCallers) < 0 ||
    symbol.impactRadius.outBoundCallees !== null ||
    !Number.isSafeInteger(symbol.crossModuleCallers) ||
    Number(symbol.crossModuleCallers) < 0 ||
    !Array.isArray(symbol.crossModuleCallerFiles) ||
    symbol.crossModuleCallerFiles.some(
      (path) => typeof path !== "string" || path.length === 0,
    ) ||
    new Set(symbol.crossModuleCallerFiles).size !==
      symbol.crossModuleCallerFiles.length ||
    symbol.factsRoot !== base.factsRoot
  ) {
    throw new Error("fresh_type_arena_evidence_declaration_missing");
  }
  return Object.freeze({
    ...base,
    queryMatchCount: matchingDeclarations.length,
    evidenceDeclarationCount: Number(symbol.declarationCount),
  });
}

export async function runFreshMcpTypeArenaExecution(
  timeoutMs = 10 * 60 * 1000,
): Promise<FreshMcpTypeArenaExecutionReport> {
  let session:
    | ReturnType<typeof createMcpSession>
    | undefined;
  try {
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > 10 * 60 * 1000
    ) {
      throw new Error("fresh_type_arena_timeout_invalid");
    }
    const inheritedProof = verifyInheritedParentGuardForChild();
    if (
      inheritedProof === null ||
      inheritedProof.limitBytes !== MEMORY_LIMIT_BYTES
    ) {
      throw new Error("fresh_type_arena_exact_parent_guard_required");
    }
    const official = stableFile(
      CHENG_CURRENT_OFFICIAL_DRIVER,
      "fresh_type_arena_official_driver",
    );
    if ((Number(official.stat.mode) & 0o111) === 0) {
      throw new Error("fresh_type_arena_official_driver_not_executable");
    }
    const pinnedSources = sourceFiles();
    const nonce = randomBytes(32).toString("hex");
    const launchStartedUnixMs = Date.now();
    session = createMcpSession(inheritedProof.proofFd, timeoutMs);
    const initialized = await session.request(1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: {
        name: "cheng-fusion-fresh-type-arena-execution",
        version: "current",
      },
      _meta: { chengFusionRuntimeNonce: nonce },
    });
    const initializedUnixMs = Date.now();
    const runtime = parseInitialize(
      initialized,
      Number(session.child.pid),
      nonce,
      launchStartedUnixMs,
      initializedUnixMs,
    );
    const inputs = expectedInputs();
    const parsedOutputs: Record<string, unknown>[] = [];
    const steps: FreshMcpTypeArenaStep[] = [];
    let baseSemantic: FreshMcpTypeArenaSemanticBinding | undefined;
    let generationArtifacts:
      | NonNullable<
          FreshMcpTypeArenaExecutionReport["generationArtifacts"]
        >
      | null = null;
    for (let index = 0; index < TOOL_NAMES.length; index += 1) {
      const requestId = REQUEST_IDS[index]!;
      const toolName = TOOL_NAMES[index]!;
      const input = inputs[index]!;
      verifySourceFilesUnchanged(pinnedSources, `before_step_${index}`);
      if (generationArtifacts !== null) {
        verifyGenerationArtifactsUnchanged(
          generationArtifacts,
          `before_step_${index}`,
        );
      } else if (index !== 0) {
        throw new Error(
          `fresh_type_arena_step_${index}_generation_artifacts_missing`,
        );
      }
      const response = await session.request(requestId, "tools/call", {
        name: toolName,
        arguments: input,
      });
      const parsed = parseToolResponse(response, requestId, runtime);
      parsedOutputs.push(parsed.parsed);
      verifySourceFilesUnchanged(pinnedSources, `after_step_${index}`);
      if (index === 0) {
        baseSemantic = validateRoundtripOutput(parsed.parsed);
        generationArtifacts = pinGenerationArtifacts(baseSemantic);
      }
      if (generationArtifacts === null) {
        throw new Error(
          `fresh_type_arena_step_${index}_generation_artifacts_missing`,
        );
      }
      verifyGenerationArtifactsUnchanged(
        generationArtifacts,
        `after_step_${index}`,
      );
      steps.push(
        Object.freeze({
          ordinal: index as 0 | 1 | 2,
          requestId,
          toolName,
          inputRaw32: inputRaw32(
            index,
            input,
            pinnedSources,
            generationArtifacts,
          ),
          outputByteLength: parsed.output.length,
          outputRaw32: sha256(parsed.output),
          responseByteLength: response.raw.length,
          responseRaw32: sha256(response.raw),
          serverPid: runtime.serverPid,
          runtimeStartedUnixMs: runtime.runtimeStartedUnixMs,
          initializationNonce: runtime.initializationNonce,
          runtimeReceiptRaw32: runtime.receiptRaw32,
        }),
      );
    }
    if (baseSemantic === undefined || generationArtifacts === null) {
      throw new Error("fresh_type_arena_generation_not_observed");
    }
    const semantic = validateFreshMcpTypeArenaSemanticOutputs(
      baseSemantic,
      parsedOutputs[1]!,
      parsedOutputs[2]!,
    );
    await session.close();
    session = undefined;
    verifySourceFilesUnchanged(pinnedSources, "final");
    verifyGenerationArtifactsUnchanged(generationArtifacts, "final");
    const finalOfficial = stableFile(
      CHENG_CURRENT_OFFICIAL_DRIVER,
      "fresh_type_arena_official_driver_final",
    );
    if (!sameFile(official, finalOfficial)) {
      throw new Error("fresh_type_arena_official_driver_drift");
    }
    validateChengFusionMcpRuntimeIdentity(runtime);
    const officialDriver = Object.freeze({
      path: official.path,
      byteLength: official.raw.length,
      bytesRaw32: official.raw32,
    });
    const semanticRaw32 = sha256(canonicalJson(semantic));
    const executionPayload = {
      guardLimitBytes: inheritedProof.limitBytes,
      guardMonitorPid: inheritedProof.monitorPid,
      officialDriver,
      sourceFiles: pinnedSources,
      generationArtifacts,
      runtimeReceiptRaw32: runtime.receiptRaw32,
      steps,
      semanticRaw32,
    };
    const payload = {
      schema: CHENG_FUSION_FRESH_MCP_TYPE_ARENA_EXECUTION_SCHEMA,
      status: "PASS" as const,
      red_count: 0 as const,
      reason: "",
      projectRoot: CHENG_CURRENT_ROOT,
      entrySource: CHENG_FUSION_TYPE_ARENA_ENTRY_SOURCE,
      querySource: CHENG_FUSION_TYPE_ARENA_QUERY_SOURCE,
      outputDir: CHENG_FUSION_TYPE_ARENA_OUTPUT_DIR,
      target: CHENG_FUSION_TYPE_ARENA_TARGET,
      symbol: CHENG_FUSION_TYPE_ARENA_SYMBOL,
      guardLimitBytes: inheritedProof.limitBytes,
      guardMonitorPid: inheritedProof.monitorPid,
      officialDriver,
      sourceFiles: pinnedSources,
      generationArtifacts,
      runtimeIdentity: runtime,
      steps: Object.freeze(steps),
      semantic,
      semanticRaw32,
      executionRaw32: sha256(canonicalJson(executionPayload)),
    };
    const report = Object.freeze({
      ...payload,
      receiptRaw32: sha256(canonicalJson(payload)),
    });
    validateFreshMcpTypeArenaExecutionReport(report);
    return report;
  } catch (error) {
    let reason = error instanceof Error ? error.message : String(error);
    if (session !== undefined) {
      try {
        await session.abort();
      } catch (abortError) {
        reason = `fresh_type_arena_abort_failed:${
          abortError instanceof Error
            ? abortError.message
            : String(abortError)
        };caused_by:${reason}`;
      }
    }
    const report = hardRed(
      reason,
    );
    validateFreshMcpTypeArenaExecutionReport(report);
    return report;
  }
}

export function serializeFreshMcpTypeArenaExecutionReport(
  report: FreshMcpTypeArenaExecutionReport,
): string {
  validateFreshMcpTypeArenaExecutionReport(report, {
    requireCurrentArtifacts: report.status === "PASS",
    requireCurrentRuntime: report.status === "PASS",
  });
  return `${canonicalJson(report)}\n`;
}
